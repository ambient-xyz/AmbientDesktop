import type { AppProjectBoardActions } from "./AppProjectBoardActions";
import type { useAppProjectBoardControlsForApp } from "./AppProjectBoardControls";
import type { useAppProjectShellState } from "./AppProjectShellState";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { ProjectBoardWorkspaceProps } from "./ProjectBoardWorkspaceTypes";

type ProjectBoardWorkspaceActionKey =
  | "onBuild"
  | "onReviseBoard"
  | "onCancelRevision"
  | "onResetBoard"
  | "onApproveCard"
  | "onResolveProofDecision"
  | "onRerunProof"
  | "onResolveDeliverableIntegration"
  | "onRecomputeProofCoverage"
  | "onSuggestProof"
  | "onResolveSplitDecision"
  | "onCreateReadyTasks"
  | "onSplitCard"
  | "onCreateCard"
  | "onAttachLocalTask"
  | "onUpdateCard"
  | "onUpdateCardCandidate"
  | "onResolveCardPiUpdate"
  | "onAddRunFeedback"
  | "onCopySessionToThread"
  | "onSuggestClarificationDefaults"
  | "onSuggestKickoffDefaults"
  | "onApplyDecisionImpactFeedback"
  | "onRefreshDecisionDrafts"
  | "onRegenerateDecisionDrafts"
  | "onRefreshSourceDrafts"
  | "onRegenerateSourceDrafts"
  | "onApplySourceImpactFeedback"
  | "onRefreshSources"
  | "onRefineWithPi"
  | "onRefineProposal"
  | "onElaborateSources"
  | "onAnswerProposalQuestion"
  | "onReviewProposalCard"
  | "onApplyProposal"
  | "onUpdateSource"
  | "onAnswerQuestion"
  | "onFinalizeKickoff"
  | "onPauseSynthesis"
  | "onRetrySynthesis"
  | "onDeferSynthesisSections"
  | "onOpenRunThread"
  | "onClose";

type ProjectBoardWorkspaceStateProps = Omit<ProjectBoardWorkspaceProps, "project" | ProjectBoardWorkspaceActionKey>;

export type AppProjectBoardWorkspacePropsInput = ProjectBoardWorkspaceStateProps & {
  actions: AppProjectBoardActions;
  activeProject?: ProjectBoardWorkspaceProps["project"];
  activeThreadSuppressesProjectBoard: boolean;
  onClose: () => void;
  projectBoardOpen: boolean;
};

type AppProjectBoardControlsForWorkspaceProps = Pick<
  ReturnType<typeof useAppProjectBoardControlsForApp>,
  | "activeProject"
  | "activeProjectBoardBusy"
  | "activeThreadSuppressesProjectBoard"
  | "projectBoardActions"
  | "projectBoardOpen"
  | "setProjectBoardOpen"
>;

type AppProjectShellStateForWorkspaceProps = Pick<
  ReturnType<typeof useAppProjectShellState>,
  | "projectBoardSourceBusy"
  | "projectBoardSourceImpactBusy"
  | "projectBoardKickoffDefaultsBusy"
  | "projectBoardRefineBusy"
  | "projectBoardRefineMode"
  | "projectBoardProposalAnswerBusy"
  | "projectBoardProposalCardReviewBusy"
  | "projectBoardProposalApplyBusy"
  | "projectBoardFinalizeBusy"
  | "projectBoardSynthesisRetryBusy"
  | "projectBoardSynthesisDeferBusy"
  | "projectBoardSynthesisPauseBusy"
  | "projectBoardRevisionBusy"
>;

type AppRunActivityStateForWorkspaceProps = Pick<
  ReturnType<typeof useAppRunActivityState>,
  "runActivityLinesByThread" | "threadRunStatuses"
>;

type AppWorkflowRuntimeStateForWorkspaceProps = Pick<
  ReturnType<typeof useAppWorkflowRuntimeState>,
  "orchestrationRevision"
>;

