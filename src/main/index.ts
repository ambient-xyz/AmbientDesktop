import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  screen,
  safeStorage,
  shell,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import electronUpdater from "electron-updater";
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import packageJson from "../../package.json";
import {
  AgentRuntime,
  RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE,
  type AgentRuntimeFeatures,
} from "./agentRuntime";
import {
  archiveAmbientWorkflowPlaybook,
  describeAmbientWorkflowPlaybook,
  injectAmbientWorkflowPlaybook,
  restoreAmbientWorkflowPlaybookVersion,
  unarchiveAmbientWorkflowPlaybook,
  updateAmbientWorkflowPlaybook,
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
import { AmbientWorkflowLabJudgeProvider, runWorkflowLab } from "./workflowLab";
import { ambientRetryPolicyFromSettings } from "./aggressiveRetries";
import { ambientChatCompletionTransportTimeoutsFromEnv } from "./ambientChatCompletionRetry";
import { getAppLogs, installAppLogCapture } from "./appLogs";
import { parseAmbientLaunchArgs } from "./launchArgs";
import { localTextSubagentStartupFeatureFromEnv } from "./localTextSubagentStartupConfig";
import { isAmbientSubagentsEnabled, resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { resolveSubagentApprovalDecision } from "./subagentApprovalDecision";
import { reconcileSubagentsOnRuntimeStartup } from "./subagentStartupReconciliation";
import { installAppMenu } from "./menu";
import { scanProjectBoardSources } from "./projectBoardSources";
import {
  projectBoardSourceDeterministicAuthorityLocked,
  projectBoardSourceIncludedInSynthesis,
} from "./projectBoardSourceIdentity";
import { createOrAdoptProjectBoard } from "./projectBoardBootstrap";
import { repairProjectBoardWorkflow, updateProjectBoardWorkflowRaw, updateProjectBoardWorkflowSettings } from "./projectBoardWorkflowBootstrap";
import { AmbientProjectBoardCharterSummaryProvider, type AmbientProjectBoardCharterSummaryResult } from "./projectBoardCharterSummaryProvider";
import { recordProjectBoardDirectHelperRetryActivity } from "./projectBoardDirectHelperRetryActivity";
import {
  AmbientProjectBoardSourceClassifierProvider,
  type AmbientProjectBoardSourceBatchedClassificationResult,
} from "./projectBoardSourceClassifierProvider";
import {
  projectBoardPmReviewGitContextFromStatus,
  projectBoardSynthesisDraftFromProposal,
  synthesizeProjectBoardDraft,
  type ProjectBoardPmReviewGitContext,
  type ProjectBoardSynthesisDraft,
  type ProjectBoardSynthesisRefinementAnswer,
} from "./projectBoardSynthesis";
import {
  projectBoardConsolidationCandidates,
  runProjectBoardCandidateConsolidation,
} from "./projectBoardCandidateConsolidation";
import {
  projectBoardProgressiveRecordsFromDraft,
  projectBoardSynthesisDraftFromProgressiveRecords,
} from "./projectBoardProgressivePlanning";
import { projectBoardShouldUseSectionedPlanningForWorkflow } from "./projectBoardWorkflowPlanningDepth";
import {
  annotateProjectBoardDraftWithObjectiveProvenance,
  annotateProjectBoardProgressiveRecordsWithObjectiveProvenance,
  deterministicProjectBoardSourceElaborationDraft,
  projectBoardSourceScopeAnswersForRefinement,
  selectProjectBoardSynthesisSources,
} from "./projectBoardSourceElaboration";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { createProjectBoardPlannerWorkspace, readProjectBoardPlannerWorkspaceRecordsFromRoot } from "./projectBoardPlannerWorkspace";
import { projectBoardPlannerContinuationForRetry, type ProjectBoardPlannerBatchContinuation } from "./projectBoardPlannerContinuation";
import {
  AmbientProjectBoardProofJudgeProvider,
  type AmbientProjectBoardProofJudgmentProgress,
  type ProjectBoardProofJudgmentContext,
} from "./projectBoardProofJudgeProvider";
import {
  AmbientProjectBoardClarificationDefaultProvider,
  deterministicProjectBoardClarificationDefaultSuggestionForTarget,
  projectBoardClarificationDefaultSuggestionTargets,
} from "./projectBoardClarificationDefaultProvider";
import {
  AmbientProjectBoardKickoffDefaultProvider,
  buildProjectBoardKickoffContextBrief,
  projectBoardKickoffDefaultSuggestionTargets,
} from "./projectBoardKickoffDefaultProvider";
import { AmbientProjectBoardProofSuggestionProvider, deterministicProjectBoardProofSuggestionForCard } from "./projectBoardProofSuggestionProvider";
import {
  AmbientProjectBoardDecisionDraftRefreshProvider,
  deterministicProjectBoardDecisionDraftRefreshSuggestionForCard,
} from "./projectBoardDecisionDraftRefreshProvider";
import {
  AmbientProjectBoardSourceDraftRefreshProvider,
  deterministicProjectBoardSourceDraftRefreshSuggestionForCard,
} from "./projectBoardSourceDraftRefreshProvider";
import {
  AmbientProjectBoardSynthesisProvider,
  type AmbientProjectBoardSynthesisProgress,
  type AmbientProjectBoardSynthesisProgressiveBatch,
  type ProjectBoardSynthesisReasoning,
} from "./projectBoardSynthesisProvider";
import { ProjectStore } from "./projectStore";
import {
  listWorkflowAgentFoldersAcrossStores,
  listWorkflowRecordingLibraryAcrossStores,
  searchAmbientWorkflowPlaybooksAcrossStores,
  type WorkflowRecordingLibraryStore,
} from "./workflowRecordingGlobalLibrary";
import { ProjectRegistry, archiveProjectChats, normalizeWorkspacePath, projectIdFromWorkspacePath, readProjectSearchResults } from "./projectRegistry";
import { ensureWelcomeOnboardingProject, resolveWelcomeOnboardingAssetsPath } from "./welcomeOnboarding";
import { providerCatalogSettingsState } from "./providerCatalog";
import { getAmbientProviderStatus } from "./providerStatus";
import { saveModelProviderCredentialForSettings } from "./modelProviderCredentialStore";
import { installModelProviderEndpointForSettings } from "./modelProviderSettingsInstall";
import { projectBoardDecisionImpactPreview } from "../shared/projectBoardDecisionImpact";
import {
  assertProjectBoardCardGenerationAllowed,
  assertProjectBoardCharterReviewAllowed,
} from "../shared/projectBoardSynthesisGate";
import { DesktopUpdateService, desktopUpdateConfigFromEnv } from "./updateService";
import { isLoopbackWebUrl, parseExternalOpenUrl } from "./externalUrlPolicy";
import { LocalPreviewServerManager } from "./localPreviewServer";
import { redactSensitiveText } from "./secretRedaction";
import { readSecretReference } from "./secretReferenceStore";
import { saveMcpServerEnvSecret } from "./mcpSecretReferences";
import { selectStartupWorkspacePath } from "./workspaceDefaults";
import type {
  AmbientPermissionGrant,
  AmbientMcpInstallPreview,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpServerInstallResult,
  AmbientMcpServerUninstallResult,
  AmbientMcpToolReviewAcceptResult,
  AmbientPluginRegistry,
  CodexHostedMarketplaceReport,
  CodexPluginCatalog,
  DesktopEvent,
  DesktopState,
  DesktopUpdateState,
  FirstPartyGoogleIntegrationState,
  GitReviewSummary,
  OrchestrationAutoDispatchStartedRun,
  OrchestrationAutoDispatchStatus,
  ChatMessage,
  AppThirdPartyCredit,
  CreateAutomationScheduleInput,
  UpdateAutomationScheduleInput,
  CreateProjectBoardInput,
  ProjectBoardGitSyncInput,
  ProjectBoardCard,
  ProjectBoardCharterProjectSummary,
  ProjectBoardPmReviewReport,
  ProjectBoardSource,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunStage,
  PauseProjectBoardSynthesisInput,
  CreateAmbientPermissionGrantInput,
  SetThemePreferenceInput,
  ProjectSummary,
  RefineProjectBoardSynthesisInput,
  RegenerateMessageVoiceInput,
  MessageVoiceArtifactInput,
  VoiceArtifactRetentionInput,
  AmbientMcpDefaultCapabilityInstallProgress,
  RefreshProjectBoardSourcesInput,
  RerunProjectBoardProofInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardKickoffDefaultsInput,
  SuggestProjectBoardProofInput,
  RetryProjectBoardSynthesisInput,
  SeedProjectBoardCanonicalProjectionDogfoodInput,
  SeedProjectBoardDeliverableIntegrationDogfoodInput,
  SeedProjectBoardProofJudgmentDogfoodInput,
  LocalDeepResearchRunHistoryInput,
  LocalDeepResearchRunHistoryResult,
  LocalDeepResearchSetupInput as LocalDeepResearchSetupIpcInput,
  LocalDeepResearchSetupResult,
  InstallModelProviderEndpointInput,
  InstallModelProviderEndpointResult,
  ModelProviderCredentialSaveResult,
  LocalModelResourcePolicyDecision,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionSetupInput,
  ResolveWorkflowRevisionInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  SearchWorkflowRecordingsInput,
  RunStatus,
  PermissionRequest,
  SaveModelProviderCredentialInput,
  SetSttTtsSpeakingInput,
  PermissionAuditEntry,
  SetOrchestrationAutoDispatchInput,
  ThreadActionInput,
  ThreadSummary,
  ThemePreference,
  GeneratePlannerDurableArtifactInput,
  UpdateMediaPlaybackSettingsInput,
  UpdateAgentMemorySettingsInput,
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryEmbeddingLifecycleActionInput,
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemorySettings,
  UpdateFeatureFlagSettingsInput,
  UpdateModelRuntimeSettingsInput,
  PlannerSettings,
  PlannerPlanArtifact,
  UpdatePlannerSettingsInput,
  LocalDeepResearchSettings,
  SearchRoutingSettings,
  UpdateLocalDeepResearchSettingsInput,
  UpdateSearchRoutingSettingsInput,
  UpdateSttSettingsInput,
  ThinkingDisplaySettings,
  UpdateThinkingDisplaySettingsInput,
  SttProviderSetupInput,
  SttQueueState,
  SttTestAudioInput,
  SttTranscribeAudioInput,
  UpdateVoiceSettingsInput,
  SttSettings,
  VoiceSettingsAuditChange,
  VoiceSettingsAuditEntry,
  VoiceSettingsAuditSource,
  VoiceSettings,
  VoiceProviderCandidate,
  EmbeddingProviderCandidate,
  WorkspaceSearchInput,
  WorkspaceFileContent,
  WorkflowAgentFolderSummary,
  WorkflowRecordingLibraryEntry,
  WorkflowAmbientCliCapabilityGrant,
  WorkflowRevisionSummary,
  WorkflowRecoveryAction,
  OfficePreview,
} from "../shared/types";
import {
  DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  projectBoardSynthesisOutputCapRecovery,
  projectBoardSynthesisPartialStatus,
} from "../shared/projectBoardSynthesisRecovery";
import {
  applyProjectBoardGitProjection,
  claimProjectBoardGitCardArtifacts,
  commitProjectBoardGitArtifacts,
  expireProjectBoardGitCardClaimArtifacts,
  exportProjectBoardGitArtifacts,
  getProjectBoardGitSyncStatus,
  pullProjectBoardGitArtifacts,
  pushProjectBoardGitArtifacts,
  releaseProjectBoardGitCardClaimArtifacts,
  resolveProjectBoardGitCardClaimConflictsArtifacts,
} from "./projectBoardGitSync";
import { emptyQueueState } from "../shared/messageDelivery";
import {
  clearImportedWorkspaceContext,
  clearImportedWorkspaceContextSync,
  describeWorkspaceAbsoluteContextPaths,
  describeWorkspaceContextReferences,
  getWorkspaceDiff,
  listWorkspaceFiles,
  readLocalFilePreview as readLocalPreviewFile,
  readWorkspaceFile,
  resolveWorkspacePath,
  resolveWorkspacePathForOpen,
} from "./workspaceFiles";
import { isPathInside } from "./sessionPaths";
import { registerWorkspaceMediaProtocol, WorkspaceMediaServer } from "./workspaceMedia";
import { OfficePreviewService, type OfficePreviewRenderResult } from "./officePreviewService";
import {
  commitGit,
  commitGitPaths,
  createGitBranch,
  createPullRequestUrl,
  discardGitFile,
  fetchGit,
  getGitReview,
  getWorkspaceGitStatus,
  initializeGitRepository,
  pullGit,
  pushGit,
  stageAllGitFiles,
  stageGitFile,
  switchWorkspaceBranch,
  unstageAllGitFiles,
  unstageGitFile,
} from "./workspaceGit";
import { createGitCheckpoint, latestGitCheckpoint, restoreLatestGitCheckpoint } from "./gitCheckpoints";
import { attachExistingThreadWorktree, createPermanentWorktree, prepareThreadWorktree } from "./gitWorktrees";
import { TerminalService } from "./terminalService";
import { listManagedDevServers, stopManagedDevServer } from "./toolRunner";
import { TerminalStartTokenStore } from "./terminalSessionTokens";
import { PermissionPromptService } from "./permissionPrompts";
import { PrivilegedCredentialPromptService } from "./privilegedCredentialPrompts";
import { SecureInputPromptService } from "./secureInputPrompts";
import { permissionGrantTargetHash, resolvePermissionWithGrants } from "./permissionGrants";
import { classifyToolPermission } from "./permissionPolicy";
import {
  parseThreadPermissionModeChange,
  parseThreadSettingsUpdate,
  permissionModeChangeAuditDetail,
} from "./threadSettingsAuthority";
import {
  AmbientPluginHost,
  codexPluginTrustFingerprint,
  type PluginMcpRuntimeSnapshot,
  type PluginMcpToolRegistration,
} from "./plugins/pluginHost";
import {
  createPublicMcpPackageMetadataResolver,
  McpInstallCatalog,
  mcpInstallPreviewReviewState,
  mcpInstallPreviewSecretBindings,
  mcpInstallPreviewSourceIdentity,
  mcpRegistryInstallPreviewText,
  type McpInstalledServerSummary,
  type McpRegistryInstallPreview,
} from "./mcpInstallCatalog";
import { loadDefaultMcpCatalog, mcpDefaultCatalogDescriptorHash } from "./mcpDefaultCatalog";
import {
  isMcpDefaultCapabilityInstalledServerAvailable,
  reconcileMcpDefaultCapabilities,
  writeMcpDefaultCapabilitySummary,
  type McpDefaultCapabilitySummary,
} from "./mcpDefaultCapabilityReconciler";
import {
  adoptExistingMcpDefaultCapability,
  defaultCapabilityImageResolutionText,
  installMcpDefaultCapability,
  type InstallMcpDefaultCapabilityResult,
  type McpDefaultCapabilityInstallProgress,
} from "./mcpDefaultCapabilityInstaller";
import {
  evaluateMcpInstallGate,
  mcpDefaultCapabilityStatePathForUserData,
  mcpInstallGateSummary,
} from "./mcpInstallGate";
import { mcpServerInstallApprovalDetail, mcpServerUninstallApprovalDetail } from "./mcpServerPiTools";
import { containerRuntimeProbeSummary, probeContainerRuntime, type ContainerRuntimeProbeResult } from "./containerRuntimeProbeService";
import {
  buildContainerRuntimeInstallPlanFromProbe,
  launchContainerRuntimeInstallAction,
} from "./containerRuntimeInstallLauncher";
import { executeContainerRuntimeManagedInstallAction } from "./containerRuntimeManagedInstaller";
import { createPrivilegedActionAdapter, privilegedActionAdapterSelectionFromEnv } from "./privilegedActionAdapter";
import { writeContainerRuntimeManagedInstallRedactedLog, writePrivilegedActionRedactedLog } from "./privilegedActionLogs";
import {
  containerRuntimeSetupPromptState,
  recordContainerRuntimeDeferred,
  recordContainerRuntimeInstallLaunched,
  recordContainerRuntimeProbeState,
  type ContainerRuntimeSetupPromptState,
} from "./containerRuntimeSetupState";
import { ToolHiveRuntimeService, type ToolHiveCommandResult } from "./toolHiveRuntimeService";
import { McpToolBridge } from "./mcpToolBridge";
import { PluginAuthService } from "./plugins/pluginAuthService";
import {
  clearPiExtensionSandboxHistory,
  discoverPiExtensionSandboxPackages,
  installPiExtensionSandboxPackage,
  previewPiExtensionSandboxInstall,
  uninstallPiExtensionSandboxPackage,
  type PiExtensionSandboxInstallPreview,
} from "./piExtensionSandboxPackages";
import { clearPiPrivilegedPackageHistory, disablePiPrivilegedPackage, discoverPiPrivilegedPackages, installPiPrivilegedPackage, scanPiPrivilegedPackage, uninstallPiPrivilegedPackage, type PiPrivilegedSecurityScan } from "./piPrivilegedPackages";
import {
  ensureProjectBoardWorkflowForDispatch,
  listAutoContinuableRestartInterruptedRuns,
  listAutoStartablePreparedOrchestrationRuns,
  prepareAndRecordDueScheduledLocalTaskRuns,
  prepareAndRecordNextOrchestrationRuns,
} from "./orchestrationDispatch";
import { startPreparedOrchestrationRun } from "./orchestrationRunner";
import { readOrchestrationBoardWithWorkflowReadiness, readOrchestrationWorkflowReadiness } from "./orchestrationWorkflowReadiness";
import { loadWorkflowFile } from "./workflow";
import {
  createWorkflowSampleArtifact,
  readWorkflowDashboard,
  readWorkflowRunDetail,
  resolveWorkflowApproval,
  reviewWorkflowArtifact,
  revalidateWorkflowArtifact,
  updateWorkflowArtifactSource,
  updateWorkflowConnectorGrant,
} from "./workflowDashboard";
import { createDiagnosticBundle, type DiagnosticDataSource } from "./diagnostics";
import { importDiagnosticBundleFromFile } from "./diagnosticBundleImport";
import {
  clearTencentDbMemoryStorage,
  inspectTencentDbMemoryDiagnostics,
} from "./memory/tencentdb/diagnostics";
import {
  discoverAmbientMemoryEmbeddingProviders,
  runAmbientMemoryEmbeddingLifecycleAction,
} from "./memory/tencentdb/managedEmbeddingProvider";
import { createChatExportBundle } from "./chatExport";
import { listWorkspaceOpenTargets, openWorkspaceTarget } from "./externalEditors";
import { BrowserService, managedChromeRevealBoundsForWorkArea, type ManagedChromeWindowBounds } from "./browserService";
import { BrowserCredentialStore } from "./browserCredentialStore";
import { InternalBrowserHost } from "./internalBrowserHost";
import { compileWorkflowArtifact } from "./workflowCompilerService";
import {
  buildWorkflowDebugRewriteContext,
  buildWorkflowDebugRewritePromptSection,
  createWorkflowDebugRewriteRevision,
  workflowDebugRewriteUserRequest,
} from "./workflowDebugRewrite";
import {
  answerWorkflowDiscoveryQuestion,
  resolveWorkflowDiscoveryAccessRequest,
  startWorkflowDiscovery,
  startWorkflowRevisionDiscovery,
} from "./workflowDiscoveryService";
import { AmbientWorkflowDiscoveryProvider } from "./workflowDiscoveryProvider";
import { describeWorkflowDiscoveryCapability, searchWorkflowDiscoveryCapabilities } from "./workflowDiscoveryCapabilitySearch";
import { buildWorkflowDiscoveryPolicyContext } from "./workflowDiscoveryPolicy";
import { workspaceInventoryConnector, workspaceInventoryConnectorDescriptor } from "./workflowConnectors";
import { AmbientWorkflowExplorationProvider, runWorkflowThreadExploration } from "./workflowExplorationService";
import { workflowToolDescriptorsFromPluginRegistry } from "./workflowPluginCapabilities";
import { invokeWorkflowNativeTool } from "./workflowNativeTools";
import { discoverCapabilityBuilderHistory, saveCapabilityBuilderEnvSecret } from "./capabilityBuilder";
import { runWorkflowArtifact } from "./workflowRunService";
import { buildWorkflowRecoveryPlan } from "./workflowRecovery";
import { markStaleWorkflowRunForRecoveryIfNeeded } from "./workflowStaleRunRecovery";
import { runDueWorkflowArtifactSchedules, workflowScheduleRunStartedEventData } from "./workflowScheduleDispatch";
import { runDueWorkflowPlaybookSchedules } from "./workflowPlaybookScheduleDispatch";
import { compactExpiredWorkflowTraceData, WORKFLOW_TRACE_RETENTION_SWEEP_MS } from "./workflowTraceRetention";
import { SafeStorageWorkflowConnectorTokenVault } from "./workflowConnectorAuth";
import { googleWorkspaceOAuthProvidersFromEnv } from "./googleOAuthProvider";
import { googleWorkspaceConnectorDescriptors, googleWorkspaceConnectorRegistrations, type GoogleWorkspaceConnectorDescriptorOptions } from "./googleWorkspaceConnectors";
import { GoogleSidecarSupervisor } from "./googleSidecarSupervisor";
import { GoogleWorkspaceCliAdapter } from "./googleWorkspaceCliAdapter";
import { GoogleWorkspaceCliInstaller } from "./googleWorkspaceCliInstaller";
import { GoogleWorkspaceSetupService } from "./googleWorkspaceSetupService";
import { GoogleWorkspaceMethodBroker } from "./googleWorkspaceMethodBroker";
import { restoreWorkflowVersion } from "./workflowVersionRestore";
import {
  AMBIENT_KEYS_URL,
  clearSavedAmbientApiKey,
  readAmbientApiKey,
  saveAmbientApiKey,
  testAmbientApiKey,
} from "./credentialStore";
import {
  LAMBDA_RLM_SOURCE_COMMIT,
  LAMBDA_RLM_SOURCE_PAPER,
  LAMBDA_RLM_SOURCE_REPOSITORY,
} from "./lambdaRlm";
import {
  centerBoundsInWorkArea,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  parsePersistedWindowState,
  type PersistedWindowState,
} from "./windowState";
import {
  appearanceBackgroundColor,
  normalizePlannerSettings,
  normalizeLocalDeepResearchAppSettings,
  normalizeSearchRoutingSettings,
  normalizeThinkingDisplaySettings,
  readPlannerSettings,
  readThemePreference,
  readMediaPlaybackSettings,
  readLocalDeepResearchSettings,
  readSearchRoutingSettings,
  readSttSettings,
  readThinkingDisplaySettings,
  readVoiceSettings,
  resolveAppearance,
  writeMediaPlaybackSettings,
  writeLocalDeepResearchSettings,
  writePlannerSettings,
  writeSearchRoutingSettings,
  writeSttSettings,
  writeThinkingDisplaySettings,
  writeThemePreference,
  writeVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
} from "./appAppearance";
import { ambientLegacyUserDataPaths, hasRestorableWorkspaceState, migrateAmbientUserData } from "./userDataMigration";
import { renderThreadMiniWindowHtml } from "./threadMiniWindowHtml";
import {
  discoverAmbientCliPackages,
  discoverAmbientCliEmbeddingProviders,
  discoverAmbientCliSttProviders,
  discoverAmbientCliVoiceProviders,
  runAmbientCliPackageCommand,
  saveAmbientCliPackageEnvSecret,
  searchAmbientCliCapabilities,
  type AmbientCliPackageSummary,
} from "./ambientCliPackages";
import { hydrateWebResearchSettings } from "./webResearchSettingsHydration";
import { regenerateMessageVoiceState } from "./voiceRuntime";
import {
  clearManagedVoiceArtifacts,
  clearManagedVoiceArtifactsSync,
  inspectVoiceArtifactRetention,
  pruneManagedVoiceArtifactsToBudget,
  pruneVoiceArtifactOrphans,
} from "./voiceArtifacts";
import { collectVoiceOnboardingHostFacts } from "./voiceOnboardingHostFacts";
import { mergeVoiceProvidersWithCachedVoices, readVoiceDiscoveryCache, refreshVoiceProviderVoices } from "./voiceDiscoveryCache";
import { mergeSttProvidersWithValidation, readQwen3AsrValidationMetadata, setupQwen3AsrProvider } from "./sttProviderInstaller";
import { analyzeMiniCpmVisionInput, setupMiniCpmVisionProvider } from "./miniCpmVisionProvider";
import { detectLocalDeepResearchManagedAssets } from "./localDeepResearchManagedAssets";
import {
  installLocalDeepResearchManagedAssets,
  localDeepResearchInstallJobWarnings,
  reconcileLocalDeepResearchInstallJob,
  type LocalDeepResearchInstallServiceResult,
} from "./localDeepResearchInstallService";
import { listLocalDeepResearchRunHistory } from "./localDeepResearchRunService";
import { runLocalDeepResearchRealAssetSmoke } from "./localDeepResearchSmoke";
import { detectLocalLlamaResidentProcesses } from "./localLlamaResidencyPolicy";
import { localDeepResearchRequestedLaunch, sampleLocalModelHostMemorySnapshot } from "./localModelResourceRegistry";
import { buildLocalModelRuntimeStatusSnapshot } from "./localModelRuntimeStatus";
import { type LocalDeepResearchModelProfileId } from "./localDeepResearchModelProfiles";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput as LocalDeepResearchSetupContractInput,
} from "./localDeepResearchSetup";
import { validateLocalDeepResearchSetup } from "./localDeepResearchValidation";
import { webResearchSettingsWithDynamicProviderCatalogs } from "./searchSettingsTools";
import { saveSttTestAudio } from "./sttTestAudio";
import { SttRuntime } from "./sttRuntime";
import { SttDiagnosticRecorder, sttSetupDiagnosticSummary, sttTranscriptionDiagnosticSummary } from "./sttDiagnostics";
import { validatePlannerDurableHtmlFileInBrowser } from "./plannerDurableBrowserValidation";
import { PlannerDurableHtmlValidationError, writePlannerDurableHtmlArtifact } from "./plannerDurableHtml";
import { plannerDurableFallbackWarnings } from "./plannerDurableRepair";
import { registerMainIpc } from "./ipc/registerMainIpc";

installAppLogCapture();

const { autoUpdater } = electronUpdater;

const projectIdSchema = z.string().min(1).max(128);
const threadActionSchema = z.object({
  threadId: z.string().min(1),
  projectId: projectIdSchema.optional(),
});
const workspacePathSchema = z.string().min(1).max(4096);
const localPathSchema = z.string().min(1).max(4096);
const workspaceSearchSchema = z.union([
  z.string().min(1).max(500),
  z.object({
    query: z.string().min(1).max(500),
    scope: z.enum(["chat", "project", "all-projects"]).optional(),
    threadId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
]);
const terminalIdSchema = z.string().min(1);
const terminalSessionTokenSchema = z.string().min(1).max(200);
function formatPiResourceCountsForPermission(counts: Record<"extension" | "skill" | "prompt" | "theme", number>): string {
  return `extensions ${counts.extension}, skills ${counts.skill}, prompts ${counts.prompt}, themes ${counts.theme}`;
}

function formatPiPrivilegedInstallApprovalDetail(scan: PiPrivilegedSecurityScan): string {
  const findings = scan.findings.length
    ? scan.findings.map((finding) => `- [${finding.severity}] ${finding.category}: ${finding.message}`).join("\n")
    : "- No high-risk patterns found by the heuristic scan.";
  return [
    `Workspace: ${store.getWorkspace().path}`,
    `Package: ${scan.packageName}`,
    scan.version ? `Version: ${scan.version}` : undefined,
    `Source: ${scan.source}`,
    `Scan origin: ${scan.scanOrigin}`,
    `Fingerprint: ${scan.fingerprint}`,
    `Recommendation: ${scan.recommendation}`,
    `Findings: ${scan.findings.length}`,
    findings,
    "Effect: copy package into Ambient-managed privileged Pi install state as disabled.",
    "Alpha does not activate hooks, MCP servers, commands, background processes, or Pi settings changes.",
    scan.caveat,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function formatPiExtensionSandboxInstallApprovalDetail(preview: PiExtensionSandboxInstallPreview): string {
  const tools = preview.candidate?.tools.map((tool) => tool.name).join(", ") || "none";
  return [
    `Workspace: ${store.getWorkspace().path}`,
    `Source: ${preview.source}`,
    preview.resolvedSource ? `Repository: ${preview.resolvedSource}` : undefined,
    preview.packagePath ? `Package path: ${preview.packagePath}` : undefined,
    preview.sha ? `SHA: ${preview.sha}` : undefined,
    preview.packageName ? `Package: ${preview.packageName}` : undefined,
    preview.version ? `Version: ${preview.version}` : undefined,
    preview.entrypoint ? `Entrypoint: ${preview.entrypoint}` : undefined,
    `Allowed network hosts: ${preview.allowedNetworkHosts.join(", ") || "none"}`,
    `Tools: ${tools}`,
    "Host policy: filesystem, process, env, eval, Function, unsupported imports, and undeclared network hosts are denied.",
    "Effect: copy the package into Ambient-managed Pi extension sandbox state.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}
let mainWindow: BrowserWindow | undefined;
const threadMiniWindows = new Map<string, BrowserWindow>();
let windowStateSaveTimer: NodeJS.Timeout | undefined;
let rendererRecoveryWindowStartedAt = 0;
let rendererRecoveryAttempts = 0;
let rendererRecoveryTimer: NodeJS.Timeout | undefined;
let themePreference: ThemePreference = "system";
let mediaPlaybackSettings = { generatedMediaAutoplay: false };
let thinkingDisplaySettings: ThinkingDisplaySettings = { mode: "transient", showRunStatusCard: false };
let plannerSettings: PlannerSettings = { autoFinalize: true };
let localDeepResearchSettings: LocalDeepResearchSettings = normalizeLocalDeepResearchAppSettings(undefined);
let searchRoutingSettings: SearchRoutingSettings = {};

function emitMainWindowDesktopEvent(event: DesktopEvent): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  const webContents = window.webContents;
  if (webContents.isDestroyed() || webContents.isCrashed()) return;
  try {
    webContents.send("desktop:event", event);
  } catch (error) {
    console.warn(`Dropped desktop event after renderer became unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let voiceSettings: VoiceSettings = {
  enabled: false,
  mode: "assistant-final" as const,
  autoplay: false,
  maxChars: 1500,
  longReply: "summarize" as const,
  format: "mp3" as const,
  artifactCacheMaxMb: 30,
};
let sttSettings: SttSettings = {
  enabled: false,
  spokenLanguage: "English",
  microphone: {},
  mode: "push-to-talk" as const,
  autoSendAfterTranscription: true,
  silenceFinalizeSeconds: 0.8,
  noSpeechGate: {
    enabled: true,
    rmsThresholdDbfs: -55,
  },
  bargeIn: {
    stopTtsOnSpeech: true,
    queueWhileAgentRuns: true,
  },
};
const sttRuntimes = new Map<string, SttRuntime>();
const sttDiagnostics = new SttDiagnosticRecorder();
let voiceSettingsAudit: VoiceSettingsAuditEntry[] = [];
let workflowTraceRetentionTimer: NodeJS.Timeout | undefined;
const workspaceMediaServer = new WorkspaceMediaServer((workspacePath) => Boolean(projectRuntimeHostForKnownWorkspacePath(workspacePath)));
let officePreviewService: OfficePreviewService | undefined;
interface ActiveWorkflowRunController {
  controller: AbortController;
  workspacePath: string;
}

const activeWorkflowRuns = new Map<string, ActiveWorkflowRunController>();
const projectBoardSynthesisPauseRequests = new Set<string>();
const projectBoardSynthesisAbortControllers = new Map<string, AbortController>();
const PROJECT_BOARD_SYNTHESIS_STALE_MS = DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS;

function rememberActiveWorkflowRun(runId: string, controller: AbortController, workspacePath: string): void {
  activeWorkflowRuns.set(runId, {
    controller,
    workspacePath: normalizeWorkspacePath(workspacePath),
  });
}

function activeWorkflowRunController(runId: string): AbortController | undefined {
  return activeWorkflowRuns.get(runId)?.controller;
}

function activeWorkflowRunHost(runId: string): ProjectRuntimeHost | undefined {
  const activeRun = activeWorkflowRuns.get(runId);
  if (!activeRun) return undefined;
  return projectRuntimeHostForKnownWorkspacePath(activeRun.workspacePath) ?? projectRuntimeHostForWorkspacePath(activeRun.workspacePath);
}

function forgetActiveWorkflowRun(runId: string): void {
  activeWorkflowRuns.delete(runId);
}

function forgetActiveWorkflowRunsForController(controller: AbortController): void {
  for (const [runId, activeRun] of [...activeWorkflowRuns.entries()]) {
    if (activeRun.controller === controller) activeWorkflowRuns.delete(runId);
  }
}

function isProjectBoardSynthesisPauseRequested(runId: string, targetStore: ProjectStore = store): boolean {
  return projectBoardSynthesisPauseRequests.has(runId) || targetStore.getProjectBoardSynthesisRun(runId)?.status === "pause_requested";
}

function abortProjectBoardSynthesisForPause(runId: string, reason: string, targetStore: ProjectStore = store): boolean {
  if (!isProjectBoardSynthesisPauseRequested(runId, targetStore)) return false;
  const controller = projectBoardSynthesisAbortControllers.get(runId);
  if (!controller || controller.signal.aborted) return true;
  controller.abort(new Error(reason));
  return true;
}

function pauseProjectBoardSynthesisForProjectHost(host: ProjectRuntimeHost, input: PauseProjectBoardSynthesisInput): void {
  const targetStore = host.store;
  let run = targetStore.requestProjectBoardSynthesisRunPause({
    boardId: input.boardId,
    runId: input.runId,
    reason: input.reason,
  });
  if (run.status !== "paused" && projectBoardSynthesisAbortControllers.has(input.runId)) {
    projectBoardSynthesisPauseRequests.add(input.runId);
    abortProjectBoardSynthesisForPause(input.runId, input.reason?.trim() || "Project-board planning pause requested.", targetStore);
  } else if (run.status === "pause_requested") {
    projectBoardSynthesisPauseRequests.delete(input.runId);
    run = targetStore.markProjectBoardSynthesisRunPaused({
      boardId: input.boardId,
      runId: input.runId,
      reason:
        "Planning pause was finalized immediately because this desktop process has no active Ambient/Pi planner stream for the run.",
      metadata: {
        orphanedPauseRequest: true,
        recoverySource: "pause_request_without_active_controller",
      },
    });
  }
}

async function retryProjectBoardSynthesisForProjectHost(
  host: ProjectRuntimeHost,
  input: RetryProjectBoardSynthesisInput,
): Promise<DesktopState> {
  const targetStore = host.store;
  if (input.retryOfRunId && input.mode === "failed_sections") {
    recordProjectBoardSynthesisSectionDecision(input.boardId, input.retryOfRunId, "retry_failed_sections", undefined, targetStore);
    emitProjectStateIfActive(host);
    if (projectBoardSemanticIdleDogfoodFastRetryEnabled()) {
      seedProjectBoardSemanticIdleDogfoodRetry(input.boardId, input.retryOfRunId, targetStore);
      emitProjectStateIfActive(host);
      return readStateForProjectHostAction(host);
    }
  } else if (input.retryOfRunId && input.mode === "stalled_run") {
    targetStore.markProjectBoardSynthesisRunStalled({
      boardId: input.boardId,
      runId: input.retryOfRunId,
      reason: "Marked stalled from the project-board progress panel before retrying.",
    });
    emitProjectStateIfActive(host);
  } else if (input.retryOfRunId && input.mode === "continue_batch") {
    recordProjectBoardSynthesisPlannerContinuationDecision(input.boardId, input.retryOfRunId, targetStore);
    emitProjectStateIfActive(host);
  } else if (input.retryOfRunId && input.mode === "paused_run") {
    recordProjectBoardSynthesisResumeDecision(input.boardId, input.retryOfRunId, targetStore);
    emitProjectStateIfActive(host);
  } else if (input.retryOfRunId && input.mode === "start_fresh") {
    recordProjectBoardSynthesisStartFreshDecision(input.boardId, input.retryOfRunId, targetStore);
    emitProjectStateIfActive(host);
  }
  await applyProjectBoardLiveSynthesis(input.boardId, {
    replaceExistingDraft: true,
    retryOfRunId: input.retryOfRunId,
    retryMode: input.mode,
    targetStore,
    host,
  });
  return readStateForProjectHostAction(host);
}

function recoverOrphanedProjectBoardSynthesisPauseRequests(board?: ProjectSummary["board"], targetStore: ProjectStore = store): ProjectSummary["board"] {
  if (!board) return board;
  let recovered = false;
  for (const run of board.synthesisRuns ?? []) {
    if (run.status !== "pause_requested") continue;
    if (projectBoardSynthesisAbortControllers.has(run.id)) continue;
    projectBoardSynthesisPauseRequests.delete(run.id);
    targetStore.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "Planning pause was finalized because no active Ambient/Pi planner stream is attached to this desktop process.",
      metadata: {
        orphanedPauseRequest: true,
        recoverySource: "desktop_state_recovery",
      },
    });
    recovered = true;
  }
  return recovered ? targetStore.getProjectBoard(board.id) : board;
}

function activeProjectBoardForState(targetStore: ProjectStore = store, threadId?: string): ProjectSummary["board"] {
  return recoverOrphanedProjectBoardSynthesisPauseRequests(targetStore.getActiveProjectBoard(threadId), targetStore);
}

function activeProjectBoardThreadIdForStore(targetStore: ProjectStore = store): string | undefined {
  const host = projectRuntimeHostForStore(targetStore);
  if (host) return activeThreadIdForHost(host);
  return targetStore === store ? activeThreadId : undefined;
}

let projectRegistry: ProjectRegistry;
const permissions = new PermissionPromptService(() => mainWindow);
const privilegedCredentials = new PrivilegedCredentialPromptService(() => mainWindow);
const secureInputs = new SecureInputPromptService(() => mainWindow);
const browserLoginBrokerEnabled = process.env.AMBIENT_BROWSER_LOGIN_BROKER !== "0";
const ambientLaunchArgs = parseAmbientLaunchArgs(process.argv.slice(1));
const localTextSubagentStartup = localTextSubagentStartupFeatureFromEnv(process.env);
for (const warning of localTextSubagentStartup.warnings) {
  console.warn(`[startup] Local text sub-agent runtime disabled: ${warning}`);
}
let pluginHost: AmbientPluginHost;
let pluginAuthService: PluginAuthService;
let googleSidecarSupervisor: GoogleSidecarSupervisor | undefined;
let googleWorkspaceCliAdapter: GoogleWorkspaceCliAdapter;
let googleWorkspaceCliInstaller: GoogleWorkspaceCliInstaller;
let googleWorkspaceSetupService: GoogleWorkspaceSetupService;
let googleWorkspaceMethodBroker: GoogleWorkspaceMethodBroker;
let googleWorkspaceConnectorMode: "disabled" | "gws" | "ambient_oauth" = "disabled";
let googleWorkspaceConnectorsEnabled = false;
let activeThreadId = "";
const desktopUpdateService = new DesktopUpdateService(
  autoUpdater,
  desktopUpdateConfigFromEnv({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    releaseChannel: process.env.AMBIENT_RELEASE_CHANNEL,
  }),
  (update) => emitMainWindowDesktopEvent({ type: "update-status", update }),
);

async function checkForUpdatesFromAppMenu(): Promise<void> {
  try {
    const update = await desktopUpdateService.checkForUpdates("manual");
    await showAppMenuUpdateCheckResult(update);
  } catch (error) {
    await showAppMenuUpdateCheckError(error);
  }
}

async function showAppMenuUpdateCheckResult(update: DesktopUpdateState): Promise<void> {
  switch (update.status) {
    case "available":
      await showAppMenuUpdateDialog({
        type: "info",
        message: "An Ambient Desktop update is available.",
        detail: updateDialogDetail([
          update.availableVersion ? `Available version: ${update.availableVersion}` : undefined,
          `Installed version: ${update.currentVersion}`,
          "Open Ambient Desktop to download and install the update.",
        ]),
      });
      return;
    case "downloading":
      await showAppMenuUpdateDialog({
        type: "info",
        message: "Ambient Desktop is downloading an update.",
        detail: updateDialogDetail([
          update.availableVersion ? `Version: ${update.availableVersion}` : undefined,
          update.progress ? `Progress: ${Math.round(update.progress.percent)}%` : undefined,
        ]),
      });
      return;
    case "downloaded":
      await showAppMenuUpdateDialog({
        type: "info",
        message: "An Ambient Desktop update is ready to install.",
        detail: updateDialogDetail([
          update.availableVersion ? `Version: ${update.availableVersion}` : undefined,
          "Open Ambient Desktop to restart and install the update.",
        ]),
      });
      return;
    case "installing":
      await showAppMenuUpdateDialog({
        type: "info",
        message: "Ambient Desktop will install the update while restarting.",
        detail: updateDialogDetail([update.availableVersion ? `Version: ${update.availableVersion}` : undefined]),
      });
      return;
    case "not-available":
      await showAppMenuUpdateDialog({
        type: "info",
        message: "Ambient Desktop is up to date.",
        detail: updateDialogDetail([
          `Installed version: ${update.currentVersion}`,
          `Channel: ${update.channel}`,
          update.lastCheckedAt ? `Last checked: ${update.lastCheckedAt}` : undefined,
        ]),
      });
      return;
    case "checking":
      await showAppMenuUpdateDialog({
        type: "info",
        message: "Ambient Desktop is already checking for updates.",
        detail: updateDialogDetail([`Installed version: ${update.currentVersion}`, `Channel: ${update.channel}`]),
      });
      return;
    case "disabled":
      await showAppMenuUpdateDialog({
        type: "info",
        message: "Updates are not active.",
        detail: update.disabledReason ?? "Ambient Desktop updates are not configured for this build.",
      });
      return;
    case "error":
      await showAppMenuUpdateDialog({
        type: "error",
        message: "Could not check for updates.",
        detail: update.error ?? "Ambient Desktop could not complete the update check.",
      });
      return;
    case "idle":
      await showAppMenuUpdateDialog({
        type: "info",
        message: "Ambient Desktop did not start a new update check.",
        detail: updateDialogDetail([`Installed version: ${update.currentVersion}`, `Channel: ${update.channel}`]),
      });
  }
}

function updateDialogDetail(lines: Array<string | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

async function showAppMenuUpdateCheckError(error: unknown): Promise<void> {
  await showAppMenuUpdateDialog({
    type: "error",
    message: "Could not check for updates.",
    detail: error instanceof Error ? error.message : String(error),
  });
}

async function showAppMenuUpdateDialog(options: {
  type: "info" | "error";
  message: string;
  detail: string;
}): Promise<void> {
  const dialogOptions = {
    type: options.type,
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
    title: "Ambient Desktop Updates",
    message: options.message,
    detail: options.detail,
    noLink: true,
  };
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  if (window) {
    await dialog.showMessageBox(window, dialogOptions);
  } else {
    await dialog.showMessageBox(dialogOptions);
  }
}

export interface ProjectRuntimeHost {
  workspacePath: string;
  store: ProjectStore;
  internalBrowserHost: InternalBrowserHost;
  browserService: BrowserService;
  browserCredentialStore: BrowserCredentialStore;
  runtime: AgentRuntime;
  terminals: TerminalService;
  activeThreadId: string;
  autoDispatch: ProjectAutoDispatchState;
}

interface ProjectAutoDispatchState {
  enabled: boolean;
  inFlight: boolean;
  timer?: NodeJS.Timeout;
  lastTickAt?: string;
  lastError?: string;
  lastStartedRunIds: string[];
  lastStartedRuns: OrchestrationAutoDispatchStartedRun[];
}

interface RuntimeFeatureHostContext {
  store: ProjectStore;
  browserService: BrowserService;
  activeThreadId: () => string;
}

const projectRuntimeHosts = new Map<string, ProjectRuntimeHost>();
let activeHost: ProjectRuntimeHost | undefined;
let store: ProjectStore;
let internalBrowserHost: InternalBrowserHost;
let browserService: BrowserService;
let browserCredentialStore: BrowserCredentialStore;
let runtime: AgentRuntime;
let terminals: TerminalService;
const rendererLocalPreviewServers = new LocalPreviewServerManager();

interface RendererDiagnosticBreadcrumb {
  at: string;
  type: string;
  detail?: Record<string, unknown>;
}

const RENDERER_DIAGNOSTIC_BREADCRUMB_LIMIT = 50;
const rendererDiagnosticBreadcrumbs: RendererDiagnosticBreadcrumb[] = [];

function currentFeatureFlagSnapshot(targetStore: ProjectStore = store) {
  return resolveAmbientFeatureFlags({
    settings: targetStore.getFeatureFlagSettings(),
    startup: ambientLaunchArgs.featureFlags,
  });
}

function currentModelRuntimeCatalog(generatedAt: string, targetStore: ProjectStore = store) {
  return targetStore.getModelRuntimeCatalog(
    generatedAt,
    localTextSubagentStartup.feature ? [localTextSubagentStartup.feature.profile] : [],
  );
}

function recordRendererDiagnosticBreadcrumb(type: string, detail: Record<string, unknown> = {}): void {
  const sanitized = sanitizeRendererDiagnosticRecord(detail);
  rendererDiagnosticBreadcrumbs.push({
    at: new Date().toISOString(),
    type,
    ...(Object.keys(sanitized).length ? { detail: sanitized } : {}),
  });
  if (rendererDiagnosticBreadcrumbs.length > RENDERER_DIAGNOSTIC_BREADCRUMB_LIMIT) {
    rendererDiagnosticBreadcrumbs.splice(0, rendererDiagnosticBreadcrumbs.length - RENDERER_DIAGNOSTIC_BREADCRUMB_LIMIT);
  }
}

function sanitizeRendererDiagnosticRecord(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, 60)) {
    output[redactSensitiveText(key).slice(0, 160)] = sanitizeRendererDiagnosticValue(value);
  }
  return output;
}

function sanitizeRendererDiagnosticValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateRendererDiagnosticText(redactSensitiveText(value));
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (depth >= 4) return truncateRendererDiagnosticText(redactSensitiveText(String(value)));
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeRendererDiagnosticValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
      output[redactSensitiveText(key).slice(0, 160)] = sanitizeRendererDiagnosticValue(nested, depth + 1);
    }
    return output;
  }
  return truncateRendererDiagnosticText(redactSensitiveText(String(value)));
}

function truncateRendererDiagnosticText(value: string, max = 1_000): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function setActiveThreadId(threadId: string): string {
  activeThreadId = threadId;
  if (activeHost?.store === store) activeHost.activeThreadId = threadId;
  store.setLastActiveThreadId(threadId);
  return threadId;
}

function setProjectHostActiveThreadId(host: ProjectRuntimeHost, threadId: string): string {
  host.activeThreadId = threadId;
  host.store.setLastActiveThreadId(threadId);
  if (activeHost === host) activeThreadId = threadId;
  return threadId;
}

function activeRuntimeFeatureHostContext(): RuntimeFeatureHostContext {
  return {
    store,
    browserService,
    activeThreadId: () => activeThreadId,
  };
}

function createAutoDispatchState(enabled: boolean): ProjectAutoDispatchState {
  return {
    enabled,
    inFlight: false,
    lastStartedRunIds: [],
    lastStartedRuns: [],
  };
}

function createAgentRuntimeFeatures(context?: RuntimeFeatureHostContext): AgentRuntimeFeatures {
  const featureStore = context?.store ?? store;
  const emitFeatureStateUpdated = () => emitRuntimeFeatureStateUpdated(featureStore);
  return {
    browserLoginBroker: browserLoginBrokerEnabled,
    featureFlags: {
      readSnapshot: () => currentFeatureFlagSnapshot(featureStore),
    },
    mcp: {
      userDataPath: app.getPath("userData"),
      appVersion: packageJson.version,
      env: process.env,
    },
    localModelHostMemory: () => sampleLocalModelHostMemorySnapshot(),
    googleWorkspace: {
      readIntegration: () => readFirstPartyGoogleIntegration(),
      installCli: async () => {
        const install = await googleWorkspaceCliInstaller.install();
        refreshGoogleWorkspaceConnectorMode();
        return install;
      },
      startSetup: (input) => googleWorkspaceSetupService.start(input),
      importOAuthClient: (input) => googleWorkspaceSetupService.importOAuthClientConfig(input),
      cancelSetup: () => googleWorkspaceSetupService.cancel(),
      validate: (input) => googleWorkspaceSetupService.validate(input),
      searchMethods: (input) => googleWorkspaceMethodBroker.searchMethods(input),
      describeMethod: (input) => googleWorkspaceMethodBroker.describeMethod(input),
      resolveAccountHint: (accountHint) => googleWorkspaceSetupService.resolveAccountHintForCall(accountHint),
      call: (input) => googleWorkspaceMethodBroker.call(input),
      materializeFile: (input) => googleWorkspaceMethodBroker.materializeFile(input),
    },
    workflowNativeTools: {
      connectorDescriptors: () => firstPartyWorkflowConnectorDescriptors(),
      connectorRegistrations: () => firstPartyWorkflowConnectorRegistrations(),
      connectorAccountAuthorizer: () => firstPartyWorkflowConnectorAccountAuthorizer(),
    },
    search: {
      readSettings: () => searchRoutingSettings,
      updateSettings: async (input) => {
        searchRoutingSettings = normalizeSearchRoutingSettings(input);
        await writeSearchRoutingSettings(appearancePreferencesPath(), searchRoutingSettings);
        emitFeatureStateUpdated();
        return searchRoutingSettings;
      },
    },
    localDeepResearch: {
      readSettings: () => localDeepResearchSettings,
      updateSettings: async (input) => {
        localDeepResearchSettings = normalizeLocalDeepResearchAppSettings(input);
        await writeLocalDeepResearchSettings(appearancePreferencesPath(), localDeepResearchSettings);
        emitFeatureStateUpdated();
        return localDeepResearchSettings;
      },
    },
    ...(localTextSubagentStartup.feature
      ? {
        localTextSubagents: {
          resolveModelRuntimeProfile: localTextSubagentStartup.feature.resolveModelRuntimeProfile,
          resolveRuntimeForMain: localTextSubagentStartup.feature.resolveRuntimeForMain,
          resolveRuntimeForLaunch: localTextSubagentStartup.feature.resolveRuntimeForLaunch,
          resolveRuntime: localTextSubagentStartup.feature.resolveRuntime,
        },
      }
      : {}),
    media: {
      readSettings: () => mediaPlaybackSettings,
      updateSettings: (input) => updateMediaPlaybackSettings(input, { onStateUpdated: emitFeatureStateUpdated }),
    },
    planner: {
      readSettings: () => plannerSettings,
      updateSettings: (input) => updatePlannerSettings(input, { onStateUpdated: emitFeatureStateUpdated }),
    },
    projects: {
      listProjects: () => listRuntimeProjects(context?.store ?? store),
      createProject: (input) => createProjectWorkspaceForRuntime(input, context?.store ?? store),
      switchProject: (input) => switchProjectWorkspaceForRuntime(input),
    },
    workflowAgents: {
      runExploration: async (input) => runWorkflowExplorationForRuntime(input, context),
      compilePreview: async (input) => compileWorkflowPreviewForRuntime(input, context),
      reviewArtifact: async (input) => reviewWorkflowArtifactForRuntime(input, context),
      cancelRun: async (input) => cancelWorkflowRunForRuntime(input, context),
      recoverRun: async (input) => recoverWorkflowRunForRuntime(input, context),
    },
    workflowRecordings: {
      search: (input) => searchGlobalAmbientWorkflowPlaybooks(input),
      describe: (input) => describeGlobalAmbientWorkflowPlaybook(input),
      inject: (input) => injectGlobalAmbientWorkflowPlaybook(input),
      update: (input) => updateGlobalAmbientWorkflowPlaybook(input),
      archive: (input) => archiveGlobalAmbientWorkflowPlaybook(input),
      unarchive: (input) => unarchiveGlobalAmbientWorkflowPlaybook(input),
      restoreVersion: (input) => restoreGlobalAmbientWorkflowPlaybookVersion(input),
    },
    voice: {
      readSettings: () => voiceSettings,
      updateSettings: (input, audit) => updateVoiceSettings(input, audit, {
        providerStore: featureStore,
        workspacePath: featureStore.getWorkspace().path,
        onStateUpdated: emitFeatureStateUpdated,
      }),
      listProviders: (workspacePath) => discoverAmbientCliVoiceProviders(workspacePath),
      onStateUpdated: emitFeatureStateUpdated,
      enforceArtifactBudget: (workspacePath) => enforceVoiceArtifactBudget(workspacePath, featureStore),
      createMediaUrl: (input) => workspaceMediaServer.createUrl(input),
    },
    stt: {
      readSettings: () => sttSettings,
      updateSettings: (input) => updateSttSettings(input, { onStateUpdated: emitFeatureStateUpdated }),
      listProviders: (workspacePath) => listSttProvidersWithValidation(workspacePath),
    },
    privilegedCredentials: {
      request: (input) => privilegedCredentials.request(input),
    },
    secureInputs: {
      request: (input) => secureInputs.request(input),
    },
  };
}

function createProjectRuntimeHost(workspacePath: string, options: { recoverActiveRuns?: boolean; recoverOrchestrationRuns?: boolean } = {}): ProjectRuntimeHost {
  const hostStore = new ProjectStore();
  const workspace = hostStore.openWorkspace(workspacePath, {
    recoverActiveRuns: options.recoverActiveRuns ?? true,
    recoverOrchestrationRuns: options.recoverOrchestrationRuns ?? true,
  });
  const hostInternalBrowser = new InternalBrowserHost(() => hostStore.getWorkspace(), () => mainWindow);
  const hostBrowser = new BrowserService(() => hostStore.getWorkspace(), hostInternalBrowser, {
    browserLoginBrokerAvailable: browserLoginBrokerEnabled,
    managedChromeRevealBounds: managedChromeRevealBoundsForAmbientWindow,
    onStateChanged: () => {
      if (activeHost?.browserService === hostBrowser) emitBrowserState();
    },
  });
  const hostBrowserCredentials = new BrowserCredentialStore(() => hostStore.getWorkspace(), safeStorage);
  const hostTerminals = new TerminalService(() => mainWindow, workspace.path);
  let host: ProjectRuntimeHost;
  const initialHostThreadId = initialActiveThreadIdForStore(hostStore);
  const hostRuntime = new AgentRuntime(
    hostStore,
    hostBrowser,
    hostBrowserCredentials,
    () => mainWindow,
    {
      request: (request) => permissions.request(request),
      denyThread: (threadId) => permissions.denyThread(threadId),
      listPending: () => permissions.listPending(),
      respond: (id, response) => permissions.respond(id, response),
    },
    createAgentRuntimeFeatures({
      store: hostStore,
      browserService: hostBrowser,
      activeThreadId: () => host?.activeThreadId ?? initialHostThreadId,
    }),
  );
  host = {
    workspacePath: workspace.path,
    store: hostStore,
    internalBrowserHost: hostInternalBrowser,
    browserService: hostBrowser,
    browserCredentialStore: hostBrowserCredentials,
    runtime: hostRuntime,
    terminals: hostTerminals,
    activeThreadId: initialHostThreadId,
    autoDispatch: createAutoDispatchState(hostStore.getAutomationAutoDispatchEnabled()),
  };
  return host;
}

function managedChromeRevealBoundsForAmbientWindow(): ManagedChromeWindowBounds {
  const display =
    mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return managedChromeRevealBoundsForWorkArea(display.workArea);
}

function activateProjectRuntimeHost(workspacePath: string): ProjectRuntimeHost {
  const normalized = normalizeWorkspacePath(workspacePath);
  const host = ensureProjectRuntimeHostForWorkspacePath(normalized);
  activeHost = host;
  store = host.store;
  internalBrowserHost = host.internalBrowserHost;
  browserService = host.browserService;
  browserCredentialStore = host.browserCredentialStore;
  runtime = host.runtime;
  terminals = host.terminals;
  setActiveThreadId(host.activeThreadId);
  return host;
}

function projectRuntimeHostList(): ProjectRuntimeHost[] {
  return [...projectRuntimeHosts.values()];
}

function projectRuntimeHostForWorkspacePath(workspacePath: string): ProjectRuntimeHost | undefined {
  return projectRuntimeHosts.get(normalizeWorkspacePath(workspacePath));
}

function ensureProjectRuntimeHostForWorkspacePath(workspacePath: string): ProjectRuntimeHost {
  const normalized = normalizeWorkspacePath(workspacePath);
  let host = projectRuntimeHosts.get(normalized);
  if (!host) {
    host = createProjectRuntimeHost(normalized);
    projectRuntimeHosts.set(host.workspacePath, host);
    runSubagentRuntimeStartupReconciliation("project-runtime-created", host);
    projectRegistry.register(host.store.getWorkspace().path);
  }
  return host;
}

function runSubagentRuntimeStartupReconciliation(reason: "project-runtime-created", host: ProjectRuntimeHost): void {
  const featureFlagSnapshot = currentFeatureFlagSnapshot(host.store);
  const summary = reconcileSubagentsOnRuntimeStartup({
    store: host.store,
    featureFlagSnapshot,
    emit: {
      onRunUpdated: (run) => emitProjectScopedEvent(host, { type: "subagent-run-updated", run }),
      onThreadUpdated: (thread) => emitProjectScopedEvent(host, { type: "thread-updated", thread }),
      onRunEventCreated: (run, event) => emitProjectScopedEvent(host, { type: "subagent-run-event-created", run, event }),
      onParentMailboxEventUpdated: (mailboxEvent) =>
        emitProjectScopedEvent(host, { type: "subagent-parent-mailbox-event-updated", mailboxEvent }),
      onWaitBarrierUpdated: (barrier) => emitProjectScopedEvent(host, { type: "subagent-wait-barrier-updated", barrier }),
    },
  });
  if (summary.issueCount || summary.repairedRunIds.length || summary.repairedBarrierIds.length || summary.diagnosticRunIds.length) {
    console.warn(
      `[subagents] ${reason} restart reconciliation issues=${summary.issueCount} repairedRuns=${summary.repairedRunIds.length} repairedBarriers=${summary.repairedBarrierIds.length} diagnosticRuns=${summary.diagnosticRunIds.length}`,
    );
  }
}

function projectRuntimeHostForStore(targetStore: ProjectStore): ProjectRuntimeHost | undefined {
  return projectRuntimeHostList().find((host) => host.store === targetStore);
}

function emitRuntimeFeatureStateUpdated(targetStore: ProjectStore): void {
  const host = projectRuntimeHostForStore(targetStore);
  if (host) {
    if (isActiveProjectRuntimeHost(host)) emitProjectStateIfActive(host, activeThreadIdForHost(host));
    return;
  }
  if (targetStore === store) emitDesktopState();
}

function projectRuntimeMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
  return projectRuntimeHostList().flatMap((host) => host.runtime.pluginMcpRuntimeSnapshots());
}

function allPluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
  return [...pluginHost.pluginMcpRuntimeSnapshots(), ...projectRuntimeMcpRuntimeSnapshots()];
}

async function restartProjectRuntimeMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
  for (const host of projectRuntimeHostList()) {
    const snapshots = await host.runtime.restartPluginMcpRuntime(key);
    if (snapshots) return allPluginMcpRuntimeSnapshots();
  }
  return undefined;
}

async function stopProjectRuntimeMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
  for (const host of projectRuntimeHostList()) {
    const snapshots = await host.runtime.stopPluginMcpRuntime(key);
    if (snapshots) return allPluginMcpRuntimeSnapshots();
  }
  return undefined;
}

const terminalStartTokens = new TerminalStartTokenStore();

function assertTrustedMainWindowIpc(event: IpcMainInvokeEvent, channel = "Main-process IPC"): void {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error(`${channel} is limited to the main application window.`);
  }
  const frameUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isTrustedRendererUrl(frameUrl)) {
    throw new Error(`${channel} rejected from an untrusted renderer frame.`);
  }
}

function handleIpc(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedMainWindowIpc(event, `IPC channel "${channel}"`);
    return listener(event, ...args);
  });
}

function isTrustedRendererUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const trustedUrl = trustedMainRendererUrl();
    if (!trustedUrl) return false;
    if (trustedUrl.protocol === "file:") return url.protocol === "file:" && url.href === trustedUrl.href;
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === trustedUrl.origin && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function trustedMainRendererUrl(): URL | undefined {
  const devRendererUrl = process.env.ELECTRON_RENDERER_URL?.trim();
  if (devRendererUrl) {
    try {
      const url = new URL(devRendererUrl);
      if ((url.protocol === "http:" || url.protocol === "https:") && isLoopbackHost(url.hostname)) return url;
    } catch {
      return undefined;
    }
    return undefined;
  }
  return pathToFileURL(resolveBuiltOutputPath("renderer", "index.html"));
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

async function readCodexPluginCatalog(targetStore: ProjectStore = store): Promise<CodexPluginCatalog> {
  return pluginHost.readCodexPluginCatalog(targetStore.getWorkspace().path, pluginStateReaderForStore(targetStore));
}

async function readCodexHostedMarketplaceReport(targetStore: ProjectStore = store): Promise<CodexHostedMarketplaceReport> {
  return pluginHost.inspectHostedCodexMarketplace(targetStore.getWorkspace().path, pluginStateReaderForStore(targetStore));
}

async function readAmbientPluginRegistry(targetStore: ProjectStore = store): Promise<AmbientPluginRegistry> {
  return pluginHost.listRegistry(targetStore.getWorkspace().path, pluginStateReaderForStore(targetStore));
}

function createMcpInstallCatalog(): { toolHive: ToolHiveRuntimeService; catalog: McpInstallCatalog } {
  const toolHive = new ToolHiveRuntimeService({
    userDataPath: app.getPath("userData"),
    env: process.env,
  });
  return { toolHive, catalog: new McpInstallCatalog(toolHive, { packageMetadataResolver: createPublicMcpPackageMetadataResolver() }) };
}

function ambientMcpInstallPreview(preview: McpRegistryInstallPreview): AmbientMcpInstallPreview {
  return {
    serverId: preview.serverId,
    title: preview.review.title,
    summary: preview.review.summary,
    sourceSummary: preview.review.sourceSummary,
    runtimeSummary: preview.review.runtimeSummary,
    permissionSummary: preview.review.permissionSummary,
    secretSummary: preview.review.secretSummary,
    validationSummary: preview.review.validationSummary,
    blockers: preview.review.blockers,
    warnings: preview.review.warnings,
    riskLevel: preview.candidate.riskSummary.level,
    riskReasons: preview.candidate.riskSummary.reasons,
    ...(preview.runPlan
      ? {
          runPlan: {
            serverId: preview.runPlan.serverId,
            workloadName: preview.runPlan.workloadName,
            group: preview.runPlan.group,
            isolateNetwork: preview.runPlan.isolateNetwork,
            transport: preview.runPlan.transport,
            permissionProfilePath: preview.runPlan.permissionProfilePath,
            sourceRef: preview.runPlan.sourceRef,
          },
        }
      : {}),
    permissionProfile: {
      path: preview.permissionProfile.path,
      sha256: preview.permissionProfile.sha256,
    },
    expectedTools: preview.candidate.validationPlan.expectedTools,
    reviewText: mcpRegistryInstallPreviewText(preview),
  };
}

function ambientMcpContainerRuntimeStatus(
  result: ContainerRuntimeProbeResult,
  setup: ContainerRuntimeSetupPromptState,
  defaultCapabilities: McpDefaultCapabilitySummary[],
): AmbientMcpContainerRuntimeStatus {
  const installPlan = buildContainerRuntimeInstallPlanFromProbe(result);
  return {
    schemaVersion: result.schemaVersion,
    status: result.status,
    ...(result.runtime ? { runtime: result.runtime } : {}),
    platform: result.platform,
    arch: result.arch,
    checkedAt: result.checkedAt,
    durationMs: result.durationMs,
    message: result.message,
    nextAction: result.nextAction,
    toolHive: {
      status: result.toolHive.status,
      message: result.toolHive.message,
      ...(result.toolHive.preflight ? { preflightOk: result.toolHive.preflight.ok } : {}),
      ...(result.toolHive.version?.stdout
        ? {
            versionLine: result.toolHive.version.stdout.split(/\r?\n/).find((line) => line.trim())?.trim(),
          }
        : {}),
    },
    hosts: result.hosts.map((host) => ({
      kind: host.kind,
      status: host.status,
      ...(host.version ? { version: host.version } : {}),
      message: host.message,
    })),
    setup,
    postInstallQueue: result.postInstallQueue,
    defaultCapabilities,
    ...(installPlan ? { installPlan } : {}),
  };
}

let mcpContainerRuntimeStatusProbeInFlight: Promise<AmbientMcpContainerRuntimeStatus> | undefined;

async function probeAmbientMcpContainerRuntimeStatus(): Promise<AmbientMcpContainerRuntimeStatus> {
  if (mcpContainerRuntimeStatusProbeInFlight) return mcpContainerRuntimeStatusProbeInFlight;
  const probe = probeAmbientMcpContainerRuntimeStatusUncached();
  mcpContainerRuntimeStatusProbeInFlight = probe;
  try {
    return await probe;
  } finally {
    if (mcpContainerRuntimeStatusProbeInFlight === probe) mcpContainerRuntimeStatusProbeInFlight = undefined;
  }
}

async function probeAmbientMcpContainerRuntimeStatusUncached(): Promise<AmbientMcpContainerRuntimeStatus> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const result = await probeContainerRuntime({ toolHive });
  const setupState = await recordContainerRuntimeProbeState(mcpContainerRuntimeSetupStatePath(), result, {
    appVersion: packageJson.version,
  });
  let installedServers: McpInstalledServerSummary[] = [];
  try {
    installedServers = await catalog.listInstalledServers();
    const adopted = await adoptExistingDefaultCapabilityInstallState({ catalog, toolHive, installedServers });
    if (adopted) installedServers = await catalog.listInstalledServers();
  } catch (error) {
    console.warn(`[mcp-default-capabilities] installed server read failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const defaultCapabilities = await reconcileMcpDefaultCapabilities({
    statePath: mcpDefaultCapabilityStatePath(),
    runtime: result,
    defaultCatalog: loadDefaultMcpCatalog(),
    installedServers,
    appVersion: packageJson.version,
  });
  return ambientMcpContainerRuntimeStatus(result, containerRuntimeSetupPromptState(result, setupState), defaultCapabilities);
}

async function adoptExistingDefaultCapabilityInstallState(input: {
  catalog: McpInstallCatalog;
  toolHive: ToolHiveRuntimeService;
  installedServers: McpInstalledServerSummary[];
}): Promise<boolean> {
  const defaultCatalog = loadDefaultMcpCatalog();
  const scrapling = defaultCatalog.find((descriptor) => descriptor.defaultCapability?.capabilityId === "scrapling");
  if (!scrapling?.defaultCapability) return false;
  const alreadyInstalled = input.installedServers.some((server) =>
    (server.serverId === scrapling.serverId || server.workloadName === scrapling.defaultCapability?.workloadName) &&
    isMcpDefaultCapabilityInstalledServerAvailable(server)
  );
  if (alreadyInstalled) return false;
  const adopted = await adoptExistingMcpDefaultCapability({
    capabilityId: "scrapling",
    catalog: input.catalog,
    toolHive: input.toolHive,
  }).catch((error) => {
    console.warn(`[mcp-default-capabilities] default Scrapling adoption check failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  });
  if (!adopted) return false;
  console.log(`[mcp-default-capabilities] adopted existing ToolHive workload ${adopted.workload.name ?? scrapling.defaultCapability.workloadName} into current profile.`);
  return true;
}

async function reconcileMcpContainerRuntimeOnStartup(): Promise<void> {
  const status = await probeAmbientMcpContainerRuntimeStatus();
  console.log(
    `[mcp-container-runtime] startup reconciliation status=${status.status} decision=${status.setup.userDecision} prompt=${status.setup.shouldPrompt ? "yes" : "no"} version=${status.setup.upgradeReconciledAppVersion ?? packageJson.version}`,
  );
  if (status.setup.shouldPrompt) {
    emitMainWindowDesktopEvent({
      type: "mcp-container-runtime-setup-needed",
      reason: "startup-runtime-setup-prompt",
    });
  }
}

function mcpContainerRuntimeSetupStatePath(): string {
  return join(app.getPath("userData"), "mcp-container-runtime", "setup-state.json");
}

function mcpDefaultCapabilityStatePath(): string {
  return mcpDefaultCapabilityStatePathForUserData(app.getPath("userData"));
}

function mcpSetupErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emitMcpDefaultCapabilityInstallProgress(
  host: ProjectRuntimeHost,
  input: {
    capabilityId: "scrapling";
    title: string;
    workloadName: string;
    phase: AmbientMcpDefaultCapabilityInstallProgress["phase"];
    message: string;
    image?: string;
    resolvedImage?: string;
    runtime?: string;
  },
): void {
  const status: AmbientMcpDefaultCapabilityInstallProgress["status"] =
    input.phase === "completed" ? "succeeded" : input.phase === "failed" ? "failed" : "running";
  emitMainWindowDesktopEvent({
    type: "mcp-default-capability-install-progress",
    workspacePath: host.workspacePath,
    progress: {
      schemaVersion: "ambient-mcp-default-capability-install-progress-v1",
      capabilityId: input.capabilityId,
      title: input.title,
      workloadName: input.workloadName,
      phase: input.phase,
      status,
      message: input.message,
      ...(input.image ? { image: input.image } : {}),
      ...(input.resolvedImage ? { resolvedImage: input.resolvedImage } : {}),
      ...(input.runtime ? { runtime: input.runtime } : {}),
      recordedAt: new Date().toISOString(),
    },
  });
}

async function recordMcpDefaultCapabilitySummaryUpdate(
  summary: McpDefaultCapabilitySummary,
): Promise<void> {
  await writeMcpDefaultCapabilitySummary(mcpDefaultCapabilityStatePath(), summary, {
    appVersion: packageJson.version,
  });
}

async function installMcpDefaultCapabilityForDesktop(
  host: ProjectRuntimeHost,
  input: AmbientMcpDefaultCapabilityInstallInput,
): Promise<AmbientMcpServerInstallResult> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const targetThreadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(targetThreadId);
  if (thread.collaborationMode === "planner") throw new Error("MCP default capability installation is blocked in Planner Mode.");

  const defaultCatalog = loadDefaultMcpCatalog();
  const descriptor = defaultCatalog.find((candidate) => candidate.defaultCapability?.capabilityId === input.capabilityId);
  const serverId = descriptor?.serverId ?? "io.github.d4vinci/scrapling";
  const runtimeProbe = await probeContainerRuntime({ toolHive });
  const installedBefore = await catalog.listInstalledServers();
  const defaultCapabilitiesBefore = await reconcileMcpDefaultCapabilities({
    statePath: mcpDefaultCapabilityStatePath(),
    runtime: runtimeProbe,
    defaultCatalog,
    installedServers: installedBefore,
    appVersion: packageJson.version,
  });
  const existing = installedBefore.find((server) =>
    server.serverId === serverId ||
    server.workloadName === descriptor?.defaultCapability?.workloadName ||
    (descriptor && (server.defaultCatalogDescriptorHash === mcpDefaultCatalogDescriptorHash(descriptor) ||
      server.installedDefaultCatalogDescriptorHash === mcpDefaultCatalogDescriptorHash(descriptor)))
  );
  if (existing && isMcpDefaultCapabilityInstalledServerAvailable(existing)) {
    return {
      status: "already-installed",
      serverId: existing.serverId,
      workloadName: existing.workloadName,
      message: `Default MCP capability ${input.capabilityId} is already installed as ToolHive workload ${existing.workloadName}.`,
      installed: installedBefore,
      defaultCapabilities: defaultCapabilitiesBefore,
    };
  }
  if (existing) {
    if (existing.workloadStatus) {
      await toolHive.removeWorkload(existing.workloadName).catch((error) => {
        console.warn(`[mcp-default-capabilities] stale workload cleanup failed for ${existing.workloadName}: ${error instanceof Error ? error.message : String(error)}`);
      });
    } else {
      await toolHive.removeInstalledServerState(existing.workloadName);
    }
  }

  const preflight = runtimeProbe.toolHive.preflight;
  if (runtimeProbe.status !== "ready" || !preflight) {
    return {
      status: "runtime-preflight-failed",
      serverId,
      message: `Default MCP capability ${input.capabilityId} is blocked because the isolated container runtime is not ready.\n\n${containerRuntimeProbeSummary(runtimeProbe)}`,
      runtimeStatus: runtimeProbe.status,
      defaultCapabilities: defaultCapabilitiesBefore,
      installed: installedBefore,
      exitCode: preflight?.command.exitCode,
      durationMs: preflight?.command.durationMs,
    };
  }

  const preview = await catalog.previewDefaultCapabilityInstall({ capabilityId: input.capabilityId });
  if (!preview.runPlan || !preview.toolHiveRunSource || preview.review.blockers.length) {
    return {
      status: "blocked",
      serverId: preview.serverId,
      workloadName: preview.runPlan?.workloadName,
      message: `Default MCP capability install is blocked.\n\n${mcpDefaultCapabilityInstallApprovalDetail({ preview, workspace: { path: host.workspacePath }, preflight: preflight.command })}`,
      defaultCapabilities: defaultCapabilitiesBefore,
      installed: installedBefore,
      permissionProfile: {
        path: preview.permissionProfile.path,
        sha256: preview.permissionProfile.sha256,
      },
    };
  }
  emitMcpDefaultCapabilityInstallProgress(host, {
    capabilityId: input.capabilityId,
    title: preview.defaultDescriptor.title,
    workloadName: preview.runPlan.workloadName,
    phase: "approval-requested",
    message: `Waiting for approval to set up ${preview.defaultDescriptor.title}.`,
    image: preview.toolHiveRunSource,
  });

  const detail = mcpDefaultCapabilityInstallApprovalDetail({
    preview,
    workspace: { path: host.workspacePath },
    preflight: preflight.command,
  });
  const resolution = await requestPermissionWithGrantRegistry({
    threadId: targetThreadId,
    workspacePath: thread.workspacePath,
    toolName: "ambient_mcp_default_capability_install",
    title: `Set up default MCP capability "${preview.defaultDescriptor.title}"?`,
    message:
      "Ambient will install and start the reviewed pinned Scrapling OCI image through ToolHive as a global default capability. Individual Scrapling tool calls remain separately reviewed.",
    detail,
    risk: "plugin-tool",
    grantTargetLabel: `Set up default MCP capability ${preview.defaultDescriptor.title}`,
    grantTargetHash: permissionGrantTargetHash(
      "plugin_tool_execute",
      "tool",
      ["ambient_mcp_default_capability_install", preview.serverId, preview.runPlan.workloadName, mcpDefaultCatalogDescriptorHash(preview.defaultDescriptor)].join("\0"),
    ),
  }, {
    thread,
    permissionMode: thread.permissionMode,
    workspacePath: host.workspacePath,
    store: host.store,
    requireFreshPrompt: true,
  });
  if (!resolution.allowed) throw new Error("MCP default capability install was not approved.");
  emitMcpDefaultCapabilityInstallProgress(host, {
    capabilityId: input.capabilityId,
    title: preview.defaultDescriptor.title,
    workloadName: preview.runPlan.workloadName,
    phase: "approval-granted",
    message: `Approval received. Preparing ${preview.defaultDescriptor.title} install.`,
    image: preview.toolHiveRunSource,
  });

  const installingCapability = defaultCapabilitiesBefore.find((capability) => capability.capabilityId === input.capabilityId);
  if (installingCapability) {
    await recordMcpDefaultCapabilitySummaryUpdate({
      ...installingCapability,
      status: "installing",
      nextAction: "install-default-capability",
      message: `Installing ${installingCapability.title}. Pulling the reviewed image and starting ToolHive workload ${preview.runPlan.workloadName}.`,
      lastReconciledAt: new Date().toISOString(),
      appVersion: packageJson.version,
    });
    emitMcpDefaultCapabilityInstallProgress(host, {
      capabilityId: input.capabilityId,
      title: preview.defaultDescriptor.title,
      workloadName: preview.runPlan.workloadName,
      phase: "state-updated",
      message: `${preview.defaultDescriptor.title} setup is now in progress.`,
      image: preview.toolHiveRunSource,
    });
  }

  let install: InstallMcpDefaultCapabilityResult;
  try {
    install = await installMcpDefaultCapability({
      capabilityId: input.capabilityId,
      catalog,
      toolHive,
      platform: runtimeProbe.platform,
      arch: runtimeProbe.arch,
      preferredContainerRuntime: runtimeProbe.runtime,
      containerRuntimeEnv: await toolHive.containerRuntimeEnv(),
      onProgress: (progress: McpDefaultCapabilityInstallProgress) => {
        emitMcpDefaultCapabilityInstallProgress(host, {
          capabilityId: input.capabilityId,
          title: preview.defaultDescriptor.title,
          workloadName: preview.runPlan!.workloadName,
          phase: progress.phase,
          message: progress.message,
          ...(progress.image ? { image: progress.image } : {}),
          ...(progress.resolvedImage ? { resolvedImage: progress.resolvedImage } : {}),
          ...(progress.runtime ? { runtime: progress.runtime } : {}),
        });
      },
    });
  } catch (error) {
    const message = `Failed to set up ${preview.defaultDescriptor.title}: ${mcpSetupErrorMessage(error)}`;
    if (installingCapability) {
      await recordMcpDefaultCapabilitySummaryUpdate({
        ...installingCapability,
        status: "failed",
        nextAction: "install-default-capability",
        message,
        lastReconciledAt: new Date().toISOString(),
        appVersion: packageJson.version,
      });
    }
    emitMcpDefaultCapabilityInstallProgress(host, {
      capabilityId: input.capabilityId,
      title: preview.defaultDescriptor.title,
      workloadName: preview.runPlan.workloadName,
      phase: "failed",
      message,
      image: preview.toolHiveRunSource,
    });
    const installed = await catalog.listInstalledServers().catch(() => installedBefore);
    const defaultCapabilities = await reconcileMcpDefaultCapabilities({
      statePath: mcpDefaultCapabilityStatePath(),
      runtime: runtimeProbe,
      defaultCatalog,
      installedServers: installed,
      appVersion: packageJson.version,
    });
    emitPluginCatalogUpdated(host.workspacePath);
    return {
      status: "blocked",
      serverId: preview.serverId,
      workloadName: preview.runPlan.workloadName,
      message,
      installed,
      defaultCapabilities,
      permissionProfile: {
        path: preview.permissionProfile.path,
        sha256: preview.permissionProfile.sha256,
      },
    };
  }
  const installed = await catalog.listInstalledServers();
  const defaultCapabilities = await reconcileMcpDefaultCapabilities({
    statePath: mcpDefaultCapabilityStatePath(),
    runtime: runtimeProbe,
    defaultCatalog,
    installedServers: installed,
    appVersion: packageJson.version,
  });
  emitPluginCatalogUpdated(host.workspacePath);
  return {
    status: "installed",
    serverId: install.preview.serverId,
    workloadName: install.preview.runPlan?.workloadName,
    message: mcpDefaultCapabilityInstallResultText(install),
    installed,
    defaultCapabilities,
    adoptedExistingWorkload: install.adoptedExistingWorkload,
    exitCode: install.command.exitCode,
    durationMs: install.command.durationMs,
    permissionProfile: {
      path: install.preview.permissionProfile.path,
      sha256: install.preview.permissionProfile.sha256,
    },
  };
}

function mcpDefaultCapabilityInstallApprovalDetail(input: {
  preview: InstallMcpDefaultCapabilityResult["preview"];
  workspace: { path: string };
  preflight: ToolHiveCommandResult;
}): string {
  const runPlan = input.preview.runPlan;
  return [
    input.preview.review.title,
    "",
    input.preview.review.summary,
    "",
    `Source: ${input.preview.review.sourceSummary}`,
    `Runtime: ${input.preview.review.runtimeSummary}`,
    `Permissions: ${input.preview.review.permissionSummary}`,
    `Validation: ${input.preview.review.validationSummary}`,
    input.preview.review.warnings.length ? `Warnings: ${input.preview.review.warnings.join("; ")}` : "Warnings: none.",
    input.preview.review.blockers.length ? `Blockers: ${input.preview.review.blockers.join("; ")}` : "Blockers: none.",
    "",
    "Approval context:",
    `- Workspace: ${input.workspace.path}`,
    `- ToolHive runtime preflight: exit ${input.preflight.exitCode}`,
    runPlan
      ? `- Command shape: thv run --name ${runPlan.workloadName} --group ${runPlan.group} --isolate-network --permission-profile ${runPlan.permissionProfilePath} ${input.preview.toolHiveRunSource}${input.preview.toolHiveServerArgs.length ? ` -- ${input.preview.toolHiveServerArgs.join(" ")}` : ""}`
      : "- Command shape: unavailable",
    `- Default descriptor hash: ${mcpDefaultCatalogDescriptorHash(input.preview.defaultDescriptor)}`,
    "- Install scope: global Ambient MCP default capability state.",
    "- Tool use: Scrapling tool calls remain separately reviewed through ambient_mcp_tool_call.",
  ].join("\n");
}

function mcpDefaultCapabilityInstallResultText(result: InstallMcpDefaultCapabilityResult): string {
  const runPlan = result.preview.runPlan;
  return [
    result.adoptedExistingWorkload
      ? `Adopted existing default MCP capability ${result.preview.defaultDescriptor.title}.`
      : `Installed default MCP capability ${result.preview.defaultDescriptor.title}.`,
    runPlan ? `Workload: ${runPlan.workloadName}` : undefined,
    result.workload.status ? `Runtime status: ${result.workload.status}` : undefined,
    result.workload.endpoint ? `Endpoint: ${result.workload.endpoint}` : undefined,
    defaultCapabilityImageResolutionText(result.imageResolution),
    `ToolHive command: ${result.command.command}`,
    `Exit code: ${result.command.exitCode}`,
    `Permission profile: ${result.preview.permissionProfile.path}`,
    "Next: use ambient_mcp_tool_search and ambient_mcp_tool_describe before calling Scrapling tools.",
  ].filter(Boolean).join("\n");
}

async function installMcpRegistryServerForDesktop(
  host: ProjectRuntimeHost,
  input: { serverId: string; refresh?: boolean },
): Promise<AmbientMcpServerInstallResult> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const targetThreadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(targetThreadId);
  if (thread.collaborationMode === "planner") throw new Error("MCP server installation is blocked in Planner Mode.");
  const existing = (await catalog.listInstalledServers()).find((server) => server.serverId === input.serverId);
  if (existing) {
    return {
      status: "already-installed",
      serverId: existing.serverId,
      workloadName: existing.workloadName,
      message: `MCP server ${existing.serverId} is already installed as ToolHive workload ${existing.workloadName}.`,
      installed: await catalog.listInstalledServers(),
    };
  }
  const defaultCapabilityId = catalog.defaultCapabilityIdForServerId(input.serverId);
  if (defaultCapabilityId) {
    return installMcpDefaultCapabilityForDesktop(host, { capabilityId: defaultCapabilityId });
  }

  const preview = await catalog.previewRegistryInstall(input);
  if (!preview.runPlan || preview.review.blockers.length) {
    return {
      status: "blocked",
      serverId: preview.serverId,
      message: `MCP server install is blocked.\n\n${mcpRegistryInstallPreviewText(preview)}`,
      permissionProfile: {
        path: preview.permissionProfile.path,
        sha256: preview.permissionProfile.sha256,
      },
    };
  }

  const gate = await evaluateMcpInstallGate({
    toolHive,
    catalog,
    defaultCapabilityStatePath: mcpDefaultCapabilityStatePath(),
    appVersion: packageJson.version,
  });
  const runtimeProbe = gate.runtimeProbe;
  const preflight = runtimeProbe.toolHive.preflight;
  if (gate.status !== "ready" || !preflight) {
    return {
      status: gate.status === "ready" ? "runtime-preflight-failed" : gate.status,
      serverId: preview.serverId,
      workloadName: preview.runPlan.workloadName,
      message: mcpInstallGateSummary(gate),
      runtimeStatus: runtimeProbe.status,
      defaultCapabilities: gate.defaultCapabilities,
      exitCode: preflight?.command.exitCode,
      durationMs: preflight?.command.durationMs,
      permissionProfile: {
        path: preview.permissionProfile.path,
        sha256: preview.permissionProfile.sha256,
      },
    };
  }

  const detail = mcpServerInstallApprovalDetail({
    preview,
    workspace: { path: host.workspacePath },
    preflight: preflight.command,
  });
  const resolution = await requestPermissionWithGrantRegistry({
    threadId: targetThreadId,
    workspacePath: thread.workspacePath,
    toolName: "ambient_mcp_server_install",
    title: `Install MCP server "${preview.candidate.displayName}"?`,
    message:
      "Ambient will install and start this ToolHive registry MCP server in the Ambient ToolHive group. Tool-level use remains a separate reviewed MCP bridge step.",
    detail,
    risk: "plugin-tool",
    grantTargetLabel: `Install MCP server ${preview.candidate.displayName}`,
    grantTargetHash: permissionGrantTargetHash(
      "plugin_tool_execute",
      "tool",
      ["ambient_mcp_server_install", preview.serverId, preview.runPlan.workloadName].join("\0"),
    ),
  }, {
    thread,
    permissionMode: thread.permissionMode,
    workspacePath: host.workspacePath,
    store: host.store,
    requireFreshPrompt: true,
  });
  if (!resolution.allowed) throw new Error("MCP server install was not approved.");

  const result = await toolHive.runRegistryServer({
    serverId: preview.serverId,
    workloadName: preview.runPlan.workloadName,
    registrySource: preview.catalogSource,
    sourceIdentity: mcpInstallPreviewSourceIdentity(preview),
    ...(preview.defaultDescriptor
      ? {
          defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(preview.defaultDescriptor),
          defaultCatalogReviewedAt: preview.defaultDescriptor.source.reviewedAt,
        }
      : {}),
    installReview: mcpInstallPreviewReviewState(preview, new Date().toISOString()),
    secretBindings: mcpInstallPreviewSecretBindings(preview),
    transport: preview.runPlan.transport,
    permissionProfile: preview.permissionProfile.profile,
  });
  const workload = await toolHive.waitForAmbientWorkload(preview.runPlan.workloadName, { timeoutMs: 90_000 });
  emitPluginCatalogUpdated(host.workspacePath);
  return {
    status: "installed",
    serverId: preview.serverId,
    workloadName: preview.runPlan.workloadName,
    message: [
      `Installed MCP server ${preview.serverId}.`,
      `Workload: ${preview.runPlan.workloadName}`,
      workload.status ? `Runtime status: ${workload.status}` : undefined,
      workload.endpoint ? `Endpoint: ${workload.endpoint}` : undefined,
      `Exit code: ${result.exitCode}`,
      `Permission profile: ${preview.permissionProfile.path}`,
    ].filter(Boolean).join("\n"),
    installed: await catalog.listInstalledServers(),
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    permissionProfile: {
      path: preview.permissionProfile.path,
      sha256: preview.permissionProfile.sha256,
    },
  };
}

async function uninstallMcpServerForDesktop(
  host: ProjectRuntimeHost,
  input: { serverId?: string; workloadName?: string },
): Promise<AmbientMcpServerUninstallResult> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const targetThreadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(targetThreadId);
  if (thread.collaborationMode === "planner") throw new Error("MCP server uninstall is blocked in Planner Mode.");
  const selected = selectMcpInstalledServer(await catalog.listInstalledServers(), input);
  const detail = mcpServerUninstallApprovalDetail({
    server: selected,
    workspace: { path: host.workspacePath },
  });
  const resolution = await requestPermissionWithGrantRegistry({
    threadId: targetThreadId,
    workspacePath: thread.workspacePath,
    toolName: "ambient_mcp_server_uninstall",
    title: `Remove MCP server "${selected.serverId}"?`,
    message: "Ambient will stop and remove this Ambient-managed ToolHive MCP workload. Secrets are not deleted by this action.",
    detail,
    risk: "plugin-tool",
    grantTargetLabel: `Remove MCP server ${selected.serverId}`,
    grantTargetHash: permissionGrantTargetHash(
      "plugin_tool_execute",
      "tool",
      ["ambient_mcp_server_uninstall", selected.serverId, selected.workloadName].join("\0"),
    ),
  }, {
    thread,
    permissionMode: thread.permissionMode,
    workspacePath: host.workspacePath,
    store: host.store,
    requireFreshPrompt: true,
  });
  if (!resolution.allowed) throw new Error("MCP server uninstall was not approved.");

  let stopResult: ToolHiveCommandResult | undefined;
  const workloadStatus = selected.workloadStatus?.toLowerCase();
  if (workloadStatus !== "stopped" && workloadStatus !== "exited") {
    stopResult = await toolHive.stopWorkload(selected.workloadName, 30);
  }
  const removeResult = await toolHive.removeWorkload(selected.workloadName);
  emitPluginCatalogUpdated(host.workspacePath);
  return {
    status: "removed",
    serverId: selected.serverId,
    workloadName: selected.workloadName,
    message: [
      `Removed MCP server ${selected.serverId}.`,
      `Workload: ${selected.workloadName}`,
      stopResult ? `Stop exit code: ${stopResult.exitCode}` : "Stop skipped because workload was reported stopped.",
      `Remove exit code: ${removeResult.exitCode}`,
    ].join("\n"),
    installed: await catalog.listInstalledServers(),
    stopExitCode: stopResult?.exitCode,
    removeExitCode: removeResult.exitCode,
    durationMs: (stopResult?.durationMs ?? 0) + removeResult.durationMs,
  };
}

async function acceptMcpToolDescriptorReviewForDesktop(
  host: ProjectRuntimeHost,
  input: { serverId?: string; workloadName?: string; expectedDescriptorHash?: string },
): Promise<AmbientMcpToolReviewAcceptResult> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const targetThreadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(targetThreadId);
  if (thread.collaborationMode === "planner") throw new Error("MCP tool descriptor review acceptance is blocked in Planner Mode.");
  const selected = selectMcpInstalledServer(await catalog.listInstalledServers(), input);
  if (!selected.lastKnownToolDescriptorHash) throw new Error(`No MCP tool descriptor snapshot exists for ${selected.serverId}. Refresh tool discovery before accepting review.`);
  if (input.expectedDescriptorHash && input.expectedDescriptorHash !== selected.lastKnownToolDescriptorHash) {
    throw new Error(`MCP tool descriptor snapshot changed before review could be accepted. Expected ${input.expectedDescriptorHash}, found ${selected.lastKnownToolDescriptorHash}.`);
  }

  if (selected.toolDescriptorReviewStatus === "needs-review") {
    const detail = mcpToolDescriptorReviewApprovalDetail(selected, host.workspacePath, input.expectedDescriptorHash);
    const resolution = await requestPermissionWithGrantRegistry({
      threadId: targetThreadId,
      workspacePath: thread.workspacePath,
      toolName: "ambient_mcp_tool_review_accept",
      title: `Trust MCP tool descriptors for "${selected.serverId}"?`,
      message:
        "Ambient will mark this installed ToolHive MCP server's current tool descriptor snapshot trusted. This clears descriptor drift but does not call a downstream MCP tool.",
      detail,
      risk: "plugin-tool",
      grantTargetLabel: `Trust MCP tool descriptors ${selected.serverId}`,
      grantTargetHash: permissionGrantTargetHash(
        "plugin_tool_execute",
        "tool",
        ["ambient_mcp_tool_review_accept", selected.serverId, selected.workloadName, selected.lastKnownToolDescriptorHash].join("\0"),
      ),
    }, {
      thread,
      permissionMode: thread.permissionMode,
      workspacePath: host.workspacePath,
      store: host.store,
      requireFreshPrompt: true,
    });
    if (!resolution.allowed) throw new Error("MCP tool descriptor review acceptance was not approved.");
  }

  const result = await toolHive.trustInstalledServerToolDescriptors(selected.workloadName, input.expectedDescriptorHash);
  emitPluginCatalogUpdated(host.workspacePath);
  return {
    status: result.wasReviewRequired ? "trusted" : "already-trusted",
    serverId: selected.serverId,
    workloadName: selected.workloadName,
    descriptorHash: result.descriptorHash,
    message: result.wasReviewRequired
      ? `Trusted current MCP tool descriptors for ${selected.serverId}.`
      : `MCP tool descriptors for ${selected.serverId} were already trusted.`,
    installed: await catalog.listInstalledServers(),
  };
}

function mcpToolDescriptorReviewApprovalDetail(
  server: McpInstalledServerSummary,
  workspacePath: string,
  expectedDescriptorHash?: string,
): string {
  return [
    `Trust current MCP tool descriptors for ${server.serverId}?`,
    "",
    "Review context:",
    `- Workspace: ${workspacePath}`,
    `- Workload: ${server.workloadName}`,
    `- Runtime status: ${server.workloadStatus ?? "unknown"}`,
    server.endpoint ? `- Endpoint: ${server.endpoint}` : undefined,
    `- Descriptor review: ${server.toolDescriptorReviewStatus ?? "unknown"}`,
    server.toolDescriptorReviewReason ? `- Review reason: ${server.toolDescriptorReviewReason}` : undefined,
    server.lastKnownToolDescriptorHash ? `- Current descriptor hash: ${server.lastKnownToolDescriptorHash}` : undefined,
    expectedDescriptorHash ? `- Expected descriptor hash: ${expectedDescriptorHash}` : undefined,
    typeof server.lastKnownToolCount === "number" ? `- Cached tool count: ${server.lastKnownToolCount}` : undefined,
    server.lastToolDiscoveryAt ? `- Last discovery: ${server.lastToolDiscoveryAt}` : undefined,
    "- Action: clear descriptor drift for this installed server snapshot only.",
  ].filter(Boolean).join("\n");
}

function selectMcpInstalledServer(
  servers: McpInstalledServerSummary[],
  input: { serverId?: string; workloadName?: string },
): McpInstalledServerSummary {
  const matches = servers.filter((server) => {
    if (input.serverId && server.serverId !== input.serverId) return false;
    if (input.workloadName && server.workloadName !== input.workloadName) return false;
    return true;
  });
  if (matches.length === 0) throw new Error(`No installed Ambient MCP server matches ${input.serverId ?? input.workloadName}.`);
  if (matches.length > 1) throw new Error("Multiple installed Ambient MCP servers matched; provide both serverId and workloadName.");
  return matches[0];
}

async function readCurrentOrchestrationBoard(targetStore: ProjectStore = store) {
  return readOrchestrationBoardWithWorkflowReadiness(targetStore.getWorkspace().path, targetStore.listOrchestrationBoard());
}

function createMainDiagnosticSource(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): DiagnosticDataSource {
  const targetStore = host.store;
  const targetRuntime = host.runtime;
  return {
    getWorkspace: () => targetStore.getWorkspace(),
    listThreads: () => targetStore.listThreads(),
    listMessages: (threadId) => targetStore.listMessages(threadId),
    listPermissionAudit: (limit) => targetStore.listPermissionAudit(limit),
    listPermissionGrants: (input) => targetStore.listPermissionGrants(input),
    listContextUsageSnapshots: (limit) => targetStore.listContextUsageSnapshots(limit),
    getContextDiagnostics: () => ({ tokenizer: targetRuntime.tokenizerStatus() }),
    listOrchestrationBoard: () => targetStore.listOrchestrationBoard(),
    getFeatureFlagSnapshot: () => currentFeatureFlagSnapshot(targetStore),
    getAgentMemoryDiagnostics: () => getAgentMemoryDiagnostics(host),
    getSubagentRepairDiagnostics: (options) => targetStore.getSubagentRepairDiagnostics(options),
    getLocalModelRuntimeStatus: () => targetRuntime.readLocalModelRuntimeStatus(targetStore.getWorkspace().path),
    getPluginDiagnostics: async () => {
      const errors: string[] = [];
      const workspacePath = targetStore.getWorkspace().path;
      const [registry, codexCatalog, hostedMarketplace, piPackages, ambientCliPackages, appAuth] = await Promise.all([
        readDiagnosticSection("ambient plugin registry", () => readAmbientPluginRegistry(targetStore), errors),
        readDiagnosticSection("Codex plugin catalog", () => readCodexPluginCatalog(targetStore), errors),
        readDiagnosticSection("hosted Codex marketplace", () => readCodexHostedMarketplaceReport(targetStore), errors),
        readDiagnosticSection("Pi package catalog", () => pluginHost.inspectPiPackages(workspacePath, pluginStateReaderForStore(targetStore)), errors),
        readDiagnosticSection("Ambient CLI package catalog", () => pluginHost.inspectAmbientCliPackages(workspacePath, { includeHealth: true }), errors),
        readDiagnosticSection("plugin app auth", () => pluginHost.listPluginAppAuth(workspacePath, pluginStateReaderForStore(targetStore)), errors),
      ]);
      return {
        registry,
        codexCatalog,
        hostedMarketplace,
        piPackages,
        ambientCliPackages,
        appAuth,
        mcpRuntimes: allPluginMcpRuntimeSnapshots(),
        errors,
      };
    },
  };
}

async function readDiagnosticSection<T>(label: string, read: () => Promise<T>, errors: string[]): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function pluginStateReaderForStore(targetStore: ProjectStore) {
  return {
    isPluginEnabled: (pluginId: string) => targetStore.isPluginEnabled(pluginId),
    isPluginTrusted: (pluginId: string, pluginFingerprint?: string) => targetStore.isPluginTrusted(pluginId, pluginFingerprint),
    isPiPackageEnabled: (packageId: string) => targetStore.isPiPackageEnabled(packageId),
  };
}

function pluginStateReader() {
  return pluginStateReaderForStore(store);
}

function revokePluginGrantsForLabels(labelPrefixes: string[], targetStore: ProjectStore = store): number {
  let revoked = 0;
  for (const grant of targetStore.listPermissionGrants()) {
    if (grant.actionKind !== "plugin_tool_execute") continue;
    if (!labelPrefixes.some((prefix) => grant.targetLabel === prefix || grant.targetLabel.startsWith(prefix))) continue;
    targetStore.revokePermissionGrant(grant.id);
    revoked += 1;
  }
  return revoked;
}

async function pluginMcpRegistrationsForThread(
  thread: ThreadSummary,
  targetStore: ProjectStore = store,
): Promise<PluginMcpToolRegistration[]> {
  const enabledPlugins = await pluginHost.enabledCodexPlugins(thread.workspacePath, pluginStateReaderForStore(targetStore));
  return pluginHost.buildCodexPluginMcpToolRegistrations(enabledPlugins, {
    permissionMode: thread.permissionMode,
    workspacePath: thread.workspacePath,
  });
}

async function ambientCliCapabilityGrantsForWorkflowRequest(
  workspacePath: string,
  request: string,
): Promise<WorkflowAmbientCliCapabilityGrant[]> {
  try {
    const search = await searchAmbientCliCapabilities(workspacePath, {
      query: request,
      kind: "command",
      limit: 6,
      includeHealth: false,
    });
    return search.results.flatMap((result) =>
      result.commands.map((command) => ({
        capabilityId: command.capabilityId,
        registryPluginId: result.registryPluginId,
        packageId: result.packageId,
        packageName: result.packageName,
        command: command.name,
      })),
    );
  } catch {
    return [];
  }
}

async function runWorkflowExplorationForRuntime(input: { workflowThreadId: string; reason: string }, context = activeRuntimeFeatureHostContext()) {
  const targetStore = context.store;
  const thread = targetStore.getThread(context.activeThreadId());
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
  const workflowWorkspacePath = workflowThread.projectPath || thread.workspacePath;
  const providerStatus = getAmbientProviderStatus(thread.model);
  const pluginThread = { ...thread, workspacePath: workflowWorkspacePath };
  const pluginRegistrations = await pluginMcpRegistrationsForThread(pluginThread, targetStore);
  const pluginRegistry = await pluginHost.listRegistry(workflowWorkspacePath, pluginStateReaderForStore(targetStore));
  const result = await runWorkflowThreadExploration({
    store: targetStore,
    workflowThreadId: input.workflowThreadId,
    toolDescriptors: workflowToolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
    connectorRegistrations: [workspaceInventoryConnector(workflowWorkspacePath), ...firstPartyWorkflowConnectorRegistrations()],
    connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer(),
    pluginRegistrations,
    ambientCliCapabilities: await ambientCliCapabilityGrantsForWorkflowRequest(workflowWorkspacePath, workflowThread.initialRequest),
    workspacePath: workflowWorkspacePath,
    permissionMode: thread.permissionMode,
    model: providerStatus.model,
    baseUrl: providerStatus.baseUrl,
    retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
    browser: context.browserService,
    requestPermission: async (request) =>
      (
        await requestPermissionWithGrantRegistry(request, {
          thread,
          permissionMode: thread.permissionMode,
          workspacePath: workflowWorkspacePath,
          workflowThreadId: input.workflowThreadId,
          store: targetStore,
        })
      ).allowed,
    ensurePluginTrusted: (registration) => ensureWorkflowPluginTrusted(thread, registration, targetStore),
    pluginCaller: (plan, invocation, options) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
    provider: new AmbientWorkflowExplorationProvider({
      apiKey: readAmbientApiKey(),
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
    }),
    onProgress: (progress) =>
      emitWorkflowEvent({ type: "workflow-exploration-progress", progress }, workflowWorkspacePath),
  });
  const folders = targetStore.listWorkflowAgentFolders();
  const updatedThread = folders.flatMap((folder) => folder.threads).find((candidate) => candidate.id === input.workflowThreadId) ?? result.thread;
  emitWorkflowUpdated(workflowWorkspacePath);
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

async function compileWorkflowPreviewForRuntime(input: { workflowThreadId: string; reason: string }, context = activeRuntimeFeatureHostContext()) {
  const targetStore = context.store;
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
  const userRequest = workflowThread.initialRequest.trim();
  if (!userRequest) throw new Error("Workflow Agent compile requires a non-empty initial request.");
  const thread = targetStore.getThread(context.activeThreadId());
  const activeWorkspace = workspaceStateForThread(thread, targetStore);
  const provider = getAmbientProviderStatus(thread.model);
  const pluginRegistrations = await pluginMcpRegistrationsForThread(thread, targetStore);
  const pluginRegistry = await pluginHost.listRegistry(thread.workspacePath, pluginStateReaderForStore(targetStore));
  const dashboard = await compileWorkflowArtifact({
    store: targetStore,
    userRequest,
    workflowThreadId: input.workflowThreadId,
    workspaceSummary: [
      `Workspace: ${activeWorkspace.name}`,
      `Path: ${activeWorkspace.path}`,
      `Permission mode: ${thread.permissionMode}`,
      `Remote workflow command reason: ${input.reason}`,
    ].join("\n"),
    toolDescriptors: workflowToolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
    pluginRegistrations,
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
    stateRoot: targetStore.getWorkspace().statePath,
    model: thread.model,
    permissionMode: thread.permissionMode,
    searchRoutingSettings,
    baseUrl: provider.baseUrl,
    retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
    onProgress: (progress) => emitWorkflowEvent({ type: "workflow-compile-progress", progress }, thread.workspacePath),
  });
  emitWorkflowUpdated(thread.workspacePath);
  const folders = targetStore.listWorkflowAgentFolders();
  const updatedThread = folders.flatMap((folder) => folder.threads).find((candidate) => candidate.id === input.workflowThreadId)
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

async function reviewWorkflowArtifactForRuntime(input: {
  workflowThreadId: string;
  artifactId: string;
  decision: "approved" | "rejected";
  reason: string;
}, context = activeRuntimeFeatureHostContext()) {
  const targetStore = context.store;
  const before = targetStore.getWorkflowArtifact(input.artifactId);
  if (before.workflowThreadId !== input.workflowThreadId) {
    throw new Error("Workflow preview artifact does not belong to the selected Workflow Agent thread.");
  }
  const currentThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
  const workflowWorkspacePath = currentThread.projectPath || targetStore.getThread(context.activeThreadId()).workspacePath;
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
  const dashboard = reviewWorkflowArtifact(targetStore, {
    artifactId: input.artifactId,
    decision: input.decision,
  });
  emitWorkflowUpdated(workflowWorkspacePath);
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

async function cancelWorkflowRunForRuntime(input: { workflowThreadId: string; runId: string; reason: string }, context = activeRuntimeFeatureHostContext()) {
  const targetStore = context.store;
  const run = targetStore.getWorkflowRun(input.runId);
  const artifact = targetStore.getWorkflowArtifact(run.artifactId);
  if (artifact.workflowThreadId !== input.workflowThreadId) {
    throw new Error("Workflow run does not belong to the selected Workflow Agent thread.");
  }
  const thread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
  const workflowWorkspacePath = thread.projectPath || targetStore.getThread(context.activeThreadId()).workspacePath;
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
  const controller = activeWorkflowRunController(run.id);
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
  emitWorkflowUpdated(workflowWorkspacePath);
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

async function recoverWorkflowRunForRuntime(input: {
  workflowThreadId: string;
  runId: string;
  eventId: string;
  action: WorkflowRecoveryAction;
  graphNodeId?: string;
  itemKey?: string;
  reason: string;
}, context = activeRuntimeFeatureHostContext()) {
  const targetStore = context.store;
  const plan = buildWorkflowRecoveryPlan(targetStore, {
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
  markStaleWorkflowRunForRecoveryIfNeeded(targetStore, plan.resumeFromRunId, {
    recoveryAction: plan.recovery.action,
    sourceEventId: plan.recovery.sourceEventId,
    reason: input.reason,
  });
  const ambientThread = targetStore.getThread(context.activeThreadId());
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
  const workflowWorkspacePath = workflowThread.projectPath || ambientThread.workspacePath;
  const provider = getAmbientProviderStatus(ambientThread.model);
  const abortController = new AbortController();
  try {
    const pluginThread = { ...ambientThread, workspacePath: workflowWorkspacePath };
    const pluginRegistrations = await pluginMcpRegistrationsForThread(pluginThread, targetStore);
    const pluginRegistry = await pluginHost.listRegistry(workflowWorkspacePath, pluginStateReaderForStore(targetStore));
    const dashboard = await runWorkflowArtifact({
      store: targetStore,
      artifactId: plan.artifactId,
      workspacePath: workflowWorkspacePath,
      permissionMode: ambientThread.permissionMode,
      browser: context.browserService,
      requestPermission: async (request) =>
        (
          await requestPermissionWithGrantRegistry(request, {
            thread: ambientThread,
            permissionMode: ambientThread.permissionMode,
            workspacePath: workflowWorkspacePath,
            workflowThreadId: input.workflowThreadId,
            store: targetStore,
          })
        ).allowed,
      pluginRegistrations,
      pluginRegistry,
      ensurePluginTrusted: (registration) => ensureWorkflowPluginTrusted(ambientThread, registration, targetStore),
      pluginCaller: (runPlan, invocation, options) => pluginHost.callCodexPluginMcpTool(runPlan, invocation, options),
      connectorRegistrations: firstPartyWorkflowConnectorRegistrations(),
      connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer(),
      model: ambientThread.model,
      baseUrl: provider.baseUrl,
      mode: "execute",
      runtime: "automation",
      resumeFromRunId: plan.resumeFromRunId,
      recovery: plan.recovery,
      abortSignal: abortController.signal,
      onRunStarted: (runId) => {
        rememberActiveWorkflowRun(runId, abortController, workflowWorkspacePath);
        mainWindow?.webContents.send("desktop:event", {
          type: "workflow-run-started",
          runId,
          artifactId: artifact.id,
          workflowThreadId: artifact.workflowThreadId,
          workspacePath: workflowWorkspacePath,
        } satisfies DesktopEvent);
        emitWorkflowUpdated(workflowWorkspacePath);
      },
      onEvent: () => emitWorkflowUpdated(workflowWorkspacePath),
    });
    emitWorkflowUpdated(workflowWorkspacePath);
    const recoveredRun = dashboard.runs
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
    forgetActiveWorkflowRunsForController(abortController);
  }
}

async function workflowDiscoveryPolicyContextForCapabilityLookup(input: {
  workflowThreadId?: string;
  projectPath?: string;
}, context = activeProjectIpcContext()) {
  const targetStore = context.targetStore;
  const thread = context.thread;
  const workflowThread = input.workflowThreadId
    ? targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId)
    : undefined;
  const projectPath = input.projectPath ?? workflowThread?.projectPath ?? thread.workspacePath ?? targetStore.getWorkspace().path;
  const pluginThread = { ...thread, workspacePath: projectPath };
  const pluginRegistrations = await pluginMcpRegistrationsForThread(pluginThread, targetStore);
  return buildWorkflowDiscoveryPolicyContext({
    projectPath,
    workspacePath: thread.workspacePath,
    permissionMode: thread.permissionMode,
    stage: "initial_discovery",
    workflowThreadId: input.workflowThreadId,
    threadId: thread.id,
    grants: targetStore.listPermissionGrants(),
    connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
    pluginRegistrations,
    searchRoutingSettings,
  });
}

function readFirstPartyGoogleIntegration(): FirstPartyGoogleIntegrationState {
  const connectorIds = ["google.gmail", "google.calendar", "google.drive"];
  const gwsStatus = googleWorkspaceCliAdapter?.status();
  const sidecar = googleWorkspaceConnectorMode === "gws" && gwsStatus
    ? gwsStatus
    : {
        adapter: "ambient-go" as const,
        ...(googleSidecarSupervisor?.status() ?? {
          state: "missing" as const,
          binaryPath: "",
          pending: 0,
        }),
      };
  return {
    enabled: googleWorkspaceConnectorsEnabled,
    authMode: googleWorkspaceConnectorMode,
    connectors: connectorIds.map((connectorId) => googleAppAuthState(connectorId)),
    install: googleWorkspaceCliInstaller?.state(),
    setup: redactGoogleWorkspaceSetupState(googleWorkspaceSetupService?.state()),
    sidecar,
    ...(googleWorkspaceConnectorsEnabled
      ? {}
      : {
          unavailableReason:
            gwsStatus?.unavailableReason ??
            "Install Google Workspace CLI (`gws`) or set AMBIENT_GOOGLE_CLIENT_ID before starting Ambient Desktop to enable Google integrations.",
        }),
  };
}

function redactGoogleWorkspaceSetupState(
  setup: FirstPartyGoogleIntegrationState["setup"],
): FirstPartyGoogleIntegrationState["setup"] {
  if (!setup) return undefined;
  const { authUrl: _authUrl, ...safeSetup } = setup;
  return structuredClone(safeSetup);
}

async function openGoogleWorkspaceUrl(url: string): Promise<void> {
  const safeUrl = parseExternalOpenUrl(url);
  if (process.platform === "darwin") {
    if (await runMacOpen(["-a", "Google Chrome", safeUrl])) return;
    if (await runMacOpen(["-b", "com.google.Chrome", safeUrl])) return;
  }
  await openAllowedExternalUrl(safeUrl, "google-workspace");
}

async function openContainerRuntimeApplication(applicationNames: string[]): Promise<boolean> {
  const names = applicationNames.map((name) => name.trim()).filter(Boolean).slice(0, 3);
  if (!names.length) return false;
  if (process.platform === "darwin") {
    for (const name of names) {
      if (await runMacOpen(["-a", name])) {
        console.log(`[mcp-container-runtime] opened application ${name}`);
        return true;
      }
    }
  }
  if (process.platform === "win32") {
    for (const name of names) {
      if (await runWindowsStartApplication(name)) {
        console.log(`[mcp-container-runtime] opened application ${name}`);
        return true;
      }
    }
  }
  return false;
}

function runMacOpen(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/open", args, { stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

function runWindowsStartApplication(applicationName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("cmd.exe", ["/c", "start", "", applicationName], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

function isGoogleWorkspaceSetupUrl(url: string): boolean {
  return /^https:\/\/(?:accounts\.google\.com|console\.cloud\.google\.com)\//.test(url);
}

async function openAllowedExternalUrl(raw: string, source: string): Promise<void> {
  const url = parseExternalOpenUrl(raw);
  recordRendererDiagnosticBreadcrumb("external-url-open", { source, url: externalUrlLogLabel(url) });
  await shell.openExternal(url);
  console.log(`[external-url:${source}] opened ${externalUrlLogLabel(url)}`);
}

async function openRendererLocalUrlInAmbientBrowser(raw: string): Promise<void> {
  const url = parseExternalOpenUrl(raw);
  if (!isLoopbackWebUrl(url)) throw new Error("Only loopback web URLs can be routed to the Ambient browser from renderer links.");
  const host = requireActiveProjectRuntimeHost();
  recordRendererDiagnosticBreadcrumb("renderer-link-local-browser", {
    url: externalUrlLogLabel(url),
    workspacePath: host.workspacePath,
    threadId: activeThreadIdForHost(host),
  });
  await withBrowserState(host, host.browserService.navigate({ url, profileMode: "isolated" }));
  const reveal = await host.browserService.revealActiveBrowser().catch((error) => ({
    message: error instanceof Error ? error.message : String(error),
  }));
  recordBrowserControlAudit(
    host,
    "browser_renderer_link",
    url,
    `Renderer link routed to Ambient browser. ${typeof reveal.message === "string" ? reveal.message : ""}`.trim(),
  );
  await emitBrowserStateForHost(host).catch(() => undefined);
  console.log(`[external-url:renderer-link] routed local URL to Ambient browser ${externalUrlLogLabel(url)}`);
}

function openAllowedExternalUrlFromWindow(raw: string, source: string): void {
  void openAllowedExternalUrl(raw, source).catch((error) => {
    console.warn(`[external-url:${source}] blocked ${externalUrlLogLabel(raw)}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function externalUrlLogLabel(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "[invalid-url]";
  }
}

function installExternalNavigationGuards(
  window: BrowserWindow,
  input: { source: string; allowNavigation?: (url: string) => boolean },
): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternalUrlFromWindow(url, `${input.source}:window-open`);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (input.allowNavigation?.(url)) return;
    event.preventDefault();
    openAllowedExternalUrlFromWindow(url, `${input.source}:navigate`);
  });
}

function refreshGoogleWorkspaceConnectorMode(): void {
  const gwsStatus = googleWorkspaceCliAdapter?.status();
  const googleOAuthProviders = googleWorkspaceOAuthProvidersFromEnv(process.env);
  if (gwsStatus && gwsStatus.state !== "missing") {
    googleWorkspaceConnectorMode = "gws";
    googleWorkspaceConnectorsEnabled = true;
    return;
  }
  if (googleOAuthProviders.length > 0) {
    googleWorkspaceConnectorMode = "ambient_oauth";
    googleWorkspaceConnectorsEnabled = true;
    return;
  }
  googleWorkspaceConnectorMode = "gws";
  googleWorkspaceConnectorsEnabled = false;
}

function firstPartyWorkflowConnectorDescriptors() {
  const descriptors = [workspaceInventoryConnectorDescriptor()];
  if (!googleWorkspaceConnectorsEnabled) return descriptors;
  const options = firstPartyGoogleConnectorDescriptorOptions();
  return [
    ...descriptors,
    ...googleWorkspaceConnectorDescriptors(options),
  ];
}

function firstPartyWorkflowConnectorRegistrations() {
  if (!googleWorkspaceConnectorsEnabled) return [];
  if (googleWorkspaceConnectorMode === "gws") {
    return googleWorkspaceConnectorRegistrations(
      {
        sidecar: googleWorkspaceCliAdapter,
      },
      firstPartyGoogleConnectorDescriptorOptions(),
    );
  }
  return googleWorkspaceConnectorRegistrations({
    auth: pluginAuthService,
    sidecar: googleSidecarSupervisor!,
  }, firstPartyGoogleConnectorDescriptorOptions());
}

function firstPartyWorkflowConnectorAccountAuthorizer() {
  return googleWorkspaceConnectorMode === "gws" ? undefined : pluginAuthService.connectorAccountAuthorizer();
}

function firstPartyGoogleConnectorDescriptorOptions(): GoogleWorkspaceConnectorDescriptorOptions {
  const adapter = googleWorkspaceConnectorMode === "gws" ? "gws" : "ambient-oauth";
  return {
    adapter,
    states: Object.fromEntries(
      ["google.gmail", "google.calendar", "google.drive"].map((connectorId) => {
        const authState = googleAppAuthState(connectorId);
        return [
          connectorId,
          {
            status: authState.status,
            accounts: authState.accounts.map((account) => ({
              id: account.accountId,
              label: account.email ?? account.label,
            })),
          },
        ];
      }),
    ),
  };
}

function googleAppAuthState(connectorId: string) {
  if (googleWorkspaceConnectorMode !== "gws") return pluginAuthService.appAuthState(connectorId);
  const status = googleWorkspaceCliAdapter.status();
  const accounts = googleWorkspaceSetupService.accountSummaries();
  const setup = googleWorkspaceSetupService.state();
  const authStatus = status.state === "missing"
    ? "unavailable" as const
    : accounts.some((account) => account.status === "available")
      ? "available" as const
      : setup.status === "running" || setup.status === "validating"
        ? "connecting" as const
        : accounts.some((account) => account.status === "error")
          ? "error" as const
          : "not_configured" as const;
  return {
    connectorId,
    providerId: "google.workspace.cli",
    providerLabel: "Google Workspace CLI",
    status: authStatus,
    accounts: status.state === "missing" ? [] : accounts,
    ...(status.state === "missing" ? { unavailableReason: status.unavailableReason } : {}),
  };
}

function resetRuntimeAndPluginServers(reason = RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE): void {
  for (const host of projectRuntimeHostList()) {
    host.runtime.interruptActiveRuns(reason);
    host.runtime.resetSessions();
  }
  void pluginHost.shutdownPluginMcpServers().catch((error) => {
    console.warn(`Ambient plugin MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function workspacePathsForProjectRuntimeHost(host: ProjectRuntimeHost): string[] {
  const board = host.store.listOrchestrationBoard();
  return [
    ...new Set(
      [
        host.workspacePath,
        host.store.getProjectArtifactWorkspacePath(),
        ...host.store.listThreads().map((thread) => thread.workspacePath),
        ...orchestrationBoardWorkspacePaths(board),
      ].map((workspacePath) => normalizeWorkspacePath(workspacePath)),
    ),
  ];
}

function resetProjectRuntimeAndPluginServers(host: ProjectRuntimeHost, reason = RUNTIME_RESET_INTERRUPTED_RUN_MESSAGE): void {
  host.runtime.interruptActiveRuns(reason);
  host.runtime.resetSessions();
  void Promise.all(
    workspacePathsForProjectRuntimeHost(host).map((workspacePath) => pluginHost.shutdownPluginMcpServersForWorkspace(workspacePath)),
  ).catch((error) => {
    console.warn(`Ambient plugin MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function disposeProjectRuntimeHost(workspacePath: string, reason: string): void {
  const normalized = normalizeWorkspacePath(workspacePath);
  const host = projectRuntimeHosts.get(normalized);
  if (!host) return;
  if (activeHost === host) {
    throw new Error("Cannot dispose the active project runtime host before switching projects.");
  }
  stopAutoDispatch(reason, host);
  host.terminals.stopAll();
  host.runtime.interruptActiveRuns(reason);
  host.runtime.resetSessions();
  disposeSttRuntimeForWorkspace(normalized, reason);
  void host.browserService.shutdown().catch((error) => {
    console.warn(`Project browser shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  host.store.close();
  projectRuntimeHosts.delete(normalized);
}

function disposeAllProjectRuntimeHosts(reason: string): void {
  for (const host of projectRuntimeHostList()) {
    stopAutoDispatch(reason, host);
    host.terminals.stopAll();
    host.runtime.interruptActiveRuns(reason);
    host.runtime.resetSessions();
    disposeSttRuntimeForWorkspace(host.workspacePath, reason);
    void host.browserService.shutdown().catch((error) => {
      console.warn(`Project browser shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    host.store.close();
  }
  projectRuntimeHosts.clear();
  sttRuntimes.clear();
  activeHost = undefined;
}

async function ensureWorkflowPluginTrusted(
  thread: ThreadSummary,
  registration: PluginMcpToolRegistration,
  targetStore: ProjectStore = store,
): Promise<boolean> {
  if (targetStore.isPluginTrusted(registration.tool.pluginId, registration.launchPlan.pluginFingerprint)) return true;
  const response = await permissions.request({
    threadId: thread.id,
    toolName: registration.registeredName,
    title: `Trust Codex plugin "${registration.tool.pluginName}"?`,
    message: "Ambient wants to run a local MCP tool from this plugin in a workflow. Trusting it allows future tool calls from this plugin without another first-use prompt.",
    detail: [
      `Workspace: ${thread.workspacePath}`,
      `Plugin: ${registration.tool.pluginName}`,
      `MCP server: ${registration.tool.serverName}`,
      `Tool: ${registration.originalName}`,
      `Registered as: ${registration.registeredName}`,
    ].join("\n"),
    risk: "plugin-tool",
  });
  const allowed = response.allowed;
  if (allowed) targetStore.setPluginTrusted(registration.tool.pluginId, true, registration.launchPlan.pluginFingerprint);
  return allowed;
}

async function emitBrowserStateForHost(host: ProjectRuntimeHost): Promise<void> {
  mainWindow?.webContents.send("desktop:event", {
    type: "browser-updated",
    state: await host.browserService.getState(),
    workspacePath: host.workspacePath,
  });
}

async function emitBrowserState(): Promise<void> {
  await emitBrowserStateForHost(requireActiveProjectRuntimeHost());
}

async function withBrowserState<T>(host: ProjectRuntimeHost, operation: Promise<T>): Promise<T> {
  try {
    const result = await operation;
    await emitBrowserStateForHost(host);
    return result;
  } catch (error) {
    await emitBrowserStateForHost(host).catch(() => undefined);
    throw error;
  }
}

function recordBrowserProfileAudit(host: ProjectRuntimeHost, detail: string, reason: string): void {
  const targetStore = host.store;
  const targetThreadId = activeThreadIdForHost(host);
  const thread = targetStore.getThread(targetThreadId);
  const entry = targetStore.addPermissionAudit({
    threadId: targetThreadId,
    permissionMode: thread.permissionMode,
    toolName: "browser_profile",
    risk: "browser-profile",
    decision: "allowed",
    detail,
    reason,
  });
  emitPermissionAuditCreated(entry, host.workspacePath);
}

function recordBrowserControlAudit(host: ProjectRuntimeHost, toolName: string, detail: string, reason: string): void {
  const targetStore = host.store;
  const targetThreadId = activeThreadIdForHost(host);
  const thread = targetStore.getThread(targetThreadId);
  const entry = targetStore.addPermissionAudit({
    threadId: targetThreadId,
    permissionMode: thread.permissionMode,
    toolName,
    risk: "browser-control",
    decision: "allowed",
    detail,
    reason,
  });
  emitPermissionAuditCreated(entry, host.workspacePath);
}

function startupWorkspacePath(): string {
  return selectStartupWorkspacePath({
    explicitWorkspace: process.env.AMBIENT_DESKTOP_WORKSPACE,
    cwd: process.cwd(),
    isPackaged: app.isPackaged,
    userDataPath: app.getPath("userData"),
    registeredWorkspacePaths: projectRegistry.listRegisteredPaths().filter((workspacePath) => existsSync(workspacePath)),
    hasRestorableWorkspaceState,
  });
}

function readState(threadId = activeThreadId, options: { markActiveRead?: boolean } = {}): DesktopState {
  const markActiveRead = options.markActiveRead ?? true;
  const featureFlagSnapshot = currentFeatureFlagSnapshot(store);
  const subagentUiEnabled = isAmbientSubagentsEnabled(featureFlagSnapshot);
  let threads = store.listThreads().filter((thread) => subagentUiEnabled || thread.kind !== "subagent_child");
  let automationThreadChatIds = Array.from(new Set([...store.listAutomationThreadChatIds(), ...store.listWorkflowAgentThreadChatIds()]));
  const visibleThreads = threads.filter((thread) => !automationThreadChatIds.includes(thread.id));
  const persistedThreadId = store.getLastActiveThreadId();
  const preferredThreadId = threadId || persistedThreadId || "";
  const active = visibleThreads.some((thread) => thread.id === preferredThreadId)
    ? preferredThreadId
    : persistedThreadId && visibleThreads.some((thread) => thread.id === persistedThreadId)
      ? persistedThreadId
      : visibleThreads[0]?.id ?? threads[0]?.id;
  if (!active) throw new Error("No active thread");
  setActiveThreadId(active);
  if (markActiveRead) store.markThreadRead(active);
  threads = store.listThreads().filter((thread) => subagentUiEnabled || thread.kind !== "subagent_child");
  automationThreadChatIds = Array.from(new Set([...store.listAutomationThreadChatIds(), ...store.listWorkflowAgentThreadChatIds()]));
  const settings = store.getThread(active);
  const subagentRuns = subagentUiEnabled
    ? settings.kind === "subagent_child" && settings.subagentRunId
      ? [store.getSubagentRun(settings.subagentRunId)]
      : store.listSubagentRunsForParentThread(active)
    : [];
  const subagentRunEvents = subagentRuns.flatMap((run) => store.listSubagentRunEvents(run.id));
  const subagentMailboxEvents = subagentRuns.flatMap((run) => store.listSubagentMailboxEvents(run.id));
  const subagentToolScopeSnapshots = subagentRuns.flatMap((run) => store.listSubagentToolScopeSnapshots(run.id));
  const subagentWaitBarrierMap = new Map(
    subagentRuns
      .flatMap((run) => store.listSubagentWaitBarriersForParentRun(run.parentRunId))
      .map((barrier) => [barrier.id, barrier]),
  );
  const subagentWaitBarriers = [...subagentWaitBarrierMap.values()];
  const subagentParentMailboxEventMap = new Map(
    [
      ...(subagentUiEnabled && settings.kind !== "subagent_child"
        ? store.listSubagentParentMailboxEventsForParentThread(active)
        : []),
      ...subagentRuns.flatMap((run) => store.listSubagentParentMailboxEventsForParentRun(run.parentRunId)),
    ]
      .map((event) => [event.id, event]),
  );
  const subagentParentMailboxEvents = [...subagentParentMailboxEventMap.values()];
  const callableWorkflowTasks =
    subagentUiEnabled && settings.kind !== "subagent_child"
      ? store.listCallableWorkflowTasksForParentThread(active)
      : [];
  const childMessagesByThreadId =
    subagentUiEnabled && settings.kind !== "subagent_child"
      ? Object.fromEntries(
          Array.from(new Set(subagentRuns.map((run) => run.childThreadId).filter(Boolean))).map((childThreadId) => [
            childThreadId,
            store.listMessages(childThreadId),
          ]),
        )
      : undefined;
  const workspace = store.getWorkspace();
  const subagentMaturity = store.getSubagentMaturitySnapshot({
    createdAt: featureFlagSnapshot.generatedAt,
    featureFlags: featureFlagSnapshot,
  });
  const subagentMaturityEvidence = store.listSubagentMaturityEvidence();
  const subagentRepairDiagnostics = subagentUiEnabled
    ? store.getSubagentRepairDiagnostics({ now: featureFlagSnapshot.generatedAt })
    : undefined;
  const activeWorkspace = workspaceStateForThread(settings);
  const persistentFeatureFlags = store.getFeatureFlagSettings();
  const automationFolders = store.listAutomationFolders();
  const workflowAgentFolders = listGlobalWorkflowAgentFolders();
  const workflowRecordingLibrary = listGlobalWorkflowRecordingLibrary({ includeDisabled: true, limit: 50 });
  const projectThreads = threads.filter((thread) => !automationThreadChatIds.includes(thread.id));
  const activeProject = activeProjectSummary(workspace, projectThreads, activeProjectBoardForState(store, active));
  return {
    app: {
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      build: {
        channel: process.env.AMBIENT_RELEASE_CHANNEL || (app.isPackaged ? "release" : "development"),
        ...(process.env.AMBIENT_BUILD_COMMIT ? { commit: process.env.AMBIENT_BUILD_COMMIT } : {}),
      },
      piVersions: {
        piAi: packageVersion("@mariozechner/pi-ai"),
        piCodingAgent: packageVersion("@mariozechner/pi-coding-agent"),
      },
      update: desktopUpdateService.getState(),
      thirdPartyCredits: thirdPartyCredits(),
    },
    appearance: currentAppearance(),
    workspace,
    activeWorkspace,
    providerCatalog: providerCatalogSettingsState(),
    projects: projectRegistry.listProjects(workspace.path, activeProject),
    automationFolders,
    workflowAgentFolders,
    workflowRecordingLibrary,
    automationThreadChatIds,
    threads,
    activeThreadId: active,
    threadRunStatuses: activeThreadRunStatuses(),
    messages: store.listMessages(active),
    childMessagesByThreadId,
    messageVoiceStates: Object.fromEntries(
      store.listMessageVoiceStates(active).map((voiceState) => [voiceState.messageId, voiceState]),
    ),
    voiceSettingsAudit,
    plannerPlanArtifacts: store.listPlannerPlanArtifacts(active),
    settings: {
      permissionMode: settings.permissionMode,
      collaborationMode: settings.collaborationMode,
      model: settings.model,
      featureFlags: persistentFeatureFlags,
      memory: store.getMemorySettings(),
      thinkingLevel: settings.thinkingLevel,
      thinkingDisplay: thinkingDisplaySettings,
      modelRuntime: store.getModelRuntimeSettings(),
      modelCatalog: currentModelRuntimeCatalog(featureFlagSnapshot.generatedAt),
      compaction: store.getCompactionSettings(),
      media: mediaPlaybackSettings,
      planner: plannerSettings,
      search: searchRoutingSettings,
      localDeepResearch: localDeepResearchSettings,
      voice: voiceSettings,
      stt: sttSettings,
    },
    featureFlagSnapshot,
    subagentMaturity,
    subagentMaturityEvidence,
    subagentRuns,
    subagentRunEvents,
    subagentMailboxEvents,
    subagentToolScopeSnapshots,
    subagentWaitBarriers,
    subagentParentMailboxEvents,
    callableWorkflowTasks,
    subagentRepairDiagnostics,
    provider: getAmbientProviderStatus(settings.model),
    queue: emptyQueueState(active),
    sttQueue: currentSttQueueState(workspace.path),
    sttDiagnostics: sttDiagnostics.list(workspace.path),
    contextUsage: store.getLatestContextUsageSnapshot(active),
    activeThreadGoal: store.getThreadGoal(active),
  };
}

function emitDesktopState(options: { markActiveRead?: boolean } = { markActiveRead: false }): void {
  mainWindow?.webContents.send("desktop:event", { type: "state", state: readState(activeThreadId, options) });
}

type WorkflowDesktopEvent = Extract<
  DesktopEvent,
  {
    type:
      | "workflow-updated"
      | "workflow-run-started"
      | "workflow-discovery-progress"
      | "workflow-exploration-progress"
      | "workflow-compile-progress";
  }
>;

function emitWorkflowEvent(event: WorkflowDesktopEvent, workspacePath = activeWorkspacePath()): void {
  mainWindow?.webContents.send("desktop:event", { ...event, workspacePath } as DesktopEvent);
}

function emitWorkflowUpdated(workspacePath = activeWorkspacePath()): void {
  emitWorkflowEvent({ type: "workflow-updated" }, workspacePath);
}

function emitOrchestrationUpdated(workspacePath = activeWorkspacePath()): void {
  mainWindow?.webContents.send("desktop:event", { type: "orchestration-updated", workspacePath } satisfies DesktopEvent);
}

function emitPluginCatalogUpdated(workspacePath = activeWorkspacePath()): void {
  mainWindow?.webContents.send("desktop:event", { type: "plugin-catalog-updated", workspacePath } satisfies DesktopEvent);
}

function emitThreadUpdated(thread: ThreadSummary): void {
  mainWindow?.webContents.send("desktop:event", { type: "thread-updated", thread, workspacePath: thread.workspacePath } satisfies DesktopEvent);
}

function permissionAuditWorkspacePath(entry: PermissionAuditEntry, targetStore: ProjectStore = store): string {
  try {
    return targetStore.getThread(entry.threadId).workspacePath;
  } catch {
    return targetStore.getWorkspace().path;
  }
}

function permissionGrantWorkspacePath(grant: AmbientPermissionGrant, targetStore: ProjectStore = store): string {
  if (grant.projectPath) return grant.projectPath;
  if (grant.workspacePath) return grant.workspacePath;
  if (grant.threadId) {
    try {
      return targetStore.getThread(grant.threadId).workspacePath;
    } catch {
      return targetStore.getWorkspace().path;
    }
  }
  if (grant.workflowThreadId) {
    try {
      return targetStore.getWorkflowAgentThreadSummary(grant.workflowThreadId).projectPath || targetStore.getWorkspace().path;
    } catch {
      return targetStore.getWorkspace().path;
    }
  }
  return targetStore.getWorkspace().path;
}

function emitPermissionAuditCreated(entry: PermissionAuditEntry, workspacePath = permissionAuditWorkspacePath(entry)): void {
  mainWindow?.webContents.send("desktop:event", { type: "permission-audit-created", entry, workspacePath } satisfies DesktopEvent);
}

function emitPermissionGrantCreated(grant: AmbientPermissionGrant, workspacePath = permissionGrantWorkspacePath(grant)): void {
  mainWindow?.webContents.send("desktop:event", {
    type: "permission-grant-created",
    grant,
    workspacePath,
  } satisfies DesktopEvent);
}

function emitPermissionGrantRevoked(grant: AmbientPermissionGrant, workspacePath = permissionGrantWorkspacePath(grant)): void {
  mainWindow?.webContents.send("desktop:event", {
    type: "permission-grant-revoked",
    grant,
    workspacePath,
  } satisfies DesktopEvent);
}

function plannerPlanArtifactWorkspacePath(artifact: PlannerPlanArtifact, targetStore: ProjectStore = store): string {
  try {
    return targetStore.getThread(artifact.threadId).workspacePath;
  } catch {
    return targetStore.getWorkspace().path;
  }
}

function emitPlannerPlanArtifactUpdated(artifact: PlannerPlanArtifact, targetStore: ProjectStore = store): void {
  mainWindow?.webContents.send("desktop:event", {
    type: "planner-plan-artifact-updated",
    artifact,
    workspacePath: plannerPlanArtifactWorkspacePath(artifact, targetStore),
  } satisfies DesktopEvent);
}

type ProjectBoardRunProgressPatch = {
  stage?: ProjectBoardSynthesisRunStage;
  model?: string;
  sourceCount?: number;
  includedSourceCount?: number;
  sourceCharCount?: number;
  promptCharCount?: number;
  responseCharCount?: number;
  cardCount?: number;
  questionCount?: number;
  warningCount?: number;
};

const PROJECT_BOARD_RUN_PROGRESS_EMIT_INTERVAL_MS = 2_000;

function emitProjectBoardState(targetStore: ProjectStore = store, host?: ProjectRuntimeHost): void {
  if (host) {
    emitProjectStateIfActive(host);
    return;
  }
  if (targetStore === store) emitDesktopState();
}

function createProjectBoardRunProgressEmitter(
  runId: string,
  options: { intervalMs?: number; targetStore?: ProjectStore; host?: ProjectRuntimeHost } = {},
) {
  let latest: ProjectBoardRunProgressPatch | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const targetStore = options.targetStore ?? store;
  const intervalMs = options.intervalMs ?? PROJECT_BOARD_RUN_PROGRESS_EMIT_INTERVAL_MS;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!latest) return;
    const progress = latest;
    latest = undefined;
    try {
      const updated = targetStore.tryUpdateProjectBoardSynthesisRunProgress(runId, progress);
      if (!updated) {
        console.warn(`Ignored project-board synthesis progress for missing run: ${runId}`);
        return;
      }
      emitProjectBoardState(targetStore, options.host);
    } catch (error) {
      console.warn("Ignored project-board synthesis progress flush failure", error);
    }
  };

  return {
    update(progress: ProjectBoardRunProgressPatch) {
      latest = mergeDefinedProjectBoardRunProgress(latest, progress);
      if (timer) return;
      timer = setTimeout(flush, intervalMs);
    },
    flush,
  };
}

function mergeDefinedProjectBoardRunProgress(
  current: ProjectBoardRunProgressPatch | undefined,
  nextProgress: ProjectBoardRunProgressPatch,
): ProjectBoardRunProgressPatch {
  const next = { ...current };
  if (nextProgress.stage !== undefined) next.stage = nextProgress.stage;
  if (nextProgress.model !== undefined) next.model = nextProgress.model;
  if (nextProgress.sourceCount !== undefined) next.sourceCount = nextProgress.sourceCount;
  if (nextProgress.includedSourceCount !== undefined) next.includedSourceCount = nextProgress.includedSourceCount;
  if (nextProgress.sourceCharCount !== undefined) next.sourceCharCount = nextProgress.sourceCharCount;
  if (nextProgress.promptCharCount !== undefined) next.promptCharCount = nextProgress.promptCharCount;
  if (nextProgress.responseCharCount !== undefined) next.responseCharCount = nextProgress.responseCharCount;
  if (nextProgress.cardCount !== undefined) next.cardCount = nextProgress.cardCount;
  if (nextProgress.questionCount !== undefined) next.questionCount = nextProgress.questionCount;
  if (nextProgress.warningCount !== undefined) next.warningCount = nextProgress.warningCount;
  return next;
}

function activeThreadRunStatuses(): Record<string, RunStatus> {
  return Object.fromEntries(
    store
      .listActiveRuns()
      .filter((run) => run.status === "starting" || run.status === "streaming" || run.status === "tool")
      .map((run) => [run.threadId, run.status as RunStatus]),
  );
}

function packageVersion(name: string): string {
  const dependencies = (packageJson as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> });
  return dependencies.dependencies?.[name] ?? dependencies.devDependencies?.[name] ?? "unknown";
}

const MIT_PERMISSION_NOTICE =
  "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files " +
  '(the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, ' +
  "distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, " +
  "subject to the following conditions:\n\n" +
  "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.";

const MIT_WARRANTY_NOTICE =
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF ' +
  "MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY " +
  "CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE " +
  "SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.";

function mitLicenseText(copyrightNotice: string): string {
  return ["MIT License", copyrightNotice, MIT_PERMISSION_NOTICE, MIT_WARRANTY_NOTICE].join("\n\n");
}

const APACHE_2_LICENSE_TEXT = [
  "Apache License",
  "Version 2.0, January 2004",
  "https://www.apache.org/licenses/",
  "",
  "Licensed under the Apache License, Version 2.0 (the \"License\"); you may not use this file except in compliance with the License.",
  "You may obtain a copy of the License at https://www.apache.org/licenses/LICENSE-2.0",
  "Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.",
  "See the License for the specific language governing permissions and limitations under the License.",
].join("\n");

function thirdPartyCredits(): AppThirdPartyCredit[] {
  const piCopyrightNotice = "Copyright (c) 2025 Mario Zechner";
  const lambdaRlmCopyrightNotice = "Copyright (c) 2026 Lambda-RLM Contributors";
  const toolHiveCopyrightNotice = "Copyright ToolHive contributors";
  const tencentMemoryCopyrightNotice = "Copyright (C) 2026 Tencent. All rights reserved.";

  return [
    {
      name: "Pi Agent",
      license: "MIT",
      repository: "https://github.com/earendil-works/pi",
      licenseUrl: "https://github.com/earendil-works/pi/blob/main/LICENSE",
      authors: "Mario Zechner and Pi contributors",
      copyrightNotice: piCopyrightNotice,
      licenseText: mitLicenseText(piCopyrightNotice),
      description: "Ambient integrates Pi's coding agent and LLM abstraction packages.",
      notice: "Published packages currently include @mariozechner/pi-ai and @mariozechner/pi-coding-agent.",
    },
    {
      name: "Lambda-RLM",
      license: "MIT",
      repository: LAMBDA_RLM_SOURCE_REPOSITORY,
      paper: LAMBDA_RLM_SOURCE_PAPER,
      licenseUrl: `${LAMBDA_RLM_SOURCE_REPOSITORY}/blob/main/LICENSE`,
      authors: "Lambda-RLM Contributors; Amartya Roy, Rasul Tutunov, Xiaotong Ji, Matthieu Zimmer, Haitham Bou-Ammar",
      copyrightNotice: lambdaRlmCopyrightNotice,
      licenseText: mitLicenseText(lambdaRlmCopyrightNotice),
      description: "TypeScript port/adaptation of the Lambda-RLM long-context reasoning runtime.",
      notice: `Adapted from lambda-calculus-LLM/lambda-RLM at commit ${LAMBDA_RLM_SOURCE_COMMIT}.`,
    },
    {
      name: "TencentDB Agent Memory",
      license: "MIT",
      repository: "https://github.com/TencentCloud/TencentDB-Agent-Memory",
      licenseUrl: "https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/LICENSE",
      authors: "TencentDB Agent Memory Team and TencentDB Agent Memory contributors",
      copyrightNotice: tencentMemoryCopyrightNotice,
      licenseText: mitLicenseText(tencentMemoryCopyrightNotice),
      description: "Ambient adapts TencentDB Agent Memory for the experimental local agent memory system.",
      notice:
        "Reviewed vendor subtree under vendor/tencentdb-agent-memory, pinned from TencentCloud/TencentDB-Agent-Memory at commit a21ef3f66aebd549dcccc63084c572231b62d245 with Ambient package-boundary patches documented in AMBIENT_PATCHES.md.",
    },
    {
      name: "ToolHive",
      license: "Apache-2.0",
      repository: "https://github.com/stacklok/toolhive",
      licenseUrl: "https://github.com/stacklok/toolhive/blob/main/LICENSE",
      authors: "ToolHive contributors",
      copyrightNotice: toolHiveCopyrightNotice,
      licenseText: APACHE_2_LICENSE_TEXT,
      description: "Ambient bundles ToolHive's thv runtime binary for MCP server containment and lifecycle management.",
      notice: "Bundled under resources/toolhive with license and notice files under resources/third-party-notices/toolhive.",
    },
  ];
}

function thirdPartyCreditAboutText(credit: AppThirdPartyCredit): string {
  return [
    credit.name,
    credit.description,
    credit.authors ? `Authors: ${credit.authors}` : undefined,
    credit.copyrightNotice,
    `License: ${credit.license}`,
    credit.repository ? `Repository: ${credit.repository}` : undefined,
    credit.paper ? `Paper: ${credit.paper}` : undefined,
    credit.licenseUrl ? `License URL: ${credit.licenseUrl}` : undefined,
    credit.notice,
    credit.licenseText ? `\n${credit.licenseText}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function workspaceStateForThread(thread = store.getThread(activeThreadId), targetStore: ProjectStore = store) {
  const workspace = targetStore.getWorkspace();
  return {
    path: thread.workspacePath,
    name: thread.workspacePath === workspace.path ? workspace.name : `${workspace.name} worktree`,
    statePath: workspace.statePath,
    sessionPath: workspace.sessionPath,
  };
}

function threadActionWorkspacePath(input: ThreadActionInput, fallbackHost: ProjectRuntimeHost): string {
  if (!input.projectId) return fallbackHost.workspacePath;
  return normalizeWorkspacePath(resolveRegisteredProjectPathForHost(input.projectId, fallbackHost));
}

function requireProjectRuntimeHostForThreadAction(input: ThreadActionInput, fallbackHost: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): ProjectRuntimeHost {
  const host = projectRuntimeHostForThread(input.threadId) ?? ensureProjectRuntimeHostForWorkspacePath(threadActionWorkspacePath(input, fallbackHost));
  host.store.getThread(input.threadId);
  return host;
}

function threadWorkingDirectory(thread: ThreadSummary): string {
  return thread.gitWorktree?.status === "active" ? thread.gitWorktree.worktreePath : thread.workspacePath;
}

function activeWorkspacePath(): string {
  return store.getThread(activeThreadId).workspacePath;
}

function activeWorkspaceFileContextForProjectHost(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()) {
  const threadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(threadId);
  return {
    host,
    targetStore: host.store,
    threadId,
    thread,
    workspacePath: thread.workspacePath,
  };
}

function workspacePathForRelativeArtifactPath(relativePath: string, targetStore: ProjectStore = store, fallbackWorkspacePath = activeWorkspacePath()): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith(".ambient/board/plans/")) return targetStore.getProjectArtifactWorkspacePath();
  return fallbackWorkspacePath;
}

function readActiveWorkspaceFile(requestedPath: string, context = activeWorkspaceFileContextForProjectHost()): Promise<WorkspaceFileContent> {
  const normalizedPath = workspacePathSchema.parse(requestedPath);
  return readWorkspaceFile(workspacePathForRelativeArtifactPath(normalizedPath, context.targetStore, context.workspacePath), normalizedPath, {
    createMediaUrl: (input) => workspaceMediaServer.createUrl(input),
    createOfficePreview: (input) => createOfficePreview(input),
  });
}

function readActiveLocalFilePreview(requestedPath: string, workspacePath = activeWorkspaceFileContextForProjectHost().workspacePath): Promise<WorkspaceFileContent> {
  const absolutePath = resolveLocalPreviewPath(requestedPath, workspacePath);
  return readLocalPreviewFile(workspacePath, absolutePath, {
    createMediaUrl: (input) => workspaceMediaServer.createUrl(input),
    createOfficePreview: (input) => createOfficePreview(input),
  });
}

function resolveLocalFilePath(requestedPath: string): string {
  const path = requestedPath.trim();
  if (!path) throw new Error("Local file path is required.");
  let candidate = path;
  if (candidate.startsWith("file:")) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "file:") throw new Error("Only file URLs can be opened as local files.");
      candidate = decodeURIComponent(parsed.pathname);
    } catch (error) {
      throw new Error(`Invalid local file URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (candidate === "~") candidate = app.getPath("home");
  else if (candidate.startsWith("~/") || candidate.startsWith("~\\")) candidate = join(app.getPath("home"), candidate.slice(2));
  if (!candidate.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(candidate)) {
    throw new Error("Local file path must be absolute or start with ~/.");
  }
  const absolutePath = normalizeWorkspacePath(candidate);
  if (!existsSync(absolutePath)) throw new Error(`Local file does not exist: ${path}`);
  return absolutePath;
}

function resolveLocalPreviewPath(requestedPath: string, workspacePath = activeWorkspacePath()): string {
  const absolutePath = resolveLocalFilePath(localPathSchema.parse(requestedPath));
  assertLocalPreviewAllowed(absolutePath, workspacePath);
  return absolutePath;
}

function assertLocalPreviewAllowed(absolutePath: string, workspacePath = activeWorkspacePath()): void {
  const resolvedPath = resolve(absolutePath);
  const roots = [workspacePath, safeAppPath("downloads"), safeAppPath("desktop"), safeAppPath("documents")]
    .filter((root): root is string => Boolean(root))
    .map((root) => resolve(root));
  if (roots.some((root) => resolvedPath === root || isPathInside(root, resolvedPath))) return;
  throw new Error("Local file preview is limited to the current workspace, Downloads, Desktop, and Documents.");
}

function safeAppPath(name: "downloads" | "desktop" | "documents"): string | undefined {
  try {
    return app.getPath(name);
  } catch {
    return undefined;
  }
}

async function createOfficePreview(input: {
  workspacePath: string;
  absolutePath: string;
  relativePath: string;
  mimeType?: string;
  size: number;
  mtimeMs?: number;
}): Promise<OfficePreview | undefined> {
  const result = await officePreviewService?.renderPreview(input.absolutePath);
  if (!result) return undefined;
  const preview = publicOfficePreview(result);
  if (result.status !== "available" || !result.pdfPath) return preview;

  const pdfStat =
    result.pdfBytes !== undefined && result.pdfMtimeMs !== undefined
      ? { size: result.pdfBytes, mtimeMs: result.pdfMtimeMs }
      : await stat(result.pdfPath);
  return {
    ...preview,
    pdfUrl: workspaceMediaServer.createUrl({
      workspacePath: input.workspacePath,
      absolutePath: result.pdfPath,
      relativePath: `.ambient-office-preview/${result.cacheKey ?? "preview"}.pdf`,
      mimeType: "application/pdf",
      size: pdfStat.size,
      mtimeMs: pdfStat.mtimeMs,
      allowExternal: true,
    }),
  };
}

function publicOfficePreview(result: OfficePreviewRenderResult): OfficePreview {
  const { pdfPath: _pdfPath, pdfBytes: _pdfBytes, pdfMtimeMs: _pdfMtimeMs, ...preview } = result;
  return preview;
}

function selectAmbientCliPackageForSecret(
  packages: AmbientCliPackageSummary[],
  selector: { packageId?: string; packageName?: string },
): AmbientCliPackageSummary {
  if (selector.packageId) {
    const pkg = packages.find((candidate) => candidate.id === selector.packageId);
    if (!pkg) throw new Error(`Ambient CLI package "${selector.packageId}" was not found.`);
    return pkg;
  }
  if (selector.packageName) {
    const matches = packages.filter((candidate) => candidate.name === selector.packageName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Ambient CLI package name "${selector.packageName}" matched multiple packages. Specify packageId.`);
    throw new Error(`Ambient CLI package "${selector.packageName}" was not found.`);
  }
  throw new Error("packageId or packageName is required.");
}

async function requestPermissionWithGrantRegistry(
  request: Omit<PermissionRequest, "id">,
  input: {
    thread?: ThreadSummary;
    permissionMode?: "full-access" | "workspace";
    workspacePath?: string;
    workflowThreadId?: string;
    store?: ProjectStore;
    requireFreshPrompt?: boolean;
  } = {},
) {
  const targetStore = input.store ?? store;
  const host = projectRuntimeHostForStore(targetStore);
  const fallbackThreadId = host ? activeThreadIdForHost(host) : targetStore === store ? activeThreadId : initialActiveThreadIdForStore(targetStore);
  const thread = input.thread ?? targetStore.getThread(request.threadId || fallbackThreadId);
  const resolution = await resolvePermissionWithGrants({
    store: targetStore,
    requester: permissions,
    request,
    context: {
      permissionMode: input.permissionMode ?? thread.permissionMode,
      threadId: request.threadId || thread.id,
      workflowThreadId: request.workflowThreadId ?? input.workflowThreadId,
      projectPath: targetStore.getWorkspace().path,
      workspacePath: request.workspacePath ?? input.workspacePath ?? thread.workspacePath,
    },
    requireFreshPrompt: input.requireFreshPrompt,
  });
  if (resolution.grant && resolution.decisionSource !== "persistent_grant") {
    mainWindow?.webContents.send("desktop:event", {
      type: "permission-grant-created",
      grant: resolution.grant,
      workspacePath: targetStore.getWorkspace().path,
    });
  }
  return resolution;
}

function searchWorkspace(raw: WorkspaceSearchInput | string) {
  const parsed = workspaceSearchSchema.parse(raw);
  const input: WorkspaceSearchInput = typeof parsed === "string" ? { query: parsed, scope: "project" } : parsed;
  const scope = input.scope ?? "project";
  const limit = input.limit ?? 50;
  const host = scope !== "all-projects" && input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost();
  const targetStore = host.store;
  if (scope === "all-projects") {
    const activeProject = activeProjectSummary(
      targetStore.getWorkspace(),
      targetStore.listThreads(),
      activeProjectBoardForState(targetStore, activeProjectBoardThreadIdForStore(targetStore)),
    );
    const projects = projectRegistry.listProjects(targetStore.getWorkspace().path, activeProject);
    const perProjectLimit = Math.max(5, Math.ceil(limit / Math.max(projects.length, 1)));
    return projects
      .flatMap((project) => readProjectSearchResults(project.path, input.query, perProjectLimit))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  return targetStore.searchWorkspace(input.query, {
    scope,
    threadId: input.threadId ?? activeThreadIdForHost(host),
    limit,
    projectName: targetStore.getWorkspace().name,
    workspacePath: targetStore.getWorkspace().path,
  });
}

async function prepareWorktreeForThread(thread = store.getThread(activeThreadId), targetStore: ProjectStore = store) {
  const worktree = await prepareThreadWorktree(targetStore.getWorkspace().path, thread);
  if (!worktree) return thread;
  targetStore.setThreadWorktree(worktree);
  if (worktree.status === "active") {
    return targetStore.updateThreadWorkspacePath(thread.id, worktree.worktreePath);
  }
  return targetStore.getThread(thread.id);
}

async function attachWorktreeForThread(worktreePath: string, thread = store.getThread(activeThreadId), targetStore: ProjectStore = store) {
  const worktree = await attachExistingThreadWorktree(targetStore.getWorkspace().path, worktreePath, thread);
  targetStore.setThreadWorktree(worktree);
  return targetStore.updateThreadWorkspacePath(thread.id, worktree.worktreePath);
}

async function createAndRecordCheckpoint(
  kind: Parameters<typeof createGitCheckpoint>[0]["kind"],
  reason: string,
  thread = store.getThread(activeThreadId),
  targetStore: ProjectStore = store,
) {
  const review = await getWorkspaceGitStatus(thread.workspacePath);
  if (!review.isGitRepository) return undefined;
  const checkpoint = await createGitCheckpoint({
    workspacePath: thread.workspacePath,
    statePath: targetStore.getWorkspace().statePath,
    threadId: thread.id,
    branchName: review.branch,
    kind,
    reason,
  });
  if (checkpoint) targetStore.updateThreadWorktreeCheckpoint(thread.id, checkpoint.id);
  return checkpoint;
}

function activeGitContextForProjectHost(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()) {
  const threadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(threadId);
  return {
    host,
    targetStore: host.store,
    threadId,
    thread,
    workspacePath: thread.workspacePath,
  };
}

async function readGitReviewForProjectHost(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost(), threadId = activeThreadIdForHost(host)): Promise<GitReviewSummary> {
  const thread = host.store.getThread(threadId);
  return getGitReview({
    workspacePath: thread.workspacePath,
    projectRoot: host.store.getWorkspace().path,
    worktree: thread.gitWorktree,
    latestCheckpoint: await latestGitCheckpoint(host.store.getWorkspace().statePath, thread.id),
  });
}

function activeProjectSummary(
  workspace: ReturnType<ProjectStore["getWorkspace"]>,
  threads: ProjectSummary["threads"],
  board?: ProjectSummary["board"],
): ProjectSummary {
  const timestamps = threads.flatMap((thread) => [thread.createdAt, thread.updatedAt]).filter(Boolean);
  const fallbackTime = new Date(0).toISOString();
  return {
    id: projectIdFromWorkspacePath(workspace.path),
    ...workspace,
    createdAt: timestamps.length ? timestamps.reduce((earliest, item) => (item < earliest ? item : earliest)) : fallbackTime,
    updatedAt: timestamps.length ? timestamps.reduce((latest, item) => (item > latest ? item : latest)) : fallbackTime,
    board,
    threads,
  };
}

function resolveRegisteredProjectPath(projectId: string): string {
  return projectRegistry.resolveProjectId(projectId, store.getWorkspace().path);
}

function resolveRegisteredProjectPathForHost(projectId: string, host: ProjectRuntimeHost): string {
  return projectRegistry.resolveProjectId(projectId, host.workspacePath);
}

function listRuntimeProjects(targetStore: ProjectStore = store): ProjectSummary[] {
  const workspace = targetStore.getWorkspace();
  const hiddenThreadIds = new Set([...targetStore.listAutomationThreadChatIds(), ...targetStore.listWorkflowAgentThreadChatIds()]);
  const projectThreads = targetStore.listThreads().filter((thread) => !hiddenThreadIds.has(thread.id));
  const activeProject = activeProjectSummary(workspace, projectThreads, activeProjectBoardForState(targetStore, activeProjectBoardThreadIdForStore(targetStore)));
  return projectRegistry.listProjects(workspace.path, activeProject);
}

function createProjectWorkspaceForRuntime(input: { name?: string; workspacePath?: string; reason: string }, targetStore: ProjectStore = store): ProjectSummary {
  const workspacePath = resolveHeadlessProjectWorkspacePath(input, targetStore.getWorkspace().path);
  mkdirSync(workspacePath, { recursive: true });
  const projectStore = new ProjectStore();
  let summary: ProjectSummary;
  try {
    const workspace = projectStore.openWorkspace(workspacePath);
    summary = activeProjectSummary(workspace, projectStore.listThreads(), projectStore.getActiveProjectBoard(initialActiveThreadIdForStore(projectStore)));
  } finally {
    projectStore.close();
  }
  projectRegistry.register(workspacePath);
  if (input.name?.trim()) projectRegistry.setDisplayName(workspacePath, input.name.trim());
  return listRuntimeProjects(targetStore).find((project) => project.path === workspacePath) ?? summary;
}

function switchProjectWorkspaceForRuntime(input: { workspacePath: string; reason: string }): void {
  const state = switchWorkspace(input.workspacePath);
  mainWindow?.webContents.send("desktop:event", { type: "state", state });
}

function resolveHeadlessProjectWorkspacePath(input: { name?: string; workspacePath?: string }, baseWorkspacePath = store.getWorkspace().path): string {
  const requestedPath = input.workspacePath?.trim();
  if (requestedPath) {
    if (requestedPath.startsWith("~/")) return normalizeWorkspacePath(join(app.getPath("home"), requestedPath.slice(2)));
    if (requestedPath.startsWith(".")) return normalizeWorkspacePath(resolve(dirname(baseWorkspacePath), requestedPath));
    return normalizeWorkspacePath(requestedPath);
  }
  const rawName = input.name?.trim() || "New Ambient Project";
  const directoryName = rawName.replace(/[/:\\]/g, "-").replace(/\s+/g, " ").trim() || "New Ambient Project";
  return normalizeWorkspacePath(join(dirname(baseWorkspacePath), directoryName));
}

async function scanSourcesForProjectBoard(
  boardId: string,
  targetStore: ProjectStore = store,
): Promise<Awaited<ReturnType<typeof scanProjectBoardSources>>> {
  const board = targetStore.getProjectBoard(boardId);
  return scanProjectBoardSources(targetStore, { workspacePath: board?.projectPath ?? targetStore.getWorkspace().path, threadId: board?.sourceThreadId });
}

async function refreshProjectBoardSources(
  boardId: string,
  options: { synthesize?: boolean; runId?: string; model?: string; targetStore?: ProjectStore; host?: ProjectRuntimeHost } = {},
): Promise<void> {
  const targetStore = options.targetStore ?? store;
  const sources = await scanSourcesForProjectBoard(boardId, targetStore);
  const sourceTelemetry = projectBoardSourceTelemetry(sources);
  if (options.runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
      stage: "source_scan",
      title: "Scanned project sources",
      summary: `Scanned ${sourceTelemetry.sourceCount} source${sourceTelemetry.sourceCount === 1 ? "" : "s"} and kept ${sourceTelemetry.includedSourceCount} for the board source snapshot.`,
      metadata: { ...sourceTelemetry, sourceRefreshOnly: true },
      ...sourceTelemetry,
    });
    emitProjectBoardState(targetStore, options.host);
  }
  const replacedSources = targetStore.replaceProjectBoardSources(boardId, sources);
  if (options.runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
      stage: "sources_persisted",
      title: "Persisted source snapshot",
      summary: `Saved ${replacedSources.length} source record${replacedSources.length === 1 ? "" : "s"} before source classification.`,
      metadata: { persistedSourceCount: replacedSources.length, sourceRefreshOnly: true },
    });
    emitProjectBoardState(targetStore, options.host);
  }
  const persistedSources = await classifyProjectBoardSourcesWithPi(boardId, replacedSources, {
    model: options.model,
    runId: options.runId,
    targetStore,
    host: options.host,
  });
  if (options.synthesize) {
    targetStore.applyProjectBoardSynthesis(boardId, synthesizeProjectBoardDraft(persistedSources));
    await refreshProjectBoardCharterSummaryWithPi(boardId, persistedSources, {
      model: options.model,
      runId: options.runId,
      force: true,
      targetStore,
      host: options.host,
    });
  } else if (targetStore.getProjectBoard(boardId)?.charter?.status === "active") {
    await refreshProjectBoardCharterSummaryWithPi(boardId, persistedSources, {
      model: options.model,
      runId: options.runId,
      targetStore,
      host: options.host,
    });
  } else if (options.runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
      stage: "charter_summary",
      title: "Deferred charter project summary",
      summary:
        "Source refresh completed while the kickoff charter is still a draft. The Pi charter summary will refresh after kickoff answers finalize the active charter.",
      metadata: { sourceRefreshOnly: true, deferredUntilActiveCharter: true },
    });
    emitProjectBoardState(targetStore, options.host);
  }
}

async function refreshProjectBoardSourcesForProjectHost(
  host: ProjectRuntimeHost,
  input: RefreshProjectBoardSourcesInput,
): Promise<DesktopState> {
  const targetStore = host.store;
  const model = targetStore.getDefaultSettings().model;
  const prepared = prepareProjectBoardSynthesisRun({
    boardId: input.boardId,
    model,
    intent: "source refresh",
  }, targetStore, host);
  if (prepared.reused) {
    return readStateForProjectHostAction(host);
  }
  emitProjectStateIfActive(host);
  try {
    await refreshProjectBoardSources(input.boardId, { runId: prepared.run.id, model, targetStore, host });
    targetStore.recordProjectBoardSynthesisRunEvent(prepared.run.id, {
      stage: "sources_persisted",
      title: "Project sources refreshed",
      summary: "The project board source snapshot is current. New or changed sources are ready for PM review and card elaboration.",
      metadata: { sourceRefreshOnly: true },
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    emitProjectStateIfActive(host);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.recordProjectBoardSynthesisRunEvent(prepared.run.id, {
      stage: "failed",
      title: "Source refresh failed",
      summary: message,
      metadata: { sourceRefreshOnly: true, error: message },
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    emitProjectStateIfActive(host);
    throw error;
  }
  return readStateForProjectHostAction(host);
}

async function classifyProjectBoardSourcesWithPi(
  boardId: string,
  sources: ProjectBoardSource[],
  options: { model?: string; runId?: string; targetStore?: ProjectStore; host?: ProjectRuntimeHost } = {},
): Promise<ProjectBoardSource[]> {
  const targetStore = options.targetStore ?? store;
  const candidates = sources.filter(
    (source) =>
      source.classifiedBy !== "user" &&
      !projectBoardSourceDeterministicAuthorityLocked(source) &&
      (source.changeState === "new" || source.changeState === "changed" || !source.classifiedBy),
  );
  if (candidates.length === 0) {
    if (options.runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
        stage: "source_classification",
        title: "Source classification already current",
        summary: "No new or changed non-user sources needed Pi classification.",
        metadata: { candidateCount: 0 },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return sources;
  }

  const model = options.model ?? targetStore.getDefaultSettings().model;
  const runId = options.runId;
  const progressEmitter = runId ? createProjectBoardRunProgressEmitter(runId, { targetStore, host: options.host }) : undefined;
  if (runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(runId, {
      stage: "source_classification",
      title: "Asked Ambient/Pi to classify sources",
      summary: `Sending ${candidates.length} new or changed source${candidates.length === 1 ? "" : "s"} to Ambient/Pi for source-role classification.`,
      metadata: { sourceCount: candidates.length, model },
    });
    emitProjectBoardState(targetStore, options.host);
  }

  try {
    const result = await new AmbientProjectBoardSourceClassifierProvider({
      model,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).classifyBatched({
      sources: candidates,
      projectName: targetStore.getWorkspace().name,
      onProgress: runId
        ? (progress) => {
            if (
              recordProjectBoardDirectHelperRetryActivity({
                store: targetStore,
                runId,
                stage: "source_classification",
                title: "Retrying Pi source classification",
                helperLabel: "source classification",
                progress,
                flushProgress: () => progressEmitter?.flush(),
              })
            ) {
              emitProjectBoardState(targetStore, options.host);
              return;
            }
            progressEmitter?.update({
              stage: "source_classification",
              responseCharCount: progress.responseCharCount,
            });
          }
        : undefined,
    });
    progressEmitter?.flush();
    const classifiedSources =
      result.classifications.length > 0
        ? targetStore.applyProjectBoardSourceClassifications(
            boardId,
            result.classifications.map((classification) => ({
              sourceId: classification.sourceId,
              sourceKey: classification.sourceKey,
              kind: classification.effectiveKind,
              classificationReason: classification.classificationReason,
              classificationConfidence: classification.classificationConfidence,
              authorityRole: classification.authorityRole,
              includeInSynthesis: classification.includeInSynthesis,
              model,
            })),
        )
        : sources;
    if (runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(runId, {
        stage: "source_classification",
        title: result.classifications.length > 0 ? "Applied Pi source classifications" : "Pi source classification unavailable",
        summary: projectBoardSourceClassificationSummary(result),
        metadata: { ...result.telemetry, failures: result.failures, fallbackSourceIds: result.fallbackSourceIds },
        promptCharCount: result.telemetry.promptCharCount,
        responseCharCount: result.telemetry.responseCharCount,
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return classifiedSources;
  } catch (error) {
    progressEmitter?.flush();
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(runId, {
        stage: "source_classification",
        title: "Pi source classification unavailable",
        summary: `Using fallback source classifications because Ambient/Pi classification failed: ${message}`,
        metadata: { error: message, candidateCount: candidates.length, fallback: true },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return sources;
  }
}

function projectBoardSourceClassificationSummary(result: AmbientProjectBoardSourceBatchedClassificationResult): string {
  const piCount = result.classifications.length;
  const fallbackCount = result.fallbackSourceIds.length;
  const piPart = `${piCount} project source${piCount === 1 ? "" : "s"}`;
  if (fallbackCount === 0) {
    return `Ambient/Pi classified ${piPart} before synthesis.`;
  }
  const failedAttempts = result.failures.length;
  const failedAttemptPart =
    failedAttempts > 0
      ? ` after ${failedAttempts} failed classification batch attempt${failedAttempts === 1 ? "" : "s"}`
      : "";
  if (piCount === 0) {
    return `Using fallback source classifications for ${fallbackCount} project source${fallbackCount === 1 ? "" : "s"}${failedAttemptPart}.`;
  }
  return `Ambient/Pi classified ${piPart}; ${fallbackCount} project source${fallbackCount === 1 ? "" : "s"} kept fallback classification${failedAttemptPart}.`;
}

async function refreshProjectBoardCharterSummaryWithPi(
  boardId: string,
  sources: ProjectBoardSource[],
  options: { model?: string; runId?: string; force?: boolean; signal?: AbortSignal; targetStore?: ProjectStore; host?: ProjectRuntimeHost } = {},
): Promise<ProjectBoardCharterProjectSummary | undefined> {
  const targetStore = options.targetStore ?? store;
  const board = targetStore.getProjectBoard(boardId);
  if (!board?.charter) return undefined;
  const generatedAt = new Date().toISOString();
  const fallbackSummary = targetStore.buildActiveProjectBoardCharterProjectSummary(boardId, generatedAt);
  const currentSummary = board.charter.projectSummary;
  if (!options.force && projectBoardCharterSummaryIsFresh(currentSummary, fallbackSummary) && currentSummary?.generator === "ambient_rlm") {
    if (options.runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
        stage: "charter_summary",
        title: "Charter project summary already current",
        summary: "The active charter project summary already matches the current source and answer checksums.",
        metadata: {
          generator: currentSummary.generator,
          sourceChecksumCount: currentSummary.sourceChecksumSet.length,
          charterAnswerChecksum: currentSummary.charterAnswerChecksum,
          cached: true,
        },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return currentSummary;
  }

  const model = options.model ?? targetStore.getDefaultSettings().model;
  const runId = options.runId;
  const progressEmitter = runId ? createProjectBoardRunProgressEmitter(runId, { targetStore, host: options.host }) : undefined;
  if (runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(runId, {
      stage: "charter_summary",
      title: "Asked Ambient/Pi for charter project summary",
      summary: `Refreshing the active charter project summary from ${sources.length} source${sources.length === 1 ? "" : "s"} and current kickoff answers.`,
      metadata: {
        model,
        sourceCount: sources.length,
        previousGenerator: currentSummary?.generator,
        stale: !projectBoardCharterSummaryIsFresh(currentSummary, fallbackSummary),
      },
    });
    emitProjectBoardState(targetStore, options.host);
  }

  try {
    const result = await new AmbientProjectBoardCharterSummaryProvider({
      model,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).summarize({
      charter: board.charter,
      sources,
      projectName: targetStore.getWorkspace().name,
      fallbackSummary,
      generatedAt,
      signal: options.signal,
      onProgress: runId
        ? (progress) => {
            if (
              recordProjectBoardDirectHelperRetryActivity({
                store: targetStore,
                runId,
                stage: "charter_summary",
                title: "Retrying Pi charter summary",
                helperLabel: "charter summary",
                progress,
                flushProgress: () => progressEmitter?.flush(),
              })
            ) {
              emitProjectBoardState(targetStore, options.host);
              return;
            }
            progressEmitter?.update({
              stage: "charter_summary",
              responseCharCount: progress.responseCharCount,
            });
          }
        : undefined,
    });
    progressEmitter?.flush();
    targetStore.updateProjectBoardCharterProjectSummary({
      boardId,
      summary: result.summary,
      title: "Applied Pi charter project summary",
      eventSummary: "Updated the active charter project summary with Ambient/Pi grounded project-shape context.",
      metadata: { ...result.telemetry, model },
      createdAt: generatedAt,
    });
    if (runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(runId, {
        stage: "charter_summary",
        title: "Applied Pi charter project summary",
        summary: projectBoardCharterSummaryRunSummary(result),
        metadata: { ...result.telemetry, generator: result.summary.generator },
        promptCharCount: result.telemetry.promptCharCount,
        responseCharCount: result.telemetry.responseCharCount,
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return result.summary;
  } catch (error) {
    progressEmitter?.flush();
    if (options.signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (!projectBoardCharterSummaryIsFresh(currentSummary, fallbackSummary)) {
      targetStore.updateProjectBoardCharterProjectSummary({
        boardId,
        summary: fallbackSummary,
        title: "Applied fallback charter project summary",
        eventSummary: `Used deterministic project-shape context because Ambient/Pi summary refresh failed: ${message}`,
        metadata: { error: message, fallback: true, model },
        createdAt: generatedAt,
      });
    }
    if (runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(runId, {
        stage: "charter_summary",
        title: "Pi charter summary unavailable",
        summary: `Using deterministic charter project summary because Ambient/Pi summary refresh failed: ${message}`,
        metadata: { error: message, fallback: true, model },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return projectBoardCharterSummaryIsFresh(currentSummary, fallbackSummary) ? currentSummary : fallbackSummary;
  }
}

function projectBoardCharterSummaryIsFresh(
  current: ProjectBoardCharterProjectSummary | undefined,
  fallback: ProjectBoardCharterProjectSummary,
): boolean {
  if (!current) return false;
  if (current.charterAnswerChecksum !== fallback.charterAnswerChecksum) return false;
  if (current.sourceChecksumSet.length !== fallback.sourceChecksumSet.length) return false;
  const currentChecksums = [...current.sourceChecksumSet].sort();
  const nextChecksums = [...fallback.sourceChecksumSet].sort();
  return currentChecksums.every((checksum, index) => checksum === nextChecksums[index]);
}

function projectBoardCharterSummaryRunSummary(result: AmbientProjectBoardCharterSummaryResult): string {
  return `Ambient/Pi refreshed charter project context with ${result.summary.majorSystems.length} major system${
    result.summary.majorSystems.length === 1 ? "" : "s"
  }, ${result.summary.sourceCoverage.length} source coverage note${
    result.summary.sourceCoverage.length === 1 ? "" : "s"
  }, and ${result.summary.coverageGaps.length} coverage gap${result.summary.coverageGaps.length === 1 ? "" : "s"}.`;
}

function projectBoardSourceTelemetry(sources: Awaited<ReturnType<typeof scanProjectBoardSources>>) {
  const included = sources.filter(projectBoardSourceIncludedInSynthesis);
  const sourceCharCount = included.reduce(
    (total, source) => total + source.title.length + source.summary.length + (source.excerpt?.length ?? 0) + (source.path?.length ?? 0),
    0,
  );
  return { sourceCount: sources.length, includedSourceCount: included.length, sourceCharCount };
}

function projectBoardAnsweredQuestionsForRefinement(
  boardId: string,
  targetStore: ProjectStore = store,
): ProjectBoardSynthesisRefinementAnswer[] {
  const boardSummary = targetStore.getProjectBoard(boardId);
  if (boardSummary?.id !== boardId) return [];
  const charterAnswers: ProjectBoardSynthesisRefinementAnswer[] = boardSummary.questions
    .filter((question) => question.answer?.trim())
    .map((question) => ({ question: `Charter kickoff: ${question.question}`, answer: question.answer!.trim(), source: "charter" }));
  const cardClarificationAnswers: ProjectBoardSynthesisRefinementAnswer[] = boardSummary.cards.flatMap((card) =>
    (card.clarificationAnswers ?? []).flatMap((answer) => {
      const question = answer.question.trim();
      const text = answer.answer.trim();
      if (!question || !text) return [];
      return [
        {
          question: `Card clarification (${card.title}): ${question}`,
          answer: text,
          source: "card_clarification" as const,
          cardId: card.id,
          cardTitle: card.title,
        },
      ];
    }),
  );
  return [...charterAnswers, ...cardClarificationAnswers].slice(0, 60);
}

function requireProjectBoardForAction(boardId: string, targetStore: ProjectStore = store) {
  const board = targetStore.getProjectBoard(boardId);
  if (!board) throw new Error(`Project board not found: ${boardId}`);
  return board;
}

async function projectBoardPmReviewGitContextForBoard(
  boardId: string,
  targetStore: ProjectStore = store,
): Promise<ProjectBoardPmReviewGitContext> {
  try {
    const status = await getProjectBoardGitSyncStatus(requireProjectBoardForAction(boardId, targetStore), {
      runtime: targetStore.listOrchestrationBoard(),
    });
    return projectBoardPmReviewGitContextFromStatus(status);
  } catch (error) {
    return {
      mode: "unknown",
      isGitRepository: false,
      hasRemote: false,
      dirtyBoardFileCount: 0,
      dirtyBoardFiles: [],
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function prepareProjectBoardSynthesisRun(input: {
  boardId: string;
  model?: string;
  retryOfRunId?: string;
  intent: string;
}, targetStore: ProjectStore = store, host?: ProjectRuntimeHost): { run: ProjectBoardSynthesisRun; reused: boolean } {
  requireProjectBoardForAction(input.boardId, targetStore);
  const staleBefore = new Date(Date.now() - PROJECT_BOARD_SYNTHESIS_STALE_MS).toISOString();
  const staleRuns = targetStore.failStaleProjectBoardSynthesisRuns({
    boardId: input.boardId,
    staleBefore,
    reason: `No project-board synthesis progress was recorded for at least ${Math.round(
      PROJECT_BOARD_SYNTHESIS_STALE_MS / 60_000,
    )} minutes, so this run was marked failed before starting a new ${input.intent} request.`,
  });
  if (staleRuns.length > 0) emitProjectBoardState(targetStore, host);

  const running = targetStore.getRunningProjectBoardSynthesisRun(input.boardId, { excludeStages: ["kickoff_defaults"] });
  if (running) {
    const updatedAt = running.updatedAt ? new Date(running.updatedAt).getTime() : NaN;
    const idleMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : undefined;
    const run = targetStore.recordProjectBoardSynthesisRunEvent(running.id, {
      stage: running.stage,
      title: "Joined running synthesis",
      summary: `Skipped a duplicate ${input.intent} request because project-board synthesis is already running. The existing run will continue to stream progress and produce the board output.`,
      metadata: {
        duplicateRequest: true,
        intent: input.intent,
        retryOfRunId: input.retryOfRunId,
        runningRunId: running.id,
        idleMs,
      },
    });
    emitProjectBoardState(targetStore, host);
    return { run, reused: true };
  }

  return {
    run: targetStore.createProjectBoardSynthesisRun({ boardId: input.boardId, model: input.model, retryOfRunId: input.retryOfRunId }),
    reused: false,
  };
}

async function applyProjectBoardGitProjectionAndBroadcast(
  boardId: string,
  resolutions: ProjectBoardGitSyncInput["resolutions"] = [],
  targetStore: ProjectStore = store,
  host?: ProjectRuntimeHost,
) {
  const board = requireProjectBoardForAction(boardId, targetStore);
  const runtime = targetStore.listOrchestrationBoard();
  await applyProjectBoardGitProjection(board, {
    runtime,
    resolutions,
    applyProjection: (projectPath, projection) => targetStore.applyProjectBoardArtifactProjection(projectPath, projection),
  });
  if (host) {
    emitProjectStateIfActive(host);
  } else {
    emitDesktopState();
  }
  const state = host ? readStateForProjectHostAction(host) : readState();
  return state;
}

function projectBoardValidatedProgressiveRecordsFromRun(runId?: string, targetStore: ProjectStore = store): ProposalJsonlRecordArtifact[] {
  if (!runId?.trim()) return [];
  const run = targetStore.getProjectBoardSynthesisRun(runId.trim());
  if (!run?.progressiveRecords?.length) return [];
  return run.progressiveRecords.flatMap((record) => {
    try {
      return [validateProposalJsonlRecordArtifact(record)];
    } catch {
      return [];
    }
  });
}

interface ProjectBoardRetryResumeRecords {
  records: ProposalJsonlRecordArtifact[];
  continuation?: ProjectBoardPlannerBatchContinuation;
}

async function projectBoardValidatedProgressiveRecordsForRetry(
  runId?: string,
  options: { mode?: RetryProjectBoardSynthesisInput["mode"]; targetStore?: ProjectStore } = {},
): Promise<ProjectBoardRetryResumeRecords> {
  const targetStore = options.targetStore ?? store;
  if (!runId?.trim()) return { records: [] };
  const run = targetStore.getProjectBoardSynthesisRun(runId.trim());
  if (!run) return { records: [] };
  if (options.mode === "start_fresh") return { records: [] };
  const records: ProposalJsonlRecordArtifact[] = [...projectBoardValidatedProgressiveRecordsFromRun(run.id, targetStore)];
  for (const rootPath of projectBoardPlannerWorkspaceRootsFromRun(run)) {
    const workspaceRecords = await readProjectBoardPlannerWorkspaceRecordsFromRoot(rootPath);
    for (const record of workspaceRecords) {
      try {
        records.push(validateProposalJsonlRecordArtifact(record));
      } catch {
        // Workspace reads are validated at the artifact boundary; keep retry loading tolerant of older or partial files.
      }
    }
  }
  const deduped = dedupeProjectBoardProgressiveRecords(records);
  if (options.mode === "continue_batch" || options.mode === "paused_run") {
    const continuation = projectBoardPlannerContinuationForRetry(run, deduped);
    if (options.mode === "continue_batch" && !continuation.continuation) {
      throw new Error("This synthesis run has no recoverable planner-batch output checkpoint to continue.");
    }
    return continuation;
  }
  return { records: deduped };
}

function projectBoardPlannerWorkspaceRootsFromRun(run: ProjectBoardSynthesisRun): string[] {
  const roots = new Set<string>();
  for (const event of run.events) {
    const root = event.metadata.plannerWorkspaceRoot;
    if (typeof root === "string" && root.trim()) roots.add(root.trim());
    const aggregatePath = event.metadata.aggregateJsonlPath;
    if (typeof aggregatePath === "string" && aggregatePath.trim()) roots.add(dirname(dirname(aggregatePath.trim())));
  }
  return [...roots];
}

function dedupeProjectBoardProgressiveRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
  const seen = new Set<string>();
  const result: ProposalJsonlRecordArtifact[] = [];
  for (const record of records) {
    const key = JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

function createProjectBoardSynthesisProvider(model: string, targetStore: ProjectStore = store): AmbientProjectBoardSynthesisProvider {
  return new AmbientProjectBoardSynthesisProvider({
    model,
    reasoning: projectBoardSynthesisReasoningConfigFromEnv(),
    maxToolRounds: projectBoardSynthesisMaxToolRoundsFromEnv(),
    retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
  });
}

function isRecoverableEmptyPlannerCardFailure(error: unknown): boolean {
  const message = projectBoardSynthesisErrorMessage(error);
  return /Planner-batch Ambient\/Pi synthesis did not produce any candidate cards|Ambient project-board synthesis returned an empty response/i.test(message);
}

function projectBoardSynthesisErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createWorkflowDiscoveryProvider(
  providerStatus: ReturnType<typeof getAmbientProviderStatus>,
  targetStore: ProjectStore = store,
): AmbientWorkflowDiscoveryProvider {
  return new AmbientWorkflowDiscoveryProvider({
    apiKey: readAmbientApiKey(),
    baseUrl: providerStatus.baseUrl,
    model: providerStatus.model,
    retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
  });
}

function ambientRetryPolicyFromCurrentSettings(targetStore: ProjectStore = store) {
  const modelRuntimeSettings = targetStore.getModelRuntimeSettings();
  return modelRuntimeSettings.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings }) : undefined;
}

function projectBoardSynthesisReasoningConfigFromEnv(): ProjectBoardSynthesisReasoning | undefined {
  const explicitNoReasoning = (process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_NO_REASONING ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(explicitNoReasoning)) return false;
  const reasoning = (process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_REASONING ?? "").trim().toLowerCase();
  if (!reasoning) return undefined;
  if (["0", "false", "none", "off", "disabled", "no_reasoning"].includes(reasoning)) return false;
  if (!["xhigh", "high", "medium", "low", "minimal"].includes(reasoning)) return undefined;
  const maxTokens = Number(process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_REASONING_MAX_TOKENS);
  const exclude = (process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_REASONING_EXCLUDE ?? "true").trim().toLowerCase();
  const effort = reasoning as NonNullable<Exclude<ProjectBoardSynthesisReasoning, false>["effort"]>;
  return {
    effort,
    enabled: true,
    exclude: !["0", "false", "no", "off"].includes(exclude),
    ...(Number.isFinite(maxTokens) && maxTokens >= 0 ? { max_tokens: Math.floor(maxTokens) } : {}),
  } satisfies ProjectBoardSynthesisReasoning;
}

function projectBoardSynthesisMaxToolRoundsFromEnv(): number | undefined {
  const raw = process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_MAX_TOOL_ROUNDS;
  if (raw === undefined || !raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(8, Math.floor(value)));
}

function applyProjectBoardIncrementalSynthesisFromRun(input: {
  boardId: string;
  runId: string;
  fallback: ProjectBoardSynthesisDraft;
  model?: string;
  startedAt: number;
  replaceExistingDraft: boolean;
  sourceIdNamespace?: string;
  targetStore?: ProjectStore;
}): void {
  const targetStore = input.targetStore ?? store;
  const records = projectBoardValidatedProgressiveRecordsFromRun(input.runId, targetStore);
  if (!records.some((record) => record.type === "candidate_card")) return;
  let draft: ProjectBoardSynthesisDraft;
  try {
    draft = projectBoardSynthesisDraftFromProgressiveRecords(records, input.fallback);
  } catch (error) {
    targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "schema_validation",
      title: "Incremental board batch not ready",
      summary: `Progressive records were saved, but they cannot be applied to the board yet: ${error instanceof Error ? error.message : String(error)}`,
      metadata: { progressive: true, error: error instanceof Error ? error.message : String(error), recordCount: records.length },
    });
    return;
  }

  const before = targetStore.getProjectBoard(input.boardId);
  const beforeSourceIds = new Set(before?.id === input.boardId ? before.cards.map((card) => card.sourceId) : []);
  const summary = targetStore.applyProjectBoardSynthesis(input.boardId, draft, {
    replaceExistingDraft: input.replaceExistingDraft,
    insertQuestions: false,
    deleteStaleDraftCards: false,
    sourceIdNamespace: input.sourceIdNamespace,
    snapshotRunId: input.runId,
    snapshotKind: "incremental",
    coverPlannerPlanDrafts: true,
  });
  const insertedCards = summary.cards.filter((card) => card.sourceKind === "board_synthesis" && !beforeSourceIds.has(card.sourceId));
  targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
    stage: "board_applied",
    title: "Applied incremental Pi card batch",
    summary: [
      `Applied ${draft.cards.length} progressive card${draft.cards.length === 1 ? "" : "s"} to the draft inbox before full planning completed.`,
      insertedCards.length ? `${insertedCards.length} new card${insertedCards.length === 1 ? "" : "s"} appeared in the board.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    metadata: {
      progressive: true,
      recordCount: records.length,
      cardCount: draft.cards.length,
      insertedCardIds: insertedCards.map((card) => card.id),
      insertedSourceIds: insertedCards.map((card) => card.sourceId),
      durationMs: Date.now() - input.startedAt,
      model: input.model,
    },
    cardCount: draft.cards.length,
    questionCount: draft.questions.length,
  });
}

async function consolidateProjectBoardSynthesisCandidates(input: {
  boardId: string;
  runId: string;
  model: string;
  targetStore: ProjectStore;
  host?: ProjectRuntimeHost;
}): Promise<void> {
  const targetStore = input.targetStore;
  try {
    const board = targetStore.getProjectBoard(input.boardId);
    if (!board) return;
    const candidates = projectBoardConsolidationCandidates(board.cards);
    if (candidates.length < 2) return;
    const apiKey = (readAmbientApiKey() ?? "").trim();
    if (!apiKey) return;
    const groups = await runProjectBoardCandidateConsolidation({
      boardId: input.boardId,
      projectName: targetStore.getWorkspace().name,
      candidates,
      model: input.model,
      apiKey,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
    });
    let markedCount = 0;
    const markedGroups: Array<{ survivorCardId: string; duplicateCardIds: string[]; reason: string }> = [];
    for (const group of groups) {
      const marked: string[] = [];
      for (const duplicateCardId of group.duplicateCardIds) {
        try {
          targetStore.updateProjectBoardCardCandidateStatus(duplicateCardId, "duplicate", {
            actor: "system",
            reason: group.reason || "Consolidation pass found this card duplicates another candidate.",
            relatedCardId: group.survivorCardId,
          });
          marked.push(duplicateCardId);
          markedCount += 1;
        } catch {
          // The card may have been ticketized or edited since the snapshot; leave it alone.
        }
      }
      if (marked.length > 0) markedGroups.push({ ...group, duplicateCardIds: marked });
    }
    targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "board_applied",
      title: markedCount > 0 ? "Consolidated duplicate candidates" : "Candidate consolidation found no duplicates",
      summary:
        markedCount > 0
          ? `An LLM review of all ${candidates.length} draft candidates marked ${markedCount} card${markedCount === 1 ? "" : "s"} as duplicates across ${markedGroups.length} group${markedGroups.length === 1 ? "" : "s"}. Duplicates stay in the Draft Inbox for audit.`
          : `An LLM review of all ${candidates.length} draft candidates found no duplicate cards.`,
      metadata: { consolidation: true, candidateCount: candidates.length, markedCount, groups: markedGroups },
    });
    if (markedCount > 0) emitProjectBoardState(targetStore, input.host);
  } catch (error) {
    // Consolidation is additive polish; a failure must never poison a succeeded planning run.
    try {
      targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
        stage: "board_applied",
        title: "Candidate consolidation skipped",
        summary: projectBoardSynthesisErrorMessage(error),
        metadata: { consolidation: true, failed: true },
      });
    } catch {
      /* run may be gone; nothing left to record */
    }
  }
}

async function applyProjectBoardLiveSynthesis(
  boardId: string,
  options: {
    replaceExistingDraft?: boolean;
    retryOfRunId?: string;
    retryMode?: RetryProjectBoardSynthesisInput["mode"];
    targetStore?: ProjectStore;
    host?: ProjectRuntimeHost;
  } = {},
): Promise<void> {
  const targetStore = options.targetStore ?? store;
  assertProjectBoardCardGenerationAllowed(requireProjectBoardForAction(boardId, targetStore), "Board synthesis");
  const startedAt = Date.now();
  const model = targetStore.getDefaultSettings().model;
  const prepared = prepareProjectBoardSynthesisRun({
    boardId,
    model,
    retryOfRunId: options.retryOfRunId,
    intent: options.retryMode === "start_fresh" ? "fresh synthesis" : options.retryOfRunId ? "retry synthesis" : "board synthesis",
  }, targetStore, options.host);
  if (prepared.reused) return;
  const run = prepared.run;
  const sourceIdNamespace = options.retryMode === "start_fresh" ? projectBoardStartFreshSourceIdNamespace(run.id) : undefined;
  projectBoardSynthesisPauseRequests.delete(run.id);
  const synthesisAbortController = new AbortController();
  projectBoardSynthesisAbortControllers.set(run.id, synthesisAbortController);
  const progressEmitter = createProjectBoardRunProgressEmitter(run.id, { targetStore, host: options.host });
  let progressiveRecordsPersisted = false;
  const shouldPause = () => isProjectBoardSynthesisPauseRequested(run.id, targetStore);
  const abortIfPauseRequested = () =>
    abortProjectBoardSynthesisForPause(run.id, "Project-board planning pause requested for this synthesis run.", targetStore);
  emitProjectBoardState(targetStore, options.host);
  try {
    const sources = await scanSourcesForProjectBoard(boardId, targetStore);
    const sourceTelemetry = projectBoardSourceTelemetry(sources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "source_scan",
      title: "Scanned project sources",
      summary: `Scanned ${sourceTelemetry.sourceCount} source${sourceTelemetry.sourceCount === 1 ? "" : "s"} and kept ${sourceTelemetry.includedSourceCount} for synthesis.`,
      metadata: sourceTelemetry,
      ...sourceTelemetry,
    });
    emitProjectBoardState(targetStore, options.host);
    let persistedSources = targetStore.replaceProjectBoardSources(boardId, sources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "sources_persisted",
      title: "Persisted source snapshot",
      summary: `Saved ${persistedSources.length} source record${persistedSources.length === 1 ? "" : "s"} for this board synthesis run.`,
      metadata: { persistedSourceCount: persistedSources.length },
    });
    emitProjectBoardState(targetStore, options.host);
    persistedSources = await classifyProjectBoardSourcesWithPi(boardId, persistedSources, { model, runId: run.id, targetStore, host: options.host });
    abortIfPauseRequested();
    await refreshProjectBoardCharterSummaryWithPi(boardId, persistedSources, {
      model,
      runId: run.id,
      signal: synthesisAbortController.signal,
      targetStore,
      host: options.host,
    });
    abortIfPauseRequested();
    const deterministicBaseline = synthesizeProjectBoardDraft(persistedSources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "deterministic_baseline",
      title: "Built deterministic baseline",
      summary: `Prepared a baseline with ${deterministicBaseline.cards.length} card${deterministicBaseline.cards.length === 1 ? "" : "s"} before asking Pi.`,
      metadata: { cardCount: deterministicBaseline.cards.length, questionCount: deterministicBaseline.questions.length },
      cardCount: deterministicBaseline.cards.length,
      questionCount: deterministicBaseline.questions.length,
    });
    emitProjectBoardState(targetStore, options.host);
    const charterAnswers = projectBoardAnsweredQuestionsForRefinement(boardId, targetStore);
    const activeBoard = targetStore.getProjectBoard(boardId);
    const charterProjectSummary = activeBoard?.id === boardId ? activeBoard.charter?.projectSummary : undefined;
    const provider = createProjectBoardSynthesisProvider(model, targetStore);
    const refinement = charterAnswers.length
      ? {
          previousDraft: deterministicBaseline,
          answers: charterAnswers,
          mode: "refine" as const,
        }
      : undefined;
    const plannerWorkspace = await createProjectBoardPlannerWorkspace({
      projectPath: targetStore.getWorkspace().path,
      boardId,
      runId: run.id,
      projectName: targetStore.getWorkspace().name,
      operation: "board_synthesis",
      sources: persistedSources,
    });
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "sources_persisted",
      title: "Prepared planner session workspace",
      summary: `Wrote ${plannerWorkspace.sources.length} source file${
        plannerWorkspace.sources.length === 1 ? "" : "s"
      }, a planner-session descriptor, ledger, and JSONL output targets for Pi planning artifacts.`,
      metadata: {
        plannerSessionId: plannerWorkspace.sessionId,
        plannerWorkspaceRoot: plannerWorkspace.rootPath,
        plannerSessionDescriptor: plannerWorkspace.sessionPath,
        plannerLedgerPath: plannerWorkspace.ledgerPath,
        plannerWorkspaceManifest: plannerWorkspace.manifestPath,
        aggregateJsonlPath: plannerWorkspace.aggregateJsonlPath,
        sourceFileCount: plannerWorkspace.sources.length,
        batchPolicy: plannerWorkspace.batchPolicy,
        executionMode: "pi_session_stream",
        compatibilityFallback: "direct_chat_compat",
      },
    });
    emitProjectBoardState(targetStore, options.host);
    const retryResume = await projectBoardValidatedProgressiveRecordsForRetry(options.retryOfRunId, { mode: options.retryMode, targetStore });
    const resumeFromRecords = retryResume.records;
    if (resumeFromRecords.length > 0) {
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "schema_validation",
        title: retryResume.continuation ? "Loaded planner-batch continuation checkpoint" : "Loaded previous section records",
        summary: retryResume.continuation
          ? `Continuation will reuse ${resumeFromRecords.length} validated progressive planning record${
              resumeFromRecords.length === 1 ? "" : "s"
            } through ${retryResume.continuation.lastValidRecordType} ${retryResume.continuation.lastValidRecordId}, then ask Pi for the next missing cards without stitching partial JSON.`
          : `Retry will reuse ${resumeFromRecords.length} validated progressive planning record${
              resumeFromRecords.length === 1 ? "" : "s"
            } from the previous synthesis run and its durable planner workspace where section status permits it.`,
        metadata: {
          retryOfRunId: options.retryOfRunId,
          retryMode: options.retryMode,
          progressiveRecordCount: resumeFromRecords.length,
          plannerContinuation: retryResume.continuation,
        },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    const onProgress = (progress: AmbientProjectBoardSynthesisProgress) => {
      if (progress.metadata?.streaming === true) {
        progressEmitter.update({
          stage: progress.stage,
          promptCharCount: progress.promptCharCount,
          responseCharCount: progress.responseCharCount,
          cardCount: progress.cardCount,
          questionCount: progress.questionCount,
        });
        abortIfPauseRequested();
        return;
      }
      progressEmitter.flush();
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: progress.stage,
        title: progress.title,
        summary: progress.summary,
        metadata: progress.metadata,
        promptCharCount: progress.promptCharCount,
        responseCharCount: progress.responseCharCount,
        cardCount: progress.cardCount,
        questionCount: progress.questionCount,
      });
      emitProjectBoardState(targetStore, options.host);
      abortIfPauseRequested();
    };
    const onProgressiveRecords = (batch: AmbientProjectBoardSynthesisProgressiveBatch) => {
      progressiveRecordsPersisted = true;
      progressEmitter.flush();
      recordProjectBoardSynthesisProgressiveBatch(run.id, batch, targetStore);
      applyProjectBoardIncrementalSynthesisFromRun({
        boardId,
        runId: run.id,
        fallback: deterministicBaseline,
        model,
        startedAt,
        replaceExistingDraft: options.replaceExistingDraft ?? true,
        sourceIdNamespace,
        targetStore,
      });
      emitProjectBoardState(targetStore, options.host);
      abortIfPauseRequested();
    };
    const result = projectBoardShouldUseSectionedPlanningForWorkflow(persistedSources, refinement)
      ? await provider.synthesizeSectionedWithTelemetry({
          sources: persistedSources,
          projectName: targetStore.getWorkspace().name,
          refinement,
          ...(charterProjectSummary ? { charterProjectSummary } : {}),
          resumeFromRecords,
          onProgress,
          onProgressiveRecords,
          plannerWorkspace,
          shouldPause,
          signal: synthesisAbortController.signal,
        })
      : await provider.synthesizePlannerBatchesWithTelemetry({
          sources: persistedSources,
          projectName: targetStore.getWorkspace().name,
          refinement,
          ...(charterProjectSummary ? { charterProjectSummary } : {}),
          resumeFromRecords,
          resumeContinuation: retryResume.continuation,
          onProgress,
          onProgressiveRecords,
          plannerWorkspace,
          shouldPause,
          signal: synthesisAbortController.signal,
        });
    progressEmitter.flush();
    const pauseRequestedAfterResult = result.telemetry.paused || isProjectBoardSynthesisPauseRequested(run.id, targetStore);
    if (!progressiveRecordsPersisted) {
      recordProjectBoardSynthesisProgressiveRecords(run.id, result.draft, persistedSources, undefined, result.progressiveRecords, targetStore);
    }
    recordProjectBoardSynthesisCardBuildEvents(run.id, result.draft.cards, targetStore);
    emitProjectBoardState(targetStore, options.host);
    targetStore.applyProjectBoardSynthesis(boardId, result.draft, {
      replaceExistingDraft: options.replaceExistingDraft ?? true,
      insertQuestions: false,
      deleteStaleDraftCards: result.telemetry.partial !== true,
      sourceIdNamespace,
      coverPlannerPlanDrafts: true,
    });
    if (pauseRequestedAfterResult) {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      targetStore.markProjectBoardSynthesisRunPaused({
        boardId,
        runId: run.id,
        reason: result.telemetry.paused
          ? "Planning paused at the requested checkpoint."
          : "Planning paused after the synthesis result completed while a pause was requested.",
        metadata: {
          durationMs: Date.now() - startedAt,
          pauseRequestedAfterResult: !result.telemetry.paused,
          scopeContract: result.scopeContract,
          planningDepth: result.planningDepth,
          ...result.telemetry,
        },
      });
      emitProjectBoardState(targetStore, options.host);
      return;
    }
    await refreshProjectBoardCharterSummaryWithPi(boardId, persistedSources, { model, runId: run.id, force: true, targetStore, host: options.host });
    projectBoardSynthesisPauseRequests.delete(run.id);
    projectBoardSynthesisAbortControllers.delete(run.id);
    const partialSectionSummary =
      result.telemetry.failedSectionCount && result.telemetry.failedSectionCount > 0
        ? ` ${result.telemetry.failedSectionCount} source section${result.telemetry.failedSectionCount === 1 ? "" : "s"} failed and can be retried.`
        : "";
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: result.telemetry.partial ? "Applied partial Pi board synthesis" : "Applied Pi board synthesis",
      summary: `Applied ${result.draft.cards.length} candidate card${
        result.draft.cards.length === 1 ? "" : "s"
      } from Ambient/Pi to the draft inbox.${partialSectionSummary}`,
      metadata: { durationMs: Date.now() - startedAt, scopeContract: result.scopeContract, planningDepth: result.planningDepth, ...result.telemetry },
      status: "succeeded",
      promptCharCount: result.telemetry.promptCharCount,
      responseCharCount: result.telemetry.responseCharCount,
      cardCount: result.telemetry.cardCount,
      questionCount: result.telemetry.questionCount,
      completedAt: new Date().toISOString(),
    });
    emitProjectBoardState(targetStore, options.host);
    await consolidateProjectBoardSynthesisCandidates({ boardId, runId: run.id, model, targetStore, host: options.host });
  } catch (error) {
    const runStillExists = Boolean(targetStore.getProjectBoardSynthesisRun(run.id));
    if (isProjectBoardSynthesisPauseRequested(run.id, targetStore) || synthesisAbortController.signal.aborted) {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      progressEmitter.flush();
      if (!runStillExists) {
        emitProjectBoardState(targetStore, options.host);
        return;
      }
      const abortReason =
        synthesisAbortController.signal.reason instanceof Error
          ? synthesisAbortController.signal.reason.message
          : synthesisAbortController.signal.aborted
            ? "Transport aborted after pause was requested."
            : error instanceof Error
              ? error.message
              : String(error);
      targetStore.markProjectBoardSynthesisRunPaused({
        boardId,
        runId: run.id,
        reason: "Planning paused after canceling the active Ambient/Pi stream.",
        metadata: {
          durationMs: Date.now() - startedAt,
          transportAbort: true,
          abortReason,
          progressiveRecordsPersisted,
        },
      });
      emitProjectBoardState(targetStore, options.host);
      return;
    }
    projectBoardSynthesisPauseRequests.delete(run.id);
    projectBoardSynthesisAbortControllers.delete(run.id);
    progressEmitter.flush();
    if (!runStillExists) {
      emitProjectBoardState(targetStore, options.host);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "failed",
      title: "Board synthesis failed",
      summary: message,
      metadata: { message },
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    emitProjectBoardState(targetStore, options.host);
    throw error;
  }
}

function startProjectBoardSynthesisAfterPlanPromotion(host: ProjectRuntimeHost, boardId: string): void {
  const targetStore = host.store;
  const board = targetStore.getProjectBoard(boardId);
  if (!board || board.status === "archived") return;
  // Park the automatic planning pass while the compact durable-plan card is already
  // ticketized or executing: planning would only propose duplicate step cards for the
  // exact scope a worker is building right now. Manual Revise Board stays available.
  if (targetStore.parkAutomaticPlanningForExecutingPlanCard(boardId)) {
    emitProjectStateIfActive(host);
    return;
  }
  void applyProjectBoardLiveSynthesis(boardId, { replaceExistingDraft: true, targetStore, host }).catch((error) => {
    console.warn("Project-board synthesis after plan promotion failed.", error);
    emitProjectStateIfActive(host);
  });
}

function recordProjectBoardSynthesisSectionDecision(
  boardId: string,
  runId: string,
  decision: "retry_failed_sections" | "defer_failed_sections",
  reason?: string,
  targetStore: ProjectStore = store,
): void {
  const run = targetStore.getProjectBoardSynthesisRun(runId);
  if (!run || run.boardId !== boardId) throw new Error("Project board synthesis run not found for this board.");
  const partial = projectBoardSynthesisPartialStatus(run);
  if (!partial.hasFailedSections) throw new Error("This synthesis run has no failed source sections to recover.");
  const failedLabel = `${partial.failedCount} failed source section${partial.failedCount === 1 ? "" : "s"}`;
  const title = decision === "retry_failed_sections" ? "Retry requested for failed sections" : "Deferred failed source sections";
  const summary =
    decision === "retry_failed_sections"
      ? `Starting a resumable retry for ${failedLabel}. Completed section records from this run will be reused where section status permits it.`
      : `Kept the current partial proposal and deferred ${failedLabel}. Retry remains available from this run if the deferred sections become important.`;
  targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: run.stage,
    title,
    summary: reason?.trim() ? `${summary} Reason: ${reason.trim()}` : summary,
    metadata: {
      decision,
      failedSectionCount: partial.failedCount,
      failedSectionIds: partial.failedSectionIds,
      failedSectionHeadings: partial.failedSectionHeadings,
      partialProposal: partial.hasPartialProposal,
    },
  });
}

function recordProjectBoardSynthesisPlannerContinuationDecision(
  boardId: string,
  runId: string,
  targetStore: ProjectStore = store,
): void {
  const run = targetStore.getProjectBoardSynthesisRun(runId);
  if (!run || run.boardId !== boardId) throw new Error("Project board synthesis run not found for this board.");
  const continuation = projectBoardSynthesisOutputCapRecovery(run);
  if (!continuation.canContinue) throw new Error("This synthesis run has no recoverable planner-batch output checkpoint to continue.");
  targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: run.stage,
    title: "Continue planner batch requested",
    summary: continuation.summary,
    metadata: {
      decision: "continue_planner_batch",
      finishReason: continuation.finishReason,
      stopReason: continuation.stopReason,
      outputTokenBudget: continuation.outputTokenBudget,
      lastValidRecordId: continuation.lastValidRecordId,
      lastValidRecordType: continuation.lastValidRecordType,
      lastValidRecordIndex: continuation.lastValidRecordIndex,
      plannerBatchIndex: continuation.plannerBatchIndex,
      plannerBatchCount: continuation.plannerBatchCount,
    },
  });
}

function recordProjectBoardSynthesisResumeDecision(boardId: string, runId: string, targetStore: ProjectStore = store): void {
  const run = targetStore.getProjectBoardSynthesisRun(runId);
  if (!run || run.boardId !== boardId) throw new Error("Project board synthesis run not found for this board.");
  if (run.status !== "paused") throw new Error("Only a paused project-board synthesis run can be resumed.");
  const continuation = projectBoardSynthesisOutputCapRecovery(run);
  targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: run.stage,
    title: "Resume planning requested",
    summary: continuation.canContinue
      ? `${continuation.summary} Resume will keep the paused run immutable and create a new continuation run.`
      : "Resume will reuse validated progressive records from the paused run and ask Ambient/Pi for remaining cards.",
    metadata: {
      decision: "resume_paused_planning",
      recoverablePlannerBatch: continuation.canContinue,
      finishReason: continuation.finishReason,
      stopReason: continuation.stopReason,
      outputTokenBudget: continuation.outputTokenBudget,
      lastValidRecordId: continuation.lastValidRecordId,
      lastValidRecordType: continuation.lastValidRecordType,
      lastValidRecordIndex: continuation.lastValidRecordIndex,
      plannerBatchIndex: continuation.plannerBatchIndex,
      plannerBatchCount: continuation.plannerBatchCount,
    },
  });
}

function recordProjectBoardSynthesisStartFreshDecision(boardId: string, runId: string, targetStore: ProjectStore = store): void {
  targetStore.abandonProjectBoardSynthesisRunPause({
    boardId,
    runId,
    reason: "Start Fresh requested instead of resuming this paused checkpoint.",
  });
  targetStore.supersedeProjectBoardSynthesisCardsForStartFresh({
    boardId,
    runId,
    reason: "Start Fresh requested instead of resuming this paused checkpoint.",
  });
}

function projectBoardStartFreshSourceIdNamespace(runId: string): string {
  return `start-fresh:${runId}:`;
}

function recordProjectBoardSynthesisCardBuildEvents(
  runId: string,
  cards: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["synthesizeWithTelemetry"]>>["draft"]["cards"],
  targetStore: ProjectStore = store,
): void {
  const visibleCards = cards.slice(0, 60);
  visibleCards.forEach((card, index) => {
    targetStore.recordProjectBoardSynthesisRunEvent(runId, {
      stage: "schema_validation",
      title: `Prepared card ${index + 1}/${cards.length}`,
      summary: `${card.title}${card.phase ? ` · ${card.phase}` : ""}${card.blockedBy.length ? ` · blocked by ${card.blockedBy.join(", ")}` : ""}`,
      metadata: { sourceId: card.sourceId, phase: card.phase, sourceRefs: card.sourceRefs },
      cardCount: index + 1,
    });
  });
  if (cards.length > visibleCards.length) {
    targetStore.recordProjectBoardSynthesisRunEvent(runId, {
      stage: "schema_validation",
      title: "Prepared remaining cards",
      summary: `${cards.length - visibleCards.length} additional card${cards.length - visibleCards.length === 1 ? "" : "s"} were validated and are ready to apply.`,
      metadata: { omittedCardCount: cards.length - visibleCards.length },
      cardCount: cards.length,
    });
  }
}

function recordProjectBoardSynthesisProgressiveRecords(
  runId: string,
  draft: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["synthesizeWithTelemetry"]>>["draft"],
  sources: ProjectBoardSource[],
  proposalId?: string,
  records?: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["synthesizeWithTelemetry"]>>["progressiveRecords"],
  targetStore: ProjectStore = store,
): void {
  const progressiveRecords =
    records && records.length > 0
      ? records
      : projectBoardProgressiveRecordsFromDraft({
          draft,
          sources,
          proposalId: proposalId ?? runId,
          createdAt: new Date().toISOString(),
          includeProgress: false,
        });
  targetStore.recordProjectBoardSynthesisRunProgressiveRecords(runId, progressiveRecords, {
    summary: `Persisted ${draft.cards.length} candidate card${draft.cards.length === 1 ? "" : "s"}, ${draft.questions.length} question${draft.questions.length === 1 ? "" : "s"}, and source coverage before applying board state.`,
  });
}

function recordProjectBoardSynthesisProgressiveBatch(
  runId: string,
  batch: AmbientProjectBoardSynthesisProgressiveBatch,
  targetStore: ProjectStore = store,
): void {
  const candidateCount = batch.records.filter((record) => record.type === "candidate_card").length;
  const questionCount = batch.records.filter((record) => record.type === "question").length;
  const coverageCount = batch.records.filter((record) => record.type === "source_coverage").length;
  const errorCount = batch.records.filter((record) => record.type === "error").length;
  const semanticIdleCount = batch.records.filter((record) => record.type === "error" && record.code === "section_semantic_idle_timeout").length;
  const sectionStatus = batch.records.find(
    (record) => record.type === "progress" && typeof record.metadata.sectionStatus === "string",
  );
  const lastCard = batch.records.filter((record) => record.type === "candidate_card").at(-1);
  targetStore.recordProjectBoardSynthesisRunProgressiveRecords(runId, batch.records, {
    title: `Imported section ${batch.sectionIndex}/${batch.sectionCount} planning records`,
    summary: [
      `${batch.records.length} record${batch.records.length === 1 ? "" : "s"}`,
      sectionStatus?.type === "progress" ? `section ${sectionStatus.metadata.sectionStatus}` : "",
      candidateCount ? `${candidateCount} card${candidateCount === 1 ? "" : "s"}` : "",
      questionCount ? `${questionCount} question${questionCount === 1 ? "" : "s"}` : "",
      coverageCount ? `${coverageCount} coverage update${coverageCount === 1 ? "" : "s"}` : "",
      semanticIdleCount ? `${semanticIdleCount} semantic-idle stall${semanticIdleCount === 1 ? "" : "s"}` : "",
      errorCount ? `${errorCount} recoverable error${errorCount === 1 ? "" : "s"}` : "",
      lastCard?.type === "candidate_card" ? `last card: ${lastCard.title}` : "",
      `${batch.section.sourcePath || batch.section.sourceTitle} (${batch.section.heading})`,
    ]
      .filter(Boolean)
      .join(" · "),
  });
}

function requireProjectBoardDogfoodTestHook(channel: string): void {
  if (process.env.AMBIENT_E2E === "1" || process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_ENABLE_TEST_HOOKS === "1") return;
  throw new Error(`${channel} is only available in Ambient E2E dogfood runs.`);
}

function projectBoardSemanticIdleDogfoodFastRetryEnabled(): boolean {
  return process.env.AMBIENT_E2E === "1" && process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SEMANTIC_IDLE_FAST_RETRY === "1";
}

function seedProjectBoardSemanticIdleDogfoodRun(boardId: string, targetStore: ProjectStore = store): ProjectBoardSynthesisRun {
  requireProjectBoardDogfoodTestHook("seedProjectBoardSemanticIdleDogfoodRun");
  const board = requireProjectBoardForAction(boardId, targetStore);
  if (board.status === "draft") targetStore.updateProjectBoardStatus(boardId, "active");
  const sources = targetStore.replaceProjectBoardSources(boardId, [
    {
      kind: "functional_spec",
      sourceKey: "dogfood:semantic-idle-foundation",
      contentHash: "dogfood-foundation-v1",
      changeState: "new",
      title: "Semantic Idle Dogfood Foundation",
      summary: "Foundation section for a deterministic stalled-section recovery dogfood.",
      excerpt: "## Foundation\nBuild a small shell card first so retry can prove completed sections are preserved.",
      path: "dogfood/semantic-idle-foundation.md",
      relevance: 100,
      classifiedBy: "user",
      classificationReason: "E2E dogfood seed source for project-board stalled-section recovery.",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
    },
    {
      kind: "functional_spec",
      sourceKey: "dogfood:semantic-idle-combat",
      contentHash: "dogfood-combat-v1",
      changeState: "new",
      title: "Semantic Idle Dogfood Combat",
      summary: "Second source section intentionally represented as semantic-idle stalled coverage.",
      excerpt: "## Combat\nThis section should initially stall, then be retried into a second card.",
      path: "dogfood/semantic-idle-combat.md",
      relevance: 95,
      classifiedBy: "user",
      classificationReason: "E2E dogfood seed source for project-board stalled-section recovery.",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
    },
  ]);
  const foundationSource = sources[0];
  const combatSource = sources[1];
  if (!foundationSource || !combatSource) throw new Error("Semantic-idle dogfood sources were not created.");
  const run = targetStore.createProjectBoardSynthesisRun({ boardId, model: "dogfood-semantic-idle" });
  const createdAt = new Date().toISOString();
  const records: ProposalJsonlRecordArtifact[] = [
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "section_succeeded",
      title: "Completed section 1/2",
      summary: "Foundation cards planned before the dogfood semantic-idle stall.",
      createdAt,
      metadata: {
        sectionId: "dogfood-section-foundation",
        sectionStatus: "succeeded",
        sectionIndex: 1,
        sectionCount: 2,
        sectionHeading: "Foundation",
        sourceId: foundationSource.id,
        sourcePath: foundationSource.path,
        sectionRange: "lines:1-2",
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "candidate_card",
      sourceId: "synthesis:dogfood-foundation-shell",
      title: "Build the dogfood foundation shell",
      description: "Create the smallest project-board foundation shell so a later retry can prove completed section cards are preserved.",
      candidateStatus: "needs_clarification",
      priority: 1,
      phase: "Foundation",
      labels: ["dogfood", "foundation", "semantic-idle"],
      blockedBy: [],
      clarificationQuestions: ["Confirm the dogfood Foundation card should remain as the preserved completed-section card."],
      sourceRefs: [{ sourceId: foundationSource.id, path: foundationSource.path, range: "lines:1-2" }],
      acceptanceCriteria: ["The foundation shell card remains present after retrying the stalled section."],
      testPlan: {
        unit: ["Assert the recovered board keeps the foundation card."],
        integration: ["Exercise Retry Failed Sections through the Desktop IPC boundary."],
        visual: ["Capture the section-status panel showing the stalled section before retry."],
        manual: ["Confirm the retry adds only the missing section card."],
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: foundationSource.id,
      range: "lines:1-2",
      status: "covered",
      cardIds: ["synthesis:dogfood-foundation-shell"],
      note: "Foundation source was covered before the semantic-idle stall.",
      updatedAt: createdAt,
    }),
    validateProposalJsonlRecordArtifact({
      type: "question",
      questionId: "question:dogfood-combat-scope",
      question: "When the stalled Combat section is retried, should it create one narrow card instead of replacing the Foundation work?",
      cardId: "synthesis:dogfood-combat-loop",
      required: true,
      createdAt,
    }),
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "section_failed",
      title: "Stalled section 2/2",
      summary: "Combat stopped producing model content or planner records and can be retried without discarding Foundation.",
      createdAt,
      metadata: {
        sectionId: "dogfood-section-combat",
        sectionStatus: "failed",
        failureKind: "semantic_idle_timeout",
        retryable: true,
        sectionIndex: 2,
        sectionCount: 2,
        sectionHeading: "Combat",
        sourceId: combatSource.id,
        sourcePath: combatSource.path,
        sectionRange: "lines:1-2",
        completedSectionCount: 1,
        candidateCardCount: 1,
        questionCount: 1,
        semanticIdleTimeoutMs: 25,
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "error",
      code: "section_semantic_idle_timeout",
      message: "Combat stalled after 25ms without model content or planner records.",
      recoverable: true,
      createdAt,
      metadata: {
        sectionId: "dogfood-section-combat",
        sourceId: combatSource.id,
        sourcePath: combatSource.path,
        range: "lines:1-2",
        failureKind: "semantic_idle_timeout",
        retryable: true,
        completedSectionCount: 1,
        candidateCardCount: 1,
        questionCount: 1,
        semanticIdleTimeoutMs: 25,
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: combatSource.id,
      range: "lines:1-2",
      status: "unresolved",
      cardIds: [],
      note: "Combat source coverage is unresolved until Retry Failed Sections replans this section.",
      updatedAt: createdAt,
    }),
  ];
  targetStore.recordProjectBoardSynthesisRunProgressiveRecords(run.id, records, {
    title: "Seeded semantic-idle section dogfood records",
    summary: "Inserted one completed section, one preserved card, one unresolved question, and one retryable semantic-idle section.",
  });
  applyProjectBoardIncrementalSynthesisFromRun({
    boardId,
    runId: run.id,
    fallback: dogfoodSemanticIdleDraftFallback(),
    model: "dogfood-semantic-idle",
    startedAt: Date.now(),
    replaceExistingDraft: true,
    targetStore,
  });
  return targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: "board_applied",
    title: "Applied partial semantic-idle dogfood synthesis",
    summary: "Applied the preserved Foundation card while leaving Combat as a retryable stalled section.",
    metadata: {
      dogfood: "semantic_idle_section",
      partial: true,
      failedSectionCount: 1,
      semanticIdleSectionCount: 1,
      completedSectionCount: 1,
      questionCount: 1,
      cardCount: 1,
    },
    status: "succeeded",
    completedAt: new Date().toISOString(),
    cardCount: 1,
    questionCount: 1,
  });
}

function seedProjectBoardCanonicalProjectionDogfoodForProjectHost(
  host: ProjectRuntimeHost,
  input: SeedProjectBoardCanonicalProjectionDogfoodInput,
) {
  const targetStore = host.store;
  const board = requireProjectBoardForAction(input.boardId, targetStore);
  if (board.status === "draft") targetStore.updateProjectBoardStatus(input.boardId, "active");
  const workspacePath = targetStore.getWorkspace().path;

  const createReadyCard = (cardInput: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    unitProof: string[];
    labels: string[];
  }): ProjectBoardCard => {
    const draft = targetStore.createProjectBoardManualCard({
      boardId: input.boardId,
      title: cardInput.title,
      description: cardInput.description,
    });
    const ready = targetStore.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      labels: cardInput.labels,
      acceptanceCriteria: cardInput.acceptanceCriteria,
      testPlan: {
        unit: cardInput.unitProof,
        integration: [],
        visual: [],
        manual: [],
      },
    });
    const approved = targetStore.approveProjectBoardCard(ready.id);
    if (!approved.orchestrationTaskId) throw new Error(`Canonical projection dogfood card was not ticketized: ${approved.title}`);
    return approved;
  };

  const recordRun = (card: ProjectBoardCard, status: "failed" | "completed", proofOfWork: Record<string, unknown>, error?: string) => {
    if (!card.orchestrationTaskId) throw new Error(`Canonical projection card has no Local Task: ${card.title}`);
    const run = targetStore.recordPreparedOrchestrationRun({
      taskId: card.orchestrationTaskId,
      workspacePath: join(workspacePath, ".ambient-codex", "kanban-phase1", card.id),
    });
    return targetStore.updateOrchestrationRun({
      id: run.id,
      status,
      threadId: targetStore.createThread(`${card.title} proof thread`, workspacePath).id,
      error,
      proofOfWork,
      finish: true,
    });
  };

  const stopwatch = createReadyCard({
    title: "Static stopwatch DOM wiring",
    description:
      "Gate A fixture: the DOM wiring card was sent back once, retried, and then accepted as done through PM Review.",
    labels: ["phase-1", "stopwatch", "retry-cleanup"],
    acceptanceCriteria: ["Wire the start, pause, reset, and lap controls.", "Keep stopwatch state deterministic in unit tests."],
    unitProof: ["Run stopwatch DOM wiring unit tests."],
  });
  const stopwatchFailedRun = recordRun(
    stopwatch,
    "failed",
    {
      changedFiles: [],
      commands: [{ command: "pnpm exec vitest run test/stopwatch-dom.test.ts", exitCode: 1, output: "lap button handler missing" }],
      lastAssistantText: "Initial DOM wiring attempt failed before the lap button handler was connected.",
    },
    "DOM wiring proof failed; lap button handler missing.",
  );
  targetStore.resolveProjectBoardProofDecision({
    cardId: stopwatch.id,
    action: "retry",
    reason: "Send back once so the retry cleanup gate can verify stale failed badges do not survive PM acceptance.",
  });
  const retriedStopwatch = targetStore.getProjectBoardCard(stopwatch.id);
  const stopwatchCompletedRun = recordRun(retriedStopwatch, "completed", {
    changedFiles: ["src/stopwatch.ts", "test/stopwatch-dom.test.ts"],
    commands: [{ command: "pnpm exec vitest run test/stopwatch-dom.test.ts", exitCode: 0, output: "2 tests passed" }],
    lastAssistantText:
      "Implemented start, pause, reset, and lap DOM wiring. Stopwatch state is deterministic and the unit proof passed.",
  });
  targetStore.resolveProjectBoardProofDecision({
    cardId: stopwatch.id,
    action: "accept_done",
    reason: "Retried DOM wiring proof is sufficient; close without surfacing the prior failed attempt as active work.",
  });

  const csv = createReadyCard({
    title: "CSV expense stopped-after-proof",
    description:
      "Gate B fixture: the worker recorded durable CSV summarizer proof, then the provider stopped before final response closure.",
    labels: ["phase-1", "csv-expense", "stopped-after-proof"],
    acceptanceCriteria: ["Parse local CSV expense rows.", "Write a category summary artifact.", "Verify the summarizer with unit proof."],
    unitProof: ["Run CSV expense summarizer unit tests."],
  });
  const csvStoppedRun = recordRun(
    csv,
    "failed",
    {
      changedFiles: ["src/expenseSummary.ts", "test/expenseSummary.test.ts", "artifacts/expense-summary.md"],
      commands: [{ command: "pnpm exec vitest run test/expenseSummary.test.ts", exitCode: 0, output: "1 test passed" }],
      taskToolActions: [
        {
          actionId: "csv-proof-1",
          action: "task_report_proof",
          createdAt: "2026-05-17T09:00:00.000Z",
          summary: "CSV parser and summary artifact were implemented before the provider stopped.",
          commands: [{ command: "pnpm exec vitest run test/expenseSummary.test.ts", exitCode: 0 }],
          changedFiles: ["src/expenseSummary.ts", "test/expenseSummary.test.ts", "artifacts/expense-summary.md"],
          screenshots: [],
          browserTraces: [],
          visualChecks: [],
          manualChecks: [],
        },
        {
          actionId: "csv-complete-1",
          action: "task_complete",
          createdAt: "2026-05-17T09:00:05.000Z",
          summary: "Durable CSV expense summarizer proof satisfies the card criteria despite the stopped final response.",
          completedItems: ["CSV parser", "summary artifact", "unit proof"],
        },
      ],
      lastAssistantText: "Implemented the CSV expense summarizer and wrote durable proof before the provider stopped.",
    },
    "Provider stopped after proof was recorded.",
  );
  targetStore.resolveProjectBoardProofDecision({
    cardId: csv.id,
    action: "accept_done",
    reason: "Durable changed files and command proof satisfy the card after the provider stopped.",
  });

  emitProjectStateIfActive(host);
  const state = readStateForProjectHostAction(host);
  return {
    state,
    boardId: input.boardId,
    scenarios: [
      {
        name: "stopwatch_retry_cleanup",
        cardId: stopwatch.id,
        taskId: stopwatch.orchestrationTaskId!,
        runIds: [stopwatchFailedRun.id, stopwatchCompletedRun.id],
      },
      {
        name: "csv_stopped_after_proof",
        cardId: csv.id,
        taskId: csv.orchestrationTaskId!,
        runIds: [csvStoppedRun.id],
      },
    ],
  };
}

async function seedProjectBoardDeliverableIntegrationDogfoodForProjectHost(
  host: ProjectRuntimeHost,
  input: SeedProjectBoardDeliverableIntegrationDogfoodInput,
) {
  const targetStore = host.store;
  const board = requireProjectBoardForAction(input.boardId, targetStore);
  if (board.status === "draft") targetStore.updateProjectBoardStatus(input.boardId, "active");
  const workspacePath = targetStore.getWorkspace().path;

  const createReadyCard = (cardInput: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    unitProof: string[];
    labels: string[];
  }): ProjectBoardCard => {
    const draft = targetStore.createProjectBoardManualCard({
      boardId: input.boardId,
      title: cardInput.title,
      description: cardInput.description,
    });
    const ready = targetStore.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      labels: cardInput.labels,
      acceptanceCriteria: cardInput.acceptanceCriteria,
      testPlan: {
        unit: cardInput.unitProof,
        integration: [],
        visual: [],
        manual: [],
      },
    });
    const approved = targetStore.approveProjectBoardCard(ready.id);
    if (!approved.orchestrationTaskId) throw new Error(`Deliverable integration dogfood card was not ticketized: ${approved.title}`);
    return approved;
  };

  const recordCompletedRun = async (
    card: ProjectBoardCard,
    workspaceStem: string,
    files: Array<{ path: string; content: string }>,
    proofExtras: Record<string, unknown> = {},
  ) => {
    if (!card.orchestrationTaskId) throw new Error(`Deliverable integration card has no Local Task: ${card.title}`);
    const runWorkspace = join(workspacePath, ".ambient-codex", "kanban-phase2-deliverables", workspaceStem);
    for (const file of files) {
      await mkdir(dirname(join(runWorkspace, file.path)), { recursive: true });
      await writeFile(join(runWorkspace, file.path), file.content, "utf8");
    }
    const run = targetStore.recordPreparedOrchestrationRun({
      taskId: card.orchestrationTaskId,
      workspacePath: runWorkspace,
    });
    return targetStore.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: targetStore.createThread(`${card.title} deliverable thread`, workspacePath).id,
      proofOfWork: {
        changedFiles: files.map((file) => file.path),
        commands: [{ command: "pnpm test", exitCode: 0, output: "seeded deliverable proof passed" }],
        commits: [`dogfood-${workspaceStem}`],
        ...proofExtras,
      },
      finish: true,
      reviewProjectBoardProof: false,
    });
  };

  const pomodoro = createReadyCard({
    title: "Pomodoro root integration",
    description: "Phase 2 Gate A fixture: material Pomodoro files are produced in a Local Task workspace before root integration.",
    labels: ["phase-2", "pomodoro", "integration-queue"],
    acceptanceCriteria: ["Generate index.html, app.js, style.css, and tests/checklist.md.", "Exclude runtime and dependency folders from integration."],
    unitProof: ["Run Pomodoro root integration proof."],
  });
  const pomodoroRun = await recordCompletedRun(
    pomodoro,
    "pomodoro-root",
    [
      { path: "index.html", content: "<main><h1>Pomodoro</h1><button>Start</button></main>\n" },
      { path: "app.js", content: "export const pomodoroMinutes = 25;\n" },
      { path: "style.css", content: "main { font-family: Inter, sans-serif; }\n" },
      { path: "tests/checklist.md", content: "- [x] Timer controls render\n- [x] Session state is deterministic\n" },
      { path: ".ambient/phase2-dogfood-runtime.json", content: "{\"runtime\":true}\n" },
      { path: "node_modules/phase2-dogfood-cache/index.js", content: "module.exports = {};\n" },
    ],
    { dependencyImports: ["date-fns"] },
  );
  targetStore.resolveProjectBoardProofDecision({
    cardId: pomodoro.id,
    action: "accept_done",
    reason: "Seeded Pomodoro deliverable proof is accepted so the close-state gate can focus on integration reachability.",
  });

  const recipe = createReadyCard({
    title: "Recipe index export bundle",
    description: "Phase 2 Gate B fixture: separate recipe index outputs are bundled for explicit handoff.",
    labels: ["phase-2", "recipe-index", "integration-queue"],
    acceptanceCriteria: ["Generate recipe fixtures, build-index.mjs, INDEX.md, and a verification script."],
    unitProof: ["Run recipe index verification from the integrated root or exported bundle."],
  });
  const recipeRun = await recordCompletedRun(
    recipe,
    "recipe-index",
    [
      { path: "recipes/apple-pie.json", content: "{\"title\":\"Apple Pie\",\"tags\":[\"dessert\"]}\n" },
      { path: "recipes/tomato-soup.json", content: "{\"title\":\"Tomato Soup\",\"tags\":[\"lunch\"]}\n" },
      { path: "build-index.mjs", content: "console.log('INDEX.md generated from recipes');\n" },
      { path: "INDEX.md", content: "# Recipe Index\n\n- Apple Pie\n- Tomato Soup\n" },
      { path: "tests/verify-recipes.mjs", content: "console.log('recipe fixture verification passed');\n" },
      { path: ".ambient-codex/phase2-dogfood-session.json", content: "{\"session\":true}\n" },
      { path: "node_modules/phase2-dogfood-cache/index.js", content: "module.exports = {};\n" },
    ],
    { dependencyImports: ["node:fs/promises"] },
  );
  targetStore.resolveProjectBoardProofDecision({
    cardId: recipe.id,
    action: "accept_done",
    reason: "Seeded Recipe Index deliverable proof is accepted so the close-state gate can focus on exported handoff artifacts.",
  });

  const deferred = createReadyCard({
    title: "Deferred theme review",
    description: "Phase 2 fixture: deliverables can be explicitly deferred without writing to the project root.",
    labels: ["phase-2", "defer", "integration-queue"],
    acceptanceCriteria: ["Record an explicit PM defer reason for non-root material output."],
    unitProof: ["Run defer-decision smoke proof."],
  });
  const deferredRun = await recordCompletedRun(deferred, "deferred-theme", [
    { path: "theme-review.md", content: "# Theme Review\n\nAwaiting PM approval before root integration.\n" },
  ]);
  targetStore.resolveProjectBoardProofDecision({
    cardId: deferred.id,
    action: "accept_done",
    reason: "Seeded theme deliverable proof is accepted so the close-state gate can verify explicit defer outcomes.",
  });

  emitProjectStateIfActive(host);
  const state = readStateForProjectHostAction(host);
  return {
    state,
    boardId: input.boardId,
    scenarios: [
      {
        name: "pomodoro_root_apply",
        cardId: pomodoro.id,
        taskId: pomodoro.orchestrationTaskId!,
        runId: pomodoroRun.id,
        workspacePath: pomodoroRun.workspacePath,
        materialFiles: ["index.html", "app.js", "style.css", "tests/checklist.md"],
        excludedFiles: [".ambient/phase2-dogfood-runtime.json", "node_modules/phase2-dogfood-cache/index.js"],
      },
      {
        name: "recipe_index_export",
        cardId: recipe.id,
        taskId: recipe.orchestrationTaskId!,
        runId: recipeRun.id,
        workspacePath: recipeRun.workspacePath,
        materialFiles: ["recipes/apple-pie.json", "recipes/tomato-soup.json", "build-index.mjs", "INDEX.md", "tests/verify-recipes.mjs"],
        excludedFiles: [".ambient-codex/phase2-dogfood-session.json", "node_modules/phase2-dogfood-cache/index.js"],
      },
      {
        name: "deferred_theme_review",
        cardId: deferred.id,
        taskId: deferred.orchestrationTaskId!,
        runId: deferredRun.id,
        workspacePath: deferredRun.workspacePath,
        materialFiles: ["theme-review.md"],
        excludedFiles: [],
      },
    ],
  };
}

async function seedProjectBoardProofJudgmentDogfoodForProjectHost(
  host: ProjectRuntimeHost,
  input: SeedProjectBoardProofJudgmentDogfoodInput,
): Promise<{
  state: DesktopState;
  boardId: string;
  cardId: string;
  runId: string;
  proofReview: ProjectBoardCard["proofReview"];
}> {
  const targetStore = host.store;
  const workspacePath = targetStore.getWorkspace().path;
  const board = requireProjectBoardForAction(input.boardId, targetStore);
  if (board.status === "draft") targetStore.updateProjectBoardStatus(input.boardId, "active");
  const draft = targetStore.createProjectBoardManualCard({
    boardId: input.boardId,
    title: "Judge aggressive retry proof smoke",
    description:
      "Exercise the project-board proof judgment direct helper through the Desktop product path after a completed card run.",
  });
  const ready = targetStore.updateProjectBoardCard({
    cardId: draft.id,
    candidateStatus: "ready_to_create",
    acceptanceCriteria: [
      "The implementation records a completed run with changed source evidence.",
      "The proof packet includes a successful automated verification command.",
      "The PM proof judgment direct helper can retry a no-content stream stall and apply a live judgment.",
    ],
    testPlan: {
      unit: ["Assert proof judgment retry metadata is recorded on the board timeline."],
      integration: ["Run the direct-helper GMI failpoint smoke through Desktop IPC."],
      visual: [],
      manual: [],
    },
  });
  const approved = targetStore.approveProjectBoardCard(ready.id);
  if (!approved.orchestrationTaskId) throw new Error("Proof-judgment dogfood card was not ticketized.");
  const thread = targetStore.createThread("Proof judgment retry smoke thread", workspacePath);
  targetStore.addMessage({
    threadId: thread.id,
    role: "assistant",
    content:
      "Implemented the aggressive retry proof smoke fixture, recorded verification output, and preserved the board-card proof packet.",
  });
  const run = targetStore.recordPreparedOrchestrationRun({
    taskId: approved.orchestrationTaskId,
    workspacePath,
  });
  targetStore.updateOrchestrationRun({
    id: run.id,
    status: "completed",
    threadId: thread.id,
    proofOfWork: {
      changedFiles: ["src/aggressiveRetryProofSmoke.ts", "src/aggressiveRetryProofSmoke.test.ts"],
      commands: [
        {
          command: "pnpm exec vitest run src/aggressiveRetryProofSmoke.test.ts",
          exitCode: 0,
          durationMs: 1842,
          output: "1 test file passed; proof judgment retry fixture stayed deterministic.",
        },
      ],
      afterRunHook: { ok: true, summary: "Post-run verification hook passed." },
      lastAssistantText:
        "Implemented the requested behavior, added focused verification, and confirmed the proof packet covers the acceptance criteria.",
      taskActions: {
        protocolSatisfied: true,
        terminalAction: "task_complete",
        actions: ["task_heartbeat", "task_report_proof", "task_complete"],
      },
    },
    finish: true,
    reviewProjectBoardProof: false,
  });
  await reviewFinishedProjectBoardRun(run.id, targetStore, () => emitProjectStateIfActive(host));
  const reviewed = targetStore.getProjectBoardCard(approved.id);
  const state = readStateForProjectHostAction(host);
  return {
    state,
    boardId: input.boardId,
    cardId: approved.id,
    runId: run.id,
    proofReview: reviewed.proofReview,
  };
}

function seedProjectBoardSemanticIdleDogfoodRetry(
  boardId: string,
  retryOfRunId: string,
  targetStore: ProjectStore = store,
): ProjectBoardSynthesisRun {
  requireProjectBoardDogfoodTestHook("seedProjectBoardSemanticIdleDogfoodRetry");
  const priorRun = targetStore.getProjectBoardSynthesisRun(retryOfRunId);
  if (!priorRun || priorRun.boardId !== boardId) throw new Error("Semantic-idle dogfood retry run not found for this board.");
  const board = requireProjectBoardForAction(boardId, targetStore);
  const foundationSource = board.sources.find((source) => source.sourceKey === "dogfood:semantic-idle-foundation") ?? board.sources[0];
  const combatSource = board.sources.find((source) => source.sourceKey === "dogfood:semantic-idle-combat") ?? board.sources.at(-1);
  if (!foundationSource || !combatSource) throw new Error("Semantic-idle dogfood retry sources are missing.");
  const run = targetStore.createProjectBoardSynthesisRun({ boardId, model: "dogfood-semantic-idle-retry", retryOfRunId });
  const createdAt = new Date().toISOString();
  const records: ProposalJsonlRecordArtifact[] = [
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "section_skipped",
      title: "Reused section 1/2",
      summary: "Foundation was reused from the previous completed section records.",
      createdAt,
      metadata: {
        sectionId: "dogfood-section-foundation",
        sectionStatus: "skipped",
        sectionIndex: 1,
        sectionCount: 2,
        sectionHeading: "Foundation",
        sourceId: foundationSource.id,
        sourcePath: foundationSource.path,
        sectionRange: "lines:1-2",
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "candidate_card",
      sourceId: "synthesis:dogfood-foundation-shell",
      title: "Build the dogfood foundation shell",
      description: "Preserved from the completed section so retry can focus on the previously stalled source slice.",
      candidateStatus: "needs_clarification",
      priority: 1,
      phase: "Foundation",
      labels: ["dogfood", "foundation", "semantic-idle"],
      blockedBy: [],
      clarificationQuestions: ["Confirm the dogfood Foundation card should remain as the preserved completed-section card."],
      sourceRefs: [{ sourceId: foundationSource.id, path: foundationSource.path, range: "lines:1-2" }],
      acceptanceCriteria: ["The foundation shell card remains present after retrying the stalled section."],
      testPlan: {
        unit: ["Assert the recovered board keeps the foundation card."],
        integration: ["Exercise Retry Failed Sections through the Desktop IPC boundary."],
        visual: ["Capture the section-status panel showing the reused section after retry."],
        manual: ["Confirm the retry adds only the missing section card."],
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "section_succeeded",
      title: "Completed section 2/2",
      summary: "Combat was replanned during the retry and now has a self-contained card.",
      createdAt,
      metadata: {
        sectionId: "dogfood-section-combat",
        sectionStatus: "succeeded",
        sectionIndex: 2,
        sectionCount: 2,
        sectionHeading: "Combat",
        sourceId: combatSource.id,
        sourcePath: combatSource.path,
        sectionRange: "lines:1-2",
        retryOfRunId,
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "candidate_card",
      sourceId: "synthesis:dogfood-combat-loop",
      title: "Add the retried dogfood combat loop",
      description: "Create the missing Combat card from the section that previously stalled without model content or planner records.",
      candidateStatus: "needs_clarification",
      priority: 2,
      phase: "Combat",
      labels: ["dogfood", "combat", "semantic-idle"],
      blockedBy: ["synthesis:dogfood-foundation-shell"],
      clarificationQuestions: ["Confirm that the retried Combat card should remain blocked by the preserved Foundation card."],
      sourceRefs: [{ sourceId: combatSource.id, path: combatSource.path, range: "lines:1-2" }],
      acceptanceCriteria: ["The retry adds a Combat card without replacing the preserved Foundation card."],
      testPlan: {
        unit: ["Assert the retry summary has zero semantic-idle errors."],
        integration: ["Verify the retried run reuses section 1 and succeeds section 2."],
        visual: ["Capture the section-status panel after retry."],
        manual: ["Review that Combat is now represented as a card."],
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: foundationSource.id,
      range: "lines:1-2",
      status: "covered",
      cardIds: ["synthesis:dogfood-foundation-shell"],
      note: "Foundation source was reused from the previous run.",
      updatedAt: createdAt,
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: combatSource.id,
      range: "lines:1-2",
      status: "covered",
      cardIds: ["synthesis:dogfood-combat-loop"],
      note: "Combat source coverage was resolved by retrying the stalled section.",
      updatedAt: createdAt,
    }),
  ];
  targetStore.recordProjectBoardSynthesisRunProgressiveRecords(run.id, records, {
    title: "Seeded semantic-idle retry dogfood records",
    summary: "Reused the completed Foundation section and resolved the previously stalled Combat section.",
  });
  applyProjectBoardIncrementalSynthesisFromRun({
    boardId,
    runId: run.id,
    fallback: dogfoodSemanticIdleDraftFallback(),
    model: "dogfood-semantic-idle-retry",
    startedAt: Date.now(),
    replaceExistingDraft: true,
    targetStore,
  });
  return targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: "board_applied",
    title: "Applied semantic-idle retry dogfood synthesis",
    summary: "Retry reused the completed Foundation section and added the missing Combat card.",
    metadata: {
      dogfood: "semantic_idle_section_retry",
      retryOfRunId,
      skippedSectionCount: 1,
      completedSectionCount: 2,
      failedSectionCount: 0,
      semanticIdleSectionCount: 0,
      cardCount: 2,
    },
    status: "succeeded",
    completedAt: new Date().toISOString(),
    cardCount: 2,
  });
}

function dogfoodSemanticIdleDraftFallback(): ProjectBoardSynthesisDraft {
  return {
    summary: "Dogfood semantic-idle section recovery proposal.",
    goal: "Prove stalled section recovery through the project-board app boundary.",
    currentState: "A sectioned board synthesis run produced one completed section and one semantic-idle stalled section.",
    targetUser: "Ambient project-board dogfood operator.",
    qualityBar: "Completed section work must be preserved while failed source coverage remains visible and retryable.",
    assumptions: ["This draft is E2E-only dogfood data."],
    questions: [],
    sourceNotes: [],
    cards: [],
  };
}

function upsertProjectBoardProgressiveProposalFromRun(input: {
  boardId: string;
  runId: string;
  fallback: ProjectBoardSynthesisDraft;
  model?: string;
  startedAt: number;
  targetStore?: ProjectStore;
}): ProjectBoardSynthesisProposal | undefined {
  const targetStore = input.targetStore ?? store;
  const records = projectBoardValidatedProgressiveRecordsFromRun(input.runId, targetStore);
  if (!records.some((record) => record.type === "candidate_card")) return undefined;
  let draft: ProjectBoardSynthesisDraft;
  try {
    draft = projectBoardSynthesisDraftFromProgressiveRecords(records, input.fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "schema_validation",
      title: "Progressive PM Review proposal not ready",
      summary: `Progressive section records were saved, but they do not yet form a reviewable proposal: ${message}`,
      metadata: { progressive: true, error: message, recordCount: records.length },
    });
    return undefined;
  }

  const existingRun = targetStore.getProjectBoardSynthesisRun(input.runId);
  const existingProposal =
    existingRun?.proposalId && existingRun.boardId === input.boardId ? targetStore.getProjectBoardSynthesisProposal(existingRun.proposalId) : undefined;
  const proposal =
    existingProposal?.status === "pending" && existingProposal.boardId === input.boardId
      ? targetStore.updateProjectBoardSynthesisProposal({
          proposalId: existingProposal.id,
          synthesis: draft,
          model: input.model,
          durationMs: Date.now() - input.startedAt,
        })
      : targetStore.createProjectBoardSynthesisProposal({
          boardId: input.boardId,
          synthesis: draft,
          model: input.model,
          durationMs: Date.now() - input.startedAt,
        });

  targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
    stage: "proposal_created",
    title: existingProposal ? "Updated live PM Review proposal" : "Created live PM Review proposal",
    summary: `Imported ${draft.cards.length} progressive card${draft.cards.length === 1 ? "" : "s"} and ${draft.questions.length} question${
      draft.questions.length === 1 ? "" : "s"
    } into a reviewable partial proposal.`,
    metadata: {
      proposalId: proposal.id,
      progressive: true,
      recordCount: records.length,
      cardCount: draft.cards.length,
      questionCount: draft.questions.length,
      sourceNoteCount: draft.sourceNotes.length,
    },
    proposalId: proposal.id,
    cardCount: draft.cards.length,
    questionCount: draft.questions.length,
  });
  return proposal;
}

function createOrUpdateProjectBoardSynthesisProposalForRun(input: {
  boardId: string;
  runId: string;
  synthesis: ProjectBoardSynthesisDraft;
  reviewReport?: ProjectBoardPmReviewReport;
  model?: string;
  durationMs?: number;
  targetStore?: ProjectStore;
}): ProjectBoardSynthesisProposal {
  const targetStore = input.targetStore ?? store;
  const run = targetStore.getProjectBoardSynthesisRun(input.runId);
  const existingProposal =
    run?.proposalId && run.boardId === input.boardId ? targetStore.getProjectBoardSynthesisProposal(run.proposalId) : undefined;
  if (existingProposal?.status === "pending" && existingProposal.boardId === input.boardId) {
    return targetStore.updateProjectBoardSynthesisProposal({
      proposalId: existingProposal.id,
      synthesis: input.synthesis,
      reviewReport: input.reviewReport,
      model: input.model,
      durationMs: input.durationMs,
    });
  }
  return targetStore.createProjectBoardSynthesisProposal({
    boardId: input.boardId,
    synthesis: input.synthesis,
    reviewReport: input.reviewReport,
    model: input.model,
    durationMs: input.durationMs,
  });
}

function applyPmReviewActivationProposalToDraftInbox(proposal: ProjectBoardSynthesisProposal, targetStore: ProjectStore = store): {
  autoAcceptedSourceIds: string[];
  acceptedSourceIds: string[];
  mergedSourceIds: string[];
  draftCardIds: string[];
} {
  let reviewedProposal = proposal;
  const autoAcceptedSourceIds: string[] = [];
  for (const card of proposal.cards) {
    if (card.reviewStatus !== "pending") continue;
    reviewedProposal = targetStore.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: card.sourceId,
      reviewStatus: "accepted",
      reason: "Accepted automatically by Generate Draft Board from the lightweight PM Review recommendation.",
    });
    autoAcceptedSourceIds.push(card.sourceId);
  }
  const acceptedSourceIds = reviewedProposal.cards.filter((card) => card.reviewStatus === "accepted").map((card) => card.sourceId);
  const mergedSourceIds = reviewedProposal.cards
    .filter((card) => card.reviewStatus === "merged" && card.mergeTargetCardId)
    .map((card) => card.sourceId);
  const actionableSourceIds = new Set([...acceptedSourceIds, ...mergedSourceIds]);
  const summary = targetStore.applyProjectBoardSynthesisProposal({ proposalId: proposal.id });
  const draftCardIds = summary.cards
    .filter((card) => card.status === "draft" && card.sourceKind === "board_synthesis" && actionableSourceIds.has(card.sourceId))
    .map((card) => card.id);
  return { autoAcceptedSourceIds, acceptedSourceIds, mergedSourceIds, draftCardIds };
}

function recordProjectBoardProofJudgmentRetryActivity(
  context: ProjectBoardProofJudgmentContext,
  progress: AmbientProjectBoardProofJudgmentProgress,
  targetStore: ProjectStore = store,
): boolean {
  if (!progress.transientRetry) return false;
  const retryAttempt = progress.retryAttempt ?? 0;
  const maxRetries = progress.maxRetries ?? 0;
  const retryDelayMs = progress.retryDelayMs ?? 0;
  const retryPosition =
    retryAttempt > 0 && maxRetries > 0 ? `attempt ${retryAttempt}/${maxRetries}` : "the next available attempt";
  const retryDelay = retryDelayMs > 0 ? ` after ${retryDelayMs.toLocaleString()}ms` : "";
  targetStore.recordProjectBoardCardRunProgressEvent({
    boardId: context.card.boardId,
    cardId: context.card.id,
    runId: context.run.id,
    title: "Retrying Pi proof judgment",
    summary: `Transient Ambient/Pi proof judgment failure; retrying ${retryPosition}${retryDelay}.`,
    metadata: {
      transientRetry: true,
      aggressiveRetries: progress.aggressiveRetries === true,
      retryAttempt: progress.retryAttempt,
      maxRetries: progress.maxRetries,
      retryDelayMs: progress.retryDelayMs,
      error: progress.retryError,
      fallbackToNonStream: progress.fallbackToNonStream === true,
      responseCharCount: progress.responseCharCount,
      requestDurationMs: progress.requestDurationMs,
    },
  });
  return true;
}

const activeProjectBoardProofJudgmentsByStore = new WeakMap<
  ProjectStore,
  Map<string, { controller: AbortController; promise: Promise<void> }>
>();

function activeProjectBoardProofJudgmentsForStore(
  targetStore: ProjectStore,
): Map<string, { controller: AbortController; promise: Promise<void> }> {
  let active = activeProjectBoardProofJudgmentsByStore.get(targetStore);
  if (!active) {
    active = new Map();
    activeProjectBoardProofJudgmentsByStore.set(targetStore, active);
  }
  return active;
}

async function reviewFinishedProjectBoardRun(
  runId: string,
  targetStoreOrOptions: ProjectStore | { restart?: boolean; reason?: string } = store,
  emitUpdate: () => void = emitDesktopState,
  options: { restart?: boolean; reason?: string } = {},
): Promise<void> {
  const targetStore = targetStoreOrOptions instanceof ProjectStore ? targetStoreOrOptions : store;
  const proofOptions = targetStoreOrOptions instanceof ProjectStore ? options : targetStoreOrOptions;
  const activeJudgments = activeProjectBoardProofJudgmentsForStore(targetStore);
  const active = activeJudgments.get(runId);
  if (active) {
    if (!proofOptions.restart) return active.promise;
    active.controller.abort(new Error("Proof judgment was restarted for this run."));
  }
  const controller = new AbortController();
  const promise = reviewFinishedProjectBoardRunOnce(runId, targetStore, emitUpdate, { ...proofOptions, controller }).finally(() => {
    if (activeJudgments.get(runId)?.controller === controller) activeJudgments.delete(runId);
  });
  activeJudgments.set(runId, { controller, promise });
  return promise;
}

async function reviewFinishedProjectBoardRunOnce(
  runId: string,
  targetStore: ProjectStore,
  emitUpdate: () => void,
  options: { controller: AbortController; reason?: string },
): Promise<void> {
  const context = targetStore.getProjectBoardProofReviewContextForRun(runId);
  if (!context) return;

  const model = targetStore.getDefaultSettings().model;
  const fallback = context.deterministicReview;
  const requireCurrentReview = Boolean(context.card.proofReview?.runId === runId);
  if (!targetStore.isProjectBoardProofReviewRunCurrent(runId, requireCurrentReview)) return;
  try {
    const result = await new AmbientProjectBoardProofJudgeProvider({
      model,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      signal: options.controller.signal,
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).judge({
      ...context,
      onProgress: (progress) => {
        if (requireCurrentReview && !targetStore.isProjectBoardProofReviewRunCurrent(runId, true)) {
          options.controller.abort(new Error("Proof judgment was superseded by a newer card state."));
          return;
        }
        if (recordProjectBoardProofJudgmentRetryActivity(context, progress, targetStore)) emitUpdate();
      },
    });
    targetStore.applyProjectBoardCardProofReview({
      runId,
      review: {
        status: result.judgment.status,
        summary: result.judgment.summary,
        satisfied: result.judgment.satisfied,
        missing: result.judgment.missing,
        followUpCardIds: [],
        runId,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model,
        confidence: result.judgment.confidence,
        evidenceQuality: result.judgment.evidenceQuality,
        recommendedAction: result.judgment.recommendedAction,
        deterministicStatus: fallback.status,
        deterministicSummary: fallback.summary,
        judgeDurationMs: result.telemetry.requestDurationMs,
        followUpSuggestion: result.judgment.followUpSuggestion,
      },
      requireCurrentReview,
    });
  } catch (error) {
    if (options.controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    targetStore.applyProjectBoardCardProofReview({
      runId,
      review: {
        ...fallback,
        reviewer: "deterministic",
        summary: `${fallback.summary} Ambient/Pi proof judgment was unavailable, so deterministic proof review was used. ${message}`.slice(0, 1_000),
      },
      requireCurrentReview,
    });
  }
  emitUpdate();
}

async function rerunProjectBoardProof(
  input: RerunProjectBoardProofInput,
  targetStore: ProjectStore = store,
  emitUpdate: () => void = emitDesktopState,
): Promise<void> {
  const card = targetStore.getProjectBoardCard(input.cardId);
  if (!card.orchestrationTaskId) throw new Error("Automatic proof can only be re-run for ticketized project-board cards.");
  const runs = targetStore.listOrchestrationRuns(200).filter((run) => run.taskId === card.orchestrationTaskId);
  const latestRun = runs[0];
  if (!latestRun) throw new Error("No Local Task run is available to re-run proof against.");
  if (["claimed", "prepared", "preparing", "running", "retry_queued"].includes(latestRun.status)) {
    throw new Error("Wait for the current Local Task run to finish before re-running automatic proof.");
  }
  if (!latestRun.proofOfWork) throw new Error("The latest Local Task run has no proof packet to judge.");
  const reason = input.reason?.trim();
  targetStore.recordProjectBoardCardRunProgressEvent({
    boardId: card.boardId,
    cardId: card.id,
    runId: latestRun.id,
    title: "Re-running Pi proof judgment",
    summary: reason
      ? `Automatic PM proof judgment was re-run. Reason: ${reason}`
      : "Automatic PM proof judgment was re-run for the latest proof packet.",
    metadata: {
      cardId: card.id,
      runId: latestRun.id,
      reason,
      modelCallRequired: true,
    },
  });
  emitUpdate();
  await reviewFinishedProjectBoardRun(latestRun.id, targetStore, emitUpdate, { restart: true, reason });
}

async function suggestProjectBoardProof(input: SuggestProjectBoardProofInput, targetStore: ProjectStore = store): Promise<void> {
  const board = targetStore.getProjectBoard(input.boardId);
  if (!board) throw new Error(`Project board not found: ${input.boardId}`);
  const explicitCardIds = input.cardIds?.length ? [...new Set(input.cardIds)] : undefined;
  const requestedCardIds =
    explicitCardIds ??
    board.cards
      .filter((card) => card.status !== "archived" && card.candidateStatus !== "duplicate" && card.candidateStatus !== "rejected" && card.candidateStatus !== "evidence")
      .filter((card) => projectBoardProofItemCount(card) === 0)
      .map((card) => card.id);
  const targetCardIds = requestedCardIds.slice(0, 12);
  const draftTargets = board.cards
    .filter((card) => targetCardIds.includes(card.id))
    .filter((card) => card.status === "draft" && !card.orchestrationTaskId)
    .filter((card) => card.candidateStatus !== "duplicate" && card.candidateStatus !== "rejected" && card.candidateStatus !== "evidence")
    .filter((card) => projectBoardProofItemCount(card) === 0)
    .slice(0, 12);

  if (targetCardIds.length === 0 || draftTargets.length === 0) {
    targetStore.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: [],
    });
    return;
  }

  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const requestStartedAt = Date.now();
  try {
    const result = await new AmbientProjectBoardProofSuggestionProvider({
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).suggest({
      boardTitle: board.title,
      charter: board.charter,
      cards: draftTargets,
    });
    targetStore.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: result.suggestions,
      model: providerStatus.model,
      telemetry: result.telemetry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: draftTargets.map(deterministicProjectBoardProofSuggestionForCard),
      model: providerStatus.model,
      telemetry: {
        promptCharCount: 0,
        responseCharCount: 0,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      fallbackUsed: true,
      providerError: message,
    });
  }
}

async function suggestProjectBoardClarificationDefaults(
  input: SuggestProjectBoardClarificationDefaultsInput,
  targetStore: ProjectStore = store,
): Promise<void> {
  const board = targetStore.getProjectBoard(input.boardId);
  if (!board) throw new Error(`Project board not found: ${input.boardId}`);
  const explicitCardIds = input.cardIds?.length ? [...new Set(input.cardIds)] : undefined;
  const targets = projectBoardClarificationDefaultSuggestionTargets(board.cards, {
    cardIds: explicitCardIds,
    limit: 12,
  });
  const targetCardIds = [...new Set((explicitCardIds ?? targets.map((target) => target.cardId)).filter(Boolean))].slice(0, 50);

  if (targets.length === 0) {
    targetStore.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: [],
    });
    return;
  }

  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const requestStartedAt = Date.now();
  try {
    const result = await new AmbientProjectBoardClarificationDefaultProvider({
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).suggest({
      boardTitle: board.title,
      charter: board.charter,
      targets,
    });
    targetStore.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: result.suggestions,
      model: providerStatus.model,
      telemetry: result.telemetry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: targets.map(deterministicProjectBoardClarificationDefaultSuggestionForTarget),
      model: providerStatus.model,
      telemetry: {
        promptCharCount: 0,
        responseCharCount: 0,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      fallbackUsed: true,
      providerError: message,
    });
  }
}

async function suggestProjectBoardKickoffDefaults(
  input: SuggestProjectBoardKickoffDefaultsInput,
  targetStore: ProjectStore = store,
  host?: ProjectRuntimeHost,
): Promise<void> {
  const emitUpdate = () => emitProjectBoardState(targetStore, host);
  const board = targetStore.getProjectBoard(input.boardId);
  if (!board) throw new Error(`Project board not found: ${input.boardId}`);
  if (board.status !== "draft") throw new Error("Kickoff defaults can only be suggested before the project board charter is active.");
  const explicitQuestionIds = input.questionIds?.length ? [...new Set(input.questionIds)] : undefined;
  const targets = projectBoardKickoffDefaultSuggestionTargets(board.questions, board.sources, {
    questionIds: explicitQuestionIds,
    limit: 8,
  });
  const targetQuestionIds = [...new Set((explicitQuestionIds ?? targets.map((target) => target.questionId)).filter(Boolean))].slice(0, 20);

  if (targets.length === 0) {
    targetStore.applyProjectBoardKickoffDefaultSuggestions({
      boardId: board.id,
      targetQuestionIds,
      suggestions: [],
    });
    return;
  }

  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const sourceTelemetry = projectBoardSourceTelemetry(board.sources);
  const contextBrief = buildProjectBoardKickoffContextBrief({
    questions: board.questions,
    sources: board.sources,
    generatedAt: new Date().toISOString(),
  });
  const contextBriefCharCount = JSON.stringify(contextBrief).length;
  const run = targetStore.createProjectBoardSynthesisRun({
    boardId: board.id,
    model: providerStatus.model,
    initialStage: "kickoff_defaults",
    initialTitle: "Kickoff default suggestions started",
    initialSummary: `Suggesting editable kickoff defaults one question at a time for ${targets.length} unanswered question${
      targets.length === 1 ? "" : "s"
    }.`,
    initialMetadata: {
      model: providerStatus.model,
      helper: "kickoff_defaults",
      targetQuestionIds,
      sequential: true,
      contextBriefCharCount,
      contextBriefSourceCount: contextBrief.sourceNotes.length,
      durablePlanSourceCount: contextBrief.durablePlanSourceIds.length,
    },
    ...sourceTelemetry,
  });
  emitUpdate();
  targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: "kickoff_defaults",
    title: "Prepared kickoff context brief",
    summary: `Condensed ${contextBrief.sourceNotes.length} source note${contextBrief.sourceNotes.length === 1 ? "" : "s"} into a ${contextBriefCharCount.toLocaleString()} character kickoff brief before asking per-question defaults.`,
    metadata: {
      helper: "kickoff_defaults",
      contextBriefCharCount,
      contextBriefSourceCount: contextBrief.sourceNotes.length,
      durablePlanSourceIds: contextBrief.durablePlanSourceIds,
      includedSourceCount: contextBrief.includedSourceCount,
      ignoredSourceCount: contextBrief.ignoredSourceCount,
    },
    ...sourceTelemetry,
  });
  emitUpdate();
  const progressEmitter = createProjectBoardRunProgressEmitter(run.id, { targetStore, host });
  const requestStartedAt = Date.now();
  const provider = new AmbientProjectBoardKickoffDefaultProvider({
    model: providerStatus.model,
    baseUrl: providerStatus.baseUrl,
    retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
    ...ambientChatCompletionTransportTimeoutsFromEnv(),
  });
  let cumulativePromptCharCount = 0;
  let cumulativeResponseCharCount = 0;
  const appliedQuestionIds: string[] = [];
  const skippedQuestionIds: string[] = [];
  let providerError: string | undefined;

  for (const [index, target] of targets.entries()) {
    const position = index + 1;
    let activePromptCharCount = 0;
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "kickoff_defaults",
      title: `Suggesting kickoff default ${position}/${targets.length}`,
      summary: target.question,
      metadata: {
        helper: "kickoff_defaults",
        questionId: target.questionId,
        question: target.question,
        position,
        total: targets.length,
        contextBriefCharCount,
      },
      ...sourceTelemetry,
      promptCharCount: cumulativePromptCharCount || undefined,
      responseCharCount: cumulativeResponseCharCount || undefined,
      questionCount: appliedQuestionIds.length,
    });
    emitUpdate();
    try {
      const result = await provider.suggest({
        boardTitle: board.title,
        boardSummary: board.summary,
        questions: board.questions,
        sources: board.sources,
        contextBrief,
        questionIds: [target.questionId],
        onProgress: (progress) => {
          if (typeof progress.promptCharCount === "number" && progress.promptCharCount > 0) {
            activePromptCharCount = progress.promptCharCount;
          }
          const promptCharCount = cumulativePromptCharCount + activePromptCharCount;
          if (
            recordProjectBoardDirectHelperRetryActivity({
              store: targetStore,
              runId: run.id,
              stage: "kickoff_defaults",
              title: "Retrying Pi kickoff default",
              helperLabel: "kickoff default suggestion",
              progress: {
                ...progress,
                promptCharCount: promptCharCount || progress.promptCharCount,
                responseCharCount: cumulativeResponseCharCount + progress.responseCharCount,
              },
              flushProgress: () => progressEmitter.flush(),
            })
          ) {
            emitUpdate();
            return;
          }
          progressEmitter.update({
            stage: "kickoff_defaults",
            model: providerStatus.model,
            ...sourceTelemetry,
            promptCharCount: promptCharCount || cumulativePromptCharCount || undefined,
            responseCharCount: cumulativeResponseCharCount + progress.responseCharCount,
            questionCount: appliedQuestionIds.length,
            warningCount: skippedQuestionIds.length,
          });
        },
      });
      progressEmitter.flush();
      cumulativePromptCharCount += result.telemetry.promptCharCount;
      cumulativeResponseCharCount += result.telemetry.responseCharCount;
      const suggested = result.suggestions.filter((suggestion) => suggestion.questionId === target.questionId);
      const summary = targetStore.applyProjectBoardKickoffDefaultSuggestions({
        boardId: board.id,
        targetQuestionIds: [target.questionId],
        suggestions: suggested,
        model: providerStatus.model,
        telemetry: result.telemetry,
      });
      const applied = summary.questions.find((question) => question.id === target.questionId && question.suggestedAnswer?.trim());
      if (applied) appliedQuestionIds.push(target.questionId);
      else skippedQuestionIds.push(target.questionId);
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "kickoff_defaults",
        title: applied ? `Saved kickoff default ${position}/${targets.length}` : `No kickoff default returned ${position}/${targets.length}`,
        summary: applied
          ? `Ambient/Pi suggested an editable default for "${target.question}".`
          : `Ambient/Pi did not return a default for "${target.question}".`,
        metadata: {
          helper: "kickoff_defaults",
          questionId: target.questionId,
          question: target.question,
          position,
          total: targets.length,
          applied: Boolean(applied),
          telemetry: result.telemetry,
        },
        ...sourceTelemetry,
        promptCharCount: cumulativePromptCharCount,
        responseCharCount: cumulativeResponseCharCount,
        questionCount: appliedQuestionIds.length,
        warningCount: skippedQuestionIds.length,
      });
      emitUpdate();
    } catch (error) {
      progressEmitter.flush();
      providerError = error instanceof Error ? error.message : String(error);
      const remainingQuestionIds = targets.slice(index).map((remaining) => remaining.questionId);
      skippedQuestionIds.push(...remainingQuestionIds.filter((questionId) => !skippedQuestionIds.includes(questionId)));
      targetStore.applyProjectBoardKickoffDefaultSuggestions({
        boardId: board.id,
        targetQuestionIds: remainingQuestionIds,
        suggestions: [],
        model: providerStatus.model,
        telemetry: {
          promptCharCount: cumulativePromptCharCount + activePromptCharCount,
          responseCharCount: 0,
          requestDurationMs: Date.now() - requestStartedAt,
        },
        providerError,
      });
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "failed",
        title: "Pi kickoff defaults failed",
        summary: providerError,
        metadata: {
          helper: "kickoff_defaults",
          questionId: target.questionId,
          remainingQuestionIds,
          appliedQuestionIds,
          skippedQuestionIds,
          error: providerError,
        },
        ...sourceTelemetry,
        promptCharCount: cumulativePromptCharCount + activePromptCharCount || undefined,
        responseCharCount: cumulativeResponseCharCount || undefined,
        questionCount: appliedQuestionIds.length,
        warningCount: skippedQuestionIds.length,
        status: "failed",
        error: providerError,
        completedAt: new Date().toISOString(),
        skipPlanningSnapshot: true,
      });
      emitUpdate();
      break;
    }
  }

  if (!providerError) {
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "kickoff_defaults",
      title: "Kickoff default suggestions finished",
      summary: `Applied ${appliedQuestionIds.length} of ${targets.length} editable kickoff default${targets.length === 1 ? "" : "s"}.`,
      metadata: {
        helper: "kickoff_defaults",
        targetQuestionIds,
        appliedQuestionIds,
        skippedQuestionIds,
        sequential: true,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      ...sourceTelemetry,
      promptCharCount: cumulativePromptCharCount,
      responseCharCount: cumulativeResponseCharCount,
      questionCount: appliedQuestionIds.length,
      warningCount: skippedQuestionIds.length,
      status: "succeeded",
      completedAt: new Date().toISOString(),
      skipPlanningSnapshot: true,
    });
    emitUpdate();
  }
}

async function regenerateProjectBoardDecisionDrafts(
  input: RegenerateProjectBoardDecisionDraftsInput,
  targetStore: ProjectStore = store,
): Promise<void> {
  const current = targetStore.getProjectBoardCard(input.cardId);
  if (current.status !== "draft" || current.orchestrationTaskId) {
    throw new Error("Decision draft Pi refresh must start from a draft clarification card before ticketization.");
  }
  const board = targetStore.getProjectBoard(current.boardId);
  if (!board) throw new Error(`Project board not found: ${current.boardId}`);
  const targetCards = projectBoardDecisionDraftRefreshTargets(board, input).slice(0, 8);
  if (targetCards.length === 0) {
    targetStore.stageProjectBoardDecisionDraftPiUpdates({
      ...input,
      suggestions: [],
      fallbackUsed: true,
      providerError: "No affected draft cards matched this decision.",
      telemetry: { promptCharCount: 0, responseCharCount: 0, requestDurationMs: 0 },
    });
    return;
  }

  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const requestStartedAt = Date.now();
  try {
    const result = await new AmbientProjectBoardDecisionDraftRefreshProvider({
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).refresh({
      boardTitle: board.title,
      charter: board.charter,
      question: input.question,
      answer: input.answer,
      cards: targetCards,
    });
    targetStore.stageProjectBoardDecisionDraftPiUpdates({
      ...input,
      suggestions: result.suggestions,
      model: providerStatus.model,
      telemetry: result.telemetry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.stageProjectBoardDecisionDraftPiUpdates({
      ...input,
      suggestions: targetCards.map((card) => deterministicProjectBoardDecisionDraftRefreshSuggestionForCard(card, input)),
      model: providerStatus.model,
      telemetry: {
        promptCharCount: 0,
        responseCharCount: 0,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      fallbackUsed: true,
      providerError: message,
    });
  }
}

function projectBoardDecisionDraftRefreshTargets(
  board: NonNullable<ProjectSummary["board"]>,
  input: RegenerateProjectBoardDecisionDraftsInput,
): ProjectBoardCard[] {
  const impact = projectBoardDecisionImpactPreview(board, {
    question: input.question,
    answer: input.answer,
    answeredCardId: input.cardId,
  });
  const targetIds = new Set(
    impact.cards
      .filter((card) => card.state === "draft_unblocked" || card.state === "draft_still_blocked" || card.state === "duplicate_hidden")
      .map((card) => card.cardId),
  );
  targetIds.add(input.cardId);
  return board.cards
    .filter((card) => targetIds.has(card.id))
    .filter((card) => card.status === "draft" && !card.orchestrationTaskId);
}

async function regenerateProjectBoardSourceDrafts(
  input: RegenerateProjectBoardSourceDraftsInput,
  targetStore: ProjectStore = store,
): Promise<void> {
  const board = targetStore.getProjectBoard(input.boardId);
  if (!board) throw new Error(`Project board not found: ${input.boardId}`);
  const context = projectBoardSourceDraftRefreshContext(board, input);
  const targetCards = context.targetCards.slice(0, 8);
  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const requestStartedAt = Date.now();

  if (targetCards.length === 0) {
    targetStore.stageProjectBoardSourceDraftPiUpdates({
      ...input,
      suggestions: [],
      model: providerStatus.model,
      telemetry: { promptCharCount: 0, responseCharCount: 0, requestDurationMs: 0 },
      fallbackUsed: true,
      providerError: "No affected draft cards matched this source impact.",
    });
    return;
  }

  try {
    const result = await new AmbientProjectBoardSourceDraftRefreshProvider({
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).refresh({
      boardTitle: board.title,
      charter: board.charter,
      sources: context.sources,
      sourceChangeSummary: context.sourceChangeSummary,
      cards: targetCards,
    });
    targetStore.stageProjectBoardSourceDraftPiUpdates({
      ...input,
      suggestions: result.suggestions,
      model: providerStatus.model,
      telemetry: result.telemetry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.stageProjectBoardSourceDraftPiUpdates({
      ...input,
      suggestions: targetCards.map((card) =>
        deterministicProjectBoardSourceDraftRefreshSuggestionForCard(card, { sourceChangeSummary: context.sourceChangeSummary }),
      ),
      model: providerStatus.model,
      telemetry: {
        promptCharCount: 0,
        responseCharCount: 0,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      fallbackUsed: true,
      providerError: message,
    });
  }
}

function projectBoardSourceDraftRefreshContext(
  board: NonNullable<ProjectSummary["board"]>,
  input: RegenerateProjectBoardSourceDraftsInput,
): { targetCards: ProjectBoardCard[]; sources: ProjectBoardSource[]; sourceChangeSummary: string } {
  const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
  const records: Array<{
    eventId?: string;
    sourceId: string;
    groupSourceIds: string[];
    affectedDraftCardIds: string[];
    detail?: string;
    recommendedAction?: string;
    selectedObservationCount?: number;
  }> = [];
  const seenKeys = new Set<string>();
  for (const event of board.events ?? []) {
    if (event.kind !== "source_updated") continue;
    const impact = (event.metadata as {
      sourceImpact?: {
        sourceId?: unknown;
        groupSourceIds?: unknown;
        affectedDraftCardIds?: unknown;
        targetedRefreshOptional?: unknown;
        detail?: unknown;
        recommendedAction?: unknown;
        selectedObservationCount?: unknown;
      };
    }).sourceImpact;
    if (impact?.targetedRefreshOptional !== true || typeof impact.sourceId !== "string") continue;
    const groupSourceIds = Array.isArray(impact.groupSourceIds)
      ? impact.groupSourceIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    if (input.sourceImpactEventId && event.id !== input.sourceImpactEventId) continue;
    if (selectedSourceIds.size > 0 && ![impact.sourceId, ...groupSourceIds].some((id) => selectedSourceIds.has(id))) continue;
    const affectedDraftCardIds = Array.isArray(impact.affectedDraftCardIds)
      ? impact.affectedDraftCardIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    const key = (groupSourceIds.length > 0 ? groupSourceIds : [impact.sourceId]).slice().sort().join("|");
    if (!input.sourceImpactEventId && seenKeys.has(key)) continue;
    seenKeys.add(key);
    records.push({
      eventId: event.id,
      sourceId: impact.sourceId,
      groupSourceIds,
      affectedDraftCardIds,
      detail: typeof impact.detail === "string" ? impact.detail : undefined,
      recommendedAction: typeof impact.recommendedAction === "string" ? impact.recommendedAction : undefined,
      selectedObservationCount: typeof impact.selectedObservationCount === "number" ? impact.selectedObservationCount : undefined,
    });
  }

  const sourceIds = records.length > 0
    ? [...new Set(records.flatMap((record) => record.groupSourceIds.length > 0 ? record.groupSourceIds : [record.sourceId]))]
    : [...selectedSourceIds];
  const affectedDraftCardIds = records.length > 0
    ? new Set(records.flatMap((record) => record.affectedDraftCardIds))
    : new Set<string>();
  const sources = board.sources.filter((source) => sourceIds.includes(source.id));
  const targetCards = board.cards
    .filter((card) => card.status === "draft" && !card.orchestrationTaskId)
    .filter((card) => {
      if (affectedDraftCardIds.size > 0) return affectedDraftCardIds.has(card.id);
      if (sourceIds.length === 0) return false;
      return sourceIds.some((sourceId) => card.sourceRefs?.includes(sourceId) || card.sourceId === sourceId);
    });
  const sourceLabels = sources.slice(0, 6).map((source) => {
    const role = source.authorityRole ?? (source.includeInSynthesis ? "context" : "ignored");
    return `${source.title} (${role}${source.includeInSynthesis ? ", included" : ", excluded"})`;
  });
  const sourceChangeSummary = [
    records.map((record) => record.detail).filter(Boolean).join(" "),
    sourceLabels.length > 0 ? `Impacted sources: ${sourceLabels.join("; ")}.` : "",
    records.length > 0
      ? `Source-impact events: ${records.map((record) => record.eventId).filter(Boolean).join(", ") || "direct source selection"}.`
      : "Direct selected-source refresh.",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    targetCards,
    sources,
    sourceChangeSummary: sourceChangeSummary || "Source authority changed for selected source context.",
  };
}

function projectBoardProofItemCount(card: ProjectBoardCard): number {
  return card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length;
}

function permanentWorktreeBranchName(projectPath: string): string {
  const slug = (basename(projectPath) || "project")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `codex/${slug || "project"}-worktree-${Date.now().toString(36)}`;
}

function initialActiveThreadIdForStore(targetStore: ProjectStore): string {
  const threads = targetStore.listThreads();
  const persistedThreadId = targetStore.getLastActiveThreadId();
  if (persistedThreadId && threads.some((thread) => thread.id === persistedThreadId)) return persistedThreadId;
  const active = threads[0]?.id;
  if (!active) throw new Error("No active thread");
  targetStore.setLastActiveThreadId(active);
  return active;
}

function initialActiveThreadId(): string {
  return initialActiveThreadIdForStore(store);
}

function workflowAutoDispatchDisabledMessage(workflowPath: string): string {
  return `${workflowPath} has orchestration.auto_dispatch set to false.`;
}

function executionReadinessBlockerTitle(
  source: "auto_dispatch" | "manual_prepare",
  blocker: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled" | "auto_dispatch_error" | "prepare_error",
): string {
  if (blocker === "missing_workflow") return "Execution blocked: missing WORKFLOW.md";
  if (blocker === "invalid_workflow") return "Execution blocked: invalid WORKFLOW.md";
  if (blocker === "auto_dispatch_disabled") return "Execution blocked: auto-dispatch disabled";
  return source === "manual_prepare" ? "Run preparation failed" : "Auto-dispatch failed";
}

async function recordActiveProjectBoardExecutionReadinessBlocker(input: {
  source: "auto_dispatch" | "manual_prepare";
  blocker?: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled" | "auto_dispatch_error" | "prepare_error";
  error?: unknown;
  title?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}, targetStore: ProjectStore = store): Promise<void> {
  const board = targetStore.getActiveProjectBoard();
  if (!board) return;
  const workspacePath = targetStore.getWorkspace().path;
  const errorMessage = input.error instanceof Error ? input.error.message : input.error === undefined ? undefined : String(input.error);
  try {
    const workflowReadiness = await readOrchestrationWorkflowReadiness(workspacePath);
    const workflowPath = workflowReadiness.path || join(workspacePath, "WORKFLOW.md");
    const blocker =
      input.blocker ??
      (workflowReadiness.status === "missing"
        ? "missing_workflow"
        : workflowReadiness.status === "invalid"
          ? "invalid_workflow"
          : workflowReadiness.status === "ready" && workflowReadiness.autoDispatch === false
            ? "auto_dispatch_disabled"
            : input.source === "manual_prepare"
              ? "prepare_error"
              : "auto_dispatch_error");
    const readinessSummary =
      blocker === "missing_workflow"
        ? `Ready Local Tasks could not be prepared because ${workflowPath} is missing.`
        : blocker === "invalid_workflow"
          ? `Ready Local Tasks could not be prepared because ${workflowPath} is invalid: ${workflowReadiness.message ?? errorMessage ?? "validation failed"}.`
          : blocker === "auto_dispatch_disabled"
            ? `Ready Local Tasks are not being started automatically because ${workflowAutoDispatchDisabledMessage(workflowPath)}`
            : `${input.source === "manual_prepare" ? "Manual run preparation" : "Auto-dispatch"} failed before ready work could start: ${errorMessage ?? "Unknown error"}.`;
    const result = targetStore.recordProjectBoardExecutionReadinessBlocker({
      boardId: board.id,
      source: input.source,
      blocker,
      title: input.title ?? executionReadinessBlockerTitle(input.source, blocker),
      summary: input.summary ?? readinessSummary,
      workflowPath,
      error: errorMessage,
      metadata: {
        workflowStatus: workflowReadiness.status,
        workflowHash: workflowReadiness.workflowHash,
        workflowCode: workflowReadiness.code,
        workflowAutoDispatch: workflowReadiness.autoDispatch,
        workflowMaxConcurrentAgents: workflowReadiness.maxConcurrentAgents,
        workflowWorkspaceStrategy: workflowReadiness.workspaceStrategy,
        ...input.metadata,
      },
    });
    if (result.recorded) {
      if (targetStore === store) {
        mainWindow?.webContents.send("desktop:event", { type: "state", state: readState() });
      } else {
        emitOrchestrationUpdated(workspacePath);
      }
    }
  } catch (recordError) {
    console.warn(
      `[project-board] Failed to record execution readiness blocker: ${
        recordError instanceof Error ? recordError.message : String(recordError)
      }`,
    );
  }
}

function requireActiveProjectRuntimeHost(): ProjectRuntimeHost {
  if (!activeHost) throw new Error("No active project runtime host.");
  return activeHost;
}

function activeProjectIpcContext() {
  const host = requireActiveProjectRuntimeHost();
  const targetStore = host.store;
  const thread = targetStore.getThread(activeThreadIdForHost(host));
  return { host, targetStore, targetBrowserService: host.browserService, thread };
}

function workflowProjectIpcContext(input: { projectPath?: string }) {
  const host = input.projectPath ? ensureProjectRuntimeHostForWorkspacePath(input.projectPath) : requireActiveProjectRuntimeHost();
  const targetStore = host.store;
  const thread = targetStore.getThread(activeThreadIdForHost(host));
  const projectPath = normalizeWorkspacePath(input.projectPath ?? targetStore.getWorkspace().path);
  return { host, targetStore, targetBrowserService: host.browserService, thread, projectPath };
}

function workflowAgentIpcContextForWorkflowThread(workflowThreadId: string) {
  const host = requireProjectRuntimeHostForWorkflowThread(workflowThreadId);
  const targetStore = host.store;
  const thread = targetStore.getThread(activeThreadIdForHost(host));
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(workflowThreadId);
  const projectPath = normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
  return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, projectPath };
}

function workflowAgentIpcContextForDiscoveryQuestion(questionId: string) {
  const host = requireProjectRuntimeHostForWorkflowDiscoveryQuestion(questionId);
  const targetStore = host.store;
  const thread = targetStore.getThread(activeThreadIdForHost(host));
  const question = targetStore.getWorkflowDiscoveryQuestion(questionId);
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(question.workflowThreadId);
  const projectPath = normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
  return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, question, projectPath };
}

function workflowAgentControlThread(
  targetStore: ProjectStore,
  fallbackThread: ThreadSummary,
  workflowThread: ReturnType<ProjectStore["getWorkflowAgentThreadSummary"]>,
  projectPath: string,
): ThreadSummary {
  const baseThread = workflowThread.chatThreadId ? targetStore.getThread(workflowThread.chatThreadId) : fallbackThread;
  return { ...baseThread, workspacePath: projectPath };
}

function workflowArtifactIpcContextForHost(host: ProjectRuntimeHost, artifactId: string) {
  const targetStore = host.store;
  const activeThread = targetStore.getThread(activeThreadIdForHost(host));
  const artifact = targetStore.getWorkflowArtifact(artifactId);
  const workflowThread = artifact.workflowThreadId ? targetStore.getWorkflowAgentThreadSummary(artifact.workflowThreadId) : undefined;
  const projectPath = normalizeWorkspacePath(workflowThread?.projectPath || targetStore.getWorkspace().path);
  const thread = workflowThread
    ? workflowAgentControlThread(targetStore, activeThread, workflowThread, projectPath)
    : { ...activeThread, workspacePath: projectPath };
  return { host, targetStore, targetBrowserService: host.browserService, thread, artifact, workflowThread, projectPath };
}

function workflowArtifactIpcContext(artifactId: string) {
  return workflowArtifactIpcContextForHost(requireProjectRuntimeHostForWorkflowArtifact(artifactId), artifactId);
}

function workflowCompileIpcContext(input: { workflowThreadId?: string; revisionId?: string }) {
  if (input.workflowThreadId) {
    const context = workflowAgentIpcContextForWorkflowThread(input.workflowThreadId);
    if (input.revisionId) {
      const revision = context.targetStore.getWorkflowRevision(input.revisionId);
      if (revision.workflowThreadId !== input.workflowThreadId) {
        throw new Error(`Workflow revision ${revision.id} does not belong to workflow thread ${input.workflowThreadId}.`);
      }
    }
    return {
      ...context,
      thread: workflowAgentControlThread(context.targetStore, context.thread, context.workflowThread, context.projectPath),
    };
  }
  if (input.revisionId) {
    const host = requireProjectRuntimeHostForWorkflowRevision(input.revisionId);
    const revision = host.store.getWorkflowRevision(input.revisionId);
    const context = workflowAgentIpcContextForWorkflowThread(revision.workflowThreadId);
    return {
      ...context,
      thread: workflowAgentControlThread(context.targetStore, context.thread, context.workflowThread, context.projectPath),
    };
  }
  const context = activeProjectIpcContext();
  const projectPath = normalizeWorkspacePath(context.thread.workspacePath || context.targetStore.getWorkspace().path);
  return { ...context, projectPath, thread: { ...context.thread, workspacePath: projectPath } };
}

function workflowDebugRewriteIpcContext(input: { runId: string; eventId?: string; userNotes?: string }) {
  const host = requireProjectRuntimeHostForWorkflowRun(input.runId);
  const targetStore = host.store;
  const debugContext = buildWorkflowDebugRewriteContext(targetStore, input);
  if (!debugContext.workflowThreadId) {
    throw new Error("Debug rewrite requires the failed workflow to belong to a Workflow Agent thread.");
  }
  const workflowThread = targetStore.getWorkflowAgentThreadSummary(debugContext.workflowThreadId);
  const projectPath = normalizeWorkspacePath(workflowThread.projectPath || targetStore.getWorkspace().path);
  const activeThread = targetStore.getThread(activeThreadIdForHost(host));
  const thread = workflowAgentControlThread(targetStore, activeThread, workflowThread, projectPath);
  return { host, targetStore, targetBrowserService: host.browserService, thread, workflowThread, debugContext, projectPath };
}

function isActiveProjectRuntimeHost(host: ProjectRuntimeHost): boolean {
  return activeHost === host;
}

function emitProjectScopedEvent(host: ProjectRuntimeHost, event: DesktopEvent): void {
  mainWindow?.webContents.send("desktop:event", { ...event, workspacePath: host.workspacePath } as DesktopEvent);
}

function emitProjectStateIfActive(host: ProjectRuntimeHost, threadId = host.activeThreadId): void {
  if (!isActiveProjectRuntimeHost(host)) return;
  mainWindow?.webContents.send("desktop:event", { type: "state", state: readState(threadId) });
}

function emitWorkflowRecordingLibraryStateChanged(host: ProjectRuntimeHost, threadId = host.activeThreadId): void {
  if (isActiveProjectRuntimeHost(host)) {
    emitProjectStateIfActive(host, threadId);
    return;
  }
  mainWindow?.webContents.send("desktop:event", {
    type: "state",
    state: readState(activeThreadId, { markActiveRead: false }),
  });
}

function readStateForProjectHostAction(host: ProjectRuntimeHost, threadId = host.activeThreadId): DesktopState {
  return isActiveProjectRuntimeHost(host) ? readState(threadId) : readState();
}

function activeThreadIdForHost(host: ProjectRuntimeHost): string {
  try {
    host.store.getThread(host.activeThreadId);
    return host.activeThreadId;
  } catch {
    return setProjectHostActiveThreadId(host, initialActiveThreadIdForStore(host.store));
  }
}

function assertProjectBoardMutationAllowedForActiveThread(host: ProjectRuntimeHost, action: string): void {
  const activeThread = host.store.getThread(activeThreadIdForHost(host));
  if (!activeThread.workflowRecording) return;
  throw new Error(`Project boards are unavailable in Workflow Recording chats. Switch to a normal project chat to ${action}.`);
}

async function readAutoDispatchStatus(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): Promise<OrchestrationAutoDispatchStatus> {
  const dispatch = host.autoDispatch;
  try {
    const workflow = await loadWorkflowFile(join(host.store.getWorkspace().path, "WORKFLOW.md"));
    const workflowAllows = workflow.config.orchestration.autoDispatch;
    return {
      enabled: dispatch.enabled,
      workflowAllows,
      pollIntervalMs: workflow.config.orchestration.pollIntervalMs,
      inFlight: dispatch.inFlight,
      lastTickAt: dispatch.lastTickAt,
      lastError: dispatch.lastError ?? (dispatch.enabled && !workflowAllows ? workflowAutoDispatchDisabledMessage(workflow.path) : undefined),
      lastStartedRunIds: dispatch.lastStartedRunIds,
      lastStartedRuns: dispatch.lastStartedRuns,
    };
  } catch (error) {
    return {
      enabled: dispatch.enabled,
      workflowAllows: true,
      inFlight: dispatch.inFlight,
      lastTickAt: dispatch.lastTickAt,
      lastError: dispatch.lastError ?? (dispatch.enabled ? (error instanceof Error ? error.message : String(error)) : undefined),
      lastStartedRunIds: dispatch.lastStartedRunIds,
      lastStartedRuns: dispatch.lastStartedRuns,
    };
  }
}

function stopAutoDispatch(reason?: string, host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): void {
  const dispatch = host.autoDispatch;
  dispatch.enabled = false;
  dispatch.inFlight = false;
  dispatch.lastStartedRunIds = [];
  dispatch.lastStartedRuns = [];
  if (reason) dispatch.lastError = reason;
  if (dispatch.timer) clearTimeout(dispatch.timer);
  dispatch.timer = undefined;
}

function stopAllAutoDispatch(reason?: string): void {
  for (const host of projectRuntimeHostList()) stopAutoDispatch(reason, host);
}

function projectRuntimeHostForTerminal(terminalId: string): ProjectRuntimeHost | undefined {
  return projectRuntimeHostList().find((host) => host.terminals.has(terminalId));
}

function projectRuntimeHostForThread(threadId: string): ProjectRuntimeHost | undefined {
  return projectRuntimeHostList().find((host) => {
    try {
      host.store.getThread(threadId);
      return true;
    } catch {
      return false;
    }
  });
}

function requireProjectRuntimeHostForThread(threadId: string): ProjectRuntimeHost {
  const host = projectRuntimeHostForThread(threadId);
  if (host) return host;
  const active = requireActiveProjectRuntimeHost();
  active.store.getThread(threadId);
  return active;
}

function projectRuntimeHostForStoreRecord(assertRecordExists: (targetStore: ProjectStore) => void): ProjectRuntimeHost | undefined {
  const loadedHost = projectRuntimeHostList().find((host) => {
    try {
      assertRecordExists(host.store);
      return true;
    } catch {
      return false;
    }
  });
  if (loadedHost) return loadedHost;
  if (activeHost) {
    try {
      assertRecordExists(activeHost.store);
      return activeHost;
    } catch {
      // Registered-project probing below can locate records that are not loaded yet.
    }
  }
  return projectRuntimeHostForRegisteredStoreRecord(assertRecordExists);
}

function projectRuntimeHostForRegisteredStoreRecord(assertRecordExists: (targetStore: ProjectStore) => void): ProjectRuntimeHost | undefined {
  const loadedPaths = new Set(projectRuntimeHostList().map((host) => normalizeWorkspacePath(host.workspacePath)));
  if (activeHost) loadedPaths.add(normalizeWorkspacePath(activeHost.workspacePath));
  for (const workspacePath of projectRegistry.listRegisteredPaths()) {
    const normalized = normalizeWorkspacePath(workspacePath);
    if (loadedPaths.has(normalized) || !existsSync(normalized)) continue;
    const probeStore = new ProjectStore();
    try {
      const workspace = probeStore.openWorkspace(normalized, {
        recoverActiveRuns: false,
        recoverOrchestrationRuns: false,
      });
      assertRecordExists(probeStore);
      return ensureProjectRuntimeHostForWorkspacePath(workspace.path);
    } catch {
      // Most registered projects will not own the requested record.
    } finally {
      probeStore.close();
    }
  }
  return undefined;
}

function requireProjectRuntimeHostForStoreRecord(assertRecordExists: (targetStore: ProjectStore) => void): ProjectRuntimeHost {
  const host = projectRuntimeHostForStoreRecord(assertRecordExists);
  if (host) return host;
  const active = requireActiveProjectRuntimeHost();
  assertRecordExists(active.store);
  return active;
}

function requireProjectRuntimeHostForWorkflowThread(workflowThreadId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getWorkflowAgentThreadSummary(workflowThreadId);
  });
}

function requireProjectRuntimeHostForWorkflowRecording(workflowRecordingId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.describeWorkflowRecording(workflowRecordingId, { includeArchived: true });
  });
}

function requireProjectRuntimeHostForWorkflowLabRun(runId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getWorkflowLabRun(runId);
  });
}

interface WorkflowGlobalStoreRef {
  workspacePath: string;
  store: ProjectStore;
  dispose?: () => void;
}

function workflowGlobalStoreRefs(): WorkflowGlobalStoreRef[] {
  const refs: WorkflowGlobalStoreRef[] = [];
  const seen = new Set<string>();
  const addRef = (workspacePath: string, targetStore: ProjectStore, dispose?: () => void): boolean => {
    const normalized = normalizeWorkspacePath(workspacePath);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    refs.push({ workspacePath: normalized, store: targetStore, ...(dispose ? { dispose } : {}) });
    return true;
  };

  for (const host of projectRuntimeHostList()) addRef(host.workspacePath, host.store);
  if (activeHost) addRef(activeHost.workspacePath, activeHost.store);
  try {
    if (store) addRef(store.getWorkspace().path, store);
  } catch {
    // Store globals are not initialized during early startup.
  }

  for (const workspacePath of projectRegistry.listRegisteredPaths()) {
    const normalized = normalizeWorkspacePath(workspacePath);
    if (seen.has(normalized) || !existsSync(normalized)) continue;
    const targetStore = new ProjectStore();
    try {
      const workspace = targetStore.openWorkspace(normalized, {
        recoverActiveRuns: false,
        recoverOrchestrationRuns: false,
      });
      if (!addRef(workspace.path, targetStore, () => targetStore.close())) targetStore.close();
    } catch (error) {
      targetStore.close();
      console.warn(`Failed to read registered workflow project ${normalized}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return refs;
}

function withWorkflowGlobalStores<T>(operation: (stores: WorkflowRecordingLibraryStore[]) => T): T {
  const refs = workflowGlobalStoreRefs();
  try {
    return operation(refs.map((ref) => ref.store));
  } finally {
    for (const ref of refs) ref.dispose?.();
  }
}

function listGlobalWorkflowRecordingLibrary(input: SearchWorkflowRecordingsInput = {}): WorkflowRecordingLibraryEntry[] {
  return withWorkflowGlobalStores((stores) => listWorkflowRecordingLibraryAcrossStores(stores, input));
}

function listGlobalWorkflowAgentFolders(): WorkflowAgentFolderSummary[] {
  return withWorkflowGlobalStores((stores) => listWorkflowAgentFoldersAcrossStores(stores));
}

function searchGlobalAmbientWorkflowPlaybooks(input: AmbientWorkflowsSearchInput = {}): AmbientWorkflowsSearchResponse {
  return withWorkflowGlobalStores((stores) => searchAmbientWorkflowPlaybooksAcrossStores(stores, input));
}

function describeGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsDescribeInput): AmbientWorkflowPlaybookDescription {
  const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
  return describeAmbientWorkflowPlaybook(host.store, input);
}

function injectGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsInjectInput): AmbientWorkflowPlaybookInjection {
  const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
  return injectAmbientWorkflowPlaybook(host.store, input);
}

function updateGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsUpdateInput): AmbientWorkflowPlaybookDescription {
  const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
  const result = updateAmbientWorkflowPlaybook(host.store, input);
  emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
  return result;
}

function archiveGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsArchiveInput): AmbientWorkflowPlaybookDescription {
  const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
  const result = archiveAmbientWorkflowPlaybook(host.store, input);
  emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
  return result;
}

function unarchiveGlobalAmbientWorkflowPlaybook(input: AmbientWorkflowsUnarchiveInput): AmbientWorkflowPlaybookDescription {
  const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
  const result = unarchiveAmbientWorkflowPlaybook(host.store, input);
  emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
  return result;
}

function restoreGlobalAmbientWorkflowPlaybookVersion(input: AmbientWorkflowsRestoreVersionInput): AmbientWorkflowPlaybookDescription {
  const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
  const result = restoreAmbientWorkflowPlaybookVersion(host.store, input);
  emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
  return result;
}

function requireProjectRuntimeHostForWorkflowDiscoveryQuestion(questionId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getWorkflowDiscoveryQuestion(questionId);
  });
}

function requireProjectRuntimeHostForWorkflowVersion(versionId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getWorkflowVersion(versionId);
  });
}

function projectRuntimeHostForKnownWorkspacePath(workspacePath: string): ProjectRuntimeHost | undefined {
  const normalized = normalizeWorkspacePath(workspacePath);
  return projectRuntimeHostList().find((host) => {
    if (normalizeWorkspacePath(host.workspacePath) === normalized) return true;
    if (normalizeWorkspacePath(host.store.getProjectArtifactWorkspacePath()) === normalized) return true;
    return host.store.listThreads().some((thread) => normalizeWorkspacePath(thread.workspacePath) === normalized);
  });
}

function requireProjectRuntimeHostForPermissionGrantInput(input: CreateAmbientPermissionGrantInput): ProjectRuntimeHost {
  if (input.threadId) return requireProjectRuntimeHostForThread(input.threadId);
  if (input.workflowThreadId) return requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
  if (input.projectPath) return ensureProjectRuntimeHostForWorkspacePath(input.projectPath);
  if (input.workspacePath) {
    const host = projectRuntimeHostForKnownWorkspacePath(input.workspacePath);
    if (host) return host;
  }
  return requireActiveProjectRuntimeHost();
}

function requireProjectRuntimeHostForPermissionGrant(grantId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getPermissionGrant(grantId);
  });
}

function projectRuntimeHostsForAutomationFolder(folderId: string): ProjectRuntimeHost[] {
  return projectRuntimeHostList().filter((host) => host.store.listAutomationFolders().some((folder) => folder.id === folderId));
}

function requireProjectRuntimeHostForAutomationFolder(folderId: string, fallbackHost = requireActiveProjectRuntimeHost()): ProjectRuntimeHost {
  const hosts = projectRuntimeHostsForAutomationFolder(folderId);
  if (hosts.length === 1) return hosts[0];
  if (hosts.includes(fallbackHost)) return fallbackHost;
  if (hosts.length > 1) throw new Error(`Automation folder is ambiguous across loaded projects: ${folderId}`);
  if (!fallbackHost.store.listAutomationFolders().some((folder) => folder.id === folderId)) {
    throw new Error(`Automation folder not found: ${folderId}`);
  }
  return fallbackHost;
}

function requireProjectRuntimeHostForAutomationThread(threadId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    const found = targetStore.listAutomationFolders().some((folder) => folder.threads.some((thread) => thread.id === threadId));
    if (!found) throw new Error(`Automation thread not found: ${threadId}`);
  });
}

function requireProjectRuntimeHostForAutomationSchedule(scheduleId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    const found = targetStore.listAutomationSchedules().some((schedule) => schedule.id === scheduleId);
    if (!found) throw new Error(`Automation schedule not found: ${scheduleId}`);
  });
}

function requireProjectRuntimeHostForAutomationScheduleTarget(
  input: Pick<CreateAutomationScheduleInput, "targetKind" | "targetId">,
  fallbackHost = requireActiveProjectRuntimeHost(),
): ProjectRuntimeHost {
  if (input.targetKind === "local_task") return requireProjectRuntimeHostForOrchestrationTask(input.targetId);
  if (input.targetKind === "workflow_playbook") {
    return requireProjectRuntimeHostForStoreRecord((targetStore) => {
      targetStore.describeWorkflowRecording(input.targetId);
    });
  }
  if (input.targetKind === "workflow_thread") return requireProjectRuntimeHostForWorkflowThread(input.targetId);
  if (input.targetKind === "workflow_version") return requireProjectRuntimeHostForWorkflowVersion(input.targetId);
  if (input.targetKind === "workflow_artifact") return requireProjectRuntimeHostForWorkflowArtifact(input.targetId);
  return requireProjectRuntimeHostForAutomationFolder(input.targetId, fallbackHost);
}

function requireProjectRuntimeHostForWorkflowRevision(revisionId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getWorkflowRevision(revisionId);
  });
}

function requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getWorkflowArtifact(artifactId);
  });
}

function requireProjectRuntimeHostForPlannerPlanArtifact(artifactId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getPlannerPlanArtifact(artifactId);
  });
}

function requireProjectRuntimeHostForMessageVoiceState(messageId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    const voiceState = targetStore.getMessageVoiceState(messageId);
    if (!voiceState) throw new Error(`Voice state not found for message: ${messageId}`);
  });
}

function projectRuntimeHostForWorkflowRun(runId: string): ProjectRuntimeHost | undefined {
  return projectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getWorkflowRun(runId);
  });
}

function requireProjectRuntimeHostForWorkflowRun(runId: string): ProjectRuntimeHost {
  const host = projectRuntimeHostForWorkflowRun(runId);
  if (host) return host;
  const active = requireActiveProjectRuntimeHost();
  active.store.getWorkflowRun(runId);
  return active;
}

function requireProjectRuntimeHostForCallableWorkflowTask(taskId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getCallableWorkflowTask(taskId);
  });
}

function requireProjectRuntimeHostForSubagentRun(runId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getSubagentRun(runId);
  });
}

function requireProjectRuntimeHostForSubagentWaitBarrier(waitBarrierId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getSubagentWaitBarrier(waitBarrierId);
  });
}

function requireProjectRuntimeHostForOrchestrationTask(taskId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getOrchestrationTask(taskId);
  });
}

function requireProjectRuntimeHostForOrchestrationRun(runId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getOrchestrationRun(runId);
  });
}

function orchestrationBoardWorkspacePaths(board: ReturnType<ProjectStore["listOrchestrationBoard"]>): string[] {
  return [
    ...board.runs.map((run) => run.workspacePath),
    ...board.tasks.map((task) => task.workspacePath).filter((path): path is string => Boolean(path)),
  ];
}

function requireProjectRuntimeHostForOrchestrationWorkspace(workspacePath: string): ProjectRuntimeHost {
  const normalized = normalizeWorkspacePath(workspacePath);
  const host = projectRuntimeHostList().find((candidate) => {
    const board = candidate.store.listOrchestrationBoard();
    return orchestrationBoardWorkspacePaths(board).some((candidatePath) => normalizeWorkspacePath(candidatePath) === normalized);
  });
  if (host) return host;
  const active = requireActiveProjectRuntimeHost();
  const board = active.store.listOrchestrationBoard();
  const allowed = orchestrationBoardWorkspacePaths(board).some((candidatePath) => normalizeWorkspacePath(candidatePath) === normalized);
  if (!allowed) throw new Error("Workspace is not associated with a local orchestration task.");
  return active;
}

function requireProjectRuntimeHostForProjectBoard(boardId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    requireProjectBoardForAction(boardId, targetStore);
  });
}

function requireProjectRuntimeHostForProjectBoardCard(cardId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getProjectBoardCard(cardId);
  });
}

function requireProjectRuntimeHostForProjectBoardSynthesisProposal(proposalId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    const proposal = targetStore.getProjectBoardSynthesisProposal(proposalId);
    if (!proposal) throw new Error(`Project board synthesis proposal not found: ${proposalId}`);
  });
}

function requireProjectRuntimeHostForProjectBoardSource(sourceId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getProjectBoardSource(sourceId);
  });
}

function requireProjectRuntimeHostForProjectBoardQuestion(questionId: string): ProjectRuntimeHost {
  return requireProjectRuntimeHostForStoreRecord((targetStore) => {
    targetStore.getProjectBoardQuestion(questionId);
  });
}

function scheduleAutoDispatch(delayMs: number, host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): void {
  const dispatch = host.autoDispatch;
  if (!dispatch.enabled) return;
  if (dispatch.timer) clearTimeout(dispatch.timer);
  dispatch.timer = setTimeout(() => void runAutoDispatchTick(host), Math.max(1_000, delayMs));
}

function stopWorkflowTraceRetentionSweep(): void {
  if (workflowTraceRetentionTimer) clearTimeout(workflowTraceRetentionTimer);
  workflowTraceRetentionTimer = undefined;
}

function scheduleWorkflowTraceRetentionSweep(delayMs = WORKFLOW_TRACE_RETENTION_SWEEP_MS): void {
  stopWorkflowTraceRetentionSweep();
  workflowTraceRetentionTimer = setTimeout(() => {
    workflowTraceRetentionTimer = undefined;
    for (const host of projectRuntimeHostList()) runWorkflowTraceRetentionSweep("scheduled", host);
    scheduleWorkflowTraceRetentionSweep();
  }, Math.max(60_000, delayMs));
  workflowTraceRetentionTimer.unref?.();
}

function runWorkflowTraceRetentionSweep(reason: "startup" | "workspace-switch" | "scheduled", host: ProjectRuntimeHost): void {
  try {
    const result = compactExpiredWorkflowTraceData(host.store);
    if (!result.changed) return;
    console.log(
      `[workflow-retention] ${reason} sweep compacted ${result.eventsCompacted} event payload(s) and ${result.modelCallsCompacted} model call payload(s) for ${host.workspacePath} before ${result.cutoff}.`,
    );
    emitWorkflowUpdated(host.workspacePath);
  } catch (error) {
    console.warn(`[workflow-retention] ${reason} sweep failed for ${host.workspacePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function emitAutoDispatchStatus(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): Promise<void> {
  mainWindow?.webContents.send("desktop:event", {
    type: "orchestration-auto-dispatch-updated",
    status: await readAutoDispatchStatus(host),
    workspacePath: host.workspacePath,
  });
}

async function setAutoDispatchEnabled(input: SetOrchestrationAutoDispatchInput): Promise<OrchestrationAutoDispatchStatus> {
  const host = requireActiveProjectRuntimeHost();
  const dispatch = host.autoDispatch;
  if (!input.enabled) {
    host.store.setAutomationAutoDispatchEnabled(false);
    stopAutoDispatch(undefined, host);
    dispatch.lastError = undefined;
    await emitAutoDispatchStatus(host);
    return readAutoDispatchStatus(host);
  }

  host.store.setAutomationAutoDispatchEnabled(true);
  dispatch.enabled = true;
  dispatch.lastError = undefined;
  scheduleAutoDispatch(1_000, host);
  await emitAutoDispatchStatus(host);
  return readAutoDispatchStatus(host);
}

function rememberAutoDispatchedRun(
  host: ProjectRuntimeHost,
  runId: string,
  taskId: string,
  dispatchKind: OrchestrationAutoDispatchStartedRun["dispatchKind"],
  runProof?: Record<string, unknown>,
): void {
  const task = host.store.getOrchestrationTask(taskId);
  host.autoDispatch.lastStartedRunIds.push(runId);
  host.autoDispatch.lastStartedRuns.push({
    runId,
    taskId: task.id,
    identifier: task.identifier,
    title: task.title,
    priority: task.priority,
    dispatchRank: typeof runProof?.dispatchRank === "number" ? runProof.dispatchRank : undefined,
    dispatchKind,
  });
}

async function runAutoDispatchTick(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()): Promise<void> {
  const dispatch = host.autoDispatch;
  const hostStore = host.store;
  const workspacePath = hostStore.getWorkspace().path;
  if (!dispatch.enabled || dispatch.inFlight) return;

  dispatch.inFlight = true;
  dispatch.lastTickAt = new Date().toISOString();
  dispatch.lastStartedRunIds = [];
  dispatch.lastStartedRuns = [];
  await emitAutoDispatchStatus(host);

  try {
    const workflowBootstrap = await ensureProjectBoardWorkflowForDispatch(workspacePath, hostStore, "auto_dispatch");
    if (workflowBootstrap?.status === "created") {
      emitProjectStateIfActive(host);
    }
    const workflow = await loadWorkflowFile(join(workspacePath, "WORKFLOW.md"));
    if (!workflow.config.orchestration.autoDispatch) {
      dispatch.lastError = workflowAutoDispatchDisabledMessage(workflow.path);
      await recordActiveProjectBoardExecutionReadinessBlocker({
        source: "auto_dispatch",
        blocker: "auto_dispatch_disabled",
        error: dispatch.lastError,
      }, hostStore);
      scheduleAutoDispatch(workflow.config.orchestration.pollIntervalMs, host);
      return;
    }

    const emitOrchestrationUpdated = () => emitProjectScopedEvent(host, { type: "orchestration-updated" });
    const emitWorkflowUpdated = () => emitProjectScopedEvent(host, { type: "workflow-updated" });
    const emitFinishedRunReview = (runId: string) => reviewFinishedProjectBoardRun(runId, hostStore, () => emitProjectStateIfActive(host));
    const activePermissionMode = hostStore.getThread(activeThreadIdForHost(host)).permissionMode;

    const preparedStartCandidates = listAutoStartablePreparedOrchestrationRuns(hostStore, {
      workflowConfig: workflow.config,
    });
    for (const { run } of preparedStartCandidates) {
      await startPreparedOrchestrationRun(
        workspacePath,
        hostStore,
        host.runtime,
        run.id,
        emitOrchestrationUpdated,
        emitFinishedRunReview,
        { permissionMode: activePermissionMode },
      );
      rememberAutoDispatchedRun(host, run.id, run.taskId, "prepared", run.proofOfWork);
    }

    const restartInterruptedCandidates = listAutoContinuableRestartInterruptedRuns(hostStore, {
      maxConcurrentAgents: workflow.config.orchestration.maxConcurrentAgents,
    });
    for (const { run } of restartInterruptedCandidates) {
      if (!existsSync(run.workspacePath)) continue;
      if (!run.threadId) continue;
      try {
        hostStore.getThread(run.threadId);
      } catch {
        continue;
      }
      const resumedRun = hostStore.recordRestartInterruptedAutoContinueAttempt(run.id);
      await startPreparedOrchestrationRun(
        workspacePath,
        hostStore,
        host.runtime,
        resumedRun.id,
        emitOrchestrationUpdated,
        emitFinishedRunReview,
        { permissionMode: activePermissionMode },
      );
      rememberAutoDispatchedRun(host, resumedRun.id, resumedRun.taskId, "restart_interrupted_resume", resumedRun.proofOfWork);
    }

    const { runs } = await prepareAndRecordNextOrchestrationRuns(workspacePath, hostStore, "auto_dispatch");
    for (const run of runs) {
      await startPreparedOrchestrationRun(
        workspacePath,
        hostStore,
        host.runtime,
        run.id,
        emitOrchestrationUpdated,
        emitFinishedRunReview,
        { permissionMode: activePermissionMode },
      );
      rememberAutoDispatchedRun(host, run.id, run.taskId, "prepared", run.proofOfWork);
    }
    const scheduled = await prepareAndRecordDueScheduledLocalTaskRuns(workspacePath, hostStore);
    for (const run of scheduled.runs) {
      await startPreparedOrchestrationRun(
        workspacePath,
        hostStore,
        host.runtime,
        run.id,
        emitOrchestrationUpdated,
        emitFinishedRunReview,
        { permissionMode: activePermissionMode },
      );
      rememberAutoDispatchedRun(host, run.id, run.taskId, "scheduled", run.proofOfWork);
    }
    const hostActiveThreadId = activeThreadIdForHost(host);
    const schedulePermissionThread = hostStore.getThread(hostActiveThreadId);
    const scheduledWorkflowResults = await runDueWorkflowArtifactSchedules(hostStore, new Date(dispatch.lastTickAt!), async (scheduleInput) => {
      const { schedule, artifact } = scheduleInput;
      const thread = hostStore.getThread(hostActiveThreadId);
      const provider = getAmbientProviderStatus(thread.model);
      const abortController = new AbortController();
      let startedRunId: string | undefined;
      try {
        const pluginRegistrations = await pluginMcpRegistrationsForThread(thread, hostStore);
        const pluginRegistry = await pluginHost.listRegistry(thread.workspacePath, pluginStateReaderForStore(hostStore));
        await runWorkflowArtifact({
          store: hostStore,
          artifactId: artifact.id,
          workspacePath: thread.workspacePath,
          permissionMode: thread.permissionMode,
          browser: host.browserService,
          requestPermission: async (request) =>
            (
              await requestPermissionWithGrantRegistry(request, {
                thread,
                permissionMode: thread.permissionMode,
                workspacePath: thread.workspacePath,
                workflowThreadId: artifact.workflowThreadId,
                store: hostStore,
              })
            ).allowed,
          pluginRegistrations,
          pluginRegistry,
          ensurePluginTrusted: (registration) => ensureWorkflowPluginTrusted(thread, registration, hostStore),
          pluginCaller: (plan, invocation, options) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
          connectorRegistrations: firstPartyWorkflowConnectorRegistrations(),
          connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer(),
          scheduledConnectorGrantContext: {
            threadId: hostActiveThreadId,
            workflowThreadId: scheduleInput.workflowThreadId ?? artifact.workflowThreadId,
            projectPath: thread.workspacePath,
            workspacePath: thread.workspacePath,
            permissionGrants: hostStore.listPermissionGrants(),
          },
          model: thread.model,
          baseUrl: provider.baseUrl,
          mode: "execute",
          runtime: "automation",
          recoverableTimeouts: true,
          runLimits: scheduleInput.runLimits,
          abortSignal: abortController.signal,
          onRunStarted: (runId) => {
            startedRunId = runId;
            rememberActiveWorkflowRun(runId, abortController, host.workspacePath);
            hostStore.appendWorkflowRunEvent({
              runId,
              type: "workflow.schedule.started",
              message: schedule.id,
              data: workflowScheduleRunStartedEventData(scheduleInput),
            });
            emitWorkflowUpdated();
          },
          onEvent: emitWorkflowUpdated,
        });
      } finally {
        if (startedRunId) forgetActiveWorkflowRun(startedRunId);
      }
      return { runId: startedRunId };
    }, {
      permissionMode: schedulePermissionThread.permissionMode,
      threadId: hostActiveThreadId,
      workspacePath: schedulePermissionThread.workspacePath,
      onPermissionAuditCreated: (entry) => emitPermissionAuditCreated(entry, workspacePath),
    });
    const scheduledPlaybookResults = await runDueWorkflowPlaybookSchedules(hostStore, new Date(dispatch.lastTickAt!), async ({ thread, prompt }) => {
      let runThread = thread;
      if ((!runThread.gitWorktree || runThread.gitWorktree.status !== "active") && runThread.workspacePath === hostStore.getWorkspace().path) {
        runThread = await prepareWorktreeForThread(runThread, hostStore);
        emitProjectStateIfActive(host, hostActiveThreadId);
      }
      await createAndRecordCheckpoint("pre-run", "Before scheduled Workflow Playbook run.", runThread, hostStore);
      await host.runtime.send(
        {
          threadId: runThread.id,
          content: prompt,
          permissionMode: runThread.permissionMode,
          collaborationMode: "agent",
          model: runThread.model,
          thinkingLevel: runThread.thinkingLevel,
          delivery: "prompt",
          preserveActiveThread: true,
        },
        {
          onActivity: () => emitProjectStateIfActive(host, hostActiveThreadId),
          awaitQueuedDeliveryCompletion: true,
        },
      );
      return {};
    });
    if (scheduledWorkflowResults.length > 0 || scheduledPlaybookResults.length > 0) {
      emitWorkflowUpdated();
    }

    dispatch.lastError = undefined;
    emitOrchestrationUpdated();
    emitProjectStateIfActive(host);
    scheduleAutoDispatch(workflow.config.orchestration.pollIntervalMs, host);
  } catch (error) {
    dispatch.lastError = error instanceof Error ? error.message : String(error);
    await recordActiveProjectBoardExecutionReadinessBlocker({
      source: "auto_dispatch",
      error,
    }, hostStore);
    scheduleAutoDispatch(30_000, host);
  } finally {
    dispatch.inFlight = false;
    await emitAutoDispatchStatus(host);
  }
}

async function createWindow(): Promise<void> {
  const startupHost = activateProjectRuntimeHost(startupWorkspacePath());
  await clearManagedVoiceArtifactCache("startup", startupHost.workspacePath, startupHost.store);
  await clearImportedWorkspaceContextCache("startup");
  runWorkflowTraceRetentionSweep("startup", startupHost);
  scheduleWorkflowTraceRetentionSweep();
  projectRegistry.register(startupHost.store.getWorkspace().path);
  ensureWelcomeOnboardingProject({
    userDataPath: app.getPath("userData"),
    projectRegistry,
    assetsSourcePath: resolveWelcomeOnboardingAssetsPath([
      process.resourcesPath ? join(process.resourcesPath, "welcome-onboarding") : undefined,
      join(app.getAppPath(), "resources", "welcome-onboarding"),
      join(process.cwd(), "resources", "welcome-onboarding"),
    ]),
  });
  const iconPath = resolveAppIconPath();
  const savedWindowState = await readWindowState();
  setDockIcon(iconPath);

  mainWindow = new BrowserWindow({
    width: savedWindowState?.width ?? 1320,
    height: savedWindowState?.height ?? 900,
    ...(savedWindowState?.x !== undefined ? { x: savedWindowState.x } : {}),
    ...(savedWindowState?.y !== undefined ? { y: savedWindowState.y } : {}),
    center: savedWindowState?.x === undefined || savedWindowState.y === undefined,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "Ambient Desktop",
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: appearanceBackgroundColor(currentAppearance().resolvedTheme),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: resolveBuiltOutputPath("preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (savedWindowState?.maximized) mainWindow.maximize();
  ensureWindowVisible(mainWindow);
  trackWindowState(mainWindow);

  installExternalNavigationGuards(mainWindow, {
    source: "main-window",
    allowNavigation: isTrustedRendererUrl,
  });
  installMainWindowDiagnostics(mainWindow);

  await loadMainWindowRenderer(mainWindow);
  if (startupHost.autoDispatch.enabled) scheduleAutoDispatch(1_000, startupHost);
}

function installMainWindowDiagnostics(window: BrowserWindow): void {
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    recordRendererDiagnosticBreadcrumb("renderer-console", { level, message, line, sourceId });
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    recordRendererDiagnosticBreadcrumb("renderer-did-fail-load", { code, description, url });
    console.error(`[renderer] failed to load ${url}: ${code} ${description}`);
  });
  window.webContents.on("did-finish-load", () => {
    recordRendererDiagnosticBreadcrumb("renderer-did-finish-load", { url: window.webContents.getURL() });
    console.log(`[renderer] did-finish-load ${window.webContents.getURL()}`);
  });
  window.webContents.on("dom-ready", () => {
    recordRendererDiagnosticBreadcrumb("renderer-dom-ready", { url: window.webContents.getURL() });
    console.log(`[renderer] dom-ready ${window.webContents.getURL()}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    recordRendererDiagnosticBreadcrumb("renderer-process-gone", {
      reason: details.reason,
      exitCode: details.exitCode,
      url: window.webContents.getURL(),
    });
    console.error(`[renderer] process gone: reason=${details.reason} exitCode=${details.exitCode}`);
    if (details.reason === "clean-exit" || details.reason === "killed") return;
    void persistRendererProcessGoneDiagnostic(window, details).catch((error) => {
      console.warn(`[renderer] failed to write crash diagnostic: ${error instanceof Error ? error.message : String(error)}`);
    });
    scheduleRendererRecovery(window, details.reason);
  });
  window.on("unresponsive", () => {
    recordRendererDiagnosticBreadcrumb("renderer-unresponsive", { url: window.webContents.getURL() });
    console.error("[renderer] window became unresponsive");
  });
  window.on("responsive", () => {
    recordRendererDiagnosticBreadcrumb("renderer-responsive", { url: window.webContents.getURL() });
    console.log("[renderer] window became responsive");
  });
}

async function persistRendererProcessGoneDiagnostic(
  window: BrowserWindow,
  details: { reason: string; exitCode: number },
): Promise<void> {
  const recordedAt = new Date().toISOString();
  const host = activeHost;
  const workspace = host?.store.getWorkspace();
  const diagnosticRoot = workspace?.statePath ?? app.getPath("userData");
  const diagnosticDir = join(diagnosticRoot, "diagnostics", "renderer-crashes");
  const safeTimestamp = recordedAt.replace(/[:.]/g, "-");
  const safeReason = details.reason.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "unknown";
  const diagnosticPath = join(diagnosticDir, `${safeTimestamp}-${safeReason}.json`);
  let browserState: unknown;
  let browserStateError: string | undefined;
  if (host) {
    try {
      browserState = await host.browserService.getState();
    } catch (error) {
      browserStateError = error instanceof Error ? error.message : String(error);
    }
  }
  const payload = sanitizeRendererDiagnosticValue({
    schemaVersion: "ambient-renderer-process-gone-v1",
    recordedAt,
    reason: details.reason,
    exitCode: details.exitCode,
    renderer: {
      url: window.webContents.getURL(),
      osProcessId: typeof window.webContents.getOSProcessId === "function" ? window.webContents.getOSProcessId() : undefined,
      isCrashed: typeof window.webContents.isCrashed === "function" ? window.webContents.isCrashed() : undefined,
    },
    recovery: {
      attempts: rendererRecoveryAttempts,
      windowStartedAt: rendererRecoveryWindowStartedAt,
    },
    workspace: host
      ? {
          path: host.workspacePath,
          statePath: workspace?.statePath,
          sessionPath: workspace?.sessionPath,
        }
      : undefined,
    activeThreadId: host ? activeThreadIdForHost(host) : undefined,
    browserState,
    browserStateError,
    breadcrumbs: rendererDiagnosticBreadcrumbs,
  });
  await mkdir(diagnosticDir, { recursive: true });
  await writeFile(diagnosticPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.error(`[renderer] process-gone diagnostic written ${diagnosticPath}`);
}

async function loadMainWindowRenderer(window: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(resolveBuiltOutputPath("renderer", "index.html"));
  }
}

function scheduleRendererRecovery(window: BrowserWindow, reason: string): void {
  const now = Date.now();
  if (now - rendererRecoveryWindowStartedAt > 60_000) {
    rendererRecoveryWindowStartedAt = now;
    rendererRecoveryAttempts = 0;
  }
  if (rendererRecoveryAttempts >= 2) {
    console.error(`[renderer] recovery suppressed after ${rendererRecoveryAttempts} attempts in 60s; last reason=${reason}`);
    return;
  }
  if (rendererRecoveryTimer) return;
  rendererRecoveryAttempts += 1;
  const attempt = rendererRecoveryAttempts;
  rendererRecoveryTimer = setTimeout(() => {
    rendererRecoveryTimer = undefined;
    if (window.isDestroyed()) return;
    console.warn(`[renderer] reloading after renderer process exit; reason=${reason}; attempt=${attempt}/2`);
    void loadMainWindowRenderer(window).catch((error) => {
      console.error(`[renderer] recovery reload failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    });
  }, 500);
}

function resolveBuiltOutputPath(...segments: string[]): string {
  return join(app.getAppPath(), "out", ...segments);
}

function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(process.cwd(), "build", "icon.png"),
    join(process.resourcesPath, "icon.png"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function windowStatePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}

function appearancePreferencesPath(): string {
  return join(app.getPath("userData"), "preferences.json");
}

function currentAppearance() {
  return resolveAppearance(themePreference, nativeTheme.shouldUseDarkColors);
}

function applyThemePreference(preference: ThemePreference) {
  themePreference = preference;
  nativeTheme.themeSource = preference;
  return currentAppearance();
}

function publishAppearanceUpdated(): void {
  const appearance = currentAppearance();
  mainWindow?.setBackgroundColor(appearanceBackgroundColor(appearance.resolvedTheme));
  mainWindow?.webContents.send("desktop:event", { type: "appearance-updated", appearance } satisfies DesktopEvent);
}

async function setThemePreference(input: SetThemePreferenceInput) {
  await writeThemePreference(appearancePreferencesPath(), input.themePreference);
  const appearance = applyThemePreference(input.themePreference);
  publishAppearanceUpdated();
  return appearance;
}

async function updateMediaPlaybackSettings(input: UpdateMediaPlaybackSettingsInput, options: SettingsUpdateStateOptions = {}) {
  mediaPlaybackSettings = { generatedMediaAutoplay: input.generatedMediaAutoplay };
  await writeMediaPlaybackSettings(appearancePreferencesPath(), mediaPlaybackSettings);
  if (options.onStateUpdated) options.onStateUpdated();
  else emitDesktopState();
  return mediaPlaybackSettings;
}

async function updateThinkingDisplaySettings(input: UpdateThinkingDisplaySettingsInput) {
  thinkingDisplaySettings = normalizeThinkingDisplaySettings(input);
  await writeThinkingDisplaySettings(appearancePreferencesPath(), thinkingDisplaySettings);
  emitDesktopState();
  return thinkingDisplaySettings;
}

async function updateModelRuntimeSettings(input: UpdateModelRuntimeSettingsInput, host = requireActiveProjectRuntimeHost()) {
  const targetStore = host.store;
  const previous = targetStore.getModelRuntimeSettings();
  const next = targetStore.setModelRuntimeSettings(input);
  if (previous.aggressiveRetries !== next.aggressiveRetries) {
    host.runtime.applyRuntimeSettings(next);
  }
  emitProjectStateIfActive(host);
  return next;
}

async function saveModelProviderCredential(input: SaveModelProviderCredentialInput, host = requireActiveProjectRuntimeHost()): Promise<ModelProviderCredentialSaveResult> {
  return saveModelProviderCredentialForSettings({
    workspacePath: host.workspacePath,
    input,
  });
}

async function installModelProviderEndpoint(input: InstallModelProviderEndpointInput, host = requireActiveProjectRuntimeHost()): Promise<InstallModelProviderEndpointResult> {
  const result = await installModelProviderEndpointForSettings({
    request: {
      templateId: input.templateId,
      providerId: input.providerId,
      providerLabel: input.providerLabel,
      modelId: input.modelId,
      modelLabel: input.modelLabel,
      baseUrl: input.baseUrl,
      generatedAt: input.generatedAt,
      measuredAt: input.measuredAt,
      timeoutMs: input.timeoutMs,
      anthropicVersion: input.anthropicVersion,
      reliabilitySampleCount: input.reliabilitySampleCount,
      extraProbeIds: input.extraProbeIds,
      enabled: input.enabled,
      credentialRef: input.credentialRef,
    },
    store: host.store,
    resolveSecret: async (request) => {
      const credentialRef = request.credentialRef;
      if (!credentialRef) throw new Error("Model provider endpoint install requires credentialRef.managedSecretRef.");
      const ref = credentialRef.managedSecretRef;
      const ambientManagedSecret = (await readSecretReference(ref))?.trim();
      if (!ambientManagedSecret) throw new Error("Model provider endpoint install credential reference is not configured.");
      return {
        ambientManagedSecret,
        secretRef: {
          schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1",
          flow: credentialRef.flow,
          configured: true,
          label: credentialRef.label,
          ref,
        },
      };
    },
  });
  host.runtime.applyRuntimeSettings(result.settings);
  emitProjectStateIfActive(host);
  return result;
}

async function runLocalModelRuntimeLifecycleAction(
  input: LocalModelRuntimeLifecycleActionInput,
  host = requireActiveProjectRuntimeHost(),
): Promise<LocalModelRuntimeLifecycleActionResult> {
  if (!isAmbientSubagentsEnabled(currentFeatureFlagSnapshot(host.store))) {
    throw new Error("Local model runtime lifecycle controls are disabled while ambient.subagents is off.");
  }
  const result = await host.runtime.runLocalModelRuntimeLifecycleAction(input);
  emitProjectStateIfActive(host);
  return result;
}

async function updateFeatureFlagSettings(input: UpdateFeatureFlagSettingsInput, host = requireActiveProjectRuntimeHost()) {
  const targetStore = host.store;
  const next = targetStore.setFeatureFlagSettings(input);
  host.runtime.applyFeatureFlags(currentFeatureFlagSnapshot(targetStore));
  emitProjectStateIfActive(host);
  return next;
}

async function updateMemorySettings(input: UpdateAgentMemorySettingsInput, host = requireActiveProjectRuntimeHost()) {
  const targetStore = host.store;
  const next = targetStore.setMemorySettings(input);
  host.runtime.applyMemorySettings();
  if (!next.enabled || !next.embeddings.enabled) {
    await runAmbientMemoryEmbeddingLifecycleAction({
      workspacePath: targetStore.getWorkspace().path,
      action: "stop",
      sendDimensions: next.embeddings.sendDimensions,
      timeoutMs: next.embeddings.timeoutMs,
    }).catch((error) => {
      console.warn(`Failed to stop Ambient-managed memory embeddings after disabling memory: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  emitProjectStateIfActive(host);
  return next;
}

async function getAgentMemoryDiagnostics(host = requireActiveProjectRuntimeHost()) {
  return inspectTencentDbMemoryDiagnostics({
    workspace: host.store.getWorkspace(),
    settings: host.store.getMemorySettings(),
    featureFlagSnapshot: currentFeatureFlagSnapshot(host.store),
    threads: host.store.listThreads(),
    runtimeSnapshots: host.runtime.listAgentMemoryRuntimeSnapshots(),
  });
}

async function runAgentMemoryEmbeddingLifecycleAction(
  input: AgentMemoryEmbeddingLifecycleActionInput,
  host = requireActiveProjectRuntimeHost(),
): Promise<AgentMemoryEmbeddingLifecycleActionResult> {
  const workspace = host.store.getWorkspace();
  const settings = host.store.getMemorySettings();
  const lifecycle = await runAmbientMemoryEmbeddingLifecycleAction({
    workspacePath: workspace.path,
    action: input.action,
    sendDimensions: settings.embeddings.sendDimensions,
    timeoutMs: settings.embeddings.timeoutMs,
  });
  if (
    input.action !== "check" &&
    ["ready", "started", "stopped", "restarted"].includes(lifecycle.status)
  ) {
    host.runtime.applyMemorySettings();
  }
  const diagnostics = await getAgentMemoryDiagnostics(host);
  return {
    schemaVersion: "ambient-agent-memory-embedding-lifecycle-action-v1",
    action: input.action,
    status: lifecycle.status,
    message: lifecycle.reason,
    checkedAt: new Date().toISOString(),
    diagnostics: {
      ...diagnostics,
      embedding: agentMemoryEmbeddingDiagnosticsFromLifecycle(settings, lifecycle),
    },
  };
}

function agentMemoryEmbeddingDiagnosticsFromLifecycle(
  settings: AgentMemorySettings,
  lifecycle: Awaited<ReturnType<typeof runAmbientMemoryEmbeddingLifecycleAction>>,
): AgentMemoryEmbeddingDiagnostics {
  const provider = lifecycle.provider;
  const runtime = provider.diagnostics?.runtimeState;
  const ready = lifecycle.status === "ready" || lifecycle.status === "started" || lifecycle.status === "restarted";
  const stopped = lifecycle.status === "stopped" || lifecycle.status === "not-found";
  const status: AgentMemoryEmbeddingDiagnostics["status"] = ready
    ? "ready"
    : lifecycle.status === "failed"
      ? "error"
      : lifecycle.status === "unavailable"
        ? "unavailable"
        : "keyword_fallback";
  return {
    enabled: settings.embeddings.enabled,
    status: stopped ? "keyword_fallback" : status,
    message: lifecycle.reason,
    providerMode: settings.embeddings.providerMode,
    providerId: provider.providerId,
    providerCapabilityId: provider.capabilityId,
    packageName: provider.packageName,
    ...(provider.modelId ? { modelId: provider.modelId } : {}),
    ...(runtime?.modelProfileId ? { modelProfileId: runtime.modelProfileId } : {}),
    ...(provider.dimensions !== undefined ? { dimensions: provider.dimensions } : {}),
    ...(runtime?.endpoint ? { endpoint: runtime.endpoint } : {}),
    ...(runtime?.modelRuntimeId ? { runtimeId: `embeddings:${runtime.modelRuntimeId}` } : {}),
    ...(runtime?.status ? { runtimeStatus: runtime.status } : {}),
    ...(runtime ? { running: runtime.running } : {}),
    autoStartProvider: settings.embeddings.autoStartProvider,
    preflightEnabled: settings.embeddings.preflightEnabled,
    sendDimensions: settings.embeddings.sendDimensions,
    maxInputChars: settings.embeddings.maxInputChars,
    timeoutMs: settings.embeddings.timeoutMs,
    reindexStatus: ready ? "unknown" : "not_required",
    missingHints: provider.diagnostics?.missingHints,
    ...(lifecycle.status === "failed" ? { lastError: lifecycle.reason } : {}),
  };
}

async function clearAgentMemory(host = requireActiveProjectRuntimeHost()) {
  const activeSessionsReset = host.runtime.applyMemorySettings();
  const result = await clearTencentDbMemoryStorage({
    workspace: host.store.getWorkspace(),
    activeSessionsReset,
  });
  emitProjectStateIfActive(host);
  return result;
}

async function updatePlannerSettings(input: UpdatePlannerSettingsInput, options: SettingsUpdateStateOptions = {}) {
  plannerSettings = normalizePlannerSettings(input);
  await writePlannerSettings(appearancePreferencesPath(), plannerSettings);
  if (options.onStateUpdated) options.onStateUpdated();
  else emitDesktopState();
  return plannerSettings;
}

async function updateSearchRoutingSettings(input: UpdateSearchRoutingSettingsInput, options: SettingsUpdateStateOptions = {}) {
  searchRoutingSettings = normalizeSearchRoutingSettings(input);
  await writeSearchRoutingSettings(appearancePreferencesPath(), searchRoutingSettings);
  if (options.onStateUpdated) options.onStateUpdated();
  else emitDesktopState();
  return searchRoutingSettings;
}

async function updateLocalDeepResearchSettings(input: UpdateLocalDeepResearchSettingsInput, options: SettingsUpdateStateOptions = {}) {
  localDeepResearchSettings = normalizeLocalDeepResearchAppSettings(input);
  await writeLocalDeepResearchSettings(appearancePreferencesPath(), localDeepResearchSettings);
  if (options.onStateUpdated) options.onStateUpdated();
  else emitDesktopState();
  return localDeepResearchSettings;
}

async function hydrateSearchRoutingSettingsForActiveWorkspace(): Promise<SearchRoutingSettings> {
  const host = requireActiveProjectRuntimeHost();
  return hydrateWebResearchSettings({
    settings: searchRoutingSettings,
    discoverAmbientCliCatalog: () => discoverAmbientCliPackages(host.workspacePath, { includeHealth: true }),
    discoverMcpTools: async () => {
      const { toolHive, catalog } = createMcpInstallCatalog();
      const bridge = new McpToolBridge({
        catalog,
        toolHive,
        workspacePath: host.workspacePath,
      });
      return bridge.searchTools({ limit: 50, refresh: false });
    },
  });
}

interface VoiceSettingsAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

interface SettingsUpdateStateOptions {
  onStateUpdated?: () => void;
}

interface VoiceSettingsUpdateOptions extends SettingsUpdateStateOptions {
  providerStore?: ProjectStore;
  workspacePath?: string;
}

function activeVoiceSttContextForProjectHost(host: ProjectRuntimeHost = requireActiveProjectRuntimeHost()) {
  const threadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(threadId);
  return {
    host,
    targetStore: host.store,
    threadId,
    thread,
    workspacePath: thread.workspacePath,
  };
}

async function updateVoiceSettings(
  input: UpdateVoiceSettingsInput,
  audit: VoiceSettingsAuditContext = { source: "settings-ui" },
  options: VoiceSettingsUpdateOptions = {},
) {
  const selectedProviderAvailable = input.providerCapabilityId
    ? (await listVoiceProvidersWithCachedVoices(options.providerStore ?? store)).some(
      (provider) => provider.capabilityId === input.providerCapabilityId && provider.available,
    )
    : false;
  const firstProviderSetup = selectedProviderAvailable && !voiceSettings.providerCapabilityId;
  const previousSettings = voiceSettings;
  const preferredVoicesByProvider = {
    ...(voiceSettings.preferredVoicesByProvider ?? {}),
    ...(input.preferredVoicesByProvider ?? {}),
    ...(input.providerCapabilityId && input.voiceId ? { [input.providerCapabilityId]: input.voiceId } : {}),
  };
  voiceSettings = {
    enabled: selectedProviderAvailable && (input.enabled || firstProviderSetup),
    mode: input.mode,
    autoplay: selectedProviderAvailable && (input.autoplay || firstProviderSetup),
    ...(input.providerCapabilityId ? { providerCapabilityId: input.providerCapabilityId } : {}),
    ...(input.voiceId ? { voiceId: input.voiceId } : {}),
    ...(Object.keys(preferredVoicesByProvider).length ? { preferredVoicesByProvider } : {}),
    maxChars: input.maxChars,
    longReply: input.longReply,
    format: input.format,
    artifactCacheMaxMb: input.artifactCacheMaxMb,
  };
  recordVoiceSettingsAudit(previousSettings, voiceSettings, audit);
  await writeVoiceSettings(appearancePreferencesPath(), voiceSettings);
  await enforceVoiceArtifactBudget(options.workspacePath ?? activeWorkspacePath(), options.providerStore ?? store);
  if (options.onStateUpdated) options.onStateUpdated();
  else emitDesktopState();
  return voiceSettings;
}

async function updateSttSettings(input: UpdateSttSettingsInput, options: SettingsUpdateStateOptions = {}) {
  sttSettings = {
    enabled: input.enabled && Boolean(input.providerCapabilityId),
    ...(input.providerCapabilityId ? { providerCapabilityId: input.providerCapabilityId } : {}),
    spokenLanguage: input.spokenLanguage,
    ...(input.pushToTalkShortcut ? { pushToTalkShortcut: input.pushToTalkShortcut } : {}),
    microphone: {
      ...(input.microphone?.deviceId ? { deviceId: input.microphone.deviceId } : {}),
      ...(input.microphone?.label ? { label: input.microphone.label } : {}),
    },
    mode: input.mode,
    autoSendAfterTranscription: input.autoSendAfterTranscription,
    silenceFinalizeSeconds: input.silenceFinalizeSeconds,
    noSpeechGate: input.noSpeechGate,
    bargeIn: input.bargeIn,
  };
  await writeSttSettings(appearancePreferencesPath(), sttSettings);
  for (const runtime of sttRuntimes.values()) runtime.updateSettings(sttSettings);
  if (options.onStateUpdated) options.onStateUpdated();
  else emitDesktopState();
  return sttSettings;
}

async function listVoiceProvidersWithCachedVoices(targetStore: ProjectStore = store) {
  const providers: VoiceProviderCandidate[] = [];
  const seen = new Set<string>();
  for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
    const workspaceProviders = await discoverAmbientCliVoiceProviders(workspacePath);
    const cache = await readVoiceDiscoveryCache(workspacePath);
    for (const provider of mergeVoiceProvidersWithCachedVoices(workspaceProviders, cache)) {
      if (seen.has(provider.capabilityId)) continue;
      seen.add(provider.capabilityId);
      providers.push(provider);
    }
  }
  return providers;
}

async function listEmbeddingProvidersForSettings(targetStore: ProjectStore = store) {
  const providers: EmbeddingProviderCandidate[] = [];
  const seen = new Set<string>();
  for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
    const workspaceProviders = [
      ...await discoverAmbientMemoryEmbeddingProviders(workspacePath).catch(() => []),
      ...await discoverAmbientCliEmbeddingProviders(workspacePath).catch(() => []),
    ];
    for (const provider of workspaceProviders) {
      if (seen.has(provider.capabilityId)) continue;
      seen.add(provider.capabilityId);
      providers.push(provider);
    }
  }
  return providers;
}

function voiceProviderWorkspacePaths(targetStore: ProjectStore = store): string[] {
  return Array.from(new Set([
    targetStore.getWorkspace().path,
    ...targetStore.listThreads().map((thread) => thread.workspacePath),
  ]));
}

async function resolveVoiceProviderWorkspacePath(
  providerCapabilityId: string | undefined,
  targetStore: ProjectStore = store,
): Promise<string> {
  if (!providerCapabilityId) return targetStore.getWorkspace().path;
  for (const workspacePath of voiceProviderWorkspacePaths(targetStore)) {
    const providers = await discoverAmbientCliVoiceProviders(workspacePath);
    if (providers.some((provider) => provider.capabilityId === providerCapabilityId)) return workspacePath;
  }
  return targetStore.getWorkspace().path;
}

async function listSttProvidersWithValidation(workspacePath = activeWorkspacePath()) {
  const providers = await discoverAmbientCliSttProviders(workspacePath);
  const validation = await readQwen3AsrValidationMetadata(workspacePath);
  return mergeSttProvidersWithValidation(providers, validation);
}

async function setupSttProvider(input: SttProviderSetupInput, context = activeVoiceSttContextForProjectHost()) {
  const { workspacePath } = context;
  const startedAt = Date.now();
  const result = await setupQwen3AsrProvider(workspacePath, input, sttProviderSetupOptions());
  const selectedProvider = result.selectedProvider;
  if (input.selectProvider && selectedProvider) {
    await updateSttSettings({
      ...sttSettings,
      enabled: Boolean(input.enable) && selectedProvider.available && result.status === "ready",
      providerCapabilityId: selectedProvider.capabilityId,
      spokenLanguage: input.spokenLanguage?.trim() || selectedProvider.defaultLanguage || sttSettings.spokenLanguage,
    }, {
      onStateUpdated: () => emitRuntimeFeatureStateUpdated(context.targetStore),
    });
  }
  await recordSttDiagnostic(workspacePath, sttSetupDiagnosticSummary({ result, durationMs: Date.now() - startedAt }));
  return {
    ...result,
    providers: await listSttProvidersWithValidation(workspacePath),
  };
}

function sttProviderSetupOptions() {
  if (process.env.AMBIENT_E2E !== "1") return {};
  return {
    disableRuntimeAutoDetect: process.env.AMBIENT_E2E_STT_DISABLE_RUNTIME_AUTODETECT === "1",
    disableRuntimeInstall: process.env.AMBIENT_E2E_STT_DISABLE_RUNTIME_INSTALL === "1",
  };
}

function miniCpmVisionProviderOptions() {
  if (process.env.AMBIENT_E2E !== "1") return {};
  return {
    disableRuntimeAutoDetect: process.env.AMBIENT_E2E_MINICPM_DISABLE_RUNTIME_AUTODETECT === "1",
  };
}

async function setupMiniCpmVision(input: MiniCpmVisionSetupInput, workspacePath = activeVoiceSttContextForProjectHost().workspacePath) {
  return setupMiniCpmVisionProvider(workspacePath, input, miniCpmVisionProviderOptions());
}

async function analyzeMiniCpmVision(input: MiniCpmVisionAnalyzeInput, workspacePath = activeVoiceSttContextForProjectHost().workspacePath) {
  return analyzeMiniCpmVisionInput(workspacePath, input, miniCpmVisionProviderOptions());
}

async function setupLocalDeepResearch(
  input: LocalDeepResearchSetupIpcInput,
  workspacePath = activeVoiceSttContextForProjectHost().workspacePath,
): Promise<LocalDeepResearchSetupResult> {
  const action = input.action ?? "status";
  const setupInput: LocalDeepResearchSetupContractInput = {
    q8Override: input.q8Override,
  };
  const initial = await readLocalDeepResearchReadinessForSettings(workspacePath, setupInput);
  let installResult: LocalDeepResearchInstallServiceResult | undefined;
  if (action === "install" || action === "repair") {
    installResult = await installLocalDeepResearchManagedAssets({
      workspacePath,
      setup: initial.contract,
      action,
      installModel: input.installModel !== false,
      installRuntime: input.installRuntime !== false,
      ...(input.runtimeArtifactId ? { runtimeArtifactId: input.runtimeArtifactId } : {}),
      onProgress: (progress) => emitMainWindowDesktopEvent({
        type: "local-deep-research-install-progress",
        progress,
        workspacePath,
      }),
    });
  }
  const { contract, managedAssets } = installResult
    ? await readLocalDeepResearchReadinessForSettings(workspacePath, setupInput)
    : initial;
  const validation = action === "validate"
    ? await validateLocalDeepResearchSetup({ workspacePath, setup: contract, managedAssets })
    : undefined;
  const smoke = action === "smoke"
    ? await runLocalDeepResearchRealAssetSmoke({
        workspacePath,
        setup: contract,
        managedAssets,
        approveResourceLimitExceed: confirmLocalModelResourceLimitExceed,
      })
    : undefined;
  const result = localDeepResearchSetupResultFromContract(action, contract, managedAssets, installResult, validation, smoke);
  emitMainWindowDesktopEvent({
    type: "local-deep-research-setup-updated",
    result,
    workspacePath,
  });
  return result;
}

async function confirmLocalModelResourceLimitExceed(decision: LocalModelResourcePolicyDecision): Promise<boolean> {
  const detail = [
    decision.exceededByBytes !== undefined
      ? `Projected resident memory exceeds the configured ceiling by ${formatLocalModelResourceBytes(decision.exceededByBytes)}.`
      : "Projected resident memory exceeds the configured ceiling.",
    `Ceiling: ${decision.maxResidentMemoryBytes !== undefined ? formatLocalModelResourceBytes(decision.maxResidentMemoryBytes) : "not configured"}.`,
    `Active estimate: ${formatLocalModelResourceBytes(decision.activeEstimatedResidentMemoryBytes)}.`,
    `Requested estimate: ${decision.requestedEstimatedResidentMemoryBytes !== undefined ? formatLocalModelResourceBytes(decision.requestedEstimatedResidentMemoryBytes) : "unknown"}.`,
    `Projected estimate: ${formatLocalModelResourceBytes(decision.projectedEstimatedResidentMemoryBytes)}.`,
    decision.activeActualResidentMemoryBytes !== undefined
      ? `Actual sampled resident memory: ${formatLocalModelResourceBytes(decision.activeActualResidentMemoryBytes)}.`
      : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
  const options = {
    type: "warning" as const,
    buttons: ["Continue", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Exceed Local Model Memory Ceiling?",
    message: "Starting this local model would exceed your configured memory ceiling.",
    detail,
  };
  const response = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return response.response === 0;
}

async function readLocalDeepResearchReadinessForSettings(
  workspacePath: string,
  input: LocalDeepResearchSetupContractInput,
): Promise<{
  contract: LocalDeepResearchSetupContract;
  managedAssets: Awaited<ReturnType<typeof detectLocalDeepResearchManagedAssets>>;
}> {
  const catalog = await discoverAmbientCliPackages(workspacePath, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
  const mcpTools = await discoverWebResearchMcpProviderToolsForWorkspace(workspacePath);
  const searchSettings = webResearchSettingsWithDynamicProviderCatalogs(searchRoutingSettings, { ambientCliCatalog: catalog, mcpTools });
  const residentProcesses = await detectLocalLlamaResidentProcesses(workspacePath).catch(() => []);
  const machineFacts = {
    ...input.machineFacts,
    activeLocalModelCount: residentProcesses.length,
    activeLocalModelEstimatedResidentMemoryBytes: residentProcesses.reduce((sum, resident) => sum + Math.max(0, resident.estimatedResidentMemoryBytes ?? 0), 0),
  };
  const preliminaryContract = buildLocalDeepResearchSetupContract({
    ...input,
    localDeepResearchSettings,
    machineFacts,
    searchSettings,
  });
  const managedAssets = await detectLocalDeepResearchManagedAssets(workspacePath, {
    selectedProfileId: preliminaryContract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
  });
  const installJob = await reconcileLocalDeepResearchInstallJob(workspacePath).catch(() => undefined);
  const localRuntimeStatus = await buildLocalModelRuntimeStatusSnapshot({
    workspacePath,
    settings: localDeepResearchSettings.localModelResources,
    residentProcesses,
    hostMemory: sampleLocalModelHostMemorySnapshot(),
    voiceProviders: await listVoiceProvidersWithCachedVoices().catch(() => []),
    embeddingProviders: await listEmbeddingProvidersForSettings().catch(() => []),
    requestedLaunch: localDeepResearchRequestedLaunch({
      modelId: preliminaryContract.modelInstall.filename,
      profileId: preliminaryContract.modelInstall.selectedProfileId,
      contextTokens: preliminaryContract.modelInstall.contextTokens,
      estimatedResidentMemoryBytes: preliminaryContract.installerShape.memory.estimatedResidentMemoryBytes,
    }),
  });
  const localModelResources = localRuntimeStatus.registry;
  const setupInput: LocalDeepResearchSetupContractInput = {
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
  const contract = buildLocalDeepResearchSetupContract(setupInput);
  return { contract, managedAssets };
}

function formatLocalModelResourceBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  return `${(bytes / (1024 ** 2)).toFixed(0)} MiB`;
}

async function discoverWebResearchMcpProviderToolsForWorkspace(workspacePath: string) {
  try {
    const { toolHive, catalog } = createMcpInstallCatalog();
    const bridge = new McpToolBridge({
      catalog,
      toolHive,
      workspacePath,
    });
    return bridge.searchTools({ limit: 50, refresh: false });
  } catch {
    return [];
  }
}

function localDeepResearchSetupResultFromContract(
  action: LocalDeepResearchSetupIpcInput["action"],
  contract: LocalDeepResearchSetupContract,
  managedAssets: Awaited<ReturnType<typeof detectLocalDeepResearchManagedAssets>>,
  installResult?: LocalDeepResearchInstallServiceResult,
  validation?: Awaited<ReturnType<typeof validateLocalDeepResearchSetup>>,
  smoke?: Awaited<ReturnType<typeof runLocalDeepResearchRealAssetSmoke>>,
): LocalDeepResearchSetupResult {
  return {
    schemaVersion: "ambient-local-deep-research-setup-result-v1",
    action: action ?? "status",
    capabilityId: contract.capabilityId,
    setupStatus: contract.status,
    modelSelection: contract.modelSelection,
    modelInstall: {
      ...contract.modelInstall,
      selectedProfileId: contract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    },
    llamaRuntime: contract.runtime,
    installerShape: contract.installerShape,
    localModelResources: contract.localModelResources,
    localRuntimeInventory: contract.localRuntimeInventory,
    providerSnapshot: contract.providerSnapshot,
    managedAssets,
    ...(installResult ? { installResult } : {}),
    ...(validation ? { validation } : {}),
    ...(smoke ? { smoke } : {}),
    warnings: contract.warnings,
    blockers: contract.blockers,
    nextActions: contract.nextActions,
  };
}

async function listLocalDeepResearchRunsForSettings(
  input: LocalDeepResearchRunHistoryInput | undefined,
  workspacePath = activeVoiceSttContextForProjectHost().workspacePath,
): Promise<LocalDeepResearchRunHistoryResult> {
  return listLocalDeepResearchRunHistory(workspacePath, input);
}

async function transcribeSttAudio(input: SttTranscribeAudioInput, host = requireProjectRuntimeHostForThread(input.threadId)) {
  if (!sttSettings.enabled || !sttSettings.providerCapabilityId) {
    throw new Error("Enable speech input and select an available STT provider before transcribing speech.");
  }
  const targetStore = host.store;
  const thread = targetStore.getThread(input.threadId);
  const workspacePath = thread.workspacePath;
  const runtime = getSttRuntime(workspacePath);
  runtime.updateSettings(sttSettings);
  runtime.setAgentRunning(isThreadRunActive(input.threadId, targetStore));
  const startedAt = Date.now();
  const state = await runtime.enqueueUtterance({
    threadId: input.threadId,
    utteranceId: input.utteranceId ?? `stt-${Date.now().toString(36)}`,
    audioPath: input.audioPath,
  });
  runtime.drainReadyToSend();
  const queue = runtime.getQueueState();
  await recordSttDiagnostic(
    workspacePath,
    sttTranscriptionDiagnosticSummary({ state, elapsedMs: Date.now() - startedAt, queue }),
  );
  return {
    state,
    queue,
  };
}

async function setSttTtsSpeaking(input: SetSttTtsSpeakingInput, workspacePath = activeVoiceSttContextForProjectHost().workspacePath): Promise<SttQueueState> {
  const runtime = getSttRuntime(workspacePath);
  runtime.updateSettings(sttSettings);
  return runtime.setTtsSpeaking(input.speaking);
}

async function cancelSttTranscription(workspacePath = activeVoiceSttContextForProjectHost().workspacePath): Promise<SttQueueState> {
  const runtime = getSttRuntime(workspacePath);
  runtime.updateSettings(sttSettings);
  return runtime.cancelTranscription();
}

function getSttRuntime(workspacePath: string): SttRuntime {
  const normalized = normalizeWorkspacePath(workspacePath);
  let runtime = sttRuntimes.get(normalized);
  if (!runtime) {
    runtime = new SttRuntime({
      workspacePath: normalized,
      settings: sttSettings,
      runner: runAmbientCliPackageCommand,
      onQueueStateChanged: (queue) => {
        emitMainWindowDesktopEvent({ type: "stt-queue-updated", queue, workspacePath: normalized });
      },
      onStopSpeakingRequested: () => {
        emitMainWindowDesktopEvent({ type: "stt-stop-tts-requested", workspacePath: normalized });
      },
    });
    sttRuntimes.set(normalized, runtime);
  }
  return runtime;
}

function idleSttQueueState(): SttQueueState {
  return { phase: "idle" as const, queuedUtteranceIds: [] };
}

function currentSttQueueState(workspacePath = activeWorkspacePath()): SttQueueState {
  return sttRuntimes.get(normalizeWorkspacePath(workspacePath))?.getQueueState() ?? idleSttQueueState();
}

function disposeSttRuntimeForWorkspace(workspacePath: string, reason: string): void {
  const normalized = normalizeWorkspacePath(workspacePath);
  const runtime = sttRuntimes.get(normalized);
  if (!runtime) return;
  runtime.dispose(reason);
  sttRuntimes.delete(normalized);
}

async function recordSttDiagnostic(workspacePath: string, diagnostic: ReturnType<typeof sttSetupDiagnosticSummary> | ReturnType<typeof sttTranscriptionDiagnosticSummary>): Promise<void> {
  const diagnostics = await sttDiagnostics.record(workspacePath, diagnostic);
  mainWindow?.webContents.send("desktop:event", {
    type: "stt-diagnostic-recorded",
    diagnostic,
    diagnostics,
    workspacePath,
  } satisfies DesktopEvent);
}

function isThreadRunActive(threadId: string, targetStore: ProjectStore = store): boolean {
  return targetStore
    .listActiveRuns()
    .some((run) => run.threadId === threadId && (run.status === "starting" || run.status === "streaming" || run.status === "tool"));
}

async function refreshVoiceProviderCatalog(input: { providerCapabilityId: string }, targetStore: ProjectStore = store) {
  const workspacePath = await resolveVoiceProviderWorkspacePath(input.providerCapabilityId, targetStore);
  const providers = await discoverAmbientCliVoiceProviders(workspacePath);
  const result = await refreshVoiceProviderVoices(workspacePath, providers, input, runAmbientCliPackageCommand);
  return {
    providerCapabilityId: result.provider.capabilityId,
    providerLabel: result.provider.label,
    ...(result.entry.source ? { source: result.entry.source } : {}),
    refreshedAt: result.entry.refreshedAt,
    ...(result.entry.expiresAt ? { expiresAt: result.entry.expiresAt } : {}),
    voiceCount: result.entry.voiceCount,
    durationMs: result.durationMs,
    ...(result.stdoutArtifactPath ? { stdoutArtifactPath: result.stdoutArtifactPath } : {}),
    ...(result.stderrArtifactPath ? { stderrArtifactPath: result.stderrArtifactPath } : {}),
  };
}

function recordVoiceSettingsAudit(previous: VoiceSettings, next: VoiceSettings, audit: VoiceSettingsAuditContext): void {
  const changes = voiceSettingsChanges(previous, next);
  if (changes.length === 0) return;
  const entry: VoiceSettingsAuditEntry = {
    id: `voice-settings-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    source: audit.source,
    summary: audit.summary ?? voiceSettingsAuditSummary(audit.source, changes),
    changes,
    ...(audit.toolName ? { toolName: audit.toolName } : {}),
    ...(audit.threadId ? { threadId: audit.threadId } : {}),
  };
  voiceSettingsAudit = [entry, ...voiceSettingsAudit].slice(0, 20);
}

function voiceSettingsChanges(previous: VoiceSettings, next: VoiceSettings): VoiceSettingsAuditChange[] {
  const fields: Array<keyof VoiceSettings> = [
    "enabled",
    "mode",
    "autoplay",
    "providerCapabilityId",
    "voiceId",
    "preferredVoicesByProvider",
    "maxChars",
    "longReply",
    "format",
    "artifactCacheMaxMb",
  ];
  return fields.flatMap((field) => {
    const previousValue = previous[field];
    const nextValue = next[field];
    if (previousValue === nextValue) return [];
    return [{
      field,
      ...(previousValue !== undefined ? { previous: String(previousValue) } : {}),
      ...(nextValue !== undefined ? { next: String(nextValue) } : {}),
    }];
  });
}

function voiceSettingsAuditSummary(source: VoiceSettingsAuditSource, changes: VoiceSettingsAuditChange[]): string {
  const fieldList = changes.map((change) => change.field).join(", ");
  return source === "chat-tool"
    ? `Chat updated voice settings: ${fieldList}.`
    : source === "settings-ui"
      ? `Settings updated voice settings: ${fieldList}.`
      : `Ambient updated voice settings: ${fieldList}.`;
}

async function regenerateMessageVoice(input: RegenerateMessageVoiceInput) {
  const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
  const targetStore = host.store;
  const result = await regenerateMessageVoiceState({
    messageId: input.messageId,
    packageWorkspacePath: await resolveVoiceProviderWorkspacePath(voiceSettings.providerCapabilityId, targetStore),
    settings: voiceSettings,
    store: targetStore,
    runner: runAmbientCliPackageCommand,
    createMediaUrl: (mediaInput) => workspaceMediaServer.createUrl(mediaInput),
    summaryForThread: (thread) => {
      const provider = getAmbientProviderStatus(thread.model);
      return {
        model: thread.model,
        apiKey: readAmbientApiKey(),
        baseUrl: provider.baseUrl,
      };
    },
    onStateUpdated: () => emitProjectStateIfActive(host),
  });
  await enforceVoiceArtifactBudget(targetStore.getThread(result.threadId).workspacePath, targetStore);
  emitProjectStateIfActive(host);
  return result;
}

function resolveManagedVoiceArtifactPath(audioPath: string, workspacePath = activeWorkspacePath()): string {
  const normalized = audioPath.replace(/\\/g, "/");
  if (!normalized.startsWith(".ambient/voice/")) {
    throw new Error("Voice artifact is not in Ambient's managed voice directory.");
  }
  return resolveWorkspacePath(workspacePath, normalized);
}

function revealMessageVoiceArtifact(input: MessageVoiceArtifactInput): void {
  const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
  const voiceState = host.store.getMessageVoiceState(input.messageId);
  if (!voiceState?.audioPath) throw new Error(`Voice artifact not found for message: ${input.messageId}`);
  shell.showItemInFolder(resolveManagedVoiceArtifactPath(voiceState.audioPath, host.store.getWorkspace().path));
}

async function clearMessageVoiceArtifact(input: MessageVoiceArtifactInput) {
  const host = requireProjectRuntimeHostForMessageVoiceState(input.messageId);
  const voiceState = host.store.getMessageVoiceState(input.messageId);
  if (!voiceState?.audioPath) throw new Error(`Voice artifact not found for message: ${input.messageId}`);
  await rm(resolveManagedVoiceArtifactPath(voiceState.audioPath, host.store.getWorkspace().path), { force: true });
  const cleared = host.store.clearMessageVoiceArtifact(input.messageId);
  emitProjectStateIfActive(host);
  return cleared;
}

async function generatePlannerDurableArtifact(input: GeneratePlannerDurableArtifactInput) {
  const host = requireProjectRuntimeHostForPlannerPlanArtifact(input.artifactId);
  const targetStore = host.store;
  const current = targetStore.getPlannerPlanArtifact(input.artifactId);
  if (current.status !== "ready") throw new Error("Only ready planner plans can generate durable artifacts.");
  if (current.decisionQuestions.some((question) => question.required && !question.answer)) {
    throw new Error("Answer required planner decisions before generating a durable plan.");
  }
  const thread = targetStore.getThread(current.threadId);
  const projectArtifactWorkspacePath = targetStore.getProjectArtifactWorkspacePath();
  let artifact = targetStore.updatePlannerPlanArtifact(input.artifactId, { workflowState: "durable_generating" });
  emitPlannerPlanArtifactUpdated(artifact, targetStore);
  try {
    const durable = await writePlannerDurableHtmlArtifact({
      artifact,
      threadTitle: thread.title,
      workspacePath: projectArtifactWorkspacePath,
      browserValidator: validatePlannerDurableHtmlFileInBrowser,
    });
    artifact = targetStore.setPlannerPlanDurableArtifact(artifact.id, {
      path: durable.relativePath,
      generatedAt: durable.generatedAt,
      validation: durable.validation,
    });
    targetStore.promotePlannerDurableArtifactToBoardSource(artifact.id);
    await commitPlannerDurableArtifact(projectArtifactWorkspacePath, artifact, durable.manifestRelativePath, "Add durable plan");
    emitPlannerPlanArtifactUpdated(artifact, targetStore);
    emitProjectStateIfActive(host);
    return artifact;
  } catch (error) {
    if (error instanceof PlannerDurableHtmlValidationError) {
      try {
        const fallback = await writePlannerDurableHtmlArtifact({
          artifact,
          threadTitle: thread.title,
          workspacePath: projectArtifactWorkspacePath,
          browserValidator: validatePlannerDurableHtmlFileInBrowser,
          diagramMode: "deterministic",
          validationWarnings: plannerDurableFallbackWarnings(error.validation),
        });
        artifact = targetStore.setPlannerPlanDurableArtifact(artifact.id, {
          path: fallback.relativePath,
          generatedAt: fallback.generatedAt,
          validation: fallback.validation,
          workflowState: "durable_ready_with_fallbacks",
        });
        targetStore.promotePlannerDurableArtifactToBoardSource(artifact.id);
        await commitPlannerDurableArtifact(projectArtifactWorkspacePath, artifact, fallback.manifestRelativePath, "Add durable plan");
        emitPlannerPlanArtifactUpdated(artifact, targetStore);
        emitProjectStateIfActive(host);
        return artifact;
      } catch (fallbackError) {
        const failed =
          fallbackError instanceof PlannerDurableHtmlValidationError
            ? targetStore.setPlannerPlanDurableArtifactValidation(artifact.id, fallbackError.validation, "failed")
            : targetStore.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" });
        emitPlannerPlanArtifactUpdated(failed, targetStore);
        emitProjectStateIfActive(host);
        throw fallbackError;
      }
    }
    const failed = targetStore.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" });
    emitPlannerPlanArtifactUpdated(failed, targetStore);
    emitProjectStateIfActive(host);
    throw error;
  }
}

async function commitPlannerDurableArtifact(
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

function voiceArtifactRetentionInput(input: VoiceArtifactRetentionInput = {}, host = input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost()) {
  const targetStore = host.store;
  const threadId = input.threadId ?? activeThreadIdForHost(host);
  const thread = targetStore.getThread(threadId);
  return {
    workspacePath: thread.workspacePath,
    threadId,
    providerCapabilityId: input.providerCapabilityId,
    voiceStates: targetStore.listMessageVoiceStates(threadId),
  };
}

function inspectVoiceArtifacts(input: VoiceArtifactRetentionInput = {}, host = input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost()) {
  return inspectVoiceArtifactRetention(voiceArtifactRetentionInput(input, host));
}

async function pruneVoiceArtifacts(input: VoiceArtifactRetentionInput = {}, host = input.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost()) {
  const pruned = await pruneVoiceArtifactOrphans(voiceArtifactRetentionInput(input, host));
  clearVoiceStatesForDeletedArtifacts(pruned.deletedPreview, "Voice artifact cache removed this audio file.", host.store);
  emitProjectStateIfActive(host);
  return pruned;
}

function voiceArtifactCacheMaxBytes(): number {
  return Math.max(0, Math.floor(voiceSettings.artifactCacheMaxMb ?? DEFAULT_VOICE_SETTINGS.artifactCacheMaxMb) * 1024 * 1024);
}

async function clearManagedVoiceArtifactCache(reason: string, workspacePath = activeWorkspacePath(), targetStore: ProjectStore = store): Promise<void> {
  try {
    const result = await clearManagedVoiceArtifacts(workspacePath);
    clearVoiceStatesForDeletedArtifacts(result.deletedPreview, `Voice artifact cache cleared on ${reason}.`, targetStore);
    if (result.deletedFileCount > 0 && mainWindow && activeThreadId) emitRuntimeFeatureStateUpdated(targetStore);
  } catch (error) {
    console.warn(`Failed to clear managed voice artifact cache on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function clearImportedWorkspaceContextCache(reason: string, workspacePaths = knownWorkspaceContextPaths()): Promise<void> {
  await Promise.all(
    workspacePaths.map(async (workspacePath) => {
      try {
        await clearImportedWorkspaceContext(workspacePath);
      } catch (error) {
        console.warn(`Failed to clear imported workspace context on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );
}

function clearImportedWorkspaceContextCacheSync(reason: string, workspacePaths = knownWorkspaceContextPaths()): void {
  for (const workspacePath of workspacePaths) {
    try {
      clearImportedWorkspaceContextSync(workspacePath);
    } catch (error) {
      console.warn(`Failed to clear imported workspace context on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function knownWorkspaceContextPaths(): string[] {
  const stores = projectRuntimeHostList().map((host) => host.store);
  if (stores.length === 0 && store) stores.push(store);
  return Array.from(
    new Set(
      stores.flatMap((targetStore) => {
        const workspace = targetStore.getWorkspaceIfOpen();
        if (!workspace) return [];
        return [
          workspace.path,
          ...targetStore.listThreads().map((thread) => thread.workspacePath),
        ];
      }),
    ),
  );
}

function clearManagedVoiceArtifactCacheSync(reason: string, workspacePath: string, targetStore: ProjectStore = store): void {
  try {
    const deletedPaths = clearManagedVoiceArtifactsSync(workspacePath);
    clearVoiceStatesForDeletedArtifacts(deletedPaths, `Voice artifact cache cleared on ${reason}.`, targetStore);
  } catch (error) {
    console.warn(`Failed to clear managed voice artifact cache on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function clearManagedVoiceArtifactCachesForRuntimeHostsSync(reason: string): void {
  const hosts = projectRuntimeHostList();
  if (hosts.length === 0) {
    const workspacePath = store?.getWorkspaceIfOpen()?.path;
    if (workspacePath) clearManagedVoiceArtifactCacheSync(reason, workspacePath, store);
    return;
  }
  for (const host of hosts) clearManagedVoiceArtifactCacheSync(reason, host.workspacePath, host.store);
}

async function enforceVoiceArtifactBudget(workspacePath = activeWorkspacePath(), targetStore: ProjectStore = store): Promise<void> {
  try {
    const result = await pruneManagedVoiceArtifactsToBudget({ workspacePath, maxBytes: voiceArtifactCacheMaxBytes() });
    clearVoiceStatesForDeletedArtifacts(result.deletedPreview, "Voice artifact cache limit removed this audio file.", targetStore);
    if (result.deletedFileCount > 0 && mainWindow && activeThreadId) emitRuntimeFeatureStateUpdated(targetStore);
  } catch (error) {
    console.warn(`Failed to enforce managed voice artifact cache budget: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function clearVoiceStatesForDeletedArtifacts(deletedPaths: string[], error: string, targetStore: ProjectStore = store): void {
  if (deletedPaths.length === 0) return;
  const deleted = new Set(deletedPaths.map(normalizeManagedVoiceArtifactReference));
  for (const thread of targetStore.listThreads()) {
    for (const voiceState of targetStore.listMessageVoiceStates(thread.id)) {
      if (!voiceState.audioPath || !deleted.has(normalizeManagedVoiceArtifactReference(voiceState.audioPath))) continue;
      targetStore.clearMessageVoiceArtifact(voiceState.messageId, error);
    }
  }
}

function normalizeManagedVoiceArtifactReference(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

async function readWindowState(): Promise<PersistedWindowState | undefined> {
  try {
    const parsed = JSON.parse(await readFile(windowStatePath(), "utf8")) as Record<string, unknown>;
    return parsePersistedWindowState(
      parsed,
      app.getVersion(),
      screen.getAllDisplays().map((display) => display.workArea),
    );
  } catch {
    return undefined;
  }
}

function trackWindowState(window: BrowserWindow): void {
  const scheduleSave = () => scheduleWindowStateSave(window);
  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("maximize", scheduleSave);
  window.on("unmaximize", scheduleSave);
  window.on("close", () => void writeWindowState(window));
}

function scheduleWindowStateSave(window: BrowserWindow): void {
  if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(() => void writeWindowState(window), 350);
}

async function writeWindowState(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) return;
  const bounds = window.getNormalBounds();
  try {
    await writeFile(windowStatePath(), JSON.stringify({ ...bounds, maximized: window.isMaximized(), appVersion: app.getVersion() }, null, 2));
  } catch (error) {
    console.warn(`Unable to save window state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ensureWindowVisible(window: BrowserWindow): void {
  const bounds = window.getBounds();
  const isVisible = parsePersistedWindowState(
    { ...bounds, appVersion: app.getVersion() },
    app.getVersion(),
    screen.getAllDisplays().map((display) => display.workArea),
  );
  if (isVisible?.x !== undefined && isVisible.y !== undefined) return;
  window.setBounds(centerBoundsInWorkArea(bounds, screen.getPrimaryDisplay().workArea));
}

function showOrCreateMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow();
    return;
  }
  ensureWindowVisible(mainWindow);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function openThreadMiniWindow(thread: ThreadSummary, messages: ChatMessage[], workingDirectory: string): Promise<void> {
  const renderHtml = () =>
    renderThreadMiniWindowHtml(thread, messages, workingDirectory, {
      theme: currentAppearance().resolvedTheme,
      platform: process.platform,
      thinkingDisplayMode: thinkingDisplaySettings.mode,
    });
  const existing = threadMiniWindows.get(thread.id);
  const miniWindowUrl = `data:text/html;charset=utf-8,${encodeURIComponent(renderHtml())}`;
  if (existing && !existing.isDestroyed()) {
    existing.setTitle(thread.title);
    await existing.loadURL(miniWindowUrl);
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }

  const iconPath = resolveAppIconPath();
  const miniWindow = new BrowserWindow({
    width: 760,
    height: 680,
    minWidth: 420,
    minHeight: 360,
    show: false,
    title: thread.title,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: appearanceBackgroundColor(currentAppearance().resolvedTheme),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  threadMiniWindows.set(thread.id, miniWindow);
  miniWindow.once("closed", () => {
    if (threadMiniWindows.get(thread.id) === miniWindow) threadMiniWindows.delete(thread.id);
  });
  miniWindow.once("ready-to-show", () => {
    if (miniWindow.isDestroyed()) return;
    miniWindow.show();
    miniWindow.focus();
  });
  installExternalNavigationGuards(miniWindow, {
    source: "thread-mini-window",
    allowNavigation: isThreadMiniWindowRendererUrl,
  });
  await miniWindow.loadURL(miniWindowUrl);
  if (!miniWindow.isDestroyed() && !miniWindow.isVisible()) miniWindow.show();
  if (!miniWindow.isDestroyed()) miniWindow.focus();
}

function isThreadMiniWindowRendererUrl(url: string): boolean {
  return url.startsWith("data:text/html;charset=utf-8,");
}

function recordWorkflowRevisionDecisionInChat(
  revision: WorkflowRevisionSummary,
  decision: ResolveWorkflowRevisionInput["decision"],
  targetStore: ProjectStore = store,
): void {
  const thread = targetStore.getWorkflowAgentThreadSummary(revision.workflowThreadId);
  if (!thread.chatThreadId) return;
  const versionLabel = thread.latestVersion ? `version ${thread.latestVersion.version}` : "the current workflow version";
  const content =
    decision === "applied"
      ? `Applied workflow revision ${revision.id}. The active workflow now points at ${versionLabel}.`
      : `Rejected workflow revision ${revision.id}. The workflow remains on ${versionLabel}.`;
  targetStore.addMessage({
    threadId: thread.chatThreadId,
    role: "system",
    content,
    metadata: {
      workflowThreadId: revision.workflowThreadId,
      workflowMode: "plan-edit",
      kind: "workflow_revision_decision",
      status: "done",
      revisionId: revision.id,
      decision,
      versionId: thread.latestVersion?.id,
      version: thread.latestVersion?.version,
    },
  });
}

async function createProjectBoardForProjectHost(input: CreateProjectBoardInput): Promise<DesktopState> {
  const activeHostSnapshot = requireActiveProjectRuntimeHost();
  const workspacePath = resolveRegisteredProjectPathForHost(input.projectId, activeHostSnapshot);
  const host = ensureProjectRuntimeHostForWorkspacePath(workspacePath);
  assertProjectBoardMutationAllowedForActiveThread(host, "create or open a project board");
  const targetStore = host.store;
  const sourceThreadId = activeThreadIdForHost(host);
  const bootstrapInput: Parameters<typeof createOrAdoptProjectBoard>[0] = {
    workspacePath: targetStore.getWorkspace().path,
    getActiveBoard: () => targetStore.getActiveProjectBoard(sourceThreadId),
    createBoard: (boardInput) => targetStore.createProjectBoard({ ...boardInput, sourceThreadId }),
    applyArtifactProjection: (workspacePath, projection) => targetStore.applyProjectBoardArtifactProjection(workspacePath, projection),
    scanSources: () => scanProjectBoardSources(targetStore, { workspacePath: targetStore.getWorkspace().path, threadId: sourceThreadId }),
  };
  if (typeof input.title === "string") bootstrapInput.title = input.title;
  if (typeof input.summary === "string") bootstrapInput.summary = input.summary;
  const bootstrap = await createOrAdoptProjectBoard(bootstrapInput);
  const board = bootstrap.board;
  emitProjectStateIfActive(host);

  const refreshReason =
    bootstrap.kind === "created"
      ? "created"
      : bootstrap.kind === "adopted" && bootstrap.freshness?.status === "stale"
        ? "adopted_stale"
        : undefined;
  if (refreshReason && process.env.AMBIENT_E2E_SKIP_PROJECT_BOARD_SOURCE_REFRESH !== "1") {
    const model = targetStore.getDefaultSettings().model;
    const run = targetStore.createProjectBoardSynthesisRun({ boardId: board.id, model });
    emitProjectStateIfActive(host);
    try {
      await refreshProjectBoardSources(board.id, { runId: run.id, model, targetStore, host });
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "sources_persisted",
        title: refreshReason === "adopted_stale" ? "Adopted board source snapshot refreshed" : "Project board source snapshot ready",
        summary:
          refreshReason === "adopted_stale"
            ? "Adopted .ambient/board artifacts were valid but stale relative to the current checkout. The source snapshot has been refreshed before additional planning."
            : "Source snapshot is ready. Answer the kickoff questions to create the charter. After the charter is active, use Review Charter With Pi to check for source conflicts or missing PM decisions before applying candidate cards.",
        metadata: { sourceRefreshOnly: true, bootstrapKind: bootstrap.kind, refreshReason, artifactFreshness: bootstrap.freshness },
        status: "succeeded",
        completedAt: new Date().toISOString(),
      });
      emitProjectStateIfActive(host);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "failed",
        title: refreshReason === "adopted_stale" ? "Adopted board source refresh failed" : "Initial source scan failed",
        summary: message,
        metadata: { sourceRefreshOnly: true, bootstrapKind: bootstrap.kind, refreshReason, artifactFreshness: bootstrap.freshness, error: message },
        status: "failed",
        error: message,
        completedAt: new Date().toISOString(),
      });
      emitProjectStateIfActive(host);
      throw error;
    }
  }
  return readStateForProjectHostAction(host);
}

async function refineProjectBoardSynthesisForProjectHost(
  host: ProjectRuntimeHost,
  input: RefineProjectBoardSynthesisInput,
): Promise<DesktopState> {
  const targetStore = host.store;
  const synthesisMode = input.mode ?? "board_synthesis";
  const board = requireProjectBoardForAction(input.boardId, targetStore);
  if (synthesisMode === "charter_review") {
    assertProjectBoardCharterReviewAllowed(board);
  } else if (synthesisMode === "source_elaboration") {
    assertProjectBoardCardGenerationAllowed(board, "Add Cards");
  } else {
    assertProjectBoardCardGenerationAllowed(board, "Board synthesis");
  }
  const startedAt = Date.now();
  const model = targetStore.getDefaultSettings().model;
  const previousProposal = input.proposalId
    ? targetStore.getProjectBoardSynthesisProposal(input.proposalId)
    : targetStore.getLatestPendingProjectBoardSynthesisProposal(input.boardId);
  if (input.proposalId && !previousProposal) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
  if (previousProposal && previousProposal.boardId !== input.boardId) throw new Error("Project board synthesis proposal does not belong to this board.");
  const prepared = prepareProjectBoardSynthesisRun({
    boardId: input.boardId,
    model,
    intent: synthesisMode === "source_elaboration" && input.objective?.trim()
      ? "add cards from objective"
      : synthesisMode === "source_elaboration"
        ? "add cards from sources"
        : synthesisMode === "charter_review"
          ? "charter review"
        : "PM review synthesis",
  }, targetStore, host);
  if (prepared.reused) {
    return readStateForProjectHostAction(host);
  }
  const run = prepared.run;
  projectBoardSynthesisPauseRequests.delete(run.id);
  const synthesisAbortController = new AbortController();
  projectBoardSynthesisAbortControllers.set(run.id, synthesisAbortController);
  const progressEmitter = createProjectBoardRunProgressEmitter(run.id, { targetStore, host });
  let progressiveRecordsPersisted = false;
  const shouldPause = () => isProjectBoardSynthesisPauseRequested(run.id, targetStore);
  const abortIfPauseRequested = () =>
    abortProjectBoardSynthesisForPause(run.id, "Project-board PM Review planning pause requested for this synthesis run.", targetStore);
  emitProjectStateIfActive(host);
  try {
    const sources = await scanSourcesForProjectBoard(input.boardId, targetStore);
    const sourceTelemetry = projectBoardSourceTelemetry(sources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "source_scan",
      title: "Scanned project sources",
      summary: `Scanned ${sourceTelemetry.sourceCount} source${sourceTelemetry.sourceCount === 1 ? "" : "s"} and kept ${sourceTelemetry.includedSourceCount} for synthesis.`,
      metadata: sourceTelemetry,
      ...sourceTelemetry,
    });
    emitProjectStateIfActive(host);
    let persistedSources = targetStore.replaceProjectBoardSources(input.boardId, sources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "sources_persisted",
      title: "Persisted source snapshot",
      summary: `Saved ${persistedSources.length} source record${persistedSources.length === 1 ? "" : "s"} for this PM synthesis run.`,
      metadata: { persistedSourceCount: persistedSources.length },
    });
    emitProjectStateIfActive(host);
    persistedSources = await classifyProjectBoardSourcesWithPi(input.boardId, persistedSources, { model, runId: run.id, targetStore, host });
    abortIfPauseRequested();
    await refreshProjectBoardCharterSummaryWithPi(input.boardId, persistedSources, {
      model,
      runId: run.id,
      signal: synthesisAbortController.signal,
      targetStore,
      host,
    });
    abortIfPauseRequested();
    const sourceSelection = selectProjectBoardSynthesisSources(persistedSources, input.sourceIds);
    const synthesisSources = sourceSelection.sources;
    const addCardsObjective = synthesisMode === "source_elaboration" ? input.objective?.trim() : undefined;
    if (sourceSelection.selected) {
      const scopedTelemetry = projectBoardSourceTelemetry(synthesisSources);
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "sources_persisted",
        title: "Selected source scope",
        summary: `Elaborating cards from ${synthesisSources.length} selected source${synthesisSources.length === 1 ? "" : "s"} without replacing existing board work.`,
        metadata: { selectedSourceIds: sourceSelection.selectedSourceIds, ...scopedTelemetry },
        ...scopedTelemetry,
      });
      emitProjectStateIfActive(host);
    }
    if (addCardsObjective) {
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "sources_persisted",
        title: "Captured Add Cards objective",
        summary: `Using a ${addCardsObjective.length.toLocaleString()} character objective to elaborate net-new cards without replacing existing board work.`,
        metadata: {
          objectiveCharCount: addCardsObjective.length,
          selectedSourceScope: sourceSelection.selected,
          selectedSourceIds: sourceSelection.selectedSourceIds,
        },
      });
      emitProjectStateIfActive(host);
    }
    const addCardsObjectiveProvenanceContext = {
      objective: addCardsObjective,
      selectedSourceScope: sourceSelection.selected,
      selectedSourceIds: sourceSelection.selectedSourceIds,
      sourceContextAvailable: synthesisSources.length > 0,
    };
    const deterministicBaseline = synthesizeProjectBoardDraft(synthesisSources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "deterministic_baseline",
      title: "Built deterministic baseline",
      summary: `Prepared a baseline with ${deterministicBaseline.cards.length} card${deterministicBaseline.cards.length === 1 ? "" : "s"} before asking Pi.`,
      metadata: { cardCount: deterministicBaseline.cards.length, questionCount: deterministicBaseline.questions.length },
      cardCount: deterministicBaseline.cards.length,
      questionCount: deterministicBaseline.questions.length,
    });
    emitProjectStateIfActive(host);
    const charterAnswers = projectBoardAnsweredQuestionsForRefinement(input.boardId, targetStore);
    const activeBoard = targetStore.getProjectBoard(input.boardId);
    const charterProjectSummary = activeBoard?.id === input.boardId ? activeBoard.charter?.projectSummary : undefined;
    const sourceScopeAnswers = projectBoardSourceScopeAnswersForRefinement({
      boardId: input.boardId,
      board: activeBoard,
      sources: synthesisSources,
      mode: synthesisMode,
      selectedSourceScope: sourceSelection.selected,
      objective: addCardsObjective,
    });
    const proposalAnswers: ProjectBoardSynthesisRefinementAnswer[] =
      previousProposal?.answers.map((answer) => ({ question: `PM Review: ${answer.question}`, answer: answer.answer, source: "pm_review" })) ?? [];
    const pmReviewActivationReport =
      synthesisMode === "board_synthesis" && previousProposal?.reviewReport ? previousProposal.reviewReport : undefined;
    const refinement =
      sourceScopeAnswers.length > 0 || charterAnswers.length > 0 || proposalAnswers.length > 0 || pmReviewActivationReport
        ? {
            previousDraft: previousProposal ? projectBoardSynthesisDraftFromProposal(previousProposal) : deterministicBaseline,
            answers: [...sourceScopeAnswers, ...charterAnswers, ...proposalAnswers],
            // The caller knows which flow this is; never re-infer it from answer text.
            mode: synthesisMode === "source_elaboration" ? ("additive" as const) : ("refine" as const),
            ...(pmReviewActivationReport ? { pmReviewReport: pmReviewActivationReport } : {}),
          }
          : undefined;
    const provider = createProjectBoardSynthesisProvider(model, targetStore);
    if (synthesisMode === "charter_review") {
      const pmReviewGitContext = await projectBoardPmReviewGitContextForBoard(input.boardId, targetStore);
      const result = await provider.reviewCharterWithTelemetry({
        sources: synthesisSources,
        projectName: targetStore.getWorkspace().name,
        refinement,
        ...(charterProjectSummary ? { charterProjectSummary } : {}),
        gitContext: pmReviewGitContext,
        onProgress: (progress) => {
          if (progress.metadata?.streaming === true) {
            progressEmitter.update({
              stage: progress.stage,
              promptCharCount: progress.promptCharCount,
              responseCharCount: progress.responseCharCount,
              cardCount: progress.cardCount,
              questionCount: progress.questionCount,
            });
            abortIfPauseRequested();
            return;
          }
          progressEmitter.flush();
          targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
            stage: progress.stage,
            title: progress.title,
            summary: progress.summary,
            metadata: progress.metadata,
            promptCharCount: progress.promptCharCount,
            responseCharCount: progress.responseCharCount,
            cardCount: progress.cardCount,
            questionCount: progress.questionCount,
          });
          emitProjectStateIfActive(host);
          abortIfPauseRequested();
        },
        signal: synthesisAbortController.signal,
      });
      recordProjectBoardSynthesisProgressiveRecords(run.id, result.draft, synthesisSources, undefined, undefined, targetStore);
      const proposal = createOrUpdateProjectBoardSynthesisProposalForRun({
        boardId: input.boardId,
        runId: run.id,
        synthesis: result.draft,
        reviewReport: result.reviewReport,
        model,
        durationMs: Date.now() - startedAt,
        targetStore,
      });
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "proposal_created",
        title: "Created lightweight PM Review report",
        summary: `Created a zero-card charter review report with ${result.reviewReport.blockingQuestions.length} blocking question${
          result.reviewReport.blockingQuestions.length === 1 ? "" : "s"
        } and readiness ${result.reviewReport.readiness.replace(/_/g, " ")}.`,
        metadata: {
          ...result.telemetry,
          proposalId: proposal.id,
          readiness: result.reviewReport.readiness,
          sourceConfidence: result.reviewReport.sourceConfidence,
          gitState: result.reviewReport.gitState,
          reviewReport: true,
          cardCount: 0,
          questionCount: result.reviewReport.blockingQuestions.length,
          generatedCardPolicy: "zero_cards",
        },
        status: "succeeded",
        proposalId: proposal.id,
        promptCharCount: result.telemetry.promptCharCount,
        responseCharCount: result.telemetry.responseCharCount,
        cardCount: 0,
        questionCount: result.telemetry.questionCount,
        completedAt: new Date().toISOString(),
      });
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      emitProjectStateIfActive(host);
      return readStateForProjectHostAction(host);
    }
    const plannerWorkspace = await createProjectBoardPlannerWorkspace({
      projectPath: targetStore.getWorkspace().path,
      boardId: input.boardId,
      runId: run.id,
      projectName: targetStore.getWorkspace().name,
      operation: synthesisMode === "source_elaboration" ? "source_elaboration" : "board_synthesis",
      sources: synthesisSources,
    });
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "sources_persisted",
      title: "Prepared planner session workspace",
      summary: `Wrote ${plannerWorkspace.sources.length} source file${
        plannerWorkspace.sources.length === 1 ? "" : "s"
      }, a planner-session descriptor, ledger, and JSONL output targets for Pi planning artifacts.`,
      metadata: {
        plannerSessionId: plannerWorkspace.sessionId,
        plannerWorkspaceRoot: plannerWorkspace.rootPath,
        plannerSessionDescriptor: plannerWorkspace.sessionPath,
        plannerLedgerPath: plannerWorkspace.ledgerPath,
        plannerWorkspaceManifest: plannerWorkspace.manifestPath,
        aggregateJsonlPath: plannerWorkspace.aggregateJsonlPath,
        sourceFileCount: plannerWorkspace.sources.length,
        batchPolicy: plannerWorkspace.batchPolicy,
        executionMode: "pi_session_stream",
        compatibilityFallback: "direct_chat_compat",
        sourceElaboration: synthesisMode === "source_elaboration",
        addCardsObjective: Boolean(addCardsObjective),
        addCardsObjectiveCharCount: addCardsObjective?.length,
        pmReviewActivation: Boolean(pmReviewActivationReport),
        pmReviewReadiness: pmReviewActivationReport?.readiness,
        pmReviewConstraintCount: pmReviewActivationReport?.cardGenerationConstraints.length,
      },
    });
    emitProjectStateIfActive(host);
    const onProgress = (progress: AmbientProjectBoardSynthesisProgress) => {
      if (progress.metadata?.streaming === true) {
        progressEmitter.update({
          stage: progress.stage,
          promptCharCount: progress.promptCharCount,
          responseCharCount: progress.responseCharCount,
          cardCount: progress.cardCount,
          questionCount: progress.questionCount,
        });
        abortIfPauseRequested();
        return;
      }
      progressEmitter.flush();
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: progress.stage,
        title: progress.title,
        summary: progress.summary,
        metadata: progress.metadata,
        promptCharCount: progress.promptCharCount,
        responseCharCount: progress.responseCharCount,
        cardCount: progress.cardCount,
        questionCount: progress.questionCount,
      });
      emitProjectStateIfActive(host);
      abortIfPauseRequested();
    };
    const onProgressiveRecords = (batch: AmbientProjectBoardSynthesisProgressiveBatch) => {
      progressiveRecordsPersisted = true;
      progressEmitter.flush();
      const annotatedBatch = annotateProjectBoardProgressiveRecordsWithObjectiveProvenance(
        batch.records,
        addCardsObjectiveProvenanceContext,
      );
      recordProjectBoardSynthesisProgressiveBatch(
        run.id,
        {
          ...batch,
          records: [...annotatedBatch.records, ...annotatedBatch.warningRecords],
          accumulatedRecordCount: batch.accumulatedRecordCount + annotatedBatch.warningRecords.length,
        },
        targetStore,
      );
      const progressiveProposal = upsertProjectBoardProgressiveProposalFromRun({
        boardId: input.boardId,
        runId: run.id,
        fallback: previousProposal ? projectBoardSynthesisDraftFromProposal(previousProposal) : deterministicBaseline,
        model,
        startedAt,
        targetStore,
      });
      if (pmReviewActivationReport && progressiveProposal?.cards.length) {
        const pmReviewProgressiveDraftInboxApply = applyPmReviewActivationProposalToDraftInbox(progressiveProposal, targetStore);
        targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
          stage: "board_applied",
          title: "Rendered PM Review activation cards to Draft Inbox",
          summary: `Draft Inbox now has ${pmReviewProgressiveDraftInboxApply.draftCardIds.length} generated activation card${
            pmReviewProgressiveDraftInboxApply.draftCardIds.length === 1 ? "" : "s"
          } from the lightweight PM Review recommendation while planning continues.`,
          metadata: {
            proposalId: progressiveProposal.id,
            pmReviewActivation: true,
            progressive: true,
            autoAcceptedSourceIds: pmReviewProgressiveDraftInboxApply.autoAcceptedSourceIds,
            acceptedSourceIds: pmReviewProgressiveDraftInboxApply.acceptedSourceIds,
            mergedSourceIds: pmReviewProgressiveDraftInboxApply.mergedSourceIds,
            draftCardIds: pmReviewProgressiveDraftInboxApply.draftCardIds,
          },
          proposalId: progressiveProposal.id,
          cardCount: pmReviewProgressiveDraftInboxApply.draftCardIds.length,
        });
      }
      emitProjectStateIfActive(host);
      abortIfPauseRequested();
    };
    let result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["synthesizePlannerBatchesWithTelemetry"]>>;
    try {
      result = projectBoardShouldUseSectionedPlanningForWorkflow(synthesisSources, refinement)
        ? await provider.synthesizeSectionedWithTelemetry({
            sources: synthesisSources,
            projectName: targetStore.getWorkspace().name,
            refinement,
            ...(charterProjectSummary ? { charterProjectSummary } : {}),
            onProgress,
            onProgressiveRecords,
            plannerWorkspace,
            shouldPause,
            signal: synthesisAbortController.signal,
          })
        : await provider.synthesizePlannerBatchesWithTelemetry({
            sources: synthesisSources,
            projectName: targetStore.getWorkspace().name,
            refinement,
            ...(charterProjectSummary ? { charterProjectSummary } : {}),
            onProgress,
            onProgressiveRecords,
            plannerWorkspace,
            shouldPause,
            signal: synthesisAbortController.signal,
          });
    } catch (error) {
      if (synthesisMode !== "source_elaboration" || !isRecoverableEmptyPlannerCardFailure(error)) throw error;
      const recoveredDraft = deterministicProjectBoardSourceElaborationDraft({
        sources: synthesisSources,
        objective: addCardsObjective,
        projectName: targetStore.getWorkspace().name,
      });
      const recoveredRecords = projectBoardProgressiveRecordsFromDraft({ draft: recoveredDraft, sources: synthesisSources });
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "schema_validation",
        title: "Recovered deterministic Add Cards proposal",
        summary: `Ambient/Pi did not return candidate cards for the selected source scope, so Ambient recovered ${recoveredDraft.cards.length} deterministic card${
          recoveredDraft.cards.length === 1 ? "" : "s"
        } from the promoted source artifact.`,
        metadata: {
          recovery: "deterministic_source_elaboration",
          providerFailure: projectBoardSynthesisErrorMessage(error),
          selectedSourceIds: sourceSelection.selectedSourceIds,
          sourceElaboration: true,
          cardCount: recoveredDraft.cards.length,
          progressiveRecordCount: recoveredRecords.length,
        },
        promptCharCount: 0,
        responseCharCount: 0,
        cardCount: recoveredDraft.cards.length,
        questionCount: recoveredDraft.questions.length,
      });
      emitProjectStateIfActive(host);
      result = {
        draft: recoveredDraft,
        progressiveRecords: recoveredRecords,
        telemetry: {
          promptCharCount: 0,
          responseCharCount: 0,
          requestDurationMs: Date.now() - startedAt,
          cardCount: recoveredDraft.cards.length,
          questionCount: recoveredDraft.questions.length,
          progressiveRecordCount: recoveredRecords.length,
          partial: true,
        },
      };
    }
    progressEmitter.flush();
    const pauseRequestedAfterResult = result.telemetry.paused || isProjectBoardSynthesisPauseRequested(run.id, targetStore);
    const objectiveAnnotatedDraft = annotateProjectBoardDraftWithObjectiveProvenance(
      result.draft,
      addCardsObjectiveProvenanceContext,
    );
    const synthesisDraft = objectiveAnnotatedDraft.draft;
    const resultProgressiveRecordAnnotation = result.progressiveRecords
      ? annotateProjectBoardProgressiveRecordsWithObjectiveProvenance(
          result.progressiveRecords,
          addCardsObjectiveProvenanceContext,
        )
      : undefined;
    const resultProgressiveRecords = resultProgressiveRecordAnnotation
      ? [...resultProgressiveRecordAnnotation.records, ...resultProgressiveRecordAnnotation.warningRecords]
      : objectiveAnnotatedDraft.warningRecords.length > 0
        ? [
            ...projectBoardProgressiveRecordsFromDraft({
              draft: synthesisDraft,
              sources: synthesisSources,
            }),
            ...objectiveAnnotatedDraft.warningRecords,
          ]
        : undefined;
    if (!progressiveRecordsPersisted) {
      recordProjectBoardSynthesisProgressiveRecords(run.id, synthesisDraft, synthesisSources, undefined, resultProgressiveRecords, targetStore);
    }
    recordProjectBoardSynthesisCardBuildEvents(run.id, synthesisDraft.cards, targetStore);
    emitProjectStateIfActive(host);
    const proposal = createOrUpdateProjectBoardSynthesisProposalForRun({
      boardId: input.boardId,
      runId: run.id,
      synthesis: synthesisDraft,
      model,
      durationMs: Date.now() - startedAt,
      targetStore,
    });
    const pmReviewDraftInboxApply = pmReviewActivationReport ? applyPmReviewActivationProposalToDraftInbox(proposal, targetStore) : undefined;
    const partialSectionSummary =
      result.telemetry.failedSectionCount && result.telemetry.failedSectionCount > 0
        ? ` ${result.telemetry.failedSectionCount} source section${result.telemetry.failedSectionCount === 1 ? "" : "s"} failed and can be retried.`
        : "";
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "proposal_created",
      title: result.telemetry.partial ? "Created partial PM Review proposal" : "Created PM Review proposal",
      summary: `Created a reviewable proposal with ${synthesisDraft.cards.length} card${
        synthesisDraft.cards.length === 1 ? "" : "s"
      } and ${synthesisDraft.questions.length} question${synthesisDraft.questions.length === 1 ? "" : "s"}.${partialSectionSummary}`,
      metadata: {
        proposalId: proposal.id,
        ...result.telemetry,
        pmReviewActivationDraftInboxApplied: Boolean(pmReviewDraftInboxApply),
        pmReviewActivationDraftCardCount: pmReviewDraftInboxApply?.draftCardIds.length,
      },
      status: pmReviewDraftInboxApply ? undefined : "succeeded",
      proposalId: proposal.id,
      promptCharCount: result.telemetry.promptCharCount,
      responseCharCount: result.telemetry.responseCharCount,
      cardCount: result.telemetry.cardCount,
      questionCount: result.telemetry.questionCount,
      completedAt: pmReviewDraftInboxApply || pauseRequestedAfterResult ? undefined : new Date().toISOString(),
    });
    if (pmReviewDraftInboxApply) {
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "board_applied",
        title: "Generated Draft Inbox cards from PM Review",
        summary: `Applied ${pmReviewDraftInboxApply.draftCardIds.length} generated draft card${
          pmReviewDraftInboxApply.draftCardIds.length === 1 ? "" : "s"
        } from the lightweight PM Review recommendation.`,
        metadata: {
          proposalId: proposal.id,
          pmReviewActivation: true,
          autoAcceptedSourceIds: pmReviewDraftInboxApply.autoAcceptedSourceIds,
          acceptedSourceIds: pmReviewDraftInboxApply.acceptedSourceIds,
          mergedSourceIds: pmReviewDraftInboxApply.mergedSourceIds,
          draftCardIds: pmReviewDraftInboxApply.draftCardIds,
        },
        status: pauseRequestedAfterResult ? undefined : "succeeded",
        proposalId: proposal.id,
        promptCharCount: result.telemetry.promptCharCount,
        responseCharCount: result.telemetry.responseCharCount,
        cardCount: pmReviewDraftInboxApply.draftCardIds.length,
        questionCount: result.telemetry.questionCount,
        completedAt: pauseRequestedAfterResult ? undefined : new Date().toISOString(),
      });
    }
    if (pauseRequestedAfterResult) {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      targetStore.markProjectBoardSynthesisRunPaused({
        boardId: input.boardId,
        runId: run.id,
        reason: result.telemetry.paused
          ? "PM Review planning paused at the requested checkpoint."
          : "PM Review planning paused after the synthesis result completed while a pause was requested.",
        metadata: {
          durationMs: Date.now() - startedAt,
          pauseRequestedAfterResult: !result.telemetry.paused,
          pmReviewActivation: Boolean(pmReviewActivationReport),
          progressiveRecordsPersisted,
          ...result.telemetry,
        },
      });
      emitProjectStateIfActive(host);
    } else {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      if (pmReviewDraftInboxApply && pmReviewDraftInboxApply.draftCardIds.length > 0) {
        await consolidateProjectBoardSynthesisCandidates({ boardId: input.boardId, runId: run.id, model, targetStore, host });
      }
    }
  } catch (error) {
    if (isProjectBoardSynthesisPauseRequested(run.id, targetStore) || synthesisAbortController.signal.aborted) {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      progressEmitter.flush();
      const abortReason =
        synthesisAbortController.signal.reason instanceof Error
          ? synthesisAbortController.signal.reason.message
          : synthesisAbortController.signal.aborted
            ? "Transport aborted after pause was requested."
            : error instanceof Error
              ? error.message
              : String(error);
      targetStore.markProjectBoardSynthesisRunPaused({
        boardId: input.boardId,
        runId: run.id,
        reason: "PM Review planning paused after canceling the active Ambient/Pi stream.",
        metadata: {
          durationMs: Date.now() - startedAt,
          transportAbort: true,
          abortReason,
          progressiveRecordsPersisted,
        },
      });
      emitProjectStateIfActive(host);
      return readStateForProjectHostAction(host);
    }
    projectBoardSynthesisPauseRequests.delete(run.id);
    projectBoardSynthesisAbortControllers.delete(run.id);
    progressEmitter.flush();
    const message = error instanceof Error ? error.message : String(error);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "failed",
      title: "Synthesis run failed",
      summary: message,
      metadata: { error: message },
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    emitProjectStateIfActive(host);
    throw error;
  }
  return readStateForProjectHostAction(host);
}

function registerIpc(): void {
  registerMainIpc({
    AMBIENT_KEYS_URL,
    AmbientWorkflowExplorationProvider,
    AmbientWorkflowLabJudgeProvider,
    acceptMcpToolDescriptorReviewForDesktop,
    activeGitContextForProjectHost,
    activeHost,
    activeThreadId,
    activeThreadIdForHost,
    activeVoiceSttContextForProjectHost,
    activeWorkflowRunController,
    activeWorkflowRunHost,
    activeWorkspaceFileContextForProjectHost,
    allPluginMcpRuntimeSnapshots,
    ambientCliCapabilityGrantsForWorkflowRequest,
    ambientMcpInstallPreview,
    ambientRetryPolicyFromCurrentSettings,
    ambientRetryPolicyFromSettings,
    analyzeMiniCpmVision,
    answerWorkflowDiscoveryQuestion,
    app,
    applyProjectBoardGitProjectionAndBroadcast,
    applyProjectBoardLiveSynthesis,
    archiveProjectChats,
    assertProjectBoardMutationAllowedForActiveThread,
    assertTrustedMainWindowIpc,
    attachWorktreeForThread,
    browserLoginBrokerEnabled,
    buildContainerRuntimeInstallPlanFromProbe,
    buildWorkflowDebugRewriteContext,
    buildWorkflowDebugRewritePromptSection,
    buildWorkflowRecoveryPlan,
    cancelSttTranscription,
    claimProjectBoardGitCardArtifacts,
    classifyToolPermission,
    clearAgentMemory,
    getAgentMemoryDiagnostics,
    runAgentMemoryEmbeddingLifecycleAction,
    clearMessageVoiceArtifact,
    clearPiExtensionSandboxHistory,
    clearPiPrivilegedPackageHistory,
    clearSavedAmbientApiKey,
    clipboard,
    codexPluginTrustFingerprint,
    collectVoiceOnboardingHostFacts,
    commitGit,
    commitProjectBoardGitArtifacts,
    compileWorkflowArtifact,
    createAndRecordCheckpoint,
    createChatExportBundle,
    createDiagnosticBundle,
    createGitBranch,
    createMainDiagnosticSource,
    createMcpInstallCatalog,
    createPermanentWorktree,
    createPrivilegedActionAdapter,
    createProjectBoardForProjectHost,
    createPullRequestUrl,
    createWorkflowDebugRewriteRevision,
    createWorkflowDiscoveryProvider,
    createWorkflowSampleArtifact,
    currentFeatureFlagSnapshot,
    describeWorkflowDiscoveryCapability,
    describeWorkspaceAbsoluteContextPaths,
    describeWorkspaceContextReferences,
    desktopUpdateService,
    dialog,
    disablePiPrivilegedPackage,
    discardGitFile,
    discoverAmbientCliPackages,
    discoverCapabilityBuilderHistory,
    discoverPiExtensionSandboxPackages,
    discoverPiPrivilegedPackages,
    disposeProjectRuntimeHost,
    emitBrowserStateForHost,
    emitMainWindowDesktopEvent,
    emitOrchestrationUpdated,
    emitPermissionAuditCreated,
    emitPermissionGrantCreated,
    emitPermissionGrantRevoked,
    emitPlannerPlanArtifactUpdated,
    emitPluginCatalogUpdated,
    emitProjectScopedEvent,
    emitProjectStateIfActive,
    emitRuntimeFeatureStateUpdated,
    emitThreadUpdated,
    emitWorkflowEvent,
    emitWorkflowRecordingLibraryStateChanged,
    emitWorkflowUpdated,
    ensureProjectRuntimeHostForWorkspacePath,
    ensureWorkflowPluginTrusted,
    executeContainerRuntimeManagedInstallAction,
    existsSync,
    expireProjectBoardGitCardClaimArtifacts,
    exportProjectBoardGitArtifacts,
    fetchGit,
    firstPartyWorkflowConnectorAccountAuthorizer,
    firstPartyWorkflowConnectorDescriptors,
    firstPartyWorkflowConnectorRegistrations,
    forgetActiveWorkflowRunsForController,
    formatPiExtensionSandboxInstallApprovalDetail,
    formatPiPrivilegedInstallApprovalDetail,
    formatPiResourceCountsForPermission,
    generatePlannerDurableArtifact,
    getAmbientProviderStatus,
    getAppLogs,
    getProjectBoardGitSyncStatus,
    getWorkspaceDiff,
    getWorkspaceGitStatus,
    googleWorkspaceCliInstaller,
    googleWorkspaceSetupService,
    handleIpc,
    hydrateSearchRoutingSettingsForActiveWorkspace,
    importDiagnosticBundleFromFile,
    initialActiveThreadIdForStore,
    initializeGitRepository,
    inspectVoiceArtifacts,
    installMcpDefaultCapabilityForDesktop,
    installMcpRegistryServerForDesktop,
    installModelProviderEndpoint,
    installPiExtensionSandboxPackage,
    installPiPrivilegedPackage,
    invokeWorkflowNativeTool,
    isActiveProjectRuntimeHost,
    isGoogleWorkspaceSetupUrl,
    isLoopbackWebUrl,
    join,
    launchContainerRuntimeInstallAction,
    listGlobalWorkflowAgentFolders,
    listGlobalWorkflowRecordingLibrary,
    listLocalDeepResearchRunsForSettings,
    listManagedDevServers,
    listSttProvidersWithValidation,
    listVoiceProvidersWithCachedVoices,
    listWorkspaceFiles,
    listWorkspaceOpenTargets,
    mainWindow,
    markStaleWorkflowRunForRecoveryIfNeeded,
    mcpContainerRuntimeSetupStatePath,
    mkdirSync,
    normalizeWorkspacePath,
    officePreviewService,
    openAllowedExternalUrl,
    openContainerRuntimeApplication,
    openGoogleWorkspaceUrl,
    openRendererLocalUrlInAmbientBrowser,
    openThreadMiniWindow,
    openWorkspaceTarget,
    packageJson,
    parseExternalOpenUrl,
    parseThreadPermissionModeChange,
    parseThreadSettingsUpdate,
    pauseProjectBoardSynthesisForProjectHost,
    permanentWorktreeBranchName,
    permissionGrantTargetHash,
    permissionGrantWorkspacePath,
    permissionModeChangeAuditDetail,
    permissions,
    pluginHost,
    pluginMcpRegistrationsForThread,
    pluginStateReaderForStore,
    prepareAndRecordNextOrchestrationRuns,
    prepareWorktreeForThread,
    previewPiExtensionSandboxInstall,
    privilegedActionAdapterSelectionFromEnv,
    privilegedCredentials,
    probeAmbientMcpContainerRuntimeStatus,
    probeContainerRuntime,
    projectRegistry,
    projectRuntimeHostForTerminal,
    projectRuntimeHostForWorkflowRun,
    projectRuntimeHostForWorkspacePath,
    pruneVoiceArtifacts,
    pullGit,
    pullProjectBoardGitArtifacts,
    pushGit,
    pushProjectBoardGitArtifacts,
    readActiveLocalFilePreview,
    readActiveWorkspaceFile,
    readAmbientApiKey,
    readAmbientPluginRegistry,
    readAutoDispatchStatus,
    readCodexHostedMarketplaceReport,
    readCodexPluginCatalog,
    readCurrentOrchestrationBoard,
    readFirstPartyGoogleIntegration,
    readGitReviewForProjectHost,
    readOrchestrationWorkflowReadiness,
    readState,
    readStateForProjectHostAction,
    readWorkflowDashboard,
    readWorkflowRunDetail,
    recordActiveProjectBoardExecutionReadinessBlocker,
    recordBrowserControlAudit,
    recordBrowserProfileAudit,
    recordContainerRuntimeDeferred,
    recordContainerRuntimeInstallLaunched,
    recordProjectBoardSynthesisSectionDecision,
    recordWorkflowRevisionDecisionInChat,
    redactGoogleWorkspaceSetupState,
    refineProjectBoardSynthesisForProjectHost,
    refreshGoogleWorkspaceConnectorMode,
    refreshProjectBoardSourcesForProjectHost,
    refreshVoiceProviderCatalog,
    regenerateMessageVoice,
    regenerateProjectBoardDecisionDrafts,
    regenerateProjectBoardSourceDrafts,
    releaseProjectBoardGitCardClaimArtifacts,
    rememberActiveWorkflowRun,
    rendererLocalPreviewServers,
    repairProjectBoardWorkflow,
    requestPermissionWithGrantRegistry,
    requireActiveProjectRuntimeHost,
    requireProjectBoardDogfoodTestHook,
    requireProjectBoardForAction,
    requireProjectRuntimeHostForAutomationSchedule,
    requireProjectRuntimeHostForAutomationScheduleTarget,
    requireProjectRuntimeHostForAutomationThread,
    requireProjectRuntimeHostForCallableWorkflowTask,
    requireProjectRuntimeHostForOrchestrationRun,
    requireProjectRuntimeHostForOrchestrationTask,
    requireProjectRuntimeHostForOrchestrationWorkspace,
    requireProjectRuntimeHostForPermissionGrant,
    requireProjectRuntimeHostForPermissionGrantInput,
    requireProjectRuntimeHostForPlannerPlanArtifact,
    requireProjectRuntimeHostForProjectBoard,
    requireProjectRuntimeHostForProjectBoardCard,
    requireProjectRuntimeHostForProjectBoardQuestion,
    requireProjectRuntimeHostForProjectBoardSource,
    requireProjectRuntimeHostForProjectBoardSynthesisProposal,
    requireProjectRuntimeHostForSubagentRun,
    requireProjectRuntimeHostForSubagentWaitBarrier,
    requireProjectRuntimeHostForThread,
    requireProjectRuntimeHostForThreadAction,
    requireProjectRuntimeHostForWorkflowArtifact,
    requireProjectRuntimeHostForWorkflowLabRun,
    requireProjectRuntimeHostForWorkflowRecording,
    requireProjectRuntimeHostForWorkflowRevision,
    requireProjectRuntimeHostForWorkflowRun,
    requireProjectRuntimeHostForWorkflowThread,
    requireProjectRuntimeHostForWorkflowVersion,
    rerunProjectBoardProof,
    resetProjectRuntimeAndPluginServers,
    resetRuntimeAndPluginServers,
    resolveLocalFilePath,
    resolveProjectBoardGitCardClaimConflictsArtifacts,
    resolveRegisteredProjectPathForHost,
    resolveSubagentApprovalDecision,
    resolveWorkflowApproval,
    resolveWorkflowDiscoveryAccessRequest,
    resolveWorkspacePathForOpen,
    restartProjectRuntimeMcpRuntime,
    restoreLatestGitCheckpoint,
    restoreWorkflowVersion,
    retryProjectBoardSynthesisForProjectHost,
    revalidateWorkflowArtifact,
    revealMessageVoiceArtifact,
    reviewFinishedProjectBoardRun,
    reviewWorkflowArtifact,
    revokePluginGrantsForLabels,
    runLocalModelRuntimeLifecycleAction,
    runWorkflowArtifact,
    runWorkflowLab,
    runWorkflowThreadExploration,
    saveAmbientApiKey,
    saveAmbientCliPackageEnvSecret,
    saveCapabilityBuilderEnvSecret,
    saveMcpServerEnvSecret,
    saveModelProviderCredential,
    saveSttTestAudio,
    scanPiPrivilegedPackage,
    scheduleAutoDispatch,
    searchRoutingSettings,
    searchWorkflowDiscoveryCapabilities,
    searchWorkspace,
    secureInputs,
    seedProjectBoardCanonicalProjectionDogfoodForProjectHost,
    seedProjectBoardDeliverableIntegrationDogfoodForProjectHost,
    seedProjectBoardProofJudgmentDogfoodForProjectHost,
    seedProjectBoardSemanticIdleDogfoodRun,
    selectAmbientCliPackageForSecret,
    setAutoDispatchEnabled,
    setProjectHostActiveThreadId,
    setSttTtsSpeaking,
    setThemePreference,
    setupLocalDeepResearch,
    setupMiniCpmVision,
    setupSttProvider,
    shell,
    stageAllGitFiles,
    stageGitFile,
    startPreparedOrchestrationRun,
    startProjectBoardSynthesisAfterPlanPromotion,
    startWorkflowDiscovery,
    startWorkflowRevisionDiscovery,
    stopManagedDevServer,
    stopProjectRuntimeMcpRuntime,
    store,
    suggestProjectBoardClarificationDefaults,
    suggestProjectBoardKickoffDefaults,
    suggestProjectBoardProof,
    switchWorkspace,
    switchWorkspaceBranch,
    terminalStartTokens,
    testAmbientApiKey,
    threadWorkingDirectory,
    transcribeSttAudio,
    uninstallMcpServerForDesktop,
    uninstallPiExtensionSandboxPackage,
    uninstallPiPrivilegedPackage,
    unstageAllGitFiles,
    unstageGitFile,
    updateFeatureFlagSettings,
    updateMemorySettings,
    updateLocalDeepResearchSettings,
    updateMediaPlaybackSettings,
    updateModelRuntimeSettings,
    updatePlannerSettings,
    updateProjectBoardWorkflowRaw,
    updateProjectBoardWorkflowSettings,
    updateSearchRoutingSettings,
    updateSttSettings,
    updateThinkingDisplaySettings,
    updateVoiceSettings,
    updateWorkflowArtifactSource,
    updateWorkflowConnectorGrant,
    withBrowserState,
    workflowAgentControlThread,
    workflowAgentIpcContextForDiscoveryQuestion,
    workflowAgentIpcContextForWorkflowThread,
    workflowArtifactIpcContext,
    workflowArtifactIpcContextForHost,
    workflowCompileIpcContext,
    workflowDebugRewriteIpcContext,
    workflowDebugRewriteUserRequest,
    workflowDiscoveryPolicyContextForCapabilityLookup,
    workflowProjectIpcContext,
    workflowToolDescriptorsFromPluginRegistry,
    workspaceInventoryConnector,
    workspacePathForRelativeArtifactPath,
    workspaceStateForThread,
    writeContainerRuntimeManagedInstallRedactedLog,
    writeFile,
    writePrivilegedActionRedactedLog,
  });
}

function switchWorkspace(workspacePath: string, requestedThreadId?: string): DesktopState {
  clearImportedWorkspaceContextCacheSync("workspace-switch");
  const host = activateProjectRuntimeHost(workspacePath);
  clearImportedWorkspaceContextCacheSync("workspace-switch");
  runWorkflowTraceRetentionSweep("workspace-switch", host);
  scheduleWorkflowTraceRetentionSweep();
  host.autoDispatch.enabled = host.store.getAutomationAutoDispatchEnabled();
  host.autoDispatch.lastError = undefined;
  if (host.autoDispatch.enabled) scheduleAutoDispatch(1_000, host);
  projectRegistry.register(host.store.getWorkspace().path);
  const threads = host.store.listThreads();
  setActiveThreadId(
    requestedThreadId && threads.some((thread) => thread.id === requestedThreadId)
      ? requestedThreadId
      : initialActiveThreadId(),
  );
  return readState(activeThreadId);
}

function setDockIcon(iconPath: string | undefined): void {
  if (process.platform === "darwin" && iconPath) {
    app.dock?.setIcon(iconPath);
  }
}

app.setName("Ambient Desktop");
if (process.env.AMBIENT_E2E_USER_DATA && !app.isReady()) {
  mkdirSync(process.env.AMBIENT_E2E_USER_DATA, { recursive: true });
  app.setPath("userData", process.env.AMBIENT_E2E_USER_DATA);
}

export async function startAmbientDesktopApp(): Promise<void> {
  await startApp();
}

async function startApp(): Promise<void> {
  const userDataPath = app.getPath("userData");
  const migration = migrateAmbientUserData({
    currentUserDataPath: userDataPath,
    legacyUserDataPaths: ambientLegacyUserDataPaths(userDataPath),
  });
  if (migration.importedProjectPaths.length > 0 || migration.copiedFiles.length > 0) {
    console.log(
      `[startup] Migrated Ambient Desktop user data: ${migration.importedProjectPaths.length} project path(s), ${migration.copiedFiles.length} file(s).`,
    );
  }
  applyThemePreference(await readThemePreference(appearancePreferencesPath()));
  mediaPlaybackSettings = await readMediaPlaybackSettings(appearancePreferencesPath());
  thinkingDisplaySettings = await readThinkingDisplaySettings(appearancePreferencesPath());
  plannerSettings = await readPlannerSettings(appearancePreferencesPath());
  localDeepResearchSettings = await readLocalDeepResearchSettings(appearancePreferencesPath());
  searchRoutingSettings = await readSearchRoutingSettings(appearancePreferencesPath());
  voiceSettings = await readVoiceSettings(appearancePreferencesPath());
  sttSettings = await readSttSettings(appearancePreferencesPath());
  nativeTheme.on("updated", publishAppearanceUpdated);
  const googleOAuthProviders = googleWorkspaceOAuthProvidersFromEnv(process.env);
  googleWorkspaceCliInstaller = new GoogleWorkspaceCliInstaller({
    toolsRoot: join(userDataPath, "tools"),
  });
  officePreviewService = new OfficePreviewService({
    cacheRoot: join(userDataPath, "office-previews"),
    env: process.env,
  });
  googleWorkspaceCliAdapter = new GoogleWorkspaceCliAdapter({
    appUserDataPath: userDataPath,
    env: process.env,
    managedBinaryPath: () => googleWorkspaceCliInstaller.binaryPath(),
    onDiagnostic: (entry) => {
      const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
      console[entry.level === "error" ? "error" : entry.level === "warning" ? "warn" : "log"](`[google-gws] ${entry.message}${details}`);
    },
  });
  refreshGoogleWorkspaceConnectorMode();
  googleWorkspaceSetupService = new GoogleWorkspaceSetupService({
    adapter: googleWorkspaceCliAdapter,
    accountsPath: join(userDataPath, "google-workspace-cli", "accounts.json"),
    env: process.env,
    openExternal: openGoogleWorkspaceUrl,
  });
  await googleWorkspaceSetupService.loadAccounts();
  googleWorkspaceMethodBroker = new GoogleWorkspaceMethodBroker(googleWorkspaceCliAdapter, {
    resolveAccountHint: (accountHint) => googleWorkspaceSetupService.resolveAccountHintForCall(accountHint),
  });
  pluginAuthService = new PluginAuthService({
    providers: googleOAuthProviders,
    tokenVault: new SafeStorageWorkflowConnectorTokenVault(join(userDataPath, "plugin-auth", "tokens.json"), safeStorage),
  });
  if (googleWorkspaceConnectorMode === "ambient_oauth") {
    googleSidecarSupervisor = new GoogleSidecarSupervisor({
      appRoot: process.cwd(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      onDiagnostic: (entry) => {
        const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
        console[entry.level === "error" ? "error" : entry.level === "warning" ? "warn" : "log"](`[google-sidecar] ${entry.message}${details}`);
      },
    });
  }
  pluginHost = new AmbientPluginHost({
    pluginAuth: pluginAuthService,
  });
  app.setAboutPanelOptions({
    applicationName: "Ambient Desktop",
    applicationVersion: app.getVersion(),
    version: `Electron ${process.versions.electron ?? "unknown"}`,
    website: "https://ambient.xyz",
    credits: thirdPartyCredits()
      .map(thirdPartyCreditAboutText)
      .join("\n\n"),
  });
  projectRegistry = new ProjectRegistry(join(userDataPath, "projects.json"));
  setDockIcon(resolveAppIconPath());
  registerIpc();
  registerWorkspaceMediaProtocol(protocol, workspaceMediaServer);
  await createWindow();
  desktopUpdateService.start();
  installAppMenu(() => mainWindow, {
    onCheckForUpdates: () => {
      void checkForUpdatesFromAppMenu();
    },
  });
  void reconcileMcpContainerRuntimeOnStartup().catch((error) => {
    console.warn(`[mcp-container-runtime] startup reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  void reconcileLocalDeepResearchInstallJob(undefined).then((job) => {
    if (job?.status === "interrupted") {
      console.warn(`[local-deep-research] startup marked install job ${job.jobId} interrupted; retry will reuse partial managed assets when possible.`);
    }
  }).catch((error) => {
    console.warn(`[local-deep-research] startup install reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  app.on("activate", showOrCreateMainWindow);
}

app.on("window-all-closed", () => {
  clearManagedVoiceArtifactCachesForRuntimeHostsSync("exit");
  clearImportedWorkspaceContextCacheSync("exit");
  void rendererLocalPreviewServers.closeAll().catch((error) => {
    console.warn(`Ambient local preview shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  stopWorkflowTraceRetentionSweep();
  disposeAllProjectRuntimeHosts("Project runtime hosts disposed because the app closed.");
  void pluginHost.shutdownPluginMcpServers().catch((error) => {
    console.warn(`Ambient plugin MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  googleSidecarSupervisor?.dispose();
  permissions.denyAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  clearManagedVoiceArtifactCachesForRuntimeHostsSync("exit");
  clearImportedWorkspaceContextCacheSync("exit");
  void rendererLocalPreviewServers.closeAll().catch((error) => {
    console.warn(`Ambient local preview shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  stopWorkflowTraceRetentionSweep();
  disposeAllProjectRuntimeHosts("Project runtime hosts disposed because the app quit.");
  void pluginHost.shutdownPluginMcpServers().catch((error) => {
    console.warn(`Ambient plugin MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  desktopUpdateService.dispose();
  googleSidecarSupervisor?.dispose();
});
