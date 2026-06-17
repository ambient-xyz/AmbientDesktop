import { describe, expect, it, vi } from "vitest";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import {
  evaluateSubagentTurnBudgetForEvents,
  type SubagentTurnBudgetState,
} from "../../shared/subagentTurnBudget";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
} from "../../shared/types";
import {
  buildSubagentTurnBudgetWrapUpSteeringMessage,
  recordSubagentTurnBudgetWrapUpSteeringIfNeeded,
  shouldRecordSubagentTurnBudgetWrapUpSteering,
  SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION,
  SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON,
  SUBAGENT_TURN_BUDGET_WRAP_UP_TOOL_CALL_ID,
  type SubagentTurnBudgetWrapUpRecorderStore,
} from "./subagentTurnBudgetWrapUpRecorder";

describe("subagentTurnBudgetWrapUpRecorder", () => {
  it("queues one durable child follow-up when the turn budget reaches the wrap-up threshold", () => {
    const active = run({ status: "running" });
    const store = new FakeTurnBudgetWrapUpStore(active);
    for (let index = 0; index < 7; index += 1) {
      store.appendSubagentRunEvent(active.id, startedTurnEventInput());
    }
    const turnBudgetState = evaluateSubagentTurnBudgetForEvents({
      role: active.roleProfileSnapshot,
      events: store.listSubagentRunEvents(active.id),
    });

    const record = recordSubagentTurnBudgetWrapUpSteeringIfNeeded({
      store,
      run: active,
      turnBudgetState,
      createdAt: "2026-06-07T00:00:00.000Z",
    });

    expect(SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION)
      .toBe("ambient-subagent-turn-budget-wrap-up-recorder-v1");
    expect(record).toMatchObject({
      schemaVersion: SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION,
      replay: false,
      mailboxEvent: {
        id: "mailbox-1",
        runId: active.id,
        direction: "parent_to_child",
        type: "subagent.followup",
        deliveryState: "queued",
      },
      runEvent: {
        runId: active.id,
        type: "subagent.followup_agent.queued",
      },
    });
    expect(record?.idempotencyKey).toContain("subagent:turn-budget-wrap-up:");
    expect(record?.message).toContain("Turn-budget wrap-up for root/0:explorer.");
    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledWith(active.id, {
      direction: "parent_to_child",
      type: "subagent.followup",
      payload: expect.objectContaining({
        schemaVersion: "ambient-subagent-child-mailbox-request-v1",
        action: "followup_agent",
        toolCallId: SUBAGENT_TURN_BUDGET_WRAP_UP_TOOL_CALL_ID,
        steeringReason: SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON,
        turnBudgetState: expect.objectContaining({
          state: "wrap_up_due",
          observedTurnCount: 7,
          policy: expect.objectContaining({
            maxTurns: 8,
            wrapUpAtTurn: 7,
          }),
        }),
      }),
      createdAt: "2026-06-07T00:00:00.000Z",
    });
    expect(store.appendSubagentRunEvent).toHaveBeenLastCalledWith(active.id, {
      type: "subagent.followup_agent.queued",
      preview: expect.objectContaining({
        steeringSchemaVersion: SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION,
        steeringReason: SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON,
        mailboxEventId: "mailbox-1",
        turnBudgetState: expect.objectContaining({ state: "wrap_up_due" }),
      }),
      createdAt: "2026-06-07T00:00:00.000Z",
    });
  });

  it("replays existing wrap-up steering without duplicating mailbox or run events", () => {
    const active = run({ status: "running" });
    const store = new FakeTurnBudgetWrapUpStore(active);
    for (let index = 0; index < 7; index += 1) {
      store.appendSubagentRunEvent(active.id, startedTurnEventInput());
    }
    const turnBudgetState = evaluateSubagentTurnBudgetForEvents({
      role: active.roleProfileSnapshot,
      events: store.listSubagentRunEvents(active.id),
    });

    const first = recordSubagentTurnBudgetWrapUpSteeringIfNeeded({ store, run: active, turnBudgetState });
    const second = recordSubagentTurnBudgetWrapUpSteeringIfNeeded({ store, run: active, turnBudgetState });

    expect(first?.replay).toBe(false);
    expect(second).toMatchObject({
      replay: true,
      idempotencyKey: first?.idempotencyKey,
      mailboxEvent: { id: first?.mailboxEvent?.id },
      runEvent: { sequence: first?.runEvent?.sequence },
    });
    expect(store.listSubagentMailboxEvents(active.id).filter((event) => event.type === "subagent.followup")).toHaveLength(1);
    expect(store.listSubagentRunEvents(active.id).filter((event) => event.type === "subagent.followup_agent.queued")).toHaveLength(1);
  });

  it("does not steer terminal, closed, non-due, or exhausted child runs", () => {
    const active = run({ status: "running" });
    const store = new FakeTurnBudgetWrapUpStore(active);
    const withinBudget = evaluateSubagentTurnBudgetForEvents({
      role: active.roleProfileSnapshot,
      events: [],
    });
    const exhaustedEvents = Array.from({ length: 8 }, () => completedTurnEvent());
    const exhausted = evaluateSubagentTurnBudgetForEvents({
      role: active.roleProfileSnapshot,
      events: exhaustedEvents,
    });
    const wrapUpDue = {
      ...withinBudget,
      shouldSteerWrapUp: true,
      exhausted: false,
    } as SubagentTurnBudgetState;

    expect(shouldRecordSubagentTurnBudgetWrapUpSteering(active, withinBudget)).toBe(false);
    expect(shouldRecordSubagentTurnBudgetWrapUpSteering(active, exhausted)).toBe(false);
    expect(shouldRecordSubagentTurnBudgetWrapUpSteering(run({ status: "completed" }), wrapUpDue)).toBe(false);
    expect(shouldRecordSubagentTurnBudgetWrapUpSteering({ ...active, closedAt: "2026-06-07T00:00:00.000Z" }, wrapUpDue)).toBe(false);
    expect(recordSubagentTurnBudgetWrapUpSteeringIfNeeded({ store, run: active, turnBudgetState: withinBudget })).toBeUndefined();
    expect(recordSubagentTurnBudgetWrapUpSteeringIfNeeded({ store, run: active, turnBudgetState: exhausted })).toBeUndefined();
  });

  it("builds explicit wrap-up instructions with partial-result semantics", () => {
    const active = run({ status: "running" });
    const state = evaluateSubagentTurnBudgetForEvents({
      role: active.roleProfileSnapshot,
      events: Array.from({ length: 7 }, () => startedTurnEvent()),
    });

    expect(buildSubagentTurnBudgetWrapUpSteeringMessage({
      run: active,
      turnBudgetState: state,
    })).toContain("return an honest partial result with evidence and open questions");
  });
});

