import type { IpcMain } from "electron";

import {
  projectSelectIpcChannels,
  projectUpdateIpcChannels,
  registerProjectSelectIpc,
  registerProjectUpdateIpc,
  type ProjectSelectHost,
} from "./registerProjectIpc";
import {
  registerThreadSelectIpc,
  threadSelectIpcChannels,
} from "./registerThreadIpc";
import type { DesktopState } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const projectNavigationDomainIpcChannels = [
  ...threadSelectIpcChannels,
  ...projectSelectIpcChannels,
  ...projectUpdateIpcChannels,
] as const;

export interface RegisterProjectNavigationDomainIpcDependencies<
  Host extends ProjectSelectHost = ProjectSelectHost,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): DesktopState;
  requireActiveProjectRuntimeHost(): Host;
  resolveRegisteredProjectPathForHost(projectId: string, host: Host): string;
  normalizeWorkspacePath(workspacePath: string): string;
  activeThreadIdForHost(host: Host): string;
  switchWorkspace(workspacePath: string, requestedThreadId?: string): MaybePromise<DesktopState>;
  setProjectDisplayName(workspacePath: string, name: string | undefined): void;
  setProjectPinned(workspacePath: string, pinned: boolean): void;
}

export function registerProjectNavigationDomainIpc<
  Host extends ProjectSelectHost = ProjectSelectHost,
>({
  handleIpc,
  requireProjectRuntimeHostForThread,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  requireActiveProjectRuntimeHost,
  resolveRegisteredProjectPathForHost,
  normalizeWorkspacePath,
  activeThreadIdForHost,
  switchWorkspace,
  setProjectDisplayName,
  setProjectPinned,
}: RegisterProjectNavigationDomainIpcDependencies<Host>): void {
  registerThreadSelectIpc<Host>({
    handleIpc,
    requireProjectRuntimeHostForThread,
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
  });

  registerProjectSelectIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    resolveRegisteredProjectPathForHost,
    normalizeWorkspacePath,
    activeThreadIdForHost,
    readStateForProjectHostAction,
    switchWorkspace,
  });

  registerProjectUpdateIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    resolveRegisteredProjectPathForHost,
    setProjectDisplayName,
    setProjectPinned,
    readStateForProjectHostAction,
  });
}
