#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSubagentDesktopDogfoodRepeatReport,
  buildSubagentDesktopDogfoodRepeatPlan,
  parseSubagentDesktopDogfoodRepeatArgs,
  renderSubagentDesktopDogfoodRepeatReportMarkdown,
  summarizeSubagentDesktopDogfoodRepeatRuns,
} from "./subagent-desktop-dogfood-repeat-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = parseSubagentDesktopDogfoodRepeatArgs(process.argv.slice(2));
const plan = buildSubagentDesktopDogfoodRepeatPlan(options);
const reportPath = resolve(repoRoot, options.reportPath || "test-results/subagent-desktop-dogfood-repeat/latest.json");
const historyReportPath = resolve(repoRoot, "test-results/subagent-desktop-dogfood-history-report/latest.json");
const runResults = [];
let failures = 0;
const startedAt = new Date().toISOString();

for (let index = 1; index <= plan.runs; index += 1) {
  process.stdout.write(`[subagent-desktop-dogfood-repeat] run ${index}/${plan.runs}\n`);
  const runStartedAt = new Date().toISOString();
  const exitCode = await run(plan.dogfoodCommand[0], plan.dogfoodCommand.slice(1));
  const runCompletedAt = new Date().toISOString();
  runResults.push({
    index,
    exitCode,
    startedAt: runStartedAt,
    completedAt: runCompletedAt,
    durationMs: Date.parse(runCompletedAt) - Date.parse(runStartedAt),
  });
  if (exitCode !== 0) {
    failures += 1;
    process.stderr.write(`[subagent-desktop-dogfood-repeat] run ${index} failed with exit code ${exitCode}\n`);
  }
  if (failures >= plan.stopAfterFailures) {
    process.stderr.write(`[subagent-desktop-dogfood-repeat] stopping after ${failures} failed run(s)\n`);
    break;
  }
}

const summary = summarizeSubagentDesktopDogfoodRepeatRuns(runResults);
process.stdout.write(`[subagent-desktop-dogfood-repeat] clean runs ${summary.cleanRunCount}/${summary.attemptedRunCount}\n`);

const historyExitCode = await run(plan.historyReportCommand[0], plan.historyReportCommand.slice(1));
const historyReport = await readJsonIfExists(historyReportPath);
const completedAt = new Date().toISOString();
const report = buildSubagentDesktopDogfoodRepeatReport({
  plan,
  runResults,
  historyReportExitCode: historyExitCode,
  historyReport: historyReport.data,
  historyReportPath: relativePath(historyReportPath),
  startedAt,
  completedAt,
  generatedAt: completedAt,
});
await writeRepeatReport(reportPath, report);
process.stdout.write(`[subagent-desktop-dogfood-repeat] report ${relativePath(reportPath)}\n`);
if (failures > 0 || historyExitCode !== 0 || (plan.requireReady && !report.ready)) process.exitCode = 1;

async function run(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: cleanChildEnv(process.env),
  });
  const [code, signal] = await once(child, "exit");
  return code ?? (signal ? 1 : 0);
}

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  return next;
}

async function readJsonIfExists(path) {
  try {
    return { found: true, data: JSON.parse(await readFile(path, "utf8")) };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { found: false, data: undefined };
    }
    throw error;
  }
}

async function writeRepeatReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.replace(/\.json$/i, ".md"), renderSubagentDesktopDogfoodRepeatReportMarkdown(report), "utf8");
}

function relativePath(path) {
  return path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path;
}
