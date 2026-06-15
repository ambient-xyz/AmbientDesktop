import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aggregateDeterministic,
  aggregateJudge,
  buildDecisionReport,
  buildFailureClusters,
  decidePromotionGate,
  parseReportArgs,
  renderDecisionMarkdown,
  runHarnessReport,
} from "./harness-eval-report.mjs";

describe("meta harness report", () => {
  it("parses report options", () => {
    expect(parseReportArgs(["--run-root", "test-results/harness-evals/run-1", "--min-improvement=0.2", "--min-trials", "2"], {})).toMatchObject({
      runRoot: "test-results/harness-evals/run-1",
      minImprovement: 0.2,
      minTrials: 2,
    });
  });

  it("aggregates deterministic results by variant and task", () => {
    const aggregate = aggregateDeterministic([
      result("baseline", "live-smoke", true, 1000, 10),
      result("baseline", "node-benchmark", false, 3000, 30, "timeout"),
      result("bootstrap-scripts", "live-smoke", true, 800, 7),
      result("bootstrap-scripts", "node-benchmark", true, 1800, 12),
    ]);

    expect(aggregate.get("baseline")).toMatchObject({ evaluated: 2, passed: 1, failed: 1, passRate: 0.5, medianElapsedMs: 2000 });
    expect(aggregate.get("bootstrap-scripts")).toMatchObject({ evaluated: 2, passed: 2, failed: 0, passRate: 1, medianToolEventCount: 9.5 });
    expect(aggregate.get("baseline").tasks["node-benchmark"]).toMatchObject({ failed: 1, passRate: 0 });
  });

  it("aggregates judge rows and concerns", () => {
    const aggregate = aggregateJudge([
      judge("baseline", false, 0, "low", ["timeout"]),
      judge("bootstrap-scripts", true, 0.9, "low", ["minor churn"]),
      { ...judge("bootstrap-scripts", true, 0.7, "medium", ["minor churn"]), status: "invalid", judge: undefined },
    ]);

    expect(aggregate.get("baseline")).toMatchObject({ judged: 1, valid: 1, mergedPassRate: 0, medianScore: 0 });
    expect(aggregate.get("bootstrap-scripts")).toMatchObject({ judged: 2, valid: 1, invalid: 1, mergedPassRate: 1, riskCounts: { low: 1, medium: 0, high: 0 } });
  });

  it("carries mutation policy results into deterministic aggregates", () => {
    const unexpected = result("baseline", "live-smoke", false, 1000, 10, "unexpected-mutation");
    unexpected.deterministic.mutation = {
      evaluated: true,
      passed: false,
      unexpectedPaths: ["notes.txt"],
      allowedPaths: [],
      ignoredPaths: [".ambient/cli-packages/packages.json"],
    };

    const aggregate = aggregateDeterministic([unexpected]);

    expect(aggregate.get("baseline").mutation).toMatchObject({
      checked: 1,
      passed: 0,
      failed: 1,
      unexpectedPaths: ["notes.txt"],
    });
  });

  it("promotes a candidate that matches pass rate and clears the improvement threshold", () => {
    const baseline = aggregateDeterministic([result("baseline", "live-smoke", true, 1000, 10)]).get("baseline");
    const candidate = aggregateDeterministic([result("bootstrap-scripts", "live-smoke", true, 700, 8)]).get("bootstrap-scripts");

    expect(
      decidePromotionGate({
        variant: "bootstrap-scripts",
        baselineVariant: "baseline",
        deterministic: candidate,
        baseline,
        minImprovement: 0.1,
        minTrials: 1,
      }),
    ).toMatchObject({ status: "promote" });
  });

  it("rejects candidates with mutation policy failures", () => {
    const baseline = aggregateDeterministic([result("baseline", "live-smoke", true, 1000, 10)]).get("baseline");
    const candidateRow = result("bootstrap-scripts", "live-smoke", true, 700, 8);
    candidateRow.deterministic.mutation = {
      evaluated: true,
      passed: false,
      unexpectedPaths: ["notes.txt"],
      allowedPaths: ["src/calculator.js"],
      ignoredPaths: [],
    };
    const candidate = aggregateDeterministic([candidateRow]).get("bootstrap-scripts");

    const gate = decidePromotionGate({
      variant: "bootstrap-scripts",
      baselineVariant: "baseline",
      deterministic: candidate,
      baseline,
      minImprovement: 0.1,
      minTrials: 1,
    });

    expect(gate).toMatchObject({ status: "reject", severity: "error" });
    expect(gate.reasons.join(" ")).toContain("mutation-policy failure");
    expect(gate.reasons.join(" ")).toContain("notes.txt");
  });

  it("rejects candidates missing expected task coverage", () => {
    const report = buildDecisionReport({
      config: { runId: "run-coverage", tasks: ["live-smoke", "node-benchmark"], trials: 1 },
      runRoot: "/tmp/run-coverage",
      baselineVariant: "baseline",
      minImprovement: 0.1,
      minTrials: 1,
      generatedAt: "2026-05-09T00:00:00.000Z",
      results: [
        result("baseline", "live-smoke", true, 1000, 10),
        result("baseline", "node-benchmark", true, 1200, 12),
        result("bootstrap-scripts", "live-smoke", true, 700, 8),
      ],
      judgeRows: [judge("baseline", true, 0.7, "low", []), judge("bootstrap-scripts", true, 0.9, "low", [])],
    });
    const candidate = report.variants.find((variant) => variant.variant === "bootstrap-scripts");
    const markdown = renderDecisionMarkdown(report);

    expect(candidate.gate).toMatchObject({ status: "reject", severity: "error" });
    expect(candidate.coverage).toMatchObject({ complete: false, missingTrialCount: 1, expectedTrialCount: 2 });
    expect(candidate.gate.reasons.join(" ")).toContain("Coverage incomplete");
    expect(report.recommendedVariant).toBe("baseline");
    expect(markdown).toContain("Coverage Breakdown");
    expect(markdown).toContain("node-benchmark");
  });

  it("rejects deterministic regressions even when a judge score is high", () => {
    const baseline = aggregateDeterministic([result("baseline", "live-smoke", true, 1000, 10)]).get("baseline");
    const candidate = aggregateDeterministic([result("bootstrap-scripts", "live-smoke", false, 700, 8, "script-failed")]).get("bootstrap-scripts");

    expect(
      decidePromotionGate({
        variant: "bootstrap-scripts",
        baselineVariant: "baseline",
        deterministic: candidate,
        judge: aggregateJudge([judge("bootstrap-scripts", true, 1, "low", [])]).get("bootstrap-scripts"),
        baseline,
        minImprovement: 0.1,
        minTrials: 1,
      }),
    ).toMatchObject({ status: "reject" });
  });

  it("builds failure clusters", () => {
    expect(
      buildFailureClusters([
        result("baseline", "node-benchmark", false, 1000, 10, "timeout"),
        result("bootstrap-scripts", "node-benchmark", false, 1000, 10, "timeout"),
        result("bootstrap-scripts", "live-smoke", false, 1000, 10, "script-failed"),
      ]),
    ).toEqual([
      expect.objectContaining({ taskId: "node-benchmark", failureCategory: "timeout", count: 2 }),
      expect.objectContaining({ taskId: "live-smoke", failureCategory: "script-failed", count: 1 }),
    ]);
  });

  it("builds and renders a decision report", () => {
    const report = buildDecisionReport({
      config: { runId: "run-1" },
      runRoot: "/tmp/run-1",
      baselineVariant: "baseline",
      minImprovement: 0.1,
      minTrials: 1,
      generatedAt: "2026-05-09T00:00:00.000Z",
      results: [result("baseline", "live-smoke", true, 1000, 10), result("bootstrap-scripts", "live-smoke", true, 800, 8)],
      judgeRows: [judge("baseline", true, 0.7, "low", []), judge("bootstrap-scripts", true, 0.9, "low", [])],
    });
    const markdown = renderDecisionMarkdown(report);

    expect(report.recommendedVariant).toBe("bootstrap-scripts");
    expect(report.variants.find((variant) => variant.variant === "bootstrap-scripts").gate.status).toBe("promote");
    expect(markdown).toContain("Meta-Harness Decision Report");
    expect(markdown).toContain("| Variant | Gate | Det Pass | Judge Pass | Coverage | Mutation |");
    expect(markdown).toContain("complete expected task/trial coverage");
    expect(markdown).toContain("zero mutation-policy failures");
    expect(markdown).toContain("bootstrap-scripts");
  });

  it("writes JSON and markdown reports from run artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-harness-report-"));
    try {
      const runRoot = join(root, "run-1");
      await mkdir(runRoot, { recursive: true });
      await writeFile(join(runRoot, "config.json"), JSON.stringify({ runId: "run-1" }), "utf8");
      await writeFile(
        join(runRoot, "results.jsonl"),
        [result("baseline", "live-smoke", true, 1000, 10), result("bootstrap-scripts", "live-smoke", true, 700, 8)].map(JSON.stringify).join("\n") + "\n",
        "utf8",
      );
      await writeFile(join(runRoot, "judge-results.jsonl"), [judge("baseline", true, 0.7, "low", []), judge("bootstrap-scripts", true, 0.9, "low", [])].map(JSON.stringify).join("\n") + "\n", "utf8");

      const output = await runHarnessReport({
        runRoot,
        baseline: "baseline",
        outputJson: "decision-report.json",
        outputMarkdown: "decision-report.md",
        minImprovement: 0.1,
        minTrials: 1,
        cwd: root,
      });

      expect(output.report.recommendedVariant).toBe("bootstrap-scripts");
      expect(JSON.parse(await readFile(join(runRoot, "decision-report.json"), "utf8")).recommendedVariant).toBe("bootstrap-scripts");
      expect(await readFile(join(runRoot, "decision-report.md"), "utf8")).toContain("Variant Frontier");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function result(variant, taskId, passed, elapsedMs, toolEventCount, failureCategory = null) {
  return {
    version: 1,
    runId: "run-1",
    variant,
    taskId,
    trial: 1,
    status: passed ? "succeeded" : "failed",
    elapsedMs,
    artifactDir: `/tmp/${variant}/${taskId}`,
    metrics: { toolEventCount },
    deterministic: {
      passed,
      failureCategory,
      evidence: passed ? ["child process exited with code 0"] : [`failed: ${failureCategory}`],
    },
  };
}

function judge(variant, pass, score, risk, concerns) {
  return {
    version: 1,
    runId: "run-1",
    candidateLabel: variant === "baseline" ? "candidate_a" : "candidate_b",
    variant,
    taskId: "live-smoke",
    trial: 1,
    status: "valid",
    deterministicPassed: pass,
    judge: {
      pass,
      score,
      failureCategory: pass ? null : "timeout",
      unrelatedMutationRisk: risk,
      toolUseCoherence: pass ? "strong" : "poor",
      contractAdherence: pass ? "strong" : "poor",
      deterministicAgreement: "agrees",
      concerns,
      conciseRationale: "Fixture judge row.",
    },
    validationErrors: [],
    merged: {
      pass,
      score,
      reason: pass ? "deterministic-and-judge-pass" : "deterministic-fail",
    },
  };
}
