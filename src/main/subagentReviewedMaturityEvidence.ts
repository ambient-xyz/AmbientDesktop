import type {
  SubagentApprovalRoutingVisibilityEvidence,
  SubagentCompletionGuardVisibilityEvidence,
  SubagentEventAttributionIntegrityEvidence,
  SubagentLifecycleControlIntegrityEvidence,
  SubagentMaturityEvidence,
  SubagentMaturityEvidenceKind,
  SubagentMaturityEvidenceStatus,
  SubagentProductionUiVisibilityEvidence,
  SubagentRetentionPolicyIntegrityEvidence,
  SubagentToolScopeIntegrityEvidence,
  SubagentWorkflowJitterReleaseProfileReport,
} from "../shared/subagentMaturity";
import type { SubagentRestartReconciliationSummary } from "../shared/types";
import {
  REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_DETERMINISTIC_STRESS_UNITS,
  REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS,
  REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_PROMPT_VARIANTS,
  summarizeSubagentWorkflowJitterReleaseProfile,
} from "./subagentMaturity";

export const SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-reviewed-maturity-evidence-v1" as const;

export interface SubagentReviewedMaturityEvidenceStore {
  recordSubagentMaturityEvidence(input: {
    kind: Extract<
      SubagentMaturityEvidenceKind,
      | "restart_recovery"
      | "workflow_jitter_release_profile"
      | "completion_guard_visibility"
      | "approval_routing_visibility"
      | "production_ui_visibility"
      | "event_attribution_integrity"
      | "lifecycle_control_integrity"
      | "retention_policy_integrity"
      | "tool_scope_integrity"
      | "lifecycle_bug_audit"
      | "permission_bug_audit"
      | "security_review"
    >;
    status: SubagentMaturityEvidenceStatus;
    evidenceKey?: string;
    artifactPath?: string;
    reviewer?: string;
    notes?: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): SubagentMaturityEvidence;
}

export function recordSubagentRestartRecoveryEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: {
    summary: SubagentRestartReconciliationSummary;
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const skipped = input.summary.skipped === true;
  const status = !skipped && input.summary.issueCount === 0 ? "passed" : "failed";
  const defaultNotes = skipped
    ? "Reviewed restart recovery was skipped because ambient.subagents was disabled."
    : status === "passed"
      ? "Reviewed restart recovery completed with no unresolved reconciliation issues."
      : `Reviewed restart recovery found ${input.summary.issueCount} unresolved reconciliation issue${input.summary.issueCount === 1 ? "" : "s"}.`;
  return store.recordSubagentMaturityEvidence({
    kind: "restart_recovery",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `restart-recovery:${input.summary.createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? defaultNotes,
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "restart_recovery",
      summaryCreatedAt: input.summary.createdAt,
      issueCount: input.summary.issueCount,
      skipped,
      skipReason: input.summary.skipReason,
      featureFlagSnapshot: input.summary.featureFlagSnapshot,
      repairedRunIds: input.summary.repairedRunIds,
      repairedBarrierIds: input.summary.repairedBarrierIds,
      repairedParentControlBarrierIds: input.summary.repairedParentControlBarrierIds,
      diagnosticRunIds: input.summary.diagnosticRunIds,
      issueKinds: input.summary.issues.map((issue) => issue.kind),
      issueSeverities: input.summary.issues.map((issue) => issue.severity),
    },
    createdAt: input.createdAt ?? input.summary.createdAt,
  });
}

export function recordSubagentWorkflowJitterReleaseProfileEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: {
    report: Partial<SubagentWorkflowJitterReleaseProfileReport>;
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const summary = summarizeSubagentWorkflowJitterReleaseProfile(input.report);
  const status = summary.ready ? "passed" : "failed";
  const createdAt = input.createdAt ?? input.report.generatedAt ?? new Date().toISOString();
  const failureReasons = workflowJitterReleaseProfileFailureReasons(input.report, summary);
  return store.recordSubagentMaturityEvidence({
    kind: "workflow_jitter_release_profile",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `workflow-jitter-release-profile:${createdAt}`,
    artifactPath: optionalString(input.artifactPath) ?? optionalString(input.report.reportPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? "Reviewed workflow jitter release profile is ready with release-profile live evidence."
        : `Reviewed workflow jitter release profile is not ready: ${formatMissingSurfaceList(failureReasons)}.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "workflow_jitter_release_profile",
      workflowJitterReleaseProfile: input.report,
      summary,
      failureReasons,
    },
    createdAt,
  });
}

export function recordSubagentCompletionGuardVisibilityEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: Partial<SubagentCompletionGuardVisibilityEvidence> & {
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const visibility = normalizeCompletionGuardVisibilityEvidence(input);
  const missingSurfaces = missingCompletionGuardVisibilitySurfaces(visibility);
  const status = missingSurfaces.length === 0 ? "passed" : "failed";
  return store.recordSubagentMaturityEvidence({
    kind: "completion_guard_visibility",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `completion-guard-visibility:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? "Reviewed completion guard visibility across child inspector, parent blockers, replay diagnostics, and diagnostic history."
        : `Reviewed completion guard visibility is missing ${formatMissingSurfaceList(missingSurfaces)}.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "completion_guard_visibility",
      ...visibility,
      missingSurfaces,
    },
    createdAt,
  });
}

export function recordSubagentApprovalRoutingVisibilityEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: Partial<SubagentApprovalRoutingVisibilityEvidence> & {
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const visibility = normalizeApprovalRoutingVisibilityEvidence(input);
  const missingSurfaces = missingApprovalRoutingVisibilitySurfaces(visibility);
  const status = missingSurfaces.length === 0 ? "passed" : "failed";
  return store.recordSubagentMaturityEvidence({
    kind: "approval_routing_visibility",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `approval-routing-visibility:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? "Reviewed child approval routing across attribution, scoped response persistence, parent wait resumption, non-interactive failures, and UI/replay visibility."
        : `Reviewed child approval routing is missing ${formatMissingSurfaceList(missingSurfaces)}.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "approval_routing_visibility",
      ...visibility,
      missingSurfaces,
    },
    createdAt,
  });
}

export function recordSubagentProductionUiVisibilityEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: Partial<SubagentProductionUiVisibilityEvidence> & {
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const visibility = normalizeProductionUiVisibilityEvidence(input);
  const missingSurfaces = missingProductionUiVisibilitySurfaces(visibility);
  const status = missingSurfaces.length === 0 ? "passed" : "failed";
  return store.recordSubagentMaturityEvidence({
    kind: "production_ui_visibility",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `production-ui-visibility:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? "Reviewed production UI visibility across collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls."
        : `Reviewed production UI visibility is missing ${formatMissingSurfaceList(missingSurfaces)}.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "production_ui_visibility",
      ...visibility,
      missingSurfaces,
    },
    createdAt,
  });
}

export function recordSubagentEventAttributionIntegrityEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: Partial<SubagentEventAttributionIntegrityEvidence> & {
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const integrity = normalizeEventAttributionIntegrityEvidence(input);
  const missingSurfaces = missingEventAttributionIntegritySurfaces(integrity);
  const status = missingSurfaces.length === 0 ? "passed" : "failed";
  return store.recordSubagentMaturityEvidence({
    kind: "event_attribution_integrity",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `event-attribution-integrity:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? "Reviewed sub-agent event attribution across runtime previews, parent mailbox events, tool/approval/error provenance, replay diagnostics, and large-output artifacts."
        : `Reviewed sub-agent event attribution is missing ${formatMissingSurfaceList(missingSurfaces)}.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "event_attribution_integrity",
      ...integrity,
      missingSurfaces,
    },
    createdAt,
  });
}

export function recordSubagentLifecycleControlIntegrityEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: Partial<SubagentLifecycleControlIntegrityEvidence> & {
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const integrity = normalizeLifecycleControlIntegrityEvidence(input);
  const missingSurfaces = missingLifecycleControlIntegritySurfaces(integrity);
  const status = missingSurfaces.length === 0 ? "passed" : "failed";
  return store.recordSubagentMaturityEvidence({
    kind: "lifecycle_control_integrity",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `lifecycle-control-integrity:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? "Reviewed sub-agent lifecycle controls across parent-stop cascade, child-cancel isolation, close history retention, lifecycle hook artifacts, and restart interruption repair."
        : `Reviewed sub-agent lifecycle controls are missing ${formatMissingSurfaceList(missingSurfaces)}.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "lifecycle_control_integrity",
      ...integrity,
      missingSurfaces,
    },
    createdAt,
  });
}

