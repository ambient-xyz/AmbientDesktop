import { describe, expect, it } from "vitest";
import {
  evaluateMcpAutowireInitialSixPackGate,
  mcpAutowireInitialSixPackGateCases,
  mcpAutowireInitialSixPackGateReportMarkdown,
  mcpAutowireInitialSixPackTargetIds,
  type McpAutowireInitialSixPackGateCase,
} from "./mcpAutowireInitialSixPackFixtures";

describe("MCP autowire initial six-pack release gate", () => {
  it("registers the live-promoted initial six candidates in deterministic order", () => {
    expect(mcpAutowireInitialSixPackGateCases.map((testCase) => testCase.id)).toEqual([...mcpAutowireInitialSixPackTargetIds]);
    expect(mcpAutowireInitialSixPackGateCases.map((testCase) => testCase.targetUrl)).toEqual([
      "https://github.com/freema/firefox-devtools-mcp",
      "https://github.com/zcaceres/fetch-mcp",
      "https://github.com/alanpcf/brasil-data-mcp",
      "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/filesystem",
      "https://github.com/ofershap/mcp-server-sqlite",
      "https://github.com/Ratnaditya-J/csvglow",
    ]);
    expect(mcpAutowireInitialSixPackGateCases.every((testCase) => testCase.genericPrompt.includes("Install this MCP"))).toBe(true);
  });

  it("keeps the promoted install shapes ToolHive-wrapped, approval-gated, and restart-persistent", () => {
    const report = evaluateMcpAutowireInitialSixPackGate(mcpAutowireInitialSixPackGateCases, new Date("2026-06-10T12:00:00Z"));
    const byId = new Map(report.results.map((result) => [result.caseId, result]));

    expect(report).toMatchObject({
      cases: 6,
      passed: 6,
      failed: 0,
    });
    expect(byId.get("firefox-devtools-mcp")?.diagnostics).toEqual([]);
    expect(byId.get("server-filesystem")?.diagnostics).toEqual([]);
    expect(byId.get("mcp-server-sqlite")?.diagnostics).toEqual([]);
    expect(mcpAutowireInitialSixPackGateReportMarkdown(report)).toContain("| csvglow | csvglow | passed | 0 |");
  });

  it("encodes the important non-brittle affordances from the live gates", () => {
    const byId = new Map(mcpAutowireInitialSixPackGateCases.map((testCase) => [testCase.id, testCase]));

    expect(byId.get("firefox-devtools-mcp")?.releaseContract).toMatchObject({
      serverId: "mozilla-firefox-devtools-mcp-standard-mcp",
      toolHiveRunSource: "npx://@mozilla/firefox-devtools-mcp",
      sameNameReplacement: true,
      rawToolHiveFallbackAllowed: false,
    });
    expect(byId.get("fetch-mcp")?.candidate.permissions.network).toMatchObject({
      mode: "allowlist",
      allowHosts: ["example.com"],
    });
    expect(byId.get("brasil-data-mcp")?.candidate.permissions.network.allowHosts).toEqual(["brasilapi.com.br"]);
    expect(byId.get("server-filesystem")?.expected).toMatchObject({
      networkMode: "disabled",
      serverArgs: ["/projects/filesystem-fixture"],
      volumes: [{ containerPath: "/projects/filesystem-fixture", mode: "ro", hostPathIncludes: "filesystem-fixture" }],
    });
    expect(byId.get("mcp-server-sqlite")?.releaseContract.sourceBuildRecovery).toMatchObject({
      failedRunSource: "npx://mcp-sqlite-server",
      resolvedCommit: "a3b0323ce23521190572460dff944722b0036b3c",
      imageDigest: "sha256:871526d5b0cad8f1f237fccb9337d614870972eec0feaeff695831ba4ab2f053",
    });
    expect(byId.get("csvglow")?.releaseContract.managedFileExchange).toMatchObject({
      containerPath: "/ambient/mcp-files",
      workspaceOutputPrefix: ".ambient/mcp-outputs/",
      clickableArtifactRequired: true,
    });
  });

  it("fails when a case allows raw ToolHive fallback or loses restart persistence", () => {
    const broken = JSON.parse(JSON.stringify(mcpAutowireInitialSixPackGateCases)) as McpAutowireInitialSixPackGateCase[];
    broken[0]!.releaseContract.rawToolHiveFallbackAllowed = true;
    broken[0]!.releaseContract.restartPersistenceRequired = false;

    const report = evaluateMcpAutowireInitialSixPackGate(broken, new Date("2026-06-10T12:00:00Z"));

    expect(report.failed).toBe(1);
    expect(report.results[0]?.diagnostics).toEqual(expect.arrayContaining([
      "Release contract must forbid raw ToolHive fallback.",
      "Release contract must require restart persistence.",
    ]));
  });

  it("fails when permission minimization regresses for fixed-host servers", () => {
    const broken = JSON.parse(JSON.stringify(mcpAutowireInitialSixPackGateCases)) as McpAutowireInitialSixPackGateCase[];
    const brasil = broken.find((testCase) => testCase.id === "brasil-data-mcp")!;
    brasil.candidate.permissions.network.allowHosts.push("glama.ai");

    const report = evaluateMcpAutowireInitialSixPackGate(broken, new Date("2026-06-10T12:00:00Z"));

    expect(report.failed).toBe(1);
    expect(report.results.find((result) => result.caseId === "brasil-data-mcp")?.diagnostics).toContain("Forbidden allow host glama.ai is present.");
  });
});
