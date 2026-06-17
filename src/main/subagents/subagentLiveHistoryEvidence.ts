import type {
  SubagentMaturityEvidence,
  SubagentReleaseGateLiveHistoryEntry,
} from "../../shared/subagentMaturity";
import { SUBAGENT_LIVE_EVIDENCE_LABELS } from "../../shared/subagentLiveEvidenceLanes";

export const SUBAGENT_LIVE_HISTORY_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-live-history-evidence-v1" as const;

export interface SubagentLiveHistoryEvidenceStore {
  recordSubagentMaturityEvidence(input: {
    kind: "live_dogfood_run";
    status: "passed" | "failed";
    evidenceKey?: string;
    runId?: string;
    artifactPath?: string;
    notes?: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): SubagentMaturityEvidence;
}

export interface RecordSubagentReleaseGateLiveHistoryEvidenceInput {
  entry: Partial<SubagentReleaseGateLiveHistoryEntry>;
  evidenceKey?: string;
  artifactPath?: string;
  notes?: string;
  createdAt?: string;
}

export interface SubagentLiveHistoryEvidenceRecord {
  schemaVersion: typeof SUBAGENT_LIVE_HISTORY_EVIDENCE_SCHEMA_VERSION;
  createdAt: string;
  status: "passed" | "failed";
  cleanRequiredLiveRun: boolean;
  skippedLiveEvidence: string[];
  issues: string[];
  liveDogfoodRunEvidence: SubagentMaturityEvidence;
}

export function recordSubagentReleaseGateLiveHistoryEvidence(
  store: SubagentLiveHistoryEvidenceStore,
  input: RecordSubagentReleaseGateLiveHistoryEvidenceInput,
): SubagentLiveHistoryEvidenceRecord {
  const entry = normalizeReleaseGateLiveHistoryEntry(input.entry);
  const createdAt = input.createdAt ?? entry.completedAt ?? new Date().toISOString();
  const skippedLiveEvidence = skippedLiveEvidenceLabels(entry);
  const issues = releaseGateLiveHistoryEvidenceIssues(entry, skippedLiveEvidence);
  const status = issues.length === 0 ? "passed" : "failed";
  const artifactPath = optionalString(input.artifactPath) ?? optionalString(entry.reportPath);
  const evidenceKey = optionalString(input.evidenceKey) ?? `live-history:${entry.runId ?? createdAt}`;
  const notes = optionalString(input.notes) ?? (
    status === "passed"
      ? "Required-live sub-agent release-gate history row was clean across all live evidence lanes."
      : `Required-live sub-agent release-gate history row is not clean: ${formatIssueList(issues)}.`
  );
  const liveDogfoodRunEvidence = store.recordSubagentMaturityEvidence({
    kind: "live_dogfood_run",
    status,
    evidenceKey,
    runId: optionalString(entry.runId),
    artifactPath,
    notes,
    details: {
      schemaVersion: SUBAGENT_LIVE_HISTORY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "live_dogfood_run",
      releaseGateHistoryEntry: entry,
      skippedLiveEvidence,
      issues,
    },
    createdAt,
  });
  return {
    schemaVersion: SUBAGENT_LIVE_HISTORY_EVIDENCE_SCHEMA_VERSION,
    createdAt,
    status,
    cleanRequiredLiveRun: status === "passed",
    skippedLiveEvidence,
    issues,
    liveDogfoodRunEvidence,
  };
}

export function normalizeReleaseGateLiveHistoryEntry(
  entry: Partial<SubagentReleaseGateLiveHistoryEntry>,
): SubagentReleaseGateLiveHistoryEntry {
  const liveEvidence: Record<string, "present" | "skipped"> | undefined = typeof entry.liveEvidence === "object" && entry.liveEvidence && !Array.isArray(entry.liveEvidence)
    ? Object.fromEntries(Object.entries(entry.liveEvidence).flatMap(([key, value]): Array<[string, "present" | "skipped"]> =>
      optionalString(key) ? [[key.trim(), value === "present" ? "present" : "skipped"]] : []
    ))
    : undefined;
  return {
    ...(optionalString(entry.schemaVersion) ? { schemaVersion: optionalString(entry.schemaVersion) } : {}),
    ...(optionalString(entry.runId) ? { runId: optionalString(entry.runId) } : {}),
    ...(optionalString(entry.reportPath) ? { reportPath: optionalString(entry.reportPath) } : {}),
    ...(optionalString(entry.status) ? { status: optionalString(entry.status) } : {}),
    ...(typeof entry.ready === "boolean" ? { ready: entry.ready } : {}),
    ...(typeof entry.liveRequired === "boolean" ? { liveRequired: entry.liveRequired } : {}),
    ...(optionalString(entry.startedAt) ? { startedAt: optionalString(entry.startedAt) } : {}),
    ...(optionalString(entry.completedAt) ? { completedAt: optionalString(entry.completedAt) } : {}),
    ...(finiteNumber(entry.durationMs) !== undefined ? { durationMs: finiteNumber(entry.durationMs) } : {}),
    ...(entry.checkCounts ? { checkCounts: numericRecord(entry.checkCounts) } : {}),
    ...(liveEvidence ? { liveEvidence } : {}),
    ...(stringArray(entry.skippedLiveEvidence).length ? { skippedLiveEvidence: stringArray(entry.skippedLiveEvidence) } : {}),
    ...(finiteNumber(entry.blockingIssueCount) !== undefined ? { blockingIssueCount: finiteNumber(entry.blockingIssueCount) } : {}),
    ...(finiteNumber(entry.advisoryIssueCount) !== undefined ? { advisoryIssueCount: finiteNumber(entry.advisoryIssueCount) } : {}),
    ...(optionalString(entry.nextSlice) ? { nextSlice: optionalString(entry.nextSlice) } : {}),
  };
}

function releaseGateLiveHistoryEvidenceIssues(
  entry: SubagentReleaseGateLiveHistoryEntry,
  skippedLiveEvidence: string[],
): string[] {
  const issues: string[] = [];
  if (entry.schemaVersion !== "ambient-subagent-release-gate-live-history-v1") {
    issues.push(`Release-gate live history schemaVersion is ${entry.schemaVersion ?? "missing"}.`);
  }
  if (entry.liveRequired !== true) issues.push("Release-gate live history row is not marked liveRequired.");
  if (entry.ready !== true) issues.push("Release-gate live history row is not ready.");
  if (entry.status !== "passed") issues.push(`Release-gate live history status is ${entry.status ?? "missing"}; expected passed.`);
  if (safeCount(entry.blockingIssueCount) !== 0) {
    issues.push(`Release-gate live history has ${safeCount(entry.blockingIssueCount)} blocking issue(s).`);
  }
  if (safeCount(entry.advisoryIssueCount) !== 0) {
    issues.push(`Release-gate live history has ${safeCount(entry.advisoryIssueCount)} advisory issue(s).`);
  }
  if (skippedLiveEvidence.length) {
    issues.push(`Release-gate live history skipped live evidence lanes: ${skippedLiveEvidence.join(", ")}.`);
  }
  if (!optionalString(entry.runId)) issues.push("Release-gate live history row is missing runId.");
  if (!optionalString(entry.completedAt)) issues.push("Release-gate live history row is missing completedAt.");
  return issues;
}

function skippedLiveEvidenceLabels(entry: SubagentReleaseGateLiveHistoryEntry): string[] {
  const explicitSkipped = new Set(stringArray(entry.skippedLiveEvidence));
  return SUBAGENT_LIVE_EVIDENCE_LABELS.filter((label) => {
    if (explicitSkipped.has(label)) return true;
    return entry.liveEvidence?.[label] !== "present";
  });
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function stringArray(value: readonly string[] | undefined): string[] {
  return Array.isArray(value) ? value.flatMap((item) => optionalString(item) ? [item.trim()] : []) : [];
}

function finiteNumber(value: unknown): number | undefined {
  return Number.isFinite(value) ? Number(value) : undefined;
}

function safeCount(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function numericRecord(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, count]) => {
    const normalizedKey = optionalString(key);
    const normalizedCount = finiteNumber(count);
    return normalizedKey && normalizedCount !== undefined ? [[normalizedKey, normalizedCount]] : [];
  }));
}

function formatIssueList(issues: string[]): string {
  const inlineIssues = issues.map((issue) => issue.replace(/[.;]+$/u, ""));
  if (issues.length === 0) return "no issues";
  if (issues.length === 1) return inlineIssues[0] ?? "unknown issue";
  return `${inlineIssues.slice(0, -1).join("; ")}; and ${inlineIssues[inlineIssues.length - 1]}`;
}
