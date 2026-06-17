import type { CallableWorkflowTaskControlAction } from "../callable-workflow/callableWorkflowTaskQueue";
import { subagentMaturityEvidencePassed } from "./projectStoreSubagentMappers";
import type {
  SubagentDesktopDogfoodHistoryEntry,
  SubagentMaturityEvidence,
  SubagentReleaseGateLiveHistoryEntry,
  SubagentWorkflowJitterReleaseProfileCheck,
  SubagentWorkflowJitterReleaseProfileReport,
} from "../../shared/subagentMaturity";

export function subagentReleaseGateLiveHistoryFromMaturityEvidence(
  evidence: SubagentMaturityEvidence[],
): SubagentReleaseGateLiveHistoryEntry[] | undefined {
  const rows = evidence.flatMap((item) => {
    if (item.kind !== "live_dogfood_run" || item.status !== "passed") return [];
    return subagentReleaseGateLiveHistoryRowsFromDetails(item.details).map((row) => ({
      ...row,
      runId: row.runId ?? item.runId ?? item.id,
      reportPath: row.reportPath ?? item.artifactPath,
      startedAt: row.startedAt ?? item.createdAt,
      completedAt: row.completedAt ?? item.updatedAt,
    }));
  });
  return rows.length > 0 ? rows : undefined;
}

export function subagentDesktopDogfoodHistoryFromMaturityEvidence(
  evidence: SubagentMaturityEvidence[],
): SubagentDesktopDogfoodHistoryEntry[] | undefined {
  const rows = evidence.flatMap((item) => {
    if (item.kind !== "desktop_dogfood_run" || item.status !== "passed") return [];
    const detailRows = subagentDesktopDogfoodHistoryRowsFromDetails(item.details).map((row) => ({
      ...row,
      runId: row.runId ?? item.runId ?? item.id,
      reportPath: row.reportPath ?? item.artifactPath,
      generatedAt: row.generatedAt ?? item.updatedAt,
    }));
    if (detailRows.length > 0) return detailRows;
    return [{
      runId: item.runId ?? item.id,
      reportPath: item.artifactPath,
      status: "passed",
      classification: "passed",
      ready: true,
      generatedAt: item.updatedAt,
      blockingIssueCount: 0,
      advisoryIssueCount: 0,
    }];
  });
  return rows.length > 0 ? rows : undefined;
}

export function subagentWorkflowJitterReleaseProfileFromEvidence(
  evidence: SubagentMaturityEvidence | undefined,
): SubagentWorkflowJitterReleaseProfileReport | undefined {
  if (!evidence || !subagentMaturityEvidencePassed(evidence)) return undefined;
  const record = recordValue(evidence.details);
  if (!record) return undefined;
  const candidates = [
    record.workflowJitterReleaseProfile,
    record.workflowJitterReleaseGate,
    record.releaseProfileReport,
    record,
  ];
  for (const candidate of candidates) {
    const report = normalizeSubagentWorkflowJitterReleaseProfileReport(candidate);
    if (!report) continue;
    return {
      ...report,
      reportPath: report.reportPath ?? evidence.artifactPath,
      generatedAt: report.generatedAt ?? evidence.updatedAt,
    };
  }
  return undefined;
}

export function subagentReleaseGateLiveHistoryRowsFromDetails(
  details: Record<string, unknown> | undefined,
): SubagentReleaseGateLiveHistoryEntry[] {
  const record = recordValue(details);
  if (!record) return [];
  const rows: unknown[] = [];
  if (Array.isArray(record.liveReleaseGateHistory)) rows.push(...record.liveReleaseGateHistory);
  if (Array.isArray(record.releaseGateHistory)) rows.push(...record.releaseGateHistory);
  if (record.liveReleaseGateHistoryEntry) rows.push(record.liveReleaseGateHistoryEntry);
  if (record.releaseGateHistoryEntry) rows.push(record.releaseGateHistoryEntry);
  return rows.flatMap((row) => {
    const normalized = normalizeSubagentReleaseGateLiveHistoryRow(row);
    return normalized ? [normalized] : [];
  });
}

