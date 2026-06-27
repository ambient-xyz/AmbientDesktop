import { AlertCircle, CheckCircle2, FileText, Kanban, LoaderCircle, Pause, Play, RefreshCw, RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ProjectBoardSynthesisRun } from "../../shared/projectBoardTypes";
import { projectBoardRunBlocksPlanning, projectBoardRunIsKickoffDefaults } from "../../shared/projectBoardSynthesisGate";
import {
  DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  projectBoardSynthesisOutputCapRecovery,
  projectBoardSynthesisPartialStatus,
  projectBoardSynthesisSectionStatuses,
  projectBoardSynthesisStaleRecovery,
  sectionStatusLabel,
  type ProjectBoardSectionStatusView,
} from "../../shared/projectBoardSynthesisRecovery";
import { formatRunDuration, useRunningClock } from "./AutomationsWorkspace";
import { ProjectBoardProofScopeWarningSummary } from "./ProjectBoardCandidateDetailViews";
import {
  projectBoardSynthesisRunControlState,
  projectBoardSynthesisRunPromptBudgetAudit,
  projectBoardSynthesisRunPromptBudgetMetrics,
} from "./projectBoardUiModel";
import { projectBoardSynthesisRunProofScopeWarnings } from "./projectBoardPlanningWarningUiModel";
import { formatTimelineTime } from "./RightPanel";

