import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  Kanban,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Shield,
  SquarePen,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AddProjectBoardCardRunFeedbackInput, CopyProjectBoardSessionToThreadInput, ProjectBoardCard, ProjectBoardCardRunFeedbackSource, ProjectBoardGitSyncStatus, ProjectBoardProofDecisionAction, ProjectBoardSplitDecisionAction, ProjectSummary } from "../../shared/projectBoardTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { OrchestrationBoard } from "../../shared/workflowTypes";
import { formatOrchestrationRunStatus, ProofEvidencePathLink, ProofOfWorkPreview, RunTimeline } from "./AutomationsWorkspace";
import { formatTaskState, formatTimelineTime } from "./RightPanel";
import { ProjectBoardObjectiveProvenanceBlock, projectBoardPhaseDisplayName } from "./ProjectBoardLaneViews";
import { ProjectBoardProofFollowUpImpactPanel } from "./ProjectBoardProofViews";
import {
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardCardClaimActionState,
  projectBoardCardClaimBlocksLocalTicketization,
  projectBoardCardClaimLabel,
  projectBoardCardClaimTitle,
  projectBoardCardIsDraftInboxCandidate,
  projectBoardCanonicalCardProjection,
  projectBoardExecutionControlModel,
  projectBoardLiveSessionPreviewModel,
  projectBoardPendingClarificationDecisions,
  projectBoardPrimaryBlockingCard,
  projectBoardProofDecisionModel,
  projectBoardProofFollowUpImpactModel,
  projectBoardUiMockReviewPanelModel,
  type ProjectBoardCardClaimAction,
  type ProjectBoardLiveSessionActivityLine,
} from "./projectBoardUiModel";

export function ProjectBoardClaimControls({
  card,
  gitStatus,
  busy,
  onAction,
}: {
  card: ProjectBoardCard;
  gitStatus?: ProjectBoardGitSyncStatus;
  busy?: string;
  onAction: (card: ProjectBoardCard, action: ProjectBoardCardClaimAction) => void;
}) {
  const isBusy = busy?.endsWith(`:${card.id}`) ?? false;
  const actionState = projectBoardCardClaimActionState(card, gitStatus, isBusy);
  const claimLabel = projectBoardCardClaimLabel(card);
  const claimTitle = projectBoardCardClaimTitle(card);
  return (
    <section className={`project-board-claim-controls ${actionState.tone}`} aria-label="Git claim controls">
      <div>
        <Shield size={15} />
        <div>
          <strong>{claimLabel ?? "No active Git claim"}</strong>
          <p>{claimTitle ?? "Claim this card before this desktop ticketizes or executes it."}</p>
        </div>
      </div>
      <button
        type="button"
        className={`panel-button mini ${actionState.tone}`}
        disabled={actionState.disabled}
        title={actionState.title}
        onClick={() => onAction(card, actionState.action)}
      >
        <Shield size={13} />
        <span>{actionState.label}</span>
      </button>
    </section>
  );
}


export function ProjectBoardLivePiSessionPreview({
  model,
  cardId,
  runBusy,
  onCopySessionToThread,
  onOpenRunThread,
  onRevealWorkspace,
}: {
  model: ReturnType<typeof projectBoardLiveSessionPreviewModel>;
  cardId: string;
  runBusy?: string;
  onCopySessionToThread: (input: CopyProjectBoardSessionToThreadInput) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => void;
  onRevealWorkspace: (workspacePath: string) => void;
}) {
  if (!model.visible) return null;
  const copyBusy = runBusy === model.copyAction.busyKey;
  const openThreadBusy = model.openThreadAction ? runBusy === model.openThreadAction.busyKey : false;
  const workspaceBusy = model.workspaceAction ? runBusy === model.workspaceAction.busyKey : false;
  return (
    <section className={`project-board-live-pi-preview ${model.tone}`} aria-label="Live Pi session preview">
      <header>
        <div>
          <span className="project-board-kicker">Live Pi session</span>
          <h4>{model.headline}</h4>
          <p>{model.detail}</p>
        </div>
        <div className="project-board-live-pi-status">
          <span>{model.statusLabel}</span>
          <small>{model.sessionLabel}</small>
        </div>
      </header>
      <div className="project-board-live-pi-metrics" aria-label="Pi session metrics">
        {model.metrics.map((metric) => (
          <span key={metric.label} className={metric.tone} title={metric.title}>
            <strong>{metric.value}</strong>
            {metric.label}
          </span>
        ))}
      </div>
      {model.activity.length > 0 && (
        <div className="project-board-live-pi-events" aria-label="Recent Pi session activity">
          {model.activity.map((event) => (
            <div key={event.id} className={event.kind}>
              <span>{event.label}</span>
              <p>{event.text}</p>
              {event.timestamp !== undefined && <time>{formatTimelineTime(new Date(event.timestamp).toISOString())}</time>}
            </div>
          ))}
        </div>
      )}
      {model.latestAssistantText && (
        <div className="project-board-live-pi-assistant">
          <strong>Latest assistant text</strong>
          <p>{model.latestAssistantText}</p>
        </div>
      )}
      <footer>
        {model.openThreadAction && model.openThreadAction.threadId && (
          <button
            type="button"
            className="panel-button mini secondary"
            disabled={model.openThreadAction.disabled || openThreadBusy}
            title={model.openThreadAction.title}
            onClick={() => model.openThreadAction?.threadId && onOpenRunThread(model.openThreadAction.threadId, model.workspacePath)}
          >
            <MessageCircle size={13} className={openThreadBusy ? "spin" : ""} />
            <span>{openThreadBusy ? model.openThreadAction.busyLabel : model.openThreadAction.label}</span>
          </button>
        )}
        <button
          type="button"
          className="panel-button mini primary"
          disabled={model.copyAction.disabled || copyBusy || !model.copyAction.runId}
          title={model.copyAction.title}
          onClick={() => {
            if (!model.copyAction.runId || model.copyAction.disabled) return;
            onCopySessionToThread({ cardId, runId: model.copyAction.runId });
          }}
        >
          <Copy size={13} className={copyBusy ? "spin" : ""} />
          <span>{copyBusy ? model.copyAction.busyLabel : model.copyAction.label}</span>
        </button>
        {model.workspaceAction?.workspacePath && (
          <button
            type="button"
            className="panel-button mini secondary"
            disabled={model.workspaceAction.disabled || workspaceBusy}
            title={model.workspaceAction.title}
            onClick={() => model.workspaceAction?.workspacePath && onRevealWorkspace(model.workspaceAction.workspacePath)}
          >
            <FolderOpen size={13} className={workspaceBusy ? "spin" : ""} />
            <span>{workspaceBusy ? model.workspaceAction.busyLabel : model.workspaceAction.label}</span>
          </button>
        )}
      </footer>
    </section>
  );
}


