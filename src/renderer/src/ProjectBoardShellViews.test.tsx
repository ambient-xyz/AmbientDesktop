import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardSource, ProjectSummary } from "../../shared/projectBoardTypes";
import {
  ProjectBoardCharterTab,
  ProjectBoardComplexityShadowPanel,
  ProjectBoardOverviewTab,
  ProjectBoardTabs,
} from "./ProjectBoardShellViews";
import {
  projectBoardComplexityEstimate,
  projectBoardTabs,
} from "./projectBoardUiModel";

describe("ProjectBoardShellViews", () => {
  it("renders project board tabs and complexity shadow from explicit models", () => {
    const board = projectBoard();
    const markup = renderToStaticMarkup(
      <>
        <ProjectBoardComplexityShadowPanel estimate={projectBoardComplexityEstimate(board)} />
        <ProjectBoardTabs tabs={projectBoardTabs(board)} activeTab="charter" onSelect={() => undefined} />
      </>,
    );

    expect(markup).toContain("Shadow project complexity estimate");
    expect(markup).toContain("Project complexity:");
    expect(markup).toContain("No behavior changes");
    expect(markup).toContain("Project board views");
    expect(markup).toContain("Overview");
    expect(markup).toContain("Charter");
    expect(markup).toContain("Board");
  });

  it("renders the moved overview tab with workflow and impact sections", () => {
    const markup = renderToStaticMarkup(
      <ProjectBoardOverviewTab
        board={projectBoard()}
        onSelectTab={() => undefined}
        onSelectCard={() => undefined}
      />,
    );

    expect(markup).toContain("Project board overview");
    expect(markup).toContain("Overview");
    expect(markup).toContain("Tabs map to the next user action");
    expect(markup).toContain("Impact queue");
    expect(markup).toContain("Full-board Pi");
  });

  it("renders the moved charter tab with source review wiring", () => {
    const markup = renderToStaticMarkup(
      <ProjectBoardCharterTab
        board={projectBoard()}
        finalizeBusy={false}
        sourceBusy={false}
        sourceImpactBusy={false}
        kickoffDefaultsBusy={false}
        refineBusy={false}
        onAnswerQuestion={() => undefined}
        onFinalizeKickoff={() => undefined}
        onCancelRevision={() => undefined}
        onRefreshSources={() => undefined}
        onSuggestKickoffDefaults={() => undefined}
        onRefreshSourceDrafts={() => undefined}
        onRegenerateSourceDrafts={() => undefined}
        onApplySourceImpactFeedback={() => undefined}
        onRefineWithPi={() => undefined}
        onElaborateSources={() => undefined}
        onUpdateSource={() => undefined}
        onOpenSourceReview={() => undefined}
        onInspectCard={() => undefined}
      />,
    );

    expect(markup).toContain("Project board charter");
    expect(markup).toContain("Active project charter");
    expect(markup).toContain("Refresh Sources");
    expect(markup).toContain("Review Charter With Pi");
    expect(markup).toContain("Charter preview");
    expect(markup).toContain("Source review");
    expect(markup).toContain("Select a source");
  });
});

function projectBoard(input: Partial<NonNullable<ProjectSummary["board"]>> = {}): NonNullable<ProjectSummary["board"]> {
  return {
    id: "board-1",
    projectPath: "/tmp/project",
    status: "active",
    title: "Project board shell",
    summary: "Move project board shell views behind explicit props.",
    charter: {
      id: "charter-1",
      boardId: "board-1",
      version: 2,
      status: "active",
      goal: "Simplify the project board workspace.",
      currentState: "Shell views are embedded in the workspace.",
      targetUser: "Maintainers",
      nonGoals: [],
      qualityBar: "Behavior-preserving extraction.",
      testPolicy: { defaultProof: "Renderer parity is required." },
      decisionPolicy: { defaultPolicy: "Ask before unresolved tradeoffs." },
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: { policy: "Only durable sources drive synthesis." },
      markdown: "# Charter\n\nKeep shell view behavior stable.",
      createdAt: "2026-06-14T10:00:00.000Z",
      updatedAt: "2026-06-14T10:00:00.000Z",
    },
    cards: [projectBoardCard()],
    sources: [projectBoardSource()],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}

function projectBoardSource(input: Partial<ProjectBoardSource> = {}): ProjectBoardSource {
  return {
    id: "source-1",
    boardId: "board-1",
    kind: "implementation_file",
    sourceKey: "src/renderer/src/ProjectBoardWorkspace.tsx",
    changeState: "unchanged",
    title: "Workspace shell",
    summary: "Project Board shell views should have a direct owner.",
    excerpt: "Move shell rendering while keeping board orchestration state in the workspace.",
    path: "src/renderer/src/ProjectBoardWorkspace.tsx",
    classifiedBy: "ambient_pi",
    classificationConfidence: 0.92,
    authorityRole: "primary",
    includeInSynthesis: true,
    relevance: 1,
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Review shell extraction",
    description: "Keep project board shell rendering stable.",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "Phase 2",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["Shell renders with stable markup."],
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
