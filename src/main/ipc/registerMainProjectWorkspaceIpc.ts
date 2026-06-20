import type { OpenDialogOptions } from "electron";

import {
  registerProjectBoardDomainIpc,
  type RegisterProjectBoardDomainIpcDependencies,
} from "./registerProjectBoardDomainIpc";
import {
  registerProjectNavigationDomainIpc,
  type RegisterProjectNavigationDomainIpcDependencies,
} from "./registerProjectNavigationDomainIpc";
import {
  registerProjectThreadDomainIpc,
  type RegisterProjectThreadDomainIpcDependencies,
} from "./registerProjectThreadDomainIpc";
import {
  registerWorkspaceGitDomainIpc,
  type RegisterWorkspaceGitDomainIpcDependencies,
} from "./registerWorkspaceGitDomainIpc";

type ProjectRegistryForMainProjectWorkspaceIpc = {
  setDisplayName(workspacePath: string, name: string | undefined): void;
  setPinned(workspacePath: string, pinned: boolean): void;
  listRegisteredPaths(): string[];
  remove(workspacePath: string): unknown;
};

type MainProjectWorkspaceIpcDependencies =
  Omit<
    RegisterProjectNavigationDomainIpcDependencies,
    "setProjectDisplayName" | "setProjectPinned"
  > &
  Omit<
    RegisterProjectThreadDomainIpcDependencies,
    | "emitDesktopState"
    | "listRegisteredProjectPaths"
    | "openPath"
    | "pathExists"
    | "removeProject"
    | "showItemInFolder"
    | "showOpenDialog"
  > &
  Omit<
    RegisterWorkspaceGitDomainIpcDependencies,
    "rendererOfficePreviewService" | "shell" | "showOpenDialog"
  > & {
    dialog: {
      showOpenDialog(
        window: unknown,
        options: OpenDialogOptions,
      ): ReturnType<RegisterProjectThreadDomainIpcDependencies["showOpenDialog"]>;
    };
    existsSync(path: string): boolean;
    mainWindow?: {
      webContents: {
        send(channel: string, payload: unknown): void;
      };
    } | null;
    officePreviewService: RegisterWorkspaceGitDomainIpcDependencies["rendererOfficePreviewService"];
    projectBoardDesktopIpcDependencies: Omit<
      RegisterProjectBoardDomainIpcDependencies,
      "handleIpc"
    >;
    projectRegistry: ProjectRegistryForMainProjectWorkspaceIpc;
    shell: RegisterWorkspaceGitDomainIpcDependencies["shell"] & {
      openPath(path: string): Promise<string> | string;
      showItemInFolder(path: string): void;
    };
  };

