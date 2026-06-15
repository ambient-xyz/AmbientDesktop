import { describe, expect, it } from "vitest";
import {
  buildWorkflowJitterReleaseGateReport,
  renderWorkflowJitterReleaseGateMarkdown,
  workflowJitterReleaseGatePassed,
} from "./workflow-jitter-release-gate.mjs";

describe("workflow jitter release gate", () => {
  it("passes a fresh deterministic matrix while warning that live rows were skipped", () => {
    const report = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: passingMatrix({
        generatedAt: "2026-05-19T10:00:00.000Z",
        live: false,
      }),
      matrixReportPath: "/tmp/workflow-jitter/latest.json",
      now: "2026-05-19T10:30:00.000Z",
    });

    expect(report.status).toBe("passed_with_live_skipped");
    expect(workflowJitterReleaseGatePassed(report)).toBe(true);
    expect(report.releaseDecision.advisoryIssues).toContain("Live workflow jitter rows were skipped for this deterministic gate.");
    expect(renderWorkflowJitterReleaseGateMarkdown(report)).toContain("Workflow Jitter Release Gate");
  });

  it("requires registered package scripts so the gate remains discoverable", () => {
    const report = buildWorkflowJitterReleaseGateReport({
      packageJson: { scripts: { "test:workflow-jitter-matrix": "node scripts/workflow-jitter-matrix.mjs" } },
      matrixReport: passingMatrix({ generatedAt: "2026-05-19T10:00:00.000Z" }),
      now: "2026-05-19T10:01:00.000Z",
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "workflow jitter matrix unit tests command is registered.",
        "live workflow jitter matrix command is registered.",
        "workflow jitter release gate command is registered.",
      ]),
    );
  });

  it("fails stale or incomplete deterministic matrix evidence", () => {
    const report = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: passingMatrix({
        generatedAt: "2026-05-18T00:00:00.000Z",
        taskOverrides: [
          { id: "model-tolerance-mock", tier: "deterministic", axis: "prompt", status: "passed" },
          { id: "workflow-ir-path-jitter", tier: "deterministic", axis: "ir", status: "passed" },
        ],
      }),
      now: "2026-05-19T10:00:00.000Z",
      maxAgeMinutes: 60,
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("stale");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("expected at least 5");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("compiler");
  });

  it("fails product failures and recurring promotion debt", () => {
    const report = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: {
        ...passingMatrix({ generatedAt: "2026-05-19T10:00:00.000Z" }),
        passedCount: 5,
        taskCount: 6,
        productOrTestFailureCount: 1,
        promotionCandidates: [
          {
            id: "ui-dogfood-public-source-browser-a1b2c3",
            priority: "promote",
            suggestedFixture: "src/renderer/src/workflowJitterRegression.ui_dogfood_public_source_browser.test.ts",
          },
        ],
        tasks: [
          ...passingMatrix({ generatedAt: "2026-05-19T10:00:00.000Z" }).tasks,
          { id: "ui-dogfood-public-source-browser", tier: "live", axis: "ui_state", status: "product_or_test_failure" },
        ],
      },
      now: "2026-05-19T10:01:00.000Z",
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues).toEqual(
      expect.arrayContaining([
        "Workflow jitter matrix has 1 product/test failure row(s).",
        "Recurring workflow failure ui-dogfood-public-source-browser-a1b2c3 must be promoted into src/renderer/src/workflowJitterRegression.ui_dogfood_public_source_browser.test.ts.",
      ]),
    );
  });

  it("fails promotion candidates that cannot be replayed from structured artifacts", () => {
    const report = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: {
        ...passingMatrix({ generatedAt: "2026-05-19T10:00:00.000Z" }),
        promotionCandidates: [
          {
            id: "ui-dogfood-public-source-browser-a1b2c3",
            taskId: "ui-dogfood-public-source-browser",
            priority: "watch",
            replay: {
              schemaVersion: 1,
              runId: "matrix-run",
              taskId: "ui-dogfood-public-source-browser",
              matrixReplay: {
                command: "node",
                args: ["scripts/workflow-jitter-matrix.mjs", "--task=ui-dogfood-public-source-browser"],
                taskIds: ["ui-dogfood-public-source-browser"],
                retries: 1,
              },
              directReplay: { command: "node", args: [] },
              envKeys: ["GMI_CLOUD_API_KEY_FILE=/tmp/secret"],
              attempts: [],
            },
          },
        ],
      },
      now: "2026-05-19T10:01:00.000Z",
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("replay bundle is invalid");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("--retries=0");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("sanitized environment variable name");
  });

  it("requires live rows only when the live gate is selected", () => {
    const deterministicReport = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: passingMatrix({ generatedAt: "2026-05-19T10:00:00.000Z", live: false }),
      now: "2026-05-19T10:01:00.000Z",
      requireLive: true,
    });
    expect(workflowJitterReleaseGatePassed(deterministicReport, { requireLive: true })).toBe(false);
    expect(deterministicReport.releaseDecision.blockingIssues).toContain("Live workflow jitter rows are required but missing.");

    const liveReport = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: passingMatrix({ generatedAt: "2026-05-19T10:00:00.000Z", live: true }),
      now: "2026-05-19T10:01:00.000Z",
      requireLive: true,
    });
    expect(liveReport.status).toBe("passed");
    expect(workflowJitterReleaseGatePassed(liveReport, { requireLive: true })).toBe(true);
  });

  it("makes release-profile coverage stricter than a normal live smoke pass", () => {
    const smokeReport = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: passingMatrix({ generatedAt: "2026-05-19T10:00:00.000Z", live: true }),
      now: "2026-05-19T10:01:00.000Z",
      releaseProfile: true,
    });

    expect(smokeReport.status).toBe("attention");
    expect(smokeReport.releaseDecision.blockingIssues.join("\n")).toContain("strict release profile requires release");
    expect(smokeReport.releaseDecision.blockingIssues.join("\n")).toContain("passed live prompt variant");
    expect(smokeReport.releaseDecision.blockingIssues.join("\n")).toContain("passed live UI dogfood run");

    const releaseReport = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: passingReleaseProfileMatrix({ generatedAt: "2026-05-19T10:00:00.000Z" }),
      now: "2026-05-19T10:01:00.000Z",
      releaseProfile: true,
    });

    expect(releaseReport.status).toBe("passed");
    expect(workflowJitterReleaseGatePassed(releaseReport)).toBe(true);
    expect(releaseReport.checks.find((check) => check.id === "matrix.release-profile")).toMatchObject({
      status: "pass",
      evidence: expect.arrayContaining(["liveDogfoodRuns: 10/10"]),
    });
  });

  it("surfaces credentialed snapshot blockers from release-profile jitter evidence", () => {
    const base = passingReleaseProfileMatrix({ generatedAt: "2026-05-19T10:00:00.000Z" });
    const blockedTaskId = "ui-dogfood-gmail-20-metadata-readonly-validation";
    const blockedTask = base.tasks.find((task) => task.id === blockedTaskId);
    const report = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: {
        ...base,
        passedCount: base.passedCount - 1,
        environmentSkippedCount: 1,
        liveDogfoodRunCount: 9,
        liveFamilies: base.liveFamilies.filter((family) => family !== "connector"),
        environmentBlockers: [
          {
            kind: "credentialed_snapshot_missing",
            summary: "Credentialed workflow UI dogfood snapshot unavailable: Snapshot copy requested, but the selected snapshot root does not exist.",
            nextStep: "Set AMBIENT_SHARED_SECRETS_SNAPSHOT_ROOT to a valid credentialed snapshot copy.",
            affectedTaskCount: 1,
            taskIds: [blockedTaskId],
            preflight: {
              status: "missing",
              selectedRootSource: "env:AMBIENT_WORKFLOW_UI_DOGFOOD_SNAPSHOT_ROOT",
              snapshotRootLabel: "missing-snapshot",
              snapshotRootPathDigest: "abc123def456",
            },
          },
        ],
        tasks: base.tasks.map((task) =>
          task.id === blockedTaskId
            ? {
                ...task,
                status: "environment_skipped",
                reason: "Credentialed workflow UI dogfood snapshot unavailable.",
                matchedPattern: "credentialed_snapshot_missing",
                environmentBlocker: {
                  kind: "credentialed_snapshot_missing",
                  preflight: { status: "missing", snapshotRootLabel: "missing-snapshot" },
                },
              }
            : task,
        ),
      },
      now: "2026-05-19T10:01:00.000Z",
      releaseProfile: true,
    });

    expect(blockedTask).toBeTruthy();
    expect(report.status).toBe("attention");
    expect(report.checks.find((check) => check.id === "matrix.environment-blockers")).toMatchObject({
      status: "fail",
      evidence: expect.arrayContaining([
        expect.stringContaining("kind: credentialed_snapshot_missing"),
        expect.stringContaining("label: missing-snapshot"),
      ]),
    });
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("credentialed_snapshot_missing");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain(blockedTaskId);
    expect(report.matrix.environmentBlockers).toEqual([
      expect.objectContaining({
        kind: "credentialed_snapshot_missing",
        affectedTaskCount: 1,
        preflight: expect.objectContaining({
          snapshotRootLabel: "missing-snapshot",
          snapshotRootPathDigest: "abc123def456",
        }),
      }),
    ]);
  });

  it("strict current-head mode rejects stale or dirty matrix source provenance", () => {
    const matching = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: passingMatrix({
        generatedAt: "2026-05-19T10:00:00.000Z",
        sourceRevision: { gitHead: "abc123", dirty: false },
      }),
      sourceRevision: { gitHead: "abc123", dirty: false },
      now: "2026-05-19T10:01:00.000Z",
      requireCurrentHead: true,
    });
    expect(matching.status).toBe("passed_with_live_skipped");
    expect(matching.checks.find((check) => check.id === "matrix.source-revision")).toMatchObject({ status: "pass" });

    const stale = buildWorkflowJitterReleaseGateReport({
      packageJson: packageJsonWithScripts(),
      matrixReport: passingMatrix({
        generatedAt: "2026-05-19T10:00:00.000Z",
        sourceRevision: { gitHead: "old456", dirty: true },
      }),
      sourceRevision: { gitHead: "abc123", dirty: false },
      now: "2026-05-19T10:01:00.000Z",
      requireCurrentHead: true,
    });

    expect(stale.status).toBe("attention");
    expect(stale.releaseDecision.blockingIssues.join("\n")).toContain("tracked-dirty worktree");
    expect(stale.releaseDecision.blockingIssues.join("\n")).toContain("current git head is abc123");
  });
});

