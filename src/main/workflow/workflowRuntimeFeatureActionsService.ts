import type { DesktopEvent } from "../../shared/desktopTypes";
import type { AmbientPluginRegistry } from "../../shared/pluginTypes";
import type { PermissionMode, PermissionRequest } from "../../shared/permissionTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  WorkflowAmbientCliCapabilityGrant,
  WorkflowAgentThreadSummary,
  WorkflowDashboard,
  WorkflowRecoveryAction,
} from "../../shared/workflowTypes";
import type { AmbientRetryPolicy } from "./workflowAmbientFacade";
import type {
  WorkflowConnectorAccountAuthorizer,
  WorkflowConnectorDescriptor,
  WorkflowConnectorRegistration,
} from "./workflowConnectors";
import type { WorkflowBrowserAdapter, WorkflowDesktopToolBridgeOptions } from "./workflowDesktopTools";
import type { RunWorkflowThreadExplorationInput, WorkflowExplorationProvider } from "./workflowExplorationService";
import type { PluginMcpToolRegistration } from "./workflowPluginsFacade";
import type { ProjectStore } from "./workflowProjectStoreFacade";
import type { WorkflowRecoveryPlan } from "./workflowRecovery";
import type { RunWorkflowArtifactInput } from "./workflowRunService";
import type { CompileWorkflowArtifactInput } from "./workflowWorkflowCompilerServiceFacade";

type CompileWorkflowArtifactInputForStore<Store> = Omit<CompileWorkflowArtifactInput, "store"> & { store: Store };
type RunWorkflowArtifactInputForStore<Store, Browser extends WorkflowBrowserAdapter> = Omit<
  RunWorkflowArtifactInput,
  "browser" | "store"
> & {
  browser?: Browser;
  store: Store;
};
type RunWorkflowThreadExplorationInputForStore<Store, Browser extends WorkflowBrowserAdapter> = Omit<
  RunWorkflowThreadExplorationInput,
  "browser" | "store"
> & {
  browser?: Browser;
  store: Store;
};

export interface WorkflowRuntimeFeatureHostContext<
  Store extends WorkflowRuntimeFeatureActionsStore = ProjectStore,
  Browser extends WorkflowBrowserAdapter = WorkflowBrowserAdapter,
> {
  store: Store;
  browserService: Browser;
  activeThreadId(): string;
}

export interface WorkflowRuntimeFeatureActionsStore {
  getThread(threadId: string): ThreadSummary;
  getWorkflowAgentThreadSummary(workflowThreadId: string): WorkflowAgentThreadSummary;
  listWorkflowAgentFolders(): Array<{
    threads: WorkflowAgentThreadSummary[];
  }>;
  getWorkspace(): { statePath: string };
  getWorkflowArtifact(artifactId: string): {
    id: string;
    workflowThreadId?: string;
    status: string;
  };
  getWorkflowRun(runId: string): {
    id: string;
    artifactId: string;
    status: string;
  };
}

export interface WorkflowRuntimeFeatureActionsDependencies<
  Store extends WorkflowRuntimeFeatureActionsStore,
  Browser extends WorkflowBrowserAdapter,
