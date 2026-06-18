import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardSummary, ProjectBoardSynthesisRun } from "../../shared/projectBoardTypes";
import {
  projectBoardCardBlockedByStrictProofScopeWarning,
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
  projectBoardSynthesisRunProofScopeWarnings,
} from "./projectBoardPlanningWarningUiModel";

describe("projectBoardPlanningWarningUiModel", () => {
  it("extracts proof-scope warnings and applies strict acknowledgement policy", () => {
    const run = synthesisRun({
      progressiveRecords: [
        {
          type: "warning",
          code: "proof_scope_mismatch",
          message: "Visual proof belongs downstream.",
          metadata: {
            cardId: "card-1",
            title: "Ship controls",
            proofOwnership: "downstream_visual",
            visualProofItems: ["browser screenshot"],
          },
          createdAt: "2026-01-01T00:05:00.000Z",
        },
      ],
    });
    const card = boardCard();
    const board = boardSummary({ cards: [card], synthesisRuns: [run] });

    const warnings = projectBoardPlanningWarningsForCard(card, board);

    expect(projectBoardSynthesisRunProofScopeWarnings(run)).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "proof_scope_mismatch",
      message: "Visual proof belongs downstream.",
      cardRef: "card-1",
      visualProofItems: ["browser screenshot"],
    });
    expect(projectBoardPlanningWarningActionTitle(warnings)).toContain("Move screenshot/browser/visual proof");
    expect(projectBoardCardBlockedByStrictProofScopeWarning(card, board)).toBe(false);
    expect(projectBoardCardBlockedByStrictProofScopeWarning(card, strictProofBoard({ cards: [card], synthesisRuns: [run] }))).toBe(true);
    expect(projectBoardCardBlockedByStrictProofScopeWarning({ ...card, userTouchedFields: ["testPlan"] }, strictProofBoard({ cards: [card], synthesisRuns: [run] }))).toBe(false);
  });
});

function boardCard(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Ship controls",
    description: "Implement controls.",
    status: "draft",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: ["Keyboard input moves the ship."],
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
      testPolicy: { proofScopeWarningPolicy: "acknowledgement_required" },
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

function synthesisRun(overrides: Partial<ProjectBoardSynthesisRun> = {}): ProjectBoardSynthesisRun {
  return {
    id: "run-1",
    boardId: "board-1",
    status: "succeeded",
    stage: "board_applied",
    sourceCount: 1,
    includedSourceCount: 1,
    sourceCharCount: 100,
    warningCount: 1,
    events: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
