import { describe, expect, it, vi } from "vitest";

import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import {
  executeSubagentBarrierDecision,
  SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION,
  type SubagentBarrierDecisionExecutorStore,
} from "./subagentBarrierDecisionExecutor";

describe("subagentBarrierDecisionExecutor", () => {
  it("records partial barrier decisions across barrier, child, and parent mailbox evidence", async () => {
    const child = run({
      id: "child-a",
      childThreadId: "thread-a",
      status: "failed",
      parentMessageId: "assistant-message",
    });
    const completedChild = run({
      id: "child-b",
      childThreadId: "thread-b",
      status: "completed",
      parentMessageId: "assistant-message",
    });
    const barrier = waitBarrier({
      id: "barrier-a",
      status: "failed",
      childRunIds: [child.id, completedChild.id],
      failurePolicy: "degrade_partial",
    });
    const store = fakeStore({ runs: [child, completedChild], waitBarriers: [barrier] });

    const result = await executeSubagentBarrierDecision({
      store,
      barrier,
      decision: "continue_with_partial",
      userDecision: "User approved a partial parent answer.",
      partialSummary: "Reviewer failed; parent may proceed with explicit partial provenance.",
      idempotencyKey: "barrier:partial",
      toolCallId: "tool-partial",
      now: "2026-06-06T12:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION)
      .toBe("ambient-subagent-barrier-decision-executor-v1");
    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith("barrier-a", "satisfied", {
      now: "2026-06-06T12:00:00.000Z",
      resolutionArtifact: expect.objectContaining({
        schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
        synthesisAllowed: true,
        explicitPartial: true,
        transitionEvidence: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
          kind: "explicit_partial",
          source: "barrier_controller",
          idempotencyKey: "barrier:partial",
          details: expect.objectContaining({
            decision: "continue_with_partial",
            waitBarrierId: "barrier-a",
            toolCallId: "tool-partial",
          }),
        }),
        userDecision: expect.objectContaining({
          decision: "continue_with_partial",
          userDecision: "User approved a partial parent answer.",
          partialSummary: "Reviewer failed; parent may proceed with explicit partial provenance.",
        }),
      }),
    });
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("child-a", {
      type: "subagent.barrier_decision",
      preview: expect.objectContaining({
        waitBarrierId: "barrier-a",
        decision: "continue_with_partial",
        idempotencyKey: "barrier:partial",
        toolCallId: "tool-partial",
      }),
      createdAt: "2026-06-06T12:00:00.000Z",
    });
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("child-b", expect.objectContaining({
      type: "subagent.barrier_decision",
      preview: expect.objectContaining({
        waitBarrierId: "barrier-a",
        decision: "continue_with_partial",
        idempotencyKey: "barrier:partial",
      }),
    }));
    expect(store.appendSubagentRunEvent).toHaveBeenCalledTimes(2);
    expect(store.addMessage).toHaveBeenCalledWith({
      threadId: "thread-a",
      role: "system",
      content: [
        "Parent recorded a wait-barrier decision: continue_with_partial.",
        "Barrier: barrier-a",
        "User decision: User approved a partial parent answer.",
        "Partial summary: Reviewer failed; parent may proceed with explicit partial provenance.",
      ].join("\n"),
      metadata: {
        runtime: "ambient-subagents",
        phase: "phase-2-pi-tool-surface",
        status: "done",
        subagentRunId: "child-a",
        waitBarrierId: "barrier-a",
        decision: "continue_with_partial",
      },
    });
    expect(store.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-b",
      metadata: expect.objectContaining({
        subagentRunId: "child-b",
        decision: "continue_with_partial",
      }),
    }));
    expect(store.addMessage).toHaveBeenCalledTimes(2);
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledWith(expect.objectContaining({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.wait_barrier_decision",
      deliveryState: "delivered",
      idempotencyKey: "barrier:partial",
      createdAt: "2026-06-06T12:00:00.000Z",
      deliveredAt: "2026-06-06T12:00:00.000Z",
      payload: expect.objectContaining({
        schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
        decision: "continue_with_partial",
        barrierStatus: "satisfied",
        parentResolution: expect.objectContaining({
          status: "ready",
          action: "continue_with_explicit_partial",
          canSynthesize: true,
        }),
      }),
    }));
    expect(result).toMatchObject({
      schemaVersion: SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION,
      replay: false,
      barrier: expect.objectContaining({ id: "barrier-a", status: "satisfied" }),
      parentResolution: expect.objectContaining({ action: "continue_with_explicit_partial" }),
      parentMailboxEvent: expect.objectContaining({ type: "subagent.wait_barrier_decision" }),
      resolutionArtifact: expect.objectContaining({ synthesisAllowed: true }),
      runEvents: [
        expect.objectContaining({ runId: "child-a", type: "subagent.barrier_decision" }),
        expect.objectContaining({ runId: "child-b", type: "subagent.barrier_decision" }),
      ],
    });
  });

  it("replays existing barrier decisions without repeating child side effects", async () => {
    const child = run({ id: "child-a", status: "failed", parentMessageId: "assistant-message" });
    const barrier = waitBarrier({
      id: "barrier-a",
      status: "satisfied",
      childRunIds: [child.id],
      resolutionArtifact: {
        detachedRunIds: [],
        cancelledRunIds: [],
        unchangedRunIds: [],
        cancelledMailboxEventIds: [],
      },
    });
    const existingRunEvent = runEvent({
      runId: child.id,
      type: "subagent.barrier_decision",
      preview: { idempotencyKey: "barrier:partial" },
    });
    const store = fakeStore({
      runs: [child],
      waitBarriers: [barrier],
      runEvents: [existingRunEvent],
    });

    const result = await executeSubagentBarrierDecision({
      store,
      barrier,
      decision: "continue_with_partial",
      userDecision: "User approved a partial parent answer.",
      partialSummary: "Proceed partially.",
      idempotencyKey: "barrier:partial",
      toolCallId: "tool-partial",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(result).toMatchObject({
      replay: true,
      barrier,
      parentResolution: expect.objectContaining({
        action: "continue_with_explicit_partial",
      }),
      parentMailboxEvent: expect.objectContaining({
        idempotencyKey: "barrier:partial",
      }),
    });
    expect(store.updateSubagentWaitBarrierStatus).not.toHaveBeenCalled();
    expect(store.appendSubagentRunEvent).not.toHaveBeenCalled();
    expect(store.markSubagentRunStatus).not.toHaveBeenCalled();
    expect(store.addMessage).not.toHaveBeenCalled();
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledTimes(1);
  });

  it("records retry decisions as parent-blocking retry requests and starts retry runtime work", async () => {
    const child = run({
      id: "child-a",
      childThreadId: "thread-a",
      status: "failed",
      parentMessageId: "assistant-message",
    });
    const barrier = waitBarrier({
      id: "barrier-retry",
      status: "failed",
      childRunIds: [child.id],
      failurePolicy: "ask_user",
    });
    const store = fakeStore({ runs: [child], waitBarriers: [barrier] });
    const emitRetry = vi.fn();
    const createRuntimeRetryEventEmitter = vi.fn(() => emitRetry);
    const runtime = {
      retryChildRun: vi.fn(({ mailboxEvent, markMailboxDelivered, markMailboxConsumed }) => {
        const delivered = markMailboxDelivered("2026-06-06T12:00:01.000Z");
        expect(delivered.id).toBe(mailboxEvent.id);
        markMailboxConsumed("2026-06-06T12:00:02.000Z");
        const running = store.markSubagentRunStatus("child-a", "running", { now: "2026-06-06T12:00:01.000Z" });
        return { accepted: true, run: running, mailboxEvent: delivered };
      }),
    };

    const result = await executeSubagentBarrierDecision({
      store,
      runtime,
      barrier,
      decision: "retry_child",
      userDecision: "Retry the failed child before continuing.",
      idempotencyKey: "barrier:retry",
      toolCallId: "tool-retry",
      now: "2026-06-06T12:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
      createRuntimeRetryEventEmitter,
    });

    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledWith("child-a", expect.objectContaining({
      direction: "parent_to_child",
      type: "subagent.retry",
      deliveryState: "queued",
      payload: expect.objectContaining({
        schemaVersion: "ambient-subagent-barrier-retry-request-v1",
        childRunId: "child-a",
        childThreadId: "thread-a",
        previousStatus: "failed",
      }),
    }));
    expect(runtime.retryChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: child,
      mailboxEvent: expect.objectContaining({ id: "mailbox-1" }),
      idempotencyKey: expect.stringContaining("subagent:retry:"),
      emitEvent: emitRetry,
    }));
    expect(createRuntimeRetryEventEmitter).toHaveBeenCalledWith(child);
    expect(store.markSubagentRunStatus).toHaveBeenCalledWith("child-a", "running", {
      now: "2026-06-06T12:00:01.000Z",
    });
    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith("barrier-retry", "waiting_on_children", {
      now: "2026-06-06T12:00:00.000Z",
      resolutionArtifact: expect.objectContaining({
        synthesisAllowed: false,
        explicitPartial: false,
        retryRequestedRunIds: ["child-a"],
        retryAcceptedRunIds: ["child-a"],
        retryMailboxEventIds: ["mailbox-1"],
        transitionEvidence: expect.objectContaining({
          kind: "retry_child",
          source: "barrier_controller",
          idempotencyKey: "barrier:retry",
          details: expect.objectContaining({
            decision: "retry_child",
            retryRequestedRunIds: ["child-a"],
            retryAcceptedRunIds: ["child-a"],
            retryMailboxEventIds: ["mailbox-1"],
          }),
        }),
        userDecision: expect.objectContaining({
          decision: "retry_child",
          userDecision: "Retry the failed child before continuing.",
        }),
      }),
    });
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("child-a", expect.objectContaining({
      type: "subagent.barrier_decision",
      preview: expect.objectContaining({
        waitBarrierId: "barrier-retry",
        decision: "retry_child",
        retryRequestedRunIds: ["child-a"],
        retryAcceptedRunIds: ["child-a"],
        retryMailboxEventIds: ["mailbox-1"],
      }),
    }));
    expect(result).toMatchObject({
      replay: false,
      barrier: expect.objectContaining({ id: "barrier-retry", status: "waiting_on_children" }),
      childRuns: [expect.objectContaining({ id: "child-a", status: "running" })],
      parentResolution: expect.objectContaining({
        action: "retry_child",
        canSynthesize: false,
      }),
      parentMailboxEvent: expect.objectContaining({
        type: "subagent.wait_barrier_decision",
        payload: expect.objectContaining({
          decision: "retry_child",
          barrierStatus: "waiting_on_children",
          retryRequestedRunIds: ["child-a"],
          retryAcceptedRunIds: ["child-a"],
          retryMailboxEventIds: ["mailbox-1"],
        }),
      }),
      resolutionArtifact: expect.objectContaining({
        retryRequestedRunIds: ["child-a"],
        retryAcceptedRunIds: ["child-a"],
        retryMailboxEventIds: ["mailbox-1"],
      }),
    });
  });

  it("records retry child-thread side effects only on retry-target children", async () => {
    const failed = run({
      id: "failed-child",
      childThreadId: "thread-failed",
      canonicalTaskPath: "root/0:gear",
      status: "failed",
      parentMessageId: "assistant-message",
    });
    const completed = run({
      id: "completed-child",
      childThreadId: "thread-completed",
      canonicalTaskPath: "root/1:route",
      status: "completed",
      parentMessageId: "assistant-message",
    });
    const barrier = waitBarrier({
      id: "barrier-retry-targeting",
      status: "failed",
      childRunIds: [failed.id, completed.id],
      failurePolicy: "ask_user",
    });
    const store = fakeStore({ runs: [failed, completed], waitBarriers: [barrier] });

    const result = await executeSubagentBarrierDecision({
      store,
      barrier,
      decision: "retry_child",
      userDecision: "Retry only the failed Gear child.",
      idempotencyKey: "barrier:retry-targeting",
      toolCallId: "tool-retry-targeting",
      now: "2026-06-06T12:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(result.runEvents).toEqual([
      expect.objectContaining({
        runId: "failed-child",
        type: "subagent.barrier_decision",
      }),
    ]);
    expect(store.appendSubagentRunEvent).toHaveBeenCalledTimes(1);
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("failed-child", expect.objectContaining({
      type: "subagent.barrier_decision",
      preview: expect.objectContaining({
        retryRequestedRunIds: ["failed-child"],
      }),
    }));
    expect(store.addMessage).toHaveBeenCalledTimes(1);
    expect(store.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-failed",
      content: expect.stringContaining("Retry only the failed Gear child."),
      metadata: expect.objectContaining({ subagentRunId: "failed-child" }),
    }));
    expect(store.addMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-completed",
    }));
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        retryRequestedRunIds: ["failed-child"],
        unchangedRunIds: ["completed-child"],
      }),
    }));
  });

  it("records whole-barrier cancel evidence when terminal children do not change state", async () => {
    const failed = run({
      id: "failed-child",
      childThreadId: "thread-failed",
      canonicalTaskPath: "root/0:gear",
      status: "failed",
      parentMessageId: "assistant-message",
    });
    const completed = run({
      id: "completed-child",
      childThreadId: "thread-completed",
      canonicalTaskPath: "root/1:route",
      status: "completed",
      parentMessageId: "assistant-message",
    });
    const barrier = waitBarrier({
      id: "barrier-cancel-terminal",
      status: "failed",
      childRunIds: [failed.id, completed.id],
      failurePolicy: "ask_user",
    });
    const store = fakeStore({ runs: [failed, completed], waitBarriers: [barrier] });

    const result = await executeSubagentBarrierDecision({
      store,
      barrier,
      decision: "cancel_parent",
      userDecision: "Stop this route; both child outcomes are already terminal.",
      idempotencyKey: "barrier:cancel-terminal",
      toolCallId: "tool-cancel-terminal",
      now: "2026-06-06T12:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(result.runEvents).toEqual([
      expect.objectContaining({ runId: "failed-child", type: "subagent.barrier_decision" }),
      expect.objectContaining({ runId: "completed-child", type: "subagent.barrier_decision" }),
    ]);
    expect(store.appendSubagentRunEvent).toHaveBeenCalledTimes(2);
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("failed-child", expect.objectContaining({
      type: "subagent.barrier_decision",
      preview: expect.objectContaining({
        decision: "cancel_parent",
        idempotencyKey: "barrier:cancel-terminal",
      }),
    }));
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("completed-child", expect.objectContaining({
      type: "subagent.barrier_decision",
      preview: expect.objectContaining({
        decision: "cancel_parent",
        idempotencyKey: "barrier:cancel-terminal",
      }),
    }));
    expect(store.addMessage).toHaveBeenCalledTimes(2);
    expect(store.markSubagentRunStatus).not.toHaveBeenCalled();
  });

  it("rejects retry_child when the barrier only has completed or needs-attention children", async () => {
    const completed = run({
      id: "completed-child",
      canonicalTaskPath: "root/0:route",
      status: "completed",
      parentMessageId: "assistant-message",
    });
    const needsAttention = run({
      id: "attention-child",
      canonicalTaskPath: "root/1:gear",
      status: "needs_attention",
      parentMessageId: "assistant-message",
    });
    const barrier = waitBarrier({
      id: "barrier-approval",
      status: "waiting_on_children",
      childRunIds: [completed.id, needsAttention.id],
      failurePolicy: "ask_user",
    });
    const store = fakeStore({ runs: [completed, needsAttention], waitBarriers: [barrier] });

    await expect(executeSubagentBarrierDecision({
      store,
      barrier,
      decision: "retry_child",
      userDecision: "Retry the Gear child.",
      idempotencyKey: "barrier:retry-needs-attention",
      toolCallId: "tool-retry-needs-attention",
      now: "2026-06-06T12:00:00.000Z",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
    })).rejects.toThrow(/no child run is retryable/);

    expect(store.appendSubagentMailboxEvent).not.toHaveBeenCalled();
    expect(store.updateSubagentWaitBarrierStatus).not.toHaveBeenCalled();
    expect(store.appendSubagentRunEvent).not.toHaveBeenCalled();
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();
    expect(store.addMessage).not.toHaveBeenCalled();
  });

  it("cancels active children for cancel-parent barrier decisions and records cancellation provenance", async () => {
    const child = run({
      id: "child-a",
      childThreadId: "thread-a",
      status: "running",
      parentMessageId: "assistant-message",
    });
    const pendingMailbox = mailbox({
      id: "mailbox-queued",
      runId: child.id,
      deliveryState: "queued",
    });
    const barrier = waitBarrier({
      id: "barrier-a",
      childRunIds: [child.id],
      status: "failed",
    });
    const store = fakeStore({
      runs: [child],
      waitBarriers: [barrier],
      mailboxEvents: [pendingMailbox],
    });
    const emitEvent = vi.fn();
    const createRuntimeCancelEventEmitter = vi.fn(() => emitEvent);
    const runtime = {
      cancelChildRun: vi.fn(() => ({ cancelled: true, run: child })),
    };

    const result = await executeSubagentBarrierDecision({
      store,
      runtime,
      barrier,
      decision: "cancel_parent",
      userDecision: "Stop this parent path.",
      idempotencyKey: "barrier:cancel-parent",
      toolCallId: "tool-cancel-parent",
      now: "2026-06-06T12:00:00.000Z",
      createRuntimeCancelEventEmitter,
    });

    expect(runtime.cancelChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: child,
      reason: "User cancelled the parent path while resolving this wait barrier. Stop this parent path.",
      idempotencyKey: expect.stringContaining("subagent:cancel:"),
      emitEvent,
    }));
    expect(createRuntimeCancelEventEmitter).toHaveBeenCalledWith(child);
    expect(store.markSubagentRunStatus).toHaveBeenCalledWith("child-a", "cancelled", expect.objectContaining({
      now: "2026-06-06T12:00:00.000Z",
      resultArtifact: expect.objectContaining({
        status: "cancelled",
        childThreadId: "thread-a",
      }),
    }));
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenCalledWith(
      "mailbox-queued",
      "cancelled",
      { now: "2026-06-06T12:00:00.000Z" },
    );
    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledWith("child-a", expect.objectContaining({
      direction: "child_to_parent",
      type: "subagent.cancelled",
      deliveryState: "delivered",
    }));
    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith("barrier-a", "cancelled", expect.objectContaining({
      now: "2026-06-06T12:00:00.000Z",
      resolutionArtifact: expect.objectContaining({
        cancelledRunIds: ["child-a"],
        cancelledMailboxEventIds: ["mailbox-queued"],
        parentCancellationRequested: true,
        transitionEvidence: expect.objectContaining({
          kind: "child_cancelled",
          source: "barrier_controller",
          idempotencyKey: "barrier:cancel-parent",
          details: expect.objectContaining({
            decision: "cancel_parent",
            cancelledRunIds: ["child-a"],
            cancelledMailboxEventIds: ["mailbox-queued"],
          }),
        }),
      }),
    }));
    expect(result).toMatchObject({
      replay: false,
      barrier: expect.objectContaining({ status: "cancelled" }),
      childRuns: [expect.objectContaining({ id: "child-a", status: "cancelled" })],
      parentResolution: expect.objectContaining({
        action: "cancel_parent",
        canSynthesize: false,
      }),
      parentMailboxEvent: expect.objectContaining({
        type: "subagent.wait_barrier_decision",
        payload: expect.objectContaining({
          parentCancellationRequested: true,
          cancelledRunIds: ["child-a"],
          cancelledMailboxEventIds: ["mailbox-queued"],
        }),
      }),
    });
  });
});

