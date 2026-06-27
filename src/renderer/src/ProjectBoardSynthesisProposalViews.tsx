import { AlertCircle, Check, CheckCircle2, ClipboardPaste, Clock, GitBranch, Info, X, Zap } from "lucide-react";
import { useState } from "react";

import type {
  ProjectBoardCard,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectBoardSynthesisRun,
  ProjectSummary,
  RefineProjectBoardSynthesisInput,
} from "../../shared/projectBoardTypes";
import { projectBoardSynthesisPartialStatus } from "../../shared/projectBoardSynthesisRecovery";
import { formatDelay } from "./AutomationsWorkspace";
import { ProjectBoardProofScopeWarningSummary } from "./ProjectBoardCandidateDetailViews";
import {
  ProjectBoardObjectiveProvenanceBlock,
  projectBoardCandidateStatusLabel,
  projectBoardPhaseDisplayName,
} from "./ProjectBoardLaneViews";
import { ProjectBoardCharterPolicy } from "./ProjectBoardSourceViews";
import { projectBoardExecutionPmReview, projectBoardPmReviewReportUiModel } from "./projectBoardUiModel";
import {
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
  type ProjectBoardPlanningWarning,
} from "./projectBoardPlanningWarningUiModel";
import { formatTimelineTime } from "./RightPanel";

