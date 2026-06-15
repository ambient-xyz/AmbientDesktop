export const DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS = 25;
export const SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_SCHEMA_VERSION =
  "ambient-subagent-desktop-dogfood-repeat-report-v1";

export function parseSubagentDesktopDogfoodRepeatArgs(argv, env = process.env) {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const separatorIndex = normalizedArgv.indexOf("--");
  const runnerArgs = separatorIndex === -1 ? normalizedArgv : normalizedArgv.slice(0, separatorIndex);
  const dogfoodArgs = separatorIndex === -1 ? [] : normalizedArgv.slice(separatorIndex + 1);
  const parsed = {
    runs: positiveInteger(env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS, DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS),
    minReadyRuns: undefined,
    stopAfterFailures: positiveInteger(env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_STOP_AFTER_FAILURES, 1),
    requireReady: env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REQUIRE_READY === "1",
    reportPath: env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_OUT,
    dogfoodArgs,
  };

  for (const arg of runnerArgs) {
    if (arg === "--require-ready") {
      parsed.requireReady = true;
    } else if (arg.startsWith("--runs=")) {
      parsed.runs = positiveInteger(arg.slice("--runs=".length), DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS);
    } else if (arg.startsWith("--min-ready-runs=")) {
      parsed.minReadyRuns = positiveInteger(arg.slice("--min-ready-runs=".length), undefined);
    } else if (arg.startsWith("--stop-after-failures=")) {
      parsed.stopAfterFailures = positiveInteger(arg.slice("--stop-after-failures=".length), 1);
    } else if (arg.startsWith("--out=")) {
      parsed.reportPath = arg.slice("--out=".length);
    } else {
      throw new Error(`Unknown sub-agent Desktop dogfood repeat argument: ${arg}`);
    }
  }

  if (parsed.minReadyRuns === undefined) parsed.minReadyRuns = parsed.runs;
  return parsed;
}

export function buildSubagentDesktopDogfoodRepeatPlan(options = {}) {
  const runs = positiveInteger(options.runs, DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS);
  const minReadyRuns = positiveInteger(options.minReadyRuns, runs);
  const stopAfterFailures = positiveInteger(options.stopAfterFailures, 1);
  const dogfoodArgs = Array.isArray(options.dogfoodArgs) ? options.dogfoodArgs : [];
  const historyReportArgs = [
    "scripts/subagent-desktop-dogfood-history-report.mjs",
    `--min-desktop-dogfood-runs=${minReadyRuns}`,
    `--min-workflow-high-load-ready-runs=${minReadyRuns}`,
  ];
  if (options.requireReady === true) historyReportArgs.push("--require-ready");

  return {
    runs,
    minReadyRuns,
    stopAfterFailures,
    requireReady: options.requireReady === true,
    dogfoodCommand: ["node", "scripts/run-electron-dogfood.mjs", "--scenario=subagent-desktop-dogfood", "--", ...dogfoodArgs],
    historyReportCommand: ["node", ...historyReportArgs],
  };
}

export function summarizeSubagentDesktopDogfoodRepeatRuns(results) {
  const runs = Array.isArray(results) ? results : [];
  const failedRuns = runs.filter((run) => run.exitCode !== 0);
  return {
    attemptedRunCount: runs.length,
    failedRunCount: failedRuns.length,
    cleanRunCount: runs.length - failedRuns.length,
    failedRunIndexes: failedRuns.map((run) => run.index),
  };
}

