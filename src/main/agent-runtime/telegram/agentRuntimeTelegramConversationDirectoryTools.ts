import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
  applyTelegramConversationDirectory,
  buildTelegramConversationDirectoryPreview,
  telegramConversationDirectoryApprovalDetail,
  telegramConversationDirectoryBlockedResult,
  telegramConversationDirectoryDeniedResult,
  telegramConversationDirectoryInput,
  telegramConversationDirectoryPreviewText,
  telegramConversationDirectoryResultText,
  telegramConversationDirectorySetupCard,
} from "../../telegram/telegramConversationDirectory";

export interface TelegramConversationDirectoryToolPermissionRequest {
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

export interface TelegramConversationDirectoryToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: TelegramConversationDirectoryToolPermissionRequest) => Promise<boolean>;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness" | "runtimeStatus">;
}

export function registerTelegramConversationDirectoryTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramConversationDirectoryToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    gatewayRunner,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_conversation_directory_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = telegramConversationDirectoryInput(params);
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib").catch(() => undefined);
      const preview = buildTelegramConversationDirectoryPreview({
        toolInput: input,
        runtimeStatus: gatewayRunner.runtimeStatus(),
      });
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: telegramConversationDirectoryPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_conversation_directory_preview",
          status: previewStatus,
          directoryStatus: previewStatus,
          messagingConversationDirectorySetup: telegramConversationDirectorySetupCard(preview),
          ...previewDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_conversation_directory_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = telegramConversationDirectoryInput(params);
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib").catch(() => undefined);
      const preview = buildTelegramConversationDirectoryPreview({
        toolInput: input,
        runtimeStatus: gatewayRunner.runtimeStatus(),
      });
      if (!preview.canApplyNow) {
        const result = telegramConversationDirectoryBlockedResult(preview);
        const { status: directoryStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: telegramConversationDirectoryResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_conversation_directory_apply",
            status: "blocked",
            directoryStatus,
            messagingConversationDirectorySetup: telegramConversationDirectorySetupCard(result),
            ...resultDetails,
          },
        };
      }
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_telegram_conversation_directory_apply",
        title: "Read Telegram conversation directory?",
        message: `Read up to ${preview.limit} Telegram conversation metadata row(s) from profile ${preview.profileId}.`,
        detail: telegramConversationDirectoryApprovalDetail(preview),
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: `telegram-directory:${preview.profileId ?? "unknown"}:${preview.limit}`,
        grantTargetIdentity: `${preview.providerId}:${preview.profileId ?? ""}:${preview.query ?? ""}:${preview.unreadOnly}:${preview.folderId ?? ""}:${preview.limit}`,
        allowedReason: "User approved bounded Telegram conversation directory read.",
        deniedReason: "User denied Telegram conversation directory read.",
      });
      if (!allowed) {
        const result = telegramConversationDirectoryDeniedResult(preview);
        const { status: directoryStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: telegramConversationDirectoryResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_conversation_directory_apply",
            status: "denied",
            directoryStatus,
            messagingConversationDirectorySetup: telegramConversationDirectorySetupCard(result),
            ...resultDetails,
          },
        };
      }
      const result = await applyTelegramConversationDirectory({
        preview,
        approvalRecorded: true,
      });
      const { status: directoryStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: telegramConversationDirectoryResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_conversation_directory_apply",
          status: result.applyStatus,
          directoryStatus,
          messagingConversationDirectorySetup: telegramConversationDirectorySetupCard(result),
          ...resultDetails,
        },
      };
    },
  });
}
