import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  PlannerPlanArtifact,
  ProjectSummary,
} from "../../shared/types";
import type { AppTopbarProjectBoardAction } from "./AppTopbar";
import {
  projectBoardActionState,
  projectBoardSuppressedForWorkflowRecordingThread,
  projectBoardThreadPlanActionState,
  type ProjectBoardThreadPlanActionState,
} from "./projectBoardUiModel";

type ProjectBoardShellThread = {
  workflowRecording?: unknown;
};

export function projectBoardThreadPlanActionForShell({
  busy,
  hasBoard,
  readyPlanCount,
  suppressesProjectBoard,
}: {
  busy: boolean;
  hasBoard: boolean;
  readyPlanCount: number;
  suppressesProjectBoard: boolean;
}): ProjectBoardThreadPlanActionState {
  return projectBoardThreadPlanActionState(hasBoard, suppressesProjectBoard ? 0 : readyPlanCount, busy);
}

export function projectBoardTopbarActionTitle({
  actionTitle,
  actionKind,
  activeWorkspacePath,
  workspaceName,
  workspacePath,
}: {
  actionKind: "build" | "open" | "close";
  actionTitle: string;
  activeWorkspacePath: string;
  workspaceName: string;
  workspacePath: string;
}): string {
  if (actionKind === "close" || activeWorkspacePath === workspacePath) return actionTitle;
  return `${actionTitle}. This opens the project board for ${workspaceName}; this chat is running in ${activeWorkspacePath}.`;
}

export function nextProjectBoardPlanPickerOpen({
  currentOpen,
  disabled,
  readyPlanCount,
  suppressesProjectBoard,
}: {
  currentOpen: boolean;
  disabled: boolean;
  readyPlanCount: number;
  suppressesProjectBoard: boolean;
}): boolean {
  if (suppressesProjectBoard || disabled || readyPlanCount <= 1) return currentOpen;
  return !currentOpen;
}

export function useAppProjectBoardShellControls({
  activeProject,
  activeThread,
  activeThreadId,
  activeWorkspacePath,
  projectBoardBusyProjectIds,
  readyPlannerPlanArtifacts,
  workspaceName,
  workspacePath,
  onAddPlannerPlanToBoard,
  onBuildProjectBoard,
  onOpenProjectBoard,
}: {
  activeProject: ProjectSummary | undefined;
  activeThread: ProjectBoardShellThread | undefined;
  activeThreadId: string | undefined;
  activeWorkspacePath: string | undefined;
  projectBoardBusyProjectIds: Set<string>;
  readyPlannerPlanArtifacts: PlannerPlanArtifact[];
  workspaceName: string | undefined;
  workspacePath: string | undefined;
  onAddPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => Promise<void> | void;
  onBuildProjectBoard: (project: ProjectSummary) => Promise<void> | void;
  onOpenProjectBoard: (project: ProjectSummary) => Promise<void> | void;
}): {
  activeProjectBoardBusy: boolean;
  activeProjectBoardTopbarAction: AppTopbarProjectBoardAction | undefined;
  activeThreadSuppressesProjectBoard: boolean;
  projectBoardOpen: boolean;
  setProjectBoardOpen: Dispatch<SetStateAction<boolean>>;
  projectBoardPlanBusy: boolean;
  setProjectBoardPlanBusy: Dispatch<SetStateAction<boolean>>;
  projectBoardPlanPickerOpen: boolean;
  setProjectBoardPlanPickerOpen: Dispatch<SetStateAction<boolean>>;
  projectBoardThreadPlanAction: ProjectBoardThreadPlanActionState;
  runProjectBoardThreadPlanAction: () => void;
} {
  const [projectBoardOpen, setProjectBoardOpen] = useState(false);
  const [projectBoardPlanBusy, setProjectBoardPlanBusy] = useState(false);
  const [projectBoardPlanPickerOpen, setProjectBoardPlanPickerOpen] = useState(false);
  const activeThreadSuppressesProjectBoard = projectBoardSuppressedForWorkflowRecordingThread(activeThread);
  const activeProjectBoardBusy = activeProject ? projectBoardBusyProjectIds.has(activeProject.id) : false;
  const projectBoardThreadPlanAction = useMemo(
    () =>
      projectBoardThreadPlanActionForShell({
        busy: projectBoardPlanBusy,
        hasBoard: Boolean(activeProject?.board),
        readyPlanCount: readyPlannerPlanArtifacts.length,
        suppressesProjectBoard: activeThreadSuppressesProjectBoard,
      }),
    [activeProject?.board, activeThreadSuppressesProjectBoard, projectBoardPlanBusy, readyPlannerPlanArtifacts.length],
  );
  const activeProjectBoardTopbarAction = useMemo(() => {
    if (!activeProject || activeThreadSuppressesProjectBoard || !workspacePath || !workspaceName || !activeWorkspacePath) return undefined;
    const action = projectBoardActionState(activeProject, workspacePath, activeProjectBoardBusy, projectBoardOpen);
    const title = projectBoardTopbarActionTitle({
      actionKind: action.kind,
      actionTitle: action.title,
      activeWorkspacePath,
      workspaceName,
      workspacePath,
    });
    return {
      kind: action.kind,
      label: action.label,
      title,
      disabled: action.disabled,
      ready: Boolean(activeProject.board),
      active: projectBoardOpen,
      onRun: () => {
        if (action.kind === "build") void onBuildProjectBoard(activeProject);
        else if (action.kind === "close") setProjectBoardOpen(false);
        else void onOpenProjectBoard(activeProject);
      },
    };
  }, [
    activeProject,
    activeProjectBoardBusy,
    activeThreadSuppressesProjectBoard,
    activeWorkspacePath,
    projectBoardOpen,
    workspaceName,
    workspacePath,
    onBuildProjectBoard,
    onOpenProjectBoard,
  ]);

  useEffect(() => {
    setProjectBoardPlanPickerOpen(false);
  }, [activeThreadId, activeProject?.board?.id, readyPlannerPlanArtifacts.length]);

  useEffect(() => {
    if (!activeThreadSuppressesProjectBoard) return;
    setProjectBoardOpen(false);
    setProjectBoardPlanPickerOpen(false);
  }, [activeThreadSuppressesProjectBoard]);

  return {
    activeProjectBoardBusy,
    activeProjectBoardTopbarAction,
    activeThreadSuppressesProjectBoard,
    projectBoardOpen,
    setProjectBoardOpen,
    projectBoardPlanBusy,
    setProjectBoardPlanBusy,
    projectBoardPlanPickerOpen,
    setProjectBoardPlanPickerOpen,
    projectBoardThreadPlanAction,
    runProjectBoardThreadPlanAction() {
      if (activeThreadSuppressesProjectBoard) return;
      if (projectBoardThreadPlanAction.disabled) return;
      if (readyPlannerPlanArtifacts.length === 1) {
        void onAddPlannerPlanToBoard(readyPlannerPlanArtifacts[0]);
        return;
      }
      setProjectBoardPlanPickerOpen((open) =>
        nextProjectBoardPlanPickerOpen({
          currentOpen: open,
          disabled: projectBoardThreadPlanAction.disabled,
          readyPlanCount: readyPlannerPlanArtifacts.length,
          suppressesProjectBoard: activeThreadSuppressesProjectBoard,
        }),
      );
    },
  };
}
