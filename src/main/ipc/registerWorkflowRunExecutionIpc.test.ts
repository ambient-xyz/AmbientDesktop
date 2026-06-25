import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { RecoverWorkflowRunInput, RunWorkflowArtifactInput } from "../../shared/workflowTypes";
import type { RunWorkflowArtifactInput as WorkflowRunArtifactServiceInput, WorkflowRecoveryPlan } from "./ipcWorkflowFacade";
import {
  registerWorkflowRecoverRunIpc,
  registerWorkflowRunArtifactIpc,
  workflowRecoverRunIpcChannels,
  workflowRunArtifactIpcChannels,
  type RegisterWorkflowRecoverRunIpcDependencies,
  type RegisterWorkflowRunArtifactIpcDependencies,
} from "./registerWorkflowIpc";
import {
  workflowDashboard,
  workflowPermissionRequest,
  workflowRecoveryPlan,
  workflowRunArtifact,
  workflowRunBrowser,
  workflowRunConnectorRegistrations,
  workflowRunPluginRegistration,
  workflowRunPluginRegistrations,
  workflowRunPluginRegistry,
  type FakeWorkflowCompileStore,
  type FakeWorkflowCompileThread,
  type FakeWorkflowRecoverRunHost,
  type FakeWorkflowRunArtifactArtifact,
} from "./registerWorkflowExecutionIpcTestSupport";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerWorkflowRunArtifactIpc", () => {
  it("registers the workflow run-artifact channels", () => {
    const { handlers } = registerRunArtifactWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowRunArtifactIpcChannels]);
  });

  it("runs approved artifacts through plugins, connectors, permissions, and run lifecycle callbacks", async () => {
    const { deps, invoke, runWorkflowArtifact, store, thread } = registerRunArtifactWithFakes();
    const input = {
      artifactId: "artifact-1",
      mode: "execute",
      runtime: "workflow",
      runLimits: { idleTimeoutMs: 1000, maxRunMs: null },
      userInputs: [{ requestId: "input-1", choiceId: "choice-1", text: "Use option one", data: { selected: true } }],
    } satisfies RunWorkflowArtifactInput;

    runWorkflowArtifact.mockImplementationOnce(async (runInput) => {
      await expect(runInput.requestPermission?.(workflowPermissionRequest)).resolves.toBe(true);
      await expect(runInput.ensurePluginTrusted?.(workflowRunPluginRegistration)).resolves.toBe(true);
      runInput.onRunStarted?.("workflow-run-1");
      runInput.onEvent?.();
      return workflowDashboard;
    });

    await expect(invoke("workflow:run-artifact", input)).resolves.toBe(workflowDashboard);

    expect(deps.workflowArtifactIpcContext).toHaveBeenCalledWith("artifact-1");
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("model-1");
    expect(deps.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.listPluginRegistry).toHaveBeenCalledWith("/workspace", store);
    expect(deps.connectorRegistrations).toHaveBeenCalledOnce();
    expect(deps.connectorAccountAuthorizer).toHaveBeenCalledOnce();
    expect(runWorkflowArtifact).toHaveBeenCalledOnce();

    const runInput = runWorkflowArtifact.mock.calls[0][0];
    expect(runInput).toEqual(
      expect.objectContaining({
        store,
        artifactId: "artifact-1",
        workspacePath: "/workspace",
        permissionMode: "workspace",
        browser: workflowRunBrowser,
        pluginRegistrations: workflowRunPluginRegistrations,
        pluginRegistry: workflowRunPluginRegistry,
        pluginCaller: deps.pluginCaller,
        connectorRegistrations: workflowRunConnectorRegistrations,
        connectorAccountAuthorizer: undefined,
        model: "model-1",
        baseUrl: "https://provider.example",
        mode: "execute",
        runtime: "workflow",
        runLimits: { idleTimeoutMs: 1000, maxRunMs: null },
        userInputs: [{ requestId: "input-1", choiceId: "choice-1", text: "Use option one", data: { selected: true } }],
      }),
    );
    expect(runInput.abortSignal).toBeInstanceOf(AbortSignal);
    expect(deps.requestPermissionWithGrantRegistry).toHaveBeenCalledWith(workflowPermissionRequest, {
      thread,
      permissionMode: "workspace",
      workspacePath: "/workspace",
      workflowThreadId: "workflow-thread-1",
      store,
    });
    expect(deps.ensureWorkflowPluginTrusted).toHaveBeenCalledWith(thread, workflowRunPluginRegistration, store);
    expect(deps.rememberActiveWorkflowRun).toHaveBeenCalledWith("workflow-run-1", expect.any(AbortController), "/workspace");
    expect(deps.emitWorkflowEvent).toHaveBeenCalledWith(
      {
        type: "workflow-run-started",
        runId: "workflow-run-1",
        artifactId: "artifact-1",
        workflowThreadId: "workflow-thread-1",
      },
      "/workspace",
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledTimes(3);
    expect(deps.forgetActiveWorkflowRunsForController).toHaveBeenCalledWith(vi.mocked(deps.rememberActiveWorkflowRun).mock.calls[0][1]);
  });

  it("rejects unapproved execute runs before resolving provider and plugins", async () => {
    const { deps, invoke, runWorkflowArtifact } = registerRunArtifactWithFakes({
      artifact: { ...workflowRunArtifact, status: "ready_for_preview" },
    });

    await expect(invoke("workflow:run-artifact", { artifactId: "artifact-1" })).rejects.toThrow(
      "Approve this workflow preview before running it",
    );

    expect(deps.getAmbientProviderStatus).not.toHaveBeenCalled();
    expect(deps.pluginMcpRegistrationsForThread).not.toHaveBeenCalled();
    expect(runWorkflowArtifact).not.toHaveBeenCalled();
  });

  it("rejects invalid run input before resolving artifact context", async () => {
    const { deps, invoke, runWorkflowArtifact } = registerRunArtifactWithFakes();

    await expect(invoke("workflow:run-artifact", { artifactId: "", runLimits: { idleTimeoutMs: -1 } })).rejects.toThrow();

    expect(deps.workflowArtifactIpcContext).not.toHaveBeenCalled();
    expect(runWorkflowArtifact).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowRecoverRunIpc", () => {
  it("registers the workflow recover-run channels", () => {
    const { handlers } = registerRecoverRunWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowRecoverRunIpcChannels]);
  });

  it("recovers runs through the recovery plan, stale marker, plugins, permissions, and lifecycle callbacks", async () => {
    const { deps, host, invoke, runWorkflowArtifact, store, thread } = registerRecoverRunWithFakes();
    const input = {
      runId: "run-1",
      eventId: "event-1",
      action: "retry_step",
      graphNodeId: "node-1",
    } satisfies RecoverWorkflowRunInput;

    runWorkflowArtifact.mockImplementationOnce(async (runInput) => {
      await expect(runInput.requestPermission?.(workflowPermissionRequest)).resolves.toBe(true);
      await expect(runInput.ensurePluginTrusted?.(workflowRunPluginRegistration)).resolves.toBe(true);
      runInput.onRunStarted?.("workflow-run-1");
      runInput.onEvent?.();
      return workflowDashboard;
    });

    await expect(invoke("workflow:recover-run", input)).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.buildWorkflowRecoveryPlan).toHaveBeenCalledWith(store, input);
    expect(deps.workflowArtifactIpcContextForHost).toHaveBeenCalledWith(host, "artifact-1");
    expect(deps.markStaleWorkflowRunForRecoveryIfNeeded).toHaveBeenCalledWith(store, "run-1", {
      recoveryAction: "retry_step",
      sourceEventId: "event-1",
      reason: "Desktop recovery run started.",
    });
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("model-1");
    expect(deps.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(thread, store);
    expect(deps.listPluginRegistry).toHaveBeenCalledWith("/workspace", store);
    expect(deps.connectorRegistrations).toHaveBeenCalledOnce();
    expect(deps.connectorAccountAuthorizer).toHaveBeenCalledOnce();
    expect(runWorkflowArtifact).toHaveBeenCalledOnce();

    const runInput = runWorkflowArtifact.mock.calls[0][0];
    expect(runInput).toEqual(
      expect.objectContaining({
        store,
        artifactId: "artifact-1",
        workspacePath: "/workspace",
        permissionMode: "workspace",
        browser: workflowRunBrowser,
        pluginRegistrations: workflowRunPluginRegistrations,
        pluginRegistry: workflowRunPluginRegistry,
        pluginCaller: deps.pluginCaller,
        connectorRegistrations: workflowRunConnectorRegistrations,
        connectorAccountAuthorizer: undefined,
        model: "model-1",
        baseUrl: "https://provider.example",
        mode: "execute",
        runtime: "automation",
        resumeFromRunId: "run-1",
        recovery: workflowRecoveryPlan.recovery,
      }),
    );
    expect(runInput.abortSignal).toBeInstanceOf(AbortSignal);
    expect(deps.requestPermissionWithGrantRegistry).toHaveBeenCalledWith(workflowPermissionRequest, {
      thread,
      permissionMode: "workspace",
      workspacePath: "/workspace",
      workflowThreadId: "workflow-thread-1",
      store,
    });
    expect(deps.ensureWorkflowPluginTrusted).toHaveBeenCalledWith(thread, workflowRunPluginRegistration, store);
    expect(deps.rememberActiveWorkflowRun).toHaveBeenCalledWith("workflow-run-1", expect.any(AbortController), "/workspace");
    expect(deps.emitWorkflowEvent).toHaveBeenCalledWith(
      {
        type: "workflow-run-started",
        runId: "workflow-run-1",
        artifactId: "artifact-1",
        workflowThreadId: "workflow-thread-1",
      },
      "/workspace",
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledTimes(3);
    expect(deps.forgetActiveWorkflowRunsForController).toHaveBeenCalledWith(vi.mocked(deps.rememberActiveWorkflowRun).mock.calls[0][1]);
  });

  it("rejects unapproved recovery before marking stale or resolving provider and plugins", async () => {
    const { deps, invoke, runWorkflowArtifact } = registerRecoverRunWithFakes({
      artifact: { ...workflowRunArtifact, status: "ready_for_preview" },
    });

    await expect(invoke("workflow:recover-run", { runId: "run-1", eventId: "event-1", action: "retry_step" })).rejects.toThrow(
      "Approve this workflow before recovering it",
    );

    expect(deps.markStaleWorkflowRunForRecoveryIfNeeded).not.toHaveBeenCalled();
    expect(deps.getAmbientProviderStatus).not.toHaveBeenCalled();
    expect(deps.pluginMcpRegistrationsForThread).not.toHaveBeenCalled();
    expect(runWorkflowArtifact).not.toHaveBeenCalled();
  });

  it("rejects invalid recover input before resolving the run host", async () => {
    const { deps, invoke, runWorkflowArtifact } = registerRecoverRunWithFakes();

    await expect(invoke("workflow:recover-run", { runId: "", eventId: "event-1", action: "retry_step" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowRun).not.toHaveBeenCalled();
    expect(deps.buildWorkflowRecoveryPlan).not.toHaveBeenCalled();
    expect(runWorkflowArtifact).not.toHaveBeenCalled();
  });
});

function registerRunArtifactWithFakes(options: { artifact?: FakeWorkflowRunArtifactArtifact } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCompileStore = {
    getWorkspace: vi.fn(() => ({ statePath: "/state" })),
  };
  const thread: FakeWorkflowCompileThread = {
    model: "model-1",
    permissionMode: "workspace",
  };
  const artifact = options.artifact ?? workflowRunArtifact;
  type FakeRunArtifactDeps = RegisterWorkflowRunArtifactIpcDependencies<
    FakeWorkflowCompileStore,
    FakeWorkflowCompileThread,
    typeof workflowRunBrowser,
    FakeWorkflowRunArtifactArtifact
  >;
  const pluginCaller = vi.fn() as unknown as NonNullable<WorkflowRunArtifactServiceInput["pluginCaller"]>;
  const runWorkflowArtifact = vi.fn<FakeRunArtifactDeps["runWorkflowArtifact"]>(() => Promise.resolve(workflowDashboard));
  const deps: FakeRunArtifactDeps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    workflowArtifactIpcContext: vi.fn((_artifactId: string) => ({
      targetStore: store,
      targetBrowserService: workflowRunBrowser,
      thread,
      artifact,
      projectPath: "/workspace",
    })),
    getAmbientProviderStatus: vi.fn(() => ({ baseUrl: "https://provider.example" })),
    pluginMcpRegistrationsForThread: vi.fn(() => Promise.resolve(workflowRunPluginRegistrations)),
    listPluginRegistry: vi.fn(() => Promise.resolve(workflowRunPluginRegistry)),
    requestPermissionWithGrantRegistry: vi.fn(() => Promise.resolve({ allowed: true })),
    ensureWorkflowPluginTrusted: vi.fn(() => Promise.resolve(true)),
    pluginCaller,
    connectorRegistrations: vi.fn(() => workflowRunConnectorRegistrations),
    connectorAccountAuthorizer: vi.fn(() => undefined),
    runWorkflowArtifact,
    rememberActiveWorkflowRun: vi.fn(),
    forgetActiveWorkflowRunsForController: vi.fn(),
    emitWorkflowEvent: vi.fn(),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowRunArtifactIpc(deps);

  return {
    artifact,
    deps,
    handlers,
    runWorkflowArtifact,
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

function registerRecoverRunWithFakes(options: { artifact?: FakeWorkflowRunArtifactArtifact; plan?: WorkflowRecoveryPlan } = {}) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCompileStore = {
    getWorkspace: vi.fn(() => ({ statePath: "/state" })),
  };
  const host: FakeWorkflowRecoverRunHost = {
    store,
  };
  const thread: FakeWorkflowCompileThread = {
    model: "model-1",
    permissionMode: "workspace",
  };
  const artifact = options.artifact ?? workflowRunArtifact;
  type FakeRecoverRunDeps = RegisterWorkflowRecoverRunIpcDependencies<
    FakeWorkflowCompileStore,
    FakeWorkflowRecoverRunHost,
    FakeWorkflowCompileThread,
    typeof workflowRunBrowser,
    FakeWorkflowRunArtifactArtifact
  >;
  const pluginCaller = vi.fn() as unknown as NonNullable<WorkflowRunArtifactServiceInput["pluginCaller"]>;
  const runWorkflowArtifact = vi.fn<FakeRecoverRunDeps["runWorkflowArtifact"]>(() => Promise.resolve(workflowDashboard));
  const deps: FakeRecoverRunDeps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowRun: vi.fn((_runId: string) => host),
    buildWorkflowRecoveryPlan: vi.fn(() => options.plan ?? workflowRecoveryPlan),
    workflowArtifactIpcContextForHost: vi.fn((_host: FakeWorkflowRecoverRunHost, _artifactId: string) => ({
      targetStore: store,
      targetBrowserService: workflowRunBrowser,
      thread,
      artifact,
      projectPath: "/workspace",
    })),
    markStaleWorkflowRunForRecoveryIfNeeded: vi.fn(),
    getAmbientProviderStatus: vi.fn(() => ({ baseUrl: "https://provider.example" })),
    pluginMcpRegistrationsForThread: vi.fn(() => Promise.resolve(workflowRunPluginRegistrations)),
    listPluginRegistry: vi.fn(() => Promise.resolve(workflowRunPluginRegistry)),
    requestPermissionWithGrantRegistry: vi.fn(() => Promise.resolve({ allowed: true })),
    ensureWorkflowPluginTrusted: vi.fn(() => Promise.resolve(true)),
    pluginCaller,
    connectorRegistrations: vi.fn(() => workflowRunConnectorRegistrations),
    connectorAccountAuthorizer: vi.fn(() => undefined),
    runWorkflowArtifact,
    rememberActiveWorkflowRun: vi.fn(),
    forgetActiveWorkflowRunsForController: vi.fn(),
    emitWorkflowEvent: vi.fn(),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowRecoverRunIpc(deps);

  return {
    artifact,
    deps,
    handlers,
    host,
    runWorkflowArtifact,
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
