import type {
  Dispatch,
  SetStateAction,
} from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ExportChatPdfInput } from "../../shared/threadTypes";
import type { createAppNavigationActionsForApp } from "./AppNavigationActions";
import type { AppProjectBoardActions } from "./AppProjectBoardActions";
import type { useAppProjectBoardControls } from "./AppProjectBoardControls";
import type { useAppAutomationShellState } from "./AppAutomationShellState";
import type { useAppProjectShellState } from "./AppProjectShellState";
import type { AppShellSidebarProps } from "./AppShellSidebar";
import type { AppSidebarSelectionModel } from "./AppSidebarSelectionModel";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppShellUiState } from "./AppShellUiState";
import type { useAppRightPanelState } from "./AppRightPanelState";
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./sidebarLayout";

type Setter<T> = Dispatch<SetStateAction<T>>;
type MaybePromise<T = unknown> = T | Promise<T>;
type AdaptedSidebarPropKey =
  | "minWidth"
  | "maxWidth"
  | "activeProjectPath"
  | "activeThreadId"
  | "workflowRecordingLibrary"
  | "selectedWorkflowAgentFolderId"
  | "onCloseSidebar"
  | "onPrimaryCreate"
  | "onToggleProjectsCollapsed"
  | "onToggleProjectPopover"
  | "onCreateWorkspace"
  | "onOpenWorkspace"
  | "onBuildProjectBoard"
  | "onCloseProjectBoard"
  | "onOpenProjectBoard"
  | "onToggleAutomationsCollapsed"
  | "onToggleAutomationPopover"
  | "onRefreshWorkflowAgentFolders"
  | "onComposeInWorkflowAgentFolder"
  | "onToggleProjectPinned"
  | "onRevealProject"
  | "onCreatePermanentProjectWorktree"
  | "onToggleThreadPinned"
  | "onMarkThreadUnread"
  | "onRevealThread"
  | "onCopyThreadWorkingDirectory"
  | "onCopyThreadSessionId"
  | "onCopyThreadDeeplink"
  | "onExportThreadPdf"
  | "onOpenThreadMiniWindow";

export type AppShellSidebarPropsInput = Omit<AppShellSidebarProps, AdaptedSidebarPropKey> & {
  createPermanentProjectWorktree: AppShellSidebarProps["onCreatePermanentProjectWorktree"];
  createWorkspace: () => MaybePromise;
  exportChatPdfThread: (input: ExportChatPdfInput | undefined) => MaybePromise;
  loadWorkflowAgentFolders: () => MaybePromise;
  openNewWorkflowComposer: (folderId?: string) => void;
  openThreadMiniWindow: () => MaybePromise;
  openWorkspace: () => MaybePromise;
  projectBoardActions: Pick<AppProjectBoardActions, "buildProjectBoard" | "openProjectBoard">;
  revealProject: AppShellSidebarProps["onRevealProject"];
  revealThread: () => MaybePromise;
  runPrimaryCreateAction: () => MaybePromise;
  selectedWorkflowAgentFolder?: { id?: string };
  setAutomationPopover: Setter<AppShellSidebarProps["automationPopover"]>;
  setAutomationsCollapsed: Setter<boolean>;
  setProjectBoardOpen: Setter<boolean>;
  setProjectPopover: Setter<AppShellSidebarProps["projectPopover"]>;
  setProjectsCollapsed: Setter<boolean>;
  setSidebarOpen: Setter<boolean>;
  setThreadContextMenu: Setter<AppShellSidebarProps["threadContextMenu"]>;
  state: DesktopState;
  threadActionInput: (threadContextMenu: AppShellSidebarProps["threadContextMenu"]) => ExportChatPdfInput | undefined;
  toggleProjectPinned: AppShellSidebarProps["onToggleProjectPinned"];
  toggleThreadPinned: () => MaybePromise;
  copyThreadWorkingDirectory: () => MaybePromise;
  copyThreadSessionId: () => MaybePromise;
  copyThreadDeeplink: () => MaybePromise;
  markThreadUnread: () => MaybePromise;
};

export type AppShellSidebarPropsForAppInput = {
  automationShellState: ReturnType<typeof useAppAutomationShellState>;
  beginSidebarResize: AppShellSidebarProps["onBeginResize"];
  exportChatPdfThread: AppShellSidebarPropsInput["exportChatPdfThread"];
  navigationActions: ReturnType<typeof createAppNavigationActionsForApp>;
  projectBoardControls: Pick<
    ReturnType<typeof useAppProjectBoardControls>,
    "activeThreadSuppressesProjectBoard" | "projectBoardActions" | "projectBoardOpen" | "setProjectBoardOpen"
  >;
  projectShellState: ReturnType<typeof useAppProjectShellState>;
  rightPanelState: Pick<ReturnType<typeof useAppRightPanelState>, "openPanel">;
  runActivityState: Pick<ReturnType<typeof useAppRunActivityState>, "threadRunStatuses">;
  selectionModel: AppSidebarSelectionModel;
  selectedWorkflowRecordingId: string | undefined;
  shellUiState: Pick<
    ReturnType<typeof useAppShellUiState>,
    "sidebarArea" | "sidebarWidth" | "setSidebarOpen"
  >;
  state: DesktopState;
};

