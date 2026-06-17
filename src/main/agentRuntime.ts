import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { BrowserWindow } from "electron";
import type { Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
  type AgentToolResult,
} from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MODEL_RUNTIME_PROVIDER_PRE_STREAM_TIMEOUT_MS,
  DEFAULT_MODEL_RUNTIME_PROVIDER_STREAM_IDLE_TIMEOUT_MS,
} from "../shared/modelRuntimeSettings";
import type { SubagentRuntimeEventSource } from "../shared/subagentProtocol";
import type {
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  RuntimeSurfaceSnapshot,
  RuntimeSurfaceWorkflowRecoveryEvent,
} from "../shared/messagingGateway";
import { classifyWorkflowPlanEditIntent, type WorkflowPlanEditIntentKind } from "../shared/workflowThreadPlanEdit";
import { applyAgentBootstrapToPrompt, buildAgentBootstrapContext } from "./agentBootstrapContext";
import { resolveAgentHarnessVariant } from "./agentHarnessVariant";
import { LocalPreviewServerManager } from "./localPreviewServer";
import { createPrivilegedActionAdapter, privilegedActionAdapterSelectionFromEnv, type PrivilegedActionAdapter } from "./privilegedActionAdapter";
import type { PiSessionFileCommitReason } from "./sessionFileCommit";
import { commitAgentRuntimeThreadPiSessionFile } from "./agentRuntimeSessionFileCommit";
import { enableAtomicPiSessionPersistence } from "./piSessionAtomicPersistence";
import type {
  DesktopEvent,
  CancelCallableWorkflowTaskInput,
  PauseCallableWorkflowTaskInput,
  ChatMessage,
  CallableWorkflowTaskSummary,
  CompactThreadInput,
  ContextUsageSnapshot,
  MessageDelivery,
  PermissionGrantScopeKind,
  PermissionMode,
  PermissionRisk,
  PermissionPromptResolution,
  PermissionPromptResponseMode,
  PlannerPlanArtifact,
  PlannerSettings,
  PermissionRequest,
  SecureInputPromptResolution,
  ProjectSummary,
  RunStatus,
  SendMessageInput,
  RecoverThreadContextInput,
  ResumeCallableWorkflowTaskInput,
  ThreadGoal,
  ThreadSummary,
  WorkspaceState,
  BrowserProfileMode,
  BrowserRuntimeKind,
  CancelSubagentRunInput,
  CloseSubagentRunInput,
  ResolveSubagentWaitBarrierInput,
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
  PrivilegedActionNativeRequest,
  PrivilegedCredentialPromptResolution,
  SearchRoutingSettings,
  SttProviderCandidate,
  SttSettings,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  SubagentWaitBarrierResolutionResult,
  UpdateMediaPlaybackSettingsInput,
  UpdatePlannerSettingsInput,
  UpdateSttSettingsInput,
  UpdateVoiceSettingsInput,
  VoiceSettingsAuditSource,
  VoiceProviderCandidate,
  VoiceSettings,
  WebResearchProviderConfig,
  WebResearchProviderRole,
  ThreadWorktreeSummary,
  WorkflowAgentThreadSummary,
  WorkflowRecordingLibraryDescription,
  ModelRuntimeSettings,
  WorkflowRecoveryAction,
  ProviderStatus,
} from "../shared/types";
import {
  normalizeAmbientModelId,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../shared/ambientModels";
import {
  resolveSubagentCapacityLease,
  type ResolveSubagentCapacityLeaseInput,
  type SubagentCapacityLocalMemorySnapshot,
} from "../shared/subagentCapacity";
import {
  isAmbientSubagentsEnabled,
  isAmbientTencentDbMemoryEnabled,
  resolveAmbientFeatureFlags,
  type AmbientFeatureFlagSnapshot,
} from "../shared/featureFlags";
import { isAgentMemoryActiveForThread } from "../shared/agentMemorySettings";
import type { AgentMemoryRuntimeSnapshot } from "../shared/agentMemoryDiagnostics";
import { ambientRetryPolicyFromSettings } from "./aggressiveRetries";
import { createManualCompactionEventHandler } from "./agentRuntimeManualCompactionEvents";
import {
  buildActiveContextUsageSnapshot,
  buildUnavailableContextUsageSnapshot,
  contextUsageCompactionStatsFromEntries,
} from "./agentRuntimeContextUsageSnapshot";
import { runPromptPreflightBeforePrompt } from "./agentRuntimePromptPreflight";
import type { ProjectStore } from "./projectStore";
import { getAmbientProviderStatus, normalizeAmbientBaseUrl } from "./providerStatus";
import { readAmbientApiKey } from "./credentialStore";
import { abortSessionRun as abortPiSessionRun } from "./sessionAbort";
import { recordAgentRuntimeVoiceDispatch } from "./agentRuntimeVoiceDispatch";
import { completeAgentRuntimeRegisteredVoiceProviderSetup } from "./agentRuntimeVoiceProviderSetup";
import { dogfoodAgentRuntimeSelectedVoiceProvider } from "./agentRuntimeVoiceProviderDogfood";
import type { AmbientCliVoiceRunner } from "./voiceProvider";
import type { WorkspaceMediaUrlInput } from "./workspaceMedia";
import { getRestorablePiSessionFile, getRestorableRecoverySessionFile, isPathInside } from "./sessionPaths";
import type { AmbientFileAuthorityRequest } from "./piReadOperations";
import { workspaceBoundedAgentContextFiles } from "./piContextFiles";
import {
  permissionPolicyFileToolAccess,
  permissionPolicyPathForTool,
  resolvePolicyPath,
} from "./permissionPolicy";
import { resolvePermissionWithGrants } from "./permissionGrants";
import {
  applyPlannerDurableRevisionResponse,
  extractPlannerDurableRevisionResponse,
  extractPlannerPlanArtifactFields,
} from "./plannerMode";
import { createPlannerModeExtension as createPlannerModeToolsExtension } from "./agentRuntimePlannerModeExtension";
import { createPermissionGateExtension as createPermissionGateToolsExtension } from "./agentRuntimePermissionGateExtension";
import { permissionToolInput as resolvePermissionToolInput } from "./agentRuntimePermissionToolInput";
import { validatePlannerDurableHtmlFileInBrowser } from "./plannerDurableBrowserValidation";
import { PlannerDurableHtmlValidationError, writePlannerDurableHtmlArtifact, type PlannerDurableHtmlBrowserValidator } from "./plannerDurableHtml";
import {
  buildPlannerDurableRepairPrompt,
  PLANNER_DURABLE_REPAIR_MAX_ATTEMPTS,
  plannerDurableFallbackWarnings,
  plannerDurableRepairAttemptCount,
} from "./plannerDurableRepair";
import { AmbientPluginHost, type PluginMcpRuntimeSnapshot, type PluginMcpToolRegistration } from "./plugins/pluginHost";
import {
  discoverAmbientCliPackages,
  ensureFirstPartyAmbientCliPackages,
  runAmbientCliPackageCommand,
} from "./ambientCliPackages";
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
} from "./ambientWorkflows";
import {
  planVoicePolicyUpdate,
  voicePolicyApprovalDetail,
} from "./voiceSettingsTools";
import {
  planSttPolicyUpdate,
} from "./sttSettingsTools";
import {
  appendSearchRoutingGuidance,
  webResearchSettingsWithDynamicProviderCatalogs,
} from "./searchSettingsTools";
import {
  capabilityBuilderValidationPreviewText,
  previewCapabilityBuilderPackage,
  type CapabilityBuilderValidateInput,
  type CapabilityBuilderValidateResult,
  validateCapabilityBuilderPackage,
} from "./capability-builder/capabilityBuilder";
import {
  browserToolDescriptor,
  messagingGatewayToolDescriptor,
  piToolFieldsFromDescriptor,
  pluginInstallToolDescriptor,
  privilegedActionToolDescriptor,
  searchPreferenceToolDescriptor,
} from "./desktopToolRegistry";
import { AmbientDownloadService } from "./ambientDownloadService";
import { createManagedDownloadToolExtension as createManagedDownloadToolsExtension } from "./agentRuntimeManagedDownloadTools";
import { AmbientCliPackageDescriptionState } from "./agent-runtime/ambient-cli-package/agentRuntimeAmbientCliPackageDescriptionState";
import {
  createWorkflowRecordingReviewTools,
  WORKFLOW_RECORDING_REVIEW_ACTIVE_TOOL_NAMES,
} from "./agentRuntimeWorkflowRecordingReviewTools";
import { workflowRecordingReviewSendInputForThread } from "./agentRuntimeWorkflowRecordingReviewRequest";
import {
  agentRuntimeThreadWorkspacePath,
} from "./agentRuntimeEventWorkspaceScope";
import { emitAgentRuntimeDesktopEvent } from "./agentRuntimeDesktopEventEmit";
import {
  localToolIdleTimeoutMs,
  unknownErrorMessage,
} from "./agentRuntimeUtilityHelpers";
import {
  resolveChatPiEmptyAssistantStallTimeoutMs,
  resolvePostToolContinuationIdleMs,
  resolvePostToolFinalizationTickMs,
  resolveWorkflowRecordingReviewStreamIdleTimeoutMs,
} from "./agentRuntimeTimeouts";
import { createRuntimeSendStreamDiagnostics } from "./agentRuntimeSendStreamDiagnostics";
import { runtimeActiveSessionResetPlan } from "./agentRuntimeActiveSessionReset";
import {
  runtimeSubagentDirectChildStoppedActivity,
  runtimeSubagentParentStopCascadeActivity,
} from "./agentRuntimeSubagentParentControlActivity";
import { piAssistantMessageMetadata } from "./agentRuntimeAssistantMessageMetadata";
import { agentRuntimeUserMessageMetadata } from "./agentRuntimeUserMessageMetadata";
import { modelContentForAgentRuntimeSendInput } from "./agentRuntimeSendContent";
import {
  goalContinuationPrompt as buildGoalContinuationPrompt,
  goalCompletionChatMessage,
  goalRuntimeActivity,
  GOAL_COMPLETION_MESSAGE_KIND,
  GOAL_MAX_CONTINUATION_TURNS,
  GOAL_MODE_TOOL_NAMES,
  GOAL_NO_PROGRESS_TURN_LIMIT,
} from "./agentRuntimeGoalRuntime";
import {
  assistantFinalizationRetryMaxRetriesFromSettings,
  piRetryOverridesFromModelRuntimeSettings,
  runtimeSettingsActivity,
} from "./agentRuntimeRetrySettings";
import {
  type AssistantFinalizationRetryReason,
  type AssistantFinalizationRetryState,
  type RuntimeSessionRecoveryContext,
} from "./agentRuntimeAssistantRetryInput";
import {
  type InterruptedToolCallRecoveryState,
} from "./agentRuntimeInterruptedToolRecoveryInput";
import {
  hasRuntimeThreadSettingsUpdate,
  runtimeThreadSettingsUpdateFromSendInput,
} from "./agentRuntimeThreadSettingsUpdate";
import {
  plannerDecisionQuestionsForFinalArtifact,
  plannerDurableRevisionArtifactIdForSourceMessage,
  plannerFinalizationSourceArtifactsFromPrompt,
  plannerPriorUserPromptForSourceMessage,
  type PlannerPlanArtifactContentUpdate,
} from "./agentRuntimePlannerFinalizationPrompt";
import {
  type AssistantTerminalCleanupDiagnostic,
  type AssistantTerminalEventDiagnostic,
} from "./agentRuntimeAssistantTerminalDiagnostics";
import { ambientModel, createAmbientProviderExtension } from "./agentRuntimeAmbientProvider";
import { browserToolUpdate } from "./agent-runtime/browser-tools/agentRuntimeBrowserToolFormatting";
import { withBrowserToolHeartbeat } from "./agent-runtime/browser-tools/agentRuntimeBrowserToolHeartbeat";
import { recordAgentRuntimeBrowserAudit } from "./agent-runtime/browser-tools/agentRuntimeBrowserAudit";
import { prepareAgentRuntimeBrowserToolProfile } from "./agent-runtime/browser-tools/agentRuntimeBrowserProfileSelection";
import { createAgentRuntimeBrowserToolExtension } from "./agent-runtime/browser-tools/agentRuntimeBrowserTools";
import type { BrowserScreenshotArtifactReference } from "./agent-runtime/browser-tools/agentRuntimeBrowserScreenshotTools";
import {
  registerGoogleWorkspaceSetupTools,
  type AgentRuntimeGoogleWorkspaceTools,
} from "./agentRuntimeGoogleWorkspaceSetupTools";
import {
  formatLocalDeepResearchBytes,
  localDeepResearchRequestedLaunchFromContract,
} from "./local-deep-research/agentRuntimeLocalDeepResearchInput";
import { createAgentRuntimeLocalDeepResearchToolExtension } from "./local-deep-research/agentRuntimeLocalDeepResearchTools";
import { createAgentRuntimeLocalDeepResearchWebBroker } from "./local-deep-research/agentRuntimeLocalDeepResearchWebBroker";
import {
  resolveAmbientCliSkillMount,
  type AmbientCliSkillMountDiagnostics,
} from "./agentRuntimeAmbientCliSkillMount";
import {
  discoverAgentRuntimeSkillPaths,
  pluginStateReaderFromStore,
} from "./plugins/runtime-tools/agentRuntimePluginDiscovery";
import {
  emitFirstPartyPluginPermissionAudit as emitFirstPartyPluginPermissionAuditWithRuntimeBridge,
  firstPartyPluginPermissionGrantHash,
  resolveFirstPartyPluginPermission as resolveFirstPartyPluginPermissionWithRuntimeBridge,
  type FirstPartyPluginPermissionAuditInput,
} from "./agentRuntimeFirstPartyPluginPermission";
import {
  revokeMcpPermissionGrantsForDescriptorDrift as revokeMcpPermissionGrantsForDescriptorDriftWithRuntimeBridge,
  revokePluginPermissionGrantsForLabelPrefixes,
} from "./plugins/runtime-tools/agentRuntimePluginGrantRevocation";
import { ensurePluginMcpToolTrusted as ensurePluginMcpToolTrustedWithRuntimeBridge } from "./plugins/runtime-tools/agentRuntimePluginMcpTrust";
import {
  createAgentRuntimePluginInstallApplyCallbacks,
  createAgentRuntimePluginInstallToolExtension,
} from "./agentRuntimePluginInstallToolExtension";
import { createAgentRuntimeToolRunnerExtension } from "./agentRuntimeToolRunnerTools";
import {
  AgentRuntimeInstallRouteGuard,
  appendMcpInstallRouteGuidance,
} from "./agentRuntimeInstallRouteGuard";
import type { McpToolCallResult } from "./mcpToolBridge";
import {
  createAgentRuntimeMcpToolOrchestration,
  type AgentRuntimeMcpToolOrchestration,
} from "./agentRuntimeMcpToolBridge";
import { tryCallWebResearchMcpProvider as callWebResearchMcpProvider } from "./agentRuntimeWebResearchMcpProviderRoute";
import { discoverWebResearchMcpProviderTools as discoverMcpProviderToolsForWebResearch } from "./agentRuntimeWebResearchMcpProviderTools";
import { webResearchProviderPlanForInput as buildWebResearchProviderPlanForInput } from "./agentRuntimeWebResearchProviderPlan";
import {
  ambientSubagentActiveToolNamesForThread,
  type SubagentPiToolStore,
} from "./subagents/subagentPiTools";
import {
  applyExplicitSubagentRequestGuidance,
  explicitSubagentRequestPreflight,
} from "./agentRuntimeSubagentIntentPreflight";
import { createAgentRuntimeSubagentEventingStore } from "./agentRuntimeSubagentEventingStore";
import { createAgentRuntimeSubagentToolExtension } from "./agentRuntimeSubagentTools";
import {
  callableWorkflowActiveToolNamesForThread,
} from "./callable-workflow/callableWorkflowPiTools";
import {
  callableWorkflowRecordedPlaybooks,
  createAgentRuntimeCallableWorkflowToolExtension,
} from "./agentRuntimeCallableWorkflowTools";
import {
  cancelAgentRuntimeCallableWorkflowTask,
  createAgentRuntimeCallableWorkflowRuntimeBridge,
  createAgentRuntimeCallableWorkflowRunnerStore,
  executeAgentRuntimeCallableWorkflowTaskForThread,
  pauseAgentRuntimeCallableWorkflowTask,
  resumeAgentRuntimeCallableWorkflowTask,
  startAgentRuntimeCallableWorkflowTaskForThread,
} from "./agentRuntimeCallableWorkflowExecution";
import { callableWorkflowToolName } from "./callable-workflow/callableWorkflowRegistry";
import {
  type CallableWorkflowParentBlockingBlock,
} from "./callable-workflow/callableWorkflowParentBlocking";
import {
  callableWorkflowFinalizationBlock as resolveCallableWorkflowFinalizationBlock,
  recordCallableWorkflowFinalizationBlockedParentMailbox as recordCallableWorkflowFinalizationBlockedParentMailboxEvent,
  recordSubagentFinalizationBlockedParentMailbox as recordSubagentFinalizationBlockedParentMailboxEvents,
  subagentFinalizationBarrierBlock as resolveSubagentFinalizationBarrierBlock,
  type SubagentFinalizationBarrierBlock,
} from "./agentRuntimeFinalizationBlocking";
import {
  resolveAgentRuntimeActiveToolNamesForThread,
  subagentChildCallableWorkflowToolNamesFromSnapshots,
} from "./subagents/subagentChildActiveTools";
import {
  resolveActiveSubagentWaitBarriersForRun,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
} from "./subagents/subagentWaitBarrierResolution";
import type {
  SubagentChildRuntimeAdapter,
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
  SubagentChildRuntimeApprovalRequest,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitResult,
  SubagentRuntimeEventEmitter,
} from "./piChildSessionAdapter";
import { subagentParentContextForMessages } from "./subagents/subagentContextFilter";
import {
  buildSubagentChildPrompt,
  buildSubagentFollowupPrompt,
  buildSubagentPromptSnapshot,
  classifySubagentAssistantResult,
} from "./subagents/subagentPromptRuntime";
import { subagentTranscriptPath } from "./subagents/subagentLifecycleHooks";
import { tryRouteBrowserContentThroughScrapling as routeBrowserContentThroughScrapling } from "./agentRuntimeScraplingBrowserRoute";
import {
  webResearchExaApiKeyFromEnv,
  webResearchRuntimeSummaryForWorkspace as buildWebResearchRuntimeSummary,
  type WebResearchRuntimeSummary,
} from "./agentRuntimeWebResearchRuntimeSummary";
import { createAmbientProductContextExtension } from "./agentRuntimeProductContextTools";
import { createProviderCatalogToolExtension } from "./agentRuntimeProviderCatalogTools";
import { createMediaToolExtension } from "./agentRuntimeMediaTools";
import { createLocalRuntimeToolExtension } from "./local-runtime/agentRuntimeLocalRuntimeTools";
import { createVisionToolExtension } from "./agentRuntimeVisionTools";
import { createSttSettingsToolExtension } from "./agentRuntimeSttTools";
import { createVoiceSettingsToolExtension } from "./agentRuntimeVoiceTools";
import { registerMessagingOverviewTools } from "./agent-runtime/messaging/agentRuntimeMessagingOverviewTools";
import { registerTelegramSessionTools } from "./agentRuntimeTelegramSessionTools";
import { registerSignalSessionTools } from "./agentRuntimeSignalSessionTools";
import { registerMessagingBindingTools } from "./agent-runtime/messaging/agentRuntimeMessagingBindingTools";
import { registerTelegramOwnerLoopTools } from "./agentRuntimeTelegramOwnerLoopTools";
import { registerMessagingConversationDirectoryTools } from "./agent-runtime/messaging/agentRuntimeMessagingConversationDirectoryTools";
import { registerTelegramConversationDirectoryTools } from "./agentRuntimeTelegramConversationDirectoryTools";
import { registerTelegramOwnerHandoffTools } from "./agentRuntimeTelegramOwnerHandoffTools";
import { registerSignalConversationDirectoryTools } from "./agentRuntimeSignalConversationDirectoryTools";
import { registerSignalUnreadWindowTools } from "./agentRuntimeSignalUnreadWindowTools";
import { registerSignalRealPollingTools } from "./agentRuntimeSignalRealPollingTools";
import { registerSignalBridgeReplyTools } from "./agentRuntimeSignalBridgeReplyTools";
import {
  createSignalBridgeReplyResolvers,
  signalBridgeReplyApprovalRequest,
} from "./agentRuntimeSignalBridgeReplyPlan";
import { registerSignalBindingReadinessTools } from "./agentRuntimeSignalBindingReadinessTools";
import { registerSignalOwnerHandoffTools } from "./agentRuntimeSignalOwnerHandoffTools";
import {
  createSignalRemoteSurfacePlanResolvers,
  registerSignalRemoteSurfaceTools,
} from "./agent-runtime/messaging/agentRuntimeSignalRemoteSurfaceTools";
import { registerMessagingRemoteSurfaceBindingTools } from "./agent-runtime/messaging/agentRuntimeMessagingRemoteSurfaceBindingTools";
import { registerMessagingRemoteSurfaceEventTools } from "./agent-runtime/messaging/agentRuntimeMessagingRemoteSurfaceEventTools";
import {
  createTelegramRemoteSurfacePlanResolvers,
  registerTelegramRemoteSurfaceTools,
} from "./agent-runtime/messaging/agentRuntimeTelegramRemoteSurfaceTools";
import { registerRuntimeSurfaceTools } from "./agentRuntimeRuntimeSurfaceTools";
import { registerMessagingSyntheticRouteTools } from "./agent-runtime/messaging/agentRuntimeMessagingSyntheticRouteTools";
import { registerTelegramBridgeEventTools } from "./agentRuntimeTelegramBridgeEventTools";
import { registerTelegramBridgePollPreviewTools } from "./agentRuntimeTelegramBridgePollPreviewTools";
import { registerTelegramBridgePollApplyTools } from "./agentRuntimeTelegramBridgePollApplyTools";
import {
  createTelegramBridgePollResolvers,
  createTelegramBridgePollingResolvers,
} from "./agentRuntimeTelegramBridgePollPlan";
import { registerTelegramBridgePollingStatusTools } from "./agentRuntimeTelegramBridgePollingStatusTools";
import { registerTelegramBridgePollingPreviewTools } from "./agentRuntimeTelegramBridgePollingPreviewTools";
import { registerTelegramBridgePollingApplyTools } from "./agentRuntimeTelegramBridgePollingApplyTools";
import { registerTelegramBridgeReplyPreviewTools } from "./agentRuntimeTelegramBridgeReplyPreviewTools";
import { registerTelegramBridgeReplyApplyTools } from "./agentRuntimeTelegramBridgeReplyApplyTools";
import {
  createTelegramBridgeReplyResolvers,
  telegramBridgeReplyApprovalRequest,
} from "./agentRuntimeTelegramBridgeReplyPlan";
import { registerMessagingRemoteSurfaceReplyPreviewTools } from "./agent-runtime/messaging/agentRuntimeMessagingRemoteSurfaceReplyPreviewTools";
import { registerMessagingRemoteSurfaceReplyApplyTools } from "./agent-runtime/messaging/agentRuntimeMessagingRemoteSurfaceReplyApplyTools";
import {
  createMessagingRemoteSurfaceReplyTargetResolver,
  messagingRemoteSurfaceReplyInputFromParams,
} from "./agent-runtime/messaging/agentRuntimeMessagingRemoteSurfaceReplyTarget";
import { registerMessagingRemoteSurfaceCommandPreviewTools } from "./agent-runtime/messaging/agentRuntimeMessagingRemoteSurfaceCommandPreviewTools";
import {
  completeMessagingRemoteSurfaceCommandPendingProjectSwitch,
  createMessagingRemoteSurfaceCommandApplyResolver,
  type MessagingRemoteSurfaceCommandPendingProjectSwitch,
  registerMessagingRemoteSurfaceCommandApplyTools,
} from "./agent-runtime/messaging/agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import { createMessagingRemoteSurfaceCommandPreviewResolver } from "./agent-runtime/messaging/agentRuntimeMessagingRemoteSurfaceCommandPreviewPlan";
import { registerTelegramRelayDiagnosticsTools } from "./agentRuntimeTelegramRelayDiagnosticsTools";
import { registerSignalRelayDiagnosticsTools } from "./agentRuntimeSignalRelayDiagnosticsTools";
import { createMessagingRelayDiagnosticsResolvers } from "./agentRuntimeRelayDiagnosticsResolvers";
import * as messagingGatewayStatusTools from "./agent-runtime/messaging/agentRuntimeMessagingGatewayStatusTools";
import {
  registerMessagingGatewayLifecyclePreviewTools,
} from "./agent-runtime/messaging/agentRuntimeMessagingGatewayLifecyclePreviewTools";
import { registerMessagingGatewayLifecycleApplyTools } from "./agent-runtime/messaging/agentRuntimeMessagingGatewayLifecycleApplyTools";
import { createMessagingGatewayLifecycleResolvers } from "./agent-runtime/messaging/agentRuntimeMessagingGatewayLifecycleResolvers";
import {
  createAgentRuntimeMessagingGatewayToolExtension,
  createAgentRuntimeMessagingRuntimeBridge,
} from "./agent-runtime/messaging/agentRuntimeMessagingGatewayToolExtension";
import { createAgentRuntimeWebResearchToolExtension } from "./agentRuntimeWebResearchToolExtension";
import { createSearchPreferenceToolExtension as createSearchPreferenceToolsExtension } from "./agentRuntimeSearchPreferenceTools";
import { createGitToolExtension as createGitToolsExtension } from "./agentRuntimeGitTools";
import { createPluginMcpToolExtension as createPluginMcpToolsExtension } from "./plugins/runtime-tools/agentRuntimePluginMcpTools";
import { createWorkflowNativeToolExtension as createWorkflowNativeToolsExtension } from "./agentRuntimeWorkflowNativeTools";
import { createProjectBoardTaskToolExtension as createProjectBoardTaskToolsExtension } from "./agentRuntimeProjectBoardTaskTools";
import {
  createInterruptedToolCallRecoveryToolExtension as createInterruptedToolCallRecoveryToolsExtension,
  readInterruptedToolCallRecoveryArtifact as readInterruptedToolCallRecoveryArtifactFromRoots,
} from "./agentRuntimeInterruptedRecoveryTools";
import {
  activeToolNamesForAgentRuntimeSession,
  recoveryToolNamesForSessionRecovery,
} from "./agentRuntimeRecoveryToolActivation";
import { createGoalModeToolExtension as createGoalModeToolsExtension } from "./agentRuntimeGoalModeTools";
import { validateGoalCompletionArtifacts } from "./agentRuntimeGoalCompletionValidation";
import { createPrivilegedActionToolsExtension } from "./agentRuntimePrivilegedActionTools";
import { createAmbientCompactionSummaryExtension as createAmbientCompactionSummaryToolsExtension } from "./agentRuntimeCompactionSummaryExtension";
import type { AmbientTencentMemoryLlmDelegate } from "./memory/tencentdb/ambientLlmRunner";
import type { AmbientTencentMemoryEmbeddingStartInput, AmbientTencentMemoryEmbeddingStartResult } from "./memory/tencentdb/ambientEmbeddingProvider";
import type { TencentMemoryCoreConstructorLoader } from "./memory/tencentdb/optionalCore";
import {
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
  startAmbientMemoryEmbeddingRuntime,
} from "./memory/tencentdb/managedEmbeddingProvider";
import type { AnalyzeMiniCpmVisionInputOptions, SetupMiniCpmVisionProviderOptions } from "./miniCpmVisionProvider";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchProviderSnapshot,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput,
} from "./local-deep-research/localDeepResearchSetup";
import { detectLocalDeepResearchManagedAssets } from "./local-deep-research/localDeepResearchManagedAssets";
import type { LocalDeepResearchModelProfileId } from "./local-deep-research/localDeepResearchModelProfiles";
import type { LocalDeepResearchRunRequest, LocalDeepResearchRunServiceResult } from "./local-deep-research/localDeepResearchRunService";
import {
  localDeepResearchInstallJobWarnings,
  reconcileLocalDeepResearchInstallJob,
  type LocalDeepResearchInstallRequest,
  type LocalDeepResearchInstallServiceResult,
} from "./local-deep-research/localDeepResearchInstallService";
import { detectLocalLlamaResidentProcesses, type LocalLlamaResidentProcess } from "./localLlamaResidencyPolicy";
import {
  buildLocalModelResourceRegistry,
  localTextRequestedLaunch,
  type LocalModelRequestedLaunch,
} from "./local-runtime/localModelResourceRegistry";
import { buildLocalModelRuntimeStatusSnapshot, type LocalModelRuntimeStatusSnapshot } from "./local-runtime/localModelRuntimeStatus";
import { LocalModelRuntimeManager } from "./local-runtime/localModelRuntimeManager";
import { DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS } from "./local-runtime/localRuntimeInventory";
import { runAgentRuntimeLocalModelRuntimeLifecycleAction } from "./local-runtime/agentRuntimeLocalRuntimeLifecycleAction";
import {
  type LocalModelRuntimeRestartPlan,
} from "./local-runtime/localModelRuntimeRestart";
import {
  type LocalModelRuntimeStopPlan,
} from "./local-runtime/localModelRuntimeStop";
import {
  localRuntimeOwnershipResolutionRequest,
  type LocalRuntimeOwnershipResolutionRequest,
  type LocalRuntimeOwnershipResolutionResult,
} from "./local-runtime/localRuntimeOwnershipResolution";
import { createDefaultModelRuntimeRegistry } from "./modelRuntimeRegistry";
import type { LocalTextRuntimeManagerLike } from "./local-runtime/localTextDelegation";
import { runAgentRuntimeLocalTextMainRun } from "./local-runtime/agentRuntimeLocalTextMainRun";
import {
  createLocalTextSubagentRuntimeAdapter,
  type CreateLocalTextSubagentRuntimeAdapterOptions,
  type LocalTextSubagentRuntimeConfig,
  type LocalTextSubagentRuntimeStore,
} from "./local-runtime/localTextSubagentRuntime";
import { cancelPendingParentToChildMailboxEvents } from "./subagents/subagentMailbox";
import { executeSubagentCancelAgent } from "./subagents/subagentCancelAgentExecutor";
import { executeSubagentBarrierDecision } from "./subagents/subagentBarrierDecisionExecutor";
import { assertCanCloseSubagentRun } from "./subagents/subagentCloseAgent";
import { executeSubagentCloseAgent } from "./subagents/subagentCloseAgentExecutor";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagents/subagentIdempotency";
import { appendMappedSubagentRuntimeEvent } from "./subagents/subagentRuntimeEventPersistence";
import { prepareThreadWorktree } from "./gitWorktrees";
import type { LocalDeepResearchSmokeRequest } from "./local-deep-research/localDeepResearchSmoke";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import {
  MessagingGatewayRunner,
} from "./messagingGatewayRunner";
import { TelegramBridgeSupervisor } from "./telegramBridgeSupervisor";
import { readinessProbesFromAdapters } from "./messagingProviderReadiness";
import { createSignalMessagingReadinessAdapter } from "./signalMessagingReadiness";
import { createTelegramMessagingReadinessAdapter } from "./telegramMessagingReadiness";
import {
  createMessagingBindingStore,
} from "./messagingBindings";
import { createDefaultMessagingConversationDirectoryAdapterRegistry } from "./messagingConversationDirectoryAdapters";
import {
  SignalRealPollingRunner,
} from "./signalRealPolling";
import { createAgentRuntimeMessagingSurfaceSnapshot } from "./agent-runtime/messaging/agentRuntimeMessagingSurfaceSnapshot";
import {
  TelegramBridgePollingRunner,
} from "./telegramBridgePolling";
import { agentRuntimeWorkflowRecoveryEventsForRemoteSurface } from "./agentRuntimeWorkflowRecoveryEvents";
import {
  AgentRuntimeRemoteSurfaceRuntimeEventStore,
  type AgentRuntimeRemoteSurfaceRuntimeEventCreateInput,
} from "./agent-runtime/messaging/agentRuntimeRemoteSurfaceRuntimeEvents";
import { AmbientWorkflowDescriptionState } from "./agentRuntimeAmbientWorkflowDescriptionState";
import { answerWorkflowDiscoveryQuestion } from "./workflowDiscoveryService";
import { writePrivilegedActionRedactedLog } from "./privilegedActionLogs";
import type { AmbientCliSttRunner } from "./sttProvider";
import {
  agentRuntimeProviderDiscoveryOptions as createAgentRuntimeProviderDiscoveryOptions,
  listEmbeddingProvidersForTools as listAgentRuntimeEmbeddingProvidersForTools,
  listSttProvidersForTools as listAgentRuntimeSttProvidersForTools,
  listVoiceProvidersForTools as listAgentRuntimeVoiceProvidersForTools,
  listVoiceProvidersWithCachedVoices as listAgentRuntimeVoiceProvidersWithCachedVoices,
  voiceProviderWorkspacePathForCapabilityId as agentRuntimeVoiceProviderWorkspacePathForCapabilityId,
  type AgentRuntimeProviderDiscoveryOptions,
} from "./agentRuntimeProviderDiscovery";
import { generateThreadTitle } from "./threadTitles";
import { runWorkflowArtifact } from "./workflowRunService";
import type { WorkflowConnectorAccountAuthorizer, WorkflowConnectorDescriptor, WorkflowConnectorRegistration } from "./workflowConnectors";
import { BrowserService } from "./browserService";
import { BrowserCredentialStore } from "./browserCredentialStore";
import { refreshExternalFileBrowserTabs } from "./browserRefresh";
import { refreshAgentRuntimeBrowsersForArtifactChange } from "./agent-runtime/browser-tools/agentRuntimeBrowserRefresh";
import { createLambdaRlmToolExtension as createLambdaRlmToolsExtension } from "./agentRuntimeLambdaRlmTools";
import {
  projectBoardNativeTaskToolDefinitions,
} from "./project-board/projectBoardTaskTools";
import { GlmTokenizerService, type GlmTokenizerStatus } from "./tokenization/glmTokenizer";
import { createContextAccountingExtension as createContextAccountingToolsExtension } from "./agentRuntimeContextAccountingExtension";
import {
  recordTransientFileAuthorityForAllowedTool,
  recordTransientFileAuthorityFromPermissionRequest,
  includeDefaultWorkspaceAuthorityRoots,
  runtimeFileAuthorityRootPathsForThread,
  type TransientFileAuthorityRoot,
} from "./agentRuntimeFileAuthority";
import {
  hasVisibleTranscriptRecoveryMessage,
  isVisibleTranscriptRecoveryNormalCompactionRequiredError,
  visibleTranscriptRecoveryManualMessages,
  visibleTranscriptRecoveryMissingSessionPlan,
  visibleTranscriptRecoveryReason,
  visibleTranscriptRecoveryRestorableSessionPlan,
  visibleTranscriptRecoverySessionOpenFailurePlan,
  visibleTranscriptRecoverySessionOpenUnavailablePlan,
  visibleTranscriptRecoveryDefaultSessionSeedMessages,
  visibleTranscriptRecoverySessionSeedDecision,
  visibleTranscriptRecoverySessionTranscriptContext,
  visibleTranscriptRecoveryUnavailableContextMessages,
} from "./compactionSummary";
import { commitGitPaths } from "./workspaceGit";
import { browserToolRecoverableFailure } from "./agentBrowserRuntime";
import {
  AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES,
  createAmbientToolRouterTools,
} from "./ambientToolRouter";
import { ambientMcpBridgeActiveToolNamesForRecoveredTranscript } from "./agentRuntimeMcpRecoveredTranscript";
import {
  cleanToolPath,
  normalizeWorkspaceArtifactPath,
} from "./agentRuntimeMediaArtifacts";
import {
  subagentMutationCategoryForChildTool,
  subagentToolInputPathFromMessage,
} from "./agentRuntimeToolTranscript";
import {
  stringMetadata,
  type SubagentParentControlAbortIntent,
} from "./agentRuntimeToolMessageMetadata";
import {
  type RuntimeOpenToolFailureReason,
} from "./agent-runtime/openToolFailureUpdates";
import { handleRuntimeActiveRunHandoff } from "./agent-runtime/runtimeActiveRunHandoff";
import { createRuntimeAssistantRetryPlanning } from "./agent-runtime/runtimeAssistantRetryPlanning";
import {
  type RuntimePermissionWaitControl,
  type RuntimePermissionWaitFinish,
  type RuntimePermissionWaitStart,
} from "./agent-runtime/runtimePermissionWaitController";
import { createRuntimePermissionWaitSetup } from "./agent-runtime/runtimePermissionWaitSetup";
import {
  createRuntimeQueuedMessageController,
} from "./agent-runtime/runtimeQueuedMessageController";
import { createRuntimeRunEventScope } from "./agent-runtime/runtimeRunEventScope";
import {
  handleRuntimePromptSuccess,
  type RuntimePromptSuccessHandlerInput,
} from "./agent-runtime/runtimePromptSuccessHandler";
import { finalizeRuntimeSubagentPreflightBlock } from "./agent-runtime/runtimeSubagentPreflightBlock";
import { finalizeRuntimeSendAfterRun } from "./agent-runtime/runtimeSendAfterRun";
import {
  type AccountFinishedGoalRunInput,
} from "./agent-runtime/runtimeGoalContinuationAfterRun";
import {
  type RuntimeAssistantTerminalCompletion,
} from "./agent-runtime/runtimeAssistantTerminalCompletion";
import {
  type RuntimeEmptyAssistantStallWatchdog,
} from "./agent-runtime/runtimeEmptyAssistantStallWatchdog";
import {
  type RuntimeToolArgumentWatchdog,
} from "./agent-runtime/runtimeToolArgumentWatchdog";
import {
  type RuntimeToolExecutionWatchdog,
} from "./agent-runtime/runtimeToolExecutionWatchdog";
import type { RuntimeStreamWatchdogController } from "./agent-runtime/runtimeStreamWatchdogController";
import { createRuntimeStreamActivityTracker } from "./agent-runtime/runtimeStreamActivityTracker";
import {
  type RuntimePostToolContinuationController,
} from "./agent-runtime/runtimePostToolContinuationController";
import { cleanupRuntimeSession } from "./agent-runtime/runtimeSessionCleanup";
import { createRuntimeAssistantMessageController } from "./agent-runtime/runtimeAssistantMessageController";
import type { RuntimeToolMessageController } from "./agent-runtime/runtimeToolMessageController";
import { createRuntimeToolEventDispatcherSetup } from "./agent-runtime/runtimeToolEventDispatcherSetup";
import { handleRuntimePromptFailure } from "./agent-runtime/runtimePromptFailureHandler";
import { createRuntimeToolContextSetup } from "./agent-runtime/runtimeToolContextSetup";
import { createRuntimeProviderContinuationSetup } from "./agent-runtime/runtimeProviderContinuationSetup";
import { createRuntimeAbortContextSetup } from "./agent-runtime/runtimeAbortContextSetup";
import type { RuntimeAbortContextActiveRun } from "./agent-runtime/runtimeAbortContext";
import { createRuntimeTextOutputState } from "./agent-runtime/runtimeTextOutputState";
import { createRuntimeProviderRetryState } from "./agent-runtime/runtimeProviderRetryState";
import { createRuntimeStreamTraceState } from "./agent-runtime/runtimeStreamTraceState";
import { createRuntimeSendPendingFollowUps } from "./agent-runtime/runtimeSendPendingFollowUps";
import { createRuntimePromptControlState } from "./agent-runtime/runtimePromptControlState";
import { createRuntimePromptLifecycleControls } from "./agent-runtime/runtimePromptLifecycleControls";
import { subscribeRuntimePromptEvents } from "./agent-runtime/runtimePromptEventSubscription";
import { createRuntimePromptExecutionSetup } from "./agent-runtime/runtimePromptExecutionSetup";
import { runRuntimePromptCompletionSetup } from "./agent-runtime/runtimePromptCompletionSetup";
import { createRuntimePromptControllerSetup } from "./agent-runtime/runtimePromptControllerSetup";
import { createRuntimePromptStreamDispatcherSetup } from "./agent-runtime/runtimePromptStreamDispatcherSetup";
import {
  isAmbientProviderAuthFailure,
  truncateDiagnosticText,
} from "./agent-runtime/provider-continuation/agentRuntimeProviderDiagnostics";
import {
  formatRuntimeError as formatAgentRuntimeError,
} from "./agentRuntimeErrorFormatting";
import {
  runtimeProviderRetryFinishedActivity,
} from "./agent-runtime/provider-continuation/agentRuntimeProviderRetryActivity";
import { resolveAgentRuntimeToolCallPermission } from "./agentRuntimeToolCallPermission";
import {
  childSessionErrorShouldPreserveTerminalStatus,
  isLocalTextSubagentProfile,
  isSubagentTerminalStatus,
  latestAssistantMessageForThread,
  latestSubagentAssistantResultMessageForThread,
  normalizedSubagentRuntimeTextLength,
  permissionPromptResponseModeForSubagentApproval,
  previewForSubagentRuntime,
  subagentApprovalRequestFromPermissionRequest,
  uniqueStrings,
} from "./agentRuntimeSubagentRuntimeHelpers";
import { resolveAgentRuntimeImageInputs } from "./agentRuntimeImageInputs";

