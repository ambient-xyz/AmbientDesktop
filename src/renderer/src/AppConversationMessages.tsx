import type { ComponentProps, ReactNode, RefObject } from "react";
import { ChevronDown } from "lucide-react";

import type { BrowserUserActionState } from "../../shared/browserTypes";
import type { DesktopState, ProviderCatalogSettingsCard, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { AmbientPluginRegistry } from "../../shared/pluginTypes";
import type { ChatMessage, RunStatus, RuntimeActivity, ThreadGoal } from "../../shared/threadTypes";
import type { WorkflowRecordingState } from "../../shared/workflowTypes";
import { ChatFindBar, DismissibleErrorStrip, ThreadVoiceStatusBar } from "./AppChatChrome";
import type { CapabilityBuilderPromptResult } from "./AppCapabilityPromptActions";
import { AppConversationMessageList } from "./AppConversationMessageList";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
import { GoalCompletionConfetti } from "./AppGoalControls";
import { formatRuntimeActivity, type RunActivityLine, type RunRetryStats } from "./AppRunActivity";
import { RuntimeStatusStrips } from "./AppRuntimeStatusStrips";
import { SessionContextRecoveryStrip } from "./AppSessionRecovery";
import { WorkflowRecordingChatBanner } from "./AppWorkflowRecording";
import type { SubagentParentClusterProps } from "./SubagentParentCluster";
import { SubagentThreadInspector } from "./SubagentThreadInspector";
import type {
  SubagentParentClusterChildModel,
  SubagentParentClusterModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterUiModel";
import type { ArtifactPathHints } from "./toolMessageUiModel";
import type { RuntimeStatusIndicator } from "./runtimeStatusIndicatorUiModel";

type ThreadVoiceStatus = ComponentProps<typeof ThreadVoiceStatusBar>["status"];

export type AppConversationMessagesProps = {
  children?: ReactNode;
  goalCompletionCelebrationId?: string;
  chatFindOpen: boolean;
  chatFindInputRef: RefObject<HTMLInputElement | null>;
  chatFindQuery: string;
  chatFindCount: number;
  chatFindIndex: number;
  onChatFindQueryChange: (query: string) => void;
  onChatFindPrevious: () => void;
  onChatFindNext: () => void;
  onChatFindClose: () => void;
  activeThreadVoiceStatusVisible: boolean;
  activeThreadVoiceStatus?: ThreadVoiceStatus;
  activeThreadVoiceStatusDismissKey?: string;
  onDismissActiveThreadVoiceStatus: (dismissKey: string) => void;
  activeSubagentInspector?: ComponentProps<typeof SubagentThreadInspector>["model"];
  workflowRecording?: WorkflowRecordingState;
  workflowRecordingReviewRunning: boolean;
  running: boolean;
  abortArmed: boolean;
  activeThreadId: string;
  activeThreadGoal?: ThreadGoal;
  activeRunActivityLines: RunActivityLine[];
  runStatus: RunStatus;
  retryStats?: RunRetryStats;
  chatExportBusy: boolean;
  onRetryWorkflowRecordingReview: (recording: WorkflowRecordingState) => void | Promise<void>;
  onAbortRun: (threadId: string) => void | Promise<void>;
  onStopWorkflowRecording: (input?: { requestReview?: boolean }) => void | Promise<void>;
  onExportActiveChat: () => void | Promise<void>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onMessagesScroll: () => void;
  visibleChatMessages: ChatMessage[];
  messageWindow?: DesktopState["messageWindow"];
  onLoadOlderMessages: () => void | Promise<void>;
  activeChatBrowserUserAction?: BrowserUserActionState;
  workflowRecorderEmptyChatState?: { title: string; paragraphs: string[] };
  provider: DesktopState["provider"];
  providerCatalog: DesktopState["providerCatalog"];
  welcomeAmbientPluginRegistry?: AmbientPluginRegistry;
  onOpenAmbientKeys: () => void | Promise<void>;
  onOpenApiKeyDialog: () => void | Promise<void>;
  onStartWelcomeFirstRunCapabilityOnboarding: () => void | Promise<CapabilityBuilderPromptResult>;
  onStartWelcomeProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => void | Promise<CapabilityBuilderPromptResult>;
  onStartWelcomeRemoteSurfaceActivation: (provider: "telegram" | "signal" | "choose") => void | Promise<CapabilityBuilderPromptResult>;
  onOpenSettingsPanel: () => void;
  onOpenPluginsPanel: () => void;
  messageVoiceStates: DesktopState["messageVoiceStates"];
  voiceProviderLabels: Record<string, string>;
  streamingAssistantId?: string;
  retryableMessageIds: Set<string>;
  onRetryMessage: (message: ChatMessage) => void | Promise<void>;
  onSendTelegramSessionSetupPrompt?: (prompt: string) => void | Promise<void>;
  onSendRemoteSurfaceActivationPrompt?: (prompt: string) => void | Promise<void>;
  activeWorkspacePath: string;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: MediaPreviewModalRequest["mediaKind"]) => void;
  generatedMediaAutoplay: boolean;
  latestReadyVoiceAutoplay?: { messageId: string; key: string };
  autoplayVoiceKey?: string;
  activeVoiceMessageId?: string;
  onActiveVoiceMessageChange: (messageId?: string) => void;
  onRegenerateVoice: (messageId: string) => void | Promise<void>;
  onRevealVoiceArtifact: (messageId: string) => void | Promise<void>;
  onClearVoiceArtifact: (messageId: string) => void | Promise<void>;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
  onOpenBrowserPanel: () => void;
  artifactPathHints: ArtifactPathHints;
  plannerArtifactByMessageId: Map<string, PlannerPlanArtifact>;
  onImplementPlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRefinePlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRetryPlannerFinalization: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onAddPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onGeneratePlannerDurableArtifact: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  hasProjectBoard: boolean;
  onAnswerPlannerDecisionQuestion: (
    artifact: PlannerPlanArtifact,
    questionId: string,
    answer: AnswerPlannerDecisionQuestionInput["answer"],
  ) => void | Promise<void>;
  contextRecoveryBusy: boolean;
  canRetryContextRecovery: boolean;
  onRecoverActiveThreadContext: () => void | Promise<void>;
  onRecoverAndRetryLatest: () => void | Promise<void>;
  onDuplicateActiveThreadFromTranscript: () => void | Promise<void>;
  childMessagesByThreadId?: DesktopState["childMessagesByThreadId"];
  threads: DesktopState["threads"];
  subagentRunEvents: DesktopState["subagentRunEvents"];
  subagentMailboxEvents: DesktopState["subagentMailboxEvents"];
  threadRunStatuses: Record<string, RunStatus>;
  thinkingDisplayMode: ThinkingDisplayMode;
  showPromptCacheStatus?: boolean;
  runActivityLinesByThread: Record<string, RunActivityLine[]>;
  subagentParentClustersByMessageId: Map<string, SubagentParentClusterModel>;
  onOpenSubagentThread: (child: SubagentParentClusterChildModel) => void | Promise<void>;
  onOpenSubagentParentThread: (model: ComponentProps<typeof SubagentThreadInspector>["model"]) => void | Promise<void>;
  onCancelSubagentChild: SubagentParentClusterProps["onCancelChild"];
  onCloseSubagentChild: SubagentParentClusterProps["onCloseChild"];
  onOpenCallableWorkflowThread: (task: SubagentParentClusterWorkflowTaskModel) => void | Promise<void>;
  onPauseCallableWorkflowTask: SubagentParentClusterProps["onPauseWorkflowTask"];
  onResumeCallableWorkflowTask: SubagentParentClusterProps["onResumeWorkflowTask"];
  onCancelCallableWorkflowTask: SubagentParentClusterProps["onCancelWorkflowTask"];
  onResolveSubagentBarrierAction: SubagentParentClusterProps["onResolveBarrierAction"];
  onResolveSubagentApprovalAction: SubagentParentClusterProps["onResolveApprovalAction"];
  subagentChildCancelBusy?: string;
  subagentChildCloseBusy?: string;
  callableWorkflowTaskPauseBusy?: string;
  callableWorkflowTaskResumeBusy?: string;
  callableWorkflowTaskCancelBusy?: string;
  subagentBarrierActionBusy?: string;
  subagentApprovalActionBusy?: string;
  chatBrowserUserActionBusy?: "resume" | "cancel";
  onResumeBrowserUserAction: () => void | Promise<void>;
  onCancelBrowserUserAction: () => void | Promise<void>;
  onOpenBrowserForUserAction: (action: BrowserUserActionState) => void | Promise<void>;
  transientThinkingActivityLines: RunActivityLine[];
  visibleRunActivityLines: RunActivityLine[];
  runStatusCardVisible: boolean;
  messageTailVisible: boolean;
  showScrollToBottom: boolean;
  onJumpToLatestMessage: () => void;
  errorNeedsSessionRecovery: boolean;
  error?: string;
  onDismissError: () => void;
  activeWorkspaceIsPreparedLocalTask: boolean;
  projectRootPath: string;
  runtimeStatusIndicators: RuntimeStatusIndicator[];
  activeActivity?: RuntimeActivity;
};

export function AppConversationMessages(props: AppConversationMessagesProps) {
  const {
    children,
    goalCompletionCelebrationId,
    chatFindOpen,
    chatFindInputRef,
    chatFindQuery,
    chatFindCount,
    chatFindIndex,
    onChatFindQueryChange,
    onChatFindPrevious,
    onChatFindNext,
    onChatFindClose,
    activeThreadVoiceStatusVisible,
    activeThreadVoiceStatus,
    activeThreadVoiceStatusDismissKey,
    onDismissActiveThreadVoiceStatus,
    activeSubagentInspector,
    workflowRecording,
    workflowRecordingReviewRunning,
    running,
    abortArmed,
    activeThreadId,
    activeThreadGoal,
    activeRunActivityLines,
    runStatus,
    retryStats,
    chatExportBusy,
    onRetryWorkflowRecordingReview,
    onAbortRun,
    onStopWorkflowRecording,
    onExportActiveChat,
    onOpenSettingsPanel,
    onOpenSubagentParentThread,
    showScrollToBottom,
    onJumpToLatestMessage,
    errorNeedsSessionRecovery,
    error,
    contextRecoveryBusy,
    canRetryContextRecovery,
    onRecoverActiveThreadContext,
    onRecoverAndRetryLatest,
    onDuplicateActiveThreadFromTranscript,
    onDismissError,
    activeWorkspaceIsPreparedLocalTask,
    projectRootPath,
    activeWorkspacePath,
    runtimeStatusIndicators,
    activeActivity,
  } = props;

  return (
    <section className={activeSubagentInspector ? "conversation subagent-inspector-docked" : "conversation"}>
      {goalCompletionCelebrationId && <GoalCompletionConfetti key={goalCompletionCelebrationId} />}
      {chatFindOpen && (
        <ChatFindBar
          inputRef={chatFindInputRef}
          query={chatFindQuery}
          count={chatFindCount}
          activeIndex={chatFindCount > 0 ? Math.min(chatFindIndex, chatFindCount - 1) : 0}
          onQueryChange={onChatFindQueryChange}
          onPrevious={onChatFindPrevious}
          onNext={onChatFindNext}
          onClose={onChatFindClose}
        />
      )}
      {activeThreadVoiceStatusVisible && activeThreadVoiceStatus && activeThreadVoiceStatusDismissKey && (
        <ThreadVoiceStatusBar
          status={activeThreadVoiceStatus}
          onOpenVoiceSettings={onOpenSettingsPanel}
          onDismiss={() => onDismissActiveThreadVoiceStatus(activeThreadVoiceStatusDismissKey)}
        />
      )}
      <WorkflowRecordingChatBanner
        recording={workflowRecording}
        reviewRunning={workflowRecordingReviewRunning}
        running={running}
        abortArmed={abortArmed}
        activeThreadId={activeThreadId}
        activeRunActivityLines={activeRunActivityLines}
        runStatus={runStatus}
        retryStats={retryStats}
        chatExportBusy={chatExportBusy}
        onRetryReview={onRetryWorkflowRecordingReview}
        onAbortRun={onAbortRun}
        onStopRecording={onStopWorkflowRecording}
        onExportActiveChat={onExportActiveChat}
      />
      <AppConversationMessageList {...props} />

      {showScrollToBottom && (
        <div className="scroll-to-bottom-anchor">
          <button
            type="button"
            className="scroll-to-bottom-button"
            title="Jump to latest"
            aria-label="Jump to latest"
            onClick={onJumpToLatestMessage}
          >
            <ChevronDown size={22} />
          </button>
        </div>
      )}

      {activeSubagentInspector && (
        <div className="subagent-thread-inspector-dock" aria-label="Active sub-agent summary">
          <SubagentThreadInspector model={activeSubagentInspector} onOpenParentThread={onOpenSubagentParentThread} />
        </div>
      )}

      {errorNeedsSessionRecovery ? (
        <SessionContextRecoveryStrip
          message={error}
          busy={contextRecoveryBusy}
          running={running}
          canRetry={canRetryContextRecovery}
          onRecover={onRecoverActiveThreadContext}
          onRecoverAndRetry={onRecoverAndRetryLatest}
          onDuplicate={onDuplicateActiveThreadFromTranscript}
          onDismiss={onDismissError}
        />
      ) : (
        error && <DismissibleErrorStrip message={error} onDismiss={onDismissError} />
      )}
      {activeWorkspaceIsPreparedLocalTask && (
        <div className="workspace-context-strip" title={`Project root: ${projectRootPath}\nCurrent chat workspace: ${activeWorkspacePath}`}>
          <strong>Local Task workspace</strong>
          <span>
            This chat is running in a prepared workspace. Project board actions still use the owning project root, while file, terminal, and
            artifact actions use the current workspace.
          </span>
        </div>
      )}
      <RuntimeStatusStrips indicators={runtimeStatusIndicators} activeGoal={activeThreadGoal} />
      {activeActivity && <div className="activity-strip">{formatRuntimeActivity(activeActivity)}</div>}
      {children}
    </section>
  );
}
