import type { CallableWorkflowTaskSummary } from "./workflowTypes";

export const CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON =
  "symphony_child_wait_needs_attention" as const;

export function isCallableWorkflowSymphonyChildWaitPreCompilePause(
  task: CallableWorkflowTaskSummary,
): boolean {
  return task.status === "paused" &&
    task.runnerDeferredReason === CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON &&
    !task.workflowArtifactId &&
    !task.workflowRunId;
}

export function canBeginCallableWorkflowCompilerHandoff(
  task: CallableWorkflowTaskSummary,
): boolean {
  return task.status === "queued" ||
    task.status === "compiling" ||
    isCallableWorkflowSymphonyChildWaitPreCompilePause(task);
}