export function ProjectBoardSynthesisProposalSummary({
  board,
  proposal,
  latestRun,
  refineBusy,
  applyBusy,
  onRefineProposal,
  onApplyProposal,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  proposal: ProjectBoardSynthesisProposal;
  latestRun?: ProjectBoardSynthesisRun;
  refineBusy: boolean;
  applyBusy: boolean;
  onRefineProposal: (
    boardId: string,
    proposalId: string,
    mode?: Extract<RefineProjectBoardSynthesisInput["mode"], "charter_review" | "board_synthesis">,
  ) => void;
  onApplyProposal: (proposalId: string) => void;
}) {
  const cardCount = proposal.cards.length;
  const reviewReport = proposal.reviewReport;
  const isLightweightReview = Boolean(reviewReport && cardCount === 0);
  const proofCount = proposal.cards.reduce(
    (total, card) =>
      total + card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length,
    0,
  );
  const pending = proposal.status === "pending";
  const reviewCounts = projectBoardProposalReviewCounts(proposal);
  const actionableCardCount = reviewCounts.accepted + reviewCounts.merged;
  const proposalProofScopeWarningCount = proposal.cards.reduce(
    (total, card) => total + projectBoardPlanningWarningsForCard(card, board).length,
    0,
  );
  const planningRunning =
    (latestRun?.status === "running" || latestRun?.status === "pause_requested") && latestRun.proposalId === proposal.id;
  const generationRequiresActiveCharter = board.status !== "active";
  const applyDisabled = isLightweightReview || applyBusy || planningRunning || reviewCounts.pending > 0 || actionableCardCount === 0;
  const partialStatus = latestRun ? projectBoardSynthesisPartialStatus(latestRun) : undefined;
  const updateMode: Extract<RefineProjectBoardSynthesisInput["mode"], "charter_review" | "board_synthesis"> = isLightweightReview
    ? "charter_review"
    : "board_synthesis";
  const updateLabel = isLightweightReview ? "Update Charter Review" : "Refine Draft Board";
  return (
    <section className="project-board-charter-preview project-board-proposal-summary">
      <header>
        <div>
          <span className="project-board-kicker">Pi proposal</span>
          <h3>{proposal.summary || "Pi board synthesis proposal"}</h3>
        </div>
        <div className="project-board-card-actions">
          <span className={`project-board-status ${pending ? "warning" : ""}`}>{projectBoardProposalStatusLabel(proposal.status)}</span>
          {pending && (
            <>
              <button
                type="button"
                className="secondary-button"
                disabled={refineBusy || proposal.answers.length === 0}
                title={
                  proposal.answers.length === 0
                    ? "Answer at least one charter-gap question before asking Pi to revise this proposal."
                    : isLightweightReview
                      ? "Ask Pi to update the lightweight PM review using the charter-gap answers below."
                      : "Ask Pi to refine the draft board using the charter-gap answers below."
                }
                onClick={() => onRefineProposal(board.id, proposal.id, updateMode)}
              >
                <Zap size={14} className={refineBusy ? "spin" : ""} />
                <span>{refineBusy ? (isLightweightReview ? "Reviewing" : "Refining") : updateLabel}</span>
              </button>
              {isLightweightReview ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={refineBusy || planningRunning || generationRequiresActiveCharter}
                  title={
                    generationRequiresActiveCharter
                      ? "Activate the project charter before generating draft board cards."
                      : planningRunning
                        ? "Wait for Ambient/Pi planning to finish or pause before generating draft cards."
                        : "Run full board synthesis from this PM review recommendation and put generated cards in the Draft Inbox."
                  }
                  onClick={() => onRefineProposal(board.id, proposal.id, "board_synthesis")}
                >
                  <ClipboardPaste size={14} />
                  <span>{refineBusy ? "Generating" : "Generate Draft Board"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  disabled={applyDisabled}
                  title={
                    planningRunning
                      ? "Wait for Ambient/Pi planning to finish or fail before applying this live proposal."
                      : reviewCounts.pending > 0
                        ? "Review every proposal card before applying accepted cards."
                        : actionableCardCount === 0
                          ? "Accept or merge at least one proposal card before applying."
                          : proposalProofScopeWarningCount > 0
                            ? `Apply accepted and merged proposal cards to the draft inbox. ${proposalProofScopeWarningCount} proof-scope warning${proposalProofScopeWarningCount === 1 ? "" : "s"} should be reviewed before ticketization.`
                            : "Apply accepted and merged proposal cards to the draft inbox."
                  }
                  onClick={() => onApplyProposal(proposal.id)}
                >
                  <CheckCircle2 size={14} />
                  <span>{applyBusy ? "Applying" : `Apply ${actionableCardCount} Card${actionableCardCount === 1 ? "" : "s"}`}</span>
                </button>
              )}
            </>
          )}
        </div>
      </header>
      <div className="project-board-charter-grid">
        <ProjectBoardCharterPolicy label="Project goal" value={proposal.goal} />
        <ProjectBoardCharterPolicy label="Current state" value={proposal.currentState} />
        <ProjectBoardCharterPolicy label="Proof bar" value={proposal.qualityBar} />
      </div>
      <div className="project-board-proposal-meta">
        {reviewReport && <span>{projectBoardPmReviewReadinessLabel(reviewReport.readiness)}</span>}
        {isLightweightReview && <span>zero generated cards</span>}
        <span>
          {cardCount} proposed card{cardCount === 1 ? "" : "s"}
        </span>
        <span>{reviewCounts.accepted} accepted</span>
        <span>{reviewCounts.merged} merged</span>
        <span>{reviewCounts.deferred} deferred</span>
        <span>{reviewCounts.rejected} rejected</span>
        <span>{reviewCounts.pending} pending</span>
        <span>
          {proposal.questions.length} question{proposal.questions.length === 1 ? "" : "s"}
        </span>
        <span>
          {proofCount} proof expectation{proofCount === 1 ? "" : "s"}
        </span>
        {proposalProofScopeWarningCount > 0 && (
          <span>
            {proposalProofScopeWarningCount} proof-scope warning{proposalProofScopeWarningCount === 1 ? "" : "s"}
          </span>
        )}
        {proposal.model && <span>{proposal.model}</span>}
        {proposal.durationMs !== undefined && <span>{formatDelay(proposal.durationMs)}</span>}
        <span>{formatTimelineTime(proposal.createdAt)}</span>
      </div>
      {partialStatus?.hasPartialProposal && (
        <div className={`project-board-partial-warning ${partialStatus.deferred ? "deferred" : ""}`}>
          <AlertCircle size={15} />
          <p>
            <strong>
              {partialStatus.deferred
                ? "Partial proposal accepted with deferred sections."
                : "Partial proposal has unresolved source sections."}
            </strong>{" "}
            {partialStatus.summary} Retry failed sections from the synthesis run ledger, or explicitly defer them before treating source
            coverage as complete.
          </p>
        </div>
      )}
    </section>
  );
}

