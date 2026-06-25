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

describe("sub-agent release gate live confidence evidence", () => {
  it("fails required-live mode when live evidence is missing", () => {
    const report = buildSubagentReleaseGateReport(staticInput({ requireLive: true }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live Ambient/Pi sub-agent smoke evidence is required but missing.");
    expect(report.releaseDecision.blockingIssues).toContain("Child authority live confidence evidence is required but missing.");
    expect(report.releaseDecision.blockingIssues).toContain("Workflow/Symphony live confidence evidence is required but missing.");
    expect(report.releaseDecision.blockingIssues).toContain("Broader Workflow/Symphony live confidence evidence is required but missing.");
    expect(report.releaseDecision.blockingIssues).toContain("Local runtime live confidence evidence is required but missing.");
    expect(report.releaseDecision.blockingIssues).toContain("Restart repair live confidence evidence is required but missing.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood confidence evidence is required but missing.");
    expect(report.releaseDecision.blockingIssues).toContain("Automated Desktop dogfood evidence is required but missing.");
  });

  it("fails required-live mode when workflow confidence is replaced by a generic live-confidence slice", () => {
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
          liveWorkflowConfidence: liveConfidenceArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Live confidence artifact sliceKind is pi_tool_prompt; expected workflow_symphony.",
    );
  });

  it("fails required-live mode when broader workflow confidence uses the baseline slice", () => {
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
          liveWorkflowBroaderConfidence: workflowLiveConfidenceArtifact(),
          liveLocalRuntimeConfidence: localRuntimeLiveConfidenceArtifact(),
          liveRestartRepairConfidence: restartRepairLiveConfidenceArtifact(),
          liveLifecycleEdgeConfidence: lifecycleEdgeLiveConfidenceArtifact(),
          desktopDogfood: desktopDogfoodArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Live confidence artifact sliceKind is workflow_symphony; expected workflow_symphony_broader.",
    );
  });

  it("fails required-live mode when workflow confidence omits a required maturity assertion", () => {
    const artifact = workflowLiveConfidenceArtifact();
    artifact.maturityAssertions = artifact.maturityAssertions.filter((assertion) => assertion.id !== "child_mutating_workflow");
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
          liveWorkflowConfidence: artifact,
          liveLocalRuntimeConfidence: localRuntimeLiveConfidenceArtifact(),
          liveRestartRepairConfidence: restartRepairLiveConfidenceArtifact(),
          liveLifecycleEdgeConfidence: lifecycleEdgeLiveConfidenceArtifact(),
          desktopDogfood: desktopDogfoodArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence maturity assertion child_mutating_workflow is missing.");
  });

  it("fails required-live mode when local runtime confidence is replaced by a generic live-confidence slice", () => {
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
          liveLocalRuntimeConfidence: liveConfidenceArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Live confidence artifact sliceKind is pi_tool_prompt; expected local_runtime.",
    );
  });

  it("fails required-live mode when local runtime confidence omits a required maturity assertion", () => {
    const artifact = localRuntimeLiveConfidenceArtifact();
    artifact.maturityAssertions = artifact.maturityAssertions.filter((assertion) => assertion.id !== "local_runtime_untracked_safety");
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
          liveLocalRuntimeConfidence: artifact,
          liveRestartRepairConfidence: restartRepairLiveConfidenceArtifact(),
          liveLifecycleEdgeConfidence: lifecycleEdgeLiveConfidenceArtifact(),
          desktopDogfood: desktopDogfoodArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Live confidence maturity assertion local_runtime_untracked_safety is missing.",
    );
  });

  it("fails required-live mode when restart repair confidence is replaced by a generic live-confidence slice", () => {
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
          liveRestartRepairConfidence: liveConfidenceArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Live confidence artifact sliceKind is pi_tool_prompt; expected restart_repair.",
    );
  });

  it("fails required-live mode when restart repair confidence omits a required maturity assertion", () => {
    const artifact = restartRepairLiveConfidenceArtifact();
    artifact.maturityAssertions = artifact.maturityAssertions.filter((assertion) => assertion.id !== "restart_repair_mailbox_rehydration");
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
          liveRestartRepairConfidence: artifact,
          liveLifecycleEdgeConfidence: lifecycleEdgeLiveConfidenceArtifact(),
          desktopDogfood: desktopDogfoodArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Live confidence maturity assertion restart_repair_mailbox_rehydration is missing.",
    );
  });

  it("fails required-live mode when lifecycle edge confidence omits a required maturity assertion", () => {
    const artifact = lifecycleEdgeLiveConfidenceArtifact();
    artifact.maturityAssertions = artifact.maturityAssertions.filter((assertion) => assertion.id !== "lifecycle_edge_partial_result");
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
          liveLifecycleEdgeConfidence: artifact,
          desktopDogfood: desktopDogfoodArtifact(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence maturity assertion lifecycle_edge_partial_result is missing.");
  });

  it("fails required-live mode when live smoke artifact omits streamed child output", () => {
    const artifact = liveArtifact();
    artifact.run.runtimeEvents = artifact.run.runtimeEvents.filter((event) => event.type !== "assistant_delta");
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireLive: true,
        artifacts: {
          replayDiagnostics: replayArtifact(),
          callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
          callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
          lifecycleEdges: lifecycleEdgeArtifact(),
          liveSmoke: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live smoke artifact is missing child assistant_delta stream event.");
  });

  it("treats blocked live confidence evidence as advisory rather than release-usable", () => {
    const artifact = liveConfidenceArtifact();
    artifact.status = "blocked";
    artifact.classifiedBlockers = [
      {
        kind: "network",
        summary: "Live GMI smoke stalled before the first child result.",
        classifiedAsEnvironmental: true,
      },
    ];
    artifact.closeoutAnswer = {
      kind: "blocked",
      summary: "I was blocked by a live GMI smoke stall before the first child result.",
    };
    const report = buildSubagentReleaseGateReport(
      staticInput({
        artifacts: {
          replayDiagnostics: replayArtifact(),
          callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
          callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
          lifecycleEdges: lifecycleEdgeArtifact(),
          liveConfidence: artifact,
        },
      }),
    );

    expect(report.status).toBe("passed_with_advisories");
    expect(report.releaseDecision.advisoryIssues).toContain("Live confidence artifact status is blocked; acceptance is advisory_only.");
  });

  it("fails required-live mode when live confidence evidence is blocked", () => {
    const artifact = liveConfidenceArtifact();
    artifact.status = "blocked";
    artifact.classifiedBlockers = [
      {
        kind: "network",
        summary: "Live GMI smoke exceeded the configured timeout.",
        classifiedAsEnvironmental: true,
      },
    ];
    artifact.closeoutAnswer = {
      kind: "blocked",
      summary: "I was blocked by a live GMI smoke timeout.",
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
          liveConfidence: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence artifact status is blocked; acceptance is advisory_only.");
  });

  it("fails required-live mode when live confidence omits the try-it-yourself closeout", () => {
    const artifact = liveConfidenceArtifact();
    delete artifact.closeoutAnswer;
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireLive: true,
        artifacts: {
          replayDiagnostics: replayArtifact(),
          callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
          callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
          lifecycleEdges: lifecycleEdgeArtifact(),
          liveSmoke: liveArtifact(),
          liveConfidence: artifact,
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Live confidence artifact closeoutAnswer.kind is missing.",
        "Live confidence artifact closeoutAnswer.summary is missing.",
      ]),
    );
  });
});
