import { describe, expect, it, vi } from "vitest";

import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentRunSummary,
} from "../shared/types";
import {
  executeSubagentBarrierControlDecision,
  SUBAGENT_BARRIER_CONTROL_EXECUTOR_SCHEMA_VERSION,
  type SubagentBarrierControlExecutorStore,
} from "./subagentBarrierControlExecutor";

describe("subagentBarrierControlExecutor", () => {
  it("queues retry requests for retryable children and starts runtime retry when available", async () => {
    const failed = run({ id: "failed-child", childThreadId: "thread-failed", status: "failed" });
    const done = run({ id: "done-child", childThreadId: "thread-done", status: "completed" });
    const retrying = run({ id: "failed-child", childThreadId: "thread-failed", status: "running" });
    const store = fakeStore({ runs: [failed, done] });
    const emitEvent = vi.fn();
    const createRuntimeRetryEventEmitter = vi.fn(() => emitEvent);
    const runtime = {
      retryChildRun: vi.fn(({ mailboxEvent, markMailboxDelivered, markMailboxConsumed }) => {
        const delivered = markMailboxDelivered("2026-06-06T00:00:01.000Z");
        markMailboxConsumed("2026-06-06T00:00:02.000Z");
        expect(delivered.id).toBe(mailboxEvent.id);
        store.markSubagentRunStatus("failed-child", "running", { now: "2026-06-06T00:00:01.000Z" });
        return { accepted: true, run: retrying, mailboxEvent: delivered };
      }),
    };

    const result = await executeSubagentBarrierControlDecision({
      store,
      runtime,
      childRuns: [failed, done],
      decision: "retry_child",
      userDecision: "Retry the failed reader.",
      idempotencyKey: "barrier:retry",
      now: "2026-06-06T00:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(),
      createRuntimeRetryEventEmitter,
    });

    expect(SUBAGENT_BARRIER_CONTROL_EXECUTOR_SCHEMA_VERSION)
      .toBe("ambient-subagent-barrier-control-executor-v1");
    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledWith("failed-child", expect.objectContaining({
      direction: "parent_to_child",
      type: "subagent.retry",
      deliveryState: "queued",
      createdAt: "2026-06-06T00:00:00.000Z",
      payload: expect.objectContaining({
        schemaVersion: "ambient-subagent-barrier-retry-request-v1",
        childRunId: "failed-child",
        childThreadId: "thread-failed",
        previousStatus: "failed",
        message: expect.stringContaining("Retry the failed reader."),
      }),
    }));
    expect(runtime.retryChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: failed,
      message: expect.stringContaining("Preserve the failed attempt above"),
      idempotencyKey: expect.stringContaining("subagent:retry:"),
      emitEvent,
    }));
    expect(createRuntimeRetryEventEmitter).toHaveBeenCalledWith(failed);
    expect(result.retryRequestedRunIds).toEqual(["failed-child"]);
    expect(result.retryAcceptedRunIds).toEqual(["failed-child"]);
    expect(result.retryMailboxEventIds).toEqual(["mailbox-1"]);
    expect(result.unchangedRunIds).toEqual(["done-child"]);
    expect(result.childRuns.map((childRun) => [childRun.id, childRun.status])).toEqual([
      ["failed-child", "running"],
      ["done-child", "completed"],
    ]);
  });

  it("keeps retry queued when the runtime has no retry adapter", async () => {
    const child = run({ id: "child-a", status: "failed" });
    const store = fakeStore({ runs: [child] });

    const result = await executeSubagentBarrierControlDecision({
      store,
      childRuns: [child],
      decision: "retry_child",
      idempotencyKey: "barrier:retry",
      now: "2026-06-06T00:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(),
    });

    expect(result.retryRequestedRunIds).toEqual(["child-a"]);
    expect(result.retryAcceptedRunIds).toEqual([]);
    expect(result.retryMailboxEventIds).toEqual(["mailbox-1"]);
    expect(result.childRuns).toEqual([child]);
    expect(store.markSubagentRunStatus).not.toHaveBeenCalled();
    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledWith("child-a", expect.objectContaining({
      type: "subagent.retry",
      deliveryState: "queued",
    }));
  });

  it("detaches active children while preserving terminal child runs", async () => {
    const active = run({ id: "active-child", status: "running" });
    const done = run({ id: "done-child", status: "completed" });
    const store = fakeStore({ runs: [active, done] });

    const result = await executeSubagentBarrierControlDecision({
      store,
      childRuns: [active, done],
      decision: "detach_child",
      userDecision: "Review this separately.",
      idempotencyKey: "barrier:detach",
      now: "2026-06-06T00:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(),
    });

    expect(store.markSubagentRunStatus).toHaveBeenCalledWith("active-child", "detached", {
      now: "2026-06-06T00:00:00.000Z",
      resultArtifact: expect.objectContaining({
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "active-child",
        status: "detached",
        summary: "User detached this required child from the parent wait barrier. Review this separately.",
      }),
    });
    expect(result.detachedRunIds).toEqual(["active-child"]);
    expect(result.unchangedRunIds).toEqual(["done-child"]);
    expect(result.childRuns.map((childRun) => [childRun.id, childRun.status])).toEqual([
      ["active-child", "detached"],
      ["done-child", "completed"],
    ]);
    expect(store.appendSubagentMailboxEvent).not.toHaveBeenCalled();
  });

  it("cancels active children through the runtime and cancels pending parent-to-child mailbox work", async () => {
    const active = run({ id: "active-child", childThreadId: "thread-active", status: "running" });
    const pendingMailbox = mailbox({ id: "mailbox-queued", runId: active.id, deliveryState: "queued" });
    const store = fakeStore({ runs: [active], mailboxEvents: [pendingMailbox] });
    const emitEvent = vi.fn();
    const createRuntimeCancelEventEmitter = vi.fn(() => emitEvent);
    const runtime = {
      cancelChildRun: vi.fn(() => ({ cancelled: true, run: active })),
    };

    const result = await executeSubagentBarrierControlDecision({
      store,
      runtime,
      childRuns: [active],
      decision: "cancel_parent",
      userDecision: "Stop waiting.",
      idempotencyKey: "barrier:cancel",
      now: "2026-06-06T00:00:00.000Z",
      createRuntimeCancelEventEmitter,
    });

    expect(runtime.cancelChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: active,
      reason: "User cancelled the parent path while resolving this wait barrier. Stop waiting.",
      idempotencyKey: expect.stringContaining("subagent:cancel:"),
      emitEvent,
    }));
    expect(createRuntimeCancelEventEmitter).toHaveBeenCalledWith(active);
    expect(store.markSubagentRunStatus).toHaveBeenCalledWith("active-child", "cancelled", expect.objectContaining({
      now: "2026-06-06T00:00:00.000Z",
      resultArtifact: expect.objectContaining({
        runId: "active-child",
        status: "cancelled",
      }),
    }));
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenCalledWith(
      "mailbox-queued",
      "cancelled",
      { now: "2026-06-06T00:00:00.000Z" },
    );
    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledWith("active-child", {
      direction: "child_to_parent",
      type: "subagent.cancelled",
      deliveryState: "delivered",
      createdAt: "2026-06-06T00:00:00.000Z",
      deliveredAt: "2026-06-06T00:00:00.000Z",
      payload: {
        status: "cancelled",
        reason: "User cancelled the parent path while resolving this wait barrier. Stop waiting.",
        source: "barrier_cancel_parent",
        childThreadId: "thread-active",
      },
    });
    expect(result.cancelledRunIds).toEqual(["active-child"]);
    expect(result.cancelledMailboxEventIds).toEqual(["mailbox-queued"]);
  });

  it("does not overwrite terminal runtime results during cancel-parent control", async () => {
    const initial = run({ id: "child-a", status: "running" });
    const completed = run({ id: "child-a", status: "completed" });
    const store = fakeStore({ runs: [initial] });
    const runtime = {
      cancelChildRun: vi.fn(() => ({ cancelled: false, run: completed })),
    };

    const result = await executeSubagentBarrierControlDecision({
      store,
      runtime,
      childRuns: [initial],
      decision: "cancel_parent",
      userDecision: "Stop waiting.",
      idempotencyKey: "barrier:cancel-terminal",
      now: "2026-06-06T00:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(store.markSubagentRunStatus).not.toHaveBeenCalled();
    expect(store.appendSubagentMailboxEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      childRuns: [expect.objectContaining({ id: "child-a", status: "completed" })],
      detachedRunIds: [],
      cancelledRunIds: [],
      unchangedRunIds: ["child-a"],
      cancelledMailboxEventIds: [],
    });
  });
});

