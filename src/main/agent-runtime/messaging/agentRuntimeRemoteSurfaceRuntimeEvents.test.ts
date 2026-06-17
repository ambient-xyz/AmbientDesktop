import { describe, expect, it, vi } from "vitest";

import type {
  MessagingBindingDescriptor,
  MessagingGatewayOutboundDelivery,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
} from "../../../shared/messagingGateway";
import {
  AgentRuntimeRemoteSurfaceRuntimeEventStore,
  agentRuntimeMessagingGatewayStatusWithRemoteSurfaceEvents,
  markAgentRuntimeRemoteSurfaceRuntimeEventRelay,
  recordAgentRuntimeRemoteSurfaceRuntimeEvent,
  updateAgentRuntimeRemoteSurfaceRuntimeEvent,
} from "./agentRuntimeRemoteSurfaceRuntimeEvents";

describe("agentRuntimeRemoteSurfaceRuntimeEvents", () => {
  it("records remote-surface runtime events with deterministic ids and cloned returns", () => {
    const events: MessagingGatewayRemoteSurfaceRuntimeEvent[] = [];

    const recorded = recordAgentRuntimeRemoteSurfaceRuntimeEvent({
      events,
      input: runtimeEventInput(),
    });

    expect(recorded).toEqual({
      ...runtimeEventInput(),
      id: "remote-surface-1336ec5d84a8",
    });
    expect(events).toEqual([recorded]);
    expect(recorded).not.toBe(events[0]);
  });

  it("uses the current store length when deriving event ids", () => {
    const events: MessagingGatewayRemoteSurfaceRuntimeEvent[] = [runtimeEvent({
      id: "remote-surface-existing",
    })];

    const recorded = recordAgentRuntimeRemoteSurfaceRuntimeEvent({
      events,
      input: runtimeEventInput(),
    });

    expect(recorded.id).toBe("remote-surface-ebfdb2e682fb");
    expect(events.map((event) => event.id)).toEqual([
      "remote-surface-existing",
      "remote-surface-ebfdb2e682fb",
    ]);
  });

  it("defaults scheduledAt from now and caps retained events", () => {
    const events: MessagingGatewayRemoteSurfaceRuntimeEvent[] = [
      runtimeEvent({ id: "event-1" }),
      runtimeEvent({ id: "event-2" }),
    ];
    const recorded = recordAgentRuntimeRemoteSurfaceRuntimeEvent({
      events,
      input: runtimeEventInputWithoutScheduledAt(),
      now: () => "2026-06-11T00:00:05.000Z",
      maxEvents: 2,
    });

    expect(recorded.scheduledAt).toBe("2026-06-11T00:00:05.000Z");
    expect(events.map((event) => event.id)).toEqual([
      "event-2",
      recorded.id,
    ]);
  });

  it("updates matching remote-surface runtime events without changing identity fields", () => {
    const events = [runtimeEvent({
      status: "pending",
      relaySuggested: false,
    })];

    const updated = updateAgentRuntimeRemoteSurfaceRuntimeEvent(events, "remote-surface-event", {
      status: "completed",
      summary: "Switch completed.",
      completedAt: "2026-06-11T00:00:05.000Z",
      relaySuggested: true,
    });

    expect(updated).toBe(true);
    expect(events[0]).toEqual({
      ...runtimeEvent({
        status: "completed",
        relaySuggested: true,
      }),
      summary: "Switch completed.",
      completedAt: "2026-06-11T00:00:05.000Z",
    });
  });

  it("ignores missing remote-surface runtime event updates", () => {
    const events = [runtimeEvent()];

    const updated = updateAgentRuntimeRemoteSurfaceRuntimeEvent(events, "missing-event", {
      status: "completed",
    });

    expect(updated).toBe(false);
    expect(events).toEqual([runtimeEvent()]);
  });

  it("marks remote-surface runtime events as relayed after sent deliveries", () => {
    const events = [runtimeEvent({
      relaySuggested: true,
    })];

    const updated = markAgentRuntimeRemoteSurfaceRuntimeEventRelay(events, {
      applyStatus: "sent",
      providerId: "telegram-tdlib",
      delivery: outboundDelivery({
        id: "delivery-1",
        sentAt: "2026-06-11T00:00:05.000Z",
      }),
      runtimeEvent: events[0],
    });

    expect(updated).toBe(true);
    expect(events[0]).toMatchObject({
      relayStatus: "sent",
      relayProviderId: "telegram-tdlib",
      relayDeliveryId: "delivery-1",
      relayedAt: "2026-06-11T00:00:05.000Z",
      relaySuggested: false,
    });
  });

  it("does not downgrade already-sent relay status after later failed deliveries", () => {
    const events = [runtimeEvent({
      relayStatus: "sent",
      relayProviderId: "telegram-tdlib",
      relayDeliveryId: "delivery-sent",
      relayedAt: "2026-06-11T00:00:05.000Z",
      relaySuggested: false,
    })];

    const updated = markAgentRuntimeRemoteSurfaceRuntimeEventRelay(events, {
      applyStatus: "failed",
      providerId: "telegram-tdlib",
      delivery: outboundDelivery({
        id: "delivery-failed",
        sentAt: "2026-06-11T00:00:06.000Z",
        error: "Provider rejected the relay.",
      }),
      runtimeEvent: events[0],
    });

    expect(updated).toBe(false);
    expect(events[0]).toMatchObject({
      relayStatus: "sent",
      relayProviderId: "telegram-tdlib",
      relayDeliveryId: "delivery-sent",
      relayedAt: "2026-06-11T00:00:05.000Z",
      relaySuggested: false,
    });
    expect(events[0]?.relayError).toBeUndefined();
  });

  it("ignores relay marks without a matching remote-surface runtime event", () => {
    const events = [runtimeEvent()];

    expect(markAgentRuntimeRemoteSurfaceRuntimeEventRelay(events, {
      applyStatus: "sent",
      providerId: "signal-cli",
      delivery: outboundDelivery(),
    })).toBe(false);

    expect(markAgentRuntimeRemoteSurfaceRuntimeEventRelay(events, {
      applyStatus: "sent",
      providerId: "signal-cli",
      delivery: outboundDelivery(),
      runtimeEvent: runtimeEvent({ id: "missing-event" }),
    })).toBe(false);

    expect(events).toEqual([runtimeEvent()]);
  });

  it("adds remote-surface event status without listing bindings when no events exist", () => {
    const listRemoteSurfaceBindings = vi.fn(() => [remoteSurfaceBinding()]);

    const result = agentRuntimeMessagingGatewayStatusWithRemoteSurfaceEvents({
      status: runtimeStatus(),
      events: [],
      listRemoteSurfaceBindings,
    });

    expect(listRemoteSurfaceBindings).not.toHaveBeenCalled();
    expect(result.pendingRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.recentRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.relayableRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.alreadyRelayedRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.remoteSurfaceRuntimeEvents).toBeUndefined();
    expect(result.remoteSurfaceRelaySummaries).toBeUndefined();
  });

  it("lists remote-surface bindings when runtime events can produce relay summaries", () => {
    const listRemoteSurfaceBindings = vi.fn(() => [remoteSurfaceBinding()]);

    const result = agentRuntimeMessagingGatewayStatusWithRemoteSurfaceEvents({
      status: runtimeStatus(),
      events: [runtimeEvent({
        bindingId: "binding-1",
        relaySuggested: true,
        status: "completed",
      })],
      listRemoteSurfaceBindings,
    });

    expect(listRemoteSurfaceBindings).toHaveBeenCalledTimes(1);
    expect(result.pendingRemoteSurfaceRuntimeEventCount).toBe(0);
    expect(result.recentRemoteSurfaceRuntimeEventCount).toBe(1);
    expect(result.relayableRemoteSurfaceRuntimeEventCount).toBe(1);
    expect(result.remoteSurfaceRelaySummaries).toMatchObject([{
      runtimeEventId: "remote-surface-event",
      relayActionStatus: "preview-ready",
      targetProviderId: "telegram-tdlib",
      previewToolName: "ambient_messaging_remote_surface_reply_preview",
      applyToolName: "ambient_messaging_remote_surface_reply_apply",
    }]);
  });

  it("stores remote-surface runtime events behind the AgentRuntime bridge", () => {
    const listRemoteSurfaceBindings = vi.fn(() => [remoteSurfaceBinding()]);
    const store = new AgentRuntimeRemoteSurfaceRuntimeEventStore({
      listRemoteSurfaceBindings,
      now: () => "2026-06-11T00:00:05.000Z",
    });

    const recorded = store.record({
      ...runtimeEventInputWithoutScheduledAt(),
      status: "completed",
      relaySuggested: true,
    });
    expect(recorded.scheduledAt).toBe("2026-06-11T00:00:05.000Z");

    expect(store.update(recorded.id, {
      summary: "Project switch completed.",
    })).toBe(true);
    expect(store.markRelay({
      applyStatus: "sent",
      providerId: "telegram-tdlib",
      delivery: outboundDelivery(),
      runtimeEvent: recorded,
    })).toBe(true);

    const status = store.status(runtimeStatus());

    expect(listRemoteSurfaceBindings).toHaveBeenCalledTimes(1);
    expect(status.remoteSurfaceRuntimeEvents).toMatchObject([{
      id: recorded.id,
      summary: "Project switch completed.",
      relayStatus: "sent",
      relaySuggested: false,
    }]);
    expect(store.update("missing-event", { status: "failed" })).toBe(false);
  });
});

