import { describe, expect, it } from "vitest";

import type {
  MessagingBindingDescriptor,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
} from "../shared/messagingGateway";
import { messagingGatewayStatusWithRemoteSurfaceRuntimeEvents } from "./messagingRelayStatus";

describe("messagingRelayStatus", () => {
  it("adds Remote Ambient Surface runtime event counts and relay summaries to gateway status", () => {
    const completedEvent = runtimeEvent({
      id: "event-completed",
      status: "completed",
      title: "Switch to Research project",
      summary: "Active Ambient project switched to Research project.",
      projectName: "Research project",
      bindingId: "binding-1",
      sourceEventId: "provider-event-1",
      completedAt: "2026-06-11T00:00:01.000Z",
      relaySuggested: true,
    });
    const pendingEvent = runtimeEvent({
      id: "event-pending",
      status: "pending",
      title: "Switch to Pending project",
      summary: "Active Ambient project switch is pending.",
      projectName: "Pending project",
      relaySuggested: false,
    });

    const result = messagingGatewayStatusWithRemoteSurfaceRuntimeEvents(runtimeStatus(), {
      events: [completedEvent, pendingEvent],
      bindings: [remoteSurfaceBinding()],
    });

    expect(result.pendingRemoteSurfaceRuntimeEventCount).toBe(1);
    expect(result.recentRemoteSurfaceRuntimeEventCount).toBe(2);
    expect(result.relayableRemoteSurfaceRuntimeEventCount).toBe(1);
    expect(result.alreadyRelayedRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.remoteSurfaceRuntimeEvents).toHaveLength(2);
    expect(result.remoteSurfaceRuntimeEvents?.[0]).toEqual(completedEvent);
    expect(result.remoteSurfaceRuntimeEvents?.[0]).not.toBe(completedEvent);
    expect(result.remoteSurfaceRelaySummaries).toMatchObject([
      {
        runtimeEventId: "event-completed",
        relayActionStatus: "preview-ready",
        duplicateBlocked: false,
        targetProviderId: "telegram-tdlib",
        previewToolName: "ambient_messaging_remote_surface_reply_preview",
        applyToolName: "ambient_messaging_remote_surface_reply_apply",
      },
      {
        runtimeEventId: "event-pending",
        relayActionStatus: "waiting",
        duplicateBlocked: false,
      },
    ]);
  });

  it("keeps empty Remote Ambient Surface runtime event status counts explicit", () => {
    const result = messagingGatewayStatusWithRemoteSurfaceRuntimeEvents(runtimeStatus(), {
      events: [],
    });

    expect(result.pendingRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.recentRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.relayableRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.alreadyRelayedRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.remoteSurfaceRuntimeEvents).toBeUndefined();
    expect(result.remoteSurfaceRelaySummaries).toBeUndefined();
  });
});

function runtimeStatus(): MessagingGatewayRuntimeStatus {
  return {
    status: "idle",
    providerCount: 1,
    activeProviderCount: 1,
    syntheticActiveProviderCount: 0,
    queuedProjectionCount: 0,
    recentEventCount: 0,
    outboundDeliveryCount: 0,
    providers: [],
    queuedProjections: [],
    recentOutboundDeliveries: [],
    recentEvents: [],
  };
}

function runtimeEvent(overrides: Partial<MessagingGatewayRemoteSurfaceRuntimeEvent>): MessagingGatewayRemoteSurfaceRuntimeEvent {
  return {
    id: "event-1",
    kind: "active_project_switch",
    status: "completed",
    title: "Switch to Research project",
    summary: "Active Ambient project switched to Research project.",
    scheduledAt: "2026-06-11T00:00:00.000Z",
    relaySuggested: true,
    ...overrides,
  };
}

function remoteSurfaceBinding(): MessagingBindingDescriptor {
  return {
    id: "binding-1",
    providerId: "telegram-tdlib",
    authProfileId: "owner-profile",
    conversationId: "owner-chat",
    purpose: "remote_ambient_surface",
    status: "active",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
  };
}
