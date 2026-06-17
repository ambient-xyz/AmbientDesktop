import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { CollaborationMode, PermissionMode } from "../../shared/types";
import type { AgentHarnessVariant } from "./agentHarnessVariant";

const execFileAsync = promisify(execFile);
const MAX_TOP_LEVEL_ENTRIES = 32;
const MAX_CHANGED_PATHS = 24;
const MAX_PACKAGE_SCRIPTS = 18;
const MAX_LINE_CHARS = 220;
const SECRETISH_PATTERN = /(^|[/_.-])(?:api[_-]?key|secret|token|credential|password|passwd|auth|\.env)(?:[/_.-]|$)/i;
const GENERATED_OR_NOISY_ENTRIES = new Set([".git", "node_modules", "out", "build", "release", "test-results"]);

export interface AgentBootstrapContextInput {
  workspacePath: string;
  permissionMode: PermissionMode;
  collaborationMode: CollaborationMode;
  variant: AgentHarnessVariant;
  now?: Date;
  commandRunner?: CommandRunner;
}

export interface AgentBootstrapContextResult {
  text?: string;
  variantId: string;
  enabled: boolean;
  chars: number;
  truncated: boolean;
  omittedSecretLikeEntries: number;
}

interface CommandResult {
  ok: boolean;
  stdout: string;
}

type CommandRunner = (cwd: string, command: string, args: string[], timeoutMs: number) => Promise<CommandResult>;

export async function buildAgentBootstrapContext(input: AgentBootstrapContextInput): Promise<AgentBootstrapContextResult> {
  if (!input.variant.enabled || !input.variant.bootstrap) {
    return {
      variantId: input.variant.id,
      enabled: false,
      chars: 0,
      truncated: false,
      omittedSecretLikeEntries: 0,
    };
  }

  const runner = input.commandRunner ?? runCommand;
  const omitted = { secretLikeEntries: 0 };
  const lines = [
    "[Ambient Workspace Bootstrap]",
    `Variant: ${input.variant.id}`,
    `Created: ${(input.now ?? new Date()).toISOString()}`,
    "Purpose: deterministic local facts to reduce setup probing. Inspect files before editing when exact contents matter.",
    `Workspace: ${sanitizeText(input.workspacePath)}`,
    `Workspace name: ${sanitizeText(basename(input.workspacePath) || input.workspacePath)}`,
    `Permission mode: ${input.permissionMode}`,
    `Collaboration mode: ${input.collaborationMode}`,
    "",
    ...(await repoLines(input.workspacePath, input.variant, runner, omitted)),
    ...(await topLevelLines(input.workspacePath, omitted)),
    ...(await instructionLines(input.workspacePath, omitted)),
    ...(await packageScriptLines(input.workspacePath, input.variant, omitted)),
    ...(input.variant.bootstrap.includeToolClasses ? toolClassLines() : []),
    ...(await runtimeVersionLines(input.workspacePath, input.variant, runner)),
    "",
    "Operational reminders:",
    "- This bootstrap is a map, not source of truth. Read files before relying on exact contents.",
    "- Do not read secret-like files unless the user explicitly asks and the tool policy allows it.",
    "- Prefer targeted validation commands from the project scripts after making changes.",
    "[/Ambient Workspace Bootstrap]",
  ].filter((line) => line !== undefined);

  const capped = capText(lines.map(capLine).join("\n"), input.variant.bootstrap.maxChars);
  return {
    text: capped.text,
    variantId: input.variant.id,
    enabled: true,
    chars: capped.text.length,
    truncated: capped.truncated,
    omittedSecretLikeEntries: omitted.secretLikeEntries,
  };
}

export function applyAgentBootstrapToPrompt(prompt: string, result: AgentBootstrapContextResult): string {
  if (!result.text) return prompt;
  return `${result.text}\n\n${prompt}`;
}

export function isSecretLikePath(path: string): boolean {
  return SECRETISH_PATTERN.test(path.replace(/\\/g, "/"));
}

