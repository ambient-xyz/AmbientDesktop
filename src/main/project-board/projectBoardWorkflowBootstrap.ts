import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { stringify as stringifyYaml } from "yaml";
import { loadWorkflowFile, parseWorkflowMarkdown, WorkflowError, workflowContentHash, type WorkflowDefinition } from "../workflow/workflow";
import type { OrchestrationWorkflowRepairPreview } from "../../shared/workflowTypes";

const execFileAsync = promisify(execFile);

export type ProjectBoardWorkflowBootstrapStatus = "created" | "exists" | "invalid";

export interface ProjectBoardWorkflowBootstrapResult {
  status: ProjectBoardWorkflowBootstrapStatus;
  workflowPath: string;
  workflow?: WorkflowDefinition;
  workspaceStrategy?: "git-worktree" | "directory";
  markdown?: string;
  error?: WorkflowError;
}

export type ProjectBoardWorkflowRepairAction = "restore_generated_default" | "use_existing_anyway";

export interface ProjectBoardWorkflowRepairResult {
  action: ProjectBoardWorkflowRepairAction;
  workflowPath: string;
  workflow?: WorkflowDefinition;
  workspaceStrategy?: "git-worktree" | "directory";
  markdown?: string;
  backupPath?: string;
  previousWorkflowHash?: string;
  error?: WorkflowError;
}

export interface ProjectBoardWorkflowSettingsPatch {
  autoDispatch?: boolean;
  maxConcurrentAgents?: number;
  maxTurns?: number;
  workspaceStrategy?: "git-worktree" | "directory";
  requireTests?: boolean;
  requireDiffSummary?: boolean;
  requireScreenshots?: boolean;
}

export interface ProjectBoardWorkflowSettingsUpdateResult {
  workflowPath: string;
  workflow?: WorkflowDefinition;
  markdown?: string;
  backupPath?: string;
  previousWorkflowHash?: string;
  changedFields: string[];
  diff: string;
  error?: WorkflowError;
}

export interface ProjectBoardWorkflowRawUpdateResult {
  workflowPath: string;
  workflow?: WorkflowDefinition;
  markdown: string;
  backupPath?: string;
  previousWorkflowHash?: string;
  changed: boolean;
  diff: string;
  error?: WorkflowError;
}

const WORKFLOW_REPAIR_TEXT_LIMIT = 24_000;
const WORKFLOW_REPAIR_DIFF_LIMIT = 32_000;
const WORKFLOW_RAW_EDIT_MAX_CHARS = 200_000;

