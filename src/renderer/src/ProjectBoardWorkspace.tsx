import { useState } from "react";
import { ProjectBoardWorkspaceEmptyPanel, ProjectBoardWorkspaceHeader } from "./ProjectBoardWorkspaceChrome";
import { useProjectBoardWorkspaceGitControls } from "./ProjectBoardWorkspaceGitControls";
import { useProjectBoardWorkspaceNavigationController } from "./ProjectBoardWorkspaceNavigationController";
import { useProjectBoardWorkspaceRunController } from "./ProjectBoardWorkspaceRunController";
import { ProjectBoardWorkspaceBoardSurface } from "./ProjectBoardWorkspaceSurface";
import { useProjectBoardWorkspaceTitleTooltip } from "./ProjectBoardWorkspaceTitleTooltip";
import type { ProjectBoardWorkspaceProps } from "./ProjectBoardWorkspaceTypes";
import "./styles.css";
export { ProjectBoardIntegrationTab } from "./ProjectBoardIntegrationViews";
export {
  ProjectBoardCharterTab,
  ProjectBoardComplexityShadowPanel,
  ProjectBoardOverviewTab,
  ProjectBoardTabs,
} from "./ProjectBoardShellViews";

export {
  ProjectBoardActiveCardDecisionAuditPanel,
  ProjectBoardActiveCardDetail,
  ProjectBoardActiveCardDetailTabs,
  ProjectBoardActiveCardOverviewPanel,
  ProjectBoardActiveCardSourceBasisPanel,
  projectBoardCardTouchedFieldLabel,
  ProjectBoardClaimControls,
  ProjectBoardExecutionControlPanel,
  ProjectBoardLivePiSessionPreview,
  projectBoardProofRecommendedActionLabel,
  projectBoardProofReviewerLabel,
  projectBoardProofReviewStatusLabel,
  ProjectBoardProtectedPiUpdatePanel,
  ProjectBoardRunFeedbackPanel,
  projectBoardRunFeedbackSourceLabel,
  ProjectBoardUiMockReviewPanel,
  type ProjectBoardActiveCardDetailTab,
  type ProjectBoardCardInspectorOptions,
  type ProjectBoardCardInspectorRequest,
} from "./ProjectBoardActiveCardDetailViews";
export { ProjectBoardBoardTab } from "./ProjectBoardBoardViews";
export {
  ProjectBoardCandidateDetail,
  ProjectBoardDecisionImpactSummary,
  ProjectBoardProofScopeWarningSummary,
} from "./ProjectBoardCandidateDetailViews";
export {
  ProjectBoardCollaborationReadinessPanel,
  ProjectBoardGitSyncControls,
  projectBoardProjectionResolutionLabel,
  projectBoardProjectionResolutionTitle,
  projectBoardProjectionReviewActionLabel,
  projectBoardProjectionReviewKindLabel,
  ProjectBoardProjectionReviewPanel,
} from "./ProjectBoardCollaborationViews";
export {
  ProjectBoardDraftBoard,
  ProjectBoardDraftCardView,
  ProjectBoardDraftCreateReadyPreviewPanel,
  ProjectBoardDraftInboxTab,
  ProjectBoardDraftSourcePicker,
  projectBoardKickoffDefaultDraftingStatus,
  ProjectBoardKickoffInterview,
  ProjectBoardPiUpdateReviewPanel,
  projectBoardQuestionSectionLabel,
} from "./ProjectBoardDraftInboxViews";
export {
  ProjectBoardBoardDecisionImpactPanel,
  ProjectBoardExecutionOverviewPanel,
  ProjectBoardExecutionReadinessRailPanel,
  ProjectBoardUnattachedTasks,
  ProjectBoardWorkflowAdvancedEditor,
  ProjectBoardWorkflowImpactPanel,
  ProjectBoardWorkflowPrimer,
  ProjectBoardWorkflowRepairPreview,
  ProjectBoardWorkflowSettingsEditor,
} from "./ProjectBoardExecutionViews";
export {
  projectBoardEventTimeLabel,
  ProjectBoardHistoryCollaborationAuditPanel,
  ProjectBoardHistoryEvent,
  ProjectBoardHistoryImpactAuditPanel,
  projectBoardHistoryRecoveryActionBusy,
  projectBoardHistoryRecoveryActionIcon,
  projectBoardHistoryRecoveryActionLabel,
  ProjectBoardHistoryRecoveryPanel,
  projectBoardHistoryRecoveryRetryMode,
  ProjectBoardHistoryTab,
  projectBoardImpactKindLabel,
  projectBoardProgressiveRecordDetail,
  projectBoardProgressiveRecordObject,
  ProjectBoardProgressiveRecordPreview,
  projectBoardProgressiveRecordText,
  projectBoardProgressiveRecordTitle,
  projectBoardSupersededCardCategoryLabel,
  projectBoardSupersededCardDetail,
  ProjectBoardSupersededCardsPanel,
  projectBoardTabTitle,
} from "./ProjectBoardHistoryViews";
export {
  projectBoardCandidateStatusLabel,
  ProjectBoardCardShell,
  projectBoardCardSourceLabel,
  ProjectBoardCardView,
  ProjectBoardColumn,
  projectBoardColumnEmptyText,
  projectBoardDraftColumnEmptyText,
  projectBoardObjectiveGroundingLabel,
  ProjectBoardObjectiveProvenanceBlock,
  projectBoardPhaseDisplayName,
} from "./ProjectBoardLaneViews";
export {
  ProjectBoardCriticalPath,
  projectBoardDependencyCardForRef,
  ProjectBoardDependencyChangeImpact,
  ProjectBoardDependencyIssues,
  projectBoardDependencyRefLabel,
  ProjectBoardExecutionOrder,
  ProjectBoardMapCard,
  ProjectBoardMapTab,
} from "./ProjectBoardMapViews";
export {
  ProjectBoardProofCard,
  ProjectBoardProofCoverageRecheckPanel,
  projectBoardProofDriftCardLabel,
  ProjectBoardProofFollowUpImpactPanel,
  projectBoardProofKindLabel,
  ProjectBoardProofReviewQueue,
  ProjectBoardProofReviewQueueItem,
  ProjectBoardProofStat,
  ProjectBoardProofTab,
  type ProjectBoardProofReviewQueueItemModel,
} from "./ProjectBoardProofViews";
export {
  ProjectBoardCharterPolicy,
  ProjectBoardCharterPreview,
  projectBoardPolicyText,
  projectBoardSourceChangeStateLabel,
  ProjectBoardSourceDetail,
  ProjectBoardSourceImpactPreviewPanel,
  ProjectBoardSourceItem,
  projectBoardSourceKindOptions,
  ProjectBoardSourceReview,
} from "./ProjectBoardSourceViews";
export {
  ProjectBoardDecisionQueuePanel,
  ProjectBoardExecutionPmReviewPanel,
  projectBoardKickoffDefaultsRunMetric,
  projectBoardKickoffDefaultsRunTargetCount,
  projectBoardLatestVisibleSynthesisRun,
  projectBoardPmReviewReadinessLabel,
  ProjectBoardPmReviewReport,
  ProjectBoardPromptBudgetAudit,
  ProjectBoardProposalCard,
  projectBoardProposalCardReviewLabel,
  projectBoardProposalReviewCounts,
  projectBoardProposalStatusLabel,
  projectBoardRenderedCardLedgerSummary,
  ProjectBoardSynthesisActivity,
  projectBoardSynthesisActivityEvents,
  ProjectBoardSynthesisProposalTab,
  ProjectBoardSynthesisRunLedger,
  projectBoardSynthesisRunPercent,
  projectBoardSynthesisRunStageLabel,
  projectBoardSynthesisRunStatusLabel,
  projectBoardSynthesisSectionMetric,
  ProjectBoardSynthesisSectionStatusList,
} from "./ProjectBoardSynthesisViews";
export {
  projectBoardTitleTooltipAnchor,
  projectBoardTitleTooltipTrigger,
  sameProjectBoardTitleTooltipAnchor,
} from "./ProjectBoardWorkspaceTitleTooltip";
export type { ProjectBoardTitleTooltip } from "./ProjectBoardWorkspaceTitleTooltip";

