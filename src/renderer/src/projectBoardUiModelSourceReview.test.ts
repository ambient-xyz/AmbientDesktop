import { describe, expect, it } from "vitest";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
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
} from "./projectBoardUiModel";

describe("projectBoardUiModel source review", () => {
  it("links cards back to their source basis", () => {
    const source = {
      id: "source-gdd",
      boardId: "board-1",
      kind: "functional_spec" as const,
      sourceKey: "docs/GDD.md",
      title: "Game Design Document",
      summary: "Main game scope",
      path: "docs/GDD.md",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Implement ship controls",
      description: "Controls from GDD.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Ship moves."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:ship-controls",
      sourceRefs: ["source-gdd", "docs/GDD.md"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(projectBoardCardSourceBasis(card, [source])[0]).toEqual(
      expect.objectContaining({ label: "Game Design Document", sourceId: "source-gdd" }),
    );
    expect(
      projectBoardCardsForSourceGroup({ id: "group-1", primary: source, observations: [source], generatedObservationCount: 0 }, [card]),
    ).toHaveLength(1);
  });

  it("builds source review filters from canonical source groups", () => {
    const sourceBase = {
      boardId: "board-1",
      summary: "Relevant source",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      classifiedBy: "ambient_pi" as const,
      includeInSynthesis: true,
      classificationReason: "Pi selected this source for planning.",
    };
    const sources = [
      {
        ...sourceBase,
        id: "source-1",
        title: "Architecture",
        kind: "architecture_artifact" as const,
        path: "docs/architecture.md",
        changeState: "new" as const,
      },
      {
        ...sourceBase,
        id: "source-2",
        title: "Workflow",
        kind: "workflow_artifact" as const,
        path: "WORKFLOW.md",
        changeState: "changed" as const,
      },
      {
        ...sourceBase,
        id: "source-3",
        title: "Workflow",
        kind: "workflow_artifact" as const,
        path: "test-results/WORKFLOW.md",
        changeState: "changed" as const,
      },
      {
        ...sourceBase,
        id: "source-4",
        title: "Scratch",
        kind: "ignored" as const,
        path: "scratch.md",
        changeState: "unchanged" as const,
        classifiedBy: "user" as const,
        includeInSynthesis: false,
      },
    ];
    const groups = projectBoardSourceGroups(sources);

    expect(groups).toHaveLength(3);
    const workflowGroup = groups.find((group) => group.primary.title === "Workflow")!;
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
    expect(projectBoardSourceGroupsForFilter(groups, "included_sources").map((group) => group.primary.title)).toEqual([
      "Architecture",
      "Workflow",
    ]);
    expect(projectBoardSourceGroupsForFilter(groups, "ignored_sources").map((group) => group.primary.title)).toEqual(["Scratch"]);
    expect(projectBoardSourcesForFilter(sources, "included_sources").map((source) => source.id)).toEqual([
      "source-1",
      "source-2",
      "source-3",
    ]);
    expect(projectBoardSourcesForFilter(sources, "ignored_sources").map((source) => source.id)).toEqual(["source-4"]);
    expect(projectBoardSourcesForFilter(sources, "workflow_artifact").map((source) => source.id)).toEqual(["source-2", "source-3"]);
    expect(projectBoardSourcesForFilter(sources, "all")).toHaveLength(4);
    expect(projectBoardSourceChangeFilterItems(groups)).toEqual([
      { kind: "all", label: "All changes", count: 3 },
      { kind: "new", label: "New", count: 1 },
      { kind: "changed", label: "Changed", count: 1 },
      { kind: "unchanged", label: "Unchanged", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForChangeFilter(groups, "changed").map((group) => group.primary.title)).toEqual(["Workflow"]);
    const sourceSummary = projectBoardSourceChangeSummary(groups, [
      {
        id: "event-1",
        boardId: "board-1",
        kind: "sources_refreshed",
        title: "Sources refreshed",
        summary: "",
        metadata: { removedCount: 2 },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(sourceSummary).toMatchObject({
      newCount: 1,
      changedCount: 1,
      unchangedCount: 1,
      removedCount: 2,
      includedCount: 2,
      ignoredCount: 1,
      headline: "1 new, 1 changed, 2 removed since the last refresh.",
    });
    expect(sourceSummary.detail).toContain("2 included for Decisions and card generation");
    expect(sourceSummary.detail).toContain("1 ignored but visible");
    expect(sourceSummary.refreshTitle).toContain("Ignored sources stay visible in inventory");
    expect(sourceSummary.refreshTitle).toContain("User source classifications are preserved");
    expect(projectBoardSourceChangeDetail(workflowGroup)).toContain("Changed. Workflow, Included in synthesis. classified by Pi");

    const ignoredGroup = groups.find((group) => group.primary.kind === "ignored")!;
    expect(projectBoardSourceInclusion(workflowGroup.primary)).toMatchObject({
      included: true,
      label: "Included",
      addCardsEligible: true,
    });
    expect(projectBoardSourceInclusion(ignoredGroup.primary)).toMatchObject({
      included: false,
      label: "Ignored",
      badgeLabel: "Ignored for synthesis",
      addCardsEligible: false,
    });
    expect(projectBoardSourceChangeDetail(ignoredGroup)).toContain("Visible in source inventory and refresh history");
    expect(projectBoardSourceGroupCanElaborate(workflowGroup)).toBe(true);
    expect(projectBoardSourceGroupCanElaborate(ignoredGroup)).toBe(false);
    expect(projectBoardSourceGroupIncludedSourceIds(workflowGroup)).toEqual(["source-2", "source-3"]);
    expect(projectBoardSourceGroupIncludedSourceIds(ignoredGroup)).toEqual([]);

    const scope = projectBoardAddCardsSourceScope(groups, [workflowGroup.id]);
    expect(scope).toMatchObject({
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
    expect(projectBoardAddCardsSourceScope(groups, [workflowGroup.id, ignoredGroup.id])).toMatchObject({
      selectedGroupCount: 1,
      selectedObservationCount: 2,
      selectedSourceIds: ["source-2", "source-3"],
    });
    expect(projectBoardAddCardsSourceScope(groups, [], true)).toMatchObject({
      disabled: true,
      label: "Elaborating",
    });

    const durableGroups = [
      {
        id: "durable-plan",
        primary: {
          ...sourceBase,
          id: "durable-plan-source",
          title: "Refined Durable Plan",
          kind: "plan_artifact" as const,
          path: ".ambient/board/plans/App-DurablePlan.html",
          authorityRole: "primary" as const,
        },
        observations: [],
        generatedObservationCount: 0,
      },
      {
        id: "chat-thread",
        primary: {
          ...sourceBase,
          id: "chat-source",
          title: "Planning chat",
          kind: "thread" as const,
          threadId: "thread-1",
          authorityRole: "ignored" as const,
          includeInSynthesis: false,
        },
        observations: [],
        generatedObservationCount: 0,
      },
    ];
    const durableSummary = projectBoardSourceChangeSummary(durableGroups);
    expect(durableSummary).toMatchObject({
      durablePlanPrimaryCount: 1,
      durablePlanIgnoredThreadCount: 1,
      sourceAuthorityNotice: "Durable plan selected as source of truth; 1 chat thread ignored by default.",
    });
    expect(durableSummary.detail).toContain("Durable plan selected as source of truth");
    expect(projectBoardSourceFilterItems(durableGroups)).toEqual([
      { kind: "all", label: "All", count: 2 },
      { kind: "included_sources", label: "Included", count: 1 },
      { kind: "ignored_sources", label: "Ignored for synthesis", count: 1 },
      { kind: "ignored_threads", label: "Ignored threads", count: 1 },
      { kind: "plan_artifact", label: "Plan", count: 1 },
      { kind: "thread", label: "Thread", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForFilter(durableGroups, "ignored_threads").map((group) => group.primary.title)).toEqual([
      "Planning chat",
    ]);
  });

  it("previews source inclusion impact without rewriting existing cards", () => {
    const sourceBase = {
      boardId: "board-1",
      summary: "Planning context.",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const durableSource = {
      ...sourceBase,
      id: "durable-plan-source",
      title: "Refined Durable Plan",
      kind: "plan_artifact" as const,
      path: ".ambient/board/plans/App-DurablePlan.html",
      authorityRole: "primary" as const,
      includeInSynthesis: true,
      byteSize: 6000,
    };
    const chatSource = {
      ...sourceBase,
      id: "chat-source",
      title: "Planning chat",
      kind: "thread" as const,
      threadId: "thread-1",
      includeInSynthesis: false,
      authorityRole: "ignored" as const,
      byteSize: 9000,
    };
    const includedChatSource = {
      ...sourceBase,
      id: "included-chat-source",
      title: "Promoted UX chat",
      kind: "thread" as const,
      threadId: "thread-2",
      includeInSynthesis: true,
      byteSize: 7000,
    };
    const baseCard: ProjectBoardCard = {
      id: "card-1",
      boardId: "board-1",
      title: "Draft from chat",
      description: "",
      status: "draft",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "included-chat-source",
      sourceRefs: ["included-chat-source", "thread-2"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const readyCard: ProjectBoardCard = {
      ...baseCard,
      id: "card-2",
      title: "Ready from durable plan",
      status: "ready",
      sourceId: "durable-plan-source",
      sourceRefs: ["durable-plan-source"],
    };

    const board = { sources: [durableSource, chatSource, includedChatSource], cards: [baseCard, readyCard] };
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
    expect(defaultPreview.detail).toContain("Existing board cards are not rewritten by default.");
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
    expect(selectedPreview.groups[0]).toMatchObject({
      title: "Promoted UX chat",
      kindLabel: "Thread",
      included: true,
      estimatedPromptChars: 7000,
      affectedDraftCount: 1,
    });
    expect(selectedPreview.cards[0]).toMatchObject({ cardId: "card-1", sourceLabel: "Draft can refresh" });
  });
});
