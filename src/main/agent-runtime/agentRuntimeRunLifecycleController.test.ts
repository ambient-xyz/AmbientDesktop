import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ThreadGoal } from "../../shared/threadTypes";
import type { PluginMcpRuntimeSnapshot } from "./agentRuntimePluginsFacade";
import {
  AgentRuntimeRunLifecycleController,
  type AgentRuntimeRunLifecycleControllerOptions,
} from "./agentRuntimeRunLifecycleController";
import type { RuntimeAbortContextActiveRun } from "./runtimeAbortContext";
import { describe, expect, it, vi } from "vitest";

interface AgentRuntimeRunLifecycleControllerTestOptions
  extends Partial<AgentRuntimeRunLifecycleControllerOptions> {
  events?: DesktopEvent[];
}

describe("AgentRuntimeRunLifecycleController", () => {
  it("aborts active runs, cascades child work, pauses active goals, and emits idle", async () => {
    const activeRun = activeRunStub();
    const activeRuns = new Map<string, RuntimeAbortContextActiveRun>([["thread-1", activeRun]]);
    const activeRunIds = new Map([["thread-1", "run-1"]]);
    const getThreadGoal = vi.fn(() => threadGoal("thread-1", "active"));
    const markThreadGoalStatus = vi.fn(() => threadGoal("thread-1", "paused"));
    const cancelSubagentRunForStoppedChildThread = vi.fn();
    const cascadeSubagentsForStoppedParentRun = vi.fn(async () => undefined);
    const events: DesktopEvent[] = [];
    const controller = new AgentRuntimeRunLifecycleController(options({
      activeRuns,
      activeRunIds,
      store: {
        getThreadGoal,
        markThreadGoalStatus,
        interruptActiveRuns: vi.fn(),
      } as unknown as AgentRuntimeRunLifecycleControllerOptions["store"],
      subagentStopCascade: {
        cancelSubagentRunForStoppedChildThread,
        cascadeSubagentsForStoppedParentRun,
      },
      events,
    }));

    await controller.abort("thread-1");

    expect(activeRun.abort).toHaveBeenCalledTimes(1);
    expect(cancelSubagentRunForStoppedChildThread).toHaveBeenCalledWith(
      "thread-1",
      "Sub-agent child thread stopped by user.",
    );
    expect(cascadeSubagentsForStoppedParentRun).toHaveBeenCalledWith(
      "thread-1",
      "run-1",
      "Parent run stopped by user.",
    );
    expect(activeRuns.has("thread-1")).toBe(false);
    expect(activeRunIds.has("thread-1")).toBe(false);
    expect(markThreadGoalStatus).toHaveBeenCalledWith("thread-1", "paused", {
      expectedGoalId: "goal-1",
      statusReason: "Paused because the user stopped the active run.",
    });
    expect(events.map((event) => event.type)).toEqual([
      "thread-goal-updated",
      "runtime-activity",
      "run-status",
    ]);
    expect(events[1]).toEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        threadId: "thread-1",
        status: "paused",
        message: "Goal paused because the active run was stopped.",
        goalId: "goal-1",
      }),
    }));
    expect(events[2]).toEqual({ type: "run-status", threadId: "thread-1", status: "idle" });
  });

  it("interrupts all active runs and clears active-run state", () => {
    const firstRun = activeRunStub();
    const secondRun = activeRunStub();
    const activeRuns = new Map<string, RuntimeAbortContextActiveRun>([
      ["thread-1", firstRun],
      ["thread-2", secondRun],
    ]);
    const activeRunIds = new Map([
      ["thread-1", "run-1"],
      ["thread-2", "run-2"],
    ]);
    const interruptActiveRuns = vi.fn();
    const events: DesktopEvent[] = [];
    const controller = new AgentRuntimeRunLifecycleController(options({
      activeRuns,
      activeRunIds,
      store: {
        getThreadGoal: vi.fn((threadId: string) => threadId === "thread-1" ? threadGoal(threadId, "active") : undefined),
        markThreadGoalStatus: vi.fn((threadId: string) => threadGoal(threadId, "paused")),
        interruptActiveRuns,
      } as unknown as AgentRuntimeRunLifecycleControllerOptions["store"],
      events,
    }));

    expect(controller.interruptActiveRuns("workspace switch")).toBe(2);

    expect(interruptActiveRuns).toHaveBeenCalledWith("workspace switch");
    expect(firstRun.detach).toHaveBeenCalledTimes(1);
    expect(secondRun.detach).toHaveBeenCalledTimes(1);
    expect(activeRuns.size).toBe(0);
    expect(activeRunIds.size).toBe(0);
    expect(events).toEqual([
      expect.objectContaining({ type: "thread-goal-updated" }),
      { type: "run-status", threadId: "thread-1", status: "idle" },
      { type: "run-status", threadId: "thread-2", status: "idle" },
    ]);
  });

  it("resets session and plugin runtime state through one lifecycle owner", async () => {
    const activeRuns = new Map<string, RuntimeAbortContextActiveRun>([["thread-1", activeRunStub()]]);
    const activeRunIds = new Map([["thread-1", "run-1"]]);
    const disposeAll = vi.fn();
    const cliState = { clear: vi.fn() };
    const workflowState = { clear: vi.fn() };
    const pluginHost = pluginHostStub();
    const controller = new AgentRuntimeRunLifecycleController(options({
      activeRuns,
      activeRunIds,
      sessions: { disposeAll },
      ambientCliPackageDescriptionState: cliState,
      ambientWorkflowDescriptionState: workflowState,
      pluginHost,
    }));

    controller.resetSessions();
    await Promise.resolve();

    expect(disposeAll).toHaveBeenCalledTimes(1);
    expect(activeRuns.size).toBe(0);
    expect(activeRunIds.size).toBe(0);
    expect(cliState.clear).toHaveBeenCalledTimes(1);
    expect(workflowState.clear).toHaveBeenCalledTimes(1);
    expect(pluginHost.shutdownPluginMcpServers).toHaveBeenCalledTimes(1);

    expect(controller.pluginMcpRuntimeSnapshots()).toEqual([pluginSnapshot("runtime-1")]);
    await expect(controller.restartPluginMcpRuntime("runtime-1")).resolves.toEqual([pluginSnapshot("restart-1")]);
    await expect(controller.stopPluginMcpRuntime("runtime-1")).resolves.toEqual([pluginSnapshot("stop-1")]);
  });
});