function capText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const notice = "\n[Bootstrap truncated at configured context budget.]";
  return {
    text: `${text.slice(0, Math.max(0, maxChars - notice.length))}${notice}`,
    truncated: true,
  };
}

async function repoLines(
  workspacePath: string,
  variant: AgentHarnessVariant,
  runner: CommandRunner,
  omitted: { secretLikeEntries: number },
): Promise<string[]> {
  if (!variant.bootstrap?.includeGitSummary) return [];
  const inside = await runner(workspacePath, "git", ["rev-parse", "--is-inside-work-tree"], 5_000);
  if (!inside.ok || inside.stdout.trim() !== "true") return ["Git: not a repository", ""];

  const [branch, status] = await Promise.all([
    runner(workspacePath, "git", ["branch", "--show-current"], 5_000),
    runner(workspacePath, "git", ["status", "--short"], 5_000),
  ]);
  const rawChangedPaths = status.stdout
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((path) => path.replace(/^.* -> /, ""));
  const changedPaths = filterSecretLike(rawChangedPaths, omitted).slice(0, MAX_CHANGED_PATHS);
  const extra = rawChangedPaths.length > changedPaths.length ? `; ${rawChangedPaths.length - changedPaths.length} omitted` : "";
  return [
    "Git:",
    `- branch: ${sanitizeText(branch.stdout.trim() || "detached or unknown")}`,
    `- dirty paths: ${rawChangedPaths.length}${extra}`,
    ...(changedPaths.length ? [`- changed path preview: ${changedPaths.map(sanitizeText).join(", ")}`] : []),
    "",
  ];
}

async function topLevelLines(workspacePath: string, omitted: { secretLikeEntries: number }): Promise<string[]> {
  try {
    const entries = await readdir(workspacePath, { withFileTypes: true });
    const displayEntries: string[] = [];
    let noisyOmitted = 0;
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (isSecretLikePath(entry.name)) {
        omitted.secretLikeEntries += 1;
        continue;
      }
      if (GENERATED_OR_NOISY_ENTRIES.has(entry.name) || /^release[-_]/i.test(entry.name)) {
        noisyOmitted += 1;
        continue;
      }
      displayEntries.push(`${entry.name}${entry.isDirectory() ? "/" : ""}`);
      if (displayEntries.length >= MAX_TOP_LEVEL_ENTRIES) break;
    }
    const suffixes = [];
    if (entries.length > displayEntries.length) suffixes.push(`${entries.length - displayEntries.length} total entries not shown`);
    if (noisyOmitted) suffixes.push(`${noisyOmitted} generated/cache entries omitted`);
    if (omitted.secretLikeEntries) suffixes.push(`${omitted.secretLikeEntries} secret-like entries omitted`);
    return [
      "Top-level workspace entries:",
      displayEntries.length ? `- ${displayEntries.map(sanitizeText).join(", ")}` : "- no displayable entries",
      ...(suffixes.length ? [`- omissions: ${suffixes.join("; ")}`] : []),
      "",
    ];
  } catch (error) {
    return [`Top-level workspace entries: unavailable (${sanitizeText(errorMessage(error))})`, ""];
  }
}

async function instructionLines(workspacePath: string, omitted: { secretLikeEntries: number }): Promise<string[]> {
  const candidates = ["AGENTS.md", "Agents.md", "agents.md", "WORKFLOW.md", "Workflow.md"];
  const present: string[] = [];
  await Promise.all(
    candidates.map(async (name) => {
      if (isSecretLikePath(name)) {
        omitted.secretLikeEntries += 1;
        return;
      }
      try {
        await readFile(join(workspacePath, name), "utf8");
        present.push(name);
      } catch {
        // Absence is expected for most workspaces.
      }
    }),
  );
  return [
    "Local instruction files:",
    present.length
      ? `- present: ${present.sort().map(sanitizeText).join(", ")}. Read applicable instructions before editing.`
      : "- none detected at workspace root",
    "",
  ];
}

