import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import { mapOrchestrationTaskRow, type OrchestrationTaskRow } from "./orchestrationMappers";
import { ProjectStoreProjectBoardCardCandidateSplitRepository } from "./projectBoardCardCandidateSplitRepository";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import { type ProjectBoardCardStoreRow } from "./projectBoardMappers";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";

describe("ProjectStoreProjectBoardCardCandidateSplitRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardCardMutationEventInput[];
  let repository: ProjectStoreProjectBoardCardCandidateSplitRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    repository = new ProjectStoreProjectBoardCardCandidateSplitRepository(db, {
      listOrchestrationTasks: () => listTasks(db),
      appendProjectBoardEvent: (event) => events.push(event),
    });
    insertBoard(db, "board-1");
  });

  afterEach(() => {
    db.close();
  });

  it("owns draft candidate splitting without creating Local Tasks", () => {
    insertSplitCandidate(db, {
      id: "split-card",
      boardId: "board-1",
      title: "Parent candidate",
      description: "Parent candidate description.",
      sourceKind: "planner_plan",
      sourceId: "artifact-1",
      sourceThreadId: "thread-1",
      sourceMessageId: "message-1",
      labels: ["plan"],
      acceptanceCriteria: ["Build the draft board.", "Verify the draft board."],
    });

    const children = repository.splitProjectBoardCard("split-card");
    const splitAgain = repository.splitProjectBoardCard("split-card");

    expect(children.map((item) => item.title)).toEqual(["Build the draft board.", "Verify the draft board."]);
    expect(splitAgain.map((item) => item.id)).toEqual(children.map((item) => item.id));
    expect(children).toEqual([
      expect.objectContaining({
        boardId: "board-1",
        status: "draft",
        candidateStatus: "ready_to_create",
        sourceKind: "planner_plan",
        sourceId: "artifact-1#split:1",
        sourceThreadId: "thread-1",
        sourceMessageId: "message-1",
        labels: ["plan", "split"],
        orchestrationTaskId: undefined,
        acceptanceCriteria: ["Build the draft board."],
      }),
      expect.objectContaining({
        boardId: "board-1",
        status: "draft",
        candidateStatus: "ready_to_create",
        sourceKind: "planner_plan",
        sourceId: "artifact-1#split:2",
        sourceThreadId: "thread-1",
        sourceMessageId: "message-1",
        labels: ["plan", "split"],
        orchestrationTaskId: undefined,
        acceptanceCriteria: ["Verify the draft board."],
      }),
    ]);
    expect(children[0].description).toContain("Split from: Parent candidate");
    expect(readCard(db, "split-card")).toMatchObject({ candidate_status: "duplicate" });
    expect(listTasks(db)).toEqual([]);
    expect(events.filter((event) => event.kind === "card_split")).toEqual([
      expect.objectContaining({
        title: "Candidate split",
        entityId: "split-card",
        metadata: expect.objectContaining({ parentCardId: "split-card", childCardIds: children.map((item) => item.id) }),
      }),
    ]);
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function insertSplitCandidate(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    description: string;
    sourceKind: string;
    sourceId: string;
    sourceThreadId: string;
    sourceMessageId: string;
    labels: string[];
    acceptanceCriteria: string[];
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json, clarification_decisions_json,
       source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', 'ready_to_create', 3, 'Phase 1', ?, '[]',
       ?, '{"unit":["repository test"],"integration":[],"visual":[],"manual":[]}', '["plan.md"]', '["Confirm the split?"]', '[]',
       ?, ?, ?, ?, NULL, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(
    input.id,
    input.boardId,
    input.title,
    input.description,
    JSON.stringify(input.labels),
    JSON.stringify(input.acceptanceCriteria),
    input.sourceKind,
    input.sourceId,
    input.sourceThreadId,
    input.sourceMessageId,
  );
}

function listTasks(db: Database.Database): OrchestrationTask[] {
  const rows = db.prepare("SELECT * FROM orchestration_tasks ORDER BY created_at ASC, rowid ASC").all() as OrchestrationTaskRow[];
  return rows.map((row) => mapOrchestrationTaskRow(row));
}

function readCard(db: Database.Database, cardId: string): ProjectBoardCardStoreRow {
  const row = db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
  if (!row) throw new Error(`Card not found: ${cardId}`);
  return row;
}
