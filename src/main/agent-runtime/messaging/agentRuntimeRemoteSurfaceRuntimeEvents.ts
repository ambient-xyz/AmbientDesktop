import { createHash } from "node:crypto";

import type {
  MessagingBindingDescriptor,
  MessagingGatewayOutboundDelivery,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
} from "../../../shared/messagingGateway";
import { messagingGatewayStatusWithRemoteSurfaceRuntimeEvents } from "../../messaging/messagingRelayStatus";
import { remoteSurfaceRuntimeEventRelayPatch } from "../../messaging/messagingRuntimeEventRelay";

export type AgentRuntimeRemoteSurfaceRuntimeEventCreateInput =
  Omit<MessagingGatewayRemoteSurfaceRuntimeEvent, "id" | "scheduledAt"> & { scheduledAt?: string };

export type AgentRuntimeRemoteSurfaceRuntimeEventPatch =
  Partial<Omit<MessagingGatewayRemoteSurfaceRuntimeEvent, "id" | "kind" | "scheduledAt">>;

export interface AgentRuntimeRemoteSurfaceRuntimeEventRecordOptions {
  events: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  input: AgentRuntimeRemoteSurfaceRuntimeEventCreateInput;
  now?: () => string;
  maxEvents?: number;
}

export interface AgentRuntimeRemoteSurfaceRuntimeEventRelayMarkInput {
  applyStatus: "sent" | "blocked" | "denied" | "failed";
  providerId: string;
  delivery: MessagingGatewayOutboundDelivery;
  runtimeEvent?: MessagingGatewayRemoteSurfaceRuntimeEvent;
}

export interface AgentRuntimeRemoteSurfaceGatewayStatusOptions {
  status: MessagingGatewayRuntimeStatus;
  events: readonly MessagingGatewayRemoteSurfaceRuntimeEvent[];
  listRemoteSurfaceBindings: () => MessagingBindingDescriptor[];
}

export interface AgentRuntimeRemoteSurfaceRuntimeEventStoreOptions {
  listRemoteSurfaceBindings: () => MessagingBindingDescriptor[];
  now?: () => string;
  maxEvents?: number;
}

export class AgentRuntimeRemoteSurfaceRuntimeEventStore {
  private readonly events: MessagingGatewayRemoteSurfaceRuntimeEvent[] = [];

  constructor(private readonly options: AgentRuntimeRemoteSurfaceRuntimeEventStoreOptions) {}

  record(input: AgentRuntimeRemoteSurfaceRuntimeEventCreateInput): MessagingGatewayRemoteSurfaceRuntimeEvent {
    return recordAgentRuntimeRemoteSurfaceRuntimeEvent({
      events: this.events,
      input,
      ...(this.options.now ? { now: this.options.now } : {}),
      ...(this.options.maxEvents !== undefined ? { maxEvents: this.options.maxEvents } : {}),
    });
  }

  update(eventId: string, patch: AgentRuntimeRemoteSurfaceRuntimeEventPatch): boolean {
    return updateAgentRuntimeRemoteSurfaceRuntimeEvent(this.events, eventId, patch);
  }

  markRelay(input: AgentRuntimeRemoteSurfaceRuntimeEventRelayMarkInput): boolean {
    return markAgentRuntimeRemoteSurfaceRuntimeEventRelay(this.events, input);
  }

  status(status: MessagingGatewayRuntimeStatus): MessagingGatewayRuntimeStatus {
    return agentRuntimeMessagingGatewayStatusWithRemoteSurfaceEvents({
      status,
      events: this.events,
      listRemoteSurfaceBindings: this.options.listRemoteSurfaceBindings,
    });
  }
}

export function recordAgentRuntimeRemoteSurfaceRuntimeEvent(
  options: AgentRuntimeRemoteSurfaceRuntimeEventRecordOptions,
): MessagingGatewayRemoteSurfaceRuntimeEvent {
  const scheduledAt = options.input.scheduledAt ?? options.now?.() ?? new Date().toISOString();
  const hash = createHash("sha256")
    .update(`${options.input.kind}:${options.input.title}:${scheduledAt}:${options.events.length}`)
    .digest("hex")
    .slice(0, 12);
  const event: MessagingGatewayRemoteSurfaceRuntimeEvent = {
    ...options.input,
    id: `remote-surface-${hash}`,
    scheduledAt,
  };
  options.events.push(event);
  const maxEvents = options.maxEvents ?? 20;
  while (options.events.length > maxEvents) options.events.shift();
  return { ...event };
}

export function updateAgentRuntimeRemoteSurfaceRuntimeEvent(
  events: MessagingGatewayRemoteSurfaceRuntimeEvent[],
  eventId: string,
  patch: AgentRuntimeRemoteSurfaceRuntimeEventPatch,
): boolean {
  const index = events.findIndex((event) => event.id === eventId);
  if (index < 0) return false;
  events[index] = {
    ...events[index]!,
    ...patch,
  };
  return true;
}

export function markAgentRuntimeRemoteSurfaceRuntimeEventRelay(
  events: MessagingGatewayRemoteSurfaceRuntimeEvent[],
  input: AgentRuntimeRemoteSurfaceRuntimeEventRelayMarkInput,
): boolean {
  const eventId = input.runtimeEvent?.id;
  if (!eventId) return false;
  const current = events.find((event) => event.id === eventId);
  if (current?.relayStatus === "sent" && input.applyStatus !== "sent") return false;
  return updateAgentRuntimeRemoteSurfaceRuntimeEvent(
    events,
    eventId,
    remoteSurfaceRuntimeEventRelayPatch(input),
  );
}

export function agentRuntimeMessagingGatewayStatusWithRemoteSurfaceEvents(
  options: AgentRuntimeRemoteSurfaceGatewayStatusOptions,
): MessagingGatewayRuntimeStatus {
  const remoteSurfaceBindings = options.events.length
    ? options.listRemoteSurfaceBindings()
    : [];
  return messagingGatewayStatusWithRemoteSurfaceRuntimeEvents(options.status, {
    events: options.events,
    bindings: remoteSurfaceBindings,
  });
}
