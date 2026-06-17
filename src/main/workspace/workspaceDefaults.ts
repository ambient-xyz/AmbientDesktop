import { join, resolve } from "node:path";

export interface ResolveDefaultWorkspacePathInput {
  explicitWorkspace?: string;
  cwd: string;
  isPackaged: boolean;
  userDataPath: string;
}

export function resolveDefaultWorkspacePath(input: ResolveDefaultWorkspacePathInput): string {
  if (input.explicitWorkspace) return input.explicitWorkspace;
  if (input.isPackaged) return join(input.userDataPath, "workspace");
  return input.cwd;
}

export interface SelectStartupWorkspacePathInput extends ResolveDefaultWorkspacePathInput {
  registeredWorkspacePaths?: string[];
  hasRestorableWorkspaceState?: (workspacePath: string) => boolean;
}

export function selectStartupWorkspacePath(input: SelectStartupWorkspacePathInput): string {
  const fallback = resolveDefaultWorkspacePath(input);
  if (input.explicitWorkspace || !input.isPackaged) return fallback;

  const hasRestorableWorkspaceState = input.hasRestorableWorkspaceState ?? (() => true);
  const fallbackNormalized = resolve(fallback);
  const registeredPath = (input.registeredWorkspacePaths ?? []).find((workspacePath) => {
    if (resolve(workspacePath) !== fallbackNormalized) return true;
    return hasRestorableWorkspaceState(workspacePath);
  });
  return registeredPath ?? fallback;
}
