import { existsSync, realpathSync } from "node:fs";
import { cp, lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
  MutationWorkspaceLease,
  ChildLaunchPolicySnapshot,
} from "../../shared/symphonyFineGrainedContracts";
import {
  assertValidMutationWorkspaceLease,
  SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
} from "../../shared/symphonyFineGrainedContracts";
import type { SubagentRunEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";

export const SYMPHONY_MUTATION_WORKSPACE_LEASE_SERVICE_SCHEMA_VERSION =
  "ambient-symphony-mutation-workspace-lease-service-v1" as const;
export const SYMPHONY_MUTATION_PROMOTION_BUNDLE_SCHEMA_VERSION =
  "ambient-symphony-mutation-promotion-bundle-v1" as const;

export interface SymphonyMutationWorkspaceLeaseStore {
  getThread(threadId: string): ThreadSummary;
  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary;
  updateSubagentRunMutationWorkspaceLease(runId: string, lease: MutationWorkspaceLease): SubagentRunSummary;
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
}

export interface AcquireSymphonyMutationWorkspaceLeaseInput {
  store: SymphonyMutationWorkspaceLeaseStore;
  parentThread: ThreadSummary;
  run: SubagentRunSummary;
  policy: ChildLaunchPolicySnapshot;
  childWorktree?: ThreadWorktreeSummary;
  requestedWriteRoots?: readonly string[];
  scratchRootBasePath?: string;
  now?: string;
  isGitWorkspace?: (workspacePath: string) => Promise<boolean> | boolean;
  mkdirp?: (path: string) => Promise<void> | void;
}

export interface SymphonyMutationWorkspaceLeaseServiceDependencies {
  isGitWorkspace(workspacePath: string): Promise<boolean> | boolean;
}

export interface SymphonyMutationWorkspaceLeaseService {
  acquireSymphonyMutationWorkspaceLease(
    input: AcquireSymphonyMutationWorkspaceLeaseInput,
  ): Promise<AcquireSymphonyMutationWorkspaceLeaseResult>;
}

export interface AcquireSymphonyMutationWorkspaceLeaseResult {
  schemaVersion: typeof SYMPHONY_MUTATION_WORKSPACE_LEASE_SERVICE_SCHEMA_VERSION;
  acquired: boolean;
  lease?: MutationWorkspaceLease;
  run: SubagentRunSummary;
  reason?: string;
}

export interface SymphonyMutationPromotionBundle {
  schemaVersion: typeof SYMPHONY_MUTATION_PROMOTION_BUNDLE_SCHEMA_VERSION;
  bundleId: string;
  leaseId: string;
  parentThreadId: string;
  childThreadId: string;
  childRunId: string;
  kind: MutationWorkspaceLease["kind"];
  rootPath: string;
  declaredWritableRoots: string[];
  writableRoots: string[];
  diffArtifactRefs: string[];
  changedArtifactRefs: string[];
  checkRefs: string[];
  createdAt: string;
}

export function createSymphonyMutationWorkspaceLeaseService(
  dependencies: SymphonyMutationWorkspaceLeaseServiceDependencies,
): SymphonyMutationWorkspaceLeaseService {
  return {
    acquireSymphonyMutationWorkspaceLease: (input) =>
      acquireSymphonyMutationWorkspaceLease(input, dependencies),
  };
}

async function acquireSymphonyMutationWorkspaceLease(
  input: AcquireSymphonyMutationWorkspaceLeaseInput,
  dependencies: SymphonyMutationWorkspaceLeaseServiceDependencies,
): Promise<AcquireSymphonyMutationWorkspaceLeaseResult> {
  if (input.policy.mutation !== "lease_required") {
    return {
      schemaVersion: SYMPHONY_MUTATION_WORKSPACE_LEASE_SERVICE_SCHEMA_VERSION,
      acquired: false,
      run: input.run,
      reason: "Symphony child launch policy does not require a mutation workspace lease.",
    };
  }
  const now = input.now ?? new Date().toISOString();
  const activeWorktree = activeChildWorktree(input.childWorktree, input);
  let lease: MutationWorkspaceLease;
  try {
    lease = activeWorktree
      ? await gitWorktreeLease(input, activeWorktree, now)
      : await scratchOverlayLease(input, dependencies, now);
    if (lease.status === "active") {
      input.store.updateThreadWorkspacePath(input.run.childThreadId, lease.rootPath);
    }
  } catch (error) {
    lease = failedLease(
      input,
      now,
      `Mutation workspace lease acquisition failed: ${error instanceof Error ? error.message : String(error)}`,
      activeWorktree ? "git_worktree" : "scratch_overlay",
    );
  }

  const updated = input.store.updateSubagentRunMutationWorkspaceLease(input.run.id, lease);
  input.store.appendSubagentRunEvent(input.run.id, {
    type: lease.status === "active" ? "symphony.mutation_lease_acquired" : "symphony.mutation_lease_failed",
    preview: compactMutationWorkspaceLeaseEventPreview(lease),
    createdAt: now,
  });
  return {
    schemaVersion: SYMPHONY_MUTATION_WORKSPACE_LEASE_SERVICE_SCHEMA_VERSION,
    acquired: lease.status === "active",
    lease,
    run: updated,
    ...(lease.status === "active" ? {} : { reason: "Mutation workspace lease acquisition failed." }),
  };
}

export function releaseSymphonyMutationWorkspaceLease(
  lease: MutationWorkspaceLease | undefined,
  input: { now?: string; promotionBundleId?: string } = {},
): MutationWorkspaceLease | undefined {
  if (!lease) return undefined;
  if (lease.status === "released") return lease;
  if (!["active", "promoting"].includes(lease.status)) return lease;
  return assertValidMutationWorkspaceLease({
    ...lease,
    status: "released",
    ...(input.promotionBundleId ? { promotionBundleId: input.promotionBundleId } : {}),
    lastHeartbeatAt: input.now ?? new Date().toISOString(),
  });
}

export function heartbeatSymphonyMutationWorkspaceLease(
  lease: MutationWorkspaceLease,
  now = new Date().toISOString(),
): MutationWorkspaceLease {
  return assertValidMutationWorkspaceLease({
    ...lease,
    lastHeartbeatAt: now,
  });
}

export function buildSymphonyMutationPromotionBundle(input: {
  lease: MutationWorkspaceLease;
  diffArtifactRefs: readonly string[];
  changedArtifactRefs: readonly string[];
  checkRefs: readonly string[];
  createdAt?: string;
  bundleId?: string;
}): SymphonyMutationPromotionBundle {
  const lease = assertValidMutationWorkspaceLease(input.lease);
  if (lease.status !== "active" && lease.status !== "promoting") {
    throw new Error(`Cannot prepare a Symphony mutation promotion bundle for lease ${lease.leaseId} while status is ${lease.status}.`);
  }
  if (input.diffArtifactRefs.length === 0 && input.changedArtifactRefs.length === 0) {
    throw new Error("Symphony mutation promotion bundle requires diff or changed-artifact evidence.");
  }
  if (input.checkRefs.length === 0) {
    throw new Error("Symphony mutation promotion bundle requires at least one check reference.");
  }
  return {
    schemaVersion: SYMPHONY_MUTATION_PROMOTION_BUNDLE_SCHEMA_VERSION,
    bundleId: input.bundleId ?? `${lease.leaseId}:promotion:${Date.parse(input.createdAt ?? new Date().toISOString()) || 0}`,
    leaseId: lease.leaseId,
    parentThreadId: lease.parentThreadId,
    childThreadId: lease.childThreadId,
    childRunId: lease.childRunId,
    kind: lease.kind,
    rootPath: lease.rootPath,
    declaredWritableRoots: [...lease.declaredWritableRoots],
    writableRoots: [...lease.writableRoots],
    diffArtifactRefs: [...input.diffArtifactRefs],
    changedArtifactRefs: [...input.changedArtifactRefs],
    checkRefs: [...input.checkRefs],
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

async function scratchOverlayLease(
  input: AcquireSymphonyMutationWorkspaceLeaseInput,
  dependencies: SymphonyMutationWorkspaceLeaseServiceDependencies,
  now: string,
): Promise<MutationWorkspaceLease> {
  const isGit = await (input.isGitWorkspace ?? dependencies.isGitWorkspace)(input.parentThread.workspacePath);
  if (isGit) {
    return failedLease(input, now, "Git workspace requires a prepared child worktree before mutation tools can launch.");
  }
  const scratchBasePath = resolve(
    input.scratchRootBasePath ?? join(
      tmpdir(),
      "ambient-symphony-mutation-leases",
      safePathSegment(input.parentThread.id),
    ),
  );
  const rootPath = resolve(scratchBasePath, safePathSegment(input.run.id));
  const declaredWritableRoots = narrowedDeclaredWritableRoots({
    parentWorkspacePath: input.parentThread.workspacePath,
    policyWritableRoots: input.policy.writableRoots,
    requestedWriteRoots: input.requestedWriteRoots,
  });
  const writableRoots = isolatedWritableRoots({
    parentWorkspacePath: input.parentThread.workspacePath,
    rootPath,
    declaredWritableRoots,
  });
  const mkdirp = input.mkdirp ?? defaultMkdirp;
  await mkdirp(scratchBasePath);
  await assertPathIsNotSymlink(scratchBasePath);
  await mkdirp(rootPath);
  const invalidLeaseRoot = await materializeIsolatedWritableRoots(scratchBasePath, [rootPath], mkdirp);
  if (invalidLeaseRoot) {
    return failedLease(
      input,
      now,
      `Scratch overlay root ${invalidLeaseRoot.root} resolves outside scratch lease base ${scratchBasePath}.`,
      "scratch_overlay",
    );
  }
  await seedScratchOverlaySourceTree({
    parentWorkspacePath: input.parentThread.workspacePath,
    rootPath,
  });
  const invalidRoot = await materializeIsolatedWritableRoots(scratchBasePath, writableRoots, mkdirp);
  if (invalidRoot) {
    return failedLease(
      input,
      now,
      `Scratch overlay writable root ${invalidRoot.root} resolves outside scratch lease base ${scratchBasePath}.`,
      "scratch_overlay",
    );
  }
  return validLease({
    input,
    now,
    kind: "scratch_overlay",
    rootPath,
    declaredWritableRoots,
    writableRoots,
  });
}

async function gitWorktreeLease(
  input: AcquireSymphonyMutationWorkspaceLeaseInput,
  worktree: ThreadWorktreeSummary,
  now: string,
): Promise<MutationWorkspaceLease> {
  const declaredWritableRoots = narrowedDeclaredWritableRoots({
    parentWorkspacePath: input.parentThread.workspacePath,
    policyWritableRoots: input.policy.writableRoots,
    requestedWriteRoots: input.requestedWriteRoots,
  });
  const writableRoots = isolatedWritableRoots({
    parentWorkspacePath: input.parentThread.workspacePath,
    rootPath: worktree.worktreePath,
    declaredWritableRoots,
  });
  const mkdirp = input.mkdirp ?? defaultMkdirp;
  const invalidRoot = await materializeIsolatedWritableRoots(worktree.worktreePath, writableRoots, mkdirp);
  if (invalidRoot) {
    return failedLease(
      input,
      now,
      `Git worktree writable root ${invalidRoot.root} resolves outside child worktree ${worktree.worktreePath}.`,
      "git_worktree",
    );
  }
  return validLease({
    input,
    now,
    kind: "git_worktree",
    rootPath: worktree.worktreePath,
    declaredWritableRoots,
    writableRoots,
  });
}

function validLease(input: {
  input: AcquireSymphonyMutationWorkspaceLeaseInput;
  now: string;
  kind: MutationWorkspaceLease["kind"];
  rootPath: string;
  declaredWritableRoots: readonly string[];
  writableRoots: readonly string[];
}): MutationWorkspaceLease {
  return assertValidMutationWorkspaceLease({
    schemaVersion: SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
    leaseId: `symphony-mutation:${input.input.run.id}`,
    parentThreadId: input.input.run.parentThreadId,
    childThreadId: input.input.run.childThreadId,
    childRunId: input.input.run.id,
    kind: input.kind,
    rootPath: input.rootPath,
    sourceRoots: uniqueAbsoluteRoots([
      input.input.parentThread.workspacePath,
      ...input.input.policy.inheritedAuthorityRoots,
    ]),
    readOnlyBaseRoots: uniqueAbsoluteRoots(input.input.policy.inheritedAuthorityRoots),
    declaredWritableRoots: uniqueAbsoluteRoots(input.declaredWritableRoots),
    writableRoots: uniqueAbsoluteRoots(input.writableRoots),
    status: "active",
    acquiredAt: input.now,
    lastHeartbeatAt: input.now,
  });
}

function failedLease(
  input: AcquireSymphonyMutationWorkspaceLeaseInput,
  now: string,
  reason: string,
  kind: MutationWorkspaceLease["kind"] = "git_worktree",
): MutationWorkspaceLease {
  return assertValidMutationWorkspaceLease({
    schemaVersion: SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
    leaseId: `symphony-mutation:${input.run.id}`,
    parentThreadId: input.run.parentThreadId,
    childThreadId: input.run.childThreadId,
    childRunId: input.run.id,
    kind,
    rootPath: input.parentThread.workspacePath,
    sourceRoots: uniqueAbsoluteRoots([input.parentThread.workspacePath, ...input.policy.inheritedAuthorityRoots]),
    readOnlyBaseRoots: uniqueAbsoluteRoots(input.policy.inheritedAuthorityRoots),
    declaredWritableRoots: uniqueAbsoluteRoots(input.policy.writableRoots),
    writableRoots: [],
    status: "failed",
    failureReason: reason,
    acquiredAt: now,
    lastHeartbeatAt: now,
  });
}

function activeChildWorktree(
  worktree: ThreadWorktreeSummary | undefined,
  input: AcquireSymphonyMutationWorkspaceLeaseInput,
): ThreadWorktreeSummary | undefined {
  if (!worktree || worktree.status !== "active") return undefined;
  if (worktree.threadId !== input.run.childThreadId) return undefined;
  if (pathsEqual(worktree.worktreePath, input.parentThread.workspacePath)) return undefined;
  return worktree;
}

function isolatedWritableRoots(input: {
  parentWorkspacePath: string;
  rootPath: string;
  declaredWritableRoots: readonly string[];
}): string[] {
  const mapped = uniqueAbsoluteRoots(input.declaredWritableRoots)
    .map((declaredRoot) => mapDeclaredRootToIsolatedRoot(input.parentWorkspacePath, input.rootPath, declaredRoot));
  return mapped.length > 0 ? mapped : [input.rootPath];
}

function narrowedDeclaredWritableRoots(input: {
  parentWorkspacePath: string;
  policyWritableRoots: readonly string[];
  requestedWriteRoots?: readonly string[];
}): string[] {
  const policyRoots = uniqueAbsoluteRoots(input.policyWritableRoots);
  const requestedRoots = uniqueAbsoluteRoots(resolveAuthorityRoots(input.requestedWriteRoots ?? [], input.parentWorkspacePath))
    .filter((root) => pathWithinAnyRoot(root, policyRoots));
  return requestedRoots.length > 0 ? requestedRoots : policyRoots;
}

function resolveAuthorityRoots(values: readonly string[], parentWorkspacePath: string): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => isAbsolute(value) ? resolve(value) : resolve(parentWorkspacePath, value));
}

async function firstRootOutside(
  rootPath: string,
  writableRoots: readonly string[],
): Promise<{ root: string } | undefined> {
  const resolvedRoot = await realpath(rootPath);
  for (const writableRoot of writableRoots) {
    const resolvedWritableRoot = await realpath(writableRoot);
    if (!isPathInside(resolvedRoot, resolvedWritableRoot)) return { root: writableRoot };
  }
  return undefined;
}

async function seedScratchOverlaySourceTree(input: {
  parentWorkspacePath: string;
  rootPath: string;
}): Promise<void> {
  await copySourcePath(resolve(input.parentWorkspacePath), resolve(input.rootPath));
}

async function copySourcePath(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await cp(sourcePath, targetPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
      dereference: false,
      filter: async (source) => {
        try {
          return !(await lstat(source)).isSymbolicLink();
        } catch (error) {
          if (isFsErrorCode(error, "ENOENT")) return false;
          throw error;
        }
      },
    });
  } catch (error) {
    if (isFsErrorCode(error, "ENOENT") || isFsErrorCode(error, "EEXIST")) return;
    throw error;
  }
}

