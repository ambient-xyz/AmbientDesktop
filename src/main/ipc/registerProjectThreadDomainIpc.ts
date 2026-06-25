import type { IpcMain, OpenDialogOptions } from "electron";

import {
  plannerPlanAnswerQuestionIpcChannels,
  plannerPlanGenerateDurableArtifactIpcChannels,
  plannerPlanUpdateIpcChannels,
  registerPlannerPlanAnswerQuestionIpc,
  registerPlannerPlanGenerateDurableArtifactIpc,
  registerPlannerPlanUpdateIpc,
} from "./registerPlannerPlanIpc";
import {
  projectArchiveChatsIpcChannels,
  projectPermanentWorktreeIpcChannels,
  projectRemoveIpcChannels,
  projectRevealIpcChannels,
  registerProjectArchiveChatsIpc,
  registerProjectPermanentWorktreeIpc,
  registerProjectRemoveIpc,
  registerProjectRevealIpc,
} from "./registerProjectIpc";
import {
  registerThreadArchiveIpc,
  registerThreadForkIpc,
  registerThreadMarkUnreadIpc,
  registerThreadMessageReadIpc,
  registerThreadOpenMiniWindowIpc,
  registerThreadPermissionModeChangeIpc,
  registerThreadRevealIpc,
  registerThreadUpdateIpc,
  registerThreadUpdateSettingsIpc,
  threadArchiveIpcChannels,
  threadForkIpcChannels,
  threadMarkUnreadIpcChannels,
  threadMessageReadIpcChannels,
  threadOpenMiniWindowIpcChannels,
  threadPermissionModeChangeIpcChannels,
  threadRevealIpcChannels,
  threadUpdateIpcChannels,
  threadUpdateSettingsIpcChannels,
} from "./registerThreadIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const projectThreadDomainIpcChannels = [
  ...projectRemoveIpcChannels,
  ...projectRevealIpcChannels,
  ...projectArchiveChatsIpcChannels,
  ...projectPermanentWorktreeIpcChannels,
  ...threadUpdateIpcChannels,
  ...threadArchiveIpcChannels,
  ...threadMarkUnreadIpcChannels,
  ...threadRevealIpcChannels,
  ...threadForkIpcChannels,
  ...threadOpenMiniWindowIpcChannels,
  ...threadMessageReadIpcChannels,
  ...threadUpdateSettingsIpcChannels,
  ...threadPermissionModeChangeIpcChannels,
  ...plannerPlanUpdateIpcChannels,
  ...plannerPlanGenerateDurableArtifactIpcChannels,
  ...plannerPlanAnswerQuestionIpcChannels,
] as const;

export interface RegisterProjectThreadDomainIpcDependencies {
  handleIpc: HandleIpc;
  activeThreadIdForHost: any;
  archiveProjectChats: any;
  createPermanentWorktree: any;
  disposeProjectRuntimeHost: any;
  emitDesktopState(state: any): void;
  emitPermissionAuditCreated: any;
  emitPlannerPlanArtifactUpdated: any;
  emitProjectStateIfActive: any;
  emitThreadUpdated: any;
  generatePlannerDurableArtifact: any;
  initialActiveThreadIdForStore: any;
  isActiveProjectRuntimeHost: any;
  listRegisteredProjectPaths(): string[];
  normalizeWorkspacePath: any;
  openPath(path: string): Promise<string> | string;
  openThreadMiniWindow: any;
  parseThreadPermissionModeChange: any;
  parseThreadSettingsUpdate: any;
  pathExists(path: string): boolean;
  permanentWorktreeBranchName: any;
  permissionModeChangeAuditDetail: any;
  prepareWorktreeForThread: any;
  projectRuntimeHostForWorkspacePath: any;
  readState: any;
  readStateForProjectHostAction: any;
  removeProject: any;
  requireActiveProjectRuntimeHost: any;
  requireProjectRuntimeHostForPlannerPlanArtifact: any;
  requireProjectRuntimeHostForThread: any;
  requireProjectRuntimeHostForThreadAction: any;
  resolveRegisteredProjectPathForHost: any;
  setProjectHostActiveThreadId: any;
  showItemInFolder(path: string): void;
  showOpenDialog(options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }>;
  switchWorkspace: any;
  threadWorkingDirectory: any;
}

