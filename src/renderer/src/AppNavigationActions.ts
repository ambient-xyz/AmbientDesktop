import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import { createAppAutomationFolderControls } from "./AppAutomationFolderControls";
import { createAppAutomationSelectionControls } from "./AppAutomationSelectionControls";
import type { useAppAutomationShellState } from "./AppAutomationShellState";
import type { useAppComposerShellState } from "./AppComposerShellState";
import { createAppProjectThreadActions } from "./AppProjectThreadActions";
import type { useAppProjectShellState } from "./AppProjectShellState";
import type { useAppRightPanelState } from "./AppRightPanelState";
import type { useAppRunActivityState } from "./AppRunActivityState";
import { createAppSidebarAreaControls } from "./AppSidebarAreaControls";
import type { useAppShellUiState } from "./AppShellUiState";
import { createAppWorkflowComposerNavigation } from "./AppWorkflowComposerNavigation";
import { createAppWorkspaceNavigationControls } from "./AppWorkspaceNavigationControls";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";

export type AppNavigationActionsForAppInput = {
  automationShellState: ReturnType<typeof useAppAutomationShellState>;
  closeProjectBoard: () => void;
  composerShellState: ReturnType<typeof useAppComposerShellState>;
  projectShellState: ReturnType<typeof useAppProjectShellState>;
  rememberDesktopState: Parameters<typeof createAppWorkspaceNavigationControls>[0]["rememberDesktopState"];
  rightPanelState: Pick<ReturnType<typeof useAppRightPanelState>, "setRightPanel">;
  runActivityState: Pick<
    ReturnType<typeof useAppRunActivityState>,
    "setRunStatus" | "setThreadRunStatuses" | "threadRunStatuses"
  >;
  setSelectedWorkflowRecordingId: Dispatch<SetStateAction<string | undefined>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  shellUiState: Pick<ReturnType<typeof useAppShellUiState>, "setError" | "setSidebarArea" | "sidebarArea">;
  state: DesktopState | undefined;
  workspaceShellState: Pick<ReturnType<typeof useAppWorkspaceShellState>, "setWorkspaceRevision">;
  applyCreatedThreadState: Parameters<typeof createAppWorkspaceNavigationControls>[0]["applyCreatedThreadState"];
  applyProjectActionState: Parameters<typeof createAppProjectThreadActions>[0]["applyProjectActionState"];
};

