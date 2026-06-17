import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import {
  ProjectStoreProjectBoardLifecycleRepository,
  type ProjectBoardLifecycleEventInput,
} from "./projectBoardLifecycleRepository";
import {
  mapProjectBoardQuestionRow,
  mapProjectBoardSourceRow,
  type ProjectBoardCharterStoreRow,
  type ProjectBoardQuestionStoreRow,
  type ProjectBoardSourceStoreRow,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";

describe("ProjectStoreProjectBoardLifecycleRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardLifecycleEventInput[];
  let ensuredQuestions: string[];
  let repository: ProjectStoreProjectBoardLifecycleRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    ensuredQuestions = [];
    repository = new ProjectStoreProjectBoardLifecycleRepository(db, {
      getWorkspace: () => ({ name: "Ambient", path: "/workspace" }),
      getActiveProjectBoard: (sourceThreadId) => findActiveBoard(db, sourceThreadId),
      getProjectBoardForPath: (projectPath, sourceThreadId) => findActiveBoard(db, sourceThreadId, projectPath),
      mapProjectBoard: mapBoard,
      ensureProjectBoardQuestions: (boardId) => {
        ensuredQuestions.push(boardId);
      },
      listProjectBoardQuestions: (boardId) => listQuestions(db, boardId),
      listProjectBoardSources: (boardId) => listSources(db, boardId),
      appendProjectBoardEvent: (event) => {
        events.push(event);
        db.prepare(
          `INSERT INTO project_board_events
            (id, board_id, event_kind, title, summary, entity_kind, entity_id, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          `event-${events.length}`,
          event.boardId,
          event.kind,
          event.title,
          event.summary,
          event.entityKind ?? null,
          event.entityId ?? null,
          JSON.stringify(event.metadata ?? {}),
          event.createdAt ?? "2026-06-16T00:00:00.000Z",
        );
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates, replaces, updates status, and resets project boards", () => {
    const created = repository.createProjectBoard({
      title: "  Lifecycle board  ",
      summary: "  Coordinate work.  ",
    });

    expect(created).toMatchObject({
      projectPath: "/workspace",
      status: "draft",
      title: "Lifecycle board",
      summary: "Coordinate work.",
    });
    expect(created.charterId).toEqual(expect.any(String));
    expect(ensuredQuestions).toEqual([created.id]);
    expect(events[0]).toMatchObject({
      boardId: created.id,
      kind: "board_created",
      metadata: expect.objectContaining({ status: "draft", charterId: created.charterId }),
    });
    expect(getCharter(db, created.charterId!)).toMatchObject({ board_id: created.id, version: 1, status: "draft" });

    const duplicate = repository.createProjectBoard({ title: "Ignored duplicate" });
    expect(duplicate.id).toBe(created.id);
    expect(countRows(db, "project_boards")).toBe(1);

    const replacement = repository.createProjectBoard({
      title: "Replacement board",
      replaceActive: true,
    });
    expect(replacement.id).not.toBe(created.id);
    expect(boardStatus(db, created.id)).toBe("archived");
    expect(replacement).toMatchObject({ status: "draft", title: "Replacement board" });

    const active = repository.updateProjectBoardStatus(replacement.id, "active");
    expect(active.status).toBe("active");
    expect(events.at(-1)).toMatchObject({
      kind: "status_changed",
      metadata: expect.objectContaining({ from: "draft", to: "active" }),
    });

    const unchanged = repository.updateProjectBoardStatus(replacement.id, "active");
    expect(unchanged.status).toBe("active");
    expect(events.filter((event) => event.kind === "status_changed")).toHaveLength(1);

    repository.resetProjectBoard(replacement.id);
    expect(findBoardRow(db, replacement.id)).toBeUndefined();
    expect(() => repository.resetProjectBoard(replacement.id)).toThrow(`Project board not found: ${replacement.id}`);
  });

  it("starts and cancels board revisions with persisted charter history", () => {
    const board = repository.createProjectBoard({ title: "Revision board" });
    const active = repository.updateProjectBoardStatus(board.id, "active");
    const originalCharterId = active.charterId!;
    db.prepare("UPDATE project_board_charters SET goal = ? WHERE id = ?").run("Original goal", originalCharterId);

    const revision = repository.startProjectBoardRevision({
      boardId: board.id,
      reason: "  Reframe the project scope.  ",
    });

    expect(revision).toMatchObject({
      id: board.id,
      status: "draft",
      summary: "Reframe the project scope.",
    });
    expect(revision.charterId).not.toBe(originalCharterId);
    expect(ensuredQuestions).toEqual([board.id, board.id]);
    expect(listCharterVersions(db, board.id)).toEqual([
      { id: originalCharterId, version: 1, status: "superseded" },
      { id: revision.charterId!, version: 2, status: "draft" },
    ]);
    expect(events.at(-1)).toMatchObject({
      kind: "board_revision_started",
      entityId: revision.charterId,
      metadata: expect.objectContaining({ previousCharterId: originalCharterId, version: 2 }),
    });

    const canceled = repository.cancelProjectBoardRevision(board.id);

    expect(canceled).toMatchObject({
      id: board.id,
      status: "active",
      charterId: originalCharterId,
      summary: "Original goal",
    });
    expect(listCharterVersions(db, board.id)).toEqual([
      { id: originalCharterId, version: 1, status: "active" },
      { id: revision.charterId!, version: 2, status: "superseded" },
    ]);
    expect(events.at(-1)).toMatchObject({
      title: "Board revision canceled",
      entityId: originalCharterId,
      metadata: expect.objectContaining({ restoredCharterId: originalCharterId, canceledCharterId: revision.charterId }),
    });
  });

  it("finalizes kickoff answers into active charter rows and lifecycle eventing", () => {
    const board = repository.createProjectBoard({ title: "Charter lifecycle board", summary: "Coordinate the launch." });
    insertQuestion(db, { boardId: board.id, id: "q-1", questionOrder: 0, question: "Goal?", answer: "Ship a reliable project board." });
    insertQuestion(db, { boardId: board.id, id: "q-2", questionOrder: 1, question: "Sources?", answer: "Use architecture.md as source authority." });
    insertQuestion(db, { boardId: board.id, id: "q-3", questionOrder: 2, question: "Decisions?", answer: "Ask when scope is ambiguous." });
    insertQuestion(db, { boardId: board.id, id: "q-4", questionOrder: 3, question: "Proof?", answer: "Require focused unit and integration proof." });
    insertQuestion(db, { boardId: board.id, id: "q-5", questionOrder: 4, question: "Execution?", answer: undefined });

    expect(() => repository.finalizeProjectBoardKickoff(board.id)).toThrow("Answer required kickoff questions");
    db.prepare("UPDATE project_board_questions SET answer = ?, answered_at = ? WHERE id = ?").run(
      "Work dependency-ready cards first.",
      "2026-06-16T00:00:00.000Z",
      "q-5",
    );
    insertSource(db, {
      boardId: board.id,
      id: "source-1",
      kind: "architecture_artifact",
      title: "System architecture",
      summary: "Durable architecture notes.",
      path: "architecture.md",
      relevance: 92,
    });

    const finalized = repository.finalizeProjectBoardKickoff(board.id);
    const charter = getCharter(db, board.charterId!)!;
    const projectSummary = JSON.parse(charter.project_summary_json ?? "{}") as Record<string, unknown>;

    expect(finalized).toMatchObject({
      id: board.id,
      status: "active",
      summary: "Ship a reliable project board.",
    });
    expect(charter).toMatchObject({
      status: "active",
      goal: "Ship a reliable project board.",
      quality_bar: "Require focused unit and integration proof.",
    });
    expect(charter.markdown).toContain("System architecture (architecture_artifact: architecture.md)");
    expect(projectSummary).toMatchObject({
      generator: "fallback_heuristic",
      summary: expect.stringContaining("Ship a reliable project board."),
    });
    expect(events.at(-1)).toMatchObject({
      kind: "charter_finalized",
      title: "Charter finalized",
      entityId: board.charterId,
      metadata: expect.objectContaining({ sourceCount: 1, projectSummaryGenerator: "fallback_heuristic" }),
    });
  });

  it("builds and persists active charter project summary refreshes", () => {
    const board = repository.createProjectBoard({ title: "Summary refresh board", summary: "Coordinate the summary." });
    insertQuestion(db, { boardId: board.id, id: "summary-q-1", questionOrder: 0, question: "Goal?", answer: "Ship the summary refresh path." });
    insertQuestion(db, { boardId: board.id, id: "summary-q-2", questionOrder: 1, question: "Sources?", answer: "Use product.md as source authority." });
    insertQuestion(db, { boardId: board.id, id: "summary-q-3", questionOrder: 2, question: "Decisions?", answer: "Ask for product scope changes." });
    insertQuestion(db, { boardId: board.id, id: "summary-q-4", questionOrder: 3, question: "Proof?", answer: "Require focused persistence proof." });
    insertQuestion(db, { boardId: board.id, id: "summary-q-5", questionOrder: 4, question: "Execution?", answer: "Refresh summaries after source changes." });
    insertSource(db, {
      boardId: board.id,
      id: "summary-source-1",
      kind: "functional_spec",
      title: "Product spec",
      summary: "Spec covers persistence, source authority, and validation.",
      path: "product.md",
      relevance: 95,
    });
    repository.finalizeProjectBoardKickoff(board.id);

    const summary = repository.buildActiveProjectBoardCharterProjectSummary(board.id, "2026-06-16T01:00:00.000Z");
    const updated = repository.updateProjectBoardCharterProjectSummary({
      boardId: board.id,
      summary,
      title: "Summary refreshed",
      eventSummary: "Refreshed summary after source scan.",
      metadata: { reason: "test-refresh" },
      createdAt: "2026-06-16T01:01:00.000Z",
    });
    const charter = getCharter(db, board.charterId!)!;
    const persistedSummary = JSON.parse(charter.project_summary_json ?? "{}") as Record<string, unknown>;

    expect(summary).toMatchObject({
      generator: "fallback_heuristic",
      generatedAt: "2026-06-16T01:00:00.000Z",
      summary: expect.stringContaining("Ship the summary refresh path."),
      sourceCoverage: expect.arrayContaining([expect.stringContaining("product.md")]),
    });
    expect(updated).toMatchObject({ id: board.id, status: "active" });
    expect(persistedSummary).toMatchObject({
      generator: "fallback_heuristic",
      generatedAt: "2026-06-16T01:00:00.000Z",
      charterAnswerChecksum: summary.charterAnswerChecksum,
    });
    expect(events.at(-1)).toMatchObject({
      kind: "charter_summary_refreshed",
      title: "Summary refreshed",
      summary: "Refreshed summary after source scan.",
      entityId: board.charterId,
      metadata: expect.objectContaining({
        generator: "fallback_heuristic",
        sourceChecksumCount: 1,
        charterAnswerChecksum: summary.charterAnswerChecksum,
        reason: "test-refresh",
      }),
    });
  });
});

function mapBoard(row: ProjectBoardStoreRow): ProjectBoardSummary {
  return {
    id: row.id,
    projectPath: row.project_path,
    sourceThreadId: row.source_thread_id ?? undefined,
    status: row.status,
    title: row.title,
    summary: row.summary,
    charterId: row.charter_id ?? undefined,
    activeDraftId: row.active_draft_id ?? undefined,
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    claims: { active: [], expired: [], conflicts: [] },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findActiveBoard(db: Database.Database, sourceThreadId?: string, projectPath = "/workspace"): ProjectBoardSummary | undefined {
  const row = db
    .prepare(
      `SELECT * FROM project_boards
       WHERE project_path = ?
         AND status IN ('draft', 'active', 'paused')
         AND (? IS NULL OR source_thread_id = ?)
       ORDER BY updated_at DESC, rowid DESC
       LIMIT 1`,
    )
    .get(projectPath, sourceThreadId ?? null, sourceThreadId ?? null) as ProjectBoardStoreRow | undefined;
  return row ? mapBoard(row) : undefined;
}

function findBoardRow(db: Database.Database, boardId: string): ProjectBoardStoreRow | undefined {
  return db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
}

function getCharter(db: Database.Database, charterId: string): ProjectBoardCharterStoreRow | undefined {
  return db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(charterId) as ProjectBoardCharterStoreRow | undefined;
}

function boardStatus(db: Database.Database, boardId: string): string | undefined {
  return (db.prepare("SELECT status FROM project_boards WHERE id = ?").get(boardId) as { status: string } | undefined)?.status;
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function listCharterVersions(db: Database.Database, boardId: string): Array<{ id: string; version: number; status: string }> {
  return db
    .prepare("SELECT id, version, status FROM project_board_charters WHERE board_id = ? ORDER BY version ASC")
    .all(boardId) as Array<{ id: string; version: number; status: string }>;
}

function insertQuestion(
  db: Database.Database,
  input: {
    boardId: string;
    id: string;
    questionOrder: number;
    question: string;
    answer?: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_questions
      (id, board_id, question_order, question, required, answer, answered_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.boardId, input.questionOrder, input.question, input.answer ?? null, input.answer ? "2026-06-16T00:00:00.000Z" : null);
}

function listQuestions(db: Database.Database, boardId: string): ProjectBoardQuestion[] {
  const rows = db
    .prepare("SELECT * FROM project_board_questions WHERE board_id = ? ORDER BY question_order ASC, rowid ASC")
    .all(boardId) as ProjectBoardQuestionStoreRow[];
  return rows.map((row) => mapProjectBoardQuestionRow(row));
}

function insertSource(
  db: Database.Database,
  input: {
    boardId: string;
    id: string;
    kind: ProjectBoardSource["kind"];
    title: string;
    summary: string;
    path?: string;
    relevance: number;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_sources
      (id, board_id, source_kind, source_key, content_hash, change_state, title, summary, excerpt, path, thread_id, artifact_id, message_id,
       byte_size, mtime, classification_reason, classified_by, classification_confidence, authority_role, include_in_synthesis, relevance, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?, ?, '', ?, NULL, NULL, NULL, NULL, NULL, '', 'user', 1, 'primary', 1, ?,
       '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.boardId, input.kind, `${input.kind}:${input.path ?? input.id}`, `${input.title}:hash`, input.title, input.summary, input.path ?? null, input.relevance);
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
