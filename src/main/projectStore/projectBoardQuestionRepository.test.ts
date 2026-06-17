import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import type { ProjectBoardEvent, ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import { DEFAULT_PROJECT_BOARD_QUESTIONS } from "./projectStoreFacadeHelpers";
import {
  mapProjectBoardQuestionRow,
  mapProjectBoardSourceRow,
  type ProjectBoardQuestionStoreRow,
  type ProjectBoardSourceStoreRow,
} from "./projectBoardMappers";
import { ProjectStoreProjectBoardQuestionRepository } from "./projectBoardQuestionRepository";

describe("ProjectStoreProjectBoardQuestionRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardEvent[];
  let repository: ProjectStoreProjectBoardQuestionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    events = [];
    repository = new ProjectStoreProjectBoardQuestionRepository(db, {
      getProjectBoard: (boardId) => projectBoardSummary(db, boardId, events),
      listProjectBoardQuestions: (boardId) => listQuestions(db, boardId),
      listProjectBoardSources: (boardId) => listSources(db, boardId),
      appendProjectBoardEvent: (event) => {
        events.push({
          id: `event-${events.length + 1}`,
          createdAt: event.createdAt ?? `2026-06-16T00:00:0${events.length}.000Z`,
          ...event,
        });
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("owns kickoff question seeding, answer persistence, and default suggestions", () => {
    const questions = repository.ensureProjectBoardQuestions("board-1");

    expect(questions.map((question) => question.question)).toEqual(DEFAULT_PROJECT_BOARD_QUESTIONS);
    const questionIds = questions.map((question) => question.id);
    expect(repository.ensureProjectBoardQuestions("board-1").map((question) => question.id)).toEqual(questionIds);

    const answered = repository.answerProjectBoardQuestion(questions[0]!.id, "  Ship a reliable first release.  ");
    expect(answered).toMatchObject({
      id: questions[0]!.id,
      answer: "Ship a reliable first release.",
    });
    expect(events.at(-1)).toMatchObject({
      kind: "question_answered",
      title: "Kickoff answer saved",
      entityKind: "project_board_question",
      entityId: questions[0]!.id,
      metadata: { questionId: questions[0]!.id, answerLength: 30 },
    });
    expect(() => repository.answerProjectBoardQuestion(questions[1]!.id, "  ")).toThrow("cannot be empty");

    const source = insertSource(db, {
      id: "source-1",
      kind: "plan_artifact",
      title: "Durable plan",
      summary: "Primary plan for a durable board.",
      path: "plans/board.md",
    });
    const defaultQuestion = repository.getProjectBoardQuestion(questions[1]!.id);
    const contextFingerprint = projectBoardKickoffDefaultContextFingerprint({
      question: defaultQuestion.question,
      sources: [source],
    });

    const defaulted = repository.applyProjectBoardKickoffDefaultSuggestions({
      boardId: "board-1",
      targetQuestionIds: [defaultQuestion.id],
      model: "test-pi",
      telemetry: { promptCharCount: 1200, responseCharCount: 320, requestDurationMs: 44 },
      suggestions: [
        {
          questionId: defaultQuestion.id,
          question: defaultQuestion.question,
          suggestedAnswer: "Use the durable plan as the project source of truth.",
          rationale: "The plan is the included primary source.",
          confidence: "high",
          sourceIds: [source.id, "missing-source"],
          contextFingerprint,
        },
      ],
    });

    expect(defaulted.questions.find((question) => question.id === defaultQuestion.id)).toMatchObject({
      suggestedAnswer: "Use the durable plan as the project source of truth.",
      suggestedAnswerRationale: "The plan is the included primary source.",
      suggestedAnswerConfidence: "high",
      suggestedAnswerSourceIds: [source.id],
      suggestedAnswerModel: "test-pi",
      suggestedAnswerStale: false,
      answer: undefined,
    });
    expect(events.at(-1)).toMatchObject({
      kind: "kickoff_defaults_suggested",
      title: "Kickoff defaults suggested",
      metadata: {
        kickoffDefaults: expect.objectContaining({
          appliedAction: "suggest_source_derived_defaults",
          targetQuestionIds: [defaultQuestion.id],
          appliedQuestionIds: [defaultQuestion.id],
          skippedQuestionIds: [],
          suggestedQuestionCount: 1,
          modelCallRequired: true,
          model: "test-pi",
          promptCharCount: 1200,
          responseCharCount: 320,
          requestDurationMs: 44,
        }),
      },
    });

    db.prepare("UPDATE project_board_sources SET summary = ?, updated_at = ? WHERE id = ?").run(
      "Primary plan changed after the default was suggested.",
      "2026-06-16T00:01:00.000Z",
      source.id,
    );
    expect(repository.getProjectBoardQuestion(defaultQuestion.id).suggestedAnswerStale).toBe(true);
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function insertSource(
  db: Database.Database,
  input: {
    id: string;
    kind: ProjectBoardSource["kind"];
    title: string;
    summary: string;
    path?: string;
  },
): ProjectBoardSource {
  db.prepare(
    `INSERT INTO project_board_sources
      (id, board_id, source_kind, source_key, content_hash, change_state, title, summary, excerpt, path, thread_id, artifact_id, message_id,
       byte_size, mtime, classification_reason, classified_by, classification_confidence, authority_role, include_in_synthesis, relevance, created_at, updated_at)
     VALUES (?, 'board-1', ?, ?, ?, 'new', ?, ?, '', ?, NULL, NULL, NULL, NULL, NULL, '', 'user', 1, 'primary', 1, 90,
       '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.kind, `${input.kind}:${input.path ?? input.id}`, `${input.title}:hash`, input.title, input.summary, input.path ?? null);
  return listSources(db, "board-1").find((source) => source.id === input.id)!;
}

function listSources(db: Database.Database, boardId: string): ProjectBoardSource[] {
  const rows = db
    .prepare(
      `SELECT * FROM project_board_sources
       WHERE board_id = ?
       ORDER BY relevance DESC, updated_at DESC, title ASC`,
    )
    .all(boardId) as ProjectBoardSourceStoreRow[];
  return rows.map(mapProjectBoardSourceRow);
}

function listQuestions(db: Database.Database, boardId: string): ProjectBoardQuestion[] {
  const rows = db
    .prepare("SELECT * FROM project_board_questions WHERE board_id = ? ORDER BY question_order ASC, rowid ASC")
    .all(boardId) as ProjectBoardQuestionStoreRow[];
  const sources = rows.some((row) => row.suggestion_context_fingerprint) ? listSources(db, boardId) : undefined;
  return rows.map((row) => mapProjectBoardQuestionRow(row, sources));
}

function projectBoardSummary(db: Database.Database, boardId: string, events: ProjectBoardEvent[]): ProjectBoardSummary | undefined {
  const row = db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as
    | {
        id: string;
        project_path: string;
        source_thread_id: string | null;
        status: ProjectBoardSummary["status"];
        title: string;
        summary: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    projectPath: row.project_path,
    sourceThreadId: row.source_thread_id ?? undefined,
    status: row.status,
    title: row.title,
    summary: row.summary,
    cards: [],
    sources: listSources(db, boardId),
    questions: listQuestions(db, boardId),
    proposals: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: events.filter((event) => event.boardId === boardId),
    claims: { active: [], expired: [], conflicts: [] },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
