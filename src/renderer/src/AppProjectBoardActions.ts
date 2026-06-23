import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type {
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  AttachProjectBoardLocalTaskMode,
  CopyProjectBoardSessionToThreadInput,
  CreateReadyProjectBoardTasksInput,
  DeferProjectBoardSynthesisSectionsInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardProofDecisionAction,
  ProjectBoardQuestion,
  ProjectBoardSplitDecisionAction,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectSummary,
  RecomputeProjectBoardProofCoverageInput,
  RefineProjectBoardSynthesisInput,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  RerunProjectBoardProofInput,
  ResolveProjectBoardCardPiUpdateInput,
  ResolveProjectBoardDeliverableIntegrationInput,
  RetryProjectBoardSynthesisInput,
  SplitProjectBoardCardInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardKickoffDefaultsInput,
  SuggestProjectBoardProofInput,
  UpdateProjectBoardCardInput,
  UpdateProjectBoardSourceInput,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardResetDialogState } from "./AppActionDialogs";
import { projectBoardActionErrorMessage } from "./AppProjectBoardActionSupport";
import { createAppProjectBoardDraftSourceActions } from "./AppProjectBoardDraftSourceActions";
import { createAppProjectBoardProofActions } from "./AppProjectBoardProofActions";
import type { SidebarArea } from "./AppShellSidebar";
import { createAppProjectBoardSynthesisActions } from "./AppProjectBoardSynthesisActions";
import { projectBoardSuppressedForWorkflowRecordingThread } from "./projectBoardUiModel";

export {
  projectBoardProposalCardReviewBusyKey,
  projectBoardProposalQuestionBusyKey,
  projectBoardSynthesisPauseReason,
} from "./AppProjectBoardSynthesisActions";

type ProjectBoardActionsThread = {
  workflowRecording?: unknown;
};

export const PROJECT_BOARD_RESET_BRIDGE_UNAVAILABLE_MESSAGE =
  "Reset Board requires a fresh Ambient Desktop window so the updated main/preload bridge is active.";

