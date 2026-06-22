import { useRef } from "react";

import { createAppProjectBoardActions } from "./AppProjectBoardActions";
import { useAppProjectBoardShellControls } from "./AppProjectBoardShellControls";
import { useAppWorkspaceProjectModel } from "./AppWorkspaceProjectModel";

type WorkspaceProjectModelOptions = Parameters<typeof useAppWorkspaceProjectModel>[0];
type ProjectBoardShellOptions = Parameters<typeof useAppProjectBoardShellControls>[0];
type ProjectBoardActionsOptions = Parameters<typeof createAppProjectBoardActions>[0];
type ProjectBoardActions = ReturnType<typeof createAppProjectBoardActions>;

export interface AppProjectBoardControlsOptions {
  activeThread: ProjectBoardActionsOptions["activeThread"];
  activeThreadId: ProjectBoardShellOptions["activeThreadId"];
  activeWorkspacePath: string | undefined;
  applyCreatedThreadState: ProjectBoardActionsOptions["applyCreatedThreadState"];
  applyProjectActionState: ProjectBoardActionsOptions["applyProjectActionState"];
  contextUsage: WorkspaceProjectModelOptions["contextUsage"];
  error: WorkspaceProjectModelOptions["error"];
  plannerPlanArtifacts: WorkspaceProjectModelOptions["plannerPlanArtifacts"];
  previewArtifact: ProjectBoardActionsOptions["previewArtifact"];
  projects: WorkspaceProjectModelOptions["projects"];
  projectBoardBusyProjectIds: ProjectBoardActionsOptions["projectBoardBusyProjectIds"];
  projectBoardKickoffDefaultsBusy: ProjectBoardActionsOptions["projectBoardKickoffDefaultsBusy"];
  projectBoardResetDialog: ProjectBoardActionsOptions["projectBoardResetDialog"];
  selectProject: ProjectBoardActionsOptions["selectProject"];
  selectThread: ProjectBoardActionsOptions["selectThread"];
  setError: ProjectBoardActionsOptions["setError"];
  setProjectBoardBusyProjectIds: ProjectBoardActionsOptions["setProjectBoardBusyProjectIds"];
  setProjectBoardFinalizeBusy: ProjectBoardActionsOptions["setProjectBoardFinalizeBusy"];
  setProjectBoardKickoffDefaultsBusy: ProjectBoardActionsOptions["setProjectBoardKickoffDefaultsBusy"];
  setProjectBoardProposalAnswerBusy: ProjectBoardActionsOptions["setProjectBoardProposalAnswerBusy"];
  setProjectBoardProposalApplyBusy: ProjectBoardActionsOptions["setProjectBoardProposalApplyBusy"];
  setProjectBoardProposalCardReviewBusy: ProjectBoardActionsOptions["setProjectBoardProposalCardReviewBusy"];
  setProjectBoardRefineBusy: ProjectBoardActionsOptions["setProjectBoardRefineBusy"];
  setProjectBoardRefineMode: ProjectBoardActionsOptions["setProjectBoardRefineMode"];
  setProjectBoardResetDialog: ProjectBoardActionsOptions["setProjectBoardResetDialog"];
  setProjectBoardRevisionBusy: ProjectBoardActionsOptions["setProjectBoardRevisionBusy"];
  setProjectBoardSourceBusy: ProjectBoardActionsOptions["setProjectBoardSourceBusy"];
  setProjectBoardSourceImpactBusy: ProjectBoardActionsOptions["setProjectBoardSourceImpactBusy"];
  setProjectBoardSynthesisDeferBusy: ProjectBoardActionsOptions["setProjectBoardSynthesisDeferBusy"];
  setProjectBoardSynthesisPauseBusy: ProjectBoardActionsOptions["setProjectBoardSynthesisPauseBusy"];
  setProjectBoardSynthesisRetryBusy: ProjectBoardActionsOptions["setProjectBoardSynthesisRetryBusy"];
  setSidebarArea: ProjectBoardActionsOptions["setSidebarArea"];
  setState: ProjectBoardActionsOptions["setState"];
  state: ProjectBoardActionsOptions["state"];
  workspaceName: ProjectBoardShellOptions["workspaceName"];
  workspacePath: WorkspaceProjectModelOptions["workspacePath"];
}

export function useAppProjectBoardControls({
  activeThread,
  activeThreadId,
  activeWorkspacePath,
  applyCreatedThreadState,
  applyProjectActionState,
  contextUsage,
  error,
  plannerPlanArtifacts,
  previewArtifact,
  projects,
  projectBoardBusyProjectIds,
  projectBoardKickoffDefaultsBusy,
  projectBoardResetDialog,
  selectProject,
  selectThread,
  setError,
  setProjectBoardBusyProjectIds,
  setProjectBoardFinalizeBusy,
  setProjectBoardKickoffDefaultsBusy,
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
  workspaceName,
  workspacePath,
}: AppProjectBoardControlsOptions) {
  const projectBoardActionsRef = useRef<ProjectBoardActions | undefined>(undefined);
  const workspaceProjectModel = useAppWorkspaceProjectModel({
    activeWorkspacePath,
    contextUsage,
    error,
    plannerPlanArtifacts,
    projects,
    workspacePath,
  });
  const projectBoardShellControls = useAppProjectBoardShellControls({
    activeProject: workspaceProjectModel.activeProject,
    activeThread,
    activeThreadId,
    activeWorkspacePath,
    projectBoardBusyProjectIds,
    readyPlannerPlanArtifacts: workspaceProjectModel.readyPlannerPlanArtifacts,
    workspaceName,
    workspacePath,
    onAddPlannerPlanToBoard: (artifact) => projectBoardActionsRef.current?.addPlannerPlanToBoard(artifact),
    onBuildProjectBoard: (project) => projectBoardActionsRef.current?.buildProjectBoard(project),
    onOpenProjectBoard: (project) => projectBoardActionsRef.current?.openProjectBoard(project),
  });
  const projectBoardActions = createAppProjectBoardActions({
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
    setProjectBoardOpen: projectBoardShellControls.setProjectBoardOpen,
    setProjectBoardPlanBusy: projectBoardShellControls.setProjectBoardPlanBusy,
    setProjectBoardPlanPickerOpen: projectBoardShellControls.setProjectBoardPlanPickerOpen,
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
  });
  projectBoardActionsRef.current = projectBoardActions;

  return {
    ...workspaceProjectModel,
    ...projectBoardShellControls,
    projectBoardActions,
  };
}