export function createAppShellSidebarProps({
  copyThreadDeeplink,
  copyThreadSessionId,
  copyThreadWorkingDirectory,
  createPermanentProjectWorktree,
  createWorkspace,
  exportChatPdfThread,
  loadWorkflowAgentFolders,
  markThreadUnread,
  openNewWorkflowComposer,
  openThreadMiniWindow,
  openWorkspace,
  projectBoardActions,
  revealProject,
  revealThread,
  runPrimaryCreateAction,
  selectedWorkflowAgentFolder,
  setAutomationPopover,
  setAutomationsCollapsed,
  setProjectBoardOpen,
  setProjectPopover,
  setProjectsCollapsed,
  setSidebarOpen,
  setThreadContextMenu,
  state,
  threadActionInput,
  toggleProjectPinned,
  toggleThreadPinned,
  ...props
}: AppShellSidebarPropsInput): AppShellSidebarProps {
  return {
    ...props,
    minWidth: MIN_SIDEBAR_WIDTH,
    maxWidth: MAX_SIDEBAR_WIDTH,
    activeProjectPath: state.workspace.path,
    activeThreadId: state.activeThreadId,
    workflowRecordingLibrary: state.workflowRecordingLibrary,
    selectedWorkflowAgentFolderId: selectedWorkflowAgentFolder?.id,
    onCloseSidebar: () => setSidebarOpen(false),
    onPrimaryCreate: () => {
      void runPrimaryCreateAction();
    },
    onToggleProjectsCollapsed: () => setProjectsCollapsed((collapsed) => !collapsed),
    onToggleProjectPopover: (popover) => setProjectPopover((current) => (current === popover ? undefined : popover)),
    onCreateWorkspace: () => {
      setProjectPopover(undefined);
      void createWorkspace();
    },
    onOpenWorkspace: () => {
      setProjectPopover(undefined);
      void openWorkspace();
    },
    onBuildProjectBoard: (project) => {
      void projectBoardActions.buildProjectBoard(project);
    },
    onCloseProjectBoard: () => setProjectBoardOpen(false),
    onOpenProjectBoard: (project) => {
      void projectBoardActions.openProjectBoard(project);
    },
    onToggleAutomationsCollapsed: () => setAutomationsCollapsed((collapsed) => !collapsed),
    onToggleAutomationPopover: (popover) => setAutomationPopover((current) => (current === popover ? undefined : popover)),
    onRefreshWorkflowAgentFolders: () => {
      void loadWorkflowAgentFolders();
    },
    onComposeInWorkflowAgentFolder: (folderId) => openNewWorkflowComposer(folderId),
    onToggleProjectPinned: (project) => {
      void toggleProjectPinned(project);
    },
    onRevealProject: (project) => {
      void revealProject(project);
    },
    onCreatePermanentProjectWorktree: (project) => {
      void createPermanentProjectWorktree(project);
    },
    onToggleThreadPinned: () => {
      void toggleThreadPinned();
    },
    onMarkThreadUnread: () => {
      void markThreadUnread();
    },
    onRevealThread: () => {
      void revealThread();
    },
    onCopyThreadWorkingDirectory: () => {
      void copyThreadWorkingDirectory();
    },
    onCopyThreadSessionId: () => {
      void copyThreadSessionId();
    },
    onCopyThreadDeeplink: () => {
      void copyThreadDeeplink();
    },
    onExportThreadPdf: () => {
      const input = threadActionInput(props.threadContextMenu);
      setThreadContextMenu(undefined);
      void exportChatPdfThread(input);
    },
    onOpenThreadMiniWindow: () => {
      void openThreadMiniWindow();
    },
  };
}