export function projectBoardBusyProjectIdsWith(current: Set<string>, projectId: string, busy: boolean): Set<string> {
  const next = new Set(current);
  if (busy) next.add(projectId);
  else next.delete(projectId);
  return next;
}

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
}): {
  addPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => Promise<void>;
  addProjectBoardCardRunFeedback: (input: AddProjectBoardCardRunFeedbackInput) => Promise<void>;
  answerProjectBoardQuestion: (question: ProjectBoardQuestion, answer: string) => Promise<void>;
  answerProjectBoardSynthesisProposalQuestion: (proposalId: string, questionIndex: number, answer: string) => Promise<void>;
  applyProjectBoardDecisionImpactFeedback: (input: ApplyProjectBoardDecisionImpactFeedbackInput) => Promise<void>;
  applyProjectBoardSourceImpactFeedback: (input: ApplyProjectBoardSourceImpactFeedbackInput) => Promise<void>;
  applyProjectBoardSynthesisProposal: (proposalId: string) => Promise<void>;
  approveProjectBoardCard: (card: ProjectBoardCard) => Promise<void>;
  attachProjectBoardLocalTask: (taskId: string, mode: AttachProjectBoardLocalTaskMode) => Promise<void>;
  buildProjectBoard: (project: ProjectSummary) => Promise<void>;
  cancelProjectBoardRevision: (boardId: string) => Promise<void>;
  confirmProjectBoardReset: () => Promise<void>;
  copyProjectBoardSessionToThread: (input: CopyProjectBoardSessionToThreadInput) => Promise<void>;
  createProjectBoardCard: (boardId: string) => Promise<DesktopState | undefined>;
  createReadyProjectBoardTasks: (input: CreateReadyProjectBoardTasksInput) => Promise<void>;
  deferProjectBoardSynthesisSections: (input: DeferProjectBoardSynthesisSectionsInput) => Promise<void>;
  finalizeProjectBoardKickoff: (boardId: string) => Promise<void>;
  generatePlannerDurableArtifact: (artifact: PlannerPlanArtifact) => Promise<void>;
  openProjectBoard: (project: ProjectSummary) => Promise<void>;
  openProjectBoardRunThread: (threadId: string, workspacePath?: string) => Promise<void>;
  pauseProjectBoardSynthesis: (boardId: string, runId: string) => Promise<void>;
  recomputeProjectBoardProofCoverage: (input: RecomputeProjectBoardProofCoverageInput) => Promise<void>;
  refineProjectBoardWithPi: (
    boardId: string,
    proposalId?: string,
    input?: Pick<RefineProjectBoardSynthesisInput, "mode" | "sourceIds" | "objective">,
  ) => Promise<void>;
  refreshProjectBoardDecisionDrafts: (input: RefreshProjectBoardDecisionDraftsInput) => Promise<void>;
  refreshProjectBoardSourceDrafts: (input: RefreshProjectBoardSourceDraftsInput) => Promise<void>;
  refreshProjectBoardSources: (boardId: string) => Promise<void>;
  regenerateProjectBoardDecisionDrafts: (input: RegenerateProjectBoardDecisionDraftsInput) => Promise<void>;
  regenerateProjectBoardSourceDrafts: (input: RegenerateProjectBoardSourceDraftsInput) => Promise<void>;
  requestProjectBoardReset: (project: ProjectSummary) => void;
  resolveProjectBoardCardPiUpdate: (input: ResolveProjectBoardCardPiUpdateInput) => Promise<void>;
  resolveProjectBoardDeliverableIntegration: (input: ResolveProjectBoardDeliverableIntegrationInput) => Promise<void>;
  resolveProjectBoardProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => Promise<void>;
  resolveProjectBoardSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => Promise<void>;
  reviseProjectBoard: (boardId: string) => Promise<void>;
  retryProjectBoardSynthesis: (input: RetryProjectBoardSynthesisInput) => Promise<void>;
  rerunProjectBoardProof: (input: RerunProjectBoardProofInput) => Promise<void>;
  reviewProjectBoardSynthesisProposalCard: (
    proposalId: string,
    sourceId: string,
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus,
    reason?: string,
    mergeTargetCardId?: string,
  ) => Promise<void>;
  splitProjectBoardCard: (input: SplitProjectBoardCardInput) => Promise<void>;
  suggestProjectBoardClarificationDefaults: (input: SuggestProjectBoardClarificationDefaultsInput) => Promise<void>;
  suggestProjectBoardKickoffDefaults: (input: SuggestProjectBoardKickoffDefaultsInput) => Promise<void>;
  suggestProjectBoardProof: (input: SuggestProjectBoardProofInput) => Promise<void>;
  updateProjectBoardCard: (input: UpdateProjectBoardCardInput) => Promise<void>;
  updateProjectBoardCardCandidate: (card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) => Promise<void>;
  updateProjectBoardSource: (input: UpdateProjectBoardSourceInput) => Promise<void>;
} {
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

  async function buildProjectBoard(project: ProjectSummary) {
    if (suppressesProjectBoard()) return;
    if (projectBoardBusyProjectIds.has(project.id)) return;
    setProjectBoardBusyProjectIds((current) => projectBoardBusyProjectIdsWith(current, project.id, true));
    setError(undefined);
    setSidebarArea("projects");
    setProjectBoardOpen(true);
    try {
      const next = await window.ambientDesktop.createProjectBoard({ projectId: project.id });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    } finally {
      setProjectBoardBusyProjectIds((current) => projectBoardBusyProjectIdsWith(current, project.id, false));
    }
  }

  async function openProjectBoard(project: ProjectSummary) {
    if (suppressesProjectBoard()) return;
    if (project.path !== state?.workspace.path) {
      await selectProject(project.path);
    }
    setSidebarArea("projects");
    setProjectBoardOpen(true);
  }

  async function addPlannerPlanToBoard(artifact: PlannerPlanArtifact) {
    if (!state) return;
    if (suppressesProjectBoard()) return;
    setProjectBoardPlanBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.promotePlannerPlanToBoard({ artifactId: artifact.id });
      applyProjectBoardState(next);
      setProjectBoardPlanPickerOpen(false);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    } finally {
      setProjectBoardPlanBusy(false);
    }
  }

  async function generatePlannerDurableArtifact(artifact: PlannerPlanArtifact) {
    if (!state) return;
    setError(undefined);
    try {
      const updated = await window.ambientDesktop.generatePlannerDurableArtifact({ artifactId: artifact.id });
      setState((current) =>
        current
          ? {
              ...current,
              plannerPlanArtifacts: current.plannerPlanArtifacts.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current,
      );
      if (updated.durableArtifactPath) previewArtifact(updated.durableArtifactPath);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function createProjectBoardCard(boardId: string) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.createProjectBoardCard({ boardId });
      applyProjectBoardState(next);
      return next;
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
      return undefined;
    }
  }

  async function reviseProjectBoard(boardId: string) {
    setProjectBoardRevisionBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.reviseProjectBoard({ boardId });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    } finally {
      setProjectBoardRevisionBusy(false);
    }
  }

  async function cancelProjectBoardRevision(boardId: string) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.cancelProjectBoardRevision({ boardId });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  function requestProjectBoardReset(project: ProjectSummary) {
    if (!project.board) return;
    setProjectBoardResetDialog({ project, board: project.board });
  }

  async function confirmProjectBoardReset() {
    if (!projectBoardResetDialog || projectBoardResetDialog.busy) return;
    const dialog = projectBoardResetDialog;
    setError(undefined);
    setProjectBoardResetDialog((current) => (current ? { ...current, busy: true } : current));
    try {
      if (typeof window.ambientDesktop.resetProjectBoard !== "function") {
        throw new Error(PROJECT_BOARD_RESET_BRIDGE_UNAVAILABLE_MESSAGE);
      }
      const next = await window.ambientDesktop.resetProjectBoard({ boardId: dialog.board.id });
      applyProjectBoardState(next);
      setProjectBoardResetDialog(undefined);
    } catch (error) {
      const message = projectBoardActionErrorMessage(error);
      setProjectBoardResetDialog((current) => (current ? { ...current, busy: false, error: message } : current));
      setError(message);
    }
  }

  async function attachProjectBoardLocalTask(taskId: string, mode: AttachProjectBoardLocalTaskMode) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.attachProjectBoardLocalTask({ taskId, mode });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function updateProjectBoardCardCandidate(card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.updateProjectBoardCardCandidate({ cardId: card.id, candidateStatus });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function updateProjectBoardCard(input: UpdateProjectBoardCardInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.updateProjectBoardCard(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function addProjectBoardCardRunFeedback(input: AddProjectBoardCardRunFeedbackInput) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.addProjectBoardCardRunFeedback(input);
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function copyProjectBoardSessionToThread(input: CopyProjectBoardSessionToThreadInput) {
    const previousWorkspacePath = activeWorkspacePath;
    setError(undefined);
    try {
      const next = await window.ambientDesktop.copyProjectBoardSessionToThread(input);
      applyCreatedThreadState(next, previousWorkspacePath);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
      throw error;
    }
  }

  async function answerProjectBoardQuestion(question: ProjectBoardQuestion, answer: string) {
    setError(undefined);
    try {
      const next = await window.ambientDesktop.answerProjectBoardQuestion({ questionId: question.id, answer });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    }
  }

  async function finalizeProjectBoardKickoff(boardId: string) {
    setProjectBoardFinalizeBusy(true);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.finalizeProjectBoardKickoff({ boardId });
      applyProjectBoardState(next);
    } catch (error) {
      setError(projectBoardActionErrorMessage(error));
    } finally {
      setProjectBoardFinalizeBusy(false);
    }
  }

  async function openProjectBoardRunThread(threadId: string, workspacePath?: string) {
    setProjectBoardOpen(false);
    setSidebarArea("projects");
    return selectThread(threadId, workspacePath);
  }

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