function options(
  overrides: AgentRuntimeRunLifecycleControllerTestOptions = {},
): AgentRuntimeRunLifecycleControllerOptions {
  const events: DesktopEvent[] = [];
  return {
    store: {
      getThreadGoal: vi.fn(() => undefined),
      markThreadGoalStatus: vi.fn(() => threadGoal("thread-1", "paused")),
      interruptActiveRuns: vi.fn(),
    } as unknown as AgentRuntimeRunLifecycleControllerOptions["store"],
    sessions: { disposeAll: vi.fn() },
    activeRuns: new Map(),
    activeRunIds: new Map(),
    ambientCliPackageDescriptionState: { clear: vi.fn() },
    ambientWorkflowDescriptionState: { clear: vi.fn() },
    pluginHost: pluginHostStub(),
    subagentStopCascade: {
      cancelSubagentRunForStoppedChildThread: vi.fn(),
      cascadeSubagentsForStoppedParentRun: vi.fn(async () => undefined),
    },
    emit: (event) => events.push(event),
    ...overrides,
    ...(overrides.events ? { emit: (event) => overrides.events!.push(event) } : {}),
  };
}

function activeRunStub(): RuntimeAbortContextActiveRun {
  return {
    abort: vi.fn(async () => undefined),
    detach: vi.fn(),
    queue: vi.fn(async () => undefined),
    settled: Promise.resolve(),
  };
}

function threadGoal(threadId: string, status: ThreadGoal["status"]): ThreadGoal {
  return {
    threadId,
    goalId: "goal-1",
    objective: "Test goal",
    status,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}

function pluginHostStub(): AgentRuntimeRunLifecycleControllerOptions["pluginHost"] {
  return {
    shutdownPluginMcpServers: vi.fn(async () => undefined),
    pluginMcpRuntimeSnapshots: vi.fn(() => [pluginSnapshot("runtime-1")]),
    restartPluginMcpRuntime: vi.fn(async () => [pluginSnapshot("restart-1")]),
    stopPluginMcpRuntime: vi.fn(async () => [pluginSnapshot("stop-1")]),
  };
}

function pluginSnapshot(key: string): PluginMcpRuntimeSnapshot {
  return {
    key,
    pluginId: "plugin.fixture",
    pluginName: "Fixture",
    pluginVersion: "1.0.0",
    pluginFingerprint: "fingerprint",
    serverName: "fixture",
    status: "ready",
    permissionMode: "workspace",
    workspacePath: "/workspace",
    cwd: "/workspace",
    args: [],
    envKeys: [],
    requestCount: 0,
  };
}
