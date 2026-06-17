import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import { buildHeadlessRuntimeUxInventory, headlessRuntimeUxInventoryText } from "../../headlessRuntimeInventory";
import type { MessagingBindingStore } from "../../messagingBindings";
import {
  messagingProviderListText,
  messagingProviderStatusText,
  type MessagingProviderRegistry,
} from "../../messagingGatewayRegistry";
import type { MessagingGatewayRunner } from "../../messagingGatewayRunner";
import {
  buildMessagingRemoteSurfaceActivationPlan,
  buildMessagingRemoteSurfaceProviderSupportPlan,
  messagingRemoteSurfaceActivationCard,
  messagingRemoteSurfaceActivationInput,
  messagingRemoteSurfaceActivationPlanText,
  messagingRemoteSurfaceProviderSupportPlanInput,
  messagingRemoteSurfaceProviderSupportPlanText,
} from "../../messagingRemoteSurfaceActivationPlan";
import type { TelegramBridgePollingRunner } from "../../telegramBridgePolling";

export interface MessagingOverviewToolRegistrationOptions {
  registry: MessagingProviderRegistry;
  bindings: MessagingBindingStore;
  gatewayRunner: MessagingGatewayRunner;
  telegramBridgePollingRunner: TelegramBridgePollingRunner;
}

export function registerMessagingOverviewTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingOverviewToolRegistrationOptions,
): void {
  const { registry, bindings, gatewayRunner, telegramBridgePollingRunner } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_headless_ux_inventory"), {
    executionMode: "sequential",
    execute: async () => {
      const result = buildHeadlessRuntimeUxInventory();
      return {
        content: [{ type: "text", text: headlessRuntimeUxInventoryText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_headless_ux_inventory",
          status: "complete",
          ...result,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingRemoteSurfaceActivationInput(params);
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib").catch(() => undefined);
      const plan = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: input,
        runtimeStatus: gatewayRunner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: telegramBridgePollingRunner.status(),
      });
      return {
        content: [{ type: "text", text: messagingRemoteSurfaceActivationPlanText(plan) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_activation_plan",
          messagingRemoteSurfaceActivation: messagingRemoteSurfaceActivationCard(plan),
          ...plan,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingRemoteSurfaceProviderSupportPlanInput(params);
      const plan = buildMessagingRemoteSurfaceProviderSupportPlan(input);
      return {
        content: [{ type: "text", text: messagingRemoteSurfaceProviderSupportPlanText(plan) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_provider_support_plan",
          messagingRemoteSurfaceProviderSupportPlan: plan,
          ...plan,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_list_providers"), {
    executionMode: "sequential",
    execute: async () => {
      const result = await registry.list();
      return {
        content: [{ type: "text", text: messagingProviderListText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_list_providers",
          status: "complete",
          providerCount: result.providerCount,
          availableProviderCount: result.availableProviderCount,
          headlessReadyProviderCount: result.headlessReadyProviderCount,
          providers: result.providers,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_provider_status"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const providerId = typeof (params as { providerId?: unknown })?.providerId === "string"
        ? (params as { providerId: string }).providerId.trim()
        : "";
      if (!providerId) throw new Error("providerId is required.");
      const summaries = await registry.summaries();
      const summary = summaries.find((candidate) => candidate.descriptor.providerId === providerId);
      if (!summary) throw new Error(`Ambient messaging provider not found: ${providerId}`);
      return {
        content: [{ type: "text", text: messagingProviderStatusText(summary) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_provider_status",
          status: "complete",
          provider: summary,
        },
      };
    },
  });
}
