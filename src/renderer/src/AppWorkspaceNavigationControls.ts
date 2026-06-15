import type { Dispatch, SetStateAction } from "react";

import type { DesktopState, RunStatus } from "../../shared/types";
import {
  appDesktopWorkspaceChanged,
  mergeAppDesktopRunStatuses,
  runStatusForDesktopState,
  type AppDesktopRunStatuses,
} from "./AppDesktopStateAppliers";
import type { ProjectPopover } from "./AppSidebar";
import type { SidebarArea } from "./AppShellSidebar";

export type WorkspaceThreadSelectionRequest =
  | { kind: "thread"; threadId: string }
  | { kind: "project"; projectId: string; threadId: string };

export function workspaceReplacementRunStatuses(
  next: Pick<DesktopState, "threadRunStatuses">,
): AppDesktopRunStatuses {
  return next.threadRunStatuses ?? {};
}

export function workspaceThreadSelectionRequest({
  currentWorkspacePath,
  projectIdForWorkspacePath,
  threadId,
  workspacePath,
}: {
  currentWorkspacePath: string | undefined;
  projectIdForWorkspacePath: (workspacePath: string) => string;
  threadId: string;
  workspacePath: string | undefined;
}): WorkspaceThreadSelectionRequest | undefined {
  if (!workspacePath) return undefined;
  return workspacePath === currentWorkspacePath
    ? { kind: "thread", threadId }
    : { kind: "project", projectId: projectIdForWorkspacePath(workspacePath), threadId };
}

export function createAppWorkspaceNavigationControls({
  activeWorkspacePath,
  applyCreatedThreadState,
  closeProjectBoard,
  currentWorkspacePath,
  openNewWorkflowComposer,
  projectIdForWorkspacePath,
  rememberDesktopState,
  scheduleComposerFocusEnd,
  setComposerDraft,
  setProjectPopover,
  setProjectsCollapsed,
  setRunStatus,
  setSidebarArea,
  setState,
  setThreadRunStatuses,
  setWorkspaceRevision,
  sidebarArea,
  threadRunStatuses,
}: {
  activeWorkspacePath: string | undefined;
  applyCreatedThreadState: (next: DesktopState, previousWorkspacePath?: string) => void;
  closeProjectBoard: () => void;
  currentWorkspacePath: string | undefined;
  openNewWorkflowComposer: () => void;
  projectIdForWorkspacePath: (workspacePath: string) => string;
  rememberDesktopState: (next: DesktopState) => void;
  scheduleComposerFocusEnd: () => void;
  setComposerDraft: (value: string) => void;
  setProjectPopover: Dispatch<SetStateAction<ProjectPopover | undefined>>;
  setProjectsCollapsed: Dispatch<SetStateAction<boolean>>;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setThreadRunStatuses: Dispatch<SetStateAction<AppDesktopRunStatuses>>;
  setWorkspaceRevision: Dispatch<SetStateAction<number>>;
  sidebarArea: SidebarArea;
  threadRunStatuses: AppDesktopRunStatuses;
}): {
  createThread: () => Promise<void>;
  createThreadInProject: (workspacePath?: string) => Promise<void>;
  createWorkspace: () => Promise<DesktopState | undefined>;
  openWorkspace: () => Promise<void>;
  runPrimaryCreateAction: () => Promise<void>;
  selectProject: (workspacePath: string) => Promise<void>;
  selectThread: (threadId: string, workspacePath?: string) => Promise<void>;
} {
  function applyLoadedWorkspaceState(next: DesktopState): void {
    const nextRunStatuses = workspaceReplacementRunStatuses(next);
    setThreadRunStatuses(nextRunStatuses);
    rememberDesktopState(next);
    setState(next);
    setSidebarArea("projects");
    setRunStatus(runStatusForDesktopState(next, nextRunStatuses));
    setComposerDraft("");
    setProjectsCollapsed(false);
    setProjectPopover(undefined);
    closeProjectBoard();
    setWorkspaceRevision((revision) => revision + 1);
    scheduleComposerFocusEnd();
  }

  async function createThreadInProject(workspacePath?: string): Promise<void> {
    const previousWorkspacePath = activeWorkspacePath;
    if (workspacePath && workspacePath !== currentWorkspacePath) {
      await window.ambientDesktop.selectProject({ projectId: projectIdForWorkspacePath(workspacePath) });
    }
    const next = await window.ambientDesktop.createThread();
    applyCreatedThreadState(next, previousWorkspacePath);
  }

  async function createThread(): Promise<void> {
    await createThreadInProject(currentWorkspacePath);
  }

  async function runPrimaryCreateAction(): Promise<void> {
    if (sidebarArea === "automations") {
      openNewWorkflowComposer();
      return;
    }
    await createThread();
  }

  async function openWorkspace(): Promise<void> {
    const next = await window.ambientDesktop.openWorkspace();
    if (next) applyLoadedWorkspaceState(next);
  }

  async function createWorkspace(): Promise<DesktopState | undefined> {
    const next = await window.ambientDesktop.createWorkspace();
    if (next) applyLoadedWorkspaceState(next);
    return next;
  }

  async function selectThread(threadId: string, workspacePath = currentWorkspacePath): Promise<void> {
    const request = workspaceThreadSelectionRequest({
      currentWorkspacePath,
      projectIdForWorkspacePath,
      threadId,
      workspacePath,
    });
    if (!request) return;
    const next =
      request.kind === "thread"
        ? await window.ambientDesktop.selectThread(request.threadId)
        : await window.ambientDesktop.selectProject({ projectId: request.projectId, threadId: request.threadId });
    const nextRunStatuses = mergeAppDesktopRunStatuses(threadRunStatuses, next);
    setThreadRunStatuses(nextRunStatuses);
    rememberDesktopState(next);
    setState(next);
    setRunStatus(runStatusForDesktopState(next, nextRunStatuses));
    closeProjectBoard();
    if (appDesktopWorkspaceChanged(next, activeWorkspacePath)) {
      setWorkspaceRevision((revision) => revision + 1);
    }
  }

  async function selectProject(workspacePath: string): Promise<void> {
    const next = await window.ambientDesktop.selectProject({ projectId: projectIdForWorkspacePath(workspacePath) });
    const nextRunStatuses = mergeAppDesktopRunStatuses(threadRunStatuses, next);
    setThreadRunStatuses(nextRunStatuses);
    rememberDesktopState(next);
    setState(next);
    setSidebarArea("projects");
    setRunStatus(runStatusForDesktopState(next, nextRunStatuses));
    closeProjectBoard();
    if (appDesktopWorkspaceChanged(next, activeWorkspacePath)) {
      setComposerDraft("");
      setWorkspaceRevision((revision) => revision + 1);
    }
  }

  return {
    createThread,
    createThreadInProject,
    createWorkspace,
    openWorkspace,
    runPrimaryCreateAction,
    selectProject,
    selectThread,
  };
}
