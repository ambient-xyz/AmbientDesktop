import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
  REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS,
  REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";

export const SUBAGENT_DESKTOP_DOGFOOD_HISTORY_ROW_SCHEMA_VERSION = "ambient-subagent-desktop-dogfood-history-v1";
export const SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_SCHEMA_VERSION = "ambient-subagent-desktop-dogfood-history-report-v1";

export const DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_CRITERIA = {
  minDesktopDogfoodRuns: 25,
  maxDesktopDogfoodFailureRate: 0.05,
  minWorkflowHighLoadReadyRuns: 25,
};

export function parseSubagentDesktopDogfoodHistoryJsonl(text) {
  const entries = [];
  const invalidRows = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        invalidRows.push(invalidHistoryRow(index + 1, "Row must be a JSON object.", trimmed));
        return;
      }
      entries.push(parsed);
    } catch (error) {
      invalidRows.push(invalidHistoryRow(index + 1, error instanceof Error ? error.message : "Invalid JSON.", trimmed));
    }
  });
  return { entries, invalidRows };
}

export function buildSubagentDesktopDogfoodHistoryEntry(artifact, options = {}) {
  const visualAssertionSummary = summarizeAssertions(artifact?.visualAssertions, REQUIRED_DESKTOP_VISUAL_ASSERTIONS);
  const maturityAssertionSummary = summarizeAssertions(artifact?.maturityAssertions, REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS);
  const checkSummary = summarizeChecks(artifact?.checks);
  const scenarios = stringArray(artifact?.scenarios);
  const requiredScenarioMissing = REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.filter((id) => !scenarios.includes(id));
  const screenshotCount = screenshotArtifactCount(artifact?.artifacts);
  const workflowHighLoadPatternCount = stringArray(artifact?.workflowHighLoadPatternLabels).length;
  const issues = desktopDogfoodEntryIssues({
    artifact,
    visualAssertionSummary,
    maturityAssertionSummary,
    requiredScenarioMissing,
    screenshotCount,
    checkSummary,
    workflowHighLoadPatternCount,
  });
  const generatedAt = stringValue(artifact?.generatedAt);

  return {
    schemaVersion: SUBAGENT_DESKTOP_DOGFOOD_HISTORY_ROW_SCHEMA_VERSION,
    runId: options.runId ?? historyRunId(generatedAt),
    reportPath: options.reportPath,
    status: stringValue(artifact?.status) ?? "missing",
    classification: stringValue(artifact?.classification) ?? "missing",
    ready: issues.length === 0,
    generatedAt,
    startedAt: stringValue(artifact?.startedAt),
    completedAt: stringValue(artifact?.completedAt),
    durationMs: Number.isFinite(artifact?.durationMs) ? Math.max(0, Number(artifact.durationMs)) : undefined,
    gitCommit: stringValue(artifact?.gitCommit),
    gitBranch: stringValue(artifact?.gitBranch),
    provider: stringValue(artifact?.provider),
    featureFlag: stringValue(artifact?.featureFlag),
    parentThreadId: stringValue(artifact?.parentThreadId),
    childRunCount: stringArray(artifact?.childRunIds).length,
    childThreadCount: stringArray(artifact?.childThreadIds).length,
    scenarioCount: scenarios.length,
    scenarios,
    requiredScenarioMissing,
    visualAssertionSummary,
    maturityAssertionSummary,
    screenshotCount,
    criticalOverlapCount: checkSummary.criticalOverlapCount,
    horizontalOverflowFree: checkSummary.horizontalOverflowFree,
    workflowHighLoadPatternCount,
    blockingIssueCount: issues.length,
    advisoryIssueCount: 0,
    issues,
  };
}

export function buildSubagentDesktopDogfoodHistoryReport(input = {}) {
  const criteria = normalizeCriteria(input.criteria);
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const invalidRows = Array.isArray(input.invalidRows) ? input.invalidRows : [];
  const summary = summarizeDesktopDogfoodHistory(entries, criteria);
  const gates = [
    historyAvailableGate(input.historyFound !== false),
    historyParseGate(invalidRows),
    desktopDogfoodCountGate(summary, criteria),
    desktopDogfoodFailureRateGate(summary, criteria),
    requiredScenarioCoverageGate(summary, criteria),
    visualAssertionsGate(summary),
    maturityAssertionsGate(summary),
    workflowHighLoadGate(summary, criteria),
  ];
  const blockedGateIds = gates.filter((gate) => gate.status === "blocked").map((gate) => gate.id);
  return {
    schemaVersion: SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    historyPath: input.historyPath,
    status: blockedGateIds.length ? "blocked" : "ready_to_graduate",
    ready: blockedGateIds.length === 0,
    criteria,
    summary,
    blockedGateIds,
    gates,
    invalidRows,
    latestRuns: latestDesktopDogfoodRuns(entries, 8),
  };
}

