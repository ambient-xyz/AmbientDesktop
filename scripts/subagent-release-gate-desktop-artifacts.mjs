import { REQUIRED_DESKTOP_DOGFOOD_SCENARIOS } from "./subagent-desktop-dogfood-evidence-contract.mjs";
import {
  requireLabels,
  summarizeDesktopMaturityAssertions,
  summarizeDesktopVisualAssertions,
  validateDesktopApprovalFlow,
  validateDesktopApprovalForwarding,
  validateDesktopDeniedScopeExplanation,
  validateDesktopInlineChildTranscripts,
  validateDesktopLifecycleEdgeVisibility,
  validateDesktopLocalRuntimeOwnership,
  validateDesktopMaturityAssertions,
  validateDesktopMultiClusterStress,
  validateDesktopMutatingWorkerDogfood,
  validateDesktopOperatorBehavior,
  validateDesktopOperatorControls,
  validateDesktopRestartRehydration,
  validateDesktopVisualAssertions,
  validateDesktopWorkflowArtifactRehydration,
  validateDesktopWorkflowExecution,
  validateDesktopWorkflowHighLoad,
  validateDesktopWorkflowRehydratedNavigation,
} from "./subagent-release-gate-desktop-assertions.mjs";
import {
  allNonEmptyStrings,
  artifactFreshness,
  check,
  nonEmptyString,
  nonNegativeCount,
  positiveInteger,
  safeRelativePath,
  secretLikeStringPaths,
} from "./subagent-release-gate-validation-helpers.mjs";

const REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS = 25;

export function desktopDogfoodArtifactCheck(artifact, options) {
  const validation = isValidDesktopDogfoodArtifact(artifact);
  const freshness = artifactFreshness(artifact?.generatedAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    const issue = options.requireLive
      ? "Automated Desktop dogfood evidence is required but missing."
      : "Automated Desktop dogfood evidence was skipped for this deterministic gate run.";
    return check({
      id: "artifact.desktop-dogfood",
      area: "artifacts",
      status: options.requireLive ? "failed" : "advisory",
      label: "automated Electron Desktop dogfood evidence is present when available",
      evidence: ["missing test-results/subagent-desktop-dogfood/latest.json"],
      issues: options.requireLive ? [issue] : [],
      warnIssues: options.requireLive ? [] : [issue],
    });
  }
  return check({
    id: "artifact.desktop-dogfood",
    area: "artifacts",
    status: issues.length ? (options.requireLive ? "failed" : "advisory") : "passed",
    label: "automated Electron Desktop dogfood evidence is present when available",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-desktop-dogfood/latest.json"}`,
      `status: ${artifact.status ?? "missing"}`,
      `classification: ${artifact.classification ?? "missing"}`,
      `provider: ${artifact.provider ?? "missing"}`,
      `model: ${artifact.model ?? "missing"}`,
      `headful: ${artifact.headful === true ? "yes" : "no"}`,
      `cdpPort: ${artifact.cdpPort ?? "missing"}`,
      `featureFlag: ${artifact.featureFlag ?? "missing"}`,
      `scenarios: ${(artifact.scenarios ?? []).join(", ") || "missing"}`,
      `approvalId: ${artifact.approvalId ?? "missing"}`,
      `cancelControlChildRunId: ${artifact.cancelControlChildRunId ?? "missing"}`,
      `localRuntimeLeaseId: ${artifact.localRuntimeLeaseId ?? "missing"}`,
      `localRuntimeId: ${artifact.localRuntimeId ?? "missing"}`,
      `workflowTaskId: ${artifact.workflowTaskId ?? "missing"}`,
      `workflowRunId: ${artifact.workflowRunId ?? "missing"}`,
      `workflowArtifactSourceRelativePath: ${artifact.workflowArtifactSourceRelativePath ?? "missing"}`,
      `workflowArtifactStateRelativePath: ${artifact.workflowArtifactStateRelativePath ?? "missing"}`,
      `visualAssertions: ${summarizeDesktopVisualAssertions(artifact.visualAssertions)}`,
      `maturityAssertions: ${summarizeDesktopMaturityAssertions(artifact.maturityAssertions)}`,
      ...freshness.evidence,
    ],
    issues: options.requireLive ? issues : [],
    warnIssues: options.requireLive ? [] : issues,
  });
}

