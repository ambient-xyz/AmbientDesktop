import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingGatewayLifecyclePreview } from "../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import { messagingGatewayLifecyclePreviewText } from "./messagingGatewayRunner";

export interface MessagingGatewayLifecyclePreviewInput {
  action: "start" | "stop";
  providerId: string;
  mode?: "synthetic" | "real";
}

export interface MessagingGatewayLifecyclePreviewToolRegistrationOptions {
  refreshProviderReadiness: (providerId: string) => Promise<unknown>;
  previewLifecycle: (input: MessagingGatewayLifecyclePreviewInput) => MessagingGatewayLifecyclePreview;
}

export function registerMessagingGatewayLifecyclePreviewTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingGatewayLifecyclePreviewToolRegistrationOptions,
): void {
  const { refreshProviderReadiness, previewLifecycle } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_gateway_lifecycle_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingGatewayLifecyclePreviewInput(params);
      await refreshProviderReadiness(input.providerId);
      const result = previewLifecycle(input);
      return {
        content: [{ type: "text", text: messagingGatewayLifecyclePreviewText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_gateway_lifecycle_preview",
          status: "complete",
          ...result,
        },
      };
    },
  });
}

export function messagingGatewayLifecyclePreviewInput(params: unknown): MessagingGatewayLifecyclePreviewInput {
  const raw = params as Record<string, unknown> | undefined;
  const action = optionalString(raw?.action);
  const providerId = optionalString(raw?.providerId);
  const mode = optionalString(raw?.mode);
  if (action !== "start" && action !== "stop") throw new Error("action must be start or stop.");
  if (!providerId) throw new Error("providerId is required.");
  if (mode && mode !== "synthetic" && mode !== "real") throw new Error("mode must be synthetic or real.");
  const parsedMode = mode as "synthetic" | "real" | undefined;
  return {
    action,
    providerId,
    ...(parsedMode ? { mode: parsedMode } : {}),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
