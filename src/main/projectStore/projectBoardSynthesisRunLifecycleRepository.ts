import type Database from "better-sqlite3";
import type {
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
} from "../../shared/projectBoardTypes";
import { projectBoardSynthesisPartialStatus } from "../../shared/projectBoardSynthesisRecovery";
import { mapProjectBoardSynthesisRunRow, type ProjectBoardSynthesisRunStoreRow } from "./projectBoardMappers";

export interface ProjectBoardSynthesisRunEventRecordInput {
  stage: ProjectBoardSynthesisRunStage;
  title: string;
  summary: string;
  metadata?: Record<string, unknown>;
  status?: ProjectBoardSynthesisRunStatus;
  proposalId?: string;
  model?: string;
  sourceCount?: number;
  includedSourceCount?: number;
  sourceCharCount?: number;
  promptCharCount?: number;
  responseCharCount?: number;
  cardCount?: number;
  questionCount?: number;
  warningCount?: number;
  error?: string;
  completedAt?: string;
  skipPlanningSnapshot?: boolean;
}

export interface ProjectStoreProjectBoardSynthesisRunLifecycleRepositoryOptions {
  recordProjectBoardSynthesisRunEvent(runId: string, input: ProjectBoardSynthesisRunEventRecordInput): ProjectBoardSynthesisRun;
}

export class ProjectStoreProjectBoardSynthesisRunLifecycleRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly options: ProjectStoreProjectBoardSynthesisRunLifecycleRepositoryOptions,
  ) {}

  failStaleProjectBoardSynthesisRuns(input: { boardId: string; staleBefore: string; reason: string }): ProjectBoardSynthesisRun[] {
    const board = this.db.prepare("SELECT id FROM project_boards WHERE id = ?").get(input.boardId) as { id: string } | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (!Number.isFinite(Date.parse(input.staleBefore)))
      throw new Error(`Invalid project board synthesis stale cutoff: ${input.staleBefore}`);
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ? AND status IN ('running', 'pause_requested') AND updated_at < ?
         ORDER BY updated_at ASC, started_at ASC, rowid ASC`,
      )
      .all(input.boardId, input.staleBefore) as ProjectBoardSynthesisRunStoreRow[];
    return rows.map((row) =>
      this.options.recordProjectBoardSynthesisRunEvent(row.id, {
        stage: "failed",
        title: "Synthesis run marked stale",
        summary: input.reason,
        metadata: { staleBefore: input.staleBefore, previousStage: row.stage, previousUpdatedAt: row.updated_at },
        status: "failed",
        error: input.reason,
        completedAt: new Date().toISOString(),
      }),
    );
  }

  markProjectBoardSynthesisRunStalled(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(input.runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${input.runId}`);
    if (row.board_id !== input.boardId)
      throw new Error(`Project board synthesis run ${input.runId} does not belong to board ${input.boardId}`);
    const run = mapProjectBoardSynthesisRunRow(row);
    if (run.status !== "running") throw new Error(`Only a running project-board synthesis run can be marked stalled: ${input.runId}`);
    const partial = projectBoardSynthesisPartialStatus(run);
    const reason = input.reason?.trim() || "No visible project-board synthesis progress is being received.";
    const reusableCount = partial.completedCount;
    return this.options.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "failed",
      title: "Synthesis run marked stalled",
      summary: `${reason} Retry will reuse ${reusableCount} completed or reused section record${reusableCount === 1 ? "" : "s"} where possible and resume uncovered work.`,
      metadata: {
        decision: "retry_stalled_run",
        retryable: true,
        previousStage: row.stage,
        previousUpdatedAt: row.updated_at,
        completedSectionCount: partial.completedCount,
        reusedSectionCount: partial.reusedCount,
        failedSectionCount: partial.failedCount,
        sectionCount: partial.sectionCount,
      },
      status: "failed",
      error: reason,
      completedAt: new Date().toISOString(),
    });
  }

  requestProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(input.runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${input.runId}`);
    if (row.board_id !== input.boardId)
      throw new Error(`Project board synthesis run ${input.runId} does not belong to board ${input.boardId}`);
    const run = mapProjectBoardSynthesisRunRow(row);
    if (run.status === "paused") return run;
    if (run.status === "pause_requested") return run;
    if (run.status !== "running") throw new Error(`Only a running project-board synthesis run can be paused: ${input.runId}`);
    const reason = input.reason?.trim() || "Pause requested from the project-board progress panel.";
    return this.options.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: run.stage,
      title: "Pause requested",
      summary: "Ambient will stop at the next safe planner checkpoint, flush validated records, and leave the run resumable.",
      metadata: {
        decision: "pause_planning",
        reason,
        previousStatus: run.status,
        previousStage: run.stage,
        previousUpdatedAt: run.updatedAt,
        checkpointPolicy: "safe_planner_boundary",
      },
      status: "pause_requested",
    });
  }

  markProjectBoardSynthesisRunPaused(input: {
    boardId: string;
    runId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): ProjectBoardSynthesisRun {
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(input.runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${input.runId}`);
    if (row.board_id !== input.boardId)
      throw new Error(`Project board synthesis run ${input.runId} does not belong to board ${input.boardId}`);
    const run = mapProjectBoardSynthesisRunRow(row);
    if (run.status === "paused") return run;
    if (run.status !== "running" && run.status !== "pause_requested") {
      throw new Error(`Only an active project-board synthesis run can be marked paused: ${input.runId}`);
    }
    const reason = input.reason?.trim() || "Planning paused at a safe checkpoint.";
    return this.options.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "paused",
      title: "Planning paused",
      summary: `${reason} Resume will reuse validated planner records and ask Ambient/Pi only for remaining cards.`,
      metadata: {
        decision: "planning_paused",
        previousStatus: run.status,
        previousStage: run.stage,
        previousUpdatedAt: run.updatedAt,
        retryable: true,
        checkpointPolicy: "validated_progressive_records",
        ...(input.metadata ?? {}),
      },
      status: "paused",
      completedAt: new Date().toISOString(),
    });
  }

  abandonProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(input.runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${input.runId}`);
    if (row.board_id !== input.boardId)
      throw new Error(`Project board synthesis run ${input.runId} does not belong to board ${input.boardId}`);
    const run = mapProjectBoardSynthesisRunRow(row);
    if (run.status === "abandoned") return run;
    if (run.status !== "paused") throw new Error(`Only a paused project-board synthesis run can be abandoned: ${input.runId}`);
    const reason = input.reason?.trim() || "Start Fresh requested from the paused project-board synthesis run.";
    return this.options.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "paused",
      title: "Paused planning abandoned",
      summary: `${reason} A fresh synthesis run will start from the current board and source context without reusing this paused checkpoint.`,
      metadata: {
        decision: "abandon_paused_planning",
        previousStatus: run.status,
        previousStage: run.stage,
        previousUpdatedAt: run.updatedAt,
        retryable: false,
        checkpointPolicy: "start_fresh",
      },
      status: "abandoned",
      completedAt: new Date().toISOString(),
    });
  }
}
