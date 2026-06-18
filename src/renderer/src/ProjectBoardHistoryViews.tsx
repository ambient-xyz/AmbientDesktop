import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Play,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardGitSyncStatus, ProjectBoardSummary, ProjectBoardSynthesisRun, ProjectBoardSynthesisRunProgressiveRecord, ProjectSummary, RetryProjectBoardSynthesisInput } from "../../shared/projectBoardTypes";
import type { OrchestrationBoard } from "../../shared/workflowTypes";
import { DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS } from "../../shared/projectBoardSynthesisRecovery";
import { useRunningClock } from "./AutomationsWorkspace";
import {
  projectBoardSynthesisRunStageLabel,
  projectBoardSynthesisRunStatusLabel,
} from "./ProjectBoardSynthesisViews";
import {
  projectBoardHistoryCollaborationAudit,
  projectBoardHistoryImpactAudit,
  projectBoardHistoryRecoveryQueue,
  projectBoardOverviewModel,
  type ProjectBoardHistoryRecoveryAction,
  type ProjectBoardHistoryRecoveryActionId,
  type ProjectBoardHistoryRecoveryRun,
  type ProjectBoardTabId,
} from "./projectBoardUiModel";
import {
  projectBoardEventGroups,
  projectBoardEventHasSupersededCardReview,
  projectBoardEventKindLabel,
  projectBoardEventSummary,
  projectBoardSupersededCardReview,
  type ProjectBoardSupersededCardReview,
  type ProjectBoardSupersededCardReviewKind,
} from "./projectBoardHistoryUiModel";
import { formatTimelineTime } from "./RightPanel";

export function projectBoardImpactKindLabel(kind: ReturnType<typeof projectBoardOverviewModel>["impactQueue"]["items"][number]["kind"]): string {
  if (kind === "workflow") return "Workflow";
  if (kind === "decision") return "Decision";
  if (kind === "source") return "Source";
  if (kind === "proof") return "Proof";
  if (kind === "staged_update") return "Pi update";
  return "Recovery";
}