export async function ensureDefaultProjectBoardWorkflow(projectRoot: string): Promise<ProjectBoardWorkflowBootstrapResult> {
  const workflowPath = join(projectRoot, "WORKFLOW.md");
  try {
    return { status: "exists", workflowPath, workflow: await loadWorkflowFile(workflowPath) };
  } catch (error) {
    if (!(error instanceof WorkflowError) || error.code !== "missing_workflow_file") {
      return { status: "invalid", workflowPath, error: workflowBootstrapError(error) };
    }
  }

  const workspaceStrategy = await projectBoardWorkflowWorkspaceStrategy(projectRoot);
  const markdown = defaultProjectBoardWorkflowMarkdown({ workspaceStrategy });
  await mkdir(projectRoot, { recursive: true });
  try {
    await writeFile(workflowPath, markdown, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  try {
    return {
      status: "created",
      workflowPath,
      workflow: await loadWorkflowFile(workflowPath),
      workspaceStrategy,
      markdown,
    };
  } catch (error) {
    return { status: "invalid", workflowPath, workspaceStrategy, markdown, error: workflowBootstrapError(error) };
  }
}

export async function repairProjectBoardWorkflow(
  projectRoot: string,
  action: ProjectBoardWorkflowRepairAction,
): Promise<ProjectBoardWorkflowRepairResult> {
  const workflowPath = join(projectRoot, "WORKFLOW.md");
  if (action === "use_existing_anyway") {
    try {
      return { action, workflowPath, workflow: await loadWorkflowFile(workflowPath) };
    } catch (error) {
      return { action, workflowPath, error: workflowBootstrapError(error) };
    }
  }

  const existing = await readExistingWorkflow(workflowPath);
  const workspaceStrategy = await projectBoardWorkflowWorkspaceStrategy(projectRoot);
  const markdown = defaultProjectBoardWorkflowMarkdown({ workspaceStrategy });
  await mkdir(projectRoot, { recursive: true });
  const backupPath = existing === undefined ? undefined : await writeWorkflowRepairBackup(projectRoot, existing);
  await writeFile(workflowPath, markdown, "utf8");

  try {
    return {
      action,
      workflowPath,
      workflow: await loadWorkflowFile(workflowPath),
      workspaceStrategy,
      markdown,
      backupPath,
      previousWorkflowHash: existing === undefined ? undefined : workflowContentHash(existing),
    };
  } catch (error) {
    return {
      action,
      workflowPath,
      workspaceStrategy,
      markdown,
      backupPath,
      previousWorkflowHash: existing === undefined ? undefined : workflowContentHash(existing),
      error: workflowBootstrapError(error),
    };
  }
}

export async function previewProjectBoardWorkflowRepair(projectRoot: string): Promise<OrchestrationWorkflowRepairPreview | undefined> {
  const workflowPath = join(projectRoot, "WORKFLOW.md");
  const existing = await readExistingWorkflow(workflowPath);
  if (existing === undefined) return undefined;
  const workspaceStrategy = await projectBoardWorkflowWorkspaceStrategy(projectRoot);
  const proposed = defaultProjectBoardWorkflowMarkdown({ workspaceStrategy });
  const currentLineCount = workflowLineCount(existing);
  const proposedLineCount = workflowLineCount(proposed);
  const currentText = limitWorkflowRepairText(existing, WORKFLOW_REPAIR_TEXT_LIMIT);
  const proposedText = limitWorkflowRepairText(proposed, WORKFLOW_REPAIR_TEXT_LIMIT);
  const fullDiff = workflowRepairUnifiedDiff(currentText, proposedText, "a/WORKFLOW.md", "b/WORKFLOW.md");
  const diff = limitWorkflowRepairText(fullDiff, WORKFLOW_REPAIR_DIFF_LIMIT);
  return {
    workspaceStrategy,
    currentText,
    proposedText,
    diff,
    currentLineCount,
    proposedLineCount,
    currentTextTruncated: existing.length > WORKFLOW_REPAIR_TEXT_LIMIT,
    diffTruncated: fullDiff.length > WORKFLOW_REPAIR_DIFF_LIMIT,
  };
}

export async function updateProjectBoardWorkflowSettings(
  projectRoot: string,
  patch: ProjectBoardWorkflowSettingsPatch,
): Promise<ProjectBoardWorkflowSettingsUpdateResult> {
  const workflowPath = join(projectRoot, "WORKFLOW.md");
  const workflow = await loadWorkflowFile(workflowPath);
  const updated = applyProjectBoardWorkflowSettingsPatch(workflow, patch);
  if (updated.changedFields.length === 0) {
    return {
      workflowPath,
      workflow,
      markdown: workflow.rawContent,
      previousWorkflowHash: workflow.contentHash,
      changedFields: [],
      diff: workflowRepairUnifiedDiff(workflow.rawContent, workflow.rawContent, "a/WORKFLOW.md", "b/WORKFLOW.md"),
    };
  }

  parseWorkflowMarkdown(updated.markdown, workflowPath);
  const backupPath = await writeWorkflowSettingsBackup(projectRoot, workflow.rawContent);
  await writeFile(workflowPath, updated.markdown, "utf8");
  try {
    return {
      workflowPath,
      workflow: await loadWorkflowFile(workflowPath),
      markdown: updated.markdown,
      backupPath,
      previousWorkflowHash: workflow.contentHash,
      changedFields: updated.changedFields,
      diff: updated.diff,
    };
  } catch (error) {
    return {
      workflowPath,
      markdown: updated.markdown,
      backupPath,
      previousWorkflowHash: workflow.contentHash,
      changedFields: updated.changedFields,
      diff: updated.diff,
      error: workflowBootstrapError(error),
    };
  }
}

export async function updateProjectBoardWorkflowRaw(
  projectRoot: string,
  input: { markdown: string },
): Promise<ProjectBoardWorkflowRawUpdateResult> {
  const workflowPath = join(projectRoot, "WORKFLOW.md");
  const markdown = normalizeWorkflowRawInput(input.markdown);
  const existing = await readExistingWorkflow(workflowPath);
  const previousWorkflowHash = existing === undefined ? undefined : workflowContentHash(existing);
  const diff = limitWorkflowRepairText(workflowRepairUnifiedDiff(existing ?? "", markdown, "a/WORKFLOW.md", "b/WORKFLOW.md"), WORKFLOW_REPAIR_DIFF_LIMIT);

  if (markdown.length > WORKFLOW_RAW_EDIT_MAX_CHARS) {
    return {
      workflowPath,
      markdown,
      previousWorkflowHash,
      changed: false,
      diff,
      error: new WorkflowError(
        "workflow_validation_error",
        `WORKFLOW.md raw edits are limited to ${WORKFLOW_RAW_EDIT_MAX_CHARS} characters; received ${markdown.length}.`,
      ),
    };
  }

  try {
    parseWorkflowMarkdown(markdown, workflowPath);
  } catch (error) {
    return {
      workflowPath,
      markdown,
      previousWorkflowHash,
      changed: false,
      diff,
      error: workflowBootstrapError(error),
    };
  }

  if (existing === markdown) {
    return {
      workflowPath,
      workflow: await loadWorkflowFile(workflowPath),
      markdown,
      previousWorkflowHash,
      changed: false,
      diff,
    };
  }

  await mkdir(projectRoot, { recursive: true });
  const backupPath = existing === undefined ? undefined : await writeWorkflowRawEditBackup(projectRoot, existing);
  await writeFile(workflowPath, markdown, "utf8");
  try {
    return {
      workflowPath,
      workflow: await loadWorkflowFile(workflowPath),
      markdown,
      backupPath,
      previousWorkflowHash,
      changed: true,
      diff,
    };
  } catch (error) {
    return {
      workflowPath,
      markdown,
      backupPath,
      previousWorkflowHash,
      changed: true,
      diff,
      error: workflowBootstrapError(error),
    };
  }
}

export function defaultProjectBoardWorkflowMarkdown(input: { workspaceStrategy: "git-worktree" | "directory" }): string {
  return `---
version: 1
tracker:
  kind: local
  active_states: [ready]
  terminal_states: [done, canceled, duplicate]
  review_states: [review]
orchestration:
  auto_dispatch: true
  max_concurrent_agents: 1
  max_turns: 20
  poll_interval_ms: 30000
  stall_timeout_ms: 300000
workspace:
  strategy: ${input.workspaceStrategy}
  root: .ambient-codex/orchestration/workspaces
  branch_prefix: ambient/
  cleanup_terminal_workspaces: false
  reuse_existing: true
proof_of_work:
  require_tests: false
  require_diff_summary: true
  require_screenshots: false
  max_summary_chars: 4000
---
Work on Local Task {{ task.identifier }} in {{ workspace.path }}.

Execution workspace contract:
- Writable task workspace: {{ workspace.path }}
- Create, modify, delete, stage, and commit task files only inside the writable task workspace. Use paths relative to that workspace whenever possible.
- If board source context mentions the owning project root or another sibling worktree, resolve the corresponding file inside the writable task workspace before editing.
- Do not request outside-workspace file or shell permissions to mutate the owning project root. Report a concrete blocker if the card cannot be completed from the prepared workspace.

Title: {{ task.title }}

Description:
{{ task.description }}

Complete the task in the prepared workspace. Keep changes scoped to this task, run the smallest relevant verification available, and finish with changed files, commands run, proof, and blockers.
`;
}

async function readExistingWorkflow(workflowPath: string): Promise<string | undefined> {
  try {
    return await readFile(workflowPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeWorkflowRepairBackup(projectRoot: string, content: string): Promise<string> {
  const backupDir = join(projectRoot, ".ambient-codex", "orchestration", "workflow-repairs");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]+/g, "-").replace(/-$/, "");
  const backupPath = join(backupDir, `WORKFLOW-${stamp}.md`);
  await writeFile(backupPath, content, { encoding: "utf8", flag: "wx" });
  return backupPath;
}

async function writeWorkflowSettingsBackup(projectRoot: string, content: string): Promise<string> {
  const backupDir = join(projectRoot, ".ambient-codex", "orchestration", "workflow-settings");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]+/g, "-").replace(/-$/, "");
  const backupPath = join(backupDir, `WORKFLOW-${stamp}.md`);
  await writeFile(backupPath, content, { encoding: "utf8", flag: "wx" });
  return backupPath;
}

async function writeWorkflowRawEditBackup(projectRoot: string, content: string): Promise<string> {
  const backupDir = join(projectRoot, ".ambient-codex", "orchestration", "workflow-raw-edits");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]+/g, "-").replace(/-$/, "");
  const backupPath = join(backupDir, `WORKFLOW-${stamp}.md`);
  await writeFile(backupPath, content, { encoding: "utf8", flag: "wx" });
  return backupPath;
}