class FakeTurnBudgetWrapUpStore implements SubagentTurnBudgetWrapUpRecorderStore {
  readonly runEvents = new Map<string, SubagentRunEventSummary[]>();
  readonly mailboxEvents = new Map<string, SubagentMailboxEventSummary[]>();

  readonly appendSubagentMailboxEvent = vi.fn((
    runId: string,
    input: {
      direction: "parent_to_child" | "child_to_parent";
      type: string;
      payload: unknown;
      deliveryState?: SubagentMailboxDeliveryState;
      createdAt?: string;
      deliveredAt?: string;
    },
  ): SubagentMailboxEventSummary => {
    const events = this.mailboxEvents.get(runId) ?? [];
    const event: SubagentMailboxEventSummary = {
      id: `mailbox-${events.length + 1}`,
      runId,
      direction: input.direction,
      type: input.type,
      payload: input.payload,
      deliveryState: input.deliveryState ?? "queued",
      createdAt: input.createdAt ?? "2026-06-07T00:00:00.000Z",
      ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
    };
    events.push(event);
    this.mailboxEvents.set(runId, events);
    return event;
  });

  readonly appendSubagentRunEvent = vi.fn((
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary => {
    const events = this.runEvents.get(runId) ?? [];
    const event: SubagentRunEventSummary = {
      runId,
      sequence: events.length + 1,
      type: input.type,
      createdAt: input.createdAt ?? "2026-06-07T00:00:00.000Z",
      ...(input.preview !== undefined ? { preview: input.preview } : {}),
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    };
    events.push(event);
    this.runEvents.set(runId, events);
    return event;
  });

  constructor(run: SubagentRunSummary) {
    this.runEvents.set(run.id, []);
    this.mailboxEvents.set(run.id, []);
  }

  listSubagentRunEvents(runId: string): SubagentRunEventSummary[] {
    return [...(this.runEvents.get(runId) ?? [])];
  }

  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[] {
    return [...(this.mailboxEvents.get(runId) ?? [])];
  }
}

const explorerRole = getDefaultSubagentRoleProfile("explorer");

function run(input: {
  status: SubagentRunSummary["status"];
  closedAt?: string;
}): SubagentRunSummary {
  return {
    id: "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "assistant-message",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
    roleProfileSnapshot: explorerRole,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: input.status,
    featureFlagSnapshot: { subagents: true },
    modelRuntimeSnapshot: { modelId: "glm-5.1" },
    capacityLeaseSnapshot: { status: "reserved" },
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z",
    ...(input.closedAt ? { closedAt: input.closedAt } : {}),
  } as unknown as SubagentRunSummary;
}

function startedTurnEventInput(): { type: string; preview: unknown } {
  return {
    type: "subagent.runtime_event",
    preview: { schemaVersion: "ambient-subagent-runtime-event-v1", type: "started" },
  };
}

function startedTurnEvent(): SubagentRunEventSummary {
  return {
    runId: "child-run",
    sequence: 1,
    type: "subagent.runtime_event",
    createdAt: "2026-06-07T00:00:00.000Z",
    preview: { schemaVersion: "ambient-subagent-runtime-event-v1", type: "started" },
  };
}

function completedTurnEvent(): SubagentRunEventSummary {
  return {
    runId: "child-run",
    sequence: 1,
    type: "subagent.runtime_event",
    createdAt: "2026-06-07T00:00:00.000Z",
    preview: { schemaVersion: "ambient-subagent-runtime-event-v1", type: "completed" },
  };
}
