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
import { applyAgentBootstrapToPrompt, buildAgentBootstrapContext } from "./agentRuntimeAgentFacade";
import { resolveAgentHarnessVariant } from "./agentRuntimeAgentFacade";
import { LocalPreviewServerManager } from "./agentRuntimeBrowserFacade";
import type { PrivilegedActionAdapter } from "./agentRuntimePrivilegedActionFacade";
import type { PiSessionFileCommitReason } from "./agentRuntimeSessionFacade";
import { commitAgentRuntimeThreadPiSessionFile } from "./agentRuntimeSessionFileCommit";
import type {
  DesktopEvent,
  CompactThreadInput,
  SendMessageInput,
  RecoverThreadContextInput,
  UpdateMediaPlaybackSettingsInput,
  UpdatePlannerSettingsInput,
  UpdateSttSettingsInput,
  UpdateVoiceSettingsInput,
} from "../../shared/desktopTypes";
import type {
  CancelCallableWorkflowTaskInput,
  PauseCallableWorkflowTaskInput,
  CallableWorkflowTaskSummary,
  ResumeCallableWorkflowTaskInput,
  WorkflowAgentThreadSummary,
  WorkflowRecordingLibraryDescription,
  WorkflowRecoveryAction,
} from "../../shared/workflowTypes";
import type {
  PermissionPromptResolution,
  PermissionPromptResponseMode,
  PermissionRequest,
  SecureInputPromptResolution,
  PrivilegedActionNativeRequest,
  PrivilegedCredentialPromptResolution,
} from "../../shared/permissionTypes";
import type { PlannerSettings } from "../../shared/plannerTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
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
  EmbeddingProviderCandidate,
  MediaPlaybackSettings,
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  LocalDeepResearchSettings,
  LocalDeepResearchSmokeResult,
  LocalDeepResearchValidationResult,
  LocalModelHostMemorySnapshot,
  LocalModelResourcePolicyDecision,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
  SttProviderCandidate,
  SttSettings,
  VoiceSettingsAuditSource,
  VoiceProviderCandidate,
  VoiceSettings,
} from "../../shared/localRuntimeTypes";
import type {
  SearchRoutingSettings,
  WebResearchProviderConfig,
  WebResearchProviderRole,
} from "../../shared/webResearchTypes";
import type { ContextUsageSnapshot, ModelRuntimeSettings, RunStatus, ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import {
  AMBIENT_DEFAULT_MODEL,
  normalizeAmbientModelId,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { ResolveSubagentCapacityLeaseInput } from "../../shared/subagentCapacity";
import {
  isAmbientSubagentsEnabled,
  resolveAmbientFeatureFlags,
  type AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import type { AgentMemoryRuntimeSnapshot } from "../../shared/agentMemoryDiagnostics";
import { ambientRetryPolicyFromSettings } from "./agentRuntimeAmbientFacade";
import {
  AgentRuntimeContextRecoveryController,
  type AgentRuntimeContextRecoverySession,
} from "./agentRuntimeContextRecoveryController";
import {
  runProviderCallContextPreflightBeforePrompt,
} from "./agentRuntimeProviderContextPreflight";
import { runPromptPreflightBeforePrompt } from "./agentRuntimePromptPreflight";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { getAmbientProviderStatus } from "./agentRuntimeProviderFacade";
import { abortSessionRun as abortPiSessionRun } from "./agentRuntimeSessionFacade";
import type { AmbientCliVoiceRunner } from "./agentRuntimeVoiceFacade";
import type { WorkspaceMediaUrlInput } from "../../shared/workspaceMedia";
import type { AmbientFileAuthorityRequest } from "./agentRuntimePiFacade";
import {
  permissionPolicyFileToolAccess,
  permissionPolicyPathForTool,
  resolvePolicyPath,
  resolvePermissionWithGrants,
} from "./agentRuntimePermissionsFacade";
import {
  type PlannerDurableHtmlBrowserValidator,
} from "./agentRuntimePlannerFacade";
import { createPermissionGateExtension as createPermissionGateToolsExtension } from "./agentRuntimePermissionGateExtension";
import { permissionToolInput as resolvePermissionToolInput } from "./agentRuntimePermissionToolInput";
import { AmbientPluginHost, type PluginMcpRuntimeSnapshot, type PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import { discoverAmbientCliPackages } from "./agentRuntimeAmbientCliFacade";
import {
  type AmbientWorkflowPlaybookDescription,
  type AmbientWorkflowPlaybookInjection,
  type AmbientWorkflowsArchiveInput,
  type AmbientWorkflowsDescribeInput,
  type AmbientWorkflowsInjectInput,
  type AmbientWorkflowsRestoreVersionInput,
  type AmbientWorkflowsSearchInput,
  type AmbientWorkflowsSearchResponse,
  type AmbientWorkflowsUnarchiveInput,
  type AmbientWorkflowsUpdateInput,
} from "./agentRuntimeAmbientFacade";
import { webResearchSettingsWithDynamicProviderCatalogs } from "./agentRuntimeWebResearchFacade";
import {
  capabilityBuilderValidationPreviewText,
  previewCapabilityBuilderPackage,
  type CapabilityBuilderValidateInput,
  type CapabilityBuilderValidateResult,
  validateCapabilityBuilderPackage,
} from "./agentRuntimeCapabilityBuilderFacade";
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
import {
  AgentRuntimeSessionFactoryController,
  type AgentRuntimePiSession,
} from "./agentRuntimeSessionFactoryController";
import { piAssistantMessageMetadata } from "./agentRuntimeAssistantMessageMetadata";
import { goalRuntimeActivity } from "./agentRuntimeGoalRuntime";
import { AgentRuntimeActiveRunHandoffController } from "./agentRuntimeActiveRunHandoffController";
import { AgentRuntimeGoalContinuationController } from "./agentRuntimeGoalContinuationController";
import { AgentRuntimeThreadWakeContinuationController } from "./agentRuntimeThreadWakeContinuationController";
import { AgentRuntimeFinalizationCoordinator } from "./agentRuntimeFinalizationCoordinator";
import {
  AgentRuntimeSubagentChildTurnCoordinator,
  type SubagentChildTurnCompletion,
} from "./agentRuntimeSubagentChildTurnCoordinator";
import {
  AgentRuntimeSubagentChildLifecycleCoordinator,
  type SubagentChildExecutionRecord,
} from "./agentRuntimeSubagentChildLifecycleCoordinator";
import { AgentRuntimeSubagentChildRuntimeRouter } from "./agentRuntimeSubagentChildRuntimeRouter";
import { AgentRuntimeSubagentCapacityController } from "./agentRuntimeSubagentCapacityController";
import { AgentRuntimeSubagentStopCascadeController } from "./agentRuntimeSubagentStopCascadeController";
import { AgentRuntimeWorkflowRecordingReviewSessionController } from "./agentRuntimeWorkflowRecordingReviewSessionController";
import {
  AgentRuntimeCallableWorkflowSymphonyBridgeController,
  shouldCancelCallableWorkflowSymphonyLaunchChildren,
} from "./agentRuntimeCallableWorkflowSymphonyBridgeController";
import { AgentRuntimePlannerFinalizationController } from "./agentRuntimePlannerFinalizationController";
import {
  AgentRuntimeSendPreparationController,
  type RuntimeSendMessageInput,
} from "./agentRuntimeSendPreparationController";
import { runtimeSettingsActivity } from "./agentRuntimeRetrySettings";
import {
  type RuntimeSessionRecoveryContext,
} from "./agentRuntimeAssistantRetryInput";
import { withBrowserToolHeartbeat } from "./browser-tools/agentRuntimeBrowserToolHeartbeat";
import { AgentRuntimeBrowserToolController } from "./agentRuntimeBrowserToolController";
import { AgentRuntimeExtensionAssemblyController } from "./agentRuntimeExtensionAssemblyController";
import { AgentRuntimeMessagingGatewayController } from "./agentRuntimeMessagingGatewayController";
import { AgentRuntimeModelContextController } from "./agentRuntimeModelContextController";
import { AgentRuntimeProviderRuntimeController } from "./agentRuntimeProviderRuntimeController";
import {
  AgentRuntimeWebResearchController,
  type AgentRuntimeLocalDeepResearchWebBrokerInput,
  type AgentRuntimeWebResearchProviderPlanOptions,
} from "./agentRuntimeWebResearchController";
import {
  registerGoogleWorkspaceSetupTools,
  type AgentRuntimeGoogleWorkspaceTools,
} from "./agentRuntimeGoogleWorkspaceFacade";
import {
  formatLocalDeepResearchBytes,
  localDeepResearchRequestedLaunchFromContract,
} from "./agentRuntimeLocalDeepResearchFacade";
import { createAgentRuntimeLocalDeepResearchToolExtension } from "./agentRuntimeLocalDeepResearchFacade";
import {
  type AmbientCliSkillMountDiagnostics,
} from "./agentRuntimeAmbientCliSkillMount";
import {
  createPluginMcpToolExtension as createPluginMcpToolsExtension,
  pluginStateReaderFromStore,
} from "./agentRuntimePluginsFacade";
import { firstPartyPluginPermissionGrantHash, type ResolveFirstPartyPluginPermissionInput } from "./agentRuntimeFirstPartyPluginPermission";
import {
  createAgentRuntimePluginInstallApplyCallbacks,
  createAgentRuntimePluginInstallToolExtension,
} from "./agentRuntimePluginInstallToolExtension";
import {
  AgentRuntimePluginPermissionController,
  type AgentRuntimePluginMcpDescriptorDriftInput,
} from "./agentRuntimePluginPermissionController";
import {
  AgentRuntimeAsyncBashJobService,
  formatAsyncBashSnapshotForTool,
} from "./tools/agentRuntimeAsyncBashJobs";
import { AgentRuntimeToolRunnerController } from "./agentRuntimeToolRunnerController";
import { AgentRuntimeInstallRouteGuard } from "./agentRuntimeInstallRouteGuard";
import type { McpToolCallResult } from "./agentRuntimeMcpFacade";
import {
  createAgentRuntimeMcpToolOrchestration,
  type AgentRuntimeMcpToolOrchestration,
} from "./mcp/agentRuntimeMcpToolBridge";
import {
  ambientSubagentActiveToolNamesForThread,
  type SubagentPiToolStore,
} from "./agentRuntimeSubagentsFacade";
import {
  applyExplicitSubagentRequestGuidance,
  explicitSubagentRequestPreflight,
} from "./subagents/agentRuntimeSubagentIntentPreflight";
import { createAgentRuntimeSubagentEventingStore } from "./subagents/agentRuntimeSubagentEventingStore";
import { createAgentRuntimeSubagentToolExtension } from "./subagents/agentRuntimeSubagentTools";
import {
  callableWorkflowRecordedPlaybooks,
  createAgentRuntimeCallableWorkflowToolExtension,
} from "./agentRuntimeCallableWorkflowTools";
import { isCallableWorkflowSymphonyChildWaitPreCompilePause } from "../../shared/callableWorkflowTaskGuards";
import {
  cancelAgentRuntimeCallableWorkflowTask,
  createAgentRuntimeCallableWorkflowRuntimeBridge,
  createAgentRuntimeCallableWorkflowRunnerStore,
  executeAgentRuntimeCallableWorkflowTaskForThread,
  pauseAgentRuntimeCallableWorkflowTask,
  resumeAgentRuntimeCallableWorkflowTask,
  startAgentRuntimeCallableWorkflowTaskForThread,
} from "./agentRuntimeCallableWorkflowExecution";
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
import { createWorkflowNativeToolExtension as createWorkflowNativeToolsExtension } from "./workflow-support/agentRuntimeWorkflowNativeTools";
import {
  createInterruptedToolCallRecoveryToolExtension as createInterruptedToolCallRecoveryToolsExtension,
  readInterruptedToolCallRecoveryArtifact as readInterruptedToolCallRecoveryArtifactFromRoots,
} from "./agentRuntimeInterruptedRecoveryTools";
import {
  carrySymphonyParentModePolicy,
  carrySymphonyParentModeVerifiedLaunch,
  resolveSymphonyParentModePolicyForRuntimeSend,
  resolveSymphonyParentModeVerifiedLaunch,
  shouldRequireSymphonyParentModeLaunch,
  SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR,
  validateSymphonyParentModeCallableWorkflowPrelaunch,
  type SymphonyParentModePolicy,
  type SymphonyParentModeVerifiedLaunch,
} from "./agentRuntimeSymphonyParentMode";
import {
  type AmbientTencentMemoryLlmDelegate,
  type TencentMemoryCoreConstructorLoader,
} from "./agentRuntimeMemoryFacade";
import type { AnalyzeMiniCpmVisionInputOptions, SetupMiniCpmVisionProviderOptions } from "./agentRuntimeMiniCpmFacade";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchProviderSnapshot,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput,
} from "./agentRuntimeLocalDeepResearchFacade";
import { detectLocalDeepResearchManagedAssets } from "./agentRuntimeLocalDeepResearchFacade";
import type { LocalDeepResearchModelProfileId } from "./agentRuntimeLocalDeepResearchFacade";
import type { LocalDeepResearchRunRequest, LocalDeepResearchRunServiceResult } from "./agentRuntimeLocalDeepResearchFacade";
import {
  localDeepResearchInstallJobWarnings,
  reconcileLocalDeepResearchInstallJob,
  type LocalDeepResearchInstallRequest,
  type LocalDeepResearchInstallServiceResult,
} from "./agentRuntimeLocalDeepResearchFacade";
import { AgentRuntimeLocalRuntimeOwnershipController } from "./agentRuntimeLocalRuntimeOwnershipController";
import { detectLocalLlamaResidentProcesses, type LocalLlamaResidentProcess } from "./agentRuntimeLocalLlamaFacade";
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
import { createDefaultModelRuntimeRegistry } from "./agentRuntimeModelProviderFacade";
import type { LocalTextRuntimeManagerLike } from "./agentRuntimeLocalRuntimeFacade";
import { runAgentRuntimeLocalTextMainRun } from "./agentRuntimeLocalRuntimeFacade";
import {
  type CreateLocalTextSubagentRuntimeAdapterOptions,
  type LocalTextSubagentRuntimeConfig,
  type LocalTextSubagentRuntimeStore,
} from "./agentRuntimeLocalRuntimeFacade";
import { executeSubagentCancelAgent } from "./agentRuntimeSubagentsFacade";
import { executeSubagentBarrierDecision } from "./agentRuntimeSubagentsFacade";
import { assertCanCloseSubagentRun } from "./agentRuntimeSubagentsFacade";
import { executeSubagentCloseAgent } from "./agentRuntimeSubagentsFacade";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./agentRuntimeSubagentsFacade";
import { appendMappedSubagentRuntimeEvent } from "./agentRuntimeSubagentsFacade";
import { prepareThreadWorktree } from "./agentRuntimeGitFacade";
import type { LocalDeepResearchSmokeRequest } from "./agentRuntimeLocalDeepResearchFacade";
import { createDefaultMessagingProviderRegistry } from "./agentRuntimeMessagingFacade";
import {
  createMessagingBindingStore,
} from "./agentRuntimeMessagingFacade";
import { agentRuntimeWorkflowRecoveryEventsForRemoteSurface } from "./workflow-support/agentRuntimeWorkflowRecoveryEvents";
import {
  AgentRuntimeRemoteSurfaceRuntimeEventStore,
  type AgentRuntimeRemoteSurfaceRuntimeEventCreateInput,
} from "./messaging/agentRuntimeRemoteSurfaceRuntimeEvents";
import { AmbientWorkflowDescriptionState } from "./ambient-workflow/agentRuntimeAmbientWorkflowDescriptionState";
import type { AmbientCliSttRunner } from "./agentRuntimeSttFacade";
import { generateThreadTitle } from "./agentRuntimeThreadFacade";
import { runWorkflowArtifact } from "./agentRuntimeWorkflowFacade";
import type { WorkflowConnectorAccountAuthorizer, WorkflowConnectorDescriptor, WorkflowConnectorRegistration } from "./agentRuntimeWorkflowFacade";
import { BrowserService } from "./agentRuntimeBrowserFacade";
import { BrowserCredentialStore } from "./agentRuntimeBrowserFacade";
import { refreshExternalFileBrowserTabs } from "./agentRuntimeBrowserFacade";
import { refreshAgentRuntimeBrowsersForArtifactChange } from "./browser-tools/agentRuntimeBrowserRefresh";
import { createLambdaRlmToolExtension as createLambdaRlmToolsExtension } from "./agentRuntimeLambdaRlmTools";
import { GlmTokenizerService, type GlmTokenizerStatus } from "./agentRuntimeTokenizationFacade";
import {
  recordTransientFileAuthorityForAllowedTool,
  recordTransientFileAuthorityFromPermissionRequest,
  type TransientFileAuthorityRoot,
} from "./agentRuntimeFileAuthority";
import { AgentRuntimeFileAuthorityController } from "./agentRuntimeFileAuthorityController";
import {
  type RuntimeOpenToolFailureReason,
} from "./openToolFailureUpdates";
import { createRuntimeAssistantRetryPlanning } from "./runtimeAssistantRetryPlanning";
import {
  type RuntimePermissionWaitControl,
  type RuntimePermissionWaitFinish,
} from "./runtimePermissionWaitController";
import { createRuntimePermissionWaitSetup } from "./runtimePermissionWaitSetup";
import {
  createRuntimeQueuedMessageController,
} from "./runtimeQueuedMessageController";
import { createRuntimeRunEventScope } from "./runtimeRunEventScope";
import { finalizeRuntimeSubagentPreflightBlock } from "./runtimeSubagentPreflightBlock";
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
import { cleanupRuntimeSession } from "./runtimeSessionCleanup";
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
import {
  formatRuntimeError as formatAgentRuntimeError,
} from "./agentRuntimeErrorFormatting";
import { resolveAgentRuntimeToolCallPermission } from "./tools/agentRuntimeToolCallPermission";
import {
  isLocalTextSubagentProfile,
} from "./subagents/agentRuntimeSubagentRuntimeHelpers";
import { resolveAgentRuntimeImageInputs } from "./agentRuntimeImageInputs";

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

interface ActiveRun extends RuntimeAbortContextActiveRun {}

export interface AgentRuntimeSendHooks {
  onActivity?: () => void;
  awaitQueuedDeliveryCompletion?: boolean;
  awaitInternalRetryCompletion?: boolean;
}

export interface AgentRuntimeFeatures {
  localModelHostMemory?: () => LocalModelHostMemorySnapshot;
  localModelResidentProcesses?: (workspacePath: string) => Promise<LocalLlamaResidentProcess[]> | LocalLlamaResidentProcess[];
  browserLoginBroker?: boolean;
  featureFlags?: {
    readSnapshot: () => AmbientFeatureFlagSnapshot;
  };
  memory?: {
    loadTencentMemoryCore?: TencentMemoryCoreConstructorLoader;
    runWithAmbientPi?: AmbientTencentMemoryLlmDelegate;
    storageHealthy?: () => boolean;
  };
  mcp?: {
    userDataPath: string;
    appVersion?: string;
    env?: NodeJS.ProcessEnv;
  };
  ambientCli?: {
    autoInstallFirstParty?: boolean;
  };
  googleWorkspace?: AgentRuntimeGoogleWorkspaceTools;
  workflowNativeTools?: {
    connectorDescriptors?: () => WorkflowConnectorDescriptor[];
    connectorRegistrations?: () => WorkflowConnectorRegistration[];
    connectorAccountAuthorizer?: () => WorkflowConnectorAccountAuthorizer | undefined;
  };
  voice?: {
    readSettings: () => VoiceSettings;
    updateSettings?: (input: UpdateVoiceSettingsInput, audit?: VoiceSettingsAuditContext) => Promise<VoiceSettings> | VoiceSettings;
    listProviders?: (workspacePath: string) => Promise<VoiceProviderCandidate[]> | VoiceProviderCandidate[];
    testRunner?: AmbientCliVoiceRunner;
    onStateUpdated?: () => void;
    enforceArtifactBudget?: (workspacePath: string) => Promise<void> | void;
    createMediaUrl?: (input: WorkspaceMediaUrlInput) => string;
  };
  embeddings?: {
    listProviders?: (workspacePath: string) => Promise<EmbeddingProviderCandidate[]> | EmbeddingProviderCandidate[];
  };
  stt?: {
    readSettings: () => SttSettings;
    updateSettings?: (input: UpdateSttSettingsInput) => Promise<SttSettings> | SttSettings;
    listProviders?: (workspacePath: string) => Promise<SttProviderCandidate[]> | SttProviderCandidate[];
    testRunner?: AmbientCliSttRunner;
  };
  vision?: {
    setupMiniCpm?: (workspacePath: string, input: MiniCpmVisionSetupInput, options?: SetupMiniCpmVisionProviderOptions) => Promise<MiniCpmVisionSetupResult> | MiniCpmVisionSetupResult;
    analyzeMiniCpm?: (workspacePath: string, input: MiniCpmVisionAnalyzeInput, options?: AnalyzeMiniCpmVisionInputOptions) => Promise<MiniCpmVisionAnalysisResult> | MiniCpmVisionAnalysisResult;
  };
  localDeepResearch?: {
    readSettings?: () => LocalDeepResearchSettings;
    updateSettings?: (input: LocalDeepResearchSettings) => Promise<LocalDeepResearchSettings> | LocalDeepResearchSettings;
    buildSetupContract?: (workspacePath: string, input: LocalDeepResearchSetupInput) => Promise<LocalDeepResearchSetupContract> | LocalDeepResearchSetupContract;
    install?: (input: LocalDeepResearchInstallRequest) => Promise<LocalDeepResearchInstallServiceResult> | LocalDeepResearchInstallServiceResult;
    smoke?: (input: LocalDeepResearchSmokeRequest) => Promise<LocalDeepResearchSmokeResult> | LocalDeepResearchSmokeResult;
    validate?: (input: {
      workspacePath: string;
      setup: LocalDeepResearchSetupContract;
      managedAssets: Awaited<ReturnType<typeof detectLocalDeepResearchManagedAssets>>;
    }) => Promise<LocalDeepResearchValidationResult> | LocalDeepResearchValidationResult;
    run?: (input: LocalDeepResearchRunRequest) => Promise<LocalDeepResearchRunServiceResult> | LocalDeepResearchRunServiceResult;
  };
  localTextSubagents?: {
    resolveModelRuntimeProfile?: (modelId?: string) => AmbientModelRuntimeProfile;
    resolveRuntimeForMain?: (input: {
      thread: ThreadSummary;
      runId: string;
      model: AmbientModelRuntimeProfile;
      prompt: string;
    }) => LocalTextSubagentRuntimeConfig | undefined;
    resolveRuntimeForLaunch?: CreateLocalTextSubagentRuntimeAdapterOptions["resolveRuntimeForLaunch"];
    resolveRuntime?: CreateLocalTextSubagentRuntimeAdapterOptions["resolveRuntime"];
    runtimeManager?: LocalTextRuntimeManagerLike;
    buildResourceRegistry?: CreateLocalTextSubagentRuntimeAdapterOptions["buildResourceRegistry"];
    buildResourceRegistryForLaunch?: CreateLocalTextSubagentRuntimeAdapterOptions["buildResourceRegistryForLaunch"];
    buildPrompt?: CreateLocalTextSubagentRuntimeAdapterOptions["buildPrompt"];
    fetchImpl?: typeof fetch;
    now?: () => Date;
  };
  symphonyLaunchContracts?: {
    resolve: (contractId: string) => unknown;
  };
  media?: {
    readSettings: () => MediaPlaybackSettings;
    updateSettings?: (input: UpdateMediaPlaybackSettingsInput) => Promise<MediaPlaybackSettings> | MediaPlaybackSettings;
  };
  search?: {
    readSettings: () => SearchRoutingSettings;
    updateSettings?: (input: SearchRoutingSettings) => Promise<SearchRoutingSettings> | SearchRoutingSettings;
  };
  projects?: {
    listProjects?: () => ProjectSummary[];
    createProject?: (input: { name?: string; workspacePath?: string; reason: string }) => Promise<ProjectSummary> | ProjectSummary;
    switchProject?: (input: { workspacePath: string; reason: string }) => Promise<void> | void;
  };
  workflowAgents?: {
    runExploration?: (input: { workflowThreadId: string; reason: string }) => Promise<{
      thread: WorkflowAgentThreadSummary;
      traceId?: string;
      graphSnapshotId?: string;
      text?: string;
    }>;
    compilePreview?: (input: { workflowThreadId: string; reason: string }) => Promise<{
      thread: WorkflowAgentThreadSummary;
      artifactId?: string;
      runId?: string;
      text?: string;
    }>;
    reviewArtifact?: (input: {
      workflowThreadId: string;
      artifactId: string;
      decision: "approved" | "rejected";
      reason: string;
    }) => Promise<{
      thread: WorkflowAgentThreadSummary;
      artifactId: string;
      artifactStatus: string;
      changed: boolean;
      text?: string;
    }>;
    cancelRun?: (input: { workflowThreadId: string; runId: string; reason: string }) => Promise<{
      thread: WorkflowAgentThreadSummary;
      runId: string;
      runStatus?: string;
      changed: boolean;
      text?: string;
    }>;
    recoverRun?: (input: {
      workflowThreadId: string;
      runId: string;
      eventId: string;
      action: WorkflowRecoveryAction;
      graphNodeId?: string;
      itemKey?: string;
      reason: string;
    }) => Promise<{
      thread: WorkflowAgentThreadSummary;
      runId: string;
      runStatus?: string;
      changed: boolean;
      text?: string;
    }>;
  };
  workflowRecordings?: {
    search?: (input: AmbientWorkflowsSearchInput) => Promise<AmbientWorkflowsSearchResponse> | AmbientWorkflowsSearchResponse;
    describe?: (input: AmbientWorkflowsDescribeInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
    inject?: (input: AmbientWorkflowsInjectInput) => Promise<AmbientWorkflowPlaybookInjection> | AmbientWorkflowPlaybookInjection;
    update?: (input: AmbientWorkflowsUpdateInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
    archive?: (input: AmbientWorkflowsArchiveInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
    unarchive?: (input: AmbientWorkflowsUnarchiveInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
    restoreVersion?: (input: AmbientWorkflowsRestoreVersionInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
  };
  privilegedCredentials?: {
    request: (input: PrivilegedActionNativeRequest) => Promise<PrivilegedCredentialPromptResolution>;
  };
  secureInputs?: {
    request: (input: {
      threadId?: string;
      workspacePath?: string;
      requestId?: string;
      title: string;
      message: string;
      detail: string;
      inputLabel: string;
      inputKind: "telegram_login_code" | "telegram_password" | "generic_secret";
      inputMode: "text" | "password";
      providerId?: string;
      profileId?: string;
    }) => Promise<SecureInputPromptResolution>;
  };
  privilegedActionAdapter?: PrivilegedActionAdapter;
  planner?: {
    readSettings?: () => PlannerSettings;
    updateSettings?: (input: UpdatePlannerSettingsInput) => Promise<PlannerSettings> | PlannerSettings;
    durableBrowserValidator?: PlannerDurableHtmlBrowserValidator;
  };
}

export interface VoiceSettingsAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
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
const ASSISTANT_TERMINAL_PROMPT_GRACE_MS = ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS;
export const RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE = "Run interrupted because the Ambient runtime reset before this turn finished.";
export const WORKSPACE_SWITCH_INTERRUPTED_RUN_MESSAGE = "Run interrupted because the active project changed before Ambient finished this turn.";
const DEFAULT_SUBAGENT_MODEL_RUNTIME_REGISTRY = createDefaultModelRuntimeRegistry();
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
  private readonly finalizationCoordinator: AgentRuntimeFinalizationCoordinator;
  private readonly subagentChildTurns: AgentRuntimeSubagentChildTurnCoordinator;
  private readonly subagentChildLifecycle: AgentRuntimeSubagentChildLifecycleCoordinator;
  private readonly subagentChildRuntimeRouter: AgentRuntimeSubagentChildRuntimeRouter;
  private readonly subagentCapacity: AgentRuntimeSubagentCapacityController;
  private readonly subagentStopCascade: AgentRuntimeSubagentStopCascadeController;
  private readonly workflowRecordingReviewSessions: AgentRuntimeWorkflowRecordingReviewSessionController;
  private readonly callableWorkflowSymphonyBridge: AgentRuntimeCallableWorkflowSymphonyBridgeController;
  private readonly localRuntimeOwnership: AgentRuntimeLocalRuntimeOwnershipController;
  private readonly contextRecovery: AgentRuntimeContextRecoveryController;
  private readonly plannerFinalization: AgentRuntimePlannerFinalizationController;
  private readonly sendPreparation: AgentRuntimeSendPreparationController;
  private readonly activeRunHandoff: AgentRuntimeActiveRunHandoffController;
  private readonly promptOutcomes: AgentRuntimePromptOutcomeController;
  private readonly promptExecutions: AgentRuntimePromptExecutionController<PiSession>;
  private readonly fileAuthority: AgentRuntimeFileAuthorityController;
  private readonly pluginPermissions: AgentRuntimePluginPermissionController;
  private readonly pluginHost = new AmbientPluginHost();
  private readonly mcpToolOrchestration: AgentRuntimeMcpToolOrchestration;
  private readonly modelContext: AgentRuntimeModelContextController;
  private readonly extensionAssembly: AgentRuntimeExtensionAssemblyController;
  private readonly sessionFactory: AgentRuntimeSessionFactoryController;
  private readonly providerRuntime: AgentRuntimeProviderRuntimeController;
  private readonly messagingGateway: AgentRuntimeMessagingGatewayController;
  private readonly webResearch: AgentRuntimeWebResearchController;
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
    this.mcpToolOrchestration = createAgentRuntimeMcpToolOrchestration({
      userDataPath: () => this.features.mcp?.userDataPath,
      env: () => this.features.mcp?.env,
      onDescriptorDrift: (event) => {
        this.revokeMcpPermissionGrantsForDescriptorDrift(event);
      },
    });
    this.remoteSurfaceRuntimeEvents = new AgentRuntimeRemoteSurfaceRuntimeEventStore({
      listRemoteSurfaceBindings: () => createMessagingBindingStore({
        stateRoot: this.store.getWorkspace().statePath,
        providers: createDefaultMessagingProviderRegistry(),
      }).list({ purpose: "remote_ambient_surface", includeInactive: true }).bindings,
    });
    this.modelContext = new AgentRuntimeModelContextController({
      store: this.store,
      getActiveSession: (threadId) => this.sessions.get(threadId),
      getBrowserState: () => this.browser.getState(),
      countSerializedPayload: (payload, fallbackTokens) => this.glmTokenizer.countSerializedPayload(payload, fallbackTokens),
      recordContextUsageSnapshot: (snapshot) => this.store.recordContextUsageSnapshot(snapshot),
      emitContextUsageUpdated: (snapshot) => this.emit({ type: "context-usage-updated", snapshot }),
      modelReasoningEvidencePath: () => process.env.AMBIENT_MODEL_REASONING_EVIDENCE_PATH,
    });
    this.providerRuntime = new AgentRuntimeProviderRuntimeController({
      store: this.store,
      features: this.features,
      localModelRuntimeManager: this.localModelRuntimeManager,
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      resolveLocalRuntimeOwnershipForForcedAction: (request) => this.resolveLocalRuntimeOwnershipForForcedAction(request),
      resolveLocalRuntimeOwnershipForStopPlan: (plan) => this.resolveLocalRuntimeOwnershipForStopPlan(plan),
      resolveLocalRuntimeOwnershipForRestartPlan: (plan) => this.resolveLocalRuntimeOwnershipForRestartPlan(plan),
    });
    this.messagingGateway = new AgentRuntimeMessagingGatewayController({
      store: this.store,
      remoteSurfaceRuntimeEvents: this.remoteSurfaceRuntimeEvents,
      activeRuns: this.activeRuns,
      pendingProjectSwitchByThreadId: this.pendingProjectSwitchByThreadId,
      completePendingProjectSwitch: (projectSwitch, input) => this.completePendingRemoteProjectSwitch(projectSwitch, input),
      readVoiceSettings: () => this.features.voice?.readSettings(),
      readSttSettings: () => this.features.stt?.readSettings(),
      readSearchSettings: () => this.features.search?.readSettings(),
      readMediaSettings: () => this.features.media?.readSettings(),
      readPlannerSettings: () => this.features.planner?.readSettings?.(),
      listPermissionRequests: () => this.permissions.listPending?.() ?? [],
      workflowRecoveryEvents: () => this.workflowRecoveryEventsForRemoteSurface(),
      ...(this.features.projects?.listProjects ? { listProjects: () => this.features.projects!.listProjects!() } : {}),
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      secureInputs: this.features.secureInputs,
      createProject: this.features.projects?.createProject,
      switchProjectAvailable: () => Boolean(this.features.projects?.switchProject),
      workflowAgents: this.features.workflowAgents,
      emit: (event) => this.emit(event),
      voice: this.features.voice,
      stt: this.features.stt,
      listSttProviders: (workspacePath) => this.providerRuntime.listSttProvidersForTools(workspacePath),
      media: this.features.media,
      planner: this.features.planner,
      search: this.features.search,
      ...(this.permissions.respond ? {
        respondToPermissionPrompt: (requestId, response) => this.permissions.respond?.(requestId, response),
      } : {}),
    });
    this.webResearch = new AgentRuntimeWebResearchController({
      store: this.store,
      createMcpRuntime: this.mcpToolOrchestration.createMcpRuntime,
      readSearchSettings: () => this.features.search?.readSettings(),
      mcpEnv: () => this.features.mcp?.env,
      prepareBrowserToolProfile: (input, sourceThreadId, onUpdate) =>
        this.prepareBrowserToolProfile(input, sourceThreadId, onUpdate),
      browserSearch: (input) => this.browser.search(input),
      browserContent: (input) => this.browser.content(input),
      emitBrowserState: () => this.emitBrowserState(),
      recordBrowserAudit: (threadId, toolName, risk, detail) =>
        this.recordBrowserAudit(threadId, toolName, risk, detail),
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
    });
    this.toolRunner = new AgentRuntimeToolRunnerController({
      store: this.store,
      asyncBashJobs: () => this.asyncBashJobs,
      getRunId: (threadId) => this.activeRunIds.get(threadId),
      scheduleThreadWake: async (input) => {
        const wake = this.threadWakeContinuations.schedule({
          threadId: input.threadId,
          dueAt: input.dueAt,
          reason: input.reason,
          jobId: input.jobId,
          payload: input.payload,
        });
        return {
          wakeId: wake.id,
          threadId: wake.threadId,
          dueAt: wake.dueAt,
          reason: wake.reason,
          jobId: wake.jobId,
        };
      },
      fileAuthorityRootPathsForThread: (threadId, access) => this.fileAuthorityRootPathsForThread(threadId, access),
      includeWorkspaceRootAuthorityForThread: (threadId) => this.includeWorkspaceRootAuthorityForThread(threadId),
      requestFileAuthorityForThread: (threadId, workspace, request) =>
        this.requestFileAuthorityForThread(threadId, workspace, request),
      emit: (event) => this.emit(event),
    });
    this.browserTools = new AgentRuntimeBrowserToolController({
      store: this.store,
      browser: this.browser,
      browserCredentials: this.browserCredentials,
      localPreviewServers: this.localPreviewServers,
      enableBrowserLoginBroker: () => this.features.browserLoginBroker !== false,
      getRunId: (threadId) => this.activeRunIds.get(threadId),
      tryRouteBrowserContentThroughScrapling: (input) => this.tryRouteBrowserContentThroughScrapling(input),
      emit: (event) => this.emit(event),
    });
    this.extensionAssembly = new AgentRuntimeExtensionAssemblyController({
      store: this.store,
      activeRuns: this.activeRuns,
      finalizeCompletedThreadGoal: (goal) => this.goalContinuations.finalizeCompletedThreadGoal(goal),
      emitGoalUpdated: (event) => this.emit(event),
      browser: this.browser,
      openLocalPreview: (input) => this.localPreviewServers.open(input),
      workflowPlanEditIntentByThreadId: this.workflowPlanEditIntentByThreadId,
      downloadService: this.downloadService,
      readSearchSettings: () => this.features.search?.readSettings(),
      updateSearchSettings: this.features.search?.updateSettings
        ? (input) => this.features.search!.updateSettings!(input)
        : undefined,
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      privilegedActionAdapter: this.features.privilegedActionAdapter,
      requestPrivilegedCredential: this.features.privilegedCredentials?.request,
      runCapabilityBuilderValidationWithPermission: (input) =>
        this.runCapabilityBuilderValidationWithPermission(input),
      createModelContextExtensionFactories: (input) => this.modelContext.createModelContextExtensionFactories(input),
      createInterruptedToolCallRecoveryToolExtension: (threadId, workspace) =>
        this.createInterruptedToolCallRecoveryToolExtension(threadId, workspace),
      createToolRunnerExtension: (threadId, workspace, options) =>
        this.createToolRunnerExtension(threadId, workspace, options),
      createVoiceSettingsToolExtension: (threadId, workspace) =>
        this.providerRuntime.createVoiceSettingsToolExtension(threadId, workspace),
      createSttSettingsToolExtension: (threadId, workspace) =>
        this.providerRuntime.createSttSettingsToolExtension(threadId, workspace),
      getThreadForVision: (id) => this.store.getThread(id),
      getLatestBrowserScreenshotArtifact: (threadId) => this.browserTools.getLatestBrowserScreenshotArtifact(threadId),
      vision: this.features.vision,
      createLocalDeepResearchToolExtension: (threadId, workspace) =>
        this.createLocalDeepResearchToolExtension(threadId, workspace),
      createLocalRuntimeToolExtension: (workspace) => this.providerRuntime.createLocalRuntimeToolExtension(workspace),
      createMessagingGatewayToolExtension: (threadId, workspace) =>
        this.createMessagingGatewayToolExtension(threadId, workspace),
      createWebResearchToolExtension: (threadId, workspace) => this.createWebResearchToolExtension(threadId, workspace),
      createLambdaRlmToolExtension: (threadId, workspace, model, apiKey) =>
        this.createLambdaRlmToolExtension(threadId, workspace, model, apiKey),
      createBrowserToolExtension: (threadId, workspace) => this.createBrowserToolExtension(threadId, workspace),
      createPluginInstallToolExtension: (threadId, workspace, model, apiKey) =>
        this.createPluginInstallToolExtension(threadId, workspace, model, apiKey),
      createGoogleWorkspaceSetupToolExtension: (workspace) => this.createGoogleWorkspaceSetupToolExtension(workspace),
      createWorkflowNativeToolExtension: (threadId, workspace) =>
        this.createWorkflowNativeToolExtension(threadId, workspace),
      createPluginMcpToolExtension: (threadId, workspace, registrations) =>
        this.createPluginMcpToolExtension(threadId, workspace, registrations),
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
      createSubagentToolExtension: (threadId, pluginMcpTools) =>
        this.createSubagentToolExtension(threadId, pluginMcpTools),
      createPermissionGateExtension: (threadId, workspace) => this.createPermissionGateExtension(threadId, workspace),
    });
    this.sessionFactory = new AgentRuntimeSessionFactoryController({
      store: this.store,
      sessions: this.sessions,
      pluginHost: this.pluginHost,
      extensionAssembly: this.extensionAssembly,
      mcpToolOrchestration: this.mcpToolOrchestration,
      providerRuntime: this.providerRuntime,
      features: this.features,
      ambientCliSkillMountDiagnostics: this.ambientCliSkillMountDiagnostics,
      tencentMemoryRuntimeSnapshots: this.tencentMemoryRuntimeSnapshots,
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      commitThreadPiSessionFile: (input) => this.commitThreadPiSessionFile(input),
      recordContextUsageSnapshot: (threadId, session, message) =>
        this.recordContextUsageSnapshot(threadId, session, message),
      recordUnavailableContextUsageSnapshot: (thread, message) =>
        this.store.recordContextUsageSnapshot(this.unavailableContextUsageSnapshot(thread, message)),
      resolveToolCallPermission: (threadId, workspace, toolName, toolInput) =>
        this.resolveToolCallPermission(threadId, workspace, toolName, toolInput),
      emit: (event) => this.emit(event),
    });
    this.asyncBashJobs = new AgentRuntimeAsyncBashJobService({
      onSnapshot: (snapshot) => this.toolRunner.upsertAsyncBashToolMessage(snapshot),
    });
    this.goalContinuations = new AgentRuntimeGoalContinuationController({
      store: this.store,
      hasActiveRun: (threadId) => this.activeRuns.has(threadId),
      send: (input) => this.send(input as RuntimeSendMessageInput),
      emit: (event) => this.emit(event),
    });
    this.threadWakeContinuations = new AgentRuntimeThreadWakeContinuationController({
      store: this.store,
      hasActiveRun: (threadId) => this.activeRuns.has(threadId),
      send: (input) => this.send(input as RuntimeSendMessageInput),
      emit: (event) => this.emit(event),
      asyncBashSnapshotText: (threadId, jobId) => {
        try {
          return formatAsyncBashSnapshotForTool(this.asyncBashJobs.snapshotForThread(threadId, jobId, {
            maxBytes: 12_000,
          }));
        } catch {
          return undefined;
        }
      },
    });
    this.subagentStopCascade = new AgentRuntimeSubagentStopCascadeController({
      store: this.store,
      activeRuns: this.activeRuns,
      currentFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      abortChildThread: (threadId) => this.abort(threadId),
      latestSubagentRunEventSequence: (runId) => this.latestSubagentRunEventSequence(runId),
      emit: (event) => this.emit(event),
      emitSubagentRunAndChildThreadUpdated: (run) => this.emitSubagentRunAndChildThreadUpdated(run),
      emitSubagentRunEventsSince: (run, sequence) => this.emitSubagentRunEventsSince(run, sequence),
      emitSubagentWaitBarrierUpdated: (barrier) => this.emitSubagentWaitBarrierUpdated(barrier),
      emitSubagentParentMailboxEventUpdated: (event) => this.emitSubagentParentMailboxEventUpdated(event),
    });
    this.finalizationCoordinator = new AgentRuntimeFinalizationCoordinator({
      store: this.store,
      emit: (event) => this.emit(event),
      resolveTerminalChildWaitBarriers: (run, reason) => this.subagentStopCascade.resolveTerminalChildWaitBarriers(run, reason),
    });
    this.subagentChildTurns = new AgentRuntimeSubagentChildTurnCoordinator({
      store: this.store,
      resolveTerminalChildWaitBarriers: (run, reason) => this.subagentStopCascade.resolveTerminalChildWaitBarriers(run, reason),
    });
    this.subagentChildLifecycle = new AgentRuntimeSubagentChildLifecycleCoordinator({
      store: this.store,
      executions: this.subagentChildExecutions,
      permissions: this.permissions,
      send: (input, hooks) => this.send(input, hooks),
      abortChildThread: (threadId, options) => this.abort(threadId, options),
      emit: (event) => this.emit(event),
      emitSubagentParentMailboxEventUpdated: (event) => this.emitSubagentParentMailboxEventUpdated(event),
      resolveTerminalChildWaitBarriers: (run, reason) => this.subagentStopCascade.resolveTerminalChildWaitBarriers(run, reason),
      completeTurnAfterSend: (input) => this.completeSubagentChildTurnAfterSend(input),
      recordFollowupExhausted: (input) => this.recordSubagentChildFollowupExhausted(input),
      recordGroupedCompletionIfNeeded: (run, summary) => this.recordSubagentGroupedCompletionIfNeeded(run, summary),
    });
    this.subagentChildRuntimeRouter = new AgentRuntimeSubagentChildRuntimeRouter({
      store: this.store,
      runtimeFeature: this.features.localTextSubagents,
      defaultRuntime: this.subagentChildLifecycle,
      createEventingStore: () => this.createSubagentEventingStore(),
      fallbackRuntimeManager: this.localModelRuntimeManager,
      readLocalModelResourceSettings: () => this.features.localDeepResearch?.readSettings?.().localModelResources,
      localModelHostMemory: this.features.localModelHostMemory,
      subagentsDisabledRuntimeSnapshot: () => this.currentSubagentsDisabledRuntimeSnapshot(),
    });
    this.subagentCapacity = new AgentRuntimeSubagentCapacityController({
      store: this.store,
      runtimeManager: this.localModelRuntimeManager,
      readLocalModelResourceSettings: () => this.features.localDeepResearch?.readSettings?.().localModelResources,
      localModelHostMemory: this.features.localModelHostMemory,
    });
    this.workflowRecordingReviewSessions = new AgentRuntimeWorkflowRecordingReviewSessionController({
      store: this.store,
      emit: (event) => this.emit(event),
      createProviderCallContextPreflightExtension: (threadId, workspacePath, model) =>
        this.modelContext.createProviderCallContextPreflightExtension(threadId, workspacePath, model),
      createModelReasoningPayloadExtension: (threadId, model) =>
        this.modelContext.createModelReasoningPayloadExtension(threadId, model),
      createContextAccountingExtension: (threadId, model) =>
        this.modelContext.createContextAccountingExtension(threadId, model),
      recordContextUsageSnapshot: (threadId, session, message) =>
        this.recordContextUsageSnapshot(threadId, session, message),
    });
    this.callableWorkflowSymphonyBridge = new AgentRuntimeCallableWorkflowSymphonyBridgeController({
      store: this.store,
      createSubagentEventingStore: () => this.createSubagentEventingStore(),
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      resolveSymphonyLaunchContract: this.features.symphonyLaunchContracts?.resolve,
      resolveModelRuntimeProfile: (modelId) => this.resolveSubagentModelRuntimeProfile(modelId),
      resolveCapacityLease: (input) => this.resolveSubagentCapacityLease(input),
      prepareChildWorktree: (input) => this.prepareSubagentChildWorktree(input.run),
      runtime: {
        startChildRun: (input) => this.startResolvedSubagentChildRun(input),
        waitForChildRun: (input) => this.waitForResolvedSubagentChildRun(input),
        cancelChildRun: (input) => this.cancelResolvedSubagentChildRun(input),
        followupChildRun: (input) => this.followupResolvedSubagentChildRun(input),
        retryChildRun: (input) => this.retryResolvedSubagentChildRun(input),
        resolveChildApprovalResponse: (input) => this.resolveResolvedSubagentChildApprovalResponse(input),
      },
      createRuntimeCancelEventEmitter: (targetRun) => this.createDesktopSubagentCancelEventEmitter(targetRun),
      createRuntimeRetryEventEmitter: (targetRun) => this.createDesktopSubagentRetryEventEmitter(targetRun),
      emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
      emitSubagentWaitBarrierUpdated: (barrier) => this.emitSubagentWaitBarrierUpdated(barrier),
    });
    this.localRuntimeOwnership = new AgentRuntimeLocalRuntimeOwnershipController({
      store: this.store,
      createSubagentEventingStore: () => this.createSubagentEventingStore(),
      cancelChildRun: (cancelInput) => this.cancelResolvedSubagentChildRun(cancelInput),
      createRuntimeCancelEventEmitter: (targetRun) => this.createDesktopSubagentCancelEventEmitter(targetRun),
      emitSubagentRunAndChildThreadUpdated: (run) => this.emitSubagentRunAndChildThreadUpdated(run),
    });
    this.contextRecovery = new AgentRuntimeContextRecoveryController({
      store: this.store,
      hasActiveRun: (threadId) => this.activeRuns.has(threadId),
      getActiveSession: (threadId) => this.sessions.get(threadId) as AgentRuntimeContextRecoverySession | undefined,
      deleteActiveSession: (threadId) => this.sessions.delete(threadId),
      getSession: async (thread) => this.getSession(thread) as Promise<AgentRuntimeContextRecoverySession>,
      commitThreadPiSessionFile: (input) => this.commitThreadPiSessionFile(input),
      ambientCliSkillMountForThread: (threadId) => this.ambientCliSkillMountDiagnostics.get(threadId),
      emit: (event) => this.emit(event),
    });
    this.plannerFinalization = new AgentRuntimePlannerFinalizationController({
      store: this.store,
      durableBrowserValidator: this.features.planner?.durableBrowserValidator,
      refreshBrowsersForArtifactChange: (threadId, workspacePath, artifactPath) =>
        this.refreshBrowsersForArtifactChange(threadId, workspacePath, artifactPath),
      send: (followUp) => this.send(followUp),
      emit: (event) => this.emit(event),
    });
    this.sendPreparation = new AgentRuntimeSendPreparationController({
      store: this.store,
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      readSearchSettings: () => this.features.search?.readSettings(),
      plannerFinalizationSourceArtifactsForPrompt: (threadId, prompt) =>
        this.plannerFinalization.plannerFinalizationSourceArtifactsForPrompt(threadId, prompt),
      deletePendingProjectSwitch: (threadId) => {
        this.pendingProjectSwitchByThreadId.delete(threadId);
      },
      setWorkflowPlanEditIntent: (threadId, intent, workflowThreadId) => {
        this.workflowPlanEditIntentByThreadId.set(threadId, intent);
        this.workflowPlanEditWorkflowThreadByThreadId.set(threadId, workflowThreadId);
      },
      generateTitleIfNeeded: (thread, prompt) => this.generateTitleIfNeeded(thread, prompt),
      emit: (event) => this.emit(event),
      workflowRecordingReviewStreamIdleTimeoutMs: WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS,
      chatPiEmptyAssistantStallTimeoutMs: CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS,
      defaultInterruptedToolCallRecoveryMaxRetries: DEFAULT_INTERRUPTED_TOOL_CALL_RECOVERY_MAX_RETRIES,
      localToolIdleTimeoutMs,
    });
    this.activeRunHandoff = new AgentRuntimeActiveRunHandoffController({
      store: this.store,
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      applyThreadModelSettings: (threadId) => this.applyThreadModelSettings(threadId),
      modelContentForSendInput: (activeRunInput) => this.sendPreparation.modelContentForSendInput(activeRunInput),
      emit: (event) => this.emit(event),
    });
    this.promptOutcomes = new AgentRuntimePromptOutcomeController({
      getThread: (threadId) => this.store.getThread(threadId),
      updateThreadSettings: (threadId, settings) => this.store.updateThreadSettings(threadId, settings),
      replaceMessage: (messageId, content, metadata) => this.store.replaceMessage(messageId, content, metadata),
      commitThreadPiSessionFile: (input) => this.commitThreadPiSessionFile(input),
      recordContextUsageSnapshot: (threadId, session) => this.recordContextUsageSnapshot(threadId, session as PiSession),
      createPlannerPlanArtifactFromMessage: (message) =>
        this.plannerFinalization.createPlannerPlanArtifactFromMessage(message),
      resolveSubagentFinalizationBlock: (threadId, runId) => this.subagentFinalizationBarrierBlock(threadId, runId),
      resolveCallableWorkflowFinalizationBlock: (threadId, runId, verifiedLaunch) =>
        this.callableWorkflowFinalizationBlock(threadId, runId, verifiedLaunch),
      recordSubagentFinalizationBlockedParentMailbox: (threadId, runId, block) =>
        this.recordSubagentFinalizationBlockedParentMailbox(threadId, runId, block),
      recordCallableWorkflowFinalizationBlockedParentMailbox: (threadId, runId, block) =>
        this.recordCallableWorkflowFinalizationBlockedParentMailbox(threadId, runId, block),
      suppressCallableWorkflowParentAssistantMessages: (block, options) =>
        this.suppressCallableWorkflowParentAssistantMessages(block, options),
      recordVoiceDispatch: (message) => this.providerRuntime.recordVoiceDispatch(message),
      clearActiveRun: (threadId) => {
        this.activeRuns.delete(threadId);
      },
      clearActiveRunId: (threadId) => {
        this.activeRunIds.delete(threadId);
      },
      clearPermissionWaitControl: (threadId) => {
        this.permissionWaitControls.delete(threadId);
      },
      clearWorkflowPlanEditIntent: (threadId) => {
        this.workflowPlanEditIntentByThreadId.delete(threadId);
        this.workflowPlanEditWorkflowThreadByThreadId.delete(threadId);
      },
      takePendingProjectSwitch: (threadId) => {
        const pendingProjectSwitch = this.pendingProjectSwitchByThreadId.get(threadId);
        this.pendingProjectSwitchByThreadId.delete(threadId);
        return pendingProjectSwitch;
      },
      updateRuntimeEvent: (eventId, patch) => this.remoteSurfaceRuntimeEvents.update(eventId, patch),
      scheduleProjectSwitchCompletion: (projectSwitch, switchInput) => {
        setTimeout(() => {
          void this.completePendingRemoteProjectSwitch(projectSwitch as MessagingRemoteSurfaceCommandPendingProjectSwitch, switchInput);
        }, 0);
      },
      getRunRecord: (runId) => {
        try {
          return this.store.getRunRecord(runId);
        } catch {
          return undefined;
        }
      },
      accountFinishedGoalRun: (input) => this.goalContinuations.accountFinishedGoalRun(input),
      scheduleGoalContinuation: (threadId, goalId, delayMs) =>
        this.goalContinuations.scheduleGoalContinuation(threadId, goalId, delayMs),
      schedulePlannerDurableRepairFollowUp: (followUp, workspacePath) =>
        this.plannerFinalization.schedulePlannerDurableRepairFollowUp(followUp, workspacePath),
      send: (followUp, followUpHooks) => this.send(followUp, followUpHooks),
      emitError: (message, threadId, workspacePath) => this.emit({ type: "error", message, threadId, workspacePath }),
    });
    this.promptExecutions = new AgentRuntimePromptExecutionController<PiSession>({
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
      removeActiveSessionIfCurrent: (threadId, executionSession) => {
        if (this.sessions.get(threadId) === executionSession) this.sessions.delete(threadId);
      },
      recordContextUsageSnapshot: (threadId, executionSession, snapshotMessage) =>
        this.recordContextUsageSnapshot(threadId, executionSession, snapshotMessage),
      refreshBrowsersForArtifactChange: (threadId, workspacePath, artifactPath) =>
        this.refreshBrowsersForArtifactChange(threadId, workspacePath, artifactPath),
    });
    this.fileAuthority = new AgentRuntimeFileAuthorityController({
      store: this.store,
      transientRoots: this.transientFileAuthorityRoots,
      requestPermission: (request, options) => this.permissions.request(request, options),
      beginPermissionWait: (threadId, wait) => this.permissionWaitControls.get(threadId)?.begin(wait),
      activeRunId: (threadId) => this.activeRunIds.get(threadId),
      emit: (event) => this.emit(event),
    });
    this.pluginPermissions = new AgentRuntimePluginPermissionController({
      store: this.store,
      requestPermission: (request, options) => this.permissions.request(request, options),
      beginPermissionWait: (threadId, wait) => this.permissionWaitControls.get(threadId)?.begin(wait),
      activeRunId: (threadId) => this.activeRunIds.get(threadId),
      emit: (event) => this.emit(event),
    });
    this.glmTokenizer = new GlmTokenizerService(() => this.store.getWorkspace().statePath);
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
    const sendLoopInput = this.sendInputWithSymphonyParentModeToolCapableModel(
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
    let {
      promptContent,
      retrySourceUserMessageId,
    } = sendLoop;
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

    if (shouldInjectBootstrap) {
      const variant = resolveAgentHarnessVariant();
      if (variant.warning) console.warn(`[harness] ${variant.warning}`);
      if (variant.enabled) {
        const bootstrap = await buildAgentBootstrapContext({
          workspacePath: thread.workspacePath,
          permissionMode: thread.permissionMode,
          collaborationMode: input.collaborationMode,
          variant,
        });
        promptContent = applyAgentBootstrapToPrompt(promptContent, bootstrap);
      }
    }

    const featureFlagSnapshotForPrompt = this.currentFeatureFlagSnapshot();
    const subagentPreflight = symphonyParentModePolicy
      ? { kind: "none" as const }
      : explicitSubagentRequestPreflight({
        prompt: visibleUserContent,
        thread,
        featureFlags: featureFlagSnapshotForPrompt,
        activeToolNames: ambientSubagentActiveToolNamesForThread(thread, featureFlagSnapshotForPrompt),
      });
    if (subagentPreflight.kind === "blocked") {
      finalizeRuntimeSubagentPreflightBlock({
        threadId: input.threadId,
        workspacePath: runWorkspacePath,
        message: subagentPreflight.message,
        reason: subagentPreflight.reason,
        addAssistantMessage: (messageInput) => this.store.addMessage(messageInput),
        startRun: (runInput) => this.store.startRun(runInput),
        setActiveRunId: (threadId, runId) => this.activeRunIds.set(threadId, runId),
        deleteActiveRunId: (threadId) => this.activeRunIds.delete(threadId),
        finishPlannerFinalizationSources,
        finishRun: (runId, status, errorMessage) => {
          this.store.finishRun(runId, status, errorMessage);
        },
        emitRunEvent,
        onActivity: hooks.onActivity,
      });
      return;
    }
    if (subagentPreflight.kind === "ready") {
      promptContent = applyExplicitSubagentRequestGuidance(promptContent, subagentPreflight.guidance);
    }

    const runtimeModel = runtimeInput.model ?? thread.model;
    const mainModelRuntimeProfile = this.resolveMainModelRuntimeProfile(runtimeModel);
    if (!symphonyParentModePolicy && this.canUseLocalTextMainRuntime(mainModelRuntimeProfile, usesDedicatedReviewSession)) {
      await this.sendLocalTextMainRun({
        input,
        thread,
        promptContent,
        model: mainModelRuntimeProfile,
        hooks,
      });
      return;
    }

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

    const cleanupCurrentSession = (options: { clearPersistedSessionFileIfCurrent?: boolean } = {}) => cleanupRuntimeSession({
      session,
      removeActiveSessionIfCurrent: (cleanupSession) => {
        if (this.sessions.get(input.threadId) !== cleanupSession) return false;
        this.sessions.delete(input.threadId);
        return true;
      },
      clearPersistedSessionFileIfCurrent: options.clearPersistedSessionFileIfCurrent
        ? {
            usesDedicatedReviewSession,
            currentThreadPiSessionFile: () => this.store.getThread(input.threadId).piSessionFile,
            clearThreadPiSessionFile: () => {
              emitRunEvent({
                type: "thread-updated",
                thread: this.store.updateThreadSettings(input.threadId, { piSessionFile: null }),
              });
            },
          }
        : undefined,
    });

    let symphonyParentModeVerifiedLaunch = runtimeInput.symphonyParentModeVerifiedLaunch;
    const resolveCurrentSymphonyParentModeVerifiedLaunch = () =>
      resolveSymphonyParentModeVerifiedLaunch({
        policy: symphonyParentModePolicy,
        carriedLaunch: symphonyParentModeVerifiedLaunch ?? runtimeInput.symphonyParentModeVerifiedLaunch,
        parentThreadId: input.threadId,
        parentRunId: run.id,
        tasks: this.store.listCallableWorkflowTasksForParentRun(run.id),
      });

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
      symphonyParentModeVerifiedLaunch = resolveCurrentSymphonyParentModeVerifiedLaunch();
      const currentSymphonyParentModeTasks = symphonyParentModePolicy
        ? this.store.listCallableWorkflowTasksForParentRun(run.id)
          .filter((task) => task.parentThreadId === input.threadId && task.parentRunId === run.id)
        : [];
      if (
        symphonyParentModePolicy &&
        !symphonyParentModeVerifiedLaunch &&
        (
          currentSymphonyParentModeTasks.length > 0 ||
          shouldRequireSymphonyParentModeLaunch({ policy: symphonyParentModePolicy })
        )
      ) {
        throw new Error(SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR);
      }
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
      symphonyParentModeVerifiedLaunch =
        resolveCurrentSymphonyParentModeVerifiedLaunch() ?? symphonyParentModeVerifiedLaunch;
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
    const parentRunId = this.activeRunIds.get(threadId);
    await this.activeRuns.get(threadId)?.abort();
    if (!options.skipSubagentChildCancellation) {
      this.subagentStopCascade.cancelSubagentRunForStoppedChildThread(threadId, "Sub-agent child thread stopped by user.");
    }
    if (parentRunId) {
      await this.subagentStopCascade.cascadeSubagentsForStoppedParentRun(threadId, parentRunId, "Parent run stopped by user.");
    }
    this.activeRuns.delete(threadId);
    this.activeRunIds.delete(threadId);
    const goal = this.store.getThreadGoal(threadId);
    if (goal?.status === "active") {
      const paused = this.store.markThreadGoalStatus(threadId, "paused", {
        expectedGoalId: goal.goalId,
        statusReason: "Paused because the user stopped the active run.",
      });
      this.emit({ type: "thread-goal-updated", goal: paused });
      this.emit({
        type: "runtime-activity",
        activity: goalRuntimeActivity({
          threadId,
          status: "paused",
          message: "Goal paused because the active run was stopped.",
          goalId: paused.goalId,
        }),
      });
    }
    this.emit({ type: "run-status", threadId, status: "idle" });
  }

  interruptActiveRuns(reason = RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE): number {
    const activeRuns = [...this.activeRuns.entries()];
    if (!activeRuns.length) return 0;
    try {
      this.store.interruptActiveRuns(reason);
    } catch (error) {
      console.warn(`Failed to mark active Ambient runs interrupted: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const [threadId, activeRun] of activeRuns) {
      activeRun.detach();
      this.activeRuns.delete(threadId);
      this.activeRunIds.delete(threadId);
      const goal = this.store.getThreadGoal(threadId);
      if (goal?.status === "active") {
        const paused = this.store.markThreadGoalStatus(threadId, "paused", {
          expectedGoalId: goal.goalId,
          statusReason: "Paused because the active run was interrupted.",
        });
        this.emit({ type: "thread-goal-updated", goal: paused });
      }
      this.emit({ type: "run-status", threadId, status: "idle" });
    }
    return activeRuns.length;
  }

  applyRuntimeSettings(settings: ModelRuntimeSettings): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    return this.sessions.resetForRuntimeSettings(this.activeRuns, {
      onDeferred: (threadId) => {
        this.emit({
          type: "runtime-activity",
          activity: runtimeSettingsActivity(threadId, settings.aggressiveRetries, "deferred"),
        });
      },
      onDisposed: (threadId) => {
        this.ambientCliSkillMountDiagnostics.delete(threadId);
        this.tencentMemoryRuntimeSnapshots.delete(threadId);
        this.emit({
          type: "runtime-activity",
          activity: runtimeSettingsActivity(threadId, settings.aggressiveRetries, "applied"),
        });
      },
    });
  }

  applyFeatureFlags(_snapshot: AmbientFeatureFlagSnapshot): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    return this.sessions.resetForRuntimeSettings(this.activeRuns, {
      onDisposed: (threadId) => {
        this.ambientCliSkillMountDiagnostics.delete(threadId);
        this.tencentMemoryRuntimeSnapshots.delete(threadId);
      },
    });
  }

  applyMemorySettings(): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    return this.sessions.resetForRuntimeSettings(this.activeRuns, {
      onDisposed: (threadId) => {
        this.ambientCliSkillMountDiagnostics.delete(threadId);
        this.tencentMemoryRuntimeSnapshots.delete(threadId);
      },
    });
  }

  async applyThreadModelSettings(threadId: string): Promise<{
    switchedSessions: number;
    deferredSessions: number;
    switchedThreadIds: string[];
    deferredThreadIds: string[];
  }> {
    const thread = this.store.getThread(threadId);
    const session = this.sessions.get(threadId);
    const result = {
      switchedSessions: 0,
      deferredSessions: 0,
      switchedThreadIds: [] as string[],
      deferredThreadIds: [] as string[],
    };
    if (!session) {
      this.sessions.clearRuntimeSettingsStale(threadId);
      return result;
    }

    if (normalizeAmbientModelId(session.model?.id) === normalizeAmbientModelId(thread.model)) {
      session.setThinkingLevel(thread.thinkingLevel);
      this.sessions.clearRuntimeSettingsStale(threadId);
      return result;
    }

    if (this.activeRuns.has(threadId)) {
      this.sessions.markRuntimeSettingsStale(threadId);
      result.deferredSessions = 1;
      result.deferredThreadIds.push(threadId);
      return result;
    }

    await this.switchSessionToThreadModel(thread, session);
    result.switchedSessions = 1;
    result.switchedThreadIds.push(threadId);
    return result;
  }

  applyThreadMemorySettings(threadId: string): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    return this.sessions.resetForRuntimeSettings(this.activeRuns, {
      onDisposed: () => {
        this.ambientCliSkillMountDiagnostics.delete(threadId);
        this.tencentMemoryRuntimeSnapshots.delete(threadId);
      },
    }, [threadId]);
  }

  listAgentMemoryRuntimeSnapshots(): AgentMemoryRuntimeSnapshot[] {
    return [...this.tencentMemoryRuntimeSnapshots.values()];
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
    this.sessions.disposeAll();
    this.activeRuns.clear();
    this.activeRunIds.clear();
    this.ambientCliPackageDescriptionState.clear();
    this.ambientWorkflowDescriptionState.clear();
    void this.shutdownPluginMcpServers().catch((error) => {
      console.warn(`Ambient runtime plugin MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  async shutdownPluginMcpServers(): Promise<void> {
    await this.pluginHost.shutdownPluginMcpServers();
  }

  pluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
    return this.pluginHost.pluginMcpRuntimeSnapshots();
  }

  restartPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.pluginHost.restartPluginMcpRuntime(key);
  }

  stopPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.pluginHost.stopPluginMcpRuntime(key);
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
    if (thread.title !== "New chat") return;
    const modelRuntimeSettings = this.store.getModelRuntimeSettings();
    void generateThreadTitle({
      prompt,
      workspaceName: this.store.getWorkspace().name,
      model: thread.model,
      retryPolicy: modelRuntimeSettings.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings }) : undefined,
    })
      .then((title) => {
        if (!title) {
          console.warn("Ambient thread title generation returned no title.");
          return;
        }
        const current = this.store.getThread(thread.id);
        if (current.title !== "New chat") return;
        const updated = this.store.updateThreadTitle(thread.id, title);
        this.emit({ type: "thread-updated", thread: updated });
      })
      .catch((error) => {
        console.warn(`Ambient thread title generation failed: ${error instanceof Error ? error.message : String(error)}`);
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
    return createAgentRuntimeSubagentEventingStore({
      store: this.store,
      emit: (event) => this.emit(event),
      emitSubagentRunAndChildThreadUpdated: (run) => this.emitSubagentRunAndChildThreadUpdated(run),
      emitSubagentRunEventCreated: (run, event) => this.emitSubagentRunEventCreated(run, event),
      emitSubagentToolScopeSnapshotRecorded: (run, snapshot) => this.emitSubagentToolScopeSnapshotRecorded(run, snapshot),
      emitSubagentWaitBarrierUpdated: (barrier) => this.emitSubagentWaitBarrierUpdated(barrier),
      emitSubagentMailboxEventUpdated: (run, event) => this.emitSubagentMailboxEventUpdated(run, event),
      emitSubagentParentMailboxEventUpdated: (event) => this.emitSubagentParentMailboxEventUpdated(event),
      emitSubagentRunEventsSince: (run, sequence) => this.emitSubagentRunEventsSince(run, sequence),
      latestSubagentRunEventSequence: (runId) => this.latestSubagentRunEventSequence(runId),
    });
  }

  private createDesktopSubagentCancelEventEmitter(run: SubagentRunSummary): SubagentRuntimeEventEmitter {
    return (eventInput) => {
      const { runEvent } = appendMappedSubagentRuntimeEvent(this.store, {
        run,
        source: "cancel_agent",
        event: eventInput,
      });
      this.emitSubagentRunEventCreated(this.store.getSubagentRun(run.id), runEvent);
      return runEvent;
    };
  }

  private createDesktopSubagentRetryEventEmitter(run: SubagentRunSummary): SubagentRuntimeEventEmitter {
    return (eventInput) => {
      const { runEvent } = appendMappedSubagentRuntimeEvent(this.store, {
        run,
        source: "retry_child",
        event: eventInput,
      });
      this.emitSubagentRunEventCreated(this.store.getSubagentRun(run.id), runEvent);
      return runEvent;
    };
  }

  private emitSubagentRunAndChildThreadUpdated(run: SubagentRunSummary): void {
    this.emit({ type: "subagent-run-updated", run });
    this.emit({ type: "thread-updated", thread: this.store.getThread(run.childThreadId) });
  }

  private emitSubagentRunEventCreated(run: SubagentRunSummary, event: SubagentRunEventSummary): void {
    this.emit({ type: "subagent-run-event-created", run, event });
  }

  private emitSubagentToolScopeSnapshotRecorded(run: SubagentRunSummary, snapshot: SubagentToolScopeSnapshotSummary): void {
    this.emit({ type: "subagent-tool-scope-snapshot-recorded", run, snapshot });
  }

  private emitSubagentWaitBarrierUpdated(barrier: SubagentWaitBarrierSummary): void {
    this.emit({ type: "subagent-wait-barrier-updated", barrier });
  }

  private emitSubagentMailboxEventUpdated(run: SubagentRunSummary, event: SubagentMailboxEventSummary): void {
    this.emit({ type: "subagent-mailbox-event-updated", run, mailboxEvent: event });
  }

  private emitSubagentParentMailboxEventUpdated(event: SubagentParentMailboxEventSummary): void {
    this.emit({ type: "subagent-parent-mailbox-event-updated", mailboxEvent: event });
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
    for (const event of this.store.listSubagentRunEvents(run.id)) {
      if (event.sequence > sequence) this.emitSubagentRunEventCreated(run, event);
    }
  }

  private latestSubagentRunEventSequence(runId: string): number {
    return this.store.listSubagentRunEvents(runId).at(-1)?.sequence ?? 0;
  }

  private resolveMainModelRuntimeProfile(modelId?: string): AmbientModelRuntimeProfile {
    return this.features.localTextSubagents?.resolveModelRuntimeProfile?.(modelId) ??
      DEFAULT_SUBAGENT_MODEL_RUNTIME_REGISTRY.resolveProfile(modelId);
  }

  private sendInputWithSymphonyParentModeToolCapableModel(
    input: SendMessageInput,
    thread: Pick<ThreadSummary, "model">,
    policy?: SymphonyParentModePolicy | undefined,
  ): SendMessageInput {
    if (!policy) return input;
    const requestedModel = input.model ?? thread.model;
    const profile = this.resolveMainModelRuntimeProfile(requestedModel);
    const toolCapable = profile.toolUse !== "none" && !isLocalTextSubagentProfile(profile);
    if (toolCapable || normalizeAmbientModelId(requestedModel) === normalizeAmbientModelId(AMBIENT_DEFAULT_MODEL)) {
      return input;
    }
    return {
      ...input,
      model: AMBIENT_DEFAULT_MODEL,
    };
  }

  private canUseLocalTextMainRuntime(
    profile: AmbientModelRuntimeProfile,
    usesDedicatedReviewSession: boolean,
  ): boolean {
    return !usesDedicatedReviewSession &&
      profile.available &&
      profile.selectableAsMain &&
      isLocalTextSubagentProfile(profile) &&
      Boolean(this.features.localTextSubagents?.resolveRuntimeForMain);
  }

  private async sendLocalTextMainRun(input: {
    input: SendMessageInput;
    thread: ThreadSummary;
    promptContent: string;
    model: AmbientModelRuntimeProfile;
    hooks: AgentRuntimeSendHooks;
  }): Promise<void> {
    return runAgentRuntimeLocalTextMainRun(input, {
      store: this.store,
      runtimeFeature: this.features.localTextSubagents,
      fallbackRuntimeManager: this.localModelRuntimeManager,
      readLocalDeepResearchSettings: this.features.localDeepResearch?.readSettings,
      localModelHostMemory: this.features.localModelHostMemory,
      setActiveRun: (threadId, run) => this.activeRuns.set(threadId, run),
      deleteActiveRun: (threadId) => this.activeRuns.delete(threadId),
      setActiveRunId: (threadId, runId) => this.activeRunIds.set(threadId, runId),
      deleteActiveRunId: (threadId) => this.activeRunIds.delete(threadId),
      emit: (event) => this.emit(event),
      formatRuntimeError: (message) => formatAgentRuntimeError(message),
    });
  }

  private createSubagentToolExtension(
    threadId: string,
    pluginMcpTools: readonly PluginMcpToolRegistration[] = [],
  ): ExtensionFactory {
    return createAgentRuntimeSubagentToolExtension({
      threadId,
      pluginMcpTools,
      store: this.createSubagentEventingStore(),
      activeRunIds: this.activeRunIds,
      activeRunStore: this.store,
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      resolveSymphonyLaunchContract: this.features.symphonyLaunchContracts?.resolve,
      resolveModelRuntimeProfile: (modelId) => this.resolveSubagentModelRuntimeProfile(modelId),
      resolveCapacityLease: (input) => this.resolveSubagentCapacityLease(input),
      prepareChildWorktree: (input) => this.prepareSubagentChildWorktree(input.run),
      runtime: {
        startChildRun: (input) => this.startResolvedSubagentChildRun(input),
        waitForChildRun: (input) => this.waitForResolvedSubagentChildRun(input),
        cancelChildRun: (input) => this.cancelResolvedSubagentChildRun(input),
        followupChildRun: (input) => this.followupResolvedSubagentChildRun(input),
        retryChildRun: (input) => this.retryResolvedSubagentChildRun(input),
        resolveChildApprovalResponse: (input) => this.resolveResolvedSubagentChildApprovalResponse(input),
      },
    });
  }

  async resolveSubagentWaitBarrier(input: ResolveSubagentWaitBarrierInput): Promise<SubagentWaitBarrierResolutionResult> {
    const barrier = this.store.getSubagentWaitBarrier(input.waitBarrierId);
    if (barrier.dependencyMode === "optional_background") {
      throw new Error(`Sub-agent wait barrier ${barrier.id} is optional background work and does not need a user resolution.`);
    }
    if (input.decision === "continue_with_partial") {
      if (!input.userDecision) throw new Error("userDecision is required when resolving a barrier with continue_with_partial.");
      if (!input.partialSummary) throw new Error("partialSummary is required when resolving a barrier with continue_with_partial.");
    }
    if ((input.decision === "detach_child" || input.decision === "cancel_parent") && !input.userDecision) {
      throw new Error(`userDecision is required when resolving a barrier with ${input.decision}.`);
    }
    const payloadFingerprint = createSubagentPayloadFingerprint({
      waitBarrierId: barrier.id,
      decision: input.decision,
      userDecision: input.userDecision,
      partialSummary: input.partialSummary,
    });
    const idempotencyKey = input.idempotencyKey ??
      createSubagentIdempotencyKey({
        operation: "barrier-decision",
        parentRunId: barrier.parentRunId,
        payloadFingerprint,
      });
    const result = await executeSubagentBarrierDecision({
      store: this.createSubagentEventingStore(),
      runtime: {
        cancelChildRun: (cancelInput) => this.cancelResolvedSubagentChildRun(cancelInput),
        retryChildRun: (retryInput) => this.retryResolvedSubagentChildRun(retryInput),
      },
      barrier,
      decision: input.decision,
      userDecision: input.userDecision,
      partialSummary: input.partialSummary,
      idempotencyKey,
      toolCallId: "desktop-parent-cluster-resolve-barrier",
      createRuntimeCancelEventEmitter: (targetRun) => this.createDesktopSubagentCancelEventEmitter(targetRun),
      createRuntimeRetryEventEmitter: (targetRun) => this.createDesktopSubagentRetryEventEmitter(targetRun),
    });
    return {
      schemaVersion: "ambient-subagent-wait-barrier-resolution-result-v1",
      replay: result.replay,
      waitBarrier: result.barrier,
      childRuns: result.childRuns,
      decision: result.decision,
      parentMailboxEvent: result.parentMailboxEvent,
    };
  }

  async cancelSubagentRun(input: CancelSubagentRunInput): Promise<SubagentRunSummary> {
    const run = this.store.getSubagentRun(input.childRunId);
    if (run.closedAt) throw new Error(`Cannot cancel closed sub-agent ${run.id}; close already released capacity.`);
    const result = await executeSubagentCancelAgent({
      store: this.createSubagentEventingStore(),
      runtime: {
        cancelChildRun: (cancelInput) => this.cancelResolvedSubagentChildRun(cancelInput),
      },
      run,
      reason: input.reason,
      toolCallId: "desktop-parent-cluster-cancel",
      createRuntimeCancelEventEmitter: (targetRun) => this.createDesktopSubagentCancelEventEmitter(targetRun),
    });
    this.emitSubagentRunAndChildThreadUpdated(result.run);
    return result.run;
  }

  closeSubagentRun(input: CloseSubagentRunInput): SubagentRunSummary {
    const run = this.store.getSubagentRun(input.childRunId);
    assertCanCloseSubagentRun(run);
    const result = executeSubagentCloseAgent({
      store: this.createSubagentEventingStore(),
      run,
      reason: input.reason,
      toolCallId: "desktop-parent-cluster-close",
    });
    this.emitSubagentRunAndChildThreadUpdated(result.run);
    return result.run;
  }

  private createCallableWorkflowToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    initialRecordedWorkflowPlaybooks: readonly WorkflowRecordingLibraryDescription[] = [],
    childCallableWorkflowToolNames: readonly string[] = [],
    symphonyParentModePolicy?: SymphonyParentModePolicy | undefined,
    symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
  ): ExtensionFactory {
    return createAgentRuntimeCallableWorkflowToolExtension({
      threadId,
      workspace,
      initialRecordedWorkflowPlaybooks,
      childCallableWorkflowToolNames,
      activeRunIds: this.activeRunIds,
      store: this.store,
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      beforeEnqueueCallableWorkflowTask: ({ executionPlan }) => {
        const validation = validateSymphonyParentModeCallableWorkflowPrelaunch({
          policy: symphonyParentModePolicy,
          launchVerified: Boolean(symphonyParentModeVerifiedLaunch),
          request: {
            parentThreadId: executionPlan.parent.threadId,
            parentRunId: executionPlan.parent.runId,
            toolName: executionPlan.workflowRunPlan.toolName,
            sourceKind: executionPlan.workflowRunPlan.source.kind,
          },
          existingTasks: this.store.listCallableWorkflowTasksForParentRun(executionPlan.parent.runId),
        });
        if (!validation.allowed) throw new Error(validation.reason);
      },
      startCallableWorkflowTaskForThread: (threadId, taskId, workspace) =>
        this.startCallableWorkflowTaskForThread(threadId, taskId, workspace),
      emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
    });
  }

  private startCallableWorkflowTaskForThread(
    threadId: string,
    taskId: string,
    workspace: WorkspaceState,
  ): void {
    startAgentRuntimeCallableWorkflowTaskForThread(threadId, taskId, workspace, {
      store: this.store,
      executeCallableWorkflowTaskForThread: (threadId, taskId, workspace) =>
        this.executeCallableWorkflowTaskForThread(threadId, taskId, workspace),
      emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
      emit: (event) => this.emit(event),
    });
  }

  async cancelCallableWorkflowTask(input: CancelCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary> {
    const current = this.store.getCallableWorkflowTask(input.taskId);
    const canceled = cancelAgentRuntimeCallableWorkflowTask(input, {
      store: this.store,
      taskAbortControllers: this.callableWorkflowTaskAbortControllers,
      runTaskIds: this.callableWorkflowRunTaskIds,
      emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
      emit: (event) => this.emit(event),
    });
    if (shouldCancelCallableWorkflowSymphonyLaunchChildren(current)) {
      try {
        await this.cancelCallableWorkflowSymphonyChildWait(current, input.reason);
      } catch (error) {
        console.warn("Callable workflow Symphony child cleanup failed after task cancellation.", {
          taskId: current.id,
          error,
        });
      }
    }
    return canceled;
  }

  private async cancelCallableWorkflowSymphonyChildWait(
    task: CallableWorkflowTaskSummary,
    reason?: string,
  ): Promise<void> {
    return this.callableWorkflowSymphonyBridge.cancelChildWait(task, reason);
  }

  pauseCallableWorkflowTask(input: PauseCallableWorkflowTaskInput): CallableWorkflowTaskSummary {
    return pauseAgentRuntimeCallableWorkflowTask(input, {
      store: this.store,
      taskAbortControllers: this.callableWorkflowTaskAbortControllers,
      runTaskIds: this.callableWorkflowRunTaskIds,
      emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
      emit: (event) => this.emit(event),
    });
  }

  async resumeCallableWorkflowTask(input: ResumeCallableWorkflowTaskInput): Promise<CallableWorkflowTaskSummary> {
    const current = this.store.getCallableWorkflowTask(input.taskId);
    if (isCallableWorkflowSymphonyChildWaitPreCompilePause(current)) {
      await this.executeCallableWorkflowTaskForThread(current.parentThreadId, current.id, this.store.getWorkspace());
      return this.store.getCallableWorkflowTask(current.id);
    }
    return resumeAgentRuntimeCallableWorkflowTask(input, {
      store: this.store,
      browser: this.browser,
      permissionRequester: this.permissions,
      pluginHost: this.pluginHost,
      connectorRegistrations: this.features.workflowNativeTools?.connectorRegistrations,
      connectorAccountAuthorizer: this.features.workflowNativeTools?.connectorAccountAuthorizer,
      ensurePluginMcpToolTrusted: (threadId, workspace, registration) =>
        this.ensurePluginMcpToolTrusted(threadId, workspace, registration),
      ...createAgentRuntimeCallableWorkflowRuntimeBridge({
        taskAbortControllers: this.callableWorkflowTaskAbortControllers,
        runTaskIds: this.callableWorkflowRunTaskIds,
        emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
        emit: (event) => this.emit(event),
      }),
    });
  }

  private async executeCallableWorkflowTaskForThread(
    threadId: string,
    taskId: string,
    workspace: WorkspaceState,
  ): Promise<void> {
    return executeAgentRuntimeCallableWorkflowTaskForThread(threadId, taskId, workspace, {
      store: this.store,
      browser: this.browser,
      permissionRequester: this.permissions,
      pluginHost: this.pluginHost,
      callableWorkflowStore: createAgentRuntimeCallableWorkflowRunnerStore(
        this.store,
        (task) => this.emitCallableWorkflowTaskUpdated(task),
      ),
      connectorDescriptors: this.features.workflowNativeTools?.connectorDescriptors,
      connectorRegistrations: this.features.workflowNativeTools?.connectorRegistrations,
      connectorAccountAuthorizer: this.features.workflowNativeTools?.connectorAccountAuthorizer,
      readSearchRoutingSettings: this.features.search?.readSettings,
      ensurePluginMcpToolTrusted: (threadId, workspace, registration) =>
        this.ensurePluginMcpToolTrusted(threadId, workspace, registration),
      launchWorkflowSubagents: (input) => this.launchCallableWorkflowSymphonySubagents(input),
      ...createAgentRuntimeCallableWorkflowRuntimeBridge({
        taskAbortControllers: this.callableWorkflowTaskAbortControllers,
        runTaskIds: this.callableWorkflowRunTaskIds,
        emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
        emit: (event) => this.emit(event),
      }),
    });
  }

  private async launchCallableWorkflowSymphonySubagents(input: CallableWorkflowRunnerLaunchInput): Promise<CallableWorkflowSubagentLaunchResult | void> {
    return this.callableWorkflowSymphonyBridge.launchSubagents(input);
  }

  private emitCallableWorkflowTaskUpdated(task: CallableWorkflowTaskSummary): void {
    this.emit({ type: "callable-workflow-task-updated", task });
  }

  private resolveSubagentModelRuntimeProfile(modelId?: string): AmbientModelRuntimeProfile {
    return this.features.localTextSubagents?.resolveModelRuntimeProfile?.(modelId) ??
      DEFAULT_SUBAGENT_MODEL_RUNTIME_REGISTRY.resolveProfile(modelId);
  }

  private async resolveSubagentCapacityLease(input: ResolveSubagentCapacityLeaseInput) {
    return this.subagentCapacity.resolveCapacityLease(input);
  }

  private startResolvedSubagentChildRun(
    input: SubagentChildRuntimeStartInput,
  ): Promise<SubagentChildRuntimeStartResult> | SubagentChildRuntimeStartResult {
    return this.subagentChildRuntimeRouter.startResolvedChildRun(input);
  }

  private async waitForResolvedSubagentChildRun(input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult> {
    return this.subagentChildRuntimeRouter.waitForResolvedChildRun(input);
  }

  private async cancelResolvedSubagentChildRun(input: SubagentChildRuntimeCancelInput): Promise<SubagentChildRuntimeCancelResult> {
    return this.subagentChildRuntimeRouter.cancelResolvedChildRun(input);
  }

  private async followupResolvedSubagentChildRun(input: SubagentChildRuntimeFollowupInput): Promise<SubagentChildRuntimeFollowupResult> {
    return this.subagentChildRuntimeRouter.followupResolvedChildRun(input);
  }

  private async retryResolvedSubagentChildRun(input: SubagentChildRuntimeRetryInput): Promise<SubagentChildRuntimeRetryResult> {
    return this.subagentChildRuntimeRouter.retryResolvedChildRun(input);
  }

  private async resolveResolvedSubagentChildApprovalResponse(
    input: SubagentChildRuntimeApprovalResponseInput,
  ): Promise<SubagentChildRuntimeApprovalResponseResult> {
    return this.subagentChildRuntimeRouter.resolveResolvedChildApprovalResponse(input);
  }

  private currentSubagentsDisabledRuntimeSnapshot(): AmbientFeatureFlagSnapshot | undefined {
    const snapshot = this.currentFeatureFlagSnapshot();
    return isAmbientSubagentsEnabled(snapshot) ? undefined : snapshot;
  }

  private async prepareSubagentChildWorktree(run: SubagentRunSummary): Promise<ThreadWorktreeSummary | undefined> {
    const childThread = this.store.getThread(run.childThreadId);
    const projectRoot = childThread.gitWorktree?.projectRoot ?? this.store.getThread(run.parentThreadId).gitWorktree?.projectRoot ?? this.store.getWorkspace().path;
    const worktree = await prepareThreadWorktree(projectRoot, childThread);
    if (!worktree) return undefined;
    this.store.setThreadWorktree(worktree);
    if (worktree.status === "active") {
      this.store.updateThreadWorkspacePath(childThread.id, worktree.worktreePath);
    }
    this.emit({ type: "thread-updated", thread: this.store.getThread(childThread.id) });
    return this.store.getThread(childThread.id).gitWorktree ?? worktree;
  }

  private recordSubagentChildFollowupExhausted(input: {
    run: SubagentRunSummary;
    completion: Extract<SubagentChildTurnCompletion, { status: "needs_followup" }>;
  }): void {
    this.subagentChildTurns.recordFollowupExhausted(input);
  }

  private completeSubagentChildTurnAfterSend(input: {
    run: SubagentRunSummary;
    role: SubagentRunSummary["roleProfileSnapshot"];
    childMessageCountBeforeSend: number;
    emitEvent: SubagentRuntimeEventEmitter;
  }): SubagentChildTurnCompletion {
    return this.subagentChildTurns.completeTurnAfterSend(input);
  }

  private recordSubagentGroupedCompletionIfNeeded(run: SubagentRunSummary, summary: string): void {
    this.subagentChildTurns.recordGroupedCompletionIfNeeded(run, summary);
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
    return createPermissionGateToolsExtension({
      threadId,
      workspace,
      resolveToolCallPermission: this.resolveToolCallPermission.bind(this),
    });
  }

  private async resolveToolCallPermission(
    threadId: string,
    workspace: WorkspaceState,
    toolName: string,
    rawToolInput: unknown,
  ): Promise<{ reason: string } | undefined> {
    return resolveAgentRuntimeToolCallPermission(threadId, workspace, toolName, rawToolInput, {
      store: this.store,
      installRouteGateBlockForTool: (threadId, toolName) => this.installRouteGuard.installRouteGateBlockForTool(threadId, toolName),
      mcpInstallShellBlockForTool: (input) => this.installRouteGuard.mcpInstallShellBlockForTool(input),
      permissionToolInput: (toolName, toolInput, workspace) =>
        resolvePermissionToolInput(toolName, toolInput, workspace, {
          readLocalDeepResearchReadiness: (workspace, input) => this.readLocalDeepResearchReadiness(workspace, input),
          googleWorkspace: this.features.googleWorkspace,
          browserCredentials: this.browserCredentials,
          readBrowserState: () => this.browser.getState(),
        }),
      requestPermission: (request, options) => this.permissions.request(request, options),
      beginPermissionWait: (threadId, input) => this.permissionWaitControls.get(threadId)?.begin(input),
      activeRunId: (threadId) => this.activeRunIds.get(threadId),
      recordTransientFileAuthorityForAllowedTool: (threadId, workspace, toolName, toolInput, reason) =>
        recordTransientFileAuthorityForAllowedTool({
          threadId,
          workspacePath: workspace.path,
          toolName,
          toolInput,
          reason,
        }, {
          roots: this.transientFileAuthorityRoots,
          fileToolAccess: permissionPolicyFileToolAccess,
          pathForTool: permissionPolicyPathForTool,
          resolvePolicyPath,
        }),
      recordTransientFileAuthorityFromPermissionRequest: (threadId, thread, request, reason) =>
        recordTransientFileAuthorityFromPermissionRequest({
          threadId,
          thread,
          projectPath: this.store.getWorkspace().path,
          request,
          reason,
        }, {
          roots: this.transientFileAuthorityRoots,
        }),
      emit: (event) => this.emit(event),
    });
  }

  private createToolRunnerExtension(
    threadId: string,
    workspace: WorkspaceState,
    options?: { interruptedToolCallRecoveryToolsAvailable?: boolean },
  ): ExtensionFactory {
    return this.toolRunner.createToolRunnerExtension(threadId, workspace, options);
  }

  private createInterruptedToolCallRecoveryToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createInterruptedToolCallRecoveryToolsExtension({
      workspacePath: workspace.path,
      readAuthorityRootPaths: () => this.fileAuthorityRootPathsForThread(threadId, "read"),
      writeAuthorityRootPaths: () => this.fileAuthorityRootPathsForThread(threadId, "write"),
      includeWorkspaceRootAuthority: () => this.includeWorkspaceRootAuthorityForThread(threadId),
      requestFileAuthority: (request) => this.requestFileAuthorityForThread(threadId, workspace, request),
    });
  }

  private readInterruptedToolCallRecoveryArtifact(threadId: string, params: unknown): AgentToolResult<Record<string, unknown>> {
    return readInterruptedToolCallRecoveryArtifactFromRoots(params, {
      authorityRootPaths: this.fileAuthorityRootPathsForThread(threadId, "read"),
    });
  }

  private fileAuthorityRootPathsForThread(threadId: string, access: "read" | "write"): string[] {
    return this.fileAuthority.rootPathsForThread(threadId, access);
  }

  private includeWorkspaceRootAuthorityForThread(threadId: string): boolean {
    return this.fileAuthority.includeWorkspaceRootAuthorityForThread(threadId);
  }

  private async requestFileAuthorityForThread(
    threadId: string,
    workspace: WorkspaceState,
    request: AmbientFileAuthorityRequest,
  ): Promise<boolean> {
    return this.fileAuthority.requestForThread(threadId, workspace, request);
  }

  private childApprovalModeForThread(
    thread: Pick<ThreadSummary, "kind" | "subagentRunId">,
  ): "interactive" | "non_interactive" | undefined {
    return this.fileAuthority.childApprovalModeForThread(thread);
  }

  private createLocalDeepResearchToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createAgentRuntimeLocalDeepResearchToolExtension({
      threadId,
      workspace,
      getThread: (id) => this.store.getThread(id),
      readSettings: () => this.features.localDeepResearch?.readSettings?.(),
      updateSettings: this.features.localDeepResearch?.updateSettings
        ? (input) => this.features.localDeepResearch!.updateSettings!(input)
        : undefined,
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      readReadiness: (workspace, input, signal) => this.readLocalDeepResearchReadiness(workspace, input, signal),
      emit: (event) => this.emit(event),
      install: this.features.localDeepResearch?.install,
      validate: this.features.localDeepResearch?.validate,
      smoke: this.features.localDeepResearch?.smoke,
      createBroker: (input) => this.localDeepResearchWebBroker(input),
      run: this.features.localDeepResearch?.run,
      approveResourceLimitExceed: (decision) => this.approveLocalModelResourceLimitExceed({ threadId, workspace, decision }),
    });
  }

  private async readLocalDeepResearchReadiness(
    workspace: WorkspaceState,
    input: LocalDeepResearchSetupInput,
    signal?: AbortSignal,
  ): Promise<{ contract: LocalDeepResearchSetupContract; managedAssets: Awaited<ReturnType<typeof detectLocalDeepResearchManagedAssets>> }> {
    const baseSettings = this.features.search?.readSettings() ?? {};
    const catalog = await discoverAmbientCliPackages(workspace.path, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
    const mcpTools = await this.discoverWebResearchMcpProviderTools(workspace, signal);
    const searchSettings = webResearchSettingsWithDynamicProviderCatalogs(baseSettings, { ambientCliCatalog: catalog, mcpTools });
    const residentProcesses = await Promise.resolve(
      this.features.localModelResidentProcesses
        ? this.features.localModelResidentProcesses(workspace.path)
        : detectLocalLlamaResidentProcesses(workspace.path),
    ).catch(() => []);
    const machineFacts = {
      ...input.machineFacts,
      activeLocalModelCount: residentProcesses.length,
      activeLocalModelEstimatedResidentMemoryBytes: residentProcesses.reduce((sum, resident) => sum + Math.max(0, resident.estimatedResidentMemoryBytes ?? 0), 0),
    };
    const localDeepResearchSettings = this.features.localDeepResearch?.readSettings?.();
    const preliminaryContract = buildLocalDeepResearchSetupContract({
      ...input,
      localDeepResearchSettings,
      machineFacts,
      searchSettings,
    });
    const managedAssets = await detectLocalDeepResearchManagedAssets(workspace.path, {
      selectedProfileId: preliminaryContract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    });
    const installJob = await reconcileLocalDeepResearchInstallJob(workspace.path).catch(() => undefined);
    const localRuntimeStatus = await this.providerRuntime.readLocalModelRuntimeLifecycleStatus(
      workspace.path,
      localDeepResearchRequestedLaunchFromContract(preliminaryContract),
      { residentProcesses },
    );
    const localModelResources = localRuntimeStatus.registry;
    const setupInput: LocalDeepResearchSetupInput = {
      ...input,
      localDeepResearchSettings,
      machineFacts,
      searchSettings,
      localModelResources,
      localRuntimeInventory: localRuntimeStatus.inventory,
      modelInstallState: managedAssets.model.status === "present" ? "installed" : "missing",
      runtimeInstalled: managedAssets.runtime.status === "present",
      ...(managedAssets.runtime.artifactId ? { runtimeArtifactId: managedAssets.runtime.artifactId } : {}),
      ...(managedAssets.runtime.status === "present" && managedAssets.runtime.binaryPath ? { runtimeBinaryPath: managedAssets.runtime.binaryPath } : {}),
      assetWarnings: [
        ...managedAssets.warnings,
        ...localDeepResearchInstallJobWarnings(installJob),
      ],
    };
    const contract = await (
      this.features.localDeepResearch?.buildSetupContract
        ? this.features.localDeepResearch.buildSetupContract(workspace.path, setupInput)
        : buildLocalDeepResearchSetupContract(setupInput)
    );
    return { contract, managedAssets };
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
    return this.webResearch.createLocalDeepResearchWebBroker(input);
  }

  private async approveLocalModelResourceLimitExceed(input: {
    threadId: string;
    workspace: WorkspaceState;
    decision: LocalModelResourcePolicyDecision;
  }): Promise<boolean> {
    const overBy = input.decision.exceededByBytes !== undefined
      ? `Exceeds ceiling by ${formatLocalDeepResearchBytes(input.decision.exceededByBytes)}.`
      : "Exceeds the configured ceiling.";
    const detail = [
      overBy,
      `Ceiling: ${input.decision.maxResidentMemoryBytes !== undefined ? formatLocalDeepResearchBytes(input.decision.maxResidentMemoryBytes) : "not configured"}.`,
      `Active estimate: ${formatLocalDeepResearchBytes(input.decision.activeEstimatedResidentMemoryBytes)}.`,
      `Requested estimate: ${input.decision.requestedEstimatedResidentMemoryBytes !== undefined ? formatLocalDeepResearchBytes(input.decision.requestedEstimatedResidentMemoryBytes) : "unknown"}.`,
      `Projected estimate: ${formatLocalDeepResearchBytes(input.decision.projectedEstimatedResidentMemoryBytes)}.`,
      input.decision.activeActualResidentMemoryBytes !== undefined
        ? `Actual sampled resident memory: ${formatLocalDeepResearchBytes(input.decision.activeActualResidentMemoryBytes)}.`
        : undefined,
    ].filter((line): line is string => Boolean(line)).join("\n");
    let finishPermissionWait: ((finish?: RuntimePermissionWaitFinish) => void) | undefined;
    try {
      const response = await this.permissions.request({
        threadId: input.threadId,
        workspacePath: input.workspace.path,
        projectPath: this.store.getWorkspace().path,
        toolName: "ambient_local_deep_research_run",
        title: "Exceed local model memory ceiling?",
        message: "A Local Deep Research llama.cpp launch would exceed the configured local-model resident-memory ceiling.",
        detail,
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantActionKind: "plugin_tool_execute",
        grantTargetKind: "risk",
        grantTargetLabel: "local-model-memory-ceiling",
        grantTargetHash: firstPartyPluginPermissionGrantHash("local-model-memory-ceiling"),
      }, {
        onRequest: (createdRequest) => {
          finishPermissionWait = this.permissionWaitControls.get(input.threadId)?.begin({
            toolName: "ambient_local_deep_research_run",
            requestId: createdRequest.id,
            title: createdRequest.title,
            detail: createdRequest.detail,
            risk: createdRequest.risk,
          });
        },
      });
      finishPermissionWait?.({ allowed: response.allowed, mode: response.mode });
      return response.allowed;
    } catch (error) {
      finishPermissionWait?.({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
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
    return createWorkflowNativeToolsExtension({
      threadId,
      workspace,
      store: this.store,
      browser: this.browser,
      getThread: () => this.store.getThread(threadId),
      getProjectPath: () => this.store.getWorkspace().path,
      getPlanEditIntentKind: () => this.workflowPlanEditIntentByThreadId.get(threadId),
      getDefaultWorkflowThreadId: () => this.workflowPlanEditWorkflowThreadByThreadId.get(threadId),
      readSearchRoutingSettings: () => this.features.search?.readSettings(),
      getProviderStatus: (model) => getAmbientProviderStatus(model),
      enabledCodexPlugins: (workspacePath) => this.pluginHost.enabledCodexPlugins(workspacePath, pluginStateReaderFromStore(this.store)),
      buildCodexPluginMcpToolRegistrations: (plugins, options) => this.pluginHost.buildCodexPluginMcpToolRegistrations(plugins, options),
      listPluginRegistry: (workspacePath) => this.pluginHost.listRegistry(workspacePath, pluginStateReaderFromStore(this.store)),
      resolvePermission: async (request, context) =>
        (
          await resolvePermissionWithGrants({
            store: this.store,
            requester: this.permissions,
            request,
            context,
          })
        ).allowed,
      ensurePluginMcpToolTrusted: (registration) => this.ensurePluginMcpToolTrusted(threadId, workspace, registration),
      callCodexPluginMcpTool: (plan, invocation, options) => this.pluginHost.callCodexPluginMcpTool(plan, invocation, options),
      connectorDescriptors: this.features.workflowNativeTools?.connectorDescriptors,
      connectorRegistrations: () => this.features.workflowNativeTools?.connectorRegistrations?.(),
      connectorAccountAuthorizer: () => this.features.workflowNativeTools?.connectorAccountAuthorizer?.(),
      emit: (event) => this.emit(event as any),
      runWorkflowArtifact,
    });
  }

  private createPluginMcpToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    registrations: PluginMcpToolRegistration[],
  ): ExtensionFactory {
    return createPluginMcpToolsExtension({
      workspace,
      registrations,
      getThread: () => this.store.getThread(threadId),
      ensurePluginMcpToolTrusted: (registration) => this.ensurePluginMcpToolTrusted(threadId, workspace, registration),
      callCodexPluginMcpTool: (plan, invocation, options) => this.pluginHost.callCodexPluginMcpTool(plan, invocation, options),
    });
  }

  private createLambdaRlmToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    model: Model<"openai-completions">,
    apiKey: string | undefined,
  ): ExtensionFactory {
    return createLambdaRlmToolsExtension({
      workspace,
      authorityRootPaths: () => this.fileAuthorityRootPathsForThread(threadId, "read"),
      includeWorkspaceRootAuthority: () => this.includeWorkspaceRootAuthorityForThread(threadId),
      requestFileAuthority: (request) => this.requestFileAuthorityForThread(threadId, workspace, request),
      model,
      apiKey,
    });
  }

  private createPluginInstallToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    model: Model<"openai-completions">,
    apiKey: string | undefined,
  ): ExtensionFactory {
    return createAgentRuntimePluginInstallToolExtension({
      threadId,
      workspace,
      model,
      apiKey,
      mcpAppVersion: this.features.mcp?.appVersion,
      getThread: (id) => this.store.getThread(id),
      createMcpRuntime: this.mcpToolOrchestration.createMcpRuntime,
      recordMcpAutowirePlan: () => this.installRouteGuard.recordMcpAutowirePlan(threadId),
      recordInstallRoutePlan: (plan) => this.installRouteGuard.recordInstallRoutePlan(threadId, plan),
      browserNavigate: (input) => this.browser.navigate(input),
      emitBrowserState: () => this.emitBrowserState(),
      recordSetupFinalReportBrowserAudit: (input) =>
        this.recordBrowserAudit(threadId, "ambient_setup_final_report", "browser-network", input.url),
      withBrowserToolHeartbeat,
      ...createAgentRuntimePluginInstallApplyCallbacks({
        pluginHost: this.pluginHost,
        store: this.store,
        markPluginToolsStale: () => this.markPluginToolsStale(threadId),
      }),
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      emitDesktopEvent: (event) => this.emit(event),
      latestInstallRouteLane: () => this.installRouteGuard.latestInstallRouteLane(threadId),
      mcpAutowirePlanned: () => this.installRouteGuard.mcpAutowirePlanned(threadId),
      runCapabilityBuilderValidationWithPermission: (input) => this.runCapabilityBuilderValidationWithPermission(input),
      completeRegisteredVoiceProviderSetup: (thread, workspace, provider) =>
        this.providerRuntime.completeRegisteredVoiceProviderSetup(thread, workspace, provider),
      emitAmbientCliSecretRequested: (event) => this.emit({ type: "ambient-cli-secret-requested", ...event }),
      isAmbientCliPackageDescribed: (packageId, packageName) =>
        this.ambientCliPackageDescriptionState.isDescribed(threadId, packageId, packageName),
      markAmbientCliPackageDescribed: (packageId, packageName) =>
        this.ambientCliPackageDescriptionState.markDescribed(threadId, packageId, packageName),
      ambientWorkflowStore: this.store,
      workflowRecordings: this.features.workflowRecordings,
      markAmbientWorkflowPlaybookDescribed: (id, version) =>
        this.ambientWorkflowDescriptionState.markDescribed(threadId, id, version),
      isAmbientWorkflowPlaybookDescribed: (id, version) =>
        this.ambientWorkflowDescriptionState.isDescribed(threadId, id, version),
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      getCallableWorkflowRecordedPlaybooks: () => callableWorkflowRecordedPlaybooks(this.store),
      revokePluginGrantsForLabels: (labels) => this.revokePluginGrantsForLabels(labels),
    });
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
    const detail = await capabilityBuilderValidationPreviewText(input.workspace.path, input.input);
    const preview = await previewCapabilityBuilderPackage(input.workspace.path, input.input);
    const allowed = await this.resolveFirstPartyPluginPermission({
      thread: input.thread,
      workspace: input.workspace,
      toolName: "ambient_capability_builder_validate",
      title: `Validate Ambient capability "${preview.packageName}"?`,
      message: input.reason === "privileged-action-succeeded"
        ? "Ambient wants to resume validation after a successful privileged action result."
        : "Ambient wants to run health checks and smoke tests for a managed draft capability package.",
      detail,
      grantTargetLabel: `Validate capability ${preview.packageName}`,
      grantTargetIdentity: ["ambient_capability_builder_validate", input.workspace.path, preview.packageName, String(input.input.includeSmokeTests !== false)].join("\0"),
      allowedReason: "Capability Builder validation approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder validation prompt denied or timed out.",
    });
    if (!allowed) throw new Error("Capability Builder validation blocked by approval prompt.");
    input.onUpdate?.({
      content: [{ type: "text", text: `Validating Ambient capability "${preview.packageName}".` }],
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_validate",
        status: "running",
        packageName: preview.packageName,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
    return validateCapabilityBuilderPackage(input.workspace.path, input.input);
  }

  private createGoogleWorkspaceSetupToolExtension(workspace: WorkspaceState): ExtensionFactory {
    return (pi) => {
      registerGoogleWorkspaceSetupTools(pi, {
        workspace,
        googleWorkspace: this.features.googleWorkspace,
      });
    };
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
