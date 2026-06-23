import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  FileText,
  GitBranch,
  Info,
  RefreshCw,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";

import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardClarificationDecision } from "../../shared/projectBoardClarificationDecisions";
import { projectBoardCardTouchedFieldLabel } from "./ProjectBoardActiveCardDetailViews";
import { projectBoardCardSourceLabel } from "./ProjectBoardLaneViews";
import {
  projectBoardCardEditHasChanges,
  type ProjectBoardCandidateClarificationItem,
  type ProjectBoardCardEditDraft,
} from "./projectBoardCardEditUiModel";
import type { ProjectBoardDecisionImpactPreview } from "./projectBoardUiModel";
import {
  projectBoardPlanningWarningActionTitle,
  type ProjectBoardPlanningWarning,
} from "./projectBoardPlanningWarningUiModel";
import type { ProjectBoardCardSourceBasisItem } from "./projectBoardSourceUiModel";

type CandidateDetailField = keyof ProjectBoardCardEditDraft;

export function ProjectBoardProofScopeWarningSummary({
  warnings,
  compact = false,
}: {
  warnings: ProjectBoardPlanningWarning[];
  compact?: boolean;
}) {
  const warning = warnings[0];
  if (!warning) return null;
  const details = [
    warning.proofOwnership ? `Ownership: ${warning.proofOwnership.replace(/_/g, " ")}` : "",
    warning.visualProofItems.length > 0 ? `Visual proof: ${warning.visualProofItems.slice(0, compact ? 1 : 3).join("; ")}` : "",
  ].filter(Boolean);
  return (
    <div className={`project-board-proof-scope-summary ${compact ? "compact" : ""}`} title={projectBoardPlanningWarningActionTitle(warnings)}>
      <AlertCircle size={compact ? 13 : 15} />
      <span>
        <strong>Proof ownership warning:</strong> {warning.message}
        {!compact && <em>{warning.suggestedFix}</em>}
        {details.length > 0 && <small>{details.join(" · ")}</small>}
      </span>
    </div>
  );
}

export function ProjectBoardCandidateDetailHeader({
  card,
  draft,
  ticketized,
  inspectorKicker,
  inspectorBadge,
  inspectorDescription,
  onClose,
  onReset,
}: {
  card: ProjectBoardCard;
  draft: ProjectBoardCardEditDraft;
  ticketized: boolean;
  inspectorKicker: string;
  inspectorBadge: string;
  inspectorDescription: string;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <header>
      <div className="project-board-inspector-heading">
        <button type="button" className="secondary-button project-board-detail-back" onClick={onClose} title="Back to Draft Inbox lanes">
          <ChevronLeft size={14} />
          <span>Back to Draft Inbox</span>
        </button>
        <div className="project-board-inspector-title">
          <span className="project-board-kicker">{inspectorKicker}</span>
          <h3>{card.title}</h3>
          <p>{inspectorDescription}</p>
        </div>
      </div>
      <div className="project-board-card-actions">
        <span className="project-board-inspector-badge">{inspectorBadge}</span>
        <button
          type="button"
          className="secondary-button"
          onClick={onReset}
          disabled={ticketized || !projectBoardCardEditHasChanges(card, draft)}
          title={ticketized ? "Approved cards are no longer editable in the Draft Inbox inspector." : "Reset the detail form to the saved candidate values."}
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
        <button type="button" className="icon-button" onClick={onClose} title="Close candidate detail" aria-label="Close candidate detail">
          <X size={16} />
        </button>
      </div>
    </header>
  );
}