> {
  defaultContext(): WorkflowRuntimeFeatureHostContext<Store, Browser>;
  activeWorkflowRunController(runId: string): AbortController | undefined;
  ambientCliCapabilityGrantsForWorkflowRequest(
    workspacePath: string,
    request: string,
  ): Promise<WorkflowAmbientCliCapabilityGrant[]>;
  buildWorkflowRecoveryPlan(
    store: Store,
    input: {
      runId: string;
      eventId: string;
      action: WorkflowRecoveryAction;
      graphNodeId?: string;
      itemKey?: string;
    },
  ): WorkflowRecoveryPlan;
  compileWorkflowArtifact(input: CompileWorkflowArtifactInputForStore<Store>): Promise<WorkflowDashboard>;
  connectorAccountAuthorizer(): WorkflowConnectorAccountAuthorizer | undefined;
  connectorDescriptors(): WorkflowConnectorDescriptor[];
  connectorRegistrations(): WorkflowConnectorRegistration[];
  createExplorationProvider(input: {
    apiKey?: string;
    baseUrl: string;
    retryPolicy?: AmbientRetryPolicy;
  }): WorkflowExplorationProvider;
  emitDesktopEvent(event: DesktopEvent): void;
  emitWorkflowEvent(event: DesktopEvent, workspacePath: string): void;
  emitWorkflowUpdated(workspacePath: string): void;
  ensureWorkflowPluginTrusted(
    thread: ThreadSummary,
    registration: PluginMcpToolRegistration,
    store: Store,
  ): Promise<boolean>;
  forgetActiveWorkflowRunsForController(controller: AbortController): void;
  listPluginMcpRegistrationsForThread(thread: ThreadSummary, store: Store): Promise<PluginMcpToolRegistration[]>;
  listPluginRegistry(workspacePath: string, store: Store): Promise<AmbientPluginRegistry>;
  markStaleWorkflowRunForRecoveryIfNeeded(
    store: Store,
    runId: string,
    input: {
      recoveryAction: WorkflowRecoveryAction;
      sourceEventId: string;
      reason: string;
    },
  ): void;
  pluginCaller: WorkflowDesktopToolBridgeOptions["pluginCaller"];
  providerStatus(model: string): { model: string; baseUrl: string };
  readAmbientApiKey(): string | undefined;
  rememberActiveWorkflowRun(runId: string, controller: AbortController, workspacePath: string): void;
  requestPermissionWithGrantRegistry(
    request: Omit<PermissionRequest, "id">,
    input: {
      thread: ThreadSummary;
      permissionMode: PermissionMode;
      workspacePath: string;
      workflowThreadId?: string;
      store: Store;
    },
  ): Promise<{ allowed: boolean }>;
  retryPolicy(store: Store): AmbientRetryPolicy | undefined;
  reviewWorkflowArtifact(store: Store, input: { artifactId: string; decision: "approved" | "rejected" }): WorkflowDashboard;
  runWorkflowArtifact(input: RunWorkflowArtifactInputForStore<Store, Browser>): Promise<WorkflowDashboard>;
  runWorkflowThreadExploration(input: RunWorkflowThreadExplorationInputForStore<Store, Browser>): Promise<{
    thread: WorkflowAgentThreadSummary;
    trace: { id: string };
    graphSnapshot: { id: string };
  }>;
  searchRoutingSettings(): SearchRoutingSettings;
  toolDescriptorsFromPluginRegistry(
    registry: AmbientPluginRegistry,
    registrations: PluginMcpToolRegistration[],
  ): CompileWorkflowArtifactInput["toolDescriptors"];
  workspaceInventoryConnector(workspacePath: string): WorkflowConnectorRegistration;
  workspaceStateForThread(thread: ThreadSummary, store: Store): { name: string; path: string };
}

export interface WorkflowRuntimeFeatureActionsService<
  Store extends WorkflowRuntimeFeatureActionsStore,
  Browser extends WorkflowBrowserAdapter,
> {
  runExploration(input: { workflowThreadId: string; reason: string }, context?: WorkflowRuntimeFeatureHostContext<Store, Browser>): Promise<{
    thread: WorkflowAgentThreadSummary;
    traceId: string;
    graphSnapshotId: string;
    text: string;
  }>;
  compilePreview(input: { workflowThreadId: string; reason: string }, context?: WorkflowRuntimeFeatureHostContext<Store, Browser>): Promise<{
    thread: WorkflowAgentThreadSummary;
    artifactId?: string;
    runId?: string;
    text: string;
  }>;
  reviewArtifact(input: {
    workflowThreadId: string;
    artifactId: string;
    decision: "approved" | "rejected";
    reason: string;
  }, context?: WorkflowRuntimeFeatureHostContext<Store, Browser>): Promise<{
    thread: WorkflowAgentThreadSummary;
    artifactId: string;
    artifactStatus: string;
    changed: boolean;
    text: string;
  }>;
  cancelRun(input: { workflowThreadId: string; runId: string; reason: string }, context?: WorkflowRuntimeFeatureHostContext<Store, Browser>): Promise<{
    thread: WorkflowAgentThreadSummary;
    runId: string;
    runStatus: string;
    changed: boolean;
    text: string;
  }>;
  recoverRun(input: {
    workflowThreadId: string;
    runId: string;
    eventId: string;
    action: WorkflowRecoveryAction;
    graphNodeId?: string;
    itemKey?: string;
    reason: string;
  }, context?: WorkflowRuntimeFeatureHostContext<Store, Browser>): Promise<{
    thread: WorkflowAgentThreadSummary;
    runId: string;
    runStatus?: string;
    changed: boolean;
    text: string;
  }>;
}

