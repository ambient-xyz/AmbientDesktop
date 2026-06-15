import type { DesktopState } from "../../shared/types";
import type { AppConversationMessagesProps } from "./AppConversationMessages";
import type { AppProjectBoardActions } from "./AppProjectBoardActions";
import type { UtilityPanel } from "./RightPanel";

type AdaptedConversationPropKey =
  | "activeThreadId"
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
  state: DesktopState;
};

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
  state,
  ...props
}: AppConversationMessagesPropsInput): AppConversationMessagesProps {
  return {
    ...props,
    activeThreadId: state.activeThreadId,
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
      const registeredWorkspacePath = parentWorkspacePath && state.projects?.some((project) => project.path === parentWorkspacePath)
        ? parentWorkspacePath
        : undefined;
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
