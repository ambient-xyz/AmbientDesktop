import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import type { SubagentToolScopeSnapshotSummary } from "../../shared/subagentTypes";
import type { AmbientPermissionGrant, PermissionRequest } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { enrichPermissionRequest } from "../permissions/permissionGrants";

export type FileAuthorityAccess = "read" | "write";
export type FileAuthorityActionKind = "file_content_read" | "local_file_write";
type FileToolAccess = "read" | "write" | "edit";

const TRANSIENT_FILE_AUTHORITY_TTL_MS = 2 * 60_000;

export interface TransientFileAuthorityRoot {
  rootPath: string;
  actionKind: FileAuthorityActionKind;
  expiresAt: number;
  reason: string;
}

export interface TransientFileAuthorityRootDraft {
  path: string;
  actionKind: FileAuthorityActionKind;
  reason: string;
}

export interface TransientFileAuthorityAllowedToolInput {
  workspacePath: string;
  toolName: string;
  toolInput: unknown;
  reason: string;
}

export interface TransientFileAuthorityAllowedToolDependencies {
  fileToolAccess: (toolName: string) => FileToolAccess | undefined;
  pathForTool: (toolName: string, requestedPath: string) => string;
  resolvePolicyPath: (workspacePath: string, requestedPath: string) => Promise<{ absolutePath: string }>;
}

export interface TransientFileAuthorityRootsForAccessResult {
  activeEntries: TransientFileAuthorityRoot[];
  rootPaths: string[];
}

export interface TransientFileAuthorityRootStore {
  get(threadId: string): readonly TransientFileAuthorityRoot[] | undefined;
  set(threadId: string, roots: TransientFileAuthorityRoot[]): void;
}

export interface MutableTransientFileAuthorityRootStore extends TransientFileAuthorityRootStore {
  delete(threadId: string): boolean;
}

export interface RecordTransientFileAuthorityAllowedToolInput {
  threadId: string;
  workspacePath: string;
  toolName: string;
  toolInput: unknown;
  reason: string;
}

export interface RecordTransientFileAuthorityAllowedToolDependencies extends TransientFileAuthorityAllowedToolDependencies {
  roots: TransientFileAuthorityRootStore;
}

export interface RecordTransientFileAuthorityPermissionRequestInput {
  threadId: string;
  thread: Pick<ThreadSummary, "permissionMode" | "workspacePath">;
  projectPath: string;
  request: Omit<PermissionRequest, "id">;
  reason: string;
}

export interface RecordTransientFileAuthorityPermissionRequestDependencies {
  roots: TransientFileAuthorityRootStore;
}

export interface FileAuthorityRootPathsInput {
  thread: Pick<ThreadSummary, "id" | "workspacePath" | "kind" | "subagentRunId">;
  projectPath: string;
  access: FileAuthorityAccess;
  dependencyWorkspacePaths?: readonly string[];
  permissionGrants?: readonly AmbientPermissionGrant[];
  transientRootPaths?: readonly string[];
  childAuthorityRootPaths?: readonly string[];
  now?: number;
}

export interface RuntimeFileAuthorityRootPathsStore {
  getThread(threadId: string): Pick<ThreadSummary, "id" | "workspacePath" | "kind" | "subagentRunId">;
  getWorkspace(): { path: string };
  getProjectBoardDependencyWorkspacePathsForExecutionThread(threadId: string): readonly string[];
  listPermissionGrants(): readonly AmbientPermissionGrant[];
  listSubagentToolScopeSnapshots?(runId: string): readonly SubagentToolScopeSnapshotSummary[];
}

export interface RuntimeFileAuthorityRootPathsDependencies {
  store: RuntimeFileAuthorityRootPathsStore;
  transientRoots: MutableTransientFileAuthorityRootStore;
  now?: number;
}

export function fileAuthorityRootPathsForThread(input: FileAuthorityRootPathsInput): string[] {
  const roots = new Set<string>();
  if (includeDefaultWorkspaceAuthorityRoots(input.thread)) {
    roots.add(input.thread.workspacePath);
    roots.add(input.projectPath);
  }
  if (input.access === "read" && includeDefaultWorkspaceAuthorityRoots(input.thread)) {
    for (const dependencyPath of input.dependencyWorkspacePaths ?? []) {
      roots.add(dependencyPath);
    }
  }
  for (const grant of input.permissionGrants ?? []) {
    const grantedPath = fileAuthorityPathFromGrant(grant, input.thread, input.projectPath, input.access, input.now);
    if (grantedPath) roots.add(grantedPath);
  }
  for (const childAuthorityRoot of input.childAuthorityRootPaths ?? []) {
    roots.add(childAuthorityRoot);
  }
  for (const transientRoot of input.transientRootPaths ?? []) {
    roots.add(transientRoot);
  }
  return [...roots];
}

