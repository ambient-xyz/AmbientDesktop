import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ThreadWorktreeSummary } from "../../shared/threadTypes";
import { isPathInside } from "./ambientSessionFacade";

const execFileAsync = promisify(execFile);
const defaultTimeoutMs = 60_000;
const validationTimeoutMs = 180_000;

export type AmbientGitOperationStatus = "complete" | "blocked" | "failed";

export interface AmbientGitBlocker {
  code: string;
  message: string;
  detail?: string;
}

export interface AmbientGitValidationResult {
  command: string;
  status: "passed" | "failed";
  durationMs: number;
  output?: string;
}

export interface AmbientGitWorktreeEntry {
  path: string;
  head?: string;
  branch?: string;
  bare?: boolean;
  detached?: boolean;
}

export interface AmbientGitStatusResult {
  status: AmbientGitOperationStatus;
  operation: "status";
  projectRoot: string;
  threadWorkspacePath: string;
  threadWorktree?: ThreadWorktreeSummary;
  branch?: string;
  upstream?: string;
  remote?: string;
  head?: string;
  dirtyCount: number;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  ahead: number;
  behind: number;
  worktrees: AmbientGitWorktreeEntry[];
  mainOwner?: AmbientGitWorktreeEntry;
  recommendedActions: string[];
  blockers: AmbientGitBlocker[];
}

export interface AmbientGitCommitInput {
  message?: string;
  paths?: string[];
  all?: boolean;
  dryRun?: boolean;
  allowSharedWorkspace?: boolean;
}

export interface AmbientGitCommitResult {
  status: AmbientGitOperationStatus;
  operation: "commit";
  projectRoot: string;
  threadWorkspacePath: string;
  branch?: string;
  commitHash?: string;
  committed: boolean;
  stagedPaths: string[];
  remainingDirtyCount: number;
  blockers: AmbientGitBlocker[];
}

export interface AmbientGitFinishToMainInput {
  targetBranch?: string;
  validationCommands?: string[];
  push?: boolean;
  mergeMessage?: string;
  integrationWorktreePath?: string;
}

export interface AmbientGitFinishToMainResult {
  status: AmbientGitOperationStatus;
  operation: "finish_to_main";
  projectRoot: string;
  threadWorkspacePath: string;
  sourceBranch?: string;
  targetBranch: string;
  targetWorktreePath?: string;
  sourceCommit?: string;
  mergeCommit?: string;
  pushed: boolean;
  validation: AmbientGitValidationResult[];
  blockers: AmbientGitBlocker[];
}

interface GitRepoSnapshot {
  branch?: string;
  upstream?: string;
  remote?: string;
  head?: string;
  dirtyCount: number;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  ahead: number;
  behind: number;
}

