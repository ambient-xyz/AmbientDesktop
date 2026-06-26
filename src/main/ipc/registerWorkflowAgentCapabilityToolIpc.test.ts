import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { AmbientPermissionGrant } from "../../shared/permissionTypes";
import type {
  InvokeWorkflowNativeToolInput,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowDiscoveryCapabilityDescription,
} from "../../shared/workflowTypes";
import {
  registerWorkflowAgentCapabilityIpc,
  registerWorkflowAgentDiscoveryAccessIpc,
  registerWorkflowAgentExplorationIpc,
  registerWorkflowAgentNativeToolIpc,
  workflowAgentCapabilityIpcChannels,
  workflowAgentDiscoveryAccessIpcChannels,
  workflowAgentExplorationIpcChannels,
  workflowAgentNativeToolIpcChannels,
  type RegisterWorkflowAgentCapabilityIpcDependencies,
  type RegisterWorkflowAgentDiscoveryAccessIpcDependencies,
  type RegisterWorkflowAgentExplorationIpcDependencies,
  type RegisterWorkflowAgentNativeToolIpcDependencies,
} from "./registerWorkflowIpc";
import {
  workflowAgentFolders,
  workflowAgentThread,
  workflowCapabilityDescription,
  workflowCapabilitySearch,
  workflowDiscoveryPermissionGrant,
  workflowDiscoveryPolicyContext,
  workflowDiscoveryResult,
  workflowNativeToolResult,
  workflowThreadExplorationResult,
  type FakeWorkflowAgentCapabilityContext,
  type FakeWorkflowAgentDiscoveryAccessContext,
  type FakeWorkflowAgentDiscoveryAccessStore,
  type FakeWorkflowAgentExplorationContext,
  type FakeWorkflowAgentExplorationStore,
  type FakeWorkflowAgentNativeToolContext,
  type FakeWorkflowAgentNativeToolStore,
  type IpcListener,
} from "./registerWorkflowAgentIpcTestSupport";

