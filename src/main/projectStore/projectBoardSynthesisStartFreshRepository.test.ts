import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import {
  ProjectStoreProjectBoardSynthesisStartFreshRepository,
  type ProjectBoardSynthesisStartFreshEventInput,
} from "./projectBoardSynthesisStartFreshRepository";

describe("ProjectStoreProjectBoardSynthesisStartFreshRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardSynthesisStartFreshEventInput[];
  let repository: ProjectStoreProjectBoardSynthesisStartFreshRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    events = [];
    repository = new ProjectStoreProjectBoardSynthesisStartFreshRepository(db, {
      listProjectBoardEvents: () => [],
      appendProjectBoardEvent: (event) => events.push(event),
    });
  });

  afterEach(() => {
    db.close();
  });

  it("supersedes replaceable synthesis drafts and demotes preserved start-fresh cards", () => {
    insertSynthesisCard(db, {
      id: "replaceable-card",
      boardId: "board-1",
      title: "Replaceable draft",
      sourceId: "synthesis:replaceable",
      status: "draft",
      candidateStatus: "needs_clarification",
      clarificationQuestionsJson: JSON.stringify(["Should this be replaced?"]),
    });
    insertSynthesisCard(db, {
      id: "ticketized-card",
      boardId: "board-1",
      title: "Ticketized card",
      sourceId: "synthesis:ticketized",
      status: "ready",
      candidateStatus: "ready_to_create",
      orchestrationTaskId: "task-1",
    });
    insertSynthesisCard(db, {
      id: "touched-card",
      boardId: "board-1",
      title: "Touched card",
      sourceId: "synthesis:touched",
      status: "draft",
      candidateStatus: "ready_to_create",
      userTouchedFieldsJson: JSON.stringify(["title"]),
    });
    insertSynthesisCard(db, {
      id: "evidence-card",
      boardId: "board-1",
      title: "Evidence card",
      sourceId: "synthesis:evidence",
      status: "draft",
      candidateStatus: "evidence",
    });

    const result = repository.supersedeProjectBoardSynthesisCardsForStartFresh({
      boardId: "board-1",
      runId: "paused-run-1",
      reason: " User chose Start Fresh. ",
    });

    expect(result.supersededDraftCardIds).toEqual(["replaceable-card"]);
    expect(result.preservedCardIds).toEqual(expect.arrayContaining(["ticketized-card", "touched-card", "evidence-card"]));
    expect(result.preservedCardIds).toHaveLength(3);
    expect(result.demotedPreservedCardIds).toEqual(["ticketized-card", "touched-card"]);
    expect(readCard(db, "replaceable-card")).toMatchObject({
      status: "archived",
      candidate_status: "duplicate",
      clarification_questions_json: "[]",
    });
    expect(readCard(db, "ticketized-card")).toMatchObject({
      status: "draft",
      candidate_status: "needs_clarification",
      orchestration_task_id: null,
      pending_pi_update_json: null,
    });
    expect(readCard(db, "touched-card")).toMatchObject({
      status: "draft",
      candidate_status: "needs_clarification",
    });
    expect(readCard(db, "evidence-card")).toMatchObject({
      status: "draft",
      candidate_status: "evidence",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      boardId: "board-1",
      kind: "card_updated",
      title: "Start Fresh cleared draft synthesis cards",
      entityKind: "project_board_synthesis_run",
      entityId: "paused-run-1",
      metadata: expect.objectContaining({
        decision: "start_fresh_supersede_drafts",
        abandonedRunId: "paused-run-1",
        reason: "User chose Start Fresh.",
        supersededDraftCardIds: ["replaceable-card"],
        demotedPreservedCardIds: ["ticketized-card", "touched-card"],
        detachedTaskIds: ["task-1"],
      }),
    });
  });

  it("returns an empty result without recording an event when no synthesis cards exist", () => {
    expect(
      repository.supersedeProjectBoardSynthesisCardsForStartFresh({
        boardId: "board-1",
        runId: "paused-run-1",
      }),
    ).toEqual({ supersededDraftCardIds: [], demotedPreservedCardIds: [], preservedCardIds: [] });
    expect(events).toEqual([]);
  });

  it("rejects unknown boards", () => {
    expect(() =>
      repository.supersedeProjectBoardSynthesisCardsForStartFresh({
        boardId: "missing-board",
        runId: "paused-run-1",
      }),
    ).toThrow("Project board not found: missing-board");
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function insertSynthesisCard(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    sourceId: string;
    status: string;
    candidateStatus: string;
    orchestrationTaskId?: string;
    userTouchedFieldsJson?: string;
    clarificationQuestionsJson?: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, source_kind, source_id,
       orchestration_task_id, user_touched_fields_json, clarification_questions_json, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, 'board_synthesis', ?, ?, ?, ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(
    input.id,
    input.boardId,
    input.title,
    input.status,
    input.candidateStatus,
    input.sourceId,
    input.orchestrationTaskId ?? null,
    input.userTouchedFieldsJson ?? "[]",
    input.clarificationQuestionsJson ?? "[]",
  );
}

function readCard(db: Database.Database, id: string): Record<string, unknown> {
  const row = db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Card not found: ${id}`);
  return row;
}
