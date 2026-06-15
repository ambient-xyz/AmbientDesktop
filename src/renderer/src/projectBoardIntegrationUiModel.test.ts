import { describe, expect, it } from "vitest";

import type {
  OrchestrationRun,
  OrchestrationTask,
  ProjectBoardCard,
  ProjectBoardEvent,
  ProjectBoardSummary,
} from "../../shared/types";
import { projectBoardDeliverableIntegrationQueue } from "./projectBoardIntegrationUiModel";

describe("projectBoardIntegrationUiModel", () => {
  it("keeps current-board and manual deliverables while excluding sibling-board runs", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const board = projectBoard({
      cards: [projectBoardCard({ orchestrationTaskId: "task-1" })],
    });
    const ownTask = orchestrationTask({ id: "task-1", title: "Implement current board" });
    const siblingTask = orchestrationTask({ id: "task-2", title: "Implement sibling board" });
    const manualTask = orchestrationTask({ id: "task-3", title: "Manual local task", sourceKind: "manual" });
    const orchestration = {
      tasks: [ownTask, siblingTask, manualTask],
      runs: [
        orchestrationRun({ id: "run-1", taskId: "task-1", workspacePath: `/workspace/current/${now}` }),
        orchestrationRun({ id: "run-2", taskId: "task-2" }),
        orchestrationRun({ id: "run-3", taskId: "task-3" }),
      ],
    };

    const queue = projectBoardDeliverableIntegrationQueue(board, orchestration);

    expect(queue.items.map((item) => item.task?.title)).toEqual(["Implement current board", "Manual local task"]);
    expect(queue.pendingCount).toBe(2);
    expect(queue.materialFileCount).toBe(4);
  });

  it("models pending and resolved deliverable actions", () => {
    const card = projectBoardCard();
    const task = orchestrationTask();
    const run = orchestrationRun();
    const board = projectBoard({ cards: [card] });
    const orchestration = { tasks: [task], runs: [run] };

    const pending = projectBoardDeliverableIntegrationQueue(board, orchestration);

    expect(pending).toMatchObject({
      headline: "1 deliverable integration item pending",
      pendingCount: 1,
      materialFileCount: 2,
      excludedFileCount: 2,
    });
    expect(pending.items[0].actions.map((action) => [action.action, action.disabled])).toEqual([
      ["apply_to_root", false],
      ["export_bundle", false],
      ["defer", false],
    ]);

    const resolved = projectBoardDeliverableIntegrationQueue(
      projectBoard({ cards: [card], events: [deliverableEvent({ runId: run.id, status: "integrated" })] }),
      orchestration,
    );

    expect(resolved).toMatchObject({
      pendingCount: 0,
      integratedCount: 1,
    });
    expect(resolved.items[0]).toMatchObject({ status: "integrated", actionLabel: "Integrated" });
    expect(resolved.items[0].actions.every((action) => action.disabled)).toBe(true);
  });
});

function projectBoard(input: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
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
      changedFiles: ["index.html", "src/integration.ts", ".ambient-codex/session.json", "node_modules/cache/index.js"],
      artifactFiles: [],
      commands: ["pnpm test"],
      commits: ["abc123"],
      dependencyImports: ["date-fns"],
    },
    ...input,
  };
}

function deliverableEvent(input: {
  runId: string;
  status: "integrated" | "exported" | "deferred";
}): ProjectBoardEvent {
  return {
    id: `event-${input.status}`,
    boardId: "board-1",
    kind: "deliverable_integration_resolved",
    title: "Deliverables resolved",
    summary: "Resolved.",
    entityKind: "orchestration_run",
    entityId: input.runId,
    metadata: {
      runId: input.runId,
      taskId: "task-1",
      cardId: "card-1",
      action: input.status === "integrated" ? "apply_to_root" : input.status === "exported" ? "export_bundle" : "defer",
      status: input.status,
      materialFiles: ["index.html", "src/integration.ts"],
      excludedFiles: [".ambient-codex/session.json"],
      appliedFiles: input.status === "deferred" ? [] : ["index.html", "src/integration.ts"],
      skippedFiles: [],
    },
    createdAt: "2026-01-01T00:02:00.000Z",
  };
}
