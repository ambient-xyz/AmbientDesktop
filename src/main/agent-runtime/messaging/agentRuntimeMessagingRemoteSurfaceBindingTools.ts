import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { MessagingBindingStore } from "../../messaging/messagingBindings";
import type { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";
import {
  buildMessagingRemoteSurfaceBindingPreview,
  messagingRemoteSurfaceBindingPreviewInput,
  messagingRemoteSurfaceBindingPreviewText,
  type MessagingRemoteSurfaceProviderRegistryLike,
} from "../../messaging/messagingRemoteSurfaceProviderPreview";
import type {
  TelegramRemoteSurfaceBindingPlan,
  TelegramRemoteSurfaceBindingToolInput,
} from "../../telegram/telegramRemoteSurfaceBinding";

export interface MessagingRemoteSurfaceBindingToolRegistrationOptions {
  registry: MessagingRemoteSurfaceProviderRegistryLike;
  bindings: MessagingBindingStore;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness">;
  telegramPlan: (toolInput: TelegramRemoteSurfaceBindingToolInput) => Promise<TelegramRemoteSurfaceBindingPlan>;
}

export function registerMessagingRemoteSurfaceBindingTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingRemoteSurfaceBindingToolRegistrationOptions,
): void {
  const { registry, bindings, gatewayRunner, telegramPlan } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_remote_surface_binding_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingRemoteSurfaceBindingPreviewInput(params);
      const providerId = input.providerId;
      if (providerId) {
        await gatewayRunner.refreshProviderReadiness(providerId).catch(() => undefined);
      }
      const preview = await buildMessagingRemoteSurfaceBindingPreview({
        toolInput: input,
        providers: registry,
        bindings: bindings.list({ includeInactive: true }),
        telegramPlan,
      });
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: messagingRemoteSurfaceBindingPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_binding_preview",
          status: previewStatus,
          ...previewDetails,
        },
      };
    },
  });
}
