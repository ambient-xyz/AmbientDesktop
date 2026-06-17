import { describe, expect, it } from "vitest";

import type {
  MessagingGatewayOutboundDelivery,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
} from "../../shared/messagingGateway";
import {
  remoteSurfaceRuntimeEventRelayPatch,
  runtimeEventRelayText,
} from "./messagingRuntimeEventRelay";

describe("messagingRuntimeEventRelay", () => {
  it("formats active project switch relay text", () => {
    expect(runtimeEventRelayText(runtimeEvent({
      status: "completed",
      projectName: "Research project",
    }))).toBe("Ambient switched the active project to Research project.");
    expect(runtimeEventRelayText(runtimeEvent({
      status: "failed",
      error: "Switch failed.",
    }))).toBe("Ambient could not switch the active project: Switch failed.");
    expect(runtimeEventRelayText(runtimeEvent({
      status: "pending",
      projectName: "Research project",
    }))).toBe("Ambient is still switching the active project to Research project.");
  });

  it("builds relay status patches from outbound deliveries", () => {
    expect(remoteSurfaceRuntimeEventRelayPatch({
      applyStatus: "sent",
      providerId: "telegram-tdlib",
      delivery: outboundDelivery({
        id: "delivery-1",
        sentAt: "2026-06-11T00:00:00.000Z",
      }),
    })).toEqual({
      relayStatus: "sent",
      relayProviderId: "telegram-tdlib",
      relayDeliveryId: "delivery-1",
      relayedAt: "2026-06-11T00:00:00.000Z",
      relaySuggested: false,
    });

    expect(remoteSurfaceRuntimeEventRelayPatch({
      applyStatus: "failed",
      providerId: "signal-cli",
      delivery: outboundDelivery({
        id: "delivery-2",
        sentAt: "2026-06-11T00:00:01.000Z",
        error: "Provider rejected the reply.",
      }),
    })).toEqual({
      relayStatus: "failed",
      relayProviderId: "signal-cli",
      relayDeliveryId: "delivery-2",
      relayedAt: "2026-06-11T00:00:01.000Z",
      relayError: "Provider rejected the reply.",
      relaySuggested: true,
    });
  });
});

function runtimeEvent(overrides: Partial<MessagingGatewayRemoteSurfaceRuntimeEvent>): MessagingGatewayRemoteSurfaceRuntimeEvent {
  return {
    id: "event-1",
    kind: "active_project_switch",
    status: "completed",
    title: "Switch to Research project",
    summary: "Switch summary.",
    scheduledAt: "2026-06-11T00:00:00.000Z",
    relaySuggested: true,
    ...overrides,
  };
}

function outboundDelivery(overrides: Partial<MessagingGatewayOutboundDelivery>): MessagingGatewayOutboundDelivery {
  return {
    id: "delivery-1",
    providerId: "telegram-tdlib",
    conversationId: "owner-chat",
    status: "sent",
    textPreview: "Reply preview.",
    textLength: 14,
    sentAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}
