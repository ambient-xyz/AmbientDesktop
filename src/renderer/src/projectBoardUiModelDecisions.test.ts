import { describe, expect, it } from "vitest";
import {
  defaultProjectBoardTab,
  projectBoardCandidateClarificationItems,
  projectBoardCardCanMarkReady,
  projectBoardCardCanSplit,
  projectBoardCardEditCanSave,
  projectBoardCardEditDraft,
  projectBoardCardEditInput,
  projectBoardCardEditWithClarificationAnswerInput,
  projectBoardClarificationAnswerInput,
  projectBoardDecisionQueue,
  projectBoardPendingClarificationQuestions,
  projectBoardTabs,
} from "./projectBoardUiModel";
import { boardSummary, project } from "./projectBoardUiModelTestHelpers";

describe("projectBoardUiModel decisions", () => {
  it("normalizes candidate card edit drafts into update input", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Draft card",
      description: "Original",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      priority: 5,
      phase: "Phase 1",
      labels: ["frontend"],
      blockedBy: [],
      acceptanceCriteria: ["Old criterion"],
      testPlan: { unit: ["Old unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const draft = {
      ...projectBoardCardEditDraft(card),
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

    expect(projectBoardCardEditCanSave(card, draft)).toBe(true);
    expect(projectBoardCardEditInput(card.id, draft)).toMatchObject({
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
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One"] })).toBe(false);
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One", "Two"] })).toBe(true);
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One", "Two"], orchestrationTaskId: "task-1" })).toBe(false);
  });

  it("builds a cross-card Decisions queue from proposal gaps and canonical clarification decisions", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          {
            ...base,
            id: "card-open",
            title: "Keyboard mappings",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["Should numpad operators map directly?"],
            clarificationSuggestions: [
              {
                question: "Should numpad operators map directly?",
                suggestedAnswer: "Support direct numpad operator mappings.",
                rationale: "This matches calculator keyboard conventions.",
                confidence: "high" as const,
                safeToAccept: true,
                questionKind: "expert_default" as const,
              },
            ],
          },
          {
            ...base,
            id: "card-answered",
            title: "Answered display",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["What threshold should auto-shrink use?"],
            clarificationAnswers: [
              {
                question: "What threshold should auto-shrink use?",
                answer: "Begin shrinking after 11 visible characters.",
                answeredAt: "2026-01-01T00:05:00.000Z",
              },
            ],
          },
          {
            ...base,
            id: "card-accepted-default",
            title: "Z accepted default audit",
            candidateStatus: "ready_to_create" as const,
            clarificationDecisions: [
              {
                id: "clarification:animation-style",
                question: "Should the animation use pulse or confetti?",
                canonicalKey: "animation-style",
                source: "card" as const,
                state: "answered" as const,
                answer: "Use a subtle pulse animation.",
                answeredAt: "2026-01-01T00:08:00.000Z",
                suggestedAnswer: "Use a subtle pulse animation.",
                rationale: "Pulse is easy to verify and avoids decorative scope creep.",
                confidence: "high" as const,
                safeToAccept: true,
                questionKind: "expert_default" as const,
              },
            ],
          },
          {
            ...base,
            id: "card-missing-suggestion",
            title: "Preview error default",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["Should preview errors show a muted indicator?"],
          },
        ],
        sources: [],
        questions: [],
        proposals: [
          {
            id: "proposal-1",
            boardId: "board-1",
            status: "pending",
            summary: "Pi proposal",
            goal: "Goal",
            currentState: "State",
            targetUser: "User",
            qualityBar: "Proof required.",
            assumptions: [],
            questions: ["Which interaction mode should be primary?"],
            answers: [],
            sourceNotes: [],
            cards: [],
            createdAt: "2026-01-01T00:06:00.000Z",
            updatedAt: "2026-01-01T00:06:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const queue = projectBoardDecisionQueue(board);
    expect(queue).toMatchObject({
      openCount: 2,
      answeredCount: 2,
      duplicateCount: 1,
      suggestedCount: 1,
      suggestedAuditCount: 1,
      missingSuggestionCount: 1,
      safeSuggestionCount: 1,
      proposalGapCount: 1,
      actionCount: 3,
    });
    expect(queue.auditFilterItems).toEqual([
      { id: "all", label: "All audit", count: 3 },
      { id: "answered", label: "Answered", count: 2 },
      { id: "duplicate", label: "Duplicates", count: 1 },
      { id: "suggested", label: "Suggestion trail", count: 1 },
    ]);
    expect(queue.auditRows.map((row) => [row.cardId, row.state])).toEqual([
      ["card-accepted-default", "answered"],
      ["card-answered", "answered"],
      ["card-answered", "duplicate"],
    ]);
    expect(queue.openRows[0]).toMatchObject({
      cardId: "card-open",
      actionLabel: "Accept suggested default",
      sourceLabel: "Card question",
      impact: expect.objectContaining({ modelCallRequired: false }),
    });
    expect(queue.answeredRows.find((row) => row.cardId === "card-answered")).toMatchObject({
      cardId: "card-answered",
      state: "answered",
      answer: "Begin shrinking after 11 visible characters.",
      detail: expect.stringContaining("Answered"),
    });
    expect(queue.duplicateRows[0]).toMatchObject({
      cardId: "card-answered",
      state: "duplicate",
      duplicateOf: expect.any(String),
      answer: "Begin shrinking after 11 visible characters.",
      detail: expect.stringContaining("hidden from open gates"),
    });
    expect(
      projectBoardTabs(board)
        .map((tab) => tab.id)
        .slice(0, 4),
    ).toEqual(["overview", "charter", "decisions", "draft_inbox"]);
    expect(projectBoardTabs(board).find((tab) => tab.id === "decisions")?.count).toBe(3);
    expect(defaultProjectBoardTab(board)).toBe("decisions");
    expect(defaultProjectBoardTab({ ...board, status: "draft" })).toBe("charter");

    const proposalAnsweredByCardBoard = project({
      board: {
        ...board,
        cards: [
          {
            ...base,
            id: "card-proposal-answer",
            title: "Answered proposal gap",
            candidateStatus: "ready_to_create" as const,
            clarificationQuestions: ["Synced scrolling between editor and preview?"],
            clarificationAnswers: [
              {
                question: "Synced scrolling between editor and preview?",
                answer: "Use independent scroll for v1.",
                answeredAt: "2026-01-01T00:10:00.000Z",
              },
            ],
          },
        ],
        proposals: [
          {
            id: "proposal-answered-by-card",
            boardId: "board-1",
            status: "pending",
            summary: "Pi proposal",
            goal: "Goal",
            currentState: "State",
            targetUser: "User",
            qualityBar: "Proof required.",
            assumptions: [],
            questions: ["Synced scrolling between editor and preview?"],
            answers: [],
            sourceNotes: [],
            cards: [],
            createdAt: "2026-01-01T00:06:00.000Z",
            updatedAt: "2026-01-01T00:06:00.000Z",
          },
        ],
      },
    }).board!;
    expect(projectBoardDecisionQueue(proposalAnsweredByCardBoard)).toMatchObject({
      openCount: 0,
      answeredCount: 1,
      proposalGapCount: 0,
      actionCount: 0,
    });
    expect(projectBoardTabs(proposalAnsweredByCardBoard).find((tab) => tab.id === "decisions")?.count).toBe(0);
  });

  it("explains needs-clarification candidates at the PM decision point", () => {
    const base = {
      id: "card-1",
      boardId: "board-1",
      title: "Clarify controls",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      priority: 1,
      phase: "Gameplay",
      labels: [],
      blockedBy: [],
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?"],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      })[0],
    ).toEqual(
      expect.objectContaining({
        label: "Clarification question",
        detail: "Should this use thrust inertia or direct arcade steering?",
      }),
    );

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        sourceKind: "manual" as const,
        description: "Should the ship use tank controls or thrust controls?",
        acceptanceCriteria: [],
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).toContain("Question from card");

    // Synthesis cards only surface structured questions; their prose is full of
    // technical "?" usage and is never mined.
    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        description: "Should the ship use tank controls or thrust controls?",
        acceptanceCriteria: [],
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).not.toContain("Question from card");

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?"],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }).map((item) => item.detail),
    ).not.toContain("Should this use thrust inertia or direct arcade steering?");

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: [],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description:
          "Implement the control model.\n\n## Clarifications\n- Q: Should this use thrust inertia or direct arcade steering?\n  A: Use inertia.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).not.toContain("Question from card");
    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: [],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description:
          "Implement the control model.\n\n## Clarifications\n- Q: Should this use thrust inertia or direct arcade steering?\n  A: Use inertia.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }),
    ).toEqual([]);

    const answerInput = projectBoardClarificationAnswerInput(
      {
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?", "What proof is required?"],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      },
      "Should this use thrust inertia or direct arcade steering?",
      "Use inertia-based thrust from the design document.",
    );
    expect(answerInput).toMatchObject({
      cardId: "card-1",
      clarificationQuestions: ["What proof is required?"],
      clarificationAnswers: [
        expect.objectContaining({
          question: "Should this use thrust inertia or direct arcade steering?",
          answer: "Use inertia-based thrust from the design document.",
        }),
      ],
    });
    expect(answerInput.description).toContain("## Clarifications");
    expect(answerInput.description).toContain("Use inertia-based thrust");

    const clarificationCard = {
      ...base,
      clarificationQuestions: ["What proof is required?"],
      description: "Implement the control model.",
      acceptanceCriteria: ["Ship moves inside the play area."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
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
      cardId: "card-1",
      description: expect.stringContaining("Edited details before accepting."),
      testPlan: expect.objectContaining({ manual: ["Manual proof survives accept"] }),
      clarificationQuestions: [],
      clarificationAnswers: [
        expect.objectContaining({
          question: "What proof is required?",
          answer: "Run the unit test and complete the manual proof.",
        }),
      ],
    });

    const duplicateRenderingQuestion =
      "The plan locks 'Canvas 2D' but the project charter specifies 'Three.js/WebGL.' Which rendering substrate should the game use? This determines the entire renderer architecture, asset pipeline, and downstream card dependencies.";
    const duplicateRenderingQuestionVariant =
      "The implementation plan locks 'Canvas 2D' as the rendering substrate, but the project charter specifies a 'Three.js/WebGL spaceship game.' Which substrate should the game use? This is a foundational architecture decision that blocks the rendering card and all downstream visual cards.";
    const duplicateQuestionCard = {
      ...base,
      clarificationQuestions: [duplicateRenderingQuestion, duplicateRenderingQuestionVariant],
      description: "Resolve the rendering substrate.",
      acceptanceCriteria: ["Renderer choice is documented."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
    expect(projectBoardPendingClarificationQuestions(duplicateQuestionCard)).toEqual([duplicateRenderingQuestion]);
    expect(
      projectBoardCandidateClarificationItems(duplicateQuestionCard)
        .filter((item) => item.label === "Clarification question")
        .map((item) => item.detail),
    ).toEqual([duplicateRenderingQuestion]);
    expect(
      projectBoardClarificationAnswerInput(duplicateQuestionCard, duplicateRenderingQuestionVariant, "Use Three.js/WebGL."),
    ).toMatchObject({
      clarificationQuestions: [],
      clarificationAnswers: [
        expect.objectContaining({
          question: duplicateRenderingQuestionVariant,
          answer: "Use Three.js/WebGL.",
        }),
      ],
    });

    const noQuestionCard = {
      ...base,
      description: "Implement the game shell.",
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
    expect(projectBoardCandidateClarificationItems(noQuestionCard)).toEqual([
      expect.objectContaining({
        label: "No explicit question attached",
        tone: "neutral",
      }),
    ]);
    expect(projectBoardCandidateClarificationItems(noQuestionCard, boardSummary({ cards: [noQuestionCard] }))).toEqual([]);

    const closedParent = {
      ...base,
      id: "parent-card",
      title: "Open random-picker/index.html via browser_local_preview",
      status: "done" as const,
      candidateStatus: "ready_to_create" as const,
      description: "Open the local preview.",
      acceptanceCriteria: ["Preview opens."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Browser preview was checked."] },
    };
    const proofFollowUp = {
      ...base,
      id: "proof-follow-up",
      title: "Complete proof for Open random-picker/index.html via browser_local_preview",
      sourceKind: "run_follow_up" as const,
      sourceId: "run-1",
      blockedBy: ["parent-card"],
      description: "Complete proof for the already-finished local preview task.",
      acceptanceCriteria: ["Proof is captured or the follow-up is dismissed."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Capture browser preview proof."] },
    };
    const proofFollowUpBoard = boardSummary({
      cards: [closedParent, proofFollowUp],
    });
    expect(projectBoardCardCanMarkReady(proofFollowUp, proofFollowUpBoard)).toBe(false);
    expect(projectBoardCandidateClarificationItems(proofFollowUp, proofFollowUpBoard)).toEqual([]);
  });
});
