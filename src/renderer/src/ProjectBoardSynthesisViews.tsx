import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Clock,
  FileText,
  GitBranch,
  Info,
  Kanban,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ProjectBoardCard,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectBoardSynthesisRun,
  ProjectSummary,
  RefineProjectBoardSynthesisInput,
  RefreshProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RetryProjectBoardSynthesisInput,
  SuggestProjectBoardClarificationDefaultsInput,
  UpdateProjectBoardCardInput,
} from "../../shared/projectBoardTypes";
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
import { formatDelay, formatRunDuration, useRunningClock } from "./AutomationsWorkspace";
import { ProjectBoardProofScopeWarningSummary } from "./ProjectBoardCandidateDetailViews";
import { ProjectBoardDecisionQueuePanel } from "./ProjectBoardDecisionQueueViews";
import {
  ProjectBoardObjectiveProvenanceBlock,
  projectBoardCandidateStatusLabel,
  projectBoardPhaseDisplayName,
} from "./ProjectBoardLaneViews";
import { ProjectBoardCharterPolicy } from "./ProjectBoardSourceViews";
import {
  projectBoardDecisionQueue,
  projectBoardExecutionPmReview,
  projectBoardPmReviewReportUiModel,
  projectBoardSynthesisRunControlState,
  projectBoardSynthesisRunPromptBudgetAudit,
  projectBoardSynthesisRunPromptBudgetMetrics,
} from "./projectBoardUiModel";
import {
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
  projectBoardSynthesisRunProofScopeWarnings,
  type ProjectBoardPlanningWarning,
} from "./projectBoardPlanningWarningUiModel";
import { formatTimelineTime } from "./RightPanel";

export { ProjectBoardDecisionQueuePanel } from "./ProjectBoardDecisionQueueViews";

