import { AMBIENT_SUBAGENTS_FEATURE_FLAG, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { SUBAGENT_LIVE_EVIDENCE_LABELS } from "../../shared/subagentLiveEvidenceLanes";
import {
  DEFAULT_SUBAGENT_MATURITY_CRITERIA,
  SUBAGENT_MATURITY_SCHEMA_VERSION,
  type SubagentDesktopDogfoodHistoryEntry,
  type SubagentDesktopDogfoodHistorySummary,
  type SubagentApprovalRoutingVisibilityEvidence,
  type SubagentCompletionGuardVisibilityEvidence,
  type SubagentEventAttributionIntegrityEvidence,
  type SubagentLifecycleControlIntegrityEvidence,
  type SubagentLiveDogfoodHistorySummary,
  type SubagentMaturityBugEvidence,
  type SubagentMaturityCriteria,
  type SubagentMaturityGate,
  type SubagentMaturityGateId,
  type SubagentMaturitySnapshot,
  type SubagentProductionUiVisibilityEvidence,
  type SubagentRetentionPolicyIntegrityEvidence,
  type SubagentReleaseGateLiveHistoryEntry,
  type SubagentSecurityReviewStatus,
  type SubagentToolScopeIntegrityEvidence,
  type SubagentWorkflowJitterReleaseProfileReport,
  type SubagentWorkflowJitterReleaseProfileSummary,
} from "../../shared/subagentMaturity";
import type { SubagentRestartReconciliationSummary } from "../../shared/subagentTypes";
import type { SubagentObservabilitySummary } from "./subagentObservability";

export const REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_DETERMINISTIC_STRESS_UNITS = 1_000;
export const REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_PROMPT_VARIANTS = 120;
export const REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS = 10;
export const REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_FAMILIES = [
  "model-only",
  "local",
  "browser",
  "connector",
  "document",
  "recovery",
] as const;

export interface SubagentMaturityInput {
  createdAt?: string;
  featureFlags?: AmbientFeatureFlagSnapshot;
  observability?: SubagentObservabilitySummary;
  restartReconciliation?: SubagentRestartReconciliationSummary;
  criteria?: Partial<SubagentMaturityCriteria>;
  liveReleaseGateHistory?: readonly Partial<SubagentReleaseGateLiveHistoryEntry>[];
  desktopDogfoodHistory?: readonly Partial<SubagentDesktopDogfoodHistoryEntry>[];
  workflowJitterReleaseProfile?: Partial<SubagentWorkflowJitterReleaseProfileReport>;
  liveDogfoodRunCount?: number;
  liveDogfoodFailureRate?: number;
  liveDogfoodTotalRunCount?: number;
  desktopDogfoodRunCount?: number;
  desktopDogfoodFailureRate?: number;
  desktopDogfoodTotalRunCount?: number;
  livePiSmokePassed?: boolean;
  restartRecoveryValidated?: boolean;
  completionGuardVisibilityValidated?: boolean;
  completionGuardVisibility?: Partial<SubagentCompletionGuardVisibilityEvidence>;
  approvalRoutingVisibilityValidated?: boolean;
  approvalRoutingVisibility?: Partial<SubagentApprovalRoutingVisibilityEvidence>;
  productionUiVisibilityValidated?: boolean;
  productionUiVisibility?: Partial<SubagentProductionUiVisibilityEvidence>;
  eventAttributionIntegrityValidated?: boolean;
  eventAttributionIntegrity?: Partial<SubagentEventAttributionIntegrityEvidence>;
  lifecycleControlIntegrityValidated?: boolean;
  lifecycleControlIntegrity?: Partial<SubagentLifecycleControlIntegrityEvidence>;
  retentionPolicyIntegrityValidated?: boolean;
  retentionPolicyIntegrity?: Partial<SubagentRetentionPolicyIntegrityEvidence>;
  toolScopeIntegrityValidated?: boolean;
  toolScopeIntegrity?: Partial<SubagentToolScopeIntegrityEvidence>;
  lifecycleBugs?: Partial<SubagentMaturityBugEvidence>;
  permissionBugs?: Partial<SubagentMaturityBugEvidence>;
  securityReview?: {
    status: SubagentSecurityReviewStatus;
    reviewedAt?: string;
    reviewer?: string;
    notes?: string;
  };
}

export function evaluateSubagentMaturity(input: SubagentMaturityInput = {}): SubagentMaturitySnapshot {
  const criteria = normalizeCriteria(input.criteria);
  const liveHistory = summarizeSubagentReleaseGateLiveHistory(input.liveReleaseGateHistory);
  const desktopDogfoodHistory = summarizeSubagentDesktopDogfoodHistory(input.desktopDogfoodHistory);
  const workflowJitterReleaseProfile = summarizeSubagentWorkflowJitterReleaseProfile(input.workflowJitterReleaseProfile);
  const liveDogfoodRunCount = input.liveDogfoodRunCount ?? liveHistory.cleanRequiredRunCount;
  const liveDogfoodFailureRate = input.liveDogfoodFailureRate ?? liveHistory.failureRate;
  const liveDogfoodTotalRunCount = input.liveDogfoodTotalRunCount ?? liveHistory.requiredRunCount;
  const desktopDogfoodRunCount = input.desktopDogfoodRunCount ?? desktopDogfoodHistory.readyRunCount;
  const desktopDogfoodFailureRate = input.desktopDogfoodFailureRate ?? desktopDogfoodHistory.failureRate;
  const desktopDogfoodTotalRunCount = input.desktopDogfoodTotalRunCount ?? desktopDogfoodHistory.totalRunCount;
  const livePiSmokePassed = input.livePiSmokePassed ?? liveHistory.livePiSmokePassed;
  const failedSpawnRate = spawnFailureRate(input.observability);
  const lifecycleBugs = normalizeBugEvidence(input.lifecycleBugs);
  const permissionBugs = normalizeBugEvidence(input.permissionBugs);
  const gates: SubagentMaturityGate[] = [
    featureFlagGate(input.featureFlags),
    dogfoodGate(liveDogfoodRunCount, criteria, liveHistory),
    liveDogfoodFailureRateGate(liveDogfoodFailureRate, liveDogfoodTotalRunCount, criteria, liveHistory),
    desktopDogfoodGate(desktopDogfoodRunCount, criteria, desktopDogfoodHistory),
    desktopDogfoodFailureRateGate(desktopDogfoodFailureRate, desktopDogfoodTotalRunCount, criteria, desktopDogfoodHistory),
    workflowJitterReleaseProfileGate(workflowJitterReleaseProfile),
    liveSmokeGate(livePiSmokePassed),
    failureRateGate(failedSpawnRate, input.observability, criteria),
    restartRecoveryGate(input.restartRecoveryValidated, input.restartReconciliation),
    completionGuardVisibilityGate(input.completionGuardVisibilityValidated, input.completionGuardVisibility),
    approvalRoutingVisibilityGate(input.approvalRoutingVisibilityValidated, input.approvalRoutingVisibility),
    productionUiVisibilityGate(input.productionUiVisibilityValidated, input.productionUiVisibility),
    eventAttributionIntegrityGate(input.eventAttributionIntegrityValidated, input.eventAttributionIntegrity),
    lifecycleControlIntegrityGate(input.lifecycleControlIntegrityValidated, input.lifecycleControlIntegrity),
    retentionPolicyIntegrityGate(input.retentionPolicyIntegrityValidated, input.retentionPolicyIntegrity),
    toolScopeIntegrityGate(input.toolScopeIntegrityValidated, input.toolScopeIntegrity),
    bugGate("unresolved_lifecycle_bugs", "Lifecycle P0/P1 bugs", lifecycleBugs),
    bugGate("unresolved_permission_bugs", "Permission P0/P1 bugs", permissionBugs),
    securityReviewGate(input.securityReview),
  ];
  const blockedGateIds = gates.filter((gate) => gate.status === "blocked").map((gate) => gate.id);
  const warningGateIds = gates.filter((gate) => gate.status === "warning").map((gate) => gate.id);
  const defaultCanBeEnabled = blockedGateIds.length === 0;
  return {
    schemaVersion: SUBAGENT_MATURITY_SCHEMA_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    status: defaultCanBeEnabled ? "ready_to_graduate" : "blocked",
    defaultCanBeEnabled,
    summary: defaultCanBeEnabled
      ? "Sub-agent maturity gates are satisfied; the feature can be considered for default enablement."
      : `Sub-agent default enablement is blocked by ${blockedGateIds.length} maturity ${blockedGateIds.length === 1 ? "gate" : "gates"}.`,
    criteria,
    liveHistory,
    desktopDogfoodHistory,
    workflowJitterReleaseProfile,
    blockedGateIds,
    warningGateIds,
    gates,
  };
}

export function summarizeSubagentDesktopDogfoodHistory(
  entries: readonly Partial<SubagentDesktopDogfoodHistoryEntry>[] | undefined,
): SubagentDesktopDogfoodHistorySummary {
  const history = Array.isArray(entries) ? entries : [];
  const summary: SubagentDesktopDogfoodHistorySummary = {
    totalRunCount: history.length,
    readyRunCount: 0,
    failedRunCount: 0,
    advisoryRunCount: 0,
    visualFailureRunCount: 0,
    maturityFailureRunCount: 0,
    highLoadReadyRunCount: 0,
    screenshotRunCount: 0,
  };

  for (const entry of history) {
    const ready = isReadyDesktopDogfoodRun(entry);
    if (ready) summary.readyRunCount += 1;
    else if (isFailedDesktopDogfoodRun(entry)) summary.failedRunCount += 1;
    else summary.advisoryRunCount += 1;
    if (!assertionSummaryComplete(entry.visualAssertionSummary)) summary.visualFailureRunCount += 1;
    if (!assertionSummaryComplete(entry.maturityAssertionSummary)) summary.maturityFailureRunCount += 1;
    if (ready && safeCount(entry.workflowHighLoadPatternCount) >= 6) summary.highLoadReadyRunCount += 1;
    if (safeCount(entry.screenshotCount) > 0) summary.screenshotRunCount += 1;
    if (isLaterTimestamp(entry.generatedAt, summary.latestGeneratedAt)) {
      summary.latestGeneratedAt = entry.generatedAt;
    }
  }

  if (summary.totalRunCount > 0) {
    summary.failureRate = summary.failedRunCount / summary.totalRunCount;
  }
  return summary;
}

export function summarizeSubagentReleaseGateLiveHistory(
  entries: readonly Partial<SubagentReleaseGateLiveHistoryEntry>[] | undefined,
): SubagentLiveDogfoodHistorySummary {
  const history = Array.isArray(entries) ? entries : [];
  const summary: SubagentLiveDogfoodHistorySummary = {
    totalRunCount: history.length,
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
    })),
  };

  for (const entry of history) {
    if (entry.liveRequired !== true) continue;
    summary.requiredRunCount += 1;
    const skippedEvidenceCount = skippedLiveEvidenceCount(entry);
    const evidenceStatuses = liveEvidenceStatuses(entry);
    for (const lane of summary.evidenceLanes ?? []) {
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

export function summarizeSubagentWorkflowJitterReleaseProfile(
  report: Partial<SubagentWorkflowJitterReleaseProfileReport> | undefined,
): SubagentWorkflowJitterReleaseProfileSummary {
  const decision = report?.releaseDecision ?? {};
  const matrix = report?.matrix ?? {};
  const liveFamilies = safeStringArray(matrix.liveFamilies).sort();
  const missingLiveFamilies = REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_FAMILIES
    .filter((family) => !liveFamilies.includes(family));
  const blockingIssueCount = safeCount(decision.blockingIssues?.length);
  const advisoryIssueCount = safeCount(decision.advisoryIssues?.length);
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const matrixReleaseProfileCheckPassed = checks.some((check) =>
    check?.id === "matrix.release-profile" && check.status === "pass"
  );
  const deterministicStressUnitCount = safeCount(matrix.deterministicStressUnitCount);
  const livePromptVariantCount = safeCount(matrix.livePromptVariantCount);
  const liveDogfoodRunCount = safeCount(matrix.liveDogfoodRunCount);
  const productOrTestFailureCount = safeCount(matrix.productOrTestFailureCount);
  const providerDegradedCount = safeCount(matrix.providerDegradedCount);
  const environmentSkippedCount = safeCount(matrix.environmentSkippedCount);
  const promotionCandidateCount = safeCount(matrix.promotionCandidateCount);
  const releaseProfile = decision.releaseProfile === true;
  const liveRequired = decision.liveRequired === true;
  const liveSkipped = decision.liveSkipped === true;
  const ready = report?.schemaVersion === 1 &&
    report.status === "passed" &&
    decision.ready === true &&
    releaseProfile &&
    liveRequired &&
    !liveSkipped &&
    matrix.profile === "release" &&
    deterministicStressUnitCount >= REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_DETERMINISTIC_STRESS_UNITS &&
    livePromptVariantCount >= REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_PROMPT_VARIANTS &&
    liveDogfoodRunCount >= REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS &&
    missingLiveFamilies.length === 0 &&
    productOrTestFailureCount === 0 &&
    providerDegradedCount === 0 &&
    environmentSkippedCount === 0 &&
    promotionCandidateCount === 0 &&
    blockingIssueCount === 0 &&
    matrixReleaseProfileCheckPassed;
  return {
    ready,
    ...(report?.status ? { status: report.status } : {}),
    ...(report?.schemaVersion !== undefined ? { schemaVersion: report.schemaVersion } : {}),
    releaseProfile,
    liveRequired,
    liveSkipped,
    ...(matrix.profile ? { matrixProfile: matrix.profile } : {}),
    deterministicStressUnitCount,
    livePromptVariantCount,
    liveDogfoodRunCount,
    liveFamilies,
    missingLiveFamilies,
    productOrTestFailureCount,
    providerDegradedCount,
    environmentSkippedCount,
    promotionCandidateCount,
    blockingIssueCount,
    advisoryIssueCount,
    matrixReleaseProfileCheckPassed,
    ...(report?.generatedAt ? { latestGeneratedAt: report.generatedAt } : {}),
    ...(report?.reportPath ? { reportPath: report.reportPath } : {}),
    ...(report?.matrixReportPath ? { matrixReportPath: report.matrixReportPath } : {}),
  };
}

function desktopDogfoodGate(
  runCount: number | undefined,
  criteria: SubagentMaturityCriteria,
  history: SubagentDesktopDogfoodHistorySummary,
): SubagentMaturityGate {
  const actual = safeCount(runCount);
  const detail = history.totalRunCount > 0
    ? `Desktop history: ${history.readyRunCount} ready, ${history.failedRunCount} failed, ${history.advisoryRunCount} advisory, ${history.visualFailureRunCount} visual-failure, ${history.maturityFailureRunCount} maturity-failure, ${history.highLoadReadyRunCount} high-load ready.`
    : undefined;
  return {
    id: "desktop_dogfood_count",
    status: actual >= criteria.minDesktopDogfoodRuns ? "passed" : "blocked",
    label: "Desktop dogfood volume",
    required: `${criteria.minDesktopDogfoodRuns} ready full-app Desktop dogfood runs.`,
    actual: `${actual} ready recorded.`,
    ...(detail ? { detail } : {}),
  };
}

function desktopDogfoodFailureRateGate(
  rate: number | undefined,
  totalRunCount: number | undefined,
  criteria: SubagentMaturityCriteria,
  history: SubagentDesktopDogfoodHistorySummary,
): SubagentMaturityGate {
  const total = safeCount(totalRunCount);
  if (rate === undefined || total === 0) {
    return {
      id: "desktop_dogfood_failure_rate",
      status: "blocked",
      label: "Desktop dogfood failure rate",
      required: `Full-app Desktop dogfood failures at or below ${formatPercent(criteria.maxDesktopDogfoodFailureRate)}.`,
      actual: "No Desktop dogfood history supplied.",
    };
  }
  const failedCount = history.totalRunCount > 0
    ? history.failedRunCount
    : Math.round(rate * total);
  return {
    id: "desktop_dogfood_failure_rate",
    status: rate <= criteria.maxDesktopDogfoodFailureRate ? "passed" : "blocked",
    label: "Desktop dogfood failure rate",
    required: `Full-app Desktop dogfood failures at or below ${formatPercent(criteria.maxDesktopDogfoodFailureRate)}.`,
    actual: `${failedCount}/${total} failed (${formatPercent(rate)}).`,
    ...(history.latestGeneratedAt ? { detail: `Latest Desktop dogfood history row generated at ${history.latestGeneratedAt}.` } : {}),
  };
}

function workflowJitterReleaseProfileGate(
  summary: SubagentWorkflowJitterReleaseProfileSummary,
): SubagentMaturityGate {
  const missingFamilies = summary.missingLiveFamilies.length ? summary.missingLiveFamilies.join(", ") : "none";
  if (summary.ready) {
    return {
      id: "workflow_jitter_release_profile",
      status: "passed",
      label: "Workflow jitter release profile",
      required: "Release-profile workflow jitter evidence passes with deterministic stress, live prompt variants, live UI dogfood runs, required live families, and no promotion debt.",
      actual: `${summary.liveDogfoodRunCount} live UI dogfood runs, ${summary.livePromptVariantCount} live prompt variants, ${summary.deterministicStressUnitCount} deterministic stress units.`,
      detail: `Live families: ${summary.liveFamilies.join(", ")}. Report: ${summary.reportPath ?? "not recorded"}.`,
    };
  }
  const missing = !summary.status;
  return {
    id: "workflow_jitter_release_profile",
    status: "blocked",
    label: "Workflow jitter release profile",
    required: "Release-profile workflow jitter evidence passes with deterministic stress, live prompt variants, live UI dogfood runs, required live families, and no promotion debt.",
    actual: missing
      ? "Missing workflow jitter release-profile evidence."
      : `Not ready: status ${summary.status ?? "missing"}, profile ${summary.matrixProfile ?? "missing"}, live runs ${summary.liveDogfoodRunCount}/${REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS}, prompt variants ${summary.livePromptVariantCount}/${REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_PROMPT_VARIANTS}, deterministic stress ${summary.deterministicStressUnitCount}/${REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_DETERMINISTIC_STRESS_UNITS}.`,
    detail: missing
      ? "Run test:workflow-jitter-release-gate:release-profile and record the report before graduation."
      : `Release profile ${summary.releaseProfile ? "yes" : "no"}; live required ${summary.liveRequired ? "yes" : "no"}; live skipped ${summary.liveSkipped ? "yes" : "no"}; missing families ${missingFamilies}; blocking issues ${summary.blockingIssueCount}; product/test failures ${summary.productOrTestFailureCount}; provider degraded ${summary.providerDegradedCount}; environment skipped ${summary.environmentSkippedCount}; promotion candidates ${summary.promotionCandidateCount}; matrix.release-profile ${summary.matrixReleaseProfileCheckPassed ? "pass" : "missing or failed"}.`,
  };
}

function featureFlagGate(featureFlags: AmbientFeatureFlagSnapshot | undefined): SubagentMaturityGate {
  const flag = featureFlags?.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG];
  if (!flag) {
    return {
      id: "feature_flag_guarded",
      status: "warning",
      label: "Feature flag guard",
      required: `${AMBIENT_SUBAGENTS_FEATURE_FLAG} defaults off until maturity.`,
      actual: "No feature flag snapshot supplied.",
    };
  }
  if (flag.defaultEnabled) {
    return {
      id: "feature_flag_guarded",
      status: "blocked",
      label: "Feature flag guard",
      required: `${AMBIENT_SUBAGENTS_FEATURE_FLAG} default remains off before graduation.`,
      actual: "Default is enabled.",
      detail: `Resolved source: ${flag.source}.`,
    };
  }
  return {
    id: "feature_flag_guarded",
    status: "passed",
    label: "Feature flag guard",
    required: `${AMBIENT_SUBAGENTS_FEATURE_FLAG} default remains off before graduation.`,
    actual: `Default off; effective ${flag.enabled ? "enabled" : "disabled"} via ${flag.source}.`,
  };
}

function dogfoodGate(
  runCount: number | undefined,
  criteria: SubagentMaturityCriteria,
  history: SubagentLiveDogfoodHistorySummary,
): SubagentMaturityGate {
  const actual = safeCount(runCount);
  const detail = history.requiredRunCount > 0
    ? `Required-live history: ${history.cleanRequiredRunCount} clean, ${history.failedRequiredRunCount} failed, ${history.advisoryRequiredRunCount} advisory, ${history.skippedEvidenceRunCount} skipped-evidence.`
    : undefined;
  return {
    id: "live_dogfood_count",
    status: actual >= criteria.minLiveDogfoodRuns ? "passed" : "blocked",
    label: "Live dogfood volume",
    required: `${criteria.minLiveDogfoodRuns} clean required-live dogfood runs.`,
    actual: `${actual} clean recorded.`,
    ...(detail ? { detail } : {}),
  };
}

function liveDogfoodFailureRateGate(
  rate: number | undefined,
  totalRunCount: number | undefined,
  criteria: SubagentMaturityCriteria,
  history: SubagentLiveDogfoodHistorySummary,
): SubagentMaturityGate {
  const total = safeCount(totalRunCount);
  if (rate === undefined || total === 0) {
    return {
      id: "live_dogfood_failure_rate",
      status: "blocked",
      label: "Live dogfood failure rate",
      required: `Required-live dogfood run failures at or below ${formatPercent(criteria.maxLiveDogfoodFailureRate)}.`,
      actual: "No required-live release-gate history supplied.",
    };
  }
  const failedCount = history.requiredRunCount > 0
    ? history.failedRequiredRunCount
    : Math.round(rate * total);
  return {
    id: "live_dogfood_failure_rate",
    status: rate <= criteria.maxLiveDogfoodFailureRate ? "passed" : "blocked",
    label: "Live dogfood failure rate",
    required: `Required-live dogfood run failures at or below ${formatPercent(criteria.maxLiveDogfoodFailureRate)}.`,
    actual: `${failedCount}/${total} failed (${formatPercent(rate)}).`,
    ...(history.latestCompletedAt ? { detail: `Latest required-live history row completed at ${history.latestCompletedAt}.` } : {}),
  };
}

function liveSmokeGate(passed: boolean | undefined): SubagentMaturityGate {
  return {
    id: "live_smoke",
    status: passed ? "passed" : "blocked",
    label: "Live Pi smoke",
    required: "At least one live Ambient/Pi child session smoke passes behind the flag.",
    actual: passed ? "Passed." : "Missing or failed.",
  };
}

function failureRateGate(
  rate: number | undefined,
  observability: SubagentObservabilitySummary | undefined,
  criteria: SubagentMaturityCriteria,
): SubagentMaturityGate {
  if (rate === undefined || !observability) {
    return {
      id: "failure_rate",
      status: "blocked",
      label: "Spawn failure rate",
      required: `Failed spawns at or below ${formatPercent(criteria.maxFailedSpawnRate)}.`,
      actual: "No spawn-attempt evidence supplied.",
    };
  }
  return {
    id: "failure_rate",
    status: rate <= criteria.maxFailedSpawnRate ? "passed" : "blocked",
    label: "Spawn failure rate",
    required: `Failed spawns at or below ${formatPercent(criteria.maxFailedSpawnRate)}.`,
    actual: `${observability.failedSpawns}/${observability.spawnAttempts} failed (${formatPercent(rate)}).`,
  };
}

function restartRecoveryGate(
  validated: boolean | undefined,
  reconciliation: SubagentRestartReconciliationSummary | undefined,
): SubagentMaturityGate {
  if (!validated) {
    return {
      id: "restart_recovery",
      status: "blocked",
      label: "Restart recovery",
      required: "Validated restart recovery with no unresolved reconciliation issues.",
      actual: "Restart recovery validation is missing.",
    };
  }
  const issueCount = reconciliation?.issueCount ?? 0;
  return {
    id: "restart_recovery",
    status: issueCount === 0 ? "passed" : "blocked",
    label: "Restart recovery",
    required: "Validated restart recovery with no unresolved reconciliation issues.",
    actual: issueCount === 0 ? "Validated with no unresolved issues." : `${issueCount} reconciliation issues remain.`,
  };
}

function completionGuardVisibilityGate(
  validated: boolean | undefined,
  evidence: Partial<SubagentCompletionGuardVisibilityEvidence> | undefined,
): SubagentMaturityGate {
  const missingSurfaces = missingCompletionGuardVisibilitySurfaces(evidence);
  const passed = validated === true && missingSurfaces.length === 0;
  return {
    id: "completion_guard_visibility",
    status: passed ? "passed" : "blocked",
    label: "Completion guard visibility",
    required: "Completion guard blockers are visible in child details, parent blockers, replay diagnostics, and diagnostic history.",
    actual: passed
      ? "Validated across child inspector, parent blocking indicators, replay diagnostics, and diagnostic history."
      : validated === true
      ? `Validated flag supplied, but ${formatMissingSurfaceList(missingSurfaces)} missing.`
      : "Missing or failed.",
    ...(missingSurfaces.length > 0 ? { detail: `Missing surfaces: ${formatMissingSurfaceList(missingSurfaces)}.` } : {}),
  };
}

function approvalRoutingVisibilityGate(
  validated: boolean | undefined,
  evidence: Partial<SubagentApprovalRoutingVisibilityEvidence> | undefined,
): SubagentMaturityGate {
  const missingSurfaces = missingApprovalRoutingVisibilitySurfaces(evidence);
  const passed = validated === true && missingSurfaces.length === 0;
  return {
    id: "approval_routing_visibility",
    status: passed ? "passed" : "blocked",
    label: "Approval routing visibility",
    required: "Child approvals are child-attributed, scoped, parent-blocking, non-interactive-safe, and visible in UI/replay evidence.",
    actual: passed
      ? "Validated child request attribution, scoped response persistence, parent wait resumption, non-interactive failure handling, and UI/replay visibility."
      : validated === true
      ? `Validated flag supplied, but ${formatMissingSurfaceList(missingSurfaces)} missing.`
      : "Missing or failed.",
    ...(missingSurfaces.length > 0 ? { detail: `Missing surfaces: ${formatMissingSurfaceList(missingSurfaces)}.` } : {}),
  };
}

function productionUiVisibilityGate(
  validated: boolean | undefined,
  evidence: Partial<SubagentProductionUiVisibilityEvidence> | undefined,
): SubagentMaturityGate {
  const missingSurfaces = missingProductionUiVisibilitySurfaces(evidence);
  const passed = validated === true && missingSurfaces.length === 0;
  return {
    id: "production_ui_visibility",
    status: passed ? "passed" : "blocked",
    label: "Production UI visibility",
    required: "Collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls are visible in production surfaces.",
    actual: passed
      ? "Validated collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls."
      : validated === true
      ? `Validated flag supplied, but ${formatMissingSurfaceList(missingSurfaces)} missing.`
      : "Missing or failed.",
    ...(missingSurfaces.length > 0 ? { detail: `Missing surfaces: ${formatMissingSurfaceList(missingSurfaces)}.` } : {}),
  };
}

function eventAttributionIntegrityGate(
  validated: boolean | undefined,
  evidence: Partial<SubagentEventAttributionIntegrityEvidence> | undefined,
): SubagentMaturityGate {
  const missingSurfaces = missingEventAttributionIntegritySurfaces(evidence);
  const passed = validated === true && missingSurfaces.length === 0;
  return {
    id: "event_attribution_integrity",
    status: passed ? "passed" : "blocked",
    label: "Event attribution integrity",
    required: "Approval, error, tool, runtime, and parent mailbox events identify the originating child run and preserve bounded artifact-backed provenance.",
    actual: passed
      ? "Validated runtime preview attribution, parent mailbox attribution, tool/approval/error provenance, replay diagnostics, and large-output artifact backing."
      : validated === true
      ? `Validated flag supplied, but ${formatMissingSurfaceList(missingSurfaces)} missing.`
      : "Missing or failed.",
    ...(missingSurfaces.length > 0 ? { detail: `Missing surfaces: ${formatMissingSurfaceList(missingSurfaces)}.` } : {}),
  };
}

function lifecycleControlIntegrityGate(
  validated: boolean | undefined,
  evidence: Partial<SubagentLifecycleControlIntegrityEvidence> | undefined,
): SubagentMaturityGate {
  const missingSurfaces = missingLifecycleControlIntegritySurfaces(evidence);
  const passed = validated === true && missingSurfaces.length === 0;
  return {
    id: "lifecycle_control_integrity",
    status: passed ? "passed" : "blocked",
    label: "Lifecycle control integrity",
    required: "Parent stop, child cancel, close, lifecycle hooks, and restart interruption repair are deterministic, child-scoped, and history-preserving.",
    actual: passed
      ? "Validated parent-stop cascade, child-cancel isolation, close capacity/history retention, lifecycle hook artifacts, and restart interruption repair."
      : validated === true
      ? `Validated flag supplied, but ${formatMissingSurfaceList(missingSurfaces)} missing.`
      : "Missing or failed.",
    ...(missingSurfaces.length > 0 ? { detail: `Missing surfaces: ${formatMissingSurfaceList(missingSurfaces)}.` } : {}),
  };
}

function retentionPolicyIntegrityGate(
  validated: boolean | undefined,
  evidence: Partial<SubagentRetentionPolicyIntegrityEvidence> | undefined,
): SubagentMaturityGate {
  const missingSurfaces = missingRetentionPolicyIntegritySurfaces(evidence);
  const passed = validated === true && missingSurfaces.length === 0;
  return {
    id: "retention_policy_integrity",
    status: passed ? "passed" : "blocked",
    label: "Retention policy integrity",
    required: "Retention releases capacity without deleting history, collapses only oldest eligible children, protects unsafe children, and keeps summaries/artifacts visible.",
    actual: passed
      ? "Validated close-without-delete, oldest-eligible cap cleanup, protected-child retention, summary/artifact durability, and retained-state UI."
      : validated === true
      ? `Validated flag supplied, but ${formatMissingSurfaceList(missingSurfaces)} missing.`
      : "Missing or failed.",
    ...(missingSurfaces.length > 0 ? { detail: `Missing surfaces: ${formatMissingSurfaceList(missingSurfaces)}.` } : {}),
  };
}

function toolScopeIntegrityGate(
  validated: boolean | undefined,
  evidence: Partial<SubagentToolScopeIntegrityEvidence> | undefined,
): SubagentMaturityGate {
  const missingSurfaces = missingToolScopeIntegritySurfaces(evidence);
  const passed = validated === true && missingSurfaces.length === 0;
  return {
    id: "tool_scope_integrity",
    status: passed ? "passed" : "blocked",
    label: "Tool scope integrity",
    required: "Child tool scopes honor hard-deny precedence, role/task narrowing, exact tool resolution, default fanout blocks, and visible diagnostics.",
    actual: passed
      ? "Validated hard-deny precedence, role/task narrowing, exact tool/extension resolution, child fanout default blocking, and snapshot/inspector diagnostics."
      : validated === true
      ? `Validated flag supplied, but ${formatMissingSurfaceList(missingSurfaces)} missing.`
      : "Missing or failed.",
    ...(missingSurfaces.length > 0 ? { detail: `Missing surfaces: ${formatMissingSurfaceList(missingSurfaces)}.` } : {}),
  };
}

function bugGate(
  id: Extract<SubagentMaturityGateId, "unresolved_lifecycle_bugs" | "unresolved_permission_bugs">,
  label: string,
  bugs: SubagentMaturityBugEvidence,
): SubagentMaturityGate {
  const total = bugs.p0 + bugs.p1;
  return {
    id,
    status: total === 0 ? "passed" : "blocked",
    label,
    required: "Zero unresolved P0/P1 bugs.",
    actual: `${bugs.p0} P0, ${bugs.p1} P1.`,
  };
}

function securityReviewGate(review: SubagentMaturityInput["securityReview"]): SubagentMaturityGate {
  const status = review?.status ?? "not_started";
  return {
    id: "security_review",
    status: status === "passed" ? "passed" : "blocked",
    label: "Security signoff",
    required: "Security review passed after threat-model regression coverage.",
    actual: status === "passed" ? `Passed${review?.reviewedAt ? ` at ${review.reviewedAt}` : ""}.` : status.replace("_", " "),
    ...(review?.notes ? { detail: review.notes } : {}),
  };
}

function spawnFailureRate(observability: SubagentObservabilitySummary | undefined): number | undefined {
  if (!observability || observability.spawnAttempts <= 0) return undefined;
  return observability.failedSpawns / observability.spawnAttempts;
}

function normalizeCriteria(input: Partial<SubagentMaturityCriteria> | undefined): SubagentMaturityCriteria {
  return {
    minLiveDogfoodRuns: positiveInteger(input?.minLiveDogfoodRuns, DEFAULT_SUBAGENT_MATURITY_CRITERIA.minLiveDogfoodRuns),
    maxLiveDogfoodFailureRate: boundedRate(input?.maxLiveDogfoodFailureRate, DEFAULT_SUBAGENT_MATURITY_CRITERIA.maxLiveDogfoodFailureRate),
    minDesktopDogfoodRuns: positiveInteger(input?.minDesktopDogfoodRuns, DEFAULT_SUBAGENT_MATURITY_CRITERIA.minDesktopDogfoodRuns),
    maxDesktopDogfoodFailureRate: boundedRate(input?.maxDesktopDogfoodFailureRate, DEFAULT_SUBAGENT_MATURITY_CRITERIA.maxDesktopDogfoodFailureRate),
    maxFailedSpawnRate: boundedRate(input?.maxFailedSpawnRate, DEFAULT_SUBAGENT_MATURITY_CRITERIA.maxFailedSpawnRate),
  };
}

function isReadyDesktopDogfoodRun(entry: Partial<SubagentDesktopDogfoodHistoryEntry>): boolean {
  return entry.ready === true &&
    entry.status === "passed" &&
    entry.classification === "passed" &&
    safeCount(entry.blockingIssueCount) === 0 &&
    safeCount(entry.requiredScenarioMissing?.length) === 0 &&
    assertionSummaryComplete(entry.visualAssertionSummary) &&
    assertionSummaryComplete(entry.maturityAssertionSummary) &&
    safeCount(entry.workflowHighLoadPatternCount) >= 6 &&
    safeCount(entry.screenshotCount) > 0 &&
    entry.horizontalOverflowFree === true &&
    safeCount(entry.criticalOverlapCount) === 0;
}

function isFailedDesktopDogfoodRun(entry: Partial<SubagentDesktopDogfoodHistoryEntry>): boolean {
  return entry.ready !== true ||
    entry.status === "failed" ||
    entry.classification === "failed" ||
    safeCount(entry.blockingIssueCount) > 0 ||
    safeCount(entry.requiredScenarioMissing?.length) > 0 ||
    entry.horizontalOverflowFree === false ||
    safeCount(entry.criticalOverlapCount) > 0;
}

function assertionSummaryComplete(summary: SubagentDesktopDogfoodHistoryEntry["visualAssertionSummary"]): boolean {
  return safeCount(summary?.requiredCount) > 0 &&
    summary?.passedCount === summary?.requiredCount &&
    safeCount(summary?.failedCount) === 0 &&
    safeCount(summary?.missingCount) === 0;
}

function isCleanRequiredLiveRun(entry: Partial<SubagentReleaseGateLiveHistoryEntry>): boolean {
  return entry.liveRequired === true &&
    entry.ready === true &&
    entry.status === "passed" &&
    safeCount(entry.blockingIssueCount) === 0 &&
    safeCount(entry.advisoryIssueCount) === 0 &&
    skippedLiveEvidenceCount(entry) === 0;
}

function isFailedRequiredLiveRun(entry: Partial<SubagentReleaseGateLiveHistoryEntry>): boolean {
  if (entry.liveRequired !== true) return false;
  return entry.ready !== true ||
    entry.status === "attention" ||
    safeCount(entry.blockingIssueCount) > 0 ||
    skippedLiveEvidenceCount(entry) > 0;
}

function skippedLiveEvidenceCount(entry: Partial<SubagentReleaseGateLiveHistoryEntry>): number {
  return skippedLiveEvidenceLabels(entry).length;
}

function skippedLiveEvidenceLabels(entry: Partial<SubagentReleaseGateLiveHistoryEntry>): string[] {
  const statuses = liveEvidenceStatuses(entry);
  return REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS.filter((label) => statuses.get(label) !== "present");
}

function liveEvidenceStatuses(
  entry: Partial<SubagentReleaseGateLiveHistoryEntry>,
): Map<string, "present" | "skipped"> {
  const evidence = entry.liveEvidence;
  const skippedLabels = new Set(Array.isArray(entry.skippedLiveEvidence)
    ? entry.skippedLiveEvidence.filter((label): label is string => typeof label === "string" && label.length > 0)
    : []);
  return new Map(REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS.map((label) => {
    if (skippedLabels.has(label)) return [label, "skipped"];
    return [label, evidence?.[label] === "present" ? "present" : "skipped"];
  }));
}

const REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS = SUBAGENT_LIVE_EVIDENCE_LABELS;

function isLaterTimestamp(candidate: string | undefined, current: string | undefined): candidate is string {
  if (!candidate) return false;
  if (!current) return !Number.isNaN(Date.parse(candidate));
  const candidateTime = Date.parse(candidate);
  const currentTime = Date.parse(current);
  if (Number.isNaN(candidateTime)) return false;
  if (Number.isNaN(currentTime)) return true;
  return candidateTime > currentTime;
}

function normalizeBugEvidence(input: Partial<SubagentMaturityBugEvidence> | undefined): SubagentMaturityBugEvidence {
  return {
    p0: safeCount(input?.p0),
    p1: safeCount(input?.p1),
  };
}

function missingCompletionGuardVisibilitySurfaces(
  evidence: Partial<SubagentCompletionGuardVisibilityEvidence> | undefined,
): string[] {
  if (!evidence) return [];
  return [
    evidence.childInspector ? undefined : "child inspector",
    evidence.parentBlockingIndicator ? undefined : "parent blocking indicator",
    evidence.replayDiagnostics ? undefined : "replay diagnostics",
    evidence.diagnosticHistory ? undefined : "diagnostic history",
  ].filter((surface): surface is string => Boolean(surface));
}

function missingApprovalRoutingVisibilitySurfaces(
  evidence: Partial<SubagentApprovalRoutingVisibilityEvidence> | undefined,
): string[] {
  if (!evidence) return [];
  return [
    evidence.childRequestAttribution ? undefined : "child request attribution",
    evidence.scopedResponsePersistence ? undefined : "scoped response persistence",
    evidence.parentWaitResumption ? undefined : "parent wait resumption",
    evidence.nonInteractiveFailure ? undefined : "non-interactive failure handling",
    evidence.uiAndReplayVisibility ? undefined : "UI and replay visibility",
  ].filter((surface): surface is string => Boolean(surface));
}

function missingProductionUiVisibilitySurfaces(
  evidence: Partial<SubagentProductionUiVisibilityEvidence> | undefined,
): string[] {
  if (!evidence) return [];
  return [
    evidence.collapsedParentClusters ? undefined : "collapsed parent clusters",
    evidence.blockingChildIndicators ? undefined : "blocking-child indicators",
    evidence.childInspectorRows ? undefined : "child inspector rows",
    evidence.repairReplayPanels ? undefined : "repair/replay panels",
    evidence.localRuntimeOwnershipControls ? undefined : "local runtime ownership controls",
  ].filter((surface): surface is string => Boolean(surface));
}

function missingEventAttributionIntegritySurfaces(
  evidence: Partial<SubagentEventAttributionIntegrityEvidence> | undefined,
): string[] {
  if (!evidence) return [];
  return [
    evidence.runtimePreviewAttribution ? undefined : "runtime preview attribution",
    evidence.parentMailboxAttribution ? undefined : "parent mailbox attribution",
    evidence.toolApprovalErrorProvenance ? undefined : "tool/approval/error provenance",
    evidence.replayDiagnostics ? undefined : "replay diagnostics",
    evidence.largeOutputArtifactBacking ? undefined : "large-output artifact backing",
  ].filter((surface): surface is string => Boolean(surface));
}

function missingLifecycleControlIntegritySurfaces(
  evidence: Partial<SubagentLifecycleControlIntegrityEvidence> | undefined,
): string[] {
  if (!evidence) return [];
  return [
    evidence.parentStopCascade ? undefined : "parent-stop cascade",
    evidence.childCancelIsolation ? undefined : "child-cancel isolation",
    evidence.closeCapacityRetention ? undefined : "close capacity/history retention",
    evidence.lifecycleHookArtifacts ? undefined : "lifecycle hook artifacts",
    evidence.restartInterruptionRepair ? undefined : "restart interruption repair",
  ].filter((surface): surface is string => Boolean(surface));
}

function missingRetentionPolicyIntegritySurfaces(
  evidence: Partial<SubagentRetentionPolicyIntegrityEvidence> | undefined,
): string[] {
  if (!evidence) return [];
  return [
    evidence.closeDoesNotDelete ? undefined : "close without delete",
    evidence.capCleanupOldestEligible ? undefined : "oldest-eligible cap cleanup",
    evidence.protectedChildrenRetained ? undefined : "protected-child retention",
    evidence.summaryArtifactsRetained ? undefined : "summary/artifact durability",
    evidence.retainedStateVisible ? undefined : "retained-state UI",
  ].filter((surface): surface is string => Boolean(surface));
}

function missingToolScopeIntegritySurfaces(
  evidence: Partial<SubagentToolScopeIntegrityEvidence> | undefined,
): string[] {
  if (!evidence) return [];
  return [
    evidence.hardDenyPrecedence ? undefined : "hard-deny precedence",
    evidence.roleTaskNarrowing ? undefined : "role/task narrowing",
    evidence.exactToolAndExtensionResolution ? undefined : "exact tool/extension resolution",
    evidence.childFanoutDefaultBlocked ? undefined : "child fanout default block",
    evidence.snapshotAndInspectorDiagnostics ? undefined : "snapshot/inspector diagnostics",
  ].filter((surface): surface is string => Boolean(surface));
}

function formatMissingSurfaceList(surfaces: string[]): string {
  if (surfaces.length === 0) return "no surfaces";
  if (surfaces.length === 1) return surfaces[0] ?? "unknown surface";
  return `${surfaces.slice(0, -1).join(", ")} and ${surfaces[surfaces.length - 1]}`;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

function safeCount(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 0;
  return Math.max(0, Math.floor(value));
}

function safeStringArray(value: readonly string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function boundedRate(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.min(1, Math.max(0, value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}
