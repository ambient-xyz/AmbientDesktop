import {
  Check,
  FileText,
  GitBranch,
  LoaderCircle,
  RotateCcw,
  SquarePen,
  X,
  Zap,
} from "lucide-react";

import type { ProjectBoardCard, ProjectBoardCardRunFeedbackSource, ProjectBoardProofDecisionAction, ProjectBoardSplitDecisionAction } from "../../shared/projectBoardTypes";
import { formatOrchestrationRunStatus, ProofOfWorkPreview, RunTimeline } from "./AutomationsWorkspace";
import { formatTaskState, formatTimelineTime } from "./RightPanel";
import { ProjectBoardObjectiveProvenanceBlock, projectBoardPhaseDisplayName } from "./ProjectBoardLaneViews";
import { ProjectBoardProofFollowUpImpactPanel } from "./ProjectBoardProofViews";
import {
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardCanonicalCardProjection,
  projectBoardPendingClarificationDecisions,
  projectBoardProofDecisionModel,
  projectBoardProofFollowUpImpactModel,
} from "./projectBoardUiModel";

export type ProjectBoardActiveCardDetailPanelTab = "spec" | "proof" | "dependencies" | "history";

export function ProjectBoardActiveCardDetailHeader({
  card,
  onClose,
}: {
  card: ProjectBoardCard;
  onClose: () => void;
}) {
  return (
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
  );
}

export function ProjectBoardActiveCardTaskSpecPanel({
  card,
  detail,
  cardProjection,
}: {
  card: ProjectBoardCard;
  detail: ReturnType<typeof projectBoardActiveCardDetail>;
  cardProjection: ReturnType<typeof projectBoardCanonicalCardProjection>;
}) {
  return (
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
  );
}

export function ProjectBoardActiveCardDetailTabs({
  activeTab,
  onChange,
}: {
  activeTab: ProjectBoardActiveCardDetailPanelTab;
  onChange: (tab: ProjectBoardActiveCardDetailPanelTab) => void;
}) {
  const tabs: Array<{ id: ProjectBoardActiveCardDetailPanelTab; label: string }> = [
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

export function ProjectBoardActiveCardTabPanel({
  activeTab,
  card,
  detail,
  overview,
  cardProjection,
  proofDecision,
  proofFollowUpImpact,
  tests,
  hasDecisionPolicy,
  decisionPolicy,
  runBusy,
  onResolveSplitDecision,
}: {
  activeTab: ProjectBoardActiveCardDetailPanelTab;
  card: ProjectBoardCard;
  detail: ReturnType<typeof projectBoardActiveCardDetail>;
  overview: ReturnType<typeof projectBoardActiveCardOverviewModel>;
  cardProjection: ReturnType<typeof projectBoardCanonicalCardProjection>;
  proofDecision: ReturnType<typeof projectBoardProofDecisionModel>;
  proofFollowUpImpact: ReturnType<typeof projectBoardProofFollowUpImpactModel>;
  tests: ReadonlyArray<readonly [string, readonly string[]]>;
  hasDecisionPolicy: boolean;
  decisionPolicy: unknown;
  runBusy?: string;
  onResolveSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => void;
}) {
  return (
    <div className="project-board-active-card-tab-panel">
      {activeTab === "spec" && (
        <ProjectBoardActiveCardSpecTab card={card} overview={overview} />
      )}
      {activeTab === "proof" && (
        <ProjectBoardActiveCardProofTab
          card={card}
          detail={detail}
          proofDecision={proofDecision}
          proofFollowUpImpact={proofFollowUpImpact}
          tests={tests}
        />
      )}
      {activeTab === "dependencies" && (
        <ProjectBoardActiveCardDependenciesTab
          card={card}
          detail={detail}
          cardProjection={cardProjection}
          runBusy={runBusy}
          onResolveSplitDecision={onResolveSplitDecision}
        />
      )}
      {activeTab === "history" && (
        <ProjectBoardActiveCardHistoryTab
          card={card}
          detail={detail}
          hasDecisionPolicy={hasDecisionPolicy}
          decisionPolicy={decisionPolicy}
        />
      )}
    </div>
  );
}

function ProjectBoardActiveCardSpecTab({
  card,
  overview,
}: {
  card: ProjectBoardCard;
  overview: ReturnType<typeof projectBoardActiveCardOverviewModel>;
}) {
  return (
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
  );
}

function ProjectBoardActiveCardProofTab({
  card,
  detail,
  proofDecision,
  proofFollowUpImpact,
  tests,
}: {
  card: ProjectBoardCard;
  detail: ReturnType<typeof projectBoardActiveCardDetail>;
  proofDecision: ReturnType<typeof projectBoardProofDecisionModel>;
  proofFollowUpImpact: ReturnType<typeof projectBoardProofFollowUpImpactModel>;
  tests: ReadonlyArray<readonly [string, readonly string[]]>;
}) {
  return (
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
  );
}

function ProjectBoardActiveCardDependenciesTab({
  card,
  detail,
  cardProjection,
  runBusy,
  onResolveSplitDecision,
}: {
  card: ProjectBoardCard;
  detail: ReturnType<typeof projectBoardActiveCardDetail>;
  cardProjection: ReturnType<typeof projectBoardCanonicalCardProjection>;
  runBusy?: string;
  onResolveSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => void;
}) {
  return (
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
  );
}

function ProjectBoardActiveCardHistoryTab({
  card,
  detail,
  hasDecisionPolicy,
  decisionPolicy,
}: {
  card: ProjectBoardCard;
  detail: ReturnType<typeof projectBoardActiveCardDetail>;
  hasDecisionPolicy: boolean;
  decisionPolicy: unknown;
}) {
  return (
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