async function materializeIsolatedWritableRoots(
  rootPath: string,
  writableRoots: readonly string[],
  mkdirp: (path: string) => Promise<void> | void,
): Promise<{ root: string } | undefined> {
  for (const writableRoot of writableRoots) {
    if (!pathWithinAnyRoot(writableRoot, [rootPath])) return { root: writableRoot };
    const symlinkPrefix = await firstExistingSymlinkPrefix(rootPath, writableRoot);
    if (symlinkPrefix) return { root: symlinkPrefix };
    await mkdirp(writableRoot);
  }
  return firstRootOutside(rootPath, writableRoots);
}

async function firstExistingSymlinkPrefix(rootPath: string, targetPath: string): Promise<string | undefined> {
  let current = resolve(rootPath);
  const target = resolve(targetPath);
  if (current === target) return undefined;
  while (pathWithinAnyRoot(target, [current]) && current !== target) {
    const rel = relative(current, target);
    const nextPart = rel.split(sep).filter(Boolean)[0];
    if (!nextPart) break;
    current = join(current, nextPart);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) return current;
      const resolvedCurrent = await realpath(current);
      const resolvedRoot = await realpath(rootPath);
      if (!isPathInside(resolvedRoot, resolvedCurrent)) return current;
    } catch {
      break;
    }
  }
  const existingParent = await nearestExistingPath(dirname(target));
  if (existingParent) {
    const resolvedParent = await realpath(existingParent);
    const resolvedRoot = await realpath(rootPath);
    if (!isPathInside(resolvedRoot, resolvedParent)) return existingParent;
  }
  return undefined;
}

