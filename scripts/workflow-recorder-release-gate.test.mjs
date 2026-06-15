import { describe, expect, it } from "vitest";
import {
  buildWorkflowRecorderReleaseGateReport,
  renderWorkflowRecorderReleaseGateMarkdown,
  workflowRecorderReleaseArtifactIntegrity,
  workflowRecorderReleaseGatePassed,
} from "./workflow-recorder-release-gate-lib.mjs";

describe("workflow recorder release gate", () => {
  it("passes a fresh deterministic recorder jitter report while warning that live rows were skipped", () => {
    const jitterReport = passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" });
    const report = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport,
      jitterArchiveReport: archiveFor(jitterReport),
      jitterReportPath: "/tmp/workflow-recorder-jitter/latest.json",
      currentGitHead: testGitHead(),
      currentTrackedStatusLines: [],
      outputPath: "/tmp/workflow-recorder-release-gate/latest.json",
      markdownPath: "/tmp/workflow-recorder-release-gate/latest.md",
      releaseArchivePath: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.json",
      releaseArchiveMarkdownPath: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.md",
      now: "2026-05-19T10:30:00.000Z",
    });

    expect(report.status).toBe("passed_with_live_skipped");
    expect(workflowRecorderReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.advisoryIssues).toContain("Live Workflow Recorder rows were skipped for this deterministic gate.");
    const markdown = renderWorkflowRecorderReleaseGateMarkdown(report);
    expect(markdown).toContain("Workflow Recorder Release Gate");
    expect(markdown).toContain("## Artifacts");
    expect(report.releaseDecision.diagnosticArtifacts).toEqual(
      expect.arrayContaining([
        { label: "jitter latest", path: "/tmp/workflow-recorder-jitter/latest.json" },
        { label: "jitter archive", path: "/tmp/workflow-recorder-jitter/runs/workflow-recorder-test.json" },
        { label: "release gate latest", path: "/tmp/workflow-recorder-release-gate/latest.json" },
        { label: "release gate markdown", path: "/tmp/workflow-recorder-release-gate/latest.md" },
        { label: "release gate archive", path: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.json" },
        {
          label: "release gate archive markdown",
          path: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.md",
        },
      ]),
    );
    expect(markdown).toContain("release gate archive markdown");
  });

  it("requires registered commands so the gate remains discoverable", () => {
    const jitterReport = passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" });
    const report = buildWorkflowRecorderReleaseGateReport({
      packageJson: { scripts: { "test:workflow-recorder-jitter": "node scripts/workflow-recorder-jitter.mjs" } },
      planHtml: planHtml(),
      jitterReport,
      jitterArchiveReport: archiveFor(jitterReport),
      now: "2026-05-19T10:01:00.000Z",
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "workflow recorder release gate command is registered.",
        "workflow recorder release gate unit tests command is registered.",
        "workflow recorder live GMI smoke gate command is registered.",
      ]),
    );
  });

  it("fails stale or incomplete deterministic recorder evidence", () => {
    const jitterReport = {
      ...passingJitterReport({ generatedAt: "2026-05-18T00:00:00.000Z" }),
      tasks: [
        { id: "recorder-release-native", tier: "deterministic", status: "passed" },
      ],
    };
    const report = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport,
      jitterArchiveReport: archiveFor(jitterReport),
      now: "2026-05-19T10:00:00.000Z",
      maxAgeMinutes: 60,
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("stale");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("recorder-ui-model");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("recorder-tool-metadata");
  });

  it("requires archived jitter evidence tied to the jitter run id", () => {
    const baseJitterReport = passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" });
    const missingArchive = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: {
        ...baseJitterReport,
        archivePath: undefined,
      },
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(missingArchive.status).toBe("attention");
    expect(missingArchive.releaseDecision.blockingIssues).toContain("Workflow Recorder jitter report is missing archivePath.");

    const mismatchedArchive = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: {
        ...baseJitterReport,
        archivePath: "/tmp/workflow-recorder-jitter/runs/not-this-run.json",
      },
      jitterArchiveReport: archiveFor(baseJitterReport),
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(mismatchedArchive.status).toBe("attention");
    expect(mismatchedArchive.releaseDecision.blockingIssues).toContain("Workflow Recorder jitter archivePath must include the jitter runId.");

    const unreadableArchive = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: baseJitterReport,
      jitterArchiveReadError: "ENOENT: no such file or directory",
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(unreadableArchive.status).toBe("attention");
    expect(unreadableArchive.releaseDecision.blockingIssues.join("\n")).toContain("archive could not be read");

    const tamperedArchive = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: baseJitterReport,
      jitterArchiveReport: {
        ...archiveFor(baseJitterReport),
        tasks: baseJitterReport.tasks.slice(0, -1),
      },
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(tamperedArchive.status).toBe("attention");
    expect(tamperedArchive.releaseDecision.blockingIssues).toContain(
      "Workflow Recorder jitter archive content must match the latest jitter report for the same run.",
    );
  });

  it("requires jitter evidence to match the current git revision when the release wrapper provides it", () => {
    const baseJitterReport = passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" });
    const missingSource = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: {
        ...baseJitterReport,
        source: undefined,
      },
      jitterArchiveReport: archiveFor({
        ...baseJitterReport,
        source: undefined,
      }),
      currentGitHead: testGitHead(),
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(missingSource.status).toBe("attention");
    expect(missingSource.releaseDecision.blockingIssues).toContain("Workflow Recorder jitter report is missing source.gitHead.");

    const mismatchedSource = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: baseJitterReport,
      jitterArchiveReport: archiveFor(baseJitterReport),
      currentGitHead: "ffffffffffffffffffffffffffffffffffffffff",
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(mismatchedSource.status).toBe("attention");
    expect(mismatchedSource.releaseDecision.blockingIssues.join("\n")).toContain("was generated for git");
  });

  it("requires clean tracked source evidence when the release wrapper provides tracked status", () => {
    const baseJitterReport = passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" });
    const missingTrackedStatus = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: {
        ...baseJitterReport,
        source: {
          gitHead: testGitHead(),
        },
      },
      jitterArchiveReport: archiveFor({
        ...baseJitterReport,
        source: {
          gitHead: testGitHead(),
        },
      }),
      currentTrackedStatusLines: [],
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(missingTrackedStatus.status).toBe("attention");
    expect(missingTrackedStatus.releaseDecision.blockingIssues).toContain(
      "Workflow Recorder jitter report is missing source.trackedStatusLines.",
    );

    const generatedDirty = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: {
        ...baseJitterReport,
        source: {
          gitHead: testGitHead(),
          trackedDirty: true,
          trackedStatusLines: [" M workflowRecorder.html"],
        },
      },
      jitterArchiveReport: archiveFor({
        ...baseJitterReport,
        source: {
          gitHead: testGitHead(),
          trackedDirty: true,
          trackedStatusLines: [" M workflowRecorder.html"],
        },
      }),
      currentTrackedStatusLines: [],
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(generatedDirty.status).toBe("attention");
    expect(generatedDirty.releaseDecision.blockingIssues.join("\n")).toContain("generated with tracked source changes");

    const currentDirty = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: baseJitterReport,
      jitterArchiveReport: archiveFor(baseJitterReport),
      currentTrackedStatusLines: [" M scripts/workflow-recorder-release-gate.mjs"],
      now: "2026-05-19T10:01:00.000Z",
    });
    expect(currentDirty.status).toBe("attention");
    expect(currentDirty.releaseDecision.blockingIssues.join("\n")).toContain("running with tracked source changes");
  });

  it("verifies release gate JSON and Markdown artifacts after writing", () => {
    const jitterReport = passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" });
    const report = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport,
      jitterArchiveReport: archiveFor(jitterReport),
      currentTrackedStatusLines: [],
      now: "2026-05-19T10:01:00.000Z",
      outputPath: "/tmp/workflow-recorder-release-gate/latest.json",
      markdownPath: "/tmp/workflow-recorder-release-gate/latest.md",
      releaseArchivePath: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.json",
      releaseArchiveMarkdownPath: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.md",
    });
    const paths = {
      outputPath: "/tmp/workflow-recorder-release-gate/latest.json",
      markdownPath: "/tmp/workflow-recorder-release-gate/latest.md",
      releaseArchivePath: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.json",
      releaseArchiveMarkdownPath: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.md",
    };
    const releaseReport = releaseReportWithPlannedArtifactIntegrity(report, paths);
    const outputJson = `${JSON.stringify(releaseReport, null, 2)}\n`;
    const markdownText = renderWorkflowRecorderReleaseGateMarkdown(releaseReport);
    expect(releaseReport.artifactIntegrity.status).toBe("pass");
    expect(releaseReport.artifactIntegrity.checkedArtifacts).toEqual(
      expect.arrayContaining([
        { label: "release gate latest JSON", path: "/tmp/workflow-recorder-release-gate/latest.json" },
        { label: "release gate latest Markdown", path: "/tmp/workflow-recorder-release-gate/latest.md" },
        { label: "release gate archive JSON", path: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.json" },
        {
          label: "release gate archive Markdown",
          path: "/tmp/workflow-recorder-release-gate/runs/aaaaaaaaaaaa-2026-05-19T10-00-00-000Z.md",
        },
      ]),
    );
    expect(
      workflowRecorderReleaseArtifactIntegrity({
        report: releaseReport,
        outputPath: paths.outputPath,
        outputJson,
        markdownPath: paths.markdownPath,
        markdownText,
        releaseArchivePath: paths.releaseArchivePath,
        releaseArchiveJson: outputJson,
        releaseArchiveMarkdownPath: paths.releaseArchiveMarkdownPath,
        releaseArchiveMarkdownText: markdownText,
      }).status,
    ).toBe("pass");

    const tampered = workflowRecorderReleaseArtifactIntegrity({
      report: releaseReport,
      outputPath: paths.outputPath,
      outputJson: outputJson.replace('"status": "passed_with_live_skipped"', '"status": "attention"'),
      markdownPath: paths.markdownPath,
      markdownText,
      releaseArchivePath: paths.releaseArchivePath,
      releaseArchiveJson: outputJson,
      releaseArchiveMarkdownPath: paths.releaseArchiveMarkdownPath,
      releaseArchiveMarkdownText: markdownText,
    });
    expect(tampered.status).toBe("fail");
    expect(tampered.issues).toContain("release gate latest JSON read-back content does not match the generated report.");
  });

  it("requires live rows only when the live gate is selected", () => {
    const deterministicJitterReport = passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" });
    const deterministicReport = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: deterministicJitterReport,
      jitterArchiveReport: archiveFor(deterministicJitterReport),
      now: "2026-05-19T10:01:00.000Z",
      requireLive: true,
    });
    expect(workflowRecorderReleaseGatePassed(deterministicReport, { requireLive: true })).toBe(false);
    expect(deterministicReport.releaseDecision.blockingIssues).toContain("Live Workflow Recorder rows are required but missing.");

    const liveJitterReport = passingJitterReport({
      generatedAt: "2026-05-19T10:00:00.000Z",
      liveCount: 1,
      liveScenarioCount: 5,
      tasks: [
        ...passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" }).tasks,
        {
          id: "recorder-live-gmi-smoke",
          tier: "live",
          status: "passed",
          scenarioCount: 5,
          scenarioIds: requiredScenarioIds(),
        },
      ],
    });
    const liveReport = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport: liveJitterReport,
      jitterArchiveReport: archiveFor(liveJitterReport),
      now: "2026-05-19T10:01:00.000Z",
      requireLive: true,
    });
    expect(liveReport.status).toBe("passed");
    expect(workflowRecorderReleaseGatePassed(liveReport, { requireLive: true })).toBe(true);
  });

  it("fails the live gate when live scenario coverage is too narrow", () => {
    const jitterReport = passingJitterReport({
      generatedAt: "2026-05-19T10:00:00.000Z",
      liveCount: 1,
      liveScenarioCount: 1,
      tasks: [
        ...passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" }).tasks,
        { id: "recorder-live-gmi-smoke", tier: "live", status: "passed", scenarioCount: 1, scenarioIds: ["web-research-date-night"] },
      ],
    });
    const report = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport,
      jitterArchiveReport: archiveFor(jitterReport),
      now: "2026-05-19T10:01:00.000Z",
      requireLive: true,
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("scenario coverage is too narrow");
  });

  it("requires the exact named live scenario ids for release signoff", () => {
    const jitterReport = passingJitterReport({
      generatedAt: "2026-05-19T10:00:00.000Z",
      liveCount: 1,
      liveScenarioCount: 5,
      tasks: [
        ...passingJitterReport({ generatedAt: "2026-05-19T10:00:00.000Z" }).tasks,
        {
          id: "recorder-live-gmi-smoke",
          tier: "live",
          status: "passed",
          scenarioCount: 5,
          scenarioIds: [
            "web-research-date-night",
            "browser-navigation-proof",
            "gmail-summary-metadata",
            "local-file-classification",
            "unrelated-smoke",
          ],
        },
      ],
    });
    const report = buildWorkflowRecorderReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      planHtml: planHtml(),
      jitterReport,
      jitterArchiveReport: archiveFor(jitterReport),
      now: "2026-05-19T10:01:00.000Z",
      requireLive: true,
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toContain("Live Workflow Recorder scenario ids are missing: ambient-cli-preflight.");
  });
});

