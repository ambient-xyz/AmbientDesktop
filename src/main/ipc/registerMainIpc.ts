
import { registerAppBootstrapIpc } from "./registerAppIpc";

import {
  registerAutomationsCreateFolderIpc,
  registerAutomationsCreateScheduleIpc,
  registerAutomationsListFoldersIpc,
  registerAutomationsListScheduleExceptionsIpc,
  registerAutomationsListSchedulesIpc,
  registerAutomationsMoveThreadIpc,
  registerAutomationsRescheduleScheduleOccurrenceIpc,
  registerAutomationsSkipScheduleOccurrenceIpc,
  registerAutomationsUpdateScheduleOccurrenceRunLimitsIpc,
  registerAutomationsUpdateScheduleIpc,
} from "./registerAutomationsIpc";

import {
  registerAmbientApiKeyIpc,
  registerAmbientOpenKeysIpc,
} from "./registerAmbientIpc";

import { registerAmbientCliSaveSecretIpc } from "./registerAmbientCliIpc";

import { registerLinksOpenExternalIpc } from "./registerLinksIpc";

import { registerMessageSendIpc } from "./registerMessageIpc";

import { registerE2eEmitEventIpc } from "./registerE2eIpc";

import {
  registerContextCompactIpc,
  registerContextRecoverIpc,
  registerContextUsageIpc,
} from "./registerContextIpc";

import { registerClipboardIpc } from "./registerClipboardIpc";

import { registerCapabilityBuilderHistoryIpc } from "./registerCapabilityBuilderIpc";

import { registerDiagnosticsIpc } from "./registerDiagnosticsIpc";

import {
  registerPermissionCreateGrantIpc,
  registerPermissionListIpc,
  registerPermissionRespondIpc,
  registerPermissionRevokeGrantIpc,
} from "./registerPermissionIpc";

import { registerPrivilegedCredentialRespondIpc } from "./registerPrivilegedCredentialIpc";

import { registerSecureInputRespondIpc } from "./registerSecureInputIpc";

import { registerRunAbortIpc } from "./registerRunIpc";

import {
  registerTerminalControlIpc,
  registerTerminalRequestStartIpc,
  registerTerminalResizeIpc,
  registerTerminalStartIpc,
  registerTerminalStopIpc,
  registerTerminalSubmitCommandIpc,
} from "./registerTerminalIpc";

import {
  registerGitAttachExistingWorktreeIpc,
  registerGitCommitIpc,
  registerGitCreateBranchIpc,
  registerGitCreatePullRequestUrlIpc,
  registerGitCreateThreadWorktreeIpc,
  registerGitDiscardFileIpc,
  registerGitInitializeIpc,
  registerGitReviewIpc,
  registerGitRunActionIpc,
  registerGitStageAllFilesIpc,
  registerGitStageFileIpc,
  registerGitUnstageAllFilesIpc,
  registerGitUnstageFileIpc,
} from "./registerGitIpc";

import {
  registerGoogleDisconnectIpc,
  registerGoogleInstallCliIpc,
  registerGoogleIntegrationStateIpc,
  registerGoogleOAuthClientImportIpc,
  registerGoogleSetupCancelIpc,
  registerGoogleSetupStartIpc,
  registerGoogleValidateIpc,
} from "./registerGoogleWorkspaceIpc";

import {
  registerBrowserContentIpc,
  registerBrowserCredentialIpc,
  registerBrowserKeypressIpc,
  registerBrowserLocalPreviewIpc,
  registerBrowserNavigateIpc,
  registerBrowserPickIpc,
  registerBrowserProfileIpc,
  registerBrowserRevealIpc,
  registerBrowserSearchIpc,
  registerBrowserSessionIpc,
  registerBrowserUserActionIpc,
  registerBrowserViewBoundsIpc,
} from "./registerBrowserIpc";

import {
  registerOrchestrationAutoDispatchIpc,
  registerOrchestrationBoardIpc,
  registerOrchestrationCancelRunIpc,
  registerOrchestrationPrepareIpc,
  registerOrchestrationRevealWorkspaceIpc,
  registerOrchestrationStartRunIpc,
  registerOrchestrationTaskIpc,
  registerOrchestrationWorkflowImpactIpc,
  registerOrchestrationWorkflowRawIpc,
  registerOrchestrationWorkflowRepairIpc,
  registerOrchestrationWorkflowSettingsIpc,
} from "./registerOrchestrationIpc";

import {
  registerProjectBoardCardIpc,
  registerProjectBoardCreateIpc,
  registerProjectBoardDefaultsIpc,
  registerProjectBoardDeferIpc,
  registerProjectBoardDogfoodIpc,
  registerProjectBoardFeedbackIpc,
  registerProjectBoardGitIpc,
  registerProjectBoardKickoffIpc,
  registerProjectBoardLifecycleIpc,
  registerProjectBoardPauseIpc,
  registerProjectBoardProposalIpc,
  registerProjectBoardPromoteIpc,
  registerProjectBoardProofIpc,
  registerProjectBoardSourceRefreshIpc,
  registerProjectBoardSourceQuestionIpc,
  registerProjectBoardSynthesisRefinementIpc,
  registerProjectBoardSynthesisRetryIpc,
} from "./registerProjectBoardIpc";

import {
  registerProjectArchiveChatsIpc,
  registerProjectPermanentWorktreeIpc,
  registerProjectRemoveIpc,
  registerProjectRevealIpc,
  registerProjectSelectIpc,
  registerProjectUpdateIpc,
} from "./registerProjectIpc";

import {
  registerPlannerPlanAnswerQuestionIpc,
  registerPlannerPlanGenerateDurableArtifactIpc,
  registerPlannerPlanUpdateIpc,
} from "./registerPlannerPlanIpc";

import {
  registerMcpContainerRuntimeDeferIpc,
  registerMcpContainerRuntimeLaunchInstallIpc,
  registerMcpContainerRuntimeStatusIpc,
  registerMcpDefaultCapabilityInstallIpc,
  registerMcpInstalledListIpc,
  registerMcpRegistryDescribeIpc,
  registerMcpRegistryInstallIpc,
  registerMcpRegistrySearchIpc,
  registerMcpServerUninstallIpc,
  registerMcpToolReviewAcceptIpc,
} from "./registerMcpIpc";

import {
  registerToolsManagedDevServerStopIpc,
  registerToolsManagedDevServersIpc,
} from "./registerToolsIpc";

import {
  registerPluginDiscoveryIpc,
  registerPluginHostedMarketplaceIpc,
  registerPluginMcpInspectionIpc,
  registerPluginMcpRuntimeActionIpc,
  registerPluginMcpRuntimeListIpc,
  registerPluginAuthIpc,
  registerPluginSetEnabledIpc,
  registerPluginSetTrustedIpc,
  registerPluginImportCodexCacheIpc,
  registerPluginAddCodexMarketplaceIpc,
  registerPluginRemoveCodexMarketplaceIpc,
  registerPluginUninstallCodexIpc,
  registerPluginInstallDependenciesIpc,
  registerPluginCapabilityDiagnosticsIpc,
  registerPluginRegistryIpc,
  registerPluginReadIpc,
  registerPluginRuntimeCapabilitiesIpc,
} from "./registerPluginIpc";

import {
  registerPiPackagesInstallIpc,
  registerPiPackagesInspectIpc,
  registerPiPackagesPreviewInstallIpc,
  registerPiPackagesSetEnabledIpc,
  registerPiPackagesUninstallIpc,
} from "./registerPiPackageIpc";

import {
  registerPiExtensionSandboxClearHistoryIpc,
  registerPiExtensionSandboxInstallIpc,
  registerPiExtensionSandboxInspectIpc,
  registerPiExtensionSandboxPreviewIpc,
  registerPiExtensionSandboxUninstallIpc,
} from "./registerPiExtensionSandboxIpc";

import {
  registerPiPrivilegedClearHistoryIpc,
  registerPiPrivilegedDisableIpc,
  registerPiPrivilegedInstallIpc,
  registerPiPrivilegedInspectIpc,
  registerPiPrivilegedScanIpc,
  registerPiPrivilegedUninstallIpc,
} from "./registerPiPrivilegedIpc";

import { registerSettingsIpc } from "./registerSettingsIpc";

import { registerSubagentApprovalIpc } from "./registerSubagentIpc";

import {
  registerThreadArchiveIpc,
  registerThreadCreateIpc,
  registerThreadExportChatIpc,
  registerThreadForkIpc,
  registerThreadGoalIpc,
  registerThreadMarkUnreadIpc,
  registerThreadOpenMiniWindowIpc,
  registerThreadPermissionModeChangeIpc,
  registerThreadRevealIpc,
  registerThreadSelectIpc,
  registerThreadUpdateSettingsIpc,
  registerThreadUpdateIpc,
} from "./registerThreadIpc";

import {
  registerWorkflowAgentCapabilityIpc,
  registerWorkflowAgentDiscoveryAnswerIpc,
  registerWorkflowAgentDiscoveryAccessIpc,
  registerWorkflowAgentDiscoveryStartIpc,
  registerWorkflowAgentExplorationIpc,
  registerWorkflowAgentNativeToolIpc,
  registerWorkflowAgentRevisionDiscoveryStartIpc,
  registerWorkflowAgentRevisionIpc,
  registerWorkflowAgentThreadIpc,
  registerWorkflowAgentTraceIpc,
  registerWorkflowApprovalIpc,
  registerWorkflowArtifactRevalidationIpc,
  registerWorkflowArtifactReviewIpc,
  registerWorkflowArtifactSourceIpc,
  registerWorkflowCancelRunIpc,
  registerWorkflowCompilePreviewIpc,
  registerWorkflowDebugRewriteIpc,
  registerWorkflowConnectorGrantIpc,
  registerWorkflowDashboardIpc,
  registerWorkflowLabIpc,
  registerWorkflowRecoverRunIpc,
  registerWorkflowRecorderIpc,
  registerWorkflowRunArtifactIpc,
} from "./registerWorkflowIpc";

import { registerUpdatesIpc } from "./registerUpdatesIpc";

import {
  registerLocalFileActionIpc,
  registerLocalFilePreviewIpc,
  registerWorkspaceFileIpc,
  registerWorkspaceGitStatusIpc,
  registerWorkspaceLifecycleIpc,
  registerWorkspacePathActionIpc,
  registerWorkspacePickContextIpc,
  registerWorkspaceSearchIpc,
} from "./registerWorkspaceIpc";

import type { AgentRuntime } from "../agentRuntime";
import type { BrowserService } from "../browserService";
import type { ProjectRuntimeHost } from "../index";
import type { PluginMcpToolRegistration } from "../pluginMcpSupervisor";
import type { ProjectStore } from "../projectStore";
import type {
  AmbientPluginRegistry,
  ChatMessage,
  DesktopEvent,
  PlannerPlanArtifact,
  ThreadSummary,
} from "../../shared/types";

type ProjectRuntimeHostLookup = (...args: any[]) => ProjectRuntimeHost;

export interface RegisterMainIpcDependencies extends Record<string, any> {
  AmbientWorkflowExplorationProvider: typeof import("../workflowExplorationService").AmbientWorkflowExplorationProvider;
  AmbientWorkflowLabJudgeProvider: typeof import("../workflowLab").AmbientWorkflowLabJudgeProvider;
  buildWorkflowDebugRewriteContext: typeof import("../workflowDebugRewrite").buildWorkflowDebugRewriteContext;
  runWorkflowLab: typeof import("../workflowLab").runWorkflowLab;
  requireActiveProjectRuntimeHost: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForAutomationSchedule: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForAutomationScheduleTarget: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForAutomationThread: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForCallableWorkflowTask: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForOrchestrationRun: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForOrchestrationTask: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForOrchestrationWorkspace: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForPermissionGrant: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForPermissionGrantInput: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForPlannerPlanArtifact: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForProjectBoard: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForProjectBoardCard: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForProjectBoardQuestion: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForProjectBoardSource: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForProjectBoardSynthesisProposal: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForSubagentRun: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForSubagentWaitBarrier: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForThread: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForThreadAction: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForWorkflowArtifact: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForWorkflowLabRun: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForWorkflowRecording: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForWorkflowRevision: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForWorkflowRun: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForWorkflowThread: ProjectRuntimeHostLookup;
  requireProjectRuntimeHostForWorkflowVersion: ProjectRuntimeHostLookup;
  projectRuntimeHostForTerminal: (...args: any[]) => ProjectRuntimeHost | undefined;
  projectRuntimeHostForWorkflowRun: (...args: any[]) => ProjectRuntimeHost | undefined;
  projectRuntimeHostForWorkspacePath: (...args: any[]) => ProjectRuntimeHost | undefined;
  isActiveProjectRuntimeHost: (host: ProjectRuntimeHost) => boolean;
  activeThreadIdForHost: (host: ProjectRuntimeHost) => string;
}