async function nearestExistingPath(path: string): Promise<string | undefined> {
  let current = resolve(path);
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}

async function assertPathIsNotSymlink(path: string): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink()) throw new Error(`Scratch lease base ${path} must not be a symlink.`);
}

function pathWithinAnyRoot(candidate: string, roots: readonly string[]): boolean {
  return roots.some((root) => isPathInside(root, candidate));
}

function mapDeclaredRootToIsolatedRoot(parentWorkspacePath: string, isolatedRootPath: string, declaredRoot: string): string {
  if (!isPathInside(parentWorkspacePath, declaredRoot)) {
    return join(isolatedRootPath, "external", safePathSegment(basename(declaredRoot) || "root"));
  }
  const rel = relative(parentWorkspacePath, declaredRoot);
  if (!rel || rel === ".") return isolatedRootPath;
  const cleaned = rel.split(sep).filter((part) => part && part !== "." && part !== "..");
  return join(isolatedRootPath, ...cleaned);
}

function uniqueAbsoluteRoots(values: readonly string[]): string[] {
  const roots = values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => isAbsolute(value) ? resolve(value) : value)
    .filter((value) => isAbsolute(value));
  return [...new Set(roots)];
}

function compactMutationWorkspaceLeaseEventPreview(lease: MutationWorkspaceLease): Record<string, unknown> {
  return {
    leaseId: lease.leaseId,
    parentThreadId: lease.parentThreadId,
    childThreadId: lease.childThreadId,
    childRunId: lease.childRunId,
    kind: lease.kind,
    status: lease.status,
    rootPath: lease.rootPath,
    declaredWritableRoots: lease.declaredWritableRoots,
    writableRoots: lease.writableRoots,
    readOnlyBaseRoots: lease.readOnlyBaseRoots,
    acquiredAt: lease.acquiredAt,
    lastHeartbeatAt: lease.lastHeartbeatAt,
    ...(lease.status === "failed" && lease.failureReason ? { reason: lease.failureReason } : {}),
  };
}

async function defaultMkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function listSymphonyMutationWorkspaceFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  await collectFiles(rootPath, rootPath, files);
  return files.sort();
}

async function collectFiles(rootPath: string, currentPath: string, files: string[]): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(rootPath, entryPath, files);
    } else if (entry.isFile()) {
      files.push(relative(rootPath, entryPath));
    }
  }
}

function safePathSegment(value: string): string {
  const segment = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return segment || "lease";
}

function pathsEqual(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  return resolve(left) === resolve(right);
}

function nearestExistingContainmentPath(path: string): string | undefined {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
}

function canonicalContainmentPath(path: string): string {
  const resolved = resolve(path);
  const existing = nearestExistingContainmentPath(resolved);
  if (!existing) return resolved;
  let realExisting: string;
  try {
    realExisting = realpathSync.native(existing);
  } catch {
    realExisting = resolve(existing);
  }
  if (existing === resolved) return realExisting;
  return resolve(realExisting, relative(existing, resolved));
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const parent = canonicalContainmentPath(parentPath);
  const child = canonicalContainmentPath(childPath);
  const childRelativePath = relative(parent, child);
  return childRelativePath === "" || (!childRelativePath.startsWith("..") && !isAbsolute(childRelativePath));
}

function isFsErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}
