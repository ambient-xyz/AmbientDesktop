import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const VERSION_FILES = ["manifest.json", "spec.json", "graph.json", "main.ts", "preview.md", "compile-context.json", "repair-history.json"];

export interface WorkflowVersionCommitResult {
  repoPath: string;
  commitHash: string;
}

export async function commitWorkflowVersionRepo(input: {
  repoPath: string;
  message: string;
  files?: string[];
  allowEmpty?: boolean;
}): Promise<WorkflowVersionCommitResult> {
  const files = existingWorkflowVersionFiles(input.repoPath, input.files ?? VERSION_FILES);
  await git(input.repoPath, ["init"]);
  await git(input.repoPath, ["config", "user.name", "Ambient Workflow Agent"]);
  await git(input.repoPath, ["config", "user.email", "workflow-agent@ambient.local"]);
  await git(input.repoPath, ["add", "--", ...files]);
  await git(input.repoPath, ["commit", ...(input.allowEmpty ? ["--allow-empty"] : []), "-m", input.message]);
  const commitHash = (await git(input.repoPath, ["rev-parse", "HEAD"])).trim();
  return { repoPath: input.repoPath, commitHash };
}

export async function workflowVersionDiff(input: {
  repoPath: string;
  from?: string;
  to?: string;
}): Promise<string> {
  const range = input.from && input.to ? [input.from, input.to] : input.from ? [input.from] : [];
  return git(input.repoPath, ["diff", ...range, "--", ...VERSION_FILES]);
}

export async function restoreWorkflowVersionFiles(input: {
  repoPath: string;
  commitHash: string;
  files?: string[];
}): Promise<{ repoPath: string; commitHash: string; restoredFiles: string[] }> {
  const files = input.files ?? VERSION_FILES;
  await git(input.repoPath, ["cat-file", "-e", `${input.commitHash}^{commit}`]);
  const restoredFiles = (await git(input.repoPath, ["ls-tree", "-r", "--name-only", input.commitHash, "--", ...files]))
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
  if (restoredFiles.length === 0) throw new Error(`Workflow version ${input.commitHash} does not contain restorable files.`);
  await git(input.repoPath, ["checkout", input.commitHash, "--", ...restoredFiles]);
  return { repoPath: input.repoPath, commitHash: input.commitHash, restoredFiles };
}

function existingWorkflowVersionFiles(repoPath: string, files: string[]): string[] {
  return files.filter((file) => existsSync(join(repoPath, file)));
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });
    return `${result.stdout}${result.stderr}`;
  } catch (error) {
    const output = typeof error === "object" && error && "stdout" in error ? `${(error as { stdout?: string }).stdout ?? ""}${(error as { stderr?: string }).stderr ?? ""}` : "";
    throw new Error(output.trim() || `git ${args.join(" ")} failed`);
  }
}
