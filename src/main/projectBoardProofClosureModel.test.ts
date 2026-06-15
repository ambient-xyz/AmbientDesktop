import { describe, expect, it } from "vitest";
import { projectBoardProofReviewClosureModelForApplication } from "./projectBoardStoreMappers";
import type { ProjectBoardCardProofReview } from "../shared/types";

describe("projectBoardProofReviewClosureModelForApplication", () => {
  const baseReview: ProjectBoardCardProofReview = {
    status: "done",
    summary: "Ambient/Pi judged the card complete with strong proof.",
    satisfied: ["Implementation evidence recorded."],
    missing: [],
    followUpCardIds: [],
    runId: "run-1",
    reviewedAt: "2026-05-19T00:00:00.000Z",
    reviewer: "ambient_pi",
    evidenceQuality: "strong",
    confidence: 0.97,
    recommendedAction: "close",
  };

  it("keeps strong issue-free close judgments auto-closeable", () => {
    expect(projectBoardProofReviewClosureModelForApplication(baseReview, [])).toEqual(baseReview);
  });

  it("keeps strong close judgments reviewable when deterministic proof issues remain", () => {
    const review = projectBoardProofReviewClosureModelForApplication(baseReview, ["Manual proof missing: Record manual PM review."]);

    expect(review).toMatchObject({
      status: "ready_for_review",
      recommendedAction: "close",
      evidenceQuality: "strong",
      missing: ["Manual proof missing: Record manual PM review."],
    });
    expect(review.summary).toContain("PM review is required before auto-closure");
  });

  it("keeps non-strong close judgments reviewable even without missing issues", () => {
    const review = projectBoardProofReviewClosureModelForApplication({ ...baseReview, evidenceQuality: "mixed" }, []);

    expect(review).toMatchObject({
      status: "ready_for_review",
      recommendedAction: "close",
      evidenceQuality: "mixed",
    });
    expect(review.summary).toContain("did not rate the evidence strong");
  });
});
