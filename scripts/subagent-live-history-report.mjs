#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSubagentLiveHistoryReport,
  parseSubagentLiveHistoryJsonl,
  renderSubagentLiveHistoryReportMarkdown,
  subagentLiveHistoryReportPassed,
} from "./subagent-live-history-report-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const historyPath = resolve(args.historyPath || process.env.AMBIENT_SUBAGENT_LIVE_HISTORY_REPORT_HISTORY || join(repoRoot, "test-results", "subagent-release-gate", "live-history.jsonl"));
const outputPath = resolve(args.outputPath || process.env.AMBIENT_SUBAGENT_LIVE_HISTORY_REPORT_OUT || join(repoRoot, "test-results", "subagent-live-history-report", "latest.json"));
const history = await readHistory(historyPath);
const parsed = parseSubagentLiveHistoryJsonl(history.text);
const report = buildSubagentLiveHistoryReport({
  generatedAt: new Date().toISOString(),
  historyPath: relativePath(historyPath),
  historyFound: history.found,
  entries: parsed.entries,
  invalidRows: parsed.invalidRows,
  criteria: {
    minLiveDogfoodRuns: args.minLiveDogfoodRuns,
    maxLiveDogfoodFailureRate: args.maxLiveDogfoodFailureRate,
  },
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputPath.replace(/\.json$/i, ".md"), renderSubagentLiveHistoryReportMarkdown(report), "utf8");

if (args.printJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printSummary(report);
}

if (args.requireReady && !subagentLiveHistoryReportPassed(report)) {
  process.exitCode = 1;
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

function parseArgs(argv) {
  const parsed = {
    historyPath: undefined,
    outputPath: undefined,
    minLiveDogfoodRuns: undefined,
    maxLiveDogfoodFailureRate: undefined,
    requireReady: process.env.AMBIENT_SUBAGENT_LIVE_HISTORY_REPORT_REQUIRE_READY === "1",
    printJson: false,
  };
  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--require-ready") {
      parsed.requireReady = true;
    } else if (arg === "--json") {
      parsed.printJson = true;
    } else if (arg.startsWith("--history=")) {
      parsed.historyPath = arg.slice("--history=".length);
    } else if (arg.startsWith("--out=")) {
      parsed.outputPath = arg.slice("--out=".length);
    } else if (arg.startsWith("--min-live-dogfood-runs=")) {
      parsed.minLiveDogfoodRuns = Number(arg.slice("--min-live-dogfood-runs=".length));
    } else if (arg.startsWith("--max-failure-rate=")) {
      parsed.maxLiveDogfoodFailureRate = Number(arg.slice("--max-failure-rate=".length));
    } else {
      throw new Error(`Unknown sub-agent live history report argument: ${arg}`);
    }
  }
  return parsed;
}

function printSummary(report) {
  process.stdout.write(`Sub-agent live history report: ${report.status}\n`);
  process.stdout.write(`Clean required-live runs: ${report.summary.cleanRequiredRunCount}/${report.criteria.minLiveDogfoodRuns}\n`);
  process.stdout.write(`Required-live failure rate: ${report.summary.failureRate === undefined ? "n/a" : `${Math.round(report.summary.failureRate * 1000) / 10}%`}\n`);
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