export function desktopDogfoodHistoryReportCheck(artifact, options) {
  const validation = isValidDesktopDogfoodHistoryReport(artifact);
  const freshness = artifactFreshness(artifact?.generatedAt, options);
  const issues = [...validation.issues, ...freshness.issues];
  if (!artifact) {
    const issue = options.requireMaturityHistory
      ? "Repeated Desktop dogfood maturity history is required but missing."
      : "Repeated Desktop dogfood maturity history was not required for this gate run.";
    return check({
      id: "artifact.desktop-dogfood-history",
      area: "artifacts",
      status: options.requireMaturityHistory ? "failed" : "passed",
      label: "repeated Desktop dogfood maturity history is ready when required",
      evidence: [
        "missing test-results/subagent-desktop-dogfood-history-report/latest.json",
        options.requireMaturityHistory ? "requireMaturityHistory: true" : "requireMaturityHistory: false",
      ],
      issues: options.requireMaturityHistory ? [issue] : [],
    });
  }
  return check({
    id: "artifact.desktop-dogfood-history",
    area: "artifacts",
    status: issues.length ? (options.requireMaturityHistory ? "failed" : "advisory") : "passed",
    label: "repeated Desktop dogfood maturity history is ready when required",
    evidence: [
      `path: ${artifact.__artifactPath ?? "test-results/subagent-desktop-dogfood-history-report/latest.json"}`,
      `status: ${artifact.status ?? "missing"}`,
      `ready: ${artifact.ready === true ? "yes" : "no"}`,
      `readyRuns: ${artifact.summary?.readyRunCount ?? "missing"}/${artifact.criteria?.minDesktopDogfoodRuns ?? "missing"}`,
      `failureRate: ${artifact.summary?.failureRate ?? "missing"}`,
      `highLoadReadyRuns: ${artifact.summary?.highLoadReadyRunCount ?? "missing"}/${artifact.criteria?.minWorkflowHighLoadReadyRuns ?? "missing"}`,
      `blockedGateIds: ${(artifact.blockedGateIds ?? []).join(", ") || "none"}`,
      ...freshness.evidence,
    ],
    issues: options.requireMaturityHistory ? issues : [],
    warnIssues: options.requireMaturityHistory ? [] : issues,
  });
}

export function isValidDesktopDogfoodArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-subagent-desktop-dogfood-v1") {
    issues.push(`Desktop dogfood artifact schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") {
    issues.push(`Desktop dogfood artifact status is ${artifact.status ?? "missing"}; expected passed.`);
  }
  if (artifact.classification !== "passed") {
    issues.push(`Desktop dogfood artifact classification is ${artifact.classification ?? "missing"}; expected passed.`);
  }
  if (!nonEmptyString(artifact.provider)) issues.push("Desktop dogfood artifact is missing provider.");
  if (artifact.headful !== true) issues.push("Desktop dogfood artifact must record headful: true.");
  if (!Number.isInteger(artifact.cdpPort) || artifact.cdpPort <= 0) {
    issues.push("Desktop dogfood artifact must record the random CDP port.");
  }
  if (artifact.featureFlag !== "ambient.subagents") {
    issues.push(`Desktop dogfood artifact featureFlag is ${artifact.featureFlag ?? "missing"}; expected ambient.subagents.`);
  }
  if (!nonEmptyString(artifact.parentThreadId)) issues.push("Desktop dogfood artifact is missing parentThreadId.");
  if (!nonEmptyString(artifact.parentMessageId)) issues.push("Desktop dogfood artifact is missing parentMessageId.");
  if (!allNonEmptyStrings(artifact.childRunIds)) issues.push("Desktop dogfood artifact is missing childRunIds.");
  if (!allNonEmptyStrings(artifact.childThreadIds)) issues.push("Desktop dogfood artifact is missing childThreadIds.");
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("approval_parent_blocking")) {
    issues.push("Desktop dogfood artifact must include approval_parent_blocking scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("workflow_execution_parent_blocking")) {
    issues.push("Desktop dogfood artifact must include workflow_execution_parent_blocking scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("mutating_worker_dogfood_behavior")) {
    issues.push("Desktop dogfood artifact must include mutating_worker_dogfood_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("workflow_high_load_dogfood")) {
    issues.push("Desktop dogfood artifact must include workflow_high_load_dogfood scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("denied_scope_explanation_behavior")) {
    issues.push("Desktop dogfood artifact must include denied_scope_explanation_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("approval_forwarding_behavior")) {
    issues.push("Desktop dogfood artifact must include approval_forwarding_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("restart_rehydration_behavior")) {
    issues.push("Desktop dogfood artifact must include restart_rehydration_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("workflow_rehydrated_navigation_behavior")) {
    issues.push("Desktop dogfood artifact must include workflow_rehydrated_navigation_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("workflow_artifact_rehydration_behavior")) {
    issues.push("Desktop dogfood artifact must include workflow_artifact_rehydration_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("local_runtime_ownership_ui")) {
    issues.push("Desktop dogfood artifact must include local_runtime_ownership_ui scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("untracked_runtime_safety_behavior")) {
    issues.push("Desktop dogfood artifact must include untracked_runtime_safety_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("lifecycle_edge_desktop_behavior")) {
    issues.push("Desktop dogfood artifact must include lifecycle_edge_desktop_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("operator_child_controls")) {
    issues.push("Desktop dogfood artifact must include operator_child_controls scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("operator_control_behavior")) {
    issues.push("Desktop dogfood artifact must include operator_control_behavior scenario evidence.");
  }
  if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes("multi_parent_cluster_stress")) {
    issues.push("Desktop dogfood artifact must include multi_parent_cluster_stress scenario evidence.");
  }
  if (!nonEmptyString(artifact.approvalRequestParentMailboxEventId)) {
    issues.push("Desktop dogfood artifact is missing approvalRequestParentMailboxEventId.");
  }
  if (!nonEmptyString(artifact.approvalId)) issues.push("Desktop dogfood artifact is missing approvalId.");
  if (!nonEmptyString(artifact.cancelControlChildRunId)) issues.push("Desktop dogfood artifact is missing cancelControlChildRunId.");
  if (!allNonEmptyStrings(artifact.closeControlChildRunIds)) issues.push("Desktop dogfood artifact is missing closeControlChildRunIds.");
  if (!nonEmptyString(artifact.localRuntimeLeaseId)) issues.push("Desktop dogfood artifact is missing localRuntimeLeaseId.");
  if (!nonEmptyString(artifact.localRuntimeId)) issues.push("Desktop dogfood artifact is missing localRuntimeId.");
  if (!Number.isInteger(artifact.localRuntimePid) || artifact.localRuntimePid <= 0) {
    issues.push("Desktop dogfood artifact is missing localRuntimePid.");
  }
  if (!nonEmptyString(artifact.untrackedRuntimeId)) issues.push("Desktop dogfood artifact is missing untrackedRuntimeId.");
  if (!Number.isInteger(artifact.untrackedRuntimePid) || artifact.untrackedRuntimePid <= 0) {
    issues.push("Desktop dogfood artifact is missing untrackedRuntimePid.");
  }
  if (!nonEmptyString(artifact.untrackedRuntimeEndpoint)) {
    issues.push("Desktop dogfood artifact is missing untrackedRuntimeEndpoint.");
  }
  if (!nonEmptyString(artifact.untrackedRuntimeModel) || !artifact.untrackedRuntimeModel.includes(".gguf")) {
    issues.push("Desktop dogfood artifact is missing untrackedRuntimeModel.");
  }
  if (!nonEmptyString(artifact.workflowTaskId)) issues.push("Desktop dogfood artifact is missing workflowTaskId.");
  if (!nonEmptyString(artifact.workflowArtifactId)) issues.push("Desktop dogfood artifact is missing workflowArtifactId.");
  if (!nonEmptyString(artifact.workflowArtifactSourceRelativePath)) {
    issues.push("Desktop dogfood artifact is missing workflowArtifactSourceRelativePath.");
  }
  if (!nonEmptyString(artifact.workflowArtifactStateRelativePath)) {
    issues.push("Desktop dogfood artifact is missing workflowArtifactStateRelativePath.");
  }
  if (!nonEmptyString(artifact.workflowArtifactSourceContent)) {
    issues.push("Desktop dogfood artifact is missing workflowArtifactSourceContent.");
  }
  if (!nonEmptyString(artifact.workflowRunId)) issues.push("Desktop dogfood artifact is missing workflowRunId.");
  if (!nonEmptyString(artifact.workflowThreadId)) issues.push("Desktop dogfood artifact is missing workflowThreadId.");
  if (!nonEmptyString(artifact.workflowParentMailboxEventId)) {
    issues.push("Desktop dogfood artifact is missing workflowParentMailboxEventId.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowTaskId)) issues.push("Desktop dogfood artifact is missing mutatingWorkflowTaskId.");
  if (!nonEmptyString(artifact.mutatingWorkflowArtifactId)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkflowArtifactId.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowRunId)) issues.push("Desktop dogfood artifact is missing mutatingWorkflowRunId.");
  if (!nonEmptyString(artifact.mutatingWorkflowThreadId)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkflowThreadId.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowChildRunId)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkflowChildRunId.");
  }
  if (!nonEmptyString(artifact.mutatingWorkflowChildThreadId)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkflowChildThreadId.");
  }
  if (!safeRelativePath(artifact.mutatingWorkflowStagedRelativePath)) {
    issues.push("Desktop dogfood artifact mutatingWorkflowStagedRelativePath must be a safe relative path.");
  }
  if (!safeRelativePath(artifact.mutatingWorkflowReportRelativePath)) {
    issues.push("Desktop dogfood artifact mutatingWorkflowReportRelativePath must be a safe relative path.");
  }
  if (
    !nonEmptyString(artifact.mutatingWorkflowProgressMessage) ||
    !artifact.mutatingWorkflowProgressMessage.includes("parent workspace unchanged")
  ) {
    issues.push("Desktop dogfood artifact is missing readable mutatingWorkflowProgressMessage.");
  }
  if (artifact.mutatingWorkflowParentWorkspaceUnchanged !== true) {
    issues.push("Desktop dogfood artifact must prove mutatingWorkflowParentWorkspaceUnchanged.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadTaskIds) || artifact.workflowHighLoadTaskIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadTaskIds.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadArtifactIds) || artifact.workflowHighLoadArtifactIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadArtifactIds.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadRunIds) || artifact.workflowHighLoadRunIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadRunIds.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadThreadIds) || artifact.workflowHighLoadThreadIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadThreadIds.");
  }
  if (!allNonEmptyStrings(artifact.workflowHighLoadPatternLabels) || artifact.workflowHighLoadPatternLabels.length < 6) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoadPatternLabels.");
  }
  if (!nonEmptyString(artifact.deniedScopeParentMailboxEventId)) {
    issues.push("Desktop dogfood artifact is missing deniedScopeParentMailboxEventId.");
  }
  if (!nonEmptyString(artifact.deniedScopeChildRunId)) {
    issues.push("Desktop dogfood artifact is missing deniedScopeChildRunId.");
  }
  if (!nonEmptyString(artifact.deniedScopeChildThreadId)) {
    issues.push("Desktop dogfood artifact is missing deniedScopeChildThreadId.");
  }
  if (!nonEmptyString(artifact.lifecycleEdgeParentMessageId)) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeParentMessageId.");
  }
  if (!allNonEmptyStrings(artifact.lifecycleEdgeChildRunIds) || artifact.lifecycleEdgeChildRunIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeChildRunIds.");
  }
  if (!allNonEmptyStrings(artifact.lifecycleEdgeChildThreadIds) || artifact.lifecycleEdgeChildThreadIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeChildThreadIds.");
  }
  if (!allNonEmptyStrings(artifact.lifecycleEdgeWaitBarrierIds) || artifact.lifecycleEdgeWaitBarrierIds.length < 4) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeWaitBarrierIds.");
  }
  if (!allNonEmptyStrings(artifact.stressParentMessageIds) || artifact.stressParentMessageIds.length < 2) {
    issues.push("Desktop dogfood artifact is missing stressParentMessageIds.");
  }
  if (!allNonEmptyStrings(artifact.stressChildRunIds) || artifact.stressChildRunIds.length < 6) {
    issues.push("Desktop dogfood artifact is missing stressChildRunIds.");
  }
  if (!allNonEmptyStrings(artifact.stressChildThreadIds) || artifact.stressChildThreadIds.length < 6) {
    issues.push("Desktop dogfood artifact is missing stressChildThreadIds.");
  }

  const artifacts = artifact.artifacts && typeof artifact.artifacts === "object" ? artifact.artifacts : {};
  for (const field of [
    "collapsedDesktopScreenshot",
    "expandedDesktopScreenshot",
    "approvalDialogScreenshot",
    "approvalForwardingDesktopScreenshot",
    "workflowExecutionDesktopScreenshot",
    "mutatingWorkerDogfoodDesktopScreenshot",
    "workflowHighLoadDesktopScreenshot",
    "deniedScopeExplanationDesktopScreenshot",
    "lifecycleEdgeVisibilityDesktopScreenshot",
    "multiClusterStressDesktopScreenshot",
    "restartRehydrationDesktopScreenshot",
    "workflowRehydratedNavigationDesktopScreenshot",
    "workflowArtifactRehydrationDesktopScreenshot",
    "localRuntimeOwnershipDesktopScreenshot",
    "expandedNarrowScreenshot",
    "operatorBehaviorDesktopScreenshot",
    "childTranscriptExpandedDesktopScreenshot",
    "completedChildTranscriptDesktopScreenshot",
    "patternGraphClickThroughDesktopScreenshot",
    "patternGraphCompletedClickThroughDesktopScreenshot",
    "accessibilitySnapshot",
  ]) {
    if (!safeRelativePath(artifacts[field])) {
      issues.push(`Desktop dogfood artifact ${field} must be a safe relative path.`);
    }
  }

  const checks = artifact.checks && typeof artifact.checks === "object" ? artifact.checks : {};
  const collapsed = checks.collapsed && typeof checks.collapsed === "object" ? checks.collapsed : {};
  if (collapsed.defaultCollapsed !== true) issues.push("Desktop dogfood collapsed state is not default-collapsed.");
  if (collapsed.clusterAfterParentMessage !== true)
    issues.push("Desktop dogfood collapsed state is not anchored after the parent message.");
  if (collapsed.horizontalOverflowFree !== true) issues.push("Desktop dogfood collapsed state has horizontal overflow.");
  requireLabels(
    collapsed.labels,
    ["Sub-agent threads", "2 children", "1 attention", "1 failed spawn", "Needs attention"],
    "collapsed",
    issues,
  );
  requireLabels(collapsed.labels, ["6 workflow tasks", "1 blocking", "1 workflow blocked"], "collapsed", issues);

  const expanded = checks.expanded && typeof checks.expanded === "object" ? checks.expanded : {};
  if (expanded.defaultCollapsed !== false) issues.push("Desktop dogfood expanded state did not open the cluster.");
  if (!Number.isInteger(expanded.childRows) || expanded.childRows < 2) {
    issues.push(`Desktop dogfood expanded state reports ${expanded.childRows ?? "missing"} child rows.`);
  }
  if (expanded.horizontalOverflowFree !== true) issues.push("Desktop dogfood expanded state has horizontal overflow.");
  if (!Number.isInteger(expanded.warningToneCount) || expanded.warningToneCount < 1) {
    issues.push(`Desktop dogfood expanded state reports ${expanded.warningToneCount ?? "missing"} warning tone rows.`);
  }
  requireLabels(
    expanded.labels,
    [
      "Review worker",
      "Context summarizer",
      "Blocking: approval",
      "Approval requested",
      "Allow workspace write",
      "workspace.write",
      "This child thread",
      "Approve child",
      "Deny child",
      "Waiting on child",
      "Required all",
      "Ask user on failure",
      "Symphony Map-Reduce",
      "Symphony Adversarial Debate",
      "Symphony Imitate and Verify",
      "Symphony Pipeline",
      "Symphony Ensemble",
      "Symphony Self-Healing Loop",
      "Blocking: workflow work",
      "Workflow blocked",
      "Mutating child worker",
      "Staged mutation: src/feature.txt",
      "Parent workspace unchanged",
    ],
    "expanded",
    issues,
  );
  validateDesktopApprovalFlow(expanded.approvalFlow, issues);
  validateDesktopWorkflowExecution(checks.workflowExecution, issues);
  validateDesktopMutatingWorkerDogfood(checks.mutatingWorkerDogfood, issues);
  validateDesktopWorkflowHighLoad(checks.workflowHighLoad, issues);
  validateDesktopDeniedScopeExplanation(checks.deniedScopeExplanation, issues);
  validateDesktopLifecycleEdgeVisibility(checks.lifecycleEdgeVisibility, issues);
  validateDesktopMultiClusterStress(checks.multiClusterStress, issues);
  validateDesktopApprovalForwarding(checks.approvalForwarding, issues);
  validateDesktopRestartRehydration(checks.restartRehydration, issues);
  validateDesktopWorkflowRehydratedNavigation(checks.workflowRehydratedNavigation, issues);
  validateDesktopWorkflowArtifactRehydration(checks.workflowArtifactRehydration, issues);
  validateDesktopLocalRuntimeOwnership(checks.localRuntimeOwnership, issues);
  validateDesktopOperatorControls(expanded.operatorControls, "expanded", issues);
  validateDesktopInlineChildTranscripts(checks, issues);

  const narrow = checks.narrow && typeof checks.narrow === "object" ? checks.narrow : {};
  if (narrow.horizontalOverflowFree !== true) issues.push("Desktop dogfood narrow view has horizontal overflow.");
  if (narrow.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood narrow view reports ${narrow.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
  if (narrow.clusterWithinViewport !== true) issues.push("Desktop dogfood narrow view cluster is outside the viewport.");
  validateDesktopOperatorControls(narrow.operatorControls, "narrow", issues);

  validateDesktopOperatorBehavior(checks.operatorBehavior, issues);
  validateDesktopVisualAssertions(artifact.visualAssertions, issues);
  validateDesktopMaturityAssertions(artifact.maturityAssertions, issues);

  if (artifact.error) issues.push("Desktop dogfood artifact includes an error.");
  const secretPaths = secretLikeStringPaths(artifact);
  if (secretPaths.length) {
    issues.push(`Desktop dogfood artifact appears to contain secret-like material at ${secretPaths.slice(0, 3).join(", ")}.`);
  }
  return { valid: issues.length === 0, issues };
}

export function isValidDesktopDogfoodHistoryReport(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues };
  if (artifact.schemaVersion !== "ambient-subagent-desktop-dogfood-history-report-v1") {
    issues.push(`Desktop dogfood history report schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "ready_to_graduate") {
    issues.push(`Desktop dogfood history report status is ${artifact.status ?? "missing"}; expected ready_to_graduate.`);
  }
  if (artifact.ready !== true) issues.push("Desktop dogfood history report ready must be true.");
  if (!nonEmptyString(artifact.historyPath)) issues.push("Desktop dogfood history report is missing historyPath.");

  const criteria = artifact.criteria ?? {};
  const summary = artifact.summary ?? {};
  if (!positiveInteger(criteria.minDesktopDogfoodRuns)) {
    issues.push("Desktop dogfood history report criteria.minDesktopDogfoodRuns must be positive.");
  } else if (criteria.minDesktopDogfoodRuns < REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS) {
    issues.push(
      `Desktop dogfood history report criteria.minDesktopDogfoodRuns is ${criteria.minDesktopDogfoodRuns}; expected at least ${REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS} for graduation.`,
    );
  }
  if (!positiveInteger(criteria.minWorkflowHighLoadReadyRuns)) {
    issues.push("Desktop dogfood history report criteria.minWorkflowHighLoadReadyRuns must be positive.");
  } else if (criteria.minWorkflowHighLoadReadyRuns < REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS) {
    issues.push(
      `Desktop dogfood history report criteria.minWorkflowHighLoadReadyRuns is ${criteria.minWorkflowHighLoadReadyRuns}; expected at least ${REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS} for graduation.`,
    );
  }
  if (
    typeof criteria.maxDesktopDogfoodFailureRate !== "number" ||
    criteria.maxDesktopDogfoodFailureRate < 0 ||
    criteria.maxDesktopDogfoodFailureRate > 1
  ) {
    issues.push("Desktop dogfood history report criteria.maxDesktopDogfoodFailureRate must be a rate.");
  }
  if (nonNegativeCount(summary.readyRunCount) < nonNegativeCount(criteria.minDesktopDogfoodRuns)) {
    issues.push(
      `Desktop dogfood history report has ${nonNegativeCount(summary.readyRunCount)} ready runs; expected ${nonNegativeCount(criteria.minDesktopDogfoodRuns)}.`,
    );
  }
  if (nonNegativeCount(summary.highLoadReadyRunCount) < nonNegativeCount(criteria.minWorkflowHighLoadReadyRuns)) {
    issues.push(
      `Desktop dogfood history report has ${nonNegativeCount(summary.highLoadReadyRunCount)} high-load ready runs; expected ${nonNegativeCount(criteria.minWorkflowHighLoadReadyRuns)}.`,
    );
  }
  if (typeof summary.failureRate !== "number" || summary.failureRate > criteria.maxDesktopDogfoodFailureRate) {
    issues.push(
      `Desktop dogfood history report failureRate is ${summary.failureRate ?? "missing"}; max is ${criteria.maxDesktopDogfoodFailureRate ?? "missing"}.`,
    );
  }
  if (nonNegativeCount(summary.readyRowsWithCompleteVisuals) < nonNegativeCount(summary.readyRunCount)) {
    issues.push(
      `Desktop dogfood history report has ${nonNegativeCount(summary.readyRowsWithCompleteVisuals)}/${nonNegativeCount(summary.readyRunCount)} ready rows with complete visual assertions.`,
    );
  }
  if (nonNegativeCount(summary.readyRowsWithCompleteMaturity) < nonNegativeCount(summary.readyRunCount)) {
    issues.push(
      `Desktop dogfood history report has ${nonNegativeCount(summary.readyRowsWithCompleteMaturity)}/${nonNegativeCount(summary.readyRunCount)} ready rows with complete maturity assertions.`,
    );
  }
  if (nonNegativeCount(summary.screenshotRunCount) < nonNegativeCount(summary.readyRunCount)) {
    issues.push(
      `Desktop dogfood history report has ${nonNegativeCount(summary.screenshotRunCount)}/${nonNegativeCount(summary.readyRunCount)} ready rows with screenshot evidence.`,
    );
  }
  if (!Number.isInteger(summary.visualFailureRunCount) || summary.visualFailureRunCount < 0) {
    issues.push("Desktop dogfood history report summary.visualFailureRunCount must be a non-negative integer.");
  }
  if (!Number.isInteger(summary.maturityFailureRunCount) || summary.maturityFailureRunCount < 0) {
    issues.push("Desktop dogfood history report summary.maturityFailureRunCount must be a non-negative integer.");
  }
  validateDesktopDogfoodHistoryScenarioCoverage(summary.requiredScenarioCoverage, criteria, issues);

  const blockedGateIds = Array.isArray(artifact.blockedGateIds) ? artifact.blockedGateIds : [];
  if (blockedGateIds.length) {
    issues.push(`Desktop dogfood history report has blocked gates: ${blockedGateIds.join(", ")}.`);
  }
  const gates = Array.isArray(artifact.gates) ? artifact.gates : [];
  if (!gates.length) issues.push("Desktop dogfood history report is missing gates.");
  const gateIds = gates.map((gate) => gate?.id).filter(nonEmptyString);
  for (const expectedGateId of REQUIRED_DESKTOP_DOGFOOD_HISTORY_GATE_IDS) {
    if (!gateIds.includes(expectedGateId)) {
      issues.push(`Desktop dogfood history report is missing gate ${expectedGateId}.`);
    }
  }
  for (const gate of gates) {
    if (gate?.status !== "passed") {
      issues.push(`Desktop dogfood history gate ${gate?.id ?? "unknown"} is ${gate?.status ?? "missing"}; expected passed.`);
    }
  }
  if (!Array.isArray(artifact.latestRuns) || artifact.latestRuns.length === 0) {
    issues.push("Desktop dogfood history report is missing latestRuns.");
  } else {
    for (const run of artifact.latestRuns.slice(0, 8)) {
      if (!nonEmptyString(run?.runId)) issues.push("Desktop dogfood history latestRuns entry is missing runId.");
      if (!nonEmptyString(run?.generatedAt))
        issues.push(`Desktop dogfood history latest run ${run?.runId ?? "unknown"} is missing generatedAt.`);
      if (!nonEmptyString(run?.status)) issues.push(`Desktop dogfood history latest run ${run?.runId ?? "unknown"} is missing status.`);
      if (!safeRelativePath(run?.reportPath))
        issues.push(`Desktop dogfood history latest run ${run?.runId ?? "unknown"} reportPath must be a safe relative path.`);
    }
  }
  return { valid: issues.length === 0, issues };
}

