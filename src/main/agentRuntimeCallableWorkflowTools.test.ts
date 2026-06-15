import { describe, expect, it, vi } from "vitest";

import type { AmbientFeatureFlagSnapshot } from "../shared/featureFlags";
import type { CallableWorkflowTaskSummary, SubagentRunSummary, SubagentToolScopeSnapshotSummary, ThreadSummary, WorkflowRecordingLibraryDescription } from "../shared/types";
import type { SubagentToolScopeResolution } from "../shared/subagentToolScope";
import type { CallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import type { CreateCallableWorkflowPiToolDefinitionsOptions } from "./callableWorkflowPiTools";
import {
  callableWorkflowRecordedPlaybooks,
  createAgentRuntimeCallableWorkflowToolExtension,
  createAgentRuntimeCallableWorkflowToolRuntime,
  createCallableWorkflowToolExtension,
  resolveCallableWorkflowCallerProvenance,
  type AgentRuntimeCallableWorkflowToolExtensionStore,
  type AgentRuntimeCallableWorkflowToolRuntimeStore,
  type CallableWorkflowCallerProvenanceStore,
} from "./agentRuntimeCallableWorkflowTools";

type RegisteredTool = { name: string; executionMode?: string; execute?: (...args: any[]) => Promise<any> | any };

describe("createCallableWorkflowToolExtension", () => {
  it("lists recorded workflow playbooks and skips stale descriptions", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const listWorkflowRecordingLibrary = vi.fn(() => [{ id: "kept" }, { id: "stale" }]);
    const describeWorkflowRecording = vi.fn((id: string) => {
      if (id === "stale") throw new Error("missing recording");
      return recordedPlaybook(id);
    });

    try {
      expect(callableWorkflowRecordedPlaybooks({
        listWorkflowRecordingLibrary,
        describeWorkflowRecording,
      }, 12)).toEqual([recordedPlaybook("kept")]);
      expect(warn).toHaveBeenCalledWith("Failed to describe recorded workflow stale for callable workflow registry: missing recording");
    } finally {
      warn.mockRestore();
    }

    expect(listWorkflowRecordingLibrary).toHaveBeenCalledWith({ limit: 12 });
    expect(describeWorkflowRecording).toHaveBeenCalledTimes(2);
  });

  it("skips registration when callable workflow tools are inactive", () => {
    const registeredTools: RegisteredTool[] = [];
    const activeToolNames = vi.fn(() => []);
    const createDefinitions = vi.fn();

    createCallableWorkflowToolExtension({
      initialRecordedWorkflowPlaybooks: [recordedPlaybook("initial")],
      getThread: () => thread(),
      getFeatureFlagSnapshot: () => featureFlags(),
      getParentRun: () => ({ id: "run-1" }),
      enqueueCallableWorkflowTask: () => task(),
      startCallableWorkflowTask: () => undefined,
      getRecordedWorkflowPlaybooks: () => [recordedPlaybook("dynamic")],
      callableWorkflowActiveToolNamesForThread: activeToolNames,
      createCallableWorkflowPiToolDefinitions: createDefinitions,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    expect(activeToolNames).toHaveBeenCalledWith({
      thread: thread(),
      featureFlagSnapshot: featureFlags(),
      recordedWorkflowPlaybooks: [recordedPlaybook("initial")],
      childCallableWorkflowToolNames: [],
    });
    expect(createDefinitions).not.toHaveBeenCalled();
    expect(registeredTools).toEqual([]);
  });

  it("registers callable workflow tools and forwards runtime callbacks", () => {
    const registeredTools: RegisteredTool[] = [];
    let capturedOptions: CreateCallableWorkflowPiToolDefinitionsOptions | undefined;
    const parentRun = { id: "run-1", assistantMessageId: "message-1" };
    const executionPlan = { id: "plan-1" } as unknown as CallableWorkflowExecutionPlan;
    const enqueuedTask = task();
    const startedTasks: unknown[] = [];

    createCallableWorkflowToolExtension({
      initialRecordedWorkflowPlaybooks: [recordedPlaybook("initial")],
      getThread: () => thread(),
      getFeatureFlagSnapshot: () => featureFlags(),
      getParentRun: () => parentRun,
      getCallerProvenance: () => undefined,
      enqueueCallableWorkflowTask: ({ executionPlan: plan }) => {
        expect(plan).toBe(executionPlan);
        return enqueuedTask;
      },
      startCallableWorkflowTask: (input) => {
        startedTasks.push(input);
      },
      getRecordedWorkflowPlaybooks: () => [recordedPlaybook("dynamic")],
      callableWorkflowActiveToolNamesForThread: () => ["callable_fixture"],
      createCallableWorkflowPiToolDefinitions: (options) => {
        capturedOptions = options;
        return [{
          name: "callable_fixture",
          label: "Callable Fixture",
          description: "Fixture callable workflow tool.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          executionMode: "sequential",
        } as any];
      },
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["callable_fixture"]);
    expect(capturedOptions?.getThread()).toEqual(thread());
    expect(capturedOptions?.getFeatureFlagSnapshot()).toEqual(featureFlags());
    expect(capturedOptions?.getChildCallableWorkflowToolNames?.()).toEqual([]);
    expect(capturedOptions?.getParentRun?.()).toEqual(parentRun);
    expect(capturedOptions?.getCallerProvenance?.({
      thread: thread(),
      parentRun,
      toolName: "callable_fixture",
      workflowRunPlan: {} as any,
    })).toBeUndefined();
    expect(capturedOptions?.getRecordedWorkflowPlaybooks?.()).toEqual([recordedPlaybook("dynamic")]);
    expect(capturedOptions?.enqueueCallableWorkflowTask?.({ executionPlan })).toBe(enqueuedTask);
    capturedOptions?.startCallableWorkflowTask?.({
      taskId: enqueuedTask.id,
      executionPlan,
      workflowTask: enqueuedTask,
    });
    expect(startedTasks).toEqual([{
      taskId: enqueuedTask.id,
      executionPlan,
      workflowTask: enqueuedTask,
    }]);
  });

  it("forwards child callable workflow grants to active-name checks and tool creation", () => {
    const registeredTools: RegisteredTool[] = [];
    let capturedOptions: CreateCallableWorkflowPiToolDefinitionsOptions | undefined;

    createCallableWorkflowToolExtension({
      initialRecordedWorkflowPlaybooks: [recordedPlaybook("initial")],
      childCallableWorkflowToolNames: ["ambient_workflow_symphony_map_reduce"],
      getThread: () => thread("subagent_child"),
      getFeatureFlagSnapshot: () => featureFlags(),
      getParentRun: () => ({ id: "child-run", assistantMessageId: "child-message" }),
      getCallerProvenance: () => ({
        kind: "subagent_child_thread",
        threadId: "subagent_child-thread",
        runId: "child-run",
        messageId: "child-message",
        subagentRunId: "subagent-run",
        approval: {
          required: true,
          source: "child_bridge_policy",
          failureHandling: "forward",
          scopeHint: "this_child_thread",
        },
        worktree: {
          required: true,
          isolated: true,
          status: "active",
        },
        nestedFanout: {
          required: true,
          source: "child_bridge_policy",
        },
      }),
      enqueueCallableWorkflowTask: () => task(),
      startCallableWorkflowTask: () => undefined,
      getRecordedWorkflowPlaybooks: () => [recordedPlaybook("dynamic")],
      callableWorkflowActiveToolNamesForThread: (input) => {
        expect(input.thread).toEqual(thread("subagent_child"));
        expect(input.childCallableWorkflowToolNames).toEqual(["ambient_workflow_symphony_map_reduce"]);
        return ["ambient_workflow_symphony_map_reduce"];
      },
      createCallableWorkflowPiToolDefinitions: (options) => {
        capturedOptions = options;
        return [{
          name: "ambient_workflow_symphony_map_reduce",
          label: "Symphony Map-Reduce",
          description: "Fixture callable workflow tool.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          executionMode: "sequential",
        } as any];
      },
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_workflow_symphony_map_reduce"]);
    expect(capturedOptions?.getThread()).toEqual(thread("subagent_child"));
    expect(capturedOptions?.getChildCallableWorkflowToolNames?.()).toEqual(["ambient_workflow_symphony_map_reduce"]);
    expect(capturedOptions?.getCallerProvenance?.({
      thread: thread("subagent_child"),
      parentRun: { id: "child-run", assistantMessageId: "child-message" },
      toolName: "ambient_workflow_symphony_map_reduce",
      workflowRunPlan: {} as any,
    })).toMatchObject({
      kind: "subagent_child_thread",
      subagentRunId: "subagent-run",
      worktree: { isolated: true },
    });
  });
});

describe("createAgentRuntimeCallableWorkflowToolExtension", () => {
  it("assembles callable workflow runtime callbacks for AgentRuntime", () => {
    const registeredTools: RegisteredTool[] = [];
    let capturedOptions: CreateCallableWorkflowPiToolDefinitionsOptions | undefined;
    const enqueuedTask = task();
    const emittedTasks: CallableWorkflowTaskSummary[] = [];
    const startedTasks: unknown[] = [];
    const store = toolExtensionStore({
      thread: {
        id: "child-thread",
        kind: "subagent_child",
        subagentRunId: "subagent-run-1",
        workspacePath: "/workspace",
      },
      subagentRun: {
        id: "subagent-run-1",
        canonicalTaskPath: "parent/child",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
      },
      snapshots: [
        toolScopeSnapshot([{
          source: "callable_workflow",
          id: "callable_fixture",
          piVisible: true,
          requiresApproval: true,
        }]),
      ],
      enqueueCallableWorkflowTask: vi.fn(() => enqueuedTask),
    });

    createAgentRuntimeCallableWorkflowToolExtension({
      threadId: "child-thread",
      workspace: workspace(),
      initialRecordedWorkflowPlaybooks: [recordedPlaybook("initial")],
      childCallableWorkflowToolNames: ["callable_fixture"],
      activeRunIds: new Map([["child-thread", "run-1"]]),
      store,
      getFeatureFlagSnapshot: () => featureFlags(),
      startCallableWorkflowTaskForThread: (threadId, taskId, workspace) => {
        startedTasks.push({ threadId, taskId, workspace });
      },
      emitCallableWorkflowTaskUpdated: (updatedTask) => emittedTasks.push(updatedTask),
      callableWorkflowActiveToolNamesForThread: (input) => {
        expect(input.thread).toEqual({
          id: "child-thread",
          kind: "subagent_child",
          subagentRunId: "subagent-run-1",
          workspacePath: "/workspace",
        });
        expect(input.featureFlagSnapshot).toEqual(featureFlags());
        expect(input.recordedWorkflowPlaybooks).toEqual([recordedPlaybook("initial")]);
        expect(input.childCallableWorkflowToolNames).toEqual(["callable_fixture"]);
        return ["callable_fixture"];
      },
      createCallableWorkflowPiToolDefinitions: (options) => {
        capturedOptions = options;
        return [{
          name: "callable_fixture",
          label: "Callable Fixture",
          description: "Fixture callable workflow tool.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          executionMode: "sequential",
        } as any];
      },
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["callable_fixture"]);
    expect(capturedOptions?.getThread()).toEqual({
      id: "child-thread",
      kind: "subagent_child",
      subagentRunId: "subagent-run-1",
      workspacePath: "/workspace",
    });
    expect(capturedOptions?.getParentRun?.()).toEqual({ id: "run-1", assistantMessageId: "message-1" });
    expect(capturedOptions?.getRecordedWorkflowPlaybooks?.()).toEqual([recordedPlaybook("dynamic")]);
    expect(capturedOptions?.getCallerProvenance?.({
      thread: thread("subagent_child"),
      parentRun: { id: "child-run", assistantMessageId: "child-message" },
      toolName: "callable_fixture",
      workflowRunPlan: launchCardPlan({ approvalFailureHandling: "fail" }) as any,
    })).toMatchObject({
      kind: "subagent_child_thread",
      threadId: "child-thread",
      runId: "child-run",
      approval: {
        required: true,
        source: "child_bridge_policy",
        failureHandling: "fail",
      },
    });

    const executionPlan = { id: "plan-1" } as unknown as CallableWorkflowExecutionPlan;
    expect(capturedOptions?.enqueueCallableWorkflowTask?.({ executionPlan })).toBe(enqueuedTask);
    expect(store.enqueueCallableWorkflowTask).toHaveBeenCalledWith({
      executionPlan,
      featureFlagSnapshot: featureFlags(),
    });
    expect(emittedTasks).toEqual([enqueuedTask]);

    capturedOptions?.startCallableWorkflowTask?.({
      taskId: enqueuedTask.id,
      executionPlan,
      workflowTask: enqueuedTask,
    });
    expect(startedTasks).toEqual([{
      threadId: "child-thread",
      taskId: enqueuedTask.id,
      workspace: workspace(),
    }]);
  });
});

describe("createAgentRuntimeCallableWorkflowToolRuntime", () => {
  it("resolves parent runs from active run ids and falls back to the stored id when the record is unavailable", () => {
    const noRunStore = toolRuntimeStore();
    const noRunRuntime = createToolRuntime({
      activeRunIds: new Map(),
      store: noRunStore,
    });
    expect(noRunRuntime.getParentRun?.()).toBeUndefined();
    expect(noRunStore.getRunRecord).not.toHaveBeenCalled();

    const store = toolRuntimeStore({
      getRunRecord: vi.fn(() => ({ id: "run-1", assistantMessageId: "message-1" })),
    });
    const runtime = createToolRuntime({ store });
    expect(runtime.getParentRun?.()).toEqual({ id: "run-1", assistantMessageId: "message-1" });

    const missingRunStore = toolRuntimeStore({
      getRunRecord: vi.fn(() => {
        throw new Error("missing run");
      }),
    });
    const missingRunRuntime = createToolRuntime({ store: missingRunStore });
    expect(missingRunRuntime.getParentRun?.()).toEqual({ id: "run-1" });
  });

  it("forwards caller provenance, enqueues tasks with current flags, emits updates, and starts tasks in workspace", () => {
    const enqueuedTask = task();
    const store = toolRuntimeStore({
      enqueueCallableWorkflowTask: vi.fn(() => enqueuedTask),
    });
    const emittedTasks: CallableWorkflowTaskSummary[] = [];
    const startedTasks: unknown[] = [];
    const getCallerProvenance = vi.fn(() => undefined);
    const runtime = createToolRuntime({
      store,
      getCallerProvenance,
      startCallableWorkflowTaskForThread: (threadId, taskId, workspace) => {
        startedTasks.push({ threadId, taskId, workspace });
      },
      emitCallableWorkflowTaskUpdated: (updatedTask) => emittedTasks.push(updatedTask),
    });
    const executionPlan = { id: "plan-1" } as unknown as CallableWorkflowExecutionPlan;

    expect(runtime.getCallerProvenance?.({
      thread: thread(),
      parentRun: { id: "run-1" },
      toolName: "callable_fixture",
      workflowRunPlan: {} as any,
    })).toBeUndefined();
    expect(getCallerProvenance).toHaveBeenCalledWith({
      thread: thread(),
      parentRun: { id: "run-1" },
      toolName: "callable_fixture",
      workflowRunPlan: {},
    });
    expect(runtime.enqueueCallableWorkflowTask({ executionPlan })).toBe(enqueuedTask);
    expect(store.enqueueCallableWorkflowTask).toHaveBeenCalledWith({
      executionPlan,
      featureFlagSnapshot: featureFlags(),
    });
    expect(emittedTasks).toEqual([enqueuedTask]);

    runtime.startCallableWorkflowTask({
      taskId: enqueuedTask.id,
      executionPlan,
      workflowTask: enqueuedTask,
    });
    expect(startedTasks).toEqual([{
      threadId: "thread-1",
      taskId: enqueuedTask.id,
      workspace: workspace(),
    }]);
  });
});

describe("resolveCallableWorkflowCallerProvenance", () => {
  it("returns undefined for non-child threads", () => {
    const store = callerProvenanceStore({
      thread: {
        id: "thread-1",
        kind: "chat",
        workspacePath: "/workspace",
      },
    });

    expect(resolveCallableWorkflowCallerProvenance({
      threadId: "thread-1",
      parentRun: { id: "run-1" },
      toolName: "ambient_workflow_ship",
      workflowRunPlan: launchCardPlan(),
    }, store)).toBeUndefined();

    expect(store.getSubagentRun).not.toHaveBeenCalled();
    expect(store.listSubagentToolScopeSnapshots).not.toHaveBeenCalled();
  });

  it("builds child-thread provenance from the latest visible callable workflow grant", () => {
    const store = callerProvenanceStore({
      thread: {
        id: "child-thread",
        kind: "subagent_child",
        subagentRunId: "subagent-run-1",
        workspacePath: "/workspace/.worktrees/child",
        gitWorktree: {
          threadId: "child-thread",
          projectRoot: "/workspace",
          status: "active",
          worktreePath: "/workspace/.worktrees/child",
          branchName: "child-branch",
          createdAt: "2026-06-13T00:00:00.000Z",
          updatedAt: "2026-06-13T00:00:00.000Z",
        },
      },
      subagentRun: {
        id: "subagent-run-1",
        canonicalTaskPath: "parent/child",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
      },
      snapshots: [
        toolScopeSnapshot([]),
        toolScopeSnapshot([{
          source: "callable_workflow",
          id: "ambient_workflow_ship",
          piVisible: true,
          requiresApproval: true,
        }]),
      ],
    });

    expect(resolveCallableWorkflowCallerProvenance({
      threadId: "child-thread",
      parentRun: { id: "child-run", assistantMessageId: "child-message" },
      toolName: "ambient_workflow_ship",
      workflowRunPlan: launchCardPlan({ requireConfirmation: false, approvalFailureHandling: "fail" }),
    }, store)).toEqual({
      kind: "subagent_child_thread",
      threadId: "child-thread",
      runId: "child-run",
      messageId: "child-message",
      subagentRunId: "subagent-run-1",
      canonicalTaskPath: "parent/child",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      approval: {
        required: true,
        source: "child_bridge_policy",
        failureHandling: "fail",
        scopeHint: "this_child_thread",
      },
      worktree: {
        required: true,
        isolated: true,
        status: "active",
        workspacePath: "/workspace/.worktrees/child",
        worktreePath: "/workspace/.worktrees/child",
        branchName: "child-branch",
      },
      nestedFanout: {
        required: true,
        source: "child_bridge_policy",
      },
    });
  });

  it("lets explicit child grants without approval override launch-card confirmation", () => {
    const store = callerProvenanceStore({
      thread: {
        id: "child-thread",
        kind: "subagent_child",
        subagentRunId: "subagent-run-1",
        workspacePath: "/workspace",
      },
      subagentRun: {
        id: "subagent-run-1",
        canonicalTaskPath: "parent/child",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
      },
      snapshots: [
        toolScopeSnapshot([{
          source: "callable_workflow",
          id: "ambient_workflow_ship",
          piVisible: true,
          requiresApproval: false,
        }]),
      ],
    });

    expect(resolveCallableWorkflowCallerProvenance({
      threadId: "child-thread",
      parentRun: { id: "child-run" },
      toolName: "ambient_workflow_ship",
      workflowRunPlan: launchCardPlan({ requireConfirmation: true }),
    }, store)?.approval).toEqual({
      required: false,
      source: "launch_card",
      failureHandling: "block_parent",
      scopeHint: "this_child_thread",
    });
  });
});

function thread(kind: ThreadSummary["kind"] = "chat"): Pick<ThreadSummary, "id" | "kind"> {
  return { id: `${kind}-thread`, kind };
}

function featureFlags(): AmbientFeatureFlagSnapshot {
  return {
    flags: {
      "ambient.subagents": true,
    },
  } as unknown as AmbientFeatureFlagSnapshot;
}

function recordedPlaybook(id: string): WorkflowRecordingLibraryDescription {
  return {
    id,
    title: `Playbook ${id}`,
  } as WorkflowRecordingLibraryDescription;
}

function task(): CallableWorkflowTaskSummary {
  return {
    id: "task-1",
  } as CallableWorkflowTaskSummary;
}

function createToolRuntime(input: Partial<Parameters<typeof createAgentRuntimeCallableWorkflowToolRuntime>[0]> = {}) {
  return createAgentRuntimeCallableWorkflowToolRuntime({
    threadId: "thread-1",
    workspace: workspace(),
    activeRunIds: new Map([["thread-1", "run-1"]]),
    store: toolRuntimeStore(),
    getFeatureFlagSnapshot: () => featureFlags(),
    getCallerProvenance: () => undefined,
    startCallableWorkflowTaskForThread: () => undefined,
    emitCallableWorkflowTaskUpdated: () => undefined,
    ...input,
  });
}

function toolRuntimeStore(input: Partial<AgentRuntimeCallableWorkflowToolRuntimeStore> = {}): AgentRuntimeCallableWorkflowToolRuntimeStore {
  return {
    getRunRecord: vi.fn(() => ({ id: "run-1" })),
    enqueueCallableWorkflowTask: vi.fn(() => task()),
    ...input,
  };
}

function toolExtensionStore(input: {
  thread: Partial<ThreadSummary> & Pick<ThreadSummary, "id" | "workspacePath">;
  subagentRun: Partial<SubagentRunSummary> & Pick<SubagentRunSummary, "id" | "canonicalTaskPath" | "parentThreadId" | "parentRunId">;
  snapshots?: SubagentToolScopeSnapshotSummary[];
  enqueueCallableWorkflowTask?: AgentRuntimeCallableWorkflowToolExtensionStore["enqueueCallableWorkflowTask"];
}): AgentRuntimeCallableWorkflowToolExtensionStore {
  return {
    getThread: vi.fn(() => input.thread as ThreadSummary),
    getSubagentRun: vi.fn(() => input.subagentRun as SubagentRunSummary),
    listSubagentToolScopeSnapshots: vi.fn(() => input.snapshots ?? []),
    getRunRecord: vi.fn(() => ({ id: "run-1", assistantMessageId: "message-1" })),
    enqueueCallableWorkflowTask: input.enqueueCallableWorkflowTask ?? vi.fn(() => task()),
    listWorkflowRecordingLibrary: vi.fn(() => [{ id: "dynamic" }]),
    describeWorkflowRecording: vi.fn((id: string) => recordedPlaybook(id)),
  };
}

function workspace(): any {
  return { path: "/workspace", name: "Workspace" };
}

function callerProvenanceStore(input: {
  thread: Partial<ThreadSummary> & Pick<ThreadSummary, "id" | "workspacePath">;
  subagentRun?: Partial<SubagentRunSummary> & Pick<SubagentRunSummary, "id" | "canonicalTaskPath" | "parentThreadId" | "parentRunId">;
  snapshots?: SubagentToolScopeSnapshotSummary[];
}): CallableWorkflowCallerProvenanceStore & {
  getThread: ReturnType<typeof vi.fn>;
  getSubagentRun: ReturnType<typeof vi.fn>;
  listSubagentToolScopeSnapshots: ReturnType<typeof vi.fn>;
} {
  return {
    getThread: vi.fn(() => input.thread as ThreadSummary),
    getSubagentRun: vi.fn(() => input.subagentRun as SubagentRunSummary),
    listSubagentToolScopeSnapshots: vi.fn(() => input.snapshots ?? []),
  };
}

function launchCardPlan(input: Partial<{
  requireConfirmation: boolean;
  approvalFailureHandling: string;
}> = {}) {
  return {
    launchCard: {
      requireConfirmation: input.requireConfirmation ?? false,
      approvalFailureHandling: input.approvalFailureHandling ?? "block_parent",
    },
  };
}

function toolScopeSnapshot(
  piVisibleTools: Array<Partial<SubagentToolScopeResolution["piVisibleTools"][number]> & Pick<SubagentToolScopeResolution["piVisibleTools"][number], "source" | "id" | "piVisible">>,
): SubagentToolScopeSnapshotSummary {
  return {
    runId: "subagent-run-1",
    sequence: 1,
    createdAt: "2026-06-13T00:00:00.000Z",
    scope: {
      piVisibleTools: piVisibleTools.map((grant) => ({
        mutatesState: false,
        categoryId: "workflow.call",
        requiresApproval: false,
        ...grant,
      })),
    } as SubagentToolScopeResolution,
    resolverInputs: {},
  };
}
