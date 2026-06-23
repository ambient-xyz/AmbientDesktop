import type { ThreadSummary } from "../../shared/threadTypes";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import { canBeginCallableWorkflowCompilerHandoff } from "../../shared/callableWorkflowTaskGuards";
import type { CallableWorkflowTaskSummary, WorkflowArtifactSummary } from "../../shared/workflowTypes";
import {
  buildCallableWorkflowCompilerHandoffPlan,
  callableWorkflowPatternGraphSnapshotWithChildBinding,
  type CallableWorkflowCompilerHandoffPlan,
  type CallableWorkflowPatternGraphChildBindingRequest,
} from "./projectStoreCallableWorkflowFacade";
import type { UpdateCallableWorkflowTaskRowInput } from "./callableWorkflowTaskRepository";

export interface BeginCallableWorkflowTaskCompilerHandoffResult {
  task: CallableWorkflowTaskSummary;
  handoffPlan: CallableWorkflowCompilerHandoffPlan;
}

export interface LinkCallableWorkflowTaskArtifactInput {
  id: string;
  workflowArtifactId: string;
  createdAt?: string;
}

export interface ProjectStoreCallableWorkflowTaskPreparationRepositoryDeps {
  bindPatternGraphSnapshot(input: {
    id: string;
    patternGraphSnapshot: SubagentPatternGraphSnapshot;
    updatedAt: string;
  }): CallableWorkflowTaskSummary;
  getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary;
  getSubagentRun(runId: string): SubagentRunSummary;
  getThread(threadId: string): ThreadSummary;
  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary;
  updateCallableWorkflowTaskRow(input: UpdateCallableWorkflowTaskRowInput): CallableWorkflowTaskSummary;
}

export class ProjectStoreCallableWorkflowTaskPreparationRepository {
  constructor(private readonly deps: ProjectStoreCallableWorkflowTaskPreparationRepositoryDeps) {}

  bindCallableWorkflowTaskPatternGraphChild(input: CallableWorkflowPatternGraphChildBindingRequest): CallableWorkflowTaskSummary {
    const task = this.deps.getCallableWorkflowTask(input.workflowTaskId);
    const run = this.deps.getSubagentRun(input.childRunId);
    const childThread = this.deps.getThread(run.childThreadId);
    const now = input.updatedAt ?? new Date().toISOString();
    const patternGraphSnapshot = callableWorkflowPatternGraphSnapshotWithChildBinding({
      task,
      run,
      childThread,
      roleNodeId: input.roleNodeId,
      ...(input.label ? { label: input.label } : {}),
      ...(input.approvalState ? { approvalState: input.approvalState } : {}),
      ...(input.blockingParent !== undefined ? { blockingParent: input.blockingParent } : {}),
      updatedAt: now,
    });
    return this.deps.bindPatternGraphSnapshot({
      id: task.id,
      patternGraphSnapshot,
      updatedAt: now,
    });
  }

  beginCallableWorkflowTaskCompilerHandoff(
    id: string,
    options: { createdAt?: string } = {},
  ): BeginCallableWorkflowTaskCompilerHandoffResult {
    const current = this.deps.getCallableWorkflowTask(id);
    if (!canBeginCallableWorkflowCompilerHandoff(current)) {
      throw new Error(`Cannot begin compiler handoff for callable workflow task ${id} while status is ${current.status}.`);
    }
    const now = options.createdAt ?? new Date().toISOString();
    const shouldUpdate =
      current.status !== "compiling" ||
      !current.startedAt ||
      current.runnerDeferredReason !== "workflow_artifact_not_compiled" ||
      Boolean(current.errorMessage);
    const task = shouldUpdate
      ? this.deps.updateCallableWorkflowTaskRow({
          id,
          status: "compiling",
          statusLabel: "Compiling",
          runnerDeferredReason: "workflow_artifact_not_compiled",
          errorMessage: null,
          updatedAt: now,
          startedAt: current.startedAt ?? now,
        })
      : current;
    return {
      task,
      handoffPlan: buildCallableWorkflowCompilerHandoffPlan({ task, createdAt: now }),
    };
  }

  linkCallableWorkflowTaskArtifact(input: LinkCallableWorkflowTaskArtifactInput): CallableWorkflowTaskSummary {
    const current = this.deps.getCallableWorkflowTask(input.id);
    if (current.status !== "compiling") {
      throw new Error(`Cannot link a workflow artifact for callable workflow task ${input.id} while status is ${current.status}.`);
    }
    if (current.workflowArtifactId && current.workflowArtifactId !== input.workflowArtifactId) {
      throw new Error(`Callable workflow task ${input.id} is already linked to a different workflow artifact.`);
    }
    this.deps.getWorkflowArtifact(input.workflowArtifactId);
    if (current.workflowArtifactId === input.workflowArtifactId && current.runnerDeferredReason === "workflow_run_not_started") {
      return current;
    }
    return this.deps.updateCallableWorkflowTaskRow({
      id: input.id,
      status: "compiling",
      statusLabel: "Artifact ready",
      runnerDeferredReason: "workflow_run_not_started",
      workflowArtifactId: input.workflowArtifactId,
      updatedAt: input.createdAt ?? new Date().toISOString(),
    });
  }
}