export function ProjectBoardWorkspace({
  project,
  busy,
  sourceBusy,
  sourceImpactBusy,
  kickoffDefaultsBusy,
  refineBusy,
  refineMode,
  proposalAnswerBusy,
  proposalCardReviewBusy,
  proposalApplyBusy,
  finalizeBusy,
  synthesisRetryBusy,
  synthesisDeferBusy,
  synthesisPauseBusy,
  revisionBusy,
  orchestrationRevision,
  runActivityLinesByThread,
  threadRunStatuses,
  onBuild,
  onReviseBoard,
  onCancelRevision,
  onResetBoard,
  onApproveCard,
  onResolveProofDecision,
  onRerunProof,
  onResolveDeliverableIntegration,
  onRecomputeProofCoverage,
  onSuggestProof,
  onResolveSplitDecision,
  onCreateReadyTasks,
  onSplitCard,
  onCreateCard,
  onAttachLocalTask,
  onUpdateCard,
  onUpdateCardCandidate,
  onResolveCardPiUpdate,
  onAddRunFeedback,
  onCopySessionToThread,
  onSuggestClarificationDefaults,
  onSuggestKickoffDefaults,
  onApplyDecisionImpactFeedback,
  onRefreshDecisionDrafts,
  onRegenerateDecisionDrafts,
  onRefreshSourceDrafts,
  onRegenerateSourceDrafts,
  onApplySourceImpactFeedback,
  onRefreshSources,
  onRefineWithPi,
  onRefineProposal,
  onElaborateSources,
  onAnswerProposalQuestion,
  onReviewProposalCard,
  onApplyProposal,
  onUpdateSource,
  onAnswerQuestion,
  onFinalizeKickoff,
  onPauseSynthesis,
  onRetrySynthesis,
  onDeferSynthesisSections,
  onOpenRunThread,
  onClose,
}: ProjectBoardWorkspaceProps) {
  const board = project.board;
  const [projectBoardCreateCardBusy, setProjectBoardCreateCardBusy] = useState(false);
  const {
    projectBoardWorkspaceRef,
    handleProjectBoardTooltipMouseOver,
    handleProjectBoardTooltipMouseOut,
    handleProjectBoardTooltipFocus,
    handleProjectBoardTooltipBlur,
    hideProjectBoardTitleTooltip,
    titleTooltipNode,
  } = useProjectBoardWorkspaceTitleTooltip();
  const projectBoardNavigationController = useProjectBoardWorkspaceNavigationController({ board, finalizeBusy });
  const { revealProjectBoardDraftCard } = projectBoardNavigationController;
  const projectBoardRunController = useProjectBoardWorkspaceRunController({
    board,
    orchestrationRevision,
    onAddRunFeedback,
    onAttachLocalTask,
    onCopySessionToThread,
    onCreateReadyTasks,
    onOpenRunThread,
    onRecomputeProofCoverage,
    onRerunProof,
    onResolveDeliverableIntegration,
    onResolveProofDecision,
    onResolveSplitDecision,
    onSuggestProof,
  });
  const { applyProjectBoardOrchestration, setProjectBoardOrchestrationError } = projectBoardRunController;
  const projectBoardGitControls = useProjectBoardWorkspaceGitControls({
    applyProjectBoardOrchestration,
    board,
    setProjectBoardOrchestrationError,
  });

  async function createProjectBoardDraftCard(boardId: string) {
    setProjectBoardCreateCardBusy(true);
    setProjectBoardOrchestrationError(undefined);
    try {
      const previousCardIds = new Set(board?.cards.map((card) => card.id) ?? []);
      const next = await onCreateCard(boardId);
      const nextBoard = next?.projects.find((candidate) => candidate.path === project.path)?.board;
      const created = nextBoard?.cards.find((card) => !previousCardIds.has(card.id) && card.sourceKind === "manual");
      if (created) {
        revealProjectBoardDraftCard(created.id);
      }
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBoardCreateCardBusy(false);
    }
  }

  return (
    <section
      ref={projectBoardWorkspaceRef}
      className="project-board-workspace"
      aria-label="Project Kanban board"
      onMouseOver={handleProjectBoardTooltipMouseOver}
      onMouseOut={handleProjectBoardTooltipMouseOut}
      onFocusCapture={handleProjectBoardTooltipFocus}
      onBlurCapture={handleProjectBoardTooltipBlur}
      onClickCapture={hideProjectBoardTitleTooltip}
    >
      <ProjectBoardWorkspaceHeader
        project={project}
        board={board}
        busy={busy}
        sourceBusy={sourceBusy}
        sourceImpactBusy={sourceImpactBusy}
        kickoffDefaultsBusy={kickoffDefaultsBusy}
        refineBusy={refineBusy}
        finalizeBusy={finalizeBusy}
        synthesisRetryBusy={synthesisRetryBusy}
        synthesisDeferBusy={synthesisDeferBusy}
        synthesisPauseBusy={synthesisPauseBusy}
        revisionBusy={revisionBusy}
        proposalApplyBusy={proposalApplyBusy}
        gitControls={board ? projectBoardGitControls : undefined}
        onBuild={onBuild}
        onReviseBoard={onReviseBoard}
        onRefreshSources={onRefreshSources}
        onResetBoard={onResetBoard}
        onClose={onClose}
      />

      {board ? (
        <ProjectBoardWorkspaceBoardSurface
          board={board}
          gitControls={projectBoardGitControls}
          navigationController={projectBoardNavigationController}
          runController={projectBoardRunController}
          projectBoardCreateCardBusy={projectBoardCreateCardBusy}
          onCreateCard={(boardId) => void createProjectBoardDraftCard(boardId)}
          sourceBusy={sourceBusy}
          sourceImpactBusy={sourceImpactBusy}
          kickoffDefaultsBusy={kickoffDefaultsBusy}
          refineBusy={refineBusy}
          refineMode={refineMode}
          proposalAnswerBusy={proposalAnswerBusy}
          proposalCardReviewBusy={proposalCardReviewBusy}
          proposalApplyBusy={proposalApplyBusy}
          finalizeBusy={finalizeBusy}
          synthesisRetryBusy={synthesisRetryBusy}
          synthesisDeferBusy={synthesisDeferBusy}
          synthesisPauseBusy={synthesisPauseBusy}
          runActivityLinesByThread={runActivityLinesByThread}
          threadRunStatuses={threadRunStatuses}
          onApproveCard={onApproveCard}
          onSplitCard={onSplitCard}
          onUpdateCard={onUpdateCard}
          onUpdateCardCandidate={onUpdateCardCandidate}
          onResolveCardPiUpdate={onResolveCardPiUpdate}
          onSuggestClarificationDefaults={onSuggestClarificationDefaults}
          onSuggestKickoffDefaults={onSuggestKickoffDefaults}
          onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
          onRefreshDecisionDrafts={onRefreshDecisionDrafts}
          onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
          onRefreshSourceDrafts={onRefreshSourceDrafts}
          onRegenerateSourceDrafts={onRegenerateSourceDrafts}
          onApplySourceImpactFeedback={onApplySourceImpactFeedback}
          onRefreshSources={onRefreshSources}
          onRefineWithPi={onRefineWithPi}
          onRefineProposal={onRefineProposal}
          onElaborateSources={onElaborateSources}
          onAnswerProposalQuestion={onAnswerProposalQuestion}
          onReviewProposalCard={onReviewProposalCard}
          onApplyProposal={onApplyProposal}
          onUpdateSource={onUpdateSource}
          onAnswerQuestion={onAnswerQuestion}
          onFinalizeKickoff={onFinalizeKickoff}
          onCancelRevision={onCancelRevision}
          onRetrySynthesis={onRetrySynthesis}
          onPauseSynthesis={onPauseSynthesis}
          onDeferSynthesisSections={onDeferSynthesisSections}
        />
      ) : (
        <ProjectBoardWorkspaceEmptyPanel busy={busy} onBuild={onBuild} />
      )}
      {titleTooltipNode}
    </section>
  );
}
