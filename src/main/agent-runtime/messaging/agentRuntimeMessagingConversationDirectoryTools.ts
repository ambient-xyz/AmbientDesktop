import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { MessagingBindingStore } from "../../messaging/messagingBindings";
import type { MessagingConversationDirectoryAdapterRegistry } from "../../messaging/messagingConversationDirectoryAdapters";
import {
  buildMessagingConversationDirectoryPreview,
  messagingConversationDirectoryInput,
  messagingConversationDirectoryPreviewText,
  type MessagingConversationDirectoryProviderRegistryLike,
} from "../../messaging/messagingConversationDirectory";
import type { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";

export interface MessagingConversationDirectoryToolRegistrationOptions {
  registry: MessagingConversationDirectoryProviderRegistryLike;
  directoryAdapters: MessagingConversationDirectoryAdapterRegistry;
  bindings: MessagingBindingStore;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness" | "runtimeStatus">;
}

export function registerMessagingConversationDirectoryTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingConversationDirectoryToolRegistrationOptions,
): void {
  const { registry, directoryAdapters, bindings, gatewayRunner } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_conversation_directory_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingConversationDirectoryInput(params);
      await gatewayRunner.refreshProviderReadiness(input.providerId).catch(() => undefined);
      const preview = buildMessagingConversationDirectoryPreview({
        toolInput: input,
        providers: registry,
        directoryAdapters,
        bindings: bindings.list({
          providerId: input.providerId,
          purpose: input.purpose,
          includeInactive: input.includeInactive,
        }),
        runtimeStatus: gatewayRunner.runtimeStatus(),
      });
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: messagingConversationDirectoryPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_conversation_directory_preview",
          status: previewStatus,
          ...previewDetails,
        },
      };
    },
  });
}
