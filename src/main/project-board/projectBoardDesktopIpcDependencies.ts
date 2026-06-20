import type { DesktopState } from "../../shared/desktopTypes";
import {
  applyProjectBoardGitProjectionAndBroadcast,
  assertProjectBoardMutationAllowedForActiveThread,
  createProjectBoardForProjectHost,
  requireProjectRuntimeHostForProjectBoard,
  requireProjectRuntimeHostForProjectBoardCard,
  requireProjectRuntimeHostForProjectBoardQuestion,
  requireProjectRuntimeHostForProjectBoardSource,
  requireProjectRuntimeHostForProjectBoardSynthesisProposal,
} from "./projectBoardDesktopContextService";
import {
  applyProjectBoardLiveSynthesis,
  pauseProjectBoardSynthesisForProjectHost,
  recordProjectBoardSynthesisSectionDecision,
  refineProjectBoardSynthesisForProjectHost,
  refreshProjectBoardSourcesForProjectHost,
  requireProjectBoardForAction,
  retryProjectBoardSynthesisForProjectHost,
  startProjectBoardSynthesisAfterPlanPromotion,
  suggestProjectBoardKickoffDefaults,
} from "./projectBoardSynthesisDesktopService";
import {
  regenerateProjectBoardDecisionDrafts,
  regenerateProjectBoardSourceDrafts,
  rerunProjectBoardProof,
  suggestProjectBoardClarificationDefaults,
  suggestProjectBoardProof,
} from "./projectBoardProofDefaultsDesktopService";
import {
  requireProjectBoardDogfoodTestHook,
  seedProjectBoardCanonicalProjectionDogfoodForProjectHost,
  seedProjectBoardDeliverableIntegrationDogfoodForProjectHost,
  seedProjectBoardProofJudgmentDogfoodForProjectHost,
  seedProjectBoardSemanticIdleDogfoodRun,
} from "./projectBoardDogfoodDesktopService";
import {
  claimProjectBoardGitCardArtifacts,
  commitProjectBoardGitArtifacts,
  expireProjectBoardGitCardClaimArtifacts,
  exportProjectBoardGitArtifacts,
  getProjectBoardGitSyncStatus,
  pullProjectBoardGitArtifacts,
  pushProjectBoardGitArtifacts,
  releaseProjectBoardGitCardClaimArtifacts,
  resolveProjectBoardGitCardClaimConflictsArtifacts,
} from "./projectBoardGitSync";

export interface ProjectBoardDesktopIpcHostDependencies<Host = unknown> {
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): DesktopState;
  requireProjectRuntimeHostForOrchestrationTask(taskId: string): Host;
  requireProjectRuntimeHostForPlannerPlanArtifact(artifactId: string): Host;
  scheduleAutoDispatch(delayMs?: number, host?: Host): void;
  setProjectHostActiveThreadId(host: Host, threadId: string): string;
}

export function createProjectBoardDesktopIpcDependencies<Host>(
  hostDependencies: ProjectBoardDesktopIpcHostDependencies<Host>,
) {
  return {
    ...hostDependencies,
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
    recordProjectBoardSynthesisSectionDecision,
    refineProjectBoardSynthesisForProjectHost,
    refreshProjectBoardSourcesForProjectHost,
    regenerateProjectBoardDecisionDrafts,
    regenerateProjectBoardSourceDrafts,
    releaseProjectBoardGitCardClaimArtifacts,
    requireProjectBoardDogfoodTestHook,
    requireProjectBoardForAction,
    requireProjectRuntimeHostForProjectBoard,
    requireProjectRuntimeHostForProjectBoardCard,
    requireProjectRuntimeHostForProjectBoardQuestion,
    requireProjectRuntimeHostForProjectBoardSource,
    requireProjectRuntimeHostForProjectBoardSynthesisProposal,
    rerunProjectBoardProof,
    resolveProjectBoardGitCardClaimConflictsArtifacts,
    retryProjectBoardSynthesisForProjectHost,
    seedProjectBoardCanonicalProjectionDogfoodForProjectHost,
    seedProjectBoardDeliverableIntegrationDogfoodForProjectHost,
    seedProjectBoardProofJudgmentDogfoodForProjectHost,
    seedProjectBoardSemanticIdleDogfoodRun,
    startProjectBoardSynthesisAfterPlanPromotion,
    suggestProjectBoardClarificationDefaults,
    suggestProjectBoardKickoffDefaults,
    suggestProjectBoardProof,
  };
}
