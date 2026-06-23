import type { CallableWorkflowTaskSummary, WorkflowRunEvent, WorkflowRunStatus } from "../../shared/workflowTypes";
import {
  buildCallableWorkflowCompilerHandoffPlan,
  CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
  type CallableWorkflowTaskControlAction,
} from "./projectStoreCallableWorkflowFacade";
import { callableWorkflowTaskControlActionLabel } from "./projectStoreSubagentMaturityHistory";
import { callableWorkflowTaskFinishState } from "./projectStoreWorkflowMappers";
import type { UpdateCallableWorkflowTaskRowInput } from "./callableWorkflowTaskRepository";
import type { AppendWorkflowRunEventInput, UpdateWorkflowRunRecordInput } from "./workflowRunRepository";

export interface MarkCallableWorkflowTaskRunStartedInput {
  id: string;
  workflowRunId: string;
  createdAt?: string;
}

export interface MarkCallableWorkflowTaskRunFinishedInput {
  id: string;
  workflowRunId: string;
  runStatus: WorkflowRunStatus;
  errorMessage?: string;
  createdAt?: string;
}

export interface RecordCallableWorkflowTaskControlInput {
  id: string;
  action: CallableWorkflowTaskControlAction;
  reason?: string;
  workflowRunId?: string;
  createdAt?: string;
}

export interface PauseCallableWorkflowTaskInput {
  id: string;
  statusLabel: string;
  runnerDeferredReason: string;
  errorMessage?: string;
  createdAt?: string;
}

export interface CancelCallableWorkflowTaskInput {
  id: string;
  reason?: string;
  createdAt?: string;
}

export interface ProjectStoreCallableWorkflowTaskLifecycleRepositoryDeps {
  appendWorkflowRunEvent(input: AppendWorkflowRunEventInput): WorkflowRunEvent;
  getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary;
  getWorkflowRun(runId: string): { id: string; artifactId: string; status: WorkflowRunStatus; error?: string | null };
  listWorkflowRunEvents(runId: string): WorkflowRunEvent[];
  updateCallableWorkflowTaskRow(input: UpdateCallableWorkflowTaskRowInput): CallableWorkflowTaskSummary;
  updateWorkflowRun(input: UpdateWorkflowRunRecordInput): unknown;
}

export class ProjectStoreCallableWorkflowTaskLifecycleRepository {
  constructor(private readonly deps: ProjectStoreCallableWorkflowTaskLifecycleRepositoryDeps) {}

  markCallableWorkflowTaskRunStarted(input: MarkCallableWorkflowTaskRunStartedInput): CallableWorkflowTaskSummary {
    const current = this.deps.getCallableWorkflowTask(input.id);
    if (!["compiling", "running", "paused"].includes(current.status)) {
      throw new Error(`Cannot start workflow run for callable workflow task ${input.id} while status is ${current.status}.`);
    }
    const run = this.deps.getWorkflowRun(input.workflowRunId);
    if (!current.workflowArtifactId) {
      throw new Error(`Cannot start workflow run for callable workflow task ${input.id} before a workflow artifact is linked.`);
    }
    if (run.artifactId !== current.workflowArtifactId) {
      throw new Error(`Callable workflow task ${input.id} cannot link a run from a different workflow artifact.`);
    }
    const resumedFromPausedRun = current.status === "paused" && current.workflowRunId && current.workflowRunId !== input.workflowRunId;
    if (current.workflowRunId && current.workflowRunId !== input.workflowRunId && !resumedFromPausedRun) {
      throw new Error(`Callable workflow task ${input.id} is already linked to a different workflow run.`);
    }
    const now = input.createdAt ?? new Date().toISOString();
    const task =
      current.status === "running" && current.workflowRunId === input.workflowRunId
        ? current
        : this.deps.updateCallableWorkflowTaskRow({
            id: input.id,
            status: "running",
            statusLabel: "Running",
            runnerDeferredReason: "workflow_run_started",
            workflowRunId: input.workflowRunId,
            updatedAt: now,
            startedAt: current.startedAt ?? now,
          });
    this.appendCallableWorkflowTaskStartedEventIfNeeded(task, run.id, now);
    return this.deps.getCallableWorkflowTask(input.id);
  }