export function includeDefaultWorkspaceAuthorityRoots(
  thread: Pick<ThreadSummary, "kind">,
): boolean {
  return thread.kind !== "subagent_child";
}

export function runtimeFileAuthorityRootPathsForThread(
  threadId: string,
  access: FileAuthorityAccess,
  dependencies: RuntimeFileAuthorityRootPathsDependencies,
): string[] {
  const thread = dependencies.store.getThread(threadId);
  return fileAuthorityRootPathsForThread({
    thread,
    projectPath: dependencies.store.getWorkspace().path,
    access,
    dependencyWorkspacePaths: dependencies.store.getProjectBoardDependencyWorkspacePathsForExecutionThread(threadId),
    permissionGrants: dependencies.store.listPermissionGrants(),
    transientRootPaths: transientFileAuthorityRootPathsForThread(threadId, access, dependencies.transientRoots, dependencies.now),
    childAuthorityRootPaths: childAuthorityFileRootPathsForThread(
      thread,
      access,
      dependencies.store.listSubagentToolScopeSnapshots?.bind(dependencies.store),
    ),
    now: dependencies.now,
  });
}

export function childAuthorityFileRootPathsForThread(
  thread: Pick<ThreadSummary, "subagentRunId">,
  access: FileAuthorityAccess,
  listSnapshots?: (runId: string) => readonly SubagentToolScopeSnapshotSummary[],
): string[] {
  if (!thread.subagentRunId || !listSnapshots) return [];
  const latest = listSnapshots(thread.subagentRunId).at(-1);
  if (!latest) return [];
  return childAuthorityFileRootPathsFromSnapshot(latest, access);
}

export function childAuthorityFileRootPathsFromSnapshot(
  snapshot: Pick<SubagentToolScopeSnapshotSummary, "resolverInputs">,
  access: FileAuthorityAccess,
): string[] {
  const resolverInputs = recordValue(snapshot.resolverInputs);
  const profile = recordValue(resolverInputs?.childAuthorityProfile);
  const resourceScopes = recordValue(profile?.resourceScopes);
  const filesystem = recordValue(resourceScopes?.filesystem);
  if (!filesystem) return [];

  if (access === "read") {
    return stringField(filesystem, "readDecision") === "allow"
      ? stringArrayField(filesystem, "readRoots")
      : [];
  }

  const writeDecision = stringField(filesystem, "writeDecision");
  return writeDecision === "allow" || writeDecision === "allow_isolated_worktree"
    ? stringArrayField(filesystem, "writeRoots")
    : [];
}

export function transientFileAuthorityRootPathsForThread(
  threadId: string,
  access: FileAuthorityAccess,
  roots: MutableTransientFileAuthorityRootStore,
  now = Date.now(),
): string[] {
  const entries = roots.get(threadId) ?? [];
  const { activeEntries, rootPaths } = transientFileAuthorityRootsForAccess(entries, access, now);
  if (activeEntries.length !== entries.length) {
    if (activeEntries.length) roots.set(threadId, activeEntries);
    else roots.delete(threadId);
  }
  return rootPaths;
}

export async function recordTransientFileAuthorityForAllowedTool(
  input: RecordTransientFileAuthorityAllowedToolInput,
  dependencies: RecordTransientFileAuthorityAllowedToolDependencies,
): Promise<void> {
  const root = await transientFileAuthorityRootFromAllowedTool({
    workspacePath: input.workspacePath,
    toolName: input.toolName,
    toolInput: input.toolInput,
    reason: input.reason,
  }, dependencies);
  if (root) addTransientFileAuthorityRoot(input.threadId, root, dependencies.roots);
}

export function recordTransientFileAuthorityFromPermissionRequest(
  input: RecordTransientFileAuthorityPermissionRequestInput,
  dependencies: RecordTransientFileAuthorityPermissionRequestDependencies,
): void {
  const enriched = enrichPermissionRequest(input.request, {
    permissionMode: input.thread.permissionMode,
    threadId: input.threadId,
    projectPath: input.projectPath,
    workspacePath: input.thread.workspacePath,
  });
  const root = transientFileAuthorityRootFromPermissionRequest(enriched, input.reason);
  if (root) addTransientFileAuthorityRoot(input.threadId, root, dependencies.roots);
}

