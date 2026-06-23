import type { AppComposerShellProps } from "./AppComposerShell";
import type { useAppActiveThreadModel } from "./AppActiveThreadModel";
import type { AppConversationDisplayModel } from "./AppConversationDisplayModel";
import type { createAppContextAttachmentActions } from "./AppContextAttachmentActions";
import type { AppComposerInteractionControls } from "./AppComposerInteractionControls";
import type { useAppComposerModelPickerControls } from "./AppComposerModelPickerControls";
import type { useAppComposerShellState } from "./AppComposerShellState";
import type { createAppComposerShellProps } from "./AppComposerShellProps";
import type { createAppGitActions } from "./AppGitActions";
import type { useAppProjectBoardControlsForApp } from "./AppProjectBoardControls";
import type { createAppSymphonyBuilderControls } from "./AppSymphonyBuilderControls";
import type { useAppProviderRuntimeActionsForApp } from "./AppProviderRuntimeActions";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppSubagentShellControls } from "./AppSubagentShellControls";
import type { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";

type AppComposerProps = AppComposerShellProps;
type AppComposerShellState = ReturnType<typeof useAppComposerShellState>;
type AppComposerModelPickerControls = ReturnType<typeof useAppComposerModelPickerControls>;
type AppComposerShellAdapterProps = ReturnType<typeof createAppComposerShellProps>;
type AppSymphonyBuilderControls = ReturnType<typeof createAppSymphonyBuilderControls>;
type AppProviderRuntimeState = ReturnType<typeof useAppProviderRuntimeState>;
type AppWorkflowRuntimeState = ReturnType<typeof useAppWorkflowRuntimeState>;
type AppWorkspaceShellState = ReturnType<typeof useAppWorkspaceShellState>;
type AppActiveThreadModelForComposerProps = Pick<
  ReturnType<typeof useAppActiveThreadModel>,
  "localDeepResearchReady" | "localDeepResearchRunActive" | "localDeepResearchRunBudget"
>;
type AppContextAttachmentActionsForComposerProps = Pick<
  ReturnType<typeof createAppContextAttachmentActions>,
  "clearContextAttachments" | "removeContextAttachment"
>;
type AppGitActionsForComposerProps = Pick<
  ReturnType<typeof createAppGitActions>,
  "createBranchFromFooter" | "createThreadWorktreeFromFooter"
>;
type AppProjectBoardControlsForComposerProps = Pick<
  ReturnType<typeof useAppProjectBoardControlsForApp>,
  | "activeThreadSuppressesProjectBoard"
  | "projectBoardPlanPickerOpen"
  | "projectBoardThreadPlanAction"
  | "readyPlannerPlanArtifacts"
  | "sessionContextMissing"
>;
type AppProviderRuntimeActionsForComposerProps = Pick<
  ReturnType<typeof useAppProviderRuntimeActionsForApp>,
  "cancelSttComposerRecording" | "discardSttComposerResult"
>;
type AppRunActivityStateForComposerProps = Pick<ReturnType<typeof useAppRunActivityState>, "abortArmed">;
type AppSubagentShellControlsForComposerProps = Pick<ReturnType<typeof useAppSubagentShellControls>, "symphonyBuilderModel">;
type AppWorkflowRecordingReviewControlsForComposerProps = Pick<
  ReturnType<typeof useAppWorkflowRecordingReviewControls>,
  "workflowRecordingReviewFeedbackActive"
>;

export type AppComposerPropsInput = {
  abortArmed: AppComposerProps["abortArmed"];
  activeThreadSuppressesProjectBoard: AppComposerProps["activeThreadSuppressesProjectBoard"];
  canRetryContextRecovery: AppComposerProps["canRetryContextRecovery"];
  composerInteractionControls: AppComposerInteractionControls;
  composerModelPickerControls: AppComposerModelPickerControls;
  composerShellProps: AppComposerShellAdapterProps;
  composerShellState: Pick<AppComposerShellState, "composerCanSubmit" | "composerDraftStore" | "composerInputRef" | "selectedSlashCommand">;
  localDeepResearchReady: AppComposerProps["localDeepResearchReady"];
  localDeepResearchRunActive: AppComposerProps["localDeepResearchRunActive"];
  localDeepResearchRunBudget: AppComposerProps["localDeepResearchRunBudget"];
  onCancelSttComposerRecording: AppComposerProps["onCancelSttComposerRecording"];
  onClearContextAttachments: AppComposerProps["onClearContextAttachments"];
  onCreateBranch: AppComposerProps["onCreateBranch"];
  onCreateThreadWorktree: AppComposerProps["onCreateThreadWorktree"];
  onDiscardSttComposerResult: AppComposerProps["onDiscardSttComposerResult"];
  onRemoveContextAttachment: AppComposerProps["onRemoveContextAttachment"];
  onToggleLocalDeepResearchMode: AppComposerProps["onToggleLocalDeepResearchMode"];
  projectBoardPlanPickerOpen: AppComposerProps["projectBoardPlanPickerOpen"];
  projectBoardThreadPlanAction: AppComposerProps["projectBoardThreadPlanAction"];
  providerRuntimeState: Pick<AppProviderRuntimeState, "sttComposer">;
  readyPlannerPlanArtifacts: AppComposerProps["readyPlannerPlanArtifacts"];
  running: AppComposerProps["running"];
  sessionContextMissing: AppComposerProps["sessionContextMissing"];
  state: AppComposerProps["state"];
  symphonyBuilderControls: AppSymphonyBuilderControls;
  symphonyBuilderModel: AppComposerProps["symphonyBuilderModel"];
  workflowRecordingReviewFeedbackActive: AppComposerProps["workflowRecordingReviewFeedbackActive"];
  workflowRuntimeState: Pick<
    AppWorkflowRuntimeState,
    | "chatExportBusy"
    | "chatExportStatus"
    | "contextAttachments"
    | "contextError"
    | "contextRecoveryBusy"
    | "goalBusy"
    | "goalMenuOpen"
    | "goalModeArmed"
    | "localDeepResearchModeArmed"
    | "symphonyBuilderActionBusy"
    | "symphonyBuilderDraft"
  >;
  workspaceShellState: Pick<AppWorkspaceShellState, "activeGitReview" | "activeGitReviewError" | "gitStatus" | "gitStatusError">;
};

export type AppComposerPropsForAppInput = {
  activeThreadModel: AppActiveThreadModelForComposerProps;
  composerInteractionControls: AppComposerInteractionControls;
  composerModelPickerControls: AppComposerModelPickerControls;
  composerShellProps: AppComposerShellAdapterProps;
  composerShellState: AppComposerPropsInput["composerShellState"];
  contextAttachmentActions: AppContextAttachmentActionsForComposerProps;
  conversationDisplayModel: Pick<AppConversationDisplayModel, "latestRecoveryPrompt">;
  gitActions: AppGitActionsForComposerProps;
  localDeepResearchModeControls: Pick<AppComposerPropsInput, "onToggleLocalDeepResearchMode">;
  projectBoardControls: AppProjectBoardControlsForComposerProps;
  providerRuntimeActions: AppProviderRuntimeActionsForComposerProps;
  providerRuntimeState: AppComposerPropsInput["providerRuntimeState"];
  running: boolean;
  runActivityState: AppRunActivityStateForComposerProps;
  state: AppComposerProps["state"];
  subagentShellControls: AppSubagentShellControlsForComposerProps;
  symphonyBuilderControls: AppSymphonyBuilderControls;
  workflowRecordingReviewControls: AppWorkflowRecordingReviewControlsForComposerProps;
  workflowRuntimeState: AppComposerPropsInput["workflowRuntimeState"];
  workspaceShellState: AppComposerPropsInput["workspaceShellState"];
};

export function createAppComposerPropsForApp({
  activeThreadModel,
  composerInteractionControls,
  composerModelPickerControls,
  composerShellProps,
  composerShellState,
  contextAttachmentActions,
  conversationDisplayModel,
  gitActions,
  localDeepResearchModeControls,
  projectBoardControls,
  providerRuntimeActions,
  providerRuntimeState,
  running,
  runActivityState,
  state,
  subagentShellControls,
  symphonyBuilderControls,
  workflowRecordingReviewControls,
  workflowRuntimeState,
  workspaceShellState,
}: AppComposerPropsForAppInput): AppComposerProps {
  return createAppComposerProps({
    abortArmed: runActivityState.abortArmed,
    activeThreadSuppressesProjectBoard: projectBoardControls.activeThreadSuppressesProjectBoard,
    canRetryContextRecovery: Boolean(conversationDisplayModel.latestRecoveryPrompt),
    composerInteractionControls,
    composerModelPickerControls,
    composerShellProps,
    composerShellState,
    localDeepResearchReady: activeThreadModel.localDeepResearchReady,
    localDeepResearchRunActive: activeThreadModel.localDeepResearchRunActive,
    localDeepResearchRunBudget: activeThreadModel.localDeepResearchRunBudget,
    onCancelSttComposerRecording: providerRuntimeActions.cancelSttComposerRecording,
    onClearContextAttachments: contextAttachmentActions.clearContextAttachments,
    onCreateBranch: gitActions.createBranchFromFooter,
    onCreateThreadWorktree: gitActions.createThreadWorktreeFromFooter,
    onDiscardSttComposerResult: providerRuntimeActions.discardSttComposerResult,
    onRemoveContextAttachment: contextAttachmentActions.removeContextAttachment,
    onToggleLocalDeepResearchMode: localDeepResearchModeControls.onToggleLocalDeepResearchMode,
    projectBoardPlanPickerOpen: projectBoardControls.projectBoardPlanPickerOpen,
    projectBoardThreadPlanAction: projectBoardControls.projectBoardThreadPlanAction,
    providerRuntimeState,
    readyPlannerPlanArtifacts: projectBoardControls.readyPlannerPlanArtifacts,
    running,
    sessionContextMissing: projectBoardControls.sessionContextMissing,
    state,
    symphonyBuilderControls,
    symphonyBuilderModel: subagentShellControls.symphonyBuilderModel,
    workflowRecordingReviewFeedbackActive: workflowRecordingReviewControls.workflowRecordingReviewFeedbackActive,
    workflowRuntimeState,
    workspaceShellState,
  });
}

export function createAppComposerProps({
  abortArmed,
  activeThreadSuppressesProjectBoard,
  canRetryContextRecovery,
  composerInteractionControls,
  composerModelPickerControls,
  composerShellProps,
  composerShellState,
  localDeepResearchReady,
  localDeepResearchRunActive,
  localDeepResearchRunBudget,
  onCancelSttComposerRecording,
  onClearContextAttachments,
  onCreateBranch,
  onCreateThreadWorktree,
  onDiscardSttComposerResult,
  onRemoveContextAttachment,
  onToggleLocalDeepResearchMode,
  projectBoardPlanPickerOpen,
  projectBoardThreadPlanAction,
  providerRuntimeState,
  readyPlannerPlanArtifacts,
  running,
  sessionContextMissing,
  state,
  symphonyBuilderControls,
  symphonyBuilderModel,
  workflowRecordingReviewFeedbackActive,
  workflowRuntimeState,
  workspaceShellState,
}: AppComposerPropsInput): AppComposerProps {
  return {
    state,
    composerInputRef: composerShellState.composerInputRef,
    composerDraftStore: composerShellState.composerDraftStore,
    composerCanSubmit: composerShellState.composerCanSubmit,
    selectedSlashCommand: composerShellState.selectedSlashCommand,
    running,
    abortArmed,
    workflowRecordingReviewFeedbackActive,
    symphonyBuilderModel,
    symphonyBuilderDraft: workflowRuntimeState.symphonyBuilderDraft,
    symphonyBuilderActionBusy: workflowRuntimeState.symphonyBuilderActionBusy,
    contextAttachments: workflowRuntimeState.contextAttachments,
    contextError: workflowRuntimeState.contextError,
    sessionContextMissing,
    contextRecoveryBusy: workflowRuntimeState.contextRecoveryBusy,
    canRetryContextRecovery,
    chatExportStatus: workflowRuntimeState.chatExportStatus,
    chatExportBusy: workflowRuntimeState.chatExportBusy,
    sttComposer: providerRuntimeState.sttComposer,
    localDeepResearchReady,
    localDeepResearchRunActive,
    localDeepResearchModeArmed: workflowRuntimeState.localDeepResearchModeArmed,
    localDeepResearchRunBudget,
    goalModeArmed: workflowRuntimeState.goalModeArmed,
    goalBusy: workflowRuntimeState.goalBusy,
    activeThreadSuppressesProjectBoard,
    projectBoardThreadPlanAction,
    projectBoardPlanPickerOpen,
    readyPlannerPlanArtifacts,
    modelPickerRef: composerModelPickerControls.modelPickerRef,
    modelPickerButtonRef: composerModelPickerControls.modelPickerButtonRef,
    modelPickerOpen: composerModelPickerControls.modelPickerOpen,
    composerModelOptions: composerModelPickerControls.composerModelOptions,
    selectedComposerModelOption: composerModelPickerControls.selectedComposerModelOption,
    activeGitReview: workspaceShellState.activeGitReview,
    activeGitReviewError: workspaceShellState.activeGitReviewError,
    gitStatus: workspaceShellState.gitStatus,
    gitStatusError: workspaceShellState.gitStatusError,
    goalMenuOpen: workflowRuntimeState.goalMenuOpen,
    onSubmit: composerInteractionControls.submit,
    onComposerChange: composerInteractionControls.handleComposerChange,
    onComposerPaste: composerInteractionControls.handleComposerPaste,
    onComposerKeyDown: composerInteractionControls.handleComposerKeyDown,
    onSelectSlashCommandEntry: composerInteractionControls.selectSlashCommandEntry,
    onRemoveSlashCommand: composerInteractionControls.removeSlashCommandSelection,
    onUnavailableSlashCommand: composerInteractionControls.showUnavailableSlashCommand,
    onSelectSymphonyPattern: symphonyBuilderControls.selectSymphonyPattern,
    onSelectSymphonyStepChoice: symphonyBuilderControls.selectSymphonyStepChoice,
    onChangeSymphonyStepCustomText: symphonyBuilderControls.changeSymphonyStepCustomText,
    onChangeSymphonyMetric: symphonyBuilderControls.changeSymphonyMetric,
    onChangeSymphonyBlocking: symphonyBuilderControls.changeSymphonyBlocking,
    onChooseSymphonyPreflightCustom: composerInteractionControls.chooseSymphonyPreflightCustom,
    onRemoveContextAttachment,
    onClearContextAttachments,
    onCancelSttComposerRecording,
    onDiscardSttComposerResult,
    onToggleSymphonyBuilder: symphonyBuilderControls.toggleSymphonyBuilder,
    onToggleLocalDeepResearchMode,
    setModelPickerOpen: composerModelPickerControls.setModelPickerOpen,
    onFocusModelPickerOption: composerModelPickerControls.focusModelPickerOption,
    onCreateThreadWorktree,
    onCreateBranch,
    ...composerShellProps,
  };
}
