import { Fragment, type ComponentProps, type ReactNode, type RefObject } from "react";
import {
  ChevronDown,
  ClipboardPaste,
  Download,
  Kanban,
  RefreshCw,
  Target,
  Zap,
} from "lucide-react";

import type {
  AmbientPluginRegistry,
  AnswerPlannerDecisionQuestionInput,
  BrowserUserActionState,
  ChatMessage,
  DesktopState,
  PlannerPlanArtifact,
  ProviderCatalogSettingsCard,
  RunStatus,
  RuntimeActivity,
  ThinkingDisplayMode,
  WorkflowRecordingState,
} from "../../shared/types";
import { welcomeOnboardingPageKindFromMetadata } from "../../shared/welcomeOnboarding";
import { ambientMiniLogoUrl } from "./AppBranding";
import {
  BrowserUserActionChatCard,
  ChatFindBar,
  DismissibleErrorStrip,
  ThreadVoiceStatusBar,
} from "./AppChatChrome";
import type { ChatComposerInputHandle } from "./AppComposerControls";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
import {
  MessageBubble,
  messageIsStreamingForRender,
} from "./AppMessages";
import { GoalCompletionConfetti } from "./AppGoalControls";
import {
  EMPTY_RUN_ACTIVITY_LINES,
  formatRuntimeActivity,
  RunActivityFeed,
  type RunActivityLine,
  type RunRetryStats,
} from "./AppRunActivity";
import { SessionContextRecoveryStrip } from "./AppSessionRecovery";
import { WelcomeSetupMessage } from "./AppWelcomeSetup";
import { WorkflowRecordingChatBanner, WorkflowRecorderEmptyChatState } from "./AppWorkflowRecording";
import { SubagentParentCluster, type SubagentParentClusterProps } from "./SubagentParentCluster";
import { SubagentChildTranscriptLive } from "./SubagentChildTranscriptLive";
import { SubagentThreadInspector } from "./SubagentThreadInspector";
import type {
  SubagentParentClusterChildModel,
  SubagentParentClusterModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterUiModel";
import type { ArtifactPathHints } from "./toolMessageUiModel";

type ThreadVoiceStatus = ComponentProps<typeof ThreadVoiceStatusBar>["status"];

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
  showScrollToBottom,
  onJumpToLatestMessage,
  errorNeedsSessionRecovery,
  error,
  onDismissError,
  activeWorkspaceIsPreparedLocalTask,
  projectRootPath,
  activeActivity,
}: {
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
  onStartWelcomeFirstRunCapabilityOnboarding: () => void | Promise<void>;
  onStartWelcomeProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => void | Promise<void>;
  onStartWelcomeRemoteSurfaceActivation: (provider: "telegram" | "signal" | "choose") => void | Promise<void>;
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
  showScrollToBottom: boolean;
  onJumpToLatestMessage: () => void;
  errorNeedsSessionRecovery: boolean;
  error?: string;
  onDismissError: () => void;
  activeWorkspaceIsPreparedLocalTask: boolean;
  projectRootPath: string;
  activeActivity?: RuntimeActivity;
}) {
  const subagentThreadHasNoMessages = Boolean(activeSubagentInspector && visibleChatMessages.length === 0);
  const renderSubagentChildTranscript = (child: SubagentParentClusterChildModel) => {
    const childMessages = childMessagesByThreadId?.[child.childThreadId] ?? [];
    const childThread = threads.find((thread) => thread.id === child.childThreadId);
    const childWorkspacePath = child.workspacePath || childThread?.workspacePath || activeWorkspacePath;
    const inferredChildRunStatus: RunStatus = child.statusTone === "active" ? "streaming" : "idle";
    const childRunStatus = threadRunStatuses[child.childThreadId] ?? inferredChildRunStatus;
    const childRuntimeEvents = subagentRunEvents.filter((event) => event.runId === child.runId);
    const childMailboxEvents = subagentMailboxEvents.filter((event) => event.runId === child.runId);
    return (
      <SubagentChildTranscriptLive
        child={child}
        messages={childMessages}
        workspacePath={childWorkspacePath}
        runtimeEvents={childRuntimeEvents}
        mailboxEvents={childMailboxEvents}
        runStatus={childRunStatus}
        parentRunning={running}
        thinkingDisplayMode={thinkingDisplayMode}
        voiceProviderLabels={voiceProviderLabels}
        generatedMediaAutoplay={generatedMediaAutoplay}
        activeVoiceMessageId={activeVoiceMessageId}
        runActivityLines={runActivityLinesByThread[child.childThreadId] ?? EMPTY_RUN_ACTIVITY_LINES}
        hasProjectBoard={hasProjectBoard}
        highlightQuery={chatFindOpen ? chatFindQuery : ""}
        onSendTelegramSessionSetupPrompt={onSendTelegramSessionSetupPrompt}
        onSendRemoteSurfaceActivationPrompt={onSendRemoteSurfaceActivationPrompt}
        onPreviewPath={onPreviewPath}
        onPreviewLocalPath={onPreviewLocalPath}
        onOpenMediaModal={onOpenMediaModal}
        onActiveVoiceMessageChange={onActiveVoiceMessageChange}
        onRegenerateVoice={onRegenerateVoice}
        onRevealVoiceArtifact={onRevealVoiceArtifact}
        onClearVoiceArtifact={onClearVoiceArtifact}
        onOpenUrl={onOpenUrl}
        onOpenBrowserUrl={onOpenBrowserUrl}
        onOpenBrowserPanel={onOpenBrowserPanel}
        onImplementPlannerPlan={onImplementPlannerPlan}
        onRefinePlannerPlan={onRefinePlannerPlan}
        onRetryPlannerFinalization={onRetryPlannerFinalization}
        onAddPlannerPlanToBoard={onAddPlannerPlanToBoard}
        onGeneratePlannerDurableArtifact={onGeneratePlannerDurableArtifact}
        onAnswerPlannerDecisionQuestion={onAnswerPlannerDecisionQuestion}
        onOpenThread={onOpenSubagentThread}
      />
    );
  };

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
          workflowRecorderEmptyChatState ? (
            <WorkflowRecorderEmptyChatState title={workflowRecorderEmptyChatState.title} paragraphs={workflowRecorderEmptyChatState.paragraphs}>
              {!provider.hasApiKey && (
                <SetupCallout provider={provider} onOpenAmbientKeys={onOpenAmbientKeys} onOpenApiKeyDialog={onOpenApiKeyDialog} />
              )}
            </WorkflowRecorderEmptyChatState>
          ) : (
            <div className="empty-state">
              <img className="ambient-mark large" src={ambientMiniLogoUrl} alt="" />
              <h1>Ambient</h1>
              <div className="empty-project-guidance">
                <p>Build iteratively in threads.</p>
                <p>
                  When a project is ready for formal execution, click{" "}
                  <span className="empty-guidance-icon" aria-label="Plan">
                    <ClipboardPaste size={13} aria-hidden="true" />
                    <span>Plan</span>
                  </span>{" "}
                  to create a durable plan.
                </p>
                <p>Then choose how you want Ambient to carry it out:</p>
                <p>
                  <span className="empty-guidance-icon" aria-label="Goal mode loops">
                    <Target size={13} aria-hidden="true" />
                    <span>Goal mode loops</span>
                  </span>{" "}
                  can implement the plan fully autonomously, continuing until the goal is complete, blocked, or needs your input.
                </p>
                <p>
                  <span className="empty-guidance-icon" aria-label="Project Board">
                    <Kanban size={13} aria-hidden="true" />
                    <span>Project Board</span>
                  </span>{" "}
                  turns the plan into visible Kanban work, giving you more control, approval points, and involvement as tasks move forward.
                </p>
                <p>
                  Click{" "}
                  <span className="empty-guidance-icon" aria-label="Full access">
                    <Zap size={13} aria-hidden="true" />
                  </span>{" "}
                  to turn on full access mode when Ambient needs broader local permissions.
                </p>
                <p>
                  Ambient is in beta. If you encounter problems, click{" "}
                  <span className="empty-guidance-icon" aria-label="Download">
                    <Download size={13} aria-hidden="true" />
                  </span>{" "}
                  to download a report and email it to support@ambientcrypto.ai.
                </p>
                <p>
                  <span className="empty-guidance-icon" aria-label="Updates">
                    <RefreshCw size={13} aria-hidden="true" />
                  </span>{" "}
                  Ambient updates itself; when an update is available, it appears in the upper-left corner.
                </p>
              </div>
              {!provider.hasApiKey && (
                <SetupCallout provider={provider} onOpenAmbientKeys={onOpenAmbientKeys} onOpenApiKeyDialog={onOpenApiKeyDialog} />
              )}
            </div>
          )
        ) : (
          <>
            {visibleChatMessages.map((message) => {
              const welcomePageKind = welcomeOnboardingPageKindFromMetadata(message.metadata);
              if (welcomePageKind === "core_setup" || welcomePageKind === "plugin_setup") {
                return (
                  <WelcomeSetupMessage
                    key={message.id}
                    pageKind={welcomePageKind}
                    catalogCards={providerCatalog.cards}
                    catalogVersion={providerCatalog.catalogVersion}
                    generatedAt={providerCatalog.generatedAt}
                    running={running}
                    registry={welcomeAmbientPluginRegistry}
                    onStartFirstRun={onStartWelcomeFirstRunCapabilityOnboarding}
                    onStartProviderCard={onStartWelcomeProviderCatalogCardOnboarding}
                    onStartRemoteSurfaceActivation={onStartWelcomeRemoteSurfaceActivation}
                    onOpenSettings={onOpenSettingsPanel}
                    onOpenPlugins={onOpenPluginsPanel}
                    onOpenCapabilityBuilder={onOpenPluginsPanel}
                  />
                );
              }
              const subagentCluster = subagentParentClustersByMessageId.get(message.id);
              return (
                <Fragment key={message.id}>
                  <MessageBubble
                    message={message}
                    voiceState={messageVoiceStates[message.id]}
                    voiceProviderLabels={voiceProviderLabels}
                    streaming={messageIsStreamingForRender(message, running, streamingAssistantId)}
                    retryable={retryableMessageIds.has(message.id) && !running}
                    onRetry={onRetryMessage}
                    toolActionDisabled={running}
                    onSendTelegramSessionSetupPrompt={onSendTelegramSessionSetupPrompt}
                    onSendRemoteSurfaceActivationPrompt={onSendRemoteSurfaceActivationPrompt}
                    workspacePath={activeWorkspacePath}
                    onPreviewPath={onPreviewPath}
                    onPreviewLocalPath={onPreviewLocalPath}
                    onOpenMediaModal={onOpenMediaModal}
                    generatedMediaAutoplay={generatedMediaAutoplay}
                    voiceShouldAutoplay={message.id === latestReadyVoiceAutoplay?.messageId && autoplayVoiceKey === latestReadyVoiceAutoplay?.key}
                    activeVoiceMessageId={activeVoiceMessageId}
                    onActiveVoiceMessageChange={onActiveVoiceMessageChange}
                    onRegenerateVoice={onRegenerateVoice}
                    onRevealVoiceArtifact={onRevealVoiceArtifact}
                    onClearVoiceArtifact={onClearVoiceArtifact}
                    onOpenUrl={onOpenUrl}
                    onOpenBrowserUrl={onOpenBrowserUrl}
                    onOpenBrowserPanel={onOpenBrowserPanel}
                    artifactPathHints={artifactPathHints}
                    plannerPlanArtifact={plannerArtifactByMessageId.get(message.id)}
                    runActivityLines={activeRunActivityLines}
                    runStatus={runStatus}
                    onImplementPlannerPlan={onImplementPlannerPlan}
                    onRefinePlannerPlan={onRefinePlannerPlan}
                    onRetryPlannerFinalization={onRetryPlannerFinalization}
                    onAddPlannerPlanToBoard={onAddPlannerPlanToBoard}
                    onGeneratePlannerDurableArtifact={onGeneratePlannerDurableArtifact}
                    hasProjectBoard={hasProjectBoard}
                    onAnswerPlannerDecisionQuestion={onAnswerPlannerDecisionQuestion}
                    highlightQuery={chatFindOpen ? chatFindQuery : ""}
                    contextRecoveryBusy={contextRecoveryBusy}
                    contextRecoveryCanRetry={canRetryContextRecovery}
                    onRecoverContext={onRecoverActiveThreadContext}
                    onRecoverContextAndRetry={onRecoverAndRetryLatest}
                    onDuplicateThreadFromTranscript={onDuplicateActiveThreadFromTranscript}
                  />
                  {subagentCluster && (
                    <SubagentParentCluster
                      model={subagentCluster}
                      onOpenThread={onOpenSubagentThread}
                      onCancelChild={onCancelSubagentChild}
                      onCloseChild={onCloseSubagentChild}
                      onOpenWorkflowThread={onOpenCallableWorkflowThread}
                      onPauseWorkflowTask={onPauseCallableWorkflowTask}
                      onResumeWorkflowTask={onResumeCallableWorkflowTask}
                      onCancelWorkflowTask={onCancelCallableWorkflowTask}
                      onResolveBarrierAction={onResolveSubagentBarrierAction}
                      onResolveApprovalAction={onResolveSubagentApprovalAction}
                      renderChildTranscript={renderSubagentChildTranscript}
                      cancelChildBusyId={subagentChildCancelBusy}
                      closeChildBusyId={subagentChildCloseBusy}
                      pauseWorkflowTaskBusyId={callableWorkflowTaskPauseBusy}
                      resumeWorkflowTaskBusyId={callableWorkflowTaskResumeBusy}
                      cancelWorkflowTaskBusyId={callableWorkflowTaskCancelBusy}
                      barrierActionBusyId={subagentBarrierActionBusy}
                      approvalActionBusyId={subagentApprovalActionBusy}
                    />
                  )}
                </Fragment>
              );
            })}
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
              <RunActivityFeed lines={transientThinkingActivityLines} status={runStatus} variant="thinking-transient" />
            )}
            {runStatusCardVisible && <RunActivityFeed lines={visibleRunActivityLines} status={runStatus} />}
          </>
        )}
        {subagentThreadHasNoMessages && activeSubagentInspector && (
          <SubagentChildStartingState
            model={activeSubagentInspector}
            runStatus={runStatus}
            activeRunActivityLines={activeRunActivityLines}
          />
        )}
      </div>

      {activeSubagentInspector && (
        <div className="subagent-thread-inspector-dock" aria-label="Active sub-agent summary">
          <SubagentThreadInspector model={activeSubagentInspector} onOpenParentThread={onOpenSubagentParentThread} />
        </div>
      )}

      {showScrollToBottom && (
        <button
          type="button"
          className="scroll-to-bottom-button"
          title="Jump to latest"
          aria-label="Jump to latest"
          onClick={onJumpToLatestMessage}
        >
          <ChevronDown size={22} />
        </button>
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
            This chat is running in a prepared workspace. Project board actions still use the owning project root, while file, terminal, and artifact actions use the current workspace.
          </span>
        </div>
      )}
      {activeActivity && <div className="activity-strip">{formatRuntimeActivity(activeActivity)}</div>}
      {children}
    </section>
  );
}