function packageJsonWithScripts() {
  return {
    scripts: {
      "test:workflow-recorder-jitter": "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-recorder-jitter.mjs --profile=smoke --seeds=8",
      "test:workflow-recorder-release-gate": "pnpm run test:workflow-recorder-jitter && node scripts/workflow-recorder-release-gate.mjs",
      "test:workflow-recorder-release-gate:unit": "pnpm exec vitest run scripts/workflow-recorder-release-gate.test.mjs",
      "test:workflow-recorder:live": "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-recorder-jitter.mjs --profile=live-smoke --seeds=3 && node scripts/workflow-recorder-release-gate.mjs --require-live",
    },
  };
}

function planHtml() {
  return [
    "Phase 6: Dogfood and release gate",
    "workflow-recorder-jitter.mjs",
    "workflow-recorder-release-gate.mjs",
    "recorder release gate passes deterministic",
  ].join("\n");
}

function passingJitterReport(input = {}) {
  const tasks = input.tasks ?? [
    { id: "recorder-release-native", tier: "deterministic", status: "passed", durationMs: 100 },
    { id: "recorder-ui-model", tier: "deterministic", status: "passed", durationMs: 100 },
    { id: "recorder-tool-metadata", tier: "deterministic", status: "passed", durationMs: 100 },
    { id: "recorder-html-plan-sanity", tier: "deterministic", status: "passed", durationMs: 10 },
  ];
  return {
    schemaVersion: 1,
    runId: "workflow-recorder-test",
    archivePath: "/tmp/workflow-recorder-jitter/runs/workflow-recorder-test.json",
    generatedAt: input.generatedAt,
    profile: "smoke",
    seedCount: 8,
    source: {
      gitHead: testGitHead(),
      trackedDirty: false,
      trackedStatusLines: [],
    },
    taskCount: tasks.length,
    passedCount: tasks.filter((task) => task.status === "passed").length,
    liveCount: input.liveCount ?? tasks.filter((task) => task.tier === "live").length,
    liveScenarioCount: input.liveScenarioCount ?? tasks.reduce((total, task) => total + Number(task.scenarioCount ?? 0), 0),
    tasks,
  };
}

function testGitHead() {
  return "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
}

function archiveFor(report) {
  return JSON.parse(JSON.stringify(report));
}

function releaseReportWithPlannedArtifactIntegrity(report, paths) {
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const reportMarkdown = renderWorkflowRecorderReleaseGateMarkdown(report);
  const artifactIntegrity = workflowRecorderReleaseArtifactIntegrity({
    report,
    ...paths,
    outputJson: reportJson,
    markdownText: reportMarkdown,
    releaseArchiveJson: reportJson,
    releaseArchiveMarkdownText: reportMarkdown,
  });
  return {
    ...report,
    artifactIntegrity: {
      status: artifactIntegrity.status === "pass" ? "pass" : "pending",
      issues: [],
      checkedArtifacts: artifactIntegrity.checkedArtifacts,
    },
  };
}

function requiredScenarioIds() {
  return [
    "web-research-date-night",
    "browser-navigation-proof",
    "gmail-summary-metadata",
    "local-file-classification",
    "ambient-cli-preflight",
  ];
}
