import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  isRestartInterruptedOrchestrationRun,
  restartInterruptedAutoContinueProofOfWork,
} from "../orchestration/orchestrationRecovery";
import type { SchedulerRuntimeState } from "../orchestration/orchestrationScheduler";
import { emptyToNull } from "./projectStoreFacadeHelpers";
import {
  normalizeTaskLabels,
  normalizeTaskReferences,
  normalizeTaskState,
} from "./projectBoardMappers";
import {
  mapOrchestrationRunRow,
  mapOrchestrationTaskRow,
  type CreateOrchestrationTaskInput,
  type OrchestrationBoard,
  type OrchestrationRun,
  type OrchestrationRunRow,
  type OrchestrationTask,
  type OrchestrationTaskRow,
} from "./orchestrationMappers";

export interface ProjectStoreOrchestrationTaskUpdateInput {
  id: string;
  title?: string;
  description?: string;
  state?: string;
  priority?: number | null;
  labels?: string[];
  blockedBy?: string[];
}

export interface UpdateProjectStoreOrchestrationRunInput {
  id: string;
  status: string;
  threadId?: string;
  piSessionFile?: string | null;
  error?: string | null;
  proofOfWork?: Record<string, unknown>;
  finish?: boolean;
  reviewProjectBoardProof?: boolean;
}

export interface ProjectStoreOrchestrationRepositoryDeps {
  defaultProjectPath: string;
  projectBoardTaskHasClosedDoneCard(taskId: string): boolean;
  projectBoardClaimBlockedTaskIds(): string[];
  syncProjectBoardCardsForLinkedTasks(): void;
  reviewProjectBoardCardProofForRun(run: OrchestrationRun): void;
}

export class ProjectStoreOrchestrationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreOrchestrationRepositoryDeps,
  ) {}

  listOrchestrationBoard(): OrchestrationBoard {
    return {
      tasks: this.listOrchestrationTasks(),
      runs: this.listOrchestrationRuns(),
    };
  }

  listOrchestrationTasks(): OrchestrationTask[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM orchestration_tasks
         ORDER BY priority IS NULL, priority ASC, created_at ASC, identifier ASC`,
      )
      .all() as OrchestrationTaskRow[];
    return rows.map(mapOrchestrationTaskRow);
  }

  listOrchestrationRuns(limit = 50): OrchestrationRun[] {
    const rows = this.db
      .prepare("SELECT * FROM orchestration_runs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as OrchestrationRunRow[];
    return rows.map(mapOrchestrationRunRow);
  }

  getOrchestrationRun(runId: string): OrchestrationRun {
    const row = this.db.prepare("SELECT * FROM orchestration_runs WHERE id = ?").get(runId) as
      | OrchestrationRunRow
      | undefined;
    if (!row) throw new Error(`Orchestration run not found: ${runId}`);
    return mapOrchestrationRunRow(row);
  }

  getOrchestrationTask(taskId: string): OrchestrationTask {
    const row = this.db.prepare("SELECT * FROM orchestration_tasks WHERE id = ?").get(taskId) as
      | OrchestrationTaskRow
      | undefined;
    if (!row) throw new Error(`Orchestration task not found: ${taskId}`);
    return mapOrchestrationTaskRow(row);
  }

  createOrchestrationTask(input: CreateOrchestrationTaskInput): OrchestrationTask {
    const now = new Date().toISOString();
    const id = randomUUID();
    const identifier = this.nextLocalTaskIdentifier();
    this.db
      .prepare(
        `INSERT INTO orchestration_tasks
        (id, identifier, title, description, state, priority, labels_json, blocked_by_json, project_path, source_kind, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        identifier,
        input.title.trim(),
        emptyToNull(input.description),
        normalizeTaskState(input.state ?? "todo"),
        input.priority ?? null,
        JSON.stringify(normalizeTaskLabels(input.labels ?? [])),
        JSON.stringify(normalizeTaskReferences(input.blockedBy ?? [])),
        emptyToNull(input.projectPath) ?? this.deps.defaultProjectPath,
        "local",
        now,
        now,
      );
    return this.getOrchestrationTask(id);
  }

  updateOrchestrationTask(input: ProjectStoreOrchestrationTaskUpdateInput): OrchestrationTask {
    const current = this.getOrchestrationTask(input.id);
    const requestedState = input.state ? normalizeTaskState(input.state) : current.state;
    const next = {
      title: input.title?.trim() || current.title,
      description: Object.hasOwn(input, "description") ? emptyToNull(input.description) : (current.description ?? null),
      state: requestedState !== "done" && this.deps.projectBoardTaskHasClosedDoneCard(current.id) ? "done" : requestedState,
      priority: Object.hasOwn(input, "priority") ? (input.priority ?? null) : (current.priority ?? null),
      labels: input.labels ? normalizeTaskLabels(input.labels) : current.labels,
      blockedBy: Object.hasOwn(input, "blockedBy") ? normalizeTaskReferences(input.blockedBy ?? []) : current.blockedBy,
    };
    this.db
      .prepare(
        `UPDATE orchestration_tasks
         SET title = ?, description = ?, state = ?, priority = ?, labels_json = ?, blocked_by_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.title,
        next.description,
        next.state,
        next.priority,
        JSON.stringify(next.labels),
        JSON.stringify(next.blockedBy),
        new Date().toISOString(),
        input.id,
      );
    this.deps.syncProjectBoardCardsForLinkedTasks();
    return this.getOrchestrationTask(input.id);
  }

  setOrchestrationTaskWorkspace(input: { id: string; workspacePath: string; branchName?: string }): OrchestrationTask {
    this.db
      .prepare("UPDATE orchestration_tasks SET workspace_path = ?, branch_name = ?, updated_at = ? WHERE id = ?")
      .run(input.workspacePath, input.branchName ?? null, new Date().toISOString(), input.id);
    return this.getOrchestrationTask(input.id);
  }

  recordPreparedOrchestrationRun(input: {
    taskId: string;
    workspacePath: string;
    proofOfWork?: Record<string, unknown>;
  }): OrchestrationRun {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO orchestration_runs
        (id, task_id, attempt_number, status, workspace_path, started_at, last_event_at, proof_of_work_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.taskId,
        this.nextOrchestrationAttemptNumber(input.taskId),
        "prepared",
        input.workspacePath,
        now,
        now,
        input.proofOfWork ? JSON.stringify(input.proofOfWork) : null,
      );
    return this.getOrchestrationRun(id);
  }

  updateOrchestrationRun(input: UpdateProjectStoreOrchestrationRunInput): OrchestrationRun {
    const current = this.getOrchestrationRun(input.id);
    if (this.deps.projectBoardTaskHasClosedDoneCard(current.taskId)) {
      return current;
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE orchestration_runs
         SET status = ?, thread_id = ?, pi_session_file = ?, last_event_at = ?, finished_at = ?, error = ?, proof_of_work_json = ?
         WHERE id = ?`,
      )
      .run(
        input.status,
        input.threadId ?? current.threadId ?? null,
        Object.hasOwn(input, "piSessionFile") ? (input.piSessionFile ?? null) : (current.piSessionFile ?? null),
        now,
        input.finish ? now : ["claimed", "prepared", "preparing", "running"].includes(input.status) ? null : (current.finishedAt ?? null),
        Object.hasOwn(input, "error") ? (input.error ?? null) : (current.error ?? null),
        input.proofOfWork ? JSON.stringify(input.proofOfWork) : current.proofOfWork ? JSON.stringify(current.proofOfWork) : null,
        input.id,
      );
    const updated = this.getOrchestrationRun(input.id);
    if (input.finish && input.reviewProjectBoardProof !== false) this.deps.reviewProjectBoardCardProofForRun(updated);
    return updated;
  }

  recordRestartInterruptedAutoContinueAttempt(runId: string, now = new Date()): OrchestrationRun {
    const run = this.getOrchestrationRun(runId);
    if (!isRestartInterruptedOrchestrationRun(run)) {
      throw new Error(`Orchestration run is not restart-interrupted: ${runId}`);
    }
    return this.updateOrchestrationRun({
      id: run.id,
      status: run.status,
      proofOfWork: restartInterruptedAutoContinueProofOfWork(run.proofOfWork, now.toISOString()),
      reviewProjectBoardProof: false,
    });
  }

  getOrchestrationSchedulerRuntimeState(): SchedulerRuntimeState {
    const rows = this.db
      .prepare("SELECT task_id, status FROM orchestration_runs WHERE status IN ('claimed', 'prepared', 'preparing', 'running', 'retry_queued')")
      .all() as Array<{ task_id: string; status: string }>;
    const claimBlockedTaskIds = this.deps.projectBoardClaimBlockedTaskIds();
    return {
      claimedTaskIds: [
        ...new Set([
          ...rows
            .filter((row) => row.status === "claimed" || row.status === "prepared" || row.status === "preparing")
            .map((row) => row.task_id),
          ...claimBlockedTaskIds,
        ]),
      ],
      runningTaskIds: rows.filter((row) => row.status === "running").map((row) => row.task_id),
      retryQueuedTaskIds: rows.filter((row) => row.status === "retry_queued").map((row) => row.task_id),
    };
  }

  latestOrchestrationRunForTask(taskId: string): OrchestrationRun | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM orchestration_runs
         WHERE task_id = ?
         ORDER BY proof_of_work_json IS NULL,
                  COALESCE(last_event_at, finished_at, started_at) DESC,
                  attempt_number DESC,
                  started_at DESC,
                  id DESC
         LIMIT 1`,
      )
      .get(taskId) as OrchestrationRunRow | undefined;
    return row ? mapOrchestrationRunRow(row) : undefined;
  }

  latestDependencyArtifactRunForTask(taskId: string): OrchestrationRun | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM orchestration_runs
         WHERE task_id = ?
           AND status = 'completed'
           AND proof_of_work_json IS NOT NULL
         ORDER BY COALESCE(finished_at, last_event_at, started_at) DESC,
                  attempt_number DESC,
                  started_at DESC,
                  id DESC
         LIMIT 1`,
      )
      .get(taskId) as OrchestrationRunRow | undefined;
    return row ? mapOrchestrationRunRow(row) : undefined;
  }

  mapOrchestrationTask(row: OrchestrationTaskRow): OrchestrationTask {
    return mapOrchestrationTaskRow(row);
  }

  mapOrchestrationRun(row: OrchestrationRunRow): OrchestrationRun {
    return mapOrchestrationRunRow(row);
  }

  private nextOrchestrationAttemptNumber(taskId: string): number {
    const row = this.db
      .prepare("SELECT MAX(attempt_number) AS max_attempt FROM orchestration_runs WHERE task_id = ?")
      .get(taskId) as { max_attempt: number | null };
    return (row.max_attempt ?? -1) + 1;
  }

  private nextLocalTaskIdentifier(): string {
    const row = this.db
      .prepare(
        "SELECT MAX(CAST(SUBSTR(identifier, 7) AS INTEGER)) AS max_number FROM orchestration_tasks WHERE identifier LIKE 'LOCAL-%'",
      )
      .get() as { max_number: number | null };
    return `LOCAL-${(row.max_number ?? 0) + 1}`;
  }
}
