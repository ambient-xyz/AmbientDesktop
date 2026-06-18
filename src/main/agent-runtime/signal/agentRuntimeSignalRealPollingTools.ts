import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingListResult,
  MessagingBindingPurpose,
  RuntimeSurfaceSnapshot,
} from "../../../shared/messagingGateway";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import {
  SignalRealPollingRunner,
  signalRealPollingApprovalDetail,
  signalRealPollingControlInput,
  signalRealPollingControlPreviewText,
  signalRealPollingControlResultText,
  signalRealPollingStatusText,
} from "./signalRealPolling";
import {
  applySignalRealUnreadWindow,
  buildSignalRealUnreadWindowPreview,
} from "./signalUnreadWindow";

export interface SignalRealPollingBindingsLike {
  list(input?: { providerId?: string; purpose?: MessagingBindingPurpose; includeInactive?: boolean }): MessagingBindingListResult;
}

export interface SignalRealPollingToolPermissionRequest {
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

export interface SignalRealPollingToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: SignalRealPollingToolPermissionRequest) => Promise<boolean>;
  runtimeSurfaceSnapshot: (limit?: number) => RuntimeSurfaceSnapshot | undefined;
  bindings: SignalRealPollingBindingsLike;
  gatewayRunner: Pick<MessagingGatewayRunner, "dispatchInbound" | "refreshProviderReadiness" | "runtimeStatus">;
  signalRealPollingRunner: Pick<SignalRealPollingRunner, "apply" | "preview" | "status">;
}

export function registerSignalRealPollingTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalRealPollingToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    runtimeSurfaceSnapshot,
    bindings,
    gatewayRunner,
    signalRealPollingRunner,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_status"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = signalRealPollingControlInput(params);
      await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
      const status = signalRealPollingRunner.status({
        bindings: bindings.list({ includeInactive: false }),
        runtimeStatus: gatewayRunner.runtimeStatus(),
        limit: input.limit,
        intervalMs: input.intervalMs,
      });
      return {
        content: [{ type: "text", text: signalRealPollingStatusText(status) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_real_polling_status",
          status: status.runnerState,
          signalRealPolling: status,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = signalRealPollingControlInput(params);
      await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
      const preview = signalRealPollingRunner.preview({
        toolInput: input,
        bindings: bindings.list({ includeInactive: false }),
        runtimeStatus: gatewayRunner.runtimeStatus(),
      });
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: signalRealPollingControlPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_real_polling_preview",
          status: previewStatus,
          signalRealPollingStatus: previewStatus,
          ...previewDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = signalRealPollingControlInput(params);
      await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
      const preview = signalRealPollingRunner.preview({
        toolInput: input,
        bindings: bindings.list({ includeInactive: false }),
        runtimeStatus: gatewayRunner.runtimeStatus(),
      });
      let approvalRecorded = false;
      if (preview.canApplyNow && preview.approvalRequired) {
        approvalRecorded = await resolveFirstPartyPluginPermission({
          thread: getThread(threadId),
          workspace,
          toolName: "ambient_messaging_signal_real_polling_apply",
          title: "Start Signal real polling?",
          message: `Start Signal polling every ${preview.intervalMs}ms for binding ${preview.bindingId ?? "unknown"}.`,
          detail: signalRealPollingApprovalDetail(preview),
          risk: "plugin-tool",
          reusableScopes: ["thread"],
          grantTargetLabel: `signal-real-polling:${preview.bindingId ?? "unknown"}`,
          grantTargetIdentity: `${preview.providerId}:${preview.bindingId ?? "unknown"}:${preview.profileId ?? "unknown"}:${preview.conversationId ?? "unknown"}:${preview.intervalMs}:${preview.limit}`,
          allowedReason: "User approved Signal real polling.",
          deniedReason: "User denied Signal real polling.",
        });
      }
      const pollOnce = async () => {
        await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
        const currentBindings = bindings.list({ includeInactive: false });
        const singleReadPreview = buildSignalRealUnreadWindowPreview({
          toolInput: input,
          bindings: currentBindings,
          runtimeStatus: gatewayRunner.runtimeStatus(),
        });
        const snapshot = runtimeSurfaceSnapshot(input.limit);
        return await applySignalRealUnreadWindow({
          preview: singleReadPreview,
          bindings: currentBindings,
          stateRoot: workspace.statePath,
          approvalRecorded: true,
          dispatch: (event) => gatewayRunner.dispatchInbound({
            source: "signal-bridge",
            event,
            bindings: currentBindings,
            surface: snapshot,
            requireRunning: false,
            redactEventTextInResult: true,
          }),
        });
      };
      const result = await signalRealPollingRunner.apply({
        preview,
        approvalRecorded: input.action === "stop" ? true : approvalRecorded,
        pollOnce,
      });
      const { status: previewStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: signalRealPollingControlResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_real_polling_apply",
          status: result.applyStatus,
          signalRealPollingStatus: result.applyStatus,
          previewStatus,
          ...resultDetails,
        },
      };
    },
  });
}