export function registerMainProjectWorkspaceIpc(
  deps: Record<string, unknown>,
): void {
  const {
    activeGitContextForProjectHost,
    activeThreadIdForHost,
    activeWorkspaceFileContextForProjectHost,
    archiveProjectChats,
    attachWorktreeForThread,
    commitGit,
    createAndRecordCheckpoint,
    createGitBranch,
    createPermanentWorktree,
    createPullRequestUrl,
    describeWorkspaceAbsoluteContextPaths,
    dialog,
    discardGitFile,
    disposeProjectRuntimeHost,
    emitPermissionAuditCreated,
    emitPlannerPlanArtifactUpdated,
    emitProjectStateIfActive,
    emitThreadUpdated,
    existsSync,
    fetchGit,
    generatePlannerDurableArtifact,
    getWorkspaceDiff,
    getWorkspaceGitStatus,
    handleIpc,
    initialActiveThreadIdForStore,
    initializeGitRepository,
    isActiveProjectRuntimeHost,
    listWorkspaceFiles,
    listWorkspaceOpenTargets,
    mainWindow,
    normalizeWorkspacePath,
    officePreviewService,
    openAllowedExternalUrl,
    openThreadMiniWindow,
    openWorkspaceTarget,
    parseThreadPermissionModeChange,
    parseThreadSettingsUpdate,
    permanentWorktreeBranchName,
    permissionModeChangeAuditDetail,
    prepareWorktreeForThread,
    projectBoardDesktopIpcDependencies,
    projectRegistry,
    projectRuntimeHostForWorkspacePath,
    pullGit,
    pushGit,
    readActiveLocalFilePreview,
    readActiveWorkspaceFile,
    readGitReviewForProjectHost,
    readState,
    readStateForProjectHostAction,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForPlannerPlanArtifact,
    requireProjectRuntimeHostForThread,
    requireProjectRuntimeHostForThreadAction,
    resolveLocalFilePath,
    resolveRegisteredProjectPathForHost,
    resolveWorkspacePathForOpen,
    restoreLatestGitCheckpoint,
    searchWorkspace,
    setProjectHostActiveThreadId,
    shell,
    stageAllGitFiles,
    stageGitFile,
    switchWorkspace,
    switchWorkspaceBranch,
    threadWorkingDirectory,
    unstageAllGitFiles,
    unstageGitFile,
    workspacePathForRelativeArtifactPath,
  } = deps as MainProjectWorkspaceIpcDependencies;

  registerProjectNavigationDomainIpc({
    handleIpc,
    activeThreadIdForHost,
    emitProjectStateIfActive,
    normalizeWorkspacePath,
    readStateForProjectHostAction,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThread,
    resolveRegisteredProjectPathForHost,
    setProjectHostActiveThreadId,
    setProjectDisplayName: (workspacePath, name) =>
      projectRegistry.setDisplayName(workspacePath, name),
    setProjectPinned: (workspacePath, pinned) =>
      projectRegistry.setPinned(workspacePath, pinned),
    switchWorkspace,
  });

  registerProjectBoardDomainIpc({
    handleIpc,
    ...projectBoardDesktopIpcDependencies,
  });

  registerProjectThreadDomainIpc({
    handleIpc,
    activeThreadIdForHost,
    archiveProjectChats,
    createPermanentWorktree,
    disposeProjectRuntimeHost,
    emitDesktopState: (state) =>
      mainWindow?.webContents.send("desktop:event", { type: "state", state }),
    emitPermissionAuditCreated,
    emitPlannerPlanArtifactUpdated,
    emitProjectStateIfActive,
    emitThreadUpdated,
    generatePlannerDurableArtifact,
    initialActiveThreadIdForStore,
    isActiveProjectRuntimeHost,
    listRegisteredProjectPaths: () => projectRegistry.listRegisteredPaths(),
    normalizeWorkspacePath,
    openPath: (path) => shell.openPath(path),
    openThreadMiniWindow,
    parseThreadPermissionModeChange,
    parseThreadSettingsUpdate,
    pathExists: (workspacePath) => existsSync(workspacePath),
    permanentWorktreeBranchName,
    permissionModeChangeAuditDetail,
    prepareWorktreeForThread,
    projectRuntimeHostForWorkspacePath,
    readState,
    readStateForProjectHostAction,
    removeProject: (workspacePath: string) => projectRegistry.remove(workspacePath),
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForPlannerPlanArtifact,
    requireProjectRuntimeHostForThread,
    requireProjectRuntimeHostForThreadAction,
    resolveRegisteredProjectPathForHost,
    setProjectHostActiveThreadId,
    showItemInFolder: (path) => shell.showItemInFolder(path),
    showOpenDialog: (options) => dialog.showOpenDialog(mainWindow!, options),
    switchWorkspace,
    threadWorkingDirectory,
  });

  registerWorkspaceGitDomainIpc({
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
    rendererOfficePreviewService: officePreviewService,
    resolveLocalFilePath,
    resolveWorkspacePathForOpen,
    restoreLatestGitCheckpoint,
    searchWorkspace,
    setProjectHostActiveThreadId,
    shell,
    showOpenDialog: (options: OpenDialogOptions) =>
      dialog.showOpenDialog(mainWindow!, options),
    stageAllGitFiles,
    stageGitFile,
    switchWorkspaceBranch,
    unstageAllGitFiles,
    unstageGitFile,
    workspacePathForRelativeArtifactPath,
  });
}
