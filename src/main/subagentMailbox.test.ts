import { describe, expect, it } from "vitest";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
} from "../shared/types";
import {
  cancelPendingParentToChildMailboxEvents,
  consumeDeliveredParentToChildMailboxEvents,
  deliverQueuedParentToChildMailboxEvents,
  listSubagentMailboxEventsForDelivery,
  SUBAGENT_MAILBOX_DELIVERY_BATCH_SCHEMA_VERSION,
  type SubagentMailboxDeliveryStore,
} from "./subagentMailbox";

describe("subagentMailbox", () => {
  it("filters mailbox events by run, direction, type, and delivery state", () => {
    const store = new FakeMailboxStore([
      mailbox({ id: "queued-task", runId: "child-run", direction: "parent_to_child", type: "subagent.task", deliveryState: "queued" }),
      mailbox({ id: "delivered-task", runId: "child-run", direction: "parent_to_child", type: "subagent.task", deliveryState: "delivered" }),
      mailbox({ id: "queued-status", runId: "child-run", direction: "parent_to_child", type: "subagent.status", deliveryState: "queued" }),
      mailbox({ id: "child-reply", runId: "child-run", direction: "child_to_parent", type: "subagent.task", deliveryState: "queued" }),
      mailbox({ id: "other-run", runId: "other-child", direction: "parent_to_child", type: "subagent.task", deliveryState: "queued" }),
    ]);

    expect(listSubagentMailboxEventsForDelivery(store, {
      runId: "child-run",
      direction: "parent_to_child",
      type: "subagent.task",
      deliveryStates: ["queued"],
    }).map((event) => event.id)).toEqual(["queued-task"]);

    expect(listSubagentMailboxEventsForDelivery(store, {
      runId: "child-run",
      deliveryStates: ["queued", "delivered"],
    }).map((event) => event.id)).toEqual([
      "queued-task",
      "delivered-task",
      "queued-status",
      "child-reply",
    ]);
  });

  it("delivers queued parent-to-child events idempotently", () => {
    const store = new FakeMailboxStore([
      mailbox({ id: "queued-task", deliveryState: "queued" }),
      mailbox({ id: "delivered-task", deliveryState: "delivered" }),
      mailbox({ id: "consumed-task", deliveryState: "consumed" }),
      mailbox({ id: "child-reply", direction: "child_to_parent", deliveryState: "queued" }),
    ]);

    const result = deliverQueuedParentToChildMailboxEvents(store, {
      runId: "child-run",
      type: "subagent.task",
      now: "2026-06-06T00:00:05.000Z",
    });

    expect(SUBAGENT_MAILBOX_DELIVERY_BATCH_SCHEMA_VERSION).toBe("ambient-subagent-mailbox-delivery-batch-v1");
    expect(result).toMatchObject({
      schemaVersion: "ambient-subagent-mailbox-delivery-batch-v1",
      runId: "child-run",
      transitioned: [{ id: "queued-task", deliveryState: "delivered" }],
      unchanged: [{ id: "delivered-task", deliveryState: "delivered" }],
      events: [
        { id: "queued-task", deliveryState: "delivered" },
        { id: "delivered-task", deliveryState: "delivered" },
      ],
    });
    expect(store.updates).toEqual([
      {
        id: "queued-task",
        deliveryState: "delivered",
        options: { now: "2026-06-06T00:00:05.000Z" },
      },
    ]);
  });

  it("consumes delivered events and cancels pending parent-to-child events without touching terminal mailbox state", () => {
    const store = new FakeMailboxStore([
      mailbox({ id: "queued-task", deliveryState: "queued" }),
      mailbox({ id: "delivered-task", deliveryState: "delivered" }),
      mailbox({ id: "consumed-task", deliveryState: "consumed" }),
      mailbox({ id: "cancelled-task", deliveryState: "cancelled" }),
      mailbox({ id: "failed-task", deliveryState: "failed" }),
    ]);

    const consumeResult = consumeDeliveredParentToChildMailboxEvents(store, {
      runId: "child-run",
      type: "subagent.task",
      now: "2026-06-06T00:01:00.000Z",
    });
    expect(consumeResult).toMatchObject({
      transitioned: [{ id: "delivered-task", deliveryState: "consumed" }],
      unchanged: [{ id: "consumed-task", deliveryState: "consumed" }],
      events: [
        { id: "delivered-task", deliveryState: "consumed" },
        { id: "consumed-task", deliveryState: "consumed" },
      ],
    });

    const cancelResult = cancelPendingParentToChildMailboxEvents(store, {
      runId: "child-run",
      type: "subagent.task",
      now: "2026-06-06T00:02:00.000Z",
    });
    expect(cancelResult).toMatchObject({
      transitioned: [{ id: "queued-task", deliveryState: "cancelled" }],
      unchanged: [{ id: "cancelled-task", deliveryState: "cancelled" }],
      events: [
        { id: "queued-task", deliveryState: "cancelled" },
        { id: "cancelled-task", deliveryState: "cancelled" },
      ],
    });
    expect(store.events.get("delivered-task")?.deliveryState).toBe("consumed");
    expect(store.events.get("failed-task")?.deliveryState).toBe("failed");
  });
});

class FakeMailboxStore implements SubagentMailboxDeliveryStore {
  readonly events = new Map<string, SubagentMailboxEventSummary>();
  readonly updates: Array<{
    id: string;
    deliveryState: SubagentMailboxDeliveryState;
    options?: { now?: string; deliveredAt?: string | null };
  }> = [];

  constructor(events: SubagentMailboxEventSummary[]) {
    for (const event of events) this.events.set(event.id, event);
  }

  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[] {
    return [...this.events.values()].filter((event) => event.runId === runId);
  }

  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary {
    const existing = this.events.get(id);
    if (!existing) throw new Error(`Unknown mailbox event: ${id}`);
    this.updates.push({ id, deliveryState, ...(options ? { options } : {}) });
    const updated: SubagentMailboxEventSummary = {
      ...existing,
      deliveryState,
      ...(deliveryState === "delivered" ? { deliveredAt: options?.deliveredAt ?? options?.now ?? existing.deliveredAt } : {}),
    };
    this.events.set(id, updated);
    return updated;
  }
}

function mailbox(overrides: Partial<SubagentMailboxEventSummary> = {}): SubagentMailboxEventSummary {
  return {
    id: "mailbox-event",
    runId: "child-run",
    direction: "parent_to_child",
    type: "subagent.task",
    payload: { task: "inspect" },
    deliveryState: "queued",
    createdAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}
