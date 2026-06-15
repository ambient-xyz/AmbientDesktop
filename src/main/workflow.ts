import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { PermissionMode, ThinkingLevel } from "../shared/types";

export type WorkflowErrorCode =
  | "missing_workflow_file"
  | "workflow_parse_error"
  | "workflow_front_matter_not_a_map"
  | "workflow_validation_error"
  | "template_render_error";

export class WorkflowError extends Error {
  constructor(
    readonly code: WorkflowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

export interface WorkflowDefinition {
  path: string;
  directory: string;
  rawContent: string;
  contentHash: string;
  rawConfig: Record<string, unknown>;
  config: WorkflowConfig;
  promptTemplate: string;
  warnings: string[];
}

export interface WorkflowConfig {
  version: number;
  tracker: {
    kind: string;
    activeStates: string[];
    terminalStates: string[];
    reviewStates: string[];
  };
  orchestration: {
    pollIntervalMs: number;
    maxConcurrentAgents: number;
    maxConcurrentAgentsByState: Record<string, number>;
    maxTurns: number;
    maxRetryBackoffMs: number;
    stallTimeoutMs: number;
    autoDispatch: boolean;
  };
  workspace: {
    strategy: "git-worktree" | "directory";
    root: string;
    branchPrefix: string;
    cleanupTerminalWorkspaces: boolean;
    reuseExisting: boolean;
  };
  agent: {
    model?: string;
    thinkingLevel?: ThinkingLevel;
    permissionMode?: PermissionMode;
    extraInstructions?: string;
  };
  hooks: {
    afterCreate?: string;
    beforeRun?: string;
    afterRun?: string;
    beforeRemove?: string;
    timeoutMs: number;
  };
  proofOfWork: {
    requireTests: boolean;
    requireDiffSummary: boolean;
    requireScreenshots: boolean;
    maxSummaryChars: number;
  };
}

export interface WorkflowRenderContext {
  task: Record<string, unknown>;
  attempt?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
}

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const stringArray = z.array(z.string().min(1));
const knownTopLevelKeys = new Set(["version", "tracker", "orchestration", "workspace", "agent", "hooks", "proof_of_work"]);
const defaultTrackerConfig = {
  kind: "local",
  active_states: ["todo", "ready", "in_progress"],
  terminal_states: ["done", "canceled", "duplicate"],
  review_states: ["review"],
};
const defaultOrchestrationConfig = {
  poll_interval_ms: 30_000,
  max_concurrent_agents: 1,
  max_concurrent_agents_by_state: {},
  max_turns: 20,
  max_retry_backoff_ms: 300_000,
  stall_timeout_ms: 300_000,
  auto_dispatch: true,
};
const defaultWorkspaceConfig = {
  strategy: "git-worktree" as const,
  root: ".ambient-codex/orchestration/workspaces",
  branch_prefix: "ambient/",
  cleanup_terminal_workspaces: false,
  reuse_existing: true,
};
const defaultHooksConfig = {
  timeout_ms: 60_000,
};
const defaultProofOfWorkConfig = {
  require_tests: false,
  require_diff_summary: true,
  require_screenshots: false,
  max_summary_chars: 4_000,
};

const rawWorkflowConfigSchema = z.object({
  version: positiveInt.default(1),
  tracker: z
    .object({
      kind: z.string().min(1).default("local"),
      active_states: stringArray.default(["todo", "ready", "in_progress"]),
      terminal_states: stringArray.default(["done", "canceled", "duplicate"]),
      review_states: stringArray.default(["review"]),
    })
    .default(defaultTrackerConfig),
  orchestration: z
    .object({
      poll_interval_ms: positiveInt.default(30_000),
      max_concurrent_agents: positiveInt.default(1),
      max_concurrent_agents_by_state: z.record(z.string().min(1), positiveInt).default({}),
      max_turns: positiveInt.default(20),
      max_retry_backoff_ms: positiveInt.default(300_000),
      stall_timeout_ms: nonNegativeInt.default(300_000),
      auto_dispatch: z.boolean().default(true),
    })
    .default(defaultOrchestrationConfig),
  workspace: z
    .object({
      strategy: z.enum(["git-worktree", "directory"]).default("git-worktree"),
      root: z.string().min(1).default(".ambient-codex/orchestration/workspaces"),
      branch_prefix: z.string().default("ambient/"),
      cleanup_terminal_workspaces: z.boolean().default(false),
      reuse_existing: z.boolean().default(true),
    })
    .default(defaultWorkspaceConfig),
  agent: z
    .object({
      model: z.string().min(1).optional(),
      thinking_level: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
      permission_mode: z.enum(["full-access", "workspace"]).optional(),
      extra_instructions: z.string().optional(),
    })
    .default({}),
  hooks: z
    .object({
      after_create: z.string().optional(),
      before_run: z.string().optional(),
      after_run: z.string().optional(),
      before_remove: z.string().optional(),
      timeout_ms: positiveInt.default(60_000),
    })
    .default(defaultHooksConfig),
  proof_of_work: z
    .object({
      require_tests: z.boolean().default(false),
      require_diff_summary: z.boolean().default(true),
      require_screenshots: z.boolean().default(false),
      max_summary_chars: positiveInt.default(4_000),
    })
    .default(defaultProofOfWorkConfig),
});

export async function loadWorkflowFile(workflowPath: string): Promise<WorkflowDefinition> {
  try {
    return parseWorkflowMarkdown(await readFile(workflowPath, "utf8"), workflowPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new WorkflowError("missing_workflow_file", `Workflow file not found: ${workflowPath}`);
    }
    throw error;
  }
}

export function parseWorkflowMarkdown(
  content: string,
  workflowPath = resolve("WORKFLOW.md"),
  env: NodeJS.ProcessEnv = process.env,
): WorkflowDefinition {
  const normalizedPath = resolve(workflowPath);
  const directory = dirname(normalizedPath);
  const { rawConfig, promptTemplate } = splitWorkflowMarkdown(content);
  const warnings = Object.keys(rawConfig)
    .filter((key) => !knownTopLevelKeys.has(key))
    .map((key) => `Unknown workflow config key "${key}" ignored.`);
  const config = normalizeWorkflowConfig(rawConfig, directory, env);

  return {
    path: normalizedPath,
    directory,
    rawContent: content,
    contentHash: workflowContentHash(content),
    rawConfig,
    config,
    promptTemplate,
    warnings,
  };
}

export function workflowContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function renderWorkflowPrompt(template: string, context: WorkflowRenderContext): string {
  return template.replace(/{{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*}}/g, (_match, expression: string) =>
    renderValue(expression, readTemplatePath(context, expression)),
  );
}

function splitWorkflowMarkdown(content: string): { rawConfig: Record<string, unknown>; promptTemplate: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") return { rawConfig: {}, promptTemplate: normalized.trim() };

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex === -1) {
    throw new WorkflowError("workflow_parse_error", "Workflow front matter is missing a closing --- marker.");
  }

  let parsed: unknown;
  try {
    const frontMatter = lines.slice(1, endIndex).join("\n").trim();
    parsed = frontMatter ? parseYaml(frontMatter) : {};
  } catch (error) {
    throw new WorkflowError("workflow_parse_error", error instanceof Error ? error.message : String(error));
  }

  if (!parsed) parsed = {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkflowError("workflow_front_matter_not_a_map", "Workflow front matter must be a YAML object.");
  }

  return {
    rawConfig: parsed as Record<string, unknown>,
    promptTemplate: lines.slice(endIndex + 1).join("\n").trim(),
  };
}

function normalizeWorkflowConfig(rawConfig: Record<string, unknown>, workflowDirectory: string, env: NodeJS.ProcessEnv): WorkflowConfig {
  const parsed = rawWorkflowConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new WorkflowError("workflow_validation_error", z.prettifyError(parsed.error));
  }

