import { describe, expect, it } from "vitest";

import type { OrchestrationTask } from "../../shared/types";
import {
  localTaskCreateInput,
  localTaskDropUpdateInput,
  localTaskEditInput,
} from "./AutomationsLocalTaskController";

describe("Automations local task controller", () => {
  it("builds the create task IPC input from the local task form state", () => {
    expect(
      localTaskCreateInput({
        title: "  Ship task controller  ",
        description: "  Move local task orchestration.  ",
        priorityInput: "7",
        labelsInput: "client, qa, client",
        initialState: "ready",
        triggerMode: "scheduled",
        schedulePreset: "advanced",
        scheduleExpression: "15 8 * * 1",
        projectPath: "/workspace/app",
      }),
    ).toEqual({
      kind: "ready",
      input: {
        title: "Ship task controller",
        description: "Move local task orchestration.",
        state: "ready",
        priority: 7,
        labels: ["trigger:scheduled", "schedule:15 8 * * 1", "client", "qa"],
        projectPath: "/workspace/app",
      },
    });
  });

  it("preserves the existing blank-title and invalid-priority behavior", () => {
    const baseInput = {
      description: "",
      priorityInput: "",
      labelsInput: "",
      initialState: "todo",
      triggerMode: "manual" as const,
      schedulePreset: "daily" as const,
      scheduleExpression: "0 9 * * *",
    };

    expect(localTaskCreateInput({ ...baseInput, title: "   " })).toEqual({ kind: "skip" });
    expect(localTaskCreateInput({ ...baseInput, title: "Ready", priorityInput: "1000" })).toEqual({
      kind: "error",
      error: "Priority must be a number from 0 to 999.",
    });
  });

  it("builds trimmed edit input only when the card changed", () => {
    const task = localTask({ title: "Existing title", description: "Existing description" });

    expect(localTaskEditInput(task, " Existing title ", " Existing description ", false)).toEqual({ kind: "skip" });
    expect(localTaskEditInput(task, " Updated title ", " Updated description ", false)).toEqual({
      kind: "ready",
      input: {
        id: "task-1",
        title: "Updated title",
        description: "Updated description",
      },
    });
  });

  it("returns a drop update only when a task moves to a different state", () => {
    const tasks = [localTask({ id: "task-1", state: "todo" }), localTask({ id: "task-2", state: "ready" })];

    expect(localTaskDropUpdateInput(tasks, undefined, "ready")).toBeUndefined();
    expect(localTaskDropUpdateInput(tasks, "missing", "ready")).toBeUndefined();
    expect(localTaskDropUpdateInput(tasks, "task-2", "ready")).toBeUndefined();
    expect(localTaskDropUpdateInput(tasks, "task-1", "ready")).toEqual({ id: "task-1", state: "ready" });
  });
});

function localTask(input: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "LOCAL-1",
    title: "Local task",
    state: "todo",
    labels: [],
    blockedBy: [],
    sourceKind: "manual",
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T09:00:00.000Z",
    ...input,
  };
}
