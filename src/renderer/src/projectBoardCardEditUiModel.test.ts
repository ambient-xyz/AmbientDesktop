import { describe, expect, it } from "vitest";

import type {
  ProjectBoardCard,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSummary,
} from "../../shared/types";
import {
  projectBoardCandidateClarificationItems,
  projectBoardCardCanMarkReady,
  projectBoardCardCanSplit,
  projectBoardCardEditCanSave,
  projectBoardCardEditDraft,
  projectBoardCardEditInput,
  projectBoardCardEditWithClarificationAnswerInput,
  projectBoardClarificationAnswerInput,
  projectBoardKickoffDefaultAnswer,
  projectBoardKickoffDefaultProviderErrorMessage,
  projectBoardPendingClarificationQuestions,
} from "./projectBoardCardEditUiModel";

describe("projectBoardCardEditUiModel", () => {
  it("normalizes candidate edit drafts into update input", () => {
    const draft = {
      ...projectBoardCardEditDraft(card({ priority: 5, phase: "Phase 1", labels: ["frontend"] })),
      title: " Updated card ",
      candidateStatus: "ready_to_create" as const,
      priority: "101",
      labels: "UI, ui, qa",
      blockedBy: "LOCAL-1\nLOCAL-2\nLOCAL-1",
      acceptanceCriteria: "Ship it\n\nVerify it\nShip it",
      unitTests: "Run unit\nRun unit",
      integrationTests: "Run smoke",
      visualTests: "",
      manualTests: "Review copy",
    };
    const editedCard = card({ priority: 5, phase: "Phase 1", labels: ["frontend"] });

    expect(projectBoardCardEditCanSave(editedCard, draft)).toBe(true);
    expect(projectBoardCardEditInput(editedCard.id, draft)).toMatchObject({
      title: "Updated card",
      candidateStatus: "ready_to_create",
      priority: 100,
      labels: ["ui", "qa"],
      blockedBy: ["LOCAL-1", "LOCAL-2"],
      acceptanceCriteria: ["Ship it", "Verify it"],
      testPlan: {
        unit: ["Run unit"],
        integration: ["Run smoke"],
        visual: [],
        manual: ["Review copy"],
      },
    });
    expect(projectBoardCardEditInput(editedCard.id, { ...draft, priority: "later" }).priority).toBeUndefined();
    expect(projectBoardCardCanSplit(card({ acceptanceCriteria: ["One"] }))).toBe(false);
    expect(projectBoardCardCanSplit(card({ acceptanceCriteria: ["One", "Two"] }))).toBe(true);
    expect(projectBoardCardCanSplit(card({ acceptanceCriteria: ["One", "Two"], orchestrationTaskId: "task-1" }))).toBe(false);
  });

  it("records clarification answers while preserving edited draft fields", () => {
    const clarificationCard = card({
      candidateStatus: "needs_clarification",
      clarificationQuestions: ["What proof is required?", "Which source is authoritative?"],
      description: "Implement the control model.",
      acceptanceCriteria: ["Ship moves inside the play area."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    });

    const answerInput = projectBoardClarificationAnswerInput(
      clarificationCard,
      "What proof is required?",
      "Run the unit test and complete the manual proof.",
    );

    expect(answerInput).toMatchObject({
      cardId: "card-1",
      clarificationQuestions: ["Which source is authoritative?"],
      clarificationAnswers: [
        expect.objectContaining({
          question: "What proof is required?",
          answer: "Run the unit test and complete the manual proof.",
        }),
      ],
    });
    expect(answerInput.description).toContain("## Clarifications");

    const composedAnswerInput = projectBoardCardEditWithClarificationAnswerInput(
      clarificationCard,
      {
        ...projectBoardCardEditDraft(clarificationCard),
        description: "Edited details before accepting.",
        manualTests: "Manual proof survives accept",
      },
      "What proof is required?",
      "Run the unit test and complete the manual proof.",
    );

    expect(composedAnswerInput).toMatchObject({
      description: expect.stringContaining("Edited details before accepting."),
      testPlan: expect.objectContaining({ manual: ["Manual proof survives accept"] }),
      clarificationQuestions: ["Which source is authoritative?"],
      clarificationAnswers: [
        expect.objectContaining({
          question: "What proof is required?",
          answer: "Run the unit test and complete the manual proof.",
        }),
      ],
    });
    expect(
      projectBoardPendingClarificationQuestions({
        ...clarificationCard,
        description: answerInput.description ?? clarificationCard.description,
        clarificationQuestions: answerInput.clarificationQuestions ?? clarificationCard.clarificationQuestions,
        clarificationAnswers: answerInput.clarificationAnswers ?? clarificationCard.clarificationAnswers,
        clarificationDecisions: answerInput.clarificationDecisions ?? clarificationCard.clarificationDecisions,
      }),
    ).toEqual(["Which source is authoritative?"]);
  });

  it("keeps ready gates tied to clarification, proof, and obsolete follow-up state", () => {
    const missingProofCard = card({
      candidateStatus: "ready_to_create",
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
    });
    const proofBoard = boardSummary({
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
      cards: [missingProofCard],
    });

    expect(projectBoardCardCanMarkReady(missingProofCard, proofBoard)).toBe(false);
    expect(projectBoardCardCanMarkReady({ ...missingProofCard, testPlan: { ...missingProofCard.testPlan, manual: ["Review manually."] } }, proofBoard)).toBe(true);

    const closedParent = card({
      id: "parent-card",
      title: "Open preview",
      status: "done",
      candidateStatus: "ready_to_create",
      testPlan: { unit: [], integration: [], visual: [], manual: ["Browser preview was checked."] },
    });
    const proofFollowUp = card({
      id: "proof-follow-up",
      title: "Complete proof for Open preview",
      sourceKind: "run_follow_up",
      sourceId: "run-1#proof-review",
      blockedBy: ["parent-card"],
      candidateStatus: "needs_clarification",
      testPlan: { unit: [], integration: [], visual: [], manual: ["Capture browser preview proof."] },
    });
    const followUpBoard = boardSummary({ cards: [closedParent, proofFollowUp] });

    expect(projectBoardCardCanMarkReady(proofFollowUp, followUpBoard)).toBe(false);
    expect(projectBoardCandidateClarificationItems(proofFollowUp, followUpBoard)).toEqual([]);
  });

  it("builds kickoff default answers and compacts provider errors", () => {
    const board = boardSummary({
      title: "Game project",
      sources: [
        boardSource({
          id: "plan-1",
          kind: "plan_artifact",
          title: "Revised Durable Plan",
          path: ".ambient/board/plans/revised.md",
        }),
        boardSource({
          id: "thread-1",
          kind: "thread",
          title: "Old planning thread",
          includeInSynthesis: false,
          authorityRole: "ignored",
        }),
      ],
    });

    expect(projectBoardKickoffDefaultAnswer(board, question({ question: "Which sources are authoritative?" }), 1)).toContain("Revised Durable Plan");
    expect(projectBoardKickoffDefaultAnswer(board, question({ answer: "Saved answer" }), 0)).toBe("Saved answer");

    const message = projectBoardKickoffDefaultProviderErrorMessage(
      'Ambient project-board kickoff default suggestion failed (402): {"error":{"message":"Daily and monthly free usage exhausted.","type":"insufficient_quota_error"}}',
    );

    expect(message).toBe("Ambient/Pi default suggestion failed (HTTP 402): Daily and monthly free usage exhausted. (quota limit)");
    expect(message).not.toContain('{"error"');
  });
});

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Draft card",
    description: "Original",
    status: "draft",
    candidateStatus: "needs_clarification",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: ["Old criterion"],
    testPlan: { unit: ["Old unit"], integration: [], visual: [], manual: [] },
    sourceKind: "planner_plan",
    sourceId: "artifact-1",
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
    summary: "Project board",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function boardSource(overrides: Partial<ProjectBoardSource> = {}): ProjectBoardSource {
  return {
    id: "source-1",
    boardId: "board-1",
    kind: "thread",
    title: "Source",
    summary: "",
    relevance: 1,
    includeInSynthesis: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function question(overrides: Partial<ProjectBoardQuestion> = {}): ProjectBoardQuestion {
  return {
    id: "question-1",
    boardId: "board-1",
    question: "Goal?",
    required: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
