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
      childBlockers: [
        {
          childRunId: "child-run-1",
          childThreadId: "child-thread",
          canonicalTaskPath: "Task",
          roleId: "worker",
          status: "running",
          dependencyMode: "required_all",
          barrierIds: ["barrier-waiting"],
          lastActivityAt: "2026-06-11T00:00:01.000Z",
          lastActivitySource: "subagent_run",
          lastActivityDetail: "run updated",
        },
        {
          childRunId: "missing-run",
          status: "missing",
          dependencyMode: "required_all",
          barrierIds: ["barrier-waiting"],
          lastActivityAt: "2026-06-11T00:00:01.000Z",
          lastActivitySource: "wait_barrier",
          lastActivityDetail: "child run missing from store",
        },
      ],
      barriers: [
        {
          id: "barrier-waiting",
          dependencyMode: "required_all",
          status: "waiting_on_children",
          failurePolicy: "ask_user",
          childRunIds: ["child-run-1", "missing-run"],
          childBlockers: [
            expect.objectContaining({
              childRunId: "child-run-1",
              canonicalTaskPath: "Task",
              lastActivitySource: "subagent_run",
            }),
            expect.objectContaining({
              childRunId: "missing-run",
              status: "missing",
              lastActivitySource: "wait_barrier",
            }),
          ],
        },
      ],
    });
    expect(block?.message).toContain("Child blockers: child-run-1 (running, path Task, thread child-thread, last activity 2026-06-11T00:00:01.000Z via subagent_run)");
    expect(block?.message).toContain("missing-run (missing, last activity 2026-06-11T00:00:01.000Z via wait_barrier)");
  });

  it("keeps timed-out required barriers blocked even when a child later completes", () => {
    const barrier = waitBarrier({
      id: "barrier-timed-out",
      status: "timed_out",
      failurePolicy: "degrade_partial",
      childRunIds: ["child-run-1"],
    });
    const child = subagentRun({
      id: "child-run-1",
      status: "completed",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-v1",
        runId: "child-run-1",
        status: "completed",
        summary: "Late child result.",
      },
    });

    const block = subagentFinalizationBarrierBlock({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      listSubagentWaitBarriersForParentRun: () => [barrier],
      getSubagentRun: () => child,
    });

    expect(block).toMatchObject({
      barrierIds: ["barrier-timed-out"],
      childRunIds: ["child-run-1"],
      childBlockers: [
        expect.objectContaining({
          childRunId: "child-run-1",
          status: "completed",
        }),
      ],
      barriers: [
        expect.objectContaining({
          id: "barrier-timed-out",
          status: "timed_out",
          failurePolicy: "degrade_partial",
        }),
      ],
    });
    expect(subagentFinalizationBlockParentResolution(barrier, child, "blocked")).toMatchObject({
      action: "ask_user",
      canSynthesize: false,
      requiresExplicitPartial: true,
    });
  });

  it("uses runtime and mailbox activity as finalization blocker liveness evidence", () => {
    const block = subagentFinalizationBarrierBlock({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      listSubagentWaitBarriersForParentRun: () => [
        waitBarrier({ id: "barrier-active", childRunIds: ["child-run-1"] }),
      ],
      getSubagentRun: () => subagentRun({
        id: "child-run-1",
        status: "running",
        canonicalTaskPath: "root/2:researcher",
        updatedAt: "2026-06-11T00:00:01.000Z",
      }),
      listSubagentRunEvents: () => [{
        runId: "child-run-1",
        sequence: 7,
        type: "subagent.runtime_event",
        createdAt: "2026-06-11T00:00:05.000Z",
        preview: { type: "assistant_delta" },
      }],
      listSubagentMailboxEvents: () => [{
        id: "mailbox-approval",
        runId: "child-run-1",
        direction: "parent_to_child",
        type: "subagent.approval_response",
        payload: { approvalId: "approval-1" },
        deliveryState: "delivered",
        createdAt: "2026-06-11T00:00:06.000Z",
        deliveredAt: "2026-06-11T00:00:07.000Z",
      }],
    });

    expect(block?.childBlockers).toEqual([
      expect.objectContaining({
        childRunId: "child-run-1",
        canonicalTaskPath: "root/2:researcher",
        status: "running",
        lastActivityAt: "2026-06-11T00:00:07.000Z",
        lastActivitySource: "mailbox:subagent.approval_response",
        lastActivityDetail: "delivered",
      }),
    ]);
    expect(block?.barriers[0]?.childBlockers[0]).toMatchObject({
      childRunId: "child-run-1",
      lastActivitySource: "mailbox:subagent.approval_response",
    });
    expect(block?.message).toContain("child-run-1 (running, path root/2:researcher, thread child-thread, last activity 2026-06-11T00:00:07.000Z via mailbox:subagent.approval_response)");
  });

  it("carries result-contract repair pending state through finalization blockers", () => {
    const barrier = waitBarrier({ id: "barrier-repair", childRunIds: ["child-run-1"] });
    const run = subagentRun({
      id: "child-run-1",
      status: "running",
      canonicalTaskPath: "root/1:explorer",
      roleId: "explorer",
    });
    const runEvents = [
      {
        runId: "child-run-1",
        sequence: 3,
        type: "subagent.result_contract_followup_required",
        createdAt: "2026-06-11T00:00:05.000Z",
        preview: {
          reason: "Structured result roleId must match child role explorer.",
          hadAssistantText: true,
        },
      },
      {
        runId: "child-run-1",
        sequence: 4,
        type: "subagent.internal_post_tool_followup_started",
        createdAt: "2026-06-11T00:00:06.000Z",
        preview: {
          attempt: 1,
          maxAttempts: 2,
          reason: "Structured result roleId must match child role explorer.",
        },
      },
    ];
    const block = subagentFinalizationBarrierBlock({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      listSubagentWaitBarriersForParentRun: () => [barrier],
      getSubagentRun: () => run,
      listSubagentRunEvents: () => runEvents,
      listSubagentMailboxEvents: () => [],
    });

    expect(block).toMatchObject({
      barrierIds: ["barrier-repair"],
      childRunIds: ["child-run-1"],
      childBlockers: [
        expect.objectContaining({
          childRunId: "child-run-1",
          status: "running",
          lastActivityAt: "2026-06-11T00:00:06.000Z",
          lastActivitySource: "run_event:subagent.internal_post_tool_followup_started",
          resultRepairState: {
            schemaVersion: "ambient-subagent-result-repair-state-v1",
            state: "result_contract_repair_pending",
            reason: "Structured result roleId must match child role explorer.",
            detectedAt: "2026-06-11T00:00:05.000Z",
            eventSequence: 3,
            hadAssistantText: true,
            latestInternalFollowupAt: "2026-06-11T00:00:06.000Z",
            latestInternalFollowupSequence: 4,
            latestInternalFollowupAttempt: 1,
            maxAttempts: 2,
          },
        }),
      ],
      barriers: [
        expect.objectContaining({
          id: "barrier-repair",
          status: "waiting_on_children",
          childBlockers: [
            expect.objectContaining({
              resultRepairState: expect.objectContaining({
                state: "result_contract_repair_pending",
              }),
            }),
          ],
        }),
      ],
    });
    expect(block?.message).toContain("repair pending: Structured result roleId must match child role explorer.");

    const activity = subagentFinalizationBlockedActivity({
      threadId: "parent-thread",
      outputChars: 99,
      block: block!,
    });
    const diagnostic = activity.diagnostic as { childBlockers: Array<Record<string, unknown>> };
    expect(diagnostic.childBlockers).toEqual([
      expect.objectContaining({
        childRunId: "child-run-1",
        resultRepairState: expect.objectContaining({
          state: "result_contract_repair_pending",
          reason: "Structured result roleId must match child role explorer.",
        }),
      }),
    ]);

    const appended: unknown[] = [];
    recordSubagentFinalizationBlockedParentMailbox({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      block: block!,
      getSubagentWaitBarrier: () => barrier,
      getSubagentRun: () => run,
      appendSubagentParentMailboxEvent: (event) => {
        appended.push(event);
        return parentMailboxEvent(event);
      },
      emitSubagentParentMailboxEventUpdated: () => undefined,
    });
    expect(appended[0]).toMatchObject({
      payload: {
        childBlockers: [
          expect.objectContaining({
            childRunId: "child-run-1",
            resultRepairState: expect.objectContaining({
              state: "result_contract_repair_pending",
              reason: "Structured result roleId must match child role explorer.",
            }),
          }),
        ],
        waitBarrier: {
          id: "barrier-repair",
          status: "waiting_on_children",
          childBlockers: [
            expect.objectContaining({
              resultRepairState: expect.objectContaining({
                state: "result_contract_repair_pending",
              }),
            }),
          ],
        },
      },
    });
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
        childBlockers: [
          expect.objectContaining({ childRunId: "child-run-1" }),
        ],
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
        childBlockers: [],
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
        childBlockers: [
          expect.objectContaining({
            childRunId: "child-run-1",
            childThreadId: "child-thread",
            canonicalTaskPath: "Task",
            status: "failed",
            lastActivityAt: "2026-06-11T00:00:01.000Z",
          }),
          expect.objectContaining({
            childRunId: "missing-run",
            status: "missing",
            lastActivitySource: "wait_barrier",
          }),
        ],
        waitTimedOut: true,
        parentFinalizationBlocked: true,
        allowedUserChoices: [expect.objectContaining({ id: "continue_with_partial" }), expect.any(Object), expect.any(Object), expect.any(Object), expect.any(Object), expect.any(Object)],
        waitBarrier: {
          quorumThreshold: 2,
          timeoutMs: 1000,
          childBlockers: [
            expect.objectContaining({ childRunId: "child-run-1" }),
            expect.objectContaining({ childRunId: "missing-run", status: "missing" }),
          ],
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
    childBlockers: [{
      childRunId: "child-run-1",
      childThreadId: "child-thread",
      canonicalTaskPath: "Task",
      roleId: "worker",
      status: "running",
      dependencyMode: "required_all",
      barrierIds: ["barrier-1"],
      lastActivityAt: "2026-06-11T00:00:01.000Z",
      lastActivitySource: "subagent_run",
      lastActivityDetail: "run updated",
    }],
    barriers: [
      {
        id: "barrier-1",
        dependencyMode: "required_all",
        status: "waiting_on_children",
        failurePolicy: "ask_user",
        childRunIds: ["child-run-1"],
        childBlockers: [{
          childRunId: "child-run-1",
          childThreadId: "child-thread",
          canonicalTaskPath: "Task",
          roleId: "worker",
          status: "running",
          dependencyMode: "required_all",
          barrierIds: ["barrier-1"],
          lastActivityAt: "2026-06-11T00:00:01.000Z",
          lastActivitySource: "subagent_run",
          lastActivityDetail: "run updated",
        }],
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