export function ProjectBoardSynthesisRunLedger({
  run,
  retryBusy = false,
  deferBusy = false,
  onRetryFailedSections,
  onRetryStalledRun,
  onContinuePlannerBatch,
  onResumePausedRun,
  onStartFreshFromPausedRun,
  onDeferFailedSections,
}: {
  run: ProjectBoardSynthesisRun;
  retryBusy?: boolean;
  deferBusy?: boolean;
  onRetryFailedSections?: (runId: string) => void;
  onRetryStalledRun?: (runId: string) => void;
  onContinuePlannerBatch?: (runId: string) => void;
  onResumePausedRun?: (runId: string) => void;
  onStartFreshFromPausedRun?: (runId: string) => void;
  onDeferFailedSections?: (runId: string) => void;
}) {
  const now = useRunningClock(run.status === "running" || run.status === "pause_requested");
  const eventListRef = useRef<HTMLOListElement>(null);
  const promptBudgetMetrics = projectBoardSynthesisRunPromptBudgetMetrics(run);
  const promptBudgetAudit = projectBoardSynthesisRunPromptBudgetAudit(run);
  const metrics = [
    { label: "Sources", value: run.sourceCount ? `${run.includedSourceCount}/${run.sourceCount}` : undefined },
    { label: "Source chars", value: run.sourceCharCount ? run.sourceCharCount.toLocaleString() : undefined },
    ...promptBudgetMetrics,
    { label: "Response chars", value: run.responseCharCount?.toLocaleString() },
    { label: "Runtime records", value: run.progressiveRecordCount?.toLocaleString() },
    { label: "Sections", value: projectBoardSynthesisSectionMetric(run) },
    { label: "Cards", value: run.cardCount?.toLocaleString() },
    { label: "Questions", value: run.questionCount?.toLocaleString() },
    { label: "Elapsed", value: formatRunDuration(run.startedAt, run.completedAt ?? new Date(now).toISOString()) },
  ].filter((item): item is { label: string; value: string; title?: string } => Boolean(item.value));
  const progressiveSummary = run.progressiveSummary;
  const renderedCardLedgerSummary = projectBoardRenderedCardLedgerSummary(progressiveSummary);
  const proofScopeWarnings = projectBoardSynthesisRunProofScopeWarnings(run);
  const sectionStatuses = projectBoardSynthesisSectionStatuses(run);
  const partialStatus = projectBoardSynthesisPartialStatus(run);
  const staleRecovery = projectBoardSynthesisStaleRecovery(run, {
    nowMs: now,
    staleMs: DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  });
  const outputCapRecovery = projectBoardSynthesisOutputCapRecovery(run);
  const canContinueOutputCap =
    outputCapRecovery.canContinue &&
    run.status !== "running" &&
    run.status !== "pause_requested" &&
    run.status !== "paused" &&
    run.status !== "abandoned";
  const synthesisRunControls = projectBoardSynthesisRunControlState(run, { resumeBusy: retryBusy, startFreshBusy: retryBusy });
  const canResumePaused = synthesisRunControls.resume.visible && Boolean(onResumePausedRun);
  const canStartFreshPaused = synthesisRunControls.startFresh.visible && Boolean(onStartFreshFromPausedRun);
  useEffect(() => {
    const list = eventListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: run.status === "running" || run.status === "pause_requested" ? "smooth" : "auto" });
  }, [run.id, run.events.length, run.responseCharCount, run.cardCount, run.progressiveRecordCount, run.status]);
  return (
    <section className="project-board-synthesis-run-ledger" aria-label="Project board synthesis run ledger">
      <header>
        <div>
          <span className="project-board-kicker">Synthesis run</span>
          <h3>{projectBoardSynthesisRunStageLabel(run.stage)}</h3>
        </div>
        <div className="project-board-synthesis-run-header-actions">
          <span
            className={`project-board-status ${run.status === "running" || run.status === "pause_requested" ? "warning" : run.status === "failed" ? "danger" : ""}`}
          >
            {projectBoardSynthesisRunStatusLabel(run.status)}
          </span>
          {staleRecovery.stale && onRetryStalledRun && (
            <button
              type="button"
              className="secondary-button"
              disabled={retryBusy}
              title={staleRecovery.summary}
              onClick={() => onRetryStalledRun(run.id)}
            >
              <RefreshCw size={14} className={retryBusy ? "spin" : ""} />
              <span>{retryBusy ? "Retrying" : "Mark Stalled And Retry"}</span>
            </button>
          )}
          {staleRecovery.stale && (
            <button
              type="button"
              className="secondary-button"
              disabled={retryBusy}
              title="Record this run as stalled without restarting planning. Use this when the board's work is already complete and a retry would only propose duplicate cards."
              onClick={() => void window.ambientDesktop.abandonProjectBoardSynthesisRun({ boardId: run.boardId, runId: run.id })}
            >
              <X size={14} />
              <span>Abandon Run</span>
            </button>
          )}
          {canContinueOutputCap && onContinuePlannerBatch && (
            <button
              type="button"
              className="secondary-button"
              disabled={retryBusy}
              title={outputCapRecovery.summary}
              onClick={() => onContinuePlannerBatch(run.id)}
            >
              <Play size={14} className={retryBusy ? "spin" : ""} />
              <span>{retryBusy ? "Continuing" : "Continue Planner Batch"}</span>
            </button>
          )}
          {canResumePaused && onResumePausedRun && (
            <button
              type="button"
              className="secondary-button"
              disabled={synthesisRunControls.resume.disabled}
              title={synthesisRunControls.resume.title}
              onClick={() => onResumePausedRun(run.id)}
            >
              <Play size={14} className={retryBusy ? "spin" : ""} />
              <span>{retryBusy ? synthesisRunControls.resume.busyLabel : synthesisRunControls.resume.label}</span>
            </button>
          )}
          {canStartFreshPaused && onStartFreshFromPausedRun && (
            <button
              type="button"
              className="secondary-button danger"
              disabled={synthesisRunControls.startFresh.disabled}
              title={synthesisRunControls.startFresh.title}
              onClick={() => {
                if (
                  window.confirm(
                    "Start Fresh will abandon this paused checkpoint, clear untouched draft cards from that planning run, and start a new planner run from the current charter and sources. Ticketized, manual, and user-edited cards will be preserved for review and will not be active by default.",
                  )
                ) {
                  onStartFreshFromPausedRun(run.id);
                }
              }}
            >
              <RotateCcw size={14} className={retryBusy ? "spin" : ""} />
              <span>{retryBusy ? synthesisRunControls.startFresh.busyLabel : synthesisRunControls.startFresh.label}</span>
            </button>
          )}
        </div>
      </header>
      <div className="project-board-proposal-meta">
        {run.model && <span>{run.model}</span>}
        {metrics.map((item) => (
          <span key={item.label} title={item.title}>
            {item.label}: {item.value}
          </span>
        ))}
        <span>{formatTimelineTime(run.startedAt)}</span>
      </div>
      {promptBudgetAudit?.visible && <ProjectBoardPromptBudgetAudit audit={promptBudgetAudit} />}
      {run.error && (
        <p className="project-board-synthesis-run-error">
          <AlertCircle size={14} />
          <span>{run.error}</span>
        </p>
      )}
      {staleRecovery.stale && (
        <p className="project-board-synthesis-run-partial">
          <AlertCircle size={14} />
          <span>{staleRecovery.summary}</span>
        </p>
      )}
      {canContinueOutputCap && (
        <p className="project-board-synthesis-run-partial">
          <AlertCircle size={14} />
          <span>{outputCapRecovery.summary}</span>
        </p>
      )}
      {run.status === "paused" && (
        <p className="project-board-synthesis-run-partial">
          <Pause size={14} />
          <span>
            Planning is paused at a validated checkpoint. Resume will create a new run, reuse saved planner records, and continue with
            remaining cards. Start Fresh abandons this checkpoint and asks Ambient/Pi to synthesize from the current board and source
            context instead.
          </span>
        </p>
      )}
      {partialStatus.hasPartialProposal && (
        <p className={`project-board-synthesis-run-partial ${partialStatus.deferred ? "deferred" : ""}`}>
          <AlertCircle size={14} />
          <span>{partialStatus.summary}</span>
        </p>
      )}
      {progressiveSummary && (
        <p className="project-board-synthesis-run-records">
          <FileText size={14} />
          <span>
            Runtime records: {progressiveSummary.candidateCardCount} cards, {progressiveSummary.questionCount} questions,{" "}
            {progressiveSummary.sourceCoverageCount} source coverage records, {progressiveSummary.dependencyEdgeCount} dependency edges
            {progressiveSummary.warningCount ? `, ${progressiveSummary.warningCount} warnings` : ""}
            {progressiveSummary.semanticIdleSectionCount
              ? `, ${progressiveSummary.semanticIdleSectionCount} semantic idle section${progressiveSummary.semanticIdleSectionCount === 1 ? "" : "s"}`
              : ""}
            {progressiveSummary.latestError ? `. Latest recoverable error: ${progressiveSummary.latestError}` : "."}
          </span>
        </p>
      )}
      {renderedCardLedgerSummary && (
        <p className="project-board-synthesis-run-records">
          <Kanban size={14} />
          <span>{renderedCardLedgerSummary}</span>
        </p>
      )}
      {proofScopeWarnings.length > 0 && (
        <section className="project-board-proof-scope-warning-list" aria-label="Proof-scope warnings">
          <header>
            <span className="project-board-kicker">Proof ownership warnings</span>
            <strong>
              {proofScopeWarnings.length} card{proofScopeWarnings.length === 1 ? "" : "s"} need proof-scope review
            </strong>
          </header>
          <div>
            {proofScopeWarnings.slice(0, 5).map((warning) => (
              <ProjectBoardProofScopeWarningSummary warnings={[warning]} key={`${warning.runId}:${warning.cardRef}:${warning.message}`} />
            ))}
          </div>
        </section>
      )}
      {sectionStatuses.length > 0 && (
        <ProjectBoardSynthesisSectionStatusList
          run={run}
          statuses={sectionStatuses}
          retryBusy={retryBusy}
          deferBusy={deferBusy}
          onRetryFailedSections={onRetryFailedSections}
          onDeferFailedSections={onDeferFailedSections}
        />
      )}
      <ol ref={eventListRef}>
        {run.events.map((event, index) => (
          <li key={`${event.createdAt}:${index}`}>
            <span
              className={`project-board-synthesis-run-dot ${
                (run.status === "running" || run.status === "pause_requested") && index === run.events.length - 1 ? "active" : ""
              }`}
              aria-hidden="true"
            />
            <div>
              <strong>{event.title}</strong>
              <p>{event.summary}</p>
              <small>
                {formatTimelineTime(event.createdAt)} · {projectBoardSynthesisRunStageLabel(event.stage)}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ProjectBoardPromptBudgetAudit({
  audit,
  compact = false,
}: {
  audit: NonNullable<ReturnType<typeof projectBoardSynthesisRunPromptBudgetAudit>>;
  compact?: boolean;
}) {
  return (
    <section className={`project-board-prompt-budget-audit ${audit.tone} ${compact ? "compact" : ""}`} aria-label="Prompt budget audit">
      <header>
        <div>
          <span className="project-board-kicker">Prompt budget</span>
          <strong>{audit.headline}</strong>
          {!compact && <p>{audit.detail}</p>}
        </div>
        {compact && (
          <span
            className={`project-board-status ${audit.tone === "warning" ? "warning" : audit.tone === "danger" ? "danger" : audit.tone === "ready" ? "ready" : ""}`}
          >
            {audit.tone === "ready" ? "Compacted" : audit.tone === "warning" ? "Review" : "Tracked"}
          </span>
        )}
      </header>
      {!compact && audit.metrics.length > 0 && (
        <div className="project-board-prompt-budget-audit-metrics">
          {audit.metrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              <strong>{metric.value}</strong>
              {metric.label}
            </span>
          ))}
        </div>
      )}
      {audit.notes.length > 0 && (
        <div className="project-board-prompt-budget-audit-notes">
          {(compact ? audit.notes.slice(0, 1) : audit.notes).map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProjectBoardSynthesisSectionStatusList({
  run,
  statuses,
  retryBusy = false,
  deferBusy = false,
  onRetryFailedSections,
  onDeferFailedSections,
}: {
  run: ProjectBoardSynthesisRun;
  statuses: ProjectBoardSectionStatusView[];
  retryBusy?: boolean;
  deferBusy?: boolean;
  onRetryFailedSections?: (runId: string) => void;
  onDeferFailedSections?: (runId: string) => void;
}) {
  const partialStatus = projectBoardSynthesisPartialStatus(run);
  const failedCount = statuses.filter((status) => status.status === "failed").length;
  const reusedCount = statuses.filter((status) => status.status === "skipped").length;
  const completedCount = statuses.filter((status) => status.status === "succeeded").length;
  const canActOnFailures = failedCount > 0 && run.status !== "running" && run.status !== "pause_requested" && run.status !== "abandoned";
  return (
    <section className="project-board-section-status-panel" aria-label="Source section planning status">
      <header>
        <div>
          <span className="project-board-kicker">Section status</span>
          <strong>
            {completedCount + reusedCount} complete
            {failedCount ? ` · ${failedCount} needs retry` : ""}
          </strong>
        </div>
        <div className="project-board-section-status-actions">
          {reusedCount > 0 && <span className="project-board-status">Reused {reusedCount}</span>}
          {partialStatus.deferred && <span className="project-board-status warning">Deferred</span>}
          {canActOnFailures && onRetryFailedSections && (
            <button
              type="button"
              className="secondary-button"
              disabled={retryBusy}
              title="Start a resumable Ambient/Pi retry that reuses completed section records and replans only sections that still failed or remain uncovered."
              onClick={() => onRetryFailedSections(run.id)}
            >
              <RefreshCw size={14} className={retryBusy ? "spin" : ""} />
              <span>{retryBusy ? "Retrying" : "Retry Failed Sections"}</span>
            </button>
          )}
          {canActOnFailures && onDeferFailedSections && (
            <button
              type="button"
              className="secondary-button"
              disabled={deferBusy || partialStatus.deferred}
              title="Keep the current partial proposal and record that the failed source sections are intentionally deferred for now."
              onClick={() => onDeferFailedSections(run.id)}
            >
              <CheckCircle2 size={14} />
              <span>{partialStatus.deferred ? "Deferred" : deferBusy ? "Deferring" : "Defer Failed Sections"}</span>
            </button>
          )}
        </div>
      </header>
      {failedCount > 0 && (
        <p className="project-board-section-status-note">
          Failed sections are unresolved source coverage, not invisible background state. Retry failed sections to ask Pi for the missing
          slices, or defer them when the current partial proposal is enough to keep moving.
        </p>
      )}
      <div className="project-board-section-status-list">
        {statuses.map((section) => (
          <div className={`project-board-section-status-item ${section.status}`} key={section.key}>
            {section.status === "failed" ? (
              <AlertCircle size={14} />
            ) : section.status === "skipped" ? (
              <RotateCcw size={14} />
            ) : (
              <CheckCircle2 size={14} />
            )}
            <div>
              <strong>
                {section.sectionIndex && section.sectionCount ? `${section.sectionIndex}/${section.sectionCount} · ` : ""}
                {section.sectionHeading || "Source section"}
              </strong>
              <span>
                {sectionStatusLabel(section.status, section.failureKind)}
                {section.sourcePath ? ` · ${section.sourcePath}` : ""} · {formatTimelineTime(section.updatedAt)}
              </span>
              <p>{section.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProjectBoardSynthesisActivity({
  run,
  action,
  retryBusy = false,
  pauseBusy = false,
  onRetry,
  onRetryStalledRun,
  onPause,
  onResumePausedRun,
}: {
  run?: ProjectBoardSynthesisRun;
  action: string;
  retryBusy?: boolean;
  pauseBusy?: boolean;
  onRetry?: () => void;
  onRetryStalledRun?: () => void;
  onPause?: () => void;
  onResumePausedRun?: () => void;
}) {
  const activityLinesRef = useRef<HTMLDivElement>(null);
  const now = useRunningClock(run?.status === "running" || run?.status === "pause_requested");
  const promptBudgetMetrics = projectBoardSynthesisRunPromptBudgetMetrics(run);
  const promptBudgetAudit = projectBoardSynthesisRunPromptBudgetAudit(run);
  const kickoffDefaultsMetric = projectBoardKickoffDefaultsRunMetric(run);
  const metrics = run
    ? [
        { label: "Sources", value: run.sourceCount ? `${run.includedSourceCount}/${run.sourceCount}` : undefined },
        { label: "Source chars", value: run.sourceCharCount ? run.sourceCharCount.toLocaleString() : undefined },
        ...promptBudgetMetrics,
        { label: "Response chars", value: run.responseCharCount?.toLocaleString() },
        kickoffDefaultsMetric,
        { label: "Runtime records", value: run.progressiveRecordCount?.toLocaleString() },
        {
          label: "Sections",
          value: projectBoardSynthesisSectionMetric(run),
        },
        { label: "Cards", value: run.cardCount?.toLocaleString() },
        { label: "Elapsed", value: formatRunDuration(run.startedAt, run.completedAt ?? new Date(now).toISOString()) },
      ].filter((item): item is { label: string; value: string; title?: string } => Boolean(item.value))
    : [];
  const percent = projectBoardSynthesisRunPercent(run);
  const eventRows = run ? projectBoardSynthesisActivityEvents(run) : [];
  const status = run?.status ?? "running";
  const staleRecovery = run
    ? projectBoardSynthesisStaleRecovery(run, {
        nowMs: now,
        staleMs: DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
      })
    : undefined;
  const title = run ? projectBoardSynthesisRunStageLabel(run.stage) : action;
  const subtitle = run
    ? staleRecovery?.stale
      ? staleRecovery.summary
      : `${projectBoardSynthesisRunStatusLabel(run.status)}. ${run.events.at(-1)?.summary ?? action}`
    : "Creating the board shell, scanning project files and threads, and waiting for Pi source-classification telemetry.";
  const eventScrollKey = eventRows.map(({ event, index }) => `${index}:${event.createdAt}:${event.stage}:${event.title}`).join("|");
  const synthesisRunControls = projectBoardSynthesisRunControlState(run, { pauseBusy, resumeBusy: retryBusy });
  const canPause = synthesisRunControls.pause.visible && Boolean(onPause);
  const canResumePaused = synthesisRunControls.resume.visible && Boolean(onResumePausedRun);

  useEffect(() => {
    const list = activityLinesRef.current;
    if (!list) return;
    list.scrollTo({
      top: list.scrollHeight,
      behavior: "auto",
    });
  }, [eventScrollKey, run?.id, status]);

  return (
    <section
      className="project-board-synthesis-activity run-activity-card"
      role="status"
      aria-live="polite"
      aria-label="Project board synthesis progress"
    >
      <div className="run-activity-header">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        {staleRecovery?.stale && onRetryStalledRun ? (
          <div className="project-board-card-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={retryBusy}
              title={staleRecovery.summary}
              onClick={onRetryStalledRun}
            >
              <RefreshCw size={14} className={retryBusy ? "spin" : ""} />
              <span>{retryBusy ? "Retrying" : "Mark Stalled And Retry"}</span>
            </button>
            {run && (
              <button
                type="button"
                className="secondary-button"
                disabled={retryBusy}
                title="Record this run as stalled without restarting planning. Use this when the board's work is already complete and a retry would only propose duplicate cards."
                onClick={() => void window.ambientDesktop.abandonProjectBoardSynthesisRun({ boardId: run.boardId, runId: run.id })}
              >
                <X size={14} />
                <span>Abandon Run</span>
              </button>
            )}
          </div>
        ) : canPause ? (
          <button
            type="button"
            className="secondary-button"
            disabled={synthesisRunControls.pause.disabled}
            title={synthesisRunControls.pause.title}
            onClick={onPause}
          >
            <Pause size={14} className={pauseBusy ? "spin" : ""} />
            <span>{pauseBusy ? synthesisRunControls.pause.busyLabel : synthesisRunControls.pause.label}</span>
          </button>
        ) : canResumePaused ? (
          <button
            type="button"
            className="secondary-button"
            disabled={synthesisRunControls.resume.disabled}
            title={synthesisRunControls.resume.title}
            onClick={onResumePausedRun}
          >
            <Play size={14} className={retryBusy ? "spin" : ""} />
            <span>{retryBusy ? synthesisRunControls.resume.busyLabel : synthesisRunControls.resume.label}</span>
          </button>
        ) : status === "failed" && onRetry ? (
          <button
            type="button"
            className="secondary-button"
            disabled={retryBusy}
            title="Retry live Ambient/Pi board synthesis."
            onClick={onRetry}
          >
            <RefreshCw size={14} className={retryBusy ? "spin" : ""} />
            <span>{retryBusy ? "Retrying" : "Retry"}</span>
          </button>
        ) : status === "failed" ? (
          <AlertCircle size={16} />
        ) : status === "succeeded" ? (
          <CheckCircle2 size={16} />
        ) : status === "paused" ? (
          <Play size={16} />
        ) : (
          <LoaderCircle size={16} className="spin" />
        )}
      </div>
      <div className="workflow-compile-meter" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      {metrics.length > 0 && (
        <div className="run-activity-metrics">
          {metrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              {metric.label}: {metric.value}
            </span>
          ))}
        </div>
      )}
      {promptBudgetAudit?.visible && <ProjectBoardPromptBudgetAudit audit={promptBudgetAudit} compact />}
      <div className="run-activity-lines" ref={activityLinesRef}>
        {eventRows.length === 0 && (
          <div className="run-activity-line thinking heartbeat active">
            <span />
            <p>{action}. Source scans, prompt size, response size, and generated card counts will appear here as Ambient/Pi progresses.</p>
          </div>
        )}
        {eventRows.map(({ event, index }) => {
          const active = index === (run?.events.length ?? 0) - 1 && (run?.status === "running" || run?.status === "pause_requested");
          return (
            <div
              key={`${event.createdAt}:${index}`}
              className={`run-activity-line ${event.stage === "failed" ? "error" : "thinking"} ${active ? "heartbeat active" : ""}`}
            >
              <span />
              <p>
                {event.title}
                <small className="project-board-synthesis-activity-detail">
                  {event.summary} · {formatTimelineTime(event.createdAt)} · {projectBoardSynthesisRunStageLabel(event.stage)}
                </small>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function projectBoardSynthesisActivityEvents(
  run: ProjectBoardSynthesisRun,
): Array<{ event: ProjectBoardSynthesisRun["events"][number]; index: number }> {
  const rows = run.events.map((event, index) => ({ event, index }));
  const recentLimit = run.status === "running" || run.status === "pause_requested" ? 10 : 14;
  const important = rows.filter(({ event }) => {
    const text = `${event.title} ${event.summary}`.toLowerCase();
    return (
      event.stage === "charter_summary" ||
      event.stage === "failed" ||
      /\b(retry|retrying|failed|failure|transient|stalled|error)\b/.test(text)
    );
  });
  const selected = new Set<number>();
  for (const row of rows.slice(-recentLimit)) selected.add(row.index);
  for (const row of important.slice(-8)) selected.add(row.index);
  return rows.filter((row) => selected.has(row.index));
}

export function projectBoardSynthesisSectionMetric(run: ProjectBoardSynthesisRun): string | undefined {
  const summary = run.progressiveSummary;
  const done = summary?.sectionSucceededCount ?? 0;
  const skipped = summary?.sectionSkippedCount ?? 0;
  const failed = summary?.sectionFailedCount ?? 0;
  const totalFromEvents = run.events.reduce((total, event) => {
    const sectionCount = event.metadata?.sectionCount;
    return typeof sectionCount === "number" && Number.isFinite(sectionCount) ? Math.max(total, sectionCount) : total;
  }, 0);
  const touched = done + skipped + failed;
  if (totalFromEvents <= 0 && touched <= 0) return undefined;
  const parts = [`${Math.max(done + skipped, 0)}/${Math.max(totalFromEvents, touched)}`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} reused`);
  return parts.join(" · ");
}

export function projectBoardRenderedCardLedgerSummary(summary?: ProjectBoardSynthesisRun["progressiveSummary"]): string | undefined {
  const ledger = summary?.renderedCardLedger ?? [];
  const cardCount = summary?.renderedCardCount ?? ledger.length;
  if (!cardCount) return undefined;
  const reusable = ledger.filter((entry) => entry.restartAction === "reuse_rendered_card").length;
  const waiting = ledger.filter((entry) => entry.restartAction === "wait_for_clarification").length;
  const skipped = ledger.filter((entry) => entry.restartAction === "skip_duplicate" || entry.restartAction === "skip_rejected").length;
  const evidence = ledger.filter((entry) => entry.restartAction === "keep_evidence").length;
  const invalidated = summary?.renderedCardInvalidatedCount ?? ledger.filter((entry) => entry.restartAction === "regenerate_card").length;
  const splitCount = summary?.renderedCardSplitLineageCount ?? ledger.filter((entry) => entry.splitLineage).length;
  const parts = [
    `${cardCount.toLocaleString()} indexed`,
    reusable ? `${reusable.toLocaleString()} reusable` : "",
    waiting ? `${waiting.toLocaleString()} waiting on clarification` : "",
    skipped ? `${skipped.toLocaleString()} skipped duplicate/rejected` : "",
    evidence ? `${evidence.toLocaleString()} evidence-only` : "",
    invalidated ? `${invalidated.toLocaleString()} eligible for regeneration` : "",
    splitCount ? `${splitCount.toLocaleString()} split child${splitCount === 1 ? "" : "ren"}` : "",
  ].filter(Boolean);
  const checksum = summary?.renderedCardLedgerChecksum ? ` Checksum: ${summary.renderedCardLedgerChecksum}.` : "";
  return `Rendered-card restart ledger: ${parts.join(", ")}.${checksum}`;
}

export function projectBoardSynthesisRunPercent(run?: ProjectBoardSynthesisRun): number {
  if (!run) return 8;
  if (run.status === "paused") return 100;
  if (run.status === "pause_requested") return 96;
  if (run.status !== "running") return 100;
  if (run.stage === "source_scan") return 16;
  if (run.stage === "sources_persisted") return 28;
  if (run.stage === "source_classification") return 34;
  if (run.stage === "kickoff_defaults") return 62;
  if (run.stage === "deterministic_baseline") return 40;
  if (run.stage === "model_request") return 56;
  if (run.stage === "model_response") return 74;
  if (run.stage === "schema_validation") return 86;
  if (run.stage === "proposal_created") return 94;
  if (run.stage === "board_applied") return 96;
  return 8;
}

export function projectBoardSynthesisRunStatusLabel(status: ProjectBoardSynthesisRun["status"]): string {
  if (status === "running") return "Running";
  if (status === "pause_requested") return "Pause requested";
  if (status === "paused") return "Paused";
  if (status === "abandoned") return "Abandoned";
  if (status === "succeeded") return "Succeeded";
  return "Failed";
}

export function projectBoardSynthesisRunStageLabel(stage: ProjectBoardSynthesisRun["stage"]): string {
  if (stage === "source_scan") return "Scanning sources";
  if (stage === "sources_persisted") return "Source snapshot saved";
  if (stage === "source_classification") return "Classifying sources";
  if (stage === "kickoff_defaults") return "Suggesting kickoff defaults";
  if (stage === "deterministic_baseline") return "Baseline prepared";
  if (stage === "charter_summary") return "Charter summary";
  if (stage === "model_request") return "Asking Ambient/Pi";
  if (stage === "model_response") return "Response received";
  if (stage === "schema_validation") return "Validating proposal";
  if (stage === "proposal_created") return "Proposal ready";
  if (stage === "board_applied") return "Board applied";
  if (stage === "paused") return "Paused";
  return "Failed";
}

export function projectBoardKickoffDefaultsRunMetric(run?: ProjectBoardSynthesisRun): { label: string; value?: string; title?: string } {
  if (run?.stage !== "kickoff_defaults") return { label: "Defaults" };
  const targetCount = projectBoardKickoffDefaultsRunTargetCount(run);
  const completedCount = (run.questionCount ?? 0) + run.warningCount;
  return {
    label: "Defaults",
    value: targetCount > 0 ? `${Math.min(completedCount, targetCount)}/${targetCount}` : completedCount.toLocaleString(),
    title: "Kickoff defaults applied or skipped.",
  };
}

export function projectBoardKickoffDefaultsRunTargetCount(run: ProjectBoardSynthesisRun): number {
  for (const event of run.events) {
    const total = event.metadata.total;
    if (typeof total === "number" && Number.isFinite(total) && total > 0) return Math.round(total);
    const targetQuestionIds = event.metadata.targetQuestionIds;
    if (Array.isArray(targetQuestionIds)) return targetQuestionIds.filter((item) => typeof item === "string").length;
  }
  return 0;
}

export function projectBoardLatestVisibleSynthesisRun(runs?: ProjectBoardSynthesisRun[]): ProjectBoardSynthesisRun | undefined {
  if (!runs?.length) return undefined;
  return (
    runs.find(projectBoardRunBlocksPlanning) ??
    runs.find((run) => (run.status === "running" || run.status === "pause_requested") && projectBoardRunIsKickoffDefaults(run)) ??
    runs.find((run) => (run.status === "paused" || run.status === "succeeded") && !projectBoardRunIsKickoffDefaults(run)) ??
    runs[0]
  );
}
