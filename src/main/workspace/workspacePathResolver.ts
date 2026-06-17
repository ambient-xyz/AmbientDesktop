import { constants as fsConstants } from "node:fs";
import type { Stats } from "node:fs";
import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { isPathInside } from "../session/sessionPaths";

export interface ResolvedWorkspaceReadPath {
  workspacePath: string;
  absolutePath: string;
  displayPath: string;
  realPath: string;
  lstat: Stats;
  stat: Stats;
  symlink: boolean;
}

export interface PreparedWorkspaceWritePath {
  workspacePath: string;
  absolutePath: string;
  displayPath: string;
  parentPath: string;
  parentRealPath: string;
}

export interface WorkspacePathAuthorityOptions {
  authorityRootPaths?: readonly string[];
  includeWorkspaceRootAuthority?: boolean;
}

export const NOFOLLOW_OPEN_FLAG =
  typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;

export function resolveWorkspacePathLexical(workspacePath: string, requestedPath: string): string {
  assertPathHasNoControlCharacters(workspacePath);
  assertPathHasNoControlCharacters(requestedPath);
  const workspace = resolve(workspacePath);
  const absolutePath = resolve(workspace, requestedPath);
  if (!isPathInside(workspace, absolutePath)) {
    throw new Error("Path is outside the current workspace.");
  }
  return absolutePath;
}

export function normalizeWorkspaceAuthorityRootPaths(
  workspacePath: string,
  authorityRootPaths: readonly string[] = [],
  includeWorkspaceRootAuthority = true,
): string[] {
  assertPathHasNoControlCharacters(workspacePath);
  const roots = [
    ...(includeWorkspaceRootAuthority ? [workspacePath] : []),
    ...authorityRootPaths,
  ]
    .map((root) => {
      assertPathHasNoControlCharacters(root);
      return resolve(root);
    })
    .filter(Boolean);
  return [...new Set(roots)];
}

export async function resolveWorkspacePathForRead(
  workspacePath: string,
  requestedPath: string,
  options: WorkspacePathAuthorityOptions = {},
): Promise<ResolvedWorkspaceReadPath> {
  const workspace = resolve(workspacePath);
  const requested = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(workspace, requestedPath);
  return resolveWorkspaceAbsolutePathForRead(workspacePath, requested, options);
}

export async function resolveWorkspaceAbsolutePathForRead(
  workspacePath: string,
  requestedAbsolutePath: string,
  options: WorkspacePathAuthorityOptions = {},
): Promise<ResolvedWorkspaceReadPath> {
  assertPathHasNoControlCharacters(workspacePath);
  assertPathHasNoControlCharacters(requestedAbsolutePath);
  const workspace = resolve(workspacePath);
  const absolutePath = resolve(requestedAbsolutePath);
  const root = selectLexicalAuthorityRoot(workspace, absolutePath, options);
  if (!root) throw new Error("Path is outside the current workspace authority.");

  const realRoot = await realpath(root);
  const linkStat = await lstat(absolutePath);
  const targetRealPath = await realpath(absolutePath);
  if (!isPathInside(realRoot, targetRealPath)) {
    throw new Error("Path resolves outside the current workspace authority.");
  }

  const targetStat = await stat(targetRealPath);
  return {
    workspacePath: workspace,
    absolutePath,
    displayPath: displayPathForAuthority(workspace, absolutePath),
    realPath: targetRealPath,
    lstat: linkStat,
    stat: targetStat,
    symlink: linkStat.isSymbolicLink(),
  };
}

export async function prepareWorkspacePathForWrite(
  workspacePath: string,
  requestedPath: string,
  options: WorkspacePathAuthorityOptions = {},
): Promise<PreparedWorkspaceWritePath> {
  const workspace = resolve(workspacePath);
  const absolutePath = isAbsolute(requestedPath) ? resolve(requestedPath) : resolveWorkspacePathLexical(workspace, requestedPath);
  return prepareWorkspaceAbsolutePathForWrite(workspace, absolutePath, options);
}

