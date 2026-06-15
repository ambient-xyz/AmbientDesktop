import { describe, expect, it } from "vitest";

import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSource } from "../../shared/types";
import {
  projectBoardAddCardsSourceScope,
  projectBoardCardSourceBasis,
  projectBoardCardsForSourceGroup,
  projectBoardSourceChangeDetail,
  projectBoardSourceChangeFilterItems,
  projectBoardSourceChangeSummary,
  projectBoardSourceFilterItems,
  projectBoardSourceGroupCanElaborate,
  projectBoardSourceGroupIncludedSourceIds,
  projectBoardSourceGroups,
  projectBoardSourceGroupsForChangeFilter,
  projectBoardSourceGroupsForFilter,
  projectBoardSourceImpactPreview,
  projectBoardSourceInclusion,
  projectBoardSourceObservationLabel,
  projectBoardSourcesForFilter,
} from "./projectBoardSourceUiModel";

function source(overrides: Partial<ProjectBoardSource> = {}): ProjectBoardSource {
  return {
    id: overrides.id ?? "source-1",
    boardId: overrides.boardId ?? "board-1",
    kind: overrides.kind ?? "thread",
    title: overrides.title ?? "Source",
    summary: overrides.summary ?? "Relevant source",
    relevance: overrides.relevance ?? 1,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: overrides.id ?? "card-1",
    boardId: overrides.boardId ?? "board-1",
    title: overrides.title ?? "Implement source-backed card",
    description: overrides.description ?? "",
    status: overrides.status ?? "draft",
    candidateStatus: overrides.candidateStatus ?? "ready_to_create",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    testPlan: overrides.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: overrides.sourceKind ?? "board_synthesis",
    sourceId: overrides.sourceId ?? "source-1",
    sourceRefs: overrides.sourceRefs,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("projectBoardSourceUiModel", () => {
  it("builds source review filters, inclusion state, and Add Cards scope from canonical source groups", () => {
    const sources = [
      source({
        id: "source-1",
        title: "Architecture",
        kind: "architecture_artifact",
        path: "docs/architecture.md",
        changeState: "new",
        classifiedBy: "ambient_pi",
        includeInSynthesis: true,
      }),
      source({
        id: "source-2",
        title: "Workflow",
        kind: "workflow_artifact",
        path: "WORKFLOW.md",
        changeState: "changed",
        classifiedBy: "ambient_pi",
        includeInSynthesis: true,
      }),
      source({
        id: "source-3",
        title: "Workflow",
        kind: "workflow_artifact",
        path: "test-results/WORKFLOW.md",
        changeState: "changed",
        classifiedBy: "ambient_pi",
        includeInSynthesis: true,
      }),
      source({
        id: "source-4",
        title: "Scratch",
        kind: "ignored",
        path: "scratch.md",
        changeState: "unchanged",
        classifiedBy: "user",
        includeInSynthesis: false,
      }),
    ];
    const groups = projectBoardSourceGroups(sources);
    const workflowGroup = groups.find((group) => group.primary.title === "Workflow")!;
    const ignoredGroup = groups.find((group) => group.primary.kind === "ignored")!;

    expect(groups).toHaveLength(3);
    expect(workflowGroup.primary.path).toBe("WORKFLOW.md");
    expect(projectBoardSourceObservationLabel(workflowGroup)).toBe("2 observations, 1 generated");
    expect(projectBoardSourceFilterItems(groups)).toEqual([
      { kind: "all", label: "All", count: 3 },
      { kind: "included_sources", label: "Included", count: 2 },
      { kind: "ignored_sources", label: "Ignored for synthesis", count: 1 },
      { kind: "architecture_artifact", label: "Architecture", count: 1 },
      { kind: "ignored", label: "Ignored", count: 1 },
      { kind: "workflow_artifact", label: "Workflow", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForFilter(groups, "included_sources").map((group) => group.primary.title)).toEqual(["Architecture", "Workflow"]);
    expect(projectBoardSourceGroupsForFilter(groups, "ignored_sources").map((group) => group.primary.title)).toEqual(["Scratch"]);
    expect(projectBoardSourcesForFilter(sources, "included_sources").map((item) => item.id)).toEqual(["source-1", "source-2", "source-3"]);
    expect(projectBoardSourcesForFilter(sources, "workflow_artifact").map((item) => item.id)).toEqual(["source-2", "source-3"]);
    expect(projectBoardSourceChangeFilterItems(groups)).toEqual([
      { kind: "all", label: "All changes", count: 3 },
      { kind: "new", label: "New", count: 1 },
      { kind: "changed", label: "Changed", count: 1 },
      { kind: "unchanged", label: "Unchanged", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForChangeFilter(groups, "changed").map((group) => group.primary.title)).toEqual(["Workflow"]);
    expect(projectBoardSourceInclusion(workflowGroup.primary)).toMatchObject({ included: true, addCardsEligible: true });
    expect(projectBoardSourceInclusion(ignoredGroup.primary)).toMatchObject({ included: false, addCardsEligible: false });
    expect(projectBoardSourceChangeDetail(workflowGroup)).toContain("Changed. Workflow, Included in synthesis. classified by Pi");
    expect(projectBoardSourceGroupCanElaborate(workflowGroup)).toBe(true);
    expect(projectBoardSourceGroupCanElaborate(ignoredGroup)).toBe(false);
    expect(projectBoardSourceGroupIncludedSourceIds(workflowGroup)).toEqual(["source-2", "source-3"]);

    expect(projectBoardAddCardsSourceScope(groups, [workflowGroup.id])).toMatchObject({
      selectedGroupCount: 1,
      selectedObservationCount: 2,
      selectedSourceIds: ["source-2", "source-3"],
      disabled: false,
      label: "Elaborate 1 Source",
    });
    expect(projectBoardAddCardsSourceScope(groups, [ignoredGroup.id])).toMatchObject({
      selectedGroupCount: 0,
      selectedObservationCount: 0,
      selectedSourceIds: [],
      disabled: true,
      label: "Select Sources",
    });
  });

  it("summarizes durable-plan source authority and refresh changes", () => {
    const durableGroups = [
      {
        id: "durable-plan",
        primary: source({
          id: "durable-plan-source",
          title: "Refined Durable Plan",
          kind: "plan_artifact",
          path: ".ambient/board/plans/App-DurablePlan.html",
          authorityRole: "primary",
          includeInSynthesis: true,
        }),
        observations: [],
        generatedObservationCount: 0,
      },
      {
        id: "chat-thread",
        primary: source({
          id: "chat-source",
          title: "Planning chat",
          kind: "thread",
          threadId: "thread-1",
          authorityRole: "ignored",
          includeInSynthesis: false,
        }),
        observations: [],
        generatedObservationCount: 0,
      },
    ];
    const event: ProjectBoardEvent = {
      id: "event-1",
      boardId: "board-1",
      kind: "sources_refreshed",
      title: "Sources refreshed",
      summary: "",
      metadata: { removedCount: 2 },
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const summary = projectBoardSourceChangeSummary(durableGroups, [event]);

    expect(summary).toMatchObject({
      durablePlanPrimaryCount: 1,
      durablePlanIgnoredThreadCount: 1,
      sourceAuthorityNotice: "Durable plan selected as source of truth; 1 chat thread ignored by default.",
      removedCount: 2,
    });
    expect(summary.detail).toContain("Durable plan selected as source of truth");
    expect(projectBoardSourceFilterItems(durableGroups)).toEqual([
      { kind: "all", label: "All", count: 2 },
      { kind: "included_sources", label: "Included", count: 1 },
      { kind: "ignored_sources", label: "Ignored for synthesis", count: 1 },
      { kind: "ignored_threads", label: "Ignored threads", count: 1 },
      { kind: "plan_artifact", label: "Plan", count: 1 },
      { kind: "thread", label: "Thread", count: 1 },
    ]);
  });

  it("links cards to sources and previews additive source impact without rewriting existing cards", () => {
    const durableSource = source({
      id: "durable-plan-source",
      title: "Refined Durable Plan",
      kind: "plan_artifact",
      path: ".ambient/board/plans/App-DurablePlan.html",
      authorityRole: "primary",
      includeInSynthesis: true,
      byteSize: 6000,
    });
    const ignoredChat = source({
      id: "chat-source",
      title: "Planning chat",
      kind: "thread",
      threadId: "thread-1",
      includeInSynthesis: false,
      authorityRole: "ignored",
      byteSize: 9000,
    });
    const includedChat = source({
      id: "included-chat-source",
      title: "Promoted UX chat",
      kind: "thread",
      threadId: "thread-2",
      includeInSynthesis: true,
      byteSize: 7000,
    });
    const draftCard = card({
      id: "card-1",
      title: "Draft from chat",
      sourceId: "included-chat-source",
      sourceRefs: ["included-chat-source", "thread-2"],
    });
    const readyCard = card({
      id: "card-2",
      title: "Ready from durable plan",
      status: "ready",
      sourceId: "durable-plan-source",
      sourceRefs: ["durable-plan-source"],
    });
    const board = { sources: [durableSource, ignoredChat, includedChat], cards: [draftCard, readyCard] };

    expect(projectBoardCardSourceBasis(draftCard, board.sources)).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Promoted UX chat", sourceId: "included-chat-source" })]),
    );
    const durableGroup = projectBoardSourceGroups(board.sources).find((group) => group.primary.id === "durable-plan-source")!;
    expect(projectBoardCardsForSourceGroup(durableGroup, board.cards).map((item) => item.id)).toContain("card-2");

    const defaultPreview = projectBoardSourceImpactPreview(board);
    expect(defaultPreview).toMatchObject({
      modelCallRequired: false,
      durablePlanPrimaryCount: 1,
      includedChatCount: 1,
      ignoredChatCount: 1,
      affectedDraftCount: 1,
      affectedExecutableCount: 0,
    });
    expect(defaultPreview.headline).toBe("Durable plan primary; 1 chat excluded");
    expect(defaultPreview.metrics.find((metric) => metric.label === "Card rewrites")?.value).toBe(0);

    const selectedGroup = projectBoardSourceGroups(board.sources).find((group) => group.primary.id === "included-chat-source")!;
    const selectedPreview = projectBoardSourceImpactPreview(board, { selectedGroupIds: [selectedGroup.id] });
    expect(selectedPreview).toMatchObject({
      modelCallRequired: true,
      selectedGroupCount: 1,
      selectedObservationCount: 1,
      estimatedPromptChars: 7000,
      affectedCardIds: ["card-1"],
      affectedDraftCount: 1,
    });
    expect(selectedPreview.headline).toBe("1 source group can elaborate additive cards");
    expect(selectedPreview.cards[0]).toMatchObject({ cardId: "card-1", sourceLabel: "Draft can refresh" });
  });
});
