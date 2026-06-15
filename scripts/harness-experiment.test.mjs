import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFinalDecision,
  parseExperimentArgs,
  pickHoldoutCandidate,
  renderExperimentMarkdown,
  runHarnessExperiment,
} from "./harness-experiment.mjs";

describe("meta harness experiment orchestrator", () => {
  it("parses search, holdout, judge, and resume options", () => {
    const options = parseExperimentArgs(
      [
        "--run-id",
        "fixed",
        "--",
        "--tasks=live-smoke",
        "--holdout-tasks",
        "long-context-qa",
        "--late-holdout-tasks",
        "project-board-dogfood",
        "--variants=baseline,bootstrap-min",
        "--trials=2",
        "--holdout-trials=3",
        "--late-holdout-trials=4",
        "--base-port=9900",
        "--judge-dry-run",
        "--skip-late-holdout",
        "--resume",
      ],
      {},
      () => new Date("2026-05-09T00:00:00.000Z"),
    );

    expect(options).toMatchObject({
      runId: "fixed",
      searchTasks: ["live-smoke"],
      holdoutTasks: ["long-context-qa"],
      lateHoldoutTasks: ["project-board-dogfood"],
      variants: ["baseline", "bootstrap-min"],
      trials: 2,
      holdoutTrials: 3,
      lateHoldoutTrials: 4,
      basePort: 9900,
      judgeDryRun: true,
      skipLateHoldout: true,
      resume: true,
    });
  });

  it("uses task profiles for default and explicit experiment splits", () => {
    expect(parseExperimentArgs([], {}).searchTasks).toEqual(["live-smoke", "node-benchmark", "long-context-qa", "plugin-arxiv", "app-build-html-calculator"]);
    expect(parseExperimentArgs([], {}).holdoutTasks).toEqual(["workflow-graph-review"]);
    expect(parseExperimentArgs([], {}).lateHoldoutTasks).toEqual([]);
    expect(parseExperimentArgs([], {}).variants).toEqual(["baseline", "bootstrap-scripts", "bootstrap-tools"]);
    expect(parseExperimentArgs(["--search-profile=quick", "--holdout-profile=late-holdout", "--late-holdout-profile=late-holdout"], {})).toMatchObject({
      searchProfile: "quick",
      holdoutProfile: "late-holdout",
      lateHoldoutProfile: "late-holdout",
      searchTasks: ["live-smoke"],
      holdoutTasks: ["project-board-dogfood"],
      lateHoldoutTasks: ["project-board-dogfood"],
    });
  });

  it("rejects unknown tasks and a missing baseline", () => {
    expect(() => parseExperimentArgs(["--tasks=unknown"], {})).toThrow("Unknown harness task or profile");
    expect(() => parseExperimentArgs(["--variants=bootstrap-scripts"], {})).toThrow("Baseline variant");
  });

  it("runs search, judge, report, and auto-holdout for a promoted candidate", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-harness-experiment-"));
    const calls = [];
    const result = await runHarnessExperiment(
      parseExperimentArgs(
        [
          "--run-id=experiment-1",
          "--output-dir",
          root,
          "--search-tasks=live-smoke",
          "--holdout-tasks=long-context-qa",
          "--variants=baseline,bootstrap-scripts",
          "--trials=1",
          "--judge-dry-run",
        ],
        {},
      ),
      {
        cwd: root,
        runEval: fakeEval(calls, { promoteCandidate: true }),
        runJudge: fakeJudge(calls),
      },
    );

    expect(result.manifest.finalDecision).toMatchObject({ status: "promote", variant: "bootstrap-scripts" });
    expect(result.manifest.stages.map((stage) => stage.name)).toEqual(["search", "holdout"]);
    expect(calls.filter((call) => call.kind === "eval").map((call) => [call.runId, call.tasks, call.variants])).toEqual([
      ["search", ["live-smoke"], ["baseline", "bootstrap-scripts"]],
      ["holdout", ["long-context-qa"], ["baseline", "bootstrap-scripts"]],
    ]);
    expect(calls.filter((call) => call.kind === "judge")).toHaveLength(2);

    const manifest = JSON.parse(await readFile(join(root, "experiment-1", "experiment.json"), "utf8"));
    expect(manifest.finalDecision.status).toBe("promote");
    expect(await readFile(join(root, "experiment-1", "experiment-summary.md"), "utf8")).toContain("`promote` `bootstrap-scripts`");
  });

  it("runs late holdout only after search and holdout promote a candidate", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-harness-experiment-"));
    const calls = [];
    const result = await runHarnessExperiment(
      parseExperimentArgs(
        [
          "--run-id=experiment-late",
          "--output-dir",
          root,
          "--search-tasks=live-smoke",
          "--holdout-tasks=long-context-qa",
          "--late-holdout-tasks=project-board-dogfood",
          "--variants=baseline,bootstrap-scripts",
          "--trials=1",
          "--judge-dry-run",
        ],
        {},
      ),
      {
        cwd: root,
        runEval: fakeEval(calls, { promoteCandidate: true }),
        runJudge: fakeJudge(calls),
      },
    );

    expect(result.manifest.finalDecision).toMatchObject({ status: "promote", variant: "bootstrap-scripts" });
    expect(result.manifest.stages.map((stage) => stage.name)).toEqual(["search", "holdout", "late-holdout"]);
    expect(calls.filter((call) => call.kind === "eval").map((call) => [call.runId, call.tasks, call.variants])).toEqual([
      ["search", ["live-smoke"], ["baseline", "bootstrap-scripts"]],
      ["holdout", ["long-context-qa"], ["baseline", "bootstrap-scripts"]],
      ["late-holdout", ["project-board-dogfood"], ["baseline", "bootstrap-scripts"]],
    ]);
    expect(await readFile(join(root, "experiment-late", "experiment-summary.md"), "utf8")).toContain("`promote` `bootstrap-scripts`");
    expect(await readFile(join(root, "experiment-late", "experiment-summary.md"), "utf8")).toContain("| `late-holdout` |");
  });

  it("does not run holdout when search has no promotable candidate", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-harness-experiment-"));
    const calls = [];
    const result = await runHarnessExperiment(
      parseExperimentArgs(["--run-id=experiment-2", "--output-dir", root, "--search-tasks=live-smoke", "--variants=baseline,bootstrap-scripts", "--skip-judge"], {}),
      {
        cwd: root,
        runEval: fakeEval(calls, { promoteCandidate: false }),
      },
    );

    expect(result.manifest.finalDecision).toMatchObject({ status: "needs-more-evidence", variant: "bootstrap-scripts" });
    expect(result.manifest.stages.map((stage) => stage.name)).toEqual(["search"]);
    expect(calls.filter((call) => call.kind === "eval")).toHaveLength(1);
  });

  it("resumes completed stages without rerunning eval or judge", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-harness-experiment-"));
    const calls = [];
    await runHarnessExperiment(parseExperimentArgs(["--run-id=experiment-3", "--output-dir", root, "--search-tasks=live-smoke", "--holdout-tasks=long-context-qa", "--judge-dry-run"], {}), {
      cwd: root,
      runEval: fakeEval(calls, { promoteCandidate: true }),
      runJudge: fakeJudge(calls),
    });

    const resumed = await runHarnessExperiment(parseExperimentArgs(["--run-id=experiment-3", "--output-dir", root, "--search-tasks=live-smoke", "--holdout-tasks=long-context-qa", "--judge-dry-run", "--resume"], {}), {
      cwd: root,
      runEval: async () => {
        throw new Error("eval should have been resumed");
      },
      runJudge: async () => {
        throw new Error("judge should have been resumed");
      },
    });

    expect(resumed.manifest.finalDecision.status).toBe("promote");
    expect(resumed.manifest.stages.every((stage) => stage.resumed && stage.evalSkipped && stage.judgeSkipped)).toBe(true);
  });

  it("passes resume through when a stage has partial results but no report", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-harness-experiment-"));
    const runRoot = join(root, "experiment-4", "search");
    await mkdir(runRoot, { recursive: true });
    await writeFile(join(runRoot, "results.jsonl"), `${JSON.stringify(resultRow({ runId: "search", variant: "baseline", taskId: "live-smoke", elapsedMs: 1000, toolEventCount: 10 }))}\n`, "utf8");
    const calls = [];

    const resumed = await runHarnessExperiment(
      parseExperimentArgs(["--run-id=experiment-4", "--output-dir", root, "--search-tasks=live-smoke", "--variants=baseline,bootstrap-scripts", "--skip-judge", "--skip-holdout", "--resume"], {}),
      {
        cwd: root,
        runEval: fakeEval(calls, { promoteCandidate: true }),
      },
    );

    expect(calls.filter((call) => call.kind === "eval")).toEqual([
      expect.objectContaining({ runId: "search", resume: true }),
    ]);
    expect(resumed.manifest.stages[0]).toMatchObject({ name: "search", resumed: true });
  });

  it("selects holdout candidates only from safe frontier variants", () => {
    expect(
      pickHoldoutCandidate(
        {
          recommendedVariant: "bootstrap-scripts",
          variants: [{ variant: "bootstrap-scripts", role: "candidate", gate: { status: "promote" } }],
        },
        "baseline",
      ),
    ).toBe("bootstrap-scripts");
    expect(
      pickHoldoutCandidate(
        {
          recommendedVariant: "baseline",
          variants: [{ variant: "bootstrap-scripts", role: "candidate", gate: { status: "needs-more-evidence" } }],
        },
        "baseline",
        { force: true },
      ),
    ).toBe("bootstrap-scripts");
  });

  it("renders a compact experiment summary", () => {
    const markdown = renderExperimentMarkdown({
      runId: "run-1",
      startedAt: "start",
      completedAt: "end",
      apiKeySource: "missing",
      finalDecision: { status: "needs-holdout", variant: "bootstrap-scripts", reasons: ["Holdout skipped."] },
      config: { searchTasks: ["live-smoke"] },
      stages: [
        {
          name: "search",
          variants: ["baseline", "bootstrap-scripts"],
          tasks: ["live-smoke"],
          trials: 1,
          recommendedVariant: "bootstrap-scripts",
          recommendation: { status: "promote" },
          markdownPath: "/tmp/report.md",
        },
      ],
    });

    expect(markdown).toContain("# Meta-Harness Experiment");
    expect(markdown).toContain("`needs-holdout` `bootstrap-scripts`");
    expect(markdown).toContain("| `search` |");
  });

  it("summarizes final decision states", () => {
    expect(
      buildFinalDecision({
        baseline: "baseline",
        searchStage: { report: { recommendedVariant: "baseline", recommendation: { status: "baseline" }, variants: [] } },
      }),
    ).toMatchObject({ status: "baseline" });
    expect(
      buildFinalDecision({
        baseline: "baseline",
        searchStage: promotedSearchReport(),
        skippedHoldout: true,
        holdoutCandidate: "bootstrap-scripts",
      }),
    ).toMatchObject({ status: "needs-holdout" });
    expect(
      buildFinalDecision({
        baseline: "baseline",
        searchStage: promotedSearchReport(),
        holdoutCandidate: "bootstrap-scripts",
        lateHoldoutConfigured: true,
        skippedLateHoldout: true,
        holdoutStage: {
          report: {
            variants: [{ variant: "bootstrap-scripts", gate: { status: "promote", reasons: ["Holdout passed."] } }],
          },
        },
      }),
    ).toMatchObject({ status: "needs-late-holdout" });
    expect(
      buildFinalDecision({
        baseline: "baseline",
        searchStage: promotedSearchReport(),
        holdoutCandidate: "bootstrap-scripts",
        holdoutStage: {
          report: {
            variants: [{ variant: "bootstrap-scripts", gate: { status: "reject", reasons: ["Holdout regressed."] } }],
          },
        },
      }),
    ).toMatchObject({ status: "reject", reasons: ["Holdout regressed."] });
    expect(
      buildFinalDecision({
        baseline: "baseline",
        searchStage: promotedSearchReport(),
        holdoutCandidate: "bootstrap-scripts",
        lateHoldoutConfigured: true,
        holdoutStage: {
          report: {
            variants: [{ variant: "bootstrap-scripts", gate: { status: "promote", reasons: ["Holdout passed."] } }],
          },
        },
        lateHoldoutStage: {
          report: {
            variants: [{ variant: "bootstrap-scripts", gate: { status: "reject", reasons: ["Late dogfood regressed."] } }],
          },
        },
      }),
    ).toMatchObject({ status: "reject", reasons: ["Late dogfood regressed."] });
  });
});

