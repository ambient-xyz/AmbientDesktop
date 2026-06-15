import {
  SUBAGENT_LIVE_EVIDENCE_LABELS,
} from "./subagent-live-evidence-lanes.mjs";

export const SUBAGENT_LIVE_HISTORY_REPORT_SCHEMA_VERSION = "ambient-subagent-live-history-report-v1";

export const DEFAULT_SUBAGENT_LIVE_HISTORY_REPORT_CRITERIA = {
  minLiveDogfoodRuns: 25,
  maxLiveDogfoodFailureRate: 0.05,
};

export const REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS = SUBAGENT_LIVE_EVIDENCE_LABELS;

export function parseSubagentLiveHistoryJsonl(text) {
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

export function buildSubagentLiveHistoryReport(input = {}) {
  const criteria = normalizeCriteria(input.criteria);
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const invalidRows = Array.isArray(input.invalidRows) ? input.invalidRows : [];
  const summary = summarizeLiveHistory(entries);
  const gates = [
    historyAvailableGate(input.historyFound !== false),
    historyParseGate(invalidRows),
    liveDogfoodCountGate(summary, criteria),
    liveDogfoodFailureRateGate(summary, criteria),
    liveSmokeGate(summary),
  ];
  const blockedGateIds = gates.filter((gate) => gate.status === "blocked").map((gate) => gate.id);
  return {
    schemaVersion: SUBAGENT_LIVE_HISTORY_REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    historyPath: input.historyPath,
    status: blockedGateIds.length ? "blocked" : "ready_to_graduate",
    ready: blockedGateIds.length === 0,
    criteria,
    summary,
    blockedGateIds,
    gates,
    invalidRows,
    latestRequiredRuns: latestRequiredRuns(entries, 8),
  };
}

export function subagentLiveHistoryReportPassed(report) {
  return report?.ready === true && report?.status === "ready_to_graduate";
}

export function renderSubagentLiveHistoryReportMarkdown(report) {
  const lines = [
    "# Sub-Agent Live History Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Ready: ${report.ready ? "yes" : "no"}`,
    `History: ${report.historyPath ?? "not supplied"}`,
    "",
    "## Summary",
    "",
    `- Total rows: ${report.summary.totalRunCount}`,
    `- Required-live rows: ${report.summary.requiredRunCount}`,
    `- Clean required-live rows: ${report.summary.cleanRequiredRunCount}`,
    `- Failed required-live rows: ${report.summary.failedRequiredRunCount}`,
    `- Advisory required-live rows: ${report.summary.advisoryRequiredRunCount}`,
    `- Skipped-evidence rows: ${report.summary.skippedEvidenceRunCount}`,
    `- Live Pi smoke observed: ${report.summary.livePiSmokePassed ? "yes" : "no"}`,
    `- Required-live failure rate: ${report.summary.failureRate === undefined ? "n/a" : formatPercent(report.summary.failureRate)}`,
    `- Latest required-live completion: ${report.summary.latestCompletedAt ?? "n/a"}`,
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
    "## Live Evidence Lanes",
    "",
    "| Lane | Present Rows | Skipped Rows | Latest Status | Latest Completion |",
    "| --- | --- | --- | --- | --- |",
    ...(report.summary.evidenceLanes?.length
      ? report.summary.evidenceLanes.map((lane) => `| ${[
        escapeMarkdownCell(lane.label),
        lane.presentRunCount,
        lane.skippedRunCount,
        escapeMarkdownCell(lane.latestStatus ?? "n/a"),
        escapeMarkdownCell(lane.latestCompletedAt ?? "n/a"),
      ].join(" | ")} |`)
      : ["| n/a | n/a | n/a | n/a | n/a |"]),
    "",
    "## Latest Required-Live Rows",
    "",
    "| Completed | Run | Status | Ready | Skipped Evidence | Report |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(report.latestRequiredRuns.length
      ? report.latestRequiredRuns.map((run) => `| ${[
        escapeMarkdownCell(run.completedAt ?? ""),
        escapeMarkdownCell(run.runId ?? ""),
        escapeMarkdownCell(run.status ?? ""),
        run.ready ? "yes" : "no",
        escapeMarkdownCell(run.skippedEvidenceLabels.length === 0 ? "none" : run.skippedEvidenceLabels.join(", ")),
        escapeMarkdownCell(run.reportPath ?? ""),
      ].join(" | ")} |`)
      : ["| n/a | n/a | n/a | n/a | n/a | n/a |"]),
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

function summarizeLiveHistory(entries) {
  const summary = {
    totalRunCount: entries.length,
    requiredRunCount: 0,
    cleanRequiredRunCount: 0,
    failedRequiredRunCount: 0,
    advisoryRequiredRunCount: 0,
    skippedEvidenceRunCount: 0,
    livePiSmokePassed: false,
    evidenceLanes: REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS.map((label) => ({
      label,
      presentRunCount: 0,
      skippedRunCount: 0,
      latestStatus: undefined,
      latestCompletedAt: undefined,
    })),
    failureRate: undefined,
    latestCompletedAt: undefined,
  };
  for (const entry of entries) {
    if (entry?.liveRequired !== true) continue;
    summary.requiredRunCount += 1;
    const skippedEvidenceCount = skippedLiveEvidenceCount(entry);
    const evidenceStatuses = liveEvidenceStatuses(entry);
    for (const lane of summary.evidenceLanes) {
      const status = evidenceStatuses.get(lane.label) === "present" ? "present" : "skipped";
      if (status === "present") lane.presentRunCount += 1;
      else lane.skippedRunCount += 1;
      if (isLaterTimestamp(entry.completedAt, lane.latestCompletedAt)) {
        lane.latestStatus = status;
        lane.latestCompletedAt = entry.completedAt;
      }
    }
    if (skippedEvidenceCount > 0) summary.skippedEvidenceRunCount += 1;
    if (entry.liveEvidence?.["Ambient/Pi smoke"] === "present" && entry.ready === true) {
      summary.livePiSmokePassed = true;
    }
    if (isCleanRequiredLiveRun(entry)) {
      summary.cleanRequiredRunCount += 1;
    } else if (isFailedRequiredLiveRun(entry)) {
      summary.failedRequiredRunCount += 1;
    } else {
      summary.advisoryRequiredRunCount += 1;
    }
    if (isLaterTimestamp(entry.completedAt, summary.latestCompletedAt)) {
      summary.latestCompletedAt = entry.completedAt;
    }
  }
  if (summary.requiredRunCount > 0) {
    summary.failureRate = summary.failedRequiredRunCount / summary.requiredRunCount;
  }
  return summary;
}

function historyAvailableGate(historyFound) {
  return {
    id: "history_available",
    status: historyFound ? "passed" : "blocked",
    label: "Live history file",
    required: "A live-history.jsonl artifact exists for repeated dogfood accounting.",
    actual: historyFound ? "Found." : "Missing.",
  };
}

function historyParseGate(invalidRows) {
  return {
    id: "history_parse",
    status: invalidRows.length ? "blocked" : "passed",
    label: "Live history parsing",
    required: "Every non-empty history row parses as a JSON object.",
    actual: invalidRows.length ? `${invalidRows.length} invalid rows.` : "All rows parsed.",
  };
}

function liveDogfoodCountGate(summary, criteria) {
  return {
    id: "live_dogfood_count",
    status: summary.cleanRequiredRunCount >= criteria.minLiveDogfoodRuns ? "passed" : "blocked",
    label: "Live dogfood volume",
    required: `${criteria.minLiveDogfoodRuns} clean required-live dogfood runs.`,
    actual: `${summary.cleanRequiredRunCount} clean recorded.`,
    detail: `Required-live history: ${summary.cleanRequiredRunCount} clean, ${summary.failedRequiredRunCount} failed, ${summary.advisoryRequiredRunCount} advisory, ${summary.skippedEvidenceRunCount} skipped-evidence.`,
  };
}

function liveDogfoodFailureRateGate(summary, criteria) {
  if (summary.failureRate === undefined) {
    return {
      id: "live_dogfood_failure_rate",
      status: "blocked",
      label: "Live dogfood failure rate",
      required: `Required-live dogfood run failures at or below ${formatPercent(criteria.maxLiveDogfoodFailureRate)}.`,
      actual: "No required-live rows.",
    };
  }
  return {
    id: "live_dogfood_failure_rate",
    status: summary.failureRate <= criteria.maxLiveDogfoodFailureRate ? "passed" : "blocked",
    label: "Live dogfood failure rate",
    required: `Required-live dogfood run failures at or below ${formatPercent(criteria.maxLiveDogfoodFailureRate)}.`,
    actual: `${summary.failedRequiredRunCount}/${summary.requiredRunCount} failed (${formatPercent(summary.failureRate)}).`,
  };
}

function liveSmokeGate(summary) {
  return {
    id: "live_smoke",
    status: summary.livePiSmokePassed ? "passed" : "blocked",
    label: "Live Pi smoke",
    required: "At least one required-live row includes Ambient/Pi smoke evidence.",
    actual: summary.livePiSmokePassed ? "Present." : "Missing.",
  };
}

function latestRequiredRuns(entries, count) {
  return entries
    .filter((entry) => entry?.liveRequired === true)
    .map((entry) => ({
      runId: stringValue(entry.runId),
      reportPath: stringValue(entry.reportPath),
      status: stringValue(entry.status),
      ready: entry.ready === true,
      completedAt: stringValue(entry.completedAt),
      skippedEvidenceCount: skippedLiveEvidenceCount(entry),
      skippedEvidenceLabels: skippedLiveEvidenceLabels(entry),
    }))
    .sort((a, b) => timestampValue(b.completedAt) - timestampValue(a.completedAt))
    .slice(0, count);
}

function isCleanRequiredLiveRun(entry) {
  return entry?.liveRequired === true &&
    entry.ready === true &&
    entry.status === "passed" &&
    safeCount(entry.blockingIssueCount) === 0 &&
    safeCount(entry.advisoryIssueCount) === 0 &&
    skippedLiveEvidenceCount(entry) === 0;
}

function isFailedRequiredLiveRun(entry) {
  if (entry?.liveRequired !== true) return false;
  return entry.ready !== true ||
    entry.status === "attention" ||
    safeCount(entry.blockingIssueCount) > 0 ||
    skippedLiveEvidenceCount(entry) > 0;
}

function skippedLiveEvidenceCount(entry) {
  return skippedLiveEvidenceLabels(entry).length;
}

function skippedLiveEvidenceLabels(entry) {
  const statuses = liveEvidenceStatuses(entry);
  return REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS.filter((label) => statuses.get(label) !== "present");
}

function liveEvidenceStatuses(entry) {
  const evidence = entry?.liveEvidence;
  const evidenceObject = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence
    : undefined;
  const skippedLabels = new Set(Array.isArray(entry?.skippedLiveEvidence)
    ? entry.skippedLiveEvidence.filter((label) => typeof label === "string" && label.length > 0)
    : []);
  return new Map(REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS.map((label) => {
    if (skippedLabels.has(label)) return [label, "skipped"];
    return [label, evidenceObject?.[label] === "present" ? "present" : "skipped"];
  }));
}

function normalizeCriteria(input = {}) {
  return {
    minLiveDogfoodRuns: positiveInteger(input.minLiveDogfoodRuns, DEFAULT_SUBAGENT_LIVE_HISTORY_REPORT_CRITERIA.minLiveDogfoodRuns),
    maxLiveDogfoodFailureRate: boundedRate(input.maxLiveDogfoodFailureRate, DEFAULT_SUBAGENT_LIVE_HISTORY_REPORT_CRITERIA.maxLiveDogfoodFailureRate),
  };
}

function invalidHistoryRow(lineNumber, issue, line) {
  return {
    lineNumber,
    issue,
    preview: line.length > 180 ? `${line.slice(0, 177)}...` : line,
  };
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