export async function ambientGitStatus(input: {
  projectRoot: string;
  threadWorkspacePath: string;
  threadWorktree?: ThreadWorktreeSummary;
  targetBranch?: string;
}): Promise<AmbientGitStatusResult> {
  const projectRoot = resolve(input.projectRoot);
  const threadWorkspacePath = resolve(input.threadWorkspacePath);
  const targetBranch = input.targetBranch?.trim() || "main";
  const repo = await git(threadWorkspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (!repo.ok) {
    return {
      status: "blocked",
      operation: "status",
      projectRoot,
      threadWorkspacePath,
      threadWorktree: input.threadWorktree,
      dirtyCount: 0,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      ahead: 0,
      behind: 0,
      worktrees: [],
      recommendedActions: ["Initialize Git before using Ambient Git tools."],
      blockers: [{ code: "not-git-repository", message: "The active thread workspace is not a Git repository.", detail: repo.output }],
    };
  }

  const [snapshot, worktrees] = await Promise.all([gitRepoSnapshot(threadWorkspacePath), listGitWorktrees(projectRoot)]);
  const mainOwner = worktrees.find((worktree) => worktree.branch === targetBranch);
  return {
    status: snapshot.conflictedCount > 0 ? "blocked" : "complete",
    operation: "status",
    projectRoot,
    threadWorkspacePath,
    threadWorktree: input.threadWorktree,
    ...snapshot,
    worktrees,
    mainOwner,
    recommendedActions: ambientGitRecommendedActions({ snapshot, threadWorkspacePath, projectRoot, mainOwner, targetBranch }),
    blockers: snapshot.conflictedCount > 0
      ? [{ code: "conflicts-present", message: "Resolve merge conflicts before committing or finishing to main." }]
      : [],
  };
}

export async function ambientGitCommit(input: {
  projectRoot: string;
  threadWorkspacePath: string;
  threadWorktree?: ThreadWorktreeSummary;
  commit: AmbientGitCommitInput;
}): Promise<AmbientGitCommitResult> {
  const projectRoot = resolve(input.projectRoot);
  const threadWorkspacePath = resolve(input.threadWorkspacePath);
  const message = input.commit.message?.trim() ?? "";
  if (!message) return commitBlocked(projectRoot, threadWorkspacePath, "missing-message", "Commit message is required.");

  const preflight = await ambientGitStatus({
    projectRoot,
    threadWorkspacePath,
    threadWorktree: input.threadWorktree,
  });
  if (preflight.status === "blocked" && preflight.blockers.length > 0) {
    return { ...commitBlocked(projectRoot, threadWorkspacePath, "preflight-blocked", "Git preflight blocked commit."), blockers: preflight.blockers };
  }
  if (threadWorkspacePath === projectRoot && input.threadWorktree?.status !== "active" && input.commit.allowSharedWorkspace !== true) {
    return commitBlocked(
      projectRoot,
      threadWorkspacePath,
      "shared-project-root",
      "Refusing to commit from the shared project root without allowSharedWorkspace=true.",
    );
  }
  if (preflight.conflictedCount > 0) return commitBlocked(projectRoot, threadWorkspacePath, "conflicts-present", "Resolve conflicts before committing.");

  const paths = uniqueRelativeGitPaths(threadWorkspacePath, input.commit.paths ?? []);
  if (input.commit.dryRun) {
    return {
      status: "complete",
      operation: "commit",
      projectRoot,
      threadWorkspacePath,
      branch: preflight.branch,
      committed: false,
      stagedPaths: input.commit.all ? ["<all>"] : paths,
      remainingDirtyCount: preflight.dirtyCount,
      blockers: [],
    };
  }

  await ensureLocalGitIdentity(threadWorkspacePath);
  if (input.commit.all) {
    await gitOrThrow(threadWorkspacePath, ["add", "--all", "--"]);
  } else if (paths.length > 0) {
    await gitOrThrow(threadWorkspacePath, ["add", "--", ...paths]);
  }

  const staged = await gitStatusPorcelain(threadWorkspacePath);
  if (staged.stagedCount === 0) {
    return commitBlocked(projectRoot, threadWorkspacePath, "nothing-staged", "No staged changes are available to commit.");
  }

  await gitOrThrow(threadWorkspacePath, ["commit", "-m", message], defaultTimeoutMs);
  const commitHash = await gitOrThrow(threadWorkspacePath, ["rev-parse", "HEAD"]);
  const remaining = await gitStatusPorcelain(threadWorkspacePath);
  return {
    status: "complete",
    operation: "commit",
    projectRoot,
    threadWorkspacePath,
    branch: (await git(threadWorkspacePath, ["branch", "--show-current"])).output || undefined,
    commitHash,
    committed: true,
    stagedPaths: input.commit.all ? ["<all>"] : paths,
    remainingDirtyCount: remaining.dirtyCount,
    blockers: [],
  };
}

export async function ambientGitFinishToMain(input: {
  projectRoot: string;
  threadWorkspacePath: string;
  finish: AmbientGitFinishToMainInput;
}): Promise<AmbientGitFinishToMainResult> {
  const projectRoot = resolve(input.projectRoot);
  const threadWorkspacePath = resolve(input.threadWorkspacePath);
  const targetBranch = input.finish.targetBranch?.trim() || "main";
  const validationCommands = (input.finish.validationCommands ?? []).map((command) => command.trim()).filter(Boolean);
  const baseResult: AmbientGitFinishToMainResult = {
    status: "blocked",
    operation: "finish_to_main",
    projectRoot,
    threadWorkspacePath,
    targetBranch,
    pushed: false,
    validation: [],
    blockers: [],
  };

  const source = await gitRepoSnapshot(threadWorkspacePath);
  if (!source.branch) return finishBlocked(baseResult, "detached-source", "The thread worktree is detached; finish-to-main requires a source branch.");
  if (source.branch === targetBranch) return finishBlocked(baseResult, "source-is-target", `The active thread is already on ${targetBranch}.`);
  if (source.conflictedCount > 0) return finishBlocked(baseResult, "source-conflicts", "Resolve source worktree conflicts before finishing to main.");
  if (source.dirtyCount > 0) return finishBlocked(baseResult, "source-dirty", "Commit or discard thread worktree changes before finishing to main.");

  const sourceCommit = await gitOrThrow(threadWorkspacePath, ["rev-parse", "HEAD"]);
  baseResult.sourceBranch = source.branch;
  baseResult.sourceCommit = sourceCommit;

  const targetReady = await ensureTargetBranch(projectRoot, targetBranch);
  if (!targetReady.ok) return finishBlocked(baseResult, "target-branch-missing", targetReady.message);

  const targetWorktree = await resolveTargetWorktree({
    projectRoot,
    targetBranch,
    integrationWorktreePath: input.finish.integrationWorktreePath,
  });
  if (!targetWorktree.ok) return finishBlocked(baseResult, targetWorktree.code, targetWorktree.message);
  baseResult.targetWorktreePath = targetWorktree.path;

  const targetBefore = await gitRepoSnapshot(targetWorktree.path);
  if (targetBefore.conflictedCount > 0) return finishBlocked(baseResult, "target-conflicts", "Resolve target worktree conflicts before merging.");
  if (targetBefore.dirtyCount > 0) return finishBlocked(baseResult, "target-dirty", "The target main worktree has local changes. Commit, stash, or discard them before finishing.");

  const fetchResult = await maybeFetchTarget(targetWorktree.path, targetBranch);
  if (!fetchResult.ok) return finishBlocked(baseResult, "fetch-failed", fetchResult.message);

  const fastForward = await fastForwardTarget(targetWorktree.path);
  if (!fastForward.ok) return finishBlocked(baseResult, "target-not-fast-forwardable", fastForward.message);

  await ensureLocalGitIdentity(targetWorktree.path);
  const mergeMessage = input.finish.mergeMessage?.trim() || `Merge ${source.branch} into ${targetBranch}`;
  const merge = await git(targetWorktree.path, ["merge", "--no-ff", source.branch, "-m", mergeMessage], defaultTimeoutMs);
  if (!merge.ok) {
    await git(targetWorktree.path, ["merge", "--abort"], defaultTimeoutMs);
    return finishBlocked(baseResult, "merge-conflict", merge.output || `Could not merge ${source.branch} into ${targetBranch}.`);
  }
  baseResult.mergeCommit = await gitOrThrow(targetWorktree.path, ["rev-parse", "HEAD"]);

  for (const command of validationCommands) {
    const validation = await runValidationCommand(targetWorktree.path, command);
    baseResult.validation.push(validation);
    if (validation.status === "failed") {
      return {
        ...baseResult,
        status: "failed",
        blockers: [{ code: "validation-failed", message: `Validation failed: ${command}`, detail: validation.output }],
      };
    }
  }

  if (input.finish.push === true) {
    const pushed = await git(targetWorktree.path, ["push", "origin", targetBranch], defaultTimeoutMs);
    if (!pushed.ok) {
      return {
        ...baseResult,
        status: "failed",
        blockers: [{ code: "push-failed", message: `Could not push ${targetBranch}.`, detail: pushed.output }],
      };
    }
    baseResult.pushed = true;
  }

  return { ...baseResult, status: "complete", blockers: [] };
}

export function parseGitWorktreeList(output: string): AmbientGitWorktreeEntry[] {
  const entries: AmbientGitWorktreeEntry[] = [];
  let current: AmbientGitWorktreeEntry | undefined;
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) entries.push(current);
      current = undefined;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") {
      if (current) entries.push(current);
      current = { path: value };
    } else if (current && key === "HEAD") {
      current.head = value;
    } else if (current && key === "branch") {
      current.branch = value.replace(/^refs\/heads\//, "");
    } else if (current && key === "bare") {
      current.bare = true;
    } else if (current && key === "detached") {
      current.detached = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function commitBlocked(projectRoot: string, threadWorkspacePath: string, code: string, message: string): AmbientGitCommitResult {
  return {
    status: "blocked",
    operation: "commit",
    projectRoot,
    threadWorkspacePath,
    committed: false,
    stagedPaths: [],
    remainingDirtyCount: 0,
    blockers: [{ code, message }],
  };
}

function finishBlocked(result: AmbientGitFinishToMainResult, code: string, message: string, detail?: string): AmbientGitFinishToMainResult {
  return { ...result, status: "blocked", blockers: [{ code, message, detail }] };
}

async function gitRepoSnapshot(workspacePath: string): Promise<GitRepoSnapshot> {
  const [branch, upstream, remote, head, aheadBehind, status] = await Promise.all([
    git(workspacePath, ["branch", "--show-current"]),
    git(workspacePath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    git(workspacePath, ["remote", "get-url", "origin"]),
    git(workspacePath, ["rev-parse", "HEAD"]),
    git(workspacePath, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
    gitStatusPorcelain(workspacePath),
  ]);
  const [aheadText = "0", behindText = "0"] = aheadBehind.ok ? aheadBehind.output.trim().split(/\s+/) : [];
  return {
    branch: branch.output || undefined,
    upstream: upstream.ok ? upstream.output : undefined,
    remote: remote.ok ? remote.output : undefined,
    head: head.ok ? head.output : undefined,
    dirtyCount: status.dirtyCount,
    stagedCount: status.stagedCount,
    unstagedCount: status.unstagedCount,
    untrackedCount: status.untrackedCount,
    conflictedCount: status.conflictedCount,
    ahead: Number.parseInt(aheadText, 10) || 0,
    behind: Number.parseInt(behindText, 10) || 0,
  };
}

async function gitStatusPorcelain(workspacePath: string): Promise<{
  dirtyCount: number;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
}> {
  const status = await gitRaw(workspacePath, ["status", "--short"]);
  const files = parsePorcelainStatus(status.output);
  return {
    dirtyCount: files.length,
    stagedCount: files.filter((file) => file.staged).length,
    unstagedCount: files.filter((file) => file.unstaged).length,
    untrackedCount: files.filter((file) => file.untracked).length,
    conflictedCount: files.filter((file) => file.conflicted).length,
  };
}

function parsePorcelainStatus(output: string): Array<{
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}> {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !porcelainPath(line).startsWith(".ambient-codex/") && porcelainPath(line) !== ".ambient-codex")
    .map((line) => {
      const status = line.slice(0, 2);
      const untracked = status === "??";
      const conflicted = status.includes("U") || ["AA", "DD", "AU", "UA", "DU", "UD"].includes(status);
      return {
        staged: !untracked && status[0] !== " " && status[0] !== "?",
        unstaged: !untracked && status[1] !== " " && status[1] !== "?",
        untracked,
        conflicted,
      };
    });
}

function porcelainPath(line: string): string {
  const rawPath = line.slice(3).trim();
  const renamed = rawPath.includes(" -> ");
  return renamed ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
}

async function listGitWorktrees(projectRoot: string): Promise<AmbientGitWorktreeEntry[]> {
  const listed = await gitRaw(projectRoot, ["worktree", "list", "--porcelain"]);
  return listed.ok ? parseGitWorktreeList(listed.output) : [];
}

function ambientGitRecommendedActions(input: {
  snapshot: GitRepoSnapshot;
  threadWorkspacePath: string;
  projectRoot: string;
  mainOwner?: AmbientGitWorktreeEntry;
  targetBranch: string;
}): string[] {
  const actions: string[] = [];
  if (input.threadWorkspacePath === input.projectRoot) actions.push("Create or attach a thread worktree before committing isolated changes.");
  if (input.snapshot.conflictedCount > 0) actions.push("Resolve merge conflicts before any Git mutation.");
  else if (input.snapshot.dirtyCount > 0) actions.push("Use ambient_git_commit to commit thread work.");
  else if (input.snapshot.branch && input.snapshot.branch !== input.targetBranch) actions.push(`Use ambient_git_finish_to_main to merge ${input.snapshot.branch} into ${input.targetBranch}.`);
  if (!input.mainOwner) actions.push(`Ambient will need to create or reuse a managed ${input.targetBranch} integration worktree.`);
  if (input.snapshot.behind > 0) actions.push("Pull or fast-forward the current branch before publishing.");
  if (actions.length === 0) actions.push("No Git action is currently required.");
  return actions;
}

function uniqueRelativeGitPaths(workspacePath: string, paths: string[]): string[] {
  return [...new Set(paths.map((path) => relativeGitPath(workspacePath, path)))];
}

function relativeGitPath(workspacePath: string, rawPath: string): string {
  const path = rawPath.trim();
  if (!path || path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) throw new Error("Git tool paths must be relative to the active thread workspace.");
  const absolute = join(workspacePath, path);
  if (!isPathInside(workspacePath, absolute)) throw new Error(`Git tool path is outside the active thread workspace: ${rawPath}`);
  return path;
}

async function ensureTargetBranch(projectRoot: string, targetBranch: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const local = await git(projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${targetBranch}`]);
  if (local.ok) return { ok: true };
  const remote = await git(projectRoot, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${targetBranch}`]);
  if (!remote.ok) return { ok: false, message: `Target branch ${targetBranch} does not exist locally or at origin/${targetBranch}.` };
  const created = await git(projectRoot, ["branch", targetBranch, `origin/${targetBranch}`], defaultTimeoutMs);
  return created.ok ? { ok: true } : { ok: false, message: created.output || `Could not create local ${targetBranch} from origin/${targetBranch}.` };
}

async function resolveTargetWorktree(input: {
  projectRoot: string;
  targetBranch: string;
  integrationWorktreePath?: string;
}): Promise<{ ok: true; path: string } | { ok: false; code: string; message: string }> {
  const existing = (await listGitWorktrees(input.projectRoot)).find((worktree) => worktree.branch === input.targetBranch);
  if (existing) return { ok: true, path: existing.path };

  const integrationPath = resolve(
    input.integrationWorktreePath ?? join(input.projectRoot, ".ambient-codex", "git-integration", sanitizePathSegment(input.targetBranch)),
  );
  if (!isPathInside(input.projectRoot, integrationPath)) {
    return { ok: false, code: "integration-worktree-outside-project", message: "Managed integration worktree path must stay inside the project root." };
  }
  if (existsSync(integrationPath)) {
    const repo = await git(integrationPath, ["rev-parse", "--is-inside-work-tree"]);
    const branch = repo.ok ? (await git(integrationPath, ["branch", "--show-current"])).output : "";
    if (repo.ok && branch === input.targetBranch) return { ok: true, path: integrationPath };
    return { ok: false, code: "integration-path-exists", message: `Integration worktree path already exists and is not ${input.targetBranch}: ${integrationPath}` };
  }
  await mkdir(join(integrationPath, ".."), { recursive: true });
  const added = await git(input.projectRoot, ["worktree", "add", integrationPath, input.targetBranch], defaultTimeoutMs);
  if (!added.ok) return { ok: false, code: "integration-worktree-create-failed", message: added.output || `Could not create ${input.targetBranch} integration worktree.` };
  return { ok: true, path: integrationPath };
}

async function maybeFetchTarget(workspacePath: string, targetBranch: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const remote = await git(workspacePath, ["remote", "get-url", "origin"]);
  if (!remote.ok) return { ok: true };
  const fetched = await git(workspacePath, ["fetch", "origin", targetBranch], defaultTimeoutMs);
  return fetched.ok ? { ok: true } : { ok: false, message: fetched.output || `Could not fetch origin ${targetBranch}.` };
}

async function fastForwardTarget(workspacePath: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const upstream = await git(workspacePath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (!upstream.ok) return { ok: true };
  const ff = await git(workspacePath, ["merge", "--ff-only", upstream.output], defaultTimeoutMs);
  return ff.ok ? { ok: true } : { ok: false, message: ff.output || `Could not fast-forward target from ${upstream.output}.` };
}

async function runValidationCommand(workspacePath: string, command: string): Promise<AmbientGitValidationResult> {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync("/bin/bash", ["-lc", command], {
      cwd: workspacePath,
      timeout: validationTimeoutMs,
      maxBuffer: 2_000_000,
    });
    return {
      command,
      status: "passed",
      durationMs: Date.now() - startedAt,
      output: truncateOutput(`${stdout}${stderr}`.trim()),
    };
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    return {
      command,
      status: "failed",
      durationMs: Date.now() - startedAt,
      output: truncateOutput(`${stdout}${stderr}`.trim() || (error instanceof Error ? error.message : String(error))),
    };
  }
}

async function ensureLocalGitIdentity(workspacePath: string): Promise<void> {
  const [name, email] = await Promise.all([
    git(workspacePath, ["config", "--get", "user.name"]),
    git(workspacePath, ["config", "--get", "user.email"]),
  ]);
  if (!name.output.trim()) await gitOrThrow(workspacePath, ["config", "user.name", "Ambient Desktop"]);
  if (!email.output.trim()) await gitOrThrow(workspacePath, ["config", "user.email", "ambient@local.invalid"]);
}

function sanitizePathSegment(value: string): string {
  return (basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-") || "main").slice(0, 80);
}

function truncateOutput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 12_000 ? `${trimmed.slice(0, 12_000)}\n... truncated ...` : trimmed;
}

async function gitOrThrow(workspacePath: string, args: string[], timeout = defaultTimeoutMs): Promise<string> {
  const result = await git(workspacePath, args, timeout);
  if (!result.ok) throw new Error(result.output || `git ${args.join(" ")} failed`);
  return result.output;
}

async function git(workspacePath: string, args: string[], timeout = 8_000): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", workspacePath, ...args], {
      timeout,
      maxBuffer: 2_000_000,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    return { ok: false, output: `${stdout}${stderr}`.trim() || (error instanceof Error ? error.message : String(error)) };
  }
}

async function gitRaw(workspacePath: string, args: string[], timeout = 8_000): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", workspacePath, ...args], {
      timeout,
      maxBuffer: 2_000_000,
    });
    return { ok: true, output: `${stdout}${stderr}` };
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    return { ok: false, output: `${stdout}${stderr}` };
  }
}
