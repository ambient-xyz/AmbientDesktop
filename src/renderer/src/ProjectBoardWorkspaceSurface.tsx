import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { ProjectBoardBoardTab } from "./ProjectBoardBoardViews";
import {
  ProjectBoardCollaborationReadinessPanel,
  ProjectBoardProjectionReviewPanel,
} from "./ProjectBoardCollaborationViews";
import { ProjectBoardDraftInboxTab } from "./ProjectBoardDraftInboxViews";
import { projectBoardDraftColumns } from "./projectBoardDraftInboxUiModel";
import { ProjectBoardExecutionReadinessRailPanel } from "./ProjectBoardExecutionViews";
import { ProjectBoardHistoryTab } from "./ProjectBoardHistoryViews";
import { ProjectBoardIntegrationTab } from "./ProjectBoardIntegrationViews";
import { ProjectBoardMapTab } from "./ProjectBoardMapViews";
import { ProjectBoardProofTab } from "./ProjectBoardProofViews";
import {
  ProjectBoardCharterTab,
  ProjectBoardComplexityShadowPanel,
  ProjectBoardOverviewTab,
  ProjectBoardTabs,
} from "./ProjectBoardShellViews";
import {
  ProjectBoardSynthesisActivity,
  ProjectBoardSynthesisProposalTab,
  projectBoardLatestVisibleSynthesisRun,
} from "./ProjectBoardSynthesisViews";
import type {
  ProjectBoardWorkspaceGitControls,
} from "./ProjectBoardWorkspaceGitControls";
import type { ProjectBoardWorkspaceNavigationController } from "./ProjectBoardWorkspaceNavigationController";
import type { ProjectBoardWorkspaceProps } from "./ProjectBoardWorkspace";
import type { ProjectBoardWorkspaceRunController } from "./ProjectBoardWorkspaceRunController";
import {
  projectBoardColumns,
  projectBoardComplexityEstimate,
  projectBoardExecutionReadinessRail,
  projectBoardTabs,
} from "./projectBoardUiModel";

type ProjectBoardWorkspaceBoardSurfaceActionProps = Pick<
  ProjectBoardWorkspaceProps,
  | "sourceBusy"
  | "sourceImpactBusy"
  | "kickoffDefaultsBusy"
  | "refineBusy"
  | "refineMode"
  | "proposalAnswerBusy"
  | "proposalCardReviewBusy"
  | "proposalApplyBusy"
  | "finalizeBusy"
  | "synthesisRetryBusy"
  | "synthesisDeferBusy"
  | "synthesisPauseBusy"
  | "runActivityLinesByThread"
  | "threadRunStatuses"
  | "onApproveCard"
  | "onSplitCard"
  | "onUpdateCard"
  | "onUpdateCardCandidate"
  | "onResolveCardPiUpdate"
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
  | "onCancelRevision"
  | "onRetrySynthesis"
  | "onPauseSynthesis"
  | "onDeferSynthesisSections"
>;

export type ProjectBoardWorkspaceBoardSurfaceProps = ProjectBoardWorkspaceBoardSurfaceActionProps & {
  board: ProjectBoardSummary;
  gitControls: ProjectBoardWorkspaceGitControls;
  navigationController: ProjectBoardWorkspaceNavigationController;
  runController: ProjectBoardWorkspaceRunController;
  projectBoardCreateCardBusy: boolean;
  onCreateCard: (boardId: string) => void;
};

