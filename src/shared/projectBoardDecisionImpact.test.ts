import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardSummary } from "./projectBoardTypes";
import { projectBoardDecisionImpactPreview } from "./projectBoardDecisionImpact";

describe("projectBoardDecisionImpactPreview", () => {
  it("deterministically shows which draft cards clear when a shared decision is answered", () => {
    const question = "Should numpad operators map directly to calculator operators?";
    const board = boardWithCards([
      card({ id: "card-1", title: "Keyboard input", clarificationQuestions: [question, question] }),
      card({ id: "card-2", title: "Calculator operators", clarificationQuestions: [question] }),
      card({ id: "card-3", title: "Display", clarificationQuestions: ["What is the auto-shrinking minimum font size?"] }),
    ]);

    const impact = projectBoardDecisionImpactPreview(board, {
      question,
      answer: "Map numpad operators directly.",
      answeredCardId: "card-1",
    });

    expect(impact).toMatchObject({
      visible: true,
      modelCallRequired: false,
      targetedRefreshOptional: true,
      unblockedDraftCount: 2,
      stillBlockedDraftCount: 0,
      duplicateHiddenCount: 1,
      readyFeedbackCount: 0,
      affectedCardIds: ["card-1", "card-2"],
    });
    expect(impact.recommendedActions).toContain("Optionally refresh affected draft cards only");
    expect(impact.cards.map((item) => item.state)).toEqual(["draft_unblocked", "draft_unblocked"]);
  });

  it("routes ticketized linked cards to next-run feedback instead of silent rewrites", () => {
    const question = "Should the live preview suppress errors silently or display a muted Error indicator?";
    const board = boardWithCards([
      card({ id: "card-1", title: "Live preview", clarificationQuestions: [question] }),
      card({
        id: "card-2",
        title: "Preview polish",
        status: "ready",
        candidateStatus: "ready_to_create",
        clarificationQuestions: [question],
      }),
      card({
        id: "card-3",
        title: "Accepted parser",
        status: "done",
        candidateStatus: "ready_to_create",
        clarificationQuestions: [question],
      }),
    ]);

    const impact = projectBoardDecisionImpactPreview(board, { question, answer: "Display a muted Error indicator." });

    expect(impact).toMatchObject({
      unblockedDraftCount: 1,
      readyFeedbackCount: 1,
      auditOnlyCount: 1,
      modelCallRequired: false,
    });
    expect(impact.cards.map((item) => [item.cardId, item.state])).toEqual([
      ["card-1", "draft_unblocked"],
      ["card-2", "ready_needs_next_run_feedback"],
      ["card-3", "done_audit_only"],
    ]);
    expect(impact.recommendedActions).toContain("Create next-run feedback for ticketized cards");
  });
});

function boardWithCards(cards: ProjectBoardCard[]): Pick<ProjectBoardSummary, "cards"> {
  return { cards };
}

function card(input: Partial<ProjectBoardCard> & Pick<ProjectBoardCard, "id" | "title">): ProjectBoardCard {
  return {
    id: input.id,
    boardId: input.boardId ?? "board-1",
    title: input.title,
    description: input.description ?? "Implement this card.",
    status: input.status ?? "draft",
    candidateStatus: input.candidateStatus ?? "needs_clarification",
    priority: input.priority,
    phase: input.phase,
    labels: input.labels ?? [],
    blockedBy: input.blockedBy ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? ["Done condition exists."],
    testPlan: input.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: input.sourceKind ?? "board_synthesis",
    sourceId: input.sourceId ?? "source-1",
    sourceRefs: input.sourceRefs,
    clarificationQuestions: input.clarificationQuestions,
    clarificationAnswers: input.clarificationAnswers,
    objectiveProvenance: input.objectiveProvenance,
    sourceThreadId: input.sourceThreadId,
    sourceMessageId: input.sourceMessageId,
    orchestrationTaskId: input.orchestrationTaskId,
    executionThreadId: input.executionThreadId,
    executionSessionPolicy: input.executionSessionPolicy,
    proofReview: input.proofReview,
    splitOutcome: input.splitOutcome,
    claim: input.claim,
    claimConflicts: input.claimConflicts,
    userTouchedFields: input.userTouchedFields,
    userTouchedAt: input.userTouchedAt,
    pendingPiUpdate: input.pendingPiUpdate,
    createdAt: input.createdAt ?? "2026-05-15T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-15T00:00:00.000Z",
  };
}
