import { describe, expect, it, vi } from "vitest";
import type { CallableWorkflowTaskSummary, DesktopEvent } from "../../shared/types";
import type { CallableWorkflowRunnerStore } from "../callable-workflow/callableWorkflowRunner";
import {
  cancelAgentRuntimeCallableWorkflowTask,
  callableWorkflowTaskAbortController,
  createAgentRuntimeCallableWorkflowRunnerStore,
  createAgentRuntimeCallableWorkflowRuntimeBridge,
  pauseAgentRuntimeCallableWorkflowTask,
  startAgentRuntimeCallableWorkflowTaskForThread,
  type AgentRuntimeCallableWorkflowTaskControlStore,
  type AgentRuntimeCallableWorkflowTaskStarterStore,
} from "./agentRuntimeCallableWorkflowExecution";
import { WorkflowManualPausedError } from "../workflow/workflowAgentRuntime";

describe("callableWorkflowTaskAbortController", () => {
  it("resolves task controllers directly before falling back through workflow run ids", () => {
    const direct = new AbortController();
    const fallback = new AbortController();
    const taskAbortControllers = new Map([
      ["task-direct", direct],
      ["task-from-run", fallback],
    ]);
    const runTaskIds = new Map([["run-1", "task-from-run"]]);

    expect(callableWorkflowTaskAbortController(
      { id: "task-direct", workflowRunId: "run-1" } as CallableWorkflowTaskSummary,
      taskAbortControllers,
      runTaskIds,
    )).toBe(direct);
    expect(callableWorkflowTaskAbortController(
      { id: "task-missing-direct", workflowRunId: "run-1" } as CallableWorkflowTaskSummary,
      taskAbortControllers,
      runTaskIds,
    )).toBe(fallback);
    expect(callableWorkflowTaskAbortController(
      { id: "task-missing", workflowRunId: "run-missing" } as CallableWorkflowTaskSummary,
      taskAbortControllers,
      runTaskIds,
    )).toBeUndefined();
  });
});

describe("createAgentRuntimeCallableWorkflowRuntimeBridge", () => {
  it("tracks task abort controllers and clears run task ids for a task", () => {
    const emittedTasks: CallableWorkflowTaskSummary[] = [];
    const emittedEvents: DesktopEvent[] = [];
    const taskAbortControllers = new Map<string, AbortController>();
    const runTaskIds = new Map([
      ["run-1", "task-1"],
      ["run-2", "task-2"],
      ["run-3", "task-1"],
    ]);
    const bridge = createAgentRuntimeCallableWorkflowRuntimeBridge({
      taskAbortControllers,
      runTaskIds,
      emitCallableWorkflowTaskUpdated: (updatedTask) => emittedTasks.push(updatedTask),
      emit: (event) => emittedEvents.push(event),
    });
    const controller = new AbortController();

    bridge.setTaskAbortController("task-1", controller);
    expect(taskAbortControllers.get("task-1")).toBe(controller);
    bridge.deleteTaskAbortController("task-1");
    expect(taskAbortControllers.has("task-1")).toBe(false);

    bridge.setRunTaskId("run-4", "task-3");
    bridge.deleteRunTaskIdsForTask("task-1");
    expect([...runTaskIds.entries()]).toEqual([
      ["run-2", "task-2"],
      ["run-4", "task-3"],
    ]);

    bridge.emitCallableWorkflowTaskUpdated(task("updated"));
    bridge.emit({ type: "workflow-updated" });
    expect(emittedTasks).toEqual([task("updated")]);
    expect(emittedEvents).toEqual([{ type: "workflow-updated" }]);
  });
});

describe("createAgentRuntimeCallableWorkflowRunnerStore", () => {
  it("delegates runner store reads without emitting task updates", () => {
    const harness = createHarness();

    expect(harness.runnerStore.getCallableWorkflowTask("task-1")).toEqual(task("task-1"));

    expect(harness.store.getCallableWorkflowTask).toHaveBeenCalledWith("task-1");
    expect(harness.emittedTasks).toEqual([]);
  });

  it("emits task updates after runner store mutations", () => {
    const harness = createHarness();

    expect(harness.runnerStore.beginCallableWorkflowTaskCompilerHandoff("task-1", {
      createdAt: "2026-06-13T00:00:00.000Z",
    })).toEqual({
      task: task("handoff"),
      handoffPlan: { compiler: { toolName: "tool" } },
    });
    expect(harness.runnerStore.linkCallableWorkflowTaskArtifact({
      id: "task-1",
      workflowArtifactId: "artifact-1",
    })).toEqual(task("linked"));
    expect(harness.runnerStore.markCallableWorkflowTaskRunStarted({
      id: "task-1",
      workflowRunId: "run-1",
    })).toEqual(task("started"));
    expect(harness.runnerStore.markCallableWorkflowTaskRunFinished({
      id: "task-1",
      workflowRunId: "run-1",
      runStatus: "succeeded",
    })).toEqual(task("finished"));
    expect(harness.runnerStore.failCallableWorkflowTask({
      id: "task-1",
      errorMessage: "failed",
    })).toEqual(task("failed"));

    expect(harness.emittedTasks).toEqual([
      task("handoff"),
      task("linked"),
      task("started"),
      task("finished"),
      task("failed"),
    ]);
  });
});