export type ProjectBoardActiveCardDetailTab = "spec" | "proof" | "dependencies" | "history";

export type ProjectBoardCardInspectorOptions = { tab?: ProjectBoardActiveCardDetailTab; scroll?: boolean };

export type ProjectBoardCardInspectorRequest = ProjectBoardCardInspectorOptions & { requestId: number };


export function ProjectBoardActiveCardDetail({
  board,
  card,
  orchestrationBoard,
  orchestrationError,
  runActivityLinesByThread,
  threadRunStatuses,
  onClose,
  runBusy,
  onPrepareRuns,
  onStartRun,
  onCancelRun,
  onRevealWorkspace,
  onOpenRunThread,
  onCopySessionToThread,
  onResolveProofDecision,
  onResolveSplitDecision,
  onAddRunFeedback,
  gitStatus,
  claimBusy,
  onClaimAction,
  inspectorRequest,
  onJumpToBlocker,
  onJumpToInbox,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  card?: ProjectBoardCard;
  orchestrationBoard?: OrchestrationBoard;
  orchestrationError?: string;
  runActivityLinesByThread: Record<string, ProjectBoardLiveSessionActivityLine[]>;
  threadRunStatuses: Record<string, RunStatus>;
  onClose: () => void;
  runBusy?: string;
  onPrepareRuns: () => void;
  onStartRun: (runId: string) => void;
  onCancelRun: (runId: string) => void;
  onRevealWorkspace: (workspacePath: string) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => void;
  onCopySessionToThread: (input: CopyProjectBoardSessionToThreadInput) => void;
  onResolveProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => void;
  onResolveSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => void;
  onAddRunFeedback: (input: AddProjectBoardCardRunFeedbackInput) => Promise<void> | void;
  gitStatus?: ProjectBoardGitSyncStatus;
  claimBusy?: string;
  onClaimAction: (card: ProjectBoardCard, action: ProjectBoardCardClaimAction) => void;
  inspectorRequest?: ProjectBoardCardInspectorRequest;
  onJumpToBlocker?: (cardId: string) => void;
  onJumpToInbox?: (cardId: string) => void;
}) {
  const detailRef = useRef<HTMLElement>(null);
  const [runFeedbackDraft, setRunFeedbackDraft] = useState("");
  const [proofDecisionReason, setProofDecisionReason] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState<ProjectBoardActiveCardDetailTab>("spec");
  useEffect(() => {
    setRunFeedbackDraft("");
    setProofDecisionReason("");
    setActiveDetailTab("spec");
  }, [card?.id]);

  useEffect(() => {
    if (!card || !inspectorRequest?.requestId) return;
    if (inspectorRequest.tab) setActiveDetailTab(inspectorRequest.tab);
    if (inspectorRequest.scroll) {
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        detailRef.current?.focus({ preventScroll: true });
      });
    }
  }, [card?.id, inspectorRequest?.requestId, inspectorRequest?.scroll, inspectorRequest?.tab]);

  if (!card) {
    return (
      <aside className="project-board-active-card-detail empty" aria-label="Project board card detail">
        <Kanban size={18} />
        <h3>Select a card</h3>
        <p>Inspect task spec, dependencies, proof expectations, run history, and decision context before dispatch or review.</p>
      </aside>
    );
  }

  const detail = projectBoardActiveCardDetail(card, board.cards, orchestrationBoard?.tasks ?? [], orchestrationBoard?.runs ?? [], board.executionArtifacts ?? []);
  const tests = [
    ["Unit", card.testPlan.unit],
    ["Integration", card.testPlan.integration],
    ["Visual", card.testPlan.visual],
    ["Manual", card.testPlan.manual],
  ] as const;
  const decisionPolicy = board.charter?.decisionPolicy;
  const hasDecisionPolicy = Boolean(decisionPolicy && Object.keys(decisionPolicy).length > 0);
  const latestRun = detail.latestRun;
  const liveSessionThreadId = latestRun?.threadId ?? card.executionThreadId;
  const liveSessionPreview = projectBoardLiveSessionPreviewModel({
    card,
    task: detail.task,
    latestRun,
    threadStatus: liveSessionThreadId ? threadRunStatuses[liveSessionThreadId] : undefined,
    activityLines: liveSessionThreadId ? runActivityLinesByThread[liveSessionThreadId] ?? [] : [],
  });
  const proofDecision = projectBoardProofDecisionModel(card, board, detail.task, latestRun);
  const proofFollowUpImpact = projectBoardProofFollowUpImpactModel(card, board.cards);
  const uiMockReview = projectBoardUiMockReviewPanelModel(card, latestRun, proofDecision);
  const claimBlocksPrepare = projectBoardCardClaimBlocksLocalTicketization(card);
  const executionControls = projectBoardExecutionControlModel(card, board, detail, { runBusy, claimBlocksPrepare });
  const overview = projectBoardActiveCardOverviewModel(card, board, detail, executionControls);
  const primaryBlocker = projectBoardPrimaryBlockingCard(card, board.cards);
  const cardProjection = projectBoardCanonicalCardProjection(card, { task: detail.task, latestRun });
  const runFeedbackBusyKey = `feedback:${card.id}`;
  const canAddRunFeedback =
    Boolean(card.orchestrationTaskId) &&
    !["draft", "in_progress", "done", "archived"].includes(card.status) &&
    runFeedbackDraft.trim().length > 0 &&
    runBusy !== runFeedbackBusyKey;
  const runFeedbackDisabledTitle =
    card.status === "draft"
      ? "Approve this candidate into a Local Task before adding next-run feedback."
      : card.status === "in_progress"
        ? "Wait for the active Local Task run to finish before adding next-run feedback."
        : card.status === "done" || card.status === "archived"
          ? "Completed or archived cards cannot receive next-run feedback."
          : !card.orchestrationTaskId
            ? "This card is not linked to a Local Task."
            : "Enter additive next-run instructions.";
  return (
    <aside ref={detailRef} className="project-board-active-card-detail" aria-label="Project board card detail" tabIndex={-1}>
      <header>
        <div className="project-board-inspector-title">
          <span className="project-board-kicker">Card inspector</span>
          <h3>{card.title}</h3>
          <p>Selected executable card. Use this inspector to dispatch runs, inspect proof, close completed work, or record blockers.</p>
        </div>
        <div className="project-board-card-actions">
          <span className="project-board-inspector-badge card">Selected card</span>
          <button type="button" className="icon-button" onClick={onClose} title="Close card inspector" aria-label="Close card inspector">
            <X size={15} />
          </button>
        </div>
      </header>
      {orchestrationError && <p className="panel-status error">{orchestrationError}</p>}
      <ProjectBoardActiveCardOverviewPanel
        model={overview}
        primaryBlocker={primaryBlocker}
        onJumpToBlocker={primaryBlocker && onJumpToBlocker ? () => onJumpToBlocker(primaryBlocker.id) : undefined}
        onJumpToInbox={onJumpToInbox ? () => onJumpToInbox(card.id) : undefined}
      />
      <ProjectBoardClaimControls card={card} gitStatus={gitStatus} busy={claimBusy} onAction={onClaimAction} />
      <ProjectBoardLivePiSessionPreview
        model={liveSessionPreview}
        cardId={card.id}
        runBusy={runBusy}
        onCopySessionToThread={onCopySessionToThread}
        onOpenRunThread={onOpenRunThread}
        onRevealWorkspace={onRevealWorkspace}
      />
      <ProjectBoardUiMockReviewPanel
        model={uiMockReview}
        cardId={card.id}
        workspacePath={latestRun?.workspacePath}
        runBusy={runBusy}
        onResolve={(action) => {
          if (!proofDecision.readyForDecision) return;
          onResolveProofDecision(card.id, action, proofDecisionReason.trim() || undefined);
          setProofDecisionReason("");
        }}
      />
      <section>
        <h4>Task spec</h4>
        <p>{card.description}</p>
        <div className="project-board-detail-tags">
          <span>{cardProjection.statusLabel}</span>
          {card.phase && <span>{projectBoardPhaseDisplayName(card.phase)}</span>}
          {card.priority !== undefined && <span>Priority {card.priority}</span>}
          {card.labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {detail.task ? (
          <dl className="project-board-task-spec">
            <div>
              <dt>Local task</dt>
              <dd>{detail.task.identifier}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{formatTaskState(detail.task.state)}</dd>
            </div>
            {detail.task.branchName && (
              <div>
                <dt>Branch</dt>
                <dd>{detail.task.branchName}</dd>
              </div>
            )}
            {detail.task.workspacePath && (
              <div>
                <dt>Workspace</dt>
                <dd>{detail.task.workspacePath}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="project-board-detail-note">Linked Local Task details are still loading or no longer exist.</p>
        )}
        {card.objectiveProvenance && <ProjectBoardObjectiveProvenanceBlock provenance={card.objectiveProvenance} />}
        {detail.task?.description && <pre className="project-board-task-description">{detail.task.description}</pre>}
      </section>
      <ProjectBoardExecutionControlPanel
        model={executionControls}
        onAction={(action) => {
          if (action.disabled) return;
          if (action.action === "prepare_run") onPrepareRuns();
          if (action.action === "start_run" && action.runId) onStartRun(action.runId);
          if (action.action === "cancel_run" && action.runId) onCancelRun(action.runId);
          if (action.action === "open_run_chat" && action.threadId) onOpenRunThread(action.threadId);
          if (action.action === "reveal_workspace" && action.workspacePath) onRevealWorkspace(action.workspacePath);
          if (action.proofDecisionAction) {
            onResolveProofDecision(card.id, action.proofDecisionAction, proofDecisionReason.trim() || undefined);
            setProofDecisionReason("");
          }
        }}
        runBusy={runBusy}
        proofDecisionReason={proofDecisionReason}
        onProofDecisionReasonChange={setProofDecisionReason}
      />
      <ProjectBoardRunFeedbackPanel
        card={card}
        draft={runFeedbackDraft}
        onDraftChange={setRunFeedbackDraft}
        disabledTitle={runFeedbackDisabledTitle}
        canSave={canAddRunFeedback}
        saving={runBusy === runFeedbackBusyKey}
        onSave={() => {
          const feedback = runFeedbackDraft.trim();
          if (!feedback) return;
          onAddRunFeedback({ cardId: card.id, feedback, source: "manual" });
          setRunFeedbackDraft("");
        }}
      />
      <ProjectBoardActiveCardDetailTabs activeTab={activeDetailTab} onChange={setActiveDetailTab} />
      <div className="project-board-active-card-tab-panel">
        {activeDetailTab === "spec" && (
          <>
            {card.pendingPiUpdate && <ProjectBoardProtectedPiUpdatePanel card={card} />}
            <ProjectBoardActiveCardDecisionAuditPanel card={card} decisionAudit={overview.decisionAudit} />
            {overview.sourceBasis.length > 0 && <ProjectBoardActiveCardSourceBasisPanel sourceBasis={overview.sourceBasis} />}
            <section>
              <h4>Acceptance criteria</h4>
              {card.acceptanceCriteria.length > 0 ? (
                <ul>
                  {card.acceptanceCriteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              ) : (
                <p className="project-board-detail-note">No acceptance criteria recorded.</p>
              )}
            </section>
          </>
        )}
        {activeDetailTab === "proof" && (
          <>
            <section>
              <h4>Tests / proof expectations</h4>
              {detail.proofExpectationCount > 0 ? (
                <div className="project-board-proof-expectations">
                  {tests.map(([label, items]) =>
                    items.length > 0 ? (
                      <div key={label}>
                        <strong>{label}</strong>
                        <ul>
                          {items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <p className="project-board-detail-note">No proof expectations recorded.</p>
              )}
            </section>
            <section>
              <h4>PM close decision</h4>
              <div className="project-board-proof-decision">
                <div>
                  <strong>{proofDecision.statusLabel}</strong>
                  <span>{proofDecision.recommendationLabel}</span>
                </div>
                <p>{proofDecision.rationale}</p>
                <p className="project-board-proof-decision-policy">{proofDecision.policySummary}</p>
                <p className="project-board-detail-note">{proofDecision.nextAction}</p>
                <p className="project-board-detail-note">Close, retry, and blocker controls are grouped in Execution controls so the decision is visible beside worker state and blockers.</p>
              </div>
            </section>
            <section>
              <h4>PM proof review</h4>
              {card.proofReview ? (
                <div className={`project-board-proof-review ${card.proofReview.status}`}>
                  <div>
                    <strong>{projectBoardProofReviewStatusLabel(card.proofReview.status)}</strong>
                    <span>{formatTimelineTime(card.proofReview.reviewedAt)}</span>
                  </div>
                  {(card.proofReview.reviewer || card.proofReview.evidenceQuality || card.proofReview.recommendedAction) && (
                    <p className="project-board-proof-review-meta">
                      {[
                        card.proofReview.reviewer ? projectBoardProofReviewerLabel(card.proofReview.reviewer) : undefined,
                        card.proofReview.evidenceQuality ? `Evidence: ${card.proofReview.evidenceQuality}` : undefined,
                        card.proofReview.recommendedAction ? `Action: ${projectBoardProofRecommendedActionLabel(card.proofReview.recommendedAction)}` : undefined,
                        typeof card.proofReview.confidence === "number" ? `Confidence: ${Math.round(card.proofReview.confidence * 100)}%` : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <p>{card.proofReview.summary}</p>
                  {card.proofReview.satisfied.length > 0 && (
                    <ul>
                      {card.proofReview.satisfied.map((item) => (
                        <li key={`satisfied-${item}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {card.proofReview.missing.length > 0 && (
                    <ul className="missing">
                      {card.proofReview.missing.map((item) => (
                        <li key={`missing-${item}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  <ProjectBoardProofFollowUpImpactPanel model={proofFollowUpImpact} compact />
                </div>
              ) : (
                <p className="project-board-detail-note">No PM proof review has been recorded for this card yet.</p>
              )}
            </section>
            {detail.latestExecutionArtifact && (
              <section>
                <h4>Pulled execution handoff</h4>
                <div className="project-board-proof-review ready_for_review">
                  <div>
                    <strong>{formatTaskState(detail.latestExecutionArtifact.status)}</strong>
                    <span>{formatTimelineTime(detail.latestExecutionArtifact.updatedAt)}</span>
                  </div>
                  <p>
                    {detail.latestExecutionArtifact.handoff?.summary ??
                      detail.latestExecutionArtifact.proof?.summary ??
                      "This pulled Git board run has no handoff summary yet."}
                  </p>
                  {detail.latestExecutionArtifact.handoff?.completed.length ? (
                    <ul>
                      {detail.latestExecutionArtifact.handoff.completed.slice(0, 5).map((item, index) => (
                        <li key={`pulled-completed-${index}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {detail.latestExecutionArtifact.handoff?.remaining.length ? (
                    <ul className="missing">
                      {detail.latestExecutionArtifact.handoff.remaining.slice(0, 5).map((item, index) => (
                        <li key={`pulled-remaining-${index}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {detail.latestExecutionArtifact.handoff?.risks.length ? (
                    <p className="project-board-detail-note">Risks: {detail.latestExecutionArtifact.handoff.risks.slice(0, 3).join("; ")}</p>
                  ) : null}
                  <p className="project-board-detail-note">Imported from board Git artifacts. Local runner rows were not duplicated on this desktop.</p>
                </div>
              </section>
            )}
            <section>
              <h4>Proof packet</h4>
              {detail.latestRun?.proofOfWork ? <ProofOfWorkPreview run={detail.latestRun} card={card} defaultOpen /> : <p className="project-board-detail-note">No proof packet recorded yet.</p>}
            </section>
          </>
        )}
        {activeDetailTab === "dependencies" && (
          <>
            <section>
              <h4>Dependencies</h4>
              <div className="project-board-detail-tags">
                {cardProjection.suppressBlockers ? (
                  <span>{cardProjection.blockerLabel ?? "No active blockers"}</span>
                ) : (
                  <>
                    {detail.blockedByCards.map((blocker) => (
                      <span key={`card-${blocker.id}`}>Blocked by {blocker.title}</span>
                    ))}
                    {detail.blockedByTasks.map((task) => (
                      <span key={`task-${task.id}`}>Blocked by {task.identifier}</span>
                    ))}
                    {detail.unresolvedBlockers.map((blocker) => (
                      <span key={`missing-${blocker}`} className="warning">Unresolved {blocker}</span>
                    ))}
                    {detail.blockedByCards.length + detail.blockedByTasks.length + detail.unresolvedBlockers.length === 0 && <span>No blockers</span>}
                  </>
                )}
              </div>
              {detail.unblocks.length > 0 && (
                <div className="project-board-unblocks">
                  <strong>Unblocks</strong>
                  {detail.unblocks.map((candidate) => (
                    <span key={candidate.id}>{candidate.title}</span>
                  ))}
                </div>
              )}
            </section>
            {detail.splitOutcome && (
              <section>
                <h4>Split into follow-ups</h4>
                <div className="project-board-proof-review needs_follow_up">
                  <div>
                    <strong>{detail.splitOutcome.statusLabel}</strong>
                    <span>{detail.splitOutcome.sourceLabel}</span>
                  </div>
                  <p>{detail.splitOutcome.reason}</p>
                  {detail.splitOutcome.partialProofSummary && <p className="project-board-detail-note">{detail.splitOutcome.partialProofSummary}</p>}
                  {detail.splitOutcome.completedCriteria.length > 0 && (
                    <>
                      <strong>Completed before split</strong>
                      <ul>
                        {detail.splitOutcome.completedCriteria.map((item) => (
                          <li key={`split-completed-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {detail.splitOutcome.remainingCriteria.length > 0 && (
                    <>
                      <strong>Remaining scope</strong>
                      <ul className="missing">
                        {detail.splitOutcome.remainingCriteria.map((item) => (
                          <li key={`split-remaining-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {detail.splitOutcome.children.length > 0 && (
                    <div className="project-board-detail-tags">
                      {detail.splitOutcome.children.map((child) => (
                        <span key={child.card.id} className={child.blockedByParent ? "warning" : undefined}>
                          {child.card.title}: {child.statusLabel}
                        </span>
                      ))}
                    </div>
                  )}
                  {detail.splitOutcome.unresolvedChildIds.length > 0 && (
                    <p className="project-board-detail-note">{detail.splitOutcome.unresolvedChildIds.length} split child reference{detail.splitOutcome.unresolvedChildIds.length === 1 ? "" : "s"} could not be found.</p>
                  )}
                  <div className="project-board-card-actions">
                    {detail.splitOutcome.actions.map((action) => (
                      <button
                        type="button"
                        key={action.action}
                        className={`secondary-button ${action.tone === "danger" ? "danger" : ""}`}
                        disabled={action.disabled || runBusy === `split:${card.id}:${action.action}`}
                        title={action.title}
                        onClick={() => onResolveSplitDecision(card.id, action.action)}
                      >
                        {action.action === "approve_split" || action.action === "accept_done_via_split" ? (
                          <Check size={14} />
                        ) : action.action === "reject_split" ? (
                          <X size={14} />
                        ) : action.action === "retry_original" ? (
                          <RotateCcw size={14} className={runBusy === `split:${card.id}:${action.action}` ? "spin" : ""} />
                        ) : (
                          <GitBranch size={14} />
                        )}
                        <span>{runBusy === `split:${card.id}:${action.action}` ? "Saving" : action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
        {activeDetailTab === "history" && (
          <>
            <section>
              <h4>Progress ledger</h4>
              <div className="project-board-progress-ledger">
                {detail.progressLedger.map((entry) => (
                  <article className={`project-board-progress-entry ${entry.state}`} key={entry.id}>
                    <div>
                      <strong>{entry.label}</strong>
                      <span>{formatTaskState(entry.state)}</span>
                    </div>
                    <p>{entry.detail}</p>
                  </article>
                ))}
              </div>
            </section>
            <section>
              <h4>Run history</h4>
              {detail.runs.length > 0 ? (
                <div className="run-dashboard flush">
                  {detail.runs.slice(0, 4).map((run) => (
                    <div className="run-card" key={run.id}>
                      <div className="run-card-header">
                        <span className="run-row-title">
                          {run.status === "running" && <LoaderCircle size={12} className="spin" />}
                          Attempt {run.attemptNumber + 1}
                        </span>
                        <strong className={`run-state ${run.status}`}>{formatOrchestrationRunStatus(run)}</strong>
                      </div>
                      <code className="run-workspace-path">{run.workspacePath}</code>
                      <RunTimeline run={run} />
                      <ProofOfWorkPreview run={run} card={card} defaultOpen={run.id === detail.latestRun?.id} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="project-board-detail-note">No runs recorded for this card yet.</p>
              )}
            </section>
            <section>
              <h4>Decision log</h4>
              {hasDecisionPolicy ? (
                <pre className="project-board-policy-preview">{JSON.stringify(decisionPolicy, null, 2)}</pre>
              ) : (
                <p className="project-board-detail-note">No card-level decisions recorded. Use the project charter if execution needs a judgment call.</p>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}


export function ProjectBoardActiveCardOverviewPanel({
  model,
  primaryBlocker,
  onJumpToBlocker,
  onJumpToInbox,
}: {
  model: ReturnType<typeof projectBoardActiveCardOverviewModel>;
  primaryBlocker?: ProjectBoardCard;
  onJumpToBlocker?: () => void;
  onJumpToInbox?: () => void;
}) {
  const blockerLocation = primaryBlocker && projectBoardCardIsDraftInboxCandidate(primaryBlocker) ? "Draft Inbox" : "Board";
  return (
    <section className="project-board-active-card-overview" aria-label="Card state overview">
      <div className="project-board-active-card-overview-copy">
        <span className="project-board-kicker">State overview</span>
        <strong>{model.headline}</strong>
        <p>{model.detail}</p>
      </div>
      <div className="project-board-active-card-badges" aria-label="Card status badges">
        {model.badges.map((badge) => (
          <span className={`tone-${badge.tone}`} key={`${badge.label}:${badge.value}`}>
            <em>{badge.label}</em>
            {badge.value}
          </span>
        ))}
      </div>
      <div className="project-board-active-card-state-grid" aria-label="Inspector state sections">
        {model.sections.map((section) => (
          <article className={`tone-${section.tone}`} key={section.id}>
            <div>
              <strong>{section.label}</strong>
              {section.countLabel && <span>{section.countLabel}</span>}
            </div>
            <h5>{section.headline}</h5>
            <p>{section.detail}</p>
          </article>
        ))}
      </div>
      {(onJumpToInbox || (primaryBlocker && onJumpToBlocker)) && (
        <div className="project-board-active-card-overview-actions">
          {onJumpToInbox && (
            <button type="button" className="secondary-button" title="Open this card in the Draft Inbox detail view." onClick={onJumpToInbox}>
              <FileText size={14} />
              <span>Jump to Inbox</span>
            </button>
          )}
          {primaryBlocker && onJumpToBlocker && (
            <button
              type="button"
              className="secondary-button"
              title={`Open ${primaryBlocker.title} in ${blockerLocation} and focus it.`}
              onClick={onJumpToBlocker}
            >
              <ChevronRight size={14} />
              <span>Jump to blocker</span>
            </button>
          )}
        </div>
      )}
      {(model.decisionAudit.open > 0 || model.decisionAudit.answered > 0 || model.decisionAudit.duplicate > 0 || model.decisionAudit.dismissed > 0) && (
        <div className="project-board-active-card-audit-strip" aria-label="Decision audit summary">
          <span>{model.decisionAudit.open} open</span>
          <span>{model.decisionAudit.answered} answered</span>
          <span>{model.decisionAudit.duplicate} duplicate</span>
          <span>{model.decisionAudit.dismissed} dismissed</span>
        </div>
      )}
    </section>
  );
}


export function ProjectBoardUiMockReviewPanel({
  model,
  cardId,
  workspacePath,
  runBusy,
  onResolve,
}: {
  model: ReturnType<typeof projectBoardUiMockReviewPanelModel>;
  cardId: string;
  workspacePath?: string;
  runBusy?: string;
  onResolve: (action: ProjectBoardProofDecisionAction) => void;
}) {
  if (!model.visible) return null;
  return (
    <section className="project-board-proof-review ready_for_review" aria-label="UX mock review controls">
      <div>
        <strong>{model.headline}</strong>
        <span>{model.statusLabel}</span>
      </div>
      <p>{model.detail}</p>
      {model.previewPath ? (
        <ProofEvidencePathLink path={model.previewPath} workspacePath={workspacePath}>
          <ExternalLink size={14} />
          <span>Preview HTML mock</span>
        </ProofEvidencePathLink>
      ) : (
        <p className="project-board-detail-note">{model.previewTitle}</p>
      )}
      <div className="project-board-card-actions">
        {model.actions.map((action) => {
          const busyKey = `proof:${cardId}:${action.action}`;
          return (
            <button
              type="button"
              className={`secondary-button ${action.tone === "danger" ? "danger" : action.tone === "primary" ? "success" : ""}`}
              key={action.action}
              disabled={action.disabled || runBusy === busyKey}
              title={action.title}
              onClick={() => {
                if (action.disabled || runBusy === busyKey) return;
                onResolve(action.action);
              }}
            >
              {action.action === "accept_done" ? <Check size={14} /> : action.action === "retry" ? <RotateCcw size={14} /> : <X size={14} />}
              <span>{runBusy === busyKey ? "Saving" : action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}


export function ProjectBoardActiveCardDetailTabs({
  activeTab,
  onChange,
}: {
  activeTab: ProjectBoardActiveCardDetailTab;
  onChange: (tab: ProjectBoardActiveCardDetailTab) => void;
}) {
  const tabs: Array<{ id: ProjectBoardActiveCardDetailTab; label: string }> = [
    { id: "spec", label: "Spec" },
    { id: "proof", label: "Proof" },
    { id: "dependencies", label: "Dependencies" },
    { id: "history", label: "History" },
  ];
  return (
    <div className="project-board-active-card-tabs" role="tablist" aria-label="Card detail sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "active" : ""}
          title={`Show the ${tab.label.toLowerCase()} section for this card.`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}


export function ProjectBoardProtectedPiUpdatePanel({ card }: { card: ProjectBoardCard }) {
  if (!card.pendingPiUpdate) return null;
  const ticketized = Boolean(card.orchestrationTaskId) || card.status !== "draft";
  return (
    <section className="project-board-pi-update-panel protected" aria-label="Protected Pi update proposal">
      <div>
        <Zap size={15} />
        <strong>{ticketized ? "Protected Pi proposal" : "Pi update available"}</strong>
      </div>
      <p>
        Pi proposed newer values for {card.pendingPiUpdate.changedFields.map(projectBoardCardTouchedFieldLabel).join(", ")}.{" "}
        {ticketized
          ? "This card is already ticketized, so approved fields stay protected. Use next-run feedback, split, or follow-up work for changes."
          : "Review before applying so user edits are not overwritten silently."}
      </p>
    </section>
  );
}


export function ProjectBoardActiveCardDecisionAuditPanel({
  card,
  decisionAudit,
}: {
  card: ProjectBoardCard;
  decisionAudit: ReturnType<typeof projectBoardActiveCardOverviewModel>["decisionAudit"];
}) {
  const openDecisions = projectBoardPendingClarificationDecisions(card);
  const answeredDecisions = (card.clarificationDecisions ?? []).filter((decision) => decision.state === "answered");
  const duplicateDecisions = (card.clarificationDecisions ?? []).filter((decision) => decision.state === "duplicate");
  const answeredClarifications = card.clarificationAnswers ?? [];
  if (openDecisions.length === 0 && answeredDecisions.length === 0 && duplicateDecisions.length === 0 && answeredClarifications.length === 0) return null;
  return (
    <section className="project-board-active-card-decisions" aria-label="Card decisions">
      <header>
        <h4>Decisions</h4>
        <span>
          {decisionAudit.open} open · {decisionAudit.answered} answered · {decisionAudit.duplicate} duplicate
        </span>
      </header>
      {openDecisions.length > 0 && (
        <div className="project-board-active-card-decision-list">
          {openDecisions.map((decision) => (
            <article className="open" key={decision.id}>
              <strong>{decision.question}</strong>
              {decision.suggestedAnswer && <p>Suggested: {decision.suggestedAnswer}</p>}
              <small>Resolve in Decisions, or add next-run feedback if this card is already ticketized.</small>
            </article>
          ))}
        </div>
      )}
      {(answeredDecisions.length > 0 || answeredClarifications.length > 0 || duplicateDecisions.length > 0) && (
        <div className="project-board-active-card-decision-list resolved">
          {answeredDecisions.slice(0, 4).map((decision) => (
            <article key={decision.id}>
              <strong>{decision.question}</strong>
              <p>{decision.answer}</p>
            </article>
          ))}
          {answeredClarifications.slice(0, 4).map((answer) => (
            <article key={`${answer.question}:${answer.answeredAt}`}>
              <strong>{answer.question}</strong>
              <p>{answer.answer}</p>
            </article>
          ))}
          {duplicateDecisions.slice(0, 3).map((decision) => (
            <article key={decision.id}>
              <strong>{decision.question}</strong>
              <p>Duplicate of {decision.duplicateOf ?? "another canonical decision"}.</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


export function ProjectBoardActiveCardSourceBasisPanel({
  sourceBasis,
}: {
  sourceBasis: ReturnType<typeof projectBoardActiveCardOverviewModel>["sourceBasis"];
}) {
  return (
    <section className="project-board-source-basis-panel compact" aria-label="Card source basis">
      <div>
        <FileText size={15} />
        <strong>Source basis</strong>
      </div>
      <ul>
        {sourceBasis.map((source) => (
          <li key={`${source.sourceId ?? source.label}:${source.ref}`}>
            <strong>{source.label}</strong>
            <span>{source.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}


export function ProjectBoardExecutionControlPanel({
  model,
  onAction,
  runBusy,
  proofDecisionReason,
  onProofDecisionReasonChange,
}: {
  model: ReturnType<typeof projectBoardExecutionControlModel>;
  onAction: (action: ReturnType<typeof projectBoardExecutionControlModel>["actions"][number]) => void;
  runBusy?: string;
  proofDecisionReason?: string;
  onProofDecisionReasonChange?: (value: string) => void;
}) {
  const hasEnabledProofAction = model.actions.some((action) => action.proofDecisionAction && !action.disabled);
  return (
    <section className={`project-board-execution-control ${model.state}`}>
      <header>
        <div>
          <h4>Execution controls</h4>
          <strong>{model.headline}</strong>
        </div>
        <span>{model.statusLabel}</span>
      </header>
      <p>{model.detail}</p>
      <div className="project-board-execution-control-tags">
        <span>{model.taskLabel}</span>
        <span>{model.runLabel}</span>
        <span>{model.proofLabel}</span>
        <span>{model.blockerLabel}</span>
      </div>
      {hasEnabledProofAction && onProofDecisionReasonChange && (
        <label className="project-board-proof-decision-note">
          <span>Proof decision note</span>
          <textarea
            value={proofDecisionReason ?? ""}
            onChange={(event) => onProofDecisionReasonChange(event.target.value)}
            placeholder="For send-back, say what the next run must fix. For accept or block, record the PM rationale."
          />
        </label>
      )}
      <div className="project-board-execution-control-actions">
        {model.actions.map((action) => (
          <button
            key={`${action.action}:${action.runId ?? action.threadId ?? action.workspacePath ?? action.proofDecisionAction ?? action.label}`}
            type="button"
            className={`panel-button mini ${action.tone}`}
            title={action.title}
            disabled={action.disabled}
            onClick={() => onAction(action)}
          >
            {action.busyKey && runBusy === action.busyKey ? action.busyLabel : action.label}
          </button>
        ))}
      </div>
      <p className="project-board-execution-control-policy">{model.policySummary}</p>
    </section>
  );
}


export function ProjectBoardRunFeedbackPanel({
  card,
  draft,
  onDraftChange,
  disabledTitle,
  canSave,
  saving,
  onSave,
}: {
  card: ProjectBoardCard;
  draft: string;
  onDraftChange: (value: string) => void;
  disabledTitle: string;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const feedback = card.runFeedback ?? [];
  return (
    <section className="project-board-run-feedback" aria-label="Next-run feedback">
      <header>
        <div>
          <h4>Next-run feedback</h4>
          <p>Additive instructions are included in the next Local Task prompt without rewriting approved card fields.</p>
        </div>
        <span>{feedback.length} note{feedback.length === 1 ? "" : "s"}</span>
      </header>
      {feedback.length > 0 && (
        <div className="project-board-run-feedback-list">
          {feedback.slice(-4).map((item) => (
            <article key={item.id}>
              <strong>{projectBoardRunFeedbackSourceLabel(item.source)}</strong>
              <span>{formatTimelineTime(item.createdAt)}</span>
              <p>{item.feedback}</p>
              {item.decisionQuestion && <small>{item.decisionQuestion}</small>}
            </article>
          ))}
        </div>
      )}
      <label>
        <span>Add feedback for the next run</span>
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Describe what Pi should account for next time. Keep scope changes explicit; use follow-up/split cards for material changes."
        />
      </label>
      <button type="button" className="secondary-button" disabled={!canSave} title={canSave ? "Save this as additive next-run feedback." : disabledTitle} onClick={onSave}>
        <SquarePen size={14} />
        <span>{saving ? "Saving feedback" : "Add run feedback"}</span>
      </button>
    </section>
  );
}


export function projectBoardRunFeedbackSourceLabel(source: ProjectBoardCardRunFeedbackSource): string {
  if (source === "decision_impact") return "Decision impact";
  if (source === "proof_review") return "Proof review";
  if (source === "source_impact") return "Source impact";
  return "Manual note";
}

export function projectBoardProofReviewStatusLabel(status: NonNullable<ProjectBoardCard["proofReview"]>["status"]): string {
  if (status === "ready_for_review") return "Ready for review";
  if (status === "needs_follow_up") return "Needs follow-up";
  if (status === "terminally_blocked") return "Terminally blocked";
  if (status === "retry_recommended") return "Retry recommended";
  return "Done";
}


export function projectBoardProofReviewerLabel(reviewer: NonNullable<NonNullable<ProjectBoardCard["proofReview"]>["reviewer"]>): string {
  return reviewer === "ambient_pi" ? "Reviewed by Ambient/Pi" : "Deterministic review";
}


export function projectBoardProofRecommendedActionLabel(
  action: NonNullable<NonNullable<ProjectBoardCard["proofReview"]>["recommendedAction"]>,
): string {
  if (action === "ask_user") return "Ask user";
  if (action === "follow_up") return "Follow up";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

export function projectBoardCardTouchedFieldLabel(field: NonNullable<ProjectBoardCard["userTouchedFields"]>[number]): string {
  if (field === "candidateStatus") return "status";
  if (field === "dependencies") return "dependencies";
  if (field === "acceptanceCriteria") return "acceptance criteria";
  if (field === "testPlan") return "proof plan";
  if (field === "sourceRefs") return "source refs";
  if (field === "clarificationQuestions") return "clarification questions";
  if (field === "clarificationAnswers") return "clarification answers";
  return field;
}
