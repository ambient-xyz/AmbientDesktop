import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import { isRunStatusRunning } from "../../shared/runStatus";
import type { useAppAutomationShellState } from "./AppAutomationShellState";
import { useAppChatFindControls } from "./AppChatFindControls";
import { useAppComposerModelPickerControls } from "./AppComposerModelPickerControls";
import type { useAppComposerShellState } from "./AppComposerShellState";
import { createAppLocalDeepResearchModeControls } from "./AppComposerInteractionControls";
import { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import { createAppDesktopStateMemoryControls } from "./AppDesktopStateMemoryControls";
import { GOAL_COMPLETION_CELEBRATION_MS } from "./AppGoalControls";
import { createAppNavigationActionsForApp } from "./AppNavigationActions";
import { createAppPermissionActions } from "./AppPermissionActions";
import type { useAppProjectShellState } from "./AppProjectShellState";
import { createAppPromptHistoryControls } from "./AppPromptHistoryControls";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import type { useAppRightPanelState } from "./AppRightPanelState";
import { EMPTY_RUN_ACTIVITY_LINES } from "./AppRunActivity";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppSecurityPromptState } from "./AppSecurityPromptState";
import type { useAppShellUiState } from "./AppShellUiState";
import { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";

type AppAutomationShellState = ReturnType<typeof useAppAutomationShellState>;
type AppComposerShellState = ReturnType<typeof useAppComposerShellState>;
type AppProjectShellState = ReturnType<typeof useAppProjectShellState>;
type AppProviderRuntimeState = ReturnType<typeof useAppProviderRuntimeState>;
type AppRightPanelState = ReturnType<typeof useAppRightPanelState>;
type AppRunActivityState = ReturnType<typeof useAppRunActivityState>;
type AppSecurityPromptState = ReturnType<typeof useAppSecurityPromptState>;
type AppShellUiState = ReturnType<typeof useAppShellUiState>;
type AppWorkflowRuntimeState = ReturnType<typeof useAppWorkflowRuntimeState>;
type AppWorkspaceShellState = ReturnType<typeof useAppWorkspaceShellState>;

export interface AppInteractionGraphForAppInput {
  automationShellState: AppAutomationShellState;
  closeProjectBoard: () => void;
  composerShellState: AppComposerShellState;
  projectShellState: AppProjectShellState;
  providerRuntimeState: AppProviderRuntimeState;
  rightPanelState: AppRightPanelState;
  runActivityState: AppRunActivityState;
  securityPromptState: AppSecurityPromptState;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  shellUiState: AppShellUiState;
  state: DesktopState | undefined;
  workflowRuntimeState: AppWorkflowRuntimeState;
  workspaceShellState: AppWorkspaceShellState;
}

export function useAppInteractionGraphForApp({
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
}: AppInteractionGraphForAppInput) {
  const { runStatus, setRunStatus, threadRunStatuses, setThreadRunStatuses, runActivityLinesByThread } = runActivityState;
  const { setSidebarArea, setError } = shellUiState;
  const { setWorkspaceRevision, activeThreadIdRef, activeProjectRootRef, workspaceProjectAliasesRef } = workspaceShellState;
  const {
    setPermissionRequests,
    setPrivilegedCredentialRequests,
    setSecureInputRequests,
    permissionAudit,
    setPermissionAudit,
    permissionGrants,
    setPermissionGrants,
    setPermissionAuditError,
    setPermissionGrantError,
    setPermissionGrantRevoking,
    setApiDialogOpen,
    apiKeyDraft,
    setApiKeyDraft,
    setClipboardCandidate,
    setApiKeyStatus,
    setApiKeyBusy,
    ambientCliSecretDialog,
    setAmbientCliSecretDialog,
    apiKeyInputRef,
    ambientCliSecretInputRef,
  } = securityPromptState;
  const { setSttDraftMetadata, localDeepResearchSetup } = providerRuntimeState;
  const {
    setContextError,
    setLocalDeepResearchModeArmedState,
    setLocalDeepResearchBudgetOverride,
    setSymphonyBuilderDraft,
    setGoalModeArmed,
    setGoalCompletionCelebrationId,
    latestDesktopStateRevisionRef,
    clearedGoalKeysRef,
    promptHistoryCursor,
    setPromptHistoryCursor,
    draftBeforePromptHistory,
    setDraftBeforePromptHistory,
    promptHistoryRef,
    localDeepResearchModeArmedRef,
    goalCompletionCelebrationTimerRef,
  } = workflowRuntimeState;
  const { getComposerDraft, setComposerDraft, focusComposerEnd } = composerShellState;

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
  const { applyCreatedThreadState, applyProjectActionState, applyAutomationDesktopState } = appDesktopStateAppliers;
  const workflowRecordingLibraryControls = useAppWorkflowRecordingLibraryControls({
    applyDesktopState: applyAutomationDesktopState,
    setError,
    state,
  });
  const { setSelectedWorkflowRecordingId } = workflowRecordingLibraryControls;
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
  const running = isRunStatusRunning(runStatus);
  const activeRunActivityLines = state?.activeThreadId
    ? (runActivityLinesByThread[state.activeThreadId] ?? EMPTY_RUN_ACTIVITY_LINES)
    : EMPTY_RUN_ACTIVITY_LINES;
  const thinkingDisplayMode = state?.settings.thinkingDisplay.mode ?? "transient";
  const promptHistoryControls = createAppPromptHistoryControls({
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
  const composerModelPickerControls = useAppComposerModelPickerControls({
    activeThreadId: state?.activeThreadId,
    catalogOptions: state?.settings.modelCatalog?.selectableMainModelOptions,
    selectedModelId: state?.settings.model,
  });
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
  const localDeepResearchModeControls = createAppLocalDeepResearchModeControls({
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

  function triggerGoalCompletionCelebration(messageId: string) {
    if (goalCompletionCelebrationTimerRef.current) window.clearTimeout(goalCompletionCelebrationTimerRef.current);
    setGoalCompletionCelebrationId(messageId);
    goalCompletionCelebrationTimerRef.current = window.setTimeout(() => {
      setGoalCompletionCelebrationId((current) => (current === messageId ? undefined : current));
      goalCompletionCelebrationTimerRef.current = undefined;
    }, GOAL_COMPLETION_CELEBRATION_MS);
  }

  return {
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
  };
}
