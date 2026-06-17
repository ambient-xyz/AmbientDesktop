import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import {
  mapProjectBoardRow,
} from "./projectBoardMappers";
import {
  mapProjectBoardRow as legacyMapProjectBoardRow,
} from "../projectBoardStoreMappers";
import { ProjectStoreProjectBoardReadRepository } from "./projectBoardReadRepository";

describe("ProjectStoreProjectBoardReadRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreProjectBoardReadRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    repository = new ProjectStoreProjectBoardReadRepository(db, {
      listOrchestrationTasks: () => [],
    });
  });

  afterEach(() => {
    db.close();
  });

  it("keeps the legacy project-board mapper import path as re-exports", () => {
    expect(legacyMapProjectBoardRow).toBe(mapProjectBoardRow);
  });

  it("hydrates active board rows with ordered related records", () => {
    insertBoard(db, {
      id: "board-1",
      projectPath: "/workspace",
      title: "Launch board",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });
    insertCard(db, {
      id: "card-later",
      boardId: "board-1",
      title: "Later card",
      status: "ready",
      priority: 2,
      sourceId: "later",
      updatedAt: "2026-06-06T20:02:00.000Z",
    });
    insertCard(db, {
      id: "card-first",
      boardId: "board-1",
      title: "First card",
      status: "draft",
      priority: 1,
      sourceId: "first",
      updatedAt: "2026-06-06T20:01:00.000Z",
    });
    insertSource(db, {
      id: "source-low",
      boardId: "board-1",
      title: "Low relevance",
      relevance: 1,
      updatedAt: "2026-06-06T20:04:00.000Z",
    });
    insertSource(db, {
      id: "source-high",
      boardId: "board-1",
      title: "High relevance",
      relevance: 5,
      updatedAt: "2026-06-06T20:03:00.000Z",
    });
    insertQuestion(db, { id: "question-2", boardId: "board-1", questionOrder: 2, question: "Second?" });
    insertQuestion(db, { id: "question-1", boardId: "board-1", questionOrder: 1, question: "First?" });
    insertEvent(db, {
      id: "event-old",
      boardId: "board-1",
      kind: "board_created",
      title: "Board created",
      createdAt: "2026-06-06T20:00:00.000Z",
    });
    insertEvent(db, {
      id: "event-new",
      boardId: "board-1",
      kind: "source_added",
      title: "Source added",
      createdAt: "2026-06-06T20:10:00.000Z",
    });
    insertProposal(db, { id: "proposal-1", boardId: "board-1", status: "pending", createdAt: "2026-06-06T20:06:00.000Z" });
    insertRun(db, { id: "run-1", boardId: "board-1", status: "running", stage: "source_scan", startedAt: "2026-06-06T20:07:00.000Z" });
    insertExecutionArtifact(db, {
      id: "artifact-1",
      boardId: "board-1",
      cardId: "card-first",
      status: "ready",
      updatedAt: "2026-06-06T20:08:00.000Z",
    });

    const row = repository.findActiveProjectBoardRow("/workspace");
    expect(row?.id).toBe("board-1");
    const board = repository.mapProjectBoard(row!);

    expect(board).toMatchObject({
      id: "board-1",
      title: "Launch board",
      cards: [{ id: "card-first" }, { id: "card-later" }],
      sources: [{ id: "source-high" }, { id: "source-low" }],
      questions: [{ id: "question-1" }, { id: "question-2" }],
      proposals: [{ id: "proposal-1" }],
      synthesisRuns: [{ id: "run-1" }],
      executionArtifacts: [{ id: "artifact-1" }],
    });
    expect(board.events?.map((event) => event.id)).toEqual(["event-new", "event-old"]);
  });

  it("owns charter lookup and board charter hydration", () => {
    insertBoard(db, {
      id: "board-charter",
      projectPath: "/workspace",
      title: "Chartered board",
      charterId: "charter-1",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });
    insertCharter(db, {
      id: "charter-1",
      boardId: "board-charter",
      goal: "Ship the chartered board.",
      projectSummaryJson: JSON.stringify({
        generator: "fallback_heuristic",
        summary: "Ship the chartered board.",
        majorSystems: ["State and persistence"],
        sourceCoverage: [],
        risks: [],
        dependencyHints: [],
        unresolvedDecisions: [],
        citations: [],
        coverageGaps: [],
        sourceChecksumSet: [],
        charterAnswerChecksum: "checksum-1",
        kickoffContextBrief: { includedSourceCount: 0, ignoredSourceCount: 0, sourceNotes: [], generatedAt: "2026-06-06T20:00:00.000Z" },
        generatedAt: "2026-06-06T20:00:00.000Z",
      }),
    });

    expect(repository.getProjectBoardCharter("charter-1")).toMatchObject({
      id: "charter-1",
      boardId: "board-charter",
      goal: "Ship the chartered board.",
      projectSummary: expect.objectContaining({ charterAnswerChecksum: "checksum-1" }),
    });
    expect(repository.mapProjectBoard(repository.getProjectBoardRow("board-charter")!)).toMatchObject({
      id: "board-charter",
      charter: expect.objectContaining({
        id: "charter-1",
        goal: "Ship the chartered board.",
      }),
    });
    expect(() => repository.getProjectBoardCharter("missing-charter")).toThrow("Project board charter not found: missing-charter");
  });

  it("respects source-thread precedence and card lookup behavior", () => {
    insertBoard(db, {
      id: "board-global",
      projectPath: "/workspace",
      title: "Global board",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });
    insertBoard(db, {
      id: "board-thread",
      projectPath: "/workspace",
      sourceThreadId: "thread-1",
      title: "Thread board",
      updatedAt: "2026-06-06T20:10:00.000Z",
    });
    insertCard(db, {
      id: "card-1",
      boardId: "board-thread",
      title: "Thread card",
      status: "ready",
      sourceId: "thread-card",
      updatedAt: "2026-06-06T20:11:00.000Z",
    });

    expect(repository.findActiveProjectBoardRow("/workspace")?.id).toBe("board-thread");
    expect(repository.findActiveProjectBoardRow("/workspace", "thread-1")?.id).toBe("board-thread");
    expect(repository.findActiveProjectBoardRow("/workspace", "missing-thread")?.id).toBe("board-global");
    expect(repository.getProjectBoardCard("card-1")).toMatchObject({ id: "card-1", boardId: "board-thread" });
    expect(repository.tryGetProjectBoardCard("missing-card")).toBeUndefined();
    expect(() => repository.getProjectBoardCard("missing-card")).toThrow("Project board card not found: missing-card");
  });
});