function runtimeEventInput(
  overrides: Partial<Omit<MessagingGatewayRemoteSurfaceRuntimeEvent, "id" | "scheduledAt"> & { scheduledAt?: string }> = {},
) {
  return {
    kind: "active_project_switch" as const,
    status: "pending" as const,
    title: "Switch to Research project",
    summary: "Active Ambient project switch to Research project is being applied now.",
    scheduledAt: "2026-06-11T00:00:00.000Z",
    threadId: "thread-1",
    queuedProjectionId: "projection-switch",
    sourceEventId: "source-event-1",
    bindingId: "binding-1",
    projectName: "Research project",
    relaySuggested: false,
    ...overrides,
  };
}

function runtimeEventInputWithoutScheduledAt() {
  return {
    kind: "active_project_switch" as const,
    status: "pending" as const,
    title: "Switch to Research project",
    summary: "Active Ambient project switch to Research project is being applied now.",
    threadId: "thread-1",
    queuedProjectionId: "projection-switch",
    sourceEventId: "source-event-1",
    bindingId: "binding-1",
    projectName: "Research project",
    relaySuggested: false,
  };
}

function runtimeEvent(overrides: Partial<MessagingGatewayRemoteSurfaceRuntimeEvent> = {}): MessagingGatewayRemoteSurfaceRuntimeEvent {
  return {
    ...runtimeEventInput(),
    id: "remote-surface-event",
    ...overrides,
  };
}

function outboundDelivery(overrides: Partial<MessagingGatewayOutboundDelivery> = {}): MessagingGatewayOutboundDelivery {
  return {
    id: "delivery-1",
    providerId: "telegram-tdlib",
    conversationId: "owner-chat",
    status: "sent",
    textPreview: "Relay preview.",
    textLength: 14,
    sentAt: "2026-06-11T00:00:05.000Z",
    ...overrides,
  };
}

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
