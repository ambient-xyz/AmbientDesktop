import { describe, expect, it } from "vitest";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { projectBoardLiveSessionPreviewModel } from "./projectBoardUiModel";

describe("projectBoardProofUiModel live session preview", () => {
  it("models live Pi session preview with terminal copy gating", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const card: ProjectBoardCard = {
      id: "card-live",
      boardId: "board-1",
      title: "Show live Pi events",
      description: "Expose session activity from the selected board card.",
      status: "in_progress",
      candidateStatus: "ready_to_create",
      labels: ["project-board"],
      blockedBy: [],
      acceptanceCriteria: ["Live activity stays scoped to the selected card."],
      testPlan: { unit: ["Model preview state."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "manual:card-live",
      orchestrationTaskId: "task-1",
      executionThreadId: "thread-1",
      createdAt: now,
      updatedAt: now,
    };
    const task: OrchestrationTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Show live Pi events",
      state: "in_progress",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: now,
      updatedAt: now,
    };
    const runningRun: OrchestrationRun = {
      id: "run-1",
      taskId: "task-1",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-1",
      threadId: "thread-1",
      startedAt: now,
      lastEventAt: now,
      proofOfWork: {
        progress: { messageCount: 3, toolMessageCount: 1, elapsedMs: 42_000 },
        lastAssistantText: "Inspecting the board detail pane and wiring recent activity into the selected card.",
      },
    };

    const running = projectBoardLiveSessionPreviewModel({
      card,
      task,
      latestRun: runningRun,
      threadStatus: "tool",
      activityLines: [{ id: "activity-1", kind: "tool", text: "Tool call: file_read App.tsx", timestamp: Date.parse(now) }],
      now: Date.parse(now) + 42_000,
    });

    expect(running).toMatchObject({
      visible: true,
      active: true,
      terminal: false,
      statusLabel: "Tool call running",
      latestAssistantText: expect.stringContaining("Inspecting the board detail pane"),
    });
    expect(running.copyAction).toMatchObject({
      disabled: true,
      label: "Copy Session to Thread",
    });
    expect(running.activity[0]).toMatchObject({ label: "Tool call", text: expect.stringContaining("file_read") });

    const completed = projectBoardLiveSessionPreviewModel({
      card: { ...card, status: "review" },
      task: { ...task, state: "needs_review" },
      latestRun: { ...runningRun, status: "completed", finishedAt: "2026-01-01T00:02:00.000Z" },
      threadStatus: "idle",
    });

    expect(completed).toMatchObject({
      active: false,
      terminal: true,
      statusLabel: "Completed",
    });
    expect(completed.copyAction).toMatchObject({
      disabled: false,
      runId: "run-1",
      threadId: "thread-1",
    });
  });
});