async function packageScriptLines(
  workspacePath: string,
  variant: AgentHarnessVariant,
  omitted: { secretLikeEntries: number },
): Promise<string[]> {
  if (!variant.bootstrap?.includePackageScripts) return [];
  try {
    const raw = await readFile(join(workspacePath, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { packageManager?: unknown; scripts?: Record<string, unknown> };
    const scripts = Object.entries(parsed.scripts ?? {})
      .filter(([, command]) => typeof command === "string")
      .slice(0, MAX_PACKAGE_SCRIPTS)
      .map(([name, command]) => `${name}: ${redactSecretLikeText(String(command), omitted)}`);
    return [
      "Package metadata:",
      typeof parsed.packageManager === "string" ? `- packageManager: ${sanitizeText(parsed.packageManager)}` : "- packageManager: not declared",
      scripts.length ? `- scripts: ${scripts.map(sanitizeText).join("; ")}` : "- scripts: none declared",
      "",
    ];
  } catch (error) {
    if (isNotFound(error)) return [];
    return [`Package metadata: package.json unavailable (${sanitizeText(errorMessage(error))})`, ""];
  }
}

function toolClassLines(): string[] {
  return [
    "Ambient capability classes:",
    "- workspace inspection and mutation: file_read, file_write, bash",
    "- browser and media: browser_search, browser_content, browser_nav, browser_screenshot, media_download",
    "- long context: long_context_process for oversized files or compact previews",
    "- capability and package routing: ambient_cli_search/describe/run, capability builder, plugin and Pi package tools",
    "- project workflows: workflow compiler/runtime tools and project-board task tools when available",
    "",
  ];
}

async function runtimeVersionLines(
  workspacePath: string,
  variant: AgentHarnessVariant,
  runner: CommandRunner,
): Promise<string[]> {
  if (!variant.bootstrap?.includeRuntimeVersions) return [];
  const checks: Array<[string, string, string[]]> = [
    ["node", "node", ["--version"]],
    ["pnpm", "pnpm", ["--version"]],
    ["npm", "npm", ["--version"]],
    ["git", "git", ["--version"]],
    ["python3", "python3", ["--version"]],
    ["go", "go", ["version"]],
    ["rustc", "rustc", ["--version"]],
  ];
  const results = await Promise.all(
    checks.map(async ([label, command, args]) => {
      const result = await runner(workspacePath, command, args, 4_000);
      return `${label}: ${result.ok ? sanitizeText(result.stdout.trim().split("\n")[0] || "available") : "not found"}`;
    }),
  );
  return ["Runtime probes:", `- ${results.join("; ")}`, ""];
}

function filterSecretLike(paths: string[], omitted: { secretLikeEntries: number }): string[] {
  const safe: string[] = [];
  for (const path of paths) {
    if (isSecretLikePath(path)) {
      omitted.secretLikeEntries += 1;
      continue;
    }
    safe.push(path);
  }
  return safe;
}

function redactSecretLikeText(value: string, omitted: { secretLikeEntries: number }): string {
  let next = value.replace(/([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*=)([^\s"';&]+)/gi, (_match, prefix) => {
    omitted.secretLikeEntries += 1;
    return `${prefix}[redacted]`;
  });
  next = next.replace(/(--(?:api-key|token|secret|password)\s+)([^\s"';&]+)/gi, (_match, prefix) => {
    omitted.secretLikeEntries += 1;
    return `${prefix}[redacted]`;
  });
  return next;
}

function sanitizeText(value: string): string {
  return redactSecretLikeLiteral(value.replace(/\s+/g, " ").trim());
}

function redactSecretLikeLiteral(value: string): string {
  if (isSecretLikePath(value)) return "[redacted secret-like path]";
  return value.replace(/([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*=)([^\s"';&]+)/gi, "$1[redacted]");
}

function capLine(value: string): string {
  return value.length <= MAX_LINE_CHARS ? value : `${value.slice(0, MAX_LINE_CHARS - 3)}...`;
}

async function runCommand(cwd: string, command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024,
    });
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
