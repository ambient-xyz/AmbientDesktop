#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  process.env.AMBIENT_PROJECT_BOARD_PM_REVIEW_UI_VARIANTS_GATE_OUT ||
    join(repoRoot, "test-results", "project-board-release-matrix", "latest-pm-review-ui-variants.json"),
);
const scenarioNames = [
  "ready_with_constraints",
  "source_conflict_needs_answer",
  "ignored_source_excluded",
  "recommendation_scope_ready_for_activation",
];
const startedAt = new Date();

const result = await runObservedCommand("pnpm", [
  "exec",
  "vitest",
  "run",
  "src/renderer/src/projectBoardUiModel.test.ts",
  "-t",
  "PM Review report UI variants",
]);
const completedAt = new Date();
const issues = [];
if (result.code !== 0) {
  issues.push(`PM Review UI variant renderer test failed with exit code ${result.code}.`);
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
    status: result.code === 0 ? "passed" : "attention",
    command: 'pnpm exec vitest run src/renderer/src/projectBoardUiModel.test.ts -t "PM Review report UI variants"',
    exitCode: result.code,
    signal: result.signal,
    scenarioNames,
    coverage: {
      constrainedReadiness: result.code === 0,
      sourceConflict: result.code === 0,
      ignoredSourceExclusion: result.code === 0,
      recommendationScope: result.code === 0,
      rendererSections: result.code === 0,
      recommendationBanner: result.code === 0,
    },
    stdoutPreview: tailText(result.stdout),
    stderrPreview: tailText(result.stderr),
  },
  check: {
    passed: issues.length === 0,
    issues,
    advisoryIssues: [],
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
      scenarioCount: report.deterministic.scenarioNames.length,
      issues,
    },
    null,
    2,
  ),
);
if (report.status !== "passed") process.exitCode = 1;

function runObservedCommand(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
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
