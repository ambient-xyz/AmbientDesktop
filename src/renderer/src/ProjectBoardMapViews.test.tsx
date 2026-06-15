import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectBoardCard, ProjectSummary } from "../../shared/types";
import {
  ProjectBoardMapTab,
  projectBoardDependencyCardForRef,
  projectBoardDependencyRefLabel,
} from "./ProjectBoardMapViews";

describe("ProjectBoardMapViews", () => {
  it("renders dependency map groups, issues, and edit affordances through explicit props", () => {
    const board = projectBoard([
      projectBoardCard({
        id: "foundation",
        title: "Foundation",
        status: "done",
        phase: "Phase 1",
        orchestrationTaskId: "task-foundation",
      }),
      projectBoardCard({
        id: "dependent",
        title: "Dependent",
        phase: "Phase 2",
        blockedBy: ["foundation", "missing-ref"],
      }),
    ]);

    const markup = renderToStaticMarkup(
      <ProjectBoardMapTab
        board={board}
        onInspectCard={() => undefined}
        onUpdateCard={vi.fn()}
      />,
    );

    expect(markup).toContain("Project board dependency map");
    expect(markup).toContain("2 phase groups");
    expect(markup).toContain("1 dependency issue");
    expect(markup).toContain("Critical path");
    expect(markup).toContain("Execution order");
    expect(markup).toContain("Dependent");
    expect(markup).toContain("Blocked by Foundation");
    expect(markup).toContain("Unresolved missing-ref");
    expect(markup).toContain("Edit dependencies");
    expect(markup).toContain("Add blocker");
  });

  it("keeps dependency ref helpers compatible from the map owner", () => {
    const cards = [
      projectBoardCard({ id: "card-1", title: "Card one", sourceId: "source-card" }),
      projectBoardCard({ id: "card-2", title: "Card two", orchestrationTaskId: "task-card" }),
    ];

    expect(projectBoardDependencyRefLabel("source-card", cards)).toBe("Card one");
    expect(projectBoardDependencyRefLabel("project-board-card:card-2", cards)).toBe("Card two");
    expect(projectBoardDependencyRefLabel("missing-ref", cards)).toBe("missing-ref");
    expect(projectBoardDependencyCardForRef("task-card", cards)?.id).toBe("card-2");
  });
});

function projectBoard(cards: ProjectBoardCard[]): NonNullable<ProjectSummary["board"]> {
  return {
    id: "board-1",
    projectPath: "/tmp/project",
    status: "active",
    title: "Project board dependency map",
    summary: "Move dependency map rendering behind an explicit owner.",
    cards,
    sources: [],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  } as NonNullable<ProjectSummary["board"]>;
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Map dependency card",
    description: "Keep map behavior behind a dedicated view owner.",
    status: "draft",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "Phase 1",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["Dependency map renders with stable markup."],
    testPlan: {
      unit: ["static render"],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "source-1",
    sourceRefs: ["source-1"],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...input,
  };
}