export function normalizeSubagentReleaseGateLiveHistoryRow(value: unknown): SubagentReleaseGateLiveHistoryEntry | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const liveEvidence = stringRecordValue(record.liveEvidence) as Record<string, string> | undefined;
  const checkCounts = stringRecordValue(record.checkCounts, "number") as Record<string, number> | undefined;
  return {
    ...(stringValue(record.schemaVersion) ? { schemaVersion: stringValue(record.schemaVersion) } : {}),
    ...(stringValue(record.runId) ? { runId: stringValue(record.runId) } : {}),
    ...(stringValue(record.reportPath) ? { reportPath: stringValue(record.reportPath) } : {}),
    ...(stringValue(record.status) ? { status: stringValue(record.status) } : {}),
    ...(typeof record.ready === "boolean" ? { ready: record.ready } : {}),
    ...(typeof record.liveRequired === "boolean" ? { liveRequired: record.liveRequired } : {}),
    ...(stringValue(record.startedAt) ? { startedAt: stringValue(record.startedAt) } : {}),
    ...(stringValue(record.completedAt) ? { completedAt: stringValue(record.completedAt) } : {}),
    ...(finiteNumber(record.durationMs) !== undefined ? { durationMs: finiteNumber(record.durationMs) } : {}),
    ...(checkCounts ? { checkCounts } : {}),
    ...(liveEvidence ? { liveEvidence } : {}),
    ...(stringArrayValue(record.skippedLiveEvidence) ? { skippedLiveEvidence: stringArrayValue(record.skippedLiveEvidence) } : {}),
    ...(finiteNumber(record.blockingIssueCount) !== undefined ? { blockingIssueCount: finiteNumber(record.blockingIssueCount) } : {}),
    ...(finiteNumber(record.advisoryIssueCount) !== undefined ? { advisoryIssueCount: finiteNumber(record.advisoryIssueCount) } : {}),
    ...(stringValue(record.nextSlice) ? { nextSlice: stringValue(record.nextSlice) } : {}),
  };
}

export function normalizeSubagentWorkflowJitterReleaseProfileReport(value: unknown): SubagentWorkflowJitterReleaseProfileReport | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const releaseDecision = workflowJitterReleaseDecisionValue(record.releaseDecision);
  const matrix = workflowJitterReleaseProfileMatrixValue(record.matrix);
  const checks = Array.isArray(record.checks)
    ? record.checks.flatMap((check) => {
      const normalized = workflowJitterReleaseProfileCheckValue(check);
      return normalized ? [normalized] : [];
    })
    : undefined;
  if (!releaseDecision && !matrix && !checks?.length) return undefined;
  const schemaVersion = finiteNumber(record.schemaVersion) ?? stringValue(record.schemaVersion);
  return {
    ...(schemaVersion !== undefined ? { schemaVersion } : {}),
    ...(stringValue(record.status) ? { status: stringValue(record.status) } : {}),
    ...(stringValue(record.generatedAt) ? { generatedAt: stringValue(record.generatedAt) } : {}),
    ...(stringValue(record.reportPath) ? { reportPath: stringValue(record.reportPath) } : {}),
    ...(stringValue(record.matrixReportPath) ? { matrixReportPath: stringValue(record.matrixReportPath) } : {}),
    ...(releaseDecision ? { releaseDecision } : {}),
    ...(matrix ? { matrix } : {}),
    ...(checks ? { checks } : {}),
  };
}

