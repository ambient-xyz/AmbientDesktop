import "@xyflow/react/dist/style.css";
import {
  useRef,
  useState,
} from "react";
import type {
  DesktopEvent,
  DesktopState,
} from "../../shared/desktopTypes";
import {
  isRunStatusRunning,
} from "../../shared/runStatus";
import { useAppAgentMemoryPanelControls } from "./AppAgentMemoryControls";
import { useAppActiveThreadModel } from "./AppActiveThreadModel";
import { createAppAutomationFolderControls } from "./AppAutomationFolderControls";
import { createAppAutomationSelectionControls } from "./AppAutomationSelectionControls";
import { useAppAutomationShellState } from "./AppAutomationShellState";
import { createAppAutomationsWorkspaceProps } from "./AppAutomationsWorkspaceProps";
import { createAppBrowserActionControls } from "./AppBrowserActionControls";
import { createAppCapabilityPromptActions } from "./AppCapabilityPromptActions";
import { useAppChatFindControls } from "./AppChatFindControls";
import { useAppComposerModelPickerControls } from "./AppComposerModelPickerControls";
import { createAppComposerProps } from "./AppComposerProps";
import { createAppComposerRetryActions } from "./AppComposerRetryActions";
import { useAppComposerShellState } from "./AppComposerShellState";
import { createAppComposerSubmitActions } from "./AppComposerSubmitActions";
import {
  createAppComposerInteractionControls,
  createAppLocalDeepResearchModeControls,
  createAppPendingSubmittedPromptControls,
  useAppPendingSubmittedPromptCleanup,
} from "./AppComposerInteractionControls";
import { createAppComposerShellProps } from "./AppComposerShellProps";
import { createAppContextAttachmentActions } from "./AppContextAttachmentActions";
import { useAppCoreLifecycleControls } from "./AppCoreLifecycleControls";
import {
  useAppConversationDisplayModel,
} from "./AppConversationDisplayModel";
import { createAppConversationMessagesProps } from "./AppConversationMessagesProps";
import { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import {
  createAppDesktopEventHandlerDependencies,
  handleAppDesktopEvent,
} from "./AppDesktopEventHandler";
import { createAppDesktopEventGuards } from "./AppDesktopEventGuards";
import { createAppDesktopStateMemoryControls } from "./AppDesktopStateMemoryControls";
import { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import { createAppGitActions } from "./AppGitActions";
import { createAppGoalActions } from "./AppGoalActions";
import {
  GOAL_COMPLETION_CELEBRATION_MS,
} from "./AppGoalControls";
import {
  useAppLocalDeepResearchLifecycle,
} from "./AppLocalDeepResearchLifecycle";
import { createAppLocalRuntimeActionsForRuntimeState } from "./AppLocalRuntimeActions";
import { createAppMessageVoiceActions } from "./AppMessageVoiceActions";
import { createAppModalHostProps } from "./AppModalHostProps";
import { createAppPermissionActions } from "./AppPermissionActions";
import { createAppPlannerActions } from "./AppPlannerActions";
import { useAppProjectBoardControls } from "./AppProjectBoardControls";
import { createAppProjectBoardWorkspaceProps } from "./AppProjectBoardWorkspaceProps";
import { useAppProjectShellState } from "./AppProjectShellState";
import { createAppProjectThreadActions } from "./AppProjectThreadActions";
import { createAppPromptHistoryControls } from "./AppPromptHistoryControls";
import { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import { createAppRightPanelHostProps } from "./AppRightPanelHostProps";
import { useAppRightPanelState } from "./AppRightPanelState";
import {
  EMPTY_RUN_ACTIVITY_LINES,
} from "./AppRunActivity";
import { useAppRunActivityState } from "./AppRunActivityState";
import { useAppSecurityPromptState } from "./AppSecurityPromptState";
import { createAppSettingsActions } from "./AppSettingsActions";
import {
  useAppLocalDeepResearchReadinessLifecycleEffect,
} from "./AppShellLifecycleEffects";
import {
  createAppShellCommandActions,
  createAppWorkflowComposerNavigation,
} from "./AppShellCommandActions";
import { createAppShellSidebarProps } from "./AppShellSidebarProps";
import { useAppShellUiState } from "./AppShellUiState";
import { createAppSidebarAreaControls } from "./AppSidebarAreaControls";
import { useAppSidebarLifecycleEffects } from "./AppSidebarLifecycleEffects";
import { useAppSidebarSelectionModel } from "./AppSidebarSelectionModel";
import { createAppSpeechProviderActionsForRuntimeState } from "./AppSpeechProviderActions";
import { createAppSttComposerActions } from "./AppSttComposerActions";
import { createAppSttMicrophoneActionsForRuntimeState } from "./AppSttMicrophoneActions";
import { createAppSubagentParentClusterActions } from "./AppSubagentParentClusterActions";
import { useAppSubagentShellControls } from "./AppSubagentShellControls";
import {
  createAppSymphonyBuilderControls,
} from "./AppSymphonyBuilderControls";
import { createAppThreadMaintenanceActions } from "./AppThreadMaintenanceActions";
import {
  AppShellLayout,
  createAppShellLayoutProps,
} from "./AppShellLayout";
import { createAppUpdateActions } from "./AppUpdateActions";
import { useAppVoiceThreadControls } from "./AppVoiceThreadControls";
import { createAppWorkflowRecordingActions } from "./AppWorkflowRecordingActions";
import { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";
import { createAppWorkflowRecordingPlaybookActions } from "./AppWorkflowRecordingPlaybookActions";
import { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import { createAppWorkspaceNavigationControls } from "./AppWorkspaceNavigationControls";
import { useAppWorkspaceShellState } from "./AppWorkspaceShellState";
import { workflowRecorderSurface } from "./AutomationsWorkspace";
import "./styles.css";

export function App() {
  const [state, setState] = useState<DesktopState | undefined>();
  const runActivityState = useAppRunActivityState();
  const {
    runStatus, setRunStatus, threadRunStatuses, setThreadRunStatuses, activity, setActivity,
    abortArmed, setAbortArmed, retryStatsByThread, setRetryStatsByThread,
    runActivityLinesByThread, setRunActivityLinesByThread, runActivityCounterRef,
    runActivityLastEventAtRef, runActivityHeartbeatIndexRef, runActivityLinesByThreadRef,
    runtimeActivityRenderStateRef, thinkingDeltaBuffersRef, previousRunningRef,
  } = runActivityState;
  const shellUiState = useAppShellUiState();
  const {
    sidebarOpen, setSidebarOpen, sidebarWidth, setSidebarWidth, sidebarArea, setSidebarArea,
    workflowRecorderReviewPanelWidth, setWorkflowRecorderReviewPanelWidth,
    setSearchRoutingHydrating, setSearchRoutingHydrationError,
    mediaPreviewModal, setMediaPreviewModal, commandPaletteOpen, setCommandPaletteOpen,
    commandPaletteQuery, setCommandPaletteQuery, error, setError, setScopedError, clearError,
    errorScope, setErrorScope, setErrorState, updatePopoverOpen, setUpdatePopoverOpen, updateBusy,
    setUpdateBusy,
  } = shellUiState;
  const rightPanelState = useAppRightPanelState();
  const {
    rightPanel,
    setRightPanel,
    setRightPanelWidth,
    togglePanel,
    openPanel,
    openMcpRuntimeSettings,
    openSearchWebSettings,
    openGitSummaryPanel,
    previewArtifact,
    previewLocalFile,
  } = rightPanelState;
  const workspaceShellState = useAppWorkspaceShellState();
  const {
    workspaceRevision, setWorkspaceRevision, gitStatus, setGitStatus, gitStatusError, setGitStatusError,
    activeGitReview, setActiveGitReview, activeGitReviewError, setActiveGitReviewError,
    gitConfirmation, setGitConfirmation, pluginCatalogRevision, setPluginCatalogRevision,
    welcomeAmbientPluginRegistry, setWelcomeAmbientPluginRegistry, browserRevision, setBrowserRevision,
    chatBrowserUserAction, setChatBrowserUserAction, chatBrowserUserActionBusy, setChatBrowserUserActionBusy,
    activeThreadIdRef, activeProjectRootRef, workspaceProjectAliasesRef, messageKindsRef,
    mcpContainerRuntimeStartupCheckRef,
  } = workspaceShellState;
  const securityPromptState = useAppSecurityPromptState();
  const {
    permissionRequests, setPermissionRequests, privilegedCredentialRequests, setPrivilegedCredentialRequests,
    secureInputRequests, setSecureInputRequests, permissionAuditRevision, setPermissionAuditRevision,
    permissionAudit, setPermissionAudit, permissionGrants, setPermissionGrants, setPermissionAuditError,
    setPermissionGrantError, permissionGrantRevoking,
    setPermissionGrantRevoking, apiDialogOpen, setApiDialogOpen, apiKeyDraft, setApiKeyDraft,
    clipboardCandidate, setClipboardCandidate, apiKeyStatus, setApiKeyStatus, apiKeyBusy, setApiKeyBusy,
    ambientCliSecretDialog, setAmbientCliSecretDialog, apiKeyInputRef, ambientCliSecretInputRef,
  } = securityPromptState;
  const providerRuntimeState = useAppProviderRuntimeState();
  const {
    voiceProviders, voiceProviderRefreshTimerRef,
    sttProviders, sttProviderRefreshTimerRef, sttProvidersRef,
    sttComposer, setSttComposer,
    sttDraftMetadata, setSttDraftMetadata, sttMicRecorderRef, sttComposerRecorderRef, sttComposerSilenceRef,
    sttComposerShortcutActiveRef, sttComposerOperationIdRef, sttComposerThreadRef,
    localDeepResearchSetup, setLocalDeepResearchSetup, localDeepResearchQ8Override, setLocalDeepResearchQ8Override,
    localDeepResearchFollowupOpen, setLocalDeepResearchFollowupOpen,
    setMcpContainerRuntimeInstallProgress, setMcpDefaultCapabilityInstallProgress,
  } = providerRuntimeState;
  const workflowRuntimeState = useAppWorkflowRuntimeState();
  const {
    orchestrationRevision, setOrchestrationRevision, orchestrationAutoRevision, setOrchestrationAutoRevision,
    workflowRevision, setWorkflowRevision, workflowCompileProgress, setWorkflowCompileProgress,
    workflowDiscoveryProgress, setWorkflowDiscoveryProgress, workflowExplorationProgressByThreadId,
    setWorkflowExplorationProgressByThreadId, chatExportBusy, setChatExportBusy, chatExportStatus,
    setChatExportStatus, contextRecoveryBusy, setContextRecoveryBusy, callableWorkflowTaskCancelBusy,
    setCallableWorkflowTaskCancelBusy, callableWorkflowTaskPauseBusy, setCallableWorkflowTaskPauseBusy,
    callableWorkflowTaskResumeBusy, setCallableWorkflowTaskResumeBusy, subagentChildCancelBusy,
    setSubagentChildCancelBusy, subagentChildCloseBusy, setSubagentChildCloseBusy, subagentBarrierActionBusy,
    setSubagentBarrierActionBusy, subagentBarrierDecisionDialog, setSubagentBarrierDecisionDialog,
    subagentApprovalActionBusy, setSubagentApprovalActionBusy, subagentApprovalDecisionDialog,
    setSubagentApprovalDecisionDialog, contextAttachments, setContextAttachments, contextError, setContextError,
    localDeepResearchModeArmed, setLocalDeepResearchModeArmedState, localDeepResearchBudgetOverride,
    setLocalDeepResearchBudgetOverride, symphonyBuilderDraft, setSymphonyBuilderDraft, symphonyBuilderActionBusy,
    setSymphonyBuilderActionBusy, goalModeArmed, setGoalModeArmed, goalMenuOpen, setGoalMenuOpen, goalBusy,
    setGoalBusy, goalCompletionCelebrationId, setGoalCompletionCelebrationId, latestDesktopStateRevisionRef,
    clearedGoalKeysRef, promptHistoryCursor, setPromptHistoryCursor, draftBeforePromptHistory,
    setDraftBeforePromptHistory, promptHistoryRef, localDeepResearchModeArmedRef, localDeepResearchRunBudgetRef,
    localRuntimeInventorySettingsRefreshKeyRef, pendingSubmittedPrompts, setPendingSubmittedPrompts,
    pendingProjectComposerDraft, setPendingProjectComposerDraft, pendingWorkflowRecordingEditContext,
    setPendingWorkflowRecordingEditContext, goalCompletionCelebrationTimerRef,
  } = workflowRuntimeState;
  const {
    projectPopover, setProjectPopover, projectContextMenu, setProjectContextMenu, projectActionDialog,
    setProjectActionDialog, projectBoardResetDialog, setProjectBoardResetDialog, plannerRevisionDialog,
    setPlannerRevisionDialog, projectBoardBusyProjectIds, setProjectBoardBusyProjectIds, projectBoardSourceBusy,
    setProjectBoardSourceBusy, projectBoardSourceImpactBusy, setProjectBoardSourceImpactBusy,
    projectBoardKickoffDefaultsBusy, setProjectBoardKickoffDefaultsBusy, projectBoardRefineBusy,
    setProjectBoardRefineBusy, projectBoardRefineMode, setProjectBoardRefineMode,
    projectBoardProposalAnswerBusy, setProjectBoardProposalAnswerBusy, projectBoardProposalCardReviewBusy,
    setProjectBoardProposalCardReviewBusy, projectBoardProposalApplyBusy, setProjectBoardProposalApplyBusy,
    projectBoardFinalizeBusy, setProjectBoardFinalizeBusy, projectBoardSynthesisRetryBusy,
    setProjectBoardSynthesisRetryBusy, projectBoardSynthesisDeferBusy, setProjectBoardSynthesisDeferBusy,
    projectBoardSynthesisPauseBusy, setProjectBoardSynthesisPauseBusy, projectBoardRevisionBusy,
    setProjectBoardRevisionBusy, threadContextMenu, setThreadContextMenu, threadActionDialog, setThreadActionDialog,
    projectsCollapsed,
    setProjectsCollapsed,
  } = useAppProjectShellState();
  const automationShellState = useAppAutomationShellState();
  const {
    automationPopover, setAutomationPopover, automationsCollapsed, setAutomationsCollapsed,
    automationFolders, setAutomationFolders, setAutomationNavigationError, selectedAutomationPane,
    setSelectedAutomationPane, selectedAutomationFolderId, setSelectedAutomationFolderId,
    selectedAutomationThreadId, setSelectedAutomationThreadId, workflowAgentFolders, setWorkflowAgentFolders,
    workflowAgentNavigationError, setWorkflowAgentNavigationError, selectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentFolderId, selectedWorkflowAgentThreadId, setSelectedWorkflowAgentThreadId,
    sidebarOrganize, setSidebarOrganize, updateSidebarOrganize, sidebarAgeNow, setSidebarAgeNow,
  } = automationShellState;
  const composerShellState = useAppComposerShellState();
  const {
    composerInputRef,
    selectedSlashCommandRef,
    getComposerDraft,
    setComposerDraft,
    setSelectedSlashCommand,
    updateComposerDraftValue,
    focusComposerEnd,
  } = composerShellState;
  const { rememberClearedGoal, rememberCommittedDesktopState, rememberDesktopState } =
    createAppDesktopStateMemoryControls({
      activeProjectRootRef,
      activeThreadIdRef,
      clearedGoalKeysRef,
      latestDesktopStateRevisionRef,
      workspaceProjectAliasesRef,
    });
  const { applyRunStatusDesktopState, applyCreatedThreadState, applyProjectActionState, applyAutomationDesktopState } =
    createAppDesktopStateAppliers({
      activeWorkspacePath: state?.activeWorkspace.path,
      closeProjectBoard,
      rememberDesktopState,
      setComposerDraft,
      setRunStatus,
      setSidebarArea,
      setState,
      setThreadRunStatuses,
      setWorkspaceRevision,
      threadRunStatuses,
    });
  const {
    workflowLibraryIncludeArchived,
    setWorkflowLibraryIncludeArchived,
    workflowRecordingLibrary,
    selectedWorkflowRecording,
    selectedWorkflowRecordingId,
    setSelectedWorkflowRecordingId,
    refreshWorkflowRecordingLibrary,
    refreshWorkflowRecordingLibraryOverride,
  } = useAppWorkflowRecordingLibraryControls({
    applyDesktopState: applyAutomationDesktopState,
    setError,
    state,
  });
  const {
    archiveProjectChats,
    archiveThread,
    confirmProjectActionDialog,
    confirmThreadActionDialog,
    copyThreadDeeplink,
    copyThreadSessionId,
    copyThreadWorkingDirectory,
    createPermanentProjectWorktree,
    forkThread,
    markThreadUnread,
    openProjectContextMenu,
    openThreadContextMenu,
    openThreadMiniWindow,
    projectIdForWorkspacePath,
    removeProject,
    renameProject,
    renameThread,
    revealProject,
    revealThread,
    threadActionInput,
    toggleProjectPinned,
    toggleThreadPinned,
  } = createAppProjectThreadActions({
    applyProjectActionState,
    projectActionDialog,
    projects: state?.projects,
    setError,
    setProjectActionDialog,
    setProjectContextMenu,
    setProjectPopover,
    setThreadActionDialog,
    setThreadContextMenu,
    threadActionDialog,
    threadContextMenu,
  });
  const { createWorkflowAgentFolder, loadAutomationFolders, loadWorkflowAgentFolders, moveAutomationThread } =
    createAppAutomationFolderControls({
      selectedAutomationFolderId,
      selectedAutomationThreadId,
      selectedWorkflowAgentFolderId,
      selectedWorkflowAgentThreadId,
      setAutomationFolders,
      setAutomationNavigationError,
      setAutomationPopover,
      setSelectedAutomationFolderId,
      setSelectedAutomationThreadId,
      setSelectedWorkflowAgentFolderId,
      setSelectedWorkflowAgentThreadId,
      setWorkflowAgentFolders,
      setWorkflowAgentNavigationError,
    });
  const { openNewWorkflowComposer } = createAppWorkflowComposerNavigation({
    loadWorkflowAgentFolders,
    setAutomationPopover,
    setProjectPopover,
    setRightPanel,
    setSelectedAutomationPane,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
  });
  const { createThread, createThreadInProject, createWorkspace, openWorkspace, runPrimaryCreateAction, selectProject, selectThread } =
    createAppWorkspaceNavigationControls({
      activeWorkspacePath: state?.activeWorkspace.path,
      applyCreatedThreadState,
      closeProjectBoard,
      currentWorkspacePath: state?.workspace.path,
      openNewWorkflowComposer,
      projectIdForWorkspacePath,
      rememberDesktopState,
      scheduleComposerFocusEnd: () => {
        window.setTimeout(() => composerInputRef.current?.focusEnd(), 0);
      },
      setComposerDraft,
      setProjectPopover,
      setProjectsCollapsed,
      setRunStatus,
      setSidebarArea,
      setState,
      setThreadRunStatuses,
      setWorkspaceRevision,
      sidebarArea,
      threadRunStatuses,
    });
  const { openSidebarArea, openWorkflowRecordingsArea, openWorkflowLabArea } = createAppSidebarAreaControls({
    sidebarArea,
    setSidebarArea,
    setProjectPopover,
    setAutomationPopover,
    setSidebarOrganize,
    setRightPanel,
    setSelectedAutomationPane,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    loadAutomationFolders,
  });
  const {
    selectWorkflowAgentFolder,
    selectWorkflowAgentThread,
    selectWorkflowRecordingForSidebar,
    selectWorkflowRecordingForLab,
    selectAutomationPane,
    selectAutomationThread,
    openAutomationRunThread,
  } = createAppAutomationSelectionControls({
    setSidebarArea,
    setSelectedAutomationPane,
    setSelectedAutomationFolderId,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    selectThread,
  });
  const {
    clearSavedApiKey,
    openAmbientCliSecretDialog,
    openAmbientKeys,
    openApiKeyDialog,
    pasteAmbientCliSecret,
    pasteApiKey,
    saveAmbientCliSecret,
    saveApiKey,
    testApiKey,
    updateAmbientCliSecretDialog,
  } = createAppCredentialDialogActions({
    ambientCliSecretDialog,
    apiKeyDraft,
    focusAmbientCliSecretInput: (delayMs) => {
      window.setTimeout(() => ambientCliSecretInputRef.current?.focus(), delayMs);
    },
    focusApiKeyInput: (delayMs) => {
      window.setTimeout(() => apiKeyInputRef.current?.focus(), delayMs);
    },
    provider: state?.provider,
    setAmbientCliSecretDialog,
    setApiDialogOpen,
    setApiKeyBusy,
    setApiKeyDraft,
    setApiKeyStatus,
    setClipboardCandidate,
    setState,
  });
  const running = isRunStatusRunning(runStatus);
  const activeRunActivityLines = state?.activeThreadId
    ? (runActivityLinesByThread[state.activeThreadId] ?? EMPTY_RUN_ACTIVITY_LINES)
    : EMPTY_RUN_ACTIVITY_LINES;
  const thinkingDisplayMode = state?.settings.thinkingDisplay.mode ?? "transient";
  const { navigatePromptHistory, resetPromptHistory, shouldNavigatePromptHistory } = createAppPromptHistoryControls({
    clearSttDraftMetadata: () => setSttDraftMetadata(undefined),
    draftBeforePromptHistory,
    getComposerDraft,
    getPromptHistory: () => promptHistoryRef.current,
    promptHistoryCursor,
    setComposerDraft,
    setDraftBeforePromptHistory,
    setPromptHistoryCursor,
  });
  const voiceThreadControls = useAppVoiceThreadControls({
    activeThreadId: state?.activeThreadId,
    messages: state?.messages,
    messageVoiceStates: state?.messageVoiceStates,
    settings: state?.settings.voice,
    voiceProviders,
  });
  const {
    voiceProviderLabels,
    latestReadyVoiceAutoplay,
    autoplayVoiceKey,
    activeVoiceMessageId,
    setActiveVoiceMessageId,
    activeThreadVoiceStatus,
    activeThreadVoiceStatusDismissKey,
    activeThreadVoiceStatusVisible,
    dismissActiveThreadVoiceStatus,
  } = voiceThreadControls;
  const {
    chatFindOpen,
    setChatFindOpen,
    chatFindInputRef,
    chatFindQuery,
    chatFindCount,
    chatFindIndex,
    setChatFindQuery,
    onChatFindPrevious,
    onChatFindNext,
    onChatFindClose,
  } = useAppChatFindControls({
    activeThreadId: state?.activeThreadId,
    messages: state?.messages,
    running,
    thinkingDisplayMode,
  });
  const composerModelPickerControls = useAppComposerModelPickerControls({
    activeThreadId: state?.activeThreadId,
    catalogOptions: state?.settings.modelCatalog?.selectableMainModelOptions,
    selectedModelId: state?.settings.model,
  });

  const {
    loadSttProviders,
    loadVoiceProviders,
    refreshVoiceCatalog,
    scheduleSttProviderRefresh,
    scheduleVoiceProviderRefresh,
    setupSttProvider,
  } = createAppSpeechProviderActionsForRuntimeState({
    providerRuntimeState,
    state,
    setState,
  });

  const { cancelSttMicTest, loadSttMicrophoneDeviceList, startSttMicTest, stopSttMicTestAndValidate } =
    createAppSttMicrophoneActionsForRuntimeState({
      providerRuntimeState,
      setupSttProvider,
      state,
    });

  const {
    loadLocalDeepResearchRunHistory,
    openLocalDeepResearchFollowupIfSetupNeeded,
    setupLocalDeepResearchFromSettings,
    setupMiniCpmVisionProviderFromSettings,
  } = createAppLocalRuntimeActionsForRuntimeState(providerRuntimeState);

  useAppLocalDeepResearchLifecycle({
    localDeepResearchSetup,
    localRuntimeInventorySettingsRefreshKeyRef,
    panel: rightPanel,
    setLocalDeepResearchSetup,
    setupLocalDeepResearchFromSettings,
    workspacePath: state?.workspace.path,
  });

  function appendSttRunActivityLine(line: string) {
    appendRunActivityLine(line);
  }

  function resetSttRunActivityLines(line: string) {
    resetRunActivityLines(line);
  }

  const {
    cancelSttComposerRecording,
    discardSttComposerResult,
    retrySttComposerTranscription,
    startSttComposerRecording,
    stopSttComposerRecording,
  } = createAppSttComposerActions({
    activeVoiceMessageId,
    appendRunActivityLine: appendSttRunActivityLine,
    getComposerDraft,
    resetPromptHistory,
    resetRunActivityLines: resetSttRunActivityLines,
    running,
    setActiveVoiceMessageId,
    setComposerDraft,
    setContextError,
    setError,
    setRunStatus,
    setSttComposer,
    setSttDraftMetadata,
    setThreadRunStatuses,
    state,
    sttComposer,
    sttComposerOperationIdRef,
    sttComposerRecorderRef,
    sttComposerShortcutActiveRef,
    sttComposerSilenceRef,
    sttComposerThreadRef,
    sttProvidersRef,
  });

  const {
    loadPendingPermissionRequests,
    loadPermissionAudit,
    loadPermissionGrants,
    requestThreadPermissionModeChange,
    respondPermissionRequest,
    respondPrivilegedCredentialRequest,
    respondSecureInputRequest,
    revokePermissionGrant,
    revokePermissionGrantIds,
  } = createAppPermissionActions({
    permissionAudit,
    permissionGrants,
    setPermissionAudit,
    setPermissionAuditError,
    setPermissionGrantError,
    setPermissionGrantRevoking,
    setPermissionGrants,
    setPermissionRequests,
    setPrivilegedCredentialRequests,
    setSecureInputRequests,
    setState,
    state,
  });

  const localDeepResearchReady = localDeepResearchSetup.result?.setupStatus === "ready";
  const { setLocalDeepResearchModeArmed, toggleLocalDeepResearchMode } = createAppLocalDeepResearchModeControls({
    focusComposerEnd,
    localDeepResearchModeArmedRef,
    localDeepResearchReady,
    setContextError,
    setGoalModeArmed,
    setLocalDeepResearchBudgetOverride,
    setLocalDeepResearchModeArmedState,
    setSymphonyBuilderDraft,
    state,
  });

  const {
    activeWelcomeOnboardingPageKind,
    appendRunActivityLine,
    appendThinkingDeltaLine,
    handleMessagesScroll,
    jumpToLatestMessage,
    requestMessageTail,
    resetRunActivityLines,
    scrollRef,
    showScrollToBottom,
  } = useAppCoreLifecycleControls({
    activeProjectRootRef,
    activeRunActivityLines,
    activeThreadIdRef,
    browserRevision,
    cancelSttComposerRecording,
    chatBrowserUserAction,
    chatBrowserUserActionId: chatBrowserUserAction?.id,
    chatBrowserUserActionStatus: chatBrowserUserAction?.status,
    chatFindInputRef,
    closeContextMenus: () => {
      setProjectContextMenu(undefined);
      setThreadContextMenu(undefined);
    },
    contextMenusOpen: Boolean(projectContextMenu || threadContextMenu),
    errorScope,
    goalCompletionCelebrationTimerRef,
    handleEvent,
    loadPendingPermissionRequests,
    loadPermissionAudit,
    loadPermissionGrants,
    loadSttMicrophoneDeviceList,
    loadSttProviders,
    loadVoiceProviders,
    mcpContainerRuntimeStartupCheckRef,
    messageKindsRef,
    openMcpRuntimeSettings,
    permissionAuditRevision,
    pluginCatalogRevision,
    previousRunningRef,
    rememberDesktopState,
    resetPromptHistory,
    runActivityCounterRef,
    runActivityHeartbeatIndexRef,
    runActivityLastEventAtRef,
    runActivityLinesByThreadRef,
    running,
    scheduleVoiceProviderRefresh,
    setAbortArmed,
    setActiveGitReview,
    setActiveGitReviewError,
    setAutomationFolders,
    setChatBrowserUserAction,
    setChatFindOpen,
    setCommandPaletteOpen,
    setCommandPaletteQuery,
    setContextAttachments,
    setContextError,
    setError,
    setErrorScope,
    setErrorState,
    setGitStatus,
    setGitStatusError,
    setGoalMenuOpen,
    setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setRetryStatsByThread,
    setRightPanel,
    setRunActivityLinesByThread,
    setRunStatus,
    setSidebarAgeNow,
    setSidebarWidth,
    setState,
    setThreadRunStatuses,
    setWelcomeAmbientPluginRegistry,
    setWorkflowAgentFolders,
    startSttComposerRecording,
    state,
    stopSttComposerRecording,
    sttComposerRecorderRef,
    sttComposerShortcutActiveRef,
    sttComposerStatus: sttComposer.status,
    sttComposerThreadRef,
    sttMicRecorderRef,
    sttProviderRefreshTimerRef,
    thinkingDeltaBuffersRef,
    threadRunStatuses,
    voiceProviderRefreshTimerRef,
    workspaceProjectAliasesRef,
    workspaceRevision,
  });

  function triggerGoalCompletionCelebration(messageId: string) {
    if (goalCompletionCelebrationTimerRef.current) window.clearTimeout(goalCompletionCelebrationTimerRef.current);
    setGoalCompletionCelebrationId(messageId);
    goalCompletionCelebrationTimerRef.current = window.setTimeout(() => {
      setGoalCompletionCelebrationId((current) => (current === messageId ? undefined : current));
      goalCompletionCelebrationTimerRef.current = undefined;
    }, GOAL_COMPLETION_CELEBRATION_MS);
  }

  const desktopEventGuards = createAppDesktopEventGuards({ activeProjectRootRef, workspaceProjectAliasesRef });
  const { promptRequestMatchesActiveProject } = desktopEventGuards;

  function handleEvent(event: DesktopEvent) {
    handleAppDesktopEvent(
      event,
      createAppDesktopEventHandlerDependencies({
        automationShellState,
        appendRunActivityLine,
        appendThinkingDeltaLine,
        desktopEventGuards,
        handleMenuCommand,
        openAmbientCliSecretDialog,
        openApiKeyDialog,
        providerRuntimeState,
        rememberClearedGoal,
        rememberCommittedDesktopState,
        rightPanelState,
        runActivityState,
        scheduleSttProviderRefresh,
        scheduleVoiceProviderRefresh,
        securityPromptState,
        setState,
        shellUiState,
        triggerGoalCompletionCelebration,
        voiceThreadControls,
        workflowRuntimeState,
        workspaceShellState,
      }),
    );
  }

  const {
    activeActivity,
    activeChatBrowserUserAction,
    activePermissionRequest,
    activePrivilegedCredentialRequest,
    activeSecureInputRequest,
    activeThread,
    isMac,
    localDeepResearchRunActive,
    localDeepResearchRunBudget,
    showTopbarThreadMemoryToggle,
  } = useAppActiveThreadModel({
    activity,
    chatBrowserUserAction,
    localDeepResearchBudgetOverride,
    localDeepResearchReady,
    permissionRequests,
    platform: navigator.platform,
    privilegedCredentialRequests,
    promptRequestMatchesActiveProject,
    secureInputRequests,
    sidebarArea,
    state,
    threadRunStatuses,
  });
  localDeepResearchRunBudgetRef.current = localDeepResearchRunBudget;
  const {
    activeSubagentChildHiddenByFeatureFlag,
    activeSubagentInspector,
    subagentParentClustersByMessageId,
    subagentUiEnabled,
    symphonyBuilderModel,
  } = useAppSubagentShellControls({
    activeThread,
    setSubagentApprovalActionBusy,
    setSubagentApprovalDecisionDialog,
    setSubagentBarrierActionBusy,
    setSubagentBarrierDecisionDialog,
    setSubagentChildCancelBusy,
    setSubagentChildCloseBusy,
    setSymphonyBuilderDraft,
    state,
    symphonyBuilderDraft,
  });

  const {
    cancelCallableWorkflowTask,
    cancelSubagentChild,
    closeSubagentChild,
    openCallableWorkflowThread,
    pauseCallableWorkflowTask,
    resolveSubagentApprovalAction,
    resolveSubagentBarrierAction,
    resumeCallableWorkflowTask,
    submitSubagentApprovalDecisionDialog,
    submitSubagentBarrierDecisionDialog,
  } = createAppSubagentParentClusterActions({
    clearAutomationPopover: () => setAutomationPopover(undefined),
    clearProjectPopover: () => setProjectPopover(undefined),
    setCallableWorkflowTaskCancelBusy,
    setCallableWorkflowTaskPauseBusy,
    setCallableWorkflowTaskResumeBusy,
    setError,
    setSelectedAutomationPane,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
    setState,
    setSubagentApprovalActionBusy,
    setSubagentApprovalDecisionDialog,
    setSubagentBarrierActionBusy,
    setSubagentBarrierDecisionDialog,
    setSubagentChildCancelBusy,
    setSubagentChildCloseBusy,
    setWorkflowAgentFolders,
    setWorkflowAgentNavigationError,
    subagentApprovalDecisionDialog,
    subagentBarrierDecisionDialog,
  });

  const {
    conversationReviewPanelDocked,
    runStatusCardVisible,
    workflowRecorderEmptyChatState,
    workflowRecordingReviewFeedbackActive,
    workflowRecordingReviewPanelOpen,
    setWorkflowRecordingReviewPanelOpen,
    workflowRecordingReviewRunning,
  } = useAppWorkflowRecordingReviewControls({
    activeThread,
    running,
    thinkingDisplay: state?.settings.thinkingDisplay,
    workflowRecorderSurface,
  });
  const {
    activeProject,
    activeProjectBoardBusy,
    activeProjectBoardTopbarAction,
    activeThreadSuppressesProjectBoard,
    activeWorkspaceIsPreparedLocalTask,
    errorNeedsSessionRecovery,
    latestDurablePlannerPlanArtifact,
    projectBoardActions,
    projectBoardOpen,
    setProjectBoardOpen,
    setProjectBoardPlanBusy,
    projectBoardPlanPickerOpen,
    setProjectBoardPlanPickerOpen,
    projectBoardThreadPlanAction,
    readyPlannerPlanArtifacts,
    runProjectBoardThreadPlanAction,
    sessionContextMissing,
  } = useAppProjectBoardControls({
    activeThread,
    activeThreadId: state?.activeThreadId,
    activeWorkspacePath: state?.activeWorkspace.path,
    applyCreatedThreadState,
    applyProjectActionState,
    contextUsage: state?.contextUsage,
    error,
    plannerPlanArtifacts: state?.plannerPlanArtifacts,
    previewArtifact,
    projects: state?.projects,
    projectBoardBusyProjectIds,
    projectBoardKickoffDefaultsBusy,
    projectBoardResetDialog,
    selectProject,
    selectThread,
    setError,
    setProjectBoardBusyProjectIds,
    setProjectBoardFinalizeBusy,
    setProjectBoardKickoffDefaultsBusy,
    setProjectBoardProposalAnswerBusy,
    setProjectBoardProposalApplyBusy,
    setProjectBoardProposalCardReviewBusy,
    setProjectBoardRefineBusy,
    setProjectBoardRefineMode,
    setProjectBoardResetDialog,
    setProjectBoardRevisionBusy,
    setProjectBoardSourceBusy,
    setProjectBoardSourceImpactBusy,
    setProjectBoardSynthesisDeferBusy,
    setProjectBoardSynthesisPauseBusy,
    setProjectBoardSynthesisRetryBusy,
    setSidebarArea,
    setState,
    state,
    workspaceName: state?.workspace.name,
    workspacePath: state?.workspace.path,
  });
  function closeProjectBoard() {
    setProjectBoardOpen(false);
  }
  useAppLocalDeepResearchReadinessLifecycleEffect({
    localDeepResearchReady,
    setLocalDeepResearchModeArmed,
  });
  const {
    artifactPathHints,
    latestRecoveryPrompt,
    plannerArtifactByMessageId,
    promptHistory,
    retryableMessageIds,
    streamingAssistantId,
    transientThinkingActivityLines,
    visibleChatMessages,
    visibleRunActivityLines,
  } = useAppConversationDisplayModel({
    activeThreadId: state?.activeThreadId,
    activeRunActivityLines,
    activeWorkspacePath: state?.activeWorkspace.path,
    messages: state?.messages,
    pendingSubmittedPrompts,
    plannerPlanArtifacts: state?.plannerPlanArtifacts,
    running,
    thinkingDisplayMode,
    workspacePath: state?.workspace.path,
  });
  promptHistoryRef.current = promptHistory;

  useAppPendingSubmittedPromptCleanup({
    running,
    setPendingSubmittedPrompts,
    state,
  });

  const {
    selectedAutomationFolder,
    selectedAutomationThread,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    sidebarProjects,
    sidebarThreads,
  } = useAppSidebarSelectionModel({
    activeThreadId: state?.activeThreadId,
    activeWorkspacePath: state?.workspace.path,
    automationFolders,
    projects: state?.projects ?? [],
    selectedAutomationFolderId,
    selectedAutomationThreadId,
    selectedWorkflowAgentFolderId,
    selectedWorkflowAgentThreadId,
    sidebarOrganize,
    subagentUiEnabled,
    workflowAgentFolders,
  });
  useAppSidebarLifecycleEffects({
    activeThreadId: activeThread?.id,
    activeThreadKind: activeThread?.kind,
    activeThreadParentThreadId: activeThread?.parentThreadId,
    activeThreadWorkspacePath: activeThread?.workspacePath,
    loadAutomationFolders,
    loadWorkflowAgentFolders,
    orchestrationAutoRevision,
    orchestrationRevision,
    pendingProjectComposerDraft,
    selectThread,
    setComposerDraft,
    setError,
    setPendingProjectComposerDraft,
    sidebarArea,
    subagentUiEnabled,
    workflowRevision,
    workspacePath: state?.workspace.path,
  });

  const {
    applyLatestWorkflowRecordingSummary,
    archiveWorkflowRecordingPlaybook,
    confirmActiveWorkflowRecordingReview,
    retryWorkflowRecordingReview,
    restoreWorkflowRecordingVersion,
    sendWorkflowRecordingReviewPrompt,
    setWorkflowRecordingEnabled,
    startWorkflowRecording,
    stopActiveWorkflowRecording,
    unarchiveWorkflowRecordingPlaybook,
    updateActiveWorkflowRecordingReview,
  } = createAppWorkflowRecordingActions({
    abortArmed,
    activeThread,
    applyCreatedThreadState,
    applyRunStatusDesktopState,
    closeProjectBoard,
    refreshWorkflowRecordingLibraryOverride,
    resetPromptHistory,
    resetRunActivityLines,
    running,
    scheduleComposerDraftFocus: (draft) => {
      window.setTimeout(() => {
        setComposerDraft(draft);
        composerInputRef.current?.focusEnd();
      }, 0);
    },
    setContextAttachments,
    setContextError,
    setError,
    setRunStatus,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
    setThreadRunStatuses,
    state,
    workflowLibraryIncludeArchived,
  });

  const { editWorkflowRecordingPlaybookInChat } = createAppWorkflowRecordingPlaybookActions({
    closeProjectBoard,
    previewLocalFile,
    setAutomationPopover,
    setBrowserRevision,
    setError,
    setPendingProjectComposerDraft,
    setPendingWorkflowRecordingEditContext,
    setProjectPopover,
    setRightPanel,
    setSelectedAutomationThreadId,
    setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId,
    setSidebarArea,
  });

  const { runUpdateAction } = createAppUpdateActions({
    setError,
    setState,
    setUpdateBusy,
    setUpdatePopoverOpen,
  });

  const {
    clearAgentMemory,
    hydrateSearchRoutingSettingsForSettingsPanel,
    installModelProviderEndpoint,
    runLocalModelRuntimeLifecycleAction,
    saveModelProviderCredential,
    updateFeatureFlagSettings,
    updateLocalDeepResearchSettings,
    updateMediaPlaybackSettings,
    updateMemorySettings,
    updateModelRuntimeSettings,
    updatePlannerSettings,
    updateSearchRoutingSettings,
    updateSttSettings,
    updateThinkingDisplaySettings,
    updateVoiceSettings,
  } = createAppSettingsActions({
    setLocalDeepResearchSetup,
    setSearchRoutingHydrationError,
    setSearchRoutingHydrating,
    setState,
    state,
  });

  const { refreshAgentMemoryDiagnostics, runAgentMemoryEmbeddingLifecycleAction } = useAppAgentMemoryPanelControls({
    activeThreadMemoryEnabled: Boolean(activeThread?.memoryEnabled),
    panel: rightPanel,
    providerRuntimeState,
    state,
  });

  const { clearMessageVoiceArtifact, regenerateMessageVoice, revealMessageVoiceArtifact } = createAppMessageVoiceActions({
    scheduleVoiceProviderRefresh,
    setError,
    setState,
  });

  const {
    cancelBrowserUserActionFromChat,
    continueAfterBrowserUserActionIfReady,
    openBrowserForUserAction,
    openExternalUrl,
    openUrlInAmbientBrowser,
    resumeBrowserUserActionFromChat,
  } = createAppBrowserActionControls({
    appendRunActivityLine,
    chatBrowserUserAction,
    resetRunActivityLines,
    running,
    setBrowserRevision,
    setChatBrowserUserAction,
    setChatBrowserUserActionBusy,
    setError,
    setRightPanel,
    setRunStatus,
    setThreadRunStatuses,
    state,
  });

  const { retryFailedPrompt } = createAppComposerRetryActions({
    resetPromptHistory,
    resetRunActivityLines,
    running,
    setContextAttachments,
    setContextError,
    setError,
    setRunStatus,
    setThreadRunStatuses,
    state,
  });

  const {
    compactActiveThread,
    duplicateActiveThreadFromTranscript,
    exportActiveChat,
    exportChatPdfThread,
    exportDiagnostics,
    importDiagnostics,
    recoverActiveThreadContext,
    recoverActiveThreadContextAndRetryLatest,
  } = createAppThreadMaintenanceActions({
    applyProjectActionState,
    chatExportBusy,
    contextRecoveryBusy,
    latestRecoveryPrompt,
    projectIdForWorkspacePath,
    resetRunActivityLines,
    retryFailedPrompt,
    running,
    setChatExportBusy,
    setChatExportStatus,
    setContextRecoveryBusy,
    setError,
    setRunStatus,
    setState,
    setThreadRunStatuses,
    state,
  });

  const {
    beginRightPanelResize,
    beginSidebarResize,
    beginWorkflowRecorderReviewResize,
    commandItems,
    handleMenuCommand,
    openMediaPreviewModal,
    runPaletteCommand,
    updateThemePreference,
    updateThreadSettings,
  } = createAppShellCommandActions({
    compactActiveThread,
    contextUsage: state?.contextUsage,
    createThread,
    exportActiveChat,
    exportDiagnostics,
    openApiKeyDialog,
    openMcpRuntimeSettings,
    openPanel,
    openWorkflowLabArea,
    openWorkflowRecordingsArea,
    openWorkspace,
    recoverActiveThreadContext,
    rightPanel,
    setCommandPaletteOpen,
    setCommandPaletteQuery,
    setError,
    setMediaPreviewModal,
    setRightPanelWidth,
    setSidebarOpen,
    setSidebarWidth,
    setState,
    setWorkflowRecorderReviewPanelWidth,
    sidebarOpen,
    state,
    togglePanel,
    workflowRecorderNavLabel: workflowRecorderSurface.navLabel,
  });

  const { attachExistingWorktreeFromFooter, createBranchFromFooter, createThreadWorktreeFromFooter, switchBranch } = createAppGitActions({
    activeWorkspacePath: state?.activeWorkspace.path,
    gitStatus,
    setActiveGitReview,
    setActiveGitReviewError,
    setGitConfirmation,
    setGitStatus,
    setGitStatusError,
    setWorkspaceRevision,
    workspacePath: state?.workspace.path,
  });

  const { addContextAttachments, attachComposerFiles, clearContextAttachments, removeContextAttachment } =
    createAppContextAttachmentActions({
      allowExternalContext: state?.settings.permissionMode === "full-access",
      openAttachmentsPanel: () => openPanel("attachments"),
      setContextAttachments,
      setContextError,
    });

  const { clearActiveGoal, editActiveGoalObjective, pauseOrResumeActiveGoal, setActiveGoalBudget, toggleGoalMode } = createAppGoalActions({
    goalModeArmed,
    onGoalCleared: rememberClearedGoal,
    setError,
    setGoalBusy,
    setGoalMenuOpen,
    setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setSymphonyBuilderOpen: (open) => {
      setSymphonyBuilderDraft((current) => (current.open === open ? current : { ...current, open }));
    },
    setState,
    state,
  });

  const { registerPendingSubmittedPrompt, removePendingSubmittedPrompt } = createAppPendingSubmittedPromptControls({
    state,
    setPendingSubmittedPrompts,
  });

  const { submitComposerDraft, submitDraft } = createAppComposerSubmitActions({
    activeThreadWorkflowRecordingStopped: activeThread?.workflowRecording?.status === "stopped",
    appendRunActivityLine,
    compactActiveThread,
    contextAttachments,
    getComposerDraft,
    getSlashCommandSelection: () => selectedSlashCommandRef.current,
    goalModeArmed,
    localDeepResearchRunActive,
    localDeepResearchModeArmedRef,
    localDeepResearchRunBudgetRef,
    openAmbientCliSecretDialog,
    registerPendingSubmittedPrompt,
    pendingWorkflowRecordingEditContext,
    resetPromptHistory,
    removePendingSubmittedPrompt,
    resetRunActivityLines,
    running,
    setComposerDraft,
    setContextAttachments,
    setContextError,
    setError,
    setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setPendingWorkflowRecordingEditContext,
    setRunStatus,
    setSlashCommandSelection: setSelectedSlashCommand,
    setSttDraftMetadata,
    setThreadRunStatuses,
    state,
    sttDraftMetadata,
    updateThreadSettings,
    workflowRecordingReviewFeedbackActive,
  });

  const {
    sendRemoteSurfaceActivationPrompt,
    sendTelegramSessionSetupPrompt,
    startCapabilityBuilderPrompt,
    startWelcomeFirstRunCapabilityOnboarding,
    startWelcomeProviderCatalogCardOnboarding,
    startWelcomeRemoteSurfaceActivation,
  } = createAppCapabilityPromptActions({
    applyCreatedThreadState,
    resetPromptHistory,
    resetRunActivityLines,
    running,
    setContextAttachments,
    setContextError,
    setError,
    setRunStatus,
    setThreadRunStatuses,
    state,
  });

  const {
    answerPlannerDecisionQuestion,
    finalizePlannerPlan,
    implementPlannerPlan,
    openPlannerRevisionDialog,
    sendPlannerDurableRevision,
    submitPlannerRevisionDialog,
  } = createAppPlannerActions({
    getComposerDraft,
    plannerRevisionDialog,
    resetRunActivityLines,
    running,
    setComposerDraft,
    setContextError,
    setError,
    setPlannerRevisionDialog,
    setRunStatus,
    setState,
    setThreadRunStatuses,
    state,
    updateThreadSettings,
  });

  const symphonyBuilderControls = createAppSymphonyBuilderControls({
    appendRunActivityLine,
    focusComposerEnd: () => composerInputRef.current?.focusEnd(),
    getComposerDraft,
    rememberDesktopState,
    refreshWorkflowRecordingLibraryOverride,
    setContextError,
    setError,
    setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setState,
    setSymphonyBuilderActionBusy,
    setSymphonyBuilderDraft,
    state,
    submitDraft,
    subagentUiEnabled,
    symphonyBuilderActionBusy,
    symphonyBuilderDraft,
    symphonyBuilderModel,
  });
  const { submitSymphonyBuilderAction, submitSymphonyComposerPrompt } = symphonyBuilderControls;

  const composerInteractionControls = createAppComposerInteractionControls({
    focusComposerEnd,
    getComposerDraft,
    goalModeArmed,
    localDeepResearchModeArmedRef,
    navigatePromptHistory,
    pendingWorkflowRecordingEditContext,
    resetPromptHistory,
    running,
    selectedSlashCommandRef,
    setComposerDraft,
    setContextError,
    setLocalDeepResearchModeArmed,
    setPendingWorkflowRecordingEditContext,
    setSelectedSlashCommand,
    setSttDraftMetadata,
    shouldNavigatePromptHistory,
    state,
    sttDraftMetadata,
    subagentUiEnabled,
    submitComposerDraft,
    submitSymphonyComposerPrompt,
    symphonyBuilderOpen: symphonyBuilderDraft.open,
    updateComposerDraftValue,
    workflowRecordingReviewFeedbackActive,
  });

  if (!state || !activeThread || activeSubagentChildHiddenByFeatureFlag) {
    return <div className="boot">Ambient</div>;
  }

  const composerShellProps = createAppComposerShellProps({
    state,
    sttComposer,
    attachComposerFiles,
    attachExistingWorktreeFromFooter,
    clearActiveGoal,
    compactActiveThread,
    duplicateActiveThreadFromTranscript,
    editActiveGoalObjective,
    exportActiveChat,
    getComposerDraft,
    latestDurablePlannerPlanArtifact,
    openGitSummaryPanel,
    openPlannerRevisionDialog,
    pauseOrResumeActiveGoal,
    previewArtifact,
    projectBoardActions,
    recoverActiveThreadContext,
    recoverActiveThreadContextAndRetryLatest,
    requestThreadPermissionModeChange,
    retrySttComposerTranscription,
    runProjectBoardThreadPlanAction,
    sendPlannerDurableRevision,
    setActiveGoalBudget,
    setChatExportStatus,
    setGoalMenuOpen,
    setLocalDeepResearchBudgetOverride,
    startSttComposerRecording,
    stopSttComposerRecording,
    sttProviders,
    submitSymphonyBuilderAction,
    switchBranch,
    toggleGoalMode,
    updateThinkingDisplaySettings,
    updateThreadSettings,
  });
  const composerProps = createAppComposerProps({
    state,
    composerShellState,
    composerShellProps,
    composerInteractionControls,
    composerModelPickerControls,
    symphonyBuilderControls,
    workflowRuntimeState,
    workspaceShellState,
    providerRuntimeState,
    running,
    abortArmed,
    workflowRecordingReviewFeedbackActive,
    symphonyBuilderModel,
    sessionContextMissing,
    canRetryContextRecovery: Boolean(latestRecoveryPrompt),
    localDeepResearchReady,
    localDeepResearchRunActive,
    localDeepResearchRunBudget,
    activeThreadSuppressesProjectBoard,
    projectBoardThreadPlanAction,
    projectBoardPlanPickerOpen,
    readyPlannerPlanArtifacts,
    onRemoveContextAttachment: removeContextAttachment,
    onClearContextAttachments: clearContextAttachments,
    onCancelSttComposerRecording: cancelSttComposerRecording,
    onDiscardSttComposerResult: discardSttComposerResult,
    onToggleLocalDeepResearchMode: toggleLocalDeepResearchMode,
    onCreateThreadWorktree: createThreadWorktreeFromFooter,
    onCreateBranch: createBranchFromFooter,
  });
  const modalHostProps = createAppModalHostProps({
    activePermissionRequest,
    activePrivilegedCredentialRequest,
    activeSecureInputRequest,
    ambientCliSecretDialog,
    ambientCliSecretInputRef,
    apiDialogOpen,
    apiKeyBusy,
    apiKeyDraft,
    apiKeyInputRef,
    apiKeyStatus,
    clearSavedApiKey,
    clipboardCandidate,
    commandItems,
    commandPaletteOpen,
    commandPaletteQuery,
    confirmProjectActionDialog,
    confirmProjectBoardReset: projectBoardActions.confirmProjectBoardReset,
    confirmThreadActionDialog,
    gitConfirmation,
    localDeepResearchFollowupOpen,
    localDeepResearchQ8Override,
    localDeepResearchSetup,
    mediaPreviewModal,
    onApiKeyChange: setApiKeyDraft,
    onCommandPaletteQueryChange: setCommandPaletteQuery,
    onLocalDeepResearchQ8OverrideChange: setLocalDeepResearchQ8Override,
    openAmbientKeys,
    openSearchWebSettings,
    pasteAmbientCliSecret,
    pasteApiKey,
    plannerRevisionDialog,
    previewArtifact,
    projectActionDialog,
    projectBoardResetDialog,
    requestThreadPermissionModeChange,
    respondPermissionRequest,
    respondPrivilegedCredentialRequest,
    respondSecureInputRequest,
    runPaletteCommand,
    saveAmbientCliSecret,
    saveApiKey,
    setAmbientCliSecretDialog,
    setApiDialogOpen,
    setCommandPaletteOpen,
    setGitConfirmation,
    setLocalDeepResearchFollowupOpen,
    setMediaPreviewModal,
    setPlannerRevisionDialog,
    setProjectActionDialog,
    setProjectBoardResetDialog,
    setSubagentApprovalDecisionDialog,
    setSubagentBarrierDecisionDialog,
    setThreadActionDialog,
    setupLocalDeepResearchFromSettings,
    state,
    subagentApprovalDecisionDialog,
    subagentBarrierDecisionDialog,
    subagentUiEnabled,
    submitPlannerRevisionDialog,
    submitSubagentApprovalDecisionDialog,
    submitSubagentBarrierDecisionDialog,
    testApiKey,
    threadActionDialog,
    updateAmbientCliSecretDialog,
  });
  const automationsWorkspaceProps = createAppAutomationsWorkspaceProps({
    folders: automationFolders,
    onArchiveWorkflowRecordingPlaybook: archiveWorkflowRecordingPlaybook,
    onCreateProject: createWorkspace,
    onDesktopStateChanged: applyAutomationDesktopState,
    onEditWorkflowRecordingPlaybook: editWorkflowRecordingPlaybookInChat,
    onFoldersChanged: setAutomationFolders,
    onMoveThread: moveAutomationThread,
    onOpenMediaModal: openMediaPreviewModal,
    onOpenRunThread: openAutomationRunThread,
    onPreviewLocalPath: previewLocalFile,
    onPreviewPath: previewArtifact,
    onRestoreWorkflowRecordingVersion: restoreWorkflowRecordingVersion,
    onRevokePermissionGrant: revokePermissionGrant,
    onRevokePermissionGrantIds: revokePermissionGrantIds,
    onSelectPane: selectAutomationPane,
    onSelectThread: selectAutomationThread,
    onSelectWorkflowAgentThread: selectWorkflowAgentThread,
    onSelectWorkflowRecordingPlaybook: selectWorkflowRecordingForLab,
    onSetWorkflowRecordingEnabled: setWorkflowRecordingEnabled,
    onStartWorkflowRecording: startWorkflowRecording,
    onUnarchiveWorkflowRecordingPlaybook: unarchiveWorkflowRecordingPlaybook,
    onWorkflowAgentFoldersChanged: setWorkflowAgentFolders,
    orchestrationAutoRevision,
    orchestrationRevision,
    permissionAudit,
    permissionGrantRevoking,
    permissionGrants,
    refreshWorkflowRecordingLibrary,
    selectedAutomationPane,
    selectedFolder: selectedAutomationFolder,
    selectedThread: selectedAutomationThread,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    selectedWorkflowRecording,
    setWorkflowCompileProgress,
    setWorkflowExplorationProgressByThreadId,
    setWorkflowRevision,
    state,
    workflowAgentFolders,
    workflowCompileProgress,
    workflowDiscoveryProgress,
    workflowExplorationProgressByThreadId,
    workflowLibraryIncludeArchived,
    workflowRecordingLibrary,
    workflowRevision,
    onWorkflowLibraryIncludeArchivedChange: setWorkflowLibraryIncludeArchived,
  });
  const projectBoardWorkspaceProps = createAppProjectBoardWorkspaceProps({
    actions: projectBoardActions,
    activeProject,
    activeThreadSuppressesProjectBoard,
    busy: activeProjectBoardBusy,
    sourceBusy: projectBoardSourceBusy,
    sourceImpactBusy: projectBoardSourceImpactBusy,
    kickoffDefaultsBusy: projectBoardKickoffDefaultsBusy,
    refineBusy: projectBoardRefineBusy,
    refineMode: projectBoardRefineMode,
    proposalAnswerBusy: projectBoardProposalAnswerBusy,
    proposalCardReviewBusy: projectBoardProposalCardReviewBusy,
    proposalApplyBusy: projectBoardProposalApplyBusy,
    finalizeBusy: projectBoardFinalizeBusy,
    synthesisRetryBusy: projectBoardSynthesisRetryBusy,
    synthesisDeferBusy: projectBoardSynthesisDeferBusy,
    synthesisPauseBusy: projectBoardSynthesisPauseBusy,
    revisionBusy: projectBoardRevisionBusy,
    orchestrationRevision,
    projectBoardOpen,
    runActivityLinesByThread,
    threadRunStatuses,
    onClose: closeProjectBoard,
  });
  const conversationMessagesProps = createAppConversationMessagesProps({
    goalCompletionCelebrationId,
    chatFindOpen,
    chatFindInputRef,
    chatFindQuery,
    chatFindCount,
    chatFindIndex,
    onChatFindQueryChange: setChatFindQuery,
    onChatFindPrevious,
    onChatFindNext,
    onChatFindClose,
    activeThreadVoiceStatusVisible,
    activeThreadVoiceStatus,
    activeThreadVoiceStatusDismissKey,
    onDismissActiveThreadVoiceStatus: dismissActiveThreadVoiceStatus,
    activeSubagentInspector,
    activeThread,
    activeProjectHasBoard: Boolean(activeProject?.board),
    workflowRecordingReviewRunning,
    running,
    abortArmed,
    activeRunActivityLines,
    runStatus,
    retryStats: retryStatsByThread[state.activeThreadId],
    chatExportBusy,
    onRetryWorkflowRecordingReview: retryWorkflowRecordingReview,
    onStopWorkflowRecording: stopActiveWorkflowRecording,
    onExportActiveChat: exportActiveChat,
    scrollRef,
    onMessagesScroll: handleMessagesScroll,
    visibleChatMessages,
    activeChatBrowserUserAction,
    workflowRecorderEmptyChatState,
    welcomeAmbientPluginRegistry,
    onOpenAmbientKeys: openAmbientKeys,
    onOpenApiKeyDialog: openApiKeyDialog,
    onStartWelcomeFirstRunCapabilityOnboarding: startWelcomeFirstRunCapabilityOnboarding,
    onStartWelcomeProviderCatalogCardOnboarding: startWelcomeProviderCatalogCardOnboarding,
    onStartWelcomeRemoteSurfaceActivation: startWelcomeRemoteSurfaceActivation,
    onOpenPanel: openPanel,
    voiceProviderLabels,
    streamingAssistantId,
    retryableMessageIds,
    onRetryMessage: retryFailedPrompt,
    onSendTelegramSessionSetupPrompt: sendTelegramSessionSetupPrompt,
    onSendRemoteSurfaceActivationPrompt: sendRemoteSurfaceActivationPrompt,
    onPreviewPath: previewArtifact,
    onPreviewLocalPath: previewLocalFile,
    onOpenMediaModal: openMediaPreviewModal,
    latestReadyVoiceAutoplay,
    autoplayVoiceKey,
    activeVoiceMessageId,
    onActiveVoiceMessageChange: setActiveVoiceMessageId,
    onRegenerateVoice: regenerateMessageVoice,
    onRevealVoiceArtifact: revealMessageVoiceArtifact,
    onClearVoiceArtifact: clearMessageVoiceArtifact,
    onOpenUrl: openExternalUrl,
    onOpenBrowserUrl: openUrlInAmbientBrowser,
    artifactPathHints,
    plannerArtifactByMessageId,
    onImplementPlannerPlan: implementPlannerPlan,
    onRefinePlannerPlan: openPlannerRevisionDialog,
    onRetryPlannerFinalization: finalizePlannerPlan,
    projectBoardActions,
    onAnswerPlannerDecisionQuestion: answerPlannerDecisionQuestion,
    contextRecoveryBusy,
    canRetryContextRecovery: Boolean(latestRecoveryPrompt),
    onRecoverActiveThreadContext: recoverActiveThreadContext,
    onRecoverAndRetryLatest: recoverActiveThreadContextAndRetryLatest,
    onDuplicateActiveThreadFromTranscript: duplicateActiveThreadFromTranscript,
    threadRunStatuses,
    thinkingDisplayMode,
    runActivityLinesByThread,
    subagentParentClustersByMessageId,
    onSelectThread: selectThread,
    onCancelSubagentChild: cancelSubagentChild,
    onCloseSubagentChild: closeSubagentChild,
    onOpenCallableWorkflowThread: openCallableWorkflowThread,
    onPauseCallableWorkflowTask: pauseCallableWorkflowTask,
    onResumeCallableWorkflowTask: resumeCallableWorkflowTask,
    onCancelCallableWorkflowTask: cancelCallableWorkflowTask,
    onResolveSubagentBarrierAction: resolveSubagentBarrierAction,
    onResolveSubagentApprovalAction: resolveSubagentApprovalAction,
    subagentChildCancelBusy,
    subagentChildCloseBusy,
    callableWorkflowTaskPauseBusy,
    callableWorkflowTaskResumeBusy,
    callableWorkflowTaskCancelBusy,
    subagentBarrierActionBusy,
    subagentApprovalActionBusy,
    chatBrowserUserActionBusy,
    onResumeBrowserUserAction: resumeBrowserUserActionFromChat,
    onCancelBrowserUserAction: cancelBrowserUserActionFromChat,
    onOpenBrowserForUserAction: openBrowserForUserAction,
    transientThinkingActivityLines,
    visibleRunActivityLines,
    runStatusCardVisible,
    showScrollToBottom,
    onJumpToLatestMessage: jumpToLatestMessage,
    errorNeedsSessionRecovery,
    error,
    onDismissError: clearError,
    activeWorkspaceIsPreparedLocalTask,
    activeActivity,
    state,
  });
  const sidebarProps = createAppShellSidebarProps({
    width: sidebarWidth,
    sidebarArea,
    selectedAutomationPane,
    projectPopover,
    projectsCollapsed,
    sidebarOrganize,
    sidebarProjects,
    sidebarThreads,
    activeThreadSuppressesProjectBoard,
    projectBoardBusyProjectIds,
    projectBoardOpen,
    threadRunStatuses,
    sidebarAgeNow,
    workflowAgentFolders,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThreadId,
    selectedWorkflowRecordingId,
    automationsCollapsed,
    automationPopover,
    workflowAgentNavigationError,
    projectContextMenu,
    threadContextMenu,
    onOpenSidebarArea: openSidebarArea,
    onOpenPanel: openPanel,
    onOpenWorkflowRecordingsArea: openWorkflowRecordingsArea,
    onOpenWorkflowLabArea: openWorkflowLabArea,
    onOrganizeChange: updateSidebarOrganize,
    onSelectProject: selectProject,
    onOpenProjectContextMenu: openProjectContextMenu,
    onCreateThreadInProject: createThreadInProject,
    onSelectThread: selectThread,
    onOpenThreadContextMenu: openThreadContextMenu,
    onCreateWorkflowAgentFolder: createWorkflowAgentFolder,
    onSelectWorkflowAgentFolder: selectWorkflowAgentFolder,
    onSelectWorkflowAgentThread: selectWorkflowAgentThread,
    onSelectWorkflowRecording: selectWorkflowRecordingForSidebar,
    onRenameProject: renameProject,
    onArchiveProjectChats: archiveProjectChats,
    onRemoveProject: removeProject,
    onRenameThread: renameThread,
    onArchiveThread: archiveThread,
    onForkThread: forkThread,
    onBeginResize: beginSidebarResize,
    copyThreadDeeplink,
    copyThreadSessionId,
    copyThreadWorkingDirectory,
    createPermanentProjectWorktree,
    createWorkspace,
    exportChatPdfThread,
    loadWorkflowAgentFolders,
    markThreadUnread,
    openNewWorkflowComposer,
    openThreadMiniWindow,
    openWorkspace,
    projectBoardActions,
    revealProject,
    revealThread,
    runPrimaryCreateAction,
    setAutomationPopover,
    setAutomationsCollapsed,
    setProjectBoardOpen,
    setProjectPopover,
    setProjectsCollapsed,
    setSidebarOpen,
    setThreadContextMenu,
    state,
    threadActionInput,
    toggleProjectPinned,
    toggleThreadPinned,
  });
  const rightPanelHostProps = createAppRightPanelHostProps({
    actions: {
      addContextAttachments,
      cancelSttMicTest,
      clearAgentMemory,
      clearContextAttachments,
      continueAfterBrowserUserActionIfReady,
      exportDiagnostics,
      hydrateSearchRoutingSettingsForSettingsPanel,
      importDiagnostics,
      installModelProviderEndpoint,
      loadLocalDeepResearchRunHistory,
      loadPermissionAudit,
      loadPermissionGrants,
      loadSttMicrophoneDeviceList,
      loadSttProviders,
      loadVoiceProviders,
      openAmbientCliSecretDialog,
      openApiKeyDialog,
      openLocalDeepResearchFollowupIfSetupNeeded,
      refreshAgentMemoryDiagnostics,
      refreshVoiceCatalog,
      removeContextAttachment,
      revokePermissionGrant,
      revokePermissionGrantIds,
      runAgentMemoryEmbeddingLifecycleAction,
      runLocalModelRuntimeLifecycleAction,
      runUpdateAction,
      saveModelProviderCredential,
      selectThread,
      setupLocalDeepResearchFromSettings,
      setupMiniCpmVisionProviderFromSettings,
      setupSttProvider,
      startCapabilityBuilderPrompt,
      startSttMicTest,
      stopSttMicTestAndValidate,
      updateFeatureFlagSettings,
      updateLocalDeepResearchSettings,
      updateMediaPlaybackSettings,
      updateMemorySettings,
      updateModelRuntimeSettings,
      updatePlannerSettings,
      updateSearchRoutingSettings,
      updateSttSettings,
      updateThemePreference,
      updateThinkingDisplaySettings,
      updateThreadSettings,
      updateVoiceSettings,
    },
    onBeginResize: beginRightPanelResize,
    providerRuntimeState,
    rightPanelState,
    running,
    securityPromptState,
    setState,
    shellUiState,
    state,
    workflowRuntimeState,
    workspaceShellState,
  });
  const shellLayoutProps = createAppShellLayoutProps({
    activeGitReview,
    activeGitReviewError,
    activeProjectBoardTopbarAction,
    activeThread,
    automationsWorkspaceProps,
    beginWorkflowRecorderReviewResize,
    composerInputRef,
    composerProps,
    confirmActiveWorkflowRecordingReview,
    conversationMessagesProps,
    conversationReviewPanelDocked,
    isMac,
    modalHostProps,
    openApiKeyDialog,
    openGitSummaryPanel,
    projectBoardWorkspaceProps,
    rightPanel,
    rightPanelHostProps,
    runUpdateAction,
    running,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    sendWorkflowRecordingReviewPrompt,
    setError,
    setSidebarOpen,
    setUpdatePopoverOpen,
    setWorkflowRecordingReviewPanelOpen,
    showTopbarThreadMemoryToggle,
    sidebarArea,
    sidebarOpen,
    sidebarProps,
    state,
    togglePanel,
    updateActiveWorkflowRecordingReview,
    updateBusy,
    updatePopoverOpen,
    updateThreadSettings,
    workflowRecorderReviewPanelWidth,
    workflowRecordingReviewFeedbackActive,
    workflowRecordingReviewPanelOpen,
    applyLatestWorkflowRecordingSummary,
  });

  return <AppShellLayout {...shellLayoutProps} />;
}
