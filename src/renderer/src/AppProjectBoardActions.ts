import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { RefineProjectBoardSynthesisInput } from "../../shared/projectBoardTypes";
import type { ProjectBoardResetDialogState } from "./AppActionDialogs";
import { createAppProjectBoardDraftSourceActions } from "./AppProjectBoardDraftSourceActions";
import { createAppProjectBoardLifecycleActions } from "./AppProjectBoardLifecycleActions";
import { createAppProjectBoardProofActions } from "./AppProjectBoardProofActions";
import type { SidebarArea } from "./AppShellSidebar";
import { createAppProjectBoardSynthesisActions } from "./AppProjectBoardSynthesisActions";
import { projectBoardSuppressedForWorkflowRecordingThread } from "./projectBoardUiModel";

export { PROJECT_BOARD_RESET_BRIDGE_UNAVAILABLE_MESSAGE, projectBoardBusyProjectIdsWith } from "./AppProjectBoardLifecycleActions";
export {
  projectBoardProposalCardReviewBusyKey,
  projectBoardProposalQuestionBusyKey,
  projectBoardSynthesisPauseReason,
} from "./AppProjectBoardSynthesisActions";

type ProjectBoardActionsThread = {
  workflowRecording?: unknown;
};

export function createAppProjectBoardActions({
  activeThread,
  activeWorkspacePath,
  applyCreatedThreadState,
  applyProjectActionState,
  projectBoardBusyProjectIds,
  projectBoardKickoffDefaultsBusy,
  projectBoardResetDialog,
  previewArtifact,
  selectProject,
  selectThread,
  setError,
  setProjectBoardBusyProjectIds,
  setProjectBoardFinalizeBusy,
  setProjectBoardKickoffDefaultsBusy,
  setProjectBoardOpen,
  setProjectBoardPlanBusy,
  setProjectBoardPlanPickerOpen,
  setProjectBoardProposalAnswerBusy,
  setProjectBoardProposalApplyBusy,
  setProjectBoardProposalCardReviewBusy,
  setProjectBoardRefineBusy,
  setProjectBoardRefineMode,
  setProjectBoardResetDialog,
  setProjectBoardRevisionBusy,
  setProjectBoardSourceBusy,
  setProjectBoardSourceImpactBusy,
  setProjectBoardSynthesisDeferBusy,
  setProjectBoardSynthesisPauseBusy,
  setProjectBoardSynthesisRetryBusy,
  setSidebarArea,
  setState,
  state,
}: {
  activeThread: ProjectBoardActionsThread | undefined;
  activeWorkspacePath: string | undefined;
  applyCreatedThreadState: (next: DesktopState, previousWorkspacePath?: string) => boolean;
  applyProjectActionState: (next: DesktopState) => boolean;
  projectBoardBusyProjectIds: Set<string>;
  projectBoardKickoffDefaultsBusy: boolean;
  projectBoardResetDialog: ProjectBoardResetDialogState | undefined;
  previewArtifact: (path: string) => void;
  selectProject: (workspacePath: string) => Promise<void>;
  selectThread: (threadId: string, workspacePath?: string) => Promise<void>;
  setError: (message: string | undefined) => void;
  setProjectBoardBusyProjectIds: Dispatch<SetStateAction<Set<string>>>;
  setProjectBoardFinalizeBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardKickoffDefaultsBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardOpen: Dispatch<SetStateAction<boolean>>;
  setProjectBoardPlanBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardPlanPickerOpen: Dispatch<SetStateAction<boolean>>;
  setProjectBoardProposalAnswerBusy: Dispatch<SetStateAction<string | undefined>>;
  setProjectBoardProposalApplyBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardProposalCardReviewBusy: Dispatch<SetStateAction<string | undefined>>;
  setProjectBoardRefineBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardRefineMode: Dispatch<SetStateAction<RefineProjectBoardSynthesisInput["mode"] | undefined>>;
  setProjectBoardResetDialog: Dispatch<SetStateAction<ProjectBoardResetDialogState | undefined>>;
  setProjectBoardRevisionBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSourceBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSourceImpactBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSynthesisDeferBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSynthesisPauseBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardSynthesisRetryBusy: Dispatch<SetStateAction<boolean>>;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState | undefined;
}) {
  function suppressesProjectBoard(): boolean {
    return projectBoardSuppressedForWorkflowRecordingThread(activeThread);
  }

  function applyProjectBoardState(next: DesktopState): void {
    if (applyProjectActionState(next)) setProjectBoardOpen(true);
  }

  const {
    answerProjectBoardSynthesisProposalQuestion,
    applyProjectBoardSynthesisProposal,
    deferProjectBoardSynthesisSections,
    pauseProjectBoardSynthesis,
    refineProjectBoardWithPi,
    retryProjectBoardSynthesis,
    reviewProjectBoardSynthesisProposalCard,
  } = createAppProjectBoardSynthesisActions({
    applyProjectBoardState,
    setError,
    setProjectBoardProposalAnswerBusy,
    setProjectBoardProposalApplyBusy,
    setProjectBoardProposalCardReviewBusy,
    setProjectBoardRefineBusy,
    setProjectBoardRefineMode,
    setProjectBoardSynthesisDeferBusy,
    setProjectBoardSynthesisPauseBusy,
    setProjectBoardSynthesisRetryBusy,
  });

  const {
    approveProjectBoardCard,
    createReadyProjectBoardTasks,
    recomputeProjectBoardProofCoverage,
    resolveProjectBoardDeliverableIntegration,
    resolveProjectBoardProofDecision,
    resolveProjectBoardSplitDecision,
    rerunProjectBoardProof,
    splitProjectBoardCard,
    suggestProjectBoardProof,
  } = createAppProjectBoardProofActions({
    applyProjectBoardState,
    setError,
  });

  const {
    applyProjectBoardDecisionImpactFeedback,
    applyProjectBoardSourceImpactFeedback,
    refreshProjectBoardDecisionDrafts,
    refreshProjectBoardSourceDrafts,
    refreshProjectBoardSources,
    regenerateProjectBoardDecisionDrafts,
    regenerateProjectBoardSourceDrafts,
    resolveProjectBoardCardPiUpdate,
    suggestProjectBoardClarificationDefaults,
    suggestProjectBoardKickoffDefaults,
    updateProjectBoardSource,
  } = createAppProjectBoardDraftSourceActions({
    applyProjectBoardState,
    projectBoardKickoffDefaultsBusy,
    setError,
    setProjectBoardKickoffDefaultsBusy,
    setProjectBoardSourceBusy,
    setProjectBoardSourceImpactBusy,
  });

  const {
    addPlannerPlanToBoard,
    addProjectBoardCardRunFeedback,
    answerProjectBoardQuestion,
    attachProjectBoardLocalTask,
    buildProjectBoard,
    cancelProjectBoardRevision,
    confirmProjectBoardReset,
    copyProjectBoardSessionToThread,
    createProjectBoardCard,
    finalizeProjectBoardKickoff,
    generatePlannerDurableArtifact,
    openProjectBoard,
    openProjectBoardRunThread,
    requestProjectBoardReset,
    reviseProjectBoard,
    updateProjectBoardCard,
    updateProjectBoardCardCandidate,
  } = createAppProjectBoardLifecycleActions({
    activeWorkspacePath,
    applyCreatedThreadState,
    applyProjectBoardState,
    projectBoardBusyProjectIds,
    projectBoardResetDialog,
    previewArtifact,
    selectProject,
    selectThread,
    setError,
    setProjectBoardBusyProjectIds,
    setProjectBoardFinalizeBusy,
    setProjectBoardOpen,
    setProjectBoardPlanBusy,
    setProjectBoardPlanPickerOpen,
    setProjectBoardResetDialog,
    setProjectBoardRevisionBusy,
    setSidebarArea,
    setState,
    state,
    suppressesProjectBoard,
  });

  return {
    addPlannerPlanToBoard,
    addProjectBoardCardRunFeedback,
    answerProjectBoardQuestion,
    answerProjectBoardSynthesisProposalQuestion,
    applyProjectBoardDecisionImpactFeedback,
    applyProjectBoardSourceImpactFeedback,
    applyProjectBoardSynthesisProposal,
    approveProjectBoardCard,
    attachProjectBoardLocalTask,
    buildProjectBoard,
    cancelProjectBoardRevision,
    confirmProjectBoardReset,
    copyProjectBoardSessionToThread,
    createProjectBoardCard,
    createReadyProjectBoardTasks,
    deferProjectBoardSynthesisSections,
    finalizeProjectBoardKickoff,
    generatePlannerDurableArtifact,
    openProjectBoard,
    openProjectBoardRunThread,
    pauseProjectBoardSynthesis,
    recomputeProjectBoardProofCoverage,
    refineProjectBoardWithPi,
    refreshProjectBoardDecisionDrafts,
    refreshProjectBoardSourceDrafts,
    refreshProjectBoardSources,
    regenerateProjectBoardDecisionDrafts,
    regenerateProjectBoardSourceDrafts,
    requestProjectBoardReset,
    resolveProjectBoardCardPiUpdate,
    resolveProjectBoardDeliverableIntegration,
    resolveProjectBoardProofDecision,
    resolveProjectBoardSplitDecision,
    reviseProjectBoard,
    retryProjectBoardSynthesis,
    rerunProjectBoardProof,
    reviewProjectBoardSynthesisProposalCard,
    splitProjectBoardCard,
    suggestProjectBoardClarificationDefaults,
    suggestProjectBoardKickoffDefaults,
    suggestProjectBoardProof,
    updateProjectBoardCard,
    updateProjectBoardCardCandidate,
    updateProjectBoardSource,
  };
}

export type AppProjectBoardActions = ReturnType<typeof createAppProjectBoardActions>;