  const raw = parsed.data;
  return {
    version: raw.version,
    tracker: {
      kind: raw.tracker.kind,
      activeStates: normalizeStates(raw.tracker.active_states),
      terminalStates: normalizeStates(raw.tracker.terminal_states),
      reviewStates: normalizeStates(raw.tracker.review_states),
    },
    orchestration: {
      pollIntervalMs: raw.orchestration.poll_interval_ms,
      maxConcurrentAgents: raw.orchestration.max_concurrent_agents,
      maxConcurrentAgentsByState: normalizeConcurrencyMap(raw.orchestration.max_concurrent_agents_by_state),
      maxTurns: raw.orchestration.max_turns,
      maxRetryBackoffMs: raw.orchestration.max_retry_backoff_ms,
      stallTimeoutMs: raw.orchestration.stall_timeout_ms,
      autoDispatch: raw.orchestration.auto_dispatch,
    },
    workspace: {
      strategy: raw.workspace.strategy,
      root: resolveConfigPath(raw.workspace.root, workflowDirectory, env),
      branchPrefix: raw.workspace.branch_prefix,
      cleanupTerminalWorkspaces: raw.workspace.cleanup_terminal_workspaces,
      reuseExisting: raw.workspace.reuse_existing,
    },
    agent: {
      ...(raw.agent.model ? { model: raw.agent.model } : {}),
      ...(raw.agent.thinking_level ? { thinkingLevel: raw.agent.thinking_level } : {}),
      ...(raw.agent.permission_mode ? { permissionMode: raw.agent.permission_mode } : {}),
      ...(raw.agent.extra_instructions ? { extraInstructions: raw.agent.extra_instructions } : {}),
    },
    hooks: {
      ...(raw.hooks.after_create ? { afterCreate: raw.hooks.after_create } : {}),
      ...(raw.hooks.before_run ? { beforeRun: raw.hooks.before_run } : {}),
      ...(raw.hooks.after_run ? { afterRun: raw.hooks.after_run } : {}),
      ...(raw.hooks.before_remove ? { beforeRemove: raw.hooks.before_remove } : {}),
      timeoutMs: raw.hooks.timeout_ms,
    },
    proofOfWork: {
      requireTests: raw.proof_of_work.require_tests,
      requireDiffSummary: raw.proof_of_work.require_diff_summary,
      requireScreenshots: raw.proof_of_work.require_screenshots,
      maxSummaryChars: raw.proof_of_work.max_summary_chars,
    },
  };
}

