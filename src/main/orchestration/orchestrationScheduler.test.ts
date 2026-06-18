import { describe, expect, it } from "vitest";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import { parseWorkflowMarkdown } from "../workflow/workflow";
import { claimSelectedTasks, selectDispatchableTasks } from "./orchestrationScheduler";

function config(markdown = "---\n---\nPrompt") {
  return parseWorkflowMarkdown(markdown, "/repo/WORKFLOW.md").config;
}

function task(overrides: Partial<OrchestrationTask>): OrchestrationTask {
  return {
    id: overrides.id ?? "task-1",
    identifier: overrides.identifier ?? "LOCAL-1",
    title: overrides.title ?? "Task",
    state: overrides.state ?? "todo",
    labels: [],
    blockedBy: [],
    sourceKind: "local",
    createdAt: overrides.createdAt ?? "2026-04-29T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectDispatchableTasks", () => {
  it("sorts eligible tasks by priority, age, then identifier", () => {
    const tasks = [
      task({ id: "later", identifier: "LOCAL-3", priority: undefined, createdAt: "2026-04-29T00:00:00.000Z" }),
      task({ id: "urgent-newer", identifier: "LOCAL-2", priority: 1, createdAt: "2026-04-29T00:01:00.000Z" }),
      task({ id: "urgent-older", identifier: "LOCAL-1", priority: 1, createdAt: "2026-04-29T00:00:00.000Z" }),
    ];

    expect(selectDispatchableTasks(tasks, config()).selected.map((candidate) => candidate.id)).toEqual(["urgent-older"]);
  });

  it("rejects inactive, terminal, claimed, running, and retry-queued tasks", () => {
    const tasks = [
      task({ id: "inactive", identifier: "LOCAL-1", state: "backlog" }),
      task({ id: "terminal", identifier: "LOCAL-2", state: "done" }),
      task({ id: "claimed", identifier: "LOCAL-3" }),
      task({ id: "running", identifier: "LOCAL-4" }),
      task({ id: "retry", identifier: "LOCAL-5" }),
    ];

    const result = selectDispatchableTasks(tasks, config(), {
      claimedTaskIds: ["claimed"],
      runningTaskIds: ["running"],
      retryQueuedTaskIds: ["retry"],
    });

    expect(result.selected).toEqual([]);
    expect(Object.fromEntries(result.rejected.map((entry) => [entry.task.id, entry.reason]))).toEqual({
      inactive: "inactive-state",
      terminal: "terminal-state",
      claimed: "already-claimed",
      running: "already-running",
      retry: "retry-queued",
    });
  });

  it("blocks tasks until blockers are successfully terminal or in review states", () => {
    const blocker = task({ id: "a", identifier: "LOCAL-1", state: "todo" });
    const blocked = task({ id: "b", identifier: "LOCAL-2", blockedBy: ["LOCAL-1"] });
    const readyAfterReview = task({ id: "c", identifier: "LOCAL-3", blockedBy: ["LOCAL-4"] });
    const reviewBlocker = task({ id: "d", identifier: "LOCAL-4", state: "review" });

    const result = selectDispatchableTasks([blocked, blocker, readyAfterReview, reviewBlocker], config());

    expect(result.rejected.find((entry) => entry.task.id === "b")?.reason).toBe("blocked");
    expect(result.selected.map((candidate) => candidate.id)).toEqual(["a"]);
  });

  it("does not treat canceled or duplicate blockers as dependency satisfaction", () => {
    const canceledBlocker = task({ id: "a", identifier: "LOCAL-1", state: "canceled" });
    const duplicateBlocker = task({ id: "b", identifier: "LOCAL-2", state: "duplicate" });
    const blockedByCanceled = task({ id: "c", identifier: "LOCAL-3", blockedBy: ["LOCAL-1"] });
    const blockedByDuplicate = task({ id: "d", identifier: "LOCAL-4", blockedBy: ["LOCAL-2"] });

    const result = selectDispatchableTasks([blockedByCanceled, blockedByDuplicate, canceledBlocker, duplicateBlocker], config());

    expect(result.selected).toEqual([]);
    expect(result.rejected.find((entry) => entry.task.id === "c")?.reason).toBe("blocked");
    expect(result.rejected.find((entry) => entry.task.id === "d")?.reason).toBe("blocked");
  });

  it("respects global and per-state concurrency caps", () => {
    const workflow = config(`---
orchestration:
  max_concurrent_agents: 3
  max_concurrent_agents_by_state:
    ready: 1
---
Prompt`);
    const tasks = [
      task({ id: "running-ready", identifier: "LOCAL-1", state: "ready" }),
      task({ id: "ready-2", identifier: "LOCAL-2", state: "ready" }),
      task({ id: "todo-1", identifier: "LOCAL-3", state: "todo" }),
      task({ id: "todo-2", identifier: "LOCAL-4", state: "todo" }),
      task({ id: "todo-3", identifier: "LOCAL-5", state: "todo" }),
    ];

    const result = selectDispatchableTasks(tasks, workflow, {
      claimedTaskIds: [],
      runningTaskIds: ["running-ready"],
      retryQueuedTaskIds: [],
    });

    expect(result.availableSlots).toBe(2);
    expect(result.rejected.find((entry) => entry.task.id === "ready-2")?.reason).toBe("state-concurrency");
    expect(result.selected.map((candidate) => candidate.id)).toEqual(["todo-1", "todo-2"]);
    expect(result.rejected.find((entry) => entry.task.id === "todo-3")?.reason).toBe("global-concurrency");
  });
});

describe("claimSelectedTasks", () => {
  it("adds selected task IDs without dropping existing runtime state", () => {
    expect(
      claimSelectedTasks(
        { claimedTaskIds: ["existing"], runningTaskIds: ["running"], retryQueuedTaskIds: ["retry"] },
        [task({ id: "next" })],
      ),
    ).toEqual({
      claimedTaskIds: ["existing", "next"],
      runningTaskIds: ["running"],
      retryQueuedTaskIds: ["retry"],
    });
  });
});
