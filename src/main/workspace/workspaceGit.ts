import { execFile } from "node:child_process";
import { readFile, rm, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { GitBranchInput, GitCommitInput, GitFileActionInput, GitReviewFile, GitReviewSummary, WorkspaceDiffCategory, WorkspaceDiffFile, WorkspaceGitStatus } from "../../shared/workspaceTypes";
import { isPathInside } from "./workspaceSessionFacade";
import { parseGitStatus } from "./workspaceFiles";

const execFileAsync = promisify(execFile);
const diffCategories: WorkspaceDiffCategory[] = ["added", "modified", "deleted", "renamed", "untracked"];
const maxPreviewBytes = 120_000;
const maxPreviewChars = 40_000;

export async function getWorkspaceGitStatus(workspacePath: string): Promise<WorkspaceGitStatus> {
  const repo = await git(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (!repo.ok) {
    return emptyGitStatus("This workspace is not a git repository.");
  }

  const [branch, detachedHead, status, branchList, upstream] = await Promise.all([
    git(workspacePath, ["branch", "--show-current"]),
    git(workspacePath, ["rev-parse", "--short", "HEAD"]),
    gitRaw(workspacePath, ["status", "--short"]),
    git(workspacePath, ["branch", "--format=%(refname:short)"]),
    git(workspacePath, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
  ]);
  const files = parseGitStatus(status.output);
  const { ahead, behind } = upstream.ok ? parseAheadBehind(upstream.output) : { ahead: 0, behind: 0 };

  return {
    isGitRepository: true,
    branch: branch.output || (detachedHead.output ? `detached ${detachedHead.output}` : "detached"),
    branches: parseBranchList(branchList.output),
    ahead,
    behind,
    dirtyCount: files.length,
    counts: gitStatusCounts(files),
  };
}

export async function switchWorkspaceBranch(workspacePath: string, requestedBranch: string): Promise<WorkspaceGitStatus> {
  const branch = requestedBranch.trim();
  if (!branch) throw new Error("Choose a branch first.");

  const branches = parseBranchList((await git(workspacePath, ["branch", "--format=%(refname:short)"])).output);
  if (!branches.includes(branch)) {
    throw new Error(`Branch "${branch}" is not available in this workspace.`);
  }

  const result = await git(workspacePath, ["switch", branch]);
  if (!result.ok) {
    throw new Error(result.output || `Could not switch to ${branch}.`);
  }

  return getWorkspaceGitStatus(workspacePath);
}

export async function getGitReview(input: {
  workspacePath: string;
  projectRoot: string;
  worktree?: ThreadWorktreeSummary;
  latestCheckpoint?: GitReviewSummary["latestCheckpoint"];
}): Promise<GitReviewSummary> {
  const repo = await git(input.workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (!repo.ok) return emptyGitReview(input, "This workspace is not a git repository.");

  const [status, branch, detachedHead, branches, upstream, aheadBehind, remote] = await Promise.all([
    gitRaw(input.workspacePath, ["status", "--short"]),
    git(input.workspacePath, ["branch", "--show-current"]),
    git(input.workspacePath, ["rev-parse", "--short", "HEAD"]),
    git(input.workspacePath, ["branch", "--format=%(refname:short)"]),
    git(input.workspacePath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    git(input.workspacePath, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
    git(input.workspacePath, ["remote", "get-url", "origin"]),
  ]);
  const branchName = branch.output || (detachedHead.output ? `detached ${detachedHead.output}` : "detached");
  const { ahead, behind } = aheadBehind.ok ? parseAheadBehind(aheadBehind.output) : { ahead: 0, behind: 0 };
  const files = await Promise.all(
    parseReviewStatus(status.output).map(async (file) => {
      const stats = await fileStats(input.workspacePath, file);
      return {
        ...file,
        additions: stats.additions,
        deletions: stats.deletions,
        diff: await fileDiff(input.workspacePath, file),
      };
    }),
  );
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const provider = providerForRemote(remote.output);
  const stagedCount = files.filter((file) => file.staged).length;
  const unstagedCount = files.filter((file) => file.unstaged).length;
  const untrackedCount = files.filter((file) => file.untracked).length;
  const conflictedCount = files.filter((file) => file.conflicted).length;

  return {
    isGitRepository: true,
    workspacePath: input.workspacePath,
    projectRoot: input.projectRoot,
    branch: branchName,
    branches: parseBranchList(branches.output),
    ahead,
    behind,
    dirtyCount: files.length,
    stagedCount,
    unstagedCount,
    untrackedCount,
    conflictedCount,
    additions,
    deletions,
    remote: remote.ok ? remote.output : undefined,
    upstream: upstream.ok ? upstream.output : undefined,
    provider,
    compareUrl: compareUrlForRemote(remote.output, branchName, provider),
    files,
    latestCheckpoint: input.latestCheckpoint,
    worktree: input.worktree,
  };
}

export async function initializeGitRepository(workspacePath: string): Promise<void> {
  const existing = await git(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (existing.ok) return;

  const initialized = await git(workspacePath, ["init", "-b", "main"]);
  if (initialized.ok) return;

  const fallback = await git(workspacePath, ["init"]);
  if (!fallback.ok) {
    throw new Error(fallback.output || initialized.output || "Could not initialize a git repository.");
  }
}

export async function stageGitFile(workspacePath: string, input: GitFileActionInput): Promise<void> {
  await gitOrThrow(workspacePath, ["add", "--", assertWorkspaceRelativeGitPath(workspacePath, input.path)]);
}

export async function unstageGitFile(workspacePath: string, input: GitFileActionInput): Promise<void> {
  await gitOrThrow(workspacePath, ["restore", "--staged", "--", assertWorkspaceRelativeGitPath(workspacePath, input.path)]);
}

export async function stageAllGitFiles(workspacePath: string): Promise<void> {
  await gitOrThrow(workspacePath, ["add", "--all", "--"]);
}

export async function unstageAllGitFiles(workspacePath: string): Promise<void> {
  const restored = await git(workspacePath, ["restore", "--staged", "--", "."]);
  if (restored.ok) return;
  await gitOrThrow(workspacePath, ["reset", "--", "."]);
}

export async function discardGitFile(workspacePath: string, input: GitFileActionInput): Promise<void> {
  const path = assertWorkspaceRelativeGitPath(workspacePath, input.path);
  const status = parseReviewStatus((await gitRaw(workspacePath, ["status", "--short", "--", path])).output)[0];
  const absolutePath = join(workspacePath, path);
  if (!isPathInside(workspacePath, absolutePath)) throw new Error("Path is outside the current workspace.");
  if (status?.untracked) {
    await rm(absolutePath, { recursive: true, force: true });
    return;
  }
  if (status?.staged) {
    await gitOrThrow(workspacePath, ["restore", "--staged", "--", path]);
  }
  const nextStatus = parseReviewStatus((await gitRaw(workspacePath, ["status", "--short", "--", path])).output)[0];
  if (nextStatus?.untracked) {
    await rm(absolutePath, { recursive: true, force: true });
    return;
  }
  await gitOrThrow(workspacePath, ["restore", "--", path]);
}

export async function commitGit(workspacePath: string, input: GitCommitInput): Promise<void> {
  const message = input.message.trim();
  if (!message) throw new Error("Commit message is required.");
  await gitOrThrow(workspacePath, ["commit", "-m", message], 30_000);
}

export async function commitGitPaths(
  workspacePath: string,
  input: { paths: string[]; message: string; force?: boolean },
): Promise<{ committed: boolean; commitHash?: string }> {
  const message = input.message.trim();
  if (!message) throw new Error("Commit message is required.");
  const paths = [...new Set(input.paths.map((path) => assertWorkspaceRelativeGitPath(workspacePath, path)))];
  if (paths.length === 0) throw new Error("At least one path is required.");

  await initializeGitRepository(workspacePath);
  await ensureLocalGitIdentity(workspacePath);
  await gitOrThrow(workspacePath, ["add", ...(input.force ? ["-f"] : []), "--", ...paths]);
  const status = parseGitStatus((await gitRaw(workspacePath, ["status", "--short", "--", ...paths])).output);
  if (status.length === 0) return { committed: false };

  await gitOrThrow(workspacePath, ["commit", "-m", message, "--", ...paths], 30_000);
  const head = await git(workspacePath, ["rev-parse", "HEAD"]);
  return { committed: true, ...(head.ok && head.output ? { commitHash: head.output } : {}) };
}

export async function createGitBranch(workspacePath: string, input: GitBranchInput): Promise<void> {
  const branch = input.name.trim();
  if (!branch) throw new Error("Branch name is required.");
  await gitOrThrow(workspacePath, input.checkout === false ? ["branch", branch] : ["switch", "-c", branch]);
}

export async function fetchGit(workspacePath: string): Promise<void> {
  await gitOrThrow(workspacePath, ["fetch"], 60_000);
}

export async function pullGit(workspacePath: string): Promise<void> {
  await gitOrThrow(workspacePath, ["pull", "--ff-only"], 60_000);
}

export async function pushGit(workspacePath: string): Promise<void> {
  const branch = (await git(workspacePath, ["branch", "--show-current"])).output;
  if (!branch) throw new Error("Cannot push from a detached HEAD.");
  const upstream = await git(workspacePath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  await gitOrThrow(workspacePath, upstream.ok ? ["push"] : ["push", "-u", "origin", branch], 60_000);
}

export async function createPullRequestUrl(workspacePath: string): Promise<string | undefined> {
  const [remote, branch] = await Promise.all([git(workspacePath, ["remote", "get-url", "origin"]), git(workspacePath, ["branch", "--show-current"])]);
  if (!remote.ok || !branch.output) return undefined;
  return compareUrlForRemote(remote.output, branch.output, providerForRemote(remote.output));
}

export function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const [ahead = 0, behind = 0] = output
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);
  return { ahead, behind };
}

function emptyGitReview(
  input: { workspacePath: string; projectRoot: string; worktree?: ThreadWorktreeSummary; latestCheckpoint?: GitReviewSummary["latestCheckpoint"] },
  error: string,
): GitReviewSummary {
  return {
    isGitRepository: false,
    workspacePath: input.workspacePath,
    projectRoot: input.projectRoot,
    branch: "",
    branches: [],
    ahead: 0,
    behind: 0,
    dirtyCount: 0,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
    additions: 0,
    deletions: 0,
    files: [],
    latestCheckpoint: input.latestCheckpoint,
    worktree: input.worktree,
    error,
  };
}

function parseReviewStatus(output: string): GitReviewFile[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const renamed = rawPath.includes(" -> ");
      const [originalPath, nextPath] = renamed ? rawPath.split(" -> ") : [undefined, rawPath];
      const untracked = status === "??";
      const conflicted = status.includes("U") || ["AA", "DD", "AU", "UA", "DU", "UD"].includes(status);
      return {
        path: nextPath,
        originalPath,
        status,
        category: conflicted ? "conflicted" : untracked ? "untracked" : gitStatusCategory(status, renamed),
        staged: !untracked && status[0] !== " " && status[0] !== "?",
        unstaged: !untracked && status[1] !== " " && status[1] !== "?",
        untracked,
        conflicted,
        additions: 0,
        deletions: 0,
      } satisfies GitReviewFile;
    });
}

async function fileStats(workspacePath: string, file: GitReviewFile): Promise<{ additions: number; deletions: number }> {
  if (file.untracked) return untrackedFileStats(workspacePath, file);
  if (file.conflicted) return { additions: 0, deletions: 0 };
  const outputs = [];
  if (file.staged) outputs.push((await git(workspacePath, ["diff", "--cached", "--numstat", "--", file.path])).output);
  if (file.unstaged) outputs.push((await git(workspacePath, ["diff", "--numstat", "--", file.path])).output);
  const totals = { additions: 0, deletions: 0 };
  for (const output of outputs) {
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
      const [added, deleted] = line.split(/\s+/);
      totals.additions += added === "-" ? 0 : Number.parseInt(added, 10) || 0;
      totals.deletions += deleted === "-" ? 0 : Number.parseInt(deleted, 10) || 0;
    }
  }
  return totals;
}

async function fileDiff(workspacePath: string, file: GitReviewFile): Promise<string | undefined> {
  if (file.untracked) return untrackedFileDiff(workspacePath, file);
  if (file.conflicted) return conflictedFileDiff(workspacePath, file);
  const parts = [];
  if (file.staged) {
    const staged = await git(workspacePath, ["diff", "--cached", "--", file.path]);
    if (staged.output.trim()) parts.push(`Staged\n${staged.output.trim()}`);
  }
  if (file.unstaged) {
    const unstaged = await git(workspacePath, ["diff", "--", file.path]);
    if (unstaged.output.trim()) parts.push(`Unstaged\n${unstaged.output.trim()}`);
  }
  return parts.join("\n\n") || undefined;
}

async function untrackedFileStats(workspacePath: string, file: GitReviewFile): Promise<{ additions: number; deletions: number }> {
  const preview = await readWorkspaceTextPreview(workspacePath, file.path);
  if (!preview) return { additions: 0, deletions: 0 };
  return { additions: lineCount(preview.text), deletions: 0 };
}

async function untrackedFileDiff(workspacePath: string, file: GitReviewFile): Promise<string | undefined> {
  const preview = await readWorkspaceTextPreview(workspacePath, file.path);
  if (!preview) return undefined;
  const lines = preview.text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const body = lines.length > 0 ? lines.map((line) => `+${line}`).join("\n") : "+";
  return [`Untracked`, `+++ ${file.path}`, body, preview.truncated ? `+... preview truncated at ${maxPreviewChars} characters` : ""]
    .filter(Boolean)
    .join("\n");
}

async function conflictedFileDiff(workspacePath: string, file: GitReviewFile): Promise<string | undefined> {
  const combined = await git(workspacePath, ["diff", "--cc", "--", file.path]);
  if (combined.output.trim()) return `Conflict\n${combined.output.trim()}`;
  const unstaged = await git(workspacePath, ["diff", "--", file.path]);
  if (unstaged.output.trim()) return `Conflict\n${unstaged.output.trim()}`;
  return undefined;
}

async function readWorkspaceTextPreview(workspacePath: string, relativePath: string): Promise<{ text: string; truncated: boolean } | undefined> {
  const filePath = assertWorkspaceRelativeGitPath(workspacePath, relativePath);
  const absolutePath = join(workspacePath, filePath);
  if (!isPathInside(workspacePath, absolutePath)) throw new Error("Path is outside the current workspace.");
  const fileStat = await stat(absolutePath).catch(() => undefined);
  if (!fileStat?.isFile()) return undefined;
  if (fileStat.size > maxPreviewBytes) return undefined;
  const buffer = await readFile(absolutePath);
  if (isLikelyBinary(buffer)) return undefined;
  const text = buffer.toString("utf8");
  return { text: text.slice(0, maxPreviewChars), truncated: text.length > maxPreviewChars };
}

function lineCount(text: string): number {
  if (!text) return 0;
  const normalized = text.endsWith("\n") ? text.slice(0, -1) : text;
  return normalized ? normalized.split(/\r?\n/).length : 1;
}

function isLikelyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_000));
  return sample.includes(0);
}

