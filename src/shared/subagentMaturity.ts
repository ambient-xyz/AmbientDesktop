export const SUBAGENT_MATURITY_SCHEMA_VERSION = "ambient-subagent-maturity-v1" as const;

export type SubagentSecurityReviewStatus = "not_started" | "passed" | "failed";
export type SubagentMaturityGateStatus = "passed" | "blocked" | "warning";
export type SubagentMaturityEvidenceKind =
  | "live_dogfood_run"
  | "desktop_dogfood_run"
  | "workflow_jitter_release_profile"
  | "live_pi_smoke"
  | "restart_recovery"
  | "completion_guard_visibility"
  | "approval_routing_visibility"
  | "production_ui_visibility"
  | "event_attribution_integrity"
  | "lifecycle_control_integrity"
  | "retention_policy_integrity"
  | "tool_scope_integrity"
  | "lifecycle_bug_audit"
  | "permission_bug_audit"
  | "security_review";
export type SubagentMaturityEvidenceStatus = "not_started" | "passed" | "failed";

export const SUBAGENT_MATURITY_EVIDENCE_KINDS: SubagentMaturityEvidenceKind[] = [
  "live_dogfood_run",
  "desktop_dogfood_run",
  "workflow_jitter_release_profile",
  "live_pi_smoke",
  "restart_recovery",
  "completion_guard_visibility",
  "approval_routing_visibility",
  "production_ui_visibility",
  "event_attribution_integrity",
  "lifecycle_control_integrity",
  "retention_policy_integrity",
  "tool_scope_integrity",
  "lifecycle_bug_audit",
  "permission_bug_audit",
  "security_review",
];

export type SubagentMaturityGateId =
  | "feature_flag_guarded"
  | "live_dogfood_count"
  | "live_dogfood_failure_rate"
  | "desktop_dogfood_count"
  | "desktop_dogfood_failure_rate"
  | "workflow_jitter_release_profile"
  | "live_smoke"
  | "failure_rate"
  | "restart_recovery"
  | "completion_guard_visibility"
  | "approval_routing_visibility"
  | "production_ui_visibility"
  | "event_attribution_integrity"
  | "lifecycle_control_integrity"
  | "retention_policy_integrity"
  | "tool_scope_integrity"
  | "unresolved_lifecycle_bugs"
  | "unresolved_permission_bugs"
  | "security_review";

export interface SubagentMaturityCriteria {
  minLiveDogfoodRuns: number;
  maxLiveDogfoodFailureRate: number;
  minDesktopDogfoodRuns: number;
  maxDesktopDogfoodFailureRate: number;
  maxFailedSpawnRate: number;
}

export interface SubagentReleaseGateLiveHistoryEntry {
  schemaVersion?: "ambient-subagent-release-gate-live-history-v1" | string;
  runId?: string;
  reportPath?: string;
  status?: string;
  ready?: boolean;
  liveRequired?: boolean;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  checkCounts?: Record<string, number>;
  liveEvidence?: Record<string, "present" | "skipped" | string>;
  skippedLiveEvidence?: string[];
  blockingIssueCount?: number;
  advisoryIssueCount?: number;
  nextSlice?: string;
}

export type SubagentLiveEvidenceLaneStatus = "present" | "skipped";

export interface SubagentLiveEvidenceLaneSummary {
  label: string;
  presentRunCount: number;
  skippedRunCount: number;
  latestStatus?: SubagentLiveEvidenceLaneStatus;
  latestCompletedAt?: string;
}

export interface SubagentLiveDogfoodHistorySummary {
  totalRunCount: number;
  requiredRunCount: number;
  cleanRequiredRunCount: number;
  failedRequiredRunCount: number;
  advisoryRequiredRunCount: number;
  skippedEvidenceRunCount: number;
  livePiSmokePassed: boolean;
  evidenceLanes?: SubagentLiveEvidenceLaneSummary[];
  failureRate?: number;
  latestCompletedAt?: string;
}

export interface SubagentAssertionHistorySummary {
  requiredCount?: number;
  passedCount?: number;
  failedCount?: number;
  missingCount?: number;
}

export interface SubagentDesktopDogfoodHistoryEntry {
  schemaVersion?: "ambient-subagent-desktop-dogfood-history-v1" | string;
  runId?: string;
  reportPath?: string;
  status?: string;
  classification?: string;
  ready?: boolean;
  generatedAt?: string;
  provider?: string;
  featureFlag?: string;
  scenarioCount?: number;
  scenarios?: string[];
  requiredScenarioMissing?: string[];
  visualAssertionSummary?: SubagentAssertionHistorySummary;
  maturityAssertionSummary?: SubagentAssertionHistorySummary;
  screenshotCount?: number;
  criticalOverlapCount?: number;
  horizontalOverflowFree?: boolean;
  workflowHighLoadPatternCount?: number;
  blockingIssueCount?: number;
  advisoryIssueCount?: number;
  issues?: string[];
}

export interface SubagentDesktopDogfoodHistorySummary {
  totalRunCount: number;
  readyRunCount: number;
  failedRunCount: number;
  advisoryRunCount: number;
  visualFailureRunCount: number;
  maturityFailureRunCount: number;
  highLoadReadyRunCount: number;
  screenshotRunCount: number;
  failureRate?: number;
  latestGeneratedAt?: string;
}

export interface SubagentWorkflowJitterReleaseProfileDecision {
  ready?: boolean;
  liveRequired?: boolean;
  releaseProfile?: boolean;
  liveSkipped?: boolean;
  blockingIssues?: string[];
  advisoryIssues?: string[];
  nextSlice?: string;
}

