import type { IpcMain } from "electron";

import {
  registerThreadCreateIpc,
  registerThreadGoalIpc,
  threadCreateIpcChannels,
  threadGoalIpcChannels,
  type RegisterThreadCreateIpcDependencies,
  type RegisterThreadGoalIpcDependencies,
} from "./registerThreadIpc";
import {
  registerUpdatesIpc,
  updatesIpcChannels,
  type RegisterUpdatesIpcDependencies,
} from "./registerUpdatesIpc";
import {
  registerWorkspaceLifecycleIpc,
  workspaceLifecycleIpcChannels,
  type RegisterWorkspaceLifecycleIpcDependencies,
} from "./registerWorkspaceIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type ThreadCreateRegistrationDependencies = RegisterThreadCreateIpcDependencies<any, any, any>;
type ThreadGoalRegistrationDependencies = RegisterThreadGoalIpcDependencies<any, any, any>;

export const lifecycleDomainIpcChannels = [
  ...updatesIpcChannels,
  ...workspaceLifecycleIpcChannels,
  ...threadCreateIpcChannels,
  ...threadGoalIpcChannels,
] as const;

export interface LifecycleUpdateService {
  getState: RegisterUpdatesIpcDependencies["getUpdateState"];
  checkForUpdates: RegisterUpdatesIpcDependencies["checkForUpdates"];
  downloadUpdate: RegisterUpdatesIpcDependencies["downloadUpdate"];
  installUpdateAndRestart: RegisterUpdatesIpcDependencies["installUpdateAndRestart"];
  dismissUpdateNotification: RegisterUpdatesIpcDependencies["dismissUpdateNotification"];
}

export interface RegisterLifecycleDomainIpcDependencies {
  handleIpc: HandleIpc;
  desktopUpdateService: LifecycleUpdateService;
  showWorkspaceDialog: RegisterWorkspaceLifecycleIpcDependencies["showOpenDialog"];
  createWorkspaceDirectory: RegisterWorkspaceLifecycleIpcDependencies["createDirectory"];
  switchWorkspace: RegisterWorkspaceLifecycleIpcDependencies["switchWorkspace"];
  requireActiveProjectRuntimeHost: ThreadCreateRegistrationDependencies["requireActiveProjectRuntimeHost"];
  setProjectHostActiveThreadId: ThreadCreateRegistrationDependencies["setProjectHostActiveThreadId"];
  emitProjectStateIfActive: ThreadGoalRegistrationDependencies["emitProjectStateIfActive"];
  readStateForProjectHostAction: ThreadCreateRegistrationDependencies["readStateForProjectHostAction"];
  requireProjectRuntimeHostForThread: ThreadGoalRegistrationDependencies["requireProjectRuntimeHostForThread"];
  emitProjectScopedEvent: ThreadGoalRegistrationDependencies["emitProjectScopedEvent"];
}

export function registerLifecycleDomainIpc({
  handleIpc,
  desktopUpdateService,
  showWorkspaceDialog,
  createWorkspaceDirectory,
  switchWorkspace,
  requireActiveProjectRuntimeHost,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
  requireProjectRuntimeHostForThread,
  emitProjectScopedEvent,
}: RegisterLifecycleDomainIpcDependencies): void {
  registerUpdatesIpc({
    handleIpc,
    getUpdateState: () => desktopUpdateService.getState(),
    checkForUpdates: (reason) => desktopUpdateService.checkForUpdates(reason),
    downloadUpdate: () => desktopUpdateService.downloadUpdate(),
    installUpdateAndRestart: () => desktopUpdateService.installUpdateAndRestart(),
    dismissUpdateNotification: () => desktopUpdateService.dismissUpdateNotification(),
  });

  registerWorkspaceLifecycleIpc({
    handleIpc,
    showOpenDialog: showWorkspaceDialog,
    createDirectory: createWorkspaceDirectory,
    switchWorkspace,
  });

  registerThreadCreateIpc<any, any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    setProjectHostActiveThreadId,
    readStateForProjectHostAction,
  });

  registerThreadGoalIpc<any, any, any>({
    handleIpc,
    requireProjectRuntimeHostForThread,
    emitProjectScopedEvent,
    emitProjectStateIfActive,
  });
}
