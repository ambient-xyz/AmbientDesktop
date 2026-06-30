import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { createAppBrowserActionControls } from "./AppBrowserActionControls";
import type { createAppCapabilityPromptActions } from "./AppCapabilityPromptActions";
import type { useAppChatFindControls } from "./AppChatFindControls";
import type { createAppComposerRetryActions } from "./AppComposerRetryActions";
import type { AppConversationMessagesProps } from "./AppConversationMessagesTypes";
import type { useAppConversationDisplayModel } from "./AppConversationDisplayModel";
import type { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import type { useAppActiveThreadModel } from "./AppActiveThreadModel";
import type { useAppCoreLifecycleControls } from "./AppCoreLifecycleControls";
import type { createAppMessageVoiceActions } from "./AppMessageVoiceActions";
import type { createAppPlannerActions } from "./AppPlannerActions";
import type { AppProjectBoardActions } from "./AppProjectBoardActions";
import type { useAppProjectBoardControls } from "./AppProjectBoardControls";
import type { useAppRightPanelState } from "./AppRightPanelState";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppShellUiState } from "./AppShellUiState";
import type { createAppSubagentParentClusterActions } from "./AppSubagentParentClusterActions";
import type { useAppSubagentShellControls } from "./AppSubagentShellControls";
import type { createAppThreadMaintenanceActions } from "./AppThreadMaintenanceActions";
import type { useAppVoiceThreadControls } from "./AppVoiceThreadControls";
import type { createAppWorkflowRecordingActions } from "./AppWorkflowRecordingActions";
import type { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { createAppWorkspaceNavigationControls } from "./AppWorkspaceNavigationControls";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";
import type { UtilityPanel } from "./RightPanel";
import { runtimeActivityStripVisible } from "./AppRunActivity";
import { visibleRuntimeStatusIndicatorsForThread } from "./runtimeStatusIndicatorUiModel";
import { desktopStateWithPrependedThreadMessages, THREAD_MESSAGE_PAGE_LOAD_LIMIT } from "./threadMessagePagination";

type AdaptedConversationPropKey =
  | "activeThreadId"
  | "activeThreadGoal"
  | "workflowRecording"
  | "provider"
  | "providerCatalog"
  | "onOpenAmbientKeys"
  | "onOpenApiKeyDialog"
  | "onStartWelcomeFirstRunCapabilityOnboarding"
  | "onStartWelcomeProviderCatalogCardOnboarding"
  | "onStartWelcomeRemoteSurfaceActivation"
  | "onOpenSettingsPanel"
  | "onOpenPluginsPanel"
  | "messageVoiceStates"
  | "messageWindow"
  | "onLoadOlderMessages"
  | "activeWorkspacePath"
  | "generatedMediaAutoplay"
  | "onOpenBrowserPanel"
  | "onAddPlannerPlanToBoard"
  | "onGeneratePlannerDurableArtifact"
  | "hasProjectBoard"
  | "canRetryContextRecovery"
  | "onRecoverActiveThreadContext"
  | "onRecoverAndRetryLatest"
  | "onDuplicateActiveThreadFromTranscript"
  | "onExportActiveChat"
  | "childMessagesByThreadId"
  | "threads"
  | "subagentRunEvents"
  | "subagentMailboxEvents"
  | "onOpenSubagentThread"
  | "onOpenSubagentParentThread"
  | "onCancelSubagentChild"
  | "onCloseSubagentChild"
  | "onOpenCallableWorkflowThread"
  | "onPauseCallableWorkflowTask"
  | "onResumeCallableWorkflowTask"
  | "onCancelCallableWorkflowTask"
  | "onResolveSubagentBarrierAction"
  | "onResolveSubagentApprovalAction"
  | "onResumeBrowserUserAction"
  | "onCancelBrowserUserAction"
  | "onOpenBrowserForUserAction"
  | "onAbortRun"
  | "projectRootPath";

type PanelTarget = Extract<UtilityPanel, "browser" | "plugins" | "settings">;
type MaybeAsyncUnknown = unknown | Promise<unknown>;

export type AppConversationMessagesPropsInput = Omit<AppConversationMessagesProps, AdaptedConversationPropKey> & {
  activeProjectHasBoard: boolean;
  activeThread: { workflowRecording?: AppConversationMessagesProps["workflowRecording"] };
  canRetryContextRecovery: boolean;
  onCancelBrowserUserAction: AppConversationMessagesProps["onCancelBrowserUserAction"];
  onCancelCallableWorkflowTask: AppConversationMessagesProps["onCancelCallableWorkflowTask"];
  onCancelSubagentChild: AppConversationMessagesProps["onCancelSubagentChild"];
  onCloseSubagentChild: AppConversationMessagesProps["onCloseSubagentChild"];
  onDuplicateActiveThreadFromTranscript: () => MaybeAsyncUnknown;
  onExportActiveChat: () => MaybeAsyncUnknown;
  onOpenAmbientKeys: AppConversationMessagesProps["onOpenAmbientKeys"];
  onOpenApiKeyDialog: AppConversationMessagesProps["onOpenApiKeyDialog"];
  onOpenBrowserForUserAction: AppConversationMessagesProps["onOpenBrowserForUserAction"];
  onOpenCallableWorkflowThread: AppConversationMessagesProps["onOpenCallableWorkflowThread"];
  onOpenPanel: (panel: PanelTarget) => void;
  onPauseCallableWorkflowTask: AppConversationMessagesProps["onPauseCallableWorkflowTask"];
  onRecoverActiveThreadContext: () => MaybeAsyncUnknown;
  onRecoverAndRetryLatest: () => MaybeAsyncUnknown;
  onResolveSubagentApprovalAction: AppConversationMessagesProps["onResolveSubagentApprovalAction"];
  onResolveSubagentBarrierAction: AppConversationMessagesProps["onResolveSubagentBarrierAction"];
  onResumeBrowserUserAction: AppConversationMessagesProps["onResumeBrowserUserAction"];
  onResumeCallableWorkflowTask: AppConversationMessagesProps["onResumeCallableWorkflowTask"];
  onSelectThread: (threadId: string, workspacePath?: string) => void | Promise<void>;
  onStartWelcomeFirstRunCapabilityOnboarding: AppConversationMessagesProps["onStartWelcomeFirstRunCapabilityOnboarding"];
  onStartWelcomeProviderCatalogCardOnboarding: AppConversationMessagesProps["onStartWelcomeProviderCatalogCardOnboarding"];
  onStartWelcomeRemoteSurfaceActivation: AppConversationMessagesProps["onStartWelcomeRemoteSurfaceActivation"];
  projectBoardActions: Pick<AppProjectBoardActions, "addPlannerPlanToBoard" | "generatePlannerDurableArtifact">;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState;
};

type AppActiveThreadModel = ReturnType<typeof useAppActiveThreadModel>;
type AppBrowserActionControls = ReturnType<typeof createAppBrowserActionControls>;
type AppCapabilityPromptActions = ReturnType<typeof createAppCapabilityPromptActions>;
type AppChatFindControls = ReturnType<typeof useAppChatFindControls>;
type AppComposerRetryActions = ReturnType<typeof createAppComposerRetryActions>;
type AppConversationDisplayModel = ReturnType<typeof useAppConversationDisplayModel>;
type AppCoreLifecycleControls = ReturnType<typeof useAppCoreLifecycleControls>;
type AppCredentialDialogActions = ReturnType<typeof createAppCredentialDialogActions>;
type AppMessageVoiceActions = ReturnType<typeof createAppMessageVoiceActions>;
type AppPlannerActions = ReturnType<typeof createAppPlannerActions>;
type AppProjectBoardControls = ReturnType<typeof useAppProjectBoardControls>;
type AppRightPanelState = ReturnType<typeof useAppRightPanelState>;
type AppRunActivityState = ReturnType<typeof useAppRunActivityState>;
type AppShellUiState = ReturnType<typeof useAppShellUiState>;
type AppSubagentParentClusterActions = ReturnType<typeof createAppSubagentParentClusterActions>;
type AppSubagentShellControls = ReturnType<typeof useAppSubagentShellControls>;
type AppThreadMaintenanceActions = ReturnType<typeof createAppThreadMaintenanceActions>;
type AppVoiceThreadControls = ReturnType<typeof useAppVoiceThreadControls>;
type AppWorkflowRecordingActions = ReturnType<typeof createAppWorkflowRecordingActions>;
type AppWorkflowRecordingReviewControls = ReturnType<typeof useAppWorkflowRecordingReviewControls>;
type AppWorkflowRuntimeState = ReturnType<typeof useAppWorkflowRuntimeState>;
type AppWorkspaceNavigationControls = ReturnType<typeof createAppWorkspaceNavigationControls>;
type AppWorkspaceShellState = ReturnType<typeof useAppWorkspaceShellState>;

type AppConversationMessagesPreviewActions = Pick<
  AppConversationMessagesPropsInput,
  "onOpenMediaModal" | "onPreviewLocalPath" | "onPreviewPath"
>;

export interface AppConversationMessagesRunDerivedState {
  activeRunActivityLines: AppConversationMessagesPropsInput["activeRunActivityLines"];
  running: boolean;
  thinkingDisplayMode: AppConversationMessagesPropsInput["thinkingDisplayMode"];
}

export interface AppConversationMessagesPropsForAppInput {
  activeThreadModel: Pick<AppActiveThreadModel, "activeActivity" | "activeChatBrowserUserAction" | "activeThread">;
  browserActionControls: Pick<
    AppBrowserActionControls,
    | "cancelBrowserUserActionFromChat"
    | "openBrowserForUserAction"
    | "openExternalUrl"
    | "openUrlInAmbientBrowser"
    | "resumeBrowserUserActionFromChat"
  >;
  capabilityPromptActions: Pick<
    AppCapabilityPromptActions,
    | "sendRemoteSurfaceActivationPrompt"
    | "sendTelegramSessionSetupPrompt"
    | "startWelcomeFirstRunCapabilityOnboarding"
    | "startWelcomeProviderCatalogCardOnboarding"
    | "startWelcomeRemoteSurfaceActivation"
  >;
  chatFindControls: Pick<
    AppChatFindControls,
    | "chatFindCount"
    | "chatFindIndex"
    | "chatFindInputRef"
    | "chatFindOpen"
    | "chatFindQuery"
    | "onChatFindClose"
    | "onChatFindNext"
    | "onChatFindPrevious"
    | "setChatFindQuery"
  >;
  composerRetryActions: Pick<AppComposerRetryActions, "retryFailedPrompt">;
  conversationDisplayModel: Pick<
    AppConversationDisplayModel,
    | "assistantVisibleTextStreaming"
    | "artifactPathHints"
    | "latestRecoveryPrompt"
    | "plannerArtifactByMessageId"
    | "retryableMessageIds"
    | "streamingAssistantId"
    | "transientThinkingActivityLines"
    | "visibleChatMessages"
    | "visibleRunActivityLines"
  >;
  coreLifecycleControls: Pick<
    AppCoreLifecycleControls,
    "handleMessagesScroll" | "jumpToLatestMessage" | "messageTailVisible" | "scrollRef" | "showScrollToBottom"
  >;
  credentialDialogActions: Pick<AppCredentialDialogActions, "openAmbientKeys" | "openApiKeyDialog">;
  messageVoiceActions: Pick<AppMessageVoiceActions, "clearMessageVoiceArtifact" | "regenerateMessageVoice" | "revealMessageVoiceArtifact">;
  plannerActions: Pick<
    AppPlannerActions,
    "answerPlannerDecisionQuestion" | "finalizePlannerPlan" | "implementPlannerPlan" | "openPlannerRevisionDialog"
  >;
  previewActions: AppConversationMessagesPreviewActions;
  projectBoardControls: Pick<
    AppProjectBoardControls,
    "activeProject" | "activeWorkspaceIsPreparedLocalTask" | "errorNeedsSessionRecovery" | "projectBoardActions"
  >;
  rightPanelState: Pick<AppRightPanelState, "openPanel">;
  runActivityState: Pick<
    AppRunActivityState,
    "abortArmed" | "retryStatsByThread" | "runActivityLinesByThread" | "runStatus" | "runtimeStatusIndicatorsByThread" | "threadRunStatuses"
  >;
  runDerivedState: AppConversationMessagesRunDerivedState;
  shellUiState: Pick<AppShellUiState, "clearError" | "error">;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState;
  subagentParentClusterActions: Pick<
    AppSubagentParentClusterActions,
    | "cancelCallableWorkflowTask"
    | "cancelSubagentChild"
    | "closeSubagentChild"
    | "openCallableWorkflowThread"
    | "pauseCallableWorkflowTask"
    | "resolveSubagentApprovalAction"
    | "resolveSubagentBarrierAction"
    | "resumeCallableWorkflowTask"
  >;
  subagentShellControls: Pick<AppSubagentShellControls, "activeSubagentInspector" | "subagentParentClustersByMessageId">;
  threadMaintenanceActions: Pick<
    AppThreadMaintenanceActions,
    "duplicateActiveThreadFromTranscript" | "exportActiveChat" | "recoverActiveThreadContext" | "recoverActiveThreadContextAndRetryLatest"
  >;
  voiceThreadControls: Pick<
    AppVoiceThreadControls,
    | "activeThreadVoiceStatus"
    | "activeThreadVoiceStatusDismissKey"
    | "activeThreadVoiceStatusVisible"
    | "activeVoiceMessageId"
    | "autoplayVoiceKey"
    | "dismissActiveThreadVoiceStatus"
    | "latestReadyVoiceAutoplay"
    | "setActiveVoiceMessageId"
    | "voiceProviderLabels"
  >;
  workflowRecordingActions: Pick<AppWorkflowRecordingActions, "retryWorkflowRecordingReview" | "stopActiveWorkflowRecording">;
  workflowRecordingReviewControls: Pick<
    AppWorkflowRecordingReviewControls,
    "runStatusCardVisible" | "workflowRecorderEmptyChatState" | "workflowRecordingReviewRunning"
  >;
  workflowRuntimeState: Pick<
    AppWorkflowRuntimeState,
    | "callableWorkflowTaskCancelBusy"
    | "callableWorkflowTaskPauseBusy"
    | "callableWorkflowTaskResumeBusy"
    | "chatExportBusy"
    | "contextRecoveryBusy"
    | "goalCompletionCelebrationId"
    | "subagentApprovalActionBusy"
    | "subagentBarrierActionBusy"
    | "subagentChildCancelBusy"
    | "subagentChildCloseBusy"
  >;
  workspaceNavigationControls: Pick<AppWorkspaceNavigationControls, "selectThread">;
  workspaceShellState: Pick<AppWorkspaceShellState, "chatBrowserUserActionBusy" | "welcomeAmbientPluginRegistry">;
}

export function createAppConversationMessagesPropsForApp({
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
  setState,
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
}: AppConversationMessagesPropsForAppInput): AppConversationMessagesProps {
  return createAppConversationMessagesProps({
    goalCompletionCelebrationId: workflowRuntimeState.goalCompletionCelebrationId,
    chatFindOpen: chatFindControls.chatFindOpen,
    chatFindInputRef: chatFindControls.chatFindInputRef,
    chatFindQuery: chatFindControls.chatFindQuery,
    chatFindCount: chatFindControls.chatFindCount,
    chatFindIndex: chatFindControls.chatFindIndex,
    onChatFindQueryChange: chatFindControls.setChatFindQuery,
    onChatFindPrevious: chatFindControls.onChatFindPrevious,
    onChatFindNext: chatFindControls.onChatFindNext,
    onChatFindClose: chatFindControls.onChatFindClose,
    activeThreadVoiceStatusVisible: voiceThreadControls.activeThreadVoiceStatusVisible,
    activeThreadVoiceStatus: voiceThreadControls.activeThreadVoiceStatus,
    activeThreadVoiceStatusDismissKey: voiceThreadControls.activeThreadVoiceStatusDismissKey,
    onDismissActiveThreadVoiceStatus: voiceThreadControls.dismissActiveThreadVoiceStatus,
    activeSubagentInspector: subagentShellControls.activeSubagentInspector,
    activeThread: activeThreadModel.activeThread ?? {},
    activeProjectHasBoard: Boolean(projectBoardControls.activeProject?.board),
    workflowRecordingReviewRunning: workflowRecordingReviewControls.workflowRecordingReviewRunning,
    running: runDerivedState.running,
    abortArmed: runActivityState.abortArmed,
    activeRunActivityLines: runDerivedState.activeRunActivityLines,
    runStatus: runActivityState.runStatus,
    retryStats: runActivityState.retryStatsByThread[state.activeThreadId],
    chatExportBusy: workflowRuntimeState.chatExportBusy,
    onRetryWorkflowRecordingReview: workflowRecordingActions.retryWorkflowRecordingReview,
    onStopWorkflowRecording: workflowRecordingActions.stopActiveWorkflowRecording,
    onExportActiveChat: threadMaintenanceActions.exportActiveChat,
    scrollRef: coreLifecycleControls.scrollRef,
    onMessagesScroll: coreLifecycleControls.handleMessagesScroll,
    visibleChatMessages: conversationDisplayModel.visibleChatMessages,
    activeChatBrowserUserAction: activeThreadModel.activeChatBrowserUserAction,
    workflowRecorderEmptyChatState: workflowRecordingReviewControls.workflowRecorderEmptyChatState,
    welcomeAmbientPluginRegistry: workspaceShellState.welcomeAmbientPluginRegistry,
    onOpenAmbientKeys: credentialDialogActions.openAmbientKeys,
    onOpenApiKeyDialog: credentialDialogActions.openApiKeyDialog,
    onStartWelcomeFirstRunCapabilityOnboarding: capabilityPromptActions.startWelcomeFirstRunCapabilityOnboarding,
    onStartWelcomeProviderCatalogCardOnboarding: capabilityPromptActions.startWelcomeProviderCatalogCardOnboarding,
    onStartWelcomeRemoteSurfaceActivation: capabilityPromptActions.startWelcomeRemoteSurfaceActivation,
    onOpenPanel: rightPanelState.openPanel,
    voiceProviderLabels: voiceThreadControls.voiceProviderLabels,
    streamingAssistantId: conversationDisplayModel.streamingAssistantId,
    retryableMessageIds: conversationDisplayModel.retryableMessageIds,
    onRetryMessage: composerRetryActions.retryFailedPrompt,
    onSendTelegramSessionSetupPrompt: capabilityPromptActions.sendTelegramSessionSetupPrompt,
    onSendRemoteSurfaceActivationPrompt: capabilityPromptActions.sendRemoteSurfaceActivationPrompt,
    onPreviewPath: previewActions.onPreviewPath,
    onPreviewLocalPath: previewActions.onPreviewLocalPath,
    onOpenMediaModal: previewActions.onOpenMediaModal,
    latestReadyVoiceAutoplay: voiceThreadControls.latestReadyVoiceAutoplay,
    autoplayVoiceKey: voiceThreadControls.autoplayVoiceKey,
    activeVoiceMessageId: voiceThreadControls.activeVoiceMessageId,
    onActiveVoiceMessageChange: voiceThreadControls.setActiveVoiceMessageId,
    onRegenerateVoice: messageVoiceActions.regenerateMessageVoice,
    onRevealVoiceArtifact: messageVoiceActions.revealMessageVoiceArtifact,
    onClearVoiceArtifact: messageVoiceActions.clearMessageVoiceArtifact,
    onOpenUrl: browserActionControls.openExternalUrl,
    onOpenBrowserUrl: browserActionControls.openUrlInAmbientBrowser,
    artifactPathHints: conversationDisplayModel.artifactPathHints,
    plannerArtifactByMessageId: conversationDisplayModel.plannerArtifactByMessageId,
    onImplementPlannerPlan: plannerActions.implementPlannerPlan,
    onRefinePlannerPlan: plannerActions.openPlannerRevisionDialog,
    onRetryPlannerFinalization: plannerActions.finalizePlannerPlan,
    projectBoardActions: projectBoardControls.projectBoardActions,
    onAnswerPlannerDecisionQuestion: plannerActions.answerPlannerDecisionQuestion,
    contextRecoveryBusy: workflowRuntimeState.contextRecoveryBusy,
    canRetryContextRecovery: Boolean(conversationDisplayModel.latestRecoveryPrompt),
    onRecoverActiveThreadContext: threadMaintenanceActions.recoverActiveThreadContext,
    onRecoverAndRetryLatest: threadMaintenanceActions.recoverActiveThreadContextAndRetryLatest,
    onDuplicateActiveThreadFromTranscript: threadMaintenanceActions.duplicateActiveThreadFromTranscript,
    threadRunStatuses: runActivityState.threadRunStatuses,
    thinkingDisplayMode: runDerivedState.thinkingDisplayMode,
    runActivityLinesByThread: runActivityState.runActivityLinesByThread,
    runtimeStatusIndicators: visibleRuntimeStatusIndicatorsForThread(
      runActivityState.runtimeStatusIndicatorsByThread,
      state.activeThreadId,
      state.activeThreadGoal,
    ),
    subagentParentClustersByMessageId: subagentShellControls.subagentParentClustersByMessageId,
    onSelectThread: workspaceNavigationControls.selectThread,
    onCancelSubagentChild: subagentParentClusterActions.cancelSubagentChild,
    onCloseSubagentChild: subagentParentClusterActions.closeSubagentChild,
    onOpenCallableWorkflowThread: subagentParentClusterActions.openCallableWorkflowThread,
    onPauseCallableWorkflowTask: subagentParentClusterActions.pauseCallableWorkflowTask,
    onResumeCallableWorkflowTask: subagentParentClusterActions.resumeCallableWorkflowTask,
    onCancelCallableWorkflowTask: subagentParentClusterActions.cancelCallableWorkflowTask,
    onResolveSubagentBarrierAction: subagentParentClusterActions.resolveSubagentBarrierAction,
    onResolveSubagentApprovalAction: subagentParentClusterActions.resolveSubagentApprovalAction,
    subagentChildCancelBusy: workflowRuntimeState.subagentChildCancelBusy,
    subagentChildCloseBusy: workflowRuntimeState.subagentChildCloseBusy,
    callableWorkflowTaskPauseBusy: workflowRuntimeState.callableWorkflowTaskPauseBusy,
    callableWorkflowTaskResumeBusy: workflowRuntimeState.callableWorkflowTaskResumeBusy,
    callableWorkflowTaskCancelBusy: workflowRuntimeState.callableWorkflowTaskCancelBusy,
    subagentBarrierActionBusy: workflowRuntimeState.subagentBarrierActionBusy,
    subagentApprovalActionBusy: workflowRuntimeState.subagentApprovalActionBusy,
    chatBrowserUserActionBusy: workspaceShellState.chatBrowserUserActionBusy,
    onResumeBrowserUserAction: browserActionControls.resumeBrowserUserActionFromChat,
    onCancelBrowserUserAction: browserActionControls.cancelBrowserUserActionFromChat,
    onOpenBrowserForUserAction: browserActionControls.openBrowserForUserAction,
    transientThinkingActivityLines: conversationDisplayModel.transientThinkingActivityLines,
    visibleRunActivityLines: conversationDisplayModel.visibleRunActivityLines,
    runStatusCardVisible: workflowRecordingReviewControls.runStatusCardVisible && !conversationDisplayModel.assistantVisibleTextStreaming,
    messageTailVisible: coreLifecycleControls.messageTailVisible,
    showScrollToBottom: coreLifecycleControls.showScrollToBottom,
    onJumpToLatestMessage: coreLifecycleControls.jumpToLatestMessage,
    errorNeedsSessionRecovery: projectBoardControls.errorNeedsSessionRecovery,
    error: shellUiState.error,
    onDismissError: shellUiState.clearError,
    activeWorkspaceIsPreparedLocalTask: projectBoardControls.activeWorkspaceIsPreparedLocalTask,
    activeActivity: runtimeActivityStripVisible(activeThreadModel.activeActivity, {
      assistantVisibleTextStreaming: conversationDisplayModel.assistantVisibleTextStreaming,
    })
      ? activeThreadModel.activeActivity
      : undefined,
    state,
    setState,
  });
}

export function createAppConversationMessagesProps({
  activeProjectHasBoard,
  activeThread,
  canRetryContextRecovery,
  onCancelBrowserUserAction,
  onCancelCallableWorkflowTask,
  onCancelSubagentChild,
  onCloseSubagentChild,
  onDuplicateActiveThreadFromTranscript,
  onExportActiveChat,
  onOpenAmbientKeys,
  onOpenApiKeyDialog,
  onOpenBrowserForUserAction,
  onOpenCallableWorkflowThread,
  onOpenPanel,
  onPauseCallableWorkflowTask,
  onRecoverActiveThreadContext,
  onRecoverAndRetryLatest,
  onResolveSubagentApprovalAction,
  onResolveSubagentBarrierAction,
  onResumeBrowserUserAction,
  onResumeCallableWorkflowTask,
  onSelectThread,
  onStartWelcomeFirstRunCapabilityOnboarding,
  onStartWelcomeProviderCatalogCardOnboarding,
  onStartWelcomeRemoteSurfaceActivation,
  projectBoardActions,
  setState,
  state,
  ...props
}: AppConversationMessagesPropsInput): AppConversationMessagesProps {
  const loadOlderMessages = async () => {
    const beforeMessageId = state.messages?.[0]?.id;
    if (!beforeMessageId) return;
    try {
      const page = await window.ambientDesktop.listThreadMessagesBefore({
        threadId: state.activeThreadId,
        beforeMessageId,
        limit: THREAD_MESSAGE_PAGE_LOAD_LIMIT,
      });
      setState((current) => desktopStateWithPrependedThreadMessages(current, page));
    } catch (error) {
      console.warn("Failed to load older thread messages", error);
    }
  };

  return {
    ...props,
    activeThreadId: state.activeThreadId,
    activeThreadGoal: state.activeThreadGoal,
    showPromptCacheStatus: state.settings.modelRuntime.showPromptCacheStatus,
    workflowRecording: activeThread.workflowRecording,
    provider: state.provider,
    providerCatalog: state.providerCatalog,
    onOpenAmbientKeys: () => {
      void onOpenAmbientKeys();
    },
    onOpenApiKeyDialog: () => {
      void onOpenApiKeyDialog();
    },
    onExportActiveChat: () => {
      void onExportActiveChat();
    },
    onStartWelcomeFirstRunCapabilityOnboarding: () => {
      void onStartWelcomeFirstRunCapabilityOnboarding();
    },
    onStartWelcomeProviderCatalogCardOnboarding: (card) => {
      void onStartWelcomeProviderCatalogCardOnboarding(card);
    },
    onStartWelcomeRemoteSurfaceActivation: (provider) => {
      void onStartWelcomeRemoteSurfaceActivation(provider);
    },
    onOpenSettingsPanel: () => onOpenPanel("settings"),
    onOpenPluginsPanel: () => onOpenPanel("plugins"),
    messageVoiceStates: state.messageVoiceStates,
    activeWorkspacePath: state.activeWorkspace.path,
    generatedMediaAutoplay: state.settings.media.generatedMediaAutoplay,
    onOpenBrowserPanel: () => onOpenPanel("browser"),
    onAddPlannerPlanToBoard: projectBoardActions.addPlannerPlanToBoard,
    onGeneratePlannerDurableArtifact: projectBoardActions.generatePlannerDurableArtifact,
    hasProjectBoard: activeProjectHasBoard,
    canRetryContextRecovery,
    onRecoverActiveThreadContext: () => {
      void onRecoverActiveThreadContext();
    },
    onRecoverAndRetryLatest: () => {
      void onRecoverAndRetryLatest();
    },
    onDuplicateActiveThreadFromTranscript: () => {
      void onDuplicateActiveThreadFromTranscript();
    },
    childMessagesByThreadId: state.childMessagesByThreadId,
    messageWindow: state.messageWindow,
    onLoadOlderMessages: loadOlderMessages,
    threads: state.threads,
    subagentRunEvents: state.subagentRunEvents,
    subagentMailboxEvents: state.subagentMailboxEvents,
    onOpenSubagentThread: (child) => {
      void onSelectThread(child.childThreadId, child.workspacePath || state.activeWorkspace.path);
    },
    onOpenSubagentParentThread: (model) => {
      if (!model.parentThreadId) return;
      const parentThread = state.threads.find((thread) => thread.id === model.parentThreadId);
      const parentWorkspacePath = parentThread?.workspacePath || model.parentWorkspacePath;
      const registeredWorkspacePath =
        parentWorkspacePath && state.projects?.some((project) => project.path === parentWorkspacePath) ? parentWorkspacePath : undefined;
      void onSelectThread(model.parentThreadId, registeredWorkspacePath);
    },
    onCancelSubagentChild: (child) => {
      void onCancelSubagentChild(child);
    },
    onCloseSubagentChild: (child) => {
      void onCloseSubagentChild(child);
    },
    onOpenCallableWorkflowThread: (task) => {
      void onOpenCallableWorkflowThread(task);
    },
    onPauseCallableWorkflowTask: (task) => {
      void onPauseCallableWorkflowTask(task);
    },
    onResumeCallableWorkflowTask: (task) => {
      void onResumeCallableWorkflowTask(task);
    },
    onCancelCallableWorkflowTask: (task) => {
      void onCancelCallableWorkflowTask(task);
    },
    onResolveSubagentBarrierAction: (action) => {
      void onResolveSubagentBarrierAction(action);
    },
    onResolveSubagentApprovalAction: (action) => {
      void onResolveSubagentApprovalAction(action);
    },
    onResumeBrowserUserAction: () => {
      void onResumeBrowserUserAction();
    },
    onCancelBrowserUserAction: () => {
      void onCancelBrowserUserAction();
    },
    onOpenBrowserForUserAction: (action) => {
      void onOpenBrowserForUserAction(action);
    },
    onAbortRun: (threadId) => window.ambientDesktop.abortRun(threadId),
    projectRootPath: state.workspace.path,
  };
}
