import { useRef } from "react";

import { createAppProjectBoardActions } from "./AppProjectBoardActions";
import type { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import type { createAppNavigationActionsForApp } from "./AppNavigationActions";
import { useAppProjectBoardShellControls } from "./AppProjectBoardShellControls";
import type { useAppProjectShellState } from "./AppProjectShellState";
import type { useAppRightPanelState } from "./AppRightPanelState";
import type { useAppShellUiState } from "./AppShellUiState";
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

type AppDesktopStateAppliersForProjectBoardControls = Pick<
  ReturnType<typeof createAppDesktopStateAppliers>,
  "applyCreatedThreadState" | "applyProjectActionState"
>;

type AppNavigationActionsForProjectBoardControls = Pick<
  ReturnType<typeof createAppNavigationActionsForApp>,
  "selectProject" | "selectThread"
>;

type AppProjectShellStateForProjectBoardControls = Pick<
  ReturnType<typeof useAppProjectShellState>,
  | "projectBoardBusyProjectIds"
  | "projectBoardFinalizeBusy"
  | "projectBoardKickoffDefaultsBusy"
  | "projectBoardProposalAnswerBusy"
  | "projectBoardProposalApplyBusy"
  | "projectBoardProposalCardReviewBusy"
  | "projectBoardRefineBusy"
  | "projectBoardRefineMode"
  | "projectBoardResetDialog"
  | "projectBoardRevisionBusy"
  | "projectBoardSourceBusy"
  | "projectBoardSourceImpactBusy"
  | "projectBoardSynthesisDeferBusy"
  | "projectBoardSynthesisPauseBusy"
  | "projectBoardSynthesisRetryBusy"
  | "setProjectBoardBusyProjectIds"
  | "setProjectBoardFinalizeBusy"
  | "setProjectBoardKickoffDefaultsBusy"
  | "setProjectBoardProposalAnswerBusy"
  | "setProjectBoardProposalApplyBusy"
  | "setProjectBoardProposalCardReviewBusy"
  | "setProjectBoardRefineBusy"
  | "setProjectBoardRefineMode"
  | "setProjectBoardResetDialog"
  | "setProjectBoardRevisionBusy"
  | "setProjectBoardSourceBusy"
  | "setProjectBoardSourceImpactBusy"
  | "setProjectBoardSynthesisDeferBusy"
  | "setProjectBoardSynthesisPauseBusy"
  | "setProjectBoardSynthesisRetryBusy"
>;

type AppRightPanelStateForProjectBoardControls = Pick<ReturnType<typeof useAppRightPanelState>, "previewArtifact">;

type AppShellUiStateForProjectBoardControls = Pick<
  ReturnType<typeof useAppShellUiState>,
  "error" | "setError" | "setSidebarArea"
>;

export type AppProjectBoardControlsForAppInput = {
  activeThread: AppProjectBoardControlsOptions["activeThread"];
  appDesktopStateAppliers: AppDesktopStateAppliersForProjectBoardControls;
  navigationActions: AppNavigationActionsForProjectBoardControls;
  projectShellState: AppProjectShellStateForProjectBoardControls;
  rightPanelState: AppRightPanelStateForProjectBoardControls;
  setState: AppProjectBoardControlsOptions["setState"];
  shellUiState: AppShellUiStateForProjectBoardControls;
  state: AppProjectBoardControlsOptions["state"];
};

export function useAppProjectBoardControlsForApp({
  activeThread,
  appDesktopStateAppliers,
  navigationActions,
  projectShellState,
  rightPanelState,
  setState,
  shellUiState,
  state,
}: AppProjectBoardControlsForAppInput) {
  return useAppProjectBoardControls({
    activeThread,
    activeThreadId: state?.activeThreadId,
    activeWorkspacePath: state?.activeWorkspace.path,
    applyCreatedThreadState: appDesktopStateAppliers.applyCreatedThreadState,
    applyProjectActionState: appDesktopStateAppliers.applyProjectActionState,
    contextUsage: state?.contextUsage,
    error: shellUiState.error,
    plannerPlanArtifacts: state?.plannerPlanArtifacts,
    previewArtifact: rightPanelState.previewArtifact,
    projects: state?.projects,
    projectBoardBusyProjectIds: projectShellState.projectBoardBusyProjectIds,
    projectBoardKickoffDefaultsBusy: projectShellState.projectBoardKickoffDefaultsBusy,
    projectBoardResetDialog: projectShellState.projectBoardResetDialog,
    selectProject: navigationActions.selectProject,
    selectThread: navigationActions.selectThread,
    setError: shellUiState.setError,
    setProjectBoardBusyProjectIds: projectShellState.setProjectBoardBusyProjectIds,
    setProjectBoardFinalizeBusy: projectShellState.setProjectBoardFinalizeBusy,
    setProjectBoardKickoffDefaultsBusy: projectShellState.setProjectBoardKickoffDefaultsBusy,
    setProjectBoardProposalAnswerBusy: projectShellState.setProjectBoardProposalAnswerBusy,
    setProjectBoardProposalApplyBusy: projectShellState.setProjectBoardProposalApplyBusy,
    setProjectBoardProposalCardReviewBusy: projectShellState.setProjectBoardProposalCardReviewBusy,
    setProjectBoardRefineBusy: projectShellState.setProjectBoardRefineBusy,
    setProjectBoardRefineMode: projectShellState.setProjectBoardRefineMode,
    setProjectBoardResetDialog: projectShellState.setProjectBoardResetDialog,
    setProjectBoardRevisionBusy: projectShellState.setProjectBoardRevisionBusy,
    setProjectBoardSourceBusy: projectShellState.setProjectBoardSourceBusy,
    setProjectBoardSourceImpactBusy: projectShellState.setProjectBoardSourceImpactBusy,
    setProjectBoardSynthesisDeferBusy: projectShellState.setProjectBoardSynthesisDeferBusy,
    setProjectBoardSynthesisPauseBusy: projectShellState.setProjectBoardSynthesisPauseBusy,
    setProjectBoardSynthesisRetryBusy: projectShellState.setProjectBoardSynthesisRetryBusy,
    setSidebarArea: shellUiState.setSidebarArea,
    setState,
    state,
    workspaceName: state?.workspace.name,
    workspacePath: state?.workspace.path,
  });
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