function fakeStore(input: {
  runs: SubagentRunSummary[];
  mailboxEvents?: SubagentMailboxEventSummary[];
}): SubagentBarrierControlExecutorStore & {
  getSubagentRun: ReturnType<typeof vi.fn>;
  markSubagentRunStatus: ReturnType<typeof vi.fn>;
  appendSubagentMailboxEvent: ReturnType<typeof vi.fn>;
  listSubagentMailboxEvents: ReturnType<typeof vi.fn>;
  updateSubagentMailboxEventDeliveryState: ReturnType<typeof vi.fn>;
} {
  const runs = new Map(input.runs.map((childRun) => [childRun.id, childRun]));
  const mailboxEvents = new Map((input.mailboxEvents ?? []).map((event) => [event.id, event]));
  const nextMailboxEventsByRun = () => [...mailboxEvents.values()].reduce<Record<string, SubagentMailboxEventSummary[]>>((groups, event) => {
    const group = groups[event.runId] ?? [];
    group.push(event);
    groups[event.runId] = group;
    return groups;
  }, {});

  const getSubagentRun = vi.fn((runId: string): SubagentRunSummary => {
    const childRun = runs.get(runId);
    if (!childRun) throw new Error(`Unknown run ${runId}`);
    return childRun;
  });
  const markSubagentRunStatus = vi.fn((runId: string, status: SubagentRunStatus, options?: { resultArtifact?: unknown; now?: string }): SubagentRunSummary => {
    const current = getSubagentRun(runId);
    const updated = {
      ...current,
      status,
      ...(options?.resultArtifact ? { resultArtifact: options.resultArtifact } : {}),
      ...(options?.now ? { updatedAt: options.now } : {}),
    } as SubagentRunSummary;
    runs.set(runId, updated);
    return updated;
  });
  const appendSubagentMailboxEvent = vi.fn((runId: string, eventInput: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary => {
    const event = {
      id: `mailbox-${mailboxEvents.size + 1}`,
      runId,
      direction: eventInput.direction,
      type: eventInput.type,
      payload: eventInput.payload,
      deliveryState: eventInput.deliveryState ?? "queued",
      createdAt: eventInput.createdAt ?? "2026-06-06T00:00:00.000Z",
      updatedAt: eventInput.createdAt ?? "2026-06-06T00:00:00.000Z",
      ...(eventInput.deliveredAt ? { deliveredAt: eventInput.deliveredAt } : {}),
    } as SubagentMailboxEventSummary;
    mailboxEvents.set(event.id, event);
    return event;
  });
  const listSubagentMailboxEvents = vi.fn((runId: string): SubagentMailboxEventSummary[] => {
    return nextMailboxEventsByRun()[runId] ?? [];
  });
  const updateSubagentMailboxEventDeliveryState = vi.fn((id: string, deliveryState: SubagentMailboxDeliveryState, options?: { now?: string; deliveredAt?: string | null }): SubagentMailboxEventSummary => {
    const event = mailboxEvents.get(id);
    if (!event) throw new Error(`Unknown mailbox event ${id}`);
    const updated = {
      ...event,
      deliveryState,
      ...(options?.now ? { updatedAt: options.now } : {}),
      ...(options?.deliveredAt !== undefined ? { deliveredAt: options.deliveredAt ?? undefined } : {}),
    } as SubagentMailboxEventSummary;
    mailboxEvents.set(id, updated);
    return updated;
  });

  return {
    getSubagentRun,
    markSubagentRunStatus,
    appendSubagentMailboxEvent,
    listSubagentMailboxEvents,
    updateSubagentMailboxEventDeliveryState,
  };
}

function run(overrides: {
  id?: string;
  parentThreadId?: string;
  parentRunId?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  status?: SubagentRunStatus;
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  return {
    id,
    parentThreadId: overrides.parentThreadId ?? "parent-thread",
    parentRunId: overrides.parentRunId ?? "parent-run",
    childThreadId: overrides.childThreadId ?? `${id}-thread`,
    canonicalTaskPath: overrides.canonicalTaskPath ?? `root/${id}:reviewer`,
    roleId: "reviewer",
    dependencyMode: "required",
    status: overrides.status ?? "running",
  } as SubagentRunSummary;
}

function mailbox(input: {
  id: string;
  runId: string;
  deliveryState: SubagentMailboxDeliveryState;
}): SubagentMailboxEventSummary {
  return {
    id: input.id,
    runId: input.runId,
    direction: "parent_to_child",
    type: "subagent.followup",
    payload: { message: "continue" },
    deliveryState: input.deliveryState,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  } as SubagentMailboxEventSummary;
}
