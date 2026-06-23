import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { ChevronDown } from "lucide-react";

import type { BrowserUserActionState } from "../../shared/browserTypes";
import type { DesktopState, ProviderCatalogSettingsCard, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { AmbientPluginRegistry } from "../../shared/pluginTypes";
import type { ChatMessage, RunStatus, RuntimeActivity, ThreadGoal } from "../../shared/threadTypes";
import type { WorkflowRecordingState } from "../../shared/workflowTypes";
import { BrowserUserActionChatCard, ChatFindBar, DismissibleErrorStrip, ThreadVoiceStatusBar } from "./AppChatChrome";
import type { CapabilityBuilderPromptResult } from "./AppCapabilityPromptActions";
import type { ChatComposerInputHandle } from "./AppComposerControls";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
import { AppConversationEmptyState } from "./AppConversationEmptyState";
import { AppConversationMessageRenderer } from "./AppConversationMessageRenderer";
import { AppConversationSubagentChildStartingState, useAppConversationSubagentSurfaces } from "./AppConversationSubagentSurfaces";
import { GoalCompletionConfetti } from "./AppGoalControls";
import { formatRuntimeActivity, RunActivityFeed, type RunActivityLine, type RunRetryStats } from "./AppRunActivity";
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
import { shouldVirtualizeMessages, useVirtualMessageRows } from "./messageVirtualization";

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

function TransientThinkingActivitySlot({ lines, status, visible }: { lines: RunActivityLine[]; status: RunStatus; visible: boolean }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [slotMinHeight, setSlotMinHeight] = useState(0);

  useLayoutEffect(() => {
    if (!visible) return;
    const element = slotRef.current;
    if (!element) return;
    const updateSlotHeight = () => {
      const nextHeight = Math.ceil(element.getBoundingClientRect().height);
      if (nextHeight <= 0) return;
      setSlotMinHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    };
    updateSlotHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSlotHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [lines, status, visible]);

  if (!visible && slotMinHeight <= 0) return null;

  return (
    <div
      className="transient-thinking-slot"
      ref={slotRef}
      aria-hidden={visible ? undefined : true}
      style={!visible && slotMinHeight > 0 ? { minHeight: slotMinHeight } : undefined}
    >
      {visible ? <RunActivityFeed lines={lines} status={status} variant="thinking-transient" /> : null}
    </div>
  );
}

export function AppConversationMessages({
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
  scrollRef,
  onMessagesScroll,
  visibleChatMessages,
  activeChatBrowserUserAction,
  workflowRecorderEmptyChatState,
  provider,
  providerCatalog,
  welcomeAmbientPluginRegistry,
  onOpenAmbientKeys,
  onOpenApiKeyDialog,
  onStartWelcomeFirstRunCapabilityOnboarding,
  onStartWelcomeProviderCatalogCardOnboarding,
  onStartWelcomeRemoteSurfaceActivation,
  onOpenSettingsPanel,
  onOpenPluginsPanel,
  messageVoiceStates,
  voiceProviderLabels,
  streamingAssistantId,
  retryableMessageIds,
  onRetryMessage,
  onSendTelegramSessionSetupPrompt,
  onSendRemoteSurfaceActivationPrompt,
  activeWorkspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
  generatedMediaAutoplay,
  latestReadyVoiceAutoplay,
  autoplayVoiceKey,
  activeVoiceMessageId,
  onActiveVoiceMessageChange,
  onRegenerateVoice,
  onRevealVoiceArtifact,
  onClearVoiceArtifact,
  onOpenUrl,
  onOpenBrowserUrl,
  onOpenBrowserPanel,
  artifactPathHints,
  plannerArtifactByMessageId,
  onImplementPlannerPlan,
  onRefinePlannerPlan,
  onRetryPlannerFinalization,
  onAddPlannerPlanToBoard,
  onGeneratePlannerDurableArtifact,
  hasProjectBoard,
  onAnswerPlannerDecisionQuestion,
  contextRecoveryBusy,
  canRetryContextRecovery,
  onRecoverActiveThreadContext,
  onRecoverAndRetryLatest,
  onDuplicateActiveThreadFromTranscript,
  childMessagesByThreadId,
  threads,
  subagentRunEvents,
  subagentMailboxEvents,
  threadRunStatuses,
  thinkingDisplayMode,
  showPromptCacheStatus = false,
  runActivityLinesByThread,
  subagentParentClustersByMessageId,
  onOpenSubagentThread,
  onOpenSubagentParentThread,
  onCancelSubagentChild,
  onCloseSubagentChild,
  onOpenCallableWorkflowThread,
  onPauseCallableWorkflowTask,
  onResumeCallableWorkflowTask,
  onCancelCallableWorkflowTask,
  onResolveSubagentBarrierAction,
  onResolveSubagentApprovalAction,
  subagentChildCancelBusy,
  subagentChildCloseBusy,
  callableWorkflowTaskPauseBusy,
  callableWorkflowTaskResumeBusy,
  callableWorkflowTaskCancelBusy,
  subagentBarrierActionBusy,
  subagentApprovalActionBusy,
  chatBrowserUserActionBusy,
  onResumeBrowserUserAction,
  onCancelBrowserUserAction,
  onOpenBrowserForUserAction,
  transientThinkingActivityLines,
  visibleRunActivityLines,
  runStatusCardVisible,
  messageTailVisible,
  showScrollToBottom,
  onJumpToLatestMessage,
  errorNeedsSessionRecovery,
  error,
  onDismissError,
  activeWorkspaceIsPreparedLocalTask,
  projectRootPath,
  runtimeStatusIndicators,
  activeActivity,
}: AppConversationMessagesProps) {
  const subagentThreadHasNoMessages = Boolean(activeSubagentInspector && visibleChatMessages.length === 0);
  const activeVirtualMessageIds = useMemo(() => {
    const ids = new Set<string>();
    if (streamingAssistantId) ids.add(streamingAssistantId);
    const latestMessage = visibleChatMessages[visibleChatMessages.length - 1];
    if (running && latestMessage) ids.add(latestMessage.id);
    return ids;
  }, [running, streamingAssistantId, visibleChatMessages]);
  const virtualMessagesEnabled = shouldVirtualizeMessages({
    messageCount: visibleChatMessages.length,
    chatFindOpen,
    activeSubagentInspector: Boolean(activeSubagentInspector),
  });
  const virtualMessages = useVirtualMessageRows({
    items: visibleChatMessages,
    scrollRef,
    enabled: virtualMessagesEnabled,
    activeIds: activeVirtualMessageIds,
  });
  const { orphanedSubagentClusters, renderSubagentParentCluster } = useAppConversationSubagentSurfaces({
    visibleChatMessages,
    childMessagesByThreadId,
    threads,
    subagentRunEvents,
    subagentMailboxEvents,
    threadRunStatuses,
    thinkingDisplayMode,
    runActivityLinesByThread,
    subagentParentClustersByMessageId,
    running,
    activeWorkspacePath,
    voiceProviderLabels,
    generatedMediaAutoplay,
    showPromptCacheStatus,
    activeVoiceMessageId,
    hasProjectBoard,
    chatFindOpen,
    chatFindQuery,
    onSendTelegramSessionSetupPrompt,
    onSendRemoteSurfaceActivationPrompt,
    onPreviewPath,
    onPreviewLocalPath,
    onOpenMediaModal,
    onActiveVoiceMessageChange,
    onRegenerateVoice,
    onRevealVoiceArtifact,
    onClearVoiceArtifact,
    onOpenUrl,
    onOpenBrowserUrl,
    onOpenBrowserPanel,
    onImplementPlannerPlan,
    onRefinePlannerPlan,
    onRetryPlannerFinalization,
    onAddPlannerPlanToBoard,
    onGeneratePlannerDurableArtifact,
    onAnswerPlannerDecisionQuestion,
    onOpenSubagentThread,
    onCancelSubagentChild,
    onCloseSubagentChild,
    onOpenCallableWorkflowThread,
    onPauseCallableWorkflowTask,
    onResumeCallableWorkflowTask,
    onCancelCallableWorkflowTask,
    onResolveSubagentBarrierAction,
    onResolveSubagentApprovalAction,
    subagentChildCancelBusy,
    subagentChildCloseBusy,
    callableWorkflowTaskPauseBusy,
    callableWorkflowTaskResumeBusy,
    callableWorkflowTaskCancelBusy,
    subagentBarrierActionBusy,
    subagentApprovalActionBusy,
  });

  const renderConversationMessage = (message: ChatMessage) => (
    <AppConversationMessageRenderer
      message={message}
      subagentCluster={subagentParentClustersByMessageId.get(message.id)}
      renderSubagentParentCluster={renderSubagentParentCluster}
      running={running}
      providerCatalog={providerCatalog}
      welcomeAmbientPluginRegistry={welcomeAmbientPluginRegistry}
      onStartWelcomeFirstRunCapabilityOnboarding={onStartWelcomeFirstRunCapabilityOnboarding}
      onStartWelcomeProviderCatalogCardOnboarding={onStartWelcomeProviderCatalogCardOnboarding}
      onStartWelcomeRemoteSurfaceActivation={onStartWelcomeRemoteSurfaceActivation}
      onOpenSettingsPanel={onOpenSettingsPanel}
      onOpenPluginsPanel={onOpenPluginsPanel}
      messageVoiceStates={messageVoiceStates}
      voiceProviderLabels={voiceProviderLabels}
      streamingAssistantId={streamingAssistantId}
      retryableMessageIds={retryableMessageIds}
      onRetryMessage={onRetryMessage}
      onSendTelegramSessionSetupPrompt={onSendTelegramSessionSetupPrompt}
      onSendRemoteSurfaceActivationPrompt={onSendRemoteSurfaceActivationPrompt}
      activeWorkspacePath={activeWorkspacePath}
      onPreviewPath={onPreviewPath}
      onPreviewLocalPath={onPreviewLocalPath}
      onOpenMediaModal={onOpenMediaModal}
      generatedMediaAutoplay={generatedMediaAutoplay}
      latestReadyVoiceAutoplay={latestReadyVoiceAutoplay}
      autoplayVoiceKey={autoplayVoiceKey}
      activeVoiceMessageId={activeVoiceMessageId}
      onActiveVoiceMessageChange={onActiveVoiceMessageChange}
      onRegenerateVoice={onRegenerateVoice}
      onRevealVoiceArtifact={onRevealVoiceArtifact}
      onClearVoiceArtifact={onClearVoiceArtifact}
      onOpenUrl={onOpenUrl}
      onOpenBrowserUrl={onOpenBrowserUrl}
      onOpenBrowserPanel={onOpenBrowserPanel}
      artifactPathHints={artifactPathHints}
      plannerArtifactByMessageId={plannerArtifactByMessageId}
      activeRunActivityLines={activeRunActivityLines}
      runStatus={runStatus}
      onImplementPlannerPlan={onImplementPlannerPlan}
      onRefinePlannerPlan={onRefinePlannerPlan}
      onRetryPlannerFinalization={onRetryPlannerFinalization}
      onAddPlannerPlanToBoard={onAddPlannerPlanToBoard}
      onGeneratePlannerDurableArtifact={onGeneratePlannerDurableArtifact}
      hasProjectBoard={hasProjectBoard}
      onAnswerPlannerDecisionQuestion={onAnswerPlannerDecisionQuestion}
      chatFindOpen={chatFindOpen}
      chatFindQuery={chatFindQuery}
      contextRecoveryBusy={contextRecoveryBusy}
      canRetryContextRecovery={canRetryContextRecovery}
      onRecoverActiveThreadContext={onRecoverActiveThreadContext}
      onRecoverAndRetryLatest={onRecoverAndRetryLatest}
      onDuplicateActiveThreadFromTranscript={onDuplicateActiveThreadFromTranscript}
      showPromptCacheStatus={showPromptCacheStatus}
    />
  );

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
      <div className="messages" ref={scrollRef} onScroll={onMessagesScroll}>
        {visibleChatMessages.length === 0 && !activeChatBrowserUserAction?.active && !running && !activeSubagentInspector ? (
          <AppConversationEmptyState
            workflowRecorderEmptyChatState={workflowRecorderEmptyChatState}
            provider={provider}
            onOpenAmbientKeys={onOpenAmbientKeys}
            onOpenApiKeyDialog={onOpenApiKeyDialog}
          />
        ) : (
          <>
            {virtualMessages.enabled ? (
              <div className="messages-virtual-list" style={{ height: virtualMessages.totalHeight }}>
                {virtualMessages.rows.map((row) => (
                  <div
                    key={row.item.id}
                    className="messages-virtual-row"
                    data-message-id={row.item.id}
                    ref={(element) => virtualMessages.measureElement(row.item, element)}
                    style={{ transform: `translateY(${row.start}px)` }}
                  >
                    {renderConversationMessage(row.item)}
                  </div>
                ))}
              </div>
            ) : (
              visibleChatMessages.map((message) => <Fragment key={message.id}>{renderConversationMessage(message)}</Fragment>)
            )}
            {orphanedSubagentClusters.map((subagentCluster) => (
              <Fragment key={`orphan-subagent-cluster:${subagentCluster.parentMessageId}`}>
                {renderSubagentParentCluster(subagentCluster)}
              </Fragment>
            ))}
            {activeChatBrowserUserAction?.active && (
              <BrowserUserActionChatCard
                action={activeChatBrowserUserAction}
                busy={chatBrowserUserActionBusy}
                onResume={onResumeBrowserUserAction}
                onCancel={onCancelBrowserUserAction}
                onOpenBrowser={() => onOpenBrowserForUserAction(activeChatBrowserUserAction)}
              />
            )}
            {transientThinkingActivityLines.length > 0 && !workflowRecordingReviewRunning && (
              <TransientThinkingActivitySlot lines={transientThinkingActivityLines} status={runStatus} visible={messageTailVisible} />
            )}
            {runStatusCardVisible && <RunActivityFeed lines={visibleRunActivityLines} status={runStatus} />}
          </>
        )}
        {subagentThreadHasNoMessages && activeSubagentInspector && (
          <AppConversationSubagentChildStartingState
            model={activeSubagentInspector}
            runStatus={runStatus}
            activeRunActivityLines={activeRunActivityLines}
          />
        )}
      </div>

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