export function addTransientFileAuthorityRoot(
  threadId: string,
  root: TransientFileAuthorityRootDraft,
  roots: TransientFileAuthorityRootStore,
): void {
  roots.set(
    threadId,
    transientFileAuthorityRootsWithAddedRoot(roots.get(threadId) ?? [], root),
  );
}

export async function transientFileAuthorityRootFromAllowedTool(
  input: TransientFileAuthorityAllowedToolInput,
  dependencies: TransientFileAuthorityAllowedToolDependencies,
): Promise<TransientFileAuthorityRootDraft | undefined> {
  const fileTool = dependencies.fileToolAccess(input.toolName);
  if (!fileTool) return undefined;
  const requestedPath = stringField(input.toolInput, "path");
  if (!requestedPath) return undefined;
  const pathCheck = await dependencies.resolvePolicyPath(
    input.workspacePath,
    dependencies.pathForTool(input.toolName, requestedPath),
  );
  return {
    path: pathCheck.absolutePath,
    actionKind: fileTool === "read" ? "file_content_read" : "local_file_write",
    reason: input.reason,
  };
}

export function transientFileAuthorityRootFromPermissionRequest(
  request: Omit<PermissionRequest, "id">,
  reason: string,
): TransientFileAuthorityRootDraft | undefined {
  if (request.grantTargetKind !== "path") return undefined;
  if (request.grantActionKind !== "file_content_read" && request.grantActionKind !== "local_file_write") return undefined;
  const conditionsPath = request.grantConditions && typeof request.grantConditions.path === "string"
    ? request.grantConditions.path
    : undefined;
  const path = conditionsPath ?? request.grantTargetLabel;
  if (!path || !isAbsolute(path)) return undefined;
  return { path, actionKind: request.grantActionKind, reason };
}

export function transientFileAuthorityRootsWithAddedRoot(
  entries: readonly TransientFileAuthorityRoot[],
  root: TransientFileAuthorityRootDraft,
  now = Date.now(),
): TransientFileAuthorityRoot[] {
  const rootPath = root.actionKind === "local_file_write" ? nearestExistingDirectoryForAuthority(root.path) : root.path;
  return [
    ...entries.filter((entry) => entry.expiresAt > now),
    {
      rootPath,
      actionKind: root.actionKind,
      expiresAt: now + TRANSIENT_FILE_AUTHORITY_TTL_MS,
      reason: root.reason,
    },
  ];
}

export function transientFileAuthorityRootsForAccess(
  entries: readonly TransientFileAuthorityRoot[],
  access: FileAuthorityAccess,
  now = Date.now(),
): TransientFileAuthorityRootsForAccessResult {
  const activeEntries = entries.filter((entry) => entry.expiresAt > now);
  return {
    activeEntries,
    rootPaths: activeEntries
      .filter((entry) => access === "read" || entry.actionKind === "local_file_write")
      .map((entry) => entry.rootPath),
  };
}

export function fileAuthorityPathFromGrant(
  grant: AmbientPermissionGrant,
  thread: Pick<ThreadSummary, "id" | "workspacePath">,
  projectPath: string,
  access: FileAuthorityAccess,
  now = Date.now(),
): string | undefined {
  if (grant.revokedAt) return undefined;
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now) return undefined;
  if (grant.targetKind !== "path") return undefined;
  if (access === "write") {
    if (grant.actionKind !== "local_file_write") return undefined;
  } else if (grant.actionKind !== "file_content_read" && grant.actionKind !== "local_file_write") {
    return undefined;
  }
  if (grant.scopeKind === "thread" && grant.threadId !== thread.id) return undefined;
  if (grant.scopeKind === "project" && grant.projectPath !== projectPath) return undefined;
  if (grant.scopeKind === "workspace" && grant.workspacePath !== thread.workspacePath) return undefined;
  if (grant.scopeKind === "workflow_thread" || grant.scopeKind === "global_plugin") return undefined;
  const conditionsPath = grant.conditions && typeof grant.conditions === "object" && typeof (grant.conditions as { path?: unknown }).path === "string"
    ? (grant.conditions as { path: string }).path
    : undefined;
  const path = conditionsPath ?? grant.targetLabel;
  if (!path || !isAbsolute(path)) return undefined;
  if (access === "write") return nearestExistingDirectoryForAuthority(path);
  return path;
}

function stringField(value: unknown, key: string): string | undefined {
  return value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)[key] === "string"
    ? String((value as Record<string, unknown>)[key])
    : undefined;
}

function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  const raw = value[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function nearestExistingDirectoryForAuthority(path: string): string {
  let candidate = path;
  while (true) {
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Keep walking toward an existing parent.
    }
    const parent = dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
}