function packageJsonWithScripts() {
  return {
    scripts: {
      "test:workflow-jitter-matrix": "node scripts/workflow-jitter-matrix.mjs --profile=phase8-smoke",
      "test:workflow-jitter-matrix:unit": "pnpm exec vitest run scripts/workflow-jitter-matrix.test.mjs",
      "test:workflow-jitter-matrix:live": "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-jitter-matrix.mjs --profile=phase8-smoke --include-live --require-live --retries=1",
      "test:workflow-jitter-matrix:release-profile": "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-jitter-matrix.mjs --profile=release --require-live --promotion-gate --retries=1",
      "test:workflow-jitter-release-gate": "pnpm run test:workflow-jitter-matrix && node scripts/workflow-jitter-release-gate.mjs",
      "test:workflow-jitter-release-gate:unit": "pnpm exec vitest run scripts/workflow-jitter-release-gate.test.mjs scripts/workflow-jitter-release-profile-gate.test.mjs",
      "test:workflow-jitter-release-gate:live": "pnpm run test:workflow-jitter-matrix:live && node scripts/workflow-jitter-release-gate.mjs --require-live",
      "test:workflow-jitter-release-gate:release-profile": "AMBIENT_PROVIDER=gmi-cloud node scripts/workflow-jitter-release-profile-gate.mjs",
      "test:workflow-jitter-replay-candidate:unit": "pnpm exec vitest run scripts/workflow-jitter-replay-candidate.test.mjs",
    },
  };
}