export function ProjectBoardWorkspaceBoardSurface({
  board,
  gitControls,
  navigationController,
  runController,
  projectBoardCreateCardBusy,
  onCreateCard,
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
  runActivityLinesByThread,
  threadRunStatuses,
  onApproveCard,
  onSplitCard,
  onUpdateCard,
  onUpdateCardCandidate,
  onResolveCardPiUpdate,
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
  onCancelRevision,
  onRetrySynthesis,
  onPauseSynthesis,
  onDeferSynthesisSections,
}: ProjectBoardWorkspaceBoardSurfaceProps) {
  const {
    activeCardInspectorRequest,
    activeTab,
    closeProjectBoardSourcePicker,
    draftInspectorMode,
    jumpProjectBoardToBlocker,
    openProjectBoardCardInspector,
    openProjectBoardInboxDetail,
    openProjectBoardSourcePicker,
    openProjectBoardSourceReview,
    selectProjectBoardActiveCard,
    selectProjectBoardDraftCard,
    selectedActiveCard,
    selectedActiveCardId,
    selectedDraftCard,
    selectedDraftCardId,
    setActiveTab,
    sourceReviewRequest,
  } = navigationController;
  const {
    addProjectBoardRunFeedback,
    attachProjectBoardTask,
    cancelProjectBoardRun,
    copyProjectBoardRunSession,
    createProjectBoardReadyTasks,
    openProjectBoardRunThread,
    prepareProjectBoardRuns,
    projectBoardCreateReadyTasksBusy,
    projectBoardDeliverableBusy,
    projectBoardOrchestration,
    projectBoardOrchestrationError,
    projectBoardRunBusy,
    projectBoardTaskImportBusy,
    recomputeProjectBoardProofCoverage,
    repairProjectBoardWorkflow,
    resolveProjectBoardDeliverableIntegration,
    resolveProjectBoardProofDecision,
    resolveProjectBoardSplitDecision,
    resolveProjectBoardWorkflowImpact,
    revealProjectBoardWorkspace,
    rerunProjectBoardProof,
    startProjectBoardRun,
    suggestProjectBoardProof,
    updateProjectBoardWorkflowRaw,
    updateProjectBoardWorkflowSettings,
  } = runController;
  const {
    projectBoardClaimBusy,
    projectBoardGitError,
    projectBoardGitStatus,
    projectBoardProjectionResolutions,
    setProjectBoardProjectionResolutions,
    updateProjectBoardGitClaim,
  } = gitControls;

  const columns = projectBoardColumns(board.cards, projectBoardOrchestration);
  const draftColumns = projectBoardDraftColumns(board.cards, { board });
  const tabs = projectBoardTabs(board, projectBoardOrchestration);
  const latestSynthesisRun = projectBoardLatestVisibleSynthesisRun(board.synthesisRuns);
  const complexityEstimate = projectBoardComplexityEstimate(board);
  const isRevisionDraft = board.status === "draft" && (board.charter?.version ?? 1) > 1;
  const latestSynthesisRunIsKickoffDefaults = latestSynthesisRun?.stage === "kickoff_defaults";
  const runningSynthesisRun =
    latestSynthesisRun?.status === "running" || latestSynthesisRun?.status === "pause_requested" ? latestSynthesisRun : undefined;
  const pausableSynthesisRun = latestSynthesisRun?.status === "running" ? latestSynthesisRun : undefined;
  const pausedSynthesisRun = latestSynthesisRun?.status === "paused" ? latestSynthesisRun : undefined;
  const failedSynthesisRun = latestSynthesisRun?.status === "failed" && latestSynthesisRun.stage !== "kickoff_defaults" ? latestSynthesisRun : undefined;
  const showSynthesisActivity = Boolean(latestSynthesisRun);
  const synthesisActivityAction = projectBoardWorkspaceSynthesisActivityAction({
    failedSynthesisRun: Boolean(failedSynthesisRun),
    finalizeBusy,
    latestSynthesisRunIsKickoffDefaults,
    latestSynthesisRunStatus: latestSynthesisRun?.status,
    refineBusy,
    refineMode,
    runningSynthesisRun: Boolean(runningSynthesisRun),
    synthesisRetryBusy,
  });
  const projectBoardReadinessRail = projectBoardExecutionReadinessRail(board, projectBoardOrchestration?.tasks ?? [], projectBoardOrchestration?.runs ?? [], {
    runBusy: projectBoardRunBusy,
    orchestrationError: projectBoardOrchestrationError,
    workflowReadiness: projectBoardOrchestration?.workflowReadiness,
    gitStatus: projectBoardGitStatus,
    gitError: projectBoardGitError,
  });
  const showProjectBoardReadinessRail = Boolean(projectBoardReadinessRail.visible);

  return (
    <>
      <ProjectBoardComplexityShadowPanel estimate={complexityEstimate} />
      {isRevisionDraft && (
        <section className="project-board-revision-banner" aria-label="Project board revision status">
          <div>
            <span className="project-board-kicker">Revision draft active</span>
            <p>Review the prefilled charter answers below. Applying the revision will run live Ambient/Pi synthesis and replace unticketized draft candidates; canceling restores the previous active charter.</p>
          </div>
          <span className="project-board-status warning">Needs apply or cancel</span>
        </section>
      )}
      <ProjectBoardCollaborationReadinessPanel status={projectBoardGitStatus} error={projectBoardGitError} />
      <ProjectBoardProjectionReviewPanel
        status={projectBoardGitStatus}
        error={projectBoardGitError}
        resolutions={projectBoardProjectionResolutions}
        onResolve={(changeId, resolution) =>
          setProjectBoardProjectionResolutions((current) => ({
            ...current,
            [changeId]: current[changeId] === resolution ? undefined : resolution,
          }))
        }
      />
      {showProjectBoardReadinessRail && (
        <ProjectBoardExecutionReadinessRailPanel
          rail={projectBoardReadinessRail}
          onSelectCard={openProjectBoardCardInspector}
          onSelectTab={setActiveTab}
          onOpenSourcePicker={openProjectBoardSourcePicker}
          onPrepareRuns={() => void prepareProjectBoardRuns()}
          onStartRun={(runId) => void startProjectBoardRun(runId)}
          runBusy={projectBoardRunBusy}
        />
      )}
      <ProjectBoardTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />
      {showSynthesisActivity && (
        <ProjectBoardSynthesisActivity
          run={latestSynthesisRun}
          action={synthesisActivityAction}
          retryBusy={synthesisRetryBusy}
          pauseBusy={synthesisPauseBusy}
          onRetry={!latestSynthesisRunIsKickoffDefaults && failedSynthesisRun ? () => onRetrySynthesis(board.id, failedSynthesisRun.id) : undefined}
          onRetryStalledRun={
            !latestSynthesisRunIsKickoffDefaults && runningSynthesisRun ? () => onRetrySynthesis(board.id, runningSynthesisRun.id, "stalled_run") : undefined
          }
          onPause={!latestSynthesisRunIsKickoffDefaults && pausableSynthesisRun ? () => onPauseSynthesis(board.id, pausableSynthesisRun.id) : undefined}
          onResumePausedRun={
            !latestSynthesisRunIsKickoffDefaults && pausedSynthesisRun ? () => onRetrySynthesis(board.id, pausedSynthesisRun.id, "paused_run") : undefined
          }
        />
      )}
      {activeTab === "overview" && (
        <ProjectBoardOverviewTab
          board={board}
          orchestrationBoard={projectBoardOrchestration}
          gitStatus={projectBoardGitStatus}
          gitError={projectBoardGitError}
          onSelectTab={setActiveTab}
          onSelectCard={openProjectBoardCardInspector}
        />
      )}
      {activeTab === "board" && (
        <ProjectBoardBoardTab
          board={board}
          columns={columns}
          boardStatus={board.status}
          latestSynthesisRun={latestSynthesisRun}
          synthesisRetryBusy={synthesisRetryBusy}
          orchestrationBoard={projectBoardOrchestration}
          orchestrationError={projectBoardOrchestrationError}
          runActivityLinesByThread={runActivityLinesByThread}
          threadRunStatuses={threadRunStatuses}
          selectedCard={selectedActiveCard}
          selectedCardId={selectedActiveCardId}
          onSelectCard={selectProjectBoardActiveCard}
          onSelectTab={setActiveTab}
          onOpenSourcePicker={openProjectBoardSourcePicker}
          onJumpToBlocker={jumpProjectBoardToBlocker}
          onJumpToInbox={openProjectBoardInboxDetail}
          runBusy={projectBoardRunBusy}
          onPrepareRuns={() => void prepareProjectBoardRuns()}
          onResolveWorkflowImpact={(action, runIds) => void resolveProjectBoardWorkflowImpact(action, runIds)}
          onRepairWorkflow={(action) => void repairProjectBoardWorkflow(action)}
          onUpdateWorkflowSettings={(input) => void updateProjectBoardWorkflowSettings(input)}
          onUpdateWorkflowRaw={(input) => void updateProjectBoardWorkflowRaw(input)}
          onStartRun={(runId) => void startProjectBoardRun(runId)}
          onCancelRun={(runId) => void cancelProjectBoardRun(runId)}
          onRevealWorkspace={(workspacePath) => void revealProjectBoardWorkspace(workspacePath)}
          onOpenRunThread={(threadId, workspacePath) => void openProjectBoardRunThread(threadId, workspacePath)}
          onCopySessionToThread={(input) => void copyProjectBoardRunSession(input)}
          onResolveProofDecision={(cardId, action, reason) => void resolveProjectBoardProofDecision(cardId, action, reason)}
          onResolveSplitDecision={(cardId, action) => void resolveProjectBoardSplitDecision(cardId, action)}
          onAddRunFeedback={(input) => void addProjectBoardRunFeedback(input)}
          onRetrySynthesis={(retryOfRunId, mode) => onRetrySynthesis(board.id, retryOfRunId, mode)}
          synthesisDeferBusy={synthesisDeferBusy}
          onDeferSynthesisSections={(runId) => onDeferSynthesisSections(board.id, runId)}
          taskImportBusy={projectBoardTaskImportBusy}
          onAttachLocalTask={(taskId, mode) => void attachProjectBoardTask(taskId, mode)}
          gitStatus={projectBoardGitStatus}
          gitError={projectBoardGitError}
          claimBusy={projectBoardClaimBusy}
          onClaimAction={(card, action) => void updateProjectBoardGitClaim(card, action)}
          inspectorRequest={activeCardInspectorRequest}
        />
      )}
      {activeTab === "map" && <ProjectBoardMapTab board={board} onUpdateCard={onUpdateCard} onInspectCard={openProjectBoardCardInspector} />}
      {activeTab === "proof" && (
        <ProjectBoardProofTab
          board={board}
          orchestrationBoard={projectBoardOrchestration}
          runBusy={projectBoardRunBusy}
          onSelectCard={openProjectBoardCardInspector}
          onResolveProofDecision={(cardId, action, reason) => void resolveProjectBoardProofDecision(cardId, action, reason)}
          onRerunProof={(input) => void rerunProjectBoardProof(input)}
          onRecomputeProofCoverage={(boardId) => void recomputeProjectBoardProofCoverage(boardId)}
          onSuggestProof={(boardId, cardIds) => void suggestProjectBoardProof(boardId, cardIds)}
        />
      )}
      {activeTab === "integration" && (
        <ProjectBoardIntegrationTab
          board={board}
          orchestrationBoard={projectBoardOrchestration}
          busy={projectBoardDeliverableBusy}
          onResolve={(input) => void resolveProjectBoardDeliverableIntegration(input)}
        />
      )}
      {activeTab === "charter" && (
        <ProjectBoardCharterTab
          board={board}
          finalizeBusy={finalizeBusy}
          sourceBusy={sourceBusy}
          sourceImpactBusy={sourceImpactBusy}
          kickoffDefaultsBusy={kickoffDefaultsBusy}
          refineBusy={refineBusy}
          onAnswerQuestion={onAnswerQuestion}
          onFinalizeKickoff={onFinalizeKickoff}
          onCancelRevision={onCancelRevision}
          onRefreshSources={onRefreshSources}
          onSuggestKickoffDefaults={onSuggestKickoffDefaults}
          onRefreshSourceDrafts={onRefreshSourceDrafts}
          onRegenerateSourceDrafts={onRegenerateSourceDrafts}
          onApplySourceImpactFeedback={onApplySourceImpactFeedback}
          onRefineWithPi={onRefineWithPi}
          onElaborateSources={onElaborateSources}
          onUpdateSource={onUpdateSource}
          sourcePickerRequestId={sourceReviewRequest.requestId}
          sourceFocusSourceId={sourceReviewRequest.sourceId}
          onOpenSourceReview={openProjectBoardSourceReview}
          onInspectCard={openProjectBoardCardInspector}
        />
      )}
      {activeTab === "decisions" && (
        <ProjectBoardSynthesisProposalTab
          board={board}
          refineBusy={refineBusy}
          answerBusy={proposalAnswerBusy}
          cardReviewBusy={proposalCardReviewBusy}
          applyBusy={proposalApplyBusy}
          onRefineProposal={onRefineProposal}
          onAnswerQuestion={onAnswerProposalQuestion}
          onReviewCard={onReviewProposalCard}
          onApplyProposal={onApplyProposal}
          retryBusy={synthesisRetryBusy}
          deferBusy={synthesisDeferBusy}
          onRetrySynthesis={(runId, mode = "failed_sections") => onRetrySynthesis(board.id, runId, mode)}
          onDeferSynthesisSections={(runId) => onDeferSynthesisSections(board.id, runId)}
          onSelectCard={openProjectBoardCardInspector}
          onUpdateCard={onUpdateCard}
          onSuggestClarificationDefaults={onSuggestClarificationDefaults}
          onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
          onRefreshDecisionDrafts={onRefreshDecisionDrafts}
          onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
        />
      )}
      {activeTab === "history" && (
        <ProjectBoardHistoryTab
          board={board}
          orchestrationBoard={projectBoardOrchestration}
          gitStatus={projectBoardGitStatus}
          gitError={projectBoardGitError}
          retryBusy={synthesisRetryBusy}
          deferBusy={synthesisDeferBusy}
          onRetrySynthesis={(runId, mode) => onRetrySynthesis(board.id, runId, mode)}
          onDeferSynthesisSections={(runId) => onDeferSynthesisSections(board.id, runId)}
          onOpenSourceContext={() => openProjectBoardSourceReview()}
          onSelectTab={setActiveTab}
          onSelectCard={openProjectBoardCardInspector}
        />
      )}
      {activeTab === "draft_inbox" && (
        <ProjectBoardDraftInboxTab
          board={board}
          columns={draftColumns}
          selectedCard={selectedDraftCard}
          selectedCardId={selectedDraftCardId}
          inspectorMode={draftInspectorMode}
          refineBusy={refineBusy && refineMode === "source_elaboration"}
          sourceBusy={sourceBusy}
          sourceImpactBusy={sourceImpactBusy}
          onSelectCard={selectProjectBoardDraftCard}
          onCloseSourcePicker={closeProjectBoardSourcePicker}
          createCardBusy={projectBoardCreateCardBusy}
          createReadyTasksBusy={projectBoardCreateReadyTasksBusy}
          onCreateCard={onCreateCard}
          onCreateReadyTasks={(boardId) => void createProjectBoardReadyTasks(boardId)}
          onRefreshSources={onRefreshSources}
          onRefreshSourceDrafts={onRefreshSourceDrafts}
          onRegenerateSourceDrafts={onRegenerateSourceDrafts}
          onApplySourceImpactFeedback={onApplySourceImpactFeedback}
          onElaborateSources={onElaborateSources}
          onApproveCard={onApproveCard}
          onSplitCard={onSplitCard}
          onUpdateCard={onUpdateCard}
          onUpdateCardCandidate={onUpdateCardCandidate}
          onResolveCardPiUpdate={onResolveCardPiUpdate}
          onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
          onRefreshDecisionDrafts={onRefreshDecisionDrafts}
          onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
          onOpenSourcePicker={openProjectBoardSourcePicker}
          onReviewSources={() => openProjectBoardSourceReview()}
          onInspectSource={openProjectBoardSourceReview}
          latestSynthesisRun={latestSynthesisRun}
          gitStatus={projectBoardGitStatus}
          claimBusy={projectBoardClaimBusy}
          onClaimAction={(card, action) => void updateProjectBoardGitClaim(card, action)}
        />
      )}
    </>
  );
}