export function ProjectBoardHistoryTab({
  board,
  orchestrationBoard,
  gitStatus,
  gitError,
  retryBusy = false,
  deferBusy = false,
  onRetrySynthesis,
  onDeferSynthesisSections,
  onOpenSourceContext,
  onSelectTab,
  onSelectCard,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  orchestrationBoard?: OrchestrationBoard;
  gitStatus?: ProjectBoardGitSyncStatus;
  gitError?: string;
  retryBusy?: boolean;
  deferBusy?: boolean;
  onRetrySynthesis?: (runId: string, mode: RetryProjectBoardSynthesisInput["mode"]) => void;
  onDeferSynthesisSections?: (runId: string) => void;
  onOpenSourceContext?: () => void;
  onSelectTab?: (tabId: ProjectBoardTabId) => void;
  onSelectCard?: (cardId: string) => void;
}) {
  const events = board.events ?? [];
  const [historyFilter, setHistoryFilter] = useState<"all" | "superseded">("all");
  const [expandedRecoveryRunId, setExpandedRecoveryRunId] = useState<string | undefined>();
  const supersededReview = useMemo(() => projectBoardSupersededCardReview(events), [events]);
  const visibleEvents = historyFilter === "superseded" ? events.filter(projectBoardEventHasSupersededCardReview) : events;
  const groups = projectBoardEventGroups(visibleEvents);
  const hasActiveSynthesisRun = Boolean(board.synthesisRuns?.some((run) => run.status === "running" || run.status === "pause_requested"));
  const now = useRunningClock(hasActiveSynthesisRun, 5000);
  const recoveryQueue = useMemo(
    () => projectBoardHistoryRecoveryQueue(board, { nowMs: now, staleMs: DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS }),
    [board, now],
  );
  const impactAudit = useMemo(
    () =>
      projectBoardHistoryImpactAudit(board, {
        tasks: orchestrationBoard?.tasks,
        runs: orchestrationBoard?.runs,
        workflowReadiness: orchestrationBoard?.workflowReadiness,
        nowMs: now,
      }),
    [board, now, orchestrationBoard?.runs, orchestrationBoard?.tasks, orchestrationBoard?.workflowReadiness],
  );
  const collaborationAudit = useMemo(() => projectBoardHistoryCollaborationAudit(gitStatus, gitError), [gitStatus, gitError]);

  function handleRecoveryAction(run: ProjectBoardHistoryRecoveryRun, action: ProjectBoardHistoryRecoveryAction) {
    if (action.disabled) return;
    if (action.id === "view_progressive_records") {
      setExpandedRecoveryRunId((current) => (current === run.runId ? undefined : run.runId));
      return;
    }
    if (action.id === "open_source_context") {
      onOpenSourceContext?.();
      return;
    }
    if (action.id === "defer_failed_sections") {
      onDeferSynthesisSections?.(run.runId);
      return;
    }
    if (action.id === "start_fresh_from_paused_run") {
      const confirmed = window.confirm(
        "Start Fresh will abandon this paused checkpoint, clear untouched draft cards from that planning run, and start a new planner run from the current charter and sources. Ticketized, manual, and user-edited cards will be preserved for review and will not be active by default.",
      );
      if (!confirmed) return;
    }
    const mode = projectBoardHistoryRecoveryRetryMode(action.id);
    if (mode) onRetrySynthesis?.(run.runId, mode);
  }

  return (
    <section className="project-board-tab-panel project-board-history-panel" aria-label="Project board history">
      <header className="project-board-panel-header">
        <div>
          <span className="project-board-kicker">History</span>
          <h3>{visibleEvents.length} board event{visibleEvents.length === 1 ? "" : "s"}</h3>
        </div>
        <div className="project-board-history-toolbar">
          <span className="project-board-status project-board-history-summary">
            {historyFilter === "superseded" ? supersededReview.summary : projectBoardEventSummary(events)}
          </span>
          <div className="project-board-history-filters" role="group" aria-label="History filters">
            <button
              type="button"
              className={historyFilter === "all" ? "active" : ""}
              title="Show all board history events."
              onClick={() => setHistoryFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={historyFilter === "superseded" ? "active" : ""}
              disabled={supersededReview.items.length === 0}
              title={
                supersededReview.items.length === 0
                  ? "No Start Fresh superseded cards have been recorded yet."
                  : "Show cards that Start Fresh superseded, preserved, or moved back to review."
              }
              onClick={() => setHistoryFilter("superseded")}
            >
              Superseded
              <strong>{supersededReview.supersededCount}</strong>
            </button>
          </div>
        </div>
      </header>
      {collaborationAudit.visible && <ProjectBoardHistoryCollaborationAuditPanel audit={collaborationAudit} onSelectTab={onSelectTab} />}
      {impactAudit.visible && <ProjectBoardHistoryImpactAuditPanel audit={impactAudit} board={board} onSelectTab={onSelectTab} onSelectCard={onSelectCard} />}
      {recoveryQueue.length > 0 && (
        <ProjectBoardHistoryRecoveryPanel
          queue={recoveryQueue}
          runs={board.synthesisRuns ?? []}
          expandedRunId={expandedRecoveryRunId}
          retryBusy={retryBusy}
          deferBusy={deferBusy}
          onAction={handleRecoveryAction}
        />
      )}
      {historyFilter === "superseded" && <ProjectBoardSupersededCardsPanel review={supersededReview} />}
      {groups.length > 0 ? (
        <div className="project-board-history-groups">
          {groups.map((group) => (
            <section className="project-board-history-group" key={group.label}>
              <header>{group.label}</header>
              <div>
                {group.events.map((event) => (
                  <ProjectBoardHistoryEvent event={event} key={event.id} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="project-board-column-empty">No board history has been recorded yet.</div>
      )}
    </section>
  );
}


export function ProjectBoardHistoryCollaborationAuditPanel({
  audit,
  onSelectTab,
}: {
  audit: ReturnType<typeof projectBoardHistoryCollaborationAudit>;
  onSelectTab?: (tabId: ProjectBoardTabId) => void;
}) {
  return (
    <section className={`project-board-history-collaboration-panel ${audit.tone}`} aria-label="Collaboration and sync audit">
      <header>
        <div>
          <span className="project-board-kicker">Collaboration audit</span>
          <h4>{audit.headline}</h4>
          <p>{audit.detail}</p>
        </div>
        <div className="project-board-overview-metrics compact">
          {audit.metrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              <strong>{metric.value}</strong>
              {metric.label}
            </span>
          ))}
        </div>
      </header>
      <div className="project-board-history-collaboration-list">
        {audit.items.map((item) => {
          const itemStatusClass = item.tone === "danger" ? "danger" : item.tone === "warning" ? "warning" : item.tone === "ready" ? "ready" : "";
          return (
            <article key={item.id} className={`project-board-impact-item project-board-history-collaboration-item ${item.tone}`}>
              <div>
                <div className="project-board-impact-item-heading">
                  <span>Sync</span>
                  <strong>{item.title}</strong>
                </div>
                <p>{item.detail}</p>
                <div className="project-board-history-impact-meta">
                  <span className={`project-board-status ${itemStatusClass}`}>{item.statusLabel}</span>
                </div>
              </div>
              <div className="project-board-impact-side">
                <div className="project-board-overview-metrics compact">
                  {item.metrics.map((metric) => (
                    <span key={metric.label} title={metric.title}>
                      <strong>{metric.value}</strong>
                      {metric.label}
                    </span>
                  ))}
                </div>
                <button type="button" className={`secondary-button ${itemStatusClass}`} onClick={() => onSelectTab?.(item.tabId)} title={`Open ${item.actionLabel.toLowerCase()} actions.`}>
                  <span>{item.actionLabel}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}


export function ProjectBoardHistoryImpactAuditPanel({
  audit,
  board,
  onSelectTab,
  onSelectCard,
}: {
  audit: ReturnType<typeof projectBoardHistoryImpactAudit>;
  board: ProjectBoardSummary;
  onSelectTab?: (tabId: ProjectBoardTabId) => void;
  onSelectCard?: (cardId: string) => void;
}) {
  return (
    <section className="project-board-history-impact-panel" aria-label="Impact audit">
      <header>
        <div>
          <span className="project-board-kicker">Impact audit</span>
          <h4>{audit.headline}</h4>
          <p>{audit.detail}</p>
        </div>
        <div className="project-board-overview-metrics compact">
          {audit.metrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              <strong>{metric.value}</strong>
              {metric.label}
            </span>
          ))}
        </div>
      </header>
      <div className="project-board-history-impact-list">
        {audit.items.slice(0, 10).map((item) => {
          const affectedCards = item.affectedCardIds
            .map((cardId) => board.cards.find((card) => card.id === cardId))
            .filter((card): card is ProjectBoardCard => Boolean(card))
            .slice(0, 3);
          return (
            <article key={item.id} className={`project-board-impact-item project-board-history-impact-item ${item.tone}`}>
              <div>
                <div className="project-board-impact-item-heading">
                  <span>{projectBoardImpactKindLabel(item.kind)}</span>
                  <strong>{item.title}</strong>
                </div>
                <p>{item.detail}</p>
                {item.notes && item.notes.length > 0 && (
                  <ul className="project-board-history-impact-notes" aria-label="Impact audit notes">
                    {item.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
                <div className="project-board-history-impact-meta">
                  <span className={`project-board-status ${item.status === "active" ? "warning" : item.tone === "danger" ? "danger" : "ready"}`}>
                    {item.statusLabel}
                  </span>
                  <span className={item.modelCallRequired ? "project-board-status warning" : "project-board-status ready"}>
                    {item.modelCallRequired ? "Targeted Pi" : "0 model calls"}
                  </span>
                  {item.createdAt && <span>{formatTimelineTime(item.createdAt)}</span>}
                </div>
                {affectedCards.length > 0 && (
                  <div className="project-board-impact-cards" aria-label="Affected cards">
                    {affectedCards.map((card) => (
                      <button
                        type="button"
                        key={card.id}
                        className="project-board-source-link-button"
                        title={`Inspect ${card.title}.`}
                        onClick={() => onSelectCard?.(card.id)}
                      >
                        <span>{card.title}</span>
                      </button>
                    ))}
                    {item.affectedCardIds.length > affectedCards.length && <span>+{item.affectedCardIds.length - affectedCards.length} more</span>}
                  </div>
                )}
              </div>
              <div className="project-board-impact-side">
                <div className="project-board-overview-metrics compact">
                  {item.metrics.map((metric) => (
                    <span key={metric.label} title={metric.title}>
                      <strong>{metric.value}</strong>
                      {metric.label}
                    </span>
                  ))}
                </div>
                <button type="button" className="secondary-button" onClick={() => onSelectTab?.(item.tabId)} title={`Open ${projectBoardImpactKindLabel(item.kind)} actions.`}>
                  <span>{item.actionLabel}</span>
                </button>
              </div>
            </article>
          );
        })}
        {audit.items.length > 10 && <div className="project-board-column-empty">Showing latest 10 impact audit items. Older records remain in the event ledger below.</div>}
      </div>
    </section>
  );
}


export function ProjectBoardHistoryRecoveryPanel({
  queue,
  runs,
  expandedRunId,
  retryBusy,
  deferBusy,
  onAction,
}: {
  queue: ProjectBoardHistoryRecoveryRun[];
  runs: ProjectBoardSynthesisRun[];
  expandedRunId?: string;
  retryBusy: boolean;
  deferBusy: boolean;
  onAction: (run: ProjectBoardHistoryRecoveryRun, action: ProjectBoardHistoryRecoveryAction) => void;
}) {
  return (
    <section className="project-board-history-recovery-panel" aria-label="Planning recovery actions">
      <header>
        <div>
          <span className="project-board-kicker">Recovery actions</span>
          <h4>{queue.length} run{queue.length === 1 ? "" : "s"} need attention or have saved records</h4>
        </div>
        <span className="project-board-status warning">Actionable ledger</span>
      </header>
      <div className="project-board-history-recovery-list">
        {queue.map((run) => {
          const sourcePreview = run.sourcePaths.length > 0 ? run.sourcePaths.join(", ") : "Current board sources";
          const expanded = expandedRunId === run.runId;
          const sourceRun = runs.find((candidate) => candidate.id === run.runId);
          return (
            <article className={`project-board-history-recovery-card ${run.tone}`} key={run.runId}>
              <div className="project-board-history-recovery-main">
                <div className="project-board-card-header-row">
                  <span className="project-board-kicker">{projectBoardSynthesisRunStatusLabel(run.status)}</span>
                  <span className="project-board-status">{projectBoardSynthesisRunStageLabel(run.stage)}</span>
                </div>
                <h5>{run.title}</h5>
                <p>{run.summary}</p>
                <div className="project-board-proposal-meta">
                  <span>{run.completedSectionCount} complete/reused</span>
                  {run.failedSectionCount > 0 && <span>{run.failedSectionCount} failed</span>}
                  {run.progressiveRecordCount > 0 && <span>{run.progressiveRecordCount} progressive records</span>}
                  <span title={sourcePreview}>{sourcePreview}</span>
                  <span>{formatTimelineTime(run.updatedAt)}</span>
                </div>
              </div>
              <div className="project-board-history-recovery-actions">
                {run.actions.map((action) => {
                  const busy = projectBoardHistoryRecoveryActionBusy(action.id, retryBusy, deferBusy);
                  const disabled = action.disabled || busy;
                  return (
                    <button
                      type="button"
                      className={`secondary-button ${action.tone === "danger" ? "danger" : action.tone === "primary" ? "primary-toned" : ""}`}
                      disabled={disabled}
                      title={action.title}
                      onClick={() => onAction(run, action)}
                      key={action.id}
                    >
                      {projectBoardHistoryRecoveryActionIcon(action.id, busy, expanded)}
                      <span>{projectBoardHistoryRecoveryActionLabel(action, busy, expanded)}</span>
                    </button>
                  );
                })}
              </div>
              {expanded && sourceRun && <ProjectBoardProgressiveRecordPreview run={sourceRun} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}


export function ProjectBoardProgressiveRecordPreview({ run }: { run: ProjectBoardSynthesisRun }) {
  const records = run.progressiveRecords ?? [];
  const visibleRecords = records.slice(-12);
  return (
    <section className="project-board-progressive-record-preview" aria-label="Progressive planning records">
      <header>
        <strong>{records.length} progressive record{records.length === 1 ? "" : "s"}</strong>
        {records.length > visibleRecords.length && <span>Showing latest {visibleRecords.length}</span>}
      </header>
      {visibleRecords.length > 0 ? (
        <div>
          {visibleRecords.map((record, index) => (
            <article key={`${projectBoardProgressiveRecordText(record, "id") ?? index}:${index}`}>
              <span>{projectBoardProgressiveRecordText(record, "type") || "record"}</span>
              <div>
                <strong>{projectBoardProgressiveRecordTitle(record)}</strong>
                <p>{projectBoardProgressiveRecordDetail(record)}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="project-board-column-empty">This run recorded a count but no progressive records are available in the local projection.</p>
      )}
    </section>
  );
}


export function projectBoardHistoryRecoveryRetryMode(actionId: ProjectBoardHistoryRecoveryActionId): RetryProjectBoardSynthesisInput["mode"] | undefined {
  if (actionId === "retry_failed_sections") return "failed_sections";
  if (actionId === "retry_stalled_run") return "stalled_run";
  if (actionId === "continue_planner_batch") return "continue_batch";
  if (actionId === "resume_paused_run") return "paused_run";
  if (actionId === "start_fresh_from_paused_run") return "start_fresh";
  return undefined;
}


export function projectBoardHistoryRecoveryActionBusy(actionId: ProjectBoardHistoryRecoveryActionId, retryBusy: boolean, deferBusy: boolean): boolean {
  if (actionId === "defer_failed_sections") return deferBusy;
  return Boolean(projectBoardHistoryRecoveryRetryMode(actionId) && retryBusy);
}


export function projectBoardHistoryRecoveryActionLabel(
  action: ProjectBoardHistoryRecoveryAction,
  busy: boolean,
  expanded: boolean,
): string {
  if (action.id === "view_progressive_records") return expanded ? "Hide records" : action.label;
  if (!busy) return action.label;
  if (action.id === "defer_failed_sections") return "Deferring";
  if (action.id === "continue_planner_batch") return "Continuing";
  if (action.id === "resume_paused_run") return "Resuming";
  if (action.id === "start_fresh_from_paused_run") return "Starting fresh";
  return "Retrying";
}


export function projectBoardHistoryRecoveryActionIcon(actionId: ProjectBoardHistoryRecoveryActionId, busy: boolean, expanded: boolean) {
  if (busy) return <RefreshCw size={14} className="spin" />;
  if (actionId === "defer_failed_sections") return <CheckCircle2 size={14} />;
  if (actionId === "continue_planner_batch" || actionId === "resume_paused_run") return <Play size={14} />;
  if (actionId === "start_fresh_from_paused_run") return <RotateCcw size={14} />;
  if (actionId === "view_progressive_records") return expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />;
  if (actionId === "open_source_context") return <ExternalLink size={14} />;
  return <RefreshCw size={14} />;
}


export function projectBoardProgressiveRecordTitle(record: ProjectBoardSynthesisRunProgressiveRecord): string {
  return (
    projectBoardProgressiveRecordText(record, "title") ||
    projectBoardProgressiveRecordText(record, "cardTitle") ||
    projectBoardProgressiveRecordText(record, "question") ||
    projectBoardProgressiveRecordText(record, "sourcePath") ||
    "Progressive planning record"
  );
}


export function projectBoardProgressiveRecordDetail(record: ProjectBoardSynthesisRunProgressiveRecord): string {
  const metadata = projectBoardProgressiveRecordObject(record, "metadata");
  const details = [
    projectBoardProgressiveRecordText(record, "summary"),
    projectBoardProgressiveRecordText(metadata, "sectionHeading"),
    projectBoardProgressiveRecordText(metadata, "failureKind"),
    projectBoardProgressiveRecordText(metadata, "sourcePath"),
    projectBoardProgressiveRecordText(record, "createdAt"),
  ].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : "Saved by the planner runtime for recovery and audit.";
}


export function projectBoardProgressiveRecordText(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}


export function projectBoardProgressiveRecordObject(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}


export function ProjectBoardSupersededCardsPanel({ review }: { review: ProjectBoardSupersededCardReview }) {
  const groupedItems: Array<{ kind: ProjectBoardSupersededCardReviewKind; title: string; items: typeof review.items }> = [
    { kind: "superseded", title: "Superseded Draft Cards", items: review.items.filter((item) => item.category === "superseded") },
    { kind: "demoted", title: "Preserved For Review", items: review.items.filter((item) => item.category === "demoted") },
    { kind: "preserved", title: "Protected Cards Kept", items: review.items.filter((item) => item.category === "preserved") },
  ];
  return (
    <section className="project-board-superseded-review" aria-label="Start Fresh superseded card review">
      <header>
        <div>
          <span className="project-board-kicker">Start Fresh Review</span>
          <h4>{review.summary}</h4>
        </div>
        <span className="project-board-status">{review.eventCount} Start Fresh event{review.eventCount === 1 ? "" : "s"}</span>
      </header>
      {review.items.length > 0 ? (
        <div className="project-board-superseded-review-groups">
          {groupedItems
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section className={`project-board-superseded-review-group ${group.kind}`} key={group.kind}>
                <header>
                  <span>{group.title}</span>
                  <strong>{group.items.length}</strong>
                </header>
                <div>
                  {group.items.map((item) => (
                    <article className="project-board-superseded-card" key={`${item.eventId}:${item.category}:${item.cardId}`}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{projectBoardSupersededCardDetail(item)}</p>
                      </div>
                      <div className="project-board-history-event-meta">
                        <span>{projectBoardSupersededCardCategoryLabel(item.category)}</span>
                        {item.runId && <span>{item.runId}</span>}
                        {item.sourceId && <span>{item.sourceId}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="project-board-column-empty">No Start Fresh superseded cards have been recorded yet.</div>
      )}
    </section>
  );
}


export function projectBoardSupersededCardCategoryLabel(category: ProjectBoardSupersededCardReviewKind): string {
  if (category === "superseded") return "Superseded";
  if (category === "demoted") return "Preserved review";
  return "Protected";
}


export function projectBoardSupersededCardDetail(item: ProjectBoardSupersededCardReview["items"][number]): string {
  const details = [
    item.status ? `was ${item.status.replace(/_/g, " ")}` : undefined,
    item.candidateStatus ? `candidate ${item.candidateStatus.replace(/_/g, " ")}` : undefined,
    item.userTouchedFields.length > 0 ? `user-edited ${item.userTouchedFields.join(", ")}` : undefined,
    item.orchestrationTaskId ? "detached from Local Task" : undefined,
    item.executionThreadId ? "execution session preserved in history" : undefined,
    item.clarificationQuestionCount ? `${item.clarificationQuestionCount} cleared question${item.clarificationQuestionCount === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean);
  if (item.category === "superseded") return details.length > 0 ? `Archived by Start Fresh; ${details.join("; ")}.` : "Archived by Start Fresh.";
  if (item.category === "demoted") return details.length > 0 ? `Moved back to non-active review; ${details.join("; ")}.` : "Moved back to non-active review.";
  return details.length > 0 ? `Preserved for explicit review; ${details.join("; ")}.` : "Preserved for explicit review.";
}


export function ProjectBoardHistoryEvent({ event }: { event: ProjectBoardEvent }) {
  return (
    <article className="project-board-history-event">
      <div className="project-board-history-event-icon">
        <Clock size={14} />
      </div>
      <div>
        <div className="project-board-history-event-title">
          <strong>{event.title}</strong>
          <span>{projectBoardEventKindLabel(event.kind)}</span>
        </div>
        <p>{event.summary}</p>
        <div className="project-board-history-event-meta">
          <span>{projectBoardEventTimeLabel(event.createdAt)}</span>
          {event.entityKind && <span>{event.entityKind}</span>}
          {event.entityId && <span>{event.entityId}</span>}
        </div>
      </div>
    </article>
  );
}


export function projectBoardEventTimeLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}


export function projectBoardTabTitle(tabId: ProjectBoardTabId): string {
  if (tabId === "overview") return "Review the planner flow, current blockers, and deterministic impact queue.";
  if (tabId === "charter") return "Project charter, kickoff/revision answers, and source authority.";
  if (tabId === "draft_inbox") return "Review, clarify, split, reject, or approve candidate cards before ticketization.";
  if (tabId === "map") return "Inspect card dependencies, execution order, blockers, and critical path.";
  if (tabId === "board") return "Monitor and dispatch Local Task-backed executable cards.";
  if (tabId === "proof") return "Review proof expectations, proof packets, and PM close/revision decisions.";
  if (tabId === "integration") return "Apply, export, or defer completed Local Task deliverables.";
  if (tabId === "decisions") return "Resolve cross-cutting board decisions, proposal gaps, duplicate questions, and suggested answers before ticketization.";
  return "Inspect board history and PM audit events.";
}
