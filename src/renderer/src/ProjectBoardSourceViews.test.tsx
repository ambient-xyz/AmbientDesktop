import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSource, ProjectSummary } from "../../shared/projectBoardTypes";
import { projectBoardSourceGroups, projectBoardSourceImpactPreview } from "./projectBoardUiModel";
import {
  ProjectBoardCharterPreview,
  ProjectBoardSourceDetail,
  ProjectBoardSourceImpactPreviewPanel,
  ProjectBoardSourceReview,
} from "./ProjectBoardSourceViews";

describe("ProjectBoardSourceViews", () => {
  it("renders charter preview policy copy from an explicit board prop", () => {
    const markup = renderToStaticMarkup(<ProjectBoardCharterPreview board={projectBoard([])} />);

    expect(markup).toContain("Charter preview");
    expect(markup).toContain("Simplify the project board workspace.");
    expect(markup).toContain("Only durable sources drive synthesis.");
    expect(markup).toContain("Ask before unresolved tradeoffs.");
    expect(markup).toContain("Renderer parity is required.");
    expect(markup).toContain("Active charter");
  });

  it("renders source review inventory and source-impact actions without owning board state", () => {
    const source = projectBoardSource();
    const cards = [
      projectBoardCard({ id: "draft-card", status: "draft", title: "Draft source card" }),
      projectBoardCard({ id: "ready-card", status: "ready", title: "Ready source card" }),
    ];
    const selectedGroup = projectBoardSourceGroups([source])[0];

    const markup = renderToStaticMarkup(
      <ProjectBoardSourceReview
        sources={[source]}
        cards={cards}
        events={[projectBoardSourceUpdatedEvent()]}
        selectedGroupId={selectedGroup.id}
        onSelectGroup={() => undefined}
        onUpdateSource={() => undefined}
        sourceImpactBusy={false}
        onRefreshSourceDrafts={() => undefined}
        onRegenerateSourceDrafts={() => undefined}
        onApplySourceImpactFeedback={() => undefined}
        onInspectCard={() => undefined}
      />,
    );

    expect(markup).toContain("Source review");
    expect(markup).toContain("Implementation note");
    expect(markup).toContain("Changed");
    expect(markup).toContain("Source impact");
    expect(markup).toContain("Refresh affected drafts");
    expect(markup).toContain("Ask Pi refresh");
    expect(markup).toContain("Create run feedback");
  });

  it("renders source-impact preview from the stable UI-model contract", () => {
    const source = projectBoardSource();
    const selectedGroup = projectBoardSourceGroups([source])[0];
    const preview = projectBoardSourceImpactPreview(
      {
        sources: [source],
        cards: [
          projectBoardCard({ id: "draft-card", status: "draft", title: "Draft source card" }),
          projectBoardCard({ id: "ready-card", status: "ready", title: "Ready source card" }),
        ],
      },
      { selectedGroupIds: [selectedGroup.id] },
    );

    const markup = renderToStaticMarkup(
      <ProjectBoardSourceImpactPreviewPanel
        preview={preview}
        onInspectCard={() => undefined}
        onRefreshDrafts={() => undefined}
        onRegenerateDrafts={() => undefined}
        onApplyRunFeedback={() => undefined}
      />,
    );

    expect(markup).toContain("Source impact");
    expect(markup).toContain("Pi call on apply");
    expect(markup).toContain("Affected drafts");
    expect(markup).toContain("Affected tasks");
    expect(markup).toContain("Draft source card");
    expect(markup).toContain("Ready source card");
  });

  it("renders selected source detail and referenced-card links behind explicit callbacks", () => {
    const source = projectBoardSource();
    const selectedGroup = projectBoardSourceGroups([source])[0];
    const markup = renderToStaticMarkup(
      <ProjectBoardSourceDetail
        group={selectedGroup}
        boardId="board-1"
        cards={[projectBoardCard({ title: "Card grounded in source" })]}
        elaborateBusy={false}
        onElaborateSources={() => undefined}
        onInspectCard={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain("Source inspector");
    expect(markup).toContain("Implementation note");
    expect(markup).toContain("Elaborate Cards");
    expect(markup).toContain("Refresh status");
    expect(markup).toContain("Referenced cards");
    expect(markup).toContain("Card grounded in source");
    expect(markup).toContain("Ready to create");
  });
});

function projectBoard(cards: ProjectBoardCard[]): NonNullable<ProjectSummary["board"]> {
  return {
    id: "board-1",
    projectPath: "/tmp/project",
    status: "active",
    title: "Project board source review",
    summary: "Move source panels behind explicit props.",
    charter: {
      id: "charter-1",
      boardId: "board-1",
      version: 2,
      status: "active",
      goal: "Simplify the project board workspace.",
      currentState: "Source panels are embedded in the workspace.",
      targetUser: "Maintainers",
      nonGoals: [],
      qualityBar: "Behavior-preserving extraction.",
      testPolicy: { defaultProof: "Renderer parity is required." },
      decisionPolicy: { defaultPolicy: "Ask before unresolved tradeoffs." },
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: { policy: "Only durable sources drive synthesis." },
      markdown: "# Charter\n\nKeep source review behavior stable.",
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

function projectBoardSource(input: Partial<ProjectBoardSource> = {}): ProjectBoardSource {
  return {
    id: "source-1",
    boardId: "board-1",
    kind: "implementation_file",
    sourceKey: "src/renderer/src/ProjectBoardWorkspace.tsx",
    changeState: "changed",
    title: "Implementation note",
    summary: "Source review panel should move behind a stable source-view owner.",
    excerpt: "Move source review rendering while keeping board orchestration in the workspace.",
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
    title: "Review source panel extraction",
    description: "Keep source review behavior behind explicit props.",
    status: "draft",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "proof",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["Source review renders with stable markup."],
    testPlan: {
      unit: ["static render"],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "source-1",
    sourceRefs: ["source-1", "src/renderer/src/ProjectBoardWorkspace.tsx"],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}

function projectBoardSourceUpdatedEvent(): ProjectBoardEvent {
  return {
    id: "event-1",
    boardId: "board-1",
    kind: "source_updated",
    title: "Source changed",
    summary: "Source review should expose deterministic follow-up actions.",
    entityKind: "source",
    entityId: "source-1",
    metadata: {
      sourceImpact: {
        targetedRefreshOptional: true,
        nextRunFeedbackRecommended: true,
      },
    },
    createdAt: "2026-06-14T10:00:00.000Z",
  };
}
