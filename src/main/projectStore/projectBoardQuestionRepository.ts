import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ProjectBoardEvent, ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import type { ProjectBoardKickoffDefaultSuggestion } from "../projectBoardKickoffDefaultProvider";
import { DEFAULT_PROJECT_BOARD_QUESTIONS } from "../projectStoreFacadeHelpers";
import { mapProjectBoardQuestionRow, type ProjectBoardQuestionStoreRow } from "./projectBoardMappers";

export type ProjectBoardQuestionEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ApplyProjectBoardKickoffDefaultSuggestionsInput {
  boardId: string;
  suggestions: ProjectBoardKickoffDefaultSuggestion[];
  targetQuestionIds?: string[];
  model?: string;
  telemetry?: { promptCharCount?: number; responseCharCount?: number; requestDurationMs?: number };
  providerError?: string;
}

export interface ProjectStoreProjectBoardQuestionRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  listProjectBoardQuestions(boardId: string): ProjectBoardQuestion[];
  listProjectBoardSources(boardId: string): ProjectBoardSource[];
  appendProjectBoardEvent(input: ProjectBoardQuestionEventInput): void;
}

export class ProjectStoreProjectBoardQuestionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardQuestionRepositoryDeps,
  ) {}

  ensureProjectBoardQuestions(boardId: string): ProjectBoardQuestion[] {
    const existing = this.deps.listProjectBoardQuestions(boardId);
    const existingTexts = new Set(existing.map((question) => question.question.trim().toLowerCase()));
    const missingQuestions = DEFAULT_PROJECT_BOARD_QUESTIONS.filter((question) => !existingTexts.has(question.trim().toLowerCase()));
    if (missingQuestions.length === 0) return existing;
    const now = new Date().toISOString();
    const maxOrder = this.db
      .prepare("SELECT COALESCE(MAX(question_order), -1) AS question_order FROM project_board_questions WHERE board_id = ?")
      .get(boardId) as { question_order: number };
    const insert = this.db.prepare(
      `INSERT INTO project_board_questions
      (id, board_id, question_order, question, required, answer, answered_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const transaction = this.db.transaction(() => {
      missingQuestions.forEach((question, index) => {
        insert.run(randomUUID(), boardId, maxOrder.question_order + index + 1, question, 1, null, null, now, now);
      });
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardId);
    });
    transaction();
    return this.deps.listProjectBoardQuestions(boardId);
  }

  getProjectBoardQuestion(questionId: string): ProjectBoardQuestion {
    const row = this.db
      .prepare("SELECT * FROM project_board_questions WHERE id = ?")
      .get(questionId) as ProjectBoardQuestionStoreRow | undefined;
    if (!row) throw new Error(`Project board question not found: ${questionId}`);
    const sources = row.suggestion_context_fingerprint ? this.deps.listProjectBoardSources(row.board_id) : undefined;
    return mapProjectBoardQuestionRow(row, sources);
  }

  answerProjectBoardQuestion(questionId: string, answer: string): ProjectBoardQuestion {
    const trimmed = answer.trim();
    if (!trimmed) throw new Error("Project board question answer cannot be empty.");
    const current = this.db
      .prepare("SELECT * FROM project_board_questions WHERE id = ?")
      .get(questionId) as ProjectBoardQuestionStoreRow | undefined;
    if (!current) throw new Error(`Project board question not found: ${questionId}`);
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE project_board_questions SET answer = ?, answered_at = ?, updated_at = ? WHERE id = ?")
      .run(trimmed, now, now, questionId);
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.board_id);
    this.deps.appendProjectBoardEvent({
      boardId: current.board_id,
      kind: "question_answered",
      title: "Kickoff answer saved",
      summary: current.question,
      entityKind: "project_board_question",
      entityId: questionId,
      metadata: { questionId, answerLength: trimmed.length },
      createdAt: now,
    });
    const row = this.db.prepare("SELECT * FROM project_board_questions WHERE id = ?").get(questionId) as ProjectBoardQuestionStoreRow;
    return mapProjectBoardQuestionRow(row, this.deps.listProjectBoardSources(current.board_id));
  }

  applyProjectBoardKickoffDefaultSuggestions(input: ApplyProjectBoardKickoffDefaultSuggestionsInput): ProjectBoardSummary {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = new Date().toISOString();
    const targetQuestionIds = [
      ...new Set((input.targetQuestionIds?.length ? input.targetQuestionIds : input.suggestions.map((item) => item.questionId)).filter(Boolean)),
    ];
    const suggestionsByQuestionId = new Map(input.suggestions.map((suggestion) => [suggestion.questionId, suggestion]));
    const appliedQuestionIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    const updateSuggestion = this.db.prepare(
      `UPDATE project_board_questions
       SET suggested_answer = ?,
           suggestion_rationale = ?,
           suggestion_confidence = ?,
           suggestion_source_ids_json = ?,
           suggestion_context_fingerprint = ?,
           suggestion_generated_at = ?,
           suggestion_model = ?,
           suggestion_provider_error = NULL,
           updated_at = ?
       WHERE id = ?
         AND board_id = ?
         AND (answer IS NULL OR trim(answer) = '')`,
    );
    const updateProviderError = this.db.prepare(
      `UPDATE project_board_questions
       SET suggestion_provider_error = ?,
           suggestion_generated_at = ?,
           suggestion_model = ?,
           updated_at = ?
       WHERE id = ?
         AND board_id = ?
         AND (answer IS NULL OR trim(answer) = '')`,
    );

    for (const questionId of targetQuestionIds) {
      const current = board.questions.find((question) => question.id === questionId);
      if (!current) {
        skippedReasons[questionId] = "Question was not found on this board.";
        continue;
      }
      if (current.answer?.trim()) {
        skippedReasons[questionId] = "Question already has a saved answer.";
        continue;
      }
      const suggestion =
        suggestionsByQuestionId.get(questionId) ??
        input.suggestions.find((candidate) => projectBoardQuestionsAreNearDuplicates(candidate.question, current.question));
      if (!suggestion) {
        skippedReasons[questionId] = input.providerError
          ? "Ambient/Pi did not provide a default because the request failed."
          : "Ambient/Pi did not return a default for this question.";
        if (input.providerError) {
          updateProviderError.run(input.providerError.slice(0, 500), now, input.model ?? null, now, current.id, board.id);
        }
        continue;
      }
      const contextFingerprint =
        suggestion.contextFingerprint ||
        projectBoardKickoffDefaultContextFingerprint({ question: current.question, sources: board.sources });
      const result = updateSuggestion.run(
        suggestion.suggestedAnswer.trim().slice(0, 4000),
        suggestion.rationale.trim().slice(0, 1000),
        suggestion.confidence,
        JSON.stringify([...new Set(suggestion.sourceIds.filter((sourceId) => board.sources.some((source) => source.id === sourceId)))].slice(0, 20)),
        contextFingerprint,
        now,
        input.model ?? null,
        now,
        current.id,
        board.id,
      );
      if (result.changes <= 0) {
        skippedReasons[questionId] = "Question default metadata could not be updated.";
        continue;
      }
      appliedQuestionIds.push(questionId);
    }

    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    const skippedQuestionIds = targetQuestionIds.filter((questionId) => !appliedQuestionIds.includes(questionId));
    this.deps.appendProjectBoardEvent({
      boardId: board.id,
      kind: "kickoff_defaults_suggested",
      title: input.providerError && appliedQuestionIds.length === 0 ? "Pi kickoff defaults unavailable" : "Kickoff defaults suggested",
      summary:
        appliedQuestionIds.length > 0
          ? `Ambient/Pi proposed ${appliedQuestionIds.length} editable kickoff default${appliedQuestionIds.length === 1 ? "" : "s"} from the current source scan.`
          : `No kickoff defaults were applied; ${skippedQuestionIds.length} question${skippedQuestionIds.length === 1 ? "" : "s"} skipped.`,
      entityKind: "project_board",
      entityId: board.id,
      metadata: {
        kickoffDefaults: {
          schemaVersion: 1,
          appliedAction: "suggest_source_derived_defaults",
          targetQuestionIds,
          appliedQuestionIds,
          skippedQuestionIds,
          skippedReasons,
          suggestedQuestionCount: appliedQuestionIds.length,
          modelCallRequired: true,
          ...(input.model ? { model: input.model } : {}),
          ...(typeof input.telemetry?.promptCharCount === "number" ? { promptCharCount: input.telemetry.promptCharCount } : {}),
          ...(typeof input.telemetry?.responseCharCount === "number" ? { responseCharCount: input.telemetry.responseCharCount } : {}),
          ...(typeof input.telemetry?.requestDurationMs === "number" ? { requestDurationMs: input.telemetry.requestDurationMs } : {}),
          ...(input.providerError ? { providerError: input.providerError.slice(0, 500) } : {}),
        },
        suggestions: input.suggestions.map((suggestion) => ({
          questionId: suggestion.questionId,
          question: suggestion.question,
          confidence: suggestion.confidence,
          sourceIds: suggestion.sourceIds,
          rationale: suggestion.rationale,
        })),
      },
      createdAt: now,
    });
    return this.deps.getProjectBoard(board.id) ?? board;
  }
}