export interface SubagentWorkflowJitterReleaseProfileMatrix {
  profile?: string;
  deterministicStressUnitCount?: number;
  livePromptVariantCount?: number;
  liveDogfoodRunCount?: number;
  liveFamilies?: string[];
  productOrTestFailureCount?: number;
  providerDegradedCount?: number;
  environmentSkippedCount?: number;
  promotionCandidateCount?: number;
}

export interface SubagentWorkflowJitterReleaseProfileCheck {
  id?: string;
  status?: string;
}

export interface SubagentWorkflowJitterReleaseProfileReport {
  schemaVersion?: number | string;
  status?: string;
  generatedAt?: string;
  reportPath?: string;
  matrixReportPath?: string;
  releaseDecision?: Partial<SubagentWorkflowJitterReleaseProfileDecision>;
  matrix?: Partial<SubagentWorkflowJitterReleaseProfileMatrix>;
  checks?: Partial<SubagentWorkflowJitterReleaseProfileCheck>[];
}

export interface SubagentWorkflowJitterReleaseProfileSummary {
  ready: boolean;
  status?: string;
  schemaVersion?: number | string;
  releaseProfile: boolean;
  liveRequired: boolean;
  liveSkipped: boolean;
  matrixProfile?: string;
  deterministicStressUnitCount: number;
  livePromptVariantCount: number;
  liveDogfoodRunCount: number;
  liveFamilies: string[];
  missingLiveFamilies: string[];
  productOrTestFailureCount: number;
  providerDegradedCount: number;
  environmentSkippedCount: number;
  promotionCandidateCount: number;
  blockingIssueCount: number;
  advisoryIssueCount: number;
  matrixReleaseProfileCheckPassed: boolean;
  latestGeneratedAt?: string;
  reportPath?: string;
  matrixReportPath?: string;
}

export interface SubagentMaturityBugEvidence {
  p0: number;
  p1: number;
}

export interface SubagentCompletionGuardVisibilityEvidence {
  childInspector: boolean;
  parentBlockingIndicator: boolean;
  replayDiagnostics: boolean;
  diagnosticHistory: boolean;
}

export interface SubagentApprovalRoutingVisibilityEvidence {
  childRequestAttribution: boolean;
  scopedResponsePersistence: boolean;
  parentWaitResumption: boolean;
  nonInteractiveFailure: boolean;
  uiAndReplayVisibility: boolean;
}

export interface SubagentProductionUiVisibilityEvidence {
  collapsedParentClusters: boolean;
  blockingChildIndicators: boolean;
  childInspectorRows: boolean;
  repairReplayPanels: boolean;
  localRuntimeOwnershipControls: boolean;
}

export interface SubagentEventAttributionIntegrityEvidence {
  runtimePreviewAttribution: boolean;
  parentMailboxAttribution: boolean;
  toolApprovalErrorProvenance: boolean;
  replayDiagnostics: boolean;
  largeOutputArtifactBacking: boolean;
}

export interface SubagentLifecycleControlIntegrityEvidence {
  parentStopCascade: boolean;
  childCancelIsolation: boolean;
  closeCapacityRetention: boolean;
  lifecycleHookArtifacts: boolean;
  restartInterruptionRepair: boolean;
}

export interface SubagentRetentionPolicyIntegrityEvidence {
  closeDoesNotDelete: boolean;
  capCleanupOldestEligible: boolean;
  protectedChildrenRetained: boolean;
  summaryArtifactsRetained: boolean;
  retainedStateVisible: boolean;
}

export interface SubagentToolScopeIntegrityEvidence {
  hardDenyPrecedence: boolean;
  roleTaskNarrowing: boolean;
  exactToolAndExtensionResolution: boolean;
  childFanoutDefaultBlocked: boolean;
  snapshotAndInspectorDiagnostics: boolean;
}

export interface SubagentMaturityGate {
  id: SubagentMaturityGateId;
  status: SubagentMaturityGateStatus;
  label: string;
  required: string;
  actual: string;
  detail?: string;
}

export interface SubagentMaturitySnapshot {
  schemaVersion: typeof SUBAGENT_MATURITY_SCHEMA_VERSION;
  createdAt: string;
  status: "ready_to_graduate" | "blocked";
  defaultCanBeEnabled: boolean;
  summary: string;
  criteria: SubagentMaturityCriteria;
  liveHistory: SubagentLiveDogfoodHistorySummary;
  desktopDogfoodHistory: SubagentDesktopDogfoodHistorySummary;
  workflowJitterReleaseProfile: SubagentWorkflowJitterReleaseProfileSummary;
  blockedGateIds: SubagentMaturityGateId[];
  warningGateIds: SubagentMaturityGateId[];
  gates: SubagentMaturityGate[];
}

export interface SubagentMaturityEvidence {
  schemaVersion: "ambient-subagent-maturity-evidence-v1";
  id: string;
  kind: SubagentMaturityEvidenceKind;
  status: SubagentMaturityEvidenceStatus;
  evidenceKey?: string;
  runId?: string;
  parentRunId?: string;
  artifactPath?: string;
  reviewer?: string;
  notes?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SUBAGENT_MATURITY_CRITERIA: SubagentMaturityCriteria = {
  minLiveDogfoodRuns: 25,
  maxLiveDogfoodFailureRate: 0.05,
  minDesktopDogfoodRuns: 25,
  maxDesktopDogfoodFailureRate: 0.05,
  maxFailedSpawnRate: 0.05,
};