function projectBoardWorkspaceSynthesisActivityAction({
  failedSynthesisRun,
  finalizeBusy,
  latestSynthesisRunIsKickoffDefaults,
  latestSynthesisRunStatus,
  refineBusy,
  refineMode,
  runningSynthesisRun,
  synthesisRetryBusy,
}: {
  failedSynthesisRun: boolean;
  finalizeBusy: boolean;
  latestSynthesisRunIsKickoffDefaults: boolean;
  latestSynthesisRunStatus?: NonNullable<ProjectBoardSummary["synthesisRuns"]>[number]["status"];
  refineBusy: boolean;
  refineMode?: ProjectBoardWorkspaceProps["refineMode"];
  runningSynthesisRun: boolean;
  synthesisRetryBusy: boolean;
}): string {
  return finalizeBusy
    ? "Applying board synthesis"
    : synthesisRetryBusy
      ? "Retrying board synthesis"
      : refineBusy && refineMode === "source_elaboration"
        ? "Elaborating source-scoped cards with Pi"
        : refineBusy && refineMode === "board_synthesis"
          ? "Generating draft board with Pi"
          : refineBusy
            ? "Reviewing charter with Pi"
            : latestSynthesisRunIsKickoffDefaults && latestSynthesisRunStatus === "running"
              ? "Suggesting kickoff defaults"
              : latestSynthesisRunIsKickoffDefaults && latestSynthesisRunStatus === "succeeded"
                ? "Latest kickoff defaults"
                : latestSynthesisRunIsKickoffDefaults && latestSynthesisRunStatus === "failed"
                  ? "Kickoff defaults failed"
                  : latestSynthesisRunStatus === "succeeded"
                    ? "Latest board planning run"
                    : latestSynthesisRunStatus === "paused"
                      ? "Board planning paused"
                      : latestSynthesisRunStatus === "pause_requested"
                        ? "Pausing Ambient/Pi synthesis"
                        : failedSynthesisRun
                          ? "Board planning failed"
                          : runningSynthesisRun
                            ? "Running Ambient/Pi synthesis"
                            : "Latest board planning run";
}