describe("cancelAgentRuntimeCallableWorkflowTask", () => {
  it("aborts an active runner, cancels the task, and emits workflow updates", () => {
    const controller = new AbortController();
    const harness = createTaskControlHarness({
      currentTask: task("task-1", { status: "running" }),
      canceledTask: task("task-1", { status: "canceled" }),
      taskAbortControllers: new Map([["task-1", controller]]),
    });

    expect(cancelAgentRuntimeCallableWorkflowTask({
      taskId: "task-1",
      reason: "  stop this workflow  ",
    }, harness.options)).toEqual(task("task-1", { status: "canceled" }));

    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBeInstanceOf(Error);
    expect((controller.signal.reason as Error).message).toBe("stop this workflow");
    expect(harness.store.cancelCallableWorkflowTask).toHaveBeenCalledWith({
      id: "task-1",
      reason: "  stop this workflow  ",
    });
    expect(harness.emittedTasks).toEqual([task("task-1", { status: "canceled" })]);
    expect(harness.emittedEvents).toEqual([{ type: "workflow-updated" }]);
  });
});

describe("pauseAgentRuntimeCallableWorkflowTask", () => {
  it("returns paused tasks without recording control or emitting updates", () => {
    const paused = task("task-paused", { status: "paused" });
    const harness = createTaskControlHarness({ currentTask: paused });

    expect(pauseAgentRuntimeCallableWorkflowTask({ taskId: "task-paused" }, harness.options)).toBe(paused);

    expect(harness.store.recordCallableWorkflowTaskControl).not.toHaveBeenCalled();
    expect(harness.emittedTasks).toEqual([]);
    expect(harness.emittedEvents).toEqual([]);
  });

  it("records pause control, aborts with a manual pause error, and emits workflow updates", () => {
    const controller = new AbortController();
    const current = task("task-running", {
      status: "running",
      workflowRunId: "run-1",
    });
    const harness = createTaskControlHarness({
      currentTask: current,
      taskAbortControllers: new Map([["task-from-run", controller]]),
      runTaskIds: new Map([["run-1", "task-from-run"]]),
    });

    expect(pauseAgentRuntimeCallableWorkflowTask({
      taskId: "task-running",
      reason: "  wait here  ",
    }, harness.options)).toBe(current);

    expect(harness.store.recordCallableWorkflowTaskControl).toHaveBeenCalledWith({
      id: "task-running",
      action: "pause_requested",
      reason: "wait here",
      workflowRunId: "run-1",
    });
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBeInstanceOf(WorkflowManualPausedError);
    expect((controller.signal.reason as WorkflowManualPausedError).message).toBe("wait here");
    expect(harness.emittedTasks).toEqual([current]);
    expect(harness.emittedEvents).toEqual([{ type: "workflow-updated" }]);
  });

  it("rejects pause requests without an active linked runner", () => {
    const harness = createTaskControlHarness({
      currentTask: task("task-running", {
        status: "running",
        workflowRunId: "run-1",
      }),
    });

    expect(() => pauseAgentRuntimeCallableWorkflowTask({ taskId: "task-running" }, harness.options))
      .toThrow("is not attached to an active workflow runner");
  });
});

describe("startAgentRuntimeCallableWorkflowTaskForThread", () => {
  it("starts the callable workflow runner without emitting task failure updates when execution succeeds", async () => {
    const harness = createTaskStarterHarness({
      executeCallableWorkflowTaskForThread: vi.fn(() => Promise.resolve()),
    });

    startAgentRuntimeCallableWorkflowTaskForThread("thread-1", "task-1", workspace(), harness.options);
    await flushPromises();

    expect(harness.executeCallableWorkflowTaskForThread).toHaveBeenCalledWith("thread-1", "task-1", workspace());
    expect(harness.store.failCallableWorkflowTask).not.toHaveBeenCalled();
    expect(harness.emittedTasks).toEqual([]);
    expect(harness.emittedEvents).toEqual([]);
  });

  it("marks the task failed and emits workflow updates after background execution rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = createTaskStarterHarness({
      executeCallableWorkflowTaskForThread: vi.fn(() => Promise.reject(new Error("runner exploded"))),
      failedTask: task("task-1", { status: "failed", errorMessage: "runner exploded" }),
    });

    try {
      startAgentRuntimeCallableWorkflowTaskForThread("thread-1", "task-1", workspace(), harness.options);
      await flushPromises();

      expect(warn).toHaveBeenCalledWith("Callable workflow runner bridge failed for task task-1: runner exploded");
      expect(harness.store.failCallableWorkflowTask).toHaveBeenCalledWith({
        id: "task-1",
        errorMessage: "runner exploded",
      });
      expect(harness.emittedTasks).toEqual([task("task-1", {
        status: "failed",
        errorMessage: "runner exploded",
      })]);
      expect(harness.emittedEvents).toEqual([{ type: "workflow-updated" }]);
    } finally {
      warn.mockRestore();
    }
  });

  it("preserves the background failure when failing the task is no longer valid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = createTaskStarterHarness({
      executeCallableWorkflowTaskForThread: vi.fn(() => Promise.reject("already terminal")),
      failCallableWorkflowTask: vi.fn(() => {
        throw new Error("task already terminal");
      }),
    });

    try {
      startAgentRuntimeCallableWorkflowTaskForThread("thread-1", "task-1", workspace(), harness.options);
      await flushPromises();

      expect(warn).toHaveBeenCalledWith("Callable workflow runner bridge failed for task task-1: already terminal");
      expect(harness.store.failCallableWorkflowTask).toHaveBeenCalledWith({
        id: "task-1",
        errorMessage: "already terminal",
      });
      expect(harness.emittedTasks).toEqual([]);
      expect(harness.emittedEvents).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});

