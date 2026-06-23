import type { AgentToolResult, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionPromptResolution, PermissionPromptResponseMode, PermissionRequest } from "../../shared/permissionTypes";
import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { AgentMemoryRuntimeSnapshot } from "../../shared/agentMemoryDiagnostics";
import type { SubagentParentMailboxEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type { ContextUsageSnapshot, ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { CallableWorkflowTaskSummary, WorkflowRecordingLibraryDescription } from "../../shared/workflowTypes";
import { AmbientCliPackageDescriptionState } from "./ambient-cli-package/agentRuntimeAmbientCliPackageDescriptionState";
import { AmbientWorkflowDescriptionState } from "./ambient-workflow/agentRuntimeAmbientWorkflowDescriptionState";
import type { CapabilityBuilderValidateInput, CapabilityBuilderValidateResult } from "./agentRuntimeCapabilityBuilderFacade";
import type { CallableWorkflowParentBlockingBlock } from "./agentRuntimeCallableWorkflowFacade";
import type { AmbientCliSkillMountDiagnostics } from "./agentRuntimeAmbientCliSkillMount";
import { AmbientDownloadService } from "./agentRuntimeAmbientFacade";
import { BrowserCredentialStore, BrowserService, LocalPreviewServerManager } from "./agentRuntimeBrowserFacade";
import type { TransientFileAuthorityRoot } from "./agentRuntimeFileAuthority";
import type { SubagentFinalizationBarrierBlock } from "./agentRuntimeFinalizationBlocking";
import { createAgentRuntimeFoundationControllers } from "./agentRuntimeFoundationControllers";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import type { ResolveFirstPartyPluginPermissionInput } from "./agentRuntimeFirstPartyPluginPermission";
import { AgentRuntimeInstallRouteGuard } from "./agentRuntimeInstallRouteGuard";
import {
  LocalModelRuntimeManager,
  type LocalModelRuntimeRestartPlan,
  type LocalModelRuntimeStopPlan,
  type LocalRuntimeOwnershipResolutionRequest,
  type LocalRuntimeOwnershipResolutionResult,
} from "./agentRuntimeLocalRuntimeFacade";
import type { AmbientFileAuthorityRequest } from "./agentRuntimePiFacade";
import { createAgentRuntimePromptPipelineCallbackAdapters } from "./agentRuntimePromptPipelineCallbackAdapters";
import { createAgentRuntimePromptPipelineControllers } from "./agentRuntimePromptPipelineControllers";
import { runAgentRuntimePromptPreflightBeforePrompt } from "./agentRuntimePromptPreflightBeforePrompt";
import type { AgentRuntimePluginMcpDescriptorDriftInput } from "./agentRuntimePluginPermissionController";
import { AmbientPluginHost, type PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { createAgentRuntimeRemoteSurfaceControls } from "./agentRuntimeRemoteSurfaceControls";
import type { RuntimeSessionRecoveryContext } from "./agentRuntimeAssistantRetryInput";
import type { AgentRuntimeWebResearchControllerOptions } from "./agentRuntimeWebResearchController";
import type { PiSessionFileCommitReason } from "./agentRuntimeSessionFacade";
import type { AgentRuntimePiSession } from "./agentRuntimeSessionFactoryController";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import { type AgentRuntimeSendHooks } from "./agentRuntimeSendOrchestrator";
import {
  createAgentRuntimeServiceControllerCallbackAdapters,
  createAgentRuntimeSubagentWorkflowCallbackAdapters,
} from "./agentRuntimeControllerCallbackAdapters";
import { createAgentRuntimeServiceControllers } from "./agentRuntimeServiceControllers";
import type { SubagentChildExecutionRecord } from "./agentRuntimeSubagentChildLifecycleCoordinator";
import { AgentRuntimeSubagentToolExtensionController } from "./agentRuntimeSubagentToolExtensionController";
import { createAgentRuntimeSubagentWorkflowControllers } from "./agentRuntimeSubagentWorkflowControllers";
import type { SymphonyParentModePolicy, SymphonyParentModeVerifiedLaunch } from "./agentRuntimeSymphonyParentMode";
import { AgentRuntimeRunLifecycleController } from "./agentRuntimeRunLifecycleController";
import { AgentRuntimeToolPermissionController } from "./agentRuntimeToolPermissionController";
import { localToolIdleTimeoutMs } from "./agentRuntimeUtilityHelpers";
import { resolveChatPiEmptyAssistantStallTimeoutMs, resolveWorkflowRecordingReviewStreamIdleTimeoutMs } from "./agentRuntimeTimeouts";
import type { RuntimeAbortContextActiveRun } from "./runtimeAbortContext";
import type { RuntimePermissionWaitControl } from "./runtimePermissionWaitController";

type PiSession = AgentRuntimePiSession;
type ActiveRun = RuntimeAbortContextActiveRun;

const DEFAULT_INTERRUPTED_TOOL_CALL_RECOVERY_MAX_RETRIES = 3;
const CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS = resolveChatPiEmptyAssistantStallTimeoutMs();
const WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS = resolveWorkflowRecordingReviewStreamIdleTimeoutMs();
const CONTEXT_USAGE_UNAVAILABLE_WINDOW = 200_000;

export type AgentRuntimePermissionBridge = {
  request: (
    request: Omit<PermissionRequest, "id">,
    options?: { onRequest?: (request: PermissionRequest) => void },
  ) => Promise<PermissionPromptResolution>;
  denyThread: (threadId: string) => void;
  listPending?: () => PermissionRequest[];
  respond?: (id: string, response: PermissionPromptResponseMode) => void;
};

export type AgentRuntimeControllerInitializerInput = {
  store: ProjectStore;
  browser: BrowserService;
  browserCredentials: BrowserCredentialStore;
  permissions: AgentRuntimePermissionBridge;
  features: AgentRuntimeFeatures;
  sessions: AgentRuntimeSessionRegistry<PiSession>;
  activeRuns: Map<string, ActiveRun>;
  activeRunIds: Map<string, string>;
  subagentChildExecutions: Map<string, SubagentChildExecutionRecord>;
  callableWorkflowTaskAbortControllers: Map<string, AbortController>;
  callableWorkflowRunTaskIds: Map<string, string>;
  workflowPlanEditIntentByThreadId: Map<string, WorkflowPlanEditIntentKind>;
  workflowPlanEditWorkflowThreadByThreadId: Map<string, string>;
  ambientCliSkillMountDiagnostics: Map<string, AmbientCliSkillMountDiagnostics>;
  ambientCliPackageDescriptionState: AmbientCliPackageDescriptionState;
  ambientWorkflowDescriptionState: AmbientWorkflowDescriptionState;
  tencentMemoryRuntimeSnapshots: Map<string, AgentMemoryRuntimeSnapshot>;
  localPreviewServers: LocalPreviewServerManager;
  downloadService: AmbientDownloadService;
  pluginHost: AmbientPluginHost;
  permissionWaitControls: Map<string, RuntimePermissionWaitControl>;
  localModelRuntimeManager: LocalModelRuntimeManager;
  installRouteGuard: AgentRuntimeInstallRouteGuard;
  transientFileAuthorityRoots: Map<string, TransientFileAuthorityRoot[]>;
  callbacks: {
    abortChildThread: (threadId: string) => Promise<void>;
    abortSessionRun: (session: PiSession, threadId: string) => Promise<void>;
    applyThreadModelSettings: (threadId: string) => Promise<unknown>;
    commitThreadPiSessionFile: (input: {
      threadId: string;
      sessionFile?: string;
      currentPiSessionFile?: string | null;
      reason: PiSessionFileCommitReason;
      emit: (event: DesktopEvent) => void;
    }) => Promise<ThreadSummary | undefined>;
    createCallableWorkflowToolExtension: (
      threadId: string,
      workspace: WorkspaceState,
      initialRecordedWorkflowPlaybooks?: readonly WorkflowRecordingLibraryDescription[],
      childCallableWorkflowToolNames?: readonly string[],
      symphonyParentModePolicy?: SymphonyParentModePolicy | undefined,
      symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
    ) => ExtensionFactory;
    createInterruptedToolCallRecoveryToolExtension: (threadId: string, workspace: WorkspaceState) => ExtensionFactory;
    createPermissionGateExtension: (threadId: string, workspace: WorkspaceState) => ExtensionFactory;
    createSubagentToolExtension: (threadId: string, pluginMcpTools?: readonly PluginMcpToolRegistration[]) => ExtensionFactory;
    currentFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
    emit: (event: DesktopEvent) => void;
    emitBrowserState: () => Promise<void>;
    emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
    ensurePluginMcpToolTrusted: (threadId: string, workspace: WorkspaceState, registration: PluginMcpToolRegistration) => Promise<boolean>;
    fileAuthorityRootPathsForThread: (threadId: string, access: "read" | "write") => string[];
    generateTitleIfNeeded: (thread: ThreadSummary, prompt: string) => void;
    getSession: (
      thread: ThreadSummary,
      recovery?: RuntimeSessionRecoveryContext,
      symphonyParentModePolicy?: SymphonyParentModePolicy | undefined,
      symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
    ) => Promise<PiSession>;
    includeWorkspaceRootAuthorityForThread: (threadId: string) => boolean;
    markPluginToolsStale: (threadId: string) => void;
    prepareBrowserToolProfile: AgentRuntimeWebResearchControllerOptions["prepareBrowserToolProfile"];
    prepareSubagentChildWorktree: (run: SubagentRunSummary) => Promise<ThreadWorktreeSummary | undefined>;
    recordBrowserAudit: AgentRuntimeWebResearchControllerOptions["recordBrowserAudit"];
    recordCallableWorkflowFinalizationBlockedParentMailbox: (
      threadId: string,
      runId: string,
      block: CallableWorkflowParentBlockingBlock,
    ) => SubagentParentMailboxEventSummary;
    recordContextUsageSnapshot: (threadId: string, session: PiSession, message?: string) => ContextUsageSnapshot;
    recordSubagentFinalizationBlockedParentMailbox: (
      threadId: string,
      runId: string,
      block: SubagentFinalizationBarrierBlock,
    ) => SubagentParentMailboxEventSummary[];
    refreshBrowsersForArtifactChange: (threadId: string, workspacePath: string, artifactPath: string) => Promise<void>;
    requestFileAuthorityForThread: (threadId: string, workspace: WorkspaceState, request: AmbientFileAuthorityRequest) => Promise<boolean>;
    resolveCallableWorkflowFinalizationBlock: (
      threadId: string,
      runId: string,
      verifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
    ) => CallableWorkflowParentBlockingBlock | undefined;
    resolveFirstPartyPluginPermission: (input: ResolveFirstPartyPluginPermissionInput) => Promise<boolean>;
    resolveLocalRuntimeOwnershipForForcedAction: (
      request: LocalRuntimeOwnershipResolutionRequest,
    ) => Promise<LocalRuntimeOwnershipResolutionResult>;
    resolveLocalRuntimeOwnershipForRestartPlan: (
      plan: LocalModelRuntimeRestartPlan,
    ) => Promise<LocalRuntimeOwnershipResolutionResult | undefined>;
    resolveLocalRuntimeOwnershipForStopPlan: (
      plan: LocalModelRuntimeStopPlan,
    ) => Promise<LocalRuntimeOwnershipResolutionResult | undefined>;
    resolveSubagentFinalizationBlock: (threadId: string, runId: string) => SubagentFinalizationBarrierBlock | undefined;
    resolveSubagentModelRuntimeProfile: (modelId?: string) => AmbientModelRuntimeProfile;
    resolveToolCallPermission: (
      threadId: string,
      workspace: WorkspaceState,
      toolName: string,
      rawToolInput: unknown,
    ) => Promise<{ reason: string } | undefined>;
    revokeMcpPermissionGrantsForDescriptorDrift: (input: AgentRuntimePluginMcpDescriptorDriftInput) => number;
    revokePluginGrantsForLabels: (labelPrefixes: string[]) => number;
    runCapabilityBuilderValidationWithPermission: (input: {
      thread: ThreadSummary;
      workspace: WorkspaceState;
      input: CapabilityBuilderValidateInput;
      onUpdate?: (update: { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }) => void;
      reason?: "privileged-action-succeeded";
    }) => Promise<CapabilityBuilderValidateResult>;
    send: (input: RuntimeSendMessageInput, hooks?: AgentRuntimeSendHooks) => Promise<void>;
    suppressCallableWorkflowParentAssistantMessages: (
      block: CallableWorkflowParentBlockingBlock,
      options?: { preserveMessageId?: string | undefined },
    ) => void;
    tryRouteBrowserContentThroughScrapling: (input: {
      threadId: string;
      workspace: WorkspaceState;
      url: string | undefined;
      rawInput: Record<string, unknown>;
      signal: AbortSignal | undefined;
      onUpdate?: (update: AgentToolResult<Record<string, unknown>>) => void;
    }) => Promise<{ result?: AgentToolResult<Record<string, unknown>>; fallbackReason?: string }>;
    unavailableContextUsageSnapshot: (thread: ThreadSummary, message: string) => ContextUsageSnapshot;
  };
};

export function createAgentRuntimeControllerInitializer(input: AgentRuntimeControllerInitializerInput) {
  const remoteSurfaceControls = createAgentRuntimeRemoteSurfaceControls({
    store: input.store,
    features: input.features,
    remoteSurfaceRuntimeEvents: () => remoteSurfaceRuntimeEvents,
    emitError: (event) => input.callbacks.emit({ type: "error", ...event }),
  });
  const foundationControllers = createAgentRuntimeFoundationControllers({
    store: input.store,
    browser: input.browser,
    features: input.features,
    permissions: input.permissions,
    sessions: input.sessions,
    activeRuns: input.activeRuns,
    pendingProjectSwitchByThreadId: remoteSurfaceControls.pendingProjectSwitchByThreadId,
    permissionWaitControls: input.permissionWaitControls,
    localModelRuntimeManager: input.localModelRuntimeManager,
    callbacks: {
      completePendingProjectSwitch: (projectSwitch, input) => remoteSurfaceControls.completePendingProjectSwitch(projectSwitch, input),
      currentFeatureFlagSnapshot: () => input.callbacks.currentFeatureFlagSnapshot(),
      emit: (event) => input.callbacks.emit(event),
      emitBrowserState: () => input.callbacks.emitBrowserState(),
      prepareBrowserToolProfile: (profileInput, sourceThreadId, onUpdate) =>
        input.callbacks.prepareBrowserToolProfile(profileInput, sourceThreadId, onUpdate),
      recordBrowserAudit: (threadId, toolName, risk, detail) => input.callbacks.recordBrowserAudit(threadId, toolName, risk, detail),
      resolveFirstPartyPluginPermission: (permissionInput) => input.callbacks.resolveFirstPartyPluginPermission(permissionInput),
      resolveLocalRuntimeOwnershipForForcedAction: (request) => input.callbacks.resolveLocalRuntimeOwnershipForForcedAction(request),
      resolveLocalRuntimeOwnershipForRestartPlan: (plan) => input.callbacks.resolveLocalRuntimeOwnershipForRestartPlan(plan),
      resolveLocalRuntimeOwnershipForStopPlan: (plan) => input.callbacks.resolveLocalRuntimeOwnershipForStopPlan(plan),
      revokeMcpPermissionGrantsForDescriptorDrift: (event) => input.callbacks.revokeMcpPermissionGrantsForDescriptorDrift(event),
      workflowRecoveryEvents: () => remoteSurfaceControls.workflowRecoveryEvents(),
    },
  });
  const glmTokenizer = foundationControllers.glmTokenizer;
  const mcpToolOrchestration = foundationControllers.mcpToolOrchestration;
  const remoteSurfaceRuntimeEvents = foundationControllers.remoteSurfaceRuntimeEvents;
  const modelContext = foundationControllers.modelContext;
  const providerRuntime = foundationControllers.providerRuntime;
  const messagingGateway = foundationControllers.messagingGateway;
  const webResearch = foundationControllers.webResearch;
  const localDeepResearch = foundationControllers.localDeepResearch;
  const serviceControllers = createAgentRuntimeServiceControllers({
    store: input.store,
    browser: input.browser,
    browserCredentials: input.browserCredentials,
    features: input.features,
    permissions: input.permissions,
    sessions: input.sessions,
    activeRuns: input.activeRuns,
    activeRunIds: input.activeRunIds,
    ambientCliSkillMountDiagnostics: input.ambientCliSkillMountDiagnostics,
    ambientCliPackageDescriptionState: input.ambientCliPackageDescriptionState,
    ambientWorkflowDescriptionState: input.ambientWorkflowDescriptionState,
    workflowPlanEditIntentByThreadId: input.workflowPlanEditIntentByThreadId,
    workflowPlanEditWorkflowThreadByThreadId: input.workflowPlanEditWorkflowThreadByThreadId,
    tencentMemoryRuntimeSnapshots: input.tencentMemoryRuntimeSnapshots,
    localPreviewServers: input.localPreviewServers,
    downloadService: input.downloadService,
    pluginHost: input.pluginHost,
    mcpToolOrchestration: mcpToolOrchestration,
    modelContext: modelContext,
    providerRuntime: providerRuntime,
    messagingGateway: messagingGateway,
    webResearch: webResearch,
    localDeepResearch: localDeepResearch,
    installRouteGuard: input.installRouteGuard,
    callbacks: createAgentRuntimeServiceControllerCallbackAdapters({
      store: input.store,
      runtime: {
        commitThreadPiSessionFile: input.callbacks.commitThreadPiSessionFile,
        createCallableWorkflowToolExtension: input.callbacks.createCallableWorkflowToolExtension,
        createInterruptedToolCallRecoveryToolExtension: input.callbacks.createInterruptedToolCallRecoveryToolExtension,
        createPermissionGateExtension: input.callbacks.createPermissionGateExtension,
        createSubagentToolExtension: input.callbacks.createSubagentToolExtension,
        currentFeatureFlagSnapshot: input.callbacks.currentFeatureFlagSnapshot,
        emit: input.callbacks.emit,
        ensurePluginMcpToolTrusted: input.callbacks.ensurePluginMcpToolTrusted,
        fileAuthorityRootPathsForThread: input.callbacks.fileAuthorityRootPathsForThread,
        includeWorkspaceRootAuthorityForThread: input.callbacks.includeWorkspaceRootAuthorityForThread,
        markPluginToolsStale: input.callbacks.markPluginToolsStale,
        recordContextUsageSnapshot: input.callbacks.recordContextUsageSnapshot,
        requestFileAuthorityForThread: input.callbacks.requestFileAuthorityForThread,
        resolveFirstPartyPluginPermission: input.callbacks.resolveFirstPartyPluginPermission,
        resolveToolCallPermission: input.callbacks.resolveToolCallPermission,
        revokePluginGrantsForLabels: input.callbacks.revokePluginGrantsForLabels,
        runCapabilityBuilderValidationWithPermission: input.callbacks.runCapabilityBuilderValidationWithPermission,
        send: input.callbacks.send,
        tryRouteBrowserContentThroughScrapling: input.callbacks.tryRouteBrowserContentThroughScrapling,
        unavailableContextUsageSnapshot: input.callbacks.unavailableContextUsageSnapshot,
      },
    }),
  });
  const browserTools = serviceControllers.browserTools;
  const pluginSetupTools = serviceControllers.pluginSetupTools;
  const extensionAssembly = serviceControllers.extensionAssembly;
  const sessionFactory = serviceControllers.sessionFactory;
  const asyncBashJobs = serviceControllers.asyncBashJobs;
  const goalContinuations = serviceControllers.goalContinuations;
  const threadWakeContinuations = serviceControllers.threadWakeContinuations;
  const settingsSessions = serviceControllers.settingsSessions;
  const subagentWorkflowControllers = createAgentRuntimeSubagentWorkflowControllers({
    store: input.store,
    browser: input.browser,
    permissions: input.permissions,
    pluginHost: input.pluginHost,
    features: input.features,
    activeRuns: input.activeRuns,
    activeRunIds: input.activeRunIds,
    subagentChildExecutions: input.subagentChildExecutions,
    callableWorkflowTaskAbortControllers: input.callableWorkflowTaskAbortControllers,
    callableWorkflowRunTaskIds: input.callableWorkflowRunTaskIds,
    localModelRuntimeManager: input.localModelRuntimeManager,
    modelContext: modelContext,
    callbacks: createAgentRuntimeSubagentWorkflowCallbackAdapters({
      abortChildThread: input.callbacks.abortChildThread,
      currentFeatureFlagSnapshot: input.callbacks.currentFeatureFlagSnapshot,
      emit: input.callbacks.emit,
      emitCallableWorkflowTaskUpdated: input.callbacks.emitCallableWorkflowTaskUpdated,
      ensurePluginMcpToolTrusted: input.callbacks.ensurePluginMcpToolTrusted,
      prepareChildWorktree: input.callbacks.prepareSubagentChildWorktree,
      recordContextUsageSnapshot: input.callbacks.recordContextUsageSnapshot,
      resolveModelRuntimeProfile: input.callbacks.resolveSubagentModelRuntimeProfile,
      send: input.callbacks.send,
    }),
  });
  const subagentActions = subagentWorkflowControllers.subagentActions;
  const subagentStopCascade = subagentWorkflowControllers.subagentStopCascade;
  const finalizationCoordinator = subagentWorkflowControllers.finalizationCoordinator;
  const workflowRecordingReviewSessions = subagentWorkflowControllers.workflowRecordingReviewSessions;
  const callableWorkflowSymphonyBridge = subagentWorkflowControllers.callableWorkflowSymphonyBridge;
  const callableWorkflows = subagentWorkflowControllers.callableWorkflows;
  const localRuntimeOwnership = subagentWorkflowControllers.localRuntimeOwnership;
  const subagentToolExtensions = new AgentRuntimeSubagentToolExtensionController({
    store: input.store,
    features: input.features,
    activeRunIds: input.activeRunIds,
    subagentActions: subagentActions,
    subagentCapacity: subagentWorkflowControllers.subagentCapacity,
    subagentChildRuntimeRouter: subagentWorkflowControllers.subagentChildRuntimeRouter,
    getFeatureFlagSnapshot: () => input.callbacks.currentFeatureFlagSnapshot(),
    emit: (event) => input.callbacks.emit(event),
  });
  const runLifecycle = new AgentRuntimeRunLifecycleController({
    store: input.store,
    sessions: input.sessions,
    activeRuns: input.activeRuns,
    activeRunIds: input.activeRunIds,
    ambientCliPackageDescriptionState: input.ambientCliPackageDescriptionState,
    ambientWorkflowDescriptionState: input.ambientWorkflowDescriptionState,
    pluginHost: input.pluginHost,
    subagentStopCascade: subagentStopCascade,
    emit: (event) => input.callbacks.emit(event),
  });
  const promptPipelineControllers = createAgentRuntimePromptPipelineControllers({
    store: input.store,
    features: input.features,
    sessions: input.sessions,
    activeRuns: {
      has: (threadId) => input.activeRuns.has(threadId),
      set: (threadId, run) => input.activeRuns.set(threadId, run as ActiveRun),
      delete: (threadId) => input.activeRuns.delete(threadId),
    },
    activeRunIds: {
      get: (threadId) => input.activeRunIds.get(threadId),
      set: (threadId, runId) => input.activeRunIds.set(threadId, runId),
      delete: (threadId) => input.activeRunIds.delete(threadId),
    },
    ambientCliSkillMountDiagnostics: input.ambientCliSkillMountDiagnostics,
    localModelRuntimeManager: input.localModelRuntimeManager,
    providerRuntime: providerRuntime,
    remoteSurfaceRuntimeEvents: remoteSurfaceRuntimeEvents,
    goalContinuations: goalContinuations,
    transientFileAuthorityRoots: input.transientFileAuthorityRoots,
    permissionWaitControls: input.permissionWaitControls,
    permissions: input.permissions,
    timeouts: {
      workflowRecordingReviewStreamIdleTimeoutMs: WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS,
      chatPiEmptyAssistantStallTimeoutMs: CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS,
      defaultInterruptedToolCallRecoveryMaxRetries: DEFAULT_INTERRUPTED_TOOL_CALL_RECOVERY_MAX_RETRIES,
      localToolIdleTimeoutMs,
    },
    callbacks: createAgentRuntimePromptPipelineCallbackAdapters({
      store: input.store,
      workflowPlanEditIntentByThreadId: input.workflowPlanEditIntentByThreadId,
      workflowPlanEditWorkflowThreadByThreadId: input.workflowPlanEditWorkflowThreadByThreadId,
      pendingProjectSwitches: remoteSurfaceControls,
      runtime: {
        abortSessionRun: (executionSession, threadId) => input.callbacks.abortSessionRun(executionSession, threadId),
        applyThreadModelSettings: (threadId) => input.callbacks.applyThreadModelSettings(threadId),
        commitThreadPiSessionFile: (commitInput) => input.callbacks.commitThreadPiSessionFile(commitInput),
        currentFeatureFlagSnapshot: () => input.callbacks.currentFeatureFlagSnapshot(),
        emit: (event) => input.callbacks.emit(event),
        generateTitleIfNeeded: (thread, prompt) => input.callbacks.generateTitleIfNeeded(thread, prompt),
        getSession: (thread) => input.callbacks.getSession(thread),
        preflightBeforePrompt: (thread, session, promptContent, setActiveRunStatus, isRunStoreActive, emitRunEvent) =>
          runAgentRuntimePromptPreflightBeforePrompt({
            thread,
            session,
            promptContent,
            compactionSettings: input.store.getCompactionSettings(),
            unavailableContextWindow: CONTEXT_USAGE_UNAVAILABLE_WINDOW,
            setActiveRunStatus,
            isRunStoreActive,
            emitRunEvent,
            recordContextUsageSnapshot: (threadId, promptSession, message) =>
              input.callbacks.recordContextUsageSnapshot(threadId, promptSession, message),
          }),
        recordCallableWorkflowFinalizationBlockedParentMailbox: (threadId, runId, block) =>
          input.callbacks.recordCallableWorkflowFinalizationBlockedParentMailbox(threadId, runId, block),
        recordContextUsageSnapshot: (threadId, session, snapshotMessage) =>
          input.callbacks.recordContextUsageSnapshot(threadId, session, snapshotMessage),
        recordSubagentFinalizationBlockedParentMailbox: (threadId, runId, block) =>
          input.callbacks.recordSubagentFinalizationBlockedParentMailbox(threadId, runId, block),
        refreshBrowsersForArtifactChange: (threadId, workspacePath, artifactPath) =>
          input.callbacks.refreshBrowsersForArtifactChange(threadId, workspacePath, artifactPath),
        resolveCallableWorkflowFinalizationBlock: (threadId, runId, verifiedLaunch) =>
          input.callbacks.resolveCallableWorkflowFinalizationBlock(threadId, runId, verifiedLaunch),
        resolveSubagentFinalizationBlock: (threadId, runId) => input.callbacks.resolveSubagentFinalizationBlock(threadId, runId),
        send: (followUp, followUpHooks) => input.callbacks.send(followUp, followUpHooks),
        suppressCallableWorkflowParentAssistantMessages: (block, options) =>
          input.callbacks.suppressCallableWorkflowParentAssistantMessages(block, options),
      },
    }),
  });
  const contextRecovery = promptPipelineControllers.contextRecovery;
  const plannerFinalization = promptPipelineControllers.plannerFinalization;
  const sendPreparation = promptPipelineControllers.sendPreparation;
  const sendPreflight = promptPipelineControllers.sendPreflight;
  const activeRunHandoff = promptPipelineControllers.activeRunHandoff;
  const promptOutcomes = promptPipelineControllers.promptOutcomes;
  const promptExecutions = promptPipelineControllers.promptExecutions;
  const fileAuthority = promptPipelineControllers.fileAuthority;
  const pluginPermissions = promptPipelineControllers.pluginPermissions;
  const toolPermissions = new AgentRuntimeToolPermissionController({
    store: input.store,
    installRouteGuard: input.installRouteGuard,
    fileAuthority: fileAuthority,
    transientFileAuthorityRoots: input.transientFileAuthorityRoots,
    requestPermission: (request, options) => input.permissions.request(request, options),
    permissionWaitControl: (threadId) => input.permissionWaitControls.get(threadId),
    activeRunId: (threadId) => input.activeRunIds.get(threadId),
    readLocalDeepResearchReadiness: (workspace, input) => localDeepResearch.readReadiness(workspace, input),
    googleWorkspace: input.features.googleWorkspace,
    browserCredentials: input.browserCredentials,
    readBrowserState: () => input.browser.getState(),
    emit: (event) => input.callbacks.emit(event),
  });

  return {
    glmTokenizer,
    mcpToolOrchestration,
    remoteSurfaceRuntimeEvents,
    modelContext,
    providerRuntime,
    messagingGateway,
    webResearch,
    localDeepResearch,
    browserTools,
    pluginSetupTools,
    extensionAssembly,
    sessionFactory,
    asyncBashJobs,
    goalContinuations,
    threadWakeContinuations,
    settingsSessions,
    subagentActions,
    subagentStopCascade,
    finalizationCoordinator,
    workflowRecordingReviewSessions,
    callableWorkflowSymphonyBridge,
    callableWorkflows,
    localRuntimeOwnership,
    subagentToolExtensions,
    runLifecycle,
    contextRecovery,
    plannerFinalization,
    sendPreparation,
    sendPreflight,
    activeRunHandoff,
    promptOutcomes,
    promptExecutions,
    fileAuthority,
    pluginPermissions,
    toolPermissions,
  };
}

export type AgentRuntimeControllerRegistry = ReturnType<typeof createAgentRuntimeControllerInitializer>;
