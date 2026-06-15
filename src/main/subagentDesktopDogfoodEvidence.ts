import type {
  SubagentAssertionHistorySummary,
  SubagentDesktopDogfoodHistoryEntry,
  SubagentMaturityEvidence,
} from "../shared/subagentMaturity";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG } from "../shared/featureFlags";
import desktopDogfoodEvidenceContract from "../shared/subagentDesktopDogfoodEvidenceContract.json";

export const SUBAGENT_DESKTOP_DOGFOOD_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-desktop-dogfood-evidence-v1" as const;

const REQUIRED_DESKTOP_DOGFOOD_SCENARIOS = desktopDogfoodEvidenceContract.requiredDesktopDogfoodScenarios;
const REQUIRED_DESKTOP_VISUAL_ASSERTIONS = desktopDogfoodEvidenceContract.requiredDesktopVisualAssertions;
const REQUIRED_DESKTOP_MATURITY_ASSERTIONS =
  desktopDogfoodEvidenceContract.requiredDesktopMaturityAssertions.map((assertion) => assertion.id);

export interface SubagentDesktopDogfoodEvidenceStore {
  recordSubagentMaturityEvidence(input: {
    kind: "desktop_dogfood_run";
    status: "passed" | "failed";
    evidenceKey?: string;
    runId?: string;
    parentRunId?: string;
    artifactPath?: string;
    notes?: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): SubagentMaturityEvidence;
}

export interface SubagentDesktopDogfoodArtifact {
  schemaVersion?: string;
  status?: string;
  classification?: string;
  generatedAt?: string;
  provider?: string;
  featureFlag?: string;
  scenarios?: string[];
  artifacts?: Record<string, string>;
  checks?: Record<string, unknown>;
  visualAssertions?: Record<string, SubagentDesktopDogfoodAssertionEvidence>;
  maturityAssertions?: Record<string, SubagentDesktopDogfoodAssertionEvidence>;
  workflowHighLoadPatternLabels?: string[];
  parentThreadId?: string;
  parentRunId?: string;
  childRunIds?: string[];
  childThreadIds?: string[];
  error?: string;
}

export interface SubagentDesktopDogfoodAssertionEvidence {
  id?: string;
  status?: string;
  evidence?: string[];
  artifactRefs?: string[];
  capabilities?: string[];
}

export interface RecordSubagentDesktopDogfoodEvidenceInput {
  artifact: SubagentDesktopDogfoodArtifact;
  artifactPath?: string;
  evidenceKey?: string;
  runId?: string;
  parentRunId?: string;
  notes?: string;
  createdAt?: string;
}

export interface SubagentDesktopDogfoodEvidenceRecord {
  schemaVersion: typeof SUBAGENT_DESKTOP_DOGFOOD_EVIDENCE_SCHEMA_VERSION;
  createdAt: string;
  status: "passed" | "failed";
  ready: boolean;
  issues: string[];
  historyEntry: SubagentDesktopDogfoodHistoryEntry;
  desktopDogfoodRunEvidence: SubagentMaturityEvidence;
}

export function recordSubagentDesktopDogfoodEvidence(
  store: SubagentDesktopDogfoodEvidenceStore,
  input: RecordSubagentDesktopDogfoodEvidenceInput,
): SubagentDesktopDogfoodEvidenceRecord {
  const artifact = input.artifact;
  const createdAt = input.createdAt ?? artifact.generatedAt ?? new Date().toISOString();
  const artifactPath = optionalString(input.artifactPath);
  const historyEntry = buildSubagentDesktopDogfoodHistoryEntry(artifact, {
    artifactPath,
    runId: input.runId,
    generatedAt: createdAt,
  });
  const issues = desktopDogfoodEvidenceIssues(artifact, historyEntry);
  const status = issues.length === 0 ? "passed" : "failed";
  const notes = optionalString(input.notes) ?? (
    status === "passed"
      ? "Full Ambient Desktop dogfood passed with required scenarios, screenshots, visual assertions, maturity assertions, layout checks, and six-pattern workflow high-load proof."
      : `Full Ambient Desktop dogfood did not pass maturity evidence: ${formatIssueList(issues)}.`
  );
  const evidenceKey = optionalString(input.evidenceKey) ?? `desktop-dogfood:${historyEntry.runId ?? createdAt}`;
  const desktopDogfoodRunEvidence = store.recordSubagentMaturityEvidence({
    kind: "desktop_dogfood_run",
    status,
    evidenceKey,
    runId: optionalString(input.runId) ?? historyEntry.runId,
    parentRunId: optionalString(input.parentRunId) ?? optionalString(artifact.parentRunId),
    artifactPath,
    notes,
    details: {
      schemaVersion: SUBAGENT_DESKTOP_DOGFOOD_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "desktop_dogfood_run",
      desktopDogfoodArtifact: artifact,
      desktopDogfoodHistoryEntry: historyEntry,
      issues,
    },
    createdAt,
  });
  return {
    schemaVersion: SUBAGENT_DESKTOP_DOGFOOD_EVIDENCE_SCHEMA_VERSION,
    createdAt,
    status,
    ready: status === "passed",
    issues,
    historyEntry,
    desktopDogfoodRunEvidence,
  };
}

export function buildSubagentDesktopDogfoodHistoryEntry(
  artifact: SubagentDesktopDogfoodArtifact,
  input: { artifactPath?: string; runId?: string; generatedAt?: string } = {},
): SubagentDesktopDogfoodHistoryEntry {
  const scenarios = stringArray(artifact.scenarios);
  const visualAssertionSummary = summarizeDesktopDogfoodAssertions(artifact.visualAssertions, REQUIRED_DESKTOP_VISUAL_ASSERTIONS);
  const maturityAssertionSummary = summarizeDesktopDogfoodAssertions(artifact.maturityAssertions, REQUIRED_DESKTOP_MATURITY_ASSERTIONS);
  const checkSummary = summarizeDesktopDogfoodChecks(artifact.checks);
  const requiredScenarioMissing = REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.filter((scenario) => !scenarios.includes(scenario));
  const issues = desktopDogfoodEvidenceIssues(artifact, {
    status: artifact.status,
    classification: artifact.classification,
    provider: artifact.provider,
    featureFlag: artifact.featureFlag,
    scenarios,
    requiredScenarioMissing,
    visualAssertionSummary,
    maturityAssertionSummary,
    screenshotCount: screenshotArtifactCount(artifact.artifacts),
    criticalOverlapCount: checkSummary.criticalOverlapCount,
    horizontalOverflowFree: checkSummary.horizontalOverflowFree,
    workflowHighLoadPatternCount: stringArray(artifact.workflowHighLoadPatternLabels).length,
  });
  const ready = issues.length === 0;
  return {
    schemaVersion: "ambient-subagent-desktop-dogfood-history-v1",
    ...(optionalString(input.runId) ? { runId: optionalString(input.runId) } : {}),
    ...(optionalString(input.artifactPath) ? { reportPath: optionalString(input.artifactPath) } : {}),
    ...(optionalString(artifact.status) ? { status: optionalString(artifact.status) } : {}),
    ...(optionalString(artifact.classification) ? { classification: optionalString(artifact.classification) } : {}),
    ready,
    generatedAt: input.generatedAt ?? artifact.generatedAt,
    ...(optionalString(artifact.provider) ? { provider: optionalString(artifact.provider) } : {}),
    ...(optionalString(artifact.featureFlag) ? { featureFlag: optionalString(artifact.featureFlag) } : {}),
    scenarioCount: scenarios.length,
    scenarios,
    requiredScenarioMissing,
    visualAssertionSummary,
    maturityAssertionSummary,
    screenshotCount: screenshotArtifactCount(artifact.artifacts),
    criticalOverlapCount: checkSummary.criticalOverlapCount,
    horizontalOverflowFree: checkSummary.horizontalOverflowFree,
    workflowHighLoadPatternCount: stringArray(artifact.workflowHighLoadPatternLabels).length,
    blockingIssueCount: issues.length,
    advisoryIssueCount: 0,
    issues,
  };
}

function desktopDogfoodEvidenceIssues(
  artifact: SubagentDesktopDogfoodArtifact,
  historyEntry: Partial<SubagentDesktopDogfoodHistoryEntry>,
): string[] {
  const issues: string[] = [];
  if (artifact.schemaVersion !== "ambient-subagent-desktop-dogfood-v1") {
    issues.push(`Desktop dogfood artifact schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") issues.push(`Desktop dogfood artifact status is ${artifact.status ?? "missing"}; expected passed.`);
  if (artifact.classification !== "passed") {
    issues.push(`Desktop dogfood artifact classification is ${artifact.classification ?? "missing"}; expected passed.`);
  }
  if (!optionalString(artifact.provider)) issues.push("Desktop dogfood artifact is missing provider.");
  if (artifact.featureFlag !== AMBIENT_SUBAGENTS_FEATURE_FLAG) {
    issues.push(`Desktop dogfood artifact featureFlag is ${artifact.featureFlag ?? "missing"}; expected ${AMBIENT_SUBAGENTS_FEATURE_FLAG}.`);
  }
  if (historyEntry.requiredScenarioMissing?.length) {
    issues.push(`Desktop dogfood artifact is missing required scenarios: ${historyEntry.requiredScenarioMissing.join(", ")}.`);
  }
  if (!assertionSummaryComplete(historyEntry.visualAssertionSummary)) {
    issues.push("Desktop dogfood artifact has missing or failed visual assertions.");
  }
  if (!assertionSummaryComplete(historyEntry.maturityAssertionSummary)) {
    issues.push("Desktop dogfood artifact has missing or failed maturity assertions.");
  }
  if (safeCount(historyEntry.screenshotCount) < 1) issues.push("Desktop dogfood artifact is missing screenshot evidence.");
  if (historyEntry.horizontalOverflowFree !== true) issues.push("Desktop dogfood artifact reports horizontal overflow or lacks layout checks.");
  if (safeCount(historyEntry.criticalOverlapCount) !== 0) {
    issues.push(`Desktop dogfood artifact reports ${safeCount(historyEntry.criticalOverlapCount)} critical layout overlaps.`);
  }
  if (safeCount(historyEntry.workflowHighLoadPatternCount) < 6) {
    issues.push(`Desktop dogfood artifact has ${safeCount(historyEntry.workflowHighLoadPatternCount)} workflow high-load pattern labels; expected at least 6.`);
  }
  if (optionalString(artifact.error)) issues.push("Desktop dogfood artifact includes an error.");
  return issues;
}

function summarizeDesktopDogfoodAssertions(
  assertions: Record<string, SubagentDesktopDogfoodAssertionEvidence> | undefined,
  requiredIds: readonly string[],
): SubagentAssertionHistorySummary {
  let passedCount = 0;
  let failedCount = 0;
  let missingCount = 0;
  for (const id of requiredIds) {
    const assertion = assertions?.[id];
    if (!assertion || assertion.id !== id) {
      missingCount += 1;
    } else if (assertion.status !== "passed" || stringArray(assertion.evidence).length === 0) {
      failedCount += 1;
    } else {
      passedCount += 1;
    }
  }
  return {
    requiredCount: requiredIds.length,
    passedCount,
    failedCount,
    missingCount,
  };
}

function summarizeDesktopDogfoodChecks(checks: Record<string, unknown> | undefined): {
  criticalOverlapCount: number;
  horizontalOverflowFree: boolean;
  horizontalOverflowCheckCount: number;
} {
  const summary = {
    criticalOverlapCount: 0,
    horizontalOverflowFree: true,
    horizontalOverflowCheckCount: 0,
  };
  visitRecord(checks, (key, value) => {
    if (key === "criticalOverlapCount" && Number.isFinite(value)) {
      summary.criticalOverlapCount += Math.max(0, Math.floor(Number(value)));
    }
    if (key === "horizontalOverflowFree" && typeof value === "boolean") {
      summary.horizontalOverflowCheckCount += 1;
      if (!value) summary.horizontalOverflowFree = false;
    }
  });
  if (summary.horizontalOverflowCheckCount === 0) summary.horizontalOverflowFree = false;
  return summary;
}

function visitRecord(value: unknown, callback: (key: string, value: unknown) => void): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visitRecord(item, callback);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    callback(key, child);
    visitRecord(child, callback);
  }
}

function screenshotArtifactCount(artifacts: Record<string, string> | undefined): number {
  if (!artifacts) return 0;
  return Object.values(artifacts).filter((value) => /\.(png|jpg|jpeg|webp)$/i.test(value)).length;
}

function assertionSummaryComplete(summary: SubagentAssertionHistorySummary | undefined): boolean {
  return summary?.passedCount === summary?.requiredCount && summary?.failedCount === 0 && summary?.missingCount === 0;
}

function stringArray(value: readonly string[] | undefined): string[] {
  return Array.isArray(value) ? value.flatMap((item) => optionalString(item) ? [item.trim()] : []) : [];
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function safeCount(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function formatIssueList(issues: string[]): string {
  if (issues.length === 0) return "no issues";
  if (issues.length === 1) return issues[0] ?? "unknown issue";
  return `${issues.slice(0, -1).join("; ")}; and ${issues[issues.length - 1]}`;
}
