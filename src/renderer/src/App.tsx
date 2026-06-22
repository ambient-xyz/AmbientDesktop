import "@xyflow/react/dist/style.css";
import { useState } from "react";
import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import { isRunStatusRunning } from "../../shared/runStatus";
import { useAppAgentMemoryPanelControls } from "./AppAgentMemoryControls";
import { useAppActiveThreadModel } from "./AppActiveThreadModel";
import { useAppAutomationShellState } from "./AppAutomationShellState";
import { createAppAutomationsWorkspacePropsForApp } from "./AppAutomationsWorkspaceProps";
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
import { useAppConversationDisplayModel } from "./AppConversationDisplayModel";
import { createAppConversationMessagesPropsForApp } from "./AppConversationMessagesProps";
import { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import { createAppDesktopEventHandlerDependencies, handleAppDesktopEvent } from "./AppDesktopEventHandler";
import { createAppDesktopEventGuards } from "./AppDesktopEventGuards";
import { createAppDesktopStateMemoryControls } from "./AppDesktopStateMemoryControls";
import { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import { createAppGitActions } from "./AppGitActions";
import { createAppGoalActions } from "./AppGoalActions";
import { GOAL_COMPLETION_CELEBRATION_MS } from "./AppGoalControls";
import { createAppModalHostPropsForApp } from "./AppModalHostProps";
import { createAppNavigationActionsForApp } from "./AppNavigationActions";
import { createAppPermissionActions } from "./AppPermissionActions";
import { createAppPlannerActions } from "./AppPlannerActions";
import { useAppProviderRuntimeActionsForApp } from "./AppProviderRuntimeActions";
import { useAppProjectBoardControls } from "./AppProjectBoardControls";
import { createAppProjectBoardWorkspaceProps } from "./AppProjectBoardWorkspaceProps";
import { useAppProjectShellState } from "./AppProjectShellState";
import { createAppPromptHistoryControls } from "./AppPromptHistoryControls";
import { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import { createAppRightPanelHostPropsForApp } from "./AppRightPanelHostProps";
import { useAppRightPanelState } from "./AppRightPanelState";
import { EMPTY_RUN_ACTIVITY_LINES } from "./AppRunActivity";
import { useAppRunActivityState } from "./AppRunActivityState";
import { useAppSecurityPromptState } from "./AppSecurityPromptState";
import { createAppSettingsActions } from "./AppSettingsActions";
import { useAppLocalDeepResearchReadinessLifecycleEffect } from "./AppShellLifecycleEffects";
import { createAppShellCommandActions } from "./AppShellCommandActions";
import { createAppShellSidebarPropsForApp } from "./AppShellSidebarProps";
import { useAppShellUiState } from "./AppShellUiState";
import { useAppSidebarLifecycleEffects } from "./AppSidebarLifecycleEffects";
import { useAppSidebarSelectionModel } from "./AppSidebarSelectionModel";
import { createAppSubagentParentClusterActions } from "./AppSubagentParentClusterActions";
import { useAppSubagentShellControls } from "./AppSubagentShellControls";
import { createAppSymphonyBuilderControls } from "./AppSymphonyBuilderControls";
import { createAppThreadMaintenanceActions } from "./AppThreadMaintenanceActions";
import { AppShellLayout, createAppShellLayoutPropsForApp } from "./AppShellLayout";
import { createAppUpdateActions } from "./AppUpdateActions";
import { createAppWorkflowRecordingActions } from "./AppWorkflowRecordingActions";
import { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";
import { createAppWorkflowRecordingPlaybookActions } from "./AppWorkflowRecordingPlaybookActions";
import { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import { useAppWorkspaceShellState } from "./AppWorkspaceShellState";
import { workflowRecorderSurface } from "./AutomationsWorkspace";
import "./styles.css";

export function App() {
  const [state, setState] = useState<DesktopState | undefined>();
  const runActivityState = useAppRunActivityState();
  const {
    runStatus, setRunStatus, threadRunStatuses, setThreadRunStatuses, activity,
    abortArmed, setAbortArmed, setRetryStatsByThread,
    runActivityLinesByThread, setRunActivityLinesByThread, runActivityCounterRef,
    runActivityLastEventAtRef, runActivityHeartbeatIndexRef, runActivityLinesByThreadRef,
    thinkingDeltaBuffersRef, previousRunningRef,
  } = runActivityState;
  const shellUiState = useAppShellUiState();
  const {
    sidebarOpen, setSidebarOpen, setSidebarWidth, sidebarArea, setSidebarArea,
    setWorkflowRecorderReviewPanelWidth,
    setSearchRoutingHydrating, setSearchRoutingHydrationError,
    setMediaPreviewModal, setCommandPaletteOpen, setCommandPaletteQuery,
    error, setError,
    errorScope, setErrorScope, setErrorState, setUpdatePopoverOpen,
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
    workspaceRevision, setWorkspaceRevision, gitStatus, setGitStatus, setGitStatusError,
    setActiveGitReview, setActiveGitReviewError,
    setGitConfirmation, pluginCatalogRevision,
    setWelcomeAmbientPluginRegistry, browserRevision, setBrowserRevision,
    chatBrowserUserAction, setChatBrowserUserAction, setChatBrowserUserActionBusy,
    activeThreadIdRef, activeProjectRootRef, workspaceProjectAliasesRef, messageKindsRef,
    mcpContainerRuntimeStartupCheckRef,
  } = workspaceShellState;
  const securityPromptState = useAppSecurityPromptState();
  const {
    permissionRequests, setPermissionRequests, privilegedCredentialRequests, setPrivilegedCredentialRequests,
    secureInputRequests, setSecureInputRequests, permissionAuditRevision,
    permissionAudit, setPermissionAudit, permissionGrants, setPermissionGrants, setPermissionAuditError,
    setPermissionGrantError, permissionGrantRevoking,
    setPermissionGrantRevoking, setApiDialogOpen, apiKeyDraft, setApiKeyDraft,
    setClipboardCandidate, setApiKeyStatus, setApiKeyBusy,
    ambientCliSecretDialog, setAmbientCliSecretDialog, apiKeyInputRef, ambientCliSecretInputRef,
  } = securityPromptState;
  const providerRuntimeState = useAppProviderRuntimeState();
  const {
    voiceProviderRefreshTimerRef,
    sttProviders, sttProviderRefreshTimerRef,
    sttComposer,
    sttDraftMetadata, setSttDraftMetadata, sttMicRecorderRef, sttComposerRecorderRef,
    sttComposerShortcutActiveRef, sttComposerThreadRef,
    localDeepResearchSetup, setLocalDeepResearchSetup,
  } = providerRuntimeState;
  const workflowRuntimeState = useAppWorkflowRuntimeState();
  const {
    orchestrationRevision, orchestrationAutoRevision,
    workflowRevision,
    chatExportBusy, setChatExportBusy,
    setChatExportStatus, contextRecoveryBusy, setContextRecoveryBusy,
    setCallableWorkflowTaskCancelBusy, setCallableWorkflowTaskPauseBusy,
    setCallableWorkflowTaskResumeBusy,
    setSubagentChildCancelBusy, setSubagentChildCloseBusy,
    setSubagentBarrierActionBusy, subagentBarrierDecisionDialog, setSubagentBarrierDecisionDialog,
    setSubagentApprovalActionBusy, subagentApprovalDecisionDialog,
    setSubagentApprovalDecisionDialog, contextAttachments, setContextAttachments, setContextError,
    setLocalDeepResearchModeArmedState, localDeepResearchBudgetOverride,
    setLocalDeepResearchBudgetOverride, symphonyBuilderDraft, setSymphonyBuilderDraft, symphonyBuilderActionBusy,
    setSymphonyBuilderActionBusy, goalModeArmed, setGoalModeArmed, setGoalMenuOpen,
    setGoalBusy, setGoalCompletionCelebrationId, latestDesktopStateRevisionRef,
    clearedGoalKeysRef, promptHistoryCursor, setPromptHistoryCursor, draftBeforePromptHistory,
    setDraftBeforePromptHistory, promptHistoryRef, localDeepResearchModeArmedRef, localDeepResearchRunBudgetRef,
    pendingSubmittedPrompts, setPendingSubmittedPrompts,
    pendingProjectComposerDraft, setPendingProjectComposerDraft, pendingWorkflowRecordingEditContext,
    setPendingWorkflowRecordingEditContext, goalCompletionCelebrationTimerRef,
  } = workflowRuntimeState;
  const projectShellState = useAppProjectShellState();
  const {
    setProjectPopover, projectContextMenu, setProjectContextMenu,
    projectBoardResetDialog, setProjectBoardResetDialog, plannerRevisionDialog,
    setPlannerRevisionDialog, projectBoardBusyProjectIds, setProjectBoardBusyProjectIds, projectBoardSourceBusy,
    setProjectBoardSourceBusy, projectBoardSourceImpactBusy, setProjectBoardSourceImpactBusy,
    projectBoardKickoffDefaultsBusy, setProjectBoardKickoffDefaultsBusy, projectBoardRefineBusy,
    setProjectBoardRefineBusy, projectBoardRefineMode, setProjectBoardRefineMode,
    projectBoardProposalAnswerBusy, setProjectBoardProposalAnswerBusy, projectBoardProposalCardReviewBusy,
    setProjectBoardProposalCardReviewBusy, projectBoardProposalApplyBusy, setProjectBoardProposalApplyBusy,
    projectBoardFinalizeBusy, setProjectBoardFinalizeBusy, projectBoardSynthesisRetryBusy,
    setProjectBoardSynthesisRetryBusy, projectBoardSynthesisDeferBusy, setProjectBoardSynthesisDeferBusy,
    projectBoardSynthesisPauseBusy, setProjectBoardSynthesisPauseBusy, projectBoardRevisionBusy,
    setProjectBoardRevisionBusy, threadContextMenu, setThreadContextMenu,
  } = projectShellState;
  const automationShellState = useAppAutomationShellState();
  const {
    automationPopover, setAutomationPopover,
    automationFolders, setAutomationFolders,
    setSelectedAutomationPane, selectedAutomationFolderId,
    selectedAutomationThreadId, setSelectedAutomationThreadId, workflowAgentFolders, setWorkflowAgentFolders,
    setWorkflowAgentNavigationError, selectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentFolderId, selectedWorkflowAgentThreadId, setSelectedWorkflowAgentThreadId,
    sidebarOrganize, setSidebarAgeNow,
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
  const { rememberClearedGoal, rememberCommittedDesktopState, rememberDesktopState } = createAppDesktopStateMemoryControls({
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
  const workflowRecordingLibraryControls = useAppWorkflowRecordingLibraryControls({
    applyDesktopState: applyAutomationDesktopState,
    setError,
    state,
  });
  const {
    workflowLibraryIncludeArchived,
    selectedWorkflowRecording,
    selectedWorkflowRecordingId,
    setSelectedWorkflowRecordingId,
    refreshWorkflowRecordingLibraryOverride,
  } = workflowRecordingLibraryControls;
  const navigationActions = createAppNavigationActionsForApp({
    automationShellState,
    closeProjectBoard,
    composerShellState,
    projectShellState,
    rememberDesktopState,
    rightPanelState,
    runActivityState,
    setSelectedWorkflowRecordingId,
    setState,
    shellUiState,
    state,
    workspaceShellState,
    applyCreatedThreadState,
    applyProjectActionState,
  });
  const {
    projectIdForWorkspacePath,
    projectThreadActions,
    automationFolderControls,
    automationSelectionControls,
    workspaceNavigationControls,
    loadAutomationFolders,
    loadWorkflowAgentFolders,
    createThread,
    createWorkspace,
    openWorkspace,
    selectProject,
    selectThread,
    openWorkflowRecordingsArea,
    openWorkflowLabArea,
  } = navigationActions;
  const credentialDialogActions = createAppCredentialDialogActions({
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
  const { openAmbientCliSecretDialog, openApiKeyDialog } = credentialDialogActions;
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
  const chatFindControls = useAppChatFindControls({
    activeThreadId: state?.activeThreadId,
    messages: state?.messages,
    running,
    thinkingDisplayMode,
  });
  const { setChatFindOpen, chatFindInputRef } = chatFindControls;
  const composerModelPickerControls = useAppComposerModelPickerControls({
    activeThreadId: state?.activeThreadId,
    catalogOptions: state?.settings.modelCatalog?.selectableMainModelOptions,
    selectedModelId: state?.settings.model,
  });

  const providerRuntimeActions = useAppProviderRuntimeActionsForApp({
    appendRunActivityLine: (line) => appendRunActivityLine(line),
    composerShellState,
    providerRuntimeState,
    resetPromptHistory,
    resetRunActivityLines: (line) => resetRunActivityLines(line),
    rightPanelState,
    runActivityState,
    state,
    running,
    setError,
    setState,
    workflowRuntimeState,
  });
  const {
    voiceThreadControls,
    loadSttProviders,
    loadVoiceProviders,
    scheduleSttProviderRefresh,
    scheduleVoiceProviderRefresh,
    loadSttMicrophoneDeviceList,
    localRuntimeActions,
    cancelSttComposerRecording,
    discardSttComposerResult,
    retrySttComposerTranscription,
    startSttComposerRecording,
    stopSttComposerRecording,
    messageVoiceActions,
  } = providerRuntimeActions;

  const permissionActions = createAppPermissionActions({
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
  const {
    loadPendingPermissionRequests,
    loadPermissionAudit,
    loadPermissionGrants,
    requestThreadPermissionModeChange,
  } = permissionActions;

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
    appendRunActivityLine,
    appendThinkingDeltaLine,
    handleMessagesScroll,
    jumpToLatestMessage,
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

  const activeThreadModel = useAppActiveThreadModel({
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
  const {
    activePermissionRequest,
    activePrivilegedCredentialRequest,
    activeSecureInputRequest,
    activeThread,
    localDeepResearchRunActive,
    localDeepResearchRunBudget,
  } = activeThreadModel;
  localDeepResearchRunBudgetRef.current = localDeepResearchRunBudget;
  const subagentShellControls = useAppSubagentShellControls({
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
  const { activeSubagentChildHiddenByFeatureFlag, subagentUiEnabled, symphonyBuilderModel } = subagentShellControls;

  const subagentParentClusterActions = createAppSubagentParentClusterActions({
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
  const { submitSubagentApprovalDecisionDialog, submitSubagentBarrierDecisionDialog } = subagentParentClusterActions;

  const workflowRecordingReviewControls = useAppWorkflowRecordingReviewControls({
    activeThread,
    running,
    thinkingDisplay: state?.settings.thinkingDisplay,
    workflowRecorderSurface,
  });
  const { workflowRecordingReviewFeedbackActive } = workflowRecordingReviewControls;
  const projectBoardControls = useAppProjectBoardControls({
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
  const {
    activeProject,
    activeProjectBoardBusy,
    activeProjectBoardTopbarAction,
    activeThreadSuppressesProjectBoard,
    latestDurablePlannerPlanArtifact,
    projectBoardActions,
    projectBoardOpen,
    setProjectBoardOpen,
    projectBoardPlanPickerOpen,
    projectBoardThreadPlanAction,
    readyPlannerPlanArtifacts,
    runProjectBoardThreadPlanAction,
    sessionContextMissing,
  } = projectBoardControls;
  function closeProjectBoard() {
    setProjectBoardOpen(false);
  }
  useAppLocalDeepResearchReadinessLifecycleEffect({
    localDeepResearchReady,
    setLocalDeepResearchModeArmed,
  });
  const conversationDisplayModel = useAppConversationDisplayModel({
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
  const { latestRecoveryPrompt, promptHistory } = conversationDisplayModel;
  promptHistoryRef.current = promptHistory;

  useAppPendingSubmittedPromptCleanup({
    running,
    setPendingSubmittedPrompts,
    state,
  });

  const sidebarSelectionModel = useAppSidebarSelectionModel({
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
  const {
    selectedAutomationFolder,
    selectedAutomationThread,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
  } = sidebarSelectionModel;
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

  const workflowRecordingActions = createAppWorkflowRecordingActions({
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
  const {
    applyLatestWorkflowRecordingSummary,
    confirmActiveWorkflowRecordingReview,
    sendWorkflowRecordingReviewPrompt,
    updateActiveWorkflowRecordingReview,
  } = workflowRecordingActions;

  const workflowRecordingPlaybookActions = createAppWorkflowRecordingPlaybookActions({
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
  const updateActions = createAppUpdateActions({
    setError,
    setState,
    setUpdateBusy,
    setUpdatePopoverOpen,
  });

  const settingsActions = createAppSettingsActions({
    setLocalDeepResearchSetup,
    setSearchRoutingHydrationError,
    setSearchRoutingHydrating,
    setState,
    state,
  });
  const { updateThinkingDisplaySettings } = settingsActions;

  const agentMemoryControls = useAppAgentMemoryPanelControls({
    activeThreadMemoryEnabled: Boolean(activeThread?.memoryEnabled),
    panel: rightPanel,
    providerRuntimeState,
    state,
  });

  const browserActionControls = createAppBrowserActionControls({
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
  const composerRetryActions = createAppComposerRetryActions({
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
  const { retryFailedPrompt } = composerRetryActions;

  const threadMaintenanceActions = createAppThreadMaintenanceActions({
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
    compactActiveThread,
    duplicateActiveThreadFromTranscript,
    exportActiveChat,
    exportChatPdfThread,
    exportDiagnostics,
    recoverActiveThreadContext,
    recoverActiveThreadContextAndRetryLatest,
  } = threadMaintenanceActions;

  const shellCommandActions = createAppShellCommandActions({
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
  const {
    beginRightPanelResize,
    beginSidebarResize,
    beginWorkflowRecorderReviewResize,
    handleMenuCommand,
    openMediaPreviewModal,
    updateThreadSettings,
  } = shellCommandActions;

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

  const contextAttachmentActions = createAppContextAttachmentActions({
    allowExternalContext: state?.settings.permissionMode === "full-access",
    openAttachmentsPanel: () => openPanel("attachments"),
    setContextAttachments,
    setContextError,
  });
  const { attachComposerFiles, clearContextAttachments, removeContextAttachment } = contextAttachmentActions;

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

  const capabilityPromptActions = createAppCapabilityPromptActions({
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
  const plannerActions = createAppPlannerActions({
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
  const { openPlannerRevisionDialog, sendPlannerDurableRevision, submitPlannerRevisionDialog } = plannerActions;

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
  const modalHostProps = createAppModalHostPropsForApp({
    activePermissionRequest,
    activePrivilegedCredentialRequest,
    activeSecureInputRequest,
    actions: {
      credentialDialogActions,
      localRuntimeActions,
      openSearchWebSettings,
      permissionActions,
      previewArtifact,
      projectBoardActions,
      projectThreadActions,
      shellCommandActions,
      submitPlannerRevisionDialog,
      submitSubagentApprovalDecisionDialog,
      submitSubagentBarrierDecisionDialog,
    },
    providerRuntimeState,
    projectShellState,
    securityPromptState,
    shellUiState,
    state,
    subagentUiEnabled,
    workflowRuntimeState,
    workspaceShellState,
  });
  const automationsWorkspaceProps = createAppAutomationsWorkspacePropsForApp({
    automationFolderControls,
    automationSelectionControls,
    automationShellState,
    permissionActions,
    permissions: {
      permissionAudit,
      permissionGrantRevoking,
      permissionGrants,
    },
    previewActions: {
      onOpenMediaModal: openMediaPreviewModal,
      onPreviewLocalPath: previewLocalFile,
      onPreviewPath: previewArtifact,
    },
    projectActions: {
      onCreateProject: createWorkspace,
      onDesktopStateChanged: applyAutomationDesktopState,
    },
    selected: {
      selectedFolder: selectedAutomationFolder,
      selectedThread: selectedAutomationThread,
      selectedWorkflowAgentFolder,
      selectedWorkflowAgentThread,
      selectedWorkflowRecording,
    },
    state,
    workflowRecordingActions,
    workflowRecordingLibraryControls,
    workflowRecordingPlaybookActions,
    workflowRuntimeState,
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
  const conversationMessagesProps = createAppConversationMessagesPropsForApp({
    activeThreadModel,
    browserActionControls,
    capabilityPromptActions,
    chatFindControls,
    composerRetryActions,
    conversationDisplayModel,
    coreLifecycleControls: {
      handleMessagesScroll,
      jumpToLatestMessage,
      scrollRef,
      showScrollToBottom,
    },
    credentialDialogActions,
    messageVoiceActions,
    plannerActions,
    previewActions: {
      onOpenMediaModal: openMediaPreviewModal,
      onPreviewLocalPath: previewLocalFile,
      onPreviewPath: previewArtifact,
    },
    projectBoardControls,
    rightPanelState,
    runActivityState,
    runDerivedState: {
      activeRunActivityLines,
      running,
      thinkingDisplayMode,
    },
    shellUiState,
    state,
    subagentParentClusterActions,
    subagentShellControls,
    threadMaintenanceActions,
    voiceThreadControls,
    workflowRecordingActions,
    workflowRecordingReviewControls,
    workflowRuntimeState,
    workspaceNavigationControls,
    workspaceShellState,
  });
  const sidebarProps = createAppShellSidebarPropsForApp({
    automationShellState,
    beginSidebarResize,
    exportChatPdfThread,
    navigationActions,
    projectBoardControls,
    projectShellState,
    rightPanelState,
    runActivityState,
    selectionModel: sidebarSelectionModel,
    selectedWorkflowRecordingId,
    shellUiState,
    state,
  });
  const rightPanelHostProps = createAppRightPanelHostPropsForApp({
    actions: {
      agentMemoryControls,
      browserActionControls,
      capabilityPromptActions,
      contextAttachmentActions,
      credentialDialogActions,
      navigationActions: { selectThread },
      permissionActions,
      providerRuntimeActions,
      settingsActions,
      shellCommandActions,
      threadMaintenanceActions,
      updateActions,
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
  const shellLayoutProps = createAppShellLayoutPropsForApp({
    activeThreadModel,
    activeProjectBoardTopbarAction,
    activeThread,
    automationsWorkspaceProps,
    beginWorkflowRecorderReviewResize,
    composerInputRef,
    composerProps,
    confirmActiveWorkflowRecordingReview,
    conversationMessagesProps,
    modalHostProps,
    openApiKeyDialog,
    openGitSummaryPanel,
    projectBoardWorkspaceProps,
    rightPanelState,
    rightPanelHostProps,
    running,
    selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread,
    sendWorkflowRecordingReviewPrompt,
    setError,
    shellUiState,
    sidebarProps,
    state,
    updateActions,
    updateActiveWorkflowRecordingReview,
    updateThreadSettings,
    workflowRecordingReviewControls,
    workspaceShellState,
    applyLatestWorkflowRecordingSummary,
  });

  return <AppShellLayout {...shellLayoutProps} />;
}