export function registerProjectThreadDomainIpc({
  handleIpc,
  activeThreadIdForHost,
  archiveProjectChats,
  createPermanentWorktree,
  disposeProjectRuntimeHost,
  emitDesktopState,
  emitPermissionAuditCreated,
  emitPlannerPlanArtifactUpdated,
  emitProjectStateIfActive,
  emitThreadUpdated,
  generatePlannerDurableArtifact,
  initialActiveThreadIdForStore,
  isActiveProjectRuntimeHost,
  listRegisteredProjectPaths,
  normalizeWorkspacePath,
  openPath,
  openThreadMiniWindow,
  parseThreadPermissionModeChange,
  parseThreadSettingsUpdate,
  pathExists,
  permanentWorktreeBranchName,
  permissionModeChangeAuditDetail,
  prepareWorktreeForThread,
  projectRuntimeHostForWorkspacePath,
  readState,
  readStateForProjectHostAction,
  removeProject,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForPlannerPlanArtifact,
  requireProjectRuntimeHostForThread,
  requireProjectRuntimeHostForThreadAction,
  resolveRegisteredProjectPathForHost,
  setProjectHostActiveThreadId,
  showItemInFolder,
  showOpenDialog,
  switchWorkspace,
  threadWorkingDirectory,
}: RegisterProjectThreadDomainIpcDependencies): void {
  registerProjectRemoveIpc<any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    resolveRegisteredProjectPathForHost,
    normalizeWorkspacePath,
    listRegisteredProjectPaths,
    pathExists,
    removeProject,
    switchWorkspace,
    disposeProjectRuntimeHost,
    readStateForProjectHostAction,
  });

  registerProjectRevealIpc<any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    resolveRegisteredProjectPathForHost,
    openProjectPath: openPath,
    showProjectInFolder: showItemInFolder,
  });

  registerProjectArchiveChatsIpc<any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    resolveRegisteredProjectPathForHost,
    normalizeWorkspacePath,
    projectRuntimeHostForWorkspacePath,
    archiveProjectChatsForHost: (host) => host.store.archiveChats(),
    initialActiveThreadIdForHost: (host) => initialActiveThreadIdForStore(host.store),
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    archiveProjectChats,
    readStateForProjectHostAction,
  });

  registerProjectPermanentWorktreeIpc<any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    resolveRegisteredProjectPathForHost,
    normalizeWorkspacePath,
    showOpenDialog,
    createPermanentWorktree,
    permanentWorktreeBranchName,
    switchWorkspace,
  });

  registerThreadUpdateIpc<any, any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThreadAction,
    emitProjectStateIfActive,
    isActiveProjectRuntimeHost,
    emitThreadUpdated,
    readStateForProjectHostAction,
  });

  registerThreadArchiveIpc<any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThreadAction,
    initialActiveThreadIdForStore,
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
  });

  registerThreadMarkUnreadIpc<any, any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThreadAction,
    isActiveProjectRuntimeHost,
    emitThreadUpdated,
    activeThreadIdForHost,
    readState,
    emitDesktopState,
  });

  registerThreadRevealIpc<any, any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThreadAction,
    threadWorkingDirectory,
    openPath,
    showItemInFolder,
  });

  registerThreadForkIpc<any, any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThreadAction,
    prepareWorktreeForThread,
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    isActiveProjectRuntimeHost,
    emitThreadUpdated,
    readStateForProjectHostAction,
  });

  registerThreadOpenMiniWindowIpc<any, any, any, any>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThreadAction,
    threadWorkingDirectory,
    openThreadMiniWindow,
  });

  registerThreadMessageReadIpc<any, any, any>({
    handleIpc,
    requireProjectRuntimeHostForThread,
  });

  registerThreadUpdateSettingsIpc<any, any, any>({
    handleIpc,
    parseThreadSettingsUpdate,
    requireProjectRuntimeHostForThread,
  });

  registerThreadPermissionModeChangeIpc<any, any, any>({
    handleIpc,
    parseThreadPermissionModeChange,
    requireProjectRuntimeHostForThread,
    permissionModeChangeAuditDetail,
    emitPermissionAuditCreated,
  });

  registerPlannerPlanUpdateIpc<any, any, any>({
    handleIpc,
    requireProjectRuntimeHostForPlannerPlanArtifact,
    emitPlannerPlanArtifactUpdated,
  });

  registerPlannerPlanGenerateDurableArtifactIpc<any>({
    handleIpc,
    generatePlannerDurableArtifact,
  });

  registerPlannerPlanAnswerQuestionIpc<any, any, any>({
    handleIpc,
    requireProjectRuntimeHostForPlannerPlanArtifact,
    emitPlannerPlanArtifactUpdated,
  });
}
