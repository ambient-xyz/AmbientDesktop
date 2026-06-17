import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingInboundEvent } from "../../../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { MessagingBindingStore } from "../../messagingBindings";
import type { MessagingGatewayRunner } from "../../messagingGatewayRunner";
import { messagingProjectionText } from "../../messagingGatewayProjection";
import type { RuntimeSurfaceSnapshot } from "../../runtimeSurfaceSnapshot";

export interface MessagingSyntheticRouteToolRegistrationOptions {
  bindings: MessagingBindingStore;
  gatewayRunner: Pick<MessagingGatewayRunner, "dispatchSynthetic">;
  runtimeSurfaceSnapshot: () => RuntimeSurfaceSnapshot;
}

export function registerMessagingSyntheticRouteTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingSyntheticRouteToolRegistrationOptions,
): void {
  const { bindings, gatewayRunner, runtimeSurfaceSnapshot } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_synthetic_route"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const routeInput = messagingSyntheticRouteInput(params);
      const snapshot = runtimeSurfaceSnapshot();
      const result = gatewayRunner.dispatchSynthetic({
        event: routeInput,
        bindings: bindings.list({ includeInactive: false }),
        surface: snapshot,
      });
      return {
        content: [{ type: "text", text: messagingProjectionText(result.projection) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_synthetic_route",
          status: "complete",
          ...result,
        },
      };
    },
  });
}

function messagingSyntheticRouteInput(params: unknown): MessagingInboundEvent {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId);
  const conversationId = optionalString(raw?.conversationId);
  const senderId = optionalString(raw?.senderId);
  const text = typeof raw?.text === "string" ? raw.text : undefined;
  if (!providerId) throw new Error("providerId is required.");
  if (!conversationId) throw new Error("conversationId is required.");
  if (!senderId) throw new Error("senderId is required.");
  if (text === undefined) throw new Error("text is required.");
  return {
    id: `synthetic-${Date.now()}`,
    providerId,
    conversationId,
    threadId: optionalString(raw?.threadId),
    sender: {
      id: senderId,
      label: optionalString(raw?.senderLabel),
    },
    text,
    receivedAt: new Date().toISOString(),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