export function createWorkflowRuntimeFeatureActionsService<
  Store extends WorkflowRuntimeFeatureActionsStore,
  Browser extends WorkflowBrowserAdapter,
>(
  dependencies: WorkflowRuntimeFeatureActionsDependencies<Store, Browser>,
): WorkflowRuntimeFeatureActionsService<Store, Browser> {
  const hostContext = (context?: WorkflowRuntimeFeatureHostContext<Store, Browser>) => context ?? dependencies.defaultContext();

  async function runExploration(
    input: { workflowThreadId: string; reason: string },
    context?: WorkflowRuntimeFeatureHostContext<Store, Browser>,
  ) {
    const targetContext = hostContext(context);
    const targetStore = targetContext.store;
    const thread = targetStore.getThread(targetContext.activeThreadId());
    const workflowThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
    const workflowWorkspacePath = workflowThread.projectPath || thread.workspacePath;
    const providerStatus = dependencies.providerStatus(thread.model);
    const pluginThread = { ...thread, workspacePath: workflowWorkspacePath };
    const pluginRegistrations = await dependencies.listPluginMcpRegistrationsForThread(pluginThread, targetStore);
    const pluginRegistry = await dependencies.listPluginRegistry(workflowWorkspacePath, targetStore);
    const retryPolicy = dependencies.retryPolicy(targetStore);
    const result = await dependencies.runWorkflowThreadExploration({
      store: targetStore,
      workflowThreadId: input.workflowThreadId,
      toolDescriptors: dependencies.toolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
      connectorDescriptors: dependencies.connectorDescriptors(),
      connectorRegistrations: [
        dependencies.workspaceInventoryConnector(workflowWorkspacePath),
        ...dependencies.connectorRegistrations(),
      ],
      connectorAccountAuthorizer: dependencies.connectorAccountAuthorizer(),
      pluginRegistrations,
      ambientCliCapabilities: await dependencies.ambientCliCapabilityGrantsForWorkflowRequest(
        workflowWorkspacePath,
        workflowThread.initialRequest,
      ),
      workspacePath: workflowWorkspacePath,
      permissionMode: thread.permissionMode,
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy,
      browser: targetContext.browserService,
      requestPermission: async (request) =>
        (
          await dependencies.requestPermissionWithGrantRegistry(request, {
            thread,
            permissionMode: thread.permissionMode,
            workspacePath: workflowWorkspacePath,
            workflowThreadId: input.workflowThreadId,
            store: targetStore,
          })
        ).allowed,
      ensurePluginTrusted: (registration) => dependencies.ensureWorkflowPluginTrusted(thread, registration, targetStore),
      pluginCaller: dependencies.pluginCaller,
      provider: dependencies.createExplorationProvider({
        apiKey: dependencies.readAmbientApiKey(),
        baseUrl: providerStatus.baseUrl,
        retryPolicy,
      }),
      onProgress: (progress) =>
        dependencies.emitWorkflowEvent({ type: "workflow-exploration-progress", progress }, workflowWorkspacePath),
    });
    const folders = targetStore.listWorkflowAgentFolders();
    const updatedThread =
      folders.flatMap((folder) => folder.threads).find((candidate) => candidate.id === input.workflowThreadId) ?? result.thread;
    dependencies.emitWorkflowUpdated(workflowWorkspacePath);
    return {
      thread: updatedThread,
      traceId: result.trace.id,
      graphSnapshotId: result.graphSnapshot.id,
      text: [
        "Workflow Agent exploration completed",
        `Workflow: ${updatedThread.title} (${updatedThread.id})`,
        `Trace: ${result.trace.id}`,
        `Graph snapshot: ${result.graphSnapshot.id}`,
        `Reason: ${input.reason}`,
      ].join("\n"),
    };
  }

  async function compilePreview(
    input: { workflowThreadId: string; reason: string },
    context?: WorkflowRuntimeFeatureHostContext<Store, Browser>,
  ) {
    const targetContext = hostContext(context);
    const targetStore = targetContext.store;
    const workflowThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
    const userRequest = workflowThread.initialRequest.trim();
    if (!userRequest) throw new Error("Workflow Agent compile requires a non-empty initial request.");
    const thread = targetStore.getThread(targetContext.activeThreadId());
    const activeWorkspace = dependencies.workspaceStateForThread(thread, targetStore);
    const provider = dependencies.providerStatus(thread.model);
    const pluginRegistrations = await dependencies.listPluginMcpRegistrationsForThread(thread, targetStore);
    const pluginRegistry = await dependencies.listPluginRegistry(thread.workspacePath, targetStore);
    const dashboard = await dependencies.compileWorkflowArtifact({
      store: targetStore,
      userRequest,
      workflowThreadId: input.workflowThreadId,
      workspaceSummary: [
        `Workspace: ${activeWorkspace.name}`,
        `Path: ${activeWorkspace.path}`,
        `Permission mode: ${thread.permissionMode}`,
        `Remote workflow command reason: ${input.reason}`,
      ].join("\n"),
      toolDescriptors: dependencies.toolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
      pluginRegistrations,
      connectorDescriptors: dependencies.connectorDescriptors(),
      stateRoot: targetStore.getWorkspace().statePath,
      model: thread.model,
      permissionMode: thread.permissionMode,
      searchRoutingSettings: dependencies.searchRoutingSettings(),
      baseUrl: provider.baseUrl,
      retryPolicy: dependencies.retryPolicy(targetStore),
      onProgress: (progress) => dependencies.emitWorkflowEvent({ type: "workflow-compile-progress", progress }, thread.workspacePath),
    });
    dependencies.emitWorkflowUpdated(thread.workspacePath);
    const folders = targetStore.listWorkflowAgentFolders();
    const updatedThread =
      folders.flatMap((folder) => folder.threads).find((candidate) => candidate.id === input.workflowThreadId)
      ?? targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
    const artifact = dashboard.artifacts.find((candidate) => candidate.workflowThreadId === input.workflowThreadId) ?? dashboard.artifacts[0];
    const run = artifact
      ? dashboard.runs.filter((candidate) => candidate.artifactId === artifact.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      : dashboard.runs[0];
    return {
      thread: updatedThread,
      ...(artifact ? { artifactId: artifact.id } : {}),
      ...(run ? { runId: run.id } : {}),
      text: [
        "Workflow Agent compile preview completed",
        `Workflow: ${updatedThread.title} (${updatedThread.id})`,
        artifact ? `Artifact: ${artifact.title} (${artifact.id})` : undefined,
        run ? `Run: ${run.status} (${run.id})` : undefined,
        `Reason: ${input.reason}`,
      ].filter((line): line is string => Boolean(line)).join("\n"),
    };
  }

  async function reviewArtifact(
    input: {
      workflowThreadId: string;
      artifactId: string;
      decision: "approved" | "rejected";
      reason: string;
    },
    context?: WorkflowRuntimeFeatureHostContext<Store, Browser>,
  ) {
    const targetContext = hostContext(context);
    const targetStore = targetContext.store;
    const before = targetStore.getWorkflowArtifact(input.artifactId);
    if (before.workflowThreadId !== input.workflowThreadId) {
      throw new Error("Workflow preview artifact does not belong to the selected Workflow Agent thread.");
    }
    const currentThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
    const workflowWorkspacePath = currentThread.projectPath || targetStore.getThread(targetContext.activeThreadId()).workspacePath;
    if (before.status === input.decision) {
      return {
        thread: currentThread,
        artifactId: before.id,
        artifactStatus: before.status,
        changed: false,
        text: [
          input.decision === "approved" ? "Workflow preview was already approved" : "Workflow preview was already rejected",
          `Workflow: ${currentThread.title} (${currentThread.id})`,
          `Artifact: ${before.id}`,
          `Artifact status: ${before.status}`,
          `Reason: ${input.reason}`,
        ].join("\n"),
      };
    }
    if (before.status !== "ready_for_preview") {
      throw new Error(`Workflow preview artifact is ${before.status}; only ready_for_preview artifacts can be approved or rejected remotely.`);
    }
    const dashboard = dependencies.reviewWorkflowArtifact(targetStore, {
      artifactId: input.artifactId,
      decision: input.decision,
    });
    dependencies.emitWorkflowUpdated(workflowWorkspacePath);
    const artifact = dashboard.artifacts.find((candidate) => candidate.id === input.artifactId) ?? targetStore.getWorkflowArtifact(input.artifactId);
    const thread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
    return {
      thread,
      artifactId: artifact.id,
      artifactStatus: artifact.status,
      changed: before.status !== artifact.status,
      text: [
        input.decision === "approved" ? "Workflow preview approved" : "Workflow preview rejected",
        `Workflow: ${thread.title} (${thread.id})`,
        `Artifact: ${artifact.id}`,
        `Artifact status: ${before.status} -> ${artifact.status}`,
        `Reason: ${input.reason}`,
      ].join("\n"),
    };
  }

  async function cancelRun(
    input: { workflowThreadId: string; runId: string; reason: string },
    context?: WorkflowRuntimeFeatureHostContext<Store, Browser>,
  ) {
    const targetContext = hostContext(context);
    const targetStore = targetContext.store;
    const run = targetStore.getWorkflowRun(input.runId);
    const artifact = targetStore.getWorkflowArtifact(run.artifactId);
    if (artifact.workflowThreadId !== input.workflowThreadId) {
      throw new Error("Workflow run does not belong to the selected Workflow Agent thread.");
    }
    const thread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
    const workflowWorkspacePath = thread.projectPath || targetStore.getThread(targetContext.activeThreadId()).workspacePath;
    if (run.status !== "running") {
      return {
        thread,
        runId: run.id,
        runStatus: run.status,
        changed: false,
        text: [
          "Workflow run is not running",
          `Workflow: ${thread.title} (${thread.id})`,
          `Run: ${run.id}`,
          `Run status: ${run.status}`,
          `Reason: ${input.reason}`,
        ].join("\n"),
      };
    }
    const controller = dependencies.activeWorkflowRunController(run.id);
    if (!controller) {
      return {
        thread,
        runId: run.id,
        runStatus: run.status,
        changed: false,
        text: [
          "Workflow run is marked running but has no active runtime controller in this process.",
          `Workflow: ${thread.title} (${thread.id})`,
          `Run: ${run.id}`,
          "Use Desktop workflow status to inspect whether this run was started by another runtime.",
          `Reason: ${input.reason}`,
        ].join("\n"),
      };
    }
    controller.abort();
    dependencies.emitWorkflowUpdated(workflowWorkspacePath);
    return {
      thread,
      runId: run.id,
      runStatus: run.status,
      changed: true,
      text: [
        "Workflow cancellation requested",
        `Workflow: ${thread.title} (${thread.id})`,
        `Run: ${run.id}`,
        `Run status: ${run.status}`,
        `Reason: ${input.reason}`,
      ].join("\n"),
    };
  }

  async function recoverRun(
    input: {
      workflowThreadId: string;
      runId: string;
      eventId: string;
      action: WorkflowRecoveryAction;
      graphNodeId?: string;
      itemKey?: string;
      reason: string;
    },
    context?: WorkflowRuntimeFeatureHostContext<Store, Browser>,
  ) {
    const targetContext = hostContext(context);
    const targetStore = targetContext.store;
    const plan = dependencies.buildWorkflowRecoveryPlan(targetStore, {
      runId: input.runId,
      eventId: input.eventId,
      action: input.action,
      ...(input.graphNodeId ? { graphNodeId: input.graphNodeId } : {}),
      ...(input.itemKey ? { itemKey: input.itemKey } : {}),
    });
    const artifact = targetStore.getWorkflowArtifact(plan.artifactId);
    if (artifact.workflowThreadId !== input.workflowThreadId) {
      throw new Error("Workflow recovery event does not belong to the selected Workflow Agent thread.");
    }
    if (artifact.status !== "approved") {
      throw new Error("Approve this workflow before recovering it.");
    }
    dependencies.markStaleWorkflowRunForRecoveryIfNeeded(targetStore, plan.resumeFromRunId, {
      recoveryAction: plan.recovery.action,
      sourceEventId: plan.recovery.sourceEventId,
      reason: input.reason,
    });
    const ambientThread = targetStore.getThread(targetContext.activeThreadId());
    const workflowThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
    const workflowWorkspacePath = workflowThread.projectPath || ambientThread.workspacePath;
    const provider = dependencies.providerStatus(ambientThread.model);
    const abortController = new AbortController();
    try {
      const pluginThread = { ...ambientThread, workspacePath: workflowWorkspacePath };
      const pluginRegistrations = await dependencies.listPluginMcpRegistrationsForThread(pluginThread, targetStore);
      const pluginRegistry = await dependencies.listPluginRegistry(workflowWorkspacePath, targetStore);
      const dashboard = await dependencies.runWorkflowArtifact({
        store: targetStore,
        artifactId: plan.artifactId,
        workspacePath: workflowWorkspacePath,
        permissionMode: ambientThread.permissionMode,
        browser: targetContext.browserService,
        requestPermission: async (request) =>
          (
            await dependencies.requestPermissionWithGrantRegistry(request, {
              thread: ambientThread,
              permissionMode: ambientThread.permissionMode,
              workspacePath: workflowWorkspacePath,
              workflowThreadId: input.workflowThreadId,
              store: targetStore,
            })
          ).allowed,
        pluginRegistrations,
        pluginRegistry,
        ensurePluginTrusted: (registration) => dependencies.ensureWorkflowPluginTrusted(ambientThread, registration, targetStore),
        pluginCaller: dependencies.pluginCaller,
        connectorRegistrations: dependencies.connectorRegistrations(),
        connectorAccountAuthorizer: dependencies.connectorAccountAuthorizer(),
        model: ambientThread.model,
        baseUrl: provider.baseUrl,
        mode: "execute",
        runtime: "automation",
        resumeFromRunId: plan.resumeFromRunId,
        recovery: plan.recovery,
        abortSignal: abortController.signal,
        onRunStarted: (runId) => {
          dependencies.rememberActiveWorkflowRun(runId, abortController, workflowWorkspacePath);
          dependencies.emitDesktopEvent({
            type: "workflow-run-started",
            runId,
            artifactId: artifact.id,
            workflowThreadId: artifact.workflowThreadId,
            workspacePath: workflowWorkspacePath,
          } satisfies DesktopEvent);
          dependencies.emitWorkflowUpdated(workflowWorkspacePath);
        },
        onEvent: () => dependencies.emitWorkflowUpdated(workflowWorkspacePath),
      });
      dependencies.emitWorkflowUpdated(workflowWorkspacePath);
      const recoveredRun =
        dashboard.runs
          .filter((candidate) => candidate.artifactId === artifact.id && candidate.id !== plan.resumeFromRunId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? dashboard.runs[0];
      const updatedThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
      return {
        thread: updatedThread,
        runId: recoveredRun?.id ?? plan.resumeFromRunId,
        runStatus: recoveredRun?.status,
        changed: Boolean(recoveredRun),
        text: [
          "Workflow recovery run completed",
          `Workflow: ${updatedThread.title} (${updatedThread.id})`,
          `Source run: ${plan.resumeFromRunId}`,
          `Source event: ${plan.recovery.sourceEventId}`,
          `Recovery action: ${plan.recovery.action}`,
          plan.recovery.targetGraphNodeId ? `Graph node: ${plan.recovery.targetGraphNodeId}` : undefined,
          plan.recovery.targetItemKey ? `Item key: ${plan.recovery.targetItemKey}` : undefined,
          recoveredRun ? `Recovered run: ${recoveredRun.status} (${recoveredRun.id})` : undefined,
          "Execution boundary: recovery used the typed workflow recovery plan and the normal runWorkflowArtifact model/tool/approval lane.",
          `Reason: ${input.reason}`,
        ].filter((line): line is string => Boolean(line)).join("\n"),
      };
    } finally {
      dependencies.forgetActiveWorkflowRunsForController(abortController);
    }
  }

  return {
    runExploration,
    compilePreview,
    reviewArtifact,
    cancelRun,
    recoverRun,
  };
}
