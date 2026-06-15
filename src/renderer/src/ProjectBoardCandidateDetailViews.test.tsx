import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import type { ProjectBoardCard, ProjectBoardSource, ProjectSummary } from "../../shared/types";
import {
  ProjectBoardCandidateDetail,
  ProjectBoardDecisionImpactSummary,
  ProjectBoardProofScopeWarningSummary,
} from "./ProjectBoardCandidateDetailViews";

describe("ProjectBoardCandidateDetailViews", () => {
  it("renders candidate detail from explicit board and action props", () => {
    const card = projectBoardCard({
      candidateStatus: "needs_clarification",
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceRefs: ["source-1"],
      clarificationDecisions: [
        {
          id: "decision-1",
          question: "Which mobile breakpoint is required?",
          canonicalKey: "which mobile breakpoint is required",
          source: "card",
          state: "open",
          suggestedAnswer: "Support 390px and above.",
          rationale: "The mobile baseline should be explicit before ticketization.",
          confidence: "high",
          safeToAccept: false,
          questionKind: "user_preference",
          createdAt: "2026-06-14T10:00:00.000Z",
          updatedAt: "2026-06-14T10:00:00.000Z",
        },
      ],
    });

    const markup = renderToStaticMarkup(
      <ProjectBoardCandidateDetail
        card={card}
        board={projectBoard([card])}
        onClose={() => undefined}
        onSave={() => undefined}
        onApproveCard={() => undefined}
        onSplitCard={() => undefined}
        onUpdateCardCandidate={() => undefined}
        onResolveCardPiUpdate={() => undefined}
        onApplyDecisionImpactFeedback={() => undefined}
        onRefreshDecisionDrafts={() => undefined}
        onRegenerateDecisionDrafts={() => undefined}
        onInspectSource={() => undefined}
        onClaimAction={() => undefined}
      />,
    );

    expect(markup).toContain("Candidate inspector");
    expect(markup).toContain("What needs clarification");
    expect(markup).toContain("Which mobile breakpoint is required?");
    expect(markup).toContain("Support 390px and above.");
    expect(markup).toContain("Strict proof policy is active");
    expect(markup).toContain("Source basis");
    expect(markup).toContain("Implementation note");
    expect(markup).toContain("Save Details");
  });

  it("renders proof scope warnings without owning draft state", () => {
    const markup = renderToStaticMarkup(
      <ProjectBoardProofScopeWarningSummary
        warnings={[
          {
            code: "proof_scope_mismatch",
            message: "Visual proof belongs on the renderer follow-up.",
            suggestedFix: "Move screenshot proof to the renderer card.",
            runId: "run-1",
            cardRef: "card-1",
            title: "Inspect proof detail",
            proofOwnership: "downstream_renderer",
            visualProofItems: ["mobile screenshot"],
          },
        ]}
      />,
    );

    expect(markup).toContain("Proof ownership warning");
    expect(markup).toContain("Visual proof belongs on the renderer follow-up.");
    expect(markup).toContain("Move screenshot proof to the renderer card.");
    expect(markup).toContain("Visual proof: mobile screenshot");
  });

  it("renders decision impact actions from a stable preview contract", () => {
    const markup = renderToStaticMarkup(
      <ProjectBoardDecisionImpactSummary
        impact={decisionImpactPreview()}
        onApplyReadyFeedback={() => undefined}
        onRefreshDrafts={() => undefined}
        onRegenerateDrafts={() => undefined}
      />,
    );

    expect(markup).toContain("1 linked card needs follow-up");
    expect(markup).toContain("Draft gate clears immediately");
    expect(markup).toContain("Affected");
    expect(markup).toContain("Save answer and clear duplicate gates");
    expect(markup).toContain("Save + refresh drafts");
    expect(markup).toContain("Ask Pi refresh");
    expect(markup).toContain("Save + create feedback");
  });
});

function projectBoard(cards: ProjectBoardCard[]): NonNullable<ProjectSummary["board"]> {
  return {
    id: "board-1",
    projectPath: "/tmp/project",
    status: "active",
    title: "Simplify project board",
    summary: "Move candidate detail rendering behind stable props.",
    charter: {
      id: "charter-1",
      boardId: "board-1",
      version: 1,
      status: "active",
      goal: "Simplify the project board workspace.",
      currentState: "Candidate detail is embedded in the workspace.",
      targetUser: "Maintainers",
      nonGoals: [],
      qualityBar: "Behavior-preserving extraction.",
      testPolicy: { requireProofSpec: true },
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "# Charter",
      createdAt: "2026-06-14T10:00:00.000Z",
      updatedAt: "2026-06-14T10:00:00.000Z",
    },
    cards,
    sources: [projectBoardSource()],
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
    title: "Inspect candidate detail",
    description: "Keep candidate detail rendering behind an explicit owner.",
    status: "draft",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "proof",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["Candidate detail renders from explicit props."],
    testPlan: {
      unit: ["static render"],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "source-1",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}

function projectBoardSource(): ProjectBoardSource {
  return {
    id: "source-1",
    boardId: "board-1",
    kind: "implementation_file",
    title: "Implementation note",
    summary: "Candidate detail source basis.",
    path: "src/renderer/src/ProjectBoardWorkspace.tsx",
    relevance: 1,
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}

function decisionImpactPreview(): ProjectBoardDecisionImpactPreview {
  return {
    visible: true,
    question: "Which mobile breakpoint is required?",
    answer: "Support 390px and above.",
    canonicalKey: "which mobile breakpoint is required",
    answeredCardId: "card-1",
    affectedCardIds: ["card-1"],
    unblockedDraftCount: 1,
    stillBlockedDraftCount: 0,
    duplicateHiddenCount: 0,
    readyFeedbackCount: 1,
    auditOnlyCount: 0,
    targetedRefreshOptional: true,
    modelCallRequired: false,
    headline: "1 linked card needs follow-up",
    detail: "Draft gate clears immediately and one ticketized card needs next-run feedback.",
    metrics: [
      { label: "Affected", value: "1", title: "Cards with matching open decisions." },
      { label: "Ready feedback", value: "1" },
      { label: "Model calls", value: "0" },
    ],
    cards: [],
    recommendedActions: [
      "Save answer and clear duplicate gates",
      "Optionally refresh affected draft cards only",
      "Create next-run feedback for ticketized cards",
    ],
  };
}