describe("registerWorkflowAgentCapabilityIpc", () => {
  it("registers the workflow-agent capability channels", () => {
    const { handlers } = registerAgentCapabilityWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentCapabilityIpcChannels]);
  });

  it("searches capabilities with the workflow thread context", async () => {
    const { deps, invoke } = registerAgentCapabilityWithFakes();

    await expect(
      invoke("workflow-agents:search-capabilities", {
        workflowThreadId: "workflow-thread-1",
        query: "gmail",
        limit: 3,
      }),
    ).resolves.toBe(workflowCapabilitySearch);

    expect(deps.workflowAgentIpcContextForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.workflowDiscoveryPolicyContextForCapabilityLookup).toHaveBeenCalledWith(
      { workflowThreadId: "workflow-thread-1", query: "gmail", limit: 3 },
      { kind: "workflow", workflowThreadId: "workflow-thread-1" },
    );
    expect(deps.searchWorkflowDiscoveryCapabilities).toHaveBeenCalledWith({
      query: "gmail",
      context: workflowDiscoveryPolicyContext,
      limit: 3,
    });
  });

  it("describes capabilities with the project context", async () => {
    const { deps, invoke } = registerAgentCapabilityWithFakes();

    await expect(
      invoke("workflow-agents:describe-capability", {
        projectPath: "/workspace",
        capabilityId: "connector:google.gmail",
        query: "gmail",
      }),
    ).resolves.toBe(workflowCapabilityDescription);

    expect(deps.workflowProjectIpcContext).toHaveBeenCalledWith({
      projectPath: "/workspace",
      capabilityId: "connector:google.gmail",
      query: "gmail",
    });
    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.workflowDiscoveryPolicyContextForCapabilityLookup).toHaveBeenCalledWith(
      { projectPath: "/workspace", capabilityId: "connector:google.gmail", query: "gmail" },
      { kind: "project", projectPath: "/workspace" },
    );
    expect(deps.describeWorkflowDiscoveryCapability).toHaveBeenCalledWith({
      capabilityId: "connector:google.gmail",
      query: "gmail",
      context: workflowDiscoveryPolicyContext,
    });
  });

  it("throws when a capability cannot be described", async () => {
    const { invoke } = registerAgentCapabilityWithFakes({ description: undefined });

    await expect(
      invoke("workflow-agents:describe-capability", {
        capabilityId: "missing-capability",
      }),
    ).rejects.toThrow("Workflow capability was not found: missing-capability");
  });

  it("rejects invalid capability input before resolving contexts", async () => {
    const { deps, invoke } = registerAgentCapabilityWithFakes();

    await expect(invoke("workflow-agents:search-capabilities", { query: "" })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.workflowDiscoveryPolicyContextForCapabilityLookup).not.toHaveBeenCalled();
    expect(deps.searchWorkflowDiscoveryCapabilities).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentNativeToolIpc", () => {
  it("registers the workflow-agent native tool channel", () => {
    const { handlers } = registerAgentNativeToolWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentNativeToolIpcChannels]);
  });

  it("invokes native tools through the workflow thread context when arguments include a workflow thread id", async () => {
    const { deps, invoke, workflowContext } = registerAgentNativeToolWithFakes();

    const raw = {
      toolName: "workflow_get_artifact",
      arguments: {
        workflowThreadId: " workflow-thread-1 ",
        artifactId: "artifact-1",
        ignored: true,
      },
    } satisfies InvokeWorkflowNativeToolInput;

    await expect(invoke("workflow-agents:invoke-native-tool", raw)).resolves.toBe(workflowNativeToolResult);

    expect(deps.workflowAgentIpcContextForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.invokeWorkflowNativeTool).toHaveBeenCalledWith(workflowContext, raw);
  });

  it("falls back to the active project context when no workflow thread id is provided", async () => {
    const { deps, invoke, projectContext } = registerAgentNativeToolWithFakes();

    const raw = {
      toolName: "workflow_current_context",
      arguments: {
        projectPath: "/ignored-by-native-tool-ipc",
      },
    } satisfies InvokeWorkflowNativeToolInput;

    await expect(invoke("workflow-agents:invoke-native-tool", raw)).resolves.toBe(workflowNativeToolResult);

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.workflowProjectIpcContext).toHaveBeenCalledWith({});
    expect(deps.invokeWorkflowNativeTool).toHaveBeenCalledWith(projectContext, raw);
  });

  it("rejects invalid native tool input before resolving context", async () => {
    const { deps, invoke } = registerAgentNativeToolWithFakes();

    await expect(invoke("workflow-agents:invoke-native-tool", { toolName: "workflow_unknown_tool" })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.workflowProjectIpcContext).not.toHaveBeenCalled();
    expect(deps.invokeWorkflowNativeTool).not.toHaveBeenCalled();
  });

  it("propagates native tool invocation failures", async () => {
    const error = new Error("native tool failed");
    const { deps, invoke } = registerAgentNativeToolWithFakes({ error });

    await expect(
      invoke("workflow-agents:invoke-native-tool", {
        toolName: "workflow_get_artifact",
        arguments: { workflowThreadId: "workflow-thread-1" },
      }),
    ).rejects.toThrow(error);

    expect(deps.invokeWorkflowNativeTool).toHaveBeenCalledOnce();
  });
});

