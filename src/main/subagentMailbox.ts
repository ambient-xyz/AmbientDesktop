import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxDirection,
  SubagentMailboxEventSummary,
} from "../shared/types";

export const SUBAGENT_MAILBOX_DELIVERY_BATCH_SCHEMA_VERSION =
  "ambient-subagent-mailbox-delivery-batch-v1" as const;

export interface SubagentMailboxDeliveryStore {
  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[];
  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary;
}

export interface SubagentMailboxDeliverySelector {
  runId: string;
  direction?: SubagentMailboxDirection;
  type?: string;
  deliveryStates?: readonly SubagentMailboxDeliveryState[];
}

export interface SubagentMailboxDeliveryBatchResult {
  schemaVersion: typeof SUBAGENT_MAILBOX_DELIVERY_BATCH_SCHEMA_VERSION;
  runId: string;
  transitioned: SubagentMailboxEventSummary[];
  unchanged: SubagentMailboxEventSummary[];
  events: SubagentMailboxEventSummary[];
}

export function listSubagentMailboxEventsForDelivery(
  store: Pick<SubagentMailboxDeliveryStore, "listSubagentMailboxEvents">,
  selector: SubagentMailboxDeliverySelector,
): SubagentMailboxEventSummary[] {
  const states = selector.deliveryStates ? new Set(selector.deliveryStates) : undefined;
  return store.listSubagentMailboxEvents(selector.runId).filter((event) => {
    if (selector.direction && event.direction !== selector.direction) return false;
    if (selector.type && event.type !== selector.type) return false;
    if (states && !states.has(event.deliveryState)) return false;
    return true;
  });
}

export function deliverQueuedParentToChildMailboxEvents(
  store: SubagentMailboxDeliveryStore,
  input: {
    runId: string;
    type?: string;
    now?: string;
  },
): SubagentMailboxDeliveryBatchResult {
  const events = listSubagentMailboxEventsForDelivery(store, {
    runId: input.runId,
    direction: "parent_to_child",
    type: input.type,
    deliveryStates: ["queued", "delivered"],
  });
  return transitionMailboxEvents(store, input.runId, events, "delivered", input.now);
}

export function consumeDeliveredParentToChildMailboxEvents(
  store: SubagentMailboxDeliveryStore,
  input: {
    runId: string;
    type?: string;
    now?: string;
  },
): SubagentMailboxDeliveryBatchResult {
  const events = listSubagentMailboxEventsForDelivery(store, {
    runId: input.runId,
    direction: "parent_to_child",
    type: input.type,
    deliveryStates: ["delivered", "consumed"],
  });
  return transitionMailboxEvents(store, input.runId, events, "consumed", input.now);
}

export function cancelPendingParentToChildMailboxEvents(
  store: SubagentMailboxDeliveryStore,
  input: {
    runId: string;
    type?: string;
    now?: string;
  },
): SubagentMailboxDeliveryBatchResult {
  const events = listSubagentMailboxEventsForDelivery(store, {
    runId: input.runId,
    direction: "parent_to_child",
    type: input.type,
    deliveryStates: ["queued", "delivered", "cancelled"],
  });
  return transitionMailboxEvents(store, input.runId, events, "cancelled", input.now);
}

function transitionMailboxEvents(
  store: SubagentMailboxDeliveryStore,
  runId: string,
  events: SubagentMailboxEventSummary[],
  deliveryState: SubagentMailboxDeliveryState,
  now?: string,
): SubagentMailboxDeliveryBatchResult {
  const transitioned: SubagentMailboxEventSummary[] = [];
  const unchanged: SubagentMailboxEventSummary[] = [];
  const nextEvents = events.map((event) => {
    if (event.deliveryState === deliveryState) {
      unchanged.push(event);
      return event;
    }
    const updated = store.updateSubagentMailboxEventDeliveryState(event.id, deliveryState, { now });
    transitioned.push(updated);
    return updated;
  });
  return {
    schemaVersion: SUBAGENT_MAILBOX_DELIVERY_BATCH_SCHEMA_VERSION,
    runId,
    transitioned,
    unchanged,
    events: nextEvents,
  };
}
