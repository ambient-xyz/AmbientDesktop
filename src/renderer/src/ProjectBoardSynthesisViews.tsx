import { Check, ClipboardPaste } from "lucide-react";
import { useState } from "react";

import type {
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectSummary,
  RefineProjectBoardSynthesisInput,
  RefreshProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RetryProjectBoardSynthesisInput,
  SuggestProjectBoardClarificationDefaultsInput,
  UpdateProjectBoardCardInput,
} from "../../shared/projectBoardTypes";
import { ProjectBoardDecisionQueuePanel } from "./ProjectBoardDecisionQueueViews";
import {
  ProjectBoardExecutionPmReviewPanel,
  ProjectBoardPmReviewReport,
  ProjectBoardProposalCard,
  ProjectBoardSynthesisProposalSummary,
  projectBoardPmReviewReadinessLabel,
  projectBoardProposalStatusLabel,
} from "./ProjectBoardSynthesisProposalViews";
import { ProjectBoardSynthesisRunLedger, projectBoardLatestVisibleSynthesisRun } from "./ProjectBoardSynthesisRunViews";
import { projectBoardDecisionQueue, projectBoardExecutionPmReview } from "./projectBoardUiModel";
import { projectBoardPlanningWarningsForCard } from "./projectBoardPlanningWarningUiModel";
import { formatTimelineTime } from "./RightPanel";

export { ProjectBoardDecisionQueuePanel } from "./ProjectBoardDecisionQueueViews";
export {
  ProjectBoardExecutionPmReviewPanel,
  ProjectBoardPmReviewReport,
  ProjectBoardProposalCard,
  ProjectBoardSynthesisProposalSummary,
  projectBoardPmReviewReadinessLabel,
  projectBoardProposalCardReviewLabel,
  projectBoardProposalReviewCounts,
  projectBoardProposalStatusLabel,
} from "./ProjectBoardSynthesisProposalViews";
export {
  ProjectBoardPromptBudgetAudit,
  ProjectBoardSynthesisActivity,
  ProjectBoardSynthesisRunLedger,
  ProjectBoardSynthesisSectionStatusList,
  projectBoardKickoffDefaultsRunMetric,
  projectBoardKickoffDefaultsRunTargetCount,
  projectBoardLatestVisibleSynthesisRun,
  projectBoardRenderedCardLedgerSummary,
  projectBoardSynthesisActivityEvents,
  projectBoardSynthesisRunPercent,
  projectBoardSynthesisRunStageLabel,
  projectBoardSynthesisRunStatusLabel,
  projectBoardSynthesisSectionMetric,
} from "./ProjectBoardSynthesisRunViews";

function projectBoardProposalDraftStateKey(proposal: ProjectBoardSynthesisProposal): string {
  return `${proposal.id}:${proposal.updatedAt}`;
}

function projectBoardProposalAnswerDrafts(proposal: ProjectBoardSynthesisProposal): Record<number, string> {
  return proposal.answers.reduce<Record<number, string>>((drafts, answer) => {
    drafts[answer.questionIndex] = answer.answer;
    return drafts;
  }, {});
}

type ProjectBoardSynthesisProposalTabProps = {
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
};

export function ProjectBoardSynthesisProposalTab(props: ProjectBoardSynthesisProposalTabProps) {
  const proposals = props.board.proposals ?? [];
  const proposal = proposals.find((candidate) => candidate.status === "pending") ?? proposals[0];
  return <ProjectBoardSynthesisProposalTabContent key={proposal ? projectBoardProposalDraftStateKey(proposal) : "empty"} {...props} />;
}

function ProjectBoardSynthesisProposalTabContent({
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
}: ProjectBoardSynthesisProposalTabProps) {
  const proposals = board.proposals ?? [];
  const latestRun = projectBoardLatestVisibleSynthesisRun(board.synthesisRuns);
  const executionReview = projectBoardExecutionPmReview(board);
  const decisionQueue = projectBoardDecisionQueue(board);
  const proposal = proposals.find((candidate) => candidate.status === "pending") ?? proposals[0];
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>(() =>
    proposal ? projectBoardProposalAnswerDrafts(proposal) : {},
  );

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
