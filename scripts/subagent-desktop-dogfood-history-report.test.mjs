import { describe, expect, it } from "vitest";
import {
  buildSubagentDesktopDogfoodHistoryEntry,
  buildSubagentDesktopDogfoodHistoryReport,
  parseSubagentDesktopDogfoodHistoryJsonl,
  renderSubagentDesktopDogfoodHistoryReportMarkdown,
  subagentDesktopDogfoodHistoryReportPassed,
} from "./subagent-desktop-dogfood-history-report-lib.mjs";
import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
  REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS,
  REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";

describe("sub-agent Desktop dogfood history report", () => {
  it("parses JSONL rows and preserves invalid-row diagnostics", () => {
    const parsed = parseSubagentDesktopDogfoodHistoryJsonl([
      JSON.stringify(historyRow({ runId: "desktop-clean-1" })),
      "not-json",
      JSON.stringify(["not", "an", "object"]),
      "",
    ].join("\n"));

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].runId).toBe("desktop-clean-1");
    expect(parsed.invalidRows).toEqual([
      expect.objectContaining({ lineNumber: 2, preview: "not-json" }),
      expect.objectContaining({ lineNumber: 3, issue: "Row must be a JSON object." }),
    ]);
  });

  it("builds compact history entries from full Desktop dogfood artifacts", () => {
    const entry = buildSubagentDesktopDogfoodHistoryEntry(desktopArtifact(), {
      reportPath: "test-results/subagent-desktop-dogfood/latest.json",
    });

    expect(entry).toMatchObject({
      schemaVersion: "ambient-subagent-desktop-dogfood-history-v1",
      runId: "2026-06-12T07-00-00.000Z",
      reportPath: "test-results/subagent-desktop-dogfood/latest.json",
      status: "passed",
      classification: "passed",
      ready: true,
      startedAt: "2026-06-12T06:59:00.000Z",
      completedAt: "2026-06-12T07:00:00.000Z",
      durationMs: 60000,
      gitCommit: "581cc400",
      gitBranch: "codex/desktop-dogfood-run-metadata-20260613",
      provider: "gmi-cloud",
      featureFlag: "ambient.subagents",
      scenarioCount: REQUIRED_DESKTOP_DOGFOOD_SCENARIOS.length,
      requiredScenarioMissing: [],
      screenshotCount: 2,
      criticalOverlapCount: 0,
      horizontalOverflowFree: true,
      workflowHighLoadPatternCount: 6,
      blockingIssueCount: 0,
    });
    expect(entry.visualAssertionSummary).toMatchObject({
      requiredCount: REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length,
      passedCount: REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length,
    });
    expect(entry.maturityAssertionSummary).toMatchObject({
      requiredCount: REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length,
      passedCount: REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length,
    });
  });

  it("marks repeated ready Desktop dogfood rows ready for graduation accounting", () => {
    const report = buildSubagentDesktopDogfoodHistoryReport({
      generatedAt: "2026-06-12T08:00:00.000Z",
      historyPath: "test-results/subagent-desktop-dogfood/history.jsonl",
      entries: [
        historyRow({ runId: "desktop-clean-1", generatedAt: "2026-06-12T07:00:00.000Z" }),
        historyRow({ runId: "desktop-clean-2", generatedAt: "2026-06-12T07:05:00.000Z" }),
      ],
      criteria: {
        minDesktopDogfoodRuns: 2,
        maxDesktopDogfoodFailureRate: 0.05,
        minWorkflowHighLoadReadyRuns: 2,
      },
    });

    expect(subagentDesktopDogfoodHistoryReportPassed(report)).toBe(true);
    expect(report).toMatchObject({
      schemaVersion: "ambient-subagent-desktop-dogfood-history-report-v1",
      status: "ready_to_graduate",
      ready: true,
      blockedGateIds: [],
      summary: {
        totalRunCount: 2,
        readyRunCount: 2,
        failedRunCount: 0,
        visualFailureRunCount: 0,
        maturityFailureRunCount: 0,
        highLoadReadyRunCount: 2,
        failureRate: 0,
        latestGeneratedAt: "2026-06-12T07:05:00.000Z",
      },
    });
    expect(report.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "desktop_dogfood_count", status: "passed", actual: "2 ready recorded." }),
      expect.objectContaining({ id: "desktop_dogfood_failure_rate", status: "passed", actual: "0/2 failed (0.0%)." }),
      expect.objectContaining({ id: "workflow_high_load_repetition", status: "passed" }),
    ]));
  });

  it("blocks sparse, failed, or incomplete visual and maturity evidence", () => {
    const report = buildSubagentDesktopDogfoodHistoryReport({
      historyFound: true,
      entries: [
        historyRow({ runId: "desktop-clean-1" }),
        historyRow({
          runId: "desktop-failed-1",
          status: "failed",
          classification: "failed",
          ready: false,
          blockingIssueCount: 2,
          visualAssertionSummary: assertionSummary({ passedCount: 10, failedIds: ["layout_safety"] }),
          maturityAssertionSummary: assertionSummary({ passedCount: 13, failedIds: ["desktop_visual_layout_safety"], requiredCount: 14 }),
          generatedAt: "2026-06-12T07:15:00.000Z",
        }),
      ],
      criteria: {
        minDesktopDogfoodRuns: 3,
        maxDesktopDogfoodFailureRate: 0.1,
        minWorkflowHighLoadReadyRuns: 3,
      },
    });

    expect(subagentDesktopDogfoodHistoryReportPassed(report)).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blockedGateIds).toEqual([
      "desktop_dogfood_count",
      "desktop_dogfood_failure_rate",
      "required_scenario_coverage",
      "workflow_high_load_repetition",
    ]);
    expect(report.summary).toMatchObject({
      readyRunCount: 1,
      failedRunCount: 1,
      visualFailureRunCount: 1,
      maturityFailureRunCount: 1,
      failureRate: 0.5,
    });
  });

  it("blocks when the history file is missing or malformed", () => {
    const report = buildSubagentDesktopDogfoodHistoryReport({
      historyFound: false,
      invalidRows: [{ lineNumber: 1, issue: "bad row", preview: "oops" }],
      entries: [historyRow({ runId: "desktop-clean-1" })],
      criteria: {
        minDesktopDogfoodRuns: 1,
        maxDesktopDogfoodFailureRate: 0.05,
        minWorkflowHighLoadReadyRuns: 1,
      },
    });

    expect(report.blockedGateIds).toEqual(["history_available", "history_parse"]);
    expect(report.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "history_available", status: "blocked", actual: "Missing." }),
      expect.objectContaining({ id: "history_parse", status: "blocked", actual: "1 invalid rows." }),
    ]));
  });

  it("renders Markdown with gate, coverage, and latest-run detail", () => {
    const report = buildSubagentDesktopDogfoodHistoryReport({
      generatedAt: "2026-06-12T08:00:00.000Z",
      historyPath: "test-results/subagent-desktop-dogfood/history.jsonl",
      entries: [historyRow({ runId: "desktop-clean-1" })],
      criteria: {
        minDesktopDogfoodRuns: 1,
        maxDesktopDogfoodFailureRate: 0.05,
        minWorkflowHighLoadReadyRuns: 1,
      },
    });

    const markdown = renderSubagentDesktopDogfoodHistoryReportMarkdown(report);
    expect(markdown).toContain("# Sub-Agent Desktop Dogfood History Report");
    expect(markdown).toContain("Ready rows: 1");
    expect(markdown).toContain("| Desktop dogfood volume | passed |");
    expect(markdown).toContain("| workflow_high_load_dogfood | 1 | 1 |");
    expect(markdown).toContain(`| 2026-06-12T07:00:00.000Z | desktop-clean-1 | passed | yes | ${REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length}/${REQUIRED_DESKTOP_VISUAL_ASSERTIONS.length} passed | ${REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length}/${REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.length} passed | complete |`);
  });
});