  markCallableWorkflowTaskRunFinished(input: MarkCallableWorkflowTaskRunFinishedInput): CallableWorkflowTaskSummary {
    const current = this.deps.getCallableWorkflowTask(input.id);
    const run = this.deps.getWorkflowRun(input.workflowRunId);
    if (current.workflowRunId && current.workflowRunId !== input.workflowRunId) {
      throw new Error(`Callable workflow task ${input.id} is already linked to a different workflow run.`);
    }
    if (current.workflowArtifactId && run.artifactId !== current.workflowArtifactId) {
      throw new Error(`Callable workflow task ${input.id} cannot finish with a run from a different workflow artifact.`);
    }
    if (["succeeded", "failed", "canceled"].includes(current.status)) {
      return current;
    }
    const finish = callableWorkflowTaskFinishState(input.runStatus);
    const now = input.createdAt ?? new Date().toISOString();
    const task = this.deps.updateCallableWorkflowTaskRow({
      id: input.id,
      status: finish.status,
      statusLabel: finish.statusLabel,
      runnerDeferredReason: finish.runnerDeferredReason,
      workflowArtifactId: current.workflowArtifactId ?? run.artifactId,
      workflowRunId: input.workflowRunId,
      errorMessage: input.errorMessage,
      updatedAt: now,
      startedAt: current.startedAt ?? now,
      completedAt: finish.completed ? now : current.completedAt,
    });
    this.appendCallableWorkflowTaskFinishedEventIfNeeded(task, run.id, input.runStatus, now);
    return this.deps.getCallableWorkflowTask(input.id);
  }

  recordCallableWorkflowTaskControl(input: RecordCallableWorkflowTaskControlInput): void {
    const task = this.deps.getCallableWorkflowTask(input.id);
    const workflowRunId = input.workflowRunId ?? task.workflowRunId;
    if (!workflowRunId) return;
    this.deps.getWorkflowRun(workflowRunId);
    this.appendCallableWorkflowTaskControlEventIfNeeded(
      task,
      workflowRunId,
      input.action,
      input.reason,
      input.createdAt ?? new Date().toISOString(),
    );
  }

  pauseCallableWorkflowTask(input: PauseCallableWorkflowTaskInput): CallableWorkflowTaskSummary {
    const current = this.deps.getCallableWorkflowTask(input.id);
    if (["succeeded", "failed", "canceled"].includes(current.status)) {
      throw new Error(`Cannot pause callable workflow task ${input.id} after terminal status ${current.status}.`);
    }
    const now = input.createdAt ?? new Date().toISOString();
    return this.deps.updateCallableWorkflowTaskRow({
      id: input.id,
      status: "paused",
      statusLabel: input.statusLabel,
      runnerDeferredReason: input.runnerDeferredReason,
      errorMessage: input.errorMessage,
      updatedAt: now,
      startedAt: current.startedAt ?? now,
    });
  }

  cancelCallableWorkflowTask(input: CancelCallableWorkflowTaskInput): CallableWorkflowTaskSummary {
    const current = this.deps.getCallableWorkflowTask(input.id);
    if (["succeeded", "failed", "canceled"].includes(current.status)) {
      return current;
    }
    const now = input.createdAt ?? new Date().toISOString();
    const reason = input.reason?.trim() || "Canceled by user.";
    const task = this.deps.updateCallableWorkflowTaskRow({
      id: input.id,
      status: "canceled",
      statusLabel: "Canceled",
      runnerDeferredReason: "callable_workflow_task_canceled",
      errorMessage: reason,
      updatedAt: now,
      startedAt: current.startedAt ?? now,
      completedAt: now,
    });
    if (task.workflowRunId) {
      const run = this.deps.getWorkflowRun(task.workflowRunId);
      this.appendCallableWorkflowTaskControlEventIfNeeded(task, run.id, "cancel_requested", reason, now);
      if (!["succeeded", "failed", "canceled", "skipped"].includes(run.status)) {
        this.deps.updateWorkflowRun({
          id: run.id,
          status: "canceled",
          error: reason,
          finish: true,
        });
      }
      this.appendCallableWorkflowTaskFinishedEventIfNeeded(task, run.id, "canceled", now);
    }
    return this.deps.getCallableWorkflowTask(input.id);
  }

  private appendCallableWorkflowTaskStartedEventIfNeeded(
    task: CallableWorkflowTaskSummary,
    workflowRunId: string,
    createdAt: string,
  ): void {
    const existing = this.deps
      .listWorkflowRunEvents(workflowRunId)
      .find(
        (event) =>
          event.type === CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE &&
          event.data?.taskId === task.id &&
          event.data?.launchId === task.launchId,
      );
    if (existing) return;
    this.deps.appendWorkflowRunEvent({
      runId: workflowRunId,
      type: CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
      message: `Callable workflow task started: ${task.title}.`,
      createdAt,
      data: {
        taskId: task.id,
        launchId: task.launchId,
        parentThreadId: task.parentThreadId,
        parentRunId: task.parentRunId,
        parentMessageId: task.parentMessageId,
        toolCallId: task.toolCallId,
        toolId: task.toolId,
        toolName: task.toolName,
        sourceKind: task.sourceKind,
        blocking: task.blocking,
        ...this.callableWorkflowTaskCallerProvenanceEventData(task),
      },
    });
  }

