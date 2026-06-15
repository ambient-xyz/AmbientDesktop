import { describe, expect, it } from "vitest";
import type {
  CallableWorkflowTaskSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
  type CallableWorkflowParentBlockingBlock,
} from "./callableWorkflowParentBlocking";
import {
  callableWorkflowFinalizationBlockedActivity,
  callableWorkflowFinalizationBlock,
  recordCallableWorkflowFinalizationBlockedParentMailbox,
  recordSubagentFinalizationBlockedParentMailbox,
  subagentFinalizationBlockedActivity,
  subagentFinalizationBarrierBlock,
  subagentFinalizationBlockParentResolution,
  subagentFinalizationBlockUserChoices,
  type SubagentFinalizationBarrierBlock,
} from "./agentRuntimeFinalizationBlocking";

describe("agent runtime finalization blocking helpers", () => {
  it("builds subagent finalization barrier blocks from unresolved required barriers", () => {
    const block = subagentFinalizationBarrierBlock({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      listSubagentWaitBarriersForParentRun: () => [
        waitBarrier({ id: "barrier-waiting", childRunIds: ["child-run-1", "missing-run"] }),
        waitBarrier({ id: "barrier-satisfied", status: "satisfied", childRunIds: ["child-run-2"] }),
        waitBarrier({ id: "barrier-background", dependencyMode: "optional_background", childRunIds: ["child-run-3"] }),
        waitBarrier({ id: "barrier-other-parent", parentThreadId: "other-thread", childRunIds: ["child-run-4"] }),
      ],
      getSubagentRun: (runId) => {
        if (runId === "child-run-1") return subagentRun({ id: "child-run-1", status: "running" });
        throw new Error("missing run");
      },
    });

    expect(block).toEqual({
      message: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
      barrierIds: ["barrier-waiting"],
      childRunIds: ["child-run-1", "missing-run"],
      barriers: [
        {
          id: "barrier-waiting",
          dependencyMode: "required_all",
          status: "waiting_on_children",
          failurePolicy: "ask_user",
          childRunIds: ["child-run-1", "missing-run"],
        },
      ],
    });
    expect(block?.message).toContain("child-run-1 (running), missing-run (missing)");
  });

  it("creates parent-resolution policy and allowed choices for subagent barriers", () => {
    const waiting = waitBarrier({ status: "waiting_on_children", failurePolicy: "ask_user" });
    expect(subagentFinalizationBlockParentResolution(waiting, subagentRun({ status: "running" }), "blocked")).toMatchObject({
      action: "wait_for_child",
      requiresUserInput: false,
      requiresExplicitPartial: false,
      instruction: expect.stringContaining("Wait again"),
    });
    expect(subagentFinalizationBlockUserChoices("wait_for_child", "ask_user").map((choice) => choice.id)).toEqual([
      "wait_again",
      "send_child_steering",
      "cancel_parent",
    ]);

    const partial = waitBarrier({ status: "timed_out", failurePolicy: "degrade_partial" });
    expect(subagentFinalizationBlockParentResolution(partial, undefined, "partial needed")).toMatchObject({
      action: "ask_user",
      requiresUserInput: true,
      requiresExplicitPartial: true,
    });
    expect(subagentFinalizationBlockUserChoices("ask_user", "degrade_partial")[0]).toMatchObject({
      id: "continue_with_partial",
      requiresUserDecision: true,
      requiresPartialSummary: true,
    });
  });

  it("builds finalization blocked runtime activities", () => {
    const subagentBlock = finalizationBlock({
      barrierIds: ["barrier-1", "barrier-2"],
      childRunIds: ["child-run-1", "child-run-2"],
    });
    expect(subagentFinalizationBlockedActivity({
      threadId: "parent-thread",
      outputChars: 42,
      block: subagentBlock,
    })).toEqual({
      threadId: "parent-thread",
      kind: "stream",
      status: "timeout",
      outputChars: 42,
      message: "Parent final answer blocked by required sub-agent work that is not safe for synthesis.",
      diagnostic: {
        reason: "required_wait_barrier_not_satisfied",
        barrierIds: ["barrier-1", "barrier-2"],
        childRunIds: ["child-run-1", "child-run-2"],
      },
    });

    const callableBlock = callableWorkflowFinalizationBlock({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      listCallableWorkflowTasksForParentRun: () => [
        callableTask({ id: "task-running", status: "running", workflowRunId: "workflow-run-1" }),
      ],
    });
    expect(callableWorkflowFinalizationBlockedActivity({
      threadId: "parent-thread",
      outputChars: 13,
      block: callableBlock!,
    })).toEqual({
      threadId: "parent-thread",
      kind: "stream",
      status: "timeout",
      outputChars: 13,
      message: "Parent final answer blocked by blocking callable workflow work that is not safe for synthesis.",
      diagnostic: {
        reason: callableBlock!.reason,
        taskIds: ["task-running"],
        workflowRunIds: ["workflow-run-1"],
      },
    });
  });

  it("records subagent finalization mailbox events with policy payloads", () => {
    const barrier = waitBarrier({
      id: "barrier-1",
      status: "timed_out",
      failurePolicy: "degrade_partial",
      childRunIds: ["child-run-1", "missing-run"],
      quorumThreshold: 2,
      timeoutMs: 1000,
    });
    const appended: unknown[] = [];
    const emitted: SubagentParentMailboxEventSummary[] = [];

    const events = recordSubagentFinalizationBlockedParentMailbox({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      block: finalizationBlock({ barriers: [{
        id: barrier.id,
        dependencyMode: barrier.dependencyMode,
        status: barrier.status,
        failurePolicy: barrier.failurePolicy,
        childRunIds: barrier.childRunIds,
      }] }),
      getSubagentWaitBarrier: (barrierId) => {
        expect(barrierId).toBe("barrier-1");
        return barrier;
      },
      getSubagentRun: (runId) => {
        if (runId === "child-run-1") return subagentRun({ id: "child-run-1", status: "failed", parentMessageId: "parent-message" });
        throw new Error("missing run");
      },
      appendSubagentParentMailboxEvent: (event) => {
        appended.push(event);
        return parentMailboxEvent(event);
      },
      emitSubagentParentMailboxEventUpdated: (event) => emitted.push(event),
    });

    expect(events).toHaveLength(1);
    expect(emitted).toEqual(events);
    expect(appended[0]).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      type: "subagent.wait_barrier_attention",
      deliveryState: "queued",
      idempotencyKey: "subagent:finalization_blocked:parent-run:barrier-1:2026-06-11T00:00:01.000Z",
      payload: {
        schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
        childRunId: "child-run-1",
        childThreadId: "child-thread",
        waitBarrierId: "barrier-1",
        waitTimedOut: true,
        parentFinalizationBlocked: true,
        allowedUserChoices: [expect.objectContaining({ id: "continue_with_partial" }), expect.any(Object), expect.any(Object), expect.any(Object), expect.any(Object), expect.any(Object)],
        waitBarrier: {
          quorumThreshold: 2,
          timeoutMs: 1000,
        },
      },
    });
  });

  it("plans and records callable workflow finalization blocks", () => {
    const block = callableWorkflowFinalizationBlock({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      listCallableWorkflowTasksForParentRun: () => [
        callableTask({ id: "task-waiting", status: "running", blocking: true }),
        callableTask({ id: "task-done", status: "succeeded", blocking: true }),
        callableTask({ id: "task-other-parent", parentThreadId: "other-thread", status: "running", blocking: true }),
      ],
    });
    expect(block).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      taskIds: ["task-waiting"],
      waitingTaskIds: ["task-waiting"],
      attentionTaskIds: [],
    });

    const appended: unknown[] = [];
    const emitted: SubagentParentMailboxEventSummary[] = [];
    const event = recordCallableWorkflowFinalizationBlockedParentMailbox({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      block: block!,
      appendSubagentParentMailboxEvent: (input) => {
        appended.push(input);
        return parentMailboxEvent(input);
      },
      emitSubagentParentMailboxEventUpdated: (input) => emitted.push(input),
    });

    expect(emitted).toEqual([event]);
    expect(appended[0]).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      type: CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
      deliveryState: "queued",
      payload: {
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        taskIds: ["task-waiting"],
        allowedUserChoices: [
          expect.objectContaining({ id: "wait_again", taskIds: ["task-waiting"] }),
          expect.objectContaining({ id: "cancel_parent", taskIds: ["task-waiting"] }),
        ],
      },
    });
  });
});

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run-1"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:01.000Z",
    ...overrides,
  };
}

function subagentRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "child-run-1",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    childThreadId: "child-thread",
    canonicalTaskPath: "Task",
    roleId: "worker",
    roleProfileSnapshot: {} as SubagentRunSummary["roleProfileSnapshot"],
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "running",
    featureFlagSnapshot: {} as SubagentRunSummary["featureFlagSnapshot"],
    modelRuntimeSnapshot: {} as SubagentRunSummary["modelRuntimeSnapshot"],
    capacityLeaseSnapshot: {} as SubagentRunSummary["capacityLeaseSnapshot"],
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:01.000Z",
    ...overrides,
  };
}

function finalizationBlock(overrides: Partial<SubagentFinalizationBarrierBlock> = {}): SubagentFinalizationBarrierBlock {
  return {
    message: "Parent final answer blocked because required sub-agent work is not safe for synthesis.",
    barrierIds: ["barrier-1"],
    childRunIds: ["child-run-1"],
    barriers: [
      {
        id: "barrier-1",
        dependencyMode: "required_all",
        status: "waiting_on_children",
        failurePolicy: "ask_user",
        childRunIds: ["child-run-1"],
      },
    ],
    ...overrides,
  };
}

function callableTask(overrides: Partial<CallableWorkflowTaskSummary> = {}): CallableWorkflowTaskSummary {
  return {
    id: "task-waiting",
    launchId: "launch-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    toolCallId: "tool-call-1",
    toolId: "tool-1",
    toolName: "run_workflow",
    sourceKind: "recording",
    title: "Run workflow",
    status: "running",
    statusLabel: "Running",
    blocking: true,
    defaultCollapsed: false,
    progressVisible: true,
    tokenCostTracking: false,
    pauseResumeCancel: true,
    cancelHandle: "cancel-1",
    runnerTarget: "workflow-runner",
    runnerDeferredReason: "running",
    workflowArtifactId: "workflow-artifact",
    workflowRunId: "workflow-run",
    executionPlan: {},
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:01.000Z",
    ...overrides,
  };
}

function parentMailboxEvent(input: {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: string;
  payload: unknown;
  deliveryState: "queued";
  idempotencyKey?: string;
}): SubagentParentMailboxEventSummary {
  return {
    id: "mailbox-event-1",
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: input.type,
    payload: input.payload,
    deliveryState: input.deliveryState,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
  };
}
