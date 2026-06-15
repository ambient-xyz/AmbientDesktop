import { describe, expect, it } from "vitest";
import type {
  MessagingBindingDescriptor,
  MessagingGatewayOutboundDelivery,
  MessagingGatewayQueuedProjection,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
  RuntimeSurfaceRelaySummary,
} from "../shared/messagingGateway";
import {
  createMessagingRemoteSurfaceReplyTargetResolver,
  messagingRemoteSurfaceReplyInputFromParams,
  messagingRemoteSurfaceReplyTargetForInput,
} from "./agentRuntimeMessagingRemoteSurfaceReplyTarget";

describe("agentRuntimeMessagingRemoteSurfaceReplyTarget", () => {
  it("parses provider-neutral reply runtime event input", () => {
    expect(messagingRemoteSurfaceReplyInputFromParams({ runtimeEventId: " event-1 " })).toEqual({
      runtimeEventId: "event-1",
    });
    expect(() => messagingRemoteSurfaceReplyInputFromParams({ runtimeEventId: " " })).toThrow("runtimeEventId is required.");
    expect(() => messagingRemoteSurfaceReplyInputFromParams({})).toThrow("runtimeEventId is required.");
  });

  it("resolves Telegram reply targets from queued projections", () => {
    const target = messagingRemoteSurfaceReplyTargetForInput({ runtimeEventId: "event-1" }, {
      gatewayRuntimeStatus: status({
        remoteSurfaceRuntimeEvents: [runtimeEvent({
          id: "event-1",
          queuedProjectionId: "projection-1",
          bindingId: "binding-1",
        })],
        queuedProjections: [queuedProjection({
          id: "projection-1",
          providerId: "telegram-tdlib",
        })],
        remoteSurfaceRelaySummaries: [relaySummary({
          runtimeEventId: "event-1",
          targetProviderId: "signal-cli",
        })],
      }),
      bindings: [binding({
        id: "binding-1",
        providerId: "signal-cli",
      })],
    });

    expect(target).toMatchObject({
      input: { runtimeEventId: "event-1" },
      runtimeEvent: { id: "event-1" },
      queuedProjection: { id: "projection-1" },
      binding: { id: "binding-1" },
      providerId: "telegram-tdlib",
      providerLabel: "Telegram",
      blockers: [],
    });
  });

  it("prefers relay delivery provider over queued projection and relay summary fallbacks", () => {
    const target = messagingRemoteSurfaceReplyTargetForInput({ runtimeEventId: "event-2" }, {
      gatewayRuntimeStatus: status({
        remoteSurfaceRuntimeEvents: [runtimeEvent({
          id: "event-2",
          queuedProjectionId: "projection-2",
          relayDeliveryId: "delivery-2",
        })],
        queuedProjections: [queuedProjection({
          id: "projection-2",
          providerId: "telegram-tdlib",
        })],
        recentOutboundDeliveries: [delivery({
          id: "delivery-2",
          providerId: "signal-cli",
        })],
        remoteSurfaceRelaySummaries: [relaySummary({
          runtimeEventId: "event-2",
          targetProviderId: "telegram-tdlib",
        })],
      }),
      bindings: [],
    });

    expect(target.providerId).toBe("signal-cli");
    expect(target.providerLabel).toBe("Signal");
    expect(target.delivery).toMatchObject({ id: "delivery-2" });
    expect(target.blockers).toEqual([]);
  });

  it("creates a resolver from fresh runtime status and binding sources", () => {
    let statusReads = 0;
    let bindingReads = 0;
    const targetForInput = createMessagingRemoteSurfaceReplyTargetResolver({
      gatewayRuntimeStatus: () => {
        statusReads += 1;
        return status({
          remoteSurfaceRuntimeEvents: [runtimeEvent({
            id: "event-4",
            bindingId: "binding-4",
          })],
        });
      },
      listBindings: () => {
        bindingReads += 1;
        return [binding({
          id: "binding-4",
          providerId: "signal-cli",
        })];
      },
    });

    const target = targetForInput({ runtimeEventId: "event-4" });

    expect(statusReads).toBe(1);
    expect(bindingReads).toBe(1);
    expect(target).toMatchObject({
      runtimeEvent: { id: "event-4" },
      binding: { id: "binding-4" },
      providerId: "signal-cli",
      providerLabel: "Signal",
      blockers: [],
    });
  });

  it("blocks missing or unsupported provider targets", () => {
    const missing = messagingRemoteSurfaceReplyTargetForInput({ runtimeEventId: "missing-event" }, {
      gatewayRuntimeStatus: status(),
      bindings: [],
    });
    expect(missing.blockers).toEqual([
      "Remote Ambient Surface runtime event was not found in gateway status.",
      "Remote Ambient Surface runtime event does not resolve to a supported messaging provider route.",
    ]);

    const unsupported = messagingRemoteSurfaceReplyTargetForInput({ runtimeEventId: "event-3" }, {
      gatewayRuntimeStatus: status({
        remoteSurfaceRuntimeEvents: [runtimeEvent({
          id: "event-3",
          bindingId: "binding-3",
        })],
      }),
      bindings: [binding({
        id: "binding-3",
        providerId: "matrix-local",
      })],
    });
    expect(unsupported.providerId).toBe("matrix-local");
    expect(unsupported.providerLabel).toBe("matrix-local");
    expect(unsupported.blockers).toEqual([
      "Remote Ambient Surface reply alias does not support provider matrix-local.",
    ]);
  });
});