export function subagentDesktopDogfoodHistoryReportPassed(report) {
  return report?.ready === true && report?.status === "ready_to_graduate";
}

export function renderSubagentDesktopDogfoodHistoryReportMarkdown(report) {
  const lines = [
    "# Sub-Agent Desktop Dogfood History Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Ready: ${report.ready ? "yes" : "no"}`,
    `History: ${report.historyPath ?? "not supplied"}`,
    "",
    "## Summary",
    "",
    `- Total rows: ${report.summary.totalRunCount}`,
    `- Ready rows: ${report.summary.readyRunCount}`,
    `- Failed rows: ${report.summary.failedRunCount}`,
    `- Failure rate: ${report.summary.failureRate === undefined ? "n/a" : formatPercent(report.summary.failureRate)}`,
    `- Visual-failure rows: ${report.summary.visualFailureRunCount}`,
    `- Maturity-failure rows: ${report.summary.maturityFailureRunCount}`,
    `- High-load ready rows: ${report.summary.highLoadReadyRunCount}`,
    `- Latest generatedAt: ${report.summary.latestGeneratedAt ?? "n/a"}`,
    "",
    "## Gates",
    "",
    "| Gate | Status | Required | Actual | Detail |",
    "| --- | --- | --- | --- | --- |",
    ...report.gates.map((gate) => `| ${[
      escapeMarkdownCell(gate.label),
      gate.status,
      escapeMarkdownCell(gate.required),
      escapeMarkdownCell(gate.actual),
      escapeMarkdownCell(gate.detail ?? ""),
    ].join(" | ")} |`),
    "",
    "## Scenario Coverage",
    "",
    "| Scenario | Ready Rows | All Rows |",
    "| --- | --- | --- |",
    ...report.summary.requiredScenarioCoverage.map((row) => `| ${[
      escapeMarkdownCell(row.id),
      row.readyRunCount,
      row.runCount,
    ].join(" | ")} |`),
    "",
    "## Latest Runs",
    "",
    "| Generated | Run | Status | Ready | Visual | Maturity | Scenarios | Report |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(report.latestRuns.length
      ? report.latestRuns.map((run) => `| ${[
        escapeMarkdownCell(run.generatedAt ?? ""),
        escapeMarkdownCell(run.runId ?? ""),
        escapeMarkdownCell(run.status ?? ""),
        run.ready ? "yes" : "no",
        escapeMarkdownCell(run.visual),
        escapeMarkdownCell(run.maturity),
        escapeMarkdownCell(run.missingScenarios === 0 ? "complete" : `${run.missingScenarios} missing`),
        escapeMarkdownCell(run.reportPath ?? ""),
      ].join(" | ")} |`)
      : ["| n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |"]),
    "",
  ];
  if (report.invalidRows.length) {
    lines.push(
      "## Invalid Rows",
      "",
      "| Line | Issue | Preview |",
      "| --- | --- | --- |",
      ...report.invalidRows.map((row) => `| ${[
        row.lineNumber,
        escapeMarkdownCell(row.issue),
        escapeMarkdownCell(row.preview),
      ].join(" | ")} |`),
      "",
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

function summarizeDesktopDogfoodHistory(entries) {
  const summary = {
    totalRunCount: entries.length,
    readyRunCount: 0,
    failedRunCount: 0,
    visualFailureRunCount: 0,
    maturityFailureRunCount: 0,
    readyRowsWithCompleteVisuals: 0,
    readyRowsWithCompleteMaturity: 0,
    highLoadReadyRunCount: 0,
    screenshotRunCount: 0,
    failureRate: undefined,
    latestGeneratedAt: undefined,
    requiredScenarioCoverage: REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.map((id) => ({ id, runCount: 0, readyRunCount: 0 })),
  };
  const scenarioCoverage = new Map(summary.requiredScenarioCoverage.map((row) => [row.id, row]));

  for (const entry of entries) {
    const ready = entry?.ready === true;
    if (ready) summary.readyRunCount += 1;
    else summary.failedRunCount += 1;
    if (assertionSummaryComplete(entry?.visualAssertionSummary)) {
      if (ready) summary.readyRowsWithCompleteVisuals += 1;
    } else {
      summary.visualFailureRunCount += 1;
    }
    if (assertionSummaryComplete(entry?.maturityAssertionSummary)) {
      if (ready) summary.readyRowsWithCompleteMaturity += 1;
    } else {
      summary.maturityFailureRunCount += 1;
    }
    if (ready && safeCount(entry?.workflowHighLoadPatternCount) >= 6) summary.highLoadReadyRunCount += 1;
    if (safeCount(entry?.screenshotCount) > 0) summary.screenshotRunCount += 1;
    if (isLaterTimestamp(entry?.generatedAt, summary.latestGeneratedAt)) summary.latestGeneratedAt = entry.generatedAt;
    const scenarios = stringArray(entry?.scenarios);
    for (const id of REQUIRED_DESKTOP_DOGFOOD_SCENARIOS) {
      if (!scenarios.includes(id)) continue;
      const row = scenarioCoverage.get(id);
      row.runCount += 1;
      if (ready) row.readyRunCount += 1;
    }
  }

  if (summary.totalRunCount > 0) {
    summary.failureRate = summary.failedRunCount / summary.totalRunCount;
  }
  return summary;
}

function desktopDogfoodEntryIssues(input) {
  const issues = [];
  const artifact = input.artifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return ["Desktop dogfood artifact must be a JSON object."];
  }
  if (artifact.schemaVersion !== "ambient-subagent-desktop-dogfood-v1") {
    issues.push(`Desktop dogfood artifact schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") issues.push(`Desktop dogfood artifact status is ${artifact.status ?? "missing"}; expected passed.`);
  if (artifact.classification !== "passed") {
    issues.push(`Desktop dogfood artifact classification is ${artifact.classification ?? "missing"}; expected passed.`);
  }
  if (!nonEmptyString(artifact.gitCommit) || !/^[a-f0-9]{7,40}$/i.test(artifact.gitCommit)) {
    issues.push("Desktop dogfood artifact is missing a gitCommit hash.");
  }
  if (!nonEmptyString(artifact.gitBranch)) issues.push("Desktop dogfood artifact is missing gitBranch.");
  if (!nonEmptyString(artifact.startedAt)) issues.push("Desktop dogfood artifact is missing startedAt.");
  if (!nonEmptyString(artifact.completedAt)) issues.push("Desktop dogfood artifact is missing completedAt.");
  if (!Number.isFinite(artifact.durationMs) || Number(artifact.durationMs) < 0) {
    issues.push("Desktop dogfood artifact is missing non-negative durationMs.");
  }
  if (!nonEmptyString(artifact.provider)) issues.push("Desktop dogfood artifact is missing provider.");
  if (artifact.featureFlag !== "ambient.subagents") {
    issues.push(`Desktop dogfood artifact featureFlag is ${artifact.featureFlag ?? "missing"}; expected ambient.subagents.`);
  }
  if (input.requiredScenarioMissing.length) {
    issues.push(`Desktop dogfood artifact is missing required scenarios: ${input.requiredScenarioMissing.join(", ")}.`);
  }
  if (!assertionSummaryComplete(input.visualAssertionSummary)) {
    issues.push("Desktop dogfood artifact has missing or failed visual assertions.");
  }
  if (!assertionSummaryComplete(input.maturityAssertionSummary)) {
    issues.push("Desktop dogfood artifact has missing or failed maturity assertions.");
  }
  if (input.screenshotCount < 1) issues.push("Desktop dogfood artifact is missing screenshot evidence.");
  if (input.checkSummary.horizontalOverflowFree !== true) issues.push("Desktop dogfood artifact reports horizontal overflow or lacks layout checks.");
  if (input.checkSummary.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood artifact reports ${input.checkSummary.criticalOverlapCount} critical layout overlaps.`);
  }
  if (input.workflowHighLoadPatternCount < 6) {
    issues.push(`Desktop dogfood artifact has ${input.workflowHighLoadPatternCount} workflow high-load pattern labels; expected at least 6.`);
  }
  if (artifact.error) issues.push("Desktop dogfood artifact includes an error.");
  return issues;
}

function summarizeAssertions(assertions, requiredIds) {
  const statuses = {};
  const missingIds = [];
  const failedIds = [];
  let passedCount = 0;
  for (const id of requiredIds) {
    const assertion = assertions && typeof assertions === "object" && !Array.isArray(assertions)
      ? assertions[id]
      : undefined;
    const status = stringValue(assertion?.status) ?? "missing";
    statuses[id] = status;
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      missingIds.push(id);
    } else if (assertion.id !== id || status !== "passed" || !nonEmptyStringArray(assertion.evidence)) {
      failedIds.push(id);
    } else {
      passedCount += 1;
    }
  }
  return {
    requiredCount: requiredIds.length,
    passedCount,
    failedCount: failedIds.length,
    missingCount: missingIds.length,
    failedIds,
    missingIds,
    statuses,
  };
}

