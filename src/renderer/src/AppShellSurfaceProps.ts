import type { DesktopState } from "../../shared/desktopTypes";
import type { AppActiveThreadModel } from "./AppActiveThreadModel";
import { createAppAutomationsWorkspacePropsForApp, type AppAutomationsWorkspacePropsForAppInput } from "./AppAutomationsWorkspaceProps";
import type { useAppChatFindControls } from "./AppChatFindControls";
import type { AppComposerInteractionControls } from "./AppComposerInteractionControls";
import type { useAppComposerModelPickerControls } from "./AppComposerModelPickerControls";
import { createAppComposerPropsForApp, type AppComposerPropsForAppInput } from "./AppComposerProps";
import { createAppComposerShellPropsForApp, type AppComposerShellPropsForAppInput } from "./AppComposerShellProps";
import type { useAppComposerShellState } from "./AppComposerShellState";
import { createAppConversationMessagesPropsForApp, type AppConversationMessagesPropsForAppInput } from "./AppConversationMessagesProps";
import { createAppModalHostPropsForApp, type AppModalHostPropsForAppInput } from "./AppModalHostProps";
import { createAppProjectBoardWorkspacePropsForApp, type AppProjectBoardWorkspacePropsForAppInput } from "./AppProjectBoardWorkspaceProps";
import { createAppRightPanelHostPropsForApp, type AppRightPanelHostPropsForAppInput } from "./AppRightPanelHostProps";
import type { useAppAutomationShellState } from "./AppAutomationShellState";
import type { createAppBrowserActionControls } from "./AppBrowserActionControls";
import type { createAppCapabilityPromptActions } from "./AppCapabilityPromptActions";
import type { createAppComposerRetryActions } from "./AppComposerRetryActions";
import type { useAppConversationDisplayModel } from "./AppConversationDisplayModel";
import type { createAppContextAttachmentActions } from "./AppContextAttachmentActions";
import type { useAppCoreLifecycleControls } from "./AppCoreLifecycleControls";
import type { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import type { createAppGitActions } from "./AppGitActions";
import type { createAppGoalActions } from "./AppGoalActions";
import type { createAppMessageVoiceActions } from "./AppMessageVoiceActions";
import type { createAppNavigationActionsForApp } from "./AppNavigationActions";
import type { createAppPermissionActions } from "./AppPermissionActions";
import type { createAppPlannerActions } from "./AppPlannerActions";
import type { useAppProjectBoardControlsForApp } from "./AppProjectBoardControls";
import type { useAppProjectShellState } from "./AppProjectShellState";
import type { useAppProviderRuntimeActionsForApp } from "./AppProviderRuntimeActions";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import type { useAppRightPanelState } from "./AppRightPanelState";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppSecurityPromptState } from "./AppSecurityPromptState";
import type { createAppSettingsActions } from "./AppSettingsActions";
import type { createAppShellCommandActionsForApp } from "./AppShellCommandActions";
import { createAppShellLayoutPropsForApp, type AppShellLayoutProps, type AppShellLayoutPropsForAppInput } from "./AppShellLayout";
import { createAppShellSidebarPropsForApp, type AppShellSidebarPropsForAppInput } from "./AppShellSidebarProps";
import type { useAppShellUiState } from "./AppShellUiState";
import type { useAppSidebarSelectionModel } from "./AppSidebarSelectionModel";
import type { createAppSubagentParentClusterActionsForApp } from "./AppSubagentParentClusterActions";
import type { useAppSubagentShellControls } from "./AppSubagentShellControls";
import type { createAppSymphonyBuilderControls } from "./AppSymphonyBuilderControls";
import type { createAppThreadMaintenanceActionsForApp } from "./AppThreadMaintenanceActions";
import type { createAppUpdateActions } from "./AppUpdateActions";
import type { createAppWorkflowRecordingActionsForApp } from "./AppWorkflowRecordingActions";
import type { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";
import type { createAppWorkflowRecordingPlaybookActions } from "./AppWorkflowRecordingPlaybookActions";
import type { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import type { useAppVoiceThreadControls } from "./AppVoiceThreadControls";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";

type AppBrowserActionControls = ReturnType<typeof createAppBrowserActionControls>;
type AppCapabilityPromptActions = ReturnType<typeof createAppCapabilityPromptActions>;
type AppChatFindControls = ReturnType<typeof useAppChatFindControls>;
type AppComposerModelPickerControls = ReturnType<typeof useAppComposerModelPickerControls>;
type AppComposerRetryActions = ReturnType<typeof createAppComposerRetryActions>;
type AppComposerShellState = ReturnType<typeof useAppComposerShellState>;
type AppConversationDisplayModel = ReturnType<typeof useAppConversationDisplayModel>;
type AppContextAttachmentActions = ReturnType<typeof createAppContextAttachmentActions>;
type AppCoreLifecycleControls = ReturnType<typeof useAppCoreLifecycleControls>;
type AppCredentialDialogActions = ReturnType<typeof createAppCredentialDialogActions>;
type AppGitActions = ReturnType<typeof createAppGitActions>;
type AppGoalActions = ReturnType<typeof createAppGoalActions>;
type AppMessageVoiceActions = ReturnType<typeof createAppMessageVoiceActions>;
type AppNavigationActions = ReturnType<typeof createAppNavigationActionsForApp>;
type AppPermissionActions = ReturnType<typeof createAppPermissionActions>;
type AppPlannerActions = ReturnType<typeof createAppPlannerActions>;
type AppProjectBoardControls = ReturnType<typeof useAppProjectBoardControlsForApp>;
type AppProjectShellState = ReturnType<typeof useAppProjectShellState>;
type AppProviderRuntimeActions = ReturnType<typeof useAppProviderRuntimeActionsForApp>;
type AppProviderRuntimeState = ReturnType<typeof useAppProviderRuntimeState>;
type AppRightPanelState = ReturnType<typeof useAppRightPanelState>;
type AppRunActivityState = ReturnType<typeof useAppRunActivityState>;
type AppSecurityPromptState = ReturnType<typeof useAppSecurityPromptState>;
type AppSettingsActions = ReturnType<typeof createAppSettingsActions>;
type AppShellCommandActions = ReturnType<typeof createAppShellCommandActionsForApp>;
type AppShellUiState = ReturnType<typeof useAppShellUiState>;
type AppSidebarSelectionModel = ReturnType<typeof useAppSidebarSelectionModel>;
type AppSubagentParentClusterActions = ReturnType<typeof createAppSubagentParentClusterActionsForApp>;
type AppSubagentShellControls = ReturnType<typeof useAppSubagentShellControls>;
type AppSymphonyBuilderControls = ReturnType<typeof createAppSymphonyBuilderControls>;
type AppThreadMaintenanceActions = ReturnType<typeof createAppThreadMaintenanceActionsForApp>;
type AppUpdateActions = ReturnType<typeof createAppUpdateActions>;
type AppVoiceThreadControls = ReturnType<typeof useAppVoiceThreadControls>;
type AppWorkflowRecordingActions = ReturnType<typeof createAppWorkflowRecordingActionsForApp>;
type AppWorkflowRecordingLibraryControls = ReturnType<typeof useAppWorkflowRecordingLibraryControls>;
type AppWorkflowRecordingPlaybookActions = ReturnType<typeof createAppWorkflowRecordingPlaybookActions>;
type AppWorkflowRecordingReviewControls = ReturnType<typeof useAppWorkflowRecordingReviewControls>;
type AppWorkflowRuntimeState = ReturnType<typeof useAppWorkflowRuntimeState>;
type AppWorkspaceShellState = ReturnType<typeof useAppWorkspaceShellState>;

type AppShellSurfaceActiveThreadModel = AppActiveThreadModel &
  AppComposerPropsForAppInput["activeThreadModel"] &
  AppConversationMessagesPropsForAppInput["activeThreadModel"] &
  AppShellLayoutPropsForAppInput["activeThreadModel"];

type AppShellSurfaceActions = {
  applyAutomationDesktopState: AppAutomationsWorkspacePropsForAppInput["projectActions"]["onDesktopStateChanged"];
  setError: AppShellLayoutPropsForAppInput["setError"];
  setState: AppRightPanelHostPropsForAppInput["setState"];
};

export type AppShellSurfacePropsForAppInput = {
  actions: AppShellSurfaceActions;
  activeThread: AppShellLayoutPropsForAppInput["activeThread"];
  activeThreadModel: AppShellSurfaceActiveThreadModel;
  agentMemoryControls: AppRightPanelHostPropsForAppInput["actions"]["agentMemoryControls"];
  automationShellState: ReturnType<typeof useAppAutomationShellState>;
  browserActionControls: AppBrowserActionControls;
  capabilityPromptActions: AppCapabilityPromptActions;
  chatFindControls: AppChatFindControls;
  composerInteractionControls: AppComposerInteractionControls;
  composerModelPickerControls: AppComposerModelPickerControls;
  composerRetryActions: AppComposerRetryActions;
  composerShellState: AppComposerShellState;
  contextAttachmentActions: AppContextAttachmentActions;
  conversationDisplayModel: AppConversationDisplayModel;
  coreLifecycleControls: Pick<
    AppCoreLifecycleControls,
    "handleMessagesScroll" | "jumpToLatestMessage" | "messageTailVisible" | "scrollRef" | "showScrollToBottom"
  >;
  credentialDialogActions: AppCredentialDialogActions;
  gitActions: AppGitActions;
  goalActions: AppGoalActions;
  localDeepResearchModeControls: AppComposerPropsForAppInput["localDeepResearchModeControls"];
  messageVoiceActions: AppMessageVoiceActions;
  navigationActions: AppNavigationActions;
  permissionActions: AppPermissionActions;
  plannerActions: AppPlannerActions;
  projectBoardControls: AppProjectBoardControls;
  projectShellState: AppProjectShellState;
  providerRuntimeActions: AppProviderRuntimeActions;
  providerRuntimeState: AppProviderRuntimeState;
  rightPanelState: AppRightPanelState;
  runActivityState: AppRunActivityState;
  runDerivedState: AppConversationMessagesPropsForAppInput["runDerivedState"];
  running: boolean;
  securityPromptState: AppSecurityPromptState;
  settingsActions: AppSettingsActions;
  shellCommandActions: AppShellCommandActions;
  shellUiState: AppShellUiState;
  sidebarSelectionModel: AppSidebarSelectionModel;
  state: DesktopState;
  subagentParentClusterActions: AppSubagentParentClusterActions;
  subagentShellControls: AppSubagentShellControls;
  subagentUiEnabled: AppModalHostPropsForAppInput["subagentUiEnabled"];
  symphonyBuilderControls: AppSymphonyBuilderControls;
  threadMaintenanceActions: AppThreadMaintenanceActions;
  updateActions: AppUpdateActions;
  voiceThreadControls: AppVoiceThreadControls;
  workflowRecordingActions: AppWorkflowRecordingActions;
  workflowRecordingLibraryControls: AppWorkflowRecordingLibraryControls;
  workflowRecordingPlaybookActions: AppWorkflowRecordingPlaybookActions;
  workflowRecordingReviewControls: AppWorkflowRecordingReviewControls;
  workflowRuntimeState: AppWorkflowRuntimeState;
  workspaceShellState: AppWorkspaceShellState;
};

export function createAppShellSurfacePropsForApp({
  actions,
  activeThread,
  activeThreadModel,
  agentMemoryControls,
  automationShellState,
  browserActionControls,
  capabilityPromptActions,
  chatFindControls,
  composerInteractionControls,
  composerModelPickerControls,
  composerRetryActions,
  composerShellState,
  contextAttachmentActions,
  conversationDisplayModel,
  coreLifecycleControls,
  credentialDialogActions,
  gitActions,
  goalActions,
  localDeepResearchModeControls,
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
  runDerivedState,
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
}: AppShellSurfacePropsForAppInput): AppShellLayoutProps {
  const previewActions = {
    onOpenMediaModal: shellCommandActions.openMediaPreviewModal,
    onPreviewLocalPath: rightPanelState.previewLocalFile,
    onPreviewPath: rightPanelState.previewArtifact,
  };

  const composerShellProps = createAppComposerShellPropsForApp({
    composerShellState,
    contextAttachmentActions,
    gitActions,
    goalActions,
    permissionActions,
    plannerActions,
    projectBoardControls,
    providerRuntimeActions,
    providerRuntimeState,
    rightPanelState,
    settingsActions,
    shellCommandActions,
    state,
    symphonyBuilderControls,
    threadMaintenanceActions,
    workflowRuntimeState,
  });
  const composerProps = createAppComposerPropsForApp({
    activeThreadModel,
    composerShellState,
    composerInteractionControls,
    composerModelPickerControls,
    composerShellProps,
    contextAttachmentActions,
    conversationDisplayModel,
    gitActions,
    localDeepResearchModeControls,
    projectBoardControls,
    providerRuntimeActions,
    symphonyBuilderControls,
    providerRuntimeState,
    running,
    runActivityState,
    state,
    subagentShellControls,
    workflowRecordingReviewControls,
    workflowRuntimeState,
    workspaceShellState,
  });
  const modalHostProps = createAppModalHostPropsForApp({
    activePermissionRequest: activeThreadModel.activePermissionRequest,
    activePrivilegedCredentialRequest: activeThreadModel.activePrivilegedCredentialRequest,
    activeSecureInputRequest: activeThreadModel.activeSecureInputRequest,
    actions: {
      credentialDialogActions,
      localRuntimeActions: providerRuntimeActions.localRuntimeActions,
      openSearchWebSettings: rightPanelState.openSearchWebSettings,
      permissionActions,
      previewArtifact: rightPanelState.previewArtifact,
      projectBoardActions: projectBoardControls.projectBoardActions,
      projectThreadActions: navigationActions.projectThreadActions,
      shellCommandActions,
      submitPlannerRevisionDialog: plannerActions.submitPlannerRevisionDialog,
      submitSubagentApprovalDecisionDialog: subagentParentClusterActions.submitSubagentApprovalDecisionDialog,
      submitSubagentBarrierDecisionDialog: subagentParentClusterActions.submitSubagentBarrierDecisionDialog,
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
    automationFolderControls: navigationActions.automationFolderControls,
    automationSelectionControls: navigationActions.automationSelectionControls,
    automationShellState,
    permissionActions,
    permissions: {
      permissionAudit: securityPromptState.permissionAudit,
      permissionGrantRevoking: securityPromptState.permissionGrantRevoking,
      permissionGrants: securityPromptState.permissionGrants,
    },
    previewActions,
    projectActions: {
      onCreateProject: navigationActions.createWorkspace,
      onDesktopStateChanged: actions.applyAutomationDesktopState,
    },
    selected: {
      selectedFolder: sidebarSelectionModel.selectedAutomationFolder,
      selectedThread: sidebarSelectionModel.selectedAutomationThread,
      selectedWorkflowAgentFolder: sidebarSelectionModel.selectedWorkflowAgentFolder,
      selectedWorkflowAgentThread: sidebarSelectionModel.selectedWorkflowAgentThread,
      selectedWorkflowRecording: workflowRecordingLibraryControls.selectedWorkflowRecording,
    },
    state,
    workflowRecordingActions,
    workflowRecordingLibraryControls,
    workflowRecordingPlaybookActions,
    workflowRuntimeState,
  });
  const projectBoardWorkspaceProps = createAppProjectBoardWorkspacePropsForApp({
    projectBoardControls,
    projectShellState,
    runActivityState,
    workflowRuntimeState,
  });
  const conversationMessagesProps = createAppConversationMessagesPropsForApp({
    activeThreadModel,
    browserActionControls,
    capabilityPromptActions,
    chatFindControls,
    composerRetryActions,
    conversationDisplayModel,
    coreLifecycleControls,
    credentialDialogActions,
    messageVoiceActions,
    plannerActions,
    previewActions,
    projectBoardControls,
    rightPanelState,
    runActivityState,
    runDerivedState,
    shellUiState,
    setState: actions.setState,
    state,
    subagentParentClusterActions,
    subagentShellControls,
    threadMaintenanceActions,
    voiceThreadControls,
    workflowRecordingActions,
    workflowRecordingReviewControls,
    workflowRuntimeState,
    workspaceNavigationControls: navigationActions.workspaceNavigationControls,
    workspaceShellState,
  });
  const sidebarProps = createAppShellSidebarPropsForApp({
    automationShellState,
    beginSidebarResize: shellCommandActions.beginSidebarResize,
    exportChatPdfThread: threadMaintenanceActions.exportChatPdfThread,
    navigationActions,
    projectBoardControls,
    projectShellState,
    rightPanelState,
    runActivityState,
    selectionModel: sidebarSelectionModel,
    selectedWorkflowRecordingId: workflowRecordingLibraryControls.selectedWorkflowRecordingId,
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
      navigationActions: { selectThread: navigationActions.selectThread },
      permissionActions,
      providerRuntimeActions,
      settingsActions,
      shellCommandActions,
      threadMaintenanceActions,
      updateActions,
    },
    onBeginResize: shellCommandActions.beginRightPanelResize,
    providerRuntimeState,
    rightPanelState,
    running,
    securityPromptState,
    setState: actions.setState,
    shellUiState,
    state,
    workflowRuntimeState,
    workspaceShellState,
  });

  return createAppShellLayoutPropsForApp({
    activeThreadModel,
    activeProjectBoardTopbarAction: projectBoardControls.activeProjectBoardTopbarAction,
    activeThread,
    automationsWorkspaceProps,
    beginWorkflowRecorderReviewResize: shellCommandActions.beginWorkflowRecorderReviewResize,
    composerInputRef: composerShellState.composerInputRef,
    composerProps,
    confirmActiveWorkflowRecordingReview: workflowRecordingActions.confirmActiveWorkflowRecordingReview,
    conversationMessagesProps,
    modalHostProps,
    openApiKeyDialog: credentialDialogActions.openApiKeyDialog,
    openGitSummaryPanel: rightPanelState.openGitSummaryPanel,
    projectBoardWorkspaceProps,
    rightPanelState,
    rightPanelHostProps,
    running,
    selectedWorkflowAgentFolder: sidebarSelectionModel.selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread: sidebarSelectionModel.selectedWorkflowAgentThread,
    sendWorkflowRecordingReviewPrompt: workflowRecordingActions.sendWorkflowRecordingReviewPrompt,
    setError: actions.setError,
    shellUiState,
    sidebarProps,
    state,
    updateActions,
    updateActiveWorkflowRecordingReview: workflowRecordingActions.updateActiveWorkflowRecordingReview,
    updateThreadSettings: shellCommandActions.updateThreadSettings,
    workflowRecordingReviewControls,
    workspaceShellState,
    applyLatestWorkflowRecordingSummary: workflowRecordingActions.applyLatestWorkflowRecordingSummary,
  });
}