export function ProjectBoardExecutionPmReviewPanel({ review }: { review: ReturnType<typeof projectBoardExecutionPmReview> }) {
  if (review.total === 0) return null;
  return (
    <section className="project-board-proposal-history" aria-label="Pulled execution PM review">
      <header>
        <div>
          <span className="project-board-kicker">Pulled execution review</span>
          <h3>{review.summary}</h3>
        </div>
        <div className="project-board-proposal-meta">
          <span>
            {review.total} artifact{review.total === 1 ? "" : "s"}
          </span>
          <span>
            {review.completed} completion{review.completed === 1 ? "" : "s"}
          </span>
          {review.failed > 0 && <span>{review.failed} failed</span>}
          {review.blocked > 0 && <span>{review.blocked} blocked</span>}
          {review.stalled > 0 && <span>{review.stalled} stalled</span>}
          {review.riskCount > 0 && (
            <span>
              {review.riskCount} risk note{review.riskCount === 1 ? "" : "s"}
            </span>
          )}
          {review.followUpCount > 0 && (
            <span>
              {review.followUpCount} follow-up{review.followUpCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </header>
      {review.impacts.length > 0 ? (
        <div className="project-board-card-list">
          {review.impacts.slice(0, 6).map((impact) => (
            <article className={`project-board-card status-${impact.card?.status ?? "draft"}`} key={impact.artifact.id}>
              <div className="project-board-card-header-row">
                <span className="project-board-kicker">{impact.card ? "Card handoff" : "Unmatched handoff"}</span>
                <span
                  className={`project-board-status ${impact.tone === "danger" ? "danger" : impact.tone === "warning" ? "warning" : ""}`}
                >
                  {impact.artifact.status}
                </span>
              </div>
              <h4>{impact.title}</h4>
              <p>{impact.summary}</p>
              <p className="project-board-proposal-note">{impact.action}</p>
              <div className="project-board-proposal-meta">
                <span>Updated {formatTimelineTime(impact.artifact.updatedAt)}</span>
                {impact.artifact.workspaceBranch && <span>{impact.artifact.workspaceBranch}</span>}
                {impact.unblocks.length > 0 && <span>Unblocks {impact.unblocks.length}</span>}
                {impact.newlyReadyUnblocks.length > 0 && <span>{impact.newlyReadyUnblocks.length} newly ready</span>}
                {(impact.artifact.handoff?.risks.length ?? 0) > 0 && <span>{impact.artifact.handoff?.risks.length} risks</span>}
                {(impact.artifact.handoff?.followUps.length ?? 0) > 0 && (
                  <span>{impact.artifact.handoff?.followUps.length} follow-ups</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="project-board-column-empty">Pulled execution artifacts are present, but none contain proof or handoff details yet.</p>
      )}
      {review.materializedFollowUps.length > 0 && (
        <section className="project-board-handoff-followups" aria-label="Pulled handoff follow-up cards">
          <header>
            <span className="project-board-kicker">Draft Inbox follow-ups</span>
            <h4>
              {review.materializedFollowUps.length} handoff follow-up{review.materializedFollowUps.length === 1 ? "" : "s"} created
            </h4>
          </header>
          <div className="project-board-handoff-followup-grid">
            {review.materializedFollowUps.slice(0, 6).map((followUp) => (
              <article className="project-board-handoff-followup" key={followUp.card.id}>
                <div className="project-board-card-header-row">
                  <span className="project-board-kicker">{followUp.statusLabel}</span>
                  <span className="project-board-status" title={`Pulled from run ${followUp.runId}`}>
                    {followUp.runId}
                  </span>
                </div>
                <h5>{followUp.card.title}</h5>
                <p>{followUp.summary}</p>
                <div className="project-board-proposal-meta">
                  <span>{followUp.blockerLabel}</span>
                  {followUp.parentCard && <span>Parent {followUp.parentCard.status}</span>}
                  {followUp.card.phase && <span>{followUp.card.phase}</span>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export function ProjectBoardPmReviewReport({ report }: { report: NonNullable<ProjectBoardSynthesisProposal["reviewReport"]> }) {
  const model = projectBoardPmReviewReportUiModel(report);
  return (
    <div className="project-board-pm-review-report">
      <p>{model.summary}</p>
      <div className="project-board-partial-warning">
        <Info size={15} />
        <p>
          <strong>Recommended next step:</strong> {model.recommendedActivationScope}
        </p>
      </div>
      {model.sections.map((section) => (
        <section key={section.key} className="project-board-pm-review-report-section">
          <h4>{section.title}</h4>
          <ul className="project-board-card-list-compact">
            {section.items.map((item, index) => (
              <li key={`${section.title}:${index}:${item}`}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      {model.sections.length === 0 && (
        <p className="project-board-column-empty">Pi did not flag blocking questions, risks, or source conflicts.</p>
      )}
    </div>
  );
}

export function ProjectBoardProposalCard({
  card,
  proposalId,
  pending,
  busy,
  mergeTargets,
  planningWarnings,
  onReviewCard,
}: {
  card: ProjectBoardSynthesisProposal["cards"][number];
  proposalId: string;
  pending: boolean;
  busy: boolean;
  mergeTargets: ProjectBoardCard[];
  planningWarnings: ProjectBoardPlanningWarning[];
  onReviewCard: (
    proposalId: string,
    sourceId: string,
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus,
    reason?: string,
    mergeTargetCardId?: string,
  ) => void;
}) {
  const proofCount =
    card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length;
  const firstMergeTargetId = mergeTargets[0]?.id ?? "";

  return (
    <article className={`project-board-card status-draft candidate-${card.candidateStatus} proposal-${card.reviewStatus}`}>
      <div className="project-board-card-meta">
        {projectBoardPhaseDisplayName(card.phase || "Unassigned")} · {projectBoardCandidateStatusLabel(card.candidateStatus)} ·{" "}
        {projectBoardProposalCardReviewLabel(card.reviewStatus)}
      </div>
      <h3>{card.title}</h3>
      <p className="project-board-card-description" title={card.description}>
        {card.description}
      </p>
      <div className="project-board-card-tags">
        {card.priority !== undefined && <span>Priority {card.priority}</span>}
        {card.labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
        {proofCount > 0 && (
          <span>
            {proofCount} proof item{proofCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {card.objectiveProvenance && <ProjectBoardObjectiveProvenanceBlock provenance={card.objectiveProvenance} />}
      {card.blockedBy.length > 0 && (
        <div className="project-board-card-blockers">
          {card.blockedBy.map((blocker) => (
            <span key={blocker}>Blocked by {blocker}</span>
          ))}
        </div>
      )}
      {card.acceptanceCriteria.length > 0 && (
        <ul className="project-board-card-list-compact">
          {card.acceptanceCriteria.slice(0, 4).map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      )}
      {planningWarnings.length > 0 && <ProjectBoardProofScopeWarningSummary warnings={planningWarnings} compact />}
      {card.mergeTargetCardId && <p className="project-board-proposal-note">Merge target: {card.mergeTargetCardId}</p>}
      {card.reviewReason && <p className="project-board-proposal-note">Reason: {card.reviewReason}</p>}
      {pending && (
        <ProjectBoardProposalCardReviewControls
          key={projectBoardProposalCardReviewStateKey(card, firstMergeTargetId)}
          card={card}
          proposalId={proposalId}
          busy={busy}
          mergeTargets={mergeTargets}
          planningWarnings={planningWarnings}
          onReviewCard={onReviewCard}
        />
      )}
    </article>
  );
}

function ProjectBoardProposalCardReviewControls({
  card,
  proposalId,
  busy,
  mergeTargets,
  planningWarnings,
  onReviewCard,
}: {
  card: ProjectBoardSynthesisProposal["cards"][number];
  proposalId: string;
  busy: boolean;
  mergeTargets: ProjectBoardCard[];
  planningWarnings: ProjectBoardPlanningWarning[];
  onReviewCard: (
    proposalId: string,
    sourceId: string,
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus,
    reason?: string,
    mergeTargetCardId?: string,
  ) => void;
}) {
  const firstMergeTargetId = mergeTargets[0]?.id ?? "";
  const proofScopeTitle = projectBoardPlanningWarningActionTitle(planningWarnings);
  const [reason, setReason] = useState(card.reviewReason ?? "");
  const [mergeTargetCardId, setMergeTargetCardId] = useState(card.mergeTargetCardId ?? firstMergeTargetId);

  function review(reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus) {
    onReviewCard(proposalId, card.sourceId, reviewStatus, reason, reviewStatus === "merged" ? mergeTargetCardId : undefined);
  }

  return (
    <div className="project-board-proposal-review">
      <label>
        <span>Reason / merge note</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional note for defer, reject, or merge"
          disabled={busy}
        />
      </label>
      {mergeTargets.length > 0 && (
        <label>
          <span>Merge target</span>
          <select value={mergeTargetCardId} onChange={(event) => setMergeTargetCardId(event.target.value)} disabled={busy}>
            {mergeTargets.map((target) => (
              <option value={target.id} key={target.id}>
                {target.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="project-board-card-actions">
        <button
          type="button"
          className="project-board-card-action"
          disabled={busy}
          title={
            busy
              ? "This proposal card review is already saving."
              : (proofScopeTitle ?? "Accept this Pi proposal card so it can be applied to the Draft Inbox.")
          }
          onClick={() => review("accepted")}
        >
          <Check size={14} />
          <span>{busy ? "Saving" : "Accept"}</span>
        </button>
        <button
          type="button"
          className="project-board-card-action secondary"
          disabled={busy}
          title={
            busy
              ? "This proposal card review is already saving."
              : "Defer this proposed card so it stays out of the current Draft Inbox apply."
          }
          onClick={() => review("deferred")}
        >
          <Clock size={14} />
          <span>Defer</span>
        </button>
        <button
          type="button"
          className="project-board-card-action secondary"
          disabled={busy}
          title={
            busy ? "This proposal card review is already saving." : "Reject this proposed card as incorrect, duplicate, or out of scope."
          }
          onClick={() => review("rejected")}
        >
          <X size={14} />
          <span>Reject</span>
        </button>
        <button
          type="button"
          className="project-board-card-action secondary"
          disabled={busy || mergeTargets.length === 0 || !mergeTargetCardId}
          title={
            busy
              ? "This proposal card review is already saving."
              : mergeTargets.length === 0
                ? "There are no draft cards available to merge this proposal into."
                : !mergeTargetCardId
                  ? "Choose a merge target before merging this proposal card."
                  : "Merge this proposed card into the selected existing draft card."
          }
          onClick={() => review("merged")}
        >
          <GitBranch size={14} />
          <span>Merge</span>
        </button>
      </div>
    </div>
  );
}

function projectBoardProposalCardReviewStateKey(card: ProjectBoardSynthesisProposal["cards"][number], firstMergeTargetId: string): string {
  return `${card.sourceId}:${card.reviewReason ?? ""}:${card.mergeTargetCardId ?? firstMergeTargetId}`;
}

export function projectBoardProposalReviewCounts(
  proposal: ProjectBoardSynthesisProposal,
): Record<ProjectBoardSynthesisProposalCardReviewStatus, number> {
  return proposal.cards.reduce<Record<ProjectBoardSynthesisProposalCardReviewStatus, number>>(
    (counts, card) => {
      counts[card.reviewStatus] += 1;
      return counts;
    },
    { pending: 0, accepted: 0, deferred: 0, rejected: 0, merged: 0 },
  );
}

export function projectBoardProposalCardReviewLabel(status: ProjectBoardSynthesisProposalCardReviewStatus): string {
  if (status === "accepted") return "Accepted";
  if (status === "deferred") return "Deferred";
  if (status === "rejected") return "Rejected";
  if (status === "merged") return "Merged";
  return "Pending review";
}

export function projectBoardPmReviewReadinessLabel(
  readiness: NonNullable<ProjectBoardSynthesisProposal["reviewReport"]>["readiness"],
): string {
  if (readiness === "ready_for_activation") return "Ready for activation";
  if (readiness === "ready_for_card_generation") return "Ready for card generation";
  if (readiness === "needs_source_refresh") return "Needs source refresh";
  if (readiness === "blocked") return "Blocked";
  return "Needs answers";
}

export function projectBoardProposalStatusLabel(status: ProjectBoardSynthesisProposal["status"]): string {
  if (status === "pending") return "Pending review";
  if (status === "applied") return "Applied";
  if (status === "superseded") return "Superseded";
  return "Rejected";
}
