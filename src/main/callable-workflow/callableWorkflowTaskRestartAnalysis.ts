import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  CallableWorkflowTaskRestartIssue,
  CallableWorkflowTaskRestartReconciliationSummary,
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskSummary,
  WorkflowArtifactSummary,
  WorkflowRunStatus,
  WorkflowRunSummary,
} from "../../shared/workflowTypes";

export interface CallableWorkflowTaskParentRunSnapshot {
  id: string;
  threadId: string;
}

const CALLABLE_WORKFLOW_TASK_RESTART_ACTIVE_TASK_STATUSES = new Set<CallableWorkflowTaskStatus>(["compiling", "running", "paused"]);
const CALLABLE_WORKFLOW_TASK_RESTART_TERMINAL_TASK_STATUSES = new Set<CallableWorkflowTaskStatus>(["succeeded", "failed", "canceled"]);
const CALLABLE_WORKFLOW_TASK_RESTART_TERMINAL_RUN_STATUSES = new Set<WorkflowRunStatus>(["succeeded", "failed", "canceled", "skipped"]);

export function analyzeCallableWorkflowTaskRestartState(input: {
  tasks: readonly CallableWorkflowTaskSummary[];
  threads: readonly Pick<ThreadSummary, "id">[];
  parentRuns: readonly CallableWorkflowTaskParentRunSnapshot[];
  workflowArtifacts: readonly Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">[];
  workflowRuns: readonly Pick<WorkflowRunSummary, "id" | "artifactId" | "status">[];
  createdAt?: string;
}): CallableWorkflowTaskRestartReconciliationSummary {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const issues: CallableWorkflowTaskRestartIssue[] = [];
  const threadIds = new Set(input.threads.map((thread) => thread.id));
  const parentRunsById = new Map(input.parentRuns.map((run) => [run.id, run]));
  const artifactsById = new Map(input.workflowArtifacts.map((artifact) => [artifact.id, artifact]));
  const workflowRunsById = new Map(input.workflowRuns.map((run) => [run.id, run]));

  for (const task of input.tasks) {
    if (!threadIds.has(task.parentThreadId)) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "missing_parent_thread",
          severity: "error",
          task,
          message: `Callable workflow task ${task.id} references missing parent thread ${task.parentThreadId}.`,
        }),
      );
    }

    const parentRun = parentRunsById.get(task.parentRunId);
    if (!parentRun) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "missing_parent_run",
          severity: "error",
          task,
          message: `Callable workflow task ${task.id} references missing parent run ${task.parentRunId}.`,
        }),
      );
    } else if (parentRun.threadId !== task.parentThreadId) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "parent_run_thread_mismatch",
          severity: "error",
          task,
          message: `Callable workflow task ${task.id} parent run ${task.parentRunId} belongs to thread ${parentRun.threadId}, not ${task.parentThreadId}.`,
        }),
      );
    }

    const artifact = task.workflowArtifactId ? artifactsById.get(task.workflowArtifactId) : undefined;
    if (task.workflowArtifactId && !artifact) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "missing_workflow_artifact",
          severity: "error",
          task,
          message: `Callable workflow task ${task.id} is linked to missing workflow artifact ${task.workflowArtifactId}.`,
        }),
      );
    } else if (artifact && !artifact.workflowThreadId) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "missing_workflow_thread",
          severity: "warning",
          task,
          message: `Callable workflow task ${task.id} artifact ${artifact.id} has no workflow thread link for restart rehydration.`,
        }),
      );
    }

    const workflowRun = task.workflowRunId ? workflowRunsById.get(task.workflowRunId) : undefined;
    if (task.workflowRunId && !workflowRun) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "missing_workflow_run",
          severity: "error",
          task,
          message: `Callable workflow task ${task.id} is linked to missing workflow run ${task.workflowRunId}.`,
        }),
      );
    }

    if (workflowRun && task.workflowArtifactId && workflowRun.artifactId !== task.workflowArtifactId) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "workflow_run_artifact_mismatch",
          severity: "error",
          task,
          message: `Callable workflow task ${task.id} run ${workflowRun.id} points to artifact ${workflowRun.artifactId}, not task artifact ${task.workflowArtifactId}.`,
        }),
      );
    }

    if (workflowRun && !task.workflowArtifactId) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "missing_task_artifact_link",
          severity: "warning",
          task,
          workflowArtifactId: workflowRun.artifactId,
          message: `Callable workflow task ${task.id} has workflow run ${workflowRun.id} but no task artifact link.`,
        }),
      );
    }

    if (
      workflowRun &&
      CALLABLE_WORKFLOW_TASK_RESTART_TERMINAL_RUN_STATUSES.has(workflowRun.status) &&
      !CALLABLE_WORKFLOW_TASK_RESTART_TERMINAL_TASK_STATUSES.has(task.status) &&
      (!task.workflowArtifactId || workflowRun.artifactId === task.workflowArtifactId)
    ) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "workflow_run_terminal_task_unfinished",
          severity: "warning",
          task,
          message: `Callable workflow task ${task.id} is ${task.status} but linked workflow run ${workflowRun.id} already finished as ${workflowRun.status}.`,
        }),
      );
    } else if (CALLABLE_WORKFLOW_TASK_RESTART_ACTIVE_TASK_STATUSES.has(task.status) && !workflowRun) {
      issues.push(
        callableWorkflowTaskRestartIssue({
          kind: "active_task_interrupted",
          severity: "warning",
          task,
          message: `Callable workflow task ${task.id} was ${task.status} during restart and needs workflow task reconciliation.`,
        }),
      );
    }
  }

  const repairedTaskIds = uniqueCallableWorkflowTaskRestartIds(
    issues.filter((issue) => issue.kind === "workflow_run_terminal_task_unfinished").map((issue) => issue.taskId),
  );
  const diagnosticTaskIds = uniqueCallableWorkflowTaskRestartIds(issues.map((issue) => issue.taskId));
  const staleWorkflowArtifactTaskIds = uniqueCallableWorkflowTaskRestartIds(
    issues
      .filter((issue) => issue.kind === "missing_workflow_artifact" || issue.kind === "missing_workflow_thread")
      .map((issue) => issue.taskId),
  );
  const staleWorkflowRunTaskIds = uniqueCallableWorkflowTaskRestartIds(
    issues
      .filter((issue) => issue.kind === "missing_workflow_run" || issue.kind === "workflow_run_artifact_mismatch")
      .map((issue) => issue.taskId),
  );

  return {
    schemaVersion: "ambient-callable-workflow-task-restart-v1",
    createdAt,
    issueCount: issues.length,
    repairedTaskIds,
    diagnosticTaskIds,
    staleWorkflowArtifactTaskIds,
    staleWorkflowRunTaskIds,
    issues,
  };
}