export function recordSubagentRetentionPolicyIntegrityEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: Partial<SubagentRetentionPolicyIntegrityEvidence> & {
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const integrity = normalizeRetentionPolicyIntegrityEvidence(input);
  const missingSurfaces = missingRetentionPolicyIntegritySurfaces(integrity);
  const status = missingSurfaces.length === 0 ? "passed" : "failed";
  return store.recordSubagentMaturityEvidence({
    kind: "retention_policy_integrity",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `retention-policy-integrity:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? "Reviewed sub-agent retention policy across close-without-delete, oldest-eligible cap cleanup, protected-child retention, summary/artifact durability, and retained-state UI."
        : `Reviewed sub-agent retention policy is missing ${formatMissingSurfaceList(missingSurfaces)}.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "retention_policy_integrity",
      ...integrity,
      missingSurfaces,
    },
    createdAt,
  });
}

export function recordSubagentToolScopeIntegrityEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: Partial<SubagentToolScopeIntegrityEvidence> & {
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const integrity = normalizeToolScopeIntegrityEvidence(input);
  const missingSurfaces = missingToolScopeIntegritySurfaces(integrity);
  const status = missingSurfaces.length === 0 ? "passed" : "failed";
  return store.recordSubagentMaturityEvidence({
    kind: "tool_scope_integrity",
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `tool-scope-integrity:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? "Reviewed sub-agent tool scope across hard-deny precedence, role/task narrowing, exact tool/extension resolution, child fanout default blocking, and snapshot/inspector diagnostics."
        : `Reviewed sub-agent tool scope is missing ${formatMissingSurfaceList(missingSurfaces)}.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "tool_scope_integrity",
      ...integrity,
      missingSurfaces,
    },
    createdAt,
  });
}

