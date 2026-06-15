import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrchestrationTask } from "../../shared/types";
import {
  LocalTasksPane,
  compareKanbanTasks,
  taskNextState,
  taskPreviousState,
  taskStateOptions,
  taskTriggerLabel,
  taskUserLabels,
} from "./AutomationsLocalTaskBoard";

describe("Automations local task board", () => {
  it("renders the Local Tasks pane shell from parent-owned state and slots", () => {
    const markup = renderToStaticMarkup(
      createElement(LocalTasksPane, {
        tooltips: {
          localTasks: "Create local task cards.",
          autoDispatch: "Auto-dispatch tooltip.",
          triggerMode: "Trigger mode tooltip.",
          schedules: "Schedule tooltip.",
          recentRuns: "Recent runs tooltip.",
        },
        projectField: createElement("div", { "data-slot": "project" }, "Project field slot"),
        autoDispatchToggle: createElement("button", { type: "button" }, "Auto-dispatch on"),
        autoDispatchStatus: createElement("div", { "data-slot": "status" }, "Dispatch status slot"),
        prepareResult: createElement("div", { "data-slot": "prepare" }, "Prepare result slot"),
        recentRuns: createElement("div", { "data-slot": "runs" }, "Recent runs slot"),
        taskBoard: createElement("div", { "data-slot": "board" }, "Task board slot"),
        taskTriggerMode: "scheduled",
        taskInitialState: "ready",
        taskSchedulePreset: "advanced",
        taskScheduleExpression: "15 8 * * 1",
        taskTitle: "Ship local workflow",
        taskDescription: "Prepare a focused implementation task.",
        taskPriority: "2",
        taskLabels: "client, qa",
        prepareBusy: true,
        taskBusy: false,
        onRefresh: () => undefined,
        onPrepareNext: () => undefined,
        onCreateTask: () => undefined,
        onTaskTriggerModeChange: () => undefined,
        onTaskInitialStateChange: () => undefined,
        onTaskSchedulePresetChange: () => undefined,
        onTaskScheduleExpressionChange: () => undefined,
        onTaskTitleChange: () => undefined,
        onTaskDescriptionChange: () => undefined,
        onTaskPriorityChange: () => undefined,
        onTaskLabelsChange: () => undefined,
      }),
    );

    expect(markup).toContain("Local Tasks");
    expect(markup).toContain("Project field slot");
    expect(markup).toContain("Auto-dispatch on");
    expect(markup).toContain("Dispatch status slot");
    expect(markup).toContain("Preparing");
    expect(markup).toContain("Advanced cron");
    expect(markup).toContain("15 8 * * 1");
    expect(markup).toContain("Ship local workflow");
    expect(markup).toContain("Add task");
    expect(markup).toContain("Next run follows 15 8 * * 1");
    expect(markup).toContain("Recent runs slot");
    expect(markup).toContain("Task board slot");
  });

  it("keeps local task state options and adjacent transitions stable", () => {
    expect(taskStateOptions).toEqual([
      "todo",
      "ready",
      "in_progress",
      "review",
      "done",
      "canceled",
      "needs_info",
      "needs_review",
      "budget_exhausted",
      "terminal_blocker",
    ]);
    expect(taskPreviousState("todo")).toBeUndefined();
    expect(taskPreviousState("ready")).toBe("todo");
    expect(taskNextState("review")).toBe("done");
    expect(taskNextState("canceled")).toBeUndefined();
    expect(taskNextState("needs_info")).toBeUndefined();
  });

  it("derives trigger and user labels without mixing scheduling metadata into badges", () => {
    expect(taskTriggerLabel(task())).toBe("Manual");
    expect(taskTriggerLabel(task({ labels: ["trigger:auto-dispatch", "client"] }))).toBe("Auto-dispatch");
    expect(taskTriggerLabel(task({ labels: ["trigger:scheduled", "schedule:daily"] }))).toBe("Scheduled Daily");
    expect(taskUserLabels(["trigger:scheduled", "schedule:daily", "client", "QA"])).toEqual(["client", "QA"]);
  });

  it("sorts Kanban cards by priority before newest update time", () => {
    const highPriority = task({ id: "high", priority: 1, updatedAt: "2026-06-14T10:00:00.000Z" });
    const lowerPriority = task({ id: "low", priority: 5, updatedAt: "2026-06-14T12:00:00.000Z" });
    const newest = task({ id: "newest", updatedAt: "2026-06-14T12:00:00.000Z" });
    const older = task({ id: "older", updatedAt: "2026-06-14T10:00:00.000Z" });

    expect([lowerPriority, older, newest, highPriority].sort(compareKanbanTasks).map((item) => item.id)).toEqual([
      "high",
      "low",
      "newest",
      "older",
    ]);
  });
});

function task(input: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "LOCAL-1",
    title: "Ship local task",
    state: "todo",
    labels: [],
    blockedBy: [],
    sourceKind: "manual",
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T09:00:00.000Z",
    ...input,
  };
}
