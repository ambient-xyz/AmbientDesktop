import type { ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { SubagentMailboxEventSummary, SubagentRunEventSummary } from "../../shared/subagentTypes";
import type { ChatMessage, RunStatus } from "../../shared/threadTypes";
import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { isRunStatusRunning } from "../../shared/runStatus";
import {
  EMPTY_RUN_ACTIVITY_LINES,
  RunActivityFeed,
  type RunActivityLine,
} from "./AppRunActivity";
import {
  MessageBubble,
  messageIsStreamingForRender,
  streamingAssistantMessageId,
  visibleMessages,
} from "./AppMessages";
import {
  ToolMessageCard,
  type MediaPreviewModalRequest,
} from "./AppToolMessages";
import type { SubagentParentClusterChildModel } from "./subagentParentClusterUiModel";
import {
  subagentChildTranscriptMailboxEventRows,
  subagentChildTranscriptRuntimeEventRows,
  subagentChildTranscriptState,
} from "./subagentChildTranscriptUiModel";
import { collectArtifactPathHints } from "./toolMessageUiModel";

const EMPTY_SUBAGENT_MAILBOX_EVENTS: SubagentMailboxEventSummary[] = [];

export function SubagentChildTranscriptLive({
  child,
  messages,
  workspacePath,
  runtimeEvents,
  mailboxEvents = EMPTY_SUBAGENT_MAILBOX_EVENTS,
  runStatus,
  parentRunning,
  thinkingDisplayMode,
  voiceProviderLabels,
  generatedMediaAutoplay,
  showPromptCacheStatus = false,
  activeVoiceMessageId,
  runActivityLines = EMPTY_RUN_ACTIVITY_LINES,
  hasProjectBoard,
  highlightQuery,
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
  onOpenThread,
}: {
  child: SubagentParentClusterChildModel;
  messages: ChatMessage[];
  workspacePath: string;
  runtimeEvents: SubagentRunEventSummary[];
  mailboxEvents?: SubagentMailboxEventSummary[];
  runStatus: RunStatus;
  parentRunning: boolean;
  thinkingDisplayMode: ThinkingDisplayMode;
  voiceProviderLabels: Record<string, string>;
  generatedMediaAutoplay: boolean;
  showPromptCacheStatus?: boolean;
  activeVoiceMessageId?: string;
  runActivityLines?: RunActivityLine[];
  hasProjectBoard: boolean;
  highlightQuery?: string;
  onSendTelegramSessionSetupPrompt?: (prompt: string) => void | Promise<void>;
  onSendRemoteSurfaceActivationPrompt?: (prompt: string) => void | Promise<void>;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: MediaPreviewModalRequest["mediaKind"]) => void;
  onActiveVoiceMessageChange: (messageId?: string) => void;
  onRegenerateVoice: (messageId: string) => void | Promise<void>;
  onRevealVoiceArtifact: (messageId: string) => void | Promise<void>;
  onClearVoiceArtifact: (messageId: string) => void | Promise<void>;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
  onOpenBrowserPanel: () => void;
  onImplementPlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRefinePlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRetryPlannerFinalization: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onAddPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onGeneratePlannerDurableArtifact: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onAnswerPlannerDecisionQuestion: (
    artifact: PlannerPlanArtifact,
    questionId: string,
    answer: AnswerPlannerDecisionQuestionInput["answer"],
  ) => void | Promise<void>;
  onOpenThread?: (child: SubagentParentClusterChildModel) => void | Promise<void>;
}) {
  const childRunning = isRunStatusRunning(runStatus);
  const childVisibleMessages = useMemo(
    () => visibleMessages(messages, childRunning, thinkingDisplayMode),
    [messages, childRunning, thinkingDisplayMode],
  );
  const childStreamingAssistantId = useMemo(
    () => streamingAssistantMessageId(messages, childRunning),
    [messages, childRunning],
  );
  const childToolMessageCount = useMemo(
    () => childVisibleMessages.filter((message) => message.role === "tool").length,
    [childVisibleMessages],
  );
  const childArtifactPathHints = useMemo(
    () => collectArtifactPathHints(messages, workspacePath),
    [messages, workspacePath],
  );
  const childRuntimeEventRows = useMemo(
    () => subagentChildTranscriptRuntimeEventRows(runtimeEvents, { limit: CHILD_RUNTIME_TIMELINE_LIMIT }),
    [runtimeEvents],
  );
  const childMailboxTimelineRows = useMemo(
    () => subagentChildTranscriptMailboxEventRows(mailboxEvents, {
      limit: Math.max(mailboxEvents.length, CHILD_MAILBOX_TIMELINE_LIMIT),
    }),
    [mailboxEvents],
  );
  const childMailboxEventRows = useMemo(
    () => childMailboxTimelineRows.slice(-CHILD_MAILBOX_TIMELINE_LIMIT),
    [childMailboxTimelineRows],
  );
  const childRuntimeEventsOmitted = Math.max(0, runtimeEvents.length - childRuntimeEventRows.length);
  const childMailboxEventsOmitted = Math.max(0, childMailboxTimelineRows.length - childMailboxEventRows.length);
  const childStreamingMessageCount = useMemo(
    () => childVisibleMessages.filter((childMessage) =>
      messageIsStreamingForRender(childMessage, childRunning, childStreamingAssistantId)
    ).length,
    [childVisibleMessages, childRunning, childStreamingAssistantId],
  );
  const transcriptState = useMemo(
    () => subagentChildTranscriptState({
      status: child.runStatus,
      statusLabel: child.status,
      statusTone: child.statusTone,
      preview: child.preview,
    }),
    [child.runStatus, child.status, child.statusTone, child.preview],
  );
  const transcriptHasMessages = childVisibleMessages.length > 0;
  const timelineOpenWhileLive = childRunning && !transcriptState.isTerminal;
  const runtimeTimelineOpen = timelineOpenWhileLive || !transcriptHasMessages;
  const mailboxTimelineOpen = timelineOpenWhileLive || !transcriptHasMessages;
  const childRunActivityVisible = childRunning && !transcriptState.isTerminal && runActivityLines.length > 0;
  const childRunActivityPlacement = !childRunActivityVisible
    ? "hidden"
    : transcriptHasMessages
      ? "after-transcript"
      : "before-transcript";
  const openThreadAvailable = child.canOpenThread && Boolean(onOpenThread);
  const openThread = () => {
    if (!onOpenThread || !child.canOpenThread) return;
    void onOpenThread(child);
  };
  const childRunActivity = childRunActivityVisible ? (
    <div
      className="subagent-parent-cluster-child-run-activity"
      aria-label={`Live child activity for ${child.title}`}
      data-child-run-activity-count={runActivityLines.length}
      data-child-run-activity-placement={childRunActivityPlacement}
    >
      <RunActivityFeed lines={runActivityLines} status={runStatus} />
    </div>
  ) : null;
  return (
    <div
      className="subagent-parent-cluster-child-transcript-live"
      data-child-run-id={child.runId}
      data-child-thread-id={child.childThreadId}
      data-child-run-status={child.runStatus}
      data-child-terminal={String(transcriptState.isTerminal)}
      data-child-synthesis-safe={String(transcriptState.isSynthesisSafe)}
      data-child-message-count={childVisibleMessages.length}
      data-child-runtime-event-count={runtimeEvents.length}
      data-child-runtime-event-rendered-count={childRuntimeEventRows.length}
      data-child-runtime-event-omitted-count={childRuntimeEventsOmitted}
      data-child-mailbox-event-count={childMailboxTimelineRows.length}
      data-child-mailbox-event-rendered-count={childMailboxEventRows.length}
      data-child-mailbox-event-omitted-count={childMailboxEventsOmitted}
      data-child-runtime-events-open={String(runtimeTimelineOpen)}
      data-child-mailbox-events-open={String(mailboxTimelineOpen)}
      data-child-transcript-primary={String(transcriptHasMessages)}
      data-child-streaming={String(childStreamingMessageCount > 0)}
      data-child-tool-message-count={childToolMessageCount}
      data-child-renderer={childToolMessageCount > 0 ? "message-bubble+tool-card" : "message-bubble"}
      data-child-run-activity-count={runActivityLines.length}
      data-child-run-activity-visible={String(childRunActivityVisible)}
      data-child-run-activity-placement={childRunActivityPlacement}
      data-child-transcript-flow="messages-first"
      data-child-secondary-flow="after-transcript-stream"
    >
      <div className="subagent-parent-cluster-child-mini-thread-header">
        <div className="subagent-parent-cluster-child-mini-thread-title">
          <span className={`subagent-parent-cluster-child-transcript-live-status tone-${transcriptState.statusTone}`}>
            {childRunning && !transcriptState.isTerminal ? "Live" : transcriptState.statusLabel}
          </span>
          <strong>Child thread</strong>
          <span>{child.title}</span>
        </div>
        {openThreadAvailable && (
          <button
            type="button"
            className="subagent-parent-cluster-child-open-full-thread"
            aria-label={`Open full child thread ${child.title}`}
            onClick={openThread}
          >
            <ExternalLink size={12} aria-hidden="true" />
            <span>Open full thread</span>
          </button>
        )}
      </div>
      <div className="subagent-parent-cluster-child-transcript-live-header">
        <span>{countLabel(childVisibleMessages.length, "message")}</span>
        {childToolMessageCount > 0 && <span>{countLabel(childToolMessageCount, "tool card")}</span>}
        <span>{countLabel(runtimeEvents.length, "runtime event")}</span>
        {childMailboxTimelineRows.length > 0 && <span>{countLabel(childMailboxTimelineRows.length, "mailbox event")}</span>}
        <span>{transcriptState.isTerminal ? "terminal end cap below" : "live child run"}</span>
        {childStreamingMessageCount > 0 && <span>{countLabel(childStreamingMessageCount, "streaming message")}</span>}
        {childRunActivityVisible && <span>{countLabel(runActivityLines.length, "activity line")}</span>}
      </div>
      {childRunActivityPlacement === "before-transcript" && childRunActivity}
      <div
        className="subagent-parent-cluster-child-transcript-stream"
        aria-label={`Child thread messages for ${child.title}`}
        aria-live={childRunning ? "polite" : undefined}
        data-child-transcript-stream-live={String(childRunning)}
      >
        {childVisibleMessages.length > 0 ? (
          childVisibleMessages.map((childMessage) => (
            childMessage.role === "tool" ? (
              <ToolMessageCard
                key={childMessage.id}
                message={childMessage}
                workspacePath={workspacePath}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
                onOpenUrl={onOpenUrl}
                onOpenBrowserUrl={onOpenBrowserUrl}
                onOpenBrowserPanel={onOpenBrowserPanel}
                onOpenMediaModal={onOpenMediaModal}
                generatedMediaAutoplay={generatedMediaAutoplay}
                toolActionDisabled={parentRunning || childRunning}
                onSendTelegramSessionSetupPrompt={onSendTelegramSessionSetupPrompt}
                onSendRemoteSurfaceActivationPrompt={onSendRemoteSurfaceActivationPrompt}
              />
            ) : (
              <MessageBubble
                key={childMessage.id}
                message={childMessage}
                voiceProviderLabels={voiceProviderLabels}
                streaming={messageIsStreamingForRender(childMessage, childRunning, childStreamingAssistantId)}
                retryable={false}
                toolActionDisabled={parentRunning || childRunning}
                onSendTelegramSessionSetupPrompt={onSendTelegramSessionSetupPrompt}
                onSendRemoteSurfaceActivationPrompt={onSendRemoteSurfaceActivationPrompt}
                workspacePath={workspacePath}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
                onOpenMediaModal={onOpenMediaModal}
                generatedMediaAutoplay={generatedMediaAutoplay}
                showPromptCacheStatus={showPromptCacheStatus}
                voiceShouldAutoplay={false}
                activeVoiceMessageId={activeVoiceMessageId}
                onActiveVoiceMessageChange={onActiveVoiceMessageChange}
                onRegenerateVoice={onRegenerateVoice}
                onRevealVoiceArtifact={onRevealVoiceArtifact}
                onClearVoiceArtifact={onClearVoiceArtifact}
                onOpenUrl={onOpenUrl}
                onOpenBrowserUrl={onOpenBrowserUrl}
                onOpenBrowserPanel={onOpenBrowserPanel}
                artifactPathHints={childArtifactPathHints}
                runActivityLines={runActivityLines}
                runStatus={runStatus}
                onImplementPlannerPlan={onImplementPlannerPlan}
                onRefinePlannerPlan={onRefinePlannerPlan}
                onRetryPlannerFinalization={onRetryPlannerFinalization}
                onAddPlannerPlanToBoard={onAddPlannerPlanToBoard}
                onGeneratePlannerDurableArtifact={onGeneratePlannerDurableArtifact}
                hasProjectBoard={hasProjectBoard}
                onAnswerPlannerDecisionQuestion={onAnswerPlannerDecisionQuestion}
                highlightQuery={highlightQuery}
              />
            )
          ))
        ) : (
          <div className="subagent-parent-cluster-child-transcript-empty">
            No child transcript messages have arrived yet.
          </div>
        )}
      </div>
      {childRunActivityPlacement === "after-transcript" && childRunActivity}
      {childRuntimeEventRows.length > 0 && (
        <details
          className="subagent-parent-cluster-child-runtime-events"
          aria-label={`Runtime timeline for ${child.title}`}
          data-child-runtime-event-rendered-count={childRuntimeEventRows.length}
          data-child-runtime-event-omitted-count={childRuntimeEventsOmitted}
          {...(runtimeTimelineOpen ? { open: true } : {})}
        >
          <summary className="subagent-parent-cluster-child-runtime-events-title">
            <strong>Runtime timeline</strong>
            <span>{runtimeTimelineCountLabel(childRuntimeEventRows.length, runtimeEvents.length)}</span>
          </summary>
          <div className="subagent-parent-cluster-child-runtime-event-list">
            {childRuntimeEventRows.map((event) => (
              <div key={event.key} className={`subagent-parent-cluster-child-runtime-event tone-${event.tone}`}>
                <span>{event.label}</span>
                {event.detail && <small title={event.detail}>{event.detail}</small>}
              </div>
            ))}
          </div>
        </details>
      )}
      {childMailboxEventRows.length > 0 && (
        <details
          className="subagent-parent-cluster-child-runtime-events subagent-parent-cluster-child-mailbox-events"
          aria-label={`Child mailbox timeline for ${child.title}`}
          data-child-mailbox-event-rendered-count={childMailboxEventRows.length}
          data-child-mailbox-event-omitted-count={childMailboxEventsOmitted}
          {...(mailboxTimelineOpen ? { open: true } : {})}
        >
          <summary className="subagent-parent-cluster-child-runtime-events-title">
            <strong>Child mailbox</strong>
            <span>{runtimeTimelineCountLabel(childMailboxEventRows.length, childMailboxTimelineRows.length)}</span>
          </summary>
          <div className="subagent-parent-cluster-child-runtime-event-list">
            {childMailboxEventRows.map((event) => (
              <div key={event.key} className={`subagent-parent-cluster-child-runtime-event tone-${event.tone}`}>
                <span>{event.label}</span>
                <small title={event.detail}>{event.detail}</small>
              </div>
            ))}
          </div>
        </details>
      )}
      {transcriptState.liveMarker && (
        <div className={`subagent-parent-cluster-child-transcript-live-marker tone-${transcriptState.liveMarker.tone}`}>
          <strong>{transcriptState.liveMarker.label}</strong>
          <span>{transcriptState.liveMarker.detail}</span>
        </div>
      )}
      {transcriptState.terminalSummary && (
        <div
          className={`subagent-parent-cluster-child-transcript-end tone-${transcriptState.terminalSummary.tone}`}
          data-child-terminal-summary="true"
        >
          <span className="subagent-parent-cluster-child-transcript-end-label">
            {transcriptState.terminalSummary.label}
          </span>
          <strong>{transcriptState.terminalSummary.status}</strong>
          <span>{transcriptState.terminalSummary.detail}</span>
        </div>
      )}
    </div>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function runtimeTimelineCountLabel(renderedCount: number, totalCount: number): string {
  if (totalCount <= renderedCount) return countLabel(totalCount, "event");
  return `Latest ${renderedCount} of ${totalCount} events`;
}

const CHILD_RUNTIME_TIMELINE_LIMIT = 24;
const CHILD_MAILBOX_TIMELINE_LIMIT = 4;
