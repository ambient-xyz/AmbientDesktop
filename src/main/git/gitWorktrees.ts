import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/types";
import { isPathInside } from "../session/sessionPaths";

const execFileAsync = promisify(execFile);

export async function isGitRepository(workspacePath: string): Promise<boolean> {
  const result = await git(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  return result.ok && result.output === "true";
}

export async function prepareThreadWorktree(projectRoot: string, thread: ThreadSummary): Promise<ThreadWorktreeSummary | undefined> {
  if (!(await isGitRepository(projectRoot))) return undefined;
  await ensureAmbientGitExclude(projectRoot);

  const branchName = branchNameForThread(thread);
  const worktreePath = join(projectRoot, ".ambient-codex", "worktrees", thread.id);
  const now = new Date().toISOString();
  const head = await git(projectRoot, ["rev-parse", "--verify", "--short", "HEAD"]);
  const currentBranch = (await git(projectRoot, ["branch", "--show-current"])).output;
  const baseRef = head.output || "unborn";
  const upstream = (await git(projectRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).output || undefined;
  if (!head.ok) {
    return {
      threadId: thread.id,
      projectRoot,
      worktreePath: projectRoot,
      branchName: currentBranch || branchName,
      baseRef,
      upstream,
      status: "shared",
      createdAt: thread.gitWorktree?.createdAt ?? now,
      updatedAt: now,
      lastCheckpointId: thread.gitWorktree?.lastCheckpointId,
      error: "Repository has no commits yet. Ambient will create an isolated worktree after the first commit.",
    };
  }
  const overlay = await captureProjectOverlay(projectRoot);

  if (existsSync(worktreePath) && (await isGitRepository(worktreePath))) {
    return {
      threadId: thread.id,
      projectRoot,
      worktreePath,
      branchName: (await git(worktreePath, ["branch", "--show-current"])).output || branchName,
      baseRef,
      upstream,
      status: "active",
      createdAt: thread.gitWorktree?.createdAt ?? now,
      updatedAt: now,
      lastCheckpointId: thread.gitWorktree?.lastCheckpointId,
    };
  }

  await mkdir(join(projectRoot, ".ambient-codex", "worktrees"), { recursive: true });
  const created = await git(projectRoot, ["worktree", "add", "-b", branchName, worktreePath, "HEAD"], 30_000);
  if (!created.ok) {
    const reused = await git(projectRoot, ["worktree", "add", worktreePath, branchName], 30_000);
    if (!reused.ok) {
      return {
        threadId: thread.id,
        projectRoot,
        worktreePath: projectRoot,
        branchName,
        baseRef,
        upstream,
        status: "failed",
        createdAt: thread.gitWorktree?.createdAt ?? now,
        updatedAt: now,
        lastCheckpointId: thread.gitWorktree?.lastCheckpointId,
        error: reused.output || created.output || "Could not create a git worktree for this thread.",
      };
    }
  }
  const overlayError = await hydrateWorktreeFromProjectOverlay(projectRoot, worktreePath, overlay);

  return {
    threadId: thread.id,
    projectRoot,
    worktreePath,
    branchName,
    baseRef,
    upstream,
    status: "active",
    createdAt: thread.gitWorktree?.createdAt ?? now,
    updatedAt: now,
    lastCheckpointId: thread.gitWorktree?.lastCheckpointId,
    error: overlayError,
  };
}

export async function attachExistingThreadWorktree(
  projectRoot: string,
  requestedWorktreePath: string,
  thread: ThreadSummary,
): Promise<ThreadWorktreeSummary> {
  if (!(await isGitRepository(projectRoot))) {
    throw new Error("Attach existing worktree requires the project root to be a git repository.");
  }

  const normalizedRoot = resolve(projectRoot);
  const requestedPath = resolve(requestedWorktreePath);
  if (!(await isGitRepository(requestedPath))) {
    throw new Error("Selected directory is not a git worktree.");
  }

  const projectCommonDir = await gitCommonDir(projectRoot);
  const selectedCommonDir = await gitCommonDir(requestedPath);
  if (!projectCommonDir || !selectedCommonDir || projectCommonDir !== selectedCommonDir) {
    throw new Error("Selected directory is not a worktree for the current project.");
  }

  const topLevel = await git(requestedPath, ["rev-parse", "--show-toplevel"]);
  if (!topLevel.ok || !topLevel.output) {
    throw new Error("Could not resolve the selected worktree root.");
  }
  const worktreePath = resolve(topLevel.output);
  if (worktreePath === normalizedRoot) {
    throw new Error("The project root is already the shared workspace. Choose a separate git worktree.");
  }

  const [head, branch, upstream] = await Promise.all([
    git(worktreePath, ["rev-parse", "--verify", "--short", "HEAD"]),
    git(worktreePath, ["branch", "--show-current"]),
    git(worktreePath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
  ]);
  const now = new Date().toISOString();
  return {
    threadId: thread.id,
    projectRoot,
    worktreePath,
    branchName: branch.output || (head.output ? `detached ${head.output}` : "detached"),
    baseRef: head.output || undefined,
    upstream: upstream.ok ? upstream.output || undefined : undefined,
    status: "active",
    createdAt: thread.gitWorktree?.createdAt ?? now,
    updatedAt: now,
    lastCheckpointId: thread.gitWorktree?.lastCheckpointId,
  };
}

export async function createPermanentWorktree(projectRoot: string, worktreePath: string, branchName: string): Promise<void> {
  if (!(await isGitRepository(projectRoot))) {
    throw new Error("Permanent worktrees require a git repository.");
  }
  const head = await git(projectRoot, ["rev-parse", "--verify", "HEAD"]);
  if (!head.ok) {
    throw new Error("Permanent worktrees require at least one commit.");
  }
  const normalizedRoot = resolve(projectRoot);
  const normalizedWorktree = resolve(worktreePath);
  if (normalizedRoot === normalizedWorktree || isPathInside(normalizedRoot, normalizedWorktree)) {
    throw new Error("Choose a worktree directory outside the source project.");
  }
  const created = await git(projectRoot, ["worktree", "add", "-b", branchName, normalizedWorktree, "HEAD"], 30_000);
  if (!created.ok) {
    throw new Error(created.output || "Could not create permanent git worktree.");
  }
}

async function gitCommonDir(workspacePath: string): Promise<string | undefined> {
  const commonDir = await git(workspacePath, ["rev-parse", "--git-common-dir"]);
  if (!commonDir.ok || !commonDir.output) return undefined;
  return realpath(resolve(workspacePath, commonDir.output)).catch(() => resolve(workspacePath, commonDir.output));
}

export function branchNameForThread(thread: Pick<ThreadSummary, "id" | "title">): string {
  const title = thread.title === "New chat" ? "chat" : thread.title;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `ambient/${slug || "chat"}-${thread.id.slice(0, 8)}`;
}

async function ensureAmbientGitExclude(projectRoot: string): Promise<void> {
  const gitCommonDir = await git(projectRoot, ["rev-parse", "--git-common-dir"]);
  if (!gitCommonDir.ok || !gitCommonDir.output) return;
  const excludePath = resolve(projectRoot, gitCommonDir.output, "info", "exclude");
  const marker = ".ambient-codex/";
  let current = "";
  try {
    current = await readFile(excludePath, "utf8");
  } catch {
    // The file may not exist in very small test repositories.
  }
  if (current.split(/\r?\n/).some((line) => line.trim() === marker)) return;
  await mkdir(dirname(excludePath), { recursive: true });
  await appendFile(excludePath, `${current.endsWith("\n") || !current ? "" : "\n"}${marker}\n`, "utf8");
}

async function captureProjectOverlay(projectRoot: string): Promise<{
  stagedPatch: string;
  trackedPatch: string;
  untrackedFiles: string[];
}> {
  const [stagedPatch, trackedPatch, untrackedOutput] = await Promise.all([
    gitRaw(projectRoot, ["diff", "--cached", "--binary"]),
    gitRaw(projectRoot, ["diff", "--binary"]),
    gitRaw(projectRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  return {
    stagedPatch: stagedPatch.ok ? stagedPatch.output : "",
    trackedPatch: trackedPatch.ok ? trackedPatch.output : "",
    untrackedFiles: untrackedOutput.ok ? untrackedOutput.output.split("\0").filter(Boolean) : [],
  };
}

async function hydrateWorktreeFromProjectOverlay(
  projectRoot: string,
  worktreePath: string,
  overlay: { stagedPatch: string; trackedPatch: string; untrackedFiles: string[] },
): Promise<string | undefined> {
  const warnings: string[] = [];
  if (overlay.stagedPatch.trim()) {
    const applied = await applyPatch(worktreePath, overlay.stagedPatch, true);
    if (!applied.ok) warnings.push(applied.output || "Could not apply staged changes to the thread worktree.");
  }
  if (overlay.trackedPatch.trim()) {
    const applied = await applyPatch(worktreePath, overlay.trackedPatch, false);
    if (!applied.ok) warnings.push(applied.output || "Could not apply unstaged changes to the thread worktree.");
  }
  for (const relativePath of overlay.untrackedFiles) {
    const source = join(projectRoot, relativePath);
    const destination = join(worktreePath, relativePath);
    if (!isPathInside(projectRoot, source) || !isPathInside(worktreePath, destination)) continue;
    const sourceStat = await stat(source).catch(() => undefined);
    if (!sourceStat?.isFile()) continue;
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { force: true });
  }
  return warnings.length > 0 ? warnings.join("\n") : undefined;
}

async function applyPatch(worktreePath: string, patch: string, staged: boolean): Promise<{ ok: boolean; output: string }> {
  const child = execFile("git", ["-C", worktreePath, "apply", ...(staged ? ["--index"] : []), "-"], {
    timeout: 30_000,
    maxBuffer: 8_000_000,
  });
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output: `${stdout}${stderr}`.trim() }));
    child.stdin?.end(patch);
  });
}

async function git(cwd: string, args: string[], timeout = 8_000): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", cwd, ...args], {
      timeout,
      maxBuffer: 2_000_000,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const stdout =
      error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    return { ok: false, output: `${stdout}${stderr}`.trim() };
  }
}

async function gitRaw(cwd: string, args: string[], timeout = 8_000): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", cwd, ...args], {
      timeout,
      maxBuffer: 8_000_000,
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