export type AppConversationMessagesProps = ComponentProps<typeof AppConversationMessages>;

function SubagentChildStartingState({
  model,
  runStatus,
  activeRunActivityLines,
}: {
  model: ComponentProps<typeof SubagentThreadInspector>["model"];
  runStatus: RunStatus;
  activeRunActivityLines: RunActivityLine[];
}) {
  return (
    <section
      className={`subagent-child-starting-state tone-${model.statusTone}`}
      aria-label={`Child thread startup status for ${model.title}`}
      aria-live="polite"
      data-subagent-child-starting-state="true"
      data-subagent-child-run-id={model.runId}
      data-subagent-child-status={model.status}
      data-subagent-child-activity-count={activeRunActivityLines.length}
    >
      <div className="subagent-child-starting-header">
        <div>
          <span className="subagent-thread-kicker">Child thread</span>
          <strong>{model.title}</strong>
        </div>
        <span className={`subagent-thread-status tone-${model.statusTone}`}>{model.status}</span>
      </div>
      <div className="subagent-child-starting-body">
        <div className="subagent-child-starting-pulse" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <strong>{childStartingTitle(model.statusTone)}</strong>
          <span>{childStartingDetail(model)}</span>
        </div>
      </div>
      {activeRunActivityLines.length > 0 ? (
        <div className="subagent-child-starting-activity">
          <RunActivityFeed lines={activeRunActivityLines} status={runStatus} />
        </div>
      ) : (
        <div className="subagent-child-starting-empty">
          Waiting for the first child stream event...
        </div>
      )}
    </section>
  );
}

