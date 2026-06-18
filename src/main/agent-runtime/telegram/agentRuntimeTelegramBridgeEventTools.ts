import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingBindingStore } from "../agentRuntimeMessagingFacade";
import {
  messagingGatewayInboundDispatchText,
  type MessagingGatewayRunner,
} from "../agentRuntimeMessagingFacade";
import {
  messagingInboundEventFromTelegramBridge,
  telegramBridgeEventRouteInput,
} from "../agentRuntimeTelegramFacade";
import type { RuntimeSurfaceSnapshot } from "../../../shared/runtimeSurfaceSnapshot";

export interface TelegramBridgeEventToolRegistrationOptions {
  bindings: MessagingBindingStore;
  gatewayRunner: Pick<MessagingGatewayRunner, "dispatchInbound">;
  runtimeSurfaceSnapshot: () => RuntimeSurfaceSnapshot;
}

export function registerTelegramBridgeEventTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramBridgeEventToolRegistrationOptions,
): void {
  const { bindings, gatewayRunner, runtimeSurfaceSnapshot } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_event_route"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const bridgeInput = telegramBridgeEventRouteInput(params);
      const event = messagingInboundEventFromTelegramBridge(bridgeInput);
      const snapshot = runtimeSurfaceSnapshot();
      const result = gatewayRunner.dispatchInbound({
        source: "telegram-bridge",
        event,
        bindings: bindings.list({ includeInactive: false }),
        surface: snapshot,
        requireRunning: false,
      });
      return {
        content: [{ type: "text", text: messagingGatewayInboundDispatchText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_bridge_event_route",
          status: result.accepted ? "accepted" : "dropped",
          ...result,
        },
      };
    },
  });
}
