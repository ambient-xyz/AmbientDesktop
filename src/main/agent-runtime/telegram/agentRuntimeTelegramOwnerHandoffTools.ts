import { createHash } from "node:crypto";
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
  applyTelegramOwnerHandoff,
  buildTelegramOwnerHandoffPreview,
  telegramOwnerHandoffApprovalDetail,
  telegramOwnerHandoffBlockedResult,
  telegramOwnerHandoffDeniedResult,
  telegramOwnerHandoffInput,
  telegramOwnerHandoffPreviewText,
  telegramOwnerHandoffResultText,
} from "../../telegram/telegramOwnerHandoff";

export interface TelegramOwnerHandoffToolPermissionRequest {
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

export interface TelegramOwnerHandoffToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: TelegramOwnerHandoffToolPermissionRequest) => Promise<boolean>;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness" | "runtimeStatus">;
}

export function registerTelegramOwnerHandoffTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramOwnerHandoffToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    gatewayRunner,
  } = options;

  const telegramOwnerHandoffPreviewForParams = async (params: unknown) => {
    const input = telegramOwnerHandoffInput(params);
    await gatewayRunner.refreshProviderReadiness("telegram-tdlib").catch(() => undefined);
    return {
      input,
      preview: buildTelegramOwnerHandoffPreview({
        toolInput: input,
        runtimeStatus: gatewayRunner.runtimeStatus(),
      }),
    };
  };

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_handoff_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { preview } = await telegramOwnerHandoffPreviewForParams(params);
      const { status: handoffStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: telegramOwnerHandoffPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_owner_handoff_preview",
          status: handoffStatus,
          handoffStatus,
          ...previewDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_handoff_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { input, preview } = await telegramOwnerHandoffPreviewForParams(params);
      if (!preview.canApplyNow) {
        const result = telegramOwnerHandoffBlockedResult(preview);
        const { status: previewStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: telegramOwnerHandoffResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_owner_handoff_apply",
            status: result.applyStatus,
            previewStatus,
            ...resultDetails,
          },
        };
      }
      const setupCodeHash = createHash("sha256").update(input.setupCode).digest("hex").slice(0, 16);
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_telegram_owner_handoff_apply",
        title: "Read Telegram owner handoff code?",
        message: `Read up to ${preview.limit} unread Telegram message(s) from conversation ${preview.conversationId} to find the setup-code sender.`,
        detail: telegramOwnerHandoffApprovalDetail(preview),
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: `telegram-owner-handoff:${preview.profileId}:${preview.conversationId}`,
        grantTargetIdentity: `${preview.providerId}:${preview.profileId}:${preview.conversationId}:${preview.limit}:${setupCodeHash}`,
        allowedReason: "User approved bounded Telegram owner handoff.",
        deniedReason: "User denied Telegram owner handoff.",
      });
      if (!allowed) {
        const result = telegramOwnerHandoffDeniedResult(preview);
        const { status: previewStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: telegramOwnerHandoffResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_owner_handoff_apply",
            status: result.applyStatus,
            previewStatus,
            ...resultDetails,
          },
        };
      }
      const result = await applyTelegramOwnerHandoff({
        preview,
        setupCode: input.setupCode,
        approvalRecorded: true,
      });
      const { status: previewStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: telegramOwnerHandoffResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_owner_handoff_apply",
          status: result.applyStatus,
          previewStatus,
          ...resultDetails,
        },
      };
    },
  });
}
