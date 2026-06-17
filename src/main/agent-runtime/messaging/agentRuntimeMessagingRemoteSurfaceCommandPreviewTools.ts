import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  messagingRemoteSurfaceCommandPreviewText,
  type MessagingRemoteSurfaceCommandPreview,
} from "../../messaging/messagingRemoteSurfaceCommands";

export interface MessagingRemoteSurfaceCommandPreviewToolRegistrationOptions {
  previewForParams: (params: unknown) => MessagingRemoteSurfaceCommandPreview;
}

export function registerMessagingRemoteSurfaceCommandPreviewTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingRemoteSurfaceCommandPreviewToolRegistrationOptions,
): void {
  const { previewForParams } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_remote_surface_command_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params): Promise<any> => {
      const preview = previewForParams(params);
      const { status: commandStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: messagingRemoteSurfaceCommandPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_command_preview",
          status: commandStatus,
          commandStatus,
          ...previewDetails,
        },
      };
    },
  });
}
