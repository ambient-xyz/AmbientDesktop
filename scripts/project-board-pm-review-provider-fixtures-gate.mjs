#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  process.env.AMBIENT_PROJECT_BOARD_PM_REVIEW_PROVIDER_FIXTURES_GATE_OUT ||
    join(repoRoot, "test-results", "project-board-release-matrix", "latest-pm-review-provider-fixtures.json"),
);
const runLive = process.argv.includes("--run-live") || process.env.AMBIENT_PROJECT_BOARD_PM_REVIEW_PROVIDER_VARIANTS_LIVE === "1";
const requireLive = process.argv.includes("--require-live") || process.env.AMBIENT_PROJECT_BOARD_PM_REVIEW_PROVIDER_VARIANTS_REQUIRE_LIVE === "1";
const deterministicScenarioNames = [
  "ready_with_constraints",
  "source_conflict_needs_answer",
  "ignored_source_excluded",
  "recommendation_scope_ready_for_activation",
];
const startedAt = new Date();

const deterministic = await runObservedCommand("pnpm", ["run", "test:project-board-pm-review-provider-fixtures"], {
  cwd: repoRoot,
  env: process.env,
});
const liveVariants = runLive
  ? await runObservedCommand("pnpm", ["run", "test:project-board-pm-review-provider-variants:live"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AMBIENT_PROJECT_BOARD_PM_REVIEW_VARIANTS_LIVE: "1",
      },
    })
  : undefined;
const completedAt = new Date();
const issues = [];
const advisoryIssues = [];

if (deterministic.code !== 0) {
  issues.push(`PM Review provider deterministic fixture matrix failed with exit code ${deterministic.code}.`);
}
if (!runLive) {
  const message = "PM Review provider live variant matrix has not run; rerun with --run-live to exercise constrained, conflict, ignored-source, and recommendation reports against Ambient/Pi.";
  if (requireLive) issues.push(message);
  else advisoryIssues.push(message);
} else if (liveVariants?.code !== 0) {
  issues.push(`PM Review provider live variant matrix failed with exit code ${liveVariants?.code ?? "missing"}.`);
}

const report = {
  version: 1,
  status: issues.length === 0 ? "passed" : "attention",
  generatedAt: completedAt.toISOString(),
  startedAt: startedAt.toISOString(),
  completedAt: completedAt.toISOString(),
  durationMs: completedAt.getTime() - startedAt.getTime(),
  sourceRevision: await readSourceRevision(repoRoot),
  deterministic: {
    status: deterministic.code === 0 ? "passed" : "attention",
    command: "pnpm run test:project-board-pm-review-provider-fixtures",
    exitCode: deterministic.code,
    signal: deterministic.signal,
    scenarioNames: deterministicScenarioNames,
    coverage: {
      constrainedReadiness: deterministic.code === 0,
      sourceConflict: deterministic.code === 0,
      ignoredSourceExclusion: deterministic.code === 0,
      recommendationScope: deterministic.code === 0,
      zeroCardContract: deterministic.code === 0,
      activationMetadata: deterministic.code === 0,
    },
    stdoutPreview: tailText(deterministic.stdout),
    stderrPreview: tailText(deterministic.stderr),
  },
  liveVariants: liveVariants
    ? {
        status: liveVariants.code === 0 ? "passed" : "attention",
        required: requireLive,
        command: "pnpm run test:project-board-pm-review-provider-variants:live",
        exitCode: liveVariants.code,
        signal: liveVariants.signal,
        scenarioNames: deterministicScenarioNames,
        stdoutPreview: tailText(liveVariants.stdout),
        stderrPreview: tailText(liveVariants.stderr),
      }
    : {
        status: "not_run",
        required: requireLive,
        scenarioNames: deterministicScenarioNames,
      },
  check: {
    passed: issues.length === 0,
    issues,
    advisoryIssues,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
console.log(
  JSON.stringify(
    {
      status: report.status,
      outputPath,
      deterministic: report.deterministic.status,
      liveVariants: report.liveVariants.status,
      requiredLive: report.liveVariants.required,
      issues,
      advisoryIssues,
    },
    null,
    2,
  ),
);
if (report.status !== "passed") process.exitCode = 1;

function runObservedCommand(command, args, options) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      stderr += `${error instanceof Error ? error.message : String(error)}\n`;
      resolveRun({ code: 1, signal: undefined, stdout, stderr });
    });
    child.on("close", (code, signal) => {
      resolveRun({ code: code ?? 1, signal: signal ?? undefined, stdout, stderr });
    });
  });
}

async function readSourceRevision(cwd) {
  try {
    const [gitHead, status] = await Promise.all([
      execFileText("git", ["rev-parse", "HEAD"], cwd),
      execFileText("git", ["status", "--short"], cwd),
    ]);
    return { gitHead: gitHead.trim(), dirty: status.trim().length > 0 };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function execFileText(command, args, cwd) {
  return new Promise((resolveText, rejectText) => {
    execFile(command, args, { cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        rejectText(new Error(stderr || error.message));
        return;
      }
      resolveText(stdout);
    });
  });
}

function tailText(value) {
  if (!value) return "";
  return value.length > 8_000 ? value.slice(value.length - 8_000) : value;
}