function desktopArtifact(overrides = {}) {
  return {
    schemaVersion: "ambient-subagent-desktop-dogfood-v1",
    status: "passed",
    classification: "passed",
    generatedAt: "2026-06-12T07:00:00.000Z",
    startedAt: "2026-06-12T06:59:00.000Z",
    completedAt: "2026-06-12T07:00:00.000Z",
    durationMs: 60_000,
    gitCommit: "581cc400",
    gitBranch: "codex/desktop-dogfood-run-metadata-20260613",
    provider: "gmi-cloud",
    featureFlag: "ambient.subagents",
    parentThreadId: "parent-thread-1",
    childRunIds: ["child-run-1", "child-run-2"],
    childThreadIds: ["child-thread-1", "child-thread-2"],
    scenarios: [...REQUIRED_DESKTOP_DOGFOOD_SCENARIOS],
    workflowHighLoadPatternLabels: [
      "Symphony Map-Reduce",
      "Symphony Adversarial Debate",
      "Symphony Imitate and Verify",
      "Symphony Pipeline",
      "Symphony Ensemble",
      "Symphony Self-Healing Loop",
    ],
    artifacts: {
      collapsedDesktopScreenshot: "test-results/subagent-desktop-dogfood/collapsed-desktop.png",
      expandedNarrowScreenshot: "test-results/subagent-desktop-dogfood/expanded-narrow.png",
    },
    checks: {
      collapsed: { horizontalOverflowFree: true, criticalOverlapCount: 0 },
      expanded: { horizontalOverflowFree: true, criticalOverlapCount: 0 },
      narrow: { horizontalOverflowFree: true, criticalOverlapCount: 0 },
    },
    visualAssertions: Object.fromEntries(REQUIRED_DESKTOP_VISUAL_ASSERTIONS.map((id) => [id, assertion(id)])),
    maturityAssertions: Object.fromEntries(REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS.map((id) => [id, assertion(id, { capabilities: ["production_ui_visibility"] })])),
    ...overrides,
  };
}

function historyRow(overrides = {}) {
  const artifact = desktopArtifact({
    generatedAt: "2026-06-12T07:00:00.000Z",
    ...overrides,
  });
  return {
    ...buildSubagentDesktopDogfoodHistoryEntry(artifact, {
      runId: overrides.runId ?? "desktop-clean-1",
      reportPath: "test-results/subagent-desktop-dogfood/latest.json",
    }),
    ...overrides,
  };
}

function assertion(id, overrides = {}) {
  return {
    id,
    status: "passed",
    evidence: [`passed: ${id}`],
    artifactRefs: ["test-results/subagent-desktop-dogfood/collapsed-desktop.png"],
    ...overrides,
  };
}

function assertionSummary(overrides = {}) {
  return {
    requiredCount: 11,
    passedCount: 11,
    failedCount: 0,
    missingCount: 0,
    failedIds: [],
    missingIds: [],
    statuses: {},
    ...overrides,
    failedCount: overrides.failedIds?.length ?? overrides.failedCount ?? 0,
    missingCount: overrides.missingIds?.length ?? overrides.missingCount ?? 0,
  };
}
