import type {
  Dispatch,
  SetStateAction,
} from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ExportChatPdfInput } from "../../shared/threadTypes";
import type { AppProjectBoardActions } from "./AppProjectBoardActions";
import type { AppShellSidebarProps } from "./AppShellSidebar";
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