export function createAppShellSidebarPropsForApp({
  automationShellState,
  beginSidebarResize,
  exportChatPdfThread,
  navigationActions,
  projectBoardControls,
  projectShellState,
  rightPanelState,
  runActivityState,
  selectionModel,
  selectedWorkflowRecordingId,
  shellUiState,
  state,
}: AppShellSidebarPropsForAppInput): AppShellSidebarProps {
  return createAppShellSidebarProps({
    activeThreadSuppressesProjectBoard: projectBoardControls.activeThreadSuppressesProjectBoard,
    automationPopover: automationShellState.automationPopover,
    automationsCollapsed: automationShellState.automationsCollapsed,
    copyThreadDeeplink: navigationActions.copyThreadDeeplink,
    copyThreadSessionId: navigationActions.copyThreadSessionId,
    copyThreadWorkingDirectory: navigationActions.copyThreadWorkingDirectory,
    createPermanentProjectWorktree: navigationActions.createPermanentProjectWorktree,
    createWorkspace: navigationActions.createWorkspace,
    exportChatPdfThread,
    loadWorkflowAgentFolders: navigationActions.loadWorkflowAgentFolders,
    markThreadUnread: navigationActions.markThreadUnread,
    onArchiveProjectChats: navigationActions.archiveProjectChats,
    onArchiveThread: navigationActions.archiveThread,
    onBeginResize: beginSidebarResize,
    onCreateThreadInProject: navigationActions.createThreadInProject,
    onCreateWorkflowAgentFolder: navigationActions.createWorkflowAgentFolder,
    onForkThread: navigationActions.forkThread,
    onOpenPanel: rightPanelState.openPanel,
    onOpenProjectContextMenu: navigationActions.openProjectContextMenu,
    onOpenSidebarArea: navigationActions.openSidebarArea,
    onOpenThreadContextMenu: navigationActions.openThreadContextMenu,
    onOpenWorkflowLabArea: navigationActions.openWorkflowLabArea,
    onOpenWorkflowRecordingsArea: navigationActions.openWorkflowRecordingsArea,
    onOrganizeChange: automationShellState.updateSidebarOrganize,
    onRemoveProject: navigationActions.removeProject,
    onRenameProject: navigationActions.renameProject,
    onRenameThread: navigationActions.renameThread,
    onSelectProject: navigationActions.selectProject,
    onSelectThread: navigationActions.selectThread,
    onSelectWorkflowAgentFolder: navigationActions.selectWorkflowAgentFolder,
    onSelectWorkflowAgentThread: navigationActions.selectWorkflowAgentThread,
    onSelectWorkflowRecording: navigationActions.selectWorkflowRecordingForSidebar,
    openNewWorkflowComposer: navigationActions.openNewWorkflowComposer,
    openThreadMiniWindow: navigationActions.openThreadMiniWindow,
    openWorkspace: navigationActions.openWorkspace,
    projectBoardActions: projectBoardControls.projectBoardActions,
    projectBoardBusyProjectIds: projectShellState.projectBoardBusyProjectIds,
    projectBoardOpen: projectBoardControls.projectBoardOpen,
    projectContextMenu: projectShellState.projectContextMenu,
    projectPopover: projectShellState.projectPopover,
    projectsCollapsed: projectShellState.projectsCollapsed,
    revealProject: navigationActions.revealProject,
    revealThread: navigationActions.revealThread,
    runPrimaryCreateAction: navigationActions.runPrimaryCreateAction,
    selectedAutomationPane: automationShellState.selectedAutomationPane,
    selectedWorkflowAgentFolder: selectionModel.selectedWorkflowAgentFolder,
    selectedWorkflowAgentThreadId: automationShellState.selectedWorkflowAgentThreadId,
    selectedWorkflowRecordingId,
    setAutomationPopover: automationShellState.setAutomationPopover,
    setAutomationsCollapsed: automationShellState.setAutomationsCollapsed,
    setProjectBoardOpen: projectBoardControls.setProjectBoardOpen,
    setProjectPopover: projectShellState.setProjectPopover,
    setProjectsCollapsed: projectShellState.setProjectsCollapsed,
    setSidebarOpen: shellUiState.setSidebarOpen,
    setThreadContextMenu: projectShellState.setThreadContextMenu,
    sidebarAgeNow: automationShellState.sidebarAgeNow,
    sidebarArea: shellUiState.sidebarArea,
    sidebarOrganize: automationShellState.sidebarOrganize,
    sidebarProjects: selectionModel.sidebarProjects,
    sidebarThreads: selectionModel.sidebarThreads,
    state,
    threadActionInput: navigationActions.threadActionInput,
    threadContextMenu: projectShellState.threadContextMenu,
    threadRunStatuses: runActivityState.threadRunStatuses,
    toggleProjectPinned: navigationActions.toggleProjectPinned,
    toggleThreadPinned: navigationActions.toggleThreadPinned,
    width: shellUiState.sidebarWidth,
    workflowAgentFolders: automationShellState.workflowAgentFolders,
    workflowAgentNavigationError: automationShellState.workflowAgentNavigationError,
  });
}
