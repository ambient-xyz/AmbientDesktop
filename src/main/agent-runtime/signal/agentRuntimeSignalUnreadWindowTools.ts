import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingListResult,
  MessagingBindingPurpose,
  RuntimeSurfaceSnapshot,
} from "../../../shared/messagingGateway";
import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../../../shared/types";
import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";
import {
  applySignalRealUnreadWindow,
  applySignalUnreadWindow,
  buildSignalRealUnreadWindowPreview,
  buildSignalUnreadWindowPreview,
  buildSignalUnreadWindowStatus,
  signalRealUnreadWindowApprovalDetail,
  signalRealUnreadWindowBlockedResult,
  signalRealUnreadWindowInput,
  signalRealUnreadWindowPreviewText,
  signalRealUnreadWindowResultText,
  signalUnreadWindowApprovalDetail,
  signalUnreadWindowBlockedResult,
  signalUnreadWindowDeniedResult,
  signalUnreadWindowInput,
  signalUnreadWindowPreviewText,
  signalUnreadWindowResultText,
  signalUnreadWindowStatusInput,
  signalUnreadWindowStatusText,
} from "./signalUnreadWindow";

export interface SignalUnreadWindowBindingsLike {
  list(input?: { providerId?: string; purpose?: MessagingBindingPurpose; includeInactive?: boolean }): MessagingBindingListResult;
}

export interface SignalUnreadWindowToolPermissionRequest {
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

export interface SignalUnreadWindowToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: SignalUnreadWindowToolPermissionRequest) => Promise<boolean>;
  runtimeSurfaceSnapshot: () => RuntimeSurfaceSnapshot | undefined;
  bindings: SignalUnreadWindowBindingsLike;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness" | "runtimeStatus" | "dispatchInbound">;
}

export function registerSignalUnreadWindowTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalUnreadWindowToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    runtimeSurfaceSnapshot,
    bindings,
    gatewayRunner,
  } = options;

  const signalUnreadWindowPreviewForParams = async (params: unknown) => {
    const input = signalUnreadWindowInput(params);
    await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
    return buildSignalUnreadWindowPreview({
      toolInput: input,
      bindings: bindings.list({ includeInactive: true }),
      runtimeStatus: gatewayRunner.runtimeStatus(),
    });
  };

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const preview = await signalUnreadWindowPreviewForParams(params);
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: signalUnreadWindowPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_unread_window_preview",
          status: previewStatus,
          unreadWindowStatus: previewStatus,
          ...previewDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const preview = await signalUnreadWindowPreviewForParams(params);
      if (!preview.canApplyNow) {
        const result = signalUnreadWindowBlockedResult(preview);
        const { status: previewStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: signalUnreadWindowResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_unread_window_apply",
            status: result.applyStatus,
            unreadWindowStatus: result.applyStatus,
            previewStatus,
            ...resultDetails,
          },
        };
      }
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_signal_unread_window_apply",
        title: "Read Signal unread window?",
        message: `Read up to ${preview.limit} unread Signal message(s) from the reviewed fake bridge for binding ${preview.bindingId ?? "unknown"}.`,
        detail: signalUnreadWindowApprovalDetail(preview),
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: `signal-unread-window:${preview.bindingId ?? "unknown"}`,
        grantTargetIdentity: `${preview.providerId}:${preview.bindingId ?? "unknown"}:${preview.profileId ?? "unknown"}:${preview.conversationId ?? "unknown"}:${preview.limit}`,
        allowedReason: "User approved bounded fake Signal unread-window read.",
        deniedReason: "User denied Signal unread-window read.",
      });
      if (!allowed) {
        const result = signalUnreadWindowDeniedResult(preview);
        const { status: previewStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: signalUnreadWindowResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_unread_window_apply",
            status: result.applyStatus,
            unreadWindowStatus: result.applyStatus,
            previewStatus,
            ...resultDetails,
          },
        };
      }
      const snapshot = runtimeSurfaceSnapshot();
      const currentBindings = bindings.list({ includeInactive: false });
      const result = await applySignalUnreadWindow({
        preview,
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
      const { status: previewStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: signalUnreadWindowResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_unread_window_apply",
          status: result.applyStatus,
          unreadWindowStatus: result.applyStatus,
          previewStatus,
          ...resultDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_status"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = signalUnreadWindowStatusInput(params);
      await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
      const result = buildSignalUnreadWindowStatus({
        toolInput: input,
        bindings: bindings.list({ includeInactive: input.includeInactive }),
        runtimeStatus: gatewayRunner.runtimeStatus(),
        stateRoot: workspace.statePath,
      });
      return {
        content: [{ type: "text", text: signalUnreadWindowStatusText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_unread_window_status",
          ...result,
        },
      };
    },
  });

  const signalRealUnreadWindowPreviewForParams = async (params: unknown) => {
    const input = signalRealUnreadWindowInput(params);
    await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
    return buildSignalRealUnreadWindowPreview({
      toolInput: input,
      bindings: bindings.list({ includeInactive: true }),
      runtimeStatus: gatewayRunner.runtimeStatus(),
    });
  };

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_real_unread_window_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const preview = await signalRealUnreadWindowPreviewForParams(params);
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: signalRealUnreadWindowPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_real_unread_window_preview",
          status: previewStatus,
          realUnreadWindowStatus: previewStatus,
          ...previewDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_real_unread_window_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const preview = await signalRealUnreadWindowPreviewForParams(params);
      if (!preview.canApplyNow) {
        const result = signalRealUnreadWindowBlockedResult(preview);
        const { status: previewStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: signalRealUnreadWindowResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_real_unread_window_apply",
            status: result.applyStatus,
            realUnreadWindowStatus: result.applyStatus,
            previewStatus,
            ...resultDetails,
          },
        };
      }
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_signal_real_unread_window_apply",
        title: "Read real Signal unread window?",
        message: `Read up to ${preview.limit} unread Signal message(s) from the reviewed real bridge for binding ${preview.bindingId ?? "unknown"}.`,
        detail: signalRealUnreadWindowApprovalDetail(preview),
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: `signal-real-unread-window:${preview.bindingId ?? "unknown"}`,
        grantTargetIdentity: `${preview.providerId}:${preview.bindingId ?? "unknown"}:${preview.profileId ?? "unknown"}:${preview.conversationId ?? "unknown"}:${preview.limit}`,
        allowedReason: "User approved bounded real Signal unread single-read.",
        deniedReason: "User denied real Signal unread single-read.",
      });
      const snapshot = runtimeSurfaceSnapshot();
      const currentBindings = bindings.list({ includeInactive: false });
      const result = await applySignalRealUnreadWindow({
        preview,
        bindings: currentBindings,
        stateRoot: workspace.statePath,
        approvalRecorded: allowed,
        dispatch: (event) => gatewayRunner.dispatchInbound({
          source: "signal-bridge",
          event,
          bindings: currentBindings,
          surface: snapshot,
          requireRunning: false,
          redactEventTextInResult: true,
        }),
      });
      const { status: previewStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: signalRealUnreadWindowResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_real_unread_window_apply",
          status: result.applyStatus,
          realUnreadWindowStatus: result.applyStatus,
          previewStatus,
          ...resultDetails,
        },
      };
    },
  });
}
