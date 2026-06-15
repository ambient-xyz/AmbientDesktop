import { describe, expect, it } from "vitest";
import type { CallableWorkflowTaskStatus, CallableWorkflowTaskSummary } from "../shared/types";
import {
  CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
  CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
  callableWorkflowParentBlockingAllowedUserChoices,
  callableWorkflowParentBlockingIdempotencyKey,
  resolveCallableWorkflowParentBlocking,
} from "./callableWorkflowParentBlocking";

describe("callable workflow parent blocking", () => {
  it("blocks parent synthesis for unfinished required callable workflow tasks", () => {
    const block = resolveCallableWorkflowParentBlocking({
      tasks: [
        task({ id: "queued-task", status: "queued", statusLabel: "Queued" }),
        task({ id: "running-task", status: "running", statusLabel: "Running", workflowRunId: "workflow-run-1" }),
        task({ id: "background-task", status: "running", blocking: false }),
        task({ id: "done-task", status: "succeeded" }),
      ],
    });

    expect(block).toMatchObject({
      schemaVersion: CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
      reason: CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      synthesisAllowed: false,
      parentFinalizationBlocked: true,
      taskIds: ["queued-task", "running-task"],
      waitingTaskIds: ["queued-task", "running-task"],
      attentionTaskIds: [],
      workflowRunIds: ["workflow-run-1"],
      message: expect.stringContaining("Parent final answer blocked because blocking callable workflow work is not safe for synthesis."),
      tasks: [
        expect.objectContaining({
          id: "queued-task",
          status: "queued",
          statusGroup: "waiting_on_workflow",
          blocking: true,
        }),
        expect.objectContaining({
          id: "running-task",
          status: "running",
          statusGroup: "waiting_on_workflow",
          workflowRunId: "workflow-run-1",
        }),
      ],
    });
    expect(callableWorkflowParentBlockingAllowedUserChoices(block!)).toEqual([
      expect.objectContaining({ id: "wait_again", action: "wait_for_workflow" }),
      expect.objectContaining({ id: "cancel_parent", action: "cancel_parent_run" }),
    ]);
  });

  it("requires attention before parent synthesis from failed, paused, or canceled blocking workflow tasks", () => {
    const block = resolveCallableWorkflowParentBlocking({
      tasks: [
        task({ id: "paused-task", status: "paused", statusLabel: "Paused" }),
        task({ id: "failed-task", status: "failed", statusLabel: "Failed", errorMessage: "workflow failed" }),
        task({ id: "canceled-task", status: "canceled", statusLabel: "Canceled" }),
      ],
    });

    expect(block).toMatchObject({
      taskIds: ["paused-task", "failed-task", "canceled-task"],
      waitingTaskIds: [],
      attentionTaskIds: ["paused-task", "failed-task", "canceled-task"],
      tasks: [
        expect.objectContaining({ id: "paused-task", statusGroup: "needs_attention" }),
        expect.objectContaining({ id: "failed-task", statusGroup: "needs_attention", errorMessage: "workflow failed" }),
        expect.objectContaining({ id: "canceled-task", statusGroup: "needs_attention" }),
      ],
    });
    expect(callableWorkflowParentBlockingAllowedUserChoices(block!)).toEqual([
      expect.objectContaining({ id: "wait_again" }),
      expect.objectContaining({ id: "inspect_workflow", taskIds: ["paused-task", "failed-task", "canceled-task"] }),
      expect.objectContaining({ id: "cancel_parent" }),
    ]);
  });

  it("does not block when every blocking callable workflow task has succeeded", () => {
    expect(resolveCallableWorkflowParentBlocking({
      tasks: [
        task({ id: "done-1", status: "succeeded" }),
        task({ id: "background-running", status: "running", blocking: false }),
      ],
    })).toBeUndefined();
  });

  it("builds state-sensitive idempotency keys for parent mailbox evidence", () => {
    const first = resolveCallableWorkflowParentBlocking({
      tasks: [task({ id: "blocked-task", status: "running", updatedAt: "2026-06-06T18:01:00.000Z" })],
    })!;
    const repeat = resolveCallableWorkflowParentBlocking({
      tasks: [task({ id: "blocked-task", status: "running", updatedAt: "2026-06-06T18:01:00.000Z" })],
    })!;
    const changed = resolveCallableWorkflowParentBlocking({
      tasks: [task({ id: "blocked-task", status: "failed", updatedAt: "2026-06-06T18:02:00.000Z" })],
    })!;

    expect(callableWorkflowParentBlockingIdempotencyKey({ parentRunId: "parent-run", block: repeat }))
      .toBe(callableWorkflowParentBlockingIdempotencyKey({ parentRunId: "parent-run", block: first }));
    expect(callableWorkflowParentBlockingIdempotencyKey({ parentRunId: "parent-run", block: changed }))
      .not.toBe(callableWorkflowParentBlockingIdempotencyKey({ parentRunId: "parent-run", block: first }));
  });
});

function task(input: {
  id: string;
  status: CallableWorkflowTaskStatus;
  statusLabel?: string;
  blocking?: boolean;
  workflowRunId?: string;
  errorMessage?: string;
  updatedAt?: string;
}): CallableWorkflowTaskSummary {
  return {
    id: input.id,
    launchId: `launch-${input.id}`,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    toolCallId: `tool-call-${input.id}`,
    toolId: "symphony:map_reduce",
    toolName: "ambient_workflow_symphony_map_reduce",
    sourceKind: "symphony_recipe",
    title: `Workflow ${input.id}`,
    status: input.status,
    statusLabel: input.statusLabel ?? "Succeeded",
    blocking: input.blocking ?? true,
    defaultCollapsed: true,
    progressVisible: true,
    tokenCostTracking: true,
    pauseResumeCancel: true,
    cancelHandle: `cancel:${input.id}`,
    runnerTarget: "workflowCompilerService",
    runnerDeferredReason: input.status === "running" ? "workflow_run_started" : `workflow_${input.status}`,
    workflowArtifactId: "workflow-artifact",
    workflowRunId: input.workflowRunId,
    errorMessage: input.errorMessage,
    executionPlan: { schemaVersion: "ambient-callable-workflow-execution-plan-v1" },
    createdAt: "2026-06-06T18:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-06-06T18:01:00.000Z",
  };
}
