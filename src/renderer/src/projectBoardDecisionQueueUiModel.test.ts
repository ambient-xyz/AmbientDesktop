import { describe, expect, it } from "vitest";
import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { projectBoardDecisionQueue } from "./projectBoardDecisionQueueUiModel";

describe("projectBoardDecisionQueue", () => {
  it("builds open, answered, duplicate, and proposal-gap rows for the Decisions queue", () => {
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
    const board = {
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
    } as ProjectBoardSummary;

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
    expect(queue.openRows[0]).toMatchObject({
      cardId: "card-open",
      actionLabel: "Accept suggested default",
      sourceLabel: "Card question",
      impact: expect.objectContaining({ modelCallRequired: false }),
    });
    expect(queue.answeredRows.find((row) => row.cardId === "card-answered")).toMatchObject({
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
  });

  it("treats answered card decisions as matching proposal gaps", () => {
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
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "active",
      title: "App board",
      summary: "Active",
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
      sources: [],
      questions: [],
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
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as ProjectBoardSummary;

    expect(projectBoardDecisionQueue(board)).toMatchObject({
      openCount: 0,
      answeredCount: 1,
      proposalGapCount: 0,
      actionCount: 0,
    });
  });
});
