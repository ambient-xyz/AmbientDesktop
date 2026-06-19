import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { SidebarArea } from "./AppShellSidebar";

export type AppDesktopRunStatuses = Record<string, RunStatus>;
type AppliedDesktopState = {
  applied: boolean;
  runStatuses: AppDesktopRunStatuses;
  state: DesktopState;
};

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
  rememberDesktopState: (next: DesktopState) => DesktopState | false | void;
  setComposerDraft: (value: string, options?: { clearSlashCommandSelection?: boolean }) => void;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setThreadRunStatuses: Dispatch<SetStateAction<AppDesktopRunStatuses>>;
  setWorkspaceRevision: Dispatch<SetStateAction<number>>;
  threadRunStatuses: AppDesktopRunStatuses;
}): {
  applyRunStatusDesktopState: (next: DesktopState) => boolean;
  applyCreatedThreadState: (next: DesktopState, previousWorkspacePath?: string) => boolean;
  applyProjectActionState: (next: DesktopState) => boolean;
  applyAutomationDesktopState: (next: DesktopState) => boolean;
} {
  function applyDesktopStateBase(next: DesktopState): AppliedDesktopState {
    const remembered = rememberDesktopState(next);
    if (remembered === false) {
      return {
        applied: false,
        runStatuses: mergeAppDesktopRunStatuses(threadRunStatuses, next),
        state: next,
      };
    }
    const nextState = remembered ?? next;
    const nextRunStatuses = mergeAppDesktopRunStatuses(threadRunStatuses, nextState);
    setThreadRunStatuses(nextRunStatuses);
    setState(nextState);
    return { applied: true, state: nextState, runStatuses: nextRunStatuses };
  }

  function applyRunStatusDesktopState(next: DesktopState): boolean {
    const applied = applyDesktopStateBase(next);
    if (!applied.applied) return false;
    setRunStatus(runStatusForDesktopState(applied.state, applied.runStatuses));
    return true;
  }

  function applyCreatedThreadState(next: DesktopState, previousWorkspacePath?: string): boolean {
    const applied = applyDesktopStateBase(next);
    if (!applied.applied) return false;
    setSidebarArea("projects");
    setRunStatus(runStatusForDesktopState(applied.state, applied.runStatuses));
    setComposerDraft("", { clearSlashCommandSelection: true });
    closeProjectBoard();
    if (appDesktopWorkspaceChanged(applied.state, previousWorkspacePath)) {
      setWorkspaceRevision((revision) => revision + 1);
    }
    return applied.applied;
  }

  function applyProjectActionState(next: DesktopState): boolean {
    const applied = applyDesktopStateBase(next);
    if (!applied.applied) return false;
    setSidebarArea("projects");
    setRunStatus(runStatusForDesktopState(applied.state, applied.runStatuses));
    if (appDesktopWorkspaceChanged(applied.state, activeWorkspacePath)) {
      setComposerDraft("", { clearSlashCommandSelection: true });
      setWorkspaceRevision((revision) => revision + 1);
    }
    return true;
  }

  function applyAutomationDesktopState(next: DesktopState): boolean {
    const applied = applyDesktopStateBase(next);
    if (!applied.applied) return false;
    setRunStatus(runStatusForDesktopState(applied.state, applied.runStatuses));
    if (appDesktopWorkspaceChanged(applied.state, activeWorkspacePath)) {
      setWorkspaceRevision((revision) => revision + 1);
    }
    return true;
  }

  return {
    applyRunStatusDesktopState,
    applyCreatedThreadState,
    applyProjectActionState,
    applyAutomationDesktopState,
  };
}
