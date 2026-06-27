import { join, resolve } from "node:path";
import { z } from "zod";
import type { AmbientPermissionGrant } from "../../shared/permissionTypes";
import type { WorkspaceFileContent } from "../../shared/workspaceTypes";
import { permissionGrantAllowsLocalPath } from "./workspacePermissionsFacade";
import { readLocalFilePreview, readWorkspaceFile, type ReadWorkspaceFileOptions } from "./workspaceFiles";
import { isPathInside } from "./workspaceSessionFacade";

const workspacePathSchema = z.string().min(1).max(4096);
const localPathSchema = z.string().min(1).max(4096);

export type ActiveWorkspaceFileSpecialPath = "home" | "downloads" | "desktop" | "documents";

export interface ActiveWorkspaceFileThread {
  workspacePath: string;
}

export interface ActiveWorkspaceFileStore<Thread extends ActiveWorkspaceFileThread> {
  getThread(threadId: string): Thread;
  getProjectArtifactWorkspacePath(): string;
  getWorkspace?(): { path: string };
  listPermissionGrants(): readonly AmbientPermissionGrant[];
}

export interface ActiveWorkspaceFileHost<Store> {
  store: Store;
}

export interface ActiveWorkspaceFileContext<
  Host,
  Store,
  Thread extends ActiveWorkspaceFileThread,
> {
  host: Host;
  targetStore: Store;
  threadId: string;
  thread: Thread;
  workspacePath: string;
}

export interface ActiveWorkspaceFileServiceDependencies<
  Host,
  Store,
> {
  activeHost(): Host;
  activeThreadIdForHost(host: Host): string;
  activeWorkspacePath(): string;
  defaultStore(): Store;
  getAppPath(name: ActiveWorkspaceFileSpecialPath): string;
  normalizePath(path: string): string;
  pathExists(path: string): boolean;
  realpath(path: string): string;
  createMediaUrl: NonNullable<ReadWorkspaceFileOptions["createMediaUrl"]>;
  createOfficePreview: NonNullable<ReadWorkspaceFileOptions["createOfficePreview"]>;
}

export interface ActiveWorkspaceFileService<
  Host,
  Store,
  Thread extends ActiveWorkspaceFileThread,
> {
  activeWorkspaceFileContextForProjectHost(host?: Host): ActiveWorkspaceFileContext<Host, Store, Thread>;
  workspacePathForRelativeArtifactPath(relativePath: string, targetStore?: Store, fallbackWorkspacePath?: string): string;
  readActiveWorkspaceFile(
    requestedPath: string,
    context?: ActiveWorkspaceFileContext<Host, Store, Thread>,
  ): Promise<WorkspaceFileContent>;
  readActiveLocalFilePreview(
    requestedPath: string,
    context?: ActiveWorkspaceFileContext<Host, Store, Thread>,
  ): Promise<WorkspaceFileContent>;
  resolveLocalFilePath(requestedPath: string): string;
  resolveCanonicalLocalFilePath(requestedPath: string): string;
  resolveLocalPreviewPath(
    requestedPath: string,
    context?: ActiveWorkspaceFileContext<Host, Store, Thread> | string,
  ): string;
  assertLocalPreviewAllowed(
    absolutePath: string,
    context?: ActiveWorkspaceFileContext<Host, Store, Thread> | string,
  ): void;
  localPathVisibleToThread(
    absolutePath: string,
    context?: ActiveWorkspaceFileContext<Host, Store, Thread>,
  ): boolean;
  localPathInsideActiveWorkspace(
    absolutePath: string,
    context?: ActiveWorkspaceFileContext<Host, Store, Thread>,
  ): boolean;
}

export function createActiveWorkspaceFileService<
  Thread extends ActiveWorkspaceFileThread,
  Store extends ActiveWorkspaceFileStore<Thread>,
  Host extends ActiveWorkspaceFileHost<Store>,