export function ProjectBoardSynthesisProposalTab({
  board,
  refineBusy,
  answerBusy,
  cardReviewBusy,
  applyBusy,
  retryBusy,
  deferBusy,
  onRefineProposal,
  onAnswerQuestion,
  onReviewCard,
  onApplyProposal,
  onRetrySynthesis,
  onDeferSynthesisSections,
  onSelectCard,
  onUpdateCard,
  onSuggestClarificationDefaults,
  onApplyDecisionImpactFeedback,
  onRefreshDecisionDrafts,
  onRegenerateDecisionDrafts,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  refineBusy: boolean;
  answerBusy?: string;
  cardReviewBusy?: string;
  applyBusy: boolean;
  retryBusy: boolean;
  deferBusy: boolean;
  onRefineProposal: (
    boardId: string,
    proposalId: string,
    mode?: Extract<RefineProjectBoardSynthesisInput["mode"], "charter_review" | "board_synthesis">,
  ) => void;
  onAnswerQuestion: (proposalId: string, questionIndex: number, answer: string) => void;
  onReviewCard: (
    proposalId: string,
    sourceId: string,
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus,
    reason?: string,
    mergeTargetCardId?: string,
  ) => void;
  onApplyProposal: (proposalId: string) => void;
  onRetrySynthesis: (runId: string, mode?: RetryProjectBoardSynthesisInput["mode"]) => void;
  onDeferSynthesisSections: (runId: string) => void;
  onSelectCard: (cardId: string) => void;
  onUpdateCard: (input: UpdateProjectBoardCardInput) => Promise<void> | void;
  onSuggestClarificationDefaults: (input: SuggestProjectBoardClarificationDefaultsInput) => Promise<void> | void;
  onApplyDecisionImpactFeedback: (input: ApplyProjectBoardDecisionImpactFeedbackInput) => Promise<void> | void;
  onRefreshDecisionDrafts: (input: RefreshProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onRegenerateDecisionDrafts: (input: RegenerateProjectBoardDecisionDraftsInput) => Promise<void> | void;
}) {
  const proposals = board.proposals ?? [];
  const latestRun = projectBoardLatestVisibleSynthesisRun(board.synthesisRuns);
  const executionReview = projectBoardExecutionPmReview(board);
  const decisionQueue = projectBoardDecisionQueue(board);
  const proposal = proposals.find((candidate) => candidate.status === "pending") ?? proposals[0];
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!proposal) return;
    const nextDrafts = proposal.answers.reduce<Record<number, string>>((drafts, answer) => {
      drafts[answer.questionIndex] = answer.answer;
      return drafts;
    }, {});
    setAnswerDrafts(nextDrafts);
  }, [proposal?.id, proposal?.updatedAt]);

  if (!proposal) {
    return (
      <section className="project-board-tab-panel" aria-label="Project board decisions">
        <ProjectBoardDecisionQueuePanel
          board={board}
          queue={decisionQueue}
          onSelectCard={onSelectCard}
          onSaveDecisionAnswer={onUpdateCard}
          onSuggestClarificationDefaults={onSuggestClarificationDefaults}
          onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
          onRefreshDecisionDrafts={onRefreshDecisionDrafts}
          onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
        />
        <ProjectBoardExecutionPmReviewPanel review={executionReview} />
        <div className="project-board-empty-panel">
          <ClipboardPaste size={26} />
          <h3>No Pi proposal yet</h3>
          <p>Run Review Charter With Pi from the Charter pane to find unresolved charter gaps before generating draft cards.</p>
        </div>
        {latestRun && (
          <ProjectBoardSynthesisRunLedger
            run={latestRun}
            retryBusy={retryBusy}
            deferBusy={deferBusy}
            onRetryFailedSections={onRetrySynthesis}
            onRetryStalledRun={(runId) => onRetrySynthesis(runId, "stalled_run")}
            onContinuePlannerBatch={(runId) => onRetrySynthesis(runId, "continue_batch")}
            onResumePausedRun={(runId) => onRetrySynthesis(runId, "paused_run")}
            onStartFreshFromPausedRun={(runId) => onRetrySynthesis(runId, "start_fresh")}
            onDeferFailedSections={onDeferSynthesisSections}
          />
        )}
      </section>
    );
  }

  const cardCount = proposal.cards.length;
  const reviewReport = proposal.reviewReport;
  const isLightweightReview = Boolean(reviewReport && cardCount === 0);
  const pending = proposal.status === "pending";
  const answeredQuestionIndexes = new Set(proposal.answers.map((answer) => answer.questionIndex));
  const allQuestionsAnswered =
    proposal.questions.length > 0 && proposal.questions.every((_question, index) => answeredQuestionIndexes.has(index));
  const mergeTargets = board.cards.filter((card) => card.status === "draft" && !card.orchestrationTaskId);
  return (
    <section className="project-board-tab-panel project-board-proposal-panel" aria-label="Project board decisions">
      <ProjectBoardDecisionQueuePanel
        board={board}
        queue={decisionQueue}
        onSelectCard={onSelectCard}
        onSaveDecisionAnswer={onUpdateCard}
        onSuggestClarificationDefaults={onSuggestClarificationDefaults}
        onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
        onRefreshDecisionDrafts={onRefreshDecisionDrafts}
        onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
      />
      <ProjectBoardSynthesisProposalSummary
        board={board}
        proposal={proposal}
        latestRun={latestRun}
        refineBusy={refineBusy}
        applyBusy={applyBusy}
        onRefineProposal={onRefineProposal}
        onApplyProposal={onApplyProposal}
      />
      <ProjectBoardExecutionPmReviewPanel review={executionReview} />
      {latestRun && (
        <ProjectBoardSynthesisRunLedger
          run={latestRun}
          retryBusy={retryBusy}
          deferBusy={deferBusy}
          onRetryFailedSections={onRetrySynthesis}
          onRetryStalledRun={(runId) => onRetrySynthesis(runId, "stalled_run")}
          onContinuePlannerBatch={(runId) => onRetrySynthesis(runId, "continue_batch")}
          onResumePausedRun={(runId) => onRetrySynthesis(runId, "paused_run")}
          onStartFreshFromPausedRun={(runId) => onRetrySynthesis(runId, "start_fresh")}
          onDeferFailedSections={onDeferSynthesisSections}
        />
      )}
      <div className="project-board-proposal-grid">
        <section className="project-board-proposal-questions">
          <header>
            <span className="project-board-kicker">Charter gaps</span>
            <h3>
              {proposal.questions.length} unresolved question{proposal.questions.length === 1 ? "" : "s"}
            </h3>
          </header>
          {proposal.questions.length > 0 ? (
            <div className="project-board-proposal-answer-list">
              {proposal.questions.map((question, index) => {
                const savedAnswer = proposal.answers.find((answer) => answer.questionIndex === index);
                const draft = answerDrafts[index] ?? "";
                const busy = answerBusy === `${proposal.id}:${index}`;
                return (
                  <div className="project-board-question" key={`${index}:${question}`}>
                    <label>
                      <span>{question}</span>
                      {savedAnswer && <em>Answered {formatTimelineTime(savedAnswer.answeredAt)}</em>}
                      <textarea
                        value={draft}
                        onChange={(event) => setAnswerDrafts((current) => ({ ...current, [index]: event.target.value }))}
                        placeholder="Answer only the missing charter detail"
                        disabled={!pending || busy}
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!pending || busy || !draft.trim() || draft.trim() === savedAnswer?.answer.trim()}
                      title={
                        !pending
                          ? "This proposal is no longer pending, so charter-gap answers cannot be changed here."
                          : busy
                            ? "This charter-gap answer is already saving."
                            : !draft.trim()
                              ? "Enter an answer before saving this charter gap."
                              : draft.trim() === savedAnswer?.answer.trim()
                                ? "Change the answer before saving an update."
                                : "Save this answer for Pi's next charter review pass."
                      }
                      onClick={() => onAnswerQuestion(proposal.id, index, draft)}
                    >
                      <Check size={14} />
                      <span>{busy ? "Saving" : savedAnswer ? "Update Gap" : "Save Gap"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="project-board-column-empty">Pi did not flag blocking questions for this proposal.</p>
          )}
          {proposal.questions.length > 0 && (
            <p className="project-board-proposal-note">
              {allQuestionsAnswered
                ? "All charter-gap questions have answers. Update Charter Review to ask Pi for a tighter proposal before applying."
                : `${proposal.answers.length} of ${proposal.questions.length} question${proposal.questions.length === 1 ? "" : "s"} answered.`}
            </p>
          )}
          {proposal.assumptions.length > 0 && (
            <>
              <h4>Assumptions</h4>
              <ul className="project-board-card-list-compact">
                {proposal.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </>
          )}
          {proposal.sourceNotes.length > 0 && (
            <>
              <h4>Source notes</h4>
              <ul className="project-board-card-list-compact">
                {proposal.sourceNotes.slice(0, 8).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="project-board-proposal-cards">
          <header>
            <span className="project-board-kicker">{isLightweightReview ? "Recommendation" : "Proposed draft inbox"}</span>
            <h3>
              {isLightweightReview
                ? projectBoardPmReviewReadinessLabel(reviewReport!.readiness)
                : `${cardCount} card${cardCount === 1 ? "" : "s"}`}
            </h3>
          </header>
          {isLightweightReview && reviewReport ? (
            <ProjectBoardPmReviewReport report={reviewReport} />
          ) : (
            <div className="project-board-card-list">
              {proposal.cards.map((card) => (
                <ProjectBoardProposalCard
                  card={card}
                  proposalId={proposal.id}
                  pending={pending}
                  busy={cardReviewBusy === `${proposal.id}:${card.sourceId}`}
                  mergeTargets={mergeTargets}
                  planningWarnings={projectBoardPlanningWarningsForCard(card, board)}
                  onReviewCard={onReviewCard}
                  key={card.sourceId}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      {proposals.length > 1 && (
        <section className="project-board-proposal-history" aria-label="Previous Pi proposals">
          <header>
            <span className="project-board-kicker">Proposal history</span>
            <h3>{proposals.length} proposals</h3>
          </header>
          <div className="project-board-source-counts">
            {proposals.slice(0, 6).map((candidate) => (
              <span key={candidate.id}>
                {projectBoardProposalStatusLabel(candidate.status)} · {candidate.cards.length} cards ·{" "}
                {formatTimelineTime(candidate.createdAt)}
              </span>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function ProjectBoardSynthesisProposalSummary({
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
  const proofScopeTitle = projectBoardPlanningWarningActionTitle(planningWarnings);
  const [reason, setReason] = useState(card.reviewReason ?? "");
  const [mergeTargetCardId, setMergeTargetCardId] = useState(card.mergeTargetCardId ?? firstMergeTargetId);

  useEffect(() => {
    setReason(card.reviewReason ?? "");
    setMergeTargetCardId(card.mergeTargetCardId ?? firstMergeTargetId);
  }, [card.reviewReason, card.mergeTargetCardId, card.sourceId, firstMergeTargetId]);

  function review(reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus) {
    onReviewCard(proposalId, card.sourceId, reviewStatus, reason, reviewStatus === "merged" ? mergeTargetCardId : undefined);
  }

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
                busy
                  ? "This proposal card review is already saving."
                  : "Reject this proposed card as incorrect, duplicate, or out of scope."
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
      )}
    </article>
  );
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
