import { describe, expect, it, vi } from "vitest";

import type { SymphonyParentModePolicy, SymphonyParentModeVerifiedLaunch } from "./agentRuntimeSymphonyParentMode";
import { SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR } from "./agentRuntimeSymphonyParentMode";
import { createRuntimeSendSessionLifecycle } from "./runtimeSendSessionLifecycle";
import type { RuntimeSessionCleanupSession } from "./runtimeSessionCleanup";

const policy: SymphonyParentModePolicy = {
  enabled: true,
  reason: "symphony-composer-run-once",
  launchRequirement: "required_this_turn",
  directExecutionPolicy: "deny_substantive_tools",
  expectedWorkflowToolName: "run_workflow",
  expectedWorkflowSourceKind: "symphony_recipe",
  expectedPatternId: "parallel-build",
};

describe("createRuntimeSendSessionLifecycle", () => {
  it("cleans up the current session and clears a matching persisted session file", () => {
    const dispose = vi.fn();
    const removeActiveSessionIfCurrent = vi.fn(() => true);
    const clearThreadPiSessionFile = vi.fn();
    const session: RuntimeSessionCleanupSession = { sessionFile: "/tmp/session.json", dispose };

    const lifecycle = createRuntimeSendSessionLifecycle({
      threadId: "thread-1",
      runId: "run-1",
      getSession: () => session,
      removeActiveSessionIfCurrent,
      usesDedicatedReviewSession: false,
      currentThreadPiSessionFile: () => "/tmp/session.json",
      clearThreadPiSessionFile,
      listCallableWorkflowTasksForParentRun: () => [],
    });

    expect(lifecycle.cleanupCurrentSession({ clearPersistedSessionFileIfCurrent: true })).toEqual({
      removedActiveSession: true,
      disposedSession: true,
      disposeFailed: false,
      clearedPersistedSessionFile: true,
    });
    expect(removeActiveSessionIfCurrent).toHaveBeenCalledWith(session);
    expect(dispose).toHaveBeenCalled();
    expect(clearThreadPiSessionFile).toHaveBeenCalledWith("/tmp/session.json");
  });

  it("tracks verified Symphony launches and preserves the stored launch during later refreshes", () => {
    const launchTask = {
      id: "task-1",
      parentThreadId: "thread-1",
      parentRunId: "run-1",
      toolName: "run_workflow",
      sourceKind: "symphony_recipe",
    };
    let tasks = [launchTask];
    const lifecycle = createRuntimeSendSessionLifecycle({
      threadId: "thread-1",
      runId: "run-1",
      getSession: () => undefined,
      removeActiveSessionIfCurrent: () => false,
      usesDedicatedReviewSession: false,
      currentThreadPiSessionFile: () => undefined,
      clearThreadPiSessionFile: vi.fn(),
      symphonyParentModePolicy: policy,
      listCallableWorkflowTasksForParentRun: () => tasks,
    });

    const verifiedLaunch = lifecycle.resolveAndStoreCurrentSymphonyParentModeVerifiedLaunch();
    expect(verifiedLaunch).toEqual({
      parentThreadId: "thread-1",
      parentRunId: "run-1",
      taskId: "task-1",
      toolName: "run_workflow",
      sourceKind: "symphony_recipe",
    });

    tasks = [];
    expect(lifecycle.refreshStoredSymphonyParentModeVerifiedLaunch()).toEqual(verifiedLaunch);
    expect(lifecycle.currentSymphonyParentModeVerifiedLaunch()).toEqual(verifiedLaunch);
    expect(() => lifecycle.assertRequiredSymphonyParentModeLaunch()).not.toThrow();
  });

  it("throws when Symphony parent mode required a launch but none was verified", () => {
    const lifecycle = createRuntimeSendSessionLifecycle({
      threadId: "thread-1",
      runId: "run-1",
      getSession: () => undefined,
      removeActiveSessionIfCurrent: () => false,
      usesDedicatedReviewSession: false,
      currentThreadPiSessionFile: () => undefined,
      clearThreadPiSessionFile: vi.fn(),
      symphonyParentModePolicy: policy,
      listCallableWorkflowTasksForParentRun: () => [],
    });

    expect(() => lifecycle.assertRequiredSymphonyParentModeLaunch()).toThrow(SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR);
  });

  it("accepts an initial carried Symphony launch when no current run task remains", () => {
    const initialLaunch: SymphonyParentModeVerifiedLaunch = {
      parentThreadId: "thread-1",
      parentRunId: "previous-run",
      taskId: "task-previous",
      toolName: "run_workflow",
      sourceKind: "symphony_recipe",
    };
    const lifecycle = createRuntimeSendSessionLifecycle({
      threadId: "thread-1",
      runId: "run-1",
      getSession: () => undefined,
      removeActiveSessionIfCurrent: () => false,
      usesDedicatedReviewSession: false,
      currentThreadPiSessionFile: () => undefined,
      clearThreadPiSessionFile: vi.fn(),
      symphonyParentModePolicy: policy,
      initialSymphonyParentModeVerifiedLaunch: initialLaunch,
      listCallableWorkflowTasksForParentRun: () => [],
    });

    expect(lifecycle.resolveAndStoreCurrentSymphonyParentModeVerifiedLaunch()).toBe(initialLaunch);
  });
});
