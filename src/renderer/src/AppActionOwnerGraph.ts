import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { useAppAgentMemoryPanelControls } from "./AppAgentMemoryControls";
import type { useAppAutomationShellState } from "./AppAutomationShellState";
import { createAppBrowserActionControls } from "./AppBrowserActionControls";
import { createAppCapabilityPromptActions } from "./AppCapabilityPromptActions";
import { createAppComposerRetryActions } from "./AppComposerRetryActions";
import { createAppComposerSubmitActionsForApp } from "./AppComposerSubmitActions";
import {
  createAppComposerInteractionControls,
  createAppPendingSubmittedPromptControls,
} from "./AppComposerInteractionControls";
import type { useAppComposerShellState } from "./AppComposerShellState";
import { createAppContextAttachmentActions } from "./AppContextAttachmentActions";
import type { useAppConversationDisplayModel } from "./AppConversationDisplayModel";
import type { useAppCoreLifecycleControlsForApp } from "./AppCoreLifecycleControls";
import type { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import type { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import type { createAppDesktopStateMemoryControls } from "./AppDesktopStateMemoryControls";
import { createAppGitActions } from "./AppGitActions";
import { createAppGoalActions, parseGoalBudgetPromptValue } from "./AppGoalActions";
import type { createAppNavigationActionsForApp } from "./AppNavigationActions";
import { createAppPlannerActions } from "./AppPlannerActions";
import type { useAppProjectBoardControlsForApp } from "./AppProjectBoardControls";
import type { useAppProjectShellState } from "./AppProjectShellState";
import { createAppSettingsActions } from "./AppSettingsActions";
import { createAppShellCommandActionsForApp } from "./AppShellCommandActions";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import type { createAppPromptHistoryControls } from "./AppPromptHistoryControls";
import type { useAppRightPanelState } from "./AppRightPanelState";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppShellUiState } from "./AppShellUiState";
import type { useAppSubagentShellControls } from "./AppSubagentShellControls";
import { createAppSymphonyBuilderControls } from "./AppSymphonyBuilderControls";
import { createAppThreadMaintenanceActionsForApp } from "./AppThreadMaintenanceActions";
import { createAppUpdateActions } from "./AppUpdateActions";
import { createAppWorkflowRecordingActionsForApp } from "./AppWorkflowRecordingActions";
import type { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";
import { createAppWorkflowRecordingPlaybookActions } from "./AppWorkflowRecordingPlaybookActions";
import type { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";
import type { workflowRecorderSurface } from "./AutomationsWorkspace";

type AppComposerShellState = ReturnType<typeof useAppComposerShellState>;
type AppAutomationShellState = ReturnType<typeof useAppAutomationShellState>;
type AppConversationDisplayModel = ReturnType<typeof useAppConversationDisplayModel>;
type AppCoreLifecycleControls = ReturnType<typeof useAppCoreLifecycleControlsForApp>;
type AppCredentialDialogActions = ReturnType<typeof createAppCredentialDialogActions>;
type AppDesktopStateAppliers = ReturnType<typeof createAppDesktopStateAppliers>;
type AppDesktopStateMemoryControls = ReturnType<typeof createAppDesktopStateMemoryControls>;
type AppNavigationActions = ReturnType<typeof createAppNavigationActionsForApp>;
type AppProjectBoardControls = ReturnType<typeof useAppProjectBoardControlsForApp>;
type AppProjectShellState = ReturnType<typeof useAppProjectShellState>;
type AppPromptHistoryControls = ReturnType<typeof createAppPromptHistoryControls>;
type AppProviderRuntimeState = ReturnType<typeof useAppProviderRuntimeState>;
type AppRightPanelState = ReturnType<typeof useAppRightPanelState>;
type AppRunActivityState = ReturnType<typeof useAppRunActivityState>;
type AppShellUiState = ReturnType<typeof useAppShellUiState>;
type AppSubagentShellControls = ReturnType<typeof useAppSubagentShellControls>;
type AppWorkflowRecordingLibraryControls = ReturnType<typeof useAppWorkflowRecordingLibraryControls>;
type AppWorkflowRecordingReviewControls = ReturnType<typeof useAppWorkflowRecordingReviewControls>;
type AppWorkflowRuntimeState = ReturnType<typeof useAppWorkflowRuntimeState>;
type AppWorkspaceShellState = ReturnType<typeof useAppWorkspaceShellState>;
type WorkflowRecorderSurface = typeof workflowRecorderSurface;

export interface AppActionOwnerGraphForAppInput {
  activeThread: ThreadSummary | undefined;
  appDesktopStateAppliers: AppDesktopStateAppliers;
  automationShellState: AppAutomationShellState;
  composerShellState: AppComposerShellState;
  conversationDisplayModel: AppConversationDisplayModel;
  coreLifecycleControls: AppCoreLifecycleControls;
  credentialDialogActions: AppCredentialDialogActions;
  localDeepResearchRunActive: boolean;
  navigationActions: AppNavigationActions;
  projectBoardControls: AppProjectBoardControls;
  projectShellState: AppProjectShellState;
  promptHistoryControls: AppPromptHistoryControls;
  providerRuntimeState: AppProviderRuntimeState;
  rememberClearedGoal: AppDesktopStateMemoryControls["rememberClearedGoal"];
  rememberDesktopState: AppDesktopStateMemoryControls["rememberDesktopState"];
  rightPanelState: AppRightPanelState;
  runActivityState: AppRunActivityState;
  running: boolean;
  setLocalDeepResearchModeArmed: (next: boolean) => void;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  shellUiState: AppShellUiState;
  state: DesktopState | undefined;
  subagentShellControls: AppSubagentShellControls;
  subagentUiEnabled: boolean;
  workflowRecorderSurface: Pick<WorkflowRecorderSurface, "navLabel">;
  workflowRecordingLibraryControls: AppWorkflowRecordingLibraryControls;
  workflowRecordingReviewControls: AppWorkflowRecordingReviewControls;
  workflowRuntimeState: AppWorkflowRuntimeState;
  workspaceShellState: AppWorkspaceShellState;
}

export function useAppActionOwnerGraphForApp({
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
  promptHistoryControls,
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
}: AppActionOwnerGraphForAppInput) {
  const workflowRecordingActions = createAppWorkflowRecordingActionsForApp({
    activeThread,
    appDesktopStateAppliers,
    composerShellState,
    coreLifecycleControls: {
      resetRunActivityLines: coreLifecycleControls.resetRunActivityLines,
    },
    projectBoardControls,
    resetPromptHistory: promptHistoryControls.resetPromptHistory,
    runActivityState,
    running,
    shellUiState,
    state,
    workflowRecordingLibraryControls,
    workflowRuntimeState,
  });
  const workflowRecordingPlaybookActions = createAppWorkflowRecordingPlaybookActions({
    closeProjectBoard: () => projectBoardControls.setProjectBoardOpen(false),
    previewLocalFile: rightPanelState.previewLocalFile,
    setAutomationPopover: automationShellState.setAutomationPopover,
    setBrowserRevision: workspaceShellState.setBrowserRevision,
    setError: shellUiState.setError,
    setPendingProjectComposerDraft: workflowRuntimeState.setPendingProjectComposerDraft,
    setPendingWorkflowRecordingEditContext: workflowRuntimeState.setPendingWorkflowRecordingEditContext,
    setProjectPopover: projectShellState.setProjectPopover,
    setRightPanel: rightPanelState.setRightPanel,
    setSelectedAutomationThreadId: automationShellState.setSelectedAutomationThreadId,
    setSelectedWorkflowAgentThreadId: automationShellState.setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId: workflowRecordingLibraryControls.setSelectedWorkflowRecordingId,
    setSidebarArea: shellUiState.setSidebarArea,
  });
  const updateActions = createAppUpdateActions({
    setError: shellUiState.setError,
    setState,
    setUpdateBusy: shellUiState.setUpdateBusy,
    setUpdatePopoverOpen: shellUiState.setUpdatePopoverOpen,
  });
  const settingsActions = createAppSettingsActions({
    setLocalDeepResearchSetup: providerRuntimeState.setLocalDeepResearchSetup,
    setSearchRoutingHydrationError: shellUiState.setSearchRoutingHydrationError,
    setSearchRoutingHydrating: shellUiState.setSearchRoutingHydrating,
    setState,
    state,
  });
  const agentMemoryControls = useAppAgentMemoryPanelControls({
    activeThreadMemoryEnabled: Boolean(activeThread?.memoryEnabled),
    panel: rightPanelState.rightPanel,
    providerRuntimeState,
    state,
  });
  const browserActionControls = createAppBrowserActionControls({
    appendRunActivityLine: coreLifecycleControls.appendRunActivityLine,
    chatBrowserUserAction: workspaceShellState.chatBrowserUserAction,
    resetRunActivityLines: coreLifecycleControls.resetRunActivityLines,
    running,
    setBrowserRevision: workspaceShellState.setBrowserRevision,
    setChatBrowserUserAction: workspaceShellState.setChatBrowserUserAction,
    setChatBrowserUserActionBusy: workspaceShellState.setChatBrowserUserActionBusy,
    setError: shellUiState.setError,
    setRightPanel: rightPanelState.setRightPanel,
    setRunStatus: runActivityState.setRunStatus,
    setThreadRunStatuses: runActivityState.setThreadRunStatuses,
    state,
  });
  const composerRetryActions = createAppComposerRetryActions({
    resetPromptHistory: promptHistoryControls.resetPromptHistory,
    resetRunActivityLines: coreLifecycleControls.resetRunActivityLines,
    running,
    setContextAttachments: workflowRuntimeState.setContextAttachments,
    setContextError: workflowRuntimeState.setContextError,
    setError: shellUiState.setError,
    setRunStatus: runActivityState.setRunStatus,
    setThreadRunStatuses: runActivityState.setThreadRunStatuses,
    state,
  });
  const threadMaintenanceActions = createAppThreadMaintenanceActionsForApp({
    appDesktopStateAppliers,
    composerRetryActions,
    conversationDisplayModel,
    coreLifecycleControls,
    navigationActions,
    runActivityState,
    running,
    setState,
    shellUiState,
    state,
    workflowRuntimeState,
  });
  const shellCommandActions = createAppShellCommandActionsForApp({
    credentialDialogActions,
    navigationActions,
    rightPanelState,
    state,
    setState,
    shellUiState,
    threadMaintenanceActions,
    workflowRecorderNavLabel: workflowRecorderSurface.navLabel,
  });
  const gitActions = createAppGitActions({
    activeWorkspacePath: state?.activeWorkspace.path,
    gitStatus: workspaceShellState.gitStatus,
    setActiveGitReview: workspaceShellState.setActiveGitReview,
    setActiveGitReviewError: workspaceShellState.setActiveGitReviewError,
    setGitConfirmation: workspaceShellState.setGitConfirmation,
    setGitStatus: workspaceShellState.setGitStatus,
    setGitStatusError: workspaceShellState.setGitStatusError,
    setWorkspaceRevision: workspaceShellState.setWorkspaceRevision,
    workspacePath: state?.workspace.path,
  });
  const contextAttachmentActions = createAppContextAttachmentActions({
    allowExternalContext: state?.settings.permissionMode === "full-access",
    openAttachmentsPanel: () => rightPanelState.openPanel("attachments"),
    setContextAttachments: workflowRuntimeState.setContextAttachments,
    setContextError: workflowRuntimeState.setContextError,
  });
  const baseGoalActions = createAppGoalActions({
    goalModeArmed: workflowRuntimeState.goalModeArmed,
    onGoalCleared: rememberClearedGoal,
    setError: shellUiState.setError,
    setGoalBusy: workflowRuntimeState.setGoalBusy,
    setGoalMenuOpen: workflowRuntimeState.setGoalMenuOpen,
    setGoalModeArmed: workflowRuntimeState.setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setSymphonyBuilderOpen: (open) => {
      workflowRuntimeState.setSymphonyBuilderDraft((current) => (current.open === open ? current : { ...current, open }));
    },
    setState,
    state,
  });
  function openGoalBudgetDialog(): void {
    const goal = state?.activeThreadGoal;
    if (!goal) return;
    workflowRuntimeState.setGoalBudgetDialog({
      goalId: goal.goalId,
      objective: goal.objective,
      value: goal.tokenBudget?.toString() ?? "",
    });
    workflowRuntimeState.setGoalMenuOpen(false);
  }

  function updateGoalBudgetDialogValue(value: string): void {
    workflowRuntimeState.setGoalBudgetDialog((current) =>
      current ? { ...current, value, error: undefined } : current,
    );
  }

  function cancelGoalBudgetDialog(): void {
    if (!workflowRuntimeState.goalBudgetDialog?.busy) {
      workflowRuntimeState.setGoalBudgetDialog(undefined);
    }
  }

  async function submitGoalBudgetDialog(): Promise<void> {
    const dialog = workflowRuntimeState.goalBudgetDialog;
    if (!dialog || dialog.busy) return;
    const parsed = parseGoalBudgetPromptValue(dialog.value);
    if (parsed.kind === "invalid") {
      workflowRuntimeState.setGoalBudgetDialog((current) =>
        current ? { ...current, error: parsed.message } : current,
      );
      return;
    }
    workflowRuntimeState.setGoalBudgetDialog((current) =>
      current ? { ...current, busy: true, error: undefined } : current,
    );
    const applied = await baseGoalActions.setActiveGoalBudget(dialog.value);
    if (applied) {
      workflowRuntimeState.setGoalBudgetDialog(undefined);
      return;
    }
    workflowRuntimeState.setGoalBudgetDialog((current) =>
      current ? { ...current, busy: false, error: "Could not update goal budget." } : current,
    );
  }

  const goalActions = {
    ...baseGoalActions,
    cancelGoalBudgetDialog,
    openGoalBudgetDialog,
    submitGoalBudgetDialog,
    updateGoalBudgetDialogValue,
  };
  const pendingSubmittedPromptControls = createAppPendingSubmittedPromptControls({
    state,
    setPendingSubmittedPrompts: workflowRuntimeState.setPendingSubmittedPrompts,
  });
  const { submitComposerDraft, submitDraft } = createAppComposerSubmitActionsForApp({
    activeThread,
    composerShellState,
    coreLifecycleControls,
    credentialDialogActions,
    localDeepResearchRunActive,
    pendingSubmittedPromptControls,
    providerRuntimeState,
    resetPromptHistory: promptHistoryControls.resetPromptHistory,
    runActivityState,
    running,
    setLocalDeepResearchModeArmed,
    shellCommandActions,
    shellUiState,
    state,
    threadMaintenanceActions,
    workflowRecordingReviewControls,
    workflowRuntimeState,
  });
  const capabilityPromptActions = createAppCapabilityPromptActions({
    applyCreatedThreadState: appDesktopStateAppliers.applyCreatedThreadState,
    resetPromptHistory: promptHistoryControls.resetPromptHistory,
    resetRunActivityLines: coreLifecycleControls.resetRunActivityLines,
    running,
    setContextAttachments: workflowRuntimeState.setContextAttachments,
    setContextError: workflowRuntimeState.setContextError,
    setError: shellUiState.setError,
    setRunStatus: runActivityState.setRunStatus,
    setThreadRunStatuses: runActivityState.setThreadRunStatuses,
    state,
  });
  const plannerActions = createAppPlannerActions({
    getComposerDraft: composerShellState.getComposerDraft,
    plannerRevisionDialog: projectShellState.plannerRevisionDialog,
    resetRunActivityLines: coreLifecycleControls.resetRunActivityLines,
    running,
    setComposerDraft: composerShellState.setComposerDraft,
    setContextError: workflowRuntimeState.setContextError,
    setError: shellUiState.setError,
    setPlannerRevisionDialog: projectShellState.setPlannerRevisionDialog,
    setRunStatus: runActivityState.setRunStatus,
    setState,
    setThreadRunStatuses: runActivityState.setThreadRunStatuses,
    state,
    updateThreadSettings: shellCommandActions.updateThreadSettings,
  });
  const symphonyBuilderControls = createAppSymphonyBuilderControls({
    appendRunActivityLine: coreLifecycleControls.appendRunActivityLine,
    focusComposerEnd: () => composerShellState.composerInputRef.current?.focusEnd(),
    getComposerDraft: composerShellState.getComposerDraft,
    rememberDesktopState,
    refreshWorkflowRecordingLibraryOverride: workflowRecordingLibraryControls.refreshWorkflowRecordingLibraryOverride,
    setContextError: workflowRuntimeState.setContextError,
    setError: shellUiState.setError,
    setGoalModeArmed: workflowRuntimeState.setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setState,
    setSymphonyBuilderActionBusy: workflowRuntimeState.setSymphonyBuilderActionBusy,
    setSymphonyBuilderDraft: workflowRuntimeState.setSymphonyBuilderDraft,
    state,
    submitDraft,
    subagentUiEnabled,
    symphonyBuilderActionBusy: workflowRuntimeState.symphonyBuilderActionBusy,
    symphonyBuilderDraft: workflowRuntimeState.symphonyBuilderDraft,
    symphonyBuilderModel: subagentShellControls.symphonyBuilderModel,
  });
  const composerInteractionControls = createAppComposerInteractionControls({
    focusComposerEnd: composerShellState.focusComposerEnd,
    getComposerDraft: composerShellState.getComposerDraft,
    goalModeArmed: workflowRuntimeState.goalModeArmed,
    localDeepResearchModeArmedRef: workflowRuntimeState.localDeepResearchModeArmedRef,
    navigatePromptHistory: promptHistoryControls.navigatePromptHistory,
    pendingWorkflowRecordingEditContext: workflowRuntimeState.pendingWorkflowRecordingEditContext,
    resetPromptHistory: promptHistoryControls.resetPromptHistory,
    running,
    selectedSlashCommandRef: composerShellState.selectedSlashCommandRef,
    setComposerDraft: composerShellState.setComposerDraft,
    setContextError: workflowRuntimeState.setContextError,
    setLocalDeepResearchModeArmed,
    setPendingWorkflowRecordingEditContext: workflowRuntimeState.setPendingWorkflowRecordingEditContext,
    setSelectedSlashCommand: composerShellState.setSelectedSlashCommand,
    setSttDraftMetadata: providerRuntimeState.setSttDraftMetadata,
    shouldNavigatePromptHistory: promptHistoryControls.shouldNavigatePromptHistory,
    state,
    sttDraftMetadata: providerRuntimeState.sttDraftMetadata,
    subagentUiEnabled,
    submitComposerDraft,
    submitSymphonyComposerPrompt: symphonyBuilderControls.submitSymphonyComposerPrompt,
    symphonyBuilderOpen: workflowRuntimeState.symphonyBuilderDraft.open,
    updateComposerDraftValue: composerShellState.updateComposerDraftValue,
    workflowRecordingReviewFeedbackActive: workflowRecordingReviewControls.workflowRecordingReviewFeedbackActive,
  });

  return {
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
  };
}
