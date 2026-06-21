import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardCardPendingPiUpdate } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import { ProjectStoreProjectBoardCardDraftMutationRepository } from "./projectBoardCardDraftMutationRepository";
import { mapProjectBoardCardRow, type ProjectBoardCardStoreRow } from "./projectBoardMappers";

describe("ProjectStoreProjectBoardCardDraftMutationRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardCardMutationEventInput[];
  let syncedBoards: string[];
  let syncedCards: number;
  let repository: ProjectStoreProjectBoardCardDraftMutationRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    syncedBoards = [];
    syncedCards = 0;
    repository = new ProjectStoreProjectBoardCardDraftMutationRepository(db, {
      listOrchestrationTasks: () => [],
      getProjectBoard: (boardId) => ({
        id: boardId,
        projectPath: "/workspace",
        status: "active",
        title: "Project board",
        summary: "",
        cards: listCards(db, boardId),
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-06-16T00:00:00.000Z",
        updatedAt: "2026-06-16T00:00:00.000Z",
      }),
      projectBoardRequiresProofSpec: () => false,
      assertProjectBoardCardProofReady: () => undefined,
      assertProjectBoardCardClarificationsResolved: () => undefined,
      assertProjectBoardRunFollowUpStillActionable: () => undefined,
      appendProjectBoardEvent: (event) => events.push(event),
      syncProjectBoardTaskBlockers: (boardId) => syncedBoards.push(boardId),
      syncProjectBoardCardsForLinkedTasks: () => {
        syncedCards += 1;
      },
    });
    insertBoard(db, "board-1");
  });

  afterEach(() => {
    db.close();
  });

  it("persists manual card creation, draft edits, and candidate status transitions", () => {
    const created = repository.createManualCard({
      boardId: "board-1",
      title: "  Draft card  ",
      description: "  Initial draft.  ",
    });

    expect(created).toMatchObject({
      boardId: "board-1",
      title: "Draft card",
      description: "Initial draft.",
      status: "draft",
      candidateStatus: "needs_clarification",
      labels: ["manual"],
    });
    expect(events[0]).toMatchObject({
      kind: "manual_card_created",
      entityId: created.id,
      metadata: expect.objectContaining({ sourceKind: "manual" }),
    });

    const updated = repository.updateCard({
      cardId: created.id,
      title: "Ready draft",
      labels: ["manual", "ui"],
      acceptanceCriteria: ["Visible UI works."],
      testPlan: { unit: ["state model"], integration: [], visual: [], manual: ["inspect UI"] },
    });

    expect(updated).toMatchObject({
      title: "Ready draft",
      candidateStatus: "ready_to_create",
      labels: ["manual", "ui"],
      userTouchedFields: expect.arrayContaining(["title", "labels", "acceptanceCriteria", "testPlan", "candidateStatus"]),
    });
    expect(events.at(-1)).toMatchObject({
      kind: "card_updated",
      entityId: created.id,
      metadata: expect.objectContaining({ changedFields: expect.arrayContaining(["candidateStatus"]) }),
    });

    const needsClarification = repository.updateCardCandidateStatus(updated.id, "needs_clarification", {
      actor: "system",
      reason: "planning consolidation",
    });
    expect(needsClarification.candidateStatus).toBe("needs_clarification");
    expect(events.at(-1)).toMatchObject({
      kind: "candidate_status_changed",
      metadata: expect.objectContaining({ actor: "system", reason: "planning consolidation" }),
    });
    expect(syncedBoards).toEqual(["board-1", "board-1"]);
    expect(syncedCards).toBe(2);
  });

  it("applies and ignores pending Pi updates on draft cards", () => {
    const appliedSource = repository.createManualCard({
      boardId: "board-1",
      title: "Apply update",
      description: "Original description.",
    });
    const pendingUpdate: ProjectBoardCardPendingPiUpdate = {
      sourceId: "decision:test",
      createdAt: "2026-06-16T00:00:00.000Z",
      changedFields: ["description", "labels"],
      description: "Pi-refined description.",
      labels: ["manual", "refined"],
    };
    db.prepare("UPDATE project_board_cards SET pending_pi_update_json = ? WHERE id = ?").run(
      JSON.stringify(pendingUpdate),
      appliedSource.id,
    );

    const applied = repository.resolvePiUpdate({ cardId: appliedSource.id, action: "apply" });

    expect(applied).toMatchObject({
      description: "Pi-refined description.",
      labels: ["manual", "refined"],
      pendingPiUpdate: undefined,
      userTouchedFields: expect.arrayContaining(["description", "labels"]),
    });
    expect(events.at(-1)).toMatchObject({
      title: "Pi update applied",
      metadata: expect.objectContaining({ sourceId: "decision:test", action: "apply", changedFields: ["description", "labels"] }),
    });

    const ignoredSource = repository.createManualCard({
      boardId: "board-1",
      title: "Ignore update",
      description: "Keep this description.",
    });
    db.prepare("UPDATE project_board_cards SET pending_pi_update_json = ? WHERE id = ?").run(
      JSON.stringify({ ...pendingUpdate, sourceId: "decision:ignore", description: "Discarded description." }),
      ignoredSource.id,
    );

    const ignored = repository.resolvePiUpdate({ cardId: ignoredSource.id, action: "ignore" });

    expect(ignored).toMatchObject({
      description: "Keep this description.",
      pendingPiUpdate: undefined,
    });
    expect(events.at(-1)).toMatchObject({
      title: "Pi update ignored",
      metadata: expect.objectContaining({ sourceId: "decision:ignore", action: "ignore" }),
    });
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function listCards(db: Database.Database, boardId: string): ProjectBoardCard[] {
  const rows = db
    .prepare("SELECT * FROM project_board_cards WHERE board_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(boardId) as ProjectBoardCardStoreRow[];
  return rows.map((row) => mapProjectBoardCardRow(row, []));
}
