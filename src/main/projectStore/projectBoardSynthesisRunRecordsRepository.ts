import type Database from "better-sqlite3";
import type {
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
  type ProjectBoardSynthesisRunStoreRow,
} from "./projectBoardMappers";
import type { ProjectBoardSynthesisRunEventRecordInput } from "./projectBoardSynthesisRunLifecycleRepository";
import type { ProjectStoreProjectBoardSynthesisRunRepositoryDeps } from "./projectBoardSynthesisRunRepository";

export class ProjectStoreProjectBoardSynthesisRunRecordsRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSynthesisRunRepositoryDeps,
  ) {}

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
        nonNegativeIntegerOrNull(input.sourceCount),
        nonNegativeIntegerOrNull(input.includedSourceCount),
        nonNegativeIntegerOrNull(input.sourceCharCount),
        nonNegativeIntegerOrNull(input.promptCharCount),
        nonNegativeIntegerOrNull(input.responseCharCount),
        nonNegativeIntegerOrNull(input.cardCount),
        nonNegativeIntegerOrNull(input.questionCount),
        nonNegativeIntegerOrNull(input.warningCount),
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
        nonNegativeIntegerOrNull(input.sourceCount),
        nonNegativeIntegerOrNull(input.includedSourceCount),
        nonNegativeIntegerOrNull(input.sourceCharCount),
        nonNegativeIntegerOrNull(input.promptCharCount),
        nonNegativeIntegerOrNull(input.responseCharCount),
        nonNegativeIntegerOrNull(input.cardCount),
        nonNegativeIntegerOrNull(input.questionCount),
        nonNegativeIntegerOrNull(input.warningCount),
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

function nonNegativeIntegerOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}
