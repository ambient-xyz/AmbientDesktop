import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OrchestrationTask } from "../shared/types";
import type { WorkflowConfig } from "./workflow";

const execFileAsync = promisify(execFile);

const TASK_WORKTREE_EXCLUDE_MARKER = "# Ambient Local Task runtime artifacts";
const TASK_WORKTREE_EXCLUDE_PATTERNS = [".ambient/", ".ambient-codex/", "node_modules/"];

export interface PreparedTaskWorkspace {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
  strategy: "git-worktree" | "directory";
  branchName?: string;
  baseRefs: string[];
}

export async function prepareTaskWorkspace(
  projectRoot: string,
  task: Pick<OrchestrationTask, "identifier" | "branchName">,
  config: WorkflowConfig,
  baseRefs: string[] = [],
): Promise<PreparedTaskWorkspace> {
  const workspaceKey = workspaceKeyForTask(task.identifier);
  const workspacePath = join(config.workspace.root, workspaceKey);
  const existing = await pathExists(workspacePath);
  const normalizedBaseRefs = uniqueNonEmptyStrings(baseRefs);

  if (config.workspace.strategy === "git-worktree" && (await isGitRepository(projectRoot))) {
    if (!(await hasGitHead(projectRoot))) {
      throw new Error(
        "Cannot prepare a git worktree task workspace because this project repository has no commits yet. Commit the initial project state or set WORKFLOW.md workspace.strategy to directory.",
      );
    }
    const hasPersistedBranchName = Boolean(task.branchName?.trim());
    let branchName = task.branchName ?? branchNameForTask(config.workspace.branchPrefix, workspaceKey);
    if (!existing) {
      await mkdir(config.workspace.root, { recursive: true });
      branchName = await addGitWorktree(projectRoot, workspacePath, branchName, normalizedBaseRefs[0] ?? "HEAD", {
        allowExistingPrimaryBranch: hasPersistedBranchName,
      });
    }
    await mergeGitWorktreeBaseRefs(workspacePath, normalizedBaseRefs.slice(existing ? 0 : 1));
    await configureTaskWorkspaceRuntimeExcludes(workspacePath);
    return {
      path: workspacePath,
      workspaceKey,
      createdNow: !existing,
      strategy: "git-worktree",
      branchName,
      baseRefs: normalizedBaseRefs,
    };
  }

  if (!existing) await mkdir(workspacePath, { recursive: true });
  return {
    path: workspacePath,
    workspaceKey,
    createdNow: !existing,
    strategy: "directory",
    baseRefs: [],
  };
}

export function workspaceKeyForTask(identifier: string): string {
  const sanitized = identifier.trim().replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_");
  return sanitized || "task";
}

export function branchNameForTask(prefix: string, workspaceKey: string): string {
  const cleanPrefix = prefix.replace(/^\/+/, "");
  const branchSafeKey = workspaceKey.replace(/^\.+$/, "task").replace(/^\.+/, "").replace(/\.+$/, "") || "task";
  return `${cleanPrefix}${branchSafeKey}`;
}

async function isGitRepository(projectRoot: string): Promise<boolean> {
  try {
    const result = await execFileAsync("git", ["-C", projectRoot, "rev-parse", "--is-inside-work-tree"], { timeout: 5_000 });
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function hasGitHead(projectRoot: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", projectRoot, "rev-parse", "--verify", "HEAD"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function addGitWorktree(
  projectRoot: string,
  workspacePath: string,
  branchName: string,
  baseRef: string,
  options: { allowExistingPrimaryBranch?: boolean } = {},
): Promise<string> {
  let lastCheckedOutError: unknown;
  for (const candidate of worktreeBranchNameCandidates(branchName, projectRoot, workspacePath)) {
    try {
      await execFileAsync("git", ["-C", projectRoot, "worktree", "add", "-b", candidate, workspacePath, baseRef], { timeout: 30_000 });
      return candidate;
    } catch (createError) {
      if (!isBranchAlreadyExistsError(createError)) throw createError;
      if (candidate === branchName && !options.allowExistingPrimaryBranch) continue;
    }

    try {
      await execFileAsync("git", ["-C", projectRoot, "worktree", "add", workspacePath, candidate], { timeout: 30_000 });
      return candidate;
    } catch (checkoutError) {
      if (!isBranchAlreadyCheckedOutError(checkoutError)) throw checkoutError;
      lastCheckedOutError = checkoutError;
    }
  }
  throw lastCheckedOutError instanceof Error ? lastCheckedOutError : new Error(`Git worktree branch is already checked out: ${branchName}`);
}

async function mergeGitWorktreeBaseRefs(workspacePath: string, baseRefs: string[]): Promise<void> {
  for (const baseRef of baseRefs) {
    await execFileAsync("git", ["-C", workspacePath, "merge", "--no-edit", baseRef], { timeout: 30_000 });
  }
}

export async function configureTaskWorkspaceRuntimeExcludes(workspacePath: string): Promise<boolean> {
  const excludePathResult = await execFileAsync("git", ["-C", workspacePath, "rev-parse", "--git-path", "info/exclude"], { timeout: 5_000 });
  const excludePath = excludePathResult.stdout.trim();
  if (!excludePath) return false;

  let current = "";
  try {
    current = await readFile(excludePath, "utf8");
  } catch {
    current = "";
  }
  if (current.includes(TASK_WORKTREE_EXCLUDE_MARKER)) return false;

  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  const block = `${prefix}${TASK_WORKTREE_EXCLUDE_MARKER}\n${TASK_WORKTREE_EXCLUDE_PATTERNS.join("\n")}\n`;
  await mkdir(dirname(excludePath), { recursive: true });
  await writeFile(excludePath, `${current}${block}`, "utf8");
  return true;
}

function isBranchAlreadyExistsError(error: unknown): boolean {
  const stderr = typeof error === "object" && error && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
  return stderr.includes("already exists");
}

function isBranchAlreadyCheckedOutError(error: unknown): boolean {
  const stderr = typeof error === "object" && error && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
  return stderr.includes("is already checked out");
}

function worktreeBranchNameCandidates(branchName: string, projectRoot: string, workspacePath: string): string[] {
  return uniqueNonEmptyStrings([
    branchName,
    disambiguatedBranchName(branchName, projectRoot),
    disambiguatedBranchName(branchName, workspacePath),
  ]);
}

function disambiguatedBranchName(branchName: string, scope: string): string {
  const hash = createHash("sha256").update(scope).digest("hex").slice(0, 10);
  return `${branchName}-${hash}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