function status(input: Partial<MessagingGatewayRuntimeStatus> = {}): MessagingGatewayRuntimeStatus {
  return {
    status: "idle",
    providerCount: 0,
    activeProviderCount: 0,
    syntheticActiveProviderCount: 0,
    queuedProjectionCount: 0,
    recentEventCount: 0,
    outboundDeliveryCount: 0,
    providers: [],
    queuedProjections: [],
    recentOutboundDeliveries: [],
    recentEvents: [],
    ...input,
  };
}

function runtimeEvent(input: Partial<MessagingGatewayRemoteSurfaceRuntimeEvent> & { id: string }): MessagingGatewayRemoteSurfaceRuntimeEvent {
  const { id, ...rest } = input;
  return {
    id,
    kind: "active_project_switch",
    status: "completed",
    title: "Switch project",
    summary: "Project switched.",
    scheduledAt: "2026-06-11T00:00:00.000Z",
    relaySuggested: true,
    ...rest,
  };
}

function queuedProjection(input: Partial<MessagingGatewayQueuedProjection> & { id: string; providerId: string }): MessagingGatewayQueuedProjection {
  const { id, providerId, ...rest } = input;
  return {
    id,
    providerId,
    conversationId: "conversation-1",
    sourceEventId: "source-event-1",
    projection: {} as MessagingGatewayQueuedProjection["projection"],
    queuedAt: "2026-06-11T00:00:00.000Z",
    ...rest,
  };
}

function delivery(input: Partial<MessagingGatewayOutboundDelivery> & { id: string; providerId: string }): MessagingGatewayOutboundDelivery {
  const { id, providerId, ...rest } = input;
  return {
    id,
    providerId,
    conversationId: "conversation-1",
    status: "sent",
    textPreview: "Sent reply",
    textLength: 10,
    sentAt: "2026-06-11T00:00:01.000Z",
    ...rest,
  };
}

function relaySummary(input: Partial<RuntimeSurfaceRelaySummary> & { runtimeEventId: string }): RuntimeSurfaceRelaySummary {
  const { runtimeEventId, ...rest } = input;
  return {
    runtimeEventId,
    title: "Switch project",
    eventStatus: "completed",
    relayActionStatus: "preview-ready",
    relaySuggested: true,
    duplicateBlocked: false,
    summary: "Project switched.",
    nextAction: "Preview provider-neutral reply.",
    ...rest,
  };
}

function binding(input: Partial<MessagingBindingDescriptor> & { id: string; providerId: string }): MessagingBindingDescriptor {
  const { id, providerId, ...rest } = input;
  return {
    id,
    providerId,
    authProfileId: "owner-profile",
    conversationId: "conversation-1",
    purpose: "remote_ambient_surface",
    status: "active",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    ...rest,
  };
}
