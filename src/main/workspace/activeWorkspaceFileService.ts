import { join, resolve } from "node:path";
import { z } from "zod";
import type { WorkspaceFileContent } from "../../shared/workspaceTypes";
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
  readActiveLocalFilePreview(requestedPath: string, workspacePath?: string): Promise<WorkspaceFileContent>;
  resolveLocalFilePath(requestedPath: string): string;
  resolveLocalPreviewPath(requestedPath: string, workspacePath?: string): string;
  assertLocalPreviewAllowed(absolutePath: string, workspacePath?: string): void;
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
    workspacePath = activeWorkspaceFileContextForProjectHost().workspacePath,
  ): Promise<WorkspaceFileContent> {
    const absolutePath = resolveLocalPreviewPath(requestedPath, workspacePath);
    return readLocalFilePreview(workspacePath, absolutePath, readOptions());
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

  function resolveLocalPreviewPath(requestedPath: string, workspacePath = dependencies.activeWorkspacePath()): string {
    const absolutePath = resolveLocalFilePath(localPathSchema.parse(requestedPath));
    assertLocalPreviewAllowed(absolutePath, workspacePath);
    return absolutePath;
  }

  function assertLocalPreviewAllowed(absolutePath: string, workspacePath = dependencies.activeWorkspacePath()): void {
    const resolvedPath = resolve(absolutePath);
    const roots = [
      workspacePath,
      safeAppPath("downloads"),
      safeAppPath("desktop"),
      safeAppPath("documents"),
    ]
      .filter((root): root is string => Boolean(root))
      .map((root) => resolve(root));
    if (roots.some((root) => resolvedPath === root || isPathInside(root, resolvedPath))) return;
    throw new Error("Local file preview is limited to the current workspace, Downloads, Desktop, and Documents.");
  }

  function safeAppPath(name: Exclude<ActiveWorkspaceFileSpecialPath, "home">): string | undefined {
    try {
      return dependencies.getAppPath(name);
    } catch {
      return undefined;
    }
  }

  return {
    activeWorkspaceFileContextForProjectHost,
    assertLocalPreviewAllowed,
    readActiveLocalFilePreview,
    readActiveWorkspaceFile,
    resolveLocalFilePath,
    resolveLocalPreviewPath,
    workspacePathForRelativeArtifactPath,
  };
}
