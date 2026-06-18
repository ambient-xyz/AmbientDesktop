import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectSummary } from "../../shared/projectBoardTypes";
import {
  ProjectBoardActiveCardDetail,
  ProjectBoardActiveCardDetailTabs,
  ProjectBoardClaimControls,
  ProjectBoardRunFeedbackPanel,
  projectBoardCardTouchedFieldLabel,
  projectBoardProofRecommendedActionLabel,
  projectBoardProofReviewStatusLabel,
  projectBoardRunFeedbackSourceLabel,
} from "./ProjectBoardActiveCardDetailViews";

describe("ProjectBoardActiveCardDetailViews", () => {
  it("renders the empty inspector without owning workspace state", () => {
    const markup = renderToStaticMarkup(
      <ProjectBoardActiveCardDetail
        board={projectBoard([])}
        runActivityLinesByThread={{}}
        threadRunStatuses={{}}
        onClose={() => undefined}
        onPrepareRuns={() => undefined}
        onStartRun={() => undefined}
        onCancelRun={() => undefined}
        onRevealWorkspace={() => undefined}
        onOpenRunThread={() => undefined}
        onCopySessionToThread={() => undefined}
        onResolveProofDecision={() => undefined}
        onResolveSplitDecision={() => undefined}
        onAddRunFeedback={() => undefined}
        onClaimAction={() => undefined}
      />,
    );

    expect(markup).toContain("Select a card");
    expect(markup).toContain("Inspect task spec");
    expect(markup).toContain("project-board-active-card-detail empty");
  });

  it("renders active-card tabs and next-run feedback from stable props", () => {
    const card = projectBoardCard({
      runFeedback: [
        {
          id: "feedback-1",
          source: "manual",
          feedback: "Capture a mobile screenshot before closing.",
          createdAt: "2026-06-14T10:05:00.000Z",
        },
      ],
    });

    const tabs = renderToStaticMarkup(<ProjectBoardActiveCardDetailTabs activeTab="proof" onChange={() => undefined} />);
    const feedback = renderToStaticMarkup(
      <ProjectBoardRunFeedbackPanel
        card={card}
        draft="Also verify keyboard focus."
        onDraftChange={() => undefined}
        disabledTitle="Enter additive next-run instructions."
        canSave
        saving={false}
        onSave={() => undefined}
      />,
    );

    expect(tabs).toContain("Spec");
    expect(tabs).toContain("Proof");
    expect(tabs).toContain("Dependencies");
    expect(tabs).toContain("History");
    expect(feedback).toContain("Next-run feedback");
    expect(feedback).toContain("Manual note");
    expect(feedback).toContain("Capture a mobile screenshot before closing.");
    expect(feedback).toContain("Add run feedback");
    expect(projectBoardRunFeedbackSourceLabel("proof_review")).toBe("Proof review");
  });

  it("renders claim controls and moved active-card helper labels", () => {
    const card = projectBoardCard();
    const markup = renderToStaticMarkup(<ProjectBoardClaimControls card={card} onAction={() => undefined} />);

    expect(markup).toContain("No active Git claim");
    expect(markup).toContain("Claim Card");
    expect(markup).toContain("Board Git sync status is still loading.");
    expect(projectBoardProofReviewStatusLabel("retry_recommended")).toBe("Retry recommended");
    expect(projectBoardProofRecommendedActionLabel("ask_user")).toBe("Ask user");
    expect(projectBoardCardTouchedFieldLabel("testPlan")).toBe("proof plan");
  });
});

function projectBoard(cards: ProjectBoardCard[]): NonNullable<ProjectSummary["board"]> {
  return {
    id: "board-1",
    projectPath: "/tmp/project",
    status: "active",
    title: "Simplify project board",
    summary: "Move project board detail views behind stable props.",
    cards,
    sources: [],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Inspect proof detail",
    description: "Keep active-card detail rendering behind an explicit owner.",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "proof",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["The card detail renders from explicit props."],
    testPlan: {
      unit: ["static render"],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "plan-1",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}