function createHarness() {
  const emittedTasks: CallableWorkflowTaskSummary[] = [];
  const store: CallableWorkflowRunnerStore = {
    getCallableWorkflowTask: vi.fn((id) => task(id)),
    beginCallableWorkflowTaskCompilerHandoff: vi.fn(() => ({
      task: task("handoff"),
      handoffPlan: { compiler: { toolName: "tool" } } as any,
    })),
    linkCallableWorkflowTaskArtifact: vi.fn(() => task("linked")),
    markCallableWorkflowTaskRunStarted: vi.fn(() => task("started")),
    markCallableWorkflowTaskRunFinished: vi.fn(() => task("finished")),
    failCallableWorkflowTask: vi.fn(() => task("failed")),
  };
  return {
    store,
    runnerStore: createAgentRuntimeCallableWorkflowRunnerStore(store, (updatedTask) => emittedTasks.push(updatedTask)),
    emittedTasks,
  };
}

function createTaskStarterHarness(input: {
  executeCallableWorkflowTaskForThread: (threadId: string, taskId: string, workspace: any) => Promise<void>;
  failedTask?: CallableWorkflowTaskSummary;
  failCallableWorkflowTask?: AgentRuntimeCallableWorkflowTaskStarterStore["failCallableWorkflowTask"];
}) {
  const emittedTasks: CallableWorkflowTaskSummary[] = [];
  const emittedEvents: DesktopEvent[] = [];
  const store: AgentRuntimeCallableWorkflowTaskStarterStore = {
    failCallableWorkflowTask: input.failCallableWorkflowTask ?? vi.fn(() => input.failedTask ?? task("failed")),
  };
  return {
    store,
    executeCallableWorkflowTaskForThread: input.executeCallableWorkflowTaskForThread,
    emittedTasks,
    emittedEvents,
    options: {
      store,
      executeCallableWorkflowTaskForThread: input.executeCallableWorkflowTaskForThread,
      emitCallableWorkflowTaskUpdated: (updatedTask: CallableWorkflowTaskSummary) => emittedTasks.push(updatedTask),
      emit: (event: DesktopEvent) => emittedEvents.push(event),
    },
  };
}

function createTaskControlHarness(input: {
  currentTask: CallableWorkflowTaskSummary;
  canceledTask?: CallableWorkflowTaskSummary;
  taskAbortControllers?: Map<string, AbortController>;
  runTaskIds?: Map<string, string>;
}) {
  const emittedTasks: CallableWorkflowTaskSummary[] = [];
  const emittedEvents: DesktopEvent[] = [];
  const store: AgentRuntimeCallableWorkflowTaskControlStore = {
    getCallableWorkflowTask: vi.fn(() => input.currentTask),
    cancelCallableWorkflowTask: vi.fn(() => input.canceledTask ?? input.currentTask),
    recordCallableWorkflowTaskControl: vi.fn(),
  };
  return {
    store,
    emittedTasks,
    emittedEvents,
    options: {
      store,
      taskAbortControllers: input.taskAbortControllers ?? new Map(),
      runTaskIds: input.runTaskIds ?? new Map(),
      emitCallableWorkflowTaskUpdated: (updatedTask: CallableWorkflowTaskSummary) => emittedTasks.push(updatedTask),
      emit: (event: DesktopEvent) => emittedEvents.push(event),
    },
  };
}

function task(id: string, overrides: Partial<CallableWorkflowTaskSummary> = {}): CallableWorkflowTaskSummary {
  return { id, ...overrides } as CallableWorkflowTaskSummary;
}

function workspace(): any {
  return { path: "/workspace", name: "Workspace" };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