function callableWorkflowTaskRestartIssue(input: {
  kind: CallableWorkflowTaskRestartIssue["kind"];
  severity: CallableWorkflowTaskRestartIssue["severity"];
  task: CallableWorkflowTaskSummary;
  workflowArtifactId?: string;
  message: string;
}): CallableWorkflowTaskRestartIssue {
  const workflowArtifactId = input.workflowArtifactId ?? input.task.workflowArtifactId;
  const runtimeContext = callableWorkflowTaskRestartIssueRuntimeContext(input.task);
  const stable = [input.kind, input.task.id, input.task.parentRunId, workflowArtifactId ?? "", input.task.workflowRunId ?? ""].join(":");
  return {
    id: stable,
    kind: input.kind,
    severity: input.severity,
    message: input.message,
    taskId: input.task.id,
    taskStatus: input.task.status,
    taskStatusLabel: input.task.statusLabel,
    blocking: input.task.blocking,
    runnerDeferredReason: input.task.runnerDeferredReason,
    parentThreadId: input.task.parentThreadId,
    parentRunId: input.task.parentRunId,
    workflowArtifactId,
    workflowRunId: input.task.workflowRunId,
    ...runtimeContext,
  };
}

function callableWorkflowTaskRestartIssueRuntimeContext(task: CallableWorkflowTaskSummary): Partial<CallableWorkflowTaskRestartIssue> {
  const executionPlan = recordValue(task.executionPlan);
  const caller = recordValue(executionPlan.callerProvenance);
  const approval = recordValue(caller.approval);
  const worktree = recordValue(caller.worktree);
  const nestedFanout = recordValue(caller.nestedFanout);
  const callerKind = stringValue(caller.kind);
  const callerThreadId = stringValue(caller.threadId);
  const callerRunId = stringValue(caller.runId);
  const subagentRunId = stringValue(caller.subagentRunId);
  const canonicalTaskPath = stringValue(caller.canonicalTaskPath);
  const childParentThreadId = stringValue(caller.parentThreadId);
  const childParentRunId = stringValue(caller.parentRunId);
  const approvalSource = stringValue(approval.source);
  const approvalScope = stringValue(approval.scopeHint);
  const worktreeRequired = booleanValue(worktree.required);
  const worktreeIsolated = booleanValue(worktree.isolated);
  const worktreeStatus = stringValue(worktree.status);
  const nestedFanoutRequired = booleanValue(nestedFanout.required);
  const nestedFanoutSource = stringValue(nestedFanout.source);
  return {
    ...(callerKind ? { callerKind } : {}),
    ...(callerThreadId ? { callerThreadId } : {}),
    ...(callerRunId ? { callerRunId } : {}),
    ...(callerKind === "subagent_child_thread" && callerThreadId ? { childThreadId: callerThreadId } : {}),
    ...(callerKind === "subagent_child_thread" && callerRunId ? { childRunId: callerRunId } : {}),
    ...(subagentRunId ? { subagentRunId } : {}),
    ...(canonicalTaskPath ? { canonicalTaskPath } : {}),
    ...(childParentThreadId ? { childParentThreadId } : {}),
    ...(childParentRunId ? { childParentRunId } : {}),
    ...(approvalSource ? { approvalSource } : {}),
    ...(approvalScope ? { approvalScope } : {}),
    ...(worktreeRequired !== undefined ? { worktreeRequired } : {}),
    ...(worktreeIsolated !== undefined ? { worktreeIsolated } : {}),
    ...(worktreeStatus ? { worktreeStatus } : {}),
    ...(nestedFanoutRequired !== undefined ? { nestedFanoutRequired } : {}),
    ...(nestedFanoutSource ? { nestedFanoutSource } : {}),
  };
}

function uniqueCallableWorkflowTaskRestartIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
