import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingBindingStore } from "../agentRuntimeMessagingFacade";
import type { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import type { TelegramBridgePollingRunner } from "../agentRuntimeTelegramFacade";
import {
  buildTelegramOwnerLoopActivationPlan,
  telegramOwnerLoopActivationCard,
  telegramOwnerLoopActivationInput,
  telegramOwnerLoopActivationPlanText,
} from "../agentRuntimeTelegramFacade";

export interface TelegramOwnerLoopToolRegistrationOptions {
  bindings: MessagingBindingStore;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness" | "runtimeStatus">;
  telegramBridgePollingRunner: Pick<TelegramBridgePollingRunner, "status">;
}

export function registerTelegramOwnerLoopTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramOwnerLoopToolRegistrationOptions,
): void {
  const { bindings, gatewayRunner, telegramBridgePollingRunner } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = telegramOwnerLoopActivationInput(params);
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib").catch(() => undefined);
      const plan = buildTelegramOwnerLoopActivationPlan({
        toolInput: input,
        runtimeStatus: gatewayRunner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        pollingStatus: telegramBridgePollingRunner.status(),
      });
      return {
        content: [{ type: "text", text: telegramOwnerLoopActivationPlanText(plan) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_owner_loop_activation_plan",
          messagingRemoteSurfaceActivation: telegramOwnerLoopActivationCard(plan),
          ...plan,
        },
      };
    },
  });
}
