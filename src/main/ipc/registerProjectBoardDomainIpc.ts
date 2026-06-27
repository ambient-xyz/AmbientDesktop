import type { IpcMain } from "electron";

import type { ProjectRuntimeHost as ProjectRuntimeHostContract } from "./ipcProjectRuntimeFacade";
import type { ProjectStore } from "./ipcProjectStoreFacade";
import {
  projectBoardCardIpcChannels,
  projectBoardCreateIpcChannels,
  projectBoardDefaultsIpcChannels,
  projectBoardDeferIpcChannels,
  projectBoardDogfoodIpcChannels,
  projectBoardFeedbackIpcChannels,
  projectBoardGitIpcChannels,
  projectBoardKickoffIpcChannels,
  projectBoardLifecycleIpcChannels,
  projectBoardPauseIpcChannels,
  projectBoardPromoteIpcChannels,
  projectBoardProofIpcChannels,
  projectBoardProposalIpcChannels,
  projectBoardSourceQuestionIpcChannels,
  projectBoardSourceRefreshIpcChannels,
  projectBoardSynthesisRefinementIpcChannels,
  projectBoardSynthesisRetryIpcChannels,
  registerProjectBoardCardIpc,
  registerProjectBoardCreateIpc,
  registerProjectBoardDefaultsIpc,
  registerProjectBoardDeferIpc,
  registerProjectBoardDogfoodIpc,
  registerProjectBoardFeedbackIpc,
  registerProjectBoardGitIpc,
  registerProjectBoardKickoffIpc,
  registerProjectBoardLifecycleIpc,
  registerProjectBoardPauseIpc,
  registerProjectBoardPromoteIpc,
  registerProjectBoardProofIpc,
  registerProjectBoardProposalIpc,
  registerProjectBoardSourceQuestionIpc,
  registerProjectBoardSourceRefreshIpc,
  registerProjectBoardSynthesisRefinementIpc,
  registerProjectBoardSynthesisRetryIpc,
} from "./registerProjectBoardIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type ProjectRuntimeHost = ProjectRuntimeHostContract<
  ProjectStore,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  { enabled: boolean }
>;

export const projectBoardDomainIpcChannels = [
  ...projectBoardCreateIpcChannels,
  ...projectBoardLifecycleIpcChannels,
  ...projectBoardGitIpcChannels,
  ...projectBoardPauseIpcChannels,
  ...projectBoardSynthesisRetryIpcChannels,
  ...projectBoardDogfoodIpcChannels,
  ...projectBoardDeferIpcChannels,
  ...projectBoardPromoteIpcChannels,
  ...projectBoardProofIpcChannels,
  ...projectBoardDefaultsIpcChannels,
  ...projectBoardCardIpcChannels,
  ...projectBoardFeedbackIpcChannels,
  ...projectBoardSourceRefreshIpcChannels,
  ...projectBoardSynthesisRefinementIpcChannels,
  ...projectBoardProposalIpcChannels,
  ...projectBoardSourceQuestionIpcChannels,
  ...projectBoardKickoffIpcChannels,
] as const;

export interface RegisterProjectBoardDomainIpcDependencies {
  handleIpc: HandleIpc;
  applyProjectBoardGitProjectionAndBroadcast: any;
  applyProjectBoardLiveSynthesis: any;
  assertProjectBoardMutationAllowedForActiveThread: any;
  claimProjectBoardGitCardArtifacts: any;
  commitProjectBoardGitArtifacts: any;
  createProjectBoardForProjectHost: any;
  emitProjectStateIfActive: any;
  expireProjectBoardGitCardClaimArtifacts: any;
  exportProjectBoardGitArtifacts: any;
  getProjectBoardGitSyncStatus: any;
  pauseProjectBoardSynthesisForProjectHost: any;
  pullProjectBoardGitArtifacts: any;
  pushProjectBoardGitArtifacts: any;
  readStateForProjectHostAction: any;
  recordProjectBoardSynthesisSectionDecision: any;
  refineProjectBoardSynthesisForProjectHost: any;
  refreshProjectBoardSourcesForProjectHost: any;
  regenerateProjectBoardDecisionDrafts: any;
  regenerateProjectBoardSourceDrafts: any;
  releaseProjectBoardGitCardClaimArtifacts: any;
  requireProjectBoardDogfoodTestHook: any;
  requireProjectBoardForAction: any;
  requireProjectRuntimeHostForOrchestrationTask: any;
  requireProjectRuntimeHostForPlannerPlanArtifact: any;
  requireProjectRuntimeHostForProjectBoard: any;
  requireProjectRuntimeHostForProjectBoardCard: any;
  requireProjectRuntimeHostForProjectBoardQuestion: any;
  requireProjectRuntimeHostForProjectBoardSource: any;
  requireProjectRuntimeHostForProjectBoardSynthesisProposal: any;
  rerunProjectBoardProof: any;
  resolveProjectBoardGitCardClaimConflictsArtifacts: any;
  retryProjectBoardSynthesisForProjectHost: any;
  scheduleAutoDispatch: any;
  seedProjectBoardCanonicalProjectionDogfoodForProjectHost: any;
  seedProjectBoardDeliverableIntegrationDogfoodForProjectHost: any;
  seedProjectBoardProofJudgmentDogfoodForProjectHost: any;
  seedProjectBoardSemanticIdleDogfoodRun: any;
  setProjectHostActiveThreadId: any;
  startProjectBoardSynthesisAfterPlanPromotion: any;
  suggestProjectBoardClarificationDefaults: any;
  suggestProjectBoardKickoffDefaults: any;
  suggestProjectBoardProof: any;
}