describe("registerWorkflowAgentExplorationIpc", () => {
  it("registers the workflow-agent exploration channel", () => {
    const { handlers } = registerAgentExplorationWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentExplorationIpcChannels]);
  });

  it("runs exploration through the workflow thread context and refreshes the returned thread", async () => {
    const refreshedThread = {
      ...workflowAgentThread,
      status: "Explored",
    } satisfies WorkflowAgentThreadSummary;
    const refreshedFolders = [
      {
        ...workflowAgentFolders[0],
        threads: [refreshedThread],
      },
    ] satisfies WorkflowAgentFolderSummary[];
    const { context, deps, invoke, store } = registerAgentExplorationWithFakes({ folders: refreshedFolders });

    await expect(
      invoke("workflow-agents:run-exploration", {
        workflowThreadId: "workflow-thread-1",
        maxModelTurns: 4,
        maxToolCalls: 7,
        maxConnectorCalls: 11,
        maxAmbientCalls: 3,
        maxElapsedMs: 120_000,
        ignored: true,
      }),
    ).resolves.toEqual({
      ...workflowThreadExplorationResult,
      folders: refreshedFolders,
      thread: refreshedThread,
    });

    expect(deps.workflowAgentIpcContextForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(deps.runWorkflowThreadExploration).toHaveBeenCalledWith(context, {
      workflowThreadId: "workflow-thread-1",
      maxModelTurns: 4,
      maxToolCalls: 7,
      maxConnectorCalls: 11,
      maxAmbientCalls: 3,
      maxElapsedMs: 120_000,
    });
    expect(store.listWorkflowAgentFolders).toHaveBeenCalledOnce();
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("falls back to the exploration result thread when refreshed folders do not include the workflow", async () => {
    const emptyFolders = [
      {
        ...workflowAgentFolders[0],
        threads: [],
      },
    ] satisfies WorkflowAgentFolderSummary[];
    const { invoke } = registerAgentExplorationWithFakes({ folders: emptyFolders });

    await expect(invoke("workflow-agents:run-exploration", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual({
      ...workflowThreadExplorationResult,
      folders: emptyFolders,
      thread: workflowAgentThread,
    });
  });

  it("rejects invalid exploration input before resolving context", async () => {
    const { deps, invoke, store } = registerAgentExplorationWithFakes();

    await expect(invoke("workflow-agents:run-exploration", { workflowThreadId: "", maxModelTurns: 4 })).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForWorkflowThread).not.toHaveBeenCalled();
    expect(deps.runWorkflowThreadExploration).not.toHaveBeenCalled();
    expect(store.listWorkflowAgentFolders).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });

  it("propagates exploration failures without emitting workflow updates", async () => {
    const error = new Error("exploration failed");
    const { deps, invoke, store } = registerAgentExplorationWithFakes({ error });

    await expect(invoke("workflow-agents:run-exploration", { workflowThreadId: "workflow-thread-1" })).rejects.toThrow(error);

    expect(deps.runWorkflowThreadExploration).toHaveBeenCalledOnce();
    expect(store.listWorkflowAgentFolders).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentDiscoveryAccessIpc", () => {
  it("registers the workflow-agent discovery access channels", () => {
    const { handlers } = registerAgentDiscoveryAccessWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentDiscoveryAccessIpcChannels]);
  });

  it("resolves access requests through the discovery question context and emits new grants", async () => {
    const { deps, invoke, store } = registerAgentDiscoveryAccessWithFakes();

    await expect(
      invoke("workflow-agents:resolve-discovery-access-request", {
        questionId: "question-1",
        accessRequestId: "access-request-1",
        response: "always_workflow",
      }),
    ).resolves.toBe(workflowDiscoveryResult);

    expect(deps.workflowAgentIpcContextForDiscoveryQuestion).toHaveBeenCalledWith("question-1");
    expect(store.listPermissionGrants).toHaveBeenCalledTimes(2);
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.resolveWorkflowDiscoveryAccessRequest).toHaveBeenCalledWith(
      store,
      {
        questionId: "question-1",
        accessRequestId: "access-request-1",
        response: "always_workflow",
      },
      {
        connectorDescriptors: [],
        permissionMode: "workspace",
        permissionAuditThreadId: "chat-thread-1",
        workspacePath: "/workspace",
      },
    );
    expect(deps.emitPermissionGrantCreated).toHaveBeenCalledWith(workflowDiscoveryPermissionGrant, "/workspace");
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("falls back to the thread id when the workflow has no chat thread", async () => {
    const { deps, invoke } = registerAgentDiscoveryAccessWithFakes({ workflowThread: {} });

    await expect(
      invoke("workflow-agents:resolve-discovery-access-request", {
        questionId: "question-1",
        accessRequestId: "access-request-1",
        response: "allow_once",
      }),
    ).resolves.toBe(workflowDiscoveryResult);

    expect(deps.resolveWorkflowDiscoveryAccessRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ response: "allow_once" }),
      expect.objectContaining({ permissionAuditThreadId: "thread-1" }),
    );
  });

  it("rejects invalid access input before resolving contexts", async () => {
    const { deps, invoke, store } = registerAgentDiscoveryAccessWithFakes();

    await expect(
      invoke("workflow-agents:resolve-discovery-access-request", {
        questionId: "",
        accessRequestId: "access-request-1",
        response: "always_workflow",
      }),
    ).rejects.toThrow();

    expect(deps.workflowAgentIpcContextForDiscoveryQuestion).not.toHaveBeenCalled();
    expect(store.listPermissionGrants).not.toHaveBeenCalled();
    expect(deps.resolveWorkflowDiscoveryAccessRequest).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});
function registerAgentCapabilityWithFakes(options: { description?: WorkflowDiscoveryCapabilityDescription | undefined } = {}) {
  const handlers = new Map<string, IpcListener>();
  const description = "description" in options ? options.description : workflowCapabilityDescription;
  const deps: RegisterWorkflowAgentCapabilityIpcDependencies<FakeWorkflowAgentCapabilityContext> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForWorkflowThread: vi.fn(
      (workflowThreadId: string): FakeWorkflowAgentCapabilityContext => ({ kind: "workflow", workflowThreadId }),
    ),
    workflowProjectIpcContext: vi.fn(
      (input: { projectPath?: string }): FakeWorkflowAgentCapabilityContext => ({ kind: "project", projectPath: input.projectPath }),
    ),
    workflowDiscoveryPolicyContextForCapabilityLookup: vi.fn(() => Promise.resolve(workflowDiscoveryPolicyContext)),
    searchWorkflowDiscoveryCapabilities: vi.fn(() => workflowCapabilitySearch),
    describeWorkflowDiscoveryCapability: vi.fn(() => description),
  };
  registerWorkflowAgentCapabilityIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentNativeToolWithFakes(options: { error?: Error } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentNativeToolStore = {
    marker: "workflow-agent-native-tool-store",
  };
  const projectContext: FakeWorkflowAgentNativeToolContext = {
    targetStore: store,
    kind: "project",
    projectPath: "/workspace",
  };
  const workflowContext: FakeWorkflowAgentNativeToolContext = {
    targetStore: store,
    kind: "workflow",
    projectPath: "/workspace",
    workflowThreadId: "workflow-thread-1",
  };
  const deps: RegisterWorkflowAgentNativeToolIpcDependencies<FakeWorkflowAgentNativeToolStore, FakeWorkflowAgentNativeToolContext> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForWorkflowThread: vi.fn(() => workflowContext),
    workflowProjectIpcContext: vi.fn(() => projectContext),
    invokeWorkflowNativeTool: vi.fn(() => {
      if (options.error) throw options.error;
      return workflowNativeToolResult;
    }),
  };
  registerWorkflowAgentNativeToolIpc(deps);

  return {
    deps,
    handlers,
    projectContext,
    workflowContext,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentExplorationWithFakes(
  options: {
    error?: Error;
    folders?: WorkflowAgentFolderSummary[];
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentExplorationStore = {
    listWorkflowAgentFolders: vi.fn(() => options.folders ?? workflowAgentFolders),
  };
  const context: FakeWorkflowAgentExplorationContext = {
    targetStore: store,
    projectPath: "/workspace",
  };
  const deps: RegisterWorkflowAgentExplorationIpcDependencies<FakeWorkflowAgentExplorationStore, FakeWorkflowAgentExplorationContext> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForWorkflowThread: vi.fn(() => context),
    runWorkflowThreadExploration: vi.fn(() => {
      if (options.error) throw options.error;
      return workflowThreadExplorationResult;
    }),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowAgentExplorationIpc(deps);

  return {
    context,
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAgentDiscoveryAccessWithFakes(
  options: {
    grantsAfter?: AmbientPermissionGrant[];
    workflowThread?: FakeWorkflowAgentDiscoveryAccessContext["workflowThread"];
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentDiscoveryAccessStore = {
    listPermissionGrants: vi.fn<() => AmbientPermissionGrant[]>(),
  };
  store.listPermissionGrants.mockReturnValueOnce([]).mockReturnValue(options.grantsAfter ?? [workflowDiscoveryPermissionGrant]);
  const context: FakeWorkflowAgentDiscoveryAccessContext = {
    targetStore: store,
    thread: {
      id: "thread-1",
      permissionMode: "workspace",
    },
    workflowThread: options.workflowThread ?? {
      chatThreadId: "chat-thread-1",
    },
    projectPath: "/workspace",
  };
  const deps: RegisterWorkflowAgentDiscoveryAccessIpcDependencies<
    FakeWorkflowAgentDiscoveryAccessStore,
    FakeWorkflowAgentDiscoveryAccessContext
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowAgentIpcContextForDiscoveryQuestion: vi.fn(() => context),
    connectorDescriptors: vi.fn(() => []),
    resolveWorkflowDiscoveryAccessRequest: vi.fn(() => Promise.resolve(workflowDiscoveryResult)),
    emitPermissionGrantCreated: vi.fn(),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowAgentDiscoveryAccessIpc(deps);

  return {
    deps,
    handlers,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
