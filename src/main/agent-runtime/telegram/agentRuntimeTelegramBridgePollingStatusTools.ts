import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  TelegramBridgePollingRunner,
  telegramBridgePollingStatusText,
} from "../../telegram/telegramBridgePolling";

export interface TelegramBridgePollingStatusToolRegistrationOptions {
  telegramBridgePollingRunner: Pick<TelegramBridgePollingRunner, "status">;
}

export function registerTelegramBridgePollingStatusTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramBridgePollingStatusToolRegistrationOptions,
): void {
  const { telegramBridgePollingRunner } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_status"), {
    executionMode: "sequential",
    execute: async () => {
      const result = telegramBridgePollingRunner.status();
      return {
        content: [{ type: "text", text: telegramBridgePollingStatusText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_bridge_polling_status",
          status: "complete",
          telegramBridgePolling: result,
        },
      };
    },
  });
}
