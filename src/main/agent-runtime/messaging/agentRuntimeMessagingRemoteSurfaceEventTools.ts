import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingBindingStore } from "../agentRuntimeMessagingFacade";
import {
  buildMessagingRemoteSurfaceEventPreview,
  messagingRemoteSurfaceEventPreviewInput,
  messagingRemoteSurfaceEventPreviewText,
  type MessagingRemoteSurfaceProviderRegistryLike,
} from "../agentRuntimeMessagingFacade";
import type { RuntimeSurfaceSnapshot } from "../../../shared/runtimeSurfaceSnapshot";

export interface MessagingRemoteSurfaceEventToolRegistrationOptions {
  registry: MessagingRemoteSurfaceProviderRegistryLike;
  bindings: MessagingBindingStore;
  runtimeSurfaceSnapshot: () => RuntimeSurfaceSnapshot;
}

export function registerMessagingRemoteSurfaceEventTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingRemoteSurfaceEventToolRegistrationOptions,
): void {
  const { registry, bindings, runtimeSurfaceSnapshot } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_remote_surface_event_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingRemoteSurfaceEventPreviewInput(params);
      const snapshot = runtimeSurfaceSnapshot();
      const preview = buildMessagingRemoteSurfaceEventPreview({
        toolInput: input,
        providers: registry,
        bindings: bindings.list({ includeInactive: false }),
        surface: snapshot,
      });
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: messagingRemoteSurfaceEventPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_event_preview",
          status: previewStatus,
          ...previewDetails,
        },
      };
    },
  });
}
