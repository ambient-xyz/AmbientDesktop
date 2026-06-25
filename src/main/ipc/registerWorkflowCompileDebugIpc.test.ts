import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { CompileWorkflowDebugRewriteInput, CompileWorkflowPreviewInput } from "../../shared/workflowTypes";
import {
  registerWorkflowCompilePreviewIpc,
  registerWorkflowDebugRewriteIpc,
  workflowCompilePreviewIpcChannels,
  workflowDebugRewriteIpcChannels,
  type RegisterWorkflowCompilePreviewIpcDependencies,
  type RegisterWorkflowDebugRewriteIpcDependencies,
} from "./registerWorkflowIpc";
import {
  workflowCompileProgress,
  workflowConnectorDescriptors,
  workflowDashboard,
  workflowDebugContext,
  workflowDebugPromptSection,
  workflowDebugRequestedChange,
  workflowDebugWorkflowThread,
  workflowPluginRegistrations,
  workflowPluginRegistry,
  workflowSearchRoutingSettings,
  workflowToolDescriptors,
  type FakeWorkflowCompileStore,
  type FakeWorkflowCompileThread,
  type FakeWorkflowDebugRewriteWorkflowThread,
} from "./registerWorkflowExecutionIpcTestSupport";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerWorkflowCompilePreviewIpc", () => {
  it("registers the workflow compile-preview channels", () => {
    const { handlers } = registerCompilePreviewWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowCompilePreviewIpcChannels]);
  });

  it("compiles previews through context, provider, plugins, and emits workflow updates", async () => {
    const { compileWorkflowArtifact, deps, invoke, store, thread } = registerCompilePreviewWithFakes();
    const input = {
      userRequest: "Build a workflow",
      workflowThreadId: "workflow-thread-1",
      revisionId: "revision-1",
    };

    await expect(invoke("workflow:compile-preview", input)).resolves.toBe(workflowDashboard);

    expect(deps.workflowCompileIpcContext).toHaveBeenCalledWith(input);
    expect(deps.workspaceStateForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("model-1");
    expect(deps.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.listPluginRegistry).toHaveBeenCalledWith("/workspace", store);
    expect(deps.workflowToolDescriptorsFromPluginRegistry).toHaveBeenCalledWith(workflowPluginRegistry, workflowPluginRegistrations);
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.readSearchRoutingSettings).toHaveBeenCalledOnce();
    expect(deps.ambientRetryPolicyFromCurrentSettings).toHaveBeenCalledWith(store);
    expect(compileWorkflowArtifact).toHaveBeenCalledOnce();

    const compileInput = compileWorkflowArtifact.mock.calls[0][0];
    expect(compileInput).toEqual(
      expect.objectContaining({
        store,
        userRequest: "Build a workflow",
        workflowThreadId: "workflow-thread-1",
        revisionId: "revision-1",
        workspaceSummary: ["Workspace: Active workspace", "Path: /workspace", "Permission mode: workspace"].join("\n"),
        toolDescriptors: workflowToolDescriptors,
        pluginRegistrations: workflowPluginRegistrations,
        connectorDescriptors: workflowConnectorDescriptors,
        stateRoot: "/state",
        model: "model-1",
        permissionMode: "workspace",
        searchRoutingSettings: workflowSearchRoutingSettings,
        baseUrl: "https://provider.example",
      }),
    );
    expect(compileInput.retryPolicy).toBeUndefined();

    compileInput.onProgress?.(workflowCompileProgress);

    expect(deps.emitWorkflowEvent).toHaveBeenCalledWith(
      { type: "workflow-compile-progress", progress: workflowCompileProgress },
      "/workspace",
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("rejects invalid compile input before resolving context", async () => {
    const { compileWorkflowArtifact, deps, invoke } = registerCompilePreviewWithFakes();

    await expect(invoke("workflow:compile-preview", { userRequest: "" })).rejects.toThrow();

    expect(deps.workflowCompileIpcContext).not.toHaveBeenCalled();
    expect(deps.workspaceStateForThread).not.toHaveBeenCalled();
    expect(compileWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowDebugRewriteIpc", () => {
  it("registers the workflow debug-rewrite channels", () => {
    const { handlers } = registerDebugRewriteWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowDebugRewriteIpcChannels]);
  });

  it("routes visual e2e rewrite requests without resolving runtime context", async () => {
    const { compileWorkflowArtifact, deps, invoke } = registerDebugRewriteWithFakes({ e2eEnabled: true });
    const input = {
      runId: "visual-run-1",
      eventId: "event-1",
      userNotes: " Capture visual state ",
    };

    await expect(invoke("workflow:debug-rewrite", input)).resolves.toBe(workflowDashboard);

    expect(deps.emitE2eWorkflowDebugRewriteInput).toHaveBeenCalledWith({
      runId: "visual-run-1",
      eventId: "event-1",
      userNotes: "Capture visual state",
    });
    expect(deps.readE2eWorkflowDashboard).toHaveBeenCalledOnce();
    expect(deps.workflowDebugRewriteIpcContext).not.toHaveBeenCalled();
    expect(compileWorkflowArtifact).not.toHaveBeenCalled();
  });

  it("compiles debug rewrites through context, provider, plugins, and records a revision", async () => {
    const { compileWorkflowArtifact, deps, invoke, store, thread } = registerDebugRewriteWithFakes();
    const input = {
      runId: "run-1",
      eventId: "event-1",
      userNotes: " Fix retry ",
    };

    await expect(invoke("workflow:debug-rewrite", input)).resolves.toBe(workflowDashboard);

    expect(deps.readE2eEnabled).toHaveBeenCalledOnce();
    expect(deps.workflowDebugRewriteIpcContext).toHaveBeenCalledWith({
      runId: "run-1",
      eventId: "event-1",
      userNotes: "Fix retry",
    });
    expect(deps.workflowDebugRewriteUserRequest).toHaveBeenCalledWith(workflowDebugContext);
    expect(deps.workspaceStateForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("model-1");
    expect(deps.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.listPluginRegistry).toHaveBeenCalledWith("/workspace", store);
    expect(deps.workflowToolDescriptorsFromPluginRegistry).toHaveBeenCalledWith(workflowPluginRegistry, workflowPluginRegistrations);
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.readSearchRoutingSettings).toHaveBeenCalledOnce();
    expect(deps.ambientRetryPolicyFromCurrentSettings).toHaveBeenCalledWith(store);
    expect(deps.buildWorkflowDebugRewritePromptSection).toHaveBeenCalledWith(workflowDebugContext);
    expect(compileWorkflowArtifact).toHaveBeenCalledOnce();

    const compileInput = compileWorkflowArtifact.mock.calls[0][0];
    expect(compileInput).toEqual(
      expect.objectContaining({
        store,
        userRequest: workflowDebugRequestedChange,
        workflowThreadId: "workflow-thread-1",
        workspaceSummary: [
          "Workspace: Active workspace",
          "Path: /workspace",
          "Permission mode: workspace",
          "Debug rewrite failed run: run-1",
        ].join("\n"),
        toolDescriptors: workflowToolDescriptors,
        pluginRegistrations: workflowPluginRegistrations,
        connectorDescriptors: workflowConnectorDescriptors,
        stateRoot: "/state",
        model: "model-1",
        permissionMode: "workspace",
        searchRoutingSettings: workflowSearchRoutingSettings,
        baseUrl: "https://provider.example",
        debugRewriteContext: workflowDebugPromptSection,
      }),
    );
    expect(compileInput.retryPolicy).toBeUndefined();

    compileInput.onProgress?.(workflowCompileProgress);

    expect(deps.emitWorkflowEvent).toHaveBeenCalledWith(
      { type: "workflow-compile-progress", progress: workflowCompileProgress },
      "/workspace",
    );
    expect(deps.createWorkflowDebugRewriteRevision).toHaveBeenCalledWith(store, workflowDebugContext, {
      baseVersionId: "version-1",
      requestedChange: workflowDebugRequestedChange,
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("rejects invalid debug input before resolving context", async () => {
    const { compileWorkflowArtifact, deps, invoke } = registerDebugRewriteWithFakes();

    await expect(invoke("workflow:debug-rewrite", { runId: "" })).rejects.toThrow();

    expect(deps.readE2eEnabled).not.toHaveBeenCalled();
    expect(deps.workflowDebugRewriteIpcContext).not.toHaveBeenCalled();
    expect(compileWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.createWorkflowDebugRewriteRevision).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

function registerCompilePreviewWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCompileStore = {
    getWorkspace: vi.fn(() => ({ statePath: "/state" })),
  };
  const thread: FakeWorkflowCompileThread = {
    model: "model-1",
    permissionMode: "workspace",
  };
  type FakeCompilePreviewDeps = RegisterWorkflowCompilePreviewIpcDependencies<
    FakeWorkflowCompileStore,
    FakeWorkflowCompileThread,
    typeof workflowPluginRegistry,
    typeof workflowPluginRegistrations
  >;
  const compileWorkflowArtifact = vi.fn<FakeCompilePreviewDeps["compileWorkflowArtifact"]>(() => Promise.resolve(workflowDashboard));
  const deps: FakeCompilePreviewDeps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowCompileIpcContext: vi.fn((_input: CompileWorkflowPreviewInput) => ({
      targetStore: store,
      thread,
      projectPath: "/workspace",
    })),
    workspaceStateForThread: vi.fn(() => ({ name: "Active workspace", path: "/workspace" })),
    getAmbientProviderStatus: vi.fn(() => ({ baseUrl: "https://provider.example" })),
    pluginMcpRegistrationsForThread: vi.fn(() => Promise.resolve(workflowPluginRegistrations)),
    listPluginRegistry: vi.fn(() => Promise.resolve(workflowPluginRegistry)),
    workflowToolDescriptorsFromPluginRegistry: vi.fn(() => workflowToolDescriptors),
    connectorDescriptors: vi.fn(() => workflowConnectorDescriptors),
    readSearchRoutingSettings: vi.fn(() => workflowSearchRoutingSettings),
    ambientRetryPolicyFromCurrentSettings: vi.fn(() => undefined),
    compileWorkflowArtifact,
    emitWorkflowEvent: vi.fn((_event: Extract<DesktopEvent, { type: "workflow-compile-progress" }>, _projectPath: string) => undefined),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowCompilePreviewIpc(deps);

  return {
    compileWorkflowArtifact,
    deps,
    handlers,
    store,
    thread,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerDebugRewriteWithFakes(options: { e2eEnabled?: boolean; workflowThread?: FakeWorkflowDebugRewriteWorkflowThread } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCompileStore = {
    getWorkspace: vi.fn(() => ({ statePath: "/state" })),
  };
  const thread: FakeWorkflowCompileThread = {
    model: "model-1",
    permissionMode: "workspace",
  };
  type FakeDebugRewriteDeps = RegisterWorkflowDebugRewriteIpcDependencies<
    FakeWorkflowCompileStore,
    FakeWorkflowCompileThread,
    FakeWorkflowDebugRewriteWorkflowThread,
    typeof workflowDebugContext,
    typeof workflowPluginRegistry,
    typeof workflowPluginRegistrations
  >;
  const compileWorkflowArtifact = vi.fn<FakeDebugRewriteDeps["compileWorkflowArtifact"]>(() => Promise.resolve(workflowDashboard));
  const deps: FakeDebugRewriteDeps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readE2eEnabled: vi.fn(() => options.e2eEnabled ?? false),
    emitE2eWorkflowDebugRewriteInput: vi.fn((_input: CompileWorkflowDebugRewriteInput) => undefined),
    readE2eWorkflowDashboard: vi.fn(() => workflowDashboard),
    workflowDebugRewriteIpcContext: vi.fn((_input: CompileWorkflowDebugRewriteInput) => ({
      targetStore: store,
      thread,
      workflowThread: options.workflowThread ?? workflowDebugWorkflowThread,
      debugContext: workflowDebugContext,
      projectPath: "/workspace",
    })),
    workflowDebugRewriteUserRequest: vi.fn(() => workflowDebugRequestedChange),
    workspaceStateForThread: vi.fn(() => ({ name: "Active workspace", path: "/workspace" })),
    getAmbientProviderStatus: vi.fn(() => ({ baseUrl: "https://provider.example" })),
    pluginMcpRegistrationsForThread: vi.fn(() => Promise.resolve(workflowPluginRegistrations)),
    listPluginRegistry: vi.fn(() => Promise.resolve(workflowPluginRegistry)),
    workflowToolDescriptorsFromPluginRegistry: vi.fn(() => workflowToolDescriptors),
    connectorDescriptors: vi.fn(() => workflowConnectorDescriptors),
    readSearchRoutingSettings: vi.fn(() => workflowSearchRoutingSettings),
    ambientRetryPolicyFromCurrentSettings: vi.fn(() => undefined),
    buildWorkflowDebugRewritePromptSection: vi.fn(() => workflowDebugPromptSection),
    compileWorkflowArtifact,
    createWorkflowDebugRewriteRevision: vi.fn(),
    emitWorkflowEvent: vi.fn((_event: Extract<DesktopEvent, { type: "workflow-compile-progress" }>, _projectPath: string) => undefined),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowDebugRewriteIpc(deps);

  return {
    compileWorkflowArtifact,
    deps,
    handlers,
    store,
    thread,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