export function ProjectBoardPendingPiUpdatePanel({
  pendingPiUpdate,
  piUpdateResolution,
  piUpdateError,
  onResolvePiUpdate,
}: {
  pendingPiUpdate?: ProjectBoardCard["pendingPiUpdate"];
  piUpdateResolution?: "applied" | "ignored";
  piUpdateError?: string;
  onResolvePiUpdate: (action: "apply" | "ignore") => void;
}) {
  if (!pendingPiUpdate) return null;
  return (
    <section className={`project-board-pi-update-panel ${piUpdateResolution ? "resolved" : ""}`} aria-label="Pi update available">
      <div>
        {piUpdateResolution === "applied" ? <CheckCircle2 size={15} /> : piUpdateResolution === "ignored" ? <X size={15} /> : <Zap size={15} />}
        <strong>
          {piUpdateResolution === "applied" ? "Pi update applied" : piUpdateResolution === "ignored" ? "Pi update ignored" : "Pi update available"}
        </strong>
      </div>
      <p>
        {piUpdateError
          ? `Resolving the Pi update failed: ${piUpdateError}. Try again.`
          : piUpdateResolution
            ? "Waiting for the refreshed board state to remove this staged update from the inspector."
            : `Planning proposed newer values for protected fields: ${pendingPiUpdate.changedFields.map(projectBoardCardTouchedFieldLabel).join(", ")}. Review before applying so user edits are not overwritten silently.`}
      </p>
      <div className="project-board-card-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={Boolean(piUpdateResolution)}
          title="Keep the current user-edited card and dismiss Pi's proposed update."
          onClick={() => onResolvePiUpdate("ignore")}
        >
          <X size={14} />
          <span>{piUpdateResolution === "ignored" ? "Ignored" : "Ignore Pi Update"}</span>
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={Boolean(piUpdateResolution)}
          title="Apply Pi's proposed values to this card."
          onClick={() => onResolvePiUpdate("apply")}
        >
          <Check size={14} />
          <span>{piUpdateResolution === "applied" ? "Applied" : "Apply Pi Update"}</span>
        </button>
      </div>
    </section>
  );
}

export function ProjectBoardMissingProofGate({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="project-board-proof-gate">
      <AlertCircle size={15} />
      <p>Strict proof policy is active. Add at least one unit, integration, visual, or manual proof item before this card can become ready.</p>
    </div>
  );
}

