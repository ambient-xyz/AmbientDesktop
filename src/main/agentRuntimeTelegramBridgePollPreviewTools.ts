import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  telegramBridgePollPlanText,
  type TelegramBridgePollPlan,
} from "./telegramBridgePolling";

export interface TelegramBridgePollPreviewToolRegistrationOptions {
  planForParams: (params: unknown) => TelegramBridgePollPlan;
}

export function registerTelegramBridgePollPreviewTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramBridgePollPreviewToolRegistrationOptions,
): void {
  const { planForParams } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const plan = planForParams(params);
      const { status: pollStatus, ...planDetails } = plan;
      return {
        content: [{ type: "text", text: telegramBridgePollPlanText(plan) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_bridge_poll_preview",
          status: pollStatus,
          pollStatus,
          ...planDetails,
        },
      };
    },
  });
}