>(
  dependencies: ActiveWorkspaceFileServiceDependencies<Host, Store>,
): ActiveWorkspaceFileService<Host, Store, Thread> {
  function activeWorkspaceFileContextForProjectHost(host: Host = dependencies.activeHost()): ActiveWorkspaceFileContext<Host, Store, Thread> {
    const threadId = dependencies.activeThreadIdForHost(host);
    const thread = host.store.getThread(threadId);
    return {
      host,
      targetStore: host.store,
      threadId,
      thread,
      workspacePath: thread.workspacePath,
    };
  }

  function workspacePathForRelativeArtifactPath(
    relativePath: string,
    targetStore: Store = dependencies.defaultStore(),
    fallbackWorkspacePath = dependencies.activeWorkspacePath(),
  ): string {
    const normalized = relativePath.replace(/\\/g, "/");
    if (normalized.startsWith(".ambient/board/plans/")) return targetStore.getProjectArtifactWorkspacePath();
    return fallbackWorkspacePath;
  }

  function readOptions(): ReadWorkspaceFileOptions {
    return {
      createMediaUrl: dependencies.createMediaUrl,
      createOfficePreview: dependencies.createOfficePreview,
    };
  }

  async function readActiveWorkspaceFile(
    requestedPath: string,
    context = activeWorkspaceFileContextForProjectHost(),
  ): Promise<WorkspaceFileContent> {
    const normalizedPath = workspacePathSchema.parse(requestedPath);
    return readWorkspaceFile(
      workspacePathForRelativeArtifactPath(normalizedPath, context.targetStore, context.workspacePath),
      normalizedPath,
      readOptions(),
    );
  }

  async function readActiveLocalFilePreview(
    requestedPath: string,
    context = activeWorkspaceFileContextForProjectHost(),
  ): Promise<WorkspaceFileContent> {
    const absolutePath = resolveLocalPreviewPath(requestedPath, context);
    return readLocalFilePreview(context.workspacePath, absolutePath, readOptions());
  }

  function resolveLocalFilePath(requestedPath: string): string {
    const path = requestedPath.trim();
    if (!path) throw new Error("Local file path is required.");
    let candidate = path;
    if (candidate.startsWith("file:")) {
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== "file:") throw new Error("Only file URLs can be opened as local files.");
        candidate = decodeURIComponent(parsed.pathname);
      } catch (error) {
        throw new Error(`Invalid local file URL: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    }
    if (candidate === "~") candidate = dependencies.getAppPath("home");
    else if (candidate.startsWith("~/") || candidate.startsWith("~\\")) candidate = join(dependencies.getAppPath("home"), candidate.slice(2));
    if (!candidate.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(candidate)) {
      throw new Error("Local file path must be absolute or start with ~/.");
    }
    const absolutePath = dependencies.normalizePath(candidate);
    if (!dependencies.pathExists(absolutePath)) throw new Error(`Local file does not exist: ${path}`);
    return absolutePath;
  }

  function resolveCanonicalLocalFilePath(requestedPath: string): string {
    const absolutePath = resolveLocalFilePath(requestedPath);
    return dependencies.realpath(absolutePath);
  }

  function resolveLocalPreviewPath(
    requestedPath: string,
    context: ActiveWorkspaceFileContext<Host, Store, Thread> | string = activeWorkspaceFileContextForProjectHost(),
  ): string {
    const absolutePath = resolveCanonicalLocalFilePath(localPathSchema.parse(requestedPath));
    assertLocalPreviewAllowed(absolutePath, context);
    return absolutePath;
  }

  function assertLocalPreviewAllowed(
    absolutePath: string,
    context: ActiveWorkspaceFileContext<Host, Store, Thread> | string = activeWorkspaceFileContextForProjectHost(),
  ): void {
    const fallbackContext = typeof context === "string" ? undefined : context;
    const workspacePath = typeof context === "string" ? context : context.workspacePath;
    if (isPathInside(resolve(workspacePath), resolve(absolutePath))) return;
    if (fallbackContext && localPathAllowedByGrant(absolutePath, fallbackContext)) return;
    throw new Error("Local file preview is limited to the current workspace or folders explicitly allowed for this thread.");
  }

  function localPathVisibleToThread(
    absolutePath: string,
    context = activeWorkspaceFileContextForProjectHost(),
  ): boolean {
    try {
      assertLocalPreviewAllowed(absolutePath, context);
      return true;
    } catch {
      return false;
    }
  }

  function localPathInsideActiveWorkspace(
    absolutePath: string,
    context = activeWorkspaceFileContextForProjectHost(),
  ): boolean {
    return isPathInside(resolve(context.workspacePath), resolve(absolutePath));
  }

  function localPathAllowedByGrant(
    absolutePath: string,
    context: ActiveWorkspaceFileContext<Host, Store, Thread>,
  ): boolean {
    const projectPath = context.targetStore.getWorkspace?.().path;
    return context.targetStore.listPermissionGrants().some((grant) =>
      permissionGrantAllowsLocalPath(
        grant,
        {
          threadId: context.threadId,
          workspacePath: context.workspacePath,
          projectPath,
        },
        absolutePath,
        "file_content_read",
      ),
    );
  }

  return {
    activeWorkspaceFileContextForProjectHost,
    assertLocalPreviewAllowed,
    localPathInsideActiveWorkspace,
    localPathVisibleToThread,
    readActiveLocalFilePreview,
    readActiveWorkspaceFile,
    resolveCanonicalLocalFilePath,
    resolveLocalFilePath,
    resolveLocalPreviewPath,
    workspacePathForRelativeArtifactPath,
  };
}