function providerForRemote(remote: string): "github" | "gitlab" | "unknown" | undefined {
  if (!remote) return undefined;
  if (/github\.com[:/]/i.test(remote)) return "github";
  if (/gitlab\.com[:/]/i.test(remote)) return "gitlab";
  return "unknown";
}

function compareUrlForRemote(remote: string, branch: string, provider?: "github" | "gitlab" | "unknown"): string | undefined {
  const parsed = parseHostedRemote(remote);
  if (!parsed || !branch || provider === "unknown") return undefined;
  const encodedBranch = encodeURIComponent(branch);
  if (provider === "github") return `https://github.com/${parsed.owner}/${parsed.repo}/compare/${encodedBranch}?expand=1`;
  if (provider === "gitlab") return `https://gitlab.com/${parsed.owner}/${parsed.repo}/-/merge_requests/new?merge_request[source_branch]=${encodedBranch}`;
  return undefined;
}

function parseHostedRemote(remote: string): { owner: string; repo: string } | undefined {
  const normalized = remote.trim().replace(/\.git$/, "");
  const ssh = normalized.match(/(?:git@|ssh:\/\/git@)(?:github|gitlab)\.com[:/]([^/]+)\/(.+)$/i);
  const https = normalized.match(/https:\/\/(?:github|gitlab)\.com\/([^/]+)\/(.+)$/i);
  const match = ssh ?? https;
  if (!match) return undefined;
  return { owner: match[1], repo: match[2] };
}

