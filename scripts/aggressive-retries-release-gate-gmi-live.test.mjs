import { describe, expect, it } from "vitest";
import {
  aggressiveRetriesGmiReleaseGatePassed,
  buildAggressiveRetriesPressureHistoryEntry,
  buildAggressiveRetriesGmiReleaseGateReport,
} from "./aggressive-retries-release-gate-gmi-live-lib.mjs";

describe("aggressive retries GMI release gate", () => {
  it("passes when runtime-toggle and strict direct-helper retry evidence are both present", () => {
    const report = buildAggressiveRetriesGmiReleaseGateReport(passingInput());

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(true);
    expect(report).toMatchObject({
      status: "passed",
      runtimeToggle: {
        status: "passed",
        providerId: "gmi-cloud",
        baselineTokenSeen: true,
        toggledTokenSeen: true,
        runtimeSettingsActivity: {
          status: "applied",
          aggressiveRetries: true,
          disposedSession: true,
        },
      },
      directHelperRetry: {
        status: "passed",
        gateStatus: "passed",
        required: true,
        directHelperRetryObserved: true,
        scenarioCount: 3,
        sourceClassificationComplete: true,
        charterSummaryComplete: true,
        proofJudgmentComplete: true,
      },
      releaseDecision: {
        ready: true,
        blockingIssues: [],
        triagePath: "/tmp/aggressive-retries-release-gate-gmi/latest-triage.json",
        failureTriage: {
          status: "clear",
          failureClass: "none",
          summary: "Aggregate aggressive-retries GMI release gate is green.",
        },
        diagnosticArtifacts: [
          expect.objectContaining({
            lane: "runtimeToggle",
            stdoutPath: "/tmp/aggressive-retries-release-gate-gmi/logs/runtime-toggle.stdout.log",
            stderrPath: "/tmp/aggressive-retries-release-gate-gmi/logs/runtime-toggle.stderr.log",
          }),
          expect.objectContaining({
            lane: "directHelperRetry",
            stdoutPath: "/tmp/aggressive-retries-release-gate-gmi/logs/direct-helper-retry.stdout.log",
            stderrPath: "/tmp/aggressive-retries-release-gate-gmi/logs/direct-helper-retry.stderr.log",
          }),
        ],
      },
    });
  });

  it("surfaces green direct-helper retry pressure without failing the release gate", () => {
    const input = passingInput();
    input.directHelperRetry.report.directHelperRetry.sourceClassification.forwardedChatCompletionCount = 8;
    input.directHelperRetry.report.directHelperRetry.sourceClassification.chatCompletionCount = 9;

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(true);
    expect(report.status).toBe("passed");
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues).toEqual([
      expect.stringContaining("source-classification scenario recovered only after 8 forwarded GMI chat-completion request"),
    ]);
    expect(report.releaseDecision.stabilitySignals).toMatchObject({
      status: "pressure",
      recoveryPressureThreshold: 5,
      pressureScenarioCount: 1,
      directHelperRetryScenarios: [
        expect.objectContaining({
          scenario: "source-classification",
          forwardedChatCompletionCount: 8,
          pressure: true,
        }),
        expect.objectContaining({
          scenario: "charter-summary",
          forwardedChatCompletionCount: 3,
          pressure: false,
        }),
        expect.objectContaining({
          scenario: "proof-judgment",
          forwardedChatCompletionCount: 1,
          pressure: false,
        }),
      ],
    });
    expect(report.releaseDecision.failureTriage).toMatchObject({
      status: "clear",
      failureClass: "none",
      stabilityStatus: "pressure",
      summary: "Aggregate aggressive-retries GMI release gate is green with retry pressure in 1 direct-helper scenario(s).",
      evidence: {
        advisoryIssues: [
          expect.stringContaining("source-classification scenario recovered only after 8 forwarded GMI chat-completion request"),
        ],
        stabilitySignals: {
          status: "pressure",
          pressureScenarioCount: 1,
        },
      },
    });
  });

  it("can fail closed when configured to block on green-run retry pressure", () => {
    const input = passingInput();
    input.recoveryPressureThreshold = 7;
    input.failOnRetryPressure = true;
    input.directHelperRetry.report.directHelperRetry.sourceClassification.forwardedChatCompletionCount = 8;

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(false);
    expect(report.status).toBe("attention");
    expect(report.releaseDecision).toMatchObject({
      ready: false,
      failOnRetryPressure: true,
      recoveryPressureThreshold: 7,
      stabilitySignals: {
        status: "pressure",
        pressureScenarioCount: 1,
      },
    });
    expect(report.releaseDecision.blockingIssues).toEqual([
      expect.stringContaining("source-classification scenario recovered only after 8 forwarded GMI chat-completion request"),
    ]);
    expect(report.releaseDecision.failureTriage).toMatchObject({
      status: "attention",
      focusLane: "releaseDecision",
      failureClass: "recovery_pressure_threshold",
      stabilityStatus: "pressure",
      summary: "aggregate release decision needs attention: green lanes exceeded the configured forwarded-request pressure threshold.",
    });
  });

  it("detects repeated direct-helper retry pressure from prior aggregate history without failing by default", () => {
    const input = passingInput();
    input.directHelperRetry.report.directHelperRetry.sourceClassification.forwardedChatCompletionCount = 8;
    input.directHelperRetry.report.directHelperRetry.sourceClassification.chatCompletionCount = 9;
    input.pressureHistory = [
      pressureHistoryEntry({
        scenario: "source-classification",
        forwardedChatCompletionCount: 10,
        pressure: true,
      }),
    ];

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.pressureTrend).toMatchObject({
      status: "repeated_pressure",
      repeatedPressureThreshold: 2,
      historyRunCount: 1,
      repeatedPressureScenarioCount: 1,
      scenarioTrends: [
        expect.objectContaining({
          scenario: "source-classification",
          currentPressure: true,
          consecutivePressureRuns: 2,
          repeatedPressure: true,
          recentForwardedChatCompletionCounts: [8, 10],
        }),
        expect.objectContaining({
          scenario: "charter-summary",
          currentPressure: false,
          consecutivePressureRuns: 0,
          repeatedPressure: false,
        }),
        expect.objectContaining({
          scenario: "proof-judgment",
          currentPressure: false,
          consecutivePressureRuns: 0,
          repeatedPressure: false,
        }),
      ],
    });
    expect(report.releaseDecision.failureTriage).toMatchObject({
      status: "clear",
      failureClass: "none",
      stabilityStatus: "repeated_pressure",
      summary: "Aggregate aggressive-retries GMI release gate is green with repeated retry pressure in 1 direct-helper scenario(s).",
      nextAction: "Harden the repeated high-pressure direct-helper scenario(s) before broadening aggressive retry scope.",
    });
  });

  it("can fail closed on repeated direct-helper retry pressure", () => {
    const input = passingInput();
    input.failOnRepeatedPressure = true;
    input.directHelperRetry.report.directHelperRetry.proofJudgment.forwardedChatCompletionCount = 6;
    input.pressureHistory = [
      pressureHistoryEntry({
        scenario: "proof-judgment",
        forwardedChatCompletionCount: 5,
        pressure: true,
      }),
    ];

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(false);
    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual([
      "Project-board direct-helper retry proof-judgment scenario met retry-pressure threshold in 2 consecutive aggregate gate run(s).",
    ]);
    expect(report.releaseDecision.failureTriage).toMatchObject({
      status: "attention",
      focusLane: "releaseDecision",
      failureClass: "repeated_recovery_pressure",
      stabilityStatus: "repeated_pressure",
      summary: "aggregate release decision needs attention: green lanes repeatedly exceeded the forwarded-request pressure threshold.",
    });
  });

  it("builds compact pressure-history entries from aggregate reports", () => {
    const input = passingInput();
    input.directHelperRetry.report.directHelperRetry.sourceClassification.forwardedChatCompletionCount = 8;
    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(buildAggressiveRetriesPressureHistoryEntry(report)).toMatchObject({
      schemaVersion: 1,
      status: "passed",
      releaseReady: true,
      stabilityStatus: "pressure",
      recoveryPressureThreshold: 5,
      pressureScenarioCount: 1,
      directHelperRetryScenarios: [
        expect.objectContaining({
          scenario: "source-classification",
          pressure: true,
          forwardedChatCompletionCount: 8,
          retryAttempt: 1,
          maxRetries: 10,
          retryDelayMs: 1000,
        }),
        expect.objectContaining({
          scenario: "charter-summary",
          pressure: false,
        }),
        expect.objectContaining({
          scenario: "proof-judgment",
          pressure: false,
        }),
      ],
    });
  });

  it("fails closed when the runtime-toggle command exits nonzero", () => {
    const input = passingInput();
    input.runtimeToggle.exitCode = 1;

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(false);
    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Aggressive retries runtime-toggle GMI smoke exited with code 1.",
    );
  });

  it("requires the runtime-toggle report to prove idle Pi session disposal", () => {
    const input = passingInput();
    input.runtimeToggle.report.runtimeSettingsActivity.disposedSession = false;

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Aggressive retries runtime-toggle activity did not confirm the idle Pi session was disposed.",
    );
  });

  it("fails closed on lane timeout and preserves log tails for triage", () => {
    const input = passingInput();
    input.directHelperRetry.timedOut = true;
    input.directHelperRetry.timeoutMs = 42;
    input.directHelperRetry.stdoutTail = "latest stdout before timeout";
    input.directHelperRetry.stderrTail = "timeout stderr";

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(false);
    expect(report.directHelperRetry).toMatchObject({
      timedOut: true,
      timeoutMs: 42,
      stdoutTail: "latest stdout before timeout",
      stderrTail: "timeout stderr",
    });
    expect(report.releaseDecision.blockingIssues).toContain(
      "Project-board strict direct-helper retry GMI gate timed out after 42ms; see lane stdout/stderr artifacts for the last observed output.",
    );
    expect(report.releaseDecision.failureTriage).toMatchObject({
      status: "attention",
      focusLane: "directHelperRetry",
      failureClass: "lane_timeout",
      summary: "strict direct-helper retry GMI gate needs attention: lane timed out after 42ms.",
      evidence: {
        stdoutTail: "latest stdout before timeout",
        stderrTail: "timeout stderr",
      },
    });
    expect(report.releaseDecision.diagnosticArtifacts[1]).toMatchObject({
      lane: "directHelperRetry",
      timedOut: true,
      stdoutPath: "/tmp/aggressive-retries-release-gate-gmi/logs/direct-helper-retry.stdout.log",
      stderrPath: "/tmp/aggressive-retries-release-gate-gmi/logs/direct-helper-retry.stderr.log",
    });
  });

  it("requires all three direct-helper retry recovery scenarios", () => {
    const input = passingInput();
    input.directHelperRetry.report.directHelperRetry.proofJudgmentComplete = false;

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain(
      "Project-board direct-helper retry proof-judgment recovery was incomplete.",
    );
    expect(report.releaseDecision.failureTriage).toMatchObject({
      status: "attention",
      focusLane: "directHelperRetry",
      failureClass: "direct_helper_proof_judgment",
      nextAction: "Inspect proof-judgment operation detection, proof review parsing, and provider timeout budget.",
      evidence: {
        directHelperRetry: {
          proofJudgmentComplete: false,
        },
      },
    });
  });

  it("classifies proof-judgment live fallback failures ahead of generic Electron launch noise", () => {
    const input = passingInput();
    input.directHelperRetry.exitCode = 1;
    input.directHelperRetry.report = undefined;
    input.directHelperRetry.stderrTail = [
      "DevTools listening on ws://127.0.0.1:64266/devtools/browser/test",
      "Error: Expected live Ambient/Pi proof review after retry, got deterministic.",
    ].join("\n");

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(report.releaseDecision.failureTriage).toMatchObject({
      status: "attention",
      focusLane: "directHelperRetry",
      failureClass: "direct_helper_proof_judgment",
      summary: "strict direct-helper retry GMI gate needs attention: proof-judgment retry recovery completed with non-live proof-review evidence.",
      nextAction: "Inspect proof-judgment provider routing and deterministic fallback guards before changing source or charter retry paths.",
    });
  });

  it("promotes strict project-board gate blockers into the combined gate", () => {
    const input = passingInput();
    input.directHelperRetry.report.status = "attention";
    input.directHelperRetry.report.releaseDecision.blockingIssues = ["Project-board source retry evidence is stale."];

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(aggressiveRetriesGmiReleaseGatePassed(report)).toBe(false);
    expect(report.releaseDecision.blockingIssues).toContain("Project-board strict direct-helper retry gate status was attention.");
    expect(report.releaseDecision.blockingIssues).toContain(
      "Project-board strict direct-helper retry gate blocker: Project-board source retry evidence is stale.",
    );
  });

  it("classifies runtime-toggle session reset failures separately from direct-helper failures", () => {
    const input = passingInput();
    input.runtimeToggle.report.runtimeSettingsActivity.disposedSession = false;

    const report = buildAggressiveRetriesGmiReleaseGateReport(input);

    expect(report.releaseDecision.failureTriage).toMatchObject({
      status: "attention",
      focusLane: "runtimeToggle",
      failureClass: "runtime_session_reset_missing",
      nextAction: "Inspect runtime-settings activity emission and AgentRuntime session disposal semantics for idle Pi sessions.",
      evidence: {
        runtimeToggle: {
          runtimeSettingsActivity: {
            disposedSession: false,
          },
        },
      },
    });
  });
});

