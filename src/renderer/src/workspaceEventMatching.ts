import type { DesktopEvent, DesktopState, ThreadSummary } from "../../shared/types";

export type WorkspaceProjectAliases = Record<string, string>;

export function desktopEventWorkspacePath(event: DesktopEvent): string | undefined {
  if ("workspacePath" in event && event.workspacePath) return event.workspacePath;
  if (event.type === "thread-updated") return event.thread.workspacePath;
  return undefined;
}

export function workspaceProjectAliasesForThread(thread: ThreadSummary, projectPath: string): WorkspaceProjectAliases {
  return {
    [thread.workspacePath]: projectPath,
    ...(thread.gitWorktree
      ? {
          [thread.gitWorktree.projectRoot]: projectPath,
          [thread.gitWorktree.worktreePath]: projectPath,
        }
      : {}),
  };
}

export function workspaceProjectAliasesForState(
  state: DesktopState,
  current: WorkspaceProjectAliases = {},
): WorkspaceProjectAliases {
  const aliases: WorkspaceProjectAliases = {
    ...current,
    [state.workspace.path]: state.workspace.path,
    [state.activeWorkspace.path]: state.workspace.path,
  };

  for (const thread of state.threads) {
    Object.assign(aliases, workspaceProjectAliasesForThread(thread, state.workspace.path));
  }

  for (const project of state.projects) {
    aliases[project.path] = project.path;
    for (const thread of project.threads) {
      Object.assign(aliases, workspaceProjectAliasesForThread(thread, project.path));
    }
  }

  return aliases;
}

export function desktopEventMatchesProject(
  event: DesktopEvent,
  projectPath: string | undefined,
  aliases: WorkspaceProjectAliases,
): boolean {
  const eventWorkspacePath = desktopEventWorkspacePath(event);
  if (!eventWorkspacePath || !projectPath || eventWorkspacePath === projectPath) return true;
  return aliases[eventWorkspacePath] === projectPath;
}