function insertBoard(
  db: Database.Database,
  input: {
    id: string;
    projectPath: string;
    title: string;
    sourceThreadId?: string;
    charterId?: string;
    status?: string;
    updatedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, source_thread_id, status, title, summary, charter_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)`,
  ).run(input.id, input.projectPath, input.sourceThreadId ?? null, input.status ?? "active", input.title, input.charterId ?? null, input.updatedAt, input.updatedAt);
}

function insertCharter(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    goal: string;
    projectSummaryJson?: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_charters
      (id, board_id, version, status, goal, current_state, target_user, non_goals_json, quality_bar,
       test_policy_json, decision_policy_json, dependency_policy_json, budget_policy_json, source_policy_json,
       markdown, project_summary_json, created_at, updated_at)
     VALUES (?, ?, 1, 'active', ?, 'Current state', 'Target user', '[]', 'Quality bar',
       '{"unit":true}', '{"defaultPolicy":"ask"}', '{"ordering":"blockers_first"}', '{"maxPassesPerCard":6}', '{"policy":"source"}',
       '# Charter', ?, '2026-06-06T20:00:00.000Z', '2026-06-06T20:00:00.000Z')`,
  ).run(input.id, input.boardId, input.goal, input.projectSummaryJson ?? null);
}

function insertCard(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    status: string;
    sourceId: string;
    priority?: number;
    updatedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, status, source_kind, source_id, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?)`,
  ).run(input.id, input.boardId, input.title, input.status, input.sourceId, input.priority ?? null, input.updatedAt, input.updatedAt);
}

function insertSource(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    relevance: number;
    updatedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_sources
      (id, board_id, source_kind, title, relevance, created_at, updated_at)
     VALUES (?, ?, 'manual', ?, ?, ?, ?)`,
  ).run(input.id, input.boardId, input.title, input.relevance, input.updatedAt, input.updatedAt);
}

function insertQuestion(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    questionOrder: number;
    question: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_questions
      (id, board_id, question_order, question, created_at, updated_at)
     VALUES (?, ?, ?, ?, '2026-06-06T20:00:00.000Z', '2026-06-06T20:00:00.000Z')`,
  ).run(input.id, input.boardId, input.questionOrder, input.question);
}

function insertEvent(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    kind: string;
    title: string;
    createdAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_events
      (id, board_id, event_kind, title, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.id, input.boardId, input.kind, input.title, input.createdAt);
}

function insertProposal(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    status: string;
    createdAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_synthesis_proposals
      (id, board_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.id, input.boardId, input.status, input.createdAt, input.createdAt);
}

function insertRun(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    status: string;
    stage: string;
    startedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_synthesis_runs
      (id, board_id, status, stage, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(input.id, input.boardId, input.status, input.stage, input.startedAt, input.startedAt);
}

function insertExecutionArtifact(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    cardId: string;
    status: string;
    updatedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_execution_artifacts
      (id, board_id, card_id, status, started_at, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.id, input.boardId, input.cardId, input.status, input.updatedAt, input.updatedAt, input.updatedAt);
}
