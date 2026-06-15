#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_PATH = resolve(repoRoot, "test-results", "workflow-jitter-matrix", "replay", "latest-candidate-replay.json");

export function validateWorkflowJitterReplayCandidateBundle(bundle, input = {}) {
  const issues = [];
  const warnings = [];
  const candidate = objectValue(bundle?.candidate);
  const replay = objectValue(candidate.replay);
  const matrixReplay = objectValue(replay.matrixReplay);
  const directReplay = objectValue(replay.directReplay);
  const envKeys = Array.isArray(replay.envKeys) ? replay.envKeys : [];
  const taskId = stringValue(candidate.taskId);

  if (bundle?.schemaVersion !== 1) issues.push("Replay bundle schemaVersion must be 1.");
  if (!candidate.id) issues.push("Replay bundle candidate is missing id.");
  if (!taskId) issues.push("Replay bundle candidate is missing taskId.");
  if (replay.schemaVersion !== 1) issues.push("Replay candidate replay schemaVersion must be 1.");
  if (!replay.runId) issues.push("Replay candidate is missing source matrix runId.");
  if (replay.taskId !== taskId) issues.push(`Replay taskId ${replay.taskId ?? "missing"} does not match candidate taskId ${taskId ?? "missing"}.`);
  if (!replay.sourceRevision?.gitHead) warnings.push("Replay candidate is missing source git revision.");

  if (!matrixReplay.command) issues.push("Replay candidate is missing structured matrixReplay.command.");
  if (!Array.isArray(matrixReplay.args)) issues.push("Replay candidate matrixReplay.args must be an array.");
  if (Array.isArray(matrixReplay.args)) {
    if (!matrixReplay.args.includes(`--task=${taskId}`)) issues.push(`Replay candidate matrixReplay.args must include --task=${taskId}.`);
    if (!matrixReplay.args.includes("--retries=0")) issues.push("Replay candidate matrixReplay.args must include --retries=0 for deterministic reproduction.");
    if (!matrixReplay.args.some((arg) => String(arg).startsWith("--output-dir="))) {
      issues.push("Replay candidate matrixReplay.args must include an isolated --output-dir.");
    }
  }
  if (!Array.isArray(matrixReplay.taskIds) || !matrixReplay.taskIds.includes(taskId)) {
    issues.push(`Replay candidate matrixReplay.taskIds must include ${taskId}.`);
  }
  if (matrixReplay.retries !== 0) issues.push("Replay candidate matrixReplay.retries must be 0.");
  if (!directReplay.command) issues.push("Replay candidate is missing structured directReplay.command.");
  if (!Array.isArray(directReplay.args)) issues.push("Replay candidate directReplay.args must be an array.");
  if (!Array.isArray(replay.attempts)) issues.push("Replay candidate is missing attempt summaries.");

  for (const key of envKeys) {
    if (typeof key !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(key)) {
      issues.push(`Replay candidate env key ${JSON.stringify(key)} is not a sanitized environment variable name.`);
    }
  }

  if (input.requireSourceMatch) {
    const current = objectValue(input.sourceRevision);
    const replayRevision = objectValue(replay.sourceRevision);
    if (!current.gitHead) issues.push("Current git revision is unavailable for replay source matching.");
    if (current.dirty) issues.push("Current tracked worktree is dirty; replay source matching requires a clean tree.");
    if (replayRevision.dirty) issues.push("Replay candidate was produced from a tracked-dirty source tree.");
    if (current.gitHead && replayRevision.gitHead && current.gitHead !== replayRevision.gitHead) {
      issues.push(`Replay candidate was produced from ${replayRevision.gitHead}, but current git head is ${current.gitHead}.`);
    }
  }

  return {
    status: issues.length ? "fail" : warnings.length ? "warn" : "pass",
    issues,
    warnings,
  };
}

export function buildWorkflowJitterReplayCandidatePlan(bundle, input = {}) {
  const validation = validateWorkflowJitterReplayCandidateBundle(bundle, input);
  if (validation.status === "fail") {
    const error = new Error(`Workflow jitter replay candidate is invalid: ${validation.issues.join(" ")}`);
    error.validation = validation;
    throw error;
  }
  const candidate = bundle.candidate;
  const replay = candidate.replay;
  const matrixReplay = replay.matrixReplay;
  const outputDir = input.outputDir ?? matrixReplay.outputDir;
  const args = matrixReplay.args.map((arg) =>
    String(arg).startsWith("--output-dir=") && outputDir ? `--output-dir=${outputDir}` : arg,
  );
  return {
    schemaVersion: 1,
    candidateId: candidate.id,
    taskId: candidate.taskId,
    sourceRevision: replay.sourceRevision,
    command: matrixReplay.command === "node" ? process.execPath : matrixReplay.command,
    args,
    cwd: resolve(repoRoot, matrixReplay.cwd ?? "."),
    envKeys: replay.envKeys ?? [],
    validation,
    dryRun: input.execute !== true,
  };
}

