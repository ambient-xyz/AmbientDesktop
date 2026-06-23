import type Database from "better-sqlite3";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  SubagentPromptSnapshotSummary,
  SubagentRepairDiagnosticsReport,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary, WorkflowArtifactSummary, WorkflowRunSummary } from "../../shared/workflowTypes";
import { analyzeCallableWorkflowTaskRestartState, type CallableWorkflowTaskParentRunSnapshot } from "./projectStoreCallableWorkflowFacade";
import { analyzeSubagentRestartState, createSubagentRepairDiagnosticsReport } from "./projectStoreSubagentsFacade";

export interface GetSubagentRepairDiagnosticsOptions {
  now?: string;
  maxIssues?: number;
  maxMessageChars?: number;
  maxAffectedIds?: number;
}

export interface ProjectStoreSubagentRepairDiagnosticsRepositoryDeps {
  listAllSubagentRuns(): SubagentRunSummary[];
  listCallableWorkflowTasks(): CallableWorkflowTaskSummary[];
  listSubagentPromptSnapshots(runId: string): SubagentPromptSnapshotSummary[];
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[];
  listSubagentToolScopeSnapshots(runId: string): SubagentToolScopeSnapshotSummary[];
  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[];
  listThreads(): ThreadSummary[];
  listThreadsForSubagentStateInspection(): ThreadSummary[];
  listWorkflowArtifacts(): WorkflowArtifactSummary[];
  listWorkflowRunsForRestart(): WorkflowRunSummary[];
}

export class ProjectStoreSubagentRepairDiagnosticsRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreSubagentRepairDiagnosticsRepositoryDeps,
  ) {}

  getSubagentRepairDiagnostics(options: GetSubagentRepairDiagnosticsOptions = {}): SubagentRepairDiagnosticsReport {
    const now = options.now ?? new Date().toISOString();
    const subagentRuns = this.deps.listAllSubagentRuns();
    const subagentRunEvents = subagentRuns.flatMap((run) => this.deps.listSubagentRunEvents(run.id));
    const summary = analyzeSubagentRestartState({
      threads: this.deps.listThreadsForSubagentStateInspection(),
      runs: subagentRuns,
      runEvents: subagentRunEvents,
      spawnEdges: this.deps.listSubagentSpawnEdges(),
      promptSnapshots: subagentRuns.flatMap((run) => this.deps.listSubagentPromptSnapshots(run.id)),
      toolScopeSnapshots: subagentRuns.flatMap((run) => this.deps.listSubagentToolScopeSnapshots(run.id)),
      waitBarriers: this.deps.listSubagentWaitBarriers(),
      createdAt: now,
    });
    return createSubagentRepairDiagnosticsReport({
      summary: {
        ...summary,
        callableWorkflowTasks: analyzeCallableWorkflowTaskRestartState({
          tasks: this.deps.listCallableWorkflowTasks(),
          threads: this.deps.listThreads(),
          parentRuns: this.listCallableWorkflowParentRuns(),
          workflowArtifacts: this.deps.listWorkflowArtifacts(),
          workflowRuns: this.deps.listWorkflowRunsForRestart(),
          createdAt: now,
        }),
      },
      maxIssues: options.maxIssues,
      maxMessageChars: options.maxMessageChars,
      maxAffectedIds: options.maxAffectedIds,
    });
  }

  private listCallableWorkflowParentRuns(): CallableWorkflowTaskParentRunSnapshot[] {
    return this.db
      .prepare("SELECT id, thread_id AS threadId FROM runs ORDER BY started_at ASC, id ASC")
      .all() as CallableWorkflowTaskParentRunSnapshot[];
  }
}