function summarizeChecks(checks) {
  const summary = {
    criticalOverlapCount: 0,
    horizontalOverflowFree: true,
    horizontalOverflowCheckCount: 0,
  };
  visitObject(checks, (key, value) => {
    if (key === "criticalOverlapCount" && Number.isFinite(value)) {
      summary.criticalOverlapCount += Math.max(0, Number(value));
    }
    if (key === "horizontalOverflowFree" && typeof value === "boolean") {
      summary.horizontalOverflowCheckCount += 1;
      if (value !== true) summary.horizontalOverflowFree = false;
    }
  });
  if (summary.horizontalOverflowCheckCount === 0) summary.horizontalOverflowFree = false;
  return summary;
}

function visitObject(value, callback) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visitObject(item, callback);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    callback(key, child);
    visitObject(child, callback);
  }
}

function screenshotArtifactCount(artifacts) {
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts)) return 0;
  return Object.values(artifacts).filter((value) => typeof value === "string" && /\.(png|jpg|jpeg|webp)$/i.test(value)).length;
}

function assertionSummaryComplete(summary) {
  return summary?.passedCount === summary?.requiredCount && summary?.failedCount === 0 && summary?.missingCount === 0;
}

function historyAvailableGate(historyFound) {
  return {
    id: "history_available",
    status: historyFound ? "passed" : "blocked",
    label: "Desktop dogfood history file",
    required: "A Desktop dogfood history.jsonl artifact exists for repeated full-app accounting.",
    actual: historyFound ? "Found." : "Missing.",
  };
}

