import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { GitCheckpointSummary } from "../../shared/workspaceTypes";
import { isPathInside } from "../session/sessionPaths";

const execFileAsync = promisify(execFile);

export async function createGitCheckpoint(input: {
  workspacePath: string;
  statePath: string;
  threadId: string;
  branchName: string;
  kind: GitCheckpointSummary["kind"];
  reason: string;
}): Promise<GitCheckpointSummary | undefined> {
  const repo = await git(input.workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  if (!repo.ok) return undefined;

  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const checkpointDir = join(input.statePath, "checkpoints", input.threadId, id);
  const untrackedDir = join(checkpointDir, "untracked");
  await mkdir(untrackedDir, { recursive: true });

  const [stagedPatch, trackedPatch, untrackedOutput] = await Promise.all([
    git(input.workspacePath, ["diff", "--cached", "--binary"]),
    git(input.workspacePath, ["diff", "--binary"]),
    git(input.workspacePath, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const untrackedFiles = untrackedOutput.output.split("\0").filter(Boolean);

  for (const relativePath of untrackedFiles) {
    const source = join(input.workspacePath, relativePath);
    if (!isPathInside(input.workspacePath, source)) continue;
    const fileStat = await stat(source).catch(() => undefined);
    if (!fileStat?.isFile()) continue;
    const destination = join(untrackedDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { force: true });
  }

  await writeFile(join(checkpointDir, "staged.patch"), stagedPatch.output, "utf8");
  await writeFile(join(checkpointDir, "tracked.patch"), trackedPatch.output, "utf8");
  const summary: GitCheckpointSummary = {
    id,
    threadId: input.threadId,
    workspacePath: input.workspacePath,
    branchName: input.branchName,
    kind: input.kind,
    reason: input.reason,
    createdAt: new Date().toISOString(),
    trackedPatchBytes: Buffer.byteLength(trackedPatch.output),
    stagedPatchBytes: Buffer.byteLength(stagedPatch.output),
    untrackedFiles,
  };
  await writeFile(join(checkpointDir, "metadata.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

export async function latestGitCheckpoint(statePath: string, threadId: string): Promise<GitCheckpointSummary | undefined> {
  const root = join(statePath, "checkpoints", threadId);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const dir of dirs) {
    const summary = await readCheckpoint(join(root, dir));
    if (summary) return summary;
  }
  return undefined;
}

export async function restoreLatestGitCheckpoint(input: {
  workspacePath: string;
  statePath: string;
  threadId: string;
}): Promise<GitCheckpointSummary | undefined> {
  const summary = await latestGitCheckpoint(input.statePath, input.threadId);
  if (!summary) return undefined;
  const checkpointDir = join(input.statePath, "checkpoints", input.threadId, summary.id);
  await gitOrThrow(input.workspacePath, ["reset", "--hard", "HEAD"]);
  await applyPatchIfPresent(input.workspacePath, join(checkpointDir, "staged.patch"), true);
  await applyPatchIfPresent(input.workspacePath, join(checkpointDir, "tracked.patch"), false);

  const untrackedDir = join(checkpointDir, "untracked");
  for (const relativePath of summary.untrackedFiles) {
    const source = join(untrackedDir, relativePath);
    const destination = join(input.workspacePath, relativePath);
    const sourceStat = await stat(source).catch(() => undefined);
    if (!sourceStat?.isFile() || !isPathInside(input.workspacePath, destination)) continue;
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { force: true });
  }
  return summary;
}

async function readCheckpoint(path: string): Promise<GitCheckpointSummary | undefined> {
  try {
    return JSON.parse(await readFile(join(path, "metadata.json"), "utf8")) as GitCheckpointSummary;
  } catch {
    return undefined;
  }
}

async function applyPatchIfPresent(workspacePath: string, patchPath: string, staged: boolean): Promise<void> {
  const patch = await readFile(patchPath, "utf8").catch(() => "");
  if (!patch.trim()) return;
  const args = staged ? ["apply", "--index", patchPath] : ["apply", patchPath];
  await gitOrThrow(workspacePath, args);
}

async function gitOrThrow(workspacePath: string, args: string[]): Promise<string> {
  const result = await git(workspacePath, args);
  if (!result.ok) throw new Error(result.output || `git ${args.join(" ")} failed`);
  return result.output;
}

async function git(workspacePath: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", workspacePath, ...args], {
      timeout: 30_000,
      maxBuffer: 8_000_000,
    });
    return { ok: true, output: `${stdout}${stderr}` };
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const stdout =
      error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    return { ok: false, output: `${stdout}${stderr}`.trim() };
  }
}