export {
  buildRuntimeProviderFailureDiagnostic,
  isAmbientProviderAuthFailure,
  runtimeProviderErrorDiagnostic,
  runtimeProviderFailureIdleSource,
} from "./agent-runtime/provider-continuation/agentRuntimeProviderDiagnostics";
export type {
  PiStreamTraceReference,
  RuntimeProviderErrorDiagnostic,
  RuntimeProviderFailureDiagnostic,
  RuntimeProviderFailureIdleSource,
} from "./agent-runtime/provider-continuation/agentRuntimeProviderDiagnostics";

type PiSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

export type { AgentRuntimeGoogleWorkspaceTools } from "./agentRuntimeGoogleWorkspaceSetupTools";

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

const MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS = 3;
const SUBAGENT_WAIT_HEARTBEAT_INTERVAL_MS = 15_000;
const SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS = 10 * 60_000;
const SUBAGENT_CHILD_MIN_HARD_TIMEOUT_MS = 10 * 60_000;

interface SubagentChildExecutionRecord {
  childThreadId: string;
  promise: Promise<void>;
  startedAt: string;
}

interface SubagentChildActivitySnapshot {
  atMs: number;
  at: string;
  source: string;
  detail?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function timestampMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function activitySnapshotFromIso(
  value: string | undefined,
  source: string,
  detail: string,
  fallbackMs: number,
): SubagentChildActivitySnapshot {
  const atMs = timestampMs(value) ?? fallbackMs;
  return {
    atMs,
    at: new Date(atMs).toISOString(),
    source,
    detail,
  };
}

function normalizedSubagentChildRuntimeHardTimeoutMs(run: SubagentRunSummary): number {
  const roleLimitMs = run.roleProfileSnapshot.guardPolicy.maxRuntimeMs;
  if (!Number.isFinite(roleLimitMs) || roleLimitMs < 0) return SUBAGENT_CHILD_MIN_HARD_TIMEOUT_MS;
  return Math.max(SUBAGENT_CHILD_MIN_HARD_TIMEOUT_MS, Math.floor(roleLimitMs));
}

function delaySubagentChildWaitTick(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, Math.max(0, Math.floor(ms)));
    if (typeof timeout === "object" && "unref" in timeout && typeof timeout.unref === "function") timeout.unref();
  });
}

type SubagentChildTurnCompletion =
  | { status: "terminal" }
  | { status: "needs_followup"; message: string; reason: string; followupKind: "post_tool" | "result_contract" };

function latestAssistantMessageAfterLastToolForMessages(messages: ChatMessage[]): ChatMessage | undefined {
  const lastToolIndex = findLastMessageIndex(messages, (message) => message.role === "tool");
  for (let index = messages.length - 1; index > lastToolIndex; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.content.trim()) return message;
  }
  return undefined;
}

function subagentPostToolFollowupRequest(
  messages: ChatMessage[],
  role: SubagentRunSummary["roleProfileSnapshot"],
): { reason: string; message: string } | undefined {
  if (latestSubagentAssistantResultMessageForThread(messages)) return undefined;
  const lastToolIndex = findLastMessageIndex(messages, (message) => message.role === "tool");
  if (lastToolIndex === -1) return undefined;
  if (latestAssistantMessageAfterLastToolForMessages(messages)) return undefined;
  const reason = role.guardPolicy.structuredOutputRequired
    ? "Child produced tool results without a final structured sub-agent result."
    : "Child produced tool results without a final assistant result.";
  return {
    reason,
    message: [
      reason,
      "Continue from the visible child transcript.",
      "Do not repeat completed tool calls unless needed to recover missing evidence.",
      "If required task steps remain, use only the tools and scopes already granted to this child.",
      role.guardPolicy.structuredOutputRequired
        ? "When the task is finished, return the required SUBAGENT_RESULT_JSON block and exactly one SUBAGENT_RESULT_STATUS line."
        : "When the task is finished, return the final child answer.",
    ].join("\n"),
  };
}

function subagentResultContractFollowupRequest(
  disposition: ReturnType<typeof classifySubagentAssistantResult>,
  role: SubagentRunSummary["roleProfileSnapshot"],
  assistantText: string,
): { reason: string; message: string } | undefined {
  if (!role.guardPolicy.structuredOutputRequired) return undefined;
  if (disposition.status !== "failed") return undefined;
  if (disposition.explicitStatus === "failed") return undefined;
  const reason = disposition.reason?.trim();
  if (!reason || !subagentResultContractFailureIsRecoverable(reason)) return undefined;
  return {
    reason,
    message: [
      `Your previous child response did not satisfy Ambient's required result contract: ${reason}`,
      "Continue from the visible child transcript.",
      assistantText.trim()
        ? "Do not redo long prose unless required. If your previous answer contains the correct task work, summarize that answer in the structured result."
        : "The previous turn did not leave a usable assistant answer. Finish the child task from the visible transcript.",
      "Return exactly one SUBAGENT_RESULT_JSON block followed by exactly one SUBAGENT_RESULT_STATUS line.",
      "Use status complete only if the child task is done; use needs_attention if parent/user steering is required; use failed if the task cannot be completed.",
    ].join("\n"),
  };
}

function subagentResultContractFailureIsRecoverable(reason: string): boolean {
  return (
    reason.startsWith("Structured-output role result is missing") ||
    reason.startsWith("Structured-output role result status") ||
    reason.startsWith("Structured sub-agent result is invalid") ||
    reason.startsWith("Structured result ") ||
    reason.includes("must match result status") ||
    reason.includes("must be an array of strings") ||
    reason.includes("must be an array of plain strings") ||
    reason.includes("roleOutput")
  );
}

function findLastMessageIndex(messages: ChatMessage[], predicate: (message: ChatMessage) => boolean): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) return index;
  }
  return -1;
}

export interface VoiceSettingsAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

const activeSessions = new Map<string, PiSession>();
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
} from "./postToolContinuationScheduler";
export { ambientMcpBridgeActiveToolNamesForRecoveredTranscript } from "./agentRuntimeMcpRecoveredTranscript";
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

async function abortSessionRun(session: PiSession, threadId: string): Promise<void> {
  await abortPiSessionRun(session, {
    graceMs: POST_TOOL_ABORT_GRACE_MS,
    onStalled: () => activeSessions.delete(threadId),
  });
}

type RuntimeSendMessageInput = SendMessageInput & {
  internal?: true;
  assistantFinalizationRetry?: AssistantFinalizationRetryState;
  interruptedToolCallRecovery?: InterruptedToolCallRecoveryState;
  sessionRecovery?: RuntimeSessionRecoveryContext;
  dedicatedSessionKind?: "workflow-recording-review";
  modelContentOverride?: string;
  visibleUserContent?: string;
  hiddenUserMessage?: true;
  goalContinuation?: { goalId: string };
};

interface RuntimeSendLoopContext {
  runtimeInput: RuntimeSendMessageInput;
  usesDedicatedReviewSession: boolean;
  visibleUserContent: string;
  hasWorkflowPlanEditIntent: boolean;
  thread: ThreadSummary;
  plannerFinalizationSources: PlannerPlanArtifact[];
  runWorkspacePath: string;
  modelRuntimeSettingsForRun: ModelRuntimeSettings;
  piPreStreamTimeoutMs: number;
  piStreamIdleTimeoutMs: number;
  defaultToolExecutionIdleTimeoutMs: number;
  emptyAssistantStallTimeoutMs: number;
  promptContent: string;
  shouldInjectBootstrap: boolean;
  retrySourceUserMessageId?: string;
  activeAssistantFinalizationRetry?: AssistantFinalizationRetryState;
  assistantFinalizationRetryMaxRetries: number;
  interruptedToolCallRecoveryMaxRetries: number;
  interruptedToolCallRecoveryAttemptsUsed: number;
  canScheduleInterruptedToolCallRecovery: boolean;
}

interface FinalizeAgentRuntimeSendAfterRunInput {
  sendInput: SendMessageInput;
  hooks: AgentRuntimeSendHooks;
  runId: string;
  runWorkspacePath: string;
  runGoalId?: string | undefined;
  runGoalStartedAtMs: number;
  promptContent: string;
  currentAssistantFinalText: string;
  assistantOutputChars: number;
  currentThinkingFinalText: string;
  thinkingOutputChars: number;
  abortRequested: boolean;
  pendingPlannerRepairFollowUp?: SendMessageInput | undefined;
  pendingEmptyResponseRetry?: SendMessageInput | undefined;
  pendingInterruptedToolCallRecoveryFollowUp?: SendMessageInput | undefined;
  pendingProviderInterruptionContinuation?: SendMessageInput | undefined;
  pendingEmptyResponseRetryDelayMs: number;
  usesDedicatedReviewSession: boolean;
  session?: PiSession | undefined;
  hasWorkflowPlanEditIntent: boolean;
  isRunStoreActive: () => boolean;
  cleanupCurrentSession: () => void;
  emitRunEvent: (event: DesktopEvent) => void;
  toolArgumentWatchdog?: RuntimeToolArgumentWatchdog | undefined;
  toolExecutionWatchdog?: RuntimeToolExecutionWatchdog | undefined;
  queuedMessages: ReturnType<typeof createRuntimeQueuedMessageController>;
  toolMessages: RuntimeToolMessageController;
  resolveActiveRunSettled?: (() => void) | undefined;
}

interface HandleAgentRuntimePromptSuccessInput {
  sendInput: SendMessageInput;
  runId: string;
  runWorkspacePath: string;
  session: PiSession;
  runtimeMessages: ReturnType<typeof createRuntimeAssistantMessageController>;
  toolMessages: RuntimeToolMessageController;
  plannerFinalizationSources: PlannerPlanArtifact[];
  runtimeError?: string | undefined;
  abortRequested: boolean;
  finalizedAfterToolIdle: boolean;
  currentThinkingFinalText: string;
  currentAssistantFinalText: string;
  receivedAnyText: boolean;
  pendingEmptyResponseRetryDelayMs: number;
  activeRetryReason?: AssistantFinalizationRetryReason | undefined;
  retrySourceUserMessageId?: string | undefined;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic | undefined;
  assistantTerminalCleanupDiagnostic?: AssistantTerminalCleanupDiagnostic | undefined;
  subagentParentControlAbortIntent?: SubagentParentControlAbortIntent | undefined;
  providerRetryBeforeVisibleOutput: boolean;
  providerRetryRecovered: boolean;
  providerRetryAttemptCount: number;
  providerRetryLastError?: string | undefined;
  usesDedicatedReviewSession: boolean;
  assistantFinalizationRetryMaxRetries: number;
  canScheduleAssistantFinalizationRetryFor: (reason: AssistantFinalizationRetryReason) => boolean;
  assistantFinalizationRetryAttemptsUsedFor: (reason: AssistantFinalizationRetryReason) => number;
  assistantFinalizationRetryNextAttemptFor: (reason: AssistantFinalizationRetryReason) => number;
  createAssistantFinalizationRetryInput: (reason: AssistantFinalizationRetryReason) => RuntimeSendMessageInput;
  consumeSubagentParentControlAbort: () => Promise<void>;
  cleanupCurrentSession: () => void;
  finishPlannerFinalizationSources: RuntimePromptSuccessHandlerInput["finishPlannerFinalizationSources"];
  finishParentRun: RuntimePromptSuccessHandlerInput["finishParentRun"];
  emitRunEvent: (event: DesktopEvent) => void;
}

export class AgentRuntime {
  private activeRuns = new Map<string, ActiveRun>();
  private activeRunIds = new Map<string, string>();
  private subagentChildExecutions = new Map<string, SubagentChildExecutionRecord>();
  private callableWorkflowTaskAbortControllers = new Map<string, AbortController>();
  private callableWorkflowRunTaskIds = new Map<string, string>();
  private workflowPlanEditIntentByThreadId = new Map<string, WorkflowPlanEditIntentKind>();
  private workflowPlanEditWorkflowThreadByThreadId = new Map<string, string>();
  private readonly stalePluginToolThreads = new Set<string>();
  private readonly staleRuntimeSettingsThreads = new Set<string>();
  private readonly ambientCliSkillMountDiagnostics = new Map<string, AmbientCliSkillMountDiagnostics>();
  private readonly ambientCliPackageDescriptionState = new AmbientCliPackageDescriptionState();
  private readonly ambientWorkflowDescriptionState = new AmbientWorkflowDescriptionState();
  private readonly pendingProjectSwitchByThreadId = new Map<string, MessagingRemoteSurfaceCommandPendingProjectSwitch>();
  private readonly remoteSurfaceRuntimeEvents: AgentRuntimeRemoteSurfaceRuntimeEventStore;
  private readonly pluginHost = new AmbientPluginHost();
  private readonly mcpToolOrchestration: AgentRuntimeMcpToolOrchestration;
  private readonly localPreviewServers = new LocalPreviewServerManager();
  private readonly downloadService = new AmbientDownloadService();
  private readonly localModelRuntimeManager = new LocalModelRuntimeManager();
  private localTextSubagentRuntime?: SubagentChildRuntimeAdapter;
  private readonly glmTokenizer: GlmTokenizerService;
  private readonly permissionWaitControls = new Map<string, RuntimePermissionWaitControl>();
  private readonly installRouteGuard = new AgentRuntimeInstallRouteGuard();
  private readonly transientFileAuthorityRoots = new Map<string, TransientFileAuthorityRoot[]>();
  private readonly latestBrowserScreenshotArtifacts = new Map<string, BrowserScreenshotArtifactReference>();
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
    const provider = getAmbientProviderStatus(thread.model);
    const model = ambientModel(thread.model, normalizeAmbientBaseUrl(provider.baseUrl));
    if (normalizeAmbientModelId(session.model?.id) !== normalizeAmbientModelId(thread.model)) {
      await session.setModel(model);
    }
    session.setThinkingLevel(thread.thinkingLevel);
    this.staleRuntimeSettingsThreads.delete(thread.id);
    if (session.sessionFile) {
      await this.commitThreadPiSessionFile({
        threadId: thread.id,
        sessionFile: session.sessionFile,
        currentPiSessionFile: this.store.getThread(thread.id).piSessionFile,
        reason: "model-changed",
        emit: (event) => this.emit(event),
      });
    }
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

  private modelContentForSendInput(input: SendMessageInput): string {
    return modelContentForAgentRuntimeSendInput(input, {
      isSubagentsEnabled: () => isAmbientSubagentsEnabled(this.currentFeatureFlagSnapshot()),
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
      getWorkflowAgentThreadSummary: (workflowThreadId) => this.store.getWorkflowAgentThreadSummary(workflowThreadId),
    });
  }