const REQUIRED_DESKTOP_DOGFOOD_HISTORY_GATE_IDS = [
  "history_available",
  "history_parse",
  "desktop_dogfood_count",
  "desktop_dogfood_failure_rate",
  "required_scenario_coverage",
  "visual_assertions",
  "maturity_assertions",
  "workflow_high_load_repetition",
];

function validateDesktopDogfoodHistoryScenarioCoverage(requiredScenarioCoverage, criteria, issues) {
  if (!Array.isArray(requiredScenarioCoverage)) {
    issues.push("Desktop dogfood history report is missing requiredScenarioCoverage.");
    return;
  }
  const byId = new Map(requiredScenarioCoverage.map((row) => [row?.id, row]));
  for (const scenarioId of REQUIRED_DESKTOP_DOGFOOD_SCENARIOS) {
    const row = byId.get(scenarioId);
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      issues.push(`Desktop dogfood history report is missing scenario coverage for ${scenarioId}.`);
      continue;
    }
    const readyRunCount = nonNegativeCount(row.readyRunCount);
    const runCount = nonNegativeCount(row.runCount);
    if (readyRunCount < nonNegativeCount(criteria.minDesktopDogfoodRuns)) {
      issues.push(
        `Desktop dogfood history scenario ${scenarioId} has ${readyRunCount} ready runs; expected ${nonNegativeCount(criteria.minDesktopDogfoodRuns)}.`,
      );
    }
    if (runCount < readyRunCount) {
      issues.push(`Desktop dogfood history scenario ${scenarioId} has runCount ${runCount} below readyRunCount ${readyRunCount}.`);
    }
  }
}
