import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingListResult,
  MessagingBindingPurpose,
  MessagingProviderDescriptor,
} from "../../../shared/messagingGateway";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import {
  applySignalOwnerHandoff,
  buildSignalOwnerHandoffPreview,
  signalOwnerHandoffApprovalDetail,
  signalOwnerHandoffBlockedApplyResult,
  signalOwnerHandoffDeniedResult,
  signalOwnerHandoffInput,
  signalOwnerHandoffPreviewText,
  signalOwnerHandoffResultText,
} from "./signalOwnerHandoff";

export interface SignalOwnerHandoffBindingsLike {
  list(input?: { providerId?: string; purpose?: MessagingBindingPurpose; includeInactive?: boolean }): MessagingBindingListResult;
}

export interface SignalOwnerHandoffToolPermissionRequest {
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

export interface SignalOwnerHandoffToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: SignalOwnerHandoffToolPermissionRequest) => Promise<boolean>;
  bindings: SignalOwnerHandoffBindingsLike;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness" | "runtimeStatus">;
  signalDescriptor: () => MessagingProviderDescriptor | undefined;
}

export function registerSignalOwnerHandoffTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalOwnerHandoffToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    bindings,
    gatewayRunner,
    signalDescriptor,
  } = options;

  const signalOwnerHandoffPreviewForParams = async (params: unknown) => {
    const input = signalOwnerHandoffInput(params);
    await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
    const preview = buildSignalOwnerHandoffPreview({
      toolInput: input,
      bindings: bindings.list({ includeInactive: true }),
      runtimeStatus: gatewayRunner.runtimeStatus(),
      descriptor: signalDescriptor(),
    });
    return { input, preview };
  };

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_owner_handoff_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { preview } = await signalOwnerHandoffPreviewForParams(params);
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: signalOwnerHandoffPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_owner_handoff_preview",
          status: previewStatus,
          ownerHandoffStatus: previewStatus,
          ...previewDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_owner_handoff_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { input, preview } = await signalOwnerHandoffPreviewForParams(params);
      if (!preview.canApplyNow) {
        const result = signalOwnerHandoffBlockedApplyResult(preview);
        const { status: previewStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: signalOwnerHandoffResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_owner_handoff_apply",
            status: result.applyStatus,
            ownerHandoffStatus: result.handoffStatus,
            previewStatus,
            ...resultDetails,
          },
        };
      }
      const setupCodeHash = createHash("sha256").update(input.setupCode ?? "").digest("hex").slice(0, 16);
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_signal_owner_handoff_apply",
        title: "Read Signal owner handoff code?",
        message: `Read up to ${preview.limit} unread Signal message(s) from the reviewed fake bridge for conversation ${preview.conversationId ?? "unknown"} to find the setup-code sender.`,
        detail: signalOwnerHandoffApprovalDetail(preview),
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: `signal-owner-handoff:${preview.profileId ?? "unknown"}:${preview.conversationId ?? "unknown"}`,
        grantTargetIdentity: `${preview.providerId}:${preview.profileId ?? "unknown"}:${preview.conversationId ?? "unknown"}:${preview.limit}:${setupCodeHash}`,
        allowedReason: "User approved bounded fake Signal owner handoff.",
        deniedReason: "User denied Signal owner handoff.",
      });
      if (!allowed) {
        const result = signalOwnerHandoffDeniedResult(preview);
        const { status: previewStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: signalOwnerHandoffResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_owner_handoff_apply",
            status: result.applyStatus,
            ownerHandoffStatus: result.handoffStatus,
            previewStatus,
            ...resultDetails,
          },
        };
      }
      const result = await applySignalOwnerHandoff({
        preview,
        setupCode: input.setupCode ?? "",
        approvalRecorded: true,
      });
      const { status: previewStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: signalOwnerHandoffResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_owner_handoff_apply",
          status: result.applyStatus,
          ownerHandoffStatus: result.handoffStatus,
          previewStatus,
          ...resultDetails,
        },
      };
    },
  });
}