function childStartingTitle(tone: ComponentProps<typeof SubagentThreadInspector>["model"]["statusTone"]): string {
  if (tone === "danger") return "Child run needs attention before transcript arrives";
  if (tone === "warning") return "Child run is paused before transcript arrives";
  if (tone === "success") return "Child result is recorded while transcript loads";
  return "Child run is starting";
}

function childStartingDetail(model: ComponentProps<typeof SubagentThreadInspector>["model"]): string {
  if (model.parentBarrier) {
    return `${model.parentBarrier.label}: ${model.parentBarrier.detail}`;
  }
  if (model.statusTone === "success") {
    return "Ambient has a terminal child status; the transcript area will fill as stored messages finish loading.";
  }
  if (model.statusTone === "danger" || model.statusTone === "warning") {
    return "The child status is visible now; assistant text, tool calls, approvals, and errors will appear in this thread once they arrive.";
  }
  return "Assistant text, tool calls, approvals, and errors will appear in this thread as soon as the child session emits them.";
}

function SetupCallout({
  provider,
  onOpenAmbientKeys,
  onOpenApiKeyDialog,
}: {
  provider: DesktopState["provider"];
  onOpenAmbientKeys: () => void | Promise<void>;
  onOpenApiKeyDialog: () => void | Promise<void>;
}) {
  return (
    <div className="setup-callout">
      <p>Add a {provider.providerLabel} API key to start working.</p>
      <div>
        {provider.providerId === "ambient" && (
          <button type="button" onClick={() => void onOpenAmbientKeys()}>
            Get key
          </button>
        )}
        <button type="button" onClick={() => void onOpenApiKeyDialog()}>
          Paste key
        </button>
      </div>
    </div>
  );
}