export function workflowJitterReleaseDecisionValue(value: unknown): SubagentWorkflowJitterReleaseProfileReport["releaseDecision"] | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  return {
    ...(typeof record.ready === "boolean" ? { ready: record.ready } : {}),
    ...(typeof record.liveRequired === "boolean" ? { liveRequired: record.liveRequired } : {}),
    ...(typeof record.releaseProfile === "boolean" ? { releaseProfile: record.releaseProfile } : {}),
    ...(typeof record.liveSkipped === "boolean" ? { liveSkipped: record.liveSkipped } : {}),
    ...(stringArrayValue(record.blockingIssues) ? { blockingIssues: stringArrayValue(record.blockingIssues) } : {}),
    ...(stringArrayValue(record.advisoryIssues) ? { advisoryIssues: stringArrayValue(record.advisoryIssues) } : {}),
    ...(stringValue(record.nextSlice) ? { nextSlice: stringValue(record.nextSlice) } : {}),
  };
}

export function workflowJitterReleaseProfileMatrixValue(value: unknown): SubagentWorkflowJitterReleaseProfileReport["matrix"] | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  return {
    ...(stringValue(record.profile) ? { profile: stringValue(record.profile) } : {}),
    ...(finiteNumber(record.deterministicStressUnitCount) !== undefined ? { deterministicStressUnitCount: finiteNumber(record.deterministicStressUnitCount) } : {}),
    ...(finiteNumber(record.livePromptVariantCount) !== undefined ? { livePromptVariantCount: finiteNumber(record.livePromptVariantCount) } : {}),
    ...(finiteNumber(record.liveDogfoodRunCount) !== undefined ? { liveDogfoodRunCount: finiteNumber(record.liveDogfoodRunCount) } : {}),
    ...(stringArrayValue(record.liveFamilies) ? { liveFamilies: stringArrayValue(record.liveFamilies) } : {}),
    ...(finiteNumber(record.productOrTestFailureCount) !== undefined ? { productOrTestFailureCount: finiteNumber(record.productOrTestFailureCount) } : {}),
    ...(finiteNumber(record.providerDegradedCount) !== undefined ? { providerDegradedCount: finiteNumber(record.providerDegradedCount) } : {}),
    ...(finiteNumber(record.environmentSkippedCount) !== undefined ? { environmentSkippedCount: finiteNumber(record.environmentSkippedCount) } : {}),
    ...(finiteNumber(record.promotionCandidateCount) !== undefined ? { promotionCandidateCount: finiteNumber(record.promotionCandidateCount) } : {}),
  };
}

export function workflowJitterReleaseProfileCheckValue(value: unknown): Partial<SubagentWorkflowJitterReleaseProfileCheck> | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  return {
    ...(stringValue(record.id) ? { id: stringValue(record.id) } : {}),
    ...(stringValue(record.status) ? { status: stringValue(record.status) } : {}),
  };
}

export function subagentDesktopDogfoodHistoryRowsFromDetails(
  details: Record<string, unknown> | undefined,
): SubagentDesktopDogfoodHistoryEntry[] {
  const record = recordValue(details);
  if (!record) return [];
  const rows: unknown[] = [];
  if (Array.isArray(record.desktopDogfoodHistory)) rows.push(...record.desktopDogfoodHistory);
  if (Array.isArray(record.desktopDogfoodHistoryRows)) rows.push(...record.desktopDogfoodHistoryRows);
  if (record.desktopDogfoodHistoryEntry) rows.push(record.desktopDogfoodHistoryEntry);
  return rows.flatMap((row) => {
    const normalized = normalizeSubagentDesktopDogfoodHistoryRow(row);
    return normalized ? [normalized] : [];
  });
}

