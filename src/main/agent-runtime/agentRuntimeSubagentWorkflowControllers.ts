import type { DesktopEvent } from "../../shared/desktopTypes";
import { isAmbientSubagentsEnabled, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ContextUsageSnapshot, ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import { AgentRuntimeCallableWorkflowController } from "./agentRuntimeCallableWorkflowController";
import { AgentRuntimeCallableWorkflowSymphonyBridgeController } from "./agentRuntimeCallableWorkflowSymphonyBridgeController";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import { AgentRuntimeFinalizationCoordinator } from "./agentRuntimeFinalizationCoordinator";
import type { AgentRuntimeModelContextController } from "./agentRuntimeModelContextController";
import type { PermissionPromptRequester } from "./agentRuntimePermissionsFacade";
import type { SubagentRuntimeEventEmitter } from "./agentRuntimePiFacade";
import type { AmbientPluginHost } from "./agentRuntimePluginsFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import { AgentRuntimeSubagentActionController } from "./agentRuntimeSubagentActionController";
import { AgentRuntimeSubagentCapacityController } from "./agentRuntimeSubagentCapacityController";
import { AgentRuntimeSubagentChildLifecycleCoordinator } from "./agentRuntimeSubagentChildLifecycleCoordinator";
import type { SubagentChildExecutionRecord } from "./agentRuntimeSubagentChildLifecycleTypes";
import { AgentRuntimeSubagentChildRuntimeRouter } from "./agentRuntimeSubagentChildRuntimeRouter";
import { AgentRuntimeSubagentChildTurnCoordinator } from "./agentRuntimeSubagentChildTurnCoordinator";
import { AgentRuntimeSubagentStopCascadeController } from "./agentRuntimeSubagentStopCascadeController";
import type { SubagentPiToolStore } from "./agentRuntimeSubagentsFacade";
import {
  AgentRuntimeWorkflowRecordingReviewSessionController,
  type WorkflowRecordingReviewPiSession,
} from "./agentRuntimeWorkflowRecordingReviewSessionController";
import type { BrowserService } from "./agentRuntimeBrowserFacade";
import type { LocalModelRuntimeManager, LocalTextSubagentRuntimeStore } from "./agentRuntimeLocalRuntimeFacade";
import { AgentRuntimeLocalRuntimeOwnershipController } from "./agentRuntimeLocalRuntimeOwnershipController";

export interface AgentRuntimeSubagentWorkflowControllerOptions {
  store: ProjectStore;
  browser: BrowserService;
  permissions: PermissionPromptRequester & {
    listPending?: AgentRuntimeSubagentChildLifecycleCoordinatorOptions["permissions"]["listPending"];
    respond?: AgentRuntimeSubagentChildLifecycleCoordinatorOptions["permissions"]["respond"];
  };
  pluginHost: AmbientPluginHost;
  features: AgentRuntimeFeatures;
  activeRuns: Pick<Map<string, unknown>, "has">;
  activeRunIds: Pick<Map<string, string>, "get">;
  subagentChildExecutions: Map<string, SubagentChildExecutionRecord>;
  callableWorkflowTaskAbortControllers: Map<string, AbortController>;
  callableWorkflowRunTaskIds: Map<string, string>;
  localModelRuntimeManager: LocalModelRuntimeManager;
  modelContext: AgentRuntimeModelContextController;
  callbacks: {
    abortChildThread: (threadId: string, options?: { skipSubagentChildCancellation?: boolean }) => Promise<void>;
    currentFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
    emit: (event: DesktopEvent) => void;
    emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
    prepareChildWorktree: (run: SubagentRunSummary) => Promise<ThreadWorktreeSummary | undefined>;
    recordContextUsageSnapshot: (threadId: string, session: WorkflowRecordingReviewPiSession, message?: string) => ContextUsageSnapshot;
    resolveModelRuntimeProfile: (modelId?: string) => AmbientModelRuntimeProfile;
    send: (input: RuntimeSendMessageInput, hooks?: { awaitInternalRetryCompletion?: boolean }) => Promise<unknown>;
    ensurePluginMcpToolTrusted: AgentRuntimeCallableWorkflowControllerOptions["ensurePluginMcpToolTrusted"];
  };
}

type AgentRuntimeSubagentChildLifecycleCoordinatorOptions = ConstructorParameters<typeof AgentRuntimeSubagentChildLifecycleCoordinator>[0];
type AgentRuntimeCallableWorkflowControllerOptions = ConstructorParameters<typeof AgentRuntimeCallableWorkflowController>[0];

export function createAgentRuntimeSubagentWorkflowControllers({
  activeRunIds,
  activeRuns,
  browser,
  callableWorkflowRunTaskIds,
  callableWorkflowTaskAbortControllers,
  callbacks,
  features,
  localModelRuntimeManager,
  modelContext,
  permissions,
  pluginHost,
  store,
  subagentChildExecutions,
}: AgentRuntimeSubagentWorkflowControllerOptions) {
  const subagentChildRuntimeRouterRef: { current?: AgentRuntimeSubagentChildRuntimeRouter } = {};
  const callableWorkflowsRef: { current?: AgentRuntimeCallableWorkflowController } = {};
  const resolveSubagentChildRuntimeRouter = (): AgentRuntimeSubagentChildRuntimeRouter => {
    const router = subagentChildRuntimeRouterRef.current;
    if (!router) throw new Error("Subagent child runtime router was used before initialization.");
    return router;
  };
  const resolveCallableWorkflows = (): AgentRuntimeCallableWorkflowController => {
    const workflows = callableWorkflowsRef.current;
    if (!workflows) throw new Error("Callable workflow controller was used before initialization.");
    return workflows;
  };

  const subagentActions = new AgentRuntimeSubagentActionController({
    store,
    cancelChildRun: (input) => resolveSubagentChildRuntimeRouter().cancelResolvedChildRun(input),
    retryChildRun: (input) => resolveSubagentChildRuntimeRouter().retryResolvedChildRun(input),
    emit: (event) => callbacks.emit(event),
  });
  const createSubagentEventingStore = (): SubagentPiToolStore & LocalTextSubagentRuntimeStore => subagentActions.createEventingStore();
  const createRuntimeCancelEventEmitter = (targetRun: SubagentRunSummary): SubagentRuntimeEventEmitter =>
    subagentActions.createCancelEventEmitter(targetRun);
  const createRuntimeRetryEventEmitter = (targetRun: SubagentRunSummary): SubagentRuntimeEventEmitter =>
    subagentActions.createRetryEventEmitter(targetRun);
  const emitSubagentParentMailboxEventUpdated = (event: ReturnType<ProjectStore["getSubagentParentMailboxEvent"]>): void => {
    subagentActions.emitParentMailboxEventUpdated(event);
  };
  const emitSubagentRunAndChildThreadUpdated = (run: SubagentRunSummary): void => {
    subagentActions.emitRunAndChildThreadUpdated(run);
  };
  const emitSubagentWaitBarrierUpdated = (barrier: SubagentWaitBarrierSummary): void => {
    subagentActions.emitWaitBarrierUpdated(barrier);
  };

  const subagentStopCascade = new AgentRuntimeSubagentStopCascadeController({
    store,
    activeRuns,
    currentFeatureFlagSnapshot: () => callbacks.currentFeatureFlagSnapshot(),
    abortChildThread: (threadId) => callbacks.abortChildThread(threadId),
    latestSubagentRunEventSequence: (runId) => subagentActions.latestRunEventSequence(runId),
    emit: (event) => callbacks.emit(event),
    emitSubagentRunAndChildThreadUpdated,
    emitSubagentRunEventsSince: (run, sequence) => subagentActions.emitRunEventsSince(run, sequence),
    emitSubagentWaitBarrierUpdated,
    emitSubagentParentMailboxEventUpdated,
  });
  const finalizationCoordinator = new AgentRuntimeFinalizationCoordinator({
    store,
    emit: (event) => callbacks.emit(event),
    resolveTerminalChildWaitBarriers: (run, reason) => subagentStopCascade.resolveTerminalChildWaitBarriers(run, reason),
  });
  const subagentChildTurns = new AgentRuntimeSubagentChildTurnCoordinator({
    store,
    resolveTerminalChildWaitBarriers: (run, reason) => subagentStopCascade.resolveTerminalChildWaitBarriers(run, reason),
  });
  const subagentChildLifecycle = new AgentRuntimeSubagentChildLifecycleCoordinator({
    store,
    executions: subagentChildExecutions,
    permissions,
    send: (input, hooks) => callbacks.send(input, hooks),
    abortChildThread: (threadId, options) => callbacks.abortChildThread(threadId, options),
    emit: (event) => callbacks.emit(event),
    emitSubagentParentMailboxEventUpdated,
    resolveTerminalChildWaitBarriers: (run, reason) => subagentStopCascade.resolveTerminalChildWaitBarriers(run, reason),
    completeTurnAfterSend: (input) => subagentChildTurns.completeTurnAfterSend(input),
    recordFollowupExhausted: (input) => {
      subagentChildTurns.recordFollowupExhausted(input);
    },
    recordGroupedCompletionIfNeeded: (run, summary) => {
      subagentChildTurns.recordGroupedCompletionIfNeeded(run, summary);
    },
  });
  const subagentChildRuntimeRouter = new AgentRuntimeSubagentChildRuntimeRouter({
    store,
    runtimeFeature: features.localTextSubagents,
    defaultRuntime: subagentChildLifecycle,
    createEventingStore: createSubagentEventingStore,
    fallbackRuntimeManager: localModelRuntimeManager,
    readLocalModelResourceSettings: () => features.localDeepResearch?.readSettings?.().localModelResources,
    localModelHostMemory: features.localModelHostMemory,
    subagentsDisabledRuntimeSnapshot: () => currentSubagentsDisabledRuntimeSnapshot(callbacks.currentFeatureFlagSnapshot),
  });
  subagentChildRuntimeRouterRef.current = subagentChildRuntimeRouter;
  const subagentCapacity = new AgentRuntimeSubagentCapacityController({
    store,
    runtimeManager: localModelRuntimeManager,
    readLocalModelResourceSettings: () => features.localDeepResearch?.readSettings?.().localModelResources,
    localModelHostMemory: features.localModelHostMemory,
  });
  const workflowRecordingReviewSessions = new AgentRuntimeWorkflowRecordingReviewSessionController({
    store,
    emit: (event) => callbacks.emit(event),
    createProviderCallContextPreflightExtension: (threadId, workspacePath, model) =>
      modelContext.createProviderCallContextPreflightExtension(threadId, workspacePath, model),
    createModelReasoningPayloadExtension: (threadId, model) => modelContext.createModelReasoningPayloadExtension(threadId, model),
    createContextAccountingExtension: (threadId, model) => modelContext.createContextAccountingExtension(threadId, model),
    recordContextUsageSnapshot: (threadId, session, message) => callbacks.recordContextUsageSnapshot(threadId, session, message),
  });
  const callableWorkflowSymphonyBridge = new AgentRuntimeCallableWorkflowSymphonyBridgeController({
    store,
    createSubagentEventingStore,
    getFeatureFlagSnapshot: () => callbacks.currentFeatureFlagSnapshot(),
    resolveSymphonyLaunchContract: features.symphonyLaunchContracts?.resolve,
    resolveModelRuntimeProfile: (modelId) => callbacks.resolveModelRuntimeProfile(modelId),
    resolveCapacityLease: (input) => subagentCapacity.resolveCapacityLease(input),
    prepareChildWorktree: (input) => callbacks.prepareChildWorktree(input.run),
    runtime: {
      startChildRun: (input) => subagentChildRuntimeRouter.startResolvedChildRun(input),
      waitForChildRun: (input) => subagentChildRuntimeRouter.waitForResolvedChildRun(input),
      cancelChildRun: (input) => subagentChildRuntimeRouter.cancelResolvedChildRun(input),
      followupChildRun: (input) => subagentChildRuntimeRouter.followupResolvedChildRun(input),
      retryChildRun: (input) => subagentChildRuntimeRouter.retryResolvedChildRun(input),
      resolveChildApprovalResponse: (input) => subagentChildRuntimeRouter.resolveResolvedChildApprovalResponse(input),
    },
    createRuntimeCancelEventEmitter,
    createRuntimeRetryEventEmitter,
    emitCallableWorkflowTaskUpdated: (task) => callbacks.emitCallableWorkflowTaskUpdated(task),
    emitSubagentWaitBarrierUpdated,
  });
  const callableWorkflows = new AgentRuntimeCallableWorkflowController({
    store,
    browser,
    permissionRequester: permissions,
    pluginHost: {
      enabledCodexPlugins: (...args) => pluginHost.enabledCodexPlugins(...args),
      buildCodexPluginMcpToolRegistrations: (...args) => pluginHost.buildCodexPluginMcpToolRegistrations(...args),
      listRegistry: (...args) => pluginHost.listRegistry(...args),
      callCodexPluginMcpTool: (...args) => pluginHost.callCodexPluginMcpTool(...args),
    },
    activeRunIds,
    taskAbortControllers: callableWorkflowTaskAbortControllers,
    runTaskIds: callableWorkflowRunTaskIds,
    workflowNativeTools: features.workflowNativeTools,
    readSearchRoutingSettings: features.search?.readSettings,
    getFeatureFlagSnapshot: () => callbacks.currentFeatureFlagSnapshot(),
    ensurePluginMcpToolTrusted: (threadId, workspace, registration) =>
      callbacks.ensurePluginMcpToolTrusted(threadId, workspace, registration),
    executeCallableWorkflowTaskForThread: (threadId, taskId, workspace) =>
      resolveCallableWorkflows().executeTaskForThread(threadId, taskId, workspace),
    cancelCallableWorkflowSymphonyChildWait: (task, reason) => callableWorkflowSymphonyBridge.cancelChildWait(task, reason),
    launchWorkflowSubagents: (input) => callableWorkflowSymphonyBridge.launchSubagents(input),
    emitCallableWorkflowTaskUpdated: (task) => callbacks.emitCallableWorkflowTaskUpdated(task),
    emit: (event) => callbacks.emit(event),
  });
  callableWorkflowsRef.current = callableWorkflows;
  const localRuntimeOwnership = new AgentRuntimeLocalRuntimeOwnershipController({
    store,
    createSubagentEventingStore,
    cancelChildRun: (cancelInput) => subagentChildRuntimeRouter.cancelResolvedChildRun(cancelInput),
    createRuntimeCancelEventEmitter,
    emitSubagentRunAndChildThreadUpdated,
  });

  return {
    callableWorkflowSymphonyBridge,
    callableWorkflows,
    finalizationCoordinator,
    localRuntimeOwnership,
    subagentActions,
    subagentCapacity,
    subagentChildLifecycle,
    subagentChildRuntimeRouter,
    subagentChildTurns,
    subagentStopCascade,
    workflowRecordingReviewSessions,
  };
}

export type AgentRuntimeSubagentWorkflowControllers = ReturnType<typeof createAgentRuntimeSubagentWorkflowControllers>;

function currentSubagentsDisabledRuntimeSnapshot(
  currentFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot,
): AmbientFeatureFlagSnapshot | undefined {
  const snapshot = currentFeatureFlagSnapshot();
  return isAmbientSubagentsEnabled(snapshot) ? undefined : snapshot;
}
