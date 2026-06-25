import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type {
  AddProjectBoardCardRunFeedbackInput,
  AttachProjectBoardLocalTaskMode,
  CopyProjectBoardSessionToThreadInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardQuestion,
  ProjectSummary,
  UpdateProjectBoardCardInput,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardResetDialogState } from "./AppActionDialogs";
import { projectBoardActionErrorMessage } from "./AppProjectBoardActionSupport";
import type { SidebarArea } from "./AppShellSidebar";

export const PROJECT_BOARD_RESET_BRIDGE_UNAVAILABLE_MESSAGE =
  "Reset Board requires a fresh Ambient Desktop window so the updated main/preload bridge is active.";

export function projectBoardBusyProjectIdsWith(current: Set<string>, projectId: string, busy: boolean): Set<string> {
  const next = new Set(current);
  if (busy) next.add(projectId);
  else next.delete(projectId);
  return next;
}

export function createAppProjectBoardLifecycleActions({
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
}: {
  activeWorkspacePath: string | undefined;
  applyCreatedThreadState: (next: DesktopState, previousWorkspacePath?: string) => boolean;
  applyProjectBoardState: (next: DesktopState) => void;
  projectBoardBusyProjectIds: Set<string>;
  projectBoardResetDialog: ProjectBoardResetDialogState | undefined;
  previewArtifact: (path: string) => void;
  selectProject: (workspacePath: string) => Promise<void>;
  selectThread: (threadId: string, workspacePath?: string) => Promise<void>;
  setError: (message: string | undefined) => void;
  setProjectBoardBusyProjectIds: Dispatch<SetStateAction<Set<string>>>;
  setProjectBoardFinalizeBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardOpen: Dispatch<SetStateAction<boolean>>;
  setProjectBoardPlanBusy: Dispatch<SetStateAction<boolean>>;
  setProjectBoardPlanPickerOpen: Dispatch<SetStateAction<boolean>>;
  setProjectBoardResetDialog: Dispatch<SetStateAction<ProjectBoardResetDialogState | undefined>>;
  setProjectBoardRevisionBusy: Dispatch<SetStateAction<boolean>>;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState | undefined;
  suppressesProjectBoard: () => boolean;
}) {
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
  };
}

export type AppProjectBoardLifecycleActions = ReturnType<typeof createAppProjectBoardLifecycleActions>;
