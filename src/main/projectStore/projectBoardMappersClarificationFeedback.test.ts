import { describe, expect, it } from "vitest";
import type { ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import type { ProjectBoardCardProofReview } from "../../shared/projectBoardTypes";
import {
  projectBoardClarificationDecisionImpactEventSummary,
  projectBoardDecisionImpactEventMetadata,
  projectBoardDecisionImpactFeedbackText,
  projectBoardHasDecisionImpactFeedback,
  projectBoardHasSourceImpactFeedback,
  projectBoardProofRevisionRunFeedback,
  projectBoardUxMockRejectionRunFeedback,
} from "./projectBoardMappers";
import { projectBoardCard } from "./projectBoardMappersTestSupport";

describe("project board mapper clarification feedback", () => {
  it("maps project board clarification decision impact events without model calls", () => {
    const impact: ProjectBoardDecisionImpactPreview = {
      visible: true,
      question: "Which renderer should the shell use?",
      answer: "Use the existing React renderer.",
      canonicalKey: "which-renderer-should-the-shell-use",
      answeredCardId: "card-answer",
      affectedCardIds: Array.from({ length: 45 }, (_, index) => `card-${index}`),
      unblockedDraftCount: 2,
      stillBlockedDraftCount: 1,
      duplicateHiddenCount: 3,
      readyFeedbackCount: 4,
      auditOnlyCount: 5,
      targetedRefreshOptional: true,
      modelCallRequired: false,
      headline: "Decision impact",
      detail: "2 draft gates clear and 4 cards need next-run feedback.",
      metrics: [],
      cards: [],
      recommendedActions: ["Create next-run feedback."],
    };

    expect(projectBoardClarificationDecisionImpactEventSummary("Shell card", impact)).toBe(
      "Shell card answered a clarification. 2 draft gates clear and 4 cards need next-run feedback. 0 model calls.",
    );
    expect(projectBoardClarificationDecisionImpactEventSummary("Shell card", { ...impact, visible: false })).toBe(
      "Shell card answered a clarification. No linked card impact; 0 model calls.",
    );
    expect(projectBoardDecisionImpactEventMetadata(impact)).toEqual({
      triggerType: "clarification_answer",
      question: "Which renderer should the shell use?",
      canonicalKey: "which-renderer-should-the-shell-use",
      answeredCardId: "card-answer",
      affectedCardCount: 45,
      affectedCardIds: Array.from({ length: 40 }, (_, index) => `card-${index}`),
      affectedCounts: {
        unblockedDrafts: 2,
        stillBlockedDrafts: 1,
        duplicateVariantsHidden: 3,
        readyFeedback: 4,
        auditOnly: 5,
      },
      targetedRefreshOptional: true,
      modelCallRequired: false,
      recommendedActions: ["Create next-run feedback."],
    });
  });

  it("formats project board decision impact feedback text", () => {
    expect(projectBoardDecisionImpactFeedbackText("Which renderer?", "Use React.")).toBe(
      "Clarification decision impact: Which renderer? Decision answer: Use React.. Apply this PM decision in the next run without rewriting the approved card silently.",
    );

    const longText = projectBoardDecisionImpactFeedbackText("Which renderer?", "Use React. ".repeat(200));
    expect(longText).toHaveLength(1500);
    expect(longText.startsWith("Clarification decision impact: Which renderer? Decision answer: Use React.")).toBe(true);
  });

  it("detects existing project board decision impact feedback by near-duplicate question", () => {
    const card = projectBoardCard({
      runFeedback: [
        {
          id: "feedback-1",
          feedback: "Apply the decision.",
          source: "decision_impact",
          decisionQuestion: "Which renderer should shell use",
          decisionAnswer: " Use React. ",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(projectBoardHasDecisionImpactFeedback(card, "Which renderer should the shell use?", "Use React.")).toBe(true);
    expect(projectBoardHasDecisionImpactFeedback(card, "Which renderer should the shell use?", "Use Vue.")).toBe(false);
    expect(
      projectBoardHasDecisionImpactFeedback(
        projectBoardCard({ runFeedback: [{ ...card.runFeedback![0], source: "manual" }] }),
        "Which renderer?",
        "Use React.",
      ),
    ).toBe(false);
  });

  it("detects existing project board source impact feedback", () => {
    const card = projectBoardCard({
      runFeedback: [
        {
          id: "single-event",
          feedback: "Apply source impact.",
          source: "source_impact",
          sourceImpactEventId: "event-1",
          sourceIds: ["source-1"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "multi-event",
          feedback: "Apply more source impact.",
          source: "source_impact",
          sourceImpactEventIds: ["event-2", "event-3"],
          sourceIds: ["source-2"],
          createdAt: "2026-01-01T00:01:00.000Z",
        },
      ],
    });

    expect(projectBoardHasSourceImpactFeedback(card, ["event-1"], [])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, ["event-3"], [])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, [], ["source-2"])).toBe(true);
    expect(projectBoardHasSourceImpactFeedback(card, ["event-missing"], ["source-2"])).toBe(false);
    expect(projectBoardHasSourceImpactFeedback(card, [], ["source-missing"])).toBe(false);
    expect(
      projectBoardHasSourceImpactFeedback(
        projectBoardCard({
          runFeedback: [
            {
              id: "manual",
              feedback: "Manual note.",
              source: "manual",
              sourceImpactEventId: "event-1",
              sourceIds: ["source-1"],
              createdAt: "2026-01-01T00:02:00.000Z",
            },
          ],
        }),
        ["event-1"],
        ["source-1"],
      ),
    ).toBe(false);
  });

  it("builds project board proof revision run feedback", () => {
    const previousReview: ProjectBoardCardProofReview = {
      status: "needs_follow_up",
      summary: "Proof lacked mobile evidence.",
      satisfied: ["Unit tests passed."],
      missing: ["Mobile screenshot", "Manual QA", "Trace", "Accessibility note", "Error capture", "Extra omitted"],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      recommendedAction: "retry",
    };
    const feedback = projectBoardProofRevisionRunFeedback(
      previousReview,
      "Add mobile screenshot proof before closing.",
      "2026-01-01T00:05:00.000Z",
    );

    expect(feedback).toMatchObject({
      id: expect.any(String),
      source: "proof_review",
      decisionQuestion: "Why was this proof sent back for revision?",
      decisionAnswer: "Add mobile screenshot proof before closing.",
      createdAt: "2026-01-01T00:05:00.000Z",
      createdBy: "ambient-desktop",
    });
    expect(feedback?.feedback).toContain("Proof revision requested.");
    expect(feedback?.feedback).toContain("Reviewer note: Add mobile screenshot proof before closing.");
    expect(feedback?.feedback).toContain("Previous proof review: Proof lacked mobile evidence.");
    expect(feedback?.feedback).toContain("Missing evidence: Mobile screenshot; Manual QA; Trace; Accessibility note; Error capture");
    expect(feedback?.feedback).not.toContain("Extra omitted");
    expect(feedback?.feedback).toContain("Previous recommendation: retry");
    expect(projectBoardProofRevisionRunFeedback(undefined, undefined, "2026-01-01T00:00:00.000Z")).toBeUndefined();
  });

  it("builds project board UX mock rejection run feedback", () => {
    const previousReview: ProjectBoardCardProofReview = {
      status: "needs_follow_up",
      summary: "Mock misses narrow viewport.",
      satisfied: [],
      missing: ["Narrow viewport", "Hover state", "Keyboard focus", "Contrast", "Spacing", "Extra omitted"],
      followUpCardIds: [],
      runId: "run-ux",
      reviewedAt: "2026-01-01T00:00:00.000Z",
    };
    const feedback = projectBoardUxMockRejectionRunFeedback(previousReview, undefined, "2026-01-01T00:06:00.000Z");

    expect(feedback).toMatchObject({
      id: expect.any(String),
      source: "proof_review",
      decisionQuestion: "Why was this UX mock rejected?",
      decisionAnswer: "Mock misses narrow viewport.",
      createdAt: "2026-01-01T00:06:00.000Z",
      createdBy: "ambient-desktop",
    });
    expect(feedback.feedback).toContain("UX mock rejected.");
    expect(feedback.feedback).toContain("Previous mock review: Mock misses narrow viewport.");
    expect(feedback.feedback).toContain("Missing or rejected criteria: Narrow viewport; Hover state; Keyboard focus; Contrast; Spacing");
    expect(feedback.feedback).not.toContain("Extra omitted");

    const fallback = projectBoardUxMockRejectionRunFeedback(undefined, undefined, "2026-01-01T00:07:00.000Z");
    expect(fallback).toMatchObject({
      source: "proof_review",
      decisionAnswer: "UX mock rejected by user PM decision.",
      feedback: "UX mock rejected. Keep downstream UI implementation blocked until a revised mock is approved.",
    });
  });
});
