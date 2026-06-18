import type { IpcMain, OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { z } from "zod";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type {
  OpenLocalPathInput,
  OpenWorkspacePathInput,
  PickWorkspaceContextInput,
  WorkspaceContextReference,
  WorkspaceDiff,
  WorkspaceFileContent,
  WorkspaceFileTree,
  WorkspaceGitStatus,
  WorkspaceOpenTarget,
  WorkspaceSearchInput,
  WorkspaceSearchResult,
} from "../../shared/workspaceTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;
type WorkspaceDialogResult = Pick<OpenDialogReturnValue, "canceled" | "filePaths">;

export const workspaceLifecycleIpcChannels = [
  "workspace:open",
  "workspace:create",
] as const;
export const workspaceFileIpcChannels = [
  "workspace:list-files",
  "workspace:read-file",
  "workspace:refresh-office-preview",
] as const;
export const localFilePreviewIpcChannels = [
  "local-file:preview",
  "local-file:refresh-office-preview",
] as const;
export const localFileActionIpcChannels = [
  "local-file:reveal-path",
  "local-file:open-path",
  "local-file:open-path-with",
] as const;
export const workspacePickContextIpcChannels = ["workspace:pick-context"] as const;
export const workspaceSearchIpcChannels = ["workspace:search"] as const;
export const workspacePathActionIpcChannels = [
  "workspace:reveal-path",
  "workspace:open-path",
  "workspace:list-open-targets",
  "workspace:open-path-with",
] as const;
export const workspaceGitStatusIpcChannels = [
  "workspace:diff",
  "workspace:git-status",
  "workspace:switch-branch",
] as const;

export interface WorkspaceFileContext {
  workspacePath: string;
}

export interface WorkspacePathActionContext<TargetStore = unknown> extends WorkspaceFileContext {
  targetStore: TargetStore;
}

export interface WorkspacePickContext extends WorkspaceFileContext {
  thread: {
    permissionMode: PermissionMode;
  };
}

export interface WorkspaceGitStatusContext<TargetStore = unknown, Thread = unknown> extends WorkspaceFileContext {
  targetStore: TargetStore;
  thread: Thread;
}

export interface RegisterWorkspaceLifecycleIpcDependencies {
  handleIpc: HandleIpc;
  showOpenDialog(options: OpenDialogOptions): MaybePromise<WorkspaceDialogResult>;
  createDirectory(workspacePath: string): void;
  switchWorkspace(workspacePath: string): MaybePromise<DesktopState>;
}

export interface RegisterWorkspaceFileIpcDependencies<Context extends WorkspaceFileContext = WorkspaceFileContext> {
  handleIpc: HandleIpc;
  activeWorkspaceFileContextForProjectHost(): Context;
  listWorkspaceFiles(workspacePath: string): MaybePromise<WorkspaceFileTree>;
  readActiveWorkspaceFile(requestedPath: string, context: Context): MaybePromise<WorkspaceFileContent>;
  clearOfficePreviewRendererDiscovery(): void;
}

export interface RegisterLocalFilePreviewIpcDependencies<Context extends WorkspaceFileContext = WorkspaceFileContext> {
  handleIpc: HandleIpc;
  activeWorkspaceFileContextForProjectHost(): Context;
  readActiveLocalFilePreview(requestedPath: string, workspacePath: string): MaybePromise<WorkspaceFileContent>;
  clearOfficePreviewRendererDiscovery(): void;
}

export interface RegisterLocalFileActionIpcDependencies {
  handleIpc: HandleIpc;
  resolveLocalFilePath(requestedPath: string): string;
  showItemInFolder(absolutePath: string): void;
  openPath(absolutePath: string): MaybePromise<string>;
  openWorkspaceTarget(absolutePath: string, targetId?: string): MaybePromise<void>;
}

export interface RegisterWorkspacePickContextIpcDependencies<Context extends WorkspacePickContext = WorkspacePickContext> {
  handleIpc: HandleIpc;
  activeWorkspaceFileContextForProjectHost(): Context;
  showOpenDialog(options: OpenDialogOptions): MaybePromise<WorkspaceDialogResult>;
  describeWorkspaceAbsoluteContextPaths(
    workspacePath: string,
    absolutePaths: readonly string[],
    options: { allowExternal?: boolean },
  ): MaybePromise<WorkspaceContextReference[]>;
}

export interface RegisterWorkspaceSearchIpcDependencies {
  handleIpc: HandleIpc;
  searchWorkspace(raw: WorkspaceSearchInput | string): MaybePromise<WorkspaceSearchResult[]>;
}

export interface WorkspaceResolvedOpenPath {
  absolutePath: string;
  realPath: string;
}

export interface RegisterWorkspacePathActionIpcDependencies<
  Context extends WorkspacePathActionContext = WorkspacePathActionContext,
> {
  handleIpc: HandleIpc;
  activeWorkspaceFileContextForProjectHost(): Context;
  workspacePathForRelativeArtifactPath(relativePath: string, targetStore: Context["targetStore"], fallbackWorkspacePath: string): string;
  resolveWorkspacePathForOpen(workspacePath: string, requestedPath: string): MaybePromise<WorkspaceResolvedOpenPath>;
  showItemInFolder(absolutePath: string): void;
  openPath(absolutePath: string): MaybePromise<string>;
  listWorkspaceOpenTargets(): MaybePromise<WorkspaceOpenTarget[]>;
  openWorkspaceTarget(absolutePath: string, targetId?: string): MaybePromise<void>;
}

export interface RegisterWorkspaceGitStatusIpcDependencies<
  Context extends WorkspaceGitStatusContext = WorkspaceGitStatusContext,
> {
  handleIpc: HandleIpc;
  activeGitContextForProjectHost(): Context;
  getWorkspaceDiff(workspacePath: string): MaybePromise<WorkspaceDiff>;
  getWorkspaceGitStatus(workspacePath: string): MaybePromise<WorkspaceGitStatus>;
  switchWorkspaceBranch(workspacePath: string, branch: string): MaybePromise<WorkspaceGitStatus>;
  createAndRecordPreGitActionCheckpoint(reason: string, thread: Context["thread"], targetStore: Context["targetStore"]): MaybePromise<unknown>;
}

const workspaceActionPathSchema = z.string().min(1).max(4096);
const openWorkspacePathSchema = z.object({
  path: workspaceActionPathSchema,
  targetId: z.string().min(1).max(120).optional(),
}) satisfies z.ZodType<OpenWorkspacePathInput>;
const localActionPathSchema = z.string().min(1).max(4096);
const openLocalPathSchema = z.object({
  path: localActionPathSchema,
  targetId: z.string().min(1).max(120).optional(),
}) satisfies z.ZodType<OpenLocalPathInput>;

const pickWorkspaceContextSchema = z.object({
  kind: z.enum(["file", "directory"]),
  allowExternal: z.boolean().optional(),
}) satisfies z.ZodType<PickWorkspaceContextInput>;
const gitBranchSchema = z.string().min(1).max(256);

export function registerWorkspaceLifecycleIpc({
  handleIpc,
  showOpenDialog,
  createDirectory,
  switchWorkspace,
}: RegisterWorkspaceLifecycleIpcDependencies): void {
  handleIpc("workspace:open", async () => {
    const result = await showOpenDialog({
      title: "Use an existing folder",
      buttonLabel: "Open Project",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    return switchWorkspace(result.filePaths[0]);
  });

  handleIpc("workspace:create", async () => {
    const result = await showOpenDialog({
      title: "Start from scratch",
      buttonLabel: "Create Project",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    createDirectory(result.filePaths[0]);
    return switchWorkspace(result.filePaths[0]);
  });
}

export function registerWorkspaceFileIpc<Context extends WorkspaceFileContext = WorkspaceFileContext>({
  handleIpc,
  activeWorkspaceFileContextForProjectHost,
  listWorkspaceFiles,
  readActiveWorkspaceFile,
  clearOfficePreviewRendererDiscovery,
}: RegisterWorkspaceFileIpcDependencies<Context>): void {
  handleIpc("workspace:list-files", () => listWorkspaceFiles(activeWorkspaceFileContextForProjectHost().workspacePath));

  handleIpc("workspace:read-file", (_event, requestedPath: string) =>
    readActiveWorkspaceFile(requestedPath, activeWorkspaceFileContextForProjectHost()),
  );

  handleIpc("workspace:refresh-office-preview", async (_event, requestedPath: string) => {
    const context = activeWorkspaceFileContextForProjectHost();
    clearOfficePreviewRendererDiscovery();
    return readActiveWorkspaceFile(requestedPath, context);
  });
}

export function registerLocalFilePreviewIpc<Context extends WorkspaceFileContext = WorkspaceFileContext>({
  handleIpc,
  activeWorkspaceFileContextForProjectHost,
  readActiveLocalFilePreview,
  clearOfficePreviewRendererDiscovery,
}: RegisterLocalFilePreviewIpcDependencies<Context>): void {
  handleIpc("local-file:preview", (_event, requestedPath: string) =>
    readActiveLocalFilePreview(requestedPath, activeWorkspaceFileContextForProjectHost().workspacePath),
  );

  handleIpc("local-file:refresh-office-preview", async (_event, requestedPath: string) => {
    const context = activeWorkspaceFileContextForProjectHost();
    clearOfficePreviewRendererDiscovery();
    return readActiveLocalFilePreview(requestedPath, context.workspacePath);
  });
}

export function registerLocalFileActionIpc({
  handleIpc,
  resolveLocalFilePath,
  showItemInFolder,
  openPath,
  openWorkspaceTarget,
}: RegisterLocalFileActionIpcDependencies): void {
  handleIpc("local-file:reveal-path", (_event, requestedPath: string) => {
    showItemInFolder(resolveLocalFilePath(localActionPathSchema.parse(requestedPath)));
  });

  handleIpc("local-file:open-path", async (_event, requestedPath: string) => {
    const error = await openPath(resolveLocalFilePath(localActionPathSchema.parse(requestedPath)));
    if (error) throw new Error(error);
  });

  handleIpc("local-file:open-path-with", async (_event, raw: OpenLocalPathInput) => {
    const input = openLocalPathSchema.parse(raw);
    await openWorkspaceTarget(resolveLocalFilePath(input.path), input.targetId);
  });
}

export function registerWorkspacePickContextIpc<Context extends WorkspacePickContext = WorkspacePickContext>({
  handleIpc,
  activeWorkspaceFileContextForProjectHost,
  showOpenDialog,
  describeWorkspaceAbsoluteContextPaths,
}: RegisterWorkspacePickContextIpcDependencies<Context>): void {
  handleIpc("workspace:pick-context", async (_event, raw: PickWorkspaceContextInput) => {
    const input = pickWorkspaceContextSchema.parse(raw);
    const context = activeWorkspaceFileContextForProjectHost();
    const result = await showOpenDialog({
      title: input.kind === "file" ? "Add Files As Context" : "Add Folders As Context",
      defaultPath: context.workspacePath,
      properties: input.kind === "file" ? ["openFile", "multiSelections"] : ["openDirectory", "multiSelections"],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    const allowExternal = Boolean(input.allowExternal && context.thread.permissionMode === "full-access");
    return describeWorkspaceAbsoluteContextPaths(context.workspacePath, result.filePaths, { allowExternal });
  });
}

export function registerWorkspaceSearchIpc({ handleIpc, searchWorkspace }: RegisterWorkspaceSearchIpcDependencies): void {
  handleIpc("workspace:search", (_event, raw: WorkspaceSearchInput | string) => searchWorkspace(raw));
}

export function registerWorkspacePathActionIpc<Context extends WorkspacePathActionContext = WorkspacePathActionContext>({
  handleIpc,
  activeWorkspaceFileContextForProjectHost,
  workspacePathForRelativeArtifactPath,
  resolveWorkspacePathForOpen,
  showItemInFolder,
  openPath,
  listWorkspaceOpenTargets,
  openWorkspaceTarget,
}: RegisterWorkspacePathActionIpcDependencies<Context>): void {
  const resolveActiveWorkspacePath = async (requestedPath: string) => {
    const context = activeWorkspaceFileContextForProjectHost();
    const normalizedPath = workspaceActionPathSchema.parse(requestedPath);
    return resolveWorkspacePathForOpen(
      workspacePathForRelativeArtifactPath(normalizedPath, context.targetStore, context.workspacePath),
      normalizedPath,
    );
  };

  handleIpc("workspace:reveal-path", async (_event, requestedPath: string) => {
    const resolvedPath = await resolveActiveWorkspacePath(requestedPath);
    showItemInFolder(resolvedPath.absolutePath);
  });

  handleIpc("workspace:open-path", async (_event, requestedPath: string) => {
    const resolvedPath = await resolveActiveWorkspacePath(requestedPath);
    const error = await openPath(resolvedPath.realPath);
    if (error) throw new Error(error);
  });

  handleIpc("workspace:list-open-targets", () => listWorkspaceOpenTargets());

  handleIpc("workspace:open-path-with", async (_event, raw: OpenWorkspacePathInput) => {
    const input = openWorkspacePathSchema.parse(raw);
    const resolvedPath = await resolveActiveWorkspacePath(input.path);
    await openWorkspaceTarget(resolvedPath.realPath, input.targetId);
  });
}

export function registerWorkspaceGitStatusIpc<Context extends WorkspaceGitStatusContext = WorkspaceGitStatusContext>({
  handleIpc,
  activeGitContextForProjectHost,
  getWorkspaceDiff,
  getWorkspaceGitStatus,
  switchWorkspaceBranch,
  createAndRecordPreGitActionCheckpoint,
}: RegisterWorkspaceGitStatusIpcDependencies<Context>): void {
  handleIpc("workspace:diff", () => getWorkspaceDiff(activeGitContextForProjectHost().workspacePath));

  handleIpc("workspace:git-status", () => getWorkspaceGitStatus(activeGitContextForProjectHost().workspacePath));

  handleIpc("workspace:switch-branch", async (_event, branch: string) => {
    const nextBranch = gitBranchSchema.parse(branch);
    const context = activeGitContextForProjectHost();
    const status = await getWorkspaceGitStatus(context.workspacePath);
    if (status.isGitRepository && status.dirtyCount > 0 && nextBranch !== status.branch) {
      await createAndRecordPreGitActionCheckpoint("Before switching branches with local changes.", context.thread, context.targetStore);
    }
    return switchWorkspaceBranch(context.workspacePath, nextBranch);
  });
}
