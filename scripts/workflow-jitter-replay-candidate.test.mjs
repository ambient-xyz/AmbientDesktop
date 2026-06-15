import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowJitterReplayCandidatePlan,
  runWorkflowJitterReplayCandidate,
  validateWorkflowJitterReplayCandidateBundle,
} from "./workflow-jitter-replay-candidate.mjs";

describe("workflow jitter replay candidate", () => {
  it("validates a structured replay bundle and builds a dry-run matrix replay plan", () => {
    const bundle = replayBundle();

    const validation = validateWorkflowJitterReplayCandidateBundle(bundle);
    const plan = buildWorkflowJitterReplayCandidatePlan(bundle, { outputDir: "test-results/custom-replay" });

    expect(validation.status).toBe("pass");
    expect(plan).toMatchObject({
      candidateId: "ui-dogfood-public-source-browser-a1b2c3",
      taskId: "ui-dogfood-public-source-browser",
      dryRun: true,
      envKeys: ["AMBIENT_PROVIDER", "GMI_CLOUD_API_KEY_FILE"],
    });
    expect(plan.command).toBe(process.execPath);
    expect(plan.args).toEqual([
      "scripts/workflow-jitter-matrix.mjs",
      "--task=ui-dogfood-public-source-browser",
      "--retries=0",
      "--output-dir=test-results/custom-replay",
    ]);
  });

  it("rejects replay bundles that are not deterministic or leak env values", () => {
    const bundle = replayBundle({
      matrixReplay: {
        command: "node",
        args: ["scripts/workflow-jitter-matrix.mjs", "--task=ui-dogfood-public-source-browser"],
        cwd: ".",
        taskIds: ["ui-dogfood-public-source-browser"],
        retries: 1,
      },
      envKeys: ["AMBIENT_PROVIDER=gmi-cloud"],
    });

    const validation = validateWorkflowJitterReplayCandidateBundle(bundle);

    expect(validation.status).toBe("fail");
    expect(validation.issues.join("\n")).toContain("--retries=0");
    expect(validation.issues.join("\n")).toContain("isolated --output-dir");
    expect(validation.issues.join("\n")).toContain("sanitized environment variable name");
  });

  it("writes a dry-run replay report without executing the candidate", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "workflow-jitter-replay-candidate-"));
    const outputPath = join(outputDir, "replay.json");

    const report = await runWorkflowJitterReplayCandidate({
      bundle: replayBundle(),
      outputPath,
    });

    expect(report.status).toBe("dry_run");
    expect(report.result).toBeUndefined();
    const written = JSON.parse(await readFile(outputPath, "utf8"));
    expect(written.plan).toMatchObject({
      candidateId: "ui-dogfood-public-source-browser-a1b2c3",
      taskId: "ui-dogfood-public-source-browser",
    });
    expect(await readFile(outputPath.replace(/\.json$/, ".md"), "utf8")).toContain("Workflow Jitter Candidate Replay");
  });

  it("can execute through an injected command runner", async () => {
    const report = await runWorkflowJitterReplayCandidate({
      bundle: replayBundle(),
      execute: true,
      outputPath: false,
      runCommand: async (command) => ({
        exitCode: command.args.includes("--task=ui-dogfood-public-source-browser") ? 0 : 1,
        stdout: "ok",
        stderr: "",
      }),
    });

    expect(report.status).toBe("passed");
    expect(report.result).toMatchObject({ exitCode: 0, stdout: "ok" });
  });
});

function replayBundle(overrides = {}) {
  const matrixReplay = overrides.matrixReplay ?? {
    command: "node",
    args: [
      "scripts/workflow-jitter-matrix.mjs",
      "--task=ui-dogfood-public-source-browser",
      "--retries=0",
      "--output-dir=test-results/workflow-jitter-matrix/replay/ui-dogfood-public-source-browser-a1b2c3",
    ],
    cwd: ".",
    taskIds: ["ui-dogfood-public-source-browser"],
    retries: 0,
    outputDir: "test-results/workflow-jitter-matrix/replay/ui-dogfood-public-source-browser-a1b2c3",
  };
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-19T13:00:00.000Z",
    runId: "matrix-run",
    sourceRevision: { gitHead: "abc123", dirty: false },
    candidate: {
      id: "ui-dogfood-public-source-browser-a1b2c3",
      taskId: "ui-dogfood-public-source-browser",
      taskLabel: "Public source browser workflow UI dogfood",
      suggestedJsonArtifact: "test-results/workflow-jitter-matrix/promotion-candidates/ui-dogfood-public-source-browser-a1b2c3.json",
      replay: {
        schemaVersion: 1,
        runId: "matrix-run",
        generatedAt: "2026-05-19T13:00:00.000Z",
        profile: "phase8-smoke",
        sourceRevision: { gitHead: "abc123", dirty: false },
        taskId: "ui-dogfood-public-source-browser",
        taskLabel: "Public source browser workflow UI dogfood",
        matrixReplay,
        directReplay: {
          command: "node",
          args: ["scripts/workflow-agent-thread-ui-dogfood.mjs", "--scenario=public-source-browser"],
          cwd: ".",
        },
        matrixCommand: "node scripts/workflow-jitter-matrix.mjs --task=ui-dogfood-public-source-browser --retries=0 --output-dir=test-results/workflow-jitter-matrix/replay/ui-dogfood-public-source-browser-a1b2c3",
        directCommand: "node scripts/workflow-agent-thread-ui-dogfood.mjs --scenario=public-source-browser",
        envKeys: overrides.envKeys ?? ["AMBIENT_PROVIDER", "GMI_CLOUD_API_KEY_FILE"],
        scenario: "public-source-browser",
        seedHints: [],
        attempts: [{ attempt: 1, status: "product_or_test_failure", exitCode: 1, durationMs: 1200, logPath: "/tmp/log.txt" }],
      },
    },
  };
}
