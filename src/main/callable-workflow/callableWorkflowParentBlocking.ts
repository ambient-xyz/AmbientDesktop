import { createHash } from "node:crypto";
import type { CallableWorkflowTaskStatus, CallableWorkflowTaskSummary } from "../../shared/types";

export const CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION =
  "ambient-callable-workflow-parent-blocking-v1" as const;
export const CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE =
  "callable_workflow.parent_finalization_blocked" as const;
export const CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON =
  "blocking_callable_workflow_not_synthesis_safe" as const;

export type CallableWorkflowParentBlockingTaskGroup = "waiting_on_workflow" | "needs_attention";

export interface CallableWorkflowParentBlockingTask {
  id: string;
  launchId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  toolCallId: string;
  toolId: string;
  toolName: string;
  sourceKind: string;
  title: string;
  status: CallableWorkflowTaskStatus;
  statusLabel: string;
  statusGroup: CallableWorkflowParentBlockingTaskGroup;
  blocking: true;
  runnerTarget: string;
  runnerDeferredReason: string;
  workflowArtifactId?: string;
  workflowRunId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CallableWorkflowParentBlockingBlock {
  schemaVersion: typeof CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION;
  reason: typeof CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON;
  message: string;
  instruction: string;
  parentThreadId?: string;
  parentRunId?: string;
  parentMessageId?: string;
  synthesisAllowed: false;
  parentFinalizationBlocked: true;
  taskIds: string[];
  launchIds: string[];
  workflowArtifactIds: string[];
  workflowRunIds: string[];
  waitingTaskIds: string[];
  attentionTaskIds: string[];
  tasks: CallableWorkflowParentBlockingTask[];
}

export function resolveCallableWorkflowParentBlocking(input: {
  tasks: readonly CallableWorkflowTaskSummary[];
}): CallableWorkflowParentBlockingBlock | undefined {
  const tasks = input.tasks
    .filter((task) => task.blocking && !callableWorkflowTaskIsSynthesisSafe(task))
    .map(compactCallableWorkflowParentBlockingTask);
  if (tasks.length === 0) return undefined;

  const parentThreadIds = uniqueStrings(tasks.map((task) => task.parentThreadId));
  const parentRunIds = uniqueStrings(tasks.map((task) => task.parentRunId));
  const parentMessageIds = uniqueStrings(tasks.map((task) => task.parentMessageId));
  const waitingTaskIds = tasks
    .filter((task) => task.statusGroup === "waiting_on_workflow")
    .map((task) => task.id);
  const attentionTaskIds = tasks
    .filter((task) => task.statusGroup === "needs_attention")
    .map((task) => task.id);

  return {
    schemaVersion: CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION,
    reason: CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON,
    message: callableWorkflowParentBlockingMessage(tasks),
    instruction: "Do not synthesize workflow work. Wait for queued, compiling, or running blocking workflows; ask the user before proceeding past paused, failed, or canceled blocking workflow tasks.",
    parentThreadId: parentThreadIds.length === 1 ? parentThreadIds[0] : undefined,
    parentRunId: parentRunIds.length === 1 ? parentRunIds[0] : undefined,
    parentMessageId: parentMessageIds.length === 1 ? parentMessageIds[0] : undefined,
    synthesisAllowed: false,
    parentFinalizationBlocked: true,
    taskIds: tasks.map((task) => task.id),
    launchIds: tasks.map((task) => task.launchId),
    workflowArtifactIds: uniqueStrings(tasks.map((task) => task.workflowArtifactId)),
    workflowRunIds: uniqueStrings(tasks.map((task) => task.workflowRunId)),
    waitingTaskIds,
    attentionTaskIds,
    tasks,
  };
}

export function callableWorkflowParentBlockingIdempotencyKey(input: {
  parentRunId: string;
  block: CallableWorkflowParentBlockingBlock;
}): string {
  const digest = createHash("sha256")
    .update(input.parentRunId)
    .update("\0")
    .update(input.block.tasks.map((task) => [
      task.id,
      task.status,
      task.runnerDeferredReason,
      task.workflowArtifactId ?? "",
      task.workflowRunId ?? "",
      task.updatedAt,
    ].join(":")).join("|"))
    .digest("hex")
    .slice(0, 20);
  return `callable-workflow:parent-finalization-blocked:${input.parentRunId}:${digest}`;
}

export function callableWorkflowParentBlockingAllowedUserChoices(
  block: CallableWorkflowParentBlockingBlock,
): Array<Record<string, unknown>> {
  const choices: Array<Record<string, unknown>> = [
    {
      id: "wait_again",
      label: "Wait again",
      action: "wait_for_workflow",
      taskIds: block.waitingTaskIds,
    },
  ];
  if (block.attentionTaskIds.length > 0) {
    choices.push({
      id: "inspect_workflow",
      label: "Inspect workflow",
      action: "inspect_blocking_workflow",
      taskIds: block.attentionTaskIds,
    });
  }
  choices.push({
    id: "cancel_parent",
    label: "Cancel parent run",
    action: "cancel_parent_run",
    taskIds: block.taskIds,
  });
  return choices;
}

function callableWorkflowTaskIsSynthesisSafe(task: CallableWorkflowTaskSummary): boolean {
  return task.status === "succeeded";
}

function compactCallableWorkflowParentBlockingTask(
  task: CallableWorkflowTaskSummary,
): CallableWorkflowParentBlockingTask {
  return {
    id: task.id,
    launchId: task.launchId,
    parentThreadId: task.parentThreadId,
    parentRunId: task.parentRunId,
    parentMessageId: task.parentMessageId,
    toolCallId: task.toolCallId,
    toolId: task.toolId,
    toolName: task.toolName,
    sourceKind: task.sourceKind,
    title: task.title,
    status: task.status,
    statusLabel: task.statusLabel,
    statusGroup: callableWorkflowParentBlockingTaskGroup(task.status),
    blocking: true,
    runnerTarget: task.runnerTarget,
    runnerDeferredReason: task.runnerDeferredReason,
    workflowArtifactId: task.workflowArtifactId,
    workflowRunId: task.workflowRunId,
    errorMessage: task.errorMessage,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

function callableWorkflowParentBlockingTaskGroup(
  status: CallableWorkflowTaskStatus,
): CallableWorkflowParentBlockingTaskGroup {
  return ["queued", "compiling", "running"].includes(status)
    ? "waiting_on_workflow"
    : "needs_attention";
}

function callableWorkflowParentBlockingMessage(
  tasks: readonly CallableWorkflowParentBlockingTask[],
): string {
  const previews = tasks
    .slice(0, 4)
    .map((task) => `${task.title} (${task.statusLabel || task.status})`);
  const suffix = tasks.length > previews.length ? ` and ${tasks.length - previews.length} more` : "";
  return [
    "Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    `Blocking workflow task${tasks.length === 1 ? "" : "s"}: ${previews.join(", ")}${suffix}.`,
  ].join(" ");
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}
