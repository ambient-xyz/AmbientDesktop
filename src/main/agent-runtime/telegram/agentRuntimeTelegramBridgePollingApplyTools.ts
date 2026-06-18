import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  telegramBridgePollingApprovalDetail,
  telegramBridgePollingControlResultText,
  type TelegramBridgePollingControlInput,
  type TelegramBridgePollingControlPreview,
  type TelegramBridgePollingControlResult,
} from "../agentRuntimeTelegramFacade";

export interface TelegramBridgePollingApplyPreviewForParamsResult {
  input: TelegramBridgePollingControlInput;
  preview: TelegramBridgePollingControlPreview;
}

export interface TelegramBridgePollingApplyInput {
  input: TelegramBridgePollingControlInput;
  preview: TelegramBridgePollingControlPreview;
  approvalRecorded: boolean;
}

export interface TelegramBridgePollingApplyToolPermissionRequest {
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

export interface TelegramBridgePollingApplyToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: TelegramBridgePollingApplyToolPermissionRequest) => Promise<boolean>;
  previewForParams: (params: unknown) => TelegramBridgePollingApplyPreviewForParamsResult;
  applyPolling: (input: TelegramBridgePollingApplyInput) => Promise<TelegramBridgePollingControlResult>;
}

export function registerTelegramBridgePollingApplyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramBridgePollingApplyToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    previewForParams,
    applyPolling,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { input, preview } = previewForParams(params);
      if (!preview.canApplyNow) {
        const result = await applyPolling({ input, preview, approvalRecorded: false });
        const { status: pollingStatus, ...resultDetails } = result;
        return pollingApplyToolResult(result, pollingStatus, resultDetails);
      }
      let approvalRecorded = false;
      if (preview.approvalRequired) {
        const allowed = await resolveFirstPartyPluginPermission({
          thread: getThread(threadId),
          workspace,
          toolName: "ambient_messaging_telegram_bridge_polling_apply",
          title: "Start periodic Telegram Remote Ambient Surface polling?",
          message: `Start Telegram polling every ${preview.intervalMs}ms for ${preview.selectedBindings.length} owner binding(s).`,
          detail: telegramBridgePollingApprovalDetail(preview),
          risk: "plugin-tool",
          reusableScopes: ["thread", "project", "workspace"],
          grantTargetLabel: `telegram-bridge-polling:${preview.selectedBindings.length}:bindings`,
          grantTargetIdentity: `${preview.providerId}:${preview.selectedBindings.map((binding) => binding.bindingId).join(",")}:${preview.intervalMs}:${preview.limit}`,
          allowedReason: "User approved periodic Telegram bridge polling.",
          deniedReason: "User denied periodic Telegram bridge polling.",
        });
        if (!allowed) {
          const result = await applyPolling({ input, preview, approvalRecorded: false });
          const { status: pollingStatus, ...resultDetails } = result;
          return pollingApplyToolResult(result, pollingStatus, resultDetails);
        }
        approvalRecorded = true;
      }
      const result = await applyPolling({ input, preview, approvalRecorded });
      const { status: pollingStatus, ...resultDetails } = result;
      return pollingApplyToolResult(result, pollingStatus, resultDetails);
    },
  });
}

function pollingApplyToolResult(
  result: TelegramBridgePollingControlResult,
  pollingStatus: TelegramBridgePollingControlResult["status"],
  resultDetails: Omit<TelegramBridgePollingControlResult, "status">,
) {
  return {
    content: [{ type: "text" as const, text: telegramBridgePollingControlResultText(result) }],
    details: {
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_telegram_bridge_polling_apply",
      status: result.applyStatus,
      pollingStatus,
      ...resultDetails,
    },
  };
}