export function registerMainIpc(deps: RegisterMainIpcDependencies): void {
  const {
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
    cancelCallableWorkflowTaskSchema,
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
    isAmbientSubagentsEnabled,
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
    pauseCallableWorkflowTaskSchema,
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
    resumeCallableWorkflowTaskSchema,
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
  } = deps;
  registerAppBootstrapIpc({
      handleIpc,
      readBootstrapState: () => readState(),
    });
    registerOrchestrationBoardIpc({
      handleIpc,
      readCurrentOrchestrationBoard,
    });
    registerOrchestrationTaskIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      ensureProjectRuntimeHostForWorkspacePath,
      requireProjectRuntimeHostForOrchestrationTask,
      emitOrchestrationUpdated,
      readCurrentOrchestrationBoard,
    });
    registerOrchestrationPrepareIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      prepareAndRecordNextOrchestrationRuns,
      emitProjectStateIfActive,
      recordActiveProjectBoardExecutionReadinessBlocker,
    });
    registerOrchestrationWorkflowImpactIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      readOrchestrationWorkflowReadiness,
      prepareAndRecordNextOrchestrationRuns,
      recordActiveProjectBoardExecutionReadinessBlocker,
      readCurrentOrchestrationBoard,
      emitProjectStateIfActive,
      emitOrchestrationUpdated,
    });
    registerOrchestrationWorkflowRepairIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      repairProjectBoardWorkflow,
      readCurrentOrchestrationBoard,
      emitProjectStateIfActive,
      emitOrchestrationUpdated,
    });
    registerOrchestrationWorkflowSettingsIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      updateProjectBoardWorkflowSettings,
      readCurrentOrchestrationBoard,
      emitProjectStateIfActive,
      emitOrchestrationUpdated,
    });
    registerOrchestrationWorkflowRawIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      updateProjectBoardWorkflowRaw,
      readCurrentOrchestrationBoard,
      emitProjectStateIfActive,
      emitOrchestrationUpdated,
    });
    registerOrchestrationStartRunIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForOrchestrationRun,
      activeThreadIdForHost,
      startPreparedOrchestrationRun,
      reviewFinishedProjectBoardRun,
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      emitOrchestrationUpdated,
      readCurrentOrchestrationBoard,
    });
    registerOrchestrationCancelRunIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForOrchestrationRun,
      requireProjectRuntimeHostForThread,
      emitOrchestrationUpdated,
      readCurrentOrchestrationBoard,
    });
    registerOrchestrationRevealWorkspaceIpc({
      handleIpc,
      requireProjectRuntimeHostForOrchestrationWorkspace,
      openPath: (workspacePath) => shell.openPath(workspacePath),
    });
    registerOrchestrationAutoDispatchIpc({
      handleIpc,
      readAutoDispatchStatus,
      setAutoDispatchEnabled,
    });
    registerSettingsIpc<
      ReturnType<typeof activeVoiceSttContextForProjectHost>,
      ReturnType<typeof requireActiveProjectRuntimeHost>["store"],
      ReturnType<typeof requireProjectRuntimeHostForThread>,
      ReturnType<typeof requireActiveProjectRuntimeHost>
    >({
      handleIpc,
      setThemePreference,
      updateMediaPlaybackSettings,
      updateThinkingDisplaySettings,
      updateModelRuntimeSettings,
      saveModelProviderCredential,
      installModelProviderEndpoint,
      runLocalModelRuntimeLifecycleAction,
      updateFeatureFlagSettings,
      updateMemorySettings,
      getAgentMemoryDiagnostics,
      runAgentMemoryEmbeddingLifecycleAction,
      clearAgentMemory,
      updatePlannerSettings,
      hydrateSearchRoutingSettingsForActiveWorkspace,
      updateSearchRoutingSettings,
      updateLocalDeepResearchSettings,
      activeVoiceSttContextForProjectHost,
      emitRuntimeFeatureStateUpdated,
      updateVoiceSettings,
      updateSttSettings,
      requireActiveProjectRuntimeHost,
      listVoiceProvidersWithCachedVoices,
      refreshVoiceProviderCatalog,
      isAppPackaged: () => app.isPackaged,
      collectVoiceOnboardingHostFacts,
      regenerateMessageVoice,
      revealMessageVoiceArtifact,
      clearMessageVoiceArtifact,
      inspectVoiceArtifacts,
      pruneVoiceArtifacts,
      listSttProvidersWithValidation,
      setupSttProvider,
      setupMiniCpmVision,
      analyzeMiniCpmVision,
      setupLocalDeepResearch,
      listLocalDeepResearchRunsForSettings,
      saveSttTestAudio,
      requireProjectRuntimeHostForThread,
      transcribeSttAudio,
      cancelSttTranscription,
      setSttTtsSpeaking,
    });
    registerUpdatesIpc({
      handleIpc,
      getUpdateState: () => desktopUpdateService.getState(),
      checkForUpdates: (reason) => desktopUpdateService.checkForUpdates(reason),
      downloadUpdate: () => desktopUpdateService.downloadUpdate(),
      installUpdateAndRestart: () => desktopUpdateService.installUpdateAndRestart(),
      dismissUpdateNotification: () => desktopUpdateService.dismissUpdateNotification(),
    });
    registerWorkspaceLifecycleIpc({
      handleIpc,
      showOpenDialog: (options) => dialog.showOpenDialog(mainWindow!, options),
      createDirectory: (workspacePath) => mkdirSync(workspacePath, { recursive: true }),
      switchWorkspace,
    });
    registerThreadCreateIpc<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      prepareWorktreeForThread,
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
    });
    registerThreadGoalIpc<ProjectStore, AgentRuntime, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForThread,
      emitProjectScopedEvent,
      emitProjectStateIfActive,
    });

    registerWorkflowRecorderIpc<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForThreadAction,
      requireProjectRuntimeHostForWorkflowRecording,
      prepareWorktreeForThread,
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      emitWorkflowRecordingLibraryStateChanged,
      readStateForProjectHostAction,
      listGlobalWorkflowRecordingLibrary,
      getFeatureFlagSnapshot: currentFeatureFlagSnapshot,
    });

    registerWorkflowLabIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForWorkflowRecording,
      requireProjectRuntimeHostForWorkflowLabRun,
      emitProjectStateIfActive,
      emitWorkflowRecordingLibraryStateChanged,
      readStateForProjectHostAction,
      startWorkflowLabRun: async (host, input) => {
        const modelRuntime = host.store.getModelRuntimeSettings();
        const provider = getAmbientProviderStatus(host.store.getDefaultSettings().model);
        const judgeProvider = new AmbientWorkflowLabJudgeProvider({
          model: provider.model,
          baseUrl: provider.baseUrl,
          idleTimeoutMs: modelRuntime.providerStreamIdleTimeoutMs,
          retryPolicy: modelRuntime.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime }) : undefined,
        });
        return runWorkflowLab(host.store, input.runId, {
          judge: (judgeInput) => judgeProvider.judge(judgeInput),
        });
      },
    });

    registerThreadSelectIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForThread,
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
    });

    registerProjectSelectIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      resolveRegisteredProjectPathForHost,
      normalizeWorkspacePath,
      activeThreadIdForHost,
      readStateForProjectHostAction,
      switchWorkspace,
    });

    registerProjectUpdateIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      resolveRegisteredProjectPathForHost,
      setProjectDisplayName: (workspacePath, name) => projectRegistry.setDisplayName(workspacePath, name),
      setProjectPinned: (workspacePath, pinned) => projectRegistry.setPinned(workspacePath, pinned),
      readStateForProjectHostAction,
    });

    registerProjectBoardCreateIpc({
      handleIpc,
      createProjectBoard: createProjectBoardForProjectHost,
    });

    registerProjectBoardLifecycleIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      updateProjectBoardStatus: (host, input) => host.store.updateProjectBoardStatus(input.boardId, input.status),
      startProjectBoardRevision: (host, input) => host.store.startProjectBoardRevision(input),
      cancelProjectBoardRevision: (host, input) => host.store.cancelProjectBoardRevision(input.boardId),
      resetProjectBoard: (host, input) => host.store.resetProjectBoard(input.boardId),
    });

    registerProjectBoardGitIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      getProjectBoardGitSyncStatus: (host, input) =>
        getProjectBoardGitSyncStatus(requireProjectBoardForAction(input.boardId, host.store), { runtime: host.store.listOrchestrationBoard() }),
      exportProjectBoardGitArtifacts: (host, input) =>
        exportProjectBoardGitArtifacts(requireProjectBoardForAction(input.boardId, host.store), { runtime: host.store.listOrchestrationBoard() }),
      commitProjectBoardGitArtifacts: (host, input) =>
        commitProjectBoardGitArtifacts(requireProjectBoardForAction(input.boardId, host.store), input.message, {
          runtime: host.store.listOrchestrationBoard(),
        }),
      pushProjectBoardGitArtifacts: (host, input) => pushProjectBoardGitArtifacts(requireProjectBoardForAction(input.boardId, host.store)),
      pullProjectBoardGitArtifacts: (host, input) => pullProjectBoardGitArtifacts(requireProjectBoardForAction(input.boardId, host.store)),
      applyProjectBoardGitProjection: (host, input) => applyProjectBoardGitProjectionAndBroadcast(input.boardId, input.resolutions, host.store, host),
      claimProjectBoardGitCard: async (host, input) => {
        await claimProjectBoardGitCardArtifacts(requireProjectBoardForAction(input.boardId, host.store), { cardId: input.cardId });
        return applyProjectBoardGitProjectionAndBroadcast(input.boardId, [], host.store, host);
      },
      releaseProjectBoardGitCardClaim: async (host, input) => {
        await releaseProjectBoardGitCardClaimArtifacts(requireProjectBoardForAction(input.boardId, host.store), {
          cardId: input.cardId,
          force: input.force,
          reason: input.reason,
        });
        return applyProjectBoardGitProjectionAndBroadcast(input.boardId, [], host.store, host);
      },
      expireProjectBoardGitCardClaim: async (host, input) => {
        await expireProjectBoardGitCardClaimArtifacts(requireProjectBoardForAction(input.boardId, host.store), {
          cardId: input.cardId,
          force: input.force,
          reason: input.reason,
        });
        return applyProjectBoardGitProjectionAndBroadcast(input.boardId, [], host.store, host);
      },
      resolveProjectBoardGitCardClaimConflicts: async (host, input) => {
        await resolveProjectBoardGitCardClaimConflictsArtifacts(requireProjectBoardForAction(input.boardId, host.store), {
          cardId: input.cardId,
          force: input.force,
          reason: input.reason,
        });
        return applyProjectBoardGitProjectionAndBroadcast(input.boardId, [], host.store, host);
      },
    });

    registerProjectBoardPauseIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      pauseProjectBoardSynthesis: pauseProjectBoardSynthesisForProjectHost,
    });

    registerProjectBoardSynthesisRetryIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      retryProjectBoardSynthesis: retryProjectBoardSynthesisForProjectHost,
      abandonProjectBoardSynthesisRun: (host, input) => {
        // Record the stall without restarting anything: on finished boards a retry
        // would only re-plan scope that is already built, so abandoning must be a
        // first-class outcome rather than forcing retry as the only recovery.
        host.store.markProjectBoardSynthesisRunStalled({
          boardId: input.boardId,
          runId: input.runId,
          reason: input.reason ?? "Abandoned from the synthesis run banner without retry.",
        });
        emitProjectStateIfActive(host);
        return readStateForProjectHostAction(host);
      },
    });

    registerProjectBoardDogfoodIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectBoardDogfoodTestHook,
      requireProjectRuntimeHostForProjectBoard,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      seedProjectBoardSemanticIdleDogfood: (host, input) => seedProjectBoardSemanticIdleDogfoodRun(input.boardId, host.store),
      seedProjectBoardProofJudgmentDogfood: seedProjectBoardProofJudgmentDogfoodForProjectHost,
      seedProjectBoardCanonicalProjectionDogfood: seedProjectBoardCanonicalProjectionDogfoodForProjectHost,
      seedProjectBoardDeliverableIntegrationDogfood: seedProjectBoardDeliverableIntegrationDogfoodForProjectHost,
    });

    registerProjectBoardDeferIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      deferProjectBoardSynthesisSections: (host, input) =>
        recordProjectBoardSynthesisSectionDecision(input.boardId, input.runId, "defer_failed_sections", input.reason, host.store),
    });

    registerProjectBoardPromoteIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForPlannerPlanArtifact,
      assertProjectBoardMutationAllowedForActiveThread,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      promotePlannerPlanToBoard: (host, input) => {
        const card = host.store.promotePlannerPlanToBoard(input.artifactId);
        emitProjectStateIfActive(host);
        startProjectBoardSynthesisAfterPlanPromotion(host, card.boardId);
      },
    });

    registerProjectBoardProofIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      requireProjectRuntimeHostForProjectBoardCard,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      approveProjectBoardCard: (host, input) => host.store.approveProjectBoardCard(input.cardId),
      resolveProjectBoardProofDecision: (host, input) => host.store.resolveProjectBoardProofDecision(input),
      isAutoDispatchEnabled: (host) => host.autoDispatch.enabled,
      scheduleAutoDispatch: (host) => scheduleAutoDispatch(1_000, host),
      rerunProjectBoardProof: (host, input, onProgress) => rerunProjectBoardProof(input, host.store, onProgress),
      resolveProjectBoardDeliverableIntegration: (host, input) => host.store.resolveProjectBoardDeliverableIntegration(input),
      recomputeProjectBoardProofCoverage: (host, input) => host.store.recomputeProjectBoardProofCoverage(input),
      suggestProjectBoardProof: (host, input) => suggestProjectBoardProof(input, host.store),
    });

    registerProjectBoardDefaultsIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      suggestProjectBoardClarificationDefaults: (host, input) => suggestProjectBoardClarificationDefaults(input, host.store),
      suggestProjectBoardKickoffDefaults: (host, input) => suggestProjectBoardKickoffDefaults(input, host.store, host),
    });

    registerProjectBoardCardIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      requireProjectRuntimeHostForProjectBoardCard,
      requireProjectRuntimeHostForOrchestrationTask,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      setProjectHostActiveThreadId,
      resolveProjectBoardSplitDecision: (host, input) => host.store.resolveProjectBoardSplitDecision(input),
      createReadyProjectBoardTasks: (host, input) => host.store.createReadyProjectBoardTasks(input.boardId).length,
      isAutoDispatchEnabled: (host) => host.autoDispatch.enabled,
      scheduleAutoDispatch: (host) => scheduleAutoDispatch(1_000, host),
      splitProjectBoardCard: (host, input) => host.store.splitProjectBoardCard(input.cardId),
      createProjectBoardCard: (host, input) => host.store.createProjectBoardManualCard(input),
      attachProjectBoardLocalTask: (host, input) => host.store.attachLocalTaskToProjectBoard(input),
      updateProjectBoardCard: (host, input) => host.store.updateProjectBoardCard(input),
      updateProjectBoardCardCandidate: (host, input) => host.store.updateProjectBoardCardCandidateStatus(input.cardId, input.candidateStatus),
      resolveProjectBoardCardPiUpdate: (host, input) => host.store.resolveProjectBoardCardPiUpdate(input),
      addProjectBoardCardRunFeedback: (host, input) => host.store.addProjectBoardCardRunFeedback(input),
      copyProjectBoardSessionToThread: (host, input) => host.store.copyProjectBoardSessionToThread(input),
    });

    registerProjectBoardFeedbackIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      requireProjectRuntimeHostForProjectBoardCard,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      applyProjectBoardDecisionImpactFeedback: (host, input) => host.store.applyProjectBoardDecisionImpactFeedback(input),
      refreshProjectBoardDecisionDrafts: (host, input) => host.store.refreshProjectBoardDecisionDrafts(input),
      regenerateProjectBoardDecisionDrafts: (host, input) => regenerateProjectBoardDecisionDrafts(input, host.store),
      refreshProjectBoardSourceDrafts: (host, input) => host.store.refreshProjectBoardSourceDrafts(input),
      regenerateProjectBoardSourceDrafts: (host, input) => regenerateProjectBoardSourceDrafts(input, host.store),
      applyProjectBoardSourceImpactFeedback: (host, input) => host.store.applyProjectBoardSourceImpactFeedback(input),
    });

    registerProjectBoardSourceRefreshIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      refreshProjectBoardSources: refreshProjectBoardSourcesForProjectHost,
    });

    registerProjectBoardSynthesisRefinementIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      refineProjectBoardSynthesis: refineProjectBoardSynthesisForProjectHost,
    });

    registerProjectBoardProposalIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoardSynthesisProposal,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      answerProjectBoardSynthesisProposalQuestion: (host, input) => host.store.answerProjectBoardSynthesisProposalQuestion(input),
      reviewProjectBoardSynthesisProposalCard: (host, input) => host.store.reviewProjectBoardSynthesisProposalCard(input),
      applyProjectBoardSynthesisProposal: (host, input) => host.store.applyProjectBoardSynthesisProposal(input),
    });

    registerProjectBoardSourceQuestionIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoardSource,
      requireProjectRuntimeHostForProjectBoardQuestion,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
      updateProjectBoardSource: (host, input) => host.store.updateProjectBoardSource(input),
      answerProjectBoardQuestion: (host, input) => host.store.answerProjectBoardQuestion(input.questionId, input.answer),
    });

    registerProjectBoardKickoffIpc<ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForProjectBoard,
      finalizeProjectBoardKickoff: async (host, input) => {
        host.store.finalizeProjectBoardKickoff(input.boardId);
        emitProjectStateIfActive(host);
        await applyProjectBoardLiveSynthesis(input.boardId, { replaceExistingDraft: true, targetStore: host.store, host });
        return readStateForProjectHostAction(host);
      },
    });

    registerProjectRemoveIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      resolveRegisteredProjectPathForHost,
      normalizeWorkspacePath,
      listRegisteredProjectPaths: () => projectRegistry.listRegisteredPaths(),
      pathExists: (workspacePath) => existsSync(workspacePath),
      removeProject: (workspacePath) => projectRegistry.remove(workspacePath),
      switchWorkspace,
      disposeProjectRuntimeHost,
      readStateForProjectHostAction,
    });

    registerProjectRevealIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      resolveRegisteredProjectPathForHost,
      openProjectPath: (workspacePath) => shell.openPath(workspacePath),
      showProjectInFolder: (workspacePath) => shell.showItemInFolder(workspacePath),
    });

    registerProjectArchiveChatsIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      resolveRegisteredProjectPathForHost,
      normalizeWorkspacePath,
      projectRuntimeHostForWorkspacePath,
      archiveProjectChatsForHost: (host) => host.store.archiveChats(),
      initialActiveThreadIdForHost: (host) => initialActiveThreadIdForStore(host.store),
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      archiveProjectChats,
      readStateForProjectHostAction,
    });

    registerProjectPermanentWorktreeIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      resolveRegisteredProjectPathForHost,
      normalizeWorkspacePath,
      showOpenDialog: (options) => dialog.showOpenDialog(mainWindow!, options),
      createPermanentWorktree,
      permanentWorktreeBranchName,
      switchWorkspace,
    });

    registerThreadUpdateIpc<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForThreadAction,
      emitProjectStateIfActive,
      isActiveProjectRuntimeHost,
      emitThreadUpdated,
      readStateForProjectHostAction,
    });

    registerThreadArchiveIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForThreadAction,
      initialActiveThreadIdForStore,
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      readStateForProjectHostAction,
    });

    registerThreadMarkUnreadIpc<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForThreadAction,
      isActiveProjectRuntimeHost,
      emitThreadUpdated,
      activeThreadIdForHost,
      readState,
      emitDesktopState: (state) => mainWindow?.webContents.send("desktop:event", { type: "state", state }),
    });

    registerThreadRevealIpc<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForThreadAction,
      threadWorkingDirectory,
      openPath: (directory) => shell.openPath(directory),
      showItemInFolder: (directory) => shell.showItemInFolder(directory),
    });

    registerThreadForkIpc<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForThreadAction,
      prepareWorktreeForThread,
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      isActiveProjectRuntimeHost,
      emitThreadUpdated,
      readStateForProjectHostAction,
    });

    registerThreadOpenMiniWindowIpc<ThreadSummary, ChatMessage, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForThreadAction,
      threadWorkingDirectory,
      openThreadMiniWindow,
    });

    registerThreadUpdateSettingsIpc<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      parseThreadSettingsUpdate,
      requireProjectRuntimeHostForThread,
    });

    registerThreadPermissionModeChangeIpc<ThreadSummary, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      parseThreadPermissionModeChange,
      requireProjectRuntimeHostForThread,
      permissionModeChangeAuditDetail,
      emitPermissionAuditCreated,
    });

    registerPlannerPlanUpdateIpc<PlannerPlanArtifact, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForPlannerPlanArtifact,
      emitPlannerPlanArtifactUpdated,
    });

    registerPlannerPlanGenerateDurableArtifactIpc<PlannerPlanArtifact>({
      handleIpc,
      generatePlannerDurableArtifact,
    });

    registerPlannerPlanAnswerQuestionIpc<PlannerPlanArtifact, ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForPlannerPlanArtifact,
      emitPlannerPlanArtifactUpdated,
    });

    registerAmbientOpenKeysIpc({
      handleIpc,
      ambientKeysUrl: AMBIENT_KEYS_URL,
      openAllowedExternalUrl,
    });

    registerLinksOpenExternalIpc({
      handleIpc,
      parseExternalOpenUrl,
      isGoogleWorkspaceSetupUrl,
      openGoogleWorkspaceUrl,
      isLoopbackWebUrl,
      openRendererLocalUrlInAmbientBrowser,
      openAllowedExternalUrl,
    });

    registerClipboardIpc({
      handleIpc,
      readText: () => clipboard.readText(),
      writeText: (text) => clipboard.writeText(text),
    });

    registerAmbientApiKeyIpc({
      handleIpc,
      saveAmbientApiKey,
      clearSavedAmbientApiKey,
      testAmbientApiKey,
      resetRuntimeAndPluginServers,
      readCurrentSettingsModel: () => readState().settings.model,
      getAmbientProviderStatus,
      emitProviderUpdated: (provider) => mainWindow?.webContents.send("desktop:event", { type: "provider-updated", provider }),
    });

    registerWorkspaceFileIpc<ReturnType<typeof activeWorkspaceFileContextForProjectHost>>({
      handleIpc,
      activeWorkspaceFileContextForProjectHost,
      listWorkspaceFiles,
      readActiveWorkspaceFile,
      clearOfficePreviewRendererDiscovery: () => officePreviewService?.clearRendererDiscovery(),
    });

    registerLocalFilePreviewIpc({
      handleIpc,
      activeWorkspaceFileContextForProjectHost,
      readActiveLocalFilePreview,
      clearOfficePreviewRendererDiscovery: () => officePreviewService?.clearRendererDiscovery(),
    });

    registerWorkspacePickContextIpc<ReturnType<typeof activeWorkspaceFileContextForProjectHost>>({
      handleIpc,
      activeWorkspaceFileContextForProjectHost,
      showOpenDialog: (options) => dialog.showOpenDialog(mainWindow!, options),
      describeWorkspaceAbsoluteContextPaths,
    });

    registerWorkspacePathActionIpc<ReturnType<typeof activeWorkspaceFileContextForProjectHost>>({
      handleIpc,
      activeWorkspaceFileContextForProjectHost,
      workspacePathForRelativeArtifactPath,
      resolveWorkspacePathForOpen,
      showItemInFolder: (absolutePath) => shell.showItemInFolder(absolutePath),
      openPath: (absolutePath) => shell.openPath(absolutePath),
      listWorkspaceOpenTargets,
      openWorkspaceTarget,
    });

    registerLocalFileActionIpc({
      handleIpc,
      resolveLocalFilePath,
      showItemInFolder: (absolutePath) => shell.showItemInFolder(absolutePath),
      openPath: (absolutePath) => shell.openPath(absolutePath),
      openWorkspaceTarget,
    });

    registerWorkspaceGitStatusIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      getWorkspaceDiff,
      getWorkspaceGitStatus,
      switchWorkspaceBranch,
      createAndRecordPreGitActionCheckpoint: (reason, thread, targetStore) => createAndRecordCheckpoint("pre-git-action", reason, thread, targetStore),
    });

    registerGitReviewIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      readGitReviewForProjectHost,
    });

    registerGitInitializeIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      initializeGitRepository,
      readGitReviewForProjectHost,
    });

    registerGitCreateThreadWorktreeIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      prepareWorktreeForThread,
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      readGitReviewForProjectHost,
    });

    registerGitAttachExistingWorktreeIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      showOpenDialog: (options) => dialog.showOpenDialog(mainWindow!, options),
      normalizeWorkspacePath,
      attachWorktreeForThread,
      setProjectHostActiveThreadId,
      emitProjectStateIfActive,
      readGitReviewForProjectHost,
    });

    registerGitStageFileIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      stageGitFile,
      readGitReviewForProjectHost,
    });

    registerGitUnstageFileIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      unstageGitFile,
      readGitReviewForProjectHost,
    });

    registerGitStageAllFilesIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      stageAllGitFiles,
      readGitReviewForProjectHost,
    });

    registerGitUnstageAllFilesIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      unstageAllGitFiles,
      readGitReviewForProjectHost,
    });

    registerGitDiscardFileIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      createAndRecordPreGitActionCheckpoint: (reason, thread, targetStore) =>
        createAndRecordCheckpoint("pre-git-action", reason, thread, targetStore),
      discardGitFile,
      readGitReviewForProjectHost,
    });

    registerGitCommitIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      commitGit,
      readGitReviewForProjectHost,
    });

    registerGitCreateBranchIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      createAndRecordPreGitActionCheckpoint: (reason, thread, targetStore) =>
        createAndRecordCheckpoint("pre-git-action", reason, thread, targetStore),
      createGitBranch,
      readGitReviewForProjectHost,
    });

    registerGitRunActionIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      fetchGit,
      createAndRecordPreGitActionCheckpoint: (reason, thread, targetStore) =>
        createAndRecordCheckpoint("pre-git-action", reason, thread, targetStore),
      pullGit,
      pushGit,
      restoreLatestGitCheckpoint,
      readGitReviewForProjectHost,
    });

    registerGitCreatePullRequestUrlIpc<ReturnType<typeof activeGitContextForProjectHost>>({
      handleIpc,
      activeGitContextForProjectHost,
      createPullRequestUrl,
      openAllowedExternalUrl,
    });

    registerWorkspaceSearchIpc({
      handleIpc,
      searchWorkspace,
    });

    registerBrowserCredentialIpc<ProjectRuntimeHost>({
      handleIpc,
      browserLoginBrokerEnabled,
      requireActiveProjectRuntimeHost,
      listBrowserCredentials: (host) => host.browserCredentialStore.list(),
      saveBrowserCredential: (host, input) => host.browserCredentialStore.save(input),
      deleteBrowserCredential: (host, input) => host.browserCredentialStore.delete(input.id),
    });

    registerBrowserSessionIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      readBrowserState: (host) => host.browserService.getState(),
      startBrowser: (host, input) => host.browserService.start(input),
      stopBrowser: (host) => host.browserService.stop(),
      screenshotBrowser: (host, input) => host.browserService.screenshot(input),
      withBrowserState,
    });

    registerBrowserRevealIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      revealBrowser: (host, input) => host.browserService.revealActiveBrowser(input),
      recordBrowserControlAudit,
      withBrowserState,
    });

    registerBrowserProfileIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      clearIsolatedBrowserProfile: (host) => host.browserService.clearIsolatedBrowserProfile(),
      copyChromeProfile: (host) => host.browserService.copyChromeProfile(),
      clearCopiedChromeProfile: (host) => host.browserService.clearCopiedChromeProfile(),
      recordBrowserProfileAudit,
      withBrowserState,
    });

    registerBrowserNavigateIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      isLoopbackWebUrl,
      navigateBrowser: (host, input) => host.browserService.navigate(input),
      withBrowserState,
    });

    registerBrowserLocalPreviewIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      openBrowserLocalPreview: (host, input) => rendererLocalPreviewServers.open({ workspacePath: host.workspacePath, path: input.path }),
      navigateBrowser: (host, input) => host.browserService.navigate(input),
      recordBrowserControlAudit,
      withBrowserState,
    });

    registerBrowserSearchIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      searchBrowser: (host, input) => host.browserService.search(input),
      withBrowserState,
    });

    registerBrowserContentIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      readBrowserContent: (host, input) => host.browserService.content(input),
      withBrowserState,
    });

    registerBrowserKeypressIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      keypressBrowser: (host, input) => host.browserService.keypress(input),
      withBrowserState,
    });

    registerBrowserPickIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      pickBrowser: (host, input) => host.browserService.pick(input),
      readBrowserState: (host) => host.browserService.getState(),
      cancelBrowserPick: (host) => host.browserService.cancelPick(),
      emitBrowserStateForHost,
      browserAuditFallbackTarget: (host) => host.workspacePath,
      recordBrowserControlAudit,
      withBrowserState,
    });

    registerBrowserUserActionIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      resumeBrowserUserAction: (host) => host.browserService.resumeUserAction(),
      cancelBrowserUserAction: (host) => host.browserService.cancelUserAction(),
      browserAuditFallbackTarget: (host) => host.workspacePath,
      recordBrowserControlAudit,
      withBrowserState,
    });

    registerBrowserViewBoundsIpc<ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      setBrowserViewBounds: (host, input) => host.browserService.setViewBounds(input),
    });

    registerPluginDiscoveryIpc({
      handleIpc,
      readCodexPluginCatalog: () => readCodexPluginCatalog(requireActiveProjectRuntimeHost().store),
    });

    registerPluginReadIpc({
      handleIpc,
      readCodexPlugin: (input) => {
        const host = requireActiveProjectRuntimeHost();
        return pluginHost.readCodexPlugin(host.workspacePath, input, pluginStateReaderForStore(host.store));
      },
    });

    registerPluginHostedMarketplaceIpc({
      handleIpc,
      readCodexHostedMarketplaceReport: () => readCodexHostedMarketplaceReport(requireActiveProjectRuntimeHost().store),
    });

    registerPluginMcpInspectionIpc({
      handleIpc,
      inspectCodexPluginMcp: async () => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const thread = targetStore.getThread(activeThreadIdForHost(host));
        return pluginHost.inspectCodexPluginMcp(host.workspacePath, pluginStateReaderForStore(targetStore), {
          permissionMode: thread.permissionMode,
          workspacePath: host.workspacePath,
        });
      },
    });

    registerPluginMcpRuntimeListIpc({
      handleIpc,
      listPluginMcpRuntimeSnapshots: allPluginMcpRuntimeSnapshots,
    });

    registerPluginMcpRuntimeActionIpc({
      handleIpc,
      restartPluginMcpRuntime: async (key) => {
        const hostSnapshots = await pluginHost.restartPluginMcpRuntime(key);
        if (hostSnapshots) return allPluginMcpRuntimeSnapshots();
        return restartProjectRuntimeMcpRuntime(key);
      },
      stopPluginMcpRuntime: async (key) => {
        const hostSnapshots = await pluginHost.stopPluginMcpRuntime(key);
        if (hostSnapshots) return allPluginMcpRuntimeSnapshots();
        return stopProjectRuntimeMcpRuntime(key);
      },
    });

    registerPluginRegistryIpc({
      handleIpc,
      readAmbientPluginRegistry: () => readAmbientPluginRegistry(requireActiveProjectRuntimeHost().store),
    });

    registerMcpRegistrySearchIpc({
      handleIpc,
      searchRegistryServers: (input) => {
        const { catalog } = createMcpInstallCatalog();
        return catalog.searchRegistryServers(input);
      },
    });

    registerMcpRegistryDescribeIpc({
      handleIpc,
      describeRegistryServer: async (input) => {
        const { catalog } = createMcpInstallCatalog();
        return ambientMcpInstallPreview(await catalog.previewRegistryInstall(input));
      },
    });

    registerMcpInstalledListIpc({
      handleIpc,
      listInstalledServers: () => {
        const { catalog } = createMcpInstallCatalog();
        return catalog.listInstalledServers();
      },
    });

    registerMcpContainerRuntimeStatusIpc({
      handleIpc,
      probeContainerRuntimeStatus: probeAmbientMcpContainerRuntimeStatus,
    });

    registerMcpContainerRuntimeLaunchInstallIpc({
      handleIpc,
      launchContainerRuntimeInstall: async (input) => {
        const { toolHive } = createMcpInstallCatalog();
        const runtimeProbe = await probeContainerRuntime({ toolHive });
        const plan = buildContainerRuntimeInstallPlanFromProbe(runtimeProbe);
        if (!plan) {
          if (runtimeProbe.status === "ready") throw new Error("The isolated MCP container runtime is already ready.");
          throw new Error(runtimeProbe.message);
        }
        return launchContainerRuntimeInstallAction(plan, {
          actionId: input.actionId,
          openExternal: (url: string) => openAllowedExternalUrl(url, "mcp-container-runtime-install"),
          openApplication: openContainerRuntimeApplication,
          executeManagedInstall: (action: any) => executeContainerRuntimeManagedInstallAction(action, {
            mode: input.mode ?? "execute",
            workspacePath: app.getPath("userData"),
            ...(activeThreadId ? { threadId: activeThreadId } : {}),
            privilegedAdapter: createPrivilegedActionAdapter({
              adapter: privilegedActionAdapterSelectionFromEnv(process.env),
              credentialRehearsalAvailable: true,
            }),
            requestCredential: (request: any) => privilegedCredentials.request(request),
            writeRedactedLog: (result: any) => writePrivilegedActionRedactedLog(app.getPath("userData"), result),
            writeManagedInstallLog: (result: any) => writeContainerRuntimeManagedInstallRedactedLog(app.getPath("userData"), result),
            onProgress: (progress: any) => emitMainWindowDesktopEvent({
              type: "mcp-container-runtime-install-progress",
              progress,
            }),
          }),
        }).then(async (result: any) => {
          if (!result.managedResult || result.managedResult.status === "succeeded") {
            await recordContainerRuntimeInstallLaunched(mcpContainerRuntimeSetupStatePath(), result.action, {
              appVersion: packageJson.version,
            });
          }
          return result;
        });
      },
    });

    registerMcpContainerRuntimeDeferIpc({
      handleIpc,
      deferContainerRuntimeSetup: async () => {
        await recordContainerRuntimeDeferred(mcpContainerRuntimeSetupStatePath(), {
          appVersion: packageJson.version,
        });
        return probeAmbientMcpContainerRuntimeStatus();
      },
    });

    registerMcpDefaultCapabilityInstallIpc({
      handleIpc,
      installDefaultCapability: (input) => installMcpDefaultCapabilityForDesktop(requireActiveProjectRuntimeHost(), input),
    });

    registerMcpRegistryInstallIpc({
      handleIpc,
      installRegistryServer: (input) => installMcpRegistryServerForDesktop(requireActiveProjectRuntimeHost(), input),
    });

    registerMcpServerUninstallIpc({
      handleIpc,
      uninstallServer: (input) => uninstallMcpServerForDesktop(requireActiveProjectRuntimeHost(), input),
    });

    registerMcpToolReviewAcceptIpc({
      handleIpc,
      acceptToolReview: (input) => acceptMcpToolDescriptorReviewForDesktop(requireActiveProjectRuntimeHost(), input),
    });

    registerToolsManagedDevServersIpc({
      handleIpc,
      listManagedDevServers,
    });

    registerToolsManagedDevServerStopIpc({
      handleIpc,
      stopManagedDevServer,
      listManagedDevServers,
    });

    registerCapabilityBuilderHistoryIpc({
      handleIpc,
      getWorkspacePath: () => requireActiveProjectRuntimeHost().workspacePath,
      discoverCapabilityBuilderHistory,
    });

    registerPluginRuntimeCapabilitiesIpc({
      handleIpc,
      listRuntimeCapabilities: (input) => {
        const host = requireActiveProjectRuntimeHost();
        return pluginHost.listRuntimeCapabilities(host.workspacePath, input.runtime, pluginStateReaderForStore(host.store));
      },
    });

    registerPluginCapabilityDiagnosticsIpc({
      handleIpc,
      getCapabilityDiagnostics: (input) => {
        const host = requireActiveProjectRuntimeHost();
        return pluginHost.getCapabilityDiagnostics(host.workspacePath, input.capabilityId, pluginStateReaderForStore(host.store));
      },
    });

    registerGoogleIntegrationStateIpc({
      handleIpc,
      readFirstPartyGoogleIntegration,
    });

    registerGoogleInstallCliIpc({
      handleIpc,
      installGoogleWorkspaceCli: () => googleWorkspaceCliInstaller.install(),
      refreshGoogleWorkspaceConnectorMode,
      resetRuntimeAndPluginServers,
    });

    registerGoogleSetupStartIpc({
      handleIpc,
      startGoogleWorkspaceSetup: (input) => googleWorkspaceSetupService.start(input),
      redactGoogleWorkspaceSetupState,
    });

    registerGoogleSetupCancelIpc({
      handleIpc,
      cancelGoogleWorkspaceSetup: () => googleWorkspaceSetupService.cancel(),
      redactGoogleWorkspaceSetupState,
    });

    registerGoogleOAuthClientImportIpc({
      handleIpc,
      showOpenDialog: (options) => dialog.showOpenDialog(options),
      readGoogleWorkspaceSetupState: () => googleWorkspaceSetupService.state(),
      importGoogleWorkspaceOAuthClientConfig: (input) => googleWorkspaceSetupService.importOAuthClientConfig(input),
      redactGoogleWorkspaceSetupState,
    });

    registerGoogleValidateIpc({
      handleIpc,
      validateGoogleWorkspace: (input) => googleWorkspaceSetupService.validate(input),
    });

    registerGoogleDisconnectIpc({
      handleIpc,
      forgetGoogleWorkspaceAccount: (input) => googleWorkspaceSetupService.forgetAccount(input),
      readFirstPartyGoogleIntegration,
    });

    registerPluginAuthIpc({
      handleIpc,
      startPluginAppAuth: (input) => pluginHost.startPluginAppAuth(input),
      completePluginAppAuth: (input) => pluginHost.completePluginAppAuth(input),
      revokePluginAuthAccount: (input) => pluginHost.revokePluginAuthAccount(input),
      disconnectPluginAuthAccount: (input) => pluginHost.disconnectPluginAuthAccount(input),
      testPluginAuthAccount: (input) => pluginHost.testPluginAuthAccount(input),
      openPluginAuthUrl: (url) => openAllowedExternalUrl(url, "plugin-auth"),
      reportPluginAuthOpenUrlError: (error) => {
        console.warn(`Failed to open plugin auth URL: ${error instanceof Error ? error.message : String(error)}`);
      },
    });

    registerPluginSetEnabledIpc({
      handleIpc,
      setCodexPluginEnabled: (input) => {
        const host = requireActiveProjectRuntimeHost();
        host.store.setPluginEnabled(input.pluginId, input.enabled);
        resetProjectRuntimeAndPluginServers(host);
        return readCodexPluginCatalog(host.store);
      },
    });

    registerPluginSetTrustedIpc({
      handleIpc,
      setCodexPluginTrusted: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        if (input.trusted) {
          const plugin = await pluginHost.readCodexPlugin(host.workspacePath, { pluginId: input.pluginId }, pluginStateReaderForStore(targetStore));
          targetStore.setPluginTrusted(input.pluginId, true, codexPluginTrustFingerprint(plugin));
        } else {
          targetStore.setPluginTrusted(input.pluginId, false);
        }
        resetProjectRuntimeAndPluginServers(host);
        return readCodexPluginCatalog(targetStore);
      },
    });

    registerPluginImportCodexCacheIpc({
      handleIpc,
      importCodexPlugin: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        await pluginHost.importCodexPlugin(host.workspacePath, input);
        resetProjectRuntimeAndPluginServers(host);
        return readCodexPluginCatalog(host.store);
      },
    });

    registerPluginAddCodexMarketplaceIpc({
      handleIpc,
      addCodexMarketplace: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        await pluginHost.addCodexMarketplace(host.workspacePath, input);
        return readCodexPluginCatalog(host.store);
      },
    });

    registerPluginRemoveCodexMarketplaceIpc({
      handleIpc,
      removeCodexMarketplace: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        await pluginHost.removeCodexMarketplace(host.workspacePath, input);
        resetProjectRuntimeAndPluginServers(host);
        return readCodexPluginCatalog(host.store);
      },
    });

    registerPluginUninstallCodexIpc({
      handleIpc,
      uninstallCodexPlugin: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        await pluginHost.uninstallCodexPlugin(host.workspacePath, input);
        targetStore.setPluginEnabled(input.pluginId, false);
        targetStore.setPluginTrusted(input.pluginId, false);
        resetProjectRuntimeAndPluginServers(host);
        return readCodexPluginCatalog(targetStore);
      },
    });

    registerPluginInstallDependenciesIpc({
      handleIpc,
      installCodexPluginDependencies: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const targetThreadId = activeThreadIdForHost(host);
        const plugin = await pluginHost.readCodexPlugin(host.workspacePath, input, pluginStateReaderForStore(targetStore));
        if (!plugin.dependencyStatus?.required) throw new Error("Codex plugin does not have MCP dependencies to install.");
        if (plugin.dependencyStatus.installed) throw new Error("Codex plugin dependencies are already installed.");
        const response = await permissions.request({
          threadId: targetThreadId,
          toolName: "plugin_dependencies_install",
          title: `Install dependencies for "${plugin.displayName ?? plugin.name}"?`,
          message: "Ambient will run this plugin's package manager install in the workspace. Lifecycle scripts are disabled.",
          detail: [
            `Workspace: ${host.workspacePath}`,
            `Plugin: ${plugin.displayName ?? plugin.name}`,
            `Directory: ${plugin.rootPath}`,
            `Command: ${plugin.dependencyStatus.installCommand.join(" ")}`,
            `Missing packages: ${plugin.dependencyStatus.missingPackages.slice(0, 20).join(", ")}`,
          ].join("\n"),
          risk: "plugin-tool",
        });
        const allowed = response.allowed;
        if (!allowed) throw new Error("Codex plugin dependency install was not approved.");
        const result = await pluginHost.installCodexPluginDependencies(host.workspacePath, input);
        resetProjectRuntimeAndPluginServers(host);
        return result;
      },
    });

    registerPiPackagesInspectIpc({
      handleIpc,
      inspectPiPackages: () => {
        const host = requireActiveProjectRuntimeHost();
        return pluginHost.inspectPiPackages(host.workspacePath, pluginStateReaderForStore(host.store));
      },
    });

    registerPiPackagesPreviewInstallIpc({
      handleIpc,
      previewPiPackageInstall: (input) => {
        const host = requireActiveProjectRuntimeHost();
        return pluginHost.previewPiPackageInstall(host.workspacePath, input);
      },
    });

    registerPiPackagesInstallIpc({
      handleIpc,
      installPiPackage: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetThreadId = activeThreadIdForHost(host);
        const preview = await pluginHost.previewPiPackageInstall(host.workspacePath, input);
        if (!preview.installable) throw new Error(`Pi package source is not installable: ${preview.errors.join("; ")}`);
        const response = await permissions.request({
          threadId: targetThreadId,
          toolName: "pi_package_install",
          title: `Register Pi package "${preview.candidate?.name ?? preview.normalizedSource}"?`,
          message: "Ambient will record this Pi package source in Ambient-managed state. It will not run package code or install dependencies.",
          detail: [
            `Workspace: ${host.workspacePath}`,
            `Scope: ${preview.scope}`,
            `Source: ${preview.normalizedSource}`,
            preview.candidate ? `Package: ${preview.candidate.name}${preview.candidate.version ? `@${preview.candidate.version}` : ""}` : undefined,
            preview.candidate ? `Resources: ${formatPiResourceCountsForPermission(preview.candidate.resourceCounts)}` : undefined,
            ...preview.notes,
          ].filter((line): line is string => Boolean(line)).join("\n"),
          risk: "plugin-tool",
        });
        if (!response.allowed) throw new Error("Pi package install was not approved.");
        const catalog = await pluginHost.installPiPackage(host.workspacePath, input, pluginStateReaderForStore(host.store));
        resetProjectRuntimeAndPluginServers(host);
        return catalog;
      },
    });

    registerPiPackagesUninstallIpc({
      handleIpc,
      uninstallPiPackage: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const catalog = await pluginHost.uninstallPiPackage(host.workspacePath, input, pluginStateReaderForStore(host.store));
        host.store.clearPiPackageEnabled(input.packageId);
        resetProjectRuntimeAndPluginServers(host);
        return catalog;
      },
    });

    registerPiPackagesSetEnabledIpc({
      handleIpc,
      setPiPackageEnabled: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        await pluginHost.validatePiPackageEnablement(host.workspacePath, input, pluginStateReaderForStore(host.store));
        host.store.setPiPackageEnabled(input.packageId, input.enabled);
        resetProjectRuntimeAndPluginServers(host);
        return pluginHost.inspectPiPackages(host.workspacePath, pluginStateReaderForStore(host.store));
      },
    });

    registerPiExtensionSandboxInspectIpc({
      handleIpc,
      inspectPiExtensionSandboxPackages: () => discoverPiExtensionSandboxPackages(requireActiveProjectRuntimeHost().workspacePath),
    });

    registerPiExtensionSandboxPreviewIpc({
      handleIpc,
      previewPiExtensionSandboxPackage: (input) =>
        previewPiExtensionSandboxInstall(requireActiveProjectRuntimeHost().workspacePath, input),
    });

    registerPiExtensionSandboxInstallIpc({
      handleIpc,
      installPiExtensionSandboxPackage: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const targetThreadId = activeThreadIdForHost(host);
        const preview = await previewPiExtensionSandboxInstall(host.workspacePath, input);
        if (!preview.installable) throw new Error(`Sandboxed Pi extension package is not installable: ${preview.errors.join("; ")}`);
        const thread = targetStore.getThread(targetThreadId);
        const resolution = await requestPermissionWithGrantRegistry({
          threadId: targetThreadId,
          workspacePath: thread.workspacePath,
          toolName: "ambient_pi_extension_install_sandboxed",
          title: `Install sandboxed Pi extension "${preview.packageName ?? input.source}"?`,
          message: "Ambient will copy this Pi tool package into managed sandbox state and expose only its registered tools through permission-mediated calls.",
          detail: formatPiExtensionSandboxInstallApprovalDetail(preview),
          risk: "plugin-tool",
          grantTargetLabel: `Install sandboxed Pi extension ${preview.packageName ?? input.source}`,
        }, {
          thread,
          permissionMode: thread.permissionMode,
          workspacePath: host.workspacePath,
          store: targetStore,
        });
        const detail = formatPiExtensionSandboxInstallApprovalDetail(preview);
        const entry = targetStore.addPermissionAudit({
          threadId: targetThreadId,
          permissionMode: thread.permissionMode,
          toolName: "ambient_pi_extension_install_sandboxed",
          risk: "plugin-tool",
          decision: resolution.allowed ? "allowed" : "denied",
          detail,
          reason: resolution.allowed ? "Approved sandboxed Pi extension install." : "Denied sandboxed Pi extension install.",
          decisionSource: resolution.decisionSource,
          grantId: resolution.grant?.id,
        });
        emitPermissionAuditCreated(entry, host.workspacePath);
        if (!resolution.allowed) throw new Error("Sandboxed Pi extension install was not approved.");
        await installPiExtensionSandboxPackage(host.workspacePath, input);
        resetProjectRuntimeAndPluginServers(host);
        emitPluginCatalogUpdated(host.workspacePath);
        return discoverPiExtensionSandboxPackages(host.workspacePath);
      },
    });

    registerPiExtensionSandboxUninstallIpc({
      handleIpc,
      uninstallPiExtensionSandboxPackage: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const targetThreadId = activeThreadIdForHost(host);
        const removed = await uninstallPiExtensionSandboxPackage(host.workspacePath, input);
        const thread = targetStore.getThread(targetThreadId);
        const entry = targetStore.addPermissionAudit({
          threadId: targetThreadId,
          permissionMode: thread.permissionMode,
          toolName: "ambient_pi_extension_uninstall_sandboxed",
          risk: "plugin-tool",
          decision: "allowed",
          detail: [
            `Package: ${removed.removed.name}`,
            `Package id: ${removed.removed.id}`,
            `Source: ${removed.removed.source}`,
            `Root path: ${removed.removed.rootPath}`,
            "Effect: removed Ambient-managed sandbox package state.",
          ].join("\n"),
          reason: "Removed sandboxed Pi extension package.",
          decisionSource: "policy",
        });
        emitPermissionAuditCreated(entry, host.workspacePath);
        revokePluginGrantsForLabels([
          `Run sandboxed Pi extension ${removed.removed.name}:`,
          `Install sandboxed Pi extension ${removed.removed.name}`,
          `Uninstall sandboxed Pi extension ${removed.removed.name}`,
        ], targetStore);
        resetProjectRuntimeAndPluginServers(host);
        emitPluginCatalogUpdated(host.workspacePath);
        return removed.catalog;
      },
    });

    registerPiExtensionSandboxClearHistoryIpc({
      handleIpc,
      clearPiExtensionSandboxHistory: async () => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const targetThreadId = activeThreadIdForHost(host);
        const previous = await discoverPiExtensionSandboxPackages(host.workspacePath);
        const catalog = await clearPiExtensionSandboxHistory(host.workspacePath);
        const thread = targetStore.getThread(targetThreadId);
        const entry = targetStore.addPermissionAudit({
          threadId: targetThreadId,
          permissionMode: thread.permissionMode,
          toolName: "ambient_pi_extension_clear_history",
          risk: "plugin-tool",
          decision: "allowed",
          detail: [
            `Removed records: ${previous.history.length}`,
            previous.history.length ? `Packages: ${previous.history.map((pkg: any) => pkg.name).join(", ")}` : "Packages: none",
            "Effect: cleared Ambient-managed sandboxed Pi removed-package history.",
          ].join("\n"),
          reason: "Cleared sandboxed Pi package history.",
          decisionSource: "policy",
        });
        emitPermissionAuditCreated(entry, host.workspacePath);
        emitPluginCatalogUpdated(host.workspacePath);
        return catalog;
      },
    });

    registerPiPrivilegedInspectIpc({
      handleIpc,
      inspectPiPrivilegedPackages: () => discoverPiPrivilegedPackages(requireActiveProjectRuntimeHost().workspacePath),
    });

    registerPiPrivilegedScanIpc({
      handleIpc,
      scanPiPrivilegedPackage,
    });

    registerPiPrivilegedInstallIpc({
      handleIpc,
      installPiPrivilegedPackage: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const targetThreadId = activeThreadIdForHost(host);
        const scan = await scanPiPrivilegedPackage(input);
        const thread = targetStore.getThread(targetThreadId);
        const detail = formatPiPrivilegedInstallApprovalDetail(scan);
        const response = thread.permissionMode === "full-access"
          ? { allowed: true, decisionSource: "allowed_by_full_access" as const, grant: undefined }
          : await requestPermissionWithGrantRegistry({
            threadId: targetThreadId,
            toolName: "pi_privileged_install",
            title: `Install privileged Pi package "${scan.packageName}" as disabled?`,
            message: "Ambient will copy this privileged Pi package into managed state. Alpha installs remain disabled and do not activate hooks or mutate Pi settings.",
            detail,
            risk: "plugin-tool",
            grantActionKind: "plugin_tool_execute",
            grantTargetKind: "tool",
            grantTargetLabel: `Install privileged Pi package ${scan.packageName}`,
            grantTargetHash: permissionGrantTargetHash("plugin_tool_execute", "tool", ["pi_privileged_install", scan.packageName, scan.fingerprint].join("\0")),
          }, {
            thread,
            permissionMode: thread.permissionMode,
            workspacePath: host.workspacePath,
            store: targetStore,
          });
        const entry = targetStore.addPermissionAudit({
          threadId: targetThreadId,
          permissionMode: thread.permissionMode,
          toolName: "pi_privileged_install",
          risk: "plugin-tool",
          decision: response.allowed ? "allowed" : "denied",
          detail,
          reason: response.decisionSource === "allowed_by_full_access"
            ? "Allowed automatically by Full Access mode."
            : response.allowed ? "Approved privileged Pi install." : "Denied privileged Pi install.",
          decisionSource: response.decisionSource,
          grantId: response.grant?.id,
        });
        emitPermissionAuditCreated(entry, host.workspacePath);
        if (!response.allowed) throw new Error("Privileged Pi install was not approved.");
        await installPiPrivilegedPackage(host.workspacePath, input);
        resetProjectRuntimeAndPluginServers(host);
        emitPluginCatalogUpdated(host.workspacePath);
        return discoverPiPrivilegedPackages(host.workspacePath);
      },
    });

    registerPiPrivilegedDisableIpc({
      handleIpc,
      disablePiPrivilegedPackage: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const targetThreadId = activeThreadIdForHost(host);
        const disabled = await disablePiPrivilegedPackage(host.workspacePath, input);
        const thread = targetStore.getThread(targetThreadId);
        const entry = targetStore.addPermissionAudit({
          threadId: targetThreadId,
          permissionMode: thread.permissionMode,
          toolName: "pi_privileged_disable",
          risk: "plugin-tool",
          decision: "allowed",
          detail: [
            `Package: ${disabled.packageName}`,
            `Package id: ${disabled.id}`,
            `Source: ${disabled.source}`,
            `Scan origin: ${disabled.scan.scanOrigin}`,
            "Effect: package remains inactive in Ambient-managed privileged state.",
          ].join("\n"),
          reason: "Disabled privileged Pi package.",
          decisionSource: "policy",
        });
        emitPermissionAuditCreated(entry, host.workspacePath);
        resetProjectRuntimeAndPluginServers(host);
        emitPluginCatalogUpdated(host.workspacePath);
        return discoverPiPrivilegedPackages(host.workspacePath);
      },
    });

    registerPiPrivilegedUninstallIpc({
      handleIpc,
      uninstallPiPrivilegedPackage: async (input) => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const targetThreadId = activeThreadIdForHost(host);
        const removed = await uninstallPiPrivilegedPackage(host.workspacePath, input);
        const thread = targetStore.getThread(targetThreadId);
        const entry = targetStore.addPermissionAudit({
          threadId: targetThreadId,
          permissionMode: thread.permissionMode,
          toolName: "pi_privileged_uninstall",
          risk: "plugin-tool",
          decision: "allowed",
          detail: [
            `Package: ${removed.removed.packageName}`,
            `Package id: ${removed.removed.id}`,
            `Source: ${removed.removed.source}`,
            `Scan origin: ${removed.removed.scan.scanOrigin}`,
            `Root path: ${removed.removed.rootPath}`,
            "Effect: removed Ambient-managed privileged package manifest/import state.",
            ...removed.manualCleanup.map((note: any) => `Cleanup note: ${note}`),
          ].join("\n"),
          reason: "Removed privileged Pi package.",
          decisionSource: "policy",
        });
        emitPermissionAuditCreated(entry, host.workspacePath);
        revokePluginGrantsForLabels([
          `Install privileged Pi package ${removed.removed.packageName}`,
          `Uninstall privileged Pi package ${removed.removed.packageName}`,
        ], targetStore);
        resetProjectRuntimeAndPluginServers(host);
        emitPluginCatalogUpdated(host.workspacePath);
        return removed.catalog;
      },
    });

    registerPiPrivilegedClearHistoryIpc({
      handleIpc,
      clearPiPrivilegedPackageHistory: async () => {
        const host = requireActiveProjectRuntimeHost();
        const targetStore = host.store;
        const targetThreadId = activeThreadIdForHost(host);
        const previous = await discoverPiPrivilegedPackages(host.workspacePath);
        const catalog = await clearPiPrivilegedPackageHistory(host.workspacePath);
        const thread = targetStore.getThread(targetThreadId);
        const entry = targetStore.addPermissionAudit({
          threadId: targetThreadId,
          permissionMode: thread.permissionMode,
          toolName: "pi_privileged_clear_history",
          risk: "plugin-tool",
          decision: "allowed",
          detail: [
            `Removed records: ${previous.history.length}`,
            previous.history.length ? `Packages: ${previous.history.map((pkg: any) => pkg.packageName).join(", ")}` : "Packages: none",
            "Effect: cleared Ambient-managed privileged Pi removed-package history.",
          ].join("\n"),
          reason: "Cleared privileged Pi package history.",
          decisionSource: "policy",
        });
        emitPermissionAuditCreated(entry, host.workspacePath);
        emitPluginCatalogUpdated(host.workspacePath);
        return catalog;
      },
    });

    registerAutomationsListFoldersIpc({
      handleIpc,
      listAutomationFolders: () => requireActiveProjectRuntimeHost().store.listAutomationFolders(),
    });

    registerAutomationsCreateFolderIpc({
      handleIpc,
      createAutomationFolder: (input) => {
        const host = requireActiveProjectRuntimeHost();
        return host.store.createAutomationFolder(input);
      },
    });

    registerAutomationsMoveThreadIpc({
      handleIpc,
      moveAutomationThread: (input) => {
        const host = requireProjectRuntimeHostForAutomationThread(input.threadId);
        return host.store.moveAutomationThread(input);
      },
    });

    registerWorkflowAgentThreadIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForWorkflowThread,
      workflowProjectIpcContext,
      listGlobalWorkflowAgentFolders,
    });

    registerWorkflowAgentDiscoveryStartIpc<ProjectStore, ReturnType<typeof workflowProjectIpcContext>>({
      handleIpc,
      workflowProjectIpcContext,
      startWorkflowDiscovery: async ({ targetStore, thread, projectPath }, input) => {
        const workflowThread = { ...thread, workspacePath: projectPath };
        const providerStatus = getAmbientProviderStatus(workflowThread.model);
        const pluginRegistrations = await pluginMcpRegistrationsForThread(workflowThread, targetStore);
        return startWorkflowDiscovery(targetStore, input, {
          pluginRegistrations,
          connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
          searchRoutingSettings,
          permissionMode: thread.permissionMode,
          permissionAuditThreadId: thread.id,
          workspacePath: projectPath,
          provider: createWorkflowDiscoveryProvider(providerStatus, targetStore),
          onProgress: (progress: any) => emitWorkflowEvent({ type: "workflow-discovery-progress", progress }, projectPath),
        });
      },
    });

    registerWorkflowAgentRevisionDiscoveryStartIpc<ProjectStore, ReturnType<typeof workflowAgentIpcContextForWorkflowThread>>({
      handleIpc,
      workflowAgentIpcContextForWorkflowThread,
      startWorkflowRevisionDiscovery: async ({ targetStore, thread, workflowThread, projectPath }, input) => {
        const workflowContextThread = { ...thread, workspacePath: projectPath };
        const providerStatus = getAmbientProviderStatus(workflowContextThread.model);
        const pluginRegistrations = await pluginMcpRegistrationsForThread(workflowContextThread, targetStore);
        return startWorkflowRevisionDiscovery(targetStore, input, {
          pluginRegistrations,
          connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
          searchRoutingSettings,
          permissionMode: thread.permissionMode,
          permissionAuditThreadId: workflowThread.chatThreadId ?? thread.id,
          workspacePath: projectPath,
          provider: createWorkflowDiscoveryProvider(providerStatus, targetStore),
          onProgress: (progress: any) => emitWorkflowEvent({ type: "workflow-discovery-progress", progress }, projectPath),
        });
      },
      emitWorkflowUpdated,
    });

    registerWorkflowAgentDiscoveryAnswerIpc<ProjectStore, ReturnType<typeof workflowAgentIpcContextForDiscoveryQuestion>>({
      handleIpc,
      workflowAgentIpcContextForDiscoveryQuestion,
      answerWorkflowDiscoveryQuestion: async ({ targetStore, thread, workflowThread, projectPath }, input) => {
        const workflowContextThread = { ...thread, workspacePath: projectPath };
        const providerStatus = getAmbientProviderStatus(workflowContextThread.model);
        const pluginRegistrations = await pluginMcpRegistrationsForThread(workflowContextThread, targetStore);
        return answerWorkflowDiscoveryQuestion(targetStore, input, {
          pluginRegistrations,
          connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
          searchRoutingSettings,
          permissionMode: thread.permissionMode,
          permissionAuditThreadId: workflowThread.chatThreadId ?? thread.id,
          workspacePath: projectPath,
          provider: createWorkflowDiscoveryProvider(providerStatus, targetStore),
          onProgress: (progress: any) => emitWorkflowEvent({ type: "workflow-discovery-progress", progress }, projectPath),
        });
      },
    });

    registerWorkflowAgentDiscoveryAccessIpc({
      handleIpc,
      workflowAgentIpcContextForDiscoveryQuestion,
      connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
      resolveWorkflowDiscoveryAccessRequest,
      emitPermissionGrantCreated,
      emitWorkflowUpdated,
    });

    registerWorkflowAgentCapabilityIpc({
      handleIpc,
      workflowAgentIpcContextForWorkflowThread,
      workflowProjectIpcContext,
      workflowDiscoveryPolicyContextForCapabilityLookup,
      searchWorkflowDiscoveryCapabilities,
      describeWorkflowDiscoveryCapability,
    });

    registerWorkflowAgentNativeToolIpc<
      ProjectStore,
      ReturnType<typeof workflowProjectIpcContext> | ReturnType<typeof workflowAgentIpcContextForWorkflowThread>
    >({
      handleIpc,
      workflowAgentIpcContextForWorkflowThread,
      workflowProjectIpcContext,
      invokeWorkflowNativeTool: async (activeContext, input) => {
        const workflowContext = "workflowThread" in activeContext ? activeContext : undefined;
        const { targetStore, targetBrowserService, projectPath } = activeContext;
        const thread = workflowContext
          ? workflowAgentControlThread(targetStore, activeContext.thread, workflowContext.workflowThread, projectPath)
          : { ...activeContext.thread, workspacePath: projectPath };
        return invokeWorkflowNativeTool(
          {
            store: targetStore,
            workspacePath: projectPath,
            permissionMode: thread.permissionMode,
            defaultWorkflowThreadId: workflowContext?.workflowThread.id,
            runWorkflowArtifact: async (runInput: any) => {
              const artifact = targetStore.getWorkflowArtifact(runInput.artifactId);
              const artifactWorkflowThread = artifact.workflowThreadId
                ? targetStore.getWorkflowAgentThreadSummary(artifact.workflowThreadId)
                : workflowContext?.workflowThread;
              const artifactWorkspacePath = normalizeWorkspacePath(artifactWorkflowThread?.projectPath || projectPath);
              const artifactThread = artifactWorkflowThread
                ? workflowAgentControlThread(targetStore, thread, artifactWorkflowThread, artifactWorkspacePath)
                : { ...thread, workspacePath: artifactWorkspacePath };
              const provider = getAmbientProviderStatus(artifactThread.model);
              const abortController = new AbortController();
              const pluginRegistrations = await pluginMcpRegistrationsForThread(artifactThread, targetStore);
              const pluginRegistry = await pluginHost.listRegistry(artifactWorkspacePath, pluginStateReaderForStore(targetStore));
              try {
                return await runWorkflowArtifact({
                  store: targetStore,
                  artifactId: runInput.artifactId,
                  workspacePath: artifactWorkspacePath,
                  permissionMode: artifactThread.permissionMode,
                  browser: targetBrowserService,
                  requestPermission: async (request: any) =>
                    (
                      await requestPermissionWithGrantRegistry(request, {
                        thread: artifactThread,
                        permissionMode: artifactThread.permissionMode,
                        workspacePath: artifactWorkspacePath,
                        workflowThreadId: artifact.workflowThreadId,
                        store: targetStore,
                      })
                    ).allowed,
                  pluginRegistrations,
                  pluginRegistry,
                  ensurePluginTrusted: (registration: any) => ensureWorkflowPluginTrusted(artifactThread, registration, targetStore),
                  pluginCaller: (plan: any, invocation: any, options: any) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
                  connectorRegistrations: firstPartyWorkflowConnectorRegistrations(),
                  connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer(),
                  model: artifactThread.model,
                  baseUrl: provider.baseUrl,
                  mode: runInput.mode,
                  runtime: runInput.runtime,
                  runLimits: runInput.runLimits,
                  abortSignal: abortController.signal,
                  onRunStarted: (runId: string) => {
                    rememberActiveWorkflowRun(runId, abortController, artifactWorkspacePath);
                    mainWindow?.webContents.send("desktop:event", {
                      type: "workflow-run-started",
                      runId,
                      artifactId: artifact.id,
                      workflowThreadId: artifact.workflowThreadId,
                      workspacePath: artifactWorkspacePath,
                    } satisfies DesktopEvent);
                    emitWorkflowUpdated(artifactWorkspacePath);
                  },
                  onEvent: () => emitWorkflowUpdated(artifactWorkspacePath),
                });
              } finally {
                forgetActiveWorkflowRunsForController(abortController);
              }
            },
            connectorDescriptors: () => firstPartyWorkflowConnectorDescriptors(),
            pluginRegistrationsForWorkspace: (workspacePath: string) => pluginMcpRegistrationsForThread({ ...thread, workspacePath }, targetStore),
            searchRoutingSettings,
          },
          input,
        );
      },
    });

    registerWorkflowAgentTraceIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForWorkflowThread,
    });

    registerWorkflowAgentExplorationIpc<ProjectStore, ReturnType<typeof workflowAgentIpcContextForWorkflowThread>>({
      handleIpc,
      workflowAgentIpcContextForWorkflowThread,
      runWorkflowThreadExploration: async ({ targetStore, targetBrowserService, thread, workflowThread, projectPath }, input) => {
        const workflowWorkspacePath = projectPath;
        const workflowThreadContext = workflowAgentControlThread(targetStore, thread, workflowThread, workflowWorkspacePath);
        const providerStatus = getAmbientProviderStatus(workflowThreadContext.model);
        const pluginRegistrations = await pluginMcpRegistrationsForThread(workflowThreadContext, targetStore);
        const pluginRegistry = await pluginHost.listRegistry(workflowWorkspacePath, pluginStateReaderForStore(targetStore));
        return runWorkflowThreadExploration({
          store: targetStore,
          workflowThreadId: input.workflowThreadId,
          toolDescriptors: workflowToolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
          connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
          connectorRegistrations: [workspaceInventoryConnector(workflowWorkspacePath), ...firstPartyWorkflowConnectorRegistrations()],
          connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer(),
          pluginRegistrations,
          ambientCliCapabilities: await ambientCliCapabilityGrantsForWorkflowRequest(workflowWorkspacePath, workflowThread.initialRequest),
          workspacePath: workflowWorkspacePath,
          permissionMode: workflowThreadContext.permissionMode,
          model: providerStatus.model,
          baseUrl: providerStatus.baseUrl,
          retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
          browser: targetBrowserService,
          requestPermission: async (request: any) =>
            (
              await requestPermissionWithGrantRegistry(request, {
                thread: workflowThreadContext,
                permissionMode: workflowThreadContext.permissionMode,
                workspacePath: workflowWorkspacePath,
                workflowThreadId: input.workflowThreadId,
                store: targetStore,
              })
            ).allowed,
          ensurePluginTrusted: (registration: any) => ensureWorkflowPluginTrusted(workflowThreadContext, registration, targetStore),
          pluginCaller: (plan: any, invocation: any, options: any) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
          provider: new AmbientWorkflowExplorationProvider({
            apiKey: readAmbientApiKey(),
            baseUrl: providerStatus.baseUrl,
            retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
          }),
          onProgress: (progress: any) =>
            emitWorkflowEvent({ type: "workflow-exploration-progress", progress }, workflowWorkspacePath),
          budgets: {
            maxModelTurns: input.maxModelTurns,
            maxToolCalls: input.maxToolCalls,
            maxConnectorCalls: input.maxConnectorCalls,
            maxAmbientCalls: input.maxAmbientCalls,
            maxElapsedMs: input.maxElapsedMs,
          },
        });
      },
      emitWorkflowUpdated,
    });

    registerWorkflowAgentRevisionIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForWorkflowThread,
      requireProjectRuntimeHostForWorkflowVersion,
      requireProjectRuntimeHostForWorkflowRevision,
      restoreWorkflowVersion: (host, input) =>
        restoreWorkflowVersion(host.store, input, {
          connectorDescriptors: firstPartyWorkflowConnectorDescriptors(),
        }),
      emitWorkflowUpdated,
      recordWorkflowRevisionDecisionInChat,
    });

    registerAutomationsListSchedulesIpc({
      handleIpc,
      listAutomationSchedules: () => requireActiveProjectRuntimeHost().store.listAutomationSchedules(),
    });

    registerAutomationsCreateScheduleIpc({
      handleIpc,
      createAutomationSchedule: (input) => {
        const host = requireProjectRuntimeHostForAutomationScheduleTarget(input);
        return host.store.createAutomationSchedule(input);
      },
    });

    registerAutomationsUpdateScheduleIpc({
      handleIpc,
      updateAutomationSchedule: (input) => {
        const host = requireProjectRuntimeHostForAutomationSchedule(input.id);
        return host.store.updateAutomationSchedule(input);
      },
    });

    registerAutomationsListScheduleExceptionsIpc({
      handleIpc,
      listAutomationScheduleExceptions: (input) => {
        const host = input.scheduleId
          ? requireProjectRuntimeHostForAutomationSchedule(input.scheduleId)
          : requireActiveProjectRuntimeHost();
        return host.store.listAutomationScheduleExceptions(input);
      },
    });

    registerAutomationsSkipScheduleOccurrenceIpc({
      handleIpc,
      skipAutomationScheduleOccurrence: (input) => {
        const host = requireProjectRuntimeHostForAutomationSchedule(input.scheduleId);
        return host.store.skipAutomationScheduleOccurrence(input);
      },
    });

    registerAutomationsRescheduleScheduleOccurrenceIpc({
      handleIpc,
      rescheduleAutomationScheduleOccurrence: (input) => {
        const host = requireProjectRuntimeHostForAutomationSchedule(input.scheduleId);
        return host.store.rescheduleAutomationScheduleOccurrence(input);
      },
    });

    registerAutomationsUpdateScheduleOccurrenceRunLimitsIpc({
      handleIpc,
      updateAutomationScheduleOccurrenceRunLimits: (input) => {
        const host = requireProjectRuntimeHostForAutomationSchedule(input.scheduleId);
        return host.store.updateAutomationScheduleOccurrenceRunLimits(input);
      },
    });

    registerWorkflowDashboardIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireActiveProjectRuntimeHost,
      requireProjectRuntimeHostForWorkflowRun,
      readWorkflowDashboard,
      readWorkflowRunDetail,
      createWorkflowSampleArtifact,
      emitWorkflowUpdated,
    });

    registerWorkflowCompilePreviewIpc<ProjectStore, ThreadSummary, AmbientPluginRegistry, PluginMcpToolRegistration[]>({
      handleIpc,
      workflowCompileIpcContext,
      workspaceStateForThread,
      getAmbientProviderStatus,
      pluginMcpRegistrationsForThread,
      listPluginRegistry: (projectPath, targetStore) => pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
      workflowToolDescriptorsFromPluginRegistry,
      connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
      readSearchRoutingSettings: () => searchRoutingSettings,
      ambientRetryPolicyFromCurrentSettings,
      compileWorkflowArtifact,
      emitWorkflowEvent,
      emitWorkflowUpdated,
    });

    registerWorkflowDebugRewriteIpc<
      ProjectStore,
      ThreadSummary,
      ReturnType<ProjectStore["getWorkflowAgentThreadSummary"]>,
      ReturnType<typeof buildWorkflowDebugRewriteContext>,
      AmbientPluginRegistry,
      PluginMcpToolRegistration[]
    >({
      handleIpc,
      readE2eEnabled: () => process.env.AMBIENT_E2E === "1",
      emitE2eWorkflowDebugRewriteInput: (input) =>
        mainWindow?.webContents.send("desktop:event", { type: "e2e-workflow-debug-rewrite-input", input }),
      readE2eWorkflowDashboard: () => readWorkflowDashboard(store),
      workflowDebugRewriteIpcContext,
      workflowDebugRewriteUserRequest,
      workspaceStateForThread,
      getAmbientProviderStatus,
      pluginMcpRegistrationsForThread,
      listPluginRegistry: (projectPath, targetStore) => pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
      workflowToolDescriptorsFromPluginRegistry,
      connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
      readSearchRoutingSettings: () => searchRoutingSettings,
      ambientRetryPolicyFromCurrentSettings,
      buildWorkflowDebugRewritePromptSection,
      compileWorkflowArtifact,
      createWorkflowDebugRewriteRevision,
      emitWorkflowEvent,
      emitWorkflowUpdated,
    });

    registerWorkflowArtifactReviewIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForWorkflowArtifact,
      reviewWorkflowArtifact,
      emitWorkflowUpdated,
    });

    registerWorkflowConnectorGrantIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForWorkflowArtifact,
      updateWorkflowConnectorGrant,
      emitWorkflowUpdated,
    });

    registerWorkflowArtifactRevalidationIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForWorkflowArtifact,
      revalidateWorkflowArtifact,
      connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
      emitWorkflowUpdated,
    });

    registerWorkflowArtifactSourceIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForWorkflowArtifact,
      updateWorkflowArtifactSource,
      connectorDescriptors: firstPartyWorkflowConnectorDescriptors,
      emitWorkflowUpdated,
    });

    registerWorkflowRunArtifactIpc<ProjectStore, ThreadSummary, BrowserService, ReturnType<ProjectStore["getWorkflowArtifact"]>>({
      handleIpc,
      workflowArtifactIpcContext,
      getAmbientProviderStatus,
      pluginMcpRegistrationsForThread,
      listPluginRegistry: (projectPath, targetStore) => pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
      requestPermissionWithGrantRegistry,
      ensureWorkflowPluginTrusted,
      pluginCaller: (plan: any, invocation: any, options: any) => pluginHost.callCodexPluginMcpTool(plan, invocation, options),
      connectorRegistrations: firstPartyWorkflowConnectorRegistrations,
      connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer,
      runWorkflowArtifact,
      rememberActiveWorkflowRun,
      forgetActiveWorkflowRunsForController,
      emitWorkflowEvent,
      emitWorkflowUpdated,
    });

    registerWorkflowRecoverRunIpc<ProjectStore, ProjectRuntimeHost, ThreadSummary, BrowserService, ReturnType<ProjectStore["getWorkflowArtifact"]>>({
      handleIpc,
      requireProjectRuntimeHostForWorkflowRun,
      buildWorkflowRecoveryPlan,
      workflowArtifactIpcContextForHost,
      markStaleWorkflowRunForRecoveryIfNeeded,
      getAmbientProviderStatus,
      pluginMcpRegistrationsForThread,
      listPluginRegistry: (projectPath, targetStore) => pluginHost.listRegistry(projectPath, pluginStateReaderForStore(targetStore)),
      requestPermissionWithGrantRegistry,
      ensureWorkflowPluginTrusted,
      pluginCaller: (runPlan, invocation, options) => pluginHost.callCodexPluginMcpTool(runPlan, invocation, options),
      connectorRegistrations: firstPartyWorkflowConnectorRegistrations,
      connectorAccountAuthorizer: firstPartyWorkflowConnectorAccountAuthorizer,
      runWorkflowArtifact,
      rememberActiveWorkflowRun,
      forgetActiveWorkflowRunsForController,
      emitWorkflowEvent,
      emitWorkflowUpdated,
    });

    registerWorkflowCancelRunIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      projectRuntimeHostForWorkflowRun,
      activeWorkflowRunHost,
      activeWorkflowRunController,
      readWorkflowDashboard,
      emitWorkflowUpdated,
    });

    handleIpc("callable-workflow:cancel-task", (_event: unknown, raw: unknown) => {
      const input = cancelCallableWorkflowTaskSchema.parse(raw);
      const host = requireProjectRuntimeHostForCallableWorkflowTask(input.taskId);
      if (!isAmbientSubagentsEnabled(currentFeatureFlagSnapshot(host.store))) {
        throw new Error("Callable workflow task controls are disabled while ambient.subagents is off.");
      }
      return host.runtime.cancelCallableWorkflowTask({
        taskId: input.taskId,
        reason: input.reason,
      });
    });

    handleIpc("callable-workflow:pause-task", (_event: unknown, raw: unknown) => {
      const input = pauseCallableWorkflowTaskSchema.parse(raw);
      const host = requireProjectRuntimeHostForCallableWorkflowTask(input.taskId);
      if (!isAmbientSubagentsEnabled(currentFeatureFlagSnapshot(host.store))) {
        throw new Error("Callable workflow task controls are disabled while ambient.subagents is off.");
      }
      return host.runtime.pauseCallableWorkflowTask({
        taskId: input.taskId,
        reason: input.reason,
      });
    });

    handleIpc("callable-workflow:resume-task", async (_event: unknown, raw: unknown) => {
      const input = resumeCallableWorkflowTaskSchema.parse(raw);
      const host = requireProjectRuntimeHostForCallableWorkflowTask(input.taskId);
      if (!isAmbientSubagentsEnabled(currentFeatureFlagSnapshot(host.store))) {
        throw new Error("Callable workflow task controls are disabled while ambient.subagents is off.");
      }
      return host.runtime.resumeCallableWorkflowTask({
        taskId: input.taskId,
      });
    });

    registerWorkflowApprovalIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForWorkflowRun,
      resolveWorkflowApproval,
      emitWorkflowUpdated,
    });

    registerSubagentApprovalIpc<ProjectStore, ProjectRuntimeHost>({
      handleIpc,
      requireProjectRuntimeHostForSubagentRun,
      requireProjectRuntimeHostForSubagentWaitBarrier,
      getFeatureFlagSnapshot: currentFeatureFlagSnapshot,
      resolveSubagentApproval: resolveSubagentApprovalDecision,
      resolveSubagentWaitBarrier: (host, input) => host.runtime.resolveSubagentWaitBarrier(input),
      cancelSubagentRun: (host, input) => host.runtime.cancelSubagentRun(input),
      closeSubagentRun: (host, input) => host.runtime.closeSubagentRun(input),
      emitSubagentParentMailboxEventUpdated: (host, mailboxEvent) =>
        emitProjectScopedEvent(host, { type: "subagent-parent-mailbox-event-updated", mailboxEvent }),
      emitProjectStateUpdated: emitProjectStateIfActive,
    });

    registerDiagnosticsIpc({
      handleIpc,
      exportDiagnosticBundle: async () => {
        const host = requireActiveProjectRuntimeHost();
        const now = new Date();
        const defaultPayload = await createDiagnosticBundle(createMainDiagnosticSource(host), getAppLogs(), {
          appName: app.getName(),
          appVersion: app.getVersion(),
          now,
        });
        const body = `${JSON.stringify(defaultPayload.bundle, null, 2)}\n`;
        const e2eDiagnosticPath = process.env.AMBIENT_E2E === "1" ? process.env.AMBIENT_E2E_DIAGNOSTICS_PATH : undefined;
        if (e2eDiagnosticPath) {
          await writeFile(e2eDiagnosticPath, body, "utf8");
          return {
            path: e2eDiagnosticPath,
            bytes: Buffer.byteLength(body),
            createdAt: defaultPayload.bundle.createdAt,
            summary: defaultPayload.bundle.summary,
            subagents: {
              replayEvidence: defaultPayload.bundle.subagents.replayEvidence,
            },
          };
        }

        const result = await dialog.showSaveDialog(mainWindow!, {
          title: "Export Diagnostic Bundle",
          defaultPath: join(app.getPath("downloads"), defaultPayload.fileName),
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) return undefined;

        await writeFile(result.filePath, body, "utf8");
        return {
          path: result.filePath,
          bytes: Buffer.byteLength(body),
          createdAt: defaultPayload.bundle.createdAt,
          summary: defaultPayload.bundle.summary,
          subagents: {
            replayEvidence: defaultPayload.bundle.subagents.replayEvidence,
          },
        };
      },
      importDiagnosticBundle: async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
          title: "Import Diagnostic Bundle",
          properties: ["openFile"],
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        const filePath = result.filePaths[0];
        if (result.canceled || !filePath) return undefined;
        return importDiagnosticBundleFromFile(filePath);
      },
    });

    registerThreadExportChatIpc({
      handleIpc,
      exportChat: async (input) => {
        const host = requireProjectRuntimeHostForThread(input.threadId);
        const payload = await createChatExportBundle(host.store, input.threadId, {
          appName: app.getName(),
          appVersion: app.getVersion(),
        });
        const e2eExportPath = process.env.AMBIENT_E2E === "1" ? process.env.AMBIENT_E2E_CHAT_EXPORT_PATH : undefined;
        if (e2eExportPath) {
          await writeFile(e2eExportPath, payload.archive);
          return {
            path: e2eExportPath,
            bytes: payload.archive.byteLength,
            createdAt: payload.createdAt,
            source: payload.source,
            fallbackReason: payload.fallbackReason,
          };
        }

        const result = await dialog.showSaveDialog(mainWindow!, {
          title: "Export Chat",
          defaultPath: join(app.getPath("downloads"), payload.fileName),
          filters: [{ name: "Zip Archive", extensions: ["zip"] }],
        });
        if (result.canceled || !result.filePath) return undefined;

        await writeFile(result.filePath, payload.archive);
        return {
          path: result.filePath,
          bytes: payload.archive.byteLength,
          createdAt: payload.createdAt,
          source: payload.source,
          fallbackReason: payload.fallbackReason,
        };
      },
    });

    registerPermissionListIpc({
      handleIpc,
      listPermissionAudit: () => requireActiveProjectRuntimeHost().store.listPermissionAudit(),
      listPermissionGrants: () => requireActiveProjectRuntimeHost().store.listPermissionGrants(),
      listPendingPermissionRequests: () => permissions.listPending(),
    });

    registerPermissionCreateGrantIpc({
      handleIpc,
      createPermissionGrant: (input) => {
        const host = requireProjectRuntimeHostForPermissionGrantInput(input);
        const grant = host.store.createPermissionGrant(input);
        emitPermissionGrantCreated(grant, permissionGrantWorkspacePath(grant, host.store));
        return grant;
      },
    });

    registerPermissionRevokeGrantIpc({
      handleIpc,
      revokePermissionGrant: (input) => {
        const host = requireProjectRuntimeHostForPermissionGrant(input.id);
        const grant = host.store.revokePermissionGrant(input.id);
        emitPermissionGrantRevoked(grant, permissionGrantWorkspacePath(grant, host.store));
        return grant;
      },
    });

    registerPermissionRespondIpc({
      handleIpc,
      respondPermissionPrompt: (id, response) => permissions.respond(id, response),
    });

    registerPrivilegedCredentialRespondIpc({
      handleIpc,
      respondPrivilegedCredential: (input) => privilegedCredentials.respond(input),
    });

    registerSecureInputRespondIpc({
      handleIpc,
      respondSecureInput: (input) => secureInputs.respond(input),
    });

    registerAmbientCliSaveSecretIpc({
      handleIpc,
      saveAmbientCliSecret: async (input) => {
        const workspacePath = activeWorkspaceFileContextForProjectHost().workspacePath;
        if (input.mcpServerId || input.mcpCandidateId || input.mcpCandidateRef) {
          const status = await saveMcpServerEnvSecret(workspacePath, {
            ...(input.mcpServerId ? { serverId: input.mcpServerId } : {}),
            ...(input.mcpCandidateId ? { candidateId: input.mcpCandidateId } : {}),
            ...(input.mcpCandidateRef ? { candidateRef: input.mcpCandidateRef } : {}),
            envName: input.envName,
            value: input.value,
          });
          return {
            packageName: input.packageName ?? status.serverId ?? status.candidateId ?? status.candidateRef ?? "MCP server",
            ...(status.serverId ? { mcpServerId: status.serverId } : {}),
            ...(status.candidateId ? { mcpCandidateId: status.candidateId } : {}),
            ...(status.candidateRef ? { mcpCandidateRef: status.candidateRef } : {}),
            ownerId: status.ownerId,
            envName: status.envName,
            source: "managed-secret" as const,
            secretRef: status.secretRef,
            configured: status.configured,
          };
        }
        if (input.builderSourcePath) {
          const status = await saveCapabilityBuilderEnvSecret(workspacePath, {
            path: input.builderSourcePath,
            ...(input.packageName ? { packageName: input.packageName } : {}),
            envName: input.envName,
            value: input.value,
          });
          return {
            packageName: status.packageName,
            builderSourcePath: status.relativeRootPath,
            envName: status.envName,
            source: status.source,
            secretRef: status.secretRef,
            ...(status.filePath ? { filePath: status.filePath } : {}),
            configured: status.configured,
          };
        }
        const catalog = await discoverAmbientCliPackages(workspacePath);
        const pkg = selectAmbientCliPackageForSecret(catalog.packages, {
          packageId: input.packageId,
          packageName: input.packageName,
        });
        const requirement = pkg.envRequirements.find((item: any) => item.name === input.envName);
        if (!requirement) throw new Error(`Ambient CLI package "${pkg.name}" does not declare env requirement "${input.envName}".`);
        const status = await saveAmbientCliPackageEnvSecret(workspacePath, {
          packageName: pkg.name,
          envName: requirement.name,
          value: input.value,
        });
        return {
          packageId: pkg.id,
          packageName: pkg.name,
          envName: status.name,
          source: status.source === "file" ? "file" as const : "managed-secret" as const,
          ...(status.secretRef ? { secretRef: status.secretRef } : {}),
          ...(status.filePath ? { filePath: status.filePath } : {}),
          configured: status.configured,
        };
      },
    });

    async function reviewTerminalCommand(input: { threadId: string; command: string }, host: ProjectRuntimeHost): Promise<boolean> {
      const targetStore = host.store;
      const thread = targetStore.getThread(input.threadId);
      const permissionMode = thread.permissionMode;
      const decision = await classifyToolPermission({
        threadId: input.threadId,
        permissionMode,
        workspacePath: thread.workspacePath,
        toolName: "bash",
        toolInput: { command: input.command },
      });
      if (decision.action === "allow") {
        if (permissionMode === "workspace") {
          const entry = targetStore.addPermissionAudit({
            threadId: input.threadId,
            permissionMode,
            toolName: "terminal",
            risk: "workspace-command",
            decision: "allowed",
            detail: input.command,
            reason: "Allowed workspace terminal command.",
          });
          emitPermissionAuditCreated(entry, thread.workspacePath);
        }
        return true;
      }

      if (decision.action === "deny") {
        const entry = targetStore.addPermissionAudit({
          threadId: input.threadId,
          permissionMode,
          toolName: "terminal",
          risk: decision.request.risk,
          decision: "denied",
          detail: decision.request.detail,
          reason: decision.reason,
        });
        emitPermissionAuditCreated(entry, thread.workspacePath);
        return false;
      }

      const permission = await requestPermissionWithGrantRegistry(decision.request, {
        thread,
        permissionMode,
        workspacePath: thread.workspacePath,
        store: targetStore,
      });
      const entry = targetStore.addPermissionAudit({
        threadId: input.threadId,
        permissionMode,
        toolName: "terminal",
        risk: decision.request.risk,
        decision: permission.allowed ? "allowed" : "denied",
        detail: decision.request.detail,
        reason: permission.allowed ? "Approved terminal command." : "Denied terminal command.",
        decisionSource: permission.decisionSource,
        grantId: permission.grant?.id,
      });
      emitPermissionAuditCreated(entry, thread.workspacePath);
      return permission.allowed;
    }

    registerTerminalRequestStartIpc({
      handleIpc,
      assertTrustedTerminalIpc: (event) => assertTrustedMainWindowIpc(event),
      requestTerminalStart: (input) => {
        const host = requireProjectRuntimeHostForThread(input.threadId);
        if (!isActiveProjectRuntimeHost(host) || input.threadId !== activeThreadIdForHost(host)) throw new Error("Terminal can only start for the active thread.");
        host.store.getThread(input.threadId);
        return terminalStartTokens.issue({ threadId: input.threadId, workspacePath: host.workspacePath });
      },
    });

    registerTerminalStartIpc({
      handleIpc,
      assertTrustedTerminalIpc: (event) => assertTrustedMainWindowIpc(event),
      startTerminal: (input) => {
        const startToken = terminalStartTokens.consume({ threadId: input.threadId, token: input.startToken });
        const host = projectRuntimeHostForWorkspacePath(startToken.workspacePath);
        if (!host) throw new Error("Terminal project is no longer available.");
        if (input.threadId !== activeThreadIdForHost(host)) throw new Error("Terminal can only start for the active thread.");
        const thread = host.store.getThread(input.threadId);
        return host.terminals.start(thread.workspacePath, {
          threadId: thread.id,
          permissionMode: thread.permissionMode,
        });
      },
    });

    registerTerminalSubmitCommandIpc({
      handleIpc,
      assertTrustedTerminalIpc: (event) => assertTrustedMainWindowIpc(event),
      submitTerminalCommand: async (input) => {
        const host = projectRuntimeHostForTerminal(input.terminalId) ?? requireProjectRuntimeHostForThread(input.threadId);
        const allowed = await reviewTerminalCommand(input, host);
        if (!allowed) throw new Error("Command blocked by workspace permission policy.");
        host.terminals.write(input.terminalId, `${input.command}\r`, {
          threadId: input.threadId,
          sessionToken: input.sessionToken,
        });
      },
    });

    registerTerminalControlIpc({
      handleIpc,
      assertTrustedTerminalIpc: (event) => assertTrustedMainWindowIpc(event),
      controlTerminal: (input) => {
        const host = projectRuntimeHostForTerminal(input.terminalId) ?? requireProjectRuntimeHostForThread(input.threadId);
        const data = input.action === "interrupt" ? "\x03" : "\r";
        host.terminals.write(input.terminalId, data, {
          threadId: input.threadId,
          sessionToken: input.sessionToken,
        });
      },
    });

    registerTerminalResizeIpc({
      handleIpc,
      assertTrustedTerminalIpc: (event) => assertTrustedMainWindowIpc(event),
      resizeTerminal: (input) => {
        const host = projectRuntimeHostForTerminal(input.terminalId) ?? requireProjectRuntimeHostForThread(input.threadId);
        host.terminals.resize(input.terminalId, input.cols, input.rows, {
          threadId: input.threadId,
          sessionToken: input.sessionToken,
        });
      },
    });

    registerTerminalStopIpc({
      handleIpc,
      assertTrustedTerminalIpc: (event) => assertTrustedMainWindowIpc(event),
      stopTerminal: (input) => {
        const host = projectRuntimeHostForTerminal(input.terminalId) ?? requireProjectRuntimeHostForThread(input.threadId);
        host.terminals.stop(input.terminalId, {
          threadId: input.threadId,
          sessionToken: input.sessionToken,
        });
      },
    });

    registerMessageSendIpc({
      handleIpc,
      sendMessage: async (input, raw) => {
        const host = requireProjectRuntimeHostForThread(input.threadId);
        const targetStore = host.store;
        const targetRuntime = host.runtime;
        let thread = targetStore.getThread(input.threadId);
        const stateThreadId = input.preserveActiveThread ? activeThreadIdForHost(host) : input.threadId;
        if (!input.preserveActiveThread) {
          setProjectHostActiveThreadId(host, input.threadId);
        }
        if ((!thread.gitWorktree || thread.gitWorktree.status !== "active") && thread.workspacePath === targetStore.getWorkspace().path) {
          thread = await prepareWorktreeForThread(thread, targetStore);
          emitProjectStateIfActive(host, stateThreadId);
          if (!isActiveProjectRuntimeHost(host)) emitThreadUpdated(thread);
        }
        const context = input.context?.length
          ? await describeWorkspaceContextReferences(
              thread.workspacePath,
              input.context,
              { allowExternal: input.permissionMode === "full-access" },
            )
          : undefined;
        if (input.retryOfMessageId) {
          targetStore.deleteMessagesAfter(input.threadId, input.retryOfMessageId);
          emitProjectStateIfActive(host, stateThreadId);
        }
        if (input.goalMode?.enabled) {
          if (input.collaborationMode === "planner") {
            throw new Error("Goal mode is disabled while Planner mode is active.");
          }
          const existingGoal = targetStore.getThreadGoal(input.threadId);
          const goal = existingGoal
            ? targetStore.setThreadGoal({
                threadId: input.threadId,
                status: "active",
                expectedGoalId: existingGoal.goalId,
                tokenBudget: input.goalMode.tokenBudget ?? existingGoal.tokenBudget ?? null,
                statusReason: null,
              })
            : targetStore.createThreadGoalIfAbsent({
                threadId: input.threadId,
                objective: input.content,
                tokenBudget: input.goalMode.tokenBudget ?? null,
              });
          emitProjectScopedEvent(host, { type: "thread-goal-updated", goal });
          emitProjectStateIfActive(host, stateThreadId);
        }
        if (input.delivery === undefined || input.delivery === "prompt") {
          await createAndRecordCheckpoint("pre-run", "Before Ambient run.", thread, targetStore);
        }
        if (process.env.AMBIENT_E2E_CAPTURE_MESSAGES === "1") {
          mainWindow?.webContents.send("desktop:event", { type: "e2e-message-captured", input: raw } satisfies DesktopEvent);
          return;
        }
        await targetRuntime.send({ ...input, context });
        if (!input.preserveActiveThread && activeHost === host && activeThreadId === input.threadId) {
          emitThreadUpdated(targetStore.markThreadRead(input.threadId));
        }
      },
    });

    registerRunAbortIpc({
      handleIpc,
      abortRun: (threadId) => {
        return requireProjectRuntimeHostForThread(threadId).runtime.abort(threadId);
      },
    });
    registerContextUsageIpc({
      handleIpc,
      getContextUsage: (threadId) => {
        return requireProjectRuntimeHostForThread(threadId).runtime.getContextUsage(threadId);
      },
    });
    registerContextCompactIpc({
      handleIpc,
      compactThread: (input) => {
        return requireProjectRuntimeHostForThread(input.threadId).runtime.compactThread(input);
      },
    });
    registerContextRecoverIpc({
      handleIpc,
      recoverThreadContext: (input) => {
        return requireProjectRuntimeHostForThread(input.threadId).runtime.recoverThreadContext(input);
      },
    });

    registerE2eEmitEventIpc({
      handleIpc,
      isE2eEnabled: () => process.env.AMBIENT_E2E === "1",
      emitDesktopEvent: (event, raw) => {
        event.sender.send("desktop:event", raw);
      },
    });
}
