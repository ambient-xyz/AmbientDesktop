import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runWorkflowCompilerBenchmarks,
  workflowCompilerFailurePhaseFromDiagnostics,
} from "./workflowCompilerMetrics";

describe("workflow compiler benchmark metrics", () => {
  it("runs deterministic compiler benchmark fixtures and writes JSON/Markdown reports", async () => {
    const { summary, paths } = await runWorkflowCompilerBenchmarks({
      outputDir: join(process.cwd(), "test-results", "workflow-compiler-bench"),
      generatedAt: process.env.AMBIENT_WORKFLOW_COMPILER_BENCHMARK_GENERATED_AT ?? "2026-05-15T00:00:00.000Z",
    });

    expect(summary).toMatchObject({
      schemaVersion: 1,
      caseCount: 6,
      failedCount: 0,
      totals: {
        piCallCount: 0,
        retryCount: 0,
        patchCount: 0,
      },
    });
    expect(summary.passedCount).toBe(summary.caseCount);
    expect(summary.totals.generatedSourceBytes).toBeGreaterThan(0);
    expect(summary.cases.map((item) => item.id)).toEqual([
      "linear-browser-qa",
      "parallel-multi-source-research",
      "bounded-connector-fanout",
      "file-read-report",
      "ambient-cli",
      "google-drive-read-only",
    ]);
    expect(summary.cases.every((item) => item.staticPassMs >= 0 && item.dryRunMs >= 0 && item.irNodeCount > 0)).toBe(true);
    expect(paths?.jsonPath && existsSync(paths.jsonPath)).toBe(true);
    expect(paths?.markdownPath && existsSync(paths.markdownPath)).toBe(true);
    await expect(readFile(paths!.markdownPath, "utf8")).resolves.toContain("Workflow Compiler Benchmark");
  });

  it("classifies compile diagnostics into failed benchmark phases", () => {
    expect(workflowCompilerFailurePhaseFromDiagnostics([{ code: "budget.max_tool_calls_too_low", severity: "error", message: "bad", path: "/budgets" }])).toBe(
      "static_validation",
    );
    expect(workflowCompilerFailurePhaseFromDiagnostics([{ code: "dry_run.runtime_error", severity: "error", message: "bad", path: "/source" }])).toBe("dry_run");
    expect(workflowCompilerFailurePhaseFromDiagnostics(undefined)).toBe("unknown");
  });
});
