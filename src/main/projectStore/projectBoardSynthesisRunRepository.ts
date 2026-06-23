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
import { parseJsonArray } from "./projectStoreJson";
import {
  dedupeProjectBoardSynthesisRunProgressiveRecords,
  mapProjectBoardSynthesisRunRow,
  normalizeProjectBoardSynthesisRunProgressiveRecord,
  summarizeProjectBoardSynthesisRunProgressiveRecords,
  type ProjectBoardStoreRow,
  type ProjectBoardSynthesisRunStoreRow,
} from "./projectBoardMappers";
import {
  ProjectStoreProjectBoardSynthesisRunLifecycleRepository,
  type ProjectBoardSynthesisRunEventRecordInput,
} from "./projectBoardSynthesisRunLifecycleRepository";

export interface ProjectStoreProjectBoardSynthesisRunRepositoryDeps {
  appendProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind): ProjectBoardPlanningSnapshot | undefined;
}

export class ProjectStoreProjectBoardSynthesisRunRepository {
  private readonly lifecycleRepository: ProjectStoreProjectBoardSynthesisRunLifecycleRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSynthesisRunRepositoryDeps,
  ) {
    this.lifecycleRepository = new ProjectStoreProjectBoardSynthesisRunLifecycleRepository(db, {
      recordProjectBoardSynthesisRunEvent: (runId, input) => this.recordProjectBoardSynthesisRunEvent(runId, input),
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
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${runId}`);
    const now = new Date().toISOString();
    const events = [
      ...parseJsonArray<ProjectBoardSynthesisRunEvent>(row.events_json),
      {
        stage: input.stage,
        title: input.title.trim().slice(0, 180),
        summary: input.summary.trim().slice(0, 1000),
        metadata: input.metadata ?? {},
        createdAt: now,
      },
    ];
    this.db
      .prepare(
        `UPDATE project_board_synthesis_runs
         SET proposal_id = COALESCE(?, proposal_id),
             status = COALESCE(?, status),
             stage = ?,
             model = COALESCE(?, model),
             source_count = COALESCE(?, source_count),
             included_source_count = COALESCE(?, included_source_count),
             source_char_count = COALESCE(?, source_char_count),
             prompt_char_count = COALESCE(?, prompt_char_count),
             response_char_count = COALESCE(?, response_char_count),
             card_count = COALESCE(?, card_count),
             question_count = COALESCE(?, question_count),
             warning_count = COALESCE(?, warning_count),
             error = COALESCE(?, error),
             events_json = ?,
             updated_at = ?,
             completed_at = COALESCE(?, completed_at)
         WHERE id = ?`,
      )
      .run(
        input.proposalId?.trim() || null,
        input.status ?? null,
        input.stage,
        input.model?.trim() || null,
        typeof input.sourceCount === "number" && Number.isFinite(input.sourceCount) ? Math.max(0, Math.round(input.sourceCount)) : null,
        typeof input.includedSourceCount === "number" && Number.isFinite(input.includedSourceCount)
          ? Math.max(0, Math.round(input.includedSourceCount))
          : null,
        typeof input.sourceCharCount === "number" && Number.isFinite(input.sourceCharCount)
          ? Math.max(0, Math.round(input.sourceCharCount))
          : null,
        typeof input.promptCharCount === "number" && Number.isFinite(input.promptCharCount)
          ? Math.max(0, Math.round(input.promptCharCount))
          : null,
        typeof input.responseCharCount === "number" && Number.isFinite(input.responseCharCount)
          ? Math.max(0, Math.round(input.responseCharCount))
          : null,
        typeof input.cardCount === "number" && Number.isFinite(input.cardCount) ? Math.max(0, Math.round(input.cardCount)) : null,
        typeof input.questionCount === "number" && Number.isFinite(input.questionCount)
          ? Math.max(0, Math.round(input.questionCount))
          : null,
        typeof input.warningCount === "number" && Number.isFinite(input.warningCount) ? Math.max(0, Math.round(input.warningCount)) : null,
        input.error?.trim().slice(0, 1000) || null,
        JSON.stringify(events),
        now,
        input.completedAt ?? null,
        runId,
      );
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    let updated = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!updated) throw new Error(`Project board synthesis run not found after update: ${runId}`);
    if ((input.status === "paused" || input.status === "succeeded") && input.skipPlanningSnapshot !== true) {
      this.deps.appendProjectBoardPlanningSnapshotForRun(runId, input.status === "paused" ? "paused" : "final");
      updated = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
        | ProjectBoardSynthesisRunStoreRow
        | undefined;
      if (!updated) throw new Error(`Project board synthesis run not found after snapshot: ${runId}`);
    }
    return mapProjectBoardSynthesisRunRow(updated);
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
    const updated = this.tryUpdateProjectBoardSynthesisRunProgress(runId, input);
    if (!updated) throw new Error(`Project board synthesis run not found: ${runId}`);
    return updated;
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
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) return undefined;
    if (row.status !== "running" && row.status !== "pause_requested") return mapProjectBoardSynthesisRunRow(row);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE project_board_synthesis_runs
         SET stage = COALESCE(?, stage),
             model = COALESCE(?, model),
             source_count = COALESCE(?, source_count),
             included_source_count = COALESCE(?, included_source_count),
             source_char_count = COALESCE(?, source_char_count),
             prompt_char_count = COALESCE(?, prompt_char_count),
             response_char_count = COALESCE(?, response_char_count),
             card_count = COALESCE(?, card_count),
             question_count = COALESCE(?, question_count),
             warning_count = COALESCE(?, warning_count),
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.stage ?? null,
        input.model?.trim() || null,
        typeof input.sourceCount === "number" && Number.isFinite(input.sourceCount) ? Math.max(0, Math.round(input.sourceCount)) : null,
        typeof input.includedSourceCount === "number" && Number.isFinite(input.includedSourceCount)
          ? Math.max(0, Math.round(input.includedSourceCount))
          : null,
        typeof input.sourceCharCount === "number" && Number.isFinite(input.sourceCharCount)
          ? Math.max(0, Math.round(input.sourceCharCount))
          : null,
        typeof input.promptCharCount === "number" && Number.isFinite(input.promptCharCount)
          ? Math.max(0, Math.round(input.promptCharCount))
          : null,
        typeof input.responseCharCount === "number" && Number.isFinite(input.responseCharCount)
          ? Math.max(0, Math.round(input.responseCharCount))
          : null,
        typeof input.cardCount === "number" && Number.isFinite(input.cardCount) ? Math.max(0, Math.round(input.cardCount)) : null,
        typeof input.questionCount === "number" && Number.isFinite(input.questionCount)
          ? Math.max(0, Math.round(input.questionCount))
          : null,
        typeof input.warningCount === "number" && Number.isFinite(input.warningCount) ? Math.max(0, Math.round(input.warningCount)) : null,
        now,
        runId,
      );
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    const updated = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    return updated ? mapProjectBoardSynthesisRunRow(updated) : undefined;
  }

  recordProjectBoardSynthesisRunProgressiveRecords(
    runId: string,
    records: ProjectBoardSynthesisRunProgressiveRecord[],
    input: { title?: string; summary?: string } = {},
  ): ProjectBoardSynthesisRun {
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${runId}`);
    const sanitizedRecords = records.flatMap(normalizeProjectBoardSynthesisRunProgressiveRecord);
    if (sanitizedRecords.length === 0) return mapProjectBoardSynthesisRunRow(row);
    const existingRecords = parseJsonArray<ProjectBoardSynthesisRunProgressiveRecord>(row.progressive_records_json ?? "[]").flatMap(
      normalizeProjectBoardSynthesisRunProgressiveRecord,
    );
    const nextRecords = dedupeProjectBoardSynthesisRunProgressiveRecords([...existingRecords, ...sanitizedRecords]);
    const summary = summarizeProjectBoardSynthesisRunProgressiveRecords(nextRecords);
    const now = new Date().toISOString();
    const eventSummary =
      input.summary?.trim() ||
      [
        summary.candidateCardCount ? `${summary.candidateCardCount} candidate card${summary.candidateCardCount === 1 ? "" : "s"}` : "",
        summary.questionCount ? `${summary.questionCount} question${summary.questionCount === 1 ? "" : "s"}` : "",
        summary.sourceCoverageCount
          ? `${summary.sourceCoverageCount} source coverage record${summary.sourceCoverageCount === 1 ? "" : "s"}`
          : "",
        summary.dependencyEdgeCount ? `${summary.dependencyEdgeCount} dependency edge${summary.dependencyEdgeCount === 1 ? "" : "s"}` : "",
        summary.warningCount ? `${summary.warningCount} warning${summary.warningCount === 1 ? "" : "s"}` : "",
      ]
        .filter(Boolean)
        .join(", ");
    const events = [
      ...parseJsonArray<ProjectBoardSynthesisRunEvent>(row.events_json),
      {
        stage: "schema_validation" as const,
        title: (input.title?.trim() || "Persisted progressive planning records").slice(0, 180),
        summary: (
          eventSummary || `Persisted ${summary.recordCount} progressive planning record${summary.recordCount === 1 ? "" : "s"}.`
        ).slice(0, 1000),
        metadata: { progressiveSummary: summary },
        createdAt: now,
      },
    ];
    this.db
      .prepare(
        `UPDATE project_board_synthesis_runs
         SET stage = ?,
             card_count = COALESCE(?, card_count),
             question_count = COALESCE(?, question_count),
             warning_count = COALESCE(?, warning_count),
             events_json = ?,
             progressive_records_json = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        "schema_validation",
        summary.candidateCardCount > 0 ? summary.candidateCardCount : null,
        summary.questionCount > 0 ? summary.questionCount : null,
        summary.warningCount > 0 ? summary.warningCount : null,
        JSON.stringify(events),
        JSON.stringify(nextRecords),
        now,
        runId,
      );
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    const updated = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!updated) throw new Error(`Project board synthesis run not found after progressive update: ${runId}`);
    return mapProjectBoardSynthesisRunRow(updated);
  }
}