function normalizeStates(states: string[]): string[] {
  return [...new Set(states.map((state) => state.trim().toLowerCase()).filter(Boolean))];
}

function normalizeConcurrencyMap(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).map(([state, value]) => [state.trim().toLowerCase(), value]));
}

function resolveConfigPath(input: string, workflowDirectory: string, env: NodeJS.ProcessEnv): string {
  const expandedEnv = resolveEnvReference(input, env);
  const expandedHome =
    expandedEnv === "~" ? homedir() : expandedEnv.startsWith("~/") || expandedEnv.startsWith("~\\") ? resolve(homedir(), expandedEnv.slice(2)) : expandedEnv;
  if (!expandedHome) throw new WorkflowError("workflow_validation_error", "Resolved workspace.root is empty.");
  return isAbsolute(expandedHome) ? resolve(expandedHome) : resolve(workflowDirectory, expandedHome);
}

function resolveEnvReference(input: string, env: NodeJS.ProcessEnv): string {
  const match = input.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!match) return input;
  return env[match[1]] ?? "";
}

function readTemplatePath(context: WorkflowRenderContext, expression: string): unknown {
  let current: unknown = context;
  for (const segment of expression.split(".")) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      throw new WorkflowError("template_render_error", `Unknown workflow prompt variable: ${expression}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function renderValue(expression: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    throw new WorkflowError("template_render_error", `Could not render workflow prompt variable: ${expression}`);
  }
}