export async function runWorkflowJitterReplayCandidate(input = {}) {
  const bundle = input.bundle ?? await readReplayCandidateBundle(input.candidatePath);
  const plan = buildWorkflowJitterReplayCandidatePlan(bundle, input);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  let result;
  let status = "dry_run";
  if (input.execute === true) {
    result = await (input.runCommand ?? execFileCapture)({
      command: plan.command,
      args: plan.args,
      cwd: plan.cwd,
      env: process.env,
    });
    status = result.exitCode === 0 ? "passed" : "failed";
  }
  const report = {
    schemaVersion: 1,
    generatedAt,
    status,
    candidatePath: input.candidatePath,
    plan,
    result,
  };
  if (input.outputPath !== false) await writeReplayCandidateReport(report, input.outputPath ?? DEFAULT_OUTPUT_PATH);
  return report;
}

export function renderWorkflowJitterReplayCandidateMarkdown(report) {
  const lines = [
    "# Workflow Jitter Candidate Replay",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Candidate: ${report.plan?.candidateId ?? "missing"}`,
    `Task: ${report.plan?.taskId ?? "missing"}`,
    "",
    "## Validation",
    "",
    `- Status: ${report.plan?.validation?.status ?? "missing"}`,
    `- Issues: ${(report.plan?.validation?.issues ?? []).join("; ") || "none"}`,
    `- Warnings: ${(report.plan?.validation?.warnings ?? []).join("; ") || "none"}`,
    "",
    "## Replay Plan",
    "",
    `- Command: \`${[report.plan?.command, ...(report.plan?.args ?? [])].filter(Boolean).join(" ")}\``,
    `- CWD: \`${report.plan?.cwd ?? "missing"}\``,
    `- Environment keys: ${(report.plan?.envKeys ?? []).length ? report.plan.envKeys.map((key) => `\`${key}\``).join(", ") : "none"}`,
  ];
  if (report.result) {
    lines.push(
      "",
      "## Result",
      "",
      `- Exit code: ${report.result.exitCode ?? "signal"}`,
      `- Signal: ${report.result.signal ?? "none"}`,
      `- Stdout chars: ${report.result.stdout?.length ?? 0}`,
      `- Stderr chars: ${report.result.stderr?.length ?? 0}`,
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

async function readReplayCandidateBundle(path) {
  if (!path) throw new Error("Missing --candidate=PATH.");
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeReplayCandidateReport(report, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputPath.replace(/\.json$/i, ".md"), renderWorkflowJitterReplayCandidateMarkdown(report), "utf8");
}

function execFileCapture(input) {
  return new Promise((resolveResult) => {
    execFile(input.command, input.args, { cwd: input.cwd, env: input.env, encoding: "utf8" }, (error, stdout, stderr) => {
      resolveResult({
        exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
        signal: error?.signal,
        stdout,
        stderr,
      });
    });
  });
}

async function readSourceRevision(cwd) {
  try {
    const [gitHead, status] = await Promise.all([
      execFileText("git", ["rev-parse", "HEAD"], cwd),
      execFileText("git", ["status", "--short", "--untracked-files=no"], cwd),
    ]);
    return { gitHead: gitHead.trim(), dirty: status.trim().length > 0 };
  } catch {
    return {};
  }
}

function execFileText(commandName, args, cwd) {
  return new Promise((resolveText, rejectText) => {
    execFile(commandName, args, { cwd, encoding: "utf8" }, (error, stdout) => {
      if (error) rejectText(error);
      else resolveText(stdout);
    });
  });
}

function parseCliArgs(args) {
  const parsed = {
    candidatePath: undefined,
    outputPath: process.env.AMBIENT_WORKFLOW_JITTER_REPLAY_OUT || DEFAULT_OUTPUT_PATH,
    outputDir: undefined,
    execute: false,
    requireSourceMatch: false,
    json: false,
    help: false,
  };
  for (const arg of args) {
    if (arg === "--execute") parsed.execute = true;
    else if (arg === "--dry-run") parsed.execute = false;
    else if (arg === "--require-current-head") parsed.requireSourceMatch = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg.startsWith("--candidate=")) parsed.candidatePath = resolve(repoRoot, arg.slice("--candidate=".length));
    else if (arg.startsWith("--out=")) parsed.outputPath = resolve(repoRoot, arg.slice("--out=".length));
    else if (arg.startsWith("--output-dir=")) parsed.outputDir = arg.slice("--output-dir=".length);
    else throw new Error(`Unknown option ${arg}. Run with --help for usage.`);
  }
  return parsed;
}

function usage() {
  return `Usage: node scripts/workflow-jitter-replay-candidate.mjs --candidate=PATH [options]

Options:
  --candidate=PATH        Promotion candidate JSON sidecar to validate or replay.
  --dry-run               Validate and print the replay plan without executing it. Default.
  --execute               Execute the structured matrix replay command.
  --output-dir=PATH       Override the replay matrix output directory.
  --out=PATH              Replay report JSON path.
  --require-current-head  Fail validation unless the candidate source revision matches the current clean git head.
  --json                  Print the full replay report JSON.
`;
}

function printHumanSummary(report) {
  console.log(JSON.stringify({
    status: report.status,
    candidateId: report.plan?.candidateId,
    taskId: report.plan?.taskId,
    validation: report.plan?.validation,
    command: [report.plan?.command, ...(report.plan?.args ?? [])].filter(Boolean).join(" "),
  }, null, 2));
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    if (options.requireSourceMatch) options.sourceRevision = await readSourceRevision(repoRoot);
    const report = await runWorkflowJitterReplayCandidate(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHumanSummary(report);
    if (report.status === "failed" || report.plan.validation.status === "fail") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