export function buildSubagentDesktopDogfoodRepeatReport(input = {}) {
  const plan = input.plan ?? buildSubagentDesktopDogfoodRepeatPlan(input.options ?? {});
  const runResults = normalizeRunResults(input.runResults);
  const summary = summarizeSubagentDesktopDogfoodRepeatRuns(runResults);
  const historyReport = objectValue(input.historyReport);
  const historyReportExitCode = integerValue(input.historyReportExitCode);
  const blockedGateIds = Array.isArray(historyReport?.blockedGateIds)
    ? historyReport.blockedGateIds.filter(nonEmptyString)
    : [];
  const blockingIssues = repeatBlockingIssues({
    plan,
    summary,
    historyReport,
    historyReportExitCode,
    blockedGateIds,
  });

  return {
    schemaVersion: SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status: blockingIssues.length ? "failed" : "passed",
    ready: blockingIssues.length === 0,
    plan: {
      runs: plan.runs,
      minReadyRuns: plan.minReadyRuns,
      stopAfterFailures: plan.stopAfterFailures,
      requireReady: plan.requireReady,
      dogfoodCommand: plan.dogfoodCommand,
      historyReportCommand: plan.historyReportCommand,
    },
    summary: {
      ...summary,
      stoppedEarly: runResults.length < plan.runs,
      stopAfterFailuresReached: summary.failedRunCount >= plan.stopAfterFailures,
    },
    historyReport: {
      path: input.historyReportPath,
      exitCode: historyReportExitCode,
      status: stringValue(historyReport?.status),
      ready: historyReport?.ready === true,
      blockedGateIds,
      readyRunCount: integerValue(historyReport?.summary?.readyRunCount),
      highLoadReadyRunCount: integerValue(historyReport?.summary?.highLoadReadyRunCount),
      failureRate: numberValue(historyReport?.summary?.failureRate),
    },
    runResults,
    blockingIssues,
  };
}

export function renderSubagentDesktopDogfoodRepeatReportMarkdown(report) {
  const lines = [
    "# Sub-Agent Desktop Dogfood Repeat Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Ready: ${report.ready ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    `- Runs attempted: ${report.summary.attemptedRunCount}/${report.plan.runs}`,
    `- Clean runs: ${report.summary.cleanRunCount}`,
    `- Failed runs: ${report.summary.failedRunCount}`,
    `- Failed indexes: ${report.summary.failedRunIndexes.length ? report.summary.failedRunIndexes.join(", ") : "none"}`,
    `- Stopped early: ${report.summary.stoppedEarly ? "yes" : "no"}`,
    `- History report: ${report.historyReport.path ?? "n/a"} (${report.historyReport.status ?? "missing"})`,
    `- History ready runs: ${report.historyReport.readyRunCount ?? "n/a"}`,
    `- History high-load ready runs: ${report.historyReport.highLoadReadyRunCount ?? "n/a"}`,
    "",
    "## Blocking Issues",
    "",
    ...(report.blockingIssues.length ? report.blockingIssues.map((issue) => `- ${issue}`) : ["- none"]),
    "",
    "## Runs",
    "",
    "| Index | Exit | Duration | Started | Completed |",
    "| --- | --- | --- | --- | --- |",
    ...(report.runResults.length
      ? report.runResults.map((run) => `| ${[
        run.index,
        run.exitCode,
        run.durationMs === undefined ? "n/a" : `${run.durationMs} ms`,
        escapeMarkdownCell(run.startedAt ?? ""),
        escapeMarkdownCell(run.completedAt ?? ""),
      ].join(" | ")} |`)
      : ["| n/a | n/a | n/a | n/a | n/a |"]),
    "",
  ];
  return `${lines.join("\n").trim()}\n`;
}

function repeatBlockingIssues(input) {
  const issues = [];
  if (input.summary.failedRunCount > 0) {
    issues.push(`Desktop dogfood repeat had ${input.summary.failedRunCount} failed run(s): ${input.summary.failedRunIndexes.join(", ")}.`);
  }
  if (input.historyReportExitCode !== 0) {
    issues.push(`Desktop dogfood history report exited with ${input.historyReportExitCode ?? "missing"}.`);
  }
  if (!input.historyReport) {
    issues.push("Desktop dogfood history report artifact was not available after the repeated run.");
  } else if (input.historyReport.ready !== true) {
    issues.push(input.blockedGateIds.length
      ? `Desktop dogfood history report is not ready; blocked gates: ${input.blockedGateIds.join(", ")}.`
      : "Desktop dogfood history report is not ready.");
  }
  if (input.plan.requireReady === true && input.historyReport?.ready !== true) {
    issues.push("Desktop dogfood repeat was run with --require-ready, but graduation history is not ready.");
  }
  return issues;
}

function normalizeRunResults(results) {
  return (Array.isArray(results) ? results : []).map((run) => ({
    index: integerValue(run?.index) ?? 0,
    exitCode: integerValue(run?.exitCode) ?? 1,
    startedAt: stringValue(run?.startedAt),
    completedAt: stringValue(run?.completedAt),
    durationMs: integerValue(run?.durationMs),
  }));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function integerValue(value) {
  return Number.isInteger(value) ? value : undefined;
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === "string" ? value : undefined;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
