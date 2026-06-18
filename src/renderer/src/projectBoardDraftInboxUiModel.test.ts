import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import {
  projectBoardDraftColumnMoveState,
  projectBoardDraftColumns,
  projectBoardDraftInboxCreateReadyPreview,
  projectBoardDraftInboxFilterOptions,
  projectBoardPiUpdateReviewQueue,
} from "./projectBoardDraftInboxUiModel";

describe("projectBoardDraftInboxUiModel", () => {
  it("groups draft candidates, filters by decisions, and surfaces blocking candidates", () => {
    const base = boardCard();
    const cards: ProjectBoardCard[] = [
      { ...base, id: "foundation", title: "Foundation", priority: 1, candidateStatus: "ready_to_create" },
      { ...base, id: "dependent", title: "Dependent", priority: 2, candidateStatus: "ready_to_create", blockedBy: ["foundation"] },
      {
        ...base,
        id: "decision",
        title: "Keyboard mappings",
        candidateStatus: "needs_clarification",
        clarificationQuestions: ["Should numpad operators map directly?"],
      },
      { ...base, id: "duplicate", title: "Already covered", candidateStatus: "duplicate" },
    ];
    const board = boardSummary({ cards });

    expect(projectBoardDraftColumns(cards, { board, query: "numpad", filterId: "needs_decision" }).flatMap((column) => column.cards.map((card) => card.id))).toEqual([
      "decision",
    ]);
    expect(projectBoardDraftColumns(cards, { board, includeSkipped: false }).flatMap((column) => column.cards.map((card) => card.id))).not.toContain("duplicate");
    expect(projectBoardDraftInboxFilterOptions(cards, board).map((option) => [option.id, option.count])).toEqual([
      ["all", 4],
      ["blocking_or_critical", 2],
      ["ready", 2],
      ["needs_decision", 1],
      ["missing_proof", 0],
      ["blocked_by_dependency", 1],
      ["stale_impact", 0],
      ["duplicate", 1],
      ["evidence", 0],
      ["rejected", 0],
    ]);
    expect(projectBoardDraftColumns(cards, { board, filterId: "blocking_or_critical" }).flatMap((column) => column.cards.map((card) => card.id))).toEqual([
      "foundation",
      "dependent",
    ]);
  });

  it("previews ready task creation and proof-gated drag targets", () => {
    const cards: ProjectBoardCard[] = [
      boardCard({ id: "ready", title: "Ready task", candidateStatus: "ready_to_create" }),
      boardCard({ id: "markable", title: "Markable task", candidateStatus: "needs_clarification" }),
      boardCard({ id: "dependency", title: "Dependency task", candidateStatus: "ready_to_create", blockedBy: ["ready"] }),
      boardCard({
        id: "decision",
        title: "Decision task",
        candidateStatus: "needs_clarification",
        clarificationQuestions: ["Which formatter should be used?"],
      }),
      boardCard({ id: "proof-gap", title: "Proof gap", candidateStatus: "needs_clarification", testPlan: { unit: [], integration: [], visual: [], manual: [] } }),
      boardCard({ id: "duplicate", title: "Duplicate task", candidateStatus: "duplicate" }),
    ];
    const board = strictProofBoard({ cards });

    const preview = projectBoardDraftInboxCreateReadyPreview(board);
    expect(preview.ticketizableCards.map((card) => card.id)).toEqual(["ready", "dependency"]);
    expect(preview.markReadyCards.map((card) => card.id)).toEqual(["markable"]);
    expect(preview.decisionBlockedCount).toBe(1);
    expect(preview.proofGapCount).toBe(1);
    expect(preview.dependencyBlockerCount).toBe(1);
    expect(preview.skippedTerminalCount).toBe(1);

    const readyColumn = projectBoardDraftColumns([cards[4] ?? boardCard()]).find((column) => column.id === "ready_to_create")!;
    expect(projectBoardDraftColumnMoveState(readyColumn, cards[4], board)).toMatchObject({
      disabled: true,
      tone: "warning",
      label: "Proof required before Ready",
    });
    expect(projectBoardDraftColumnMoveState(readyColumn, cards[1], board)).toMatchObject({
      disabled: false,
      tone: "ready",
      label: "Drop to move to Ready To Create",
    });
  });

  it("builds staged Pi update queues across decision, source, proof, and blocked cards", () => {
    const cards: ProjectBoardCard[] = [
      boardCard({
        id: "decision-card",
        title: "Keyboard decision",
        pendingPiUpdate: {
          sourceId: "decision:keyboard",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description", "clarificationAnswers", "clarificationDecisions"],
          description: "Implement keyboard shortcuts after accepting the PM decision.",
          clarificationAnswers: [{ question: "Support shortcuts?", answer: "Yes", answeredAt: "2026-01-01T00:00:00.000Z" }],
          clarificationDecisions: [],
        },
      }),
      boardCard({
        id: "source-card",
        title: "Source refresh",
        pendingPiUpdate: {
          sourceId: "source:durable-plan",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description", "acceptanceCriteria"],
          description: "Refresh from the refined durable plan.",
          acceptanceCriteria: ["Uses the refined durable artifact."],
        },
      }),
      boardCard({
        id: "proof-card",
        title: "Proof refresh",
        pendingPiUpdate: {
          sourceId: "proof:gmi-smoke",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["testPlan"],
          testPlan: { unit: ["Reducer handles tick."], integration: [], visual: ["Screenshot shows animation."], manual: [] },
        },
      }),
      boardCard({
        id: "ticketized-card",
        title: "Already ticketized",
        status: "ready",
        orchestrationTaskId: "LOCAL-1",
        pendingPiUpdate: {
          sourceId: "run-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description"],
          description: "This should not be applied directly.",
        },
      }),
    ];

    const queue = projectBoardPiUpdateReviewQueue(boardSummary({ cards }));

    expect(queue).toMatchObject({
      visible: true,
      decisionCount: 1,
      sourceCount: 1,
      proofCount: 1,
      planningCount: 1,
      blockedCount: 1,
    });
    expect(queue.actionableItems.map((item) => item.card.id)).toEqual(["decision-card", "source-card", "proof-card"]);
    expect(queue.items.map((item) => [item.card.id, item.sourceLabel, item.actionable])).toEqual([
      ["decision-card", "PM decision refresh", true],
      ["source-card", "Source refresh", true],
      ["proof-card", "Proof suggestion", true],
      ["ticketized-card", "Planning refresh", false],
    ]);
    expect(queue.items.find((item) => item.card.id === "proof-card")?.previewLines).toContain("Proof plan: 2 expectations");
    expect(queue.items.find((item) => item.card.id === "ticketized-card")?.blocker).toContain("already ticketized");
  });
});

function boardCard(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Draft card",
    description: "Implement the card.",
    status: "draft",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: ["Acceptance is clear."],
    testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
    sourceKind: "board_synthesis",
    sourceId: "synthesis-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function boardSummary(overrides: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/workspace/app",
    status: "active",
    title: "App board",
    summary: "Active",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    events: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function strictProofBoard(overrides: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return boardSummary({
    charter: {
      id: "charter-1",
      boardId: "board-1",
      version: 1,
      status: "active",
      goal: "Ship safely",
      currentState: "",
      targetUser: "",
      nonGoals: [],
      qualityBar: "Require proof",
      testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  });
}
