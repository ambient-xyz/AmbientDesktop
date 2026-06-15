import { describe, expect, it } from "vitest";
import {
  buildSubagentLiveHistoryReport,
  parseSubagentLiveHistoryJsonl,
  renderSubagentLiveHistoryReportMarkdown,
  subagentLiveHistoryReportPassed,
} from "./subagent-live-history-report-lib.mjs";

describe("sub-agent live history report", () => {
  it("parses JSONL history rows and reports invalid rows without dropping valid evidence", () => {
    const parsed = parseSubagentLiveHistoryJsonl([
      JSON.stringify(historyRow({ runId: "clean-1" })),
      "not-json",
      JSON.stringify(["not", "an", "object"]),
      "",
    ].join("\n"));

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].runId).toBe("clean-1");
    expect(parsed.invalidRows).toEqual([
      expect.objectContaining({ lineNumber: 2, preview: "not-json" }),
      expect.objectContaining({ lineNumber: 3, issue: "Row must be a JSON object." }),
    ]);
  });

  it("marks repeated clean required-live history ready for graduation accounting", () => {
    const report = buildSubagentLiveHistoryReport({
      generatedAt: "2026-06-12T08:00:00.000Z",
      historyPath: "test-results/subagent-release-gate/live-history.jsonl",
      entries: [
        historyRow({ runId: "clean-1", completedAt: "2026-06-12T07:00:00.000Z" }),
        historyRow({ runId: "clean-2", completedAt: "2026-06-12T07:05:00.000Z" }),
        historyRow({ runId: "deterministic", liveRequired: false, completedAt: "2026-06-12T07:10:00.000Z" }),
      ],
      criteria: { minLiveDogfoodRuns: 2, maxLiveDogfoodFailureRate: 0.05 },
    });

    expect(subagentLiveHistoryReportPassed(report)).toBe(true);
    expect(report).toMatchObject({
      schemaVersion: "ambient-subagent-live-history-report-v1",
      status: "ready_to_graduate",
      ready: true,
      blockedGateIds: [],
      summary: {
        totalRunCount: 3,
        requiredRunCount: 2,
        cleanRequiredRunCount: 2,
        failedRequiredRunCount: 0,
        advisoryRequiredRunCount: 0,
        skippedEvidenceRunCount: 0,
        livePiSmokePassed: true,
        failureRate: 0,
        latestCompletedAt: "2026-06-12T07:05:00.000Z",
      },
    });
    expect(report.summary.evidenceLanes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Child authority confidence",
        presentRunCount: 2,
        skippedRunCount: 0,
        latestStatus: "present",
        latestCompletedAt: "2026-06-12T07:05:00.000Z",
      }),
      expect.objectContaining({
        label: "Broader Workflow/Symphony confidence",
        presentRunCount: 2,
        skippedRunCount: 0,
        latestStatus: "present",
        latestCompletedAt: "2026-06-12T07:05:00.000Z",
      }),
      expect.objectContaining({
        label: "Desktop dogfood confidence",
        presentRunCount: 2,
        skippedRunCount: 0,
        latestStatus: "present",
        latestCompletedAt: "2026-06-12T07:05:00.000Z",
      }),
      expect.objectContaining({
        label: "Desktop dogfood",
        presentRunCount: 2,
        skippedRunCount: 0,
      }),
    ]));
    expect(report.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "live_dogfood_count", status: "passed", actual: "2 clean recorded." }),
      expect.objectContaining({ id: "live_dogfood_failure_rate", status: "passed", actual: "0/2 failed (0.0%)." }),
      expect.objectContaining({ id: "live_smoke", status: "passed" }),
    ]));
  });

  it("blocks graduation accounting for sparse, failed, or skipped-evidence history", () => {
    const report = buildSubagentLiveHistoryReport({
      historyFound: true,
      entries: [
        historyRow({ runId: "clean-1" }),
        historyRow({
          runId: "failed-1",
          status: "attention",
          ready: false,
          blockingIssueCount: 1,
          completedAt: "2026-06-12T07:15:00.000Z",
        }),
        historyRow({
          runId: "skipped-1",
          liveEvidence: { "Ambient/Pi smoke": "present" },
          skippedLiveEvidence: ["Desktop dogfood"],
          completedAt: "2026-06-12T07:20:00.000Z",
        }),
      ],
      criteria: { minLiveDogfoodRuns: 3, maxLiveDogfoodFailureRate: 0.1 },
    });

    expect(subagentLiveHistoryReportPassed(report)).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blockedGateIds).toEqual(["live_dogfood_count", "live_dogfood_failure_rate"]);
    expect(report.summary).toMatchObject({
      requiredRunCount: 3,
      cleanRequiredRunCount: 1,
      failedRequiredRunCount: 2,
      skippedEvidenceRunCount: 1,
      failureRate: 2 / 3,
    });
    expect(report.summary.evidenceLanes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Child authority confidence",
        presentRunCount: 2,
        skippedRunCount: 1,
      }),
      expect.objectContaining({
        label: "Broader Workflow/Symphony confidence",
        presentRunCount: 2,
        skippedRunCount: 1,
      }),
      expect.objectContaining({
        label: "Desktop dogfood confidence",
        presentRunCount: 2,
        skippedRunCount: 1,
      }),
      expect.objectContaining({
        label: "Desktop dogfood",
        presentRunCount: 2,
        skippedRunCount: 1,
        latestStatus: "skipped",
      }),
    ]));
  });

  it("treats missing newly required live evidence lanes as skipped", () => {
    const report = buildSubagentLiveHistoryReport({
      entries: [
        historyRow({
          runId: "legacy-row",
          liveEvidence: {
            "Ambient/Pi smoke": "present",
            "Sub-agent confidence": "present",
            "Workflow/Symphony confidence": "present",
            "Local runtime confidence": "present",
            "Restart repair confidence": "present",
            "Lifecycle edge confidence": "present",
            "Desktop dogfood": "present",
          },
          skippedLiveEvidence: [],
        }),
      ],
      criteria: { minLiveDogfoodRuns: 1, maxLiveDogfoodFailureRate: 0.05 },
    });

    expect(report.ready).toBe(false);
    expect(report.summary).toMatchObject({
      cleanRequiredRunCount: 0,
      failedRequiredRunCount: 1,
      skippedEvidenceRunCount: 1,
    });
    expect(report.latestRequiredRuns[0]).toMatchObject({
      runId: "legacy-row",
      skippedEvidenceLabels: ["Child authority confidence", "Broader Workflow/Symphony confidence", "Desktop dogfood confidence"],
    });
  });

  it("blocks when the history file is missing or malformed", () => {
    const report = buildSubagentLiveHistoryReport({
      historyFound: false,
      invalidRows: [{ lineNumber: 1, issue: "bad row", preview: "oops" }],
      entries: [historyRow({ runId: "clean-1" })],
      criteria: { minLiveDogfoodRuns: 1, maxLiveDogfoodFailureRate: 0.05 },
    });

    expect(report.blockedGateIds).toEqual(["history_available", "history_parse"]);
    expect(report.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "history_available", status: "blocked", actual: "Missing." }),
      expect.objectContaining({ id: "history_parse", status: "blocked", actual: "1 invalid rows." }),
    ]));
  });

  it("renders a Markdown report with gate and latest-run details", () => {
    const report = buildSubagentLiveHistoryReport({
      generatedAt: "2026-06-12T08:00:00.000Z",
      historyPath: "test-results/subagent-release-gate/live-history.jsonl",
      entries: [historyRow({ runId: "clean-1" })],
      criteria: { minLiveDogfoodRuns: 1, maxLiveDogfoodFailureRate: 0.05 },
    });

    expect(renderSubagentLiveHistoryReportMarkdown(report)).toContain("# Sub-Agent Live History Report");
    expect(renderSubagentLiveHistoryReportMarkdown(report)).toContain("Clean required-live rows: 1");
    expect(renderSubagentLiveHistoryReportMarkdown(report)).toContain("| Live dogfood volume | passed |");
    expect(renderSubagentLiveHistoryReportMarkdown(report)).toContain("| Child authority confidence | 1 | 0 | present | 2026-06-12T07:00:00.000Z |");
    expect(renderSubagentLiveHistoryReportMarkdown(report)).toContain("| Broader Workflow/Symphony confidence | 1 | 0 | present | 2026-06-12T07:00:00.000Z |");
    expect(renderSubagentLiveHistoryReportMarkdown(report)).toContain("| Desktop dogfood confidence | 1 | 0 | present | 2026-06-12T07:00:00.000Z |");
    expect(renderSubagentLiveHistoryReportMarkdown(report)).toContain("| 2026-06-12T07:00:00.000Z | clean-1 | passed | yes | none |");
  });
});

function historyRow(overrides = {}) {
  return {
    schemaVersion: "ambient-subagent-release-gate-live-history-v1",
    runId: "clean-1",
    reportPath: "test-results/subagent-release-gate/latest.json",
    status: "passed",
    ready: true,
    liveRequired: true,
    startedAt: "2026-06-12T06:50:00.000Z",
    completedAt: "2026-06-12T07:00:00.000Z",
    durationMs: 600_000,
    checkCounts: { passed: 113 },
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
    nextSlice: "continue",
    ...overrides,
  };
}
