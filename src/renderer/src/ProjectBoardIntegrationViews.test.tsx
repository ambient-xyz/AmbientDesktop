import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  OrchestrationBoard,
  OrchestrationRun,
  OrchestrationTask,
  ProjectBoardCard,
  ProjectSummary,
} from "../../shared/types";
import { ProjectBoardIntegrationTab } from "./ProjectBoardIntegrationViews";

describe("ProjectBoardIntegrationViews", () => {
  it("renders deliverable integration actions from explicit board and orchestration props", () => {
    const card = projectBoardCard();
    const markup = renderToStaticMarkup(
      <ProjectBoardIntegrationTab
        board={projectBoard({ cards: [card] })}
        orchestrationBoard={{
          tasks: [orchestrationTask()],
          runs: [orchestrationRun()],
        } as OrchestrationBoard}
        onResolve={() => undefined}
      />,
    );

    expect(markup).toContain("Project board integration queue");
    expect(markup).toContain("1 deliverable integration item pending");
    expect(markup).toContain("1 pending");
    expect(markup).toContain("Build integration root");
    expect(markup).toContain("Apply To Root");
    expect(markup).toContain("Export Bundle");
    expect(markup).toContain("Defer");
    expect(markup).toContain("src/integration.ts");
    expect(markup).toContain("Excluded by policy");
  });
});

function projectBoard(input: Partial<NonNullable<ProjectSummary["board"]>> = {}): NonNullable<ProjectSummary["board"]> {
  return {
    id: "board-1",
    projectPath: "/workspace/app",
    status: "active",
    title: "Integration board",
    summary: "Board summary",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    events: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...input,
  };
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Build integration root",
    description: "Create project files.",
    status: "review",
    candidateStatus: "ready_to_create",
    phase: "Phase 2",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["Files are ready."],
    testPlan: { unit: ["Run tests."], integration: [], visual: [], manual: [] },
    sourceKind: "manual",
    sourceId: "manual:card-1",
    orchestrationTaskId: "task-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...input,
  };
}

function orchestrationTask(input: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "LOCAL-1",
    title: "Build integration root",
    state: "review",
    labels: ["project-board"],
    blockedBy: [],
    sourceKind: "project_board_card",
    projectPath: "/workspace/app",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...input,
  };
}

function orchestrationRun(input: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: "run-1",
    taskId: "task-1",
    attemptNumber: 1,
    status: "completed",
    workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    proofOfWork: {
      kind: "agent-run",
      changedFiles: ["index.html", "src/integration.ts", ".ambient-codex/session.json"],
      artifactFiles: [],
      commands: ["pnpm test"],
      commits: ["abc123"],
      dependencyImports: ["date-fns"],
    },
    ...input,
  };
}