export function recordSubagentBugAuditEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: {
    kind: Extract<SubagentMaturityEvidenceKind, "lifecycle_bug_audit" | "permission_bug_audit">;
    p0: number;
    p1: number;
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes?: string;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const p0 = nonnegativeCount(input.p0, "p0");
  const p1 = nonnegativeCount(input.p1, "p1");
  const status = p0 + p1 === 0 ? "passed" : "failed";
  const label = input.kind === "lifecycle_bug_audit" ? "lifecycle" : "permission";
  const createdAt = input.createdAt ?? new Date().toISOString();
  return store.recordSubagentMaturityEvidence({
    kind: input.kind,
    status,
    evidenceKey: optionalString(input.evidenceKey) ?? `${input.kind}:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes: optionalString(input.notes) ?? (
      status === "passed"
        ? `Reviewed ${label} bug audit found zero unresolved P0/P1 bugs.`
        : `Reviewed ${label} bug audit found ${p0} P0 and ${p1} P1 unresolved bugs.`
    ),
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: input.kind,
      p0,
      p1,
      totalP0P1: p0 + p1,
    },
    createdAt,
  });
}

export function recordSubagentSecurityReviewEvidence(
  store: SubagentReviewedMaturityEvidenceStore,
  input: {
    status: Extract<SubagentMaturityEvidenceStatus, "passed" | "failed">;
    evidenceKey?: string;
    artifactPath?: string;
    reviewer: string;
    notes: string;
    threatModelTestCount?: number;
    createdAt?: string;
  },
): SubagentMaturityEvidence {
  const reviewer = requiredReviewer(input.reviewer);
  const notes = requiredNotes(input.notes);
  const createdAt = input.createdAt ?? new Date().toISOString();
  return store.recordSubagentMaturityEvidence({
    kind: "security_review",
    status: input.status,
    evidenceKey: optionalString(input.evidenceKey) ?? `security-review:${createdAt}`,
    artifactPath: optionalString(input.artifactPath),
    reviewer,
    notes,
    details: {
      schemaVersion: SUBAGENT_REVIEWED_MATURITY_EVIDENCE_SCHEMA_VERSION,
      evidenceType: "security_review",
      threatModelTestCount: input.threatModelTestCount === undefined
        ? undefined
        : nonnegativeCount(input.threatModelTestCount, "threatModelTestCount"),
    },
    createdAt,
  });
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function requiredReviewer(value: string): string {
  const reviewer = optionalString(value);
  if (!reviewer) throw new Error("Reviewed sub-agent maturity evidence requires a reviewer.");
  return reviewer;
}

function requiredNotes(value: string): string {
  const notes = optionalString(value);
  if (!notes) throw new Error("Security review evidence requires notes.");
  return notes;
}

function workflowJitterReleaseProfileFailureReasons(
  report: Partial<SubagentWorkflowJitterReleaseProfileReport>,
  summary: ReturnType<typeof summarizeSubagentWorkflowJitterReleaseProfile>,
): string[] {
  return [
    summary.schemaVersion === 1 ? undefined : "schema version 1",
    summary.status === "passed" ? undefined : "passed status",
    report.releaseDecision?.ready === true ? undefined : "ready decision",
    summary.releaseProfile ? undefined : "release profile mode",
    summary.liveRequired ? undefined : "live-required decision",
    !summary.liveSkipped ? undefined : "non-skipped live evidence",
    summary.matrixProfile === "release" ? undefined : "release matrix profile",
    summary.deterministicStressUnitCount >= REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_DETERMINISTIC_STRESS_UNITS
      ? undefined
      : "deterministic stress coverage",
    summary.livePromptVariantCount >= REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_PROMPT_VARIANTS
      ? undefined
      : "live prompt variants",
    summary.liveDogfoodRunCount >= REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS
      ? undefined
      : "live dogfood runs",
    summary.missingLiveFamilies.length === 0 ? undefined : `live families ${summary.missingLiveFamilies.join(", ")}`,
    summary.productOrTestFailureCount === 0 ? undefined : "zero product/test failures",
    summary.providerDegradedCount === 0 ? undefined : "zero provider degradations",
    summary.environmentSkippedCount === 0 ? undefined : "zero environment skips",
    summary.promotionCandidateCount === 0 ? undefined : "zero promotion candidates",
    summary.blockingIssueCount === 0 ? undefined : "zero blocking issues",
    summary.matrixReleaseProfileCheckPassed ? undefined : "matrix.release-profile pass",
  ].filter((reason): reason is string => Boolean(reason));
}

function normalizeCompletionGuardVisibilityEvidence(
  input: Partial<SubagentCompletionGuardVisibilityEvidence>,
): SubagentCompletionGuardVisibilityEvidence {
  return {
    childInspector: input.childInspector === true,
    parentBlockingIndicator: input.parentBlockingIndicator === true,
    replayDiagnostics: input.replayDiagnostics === true,
    diagnosticHistory: input.diagnosticHistory === true,
  };
}

function missingCompletionGuardVisibilitySurfaces(evidence: SubagentCompletionGuardVisibilityEvidence): string[] {
  return [
    evidence.childInspector ? undefined : "child inspector",
    evidence.parentBlockingIndicator ? undefined : "parent blocking indicator",
    evidence.replayDiagnostics ? undefined : "replay diagnostics",
    evidence.diagnosticHistory ? undefined : "diagnostic history",
  ].filter((surface): surface is string => Boolean(surface));
}

function normalizeApprovalRoutingVisibilityEvidence(
  input: Partial<SubagentApprovalRoutingVisibilityEvidence>,
): SubagentApprovalRoutingVisibilityEvidence {
  return {
    childRequestAttribution: input.childRequestAttribution === true,
    scopedResponsePersistence: input.scopedResponsePersistence === true,
    parentWaitResumption: input.parentWaitResumption === true,
    nonInteractiveFailure: input.nonInteractiveFailure === true,
    uiAndReplayVisibility: input.uiAndReplayVisibility === true,
  };
}

function missingApprovalRoutingVisibilitySurfaces(evidence: SubagentApprovalRoutingVisibilityEvidence): string[] {
  return [
    evidence.childRequestAttribution ? undefined : "child request attribution",
    evidence.scopedResponsePersistence ? undefined : "scoped response persistence",
    evidence.parentWaitResumption ? undefined : "parent wait resumption",
    evidence.nonInteractiveFailure ? undefined : "non-interactive failure handling",
    evidence.uiAndReplayVisibility ? undefined : "UI and replay visibility",
  ].filter((surface): surface is string => Boolean(surface));
}

function normalizeProductionUiVisibilityEvidence(
  input: Partial<SubagentProductionUiVisibilityEvidence>,
): SubagentProductionUiVisibilityEvidence {
  return {
    collapsedParentClusters: input.collapsedParentClusters === true,
    blockingChildIndicators: input.blockingChildIndicators === true,
    childInspectorRows: input.childInspectorRows === true,
    repairReplayPanels: input.repairReplayPanels === true,
    localRuntimeOwnershipControls: input.localRuntimeOwnershipControls === true,
  };
}

function missingProductionUiVisibilitySurfaces(evidence: SubagentProductionUiVisibilityEvidence): string[] {
  return [
    evidence.collapsedParentClusters ? undefined : "collapsed parent clusters",
    evidence.blockingChildIndicators ? undefined : "blocking-child indicators",
    evidence.childInspectorRows ? undefined : "child inspector rows",
    evidence.repairReplayPanels ? undefined : "repair/replay panels",
    evidence.localRuntimeOwnershipControls ? undefined : "local runtime ownership controls",
  ].filter((surface): surface is string => Boolean(surface));
}

function normalizeEventAttributionIntegrityEvidence(
  input: Partial<SubagentEventAttributionIntegrityEvidence>,
): SubagentEventAttributionIntegrityEvidence {
  return {
    runtimePreviewAttribution: input.runtimePreviewAttribution === true,
    parentMailboxAttribution: input.parentMailboxAttribution === true,
    toolApprovalErrorProvenance: input.toolApprovalErrorProvenance === true,
    replayDiagnostics: input.replayDiagnostics === true,
    largeOutputArtifactBacking: input.largeOutputArtifactBacking === true,
  };
}

function missingEventAttributionIntegritySurfaces(evidence: SubagentEventAttributionIntegrityEvidence): string[] {
  return [
    evidence.runtimePreviewAttribution ? undefined : "runtime preview attribution",
    evidence.parentMailboxAttribution ? undefined : "parent mailbox attribution",
    evidence.toolApprovalErrorProvenance ? undefined : "tool/approval/error provenance",
    evidence.replayDiagnostics ? undefined : "replay diagnostics",
    evidence.largeOutputArtifactBacking ? undefined : "large-output artifact backing",
  ].filter((surface): surface is string => Boolean(surface));
}

function normalizeLifecycleControlIntegrityEvidence(
  input: Partial<SubagentLifecycleControlIntegrityEvidence>,
): SubagentLifecycleControlIntegrityEvidence {
  return {
    parentStopCascade: input.parentStopCascade === true,
    childCancelIsolation: input.childCancelIsolation === true,
    closeCapacityRetention: input.closeCapacityRetention === true,
    lifecycleHookArtifacts: input.lifecycleHookArtifacts === true,
    restartInterruptionRepair: input.restartInterruptionRepair === true,
  };
}

function missingLifecycleControlIntegritySurfaces(evidence: SubagentLifecycleControlIntegrityEvidence): string[] {
  return [
    evidence.parentStopCascade ? undefined : "parent-stop cascade",
    evidence.childCancelIsolation ? undefined : "child-cancel isolation",
    evidence.closeCapacityRetention ? undefined : "close capacity/history retention",
    evidence.lifecycleHookArtifacts ? undefined : "lifecycle hook artifacts",
    evidence.restartInterruptionRepair ? undefined : "restart interruption repair",
  ].filter((surface): surface is string => Boolean(surface));
}

function normalizeRetentionPolicyIntegrityEvidence(
  input: Partial<SubagentRetentionPolicyIntegrityEvidence>,
): SubagentRetentionPolicyIntegrityEvidence {
  return {
    closeDoesNotDelete: input.closeDoesNotDelete === true,
    capCleanupOldestEligible: input.capCleanupOldestEligible === true,
    protectedChildrenRetained: input.protectedChildrenRetained === true,
    summaryArtifactsRetained: input.summaryArtifactsRetained === true,
    retainedStateVisible: input.retainedStateVisible === true,
  };
}

function missingRetentionPolicyIntegritySurfaces(evidence: SubagentRetentionPolicyIntegrityEvidence): string[] {
  return [
    evidence.closeDoesNotDelete ? undefined : "close without delete",
    evidence.capCleanupOldestEligible ? undefined : "oldest-eligible cap cleanup",
    evidence.protectedChildrenRetained ? undefined : "protected-child retention",
    evidence.summaryArtifactsRetained ? undefined : "summary/artifact durability",
    evidence.retainedStateVisible ? undefined : "retained-state UI",
  ].filter((surface): surface is string => Boolean(surface));
}

function normalizeToolScopeIntegrityEvidence(
  input: Partial<SubagentToolScopeIntegrityEvidence>,
): SubagentToolScopeIntegrityEvidence {
  return {
    hardDenyPrecedence: input.hardDenyPrecedence === true,
    roleTaskNarrowing: input.roleTaskNarrowing === true,
    exactToolAndExtensionResolution: input.exactToolAndExtensionResolution === true,
    childFanoutDefaultBlocked: input.childFanoutDefaultBlocked === true,
    snapshotAndInspectorDiagnostics: input.snapshotAndInspectorDiagnostics === true,
  };
}

function missingToolScopeIntegritySurfaces(evidence: SubagentToolScopeIntegrityEvidence): string[] {
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

function nonnegativeCount(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
  if (value < 0) throw new Error(`${field} must be nonnegative.`);
  return Math.max(0, Math.floor(value));
}