  private prepareRuntimeSendLoopContext(input: SendMessageInput): RuntimeSendLoopContext {
    const runtimeInput = input as RuntimeSendMessageInput;
    const usesDedicatedReviewSession = runtimeInput.dedicatedSessionKind === "workflow-recording-review";
    const visibleUserContent = runtimeInput.visibleUserContent ?? input.content;

    this.pendingProjectSwitchByThreadId.delete(input.threadId);
    const workflowPlanEditIntent = input.workflowThreadId ? classifyWorkflowPlanEditIntent(input.content) : undefined;
    if (workflowPlanEditIntent) {
      this.workflowPlanEditIntentByThreadId.set(input.threadId, workflowPlanEditIntent.kind);
      this.workflowPlanEditWorkflowThreadByThreadId.set(input.threadId, input.workflowThreadId!);
    }

    const threadSettingsUpdate = runtimeThreadSettingsUpdateFromSendInput(input);
    const thread = hasRuntimeThreadSettingsUpdate(threadSettingsUpdate)
      ? this.store.updateThreadSettings(input.threadId, threadSettingsUpdate)
      : this.store.getThread(input.threadId);
    const plannerFinalizationSources = this.plannerFinalizationSourceArtifactsForPrompt(thread.id, input.content);
    const runWorkspacePath = this.store.getWorkspace().path;
    const modelRuntimeSettingsForRun = usesDedicatedReviewSession
      ? { ...this.store.getModelRuntimeSettings(), aggressiveRetries: true }
      : this.store.getModelRuntimeSettings();
    const piPreStreamTimeoutMs = usesDedicatedReviewSession
      ? WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS
      : modelRuntimeSettingsForRun.providerPreStreamTimeoutMs ?? DEFAULT_MODEL_RUNTIME_PROVIDER_PRE_STREAM_TIMEOUT_MS;
    const piStreamIdleTimeoutMs = usesDedicatedReviewSession
      ? WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS
      : modelRuntimeSettingsForRun.providerStreamIdleTimeoutMs ?? DEFAULT_MODEL_RUNTIME_PROVIDER_STREAM_IDLE_TIMEOUT_MS;
    const defaultToolExecutionIdleTimeoutMs = localToolIdleTimeoutMs();
    const emptyAssistantStallTimeoutMs = usesDedicatedReviewSession
      ? Math.min(CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS, WORKFLOW_RECORDING_REVIEW_STREAM_IDLE_TIMEOUT_MS)
      : CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS;
    const configuredAssistantFinalizationRetryMaxRetries = assistantFinalizationRetryMaxRetriesFromSettings(
      modelRuntimeSettingsForRun,
    );
    const retryUserMessage = input.retryOfMessageId
      ? this.store.listMessages(input.threadId).find((message) => message.id === input.retryOfMessageId)
      : undefined;
    if (input.retryOfMessageId && (!retryUserMessage || retryUserMessage.role !== "user")) {
      throw new Error("Retry target user message was not found.");
    }

    let promptContent = runtimeInput.modelContentOverride ?? this.modelContentForSendInput(input);
    if (!usesDedicatedReviewSession) promptContent = appendSearchRoutingGuidance(promptContent, this.features.search?.readSettings());
    if (!usesDedicatedReviewSession) promptContent = appendMcpInstallRouteGuidance(promptContent, visibleUserContent);
    const messagesBeforePrompt = this.store.listMessages(input.threadId);
    const shouldInjectBootstrap =
      !input.retryOfMessageId && !thread.piSessionFile && messagesBeforePrompt.length === 0 && input.delivery !== "follow-up";
    let retrySourceUserMessageId = retryUserMessage?.id;

    if (retryUserMessage) {
      this.emit({ type: "thread-updated", thread: this.store.markThreadRead(input.threadId) });
    } else if (runtimeInput.hiddenUserMessage) {
      this.emit({
        type: "runtime-activity",
        activity: goalRuntimeActivity({
          threadId: input.threadId,
          status: "continuing",
          message: visibleUserContent,
          goalId: runtimeInput.goalContinuation?.goalId,
        }),
      });
    } else {
      const userMessage = this.store.addMessage({
        threadId: input.threadId,
        role: "user",
        content: visibleUserContent,
        metadata: agentRuntimeUserMessageMetadata(input, { dedicatedSessionKind: runtimeInput.dedicatedSessionKind }),
      });
      retrySourceUserMessageId = userMessage.id;
      this.emit({ type: "message-created", message: userMessage });
      this.emit({ type: "thread-updated", thread: this.store.markThreadRead(input.threadId) });
      this.generateTitleIfNeeded(thread, visibleUserContent);
    }

    const activeAssistantFinalizationRetry =
      runtimeInput.assistantFinalizationRetry?.sourceUserMessageId === retrySourceUserMessageId
        ? runtimeInput.assistantFinalizationRetry
        : undefined;
    const assistantFinalizationRetryMaxRetries = Math.max(
      configuredAssistantFinalizationRetryMaxRetries,
      activeAssistantFinalizationRetry?.maxRetries ?? 0,
    );
    const interruptedToolCallRecoveryMaxRetries =
      runtimeInput.interruptedToolCallRecovery?.maxRetries ?? DEFAULT_INTERRUPTED_TOOL_CALL_RECOVERY_MAX_RETRIES;
    const interruptedToolCallRecoveryAttemptsUsed = Math.min(
      runtimeInput.interruptedToolCallRecovery?.attempt ?? 0,
      interruptedToolCallRecoveryMaxRetries,
    );
    const canScheduleInterruptedToolCallRecovery =
      !usesDedicatedReviewSession && interruptedToolCallRecoveryAttemptsUsed < interruptedToolCallRecoveryMaxRetries;

    return {
      runtimeInput,
      usesDedicatedReviewSession,
      visibleUserContent,
      hasWorkflowPlanEditIntent: Boolean(workflowPlanEditIntent),
      thread,
      plannerFinalizationSources,
      runWorkspacePath,
      modelRuntimeSettingsForRun,
      piPreStreamTimeoutMs,
      piStreamIdleTimeoutMs,
      defaultToolExecutionIdleTimeoutMs,
      emptyAssistantStallTimeoutMs,
      promptContent,
      shouldInjectBootstrap,
      retrySourceUserMessageId,
      activeAssistantFinalizationRetry,
      assistantFinalizationRetryMaxRetries,
      interruptedToolCallRecoveryMaxRetries,
      interruptedToolCallRecoveryAttemptsUsed,
      canScheduleInterruptedToolCallRecovery,
    };
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
    const activeRunHandoffHandled = await handleRuntimeActiveRunHandoff({
      sendInput: input,
      incomingDedicatedSessionKind: incomingRuntimeInput.dedicatedSessionKind,
      activeRun: this.activeRuns.get(input.threadId),
      hooks,
      queueDuringRun: (queuedInput, activeRun, delivery) => this.queueDuringRun(queuedInput, activeRun, delivery),
    });
    if (activeRunHandoffHandled) return;

    const sendLoop = this.prepareRuntimeSendLoopContext(input);
    const {
      runtimeInput,
      usesDedicatedReviewSession,
      visibleUserContent,
      hasWorkflowPlanEditIntent,
      thread,
      plannerFinalizationSources,
      runWorkspacePath,
      modelRuntimeSettingsForRun,
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
    const subagentPreflight = explicitSubagentRequestPreflight({
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

    const runtimeModel = input.model ?? thread.model;
    const mainModelRuntimeProfile = this.resolveMainModelRuntimeProfile(runtimeModel);
    if (this.canUseLocalTextMainRuntime(mainModelRuntimeProfile, usesDedicatedReviewSession)) {
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
      baseInput: input,
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
      abortSessionRun,
      markSubagentParentControlBarrierReconciled: (reconcileInput) =>
        this.store.markSubagentParentControlBarrierReconciled(reconcileInput),
      cascadeSubagentsForStoppedParentRun: (threadId, runId, reason) =>
        this.cascadeSubagentsForStoppedParentRun(threadId, runId, reason),
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
      baseInput: input,
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

    const reconcileQueueUpdate = (steering: string[], followUp: string[]) => {
      queuedMessages.reconcileQueueUpdate(steering, followUp);
    };
    const cleanupCurrentSession = (options: { clearPersistedSessionFileIfCurrent?: boolean } = {}) => cleanupRuntimeSession({
      session,
      removeActiveSessionIfCurrent: (cleanupSession) => {
        if (activeSessions.get(input.threadId) !== cleanupSession) return false;
        activeSessions.delete(input.threadId);
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

    try {
      session = usesDedicatedReviewSession
        ? await this.createWorkflowRecordingReviewSession(thread)
        : await this.getSession(thread, runtimeInput.sessionRecovery);
      if (!isRunStoreActive()) return;
      if (isAbortRequested()) {
        await abortSessionRun(session, input.threadId);
        throw new Error("Run stopped.");
      }

      let finalizeAssistantTerminalRun: (pendingCompletion?: Promise<unknown>) => Promise<void> = async () => {
        throw new Error("Assistant terminal finalization requested before prompt start.");
      };
      const promptControllers = createRuntimePromptControllerSetup({
        threadId: input.threadId,
        runId: run.id,
        defaultToolExecutionIdleTimeoutMs,
        toolArgumentIdleTimeoutMs: piStreamIdleTimeoutMs,
        emptyAssistantStallTimeoutMs,
        assistantTerminalGraceMs: ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS,
        postToolContinuationIdleMs: POST_TOOL_CONTINUATION_IDLE_MS,
        postToolFinalizationIdleMs: POST_TOOL_FINALIZATION_IDLE_MS,
        postToolFinalizationTickMs: POST_TOOL_FINALIZATION_TICK_MS,
        assistantFinalizationRetryMaxRetries,
        isRunStoreActive,
        isPermissionWaiting: () => permissionWaits.isWaiting(),
        pauseStreamWatchdog: () => {
          streamWatchdog?.pause();
        },
        resumeStreamWatchdog: () => {
          streamWatchdog?.resume();
        },
        resetStreamWatchdog: () => {
          streamWatchdog?.reset();
        },
        abortSessionRun: () => {
          if (session) void abortSessionRun(session, input.threadId).catch(() => undefined);
        },
        signalToolExecutionTimeout: promptLifecycleControls.signalToolExecutionTimeout,
        signalStreamWatchdogTimeout: promptLifecycleControls.signalStreamWatchdogTimeout,
        streamWatchdogCompletion: promptLifecycleControls.streamWatchdogCompletion,
        isStreamTimedOut: promptControlState.isStreamTimedOut,
        markStreamTimedOut: promptControlState.markStreamTimedOut,
        setStreamTimeoutMessage: promptControlState.setStreamWatchdogTimeoutMessage,
        streamTimeoutMessage: currentPiStreamTimeoutMessage,
        persistPiStreamTrace,
        toolArgumentProgress,
        forceInterruptedToolCallRecovery,
        getOutputChars: outputState.assistantOutputChars,
        getThinkingChars: outputState.thinkingOutputChars,
        hasAssistantText: outputState.hasAssistantText,
        getAssistantStartCount: runtimeMessages.assistantStartCount,
        getReceivedAnyText: outputState.receivedAnyText,
        getCurrentAssistantReceivedText: outputState.currentAssistantReceivedText,
        getCurrentAssistantFinalText: outputState.currentAssistantFinalText,
        getStreamEventCount: () => piStreamActivity.snapshot().eventCount,
        getSessionFile: () => session?.sessionFile,
        getMessages: () => this.store.listMessages(input.threadId),
        getRunEventSeq: promptControlState.runEventSeq,
        steerContinuation: (prompt) => session!.steer(prompt),
        finalizeAssistantTerminalRun: (pendingCompletion) => finalizeAssistantTerminalRun(pendingCompletion),
        emitRunEvent,
      });
      const activeToolExecutionWatchdog = promptControllers.toolExecutionWatchdog;
      toolExecutionWatchdog = activeToolExecutionWatchdog;
      const activeToolArgumentWatchdog = promptControllers.toolArgumentWatchdog;
      toolArgumentWatchdog = activeToolArgumentWatchdog;
      emptyAssistantStallWatchdog = promptControllers.emptyAssistantStallWatchdog;
      assistantTerminalCompletion = promptControllers.assistantTerminalCompletion;
      const markPiStreamActivity = (forceProgress = false, event?: unknown) => {
        piStreamActivity.markActivity(forceProgress, event);
      };
      await this.preflightBeforePrompt(
        thread,
        session,
        promptContent,
        promptLifecycleControls.setActiveRunStatus,
        isRunStoreActive,
        emitRunEvent,
      );
      if (!isRunStoreActive()) return;
      const promptRunState = promptControllers.promptRunState;
      const postToolContinuation = promptControllers.postToolContinuation;
      const streamEventDispatcher = createRuntimePromptStreamDispatcherSetup({
        threadId: input.threadId,
        assistantTerminalGraceMs: ASSISTANT_TERMINAL_TEXT_IDLE_GRACE_MS,
        outputState,
        promptRunState,
        providerRetryState,
        runtimeMessages,
        emptyAssistantStallWatchdog,
        assistantTerminalCompletion,
        postToolContinuation,
        toolMessages,
        markPiStreamActivity: () => markPiStreamActivity(),
        setActiveRunStatus: promptLifecycleControls.setActiveRunStatus,
        reconcileQueueUpdate,
        recordContextUsageSnapshot: (snapshotMessage) => {
          if (session) this.recordContextUsageSnapshot(input.threadId, session, snapshotMessage);
        },
        emitRunEvent,
      });
      markOpenToolMessagesFailed = (reason: RuntimeOpenToolFailureReason) => {
        if (toolMessages.markOpenToolMessagesFailed(reason) > 0) persistToolArgumentDiagnostics(true);
      };
      const toolEventDispatcher = createRuntimeToolEventDispatcherSetup({
        threadId: input.threadId,
        runId: run.id,
        workspacePath: thread.workspacePath,
        permissionMode: thread.permissionMode,
        toolMessages,
        toolArgumentProgress,
        toolArgumentWatchdog: activeToolArgumentWatchdog,
        toolExecutionWatchdog: activeToolExecutionWatchdog,
        postToolContinuation,
        startedToolCallIds,
        emptyAssistantStallWatchdog,
        assistantTerminalCompletion,
        streamTraceState,
        toolRecovery,
        promptLifecycleControls,
        promptRunState,
        requestSubagentParentControlAbort,
        refreshBrowsersForArtifactChange: (threadId, workspacePath, artifactPath) =>
          this.refreshBrowsersForArtifactChange(threadId, workspacePath, artifactPath),
      });

      const unsubscribe = subscribeRuntimePromptEvents({
        subscribe: (handler) => session!.subscribe(handler as (event: any) => void),
        markRunActivity,
        incrementRunEventSeq: promptControlState.incrementRunEventSeq,
        markPostToolEvent: postToolContinuation.markEvent,
        recordPiStreamTraceEvent,
        markPiStreamActivity,
        streamEventDispatcher,
        toolEventDispatcher,
      });

      const promptExecution = createRuntimePromptExecutionSetup({
        threadId: input.threadId,
        session,
        promptContent,
        images: promptImageInputs.images,
        promptControlState,
        streamTimeoutMessage: currentPiStreamTimeoutMessage,
        streamTraceState,
        assistantTerminalCompletion,
        outputState,
        streamIdleTimeoutMs: piStreamIdleTimeoutMs,
        abortGraceMs: POST_TOOL_ABORT_GRACE_MS,
        promptRunState,
        abortSessionRun: (cleanupSession, threadId) => abortSessionRun(cleanupSession as PiSession, threadId),
        removeActiveSessionIfCurrent: (cleanupSession) => {
          if (activeSessions.get(input.threadId) === cleanupSession) activeSessions.delete(input.threadId);
        },
        emitRunEvent,
      });
      finalizeAssistantTerminalRun = promptExecution.finalizeAssistantTerminalRun;
      const promptCompletionLoop = await runRuntimePromptCompletionSetup<PiSession>({
        threadId: input.threadId,
        preStreamTimeoutMs: piPreStreamTimeoutMs,
        idleTimeoutMs: piStreamIdleTimeoutMs,
        session,
        isRunStoreActive,
        permissionWaits,
        toolExecutionWatchdog: activeToolExecutionWatchdog,
        toolArgumentWatchdog: activeToolArgumentWatchdog,
        emptyAssistantStallWatchdog,
        promptControlState,
        persistPiStreamTrace,
        outputState,
        streamActivity: piStreamActivity,
        abortSessionRun,
        promptLifecycleControls,
        emitRunEvent,
        setStreamWatchdog: (controller) => {
          streamWatchdog = controller;
        },
        queuedMessages,
        promptExecution,
        postToolContinuation,
        assistantTerminalCompletion,
        promptRunState,
        streamTimeoutMessage: currentPiStreamTimeoutMessage,
        finalizeAssistantTerminalRun: () => finalizeAssistantTerminalRun(),
        unsubscribePromptEvents: unsubscribe,
      });
      promptRunState.setFinalizedAfterToolIdle(promptCompletionLoop.finalizedAfterToolIdle);
      if (!isRunStoreActive()) return;

      const providerRetry = providerRetryState.snapshot();
      const promptRun = promptRunState.snapshot();
      const promptSuccess = await this.handlePromptSuccess({
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
      pendingFollowUps.applyPromptSuccess(promptSuccess);
    } catch (error) {
      await handleRuntimePromptFailure({
        error,
        threadId: input.threadId,
        workspacePath: runWorkspacePath,
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
        replaceToolMessage: (messageId, content, metadata) => this.store.replaceMessage(messageId, content, metadata),
        finishPlannerFinalizationSources,
        finishParentRun,
        chatStreamInterruptionDiagnostic,
        chatStreamInterruptionNotice,
        emitRunEvent,
      });
    } finally {
      const pendingFollowUpsSnapshot = pendingFollowUps.snapshot();
      await this.finalizeSendAfterRun({
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

  private async handlePromptSuccess(
    input: HandleAgentRuntimePromptSuccessInput,
  ): Promise<{
    pendingEmptyResponseRetry?: RuntimeSendMessageInput | undefined;
    pendingPlannerRepairFollowUp?: SendMessageInput | undefined;
  }> {
    const emptyAssistantRetryReason: AssistantFinalizationRetryReason = "empty_assistant_response";
    const currentThread = this.store.getThread(input.sendInput.threadId);
    const result = await handleRuntimePromptSuccess({
      threadId: input.sendInput.threadId,
      runId: input.runId,
      workspacePath: input.runWorkspacePath,
      currentAssistantMessageId: input.runtimeMessages.currentAssistantMessageId(),
      runtimeError: input.runtimeError,
      abortRequested: input.abortRequested,
      finalizedAfterToolIdle: input.finalizedAfterToolIdle,
      currentThinkingFinalText: input.currentThinkingFinalText,
      currentAssistantFinalText: input.currentAssistantFinalText,
      currentAssistantVisibleContent: input.runtimeMessages.currentMessageContent(
        input.runtimeMessages.currentAssistantMessageId(),
        input.currentAssistantFinalText,
      ),
      receivedAnyText: input.receivedAnyText,
      activeToolMessageCount: input.toolMessages.size(),
      pendingEmptyResponseRetryDelayMs: input.pendingEmptyResponseRetryDelayMs,
      activeRetryReason: input.activeRetryReason,
      retrySourceUserMessageId: input.retrySourceUserMessageId,
      sessionFile: input.session.sessionFile,
      lastAssistantTerminalEvent: input.lastAssistantTerminalEvent,
      assistantTerminalCleanupDiagnostic: input.assistantTerminalCleanupDiagnostic,
      subagentParentControlAbortIntent: input.subagentParentControlAbortIntent,
      providerRetryBeforeVisibleOutput: input.providerRetryBeforeVisibleOutput,
      providerRetryRecovered: input.providerRetryRecovered,
      providerRetryAttemptCount: input.providerRetryAttemptCount,
      providerRetryLastError: input.providerRetryLastError,
      usesDedicatedReviewSession: input.usesDedicatedReviewSession,
      currentThreadPiSessionFile: currentThread.piSessionFile,
      hasPlannerFinalizationSources: input.plannerFinalizationSources.length > 0,
      assistantFinalizationRetryMaxRetries: input.assistantFinalizationRetryMaxRetries,
      canScheduleEmptyAssistantRetry: input.canScheduleAssistantFinalizationRetryFor(emptyAssistantRetryReason),
      emptyAssistantRetryAttemptsUsed: input.assistantFinalizationRetryAttemptsUsedFor(emptyAssistantRetryReason),
      emptyAssistantRetryNextAttempt: input.assistantFinalizationRetryNextAttemptFor(emptyAssistantRetryReason),
      consumeSubagentParentControlAbort: input.consumeSubagentParentControlAbort,
      finishCurrentThinkingMessage: input.runtimeMessages.finishCurrentThinkingMessage,
      recordContextUsageSnapshot: () => this.recordContextUsageSnapshot(input.sendInput.threadId, input.session),
      cleanupCurrentSession: input.cleanupCurrentSession,
      createEmptyAssistantRetry: () => input.createAssistantFinalizationRetryInput(emptyAssistantRetryReason),
      clearThreadPiSessionFile: () => {
        input.emitRunEvent({
          type: "thread-updated",
          thread: this.store.updateThreadSettings(input.sendInput.threadId, { piSessionFile: null }),
        });
      },
      commitThreadPiSessionFile: async (commitInput) => {
        await this.commitThreadPiSessionFile({
          threadId: input.sendInput.threadId,
          sessionFile: commitInput.sessionFile,
          currentPiSessionFile: commitInput.currentPiSessionFile,
          reason: commitInput.reason,
          emit: input.emitRunEvent,
        });
      },
      createPlannerRepairFollowUp: (prompt) => {
        const repairThread = this.store.getThread(input.sendInput.threadId);
        return {
          threadId: input.sendInput.threadId,
          content: prompt,
          permissionMode: repairThread.permissionMode,
          collaborationMode: "planner",
          model: repairThread.model,
          thinkingLevel: repairThread.thinkingLevel,
          delivery: "follow-up",
          preserveActiveThread: true,
        };
      },
      resolveSubagentFinalizationBlock: () => this.subagentFinalizationBarrierBlock(input.sendInput.threadId, input.runId),
      resolveCallableWorkflowFinalizationBlock: () => this.callableWorkflowFinalizationBlock(input.sendInput.threadId, input.runId),
      recordSubagentFinalizationBlockedParentMailbox: (block) =>
        this.recordSubagentFinalizationBlockedParentMailbox(input.sendInput.threadId, input.runId, block),
      recordCallableWorkflowFinalizationBlockedParentMailbox: (block) =>
        this.recordCallableWorkflowFinalizationBlockedParentMailbox(input.sendInput.threadId, input.runId, block),
      replaceAssistantMessage: (messageId, content, metadata) => this.store.replaceMessage(messageId, content, metadata),
      createPlannerPlanArtifactFromMessage: (message) => this.createPlannerPlanArtifactFromMessage(message),
      finishPlannerFinalizationSources: input.finishPlannerFinalizationSources,
      finishParentRun: input.finishParentRun,
      recordVoiceDispatch: (message) => this.recordVoiceDispatch(message),
      getThread: () => this.store.getThread(input.sendInput.threadId),
      emitRunEvent: input.emitRunEvent,
    });
    return {
      pendingEmptyResponseRetry: result.pendingEmptyResponseRetry as RuntimeSendMessageInput | undefined,
      pendingPlannerRepairFollowUp: result.pendingPlannerRepairFollowUp,
    };
  }

  private async finalizeSendAfterRun(input: FinalizeAgentRuntimeSendAfterRunInput): Promise<void> {
    await finalizeRuntimeSendAfterRun({
      threadId: input.sendInput.threadId,
      workspacePath: input.runWorkspacePath,
      runGoalId: input.runGoalId,
      runGoalStartedAtMs: input.runGoalStartedAtMs,
      promptChars: input.promptContent.length,
      assistantChars: input.currentAssistantFinalText.length + input.assistantOutputChars,
      thinkingChars: input.currentThinkingFinalText.length + input.thinkingOutputChars,
      toolMessageCount: input.toolMessages.size(),
      abortRequested: input.abortRequested,
      pendingPlannerRepairFollowUp: input.pendingPlannerRepairFollowUp,
      pendingInterruptedToolCallRecoveryFollowUp: input.pendingInterruptedToolCallRecoveryFollowUp,
      pendingProviderInterruptionContinuation: input.pendingProviderInterruptionContinuation,
      pendingEmptyResponseRetry: input.pendingEmptyResponseRetry,
      pendingEmptyResponseRetryDelayMs: input.pendingEmptyResponseRetryDelayMs,
      awaitInternalRetryCompletion: Boolean(input.hooks.awaitInternalRetryCompletion),
      hasWorkflowPlanEditIntent: input.hasWorkflowPlanEditIntent,
      hasDedicatedReviewSession: input.usesDedicatedReviewSession && Boolean(input.session),
      isRunStoreActive: input.isRunStoreActive,
      clearActiveRun: () => {
        this.activeRuns.delete(input.sendInput.threadId);
      },
      clearActiveRunId: () => {
        this.activeRunIds.delete(input.sendInput.threadId);
      },
      clearPermissionWaitControl: () => {
        this.permissionWaitControls.delete(input.sendInput.threadId);
      },
      clearToolArgumentWatchdog: () => {
        input.toolArgumentWatchdog?.clear();
      },
      clearToolExecutionWatchdog: () => {
        input.toolExecutionWatchdog?.clear();
      },
      cleanupDedicatedReviewSession: input.cleanupCurrentSession,
      clearWorkflowPlanEditIntent: () => {
        this.workflowPlanEditIntentByThreadId.delete(input.sendInput.threadId);
        this.workflowPlanEditWorkflowThreadByThreadId.delete(input.sendInput.threadId);
      },
      takePendingProjectSwitch: () => {
        const pendingProjectSwitch = this.pendingProjectSwitchByThreadId.get(input.sendInput.threadId);
        this.pendingProjectSwitchByThreadId.delete(input.sendInput.threadId);
        return pendingProjectSwitch;
      },
      updateRuntimeEvent: (eventId, patch) => this.remoteSurfaceRuntimeEvents.update(eventId, patch),
      scheduleProjectSwitchCompletion: (projectSwitch) => {
        setTimeout(() => {
          void this.completePendingRemoteProjectSwitch(projectSwitch, {
            threadId: input.sendInput.threadId,
            workspacePath: input.runWorkspacePath,
          });
        }, 0);
      },
      getRunRecord: () => {
        try {
          return this.store.getRunRecord(input.runId);
        } catch {
          return undefined;
        }
      },
      hasQueuedUserInput: () => input.queuedMessages.hasQueuedOrSentInput(),
      accountFinishedGoalRun: (accountInput) => this.accountFinishedGoalRun(accountInput),
      scheduleGoalContinuation: (threadId, goalId, delayMs) => this.scheduleGoalContinuation(threadId, goalId, delayMs),
      schedulePlannerDurableRepairFollowUp: (followUp, workspacePath) =>
        this.schedulePlannerDurableRepairFollowUp(followUp, workspacePath),
      send: (followUp, followUpHooks) => this.send(followUp, followUpHooks),
      emitError: (message, threadId, workspacePath) => this.emit({ type: "error", message, threadId, workspacePath }),
      emitRunEvent: input.emitRunEvent,
      resolveActiveRunSettled: () => {
        input.resolveActiveRunSettled?.();
      },
    });
  }

  private accountFinishedGoalRun(input: AccountFinishedGoalRunInput): ThreadGoal | undefined {
    const seconds = Math.max(0, Math.ceil((Date.now() - input.startedAtMs) / 1000));
    const tokenEstimate = Math.max(1, Math.ceil((input.promptChars + input.assistantChars + input.thinkingChars) / 4));
    const noProgress = input.toolMessageCount === 0 && input.assistantChars < 40;
    const accounted = this.store.accountThreadGoalUsage({
      threadId: input.threadId,
      goalId: input.goalId,
      tokensUsedDelta: tokenEstimate,
      timeUsedSecondsDelta: seconds,
      noProgressTurnDelta: noProgress ? 1 : 0,
    });
    if (!accounted) return undefined;
    let goal = accounted;
    if (input.abortRequested && goal.status === "active") {
      goal = this.store.markThreadGoalStatus(input.threadId, "paused", {
        expectedGoalId: input.goalId,
        statusReason: "Paused because the user stopped the active run.",
      });
      this.emit({
        type: "runtime-activity",
        activity: goalRuntimeActivity({
          threadId: input.threadId,
          status: "paused",
          message: "Goal paused because the active run was stopped.",
          goalId: goal.goalId,
        }),
      });
    }
    const failedTerminalRun = input.runStatus === "error" || input.runStatus === "interrupted" || input.runStatus === "aborted";
    if (!input.abortRequested && failedTerminalRun && goal.status === "active") {
      const detail = input.runErrorMessage?.trim().slice(0, 240);
      const statusReason =
        input.runStatus === "interrupted"
          ? "Paused because the active run was interrupted."
          : detail
            ? `Paused because the goal run failed: ${detail}`
            : "Paused because the goal run failed.";
      goal = this.store.markThreadGoalStatus(input.threadId, "paused", {
        expectedGoalId: input.goalId,
        statusReason,
      });
      this.emit({
        type: "runtime-activity",
        activity: goalRuntimeActivity({
          threadId: input.threadId,
          status: "paused",
          message: statusReason,
          goalId: goal.goalId,
        }),
      });
    }
    this.emit({ type: "thread-goal-updated", goal });
    if (goal.status === "complete") return this.finalizeCompletedThreadGoal(goal);
    return goal;
  }

  private finalizeCompletedThreadGoal(goal: ThreadGoal): ThreadGoal {
    const current = this.store.getThreadGoal(goal.threadId);
    if (!current || current.goalId !== goal.goalId) return goal;
    if (current.status !== "complete") return current;
    const message = this.store.addMessage({
      threadId: current.threadId,
      role: "assistant",
      content: goalCompletionChatMessage(current),
      metadata: {
        runtime: "ambient-goal-mode",
        kind: GOAL_COMPLETION_MESSAGE_KIND,
        status: "done",
        goalId: current.goalId,
        objective: current.objective,
        tokensUsed: current.tokensUsed,
        timeUsedSeconds: current.timeUsedSeconds,
        completedAt: current.completedAt,
      },
    });
    this.emit({ type: "message-created", message });
    const cleared = this.store.clearThreadGoal(current.threadId, current.goalId);
    this.emit({ type: "thread-goal-cleared", threadId: current.threadId, goalId: cleared?.goalId ?? current.goalId });
    return current;
  }

  private scheduleGoalContinuation(threadId: string, expectedGoalId: string, delayMs = 0): void {
    setTimeout(() => {
      void this.maybeContinueGoalIfIdle(threadId, expectedGoalId).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emit({ type: "error", message: `Goal continuation failed: ${message}`, threadId });
      });
    }, delayMs);
  }

  continueGoalIfIdle(threadId: string, expectedGoalId: string, delayMs = 0): void {
    this.scheduleGoalContinuation(threadId, expectedGoalId, delayMs);
  }

  private async maybeContinueGoalIfIdle(threadId: string, expectedGoalId: string): Promise<void> {
    if (this.activeRuns.has(threadId)) return;
    const thread = this.store.getThread(threadId);
    if (thread.collaborationMode === "planner") return;
    const goal = this.store.getThreadGoal(threadId);
    if (!goal || goal.goalId !== expectedGoalId || goal.status !== "active") return;
    if (goal.tokenBudget !== undefined && goal.tokensUsed >= goal.tokenBudget) {
      const stopped = this.store.markThreadGoalStatus(threadId, "budget_limited", {
        expectedGoalId,
        statusReason: "Goal token budget reached.",
      });
      this.emit({ type: "thread-goal-updated", goal: stopped });
      return;
    }
    if (goal.continuationTurns >= GOAL_MAX_CONTINUATION_TURNS) {
      const stopped = this.store.markThreadGoalStatus(threadId, "usage_limited", {
        expectedGoalId,
        statusReason: `Paused after ${GOAL_MAX_CONTINUATION_TURNS} automatic continuation turns.`,
      });
      this.emit({ type: "thread-goal-updated", goal: stopped });
      return;
    }
    if (goal.noProgressTurns >= GOAL_NO_PROGRESS_TURN_LIMIT) {
      const paused = this.store.markThreadGoalStatus(threadId, "paused", {
        expectedGoalId,
        statusReason: `Paused after ${GOAL_NO_PROGRESS_TURN_LIMIT} no-progress turns.`,
      });
      this.emit({ type: "thread-goal-updated", goal: paused });
      return;
    }
    const updated = this.store.accountThreadGoalUsage({
      threadId,
      goalId: expectedGoalId,
      continuationTurnDelta: 1,
      statusReason: null,
    });
    if (!updated || updated.status !== "active") return;
    this.emit({ type: "thread-goal-updated", goal: updated });
    const prompt = this.goalContinuationPrompt(thread, updated);
    this.emit({
      type: "runtime-activity",
      activity: goalRuntimeActivity({
        threadId,
        status: "continuing",
        message: "Continuing goal...",
        goalId: updated.goalId,
      }),
    });
    await this.send({
      threadId,
      content: prompt,
      visibleUserContent: "Continuing goal...",
      modelContentOverride: prompt,
      hiddenUserMessage: true,
      goalContinuation: { goalId: updated.goalId },
      permissionMode: thread.permissionMode,
      collaborationMode: "agent",
      model: thread.model,
      thinkingLevel: thread.thinkingLevel,
      delivery: "follow-up",
      preserveActiveThread: true,
      internal: true,
    } as RuntimeSendMessageInput);
  }

  private goalContinuationPrompt(thread: ThreadSummary, goal: ThreadGoal): string {
    return buildGoalContinuationPrompt(thread, goal);
  }

  private async queueDuringRun(
    input: SendMessageInput,
    activeRun: ActiveRun,
    delivery: Exclude<MessageDelivery, "prompt">,
  ): Promise<void> {
    const runtimeInput = input as RuntimeSendMessageInput;
    const usesDedicatedReviewSession = runtimeInput.dedicatedSessionKind === "workflow-recording-review";
    const threadSettingsUpdate = runtimeThreadSettingsUpdateFromSendInput(input);
    const thread = hasRuntimeThreadSettingsUpdate(threadSettingsUpdate)
      ? this.store.updateThreadSettings(input.threadId, threadSettingsUpdate)
      : this.store.getThread(input.threadId);
    if (input.model !== undefined) await this.applyThreadModelSettings(input.threadId);
    const imageInputs = await resolveAgentRuntimeImageInputs({
      sendInput: input,
      workspacePath: thread.workspacePath,
      modelProfile: resolveAmbientModelRuntimeProfile(thread.model),
    });
    const queuedMessage = this.store.addMessage({
      threadId: input.threadId,
      role: "user",
      content: input.content,
      metadata: agentRuntimeUserMessageMetadata(input, {
        delivery,
        dedicatedSessionKind: runtimeInput.dedicatedSessionKind,
        includeWorkflowRecordingEditContext: false,
      }),
    });
    this.emit({ type: "message-created", message: queuedMessage });
    this.emit({ type: "thread-updated", thread: this.store.markThreadRead(input.threadId) });
    await activeRun.queue({
      id: queuedMessage.id,
      content: input.content,
      modelContent: runtimeInput.modelContentOverride ?? this.modelContentForSendInput(input),
      context: input.context,
      workflowThreadId: input.workflowThreadId,
      stt: input.stt,
      ...(imageInputs.images.length ? { imageInputs: imageInputs.images } : {}),
      delivery,
      status: "queued",
    });
  }

  async abort(threadId: string, options: { skipSubagentChildCancellation?: boolean } = {}): Promise<void> {
    const parentRunId = this.activeRunIds.get(threadId);
    await this.activeRuns.get(threadId)?.abort();
    if (!options.skipSubagentChildCancellation) {
      this.cancelSubagentRunForStoppedChildThread(threadId, "Sub-agent child thread stopped by user.");
    }
    if (parentRunId) await this.cascadeSubagentsForStoppedParentRun(threadId, parentRunId, "Parent run stopped by user.");
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

  private cancelSubagentRunForStoppedChildThread(threadId: string, reason: string): SubagentRunSummary | undefined {
    let thread: ThreadSummary;
    try {
      thread = this.store.getThread(threadId);
    } catch {
      return undefined;
    }
    if (thread.kind !== "subagent_child" || !thread.subagentRunId) return undefined;
    const current = this.store.getSubagentRun(thread.subagentRunId);
    if (current.closedAt || isSubagentTerminalStatus(current.status)) return current;
    const previousSequence = this.latestSubagentRunEventSequence(current.id);
    const resultArtifact = {
      schemaVersion: "ambient-subagent-result-artifact-v1" as const,
      runId: current.id,
      status: "cancelled" as const,
      partial: false,
      summary: reason,
      childThreadId: current.childThreadId,
    };
    const cancelled = this.store.markSubagentRunStatus(current.id, "cancelled", {
      resultArtifact,
    });
    const cancelledMailbox = cancelPendingParentToChildMailboxEvents(this.store, {
      runId: cancelled.id,
    });
    this.store.appendSubagentMailboxEvent(cancelled.id, {
      direction: "child_to_parent",
      type: "subagent.cancelled",
      payload: {
        status: "cancelled",
        reason,
        source: "child_stop",
        childThreadId: cancelled.childThreadId,
      },
    });
    this.store.appendSubagentRunEvent(cancelled.id, {
      type: "subagent.child_stopped",
      preview: {
        previousStatus: current.status,
        status: "cancelled",
        reason,
        source: "direct_child_stop",
        childThreadId: cancelled.childThreadId,
        parentThreadId: cancelled.parentThreadId,
        parentRunId: cancelled.parentRunId,
        cancelledMailboxEvents: cancelledMailbox.events.map((event) => ({
          id: event.id,
          type: event.type,
          direction: event.direction,
          deliveryState: event.deliveryState,
        })),
      },
    });
    const parentMailboxEvent = this.store.appendSubagentLifecycleInterruptionParentMailboxEvent({
      run: cancelled,
      previousStatus: current.status,
      source: "direct_child_stop",
      reason,
      resultArtifact,
      waitBarrierIds: this.store
        .listSubagentWaitBarriersForParentRun(cancelled.parentRunId)
        .filter((barrier) => barrier.status === "waiting_on_children" && barrier.childRunIds.includes(cancelled.id))
        .map((barrier) => barrier.id),
      cancelledMailboxEventIds: cancelledMailbox.events.map((event) => event.id),
    });
    this.emitSubagentParentMailboxEventUpdated(parentMailboxEvent);
    const childMessage = this.store.addMessage({
      threadId: cancelled.childThreadId,
      role: "system",
      content: `Sub-agent stopped by user.\n\nReason: ${reason}`,
      metadata: {
        runtime: "ambient-subagent-runtime",
        phase: "direct-child-stop",
        status: "cancelled",
        subagentRunId: cancelled.id,
        resultArtifact,
      },
    });
    this.emitSubagentRunAndChildThreadUpdated(cancelled);
    this.emitSubagentRunEventsSince(cancelled, previousSequence);
    this.emit({ type: "message-created", message: childMessage as ChatMessage });
    this.emit({ type: "thread-updated", thread: this.store.getThread(cancelled.childThreadId) });
    this.resolveCancelledDirectChildWaitBarriers(cancelled, reason);
    this.emit({
      type: "runtime-activity",
      activity: runtimeSubagentDirectChildStoppedActivity({
        threadId: cancelled.parentThreadId,
        canonicalTaskPath: cancelled.canonicalTaskPath,
      }),
    });
    return this.store.getSubagentRun(cancelled.id);
  }

  private resolveCancelledDirectChildWaitBarriers(run: SubagentRunSummary, reason: string): void {
    const waitBarriers = resolveActiveSubagentWaitBarriersForRun({
      store: this.store,
      run,
      evidence: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
        kind: "child_cancelled",
        source: "cancel_agent",
        childRunId: run.id,
        reason,
        idempotencyKey: `direct-child-stop:${run.id}`,
      },
    });
    for (const barrier of waitBarriers) this.emitSubagentWaitBarrierUpdated(barrier);
  }

  private resolveTerminalChildWaitBarriers(run: SubagentRunSummary, reason: string): void {
    const waitBarriers = resolveActiveSubagentWaitBarriersForRun({
      store: this.store,
      run,
      evidence: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
        kind: run.status === "timed_out" ? "child_runtime_timeout" : "child_terminal",
        source: "child_runtime",
        childRunId: run.id,
        reason,
        idempotencyKey: `child-terminal:${run.id}:${run.status}:${run.updatedAt ?? ""}`,
      },
    });
    for (const barrier of waitBarriers) this.emitSubagentWaitBarrierUpdated(barrier);
  }

  private async cascadeSubagentsForStoppedParentRun(threadId: string, parentRunId: string, reason: string): Promise<void> {
    let cascade: ReturnType<ProjectStore["cascadeSubagentParentRunStopped"]>;
    const previousEventSequences = new Map(
      this.store
        .listAllSubagentRuns()
        .filter((run) => run.parentThreadId === threadId && run.parentRunId === parentRunId)
        .map((run) => [run.id, this.latestSubagentRunEventSequence(run.id)]),
    );
    try {
      cascade = this.store.cascadeSubagentParentRunStopped({
        parentThreadId: threadId,
        parentRunId,
        reason,
        featureFlagSnapshot: this.currentFeatureFlagSnapshot(),
      });
    } catch (error) {
      console.warn(`Failed to cascade stopped parent run ${parentRunId} to sub-agents: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const changedRunIds = [...cascade.cancelledRunIds, ...cascade.detachedRunIds];
    for (const runId of changedRunIds) {
      const run = this.store.getSubagentRun(runId);
      this.emitSubagentRunAndChildThreadUpdated(run);
      this.emitSubagentRunEventsSince(run, previousEventSequences.get(run.id) ?? 0);
    }
    for (const barrierId of cascade.cancelledWaitBarrierIds) {
      this.emitSubagentWaitBarrierUpdated(this.store.getSubagentWaitBarrier(barrierId));
    }
    if (cascade.parentMailboxEventId) {
      this.emitSubagentParentMailboxEventUpdated(this.store.getSubagentParentMailboxEvent(cascade.parentMailboxEventId));
    }
    await this.abortActiveCancelledSubagentChildren(cascade.cancelledRunIds, reason);
    if (!changedRunIds.length && !cascade.cancelledWaitBarrierIds.length) return;
    this.emit({
      type: "runtime-activity",
      activity: runtimeSubagentParentStopCascadeActivity({
        threadId,
        cancelledRunCount: cascade.cancelledRunIds.length,
        detachedRunCount: cascade.detachedRunIds.length,
        changedRunCount: changedRunIds.length,
      }),
    });
  }

  private async abortActiveCancelledSubagentChildren(cancelledRunIds: string[], reason: string): Promise<void> {
    for (const runId of cancelledRunIds) {
      const run = this.store.getSubagentRun(runId);
      if (!this.activeRuns.has(run.childThreadId)) continue;
      try {
        await this.abort(run.childThreadId);
        const previousSequence = this.latestSubagentRunEventSequence(run.id);
        this.store.appendSubagentRunEvent(run.id, {
          type: "subagent.child_runtime_aborted",
          preview: {
            reason,
            childThreadId: run.childThreadId,
            source: "parent_stop_cascade",
          },
        });
        this.emitSubagentRunEventsSince(this.store.getSubagentRun(run.id), previousSequence);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to abort active sub-agent child thread ${run.childThreadId}: ${message}`);
        this.emit({
          type: "error",
          message: `Failed to abort active sub-agent child thread ${run.childThreadId}: ${message}`,
          threadId: run.childThreadId,
          workspacePath: agentRuntimeThreadWorkspacePath(this.store, run.childThreadId),
        });
      }
    }
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
    const plan = runtimeActiveSessionResetPlan(activeSessions.entries(), this.activeRuns);
    for (const action of plan.actions) {
      const { threadId, session } = action;
      if (action.status === "deferred") {
        this.staleRuntimeSettingsThreads.add(threadId);
        this.emit({
          type: "runtime-activity",
          activity: runtimeSettingsActivity(threadId, settings.aggressiveRetries, "deferred"),
        });
        continue;
      }
      session.dispose();
      activeSessions.delete(threadId);
      this.stalePluginToolThreads.delete(threadId);
      this.staleRuntimeSettingsThreads.delete(threadId);
      this.ambientCliSkillMountDiagnostics.delete(threadId);
      this.tencentMemoryRuntimeSnapshots.delete(threadId);
      this.emit({
        type: "runtime-activity",
        activity: runtimeSettingsActivity(threadId, settings.aggressiveRetries, "applied"),
      });
    }
    return plan.result;
  }

  applyFeatureFlags(_snapshot: AmbientFeatureFlagSnapshot): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    const plan = runtimeActiveSessionResetPlan(activeSessions.entries(), this.activeRuns);
    for (const action of plan.actions) {
      const { threadId, session } = action;
      if (action.status === "deferred") {
        this.staleRuntimeSettingsThreads.add(threadId);
        continue;
      }
      session.dispose();
      activeSessions.delete(threadId);
      this.stalePluginToolThreads.delete(threadId);
      this.staleRuntimeSettingsThreads.delete(threadId);
      this.ambientCliSkillMountDiagnostics.delete(threadId);
      this.tencentMemoryRuntimeSnapshots.delete(threadId);
    }
    return plan.result;
  }

  applyMemorySettings(): {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  } {
    const plan = runtimeActiveSessionResetPlan(activeSessions.entries(), this.activeRuns);
    for (const action of plan.actions) {
      const { threadId, session } = action;
      if (action.status === "deferred") {
        this.staleRuntimeSettingsThreads.add(threadId);
        continue;
      }
      session.dispose();
      activeSessions.delete(threadId);
      this.stalePluginToolThreads.delete(threadId);
      this.staleRuntimeSettingsThreads.delete(threadId);
      this.ambientCliSkillMountDiagnostics.delete(threadId);
      this.tencentMemoryRuntimeSnapshots.delete(threadId);
    }
    return plan.result;
  }

  async applyThreadModelSettings(threadId: string): Promise<{
    switchedSessions: number;
    deferredSessions: number;
    switchedThreadIds: string[];
    deferredThreadIds: string[];
  }> {
    const thread = this.store.getThread(threadId);
    const session = activeSessions.get(threadId);
    const result = {
      switchedSessions: 0,
      deferredSessions: 0,
      switchedThreadIds: [] as string[],
      deferredThreadIds: [] as string[],
    };
    if (!session) {
      this.staleRuntimeSettingsThreads.delete(threadId);
      return result;
    }

    if (normalizeAmbientModelId(session.model?.id) === normalizeAmbientModelId(thread.model)) {
      session.setThinkingLevel(thread.thinkingLevel);
      this.staleRuntimeSettingsThreads.delete(threadId);
      return result;
    }

    if (this.activeRuns.has(threadId)) {
      this.staleRuntimeSettingsThreads.add(threadId);
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
    const session = activeSessions.get(threadId);
    const plan = runtimeActiveSessionResetPlan(session ? [[threadId, session]] : [], this.activeRuns);
    for (const action of plan.actions) {
      if (action.status === "deferred") {
        this.staleRuntimeSettingsThreads.add(threadId);
        continue;
      }
      action.session.dispose();
      activeSessions.delete(threadId);
      this.stalePluginToolThreads.delete(threadId);
      this.staleRuntimeSettingsThreads.delete(threadId);
      this.ambientCliSkillMountDiagnostics.delete(threadId);
      this.tencentMemoryRuntimeSnapshots.delete(threadId);
    }
    return plan.result;
  }

  listAgentMemoryRuntimeSnapshots(): AgentMemoryRuntimeSnapshot[] {
    return [...this.tencentMemoryRuntimeSnapshots.values()];
  }

  async getContextUsage(threadId: string): Promise<ContextUsageSnapshot> {
    const thread = this.store.getThread(threadId);
    const session = activeSessions.get(threadId);
    if (session) return this.recordContextUsageSnapshot(threadId, session);

    const latest = this.store.getLatestContextUsageSnapshot(threadId);
    if (latest) return latest;

    const snapshot = this.unavailableContextUsageSnapshot(thread, "No active Pi session has reported context usage yet.");
    return this.store.recordContextUsageSnapshot(snapshot);
  }

  async compactThread(input: CompactThreadInput): Promise<ContextUsageSnapshot> {
    const thread = this.store.getThread(input.threadId);
    if (this.activeRuns.has(input.threadId)) {
      throw new Error("Context compaction is available after the current run finishes.");
    }

    const session = await this.getSession(thread);
    if (session.isCompacting) {
      throw new Error("Context compaction is already running for this thread.");
    }

    this.emit({ type: "run-status", threadId: input.threadId, status: "compacting" });
    const compactionEvents = createManualCompactionEventHandler({
      threadId: input.threadId,
      session,
      recordContextUsageSnapshot: (threadId, compactionSession, message) =>
        this.recordContextUsageSnapshot(threadId, compactionSession, message),
      emit: (event) => this.emit(event),
    });
    const unsubscribe = session.subscribe((event: any) => compactionEvents.handle(event));

    try {
      await session.compact(input.customInstructions);
      if (compactionEvents.runtimeError) throw new Error(compactionEvents.runtimeError);
      const current = this.store.getThread(input.threadId);
      if (session.sessionFile && session.sessionFile !== current.piSessionFile) {
        await this.commitThreadPiSessionFile({
          threadId: input.threadId,
          sessionFile: session.sessionFile,
          currentPiSessionFile: current.piSessionFile,
          reason: "compaction-finished",
          emit: (event) => this.emit(event),
        });
      }
      return this.recordContextUsageSnapshot(input.threadId, session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ type: "error", message, threadId: input.threadId, workspacePath: this.store.getWorkspace().path });
      throw error;
    } finally {
      unsubscribe();
      this.emit({ type: "run-status", threadId: input.threadId, status: "idle" });
    }
  }

  async recoverThreadContext(input: RecoverThreadContextInput): Promise<ContextUsageSnapshot> {
    const thread = this.store.getThread(input.threadId);
    if (this.activeRuns.has(input.threadId)) {
      throw new Error("Context recovery is available after the current run finishes.");
    }

    const appWorkspace = this.store.getWorkspace();
    const piSessionDir = join(appWorkspace.sessionPath, thread.id);
    const restorableSessionFile = getRestorablePiSessionFile(thread.piSessionFile, piSessionDir);
    if (restorableSessionFile) {
      try {
        SessionManager.open(restorableSessionFile, piSessionDir, thread.workspacePath).getEntries();
        const restorableSessionPlan = visibleTranscriptRecoveryRestorableSessionPlan({
          hasRecoveryMessage: this.hasVisibleTranscriptRecoveryMessage(thread.id),
        });
        if (restorableSessionPlan.kind === "already-recovered") {
          const session = await this.getSession(thread);
          return this.recordContextUsageSnapshot(thread.id, session, restorableSessionPlan.snapshotMessage);
        }
        throw new Error(restorableSessionPlan.errorMessage);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isVisibleTranscriptRecoveryNormalCompactionRequiredError(message)) throw error;
      }
    }

    const visibleMessages = this.store.listMessages(thread.id);
    if (visibleMessages.length === 0) {
      this.store.updateThreadSettings(thread.id, { piSessionFile: null });
      throw new Error("There is no visible transcript to rebuild model context from.");
    }

    const existing = activeSessions.get(thread.id);
    existing?.dispose();
    activeSessions.delete(thread.id);
    this.store.updateThreadSettings(thread.id, { piSessionFile: null });

    const reason = visibleTranscriptRecoveryReason({
      requestedReason: input.reason,
      threadSessionFile: thread.piSessionFile,
      restorableSessionFile,
    });
    const session = await this.getSession(this.store.getThread(thread.id));
    const recoveryMessages = visibleTranscriptRecoveryManualMessages({
      thread,
      visibleMessages,
      reason,
      recoveredAt: new Date().toISOString(),
      includeSystemMessage: !this.hasVisibleTranscriptRecoveryMessage(thread.id),
    });
    await session.sendCustomMessage(recoveryMessages.customMessage, { triggerTurn: false, deliverAs: "nextTurn" });

    if (recoveryMessages.systemMessage) {
      const recoveryMessage = this.store.addMessage(recoveryMessages.systemMessage);
      this.emit({ type: "message-created", message: recoveryMessage });
    }
    if (session.sessionFile) {
      await this.commitThreadPiSessionFile({
        threadId: thread.id,
        sessionFile: session.sessionFile,
        currentPiSessionFile: this.store.getThread(thread.id).piSessionFile,
        reason: "visible-transcript-recovery",
        emit: (event) => this.emit(event),
      });
    }
    return this.recordContextUsageSnapshot(thread.id, session, "Model context rebuilt from visible transcript. Recovery is lossy.");
  }

  private hasVisibleTranscriptRecoveryMessage(threadId: string): boolean {
    return hasVisibleTranscriptRecoveryMessage(this.store.listMessages(threadId));
  }

  resetSessions(): void {
    for (const session of activeSessions.values()) {
      session.dispose();
    }
    activeSessions.clear();
    this.stalePluginToolThreads.clear();
    this.staleRuntimeSettingsThreads.clear();
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
    await runPromptPreflightBeforePrompt({
      threadId: thread.id,
      session,
      promptContent,
      compactionSettings: this.store.getCompactionSettings(),
      unavailableContextWindow: CONTEXT_USAGE_UNAVAILABLE_WINDOW,
      setActiveRunStatus,
      isRunStoreActive,
      emitRunEvent,
      recordContextUsageSnapshot: (threadId, promptSession, message) =>
        this.recordContextUsageSnapshot(threadId, promptSession, message),
    });
  }

  private recordContextUsageSnapshot(threadId: string, session: PiSession, message?: string): ContextUsageSnapshot {
    const snapshot = this.contextUsageSnapshot(threadId, session, message);
    const recorded = this.store.recordContextUsageSnapshot(snapshot);
    this.emit({ type: "context-usage-updated", snapshot: recorded });
    return recorded;
  }

  private contextUsageSnapshot(threadId: string, session: PiSession, message?: string): ContextUsageSnapshot {
    return buildActiveContextUsageSnapshot({
      threadId,
      session,
      unavailableContextWindow: CONTEXT_USAGE_UNAVAILABLE_WINDOW,
      ambientCliSkillMount: this.ambientCliSkillMountDiagnostics.get(threadId),
      message,
    });
  }

  private unavailableContextUsageSnapshot(thread: ThreadSummary, message: string): ContextUsageSnapshot {
    const appWorkspace = this.store.getWorkspace();
    return buildUnavailableContextUsageSnapshot({
      threadId: thread.id,
      sessionFile: thread.piSessionFile,
      sessionDir: join(appWorkspace.sessionPath, thread.id),
      workspacePath: thread.workspacePath,
      contextWindow: ambientModel(thread.model, normalizeAmbientBaseUrl(getAmbientProviderStatus(thread.model).baseUrl)).contextWindow,
      message,
    });
  }

  private async createPlannerPlanArtifactFromMessage(
    message: ChatMessage,
  ): Promise<
    | {
        message: ChatMessage;
        artifact: PlannerPlanArtifact;
        relatedArtifacts?: PlannerPlanArtifact[];
        repairPrompt?: string;
        eventType: "created" | "updated";
      }
    | undefined
  > {
    const thread = this.store.getThread(message.threadId);
    if (thread.collaborationMode !== "planner") return undefined;
    if (!message.content.trim()) return undefined;
    if (message.metadata?.kind === "planner-plan" || typeof message.metadata?.plannerPlanArtifactId === "string") return undefined;

    const durableRevisionArtifactId = plannerDurableRevisionArtifactIdForSourceMessage(this.store.listMessages(message.threadId), message.id);
    if (durableRevisionArtifactId) {
      const existing = this.store.getPlannerPlanArtifact(durableRevisionArtifactId);
      if (existing.threadId !== message.threadId) throw new Error("Planner durable revision target does not belong to this thread.");
      const typedRevision = extractPlannerDurableRevisionResponse(message.content);
      if (!typedRevision) {
        this.store.updatePlannerPlanArtifact(existing.id, { workflowState: "failed" });
        throw new Error("Planner durable revision response must use the ambient-planner-revision JSON contract.");
      }
      let appliedRevision: ReturnType<typeof applyPlannerDurableRevisionResponse>;
      try {
        appliedRevision = applyPlannerDurableRevisionResponse(existing, message.id, typedRevision);
      } catch (error) {
        this.store.updatePlannerPlanArtifact(existing.id, { workflowState: "failed" });
        throw error;
      }
      const updatedFields = appliedRevision.fields;
      const generating = this.store.updatePlannerPlanArtifact(existing.id, { workflowState: "durable_generating" });
      const revisionCandidate: PlannerPlanArtifact = {
        ...generating,
        ...updatedFields,
        workflowState: "durable_generating",
        finalizationAttempt: undefined,
      };
      const durableResult = await this.rewriteDurablePlannerArtifact(revisionCandidate, thread, existing.durableArtifactPath, updatedFields);
      const updatedMessage = this.store.replaceMessage(message.id, appliedRevision.messageContent, {
        ...message.metadata,
        status: "done",
        runtime: "pi",
        provider: "ambient",
        kind: "planner-plan",
        plannerPlanArtifactId: durableResult.artifact.id,
        plannerDurableRevisionOfArtifactId: existing.id,
      });
      return { message: updatedMessage, artifact: durableResult.artifact, repairPrompt: durableResult.repairPrompt, eventType: "updated" };
    }

    const fields = extractPlannerPlanArtifactFields(message.content);
    if (!fields.content.trim()) return undefined;
    const finalizationSources = this.plannerFinalizationSourceArtifactsForPrompt(
      message.threadId,
      plannerPriorUserPromptForSourceMessage(this.store.listMessages(message.threadId), message.id),
    );
    const decisionQuestions = plannerDecisionQuestionsForFinalArtifact({
      threadId: message.threadId,
      messages: this.store.listMessages(message.threadId),
      sourceMessageId: message.id,
      parsedQuestions: fields.decisionQuestions,
      listThreadArtifacts: (artifactThreadId) => this.store.listPlannerPlanArtifacts(artifactThreadId),
    });

    const artifact = this.store.createPlannerPlanArtifact({
      threadId: message.threadId,
      sourceMessageId: message.id,
      ...fields,
      decisionQuestions,
    });
    const durableResult = await this.generateDurablePlannerArtifactIfReady(artifact, thread);
    const relatedArtifacts = finalizationSources.map((source) =>
      this.store.finishPlannerPlanFinalizationAttempt(source.id, {
        status: durableResult.artifact.workflowState === "failed" ? "failed" : "completed",
        workflowState: durableResult.artifact.workflowState === "failed" ? "failed" : "answers_complete",
        ...(durableResult.artifact.workflowState === "failed" ? { error: "Planner durable artifact generation failed." } : {}),
      }),
    );
    const updatedMessage = this.store.replaceMessage(message.id, fields.content, {
      ...message.metadata,
      status: "done",
      runtime: "pi",
      provider: "ambient",
      kind: "planner-plan",
      plannerPlanArtifactId: durableResult.artifact.id,
    });
    return {
      message: updatedMessage,
      artifact: durableResult.artifact,
      relatedArtifacts,
      repairPrompt: durableResult.repairPrompt,
      eventType: "created",
    };
  }

  private plannerFinalizationSourceArtifactsForPrompt(threadId: string, prompt: string): PlannerPlanArtifact[] {
    return plannerFinalizationSourceArtifactsFromPrompt({
      threadId,
      prompt,
      getArtifactById: (artifactId) => this.store.getPlannerPlanArtifact(artifactId),
      listThreadArtifacts: (artifactThreadId) => this.store.listPlannerPlanArtifacts(artifactThreadId),
    });
  }

  private async generateDurablePlannerArtifactIfReady(
    artifact: PlannerPlanArtifact,
    thread: ThreadSummary,
  ): Promise<{ artifact: PlannerPlanArtifact; repairPrompt?: string }> {
    if (artifact.status !== "ready" || artifact.decisionQuestions.some((question) => question.required && !question.answer)) {
      return { artifact };
    }
    const generating = this.store.updatePlannerPlanArtifact(artifact.id, { workflowState: "durable_generating" });
    const projectArtifactWorkspacePath = this.store.getProjectArtifactWorkspacePath();
    try {
      const durable = await writePlannerDurableHtmlArtifact({
        artifact: generating,
        threadTitle: thread.title,
        workspacePath: projectArtifactWorkspacePath,
        browserValidator: this.features.planner?.durableBrowserValidator ?? validatePlannerDurableHtmlFileInBrowser,
      });
      const updated = this.store.setPlannerPlanDurableArtifact(generating.id, {
        path: durable.relativePath,
        generatedAt: durable.generatedAt,
        validation: durable.validation,
      });
      this.store.promotePlannerDurableArtifactToBoardSource(updated.id);
      await this.commitPlannerDurableArtifact(projectArtifactWorkspacePath, updated, durable.manifestRelativePath, "Add durable plan");
      await this.refreshBrowsersForArtifactChange(thread.id, projectArtifactWorkspacePath, durable.relativePath);
      return { artifact: updated };
    } catch (error) {
      console.warn(`[planner] Failed to generate durable plan artifact: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof PlannerDurableHtmlValidationError) {
        const priorRepairAttempts = plannerDurableRepairAttemptCount(this.store.listMessages(thread.id));
        if (priorRepairAttempts < PLANNER_DURABLE_REPAIR_MAX_ATTEMPTS) {
          const repairing = this.store.setPlannerPlanDurableArtifactValidation(generating.id, error.validation, "repairing");
          return {
            artifact: repairing,
            repairPrompt: buildPlannerDurableRepairPrompt({
              artifact: repairing,
              validation: error.validation,
              attempt: priorRepairAttempts + 1,
              maxAttempts: PLANNER_DURABLE_REPAIR_MAX_ATTEMPTS,
            }),
          };
        }
        return { artifact: await this.writeDeterministicPlannerDurableFallback(generating, thread, error.validation, projectArtifactWorkspacePath) };
      }
      return { artifact: this.store.updatePlannerPlanArtifact(generating.id, { workflowState: "failed" }) };
    }
  }

  private async rewriteDurablePlannerArtifact(
    artifact: PlannerPlanArtifact,
    thread: ThreadSummary,
    existingRelativePath?: string,
    contentUpdate?: PlannerPlanArtifactContentUpdate,
  ): Promise<{ artifact: PlannerPlanArtifact; repairPrompt?: string }> {
    const projectArtifactWorkspacePath = this.store.getProjectArtifactWorkspacePath();
    try {
      const durable = await writePlannerDurableHtmlArtifact({
        artifact,
        threadTitle: thread.title,
        workspacePath: projectArtifactWorkspacePath,
        browserValidator: this.features.planner?.durableBrowserValidator ?? validatePlannerDurableHtmlFileInBrowser,
        ...(existingRelativePath ? { relativePath: existingRelativePath } : {}),
      });
      const persisted = contentUpdate
        ? this.store.updatePlannerPlanArtifactContent(artifact.id, {
            ...contentUpdate,
            workflowState: "durable_generating",
          })
        : artifact;
      const updated = this.store.setPlannerPlanDurableArtifact(persisted.id, {
        path: durable.relativePath,
        generatedAt: durable.generatedAt,
        validation: durable.validation,
      });
      this.store.promotePlannerDurableArtifactToBoardSource(updated.id);
      await this.commitPlannerDurableArtifact(projectArtifactWorkspacePath, updated, durable.manifestRelativePath, "Revise durable plan");
      await this.refreshBrowsersForArtifactChange(thread.id, projectArtifactWorkspacePath, durable.relativePath);
      return { artifact: updated };
    } catch (error) {
      console.warn(`[planner] Failed to revise durable plan artifact: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof PlannerDurableHtmlValidationError) {
        return { artifact: this.store.setPlannerPlanDurableArtifactValidation(artifact.id, error.validation, "failed") };
      }
      return { artifact: this.store.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" }) };
    }
  }

  private async writeDeterministicPlannerDurableFallback(
    artifact: PlannerPlanArtifact,
    thread: ThreadSummary,
    validation: PlannerDurableHtmlValidationError["validation"],
    projectArtifactWorkspacePath = this.store.getProjectArtifactWorkspacePath(),
  ): Promise<PlannerPlanArtifact> {
    try {
      const durable = await writePlannerDurableHtmlArtifact({
        artifact,
        threadTitle: thread.title,
        workspacePath: projectArtifactWorkspacePath,
        browserValidator: this.features.planner?.durableBrowserValidator ?? validatePlannerDurableHtmlFileInBrowser,
        diagramMode: "deterministic",
        validationWarnings: plannerDurableFallbackWarnings(validation),
      });
      const updated = this.store.setPlannerPlanDurableArtifact(artifact.id, {
        path: durable.relativePath,
        generatedAt: durable.generatedAt,
        validation: durable.validation,
        workflowState: "durable_ready_with_fallbacks",
      });
      this.store.promotePlannerDurableArtifactToBoardSource(updated.id);
      await this.commitPlannerDurableArtifact(projectArtifactWorkspacePath, updated, durable.manifestRelativePath, "Add durable plan");
      await this.refreshBrowsersForArtifactChange(thread.id, projectArtifactWorkspacePath, durable.relativePath);
      return updated;
    } catch (fallbackError) {
      console.warn(`[planner] Failed deterministic durable plan fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      if (fallbackError instanceof PlannerDurableHtmlValidationError) {
        return this.store.setPlannerPlanDurableArtifactValidation(artifact.id, fallbackError.validation, "failed");
      }
      return this.store.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" });
    }
  }

  private async commitPlannerDurableArtifact(
    workspacePath: string,
    artifact: PlannerPlanArtifact,
    manifestRelativePath: string,
    action: "Add durable plan" | "Revise durable plan",
  ): Promise<void> {
    if (!artifact.durableArtifactPath) return;
    const title = artifact.title.trim() || "Planner durable artifact";
    try {
      await commitGitPaths(workspacePath, {
        paths: [artifact.durableArtifactPath, manifestRelativePath],
        message: `${action}: ${title}`.slice(0, 180),
        force: true,
      });
    } catch (error) {
      console.warn(`[planner] Failed to commit durable plan artifact: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private schedulePlannerDurableRepairFollowUp(input: SendMessageInput, workspacePath: string): void {
    setTimeout(() => {
      void this.send(input).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emit({ type: "error", message: `Planner durable repair follow-up failed: ${message}`, threadId: input.threadId, workspacePath });
      });
    }, 0);
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

  private async getSession(thread: ThreadSummary, recovery?: RuntimeSessionRecoveryContext): Promise<PiSession> {
    const existing = activeSessions.get(thread.id);
    if (existing) {
      const pluginToolsStale = this.stalePluginToolThreads.delete(thread.id);
      const runtimeSettingsStale = this.staleRuntimeSettingsThreads.delete(thread.id);
      if (pluginToolsStale || runtimeSettingsStale) {
        existing.dispose();
        activeSessions.delete(thread.id);
      } else {
        if (normalizeAmbientModelId(existing.model?.id) !== normalizeAmbientModelId(thread.model)) {
          await this.switchSessionToThreadModel(thread, existing);
        }
        existing.setThinkingLevel(thread.thinkingLevel);
        return existing;
      }
    }
    this.stalePluginToolThreads.delete(thread.id);
    this.staleRuntimeSettingsThreads.delete(thread.id);

    const appWorkspace = this.store.getWorkspace();
    const workspace: WorkspaceState = {
      path: thread.workspacePath,
      name: basename(thread.workspacePath) || thread.workspacePath,
      statePath: appWorkspace.statePath,
      sessionPath: appWorkspace.sessionPath,
    };
    const featureFlagSnapshot = this.currentFeatureFlagSnapshot();
    const subagentToolNames = ambientSubagentActiveToolNamesForThread(thread, featureFlagSnapshot);
    const subagentToolScopeSnapshots =
      thread.kind === "subagent_child" && thread.subagentRunId
        ? this.store.listSubagentToolScopeSnapshots(thread.subagentRunId)
        : [];
    const childCallableWorkflowToolNames = subagentChildCallableWorkflowToolNamesFromSnapshots(subagentToolScopeSnapshots);
    const initialCallableWorkflowRecordedPlaybooks = isAmbientSubagentsEnabled(featureFlagSnapshot)
      ? callableWorkflowRecordedPlaybooks(this.store)
      : [];
    const callableWorkflowToolNames = callableWorkflowActiveToolNamesForThread({
      thread,
      featureFlagSnapshot,
      recordedWorkflowPlaybooks: initialCallableWorkflowRecordedPlaybooks,
      childCallableWorkflowToolNames,
    });
    const memorySettings = this.store.getMemorySettings();
    const tencentMemoryActive = isAgentMemoryActiveForThread({
      featureEnabled: isAmbientTencentDbMemoryEnabled(featureFlagSnapshot),
      settings: memorySettings,
      threadMemoryEnabled: Boolean(thread.memoryEnabled),
      storageHealthy: this.features.memory?.storageHealthy?.() ?? true,
    });
    const provider = getAmbientProviderStatus(thread.model);
    const apiKey = readAmbientApiKey();
    const model = ambientModel(thread.model, normalizeAmbientBaseUrl(provider.baseUrl));
    let tencentMemoryExtension: ExtensionFactory | undefined;
    let memoryToolNames: string[] = [];
    if (tencentMemoryActive) {
      const [
        { createTencentDbMemoryRuntimeForThread },
        { createTencentDbMemoryPiExtension },
        { createAmbientTencentMemoryPiLlmDelegate },
      ] = await Promise.all([
        import("./memory/tencentdb/runtime"),
        import("./memory/tencentdb/piExtension"),
        import("./memory/tencentdb/ambientPiLlmDelegate"),
      ]);
      const runWithAmbientPi = this.features.memory?.runWithAmbientPi ?? createAmbientTencentMemoryPiLlmDelegate({
        workspacePath: workspace.path,
        statePath: workspace.statePath,
        threadId: thread.id,
        model,
        apiKey,
      });
      const tencentMemoryRuntime = createTencentDbMemoryRuntimeForThread({
        thread,
        workspace,
        featureFlagSnapshot,
        memorySettings,
        storageHealthy: this.features.memory?.storageHealthy?.() ?? true,
        loadCoreConstructor: this.features.memory?.loadTencentMemoryCore,
        runWithAmbientPi,
        listEmbeddingProviders: (workspacePath) => this.listEmbeddingProvidersForTools(workspacePath),
        startEmbeddingProviderRuntime: (input) => this.startEmbeddingProviderRuntimeForMemory(input, workspace.path),
        defaultModelRef: thread.model,
        onSnapshot: (snapshot) => this.tencentMemoryRuntimeSnapshots.set(thread.id, snapshot),
      });
      if (tencentMemoryRuntime) {
        tencentMemoryExtension = createTencentDbMemoryPiExtension({
          runtime: tencentMemoryRuntime,
          ...(memorySettings.shortTermOffloadEnabled
            ? {
                shortTermOffload: {
                  enabled: true,
                  getMessages: () => this.store.listMessages(thread.id),
                },
              }
            : {}),
        });
        memoryToolNames = [...tencentMemoryRuntime.activeToolNames];
      }
    }

    const agentDir = join(workspace.statePath, "pi");
    const piSessionDir = join(workspace.sessionPath, thread.id);
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(piSessionDir, { recursive: true });

    const settingsManager = SettingsManager.create(workspace.path, agentDir);
    const compactionSettings = this.store.getCompactionSettings();
    const retryOverrides = piRetryOverridesFromModelRuntimeSettings(this.store.getModelRuntimeSettings());
    settingsManager.applyOverrides({
      compaction: {
        enabled: compactionSettings.autoCompactionEnabled,
        reserveTokens: compactionSettings.reserveTokens,
        keepRecentTokens: compactionSettings.keepRecentTokens,
      },
      ...(retryOverrides ? { retry: retryOverrides } : {}),
    });
    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    if (apiKey) authStorage.setRuntimeApiKey("ambient", apiKey);
    if (this.features.ambientCli?.autoInstallFirstParty !== false) {
      await ensureFirstPartyAmbientCliPackages(workspace.path, {
        onStatus: (status) => {
          if (status.status === "failed") {
            console.warn(`[ambient-cli] Failed to install first-party package ${status.packageName}: ${status.error}`);
            return;
          }
          if (status.status === "installed") {
            console.log(`[ambient-cli] Installed first-party package ${status.packageName}.`);
          }
        }
      });
    }
    const skillDiscovery = await discoverAgentRuntimeSkillPaths({
      workspacePath: workspace.path,
      pluginHost: this.pluginHost,
      store: this.store,
    });
    const enabledPlugins = skillDiscovery.enabledPlugins;
    const cliCatalog = await discoverAmbientCliPackages(workspace.path).catch(() => ({ packages: [], errors: [] }));
    const cliSkillMount = resolveAmbientCliSkillMount({
      cliSkillPaths: skillDiscovery.ambientCliSkillPaths,
      installedCliPackageCount: cliCatalog.packages.filter((pkg) => pkg.installed).length,
    });
    this.ambientCliSkillMountDiagnostics.set(thread.id, {
      lazyModeEnabled: cliSkillMount.lazyModeEnabled,
      installedCliPackageCount: cliSkillMount.installedCliPackageCount,
      eagerCliSkillCount: cliSkillMount.eagerCliSkillCount,
      mountedCliSkillCount: cliSkillMount.mountedCliSkillCount,
    });
    const pluginMcpTools = await this.pluginHost.buildCodexPluginMcpToolRegistrations(enabledPlugins, {
      permissionMode: thread.permissionMode,
      workspacePath: workspace.path,
    });
    const interruptedToolCallRecoveryToolNames = recoveryToolNamesForSessionRecovery(recovery);
    const interruptedToolCallRecoveryToolsAvailable = interruptedToolCallRecoveryToolNames.length > 0;

    const resourceLoader = new DefaultResourceLoader({
      cwd: workspace.path,
      agentDir,
      settingsManager,
      agentsFilesOverride: (base) => ({
        agentsFiles: workspaceBoundedAgentContextFiles({
          contextFiles: base.agentsFiles,
          workspacePath: workspace.path,
          agentDir,
        }),
      }),
      additionalSkillPaths: [
        ...skillDiscovery.pluginSkillPaths,
        ...skillDiscovery.piSkillPaths,
        ...cliSkillMount.mountedCliSkillPaths,
      ],
      extensionFactories: [
        createAmbientProviderExtension(model),
        createAmbientProductContextExtension(),
        this.createAmbientCompactionSummaryExtension(thread.id, workspace, model, apiKey),
        this.createContextAccountingExtension(thread.id, model),
        ...(tencentMemoryExtension ? [tencentMemoryExtension] : []),
        this.createGoalModeToolExtension(thread.id),
        this.createInterruptedToolCallRecoveryToolExtension(thread.id, workspace),
        this.createToolRunnerExtension(thread.id, workspace, {
          interruptedToolCallRecoveryToolsAvailable,
        }),
        this.createProjectBoardTaskToolExtension(thread.id),
        createMediaToolExtension(workspace),
        createVoiceSettingsToolExtension({
          threadId: thread.id,
          workspace,
          getThread: (id) => this.store.getThread(id),
          listProviders: (workspacePath) => this.listVoiceProvidersForTools(workspacePath),
          voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId) => this.voiceProviderWorkspacePathForCapabilityId(providerCapabilityId),
          resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
          dogfoodSelectedVoiceProvider: (voiceThread, voiceWorkspace, settings, options) => this.dogfoodSelectedVoiceProvider(voiceThread, voiceWorkspace, settings, options),
          voice: this.features.voice,
        }),
        createSttSettingsToolExtension({
          threadId: thread.id,
          workspace,
          getThread: (id) => this.store.getThread(id),
          listProviders: (workspacePath) => this.listSttProvidersForTools(workspacePath),
          resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
          stt: this.features.stt,
        }),
        createVisionToolExtension({
          threadId: thread.id,
          workspace,
          getThread: (id) => this.store.getThread(id),
          getLatestBrowserScreenshotArtifact: () => this.latestBrowserScreenshotArtifacts.get(thread.id),
          vision: this.features.vision,
        }),
        this.createLocalDeepResearchToolExtension(thread.id, workspace),
        createLocalRuntimeToolExtension({
          workspace,
          getLocalModelResourceSettings: () => this.features.localDeepResearch?.readSettings?.()?.localModelResources,
          getHostMemory: () => this.features.localModelHostMemory?.(),
          getActiveRuntimeLeases: () => this.localModelRuntimeManager.activeRuntimeLeases(),
          getVoiceProviders: () => this.listVoiceProvidersWithCachedVoices(workspace.path),
          getEmbeddingProviders: () => this.listEmbeddingProvidersForTools(workspace.path),
          startRuntime: (input) => this.localModelRuntimeManager.startRuntime(input),
          stopRuntime: (input) => this.localModelRuntimeManager.stopRuntime(input),
          restartRuntime: (input) => this.localModelRuntimeManager.restartRuntime(input),
          resolveLocalRuntimeOwnership: (request) => this.resolveLocalRuntimeOwnershipForForcedAction(request),
        }),
        this.createManagedDownloadToolExtension(workspace),
        createProviderCatalogToolExtension(),
        this.createMessagingGatewayToolExtension(thread.id, workspace),
        this.createWebResearchToolExtension(thread.id, workspace),
        this.createSearchPreferenceToolExtension(thread.id, workspace),
        this.createGitToolExtension(thread.id, workspace),
        this.createPrivilegedActionToolExtension(thread.id, workspace),
        this.createLambdaRlmToolExtension(thread.id, workspace, model, apiKey),
        this.createBrowserToolExtension(thread.id, workspace),
        this.createPluginInstallToolExtension(thread.id, workspace, model, apiKey),
        this.createGoogleWorkspaceSetupToolExtension(workspace),
        this.createWorkflowNativeToolExtension(thread.id, workspace),
        this.createPluginMcpToolExtension(thread.id, workspace, pluginMcpTools),
        ...(callableWorkflowToolNames.length
          ? [this.createCallableWorkflowToolExtension(thread.id, workspace, initialCallableWorkflowRecordedPlaybooks, childCallableWorkflowToolNames)]
          : []),
        ...(subagentToolNames.length ? [this.createSubagentToolExtension(thread.id, pluginMcpTools)] : []),
        this.createPlannerModeExtension(thread.id),
        this.createPermissionGateExtension(thread.id, workspace),
      ],
    });
    await resourceLoader.reload();

    const recoveryTranscriptContext = visibleTranscriptRecoverySessionTranscriptContext(this.store.listMessages(thread.id));
    const { recoveryTranscriptMessages } = recoveryTranscriptContext;
    const restorableSession = getRestorableRecoverySessionFile({
      threadSessionFile: thread.piSessionFile,
      recoverySessionFile: recovery?.kind === "provider_interruption_continuation" ? recovery.previousSessionFile : undefined,
      sessionDir: piSessionDir,
    });
    const restorableSessionFile = restorableSession.sessionFile;
    const seedDecision = visibleTranscriptRecoverySessionSeedDecision({ threadSessionFile: thread.piSessionFile, restorableSessionFile, hasRecovery: Boolean(recovery), recoveryTranscriptMessages });
    let shouldSeedVisibleTranscript = seedDecision.shouldSeedVisibleTranscript;
    const missingSessionPlan = visibleTranscriptRecoveryMissingSessionPlan({
      threadSessionFile: thread.piSessionFile,
      restorableSessionFile,
      forceFreshSessionForRecovery: seedDecision.forceFreshSessionForRecovery,
      hasVisibleTranscript: recoveryTranscriptContext.hasVisibleTranscript,
    });
    if (missingSessionPlan.kind === "clear-thread-session-file") {
      this.store.updateThreadSettings(thread.id, { piSessionFile: null });
    } else if (missingSessionPlan.kind === "unavailable-context") {
      const unavailableContext = visibleTranscriptRecoveryUnavailableContextMessages({
        kind: missingSessionPlan.unavailableContextKind,
      });
      const snapshot = this.store.recordContextUsageSnapshot(
        this.unavailableContextUsageSnapshot(thread, unavailableContext.snapshotMessage),
      );
      this.emit({ type: "context-usage-updated", snapshot });
      throw new Error(unavailableContext.errorMessage);
    }
    let sessionManager: SessionManager;
    try {
      sessionManager = restorableSessionFile
        ? SessionManager.open(restorableSessionFile, piSessionDir, workspace.path)
        : SessionManager.create(workspace.path, piSessionDir);
    } catch (error) {
      const openFailurePlan = visibleTranscriptRecoverySessionOpenFailurePlan({ hasRecovery: Boolean(recovery), threadSessionFile: thread.piSessionFile, restorableSessionFile, recoveryTranscriptMessages });
      if (openFailurePlan.kind === "recoverable") {
        if (openFailurePlan.shouldClearThreadSessionFile) this.store.updateThreadSettings(thread.id, { piSessionFile: null });
        shouldSeedVisibleTranscript = openFailurePlan.shouldSeedVisibleTranscript;
        sessionManager = SessionManager.create(workspace.path, piSessionDir);
      } else {
        const unavailablePlan = visibleTranscriptRecoverySessionOpenUnavailablePlan({
          hasVisibleTranscript: recoveryTranscriptContext.hasVisibleTranscript,
          sessionErrorMessage: error instanceof Error ? error.message : String(error),
        });
        if (unavailablePlan.kind === "unavailable-context") {
          const { unavailableContext } = unavailablePlan;
          const snapshot = this.store.recordContextUsageSnapshot(
            this.unavailableContextUsageSnapshot(thread, unavailableContext.snapshotMessage),
          );
          this.emit({ type: "context-usage-updated", snapshot });
          throw new Error(unavailableContext.errorMessage);
        }
        this.store.updateThreadSettings(thread.id, { piSessionFile: null });
        sessionManager = SessionManager.create(workspace.path, piSessionDir);
      }
    }
    enableAtomicPiSessionPersistence(sessionManager);

    let sessionForAmbientToolRouter: PiSession | undefined;
    const ambientToolRouterTools = createAmbientToolRouterTools({
      getSession: () => sessionForAmbientToolRouter,
      getInstalledMcpSearchAliases: () => this.mcpToolOrchestration.installedMcpSearchAliases(workspace),
      authorizeToolCall: async (toolName, toolInput) => {
        const blocked = await this.resolveToolCallPermission(thread.id, workspace, toolName, toolInput);
        if (blocked) throw new Error(blocked.reason);
      },
    });
    const pluginMcpToolNames = pluginMcpTools.map((tool) => tool.registeredName);
    const projectBoardTaskToolNames = projectBoardNativeTaskToolDefinitions().map((tool) => tool.name);
    const agentRuntimeActiveTools = resolveAgentRuntimeActiveToolNamesForThread({
      thread,
      defaultActiveToolNames: [...AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES, ...memoryToolNames],
      goalModeToolNames: GOAL_MODE_TOOL_NAMES,
      subagentToolNames,
      callableWorkflowToolNames,
      pluginMcpToolNames,
      projectBoardTaskToolNames,
      subagentToolScopeSnapshots,
    });
    const transcriptRehydratedToolNames = thread.kind === "subagent_child"
      ? []
      : ambientMcpBridgeActiveToolNamesForRecoveredTranscript(recoveryTranscriptMessages);
    const activeTools = activeToolNamesForAgentRuntimeSession({
      agentRuntimeActiveTools,
      recoveryToolNames: interruptedToolCallRecoveryToolNames,
      transcriptRehydratedToolNames,
    });
    const { session } = await createAgentSession({
      cwd: workspace.path,
      agentDir,
      authStorage,
      model,
      resourceLoader,
      sessionManager,
      settingsManager,
      thinkingLevel: thread.thinkingLevel,
      customTools: ambientToolRouterTools,
      activeTools,
      includeAllExtensionTools: false,
    });
    sessionForAmbientToolRouter = session;
    session.agent.toolExecution = "sequential";
    await session.bindExtensions({});
    activeSessions.set(thread.id, session);
    if (session.sessionFile && session.sessionFile !== thread.piSessionFile) {
      await this.commitThreadPiSessionFile({
        threadId: thread.id,
        sessionFile: session.sessionFile,
        currentPiSessionFile: thread.piSessionFile,
        reason: "session-created",
        emit: (event) => this.emit(event),
      });
    }
    if (shouldSeedVisibleTranscript) {
      const recoverySeedMessages = visibleTranscriptRecoveryDefaultSessionSeedMessages({
        thread,
        visibleMessages: recoveryTranscriptMessages,
        recovery,
        recoveredAt: new Date().toISOString(),
      });
      await session.sendCustomMessage(recoverySeedMessages.customMessage, { triggerTurn: false, deliverAs: "nextTurn" });
      const recoveryMessage = this.store.addMessage(recoverySeedMessages.systemMessage);
      this.emit({ type: "message-created", message: recoveryMessage });
    }
    this.recordContextUsageSnapshot(thread.id, session);
    return session;
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
    return recordSubagentFinalizationBlockedParentMailboxEvents({
      parentThreadId,
      parentRunId,
      block,
      getSubagentWaitBarrier: (barrierId) => this.store.getSubagentWaitBarrier(barrierId),
      getSubagentRun: (runId) => this.store.getSubagentRun(runId),
      appendSubagentParentMailboxEvent: (event) => this.store.appendSubagentParentMailboxEvent(event),
      emitSubagentParentMailboxEventUpdated: (event) => this.emitSubagentParentMailboxEventUpdated(event),
    });
  }

  private recordCallableWorkflowFinalizationBlockedParentMailbox(
    parentThreadId: string,
    parentRunId: string,
    block: CallableWorkflowParentBlockingBlock,
  ): SubagentParentMailboxEventSummary {
    return recordCallableWorkflowFinalizationBlockedParentMailboxEvent({
      parentThreadId,
      parentRunId,
      block,
      appendSubagentParentMailboxEvent: (event) => this.store.appendSubagentParentMailboxEvent(event),
      emitSubagentParentMailboxEventUpdated: (event) => this.emitSubagentParentMailboxEventUpdated(event),
    });
  }

  private subagentFinalizationBarrierBlock(parentThreadId: string, parentRunId: string): SubagentFinalizationBarrierBlock | undefined {
    this.reconcileParentRunWaitBarriersForFinalization(parentThreadId, parentRunId);
    return resolveSubagentFinalizationBarrierBlock({
      parentThreadId,
      parentRunId,
      listSubagentWaitBarriersForParentRun: (runId) => this.store.listSubagentWaitBarriersForParentRun(runId),
      getSubagentRun: (runId) => this.store.getSubagentRun(runId),
      listSubagentRunEvents: (runId) => this.store.listSubagentRunEvents(runId),
      listSubagentMailboxEvents: (runId) => this.store.listSubagentMailboxEvents(runId),
    });
  }

  private reconcileParentRunWaitBarriersForFinalization(parentThreadId: string, parentRunId: string): void {
    const reconciledRunIds = new Set<string>();
    const barriers = this.store
      .listSubagentWaitBarriersForParentRun(parentRunId)
      .filter((barrier) =>
        barrier.parentThreadId === parentThreadId &&
        barrier.status === "waiting_on_children" &&
        barrier.dependencyMode !== "optional_background");
    for (const barrier of barriers) {
      for (const childRunId of barrier.childRunIds) {
        if (reconciledRunIds.has(childRunId)) continue;
        let run: SubagentRunSummary;
        try {
          run = this.store.getSubagentRun(childRunId);
        } catch {
          continue;
        }
        if (!isSubagentTerminalStatus(run.status)) continue;
        reconciledRunIds.add(childRunId);
        this.resolveTerminalChildWaitBarriers(run, `finalization_reconciliation:${run.status}`);
      }
    }
  }

  private callableWorkflowFinalizationBlock(
    parentThreadId: string,
    parentRunId: string,
  ): CallableWorkflowParentBlockingBlock | undefined {
    return resolveCallableWorkflowFinalizationBlock({
      parentThreadId,
      parentRunId,
      listCallableWorkflowTasksForParentRun: (runId) => this.store.listCallableWorkflowTasksForParentRun(runId),
    });
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
  ): ExtensionFactory {
    return createAgentRuntimeCallableWorkflowToolExtension({
      threadId,
      workspace,
      initialRecordedWorkflowPlaybooks,
      childCallableWorkflowToolNames,
      activeRunIds: this.activeRunIds,
      store: this.store,
      getFeatureFlagSnapshot: () => this.currentFeatureFlagSnapshot(),
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

  cancelCallableWorkflowTask(input: CancelCallableWorkflowTaskInput): CallableWorkflowTaskSummary {
    return cancelAgentRuntimeCallableWorkflowTask(input, {
      store: this.store,
      taskAbortControllers: this.callableWorkflowTaskAbortControllers,
      runTaskIds: this.callableWorkflowRunTaskIds,
      emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
      emit: (event) => this.emit(event),
    });
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
      ...createAgentRuntimeCallableWorkflowRuntimeBridge({
        taskAbortControllers: this.callableWorkflowTaskAbortControllers,
        runTaskIds: this.callableWorkflowRunTaskIds,
        emitCallableWorkflowTaskUpdated: (task) => this.emitCallableWorkflowTaskUpdated(task),
        emit: (event) => this.emit(event),
      }),
    });
  }

  private emitCallableWorkflowTaskUpdated(task: CallableWorkflowTaskSummary): void {
    this.emit({ type: "callable-workflow-task-updated", task });
  }

  private resolveSubagentModelRuntimeProfile(modelId?: string): AmbientModelRuntimeProfile {
    return this.features.localTextSubagents?.resolveModelRuntimeProfile?.(modelId) ??
      DEFAULT_SUBAGENT_MODEL_RUNTIME_REGISTRY.resolveProfile(modelId);
  }

  private async resolveSubagentCapacityLease(input: ResolveSubagentCapacityLeaseInput) {
    const localMemory = input.localMemory ?? (input.model.locality === "local"
      ? await this.resolveSubagentLocalMemoryCapacity(input)
      : undefined);
    return resolveSubagentCapacityLease({
      ...input,
      ...(localMemory ? { localMemory } : {}),
    });
  }

  private async resolveSubagentLocalMemoryCapacity(
    input: ResolveSubagentCapacityLeaseInput,
  ): Promise<SubagentCapacityLocalMemorySnapshot> {
    const parentThread = this.store.getThread(input.parentThreadId);
    const settings = this.features.localDeepResearch?.readSettings?.()?.localModelResources;
    const registry = await buildLocalModelResourceRegistry({
      workspacePath: parentThread.workspacePath,
      settings,
      ...(this.features.localModelHostMemory ? { hostMemory: this.features.localModelHostMemory() } : {}),
      requestedLaunch: localTextRequestedLaunch({
        id: `${input.parentRunId}:${input.canonicalTaskPath}`,
        ownerThreadId: parentThread.id,
        modelId: input.model.modelId,
        profileId: input.model.profileId,
        contextTokens: input.model.contextWindowTokens,
        estimatedResidentMemoryBytes: input.model.estimatedResidentMemoryBytes,
      }),
      leases: this.localModelRuntimeManager.activeRuntimeLeases(),
    });
    const decision = registry.policyDecision;
    const allowed = decision.outcome === "unlimited" || decision.outcome === "within-limit" || decision.outcome === "warn";
    return {
      outcome: decision.outcome,
      allowed,
      reason: decision.reason,
      ...(decision.requestedEstimatedResidentMemoryBytes !== undefined
        ? { requestedEstimatedResidentMemoryBytes: decision.requestedEstimatedResidentMemoryBytes }
        : {}),
      activeEstimatedResidentMemoryBytes: decision.activeEstimatedResidentMemoryBytes,
      ...(decision.activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes: decision.activeActualResidentMemoryBytes } : {}),
      projectedEstimatedResidentMemoryBytes: decision.projectedEstimatedResidentMemoryBytes,
      ...(decision.maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes: decision.maxResidentMemoryBytes } : {}),
      ...(decision.exceededByBytes !== undefined ? { exceededByBytes: decision.exceededByBytes } : {}),
      unloadCandidateIds: decision.unloadCandidateIds,
    };
  }

  private getLocalTextSubagentRuntime(): SubagentChildRuntimeAdapter | undefined {
    const feature = this.features.localTextSubagents;
    if (!feature?.resolveRuntime) return undefined;
    if (!this.localTextSubagentRuntime) {
      const localModelResourceSettings = this.features.localDeepResearch?.readSettings?.()?.localModelResources;
      this.localTextSubagentRuntime = createLocalTextSubagentRuntimeAdapter({
        store: this.createSubagentEventingStore(),
        runtimeManager: feature.runtimeManager ?? this.localModelRuntimeManager,
        ...(feature.resolveRuntimeForLaunch ? { resolveRuntimeForLaunch: feature.resolveRuntimeForLaunch } : {}),
        resolveRuntime: feature.resolveRuntime,
        ...(feature.buildResourceRegistry ? { buildResourceRegistry: feature.buildResourceRegistry } : {}),
        ...(feature.buildResourceRegistryForLaunch ? { buildResourceRegistryForLaunch: feature.buildResourceRegistryForLaunch } : {}),
        ...(feature.buildPrompt ? { buildPrompt: feature.buildPrompt } : {}),
        ...(feature.fetchImpl ? { fetchImpl: feature.fetchImpl } : {}),
        ...(feature.now ? { now: feature.now } : {}),
        ...(localModelResourceSettings ? { localModelResourceSettings } : {}),
        ...(this.features.localModelHostMemory ? { localModelHostMemory: this.features.localModelHostMemory } : {}),
      });
    }
    return this.localTextSubagentRuntime;
  }

  private startResolvedSubagentChildRun(
    input: SubagentChildRuntimeStartInput,
  ): Promise<SubagentChildRuntimeStartResult> | SubagentChildRuntimeStartResult {
    const disabledSnapshot = this.currentSubagentsDisabledRuntimeSnapshot();
    if (disabledSnapshot) return this.refuseSubagentChildRuntimeStartBecauseFeatureDisabled(input, disabledSnapshot);
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (!runtime?.startChildRun) {
        const current = this.store.getSubagentRun(input.run.id);
        input.emitEvent({
          type: "status",
          source: "child_runtime",
          status: current.status,
          message: "Local text sub-agent runtime is not configured.",
        });
        return {
          started: false,
          run: current,
          message: "Local text sub-agent runtime is not configured.",
        };
      }
      return runtime.startChildRun(input);
    }
    return this.startSubagentChildRun(input);
  }

  private async waitForResolvedSubagentChildRun(input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult> {
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (!runtime?.waitForChildRun) return { run: this.store.getSubagentRun(input.run.id), timedOut: false };
      return runtime.waitForChildRun(input);
    }
    return this.waitForSubagentChildRun(input);
  }

  private async cancelResolvedSubagentChildRun(input: SubagentChildRuntimeCancelInput): Promise<SubagentChildRuntimeCancelResult> {
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (runtime?.cancelChildRun) return runtime.cancelChildRun(input);
    }
    return this.cancelSubagentChildRun(input);
  }

  private async followupResolvedSubagentChildRun(input: SubagentChildRuntimeFollowupInput): Promise<SubagentChildRuntimeFollowupResult> {
    const disabledSnapshot = this.currentSubagentsDisabledRuntimeSnapshot();
    if (disabledSnapshot) return this.refuseSubagentChildFollowupBecauseFeatureDisabled(input, disabledSnapshot);
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (runtime?.followupChildRun) return runtime.followupChildRun(input);
      return {
        run: this.store.getSubagentRun(input.run.id),
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Local text sub-agent follow-up execution is not configured; the follow-up remains queued.",
      };
    }
    return this.followupSubagentChildRun(input);
  }

  private async retryResolvedSubagentChildRun(input: SubagentChildRuntimeRetryInput): Promise<SubagentChildRuntimeRetryResult> {
    const disabledSnapshot = this.currentSubagentsDisabledRuntimeSnapshot();
    if (disabledSnapshot) return this.refuseSubagentChildRetryBecauseFeatureDisabled(input, disabledSnapshot);
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (runtime?.retryChildRun) return runtime.retryChildRun(input);
      return {
        run: this.store.getSubagentRun(input.run.id),
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Local text sub-agent retry execution is not configured; the retry request remains queued.",
      };
    }
    return this.retrySubagentChildRun(input);
  }

  private async resolveResolvedSubagentChildApprovalResponse(
    input: SubagentChildRuntimeApprovalResponseInput,
  ): Promise<SubagentChildRuntimeApprovalResponseResult> {
    const disabledSnapshot = this.currentSubagentsDisabledRuntimeSnapshot();
    if (disabledSnapshot) return this.refuseSubagentChildApprovalResponseBecauseFeatureDisabled(input, disabledSnapshot);
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (runtime?.resolveChildApprovalResponse) return runtime.resolveChildApprovalResponse(input);
      return {
        run: this.store.getSubagentRun(input.run.id),
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Local text sub-agent approval-response execution is not configured; the approval response remains queued.",
      };
    }
    return this.resolveSubagentChildApprovalResponse(input);
  }

  private currentSubagentsDisabledRuntimeSnapshot(): AmbientFeatureFlagSnapshot | undefined {
    const snapshot = this.currentFeatureFlagSnapshot();
    return isAmbientSubagentsEnabled(snapshot) ? undefined : snapshot;
  }

  private refuseSubagentChildRuntimeStartBecauseFeatureDisabled(
    input: SubagentChildRuntimeStartInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeStartResult {
    const current = this.store.getSubagentRun(input.run.id);
    const message = "ambient.subagents is disabled; refusing to start sub-agent child runtime.";
    if (current.closedAt || isSubagentTerminalStatus(current.status)) {
      return {
        started: false,
        run: current,
        message: current.closedAt
          ? "ambient.subagents is disabled; the sub-agent is closed and no child runtime will be started."
          : `ambient.subagents is disabled; the sub-agent is already ${current.status} and no child runtime will be started.`,
      };
    }
    if (current.status === "starting" || current.status === "running") {
      input.emitEvent({
        type: "status",
        source: "child_runtime",
        status: current.status,
        message: "ambient.subagents is disabled; existing active child runtime state is preserved, but no new child execution will be started.",
        details: {
          reason: "ambient_subagents_disabled",
          featureFlagSnapshot,
        },
      });
      this.store.appendSubagentRunEvent(current.id, {
        type: "subagent.child_runtime_refused",
        preview: this.subagentRuntimeFeatureDisabledRunEventPreview(current, {
          status: current.status,
          preservedActiveState: true,
          idempotencyKey: input.idempotencyKey,
          featureFlagSnapshot,
        }),
      });
      return {
        started: false,
        run: current,
        message: "ambient.subagents is disabled; existing active child runtime state was preserved and no new child execution was started.",
      };
    }
    const resultArtifact = {
      schemaVersion: "ambient-subagent-result-artifact-v1" as const,
      runId: current.id,
      status: "failed" as const,
      partial: false,
      summary: message,
      childThreadId: current.childThreadId,
    };
    const failed = this.store.markSubagentRunStatus(current.id, "failed", { resultArtifact });
    input.emitEvent({
      type: "error",
      source: "child_runtime",
      status: "failed",
      message,
      details: {
        reason: "ambient_subagents_disabled",
        featureFlagSnapshot,
      },
    });
    this.store.appendSubagentMailboxEvent(failed.id, {
      direction: "child_to_parent",
      type: "subagent.failed",
      payload: {
        status: "failed",
        error: message,
        reason: "ambient_subagents_disabled",
        childThreadId: failed.childThreadId,
      },
    });
    this.store.appendSubagentRunEvent(failed.id, {
      type: "subagent.child_runtime_refused",
      preview: this.subagentRuntimeFeatureDisabledRunEventPreview(failed, {
        status: "failed",
        idempotencyKey: input.idempotencyKey,
        featureFlagSnapshot,
      }),
    });
    this.recordSubagentGroupedCompletionIfNeeded(failed, message);
    return {
      started: false,
      run: failed,
      message,
    };
  }

  private refuseSubagentChildFollowupBecauseFeatureDisabled(
    input: SubagentChildRuntimeFollowupInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeFollowupResult {
    const current = this.store.getSubagentRun(input.run.id);
    const message = "ambient.subagents is disabled; refusing to deliver sub-agent follow-up. The follow-up remains queued.";
    input.emitEvent({
      type: "status",
      source: "followup_agent",
      status: current.status,
      message,
      details: {
        reason: "ambient_subagents_disabled",
        mailboxEventId: input.mailboxEvent.id,
        featureFlagSnapshot,
      },
    });
    this.store.appendSubagentRunEvent(current.id, {
      type: "subagent.followup_refused",
      preview: this.subagentRuntimeFeatureDisabledRunEventPreview(current, {
        mailboxEventId: input.mailboxEvent.id,
        idempotencyKey: input.idempotencyKey,
        featureFlagSnapshot,
      }),
    });
    return {
      run: current,
      accepted: false,
      mailboxEvent: input.mailboxEvent,
      message,
    };
  }

  private refuseSubagentChildRetryBecauseFeatureDisabled(
    input: SubagentChildRuntimeRetryInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeRetryResult {
    const current = this.store.getSubagentRun(input.run.id);
    const message = "ambient.subagents is disabled; refusing to retry sub-agent child work. The retry request remains queued.";
    input.emitEvent({
      type: "status",
      source: "retry_child",
      status: current.status,
      message,
      details: {
        reason: "ambient_subagents_disabled",
        mailboxEventId: input.mailboxEvent.id,
        featureFlagSnapshot,
      },
    });
    this.store.appendSubagentRunEvent(current.id, {
      type: "subagent.retry_refused",
      preview: this.subagentRuntimeFeatureDisabledRunEventPreview(current, {
        mailboxEventId: input.mailboxEvent.id,
        idempotencyKey: input.idempotencyKey,
        featureFlagSnapshot,
      }),
    });
    return {
      run: current,
      accepted: false,
      mailboxEvent: input.mailboxEvent,
      message,
    };
  }

  private refuseSubagentChildApprovalResponseBecauseFeatureDisabled(
    input: SubagentChildRuntimeApprovalResponseInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeApprovalResponseResult {
    const current = this.store.getSubagentRun(input.run.id);
    const message = "ambient.subagents is disabled; refusing to deliver child approval response. The approval response remains queued.";
    input.emitEvent({
      type: "status",
      source: "approval_response",
      status: current.status,
      message,
      details: {
        reason: "ambient_subagents_disabled",
        mailboxEventId: input.mailboxEvent.id,
        approvalId: input.approvalId,
        effectiveScope: input.effectiveScope,
        featureFlagSnapshot,
      },
    });
    this.store.appendSubagentRunEvent(current.id, {
      type: "subagent.approval_response.refused",
      preview: this.subagentRuntimeFeatureDisabledRunEventPreview(current, {
        mailboxEventId: input.mailboxEvent.id,
        approvalId: input.approvalId,
        effectiveScope: input.effectiveScope,
        idempotencyKey: input.idempotencyKey,
        featureFlagSnapshot,
      }),
    });
    return {
      run: current,
      accepted: false,
      mailboxEvent: input.mailboxEvent,
      message,
    };
  }

  private subagentRuntimeFeatureDisabledRunEventPreview(
    run: SubagentRunSummary,
    details: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      childRunId: run.id,
      childThreadId: run.childThreadId,
      parentRunId: run.parentRunId,
      parentThreadId: run.parentThreadId,
      canonicalTaskPath: run.canonicalTaskPath,
      reason: "ambient_subagents_disabled",
      ...details,
    };
  }

  private resolveSubagentChildApprovalResponse(
    input: SubagentChildRuntimeApprovalResponseInput,
  ): SubagentChildRuntimeApprovalResponseResult {
    const current = this.store.getSubagentRun(input.run.id);
    if (current.closedAt || isSubagentTerminalStatus(current.status)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: `Child runtime did not accept the approval response because the sub-agent is ${current.closedAt ? "closed" : current.status}.`,
      };
    }
    if (!this.permissions.respond || !this.permissions.listPending) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Ambient permission prompt responses are not available in this runtime; the child approval response remains queued.",
      };
    }
    const pending = this.permissions.listPending().find((request) =>
      request.id === input.approvalId && request.threadId === current.childThreadId
    );
    if (!pending) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: `Child approval ${input.approvalId} is not pending for child thread ${current.childThreadId}; the approval response remains queued.`,
      };
    }

    const deliveredMailbox = input.markMailboxDelivered();
    const responseMode = permissionPromptResponseModeForSubagentApproval(input.decision, input.effectiveScope);
    this.permissions.respond(input.approvalId, responseMode);
    const consumedMailbox = input.markMailboxConsumed();
    const resumed = current.status === "needs_attention"
      ? this.store.markSubagentRunStatus(current.id, "running")
      : this.store.getSubagentRun(current.id);
    input.emitEvent({
      type: "status",
      source: "approval_response",
      status: resumed.status,
      message: `Child approval response ${input.decision} was delivered to ${pending.toolName}.`,
      details: {
        approvalId: input.approvalId,
        mailboxEventId: consumedMailbox.id,
        deliveredAt: deliveredMailbox.deliveredAt,
        permissionResponseMode: responseMode,
        effectiveScope: input.effectiveScope,
      },
    });
    this.store.appendSubagentRunEvent(resumed.id, {
      type: "subagent.approval_response.consumed",
      preview: {
        approvalId: input.approvalId,
        mailboxEventId: consumedMailbox.id,
        deliveryState: consumedMailbox.deliveryState,
        deliveredAt: consumedMailbox.deliveredAt,
        decision: input.decision,
        effectiveScope: input.effectiveScope,
        permissionResponseMode: responseMode,
      },
    });
    return {
      run: this.store.getSubagentRun(resumed.id),
      accepted: true,
      mailboxEvent: consumedMailbox,
      message: "Child approval response was delivered and the parent remains blocked until the child completes or needs more attention.",
    };
  }

  private followupSubagentChildRun(input: SubagentChildRuntimeFollowupInput): SubagentChildRuntimeFollowupResult {
    const current = this.store.getSubagentRun(input.run.id);
    if (current.closedAt || isSubagentTerminalStatus(current.status)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: `Child runtime did not accept the follow-up because the sub-agent is ${current.closedAt ? "closed" : current.status}.`,
      };
    }
    if (this.subagentChildExecutions.has(current.id)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Child runtime is active; the follow-up remains queued for the next idle turn.",
      };
    }
    const deliveredMailbox = input.markMailboxDelivered();
    const running = this.store.markSubagentRunStatus(current.id, "running");
    input.emitEvent({
      type: "status",
      source: "followup_agent",
      status: "running",
      message: "Child Pi session accepted an idle follow-up turn.",
      details: {
        mailboxEventId: deliveredMailbox.id,
        previousStatus: current.status,
      },
    });
    this.store.appendSubagentRunEvent(running.id, {
      type: "subagent.followup_child_session_starting",
      preview: {
        mailboxEventId: deliveredMailbox.id,
        idempotencyKey: input.idempotencyKey,
        previousStatus: current.status,
        messagePreview: previewForSubagentRuntime(input.message, 500),
      },
    });
    const promise = this.runSubagentChildFollowupSession({
      ...input,
      run: running,
      mailboxEvent: deliveredMailbox,
      sessionKind: "followup",
    })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emit({
          type: "error",
          message: `Sub-agent child follow-up failed: ${message}`,
          threadId: running.childThreadId,
          workspacePath: agentRuntimeThreadWorkspacePath(this.store, running.childThreadId),
        });
      })
      .finally(() => {
        this.subagentChildExecutions.delete(running.id);
      });
    this.subagentChildExecutions.set(running.id, {
      childThreadId: running.childThreadId,
      promise,
      startedAt: new Date().toISOString(),
    });
    return {
      run: this.store.getSubagentRun(running.id),
      accepted: true,
      mailboxEvent: deliveredMailbox,
      message: "Child Pi session follow-up started in the visible child thread.",
    };
  }

  private retrySubagentChildRun(input: SubagentChildRuntimeRetryInput): SubagentChildRuntimeRetryResult {
    const current = this.store.getSubagentRun(input.run.id);
    if (current.closedAt) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Child runtime did not accept the retry because the sub-agent is closed.",
      };
    }
    if (this.subagentChildExecutions.has(current.id)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Child runtime is already active; the retry request remains queued.",
      };
    }
    if (!subagentStatusCanRetryInSameChildThread(current.status)) {
      return {
        run: current,
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: `Child runtime did not accept the retry because the sub-agent is ${current.status}.`,
      };
    }
    const deliveredMailbox = input.markMailboxDelivered();
    const running = this.store.markSubagentRunStatus(current.id, "running");
    input.emitEvent({
      type: "status",
      source: "retry_child",
      status: "running",
      message: "Child Pi session accepted a retry turn in the visible child thread.",
      details: {
        mailboxEventId: deliveredMailbox.id,
        previousStatus: current.status,
      },
    });
    this.store.appendSubagentRunEvent(running.id, {
      type: "subagent.retry_child_session_starting",
      preview: {
        mailboxEventId: deliveredMailbox.id,
        idempotencyKey: input.idempotencyKey,
        previousStatus: current.status,
        messagePreview: previewForSubagentRuntime(input.message, 500),
      },
    });
    const promise = this.runSubagentChildFollowupSession({
      ...input,
      run: running,
      mailboxEvent: deliveredMailbox,
    })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emit({
          type: "error",
          message: `Sub-agent child retry failed: ${message}`,
          threadId: running.childThreadId,
          workspacePath: agentRuntimeThreadWorkspacePath(this.store, running.childThreadId),
        });
      })
      .finally(() => {
        this.subagentChildExecutions.delete(running.id);
      });
    this.subagentChildExecutions.set(running.id, {
      childThreadId: running.childThreadId,
      promise,
      startedAt: new Date().toISOString(),
    });
    return {
      run: this.store.getSubagentRun(running.id),
      accepted: true,
      mailboxEvent: deliveredMailbox,
      message: "Child Pi session retry started in the visible child thread.",
    };
  }

  private startSubagentChildRun(input: SubagentChildRuntimeStartInput): SubagentChildRuntimeStartResult {
    const current = this.store.getSubagentRun(input.run.id);
    if (current.closedAt) throw new Error(`Cannot start closed sub-agent run ${current.id}.`);
    if (this.subagentChildExecutions.has(current.id)) {
      return {
        started: false,
        run: current,
        message: "Child runtime is already active for this sub-agent run.",
      };
    }
    if (isSubagentTerminalStatus(current.status)) {
      return {
        started: false,
        run: current,
        message: `Child runtime was not started because the sub-agent is already ${current.status}.`,
      };
    }

    const starting = this.store.markSubagentRunStatus(current.id, "starting");
    input.emitEvent({
      type: "status",
      source: "child_runtime",
      status: "starting",
      message: "Child Pi session is starting.",
    });
    this.store.appendSubagentRunEvent(starting.id, {
      type: "subagent.child_session_starting",
      preview: {
        childThreadId: starting.childThreadId,
        roleId: input.role.id,
        dependencyMode: input.dependencyMode,
        forkMode: input.forkMode,
        promptMode: input.promptMode,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const promise = this.runSubagentChildSession({ ...input, run: starting })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.emit({
          type: "error",
          message: `Sub-agent child run failed: ${message}`,
          threadId: starting.childThreadId,
          workspacePath: agentRuntimeThreadWorkspacePath(this.store, starting.childThreadId),
        });
      })
      .finally(() => {
        this.subagentChildExecutions.delete(starting.id);
      });
    this.subagentChildExecutions.set(starting.id, {
      childThreadId: starting.childThreadId,
      promise,
      startedAt: new Date().toISOString(),
    });
    return {
      started: true,
      run: this.store.getSubagentRun(starting.id),
      message: "Child Pi session started in the visible child thread.",
    };
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

  private async waitForSubagentChildRun(input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult> {
    const execution = this.subagentChildExecutions.get(input.run.id);
    if (!execution) {
      return {
        run: this.store.getSubagentRun(input.run.id),
        timedOut: false,
        outcome: { kind: "runtime_detached", reason: "no_child_execution_attached" },
      };
    }
    const initialApprovalWait = this.resolveSubagentChildPendingApprovalWait({
      run: input.run,
      emitEvent: input.emitEvent,
    });
    if (initialApprovalWait) return initialApprovalWait;
    const waitStartedAtMs = Date.now();
    const waitTimeoutMs = Math.max(0, Math.floor(input.timeoutMs));
    const waitDeadlineMs = waitStartedAtMs + waitTimeoutMs;
    const executionStartedMs = timestampMs(execution.startedAt) ?? waitStartedAtMs;
    const hardTimeoutMs = normalizedSubagentChildRuntimeHardTimeoutMs(input.run);
    let nextHeartbeatAtMs = waitStartedAtMs + Math.min(
      SUBAGENT_WAIT_HEARTBEAT_INTERVAL_MS,
      Math.max(1_000, Math.max(1, waitTimeoutMs)),
    );
    const childCompleted = Symbol("subagent-child-completed");
    const waitTick = Symbol("subagent-wait-tick");
    const childCompletion = execution.promise.then(() => childCompleted);
    while (true) {
      const latest = this.store.getSubagentRun(input.run.id);
      const approvalWait = this.resolveSubagentChildPendingApprovalWait({
        run: latest,
        emitEvent: input.emitEvent,
      });
      if (approvalWait) return approvalWait;
      const nowMs = Date.now();
      const activity = this.latestSubagentChildActivity(latest, execution, executionStartedMs);
      const childIdleElapsedMs = Math.max(0, nowMs - activity.atMs);
      const childHardElapsedMs = Math.max(0, nowMs - executionStartedMs);
      const waitOutcomeDetails = {
        childRunId: latest.id,
        childThreadId: latest.childThreadId,
        waitElapsedMs: nowMs - waitStartedAtMs,
        waitTimeoutMs,
        lastChildActivityAt: activity.at,
        lastChildActivitySource: activity.source,
        ...(activity.detail ? { lastChildActivityDetail: activity.detail } : {}),
        childIdleElapsedMs,
        childIdleTimeoutMs: SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS,
        childHardElapsedMs,
        childHardTimeoutMs: hardTimeoutMs,
      };
      if (childHardElapsedMs >= hardTimeoutMs) {
        return {
          run: await this.settleSubagentChildRuntimeBudgetExceeded({
            run: latest,
            execution,
            emitEvent: input.emitEvent,
            reason: "runtime_hard_cap_exceeded",
            limitMs: hardTimeoutMs,
            lastActivity: activity,
            idleElapsedMs: childIdleElapsedMs,
            elapsedMs: childHardElapsedMs,
          }),
          timedOut: true,
          outcome: {
            kind: "child_runtime_timeout",
            reason: "runtime_hard_cap_exceeded",
            details: waitOutcomeDetails,
          },
        };
      }
      if (childIdleElapsedMs >= SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS) {
        return {
          run: await this.settleSubagentChildRuntimeBudgetExceeded({
            run: latest,
            execution,
            emitEvent: input.emitEvent,
            reason: "runtime_idle_timeout",
            limitMs: SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS,
            lastActivity: activity,
            idleElapsedMs: childIdleElapsedMs,
            elapsedMs: childHardElapsedMs,
          }),
          timedOut: true,
          outcome: {
            kind: "child_runtime_timeout",
            reason: "runtime_idle_timeout",
            details: waitOutcomeDetails,
          },
        };
      }
      const waitRemainingMs = waitDeadlineMs - nowMs;
      if (waitRemainingMs <= 0) {
        input.emitEvent({
          type: "status",
          source: "wait_agent",
          status: latest.status,
          message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
          details: waitOutcomeDetails,
        });
        return {
          run: latest,
          timedOut: false,
          outcome: {
            kind: "progress_return",
            reason: "parent_wait_window_elapsed",
            details: waitOutcomeDetails,
          },
        };
      }
      if (nowMs >= nextHeartbeatAtMs) {
        input.emitEvent({
          type: "status",
          source: "wait_agent",
          status: latest.status,
          message: "wait_agent is still waiting on the live child runtime.",
          details: waitOutcomeDetails,
        });
        nextHeartbeatAtMs = nowMs + SUBAGENT_WAIT_HEARTBEAT_INTERVAL_MS;
      }
      const sleepMs = Math.max(
        1,
        Math.min(
          waitDeadlineMs - nowMs,
          nextHeartbeatAtMs - nowMs,
          SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS - childIdleElapsedMs,
          hardTimeoutMs - childHardElapsedMs,
        ),
      );
      const completion = await Promise.race([
        childCompletion,
        delaySubagentChildWaitTick(sleepMs).then(() => waitTick),
      ]);
      if (completion === childCompleted) {
        return {
          run: this.store.getSubagentRun(input.run.id),
          timedOut: false,
          outcome: { kind: "child_terminal" },
        };
      }
    }
  }

  private latestSubagentChildActivity(
    run: SubagentRunSummary,
    execution: SubagentChildExecutionRecord,
    fallbackMs: number,
  ): SubagentChildActivitySnapshot {
    let latest = activitySnapshotFromIso(execution.startedAt, "child_runtime", "execution started", fallbackMs);
    for (const value of [run.startedAt, run.updatedAt, run.createdAt]) {
      const candidate = activitySnapshotFromIso(value, "subagent_run", "run status changed", fallbackMs);
      if (candidate.atMs > latest.atMs) latest = candidate;
    }
    for (const message of this.store.listMessages(run.childThreadId)) {
      if (!message.content.trim() && message.role !== "tool") continue;
      const candidate = activitySnapshotFromIso(message.createdAt, `message:${message.role}`, `message ${message.id}`, fallbackMs);
      if (candidate.atMs > latest.atMs) latest = candidate;
    }
    for (const event of this.store.listSubagentRunEvents(run.id)) {
      const preview = event.preview;
      if (isRecord(preview) && preview.schemaVersion === "ambient-subagent-runtime-event-v1") {
        const source = typeof preview.source === "string" ? preview.source : undefined;
        if (source === "wait_agent" || source === "cancel_agent") continue;
        const eventType = typeof preview.type === "string" ? preview.type : undefined;
        const candidate = activitySnapshotFromIso(
          event.createdAt,
          source ? `runtime_event:${source}` : "runtime_event",
          eventType ? `${eventType} event ${event.sequence}` : `runtime event ${event.sequence}`,
          fallbackMs,
        );
        if (candidate.atMs > latest.atMs) latest = candidate;
        continue;
      }
      if (event.type === "subagent.runtime_event") continue;
      if (event.type.includes("wait_barrier") || event.type.includes("wait_agent")) continue;
      const candidate = activitySnapshotFromIso(event.createdAt, `run_event:${event.type}`, `run event ${event.sequence}`, fallbackMs);
      if (candidate.atMs > latest.atMs) latest = candidate;
    }
    return latest;
  }

  private resolveSubagentChildPendingApprovalWait(input: {
    run: SubagentRunSummary;
    emitEvent: SubagentRuntimeEventEmitter;
  }): SubagentChildRuntimeWaitResult | undefined {
    const current = this.store.getSubagentRun(input.run.id);
    if (current.closedAt || isSubagentTerminalStatus(current.status)) return undefined;
    const approvalRequests = this.pendingSubagentPermissionApprovalRequests(current);
    if (!approvalRequests.length) return undefined;
    const needsAttention = current.status === "needs_attention"
      ? current
      : this.store.markSubagentRunStatus(current.id, "needs_attention");
    input.emitEvent({
      type: "status",
      status: "needs_attention",
      message: "Child runtime is waiting for parent approval.",
      details: {
        approvalIds: approvalRequests.map((approval) => approval.approvalId),
        pendingApprovalCount: approvalRequests.length,
      },
    });
    return {
      run: needsAttention,
      timedOut: false,
      outcome: { kind: "approval_wait" },
      approvalRequests,
    };
  }

  private pendingSubagentPermissionApprovalRequests(run: SubagentRunSummary): SubagentChildRuntimeApprovalRequest[] {
    if (!this.permissions.listPending) return [];
    return this.permissions
      .listPending()
      .filter((request) => request.threadId === run.childThreadId)
      .map((request) => subagentApprovalRequestFromPermissionRequest(run, request));
  }

  private async settleSubagentChildRuntimeBudgetExceeded(input: {
    run: SubagentRunSummary;
    execution: SubagentChildExecutionRecord;
    emitEvent: SubagentRuntimeEventEmitter;
    reason?: "runtime_budget_exceeded" | "runtime_hard_cap_exceeded" | "runtime_idle_timeout";
    limitMs?: number;
    elapsedMs?: number;
    idleElapsedMs?: number;
    lastActivity?: SubagentChildActivitySnapshot;
  }): Promise<SubagentRunSummary> {
    const current = this.store.getSubagentRun(input.run.id);
    if (["completed", "failed", "stopped", "cancelled", "timed_out", "aborted_partial"].includes(current.status)) {
      return current;
    }
    const reason = input.reason ?? "runtime_budget_exceeded";
    const runtimeTimeout = reason === "runtime_idle_timeout" || reason === "runtime_hard_cap_exceeded";
    const role = current.roleProfileSnapshot;
    const partial = runtimeTimeout ? false : role.guardPolicy.allowPartialResult;
    const status = runtimeTimeout ? "timed_out" : partial ? "aborted_partial" : "failed";
    const maxRuntimeMs = input.limitMs ?? role.guardPolicy.maxRuntimeMs;
    const startedMs = Date.parse(input.execution.startedAt);
    const elapsedMs = input.elapsedMs ?? (Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : undefined);
    const transcriptPath = subagentTranscriptPath(current.childThreadId);
    const limitLabel =
      reason === "runtime_idle_timeout"
        ? `${maxRuntimeMs}ms child idle timeout`
        : reason === "runtime_hard_cap_exceeded"
          ? `${maxRuntimeMs}ms child runtime hard cap`
          : `${maxRuntimeMs}ms role runtime budget`;
    const summary = partial
      ? `Child exceeded its ${limitLabel} before completing. Partial transcript is retained at ${transcriptPath}.`
      : `Child exceeded its ${limitLabel} and this role does not allow partial success. Transcript is retained at ${transcriptPath}.`;
    const resultArtifact = {
      schemaVersion: "ambient-subagent-result-artifact-v1" as const,
      runId: current.id,
      status,
      partial,
      summary,
      childThreadId: current.childThreadId,
      artifactPath: transcriptPath,
    };
    const settled = this.store.markSubagentRunStatus(current.id, status, {
      resultArtifact,
    });
    input.emitEvent({
      type: partial ? "status" : "error",
      status,
      source: "child_runtime",
      message: summary,
      artifactPath: transcriptPath,
      details: {
        reason,
        maxRuntimeMs,
        ...(elapsedMs !== undefined ? { elapsedMs } : {}),
        ...(input.idleElapsedMs !== undefined ? { idleElapsedMs: input.idleElapsedMs } : {}),
        ...(input.lastActivity ? {
          lastChildActivityAt: input.lastActivity.at,
          lastChildActivitySource: input.lastActivity.source,
          ...(input.lastActivity.detail ? { lastChildActivityDetail: input.lastActivity.detail } : {}),
        } : {}),
        startedAt: input.execution.startedAt,
      },
    });
    this.store.appendSubagentMailboxEvent(settled.id, {
      direction: "child_to_parent",
      type: partial ? "subagent.result" : "subagent.failed",
      payload: {
        status,
        partial,
        summary,
        childThreadId: settled.childThreadId,
        artifactPath: transcriptPath,
        reason,
        maxRuntimeMs,
        ...(elapsedMs !== undefined ? { elapsedMs } : {}),
        ...(input.idleElapsedMs !== undefined ? { idleElapsedMs: input.idleElapsedMs } : {}),
        ...(input.lastActivity ? {
          lastChildActivityAt: input.lastActivity.at,
          lastChildActivitySource: input.lastActivity.source,
          ...(input.lastActivity.detail ? { lastChildActivityDetail: input.lastActivity.detail } : {}),
        } : {}),
      },
    });
    this.store.appendSubagentRunEvent(settled.id, {
      type: `subagent.${reason}`,
      preview: {
        childRunId: settled.id,
        childThreadId: settled.childThreadId,
        status,
        partial,
        reason,
        maxRuntimeMs,
        ...(elapsedMs !== undefined ? { elapsedMs } : {}),
        ...(input.idleElapsedMs !== undefined ? { idleElapsedMs: input.idleElapsedMs } : {}),
        ...(input.lastActivity ? {
          lastChildActivityAt: input.lastActivity.at,
          lastChildActivitySource: input.lastActivity.source,
          ...(input.lastActivity.detail ? { lastChildActivityDetail: input.lastActivity.detail } : {}),
        } : {}),
        startedAt: input.execution.startedAt,
        artifactPath: transcriptPath,
      },
    });
    this.resolveTerminalChildWaitBarriers(settled, reason);
    const parentMailboxEvent = this.store.appendSubagentLifecycleInterruptionParentMailboxEvent({
      run: settled,
      previousStatus: current.status,
      source: reason,
      reason: summary,
      resultArtifact,
      waitBarrierIds: this.store
        .listSubagentWaitBarriersForParentRun(settled.parentRunId)
        .filter((barrier) => barrier.status === "waiting_on_children" && barrier.childRunIds.includes(settled.id))
        .map((barrier) => barrier.id),
      idempotencyKey: reason,
    });
    this.emitSubagentParentMailboxEventUpdated(parentMailboxEvent);
    await this.abort(input.execution.childThreadId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        type: "error",
        message: `Sub-agent child runtime budget abort failed: ${message}`,
        threadId: input.execution.childThreadId,
        workspacePath: agentRuntimeThreadWorkspacePath(this.store, input.execution.childThreadId),
      });
    });
    return this.store.getSubagentRun(settled.id);
  }

  private async cancelSubagentChildRun(input: SubagentChildRuntimeCancelInput): Promise<SubagentChildRuntimeCancelResult> {
    const current = this.store.getSubagentRun(input.run.id);
    if (current.closedAt) return { run: current, cancelled: false };
    const execution = this.subagentChildExecutions.get(current.id);
    if (execution) {
      await this.abort(execution.childThreadId, { skipSubagentChildCancellation: true }).catch(() => undefined);
    }
    const latest = this.store.getSubagentRun(current.id);
    if (latest.status === "cancelled") return { run: latest, cancelled: true };
    if (isSubagentTerminalStatus(latest.status)) return { run: latest, cancelled: false };
    const cancelled = this.store.markSubagentRunStatus(latest.id, "cancelled", {
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: latest.id,
        status: "cancelled",
        partial: false,
        summary: input.reason,
        childThreadId: latest.childThreadId,
      },
    });
    input.emitEvent({
      type: "cancelled",
      status: "cancelled",
      message: input.reason,
    });
    this.store.appendSubagentMailboxEvent(cancelled.id, {
      direction: "child_to_parent",
      type: "subagent.cancelled",
      payload: {
        status: "cancelled",
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { run: cancelled, cancelled: true };
  }

  private async runSubagentChildSession(input: SubagentChildRuntimeStartInput): Promise<void> {
    const running = this.store.markSubagentRunStatus(input.run.id, "running");
    input.emitEvent({
      type: "started",
      source: "child_runtime",
      status: "running",
      message: "Child Pi session is running in the visible child thread.",
    });
    const childThread = this.store.getThread(running.childThreadId);
    const parentContext = subagentParentContextForMessages(this.store.listMessages(input.parentThread.id), input.forkMode);
    const promptInput = {
      run: running,
      role: input.role,
      task: input.task,
      forkMode: input.forkMode,
      promptMode: input.promptMode,
      toolScope: input.toolScope,
      inheritedContext: parentContext.inherited,
      strippedRefs: parentContext.stripped,
      parentThreadTitle: input.parentThread.title,
    };
    const prompt = buildSubagentChildPrompt(promptInput);
    this.store.recordSubagentPromptSnapshot(running.id, {
      prompt,
      snapshot: buildSubagentPromptSnapshot(promptInput),
    });
    this.store.appendSubagentRunEvent(running.id, {
      type: "subagent.child_session_started",
      preview: {
        childThreadId: running.childThreadId,
        promptChars: prompt.length,
        inheritedContextCount: parentContext.inherited.length,
        strippedRefCount: parentContext.stripped.length,
        toolScopeSnapshotSequence: input.toolScopeSnapshot.sequence,
      },
    });
    input.emitEvent({
      type: "status",
      source: "child_runtime",
      status: "running",
      message: "Child prompt prepared and stored.",
      details: {
        promptChars: prompt.length,
        inheritedContextCount: parentContext.inherited.length,
        strippedRefCount: parentContext.stripped.length,
        toolScopeSnapshotSequence: input.toolScopeSnapshot.sequence,
      },
    });

    try {
      let childMessageCountBeforeSend = this.store.listMessages(running.childThreadId).length;
      await this.send({
        threadId: running.childThreadId,
        content: prompt,
        visibleUserContent: `Sub-agent task: ${previewForSubagentRuntime(input.task, 240)}`,
        modelContentOverride: prompt,
        permissionMode: childThread.permissionMode,
        collaborationMode: "agent",
        model: running.modelRuntimeSnapshot.profile.modelId,
        thinkingLevel: childThread.thinkingLevel,
        delivery: "prompt",
        preserveActiveThread: true,
        internal: true,
      } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });

      let completion = this.completeSubagentChildTurnAfterSend({
        run: running,
        role: input.role,
        childMessageCountBeforeSend,
        emitEvent: input.emitEvent,
      });
      for (let attempt = 1; completion.status === "needs_followup" && attempt <= MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS; attempt += 1) {
        const latestRun = this.store.getSubagentRun(running.id);
        if (latestRun.status !== "running") return;
        const followupPrompt = buildSubagentFollowupPrompt({
          message: completion.message,
          role: input.role,
          run: latestRun,
        });
        childMessageCountBeforeSend = this.store.listMessages(latestRun.childThreadId).length;
        this.store.appendSubagentRunEvent(latestRun.id, {
          type: "subagent.internal_post_tool_followup_started",
          preview: {
            attempt,
            maxAttempts: MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS,
            reason: completion.reason,
            promptChars: followupPrompt.length,
          },
        });
        await this.send({
          threadId: latestRun.childThreadId,
          content: followupPrompt,
          visibleUserContent: `Sub-agent runtime follow-up: ${previewForSubagentRuntime(completion.reason, 240)}`,
          modelContentOverride: followupPrompt,
          permissionMode: childThread.permissionMode,
          collaborationMode: "agent",
          model: latestRun.modelRuntimeSnapshot.profile.modelId,
          thinkingLevel: childThread.thinkingLevel,
          delivery: "follow-up",
          preserveActiveThread: true,
          internal: true,
        } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });
        completion = this.completeSubagentChildTurnAfterSend({
          run: latestRun,
          role: input.role,
          childMessageCountBeforeSend,
          emitEvent: input.emitEvent,
        });
      }
      if (completion.status === "needs_followup") {
        this.recordSubagentChildFollowupExhausted({
          run: this.store.getSubagentRun(running.id),
          completion,
        });
        throw new Error(`${completion.reason} Ambient exhausted automatic child post-tool finalization follow-ups.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = this.store.getSubagentRun(running.id);
      if (childSessionErrorShouldPreserveTerminalStatus(latest.status)) return;
      const failed = this.store.markSubagentRunStatus(running.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: running.id,
          status: "failed",
          partial: false,
          summary: message,
          childThreadId: running.childThreadId,
        },
      });
      input.emitEvent({
        type: "error",
        source: "child_runtime",
        status: "failed",
        message,
      });
      this.store.appendSubagentMailboxEvent(failed.id, {
        direction: "child_to_parent",
        type: "subagent.failed",
        payload: {
          status: "failed",
          error: message,
          childThreadId: failed.childThreadId,
        },
      });
      this.store.appendSubagentRunEvent(failed.id, {
        type: "subagent.child_session_failed",
        preview: {
          error: message,
        },
      });
      this.recordSubagentGroupedCompletionIfNeeded(failed, message);
      throw error;
    }
  }

  private async runSubagentChildFollowupSession(
    input: SubagentChildRuntimeFollowupInput & {
      run: SubagentRunSummary;
      mailboxEvent: SubagentMailboxEventSummary;
      sessionKind?: "followup" | "retry";
    },
  ): Promise<void> {
    const role = input.run.roleProfileSnapshot;
    const childThread = this.store.getThread(input.run.childThreadId);
    const sessionKind = input.sessionKind ?? "followup";
    const runtimeEventSource: SubagentRuntimeEventSource = sessionKind === "retry" ? "retry_child" : "followup_agent";
    const sessionLabel = sessionKind === "retry" ? "retry" : "follow-up";
    const followupPrompt = buildSubagentFollowupPrompt({
      message: input.message,
      role,
      run: input.run,
    });
    try {
      let childMessageCountBeforeSend = this.store.listMessages(input.run.childThreadId).length;
      this.store.appendSubagentRunEvent(input.run.id, {
        type: sessionKind === "retry" ? "subagent.retry_child_session_started" : "subagent.followup_child_session_started",
        preview: {
          mailboxEventId: input.mailboxEvent.id,
          promptChars: followupPrompt.length,
          messagePreview: previewForSubagentRuntime(input.message, 500),
        },
      });
      await this.send({
        threadId: input.run.childThreadId,
        content: followupPrompt,
        visibleUserContent: `Child ${sessionLabel}: ${previewForSubagentRuntime(input.message, 240)}`,
        modelContentOverride: followupPrompt,
        permissionMode: childThread.permissionMode,
        collaborationMode: "agent",
        model: input.run.modelRuntimeSnapshot.profile.modelId,
        thinkingLevel: childThread.thinkingLevel,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
      } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });
      const consumedMailbox = input.markMailboxConsumed();
      this.store.appendSubagentRunEvent(input.run.id, {
        type: sessionKind === "retry" ? "subagent.retry_consumed" : "subagent.followup_consumed",
        preview: {
          mailboxEventId: consumedMailbox.id,
          deliveryState: consumedMailbox.deliveryState,
          deliveredAt: consumedMailbox.deliveredAt,
        },
      });
      let completion = this.completeSubagentChildTurnAfterSend({
        run: input.run,
        role,
        childMessageCountBeforeSend,
        emitEvent: input.emitEvent,
      });
      for (let attempt = 1; completion.status === "needs_followup" && attempt <= MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS; attempt += 1) {
        const latestRun = this.store.getSubagentRun(input.run.id);
        if (latestRun.status !== "running") return;
        const internalFollowupPrompt = buildSubagentFollowupPrompt({
          message: completion.message,
          role,
          run: latestRun,
        });
        childMessageCountBeforeSend = this.store.listMessages(latestRun.childThreadId).length;
        this.store.appendSubagentRunEvent(latestRun.id, {
          type: "subagent.internal_post_tool_followup_started",
          preview: {
            attempt,
            maxAttempts: MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS,
            reason: completion.reason,
            sourceMailboxEventId: input.mailboxEvent.id,
            promptChars: internalFollowupPrompt.length,
          },
        });
        await this.send({
          threadId: latestRun.childThreadId,
          content: internalFollowupPrompt,
          visibleUserContent: `Child runtime follow-up: ${previewForSubagentRuntime(completion.reason, 240)}`,
          modelContentOverride: internalFollowupPrompt,
          permissionMode: childThread.permissionMode,
          collaborationMode: "agent",
          model: latestRun.modelRuntimeSnapshot.profile.modelId,
          thinkingLevel: childThread.thinkingLevel,
          delivery: "follow-up",
          preserveActiveThread: true,
          internal: true,
        } as RuntimeSendMessageInput, { awaitInternalRetryCompletion: true });
        completion = this.completeSubagentChildTurnAfterSend({
          run: latestRun,
          role,
          childMessageCountBeforeSend,
          emitEvent: input.emitEvent,
        });
      }
      if (completion.status === "needs_followup") {
        this.recordSubagentChildFollowupExhausted({
          run: this.store.getSubagentRun(input.run.id),
          completion,
        });
        throw new Error(`${completion.reason} Ambient exhausted automatic child post-tool finalization follow-ups.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = this.store.getSubagentRun(input.run.id);
      if (childSessionErrorShouldPreserveTerminalStatus(latest.status)) return;
      const failedMailbox = this.store.updateSubagentMailboxEventDeliveryState(input.mailboxEvent.id, "failed");
      const failed = this.store.markSubagentRunStatus(input.run.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: input.run.id,
          status: "failed",
          partial: false,
          summary: message,
          childThreadId: input.run.childThreadId,
        },
      });
      input.emitEvent({
        type: "error",
        source: runtimeEventSource,
        status: "failed",
        message,
      });
      this.store.appendSubagentMailboxEvent(failed.id, {
        direction: "child_to_parent",
        type: "subagent.failed",
        payload: {
          status: "failed",
          error: message,
          childThreadId: failed.childThreadId,
          sourceMailboxEventId: failedMailbox.id,
        },
      });
      this.store.appendSubagentRunEvent(failed.id, {
        type: "subagent.followup_child_session_failed",
        preview: {
          mailboxEventId: failedMailbox.id,
          deliveryState: failedMailbox.deliveryState,
          error: message,
        },
      });
      this.recordSubagentGroupedCompletionIfNeeded(failed, message);
      throw error;
    }
  }

  private recordSubagentChildFollowupExhausted(input: {
    run: SubagentRunSummary;
    completion: Extract<SubagentChildTurnCompletion, { status: "needs_followup" }>;
  }): void {
    const preview = {
      reason: input.completion.reason,
      followupKind: input.completion.followupKind,
      maxAttempts: MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS,
      terminalStatus: "failed",
    };
    this.store.appendSubagentRunEvent(input.run.id, {
      type: input.completion.followupKind === "result_contract"
        ? "subagent.result_contract_repair_exhausted"
        : "subagent.post_tool_followup_exhausted",
      preview,
    });
  }

  private completeSubagentChildTurnAfterSend(input: {
    run: SubagentRunSummary;
    role: SubagentRunSummary["roleProfileSnapshot"];
    childMessageCountBeforeSend: number;
    emitEvent: SubagentRuntimeEventEmitter;
  }): SubagentChildTurnCompletion {
    const latest = this.store.getSubagentRun(input.run.id);
    if (latest.status === "cancelled" || latest.status === "stopped") return { status: "terminal" };
    const childMessages = this.store.listMessages(input.run.childThreadId);
    const sendMessages = childMessages.slice(input.childMessageCountBeforeSend);
    this.recordSubagentChildToolRuntimeEvents({
      childThread: this.store.getThread(input.run.childThreadId),
      messages: sendMessages,
      emitEvent: input.emitEvent,
    });
    const postToolFollowup = subagentPostToolFollowupRequest(sendMessages, input.role);
    if (postToolFollowup) {
      input.emitEvent({
        type: "status",
        source: "child_runtime",
        status: "running",
        message: postToolFollowup.reason,
      });
      this.store.appendSubagentRunEvent(input.run.id, {
        type: "subagent.post_tool_followup_required",
        preview: {
          reason: postToolFollowup.reason,
          childThreadId: input.run.childThreadId,
        },
      });
      return {
        status: "needs_followup",
        reason: postToolFollowup.reason,
        message: postToolFollowup.message,
        followupKind: "post_tool",
      };
    }
    const latestAssistantMessage =
      latestSubagentAssistantResultMessageForThread(sendMessages) ??
      latestAssistantMessageAfterLastToolForMessages(sendMessages);
    const assistantStatus = latestAssistantMessage?.metadata?.status;
    if (assistantStatus === "error" || assistantStatus === "aborted") {
      throw new Error(latestAssistantMessage?.content.trim() || `Child run ended with assistant status ${assistantStatus}.`);
    }
    const assistantText = latestAssistantMessage?.content ?? "";
    if (assistantText.trim()) {
      const assistantTextArtifactPath = normalizedSubagentRuntimeTextLength(assistantText) > 1200
        ? subagentTranscriptPath(input.run.childThreadId)
        : undefined;
      input.emitEvent({
        type: "assistant_delta",
        source: "child_runtime",
        textPreview: assistantText,
        ...(assistantTextArtifactPath ? { artifactPath: assistantTextArtifactPath } : {}),
      });
    }
    const disposition = classifySubagentAssistantResult(assistantText, input.role);
    const resultContractFollowup = subagentResultContractFollowupRequest(disposition, input.role, assistantText);
    if (resultContractFollowup) {
      input.emitEvent({
        type: "status",
        source: "child_runtime",
        status: "running",
        message: resultContractFollowup.reason,
      });
      this.store.appendSubagentRunEvent(input.run.id, {
        type: "subagent.result_contract_followup_required",
        preview: {
          reason: resultContractFollowup.reason,
          childThreadId: input.run.childThreadId,
          hadAssistantText: assistantText.trim().length > 0,
        },
      });
      return {
        status: "needs_followup",
        reason: resultContractFollowup.reason,
        message: resultContractFollowup.message,
        followupKind: "result_contract",
      };
    }
    if (disposition.status === "needs_attention") {
      const needsAttention = this.store.markSubagentRunStatus(input.run.id, "needs_attention");
      input.emitEvent({
        type: "status",
        source: "child_runtime",
        status: "needs_attention",
        message: previewForSubagentRuntime(disposition.summary, 600),
      });
      this.store.appendSubagentMailboxEvent(needsAttention.id, {
        direction: "child_to_parent",
        type: "subagent.needs_attention",
        payload: {
          status: "needs_attention",
          summary: disposition.summary,
          childThreadId: needsAttention.childThreadId,
          ...(disposition.structuredOutput ? { structuredOutput: disposition.structuredOutput } : {}),
        },
      });
      this.store.appendSubagentRunEvent(needsAttention.id, {
        type: "subagent.needs_attention",
        preview: {
          status: "needs_attention",
          summaryPreview: previewForSubagentRuntime(disposition.summary, 500),
          structuredOutputValid: Boolean(disposition.structuredOutput),
        },
      });
      return { status: "terminal" };
    }
    const result = this.store.markSubagentRunStatus(input.run.id, disposition.status, {
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: input.run.id,
        status: disposition.status,
        partial: disposition.partial,
        summary: disposition.summary,
        childThreadId: input.run.childThreadId,
        ...(disposition.structuredOutput ? { structuredOutput: disposition.structuredOutput } : {}),
        ...(disposition.reason ? { guardReason: disposition.reason } : {}),
        ...(disposition.explicitStatus ? { explicitStatus: disposition.explicitStatus } : {}),
      },
    });
    input.emitEvent({
      type: result.status === "failed" ? "error" : "completed",
      source: "child_runtime",
      status: result.status,
      message: previewForSubagentRuntime(disposition.summary, 600),
    });
    this.store.appendSubagentMailboxEvent(result.id, {
      direction: "child_to_parent",
      type: disposition.status === "failed" ? "subagent.failed" : "subagent.result",
      payload: {
        status: disposition.status,
        partial: disposition.partial,
        summary: disposition.summary,
        childThreadId: result.childThreadId,
        ...(disposition.structuredOutput ? { structuredOutput: disposition.structuredOutput } : {}),
        ...(disposition.reason ? { guardReason: disposition.reason } : {}),
      },
    });
    this.store.appendSubagentRunEvent(result.id, {
      type: disposition.status === "failed" ? "subagent.result_failed" : "subagent.result_ready",
      preview: {
        status: disposition.status,
        partial: disposition.partial,
        summaryPreview: previewForSubagentRuntime(disposition.summary, 500),
        structuredOutputValid: Boolean(disposition.structuredOutput),
        ...(disposition.reason ? { guardReason: disposition.reason } : {}),
      },
    });
    this.recordSubagentGroupedCompletionIfNeeded(result, disposition.summary);
    this.resolveTerminalChildWaitBarriers(result, disposition.status);
    return { status: "terminal" };
  }

  private recordSubagentChildToolRuntimeEvents(input: {
    childThread: ThreadSummary;
    messages: ChatMessage[];
    emitEvent: SubagentRuntimeEventEmitter;
  }): void {
    for (const message of input.messages) {
      if (message.role !== "tool") continue;
      const metadata = message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
        ? message.metadata as Record<string, unknown>
        : {};
      const toolName = stringMetadata(metadata.toolName) ?? stringMetadata(metadata.registeredName);
      if (!toolName) continue;
      const status = stringMetadata(metadata.status);
      if (status !== "done" && status !== "error") continue;
      const toolCallId = stringMetadata(metadata.toolCallId);
      const rawArtifactPath = stringMetadata(metadata.artifactPath);
      const artifactPath = normalizeWorkspaceArtifactPath(rawArtifactPath, input.childThread.workspacePath);
      const mutatingCategory = status === "done" ? subagentMutationCategoryForChildTool(toolName) : undefined;
      const attemptedCategory = status === "error" ? subagentMutationCategoryForChildTool(toolName) : undefined;
      const path = normalizeWorkspaceArtifactPath(
        subagentToolInputPathFromMessage(message, toolName, input.childThread.workspacePath),
        input.childThread.workspacePath,
      );
      const worktree = input.childThread.gitWorktree;
      const worktreeIsolated = Boolean(
        worktree?.status === "active" &&
          Boolean(worktree.worktreePath) &&
          input.childThread.workspacePath === worktree.worktreePath,
      );
      const approval = mutatingCategory
        ? this.subagentToolApprovalProvenance(input.childThread, toolName, toolCallId)
        : undefined;
      input.emitEvent({
        type: "tool_result",
        source: "child_runtime",
        toolName,
        ...(artifactPath ? { artifactPath } : {}),
        details: {
          status,
          result: status === "done" ? "completed" : "error",
          permissionMode: input.childThread.permissionMode,
          ...(toolCallId ? { toolCallId } : {}),
          ...(artifactPath ? { artifactPath } : {}),
          ...(path ? { path } : {}),
          ...(mutatingCategory ? { category: mutatingCategory } : {}),
          ...(attemptedCategory ? { attemptedCategory } : {}),
          ...(worktree?.worktreePath ? { worktreePath: worktree.worktreePath, worktreeIsolated } : {}),
          ...(approval ? { approvalId: approval.id, approvalSource: approval.source } : {}),
        },
      });
    }
  }

  private subagentToolApprovalProvenance(
    childThread: ThreadSummary,
    toolName: string,
    toolCallId: string | undefined,
  ): { id: string; source: string } {
    const matchingAudit = this.store.listPermissionAudit(100).find((entry) =>
      entry.threadId === childThread.id &&
      entry.toolName === toolName &&
      entry.decision === "allowed"
    );
    if (matchingAudit) {
      return {
        id: matchingAudit.grantId ?? matchingAudit.id,
        source: matchingAudit.grantId ? "permission_grant" : matchingAudit.decisionSource ?? "permission_audit",
      };
    }
    return {
      id: [
        "ambient-policy",
        childThread.id,
        childThread.permissionMode,
        toolName,
        toolCallId,
      ].filter(Boolean).join(":"),
      source: "permission_policy",
    };
  }

  private recordSubagentGroupedCompletionIfNeeded(run: SubagentRunSummary, summary: string): void {
    if (run.dependencyMode !== "optional_background") return;
    const notification = this.store.upsertSubagentGroupedCompletionNotification({
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      parentMessageId: run.parentMessageId,
      child: {
        runId: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        roleId: run.roleId,
        status: run.status,
        summary: previewForSubagentRuntime(summary, 1200),
        completedAt: run.completedAt,
      },
    });
    const payload = notification.payload && typeof notification.payload === "object" && !Array.isArray(notification.payload)
      ? notification.payload as Record<string, unknown>
      : {};
    this.store.appendSubagentRunEvent(run.id, {
      type: "subagent.grouped_completion_notified",
      preview: {
        parentMailboxEventId: notification.id,
        notificationCount: typeof payload.notificationCount === "number" ? payload.notificationCount : undefined,
      },
    });
  }

  private async createWorkflowRecordingReviewSession(thread: ThreadSummary): Promise<PiSession> {
    const appWorkspace = this.store.getWorkspace();
    const workspace: WorkspaceState = {
      path: thread.workspacePath,
      name: basename(thread.workspacePath) || thread.workspacePath,
      statePath: appWorkspace.statePath,
      sessionPath: appWorkspace.sessionPath,
    };
    const provider = getAmbientProviderStatus(thread.model);
    const apiKey = readAmbientApiKey();
    const agentDir = join(workspace.statePath, "pi");
    const reviewSessionDir = join(workspace.sessionPath, thread.id, "workflow-recording-review", randomUUID());
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(reviewSessionDir, { recursive: true });

    const model = ambientModel(thread.model, normalizeAmbientBaseUrl(provider.baseUrl));
    const settingsManager = SettingsManager.create(workspace.path, agentDir);
    const compactionSettings = this.store.getCompactionSettings();
    const retryOverrides = piRetryOverridesFromModelRuntimeSettings({
      ...this.store.getModelRuntimeSettings(),
      aggressiveRetries: true,
    });
    settingsManager.applyOverrides({
      compaction: {
        enabled: compactionSettings.autoCompactionEnabled,
        reserveTokens: compactionSettings.reserveTokens,
        keepRecentTokens: compactionSettings.keepRecentTokens,
      },
      ...(retryOverrides ? { retry: retryOverrides } : {}),
    });

    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    if (apiKey) authStorage.setRuntimeApiKey("ambient", apiKey);
    const resourceLoader = new DefaultResourceLoader({
      cwd: workspace.path,
      agentDir,
      settingsManager,
      agentsFilesOverride: (base) => ({
        agentsFiles: workspaceBoundedAgentContextFiles({
          contextFiles: base.agentsFiles,
          workspacePath: workspace.path,
          agentDir,
        }),
      }),
      extensionFactories: [
        createAmbientProviderExtension(model),
        createAmbientProductContextExtension(),
        this.createContextAccountingExtension(thread.id, model),
      ],
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: workspace.path,
      agentDir,
      authStorage,
      model,
      resourceLoader,
      sessionManager: enableAtomicPiSessionPersistence(SessionManager.create(workspace.path, reviewSessionDir)),
      settingsManager,
      thinkingLevel: thread.thinkingLevel,
      customTools: createWorkflowRecordingReviewTools({
        threadId: thread.id,
        getThread: (id) => this.store.getThread(id),
        updateWorkflowRecordingReviewDraft: (id, draft, options) => this.store.updateWorkflowRecordingReviewDraft(id, draft, options),
        emit: (event) => this.emit(event),
      }),
      activeTools: [...WORKFLOW_RECORDING_REVIEW_ACTIVE_TOOL_NAMES],
      includeAllExtensionTools: false,
    });
    session.agent.toolExecution = "sequential";
    await session.bindExtensions({});
    this.recordContextUsageSnapshot(thread.id, session, "Workflow recording review is using a dedicated Ambient session.");
    return session;
  }

  private markPluginToolsStale(threadId: string): void {
    this.stalePluginToolThreads.add(threadId);
    this.emit({ type: "plugin-catalog-updated" });
  }

  private revokePluginGrantsForLabels(labelPrefixes: string[]): number {
    return revokePluginPermissionGrantsForLabelPrefixes({
      labelPrefixes,
    }, {
      store: this.store,
    });
  }

  private revokeMcpPermissionGrantsForDescriptorDrift(input: {
    serverId: string;
    workloadName: string;
    previousDescriptorHash?: string;
    descriptorHash?: string;
  }): number {
    return revokeMcpPermissionGrantsForDescriptorDriftWithRuntimeBridge(input, {
      store: this.store,
      emitPermissionGrantRevoked: (grant) => this.emit({ type: "permission-grant-revoked", grant }),
    });
  }

  private async resolveFirstPartyPluginPermission(input: {
    thread: ThreadSummary;
    workspace: WorkspaceState;
    toolName: string;
    title: string;
    message: string;
    detail: string;
    risk?: PermissionRisk;
    reusableScopes?: PermissionGrantScopeKind[];
    grantTargetLabel: string;
    grantTargetIdentity?: string;
    grantConditions?: Record<string, unknown>;
    requireFreshPrompt?: boolean;
    allowedReason: string;
    deniedReason: string;
  }): Promise<boolean> {
    return resolveFirstPartyPluginPermissionWithRuntimeBridge(input, {
      store: this.store,
      requestPermission: (request, options) => this.permissions.request(request, options),
      beginPermissionWait: (threadId, wait) => this.permissionWaitControls.get(threadId)?.begin(wait),
      emitPermissionAudit: (audit) => this.emitPluginPermissionAudit(audit),
      emitPermissionGrantCreated: (grant) => this.emit({ type: "permission-grant-created", grant }),
    });
  }

  private emitPluginPermissionAudit(input: Omit<FirstPartyPluginPermissionAuditInput, "runId">): void {
    emitFirstPartyPluginPermissionAuditWithRuntimeBridge(input, {
      activeRunIdForThread: (threadId) => this.activeRunIds.get(threadId),
      addPermissionAudit: (audit) => this.store.addPermissionAudit(audit),
      emitPermissionAuditCreated: (entry) => this.emit({ type: "permission-audit-created", entry }),
    });
  }

  private createContextAccountingExtension(threadId: string, model: Model<"openai-completions">): ExtensionFactory {
    return createContextAccountingToolsExtension({
      threadId,
      contextWindow: model.contextWindow,
      getActiveSession: (id) => activeSessions.get(id),
      compactionStatsFromEntries: (entries) => contextUsageCompactionStatsFromEntries(entries),
      countSerializedPayload: (payload, fallbackTokens) => this.glmTokenizer.countSerializedPayload(payload, fallbackTokens),
      recordContextUsageSnapshot: (snapshot) => this.store.recordContextUsageSnapshot(snapshot),
      emitContextUsageUpdated: (snapshot) => this.emit({ type: "context-usage-updated", snapshot }),
      fileExists: existsSync,
    });
  }

  private createGoalModeToolExtension(threadId: string): ExtensionFactory {
    return createGoalModeToolsExtension({
      threadId,
      store: this.store,
      hasActiveRun: () => this.activeRuns.has(threadId),
      finalizeCompletedThreadGoal: (goal) => this.finalizeCompletedThreadGoal(goal),
      emit: (event) => this.emit(event),
      validateGoalCompletion: (goal) => {
        const thread = this.store.getThread(threadId);
        return validateGoalCompletionArtifacts({
          goal,
          thread,
          messages: this.store.listMessages(threadId),
          browser: this.browser,
          openLocalPreview: (input) => this.localPreviewServers.open(input),
        });
      },
    });
  }

  private createAmbientCompactionSummaryExtension(
    threadId: string,
    workspace: WorkspaceState,
    model: Model<"openai-completions">,
    apiKey: string | undefined,
  ): ExtensionFactory {
    return createAmbientCompactionSummaryToolsExtension({
      threadId,
      workspace,
      model,
      apiKey,
      getThread: (id) => this.store.getThread(id),
      listMessages: (id) => this.store.listMessages(id),
      getBrowserState: () => this.browser.getState(),
    });
  }

  private createPlannerModeExtension(threadId: string): ExtensionFactory {
    return createPlannerModeToolsExtension({
      threadId,
      getThread: (id) => this.store.getThread(id),
      getPlanEditIntentKind: () => this.workflowPlanEditIntentByThreadId.get(threadId),
    });
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
    return createAgentRuntimeToolRunnerExtension({
      workspace,
      getThread: () => this.store.getThread(threadId),
      readOnlyAllowedPaths: () => this.store.getProjectBoardDependencyWorkspacePathsForExecutionThread(threadId),
      readAuthorityRootPaths: () => this.fileAuthorityRootPathsForThread(threadId, "read"),
      writeAuthorityRootPaths: () => this.fileAuthorityRootPathsForThread(threadId, "write"),
      includeWorkspaceRootAuthority: () => this.includeWorkspaceRootAuthorityForThread(threadId),
      requestFileAuthority: (request) => this.requestFileAuthorityForThread(threadId, workspace, request),
      interruptedToolCallRecoveryToolsAvailable: () => options?.interruptedToolCallRecoveryToolsAvailable ?? false,
    });
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
    return runtimeFileAuthorityRootPathsForThread(threadId, access, {
      store: this.store,
      transientRoots: this.transientFileAuthorityRoots,
    });
  }

  private includeWorkspaceRootAuthorityForThread(threadId: string): boolean {
    return includeDefaultWorkspaceAuthorityRoots(this.store.getThread(threadId));
  }

  private async requestFileAuthorityForThread(
    threadId: string,
    workspace: WorkspaceState,
    request: AmbientFileAuthorityRequest,
  ): Promise<boolean> {
    const thread = this.store.getThread(threadId);
    const actionKind = request.access === "write" ? "local_file_write" : "file_content_read";
    const targetName = basename(request.absolutePath) || request.absolutePath;
    const permissionRequest: Omit<PermissionRequest, "id"> = {
      threadId,
      toolName: request.toolName,
      title: `Allow ${request.toolName} to ${request.access} ${targetName}?`,
      message: thread.kind === "subagent_child"
        ? "A sub-agent needs file authority outside its current child scope. Review this in the parent thread before the child continues."
        : "Ambient needs file authority outside the current thread scope before this tool can continue.",
      detail: [
        `Target path: ${request.absolutePath}`,
        request.requestedPath !== request.absolutePath ? `Requested path: ${request.requestedPath}` : undefined,
        `Reason: ${request.reason}`,
        thread.kind === "subagent_child" && thread.subagentRunId ? `Child run: ${thread.subagentRunId}` : undefined,
        `Thread: ${threadId}`,
      ].filter(Boolean).join("\n"),
      risk: "outside-workspace",
      reusableScopes: ["thread", "project"] satisfies PermissionGrantScopeKind[],
      grantActionKind: actionKind,
      grantTargetKind: "path",
      grantTargetLabel: request.absolutePath,
      grantConditions: {
        path: request.absolutePath,
        access: request.access,
        source: "file-authority-adapter",
      },
    };

    if (this.childApprovalModeForThread(thread) === "non_interactive") {
      const auditEntry = this.store.addPermissionAudit({
        runId: this.activeRunIds.get(threadId),
        threadId,
        permissionMode: thread.permissionMode,
        toolName: request.toolName,
        risk: permissionRequest.risk,
        decision: "denied",
        detail: permissionRequest.detail,
        reason: "Denied because this sub-agent launch is non-interactive and cannot ask the parent for more file authority.",
        decisionSource: "denied_by_policy",
      });
      this.emit({ type: "permission-audit-created", entry: auditEntry });
      return false;
    }

    const permission = await resolvePermissionWithGrants({
      store: this.store,
      requester: {
        request: async (requestInput) => {
          let finishPermissionWait: ((finish?: {
            allowed?: boolean;
            mode?: PermissionPromptResponseMode;
            error?: string;
          }) => void) | undefined;
          try {
            const response = await this.permissions.request(requestInput, {
              onRequest: (createdRequest) => {
                finishPermissionWait = this.permissionWaitControls.get(threadId)?.begin({
                  toolName: request.toolName,
                  requestId: createdRequest.id,
                  title: createdRequest.title,
                  detail: createdRequest.detail,
                  risk: createdRequest.risk,
                });
              },
            });
            finishPermissionWait?.({ allowed: response.allowed, mode: response.mode });
            return response;
          } catch (error) {
            finishPermissionWait?.({ error: error instanceof Error ? error.message : String(error) });
            throw error;
          }
        },
      },
      request: permissionRequest,
      context: {
        permissionMode: thread.permissionMode,
        threadId,
        projectPath: this.store.getWorkspace().path,
        workspacePath: workspace.path,
      },
    });

    const auditEntry = this.store.addPermissionAudit({
      runId: this.activeRunIds.get(threadId),
      threadId,
      permissionMode: thread.permissionMode,
      toolName: request.toolName,
      risk: permissionRequest.risk,
      decision: permission.allowed ? "allowed" : "denied",
      detail: permissionRequest.detail,
      reason: permission.allowed ? "Approved by Ambient file authority policy." : "Denied by user or timed out.",
      decisionSource: permission.decisionSource,
      grantId: permission.grant?.id,
    });
    this.emit({ type: "permission-audit-created", entry: auditEntry });
    if (permission.grant && permission.decisionSource !== "persistent_grant") {
      this.emit({ type: "permission-grant-created", grant: permission.grant });
    }
    if (!permission.allowed) return false;

    recordTransientFileAuthorityFromPermissionRequest({
      threadId,
      thread,
      projectPath: this.store.getWorkspace().path,
      request: permissionRequest,
      reason: permission.decisionSource === "persistent_grant"
        ? "Allowed by matching persistent permission grant."
        : "Allowed by Ambient file authority prompt for this tool call.",
    }, {
      roots: this.transientFileAuthorityRoots,
    });
    return true;
  }

  private childApprovalModeForThread(
    thread: Pick<ThreadSummary, "kind" | "subagentRunId">,
  ): "interactive" | "non_interactive" | undefined {
    if (thread.kind !== "subagent_child" || !thread.subagentRunId) return undefined;
    return this.store.listSubagentToolScopeSnapshots(thread.subagentRunId).at(-1)?.scope.approvalMode;
  }

  private createProjectBoardTaskToolExtension(threadId: string): ExtensionFactory {
    return createProjectBoardTaskToolsExtension({
      threadId,
      store: this.store,
    });
  }

  private listVoiceProvidersForTools(workspacePath: string): Promise<VoiceProviderCandidate[]> | VoiceProviderCandidate[] {
    return listAgentRuntimeVoiceProvidersForTools(this.providerDiscoveryOptions(), workspacePath);
  }

  private async voiceProviderWorkspacePathForCapabilityId(providerCapabilityId: string | undefined): Promise<string> {
    return agentRuntimeVoiceProviderWorkspacePathForCapabilityId(this.providerDiscoveryOptions(), providerCapabilityId);
  }

  private async listVoiceProvidersWithCachedVoices(_workspacePath: string): Promise<VoiceProviderCandidate[]> {
    return listAgentRuntimeVoiceProvidersWithCachedVoices(this.providerDiscoveryOptions(), _workspacePath);
  }

  private async listEmbeddingProvidersForTools(_workspacePath: string): Promise<EmbeddingProviderCandidate[]> {
    return listAgentRuntimeEmbeddingProvidersForTools(this.providerDiscoveryOptions(), _workspacePath);
  }

  private async startEmbeddingProviderRuntimeForMemory(
    input: AmbientTencentMemoryEmbeddingStartInput,
    workspacePath: string,
  ): Promise<AmbientTencentMemoryEmbeddingStartResult> {
    if (
      input.provider.providerId === AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID ||
      input.runtimeId === `embeddings:${AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID}`
    ) {
      const result = await startAmbientMemoryEmbeddingRuntime({ workspacePath });
      return {
        status: result.status,
        reason: result.reason,
        ...(result.release ? { release: result.release } : {}),
      };
    }
    const result = await this.runLocalModelRuntimeLifecycleAction({
      action: "start",
      runtimeId: input.runtimeId,
    });
    return {
      status: result.status,
      reason: result.message,
    };
  }

  private async listSttProvidersForTools(workspacePath: string): Promise<SttProviderCandidate[]> {
    return listAgentRuntimeSttProvidersForTools(this.providerDiscoveryOptions(), workspacePath);
  }

  private providerDiscoveryOptions(): AgentRuntimeProviderDiscoveryOptions {
    return createAgentRuntimeProviderDiscoveryOptions({
      store: this.store,
      features: this.features,
    });
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

  private createManagedDownloadToolExtension(workspace: WorkspaceState): ExtensionFactory {
    return createManagedDownloadToolsExtension({
      workspace,
      downloadService: this.downloadService,
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
    const localRuntimeStatus = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: workspace.path,
      settings: localDeepResearchSettings?.localModelResources,
      residentProcesses,
      ...(this.features.localModelHostMemory ? { hostMemory: this.features.localModelHostMemory() } : {}),
      requestedLaunch: localDeepResearchRequestedLaunchFromContract(preliminaryContract),
      leases: this.localModelRuntimeManager.activeRuntimeLeases(),
      voiceProviders: await this.listVoiceProvidersWithCachedVoices(workspace.path).catch(() => []),
      embeddingProviders: await this.listEmbeddingProvidersForTools(workspace.path).catch(() => []),
    });
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
    const workspace = this.store.getWorkspace();
    return runAgentRuntimeLocalModelRuntimeLifecycleAction({
      input,
      workspacePath: workspace.path,
      readStatus: (workspacePath, requestedLaunch) => this.readLocalModelRuntimeLifecycleStatus(workspacePath, requestedLaunch),
      startRuntime: (startInput) => this.localModelRuntimeManager.startRuntime(startInput),
      stopRuntime: (stopInput) => this.localModelRuntimeManager.stopRuntime(stopInput),
      restartRuntime: (restartInput) => this.localModelRuntimeManager.restartRuntime(restartInput),
      resolveOwnershipForStopPlan: (plan) => this.resolveLocalRuntimeOwnershipForStopPlan(plan),
      resolveOwnershipForRestartPlan: (plan) => this.resolveLocalRuntimeOwnershipForRestartPlan(plan),
    });
  }

  private resolveLocalRuntimeOwnershipForStopPlan(
    plan: LocalModelRuntimeStopPlan,
  ): Promise<LocalRuntimeOwnershipResolutionResult | undefined> {
    if (
      plan.status !== "blocked" ||
      !plan.forceRequested ||
      plan.dryRun ||
      !plan.entry ||
      !plan.entry.lifecycleDecision.stop.forceAllowed ||
      !plan.entry.lifecycleDecision.stop.forceRequiresSubagentCancellation
    ) {
      return Promise.resolve(undefined);
    }
    return this.resolveLocalRuntimeOwnershipForForcedAction(localRuntimeOwnershipResolutionRequest({
      action: "stop",
      runtimeId: plan.runtimeId,
      entry: plan.entry,
    }));
  }

  private resolveLocalRuntimeOwnershipForRestartPlan(
    plan: LocalModelRuntimeRestartPlan,
  ): Promise<LocalRuntimeOwnershipResolutionResult | undefined> {
    if (
      plan.status !== "blocked" ||
      !plan.forceRequested ||
      plan.dryRun ||
      !plan.entry ||
      !plan.entry.lifecycleDecision.restart.forceAllowed ||
      !plan.entry.lifecycleDecision.restart.forceRequiresSubagentCancellation
    ) {
      return Promise.resolve(undefined);
    }
    return this.resolveLocalRuntimeOwnershipForForcedAction(localRuntimeOwnershipResolutionRequest({
      action: "restart",
      runtimeId: plan.runtimeId,
      entry: plan.entry,
    }));
  }

  private async resolveLocalRuntimeOwnershipForForcedAction(
    request: LocalRuntimeOwnershipResolutionRequest,
  ): Promise<LocalRuntimeOwnershipResolutionResult> {
    const resolvedLeaseIds: string[] = [];
    const resolvedChildRunIds: string[] = [];
    const blockedLeaseIds: string[] = [];
    const blockedReasons: string[] = [];
    const cancelledRunIds = new Set<string>();

    for (const affected of request.affectedSubagents) {
      const run = this.findSubagentRunForLocalRuntimeOwner(
        affected.subagentThreadId,
        affected.parentThreadId,
        affected.subagentRunId,
      );
      if (!run) {
        blockedLeaseIds.push(affected.leaseId);
        const ownerHandle = affected.subagentRunId
          ? `run ${affected.subagentRunId} / child thread ${affected.subagentThreadId}`
          : `child thread ${affected.subagentThreadId}`;
        blockedReasons.push(`No active sub-agent run maps to ${ownerHandle}.`);
        continue;
      }
      if (run.closedAt) {
        blockedLeaseIds.push(affected.leaseId);
        blockedReasons.push(`Sub-agent run ${run.id} is already closed.`);
        continue;
      }
      if (run.status === "cancelled") {
        resolvedLeaseIds.push(affected.leaseId);
        resolvedChildRunIds.push(run.id);
        continue;
      }
      if (isSubagentTerminalStatus(run.status)) {
        blockedLeaseIds.push(affected.leaseId);
        blockedReasons.push(`Sub-agent run ${run.id} is already ${run.status}; its local runtime lease must be released by the runtime owner.`);
        continue;
      }
      if (!cancelledRunIds.has(run.id)) {
        const reason = `Forced local runtime ${request.action === "stop" ? "Stop" : "Restart"} requested for ${request.modelRuntimeId ?? request.runtimeId}; cancelling this sub-agent before Ambient changes its local model runtime.`;
        const idempotencyKey = createSubagentIdempotencyKey({
          operation: "cancel",
          childRunId: run.id,
          canonicalPath: run.canonicalTaskPath,
          payloadFingerprint: createSubagentPayloadFingerprint({
            source: "local-runtime-ownership-resolution",
            action: request.action,
            runtimeId: request.runtimeId,
            leaseId: affected.leaseId,
          }),
        });
        const result = await executeSubagentCancelAgent({
          store: this.createSubagentEventingStore(),
          runtime: {
            cancelChildRun: (cancelInput) => this.cancelResolvedSubagentChildRun(cancelInput),
          },
          run,
          reason,
          idempotencyKey,
          toolCallId: `local-runtime-${request.action}-ownership`,
          createRuntimeCancelEventEmitter: (targetRun) => this.createDesktopSubagentCancelEventEmitter(targetRun),
        });
        this.emitSubagentRunAndChildThreadUpdated(result.run);
        if (result.run.status !== "cancelled") {
          blockedLeaseIds.push(affected.leaseId);
          blockedReasons.push(`Sub-agent run ${result.run.id} could not be cancelled; current status is ${result.run.status}.`);
          continue;
        }
        cancelledRunIds.add(result.run.id);
      }
      resolvedLeaseIds.push(affected.leaseId);
      resolvedChildRunIds.push(run.id);
    }

    const uniqueResolvedLeaseIds = uniqueStrings(resolvedLeaseIds);
    const uniqueResolvedChildRunIds = uniqueStrings(resolvedChildRunIds);
    const uniqueBlockedLeaseIds = uniqueStrings(blockedLeaseIds);
    if (uniqueBlockedLeaseIds.length > 0) {
      return {
        schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
        action: request.action,
        runtimeId: request.runtimeId,
        status: "blocked",
        reason: `Sub-agent ownership resolution could not resolve all local runtime blockers. ${uniqueStrings(blockedReasons).join(" ")}`,
        affectedSubagents: request.affectedSubagents,
        resolvedLeaseIds: uniqueResolvedLeaseIds,
        resolvedChildRunIds: uniqueResolvedChildRunIds,
        blockedLeaseIds: uniqueBlockedLeaseIds,
      };
    }
    return {
      schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
      action: request.action,
      runtimeId: request.runtimeId,
      status: "resolved",
      reason: `Cancelled ${uniqueResolvedChildRunIds.length} sub-agent run${uniqueResolvedChildRunIds.length === 1 ? "" : "s"} before forced local runtime ${request.action === "stop" ? "Stop" : "Restart"}.`,
      affectedSubagents: request.affectedSubagents,
      resolvedLeaseIds: uniqueResolvedLeaseIds,
      resolvedChildRunIds: uniqueResolvedChildRunIds,
    };
  }

  private findSubagentRunForLocalRuntimeOwner(
    subagentThreadId: string,
    parentThreadId: string | undefined,
    subagentRunId?: string,
  ): SubagentRunSummary | undefined {
    const exactRunId = subagentRunId?.trim();
    if (exactRunId) {
      const run = this.store.listAllSubagentRuns().find((candidate) => candidate.id === exactRunId);
      if (run && run.childThreadId === subagentThreadId && (!parentThreadId || run.parentThreadId === parentThreadId)) {
        return run;
      }
      return undefined;
    }
    const childThreadId = subagentThreadId.trim();
    if (!childThreadId) return undefined;
    const candidates = this.store.listAllSubagentRuns()
      .filter((run) => run.childThreadId === childThreadId)
      .filter((run) => !parentThreadId || run.parentThreadId === parentThreadId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return candidates.find((run) => !run.closedAt && !isSubagentTerminalStatus(run.status)) ?? candidates[0];
  }

  readLocalModelRuntimeStatus(workspacePath = this.store.getWorkspace().path): Promise<LocalModelRuntimeStatusSnapshot> {
    return this.readLocalModelRuntimeLifecycleStatus(workspacePath);
  }

  private readLocalModelRuntimeLifecycleStatus(
    workspacePath: string,
    requestedLaunch?: LocalModelRequestedLaunch,
  ): Promise<LocalModelRuntimeStatusSnapshot> {
    return Promise.all([
      this.listVoiceProvidersWithCachedVoices(workspacePath).catch(() => []),
      this.listEmbeddingProvidersForTools(workspacePath).catch(() => []),
      this.features.localModelResidentProcesses
        ? Promise.resolve(this.features.localModelResidentProcesses(workspacePath)).catch(() => [])
        : Promise.resolve(undefined),
    ]).then(([voiceProviders, embeddingProviders, residentProcesses]) => buildLocalModelRuntimeStatusSnapshot({
      workspacePath,
      settings: this.features.localDeepResearch?.readSettings?.()?.localModelResources,
      hostMemory: this.features.localModelHostMemory?.(),
      requestedLaunch,
      leases: this.localModelRuntimeManager.activeRuntimeLeases(),
      voiceProviders,
      embeddingProviders,
      ...(residentProcesses ? { residentProcesses } : {}),
      includeStopped: true,
      leaseStaleMs: DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS,
    }));
  }

  private localDeepResearchWebBroker(input: {
    threadId: string;
    workspace: WorkspaceState;
    providerSnapshot: LocalDeepResearchProviderSnapshot;
    signal?: AbortSignal;
    onUpdate?: (update: AgentToolResult<Record<string, unknown>>) => void;
  }) {
    return createAgentRuntimeLocalDeepResearchWebBroker(input, {
      webResearchProviderPlanForInput: (workspace, rawInput, role, signal, providerSnapshot) =>
        this.webResearchProviderPlanForInput(workspace, rawInput, role, signal, providerSnapshot),
      webResearchExaApiKey: () => webResearchExaApiKeyFromEnv(this.features.mcp?.env),
      prepareBrowserToolProfile: (rawInput, sourceThreadId, onUpdate) => this.prepareBrowserToolProfile(rawInput, sourceThreadId, onUpdate),
      browserSearch: (browserInput) => this.browser.search(browserInput),
      browserContent: (browserInput) => this.browser.content(browserInput),
      emitBrowserState: () => this.emitBrowserState(),
      recordBrowserAudit: (threadId, toolName, risk, detail) => this.recordBrowserAudit(threadId, toolName, risk, detail),
      tryRouteBrowserContentThroughScrapling: (routeInput) => this.tryRouteBrowserContentThroughScrapling(routeInput),
      tryCallWebResearchMcpProvider: (routeInput) => this.tryCallWebResearchMcpProvider(routeInput),
      withBrowserToolHeartbeat,
      formatErrorMessage: (error, maxChars) => truncateDiagnosticText(unknownErrorMessage(error), maxChars),
      truncateDiagnosticText,
    });
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
    return createAgentRuntimeMessagingGatewayToolExtension({
      threadId,
      workspace,
      getThread: (id) => this.store.getThread(id),
      listThreads: () => this.store.listThreads(),
      listWorkflowAgentFolders: () => this.store.listWorkflowAgentFolders(),
      readVoiceSettings: () => this.features.voice?.readSettings(),
      readSttSettings: () => this.features.stt?.readSettings(),
      readSearchSettings: () => this.features.search?.readSettings(),
      readMediaSettings: () => this.features.media?.readSettings(),
      readPlannerSettings: () => this.features.planner?.readSettings?.(),
      listPermissionRequests: () => this.permissions.listPending?.() ?? [],
      listPermissionGrants: () => this.store.listPermissionGrants(),
      listPermissionAudit: (limit) => this.store.listPermissionAudit(limit),
      workflowRecoveryEvents: () => this.workflowRecoveryEventsForRemoteSurface(),
      ...(this.features.projects?.listProjects ? { listProjects: () => this.features.projects!.listProjects!() } : {}),
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      secureInputs: this.features.secureInputs,
      ...createAgentRuntimeMessagingRuntimeBridge({
        threadId,
        workspacePath: workspace.path,
        remoteSurfaceRuntimeEvents: this.remoteSurfaceRuntimeEvents,
        activeRuns: this.activeRuns,
        pendingProjectSwitchByThreadId: this.pendingProjectSwitchByThreadId,
        completePendingProjectSwitch: (projectSwitch, input) => this.completePendingRemoteProjectSwitch(projectSwitch, input),
      }),
      createProject: this.features.projects?.createProject,
      createChatThread: (title, workspacePath) => this.store.createThread(title, workspacePath),
      createWorkflowAgentThreadSummary: (input) => this.store.createWorkflowAgentThreadSummary(input),
      switchProjectAvailable: () => Boolean(this.features.projects?.switchProject),
      answerWorkflowDiscoveryQuestion: (input) => answerWorkflowDiscoveryQuestion(this.store, input),
      getWorkflowDiscoveryQuestion: (questionId) => this.store.getWorkflowDiscoveryQuestion(questionId),
      getWorkflowThreadSummary: (workflowThreadId) => this.store.getWorkflowAgentThreadSummary(workflowThreadId),
      workflowAgents: this.features.workflowAgents,
      emit: (event) => this.emit(event),
      updateThreadSettings: (id, next) => this.store.updateThreadSettings(id, next),
      voice: this.features.voice,
      stt: this.features.stt,
      listSttProviders: (workspacePath) => this.listSttProvidersForTools(workspacePath),
      media: this.features.media,
      planner: this.features.planner,
      search: this.features.search,
      ...(this.permissions.respond ? {
        respondToPermissionPrompt: (requestId, response) => this.permissions.respond?.(requestId, response),
      } : {}),
      revokePermissionGrant: (grantId) => this.store.revokePermissionGrant(grantId),
    });
  }

  private createWebResearchToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createAgentRuntimeWebResearchToolExtension({
      threadId,
      workspace,
      readSettings: () => this.features.search?.readSettings(),
      discoverAmbientCliPackages,
      discoverMcpProviderTools: (signal) => this.discoverWebResearchMcpProviderTools(workspace, signal),
      webResearchRuntimeSummary: (signal) => this.webResearchRuntimeSummary(workspace, signal),
      webResearchProviderPlanForInput: (input, role, signal) =>
        this.webResearchProviderPlanForInput(workspace, input, role, signal, undefined, {
          allowBrowserFallback: this.webResearchBrowserFallbackAllowedForThread(threadId),
        }),
      webResearchExaApiKey: () => webResearchExaApiKeyFromEnv(this.features.mcp?.env),
      prepareBrowserToolProfile: (input, sourceThreadId, onUpdate) => this.prepareBrowserToolProfile(input, sourceThreadId, onUpdate),
      browserSearch: (input) => this.browser.search(input),
      browserContent: (input) => this.browser.content(input),
      emitBrowserState: () => this.emitBrowserState(),
      recordBrowserAudit: (toolName, risk, detail) => this.recordBrowserAudit(threadId, toolName, risk, detail),
      tryRouteBrowserContentThroughScrapling: (input) => this.tryRouteBrowserContentThroughScrapling(input),
      tryCallWebResearchMcpProvider: (input) => this.tryCallWebResearchMcpProvider(input),
      withBrowserToolHeartbeat,
      formatErrorMessage: (error, maxChars) => truncateDiagnosticText(unknownErrorMessage(error), maxChars),
    });
  }

  private async webResearchProviderPlanForInput(
    workspace: WorkspaceState,
    input: Record<string, unknown>,
    role: WebResearchProviderRole,
    signal?: AbortSignal,
    providerSnapshot?: LocalDeepResearchProviderSnapshot,
    options: { allowBrowserFallback?: boolean } = {},
  ) {
    return buildWebResearchProviderPlanForInput({
      workspace,
      input,
      role,
      signal,
      providerSnapshot,
      allowBrowserFallback: options.allowBrowserFallback,
    }, {
      readSettings: () => this.features.search?.readSettings(),
      discoverAmbientCliPackages,
      discoverMcpProviderTools: (planSignal) => this.discoverWebResearchMcpProviderTools(workspace, planSignal),
    });
  }

  private webResearchBrowserFallbackAllowedForThread(threadId: string): boolean | undefined {
    const thread = this.store.getThread(threadId);
    if (thread.kind !== "subagent_child") return undefined;
    if (!thread.subagentRunId) return false;
    const latestScope = this.store.listSubagentToolScopeSnapshots(thread.subagentRunId).at(-1)?.scope;
    const visibleCategories = new Set(latestScope?.piVisibleCategories ?? []);
    return visibleCategories.has("browser.read") || visibleCategories.has("browser.interactive")
      ? undefined
      : false;
  }

  private async discoverWebResearchMcpProviderTools(workspace: WorkspaceState, signal?: AbortSignal) {
    return discoverMcpProviderToolsForWebResearch(workspace, signal, {
      createMcpRuntime: this.mcpToolOrchestration.createMcpRuntime,
    });
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
    return callWebResearchMcpProvider(input, {
      createMcpRuntime: this.mcpToolOrchestration.createMcpRuntime,
      getThread: (threadId) => this.store.getThread(threadId),
      listPermissionGrants: () => this.store.listPermissionGrants(),
      resolveFirstPartyPluginPermission: (permissionInput) => this.resolveFirstPartyPluginPermission(permissionInput),
    });
  }

  private async webResearchRuntimeSummary(
    workspace: WorkspaceState,
    signal?: AbortSignal,
  ): Promise<WebResearchRuntimeSummary> {
    return buildWebResearchRuntimeSummary(workspace, signal, {
      createMcpRuntime: this.mcpToolOrchestration.createMcpRuntime,
      mcpEnv: this.features.mcp?.env,
    });
  }

  private createSearchPreferenceToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createSearchPreferenceToolsExtension({
      threadId,
      workspace,
      getThread: (id) => this.store.getThread(id),
      readSettings: () => this.features.search?.readSettings(),
      updateSettings: this.features.search?.updateSettings
        ? (input) => this.features.search!.updateSettings!(input)
        : undefined,
      discoverAmbientCliPackages,
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
    });
  }

  private createGitToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createGitToolsExtension({
      workspace,
      projectRoot: () => this.store.getWorkspace().path,
      threadWorktree: () => this.store.getThread(threadId).gitWorktree,
    });
  }

  private createPrivilegedActionToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createPrivilegedActionToolsExtension({
      threadId,
      workspace,
      getThread: (id) => this.store.getThread(id),
      privilegedActionAdapter: () => this.privilegedActionAdapter(),
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      requestPrivilegedCredential: this.features.privilegedCredentials?.request,
      writePrivilegedActionRedactedLog,
      runCapabilityBuilderValidationWithPermission: (input) => this.runCapabilityBuilderValidationWithPermission(input),
    });
  }

  private privilegedActionAdapter(): PrivilegedActionAdapter {
    return this.features.privilegedActionAdapter ?? createPrivilegedActionAdapter({
      adapter: privilegedActionAdapterSelectionFromEnv(),
      credentialRehearsalAvailable: Boolean(this.features.privilegedCredentials?.request),
    });
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
        this.completeRegisteredVoiceProviderSetup(thread, workspace, provider),
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
    return routeBrowserContentThroughScrapling(input, {
      createMcpRuntime: this.mcpToolOrchestration.createMcpRuntime,
      getThread: (threadId) => this.store.getThread(threadId),
      listPermissionGrants: () => this.store.listPermissionGrants(),
      resolveFirstPartyPluginPermission: (permissionInput) => this.resolveFirstPartyPluginPermission(permissionInput),
    });
  }

  private createBrowserToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createAgentRuntimeBrowserToolExtension({
      threadId,
      workspace,
      enableBrowserLoginBroker: this.features.browserLoginBroker !== false,
      prepareBrowserToolProfile: (input, sourceThreadId, onUpdate) => this.prepareBrowserToolProfile(input, sourceThreadId, onUpdate),
      browserSearch: (input) => this.browser.search(input),
      openLocalPreview: (input) => this.localPreviewServers.open(input),
      browserNavigate: (input) => this.browser.navigate(input),
      browserContent: (input) => this.browser.content(input),
      tryRouteBrowserContentThroughScrapling: (input) => this.tryRouteBrowserContentThroughScrapling(input),
      browserEvaluate: (input) => this.browser.evaluate(input),
      browserKeypress: (input) => this.browser.keypress(input),
      resolveBrowserCredential: (credentialId) => this.browserCredentials.resolve(credentialId),
      markBrowserCredentialUsed: (credentialId) => {
        this.browserCredentials.markUsed(credentialId);
      },
      browserLogin: (input) => this.browser.login(input),
      browserScreenshot: (input) => this.browser.screenshot(input),
      recordBrowserScreenshotArtifact: (artifact) => {
        this.latestBrowserScreenshotArtifacts.set(threadId, artifact);
      },
      browserPick: (input) => this.browser.pick(input),
      emitBrowserState: () => this.emitBrowserState(),
      recordBrowserAudit: (auditThreadId, toolName, risk, detail) => this.recordBrowserAudit(auditThreadId, toolName, risk, detail),
      withBrowserToolHeartbeat,
      formatDiagnosticText: truncateDiagnosticText,
    });
  }

  private async ensurePluginMcpToolTrusted(
    threadId: string,
    workspace: WorkspaceState,
    registration: PluginMcpToolRegistration,
  ): Promise<boolean> {
    return ensurePluginMcpToolTrustedWithRuntimeBridge({ threadId, workspace, registration }, {
      getThread: (id) => this.store.getThread(id),
      activeRunIdForThread: (id) => this.activeRunIds.get(id),
      isPluginTrusted: (pluginId, pluginFingerprint) => this.store.isPluginTrusted(pluginId, pluginFingerprint),
      setPluginTrusted: (pluginId, trusted, pluginFingerprint) => {
        this.store.setPluginTrusted(pluginId, trusted, pluginFingerprint);
      },
      resolveFirstPartyPluginPermission: (input) => this.resolveFirstPartyPluginPermission(input),
      addPermissionAudit: (input) => this.store.addPermissionAudit(input),
      emitPermissionAuditCreated: (entry) => this.emit({ type: "permission-audit-created", entry }),
    });
  }

  private recordBrowserAudit(
    threadId: string,
    toolName: string,
    risk: "browser-network" | "browser-control" | "browser-profile" | "browser-login" | "browser-credential",
    detail: string | undefined,
  ): void {
    recordAgentRuntimeBrowserAudit({
      threadId,
      toolName,
      risk,
      detail,
    }, {
      getThread: (id) => this.store.getThread(id),
      activeRunIdForThread: (id) => this.activeRunIds.get(id),
      addPermissionAudit: (input) => this.store.addPermissionAudit(input),
      emitPermissionAuditCreated: (entry) => this.emit({ type: "permission-audit-created", entry }),
    });
  }

  private async emitBrowserState(): Promise<void> {
    this.emit({ type: "browser-updated", state: await this.browser.getState() });
  }

  private async prepareBrowserToolProfile(
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: (update: ReturnType<typeof browserToolUpdate>) => void,
  ): Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }> {
    return prepareAgentRuntimeBrowserToolProfile({ input, onUpdate }, {
      getBrowserState: () => this.browser.getState(),
      copyChromeProfile: () => this.browser.copyChromeProfile(),
      emitBrowserState: () => this.emitBrowserState(),
      recordBrowserProfileAudit: (detail) => this.recordBrowserAudit(threadId, "browser_profile", "browser-profile", detail),
    });
  }

  private async refreshBrowsersForArtifactChange(threadId: string, workspacePath: string, artifactPath: string): Promise<void> {
    return refreshAgentRuntimeBrowsersForArtifactChange({ threadId, workspacePath, artifactPath }, {
      refreshWorkspaceArtifact: (input) => this.browser.refreshWorkspaceArtifact(input),
      refreshExternalFileBrowserTabs,
      emitBrowserState: () => this.emitBrowserState(),
      emit: (event) => this.emit(event),
    });
  }

  private recordVoiceDispatch(message: ChatMessage): void {
    void recordAgentRuntimeVoiceDispatch(message, {
      readSettings: () => this.features.voice?.readSettings(),
      store: this.store,
      voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId) => this.voiceProviderWorkspacePathForCapabilityId(providerCapabilityId),
      getProviderStatus: (model) => getAmbientProviderStatus(model),
      readAmbientApiKey,
      runner: runAmbientCliPackageCommand,
      createMediaUrl: this.features.voice?.createMediaUrl,
      onStateUpdated: () => this.features.voice?.onStateUpdated?.(),
      enforceArtifactBudget: (workspacePath) => this.features.voice?.enforceArtifactBudget?.(workspacePath),
    });
  }

  private async completeRegisteredVoiceProviderSetup(
    thread: ThreadSummary,
    workspace: WorkspaceState,
    provider: {
      capabilityId: string;
      label: string;
      format: VoiceSettings["format"];
      voices: Array<{ id: string; label?: string }>;
    },
  ): Promise<{ text: string; details: Record<string, unknown> }> {
    const voice = this.features.voice;
    return completeAgentRuntimeRegisteredVoiceProviderSetup(thread, workspace, provider, {
      readSettings: () => voice?.readSettings(),
      updateSettings: voice?.updateSettings ? (input) => voice.updateSettings!(input) : undefined,
      dogfoodSelectedVoiceProvider: (voiceThread, voiceWorkspace, settings) =>
        this.dogfoodSelectedVoiceProvider(voiceThread, voiceWorkspace, settings),
    });
  }

  private async dogfoodSelectedVoiceProvider(
    thread: ThreadSummary,
    workspace: WorkspaceState,
    settings: VoiceSettings,
    options: { text?: string } = {},
  ): Promise<{ status: "succeeded"; audioPath?: string; mimeType?: string; durationMs?: number }> {
    return dogfoodAgentRuntimeSelectedVoiceProvider(thread, workspace, settings, {
      voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId) => this.voiceProviderWorkspacePathForCapabilityId(providerCapabilityId),
      runner: this.features.voice?.testRunner ?? runAmbientCliPackageCommand,
      createMediaUrl: this.features.voice?.createMediaUrl,
      enforceArtifactBudget: (workspacePath) => this.features.voice?.enforceArtifactBudget?.(workspacePath),
    }, options);
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

function subagentStatusCanRetryInSameChildThread(status: SubagentRunSummary["status"]): boolean {
  return status === "failed" ||
    status === "stopped" ||
    status === "cancelled" ||
    status === "timed_out" ||
    status === "aborted_partial";
}

export { shouldOpenApiKeyDialogForRuntimeError } from "./agentRuntimeErrorFormatting";
export {
  BrowserToolTimeoutError,
  browserToolTimeoutMs,
  withBrowserToolHeartbeat,
} from "./agent-runtime/browser-tools/agentRuntimeBrowserToolHeartbeat";
export { assistantFinalizationRetryAttemptsUsedForReason } from "./agentRuntimeAssistantRetryInput";
