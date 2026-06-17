import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  telegramBridgePollingControlPreviewText,
  type TelegramBridgePollingControlPreview,
} from "../../telegram/telegramBridgePolling";

export interface TelegramBridgePollingPreviewToolRegistrationOptions {
  previewForParams: (params: unknown) => TelegramBridgePollingControlPreview;
}

export function registerTelegramBridgePollingPreviewTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramBridgePollingPreviewToolRegistrationOptions,
): void {
  const { previewForParams } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const preview = previewForParams(params);
      const { status: pollingStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: telegramBridgePollingControlPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_bridge_polling_preview",
          status: pollingStatus,
          pollingStatus,
          ...previewDetails,
        },
      };
    },
  });
}
