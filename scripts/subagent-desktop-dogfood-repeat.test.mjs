import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS,
  SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_SCHEMA_VERSION,
  buildSubagentDesktopDogfoodRepeatReport,
  buildSubagentDesktopDogfoodRepeatPlan,
  parseSubagentDesktopDogfoodRepeatArgs,
  renderSubagentDesktopDogfoodRepeatReportMarkdown,
  summarizeSubagentDesktopDogfoodRepeatRuns,
} from "./subagent-desktop-dogfood-repeat-lib.mjs";

describe("sub-agent Desktop dogfood repeat runner", () => {
  it("defaults to the graduation run count and final history thresholds", () => {
    const options = parseSubagentDesktopDogfoodRepeatArgs([], {});
    const plan = buildSubagentDesktopDogfoodRepeatPlan(options);

    expect(options.runs).toBe(DEFAULT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_RUNS);
    expect(options.reportPath).toBeUndefined();
    expect(plan).toMatchObject({
      runs: 25,
      minReadyRuns: 25,
      stopAfterFailures: 1,
      requireReady: false,
      dogfoodCommand: ["node", "scripts/run-electron-dogfood.mjs", "--scenario=subagent-desktop-dogfood", "--"],
      historyReportCommand: [
        "node",
        "scripts/subagent-desktop-dogfood-history-report.mjs",
        "--min-desktop-dogfood-runs=25",
        "--min-workflow-high-load-ready-runs=25",
      ],
    });
  });

  it("accepts an explicit repeat closeout report path", () => {
    expect(parseSubagentDesktopDogfoodRepeatArgs([
      "--out=test-results/subagent-desktop-dogfood-repeat/custom.json",
    ], {})).toMatchObject({
      reportPath: "test-results/subagent-desktop-dogfood-repeat/custom.json",
    });

    expect(parseSubagentDesktopDogfoodRepeatArgs([], {
      AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_OUT: "test-results/repeat/env.json",
    })).toMatchObject({
      reportPath: "test-results/repeat/env.json",
    });
  });

  it("builds a strict graduation plan with pass-through dogfood arguments", () => {
    const options = parseSubagentDesktopDogfoodRepeatArgs([
      "--",
      "--runs=3",
      "--min-ready-runs=2",
      "--stop-after-failures=2",
      "--require-ready",
      "--",
      "--runInBand",
    ], {});
    const plan = buildSubagentDesktopDogfoodRepeatPlan(options);

    expect(plan).toMatchObject({
      runs: 3,
      minReadyRuns: 2,
      stopAfterFailures: 2,
      requireReady: true,
      dogfoodCommand: ["node", "scripts/run-electron-dogfood.mjs", "--scenario=subagent-desktop-dogfood", "--", "--runInBand"],
      historyReportCommand: [
        "node",
        "scripts/subagent-desktop-dogfood-history-report.mjs",
        "--min-desktop-dogfood-runs=2",
        "--min-workflow-high-load-ready-runs=2",
        "--require-ready",
      ],
    });
  });

  it("summarizes failed run indexes for repeat closeout", () => {
    expect(summarizeSubagentDesktopDogfoodRepeatRuns([
      { index: 1, exitCode: 0 },
      { index: 2, exitCode: 1 },
      { index: 3, exitCode: 0 },
    ])).toEqual({
      attemptedRunCount: 3,
      failedRunCount: 1,
      cleanRunCount: 2,
      failedRunIndexes: [2],
    });
  });

  it("builds an auditable repeat closeout report with failed run and history gate details", () => {
    const plan = buildSubagentDesktopDogfoodRepeatPlan({
      runs: 3,
      minReadyRuns: 3,
      stopAfterFailures: 1,
      requireReady: true,
    });
    const report = buildSubagentDesktopDogfoodRepeatReport({
      plan,
      startedAt: "2026-06-12T08:00:00.000Z",
      completedAt: "2026-06-12T08:06:00.000Z",
      generatedAt: "2026-06-12T08:06:00.000Z",
      historyReportExitCode: 1,
      historyReportPath: "test-results/subagent-desktop-dogfood-history-report/latest.json",
      historyReport: {
        status: "blocked",
        ready: false,
        blockedGateIds: ["workflow_high_load_repetition"],
        summary: {
          readyRunCount: 2,
          highLoadReadyRunCount: 1,
          failureRate: 1 / 3,
        },
      },
      runResults: [
        {
          index: 1,
          exitCode: 0,
          startedAt: "2026-06-12T08:00:00.000Z",
          completedAt: "2026-06-12T08:02:00.000Z",
          durationMs: 120000,
        },
        {
          index: 2,
          exitCode: 1,
          startedAt: "2026-06-12T08:02:00.000Z",
          completedAt: "2026-06-12T08:04:00.000Z",
          durationMs: 120000,
        },
      ],
    });

    expect(report).toMatchObject({
      schemaVersion: SUBAGENT_DESKTOP_DOGFOOD_REPEAT_REPORT_SCHEMA_VERSION,
      status: "failed",
      ready: false,
      summary: {
        attemptedRunCount: 2,
        failedRunCount: 1,
        cleanRunCount: 1,
        failedRunIndexes: [2],
        stoppedEarly: true,
        stopAfterFailuresReached: true,
      },
      historyReport: {
        path: "test-results/subagent-desktop-dogfood-history-report/latest.json",
        exitCode: 1,
        status: "blocked",
        ready: false,
        blockedGateIds: ["workflow_high_load_repetition"],
        readyRunCount: 2,
        highLoadReadyRunCount: 1,
      },
      blockingIssues: expect.arrayContaining([
        "Desktop dogfood repeat had 1 failed run(s): 2.",
        "Desktop dogfood history report exited with 1.",
        "Desktop dogfood history report is not ready; blocked gates: workflow_high_load_repetition.",
        "Desktop dogfood repeat was run with --require-ready, but graduation history is not ready.",
      ]),
    });

    const markdown = renderSubagentDesktopDogfoodRepeatReportMarkdown(report);
    expect(markdown).toContain("# Sub-Agent Desktop Dogfood Repeat Report");
    expect(markdown).toContain("Failed indexes: 2");
    expect(markdown).toContain("workflow_high_load_repetition");
    expect(markdown).toContain("| 2 | 1 | 120000 ms |");
  });

  it("marks the repeat closeout ready when every run and the history report pass", () => {
    const report = buildSubagentDesktopDogfoodRepeatReport({
      plan: buildSubagentDesktopDogfoodRepeatPlan({ runs: 2, minReadyRuns: 2 }),
      historyReportExitCode: 0,
      historyReportPath: "test-results/subagent-desktop-dogfood-history-report/latest.json",
      historyReport: {
        status: "ready_to_graduate",
        ready: true,
        blockedGateIds: [],
        summary: {
          readyRunCount: 2,
          highLoadReadyRunCount: 2,
          failureRate: 0,
        },
      },
      runResults: [
        { index: 1, exitCode: 0 },
        { index: 2, exitCode: 0 },
      ],
    });

    expect(report.status).toBe("passed");
    expect(report.ready).toBe(true);
    expect(report.blockingIssues).toEqual([]);
  });
});