export function normalizeSubagentDesktopDogfoodHistoryRow(value: unknown): SubagentDesktopDogfoodHistoryEntry | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const visualAssertionSummary = assertionHistorySummaryValue(record.visualAssertionSummary);
  const maturityAssertionSummary = assertionHistorySummaryValue(record.maturityAssertionSummary);
  return {
    ...(stringValue(record.schemaVersion) ? { schemaVersion: stringValue(record.schemaVersion) } : {}),
    ...(stringValue(record.runId) ? { runId: stringValue(record.runId) } : {}),
    ...(stringValue(record.reportPath) ? { reportPath: stringValue(record.reportPath) } : {}),
    ...(stringValue(record.status) ? { status: stringValue(record.status) } : {}),
    ...(stringValue(record.classification) ? { classification: stringValue(record.classification) } : {}),
    ...(typeof record.ready === "boolean" ? { ready: record.ready } : {}),
    ...(stringValue(record.generatedAt) ? { generatedAt: stringValue(record.generatedAt) } : {}),
    ...(stringValue(record.provider) ? { provider: stringValue(record.provider) } : {}),
    ...(stringValue(record.featureFlag) ? { featureFlag: stringValue(record.featureFlag) } : {}),
    ...(finiteNumber(record.scenarioCount) !== undefined ? { scenarioCount: finiteNumber(record.scenarioCount) } : {}),
    ...(stringArrayValue(record.scenarios) ? { scenarios: stringArrayValue(record.scenarios) } : {}),
    ...(stringArrayValue(record.requiredScenarioMissing) ? { requiredScenarioMissing: stringArrayValue(record.requiredScenarioMissing) } : {}),
    ...(visualAssertionSummary ? { visualAssertionSummary } : {}),
    ...(maturityAssertionSummary ? { maturityAssertionSummary } : {}),
    ...(finiteNumber(record.screenshotCount) !== undefined ? { screenshotCount: finiteNumber(record.screenshotCount) } : {}),
    ...(finiteNumber(record.criticalOverlapCount) !== undefined ? { criticalOverlapCount: finiteNumber(record.criticalOverlapCount) } : {}),
    ...(typeof record.horizontalOverflowFree === "boolean" ? { horizontalOverflowFree: record.horizontalOverflowFree } : {}),
    ...(finiteNumber(record.workflowHighLoadPatternCount) !== undefined ? { workflowHighLoadPatternCount: finiteNumber(record.workflowHighLoadPatternCount) } : {}),
    ...(finiteNumber(record.blockingIssueCount) !== undefined ? { blockingIssueCount: finiteNumber(record.blockingIssueCount) } : {}),
    ...(finiteNumber(record.advisoryIssueCount) !== undefined ? { advisoryIssueCount: finiteNumber(record.advisoryIssueCount) } : {}),
    ...(stringArrayValue(record.issues) ? { issues: stringArrayValue(record.issues) } : {}),
  };
}

export function assertionHistorySummaryValue(value: unknown): SubagentDesktopDogfoodHistoryEntry["visualAssertionSummary"] | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  return {
    ...(finiteNumber(record.requiredCount) !== undefined ? { requiredCount: finiteNumber(record.requiredCount) } : {}),
    ...(finiteNumber(record.passedCount) !== undefined ? { passedCount: finiteNumber(record.passedCount) } : {}),
    ...(finiteNumber(record.failedCount) !== undefined ? { failedCount: finiteNumber(record.failedCount) } : {}),
    ...(finiteNumber(record.missingCount) !== undefined ? { missingCount: finiteNumber(record.missingCount) } : {}),
  };
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function stringArrayValue(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

export function stringRecordValue(value: unknown, valueType: "string" | "number" = "string"): Record<string, string> | Record<string, number> | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const entries = Object.entries(record);
  if (entries.length === 0) return {};
  if (valueType === "number") {
    return entries.every(([, item]) => typeof item === "number" && Number.isFinite(item))
      ? Object.fromEntries(entries) as Record<string, number>
      : undefined;
  }
  return entries.every(([, item]) => typeof item === "string")
    ? Object.fromEntries(entries) as Record<string, string>
    : undefined;
}

export function callableWorkflowTaskControlActionLabel(action: CallableWorkflowTaskControlAction): string {
  switch (action) {
    case "pause_requested":
      return "pause requested";
    case "resume_requested":
      return "resume requested";
    case "cancel_requested":
      return "cancel requested";
  }
}
