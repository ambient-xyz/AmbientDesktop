import "@xyflow/react/dist/style.css";
import { useState } from "react";
import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import { useAppAutomationShellState } from "./AppAutomationShellState";
import { useAppComposerShellState } from "./AppComposerShellState";
import { useAppCoreLifecycleControlsForApp } from "./AppCoreLifecycleControls";
import { createAppDesktopEventHandlerDependencies, handleAppDesktopEvent } from "./AppDesktopEventHandler";
import { createAppDesktopEventGuards } from "./AppDesktopEventGuards";
import { useAppInteractionGraphForApp } from "./AppInteractionGraph";
import { useAppMainSurfaceLifecycleModelsForApp, useAppMainSurfaceThreadModelsForApp } from "./AppMainSurfaceModels";
import { useAppProviderRuntimeActionsForApp } from "./AppProviderRuntimeActions";
import { useAppProjectBoardControlsForApp } from "./AppProjectBoardControls";
import { useAppProjectShellState } from "./AppProjectShellState";
import { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import { useAppRightPanelState } from "./AppRightPanelState";
import { useAppRunActivityState } from "./AppRunActivityState";
import { useAppSecurityPromptState } from "./AppSecurityPromptState";
import { useAppShellSurfaceGraphForApp } from "./AppShellSurfaceGraph";
import { useAppShellUiState } from "./AppShellUiState";
import { AppShellLayout } from "./AppShellLayout";
import { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import { useAppWorkspaceShellState } from "./AppWorkspaceShellState";
import { workflowRecorderSurface } from "./AutomationsWorkspace";
import "./styles.css";

export function App() {
  const [state, setState] = useState<DesktopState | undefined>();
  const runActivityState = useAppRunActivityState();
  const shellUiState = useAppShellUiState();
  const { setError } = shellUiState;
  const rightPanelState = useAppRightPanelState();
  const workspaceShellState = useAppWorkspaceShellState();
  const securityPromptState = useAppSecurityPromptState();
  const providerRuntimeState = useAppProviderRuntimeState();
  const workflowRuntimeState = useAppWorkflowRuntimeState();
  const projectShellState = useAppProjectShellState();
  const automationShellState = useAppAutomationShellState();
  const composerShellState = useAppComposerShellState();
  const interactionGraph = useAppInteractionGraphForApp({
    automationShellState,
    closeProjectBoard,
    composerShellState,
    projectShellState,
    providerRuntimeState,
    rightPanelState,
    runActivityState,
    securityPromptState,
    setState,
    shellUiState,
    state,
    workflowRuntimeState,
    workspaceShellState,
  });
  const {
    activeRunActivityLines,
    appDesktopStateAppliers,
    chatFindControls,
    composerModelPickerControls,
    credentialDialogActions,
    localDeepResearchReady,
    localDeepResearchModeControls,
    navigationActions,
    permissionActions,
    promptHistoryControls,
    rememberClearedGoal,
    rememberCommittedDesktopState,
    rememberDesktopState,
    running,
    thinkingDisplayMode,
    triggerGoalCompletionCelebration,
    workflowRecordingLibraryControls,
  } = interactionGraph;
  const { applyAutomationDesktopState } = appDesktopStateAppliers;
  const { openAmbientCliSecretDialog, openApiKeyDialog } = credentialDialogActions;
  const { navigatePromptHistory, resetPromptHistory, shouldNavigatePromptHistory } = promptHistoryControls;
  const { setLocalDeepResearchModeArmed, toggleLocalDeepResearchMode } = localDeepResearchModeControls;

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
    startSttComposerRecording,
    stopSttComposerRecording,
    messageVoiceActions,
  } = providerRuntimeActions;

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
  const { appendRunActivityLine, appendThinkingDeltaLine, resetRunActivityLines } = coreLifecycleControls;

  const desktopEventGuards = createAppDesktopEventGuards({
    activeProjectRootRef: workspaceShellState.activeProjectRootRef,
    workspaceProjectAliasesRef: workspaceShellState.workspaceProjectAliasesRef,
  });
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

  const mainSurfaceThreadModels = useAppMainSurfaceThreadModelsForApp({
    automationShellState,
    localDeepResearchReady,
    projectShellState,
    promptRequestMatchesActiveProject,
    runActivityState,
    running,
    securityPromptState,
    setState,
    shellUiState,
    state,
    workflowRecorderSurface,
    workflowRecordingLibraryControls,
    workflowRuntimeState,
    workspaceShellState,
  });
  const {
    activeThreadModel,
    activeThread,
    localDeepResearchRunActive,
    subagentParentClusterActions,
    subagentShellControls,
    subagentUiEnabled,
    workflowRecordingReviewControls,
  } = mainSurfaceThreadModels;
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
  const mainSurfaceLifecycleModels = useAppMainSurfaceLifecycleModelsForApp({
    activeRunActivityLines,
    activeThread,
    automationShellState,
    composerShellState,
    localDeepResearchReady,
    navigationActions,
    running,
    runStatus: runActivityState.runStatus,
    setLocalDeepResearchModeArmed,
    shellUiState,
    state,
    subagentUiEnabled,
    thinkingDisplayMode,
    workflowRuntimeState,
  });
  const { conversationDisplayModel, sidebarSelectionModel } = mainSurfaceLifecycleModels;

  const { handleMenuCommand, shellLayoutProps } = useAppShellSurfaceGraphForApp({
    actions: {
      applyAutomationDesktopState,
      setError,
      setState,
    },
    activeThread,
    activeThreadModel,
    appDesktopStateAppliers,
    automationShellState,
    chatFindControls,
    composerShellState,
    composerModelPickerControls,
    conversationDisplayModel,
    coreLifecycleControls,
    credentialDialogActions,
    localDeepResearchModeControls: {
      onToggleLocalDeepResearchMode: toggleLocalDeepResearchMode,
    },
    localDeepResearchRunActive,
    messageVoiceActions,
    navigationActions,
    permissionActions,
    projectBoardControls,
    projectShellState,
    promptHistoryControls: {
      navigatePromptHistory,
      resetPromptHistory,
      shouldNavigatePromptHistory,
    },
    providerRuntimeActions,
    providerRuntimeState,
    rememberClearedGoal,
    rememberDesktopState,
    rightPanelState,
    runActivityState,
    runDerivedState: {
      activeRunActivityLines,
      running,
      thinkingDisplayMode,
    },
    running,
    securityPromptState,
    setLocalDeepResearchModeArmed,
    setState,
    shellUiState,
    sidebarSelectionModel,
    state,
    subagentParentClusterActions,
    subagentShellControls,
    subagentUiEnabled,
    voiceThreadControls,
    workflowRecorderSurface,
    workflowRecordingLibraryControls,
    workflowRecordingReviewControls,
    workflowRuntimeState,
    workspaceShellState,
  });
  if (!shellLayoutProps) return <div className="boot">Ambient</div>;

  return <AppShellLayout {...shellLayoutProps} />;
}
