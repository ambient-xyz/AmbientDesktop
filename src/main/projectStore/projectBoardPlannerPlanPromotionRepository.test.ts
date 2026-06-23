import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ProjectBoardCard, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { mapProjectBoardCardRow, type ProjectBoardCardStoreRow } from "./projectBoardMappers";
import {
  ProjectStoreProjectBoardPlannerPlanPromotionRepository,
  type ProjectStoreProjectBoardPlannerPlanPromotionRepositoryDeps,
} from "./projectBoardPlannerPlanPromotionRepository";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";

describe("ProjectStoreProjectBoardPlannerPlanPromotionRepository", () => {
  let db: Database.Database;
  let artifact: PlannerPlanArtifact;
  let events: Parameters<ProjectStoreProjectBoardPlannerPlanPromotionRepositoryDeps["appendProjectBoardEvent"]>[0][];
  let repository: ProjectStoreProjectBoardPlannerPlanPromotionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    artifact = plannerArtifact();
    events = [];
    repository = new ProjectStoreProjectBoardPlannerPlanPromotionRepository(db, {
      appendProjectBoardEvent: (event) => events.push(event),
      createProjectBoard: () => {
        throw new Error("unexpected board creation");
      },
      getActiveProjectBoard: () => projectBoardSummary("board-1"),
      getPlannerPlanArtifact: (artifactId) => {
        if (artifactId !== artifact.id) throw new Error(`Unexpected artifact id: ${artifactId}`);
        return artifact;
      },
      getProjectArtifactWorkspacePath: () => "/workspace/.ambient/project",
      getProjectBoard: (boardId) => (boardId === "board-1" ? projectBoardSummary(boardId) : undefined),
      getProjectBoardCard: (cardId) => getProjectBoardCard(db, cardId),
      promotePlannerDurableArtifactToBoardSource: () => undefined,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("promotes a ready planner plan into one idempotent compact card", () => {
    const card = repository.promotePlannerPlanToBoard(artifact.id);
    const duplicate = repository.promotePlannerPlanToBoard(artifact.id);
    const rows = listPlannerPlanRows(db, "board-1");

    expect(duplicate.id).toBe(card.id);
    expect(rows).toHaveLength(1);
    expect(card).toMatchObject({
      boardId: "board-1",
      title: "Project board plan",
      status: "draft",
      candidateStatus: "ready_to_create",
      sourceKind: "planner_plan",
      sourceId: artifact.id,
      sourceThreadId: artifact.threadId,
      sourceMessageId: artifact.sourceMessageId,
      labels: ["plan"],
      acceptanceCriteria: ["Persist board state.", "Render the board surface."],
      testPlan: {
        unit: ["Run unit tests."],
        integration: ["Run integration smoke."],
        visual: ["Capture visual screenshots."],
        manual: [],
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      boardId: "board-1",
      kind: "plan_promoted",
      title: "Plan added to board",
      entityKind: "project_board_card",
      entityId: card.id,
      metadata: expect.objectContaining({
        artifactId: artifact.id,
        decomposition: "single_card",
        candidateStatus: "ready_to_create",
        cardIds: [card.id],
        replacedCardIds: [],
      }),
    });
  });

  it("refreshes untouched stale step candidates into the compact card", () => {
    insertPlannerPlanStepCard(db, { id: "stale-step-1", sourceId: `${artifact.id}#step:one` });
    insertPlannerPlanStepCard(db, { id: "stale-step-2", sourceId: `${artifact.id}#step:two` });

    const card = repository.promotePlannerPlanToBoard(artifact.id);
    const rows = listPlannerPlanRows(db, "board-1");

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(card.id);
    expect(card.sourceId).toBe(artifact.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Plan draft refreshed",
      summary: "Project board plan replaced 2 untouched step candidates with a compact draft inbox card.",
      metadata: expect.objectContaining({
        artifactId: artifact.id,
        replacedCardIds: ["stale-step-1", "stale-step-2"],
        decomposition: "single_card",
      }),
    });
  });

  it("parks automatic planning when a planner-plan card is already executing", () => {
    insertExecutingPlannerPlanCard(db, { id: "executing-plan", sourceId: artifact.id });

    const card = repository.parkAutomaticPlanningForExecutingPlanCard("board-1");

    expect(card).toMatchObject({
      id: "executing-plan",
      boardId: "board-1",
      title: "Executing plan",
      status: "in_progress",
      candidateStatus: "ready_to_create",
      sourceKind: "planner_plan",
      sourceId: artifact.id,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      boardId: "board-1",
      kind: "board_synthesized",
      title: "Automatic planning parked",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: {
        planningParked: true,
        executingPlannerPlanCardId: "executing-plan",
      },
    });
    expect(events[0].summary).toContain("already executing");
  });
});

function plannerArtifact(): PlannerPlanArtifact {
  return {
    id: "artifact-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    title: "Project board plan",
    summary: "Create the board shell.",
    content: "## Plan\nCreate the board shell.",
    status: "ready",
    workflowState: "durable_ready",
    steps: [
      { id: "step-1", title: "Persist board state." },
      { id: "step-2", title: "Render the board surface." },
    ],
    openQuestions: [],
    risks: [],
    verification: ["Run unit tests.", "Run integration smoke.", "Capture visual screenshots."],
    decisionQuestions: [],
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
  } as PlannerPlanArtifact;
}

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function projectBoardSummary(id: string): ProjectBoardSummary {
  return {
    id,
    projectPath: "/workspace",
    status: "active",
    title: "Project board",
    summary: "",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
  };
}

function getProjectBoardCard(db: Database.Database, cardId: string): ProjectBoardCard {
  const row = db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
  if (!row) throw new Error(`Project board card not found: ${cardId}`);
  return mapProjectBoardCardRow(row);
}

function listPlannerPlanRows(db: Database.Database, boardId: string): ProjectBoardCardStoreRow[] {
  return db
    .prepare("SELECT * FROM project_board_cards WHERE board_id = ? AND source_kind = 'planner_plan' ORDER BY created_at ASC, rowid ASC")
    .all(boardId) as ProjectBoardCardStoreRow[];
}

function insertPlannerPlanStepCard(db: Database.Database, input: { id: string; sourceId: string }): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, source_kind, source_id,
       user_touched_fields_json, created_at, updated_at)
     VALUES (?, 'board-1', 'Stale step', 'Stale step description.', 'draft', 'needs_clarification',
      'planner_plan', ?, '[]', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.sourceId);
}

function insertExecutingPlannerPlanCard(db: Database.Database, input: { id: string; sourceId: string }): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, source_kind, source_id,
       user_touched_fields_json, created_at, updated_at)
     VALUES (?, 'board-1', 'Executing plan', 'Plan card is already in flight.', 'in_progress', 'ready_to_create',
       'planner_plan', ?, '[]', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.sourceId);
}
