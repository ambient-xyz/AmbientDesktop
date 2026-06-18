import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  ProjectActionDialogState,
  ProjectContextMenuState,
  ThreadActionDialogState,
  ThreadContextMenuState,
} from "./AppActionDialogs";
import type { ProjectPopover } from "./AppSidebar";

export type ThreadActionInput = {
  threadId: string;
  projectId: string;
};

export function clampMenuCoordinate(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function sidebarMenuPosition({
  clientX,
  clientY,
  menuHeight,
  menuWidth,
  viewportHeight,
  viewportWidth,
}: {
  clientX: number;
  clientY: number;
  menuHeight: number;
  menuWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}): { x: number; y: number } {
  return {
    x: clampMenuCoordinate(clientX, 8, Math.max(8, viewportWidth - menuWidth)),
    y: clampMenuCoordinate(clientY, 8, Math.max(8, viewportHeight - menuHeight)),
  };
}

export function projectIdForWorkspacePath(
  projects: readonly ProjectSummary[] | undefined,
  workspacePath: string,
): string {
  const project = projects?.find((item) => item.path === workspacePath);
  if (!project) throw new Error("Project is not registered in this app session.");
  return project.id;
}

export function threadActionInputForMenu(
  menu: ThreadContextMenuState | undefined,
  projects: readonly ProjectSummary[] | undefined,
): ThreadActionInput | undefined {
  if (!menu) return undefined;
  return { threadId: menu.thread.id, projectId: projectIdForWorkspacePath(projects, menu.workspacePath) };
}

export function threadWorkingDirectoryForMenu(thread: ThreadSummary): string {
  return thread.gitWorktree?.status === "active" ? thread.gitWorktree.worktreePath : thread.workspacePath;
}

export function threadSessionIdForMenu(thread: ThreadSummary): string {
  const sessionFileName = thread.piSessionFile?.split(/[\\/]/).pop()?.replace(/\.jsonl$/i, "").trim();
  return sessionFileName || thread.id;
}

export function threadDeeplinkForMenu(menu: Pick<ThreadContextMenuState, "thread" | "workspacePath">): string {
  return `ambient://thread/${encodeURIComponent(menu.thread.id)}?workspace=${encodeURIComponent(menu.workspacePath)}`;
}

export function createAppProjectThreadActions({
  applyProjectActionState,
  projectActionDialog,
  projects,
  setError,
  setProjectActionDialog,
  setProjectContextMenu,
  setProjectPopover,
  setThreadActionDialog,
  setThreadContextMenu,
  threadActionDialog,
  threadContextMenu,
}: {
  applyProjectActionState: (next: DesktopState) => void;
  projectActionDialog: ProjectActionDialogState | undefined;
  projects: readonly ProjectSummary[] | undefined;
  setError: (message: string | undefined) => void;
  setProjectActionDialog: Dispatch<SetStateAction<ProjectActionDialogState | undefined>>;
  setProjectContextMenu: Dispatch<SetStateAction<ProjectContextMenuState | undefined>>;
  setProjectPopover: Dispatch<SetStateAction<ProjectPopover | undefined>>;
  setThreadActionDialog: Dispatch<SetStateAction<ThreadActionDialogState | undefined>>;
  setThreadContextMenu: Dispatch<SetStateAction<ThreadContextMenuState | undefined>>;
  threadActionDialog: ThreadActionDialogState | undefined;
  threadContextMenu: ThreadContextMenuState | undefined;
}): {
  archiveProjectChats: (project: ProjectSummary) => void;
  archiveThread: () => void;
  confirmProjectActionDialog: () => Promise<void>;
  confirmThreadActionDialog: () => Promise<void>;
  copyThreadDeeplink: () => Promise<void>;
  copyThreadSessionId: () => Promise<void>;
  copyThreadWorkingDirectory: () => Promise<void>;
  createPermanentProjectWorktree: (project: ProjectSummary) => Promise<void>;
  forkThread: (mode: "local" | "worktree") => Promise<void>;
  markThreadUnread: () => Promise<void>;
  openProjectContextMenu: (event: ReactMouseEvent<HTMLElement>, project: ProjectSummary) => void;
  openThreadContextMenu: (event: ReactMouseEvent<HTMLElement>, thread: ThreadSummary, workspacePath: string) => void;
  openThreadMiniWindow: () => Promise<void>;
  projectIdForWorkspacePath: (workspacePath: string) => string;
  removeProject: (project: ProjectSummary) => void;
  renameProject: (project: ProjectSummary) => void;
  renameThread: () => void;
  revealProject: (project: ProjectSummary) => Promise<void>;
  revealThread: () => Promise<void>;
  threadActionInput: (menu?: ThreadContextMenuState) => ThreadActionInput | undefined;
  toggleProjectPinned: (project: ProjectSummary) => Promise<void>;
  toggleThreadPinned: () => Promise<void>;
} {
  function projectIdForWorkspacePathForCurrentProjects(workspacePath: string): string {
    return projectIdForWorkspacePath(projects, workspacePath);
  }

  function threadActionInput(menu = threadContextMenu): ThreadActionInput | undefined {
    return threadActionInputForMenu(menu, projects);
  }

  function openProjectContextMenu(event: ReactMouseEvent<HTMLElement>, project: ProjectSummary): void {
    event.preventDefault();
    event.stopPropagation();
    setThreadContextMenu(undefined);
    setProjectPopover(undefined);
    setProjectContextMenu({
      project,
      ...sidebarMenuPosition({
        clientX: event.clientX,
        clientY: event.clientY,
        menuWidth: 280,
        menuHeight: 330,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    });
  }

  function openThreadContextMenu(event: ReactMouseEvent<HTMLElement>, thread: ThreadSummary, workspacePath: string): void {
    event.preventDefault();
    event.stopPropagation();
    setProjectContextMenu(undefined);
    setProjectPopover(undefined);
    setThreadContextMenu({
      thread,
      workspacePath,
      ...sidebarMenuPosition({
        clientX: event.clientX,
        clientY: event.clientY,
        menuWidth: 316,
        menuHeight: 450,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    });
  }

  async function toggleProjectPinned(project: ProjectSummary): Promise<void> {
    setProjectContextMenu(undefined);
    setError(undefined);
    try {
      applyProjectActionState(await window.ambientDesktop.updateProject({ projectId: project.id, pinned: !project.pinned }));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  function renameProject(project: ProjectSummary): void {
    setProjectContextMenu(undefined);
    setProjectActionDialog({ kind: "rename", project, name: project.name });
  }

  async function revealProject(project: ProjectSummary): Promise<void> {
    setProjectContextMenu(undefined);
    setError(undefined);
    try {
      await window.ambientDesktop.revealProject({ projectId: project.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createPermanentProjectWorktree(project: ProjectSummary): Promise<void> {
    setProjectContextMenu(undefined);
    setError(undefined);
    try {
      const next = await window.ambientDesktop.createPermanentProjectWorktree({ projectId: project.id });
      if (next) applyProjectActionState(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  function archiveProjectChats(project: ProjectSummary): void {
    setProjectContextMenu(undefined);
    setProjectActionDialog({ kind: "archive", project });
  }

  function removeProject(project: ProjectSummary): void {
    setProjectContextMenu(undefined);
    setProjectActionDialog({ kind: "remove", project });
  }

  async function confirmProjectActionDialog(): Promise<void> {
    if (!projectActionDialog?.project || projectActionDialog.busy) return;
    const dialog = projectActionDialog;
    const name = dialog.kind === "rename" ? dialog.name.trim() : "";
    if (dialog.kind === "rename" && !name) return;
    setError(undefined);
    setProjectActionDialog((current) => (current ? { ...current, busy: true } : current));
    try {
      const input = { projectId: dialog.project.id };
      const next =
        dialog.kind === "rename"
          ? await window.ambientDesktop.updateProject({ ...input, name })
          : dialog.kind === "archive"
            ? await window.ambientDesktop.archiveProjectChats(input)
            : await window.ambientDesktop.removeProject(input);
      setProjectActionDialog(undefined);
      applyProjectActionState(next);
    } catch (error) {
      setProjectActionDialog((current) => (current ? { ...current, busy: false } : current));
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function toggleThreadPinned(): Promise<void> {
    const input = threadActionInput();
    const thread = threadContextMenu?.thread;
    if (!input || !thread) return;
    setThreadContextMenu(undefined);
    setError(undefined);
    try {
      applyProjectActionState(await window.ambientDesktop.updateThread({ ...input, pinned: !thread.pinned }));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  function renameThread(): void {
    if (!threadContextMenu) return;
    setThreadActionDialog({ kind: "rename", thread: threadContextMenu.thread, workspacePath: threadContextMenu.workspacePath, name: threadContextMenu.thread.title });
    setThreadContextMenu(undefined);
  }

  function archiveThread(): void {
    if (!threadContextMenu) return;
    setThreadActionDialog({ kind: "archive", thread: threadContextMenu.thread, workspacePath: threadContextMenu.workspacePath });
    setThreadContextMenu(undefined);
  }

  async function confirmThreadActionDialog(): Promise<void> {
    if (!threadActionDialog || threadActionDialog.busy) return;
    const dialog = threadActionDialog;
    const name = dialog.kind === "rename" ? dialog.name.trim() : "";
    if (dialog.kind === "rename" && !name) return;
    setError(undefined);
    setThreadActionDialog((current) => (current ? { ...current, busy: true } : current));
    try {
      const input = { threadId: dialog.thread.id, projectId: projectIdForWorkspacePathForCurrentProjects(dialog.workspacePath) };
      const next =
        dialog.kind === "rename"
          ? await window.ambientDesktop.updateThread({ ...input, title: name })
          : await window.ambientDesktop.archiveThread(input);
      setThreadActionDialog(undefined);
      applyProjectActionState(next);
    } catch (error) {
      setThreadActionDialog((current) => (current ? { ...current, busy: false } : current));
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function markThreadUnread(): Promise<void> {
    const input = threadActionInput();
    if (!input) return;
    setThreadContextMenu(undefined);
    setError(undefined);
    try {
      applyProjectActionState(await window.ambientDesktop.markThreadUnread(input));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function revealThread(): Promise<void> {
    const input = threadActionInput();
    if (!input) return;
    setThreadContextMenu(undefined);
    setError(undefined);
    try {
      await window.ambientDesktop.revealThread(input);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyThreadWorkingDirectory(): Promise<void> {
    const thread = threadContextMenu?.thread;
    if (!thread) return;
    setThreadContextMenu(undefined);
    setError(undefined);
    try {
      await window.ambientDesktop.writeClipboardText(threadWorkingDirectoryForMenu(thread));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyThreadSessionId(): Promise<void> {
    const thread = threadContextMenu?.thread;
    if (!thread) return;
    setThreadContextMenu(undefined);
    setError(undefined);
    try {
      await window.ambientDesktop.writeClipboardText(threadSessionIdForMenu(thread));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyThreadDeeplink(): Promise<void> {
    const menu = threadContextMenu;
    if (!menu) return;
    setThreadContextMenu(undefined);
    setError(undefined);
    try {
      await window.ambientDesktop.writeClipboardText(threadDeeplinkForMenu(menu));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function forkThread(mode: "local" | "worktree"): Promise<void> {
    const input = threadActionInput();
    if (!input) return;
    setThreadContextMenu(undefined);
    setError(undefined);
    try {
      applyProjectActionState(await window.ambientDesktop.forkThread({ ...input, mode }));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openThreadMiniWindow(): Promise<void> {
    const input = threadActionInput();
    if (!input) return;
    setThreadContextMenu(undefined);
    setError(undefined);
    try {
      await window.ambientDesktop.openThreadMiniWindow(input);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    archiveProjectChats,
    archiveThread,
    confirmProjectActionDialog,
    confirmThreadActionDialog,
    copyThreadDeeplink,
    copyThreadSessionId,
    copyThreadWorkingDirectory,
    createPermanentProjectWorktree,
    forkThread,
    markThreadUnread,
    openProjectContextMenu,
    openThreadContextMenu,
    openThreadMiniWindow,
    projectIdForWorkspacePath: projectIdForWorkspacePathForCurrentProjects,
    removeProject,
    renameProject,
    renameThread,
    revealProject,
    revealThread,
    threadActionInput,
    toggleProjectPinned,
    toggleThreadPinned,
  };
}