function historyParseGate(invalidRows) {
  return {
    id: "history_parse",
    status: invalidRows.length ? "blocked" : "passed",
    label: "Desktop dogfood history parsing",
    required: "Every non-empty history row parses as a JSON object.",
    actual: invalidRows.length ? `${invalidRows.length} invalid rows.` : "All rows parsed.",
  };
}

function desktopDogfoodCountGate(summary, criteria) {
  return {
    id: "desktop_dogfood_count",
    status: summary.readyRunCount >= criteria.minDesktopDogfoodRuns ? "passed" : "blocked",
    label: "Desktop dogfood volume",
    required: `${criteria.minDesktopDogfoodRuns} ready Desktop dogfood runs.`,
    actual: `${summary.readyRunCount} ready recorded.`,
    detail: `${summary.totalRunCount} total rows; ${summary.failedRunCount} failed rows.`,
  };
}

function desktopDogfoodFailureRateGate(summary, criteria) {
  if (summary.failureRate === undefined) {
    return {
      id: "desktop_dogfood_failure_rate",
      status: "blocked",
      label: "Desktop dogfood failure rate",
      required: `Desktop dogfood failures at or below ${formatPercent(criteria.maxDesktopDogfoodFailureRate)}.`,
      actual: "No Desktop dogfood rows.",
    };
  }
  return {
    id: "desktop_dogfood_failure_rate",
    status: summary.failureRate <= criteria.maxDesktopDogfoodFailureRate ? "passed" : "blocked",
    label: "Desktop dogfood failure rate",
    required: `Desktop dogfood failures at or below ${formatPercent(criteria.maxDesktopDogfoodFailureRate)}.`,
    actual: `${summary.failedRunCount}/${summary.totalRunCount} failed (${formatPercent(summary.failureRate)}).`,
  };
}

