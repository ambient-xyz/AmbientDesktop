import type { BrowserWindow } from "electron";
import type { Model } from "@mariozechner/pi-ai";
import {
  type ExtensionFactory,
  type AgentToolResult,
} from "@mariozechner/pi-coding-agent";
import type {
  MessagingGatewayRemoteSurfaceRuntimeEvent,
} from "../../shared/messagingGateway";
import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";
import { LocalPreviewServerManager } from "./agentRuntimeBrowserFacade";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import { createAgentRuntimeFoundationControllers } from "./agentRuntimeFoundationControllers";
import {
  createAgentRuntimeServiceControllerCallbackAdapters,
  createAgentRuntimeSubagentWorkflowCallbackAdapters,
} from "./agentRuntimeControllerCallbackAdapters";
import { createAgentRuntimeServiceControllers } from "./agentRuntimeServiceControllers";
import type { PiSessionFileCommitReason } from "./agentRuntimeSessionFacade";
import { commitAgentRuntimeThreadPiSessionFile } from "./agentRuntimeSessionFileCommit";
import type {
  DesktopEvent,
  CompactThreadInput,
  SendMessageInput,
  RecoverThreadContextInput,
} from "../../shared/desktopTypes";
import type {
  CancelCallableWorkflowTaskInput,
  PauseCallableWorkflowTaskInput,
  CallableWorkflowTaskSummary,
  ResumeCallableWorkflowTaskInput,
  WorkflowRecordingLibraryDescription,
} from "../../shared/workflowTypes";
import type {
  PermissionPromptResolution,
  PermissionPromptResponseMode,
  PermissionRequest,
} from "../../shared/permissionTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type {
  CancelSubagentRunInput,
  CloseSubagentRunInput,
  ResolveSubagentWaitBarrierInput,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  SubagentWaitBarrierResolutionResult,
} from "../../shared/subagentTypes";
import type {
  LocalModelResourcePolicyDecision,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
} from "../../shared/localRuntimeTypes";
import type {
  WebResearchProviderConfig,
  WebResearchProviderRole,
} from "../../shared/webResearchTypes";
import type { ContextUsageSnapshot, ModelRuntimeSettings, RunStatus, ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import {
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { ResolveSubagentCapacityLeaseInput } from "../../shared/subagentCapacity";
import {
  resolveAmbientFeatureFlags,
  type AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import type { AgentMemoryRuntimeSnapshot } from "../../shared/agentMemoryDiagnostics";
import {
  AgentRuntimeContextRecoveryController,
  type AgentRuntimeContextRecoverySession,
} from "./agentRuntimeContextRecoveryController";
import {
  createAgentRuntimePromptPipelineControllers,
} from "./agentRuntimePromptPipelineControllers";
import { createAgentRuntimePromptPipelineCallbackAdapters } from "./agentRuntimePromptPipelineCallbackAdapters";
import {
  createAgentRuntimeSubagentWorkflowControllers,
} from "./agentRuntimeSubagentWorkflowControllers";
import {
  runProviderCallContextPreflightBeforePrompt,
} from "./agentRuntimeProviderContextPreflight";
import { runPromptPreflightBeforePrompt } from "./agentRuntimePromptPreflight";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { abortSessionRun as abortPiSessionRun } from "./agentRuntimeSessionFacade";
import type { AmbientFileAuthorityRequest } from "./agentRuntimePiFacade";
import { AmbientPluginHost, type PluginMcpRuntimeSnapshot, type PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import type { CapabilityBuilderValidateInput, CapabilityBuilderValidateResult } from "./agentRuntimeCapabilityBuilderFacade";
import { AmbientDownloadService } from "./agentRuntimeAmbientFacade";
import { AmbientCliPackageDescriptionState } from "./ambient-cli-package/agentRuntimeAmbientCliPackageDescriptionState";
import { workflowRecordingReviewSendInputForThread } from "./workflow-support/agentRuntimeWorkflowRecordingReviewRequest";
import { emitAgentRuntimeDesktopEvent } from "./agentRuntimeDesktopEventEmit";
import {
  localToolIdleTimeoutMs,
} from "./agentRuntimeUtilityHelpers";
import {
  resolveChatPiEmptyAssistantStallTimeoutMs,
  resolvePostToolContinuationIdleMs,
  resolvePostToolFinalizationTickMs,
  resolveWorkflowRecordingReviewStreamIdleTimeoutMs,
} from "./agentRuntimeTimeouts";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import type {
  AgentRuntimeSessionFactoryController,
  AgentRuntimePiSession,
} from "./agentRuntimeSessionFactoryController";
import { AgentRuntimeActiveRunHandoffController } from "./agentRuntimeActiveRunHandoffController";
import type { AgentRuntimeGoalContinuationController } from "./agentRuntimeGoalContinuationController";
import type { AgentRuntimeThreadWakeContinuationController } from "./agentRuntimeThreadWakeContinuationController";
import type { AgentRuntimeSettingsSessionController } from "./agentRuntimeSettingsSessionController";
import { AgentRuntimeRunLifecycleController } from "./agentRuntimeRunLifecycleController";
import { AgentRuntimeFinalizationCoordinator } from "./agentRuntimeFinalizationCoordinator";
import {
  type SubagentChildExecutionRecord,
} from "./agentRuntimeSubagentChildLifecycleCoordinator";
import { AgentRuntimeSubagentActionController } from "./agentRuntimeSubagentActionController";
import { AgentRuntimeSubagentStopCascadeController } from "./agentRuntimeSubagentStopCascadeController";
import { AgentRuntimeSubagentToolExtensionController } from "./agentRuntimeSubagentToolExtensionController";
import { AgentRuntimeWorkflowRecordingReviewSessionController } from "./agentRuntimeWorkflowRecordingReviewSessionController";
import {
  AgentRuntimeCallableWorkflowSymphonyBridgeController,
} from "./agentRuntimeCallableWorkflowSymphonyBridgeController";
import { AgentRuntimeCallableWorkflowController } from "./agentRuntimeCallableWorkflowController";
import { AgentRuntimePlannerFinalizationController } from "./agentRuntimePlannerFinalizationController";
import {
  AgentRuntimeSendPreparationController,
  type RuntimeSendMessageInput,
} from "./agentRuntimeSendPreparationController";
import {
  type RuntimeSessionRecoveryContext,
} from "./agentRuntimeAssistantRetryInput";
import type { AgentRuntimeBrowserToolController } from "./agentRuntimeBrowserToolController";
import type { AgentRuntimeExtensionAssemblyController } from "./agentRuntimeExtensionAssemblyController";
import { AgentRuntimeMessagingGatewayController } from "./agentRuntimeMessagingGatewayController";
import { AgentRuntimeModelContextController } from "./agentRuntimeModelContextController";
import { AgentRuntimeProviderRuntimeController } from "./agentRuntimeProviderRuntimeController";
import {
  AgentRuntimeWebResearchController,
  type AgentRuntimeLocalDeepResearchWebBrokerInput,
  type AgentRuntimeWebResearchProviderPlanOptions,
} from "./agentRuntimeWebResearchController";
import { AgentRuntimeLocalDeepResearchController } from "./agentRuntimeLocalDeepResearchController";
import {
  type AmbientCliSkillMountDiagnostics,
} from "./agentRuntimeAmbientCliSkillMount";
import type { AgentRuntimePluginSetupToolController } from "./agentRuntimePluginSetupToolController";
import type { ResolveFirstPartyPluginPermissionInput } from "./agentRuntimeFirstPartyPluginPermission";
import {
  AgentRuntimePluginPermissionController,
  type AgentRuntimePluginMcpDescriptorDriftInput,
} from "./agentRuntimePluginPermissionController";
import type { AgentRuntimeAsyncBashJobService } from "./tools/agentRuntimeAsyncBashJobs";
import type { AgentRuntimeToolRunnerController } from "./agentRuntimeToolRunnerController";
import { AgentRuntimeInstallRouteGuard } from "./agentRuntimeInstallRouteGuard";
import type { McpToolCallResult } from "./agentRuntimeMcpFacade";
import {
  type AgentRuntimeMcpToolOrchestration,
} from "./mcp/agentRuntimeMcpToolBridge";
import {
  type SubagentPiToolStore,
} from "./agentRuntimeSubagentsFacade";
import {
  type CallableWorkflowParentBlockingBlock,
  type CallableWorkflowRunnerLaunchInput,
  type CallableWorkflowSubagentLaunchResult,
} from "./agentRuntimeCallableWorkflowFacade";
import {
  type SubagentFinalizationBarrierBlock,
} from "./agentRuntimeFinalizationBlocking";
import type {
  SubagentChildRuntimeApprovalResponseInput,
  SubagentChildRuntimeApprovalResponseResult,
  SubagentChildRuntimeCancelInput,
  SubagentChildRuntimeCancelResult,
  SubagentChildRuntimeFollowupInput,
  SubagentChildRuntimeFollowupResult,
  SubagentChildRuntimeRetryInput,
  SubagentChildRuntimeRetryResult,
  SubagentChildRuntimeStartInput,
  SubagentChildRuntimeStartResult,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitResult,
  SubagentRuntimeEventEmitter,
} from "./agentRuntimePiFacade";
import type { WebResearchRuntimeSummary } from "./web-research/agentRuntimeWebResearchRuntimeSummary";
import {
  carrySymphonyParentModePolicy,
  resolveSymphonyParentModePolicyForRuntimeSend,
  type SymphonyParentModePolicy,
  type SymphonyParentModeVerifiedLaunch,
} from "./agentRuntimeSymphonyParentMode";
import {
  type LocalDeepResearchManagedAssetDetection,
  type LocalDeepResearchProviderSnapshot,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput,
} from "./agentRuntimeLocalDeepResearchFacade";
import { AgentRuntimeLocalRuntimeOwnershipController } from "./agentRuntimeLocalRuntimeOwnershipController";
import type { LocalModelRuntimeStatusSnapshot } from "./agentRuntimeLocalRuntimeFacade";
import { LocalModelRuntimeManager } from "./agentRuntimeLocalRuntimeFacade";
import {
  type LocalModelRuntimeRestartPlan,
} from "./agentRuntimeLocalRuntimeFacade";
import {
  type LocalModelRuntimeStopPlan,
} from "./agentRuntimeLocalRuntimeFacade";
import {
  type LocalRuntimeOwnershipResolutionRequest,
  type LocalRuntimeOwnershipResolutionResult,
} from "./agentRuntimeLocalRuntimeFacade";
import {
  type LocalTextSubagentRuntimeStore,
} from "./agentRuntimeLocalRuntimeFacade";
import { createAgentRuntimeRemoteSurfaceControls } from "./agentRuntimeRemoteSurfaceControls";
import {
  AgentRuntimeRemoteSurfaceRuntimeEventStore,
  type AgentRuntimeRemoteSurfaceRuntimeEventCreateInput,
} from "./messaging/agentRuntimeRemoteSurfaceRuntimeEvents";
import { AmbientWorkflowDescriptionState } from "./ambient-workflow/agentRuntimeAmbientWorkflowDescriptionState";
import { generateAgentRuntimeThreadTitleIfNeeded } from "./agentRuntimeThreadTitleGeneration";
import { BrowserService } from "./agentRuntimeBrowserFacade";
import { BrowserCredentialStore } from "./agentRuntimeBrowserFacade";
import { refreshExternalFileBrowserTabs } from "./agentRuntimeBrowserFacade";
import { refreshAgentRuntimeBrowsersForArtifactChange } from "./browser-tools/agentRuntimeBrowserRefresh";
import { GlmTokenizerService, type GlmTokenizerStatus } from "./agentRuntimeTokenizationFacade";
import {
  type TransientFileAuthorityRoot,
} from "./agentRuntimeFileAuthority";
import { AgentRuntimeFileAuthorityController } from "./agentRuntimeFileAuthorityController";
import { AgentRuntimeToolPermissionController } from "./agentRuntimeToolPermissionController";
import {
  type RuntimePermissionWaitControl,
} from "./runtimePermissionWaitController";
import { createRuntimeRunEventScope } from "./runtimeRunEventScope";
import { AgentRuntimePromptOutcomeController } from "./agentRuntimePromptOutcomeController";
import type { RuntimeAbortContextActiveRun } from "./runtimeAbortContext";
import { AgentRuntimePromptExecutionController } from "./agentRuntimePromptExecutionController";
import { resolveAgentRuntimeImageInputs } from "./agentRuntimeImageInputs";
import { AgentRuntimeSendPreflightController } from "./agentRuntimeSendPreflightController";
import { createAgentRuntimeSendRunState } from "./agentRuntimeSendRunState";
import { runAgentRuntimeSendPromptRun } from "./agentRuntimeSendPromptRun";

export {
  buildRuntimeProviderFailureDiagnostic,
  isAmbientProviderAuthFailure,
  runtimeProviderErrorDiagnostic,
  runtimeProviderFailureIdleSource,
} from "./provider-continuation/agentRuntimeProviderDiagnostics";
export type {
  PiStreamTraceReference,
  RuntimeProviderErrorDiagnostic,
  RuntimeProviderFailureDiagnostic,
  RuntimeProviderFailureIdleSource,
} from "./provider-continuation/agentRuntimeProviderDiagnostics";

type PiSession = AgentRuntimePiSession;

export type { AgentRuntimeGoogleWorkspaceTools } from "./agentRuntimeGoogleWorkspaceFacade";

type ActiveRun = RuntimeAbortContextActiveRun;

export interface AgentRuntimeSendHooks {
  onActivity?: () => void;
  awaitQueuedDeliveryCompletion?: boolean;
  awaitInternalRetryCompletion?: boolean;
}

const POST_TOOL_CONTINUATION_IDLE_MS = resolvePostToolContinuationIdleMs();
const POST_TOOL_FINALIZATION_IDLE_MS = 120_000;
const POST_TOOL_FINALIZATION_TICK_MS = resolvePostToolFinalizationTickMs();
const POST_TOOL_ABORT_GRACE_MS = 5_000;
const ASSISTANT_FINALIZATION_RETRY_DELAY_MS = 0;
const DEFAULT_INTERRUPTED_TOOL_CALL_RECOVERY_MAX_RETRIES = 3;
const CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS = resolveChatPiEmptyAssistantStallTimeoutMs();
const WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS = resolveWorkflowRecordingReviewStreamIdleTimeoutMs();
const CHAT_PI_STREAM_PROGRESS_THROTTLE_MS = 2_000;
const CHAT_PI_STREAM_PROGRESS_CHAR_DELTA = 250;
const CHAT_PI_STREAM_TRACE_RECENT_EVENT_LIMIT = 250;
const ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS = 15_000;
export const RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE = "Run interrupted because the Ambient runtime reset before this turn finished.";
export const WORKSPACE_SWITCH_INTERRUPTED_RUN_MESSAGE = "Run interrupted because the active project changed before Ambient finished this turn.";
const CONTEXT_USAGE_UNAVAILABLE_WINDOW = 200_000;

export {
  browserUserActionContinuationLinesFromToolContent,
  createPostToolContinuationRequest,
  postToolIdleContinuationPrompt,
  privilegedContinuationLinesFromToolContent,
  shouldDeliverPostToolContinuation,
  validatePostToolContinuationRequest,
} from "./post-tool/postToolContinuationScheduler";
export { ambientMcpBridgeActiveToolNamesForRecoveredTranscript } from "./mcp/agentRuntimeMcpRecoveredTranscript";
export { PLANNER_MODE_SYSTEM_PROMPT } from "./agentRuntimePlannerModeExtension";
export {
  localDeepResearchComposerPrompt,
  symphonyWorkflowComposerPrompt,
} from "./agentRuntimeComposerIntent";
export {
  piRetryOverridesFromModelRuntimeSettings,
  type PiRetryOverrides,
} from "./agentRuntimeRetrySettings";
export {
  hasRuntimeThreadSettingsUpdate,
  runtimeThreadSettingsUpdateFromSendInput,
  type RuntimeThreadSettingsUpdate,
} from "./agentRuntimeThreadSettingsUpdate";

export class AgentRuntime {
  private activeRuns = new Map<string, ActiveRun>();
  private activeRunIds = new Map<string, string>();
  private subagentChildExecutions = new Map<string, SubagentChildExecutionRecord>();
  private callableWorkflowTaskAbortControllers = new Map<string, AbortController>();
  private callableWorkflowRunTaskIds = new Map<string, string>();
  private workflowPlanEditIntentByThreadId = new Map<string, WorkflowPlanEditIntentKind>();
  private workflowPlanEditWorkflowThreadByThreadId = new Map<string, string>();
  private readonly sessions = new AgentRuntimeSessionRegistry<PiSession>();
  private readonly ambientCliSkillMountDiagnostics = new Map<string, AmbientCliSkillMountDiagnostics>();
  private readonly ambientCliPackageDescriptionState = new AmbientCliPackageDescriptionState();
  private readonly ambientWorkflowDescriptionState = new AmbientWorkflowDescriptionState();
  private readonly remoteSurfaceRuntimeEvents: AgentRuntimeRemoteSurfaceRuntimeEventStore;
  private readonly asyncBashJobs: AgentRuntimeAsyncBashJobService;
  private readonly toolRunner: AgentRuntimeToolRunnerController;
  private readonly browserTools: AgentRuntimeBrowserToolController;
  private readonly goalContinuations: AgentRuntimeGoalContinuationController;
  private readonly threadWakeContinuations: AgentRuntimeThreadWakeContinuationController;
  private readonly settingsSessions: AgentRuntimeSettingsSessionController;
  private readonly runLifecycle: AgentRuntimeRunLifecycleController;
  private readonly finalizationCoordinator: AgentRuntimeFinalizationCoordinator;
  private readonly subagentActions: AgentRuntimeSubagentActionController;
  private readonly subagentStopCascade: AgentRuntimeSubagentStopCascadeController;
  private readonly subagentToolExtensions: AgentRuntimeSubagentToolExtensionController;
  private readonly workflowRecordingReviewSessions: AgentRuntimeWorkflowRecordingReviewSessionController;
  private readonly callableWorkflowSymphonyBridge: AgentRuntimeCallableWorkflowSymphonyBridgeController;
  private readonly callableWorkflows: AgentRuntimeCallableWorkflowController;
  private readonly localRuntimeOwnership: AgentRuntimeLocalRuntimeOwnershipController;
  private readonly contextRecovery: AgentRuntimeContextRecoveryController;
  private readonly plannerFinalization: AgentRuntimePlannerFinalizationController;
  private readonly sendPreparation: AgentRuntimeSendPreparationController;
  private readonly sendPreflight: AgentRuntimeSendPreflightController;
  private readonly activeRunHandoff: AgentRuntimeActiveRunHandoffController;
  private readonly promptOutcomes: AgentRuntimePromptOutcomeController;
  private readonly promptExecutions: AgentRuntimePromptExecutionController<PiSession>;
  private readonly fileAuthority: AgentRuntimeFileAuthorityController;
  private readonly pluginPermissions: AgentRuntimePluginPermissionController;
  private readonly toolPermissions: AgentRuntimeToolPermissionController;
  private readonly pluginHost = new AmbientPluginHost();
  private readonly mcpToolOrchestration: AgentRuntimeMcpToolOrchestration;
  private readonly modelContext: AgentRuntimeModelContextController;
  private readonly extensionAssembly: AgentRuntimeExtensionAssemblyController;
  private readonly sessionFactory: AgentRuntimeSessionFactoryController;
  private readonly providerRuntime: AgentRuntimeProviderRuntimeController;
  private readonly messagingGateway: AgentRuntimeMessagingGatewayController;
  private readonly webResearch: AgentRuntimeWebResearchController;
  private readonly localDeepResearch: AgentRuntimeLocalDeepResearchController;
  private readonly pluginSetupTools: AgentRuntimePluginSetupToolController;
  private readonly localPreviewServers = new LocalPreviewServerManager();
  private readonly downloadService = new AmbientDownloadService();
  private readonly localModelRuntimeManager = new LocalModelRuntimeManager();
  private readonly glmTokenizer: GlmTokenizerService;
  private readonly permissionWaitControls = new Map<string, RuntimePermissionWaitControl>();
  private readonly installRouteGuard = new AgentRuntimeInstallRouteGuard();
  private readonly transientFileAuthorityRoots = new Map<string, TransientFileAuthorityRoot[]>();
  private readonly tencentMemoryRuntimeSnapshots = new Map<string, AgentMemoryRuntimeSnapshot>();
  private lastRendererSendFailureAt = 0;

  constructor(
    private readonly store: ProjectStore,
    private readonly browser: BrowserService,
    private readonly browserCredentials: BrowserCredentialStore,
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly permissions: {
      request: (
        request: Omit<PermissionRequest, "id">,
        options?: { onRequest?: (request: PermissionRequest) => void },
      ) => Promise<PermissionPromptResolution>;
      denyThread: (threadId: string) => void;
      listPending?: () => PermissionRequest[];
      respond?: (id: string, response: PermissionPromptResponseMode) => void;
    },
    private readonly features: AgentRuntimeFeatures = {},
  ) {
    const remoteSurfaceControls = createAgentRuntimeRemoteSurfaceControls({
      store: this.store,
      features: this.features,
      remoteSurfaceRuntimeEvents: () => this.remoteSurfaceRuntimeEvents,
      emitError: (event) => this.emit({ type: "error", ...event }),
    });
    const foundationControllers = createAgentRuntimeFoundationControllers({
      store: this.store,
      browser: this.browser,
      features: this.features,
      permissions: this.permissions,
      sessions: this.sessions,
      activeRuns: this.activeRuns,
      pendingProjectSwitchByThreadId: remoteSurfaceControls.pendingProjectSwitchByThreadId,
      permissionWaitControls: this.permissionWaitControls,
      localModelRuntimeManager: this.localModelRuntimeManager,
      callbacks: {
        completePendingProjectSwitch: (projectSwitch, input) =>
          remoteSurfaceControls.completePendingProjectSwitch(projectSwitch, input),
        currentFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
        emit: (event) => this.emit(event),
        emitBrowserState: () => this.emitBrowserState(),
        prepareBrowserToolProfile: (input, sourceThreadId, onUpdate) =>
          this.prepareBrowserToolProfile(input, sourceThreadId, onUpdate),
        recordBrowserAudit: (threadId, toolName, risk, detail) =>
          this.recordBrowserAudit(threadId, toolName, risk, detail),
        resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
        resolveLocalRuntimeOwnershipForForcedAction: (request) =>
          this.resolveLocalRuntimeOwnershipForForcedAction(request),
        resolveLocalRuntimeOwnershipForRestartPlan: (plan) =>
          this.resolveLocalRuntimeOwnershipForRestartPlan(plan),
        resolveLocalRuntimeOwnershipForStopPlan: (plan) =>
          this.resolveLocalRuntimeOwnershipForStopPlan(plan),
        revokeMcpPermissionGrantsForDescriptorDrift: (event) =>
          this.revokeMcpPermissionGrantsForDescriptorDrift(event),
        workflowRecoveryEvents: () => remoteSurfaceControls.workflowRecoveryEvents(),
      },
    });
    this.glmTokenizer = foundationControllers.glmTokenizer;
    this.mcpToolOrchestration = foundationControllers.mcpToolOrchestration;
    this.remoteSurfaceRuntimeEvents = foundationControllers.remoteSurfaceRuntimeEvents;
    this.modelContext = foundationControllers.modelContext;
    this.providerRuntime = foundationControllers.providerRuntime;
    this.messagingGateway = foundationControllers.messagingGateway;
    this.webResearch = foundationControllers.webResearch;
    this.localDeepResearch = foundationControllers.localDeepResearch;
    const serviceControllers = createAgentRuntimeServiceControllers({
      store: this.store,
      browser: this.browser,
      browserCredentials: this.browserCredentials,
      features: this.features,
      permissions: this.permissions,
      sessions: this.sessions,
      activeRuns: this.activeRuns,
      activeRunIds: this.activeRunIds,
      ambientCliSkillMountDiagnostics: this.ambientCliSkillMountDiagnostics,
      ambientCliPackageDescriptionState: this.ambientCliPackageDescriptionState,
      ambientWorkflowDescriptionState: this.ambientWorkflowDescriptionState,
      workflowPlanEditIntentByThreadId: this.workflowPlanEditIntentByThreadId,
      workflowPlanEditWorkflowThreadByThreadId: this.workflowPlanEditWorkflowThreadByThreadId,
      tencentMemoryRuntimeSnapshots: this.tencentMemoryRuntimeSnapshots,
      localPreviewServers: this.localPreviewServers,
      downloadService: this.downloadService,
      pluginHost: this.pluginHost,
      mcpToolOrchestration: this.mcpToolOrchestration,
      modelContext: this.modelContext,
      providerRuntime: this.providerRuntime,
      messagingGateway: this.messagingGateway,
      webResearch: this.webResearch,
      localDeepResearch: this.localDeepResearch,
      installRouteGuard: this.installRouteGuard,
      callbacks: createAgentRuntimeServiceControllerCallbackAdapters({
        store: this.store,
        runtime: {
          commitThreadPiSessionFile: this.commitThreadPiSessionFile.bind(this),
          createCallableWorkflowToolExtension: this.createCallableWorkflowToolExtension.bind(this),
          createInterruptedToolCallRecoveryToolExtension: this.createInterruptedToolCallRecoveryToolExtension.bind(this),
          createPermissionGateExtension: this.createPermissionGateExtension.bind(this),
          createSubagentToolExtension: this.createSubagentToolExtension.bind(this),
          currentFeatureFlagSnapshot: this.currentFeatureFlagSnapshot.bind(this),
          emit: this.emit.bind(this),
          ensurePluginMcpToolTrusted: this.ensurePluginMcpToolTrusted.bind(this),
          fileAuthorityRootPathsForThread: this.fileAuthorityRootPathsForThread.bind(this),
          includeWorkspaceRootAuthorityForThread: this.includeWorkspaceRootAuthorityForThread.bind(this),
          markPluginToolsStale: this.markPluginToolsStale.bind(this),
          recordContextUsageSnapshot: this.recordContextUsageSnapshot.bind(this),
          requestFileAuthorityForThread: this.requestFileAuthorityForThread.bind(this),
          resolveFirstPartyPluginPermission: this.resolveFirstPartyPluginPermission.bind(this),
          resolveToolCallPermission: this.resolveToolCallPermission.bind(this),
          revokePluginGrantsForLabels: this.revokePluginGrantsForLabels.bind(this),
          runCapabilityBuilderValidationWithPermission: this.runCapabilityBuilderValidationWithPermission.bind(this),
          send: this.send.bind(this),
          tryRouteBrowserContentThroughScrapling: this.tryRouteBrowserContentThroughScrapling.bind(this),
          unavailableContextUsageSnapshot: this.unavailableContextUsageSnapshot.bind(this),
        },
      }),
    });
    this.toolRunner = serviceControllers.toolRunner;
    this.browserTools = serviceControllers.browserTools;
    this.pluginSetupTools = serviceControllers.pluginSetupTools;
    this.extensionAssembly = serviceControllers.extensionAssembly;
    this.sessionFactory = serviceControllers.sessionFactory;
    this.asyncBashJobs = serviceControllers.asyncBashJobs;
    this.goalContinuations = serviceControllers.goalContinuations;
    this.threadWakeContinuations = serviceControllers.threadWakeContinuations;
    this.settingsSessions = serviceControllers.settingsSessions;
    const subagentWorkflowControllers = createAgentRuntimeSubagentWorkflowControllers({
      store: this.store,
      browser: this.browser,
      permissions: this.permissions,
      pluginHost: this.pluginHost,
      features: this.features,
      activeRuns: this.activeRuns,
      activeRunIds: this.activeRunIds,
      subagentChildExecutions: this.subagentChildExecutions,
      callableWorkflowTaskAbortControllers: this.callableWorkflowTaskAbortControllers,
      callableWorkflowRunTaskIds: this.callableWorkflowRunTaskIds,
      localModelRuntimeManager: this.localModelRuntimeManager,
      modelContext: this.modelContext,
      callbacks: createAgentRuntimeSubagentWorkflowCallbackAdapters({
        abortChildThread: this.abort.bind(this),
        currentFeatureFlagSnapshot: this.currentFeatureFlagSnapshot.bind(this),
        emit: this.emit.bind(this),
        emitCallableWorkflowTaskUpdated: this.emitCallableWorkflowTaskUpdated.bind(this),
        ensurePluginMcpToolTrusted: this.ensurePluginMcpToolTrusted.bind(this),
        prepareChildWorktree: this.prepareSubagentChildWorktree.bind(this),
        recordContextUsageSnapshot: this.recordContextUsageSnapshot.bind(this),
        resolveModelRuntimeProfile: this.resolveSubagentModelRuntimeProfile.bind(this),
        send: this.send.bind(this),
      }),
    });
    this.subagentActions = subagentWorkflowControllers.subagentActions;
    this.subagentStopCascade = subagentWorkflowControllers.subagentStopCascade;
    this.finalizationCoordinator = subagentWorkflowControllers.finalizationCoordinator;
    this.workflowRecordingReviewSessions = subagentWorkflowControllers.workflowRecordingReviewSessions;
    this.callableWorkflowSymphonyBridge = subagentWorkflowControllers.callableWorkflowSymphonyBridge;
    this.callableWorkflows = subagentWorkflowControllers.callableWorkflows;
    this.localRuntimeOwnership = subagentWorkflowControllers.localRuntimeOwnership;
    this.subagentToolExtensions = new AgentRuntimeSubagentToolExtensionController({
      store: this.store,
      features: this.features,
      activeRunIds: this.activeRunIds,
      subagentActions: this.subagentActions,
      subagentCapacity: subagentWorkflowControllers.subagentCapacity,
      subagentChildRuntimeRouter: subagentWorkflowControllers.subagentChildRuntimeRouter,
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      emit: (event) => this.emit(event),
    });
    this.runLifecycle = new AgentRuntimeRunLifecycleController({
      store: this.store,
      sessions: this.sessions,
      activeRuns: this.activeRuns,
      activeRunIds: this.activeRunIds,
      ambientCliPackageDescriptionState: this.ambientCliPackageDescriptionState,
      ambientWorkflowDescriptionState: this.ambientWorkflowDescriptionState,
      pluginHost: this.pluginHost,
      subagentStopCascade: this.subagentStopCascade,
      emit: (event) => this.emit(event),
    });
    const promptPipelineControllers = createAgentRuntimePromptPipelineControllers({
      store: this.store,
      features: this.features,
      sessions: this.sessions,
      activeRuns: {
        has: (threadId) => this.activeRuns.has(threadId),
        set: (threadId, run) => this.activeRuns.set(threadId, run as ActiveRun),
        delete: (threadId) => this.activeRuns.delete(threadId),
      },
      activeRunIds: {
        get: (threadId) => this.activeRunIds.get(threadId),
        set: (threadId, runId) => this.activeRunIds.set(threadId, runId),
        delete: (threadId) => this.activeRunIds.delete(threadId),
      },
      ambientCliSkillMountDiagnostics: this.ambientCliSkillMountDiagnostics,
      localModelRuntimeManager: this.localModelRuntimeManager,
      providerRuntime: this.providerRuntime,
      remoteSurfaceRuntimeEvents: this.remoteSurfaceRuntimeEvents,
      goalContinuations: this.goalContinuations,
      transientFileAuthorityRoots: this.transientFileAuthorityRoots,
      permissionWaitControls: this.permissionWaitControls,
      permissions: this.permissions,
      timeouts: {
        workflowRecordingReviewStreamIdleTimeoutMs: WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS,
        chatPiEmptyAssistantStallTimeoutMs: CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS,
        defaultInterruptedToolCallRecoveryMaxRetries: DEFAULT_INTERRUPTED_TOOL_CALL_RECOVERY_MAX_RETRIES,
        localToolIdleTimeoutMs,
      },
      callbacks: createAgentRuntimePromptPipelineCallbackAdapters({
        store: this.store,
        workflowPlanEditIntentByThreadId: this.workflowPlanEditIntentByThreadId,
        workflowPlanEditWorkflowThreadByThreadId: this.workflowPlanEditWorkflowThreadByThreadId,
        pendingProjectSwitches: remoteSurfaceControls,
        runtime: {
          abortSessionRun: (executionSession, threadId) => this.abortSessionRunForThread(executionSession, threadId),
          applyThreadModelSettings: (threadId) => this.applyThreadModelSettings(threadId),
          commitThreadPiSessionFile: (input) => this.commitThreadPiSessionFile(input),
          currentFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
          emit: (event) => this.emit(event),
          generateTitleIfNeeded: (thread, prompt) => this.generateTitleIfNeeded(thread, prompt),
          getSession: (thread) => this.getSession(thread),
          preflightBeforePrompt: (thread, session, promptContent, setActiveRunStatus, isRunStoreActive, emitRunEvent) =>
            this.preflightBeforePrompt(
              thread,
              session,
              promptContent,
              setActiveRunStatus,
              isRunStoreActive,
              emitRunEvent,
            ),
          recordCallableWorkflowFinalizationBlockedParentMailbox: (threadId, runId, block) =>
            this.recordCallableWorkflowFinalizationBlockedParentMailbox(threadId, runId, block),
          recordContextUsageSnapshot: (threadId, session, snapshotMessage) =>
            this.recordContextUsageSnapshot(threadId, session, snapshotMessage),
          recordSubagentFinalizationBlockedParentMailbox: (threadId, runId, block) =>
            this.recordSubagentFinalizationBlockedParentMailbox(threadId, runId, block),
          refreshBrowsersForArtifactChange: (threadId, workspacePath, artifactPath) =>
            this.refreshBrowsersForArtifactChange(threadId, workspacePath, artifactPath),
          resolveCallableWorkflowFinalizationBlock: (threadId, runId, verifiedLaunch) =>
            this.callableWorkflowFinalizationBlock(threadId, runId, verifiedLaunch),
          resolveSubagentFinalizationBlock: (threadId, runId) => this.subagentFinalizationBarrierBlock(threadId, runId),
          send: (followUp, followUpHooks) => this.send(followUp, followUpHooks),
          suppressCallableWorkflowParentAssistantMessages: (block, options) =>
            this.suppressCallableWorkflowParentAssistantMessages(block, options),
        },
      }),
    });
    this.contextRecovery = promptPipelineControllers.contextRecovery;
    this.plannerFinalization = promptPipelineControllers.plannerFinalization;
    this.sendPreparation = promptPipelineControllers.sendPreparation;
    this.sendPreflight = promptPipelineControllers.sendPreflight;
    this.activeRunHandoff = promptPipelineControllers.activeRunHandoff;
    this.promptOutcomes = promptPipelineControllers.promptOutcomes;
    this.promptExecutions = promptPipelineControllers.promptExecutions;
    this.fileAuthority = promptPipelineControllers.fileAuthority;
    this.pluginPermissions = promptPipelineControllers.pluginPermissions;
    this.toolPermissions = new AgentRuntimeToolPermissionController({
      store: this.store,
      installRouteGuard: this.installRouteGuard,
      fileAuthority: this.fileAuthority,
      transientFileAuthorityRoots: this.transientFileAuthorityRoots,
      requestPermission: (request, options) => this.permissions.request(request, options),
      permissionWaitControl: (threadId) => this.permissionWaitControls.get(threadId),
      activeRunId: (threadId) => this.activeRunIds.get(threadId),
      readLocalDeepResearchReadiness: (workspace, input) => this.localDeepResearch.readReadiness(workspace, input),
      googleWorkspace: this.features.googleWorkspace,
      browserCredentials: this.browserCredentials,
      readBrowserState: () => this.browser.getState(),
      emit: (event) => this.emit(event),
    });
  }

  private currentFeatureFlagSnapshot(): AmbientFeatureFlagSnapshot {
    return this.features.featureFlags?.readSnapshot() ??
      resolveAmbientFeatureFlags({ settings: this.store.getFeatureFlagSettings() });
  }

  private async commitThreadPiSessionFile(input: {
    threadId: string;
    sessionFile?: string;
    currentPiSessionFile?: string | null;
    reason: PiSessionFileCommitReason;
    emit: (event: DesktopEvent) => void;
  }): Promise<ThreadSummary | undefined> {
    return commitAgentRuntimeThreadPiSessionFile(input, {
      updateThreadSettings: (threadId, settings) => this.store.updateThreadSettings(threadId, settings),
    });
  }

  private async switchSessionToThreadModel(thread: ThreadSummary, session: PiSession): Promise<void> {
    await this.sessionFactory.switchSessionToThreadModel(thread, session);
  }

  private async abortSessionRunForThread(session: PiSession, threadId: string): Promise<void> {
    await abortPiSessionRun(session, {
      graceMs: POST_TOOL_ABORT_GRACE_MS,
      onStalled: () => this.sessions.delete(threadId),
    });
  }

  private recordRemoteSurfaceRuntimeEvent(
    input: AgentRuntimeRemoteSurfaceRuntimeEventCreateInput,
  ): MessagingGatewayRemoteSurfaceRuntimeEvent {
    return this.remoteSurfaceRuntimeEvents.record(input);
  }

  async requestWorkflowRecordingReview(input: { threadId: string; feedback?: string }): Promise<void> {
    const thread = this.store.getThread(input.threadId);
    const reviewInput: RuntimeSendMessageInput = workflowRecordingReviewSendInputForThread(thread, {
      feedback: input.feedback,
    });
    await this.send(reviewInput);
  }

  async send(input: SendMessageInput, hooks: AgentRuntimeSendHooks = {}): Promise<void> {
    const incomingRuntimeInput = input as RuntimeSendMessageInput;
    const activeRun = this.activeRuns.get(input.threadId);
    const activeRunHandoffHandled = await this.activeRunHandoff.handleSendActiveRunHandoff(input, activeRun, hooks);
    if (activeRunHandoffHandled) return;

    const initialThread = this.store.getThread(input.threadId);
    const initialSymphonyParentModePolicy = resolveSymphonyParentModePolicyForRuntimeSend({
      thread: initialThread,
      composerIntent: incomingRuntimeInput.composerIntent,
      carriedPolicy: incomingRuntimeInput.symphonyParentModePolicy,
      featureFlagSnapshot: this.currentFeatureFlagSnapshot(),
    });
    const sendLoopInput = this.sendPreflight.sendInputWithSymphonyParentModeToolCapableModel(
      input,
      initialThread,
      initialSymphonyParentModePolicy,
    );
    const sendLoop = this.sendPreparation.prepareRuntimeSendLoopContext(sendLoopInput);
    const {
      runtimeInput,
      usesDedicatedReviewSession,
      visibleUserContent,
      hasWorkflowPlanEditIntent,
      thread,
      plannerFinalizationSources,
      runWorkspacePath,
      piPreStreamTimeoutMs,
      piStreamIdleTimeoutMs,
      defaultToolExecutionIdleTimeoutMs,
      emptyAssistantStallTimeoutMs,
      shouldInjectBootstrap,
      activeAssistantFinalizationRetry,
      assistantFinalizationRetryMaxRetries,
      interruptedToolCallRecoveryMaxRetries,
      interruptedToolCallRecoveryAttemptsUsed,
      canScheduleInterruptedToolCallRecovery,
    } = sendLoop;
    let { promptContent } = sendLoop;
    const { retrySourceUserMessageId } = sendLoop;
    const symphonyParentModePolicy = resolveSymphonyParentModePolicyForRuntimeSend({
      thread,
      composerIntent: runtimeInput.composerIntent,
      carriedPolicy: runtimeInput.symphonyParentModePolicy,
      featureFlagSnapshot: this.currentFeatureFlagSnapshot(),
    });
    const sendInputWithSymphonyParentModePolicy = carrySymphonyParentModePolicy(
      runtimeInput,
      symphonyParentModePolicy,
    );
    const promptImageInputs = await resolveAgentRuntimeImageInputs({
      sendInput: runtimeInput,
      workspacePath: thread.workspacePath,
      modelProfile: resolveAmbientModelRuntimeProfile(thread.model),
    });
    const runEventScope = createRuntimeRunEventScope({
      runWorkspacePath,
      plannerFinalizationSources,
      getCurrentWorkspacePath: () => this.store.getWorkspace().path,
      emit: (event) => this.emit(event),
      finishPlannerPlanFinalizationAttempt: (artifactId, finalizationInput) =>
        this.store.finishPlannerPlanFinalizationAttempt(artifactId, finalizationInput),
      onActivity: hooks.onActivity,
    });
    const {
      emitRunEvent,
      finishPlannerFinalizationSources,
    } = runEventScope;

    const sendPreflight = await this.sendPreflight.runBeforePrompt({
      sendInput: input,
      runtimeInput,
      thread,
      visibleUserContent,
      promptContent,
      usesDedicatedReviewSession,
      shouldInjectBootstrap,
      symphonyParentModePolicy,
      runWorkspacePath,
      finishPlannerFinalizationSources,
      emitRunEvent,
      hooks,
    });
    if (sendPreflight.kind === "handled") {
      return;
    }
    promptContent = sendPreflight.promptContent;
    const { runtimeModel } = sendPreflight;

    const sessionRef: { current: PiSession | undefined } = { current: undefined };
    const {
      runId,
      runGoalId,
      runGoalStartedAtMs,
      sendPromptState,
      sendExecutionState,
    } = createAgentRuntimeSendRunState<PiSession>({
      threadId: input.threadId,
      runWorkspacePath,
      threadWorkspacePath: thread.workspacePath,
      permissionMode: thread.permissionMode,
      visibleUserContent,
      retrySourceUserMessageId,
      baseInput: sendInputWithSymphonyParentModePolicy,
      runtimeInput,
      usesDedicatedReviewSession,
      runtimeModel,
      activeAssistantFinalizationRetry,
      assistantFinalizationRetryMaxRetries,
      interruptedToolCallRecoveryAttemptsUsed,
      interruptedToolCallRecoveryMaxRetries,
      piPreStreamTimeoutMs,
      piStreamIdleTimeoutMs,
      progressThrottleMs: CHAT_PI_STREAM_PROGRESS_THROTTLE_MS,
      progressCharDelta: CHAT_PI_STREAM_PROGRESS_CHAR_DELTA,
      recentEventLimit: CHAT_PI_STREAM_TRACE_RECENT_EVENT_LIMIT,
      emptyResponseRetryDelayMs: ASSISTANT_FINALIZATION_RETRY_DELAY_MS,
      symphonyParentModePolicy,
      runEventScope,
      sessionRef,
      getPromptContentLength: () => promptContent.length,
      startRun: (runInput) => this.store.startRun(runInput),
      getThreadGoal: (threadId) => this.store.getThreadGoal(threadId),
      setActiveRunId: (threadId, runId) => {
        this.activeRunIds.set(threadId, runId);
      },
      setActiveRun: (threadId, activeRun) => {
        this.activeRuns.set(threadId, activeRun as ActiveRun);
      },
      addAssistantMessage: (messageInput) => this.store.addMessage({
        threadId: messageInput.threadId,
        role: "assistant",
        content: messageInput.content,
        metadata: messageInput.metadata,
      }),
      addToolMessage: (messageInput) => this.store.addMessage({
        threadId: messageInput.threadId,
        role: "tool",
        content: messageInput.content,
        metadata: messageInput.metadata,
      }),
      appendToMessage: (messageId, delta) => this.store.appendToMessage(messageId, delta),
      replaceMessage: (messageId, content, metadata) => this.store.replaceMessage(messageId, content, metadata),
      listMessages: () => this.store.listMessages(input.threadId),
      updateRunStatus: (runId, status) => {
        this.store.updateRunStatus(runId, status);
      },
      updateRunDiagnostics: (runId, diagnostics) => this.store.updateRunDiagnostics(runId, diagnostics),
      finishRun: (runId, status, errorMessage) => {
        this.store.finishRun(runId, status, errorMessage);
      },
      denyThread: (threadId) => this.permissions.denyThread(threadId),
      getPermissionMode: () => this.store.getThread(input.threadId).permissionMode,
      getCurrentThreadPiSessionFile: () => this.store.getThread(input.threadId).piSessionFile,
      getCurrentThreadModel: () => this.store.getThread(input.threadId).model,
      commitThreadPiSessionFile: (commitInput) => this.commitThreadPiSessionFile(commitInput),
      getWorkspaceStatePath: () => this.store.getWorkspace().statePath,
      abortSessionRun: (abortSession, threadId) => this.abortSessionRunForThread(abortSession, threadId),
      markSubagentParentControlBarrierReconciled: (reconcileInput) =>
        this.store.markSubagentParentControlBarrierReconciled(reconcileInput),
      cascadeSubagentsForStoppedParentRun: (threadId, runId, reason) =>
        this.subagentStopCascade.cascadeSubagentsForStoppedParentRun(threadId, runId, reason),
      setPermissionWaitControl: (threadId, control) => {
        this.permissionWaitControls.set(threadId, control);
      },
      getModel: () => this.store.getThread(input.threadId).model,
      clearThreadPiSessionFile: () => {
        emitRunEvent({
          type: "thread-updated",
          thread: this.store.updateThreadSettings(input.threadId, { piSessionFile: null }),
        });
      },
      removeActiveSessionIfCurrent: (cleanupSession) => {
        if (this.sessions.get(input.threadId) !== cleanupSession) return false;
        this.sessions.delete(input.threadId);
        return true;
      },
      listCallableWorkflowTasksForParentRun: (runId) =>
        this.store.listCallableWorkflowTasksForParentRun(runId),
      emit: (event) => this.emit(event),
    });

    await runAgentRuntimeSendPromptRun({
      sendInput: input,
      hooks,
      thread,
      runId,
      runWorkspacePath,
      promptContent,
      images: promptImageInputs.images,
      piPreStreamTimeoutMs,
      piStreamIdleTimeoutMs,
      defaultToolExecutionIdleTimeoutMs,
      emptyAssistantStallTimeoutMs,
      assistantTerminalGraceMs: ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS,
      postToolContinuationIdleMs: POST_TOOL_CONTINUATION_IDLE_MS,
      postToolFinalizationIdleMs: POST_TOOL_FINALIZATION_IDLE_MS,
      postToolFinalizationTickMs: POST_TOOL_FINALIZATION_TICK_MS,
      abortGraceMs: POST_TOOL_ABORT_GRACE_MS,
      assistantFinalizationRetryMaxRetries,
      activeAssistantFinalizationRetry,
      retrySourceUserMessageId,
      interruptedToolCallRecoveryAttemptsUsed,
      interruptedToolCallRecoveryMaxRetries,
      canScheduleInterruptedToolCallRecovery,
      plannerFinalizationSources,
      usesDedicatedReviewSession,
      hasWorkflowPlanEditIntent,
      runGoalId,
      runGoalStartedAtMs,
      symphonyParentModePolicy,
      sendPromptState,
      sendExecutionState,
      runEventScope,
      promptExecutions: this.promptExecutions,
      promptOutcomes: this.promptOutcomes,
      createSession: () =>
        usesDedicatedReviewSession
          ? this.createWorkflowRecordingReviewSession(thread)
          : this.getSession(
              thread,
              runtimeInput.sessionRecovery,
              symphonyParentModePolicy,
              runtimeInput.symphonyParentModeVerifiedLaunch,
            ),
      setSession: (createdSession) => {
        sessionRef.current = createdSession;
      },
      abortSessionRun: (abortSession, threadId) => this.abortSessionRunForThread(abortSession, threadId),
      getMessages: () => this.store.listMessages(input.threadId),
      getThread: () => this.store.getThread(input.threadId),
    });
  }

  continueGoalIfIdle(threadId: string, expectedGoalId: string, delayMs = 0): void {
    this.goalContinuations.continueGoalIfIdle(threadId, expectedGoalId, delayMs);
  }

  async abort(threadId: string, options: { skipSubagentChildCancellation?: boolean } = {}): Promise<void> {
    await this.runLifecycle.abort(threadId, options);
  }

  interruptActiveRuns(reason = RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE): number {
    return this.runLifecycle.interruptActiveRuns(reason);
  }

  applyRuntimeSettings(settings: ModelRuntimeSettings): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    return this.settingsSessions.applyRuntimeSettings(settings);
  }

  applyFeatureFlags(_snapshot: AmbientFeatureFlagSnapshot): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    return this.settingsSessions.applyFeatureFlags(_snapshot);
  }

  applyMemorySettings(): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    return this.settingsSessions.applyMemorySettings();
  }

  async applyThreadModelSettings(threadId: string): Promise<{
    switchedSessions: number;
    deferredSessions: number;
    switchedThreadIds: string[];
    deferredThreadIds: string[];
  }> {
    return this.settingsSessions.applyThreadModelSettings(threadId);
  }

  applyThreadMemorySettings(threadId: string): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    return this.settingsSessions.applyThreadMemorySettings(threadId);
  }

  listAgentMemoryRuntimeSnapshots(): AgentMemoryRuntimeSnapshot[] {
    return this.settingsSessions.listAgentMemoryRuntimeSnapshots();
  }

  async getContextUsage(threadId: string): Promise<ContextUsageSnapshot> {
    return this.contextRecovery.getContextUsage(threadId);
  }

  async compactThread(input: CompactThreadInput): Promise<ContextUsageSnapshot> {
    return this.contextRecovery.compactThread(input);
  }

  async recoverThreadContext(input: RecoverThreadContextInput): Promise<ContextUsageSnapshot> {
    return this.contextRecovery.recoverThreadContext(input);
  }

  resetSessions(): void {
    this.runLifecycle.resetSessions();
  }

  async shutdownPluginMcpServers(): Promise<void> {
    await this.runLifecycle.shutdownPluginMcpServers();
  }

  pluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
    return this.runLifecycle.pluginMcpRuntimeSnapshots();
  }

  restartPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.runLifecycle.restartPluginMcpRuntime(key);
  }

  stopPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.runLifecycle.stopPluginMcpRuntime(key);
  }

  tokenizerStatus(): GlmTokenizerStatus {
    return this.glmTokenizer.getStatus();
  }

  private async preflightBeforePrompt(
    thread: ThreadSummary,
    session: PiSession,
    promptContent: string,
    setActiveRunStatus: (status: Exclude<RunStatus, "idle" | "error">) => void,
    isRunStoreActive: () => boolean = () => true,
    emitRunEvent: (event: DesktopEvent) => void = (event) => this.emit(event),
  ): Promise<void> {
    const compactionSettings = this.store.getCompactionSettings();
    const providerContextPreflight = () => runProviderCallContextPreflightBeforePrompt({
      threadId: thread.id,
      workspacePath: thread.workspacePath,
      session,
      promptContent,
      contextWindow: session.model?.contextWindow ?? CONTEXT_USAGE_UNAVAILABLE_WINDOW,
      reserveTokens: compactionSettings.reserveTokens,
      hardPreflightPercent: compactionSettings.hardPreflightPercent,
    });

    await runPromptPreflightBeforePrompt({
      threadId: thread.id,
      session,
      promptContent,
      compactionSettings,
      unavailableContextWindow: CONTEXT_USAGE_UNAVAILABLE_WINDOW,
      setActiveRunStatus,
      isRunStoreActive,
      emitRunEvent,
      recordContextUsageSnapshot: (threadId, promptSession, message) =>
        this.recordContextUsageSnapshot(threadId, promptSession, message),
    });
    if (!isRunStoreActive()) return;

    await providerContextPreflight();
  }

  private recordContextUsageSnapshot(threadId: string, session: PiSession, message?: string): ContextUsageSnapshot {
    return this.contextRecovery.recordContextUsageSnapshot(
      threadId,
      session as AgentRuntimeContextRecoverySession,
      message,
    );
  }

  private contextUsageSnapshot(threadId: string, session: PiSession, message?: string): ContextUsageSnapshot {
    return this.contextRecovery.contextUsageSnapshot(threadId, session as AgentRuntimeContextRecoverySession, message);
  }

  private unavailableContextUsageSnapshot(thread: ThreadSummary, message: string): ContextUsageSnapshot {
    return this.contextRecovery.unavailableContextUsageSnapshot(thread, message);
  }

  private generateTitleIfNeeded(thread: ThreadSummary, prompt: string): void {
    generateAgentRuntimeThreadTitleIfNeeded({
      thread,
      prompt,
      workspaceName: this.store.getWorkspace().name,
      modelRuntimeSettings: this.store.getModelRuntimeSettings(),
      getThread: (threadId) => this.store.getThread(threadId),
      updateThreadTitle: (threadId, title) => this.store.updateThreadTitle(threadId, title),
      emit: (event) => this.emit(event),
    });
  }

  private async getSession(
    thread: ThreadSummary,
    recovery?: RuntimeSessionRecoveryContext,
    symphonyParentModePolicy?: SymphonyParentModePolicy | undefined,
    symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
  ): Promise<PiSession> {
    return this.sessionFactory.getSession(
      thread,
      recovery,
      symphonyParentModePolicy,
      symphonyParentModeVerifiedLaunch,
    );
  }

  private createSubagentEventingStore(): SubagentPiToolStore & LocalTextSubagentRuntimeStore {
    return this.subagentActions.createEventingStore();
  }

  private createDesktopSubagentCancelEventEmitter(run: SubagentRunSummary): SubagentRuntimeEventEmitter {
    return this.subagentActions.createCancelEventEmitter(run);
  }

  private createDesktopSubagentRetryEventEmitter(run: SubagentRunSummary): SubagentRuntimeEventEmitter {
    return this.subagentActions.createRetryEventEmitter(run);
  }

  private emitSubagentRunAndChildThreadUpdated(run: SubagentRunSummary): void {
    this.subagentActions.emitRunAndChildThreadUpdated(run);
  }

  private emitSubagentRunEventCreated(run: SubagentRunSummary, event: SubagentRunEventSummary): void {
    this.subagentActions.emitRunEventCreated(run, event);
  }

  private emitSubagentToolScopeSnapshotRecorded(run: SubagentRunSummary, snapshot: SubagentToolScopeSnapshotSummary): void {
    this.subagentActions.emitToolScopeSnapshotRecorded(run, snapshot);
  }

  private emitSubagentWaitBarrierUpdated(barrier: SubagentWaitBarrierSummary): void {
    this.subagentActions.emitWaitBarrierUpdated(barrier);
  }

  private emitSubagentMailboxEventUpdated(run: SubagentRunSummary, event: SubagentMailboxEventSummary): void {
    this.subagentActions.emitMailboxEventUpdated(run, event);
  }

  private emitSubagentParentMailboxEventUpdated(event: SubagentParentMailboxEventSummary): void {
    this.subagentActions.emitParentMailboxEventUpdated(event);
  }

  private recordSubagentFinalizationBlockedParentMailbox(
    parentThreadId: string,
    parentRunId: string,
    block: SubagentFinalizationBarrierBlock,
  ): SubagentParentMailboxEventSummary[] {
    return this.finalizationCoordinator.recordSubagentFinalizationBlockedParentMailbox(parentThreadId, parentRunId, block);
  }

  private recordCallableWorkflowFinalizationBlockedParentMailbox(
    parentThreadId: string,
    parentRunId: string,
    block: CallableWorkflowParentBlockingBlock,
  ): SubagentParentMailboxEventSummary {
    return this.finalizationCoordinator.recordCallableWorkflowFinalizationBlockedParentMailbox(parentThreadId, parentRunId, block);
  }

  private subagentFinalizationBarrierBlock(parentThreadId: string, parentRunId: string): SubagentFinalizationBarrierBlock | undefined {
    return this.finalizationCoordinator.subagentFinalizationBarrierBlock(parentThreadId, parentRunId);
  }

  private callableWorkflowFinalizationBlock(
    parentThreadId: string,
    parentRunId: string,
    carriedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
  ): CallableWorkflowParentBlockingBlock | undefined {
    return this.finalizationCoordinator.callableWorkflowFinalizationBlock(parentThreadId, parentRunId, carriedLaunch);
  }

  private suppressCallableWorkflowParentAssistantMessages(
    block: CallableWorkflowParentBlockingBlock,
    options: { preserveMessageId?: string | undefined } = {},
  ): void {
    this.finalizationCoordinator.suppressCallableWorkflowParentAssistantMessages(block, options);
  }

  private emitSubagentRunEventsSince(run: SubagentRunSummary, sequence: number): void {
    this.subagentActions.emitRunEventsSince(run, sequence);
  }

  private latestSubagentRunEventSequence(runId: string): number {
    return this.subagentActions.latestRunEventSequence(runId);
  }

  private createSubagentToolExtension(
    threadId: string,
    pluginMcpTools: readonly PluginMcpToolRegistration[] = [],
  ): ExtensionFactory {
    return this.subagentToolExtensions.createToolExtension(threadId, pluginMcpTools);
  }

  async resolveSubagentWaitBarrier(input: ResolveSubagentWaitBarrierInput): Promise<SubagentWaitBarrierResolutionResult> {
    return this.subagentActions.resolveWaitBarrier(input);
  }

  async cancelSubagentRun(input: CancelSubagentRunInput): Promise<SubagentRunSummary> {
    return this.subagentActions.cancelRun(input);
  }

  closeSubagentRun(input: CloseSubagentRunInput): SubagentRunSummary {
    return this.subagentActions.closeRun(input);
  }

  private createCallableWorkflowToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    initialRecordedWorkflowPlaybooks: readonly WorkflowRecordingLibraryDescription[] = [],
    childCallableWorkflowToolNames: readonly string[] = [],
    symphonyParentModePolicy?: SymphonyParentModePolicy | undefined,
    symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
  ): ExtensionFactory {
    return this.callableWorkflows.createToolExtension(
      threadId,
      workspace,
      initialRecordedWorkflowPlaybooks,
      childCallableWorkflowToolNames,
      symphonyParentModePolicy,
      symphonyParentModeVerifiedLaunch,
    );
  }

  private startCallableWorkflowTaskForThread(
    threadId: string,
    taskId: string,
    workspace: WorkspaceState,
  ): void {
    this.callableWorkflows.startTaskForThread(threadId, taskId, workspace);
  }

  async cancelCallableWorkflowTask(input: CancelCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary> {
    return this.callableWorkflows.cancelTask(input);
  }

  private async cancelCallableWorkflowSymphonyChildWait(
    task: CallableWorkflowTaskSummary,
    reason?: string,
  ): Promise<void> {
    return this.callableWorkflowSymphonyBridge.cancelChildWait(task, reason);
  }

  pauseCallableWorkflowTask(input: PauseCallableWorkflowTaskInput): CallableWorkflowTaskSummary {
    return this.callableWorkflows.pauseTask(input);
  }

  async resumeCallableWorkflowTask(input: ResumeCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary> {
    return this.callableWorkflows.resumeTask(input);
  }

  private async executeCallableWorkflowTaskForThread(
    threadId: string,
    taskId: string,
    workspace: WorkspaceState,
  ): Promise<void> {
    return this.callableWorkflows.executeTaskForThread(threadId, taskId, workspace);
  }

  private async launchCallableWorkflowSymphonySubagents(input: CallableWorkflowRunnerLaunchInput): Promise<CallableWorkflowSubagentLaunchResult | void> {
    return this.callableWorkflowSymphonyBridge.launchSubagents(input);
  }

  private emitCallableWorkflowTaskUpdated(task: CallableWorkflowTaskSummary): void {
    this.emit({ type: "callable-workflow-task-updated", task });
  }

  private resolveSubagentModelRuntimeProfile(modelId?: string): AmbientModelRuntimeProfile {
    return this.subagentToolExtensions.resolveModelRuntimeProfile(modelId);
  }

  private async resolveSubagentCapacityLease(input: ResolveSubagentCapacityLeaseInput) {
    return this.subagentToolExtensions.resolveCapacityLease(input);
  }

  private startResolvedSubagentChildRun(
    input: SubagentChildRuntimeStartInput,
  ): Promise<SubagentChildRuntimeStartResult> | SubagentChildRuntimeStartResult {
    return this.subagentToolExtensions.startResolvedChildRun(input);
  }

  private async waitForResolvedSubagentChildRun(input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult> {
    return this.subagentToolExtensions.waitForResolvedChildRun(input);
  }

  private async cancelResolvedSubagentChildRun(input: SubagentChildRuntimeCancelInput): Promise<SubagentChildRuntimeCancelResult> {
    return this.subagentToolExtensions.cancelResolvedChildRun(input);
  }

  private async followupResolvedSubagentChildRun(input: SubagentChildRuntimeFollowupInput): Promise<SubagentChildRuntimeFollowupResult> {
    return this.subagentToolExtensions.followupResolvedChildRun(input);
  }

  private async retryResolvedSubagentChildRun(input: SubagentChildRuntimeRetryInput): Promise<SubagentChildRuntimeRetryResult> {
    return this.subagentToolExtensions.retryResolvedChildRun(input);
  }

  private async resolveResolvedSubagentChildApprovalResponse(
    input: SubagentChildRuntimeApprovalResponseInput,
  ): Promise<SubagentChildRuntimeApprovalResponseResult> {
    return this.subagentToolExtensions.resolveResolvedChildApprovalResponse(input);
  }

  private async prepareSubagentChildWorktree(run: SubagentRunSummary): Promise<ThreadWorktreeSummary | undefined> {
    return this.subagentToolExtensions.prepareChildWorktree(run);
  }

  private async createWorkflowRecordingReviewSession(thread: ThreadSummary): Promise<PiSession> {
    return this.workflowRecordingReviewSessions.createSession(thread);
  }

  private markPluginToolsStale(threadId: string): void {
    this.sessions.markPluginToolsStale(threadId);
    this.emit({ type: "plugin-catalog-updated" });
  }

  private revokePluginGrantsForLabels(labelPrefixes: string[]): number {
    return this.pluginPermissions.revokePluginGrantsForLabels(labelPrefixes);
  }

  private revokeMcpPermissionGrantsForDescriptorDrift(input: AgentRuntimePluginMcpDescriptorDriftInput): number {
    return this.pluginPermissions.revokeMcpPermissionGrantsForDescriptorDrift(input);
  }

  private async resolveFirstPartyPluginPermission(input: ResolveFirstPartyPluginPermissionInput): Promise<boolean> {
    return this.pluginPermissions.resolveFirstPartyPluginPermission(input);
  }

  private createGoalModeToolExtension(threadId: string): ExtensionFactory {
    return this.extensionAssembly.createGoalModeToolExtension(threadId);
  }

  private createPlannerModeExtension(threadId: string): ExtensionFactory {
    return this.extensionAssembly.createPlannerModeExtension(threadId);
  }

  private createPermissionGateExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.toolPermissions.createPermissionGateExtension(threadId, workspace);
  }

  private async resolveToolCallPermission(
    threadId: string,
    workspace: WorkspaceState,
    toolName: string,
    rawToolInput: unknown,
  ): Promise<{ reason: string } | undefined> {
    return this.toolPermissions.resolveToolCallPermission(threadId, workspace, toolName, rawToolInput);
  }

  private createToolRunnerExtension(
    threadId: string,
    workspace: WorkspaceState,
    options?: { interruptedToolCallRecoveryToolsAvailable?: boolean },
  ): ExtensionFactory {
    return this.toolRunner.createToolRunnerExtension(threadId, workspace, options);
  }

  private createInterruptedToolCallRecoveryToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.toolPermissions.createInterruptedToolCallRecoveryToolExtension(threadId, workspace);
  }

  private readInterruptedToolCallRecoveryArtifact(threadId: string, params: unknown): AgentToolResult<Record<string, unknown>> {
    return this.toolPermissions.readInterruptedToolCallRecoveryArtifact(threadId, params);
  }

  private fileAuthorityRootPathsForThread(threadId: string, access: "read" | "write"): string[] {
    return this.toolPermissions.fileAuthorityRootPathsForThread(threadId, access);
  }

  private includeWorkspaceRootAuthorityForThread(threadId: string): boolean {
    return this.toolPermissions.includeWorkspaceRootAuthorityForThread(threadId);
  }

  private async requestFileAuthorityForThread(
    threadId: string,
    workspace: WorkspaceState,
    request: AmbientFileAuthorityRequest,
  ): Promise<boolean> {
    return this.toolPermissions.requestFileAuthorityForThread(threadId, workspace, request);
  }

  private childApprovalModeForThread(
    thread: Pick<ThreadSummary, "kind" | "subagentRunId">,
  ): "interactive" | "non_interactive" | undefined {
    return this.toolPermissions.childApprovalModeForThread(thread);
  }

  private createLocalDeepResearchToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.localDeepResearch.createToolExtension(threadId, workspace);
  }

  private async readLocalDeepResearchReadiness(
    workspace: WorkspaceState,
    input: LocalDeepResearchSetupInput,
    signal?: AbortSignal,
  ): Promise<{ contract: LocalDeepResearchSetupContract; managedAssets: LocalDeepResearchManagedAssetDetection }> {
    return this.localDeepResearch.readReadiness(workspace, input, signal);
  }

  async runLocalModelRuntimeLifecycleAction(
    input: LocalModelRuntimeLifecycleActionInput,
  ): Promise<LocalModelRuntimeLifecycleActionResult> {
    return this.providerRuntime.runLocalModelRuntimeLifecycleAction(input);
  }

  private resolveLocalRuntimeOwnershipForStopPlan(
    plan: LocalModelRuntimeStopPlan,
  ): Promise<LocalRuntimeOwnershipResolutionResult | undefined> {
    return this.localRuntimeOwnership.resolveForStopPlan(plan);
  }

  private resolveLocalRuntimeOwnershipForRestartPlan(
    plan: LocalModelRuntimeRestartPlan,
  ): Promise<LocalRuntimeOwnershipResolutionResult | undefined> {
    return this.localRuntimeOwnership.resolveForRestartPlan(plan);
  }

  private async resolveLocalRuntimeOwnershipForForcedAction(
    request: LocalRuntimeOwnershipResolutionRequest,
  ): Promise<LocalRuntimeOwnershipResolutionResult> {
    return this.localRuntimeOwnership.resolveForForcedAction(request);
  }

  readLocalModelRuntimeStatus(workspacePath = this.store.getWorkspace().path): Promise<LocalModelRuntimeStatusSnapshot> {
    return this.providerRuntime.readLocalModelRuntimeStatus(workspacePath);
  }

  private localDeepResearchWebBroker(input: AgentRuntimeLocalDeepResearchWebBrokerInput) {
    return this.localDeepResearch.createWebBroker(input);
  }

  private async approveLocalModelResourceLimitExceed(input: {
    threadId: string;
    workspace: WorkspaceState;
    decision: LocalModelResourcePolicyDecision;
  }): Promise<boolean> {
    return this.localDeepResearch.approveResourceLimitExceed(input);
  }

  private createMessagingGatewayToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.messagingGateway.createMessagingGatewayToolExtension(threadId, workspace);
  }

  private createWebResearchToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.webResearch.createWebResearchToolExtension(threadId, workspace);
  }

  private webResearchProviderPlanForInput(
    workspace: WorkspaceState,
    input: Record<string, unknown>,
    role: WebResearchProviderRole,
    signal?: AbortSignal,
    providerSnapshot?: LocalDeepResearchProviderSnapshot,
    options: AgentRuntimeWebResearchProviderPlanOptions = {},
  ) {
    return this.webResearch.webResearchProviderPlanForInput(workspace, input, role, signal, providerSnapshot, options);
  }

  private discoverWebResearchMcpProviderTools(workspace: WorkspaceState, signal?: AbortSignal) {
    return this.webResearch.discoverWebResearchMcpProviderTools(workspace, signal);
  }

  private async tryCallWebResearchMcpProvider(input: {
    threadId: string;
    workspace: WorkspaceState;
    provider: WebResearchProviderConfig;
    role: "search" | "fetch";
    value: string;
    rawInput: Record<string, unknown>;
    signal: AbortSignal | undefined;
    onUpdate?: (update: AgentToolResult<Record<string, unknown>>) => void;
  }): Promise<{ result?: McpToolCallResult; fallbackReason?: string }> {
    return this.webResearch.tryCallWebResearchMcpProvider(input);
  }

  private async webResearchRuntimeSummary(
    workspace: WorkspaceState,
    signal?: AbortSignal,
  ): Promise<WebResearchRuntimeSummary> {
    return this.webResearch.webResearchRuntimeSummary(workspace, signal);
  }

  private createSearchPreferenceToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.extensionAssembly.createSearchPreferenceToolExtension(threadId, workspace);
  }

  private createPrivilegedActionToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.extensionAssembly.createPrivilegedActionToolExtension(threadId, workspace);
  }

  private createWorkflowNativeToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.pluginSetupTools.createWorkflowNativeToolExtension(threadId, workspace);
  }

  private createPluginMcpToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    registrations: PluginMcpToolRegistration[],
  ): ExtensionFactory {
    return this.pluginSetupTools.createPluginMcpToolExtension(threadId, workspace, registrations);
  }

  private createLambdaRlmToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    model: Model<"openai-completions">,
    apiKey: string | undefined,
  ): ExtensionFactory {
    return this.pluginSetupTools.createLambdaRlmToolExtension(threadId, workspace, model, apiKey);
  }

  private createPluginInstallToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    model: Model<"openai-completions">,
    apiKey: string | undefined,
  ): ExtensionFactory {
    return this.pluginSetupTools.createPluginInstallToolExtension(threadId, workspace, model, apiKey);
  }

  private async runCapabilityBuilderValidationWithPermission(input: {
    thread: ThreadSummary;
    workspace: WorkspaceState;
    input: CapabilityBuilderValidateInput;
    onUpdate?: (update: {
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
    }) => void;
    reason?: "privileged-action-succeeded";
  }): Promise<CapabilityBuilderValidateResult> {
    return this.pluginSetupTools.runCapabilityBuilderValidationWithPermission(input);
  }

  private createGoogleWorkspaceSetupToolExtension(workspace: WorkspaceState): ExtensionFactory {
    return this.pluginSetupTools.createGoogleWorkspaceSetupToolExtension(workspace);
  }

  private async tryRouteBrowserContentThroughScrapling(input: {
    threadId: string;
    workspace: WorkspaceState;
    url: string | undefined;
    rawInput: Record<string, unknown>;
    signal: AbortSignal | undefined;
    onUpdate?: (update: AgentToolResult<Record<string, unknown>>) => void;
  }): Promise<{ result?: AgentToolResult<Record<string, unknown>>; fallbackReason?: string }> {
    return this.webResearch.tryRouteBrowserContentThroughScrapling(input);
  }

  private createBrowserToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return this.browserTools.createBrowserToolExtension(threadId, workspace);
  }

  private async ensurePluginMcpToolTrusted(
    threadId: string,
    workspace: WorkspaceState,
    registration: PluginMcpToolRegistration,
  ): Promise<boolean> {
    return this.pluginPermissions.ensurePluginMcpToolTrusted(threadId, workspace, registration);
  }

  private recordBrowserAudit(
    threadId: string,
    toolName: string,
    risk: "browser-network" | "browser-control" | "browser-profile" | "browser-login" | "browser-credential",
    detail: string | undefined,
  ): void {
    this.browserTools.recordBrowserAudit(threadId, toolName, risk, detail);
  }

  private async emitBrowserState(): Promise<void> {
    await this.browserTools.emitBrowserState();
  }

  private async prepareBrowserToolProfile(
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: Parameters<AgentRuntimeBrowserToolController["prepareBrowserToolProfile"]>[2],
  ): ReturnType<AgentRuntimeBrowserToolController["prepareBrowserToolProfile"]> {
    return this.browserTools.prepareBrowserToolProfile(input, threadId, onUpdate);
  }

  private async refreshBrowsersForArtifactChange(threadId: string, workspacePath: string, artifactPath: string): Promise<void> {
    return refreshAgentRuntimeBrowsersForArtifactChange({ threadId, workspacePath, artifactPath }, {
      refreshWorkspaceArtifact: (input) => this.browser.refreshWorkspaceArtifact(input),
      refreshExternalFileBrowserTabs,
      emitBrowserState: () => this.emitBrowserState(),
      emit: (event) => this.emit(event),
    });
  }

  private emit(event: DesktopEvent): void {
    emitAgentRuntimeDesktopEvent(event, {
      getWindow: () => this.getWindow(),
      store: this.store,
      lastRendererSendFailureAt: () => this.lastRendererSendFailureAt,
      setLastRendererSendFailureAt: (value) => {
        this.lastRendererSendFailureAt = value;
      },
    });
  }

}

export { shouldOpenApiKeyDialogForRuntimeError } from "./agentRuntimeErrorFormatting";
export {
  BrowserToolTimeoutError,
  browserToolTimeoutMs,
  withBrowserToolHeartbeat,
} from "./browser-tools/agentRuntimeBrowserToolHeartbeat";
export { assistantFinalizationRetryAttemptsUsedForReason } from "./agentRuntimeAssistantRetryInput";
