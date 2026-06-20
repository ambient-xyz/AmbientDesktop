import { describe, expect, it, vi } from "vitest";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowDashboard, WorkflowRunSummary } from "../../shared/workflowTypes";
import {
  createWorkflowRuntimeFeatureActionsService,
  type WorkflowRuntimeFeatureActionsDependencies,
  type WorkflowRuntimeFeatureActionsStore,
} from "./workflowRuntimeFeatureActionsService";

function thread(id: string, workspacePath = "/workspace"): ThreadSummary {
  return {
    id,
    title: id,
    workspacePath,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-test-model",
    thinkingLevel: "medium",
  };
}

function artifact(input: Partial<WorkflowArtifactSummary> = {}): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "workflow-1",
    title: "Workflow artifact",
    status: "ready_for_preview",
    manifest: { tools: [], mutationPolicy: "read_only" },
    spec: { goal: "Test workflow" },
    sourcePath: "/workspace/workflow.ts",
    statePath: "/workspace/.ambient/workflow",
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...input,
  };
}

function run(input: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: "run-1",
    artifactId: "artifact-1",
    status: "running",
    startedAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...input,
  };
}

function workflowThread(input: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-1",
    folderId: "home",
    projectName: "Workflow Project",
    projectPath: "/workflow-project",
    title: "Workflow One",
    phase: "planned",
    initialRequest: "Summarize the workspace",
    preview: "",
    status: "ready",
    traceMode: "production",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...input,
  };
}

class FakeStore implements WorkflowRuntimeFeatureActionsStore {
  threads = new Map([["active-thread", thread("active-thread", "/ambient-workspace")]]);
  workflowThread = workflowThread();
  folders = [{ threads: [workflowThread({ title: "Updated Workflow One" })] }];
  workspace = { statePath: "/workspace/.ambient" };
  artifacts = new Map<string, ReturnType<typeof artifact>>([["artifact-1", artifact()]]);
  runs = new Map<string, ReturnType<typeof run>>([["run-1", run()]]);

  getThread(threadId: string): ThreadSummary {
    const value = this.threads.get(threadId);
    if (!value) throw new Error(`Missing thread ${threadId}`);
    return value;
  }

  getWorkflowAgentThreadSummary(): FakeStore["workflowThread"] {
    return this.workflowThread;
  }

  listWorkflowAgentFolders(): FakeStore["folders"] {
    return this.folders;
  }

  getWorkspace(): FakeStore["workspace"] {
    return this.workspace;
  }

  getWorkflowArtifact(artifactId: string): ReturnType<typeof artifact> {
    const value = this.artifacts.get(artifactId);
    if (!value) throw new Error(`Missing artifact ${artifactId}`);
    return value;
  }

  getWorkflowRun(runId: string): ReturnType<typeof run> {
    const value = this.runs.get(runId);
    if (!value) throw new Error(`Missing run ${runId}`);
    return value;
  }
}

function dashboard(input: Partial<WorkflowDashboard> = {}): WorkflowDashboard {
  return {
    artifacts: [artifact()],
    runs: [run()],
    ...input,
  };
}

function createHarness(options: { activeController?: AbortController } = {}) {
  const store = new FakeStore();
  const emitDesktopEvent = vi.fn();
  const emitWorkflowEvent = vi.fn();
  const emitWorkflowUpdated = vi.fn();
  const dependencies: WorkflowRuntimeFeatureActionsDependencies<FakeStore, never> = {
    defaultContext: () => ({
      store,
      browserService: undefined as never,
      activeThreadId: () => "active-thread",
    }),
    activeWorkflowRunController: vi.fn(() => options.activeController),
    ambientCliCapabilityGrantsForWorkflowRequest: vi.fn(async () => [
      {
        capabilityId: "capability-1",
        registryPluginId: "registry-1",
        packageId: "package-1",
        packageName: "Package",
        command: "run",
      },
    ]),
    buildWorkflowRecoveryPlan: vi.fn(() => ({
      artifactId: "artifact-1",
      resumeFromRunId: "run-1",
      recovery: {
        action: "retry_step" as const,
        sourceRunId: "run-1",
        sourceEventId: "event-1",
        createdAt: "2026-06-19T00:00:00.000Z",
      },
    })),
    compileWorkflowArtifact: vi.fn(async () => dashboard()),
    connectorAccountAuthorizer: () => vi.fn(),
    connectorDescriptors: () => [],
    connectorRegistrations: () => [],
    createExplorationProvider: vi.fn(() => ({}) as never),
    emitDesktopEvent,
    emitWorkflowEvent,
    emitWorkflowUpdated,
    ensureWorkflowPluginTrusted: vi.fn(async () => true),
    forgetActiveWorkflowRunsForController: vi.fn(),
    listPluginMcpRegistrationsForThread: vi.fn(async () => []),
    listPluginRegistry: vi.fn(async () => ({ plugins: [] }) as never),
    markStaleWorkflowRunForRecoveryIfNeeded: vi.fn(),
    pluginCaller: vi.fn() as never,
    providerStatus: vi.fn((model: string) => ({
      model,
      baseUrl: "https://ambient.test",
    })),
    readAmbientApiKey: vi.fn(() => "ambient-key"),
    rememberActiveWorkflowRun: vi.fn(),
    requestPermissionWithGrantRegistry: vi.fn(async () => ({ allowed: true })),
    retryPolicy: vi.fn(() => undefined),
    reviewWorkflowArtifact: vi.fn(() => dashboard({
      artifacts: [artifact({ status: "approved" })],
      runs: [],
    })),
    runWorkflowArtifact: vi.fn(async (input) => {
      input.onRunStarted?.("recovered-run");
      input.onEvent?.();
      return dashboard({
        artifacts: [artifact({ status: "approved" })],
        runs: [
          run({ id: "run-1", status: "failed" }),
          run({ id: "recovered-run", status: "succeeded", updatedAt: "2026-06-19T00:01:00.000Z" }),
        ],
      });
    }),
    runWorkflowThreadExploration: vi.fn(async () => ({
      thread: workflowThread({ title: "Fallback Workflow" }),
      trace: { id: "trace-1" },
      graphSnapshot: { id: "graph-1" },
    })),
    searchRoutingSettings: () => ({}),
    toolDescriptorsFromPluginRegistry: vi.fn(() => []),
    workspaceInventoryConnector: vi.fn(() => ({ connectorId: "workspace-inventory" }) as never),
    workspaceStateForThread: () => ({ name: "Workspace", path: "/ambient-workspace" }),
  };
  const service = createWorkflowRuntimeFeatureActionsService(dependencies);
  return {
    dependencies,
    emitDesktopEvent,
    emitWorkflowEvent,
    emitWorkflowUpdated,
    service,
    store,
  };
}

