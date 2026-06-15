import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import {
  capabilityBuilderUnregisterText,
  planCapabilityBuilderRemoval,
  unregisterCapabilityBuilderPackage,
  type CapabilityBuilderRemovalPlanResult,
  type CapabilityBuilderUnregisterInput,
  type CapabilityBuilderUnregisterResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface CapabilityBuilderUnregisterPermissionRequest {
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

export interface CapabilityBuilderUnregisterToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parseUnregisterInput: (params: Record<string, unknown>) => CapabilityBuilderUnregisterInput;
  planCapabilityBuilderRemoval?: (
    workspacePath: string,
    input: CapabilityBuilderUnregisterInput,
  ) => Promise<CapabilityBuilderRemovalPlanResult> | CapabilityBuilderRemovalPlanResult;
  unregisterCapabilityBuilderPackage?: (
    workspacePath: string,
    input: CapabilityBuilderUnregisterInput,
  ) => Promise<CapabilityBuilderUnregisterResult> | CapabilityBuilderUnregisterResult;
  capabilityBuilderUnregisterText?: (result: CapabilityBuilderUnregisterResult) => string;
  resolveFirstPartyPluginPermission: (input: CapabilityBuilderUnregisterPermissionRequest) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
}

export function registerCapabilityBuilderUnregisterTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderUnregisterToolRegistrationOptions,
): void {
  const { workspace } = options;
  const planRemoval = options.planCapabilityBuilderRemoval ?? planCapabilityBuilderRemoval;
  const unregisterPackage = options.unregisterCapabilityBuilderPackage ?? unregisterCapabilityBuilderPackage;
  const unregisterText = options.capabilityBuilderUnregisterText ?? capabilityBuilderUnregisterText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_unregister"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Capability Builder unregister is blocked in Planner Mode.");
      const input = options.parseUnregisterInput(params as Record<string, unknown>);
      const removalPlan = await planRemoval(workspace.path, input);
      if (removalPlan.errors.length) throw new Error(`Capability removal plan has errors: ${removalPlan.errors.join("; ")}`);
      const detail = [
        `Workspace: ${workspace.path}`,
        `Package: ${removalPlan.packageName}`,
        `Builder source: ${removalPlan.relativeRootPath}`,
        `Installed package id: ${removalPlan.installedPackageId ?? "not supplied"}`,
        `Installed source: ${removalPlan.installedSource ?? "not supplied"}`,
        `Reason: ${input.reason ?? "not supplied"}`,
        "Effect: unregisters/removes only the installed Ambient CLI package copy from Ambient CLI package state.",
        "Preserved: managed builder source, package-local Git history, validation logs, dependency logs, generated artifacts, env bindings, and secret metadata.",
        "No builder source deletion, artifact deletion, log deletion, validation, registration, activation, or generated capability command execution happens in this step.",
        "",
        "Removal plan approval checkpoints:",
        ...removalPlan.approvalCheckpoints.map((checkpoint) => `- ${checkpoint}`),
      ].join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_capability_builder_unregister",
        title: `Unregister generated capability "${removalPlan.packageName}"?`,
        message: "Ambient wants to remove installed generated capability visibility while preserving its builder source and artifacts.",
        detail,
        grantTargetLabel: `Unregister generated capability ${removalPlan.packageName}`,
        grantTargetIdentity: ["ambient_capability_builder_unregister", workspace.path, removalPlan.installedPackageId ?? removalPlan.packageName].join("\0"),
        allowedReason: "Capability Builder unregister approved by Ambient permission grant policy.",
        deniedReason: "Capability Builder unregister prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Capability Builder unregister blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Unregistering generated Ambient capability "${removalPlan.packageName}".` }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_unregister",
          status: "unregistering",
          packageName: removalPlan.packageName,
        },
      });
      const result = await unregisterPackage(workspace.path, input);
      options.markPluginToolsStale();
      return {
        content: [{ type: "text" as const, text: unregisterText(result) }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_unregister",
          status: "unregistered",
          packageName: result.packageName,
          rootPath: result.rootPath,
          relativeRootPath: result.relativeRootPath,
          gitSha: result.gitSha,
          unregisteredAt: result.unregisteredAt,
          removedPackageId: result.removedPackage.id,
          removedPackageName: result.removedPackage.name,
          preserved: result.preserved,
          availability: "next-session-refresh",
        },
      };
    },
  });
}
