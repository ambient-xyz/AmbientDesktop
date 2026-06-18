import type { MutableRefObject } from "react";

import type { DesktopEvent } from "../../shared/desktopTypes";
import {
  desktopEventMatchesProject,
  type WorkspaceProjectAliases,
} from "./workspaceEventMatching";

export type PromptProjectRequest = {
  workspacePath?: string;
  projectPath?: string;
};

export function promptRequestWorkspacePath(
  request: PromptProjectRequest,
  eventWorkspacePath?: string,
): string | undefined {
  return request.projectPath ?? request.workspacePath ?? eventWorkspacePath;
}

export function promptRequestMatchesProject(
  request: PromptProjectRequest,
  activeProjectPath: string | undefined,
  eventWorkspacePath?: string,
): boolean {
  const requestProjectPath = promptRequestWorkspacePath(request, eventWorkspacePath);
  return !requestProjectPath || !activeProjectPath || requestProjectPath === activeProjectPath;
}

export function desktopEventMatchesWorkspaceProject(
  event: DesktopEvent,
  workspacePath: string | undefined,
  aliases: WorkspaceProjectAliases,
): boolean {
  return desktopEventMatchesProject(event, workspacePath, aliases);
}

export function createAppDesktopEventGuards({
  activeProjectRootRef,
  workspaceProjectAliasesRef,
}: {
  activeProjectRootRef: MutableRefObject<string | undefined>;
  workspaceProjectAliasesRef: MutableRefObject<WorkspaceProjectAliases>;
}): {
  desktopEventMatchesWorkspace: (event: DesktopEvent, workspacePath?: string) => boolean;
  desktopEventMatchesActiveProject: (event: DesktopEvent) => boolean;
  promptRequestMatchesActiveProject: (request: PromptProjectRequest) => boolean;
} {
  function desktopEventMatchesWorkspace(event: DesktopEvent, workspacePath?: string): boolean {
    return desktopEventMatchesWorkspaceProject(event, workspacePath, workspaceProjectAliasesRef.current);
  }

  function desktopEventMatchesActiveProject(event: DesktopEvent): boolean {
    return desktopEventMatchesWorkspace(event, activeProjectRootRef.current);
  }

  function promptRequestMatchesActiveProject(request: PromptProjectRequest): boolean {
    return promptRequestMatchesProject(request, activeProjectRootRef.current);
  }

  return {
    desktopEventMatchesWorkspace,
    desktopEventMatchesActiveProject,
    promptRequestMatchesActiveProject,
  };
}
