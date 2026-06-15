#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSubagentDesktopDogfoodHistoryEntry,
  buildSubagentDesktopDogfoodHistoryReport,
  parseSubagentDesktopDogfoodHistoryJsonl,
  renderSubagentDesktopDogfoodHistoryReportMarkdown,
  subagentDesktopDogfoodHistoryReportPassed,
} from "./subagent-desktop-dogfood-history-report-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const historyPath = resolve(args.historyPath || process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_HISTORY || join(repoRoot, "test-results", "subagent-desktop-dogfood", "history.jsonl"));
const outputPath = resolve(args.outputPath || process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_OUT || join(repoRoot, "test-results", "subagent-desktop-dogfood-history-report", "latest.json"));

if (args.appendLatestPath) {
  await appendLatestArtifact(args.appendLatestPath, { requireExists: true });
}
if (args.appendLatestIfExistsPath) {
  await appendLatestArtifact(args.appendLatestIfExistsPath, { requireExists: false });
}

const history = await readHistory(historyPath);
const parsed = parseSubagentDesktopDogfoodHistoryJsonl(history.text);
const report = buildSubagentDesktopDogfoodHistoryReport({
  generatedAt: new Date().toISOString(),
  historyPath: relativePath(historyPath),
  historyFound: history.found,
  entries: parsed.entries,
  invalidRows: parsed.invalidRows,
  criteria: {
    minDesktopDogfoodRuns: args.minDesktopDogfoodRuns,
    maxDesktopDogfoodFailureRate: args.maxDesktopDogfoodFailureRate,
    minWorkflowHighLoadReadyRuns: args.minWorkflowHighLoadReadyRuns,
  },
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputPath.replace(/\.json$/i, ".md"), renderSubagentDesktopDogfoodHistoryReportMarkdown(report), "utf8");

if (args.printJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printSummary(report);
}

if (args.requireReady && !subagentDesktopDogfoodHistoryReportPassed(report)) {
  process.exitCode = 1;
}

async function appendLatestArtifact(path, options) {
  const latestPath = resolve(path);
  const latest = await readJsonIfExists(latestPath);
  if (!latest.found) {
    if (options.requireExists) throw new Error(`Desktop dogfood latest artifact is missing: ${latestPath}`);
    process.stdout.write(`Desktop dogfood latest artifact missing; history append skipped: ${latestPath}\n`);
    return;
  }
  const entry = buildSubagentDesktopDogfoodHistoryEntry(latest.data, { reportPath: relativePath(latestPath) });
  await mkdir(dirname(historyPath), { recursive: true });
  await appendFile(historyPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function readHistory(path) {
  try {
    return { found: true, text: await readFile(path, "utf8") };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { found: false, text: "" };
    }
    throw error;
  }
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

function parseArgs(argv) {
  const parsed = {
    historyPath: undefined,
    outputPath: undefined,
    appendLatestPath: undefined,
    appendLatestIfExistsPath: undefined,
    minDesktopDogfoodRuns: undefined,
    maxDesktopDogfoodFailureRate: undefined,
    minWorkflowHighLoadReadyRuns: undefined,
    requireReady: process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_REQUIRE_READY === "1",
    printJson: false,
  };
  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--require-ready") {
      parsed.requireReady = true;
    } else if (arg === "--json") {
      parsed.printJson = true;
    } else if (arg === "--append-latest") {
      parsed.appendLatestPath = join(repoRoot, "test-results", "subagent-desktop-dogfood", "latest.json");
    } else if (arg.startsWith("--append-latest=")) {
      parsed.appendLatestPath = arg.slice("--append-latest=".length);
    } else if (arg === "--append-latest-if-exists") {
      parsed.appendLatestIfExistsPath = join(repoRoot, "test-results", "subagent-desktop-dogfood", "latest.json");
    } else if (arg.startsWith("--append-latest-if-exists=")) {
      parsed.appendLatestIfExistsPath = arg.slice("--append-latest-if-exists=".length);
    } else if (arg.startsWith("--history=")) {
      parsed.historyPath = arg.slice("--history=".length);
    } else if (arg.startsWith("--out=")) {
      parsed.outputPath = arg.slice("--out=".length);
    } else if (arg.startsWith("--min-desktop-dogfood-runs=")) {
      parsed.minDesktopDogfoodRuns = Number(arg.slice("--min-desktop-dogfood-runs=".length));
    } else if (arg.startsWith("--max-failure-rate=")) {
      parsed.maxDesktopDogfoodFailureRate = Number(arg.slice("--max-failure-rate=".length));
    } else if (arg.startsWith("--min-workflow-high-load-ready-runs=")) {
      parsed.minWorkflowHighLoadReadyRuns = Number(arg.slice("--min-workflow-high-load-ready-runs=".length));
    } else {
      throw new Error(`Unknown sub-agent Desktop dogfood history report argument: ${arg}`);
    }
  }
  return parsed;
}

function printSummary(report) {
  process.stdout.write(`Sub-agent Desktop dogfood history report: ${report.status}\n`);
  process.stdout.write(`Ready Desktop dogfood runs: ${report.summary.readyRunCount}/${report.criteria.minDesktopDogfoodRuns}\n`);
  process.stdout.write(`Desktop dogfood failure rate: ${report.summary.failureRate === undefined ? "n/a" : `${Math.round(report.summary.failureRate * 1000) / 10}%`}\n`);
  if (report.blockedGateIds.length) {
    process.stdout.write("\nBlocked gates:\n");
    for (const gate of report.gates.filter((item) => item.status === "blocked")) {
      process.stdout.write(`- ${gate.label}: ${gate.actual}\n`);
    }
  }
  process.stdout.write(`Report: ${outputPath}\n`);
}

function relativePath(path) {
  return path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path;
}
