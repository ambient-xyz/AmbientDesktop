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
import { useEffect, useRef, useState } from "react";

import type {
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardGitSyncStatus,
  ProjectSummary,
  RefreshProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  ResolveProjectBoardCardPiUpdateInput,
  UpdateProjectBoardCardInput,
} from "../../shared/types";
import { ProjectBoardClaimControls, projectBoardCardTouchedFieldLabel } from "./ProjectBoardActiveCardDetailViews";
import { projectBoardCardSourceLabel } from "./ProjectBoardLaneViews";
import {
  projectBoardCardCanMarkReady,
  projectBoardCardCanSplit,
  projectBoardCardEditCanSave,
  projectBoardCardEditDraft,
  projectBoardCardEditHasChanges,
  projectBoardCardEditInput,
  projectBoardCardEditWithClarificationAnswerInput,
  projectBoardCandidateClarificationItems,
  projectBoardPendingClarificationDecisions,
  type ProjectBoardCardEditDraft,
} from "./projectBoardCardEditUiModel";
import {
  projectBoardCardHasProofSpec,
  projectBoardCardSourceBasis,
  projectBoardDecisionImpactPreview,
  projectBoardRequiresProofSpec,
  type ProjectBoardCardClaimAction,
  type ProjectBoardDecisionImpactPreview,
} from "./projectBoardUiModel";
import {
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
  type ProjectBoardPlanningWarning,
} from "./projectBoardPlanningWarningUiModel";

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


