import { useMemo, type ComponentProps } from "react";

import type { DesktopState, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerPlanArtifact } from "../../shared/plannerTypes";
import { isRunStatusRunning } from "../../shared/runStatus";
import type { ChatMessage, RunStatus } from "../../shared/threadTypes";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
import { EMPTY_RUN_ACTIVITY_LINES, RunActivityFeed, type RunActivityLine } from "./AppRunActivity";
import { SubagentChildTranscriptLive } from "./SubagentChildTranscriptLive";
import { SubagentParentCluster, type SubagentParentClusterProps } from "./SubagentParentCluster";
import type {
  SubagentParentClusterChildModel,
  SubagentParentClusterModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterUiModel";
import { SubagentThreadInspector } from "./SubagentThreadInspector";

const EMPTY_ORPHANED_SUBAGENT_CLUSTERS: SubagentParentClusterModel[] = [];

export type AppConversationSubagentSurfacesProps = {
  visibleChatMessages: ChatMessage[];
  childMessagesByThreadId?: DesktopState["childMessagesByThreadId"];
  threads: DesktopState["threads"];
  subagentRunEvents: DesktopState["subagentRunEvents"];
  subagentMailboxEvents: DesktopState["subagentMailboxEvents"];
  threadRunStatuses: Record<string, RunStatus>;
  thinkingDisplayMode: ThinkingDisplayMode;
  runActivityLinesByThread: Record<string, RunActivityLine[]>;
  subagentParentClustersByMessageId: Map<string, SubagentParentClusterModel>;
  running: boolean;
  activeWorkspacePath: string;
  voiceProviderLabels: Record<string, string>;
  generatedMediaAutoplay: boolean;
  showPromptCacheStatus?: boolean;
  activeVoiceMessageId?: string;
  hasProjectBoard: boolean;
  chatFindOpen: boolean;
  chatFindQuery: string;
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
  onOpenSubagentThread: (child: SubagentParentClusterChildModel) => void | Promise<void>;
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
};

export function useAppConversationSubagentSurfaces(input: AppConversationSubagentSurfacesProps) {
  const orphanedSubagentClusters = useMemo(() => {
    if (input.subagentParentClustersByMessageId.size === 0) return EMPTY_ORPHANED_SUBAGENT_CLUSTERS;
    const visibleChatMessageIds = new Set(input.visibleChatMessages.map((message) => message.id));
    return [...input.subagentParentClustersByMessageId.values()].filter((cluster) => !visibleChatMessageIds.has(cluster.parentMessageId));
  }, [input.subagentParentClustersByMessageId, input.visibleChatMessages]);

  const renderSubagentChildTranscript = (child: SubagentParentClusterChildModel) => {
    const childMessages = input.childMessagesByThreadId?.[child.childThreadId] ?? [];
    const childThread = input.threads.find((thread) => thread.id === child.childThreadId);
    const childWorkspacePath = child.workspacePath || childThread?.workspacePath || input.activeWorkspacePath;
    const inferredChildRunStatus: RunStatus = child.statusTone === "active" ? "streaming" : "idle";
    const childRunStatus = input.threadRunStatuses[child.childThreadId] ?? inferredChildRunStatus;
    const childRuntimeEvents = input.subagentRunEvents.filter((event) => event.runId === child.runId);
    const childMailboxEvents = input.subagentMailboxEvents.filter((event) => event.runId === child.runId);
    return (
      <SubagentChildTranscriptLive
        child={child}
        messages={childMessages}
        workspacePath={childWorkspacePath}
        runtimeEvents={childRuntimeEvents}
        mailboxEvents={childMailboxEvents}
        runStatus={childRunStatus}
        parentRunning={input.running}
        thinkingDisplayMode={input.thinkingDisplayMode}
        voiceProviderLabels={input.voiceProviderLabels}
        generatedMediaAutoplay={input.generatedMediaAutoplay}
        showPromptCacheStatus={input.showPromptCacheStatus}
        activeVoiceMessageId={input.activeVoiceMessageId}
        runActivityLines={input.runActivityLinesByThread[child.childThreadId] ?? EMPTY_RUN_ACTIVITY_LINES}
        hasProjectBoard={input.hasProjectBoard}
        highlightQuery={input.chatFindOpen ? input.chatFindQuery : ""}
        onSendTelegramSessionSetupPrompt={input.onSendTelegramSessionSetupPrompt}
        onSendRemoteSurfaceActivationPrompt={input.onSendRemoteSurfaceActivationPrompt}
        onPreviewPath={input.onPreviewPath}
        onPreviewLocalPath={input.onPreviewLocalPath}
        onOpenMediaModal={input.onOpenMediaModal}
        onActiveVoiceMessageChange={input.onActiveVoiceMessageChange}
        onRegenerateVoice={input.onRegenerateVoice}
        onRevealVoiceArtifact={input.onRevealVoiceArtifact}
        onClearVoiceArtifact={input.onClearVoiceArtifact}
        onOpenUrl={input.onOpenUrl}
        onOpenBrowserUrl={input.onOpenBrowserUrl}
        onOpenBrowserPanel={input.onOpenBrowserPanel}
        onImplementPlannerPlan={input.onImplementPlannerPlan}
        onRefinePlannerPlan={input.onRefinePlannerPlan}
        onRetryPlannerFinalization={input.onRetryPlannerFinalization}
        onAddPlannerPlanToBoard={input.onAddPlannerPlanToBoard}
        onGeneratePlannerDurableArtifact={input.onGeneratePlannerDurableArtifact}
        onAnswerPlannerDecisionQuestion={input.onAnswerPlannerDecisionQuestion}
        onOpenThread={input.onOpenSubagentThread}
      />
    );
  };

  const liveInlineChildRunIdsForCluster = (cluster: SubagentParentClusterModel): string[] =>
    cluster.children
      .filter((child) =>
        childShouldAutoOpenInlineTranscript(child, {
          childMessagesByThreadId: input.childMessagesByThreadId,
          subagentRunEvents: input.subagentRunEvents,
          subagentMailboxEvents: input.subagentMailboxEvents,
          threadRunStatuses: input.threadRunStatuses,
          runActivityLinesByThread: input.runActivityLinesByThread,
        }),
      )
      .map((child) => child.runId);

  const renderSubagentParentCluster = (subagentCluster: SubagentParentClusterModel) => {
    const liveInlineChildRunIds = liveInlineChildRunIdsForCluster(subagentCluster);
    const subagentClusterAutoOpen = Boolean(
      liveInlineChildRunIds.length > 0 ||
      (subagentCluster.parentBlocking && subagentCluster.statusTone !== "success") ||
      subagentCluster.workflowTasks.some((task) => task.childWait),
    );
    return (
      <SubagentParentCluster
        model={subagentCluster}
        autoOpen={subagentClusterAutoOpen}
        liveChildRunIds={liveInlineChildRunIds}
        onOpenThread={input.onOpenSubagentThread}
        onCancelChild={input.onCancelSubagentChild}
        onCloseChild={input.onCloseSubagentChild}
        onOpenWorkflowThread={input.onOpenCallableWorkflowThread}
        onPauseWorkflowTask={input.onPauseCallableWorkflowTask}
        onResumeWorkflowTask={input.onResumeCallableWorkflowTask}
        onCancelWorkflowTask={input.onCancelCallableWorkflowTask}
        onResolveBarrierAction={input.onResolveSubagentBarrierAction}
        onResolveApprovalAction={input.onResolveSubagentApprovalAction}
        renderChildTranscript={renderSubagentChildTranscript}
        cancelChildBusyId={input.subagentChildCancelBusy}
        closeChildBusyId={input.subagentChildCloseBusy}
        pauseWorkflowTaskBusyId={input.callableWorkflowTaskPauseBusy}
        resumeWorkflowTaskBusyId={input.callableWorkflowTaskResumeBusy}
        cancelWorkflowTaskBusyId={input.callableWorkflowTaskCancelBusy}
        barrierActionBusyId={input.subagentBarrierActionBusy}
        approvalActionBusyId={input.subagentApprovalActionBusy}
      />
    );
  };

  return {
    orphanedSubagentClusters,
    renderSubagentParentCluster,
  };
}

export function childShouldAutoOpenInlineTranscript(
  child: SubagentParentClusterChildModel,
  input: {
    childMessagesByThreadId?: DesktopState["childMessagesByThreadId"];
    subagentRunEvents: DesktopState["subagentRunEvents"];
    subagentMailboxEvents: DesktopState["subagentMailboxEvents"];
    threadRunStatuses: Record<string, RunStatus>;
    runActivityLinesByThread: Record<string, RunActivityLine[]>;
  },
): boolean {
  const childMessages = input.childMessagesByThreadId?.[child.childThreadId] ?? [];
  const childRunStatus = input.threadRunStatuses[child.childThreadId];
  const childRunning = childRunStatus ? isRunStatusRunning(childRunStatus) : child.statusTone === "active";
  const childRuntimeEventsVisible = input.subagentRunEvents.some((event) => event.runId === child.runId);
  const childMailboxEventsVisible = input.subagentMailboxEvents.some(
    (event) => event.runId === child.runId && event.type !== "subagent.task",
  );
  const childActivityVisible = (input.runActivityLinesByThread[child.childThreadId]?.length ?? 0) > 0;
  const childHasLiveEvidence = childMessages.length > 0 || childRuntimeEventsVisible || childMailboxEventsVisible || childActivityVisible;
  const childNeedsParentControl = Boolean(child.parentBlocker && child.parentBlocker.statusTone !== "success");
  if (childNeedsParentControl) return true;
  if (child.isTerminal) return false;
  return childRunning || child.statusTone === "active" || childHasLiveEvidence;
}

export function AppConversationSubagentChildStartingState({
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
        <div className="subagent-child-starting-empty">Waiting for the first child stream event...</div>
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