describe("workflowRuntimeFeatureActionsService", () => {
  it("runs exploration with project workspace routing and refreshed thread output", async () => {
    const { dependencies, emitWorkflowUpdated, service } = createHarness();

    const result = await service.runExploration({ workflowThreadId: "workflow-1", reason: "remote command" });

    expect(dependencies.ambientCliCapabilityGrantsForWorkflowRequest).toHaveBeenCalledWith(
      "/workflow-project",
      "Summarize the workspace",
    );
    expect(dependencies.runWorkflowThreadExploration).toHaveBeenCalledWith(expect.objectContaining({
      workflowThreadId: "workflow-1",
      workspacePath: "/workflow-project",
      permissionMode: "workspace",
      model: "ambient-test-model",
    }));
    expect(result).toMatchObject({
      thread: { id: "workflow-1", title: "Updated Workflow One" },
      traceId: "trace-1",
      graphSnapshotId: "graph-1",
    });
    expect(result.text).toContain("Workflow Agent exploration completed");
    expect(emitWorkflowUpdated).toHaveBeenCalledWith("/workflow-project");
  });

  it("keeps already-reviewed artifacts idempotent", async () => {
    const { dependencies, emitWorkflowUpdated, service, store } = createHarness();
    store.artifacts.set("artifact-1", artifact({ status: "approved" }));

    const result = await service.reviewArtifact({
      workflowThreadId: "workflow-1",
      artifactId: "artifact-1",
      decision: "approved",
      reason: "already handled",
    });

    expect(result).toMatchObject({
      artifactId: "artifact-1",
      artifactStatus: "approved",
      changed: false,
    });
    expect(dependencies.reviewWorkflowArtifact).not.toHaveBeenCalled();
    expect(emitWorkflowUpdated).not.toHaveBeenCalled();
  });

  it("aborts an active running workflow controller and emits an update", async () => {
    const activeController = new AbortController();
    const abort = vi.spyOn(activeController, "abort");
    const { emitWorkflowUpdated, service } = createHarness({ activeController });

    const result = await service.cancelRun({
      workflowThreadId: "workflow-1",
      runId: "run-1",
      reason: "operator requested",
    });

    expect(abort).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      changed: true,
      runId: "run-1",
      runStatus: "running",
    });
    expect(emitWorkflowUpdated).toHaveBeenCalledWith("/workflow-project");
  });

  it("records recovery lifecycle events and always releases the active controller", async () => {
    const { dependencies, emitDesktopEvent, emitWorkflowUpdated, service, store } = createHarness();
    store.artifacts.set("artifact-1", artifact({ status: "approved" }));

    const result = await service.recoverRun({
      workflowThreadId: "workflow-1",
      runId: "run-1",
      eventId: "event-1",
      action: "retry_step",
      reason: "retry failed step",
    });

    expect(dependencies.markStaleWorkflowRunForRecoveryIfNeeded).toHaveBeenCalledWith(store, "run-1", {
      recoveryAction: "retry_step",
      sourceEventId: "event-1",
      reason: "retry failed step",
    });
    expect(dependencies.rememberActiveWorkflowRun).toHaveBeenCalledWith(
      "recovered-run",
      expect.any(AbortController),
      "/workflow-project",
    );
    expect(emitDesktopEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "workflow-run-started",
      runId: "recovered-run",
      artifactId: "artifact-1",
      workflowThreadId: "workflow-1",
      workspacePath: "/workflow-project",
    }));
    expect(emitWorkflowUpdated).toHaveBeenCalledWith("/workflow-project");
    expect(dependencies.forgetActiveWorkflowRunsForController).toHaveBeenCalledWith(expect.any(AbortController));
    expect(result).toMatchObject({
      runId: "recovered-run",
      runStatus: "succeeded",
      changed: true,
    });
  });
});