export async function prepareWorkspaceAbsolutePathForWrite(
  workspacePath: string,
  requestedAbsolutePath: string,
  options: WorkspacePathAuthorityOptions = {},
): Promise<PreparedWorkspaceWritePath> {
  assertPathHasNoControlCharacters(workspacePath);
  assertPathHasNoControlCharacters(requestedAbsolutePath);
  const workspace = resolve(workspacePath);
  const absolutePath = resolve(requestedAbsolutePath);
  const root = selectLexicalAuthorityRoot(workspace, absolutePath, options);
  if (!root) throw new Error("Path is outside the current workspace authority.");
  const realRoot = await realpath(root);
  const parentPath = dirname(absolutePath);

  await assertExistingAncestorInside(realRoot, parentPath);
  await mkdir(parentPath, { recursive: true });
  const parentRealPath = await realpath(parentPath);
  if (!isPathInside(realRoot, parentRealPath)) {
    throw new Error("Path resolves outside the current workspace authority.");
  }

  const existing = await lstatIfExists(absolutePath);
  if (existing?.isSymbolicLink()) {
    throw new Error("Cannot write through a workspace symlink.");
  }
  if (existing && !existing.isFile()) {
    throw new Error("Only files can be written.");
  }

  return {
    workspacePath: workspace,
    absolutePath,
    displayPath: displayPathForAuthority(workspace, absolutePath),
    parentPath,
    parentRealPath,
  };
}

export async function prepareWorkspaceDirectoryForCreate(
  workspacePath: string,
  requestedAbsolutePath: string,
  options: WorkspacePathAuthorityOptions = {},
): Promise<string> {
  assertPathHasNoControlCharacters(workspacePath);
  assertPathHasNoControlCharacters(requestedAbsolutePath);
  const workspace = resolve(workspacePath);
  const absolutePath = resolve(requestedAbsolutePath);
  const root = selectLexicalAuthorityRoot(workspace, absolutePath, options);
  if (!root) throw new Error("Path is outside the current workspace authority.");

  const realRoot = await realpath(root);
  await assertExistingAncestorInside(realRoot, absolutePath);
  await mkdir(absolutePath, { recursive: true });
  const directoryRealPath = await realpath(absolutePath);
  if (!isPathInside(realRoot, directoryRealPath)) {
    throw new Error("Path resolves outside the current workspace authority.");
  }
  return absolutePath;
}

export async function prepareWorkspacePathForDelete(
  workspacePath: string,
  requestedPath: string,
): Promise<string> {
  const workspace = resolve(workspacePath);
  const absolutePath = resolveWorkspacePathLexical(workspace, requestedPath);
  const realWorkspace = await realpath(workspace);
  const existing = await lstatIfExists(absolutePath);
  if (existing) {
    const targetRealPath = await realpath(absolutePath);
    if (!isPathInside(realWorkspace, targetRealPath)) {
      throw new Error("Path resolves outside the current workspace.");
    }
    return absolutePath;
  }
  await assertExistingAncestorInside(realWorkspace, dirname(absolutePath));
  return absolutePath;
}

async function assertExistingAncestorInside(realWorkspace: string, requestedPath: string): Promise<void> {
  let current = resolve(requestedPath);
  while (true) {
    const currentStat = await lstatIfExists(current);
    if (currentStat) {
      const currentRealPath = await realpath(current);
      if (!isPathInside(realWorkspace, currentRealPath)) {
        throw new Error("Path resolves outside the current workspace.");
      }
      if (!currentStat.isDirectory()) {
        throw new Error("Workspace path parent is not a directory.");
      }
      return;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error("Workspace path parent does not exist.");
    }
    current = parent;
  }
}

function selectLexicalAuthorityRoot(
  workspacePath: string,
  absolutePath: string,
  options: WorkspacePathAuthorityOptions = {},
): string | undefined {
  return normalizeWorkspaceAuthorityRootPaths(
    workspacePath,
    options.authorityRootPaths,
    options.includeWorkspaceRootAuthority !== false,
  )
    .sort((left, right) => right.length - left.length)
    .find((root) => isPathInside(root, absolutePath));
}

function displayPathForAuthority(workspacePath: string, absolutePath: string): string {
  return isPathInside(workspacePath, absolutePath) ? relative(workspacePath, absolutePath) || "." : absolutePath;
}

async function lstatIfExists(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    throw error;
  }
}

function assertPathHasNoControlCharacters(path: string): void {
  if (/[\u0000-\u001f\u007f]/.test(path)) {
    throw new Error("Path contains unsupported control characters.");
  }
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