export function ProjectBoardClarificationPanel({
  clarificationItems,
  explicitClarificationDecisions,
  answeredClarifications,
  clarificationDrafts,
  ticketized,
  decisionImpactBusyQuestion,
  decisionImpactPreviewForQuestion,
  onSetClarificationDraft,
  onAcceptClarificationSuggestion,
  onSaveClarificationAnswer,
  onSaveClarificationAnswerWithFeedback,
  onRefreshDecisionDrafts,
  onRegenerateDecisionDrafts,
}: {
  clarificationItems: ProjectBoardCandidateClarificationItem[];
  explicitClarificationDecisions: ProjectBoardClarificationDecision[];
  answeredClarifications?: ProjectBoardCardClarificationAnswer[];
  clarificationDrafts: Record<string, string>;
  ticketized: boolean;
  decisionImpactBusyQuestion?: string;
  decisionImpactPreviewForQuestion: (question: string) => ProjectBoardDecisionImpactPreview | undefined;
  onSetClarificationDraft: (question: string, value: string) => void;
  onAcceptClarificationSuggestion: (question: string, suggestedAnswer?: string) => void;
  onSaveClarificationAnswer: (question: string) => void;
  onSaveClarificationAnswerWithFeedback: (question: string) => void;
  onRefreshDecisionDrafts: (question: string) => void;
  onRegenerateDecisionDrafts: (question: string) => void;
}) {
  if (clarificationItems.length === 0) return null;
  const explicitClarificationQuestions = explicitClarificationDecisions.map((decision) => decision.question);
  const answered = answeredClarifications ?? [];
  return (
    <section className="project-board-clarification-panel" aria-label="Clarification needed">
      <div>
        <Info size={15} />
        <strong>What needs clarification</strong>
      </div>
      <ul>
        {clarificationItems.map((item) => (
          <li className={item.tone} key={`${item.label}:${item.detail}`}>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </li>
        ))}
      </ul>
      {explicitClarificationQuestions.length > 0 && (
        <div className="project-board-clarification-answers" aria-label="Answer clarification questions">
          {explicitClarificationDecisions.map((decision) => (
            <label key={decision.id}>
              <span>{decision.question}</span>
              {decision.suggestedAnswer && (
                <div className={`project-board-clarification-suggestion ${decision.safeToAccept ? "safe" : "manual"}`}>
                  <strong>{decision.safeToAccept ? "Suggested expert default" : "Suggestion requires review"}</strong>
                  <p>{decision.suggestedAnswer}</p>
                  {decision.rationale && <small>{decision.rationale}</small>}
                  <div className="project-board-card-actions">
                    <span className="project-board-inspector-badge">
                      {decision.questionKind?.replace(/_/g, " ") ?? "clarification"} · {decision.confidence ?? "low"} confidence
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={ticketized && decision.safeToAccept}
                      title={
                        ticketized && decision.safeToAccept
                          ? "Approved cards are read-only in the Draft Inbox detail view."
                          : decision.safeToAccept
                          ? "Accept this expert default as the clarification answer."
                          : "Use this suggestion as the draft answer so you can review it before saving."
                      }
                      onClick={() =>
                        decision.safeToAccept
                          ? onAcceptClarificationSuggestion(decision.question, decision.suggestedAnswer)
                          : onSetClarificationDraft(decision.question, decision.suggestedAnswer ?? "")
                      }
                    >
                      <Check size={14} />
                      <span>{decision.safeToAccept ? "Accept suggestion" : "Use as draft"}</span>
                    </button>
                  </div>
                </div>
              )}
              <textarea
                value={clarificationDrafts[decision.question] ?? ""}
                onChange={(event) => onSetClarificationDraft(decision.question, event.target.value)}
                placeholder="Answer this PM question. The answer is appended to the card and the question is marked answered."
              />
              <ProjectBoardDecisionImpactSummary
                impact={decisionImpactPreviewForQuestion(decision.question)}
                actionBusy={decisionImpactBusyQuestion === decision.question}
                onApplyReadyFeedback={() => onSaveClarificationAnswerWithFeedback(decision.question)}
                onRefreshDrafts={() => onRefreshDecisionDrafts(decision.question)}
                onRegenerateDrafts={() => onRegenerateDecisionDrafts(decision.question)}
              />
              <button
                type="button"
                className="secondary-button"
                disabled={ticketized || !clarificationDrafts[decision.question]?.trim()}
                title={ticketized ? "Approved cards are read-only in the Draft Inbox detail view." : "Save this clarification answer into the card and remove the question from the PM gate."}
                onClick={() => onSaveClarificationAnswer(decision.question)}
              >
                <Check size={14} />
                <span>Save Answer</span>
              </button>
            </label>
          ))}
        </div>
      )}
      {answered.length > 0 && (
        <div className="project-board-clarification-resolved" aria-label="Answered clarifications">
          <strong>Answered clarifications</strong>
          {answered.slice(0, 6).map((item) => (
            <p key={`${item.question}:${item.answeredAt}`}>
              <span>{item.question}</span>
              <em>{item.answer}</em>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProjectBoardSourceBasisPanel({
  sourceBasis,
  onInspectSource,
}: {
  sourceBasis: ProjectBoardCardSourceBasisItem[];
  onInspectSource: (sourceId?: string) => void;
}) {
  if (sourceBasis.length === 0) return null;
  return (
    <section className="project-board-source-basis-panel" aria-label="Candidate source basis">
      <div>
        <FileText size={15} />
        <strong>Source basis</strong>
      </div>
      <ul>
        {sourceBasis.map((source) => (
          <li key={`${source.sourceId ?? source.label}:${source.ref}`}>
            {source.sourceId ? (
              <button
                type="button"
                className="project-board-source-link-button"
                title={`Open ${source.label} in Charter source review.`}
                onClick={() => onInspectSource(source.sourceId)}
              >
                <strong>{source.label}</strong>
                <span>{source.detail}</span>
              </button>
            ) : (
              <>
                <strong>{source.label}</strong>
                <span>{source.detail}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectBoardCandidateDetailFieldGrid({
  cardTitle,
  draft,
  ticketized,
  onFieldChange,
  onCandidateStatusChange,
}: {
  cardTitle: string;
  draft: ProjectBoardCardEditDraft;
  ticketized: boolean;
  onFieldChange: (field: CandidateDetailField, value: string) => void;
  onCandidateStatusChange: (candidateStatus: ProjectBoardCardCandidateStatus) => void;
}) {
  return (
    <div className="project-board-detail-grid">
      <label>
        <span>Title</span>
        <input
          value={draft.title}
          onChange={(event) => onFieldChange("title", event.target.value)}
          placeholder="Candidate title"
          title={draft.title || "Candidate title"}
          aria-label={`Candidate title for ${cardTitle}`}
          disabled={ticketized}
        />
      </label>
      <label>
        <span>Status</span>
        <select value={draft.candidateStatus} onChange={(event) => onCandidateStatusChange(event.target.value as ProjectBoardCardCandidateStatus)} disabled={ticketized}>
          <option value="needs_clarification">Needs clarification</option>
          <option value="ready_to_create">Ready to create</option>
          <option value="evidence">Covered / Done</option>
          <option value="duplicate">Duplicate</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <label>
        <span>Priority</span>
        <input value={draft.priority} onChange={(event) => onFieldChange("priority", event.target.value.replace(/[^\d]/g, "").slice(0, 3))} placeholder="0-100" disabled={ticketized} />
      </label>
      <label>
        <span>Phase</span>
        <input value={draft.phase} onChange={(event) => onFieldChange("phase", event.target.value)} placeholder="Phase or milestone" disabled={ticketized} />
      </label>
      <label className="project-board-detail-wide project-board-detail-large">
        <span>Description</span>
        <textarea value={draft.description} onChange={(event) => onFieldChange("description", event.target.value)} placeholder="Self-contained task description" disabled={ticketized} />
      </label>
      <label className="project-board-detail-wide">
        <span>Labels</span>
        <input value={draft.labels} onChange={(event) => onFieldChange("labels", event.target.value)} placeholder="frontend, polish, phase-1" disabled={ticketized} />
      </label>
      <label className="project-board-detail-wide project-board-detail-large">
        <span>Dependencies / blockers</span>
        <textarea value={draft.blockedBy} onChange={(event) => onFieldChange("blockedBy", event.target.value)} placeholder="One blocker id or card reference per line" disabled={ticketized} />
      </label>
      <label className="project-board-detail-wide project-board-detail-large">
        <span>Acceptance criteria</span>
        <textarea value={draft.acceptanceCriteria} onChange={(event) => onFieldChange("acceptanceCriteria", event.target.value)} placeholder="One criterion per line" disabled={ticketized} />
      </label>
      <label className="project-board-detail-proof">
        <span>Unit proof</span>
        <textarea value={draft.unitTests} onChange={(event) => onFieldChange("unitTests", event.target.value)} placeholder="One unit proof per line" disabled={ticketized} />
      </label>
      <label className="project-board-detail-proof">
        <span>Integration proof</span>
        <textarea value={draft.integrationTests} onChange={(event) => onFieldChange("integrationTests", event.target.value)} placeholder="One integration proof per line" disabled={ticketized} />
      </label>
      <label className="project-board-detail-proof">
        <span>Visual proof</span>
        <textarea value={draft.visualTests} onChange={(event) => onFieldChange("visualTests", event.target.value)} placeholder="One visual proof per line" disabled={ticketized} />
      </label>
      <label className="project-board-detail-proof">
        <span>Manual proof</span>
        <textarea value={draft.manualTests} onChange={(event) => onFieldChange("manualTests", event.target.value)} placeholder="One manual proof per line" disabled={ticketized} />
      </label>
    </div>
  );
}

export function ProjectBoardCandidateDetailFooter({
  card,
  ticketized,
  canSave,
  canSplit,
  canMarkReady,
  approvalRequested,
  readyGateTitle,
  onApproveReady,
  onMarkCandidate,
  onSplitCard,
  onSaveDetails,
}: {
  card: ProjectBoardCard;
  ticketized: boolean;
  canSave: boolean;
  canSplit: boolean;
  canMarkReady: boolean;
  approvalRequested: boolean;
  readyGateTitle: string;
  onApproveReady: () => void;
  onMarkCandidate: (candidateStatus: ProjectBoardCardCandidateStatus) => void;
  onSplitCard: () => void;
  onSaveDetails: () => void;
}) {
  return (
    <footer>
      <div className="project-board-detail-source">
        <span>{projectBoardCardSourceLabel(card.sourceKind)}</span>
        <strong>{card.sourceId}</strong>
      </div>
      <div className="project-board-card-actions project-board-candidate-footer-actions">
        {ticketized ? (
          <button type="button" className="secondary-button success" disabled title="This candidate has been approved and ticketized as an executable Local Task card.">
            <CheckCircle2 size={14} />
            <span>Approved</span>
          </button>
        ) : (
          <>
            {card.candidateStatus === "ready_to_create" ? (
              <button
                type="button"
                className="secondary-button success"
                disabled={!canMarkReady || approvalRequested}
                title={canMarkReady ? "Approve candidate card" : readyGateTitle}
                onClick={onApproveReady}
              >
                <CheckCircle2 size={14} />
                <span>{approvalRequested ? "Approving" : "Approve"}</span>
              </button>
            ) : (
              <button type="button" className="secondary-button" disabled={!canMarkReady} title={canMarkReady ? "Mark candidate ready" : readyGateTitle} onClick={() => onMarkCandidate("ready_to_create")}>
                <Check size={14} />
                <span>Mark Ready</span>
              </button>
            )}
            {card.candidateStatus !== "rejected" && (
              <button type="button" className="secondary-button danger" title="Reject this draft so it is skipped by task creation." onClick={() => onMarkCandidate("rejected")}>
                <X size={14} />
                <span>Reject</span>
              </button>
            )}
            {card.candidateStatus !== "needs_clarification" && (
              <button
                type="button"
                className="secondary-button"
                title="Move this draft back to needs-info before ticketization."
                onClick={() => onMarkCandidate("needs_clarification")}
              >
                <Info size={14} />
                <span>Needs Info</span>
              </button>
            )}
            {card.candidateStatus !== "evidence" && (
              <button type="button" className="secondary-button" title="Mark this draft as already covered by existing work or evidence." onClick={() => onMarkCandidate("evidence")}>
                <Check size={14} />
                <span>Mark Covered</span>
              </button>
            )}
            {card.candidateStatus !== "duplicate" && (
              <button type="button" className="secondary-button" title="Mark this draft as a duplicate so it is skipped by task creation." onClick={() => onMarkCandidate("duplicate")}>
                <Copy size={14} />
                <span>Duplicate</span>
              </button>
            )}
          </>
        )}
        {!ticketized && canSplit && (
          <button type="button" className="secondary-button" title="Split acceptance criteria into smaller candidate cards." onClick={onSplitCard}>
            <GitBranch size={14} />
            <span>Split Criteria</span>
          </button>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={!canSave}
          title={canSave ? "Save edits to this candidate card." : "Change at least one field before saving."}
          onClick={onSaveDetails}
        >
          <Check size={14} />
          <span>Save Details</span>
        </button>
      </div>
    </footer>
  );
}

export function ProjectBoardDecisionImpactSummary({
  impact,
  actionBusy = false,
  onApplyReadyFeedback,
  onRefreshDrafts,
  onRegenerateDrafts,
}: {
  impact?: ProjectBoardDecisionImpactPreview;
  actionBusy?: boolean;
  onApplyReadyFeedback?: () => void;
  onRefreshDrafts?: () => void;
  onRegenerateDrafts?: () => void;
}) {
  if (!impact?.visible) return null;
  const canCreateReadyFeedback = impact.readyFeedbackCount > 0 && Boolean(impact.answer?.trim()) && Boolean(onApplyReadyFeedback);
  const canRefreshDrafts = impact.targetedRefreshOptional && Boolean(impact.answer?.trim()) && Boolean(onRefreshDrafts);
  const canRegenerateDrafts = impact.targetedRefreshOptional && Boolean(impact.answer?.trim()) && Boolean(onRegenerateDrafts);
  return (
    <div className="project-board-decision-impact" aria-label="Decision impact preview">
      <div>
        <strong>{impact.headline}</strong>
        <span>{impact.detail}</span>
      </div>
      <ul>
        {impact.metrics.slice(0, 5).map((metric) => (
          <li key={metric.label} title={metric.title}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </li>
        ))}
      </ul>
      {impact.recommendedActions.length > 0 && <p>{impact.recommendedActions.slice(0, 3).join(" / ")}</p>}
      {((impact.targetedRefreshOptional && (onRefreshDrafts || onRegenerateDrafts)) || (impact.readyFeedbackCount > 0 && onApplyReadyFeedback)) && (
        <div className="project-board-decision-impact-actions">
          {impact.targetedRefreshOptional && onRefreshDrafts && (
            <button
              type="button"
              className="secondary-button"
              disabled={!canRefreshDrafts || actionBusy}
              title={
                impact.answer?.trim()
                  ? "Save this clarification answer on affected draft cards and clear matching duplicate gates without calling Pi."
                  : "Enter an answer before refreshing affected drafts."
              }
              onClick={onRefreshDrafts}
            >
              <RefreshCw size={14} className={actionBusy ? "spin" : ""} />
              <span>{actionBusy ? "Refreshing drafts" : "Save + refresh drafts"}</span>
            </button>
          )}
          {impact.targetedRefreshOptional && onRegenerateDrafts && (
            <button
              type="button"
              className="secondary-button"
              disabled={!canRegenerateDrafts || actionBusy}
              title={
                impact.answer?.trim()
                  ? "Ask Pi for targeted draft spec updates. Results appear as a reviewable Pi update; approved cards are not rewritten."
                  : "Enter an answer before asking Pi to refresh affected drafts."
              }
              onClick={onRegenerateDrafts}
            >
              <Zap size={14} />
              <span>{actionBusy ? "Asking Pi" : "Ask Pi refresh"}</span>
            </button>
          )}
          {impact.readyFeedbackCount > 0 && onApplyReadyFeedback && (
            <button
              type="button"
              className="secondary-button"
              disabled={!canCreateReadyFeedback || actionBusy}
              title={
                impact.answer?.trim()
                  ? "Save this clarification answer and create additive next-run feedback for matching ticketized cards."
                  : "Enter an answer before creating next-run feedback for ticketized cards."
              }
              onClick={onApplyReadyFeedback}
            >
              <Check size={14} />
              <span>{actionBusy ? "Creating feedback" : "Save + create feedback"}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