export function ProjectBoardCandidateDetail({
  card,
  board,
  onClose,
  onSave,
  onApproveCard,
  onSplitCard,
  onUpdateCardCandidate,
  onResolveCardPiUpdate,
  onApplyDecisionImpactFeedback,
  onRefreshDecisionDrafts,
  onRegenerateDecisionDrafts,
  onInspectSource,
  gitStatus,
  claimBusy,
  onClaimAction,
}: {
  card: ProjectBoardCard;
  board?: NonNullable<ProjectSummary["board"]>;
  onClose: () => void;
  onSave: (input: UpdateProjectBoardCardInput) => void;
  onApproveCard: (card: ProjectBoardCard) => void;
  onSplitCard: (cardId: string) => void;
  onUpdateCardCandidate: (card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) => void;
  onResolveCardPiUpdate: (input: ResolveProjectBoardCardPiUpdateInput) => void;
  onApplyDecisionImpactFeedback: (input: ApplyProjectBoardDecisionImpactFeedbackInput) => Promise<void> | void;
  onRefreshDecisionDrafts: (input: RefreshProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onRegenerateDecisionDrafts: (input: RegenerateProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onInspectSource: (sourceId?: string) => void;
  gitStatus?: ProjectBoardGitSyncStatus;
  claimBusy?: string;
  onClaimAction: (card: ProjectBoardCard, action: ProjectBoardCardClaimAction) => void;
}) {
  const [draft, setDraft] = useState<ProjectBoardCardEditDraft>(() => projectBoardCardEditDraft(card));
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<string, string>>({});
  const [decisionImpactBusyQuestion, setDecisionImpactBusyQuestion] = useState<string | undefined>();
  const [piUpdateResolution, setPiUpdateResolution] = useState<"applied" | "ignored" | undefined>();
  const [piUpdateError, setPiUpdateError] = useState<string | undefined>();
  const [approvalRequested, setApprovalRequested] = useState(false);
  // Latest-value refs so the background-update effect can check for unsaved typing
  // without re-running on every keystroke.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftBaselineRef = useRef(draft);

  const applyCardBaseline = () => {
    const baseline = projectBoardCardEditDraft(card);
    draftBaselineRef.current = baseline;
    setDraft(baseline);
    setClarificationDrafts({});
    setDecisionImpactBusyQuestion(undefined);
    setPiUpdateResolution(undefined);
    setApprovalRequested(false);
  };

  useEffect(() => {
    // Switching to a different card always resets the form.
    applyCardBaseline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  useEffect(() => {
    // A background update to the SAME card (git pull, Pi update, source refresh)
    // refreshes the form only when the user has no unsaved edits; silently wiping
    // in-progress typing loses work; the Reset button remains for explicit refresh.
    const dirty = JSON.stringify(draftRef.current) !== JSON.stringify(draftBaselineRef.current);
    if (!dirty) applyCardBaseline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.updatedAt, card.pendingPiUpdate?.createdAt]);

  const ticketized = Boolean(card.orchestrationTaskId) || card.status !== "draft";
  const canSave = !ticketized && projectBoardCardEditCanSave(card, draft, board);
  const canSplit = projectBoardCardCanSplit(card);
  const canMarkReady = !ticketized && projectBoardCardCanMarkReady(card, board);
  const inspectorKicker = ticketized ? "Inbox detail" : "Candidate inspector";
  const inspectorBadge = ticketized ? "Ticketized card" : "Selected candidate";
  const inspectorDescription = ticketized
    ? "Opened from the Draft Inbox history. Approved fields are read-only here; use Board for execution controls, blockers, and next-run work."
    : "Selected draft card. Edits here preserve the Draft Inbox columns and protect user-touched fields from silent Pi overwrites.";
  const clarificationItems = projectBoardCandidateClarificationItems(card, board);
  const planningWarnings = projectBoardPlanningWarningsForCard(card, board);
  const answeredClarifications = card.clarificationAnswers ?? [];
  const explicitClarificationDecisions = projectBoardPendingClarificationDecisions(card);
  const explicitClarificationQuestions = explicitClarificationDecisions.map((decision) => decision.question);
  const sourceBasis = projectBoardCardSourceBasis(card, board?.sources ?? []);
  const missingRequiredProof = Boolean(board && projectBoardRequiresProofSpec(board) && !projectBoardCardHasProofSpec(card));
  const proofGateTitle = "Add at least one proof expectation before marking this card ready.";
  const proofScopeTitle = projectBoardPlanningWarningActionTitle(planningWarnings);
  const readyGateTitle = !canMarkReady
    ? explicitClarificationQuestions.length > 0
      ? "Answer the attached clarification questions before marking this card ready."
      : missingRequiredProof
        ? proofGateTitle
        : "Resolve this card's readiness blocker before marking it ready."
    : proofScopeTitle ?? "Mark or approve this candidate for ticketization.";
  const setField = (field: keyof ProjectBoardCardEditDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const setCandidateStatus = (candidateStatus: ProjectBoardCardCandidateStatus) => setDraft((current) => ({ ...current, candidateStatus }));
  const setClarificationDraft = (question: string, value: string) => setClarificationDrafts((current) => ({ ...current, [question]: value }));
  const decisionImpactPreviewForQuestion = (question: string): ProjectBoardDecisionImpactPreview | undefined =>
    board
      ? projectBoardDecisionImpactPreview(board, {
          question,
          answer: clarificationDrafts[question],
          answeredCardId: card.id,
        })
      : undefined;
  const saveClarificationAnswer = (question: string) => {
    if (ticketized) return;
    const answer = clarificationDrafts[question]?.trim() ?? "";
    if (!answer) return;
    onSave(projectBoardCardEditWithClarificationAnswerInput(card, draft, question, answer));
    setClarificationDrafts((current) => {
      const next = { ...current };
      delete next[question];
      return next;
    });
  };
  const saveClarificationAnswerWithFeedback = async (question: string) => {
    const answer = clarificationDrafts[question]?.trim() ?? "";
    if (!answer) return;
    setDecisionImpactBusyQuestion(question);
    try {
      await onApplyDecisionImpactFeedback({ cardId: card.id, question, answer });
      setClarificationDrafts((current) => {
        const next = { ...current };
        delete next[question];
        return next;
      });
    } catch {
      // The top-level action handler already surfaces the error; keep the draft answer in place.
    } finally {
      setDecisionImpactBusyQuestion(undefined);
    }
  };
  const refreshDecisionDrafts = async (question: string) => {
    const answer = clarificationDrafts[question]?.trim() ?? "";
    if (!answer) return;
    setDecisionImpactBusyQuestion(question);
    try {
      await onRefreshDecisionDrafts({ cardId: card.id, question, answer });
      setClarificationDrafts((current) => {
        const next = { ...current };
        delete next[question];
        return next;
      });
    } catch {
      // The top-level action handler already surfaces the error; keep the draft answer in place.
    } finally {
      setDecisionImpactBusyQuestion(undefined);
    }
  };
  const regenerateDecisionDrafts = async (question: string) => {
    const answer = clarificationDrafts[question]?.trim() ?? "";
    if (!answer) return;
    setDecisionImpactBusyQuestion(question);
    try {
      await onRegenerateDecisionDrafts({ cardId: card.id, question, answer });
      setClarificationDrafts((current) => {
        const next = { ...current };
        delete next[question];
        return next;
      });
    } catch {
      // The top-level action handler already surfaces the error; keep the draft answer in place.
    } finally {
      setDecisionImpactBusyQuestion(undefined);
    }
  };
  const acceptClarificationSuggestion = (question: string, suggestedAnswer?: string) => {
    if (ticketized) return;
    const answer = suggestedAnswer?.trim() ?? "";
    if (!answer) return;
    onSave(projectBoardCardEditWithClarificationAnswerInput(card, draft, question, answer));
  };
  const resolvePiUpdate = async (action: "apply" | "ignore") => {
    // Mark resolved only after the IPC call succeeds: an optimistic "applied" with a
    // failed call would permanently claim success with both buttons disabled.
    setPiUpdateError(undefined);
    setPiUpdateResolution(action === "apply" ? "applied" : "ignored");
    try {
      await Promise.resolve(onResolveCardPiUpdate({ cardId: card.id, action }));
    } catch (error) {
      setPiUpdateResolution(undefined);
      setPiUpdateError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section className="project-board-candidate-detail" aria-label="Candidate card detail" data-ui-scroll-container="required">
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
            onClick={() => setDraft(projectBoardCardEditDraft(card))}
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
      {card.pendingPiUpdate && (
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
                : `Planning proposed newer values for protected fields: ${card.pendingPiUpdate.changedFields.map(projectBoardCardTouchedFieldLabel).join(", ")}. Review before applying so user edits are not overwritten silently.`}
          </p>
          <div className="project-board-card-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(piUpdateResolution)}
              title="Keep the current user-edited card and dismiss Pi's proposed update."
              onClick={() => resolvePiUpdate("ignore")}
            >
              <X size={14} />
              <span>{piUpdateResolution === "ignored" ? "Ignored" : "Ignore Pi Update"}</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(piUpdateResolution)}
              title="Apply Pi's proposed values to this card."
              onClick={() => resolvePiUpdate("apply")}
            >
              <Check size={14} />
              <span>{piUpdateResolution === "applied" ? "Applied" : "Apply Pi Update"}</span>
            </button>
          </div>
        </section>
      )}
      {planningWarnings.length > 0 && (
        <section className="project-board-proof-scope-panel" aria-label="Proof ownership warning">
          <ProjectBoardProofScopeWarningSummary warnings={planningWarnings} />
        </section>
      )}
      {missingRequiredProof && (
        <div className="project-board-proof-gate">
          <AlertCircle size={15} />
          <p>Strict proof policy is active. Add at least one unit, integration, visual, or manual proof item before this card can become ready.</p>
        </div>
      )}
      <ProjectBoardClaimControls card={card} gitStatus={gitStatus} busy={claimBusy} onAction={onClaimAction} />
      {clarificationItems.length > 0 && (
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
                              ? acceptClarificationSuggestion(decision.question, decision.suggestedAnswer)
                              : setClarificationDraft(decision.question, decision.suggestedAnswer ?? "")
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
                    onChange={(event) => setClarificationDraft(decision.question, event.target.value)}
                    placeholder="Answer this PM question. The answer is appended to the card and the question is marked answered."
                  />
                  <ProjectBoardDecisionImpactSummary
                    impact={decisionImpactPreviewForQuestion(decision.question)}
                    actionBusy={decisionImpactBusyQuestion === decision.question}
                    onApplyReadyFeedback={() => void saveClarificationAnswerWithFeedback(decision.question)}
                    onRefreshDrafts={() => void refreshDecisionDrafts(decision.question)}
                    onRegenerateDrafts={() => void regenerateDecisionDrafts(decision.question)}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={ticketized || !clarificationDrafts[decision.question]?.trim()}
                    title={ticketized ? "Approved cards are read-only in the Draft Inbox detail view." : "Save this clarification answer into the card and remove the question from the PM gate."}
                    onClick={() => saveClarificationAnswer(decision.question)}
                  >
                    <Check size={14} />
                    <span>Save Answer</span>
                  </button>
                </label>
              ))}
            </div>
          )}
          {answeredClarifications.length > 0 && (
            <div className="project-board-clarification-resolved" aria-label="Answered clarifications">
              <strong>Answered clarifications</strong>
              {answeredClarifications.slice(0, 6).map((item) => (
                <p key={`${item.question}:${item.answeredAt}`}>
                  <span>{item.question}</span>
                  <em>{item.answer}</em>
                </p>
              ))}
            </div>
          )}
        </section>
      )}
      {sourceBasis.length > 0 && (
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
      )}
      <div className="project-board-detail-grid">
        <label>
          <span>Title</span>
          <input
            value={draft.title}
            onChange={(event) => setField("title", event.target.value)}
            placeholder="Candidate title"
            title={draft.title || "Candidate title"}
            aria-label={`Candidate title for ${card.title}`}
            disabled={ticketized}
          />
        </label>
        <label>
          <span>Status</span>
          <select value={draft.candidateStatus} onChange={(event) => setCandidateStatus(event.target.value as ProjectBoardCardCandidateStatus)} disabled={ticketized}>
            <option value="needs_clarification">Needs clarification</option>
            <option value="ready_to_create">Ready to create</option>
            <option value="evidence">Covered / Done</option>
            <option value="duplicate">Duplicate</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          <span>Priority</span>
          <input value={draft.priority} onChange={(event) => setField("priority", event.target.value.replace(/[^\d]/g, "").slice(0, 3))} placeholder="0-100" disabled={ticketized} />
        </label>
        <label>
          <span>Phase</span>
          <input value={draft.phase} onChange={(event) => setField("phase", event.target.value)} placeholder="Phase or milestone" disabled={ticketized} />
        </label>
        <label className="project-board-detail-wide project-board-detail-large">
          <span>Description</span>
          <textarea value={draft.description} onChange={(event) => setField("description", event.target.value)} placeholder="Self-contained task description" disabled={ticketized} />
        </label>
        <label className="project-board-detail-wide">
          <span>Labels</span>
          <input value={draft.labels} onChange={(event) => setField("labels", event.target.value)} placeholder="frontend, polish, phase-1" disabled={ticketized} />
        </label>
        <label className="project-board-detail-wide project-board-detail-large">
          <span>Dependencies / blockers</span>
          <textarea value={draft.blockedBy} onChange={(event) => setField("blockedBy", event.target.value)} placeholder="One blocker id or card reference per line" disabled={ticketized} />
        </label>
        <label className="project-board-detail-wide project-board-detail-large">
          <span>Acceptance criteria</span>
          <textarea value={draft.acceptanceCriteria} onChange={(event) => setField("acceptanceCriteria", event.target.value)} placeholder="One criterion per line" disabled={ticketized} />
        </label>
        <label className="project-board-detail-proof">
          <span>Unit proof</span>
          <textarea value={draft.unitTests} onChange={(event) => setField("unitTests", event.target.value)} placeholder="One unit proof per line" disabled={ticketized} />
        </label>
        <label className="project-board-detail-proof">
          <span>Integration proof</span>
          <textarea value={draft.integrationTests} onChange={(event) => setField("integrationTests", event.target.value)} placeholder="One integration proof per line" disabled={ticketized} />
        </label>
        <label className="project-board-detail-proof">
          <span>Visual proof</span>
          <textarea value={draft.visualTests} onChange={(event) => setField("visualTests", event.target.value)} placeholder="One visual proof per line" disabled={ticketized} />
        </label>
        <label className="project-board-detail-proof">
          <span>Manual proof</span>
          <textarea value={draft.manualTests} onChange={(event) => setField("manualTests", event.target.value)} placeholder="One manual proof per line" disabled={ticketized} />
        </label>
      </div>
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
                  onClick={() => {
                    setApprovalRequested(true);
                    onApproveCard(card);
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>{approvalRequested ? "Approving" : "Approve"}</span>
                </button>
              ) : (
                <button type="button" className="secondary-button" disabled={!canMarkReady} title={canMarkReady ? "Mark candidate ready" : readyGateTitle} onClick={() => onUpdateCardCandidate(card, "ready_to_create")}>
                  <Check size={14} />
                  <span>Mark Ready</span>
                </button>
              )}
              {card.candidateStatus !== "rejected" && (
                <button type="button" className="secondary-button danger" title="Reject this draft so it is skipped by task creation." onClick={() => onUpdateCardCandidate(card, "rejected")}>
                  <X size={14} />
                  <span>Reject</span>
                </button>
              )}
              {card.candidateStatus !== "needs_clarification" && (
                <button
                  type="button"
                  className="secondary-button"
                  title="Move this draft back to needs-info before ticketization."
                  onClick={() => onUpdateCardCandidate(card, "needs_clarification")}
                >
                  <Info size={14} />
                  <span>Needs Info</span>
                </button>
              )}
              {card.candidateStatus !== "evidence" && (
                <button type="button" className="secondary-button" title="Mark this draft as already covered by existing work or evidence." onClick={() => onUpdateCardCandidate(card, "evidence")}>
                  <Check size={14} />
                  <span>Mark Covered</span>
                </button>
              )}
              {card.candidateStatus !== "duplicate" && (
                <button type="button" className="secondary-button" title="Mark this draft as a duplicate so it is skipped by task creation." onClick={() => onUpdateCardCandidate(card, "duplicate")}>
                  <Copy size={14} />
                  <span>Duplicate</span>
                </button>
              )}
            </>
          )}
          {!ticketized && canSplit && (
            <button type="button" className="secondary-button" title="Split acceptance criteria into smaller candidate cards." onClick={() => onSplitCard(card.id)}>
              <GitBranch size={14} />
              <span>Split Criteria</span>
            </button>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={!canSave}
            title={canSave ? "Save edits to this candidate card." : "Change at least one field before saving."}
            onClick={() => onSave(projectBoardCardEditInput(card.id, draft))}
          >
            <Check size={14} />
            <span>Save Details</span>
          </button>
        </div>
      </footer>
    </section>
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