function passingInput() {
  return {
    startedAt: "2026-05-16T12:00:00.000Z",
    completedAt: "2026-05-16T12:10:00.000Z",
    outputRoot: "/tmp/aggressive-retries-release-gate-gmi",
    triagePath: "/tmp/aggressive-retries-release-gate-gmi/latest-triage.json",
    runtimeToggle: {
      command: "pnpm run test:aggressive-retries-gmi-live",
      exitCode: 0,
      signal: undefined,
      timedOut: false,
      timeoutMs: 600_000,
      durationMs: 120_000,
      reportPath: "/tmp/aggressive-retries-release-gate-gmi/runtime-toggle/latest.json",
      stdoutPath: "/tmp/aggressive-retries-release-gate-gmi/logs/runtime-toggle.stdout.log",
      stderrPath: "/tmp/aggressive-retries-release-gate-gmi/logs/runtime-toggle.stderr.log",
      stdoutBytes: 128,
      stderrBytes: 0,
      stdoutTail: "runtime-toggle passed",
      stderrTail: "",
      report: passingRuntimeToggleReport(),
    },
    directHelperRetry: {
      command: "pnpm run test:project-board-release-gate:direct-helper-retry-live",
      exitCode: 0,
      signal: undefined,
      timedOut: false,
      timeoutMs: 1_800_000,
      durationMs: 480_000,
      reportPath: "/tmp/aggressive-retries-release-gate-gmi/direct-helper/latest-phase8.json",
      stdoutPath: "/tmp/aggressive-retries-release-gate-gmi/logs/direct-helper-retry.stdout.log",
      stderrPath: "/tmp/aggressive-retries-release-gate-gmi/logs/direct-helper-retry.stderr.log",
      stdoutBytes: 256,
      stderrBytes: 0,
      stdoutTail: "direct-helper retry passed",
      stderrTail: "",
      report: passingDirectHelperRetryGateReport(),
    },
  };
}

