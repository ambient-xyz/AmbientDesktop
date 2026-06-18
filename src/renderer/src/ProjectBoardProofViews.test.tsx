import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import {
  ProjectBoardProofCard,
  ProjectBoardProofFollowUpImpactPanel,
  ProjectBoardProofReviewQueue,
  projectBoardProofKindLabel,
  type ProjectBoardProofReviewQueueItemModel,
} from "./ProjectBoardProofViews";

describe("ProjectBoardProofViews", () => {
  it("renders proof cards with pending proof suggestions", () => {
    const card = projectBoardCard({
      pendingPiUpdate: {
        sourceId: "proof-suggestion",
        createdAt: "2026-06-14T10:05:00.000Z",
        changedFields: ["testPlan"],
        testPlan: {
          unit: ["pin reducer behavior"],
          integration: [],
          visual: ["capture desktop proof"],
          manual: [],
        },
      },
    });

    const markup = renderToStaticMarkup(<ProjectBoardProofCard card={card} proofKinds={["unit", "visual"]} />);

    expect(markup).toContain("Verification");
    expect(markup).toContain("Pi proof suggestion pending");
    expect(markup).toContain("Unit: existing unit test");
    expect(markup).toContain("Pending Visual: capture desktop proof");
    expect(projectBoardProofKindLabel("manual")).toBe("Manual");
  });

  it("renders proof follow-up impact without owning board state", () => {
    const markup = renderToStaticMarkup(
      <ProjectBoardProofFollowUpImpactPanel
        model={{
          visible: true,
          headline: "Follow-up keeps parent blocked",
          detail: "One child needs visual proof before the parent can close.",
          parentOutcome: "Parent remains in review until children are resolved.",
          modelCallRequired: false,
          existingCardsRewritten: false,
          followUpCardCount: 1,
          missingProofCount: 1,
          metrics: [{ label: "Children", value: "1", tone: "warning" }],
          unresolvedFollowUpCardIds: ["missing-card"],
          cards: [
            {
              cardId: "child-1",
              title: "Add mobile proof",
              sourceLabel: "Follow-up",
              statusLabel: "Blocked",
              blockerLabel: "Blocked by parent",
              blockedByParent: true,
              proofExpectationCount: 1,
              acceptanceCriteria: ["Mobile layout remains usable."],
              proofExpectations: ["Capture mobile screenshot."],
              summary: "Created by PM proof review.",
            },
          ],
        }}
        onSelectCard={() => undefined}
      />,
    );

    expect(markup).toContain("Follow-up keeps parent blocked");
    expect(markup).toContain("Add mobile proof");
    expect(markup).toContain("Inspect follow-up");
    expect(markup).toContain("1 linked follow-up reference");
  });

  it("renders proof review queue actions from a stable item contract", () => {
    const card = projectBoardCard({ status: "review" });
    const item = {
      card,
      projection: {
        terminalDone: false,
        runLabel: "Run Completed",
        statusLabel: "Review",
        summary: "Run has proof waiting for PM review.",
      },
      decision: {
        readyForDecision: true,
        awaitingRun: false,
        statusLabel: "Ready for PM review",
        recommendationLabel: "Review proof",
        rationale: "Tests and screenshot were captured.",
        policySummary: "Strict proof gate",
        nextAction: "Accept or send back with revision notes.",
        readinessLabel: "Ready",
        readinessReason: "Proof packet is reviewable.",
        actions: [
          {
            action: "accept_done",
            label: "Accept Done",
            title: "Close this card.",
            disabled: false,
            tone: "primary",
          },
          {
            action: "retry",
            label: "Send Back",
            title: "Ask Pi for another pass.",
            disabled: false,
            tone: "secondary",
          },
        ],
      },
      evidence: {
        metrics: [{ label: "Files", value: "1/1 meaningful", tone: "success" }],
      },
      followUpImpact: {
        visible: false,
        headline: "",
        detail: "",
        parentOutcome: "",
        modelCallRequired: false,
        existingCardsRewritten: false,
        followUpCardCount: 0,
        missingProofCount: 0,
        metrics: [],
        unresolvedFollowUpCardIds: [],
        cards: [],
      },
    } as unknown as ProjectBoardProofReviewQueueItemModel;

    const markup = renderToStaticMarkup(
      <ProjectBoardProofReviewQueue
        items={[item]}
        reasons={{}}
        onReasonChange={() => undefined}
        onSubmitDecision={() => undefined}
        onRerunProof={() => undefined}
        onSelectCard={() => undefined}
      />,
    );

    expect(markup).toContain("Proof review queue");
    expect(markup).toContain("Build proof view");
    expect(markup).toContain("Files");
    expect(markup).toContain("Accept Done");
    expect(markup).toContain("Send Back");
  });
});

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Build proof view",
    description: "Render proof review surfaces from explicit props.",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "proof",
    labels: ["proof"],
    blockedBy: [],
    acceptanceCriteria: ["The proof view renders."],
    testPlan: {
      unit: ["existing unit test"],
      integration: [],
      visual: ["existing desktop proof"],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "plan-1",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}