export function createAppNavigationActionsForApp(input: AppNavigationActionsForAppInput) {
  const {
    automationShellState,
    composerShellState,
    projectShellState,
    rightPanelState,
    runActivityState,
    shellUiState,
    workspaceShellState,
  } = input;

  const projectThreadActions = createAppProjectThreadActions({
    applyProjectActionState: input.applyProjectActionState,
    projectActionDialog: projectShellState.projectActionDialog,
    projects: input.state?.projects,
    setError: shellUiState.setError,
    setProjectActionDialog: projectShellState.setProjectActionDialog,
    setProjectContextMenu: projectShellState.setProjectContextMenu,
    setProjectPopover: projectShellState.setProjectPopover,
    setThreadActionDialog: projectShellState.setThreadActionDialog,
    setThreadContextMenu: projectShellState.setThreadContextMenu,
    threadActionDialog: projectShellState.threadActionDialog,
    threadContextMenu: projectShellState.threadContextMenu,
  });

  const automationFolderControls = createAppAutomationFolderControls({
    selectedAutomationFolderId: automationShellState.selectedAutomationFolderId,
    selectedAutomationThreadId: automationShellState.selectedAutomationThreadId,
    selectedWorkflowAgentFolderId: automationShellState.selectedWorkflowAgentFolderId,
    selectedWorkflowAgentThreadId: automationShellState.selectedWorkflowAgentThreadId,
    setAutomationFolders: automationShellState.setAutomationFolders,
    setAutomationNavigationError: automationShellState.setAutomationNavigationError,
    setAutomationPopover: automationShellState.setAutomationPopover,
    setSelectedAutomationFolderId: automationShellState.setSelectedAutomationFolderId,
    setSelectedAutomationThreadId: automationShellState.setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId: automationShellState.setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId: automationShellState.setSelectedWorkflowAgentThreadId,
    setWorkflowAgentFolders: automationShellState.setWorkflowAgentFolders,
    setWorkflowAgentNavigationError: automationShellState.setWorkflowAgentNavigationError,
  });

  const { loadAutomationFolders, loadWorkflowAgentFolders } = automationFolderControls;
  const { openNewWorkflowComposer } = createAppWorkflowComposerNavigation({
    loadWorkflowAgentFolders,
    setAutomationPopover: automationShellState.setAutomationPopover,
    setProjectPopover: projectShellState.setProjectPopover,
    setRightPanel: rightPanelState.setRightPanel,
    setSelectedAutomationPane: automationShellState.setSelectedAutomationPane,
    setSelectedAutomationThreadId: automationShellState.setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId: automationShellState.setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId: automationShellState.setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId: input.setSelectedWorkflowRecordingId,
    setSidebarArea: shellUiState.setSidebarArea,
  });

  const workspaceNavigationControls = createAppWorkspaceNavigationControls({
    activeWorkspacePath: input.state?.activeWorkspace.path,
    applyCreatedThreadState: input.applyCreatedThreadState,
    closeProjectBoard: input.closeProjectBoard,
    currentWorkspacePath: input.state?.workspace.path,
    openNewWorkflowComposer,
    projectIdForWorkspacePath: projectThreadActions.projectIdForWorkspacePath,
    rememberDesktopState: input.rememberDesktopState,
    scheduleComposerFocusEnd: () => {
      window.setTimeout(() => composerShellState.composerInputRef.current?.focusEnd(), 0);
    },
    setComposerDraft: composerShellState.setComposerDraft,
    setProjectPopover: projectShellState.setProjectPopover,
    setProjectsCollapsed: projectShellState.setProjectsCollapsed,
    setRunStatus: runActivityState.setRunStatus,
    setSidebarArea: shellUiState.setSidebarArea,
    setState: input.setState,
    setThreadRunStatuses: runActivityState.setThreadRunStatuses,
    setWorkspaceRevision: workspaceShellState.setWorkspaceRevision,
    sidebarArea: shellUiState.sidebarArea,
    threadRunStatuses: runActivityState.threadRunStatuses,
  });

  const sidebarAreaControls = createAppSidebarAreaControls({
    sidebarArea: shellUiState.sidebarArea,
    setSidebarArea: shellUiState.setSidebarArea,
    setProjectPopover: projectShellState.setProjectPopover,
    setAutomationPopover: automationShellState.setAutomationPopover,
    setSidebarOrganize: automationShellState.setSidebarOrganize,
    setRightPanel: rightPanelState.setRightPanel,
    setSelectedAutomationPane: automationShellState.setSelectedAutomationPane,
    setSelectedAutomationThreadId: automationShellState.setSelectedAutomationThreadId,
    setSelectedWorkflowAgentThreadId: automationShellState.setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId: input.setSelectedWorkflowRecordingId,
    loadAutomationFolders,
  });

  const automationSelectionControls = createAppAutomationSelectionControls({
    setSidebarArea: shellUiState.setSidebarArea,
    setSelectedAutomationPane: automationShellState.setSelectedAutomationPane,
    setSelectedAutomationFolderId: automationShellState.setSelectedAutomationFolderId,
    setSelectedAutomationThreadId: automationShellState.setSelectedAutomationThreadId,
    setSelectedWorkflowAgentFolderId: automationShellState.setSelectedWorkflowAgentFolderId,
    setSelectedWorkflowAgentThreadId: automationShellState.setSelectedWorkflowAgentThreadId,
    setSelectedWorkflowRecordingId: input.setSelectedWorkflowRecordingId,
    selectThread: workspaceNavigationControls.selectThread,
  });

  return {
    projectThreadActions,
    ...projectThreadActions,
    automationFolderControls,
    ...automationFolderControls,
    openNewWorkflowComposer,
    workspaceNavigationControls,
    ...workspaceNavigationControls,
    sidebarAreaControls,
    ...sidebarAreaControls,
    automationSelectionControls,
    ...automationSelectionControls,
  };
}