function passingMatrix(input = {}) {
  const tasks =
    input.taskOverrides ??
    [
      { id: "model-tolerance-mock", tier: "deterministic", axis: "prompt", status: "passed" },
      { id: "workflow-ir-path-jitter", tier: "deterministic", axis: "ir", status: "passed" },
      { id: "workflow-path-registry-jitter", tier: "deterministic", axis: "ir", status: "passed" },
      { id: "workflow-ui-comprehension", tier: "deterministic", axis: "ui_state", status: "passed" },
      { id: "workflow-program-core", tier: "deterministic", axis: "compiler", status: "passed" },
    ];
  const liveTask = { id: "ui-dogfood-vocabulary-quiz", tier: "live", axis: "ui_state", status: "passed" };
  const allTasks = input.live ? [...tasks, liveTask] : tasks;
  return {
    schemaVersion: 1,
    runId: "matrix-run",
    generatedAt: input.generatedAt,
    sourceRevision: input.sourceRevision,
    profile: "phase8-smoke",
    taskCount: allTasks.length,
    deterministicCount: tasks.filter((task) => task.tier === "deterministic").length,
    liveCount: input.live ? 1 : 0,
    passedCount: allTasks.filter((task) => task.status === "passed").length,
    providerDegradedCount: 0,
    environmentSkippedCount: 0,
    productOrTestFailureCount: 0,
    promotionCandidates: [],
    tasks: allTasks,
  };
}

