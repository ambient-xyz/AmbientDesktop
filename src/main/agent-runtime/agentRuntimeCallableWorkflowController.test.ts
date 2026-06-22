import { describe, expect, it, vi } from "vitest";

import {
  CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
} from "../../shared/callableWorkflowTaskGuards";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  AgentRuntimeCallableWorkflowController,
  type AgentRuntimeCallableWorkflowControllerOptions,
} from "./agentRuntimeCallableWorkflowController";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";

describe("AgentRuntimeCallableWorkflowController", () => {
  it("starts callable workflow tasks through the injected execution wrapper", () => {
    const workspace = workspaceState();
    const execute = vi.fn(async () => undefined);
    const controller = createController({
      store: callableWorkflowStore({ current: callableWorkflowTask({ id: "task-1" }), workspace }),
      executeCallableWorkflowTaskForThread: execute,
    });

    controller.startTaskForThread("thread-1", "task-1", workspace);

    expect(execute).toHaveBeenCalledWith("thread-1", "task-1", workspace);
  });

  it("cancels Symphony launch children after canceling eligible callable workflow tasks", async () => {
    const current = callableWorkflowTask({
      id: "task-1",
      status: "compiling",
      sourceKind: "symphony_recipe",
      patternGraphSnapshot: { nodes: [{ childRunId: "child-1" }] } as unknown as CallableWorkflowTaskSummary["patternGraphSnapshot"],
    });
    const canceled = callableWorkflowTask({ id: "task-1", status: "canceled" });
    const cleanup = vi.fn(async () => undefined);
    const controller = createController({
      store: callableWorkflowStore({ current, canceled }),
      cancelCallableWorkflowSymphonyChildWait: cleanup,
    });

    await expect(controller.cancelTask({
      taskId: "task-1",
      reason: "Stop this workflow.",
    })).resolves.toBe(canceled);

    expect(cleanup).toHaveBeenCalledWith(current, "Stop this workflow.");
  });

  it("resumes pre-compile child-wait pauses through the injected execution wrapper", async () => {
    const workspace = workspaceState();
    const resumed = callableWorkflowTask({ id: "task-1", status: "running" });
    let current = callableWorkflowTask({
      id: "task-1",
      status: "paused",
      parentThreadId: "parent-thread",
      runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
    });
    const execute = vi.fn(async () => {
      current = resumed;
    });
    const store = callableWorkflowStore({
      get current() {
        return current;
      },
      workspace,
    });
    const controller = createController({
      store,
      executeCallableWorkflowTaskForThread: execute,
    });

    await expect(controller.resumeTask({ taskId: "task-1" })).resolves.toBe(resumed);

    expect(execute).toHaveBeenCalledWith("parent-thread", "task-1", workspace);
  });
});

function createController(
  overrides: Partial<AgentRuntimeCallableWorkflowControllerOptions> = {},
): AgentRuntimeCallableWorkflowController {
  const store = overrides.store ?? callableWorkflowStore({ current: callableWorkflowTask({ id: "task-1" }) });
  return new AgentRuntimeCallableWorkflowController({
    store,
    browser: undefined,
    permissionRequester: { request: vi.fn() },
    pluginHost: {
      enabledCodexPlugins: vi.fn(async () => []),
      buildCodexPluginMcpToolRegistrations: vi.fn(async () => []),
      listRegistry: vi.fn(async () => ({ plugins: [], capabilities: [], sources: [], errors: [], sourceNotes: [] })),
      callCodexPluginMcpTool: vi.fn(),
    },
    activeRunIds: new Map(),
    taskAbortControllers: new Map(),
    runTaskIds: new Map(),
    getFeatureFlagSnapshot: () => ({ generatedAt: "2026-06-21T00:00:00.000Z" }) as AgentRuntimeCallableWorkflowControllerOptions["getFeatureFlagSnapshot"] extends () => infer T ? T : never,
    ensurePluginMcpToolTrusted: vi.fn(async () => true),
    executeCallableWorkflowTaskForThread: vi.fn(async () => undefined),
    cancelCallableWorkflowSymphonyChildWait: vi.fn(async () => undefined),
    launchWorkflowSubagents: vi.fn(async () => undefined),
    emitCallableWorkflowTaskUpdated: vi.fn(),
    emit: vi.fn(),
    ...overrides,
  });
}

function callableWorkflowStore(input: {
  current: CallableWorkflowTaskSummary;
  canceled?: CallableWorkflowTaskSummary;
  workspace?: WorkspaceState;
}): ProjectStore {
  return {
    getCallableWorkflowTask: vi.fn(() => input.current),
    cancelCallableWorkflowTask: vi.fn(() => input.canceled ?? input.current),
    recordCallableWorkflowTaskControl: vi.fn(),
    failCallableWorkflowTask: vi.fn(() => input.current),
    getWorkspace: vi.fn(() => input.workspace ?? workspaceState()),
  } as unknown as ProjectStore;
}

function callableWorkflowTask(input: Partial<CallableWorkflowTaskSummary> & { id: string }): CallableWorkflowTaskSummary {
  return {
    parentThreadId: "thread-1",
    sourceKind: "workflow_recording",
    status: "queued",
    ...input,
  } as unknown as CallableWorkflowTaskSummary;
}

function workspaceState(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
  } as WorkspaceState;
}
