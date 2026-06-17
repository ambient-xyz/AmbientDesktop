import type {
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskSummary,
  CreateWorkflowAgentThreadInput,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDashboard,
  WorkflowRunStatus,
  WorkflowRunSummary,
} from "../../shared/types";
import type { CallableWorkflowCompilerHandoffPlan } from "./callableWorkflowTaskQueue";
import {
  workflowCompilerCallableInvocationContextFromRunnerInput,
  type WorkflowCompilerCallableInvocationContext,
} from "../workflow-compiler/workflowCompilerService";

export const CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION =
  "ambient-callable-workflow-runner-bridge-v1" as const;

export interface CallableWorkflowRunnerStore {
  getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary;
  beginCallableWorkflowTaskCompilerHandoff(
    id: string,
    options?: { createdAt?: string },
  ): { task: CallableWorkflowTaskSummary; handoffPlan: CallableWorkflowCompilerHandoffPlan };
  linkCallableWorkflowTaskArtifact(input: {
    id: string;
    workflowArtifactId: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary;
  markCallableWorkflowTaskRunStarted(input: {
    id: string;
    workflowRunId: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary;
  markCallableWorkflowTaskRunFinished(input: {
    id: string;
    workflowRunId: string;
    runStatus: WorkflowRunStatus;
    errorMessage?: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary;
  failCallableWorkflowTask(input: {
    id: string;
    errorMessage: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary;
}

export interface CallableWorkflowRunnerCompileInput {
  task: CallableWorkflowTaskSummary;
  handoffPlan: CallableWorkflowCompilerHandoffPlan;
  workflowThread: WorkflowAgentThreadSummary;
  callableWorkflowInvocation: WorkflowCompilerCallableInvocationContext;
}

export interface CallableWorkflowRunnerRunInput extends CallableWorkflowRunnerCompileInput {
  artifact: WorkflowArtifactSummary;
  onRunStarted(runId: string): void;
}

export interface ExecuteCallableWorkflowTaskInput {
  store: CallableWorkflowRunnerStore;
  taskId: string;
  createWorkflowThread(input: CreateWorkflowAgentThreadInput): WorkflowAgentThreadSummary;
  compileWorkflowTask(input: CallableWorkflowRunnerCompileInput): Promise<WorkflowDashboard>;
  runWorkflowTask(input: CallableWorkflowRunnerRunInput): Promise<WorkflowDashboard>;
  createdAt?: string;
}

export interface ExecuteCallableWorkflowTaskResult {
  schemaVersion: typeof CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION;
  task: CallableWorkflowTaskSummary;
  handoffPlan?: CallableWorkflowCompilerHandoffPlan;
  workflowThread?: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  run?: WorkflowRunSummary;
  status:
    | "already_started"
    | "compiled"
    | "running"
    | "paused"
    | "succeeded"
    | "failed"
    | "canceled";
}

export interface CallableWorkflowRunnerBoundaryInput {
  task: CallableWorkflowTaskSummary;
  handoffPlan: CallableWorkflowCompilerHandoffPlan;
  artifact: WorkflowArtifactSummary;
}

export async function executeCallableWorkflowTask(
  input: ExecuteCallableWorkflowTaskInput,
): Promise<ExecuteCallableWorkflowTaskResult> {
  const current = input.store.getCallableWorkflowTask(input.taskId);
  if (!["queued", "compiling"].includes(current.status)) {
    return {
      schemaVersion: CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION,
      task: current,
      status: "already_started",
    };
  }

  let startedRunId: string | undefined;
  try {
    const { task, handoffPlan } = input.store.beginCallableWorkflowTaskCompilerHandoff(input.taskId, {
      createdAt: input.createdAt,
    });
    const workflowThread = input.createWorkflowThread({
      title: handoffPlan.compiler.workflowThreadTitle,
      initialRequest: handoffPlan.compiler.workflowThreadInitialRequest,
      phase: "compiling",
    });
    const callableWorkflowInvocation = workflowCompilerCallableInvocationContextFromRunnerInput({ task, handoffPlan });
    const compileDashboard = await input.compileWorkflowTask({ task, handoffPlan, workflowThread, callableWorkflowInvocation });
    const artifact = latestCallableWorkflowArtifactForThread(compileDashboard, workflowThread.id);
    if (!artifact) {
      throw new Error(`Callable workflow task ${task.id} compiler completed without a workflow artifact.`);
    }
    const linkedTask = input.store.linkCallableWorkflowTaskArtifact({
      id: task.id,
      workflowArtifactId: artifact.id,
    });
    validateCallableWorkflowRunnerExecutionBoundary({ task: linkedTask, handoffPlan, artifact });
    const runDashboard = await input.runWorkflowTask({
      task: linkedTask,
      handoffPlan,
      workflowThread,
      callableWorkflowInvocation,
      artifact,
      onRunStarted: (runId) => {
        startedRunId = runId;
        input.store.markCallableWorkflowTaskRunStarted({
          id: task.id,
          workflowRunId: runId,
        });
      },
    });
    const run = latestCallableWorkflowRunForArtifact(runDashboard, artifact.id, startedRunId);
    if (!run) {
      return {
        schemaVersion: CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION,
        task: input.store.getCallableWorkflowTask(task.id),
        handoffPlan,
        workflowThread,
        artifact,
        status: "compiled",
      };
    }
    if (!startedRunId) {
      input.store.markCallableWorkflowTaskRunStarted({
        id: task.id,
        workflowRunId: run.id,
      });
    }
    const taskAfterRun = shouldMirrorWorkflowRunStatus(run.status)
      ? input.store.markCallableWorkflowTaskRunFinished({
          id: task.id,
          workflowRunId: run.id,
          runStatus: run.status,
          errorMessage: run.error,
        })
      : input.store.getCallableWorkflowTask(task.id);
    return {
      schemaVersion: CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION,
      task: taskAfterRun,
      handoffPlan,
      workflowThread,
      artifact,
      run,
      status: callableWorkflowRunnerResultStatus(taskAfterRun.status),
    };
  } catch (error) {
    let failed: CallableWorkflowTaskSummary;
    try {
      failed = input.store.failCallableWorkflowTask({
        id: input.taskId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } catch (failError) {
      const latest = input.store.getCallableWorkflowTask(input.taskId);
      if (latest.status === "canceled") {
        return {
          schemaVersion: CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION,
          task: latest,
          status: "canceled",
        };
      }
      throw failError;
    }
    return {
      schemaVersion: CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION,
      task: failed,
      status: "failed",
    };
  }
}

export function validateCallableWorkflowRunnerExecutionBoundary(
  input: CallableWorkflowRunnerBoundaryInput,
): void {
  const provenance = input.handoffPlan.callerProvenance;
  if (provenance.kind !== "subagent_child_thread") return;
  if (input.artifact.manifest.mutationPolicy === "read_only") return;

  const missing: string[] = [];
  if (!provenance.subagentRunId) missing.push("sub-agent run identifier");
  if (provenance.approval.required !== true) missing.push("child-scoped approval requirement");
  if (provenance.approval.source !== "child_bridge_policy") missing.push("child bridge approval source");
  if (provenance.approval.scopeHint !== "this_child_thread") missing.push("this_child_thread approval scope");
  if (provenance.worktree.required !== true) missing.push("required child worktree policy");
  if (provenance.worktree.isolated !== true) missing.push("isolated child worktree");
  if (provenance.worktree.status !== "active") missing.push("active child worktree status");
  if (!provenance.worktree.worktreePath) missing.push("child worktree path");

  if (missing.length === 0) return;

  throw new Error([
    `Callable workflow task ${input.task.id} refused child-originated mutating workflow artifact ${input.artifact.id}.`,
    `Missing: ${missing.join(", ")}.`,
    `childThreadId=${provenance.threadId}; childRunId=${provenance.runId}; subagentRunId=${provenance.subagentRunId ?? "unknown"}.`,
  ].join(" "));
}

export function latestCallableWorkflowArtifactForThread(
  dashboard: WorkflowDashboard,
  workflowThreadId: string,
): WorkflowArtifactSummary | undefined {
  return [...dashboard.artifacts]
    .filter((artifact) => artifact.workflowThreadId === workflowThreadId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function latestCallableWorkflowRunForArtifact(
  dashboard: WorkflowDashboard,
  artifactId: string,
  preferredRunId?: string,
): WorkflowRunSummary | undefined {
  if (preferredRunId) {
    const preferred = dashboard.runs.find((run) => run.id === preferredRunId);
    if (preferred) return preferred;
  }
  return [...dashboard.runs]
    .filter((run) => run.artifactId === artifactId && run.status !== "previewed")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function shouldMirrorWorkflowRunStatus(status: WorkflowRunStatus): boolean {
  return ["paused", "needs_input", "succeeded", "failed", "canceled"].includes(status);
}

function callableWorkflowRunnerResultStatus(status: CallableWorkflowTaskStatus): ExecuteCallableWorkflowTaskResult["status"] {
  if (status === "compiling") return "compiled";
  if (status === "queued") return "compiled";
  if (status === "paused") return "paused";
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "canceled") return "canceled";
  return "running";
}
