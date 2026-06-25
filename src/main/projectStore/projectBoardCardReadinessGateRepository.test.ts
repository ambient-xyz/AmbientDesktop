import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import { ProjectStoreProjectBoardCardReadinessGateRepository } from "./projectBoardCardReadinessGateRepository";

const emptyTestPlan = { unit: [], integration: [], visual: [], manual: [] };

function projectBoardCard(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Card 1",
    description: "",
    status: "draft",
    candidateStatus: "ready_to_create",
    priority: null,
    phase: null,
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: emptyTestPlan,
    sourceKind: "manual",
    sourceId: "manual:card-1",
    sourceThreadId: undefined,
    sourceMessageId: undefined,
    orchestrationTaskId: undefined,
    clarificationQuestions: [],
    clarificationSuggestions: [],
    clarificationAnswers: [],
    clarificationDecisions: [],
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    ...overrides,
  } as ProjectBoardCard;
}

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE project_board_charters (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      test_policy_json TEXT NOT NULL
    );
    CREATE TABLE project_boards (
      id TEXT PRIMARY KEY,
      charter_id TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO project_board_charters (id, status, test_policy_json) VALUES (?, ?, ?)").run(
    "charter-1",
    "active",
    JSON.stringify({ requireProofSpec: true }),
  );
  db.prepare("INSERT INTO project_boards (id, charter_id) VALUES (?, ?)").run("board-1", "charter-1");
  return db;
}

describe("ProjectStoreProjectBoardCardReadinessGateRepository", () => {
  const openDbs: Database.Database[] = [];

  afterEach(() => {
    for (const db of openDbs.splice(0)) db.close();
  });

  function repository(cards: ProjectBoardCard[] = []): ProjectStoreProjectBoardCardReadinessGateRepository {
    const db = createDb();
    openDbs.push(db);
    return new ProjectStoreProjectBoardCardReadinessGateRepository(db, {
      listProjectBoardCards: () => cards,
    });
  }

  it("enforces active charter proof requirements before ticketization", () => {
    const gates = repository();

    expect(gates.projectBoardRequiresProofSpec("board-1")).toBe(true);
    expect(() => gates.assertProjectBoardCardProofReady(projectBoardCard())).toThrow(
      "Strict project board proof policy requires at least one proof expectation before a card can be marked ready.",
    );
    expect(() =>
      gates.assertProjectBoardCardProofReady(
        projectBoardCard({ testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof expectation."] } }),
      ),
    ).not.toThrow();
  });

  it("blocks ready cards with unresolved clarifications", () => {
    const gates = repository();

    expect(() => gates.assertProjectBoardCardClarificationsResolved(projectBoardCard({ clarificationQuestions: ["What is in scope?"] }))).toThrow(
      "Clarification questions must be answered before a card can be marked ready.",
    );
    expect(() => gates.assertProjectBoardCardClarificationsResolved(projectBoardCard())).not.toThrow();
  });

  it("blocks run follow-ups when their parent card is already closed", () => {
    const parent = projectBoardCard({ id: "parent-card", title: "Parent", status: "done", sourceId: "parent-source" });
    const followUp = projectBoardCard({
      id: "follow-up-card",
      title: "Follow-up",
      sourceKind: "run_follow_up",
      sourceId: "follow-up-source",
      blockedBy: ["parent-card"],
    });
    const gates = repository([parent, followUp]);

    expect(() => gates.assertProjectBoardRunFollowUpStillActionable(followUp)).toThrow(
      'Run follow-up cannot be marked ready because parent card "Parent" is already done.',
    );
  });

  it("requires gated implementation cards to reference an approved UX mock", () => {
    const mockGate = projectBoardCard({
      id: "mock-card",
      title: "UX mock approval",
      sourceId: "synthesis:ux-mock-approval",
      labels: ["ux-mock-approval"],
    });
    const implementation = projectBoardCard({
      id: "implementation-card",
      title: "Implementation",
      sourceId: "implementation-source",
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
      blockedBy: ["mock-card"],
    });
    const gates = repository();

    expect(() => gates.assertProjectBoardUxMockGateOpen(implementation, [mockGate, implementation])).toThrow(
      "Approve the UX mock before creating UI implementation tasks: UX mock approval.",
    );
    expect(() =>
      gates.assertProjectBoardUxMockGateOpen(implementation, [{ ...mockGate, status: "done" }, implementation]),
    ).not.toThrow();
  });
});