function fakeStore(input: {
  runs: SubagentRunSummary[];
  waitBarriers: SubagentWaitBarrierSummary[];
  runEvents?: SubagentRunEventSummary[];
  mailboxEvents?: SubagentMailboxEventSummary[];
  parentMailboxEvents?: SubagentParentMailboxEventSummary[];
}): SubagentBarrierDecisionExecutorStore & {
  getSubagentRun: ReturnType<typeof vi.fn>;
  markSubagentRunStatus: ReturnType<typeof vi.fn>;
  listSubagentMailboxEvents: ReturnType<typeof vi.fn>;
  updateSubagentMailboxEventDeliveryState: ReturnType<typeof vi.fn>;
  appendSubagentMailboxEvent: ReturnType<typeof vi.fn>;
  getSubagentWaitBarrier: ReturnType<typeof vi.fn>;
  updateSubagentWaitBarrierStatus: ReturnType<typeof vi.fn>;
  listSubagentRunEvents: ReturnType<typeof vi.fn>;
  appendSubagentRunEvent: ReturnType<typeof vi.fn>;
  appendSubagentParentMailboxEvent: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
} {
  const runs = new Map(input.runs.map((childRun) => [childRun.id, childRun]));
  const waitBarriers = new Map(input.waitBarriers.map((barrier) => [barrier.id, barrier]));
  const runEvents = [...(input.runEvents ?? [])];
  const mailboxEvents = new Map((input.mailboxEvents ?? []).map((event) => [event.id, event]));
  const parentMailboxEvents = [...(input.parentMailboxEvents ?? [])];

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
  const listSubagentMailboxEvents = vi.fn((runId: string): SubagentMailboxEventSummary[] => {
    return [...mailboxEvents.values()].filter((event) => event.runId === runId);
  });
  const updateSubagentMailboxEventDeliveryState = vi.fn((
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary => {
    const event = mailboxEvents.get(id);
    if (!event) throw new Error(`Unknown mailbox event ${id}`);
    const updated = {
      ...event,
      deliveryState,
      ...(options?.deliveredAt !== undefined ? { deliveredAt: options.deliveredAt ?? undefined } : {}),
    } as SubagentMailboxEventSummary;
    mailboxEvents.set(id, updated);
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
    const event = mailbox({
      id: `mailbox-${mailboxEvents.size + 1}`,
      runId,
      direction: eventInput.direction,
      type: eventInput.type,
      payload: eventInput.payload,
      deliveryState: eventInput.deliveryState ?? "queued",
      createdAt: eventInput.createdAt,
      deliveredAt: eventInput.deliveredAt,
    });
    mailboxEvents.set(event.id, event);
    return event;
  });
  const getSubagentWaitBarrier = vi.fn((barrierId: string): SubagentWaitBarrierSummary => {
    const barrier = waitBarriers.get(barrierId);
    if (!barrier) throw new Error(`Unknown wait barrier ${barrierId}`);
    return barrier;
  });
  const updateSubagentWaitBarrierStatus = vi.fn((barrierId: string, status: SubagentWaitBarrierSummary["status"], options?: { resolutionArtifact?: unknown; now?: string }): SubagentWaitBarrierSummary => {
    const current = getSubagentWaitBarrier(barrierId);
    const updated = {
      ...current,
      status,
      ...(options?.resolutionArtifact !== undefined ? { resolutionArtifact: options.resolutionArtifact } : {}),
      updatedAt: options?.now ?? current.updatedAt,
      ...(status !== "waiting_on_children" ? { resolvedAt: options?.now ?? current.resolvedAt } : {}),
    } as SubagentWaitBarrierSummary;
    waitBarriers.set(barrierId, updated);
    return updated;
  });
  const listSubagentRunEvents = vi.fn((runId: string): SubagentRunEventSummary[] => {
    return runEvents.filter((event) => event.runId === runId);
  });
  const appendSubagentRunEvent = vi.fn((runId: string, eventInput: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string }): SubagentRunEventSummary => {
    const event = runEvent({
      runId,
      sequence: runEvents.length + 1,
      type: eventInput.type,
      preview: eventInput.preview,
      artifactPath: eventInput.artifactPath,
      createdAt: eventInput.createdAt,
    });
    runEvents.push(event);
    return event;
  });
  const appendSubagentParentMailboxEvent = vi.fn((mailboxInput: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary => {
    const existing = mailboxInput.idempotencyKey
      ? parentMailboxEvents.find((event) =>
        event.parentRunId === mailboxInput.parentRunId &&
        event.type === mailboxInput.type &&
        event.idempotencyKey === mailboxInput.idempotencyKey
      )
      : undefined;
    if (existing) return existing;
    const event = {
      id: `parent-mailbox-${parentMailboxEvents.length + 1}`,
      parentThreadId: mailboxInput.parentThreadId,
      parentRunId: mailboxInput.parentRunId,
      ...(mailboxInput.parentMessageId ? { parentMessageId: mailboxInput.parentMessageId } : {}),
      type: mailboxInput.type,
      payload: mailboxInput.payload,
      deliveryState: mailboxInput.deliveryState ?? "queued",
      ...(mailboxInput.idempotencyKey ? { idempotencyKey: mailboxInput.idempotencyKey } : {}),
      createdAt: mailboxInput.createdAt ?? "2026-06-06T12:00:00.000Z",
      updatedAt: mailboxInput.createdAt ?? "2026-06-06T12:00:00.000Z",
      ...(mailboxInput.deliveredAt ? { deliveredAt: mailboxInput.deliveredAt } : {}),
    } as SubagentParentMailboxEventSummary;
    parentMailboxEvents.push(event);
    return event;
  });
  const addMessage = vi.fn((message: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }) => message);

  return {
    getSubagentRun,
    markSubagentRunStatus,
    listSubagentMailboxEvents,
    updateSubagentMailboxEventDeliveryState,
    appendSubagentMailboxEvent,
    getSubagentWaitBarrier,
    updateSubagentWaitBarrierStatus,
    listSubagentRunEvents,
    appendSubagentRunEvent,
    appendSubagentParentMailboxEvent,
    addMessage,
  };
}

