import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingGatewayRuntimeStatus } from "../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  telegramBridgeReplyResultText,
  type TelegramBridgeReplyResult,
} from "./telegramBridgeOutbound";

export interface TelegramBridgeReplyApplyToolRegistrationOptions {
  applyForParams: (params: unknown) => Promise<TelegramBridgeReplyResult>;
  gatewayRuntimeStatus: () => MessagingGatewayRuntimeStatus;
}

export function registerTelegramBridgeReplyApplyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramBridgeReplyApplyToolRegistrationOptions,
): void {
  const { applyForParams, gatewayRuntimeStatus } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const result = await applyForParams(params);
      const { status: replyStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: telegramBridgeReplyResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          status: result.applyStatus,
          replyStatus,
          ...resultDetails,
          gatewayRuntimeStatus: gatewayRuntimeStatus(),
        },
      };
    },
  });
}
