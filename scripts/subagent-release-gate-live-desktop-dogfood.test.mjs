import { describe, expect, it } from "vitest";
import { buildSubagentReleaseGateReport, subagentReleaseGatePassed } from "./subagent-release-gate-lib.mjs";
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

describe("sub-agent release gate Desktop dogfood live evidence", () => {
  it("fails required-live mode when Desktop dogfood visual proof reports overlap", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.checks.narrow.criticalOverlapCount = 1;
    artifact.visualAssertions.layout_safety.status = "failed";
    artifact.visualAssertions.layout_safety.evidence = [
      "passed: collapsed desktop view has no horizontal overflow",
      "failed: narrow view has no critical overlap",
    ];
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood narrow view reports 1 critical overlaps.");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood visual assertion layout_safety status is failed; expected passed.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood visual assertion layout_safety must record only passed evidence entries.",
    );
  });

  it("fails required-live mode when Desktop dogfood omits semantic visual assertions", () => {
    const artifact = desktopDogfoodArtifact();
    delete artifact.visualAssertions.workflow_task_continuity;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood visual assertion workflow_task_continuity is missing.");
  });

  it("fails required-live mode when Desktop dogfood omits maturity assertions", () => {
    const artifact = desktopDogfoodArtifact();
    delete artifact.maturityAssertions.desktop_local_runtime_ownership;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood maturity assertion desktop_local_runtime_ownership is missing.",
    );
  });

  it("fails required-live mode when Desktop dogfood maturity assertion records failed evidence", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.maturityAssertions.desktop_workflow_execution.status = "failed";
    artifact.maturityAssertions.desktop_workflow_execution.evidence = [
      "passed: workflow task id is captured",
      "failed: workflow parent blocker remains visible",
    ];
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood maturity assertion desktop_workflow_execution status is failed; expected passed.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood maturity assertion desktop_workflow_execution must record only passed evidence entries.",
    );
  });

  it("fails required-live mode when Desktop dogfood omits approval parent-blocking proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = ["seeded_visible_child_cluster"];
    delete artifact.checks.expanded.approvalFlow;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact must include approval_parent_blocking scenario evidence.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood expanded state is missing approvalFlow proof.");
  });

  it("fails required-live mode when Desktop dogfood omits denied-scope explanation proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = artifact.scenarios.filter((scenario) => scenario !== "denied_scope_explanation_behavior");
    delete artifact.deniedScopeParentMailboxEventId;
    delete artifact.deniedScopeChildRunId;
    delete artifact.deniedScopeChildThreadId;
    delete artifact.artifacts.deniedScopeExplanationDesktopScreenshot;
    delete artifact.checks.deniedScopeExplanation;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact must include denied_scope_explanation_behavior scenario evidence.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing deniedScopeParentMailboxEventId.");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact deniedScopeExplanationDesktopScreenshot must be a safe relative path.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing deniedScopeExplanation proof.");
  });

  it("fails required-live mode when Desktop dogfood omits operator control proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = [
      "seeded_visible_child_cluster",
      "approval_parent_blocking",
      "workflow_execution_parent_blocking",
      "mutating_worker_dogfood_behavior",
      "workflow_high_load_dogfood",
      "denied_scope_explanation_behavior",
      "approval_forwarding_behavior",
      "restart_rehydration_behavior",
      "local_runtime_ownership_ui",
      "operator_control_behavior",
    ];
    delete artifact.cancelControlChildRunId;
    delete artifact.checks.expanded.operatorControls;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact must include operator_child_controls scenario evidence.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing cancelControlChildRunId.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood expanded state is missing operatorControls proof.");
  });

  it("fails required-live mode when Desktop dogfood omits operator behavior proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = [
      "seeded_visible_child_cluster",
      "approval_parent_blocking",
      "workflow_execution_parent_blocking",
      "mutating_worker_dogfood_behavior",
      "workflow_high_load_dogfood",
      "denied_scope_explanation_behavior",
      "approval_forwarding_behavior",
      "restart_rehydration_behavior",
      "local_runtime_ownership_ui",
      "operator_child_controls",
    ];
    delete artifact.artifacts.operatorBehaviorDesktopScreenshot;
    delete artifact.checks.operatorBehavior;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact must include operator_control_behavior scenario evidence.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact operatorBehaviorDesktopScreenshot must be a safe relative path.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing operatorBehavior proof.");
  });

  it("fails required-live mode when Desktop dogfood cancel behavior omits the typed barrier consequence", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.checks.operatorBehavior = {
      ...artifact.checks.operatorBehavior,
      typedBarrierConsequenceVisible: false,
    };
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood operatorBehavior typedBarrierConsequenceVisible is not true.");
  });

  it("fails required-live mode when Desktop dogfood omits approval forwarding proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = [
      "seeded_visible_child_cluster",
      "approval_parent_blocking",
      "workflow_execution_parent_blocking",
      "restart_rehydration_behavior",
      "local_runtime_ownership_ui",
      "operator_child_controls",
      "operator_control_behavior",
    ];
    delete artifact.artifacts.approvalDialogScreenshot;
    delete artifact.artifacts.approvalForwardingDesktopScreenshot;
    delete artifact.checks.approvalForwarding;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact must include approval_forwarding_behavior scenario evidence.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact approvalDialogScreenshot must be a safe relative path.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact approvalForwardingDesktopScreenshot must be a safe relative path.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing approvalForwarding proof.");
  });

  it("fails required-live mode when Desktop dogfood omits restart rehydration proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = [
      "seeded_visible_child_cluster",
      "approval_parent_blocking",
      "workflow_execution_parent_blocking",
      "approval_forwarding_behavior",
      "local_runtime_ownership_ui",
      "operator_child_controls",
      "operator_control_behavior",
    ];
    delete artifact.artifacts.restartRehydrationDesktopScreenshot;
    delete artifact.checks.restartRehydration;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact must include restart_rehydration_behavior scenario evidence.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact restartRehydrationDesktopScreenshot must be a safe relative path.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing restartRehydration proof.");
  });

  it("fails required-live mode when Desktop dogfood omits local runtime ownership proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = [
      "seeded_visible_child_cluster",
      "approval_parent_blocking",
      "workflow_execution_parent_blocking",
      "approval_forwarding_behavior",
      "restart_rehydration_behavior",
      "operator_child_controls",
      "operator_control_behavior",
    ];
    delete artifact.artifacts.localRuntimeOwnershipDesktopScreenshot;
    delete artifact.checks.localRuntimeOwnership;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact must include local_runtime_ownership_ui scenario evidence.",
    );
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact localRuntimeOwnershipDesktopScreenshot must be a safe relative path.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing localRuntimeOwnership proof.");
  });

  it("fails required-live mode when Desktop dogfood omits workflow execution proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = [
      "seeded_visible_child_cluster",
      "approval_parent_blocking",
      "approval_forwarding_behavior",
      "restart_rehydration_behavior",
      "local_runtime_ownership_ui",
      "operator_child_controls",
      "operator_control_behavior",
    ];
    delete artifact.workflowTaskId;
    delete artifact.artifacts.workflowExecutionDesktopScreenshot;
    delete artifact.checks.workflowExecution;
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
          desktopDogfood: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact must include workflow_execution_parent_blocking scenario evidence.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing workflowTaskId.");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood artifact workflowExecutionDesktopScreenshot must be a safe relative path.",
    );
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing workflowExecution proof.");
  });
});