function run(overrides: {
  id?: string;
  parentThreadId?: string;
  parentRunId?: string;
  parentMessageId?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  status?: SubagentRunStatus;
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  return {
    id,
    parentThreadId: overrides.parentThreadId ?? "parent-thread",
    parentRunId: overrides.parentRunId ?? "parent-run",
    ...(overrides.parentMessageId ? { parentMessageId: overrides.parentMessageId } : {}),
    childThreadId: overrides.childThreadId ?? `${id}-thread`,
    canonicalTaskPath: overrides.canonicalTaskPath ?? `root/${id}:reviewer`,
    roleId: "reviewer",
    dependencyMode: "required",
    status: overrides.status ?? "running",
  } as SubagentRunSummary;
}

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    timeoutMs: 300_000,
    createdAt: "2026-06-06T12:00:00.000Z",
    updatedAt: "2026-06-06T12:00:00.000Z",
    ...overrides,
  };
}

function mailbox(overrides: Partial<SubagentMailboxEventSummary> = {}): SubagentMailboxEventSummary {
  return {
    id: "mailbox",
    runId: "child-run",
    direction: "parent_to_child",
    type: "subagent.followup",
    payload: {},
    deliveryState: "queued",
    createdAt: "2026-06-06T12:00:00.000Z",
    ...overrides,
  };
}

function runEvent(overrides: {
  runId?: string;
  sequence?: number;
  type: string;
  preview?: unknown;
  artifactPath?: string;
  createdAt?: string;
}): SubagentRunEventSummary {
  return {
    runId: overrides.runId ?? "child-run",
    sequence: overrides.sequence ?? 1,
    type: overrides.type,
    ...(overrides.preview !== undefined ? { preview: overrides.preview } : {}),
    ...(overrides.artifactPath ? { artifactPath: overrides.artifactPath } : {}),
    createdAt: overrides.createdAt ?? "2026-06-06T12:00:00.000Z",
  } as SubagentRunEventSummary;
}
