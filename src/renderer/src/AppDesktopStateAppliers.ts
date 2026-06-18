import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { SidebarArea } from "./AppShellSidebar";

export type AppDesktopRunStatuses = Record<string, RunStatus>;

export function mergeAppDesktopRunStatuses(
  current: AppDesktopRunStatuses,
  next: Pick<DesktopState, "threadRunStatuses">,
): AppDesktopRunStatuses {
  return { ...current, ...(next.threadRunStatuses ?? {}) };
}

export function runStatusForDesktopState(
  next: Pick<DesktopState, "activeThreadId">,
  runStatuses: AppDesktopRunStatuses,
): RunStatus {
  return runStatuses[next.activeThreadId] ?? "idle";
}

export function appDesktopWorkspaceChanged(
  next: Pick<DesktopState, "activeWorkspace">,
  previousWorkspacePath: string | undefined,
): boolean {
  return next.activeWorkspace.path !== previousWorkspacePath;
}

export function createAppDesktopStateAppliers({
  activeWorkspacePath,
  closeProjectBoard,
  rememberDesktopState,
  setComposerDraft,
  setRunStatus,
  setSidebarArea,
  setState,
  setThreadRunStatuses,
  setWorkspaceRevision,
  threadRunStatuses,
}: {
  activeWorkspacePath: string | undefined;
  closeProjectBoard: () => void;
  rememberDesktopState: (next: DesktopState) => void;
  setComposerDraft: (value: string, options?: { clearSlashCommandSelection?: boolean }) => void;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setThreadRunStatuses: Dispatch<SetStateAction<AppDesktopRunStatuses>>;
  setWorkspaceRevision: Dispatch<SetStateAction<number>>;
  threadRunStatuses: AppDesktopRunStatuses;
}): {
  applyRunStatusDesktopState: (next: DesktopState) => void;
  applyCreatedThreadState: (next: DesktopState, previousWorkspacePath?: string) => void;
  applyProjectActionState: (next: DesktopState) => void;
  applyAutomationDesktopState: (next: DesktopState) => void;
} {
  function applyDesktopStateBase(next: DesktopState): AppDesktopRunStatuses {
    const nextRunStatuses = mergeAppDesktopRunStatuses(threadRunStatuses, next);
    setThreadRunStatuses(nextRunStatuses);
    rememberDesktopState(next);
    setState(next);
    return nextRunStatuses;
  }

  function applyRunStatusDesktopState(next: DesktopState): void {
    const nextRunStatuses = applyDesktopStateBase(next);
    setRunStatus(runStatusForDesktopState(next, nextRunStatuses));
  }

  function applyCreatedThreadState(next: DesktopState, previousWorkspacePath?: string): void {
    const nextRunStatuses = applyDesktopStateBase(next);
    setSidebarArea("projects");
    setRunStatus(runStatusForDesktopState(next, nextRunStatuses));
    setComposerDraft("", { clearSlashCommandSelection: true });
    closeProjectBoard();
    if (appDesktopWorkspaceChanged(next, previousWorkspacePath)) {
      setWorkspaceRevision((revision) => revision + 1);
    }
  }

  function applyProjectActionState(next: DesktopState): void {
    const nextRunStatuses = applyDesktopStateBase(next);
    setSidebarArea("projects");
    setRunStatus(runStatusForDesktopState(next, nextRunStatuses));
    if (appDesktopWorkspaceChanged(next, activeWorkspacePath)) {
      setComposerDraft("", { clearSlashCommandSelection: true });
      setWorkspaceRevision((revision) => revision + 1);
    }
  }

  function applyAutomationDesktopState(next: DesktopState): void {
    const nextRunStatuses = applyDesktopStateBase(next);
    setRunStatus(runStatusForDesktopState(next, nextRunStatuses));
    if (appDesktopWorkspaceChanged(next, activeWorkspacePath)) {
      setWorkspaceRevision((revision) => revision + 1);
    }
  }

  return {
    applyRunStatusDesktopState,
    applyCreatedThreadState,
    applyProjectActionState,
    applyAutomationDesktopState,
  };
}
