import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  PrivilegedActionNativeRequest,
  PrivilegedCredentialPromptResolution,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import {
  capabilityBuilderValidateText,
  type CapabilityBuilderValidateInput,
  type CapabilityBuilderValidateResult,
} from "./capability-builder/capabilityBuilder";
import { privilegedActionToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  buildPrivilegedActionNativeRequest,
  planPrivilegedAction,
  privilegedActionResultFromNativeResult,
  privilegedActionResultText,
  withPrivilegedActionLogPath,
} from "./privilegedAction";
import type { PrivilegedActionAdapter } from "./privilegedActionAdapter";
import { writePrivilegedActionRedactedLog as defaultWritePrivilegedActionRedactedLog } from "./privilegedActionLogs";

type PrivilegedActionRequestToolUpdate = AgentToolResult<Record<string, unknown>>;
type PrivilegedActionRequestToolUpdateHandler = (update: PrivilegedActionRequestToolUpdate) => void;

export interface PrivilegedActionRequestToolPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface PrivilegedActionRequestToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  privilegedActionAdapter: () => PrivilegedActionAdapter;
  resolveFirstPartyPluginPermission: (input: PrivilegedActionRequestToolPermissionRequest) => Promise<boolean>;
  requestPrivilegedCredential?: (input: PrivilegedActionNativeRequest) => Promise<PrivilegedCredentialPromptResolution>;
  writePrivilegedActionRedactedLog?: typeof defaultWritePrivilegedActionRedactedLog;
  runCapabilityBuilderValidationWithPermission?: (input: {
    thread: ThreadSummary;
    workspace: WorkspaceState;
    input: CapabilityBuilderValidateInput;
    onUpdate?: PrivilegedActionRequestToolUpdateHandler;
    reason?: "privileged-action-succeeded";
  }) => Promise<CapabilityBuilderValidateResult>;
}

export function registerPrivilegedActionRequestTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PrivilegedActionRequestToolRegistrationOptions,
): void {
  const writePrivilegedActionRedactedLog = options.writePrivilegedActionRedactedLog ?? defaultWritePrivilegedActionRedactedLog;

  registerDesktopTool(pi, privilegedActionToolDescriptor("ambient_privileged_action_request"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate) => {
      const thread = options.getThread(options.threadId);
      if (thread.collaborationMode === "planner") throw new Error("Privileged action handoff is blocked in Planner Mode.");
      const plan = planPrivilegedAction(params);
      const privilegedAdapter = options.privilegedActionAdapter();
      const adapterStatus = privilegedAdapter.status();
      const nativeRequest = buildPrivilegedActionNativeRequest(plan, {
        workspacePath: options.workspace.path,
        threadId: thread.id,
        adapterReadiness: {
          execution: adapterStatus.execution,
          adapterStatus: adapterStatus.adapterStatus,
          actionCategory: plan.template.purpose,
          executablePolicy: "template-reviewed-no-shell",
          futureAdapters: ["macos-authorized-helper", "linux-polkit-helper", "windows-elevated-helper"],
        },
      });
      const detail = nativeRequest.uiPrompt.detail;
      const input = params && typeof params === "object" ? params as Record<string, unknown> : {};
      const rehearseCredentialPrompt = input.rehearseCredentialPrompt === true;
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_privileged_action_request",
        title: nativeRequest.uiPrompt.title,
        message: nativeRequest.uiPrompt.message,
        detail,
        risk: "privileged-action",
        reusableScopes: [],
        grantTargetLabel: `Privileged action ${plan.template.purpose}`,
        grantTargetIdentity: [
          "ambient_privileged_action_request",
          plan.template.purpose,
          plan.template.packageName ?? "",
          plan.template.platform ?? "any",
          plan.redactedCommands.map((command) => [command.exe, ...command.args].join("\0")).join("\0"),
        ].join("\0"),
        allowedReason: "Ambient privileged action handoff approved by Ambient permission grant policy.",
        deniedReason: "Ambient privileged action handoff prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Ambient privileged action handoff blocked by approval prompt.");
      let credentialCapture: "not-requested" | "rehearsed-and-discarded" | "captured-and-discarded" | "denied" | "unavailable" = "not-requested";
      let ephemeralCredential: string | undefined;
      if (rehearseCredentialPrompt) {
        if (!plan.template.credential) {
          credentialCapture = "unavailable";
        } else if (!options.requestPrivilegedCredential) {
          credentialCapture = "unavailable";
        } else {
          onUpdate?.({
            content: [{ type: "text", text: "Requesting an ephemeral privileged credential for dry-run rehearsal. No command will run and the credential will be discarded." }],
            details: {
              runtime: "privileged-action",
              toolName: "ambient_privileged_action_request",
              status: "credential-rehearsal",
              adapter: "dry-run",
              requestId: nativeRequest.requestId,
            },
          });
          const credential = await options.requestPrivilegedCredential(nativeRequest);
          credentialCapture = credential.allowed ? "rehearsed-and-discarded" : "denied";
        }
      } else if (plan.template.credential && adapterStatus.selectedAdapterExecutesPrivilegedCommands) {
        if (!options.requestPrivilegedCredential) {
          credentialCapture = "unavailable";
        } else {
          onUpdate?.({
            content: [{ type: "text", text: `Requesting an ephemeral privileged credential for ${privilegedAdapter.name}. Pi will not see it and Ambient will discard it after this action.` }],
            details: {
              runtime: "privileged-action",
              toolName: "ambient_privileged_action_request",
              status: "credential-requested",
              adapter: privilegedAdapter.name,
              requestId: nativeRequest.requestId,
            },
          });
          const credential = await options.requestPrivilegedCredential(nativeRequest);
          if (credential.allowed && credential.credential) {
            credentialCapture = "captured-and-discarded";
            ephemeralCredential = credential.credential;
          } else {
            credentialCapture = "denied";
          }
        }
      }
      onUpdate?.({
        content: [{ type: "text", text: adapterStatus.selectedAdapterExecutesPrivilegedCommands ? `Running approved privileged action through ${privilegedAdapter.name}.` : `Recording privileged action handoff for Ambient review with ${privilegedAdapter.name}. No privileged command will run unless a native adapter reports successful execution.` }],
        details: {
          runtime: "privileged-action",
          toolName: "ambient_privileged_action_request",
          status: "running",
          adapter: privilegedAdapter.name,
          commandCount: plan.commandCount,
          warnings: plan.warnings,
        },
      });
      let adapterResult: Awaited<ReturnType<PrivilegedActionAdapter["execute"]>>;
      try {
        adapterResult = await privilegedAdapter.execute({ request: nativeRequest, credential: ephemeralCredential, credentialCapture });
      } finally {
        ephemeralCredential = undefined;
      }
      const nativeResult = withPrivilegedActionLogPath(
        adapterResult,
        adapterResult.logPath ?? await writePrivilegedActionRedactedLog(options.workspace.path, adapterResult),
      );
      const result = privilegedActionResultFromNativeResult(plan, nativeResult);
      const resumeAction = result.nativeResult.continuation.resumeAction;
      let autoValidation: CapabilityBuilderValidateResult | undefined;
      let autoValidationError: string | undefined;
      if (result.status === "succeeded" && resumeAction && options.runCapabilityBuilderValidationWithPermission) {
        try {
          autoValidation = await options.runCapabilityBuilderValidationWithPermission({
            thread,
            workspace: options.workspace,
            input: resumeAction.input,
            onUpdate,
            reason: "privileged-action-succeeded",
          });
        } catch (error) {
          autoValidationError = error instanceof Error ? error.message : String(error);
        }
      }
      return {
        content: [{
          type: "text",
          text: [
            privilegedActionResultText(result),
            autoValidation ? "Auto-resumed Capability Builder validation" : undefined,
            autoValidation ? capabilityBuilderValidateText(autoValidation) : undefined,
            autoValidationError ? "Auto-resume Capability Builder validation blocked" : undefined,
            autoValidationError ? autoValidationError : undefined,
          ].filter(Boolean).join("\n\n"),
        }],
        details: {
          runtime: "privileged-action",
          toolName: "ambient_privileged_action_request",
          status: result.status,
          adapter: result.adapter,
          credentialCapture: result.nativeResult.credentialCapture,
          nativeRequest: {
            schemaVersion: nativeRequest.schemaVersion,
            requestId: nativeRequest.requestId,
            workspacePath: nativeRequest.workspacePath,
            createdAt: nativeRequest.createdAt,
            uiPrompt: nativeRequest.uiPrompt,
            adapterReadiness: nativeRequest.adapterReadiness,
            credentialPolicy: nativeRequest.credentialPolicy,
          },
          nativeResult: result.nativeResult,
          commandCount: result.plan.commandCount,
          adapterReadiness: result.plan.adapterReadiness,
          credentialPolicy: result.plan.credentialPolicy,
          redactedCommands: result.plan.redactedCommands,
          warnings: result.plan.warnings,
          ...(autoValidation ? {
            autoResumeValidation: {
              status: autoValidation.succeeded ? "succeeded" : "failed",
              packageName: autoValidation.packageName,
              logPath: autoValidation.logPath,
              relativeLogPath: autoValidation.relativeLogPath,
              commandCount: autoValidation.commands.length,
              artifactCount: autoValidation.artifacts.length,
            },
          } : {}),
          ...(autoValidationError ? {
            autoResumeValidation: {
              status: "blocked",
              error: autoValidationError,
              packageName: resumeAction?.input.packageName,
            },
          } : {}),
        },
      };
    },
  });
}