function passingRuntimeToggleReport() {
  return {
    status: "passed",
    providerId: "gmi-cloud",
    providerLabel: "GMI Cloud",
    model: "zai-org/GLM-5.1-FP8",
    threadId: "thread-aggressive-retries",
    baselineTokenSeen: true,
    toggledTokenSeen: true,
    sessionFileBeforeToggleName: "session-before.json",
    sessionFileAfterToggleName: "session-after.json",
    runtimeSettingsActivity: {
      status: "applied",
      aggressiveRetries: true,
      disposedSession: true,
      deferredSession: false,
    },
  };
}

function passingDirectHelperRetryGateReport() {
  return {
    status: "passed",
    directHelperRetry: {
      status: "passed",
      required: true,
      observed: true,
      scenarioCount: 3,
      targets: ["source-classification", "charter-summary", "proof-judgment"],
      sourceClassificationComplete: true,
      charterSummaryComplete: true,
      proofJudgmentComplete: true,
      sourceClassification: {
        status: "passed",
        latestRunStatus: "succeeded",
        latestRunStage: "sources_persisted",
        failpointTriggered: true,
        failpointClosedByClient: true,
        chatCompletionCount: 3,
        forwardedChatCompletionCount: 2,
        retryEvent: passingAggregateDirectHelperRetryEvent("source_classification"),
      },
      charterSummary: {
        status: "passed",
        charterSummaryApplied: true,
        failpointTriggered: true,
        failpointClosedByClient: true,
        chatCompletionCount: 4,
        forwardedChatCompletionCount: 3,
        retryEvent: passingAggregateDirectHelperRetryEvent("charter_summary"),
      },
      proofJudgment: {
        status: "passed",
        proofJudgmentApplied: true,
        proofReviewReviewer: "ambient_pi",
        failpointTriggered: true,
        failpointClosedByClient: true,
        chatCompletionCount: 2,
        forwardedChatCompletionCount: 1,
        retryEvent: passingAggregateDirectHelperRetryEvent("card_run_progress"),
      },
    },
    releaseDecision: {
      ready: true,
      blockingIssues: [],
      advisoryIssues: [],
    },
  };
}

function passingAggregateDirectHelperRetryEvent(stage) {
  return {
    stage,
    transientRetry: true,
    aggressiveRetries: true,
    retryAttempt: 1,
    maxRetries: 10,
    retryDelayMs: 1000,
    error: "Ambient/Pi stream ended without model content.",
  };
}

function pressureHistoryEntry({ scenario, forwardedChatCompletionCount, pressure }) {
  return {
    schemaVersion: 1,
    runId: "previous-run",
    status: "passed",
    releaseReady: true,
    stabilityStatus: pressure ? "pressure" : "nominal",
    recoveryPressureThreshold: 5,
    pressureScenarioCount: pressure ? 1 : 0,
    directHelperRetryScenarios: [
      {
        scenario,
        status: "passed",
        pressure,
        forwardedChatCompletionCount,
        chatCompletionCount: forwardedChatCompletionCount + 1,
        retryAttempt: 1,
        maxRetries: 10,
        retryDelayMs: 1000,
      },
    ],
  };
}
