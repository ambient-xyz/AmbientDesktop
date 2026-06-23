import { useEffect, useRef, useState } from "react";

import type { ApplyProjectBoardDecisionImpactFeedbackInput, ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardGitSyncStatus, ProjectSummary, RefreshProjectBoardDecisionDraftsInput, RegenerateProjectBoardDecisionDraftsInput, ResolveProjectBoardCardPiUpdateInput, UpdateProjectBoardCardInput } from "../../shared/projectBoardTypes";
import { ProjectBoardClaimControls } from "./ProjectBoardActiveCardDetailViews";
import {
  ProjectBoardCandidateDetailFieldGrid,
  ProjectBoardCandidateDetailFooter,
  ProjectBoardCandidateDetailHeader,
  ProjectBoardClarificationPanel,
  ProjectBoardMissingProofGate,
  ProjectBoardPendingPiUpdatePanel,
  ProjectBoardProofScopeWarningSummary,
  ProjectBoardSourceBasisPanel,
} from "./ProjectBoardCandidateDetailPanels";
import {
  projectBoardCardCanMarkReady,
  projectBoardCardCanSplit,
  projectBoardCardEditCanSave,
  projectBoardCardEditDraft,
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
} from "./projectBoardPlanningWarningUiModel";

export {
  ProjectBoardDecisionImpactSummary,
  ProjectBoardProofScopeWarningSummary,
} from "./ProjectBoardCandidateDetailPanels";

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
      <ProjectBoardCandidateDetailHeader
        card={card}
        draft={draft}
        ticketized={ticketized}
        inspectorKicker={inspectorKicker}
        inspectorBadge={inspectorBadge}
        inspectorDescription={inspectorDescription}
        onClose={onClose}
        onReset={() => setDraft(projectBoardCardEditDraft(card))}
      />
      <ProjectBoardPendingPiUpdatePanel
        pendingPiUpdate={card.pendingPiUpdate}
        piUpdateResolution={piUpdateResolution}
        piUpdateError={piUpdateError}
        onResolvePiUpdate={(action) => void resolvePiUpdate(action)}
      />
      {planningWarnings.length > 0 && (
        <section className="project-board-proof-scope-panel" aria-label="Proof ownership warning">
          <ProjectBoardProofScopeWarningSummary warnings={planningWarnings} />
        </section>
      )}
      <ProjectBoardMissingProofGate visible={missingRequiredProof} />
      <ProjectBoardClaimControls card={card} gitStatus={gitStatus} busy={claimBusy} onAction={onClaimAction} />
      <ProjectBoardClarificationPanel
        clarificationItems={clarificationItems}
        explicitClarificationDecisions={explicitClarificationDecisions}
        answeredClarifications={answeredClarifications}
        clarificationDrafts={clarificationDrafts}
        ticketized={ticketized}
        decisionImpactBusyQuestion={decisionImpactBusyQuestion}
        decisionImpactPreviewForQuestion={decisionImpactPreviewForQuestion}
        onSetClarificationDraft={setClarificationDraft}
        onAcceptClarificationSuggestion={acceptClarificationSuggestion}
        onSaveClarificationAnswer={saveClarificationAnswer}
        onSaveClarificationAnswerWithFeedback={(question) => void saveClarificationAnswerWithFeedback(question)}
        onRefreshDecisionDrafts={(question) => void refreshDecisionDrafts(question)}
        onRegenerateDecisionDrafts={(question) => void regenerateDecisionDrafts(question)}
      />
      <ProjectBoardSourceBasisPanel sourceBasis={sourceBasis} onInspectSource={onInspectSource} />
      <ProjectBoardCandidateDetailFieldGrid
        cardTitle={card.title}
        draft={draft}
        ticketized={ticketized}
        onFieldChange={setField}
        onCandidateStatusChange={setCandidateStatus}
      />
      <ProjectBoardCandidateDetailFooter
        card={card}
        ticketized={ticketized}
        canSave={canSave}
        canSplit={canSplit}
        canMarkReady={canMarkReady}
        approvalRequested={approvalRequested}
        readyGateTitle={readyGateTitle}
        onApproveReady={() => {
          setApprovalRequested(true);
          onApproveCard(card);
        }}
        onMarkCandidate={(candidateStatus) => onUpdateCardCandidate(card, candidateStatus)}
        onSplitCard={() => onSplitCard(card.id)}
        onSaveDetails={() => onSave(projectBoardCardEditInput(card.id, draft))}
      />
    </section>
  );
}