export function registerProjectBoardDomainIpc({
  handleIpc,
  applyProjectBoardGitProjectionAndBroadcast,
  applyProjectBoardLiveSynthesis,
  assertProjectBoardMutationAllowedForActiveThread,
  claimProjectBoardGitCardArtifacts,
  commitProjectBoardGitArtifacts,
  createProjectBoardForProjectHost,
  expireProjectBoardGitCardClaimArtifacts,
  exportProjectBoardGitArtifacts,
  getProjectBoardGitSyncStatus,
  pauseProjectBoardSynthesisForProjectHost,
  pullProjectBoardGitArtifacts,
  pushProjectBoardGitArtifacts,
  readStateForProjectHostAction,
  recordProjectBoardSynthesisSectionDecision,
  refineProjectBoardSynthesisForProjectHost,
  refreshProjectBoardSourcesForProjectHost,
  regenerateProjectBoardDecisionDrafts,
  regenerateProjectBoardSourceDrafts,
  releaseProjectBoardGitCardClaimArtifacts,
  requireProjectBoardDogfoodTestHook,
  requireProjectBoardForAction,
  requireProjectRuntimeHostForOrchestrationTask,
  requireProjectRuntimeHostForPlannerPlanArtifact,
  requireProjectRuntimeHostForProjectBoard,
  requireProjectRuntimeHostForProjectBoardCard,
  requireProjectRuntimeHostForProjectBoardQuestion,
  requireProjectRuntimeHostForProjectBoardSource,
  requireProjectRuntimeHostForProjectBoardSynthesisProposal,
  rerunProjectBoardProof,
  resolveProjectBoardGitCardClaimConflictsArtifacts,
  retryProjectBoardSynthesisForProjectHost,
  scheduleAutoDispatch,
  seedProjectBoardCanonicalProjectionDogfoodForProjectHost,
  seedProjectBoardDeliverableIntegrationDogfoodForProjectHost,
  seedProjectBoardProofJudgmentDogfoodForProjectHost,
  seedProjectBoardSemanticIdleDogfoodRun,
  setProjectHostActiveThreadId,
  startProjectBoardSynthesisAfterPlanPromotion,
  suggestProjectBoardClarificationDefaults,
  suggestProjectBoardKickoffDefaults,
  suggestProjectBoardProof,
  emitProjectStateIfActive,
}: RegisterProjectBoardDomainIpcDependencies): void {
  registerProjectBoardCreateIpc({
    handleIpc,
    createProjectBoard: createProjectBoardForProjectHost,
  });

  registerProjectBoardLifecycleIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    updateProjectBoardStatus: (host, input) => host.store.updateProjectBoardStatus(input.boardId, input.status),
    startProjectBoardRevision: (host, input) => host.store.startProjectBoardRevision(input),
    cancelProjectBoardRevision: (host, input) => host.store.cancelProjectBoardRevision(input.boardId),
    resetProjectBoard: (host, input) => host.store.resetProjectBoard(input.boardId),
  });

  registerProjectBoardGitIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    getProjectBoardGitSyncStatus: (host, input) =>
      getProjectBoardGitSyncStatus(requireProjectBoardForAction(input.boardId, host.store), { runtime: host.store.listOrchestrationBoard() }),
    exportProjectBoardGitArtifacts: (host, input) =>
      exportProjectBoardGitArtifacts(requireProjectBoardForAction(input.boardId, host.store), { runtime: host.store.listOrchestrationBoard() }),
    commitProjectBoardGitArtifacts: (host, input) =>
      commitProjectBoardGitArtifacts(requireProjectBoardForAction(input.boardId, host.store), input.message, {
        runtime: host.store.listOrchestrationBoard(),
      }),
    pushProjectBoardGitArtifacts: (host, input) => pushProjectBoardGitArtifacts(requireProjectBoardForAction(input.boardId, host.store)),
    pullProjectBoardGitArtifacts: (host, input) => pullProjectBoardGitArtifacts(requireProjectBoardForAction(input.boardId, host.store)),
    applyProjectBoardGitProjection: (host, input) => applyProjectBoardGitProjectionAndBroadcast(input.boardId, input.resolutions, host.store, host),
    claimProjectBoardGitCard: async (host, input) => {
      await claimProjectBoardGitCardArtifacts(requireProjectBoardForAction(input.boardId, host.store), { cardId: input.cardId });
      return applyProjectBoardGitProjectionAndBroadcast(input.boardId, [], host.store, host);
    },
    releaseProjectBoardGitCardClaim: async (host, input) => {
      await releaseProjectBoardGitCardClaimArtifacts(requireProjectBoardForAction(input.boardId, host.store), {
        cardId: input.cardId,
        force: input.force,
        reason: input.reason,
      });
      return applyProjectBoardGitProjectionAndBroadcast(input.boardId, [], host.store, host);
    },
    expireProjectBoardGitCardClaim: async (host, input) => {
      await expireProjectBoardGitCardClaimArtifacts(requireProjectBoardForAction(input.boardId, host.store), {
        cardId: input.cardId,
        force: input.force,
        reason: input.reason,
      });
      return applyProjectBoardGitProjectionAndBroadcast(input.boardId, [], host.store, host);
    },
    resolveProjectBoardGitCardClaimConflicts: async (host, input) => {
      await resolveProjectBoardGitCardClaimConflictsArtifacts(requireProjectBoardForAction(input.boardId, host.store), {
        cardId: input.cardId,
        force: input.force,
        reason: input.reason,
      });
      return applyProjectBoardGitProjectionAndBroadcast(input.boardId, [], host.store, host);
    },
  });

  registerProjectBoardPauseIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    pauseProjectBoardSynthesis: pauseProjectBoardSynthesisForProjectHost,
  });

  registerProjectBoardSynthesisRetryIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    retryProjectBoardSynthesis: retryProjectBoardSynthesisForProjectHost,
    abandonProjectBoardSynthesisRun: (host, input) => {
      host.store.markProjectBoardSynthesisRunStalled({
        boardId: input.boardId,
        runId: input.runId,
        reason: input.reason ?? "Abandoned from the synthesis run banner without retry.",
      });
      emitProjectStateIfActive(host);
      return readStateForProjectHostAction(host);
    },
  });

  registerProjectBoardDogfoodIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectBoardDogfoodTestHook,
    requireProjectRuntimeHostForProjectBoard,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    seedProjectBoardSemanticIdleDogfood: (host, input) => seedProjectBoardSemanticIdleDogfoodRun(input.boardId, host.store),
    seedProjectBoardProofJudgmentDogfood: seedProjectBoardProofJudgmentDogfoodForProjectHost,
    seedProjectBoardCanonicalProjectionDogfood: seedProjectBoardCanonicalProjectionDogfoodForProjectHost,
    seedProjectBoardDeliverableIntegrationDogfood: seedProjectBoardDeliverableIntegrationDogfoodForProjectHost,
  });

  registerProjectBoardDeferIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    deferProjectBoardSynthesisSections: (host, input) =>
      recordProjectBoardSynthesisSectionDecision(input.boardId, input.runId, "defer_failed_sections", input.reason, host.store),
  });

  registerProjectBoardPromoteIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForPlannerPlanArtifact,
    assertProjectBoardMutationAllowedForActiveThread,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    promotePlannerPlanToBoard: (host, input) => {
      const card = host.store.promotePlannerPlanToBoard(input.artifactId);
      emitProjectStateIfActive(host);
      startProjectBoardSynthesisAfterPlanPromotion(host, card.boardId);
    },
  });

  registerProjectBoardProofIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    requireProjectRuntimeHostForProjectBoardCard,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    approveProjectBoardCard: (host, input) => host.store.approveProjectBoardCard(input.cardId),
    resolveProjectBoardProofDecision: (host, input) => host.store.resolveProjectBoardProofDecision(input),
    isAutoDispatchEnabled: (host) => host.autoDispatch.enabled,
    scheduleAutoDispatch: (host) => scheduleAutoDispatch(1_000, host),
    rerunProjectBoardProof: (host, input, onProgress) => rerunProjectBoardProof(input, host.store, onProgress),
    resolveProjectBoardDeliverableIntegration: (host, input) => host.store.resolveProjectBoardDeliverableIntegration(input),
    recomputeProjectBoardProofCoverage: (host, input) => host.store.recomputeProjectBoardProofCoverage(input),
    suggestProjectBoardProof: (host, input) => suggestProjectBoardProof(input, host.store),
  });

  registerProjectBoardDefaultsIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    suggestProjectBoardClarificationDefaults: (host, input) => suggestProjectBoardClarificationDefaults(input, host.store),
    suggestProjectBoardKickoffDefaults: (host, input) => suggestProjectBoardKickoffDefaults(input, host.store, host),
  });

  registerProjectBoardCardIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    requireProjectRuntimeHostForProjectBoardCard,
    requireProjectRuntimeHostForOrchestrationTask,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    setProjectHostActiveThreadId,
    resolveProjectBoardSplitDecision: (host, input) => host.store.resolveProjectBoardSplitDecision(input),
    createReadyProjectBoardTasks: (host, input) => host.store.createReadyProjectBoardTasks(input.boardId).length,
    isAutoDispatchEnabled: (host) => host.autoDispatch.enabled,
    scheduleAutoDispatch: (host) => scheduleAutoDispatch(1_000, host),
    splitProjectBoardCard: (host, input) => host.store.splitProjectBoardCard(input.cardId),
    createProjectBoardCard: (host, input) => host.store.createProjectBoardManualCard(input),
    attachProjectBoardLocalTask: (host, input) => host.store.attachLocalTaskToProjectBoard(input),
    updateProjectBoardCard: (host, input) => host.store.updateProjectBoardCard(input),
    updateProjectBoardCardCandidate: (host, input) => host.store.updateProjectBoardCardCandidateStatus(input.cardId, input.candidateStatus),
    resolveProjectBoardCardPiUpdate: (host, input) => host.store.resolveProjectBoardCardPiUpdate(input),
    addProjectBoardCardRunFeedback: (host, input) => host.store.addProjectBoardCardRunFeedback(input),
    copyProjectBoardSessionToThread: (host, input) => host.store.copyProjectBoardSessionToThread(input),
  });

  registerProjectBoardFeedbackIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    requireProjectRuntimeHostForProjectBoardCard,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    applyProjectBoardDecisionImpactFeedback: (host, input) => host.store.applyProjectBoardDecisionImpactFeedback(input),
    refreshProjectBoardDecisionDrafts: (host, input) => host.store.refreshProjectBoardDecisionDrafts(input),
    regenerateProjectBoardDecisionDrafts: (host, input) => regenerateProjectBoardDecisionDrafts(input, host.store),
    refreshProjectBoardSourceDrafts: (host, input) => host.store.refreshProjectBoardSourceDrafts(input),
    regenerateProjectBoardSourceDrafts: (host, input) => regenerateProjectBoardSourceDrafts(input, host.store),
    applyProjectBoardSourceImpactFeedback: (host, input) => host.store.applyProjectBoardSourceImpactFeedback(input),
  });

  registerProjectBoardSourceRefreshIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    refreshProjectBoardSources: refreshProjectBoardSourcesForProjectHost,
  });

  registerProjectBoardSynthesisRefinementIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    refineProjectBoardSynthesis: refineProjectBoardSynthesisForProjectHost,
  });

  registerProjectBoardProposalIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoardSynthesisProposal,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    answerProjectBoardSynthesisProposalQuestion: (host, input) => host.store.answerProjectBoardSynthesisProposalQuestion(input),
    reviewProjectBoardSynthesisProposalCard: (host, input) => host.store.reviewProjectBoardSynthesisProposalCard(input),
    applyProjectBoardSynthesisProposal: (host, input) => host.store.applyProjectBoardSynthesisProposal(input),
  });

  registerProjectBoardSourceQuestionIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoardSource,
    requireProjectRuntimeHostForProjectBoardQuestion,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    updateProjectBoardSource: (host, input) => host.store.updateProjectBoardSource(input),
    answerProjectBoardQuestion: (host, input) => host.store.answerProjectBoardQuestion(input.questionId, input.answer),
  });

  registerProjectBoardKickoffIpc<ProjectRuntimeHost>({
    handleIpc,
    requireProjectRuntimeHostForProjectBoard,
    finalizeProjectBoardKickoff: async (host, input) => {
      host.store.finalizeProjectBoardKickoff(input.boardId);
      emitProjectStateIfActive(host);
      await applyProjectBoardLiveSynthesis(input.boardId, { replaceExistingDraft: true, targetStore: host.store, host });
      return readStateForProjectHostAction(host);
    },
  });
}
