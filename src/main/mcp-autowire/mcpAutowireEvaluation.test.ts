import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFixtures";
import {
  evaluateMcpAutowireRuntimeGate,
  evaluateMcpAutowireDogfoodFixtures,
  mcpAutowireDogfoodFixtureReportMarkdown,
  mcpAutowireEvaluationReportMarkdown,
  mcpAutowireRuntimeGateReportMarkdown,
  mcpAutowireEvaluationTargets,
  mcpAutowirePromotedDogfoodFixtures,
  runMcpAutowireEvaluationMatrix,
  writeMcpAutowireDogfoodFixtureReport,
  writeMcpAutowireEvaluationReport,
  type McpAutowireEvaluationReport,
  type McpAutowireEvaluationTarget,
} from "./mcpAutowireEvaluation";
import type { McpAutowirePlanResult } from "./mcpAutowirePlanner";
import { validateMcpAutowireCandidate, type McpAutowireCandidate } from "./mcpAutowireSchemas";
import { mcpAutowireSixPackEvaluationCandidateForUrl } from "./mcpAutowireSixPackFixtures";

describe("MCP autowire evaluation matrix", () => {
  it("classifies guinea pig fixtures through the same plan and review gate", async () => {
    const targets: McpAutowireEvaluationTarget[] = [
      mcpAutowireEvaluationTargets.find((target) => target.id === "scrapling")!,
      mcpAutowireEvaluationTargets.find((target) => target.id === "context7")!,
      mcpAutowireEvaluationTargets.find((target) => target.id === "ghidramcp")!,
    ];
    const report = await runMcpAutowireEvaluationMatrix({
      providerLabel: "fixture",
      runId: "fixture-run",
      now: new Date("2026-05-22T12:00:00Z"),
      targets,
      planner: async (input) => {
        const fixture = input.targetUrl.includes("Scrapling")
          ? mcpAutowirePhase0Fixtures.scrapling
          : input.targetUrl.includes("GhidraMCP")
            ? mcpAutowirePhase0Fixtures.ghidraMcp
            : mcpAutowirePhase0Fixtures.context7;
        return planResult(input.targetUrl, fixture);
      },
    });

    expect(report.summary).toMatchObject({
      "standard-import-candidate": 1,
      "remote-runtime-candidate": 1,
      "guided-local-candidate": 1,
      "planner-error": 0,
    });
    expect(report.results.map((result) => result.status)).toEqual(["ready", "ready", "deferred"]);
    expect(report.results.map((result) => result.review?.handoff.kind)).toEqual([
      "standard-mcp-import",
      "remote-mcp-proxy",
      "guided-local-bridge",
    ]);
    expect(mcpAutowireEvaluationReportMarkdown(report)).toContain("| Scrapling | guinea-pig | ready | standard-import-candidate | standard-mcp | standard-mcp-import |");
  });

  it("checks promoted live dogfood fixtures against repeatable evaluation results", async () => {
    const report = await runMcpAutowireEvaluationMatrix({
      providerLabel: "fixture",
      runId: "promoted-dogfood-run",
      now: new Date("2026-05-23T12:00:00Z"),
      targets: [mcpAutowireEvaluationTargets.find((target) => target.id === "ghidramcp")!],
      planner: async (input) => planResult(input.targetUrl, mcpAutowirePhase0Fixtures.ghidraMcp),
    });

    const fixtureReport = evaluateMcpAutowireDogfoodFixtures(report, {
      fixtures: mcpAutowirePromotedDogfoodFixtures,
      requireAll: true,
    });
    expect(fixtureReport).toMatchObject({
      evaluated: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
    });
    expect(mcpAutowireDogfoodFixtureReportMarkdown(fixtureReport)).toContain("| GhidraMCP guided local bridge | ghidramcp | passed | 0 |");

    const brokenReport = JSON.parse(JSON.stringify(report)) as McpAutowireEvaluationReport;
    brokenReport.results[0]!.plan!.candidate!.recommendedLane = "standard-mcp";
    brokenReport.results[0]!.review!.handoff.kind = "standard-mcp-import";
    const brokenFixtureReport = evaluateMcpAutowireDogfoodFixtures(brokenReport, {
      fixtures: mcpAutowirePromotedDogfoodFixtures,
      requireAll: true,
    });
    expect(brokenFixtureReport.failed).toBe(1);
    expect(brokenFixtureReport.results[0]!.diagnostics.join("\n")).toContain("Expected lane guided-local-bridge");
    expect(brokenFixtureReport.results[0]!.diagnostics.join("\n")).toContain("Forbidden handoff kind standard-mcp-import");
  });

  it("records planner errors without losing the rest of the matrix", async () => {
    const report = await runMcpAutowireEvaluationMatrix({
      providerLabel: "fixture",
      runId: "error-run",
      targets: [
        mcpAutowireEvaluationTargets.find((target) => target.id === "context7")!,
        mcpAutowireEvaluationTargets.find((target) => target.id === "waypath")!,
      ],
      planner: async (input) => {
        if (input.targetUrl.includes("waypath")) throw new Error("provider unavailable");
        return planResult(input.targetUrl, mcpAutowirePhase0Fixtures.context7);
      },
    });

    expect(report.summary["remote-runtime-candidate"]).toBe(1);
    expect(report.summary["planner-error"]).toBe(1);
    expect(report.results[1]).toMatchObject({
      status: "planner-error",
      promotionSignal: "planner-error",
      issueSummary: ["provider unavailable"],
    });
  });

  it("classifies awesome-mcp search and knowledge-memory corpus fixtures", async () => {
    const targets = ["rippr", "anybrowse", "waypath", "instinct"].map((id) => mcpAutowireEvaluationTargets.find((target) => target.id === id)!);

    const report = await runMcpAutowireEvaluationMatrix({
      providerLabel: "fixture",
      runId: "awesome-corpus-fixture-run",
      now: new Date("2026-05-22T12:00:00Z"),
      targets,
      planner: async (input) => planResult(input.targetUrl, awesomeFixtureForUrl(input.targetUrl)),
    });

    expect(report.targets).toBe(4);
    expect(new Set(report.results.map((result) => result.target.category))).toEqual(new Set(["awesome-search", "awesome-knowledge-memory"]));
    expect(report.summary).toMatchObject({
      "installable-toolhive-registry": 1,
      "standard-import-candidate": 1,
      "needs-more-evidence": 2,
      "planner-error": 0,
    });
    expect(report.results.map((result) => [result.target.id, result.promotionSignal, result.status, result.review?.handoff.kind])).toEqual([
      ["rippr", "standard-import-candidate", "ready", "standard-mcp-import"],
      ["anybrowse", "needs-more-evidence", "blocked", "blocked"],
      ["waypath", "needs-more-evidence", "blocked", "blocked"],
      ["instinct", "installable-toolhive-registry", "ready", "toolhive-registry-install"],
    ]);
    expect(mcpAutowireEvaluationReportMarkdown(report)).toContain("| Instinct | awesome-knowledge-memory | ready | installable-toolhive-registry | standard-mcp | toolhive-registry-install |");
  });

  it("keeps the Awesome MCP six-pack registered as executable evaluation targets", () => {
    const sixPack = mcpAutowireEvaluationTargets.filter((target) => target.category === "awesome-six-pack");

    expect(sixPack.map((target) => target.id)).toEqual([
      "a2asearch",
      "executeautomation-playwright",
      "heventure-search",
      "mcp-nixos",
      "qdrant-mcp",
      "sqlite-explorer-fastmcp",
    ]);
    expect(sixPack.every((target) => target.sourceListUrl === "https://github.com/punkpeye/awesome-mcp-servers")).toBe(true);
    expect(sixPack.find((target) => target.id === "sqlite-explorer-fastmcp")?.instructions).toContain("custom ToolHive source lane");
    expect(sixPack.find((target) => target.id === "qdrant-mcp")?.instructions).toContain("QDRANT_API_KEY should not be required for local mode");
  });

  it("promotes six-pack GitHub source-only servers to the custom source build signal", async () => {
    const target = mcpAutowireEvaluationTargets.find((candidate) => candidate.id === "sqlite-explorer-fastmcp")!;
    const report = await runMcpAutowireEvaluationMatrix({
      providerLabel: "fixture",
      runId: "sqlite-custom-source-run",
      now: new Date("2026-06-08T12:00:00Z"),
      targets: [target],
      planner: async (input) => planResult(input.targetUrl, mcpAutowireSixPackEvaluationCandidateForUrl(input.targetUrl)),
    });

    expect(report.summary).toMatchObject({
      "custom-source-build-candidate": 1,
      "planner-error": 0,
    });
    expect(report.results[0]).toMatchObject({
      status: "deferred",
      promotionSignal: "custom-source-build-candidate",
      review: {
        handoff: {
          kind: "custom-source-build",
          nextToolName: "ambient_mcp_autowire_source_build_describe",
        },
      },
    });
    expect(report.results[0]!.issueSummary.join("\n")).not.toContain("Unexpected promotion signal");
    expect(mcpAutowireEvaluationReportMarkdown(report)).toContain("| SQLite Explorer FastMCP | awesome-six-pack | deferred | custom-source-build-candidate | standard-mcp | custom-source-build |");
  });

  it("derives the six-pack runtime gate from reviewed ToolHive handoffs", async () => {
    const sixPack = mcpAutowireEvaluationTargets.filter((target) => target.category === "awesome-six-pack");
    const report = await runMcpAutowireEvaluationMatrix({
      providerLabel: "fixture",
      runId: "six-pack-runtime-gate",
      now: new Date("2026-06-08T12:30:00Z"),
      targets: sixPack,
      planner: async (input) => planResult(input.targetUrl, mcpAutowireSixPackEvaluationCandidateForUrl(input.targetUrl)),
    });

    const runtimeGate = evaluateMcpAutowireRuntimeGate(report);
    const byId = new Map(runtimeGate.results.map((result) => [result.target.id, result]));

    expect(runtimeGate.summary).toEqual({
      ready: 5,
      deferred: 1,
      blocked: 0,
    });
    expect(byId.get("a2asearch")).toMatchObject({
      status: "ready",
      runtimeLane: "standard-mcp-import",
      toolHiveRunSource: "npx://a2asearch-mcp",
      issues: [],
    });
    expect(byId.get("executeautomation-playwright")).toMatchObject({
      status: "ready",
      toolHiveRunSource: "npx://@executeautomation/playwright-mcp-server",
      runtimeImage: "node:22-alpine",
      issues: [],
    });
    expect(byId.get("heventure-search")).toMatchObject({
      status: "ready",
      toolHiveRunSource: "uvx://heventure-search-mcp",
      issues: [],
    });
    expect(byId.get("mcp-nixos")).toMatchObject({
      status: "ready",
      toolHiveRunSource: "uvx://mcp-nixos",
      issues: [],
    });
    expect(byId.get("qdrant-mcp")).toMatchObject({
      status: "ready",
      toolHiveRunSource: "uvx://mcp-server-qdrant",
      runtimeImage: "python:3.11-slim",
      issues: [],
    });
    expect(byId.get("sqlite-explorer-fastmcp")).toMatchObject({
      status: "deferred",
      runtimeLane: "custom-source-build",
      issues: [expect.stringContaining("pinned custom-image candidate")],
    });
    expect(byId.get("sqlite-explorer-fastmcp")).not.toHaveProperty("toolHiveRunSource");
    expect(mcpAutowireRuntimeGateReportMarkdown(runtimeGate)).toContain("| SQLite Explorer FastMCP | deferred | custom-source-build | custom-source-build | none | none | 1 |");
  });

  it("writes immutable and latest sanitized report artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-autowire-eval-"));
    try {
      const report = await runMcpAutowireEvaluationMatrix({
        providerLabel: "fixture",
        runId: "write-run",
        targets: [mcpAutowireEvaluationTargets.find((target) => target.id === "context7")!],
        planner: async (input) => planResult(input.targetUrl, mcpAutowirePhase0Fixtures.context7),
      });
      const paths = await writeMcpAutowireEvaluationReport(report, root);
      const dogfoodPaths = await writeMcpAutowireDogfoodFixtureReport(evaluateMcpAutowireDogfoodFixtures(report), root);

      await expect(readFile(paths.jsonPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        schemaVersion: "ambient-mcp-autowire-evaluation-v1",
        runId: "write-run",
        results: [{ target: { id: "context7" } }],
      });
      await expect(readFile(join(root, "latest.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        runId: "write-run",
      });
      await expect(readFile(paths.markdownPath, "utf8")).resolves.toContain("# MCP Autowire Evaluation - write-run");
      await expect(readFile(join(root, "latest.md"), "utf8")).resolves.toContain("Context7");
      await expect(readFile(dogfoodPaths.jsonPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        schemaVersion: "ambient-mcp-autowire-dogfood-fixture-report-v1",
        sourceRunId: "write-run",
        skipped: 1,
      });
      await expect(readFile(join(root, "latest.dogfood-fixtures.md"), "utf8")).resolves.toContain("GhidraMCP guided local bridge");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function awesomeFixtureForUrl(targetUrl: string): McpAutowireCandidate {
  if (targetUrl.includes("rippr")) return mcpAutowirePhase0Fixtures.rippr;
  if (targetUrl.includes("anybrowse")) return mcpAutowirePhase0Fixtures.anybrowse;
  if (targetUrl.includes("waypath")) return mcpAutowirePhase0Fixtures.waypath;
  if (targetUrl.includes("instinct")) return mcpAutowirePhase0Fixtures.instinct;
  throw new Error(`No awesome-mcp fixture for ${targetUrl}`);
}

function planResult(targetUrl: string, candidate: McpAutowireCandidate): McpAutowirePlanResult {
  const validation = validateMcpAutowireCandidate(candidate);
  return {
    targetUrl,
    session: {
      id: "mcp-autowire-install-fixture",
      purpose: "mcp-autowire-install",
      targetUrl,
    },
    candidate,
    validation,
    discovery: {
      grants: { urlFetch: true, githubRaw: true, search: true, maxFetches: 6, maxSearches: 2, maxBytesPerFetch: 24_000 },
      suggestedUrls: [],
      fetches: [{ url: targetUrl, status: "fetched", statusCode: 200, returnedChars: 100, totalChars: 100 }],
      searches: [],
      toolProgress: [{ toolCallId: "tool-1", toolName: "ambient_mcp_url_read", status: "done" }],
    },
  };
}
