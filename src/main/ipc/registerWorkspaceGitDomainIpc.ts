import type { IpcMain } from "electron";

import {
  gitAttachExistingWorktreeIpcChannels,
  gitCommitIpcChannels,
  gitCreateBranchIpcChannels,
  gitCreatePullRequestUrlIpcChannels,
  gitCreateThreadWorktreeIpcChannels,
  gitDiscardFileIpcChannels,
  gitInitializeIpcChannels,
  gitReviewIpcChannels,
  gitRunActionIpcChannels,
  gitStageAllFilesIpcChannels,
  gitStageFileIpcChannels,
  gitUnstageAllFilesIpcChannels,
  gitUnstageFileIpcChannels,
  registerGitAttachExistingWorktreeIpc,
  registerGitCommitIpc,
  registerGitCreateBranchIpc,
  registerGitCreatePullRequestUrlIpc,
  registerGitCreateThreadWorktreeIpc,
  registerGitDiscardFileIpc,
  registerGitInitializeIpc,
  registerGitReviewIpc,
  registerGitRunActionIpc,
  registerGitStageAllFilesIpc,
  registerGitStageFileIpc,
  registerGitUnstageAllFilesIpc,
  registerGitUnstageFileIpc,
} from "./registerGitIpc";
import {
  localFileActionIpcChannels,
  localFilePreviewIpcChannels,
  registerLocalFileActionIpc,
  registerLocalFilePreviewIpc,
  registerWorkspaceFileIpc,
  registerWorkspaceGitStatusIpc,
  registerWorkspacePathActionIpc,
  registerWorkspacePickContextIpc,
  registerWorkspaceSearchIpc,
  workspaceFileIpcChannels,
  workspaceGitStatusIpcChannels,
  workspacePathActionIpcChannels,
  workspacePickContextIpcChannels,
  workspaceSearchIpcChannels,
} from "./registerWorkspaceIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const workspaceGitDomainIpcChannels = [
  ...workspaceFileIpcChannels,
  ...localFilePreviewIpcChannels,
  ...workspacePickContextIpcChannels,
  ...workspacePathActionIpcChannels,
  ...localFileActionIpcChannels,
  ...workspaceGitStatusIpcChannels,
  ...gitReviewIpcChannels,
  ...gitInitializeIpcChannels,
  ...gitCreateThreadWorktreeIpcChannels,
  ...gitAttachExistingWorktreeIpcChannels,
  ...gitStageFileIpcChannels,
  ...gitUnstageFileIpcChannels,
  ...gitStageAllFilesIpcChannels,
  ...gitUnstageAllFilesIpcChannels,
  ...gitDiscardFileIpcChannels,
  ...gitCommitIpcChannels,
  ...gitCreateBranchIpcChannels,
  ...gitRunActionIpcChannels,
  ...gitCreatePullRequestUrlIpcChannels,
  ...workspaceSearchIpcChannels,
] as const;

export interface RegisterWorkspaceGitDomainIpcDependencies {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost: any;
  activeWorkspaceFileContextForProjectHost: any;
  attachWorktreeForThread: any;
  commitGit: any;
  createAndRecordCheckpoint: any;
  createGitBranch: any;
  createPullRequestUrl: any;
  describeWorkspaceAbsoluteContextPaths: any;
  discardGitFile: any;
  emitProjectStateIfActive: any;
  fetchGit: any;
  getWorkspaceDiff: any;
  getWorkspaceGitStatus: any;
  initializeGitRepository: any;
  listWorkspaceFiles: any;
  listWorkspaceOpenTargets: any;
  normalizeWorkspacePath: any;
  openAllowedExternalUrl: any;
  openWorkspaceTarget: any;
  prepareWorktreeForThread: any;
  pullGit: any;
  pushGit: any;
  readActiveLocalFilePreview: any;
  readActiveWorkspaceFile: any;
  readGitReviewForProjectHost: any;
  rendererOfficePreviewService: any;
  resolveLocalFilePath: any;
  resolveWorkspacePathForOpen: any;
  restoreLatestGitCheckpoint: any;
  searchWorkspace: any;
  setProjectHostActiveThreadId: any;
  shell: any;
  showOpenDialog: any;
  stageAllGitFiles: any;
  stageGitFile: any;
  switchWorkspaceBranch: any;
  unstageAllGitFiles: any;
  unstageGitFile: any;
  workspacePathForRelativeArtifactPath: any;
}

