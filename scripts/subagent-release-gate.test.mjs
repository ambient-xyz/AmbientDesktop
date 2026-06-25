import { describe, expect, it } from "vitest";
import {
  buildSubagentReleaseGateReport,
  renderSubagentReleaseGateMarkdown,
  subagentReleaseGatePassed,
} from "./subagent-release-gate-lib.mjs";
import {
  staticInput,
  replayArtifact,
  callableWorkflowDogfoodArtifact,
  callableWorkflowRehydrationArtifact,
  lifecycleEdgeArtifact,
  liveArtifact,
  desktopDogfoodArtifact,
  liveConfidenceArtifact,
  workflowLiveConfidenceArtifact,
  localRuntimeLiveConfidenceArtifact,
  restartRepairLiveConfidenceArtifact,
  lifecycleEdgeLiveConfidenceArtifact,
} from "./subagent-release-gate-test-fixtures.mjs";

describe("sub-agent release gate", () => {
  it("passes the deterministic gate with a skipped-live advisory", () => {
    const report = buildSubagentReleaseGateReport(staticInput());

    expect(report.status).toBe("passed_with_advisories");
    expect(subagentReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Live Ambient/Pi sub-agent smoke evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Sub-agent live confidence evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Child authority live confidence evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Workflow/Symphony live confidence evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Broader Workflow/Symphony live confidence evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Local runtime live confidence evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Restart repair live confidence evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Lifecycle edge confidence evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Desktop dogfood confidence evidence was skipped for this deterministic gate run.",
    );
    expect(report.releaseDecision.advisoryIssues).toContain(
      "Automated Desktop dogfood evidence was skipped for this deterministic gate run.",
    );
  });

  it("passes cleanly when required live evidence is present", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireLive: true,
        artifacts: {
          replayDiagnostics: replayArtifact(),
          callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
          callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
          lifecycleEdges: lifecycleEdgeArtifact(),
          liveSmoke: liveArtifact(),
          liveConfidence: liveConfidenceArtifact(),
          liveWorkflowConfidence: workflowLiveConfidenceArtifact(),
          liveLocalRuntimeConfidence: localRuntimeLiveConfidenceArtifact(),
          liveRestartRepairConfidence: restartRepairLiveConfidenceArtifact(),
          liveLifecycleEdgeConfidence: lifecycleEdgeLiveConfidenceArtifact(),
          desktopDogfood: desktopDogfoodArtifact(),
        },
      }),
    );

    expect(report.status).toBe("passed");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(true);
  });

  it("fails when threat-model coverage anchors are missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replaceAll("stale approvals", "old approval requests");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["threat-model regressions cover the planned security cases is missing source anchor: stale approvals"]),
    );
  });

  it("fails when secret-shaped source id threat coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replace(
      "secret-shaped source ids",
      "secret source identifiers",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "threat-model regressions cover the planned security cases is missing source anchor: secret-shaped source ids",
      ]),
    );
  });

  it("fails when non-callable source visibility coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replace("non-callable source types", "loaded source types");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "threat-model regressions cover the planned security cases is missing source anchor: non-callable source types",
      ]),
    );
  });

  it("fails when the maturity evaluator omits completion guard visibility", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("completion_guard_visibility", "guard_visibility");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("completion_guard_visibility", "guard_visibility");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["maturity evaluator encodes graduation gates is missing source anchor: completion_guard_visibility"]),
    );
  });

  it("fails when the maturity evaluator omits live dogfood history failure rate", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("live_dogfood_failure_rate", "live_dogfood_flake_rate");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("live_dogfood_failure_rate", "live_dogfood_flake_rate");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["maturity evaluator encodes graduation gates is missing source anchor: live_dogfood_failure_rate"]),
    );
  });

  it("fails when the maturity evaluator cannot derive dogfood volume from release history", () => {
    const input = staticInput();
    input.files.subagentMaturity = input.files.subagentMaturity.replace(
      "summarizeSubagentReleaseGateLiveHistory",
      "summarizeSubagentDogfoodNotes",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "maturity evaluator encodes graduation gates is missing source anchor: summarizeSubagentReleaseGateLiveHistory",
      ]),
    );
  });

  it("fails when the maturity evaluator omits approval routing visibility", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("approval_routing_visibility", "approval_visibility");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("approval_routing_visibility", "approval_visibility");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["maturity evaluator encodes graduation gates is missing source anchor: approval_routing_visibility"]),
    );
  });

  it("fails when the maturity evaluator omits production UI visibility", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("production_ui_visibility", "production_visibility");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("production_ui_visibility", "production_visibility");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["maturity evaluator encodes graduation gates is missing source anchor: production_ui_visibility"]),
    );
  });

  it("fails when the maturity evaluator omits event attribution integrity", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("event_attribution_integrity", "event_attribution");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("event_attribution_integrity", "event_attribution");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["maturity evaluator encodes graduation gates is missing source anchor: event_attribution_integrity"]),
    );
  });

  it("fails when the maturity evaluator omits lifecycle control integrity", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("lifecycle_control_integrity", "lifecycle_control");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("lifecycle_control_integrity", "lifecycle_control");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["maturity evaluator encodes graduation gates is missing source anchor: lifecycle_control_integrity"]),
    );
  });

  it("fails when the maturity evaluator omits retention policy integrity", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("retention_policy_integrity", "retention_integrity");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("retention_policy_integrity", "retention_integrity");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["maturity evaluator encodes graduation gates is missing source anchor: retention_policy_integrity"]),
    );
  });

  it("fails when the maturity evaluator omits tool scope integrity", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("tool_scope_integrity", "tool_scope_proof");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("tool_scope_integrity", "tool_scope_proof");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["maturity evaluator encodes graduation gates is missing source anchor: tool_scope_integrity"]),
    );
  });

  it("fails when reviewed completion guard visibility evidence is missing", () => {
    const input = staticInput();
    input.files.subagentReviewedMaturityEvidence = input.files.subagentReviewedMaturityEvidence.replace(
      "recordSubagentCompletionGuardVisibilityEvidence",
      "recordCompletionGuardEvidence",
    );
    input.files.subagentReviewedMaturityEvidenceTest = input.files.subagentReviewedMaturityEvidenceTest.replace(
      "recordSubagentCompletionGuardVisibilityEvidence",
      "recordCompletionGuardEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentCompletionGuardVisibilityEvidence",
      ]),
    );
  });

  it("fails when reviewed approval routing visibility evidence is missing", () => {
    const input = staticInput();
    input.files.subagentReviewedMaturityEvidence = input.files.subagentReviewedMaturityEvidence.replace(
      "recordSubagentApprovalRoutingVisibilityEvidence",
      "recordApprovalRoutingEvidence",
    );
    input.files.subagentReviewedMaturityEvidenceTest = input.files.subagentReviewedMaturityEvidenceTest.replace(
      "recordSubagentApprovalRoutingVisibilityEvidence",
      "recordApprovalRoutingEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentApprovalRoutingVisibilityEvidence",
      ]),
    );
  });

  it("fails when reviewed production UI visibility evidence is missing", () => {
    const input = staticInput();
    input.files.subagentReviewedMaturityEvidence = input.files.subagentReviewedMaturityEvidence.replace(
      "recordSubagentProductionUiVisibilityEvidence",
      "recordProductionUiEvidence",
    );
    input.files.subagentReviewedMaturityEvidenceTest = input.files.subagentReviewedMaturityEvidenceTest.replace(
      "recordSubagentProductionUiVisibilityEvidence",
      "recordProductionUiEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentProductionUiVisibilityEvidence",
      ]),
    );
  });

  it("fails when reviewed event attribution integrity evidence is missing", () => {
    const input = staticInput();
    input.files.subagentReviewedMaturityEvidence = input.files.subagentReviewedMaturityEvidence.replace(
      "recordSubagentEventAttributionIntegrityEvidence",
      "recordEventAttributionEvidence",
    );
    input.files.subagentReviewedMaturityEvidenceTest = input.files.subagentReviewedMaturityEvidenceTest.replace(
      "recordSubagentEventAttributionIntegrityEvidence",
      "recordEventAttributionEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentEventAttributionIntegrityEvidence",
      ]),
    );
  });

  it("fails when reviewed lifecycle control integrity evidence is missing", () => {
    const input = staticInput();
    input.files.subagentReviewedMaturityEvidence = input.files.subagentReviewedMaturityEvidence.replace(
      "recordSubagentLifecycleControlIntegrityEvidence",
      "recordLifecycleControlEvidence",
    );
    input.files.subagentReviewedMaturityEvidenceTest = input.files.subagentReviewedMaturityEvidenceTest.replace(
      "recordSubagentLifecycleControlIntegrityEvidence",
      "recordLifecycleControlEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentLifecycleControlIntegrityEvidence",
      ]),
    );
  });

  it("fails when reviewed retention policy integrity evidence is missing", () => {
    const input = staticInput();
    input.files.subagentReviewedMaturityEvidence = input.files.subagentReviewedMaturityEvidence.replace(
      "recordSubagentRetentionPolicyIntegrityEvidence",
      "recordRetentionPolicyEvidence",
    );
    input.files.subagentReviewedMaturityEvidenceTest = input.files.subagentReviewedMaturityEvidenceTest.replace(
      "recordSubagentRetentionPolicyIntegrityEvidence",
      "recordRetentionPolicyEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentRetentionPolicyIntegrityEvidence",
      ]),
    );
  });

  it("fails when reviewed tool scope integrity evidence is missing", () => {
    const input = staticInput();
    input.files.subagentReviewedMaturityEvidence = input.files.subagentReviewedMaturityEvidence.replace(
      "recordSubagentToolScopeIntegrityEvidence",
      "recordToolScopeEvidence",
    );
    input.files.subagentReviewedMaturityEvidenceTest = input.files.subagentReviewedMaturityEvidenceTest.replace(
      "recordSubagentToolScopeIntegrityEvidence",
      "recordToolScopeEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentToolScopeIntegrityEvidence",
      ]),
    );
  });

  it("fails when broad MCP and connector source coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replace(
      "broad MCP and connector grants",
      "broad tool grants",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "threat-model regressions cover the planned security cases is missing source anchor: broad MCP and connector grants",
      ]),
    );
  });

  it("fails when idempotency contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentIdempotencyTest = input.files.subagentIdempotencyTest
      .replace("fingerprints undefined payload fields deterministically", "covers payload fingerprints")
      .replace("ignores malformed idempotency previews when replaying retried operations", "covers malformed replay previews");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "idempotency contracts cover retry-safe child operations is missing source anchor: fingerprints undefined payload fields deterministically",
        "idempotency contracts cover retry-safe child operations is missing source anchor: ignores malformed idempotency previews when replaying retried operations",
      ]),
    );
  });

  it("fails when retention cleanup stops honoring role defaults", () => {
    const input = staticInput();
    input.files.subagentRetention = input.files.subagentRetention.replace("parent_thread_active", "retention_window_active");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "retention cleanup preserves transcripts and honors role defaults is missing source anchor: parent_thread_active",
      ]),
    );
  });

  it("fails when retention policy maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when retention policy integrity evidence omits a required surface",
      "blocks graduation when retention policy evidence is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent retention policy is proven before maturity is missing source anchor: blocks graduation when retention policy integrity evidence omits a required surface",
      ]),
    );
  });

  it("fails when retention cap cleanup evidence is missing", () => {
    const input = staticInput();
    input.files.subagentRetentionTest = input.files.subagentRetentionTest.replace(
      "collapses oldest completed eligible children when the per-parent retention cap is exceeded",
      "collapses completed eligible children when capacity is exceeded",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent retention policy is proven before maturity is missing source anchor: collapses oldest completed eligible children when the per-parent retention cap is exceeded",
      ]),
    );
  });

  it("fails when summary-retained child UI evidence is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "surfaces summary-retained children without open or control affordances",
      "surfaces retained children without open affordances",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent retention policy is proven before maturity is missing source anchor: surfaces summary-retained children without open or control affordances",
      ]),
    );
  });

  it("fails when tool scope maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when tool scope integrity evidence omits a required surface",
      "blocks graduation when tool scope evidence is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent tool scope is proven before maturity is missing source anchor: blocks graduation when tool scope integrity evidence omits a required surface",
      ]),
    );
  });

  it("fails when production UI visibility maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when production UI visibility evidence omits a required surface",
      "blocks graduation when production UI evidence is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "production UI visibility is proven before maturity is missing source anchor: blocks graduation when production UI visibility evidence omits a required surface",
      ]),
    );
  });

  it("fails when child active tool resolution evidence is missing", () => {
    const input = staticInput();
    input.files.subagentChildActiveToolsTest = input.files.subagentChildActiveToolsTest.replace(
      "does not inherit parent active tools for read-only child scopes",
      "checks child active tools",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent tool scope is proven before maturity is missing source anchor: does not inherit parent active tools for read-only child scopes",
      ]),
    );
  });

  it("fails when tool-scope snapshot diagnostic evidence is missing", () => {
    const input = staticInput();
    input.files.subagentToolScopeSnapshotTest = input.files.subagentToolScopeSnapshotTest.replace(
      "compacts exact launch scope and adds display metadata without dropping deny reasons",
      "compacts launch scope",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent tool scope is proven before maturity is missing source anchor: compacts exact launch scope and adds display metadata without dropping deny reasons",
      ]),
    );
  });

  it("fails when scheduled sub-agent automation deferral is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnFailure = input.files.subagentSpawnFailure.replace(
      "SCHEDULED_SUBAGENT_AUTOMATION_DEFERRED_REASON",
      "SUBAGENT_SCHEDULE_NOTICE",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "scheduled sub-agents are deferred to automations and cannot inherit live parent context is missing source anchor: SCHEDULED_SUBAGENT_AUTOMATION_DEFERRED_REASON",
      ]),
    );
  });

  it("fails when spawn failure contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnFailure = input.files.subagentSpawnFailure.replace(
      "buildSubagentPostReservationSpawnFailureParentMailboxInput",
      "buildPostReservationMailbox",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "spawn_agent failure paths use typed parent mailbox evidence is missing source anchor: buildSubagentPostReservationSpawnFailureParentMailboxInput",
      ]),
    );
  });

  it("fails when spawn request contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnRequest = input.files.subagentSpawnRequest.replace(
      "buildSubagentTaskMailboxEventInput",
      "buildTaskMailboxInput",
    );
    input.files.subagentSpawnLaunchExecutor = input.files.subagentSpawnLaunchExecutor.replace(
      "buildSubagentTaskMailboxEventInput",
      "buildTaskMailboxInput",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "spawn_agent success paths use typed task mailbox and run-event evidence is missing source anchor: buildSubagentTaskMailboxEventInput",
      ]),
    );
  });

  it("fails when spawn pre-run planner coverage is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnPreRunPlanner = input.files.subagentSpawnPreRunPlanner.replace(
      "resolveSubagentSpawnPreRunPlan",
      "resolveSpawnPlan",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "spawn_agent pre-run planning is typed and test-covered is missing source anchor: resolveSubagentSpawnPreRunPlan",
      ]),
    );
  });

  it("fails when Pi tool input parser coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolInput = input.files.subagentPiToolInput.replace("resolveSubagentPiToolWaitTimeoutMs", "resolveWaitTimeout");
    input.files.subagentPiToolInputTest = input.files.subagentPiToolInputTest.replace(
      "clamps wait timeouts to the bounded Pi-visible wait contract",
      "checks wait timeouts",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Pi parent sub-agent tool input parsing is typed, bounded, and test-covered is missing source anchor: resolveSubagentPiToolWaitTimeoutMs",
        "Pi parent sub-agent tool input parsing is typed, bounded, and test-covered is missing source anchor: clamps wait timeouts to the bounded Pi-visible wait contract",
      ]),
    );
  });

  it("fails when Pi tool result compaction coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolResult = input.files.subagentPiToolResult.replace("compactSubagentPiToolRunEvent", "compactRunEvent");
    input.files.subagentPiToolResultTest = input.files.subagentPiToolResultTest.replace(
      "compacts run events with bounded handles and optional preview/artifact fields",
      "compacts run events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Pi parent sub-agent tool results stay compact and artifact-handle oriented is missing source anchor: compactSubagentPiToolRunEvent",
        "Pi parent sub-agent tool results stay compact and artifact-handle oriented is missing source anchor: compacts run events with bounded handles and optional preview/artifact fields",
      ]),
    );
  });

  it("fails when spawn preflight resolver coverage is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnPreflightResolver = input.files.subagentSpawnPreflightResolver.replace(
      "resolveSubagentSpawnCapacityLease",
      "resolveSpawnCapacity",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "spawn_agent runtime preflight and capacity leases are typed and test-covered is missing source anchor: resolveSubagentSpawnCapacityLease",
      ]),
    );
  });

  it("fails when observability attribution validation is missing", () => {
    const input = staticInput();
    input.files.subagentObservability = input.files.subagentObservability.replace(
      "validateSubagentObservabilityEventAttribution",
      "childRunAttributionRequired",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: validateSubagentObservabilityEventAttribution",
      ]),
    );
  });

  it("fails when direct invariant and observability tests are missing", () => {
    const input = staticInput();
    input.files.subagentInvariantsTest = input.files.subagentInvariantsTest.replace(
      "validates parent synthesis safety and large output artifact backing",
      "validates parent synthesis",
    );
    input.files.subagentObservabilityTest = input.files.subagentObservabilityTest.replace(
      "summarizes spawn, wait, usage, memory, idle, batch, and restart observability",
      "summarizes observability",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: validates parent synthesis safety and large output artifact backing",
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: summarizes spawn, wait, usage, memory, idle, batch, and restart observability",
      ]),
    );
  });

  it("fails when durable child event attribution validation is missing", () => {
    const input = staticInput();
    input.files.subagentInvariants = input.files.subagentInvariants.replace(
      "validateSubagentRunEventAttribution",
      "validateRuntimeEventPreview",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: validateSubagentRunEventAttribution",
      ]),
    );
  });

  it("fails when diagnostic attribution audit coverage is missing", () => {
    const input = staticInput();
    input.files.diagnostics = input.files.diagnostics.replace("createSubagentAttributionAudit", "createSubagentDiagnosticsSummary");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: createSubagentAttributionAudit",
      ]),
    );
  });

  it("fails when diagnostic replay evidence coverage is missing", () => {
    const input = staticInput();
    input.files.diagnostics = input.files.diagnostics.replace("createSubagentDiagnosticReplayEvidence", "createSubagentEventSummary");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: createSubagentDiagnosticReplayEvidence",
      ]),
    );
  });

  it("fails when sub-agent abort and attention observability coverage is missing", () => {
    const input = staticInput();
    input.files.diagnosticsTest = input.files.diagnosticsTest.replace(
      "childRuntimeAborts: 1 groupedCompletions: 1 needsAttentionRequests: 1",
      "groupedCompletions: 1",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: childRuntimeAborts: 1",
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: needsAttentionRequests: 1",
      ]),
    );
  });

  it("fails when child-idle observability export coverage is missing", () => {
    const input = staticInput();
    input.files.diagnostics = input.files.diagnostics.replace("childIdleOpenRunCount", "openChildRunCount");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "diagnostic observability export preserves child idle metrics is missing source anchor: childIdleOpenRunCount",
      ]),
    );
  });

  it("fails when diagnostic replay evidence inspector coverage is missing", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModel = input.files.subagentReplayEvidenceUiModel.replace(
      "subagentReplayEvidenceInspectorModel",
      "subagentReplayRows",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: subagentReplayEvidenceInspectorModel",
      ]),
    );
  });

  it("fails when diagnostic replay provenance inspector coverage is missing", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModelTest = input.files.subagentReplayEvidenceUiModelTest.replace(
      "approval Permission Grant (approval-worker)",
      "approval approval-worker",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: approval Permission Grant (approval-worker)",
      ]),
    );
  });

  it("fails when diagnostic replay parent mailbox inspector coverage is missing", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModelTest = input.files.subagentReplayEvidenceUiModelTest.replace(
      "Parent mailbox events",
      "Parent events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: Parent mailbox events",
      ]),
    );
  });

  it("fails when callable workflow replay inspector coverage is missing", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModel = input.files.subagentReplayEvidenceUiModel.replace("callableWorkflowRows", "workflowRows");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: callableWorkflowRows",
      ]),
    );
  });

  it("fails when completion guard child inspector evidence is missing from release coverage", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModelTest = input.files.subagentThreadInspectorUiModelTest.replace(
      "shows blocked completion guard evidence in child thread wait details",
      "shows blocked child wait details",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "completion guard blockers are visible and replayable before maturity is missing source anchor: shows blocked completion guard evidence in child thread wait details",
      ]),
    );
  });

  it("fails when completion guard parent blocker evidence is missing from release coverage", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "Blocking: completion guard",
      "Blocking: child complete",
    );
    input.files.subagentParentClusterUiModel = input.files.subagentParentClusterUiModel.replace(
      "Blocking: completion guard",
      "Blocking: child complete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "completion guard blockers are visible and replayable before maturity is missing source anchor: Blocking: completion guard",
      ]),
    );
  });

  it("fails when completion guard replay evidence is missing from release coverage", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModelTest = input.files.subagentReplayEvidenceUiModelTest.replace(
      "completion guard blocked / mutation evidence structured 1 / Ambient 1 / isolated worktree 1 / approval 0",
      "mutation evidence summarized",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "completion guard blockers are visible and replayable before maturity is missing source anchor: completion guard blocked / mutation evidence structured 1 / Ambient 1 / isolated worktree 1 / approval 0",
      ]),
    );
  });

  it("fails when completion guard diagnostic history search coverage is missing", () => {
    const input = staticInput();
    input.files.diagnosticExportHistoryUiModelTest = input.files.diagnosticExportHistoryUiModelTest.replace(
      'diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("completion guard")',
      'diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("subagent")',
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        'completion guard blockers are visible and replayable before maturity is missing source anchor: diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("completion guard")',
      ]),
    );
  });

  it("fails when diagnostic replay evidence settings surface is missing", () => {
    const input = staticInput();
    input.files.rightPanelSettingsRuntime = input.files.rightPanelSettingsRuntime.replace(
      "function SubagentReplayEvidenceDiagnostics",
      "function SubagentDiagnosticsSummary",
    );
    input.files.settingsLayoutTest = input.files.settingsLayoutTest.replace(
      "function SubagentReplayEvidenceDiagnostics",
      "function SubagentDiagnosticsSummary",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: function SubagentReplayEvidenceDiagnostics",
      ]),
    );
  });

  it("fails when diagnostic export history coverage is missing", () => {
    const input = staticInput();
    input.files.diagnosticExportHistoryUiModelTest = input.files.diagnosticExportHistoryUiModelTest.replace(
      "records recent diagnostic exports newest first with stable de-duping",
      "records recent diagnostic exports",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: records recent diagnostic exports newest first with stable de-duping",
      ]),
    );
  });

  it("fails when diagnostic export history replay provenance coverage is missing", () => {
    const input = staticInput();
    input.files.diagnosticExportHistoryUiModelTest = input.files.diagnosticExportHistoryUiModelTest.replace(
      'approvalId: "approval-worker"',
      'approvalId: "other-approval"',
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        'diagnostic export history preserves replay provenance across restarts is missing source anchor: approvalId: "approval-worker"',
      ]),
    );
  });

  it("fails when diagnostic export result omits replay evidence for the renderer", () => {
    const input = staticInput();
    input.files.mainIndex = input.files.mainIndex.replace(
      "defaultPayload.bundle.subagents.replayEvidence",
      "defaultPayload.bundle.summary.subagents.replayEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: defaultPayload.bundle.subagents.replayEvidence",
      ]),
    );
  });

  it("fails when store-boundary child attribution coverage is missing", () => {
    const input = staticInput();
    input.files.projectStoreSubagentFoundationTest = input.files.projectStoreSubagentFoundationTest.replace(
      "rejects persisted child runtime and parent mailbox events without exact child attribution",
      "covers child runtime event attribution",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: rejects persisted child runtime and parent mailbox events without exact child attribution",
      ]),
    );
  });

  it("fails when child runtime large-output artifact enforcement is missing", () => {
    const input = staticInput();
    input.files.piEventMapper = input.files.piEventMapper.replace(
      "validatePiChildRuntimeEventLargeOutputArtifact",
      "clipPiChildRuntimeEventPreview",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Pi child event mapper preserves attribution, previews, and artifacts is missing source anchor: validatePiChildRuntimeEventLargeOutputArtifact",
      ]),
    );
  });

  it("fails when child runtime event persistence does not use mapped previews", () => {
    const input = staticInput();
    input.files.subagentRuntimeEventPersistence = input.files.subagentRuntimeEventPersistence.replace(
      "appendMappedSubagentRuntimeEvent",
      "appendRawSubagentRuntimeEvent",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Pi child event mapper preserves attribution, previews, and artifacts is missing source anchor: appendMappedSubagentRuntimeEvent",
      ]),
    );
  });

  it("fails when child runtime event persistence coverage is missing", () => {
    const input = staticInput();
    input.files.subagentRuntimeEventPersistenceTest = input.files.subagentRuntimeEventPersistenceTest.replace(
      "persists mapped child runtime events with run-event attribution and artifact paths",
      "persists mapped child runtime events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Pi child event mapper preserves attribution, previews, and artifacts is missing source anchor: persists mapped child runtime events with run-event attribution and artifact paths",
      ]),
    );
  });

  it("fails when compact child runtime update provenance coverage is missing", () => {
    const input = staticInput();
    input.files.piEventMapper = input.files.piEventMapper.replace("approvalSource", "approval_kind");
    input.files.piEventMapperTest = input.files.piEventMapperTest.replace("approvalSource", "approval_kind");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Pi child event mapper preserves attribution, previews, and artifacts is missing source anchor: approvalSource",
      ]),
    );
  });

  it("fails when persistent memory prompt snapshots are not explicit", () => {
    const input = staticInput();
    input.files.subagentPromptRuntime = input.files.subagentPromptRuntime.replace(
      "persistent_memory_disabled_by_default",
      "memory_boundary",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Pi child prompts filter parent context and restate follow-up result contracts is missing source anchor: persistent_memory_disabled_by_default",
      ]),
    );
  });

  it("fails when child mailbox request contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMailboxRequest = input.files.subagentMailboxRequest.replace(
      "resolveSubagentChildMailboxRequest",
      "resolveQueuedChildMessage",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "send_agent and followup_agent use a typed child mailbox request contract is missing source anchor: resolveSubagentChildMailboxRequest",
      ]),
    );
  });

  it("fails when child mailbox delivery state coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMailbox = input.files.subagentMailbox.replace("deliverQueuedParentToChildMailboxEvents", "deliverQueuedMailbox");
    input.files.subagentMailboxTest = input.files.subagentMailboxTest.replace(
      "consumes delivered events and cancels pending parent-to-child events without touching terminal mailbox state",
      "checks mailbox transitions",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "parent-to-child mailbox delivery transitions are typed and idempotent is missing source anchor: deliverQueuedParentToChildMailboxEvents",
        "parent-to-child mailbox delivery transitions are typed and idempotent is missing source anchor: consumes delivered events and cancels pending parent-to-child events without touching terminal mailbox state",
      ]),
    );
  });

  it("fails when child status discovery contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentAgentStatus = input.files.subagentAgentStatus.replace("buildSubagentListAgentsText", "formatAgentListText");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "list_agents and status_agent use typed child discovery summaries is missing source anchor: buildSubagentListAgentsText",
      ]),
    );
  });

  it("fails when parent-stop cascade mailbox coverage is missing", () => {
    const input = staticInput();
    input.files.projectStoreSubagentFoundationTest = input.files.projectStoreSubagentFoundationTest.replace(
      "pending mailbox work",
      "queued child messages",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "parent-stop cascade cancels dependent child mailbox work is missing source anchor: cascades a stopped parent run across dependent child runs, wait barriers, and pending mailbox work",
      ]),
    );
  });

  it("fails when parent mailbox anchoring coverage is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "creates a parent cluster for anchored batch progress without child runs",
      "shows batch progress beside existing child runs",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "parent mailbox failures stay anchored to visible parent messages is missing source anchor: creates a parent cluster for anchored batch progress without child runs",
      ]),
    );
  });

  it("fails when lifecycle parent mailbox payload coverage is missing", () => {
    const input = staticInput();
    input.files.subagentLifecycleParentMailboxTest = input.files.subagentLifecycleParentMailboxTest.replace(
      "builds child-attributed lifecycle interruption payloads for direct stops and runtime budgets",
      "builds lifecycle interruption payloads",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "parent mailbox failures stay anchored to visible parent messages is missing source anchor: builds child-attributed lifecycle interruption payloads for direct stops and runtime budgets",
      ]),
    );
  });

  it("fails when the batch exactly-once ledger validator is missing", () => {
    const input = staticInput();
    input.files.subagentBatchJobs = input.files.subagentBatchJobs.replace(
      "validateSubagentBatchResultLedgerExactlyOnce",
      "validateSubagentBatchLedger",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "batch/fanout result reporting is typed and exactly-once before launch is missing source anchor: validateSubagentBatchResultLedgerExactlyOnce",
      ]),
    );
  });

  it("fails when parent finalization-block mailbox coverage is missing", () => {
    const input = staticInput();
    input.files.agentRuntimeTest = input.files.agentRuntimeTest.replace(
      "blocks parent finalization while required sub-agent wait barriers are unresolved",
      "blocks parent finalization with a generic error",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "parent mailbox failures stay anchored to visible parent messages is missing source anchor: blocks parent finalization while required sub-agent wait barriers are unresolved",
      ]),
    );
  });

  it("fails when finalization blocking helper mailbox coverage is missing", () => {
    const input = staticInput();
    input.files.agentRuntimeFinalizationBlockingTest = input.files.agentRuntimeFinalizationBlockingTest.replace(
      "records subagent finalization mailbox events with policy payloads",
      "records subagent finalization mailbox events generically",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "parent mailbox failures stay anchored to visible parent messages is missing source anchor: records subagent finalization mailbox events with policy payloads",
      ]),
    );
  });

  it("fails when close capacity guard coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolsTest = input.files.subagentPiToolsTest.replace(
      "refuses to close actively executing children before releasing capacity",
      "closes active children",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "close_agent releases capacity only for inactive children is missing source anchor: refuses to close actively executing children before releasing capacity",
      ]),
    );
  });

  it("fails when lifecycle hook transcript and artifact pointer coverage is missing", () => {
    const input = staticInput();
    input.files.subagentLifecycleHooksTest = input.files.subagentLifecycleHooksTest.replace(
      "records stop artifact pointers and final status without copying result content",
      "records stop artifacts",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "lifecycle hooks preserve transcript refs and bounded artifact pointers is missing source anchor: records stop artifact pointers and final status without copying result content",
      ]),
    );
  });

  it("fails when lifecycle control maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when lifecycle control integrity evidence omits a required surface",
      "blocks graduation when lifecycle controls are incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent lifecycle controls are proven before maturity is missing source anchor: blocks graduation when lifecycle control integrity evidence omits a required surface",
      ]),
    );
  });

  it("fails when lifecycle close retention coverage is missing from maturity evidence", () => {
    const input = staticInput();
    input.files.subagentCloseAgentExecutorTest = input.files.subagentCloseAgentExecutorTest.replace(
      "records close requests, releases capacity, and writes a retained-history child message",
      "records close requests",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent lifecycle controls are proven before maturity is missing source anchor: records close requests, releases capacity, and writes a retained-history child message",
      ]),
    );
  });

  it("fails when lifecycle restart repair coverage is missing from maturity evidence", () => {
    const input = staticInput();
    input.files.subagentStartupReconciliationTest = input.files.subagentStartupReconciliationTest.replace(
      "emits repaired child run, child thread, lifecycle stop, restart event, and wait barrier updates",
      "emits repaired child run",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "sub-agent lifecycle controls are proven before maturity is missing source anchor: emits repaired child run, child thread, lifecycle stop, restart event, and wait barrier updates",
      ]),
    );
  });

  it("fails when child approval bridge wait-resumption coverage is missing", () => {
    const input = staticInput();
    input.files.subagentApprovalBridgeTest = input.files.subagentApprovalBridgeTest.replace(
      "builds child-attributed approval requests that return the parent to a wait barrier",
      "builds child approval requests",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "child approval bridge preserves child identity, scope, and parent wait resumption is missing source anchor: builds child-attributed approval requests that return the parent to a wait barrier",
      ]),
    );
  });

  it("fails when child approval bridge executor coverage is missing", () => {
    const input = staticInput();
    input.files.subagentWaitAgentExecutorTest = input.files.subagentWaitAgentExecutorTest.replace(
      "records child approval requests and leaves the parent blocked on the child wait barrier",
      "records child approval requests",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "child approval bridge preserves child identity, scope, and parent wait resumption is missing source anchor: records child approval requests and leaves the parent blocked on the child wait barrier",
      ]),
    );
  });

  it("fails when child approval bridge response delivery coverage is missing", () => {
    const input = staticInput();
    input.files.subagentApprovalBridgeTest = input.files.subagentApprovalBridgeTest.replace(
      "records approval responses into the child mailbox and parent audit event idempotently",
      "records approval responses",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "child approval bridge preserves child identity, scope, and parent wait resumption is missing source anchor: records approval responses into the child mailbox and parent audit event idempotently",
      ]),
    );
  });

  it("fails when approval routing visibility maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when approval routing visibility evidence omits a required surface",
      "blocks graduation when approval evidence is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "approval routing blockers are visible and scoped before maturity is missing source anchor: blocks graduation when approval routing visibility evidence omits a required surface",
      ]),
    );
  });

  it("fails when approval routing UI visibility coverage is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "labels child approval requests and forwarded decisions in the collapsed cluster",
      "labels child approval events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "approval routing blockers are visible and scoped before maturity is missing source anchor: labels child approval requests and forwarded decisions in the collapsed cluster",
      ]),
    );
  });

  it("fails when approval routing non-interactive failure coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replace(
      "fails connector access in non-interactive launches instead of creating stale approvals",
      "fails connector access",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "approval routing blockers are visible and scoped before maturity is missing source anchor: fails connector access in non-interactive launches instead of creating stale approvals",
      ]),
    );
  });

  it("fails when event attribution maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when event attribution integrity evidence omits a required surface",
      "blocks graduation when event attribution is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "child event attribution is proven before maturity is missing source anchor: blocks graduation when event attribution integrity evidence omits a required surface",
      ]),
    );
  });

  it("fails when compact event attribution coverage is missing", () => {
    const input = staticInput();
    input.files.piEventMapperTest = input.files.piEventMapperTest.replace(
      "builds compact Pi updates that identify the child run for tool, approval, and error attribution",
      "builds compact Pi updates for child runtime events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "child event attribution is proven before maturity is missing source anchor: builds compact Pi updates that identify the child run for tool, approval, and error attribution",
      ]),
    );
  });

  it("fails when event attribution replay diagnostics coverage is missing", () => {
    const input = staticInput();
    input.files.diagnostics = input.files.diagnostics.replace("createSubagentAttributionAudit", "createSubagentAudit");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "child event attribution is proven before maturity is missing source anchor: createSubagentAttributionAudit",
      ]),
    );
  });

  it("fails when aggregate wait-barrier synthesis coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolsWaitSynthesisTest = input.files.subagentPiToolsWaitSynthesisTest.replace(
      "creates Pi-reachable aggregate wait barriers with explicit quorum thresholds",
      "creates hidden aggregate wait barriers",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "wait barriers aggregate child synthesis safety by dependency mode is missing source anchor: creates Pi-reachable aggregate wait barriers with explicit quorum thresholds",
      ]),
    );
  });

  it("fails when worker mutation completion guard enforcement is missing", () => {
    const input = staticInput();
    input.files.subagentCompletionGuard = input.files.subagentCompletionGuard.replace(
      "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
      "Implementation roles require mutation evidence.",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "worker mutation completion guard requires worktree isolation and approval provenance is missing source anchor: Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
      ]),
    );
  });

  it("fails when worker mutation completion guard tests are missing", () => {
    const input = staticInput();
    input.files.subagentCompletionGuardTest = input.files.subagentCompletionGuardTest.replace(
      "rejects isolated worker mutation evidence without approval provenance",
      "accepts isolated worker mutation evidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "worker mutation completion guard requires worktree isolation and approval provenance is missing source anchor: rejects isolated worker mutation evidence without approval provenance",
      ]),
    );
  });

  it("fails when child worktree preparation coverage is missing", () => {
    const input = staticInput();
    input.files.subagentChildWorktreePreparer = input.files.subagentChildWorktreePreparer.replace(
      "prepareSubagentChildWorktreeForLaunch",
      "prepareChildWorktree",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "worker mutation completion guard requires worktree isolation and approval provenance is missing source anchor: prepareSubagentChildWorktreeForLaunch",
      ]),
    );
  });

  it("fails when target resolver coverage is missing", () => {
    const input = staticInput();
    input.files.subagentTargetResolver = input.files.subagentTargetResolver.replace(
      "ambient-subagent-target-resolver-v1",
      "ambient-subagent-target-resolver",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "path-addressed sub-agent target resolution is parent-bounded and test-covered is missing source anchor: ambient-subagent-target-resolver-v1",
      ]),
    );
  });

  it("fails when wait-barrier UI coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModelTest = input.files.subagentThreadInspectorUiModelTest.replace(
      "shows quorum thresholds and synthesis counts in child thread wait details",
      "shows generic child wait details",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: shows quorum thresholds and synthesis counts in child thread wait details",
      ]),
    );
  });

  it("fails when child inspector memory-policy coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModel = input.files.subagentThreadInspectorUiModel.replace("memoryPolicyLabel", "rolePolicyLabel");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: memoryPolicyLabel"]),
    );
  });

  it("fails when child inspector retention-policy coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModel = input.files.subagentThreadInspectorUiModel.replace(
      "retentionPolicyLabel",
      "cleanupPolicyLabel",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: retentionPolicyLabel",
      ]),
    );
  });

  it("fails when child inspector worktree evidence coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModelTest = input.files.subagentThreadInspectorUiModelTest.replace(
      "shows prepared child worktree details from the launch snapshot",
      "shows child worktree summary",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: shows prepared child worktree details from the launch snapshot",
      ]),
    );
  });

  it("fails when parent mailbox child-source label coverage is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "surfaces child-source labels for approval and lifecycle mailbox activity",
      "surfaces mailbox activity labels",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: surfaces child-source labels for approval and lifecycle mailbox activity",
      ]),
    );
  });

  it("fails when callable workflow blocker UI coverage is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "creates a parent cluster for anchored blocking workflow tasks without child runs",
      "creates parent clusters for workflow tasks",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: creates a parent cluster for anchored blocking workflow tasks without child runs",
      ]),
    );
  });

  it("fails when callable workflow dogfood parent-blocking proof is missing", () => {
    const input = staticInput();
    input.files.callableWorkflowDogfoodEvidence = input.files.callableWorkflowDogfoodEvidence.replace(
      "blockedBeforeCompletion",
      "blockedBeforeDone",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "callable workflow dogfood evidence proves child mutating workflow, parent blocking, denied scope, and restart repair is missing source anchor: blockedBeforeCompletion",
      ]),
    );
  });

  it("fails when optional-background live smoke coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolLiveSmoke = input.files.subagentPiToolLiveSmoke.replace(
      "SUBAGENT_OPTIONAL_BACKGROUND_DONE",
      "SUBAGENT_BACKGROUND_DONE",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "live Ambient/Pi smoke test exercises visible child sessions is missing source anchor: SUBAGENT_OPTIONAL_BACKGROUND_DONE",
      ]),
    );
  });

  it("fails when live tool-denial smoke coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolLiveSmoke = input.files.subagentPiToolLiveSmoke.replace(
      "SUBAGENT_TOOL_DENIAL_LIVE_DONE",
      "SUBAGENT_DENIAL_DONE",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "live Ambient/Pi smoke test exercises visible child sessions is missing source anchor: SUBAGENT_TOOL_DENIAL_LIVE_DONE",
      ]),
    );
  });

  it("fails when live restart reconciliation smoke coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolLiveSmoke = input.files.subagentPiToolLiveSmoke.replace(
      "recordSubagentRestartRecoveryEvidence",
      "recordRestartEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "live Ambient/Pi smoke test exercises visible child sessions is missing source anchor: recordSubagentRestartRecoveryEvidence",
      ]),
    );
  });

  it("fails when local text runtime policy coverage is missing", () => {
    const input = staticInput();
    input.files.localTextDelegationTest = input.files.localTextDelegationTest.replace(
      "unloads idle local model runtimes before acquiring when memory policy requires cleanup",
      "cleans up extra local runtimes",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "local text sub-agents enforce local runtime lifecycle, memory, and invocation limits is missing source anchor: unloads idle local model runtimes before acquiring when memory policy requires cleanup",
      ]),
    );
  });

  it("fails when local text startup runtime coverage is missing", () => {
    const input = staticInput();
    input.files.localTextSubagentStartupConfigTest = input.files.localTextSubagentStartupConfigTest.replace(
      "builds an available local text profile and runtime descriptor from startup env",
      "builds local text startup settings",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "local text sub-agents enforce local runtime lifecycle, memory, and invocation limits is missing source anchor: builds an available local text profile and runtime descriptor from startup env",
      ]),
    );
  });

  it("fails when local runtime lifecycle ownership coverage is missing", () => {
    const input = staticInput();
    input.files.agentRuntimeLocalRuntimeToolsTest = input.files.agentRuntimeLocalRuntimeToolsTest.replace(
      "runs provider-declared Start, Stop, and Restart for voice runtime rows",
      "runs provider-declared lifecycle commands for voice runtime rows",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "local runtime lifecycle tools honor sub-agent ownership leases is missing source anchor: runs provider-declared Start, Stop, and Restart for voice runtime rows",
      ]),
    );
  });

  it("fails when replay diagnostics have not been generated", () => {
    const input = staticInput();
    delete input.artifacts.replayDiagnostics;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Run pnpm run test:subagents:replay-diagnostics before the release gate.");
  });

  it("fails when replay diagnostics omit child event-stream evidence", () => {
    const input = staticInput();
    delete input.artifacts.replayDiagnostics.replayEvidence;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Replay diagnostics must include replayEvidence.");
  });

  it("fails when replay diagnostics omit lifecycle edge evidence", () => {
    const input = staticInput();
    delete input.artifacts.replayDiagnostics.lifecycleEdgeEvidence;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Replay diagnostics must include lifecycleEdgeEvidence.");
  });

  it("fails when replay diagnostics omit parent mailbox evidence", () => {
    const input = staticInput();
    input.artifacts.replayDiagnostics.replayEvidence.parentMailboxTimeline = [];
    input.artifacts.replayDiagnostics.replayEvidence.counts.parentMailboxEvents = 0;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Replay evidence must include a parentMailboxTimeline.",
        "Replay evidence must include parent mailbox event counts.",
      ]),
    );
  });

  it("fails when callable workflow dogfood omits or fails maturity assertions", () => {
    const artifact = callableWorkflowDogfoodArtifact();
    delete artifact.maturityAssertions.workflow_denied_child_scope;
    artifact.maturityAssertions.workflow_parent_blocking_completion.status = "failed";
    artifact.maturityAssertions.workflow_parent_blocking_completion.evidence = [
      "passed: blockedBeforeCompletion=true",
      "failed: unblockedAfterCompletion=false",
    ];
    const report = buildSubagentReleaseGateReport(
      staticInput({
        artifacts: {
          replayDiagnostics: replayArtifact(),
          callableWorkflowDogfood: artifact,
          callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
          lifecycleEdges: lifecycleEdgeArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Callable workflow dogfood maturity assertion workflow_parent_blocking_completion status is failed; expected passed.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Callable workflow dogfood maturity assertion workflow_parent_blocking_completion must record only passed evidence entries.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Callable workflow dogfood maturity assertion workflow_denied_child_scope is missing.",
    );
  });

  it("fails when callable workflow rehydration omits or fails maturity assertions", () => {
    const artifact = callableWorkflowRehydrationArtifact();
    delete artifact.maturityAssertions.workflow_rehydrated_child_provenance;
    artifact.maturityAssertions.workflow_rehydrated_progress_usage.status = "failed";
    artifact.maturityAssertions.workflow_rehydrated_progress_usage.evidence = ["passed: progressEvents=4", "failed: tokens=0"];
    const report = buildSubagentReleaseGateReport(
      staticInput({
        artifacts: {
          replayDiagnostics: replayArtifact(),
          callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
          callableWorkflowRehydration: artifact,
          lifecycleEdges: lifecycleEdgeArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage status is failed; expected passed.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage must record only passed evidence entries.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Callable workflow rehydration maturity assertion workflow_rehydrated_child_provenance is missing.",
    );
  });

  it("renders a markdown report with check rows", () => {
    const markdown = renderSubagentReleaseGateMarkdown(buildSubagentReleaseGateReport(staticInput()));

    expect(markdown).toContain("# Sub-Agent Release Gate");
    expect(markdown).toContain("- Maturity history required: no");
    expect(markdown).toContain("- Desktop dogfood maturity history: skipped");
    expect(markdown).toContain("- Workflow jitter release profile: skipped");
    expect(markdown).toContain(
      "- Live evidence skipped: Ambient/Pi smoke, Sub-agent confidence, Child authority confidence, Workflow/Symphony confidence, Broader Workflow/Symphony confidence, Local runtime confidence, Restart repair confidence, Lifecycle edge confidence, Desktop dogfood confidence, Desktop dogfood",
    );
    expect(markdown).toContain("- Ambient/Pi smoke: skipped");
    expect(markdown).toContain("- Child authority confidence: skipped");
    expect(markdown).toContain("- Broader Workflow/Symphony confidence: skipped");
    expect(markdown).toContain("- Local runtime confidence: skipped");
    expect(markdown).toContain("- Desktop dogfood confidence: skipped");
    expect(markdown).toContain("- Desktop dogfood: skipped");
    expect(markdown).toContain("| deterministic replay diagnostics command is registered | passed |");
    expect(markdown).toContain("Live Ambient/Pi sub-agent smoke evidence was skipped");
  });
});
