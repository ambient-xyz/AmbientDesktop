import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunEvent,
  ProjectBoardSynthesisRunProgressiveRecord,
  ProjectBoardSynthesisRunStage,
} from "../../shared/projectBoardTypes";
import { mapProjectBoardSynthesisRunRow, type ProjectBoardStoreRow, type ProjectBoardSynthesisRunStoreRow } from "./projectBoardMappers";
import {
  ProjectStoreProjectBoardSynthesisRunLifecycleRepository,
  type ProjectBoardSynthesisRunEventRecordInput,
} from "./projectBoardSynthesisRunLifecycleRepository";
import { ProjectStoreProjectBoardSynthesisRunRecordsRepository } from "./projectBoardSynthesisRunRecordsRepository";

export interface ProjectStoreProjectBoardSynthesisRunRepositoryDeps {
  appendProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind): ProjectBoardPlanningSnapshot | undefined;
}

export class ProjectStoreProjectBoardSynthesisRunRepository {
  private readonly lifecycleRepository: ProjectStoreProjectBoardSynthesisRunLifecycleRepository;
  private readonly recordsRepository: ProjectStoreProjectBoardSynthesisRunRecordsRepository;

  constructor(
    private readonly db: Database.Database,
    deps: ProjectStoreProjectBoardSynthesisRunRepositoryDeps,
  ) {
    this.recordsRepository = new ProjectStoreProjectBoardSynthesisRunRecordsRepository(db, deps);
    this.lifecycleRepository = new ProjectStoreProjectBoardSynthesisRunLifecycleRepository(db, {
      recordProjectBoardSynthesisRunEvent: (runId, input) => this.recordsRepository.recordProjectBoardSynthesisRunEvent(runId, input),
    });
  }

  createProjectBoardSynthesisRun(input: {
    boardId: string;
    model?: string;
    retryOfRunId?: string;
    initialStage?: ProjectBoardSynthesisRunStage;
    initialTitle?: string;
    initialSummary?: string;
    initialMetadata?: Record<string, unknown>;
    sourceCount?: number;
    includedSourceCount?: number;
    sourceCharCount?: number;
  }): ProjectBoardSynthesisRun {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = new Date().toISOString();
    const runId = randomUUID();
    const initialStage = input.initialStage ?? "source_scan";
    const events: ProjectBoardSynthesisRunEvent[] = [
      {
        stage: initialStage,
        title: (input.initialTitle ?? "Synthesis run started").trim().slice(0, 180),
        summary: (input.initialSummary ?? "Preparing to scan project sources for a Pi PM review proposal.").trim().slice(0, 1000),
        metadata: input.initialMetadata ?? { model: input.model, retryOfRunId: input.retryOfRunId },
        createdAt: now,
      },
    ];
    this.db
      .prepare(
        `INSERT INTO project_board_synthesis_runs
         (id, board_id, proposal_id, retry_of_run_id, status, stage, model, source_count, included_source_count,
          source_char_count, prompt_char_count, response_char_count, card_count, question_count, warning_count, error,
          events_json, progressive_records_json, planning_snapshots_json, started_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        input.boardId,
        null,
        input.retryOfRunId?.trim() || null,
        "running",
        initialStage,
        input.model?.trim() || null,
        typeof input.sourceCount === "number" && Number.isFinite(input.sourceCount) ? Math.max(0, Math.round(input.sourceCount)) : 0,
        typeof input.includedSourceCount === "number" && Number.isFinite(input.includedSourceCount)
          ? Math.max(0, Math.round(input.includedSourceCount))
          : 0,
        typeof input.sourceCharCount === "number" && Number.isFinite(input.sourceCharCount)
          ? Math.max(0, Math.round(input.sourceCharCount))
          : 0,
        null,
        null,
        null,
        null,
        0,
        null,
        JSON.stringify(events),
        "[]",
        "[]",
        now,
        now,
        null,
      );
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found after create: ${runId}`);
    return mapProjectBoardSynthesisRunRow(row);
  }

  getProjectBoardSynthesisRun(runId: string): ProjectBoardSynthesisRun | undefined {
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    return row ? mapProjectBoardSynthesisRunRow(row) : undefined;
  }

  getRunningProjectBoardSynthesisRun(
    boardId: string,
    input: { excludeStages?: ProjectBoardSynthesisRunStage[] } = {},
  ): ProjectBoardSynthesisRun | undefined {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ? AND status IN ('running', 'pause_requested')
         ORDER BY updated_at DESC, started_at DESC, rowid DESC
         LIMIT 20`,
      )
      .all(boardId) as ProjectBoardSynthesisRunStoreRow[];
    const excluded = new Set(input.excludeStages ?? []);
    for (const row of rows) {
      const run = mapProjectBoardSynthesisRunRow(row);
      if (!excluded.has(run.stage)) return run;
    }
    return undefined;
  }

  failStaleProjectBoardSynthesisRuns(input: { boardId: string; staleBefore: string; reason: string }): ProjectBoardSynthesisRun[] {
    return this.lifecycleRepository.failStaleProjectBoardSynthesisRuns(input);
  }

  markProjectBoardSynthesisRunStalled(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.lifecycleRepository.markProjectBoardSynthesisRunStalled(input);
  }

  requestProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.lifecycleRepository.requestProjectBoardSynthesisRunPause(input);
  }

  markProjectBoardSynthesisRunPaused(input: {
    boardId: string;
    runId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): ProjectBoardSynthesisRun {
    return this.lifecycleRepository.markProjectBoardSynthesisRunPaused(input);
  }

  abandonProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.lifecycleRepository.abandonProjectBoardSynthesisRunPause(input);
  }

  recordProjectBoardSynthesisRunEvent(runId: string, input: ProjectBoardSynthesisRunEventRecordInput): ProjectBoardSynthesisRun {
    return this.recordsRepository.recordProjectBoardSynthesisRunEvent(runId, input);
  }

  updateProjectBoardSynthesisRunProgress(
    runId: string,
    input: {
      stage?: ProjectBoardSynthesisRunStage;
      model?: string;
      sourceCount?: number;
      includedSourceCount?: number;
      sourceCharCount?: number;
      promptCharCount?: number;
      responseCharCount?: number;
      cardCount?: number;
      questionCount?: number;
      warningCount?: number;
    },
  ): ProjectBoardSynthesisRun {
    return this.recordsRepository.updateProjectBoardSynthesisRunProgress(runId, input);
  }

  tryUpdateProjectBoardSynthesisRunProgress(
    runId: string,
    input: {
      stage?: ProjectBoardSynthesisRunStage;
      model?: string;
      sourceCount?: number;
      includedSourceCount?: number;
      sourceCharCount?: number;
      promptCharCount?: number;
      responseCharCount?: number;
      cardCount?: number;
      questionCount?: number;
      warningCount?: number;
    },
  ): ProjectBoardSynthesisRun | undefined {
    return this.recordsRepository.tryUpdateProjectBoardSynthesisRunProgress(runId, input);
  }

  recordProjectBoardSynthesisRunProgressiveRecords(
    runId: string,
    records: ProjectBoardSynthesisRunProgressiveRecord[],
    input: { title?: string; summary?: string } = {},
  ): ProjectBoardSynthesisRun {
    return this.recordsRepository.recordProjectBoardSynthesisRunProgressiveRecords(runId, records, input);
  }
}
