import "@xyflow/react/dist/style.css";
import { useState } from "react";
import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import { isRunStatusRunning } from "../../shared/runStatus";
import { useAppActionOwnerGraphForApp } from "./AppActionOwnerGraph";
import { useAppActiveThreadModel } from "./AppActiveThreadModel";
import { useAppAutomationShellState } from "./AppAutomationShellState";
import { useAppChatFindControls } from "./AppChatFindControls";
import { useAppComposerModelPickerControls } from "./AppComposerModelPickerControls";
import { useAppComposerShellState } from "./AppComposerShellState";
import {
  createAppLocalDeepResearchModeControls,
  useAppPendingSubmittedPromptCleanup,
} from "./AppComposerInteractionControls";
import { useAppCoreLifecycleControlsForApp } from "./AppCoreLifecycleControls";
import { useAppConversationDisplayModel } from "./AppConversationDisplayModel";
import { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import { createAppDesktopEventHandlerDependencies, handleAppDesktopEvent } from "./AppDesktopEventHandler";
import { createAppDesktopEventGuards } from "./AppDesktopEventGuards";
import { createAppDesktopStateMemoryControls } from "./AppDesktopStateMemoryControls";
import { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import { GOAL_COMPLETION_CELEBRATION_MS } from "./AppGoalControls";
import { createAppNavigationActionsForApp } from "./AppNavigationActions";
import { createAppPermissionActions } from "./AppPermissionActions";
import { useAppProviderRuntimeActionsForApp } from "./AppProviderRuntimeActions";
import { useAppProjectBoardControlsForApp } from "./AppProjectBoardControls";
import { useAppProjectShellState } from "./AppProjectShellState";
import { createAppPromptHistoryControls } from "./AppPromptHistoryControls";
import { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import { useAppRightPanelState } from "./AppRightPanelState";
import { EMPTY_RUN_ACTIVITY_LINES } from "./AppRunActivity";
import { useAppRunActivityState } from "./AppRunActivityState";
import { useAppSecurityPromptState } from "./AppSecurityPromptState";
import { useAppLocalDeepResearchReadinessLifecycleEffect } from "./AppShellLifecycleEffects";
import { createAppShellSurfacePropsForApp } from "./AppShellSurfaceProps";
import { useAppShellUiState } from "./AppShellUiState";
import { useAppSidebarLifecycleEffects } from "./AppSidebarLifecycleEffects";
import { useAppSidebarSelectionModel } from "./AppSidebarSelectionModel";
import { createAppSubagentParentClusterActionsForApp } from "./AppSubagentParentClusterActions";
import { useAppSubagentShellControls } from "./AppSubagentShellControls";
import { AppShellLayout } from "./AppShellLayout";
import { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";
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
    runActivityLinesByThread,
  } = runActivityState;
  const shellUiState = useAppShellUiState();
  const {
    sidebarArea, setSidebarArea,
    error, setError,
  } = shellUiState;
  const rightPanelState = useAppRightPanelState();
  const workspaceShellState = useAppWorkspaceShellState();
  const {
    setWorkspaceRevision,
    chatBrowserUserAction,
    activeThreadIdRef, activeProjectRootRef, workspaceProjectAliasesRef,
  } = workspaceShellState;
  const securityPromptState = useAppSecurityPromptState();
  const {
    permissionRequests, setPermissionRequests, privilegedCredentialRequests, setPrivilegedCredentialRequests,
    secureInputRequests, setSecureInputRequests,
    permissionAudit, setPermissionAudit, permissionGrants, setPermissionGrants, setPermissionAuditError,
    setPermissionGrantError,
    setPermissionGrantRevoking, setApiDialogOpen, apiKeyDraft, setApiKeyDraft,
    setClipboardCandidate, setApiKeyStatus, setApiKeyBusy,
    ambientCliSecretDialog, setAmbientCliSecretDialog, apiKeyInputRef, ambientCliSecretInputRef,
  } = securityPromptState;
  const providerRuntimeState = useAppProviderRuntimeState();
  const {
    sttProviders,
    sttComposer,
    setSttDraftMetadata,
    localDeepResearchSetup,
  } = providerRuntimeState;
  const workflowRuntimeState = useAppWorkflowRuntimeState();
  const {
    orchestrationRevision, orchestrationAutoRevision,
    workflowRevision,
    setSubagentChildCancelBusy, setSubagentChildCloseBusy,
    setSubagentBarrierActionBusy, setSubagentBarrierDecisionDialog,
    setSubagentApprovalActionBusy,
    setSubagentApprovalDecisionDialog, setContextError,
    setLocalDeepResearchModeArmedState, localDeepResearchBudgetOverride,
    setLocalDeepResearchBudgetOverride, symphonyBuilderDraft, setSymphonyBuilderDraft,
    setGoalModeArmed, setGoalCompletionCelebrationId, latestDesktopStateRevisionRef,
    clearedGoalKeysRef, promptHistoryCursor, setPromptHistoryCursor, draftBeforePromptHistory,
    setDraftBeforePromptHistory, promptHistoryRef, localDeepResearchModeArmedRef, localDeepResearchRunBudgetRef,
    pendingSubmittedPrompts, setPendingSubmittedPrompts,
    pendingProjectComposerDraft, setPendingProjectComposerDraft, goalCompletionCelebrationTimerRef,
  } = workflowRuntimeState;
  const projectShellState = useAppProjectShellState();
  const automationShellState = useAppAutomationShellState();
  const {
    automationPopover,
    automationFolders, setAutomationFolders,
    selectedAutomationFolderId,
    selectedAutomationThreadId, workflowAgentFolders,
    selectedWorkflowAgentFolderId,
    selectedWorkflowAgentThreadId,
    sidebarOrganize,
  } = automationShellState;
  const composerShellState = useAppComposerShellState();
  const {
    getComposerDraft,
    setComposerDraft,
    focusComposerEnd,
  } = composerShellState;
  const { rememberClearedGoal, rememberCommittedDesktopState, rememberDesktopState } = createAppDesktopStateMemoryControls({
    activeProjectRootRef,
    activeThreadIdRef,
    clearedGoalKeysRef,
    latestDesktopStateRevisionRef,
    workspaceProjectAliasesRef,
  });
  const appDesktopStateAppliers = createAppDesktopStateAppliers({
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
  const { applyRunStatusDesktopState, applyCreatedThreadState, applyProjectActionState, applyAutomationDesktopState } =
    appDesktopStateAppliers;
  const workflowRecordingLibraryControls = useAppWorkflowRecordingLibraryControls({
    applyDesktopState: applyAutomationDesktopState,
    setError,
    state,
  });
  const {
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
    loadAutomationFolders,
    loadWorkflowAgentFolders,
    selectThread,
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
    cancelSttComposerRecording,
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

  const coreLifecycleControls = useAppCoreLifecycleControlsForApp({
    activeRunActivityLines,
    automationShellState,
    cancelSttComposerRecording,
    chatFindControls,
    handleEvent,
    loadSttMicrophoneDeviceList,
    loadSttProviders,
    loadVoiceProviders,
    permissionActions,
    projectShellState,
    providerRuntimeState,
    rememberDesktopState,
    resetPromptHistory,
    rightPanelState,
    runActivityState,
    running,
    securityPromptState,
    setLocalDeepResearchModeArmed,
    setState,
    shellUiState,
    startSttComposerRecording,
    state,
    stopSttComposerRecording,
    workflowRuntimeState,
    workspaceShellState,
  });
  const {
    appendRunActivityLine,
    appendThinkingDeltaLine,
    resetRunActivityLines,
  } = coreLifecycleControls;

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

  const subagentParentClusterActions = createAppSubagentParentClusterActionsForApp({
    automationShellState,
    projectShellState,
    setState,
    shellUiState,
    workflowRecordingLibraryControls,
    workflowRuntimeState,
  });
  const workflowRecordingReviewControls = useAppWorkflowRecordingReviewControls({
    activeThread,
    running,
    runStatus,
    thinkingDisplay: state?.settings.thinkingDisplay,
    workflowRecorderSurface,
  });
  const { workflowRecordingReviewFeedbackActive } = workflowRecordingReviewControls;
  const projectBoardControls = useAppProjectBoardControlsForApp({
    activeThread,
    appDesktopStateAppliers,
    navigationActions,
    projectShellState,
    rightPanelState,
    setState,
    shellUiState,
    state,
  });
  const { setProjectBoardOpen } = projectBoardControls;
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
  const { promptHistory } = conversationDisplayModel;
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

  const appActionOwnerGraph = useAppActionOwnerGraphForApp({
    activeThread,
    appDesktopStateAppliers,
    automationShellState,
    composerShellState,
    conversationDisplayModel,
    coreLifecycleControls,
    credentialDialogActions,
    localDeepResearchRunActive,
    navigationActions,
    projectBoardControls,
    projectShellState,
    promptHistoryControls: {
      navigatePromptHistory,
      resetPromptHistory,
      shouldNavigatePromptHistory,
    },
    providerRuntimeState,
    rememberClearedGoal,
    rememberDesktopState,
    rightPanelState,
    runActivityState,
    running,
    setLocalDeepResearchModeArmed,
    setState,
    shellUiState,
    state,
    subagentShellControls,
    subagentUiEnabled,
    workflowRecorderSurface,
    workflowRecordingLibraryControls,
    workflowRecordingReviewControls,
    workflowRuntimeState,
    workspaceShellState,
  });
  const {
    agentMemoryControls,
    browserActionControls,
    capabilityPromptActions,
    composerInteractionControls,
    composerRetryActions,
    contextAttachmentActions,
    gitActions,
    goalActions,
    plannerActions,
    settingsActions,
    shellCommandActions,
    symphonyBuilderControls,
    threadMaintenanceActions,
    updateActions,
    workflowRecordingActions,
    workflowRecordingPlaybookActions,
  } = appActionOwnerGraph;
  const { handleMenuCommand } = shellCommandActions;

  if (!state || !activeThread || activeSubagentChildHiddenByFeatureFlag) {
    return <div className="boot">Ambient</div>;
  }

  const shellLayoutProps = createAppShellSurfacePropsForApp({
    actions: {
      applyAutomationDesktopState,
      setError,
      setState,
    },
    activeThread,
    activeThreadModel,
    agentMemoryControls,
    automationShellState,
    browserActionControls,
    capabilityPromptActions,
    chatFindControls,
    composerShellState,
    composerInteractionControls,
    composerModelPickerControls,
    composerRetryActions,
    contextAttachmentActions,
    conversationDisplayModel,
    coreLifecycleControls,
    credentialDialogActions,
    gitActions,
    goalActions,
    localDeepResearchModeControls: {
      onToggleLocalDeepResearchMode: toggleLocalDeepResearchMode,
    },
    messageVoiceActions,
    navigationActions,
    permissionActions,
    plannerActions,
    projectBoardControls,
    projectShellState,
    providerRuntimeActions,
    providerRuntimeState,
    rightPanelState,
    runActivityState,
    runDerivedState: {
      activeRunActivityLines,
      running,
      thinkingDisplayMode,
    },
    running,
    securityPromptState,
    settingsActions,
    shellCommandActions,
    shellUiState,
    sidebarSelectionModel,
    state,
    subagentParentClusterActions,
    subagentShellControls,
    subagentUiEnabled,
    symphonyBuilderControls,
    threadMaintenanceActions,
    updateActions,
    voiceThreadControls,
    workflowRecordingActions,
    workflowRecordingLibraryControls,
    workflowRecordingPlaybookActions,
    workflowRecordingReviewControls,
    workflowRuntimeState,
    workspaceShellState,
  });

  return <AppShellLayout {...shellLayoutProps} />;
}
