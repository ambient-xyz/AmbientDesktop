import type Database from "better-sqlite3";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  CallableWorkflowTaskRestartReconciliationSummary,
  CallableWorkflowTaskSummary,
  WorkflowArtifactSummary,
  WorkflowRunStatus,
  WorkflowRunSummary,
} from "../../shared/workflowTypes";
import { analyzeCallableWorkflowTaskRestartState, type CallableWorkflowTaskParentRunSnapshot } from "./projectStoreCallableWorkflowFacade";

export interface ProjectStoreCallableWorkflowTaskRestartReconciliationRepositoryDeps {
  getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary;
  listCallableWorkflowTasks(): CallableWorkflowTaskSummary[];
  listThreads(): ThreadSummary[];
  listWorkflowArtifacts(): WorkflowArtifactSummary[];
  listWorkflowRunsForRestart(): WorkflowRunSummary[];
  markCallableWorkflowTaskRunFinished(input: {
    id: string;
    workflowRunId: string;
    runStatus: WorkflowRunStatus;
    errorMessage?: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary;
  tryGetWorkflowRun(runId: string): WorkflowRunSummary | undefined;
}

export class ProjectStoreCallableWorkflowTaskRestartReconciliationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreCallableWorkflowTaskRestartReconciliationRepositoryDeps,
  ) {}

  reconcileCallableWorkflowTaskRestartState(options: { now?: string } = {}): CallableWorkflowTaskRestartReconciliationSummary {
    const now = options.now ?? new Date().toISOString();
    const summary = analyzeCallableWorkflowTaskRestartState({
      tasks: this.deps.listCallableWorkflowTasks(),
      threads: this.deps.listThreads(),
      parentRuns: this.listCallableWorkflowParentRuns(),
      workflowArtifacts: this.deps.listWorkflowArtifacts(),
      workflowRuns: this.deps.listWorkflowRunsForRestart(),
      createdAt: now,
    });

    for (const taskId of summary.repairedTaskIds) {
      const task = this.deps.getCallableWorkflowTask(taskId);
      if (!task.workflowRunId) continue;
      const run = this.deps.tryGetWorkflowRun(task.workflowRunId);
      if (!run) continue;
      if (task.workflowArtifactId && run.artifactId !== task.workflowArtifactId) continue;
      this.deps.markCallableWorkflowTaskRunFinished({
        id: task.id,
        workflowRunId: run.id,
        runStatus: run.status,
        errorMessage: run.error,
        createdAt: now,
      });
    }

    return summary;
  }

  private listCallableWorkflowParentRuns(): CallableWorkflowTaskParentRunSnapshot[] {
    return this.db
      .prepare("SELECT id, thread_id AS threadId FROM runs ORDER BY started_at ASC, id ASC")
      .all() as CallableWorkflowTaskParentRunSnapshot[];
  }
}