function gitStatusCategory(status: string, renamed: boolean): WorkspaceDiffCategory {
  if (renamed || status.includes("R")) return "renamed";
  if (status.includes("D")) return "deleted";
  if (status.includes("A")) return "added";
  if (status === "??") return "untracked";
  return "modified";
}

function assertWorkspaceRelativeGitPath(workspacePath: string, path: string): string {
  const trimmed = path.trim();
  if (!trimmed || isAbsolute(trimmed)) throw new Error("Path must be relative to the current workspace.");
  const absolutePath = join(workspacePath, trimmed);
  if (!isPathInside(workspacePath, absolutePath)) throw new Error("Path is outside the current workspace.");
  return trimmed;
}

export function parseBranchList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function gitStatusCounts(files: WorkspaceDiffFile[]): Record<WorkspaceDiffCategory, number> {
  const counts = emptyCounts();
  for (const file of files) {
    counts[file.category] += 1;
  }
  return counts;
}

function emptyGitStatus(error?: string): WorkspaceGitStatus {
  return {
    isGitRepository: false,
    branch: "",
    branches: [],
    ahead: 0,
    behind: 0,
    dirtyCount: 0,
    counts: emptyCounts(),
    ...(error ? { error } : {}),
  };
}

function emptyCounts(): Record<WorkspaceDiffCategory, number> {
  return {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
  };
}

async function gitOrThrow(workspacePath: string, args: string[], timeout = 8_000): Promise<string> {
  const result = await git(workspacePath, args, timeout);
  if (!result.ok) throw new Error(result.output || `git ${args.join(" ")} failed`);
  return result.output;
}

async function ensureLocalGitIdentity(workspacePath: string): Promise<void> {
  const [name, email] = await Promise.all([
    git(workspacePath, ["config", "--get", "user.name"]),
    git(workspacePath, ["config", "--get", "user.email"]),
  ]);
  if (!name.output.trim()) await gitOrThrow(workspacePath, ["config", "user.name", "Ambient Desktop"]);
  if (!email.output.trim()) await gitOrThrow(workspacePath, ["config", "user.email", "ambient@local.invalid"]);
}

async function git(workspacePath: string, args: string[], timeout = 8_000): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", workspacePath, ...args], {
      timeout,
      maxBuffer: 2_000_000,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const output =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    return { ok: false, output: output.trim() };
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
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const stdout =
      error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    return { ok: false, output: `${stdout}${stderr}` };
  }
}