export type AppProjectBoardWorkspacePropsForAppInput = {
  projectBoardControls: AppProjectBoardControlsForWorkspaceProps;
  projectShellState: AppProjectShellStateForWorkspaceProps;
  runActivityState: AppRunActivityStateForWorkspaceProps;
  workflowRuntimeState: AppWorkflowRuntimeStateForWorkspaceProps;
};

export function createAppProjectBoardWorkspaceProps({
  actions,
  activeProject,
  activeThreadSuppressesProjectBoard,
  onClose,
  projectBoardOpen,
  ...stateProps
}: AppProjectBoardWorkspacePropsInput): ProjectBoardWorkspaceProps | undefined {
  if (!projectBoardOpen || !activeProject || activeThreadSuppressesProjectBoard) return undefined;

  return {
    project: activeProject,
    ...stateProps,
    onBuild: () => {
      void actions.buildProjectBoard(activeProject);
    },
    onReviseBoard: (boardId) => {
      void actions.reviseProjectBoard(boardId);
    },
    onCancelRevision: (boardId) => {
      void actions.cancelProjectBoardRevision(boardId);
    },
    onResetBoard: () => actions.requestProjectBoardReset(activeProject),
    onApproveCard: (card) => {
      void actions.approveProjectBoardCard(card);
    },
    onResolveProofDecision: (cardId, action, reason) => {
      void actions.resolveProjectBoardProofDecision(cardId, action, reason);
    },
    onRerunProof: (input) => actions.rerunProjectBoardProof(input),
    onResolveDeliverableIntegration: (input) => actions.resolveProjectBoardDeliverableIntegration(input),
    onRecomputeProofCoverage: (boardId) => actions.recomputeProjectBoardProofCoverage({ boardId }),
    onSuggestProof: (input) => actions.suggestProjectBoardProof(input),
    onResolveSplitDecision: (cardId, action) => {
      void actions.resolveProjectBoardSplitDecision(cardId, action);
    },
    onCreateReadyTasks: (boardId) => {
      void actions.createReadyProjectBoardTasks({ boardId });
    },
    onSplitCard: (cardId) => {
      void actions.splitProjectBoardCard({ cardId });
    },
    onCreateCard: (boardId) => actions.createProjectBoardCard(boardId),
    onAttachLocalTask: (taskId, mode) => actions.attachProjectBoardLocalTask(taskId, mode),
    onUpdateCard: (input) => {
      void actions.updateProjectBoardCard(input);
    },
    onUpdateCardCandidate: (card, candidateStatus) => {
      void actions.updateProjectBoardCardCandidate(card, candidateStatus);
    },
    onResolveCardPiUpdate: (input) => {
      void actions.resolveProjectBoardCardPiUpdate(input);
    },
    onAddRunFeedback: (input) => actions.addProjectBoardCardRunFeedback(input),
    onCopySessionToThread: (input) => actions.copyProjectBoardSessionToThread(input),
    onSuggestClarificationDefaults: (input) => actions.suggestProjectBoardClarificationDefaults(input),
    onSuggestKickoffDefaults: (input) => actions.suggestProjectBoardKickoffDefaults(input),
    onApplyDecisionImpactFeedback: (input) => actions.applyProjectBoardDecisionImpactFeedback(input),
    onRefreshDecisionDrafts: (input) => actions.refreshProjectBoardDecisionDrafts(input),
    onRegenerateDecisionDrafts: (input) => actions.regenerateProjectBoardDecisionDrafts(input),
    onRefreshSourceDrafts: (input) => actions.refreshProjectBoardSourceDrafts(input),
    onRegenerateSourceDrafts: (input) => actions.regenerateProjectBoardSourceDrafts(input),
    onApplySourceImpactFeedback: (input) => actions.applyProjectBoardSourceImpactFeedback(input),
    onRefreshSources: (boardId) => {
      void actions.refreshProjectBoardSources(boardId);
    },
    onRefineWithPi: (boardId) => {
      void actions.refineProjectBoardWithPi(boardId, undefined, { mode: "charter_review" });
    },
    onRefineProposal: (boardId, proposalId, mode = "charter_review") => {
      void actions.refineProjectBoardWithPi(boardId, proposalId, { mode });
    },
    onElaborateSources: (boardId, sourceIds, objective) => {
      void actions.refineProjectBoardWithPi(boardId, undefined, {
        mode: "source_elaboration",
        sourceIds,
        objective,
      });
    },
    onAnswerProposalQuestion: (proposalId, questionIndex, answer) => {
      void actions.answerProjectBoardSynthesisProposalQuestion(proposalId, questionIndex, answer);
    },
    onReviewProposalCard: (proposalId, sourceId, reviewStatus, reason, mergeTargetCardId) => {
      void actions.reviewProjectBoardSynthesisProposalCard(proposalId, sourceId, reviewStatus, reason, mergeTargetCardId);
    },
    onApplyProposal: (proposalId) => {
      void actions.applyProjectBoardSynthesisProposal(proposalId);
    },
    onUpdateSource: (input) => {
      void actions.updateProjectBoardSource(input);
    },
    onAnswerQuestion: (question, answer) => {
      void actions.answerProjectBoardQuestion(question, answer);
    },
    onFinalizeKickoff: (boardId) => {
      void actions.finalizeProjectBoardKickoff(boardId);
    },
    onPauseSynthesis: (boardId, runId) => {
      void actions.pauseProjectBoardSynthesis(boardId, runId);
    },
    onRetrySynthesis: (boardId, retryOfRunId, mode) => {
      void actions.retryProjectBoardSynthesis({ boardId, retryOfRunId, mode });
    },
    onDeferSynthesisSections: (boardId, runId) => {
      void actions.deferProjectBoardSynthesisSections({ boardId, runId });
    },
    onOpenRunThread: actions.openProjectBoardRunThread,
    onClose,
  };
}

