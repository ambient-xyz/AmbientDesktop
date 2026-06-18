import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  telegramBridgeReplyPreviewText,
  type TelegramBridgeReplyPreview,
} from "../agentRuntimeTelegramFacade";

export interface TelegramBridgeReplyPreviewToolRegistrationOptions {
  previewForParams: (params: unknown) => TelegramBridgeReplyPreview;
}

export function registerTelegramBridgeReplyPreviewTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramBridgeReplyPreviewToolRegistrationOptions,
): void {
  const { previewForParams } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const preview = previewForParams(params);
      const { status: replyStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: telegramBridgeReplyPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_bridge_reply_preview",
          status: replyStatus,
          replyStatus,
          ...previewDetails,
        },
      };
    },
  });
}
