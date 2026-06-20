import type Database from "better-sqlite3";
import type {
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskSummary,
} from "../../shared/workflowTypes";
import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import type { CallableWorkflowQueuedTaskDraft } from "./projectStoreCallableWorkflowFacade";
import {
  mapCallableWorkflowTaskRow,
  type CallableWorkflowTaskRow,
} from "./callableWorkflowTaskMappers";

export interface ProjectStoreCallableWorkflowTaskRepositoryDeps {
  workflowThreadIdForArtifact(artifactId: string): string | undefined;
  hydrateRunTelemetry(task: CallableWorkflowTaskSummary): CallableWorkflowTaskSummary;
}

export interface UpdateCallableWorkflowTaskRowInput {
  id: string;
  status?: CallableWorkflowTaskStatus;
  statusLabel?: string;
  runnerDeferredReason?: string;
  workflowArtifactId?: string;
  workflowRunId?: string;
  errorMessage?: string | null;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export class ProjectStoreCallableWorkflowTaskRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreCallableWorkflowTaskRepositoryDeps,
  ) {}

  createQueuedTask(input: {
    draft: CallableWorkflowQueuedTaskDraft;
    parentMessageId: string | undefined;
    patternGraphSnapshot?: SubagentPatternGraphSnapshot;
    now: string;
  }): CallableWorkflowTaskSummary {
    const { draft, parentMessageId, patternGraphSnapshot, now } = input;
    this.db
      .prepare(
        `INSERT INTO callable_workflow_tasks
         (id, launch_id, parent_thread_id, parent_run_id, parent_message_id, tool_call_id, tool_id, tool_name, source_kind,
          title, status, status_label, blocking, default_collapsed, progress_visible, token_cost_tracking, pause_resume_cancel,
          cancel_handle, runner_target, runner_deferred_reason, workflow_artifact_id, workflow_run_id, error_message,
          pattern_graph_snapshot_json, execution_plan_json, created_at, updated_at, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draft.id,
        draft.launchId,
        draft.parentThreadId,
        draft.parentRunId,
        parentMessageId ?? null,
        draft.toolCallId,
        draft.toolId,
        draft.toolName,
        draft.sourceKind,
        draft.title,
        draft.status,
        draft.statusLabel,
        draft.blocking ? 1 : 0,
        draft.defaultCollapsed ? 1 : 0,
        draft.progressVisible ? 1 : 0,
        draft.tokenCostTracking ? 1 : 0,
        draft.pauseResumeCancel ? 1 : 0,
        draft.cancelHandle,
        draft.runnerTarget,
        draft.runnerDeferredReason,
        null,
        null,
        null,
        patternGraphSnapshot ? JSON.stringify(patternGraphSnapshot) : null,
        JSON.stringify(draft.executionPlan),
        now,
        now,
        null,
        null,
      );
    return this.getCallableWorkflowTask(draft.id);
  }

  getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary {
    const row = this.db.prepare("SELECT * FROM callable_workflow_tasks WHERE id = ?").get(id) as CallableWorkflowTaskRow | undefined;
    if (!row) throw new Error(`Callable workflow task not found: ${id}`);
    return this.mapCallableWorkflowTask(row);
  }

  listCallableWorkflowTasksForParentRun(parentRunId: string): CallableWorkflowTaskSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM callable_workflow_tasks WHERE parent_run_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentRunId) as CallableWorkflowTaskRow[];
    return rows.map(this.mapCallableWorkflowTask);
  }

  listCallableWorkflowTasksForParentThread(parentThreadId: string): CallableWorkflowTaskSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM callable_workflow_tasks WHERE parent_thread_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentThreadId) as CallableWorkflowTaskRow[];
    return rows.map(this.mapCallableWorkflowTask);
  }

  listCallableWorkflowTasks(): CallableWorkflowTaskSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM callable_workflow_tasks ORDER BY created_at ASC, id ASC")
      .all() as CallableWorkflowTaskRow[];
    return rows.map(this.mapCallableWorkflowTask);
  }

  bindPatternGraphSnapshot(input: {
    id: string;
    patternGraphSnapshot: SubagentPatternGraphSnapshot;
    updatedAt: string;
  }): CallableWorkflowTaskSummary {
    this.db
      .prepare(
        `UPDATE callable_workflow_tasks
         SET pattern_graph_snapshot_json = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(input.patternGraphSnapshot), input.updatedAt, input.id);
    return this.getCallableWorkflowTask(input.id);
  }

  updateCallableWorkflowTaskRow(input: UpdateCallableWorkflowTaskRowInput): CallableWorkflowTaskSummary {
    const current = this.getCallableWorkflowTask(input.id);
    this.db
      .prepare(
        `UPDATE callable_workflow_tasks
         SET status = ?,
             status_label = ?,
             runner_deferred_reason = ?,
             workflow_artifact_id = ?,
             workflow_run_id = ?,
             error_message = ?,
             updated_at = ?,
             started_at = ?,
             completed_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status ?? current.status,
        input.statusLabel ?? current.statusLabel,
        input.runnerDeferredReason ?? current.runnerDeferredReason,
        input.workflowArtifactId ?? current.workflowArtifactId ?? null,
        input.workflowRunId ?? current.workflowRunId ?? null,
        "errorMessage" in input ? input.errorMessage ?? null : current.errorMessage ?? null,
        input.updatedAt,
        input.startedAt ?? current.startedAt ?? null,
        input.completedAt ?? current.completedAt ?? null,
        input.id,
      );
    return this.getCallableWorkflowTask(input.id);
  }

  findCallableWorkflowTaskByLaunchId(launchId: string): CallableWorkflowTaskSummary | undefined {
    const row = this.db
      .prepare("SELECT * FROM callable_workflow_tasks WHERE launch_id = ?")
      .get(launchId) as CallableWorkflowTaskRow | undefined;
    return row ? this.mapCallableWorkflowTask(row) : undefined;
  }

  mapCallableWorkflowTask = (row: CallableWorkflowTaskRow): CallableWorkflowTaskSummary => {
    const task = mapCallableWorkflowTaskRow(row, {
      workflowThreadId: row.workflow_artifact_id ? this.deps.workflowThreadIdForArtifact(row.workflow_artifact_id) : undefined,
    });
    return this.deps.hydrateRunTelemetry(task);
  };
}
