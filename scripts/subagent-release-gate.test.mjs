import { describe, expect, it } from "vitest";
import {
  buildSubagentReleaseGateLiveHistoryEntry,
  buildSubagentReleaseGateReport,
  renderSubagentReleaseGateMarkdown,
  subagentReleaseGatePassed,
} from "./subagent-release-gate-lib.mjs";
import {
  REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS,
} from "./subagent-live-history-report-lib.mjs";
import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";

describe("sub-agent release gate", () => {
  it("passes the deterministic gate with a skipped-live advisory", () => {
    const report = buildSubagentReleaseGateReport(staticInput());

    expect(report.status).toBe("passed_with_advisories");
    expect(subagentReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toContain("Live Ambient/Pi sub-agent smoke evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Sub-agent live confidence evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Child authority live confidence evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Workflow/Symphony live confidence evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Broader Workflow/Symphony live confidence evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Local runtime live confidence evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Restart repair live confidence evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Lifecycle edge confidence evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Desktop dogfood confidence evidence was skipped for this deterministic gate run.");
    expect(report.releaseDecision.advisoryIssues).toContain("Automated Desktop dogfood evidence was skipped for this deterministic gate run.");
  });

  it("passes cleanly when required live evidence is present", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("passed");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(true);
  });

  it("passes maturity-history-required mode when repeated Desktop dogfood history is ready", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("passed");
    expect(report.policy.requireMaturityHistory).toBe(true);
    expect(report.releaseDecision.liveHistoryReportSkipped).toBe(false);
    expect(report.releaseDecision.desktopDogfoodHistorySkipped).toBe(false);
    expect(report.releaseDecision.workflowJitterReleaseProfileSkipped).toBe(false);
    expect(subagentReleaseGatePassed(report, { requireLive: true, requireMaturityHistory: true })).toBe(true);
  });

  it("fails maturity-history-required mode when live history report evidence is missing", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
      requireMaturityHistory: true,
      artifacts: {
        desktopDogfoodHistory: desktopDogfoodHistoryReport(),
        workflowJitterReleaseGate: workflowJitterReleaseProfileReport(),
      },
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Sub-agent live history report is required for maturity history but missing.",
    );
  });

  it("fails maturity-history-required mode when live history report uses smoke thresholds", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Sub-agent live history report criteria.minLiveDogfoodRuns is 1; expected at least 25 for graduation.",
      "Sub-agent live history report criteria.maxLiveDogfoodFailureRate is 0.5; expected at most 0.05 for graduation.",
    ]));
  });

  it("fails maturity-history-required mode when live history report omits required lanes", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Sub-agent live history report is missing evidence lane Desktop dogfood.",
      "Sub-agent live history report is missing latestRequiredRuns.",
    ]));
  });

  it("fails maturity-history-required mode when workflow jitter release-profile evidence is missing", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
      requireMaturityHistory: true,
      artifacts: {
        liveHistoryReport: liveHistoryReport(),
        desktopDogfoodHistory: desktopDogfoodHistoryReport(),
      },
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Workflow jitter release-profile evidence is required for maturity history but missing.",
    );
  });

  it("fails maturity-history-required mode when workflow jitter release-profile evidence is not strict release coverage", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Workflow jitter release-profile decision releaseProfile must be true.",
      "Workflow jitter release-profile matrix profile is phase8-smoke; expected release.",
      "Workflow jitter release-profile has 4 live UI dogfood run(s); expected at least 10.",
      "Workflow jitter release-profile is missing passed live family coverage: connector.",
    ]));
  });

  it("fails maturity-history-required mode when repeated Desktop dogfood history is missing", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
      requireMaturityHistory: true,
      artifacts: {
        liveHistoryReport: liveHistoryReport(),
        workflowJitterReleaseGate: workflowJitterReleaseProfileReport(),
      },
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Repeated Desktop dogfood maturity history is required but missing.",
    ]));
  });

  it("fails maturity-history-required mode when repeated Desktop dogfood history omits required coverage detail", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Desktop dogfood history report has 24/25 ready rows with complete visual assertions.",
      "Desktop dogfood history report has 24/25 ready rows with screenshot evidence.",
      "Desktop dogfood history report is missing scenario coverage for seeded_visible_child_cluster.",
      "Desktop dogfood history report is missing gate required_scenario_coverage.",
      "Desktop dogfood history report is missing latestRuns.",
    ]));
  });

  it("fails maturity-history-required mode when repeated Desktop dogfood history uses smoke thresholds", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireMaturityHistory: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Desktop dogfood history report criteria.minDesktopDogfoodRuns is 1; expected at least 25 for graduation.",
      "Desktop dogfood history report criteria.minWorkflowHighLoadReadyRuns is 1; expected at least 25 for graduation.",
    ]));
  });

  it("treats malformed repeated Desktop dogfood history as advisory unless maturity history is required", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("passed_with_advisories");
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toEqual(expect.arrayContaining([
      "Desktop dogfood history report status is blocked; expected ready_to_graduate.",
      "Desktop dogfood history report ready must be true.",
      "Desktop dogfood history report has blocked gates: workflow_high_load_repetition.",
    ]));
  });

  it("summarizes required-live release gate runs as append-only history rows", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(buildSubagentReleaseGateLiveHistoryEntry(report, {
      reportPath: "test-results/subagent-release-gate/latest.json",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-release-gate-live-history-v1",
      runId: "2026-06-12T05-12-30.000Z",
      reportPath: "test-results/subagent-release-gate/latest.json",
      status: "passed",
      ready: true,
      liveRequired: true,
      startedAt: "2026-06-12T05:00:00.000Z",
      completedAt: "2026-06-12T05:12:30.000Z",
      durationMs: 750000,
      checkCounts: { passed: 149 },
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
    input.files.subagentLiveHistoryReportRunnerLib = input.files.subagentLiveHistoryReportRunnerLib.replace("parseSubagentLiveHistoryJsonl", "parseSubagentHistoryText");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "live history report turns required-live JSONL rows into graduation evidence is missing source anchor: parseSubagentLiveHistoryJsonl",
    );
  });

  it("fails when the live history report omits Markdown output", () => {
    const input = staticInput();
    input.files.subagentLiveHistoryReportRunnerLib = input.files.subagentLiveHistoryReportRunnerLib.replace("renderSubagentLiveHistoryReportMarkdown", "renderSubagentHistoryReport");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "live history report turns required-live JSONL rows into graduation evidence is missing source anchor: renderSubagentLiveHistoryReportMarkdown",
    );
  });

  it("fails when the Desktop dogfood history report omits append-only JSONL accounting", () => {
    const input = staticInput();
    input.files.subagentDesktopDogfoodHistoryReportRunnerLib = input.files.subagentDesktopDogfoodHistoryReportRunnerLib.replace("parseSubagentDesktopDogfoodHistoryJsonl", "parseDesktopDogfoodHistoryText");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Desktop dogfood history report turns full-app latest artifacts into repeated visual dogfood evidence is missing source anchor: parseSubagentDesktopDogfoodHistoryJsonl",
    );
  });

  it("does not pass required-live helper checks when any live evidence category is skipped", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));
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

  it("fails when a required package script is missing", () => {
    const input = staticInput();
    delete input.packageJson.scripts["test:subagents:release-gate"];

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Missing package script test:subagents:release-gate.");
  });

  it("fails when the callable workflow dogfood proof artifact is missing", () => {
    const input = staticInput();
    delete input.artifacts.callableWorkflowDogfood;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Run pnpm run test:callable-workflow-dogfood:proof before the release gate.");
  });

  it("fails when the callable workflow rehydration proof artifact is missing", () => {
    const input = staticInput();
    delete input.artifacts.callableWorkflowRehydration;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Run pnpm run test:callable-workflow-rehydration:proof before the release gate.");
  });

  it("fails when the lifecycle edge proof artifact is missing", () => {
    const input = staticInput();
    delete input.artifacts.lifecycleEdges;

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Run pnpm run test:subagents:lifecycle-edges:proof before the release gate.");
  });

  it("fails when the deterministic release suite omits core contract tests", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:deterministic"] = input.packageJson.scripts["test:subagents:deterministic"].replace(
      "src/main/subagents/subagentHardening.test.ts ",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Deterministic sub-agent suite is missing src/main/subagents/subagentHardening.test.ts.",
    ]));
  });

  it("fails when the deterministic release suite omits finalization blocking helpers", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:deterministic"] = input.packageJson.scripts["test:subagents:deterministic"].replace(
      "src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts ",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Deterministic sub-agent suite is missing src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts.",
    ]));
  });

  it("fails when the deterministic release suite omits Desktop dogfood runner unit tests", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:deterministic"] = input.packageJson.scripts["test:subagents:deterministic"]
      .replace("scripts/subagent-desktop-dogfood.test.mjs ", "")
      .replace("scripts/subagent-desktop-dogfood-repeat.test.mjs", "");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Deterministic sub-agent suite is missing scripts/subagent-desktop-dogfood.test.mjs.",
      "Deterministic sub-agent suite is missing scripts/subagent-desktop-dogfood-repeat.test.mjs.",
    ]));
  });

  it("fails when release gates bypass the deterministic sub-agent suite", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate"] = "node scripts/subagent-release-gate.mjs";

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:subagents:release-gate must run pnpm run test:subagents:deterministic.",
    ]));
  });

  it("fails when the deterministic release gate omits local runtime control proof", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate"] = input.packageJson.scripts["test:subagents:release-gate"].replace(
      " && pnpm run test:local-runtime-control:proof",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:subagents:release-gate must run pnpm run test:local-runtime-control:proof.",
    ]));
  });

  it("fails when the live-required release gate omits Desktop dogfood", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:live"] = input.packageJson.scripts["test:subagents:release-gate:live"].replace(
      " && pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:subagents:release-gate:live must run pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked.",
      "test:subagents:release-gate:live must run Desktop dogfood directly or through pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked.",
    ]));
  });

  it("fails when the live-required release gate omits a live confidence lane", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:live"] = input.packageJson.scripts["test:subagents:release-gate:live"].replace(
      " && pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:subagents:release-gate:live must run pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked.",
    ]));
  });

  it("fails when the graduation release gate omits ready Desktop dogfood history", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:graduation"] = input.packageJson.scripts["test:subagents:release-gate:graduation"].replace(
      " && pnpm run test:subagents:desktop-dogfood-repeat -- --require-ready",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:subagents:release-gate:graduation must run pnpm run test:subagents:desktop-dogfood-repeat -- --require-ready.",
    ]));
  });

  it("fails when the graduation release gate omits workflow jitter release-profile evidence", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:graduation"] = input.packageJson.scripts["test:subagents:release-gate:graduation"].replace(
      " && pnpm run test:workflow-jitter-release-gate:release-profile",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:subagents:release-gate:graduation must run pnpm run test:workflow-jitter-release-gate:release-profile.",
    ]));
  });

  it("fails when workflow jitter release-profile command can skip writing the gate artifact", () => {
    const input = staticInput();
    input.packageJson.scripts["test:workflow-jitter-release-gate:release-profile"] =
      "pnpm run test:workflow-jitter-matrix:release-profile && node scripts/workflow-jitter-release-gate.mjs --release-profile";

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:workflow-jitter-release-gate:release-profile must use scripts/workflow-jitter-release-profile-gate.mjs so the release gate writes an artifact even when the matrix blocks.",
    ]));
  });

  it("fails when the graduation release gate omits ready live history accounting", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:graduation"] = input.packageJson.scripts["test:subagents:release-gate:graduation"].replace(
      " && pnpm run subagents:live-history-report -- --require-ready",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:subagents:release-gate:graduation must run pnpm run subagents:live-history-report -- --require-ready.",
    ]));
  });

  it("fails when the graduation release gate omits maturity-history enforcement", () => {
    const input = staticInput();
    input.packageJson.scripts["test:subagents:release-gate:graduation"] = input.packageJson.scripts["test:subagents:release-gate:graduation"].replace(
      " --require-maturity-history",
      "",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "test:subagents:release-gate:graduation must run the release gate with --require-live and --require-maturity-history.",
    ]));
  });

  it("fails when the Desktop dogfood repeat runner omits history thresholds", () => {
    const input = staticInput();
    input.files.subagentDesktopDogfoodRepeatRunnerLib = input.files.subagentDesktopDogfoodRepeatRunnerLib.replace(
      "--min-desktop-dogfood-runs=",
      "--desktop-runs=",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Desktop dogfood repeat runner builds graduation-ready full-app history is missing source anchor: --min-desktop-dogfood-runs=",
    ]));
  });

  it("fails when threat-model coverage anchors are missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replaceAll("stale approvals", "old approval requests");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "threat-model regressions cover the planned security cases is missing source anchor: stale approvals",
    ]));
  });

  it("fails when secret-shaped source id threat coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replace("secret-shaped source ids", "secret source identifiers");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "threat-model regressions cover the planned security cases is missing source anchor: secret-shaped source ids",
    ]));
  });

  it("fails when non-callable source visibility coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replace("non-callable source types", "loaded source types");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "threat-model regressions cover the planned security cases is missing source anchor: non-callable source types",
    ]));
  });

  it("fails when the maturity evaluator omits completion guard visibility", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("completion_guard_visibility", "guard_visibility");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("completion_guard_visibility", "guard_visibility");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: completion_guard_visibility",
    ]));
  });

  it("fails when the maturity evaluator omits live dogfood history failure rate", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("live_dogfood_failure_rate", "live_dogfood_flake_rate");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("live_dogfood_failure_rate", "live_dogfood_flake_rate");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: live_dogfood_failure_rate",
    ]));
  });

  it("fails when the maturity evaluator cannot derive dogfood volume from release history", () => {
    const input = staticInput();
    input.files.subagentMaturity = input.files.subagentMaturity.replace("summarizeSubagentReleaseGateLiveHistory", "summarizeSubagentDogfoodNotes");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: summarizeSubagentReleaseGateLiveHistory",
    ]));
  });

  it("fails when the maturity evaluator omits approval routing visibility", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("approval_routing_visibility", "approval_visibility");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("approval_routing_visibility", "approval_visibility");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: approval_routing_visibility",
    ]));
  });

  it("fails when the maturity evaluator omits production UI visibility", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("production_ui_visibility", "production_visibility");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("production_ui_visibility", "production_visibility");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: production_ui_visibility",
    ]));
  });

  it("fails when the maturity evaluator omits event attribution integrity", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("event_attribution_integrity", "event_attribution");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("event_attribution_integrity", "event_attribution");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: event_attribution_integrity",
    ]));
  });

  it("fails when the maturity evaluator omits lifecycle control integrity", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("lifecycle_control_integrity", "lifecycle_control");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("lifecycle_control_integrity", "lifecycle_control");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: lifecycle_control_integrity",
    ]));
  });

  it("fails when the maturity evaluator omits retention policy integrity", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("retention_policy_integrity", "retention_integrity");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("retention_policy_integrity", "retention_integrity");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: retention_policy_integrity",
    ]));
  });

  it("fails when the maturity evaluator omits tool scope integrity", () => {
    const input = staticInput();
    input.files.sharedSubagentMaturity = input.files.sharedSubagentMaturity.replace("tool_scope_integrity", "tool_scope_proof");
    input.files.subagentMaturity = input.files.subagentMaturity.replace("tool_scope_integrity", "tool_scope_proof");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "maturity evaluator encodes graduation gates is missing source anchor: tool_scope_integrity",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentCompletionGuardVisibilityEvidence",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentApprovalRoutingVisibilityEvidence",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentProductionUiVisibilityEvidence",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentEventAttributionIntegrityEvidence",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentLifecycleControlIntegrityEvidence",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentRetentionPolicyIntegrityEvidence",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "reviewed maturity evidence covers restart, workflow jitter release profile, guard visibility, approval routing, production UI, event attribution, lifecycle control, retention, tool scope, bug, and security signoff is missing source anchor: recordSubagentToolScopeIntegrityEvidence",
    ]));
  });

  it("fails when broad MCP and connector source coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replace("broad MCP and connector grants", "broad tool grants");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "threat-model regressions cover the planned security cases is missing source anchor: broad MCP and connector grants",
    ]));
  });

  it("fails when idempotency contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentIdempotencyTest = input.files.subagentIdempotencyTest
      .replace("fingerprints undefined payload fields deterministically", "covers payload fingerprints")
      .replace("ignores malformed idempotency previews when replaying retried operations", "covers malformed replay previews");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "idempotency contracts cover retry-safe child operations is missing source anchor: fingerprints undefined payload fields deterministically",
      "idempotency contracts cover retry-safe child operations is missing source anchor: ignores malformed idempotency previews when replaying retried operations",
    ]));
  });

  it("fails when retention cleanup stops honoring role defaults", () => {
    const input = staticInput();
    input.files.subagentRetention = input.files.subagentRetention.replace("parent_thread_active", "retention_window_active");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "retention cleanup preserves transcripts and honors role defaults is missing source anchor: parent_thread_active",
    ]));
  });

  it("fails when retention policy maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when retention policy integrity evidence omits a required surface",
      "blocks graduation when retention policy evidence is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent retention policy is proven before maturity is missing source anchor: blocks graduation when retention policy integrity evidence omits a required surface",
    ]));
  });

  it("fails when retention cap cleanup evidence is missing", () => {
    const input = staticInput();
    input.files.subagentRetentionTest = input.files.subagentRetentionTest.replace(
      "collapses oldest completed eligible children when the per-parent retention cap is exceeded",
      "collapses completed eligible children when capacity is exceeded",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent retention policy is proven before maturity is missing source anchor: collapses oldest completed eligible children when the per-parent retention cap is exceeded",
    ]));
  });

  it("fails when summary-retained child UI evidence is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "surfaces summary-retained children without open or control affordances",
      "surfaces retained children without open affordances",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent retention policy is proven before maturity is missing source anchor: surfaces summary-retained children without open or control affordances",
    ]));
  });

  it("fails when tool scope maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when tool scope integrity evidence omits a required surface",
      "blocks graduation when tool scope evidence is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent tool scope is proven before maturity is missing source anchor: blocks graduation when tool scope integrity evidence omits a required surface",
    ]));
  });

  it("fails when production UI visibility maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when production UI visibility evidence omits a required surface",
      "blocks graduation when production UI evidence is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "production UI visibility is proven before maturity is missing source anchor: blocks graduation when production UI visibility evidence omits a required surface",
    ]));
  });

  it("fails when child active tool resolution evidence is missing", () => {
    const input = staticInput();
    input.files.subagentChildActiveToolsTest = input.files.subagentChildActiveToolsTest.replace(
      "does not inherit parent active tools for read-only child scopes",
      "checks child active tools",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent tool scope is proven before maturity is missing source anchor: does not inherit parent active tools for read-only child scopes",
    ]));
  });

  it("fails when tool-scope snapshot diagnostic evidence is missing", () => {
    const input = staticInput();
    input.files.subagentToolScopeSnapshotTest = input.files.subagentToolScopeSnapshotTest.replace(
      "compacts exact launch scope and adds display metadata without dropping deny reasons",
      "compacts launch scope",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent tool scope is proven before maturity is missing source anchor: compacts exact launch scope and adds display metadata without dropping deny reasons",
    ]));
  });

  it("fails when scheduled sub-agent automation deferral is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnFailure = input.files.subagentSpawnFailure.replace("SCHEDULED_SUBAGENT_AUTOMATION_DEFERRED_REASON", "SUBAGENT_SCHEDULE_NOTICE");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "scheduled sub-agents are deferred to automations and cannot inherit live parent context is missing source anchor: SCHEDULED_SUBAGENT_AUTOMATION_DEFERRED_REASON",
    ]));
  });

  it("fails when spawn failure contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnFailure = input.files.subagentSpawnFailure.replace(
      "buildSubagentPostReservationSpawnFailureParentMailboxInput",
      "buildPostReservationMailbox",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "spawn_agent failure paths use typed parent mailbox evidence is missing source anchor: buildSubagentPostReservationSpawnFailureParentMailboxInput",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "spawn_agent success paths use typed task mailbox and run-event evidence is missing source anchor: buildSubagentTaskMailboxEventInput",
    ]));
  });

  it("fails when spawn pre-run planner coverage is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnPreRunPlanner = input.files.subagentSpawnPreRunPlanner.replace(
      "resolveSubagentSpawnPreRunPlan",
      "resolveSpawnPlan",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "spawn_agent pre-run planning is typed and test-covered is missing source anchor: resolveSubagentSpawnPreRunPlan",
    ]));
  });

  it("fails when Pi tool input parser coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolInput = input.files.subagentPiToolInput.replace(
      "resolveSubagentPiToolWaitTimeoutMs",
      "resolveWaitTimeout",
    );
    input.files.subagentPiToolInputTest = input.files.subagentPiToolInputTest.replace(
      "clamps wait timeouts to the bounded Pi-visible wait contract",
      "checks wait timeouts",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Pi parent sub-agent tool input parsing is typed, bounded, and test-covered is missing source anchor: resolveSubagentPiToolWaitTimeoutMs",
      "Pi parent sub-agent tool input parsing is typed, bounded, and test-covered is missing source anchor: clamps wait timeouts to the bounded Pi-visible wait contract",
    ]));
  });

  it("fails when Pi tool result compaction coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolResult = input.files.subagentPiToolResult.replace(
      "compactSubagentPiToolRunEvent",
      "compactRunEvent",
    );
    input.files.subagentPiToolResultTest = input.files.subagentPiToolResultTest.replace(
      "compacts run events with bounded handles and optional preview/artifact fields",
      "compacts run events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Pi parent sub-agent tool results stay compact and artifact-handle oriented is missing source anchor: compactSubagentPiToolRunEvent",
      "Pi parent sub-agent tool results stay compact and artifact-handle oriented is missing source anchor: compacts run events with bounded handles and optional preview/artifact fields",
    ]));
  });

  it("fails when spawn preflight resolver coverage is missing", () => {
    const input = staticInput();
    input.files.subagentSpawnPreflightResolver = input.files.subagentSpawnPreflightResolver.replace(
      "resolveSubagentSpawnCapacityLease",
      "resolveSpawnCapacity",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "spawn_agent runtime preflight and capacity leases are typed and test-covered is missing source anchor: resolveSubagentSpawnCapacityLease",
    ]));
  });

  it("fails when observability attribution validation is missing", () => {
    const input = staticInput();
    input.files.subagentObservability = input.files.subagentObservability.replace(
      "validateSubagentObservabilityEventAttribution",
      "childRunAttributionRequired",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: validateSubagentObservabilityEventAttribution",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: validates parent synthesis safety and large output artifact backing",
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: summarizes spawn, wait, usage, memory, idle, batch, and restart observability",
    ]));
  });

  it("fails when durable child event attribution validation is missing", () => {
    const input = staticInput();
    input.files.subagentInvariants = input.files.subagentInvariants.replace(
      "validateSubagentRunEventAttribution",
      "validateRuntimeEventPreview",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: validateSubagentRunEventAttribution",
    ]));
  });

  it("fails when diagnostic attribution audit coverage is missing", () => {
    const input = staticInput();
    input.files.diagnostics = input.files.diagnostics.replace(
      "createSubagentAttributionAudit",
      "createSubagentDiagnosticsSummary",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: createSubagentAttributionAudit",
    ]));
  });

  it("fails when diagnostic replay evidence coverage is missing", () => {
    const input = staticInput();
    input.files.diagnostics = input.files.diagnostics.replace(
      "createSubagentDiagnosticReplayEvidence",
      "createSubagentEventSummary",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: createSubagentDiagnosticReplayEvidence",
    ]));
  });

  it("fails when sub-agent abort and attention observability coverage is missing", () => {
    const input = staticInput();
    input.files.diagnosticsTest = input.files.diagnosticsTest.replace(
      "childRuntimeAborts: 1 groupedCompletions: 1 needsAttentionRequests: 1",
      "groupedCompletions: 1",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: childRuntimeAborts: 1",
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: needsAttentionRequests: 1",
    ]));
  });

  it("fails when child-idle observability export coverage is missing", () => {
    const input = staticInput();
    input.files.diagnostics = input.files.diagnostics.replace("childIdleOpenRunCount", "openChildRunCount");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostic observability export preserves child idle metrics is missing source anchor: childIdleOpenRunCount",
    ]));
  });

  it("fails when diagnostic replay evidence inspector coverage is missing", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModel = input.files.subagentReplayEvidenceUiModel.replace(
      "subagentReplayEvidenceInspectorModel",
      "subagentReplayRows",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: subagentReplayEvidenceInspectorModel",
    ]));
  });

  it("fails when diagnostic replay provenance inspector coverage is missing", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModelTest = input.files.subagentReplayEvidenceUiModelTest.replace(
      "approval Permission Grant (approval-worker)",
      "approval approval-worker",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: approval Permission Grant (approval-worker)",
    ]));
  });

  it("fails when diagnostic replay parent mailbox inspector coverage is missing", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModelTest = input.files.subagentReplayEvidenceUiModelTest.replace(
      "Parent mailbox events",
      "Parent events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: Parent mailbox events",
    ]));
  });

  it("fails when callable workflow replay inspector coverage is missing", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModel = input.files.subagentReplayEvidenceUiModel.replace(
      "callableWorkflowRows",
      "workflowRows",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: callableWorkflowRows",
    ]));
  });

  it("fails when completion guard child inspector evidence is missing from release coverage", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModelTest = input.files.subagentThreadInspectorUiModelTest.replace(
      "shows blocked completion guard evidence in child thread wait details",
      "shows blocked child wait details",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "completion guard blockers are visible and replayable before maturity is missing source anchor: shows blocked completion guard evidence in child thread wait details",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "completion guard blockers are visible and replayable before maturity is missing source anchor: Blocking: completion guard",
    ]));
  });

  it("fails when completion guard replay evidence is missing from release coverage", () => {
    const input = staticInput();
    input.files.subagentReplayEvidenceUiModelTest = input.files.subagentReplayEvidenceUiModelTest.replace(
      "completion guard blocked / mutation evidence structured 1 / Ambient 1 / isolated worktree 1 / approval 0",
      "mutation evidence summarized",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "completion guard blockers are visible and replayable before maturity is missing source anchor: completion guard blocked / mutation evidence structured 1 / Ambient 1 / isolated worktree 1 / approval 0",
    ]));
  });

  it("fails when completion guard diagnostic history search coverage is missing", () => {
    const input = staticInput();
    input.files.diagnosticExportHistoryUiModelTest = input.files.diagnosticExportHistoryUiModelTest.replace(
      "diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain(\"completion guard\")",
      "diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain(\"subagent\")",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "completion guard blockers are visible and replayable before maturity is missing source anchor: diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain(\"completion guard\")",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: function SubagentReplayEvidenceDiagnostics",
    ]));
  });

  it("fails when diagnostic export history coverage is missing", () => {
    const input = staticInput();
    input.files.diagnosticExportHistoryUiModelTest = input.files.diagnosticExportHistoryUiModelTest.replace(
      "records recent diagnostic exports newest first with stable de-duping",
      "records recent diagnostic exports",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: records recent diagnostic exports newest first with stable de-duping",
    ]));
  });

  it("fails when diagnostic export history replay provenance coverage is missing", () => {
    const input = staticInput();
    input.files.diagnosticExportHistoryUiModelTest = input.files.diagnosticExportHistoryUiModelTest.replace(
      "approvalId: \"approval-worker\"",
      "approvalId: \"other-approval\"",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostic export history preserves replay provenance across restarts is missing source anchor: approvalId: \"approval-worker\"",
    ]));
  });

  it("fails when diagnostic export result omits replay evidence for the renderer", () => {
    const input = staticInput();
    input.files.mainIndex = input.files.mainIndex.replace(
      "defaultPayload.bundle.subagents.replayEvidence",
      "defaultPayload.bundle.summary.subagents.replayEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "replay evidence inspector makes diagnostic timelines inspectable is missing source anchor: defaultPayload.bundle.subagents.replayEvidence",
    ]));
  });

  it("fails when store-boundary child attribution coverage is missing", () => {
    const input = staticInput();
    input.files.projectStoreSubagentFoundationTest = input.files.projectStoreSubagentFoundationTest.replace(
      "rejects persisted child runtime and parent mailbox events without exact child attribution",
      "covers child runtime event attribution",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "diagnostics export covers observability, replay evidence, and restart repair evidence is missing source anchor: rejects persisted child runtime and parent mailbox events without exact child attribution",
    ]));
  });

  it("fails when child runtime large-output artifact enforcement is missing", () => {
    const input = staticInput();
    input.files.piEventMapper = input.files.piEventMapper.replace(
      "validatePiChildRuntimeEventLargeOutputArtifact",
      "clipPiChildRuntimeEventPreview",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Pi child event mapper preserves attribution, previews, and artifacts is missing source anchor: validatePiChildRuntimeEventLargeOutputArtifact",
    ]));
  });

  it("fails when child runtime event persistence does not use mapped previews", () => {
    const input = staticInput();
    input.files.subagentRuntimeEventPersistence = input.files.subagentRuntimeEventPersistence.replace(
      "appendMappedSubagentRuntimeEvent",
      "appendRawSubagentRuntimeEvent",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Pi child event mapper preserves attribution, previews, and artifacts is missing source anchor: appendMappedSubagentRuntimeEvent",
    ]));
  });

  it("fails when child runtime event persistence coverage is missing", () => {
    const input = staticInput();
    input.files.subagentRuntimeEventPersistenceTest = input.files.subagentRuntimeEventPersistenceTest.replace(
      "persists mapped child runtime events with run-event attribution and artifact paths",
      "persists mapped child runtime events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Pi child event mapper preserves attribution, previews, and artifacts is missing source anchor: persists mapped child runtime events with run-event attribution and artifact paths",
    ]));
  });

  it("fails when compact child runtime update provenance coverage is missing", () => {
    const input = staticInput();
    input.files.piEventMapper = input.files.piEventMapper.replace("approvalSource", "approval_kind");
    input.files.piEventMapperTest = input.files.piEventMapperTest.replace("approvalSource", "approval_kind");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Pi child event mapper preserves attribution, previews, and artifacts is missing source anchor: approvalSource",
    ]));
  });

  it("fails when persistent memory prompt snapshots are not explicit", () => {
    const input = staticInput();
    input.files.subagentPromptRuntime = input.files.subagentPromptRuntime.replace(
      "persistent_memory_disabled_by_default",
      "memory_boundary",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Pi child prompts filter parent context and restate follow-up result contracts is missing source anchor: persistent_memory_disabled_by_default",
    ]));
  });

  it("fails when child mailbox request contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMailboxRequest = input.files.subagentMailboxRequest.replace(
      "resolveSubagentChildMailboxRequest",
      "resolveQueuedChildMessage",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "send_agent and followup_agent use a typed child mailbox request contract is missing source anchor: resolveSubagentChildMailboxRequest",
    ]));
  });

  it("fails when child mailbox delivery state coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMailbox = input.files.subagentMailbox.replace(
      "deliverQueuedParentToChildMailboxEvents",
      "deliverQueuedMailbox",
    );
    input.files.subagentMailboxTest = input.files.subagentMailboxTest.replace(
      "consumes delivered events and cancels pending parent-to-child events without touching terminal mailbox state",
      "checks mailbox transitions",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "parent-to-child mailbox delivery transitions are typed and idempotent is missing source anchor: deliverQueuedParentToChildMailboxEvents",
      "parent-to-child mailbox delivery transitions are typed and idempotent is missing source anchor: consumes delivered events and cancels pending parent-to-child events without touching terminal mailbox state",
    ]));
  });

  it("fails when child status discovery contract coverage is missing", () => {
    const input = staticInput();
    input.files.subagentAgentStatus = input.files.subagentAgentStatus.replace(
      "buildSubagentListAgentsText",
      "formatAgentListText",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "list_agents and status_agent use typed child discovery summaries is missing source anchor: buildSubagentListAgentsText",
    ]));
  });

  it("fails when parent-stop cascade mailbox coverage is missing", () => {
    const input = staticInput();
    input.files.projectStoreSubagentFoundationTest = input.files.projectStoreSubagentFoundationTest.replace("pending mailbox work", "queued child messages");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "parent-stop cascade cancels dependent child mailbox work is missing source anchor: cascades a stopped parent run across dependent child runs, wait barriers, and pending mailbox work",
    ]));
  });

  it("fails when parent mailbox anchoring coverage is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "creates a parent cluster for anchored batch progress without child runs",
      "shows batch progress beside existing child runs",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "parent mailbox failures stay anchored to visible parent messages is missing source anchor: creates a parent cluster for anchored batch progress without child runs",
    ]));
  });

  it("fails when lifecycle parent mailbox payload coverage is missing", () => {
    const input = staticInput();
    input.files.subagentLifecycleParentMailboxTest = input.files.subagentLifecycleParentMailboxTest.replace(
      "builds child-attributed lifecycle interruption payloads for direct stops and runtime budgets",
      "builds lifecycle interruption payloads",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "parent mailbox failures stay anchored to visible parent messages is missing source anchor: builds child-attributed lifecycle interruption payloads for direct stops and runtime budgets",
    ]));
  });

  it("fails when the batch exactly-once ledger validator is missing", () => {
    const input = staticInput();
    input.files.subagentBatchJobs = input.files.subagentBatchJobs.replace("validateSubagentBatchResultLedgerExactlyOnce", "validateSubagentBatchLedger");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "batch/fanout result reporting is typed and exactly-once before launch is missing source anchor: validateSubagentBatchResultLedgerExactlyOnce",
    ]));
  });

  it("fails when parent finalization-block mailbox coverage is missing", () => {
    const input = staticInput();
    input.files.agentRuntimeTest = input.files.agentRuntimeTest.replace(
      "blocks parent finalization while required sub-agent wait barriers are unresolved",
      "blocks parent finalization with a generic error",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "parent mailbox failures stay anchored to visible parent messages is missing source anchor: blocks parent finalization while required sub-agent wait barriers are unresolved",
    ]));
  });

  it("fails when finalization blocking helper mailbox coverage is missing", () => {
    const input = staticInput();
    input.files.agentRuntimeFinalizationBlockingTest = input.files.agentRuntimeFinalizationBlockingTest.replace(
      "records subagent finalization mailbox events with policy payloads",
      "records subagent finalization mailbox events generically",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "parent mailbox failures stay anchored to visible parent messages is missing source anchor: records subagent finalization mailbox events with policy payloads",
    ]));
  });

  it("fails when close capacity guard coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolsTest = input.files.subagentPiToolsTest.replace(
      "refuses to close actively executing children before releasing capacity",
      "closes active children",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "close_agent releases capacity only for inactive children is missing source anchor: refuses to close actively executing children before releasing capacity",
    ]));
  });

  it("fails when lifecycle hook transcript and artifact pointer coverage is missing", () => {
    const input = staticInput();
    input.files.subagentLifecycleHooksTest = input.files.subagentLifecycleHooksTest.replace(
      "records stop artifact pointers and final status without copying result content",
      "records stop artifacts",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "lifecycle hooks preserve transcript refs and bounded artifact pointers is missing source anchor: records stop artifact pointers and final status without copying result content",
    ]));
  });

  it("fails when lifecycle control maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when lifecycle control integrity evidence omits a required surface",
      "blocks graduation when lifecycle controls are incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent lifecycle controls are proven before maturity is missing source anchor: blocks graduation when lifecycle control integrity evidence omits a required surface",
    ]));
  });

  it("fails when lifecycle close retention coverage is missing from maturity evidence", () => {
    const input = staticInput();
    input.files.subagentCloseAgentExecutorTest = input.files.subagentCloseAgentExecutorTest.replace(
      "records close requests, releases capacity, and writes a retained-history child message",
      "records close requests",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent lifecycle controls are proven before maturity is missing source anchor: records close requests, releases capacity, and writes a retained-history child message",
    ]));
  });

  it("fails when lifecycle restart repair coverage is missing from maturity evidence", () => {
    const input = staticInput();
    input.files.subagentStartupReconciliationTest = input.files.subagentStartupReconciliationTest.replace(
      "emits repaired child run, child thread, lifecycle stop, restart event, and wait barrier updates",
      "emits repaired child run",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "sub-agent lifecycle controls are proven before maturity is missing source anchor: emits repaired child run, child thread, lifecycle stop, restart event, and wait barrier updates",
    ]));
  });

  it("fails when child approval bridge wait-resumption coverage is missing", () => {
    const input = staticInput();
    input.files.subagentApprovalBridgeTest = input.files.subagentApprovalBridgeTest.replace(
      "builds child-attributed approval requests that return the parent to a wait barrier",
      "builds child approval requests",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "child approval bridge preserves child identity, scope, and parent wait resumption is missing source anchor: builds child-attributed approval requests that return the parent to a wait barrier",
    ]));
  });

  it("fails when child approval bridge executor coverage is missing", () => {
    const input = staticInput();
    input.files.subagentWaitAgentExecutorTest = input.files.subagentWaitAgentExecutorTest.replace(
      "records child approval requests and leaves the parent blocked on the child wait barrier",
      "records child approval requests",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "child approval bridge preserves child identity, scope, and parent wait resumption is missing source anchor: records child approval requests and leaves the parent blocked on the child wait barrier",
    ]));
  });

  it("fails when child approval bridge response delivery coverage is missing", () => {
    const input = staticInput();
    input.files.subagentApprovalBridgeTest = input.files.subagentApprovalBridgeTest.replace(
      "records approval responses into the child mailbox and parent audit event idempotently",
      "records approval responses",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "child approval bridge preserves child identity, scope, and parent wait resumption is missing source anchor: records approval responses into the child mailbox and parent audit event idempotently",
    ]));
  });

  it("fails when approval routing visibility maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when approval routing visibility evidence omits a required surface",
      "blocks graduation when approval evidence is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "approval routing blockers are visible and scoped before maturity is missing source anchor: blocks graduation when approval routing visibility evidence omits a required surface",
    ]));
  });

  it("fails when approval routing UI visibility coverage is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "labels child approval requests and forwarded decisions in the collapsed cluster",
      "labels child approval events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "approval routing blockers are visible and scoped before maturity is missing source anchor: labels child approval requests and forwarded decisions in the collapsed cluster",
    ]));
  });

  it("fails when approval routing non-interactive failure coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreatModelTest = input.files.subagentThreatModelTest.replace(
      "fails connector access in non-interactive launches instead of creating stale approvals",
      "fails connector access",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "approval routing blockers are visible and scoped before maturity is missing source anchor: fails connector access in non-interactive launches instead of creating stale approvals",
    ]));
  });

  it("fails when event attribution maturity coverage is missing", () => {
    const input = staticInput();
    input.files.subagentMaturityTest = input.files.subagentMaturityTest.replace(
      "blocks graduation when event attribution integrity evidence omits a required surface",
      "blocks graduation when event attribution is incomplete",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "child event attribution is proven before maturity is missing source anchor: blocks graduation when event attribution integrity evidence omits a required surface",
    ]));
  });

  it("fails when compact event attribution coverage is missing", () => {
    const input = staticInput();
    input.files.piEventMapperTest = input.files.piEventMapperTest.replace(
      "builds compact Pi updates that identify the child run for tool, approval, and error attribution",
      "builds compact Pi updates for child runtime events",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "child event attribution is proven before maturity is missing source anchor: builds compact Pi updates that identify the child run for tool, approval, and error attribution",
    ]));
  });

  it("fails when event attribution replay diagnostics coverage is missing", () => {
    const input = staticInput();
    input.files.diagnostics = input.files.diagnostics.replace("createSubagentAttributionAudit", "createSubagentAudit");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "child event attribution is proven before maturity is missing source anchor: createSubagentAttributionAudit",
    ]));
  });

  it("fails when aggregate wait-barrier synthesis coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolsTest = input.files.subagentPiToolsTest.replace("creates Pi-reachable aggregate wait barriers with explicit quorum thresholds", "creates hidden aggregate wait barriers");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "wait barriers aggregate child synthesis safety by dependency mode is missing source anchor: creates Pi-reachable aggregate wait barriers with explicit quorum thresholds",
    ]));
  });

  it("fails when worker mutation completion guard enforcement is missing", () => {
    const input = staticInput();
    input.files.subagentCompletionGuard = input.files.subagentCompletionGuard.replace(
      "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
      "Implementation roles require mutation evidence.",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "worker mutation completion guard requires worktree isolation and approval provenance is missing source anchor: Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
    ]));
  });

  it("fails when worker mutation completion guard tests are missing", () => {
    const input = staticInput();
    input.files.subagentCompletionGuardTest = input.files.subagentCompletionGuardTest.replace(
      "rejects isolated worker mutation evidence without approval provenance",
      "accepts isolated worker mutation evidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "worker mutation completion guard requires worktree isolation and approval provenance is missing source anchor: rejects isolated worker mutation evidence without approval provenance",
    ]));
  });

  it("fails when child worktree preparation coverage is missing", () => {
    const input = staticInput();
    input.files.subagentChildWorktreePreparer = input.files.subagentChildWorktreePreparer.replace(
      "prepareSubagentChildWorktreeForLaunch",
      "prepareChildWorktree",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "worker mutation completion guard requires worktree isolation and approval provenance is missing source anchor: prepareSubagentChildWorktreeForLaunch",
    ]));
  });

  it("fails when target resolver coverage is missing", () => {
    const input = staticInput();
    input.files.subagentTargetResolver = input.files.subagentTargetResolver.replace(
      "ambient-subagent-target-resolver-v1",
      "ambient-subagent-target-resolver",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "path-addressed sub-agent target resolution is parent-bounded and test-covered is missing source anchor: ambient-subagent-target-resolver-v1",
    ]));
  });

  it("fails when wait-barrier UI coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModelTest = input.files.subagentThreadInspectorUiModelTest.replace("shows quorum thresholds and synthesis counts in child thread wait details", "shows generic child wait details");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: shows quorum thresholds and synthesis counts in child thread wait details",
    ]));
  });

  it("fails when child inspector memory-policy coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModel = input.files.subagentThreadInspectorUiModel.replace("memoryPolicyLabel", "rolePolicyLabel");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: memoryPolicyLabel",
    ]));
  });

  it("fails when child inspector retention-policy coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModel = input.files.subagentThreadInspectorUiModel.replace("retentionPolicyLabel", "cleanupPolicyLabel");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: retentionPolicyLabel",
    ]));
  });

  it("fails when child inspector worktree evidence coverage is missing", () => {
    const input = staticInput();
    input.files.subagentThreadInspectorUiModelTest = input.files.subagentThreadInspectorUiModelTest.replace(
      "shows prepared child worktree details from the launch snapshot",
      "shows child worktree summary",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: shows prepared child worktree details from the launch snapshot",
    ]));
  });

  it("fails when parent mailbox child-source label coverage is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "surfaces child-source labels for approval and lifecycle mailbox activity",
      "surfaces mailbox activity labels",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: surfaces child-source labels for approval and lifecycle mailbox activity",
    ]));
  });

  it("fails when callable workflow blocker UI coverage is missing", () => {
    const input = staticInput();
    input.files.subagentParentClusterUiModelTest = input.files.subagentParentClusterUiModelTest.replace(
      "creates a parent cluster for anchored blocking workflow tasks without child runs",
      "creates parent clusters for workflow tasks",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "wait barrier UI surfaces aggregate quorum and synthesis state is missing source anchor: creates a parent cluster for anchored blocking workflow tasks without child runs",
    ]));
  });

  it("fails when callable workflow dogfood parent-blocking proof is missing", () => {
    const input = staticInput();
    input.files.callableWorkflowDogfoodEvidence = input.files.callableWorkflowDogfoodEvidence.replace(
      "blockedBeforeCompletion",
      "blockedBeforeDone",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "callable workflow dogfood evidence proves child mutating workflow, parent blocking, denied scope, and restart repair is missing source anchor: blockedBeforeCompletion",
    ]));
  });

  it("fails when optional-background live smoke coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolLiveSmoke = input.files.subagentPiToolLiveSmoke.replace(
      "SUBAGENT_OPTIONAL_BACKGROUND_DONE",
      "SUBAGENT_BACKGROUND_DONE",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "live Ambient/Pi smoke test exercises visible child sessions is missing source anchor: SUBAGENT_OPTIONAL_BACKGROUND_DONE",
    ]));
  });

  it("fails when live tool-denial smoke coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolLiveSmoke = input.files.subagentPiToolLiveSmoke.replace(
      "SUBAGENT_TOOL_DENIAL_LIVE_DONE",
      "SUBAGENT_DENIAL_DONE",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "live Ambient/Pi smoke test exercises visible child sessions is missing source anchor: SUBAGENT_TOOL_DENIAL_LIVE_DONE",
    ]));
  });

  it("fails when live restart reconciliation smoke coverage is missing", () => {
    const input = staticInput();
    input.files.subagentPiToolLiveSmoke = input.files.subagentPiToolLiveSmoke.replace(
      "recordSubagentRestartRecoveryEvidence",
      "recordRestartEvidence",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "live Ambient/Pi smoke test exercises visible child sessions is missing source anchor: recordSubagentRestartRecoveryEvidence",
    ]));
  });

  it("fails when local text runtime policy coverage is missing", () => {
    const input = staticInput();
    input.files.localTextDelegationTest = input.files.localTextDelegationTest.replace("unloads idle local model runtimes before acquiring when memory policy requires cleanup", "cleans up extra local runtimes");

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "local text sub-agents enforce local runtime lifecycle, memory, and invocation limits is missing source anchor: unloads idle local model runtimes before acquiring when memory policy requires cleanup",
    ]));
  });

  it("fails when local text startup runtime coverage is missing", () => {
    const input = staticInput();
    input.files.localTextSubagentStartupConfigTest = input.files.localTextSubagentStartupConfigTest.replace(
      "builds an available local text profile and runtime descriptor from startup env",
      "builds local text startup settings",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "local text sub-agents enforce local runtime lifecycle, memory, and invocation limits is missing source anchor: builds an available local text profile and runtime descriptor from startup env",
    ]));
  });

  it("fails when local runtime lifecycle ownership coverage is missing", () => {
    const input = staticInput();
    input.files.agentRuntimeLocalRuntimeToolsTest = input.files.agentRuntimeLocalRuntimeToolsTest.replace(
      "runs provider-declared Start, Stop, and Restart for voice runtime rows",
      "runs provider-declared lifecycle commands for voice runtime rows",
    );

    const report = buildSubagentReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "local runtime lifecycle tools honor sub-agent ownership leases is missing source anchor: runs provider-declared Start, Stop, and Restart for voice runtime rows",
    ]));
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
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Replay evidence must include a parentMailboxTimeline.",
      "Replay evidence must include parent mailbox event counts.",
    ]));
  });

  it("fails when callable workflow dogfood omits or fails maturity assertions", () => {
    const artifact = callableWorkflowDogfoodArtifact();
    delete artifact.maturityAssertions.workflow_denied_child_scope;
    artifact.maturityAssertions.workflow_parent_blocking_completion.status = "failed";
    artifact.maturityAssertions.workflow_parent_blocking_completion.evidence = [
      "passed: blockedBeforeCompletion=true",
      "failed: unblockedAfterCompletion=false",
    ];
    const report = buildSubagentReleaseGateReport(staticInput({
      artifacts: {
        replayDiagnostics: replayArtifact(),
        callableWorkflowDogfood: artifact,
        callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
        lifecycleEdges: lifecycleEdgeArtifact(),
      },
    }));

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
    artifact.maturityAssertions.workflow_rehydrated_progress_usage.evidence = [
      "passed: progressEvents=4",
      "failed: tokens=0",
    ];
    const report = buildSubagentReleaseGateReport(staticInput({
      artifacts: {
        replayDiagnostics: replayArtifact(),
        callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydration: artifact,
        lifecycleEdges: lifecycleEdgeArtifact(),
      },
    }));

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

  it("fails required-live mode when Desktop dogfood visual proof reports overlap", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.checks.narrow.criticalOverlapCount = 1;
    artifact.visualAssertions.layout_safety.status = "failed";
    artifact.visualAssertions.layout_safety.evidence = [
      "passed: collapsed desktop view has no horizontal overflow",
      "failed: narrow view has no critical overlap",
    ];
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood narrow view reports 1 critical overlaps.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood visual assertion layout_safety status is failed; expected passed.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood visual assertion layout_safety must record only passed evidence entries.");
  });

  it("fails required-live mode when Desktop dogfood omits semantic visual assertions", () => {
    const artifact = desktopDogfoodArtifact();
    delete artifact.visualAssertions.workflow_task_continuity;
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood visual assertion workflow_task_continuity is missing.");
  });

  it("fails required-live mode when Desktop dogfood omits maturity assertions", () => {
    const artifact = desktopDogfoodArtifact();
    delete artifact.maturityAssertions.desktop_local_runtime_ownership;
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood maturity assertion desktop_local_runtime_ownership is missing.");
  });

  it("fails required-live mode when Desktop dogfood maturity assertion records failed evidence", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.maturityAssertions.desktop_workflow_execution.status = "failed";
    artifact.maturityAssertions.desktop_workflow_execution.evidence = [
      "passed: workflow task id is captured",
      "failed: workflow parent blocker remains visible",
    ];
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood maturity assertion desktop_workflow_execution status is failed; expected passed.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood maturity assertion desktop_workflow_execution must record only passed evidence entries.");
  });

  it("fails required-live mode when Desktop dogfood omits approval parent-blocking proof", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.scenarios = ["seeded_visible_child_cluster"];
    delete artifact.checks.expanded.approvalFlow;
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact must include approval_parent_blocking scenario evidence.");
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
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact must include denied_scope_explanation_behavior scenario evidence.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing deniedScopeParentMailboxEventId.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact deniedScopeExplanationDesktopScreenshot must be a safe relative path.");
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
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact must include operator_child_controls scenario evidence.");
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
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact must include operator_control_behavior scenario evidence.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact operatorBehaviorDesktopScreenshot must be a safe relative path.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing operatorBehavior proof.");
  });

  it("fails required-live mode when Desktop dogfood cancel behavior omits the typed barrier consequence", () => {
    const artifact = desktopDogfoodArtifact();
    artifact.checks.operatorBehavior = {
      ...artifact.checks.operatorBehavior,
      typedBarrierConsequenceVisible: false,
    };
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

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
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact must include approval_forwarding_behavior scenario evidence.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact approvalDialogScreenshot must be a safe relative path.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact approvalForwardingDesktopScreenshot must be a safe relative path.");
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
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact must include restart_rehydration_behavior scenario evidence.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact restartRehydrationDesktopScreenshot must be a safe relative path.");
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
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact must include local_runtime_ownership_ui scenario evidence.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact localRuntimeOwnershipDesktopScreenshot must be a safe relative path.");
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
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact must include workflow_execution_parent_blocking scenario evidence.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing workflowTaskId.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact workflowExecutionDesktopScreenshot must be a safe relative path.");
    expect(report.releaseDecision.blockingIssues).toContain("Desktop dogfood artifact is missing workflowExecution proof.");
  });

  it("fails required-live mode when workflow confidence is replaced by a generic live-confidence slice", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence artifact sliceKind is pi_tool_prompt; expected workflow_symphony.");
  });

  it("fails required-live mode when broader workflow confidence uses the baseline slice", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence artifact sliceKind is workflow_symphony; expected workflow_symphony_broader.");
  });

  it("fails required-live mode when workflow confidence omits a required maturity assertion", () => {
    const artifact = workflowLiveConfidenceArtifact();
    artifact.maturityAssertions = artifact.maturityAssertions.filter((assertion) => assertion.id !== "child_mutating_workflow");
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence maturity assertion child_mutating_workflow is missing.");
  });

  it("fails required-live mode when local runtime confidence is replaced by a generic live-confidence slice", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence artifact sliceKind is pi_tool_prompt; expected local_runtime.");
  });

  it("fails required-live mode when local runtime confidence omits a required maturity assertion", () => {
    const artifact = localRuntimeLiveConfidenceArtifact();
    artifact.maturityAssertions = artifact.maturityAssertions.filter((assertion) => assertion.id !== "local_runtime_untracked_safety");
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence maturity assertion local_runtime_untracked_safety is missing.");
  });

  it("fails required-live mode when restart repair confidence is replaced by a generic live-confidence slice", () => {
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence artifact sliceKind is pi_tool_prompt; expected restart_repair.");
  });

  it("fails required-live mode when restart repair confidence omits a required maturity assertion", () => {
    const artifact = restartRepairLiveConfidenceArtifact();
    artifact.maturityAssertions = artifact.maturityAssertions.filter((assertion) => assertion.id !== "restart_repair_mailbox_rehydration");
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence maturity assertion restart_repair_mailbox_rehydration is missing.");
  });

  it("fails required-live mode when lifecycle edge confidence omits a required maturity assertion", () => {
    const artifact = lifecycleEdgeLiveConfidenceArtifact();
    artifact.maturityAssertions = artifact.maturityAssertions.filter((assertion) => assertion.id !== "lifecycle_edge_partial_result");
    const report = buildSubagentReleaseGateReport(staticInput({
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
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence maturity assertion lifecycle_edge_partial_result is missing.");
  });

  it("fails required-live mode when live smoke artifact omits streamed child output", () => {
    const artifact = liveArtifact();
    artifact.run.runtimeEvents = artifact.run.runtimeEvents.filter((event) => event.type !== "assistant_delta");
    const report = buildSubagentReleaseGateReport(staticInput({
      requireLive: true,
      artifacts: {
        replayDiagnostics: replayArtifact(),
        callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
        lifecycleEdges: lifecycleEdgeArtifact(),
        liveSmoke: artifact,
      },
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live smoke artifact is missing child assistant_delta stream event.");
  });

  it("treats blocked live confidence evidence as advisory rather than release-usable", () => {
    const artifact = liveConfidenceArtifact();
    artifact.status = "blocked";
    artifact.classifiedBlockers = [{
      kind: "network",
      summary: "Live GMI smoke stalled before the first child result.",
      classifiedAsEnvironmental: true,
    }];
    artifact.closeoutAnswer = {
      kind: "blocked",
      summary: "I was blocked by a live GMI smoke stall before the first child result.",
    };
    const report = buildSubagentReleaseGateReport(staticInput({
      artifacts: {
        replayDiagnostics: replayArtifact(),
        callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
        lifecycleEdges: lifecycleEdgeArtifact(),
        liveConfidence: artifact,
      },
    }));

    expect(report.status).toBe("passed_with_advisories");
    expect(report.releaseDecision.advisoryIssues).toContain("Live confidence artifact status is blocked; acceptance is advisory_only.");
  });

  it("fails required-live mode when live confidence evidence is blocked", () => {
    const artifact = liveConfidenceArtifact();
    artifact.status = "blocked";
    artifact.classifiedBlockers = [{
      kind: "network",
      summary: "Live GMI smoke exceeded the configured timeout.",
      classifiedAsEnvironmental: true,
    }];
    artifact.closeoutAnswer = {
      kind: "blocked",
      summary: "I was blocked by a live GMI smoke timeout.",
    };
    const report = buildSubagentReleaseGateReport(staticInput({
      requireLive: true,
      artifacts: {
        replayDiagnostics: replayArtifact(),
        callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
        lifecycleEdges: lifecycleEdgeArtifact(),
        liveSmoke: liveArtifact(),
        liveConfidence: artifact,
      },
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Live confidence artifact status is blocked; acceptance is advisory_only.");
  });

  it("fails required-live mode when live confidence omits the try-it-yourself closeout", () => {
    const artifact = liveConfidenceArtifact();
    delete artifact.closeoutAnswer;
    const report = buildSubagentReleaseGateReport(staticInput({
      requireLive: true,
      artifacts: {
        replayDiagnostics: replayArtifact(),
        callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
        callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
        lifecycleEdges: lifecycleEdgeArtifact(),
        liveSmoke: liveArtifact(),
        liveConfidence: artifact,
      },
    }));

    expect(report.status).toBe("attention");
    expect(subagentReleaseGatePassed(report, { requireLive: true })).toBe(false);
    expect(report.releaseDecision.blockingIssues).toEqual(expect.arrayContaining([
      "Live confidence artifact closeoutAnswer.kind is missing.",
      "Live confidence artifact closeoutAnswer.summary is missing.",
    ]));
  });

  it("renders a markdown report with check rows", () => {
    const markdown = renderSubagentReleaseGateMarkdown(buildSubagentReleaseGateReport(staticInput()));

    expect(markdown).toContain("# Sub-Agent Release Gate");
    expect(markdown).toContain("- Maturity history required: no");
    expect(markdown).toContain("- Desktop dogfood maturity history: skipped");
    expect(markdown).toContain("- Workflow jitter release profile: skipped");
    expect(markdown).toContain("- Live evidence skipped: Ambient/Pi smoke, Sub-agent confidence, Child authority confidence, Workflow/Symphony confidence, Broader Workflow/Symphony confidence, Local runtime confidence, Restart repair confidence, Lifecycle edge confidence, Desktop dogfood confidence, Desktop dogfood");
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

function staticInput(overrides = {}) {
  const input = {
    packageJson: packageJson(),
    files: files(),
    artifacts: {
      replayDiagnostics: replayArtifact(),
      callableWorkflowDogfood: callableWorkflowDogfoodArtifact(),
      callableWorkflowRehydration: callableWorkflowRehydrationArtifact(),
      lifecycleEdges: lifecycleEdgeArtifact(),
    },
    now: "2026-06-05T01:00:00.000Z",
    startedAt: "2026-06-05T01:00:00.000Z",
    completedAt: "2026-06-05T01:00:01.000Z",
    ...overrides,
  };
  if (input.artifacts?.desktopDogfood && !("liveDesktopDogfoodConfidence" in input.artifacts)) {
    input.artifacts.liveDesktopDogfoodConfidence = desktopDogfoodLiveConfidenceArtifact();
  }
  if (input.artifacts?.desktopDogfood && !("electronDogfoodHarnessManifest" in input.artifacts)) {
    input.artifacts.electronDogfoodHarnessManifest = harnessManifestArtifact("electron_dogfood");
  }
  const hasLiveNodeEvidence = [
    "liveSmoke",
    "liveConfidence",
    "liveAuthorityConfidence",
    "liveWorkflowConfidence",
    "liveWorkflowBroaderConfidence",
  ].some((key) => key in (input.artifacts ?? {}));
  if (hasLiveNodeEvidence && !("liveNodeHarnessManifest" in input.artifacts)) {
    input.artifacts.liveNodeHarnessManifest = harnessManifestArtifact("live_node_test");
  }
  if (input.artifacts?.liveConfidence && !("liveAuthorityConfidence" in input.artifacts)) {
    input.artifacts.liveAuthorityConfidence = childAuthorityLiveConfidenceArtifact();
  }
  if (input.artifacts?.liveWorkflowConfidence && !("liveWorkflowBroaderConfidence" in input.artifacts)) {
    input.artifacts.liveWorkflowBroaderConfidence = workflowBroaderLiveConfidenceArtifact();
  }
  return input;
}

function packageJson() {
  return {
    scripts: {
      "test:subagents:replay-diagnostics": "node scripts/subagent-replay-diagnostics.mjs",
      "test:subagents:replay-diagnostics:unit": "pnpm exec vitest run scripts/subagent-replay-diagnostics.test.mjs",
      "test:callable-workflow-dogfood:proof": "AMBIENT_CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_OUT=test-results/callable-workflow-dogfood/latest.json pnpm exec vitest run src/main/callable-workflow/callableWorkflowDogfoodEvidence.test.ts -t \"builds mutating child workflow dogfood evidence with restart repair proof\"",
      "test:callable-workflow-rehydration:proof": "AMBIENT_CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_OUT=test-results/callable-workflow-rehydration/latest.json pnpm exec vitest run src/main/callable-workflow/callableWorkflowRehydrationEvidence.test.ts -t \"builds restart rehydration evidence for linked task artifacts, runs, progress, and usage\"",
      "test:subagents:lifecycle-edges:proof": "AMBIENT_SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_OUT=test-results/subagent-lifecycle-edges/latest.json pnpm exec vitest run src/main/subagents/subagentLifecycleEdgeEvidence.test.ts -t \"builds lifecycle edge evidence for restart, stop, detach, cancel, retry, timeout, and partial results\"",
      "test:subagents:visual-ui": "pnpm exec vitest run src/renderer/src/SubagentParentCluster.visual.test.tsx",
      "test:subagents:integrated-ui": "pnpm exec vitest run src/renderer/src/SubagentIntegratedProductionUi.visual.test.tsx",
      "test:subagents:deterministic": deterministicSubagentTestScript(),
      "test:subagents:release-gate": "pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof && pnpm run test:subagents:lifecycle-edges:proof && pnpm run test:subagents:live-confidence:unit && pnpm run test:subagents:live-evidence-lanes:unit && pnpm run test:subagents:live-history-report:unit && pnpm run test:subagents:desktop-dogfood-history-report:unit && pnpm run test:local-runtime-control:proof && pnpm run test:subagents:deterministic && node scripts/subagent-release-gate.mjs",
      "test:subagents:release-gate:unit": "pnpm exec vitest run scripts/subagent-release-gate.test.mjs",
      "test:subagents:live-evidence-lanes:unit": "pnpm exec vitest run scripts/subagent-live-evidence-lanes.test.mjs src/shared/subagentLiveEvidenceLanes.test.ts",
      "subagents:live-history-report": "node scripts/subagent-live-history-report.mjs",
      "test:subagents:live-history-report:unit": "pnpm exec vitest run scripts/subagent-live-history-report.test.mjs",
      "subagents:desktop-dogfood-history-report": "node scripts/subagent-desktop-dogfood-history-report.mjs",
      "test:subagents:desktop-dogfood-history-report:unit": "pnpm exec vitest run scripts/subagent-desktop-dogfood-evidence-contract.test.mjs scripts/subagent-desktop-dogfood-history-report.test.mjs",
      "test:local-runtime-control:proof": "node scripts/local-runtime-control-proof-suite.mjs",
      "test:local-runtime-control:proof-gate": "node scripts/local-runtime-control-proof-gate.mjs",
      "test:local-runtime-control:proof-gate:unit": "pnpm exec vitest run scripts/local-runtime-control-proof-gate.test.mjs",
      "test:subagents:live": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts",
      "test:subagents:live:smoke": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts -t \"lets live Pi spawn a visible child thread with runtime events\"",
      "test:subagents:live:authority": "pnpm run test:subagents:live:long-context-authority && pnpm run test:subagents:live:approval-authority && pnpm run test:subagents:live:browser-approval",
      "test:subagents:live:long-context-authority": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts -t \"lets a live child use long_context_process only on granted document roots\"",
      "test:subagents:live:approval-authority": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts -t \"surfaces live child file authority approval requests to the parent\"",
      "test:subagents:live:browser-approval": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_SUBAGENT_LIVE=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentPiToolLiveSmoke.live.test.ts -t \"surfaces live child browser authority approval requests to the parent\"",
      "test:subagents:live-confidence": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs",
      "test:subagents:live-confidence:authority": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs --slice-kind=child_authority",
      "test:subagents:live-confidence:workflow-prereqs": "pnpm run test:workflow-local-file:live && pnpm run test:workflow-ui-dogfood:phase0-live && pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof",
      "test:subagents:live-confidence:workflow": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs --slice-kind=workflow_symphony",
      "test:subagents:live-confidence:workflow-broader-prereqs": "pnpm run test:workflow-local-file:live && pnpm run test:workflow-ui-dogfood:phase1-live:credentialed && pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof",
      "test:subagents:live-confidence:workflow-broader": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs --slice-kind=workflow_symphony_broader",
      "test:subagents:live-confidence:local-runtime": "node scripts/subagent-live-confidence.mjs --slice-kind=local_runtime --provider=local-runtime",
      "test:subagents:live-confidence:restart-repair-prereqs": "pnpm run test:subagents:replay-diagnostics && pnpm run test:subagents:lifecycle-edges:proof",
      "test:subagents:live-confidence:restart-repair": "node scripts/subagent-live-confidence.mjs --slice-kind=restart_repair --provider=replay-diagnostics",
      "test:subagents:live-confidence:lifecycle-edges": "node scripts/subagent-live-confidence.mjs --slice-kind=lifecycle_edges --provider=lifecycle-edge-proof",
      "test:subagents:live-confidence:desktop-dogfood": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-live-confidence.mjs --slice-kind=desktop_dogfood",
      "test:subagents:live-confidence:unit": "pnpm exec vitest run scripts/harness-runtime.test.mjs scripts/subagent-live-confidence.test.mjs",
      "test:subagents:desktop-dogfood": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/run-electron-dogfood.mjs --scenario=subagent-desktop-dogfood",
      "test:subagents:desktop-dogfood:unit": "pnpm exec vitest run scripts/subagent-desktop-dogfood.test.mjs",
      "test:subagents:desktop-dogfood-repeat": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} node scripts/subagent-desktop-dogfood-repeat.mjs",
      "test:subagents:desktop-dogfood-repeat:unit": "pnpm exec vitest run scripts/subagent-desktop-dogfood-repeat.test.mjs",
      "test:subagents:scenario-dogfood": "AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient} AMBIENT_LIVE_MODEL=${AMBIENT_LIVE_MODEL:-moonshotai/kimi-k2.7-code} AMBIENT_SUBAGENT_SCENARIO_DOGFOOD=1 node scripts/run-live-node-test.mjs -- vitest run src/main/subagents/subagentScenarioDogfood.live.test.ts",
      "test:subagents:release-gate:live": "pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof && pnpm run test:subagents:lifecycle-edges:proof && pnpm run test:subagents:live-confidence -- --allow-blocked && pnpm run test:subagents:live-confidence:authority -- --allow-blocked && pnpm run test:subagents:live-confidence:workflow -- --allow-blocked && pnpm run test:subagents:live-confidence:workflow-broader -- --allow-blocked && pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked && pnpm run test:subagents:live-confidence:restart-repair -- --allow-blocked && pnpm run test:subagents:live-confidence:lifecycle-edges -- --allow-blocked && pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked && pnpm run test:subagents:deterministic && node scripts/subagent-release-gate.mjs --require-live",
      "test:subagents:release-gate:graduation": "pnpm run test:callable-workflow-dogfood:proof && pnpm run test:callable-workflow-rehydration:proof && pnpm run test:subagents:lifecycle-edges:proof && pnpm run test:subagents:live-confidence -- --allow-blocked && pnpm run test:subagents:live-confidence:authority -- --allow-blocked && pnpm run test:subagents:live-confidence:workflow -- --allow-blocked && pnpm run test:subagents:live-confidence:workflow-broader -- --allow-blocked && pnpm run test:subagents:live-confidence:local-runtime -- --allow-blocked && pnpm run test:subagents:live-confidence:restart-repair -- --allow-blocked && pnpm run test:subagents:live-confidence:lifecycle-edges -- --allow-blocked && pnpm run test:subagents:live-confidence:desktop-dogfood -- --allow-blocked && pnpm run test:subagents:desktop-dogfood-repeat -- --require-ready && pnpm run test:workflow-jitter-release-gate:release-profile && pnpm run subagents:live-history-report -- --require-ready && pnpm run test:subagents:deterministic && node scripts/subagent-release-gate.mjs --require-live --require-maturity-history",
      "test:workflow-local-file:live": "GMI_CLOUD_API_KEY_FILE=${GMI_CLOUD_API_KEY_FILE:-$(node scripts/resolve-gmi-cloud-key-file.mjs)} AMBIENT_PROVIDER=gmi-cloud AMBIENT_WORKFLOW_LIVE=1 bash scripts/test-node-native.sh src/main/workflow/workflowDogfood.test.ts -t \"local-file report workflow with a live Ambient runtime call\"",
      "test:workflow-ui-dogfood:phase1-live:credentialed": "pnpm run prepare:electron-native && AMBIENT_PROVIDER=gmi-cloud AMBIENT_WORKFLOW_UI_DOGFOOD_USE_SHARED_SNAPSHOT=1 node scripts/workflow-agent-thread-ui-dogfood-matrix.mjs --suite=phase1-live",
      "test:workflow-jitter-matrix:release-profile": "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-jitter-matrix.mjs --profile=release --require-live --promotion-gate --retries=1",
      "test:workflow-jitter-release-gate:release-profile": "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-jitter-release-profile-gate.mjs",
    },
  };
}

function deterministicSubagentTestScript() {
  return [
    "pnpm run test:subagents:replay-diagnostics",
    "&&",
    "pnpm exec vitest run",
    "src/shared/featureFlags.test.ts",
    "src/shared/subagentLiveEvidenceLanes.test.ts",
    "src/shared/modelRuntimeSettings.test.ts",
    "src/shared/subagentContracts.test.ts",
    "src/shared/symphonyWorkflowRecipes.test.ts",
    "src/shared/callableWorkflowLaunchCards.test.ts",
    "src/shared/subagentCapacity.test.ts",
    "src/shared/subagentTurnBudget.test.ts",
    "src/main/callable-workflow/callableWorkflowRegistry.test.ts",
    "src/main/projectStore/projectStoreSymphonyWorkflowRecipe.test.ts",
    "src/main/callable-workflow/callableWorkflowPiTools.test.ts",
    "src/main/callable-workflow/callableWorkflowExecutionPlan.test.ts",
    "src/main/callable-workflow/callableWorkflowTaskQueue.test.ts",
    "src/main/callable-workflow/callableWorkflowRunner.test.ts",
    "src/main/callable-workflow/callableWorkflowDogfoodEvidence.test.ts",
    "src/main/callable-workflow/callableWorkflowRehydrationEvidence.test.ts",
    "src/main/subagents/subagentLifecycleEdgeEvidence.test.ts",
    "src/main/workflow-compiler/workflowCompilerService.test.ts",
    "src/main/agent-runtime/agentRuntimeCallableWorkflowBridge.test.ts",
    "src/main/agent-runtime/agentRuntimeCallableWorkflowTools.test.ts",
    "src/main/agent-runtime/ambient-workflow/agentRuntimeAmbientWorkflowReadOnlyTools.test.ts",
    "src/main/callable-workflow/callableWorkflowParentBlocking.test.ts",
    "src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts",
    "src/main/workflow/workflowAgentRuntime.test.ts",
    "src/main/modelRuntimeRegistry.test.ts",
    "src/main/model-provider/modelProviderCapabilityProbe.test.ts",
    "src/main/model-provider/modelProviderCapabilityProbeRunner.test.ts",
    "src/main/model-provider/modelProviderEndpointProbeAdapter.test.ts",
    "src/main/model-provider/modelProviderEndpointProbeService.test.ts",
    "src/main/model-provider/modelProviderCredentialStore.test.ts",
    "src/main/model-provider/modelProviderSettingsInstall.test.ts",
    "src/main/subagents/subagentHardening.test.ts",
    "src/main/subagents/subagentInvariants.test.ts",
    "src/main/subagents/subagentObservability.test.ts",
    "src/main/subagents/subagentIdempotency.test.ts",
    "src/main/pi/piChildSessionAdapter.test.ts",
    "src/main/pi/piEventMapper.test.ts",
    "src/main/subagents/subagentRuntimeEventPersistence.test.ts",
    "src/main/subagents/subagentContextFilter.test.ts",
    "src/main/subagents/subagentPromptRuntime.test.ts",
    "src/main/subagents/subagentStructuredOutput.test.ts",
    "src/main/subagents/subagentCompletionGuard.test.ts",
    "src/main/subagents/subagentStartupReconciliation.test.ts",
    "src/main/subagents/subagentLifecycleParentMailbox.test.ts",
    "src/main/subagents/subagentRepair.test.ts",
    "src/main/subagents/subagentRetention.test.ts",
    "src/main/subagents/subagentLifecycleHooks.test.ts",
    "src/main/subagents/subagentApprovalBridge.test.ts",
    "src/main/subagents/subagentSupervisorRequest.test.ts",
    "src/main/subagents/subagentApprovalDecision.test.ts",
    "src/main/ipc/registerSubagentIpc.test.ts",
    "src/main/ipc/registerSettingsIpc.test.ts",
    "src/main/subagents/subagentReviewedMaturityEvidence.test.ts",
    "src/main/subagents/subagentLiveSmokeEvidence.test.ts",
    "src/main/chat-export/chatExport.test.ts",
    "src/main/subagents/subagentLiveHistoryEvidence.test.ts",
    "src/main/subagents/subagentDesktopDogfoodEvidence.test.ts",
    "src/main/subagents/subagentLiveConfidenceEvidence.test.ts",
    "src/main/subagents/subagentLiveConfidenceMaturityEvidence.test.ts",
    "src/main/subagents/subagentMaturity.test.ts",
    "src/main/subagents/subagentThreatModel.test.ts",
    "src/main/projectStore/projectStoreSubagentFoundation.test.ts",
    "src/main/subagents/subagentPiTools.test.ts",
    "src/main/subagents/subagentPiToolInput.test.ts",
    "src/main/subagents/subagentPiToolResult.test.ts",
    "src/main/subagents/subagentSpawnPreRunPlanner.test.ts",
    "src/main/subagents/subagentSpawnPreflightResolver.test.ts",
    "src/main/subagents/subagentChildWorktreePreparer.test.ts",
    "src/main/subagents/subagentTargetResolver.test.ts",
    "src/main/subagents/subagentToolScopeRequest.test.ts",
    "src/main/subagents/subagentToolScopeLaunchPolicy.test.ts",
    "src/main/subagents/subagentSpawnBlockDecision.test.ts",
    "src/main/subagents/subagentPreRunSpawnFailureRecorder.test.ts",
    "src/main/subagents/subagentPostReservationSpawnFailureRecorder.test.ts",
    "src/main/subagents/subagentLaunchRejectionRecorder.test.ts",
    "src/main/subagents/subagentSpawnLaunchExecutor.test.ts",
    "src/main/subagents/subagentFailedSpawnWaitBarrier.test.ts",
    "src/main/subagents/subagentResultValidation.test.ts",
    "src/main/subagents/subagentWaitBarrierResolution.test.ts",
    "src/main/subagents/subagentWaitContextResolver.test.ts",
    "src/main/subagents/subagentWaitAgentExecutor.test.ts",
    "src/main/subagents/subagentTurnBudgetWrapUpRecorder.test.ts",
    "src/main/subagents/subagentWaitCompletionRecorder.test.ts",
    "src/main/subagents/subagentWaitBarrierAttentionRecorder.test.ts",
    "src/main/subagents/subagentSpawnFailure.test.ts",
    "src/main/subagents/subagentSpawnRequest.test.ts",
    "src/main/subagents/subagentMailbox.test.ts",
    "src/main/subagents/subagentMailboxRequest.test.ts",
    "src/main/subagents/subagentChildMailboxExecutor.test.ts",
    "src/main/subagents/subagentAgentStatus.test.ts",
    "src/main/subagents/subagentChildActiveTools.test.ts",
    "src/main/subagents/subagentToolScopeSnapshot.test.ts",
    "src/main/subagents/subagentGroupJoin.test.ts",
    "src/main/subagents/subagentGroupedCompletionRecorder.test.ts",
    "src/main/subagents/subagentParentPolicyResolution.test.ts",
    "src/main/subagents/subagentWaitBarrierEvaluation.test.ts",
    "src/main/subagents/subagentWaitMailbox.test.ts",
    "src/main/subagents/subagentBarrierDecision.test.ts",
    "src/main/subagents/subagentBarrierDecisionRecorder.test.ts",
    "src/main/subagents/subagentBarrierControl.test.ts",
    "src/main/subagents/subagentBarrierControlExecutor.test.ts",
    "src/main/subagents/subagentBarrierDecisionExecutor.test.ts",
    "src/main/subagents/subagentCancelAgent.test.ts",
    "src/main/subagents/subagentCancelAgentExecutor.test.ts",
    "src/main/subagents/subagentCloseAgent.test.ts",
    "src/main/subagents/subagentCloseAgentExecutor.test.ts",
    "src/main/subagents/subagentBatchJobs.test.ts",
    "src/main/local-runtime/localTextDelegation.test.ts",
    "src/main/local-runtime/localTextSubagentRuntime.test.ts",
    "src/main/local-runtime/localModelRuntimeManager.test.ts",
    "src/main/local-runtime/localRuntimeInventory.test.ts",
    "src/main/local-runtime/localModelRuntimeStatus.test.ts",
    "src/main/local-runtime/localModelRuntimeStart.test.ts",
    "src/main/local-runtime/localModelRuntimeStop.test.ts",
    "src/main/local-runtime/localModelRuntimeRestart.test.ts",
    "src/main/local-runtime/agentRuntimeLocalRuntimeTools.test.ts",
    "src/main/local-runtime/localModelResourceRegistry.test.ts",
    "src/main/local-runtime/localTextSubagentStartupConfig.test.ts",
    "src/main/diagnostics/diagnostics.test.ts",
    "src/main/diagnostics/diagnosticBundleImport.test.ts",
    "src/renderer/src/modelRuntimeCatalogUiModel.test.ts",
    "src/renderer/src/modelProviderOnboardingUiModel.test.ts",
    "src/renderer/src/symphonyWorkflowBuilderUiModel.test.ts",
    "src/renderer/src/SymphonyWorkflowBuilder.test.tsx",
    "src/renderer/src/subagentParentClusterUiModel.test.ts",
    "src/renderer/src/SubagentParentCluster.test.tsx",
    "src/renderer/src/subagentThreadInspectorUiModel.test.ts",
    "src/renderer/src/subagentRepairDiagnosticsUiModel.test.ts",
    "src/renderer/src/subagentMaturityUiModel.test.ts",
    "src/renderer/src/subagentReplayEvidenceUiModel.test.ts",
    "src/renderer/src/localRuntimeEvidenceUiModel.test.ts",
    "src/renderer/src/diagnosticExportHistoryUiModel.test.ts",
    "src/renderer/src/settingsLayout.test.ts",
    "src/renderer/src/diagnosticExportUiModel.test.ts",
    "scripts/subagent-desktop-dogfood.test.mjs",
    "scripts/subagent-desktop-dogfood-repeat.test.mjs",
  ].join(" ");
}

function files() {
  return {
    packageJson: "subagents:live-history-report test:subagents:live-history-report:unit pnpm run test:subagents:live-history-report:unit subagents:desktop-dogfood-history-report test:subagents:desktop-dogfood-history-report:unit pnpm run test:subagents:desktop-dogfood-history-report:unit test:subagents:desktop-dogfood test:subagents:desktop-dogfood-repeat test:subagents:desktop-dogfood-repeat:unit",
    featureFlags: [
      'export const AMBIENT_SUBAGENTS_FEATURE_FLAG = "ambient.subagents" as const;',
      "const DEFAULT_AMBIENT_FEATURE_FLAG_SETTINGS = { subagents: false };",
      "function parseAmbientFeatureFlagLaunchArgs() { return ['--enable-feature=', '--disable-feature=']; }",
    ].join("\n"),
    mainIndex: "listSubagentParentMailboxEventsForParentThread(active) listCallableWorkflowTasksForParentThread(active) callableWorkflowTasks onParentMailboxEventUpdated defaultPayload.bundle.subagents.replayEvidence importDiagnosticBundleFromFile(filePath) requireProjectRuntimeHostForCallableWorkflowTask callable-workflow:cancel-task callable-workflow:pause-task callable-workflow:resume-task Callable workflow task controls are disabled while ambient.subagents is off. subagents:cancel-run subagents:close-run Sub-agent child controls are disabled because ambient.subagents is off.",
    ambientModels: "AmbientModelRuntimeProfile AmbientModelRuntimeCatalog selectableAsMain selectableAsSubagent ambientModelOptionsFromRuntimeProfiles ambientModelRuntimeCatalogFromProfiles selectableMainModelOptions",
    ambientModelsTest: "can derive future cloud or local main model options",
    modelRuntimeSettings: "MODEL_RUNTIME_INSTALLED_PROVIDER_SCHEMA_VERSION modelRuntimeProvidersFromSettings modelRuntimeProfilesFromSettings modelRuntimeSettingsWithInstalledProvider Installed provider is disabled in Settings.",
    modelRuntimeSettingsTest: "normalizes installed provider records while preserving exact custom provider and model ids keeps disabled installed providers visible as unavailable runtime profiles redacts secret-shaped diagnostic text before provider settings are persisted",
    sharedTypes: "modelCatalog parentMessageId?: string DiagnosticExportSubagentReplayEvidence DiagnosticExportCallableWorkflowReplayItem DiagnosticExportCallableWorkflowRestartIssueItem replayEvidence?: DiagnosticExportSubagentReplayEvidence parentMailboxTimeline parentMailboxEventCount callableWorkflowTaskTimeline callableWorkflowTaskIssues callableWorkflowTaskCount callableWorkflowTasks: number failureStage?: string approvalMode?: string approvalUnavailable?: boolean deniedCategoryIds?: string[] deniedToolIds?: string[] childIdleOpenRunCount childIdleTotalMs childIdleMaxMs importDiagnosticBundle CallableWorkflowTaskSummary CallableWorkflowTaskRestartReconciliationSummary CancelCallableWorkflowTaskInput PauseCallableWorkflowTaskInput ResumeCallableWorkflowTaskInput CancelSubagentRunInput CloseSubagentRunInput SubagentWaitBarrierDecision ResolveSubagentWaitBarrierInput SubagentWaitBarrierResolutionResult workflowThreadId?: string CallableWorkflowTaskProgressSnapshot CallableWorkflowTaskUsageSnapshot progressSnapshot usageSnapshot callableWorkflowTasks: CallableWorkflowTaskSummary[] callable-workflow-task-updated cancelCallableWorkflowTask(input: CancelCallableWorkflowTaskInput) pauseCallableWorkflowTask(input: PauseCallableWorkflowTaskInput) resumeCallableWorkflowTask(input: ResumeCallableWorkflowTaskInput) cancelSubagentRun(input: CancelSubagentRunInput) closeSubagentRun(input: CloseSubagentRunInput) resolveSubagentWaitBarrier(input: ResolveSubagentWaitBarrierInput)",
    preload: "cancelSubagentRun: (input: CancelSubagentRunInput) closeSubagentRun: (input: CloseSubagentRunInput) resolveSubagentWaitBarrier subagents:resolve-wait-barrier",
    subagentRoles: "schedulingPolicy live_parent_only automation_deferred",
    agentRoleRegistry: "schedulingPolicy live_parent_only automation_deferred",
    agentRoleRegistryTest: "schedulingPolicy live_parent_only reports invalid categories, scheduling policies",
    modelRuntimeRegistry: "createModelRuntimeCatalog listSelectableMainProfiles listSelectableSubagentProfiles unknownModelRuntimeProfile",
    modelRuntimeRegistryTest: "lists and resolves default model runtime profiles adds Settings-installed provider descriptors to runtime catalogs",
    modelProviderInstallTemplates: "MODEL_PROVIDER_INSTALL_TEMPLATES MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION generic-openai-compatible generic-anthropic-compatible ambient_cli_secret_request ambient_cli_env_bind buildModelProviderCapabilityProbePlan streaming context_window structured_json schema_output tool_use image_input latency error_shape health local_memory reliability",
    modelProviderCapabilityProbe: "MODEL_PROVIDER_INSTALL_TEMPLATES MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION generic-openai-compatible generic-anthropic-compatible ambient_cli_secret_request ambient_cli_env_bind buildModelProviderCapabilityProbePlan probeModelProviderCapabilityEligibility modelRuntimeProfileWithCapabilityProbeEligibility streaming context_window structured_json schema_output tool_use image_input latency error_shape health local_memory reliability",
    modelProviderCapabilityProbeTest: "defines known provider templates and generic endpoint installer shapes with Ambient-managed secret flows builds probe plans that preserve custom model ids exactly marks main and sub-agent eligibility only after required capability probes pass blocks local sub-agent eligibility without health, memory, and reliability evidence rejects stale capability reports from another template, provider, or model id",
    modelProviderCapabilityProbeRunner: "MODEL_PROVIDER_CAPABILITY_PROBE_RUNNER_SCHEMA_VERSION runModelProviderCapabilityProbePlan ModelProviderCapabilityProbeRunnerAdapter runCapabilityProbe MODEL_PROVIDER_CAPABILITY_PROBE_EVIDENCE_MAX_CHARS",
    modelProviderCapabilityProbeRunnerTest: "executes every planned probe and preserves the exact provider/model identity feeds eligibility only from actual probe observations records thrown probe failures without leaking secret-shaped evidence bounds large probe evidence before it enters the report",
    modelProviderEndpointProbeAdapter: "createModelProviderEndpointProbeAdapter ModelProviderEndpointProbeAdapterConfig openai-compatible anthropic-compatible Endpoint accepted a tiny image input request. Endpoint returned an event-stream style streaming response. Ambient-managed secret is required before probing this endpoint.",
    modelProviderEndpointProbeAdapterTest: "probes OpenAI-compatible endpoint capabilities through real HTTP request shapes probes Anthropic-compatible messages, streaming, tool use, and schema output fails safely when the endpoint adapter does not match the probe plan requires Ambient-managed secret material before endpoint probing",
    modelProviderEndpointProbeService: "MODEL_PROVIDER_ENDPOINT_PROBE_SERVICE_SCHEMA_VERSION runModelProviderEndpointProbeService candidateProfile modelRuntimeInstalledProviderFromEndpointProbeResult Exact provider and model ids were preserved before capability eligibility narrowing. Endpoint probe service cannot run local-text runtime templates; use local runtime probes instead.",
    modelProviderEndpointProbeServiceTest: "orchestrates OpenAI-compatible endpoint probes into an eligibility-narrowed runtime profile keeps endpoint models ineligible when required context-window evidence is unknown orchestrates Anthropic-compatible schema probes when the install flow requests them narrows sub-agent eligibility when endpoint tool-use probes fail but main probes pass rejects local runtime templates and missing managed secret material before endpoint probing",
    modelProviderCredentialStore: "MODEL_PROVIDER_CREDENTIAL_SAVE_SCHEMA_VERSION saveModelProviderCredentialForSettings ambient-model-provider-credential-owner-v1",
    modelProviderCredentialStoreTest: "saves model provider credentials as Ambient-managed refs without returning secret values uses known provider env names and endpoint identity when saving env-bound credentials rejects local and Ambient-managed templates before saving",
    modelProviderSettingsInstall: "MODEL_PROVIDER_SETTINGS_INSTALL_SCHEMA_VERSION installModelProviderEndpointForSettings credentialRef.managedSecretRef Settings endpoint provider install cannot run local-text runtime templates; use local runtime onboarding instead.",
    modelProviderSettingsInstallTest: "runs endpoint probes through an Ambient-managed secret resolver and saves a secret-free installed provider updates an existing installed provider record instead of duplicating it persists failed sub-agent eligibility as an installed but main-only profile rejects local runtime templates before resolving endpoint secrets",
    settingsIpc: "model-runtime:save-provider-credential model-runtime:install-endpoint-provider SaveModelProviderCredentialInput InstallModelProviderEndpointInput ModelProviderCredentialSaveResult credentialRef.managedSecretRef",
    settingsIpcTest: "saves model provider credentials as managed refs before endpoint install installs endpoint providers through managed credential references only rejects raw endpoint provider secret material before install",
    modelScopeResolver: "SubagentModelScopeCandidateDiagnostic candidateDiagnostics capabilityDiagnostics subagent_eligibility",
    modelScopeResolverTest: "candidateDiagnostics capabilityDiagnostics parent_fallback role_default",
    modelRuntimeCatalogUiModel: "modelRuntimeCatalogSettingsModel unavailableReason Runtime catalog modelProviderOnboardingSettingsModel blockerSummaryLabel forceConsequenceLabel",
    modelRuntimeCatalogUiModelTest: "configured local text runtime profiles",
    modelProviderOnboardingUiModel: "modelProviderOnboardingSettingsModel modelProviderCredentialSaveDraftModel modelProviderEndpointInstallDraftModel endpointInstallable credentialRef.managedSecretRef Desktop secret request Ignored env-bound secret file No chat secrets Ambient-managed credential Save credential Probe endpoint before eligibility Probe health and memory before eligibility",
    modelProviderOnboardingUiModelTest: "surfaces safe secret flows and real capability probes for generic endpoints marks GMI Cloud as an ignored env-bound secret flow keeps local runtimes health and memory gated before sub-agent eligibility does not ask users to paste API keys into chat builds a safe credential save request from provider endpoint fields builds a safe endpoint install request from a managed credential reference refuses local and managed templates for endpoint install requests",
    rightPanel: "saveModelProviderCredential installModelProviderEndpoint selectedDiagnosticExport?.subagents?.replayEvidence selectedDiagnosticExport?.localRuntimes?.evidence recordDiagnosticExportHistory diagnostics.export-history diagnostics.subagent-replay diagnostics.local-runtime-evidence Diagnostic export history Sub-agent replay Local runtime evidence diagnosticImportStatusMessage open diagnostic bundle readInitialDiagnosticExportHistory persistDiagnosticExportHistory Recent saved and imported diagnostic bundles from this app profile.",
    rightPanelSettingsCore: "model-mode.model-catalog Runtime catalog",
    rightPanelSettingsRuntime: "Runtime catalog Provider onboarding Endpoint probe Managed credential ref Ambient-managed credential Save credential function SubagentReplayEvidenceDiagnostics Callable workflow tasks function LocalRuntimeEvidenceDiagnostics function DiagnosticExportHistory Diagnostic export history Recent saved and imported diagnostic bundles from this app profile. Export diagnostics to inspect local runtime leases, blockers, and memory evidence. Export diagnostics to inspect child replay timelines.",
    sharedSubagentMaturity: "feature_flag_guarded live_dogfood_count live_dogfood_failure_rate desktop_dogfood_count desktop_dogfood_failure_rate workflow_jitter_release_profile live_smoke failure_rate maxLiveDogfoodFailureRate maxDesktopDogfoodFailureRate minDesktopDogfoodRuns restart_recovery completion_guard_visibility approval_routing_visibility production_ui_visibility event_attribution_integrity lifecycle_control_integrity retention_policy_integrity tool_scope_integrity unresolved_lifecycle_bugs unresolved_permission_bugs security_review",
    subagentLiveEvidenceLanesJson: "ambient-subagent-live-evidence-lanes-v1 liveAuthorityConfidenceSkipped Child authority confidence liveWorkflowBroaderConfidenceSkipped Broader Workflow/Symphony confidence liveDesktopDogfoodConfidenceSkipped Desktop dogfood confidence",
    subagentLiveEvidenceLanes: "SUBAGENT_LIVE_EVIDENCE_LANES SUBAGENT_LIVE_EVIDENCE_LABELS validateSubagentLiveEvidenceLaneDefinitions subagentLiveEvidenceLanes.json Child authority confidence Broader Workflow/Symphony confidence Desktop dogfood confidence",
    subagentLiveEvidenceLanesTest: "defines the release-gate lanes once, including child authority and Desktop dogfood confidence flags duplicate fields or labels before they can skew maturity history",
    subagentMaturity: "function evaluateSubagentMaturity() {} summarizeSubagentReleaseGateLiveHistory summarizeSubagentDesktopDogfoodHistory summarizeSubagentWorkflowJitterReleaseProfile liveReleaseGateHistory desktopDogfoodHistory cleanRequiredRunCount failedRequiredRunCount readyRunCount failedRunCount visualFailureRunCount maturityFailureRunCount feature_flag_guarded live_dogfood_count live_dogfood_failure_rate desktop_dogfood_count desktop_dogfood_failure_rate workflow_jitter_release_profile live_smoke failure_rate maxLiveDogfoodFailureRate maxDesktopDogfoodFailureRate minDesktopDogfoodRuns restart_recovery completion_guard_visibility approval_routing_visibility production_ui_visibility event_attribution_integrity lifecycle_control_integrity retention_policy_integrity tool_scope_integrity Completion guard visibility Approval routing visibility Production UI visibility Event attribution integrity Lifecycle control integrity Retention policy integrity Tool scope integrity unresolved_lifecycle_bugs unresolved_permission_bugs security_review SUBAGENT_LIVE_EVIDENCE_LABELS REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS",
    subagentMaturityTest: "blocks graduation when completion guard visibility evidence omits a required surface blocks graduation when approval routing visibility evidence omits a required surface blocks graduation when production UI visibility evidence omits a required surface blocks graduation when event attribution integrity evidence omits a required surface blocks graduation when lifecycle control integrity evidence omits a required surface blocks graduation when retention policy integrity evidence omits a required surface blocks graduation when tool scope integrity evidence omits a required surface",
    subagentLiveSmokeEvidence: "recordSubagentLiveSmokeEvidence recordSubagentLiveApprovalAuthorityEvidence live_dogfood_run live_pi_smoke validateSubagentResultArtifactForSynthesis runtimeStarted runtimeAssistantDelta runtimeCompleted parentReturned childTranscriptContainsSentinel childSummaryReturned SUBAGENT_LIVE_APPROVAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION ambient-subagent-live-approval-authority-evidence-v1 childPausedForApproval parentRemainedBlocked approvalForwardedToParent deniedContentLeaked",
    chatExport: "collectChildThreadBundles getChildThreadForExport listSubagentRunsForParentThread listSubagentParentMailboxEventsForParentThread listCallableWorkflowTasksForParentThread child-threads/index.json child-threads/evidence-summary.json child-threads/parent-mailbox-events.json child-threads/callable-workflow-tasks.json child-threads/pattern-graphs.json full-transcript.json full-transcript.md visible-transcript.md run-events.json mailbox-events.json tool-scope-snapshots.json wait-barriers.json childPiSessionCount childTranscriptLinks buildChildEvidenceSummaryIndex hiddenThinkingMessageCount hiddenEmptyAssistantMessageCount missing_full_child_transcript latestToolScopeSnapshot parentApprovalBridgeEventCount evidenceGaps missing_child_bundle",
    chatExportTest: "includes direct sub-agent child transcripts and runtime evidence child-threads/index.json child-threads/evidence-summary.json child-threads/parent-mailbox-events.json child-threads/callable-workflow-tasks.json child-threads/pattern-graphs.json full-transcript.json full-transcript.md visible-transcript.md run-events.json mailbox-events.json tool-scope-snapshots.json wait-barriers.json childPiSessionCount childTranscriptLinks CHILD_THINKING_ROUTE hiddenThinkingMessageCount hiddenEmptyAssistantMessageCount latestToolScopeSnapshot parentApprovalBridgeEventCount evidenceGaps",
    subagentLiveHistoryEvidence: "SUBAGENT_LIVE_HISTORY_EVIDENCE_SCHEMA_VERSION ambient-subagent-live-history-evidence-v1 recordSubagentReleaseGateLiveHistoryEvidence normalizeReleaseGateLiveHistoryEntry live_dogfood_run releaseGateHistoryEntry skippedLiveEvidence SUBAGENT_LIVE_EVIDENCE_LABELS",
    subagentLiveHistoryEvidenceTest: "records clean required-live release-gate history rows as live dogfood maturity evidence records failed maturity evidence when required-live history skips lanes or has advisories src/main/subagents/subagentLiveHistoryEvidence.test.ts",
    subagentDesktopDogfoodEvidence: "SUBAGENT_DESKTOP_DOGFOOD_EVIDENCE_SCHEMA_VERSION ambient-subagent-desktop-dogfood-evidence-v1 recordSubagentDesktopDogfoodEvidence buildSubagentDesktopDogfoodHistoryEntry desktop_dogfood_run desktopDogfoodHistoryEntry visualAssertionSummary maturityAssertionSummary workflowHighLoadPatternCount horizontalOverflowFree",
    subagentDesktopDogfoodEvidenceTest: "records passed Desktop dogfood artifacts as maturity evidence with a history entry records failed Desktop dogfood maturity evidence with actionable issues src/main/subagents/subagentDesktopDogfoodEvidence.test.ts",
    subagentLiveConfidenceEvidence: "SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION createSubagentLiveConfidenceEvidence validateSubagentLiveConfidenceEvidence summarizeSubagentLiveConfidenceEvidence pi_tool_prompt child_authority workflow_symphony workflow_symphony_broader local_runtime restart_repair lifecycle_edges desktop_dogfood deterministic_only featureFlagSnapshot maturityAssertions validateRestartRepairMaturityAssertions restart_repair_runtime_event_replay restart_repair_child_tree_repair restart_repair_mailbox_rehydration restart_repair_artifact_pointer_rehydration restart_repair_lifecycle_edge_coverage restart_repair_synthesis_safety validateLifecycleEdgeMaturityAssertions validateDesktopDogfoodMaturityAssertions lifecycle_edge_restart lifecycle_edge_stop lifecycle_edge_detach lifecycle_edge_cancel lifecycle_edge_retry lifecycle_edge_timeout lifecycle_edge_partial_result lifecycle_edge_synthesis_safety desktop_dogfood_scenario_coverage desktop_dogfood_visual_layout desktop_dogfood_lifecycle_edges desktop_dogfood_runtime_and_operator_controls hypothesis expectedObservation actualOutcome confidenceDelta followUp closeoutAnswer saw_live no_live_surface classifiedBlockers secret-like material",
    subagentLiveConfidenceEvidenceTest: "creates release-usable evidence for a GMI-backed Pi prompt/tool slice allows deterministic-only slices to document why live validation was skipped rejects secret-like material before it can enter live confidence artifacts",
    subagentLiveConfidenceMaturityEvidence: "SUBAGENT_LIVE_CONFIDENCE_MATURITY_EVIDENCE_SCHEMA_VERSION ambient-subagent-live-confidence-maturity-evidence-v1 recordSubagentLiveConfidenceMaturityEvidence restart_recovery lifecycle_control_integrity production_ui_visibility restart_repair_runtime_event_replay lifecycle_edge_retry childRetryRecovery lifecycle_edge_partial_result desktop_dogfood_runtime_and_operator_controls does not map directly to a maturity gate",
    subagentLiveConfidenceMaturityEvidenceTest: "records passed restart repair live confidence as restart recovery maturity evidence records lifecycle edge live confidence with the booleans consumed by maturity gates records Desktop dogfood live confidence as production UI visibility maturity evidence src/main/subagents/subagentLiveConfidenceMaturityEvidence.test.ts",
    subagentLiveConfidenceRunner: "SUBAGENT_LIVE_CONFIDENCE_RUNNER_SCHEMA_VERSION buildSubagentLiveConfidencePlan runSubagentLiveConfidence buildSubagentLiveConfidenceEvidence hypothesis expectedObservation actualOutcome confidenceDelta followUp closeoutAnswer saw_live blocked child_authority child_long_context_authority child_file_approval_authority child_browser_approval_authority validateChildAuthorityConfidenceArtifacts validateLongContextAuthorityArtifact validateApprovalAuthorityArtifact validateBrowserApprovalAuthorityArtifact DEFAULT_SUBAGENT_AUTHORITY_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_LIVE_LONG_CONTEXT_AUTHORITY_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_APPROVAL_AUTHORITY_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_BROWSER_APPROVAL_ARTIFACT_PATH validateLiveSmokeArtifact validateWorkflowDogfoodArtifact validateWorkflowUiDogfoodMatrixArtifact validateWorkflowSymphonyConfidenceArtifacts validateCallableWorkflowDogfoodConfidenceArtifact validateCallableWorkflowRehydrationConfidenceArtifact workflowSymphonyMaturityAssertions live_workflow_run broader_workflow_ui_dogfood workflow_agent_ui_dogfood child_mutating_workflow workflow_task_artifact_rehydration workflow_launch_card_bounds workflow_mutating_child_worker workflow_parent_blocking_completion workflow_denied_child_scope workflow_restart_repair workflow_rehydrated_task_links workflow_rehydrated_artifact_payload workflow_rehydrated_progress_usage workflow_rehydrated_child_provenance dogfoodMaturity rehydrationMaturity Callable workflow dogfood maturity assertion workflow_launch_card_bounds status is failed; expected passed. Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage must record only passed evidence entries. localRuntimeMaturityAssertions local_runtime_active_lease_stop_blocker local_runtime_untracked_safety local_runtime_stale_lease_recovery local_runtime_provider_lifecycle local_runtime_proof_gate restartRepairMaturityAssertions restart_repair_runtime_event_replay restart_repair_child_tree_repair restart_repair_mailbox_rehydration restart_repair_artifact_pointer_rehydration restart_repair_lifecycle_edge_coverage restart_repair_synthesis_safety lifecycleEdgeMaturityAssertions lifecycle_edge_restart lifecycle_edge_stop lifecycle_edge_detach lifecycle_edge_cancel lifecycle_edge_retry lifecycle_edge_timeout lifecycle_edge_partial_result lifecycle_edge_synthesis_safety desktopDogfoodMaturityAssertions desktop_dogfood_scenario_coverage desktop_dogfood_visual_layout desktop_dogfood_lifecycle_edges desktop_dogfood_runtime_and_operator_controls validateLocalRuntimeControlProofArtifact validateRepeatedUntrackedObservations validateSubagentRestartRepairArtifact validateSubagentRestartRepairConfidenceArtifacts validateSubagentLifecycleEdgeArtifact validateDesktopDogfoodConfidenceArtifact DEFAULT_SUBAGENT_WORKFLOW_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_WORKFLOW_BROADER_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_WORKFLOW_UI_DOGFOOD_ARTIFACT_PATH DEFAULT_SUBAGENT_LOCAL_RUNTIME_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_RESTART_REPAIR_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_LIFECYCLE_EDGE_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_LIVE_CONFIDENCE_OUTPUT_PATH DEFAULT_SUBAGENT_LIVE_WORKFLOW_ARTIFACT_PATH DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_DOGFOOD_ARTIFACT_PATH DEFAULT_SUBAGENT_CALLABLE_WORKFLOW_REHYDRATION_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_LOCAL_RUNTIME_GATE_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_ARTIFACT_PATH DEFAULT_SUBAGENT_LIVE_RESTART_REPAIR_FIXTURE_ARTIFACT_PATH DEFAULT_SUBAGENT_LIFECYCLE_EDGE_ARTIFACT_PATH DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_ARTIFACT_PATH test:subagents:live:smoke test:subagents:live:authority test:subagents:live-confidence:authority test:subagents:live-confidence:workflow-prereqs test:subagents:live-confidence:workflow-broader-prereqs test:workflow-ui-dogfood:phase1-live:credentialed test:local-runtime-control:proof test:subagents:lifecycle-edges:proof test:subagents:live-confidence:restart-repair-prereqs test:subagents:desktop-dogfood workflow-local-file-run-dogfood workflow-agent-thread-ui-dogfood callable-workflow-dogfood callable-workflow-rehydration workflow_task_rehydration mutating_child_workflow workflow-symphony-latest workflow-symphony-broader-latest child-authority-latest long-context-authority-latest approval-authority-latest browser-approval-latest local-runtime-latest restart-repair-latest lifecycle-edges-latest desktop-dogfood-latest local-runtime-control-proof untracked-runtime-safety untracked_runtime_safety repeatedObservationCount repeatedObservations Untracked runtime repeated observation lifecycle_action_preview did not keep ordinaryStopAllowed=false. stale-lease-recovery stale_lease_recovery mailbox_state_rehydration artifact_pointer_rehydration ask-user-to-stop-untracked subagent-replay-diagnostics subagent-lifecycle-edges subagent-desktop-dogfood partial_result_edge retry_edge synthesis_safety renderSubagentLiveConfidenceMarkdown classifiedBlockersForRun credential_missing credentialed_snapshot_missing exceeded the configured timeout failed before release-usable evidence was produced sanitizeEvidenceText",
    subagentLiveConfidenceRunnerTest: "writes JSON, Markdown, and sanitized command output artifacts classifies missing GMI credentials as an environmental blocker without secret leakage classifies timeouts as retryable live environmental blockers child_authority workflow_symphony local_runtime restart_repair lifecycle_edges builds a focused child authority live confidence plan classifies completed child authority evidence as release-usable writes workflow/Symphony confidence to a stable slice-specific artifact by default writes local runtime confidence to a stable slice-specific artifact by default writes restart repair confidence to a stable slice-specific artifact by default writes lifecycle edge confidence to a stable slice-specific artifact by default validates workflow dogfood validates local runtime control proof validates stale lease recovery validates restart repair replay diagnostics restart rehydration proof validates lifecycle edge proof artifacts callable workflow dogfood artifact callable workflow rehydration artifact",
    subagentReleaseGateRunner: "appendFile live-history.jsonl --live-history= --no-live-history",
    subagentReleaseGateRunnerLib: "SUBAGENT_RELEASE_GATE_LIVE_HISTORY_SCHEMA_VERSION ambient-subagent-release-gate-live-history-v1 buildSubagentReleaseGateLiveHistoryEntry --require-maturity-history AMBIENT_SUBAGENT_RELEASE_GATE_REQUIRE_MATURITY_HISTORY subagentLiveHistoryReportCheck liveHistoryReportSkipped liveHistoryReportPath Sub-agent live history report is required for maturity history but missing. REQUIRED_LIVE_HISTORY_GRADUATION_RUNS REQUIRED_LIVE_HISTORY_MAX_FAILURE_RATE REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS validateLiveHistoryEvidenceLanes desktopDogfoodHistoryReportCheck desktopDogfoodHistorySkipped desktopDogfoodHistoryPath Repeated Desktop dogfood maturity history is required but missing. workflowJitterReleaseProfileCheck workflowJitterReleaseProfileSkipped workflowJitterReleaseGatePath Workflow jitter release-profile evidence is required for maturity history but missing. REQUIRED_DESKTOP_DOGFOOD_GRADUATION_RUNS REQUIRED_WORKFLOW_JITTER_RELEASE_PROFILE_LIVE_DOGFOOD_RUNS validateDesktopDogfoodHistoryScenarioCoverage requiredScenarioCoverage readyRowsWithCompleteVisuals readyRowsWithCompleteMaturity screenshotRunCount latestRuns checkCounts skippedLiveEvidence blockingIssueCount SUBAGENT_LIVE_EVIDENCE_DECISIONS liveAuthorityConfidenceSkipped Child authority confidence liveWorkflowBroaderConfidenceSkipped Broader Workflow/Symphony confidence liveDesktopDogfoodConfidenceSkipped Desktop dogfood confidence",
    subagentReleaseGateRunnerTest: "summarizes required-live release gate runs as append-only history rows",
    subagentLiveEvidenceLanesScript: "SUBAGENT_LIVE_EVIDENCE_LANES SUBAGENT_LIVE_EVIDENCE_LABELS SUBAGENT_LIVE_EVIDENCE_DECISIONS validateSubagentLiveEvidenceLaneDefinitions subagentLiveEvidenceLanes.json Child authority confidence Broader Workflow/Symphony confidence Desktop dogfood confidence",
    subagentLiveEvidenceLanesScriptTest: "exposes the same release-gate decision order used by live history rows Child authority confidence Broader Workflow/Symphony confidence Desktop dogfood confidence",
    subagentLiveHistoryReportRunner: "live-history.jsonl --require-ready --min-live-dogfood-runs= --max-failure-rate= subagentLiveHistoryReportPassed",
    subagentLiveHistoryReportRunnerLib: "SUBAGENT_LIVE_HISTORY_REPORT_SCHEMA_VERSION ambient-subagent-live-history-report-v1 parseSubagentLiveHistoryJsonl buildSubagentLiveHistoryReport renderSubagentLiveHistoryReportMarkdown subagentLiveHistoryReportPassed cleanRequiredRunCount failedRequiredRunCount live_dogfood_failure_rate invalidRows live-history.jsonl SUBAGENT_LIVE_EVIDENCE_LABELS REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS Child authority confidence Broader Workflow/Symphony confidence Desktop dogfood confidence",
    subagentLiveHistoryReportRunnerTest: "marks repeated clean required-live history ready for graduation accounting blocks graduation accounting for sparse, failed, or skipped-evidence history",
    subagentDesktopDogfoodHistoryReportRunner: "history.jsonl --append-latest= --append-latest-if-exists= --require-ready --min-desktop-dogfood-runs= --max-failure-rate= --min-workflow-high-load-ready-runs= subagentDesktopDogfoodHistoryReportPassed",
    subagentDesktopDogfoodEvidenceContract: "subagent-desktop-dogfood-evidence-contract.mjs REQUIRED_DESKTOP_DOGFOOD_SCENARIOS REQUIRED_DESKTOP_VISUAL_ASSERTIONS REQUIRED_DESKTOP_MATURITY_ASSERTIONS REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS workflow_execution_parent_blocking workflow_high_load_dogfood local_runtime_ownership_ui untracked_runtime_safety_behavior lifecycle_edge_desktop_behavior parent_stop_cascade_desktop_behavior parent_stop_cascade_visibility chat_export_child_bundle desktop_workflow_high_load desktop_local_runtime_ownership desktop_lifecycle_edges desktop_chat_export_child_bundle child_full_transcript_export",
    subagentDesktopDogfoodEvidenceContractTest: "keeps full-app scenario coverage in one shared release-gate contract requires visual assertions for workflow, runtime, lifecycle, and layout proof keeps release-gate maturity capabilities aligned with Desktop evidence rows",
    subagentDesktopDogfoodHistoryReportRunnerLib: "SUBAGENT_DESKTOP_DOGFOOD_HISTORY_ROW_SCHEMA_VERSION ambient-subagent-desktop-dogfood-history-v1 SUBAGENT_DESKTOP_DOGFOOD_HISTORY_REPORT_SCHEMA_VERSION ambient-subagent-desktop-dogfood-history-report-v1 parseSubagentDesktopDogfoodHistoryJsonl buildSubagentDesktopDogfoodHistoryEntry buildSubagentDesktopDogfoodHistoryReport renderSubagentDesktopDogfoodHistoryReportMarkdown subagentDesktopDogfoodHistoryReportPassed REQUIRED_DESKTOP_DOGFOOD_SCENARIOS REQUIRED_DESKTOP_VISUAL_ASSERTIONS REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS desktop_dogfood_failure_rate required_scenario_coverage workflow_high_load_repetition visualFailureRunCount maturityFailureRunCount history.jsonl",
    subagentDesktopDogfoodHistoryReportRunnerTest: "marks repeated ready Desktop dogfood rows ready for graduation accounting blocks sparse, failed, or incomplete visual and maturity evidence",
    subagentDesktopDogfoodRunner: "AMBIENT_SUBAGENT_DESKTOP_DOGFOOD AMBIENT_LEGACY_WORKFLOW_COMPILER src/main/subagents/subagentDesktopDogfoodSeed.test.ts src/main/subagents/subagentDesktopDogfood.e2e.test.ts scripts/llama-server-placeholder.mjs AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_PID AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ID AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ENDPOINT AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_MODEL AMBIENT_E2E_USER_DATA staleLatestArtifactPath await rm(staleLatestArtifactPath, { force: true }) scripts/subagent-desktop-dogfood-history-report.mjs --append-latest=test-results/subagent-desktop-dogfood/latest.json --append-latest-if-exists=test-results/subagent-desktop-dogfood/latest.json",
    subagentDesktopDogfoodRunnerTest: "test:subagents:desktop-dogfood scripts/run-electron-dogfood.mjs subagents:desktop-dogfood-history-report test:subagents:desktop-dogfood-history-report:unit scripts/subagent-desktop-dogfood-history-report.mjs --append-latest=test-results/subagent-desktop-dogfood/latest.json --append-latest-if-exists=test-results/subagent-desktop-dogfood/latest.json AMBIENT_SUBAGENT_DESKTOP_DOGFOOD AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_RUNTIME_PID AMBIENT_LEGACY_WORKFLOW_COMPILER src/main/subagents/subagentDesktopDogfoodSeed.test.ts AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED AMBIENT_E2E_USER_DATA test-results/subagent-desktop-dogfood headful: true cdpPort: port --remote-debugging-port --enable-feature=${AMBIENT_SUBAGENTS_FEATURE_FLAG} Accessibility.getFullAXTree .subagent-parent-cluster approval_parent_blocking Blocking: approval Approval requested approvalFlow approvalButtonsNameChild workflow_execution_parent_blocking workflowExecution workflow-execution-desktop.png mutating_worker_dogfood_behavior mutatingWorkerDogfood mutating-worker-dogfood-desktop.png Symphony Self-Healing Loop Mutating child worker Staged mutation: src/feature.txt Parent workspace unchanged desktop_mutating_worker_dogfood mutating_worker_evidence workflow_high_load_dogfood workflowHighLoad workflow-high-load-desktop.png Symphony Adversarial Debate Symphony Imitate and Verify Symphony Pipeline Symphony Ensemble desktop_workflow_high_load workflow_high_load denied_scope_explanation_behavior deniedScopeExplanation denied-scope-explanation-desktop.png Approval unavailable Connector App gmail.search desktop_denied_scope_explanations denied_scope_explanations Symphony Map-Reduce Blocking: workflow work Workflow blocked pauseControlVisible workflowTaskRehydrated approval_forwarding_behavior approvalForwarding approval-forwarding-dialog.png approval-forwarded-desktop.png parentStillBlockedAfterForward childReturnedToNeedsSteering approvalAuthorityContract requestExported forwardedExported requestedToolMatches parentBlockingResumeMatches forwardedParentBlockingResumeMatches waitBarrierMatches inline_child_transcript_behavior completed_child_terminal_transcript_behavior pattern_graph_completed_child_clickthrough_behavior completedChildTranscript completed-child-transcript-desktop.png patternGraphCompletedClickThrough pattern-graph-completed-click-through-desktop.png completedChildRunId completedChildThreadId restart_rehydration_behavior restartRehydration restart-rehydration-desktop.png defaultCollapsedAfterRelaunch completedChildResultSummaryRehydrated workflow_rehydrated_navigation_behavior workflowRehydratedNavigation workflow-rehydrated-navigation-desktop.png workflowThreadSidebarSelected workflowThreadMatchesExpectedId desktop_workflow_rehydrated_navigation workflow_artifact_rehydration_behavior workflowArtifactRehydration workflow-artifact-rehydration-desktop.png workflowArtifactSourceRelativePath workflowArtifactStateRelativePath sourceContentMatchesExpected desktop_workflow_artifact_rehydration local_runtime_ownership_ui localRuntimeOwnership local-runtime-ownership-desktop.png In use by sub-agent Review worker Stop disabled affectedSubagentVisible operator_child_controls operatorControls Cancel sub-agent Review worker Close sub-agent Context summarizer operator_control_behavior operatorBehavior completedChildClosed attentionChildCancelled operator-behavior-desktop.png multi_parent_cluster_stress multiClusterStress multi-cluster-stress-desktop.png stressClustersAfterParentMessages desktop_multi_cluster_stress chat_export_child_bundle exportChatAndInspectChildBundle desktop-chat-export.zip AMBIENT_E2E_CHAT_EXPORT_PATH desktop_chat_export_child_bundle child_transcript_export child_full_transcript_export policy_provenance_export pattern_graph_export_links childToolScopeSnapshotsIncluded childFullTranscriptsIncluded patternGraphLinksIncluded visualAssertions parent_child_placement default_collapsed_state inline_child_mini_thread_chrome blocking_attention_indicators approval_runtime_ownership_labels denied_scope_explanations workflow_artifact_rehydration layout_safety workflow_task_continuity maturityAssertions desktop_child_visibility desktop_approval_forwarding desktop_denied_scope_explanations desktop_workflow_execution desktop_workflow_artifact_rehydration desktop_restart_rehydration desktop_local_runtime_ownership desktop_operator_controls desktop_visual_layout_safety desktop_chat_export_child_bundle horizontalOverflowFree collapsed-desktop.png expanded-narrow.png",
    subagentDesktopDogfoodUntrackedPlaceholder: "scripts/llama-server-placeholder.mjs AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_PLACEHOLDER stopDisabledVisible untracked_runtime_safety_behavior untrackedRuntimeVisible untrackedStopDisabledVisible untrackedRestartDisabledVisible untrackedForceUnavailableVisible untrackedExternalStopGuidanceVisible",
    subagentDesktopDogfoodRepeatRunner: "parseSubagentDesktopDogfoodRepeatArgs buildSubagentDesktopDogfoodRepeatPlan buildSubagentDesktopDogfoodRepeatReport renderSubagentDesktopDogfoodRepeatReportMarkdown summarizeSubagentDesktopDogfoodRepeatRuns test-results/subagent-desktop-dogfood-repeat/latest.json scripts/run-electron-dogfood.mjs scripts/subagent-desktop-dogfood-history-report.mjs stopAfterFailures",
    subagentDesktopDogfoodRepeatRunnerLib: "DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS = 25 SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_SCHEMA_VERSION parseSubagentDesktopDogfoodRepeatArgs buildSubagentDesktopDogfoodRepeatPlan buildSubagentDesktopDogfoodRepeatReport renderSubagentDesktopDogfoodRepeatReportMarkdown summarizeSubagentDesktopDogfoodRepeatRuns AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_OUT test-results/subagent-desktop-dogfood-repeat/latest.json scripts/run-electron-dogfood.mjs scripts/subagent-desktop-dogfood-history-report.mjs --min-desktop-dogfood-runs= --min-workflow-high-load-ready-runs= --require-ready stopAfterFailures",
    subagentDesktopDogfoodRepeatRunnerTest: "test:subagents:desktop-dogfood-repeat test:subagents:desktop-dogfood-repeat:unit defaults to the graduation run count and final history thresholds accepts an explicit repeat closeout report path builds a strict graduation plan with pass-through dogfood arguments builds an auditable repeat closeout report with failed run and history gate details marks the repeat closeout ready when every run and the history report pass",
    workflowJitterMatrixRunner: "PROFILE_TASKS release ui-dogfood-vocabulary-quiz-repeat-2 ui-dogfood-local-file-classifier-repeat-2 ui-dogfood-public-source-browser-repeat-2 liveDogfoodRuns",
    workflowJitterReleaseGateRunner: "DEFAULT_REQUIRED_RELEASE_LIVE_FAMILIES DEFAULT_MIN_RELEASE_LIVE_DOGFOOD_RUNS matrixReleaseProfileCheck liveDogfoodRuns releaseProfile Workflow jitter release profile is green",
    workflowJitterReleaseGateTest: "makes release-profile coverage stricter than a normal live smoke pass liveDogfoodRuns: 10/10 releaseProfile",
    subagentDesktopDogfoodSeedTest: "visible child sub-agent state AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_RUNTIME_PID SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX stressParentMessageIds stressChildRunIds stressChildThreadIds subagent.child_approval_requested desktop-dogfood-approval-write cancelControlChildRunId closeControlChildRunIds SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID runtime-leases.json seedDeniedScopeExplanation subagent.spawn_failed SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID seedCallableWorkflowTask seedMutatingWorkerWorkflowTask seedWorkflowHighLoadStress SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS workflowHighLoadTaskIds workflowHighLoadArtifactIds workflowHighLoadRunIds workflowHighLoadThreadIds workflowHighLoadPatternLabels CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_ARTIFACT_ID SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_ARTIFACT_ID SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE mutatingWorkflowTaskId mutatingWorkflowParentWorkspaceUnchanged seedParentStopCascadeCluster parentStopCascadeCancelledMailboxEventIds seedMultiClusterStress",
    subagentDesktopDogfoodScenario: "SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_CASCADE_PARENT_ASSISTANT_TEXT SubagentDesktopDogfoodSeedResult stressParentMessageIds stressChildRunIds stressChildThreadIds parentStopCascadeParentMessageId parentStopCascadeParentMailboxEventId parentStopCascadeCancelledMailboxEventIds SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_ARTIFACT_ID SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_TOOL_CALL_ID SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_ARTIFACT_ID SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_TOOL_CALL_ID SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_SOURCE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_STATE_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS workflowHighLoadTaskIds workflowHighLoadArtifactIds workflowHighLoadRunIds workflowHighLoadThreadIds workflowHighLoadPatternLabels SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID deniedScopeParentMailboxEventId deniedScopeChildRunId deniedScopeChildThreadId workflowTaskId workflowArtifactSourceRelativePath workflowArtifactStateRelativePath workflowArtifactSourceContent workflowRunId mutatingWorkflowTaskId mutatingWorkflowArtifactId mutatingWorkflowRunId mutatingWorkflowThreadId mutatingWorkflowChildRunId mutatingWorkflowChildThreadId mutatingWorkflowStagedRelativePath mutatingWorkflowReportRelativePath mutatingWorkflowProgressMessage mutatingWorkflowParentWorkspaceUnchanged",
    subagentDesktopDogfoodE2eTest: "AMBIENT_SUBAGENT_DESKTOP_DOGFOOD AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARENT_ASSISTANT_TEXT seedLifecycleEdgeCluster test-results/subagent-desktop-dogfood --remote-debugging-port --enable-feature=${AMBIENT_SUBAGENTS_FEATURE_FLAG} Accessibility.getFullAXTree .subagent-parent-cluster approval_parent_blocking Blocking: approval Approval requested approvalFlow approvalButtonsNameChild workflow_execution_parent_blocking workflowExecution workflow-execution-desktop.png mutating_worker_dogfood_behavior mutatingWorkerDogfood mutating-worker-dogfood-desktop.png Symphony Self-Healing Loop Mutating child worker Staged mutation: src/feature.txt Parent workspace unchanged desktop_mutating_worker_dogfood mutating_worker_evidence workflow_high_load_dogfood workflowHighLoad workflow-high-load-desktop.png Symphony Adversarial Debate Symphony Imitate and Verify Symphony Pipeline Symphony Ensemble desktop_workflow_high_load workflow_high_load denied_scope_explanation_behavior deniedScopeExplanation denied-scope-explanation-desktop.png Approval unavailable Connector App gmail.search desktop_denied_scope_explanations denied_scope_explanations Symphony Map-Reduce Blocking: workflow work Workflow blocked pauseControlVisible workflowTaskRehydrated approval_forwarding_behavior approvalForwarding approval-forwarding-dialog.png approval-forwarded-desktop.png parentStillBlockedAfterForward childReturnedToNeedsSteering approvalAuthorityContract requestExported forwardedExported requestedToolMatches parentBlockingResumeMatches forwardedParentBlockingResumeMatches waitBarrierMatches inline_child_transcript_behavior completed_child_terminal_transcript_behavior pattern_graph_completed_child_clickthrough_behavior completedChildTranscript completed-child-transcript-desktop.png patternGraphCompletedClickThrough pattern-graph-completed-click-through-desktop.png completedChildRunId completedChildThreadId restart_rehydration_behavior restartRehydration restart-rehydration-desktop.png defaultCollapsedAfterRelaunch completedChildResultSummaryRehydrated workflow_rehydrated_navigation_behavior workflowRehydratedNavigation workflow-rehydrated-navigation-desktop.png workflowThreadSidebarSelected workflowThreadMatchesExpectedId desktop_workflow_rehydrated_navigation workflow_artifact_rehydration_behavior workflowArtifactRehydration workflow-artifact-rehydration-desktop.png workflowArtifactSourceRelativePath workflowArtifactStateRelativePath sourceContentMatchesExpected desktop_workflow_artifact_rehydration local_runtime_ownership_ui localRuntimeOwnership local-runtime-ownership-desktop.png In use by sub-agent Review worker Stop disabled affectedSubagentVisible lifecycle_edge_desktop_behavior inspectLifecycleEdgeVisibility lifecycle-edge-visibility-desktop.png Timeout edge worker Continue with partial Partial approved Retry edge worker Retry requested retry_edge Child detached lifecycle_edge_visibility parent_stop_cascade_desktop_behavior inspectParentStopCascadeVisibility parent-stop-cascade-desktop.png Parent-stop required worker Parent cancellation requested 2 pending mailbox events cancelled parent_stop_cascade_visibility desktop_lifecycle_edges operator_child_controls operatorControls Cancel sub-agent Review worker Close sub-agent Context summarizer operator_control_behavior operatorBehavior completedChildClosed attentionChildCancelled operator-behavior-desktop.png multi_parent_cluster_stress multiClusterStress multi-cluster-stress-desktop.png stressClustersAfterParentMessages desktop_multi_cluster_stress chat_export_child_bundle exportChatAndInspectChildBundle desktop-chat-export.zip AMBIENT_E2E_CHAT_EXPORT_PATH desktop_chat_export_child_bundle child_transcript_export child_full_transcript_export policy_provenance_export pattern_graph_export_links childToolScopeSnapshotsIncluded childFullTranscriptsIncluded patternGraphLinksIncluded visualAssertions parent_child_placement default_collapsed_state inline_child_mini_thread_chrome blocking_attention_indicators approval_runtime_ownership_labels denied_scope_explanations workflow_artifact_rehydration parent_stop_cascade_visibility layout_safety workflow_task_continuity maturityAssertions desktop_child_visibility desktop_approval_forwarding desktop_denied_scope_explanations desktop_workflow_execution desktop_workflow_artifact_rehydration desktop_restart_rehydration desktop_local_runtime_ownership desktop_operator_controls desktop_visual_layout_safety desktop_chat_export_child_bundle horizontalOverflowFree collapsed-desktop.png expanded-narrow.png",
    subagentReviewedMaturityEvidence: "recordSubagentRestartRecoveryEvidence recordSubagentWorkflowJitterReleaseProfileEvidence recordSubagentCompletionGuardVisibilityEvidence recordSubagentApprovalRoutingVisibilityEvidence recordSubagentProductionUiVisibilityEvidence recordSubagentEventAttributionIntegrityEvidence recordSubagentLifecycleControlIntegrityEvidence recordSubagentRetentionPolicyIntegrityEvidence recordSubagentToolScopeIntegrityEvidence recordSubagentBugAuditEvidence recordSubagentSecurityReviewEvidence restart_recovery workflow_jitter_release_profile completion_guard_visibility approval_routing_visibility production_ui_visibility event_attribution_integrity lifecycle_control_integrity retention_policy_integrity tool_scope_integrity lifecycle_bug_audit permission_bug_audit security_review",
    subagentReviewedMaturityEvidenceTest: "recordSubagentWorkflowJitterReleaseProfileEvidence recordSubagentCompletionGuardVisibilityEvidence recordSubagentApprovalRoutingVisibilityEvidence recordSubagentProductionUiVisibilityEvidence recordSubagentEventAttributionIntegrityEvidence recordSubagentLifecycleControlIntegrityEvidence recordSubagentRetentionPolicyIntegrityEvidence recordSubagentToolScopeIntegrityEvidence Reviewed workflow jitter release profile is ready with release-profile live evidence. Reviewed completion guard visibility across child inspector, parent blockers, replay diagnostics, and diagnostic history. Reviewed child approval routing across attribution, scoped response persistence, parent wait resumption, non-interactive failures, and UI/replay visibility. Reviewed production UI visibility across collapsed parent clusters, blocking-child indicators, child inspector rows, repair/replay panels, and local runtime ownership controls. Reviewed sub-agent event attribution across runtime previews, parent mailbox events, tool/approval/error provenance, replay diagnostics, and large-output artifacts. Reviewed sub-agent lifecycle controls across parent-stop cascade, child-cancel isolation, close history retention, lifecycle hook artifacts, and restart interruption repair. Reviewed sub-agent retention policy across close-without-delete, oldest-eligible cap cleanup, protected-child retention, summary/artifact durability, and retained-state UI. Reviewed sub-agent tool scope across hard-deny precedence, role/task narrowing, exact tool/extension resolution, child fanout default blocking, and snapshot/inspector diagnostics.",
    subagentInvariants: "validateSubagentRunEventAttribution validateSubagentParentMailboxEventAttribution assertSubagentRunEventAttribution assertSubagentParentMailboxEventAttribution must identify the originating child run",
    subagentInvariantsTest: "validates linkage, feature-flag snapshots, and assertion errors before child runs validates parent synthesis safety and large output artifact backing validates runtime event and parent mailbox attribution to child runs",
    subagentObservability: "spawnAttempts failedSpawns validateSubagentObservabilityEventAttribution must identify the originating child run waitDurations childIdle cancellationCascades childRuntimeAborts toolDenials groupedCompletions needsAttentionRequests tokenCount costMicros localMemory restartReconciliations subagent.child_runtime_aborted subagent.needs_attention subagent.grouped_completion",
    subagentObservabilityTest: "requires child attribution for child-scoped observability events summarizes spawn, wait, usage, memory, idle, batch, and restart observability",
    diagnostics: "getSubagentObservabilitySummary createSubagentAttributionAudit Sub-agent attribution audit auditedRuntimeEventCount auditedParentMailboxEventCount issueSamples createSubagentDiagnosticReplayEvidence ambient-subagent-replay-evidence-v1 source: \"diagnostic_export\" runtimeEventTimeline persistedRunEventTimeline parentMailboxTimeline parentMailboxEventCount transcriptTimeline callableWorkflowTaskTimeline callableWorkflowTaskIssues callableWorkflowTaskCount listCallableWorkflowTasks workflowArtifactSourcePath workflowArtifactStatePath workflowArtifactMutationPolicy artifactLinkState runLinkState child_bridge_policy completionGuardSummary approvalSource approvalId worktreeIsolated worktreePath deniedCategoryIds deniedToolIds observability.childIdle.openRunCount observability.childIdle.totalMs observability.childIdle.maxMs childIdleOpenRunCount childIdleTotalMs childIdleMaxMs Sub-agent replay evidence captured Sub-agent replay evidence failed to collect",
    diagnosticsTest: "exports a bounded sub-agent attribution audit for malformed persisted event data exports sub-agent observability aggregates and diagnostic replay evidence exports tool-scope denial metadata in parent mailbox replay evidence exports completion guard metadata in parent mailbox replay evidence exports callable workflow task replay evidence with child caller and artifact links exports callable workflow restart issue provenance in replay repair evidence completionGuardSummary approval-worker connector_app:gmail.search workflow-task-1 workflow-artifact-1 workflowArtifactSourcePath workflowArtifactStatePath workflowArtifactMutationPolicy callableWorkflowTaskIssues childRuntimeAborts: 1 groupedCompletions: 1 needsAttentionRequests: 1",
    diagnosticsIpc: "diagnosticsIpcChannels handleIpc(\"diagnostics:import\" importDiagnosticBundle",
    diagnosticBundleImport: "diagnosticImportResultFromBundleJson importDiagnosticBundleFromFile completionGuardSummary callableWorkflowTaskTimeline artifactLinkState runLinkState",
    diagnosticBundleImportTest: "imports a diagnostic bundle into bounded summary and replay evidence only completionGuardSummary workflow-task-1 workflow-artifact-1 child_bridge_policy callableWorkflowTaskIssues",
    subagentRepair: "ambient-subagent-repair-diagnostics-v1 repair_spawn_edge inspect_run_snapshot missing_feature_flag_snapshot capacity_lease_mismatch missing_role_profile_snapshot role_profile_snapshot_mismatch missing_model_runtime_snapshot prompt_snapshot_mismatch tool_scope_snapshot_mismatch",
    subagentRepairTest: "detects malformed feature flag and capacity lease snapshots for persisted child runs detects role profile, model runtime, prompt, and tool-scope snapshot drift for persisted child runs",
    subagentRetention: "retentionDefault keep_until_parent_pruned parent_thread_active role_retention_pinned parentArchived DEFAULT_SUBAGENT_MAX_RETAINED_CHILDREN_PER_PARENT maxRetainedChildrenPerParent retention_cap_exceeded",
    subagentRetentionTest: "honors role retention defaults before the cleanup age window collapses oldest completed eligible children when the per-parent retention cap is exceeded",
    subagentIdempotency: "createSubagentIdempotencyKey createSubagentPayloadFingerprint findSubagentRunEventByIdempotencyKey subagentRunEventPreviewIdempotencyKey spawn-failed followup wait wait-barrier-attention approval-request approval-response supervisor-request close cancel barrier-decision grouped_completion_notification artifact_write",
    subagentIdempotencyTest: "fingerprints undefined payload fields deterministically ignores malformed idempotency previews when replaying retried operations",
    piChildSessionAdapter: "PI_CHILD_SESSION_ADAPTER_SCHEMA_VERSION SubagentChildRuntimeAdapter SubagentChildRuntimeLaunchPreflightInput SubagentChildRuntimeStartInput SubagentChildRuntimeWaitInput SubagentChildRuntimeCancelInput SubagentChildRuntimeFollowupInput SubagentChildRuntimeApprovalResponseInput SubagentChildRuntimeApprovalRequest SubagentChildRuntimeSupervisorRequest approvalRequests?: readonly SubagentChildRuntimeApprovalRequest[] supervisorRequests?: readonly SubagentChildRuntimeSupervisorRequest[] SUBAGENT_CHILD_RUNTIME_ADAPTER_METHODS resolveChildApprovalResponse canResolveApprovalResponses describeSubagentChildRuntimeAdapter ambient-subagent-child-runtime-launch-preflight-v1",
    piChildSessionAdapterTest: "fails closed when no runtime adapter is attached",
    piEventMapper: "PI_CHILD_EVENT_MAPPER_SCHEMA_VERSION mapPiChildRuntimeEvent piChildRuntimeEventUpdateDetails piChildRuntimeEventUpdateText childRunId parentRunId childThreadId artifactPath approvalSource approvalId worktreeIsolated worktreePath toolCategory validatePiChildRuntimeEventLargeOutputArtifact Large child runtime output would be clipped or truncated without a full artifact path do not copy raw details into parent update",
    piEventMapperTest: "clips long child runtime messages builds compact Pi updates that identify the child run for tool, approval, and error attribution approvalSource approvalId worktreeIsolated worktreePath toolCategory do not copy raw details into parent update",
    subagentRuntimeEventPersistence: "appendMappedSubagentRuntimeEvent preview: runtimeEvent",
    subagentRuntimeEventPersistenceTest: "persists mapped child runtime events with run-event attribution and artifact paths rejects large mapped runtime output when no full artifact path is available persists usage and local-memory runtime telemetry as child-attributed previews",
    subagentPromptRuntime: "buildSubagentChildPrompt buildSubagentFollowupPrompt buildSubagentPromptSnapshot classifySubagentAssistantResult Parent-only sub-agent orchestration instructions, prior sub-agent tool calls/results treat the transcript as authoritative Task instructions are subordinate to this Result contract SUBAGENT_RESULT_STATUS: needs_attention persistentMemory ambient-subagent-persistent-memory-snapshot-v1 persistent_memory_disabled_by_default",
    subagentPromptRuntimeTest: "builds a follow-up prompt that restates run identity and the structured result contract uses schema-valid structured JSON when the status marker is present but malformed memoryPolicy: \"run_snapshot_only\"",
    subagentCompletionGuard: "validateSubagentCompletionGuard requires_isolated_worktree implementationEvidenceRequired Implementation roles require structured mutation evidence before completed synthesis. Implementation roles require Ambient-recorded mutation evidence before completed synthesis. Implementation structured mutation evidence must match an Ambient-recorded mutation event. Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis. isolatedWorktreeEvidenceCount approvalEvidenceCount",
    subagentCompletionGuardTest: "rejects category-only forged mutation evidence without a specific Ambient match rejects mismatched child-run mutation evidence even when tool ids match rejects worker mutation evidence without isolated worktree provenance rejects isolated worker mutation evidence without approval provenance",
    subagentChildWorktreePreparer: "SUBAGENT_CHILD_WORKTREE_PREPARER_SCHEMA_VERSION ambient-subagent-child-worktree-preparer-v1 prepareSubagentChildWorktreeForLaunch Prepared active worktree must be persisted on the child thread before mutating tools are enabled.",
    subagentChildWorktreePreparerTest: "records prepared evidence only when the active worktree is persisted on the child thread records failed, mismatched, empty, and thrown worktree preparation outcomes",
    subagentStartupReconciliation: "reconcileSubagentsOnRuntimeStartup reconcileCallableWorkflowTaskRestartState runs callable workflow task restart reconciliation when the store supports it subagentLifecycleEventType(\"SubagentStop\") latestStartupRepairEvents onParentMailboxEventUpdated subagent.restart_reconciled subagent.lifecycle_interrupted",
    subagentStartupReconciliationTest: "emits repaired child run, child thread, lifecycle stop, restart event, and wait barrier updates emits only the latest startup repair lifecycle and restart events for repaired runs",
    subagentLifecycleParentMailbox: "SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE ambient-subagent-lifecycle-interruption-v1 \"direct_child_stop\" \"runtime_budget_exceeded\"",
    subagentLifecycleParentMailboxTest: "builds child-attributed lifecycle interruption payloads for direct stops and runtime budgets bounds lifecycle result artifacts before parent mailbox delivery uses source and explicit idempotency keys for lifecycle parent mailbox dedupe \"parent_cancel_request\" \"direct_child_stop\" \"desktop_restart\" \"runtime_budget_exceeded\"",
    subagentLifecycleHooks: "SUBAGENT_LIFECYCLE_HOOK_SCHEMA_VERSION subagentLifecycleHookPreview subagentTranscriptPath subagent.lifecycle_started subagent.lifecycle_stopped subagent.lifecycle_closed parentTranscriptPath childTranscriptPath artifactPointers finalStatus",
    subagentLifecycleHooksTest: "records durable start transcript refs records stop artifact pointers and final status without copying result content records close time without deleting transcript refs not.toHaveProperty(\"summary\") not.toHaveProperty(\"structuredOutput\")",
    subagentApprovalBridge: "SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE resolveSubagentApprovalScope buildSubagentApprovalRequestBridgeDraft buildSubagentApprovalResponseBridgeDraft recordSubagentApprovalRequestBridgeIfNeeded recordSubagentApprovalResponseBridgeIfNeeded createSubagentApprovalRequestIdempotencyKey operation: \"approval-request\" operation: \"approval-response\" forward_child_approval_then_wait resumeParentBlocking: true Child always grants default to this child thread",
    subagentApprovalBridgeTest: "narrows child always grants to the child thread by default builds child-attributed approval requests that return the parent to a wait barrier builds scoped approval responses that are sent to the child while preserving parent blocking records approval responses into the child mailbox and parent audit event idempotently",
    subagentSupervisorRequest: "SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE SUBAGENT_SUPERVISOR_REQUEST_KINDS need_decision blocked progress_update marksChildComplete: false completionStatus: \"not_complete\" recordSubagentSupervisorRequestIfNeeded buildSubagentSupervisorRequestDraft createSubagentSupervisorRequestIdempotencyKey operation: \"supervisor-request\"",
    subagentSupervisorRequestTest: "builds child-attributed supervisor requests without marking the child complete records supervisor requests idempotently across child and parent mailbox events",
    subagentApprovalDecision: "SUBAGENT_APPROVAL_RESOLUTION_SCHEMA_VERSION resolveSubagentApprovalDecision updateSubagentParentMailboxEventDeliveryState",
    subagentApprovalDecisionTest: "records a UI approval response, consumes the parent request, and keeps the parent blocked",
    subagentIpc: "registerSubagentApprovalIpc subagents:resolve-approval subagents:resolve-wait-barrier subagents:cancel-run subagents:close-run requireProjectRuntimeHostForSubagentWaitBarrier Sub-agent child controls are disabled because ambient.subagents is off. ambient.subagents is off",
    subagentIpcTest: "resolves child approvals only when ambient.subagents is enabled",
    subagentCancelAgent: "SUBAGENT_PARENT_CANCEL_REQUEST_SOURCE SUBAGENT_CANCEL_REQUEST_EVENT_TYPE buildSubagentCancelAgentParentMailboxDraft buildSubagentCancelRequestedRunEventPreview shouldPreserveInitialTerminalSubagentCancelRun",
    subagentCancelAgentTest: "builds lifecycle parent mailbox drafts for parent cancel requests marks only active child runs as cancelled and preserves original terminal runs",
    subagentCancelAgentExecutor: "SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION ambient-subagent-cancel-agent-executor-v1 executeSubagentCancelAgent cancelPendingParentToChildMailboxEvents",
    subagentCancelAgentExecutorTest: "cancels active children, parent-to-child mailbox work, wait barriers, and records parent lifecycle evidence preserves terminal initial runs when runtime state is stale",
    subagentCloseAgent: "SUBAGENT_CLOSE_REQUEST_EVENT_TYPE SUBAGENT_CLOSE_RETAINED_HISTORY_MESSAGE resolveSubagentCloseAgentRequest assertCanCloseSubagentRun buildSubagentCloseRequestedRunEventPreview CLOSE_BLOCKED_ACTIVE_STATUSES",
    subagentCloseAgentTest: "blocks active children from closing but allows inactive or already-closed children builds close messages that preserve transcript and artifact expectations",
    subagentCloseAgentExecutor: "SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION ambient-subagent-close-agent-executor-v1 executeSubagentCloseAgent buildSubagentCloseRequestedRunEventPreview",
    subagentCloseAgentExecutorTest: "records close requests, releases capacity, and writes a retained-history child message replays existing close run events without repeating side effects",
    agentRuntime: "appendSubagentLifecycleInterruptionParentMailboxEvent recordSubagentFinalizationBlockedParentMailbox recordCallableWorkflowFinalizationBlockedParentMailbox callableWorkflowFinalizationBlock callableWorkflowFinalizationBlocked parentFinalizationBlocked emitCallableWorkflowTaskUpdated cancelCallableWorkflowTask pauseCallableWorkflowTask resumeCallableWorkflowTask resolveSubagentWaitBarrier(input: ResolveSubagentWaitBarrierInput) cancelSubagentRun(input: CancelSubagentRunInput) closeSubagentRun(input: CloseSubagentRunInput) executeSubagentBarrierDecision desktop-parent-cluster-resolve-barrier executeSubagentCancelAgent executeSubagentCloseAgent createDesktopSubagentCancelEventEmitter WorkflowManualPausedError callableWorkflowTaskAbortControllers callableWorkflowRunTaskIds callable-workflow-task-updated runtime_budget_exceeded resolveRuntimeForMain runtime: \"local_text\" Full local text output: availableExtensionToolNames subagent.approval_response.consumed pendingSubagentPermissionApprovalRequests native-permission-request",
    agentRuntimeCallableWorkflowExecution: "createAgentRuntimeCallableWorkflowRunnerStore options.emitCallableWorkflowTaskUpdated(options.store.getCallableWorkflowTask(task.id))",
    agentRuntimeTest: "blocks parent finalization while required sub-agent wait barriers are unresolved blocks parent finalization after required sub-agent wait barriers resolve unsafe blocks parent finalization while blocking callable workflow tasks are unresolved settles runtime-budget overruns as aborted partial results when the role allows partial output settles runtime-budget overruns as failures when the role forbids partial output runtime_budget_exceeded routes configured local text main chat through the local runtime without Pi surfaces native child permission prompts as parent-forwarded approval requests round-trips native child permission prompts through parent approval and child resume",
    agentRuntimeFinalizationBlocking: "recordSubagentFinalizationBlockedParentMailbox recordCallableWorkflowFinalizationBlockedParentMailbox subagentFinalizationBarrierBlock subagentFinalizationBlockParentResolution subagentFinalizationBlockUserChoices callableWorkflowFinalizationBlock callableWorkflowFinalizationBlocked parentFinalizationBlocked Parent final answer blocked because required sub-agent work is not safe for synthesis. Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    agentRuntimeFinalizationBlockingTest: "agent runtime finalization blocking helpers builds subagent finalization barrier blocks from unresolved required barriers creates parent-resolution policy and allowed choices for subagent barriers records subagent finalization mailbox events with policy payloads plans and records callable workflow finalization blocks",
    subagentChildActiveTools: "resolveAgentRuntimeActiveToolNamesForThread resolveSubagentChildActiveToolNames resolveSubagentChildActiveToolActivation subagentChildCallableWorkflowToolNamesFromSnapshots isSubagentChildActivatableBuiltInTool CHILD_ACTIVE_TOOL_NAMES_BY_CATEGORY activeTools: [...new Set([...agentRuntimeActiveTools, ...transcriptRehydratedToolNames])] availableExtensionToolNames availableCallableWorkflowToolNames unavailableCallableWorkflowToolNames Requested callable workflow tool is not registered as child-visible for this launch. callableWorkflowToolNames",
    subagentChildActiveToolsTest: "does not inherit parent active tools for read-only child scopes does not let exact built-in grants widen beyond visible child categories exposes worker write tools only from a workspace.write snapshot uses the latest child tool-scope snapshot activates snapshotted extension tools only when registered for the child launch fails before launch when a visible extension tool is not registered does not activate callable workflow tools from child snapshots unless registered for the child launch activates exact callable workflow tools when the child launch catalog exposes them extracts latest exact callable workflow grants for child callable workflow registration",
    subagentDelegatedToolAuthority: "SUBAGENT_DELEGATED_TOOL_AUTHORITY_AUDIT_SCHEMA_VERSION ambient-subagent-delegated-tool-authority-audit-v1 validateSubagentDelegatedToolAuthorityAudit subagentDelegatedToolAuthorityNonChildToolNames workspace-read-file-tools long-context-read media-download-tools visual-runtime-tools media-download-boundary visual-runtime-boundary media_download ambient_visual_analyze ambient_visual_minicpm_setup ambient_local_model_runtime_start ambient_local_model_runtime_stop ambient_local_model_runtime_restart rootProvider approvalProvider childIdentityProvider exact_child_grant not_child_visible long_context_process delegated authority rootProvider must match native read",
    subagentDelegatedToolAuthorityTest: "pins long_context_process to the same read authority and approval route as native read records exact-grant and non-visible boundary surfaces instead of inheriting broad parent tools validates the delegated authority audit as an executable contract fails the audit when long_context_process drifts from native read authority fails the audit when a child-visible built-in tool is missing authority coverage fails the audit when exact-grant bridges do not declare their source boundary",
    projectStore: "cascadeSubagentParentRunStopped cancelPendingParentToChildMailboxEvents cancelledMailboxEventIds subagent.cancellation_cascade parent_message_id listSubagentParentMailboxEventsForParentThread record.plan.parentMessageId appendSubagentLifecycleInterruptionParentMailboxEvent \"desktop_restart\" repairSubagentSpawnEdges subagent.spawn_edge_repaired close_agent released live sub-agent capacity while preserving transcript history applySubagentRetentionCleanup maxRetainedChildrenPerParent transcriptRetained: true artifactsRetained: true upsertSubagentGroupedCompletionNotification enqueueCallableWorkflowTask getCallableWorkflowTask listCallableWorkflowTasksForParentRun listCallableWorkflowTasksForParentThread listCallableWorkflowTasks reconcileCallableWorkflowTaskRestartState cancelCallableWorkflowTask tryGetWorkflowArtifact(row.workflow_artifact_id)?.workflowThreadId hydrateCallableWorkflowTaskRunTelemetry callableWorkflowTaskProgressSnapshot callableWorkflowTaskUsageSnapshot callable_workflow_task_canceled",
    projectStoreSchema: "PRIMARY KEY(job_id, report_id) idx_subagent_batch_result_reports_job_item_once callable_workflow_tasks idx_callable_workflow_tasks_parent_run",
    projectStoreSubagentFoundationTest: "cascades a stopped parent run across dependent child runs, wait barriers, and pending mailbox work persists explicit quorum thresholds on wait barriers persists parent mailbox parent-message anchors for pre-run spawn failures rejects persisted child runtime and parent mailbox events without exact child attribution parentMessageId: \"parent-message\" repairs missing and mismatched spawn edges while pruning dangling edges subagent.closed subagent.lifecycle_closed archives cap-exceeded child threads before the cleanup window without touching protected children archives only retention-eligible child threads and records cleanup audit events persists sub-agent batch jobs and exactly-once result ledgers persists Settings-installed model providers and feeds the runtime catalog without secrets",
    subagentPiTools: "evaluateSubagentWaitBarrierForSynthesis requiredSynthesisCountForBarrier waitBarrierEvaluation quorumThreshold waitBarrierMode childRunIds recordSubagentWaitBarrierAttentionParentMailboxIfNeeded subagent.wait_barrier_decision detach_child cancel_parent runtime_launch_preflight Sub-agent capacity preflight failed failureStage: \"capacity\" failureStage: \"scheduling_policy\" failureStage: \"tool_scope\" approvalUnavailable parentRun.assistantMessageId run.parentMessageId \"parent_cancel_request\" explicit delegation names ambient_subagent call spawn_agent before giving a final answer do not substitute a prose plan pass those literal values in the tool arguments call wait_agent for that child before synthesizing the parent answer If wait_agent returns supervisorRequestRecords CLOSE_BLOCKED_ACTIVE_STATUSES Cannot close active sub-agent transcript and artifacts are retained scheduledSpawnFields cannot inherit live parent context Prepared active worktree must be persisted on the child thread before mutating tools are enabled. unavailableRequestedExtensionToolNames availableExtensionToolNames child-safe bridge recordSubagentGroupedCompletionNotificationIfNeeded compactSubagentToolScopeSnapshot resolveSubagentLaunchWorkspaceToolPolicy resolveSubagentToolScopeLaunchDenial resolveSubagentSpawnBlockDecision recordSubagentPreRunSpawnFailure recordScheduledSubagentSpawnPolicyFailure recordSubagentPostReservationSpawnFailure recordSubagentLaunchRejection resolveSubagentFailedSpawnWaitBarrier validateSubagentResultForRun evaluateSubagentWaitBarrierForStore resolveSubagentWaitBarrierForRun resolveActiveSubagentWaitBarriersForRun recordSubagentWaitCompletionMailboxIfNeeded executeSubagentBarrierControlDecision recordSubagentBarrierDecisionParentMailbox approvalRequestRecords supervisorRequestRecords supervisorRequestAcknowledgement supervisorRequestRecords: supervisorRequestRecords.map approvalResponseDeliveries resolveChildApprovalResponse followupChildRun compactSubagentTurnBudgetWrapUpSteeringRecord turnBudgetWrapUpSteering turnBudgetWrapUpDelivery turnBudgetExhaustionSettlement",
    subagentPiToolsTest: "keeps required_all barriers blocked until every child has a synthesis-safe result allows required_any barriers from one validated child while preserving unsafe sibling provenance uses persisted quorum thresholds instead of implicit majority defaults creates Pi-reachable aggregate wait barriers with explicit quorum thresholds records timed-out required wait barriers in the parent mailbox idempotently records detach and parent-cancel barrier decisions with child state changes records pre-run spawn failures for local runtime launch preflight denials records pre-run spawn failures for local runtime capacity preflight denials reports non-interactive approval-unavailable launch denials to the parent mailbox parentMessageId: assistant.id describes direct parent spawn and wait semantics for explicit delegation requests refuses to close actively executing children before releasing capacity closes needs-attention children as abandoned work without deleting history capacityLeaseSnapshot.status transcript and artifacts are retained rejects scheduled spawn requests before creating a live child thread requires Ambient-side mutation evidence before synthesizing completed implementation roles rejects active worker worktrees that are not persisted on the child thread rejects unknown exact built-in child tools before reserving a child run accepts surfaced extension tools registered in the launch catalog rejects unavailable surfaced extension tools before reserving a child run records visible failed children for Pi-visible connector tools without child-safe bridges surfaces turn-budget wrap-up state in status_agent details surfaces turn-budget wrap-up steering evidence in wait_agent details surfaces turn-budget wrap-up runtime delivery evidence in wait_agent details settles exhausted turn budget as aborted_partial without fabricating synthesis-safe output settles exhausted turn budget as failed when the role forbids partial output surfaces turn-budget exhaustion settlement evidence in wait_agent details surfaces child approval-response delivery evidence from wait_agent exposes child supervisor request records from wait_agent as compact Pi-visible handles follow-supervisor-request",
    subagentPiToolInput: "SUBAGENT_PI_TOOL_INPUT_SCHEMA_VERSION ambient-subagent-pi-tool-input-v1 resolveSubagentPiToolInput resolveSubagentPiToolWaitTimeoutMs DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS",
    subagentPiToolInputTest: "clamps wait timeouts to the bounded Pi-visible wait contract normalizes optional and required string values with precise validation errors",
    subagentPiToolResult: "SUBAGENT_PI_TOOL_RESULT_SCHEMA_VERSION ambient-subagent-pi-tool-result-v1 subagentPiToolResult compactSubagentPiToolRunEvent compactSubagentPiToolMailboxEvent compactSubagentPiToolParentMailboxEvent previewSubagentPiToolText",
    subagentPiToolResultTest: "compacts run events with bounded handles and optional preview/artifact fields compacts mailbox and parent-mailbox events into Pi-visible handles compacts singular child approval mailbox attribution for Pi-visible handles compacts singular child supervisor mailbox attribution for Pi-visible handles normalizes and truncates Pi-visible preview text",
    subagentSpawnPreRunPlanner: "SUBAGENT_SPAWN_PRE_RUN_PLANNER_SCHEMA_VERSION ambient-subagent-spawn-pre-run-planner-v1 SUBAGENT_SPAWN_PLANNER_DEPENDENCY_MODES SUBAGENT_SPAWN_PLANNER_FORK_MODES SUBAGENT_SPAWN_PLANNER_PROMPT_MODES resolveSubagentSpawnPreRunPlan defaultSubagentChildTitle scheduledSpawnFields payloadFingerprint",
    subagentSpawnPreRunPlannerTest: "resolves default spawn plan fields and stable generated idempotency preserves explicit launch choices, tool scope, idempotency, and scheduled-spawn fields surfaces model-scope blockers before child run creation",
    subagentSpawnPreflightResolver: "SUBAGENT_SPAWN_PREFLIGHT_RESOLVER_SCHEMA_VERSION ambient-subagent-spawn-preflight-resolver-v1 buildSubagentSpawnRuntimePreflightInput resolveSubagentSpawnRuntimePreflight buildSubagentSpawnCapacityLeaseInput resolveSubagentSpawnCapacityLease shouldRecordSubagentPreRunCapacityFailure preflightChildLaunch localMemory",
    subagentSpawnPreflightResolverTest: "builds and executes runtime launch preflight inputs without inventing a runtime maps parent, model, existing run, and local-memory preflight data into capacity leases records pre-run capacity failures only for denied runtime local-memory preflights",
    subagentTargetResolver: "SUBAGENT_TARGET_RESOLVER_SCHEMA_VERSION ambient-subagent-target-resolver-v1 resolveSubagentTargetRun resolveSubagentTargetWaitBarrier assertSubagentRunOpenForAction childRunId, agentId, or canonicalTaskPath must identify an existing sub-agent run. does not belong to the current parent thread No sub-agent wait barrier exists for child run",
    subagentTargetResolverTest: "resolves target runs by childRunId, agentId, and canonical task path within the parent thread resolves explicit wait barriers and latest barriers for target child runs blocks actions against closed or terminal sub-agent runs",
    subagentToolScopeRequest: "SUBAGENT_TOOL_SCOPE_REQUEST_SCHEMA_VERSION resolveSubagentToolScopeRequest unavailableRequestedExtensionToolNames",
    subagentToolScopeRequestTest: "reports only unavailable Pi-visible surfaced extension tools",
    subagentToolScopeLaunchPolicy: "SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION ambient-subagent-tool-scope-launch-policy-v1 SUBAGENT_TOOL_SCOPE_LAUNCH_HARD_DENIED_CATEGORIES SubagentLaunchChildWorkflowPolicyInput resolveSubagentLaunchWorkspaceToolPolicy resolveSubagentToolScopeLaunchDenial subagentToolScopeRequestIsExplicit callableWorkflowBridge allowCallableWorkflowTools remainingFanout Callable workflow child bridge allowed by role policy parentPermissionMode phase4_isolation_required requested_scope_denied Sub-agent role/tool scope is not launchable in Phase 4 without additional isolation Requested sub-agent tool scope was denied",
    subagentToolScopeLaunchPolicyTest: "builds the launch workspace policy snapshot from parent mode and child worktree state enables callable workflow bridge only with isolated worktree and remaining fanout budget blocks Phase 4 mutation and nested fanout hard-denials before child launch only turns non-hard denials into launch failures when the task explicitly requested tool scope",
    subagentSpawnBlockDecision: "SUBAGENT_SPAWN_BLOCK_DECISION_SCHEMA_VERSION ambient-subagent-spawn-block-decision-v1 resolveSubagentSpawnBlockDecision Sub-agent capacity was unavailable. capacityBlocked toolScopeBlocked launchDenialKind",
    subagentSpawnBlockDecisionTest: "gives capacity blocks precedence over tool-scope denials after reservation uses the capacity fallback reason when a blocked lease has no specific blockers turns launch denials into tool-scope blocks with approval-unavailable metadata allows launch when capacity is reserved and no launch denial is present",
    subagentPreRunSpawnFailureRecorder: "SUBAGENT_PRE_RUN_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION ambient-subagent-pre-run-spawn-failure-recorder-v1 recordSubagentPreRunSpawnFailure recordScheduledSubagentSpawnPolicyFailure buildSubagentPreRunSpawnFailureParentMailboxInput buildScheduledSubagentSpawnFailureParentMailboxInput",
    subagentPreRunSpawnFailureRecorderTest: "appends model-scope failures through the typed parent-mailbox builder preserves runtime preflight, capacity, and unavailable extension evidence appends scheduled-spawn policy failures before live child creation",
    subagentPostReservationSpawnFailureRecorder: "SUBAGENT_POST_RESERVATION_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION ambient-subagent-post-reservation-spawn-failure-recorder-v1 recordSubagentPostReservationSpawnFailure buildSubagentPostReservationSpawnFailureParentMailboxInput",
    subagentPostReservationSpawnFailureRecorderTest: "appends visible failed-child evidence for tool-scope launch blocks appends capacity failures without deleting reserved child evidence",
    subagentLaunchRejectionRecorder: "SUBAGENT_LAUNCH_REJECTION_RECORDER_SCHEMA_VERSION ambient-subagent-launch-rejection-recorder-v1 recordSubagentLaunchRejection subagent.spawn_rejected recordSubagentPostReservationSpawnFailure",
    subagentLaunchRejectionRecorderTest: "records a visible failed child for tool-scope launch rejections preserves capacity blocking evidence when marking a reserved child failed",
    subagentSpawnLaunchExecutor: "SUBAGENT_SPAWN_LAUNCH_EXECUTOR_SCHEMA_VERSION ambient-subagent-spawn-launch-executor-v1 executeSubagentSpawnLaunch recordSubagentLaunchRejection resolveSubagentSpawnBlockDecision buildSubagentSpawnRequestedRunEventInput buildSubagentTaskMailboxEventInput turnBudgetPolicy",
    subagentSpawnLaunchExecutorTest: "materializes successful required launches with snapshots, mailbox work, wait barrier, and runtime start records blocked post-reservation launches and fails required wait barriers",
    subagentFailedSpawnWaitBarrier: "SUBAGENT_FAILED_SPAWN_WAIT_BARRIER_SCHEMA_VERSION ambient-subagent-failed-spawn-wait-barrier-v1 resolveSubagentFailedSpawnWaitBarrier buildSubagentFailedSpawnWaitBarrierResolutionArtifact synthesisAllowed: false",
    subagentFailedSpawnWaitBarrierTest: "marks waiting required barriers failed when a reserved child spawn fails leaves already resolved barriers unchanged and idempotent",
    subagentResultValidation: "SUBAGENT_RESULT_VALIDATION_SCHEMA_VERSION ambient-subagent-result-validation-v1 validateSubagentResultForRun validateSubagentResultArtifactForSynthesis validateSubagentStructuredResultArtifactForRole validateSubagentCompletionGuard",
    subagentResultValidationTest: "blocks failed child artifacts from parent synthesis blocks completed implementation results without matching Ambient mutation evidence allows completed implementation results when structured evidence matches Ambient events",
    subagentWaitBarrierResolution: "SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION ambient-subagent-wait-barrier-resolution-v1 evaluateSubagentWaitBarrierForStore resolveSubagentWaitBarrierForRun resolveActiveSubagentWaitBarriersForRun",
    subagentWaitBarrierResolutionTest: "keeps required barriers waiting while active children can still finish fails required barriers when terminal unsafe children make synthesis impossible marks active barriers timed out without fabricating child output",
    subagentWaitContextResolver: "SUBAGENT_WAIT_CONTEXT_RESOLVER_SCHEMA_VERSION ambient-subagent-wait-context-resolver-v1 resolveSubagentWaitContext findSubagentWaitBarrierForRuns",
    subagentWaitContextResolverTest: "reuses matching aggregate barriers and preserves explicit quorum policy rejects aggregate waits across parent runs or with unrelated primary handles",
    subagentWaitAgentExecutor: "SUBAGENT_WAIT_AGENT_EXECUTOR_SCHEMA_VERSION ambient-subagent-wait-agent-executor-v1 executeSubagentWaitAgent approvalRequestRecords supervisorRequestRecords approvalResponseDeliveries resolveChildApprovalResponse followupChildRun waitTimedOutResolvesBarrier turnBudgetState turnBudgetWrapUpSteering turnBudgetWrapUpDelivery recordSubagentTurnBudgetWrapUpSteeringIfNeeded Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child. Child requested supervisor attention; parent mailbox records the request and the parent remains blocked until the child is synthesis-safe. Child sent a supervisor progress update; parent mailbox records the update while the parent keeps monitoring the child. Child approval response was delivered to the child runtime; the parent remains blocked until the child reaches a synthesis-safe result.",
    subagentWaitAgentExecutorTest: "records completed waits after runtime completion and barrier resolution waits on the latest reservation state without fabricating output when no runtime is attached records durable turn-budget wrap-up steering while a required child is still running delivers turn-budget wrap-up steering to an attached child follow-up runtime keeps turn-budget wrap-up steering queued when the runtime cannot accept it yet reports exhausted turn budget without fabricating a child result records child approval requests and leaves the parent blocked on the child wait barrier records child supervisor requests without treating them as child completion delivers queued approval responses to the child runtime before waiting again leaves approval responses queued when no child approval-response resolver is attached",
    subagentTurnBudgetWrapUpRecorder: "SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION recordSubagentTurnBudgetWrapUpSteeringIfNeeded shouldRecordSubagentTurnBudgetWrapUpSteering SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON buildSubagentTurnBudgetWrapUpSteeringMessage compactSubagentTurnBudgetWrapUpSteeringRecord operation: \"turn-budget-wrap-up\" subagent.followup_agent.queued",
    subagentTurnBudgetWrapUpRecorderTest: "queues one durable child follow-up when the turn budget reaches the wrap-up threshold replays existing wrap-up steering without duplicating mailbox or run events does not steer terminal, closed, non-due, or exhausted child runs builds explicit wrap-up instructions with partial-result semantics",
    subagentTurnBudgetExhaustionRecorder: "SUBAGENT_TURN_BUDGET_EXHAUSTION_RECORDER_SCHEMA_VERSION settleSubagentTurnBudgetExhaustionIfNeeded SUBAGENT_TURN_BUDGET_EXHAUSTED_EVENT_TYPE turn-budget-exhaustion",
    subagentWaitCompletionRecorder: "SUBAGENT_WAIT_COMPLETION_RECORDER_SCHEMA_VERSION ambient-subagent-wait-completion-recorder-v1 recordSubagentWaitCompletionMailboxIfNeeded nextSubagentWaitCompletionMailboxCreatedAt",
    subagentWaitCompletionRecorderTest: "records a delivered child-to-parent mailbox with matching run-event evidence returns existing mailbox evidence for idempotent replay does not record while a child and required wait barrier are still active",
    subagentWaitBarrierAttentionRecorder: "SUBAGENT_WAIT_BARRIER_ATTENTION_RECORDER_SCHEMA_VERSION ambient-subagent-wait-barrier-attention-recorder-v1 recordSubagentWaitBarrierAttentionParentMailboxIfNeeded buildSubagentWaitBarrierAttentionParentMailboxDraft",
    subagentWaitBarrierAttentionRecorderTest: "records queued parent attention for blocked required wait barriers records timed-out wait-for-child barriers so the parent can ask the user does not record optional background barriers",
    subagentSpawnFailure: "SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION SCHEDULED_SUBAGENT_AUTOMATION_DEFERRED_REASON buildSubagentPreRunSpawnFailureParentMailboxInput buildSubagentPostReservationSpawnFailureParentMailboxInput buildScheduledSubagentSpawnFailureParentMailboxInput compactSubagentRuntimeLaunchPreflightForPi compactSubagentModelScopeForPi compactSubagentParentMailboxForPi buildSubagentSpawnBlockedResultArtifact failureStage: \"runtime_launch_preflight\" failureStage: \"capacity\" failureStage: \"tool_scope\" scheduledSpawnFields cannot inherit live parent context",
    subagentSpawnFailureTest: "builds scheduled spawn failure mailbox payloads before live child creation builds post-reservation failed-child evidence without deleting the visible child thread compacts model, runtime, and capacity evidence for pre-run spawn failures",
    subagentSpawnRequest: "SUBAGENT_SPAWN_REQUEST_SCHEMA_VERSION SUBAGENT_TASK_MAILBOX_TYPE buildSubagentSpawnRequestedRunEventInput buildSubagentTaskMailboxEventInput ambient-subagent-spawn-request-v1 subagent.spawn_requested subagent.task childRunId parentThreadId toolScopeSnapshot turnBudgetPolicy wrapUpAtTurn single_steer_then_grace orchestrationStarted: false",
    subagentSpawnRequestTest: "builds schema-versioned spawn-request run events with bounded launch evidence builds schema-versioned task mailbox payloads with stable parent and child handles",
    subagentToolScopeSnapshot: "compactSubagentToolScopeSnapshot subagentToolScopeSnapshotDisplayMetadata callableWorkflowBridgeDisplayMetadata subagentToolScopeApprovalUnavailable deniedCategoryIdsFromSubagentToolScopeSnapshot deniedToolIdsFromSubagentToolScopeSnapshot callableWorkflowBridge ambient-subagent-tool-scope-display-metadata-v1 displayMetadata",
    subagentToolScopeSnapshotTest: "compacts exact launch scope and adds display metadata without dropping deny reasons adds callable workflow bridge display metadata from resolver inputs detects approval-unavailable state from persisted and compact snapshot shapes extracts unique denied ids from compact, persisted, and legacy payloads",
    subagentGroupJoin: "SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE SUBAGENT_GROUPED_COMPLETION_SCHEMA_VERSION buildSubagentGroupedCompletionNotificationDraft createSubagentGroupedCompletionPayloadFingerprint",
    subagentGroupJoinTest: "updates an existing child completion in place without creating duplicate child rows rebatches straggler completions into the latest queued parent notification",
    subagentGroupedCompletionRecorder: "SUBAGENT_GROUPED_COMPLETION_RECORDER_SCHEMA_VERSION ambient-subagent-grouped-completion-recorder-v1 recordSubagentGroupedCompletionNotificationIfNeeded subagentGroupedCompletionSummary",
    subagentGroupedCompletionRecorderTest: "records optional background completions with bounded artifact summaries does not record required, active, or unsafe completed children",
    subagentParentPolicyResolution: "SUBAGENT_PARENT_POLICY_RESOLUTION_SCHEMA_VERSION resolveSubagentParentPolicyForWait resolveSubagentParentPolicyForBarrierDecision allowedUserChoicesForSubagentWaitBarrier",
    subagentParentPolicyResolutionTest: "blocks parent synthesis while a required child barrier is still waiting requires user input before degrading a failed required barrier to partial keeps detach and cancel barrier decisions blocked and non-synthesizing",
    subagentWaitBarrierEvaluation: "SUBAGENT_WAIT_BARRIER_EVALUATION_SCHEMA_VERSION SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES evaluateSubagentWaitBarrierForSynthesis requiredSynthesisCountForBarrier waitBarrierStatusFromEvaluation",
    subagentWaitBarrierEvaluationTest: "uses explicit quorum thresholds and detects impossible quorum barriers resolves all-cancelled impossible barriers as cancelled resolves unsatisfied timed-out barriers as timed_out",
    subagentWaitMailbox: "SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION SUBAGENT_WAIT_BARRIER_ATTENTION_SCHEMA_VERSION buildSubagentWaitCompletionMailboxDraft buildSubagentWaitBarrierAttentionParentMailboxDraft shouldRecordSubagentWaitCompletion shouldRecordSubagentWaitBarrierAttention",
    subagentWaitMailboxTest: "builds stable delivered wait-completion mailbox and run-event drafts builds compact queued parent attention mailbox drafts with allowed choices",
    subagentBarrierDecision: "SUBAGENT_WAIT_BARRIER_DECISION_SCHEMA_VERSION SUBAGENT_USER_DECISION_SCHEMA_VERSION SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION buildSubagentBarrierDecisionParentMailboxDraft buildSubagentBarrierDecisionResolutionArtifact buildSubagentBarrierDecisionRunEventPreview subagentBarrierDecisionNextStatus",
    subagentBarrierDecisionTest: "builds explicit partial resolution artifacts with user decision provenance builds cancel-parent resolution artifacts with control-state provenance builds parent mailbox drafts and replays control state from existing artifacts",
    subagentBarrierDecisionRecorder: "SUBAGENT_BARRIER_DECISION_RECORDER_SCHEMA_VERSION ambient-subagent-barrier-decision-recorder-v1 recordSubagentBarrierDecisionParentMailbox buildSubagentBarrierDecisionParentMailboxDraft",
    subagentBarrierDecisionRecorderTest: "records a delivered parent mailbox event for explicit barrier control state replays persisted control state from the barrier resolution artifact",
    subagentBarrierControl: "SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE buildSubagentBarrierControlPlan buildSubagentBarrierControlRunPlan shouldMarkSubagentBarrierControlRunStatus buildSubagentBarrierCancelledMailboxPayload",
    subagentBarrierControlTest: "plans cancel-parent runtime cancellation with stable idempotency and source metadata marks only active mismatched statuses after runtime cancellation returns",
    subagentBarrierControlExecutor: "SUBAGENT_BARRIER_CONTROL_EXECUTOR_SCHEMA_VERSION ambient-subagent-barrier-control-executor-v1 executeSubagentBarrierControlDecision cancelPendingParentToChildMailboxEvents",
    subagentBarrierControlExecutorTest: "cancels active children through the runtime and cancels pending parent-to-child mailbox work does not overwrite terminal runtime results during cancel-parent control",
    subagentBarrierDecisionExecutor: "SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION ambient-subagent-barrier-decision-executor-v1 executeSubagentBarrierDecision executeSubagentBarrierControlDecision recordSubagentBarrierDecisionParentMailbox",
    subagentBarrierDecisionExecutorTest: "records partial barrier decisions across barrier, child, and parent mailbox evidence replays existing barrier decisions without repeating child side effects",
    subagentMailbox: "SUBAGENT_MAILBOX_DELIVERY_BATCH_SCHEMA_VERSION ambient-subagent-mailbox-delivery-batch-v1 listSubagentMailboxEventsForDelivery deliverQueuedParentToChildMailboxEvents consumeDeliveredParentToChildMailboxEvents cancelPendingParentToChildMailboxEvents",
    subagentMailboxTest: "delivers queued parent-to-child events idempotently consumes delivered events and cancels pending parent-to-child events without touching terminal mailbox state",
    subagentMailboxRequest: "SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION SUBAGENT_CHILD_MESSAGE_MAILBOX_TYPE SUBAGENT_CHILD_FOLLOWUP_MAILBOX_TYPE resolveSubagentChildMailboxRequest createSubagentChildMailboxRequestIdempotencyKey buildSubagentChildMailboxEventInput buildSubagentChildMailboxRunEventInput buildSubagentChildMailboxThreadMessage compactSubagentChildRuntimeFollowup supervisorRequestParentMailboxEventId supervisorChoiceId",
    subagentMailboxRequestTest: "maps send and followup actions to typed mailbox and run-event contracts links parent steering to a child supervisor request without raw parent payloads builds replay and runtime followup summaries without exposing raw payloads",
    subagentChildMailboxExecutor: "SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION ambient-subagent-child-mailbox-executor-v1 executeSubagentChildMailbox buildSubagentChildMailboxEventInput",
    subagentChildMailboxExecutorTest: "queues parent-to-child messages with matching run-event and child-thread evidence queues supervisor steering with matching child mailbox metadata hands followups to the runtime with delivery state callbacks and runtime event emitters",
    subagentTurnBudget: "SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION resolveSubagentTurnBudgetPolicy compactSubagentTurnBudgetPolicyForPi evaluateSubagentTurnBudgetForEvents compactSubagentTurnBudgetStateForPi turnBudgetPolicy turnBudgetState wrapUpAtTurn wrap_up_due max_turns_exceeded single_steer_then_grace",
    subagentTurnBudgetTest: "derives wrap-up and partial exhaustion policy from role guard limits compacts the policy for Pi-visible launch evidence",
    subagentAgentStatus: "SUBAGENT_AGENT_STATUS_SCHEMA_VERSION SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION compactSubagentRunForPi compactSubagentCapacityLeaseForPi compactSubagentTurnBudgetPolicyForPi buildSubagentListAgentsText buildSubagentStatusText",
    subagentAgentStatusTest: "lists child runs with canonical paths and close state builds status text with event counts and parent synthesis state",
    sharedSubagentToolScope: "UNSUPPORTED_CHILD_BRIDGE_PI_VISIBLE_SOURCES child-safe bridge Callable workflow tool is outside the child role policy allowlist.",
    sharedSubagentContractsTest: "denies Pi-visible direct MCP and connector sources until child-safe bridges exist",
    symphonyWorkflowRecipes: "SYMPHONY_WORKFLOW_RECIPE_SCHEMA_VERSION AMBIENT_SUBAGENTS_FEATURE_FLAG SYMPHONY_WORKFLOW_PATTERN_IDS map_reduce adversarial_debate imitate_and_verify pipeline ensemble self_healing_loop defaultCollapsedChildThreads diagramSvg allowCustom: true objective_metric rubric verifier_criteria estimated_agents token_cost_budget tool_mutation_scope checkpoint_resume approval_failure_handling parent_pi_visible_by_default child_role_policy_required json_schema_then_repair compactInvocationByDefault",
    symphonyWorkflowRecipesTest: "defines all six planned Symphony patterns behind ambient.subagents requires conversational Custom choices and metric or rubric templates for every pattern keeps launch cards, callable workflow tools, and recorder policy aligned with the plan",
    callableWorkflowRegistry: "CALLABLE_WORKFLOW_REGISTRY_SCHEMA_VERSION CALLABLE_WORKFLOW_TOOL_SCHEMA_VERSION CALLABLE_WORKFLOW_RUN_PLAN_SCHEMA_VERSION CALLABLE_WORKFLOW_CATALOG_STATUS_SCHEMA_VERSION buildCallableWorkflowRegistry buildCallableWorkflowCatalogStatus compileSymphonyRecipeToCallableWorkflowTool compileRecordedWorkflowPlaybookToCallableWorkflowTool parentPiVisibleCallableWorkflowTools childVisibleCallableWorkflowTools validateCallableWorkflowToolInput repairCallableWorkflowToolInput buildCallableWorkflowRunPlan recordedWorkflowPlaybooks recordedWorkflowToolName catalogStatus excludedRecordedWorkflowCount recorded_workflow excluded_not_callable hidden_feature_disabled parent_pi_visible child_role_policy_required visible_background_task defaultCollapsedChildThreads tokenCostTracking pauseResumeCancel nestedFanoutLimitRequired recorded_playbook_confirmed input_schema_confirmed trace_diagnostics_artifact recorderCompactInvocationByDefault fullTraceArtifact json_schema_then_repair",
    callableWorkflowRegistryTest: "hides all Symphony workflow tools when ambient.subagents is off compiles Symphony presets into parent-visible callable workflow tools when enabled compiles confirmed recorded playbooks into gated callable workflow tools compiles one confirmed recorded playbook for compact recorder invocation previews builds callable workflow catalog status with child-gated tools and excluded recorded playbook reasons keeps child callable workflow tools blocked unless role policy and nested fanout limit allow them validates and deterministically repairs callable workflow input before building a run plan",
    callableWorkflowPiTools: "CALLABLE_WORKFLOW_PI_TOOLS_RUNTIME CALLABLE_WORKFLOW_PI_TOOLS_PHASE callableWorkflowActiveToolNamesForThread createCallableWorkflowPiToolDefinitions getChildCallableWorkflowToolNames childCallableWorkflowToolNames parentPiVisibleCallableWorkflowTools queued_not_started workflowRunPlan workflowExecutionPlan workflowTask startCallableWorkflowTask runnerBridgeStatus Cannot launch a callable workflow without an active parent run Cannot launch a callable workflow without a persistent workflow task queue Ambient queued a visible workflow background-task handoff Preparing callable workflow background task starts Ambient's workflow runner",
    callableWorkflowPiToolsTest: "exposes no parent-Pi workflow tools when ambient.subagents is off or the thread is a child exposes only exact child-granted callable workflow tools and queues them against the child run refuses stale child callable workflow tools after the child grant is revoked creates parent-visible Symphony and recorded workflow tools with run-plan execution contracts starts the configured runner bridge after queueing the persistent workflow task refuses launchable workflow calls without an active parent run refuses launchable workflow calls without a persistent task queue refuses stale workflow execution after the feature flag is disabled returns schema validation errors instead of executing irreparable workflow input",
    agentRuntimeCallableWorkflowTools: "childCallableWorkflowToolNames getChildCallableWorkflowToolNames",
    agentRuntimeCallableWorkflowToolsTest: "forwards child callable workflow grants to active-name checks and tool creation",
    agentRuntimeAmbientWorkflowReadOnlyTools: "ambient_workflows_callable_catalog ambient_workflows_callable_describe buildCallableWorkflowRegistry catalogStatus getFeatureFlagSnapshot getCallableWorkflowRecordedPlaybooks Callable workflow launch tools are not Pi-visible while ambient.subagents is disabled. visibleToolNames excludedEntryIds includeExcluded sourceKind query matchedEntryCount sourcePreviewIncluded visibleToolName",
    agentRuntimeAmbientWorkflowReadOnlyToolsTest: "reports callable catalog status without hidden launch tool names while subagents are disabled reports enabled callable catalog tool names, child policy gates, and excluded recorded workflow reasons searches callable catalog entries by query while preserving feature-gated tool visibility describes one callable workflow catalog entry with bounded source preview and visible launch name describes disabled callable catalog metadata without revealing hidden launch tool names",
    desktopToolRegistry: "ambient_workflows_callable_catalog ambient_workflows_callable_describe Inspect feature-flag-aware callable Symphony and recorded workflow catalog eligibility without launching workflows. Describe one callable Symphony or recorded workflow catalog entry with full bounded source preview",
    desktopToolRegistryTest: "ambient_workflows_callable_catalog ambient_workflows_callable_describe",
    callableWorkflowExecutionPlan: "CALLABLE_WORKFLOW_EXECUTION_PLAN_SCHEMA_VERSION buildCallableWorkflowExecutionPlan CallableWorkflowCallerProvenance callerProvenance queued_not_started callable_workflow_background_task workflowCompilerService callable_workflow_runner_not_connected compile_callable_workflow_to_artifact persist_workflow_run emit_workflow_run_started pauseResumeCancel tokenCostTracking",
    callableWorkflowExecutionPlanTest: "creates a visible queued background-task handoff with blocking and cancel metadata preserves child caller provenance for runner handoff and approval/worktree evidence produces stable launch ids for the same parent run, tool call, tool, and input",
    callableWorkflowTaskQueue: "CallableWorkflowTaskSummary CALLABLE_WORKFLOW_TASK_QUEUE_SCHEMA_VERSION CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE callableWorkflowQueuedTaskDraftFromExecutionPlan analyzeCallableWorkflowTaskRestartState buildCallableWorkflowCompilerHandoffPlan callerProvenance beginCallableWorkflowTaskCompilerHandoff linkCallableWorkflowTaskArtifact markCallableWorkflowTaskRunStarted markCallableWorkflowTaskRunFinished callableWorkflowTaskCallerProvenanceEventData callerKind childThreadId subagentRunId worktreeIsolated nestedFanoutSource childThreadRunId failCallableWorkflowTask workflow_run_terminal_task_unfinished missing_workflow_artifact staleWorkflowArtifactTaskIds workflow_artifact_not_compiled workflow_run_not_started workflow_run_started workflow_run_succeeded callable_workflow.task_started callable_workflow.task_finished compile_then_start_workflow_run workflowTask persistent workflow task queue includes child caller provenance on callable workflow restart issues",
    callableWorkflowTaskQueueTest: "persists queued visible background workflow tasks idempotently by launch id rejects callable workflow tasks whose parent run belongs to another thread builds queue drafts directly from visible execution-plan metadata carries child caller provenance into the compiler handoff plan records child caller attribution on started, control, and finished workflow task events transitions queued tasks through compiler handoff, artifact link, and started workflow run analyzes callable workflow task restart state without mutating task evidence reconciles callable workflow tasks whose linked run finished while the app was down reports stale callable workflow artifact pointers without deleting task evidence rejects workflow run linkage when the run belongs to a different artifact records failed compiler handoff state without deleting task evidence cancels queued callable workflow tasks without deleting launch evidence cancels running callable workflow tasks and records one finished event relinks paused callable workflow tasks to resumed workflow runs hydrates linked workflow progress and usage snapshots on task summaries",
    callableWorkflowRunner: "CALLABLE_WORKFLOW_RUNNER_BRIDGE_SCHEMA_VERSION executeCallableWorkflowTask validateCallableWorkflowRunnerExecutionBoundary refused child-originated mutating workflow artifact startCallableWorkflowTask runnerBridgeStatus",
    callableWorkflowRunnerTest: "compiles queued callable workflow tasks into artifacts and starts workflow execution passes child caller provenance through runner handoff to the workflow compiler refuses child-originated mutating workflow artifacts without child approval and worktree isolation allows child-originated mutating workflow artifacts with child-scoped approval and active isolated worktree evidence validates child mutating workflow boundaries with child identifiers before run handoff records compiler failure on the queued task without deleting launch evidence returns canceled when cancellation wins a later runner failure race",
    callableWorkflowDogfoodEvidence: "CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_SCHEMA_VERSION buildCallableWorkflowDogfoodEvidence validateCallableWorkflowDogfoodEvidence summarizeCallableWorkflowDogfoodEvidence launchCard workflow_launch_card_bounds workflow_mutating_child_worker workflow_parent_blocking_completion workflow_denied_child_scope workflow_restart_repair maturityAssertions subagent_child_thread child_bridge_policy this_child_thread staged_until_approved mutationOutput staged_file stagedRelativePath fullArtifactPath boundedPreview previewTruncated parentWorkspaceUnchanged Mutating worker dogfood wrote a concrete staged file parentBlocking blockedBeforeCompletion unblockedAfterCompletion CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION callableWorkflowParentBlockingIdempotencyKey deniedWorkflowScopeProof deniedScope SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION phase4_isolation_required workflow.call callable_workflow:ambient_workflow_symphony_map_reduce Callable workflow child bridge is disabled by child role policy. Callable workflow child bridge requires an active isolated child worktree. Callable workflow child bridge is unavailable because the nested fanout limit is exhausted. workflow_run_terminal_task_unfinished terminalRepairObserved maturityAssertions: workflow_launch_card_bounds:passed Callable workflow dogfood maturity assertion workflow_parent_blocking_completion status is failed; expected passed. secret-like material",
    callableWorkflowDogfoodEvidenceTest: "builds mutating child workflow dogfood evidence with restart repair proof AMBIENT_CALLABLE_WORKFLOW_DOGFOOD_EVIDENCE_OUT writeCallableWorkflowDogfoodEvidenceArtifact mutationOutput: staged_file parentBlocking: blocked=true unblocked=true deniedScope: workflow.call / callable_workflow:ambient_workflow_symphony_map_reduce rejects dogfood evidence that drops child-scoped approval, mutation output, or restart repair proof Callable workflow dogfood mutation output must prove the parent workspace was unchanged. Callable workflow dogfood must prove parent synthesis was blocked before workflow completion. Callable workflow dogfood denied-scope proof is missing disabled child role policy reason.",
    callableWorkflowRehydrationEvidence: "CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_SCHEMA_VERSION buildCallableWorkflowRehydrationEvidence validateCallableWorkflowRehydrationEvidence summarizeCallableWorkflowRehydrationEvidence workflow_rehydrated_task_links workflow_rehydrated_artifact_payload workflow_rehydrated_progress_usage workflow_rehydrated_child_provenance maturityAssertions sameTaskId sameArtifactId sameRunId workflowThreadHydrated artifactSourcePathHydrated artifactStatePathHydrated artifactMutationPolicyHydrated artifactSpecHydrated sourcePath statePath mutationPolicy specGoal progressHydrated usageHydrated progressSnapshot usageSnapshot subagent_child_thread child_bridge_policy callable_workflow.task_started step.end maturityAssertions: workflow_rehydrated_task_links:passed Callable workflow rehydration maturity assertion workflow_rehydrated_progress_usage status is failed; expected passed. secret-like material",
    callableWorkflowRehydrationEvidenceTest: "builds restart rehydration evidence for linked task artifacts, runs, progress, and usage AMBIENT_CALLABLE_WORKFLOW_REHYDRATION_EVIDENCE_OUT writeCallableWorkflowRehydrationEvidenceArtifact rehydratedLinks: task=true artifact=true run=true artifact: source=true state=true mutation=staged_until_approved spec=true telemetry: events=4 modelCalls=1 tokens=21 rejects rehydration evidence without task links, artifact payloads, telemetry, or child provenance Callable workflow rehydration proof is missing workflowThreadHydrated. Callable workflow rehydration proof is missing artifactSourcePathHydrated. Callable workflow rehydration must prove child-originated caller provenance.",
    subagentLifecycleEdgeEvidence: "SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_SCHEMA_VERSION SUBAGENT_LIFECYCLE_EDGE_KINDS buildSubagentLifecycleEdgeEvidence validateSubagentLifecycleEdgeEvidence summarizeSubagentLifecycleEdgeEvidence restart stop detach cancel retry timeout partial_result retryRequestedRunIds retryAcceptedRunIds retryMailboxEventIds parentRemainedBlocked childSessionRestarted parentDidNotSynthesizeUnsafeChild resultArtifactStateExplicit affectedChildrenNamed decisionOrEventAttributed visibleCollapsedThreadState restartRepairObserved structuredCancellationResult detachedChildrenExcludedFromSynthesis parentCancellationRequested noTimedOutChildSynthesis failedChildNotSynthesized",
    subagentLifecycleEdgeEvidenceTest: "builds lifecycle edge evidence for restart, stop, detach, cancel, retry, timeout, and partial results AMBIENT_SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_OUT writeSubagentLifecycleEdgeEvidenceArtifact coveredEdges: restart, stop, detach, cancel, retry, timeout, partial_result rejects missing edge coverage and unsafe synthesis states rejects edge-specific contract gaps and secret-like evidence",
    workflowCompilerService: "WorkflowCompilerCallableInvocationContext workflowCompilerCallableInvocationContextFromRunnerInput workflowCompilerCallableInvocationCallerLines callerProvenance",
    workflowCompilerServiceTest: "adds callable workflow invocation provenance to compiler prompt mutable context persists callable workflow invocation provenance through compiler artifacts and audit events",
    callableWorkflowParentBlocking: "CALLABLE_WORKFLOW_PARENT_BLOCKING_SCHEMA_VERSION CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE CALLABLE_WORKFLOW_PARENT_BLOCKING_REASON resolveCallableWorkflowParentBlocking callableWorkflowParentBlockingIdempotencyKey callableWorkflowParentBlockingAllowedUserChoices blocking_callable_workflow_not_synthesis_safe waiting_on_workflow needs_attention Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    callableWorkflowParentBlockingTest: "blocks parent finalization while blocking callable workflow tasks are unresolved does not block when every blocking callable workflow task has succeeded",
    subagentBatchJobs: "parentMessageId?: string SUBAGENT_BATCH_RESULT_REPORT_SCHEMA_VERSION SUBAGENT_BATCH_RESULT_LEDGER_SCHEMA_VERSION SUBAGENT_BATCH_RESULT_LEDGER_VALIDATION_SCHEMA_VERSION validateSubagentBatchResultLedgerExactlyOnce invalid_ledger reportsByItemId reportIds",
    subagentBatchJobsTest: "parentMessageId: \"parent-message\" accepts each item result exactly once and treats identical replay as a duplicate no-op validates exactly-once ledger invariants before accepting new reports rejects conflicting reports for an already reported item",
    localTextDelegation: "prepareLocalTextDelegationRuntimePlan enforceLocalModelResourceLaunchPolicy validateLocalModelResourcePolicySnapshot ambient-local-model-resource-policy-validation-v1 requestedLaunch resourcePolicyEnforcement invocationLimits ambient-local-text-delegation-invocation-limits-v1 launchReadiness ambient-local-text-runtime-launch-readiness-v1 preflightChildLaunch ambient-subagent-child-runtime-launch-preflight-v1 killLocalModelProcess completeLocalTextDelegation max_tokens outputValidation ambient-local-text-output-validation-v1 requiresFullOutputArtifact ambient-local-model-runtime-acquisition-v1 runtimeAcquisition compactLocalModelRuntimeAcquisition compactLocalModelRuntimeState runtimeState compactLocalModelRuntimeRelease runtimeRelease ambient-local-model-runtime-release-v1 releaseLocalTextRuntimeLease LocalTextDelegationRuntimeFailureError ambient-local-text-delegation-failure-v1 appendTerminalLocalTextReleaseEvidence ambient-local-text-terminal-release-v1 localTextOutputValidationPreview localTextRuntimePreflightPreview localTextResourcePolicyEnforcementLabel localRuntimeRowsForRun",
    localTextDelegationTest: "blocks local invocations that cannot fit the model context window does not acquire a runtime when requested local output exceeds the model max output limit does not acquire a runtime when the local launch descriptor is malformed unloads idle local model runtimes before acquiring when memory policy requires cleanup unloaded-idle preserves local text output validation evidence with completion results records local text output validation evidence in completed run events reuses a healthy persisted runtime after manager recreation returns idle cleanup timing when the final lease is released but the runtime stays warm keeps a reused local runtime alive until the final lease is released records still-leased runtime evidence in completed local text events preserves completed local text output when runtime release fails records completed local text events when runtime release fails records runtime release evidence when local text completion fails after acquire does not let a late local completion overwrite parent cancellation",
    localTextSubagentRuntime: "createLocalTextSubagentRuntimeAdapter validateLocalModelResourcePolicySnapshot requestedLaunch resourcePolicyEnforcement invocationLimits launchReadiness ambient-local-text-runtime-launch-readiness-v1 preflightChildLaunch ambient-subagent-child-runtime-launch-preflight-v1 buildResourceRegistryForLaunch residentDetection localTextStateRootPath killLocalModelProcess subagent.local_text_runtime_failed Local runtime acquisition source: \"persisted\" source: \"active\" Local runtime release releasedAt idleCleanupDueAt localModelRuntimeIdleCleanupDueAt cleanup due still-leased status: \"failed\" release store unavailable subagent.local_text_release_after_failure subagent.local_text_release_after_cancel subagent.local_text_release_after_partial terminalStatus: \"failed\" Local text runtime lease released after the child reached failed. Local text runtime lease released after the child was cancelled. Text output valid full artifact required Context: Local runtime memory",
    localTextSubagentRuntimeTest: "preflights local launch readiness before runtime start preflights local memory capacity before runtime start preflights custom local text runtime state roots as active memory evidence blocks local launch capacity when the resource policy snapshot contradicts its memory ceiling fails before acquiring the runtime when the local prompt exceeds model context limits fails before acquiring the runtime when the local launch descriptor is malformed records structured runtime startup failure evidence in the visible child thread unloads idle local runtimes and records enforcement before the visible child runs unloaded-idle shows local runtime lease state rows from completed local text events shows still-leased local runtime release evidence in inspector rows shows local runtime release failures in inspector rows shows local runtime release evidence from failed local text events shows terminal local runtime release evidence from strict budget failures shows local runtime release evidence from cancelled local text events shows local text output validation evidence in recent events shows local text runtime preflight evidence in recent events",
    localModelRuntimeManager: "LocalModelRuntimeManager LocalModelRuntimeStartupError ambient-local-model-runtime-startup-failure-v1 probeLocalModelRuntimeHealth LocalModelRuntimeLeaseRecoverySummary ambient-local-runtime-lease-recovery-v1 readRepairedLocalModelRuntimeLeaseJournalsWithRecovery",
    localModelRuntimeManagerTest: "LocalModelRuntimeManager LocalModelRuntimeStartupError throws structured startup failure evidence when health never becomes ready probeLocalModelRuntimeHealth reports stale persisted lease recovery when a dead runtime pid is repaired to crashed",
    localRuntimeInventory: "buildLocalRuntimeInventory ambient-local-runtime-inventory-v1 buildLocalRuntimePolicyHandoff localRuntimeLifecycleDecision",
    localRuntimeInventoryTest: "joins active sub-agent leases to local runtime rows and blocks ordinary Stop treats active-looking sub-agent leases as stale only when a freshness window is supplied",
    localModelRuntimeStatus: "buildLocalModelRuntimeStatusSnapshot localModelRuntimeStatusText leaseRecovery Lease recovery: actions Stop disabled, Restart disabled, Start disabled, Unload disabled",
    localModelRuntimeStatusTest: "joins active sub-agent leases into read-only runtime inventory stop blockers surfaces stale lease evidence without blocking ordinary Stop repairs dead persisted runtime owner leases as crashed status evidence",
    localModelRuntimeStart: "planLocalModelRuntimeStart ambient-local-model-runtime-start-plan-v1 localModelRuntimeStartText",
    localModelRuntimeStartTest: "blocks active sub-agent leases and reports the load decision reason blocks Start when the target load violates local memory policy blocks untracked local model processes",
    localModelRuntimeStop: "planLocalModelRuntimeStop ambient-local-model-runtime-stop-plan-v1 localModelRuntimeStopText",
    localModelRuntimeStopTest: "blocks active sub-agent leases and explains force requirements blocks malformed active owner leases without offering forced Stop",
    localModelRuntimeRestart: "planLocalModelRuntimeRestart ambient-local-model-runtime-restart-plan-v1 localModelRuntimeRestartText",
    localModelRuntimeRestartTest: "blocks Restart when reloading a stopped runtime violates local memory policy blocks malformed active owner leases without offering forced Restart",
    agentRuntimeLocalRuntimeTools: "createLocalRuntimeToolExtension ambient_local_model_runtime_start ambient_local_model_runtime_stop ambient_local_model_runtime_restart localRuntimeOwnershipResolutionRequest localRuntimeOwnershipResolutionAfterInventoryRefresh",
    agentRuntimeLocalRuntimeToolsTest: "runs provider-declared Start, Stop, and Restart for voice runtime rows resolves forced provider-declared Stop ownership before stopping a sub-agent owned runtime",
    localRuntimeOwnershipResolution: "localRuntimeOwnershipResolutionRequest localRuntimeOwnershipResolutionAfterInventoryRefresh cancel-or-mark-affected-subagents",
    localModelResourceRegistry: "enforceLocalModelResourceLaunchPolicy validateLocalModelResourcePolicySnapshot ambient-local-model-resource-policy-validation-v1 requestedLaunch unloaded-idle residentDetection localTextStateRootPath",
    localModelResourceRegistryTest: "discovers Ambient-managed local text runtime state through detector options unloads idle candidates before launch when unload-idle behavior is configured validates local-memory policy snapshots before launch enforcement rejects policy decisions that understate snapshotted requested launch memory",
    localTextSubagentStartupConfig: "localTextSubagentStartupFeatureFromEnv resolveRuntimeForMain selectableAsMain: true AMBIENT_LOCAL_TEXT_SUBAGENT_COMMAND AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_URL",
    localTextSubagentStartupConfigTest: "builds an available local text profile and runtime descriptor from startup env does not enable local profiles for partial or invalid descriptors",
    subagentParentClusterUiModel: "subagentParentClusterModelsByMessageId barrierChildCountLabel barrierBlockingChildLabels blockingChildLabels quorumThreshold spawnFailureActivity toolScopeFailureDetail Approval unavailable childApprovalRequestActivity childApprovalForwardedActivity Approval requested Approval forwarded Approval needed parentBlocker withChildBlockerMeta metaLabels Elapsed: Latest: Blocking: approval Blocking: needs decision Blocking: completion guard Blocking: child queued Blocking: child starting Blocking: child running Blocking: child waiting Ready: child complete Blocking: child failed Blocking: child timed out Blocking: child cancelled waitBarrierAttentionActivity waitBarrierDecisionActivity SubagentParentClusterMailboxActionModel waitBarrierChoiceAction toolAction resolve_barrier actionLabels SubagentParentClusterApprovalActionModel approvalActions childApprovalRequestActions supervisorRequestActivity latestQueuedSupervisorRequestForRun Supervisor request Child progress Child detached Parent cancelled Parent cancellation requested Retry requested retry-requested-runs SubagentParentClusterLifecycleEffectModel lifecycleEffectRows barrierDecisionLifecycleEffectRows effectRows Cancelled 1 child SubagentParentClusterWorkflowTaskBlockerModel callableWorkflowParentBlockingActivity callableWorkflowTaskModel workflowTaskParentBlockers workflowTaskParentBlockerKind Blocking: workflow work Blocking: workflow attention callableWorkflowTaskCanCancel callableWorkflowTaskCanPause callableWorkflowTaskCanResume callableWorkflowTaskTelemetryLabels telemetryLabels provenanceLabels Caller: sub-agent child Approval: Child Bridge Policy Worktree: isolated Nested fanout: Child Bridge Policy workflowThreadId workflowThreadLabel Workflow thread: canOpenWorkflowThread openWorkflowThreadTitle Open workflow thread Workflow blocked Callable workflow background tasks subagent-parent-cluster-mailbox-action subagent-parent-cluster-lifecycle-effect subagent-parent-cluster-workflows subagent-parent-cluster-workflow-blocker sourceLabel Child source: Workflow source: cancelTitle pauseTitle resumeTitle canOpenThread openThreadTitle childThreadSummaryRetained Summary retained retentionTitle canCancelChildRun canCloseChildRun Cancel sub-agent Close sub-agent",
    subagentParentClusterUiModelTest: "surfaces unresolved required wait barriers on the parent cluster Reading repository context surfaces quorum thresholds on collapsed parent barriers surfaces persisted detach and parent-cancel wait-barrier decisions on collapsed barriers surfaces retry wait-barrier decisions as active parent-blocking lifecycle effects Retry requested retry-requested-runs surfaces wait-barrier attention from parent mailbox activity leaves non-resolution wait-barrier choices visible but not clickable Cancel parent run surfaces wait-barrier decisions from parent mailbox activity surfaces detach and cancel wait-barrier decisions from parent mailbox activity surfaces child-source labels for approval and lifecycle mailbox activity labels child approval requests and forwarded decisions in the collapsed cluster marks approval-blocked required children with warning blocker indicators Approve child approval returns approved children to ordinary wait-barrier blocking indicators surfaces queued child supervisor requests as parent-blocking attention surfaces child supervisor progress updates without parent-blocking actions marks active required children in waiting barriers with status-specific blockers Elapsed: 1m 30s Latest: running activity marks terminal unsafe children in waiting barriers with status-specific blockers marks completed children in waiting barriers as ready while siblings still block Blocking: completion guard Mutation evidence: structured 1 / Ambient 1 / isolated worktree 1 / approval 0 marks completed and attention children closeable while preserving closed labels surfaces summary-retained children without open or control affordances creates a parent cluster for anchored blocking workflow tasks without child runs surfaces failed blocking workflow tasks as needs-attention mailbox activity marks callable workflow task rows that are blocking parent finalization surfaces queued callable workflow tasks as visible background rows surfaces callable workflow caller provenance in collapsed parent clusters surfaces callable workflow task progress and usage telemetry Workflow thread: workflow-thread-1 Open workflow thread workflow-thread-1 Pause blocking workflow task marks paused callable workflow tasks resumeable only when the linked run can resume surfaces failed callable workflow tasks as needs-attention rows surfaces spawn-failure model diagnostics from parent mailbox activity surfaces tool-scope approval-unavailable details from parent mailbox activity creates a parent cluster for anchored batch progress without child runs creates a parent cluster for anchored grouped completions without child run models creates an attention cluster for anchored child lifecycle interruptions without child runs creates a partial cluster for anchored runtime budget partials without child runs surfaces anchored parent-stop cascades as parent mailbox activity creates a parent cluster for anchored spawn failures without child runs",
    subagentParentClusterComponent: "SubagentParentCluster SubagentParentClusterProps subagent-parent-cluster-child-row subagent-parent-cluster-child-blocker subagent-parent-cluster-barrier-child subagent-parent-cluster-lifecycle-effect subagent-parent-cluster-workflow-launch-card subagent-parent-cluster-workflow-provenance subagent-parent-cluster-workflow-action is-open is-pause is-resume subagent-parent-cluster-workflow-blocker Callable workflow background tasks subagent-parent-cluster-mailbox-action subagent-parent-cluster-mailbox-action is-button Open workflow thread for Cancel workflow task Pause workflow task Resume workflow task Cancel sub-agent Close sub-agent Summary retained",
    subagentParentClusterComponentTest: "renders production-visible child, barrier, workflow, provenance, and action surfaces Caller: sub-agent child Approval: Child Bridge Policy Worktree: isolated Nested fanout: Child Bridge Policy class=\"subagent-parent-cluster\" class=\"subagent-parent-cluster-lifecycle-effect tone-danger\" Cancelled 1 child Parent cancellation requested aria-label=\"Callable workflow background tasks\" aria-label=\"Sub-agent wait barriers\" aria-label=\"Sub-agent mailbox activity\" aria-label=\"Cancel sub-agent Reviewer\" aria-label=\"Close sub-agent Summarizer\"",
    subagentParentClusterFixture: "subagentParentClusterFixtureModel Caller: sub-agent child Approval: Child Bridge Policy Worktree: isolated Nested fanout: Child Bridge Policy Blocking: approval Blocking: workflow work Summary retained effectRows Cancelled 1 child Parent cancellation requested",
    subagentParentClusterComponentVisualTest: "captures browser-rendered collapsed, expanded, provenance, blocker, and narrow states collapsedInitially horizontalOverflowFree subagent-parent-cluster-visual analyzePng nonBlackRatio distinctColorCount Caller: sub-agent child Worktree: isolated lifecycleEffectChips Parent cancellation requested",
    subagentIntegratedProductionUiVisualTest: "captures chat clusters, child inspector, replay, repair, and local runtime ownership together subagent-integrated-production-ui Actual chat surface with sub-agent parent cluster SubagentThreadInspector LocalModelsRuntimeInventory SubagentReplayEvidenceDiagnostics LocalRuntimeEvidenceDiagnostics SubagentRepairDiagnostics DiagnosticExportHistory Local runtime evidence Runtime rows Active owners Memory evidence In use by sub-agent Review worker Stop disabled Ordinary Stop/Restart blocked by 1 active sub-agent lease: lease-review Parent cancellation requested Lifecycle Cancel Parent connector_app:gmail.search Workflow bridge Disabled / 0/0 nested fanout slots remaining / 0 allowed tools Callable workflow child bridge is disabled by child role policy. Workflow Call (workflow.call) ambient_workflow_symphony_map_reduce Callable workflow tasks Callable workflow Active Task Interrupted artifact linked run linked child_bridge_policy",
    subagentThreadInspectorComponent: "SubagentThreadInspector subagent-thread-inspector Sub-agent run details Sub-agent wait barrier Sub-agent tool scope Recent sub-agent events Sub-agent repair diagnostics",
    appModalHost: "subagentApprovalScopeOptions Approve child request Deny child request Approval scope This child thread Parent thread tree Project/workspace Resolve sub-agent barrier Blocking child Decision note Partial summary Resolve barrier",
    rendererApp: "subagent-parent-cluster-child-blocker subagent-parent-cluster-barrier-child subagent-parent-cluster-child-blocker-context subagent-parent-cluster-child-blocker-meta subagent-parent-cluster-child-action subagent-parent-cluster-child-thread subagent-parent-cluster-child-open subagent-parent-cluster-child-open is-retained subagent-parent-cluster-child-row cancelSubagentChild closeSubagentChild resolveSubagentBarrierAction submitSubagentBarrierDecisionDialog subagentBarrierDecisionDialog SubagentBarrierDecisionDialog Resolve sub-agent barrier Blocking child Decision note Partial summary Resolve barrier onResolveBarrierAction subagentBarrierActionBusy resolveSubagentWaitBarrier resolveSubagentApprovalAction submitSubagentApprovalDecisionDialog subagentApprovalDecisionDialog SubagentApprovalDecisionDialog subagentApprovalScopeOptions Approve child request Deny child request Approval scope This child thread Parent thread tree Project/workspace cancelSubagentRun closeSubagentRun Cancel sub-agent Close sub-agent Summary retained subagent-parent-cluster-workflow-blocker Callable workflow background tasks subagent-parent-cluster-mailbox-action subagent-parent-cluster-mailbox-action is-button subagent-parent-cluster-workflows workflowThreadLabel openCallableWorkflowThread ensureWorkflowAgentChatThread Open workflow thread for cancelCallableWorkflowTask pauseCallableWorkflowTask resumeCallableWorkflowTask Cancel workflow task Pause workflow task Resume workflow task subagent-parent-cluster-workflow-action is-open is-pause is-resume",
    rendererStyles: "subagent-approval-dialog subagent-approval-scope-list subagent-barrier-dialog subagent-barrier-dialog-field subagent-parent-cluster-child-blocker subagent-parent-cluster-barrier-child subagent-parent-cluster-lifecycle-effect subagent-parent-cluster-child-blocker-context subagent-parent-cluster-child-blocker-meta subagent-parent-cluster-child-action subagent-parent-cluster-child-thread subagent-parent-cluster-child-open subagent-parent-cluster-child-open is-retained subagent-parent-cluster-child-row subagent-parent-cluster-workflow-blocker subagent-parent-cluster-mailbox-action subagent-parent-cluster-mailbox-action.is-button subagent-parent-cluster-workflows subagent-parent-cluster-workflow-action is-open is-pause is-resume",
    subagentThreadInspectorUiModel: "waitBarrierEvaluationRows waitBarrierChildStateLabel waitBarrierDecisionEffectRows Completion guard Mutation evidence This child quorumThreshold modelScopeRows Snapshot repair memoryPolicyLabel localMemoryRowsForRun Local memory projected runtimeStartupFailurePreview worktreeRowsForSnapshot Worktree path retentionPolicyLabel schedulingPolicyLabel Fanout callableWorkflowBridgeRowsForSnapshot Workflow bridge",
    subagentThreadInspectorUiModelTest: "shows quorum thresholds and synthesis counts in child thread wait details labels active wait-barrier child states distinctly in child thread details shows this child's own wait-barrier state in child thread details shows blocked completion guard evidence in child thread wait details shows detach and parent-cancel barrier decision effects in child thread details shows resolved model scope candidate diagnostics in the child inspector shows local memory capacity details in the child inspector shows local runtime startup failure diagnostics in recent events shows prepared child worktree details from the launch snapshot shows unavailable child worktree diagnostics from the launch snapshot shows callable workflow bridge status and allowed tools in the child inspector shows disabled callable workflow bridge reasons in the child inspector badges snapshot repair diagnostics for the selected child thread Persistent memory disabled Transient; cleanup after close Automation deferred; no live parent context",
    subagentRepairDiagnosticsUiModel: "subagentRepairDiagnosticsModel issueGroups Snapshot integrity",
    subagentRepairDiagnosticsUiModelTest: "groups snapshot integrity issues for repair settings and search",
    subagentMaturityUiModel: "subagentMaturityLiveHistoryModel subagentMaturityDesktopDogfoodHistoryModel subagentMaturityWorkflowJitterReleaseProfileModel Clean required-live runs Latest required-live Ready Desktop dogfood runs Latest Desktop dogfood Workflow jitter release profile Desktop dogfood history live_dogfood_failure_rate desktop_dogfood_count desktop_dogfood_failure_rate workflow_jitter_release_profile live_smoke required-live history",
    subagentMaturityUiModelTest: "summarizes green required-live history for graduation diagnostics flags sparse, flaky, or skipped live history in diagnostics search text summarizes green Desktop dogfood history for graduation diagnostics flags sparse or visually failing Desktop dogfood history summarizes green workflow jitter release-profile evidence flags missing or non-release workflow jitter evidence in diagnostics search text",
    subagentReplayEvidenceUiModel: "subagentReplayEvidenceInspectorModel DiagnosticExportSubagentReplayEvidence runtimeEventRows persistedEventRows parentMailboxRows callableWorkflowRows transcriptRows lifecycleEdgeRows restartRepairRows Lifecycle edges Lifecycle Restart Repair Lifecycle Cancel Parent Callable workflow tasks Callable workflow Active Task Interrupted caller Subagent Child Thread completionGuardSummary approvalLabel worktree path searchText approval unavailable denied tools connector_app:gmail.search workflowArtifactSourcePath workflowArtifactStatePath workflowArtifactMutationPolicy artifactLinkState runLinkState child_bridge_policy",
    subagentReplayEvidenceUiModelTest: "surfaces unavailable or failed summaries even when evidence collection produced no bundle object marks bounded timelines and exposes full search text for saved diagnostic filtering surfaces tool-scope denial metadata in parent mailbox replay rows and search surfaces completion guard metadata in parent mailbox replay rows and search completion guard blocked / mutation evidence structured 1 / Ambient 1 / isolated worktree 1 / approval 0 approval Permission Grant (approval-worker) worktree isolated Parent mailbox events Lifecycle Restart Repair Lifecycle Cancel Parent Callable workflow tasks Callable workflow Active Task Interrupted caller Subagent Child Thread parent message parent-message-1 Grouped child completion notification. workflow-task-1 workflow-artifact-1 /repo/.ambient-codex/workflows/replay/main.ts staged_until_approved child_bridge_policy approval unavailable denied tools connector_app:gmail.search",
    localRuntimeEvidenceUiModel: "localRuntimeEvidenceInspectorModel DiagnosticExportLocalRuntimeEvidence runtimeRows ownerRows blockedActionRows nextSafeActionRows memoryRows searchText Untracked process; do not assume safe to stop Forced action must cancel or mark affected sub-agents Memory basis Actual RSS",
    localRuntimeEvidenceUiModelTest: "summarizes local runtime diagnostic evidence as inspectable rows marks untracked runtimes and memory uncertainty as unsafe to stop silently Export diagnostics to inspect local runtime leases, blockers, and memory evidence.",
    diagnosticExportHistoryUiModel: "recordDiagnosticExportHistory diagnosticExportHistoryModel selectedDiagnosticExportFromHistory DIAGNOSTIC_EXPORT_HISTORY_STORAGE_KEY encodeDiagnosticExportHistoryStorage decodeDiagnosticExportHistoryStorage callableWorkflowTaskTimeline",
    diagnosticExportHistoryUiModelTest: "records recent diagnostic exports newest first with stable de-duping persists sanitized diagnostic bundle history and selected replay evidence across restarts diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain(\"completion guard\") toContain(\"approval 0\") approvalId: \"approval-worker\" approvalSource: \"permission_grant\" worktreeIsolated: true worktreePath: \"/repo/.ambient-codex/worktrees/child-1\" parentMessageId: \"parent-message-1\" taskId: \"workflow-task-1\" workflowArtifactId: \"workflow-artifact-1\" workflowRunId: \"workflow-run-1\" artifactLinkState: \"linked\" runLinkState: \"linked\" approvalSource: \"child_bridge_policy\" nestedFanoutSource: \"child_bridge_policy\" Grouped child completion notification. failureStage: \"tool_scope\" approvalMode: \"non_interactive\" approvalUnavailable: true deniedCategoryIds: [\"connector.read\"] deniedToolIds: [\"connector_app:gmail.search\"] toContain(\"approval-worker\") toContain(\"/repo/.ambient-codex/worktrees/child-1\") toContain(\"parent-message-1\") toContain(\"workflow-task-1\") toContain(\"workflow-artifact-1\") toContain(\"child_bridge_policy\") toContain(\"tool_scope\") toContain(\"connector_app:gmail.search\")",
    settingsLayoutTest: "function SubagentReplayEvidenceDiagnostics function LocalRuntimeEvidenceDiagnostics function DiagnosticExportHistory diagnostics.export-history diagnostics.subagent-replay diagnostics.local-runtime-evidence Diagnostic export history Sub-agent replay Local runtime evidence subagentMaturityDesktopDogfoodHistoryModel subagentMaturityWorkflowJitterReleaseProfileModel Desktop dogfood history: Workflow jitter release profile: Export diagnostics to inspect child replay timelines. Export diagnostics to inspect local runtime leases, blockers, and memory evidence.",
    subagentThreatModelTest: "prompt-injection privilege escalation malicious MCP and connector metadata stale approvals rejects stale approval evidence from another child run secret secret-shaped source ids appears to contain secret-like material broad MCP and connector grants exact connector.operation ids exact server/tool operation ids non-callable source types surface exact callable tools separately Capability requires interactive approval, but this launch is non-interactive. fails connector access in non-interactive launches instead of creating stale approvals nested fanout hides parent-facing sub-agent fanout tools rejects forged implementation evidence unless Ambient recorded matching mutation evidence",
    subagentPiToolLiveSmoke: "AMBIENT_SUBAGENT_LIVE recordSubagentLiveSmokeEvidence recordSubagentLiveApprovalAuthorityEvidence recordSubagentRestartRecoveryEvidence subagent-live-smoke ambient_subagent SUBAGENT_CHILD_DONE SUBAGENT_LIVE_DONE SUBAGENT_OPTIONAL_BACKGROUND_DONE SUBAGENT_TOOL_DENIAL_LIVE_DONE approval-authority-latest.json optional_background workspace.write deniedCategories reconcileSubagentsOnRuntimeStartup active_run_interrupted restart-reconciliation-latest.json subagent.grouped_completion",
    subagentReplayDiagnostics: "ambient-subagent-replay-diagnostics-v1 ambient-subagent-replay-evidence-v1 ambient-subagent-lifecycle-edge-evidence-v1 liveTokens: false AMBIENT_SUBAGENT_REPLAY_EVIDENCE_OUT AMBIENT_SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_OUT fixtureEvidencePath lifecycleEdgeEvidencePath lifecycleEdgeEvidence runtimeEventTimeline parentMailboxTimeline parentMailboxEvents rehydration resultArtifactPointers missingResultArtifactRunIds restartRepair src/test/subagentFixtures.test.ts src/main/subagents/subagentRepair.test.ts src/main/subagents/subagentLifecycleEdgeEvidence.test.ts Lifecycle Edge Evidence writeSubagentReplayDiagnosticsReport",
  };
}

function replayArtifact() {
  return {
    __artifactPath: "test-results/subagent-replay-diagnostics/latest.json",
    schemaVersion: "ambient-subagent-replay-diagnostics-v1",
    completedAt: "2026-06-05T00:30:00.000Z",
    status: "passed",
    plan: {
      liveTokens: false,
    },
    vitest: {
      totalTests: 12,
      passedTests: 12,
      failedTests: 0,
      missingReplayTests: [],
    },
    replayEvidence: {
      schemaVersion: "ambient-subagent-replay-evidence-v1",
      fixtureName: "restart-repair-broken-child-tree",
      createdAt: "2026-06-05T00:00:00.000Z",
      liveTokens: false,
      counts: {
        threads: 4,
        childThreads: 4,
        runs: 3,
        persistedRunEvents: 4,
        runtimeEvents: 3,
        parentMailboxEvents: 1,
        transcriptMessages: 3,
        restartRepairIssues: 7,
      },
      childThreads: [{ threadId: "child-active", runId: "run-active" }],
      runtimeEventTimeline: [{ sequence: 1, runId: "run-active", parentRunId: "parent-run", childThreadId: "child-active", createdAt: "2026-06-05T00:00:00.000Z", source: "spawn_agent", type: "started" }],
      persistedRunEventTimeline: [{ sequence: 1, runId: "run-active", parentRunId: "parent-run", childThreadId: "child-active", createdAt: "2026-06-05T00:00:00.000Z", source: "project_store", type: "subagent.lifecycle_started" }],
      parentMailboxTimeline: [{ sequence: 1, id: "parent-mailbox-grouped-completion", parentRunId: "parent-run", parentThreadId: "parent-thread", parentMessageId: "parent-message-2", createdAt: "2026-06-05T00:00:11.000Z", updatedAt: "2026-06-05T00:00:11.000Z", type: "subagent.grouped_completion", deliveryState: "queued", childRunIds: ["run-artifact", "run-terminal"], payloadPreview: "run-terminal: completed: Completed reviewer fixture without a result artifact." }],
      transcriptTimeline: [],
      rehydration: restartRehydrationProof(),
      restartRepair: {
        expectedIssueKinds: [
          "active_run_interrupted",
          "missing_lifecycle_stop",
        ],
        observedIssueKinds: [
          "active_run_interrupted",
          "missing_lifecycle_stop",
        ],
        repairedRunIds: ["run-active"],
        repairedBarrierIds: ["barrier-required"],
        repairedParentControlBarrierIds: [],
        repairableSpawnEdgeRunIds: ["run-terminal"],
        danglingSpawnEdgeRunIds: ["missing-run"],
        diagnosticRunIds: ["run-terminal"],
      },
    },
    lifecycleEdgeEvidence: lifecycleEdgeArtifact(),
  };
}

function restartRehydrationProof() {
  return {
    schemaVersion: "ambient-subagent-restart-rehydration-proof-v1",
    childRunIds: ["run-active", "run-artifact", "run-terminal"],
    childThreadIds: ["child-active", "child-artifact", "child-terminal", "orphan-child"],
    parentMailboxEventIds: ["parent-mailbox-grouped-completion"],
    parentMailboxStates: [{
      id: "parent-mailbox-grouped-completion",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message-2",
      deliveryState: "queued",
      childRunIds: ["run-artifact", "run-terminal"],
    }],
    transcriptChildRunIds: ["run-active"],
    transcriptThreadIds: ["child-active", "parent-thread"],
    resultArtifactPointers: [{
      runId: "run-artifact",
      childThreadId: "child-artifact",
      status: "completed",
      artifactPath: ".ambient-codex/subagents/run-artifact/result.json",
      fullOutputPath: ".ambient-codex/subagents/run-artifact/full-output.txt",
      structuredOutputPath: ".ambient-codex/subagents/run-artifact/structured.json",
    }],
    missingResultArtifactRunIds: ["run-terminal"],
    artifactPointerIntegrity: {
      allResultPointersHaveRunAndThread: true,
      missingResultArtifactsDiagnosed: true,
      parentMailboxChildRefsResolved: true,
      transcriptChildRefsResolved: true,
    },
  };
}

function callableWorkflowDogfoodArtifact() {
  return {
    __artifactPath: "test-results/callable-workflow-dogfood/latest.json",
    schemaVersion: "ambient-callable-workflow-dogfood-evidence-v1",
    createdAt: "2026-06-05T00:45:00.000Z",
    task: {
      id: "workflow-task-1",
      launchId: "launch-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
      status: "succeeded",
      blocking: true,
      workflowArtifactId: "workflow-artifact-1",
      workflowRunId: "workflow-run-1",
    },
    launchCard: {
      present: true,
      riskLevel: "medium",
      estimatedAgents: 4,
      maxFanout: 3,
      maxDepth: 2,
      estimatedTokenBudget: 12000,
      estimatedLocalMemoryBytes: 268435456,
      defaultCollapsed: true,
      blocking: true,
      pauseResumeCancel: true,
      checkpointResume: "Checkpoint after every stage and resume from the last completed step.",
      approvalFailureHandling: "Forward child approval requests to the parent and resume blocking afterward.",
      requirementIds: ["launch_confirmed", "nested_fanout_limited"],
      metricTemplateIds: ["map_reduce-metric"],
      policyWarnings: ["child mutating workflow requires approval"],
    },
    childCaller: {
      kind: "subagent_child_thread",
      threadId: "child-thread-1",
      runId: "child-run-1",
      subagentRunId: "subagent-run-1",
      canonicalTaskPath: "parent/1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    },
    mutation: {
      artifactId: "workflow-artifact-1",
      mutationPolicy: "staged_until_approved",
      approvalRequired: true,
      approvalSource: "child_bridge_policy",
      approvalScope: "this_child_thread",
      worktreeRequired: true,
      worktreeIsolated: true,
      worktreeStatus: "active",
      worktreePathPresent: true,
      nestedFanoutRequired: true,
      nestedFanoutSource: "child_bridge_policy",
    },
    mutationOutput: {
      kind: "staged_file",
      stagedRelativePath: "src/feature.txt",
      stagedFileSha256: "a".repeat(64),
      fullArtifactPath: "/tmp/child-worktree/.ambient-codex/workflows/dogfood/mutation-report.md",
      fullArtifactBytes: 256,
      fullArtifactSha256: "b".repeat(64),
      boundedPreview: "Child staged mutation preview.",
      previewBytes: 30,
      previewTruncated: true,
      parentWorkspaceUnchanged: true,
    },
    workflow: {
      workflowThreadId: "workflow-thread-1",
      artifactId: "workflow-artifact-1",
      artifactStatus: "ready_for_preview",
      runId: "workflow-run-1",
      runStatus: "succeeded",
      taskArtifactLinkMatches: true,
      taskRunLinkMatches: true,
    },
    taskEvents: {
      started: true,
      finished: true,
      control: false,
      eventTypes: ["callable_workflow.task_started", "callable_workflow.task_finished"],
    },
    parentBlocking: {
      schemaVersion: "ambient-callable-workflow-parent-blocking-v1",
      reason: "blocking_callable_workflow_not_synthesis_safe",
      blockedBeforeCompletion: true,
      unblockedAfterCompletion: true,
      blockedTaskIds: ["workflow-task-1"],
      waitingTaskIds: ["workflow-task-1"],
      attentionTaskIds: [],
      allowedUserChoiceIds: ["wait_again", "cancel_parent"],
      idempotencyKey: "callable-workflow:parent-finalization-blocked:parent-run:workflow-task-1",
      message: "Parent final answer blocked because blocking callable workflow work is not safe for synthesis.",
    },
    deniedScope: {
      schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
      denied: true,
      denialKinds: ["phase4_isolation_required"],
      explicitToolRequestObserved: true,
      deniedCategoryIds: ["workflow.call"],
      deniedToolIds: ["callable_workflow:ambient_workflow_symphony_map_reduce"],
      reasonSamples: ["Requested sub-agent tool scope was denied before launch."],
      bridgeReasons: [
        "Callable workflow child bridge is disabled by child role policy.",
        "Callable workflow child bridge requires an active isolated child worktree.",
        "Callable workflow child bridge is unavailable because the nested fanout limit is exhausted.",
      ],
    },
    restart: {
      schemaVersion: "ambient-callable-workflow-task-restart-v1",
      issueKinds: ["workflow_run_terminal_task_unfinished"],
      repairedTaskIds: ["workflow-task-1"],
      diagnosticTaskIds: ["workflow-task-1"],
      terminalRepairObserved: true,
    },
    maturityAssertions: {
      workflow_launch_card_bounds: {
        id: "workflow_launch_card_bounds",
        status: "passed",
        capabilities: ["workflow_launch", "launch_card_bounds", "pause_resume_cancel"],
        evidence: [
          "passed: risk=medium agents=4 fanout=3 depth=2",
          "passed: tokenBudget=12000 localMemory=268435456 checkpoint=Checkpoint after every stage and resume from the last completed step.",
          "passed: defaultCollapsed=true blocking=true pauseResumeCancel=true",
        ],
      },
      workflow_mutating_child_worker: {
        id: "workflow_mutating_child_worker",
        status: "passed",
        capabilities: ["mutating_child_workflow", "child_scoped_approval", "isolated_child_worktree"],
        evidence: [
          "passed: approval=child_bridge_policy scope=this_child_thread",
          "passed: worktree=active isolated=true path=true",
          "passed: staged=src/feature.txt parentUnchanged=true",
        ],
      },
      workflow_parent_blocking_completion: {
        id: "workflow_parent_blocking_completion",
        status: "passed",
        capabilities: ["parent_blocking_workflow", "workflow_launch"],
        evidence: [
          "passed: blockedBeforeCompletion=true",
          "passed: unblockedAfterCompletion=true",
          "passed: choices=wait_again,cancel_parent",
        ],
      },
      workflow_denied_child_scope: {
        id: "workflow_denied_child_scope",
        status: "passed",
        capabilities: ["denied_workflow_scope", "child_workflow_scope"],
        evidence: [
          "passed: denials=1",
          "passed: categories=workflow.call",
          "passed: bridgeReasons=3",
        ],
      },
      workflow_restart_repair: {
        id: "workflow_restart_repair",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "restart_repair"],
        evidence: [
          "passed: issueKinds=workflow_run_terminal_task_unfinished",
          "passed: repairedTaskIds=workflow-task-1",
          "passed: diagnosticTaskIds=workflow-task-1",
        ],
      },
    },
    observations: [
      "Child-originated callable workflow produced a mutating artifact only with child-scoped approval and active isolated worktree evidence.",
      "Mutating worker dogfood wrote a concrete staged file in the child worktree, kept a bounded preview plus full artifact metadata, and left the parent workspace sentinel unchanged.",
    ],
  };
}

function callableWorkflowRehydrationArtifact() {
  return {
    __artifactPath: "test-results/callable-workflow-rehydration/latest.json",
    schemaVersion: "ambient-callable-workflow-rehydration-evidence-v1",
    createdAt: "2026-06-05T00:45:00.000Z",
    task: {
      id: "workflow-task-1",
      launchId: "launch-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
      status: "running",
      blocking: true,
      workflowThreadId: "workflow-thread-1",
      workflowArtifactId: "workflow-artifact-1",
      workflowRunId: "workflow-run-1",
    },
    beforeClose: {
      status: "running",
      workflowThreadId: "workflow-thread-1",
      workflowArtifactId: "workflow-artifact-1",
      workflowRunId: "workflow-run-1",
    },
    rehydration: {
      sameTaskId: true,
      sameArtifactId: true,
      sameRunId: true,
      workflowThreadHydrated: true,
      artifactSourcePathHydrated: true,
      artifactStatePathHydrated: true,
      artifactMutationPolicyHydrated: true,
      artifactSpecHydrated: true,
      launchCardHydrated: true,
      executionPlanHydrated: true,
      progressHydrated: true,
      usageHydrated: true,
    },
    childCaller: {
      kind: "subagent_child_thread",
      threadId: "child-thread-1",
      runId: "child-run-1",
      subagentRunId: "subagent-run-1",
      canonicalTaskPath: "parent/1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    },
    artifact: {
      id: "workflow-artifact-1",
      title: "Rehydration Workflow",
      workflowThreadId: "workflow-thread-1",
      status: "ready_for_preview",
      sourcePath: "/tmp/worktree/.ambient-codex/workflows/rehydration/main.ts",
      statePath: "/tmp/worktree/.ambient-codex/workflows/rehydration/state.json",
      mutationPolicy: "staged_until_approved",
      specGoal: "Keep callable workflow task links visible after restart.",
    },
    workflowRun: {
      id: "workflow-run-1",
      artifactId: "workflow-artifact-1",
      status: "running",
    },
    progressSnapshot: {
      workflowRunStatus: "running",
      eventCount: 4,
      modelCallCount: 1,
      completedStepCount: 1,
      activeStepCount: 1,
      lastEventType: "step.start",
      lastEventMessage: "Reduce rehydrated evidence",
      lastEventAt: "2026-06-05T00:44:00.000Z",
    },
    usageSnapshot: {
      modelCallCount: 1,
      tokenCount: 21,
      tokenCountEstimated: false,
      costMicros: 34,
      costEstimated: false,
    },
    taskEvents: {
      started: true,
      eventTypes: ["callable_workflow.task_started", "step.start", "step.end"],
    },
    maturityAssertions: {
      workflow_rehydrated_task_links: {
        id: "workflow_rehydrated_task_links",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "artifact_link"],
        evidence: [
          "passed: sameTaskId=true",
          "passed: sameArtifactId=true",
          "passed: sameRunId=true",
        ],
      },
      workflow_rehydrated_artifact_payload: {
        id: "workflow_rehydrated_artifact_payload",
        status: "passed",
        capabilities: ["artifact_link", "checkpoint_output"],
        evidence: [
          "passed: sourcePath=true",
          "passed: statePath=true",
          "passed: mutationPolicy=staged_until_approved",
          "passed: specGoal=true",
        ],
      },
      workflow_rehydrated_progress_usage: {
        id: "workflow_rehydrated_progress_usage",
        status: "passed",
        capabilities: ["workflow_task_rehydration", "checkpoint_output"],
        evidence: [
          "passed: progressEvents=4",
          "passed: modelCalls=1",
          "passed: tokens=21",
        ],
      },
      workflow_rehydrated_child_provenance: {
        id: "workflow_rehydrated_child_provenance",
        status: "passed",
        capabilities: ["child_workflow_provenance", "workflow_task_rehydration"],
        evidence: [
          "passed: childThread=child-thread-1",
          "passed: subagentRun=subagent-run-1",
          "passed: canonicalTaskPath=parent/1",
        ],
      },
    },
    observations: [
      "Callable workflow task rehydrated after store reopen with the same task, artifact, workflow thread, and workflow run links.",
    ],
  };
}

function lifecycleEdgeArtifact() {
  return {
    __artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
    schemaVersion: "ambient-subagent-lifecycle-edge-evidence-v1",
    createdAt: "2026-06-05T00:45:00.000Z",
    source: "deterministic_fixture",
    liveTokens: false,
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    parent: {
      threadId: "parent-thread",
      runId: "parent-run",
      messageId: "parent-message",
    },
    summary: {
      requiredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
      coveredEdgeKinds: ["restart", "stop", "detach", "cancel", "retry", "timeout", "partial_result"],
      missingEdgeKinds: [],
      unsafeEdgeIds: [],
      liveTokens: false,
    },
    edges: [
      lifecycleEdge({
        id: "edge-restart",
        kind: "restart",
        label: "Restart after active child",
        parentBlockingStateBefore: "waiting_on_child",
        parentBlockingStateAfter: "interrupted_repair_visible",
        childRunIds: ["run-active"],
        childThreadIds: ["child-active"],
        observedEventIds: ["runtime-event-started", "repair-diagnostic-active-run"],
        restart: {
          interruptedRunIds: ["run-active"],
          diagnosticRunIds: ["run-active"],
          restartRepairObserved: true,
          nonResumableMarkedInterrupted: true,
        },
      }),
      lifecycleEdge({
        id: "edge-child-stop",
        kind: "stop",
        label: "Stopped child while sibling keeps running",
        parentBlockingStateBefore: "waiting_on_two_children",
        parentBlockingStateAfter: "needs_decision_after_stopped_child",
        childRunIds: ["run-stopped", "run-sibling"],
        childThreadIds: ["child-stopped", "child-sibling"],
        observedEventIds: ["cancel-event-stopped", "capacity-release-stopped"],
        stop: {
          stoppedRunIds: ["run-stopped"],
          siblingRunIdsUnaffected: ["run-sibling"],
          structuredCancellationResult: true,
          capacityReleased: true,
        },
      }),
      lifecycleEdge({
        id: "edge-detach",
        kind: "detach",
        label: "Detached child from parent wait",
        parentBlockingStateBefore: "waiting_on_detachable_child",
        parentBlockingStateAfter: "unblocked_detached_child_visible",
        childRunIds: ["run-detached"],
        childThreadIds: ["child-detached"],
        observedEventIds: ["mailbox-detach-decision", "mailbox-detach-cleanup"],
        detach: {
          detachedRunIds: ["run-detached"],
          detachedChildrenExcludedFromSynthesis: true,
          parentUnblockedAfterDecision: true,
          mailboxCleanupRecorded: true,
        },
      }),
      lifecycleEdge({
        id: "edge-parent-cancel",
        kind: "cancel",
        label: "Parent cancellation cascades to children",
        parentBlockingStateBefore: "waiting_on_children",
        parentBlockingStateAfter: "parent_cancelled_children_marked",
        childRunIds: ["run-cancel-a", "run-cancel-b"],
        childThreadIds: ["child-cancel-a", "child-cancel-b"],
        observedEventIds: ["parent-cancel-requested", "cancel-cascade-event"],
        cancel: {
          parentCancellationRequested: true,
          cancelledRunIds: ["run-cancel-a", "run-cancel-b"],
          cancellationCascadeRecorded: true,
          parentReturnedCancelledState: true,
        },
      }),
      lifecycleEdge({
        id: "edge-retry-child",
        kind: "retry",
        label: "Retry failed required child while parent stays blocked",
        parentBlockingStateBefore: "failed_required_child_waiting_for_decision",
        parentBlockingStateAfter: "retry_requested_parent_still_blocked",
        childRunIds: ["run-retry"],
        childThreadIds: ["child-retry"],
        observedEventIds: ["mailbox-retry-decision", "runtime-retry-started", "retry-mailbox-consumed"],
        retry: {
          retryRequestedRunIds: ["run-retry"],
          retryAcceptedRunIds: ["run-retry"],
          retryMailboxEventIds: ["mailbox-retry"],
          parentRemainedBlocked: true,
          childSessionRestarted: true,
        },
      }),
      lifecycleEdge({
        id: "edge-timeout",
        kind: "timeout",
        label: "Timed-out required child blocks unsafe synthesis",
        parentBlockingStateBefore: "waiting_on_required_child",
        parentBlockingStateAfter: "timed_out_needs_user_choice",
        childRunIds: ["run-timeout"],
        childThreadIds: ["child-timeout"],
        observedEventIds: ["barrier-timeout-event", "mailbox-timeout-attention"],
        timeout: {
          barrierStatus: "timed_out",
          failurePolicy: "ask_user",
          allowedUserChoiceIds: ["wait_again", "cancel_parent", "continue_with_partial"],
          noTimedOutChildSynthesis: true,
        },
      }),
      lifecycleEdge({
        id: "edge-partial-result",
        kind: "partial_result",
        label: "User explicitly continues with partial result",
        parentBlockingStateBefore: "waiting_on_failed_child",
        parentBlockingStateAfter: "partial_result_synthesis_allowed",
        childRunIds: ["run-complete", "run-failed"],
        childThreadIds: ["child-complete", "child-failed"],
        observedEventIds: ["barrier-partial-decision", "partial-summary-artifact"],
        partialResult: {
          decision: "continue_with_partial",
          partialSummaryIncluded: true,
          omittedChildRunIds: ["run-failed"],
          failedChildNotSynthesized: true,
          parentMarkedPartial: true,
        },
      }),
    ],
  };
}

function lifecycleEdge(edge) {
  return {
    ...edge,
    synthesisSafety: {
      parentDidNotSynthesizeUnsafeChild: true,
      resultArtifactStateExplicit: true,
      affectedChildrenNamed: true,
      decisionOrEventAttributed: true,
      visibleCollapsedThreadState: true,
    },
  };
}

function liveArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-smoke/latest.json",
    createdAt: "2026-06-05T00:45:00.000Z",
    provider: "gmi-cloud",
    assistantText: "SUBAGENT_LIVE_DONE",
    childAssistantText: "SUBAGENT_CHILD_DONE",
    run: {
      id: "subagent-run-1",
      status: "completed",
      childThreadId: "child-thread-1",
      resultArtifact: {
        status: "completed",
      },
      runtimeEvents: [
        { type: "started" },
        { type: "assistant_delta" },
        { type: "completed" },
      ],
    },
  };
}

function desktopDogfoodArtifact() {
  return {
    __artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
    schemaVersion: "ambient-subagent-desktop-dogfood-v1",
    status: "passed",
    classification: "passed",
    generatedAt: "2026-06-05T00:55:00.000Z",
    provider: "gmi-cloud",
    model: "moonshotai/kimi-k2.7-code",
    featureFlag: "ambient.subagents",
    headful: true,
    cdpPort: 49152,
    scenarios: [...REQUIRED_DESKTOP_DOGFOOD_SCENARIOS],
    parentThreadId: "desktop-dogfood-parent-thread",
    parentMessageId: "desktop-dogfood-parent-message",
    childRunIds: ["desktop-dogfood-review-run", "desktop-dogfood-summary-run"],
    childThreadIds: ["desktop-dogfood-review-thread", "desktop-dogfood-summary-thread"],
    approvalRequestParentMailboxEventId: "desktop-dogfood-approval-mailbox",
    approvalWaitBarrierId: "desktop-dogfood-approval-wait-barrier",
    approvalId: "desktop-dogfood-approval-write",
    cancelControlChildRunId: "desktop-dogfood-review-run",
    closeControlChildRunIds: ["desktop-dogfood-review-run", "desktop-dogfood-summary-run"],
    localRuntimeLeaseId: "desktop-dogfood-local-runtime-lease",
    localRuntimeId: "local-text-runtime",
    localRuntimePid: 4301,
    untrackedRuntimeId: "untracked-llama:4404",
    untrackedRuntimePid: 4404,
    untrackedRuntimeEndpoint: "http://127.0.0.1:44222",
    untrackedRuntimeModel: "/tmp/manual-untracked-model.gguf",
    workflowTaskId: "callable-workflow:desktop-dogfood-map-reduce",
    workflowArtifactId: "desktop-dogfood-workflow-artifact",
    workflowArtifactSourceRelativePath: ".ambient-codex/workflows/desktop-dogfood-map-reduce/main.ts",
    workflowArtifactStateRelativePath: ".ambient-codex/workflows/desktop-dogfood-map-reduce/state.json",
    workflowArtifactSourceContent: "export const workflow = 'desktop dogfood map reduce';\n",
    workflowRunId: "desktop-dogfood-workflow-run",
    workflowThreadId: "desktop-dogfood-workflow-thread",
    workflowParentMailboxEventId: "desktop-dogfood-workflow-mailbox",
    mutatingWorkflowTaskId: "callable-workflow:desktop-dogfood-mutating-worker",
    mutatingWorkflowArtifactId: "desktop-dogfood-mutating-worker-artifact",
    mutatingWorkflowRunId: "desktop-dogfood-mutating-worker-run",
    mutatingWorkflowThreadId: "desktop-dogfood-mutating-worker-thread",
    mutatingWorkflowChildRunId: "desktop-dogfood-review-run",
    mutatingWorkflowChildThreadId: "desktop-dogfood-review-thread",
    mutatingWorkflowStagedRelativePath: "src/feature.txt",
    mutatingWorkflowReportRelativePath: ".ambient-codex/workflows/desktop-dogfood-mutating-worker/mutation-report.md",
    mutatingWorkflowProgressMessage: "Staged mutation: src/feature.txt; output preview retained; parent workspace unchanged.",
    mutatingWorkflowParentWorkspaceUnchanged: true,
    workflowHighLoadTaskIds: [
      "callable-workflow:desktop-dogfood-high-load-adversarial_debate",
      "callable-workflow:desktop-dogfood-high-load-imitate_and_verify",
      "callable-workflow:desktop-dogfood-high-load-pipeline",
      "callable-workflow:desktop-dogfood-high-load-ensemble",
    ],
    workflowHighLoadArtifactIds: [
      "desktop-dogfood-high-load-adversarial_debate-artifact",
      "desktop-dogfood-high-load-imitate_and_verify-artifact",
      "desktop-dogfood-high-load-pipeline-artifact",
      "desktop-dogfood-high-load-ensemble-artifact",
    ],
    workflowHighLoadRunIds: [
      "desktop-dogfood-high-load-adversarial_debate-run",
      "desktop-dogfood-high-load-imitate_and_verify-run",
      "desktop-dogfood-high-load-pipeline-run",
      "desktop-dogfood-high-load-ensemble-run",
    ],
    workflowHighLoadThreadIds: [
      "desktop-dogfood-high-load-adversarial_debate-thread",
      "desktop-dogfood-high-load-imitate_and_verify-thread",
      "desktop-dogfood-high-load-pipeline-thread",
      "desktop-dogfood-high-load-ensemble-thread",
    ],
    workflowHighLoadPatternLabels: [
      "Symphony Map-Reduce",
      "Symphony Adversarial Debate",
      "Symphony Imitate and Verify",
      "Symphony Pipeline",
      "Symphony Ensemble",
      "Symphony Self-Healing Loop",
    ],
    deniedScopeParentMailboxEventId: "desktop-dogfood-denied-scope-mailbox",
    deniedScopeChildRunId: "desktop-dogfood-denied-scope-run",
    deniedScopeChildThreadId: "desktop-dogfood-denied-scope-thread",
    lifecycleEdgeParentMessageId: "desktop-dogfood-lifecycle-parent-message",
    lifecycleEdgeChildRunIds: [
      "desktop-dogfood-lifecycle-timeout-run",
      "desktop-dogfood-lifecycle-partial-run",
      "desktop-dogfood-lifecycle-retry-run",
      "desktop-dogfood-lifecycle-detached-run",
    ],
    lifecycleEdgeChildThreadIds: [
      "desktop-dogfood-lifecycle-timeout-thread",
      "desktop-dogfood-lifecycle-partial-thread",
      "desktop-dogfood-lifecycle-retry-thread",
      "desktop-dogfood-lifecycle-detached-thread",
    ],
    lifecycleEdgeWaitBarrierIds: [
      "desktop-dogfood-lifecycle-timeout-barrier",
      "desktop-dogfood-lifecycle-partial-barrier",
      "desktop-dogfood-lifecycle-retry-barrier",
      "desktop-dogfood-lifecycle-detached-barrier",
    ],
    stressParentMessageIds: ["desktop-dogfood-stress-parent-1", "desktop-dogfood-stress-parent-2"],
    stressChildRunIds: [
      "desktop-dogfood-stress-run-1",
      "desktop-dogfood-stress-run-2",
      "desktop-dogfood-stress-run-3",
      "desktop-dogfood-stress-run-4",
      "desktop-dogfood-stress-run-5",
      "desktop-dogfood-stress-run-6",
    ],
    stressChildThreadIds: [
      "desktop-dogfood-stress-thread-1",
      "desktop-dogfood-stress-thread-2",
      "desktop-dogfood-stress-thread-3",
      "desktop-dogfood-stress-thread-4",
      "desktop-dogfood-stress-thread-5",
      "desktop-dogfood-stress-thread-6",
    ],
    chatExportPath: "test-results/subagent-desktop-dogfood/desktop-chat-export.zip",
    chatExportBytes: 42_000,
    artifacts: {
      collapsedDesktopScreenshot: "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
      expandedDesktopScreenshot: "test-results/subagent-desktop-dogfood/expanded-desktop.png",
      approvalDialogScreenshot: "test-results/subagent-desktop-dogfood/approval-forwarding-dialog.png",
      approvalForwardingDesktopScreenshot: "test-results/subagent-desktop-dogfood/approval-forwarded-desktop.png",
      workflowExecutionDesktopScreenshot: "test-results/subagent-desktop-dogfood/workflow-execution-desktop.png",
      mutatingWorkerDogfoodDesktopScreenshot: "test-results/subagent-desktop-dogfood/mutating-worker-dogfood-desktop.png",
      workflowHighLoadDesktopScreenshot: "test-results/subagent-desktop-dogfood/workflow-high-load-desktop.png",
      deniedScopeExplanationDesktopScreenshot: "test-results/subagent-desktop-dogfood/denied-scope-explanation-desktop.png",
      lifecycleEdgeVisibilityDesktopScreenshot: "test-results/subagent-desktop-dogfood/lifecycle-edge-visibility-desktop.png",
      multiClusterStressDesktopScreenshot: "test-results/subagent-desktop-dogfood/multi-cluster-stress-desktop.png",
      restartRehydrationDesktopScreenshot: "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      workflowRehydratedNavigationDesktopScreenshot: "test-results/subagent-desktop-dogfood/workflow-rehydrated-navigation-desktop.png",
      workflowArtifactRehydrationDesktopScreenshot: "test-results/subagent-desktop-dogfood/workflow-artifact-rehydration-desktop.png",
      localRuntimeOwnershipDesktopScreenshot: "test-results/subagent-desktop-dogfood/local-runtime-ownership-desktop.png",
      expandedNarrowScreenshot: "test-results/subagent-desktop-dogfood/expanded-narrow.png",
      operatorBehaviorDesktopScreenshot: "test-results/subagent-desktop-dogfood/operator-behavior-desktop.png",
      childTranscriptExpandedDesktopScreenshot: "test-results/subagent-desktop-dogfood/child-transcript-expanded-desktop.png",
      completedChildTranscriptDesktopScreenshot: "test-results/subagent-desktop-dogfood/completed-child-transcript-desktop.png",
      patternGraphClickThroughDesktopScreenshot: "test-results/subagent-desktop-dogfood/pattern-graph-click-through-desktop.png",
      patternGraphCompletedClickThroughDesktopScreenshot: "test-results/subagent-desktop-dogfood/pattern-graph-completed-click-through-desktop.png",
      accessibilitySnapshot: "test-results/subagent-desktop-dogfood/expanded-accessibility.json",
      chatExportZip: "test-results/subagent-desktop-dogfood/desktop-chat-export.zip",
    },
    checks: {
      collapsed: {
        clusterCount: 4,
        defaultCollapsed: true,
        clusterAfterParentMessage: true,
        clusterBelowParentMessage: true,
        clusterWithinViewport: true,
        horizontalOverflowFree: true,
        childRows: 0,
        warningToneCount: 0,
        activeToneCount: 0,
        criticalOverlapCount: 0,
        labels: {
          "Sub-agent threads": true,
          "2 children": true,
          "6 workflow tasks": true,
          "1 blocking": true,
          "1 workflow blocked": true,
          "1 attention": true,
          "1 failed spawn": true,
          "Needs attention": true,
          "Approval needed": false,
        },
      },
      expanded: {
        clusterCount: 4,
        defaultCollapsed: false,
        clusterAfterParentMessage: true,
        clusterBelowParentMessage: true,
        clusterWithinViewport: true,
        horizontalOverflowFree: true,
        childRows: 2,
        warningToneCount: 1,
        activeToneCount: 1,
        criticalOverlapCount: 0,
        labels: {
          "Review worker": true,
          "Context summarizer": true,
          "Blocking: approval": true,
          "Approval requested": true,
          "Allow workspace write": true,
          "workspace.write": true,
          "This child thread": true,
          "Approve child": true,
          "Deny child": true,
          "Waiting on child": true,
          "Required all": true,
          "Ask user on failure": true,
          "Symphony Map-Reduce": true,
          "Symphony Self-Healing Loop": true,
          "Symphony Adversarial Debate": true,
          "Symphony Imitate and Verify": true,
          "Symphony Pipeline": true,
          "Symphony Ensemble": true,
          "Blocking: workflow work": true,
          "Workflow blocked": true,
          "Mutating child worker": true,
          "Staged mutation: src/feature.txt": true,
          "Parent workspace unchanged": true,
        },
        approvalFlow: desktopApprovalFlow(),
        operatorControls: desktopOperatorControls(),
      },
      narrow: {
        clusterCount: 4,
        defaultCollapsed: false,
        clusterAfterParentMessage: true,
        clusterBelowParentMessage: true,
        clusterWithinViewport: true,
        horizontalOverflowFree: true,
        childRows: 2,
        warningToneCount: 1,
        activeToneCount: 1,
        criticalOverlapCount: 0,
        labels: {
          "Review worker": true,
          "Context summarizer": true,
          "Blocking: approval": true,
          "Approval requested": true,
          "Allow workspace write": true,
          "workspace.write": true,
          "This child thread": true,
          "Approve child": true,
          "Deny child": true,
          "Waiting on child": true,
          "Required all": true,
          "Ask user on failure": true,
          "Symphony Map-Reduce": true,
          "Symphony Self-Healing Loop": true,
          "Symphony Adversarial Debate": true,
          "Symphony Imitate and Verify": true,
          "Symphony Pipeline": true,
          "Symphony Ensemble": true,
          "Blocking: workflow work": true,
          "Workflow blocked": true,
          "Mutating child worker": true,
          "Staged mutation: src/feature.txt": true,
          "Parent workspace unchanged": true,
        },
        approvalFlow: desktopApprovalFlow(),
        operatorControls: desktopOperatorControls(),
      },
      childTranscript: desktopRunningChildTranscript(),
      completedChildTranscript: desktopCompletedChildTranscript(),
      workflowExecution: desktopWorkflowExecution(),
      mutatingWorkerDogfood: desktopMutatingWorkerDogfood(),
      workflowHighLoad: desktopWorkflowHighLoad(),
      deniedScopeExplanation: desktopDeniedScopeExplanation(),
      lifecycleEdgeVisibility: desktopLifecycleEdgeVisibility(),
      multiClusterStress: desktopMultiClusterStress(),
      approvalForwarding: desktopApprovalForwarding(),
      restartRehydration: desktopRestartRehydration(),
      workflowRehydratedNavigation: desktopWorkflowRehydratedNavigation(),
      workflowArtifactRehydration: desktopWorkflowArtifactRehydration(),
      localRuntimeOwnership: desktopLocalRuntimeOwnership(),
      operatorBehavior: desktopOperatorBehavior(),
      chatExport: desktopChatExport(),
    },
    visualAssertions: desktopVisualAssertions(),
    maturityAssertions: desktopMaturityAssertions(),
  };
}

function harnessManifestArtifact(kind = "live_node_test") {
  const electron = kind === "electron_dogfood";
  return {
    __artifactPath: electron
      ? "test-results/harness/electron-dogfood-latest.manifest.json"
      : "test-results/harness/live-node-latest.manifest.json",
    schemaVersion: "ambient-harness-manifest-v1",
    generatedAt: "2026-06-05T00:58:00.000Z",
    run: {
      id: `${kind}-fixture`,
      kind,
      startedAt: "2026-06-05T00:57:00.000Z",
      completedAt: "2026-06-05T00:58:00.000Z",
      cwd: "/tmp/ambient-fixture",
      command: electron
        ? ["node", "scripts/run-electron-dogfood.mjs", "--scenario=subagent-desktop-dogfood"]
        : ["node", "scripts/run-live-node-test.mjs", "--", "vitest", "run", "src/main/subagents/subagentPiToolLiveSmoke.live.test.ts"],
      branch: "main",
      commitSha: "abcdef123456",
      dirty: false,
    },
    result: {
      status: "passed",
      exitCode: 0,
      phase: electron ? "dogfood" : "test",
      summary: "Fixture harness passed.",
    },
    checkout: {
      status: "passed",
      root: "/tmp/ambient-fixture",
      issues: [],
    },
    provider: {
      providerId: "ambient",
      modelId: "moonshotai/kimi-k2.7-code",
      usingGmiFailover: false,
    },
    ...(electron
      ? {
          desktop: {
            headful: true,
            cdpPort: 49152,
            staleProcessCleanup: "attempted",
            staleProcessPids: [],
          },
        }
      : {
          nativeRuntime: {
            runtime: "node",
            expectedAbi: "141",
          },
        }),
    artifacts: [],
    failures: [],
  };
}

function desktopDogfoodHistoryReport() {
  return {
    __artifactPath: "test-results/subagent-desktop-dogfood-history-report/latest.json",
    schemaVersion: "ambient-subagent-desktop-dogfood-history-report-v1",
    generatedAt: "2026-06-05T00:58:00.000Z",
    historyPath: "test-results/subagent-desktop-dogfood/history.jsonl",
    status: "ready_to_graduate",
    ready: true,
    criteria: {
      minDesktopDogfoodRuns: 25,
      maxDesktopDogfoodFailureRate: 0.05,
      minWorkflowHighLoadReadyRuns: 25,
    },
    summary: {
      totalRunCount: 25,
      readyRunCount: 25,
      failedRunCount: 0,
      visualFailureRunCount: 0,
      maturityFailureRunCount: 0,
      readyRowsWithCompleteVisuals: 25,
      readyRowsWithCompleteMaturity: 25,
      highLoadReadyRunCount: 25,
      screenshotRunCount: 25,
      failureRate: 0,
      latestGeneratedAt: "2026-06-05T00:58:00.000Z",
      requiredScenarioCoverage: REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.map((id) => ({ id, runCount: 25, readyRunCount: 25 })),
    },
    blockedGateIds: [],
    gates: [
      "history_available",
      "history_parse",
      "desktop_dogfood_count",
      "desktop_dogfood_failure_rate",
      "required_scenario_coverage",
      "visual_assertions",
      "maturity_assertions",
      "workflow_high_load_repetition",
    ].map((id) => ({
      id,
      status: "passed",
      label: id,
      required: "passed",
      actual: "passed",
    })),
    invalidRows: [],
    latestRuns: [{
      generatedAt: "2026-06-05T00:58:00.000Z",
      runId: "desktop-clean-25",
      reportPath: "test-results/subagent-desktop-dogfood/latest.json",
      status: "passed",
      ready: true,
      visual: "11/11 passed",
      maturity: "15/15 passed",
      missingScenarios: 0,
    }],
  };
}

function liveHistoryReport() {
  return {
    __artifactPath: "test-results/subagent-live-history-report/latest.json",
    schemaVersion: "ambient-subagent-live-history-report-v1",
    generatedAt: "2026-06-05T00:58:00.000Z",
    historyPath: "test-results/subagent-release-gate/live-history.jsonl",
    status: "ready_to_graduate",
    ready: true,
    criteria: {
      minLiveDogfoodRuns: 25,
      maxLiveDogfoodFailureRate: 0.05,
    },
    summary: {
      totalRunCount: 25,
      requiredRunCount: 25,
      cleanRequiredRunCount: 25,
      failedRequiredRunCount: 0,
      advisoryRequiredRunCount: 0,
      skippedEvidenceRunCount: 0,
      livePiSmokePassed: true,
      evidenceLanes: REQUIRED_LIVE_HISTORY_EVIDENCE_LABELS.map((label) => ({
        label,
        presentRunCount: 25,
        skippedRunCount: 0,
        latestStatus: "present",
        latestCompletedAt: "2026-06-05T00:58:00.000Z",
      })),
      failureRate: 0,
      latestCompletedAt: "2026-06-05T00:58:00.000Z",
    },
    blockedGateIds: [],
    gates: [
      "history_available",
      "history_parse",
      "live_dogfood_count",
      "live_dogfood_failure_rate",
      "live_smoke",
    ].map((id) => ({
      id,
      status: "passed",
      label: id,
      required: "passed",
      actual: "passed",
    })),
    invalidRows: [],
    latestRequiredRuns: [{
      completedAt: "2026-06-05T00:58:00.000Z",
      runId: "live-clean-25",
      status: "passed",
      ready: true,
      skippedEvidenceLabels: [],
      reportPath: "test-results/subagent-release-gate/latest.json",
    }],
  };
}

function workflowJitterReleaseProfileReport() {
  return {
    __artifactPath: "test-results/workflow-jitter-release-gate/latest.json",
    schemaVersion: 1,
    status: "passed",
    generatedAt: "2026-06-05T00:58:00.000Z",
    matrixReportPath: "test-results/workflow-jitter-matrix/latest.json",
    policy: {
      requireLive: true,
      releaseProfile: true,
    },
    matrix: {
      runId: "workflow-jitter-release-run",
      generatedAt: "2026-06-05T00:57:00.000Z",
      profile: "release",
      taskCount: 16,
      deterministicCount: 6,
      liveCount: 10,
      deterministicStressUnitCount: 2079,
      livePromptVariantCount: 120,
      liveDogfoodRunCount: 10,
      liveFamilies: ["browser", "connector", "document", "local", "model-only", "recovery"],
      passedCount: 16,
      providerDegradedCount: 0,
      environmentSkippedCount: 0,
      productOrTestFailureCount: 0,
      promotionCandidateCount: 0,
      taskIds: [
        "model-tolerance-mock",
        "model-tolerance-live-compile-prompts",
        "workflow-ir-path-jitter",
        "workflow-path-registry-jitter",
        "workflow-ui-comprehension",
        "workflow-program-core",
        "ui-dogfood-vocabulary-quiz",
        "ui-dogfood-local-file-classifier",
        "ui-dogfood-public-source-browser",
        "ui-dogfood-downloads-document-categorization",
        "ui-dogfood-gmail-20-metadata-readonly-validation",
        "ui-dogfood-current-web-recipe-report",
        "ui-dogfood-flaky-browser-recovery",
        "ui-dogfood-vocabulary-quiz-repeat-2",
        "ui-dogfood-local-file-classifier-repeat-2",
        "ui-dogfood-public-source-browser-repeat-2",
      ],
    },
    checks: [{
      id: "matrix.release-profile",
      status: "pass",
      evidence: [
        "profile: release",
        "deterministicStressUnits: 2079/1000",
        "livePromptVariants: 120/120",
        "liveDogfoodRuns: 10/10",
        "liveFamilies: browser, connector, document, local, model-only, recovery",
      ],
      issues: [],
    }],
    releaseDecision: {
      ready: true,
      liveRequired: true,
      releaseProfile: true,
      liveSkipped: false,
      blockingIssues: [],
      advisoryIssues: [],
      nextSlice: "Workflow jitter release profile is green: deterministic stress, live prompt variants, dogfood run count, live families, and promotion debt are all satisfied.",
    },
  };
}

function desktopRunningChildTranscript() {
  return {
    childExpanded: true,
    transcriptPanelVisible: true,
    liveTranscriptShellVisible: true,
    liveTranscriptStreamVisible: true,
    liveTranscriptStatusVisible: true,
    miniThreadHeaderVisible: true,
    miniThreadHeaderNamesChild: true,
    openFullThreadActionVisible: true,
    openFullThreadActionNamesChild: true,
    liveTranscriptMessageCountVisible: true,
    liveTranscriptRuntimeEventCountVisible: true,
    liveTranscriptMessageCountMatchesBubbles: true,
    liveTranscriptRuntimeEventCountPositive: true,
    liveTranscriptModeLabelVisible: true,
    childStreaming: false,
    runtimeEventRailVisible: true,
    runtimeEventRailHasRecentEvents: true,
    runtimeTimelineVisible: true,
    runtimeTimelineCountVisible: true,
    runtimeTimelineRenderedCountMatchesRows: true,
    runtimeTimelineOmittedCountConsistent: true,
    runtimeEventRows: 3,
    userMessageVisible: true,
    assistantMessageVisible: true,
    siblingSummaryNotLeakedIntoTranscript: true,
    childRunIdVisible: true,
    childThreadIdVisible: true,
    messageBubbleCount: 2,
    childTranscriptTerminal: false,
    childTranscriptSynthesisSafe: false,
    liveContinuationMarkerVisible: true,
    liveContinuationMarkerAfterMessages: true,
    completionEndCapVisible: false,
    completionEndCapAfterMessages: false,
    completionSummaryDeferredWhileLive: true,
    transcriptEndStateCorrect: true,
    summaryNotObscuringTranscript: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
  };
}

function desktopCompletedChildTranscript() {
  return {
    childExpanded: true,
    transcriptPanelVisible: true,
    liveTranscriptShellVisible: true,
    liveTranscriptStreamVisible: true,
    liveTranscriptStatusVisible: true,
    miniThreadHeaderVisible: true,
    miniThreadHeaderNamesChild: true,
    openFullThreadActionVisible: true,
    openFullThreadActionNamesChild: true,
    liveTranscriptMessageCountVisible: true,
    liveTranscriptRuntimeEventCountVisible: true,
    liveTranscriptMessageCountMatchesBubbles: true,
    liveTranscriptRuntimeEventCountPositive: true,
    liveTranscriptModeLabelVisible: true,
    childStreaming: false,
    runtimeEventRailVisible: true,
    runtimeEventRailHasRecentEvents: true,
    runtimeTimelineVisible: true,
    runtimeTimelineCountVisible: true,
    runtimeTimelineRenderedCountMatchesRows: true,
    runtimeTimelineOmittedCountConsistent: true,
    runtimeEventRows: 2,
    userMessageVisible: false,
    assistantMessageVisible: true,
    siblingSummaryNotLeakedIntoTranscript: true,
    childRunIdVisible: true,
    childThreadIdVisible: true,
    messageBubbleCount: 1,
    childTranscriptTerminal: true,
    childTranscriptSynthesisSafe: true,
    liveContinuationMarkerVisible: false,
    liveContinuationMarkerAfterMessages: false,
    completionEndCapVisible: true,
    completionEndCapText: "Completion summary\nCompleted\nContext summarizer completed",
    completionEndCapLabelVisible: true,
    completionEndCapAfterMessages: true,
    completionSummaryDeferredWhileLive: true,
    transcriptEndStateCorrect: true,
    summaryNotObscuringTranscript: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
  };
}

function desktopVisualAssertions() {
  return {
    parent_child_placement: {
      id: "parent_child_placement",
      status: "passed",
      evidence: [
        "passed: primary child cluster rendered with stress clusters",
        "passed: primary child cluster follows the spawning parent message",
        "passed: primary child cluster is vertically below the parent message",
        "passed: stress clusters follow their spawning parent messages",
        "passed: parent and child thread ids are captured in the report",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-desktop.png",
        "test-results/subagent-desktop-dogfood/multi-cluster-stress-desktop.png",
      ],
    },
    default_collapsed_state: {
      id: "default_collapsed_state",
      status: "passed",
      evidence: [
        "passed: new child cluster is collapsed before interaction",
        "passed: stress clusters are collapsed before interaction",
        "passed: collapsed summary names sub-agent threads",
        "passed: collapsed summary names child count",
        "passed: stress summaries name their child counts",
        "passed: expanded state opens without losing the cluster set",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-desktop.png",
        "test-results/subagent-desktop-dogfood/multi-cluster-stress-desktop.png",
      ],
    },
    inline_child_mini_thread_chrome: {
      id: "inline_child_mini_thread_chrome",
      status: "passed",
      evidence: [
        "passed: running child transcript shows child-thread chrome",
        "passed: running child transcript names the child in Open full thread",
        "passed: running child transcript shows live/terminal mode",
        "passed: running child transcript shows runtime timeline counts",
        "passed: completed child transcript keeps child-thread chrome",
        "passed: completed child transcript shows completion end cap label",
        "passed: pattern graph click-through preserves child-thread chrome",
        "passed: completed graph click-through preserves terminal child-thread chrome",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/child-transcript-expanded-desktop.png",
        "test-results/subagent-desktop-dogfood/completed-child-transcript-desktop.png",
        "test-results/subagent-desktop-dogfood/pattern-graph-click-through-desktop.png",
        "test-results/subagent-desktop-dogfood/pattern-graph-completed-click-through-desktop.png",
      ],
    },
    blocking_attention_indicators: {
      id: "blocking_attention_indicators",
      status: "passed",
      evidence: [
        "passed: collapsed summary shows active blocking work",
        "passed: collapsed summary shows workflow blocking work",
        "passed: collapsed summary shows attention state",
        "passed: expanded child row shows approval blocker",
        "passed: expanded workflow row shows workflow blocker",
        "passed: parent wait row stays visible",
        "passed: warning tone is present for attention/blocking state",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-execution-desktop.png",
      ],
    },
    approval_runtime_ownership_labels: {
      id: "approval_runtime_ownership_labels",
      status: "passed",
      evidence: [
        "passed: approval prompt identifies the child",
        "passed: approval prompt shows requested tool scope",
        "passed: approval forwarding keeps child attribution",
        "passed: runtime catalog names the owning sub-agent",
        "passed: ordinary Stop is disabled while the child owns the runtime",
        "passed: forced runtime action consequence is visible",
        "passed: affected sub-agent is listed in runtime ownership UI",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/approval-forwarding-dialog.png",
        "test-results/subagent-desktop-dogfood/approval-forwarded-desktop.png",
        "test-results/subagent-desktop-dogfood/local-runtime-ownership-desktop.png",
      ],
    },
    denied_scope_explanations: {
      id: "denied_scope_explanations",
      status: "passed",
      evidence: [
        "passed: denied child scope mailbox row is visible",
        "passed: approval-unavailable reason is visible",
        "passed: denied connector category is visible",
        "passed: denied connector tool is visible",
        "passed: denied child identity is visible",
        "passed: denied non-interactive launch exposes no approval actions",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/denied-scope-explanation-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-desktop.png",
      ],
    },
    mutating_worker_evidence: {
      id: "mutating_worker_evidence",
      status: "passed",
      evidence: [
        "passed: mutating workflow task id is captured in the seed",
        "passed: mutating workflow artifact id is captured in the seed",
        "passed: mutating workflow run id is captured in the seed",
        "passed: mutating workflow is visible in the parent cluster",
        "passed: mutating workflow succeeded as a background task",
        "passed: mutating workflow names the child caller",
        "passed: mutating workflow shows child bridge approval",
        "passed: mutating workflow shows active isolated worktree evidence",
        "passed: mutating workflow shows nested fanout grant",
        "passed: mutating workflow shows staged output path",
        "passed: mutating workflow shows parent workspace unchanged",
        "passed: mutating workflow shows retained output preview",
        "passed: mutating workflow remains rehydrated after restart",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/mutating-worker-dogfood-desktop.png",
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      ],
    },
    workflow_high_load: {
      id: "workflow_high_load",
      status: "passed",
      evidence: [
        "passed: high-load workflow task ids are captured in the seed",
        "passed: all six Symphony presets are visible in the workflow cluster",
        "passed: high-load workflow task ids are visible",
        "passed: high-load workflow artifact ids are visible",
        "passed: high-load workflow run ids are visible",
        "passed: high-load workflow thread ids are visible",
        "passed: high-load workflow rows are completed background tasks",
        "passed: high-load workflow rows do not expose pause or cancel controls after completion",
        "passed: high-load workflow rows rehydrate after restart",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/workflow-high-load-desktop.png",
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      ],
    },
    pattern_graph_runtime: {
      id: "pattern_graph_runtime",
      status: "passed",
      evidence: [
        "passed: pattern graph click-through screenshot is captured",
        "passed: completed pattern graph click-through screenshot is captured",
        "passed: all six Symphony pattern nodes remain visible",
        "passed: graph node click expands the matching live child transcript",
        "passed: completed graph node click expands the matching terminal child transcript",
        "passed: graph links survive restart rehydration",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/pattern-graph-click-through-desktop.png",
        "test-results/subagent-desktop-dogfood/pattern-graph-completed-click-through-desktop.png",
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      ],
    },
    layout_safety: {
      id: "layout_safety",
      status: "passed",
      evidence: [
        "passed: collapsed desktop view has no horizontal overflow",
        "passed: expanded desktop view has no horizontal overflow",
        "passed: workflow view has no horizontal overflow",
        "passed: mutating worker view has no horizontal overflow",
        "passed: workflow high-load view has no horizontal overflow",
        "passed: denied-scope view has no horizontal overflow",
        "passed: lifecycle edge view has no horizontal overflow",
        "passed: restart view has no horizontal overflow",
        "passed: runtime ownership view has no horizontal overflow",
        "passed: multi-cluster stress view has no horizontal overflow",
        "passed: multi-cluster stress view has no critical overlap",
        "passed: mutating worker view has no critical overlap",
        "passed: workflow high-load view has no critical overlap",
        "passed: denied-scope view has no critical overlap",
        "passed: lifecycle edge view has no critical overlap",
        "passed: narrow view has no horizontal overflow",
        "passed: narrow view has no critical overlap",
        "passed: operator post-action view has no critical overlap",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-desktop.png",
        "test-results/subagent-desktop-dogfood/mutating-worker-dogfood-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-high-load-desktop.png",
        "test-results/subagent-desktop-dogfood/denied-scope-explanation-desktop.png",
        "test-results/subagent-desktop-dogfood/lifecycle-edge-visibility-desktop.png",
        "test-results/subagent-desktop-dogfood/multi-cluster-stress-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-narrow.png",
        "test-results/subagent-desktop-dogfood/operator-behavior-desktop.png",
      ],
    },
    workflow_artifact_rehydration: {
      id: "workflow_artifact_rehydration",
      status: "passed",
      evidence: [
        "passed: workflow artifact source path is captured in the seed",
        "passed: workflow artifact state path is captured in the seed",
        "passed: workflow artifact source content is captured in the seed",
        "passed: rehydrated workflow Program panel is selected",
        "passed: rehydrated workflow source path is visible",
        "passed: rehydrated workflow state path is visible",
        "passed: rehydrated workflow program body is visible",
        "passed: workflow detail source content matches expected content",
        "passed: workflow detail reports no source read error",
        "passed: workflow artifact rehydration view has no critical overlap",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/workflow-rehydrated-navigation-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-artifact-rehydration-desktop.png",
      ],
    },
    workflow_task_continuity: {
      id: "workflow_task_continuity",
      status: "passed",
      evidence: [
        "passed: workflow task row is visible",
        "passed: workflow task id is visible",
        "passed: workflow artifact id is visible",
        "passed: workflow run id is visible",
        "passed: workflow thread id is visible",
        "passed: workflow blocker remains visible",
        "passed: workflow task rehydrates after restart",
        "passed: mutating worker task rehydrates after restart",
        "passed: workflow high-load tasks rehydrate after restart",
        "passed: workflow artifact rehydrates after restart",
        "passed: mutating worker artifact rehydrates after restart",
        "passed: workflow high-load artifacts rehydrate after restart",
        "passed: rehydrated workflow thread link opens after restart",
        "passed: rehydrated workflow artifact content opens after restart",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/workflow-execution-desktop.png",
        "test-results/subagent-desktop-dogfood/mutating-worker-dogfood-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-high-load-desktop.png",
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-rehydrated-navigation-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-artifact-rehydration-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-accessibility.json",
      ],
    },
    lifecycle_edge_visibility: {
      id: "lifecycle_edge_visibility",
      status: "passed",
      evidence: [
        "passed: lifecycle parent message is visible",
        "passed: lifecycle edge cluster is collapsed by default",
        "passed: lifecycle cluster summary names four child threads",
        "passed: timed-out child remains visible",
        "passed: timeout attention choices remain visible",
        "passed: partial continuation decision is visible",
        "passed: partial summary is visible",
        "passed: retry child remains visible and parent-blocking",
        "passed: retry decision and effect are visible",
        "passed: detached child decision and effect are visible",
        "passed: lifecycle child identities are captured",
        "passed: lifecycle edge view has no critical overlap",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/lifecycle-edge-visibility-desktop.png",
      ],
    },
    parent_stop_cascade_visibility: {
      id: "parent_stop_cascade_visibility",
      status: "passed",
      evidence: [
        "passed: parent-stop parent message is visible",
        "passed: parent-stop cluster is collapsed by default",
        "passed: parent-stop cluster summary names three child threads",
        "passed: required child is shown as cancelled",
        "passed: optional child is shown as detached",
        "passed: completed child remains visible as unchanged",
        "passed: parent-stopped mailbox activity is visible",
        "passed: parent cancellation requested chip is visible",
        "passed: cancelled wait barrier is visible",
        "passed: cancelled child mailbox work is visible",
        "passed: parent-stop reason is visible",
        "passed: parent-stop cascade identities are captured",
        "passed: parent-stop cascade view has no critical overlap",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/parent-stop-cascade-desktop.png",
      ],
    },
  };
}

function desktopMaturityAssertions() {
  return {
    desktop_child_visibility: {
      id: "desktop_child_visibility",
      status: "passed",
      capabilities: [
        "production_ui_visibility",
        "parent_child_placement",
        "default_collapsed_state",
        "inline_child_mini_thread_chrome",
        "inline_child_live_transcript_primary",
        "blocking_attention_indicators",
      ],
      evidence: [
        "passed: parent thread id is captured",
        "passed: child thread ids are captured",
        "passed: cluster is default-collapsed before interaction",
        "passed: cluster follows the spawning parent message",
        "passed: expanded child rows stay inspectable",
        "passed: blocking and attention labels are visible",
        "passed: running child transcript has live message stream and runtime rail",
        "passed: completed child transcript shows completion summary after messages",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-desktop.png",
        "test-results/subagent-desktop-dogfood/child-transcript-expanded-desktop.png",
        "test-results/subagent-desktop-dogfood/completed-child-transcript-desktop.png",
      ],
    },
    desktop_approval_forwarding: {
      id: "desktop_approval_forwarding",
      status: "passed",
      capabilities: ["approval_parent_blocking", "approval_forwarding_behavior", "child_scoped_approval"],
      evidence: [
        "passed: approval id is captured",
        "passed: approval request parent mailbox event is captured",
        "passed: approval prompt identifies the child",
        "passed: approval buttons name the child",
        "passed: forwarded decision remains attributed to the child",
        "passed: parent remains blocked after forwarding",
        "passed: child returns to needs-steering after approval forwarding",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/approval-forwarding-dialog.png",
        "test-results/subagent-desktop-dogfood/approval-forwarded-desktop.png",
      ],
    },
    desktop_denied_scope_explanations: {
      id: "desktop_denied_scope_explanations",
      status: "passed",
      capabilities: [
        "tool_scope_denial_visibility",
        "approval_unavailable_visibility",
        "parent_mailbox_denial_explanation",
      ],
      evidence: [
        "passed: denied-scope parent mailbox event is captured",
        "passed: denied child run id is captured",
        "passed: denied child thread id is captured",
        "passed: denied connector category is visible",
        "passed: denied connector tool is visible",
        "passed: approval-unavailable explanation is visible",
        "passed: denied child source remains attributed",
        "passed: non-interactive denied launch has no approval actions",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/denied-scope-explanation-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-desktop.png",
      ],
    },
    desktop_workflow_execution: {
      id: "desktop_workflow_execution",
      status: "passed",
      capabilities: ["workflow_execution_parent_blocking", "workflow_task_continuity", "parent_blocking_workflow"],
      evidence: [
        "passed: workflow task id is captured",
        "passed: workflow run id is captured",
        "passed: workflow thread id is captured",
        "passed: workflow section is visible",
        "passed: workflow task row is visible",
        "passed: workflow parent blocker remains visible",
        "passed: workflow artifact id is visible",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/workflow-execution-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-accessibility.json",
      ],
    },
    desktop_mutating_worker_dogfood: {
      id: "desktop_mutating_worker_dogfood",
      status: "passed",
      capabilities: [
        "mutating_worker_dogfood_behavior",
        "child_scoped_approval",
        "isolated_child_worktree",
        "parent_workspace_unchanged",
      ],
      evidence: [
        "passed: mutating worker task id is captured",
        "passed: mutating worker artifact id is captured",
        "passed: mutating worker run id is captured",
        "passed: mutating worker child run id is captured",
        "passed: mutating worker child thread id is captured",
        "passed: mutating worker staged path is captured",
        "passed: mutating worker report path is captured",
        "passed: mutating worker progress message matches the seeded proof",
        "passed: parent workspace unchanged proof is true",
        "passed: mutating worker row is visible",
        "passed: mutating worker row shows child caller",
        "passed: mutating worker row shows child bridge approval",
        "passed: mutating worker row shows isolated worktree",
        "passed: mutating worker row shows staged output",
        "passed: mutating worker row shows parent workspace unchanged",
        "passed: mutating worker row rehydrates after restart",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/mutating-worker-dogfood-desktop.png",
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      ],
    },
    desktop_workflow_high_load: {
      id: "desktop_workflow_high_load",
      status: "passed",
      capabilities: [
        "workflow_high_load_dogfood",
        "symphony_six_patterns",
        "workflow_task_continuity",
        "layout_safety",
      ],
      evidence: [
        "passed: high-load workflow task ids are captured",
        "passed: high-load workflow artifact ids are captured",
        "passed: high-load workflow run ids are captured",
        "passed: all expected Symphony pattern labels are captured",
        "passed: workflow section contains at least six rows",
        "passed: all six Symphony presets are visible",
        "passed: high-load workflow ids are visible",
        "passed: high-load workflow run and thread ids are visible",
        "passed: high-load rows are completed background tasks",
        "passed: high-load rows rehydrate after restart",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/workflow-high-load-desktop.png",
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      ],
    },
    desktop_pattern_graph_runtime: {
      id: "desktop_pattern_graph_runtime",
      status: "passed",
      capabilities: [
        "pattern_graph_snapshot_persistence",
        "symphony_six_pattern_renderer",
        "child_thread_click_through",
        "restart_rehydration",
      ],
      evidence: [
        "passed: pattern graph snapshots persist in the Desktop dogfood artifact",
        "passed: all six Symphony patterns render as graph nodes",
        "passed: live graph nodes click through to child transcripts",
        "passed: completed graph nodes click through to terminal child transcripts",
        "passed: pattern graph links rehydrate after restart",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/pattern-graph-click-through-desktop.png",
        "test-results/subagent-desktop-dogfood/pattern-graph-completed-click-through-desktop.png",
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      ],
    },
    desktop_workflow_artifact_rehydration: {
      id: "desktop_workflow_artifact_rehydration",
      status: "passed",
      capabilities: ["workflow_artifact_rehydration_behavior", "artifact_source_link", "artifact_state_link"],
      evidence: [
        "passed: workflow artifact source path is captured",
        "passed: workflow artifact state path is captured",
        "passed: opened workflow thread remains active",
        "passed: linked workflow thread still points to the artifact",
        "passed: run detail reloads for the persisted run",
        "passed: source path is visible in the Program panel",
        "passed: state path is visible in the Program panel",
        "passed: program source content is visible in the Program panel",
        "passed: program source content matches the retained artifact",
        "passed: artifact source/state rehydration has no layout overlap",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/workflow-rehydrated-navigation-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-artifact-rehydration-desktop.png",
      ],
    },
    desktop_restart_rehydration: {
      id: "desktop_restart_rehydration",
      status: "passed",
      capabilities: ["restart_rehydration_behavior", "workflow_task_rehydration", "artifact_link"],
      evidence: [
        "passed: child run id rehydrates after relaunch",
        "passed: child thread id rehydrates after relaunch",
        "passed: completed child summary rehydrates after relaunch",
        "passed: workflow task rehydrates after relaunch",
        "passed: workflow artifact rehydrates after relaunch",
        "passed: high-load workflow tasks rehydrate after relaunch",
        "passed: high-load workflow artifacts rehydrate after relaunch",
        "passed: parent remains blocked after relaunch",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
      ],
    },
    desktop_workflow_rehydrated_navigation: {
      id: "desktop_workflow_rehydrated_navigation",
      status: "passed",
      capabilities: ["restart_rehydration_behavior", "workflow_thread_navigation", "artifact_link"],
      evidence: [
        "passed: workflow thread id is captured",
        "passed: rehydrated workflow open control remains actionable",
        "passed: opened workflow thread is selected in the sidebar",
        "passed: opened workflow thread matches the persisted id",
        "passed: opened workflow view has no navigation error",
        "passed: opened workflow view has no critical overlap",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/restart-rehydration-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-rehydrated-navigation-desktop.png",
      ],
    },
    desktop_local_runtime_ownership: {
      id: "desktop_local_runtime_ownership",
      status: "passed",
      capabilities: ["local_runtime_lease_ownership", "lease_stop_blocker", "untracked_runtime_safety"],
      evidence: [
        "passed: local runtime lease id is captured",
        "passed: local runtime id is captured",
        "passed: local runtime pid is captured",
        "passed: runtime catalog names the owning sub-agent",
        "passed: ordinary Stop is disabled while owned by the sub-agent",
        "passed: ordinary Restart is disabled while owned by the sub-agent",
        "passed: force consequence is visible",
        "passed: untracked runtime group remains external-safe",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/local-runtime-ownership-desktop.png",
      ],
    },
    desktop_operator_controls: {
      id: "desktop_operator_controls",
      status: "passed",
      capabilities: ["operator_child_controls", "operator_control_behavior", "retention_policy_integrity"],
      evidence: [
        "passed: cancel control child run id is captured",
        "passed: close control child run ids are captured",
        "passed: cancel action is visible and scoped",
        "passed: close controls preserve transcripts",
        "passed: completed child can be closed without deleting history",
        "passed: attention child can be cancelled without losing inspectability",
        "passed: sibling state is preserved after operator actions",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/expanded-desktop.png",
        "test-results/subagent-desktop-dogfood/operator-behavior-desktop.png",
      ],
    },
    desktop_visual_layout_safety: {
      id: "desktop_visual_layout_safety",
      status: "passed",
      capabilities: ["production_ui_visibility", "layout_safety", "workflow_task_continuity"],
      evidence: [
        "passed: semantic parent-child placement visual assertion passed",
        "passed: semantic blocking indicators visual assertion passed",
        "passed: semantic approval/runtime labels visual assertion passed",
        "passed: semantic workflow continuity visual assertion passed",
        "passed: semantic workflow high-load visual assertion passed",
        "passed: layout safety visual assertion passed",
        "passed: narrow view has no critical overlap",
        "passed: operator post-action view has no critical overlap",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
        "test-results/subagent-desktop-dogfood/workflow-high-load-desktop.png",
        "test-results/subagent-desktop-dogfood/expanded-narrow.png",
        "test-results/subagent-desktop-dogfood/operator-behavior-desktop.png",
      ],
    },
    desktop_multi_cluster_stress: {
      id: "desktop_multi_cluster_stress",
      status: "passed",
      capabilities: ["multi_parent_cluster_stress", "default_collapsed_state", "high_load_dogfood"],
      evidence: [
        "passed: stress parent message ids are captured",
        "passed: stress child run ids are captured",
        "passed: stress child thread ids are captured",
        "passed: all stress clusters remain collapsed by default",
        "passed: stress summaries are visible",
        "passed: stress clusters follow their parent messages",
        "passed: multi-cluster stress view has no critical overlap",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/multi-cluster-stress-desktop.png",
      ],
    },
    desktop_lifecycle_edges: {
      id: "desktop_lifecycle_edges",
      status: "passed",
      capabilities: [
        "lifecycle_edge_desktop_behavior",
        "lifecycle_terminal_child_transcript_behavior",
        "timeout_edge",
        "partial_result_edge",
        "retry_edge",
        "detach_edge",
        "parent_stop_cascade",
        "parent_stop_terminal_child_transcript_behavior",
      ],
      evidence: [
        "passed: lifecycle edge parent message id is captured",
        "passed: lifecycle edge child run ids are captured",
        "passed: lifecycle edge child thread ids are captured",
        "passed: lifecycle edge wait barrier ids are captured",
        "passed: timeout child and attention choices are visible",
        "passed: partial decision and summary are visible",
        "passed: retry decision and effect are visible",
        "passed: detached child decision and effect are visible",
        "passed: parent-stop cascade parent message id is captured",
        "passed: parent-stop cascade parent mailbox event id is captured",
        "passed: parent-stop cascade child run ids are captured",
        "passed: parent-stop cascade wait barrier ids are captured",
        "passed: parent-stop cascade cancelled mailbox event ids are captured",
        "passed: parent-stop cascade mailbox and effects are visible",
        "passed: parent-stop cascade child outcomes are visible",
        "passed: lifecycle visual assertion passed",
        "passed: parent-stop cascade visual assertion passed",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/lifecycle-edge-visibility-desktop.png",
        "test-results/subagent-desktop-dogfood/parent-stop-cascade-desktop.png",
      ],
    },
    desktop_chat_export_child_bundle: {
      id: "desktop_chat_export_child_bundle",
      status: "passed",
      capabilities: [
        "chat_export_child_bundle",
        "child_transcript_export",
        "child_full_transcript_export",
        "policy_provenance_export",
        "pattern_graph_export_links",
        "parent_mailbox_approval_export",
        "child_pi_session_status_export",
        "wait_barrier_export",
        "result_artifact_export",
        "lifecycle_edge_child_export",
        "parent_stop_child_export",
      ],
      evidence: [
        "passed: chat export zip artifact is captured",
        "passed: export API returned the configured E2E path",
        "passed: export zip was written",
        "passed: export result byte count matches zip bytes",
        "passed: manifest includes child thread bundle",
        "passed: child index contains expected child runs",
        "passed: child visible transcripts contain expected messages",
        "passed: lifecycle edge child transcripts are exported",
        "passed: parent-stop child transcripts are exported",
        "passed: child full transcripts are exported",
        "passed: child runtime events are exported",
        "passed: child tool-scope snapshots are exported",
        "passed: child wait barriers are exported",
        "passed: parent mailbox approval evidence is exported",
        "passed: callable workflow task evidence is exported",
        "passed: pattern graph child transcript links are exported",
        "passed: child Pi session status is recorded",
      ],
      artifactRefs: [
        "test-results/subagent-desktop-dogfood/desktop-chat-export.zip",
      ],
    },
  };
}

function desktopLifecycleEdgeVisibility() {
  return {
    parentMessageVisible: true,
    parentMessageIdCaptured: true,
    clusterVisible: true,
    clusterDefaultCollapsedBeforeOpen: true,
    summaryVisible: true,
    timeoutChildVisible: true,
    partialChildVisible: true,
    retryChildVisible: true,
    detachedChildVisible: true,
    timeoutAttentionVisible: true,
    timeoutChoicesVisible: true,
    partialDecisionVisible: true,
    partialSummaryVisible: true,
    retryDecisionVisible: true,
    retryEffectVisible: true,
    detachDecisionVisible: true,
    detachedEffectVisible: true,
    edgeIdentityCaptured: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
  };
}

function desktopMultiClusterStress() {
  return {
    clusterCount: 4,
    expectedClusterCountVisible: true,
    allClustersDefaultCollapsed: true,
    stressParentMessagesVisible: true,
    stressSummariesVisible: true,
    stressChildIdsCaptured: true,
    stressClustersAfterParentMessages: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    summaryTexts: [
      "Sub-agent threads\n2 children\n1 workflow task",
      "Sub-agent threads\n3 children\n1 attention",
      "Sub-agent threads\n3 children",
      "Sub-agent threads\n3 children",
    ],
  };
}

function desktopWorkflowExecution() {
  return {
    workflowSectionVisible: true,
    taskVisible: true,
    statusRunningVisible: true,
    modeBlockingVisible: true,
    sourceSymphonyVisible: true,
    progressVisible: true,
    telemetryVisible: true,
    launchCardVisible: true,
    parentThreadProvenanceVisible: true,
    parentBlockerVisible: true,
    mailboxBlockVisible: true,
    taskIdVisible: true,
    artifactIdVisible: true,
    runIdVisible: true,
    threadIdVisible: true,
    pauseControlVisible: true,
    cancelControlVisible: true,
    openWorkflowThreadVisible: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    workflowRows: [
      {
        text: [
          "Symphony Map-Reduce",
          "Running",
          "Blocking",
          "Symphony recipe",
          "Reducer waiting on workflow evidence",
          "3 events",
          "1 step done",
          "1 model call",
          "~96 tokens",
          "Risk: High",
          "Up to 12 agents",
          "Budget: 180,000 tokens",
          "Confirmation required",
          "Small slice recommended",
          "Caller: parent thread",
          "Approval: Launch Card",
          "Blocking: workflow work",
        ].join("\n"),
        titleText: "callable-workflow:desktop-dogfood-map-reduce\n" +
          "desktop-dogfood-workflow-artifact\n" +
          "desktop-dogfood-workflow-run\n" +
          "desktop-dogfood-workflow-thread",
      },
    ],
    mailboxRows: [
      {
        text: "Workflow blocked\n1 blocking workflow\n1 waiting\nSymphony Map-Reduce",
        titleText: "callable-workflow:desktop-dogfood-map-reduce",
      },
    ],
  };
}

function desktopMutatingWorkerDogfood() {
  return {
    taskVisible: true,
    statusSucceededVisible: true,
    modeBackgroundVisible: true,
    sourceSymphonyVisible: true,
    childCallerVisible: true,
    childRunVisible: true,
    childThreadVisible: true,
    approvalBridgeVisible: true,
    isolatedWorktreeVisible: true,
    nestedFanoutVisible: true,
    mutatingWorkerLabelVisible: true,
    stagedMutationVisible: true,
    parentWorkspaceUnchangedVisible: true,
    outputPreviewRetainedVisible: true,
    reportRelativePathCaptured: true,
    taskIdVisible: true,
    artifactIdVisible: true,
    runIdVisible: true,
    threadIdVisible: true,
    noPauseControlVisible: true,
    noCancelControlVisible: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
  };
}

function desktopWorkflowHighLoad() {
  return {
    workflowSectionVisible: true,
    expectedWorkflowRowCountVisible: true,
    allPresetLabelsVisible: true,
    highLoadTaskIdsVisible: true,
    highLoadArtifactIdsVisible: true,
    highLoadRunIdsVisible: true,
    highLoadThreadIdsVisible: true,
    backgroundRowsVisible: true,
    completedRowsVisible: true,
    highLoadRowsHaveNoPauseCancel: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    workflowRowCount: 6,
  };
}

function desktopDeniedScopeExplanation() {
  return {
    parentMailboxEventIdCaptured: true,
    spawnFailureVisible: true,
    approvalUnavailableVisible: true,
    deniedCategoryVisible: true,
    deniedToolVisible: true,
    sourceChildVisible: true,
    noInteractiveApprovalActions: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    mailboxRows: [
      {
        text: [
          "Spawn failed",
          "Child source: root/2:connector-denied / run desktop-dogfood-denied-scope-run / thread desktop-dogfood-denied-scope-thread",
          "Approval unavailable / Explorer",
          "Approval unavailable: non-interactive launch cannot surface required approval",
          "Denied categories: Connector Read (connector.read)",
          "Denied tools: Connector App gmail.search / Connector Read (connector.read)",
        ].join("\n"),
        titleText: "desktop-dogfood-denied-scope-run\ndesktop-dogfood-denied-scope-thread",
        actionCount: 0,
      },
    ],
  };
}

function desktopApprovalFlow() {
  return {
    approvalRequested: true,
    approvalBlockedChild: true,
    parentStillBlocked: true,
    childIdentifierVisible: true,
    toolScopeVisible: true,
    approvalScopeVisible: true,
    approvalPromptVisible: true,
    approveButtonVisible: true,
    denyButtonVisible: true,
    approvalButtons: 2,
    approvalButtonsNameChild: true,
  };
}

function desktopApprovalForwarding() {
  return {
    forwardedVisible: true,
    approvedDecisionVisible: true,
    childThreadScopeVisible: true,
    forwardedNamesChild: true,
    forwardedNamesApproval: true,
    forwardedMatchesApprovalChild: true,
    approvalRequestMatchesApprovalChild: true,
    forwardedAndRequestSameChild: true,
    approvalRequestStillVisible: true,
    approvalRequestActionsRemoved: true,
    parentStillBlockedAfterForward: true,
    childRowDataMatchesApprovalChild: true,
    childRowStillBlocksApprovalChild: true,
    childReturnedToNeedsSteering: true,
    waitBarrierStillVisible: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    mailboxRows: [
      {
        text: "Approval forwarded\nApproved / This child thread / desktop-dogfood-approval-write",
        titleText: "Child source: root/0:reviewer / run desktop-dogfood-review-run / thread desktop-dogfood-review-thread",
      },
      {
        text: "Approval requested\nAllow workspace write / workspace.write / This child thread",
        titleText: "Child source: root/0:reviewer / run desktop-dogfood-review-run / thread desktop-dogfood-review-thread",
      },
    ],
    childRows: [
      {
        text: "Review worker\nBlocking: needs steering\nPath: root/0:reviewer",
        titleText: "Child: Review worker / Path: root/0:reviewer / Status: Needs attention",
        childRunId: "desktop-dogfood-review-run",
        childThreadId: "desktop-dogfood-review-thread",
      },
    ],
  };
}

function desktopRestartRehydration() {
  return {
    defaultCollapsedAfterRelaunch: true,
    expandedAfterRelaunch: true,
    parentMessageVisible: true,
    approvalForwardedRehydrated: true,
    approvalRequestRehydrated: true,
    approvalActionsStillRemoved: true,
    parentStillBlockedAfterRelaunch: true,
    childBlockerRehydrated: true,
    childRunIdRehydrated: true,
    childThreadIdRehydrated: true,
    completedChildResultSummaryRehydrated: true,
    workflowTaskRehydrated: true,
    workflowBlockerRehydrated: true,
    workflowMailboxBlockRehydrated: true,
    workflowArtifactRehydrated: true,
    workflowRunRehydrated: true,
    workflowThreadRehydrated: true,
    mutatingWorkflowTaskRehydrated: true,
    mutatingWorkflowArtifactRehydrated: true,
    mutatingWorkflowRunRehydrated: true,
    workflowHighLoadTasksRehydrated: true,
    workflowHighLoadArtifactsRehydrated: true,
    workflowHighLoadRunsRehydrated: true,
    childRowsRehydrated: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    mailboxRows: [
      {
        text: "Approval forwarded\nApproved / This child thread / desktop-dogfood-approval-write",
        titleText: "Child source: root/0:reviewer / run desktop-dogfood-review-run / thread desktop-dogfood-review-thread",
      },
      {
        text: "Approval requested\nAllow workspace write / workspace.write / This child thread",
        titleText: "Child source: root/0:reviewer / run desktop-dogfood-review-run / thread desktop-dogfood-review-thread",
      },
    ],
    childRows: [
      {
        text: "Review worker\nBlocking: needs steering\nNeeds attention",
        titleText: "Child: Review worker / Path: root/0:reviewer / Status: Needs attention",
      },
      {
        text: "Context summarizer\nBackground context summary is available.\nCompleted",
        titleText: "Open sub-agent root/1:summarizer",
      },
    ],
  };
}

function desktopWorkflowRehydratedNavigation() {
  return {
    workflowAutomationPaneVisible: true,
    workflowThreadHeaderVisible: true,
    workflowThreadSidebarSelected: true,
    workflowThreadTitleVisible: true,
    workflowThreadFolderLinkPresent: true,
    workflowThreadMatchesExpectedId: true,
    legacyOrThreadPaneVisible: true,
    navigationErrorAbsent: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    activeThreadRows: [
      {
        text: "Desktop Dogfood Symphony Map-Reduce\nReady for preview · ambientCoder",
        title: "Desktop Dogfood Symphony Map-Reduce",
      },
    ],
    linkedThread: {
      id: "desktop-dogfood-workflow-thread",
      title: "Desktop Dogfood Symphony Map-Reduce",
    },
    navigationErrors: [],
  };
}

function desktopWorkflowArtifactRehydration() {
  return {
    workflowBuildWorkspaceVisible: true,
    sourcePanelSelected: true,
    artifactTitleVisible: true,
    activeWorkflowThreadVisible: true,
    artifactIdMatchesLinkedThread: true,
    runDetailLoaded: true,
    sourcePathVisible: true,
    statePathVisible: true,
    sourceContentVisible: true,
    sourceContentMatchesExpected: true,
    noSourceReadError: true,
    detailSourcePathMatches: true,
    detailStatePathMatches: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    linkedThread: {
      id: "desktop-dogfood-workflow-thread",
      title: "Desktop Dogfood Symphony Map-Reduce",
      activeArtifactId: "desktop-dogfood-workflow-artifact",
    },
    detail: {
      artifactId: "desktop-dogfood-workflow-artifact",
      runId: "desktop-dogfood-workflow-run",
      sourcePath: "/tmp/workspace/.ambient-codex/workflows/desktop-dogfood-map-reduce/main.ts",
      statePath: "/tmp/workspace/.ambient-codex/workflows/desktop-dogfood-map-reduce/state.json",
    },
    sourcePanelText: [
      "Desktop Dogfood Symphony Map-Reduce",
      "Source Program",
      "export const workflow = 'desktop dogfood map reduce';",
      "Source",
      ".ambient-codex/workflows/desktop-dogfood-map-reduce/main.ts",
      "State",
      ".ambient-codex/workflows/desktop-dogfood-map-reduce/state.json",
    ].join("\n"),
  };
}

function desktopLocalRuntimeOwnership() {
  const runtimeText = [
    "Local Text 4B",
    "Running · Managed",
    "Local text · local/text-4b",
    "Running",
    "Managed",
    "In use by sub-agent Review worker",
    "Actual RSS 5 GiB / Estimate 6 GiB",
    "http://127.0.0.1:43123/health",
    "pid 4301",
    "Stop disabled",
    "Restart disabled",
    "Forced Stop/Restart cancels affected sub-agents",
    "Ordinary Stop/Restart blocked by 1 active sub-agent lease: desktop-dogfood-local-runtime-lease",
    "Forced Stop/Restart will cancel or mark 1 affected sub-agent: sub-agent Review worker (run desktop-dogfood-review-run, thread desktop-dogfood-review-thread, lease desktop-dogfood-local-runtime-lease) before changing this runtime.",
    "In use by sub-agent Review worker.",
    "Blockers: desktop-dogfood-local-runtime-lease",
    "Affected sub-agents: sub-agent Review worker (run desktop-dogfood-review-run, thread desktop-dogfood-review-thread, lease desktop-dogfood-local-runtime-lease)",
    "Runtime: local-text-runtime",
  ].join("\n");
  const untrackedRuntimeText = [
    "/tmp/manual-untracked-model.gguf",
    "Running · Untracked",
    "Local text · /tmp/manual-untracked-model.gguf",
    "Running",
    "Untracked",
    "No active owner",
    "Actual RSS 2 GiB",
    "http://127.0.0.1:44222",
    "pid 4404",
    "Stop disabled",
    "Restart disabled",
    "Force termination unavailable",
    "Ordinary Stop/Restart disabled because this local runtime is untracked.",
    "Forced termination unavailable for untracked processes; ask the owner to stop it outside Ambient.",
    "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
    "Runtime: untracked-llama:4404",
  ].join("\n");
  return {
    settingsPanelVisible: true,
    localModelsSectionVisible: true,
    runtimeInventoryVisible: true,
    activeLeaseVisible: true,
    ownerLabelVisible: true,
    managedRunningVisible: true,
    localTextCapabilityVisible: true,
    stopDisabledVisible: true,
    restartDisabledVisible: true,
    forceConsequenceVisible: true,
    blockerLeaseVisible: true,
    affectedSubagentVisible: true,
    childRunIdVisible: true,
    childThreadIdVisible: true,
    runtimeIdVisible: true,
    pidVisible: true,
    endpointVisible: true,
    ordinaryStopReasonVisible: true,
    untrackedRuntimeVisible: true,
    untrackedRuntimeIdVisible: true,
    untrackedRuntimePidVisible: true,
    untrackedRuntimeEndpointVisible: true,
    untrackedRuntimeModelVisible: true,
    untrackedStopDisabledVisible: true,
    untrackedRestartDisabledVisible: true,
    untrackedForceUnavailableVisible: true,
    untrackedExternalStopGuidanceVisible: true,
    untrackedGroupSafeVisible: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    runtimeCardText: runtimeText,
    runtimeCardTitles: "In use by sub-agent Review worker.\nStop disabled\nRestart disabled",
    untrackedRuntimeCardText: untrackedRuntimeText,
    untrackedRuntimeCardTitles: "This local model process is untracked, so Ambient cannot assume it is safe to stop.\nThis local model process is untracked, so Ambient cannot assume it is safe to restart.",
    runtimeCards: [
      {
        text: runtimeText,
        titleText: "In use by sub-agent Review worker.\nStop disabled\nRestart disabled",
        buttonSummaries: [
          { text: "Stop", disabled: true, title: "In use by sub-agent Review worker." },
          { text: "Restart", disabled: true, title: "In use by sub-agent Review worker." },
        ],
      },
      {
        text: untrackedRuntimeText,
        titleText: "This local model process is untracked, so Ambient cannot assume it is safe to stop.\nThis local model process is untracked, so Ambient cannot assume it is safe to restart.",
        buttonSummaries: [
          { text: "Stop", disabled: true, title: "This local model process is untracked, so Ambient cannot assume it is safe to stop." },
          { text: "Restart", disabled: true, title: "This local model process is untracked, so Ambient cannot assume it is safe to restart." },
        ],
      },
    ],
  };
}

function desktopOperatorControls() {
  return {
    cancelActionVisible: true,
    closeAttentionChildVisible: true,
    closeCompletedChildVisible: true,
    cancelScopedToAttentionChild: true,
    noCancelForCompletedChild: true,
    closeTitlesPreserveTranscripts: true,
    controlsUseIconButtons: true,
    controlsNameChild: true,
    controlsNotDisabled: true,
    cancelButtons: 1,
    closeButtons: 2,
  };
}

function desktopOperatorBehavior() {
  return {
    completedChildClosed: true,
    completedChildStillVisible: true,
    completedChildControlsReleased: true,
    attentionChildCancelled: true,
    attentionChildStillVisible: true,
    attentionCancelControlRemoved: true,
    siblingStatePreserved: true,
    lifecycleInterruptionVisible: true,
    typedBarrierConsequenceVisible: true,
    rowsStillInspectable: true,
    horizontalOverflowFree: true,
    criticalOverlapCount: 0,
    rowSummaries: [
      {
        text: "Review worker\nCancelled",
        titleText: "Path: root/0:reviewer",
        cancelActions: 0,
        closeActions: 1,
      },
      {
        text: "Context summarizer\nClosed\nCompleted",
        titleText: "root/1:summarizer",
        cancelActions: 0,
        closeActions: 0,
      },
    ],
  };
}

function desktopChatExport() {
  return {
    apiReturnedPath: true,
    apiSource: "visible-chat-fallback",
    zipWritten: true,
    zipBytes: 42_000,
    resultBytesMatchZip: true,
    manifestIncludesChildThreads: true,
    indexContainsExpectedChildren: true,
    childTranscriptsContainExpectedMessages: true,
    lifecycleEdgeChildrenExported: true,
    parentStopCascadeChildrenExported: true,
    childFullTranscriptsIncluded: true,
    childRunEventsIncluded: true,
    childToolScopeSnapshotsIncluded: true,
    childWaitBarriersIncluded: true,
    parentMailboxIncluded: true,
    approvalAuthorityContract: {
      requestExported: true,
      forwardedExported: true,
      eventIdMatches: true,
      schemaMatches: true,
      childIdentityMatches: true,
      requestedToolMatches: true,
      requestedScopeThisAction: true,
      requestEffectiveScopeNarrow: true,
      forwardedEffectiveScopeChildThread: true,
      parentBlockingResumeMatches: true,
      forwardedParentBlockingResumeMatches: true,
      waitBarrierMatches: true,
      instructionPreservesBlocking: true,
    },
    callableWorkflowTasksIncluded: true,
    patternGraphLinksIncluded: true,
    childPiSessionStatusRecorded: true,
    exportedChildRunIds: [
      "desktop-dogfood-review-run",
      "desktop-dogfood-summary-run",
      "desktop-dogfood-lifecycle-timeout-run",
      "desktop-dogfood-lifecycle-partial-run",
      "desktop-dogfood-lifecycle-retry-run",
      "desktop-dogfood-lifecycle-detached-run",
      "desktop-dogfood-parent-stop-required-run",
      "desktop-dogfood-parent-stop-background-run",
      "desktop-dogfood-parent-stop-completed-run",
    ],
  };
}

function liveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "subagent-wait-approval-bridge",
    sliceKind: "pi_tool_prompt",
    status: "passed",
    hypothesis: "A GMI-backed parent can spawn and wait on a required child.",
    expectedObservation: "Parent blocks until the child produces a synthesizable result.",
    actualOutcome: "Parent stayed blocked and resumed after the child result.",
    confidenceDelta: "increased",
    followUp: "Keep the artifact with the slice evidence.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw the parent block on a required child and resume after the child result.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "gmi-cloud",
      providerId: "gmi-cloud",
      modelRuntimeId: "zai-org/GLM-5.1-FP8",
      usingGmiOverride: true,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "launch_arg",
    },
    capabilitiesObserved: ["streaming", "tool_calling"],
    probes: [{
      label: "GMI-backed parent spawned and waited on a required child.",
      command: "AMBIENT_PROVIDER=gmi-cloud AMBIENT_SUBAGENT_LIVE=1 pnpm run test:subagents:live",
    }],
    artifacts: [{
      label: "live smoke report",
      path: "test-results/subagent-live-smoke/latest.json",
      kind: "json",
    }],
    observations: [{
      label: "parent wait",
      result: "Parent stayed blocked until the child produced a synthesizable result.",
    }],
    classifiedBlockers: [],
    productIssues: [],
  };
}

function childAuthorityLiveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/child-authority-latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "subagent-child-authority-live-dogfood",
    sliceKind: "child_authority",
    status: "passed",
    hypothesis: "A live child session can inherit parent authority roots, narrow them by launch policy, and route delegated reads plus approval requests through child-scoped runtime ownership.",
    expectedObservation: "The authority confidence report includes long_context_process authority-root proof, file approval forwarding, and browser approval forwarding with no denied-content leakage.",
    actualOutcome: "Passed: proved long_context_process authority for long-context-run, child file approval approval-run, and child browser approval browser-run.",
    confidenceDelta: "increased",
    followUp: "Keep child authority confidence in the required-live release gate.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw child authority dogfood prove delegated reads and parent-forwarded approvals.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "gmi-cloud",
      providerId: "gmi-cloud",
      usingGmiOverride: true,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: [
      "delegated_tool_authority",
      "long_context_authority_roots",
      "document_root_inheritance",
      "native_pdf_office_read",
      "parent_approval_forwarding",
      "child_approval_pause",
      "parent_blocking_resume",
      "child_scoped_approval",
      "browser_authority",
      "browser_approval_resume",
      "secret_non_leakage",
      "least_privilege_child_policy",
    ],
    maturityAssertions: [{
      id: "child_long_context_authority",
      label: "Child delegated long-context authority",
      status: "passed",
      artifactPath: "test-results/subagent-live-smoke/long-context-authority-latest.json",
      capabilities: [
        "delegated_tool_authority",
        "long_context_authority_roots",
        "document_root_inheritance",
        "secret_non_leakage",
      ],
      evidence: [
        "childThreadId: long-context-child",
        "readRoots: text, pdf, office",
        "writeDecision: deny",
        "deniedContentLeaked: false",
      ],
    }, {
      id: "child_file_approval_authority",
      label: "Child file approval authority",
      status: "passed",
      artifactPath: "test-results/subagent-live-smoke/approval-authority-latest.json",
      capabilities: [
        "parent_approval_forwarding",
        "child_approval_pause",
        "parent_blocking_resume",
        "child_scoped_approval",
        "secret_non_leakage",
      ],
      evidence: [
        "childThreadId: approval-child",
        "requestedToolId: read",
        "approvalForwardedToParent: true",
        "parentRemainedBlocked: true",
      ],
    }, {
      id: "child_browser_approval_authority",
      label: "Child browser approval authority",
      status: "passed",
      artifactPath: "test-results/subagent-live-smoke/browser-approval-latest.json",
      capabilities: [
        "browser_authority",
        "parent_approval_forwarding",
        "child_approval_pause",
        "parent_blocking_resume",
        "child_scoped_approval",
        "browser_approval_resume",
      ],
      evidence: [
        "childThreadId: browser-child",
        "requestedToolId: browser_search",
        "approvalScope: always_thread",
        "resumeSynthesisAllowed: false",
      ],
    }],
    probes: [{
      label: "GMI-backed child authority live dogfood",
      command: "pnpm run test:subagents:live:authority",
    }],
    artifacts: [{
      label: "child long-context authority proof",
      path: "test-results/subagent-live-smoke/long-context-authority-latest.json",
      kind: "json",
    }, {
      label: "child file approval authority proof",
      path: "test-results/subagent-live-smoke/approval-authority-latest.json",
      kind: "json",
    }, {
      label: "child browser approval authority proof",
      path: "test-results/subagent-live-smoke/browser-approval-latest.json",
      kind: "json",
    }],
    observations: [{
      label: "long_context_process authority",
      result: "Child read all granted document roots and denied sibling content without leakage.",
    }, {
      label: "child file approval",
      result: "Child file read approval paused child work and surfaced in the parent mailbox.",
    }, {
      label: "child browser approval",
      result: "Child browser approval used a child-thread scoped approval and kept parent synthesis blocked.",
    }],
    classifiedBlockers: [],
    productIssues: [],
  };
}

function workflowLiveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/workflow-symphony-latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "workflow-symphony-live-dogfood",
    sliceKind: "workflow_symphony",
    status: "passed",
    hypothesis: "A real GMI-backed workflow run plus broader Workflow Agent UI dogfood and callable workflow proof artifacts can execute safe workflow paths, preserve workflow thread/artifact/run links, prove child-originated mutating workers stay scoped, and rehydrate task/artifact telemetry after restart.",
    expectedObservation: "The workflow confidence report includes a succeeded live workflow run, a passed multi-scenario Workflow Agent UI dogfood matrix, child-originated mutating callable workflow dogfood with parent blocking and denied-scope proof, and callable workflow task/artifact/run/progress/usage rehydration evidence.",
    actualOutcome: "Passed: succeeded workflow run workflow-run for workflow thread workflow-thread; Workflow Agent UI dogfood covered 2 broader scenario(s); callable workflow task workflow-task-1 proved mutating child dogfood and rehydrated task/artifact/run telemetry.",
    confidenceDelta: "increased",
    followUp: "Keep the workflow live artifact with the slice evidence.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw workflow/Symphony dogfood produce a workflow/Symphony confidence proof set.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "gmi-cloud",
      providerId: "gmi-cloud",
      usingGmiOverride: true,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: [
      "workflow_launch",
      "ambient_runtime_call",
      "artifact_link",
      "checkpoint_output",
      "mutating_child_workflow",
      "child_scoped_approval",
      "isolated_child_worktree",
      "parent_blocking_workflow",
      "denied_workflow_scope",
      "workflow_task_rehydration",
      "broader_live_workflow_runs",
      "workflow_agent_ui_dogfood",
      "workflow_output_evidence",
      "electron_workflow_dogfood",
    ],
    maturityAssertions: [{
      id: "live_workflow_run",
      label: "Live workflow run",
      status: "passed",
      artifactPath: "test-results/workflow-local-file-run-dogfood/latest.json",
      capabilities: ["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"],
      evidence: [
        "workflowRunId: workflow-run",
        "workflowThreadId: workflow-thread",
        "checkpoint: present",
        "succeededModelCalls: 1",
      ],
    }, {
      id: "broader_workflow_ui_dogfood",
      label: "Broader Workflow Agent UI dogfood",
      status: "passed",
      artifactPath: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json",
      capabilities: [
        "broader_live_workflow_runs",
        "workflow_agent_ui_dogfood",
        "workflow_output_evidence",
        "electron_workflow_dogfood",
      ],
      evidence: [
        "suite: phase0-live",
        "scenarios: vocabulary-quiz, local-file-classifier",
        "passedScenarios: 2",
        "totalModelCalls: 3",
        "totalOutputSignals: 5",
      ],
    }, {
      id: "child_mutating_workflow",
      label: "Child-originated mutating workflow",
      status: "passed",
      artifactPath: "test-results/callable-workflow-dogfood/latest.json",
      capabilities: [
        "mutating_child_workflow",
        "child_scoped_approval",
        "isolated_child_worktree",
        "parent_blocking_workflow",
        "denied_workflow_scope",
      ],
      evidence: [
        "taskId: workflow-task-1",
        "subagentRunId: subagent-run-1",
        "approvalScope: this_child_thread",
        "worktreeStatus: active",
        "stagedRelativePath: src/feature.txt",
        "deniedScope: workflow.call",
      ],
    }, {
      id: "workflow_task_artifact_rehydration",
      label: "Workflow task and artifact rehydration",
      status: "passed",
      artifactPath: "test-results/callable-workflow-rehydration/latest.json",
      capabilities: ["workflow_task_rehydration", "artifact_link", "checkpoint_output"],
      evidence: [
        "taskId: workflow-task-1",
        "workflowArtifactId: workflow-artifact-1",
        "workflowRunId: workflow-run-1",
        "workflowThreadId: workflow-thread-1",
        "progressEvents: 4",
        "tokenCount: 21",
      ],
    }],
    probes: [{
      label: "GMI-backed workflow/Symphony live dogfood",
      command: "pnpm run test:subagents:live-confidence:workflow-prereqs",
    }],
    artifacts: [
      {
        label: "workflow/Symphony confidence proof set",
        path: "test-results/workflow-local-file-run-dogfood/latest.json",
        kind: "json",
      },
      {
        label: "Workflow Agent UI dogfood matrix proof",
        path: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json",
        kind: "json",
      },
      {
        label: "callable workflow mutating child dogfood proof",
        path: "test-results/callable-workflow-dogfood/latest.json",
        kind: "json",
      },
      {
        label: "callable workflow task rehydration proof",
        path: "test-results/callable-workflow-rehydration/latest.json",
        kind: "json",
      },
    ],
    observations: [
      {
        label: "live workflow dogfood artifact",
        result: "Succeeded workflow run workflow-run for workflow thread workflow-thread.",
      },
      {
        label: "Workflow Agent UI dogfood matrix artifact",
        result: "Passed 2 broader Workflow Agent UI scenario(s): vocabulary-quiz, local-file-classifier.",
      },
      {
        label: "callable workflow mutating child dogfood artifact",
        result: "Child subagent-run-1 ran blocking task workflow-task-1 and proved denied workflow scope.",
      },
      {
        label: "callable workflow task rehydration artifact",
        result: "Rehydrated task workflow-task-1 with artifact workflow-artifact-1, run workflow-run-1, 4 progress events, and 21 tokens.",
      },
    ],
    classifiedBlockers: [],
    productIssues: [],
  };
}

function workflowBroaderLiveConfidenceArtifact() {
  const artifact = workflowLiveConfidenceArtifact();
  return {
    ...artifact,
    __artifactPath: "test-results/subagent-live-confidence/workflow-symphony-broader-latest.json",
    sliceId: "workflow-symphony-broader-live-dogfood",
    sliceKind: "workflow_symphony_broader",
    hypothesis: "A real GMI-backed workflow run plus broader phase-1 Workflow Agent UI dogfood and callable workflow proof artifacts can execute safe workflow paths, preserve workflow thread/artifact/run links, prove child-originated mutating workers stay scoped, and rehydrate task/artifact telemetry after restart.",
    expectedObservation: "The broader workflow confidence report includes a succeeded live workflow run, a passed phase-1 multi-scenario Workflow Agent UI dogfood matrix, child-originated mutating callable workflow dogfood with parent blocking and denied-scope proof, and callable workflow task/artifact/run/progress/usage rehydration evidence.",
    actualOutcome: "Passed: succeeded workflow run workflow-run for workflow thread workflow-thread; Workflow Agent UI dogfood covered 4 broader phase-1 scenario(s); callable workflow task workflow-task-1 proved mutating child dogfood and rehydrated task/artifact/run telemetry.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw broader workflow/Symphony dogfood produce a phase-1 workflow/Symphony confidence proof set.",
    },
    capabilitiesObserved: [
      ...artifact.capabilitiesObserved,
      "phase1_workflow_ui_dogfood",
    ],
    maturityAssertions: artifact.maturityAssertions.map((assertion) => assertion.id === "broader_workflow_ui_dogfood"
      ? {
          ...assertion,
          artifactPath: "test-results/workflow-agent-thread-ui-dogfood/phase1-live-matrix-latest.json",
          evidence: [
            "suite: phase1-live",
            "scenarios: gmail-20-metadata-readonly-validation, downloads-document-categorization, public-source-browser, current-web-recipe-report",
            "passedScenarios: 4",
            "totalModelCalls: 8",
            "totalOutputSignals: 12",
          ],
        }
      : assertion),
    probes: [{
      label: "GMI-backed broader workflow/Symphony live dogfood",
      command: "pnpm run test:subagents:live-confidence:workflow-broader-prereqs",
    }],
    observations: artifact.observations.map((observation) => observation.label === "Workflow Agent UI dogfood matrix artifact"
      ? {
          label: "Workflow Agent UI dogfood matrix artifact",
          result: "Passed 4 broader phase-1 Workflow Agent UI scenario(s): gmail-20-metadata-readonly-validation, downloads-document-categorization, public-source-browser, current-web-recipe-report.",
        }
      : observation),
  };
}

function localRuntimeLiveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/local-runtime-latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "local-runtime-control-proof",
    sliceKind: "local_runtime",
    status: "passed",
    hypothesis: "A local runtime proof run can show sub-agent-owned leases block ordinary Stop and stale leases recover.",
    expectedObservation: "The local runtime proof report includes passed active sub-agent Stop blocker and stale lease recovery evidence.",
    actualOutcome: "Passed: proved ordinary Stop is blocked by lease-review for sub-agent Review worker, stale lease lease-stale no longer blocked Stop/Restart, and untracked runtime untracked-llama:4401 stayed external-only.",
    confidenceDelta: "increased",
    followUp: "Keep the local runtime live artifact with the slice evidence.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw the local runtime proof show a sub-agent-owned lease blocking ordinary Stop and a stale lease recovering to ordinary Stop/Restart.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "local",
      providerId: "local-runtime",
      usingGmiOverride: false,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: [
      "local_runtime_lease_ownership",
      "lease_stop_blocker",
      "stale_lease_recovery",
      "untracked_runtime_safety",
      "provider_lifecycle",
      "stopped_provider_display",
      "non_destructive_stop",
      "proof_gate_clean",
    ],
    maturityAssertions: [{
      id: "local_runtime_active_lease_stop_blocker",
      label: "Active sub-agent lease Stop blocker",
      status: "passed",
      artifactPath: "test-results/local-runtime-control-proof/latest.json",
      capabilities: ["local_runtime_lease_ownership", "lease_stop_blocker"],
      evidence: [
        "leaseId: lease-review",
        "subagentThreadId: child-thread",
        "modelRuntimeId: local-text-runtime",
        "modelProfileId: local-text-4b-q4",
        "ordinaryStopAllowed: false",
        "forceRequiresSubagentCancellation: true",
      ],
    }, {
      id: "local_runtime_untracked_safety",
      label: "Untracked runtime safety",
      status: "passed",
      artifactPath: "test-results/local-runtime-control-proof/latest.json",
      capabilities: ["untracked_runtime_safety"],
      evidence: [
        "runtimeEntryId: untracked-llama:4401",
        "trackingStatus: untracked",
        "ordinaryStopAllowed: false",
        "ordinaryRestartAllowed: false",
        "forceTerminationAllowed: false",
        "nextSafeAction: ask-user-to-stop-untracked",
      ],
    }, {
      id: "local_runtime_stale_lease_recovery",
      label: "Stale lease recovery",
      status: "passed",
      artifactPath: "test-results/local-runtime-control-proof/latest.json",
      capabilities: ["stale_lease_recovery"],
      evidence: [
        "staleLeaseIds: lease-stale",
        "activeLeaseCount: 0",
        "activeOwnerCount: 0",
        "ordinaryStopAllowed: true",
        "ordinaryRestartAllowed: true",
        "forceRequiresSubagentCancellation: false",
      ],
    }, {
      id: "local_runtime_provider_lifecycle",
      label: "Provider lifecycle and stopped display",
      status: "passed",
      artifactPath: "test-results/local-runtime-control-proof/latest.json",
      capabilities: ["provider_lifecycle", "stopped_provider_display", "non_destructive_stop"],
      evidence: [
        "minicpmStopped: true",
        "packageStatePreserved: true",
        "minicpmDisplayedStopped: true",
        "voiceDisplayedStopped: true",
        "providerActions: start, stop, restart",
        "usedGenericLifecycle: false",
      ],
    }, {
      id: "local_runtime_proof_gate",
      label: "Local runtime proof gate",
      status: "passed",
      artifactPath: "test-results/local-runtime-control-proof-gate/latest.json",
      capabilities: ["proof_gate_clean"],
      evidence: [
        "gateStatus: passed_with_advisories",
        "blockingIssues: 0",
        "failedChecks: 0",
      ],
    }],
    probes: [{
      label: "local runtime control proof",
      command: "pnpm run test:local-runtime-control:proof",
    }],
    artifacts: [{
      label: "local runtime control proof report",
      path: "test-results/local-runtime-control-proof/latest.json",
      kind: "json",
    }, {
      label: "local runtime proof gate report",
      path: "test-results/local-runtime-control-proof-gate/latest.json",
      kind: "json",
    }],
    observations: [{
      label: "local runtime control proof artifact",
      result: "Active lease lease-review owned by sub-agent Review worker blocked ordinary Stop.",
    }, {
      label: "stale lease recovery",
      result: "Stale leases lease-stale stayed visible while ordinary Stop/Restart were allowed.",
    }, {
      label: "untracked runtime safety",
      result: "Untracked runtime untracked-llama:4401 stayed external-only with ordinary Stop/Restart disabled.",
    }],
    classifiedBlockers: [],
    productIssues: [],
  };
}

function restartRepairLiveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/restart-repair-latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "subagent-restart-repair-replay",
    sliceKind: "restart_repair",
    status: "passed",
    hypothesis: "A deterministic replay probe can rehydrate a broken child tree after restart.",
    expectedObservation: "The replay diagnostics report passes with restart repair issue kinds and repaired objects.",
    actualOutcome: "Passed: repaired runs run-active and barriers barrier-required, rehydrated 1 mailbox state and 1 artifact pointer.",
    confidenceDelta: "increased",
    followUp: "Keep the restart repair artifact with the slice evidence.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw restart repair replay diagnostics produce repaired runs and barriers.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "custom",
      providerId: "replay-diagnostics",
      usingGmiOverride: false,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: [
      "restart_rehydration",
      "runtime_event_replay",
      "parent_mailbox_replay",
      "mailbox_state_rehydration",
      "artifact_pointer_rehydration",
      "child_thread_repair",
      "wait_barrier_repair",
      "restart_edge",
      "stop_edge",
      "detach_edge",
      "cancel_edge",
      "retry_edge",
      "timeout_edge",
      "partial_result_edge",
      "synthesis_safety",
    ],
    maturityAssertions: [{
      id: "restart_repair_runtime_event_replay",
      label: "Restart runtime event replay",
      status: "passed",
      artifactPath: "test-results/subagent-replay-diagnostics/latest.json",
      capabilities: ["runtime_event_replay"],
      evidence: [
        "runtimeEvents: 3",
        "persistedRunEvents: 4",
        "runtimeTimelineRows: 1",
        "persistedTimelineRows: 1",
      ],
    }, {
      id: "restart_repair_child_tree_repair",
      label: "Restart child tree and wait barrier repair",
      status: "passed",
      artifactPath: "test-results/subagent-replay-diagnostics/latest.json",
      capabilities: ["restart_rehydration", "child_thread_repair", "wait_barrier_repair"],
      evidence: [
        "repairedRunIds: run-active",
        "repairedBarrierIds: barrier-required",
        "repairableSpawnEdgeRunIds: run-terminal",
        "diagnosticRunIds: run-terminal",
        "childThreads: 1",
      ],
    }, {
      id: "restart_repair_mailbox_rehydration",
      label: "Restart parent mailbox rehydration",
      status: "passed",
      artifactPath: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json",
      capabilities: ["parent_mailbox_replay", "mailbox_state_rehydration"],
      evidence: [
        "parentMailboxEventIds: parent-mailbox-grouped-completion",
        "parentMailboxStates: 1",
        "parentMailboxChildRefsResolved: true",
      ],
    }, {
      id: "restart_repair_artifact_pointer_rehydration",
      label: "Restart artifact pointer rehydration",
      status: "passed",
      artifactPath: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json",
      capabilities: ["artifact_pointer_rehydration"],
      evidence: [
        "resultArtifactPointers: 1",
        "missingResultArtifactRunIds: run-terminal",
        "allResultPointersHaveRunAndThread: true",
        "missingResultArtifactsDiagnosed: true",
        "transcriptChildRefsResolved: true",
      ],
    }, {
      id: "restart_repair_lifecycle_edge_coverage",
      label: "Restart repair lifecycle edge coverage",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["restart_edge", "stop_edge", "detach_edge", "cancel_edge", "retry_edge", "timeout_edge", "partial_result_edge"],
      evidence: [
        "coveredEdgeKinds: restart, stop, detach, cancel, retry, timeout, partial_result",
        "missingEdgeKinds: none",
      ],
    }, {
      id: "restart_repair_synthesis_safety",
      label: "Restart repair synthesis safety",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["synthesis_safety"],
      evidence: [
        "unsafeEdgeIds: none",
        "safeEdgeRows: 7",
        "edgeRows: 7",
      ],
    }],
    probes: [{
      label: "sub-agent restart repair replay diagnostics",
      command: "pnpm run test:subagents:replay-diagnostics",
    }],
    artifacts: [{
      label: "restart repair replay diagnostics report",
      path: "test-results/subagent-replay-diagnostics/latest.json",
      kind: "json",
    }, {
      label: "restart repair fixture evidence",
      path: "test-results/subagent-replay-diagnostics/latest-fixture-evidence.json",
      kind: "json",
    }],
    observations: [{
      label: "restart repair replay diagnostics",
      result: "Observed 7 repair issue kinds with runtime and parent mailbox events.",
    }, {
      label: "restart rehydration proof",
      result: "Rehydrated 1 mailbox state row, 1 artifact pointer, and diagnosed missing result artifacts run-terminal.",
    }],
    classifiedBlockers: [],
    productIssues: [],
  };
}

function lifecycleEdgeLiveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/lifecycle-edges-latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "subagent-lifecycle-edge-proof",
    sliceKind: "lifecycle_edges",
    status: "passed",
    hypothesis: "A deterministic lifecycle-edge proof can represent restart, stop, detach, cancel, retry, timeout, and partial-result behavior.",
    expectedObservation: "The lifecycle-edge report covers all seven planned edge kinds with no unsafe edge summaries.",
    actualOutcome: "Passed: covered lifecycle edges restart, stop, detach, cancel, retry, timeout, partial_result.",
    confidenceDelta: "increased",
    followUp: "Keep the lifecycle edge artifact with the slice evidence.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw lifecycle edge proof produce complete synthesis-safety evidence.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "custom",
      providerId: "lifecycle-edge-proof",
      usingGmiOverride: false,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: [
      "restart_edge",
      "stop_edge",
      "detach_edge",
      "cancel_edge",
      "retry_edge",
      "timeout_edge",
      "partial_result_edge",
      "synthesis_safety",
    ],
    maturityAssertions: [{
      id: "lifecycle_edge_restart",
      label: "Lifecycle restart edge",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["restart_edge"],
      evidence: [
        "edgeId: edge-restart",
        "childRunIds: run-active",
        "restartRepairObserved: true",
      ],
    }, {
      id: "lifecycle_edge_stop",
      label: "Lifecycle stop edge",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["stop_edge"],
      evidence: [
        "edgeId: edge-child-stop",
        "childRunIds: run-stopped, run-sibling",
        "capacityReleased: true",
      ],
    }, {
      id: "lifecycle_edge_detach",
      label: "Lifecycle detach edge",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["detach_edge"],
      evidence: [
        "edgeId: edge-detach",
        "childRunIds: run-detached",
        "detachedChildrenExcludedFromSynthesis: true",
      ],
    }, {
      id: "lifecycle_edge_cancel",
      label: "Lifecycle cancel edge",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["cancel_edge"],
      evidence: [
        "edgeId: edge-parent-cancel",
        "childRunIds: run-cancel-a, run-cancel-b",
        "cancellationCascadeRecorded: true",
      ],
    }, {
      id: "lifecycle_edge_retry",
      label: "Lifecycle retry edge",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["retry_edge"],
      evidence: [
        "edgeId: edge-retry-child",
        "childRunIds: run-retry",
        "retryAcceptedRunIds: run-retry",
      ],
    }, {
      id: "lifecycle_edge_timeout",
      label: "Lifecycle timeout edge",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["timeout_edge"],
      evidence: [
        "edgeId: edge-timeout",
        "childRunIds: run-timeout",
        "noTimedOutChildSynthesis: true",
      ],
    }, {
      id: "lifecycle_edge_partial_result",
      label: "Lifecycle partial result edge",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["partial_result_edge"],
      evidence: [
        "edgeId: edge-partial-result",
        "childRunIds: run-complete, run-failed",
        "failedChildNotSynthesized: true",
      ],
    }, {
      id: "lifecycle_edge_synthesis_safety",
      label: "Lifecycle synthesis safety",
      status: "passed",
      artifactPath: "test-results/subagent-lifecycle-edges/latest.json",
      capabilities: ["synthesis_safety"],
      evidence: [
        "unsafeEdgeIds: none",
        "safeEdgeRows: 7",
        "edgeRows: 7",
      ],
    }],
    probes: [{
      label: "sub-agent lifecycle edge proof",
      command: "pnpm run test:subagents:lifecycle-edges:proof",
    }],
    artifacts: [{
      label: "lifecycle edge proof report",
      path: "test-results/subagent-lifecycle-edges/latest.json",
      kind: "json",
    }],
    observations: [{
      label: "lifecycle edge proof artifact",
      result: "Covered restart, stop, detach, cancel, retry, timeout, partial_result with no unsafe edges.",
    }],
    classifiedBlockers: [],
    productIssues: [],
  };
}

function desktopDogfoodLiveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/desktop-dogfood-latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "desktop-dogfood-live-confidence",
    sliceKind: "desktop_dogfood",
    status: "passed",
    hypothesis: "The full Ambient Desktop Electron dogfood can prove sub-agent UI, workflow, runtime, lifecycle, and operator behavior in the real app shell.",
    expectedObservation: "The Desktop dogfood artifact passes, covers all planned scenarios, and records screenshot/accessibility evidence.",
    actualOutcome: "Passed: passed 16 scenario(s) with visual and maturity evidence.",
    confidenceDelta: "increased",
    followUp: "Keep the Desktop confidence artifact with the slice evidence.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw full Ambient Desktop sub-agent dogfood produce Desktop dogfood live confidence proof.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "gmi-cloud",
      providerId: "gmi-cloud",
      usingGmiOverride: true,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: [
      "electron_desktop_dogfood",
      "production_ui_visibility",
      "default_collapsed_state",
      "approval_parent_blocking",
      "approval_forwarding_behavior",
      "parent_blocking_workflow",
      "workflow_execution_parent_blocking",
      "mutating_worker_dogfood_behavior",
      "workflow_high_load_dogfood",
      "denied_scope_explanation_behavior",
      "restart_rehydration_behavior",
      "workflow_artifact_rehydration_behavior",
      "local_runtime_lease_ownership",
      "lease_stop_blocker",
      "untracked_runtime_safety",
      "operator_child_controls",
      "operator_control_behavior",
      "lifecycle_edge_desktop_behavior",
      "timeout_edge",
      "partial_result_edge",
      "retry_edge",
      "detach_edge",
      "layout_safety",
      "visual_layout_safety",
      "multi_parent_cluster_stress",
    ],
    maturityAssertions: [{
      id: "desktop_dogfood_scenario_coverage",
      label: "Desktop dogfood scenario coverage",
      status: "passed",
      artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
      capabilities: [
        "electron_desktop_dogfood",
        "default_collapsed_state",
        "approval_parent_blocking",
        "workflow_execution_parent_blocking",
        "workflow_high_load_dogfood",
      ],
      evidence: [
        "scenarios: 16",
        "parentThreadId: desktop-dogfood-parent-thread",
        "workflowHighLoadRows: 6",
      ],
    }, {
      id: "desktop_dogfood_visual_layout",
      label: "Desktop visual layout safety",
      status: "passed",
      artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
      capabilities: ["production_ui_visibility", "layout_safety", "visual_layout_safety"],
      evidence: [
        "visualAssertionsPassed: 11",
        "collapsedHorizontalOverflowFree: true",
        "expandedHorizontalOverflowFree: true",
        "narrowCriticalOverlapCount: 0",
      ],
    }, {
      id: "desktop_dogfood_lifecycle_edges",
      label: "Desktop lifecycle edge visibility",
      status: "passed",
      artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
      capabilities: ["lifecycle_edge_desktop_behavior", "timeout_edge", "partial_result_edge", "retry_edge", "detach_edge"],
      evidence: [
        "lifecycleParentMessageId: desktop-dogfood-lifecycle-parent-message",
        "timeoutEdgeVisible: true",
        "partialResultVisible: true",
        "retryEdgeVisible: true",
        "detachedChildVisible: true",
      ],
    }, {
      id: "desktop_dogfood_runtime_and_operator_controls",
      label: "Desktop runtime ownership and operator controls",
      status: "passed",
      artifactPath: "test-results/subagent-desktop-dogfood/latest.json",
      capabilities: [
        "local_runtime_lease_ownership",
        "lease_stop_blocker",
        "untracked_runtime_safety",
        "operator_child_controls",
        "operator_control_behavior",
      ],
      evidence: [
        "localRuntimeLeaseId: desktop-dogfood-local-runtime-lease",
        "stopDisabledVisible: true",
        "completedChildClosed: true",
        "attentionChildCancelled: true",
      ],
    }],
    probes: [{
      label: "Electron/CDP Desktop sub-agent dogfood",
      command: "pnpm run test:subagents:desktop-dogfood",
    }],
    artifacts: [{
      label: "Desktop dogfood live confidence proof",
      path: "test-results/subagent-desktop-dogfood/latest.json",
      kind: "json",
    }, {
      label: "collapsed Desktop screenshot",
      path: "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
      kind: "screenshot",
    }],
    observations: [{
      label: "Desktop dogfood artifact",
      result: "Passed 16 scenarios with visual, runtime, workflow, and lifecycle evidence.",
    }],
    classifiedBlockers: [],
    productIssues: [],
  };
}