export function registerWorkspaceGitDomainIpc({
  handleIpc,
  activeGitContextForProjectHost,
  activeWorkspaceFileContextForProjectHost,
  attachWorktreeForThread,
  commitGit,
  createAndRecordCheckpoint,
  createGitBranch,
  createPullRequestUrl,
  describeWorkspaceAbsoluteContextPaths,
  discardGitFile,
  emitProjectStateIfActive,
  fetchGit,
  getWorkspaceDiff,
  getWorkspaceGitStatus,
  initializeGitRepository,
  listWorkspaceFiles,
  listWorkspaceOpenTargets,
  normalizeWorkspacePath,
  openAllowedExternalUrl,
  openWorkspaceTarget,
  prepareWorktreeForThread,
  pullGit,
  pushGit,
  readActiveLocalFilePreview,
  readActiveWorkspaceFile,
  readGitReviewForProjectHost,
  rendererOfficePreviewService,
  resolveLocalFilePath,
  resolveWorkspacePathForOpen,
  restoreLatestGitCheckpoint,
  searchWorkspace,
  setProjectHostActiveThreadId,
  shell,
  showOpenDialog,
  stageAllGitFiles,
  stageGitFile,
  switchWorkspaceBranch,
  unstageAllGitFiles,
  unstageGitFile,
  workspacePathForRelativeArtifactPath,
}: RegisterWorkspaceGitDomainIpcDependencies): void {
  registerWorkspaceFileIpc({
    handleIpc,
    activeWorkspaceFileContextForProjectHost,
    listWorkspaceFiles,
    readActiveWorkspaceFile,
    clearOfficePreviewRendererDiscovery: () => rendererOfficePreviewService?.clearRendererDiscovery(),
  });

  registerLocalFilePreviewIpc({
    handleIpc,
    activeWorkspaceFileContextForProjectHost,
    readActiveLocalFilePreview,
    clearOfficePreviewRendererDiscovery: () => rendererOfficePreviewService?.clearRendererDiscovery(),
  });

  registerWorkspacePickContextIpc({
    handleIpc,
    activeWorkspaceFileContextForProjectHost,
    showOpenDialog,
    describeWorkspaceAbsoluteContextPaths,
  });

  registerWorkspacePathActionIpc({
    handleIpc,
    activeWorkspaceFileContextForProjectHost,
    workspacePathForRelativeArtifactPath,
    resolveWorkspacePathForOpen,
    showItemInFolder: (absolutePath: string) => shell.showItemInFolder(absolutePath),
    openPath: (absolutePath: string) => shell.openPath(absolutePath),
    listWorkspaceOpenTargets,
    openWorkspaceTarget,
  });

  registerLocalFileActionIpc({
    handleIpc,
    resolveLocalFilePath,
    showItemInFolder: (absolutePath: string) => shell.showItemInFolder(absolutePath),
    openPath: (absolutePath: string) => shell.openPath(absolutePath),
    openWorkspaceTarget,
  });

  registerWorkspaceGitStatusIpc({
    handleIpc,
    activeGitContextForProjectHost,
    getWorkspaceDiff,
    getWorkspaceGitStatus,
    switchWorkspaceBranch,
    createAndRecordPreGitActionCheckpoint: (reason: string, thread: any, targetStore: any) =>
      createAndRecordCheckpoint("pre-git-action", reason, thread, targetStore),
  });

  registerGitReviewIpc({
    handleIpc,
    activeGitContextForProjectHost,
    readGitReviewForProjectHost,
  });

  registerGitInitializeIpc({
    handleIpc,
    activeGitContextForProjectHost,
    initializeGitRepository,
    readGitReviewForProjectHost,
  });

  registerGitCreateThreadWorktreeIpc({
    handleIpc,
    activeGitContextForProjectHost,
    prepareWorktreeForThread,
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    readGitReviewForProjectHost,
  });

  registerGitAttachExistingWorktreeIpc({
    handleIpc,
    activeGitContextForProjectHost,
    showOpenDialog,
    normalizeWorkspacePath,
    attachWorktreeForThread,
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    readGitReviewForProjectHost,
  });

  registerGitStageFileIpc({
    handleIpc,
    activeGitContextForProjectHost,
    stageGitFile,
    readGitReviewForProjectHost,
  });

  registerGitUnstageFileIpc({
    handleIpc,
    activeGitContextForProjectHost,
    unstageGitFile,
    readGitReviewForProjectHost,
  });

  registerGitStageAllFilesIpc({
    handleIpc,
    activeGitContextForProjectHost,
    stageAllGitFiles,
    readGitReviewForProjectHost,
  });

  registerGitUnstageAllFilesIpc({
    handleIpc,
    activeGitContextForProjectHost,
    unstageAllGitFiles,
    readGitReviewForProjectHost,
  });

  registerGitDiscardFileIpc({
    handleIpc,
    activeGitContextForProjectHost,
    createAndRecordPreGitActionCheckpoint: (reason: string, thread: any, targetStore: any) =>
      createAndRecordCheckpoint("pre-git-action", reason, thread, targetStore),
    discardGitFile,
    readGitReviewForProjectHost,
  });

  registerGitCommitIpc({
    handleIpc,
    activeGitContextForProjectHost,
    commitGit,
    readGitReviewForProjectHost,
  });

  registerGitCreateBranchIpc({
    handleIpc,
    activeGitContextForProjectHost,
    createAndRecordPreGitActionCheckpoint: (reason: string, thread: any, targetStore: any) =>
      createAndRecordCheckpoint("pre-git-action", reason, thread, targetStore),
    createGitBranch,
    readGitReviewForProjectHost,
  });

  registerGitRunActionIpc({
    handleIpc,
    activeGitContextForProjectHost,
    fetchGit,
    createAndRecordPreGitActionCheckpoint: (reason: string, thread: any, targetStore: any) =>
      createAndRecordCheckpoint("pre-git-action", reason, thread, targetStore),
    pullGit,
    pushGit,
    restoreLatestGitCheckpoint,
    readGitReviewForProjectHost,
  });

  registerGitCreatePullRequestUrlIpc({
    handleIpc,
    activeGitContextForProjectHost,
    createPullRequestUrl,
    openAllowedExternalUrl,
  });

  registerWorkspaceSearchIpc({
    handleIpc,
    searchWorkspace,
  });
}