function requiredScenarioCoverageGate(summary, criteria) {
  const missing = summary.requiredScenarioCoverage.filter((row) => row.readyRunCount < criteria.minDesktopDogfoodRuns);
  return {
    id: "required_scenario_coverage",
    status: missing.length ? "blocked" : "passed",
    label: "Required scenario coverage",
    required: `Every required Desktop scenario appears in ${criteria.minDesktopDogfoodRuns} ready runs.`,
    actual: missing.length ? `${missing.length} scenarios short.` : "All required scenarios covered.",
    detail: missing.slice(0, 5).map((row) => `${row.id}:${row.readyRunCount}`).join(", "),
  };
}

function visualAssertionsGate(summary) {
  return {
    id: "visual_assertions",
    status: summary.readyRunCount > 0 && summary.readyRowsWithCompleteVisuals === summary.readyRunCount ? "passed" : "blocked",
    label: "Semantic visual assertions",
    required: "Every ready Desktop dogfood row has all required visual assertions passed.",
    actual: `${summary.readyRowsWithCompleteVisuals}/${summary.readyRunCount} ready rows complete; ${summary.visualFailureRunCount} rows failed or missing visual assertions.`,
  };
}

function maturityAssertionsGate(summary) {
  return {
    id: "maturity_assertions",
    status: summary.readyRunCount > 0 && summary.readyRowsWithCompleteMaturity === summary.readyRunCount ? "passed" : "blocked",
    label: "Desktop maturity assertions",
    required: "Every ready Desktop dogfood row has all required maturity assertions passed.",
    actual: `${summary.readyRowsWithCompleteMaturity}/${summary.readyRunCount} ready rows complete; ${summary.maturityFailureRunCount} rows failed or missing maturity assertions.`,
  };
}

function workflowHighLoadGate(summary, criteria) {
  return {
    id: "workflow_high_load_repetition",
    status: summary.highLoadReadyRunCount >= criteria.minWorkflowHighLoadReadyRuns ? "passed" : "blocked",
    label: "Workflow high-load repetition",
    required: `${criteria.minWorkflowHighLoadReadyRuns} ready rows include all six Symphony high-load patterns.`,
    actual: `${summary.highLoadReadyRunCount} ready high-load rows recorded.`,
  };
}

function latestDesktopDogfoodRuns(entries, count) {
  return entries
    .map((entry) => ({
      runId: stringValue(entry?.runId),
      reportPath: stringValue(entry?.reportPath),
      status: stringValue(entry?.status),
      ready: entry?.ready === true,
      generatedAt: stringValue(entry?.generatedAt),
      visual: assertionSummaryLabel(entry?.visualAssertionSummary),
      maturity: assertionSummaryLabel(entry?.maturityAssertionSummary),
      missingScenarios: Array.isArray(entry?.requiredScenarioMissing) ? entry.requiredScenarioMissing.length : REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length,
    }))
    .sort((a, b) => timestampValue(b.generatedAt) - timestampValue(a.generatedAt))
    .slice(0, count);
}

function assertionSummaryLabel(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "missing";
  return `${safeCount(summary.passedCount)}/${safeCount(summary.requiredCount)} passed`;
}

function normalizeCriteria(input = {}) {
  const minDesktopDogfoodRuns = positiveInteger(
    input.minDesktopDogfoodRuns,
    DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_CRITERIA.minDesktopDogfoodRuns,
  );
  return {
    minDesktopDogfoodRuns,
    maxDesktopDogfoodFailureRate: boundedRate(
      input.maxDesktopDogfoodFailureRate,
      DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_CRITERIA.maxDesktopDogfoodFailureRate,
    ),
    minWorkflowHighLoadReadyRuns: positiveInteger(input.minWorkflowHighLoadReadyRuns, minDesktopDogfoodRuns),
  };
}

function invalidHistoryRow(lineNumber, issue, line) {
  return {
    lineNumber,
    issue,
    preview: line.length > 180 ? `${line.slice(0, 177)}...` : line,
  };
}

function historyRunId(timestamp) {
  return nonEmptyString(timestamp)
    ? timestamp.replace(/[^a-zA-Z0-9._-]+/g, "-")
    : `unknown-${Date.now()}`;
}

function isLaterTimestamp(candidate, current) {
  if (!candidate) return false;
  if (!current) return !Number.isNaN(Date.parse(candidate));
  const candidateTime = Date.parse(candidate);
  const currentTime = Date.parse(current);
  if (Number.isNaN(candidateTime)) return false;
  if (Number.isNaN(currentTime)) return true;
  return candidateTime > currentTime;
}

function timestampValue(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function stringValue(value) {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter(nonEmptyString) : [];
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function boundedRate(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function safeCount(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}