export function createAppProjectBoardWorkspacePropsForApp({
  projectBoardControls,
  projectShellState,
  runActivityState,
  workflowRuntimeState,
}: AppProjectBoardWorkspacePropsForAppInput): ProjectBoardWorkspaceProps | undefined {
  return createAppProjectBoardWorkspaceProps({
    actions: projectBoardControls.projectBoardActions,
    activeProject: projectBoardControls.activeProject,
    activeThreadSuppressesProjectBoard: projectBoardControls.activeThreadSuppressesProjectBoard,
    busy: projectBoardControls.activeProjectBoardBusy,
    sourceBusy: projectShellState.projectBoardSourceBusy,
    sourceImpactBusy: projectShellState.projectBoardSourceImpactBusy,
    kickoffDefaultsBusy: projectShellState.projectBoardKickoffDefaultsBusy,
    refineBusy: projectShellState.projectBoardRefineBusy,
    refineMode: projectShellState.projectBoardRefineMode,
    proposalAnswerBusy: projectShellState.projectBoardProposalAnswerBusy,
    proposalCardReviewBusy: projectShellState.projectBoardProposalCardReviewBusy,
    proposalApplyBusy: projectShellState.projectBoardProposalApplyBusy,
    finalizeBusy: projectShellState.projectBoardFinalizeBusy,
    synthesisRetryBusy: projectShellState.projectBoardSynthesisRetryBusy,
    synthesisDeferBusy: projectShellState.projectBoardSynthesisDeferBusy,
    synthesisPauseBusy: projectShellState.projectBoardSynthesisPauseBusy,
    revisionBusy: projectShellState.projectBoardRevisionBusy,
    orchestrationRevision: workflowRuntimeState.orchestrationRevision,
    projectBoardOpen: projectBoardControls.projectBoardOpen,
    runActivityLinesByThread: runActivityState.runActivityLinesByThread,
    threadRunStatuses: runActivityState.threadRunStatuses,
    onClose: () => projectBoardControls.setProjectBoardOpen(false),
  });
}