export async function projectBoardWorkflowWorkspaceStrategy(projectRoot: string): Promise<"git-worktree" | "directory"> {
  return (await projectRootIsGitRepository(projectRoot)) ? "git-worktree" : "directory";
}

async function projectRootIsGitRepository(projectRoot: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectRoot, "rev-parse", "--is-inside-work-tree"], {
      timeout: 5_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

function workflowLineCount(text: string): number {
  if (!text) return 0;
  return text.replace(/\n$/, "").split(/\r?\n/).length;
}

function limitWorkflowRepairText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n... truncated ${text.length - limit} character${text.length - limit === 1 ? "" : "s"} ...`;
}

function applyProjectBoardWorkflowSettingsPatch(
  workflow: WorkflowDefinition,
  patch: ProjectBoardWorkflowSettingsPatch,
): { markdown: string; changedFields: string[]; diff: string } {
  const rawConfig = cloneWorkflowRawConfig(workflow.rawConfig);
  const changedFields: string[] = [];
  const orchestration = ensureWorkflowConfigSection(rawConfig, "orchestration");
  const workspace = ensureWorkflowConfigSection(rawConfig, "workspace");
  const proofOfWork = ensureWorkflowConfigSection(rawConfig, "proof_of_work");

  setWorkflowConfigValue(orchestration, "auto_dispatch", patch.autoDispatch, workflow.config.orchestration.autoDispatch, "orchestration.auto_dispatch", changedFields);
  setWorkflowConfigValue(
    orchestration,
    "max_concurrent_agents",
    patch.maxConcurrentAgents,
    workflow.config.orchestration.maxConcurrentAgents,
    "orchestration.max_concurrent_agents",
    changedFields,
  );
  setWorkflowConfigValue(orchestration, "max_turns", patch.maxTurns, workflow.config.orchestration.maxTurns, "orchestration.max_turns", changedFields);
  setWorkflowConfigValue(workspace, "strategy", patch.workspaceStrategy, workflow.config.workspace.strategy, "workspace.strategy", changedFields);
  setWorkflowConfigValue(
    proofOfWork,
    "require_tests",
    patch.requireTests,
    workflow.config.proofOfWork.requireTests,
    "proof_of_work.require_tests",
    changedFields,
  );
  setWorkflowConfigValue(
    proofOfWork,
    "require_diff_summary",
    patch.requireDiffSummary,
    workflow.config.proofOfWork.requireDiffSummary,
    "proof_of_work.require_diff_summary",
    changedFields,
  );
  setWorkflowConfigValue(
    proofOfWork,
    "require_screenshots",
    patch.requireScreenshots,
    workflow.config.proofOfWork.requireScreenshots,
    "proof_of_work.require_screenshots",
    changedFields,
  );

  const markdown = workflowMarkdownFromRawConfig(rawConfig, workflow.promptTemplate);
  return {
    markdown,
    changedFields,
    diff: limitWorkflowRepairText(workflowRepairUnifiedDiff(workflow.rawContent, markdown, "a/WORKFLOW.md", "b/WORKFLOW.md"), WORKFLOW_REPAIR_DIFF_LIMIT),
  };
}

function cloneWorkflowRawConfig(rawConfig: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(rawConfig)) as Record<string, unknown>;
}

function ensureWorkflowConfigSection(rawConfig: Record<string, unknown>, section: string): Record<string, unknown> {
  const value = rawConfig[section];
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  rawConfig[section] = next;
  return next;
}

function setWorkflowConfigValue<T>(
  section: Record<string, unknown>,
  key: string,
  next: T | undefined,
  current: T,
  field: string,
  changedFields: string[],
): void {
  if (next === undefined || Object.is(next, current)) return;
  section[key] = next;
  changedFields.push(field);
}

function workflowMarkdownFromRawConfig(rawConfig: Record<string, unknown>, promptTemplate: string): string {
  const frontMatter = stringifyYaml(rawConfig, { lineWidth: 0 }).trimEnd();
  const prompt = promptTemplate.trim();
  return `---\n${frontMatter}\n---\n${prompt}${prompt ? "\n" : ""}`;
}

function normalizeWorkflowRawInput(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function workflowRepairUnifiedDiff(currentText: string, proposedText: string, fromPath: string, toPath: string): string {
  const current = currentText.replace(/\n$/, "").split(/\r?\n/);
  const proposed = proposedText.replace(/\n$/, "").split(/\r?\n/);
  if (current.length === proposed.length && current.every((line, index) => line === proposed[index])) {
    return `diff --git ${fromPath} ${toPath}\nNo changes.\n`;
  }
  const rows = workflowLineDiffRows(current, proposed);
  return [
    `diff --git ${fromPath} ${toPath}`,
    `--- ${fromPath}`,
    `+++ ${toPath}`,
    `@@ -1,${current.length} +1,${proposed.length} @@`,
    ...rows,
    "",
  ].join("\n");
}

function workflowLineDiffRows(current: string[], proposed: string[]): string[] {
  if (current.length * proposed.length > 40_000) {
    return [...current.map((line) => `-${line}`), ...proposed.map((line) => `+${line}`)];
  }
  const lcs: number[][] = Array.from({ length: current.length + 1 }, () => Array(proposed.length + 1).fill(0));
  for (let left = current.length - 1; left >= 0; left -= 1) {
    for (let right = proposed.length - 1; right >= 0; right -= 1) {
      lcs[left][right] = current[left] === proposed[right] ? lcs[left + 1][right + 1] + 1 : Math.max(lcs[left + 1][right], lcs[left][right + 1]);
    }
  }
  const rows: string[] = [];
  let left = 0;
  let right = 0;
  while (left < current.length || right < proposed.length) {
    if (left < current.length && right < proposed.length && current[left] === proposed[right]) {
      rows.push(` ${current[left]}`);
      left += 1;
      right += 1;
    } else if (right < proposed.length && (left === current.length || lcs[left][right + 1] >= lcs[left + 1][right])) {
      rows.push(`+${proposed[right]}`);
      right += 1;
    } else if (left < current.length) {
      rows.push(`-${current[left]}`);
      left += 1;
    }
  }
  return rows;
}

function workflowBootstrapError(error: unknown): WorkflowError {
  return error instanceof WorkflowError
    ? error
    : new WorkflowError("workflow_validation_error", error instanceof Error ? error.message : String(error));
}