function fakeEval(calls, { promoteCandidate }) {
  return async (options) => {
    calls.push({ kind: "eval", runId: options.runId, tasks: options.tasks, variants: options.variants, resume: options.resume });
    const runRoot = resolve(options.cwd, options.outputDir, options.runId);
    await mkdir(runRoot, { recursive: true });
    const rows = options.variants.flatMap((variant) =>
      options.tasks.map((taskId) =>
        resultRow({
          runId: options.runId,
          variant,
          taskId,
          elapsedMs: variant === "baseline" ? 1000 : promoteCandidate ? 700 : 980,
          toolEventCount: variant === "baseline" ? 10 : promoteCandidate ? 7 : 10,
        }),
      ),
    );
    await writeFile(
      join(runRoot, "config.json"),
      `${JSON.stringify({ version: 1, runId: options.runId, tasks: options.tasks, variants: options.variants, trials: options.trials }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(runRoot, "results.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
    return { runRoot, results: rows };
  };
}

function fakeJudge(calls) {
  return async (options) => {
    calls.push({ kind: "judge", runRoot: options.runRoot, resume: options.resume });
    const text = await readFile(join(options.runRoot, "results.jsonl"), "utf8");
    const rows = text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const judgeRows = rows.map((row) => ({
      version: 1,
      runId: row.runId,
      candidateLabel: row.variant === "baseline" ? "candidate_a" : "candidate_b",
      variant: row.variant,
      taskId: row.taskId,
      trial: row.trial,
      status: "valid",
      deterministicPassed: true,
      judge: {
        pass: true,
        score: row.variant === "baseline" ? 0.7 : 0.9,
        failureCategory: null,
        unrelatedMutationRisk: "low",
        toolUseCoherence: "strong",
        contractAdherence: "strong",
        deterministicAgreement: "agrees",
        concerns: [],
        conciseRationale: "Fixture judge pass.",
      },
      merged: { pass: true, score: row.variant === "baseline" ? 0.7 : 0.9, reason: "deterministic-and-judge-pass" },
    }));
    await writeFile(join(options.runRoot, "judge-results.jsonl"), `${judgeRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
    return { runRoot: options.runRoot, judgeRows, resume: { enabled: Boolean(options.resume), expected: rows.length, existing: 0, skipped: 0, executed: rows.length } };
  };
}

function resultRow({ runId, variant, taskId, elapsedMs, toolEventCount }) {
  return {
    version: 1,
    runId,
    variant,
    taskId,
    trial: 1,
    status: "succeeded",
    elapsedMs,
    artifactDir: `/tmp/${variant}/${taskId}`,
    metrics: { toolEventCount },
    deterministic: { passed: true, failureCategory: null, evidence: ["fixture pass"] },
  };
}

function promotedSearchReport() {
  return {
    report: {
      recommendedVariant: "bootstrap-scripts",
      recommendation: { status: "promote" },
      variants: [{ variant: "bootstrap-scripts", role: "candidate", gate: { status: "promote" } }],
    },
  };
}
