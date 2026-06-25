import { describe, expect, it } from "vitest";
import {
  buildSubagentReleaseGateLiveHistoryEntry,
  buildSubagentReleaseGateReport,
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
  desktopDogfoodHistoryReport,
  liveHistoryReport,
  workflowJitterReleaseProfileReport,
  liveConfidenceArtifact,
  workflowLiveConfidenceArtifact,
  localRuntimeLiveConfidenceArtifact,
  restartRepairLiveConfidenceArtifact,
  lifecycleEdgeLiveConfidenceArtifact,
} from "./subagent-release-gate-test-fixtures.mjs";

describe("sub-agent release gate maturity history", () => {
  it("passes maturity-history-required mode when repeated Desktop dogfood history is ready", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireLive: true,
        requireMaturityHistory: true,
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
          liveHistoryReport: liveHistoryReport(),
          desktopDogfoodHistory: desktopDogfoodHistoryReport(),
          workflowJitterReleaseGate: workflowJitterReleaseProfileReport(),
        },
      }),
    );

    expect(report.status).toBe("passed");
    expect(report.policy.requireMaturityHistory).toBe(true);
    expect(report.releaseDecision.liveHistoryReportSkipped).toBe(false);
    expect(report.releaseDecision.desktopDogfoodHistorySkipped).toBe(false);
    expect(report.releaseDecision.workflowJitterReleaseProfileSkipped).toBe(false);
    expect(subagentReleaseGatePassed(report, { requireLive: true, requireMaturityHistory: true })).toBe(true);
  });

  it("fails maturity-history-required mode when live history report evidence is missing", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireMaturityHistory: true,
        artifacts: {
          desktopDogfoodHistory: desktopDogfoodHistoryReport(),
          workflowJitterReleaseGate: workflowJitterReleaseProfileReport(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Sub-agent live history report is required for maturity history but missing.");
  });

  it("fails maturity-history-required mode when live history report uses smoke thresholds", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireMaturityHistory: true,
        artifacts: {
          liveHistoryReport: {
            ...liveHistoryReport(),
            criteria: {
              ...liveHistoryReport().criteria,
              minLiveDogfoodRuns: 1,
              maxLiveDogfoodFailureRate: 0.5,
            },
          },
          desktopDogfoodHistory: desktopDogfoodHistoryReport(),
          workflowJitterReleaseGate: workflowJitterReleaseProfileReport(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Sub-agent live history report criteria.minLiveDogfoodRuns is 1; expected at least 25 for graduation.",
        "Sub-agent live history report criteria.maxLiveDogfoodFailureRate is 0.5; expected at most 0.05 for graduation.",
      ]),
    );
  });

  it("fails maturity-history-required mode when live history report omits required lanes", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireMaturityHistory: true,
        artifacts: {
          liveHistoryReport: {
            ...liveHistoryReport(),
            summary: {
              ...liveHistoryReport().summary,
              evidenceLanes: liveHistoryReport().summary.evidenceLanes.filter((lane) => lane.label !== "Desktop dogfood"),
            },
            latestRequiredRuns: [],
          },
          desktopDogfoodHistory: desktopDogfoodHistoryReport(),
          workflowJitterReleaseGate: workflowJitterReleaseProfileReport(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Sub-agent live history report is missing evidence lane Desktop dogfood.",
        "Sub-agent live history report is missing latestRequiredRuns.",
      ]),
    );
  });

  it("fails maturity-history-required mode when workflow jitter release-profile evidence is missing", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireMaturityHistory: true,
        artifacts: {
          liveHistoryReport: liveHistoryReport(),
          desktopDogfoodHistory: desktopDogfoodHistoryReport(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Workflow jitter release-profile evidence is required for maturity history but missing.",
    );
  });

  it("fails maturity-history-required mode when workflow jitter release-profile evidence is not strict release coverage", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireMaturityHistory: true,
        artifacts: {
          liveHistoryReport: liveHistoryReport(),
          desktopDogfoodHistory: desktopDogfoodHistoryReport(),
          workflowJitterReleaseGate: {
            ...workflowJitterReleaseProfileReport(),
            releaseDecision: {
              ...workflowJitterReleaseProfileReport().releaseDecision,
              releaseProfile: false,
            },
            matrix: {
              ...workflowJitterReleaseProfileReport().matrix,
              profile: "phase8-smoke",
              liveDogfoodRunCount: 4,
              liveFamilies: ["browser"],
            },
          },
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Workflow jitter release-profile decision releaseProfile must be true.",
        "Workflow jitter release-profile matrix profile is phase8-smoke; expected release.",
        "Workflow jitter release-profile has 4 live UI dogfood run(s); expected at least 10.",
        "Workflow jitter release-profile is missing passed live family coverage: connector.",
      ]),
    );
  });

  it("fails maturity-history-required mode when repeated Desktop dogfood history is missing", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireMaturityHistory: true,
        artifacts: {
          liveHistoryReport: liveHistoryReport(),
          workflowJitterReleaseGate: workflowJitterReleaseProfileReport(),
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining(["Repeated Desktop dogfood maturity history is required but missing."]),
    );
  });

  it("fails maturity-history-required mode when repeated Desktop dogfood history omits required coverage detail", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireMaturityHistory: true,
        artifacts: {
          liveHistoryReport: liveHistoryReport(),
          desktopDogfoodHistory: {
            ...desktopDogfoodHistoryReport(),
            summary: {
              ...desktopDogfoodHistoryReport().summary,
              requiredScenarioCoverage: [],
              readyRowsWithCompleteVisuals: 24,
              screenshotRunCount: 24,
            },
            latestRuns: [],
            gates: desktopDogfoodHistoryReport().gates.filter((gate) => gate.id !== "required_scenario_coverage"),
          },
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Desktop dogfood history report has 24/25 ready rows with complete visual assertions.",
        "Desktop dogfood history report has 24/25 ready rows with screenshot evidence.",
        "Desktop dogfood history report is missing scenario coverage for seeded_visible_child_cluster.",
        "Desktop dogfood history report is missing gate required_scenario_coverage.",
        "Desktop dogfood history report is missing latestRuns.",
      ]),
    );
  });

  it("fails maturity-history-required mode when repeated Desktop dogfood history uses smoke thresholds", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireMaturityHistory: true,
        artifacts: {
          liveHistoryReport: liveHistoryReport(),
          desktopDogfoodHistory: {
            ...desktopDogfoodHistoryReport(),
            criteria: {
              ...desktopDogfoodHistoryReport().criteria,
              minDesktopDogfoodRuns: 1,
              minWorkflowHighLoadReadyRuns: 1,
            },
          },
        },
      }),
    );

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Desktop dogfood history report criteria.minDesktopDogfoodRuns is 1; expected at least 25 for graduation.",
        "Desktop dogfood history report criteria.minWorkflowHighLoadReadyRuns is 1; expected at least 25 for graduation.",
      ]),
    );
  });

  it("treats malformed repeated Desktop dogfood history as advisory unless maturity history is required", () => {
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
          desktopDogfoodHistory: {
            ...desktopDogfoodHistoryReport(),
            status: "blocked",
            ready: false,
            blockedGateIds: ["workflow_high_load_repetition"],
          },
        },
      }),
    );

    expect(report.status).toBe("passed_with_advisories");
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toEqual(
      expect.arrayContaining([
        "Desktop dogfood history report status is blocked; expected ready_to_graduate.",
        "Desktop dogfood history report ready must be true.",
        "Desktop dogfood history report has blocked gates: workflow_high_load_repetition.",
      ]),
    );
  });

  it("summarizes required-live release gate runs as append-only history rows", () => {
    const report = buildSubagentReleaseGateReport(
      staticInput({
        requireLive: true,
        startedAt: "2026-06-12T05:00:00.000Z",
        completedAt: "2026-06-12T05:12:30.000Z",
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

    expect(
      buildSubagentReleaseGateLiveHistoryEntry(report, {
        reportPath: "test-results/subagent-release-gate/latest.json",
      }),
    ).toMatchObject({
      schemaVersion: "ambient-subagent-release-gate-live-history-v1",
      runId: "2026-06-12T05-12-30.000Z",
      reportPath: "test-results/subagent-release-gate/latest.json",
      status: "passed",
      ready: true,
      liveRequired: true,
      startedAt: "2026-06-12T05:00:00.000Z",
      completedAt: "2026-06-12T05:12:30.000Z",
      durationMs: 750000,
      checkCounts: { passed: 150 },
      liveEvidence: {
        "Ambient/Pi smoke": "present",
        "Sub-agent confidence": "present",
        "Child authority confidence": "present",
        "Workflow/Symphony confidence": "present",
        "Broader Workflow/Symphony confidence": "present",
        "Local runtime confidence": "present",
        "Restart repair confidence": "present",
        "Lifecycle edge confidence": "present",
        "Desktop dogfood confidence": "present",
        "Desktop dogfood": "present",
      },
      skippedLiveEvidence: [],
      blockingIssueCount: 0,
      advisoryIssueCount: 0,
    });
  });

  it("fails when the live history report omits JSONL parsing", () => {
    const input = staticInput();
    input.files.subagentLiveHistoryReportRunnerLib = input.files.subagentLiveHistoryReportRunnerLib.replace(
      "parseSubagentLiveHistoryJsonl",
      "parseSubagentHistoryText",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "live history report turns required-live JSONL rows into graduation evidence is missing source anchor: parseSubagentLiveHistoryJsonl",
    );
  });

  it("fails when the live history report omits Markdown output", () => {
    const input = staticInput();
    input.files.subagentLiveHistoryReportRunnerLib = input.files.subagentLiveHistoryReportRunnerLib.replace(
      "renderSubagentLiveHistoryReportMarkdown",
      "renderSubagentHistoryReport",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "live history report turns required-live JSONL rows into graduation evidence is missing source anchor: renderSubagentLiveHistoryReportMarkdown",
    );
  });

  it("fails when the Desktop dogfood history report omits append-only JSONL accounting", () => {
    const input = staticInput();
    input.files.subagentDesktopDogfoodHistoryReportRunnerLib = input.files.subagentDesktopDogfoodHistoryReportRunnerLib.replace(
      "parseSubagentDesktopDogfoodHistoryJsonl",
      "parseDesktopDogfoodHistoryText",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood history report turns full-app latest artifacts into repeated visual dogfood evidence is missing source anchor: parseSubagentDesktopDogfoodHistoryJsonl",
    );
  });

  it("does not pass required-live helper checks when any live evidence category is skipped", () => {
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
    const inconsistentReport = {
      ...report,
      status: "passed",
      releaseDecision: {
        ...report.releaseDecision,
        ready: true,
        liveWorkflowConfidenceSkipped: true,
      },
    };

    expect(subagentReleaseGatePassed(inconsistentReport, { requireLive: true })).toBe(false);
  });
});