  private appendCallableWorkflowTaskControlEventIfNeeded(
    task: CallableWorkflowTaskSummary,
    workflowRunId: string,
    action: CallableWorkflowTaskControlAction,
    reason: string | undefined,
    createdAt: string,
  ): void {
    const existing = this.deps
      .listWorkflowRunEvents(workflowRunId)
      .find(
        (event) =>
          event.type === CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE &&
          event.data?.taskId === task.id &&
          event.data?.launchId === task.launchId &&
          event.data?.action === action,
      );
    if (existing) return;
    const trimmedReason = reason?.trim();
    const actionLabel = callableWorkflowTaskControlActionLabel(action);
    this.deps.appendWorkflowRunEvent({
      runId: workflowRunId,
      type: CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE,
      message: `Callable workflow task ${actionLabel}: ${task.title}.`,
      createdAt,
      data: {
        taskId: task.id,
        launchId: task.launchId,
        parentThreadId: task.parentThreadId,
        parentRunId: task.parentRunId,
        parentMessageId: task.parentMessageId,
        toolCallId: task.toolCallId,
        toolId: task.toolId,
        toolName: task.toolName,
        sourceKind: task.sourceKind,
        blocking: task.blocking,
        taskStatus: task.status,
        action,
        reason: trimmedReason || undefined,
        ...this.callableWorkflowTaskCallerProvenanceEventData(task),
      },
    });
  }

  private appendCallableWorkflowTaskFinishedEventIfNeeded(
    task: CallableWorkflowTaskSummary,
    workflowRunId: string,
    runStatus: WorkflowRunStatus,
    createdAt: string,
  ): void {
    const existing = this.deps
      .listWorkflowRunEvents(workflowRunId)
      .find(
        (event) =>
          event.type === CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE &&
          event.data?.taskId === task.id &&
          event.data?.launchId === task.launchId &&
          event.data?.runStatus === runStatus,
      );
    if (existing) return;
    this.deps.appendWorkflowRunEvent({
      runId: workflowRunId,
      type: CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
      message: `Callable workflow task ${task.status}: ${task.title}.`,
      createdAt,
      data: {
        taskId: task.id,
        launchId: task.launchId,
        parentThreadId: task.parentThreadId,
        parentRunId: task.parentRunId,
        parentMessageId: task.parentMessageId,
        toolCallId: task.toolCallId,
        toolId: task.toolId,
        toolName: task.toolName,
        sourceKind: task.sourceKind,
        blocking: task.blocking,
        taskStatus: task.status,
        runStatus,
        errorMessage: task.errorMessage,
        ...this.callableWorkflowTaskCallerProvenanceEventData(task),
      },
    });
  }

  private callableWorkflowTaskCallerProvenanceEventData(task: CallableWorkflowTaskSummary): Record<string, unknown> {
    const provenance = buildCallableWorkflowCompilerHandoffPlan({ task }).callerProvenance;
    const base = {
      callerKind: provenance.kind,
      callerThreadId: provenance.threadId,
      callerRunId: provenance.runId,
      callerMessageId: provenance.messageId,
    };
    if (provenance.kind !== "subagent_child_thread") return base;
    return {
      ...base,
      childThreadId: provenance.threadId,
      childRunId: provenance.subagentRunId ?? provenance.runId,
      childThreadRunId: provenance.runId,
      subagentRunId: provenance.subagentRunId,
      canonicalTaskPath: provenance.canonicalTaskPath,
      childParentThreadId: provenance.parentThreadId,
      childParentRunId: provenance.parentRunId,
      approvalRequired: provenance.approval.required,
      approvalSource: provenance.approval.source,
      approvalScope: provenance.approval.scopeHint,
      worktreeRequired: provenance.worktree.required,
      worktreeIsolated: provenance.worktree.isolated,
      worktreePath: provenance.worktree.worktreePath,
      nestedFanoutRequired: provenance.nestedFanout.required,
      nestedFanoutSource: provenance.nestedFanout.source,
    };
  }
}
