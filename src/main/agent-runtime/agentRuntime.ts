import type { BrowserWindow } from "electron";
import type { Model } from "@mariozechner/pi-ai";
import {
  type ExtensionFactory,
  type AgentToolResult,
} from "@mariozechner/pi-coding-agent";
import type {
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  RuntimeSurfaceWorkflowRecoveryEvent,
} from "../../shared/messagingGateway";
import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";
import { LocalPreviewServerManager } from "./agentRuntimeBrowserFacade";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import { createAgentRuntimeFoundationControllers } from "./agentRuntimeFoundationControllers";
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
  normalizeAmbientModelId,
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
import { createRuntimeSendStreamDiagnostics } from "./agentRuntimeSendStreamDiagnostics";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import type {
  AgentRuntimeSessionFactoryController,
  AgentRuntimePiSession,
} from "./agentRuntimeSessionFactoryController";
import { piAssistantMessageMetadata } from "./agentRuntimeAssistantMessageMetadata";
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
  completeMessagingRemoteSurfaceCommandPendingProjectSwitch,
  type MessagingRemoteSurfaceCommandPendingProjectSwitch,
} from "./messaging/agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import {
  carrySymphonyParentModePolicy,
  carrySymphonyParentModeVerifiedLaunch,
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
import { agentRuntimeWorkflowRecoveryEventsForRemoteSurface } from "./workflow-support/agentRuntimeWorkflowRecoveryEvents";
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
  type RuntimeOpenToolFailureReason,
} from "./openToolFailureUpdates";
import { createRuntimeAssistantRetryPlanning } from "./runtimeAssistantRetryPlanning";
import {
  type RuntimePermissionWaitControl,
} from "./runtimePermissionWaitController";
import { createRuntimePermissionWaitSetup } from "./runtimePermissionWaitSetup";
import {
  createRuntimeQueuedMessageController,
} from "./runtimeQueuedMessageController";
import { createRuntimeRunEventScope } from "./runtimeRunEventScope";
import { AgentRuntimePromptOutcomeController } from "./agentRuntimePromptOutcomeController";
import {
  type RuntimeAssistantTerminalCompletion,
} from "./runtimeAssistantTerminalCompletion";
import {
  type RuntimeEmptyAssistantStallWatchdog,
} from "./runtimeEmptyAssistantStallWatchdog";
import {
  type RuntimeToolArgumentWatchdog,
} from "./runtimeToolArgumentWatchdog";
import {
  type RuntimeToolExecutionWatchdog,
} from "./runtimeToolExecutionWatchdog";
import type { RuntimeStreamWatchdogController } from "./runtimeStreamWatchdogController";
import { createRuntimeStreamActivityTracker } from "./runtimeStreamActivityTracker";
import { createRuntimeSendSessionLifecycle } from "./runtimeSendSessionLifecycle";
import { createRuntimeAssistantMessageController } from "./runtimeAssistantMessageController";
import { createRuntimeToolContextSetup } from "./runtimeToolContextSetup";
import { createRuntimeProviderContinuationSetup } from "./runtimeProviderContinuationSetup";
import { createRuntimeAbortContextSetup } from "./runtimeAbortContextSetup";
import type { RuntimeAbortContextActiveRun } from "./runtimeAbortContext";
import { createRuntimeTextOutputState } from "./runtimeTextOutputState";
import { createRuntimeProviderRetryState } from "./runtimeProviderRetryState";
import { createRuntimeStreamTraceState } from "./runtimeStreamTraceState";
import { createRuntimeSendPendingFollowUps } from "./runtimeSendPendingFollowUps";
import { createRuntimePromptControlState } from "./runtimePromptControlState";
import { createRuntimePromptLifecycleControls } from "./runtimePromptLifecycleControls";
import { AgentRuntimePromptExecutionController } from "./agentRuntimePromptExecutionController";
import { resolveAgentRuntimeImageInputs } from "./agentRuntimeImageInputs";
import { AgentRuntimeSendPreflightController } from "./agentRuntimeSendPreflightController";

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
  private readonly pendingProjectSwitchByThreadId = new Map<string, MessagingRemoteSurfaceCommandPendingProjectSwitch>();
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
    const foundationControllers = createAgentRuntimeFoundationControllers({
      store: this.store,
      browser: this.browser,
      features: this.features,
      permissions: this.permissions,
      sessions: this.sessions,
      activeRuns: this.activeRuns,
      pendingProjectSwitchByThreadId: this.pendingProjectSwitchByThreadId,
      permissionWaitControls: this.permissionWaitControls,
      localModelRuntimeManager: this.localModelRuntimeManager,
      callbacks: {
        completePendingProjectSwitch: (projectSwitch, input) =>
          this.completePendingRemoteProjectSwitch(projectSwitch, input),
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
        workflowRecoveryEvents: () => this.workflowRecoveryEventsForRemoteSurface(),
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
      callbacks: {
        commitThreadPiSessionFile: (input) => this.commitThreadPiSessionFile(input),
        createCallableWorkflowToolExtension: (
          threadId,
          workspace,
          initialRecordedWorkflowPlaybooks,
          childCallableWorkflowToolNames,
          symphonyParentModePolicy,
          symphonyParentModeVerifiedLaunch,
        ) => this.createCallableWorkflowToolExtension(
          threadId,
          workspace,
          initialRecordedWorkflowPlaybooks,
          childCallableWorkflowToolNames,
          symphonyParentModePolicy,
          symphonyParentModeVerifiedLaunch,
        ),
        createInterruptedToolCallRecoveryToolExtension: (threadId, workspace) =>
          this.createInterruptedToolCallRecoveryToolExtension(threadId, workspace),
        createPermissionGateExtension: (threadId, workspace) => this.createPermissionGateExtension(threadId, workspace),
        createSubagentToolExtension: (threadId, pluginMcpTools) =>
          this.createSubagentToolExtension(threadId, pluginMcpTools),
        currentFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
        emit: (event) => this.emit(event),
        ensurePluginMcpToolTrusted: (threadId, workspace, registration) =>
          this.ensurePluginMcpToolTrusted(threadId, workspace, registration),
        fileAuthorityRootPathsForThread: (threadId, access) =>
          this.fileAuthorityRootPathsForThread(threadId, access),
        includeWorkspaceRootAuthorityForThread: (threadId) => this.includeWorkspaceRootAuthorityForThread(threadId),
        markPluginToolsStale: (threadId) => this.markPluginToolsStale(threadId),
        recordContextUsageSnapshot: (threadId, session, message) =>
          this.recordContextUsageSnapshot(threadId, session, message),
        recordUnavailableContextUsageSnapshot: (thread, message) =>
          this.store.recordContextUsageSnapshot(this.unavailableContextUsageSnapshot(thread, message)),
        requestFileAuthorityForThread: (threadId, workspace, request) =>
          this.requestFileAuthorityForThread(threadId, workspace, request),
        resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
        resolveToolCallPermission: (threadId, workspace, toolName, toolInput) =>
          this.resolveToolCallPermission(threadId, workspace, toolName, toolInput),
        revokePluginGrantsForLabels: (labels) => this.revokePluginGrantsForLabels(labels),
        runCapabilityBuilderValidationWithPermission: (input) =>
          this.runCapabilityBuilderValidationWithPermission(input),
        send: (input) => this.send(input),
        tryRouteBrowserContentThroughScrapling: (input) => this.tryRouteBrowserContentThroughScrapling(input),
      },
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
      callbacks: {
        abortChildThread: (threadId, options) => this.abort(threadId, options),
        currentFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
        emit: (event) => this.emit(event),
        emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
        ensurePluginMcpToolTrusted: (threadId, workspace, registration) =>
          this.ensurePluginMcpToolTrusted(threadId, workspace, registration),
        prepareChildWorktree: (run) => this.prepareSubagentChildWorktree(run),
        recordContextUsageSnapshot: (threadId, session, message) =>
          this.recordContextUsageSnapshot(threadId, session, message),
        resolveModelRuntimeProfile: (modelId) => this.resolveSubagentModelRuntimeProfile(modelId),
        send: (input, hooks) => this.send(input, hooks),
      },
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
      callbacks: {
        applyThreadModelSettings: (threadId) => this.applyThreadModelSettings(threadId),
        clearWorkflowPlanEditIntent: (threadId) => {
          this.workflowPlanEditIntentByThreadId.delete(threadId);
          this.workflowPlanEditWorkflowThreadByThreadId.delete(threadId);
        },
        commitThreadPiSessionFile: (input) => this.commitThreadPiSessionFile(input),
        completePendingProjectSwitch: (projectSwitch, switchInput) =>
          this.completePendingRemoteProjectSwitch(projectSwitch, switchInput),
        currentFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
        emit: (event) => this.emit(event),
        generateTitleIfNeeded: (thread, prompt) => this.generateTitleIfNeeded(thread, prompt),
        getRunRecord: (runId) => {
          try {
            return this.store.getRunRecord(runId);
          } catch {
            return undefined;
          }
        },
        getSession: (thread) => this.getSession(thread),
        preflightBeforePrompt: (preflightInput) =>
          this.preflightBeforePrompt(
            preflightInput.thread,
            preflightInput.session,
            preflightInput.promptContent,
            preflightInput.setActiveRunStatus,
            preflightInput.isRunStoreActive,
            preflightInput.emitRunEvent,
          ),
        abortSessionRun: (executionSession, threadId) => this.abortSessionRunForThread(executionSession, threadId),
        recordContextUsageSnapshot: (threadId, session, snapshotMessage) =>
          this.recordContextUsageSnapshot(threadId, session, snapshotMessage),
        refreshBrowsersForArtifactChange: (threadId, workspacePath, artifactPath) =>
          this.refreshBrowsersForArtifactChange(threadId, workspacePath, artifactPath),
        resolveSubagentFinalizationBlock: (threadId, runId) => this.subagentFinalizationBarrierBlock(threadId, runId),
        resolveCallableWorkflowFinalizationBlock: (threadId, runId, verifiedLaunch) =>
          this.callableWorkflowFinalizationBlock(threadId, runId, verifiedLaunch),
        recordSubagentFinalizationBlockedParentMailbox: (threadId, runId, block) =>
          this.recordSubagentFinalizationBlockedParentMailbox(threadId, runId, block),
        recordCallableWorkflowFinalizationBlockedParentMailbox: (threadId, runId, block) =>
          this.recordCallableWorkflowFinalizationBlockedParentMailbox(threadId, runId, block),
        suppressCallableWorkflowParentAssistantMessages: (block, options) =>
          this.suppressCallableWorkflowParentAssistantMessages(block, options),
        send: (followUp, followUpHooks) => this.send(followUp, followUpHooks),
        setWorkflowPlanEditIntent: (threadId, intent, workflowThreadId) => {
          this.workflowPlanEditIntentByThreadId.set(threadId, intent);
          this.workflowPlanEditWorkflowThreadByThreadId.set(threadId, workflowThreadId);
        },
        takePendingProjectSwitch: (threadId) => {
          const pendingProjectSwitch = this.pendingProjectSwitchByThreadId.get(threadId);
          this.pendingProjectSwitchByThreadId.delete(threadId);
          return pendingProjectSwitch;
        },
        deletePendingProjectSwitch: (threadId) => {
          this.pendingProjectSwitchByThreadId.delete(threadId);
        },
      },
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

  private workflowRecoveryEventsForRemoteSurface(): RuntimeSurfaceWorkflowRecoveryEvent[] {
    return agentRuntimeWorkflowRecoveryEventsForRemoteSurface({
      workflowFolders: this.store.listWorkflowAgentFolders(),
      getWorkflowArtifact: (artifactId) => this.store.getWorkflowArtifact(artifactId),
      listWorkflowRunEvents: (runId) => this.store.listWorkflowRunEvents(runId),
    });
  }

  private async completePendingRemoteProjectSwitch(
    projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch,
    input: { threadId?: string; workspacePath?: string; throwOnFailure?: boolean } = {},
  ): Promise<"completed" | "failed"> {
    const switchProject = this.features.projects?.switchProject;
    return completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
      projectSwitch,
      ...(switchProject ? { switchProject } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
      ...(input.throwOnFailure !== undefined ? { throwOnFailure: input.throwOnFailure } : {}),
      updateRuntimeEvent: (eventId, patch) => this.remoteSurfaceRuntimeEvents.update(eventId, patch),
      emitError: (event) => this.emit({ type: "error", ...event }),
    });
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
      isRunStoreActive,
      emitRunEvent,
      markRunActivity,
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

    const assistantMessage = this.store.addMessage({
      threadId: input.threadId,
      role: "assistant",
      content: "",
      metadata: piAssistantMessageMetadata("streaming"),
    });
    const run = this.store.startRun({ threadId: input.threadId, assistantMessageId: assistantMessage.id });
    this.activeRunIds.set(input.threadId, run.id);
    this.emit({ type: "message-created", message: assistantMessage });
    this.emit({ type: "run-status", threadId: input.threadId, status: "starting" });

    const runStartedAt = new Date().toISOString();
    const runGoal = this.store.getThreadGoal(input.threadId);
    const runGoalId = runGoal?.status === "active" ? runGoal.goalId : undefined;
    const runGoalStartedAtMs = Date.now();
    let session: PiSession | undefined;
    const promptLifecycleControls = createRuntimePromptLifecycleControls({
      threadId: input.threadId,
      runId: run.id,
      initialStatus: "starting",
      isRunStoreActive,
      updateRunStatus: (runId, status) => {
        this.store.updateRunStatus(runId, status);
      },
      emitRunEvent,
    });
    const {
      assistantFinalizationRetryAttemptsUsedFor,
      assistantFinalizationRetryNextAttemptFor,
      canScheduleAssistantFinalizationRetryFor,
      sessionRecoveryForCurrentSession,
      persistCurrentSessionPointerForRetry,
      createAssistantFinalizationRetryInput,
      createInterruptedToolCallRecoveryInput,
    } = createRuntimeAssistantRetryPlanning({
      baseInput: sendInputWithSymphonyParentModePolicy,
      threadId: input.threadId,
      usesDedicatedReviewSession,
      activeAssistantFinalizationRetry,
      assistantFinalizationRetryMaxRetries,
      retrySourceUserMessageId,
      interruptedToolCallRecoveryAttemptsUsed,
      interruptedToolCallRecoveryMaxRetries,
      getPermissionMode: () => this.store.getThread(input.threadId).permissionMode,
      getCurrentSessionFile: () => session?.sessionFile,
      getCurrentThreadPiSessionFile: () => this.store.getThread(input.threadId).piSessionFile,
      shouldUseCurrentSessionForRetry: () => normalizeAmbientModelId(this.store.getThread(input.threadId).model) === normalizeAmbientModelId(runtimeModel),
      commitThreadPiSessionFile: (commitInput) => this.commitThreadPiSessionFile(commitInput),
      emit: emitRunEvent,
    });
    const promptControlState = createRuntimePromptControlState();
    const outputState = createRuntimeTextOutputState();
    let streamWatchdog: RuntimeStreamWatchdogController | undefined;
    let toolArgumentWatchdog: RuntimeToolArgumentWatchdog | undefined;
    let toolExecutionWatchdog: RuntimeToolExecutionWatchdog | undefined;
    let emptyAssistantStallWatchdog: RuntimeEmptyAssistantStallWatchdog;
    let assistantTerminalCompletion: RuntimeAssistantTerminalCompletion;
    const streamTraceState = createRuntimeStreamTraceState();
    const providerRetryState = createRuntimeProviderRetryState();
    const pendingFollowUps = createRuntimeSendPendingFollowUps({
      emptyResponseRetryDelayMs: ASSISTANT_FINALIZATION_RETRY_DELAY_MS,
    });
    const runtimeMessages = createRuntimeAssistantMessageController({
      threadId: input.threadId,
      initialAssistantMessage: assistantMessage,
      markRunActivity,
      resetAssistantStreamState: outputState.resetAssistantStreamState,
      resetThinkingStreamState: outputState.resetThinkingStreamState,
      listMessages: () => this.store.listMessages(input.threadId),
      addAssistantMessage: (messageInput) => this.store.addMessage({
        threadId: messageInput.threadId,
        role: "assistant",
        content: messageInput.content,
        metadata: messageInput.metadata,
      }),
      appendToMessage: (messageId, delta) => this.store.appendToMessage(messageId, delta),
      replaceMessage: (messageId, content, metadata) => this.store.replaceMessage(messageId, content, metadata),
      emitRunEvent,
    });
    const queuedMessages = createRuntimeQueuedMessageController({
      threadId: input.threadId,
      workspacePath: runWorkspacePath,
      isRunStoreActive,
      markRunActivity,
      getSession: () => session,
      isQueueReady: promptControlState.isQueueReady,
      incrementRunEventSeq: promptControlState.incrementRunEventSeq,
      replaceMessage: (messageId, content, metadata) =>
        this.store.replaceMessage(messageId, content, metadata),
      emitRunEvent,
    });
    const piStreamActivity = createRuntimeStreamActivityTracker({
      threadId: input.threadId,
      idleTimeoutMs: piStreamIdleTimeoutMs,
      progressThrottleMs: CHAT_PI_STREAM_PROGRESS_THROTTLE_MS,
      progressCharDelta: CHAT_PI_STREAM_PROGRESS_CHAR_DELTA,
      getOutputChars: outputState.assistantOutputChars,
      getThinkingChars: outputState.thinkingOutputChars,
      resetStreamWatchdog: () => {
        streamWatchdog?.reset();
      },
      refreshEmptyAssistantStallWatchdog: () => {
        emptyAssistantStallWatchdog?.refreshOnStreamActivity();
      },
      resetAssistantTerminalCompletion: () => {
        assistantTerminalCompletion?.resetOnActivity();
      },
      emitRunEvent,
    });
    let resolveActiveRunSettled: (() => void) | undefined;
    const activeRunSettled = new Promise<void>((resolve) => {
      resolveActiveRunSettled = resolve;
    });
    const {
      currentPiStreamFailureKind,
      currentPiStreamTimeoutMessage,
      currentPiStreamIdleSource,
      chatStreamSemanticOutputSeen,
      recordPiStreamTraceEvent,
      persistPiStreamTrace,
      chatStreamInterruptionDiagnostic,
      chatStreamInterruptionNotice,
    } = createRuntimeSendStreamDiagnostics({
      runId: run.id,
      threadId: input.threadId,
      recentEventLimit: CHAT_PI_STREAM_TRACE_RECENT_EVENT_LIMIT,
      recentEvents: streamTraceState.recentEvents(),
      getWorkspaceStatePath: () => this.store.getWorkspace().statePath,
      getTraceReference: streamTraceState.traceReference,
      setTraceReference: streamTraceState.setTraceReference,
      updateRunDiagnostics: (diagnostics) => this.store.updateRunDiagnostics(run.id, diagnostics),
      getState: () => {
        const streamActivity = piStreamActivity.snapshot();
        const output = outputState.snapshot();
        const providerRetry = providerRetryState.snapshot();
        return {
          piStreamEventCount: streamActivity.eventCount,
          streamWatchdogTimeoutMessage: promptControlState.streamWatchdogTimeoutMessage(),
          piPreStreamTimeoutMs,
          piStreamIdleTimeoutMs,
          runStartedAt,
          assistantOutputChars: output.assistantOutputChars,
          thinkingOutputChars: output.thinkingOutputChars,
          currentAssistantFinalText: output.currentAssistantFinalText,
          currentThinkingFinalText: output.currentThinkingFinalText,
          receivedAnyText: output.receivedAnyText,
          currentAssistantReceivedText: output.currentAssistantReceivedText,
          currentThinkingReceivedText: output.currentThinkingReceivedText,
          toolMessageCount: toolMessages.size(),
          sessionFile: session?.sessionFile,
          piPromptStartLine: streamTraceState.piPromptStartLine(),
          piPromptUserLine: streamTraceState.piPromptUserLine(),
          promptContentSha256: streamTraceState.promptContentSha256(),
          promptContentLength: promptContent.length,
          currentAssistantMessageId: runtimeMessages.currentAssistantMessageId(),
          runtimeModel,
          piStreamApproximatePayloadBytes: streamActivity.approximatePayloadBytes,
          firstPiStreamEventAt: streamActivity.firstEventAt,
          firstPiStreamEventType: streamActivity.firstEventType,
          lastPiStreamEventAt: streamActivity.lastEventAt,
          lastPiStreamEventType: streamActivity.lastEventType,
          firstAssistantVisibleTextAt: output.firstAssistantVisibleTextAt,
          firstToolArgumentAt: streamTraceState.firstToolArgumentAt(),
          firstToolExecutionStartedAt: streamTraceState.firstToolExecutionStartedAt(),
          providerRetryAttemptCount: providerRetry.providerRetryAttemptCount,
          providerRetryLastError: providerRetry.providerRetryLastError,
        };
      },
    });
    const toolContext = createRuntimeToolContextSetup({
      threadId: input.threadId,
      workspacePath: thread.workspacePath,
      permissionMode: thread.permissionMode,
      runId: run.id,
      outputState,
      visibleUserContent,
      isRunStoreActive,
      retrySourceUserMessageId: () => retrySourceUserMessageId,
      listMessages: () => this.store.listMessages(input.threadId),
      addToolMessage: (messageInput) => this.store.addMessage({
        threadId: messageInput.threadId,
        role: "tool",
        content: messageInput.content,
        metadata: messageInput.metadata,
      }),
      replaceMessage: (messageId, content, metadata) => this.store.replaceMessage(messageId, content, metadata),
      updateRunDiagnostics: (diagnostics) => this.store.updateRunDiagnostics(run.id, diagnostics),
      emitRunEvent,
    });
    const { toolArgumentProgress, startedToolCallIds, toolMessages, toolRecovery } = toolContext;
    const {
      interruptedToolCallRecovery,
      toolIntentSnapshots,
      persistToolArgumentDiagnostics,
      forceInterruptedToolCallRecovery,
    } = toolRecovery;

    const abortContext = createRuntimeAbortContextSetup<PiSession>({
      threadId: input.threadId,
      runId: run.id,
      dedicatedSessionKind: runtimeInput.dedicatedSessionKind,
      activeRunSettled,
      runEventScope,
      queuedMessages,
      outputState,
      promptLifecycleControls,
      isRunStoreActive,
      finishRun: (runId, status, errorMessage) => {
        this.store.finishRun(runId, status, errorMessage);
      },
      denyThread: (threadId) => this.permissions.denyThread(threadId),
      getSession: () => session,
      abortSessionRun: (abortSession, threadId) => this.abortSessionRunForThread(abortSession, threadId),
      markSubagentParentControlBarrierReconciled: (reconcileInput) =>
        this.store.markSubagentParentControlBarrierReconciled(reconcileInput),
      cascadeSubagentsForStoppedParentRun: (threadId, runId, reason) =>
        this.subagentStopCascade.cascadeSubagentsForStoppedParentRun(threadId, runId, reason),
      emitRunEvent,
    });
    const {
      abortRequested: isAbortRequested,
      subagentParentControlAbortIntent: currentSubagentParentControlAbortIntent,
      finishParentRun,
      consumeSubagentParentControlAbort,
      requestSubagentParentControlAbort,
    } = abortContext;
    this.activeRuns.set(input.threadId, abortContext.activeRun as ActiveRun);

    const permissionWaits = createRuntimePermissionWaitSetup({
      threadId: input.threadId,
      toolMessages,
      toolArgumentProgress,
      getToolExecutionWatchdog: () => toolExecutionWatchdog,
      getToolArgumentWatchdog: () => toolArgumentWatchdog,
      getStreamWatchdog: () => streamWatchdog,
      markRunActivity,
      replaceMessage: (messageId, content, metadata) =>
        this.store.replaceMessage(messageId, content, metadata),
      emitRunEvent,
    });
    this.permissionWaitControls.set(input.threadId, permissionWaits);

    let markOpenToolMessagesFailed: (reason: RuntimeOpenToolFailureReason) => void = () => undefined;

    const providerContinuation = createRuntimeProviderContinuationSetup({
      baseInput: sendInputWithSymphonyParentModePolicy,
      workspacePath: thread.workspacePath,
      runId: run.id,
      threadId: input.threadId,
      runtimeModel,
      piPreStreamTimeoutMs,
      piStreamIdleTimeoutMs,
      assistantFinalizationRetryMaxRetries,
      toolMessages,
      toolArgumentProgress,
      interruptedToolCallRecovery,
      startedToolCallIds,
      toolIntents: toolIntentSnapshots,
      runtimeMessages,
      outputState,
      streamActivity: piStreamActivity,
      streamTraceState,
      getPermissionMode: () => this.store.getThread(input.threadId).permissionMode,
      getModel: () => this.store.getThread(input.threadId).model,
      getRetrySourceUserMessageId: () => retrySourceUserMessageId,
      getSessionFile: () => session?.sessionFile,
      chatStreamSemanticOutputSeen,
      currentPiStreamIdleSource,
      assistantFinalizationRetryNextAttemptFor,
      sessionRecoveryForCurrentSession,
      updateRunDiagnostics: (diagnostics) => this.store.updateRunDiagnostics(run.id, diagnostics),
    });
    const {
      collectOpenProviderInterruptionToolSnapshots,
      createProviderContinuationState,
      persistProviderContinuationState,
      createProviderInterruptionContinuationInput,
    } = providerContinuation;

    const sendSessionLifecycle = createRuntimeSendSessionLifecycle<PiSession>({
      threadId: input.threadId,
      runId: run.id,
      getSession: () => session,
      removeActiveSessionIfCurrent: (cleanupSession) => {
        if (this.sessions.get(input.threadId) !== cleanupSession) return false;
        this.sessions.delete(input.threadId);
        return true;
      },
      usesDedicatedReviewSession,
      currentThreadPiSessionFile: () => this.store.getThread(input.threadId).piSessionFile,
      clearThreadPiSessionFile: () => {
        emitRunEvent({
          type: "thread-updated",
          thread: this.store.updateThreadSettings(input.threadId, { piSessionFile: null }),
        });
      },
      symphonyParentModePolicy,
      initialSymphonyParentModeVerifiedLaunch: runtimeInput.symphonyParentModeVerifiedLaunch,
      listCallableWorkflowTasksForParentRun: (runId) =>
        this.store.listCallableWorkflowTasksForParentRun(runId),
    });
    const { cleanupCurrentSession } = sendSessionLifecycle;

    try {
      session = usesDedicatedReviewSession
        ? await this.createWorkflowRecordingReviewSession(thread)
        : await this.getSession(
            thread,
            runtimeInput.sessionRecovery,
            symphonyParentModePolicy,
            runtimeInput.symphonyParentModeVerifiedLaunch,
          );
      if (!isRunStoreActive()) return;
      if (isAbortRequested()) {
        await this.abortSessionRunForThread(session, input.threadId);
        throw new Error("Run stopped.");
      }

      const promptExecutionResult = await this.promptExecutions.runPrompt({
        thread,
        runId: run.id,
        session,
        promptContent,
        images: promptImageInputs.images,
        preStreamTimeoutMs: piPreStreamTimeoutMs,
        streamIdleTimeoutMs: piStreamIdleTimeoutMs,
        defaultToolExecutionIdleTimeoutMs,
        emptyAssistantStallTimeoutMs,
        assistantTerminalGraceMs: ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS,
        postToolContinuationIdleMs: POST_TOOL_CONTINUATION_IDLE_MS,
        postToolFinalizationIdleMs: POST_TOOL_FINALIZATION_IDLE_MS,
        postToolFinalizationTickMs: POST_TOOL_FINALIZATION_TICK_MS,
        abortGraceMs: POST_TOOL_ABORT_GRACE_MS,
        assistantFinalizationRetryMaxRetries,
        isRunStoreActive,
        permissionWaits,
        promptControlState,
        promptLifecycleControls,
        streamTimeoutMessage: currentPiStreamTimeoutMessage,
        persistPiStreamTrace,
        toolArgumentProgress,
        forceInterruptedToolCallRecovery,
        outputState,
        runtimeMessages,
        getMessages: () => this.store.listMessages(input.threadId),
        queuedMessages,
        streamActivity: piStreamActivity,
        streamTraceState,
        providerRetryState,
        toolMessages,
        toolRecovery,
        startedToolCallIds,
        markRunActivity,
        recordPiStreamTraceEvent,
        requestSubagentParentControlAbort,
        setStreamWatchdog: (controller) => {
          streamWatchdog = controller;
        },
        setToolExecutionWatchdog: (watchdog) => {
          toolExecutionWatchdog = watchdog;
        },
        setToolArgumentWatchdog: (watchdog) => {
          toolArgumentWatchdog = watchdog;
        },
        setEmptyAssistantStallWatchdog: (watchdog) => {
          emptyAssistantStallWatchdog = watchdog;
        },
        setAssistantTerminalCompletion: (completion) => {
          assistantTerminalCompletion = completion;
        },
        setMarkOpenToolMessagesFailed: (handler) => {
          markOpenToolMessagesFailed = handler;
        },
        emitRunEvent,
      });
      if (!promptExecutionResult.completed) return;

      const providerRetry = providerRetryState.snapshot();
      const promptRunState = promptExecutionResult.promptRunState;
      const promptRun = promptRunState.snapshot();
      const symphonyParentModeVerifiedLaunch =
        sendSessionLifecycle.resolveAndStoreCurrentSymphonyParentModeVerifiedLaunch();
      sendSessionLifecycle.assertRequiredSymphonyParentModeLaunch(symphonyParentModeVerifiedLaunch);
      const promptSuccess = await this.promptOutcomes.handlePromptSuccess({
        sendInput: input,
        runId: run.id,
        runWorkspacePath,
        session,
        runtimeMessages,
        toolMessages,
        plannerFinalizationSources,
        runtimeError: promptRun.runtimeError,
        abortRequested: isAbortRequested(),
        finalizedAfterToolIdle: promptRun.finalizedAfterToolIdle,
        currentThinkingFinalText: outputState.currentThinkingFinalText(),
        currentAssistantFinalText: outputState.currentAssistantFinalText(),
        receivedAnyText: outputState.receivedAnyText(),
        pendingEmptyResponseRetryDelayMs: pendingFollowUps.pendingEmptyResponseRetryDelayMs(),
        activeRetryReason: activeAssistantFinalizationRetry?.reason,
        retrySourceUserMessageId,
        lastAssistantTerminalEvent: promptRun.lastAssistantTerminalEvent,
        assistantTerminalCleanupDiagnostic: promptRun.assistantTerminalCleanupDiagnostic,
        subagentParentControlAbortIntent: currentSubagentParentControlAbortIntent(),
        providerRetryBeforeVisibleOutput: providerRetry.providerRetryBeforeVisibleOutput,
        providerRetryRecovered: providerRetry.providerRetryRecovered,
        providerRetryAttemptCount: providerRetry.providerRetryAttemptCount,
        providerRetryLastError: providerRetry.providerRetryLastError,
        usesDedicatedReviewSession,
        symphonyParentModeVerifiedLaunch,
        assistantFinalizationRetryMaxRetries,
        canScheduleAssistantFinalizationRetryFor,
        assistantFinalizationRetryAttemptsUsedFor,
        assistantFinalizationRetryNextAttemptFor,
        createAssistantFinalizationRetryInput,
        consumeSubagentParentControlAbort,
        cleanupCurrentSession,
        finishPlannerFinalizationSources,
        finishParentRun,
        emitRunEvent,
      });
      pendingFollowUps.applyPromptSuccess({
        ...promptSuccess,
        pendingEmptyResponseRetry: carrySymphonyParentModeVerifiedLaunch(
          promptSuccess.pendingEmptyResponseRetry,
          symphonyParentModeVerifiedLaunch,
        ),
      });
    } catch (error) {
      const symphonyParentModeVerifiedLaunch =
        sendSessionLifecycle.refreshStoredSymphonyParentModeVerifiedLaunch();
      await this.promptOutcomes.handlePromptFailure({
        error,
        sendInput: input,
        runId: run.id,
        runWorkspacePath,
        usesDedicatedReviewSession,
        activeAssistantFinalizationRetry,
        assistantFinalizationRetryMaxRetries,
        interruptedToolCallRecoveryAttemptsUsed,
        interruptedToolCallRecoveryMaxRetries,
        canScheduleInterruptedToolCallRecovery,
        pendingEmptyResponseRetryDelayMs: pendingFollowUps.pendingEmptyResponseRetryDelayMs(),
        retrySourceUserMessageId,
        runtimeMessages,
        toolMessages,
        toolArgumentProgress,
        interruptedToolCallRecovery,
        startedToolCallIds,
        abortRequested: isAbortRequested,
        streamWatchdogTimedOut: promptControlState.isStreamTimedOut,
        currentPiStreamFailureKind,
        currentAssistantFinalText: outputState.currentAssistantFinalText,
        currentThinkingFinalText: outputState.currentThinkingFinalText,
        receivedAnyText: outputState.receivedAnyText,
        subagentParentControlAbortIntent: currentSubagentParentControlAbortIntent,
        isRunStoreActive,
        consumeSubagentParentControlAbort,
        persistPiStreamTrace,
        canScheduleAssistantFinalizationRetryFor,
        assistantFinalizationRetryAttemptsUsedFor,
        assistantFinalizationRetryNextAttemptFor,
        sessionRecoveryForCurrentSession,
        createAssistantFinalizationRetryInput,
        createInterruptedToolCallRecoveryInput,
        collectOpenProviderInterruptionToolSnapshots,
        createProviderContinuationState,
        persistProviderContinuationState,
        persistCurrentSessionPointerForRetry,
        createProviderInterruptionContinuationInput,
        setPendingEmptyResponseRetry: pendingFollowUps.setPendingEmptyResponseRetry,
        setPendingInterruptedToolCallRecoveryFollowUp: pendingFollowUps.setPendingInterruptedToolCallRecoveryFollowUp,
        setPendingProviderInterruptionContinuation: pendingFollowUps.setPendingProviderInterruptionContinuation,
        providerRetryAttemptCount: providerRetryState.providerRetryAttemptCount,
        setProviderRetryAttemptCount: providerRetryState.setProviderRetryAttemptCount,
        setProviderRetryLastError: providerRetryState.setProviderRetryLastError,
        cleanupCurrentSession,
        markOpenToolMessagesFailed,
        persistToolArgumentDiagnostics,
        finishPlannerFinalizationSources,
        finishParentRun,
        getThread: () => this.store.getThread(input.threadId),
        symphonyParentModePolicy,
        symphonyParentModeVerifiedLaunch,
        chatStreamInterruptionDiagnostic,
        chatStreamInterruptionNotice,
        emitRunEvent,
      });
    } finally {
      const pendingFollowUpsSnapshot = pendingFollowUps.snapshot();
      await this.promptOutcomes.finalizeSendAfterRun({
        sendInput: input,
        hooks,
        runId: run.id,
        runWorkspacePath,
        runGoalId,
        runGoalStartedAtMs,
        promptContent,
        currentAssistantFinalText: outputState.currentAssistantFinalText(),
        assistantOutputChars: outputState.assistantOutputChars(),
        currentThinkingFinalText: outputState.currentThinkingFinalText(),
        thinkingOutputChars: outputState.thinkingOutputChars(),
        abortRequested: isAbortRequested(),
        pendingPlannerRepairFollowUp: pendingFollowUpsSnapshot.pendingPlannerRepairFollowUp,
        pendingEmptyResponseRetry: pendingFollowUpsSnapshot.pendingEmptyResponseRetry,
        pendingInterruptedToolCallRecoveryFollowUp: pendingFollowUpsSnapshot.pendingInterruptedToolCallRecoveryFollowUp,
        pendingProviderInterruptionContinuation: pendingFollowUpsSnapshot.pendingProviderInterruptionContinuation,
        pendingEmptyResponseRetryDelayMs: pendingFollowUpsSnapshot.pendingEmptyResponseRetryDelayMs,
        usesDedicatedReviewSession,
        session,
        hasWorkflowPlanEditIntent,
        isRunStoreActive,
        cleanupCurrentSession,
        emitRunEvent,
        toolArgumentWatchdog,
        toolExecutionWatchdog,
        queuedMessages,
        toolMessages,
        resolveActiveRunSettled,
      });
    }
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