function passingReleaseProfileMatrix(input = {}) {
  const deterministicTasks = [
    { id: "model-tolerance-mock", tier: "deterministic", axis: "prompt", status: "passed", deterministicStressUnits: 10 },
    { id: "workflow-ir-path-jitter", tier: "deterministic", axis: "ir", status: "passed", deterministicStressUnits: 1560 },
    { id: "workflow-path-registry-jitter", tier: "deterministic", axis: "ir", status: "passed", deterministicStressUnits: 500 },
    { id: "workflow-ui-comprehension", tier: "deterministic", axis: "ui_state", status: "passed", deterministicStressUnits: 4 },
    { id: "workflow-program-core", tier: "deterministic", axis: "compiler", status: "passed", deterministicStressUnits: 5 },
  ];
  const liveTasks = [
    { id: "model-tolerance-live-compile-prompts", tier: "live", axis: "prompt", status: "passed", livePromptVariantUnits: 120, liveFamily: "model-only" },
    ...[
      ["ui-dogfood-vocabulary-quiz", "model-only"],
      ["ui-dogfood-local-file-classifier", "local"],
      ["ui-dogfood-public-source-browser", "browser"],
      ["ui-dogfood-downloads-document-categorization", "document"],
      ["ui-dogfood-gmail-20-metadata-readonly-validation", "connector"],
      ["ui-dogfood-current-web-recipe-report", "browser"],
      ["ui-dogfood-flaky-browser-recovery", "recovery"],
      ["ui-dogfood-vocabulary-quiz-repeat-2", "model-only"],
      ["ui-dogfood-local-file-classifier-repeat-2", "local"],
      ["ui-dogfood-public-source-browser-repeat-2", "browser"],
    ].map(([id, liveFamily]) => ({
      id,
      tier: "live",
      axis: "ui_state",
      status: "passed",
      liveDogfoodRunUnits: 1,
      liveFamily,
    })),
  ];
  const tasks = [...deterministicTasks, ...liveTasks];
  return {
    schemaVersion: 1,
    runId: "matrix-release-run",
    generatedAt: input.generatedAt,
    sourceRevision: input.sourceRevision,
    profile: "release",
    taskCount: tasks.length,
    deterministicCount: deterministicTasks.length,
    liveCount: liveTasks.length,
    deterministicStressUnitCount: 2079,
    livePromptVariantCount: 120,
    liveDogfoodRunCount: 10,
    liveFamilies: ["browser", "connector", "document", "local", "model-only", "recovery"],
    passedCount: tasks.length,
    providerDegradedCount: 0,
    environmentSkippedCount: 0,
    productOrTestFailureCount: 0,
    promotionCandidates: [],
    tasks,
  };
}
