import { describe, expect, it } from "vitest";
import { mcpAutowirePhase0Fixtures, mcpKatzillaInstallFailureReplay } from "./mcpAutowireFixtures";
import { registryInfoToAutowireCandidate } from "./mcpAutowireMcpInstallFacade";
import { mcpAutowireReviewResultText, reviewMcpAutowireCandidate } from "./mcpAutowireReview";
import type { McpAutowireCandidate } from "./mcpAutowireSchemas";

describe("MCP autowire review", () => {
  it("hands registry-backed standard MCP candidates to the existing ToolHive registry install path", () => {
    const candidate = registryInfoToAutowireCandidate({
      name: "io.github.stacklok/context7",
      title: "Context7",
      description: "Up-to-date code docs for any prompt",
      repository_url: "https://github.com/upstash/context7",
      image: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
      transport: "stdio",
      tools: ["resolve-library-id", "query-docs"],
      permissions: {
        network: {
          outbound: {
            allow_host: ["context7.com"],
            allow_port: [443],
          },
        },
      },
      env_vars: [
        {
          name: "CONTEXT7_API_KEY",
          description: "Optional API key",
          secret: true,
          required: false,
        },
      ],
    });
    const result = reviewMcpAutowireCandidate({ candidate });

    expect(result.handoff).toMatchObject({
      kind: "toolhive-registry-install",
      status: "ready",
      nextToolName: "ambient_mcp_server_describe",
      nextToolInput: { serverId: "io.github.stacklok/context7" },
    });
    expect(result.review.blockers).toEqual([]);
    expect(result.review.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Optional secret CONTEXT7_API_KEY is not bound"),
    ]));
    expect(mcpAutowireReviewResultText(result)).toContain("Next tool: ambient_mcp_server_describe");
  });

  it("hands supported non-registry standard MCP candidates to the Standard MCP import path", () => {
    const result = reviewMcpAutowireCandidate({ candidate: mcpAutowirePhase0Fixtures.scrapling });

    expect(result.handoff).toMatchObject({
      kind: "standard-mcp-import",
      status: "ready",
      outcome: "ready",
      nextToolName: "ambient_mcp_standard_import_describe",
    });
    expect(result.review.blockers).toEqual([]);
    expect(result.review.outcome).toBe("ready");
    expect(result.review.warnings.map((warning) => warning)).toEqual(expect.arrayContaining([
      expect.stringContaining("network.broad_review"),
      expect.stringContaining("package.unpinned"),
    ]));
    expect(mcpAutowireReviewResultText(result)).toContain("Next tool: ambient_mcp_standard_import_describe");
  });

  it("defers MCPB candidates until ToolHive MCPB run support is validated", () => {
    const candidate = mcpbScraplingCandidate();
    const result = reviewMcpAutowireCandidate({ candidate });

    expect(result.handoff).toMatchObject({
      kind: "standard-mcp-import-deferred",
      status: "deferred",
      outcome: "deferred-unsupported-lane",
    });
    expect(result.handoff.nextToolName).toBeUndefined();
    expect(result.review.outcome).toBe("deferred-unsupported-lane");
    expect(result.review.blockers).toEqual([]);
    expect(mcpAutowireReviewResultText(result)).toContain("Next tool: none");
    expect(mcpAutowireReviewResultText(result)).toContain("Ambient has not connected that import lane to execution yet");
  });

  it("hands GitHub source-only MCP candidates to the custom ToolHive source build review", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
    candidate.id = "sqlite-explorer-fastmcp-source";
    candidate.displayName = "SQLite Explorer FastMCP";
    candidate.source = {
      kind: "github",
      url: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
      packageName: "sqlite-explorer-fastmcp-mcp-server",
      evidenceRefs: ["sqlite-readme"],
    };
    candidate.runtime = {
      provider: "toolhive",
      sourceKind: "unknown",
      transport: "stdio",
      evidenceRefs: ["sqlite-readme"],
    };
    candidate.evidence = [{
      id: "sqlite-readme",
      type: "readme",
      locator: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
      summary: "README describes a GitHub-only FastMCP SQLite server source.",
    }];
    candidate.permissions = {
      network: { mode: "disabled", allowHosts: [], allowPorts: [] },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["sqlite-readme"],
    };
    candidate.validationPlan = {
      preflights: ["toolhive-runtime", "container-runtime"],
      expectedTools: ["query"],
      evidenceRefs: ["sqlite-readme"],
    };
    candidate.openQuestions = [];
    candidate.riskSummary = {
      level: "medium",
      reasons: ["GitHub-only source needs a reviewed custom ToolHive source build."],
      evidenceRefs: ["sqlite-readme"],
    };

    const result = reviewMcpAutowireCandidate({ candidate });

    expect(result.handoff).toMatchObject({
      kind: "custom-source-build",
      status: "deferred",
      outcome: "deferred-unsupported-lane",
      nextToolName: "ambient_mcp_autowire_source_build_describe",
      forbiddenAlternatives: expect.arrayContaining([
        expect.stringContaining("unmanaged local bridge"),
      ]),
    });
    expect(result.review.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("toolhive.package_required"),
      expect.stringContaining("lane.unsupported_standard_source"),
    ]));
    expect(mcpAutowireReviewResultText(result)).toContain("Next tool: ambient_mcp_autowire_source_build_describe");
    expect(mcpAutowireReviewResultText(result)).toContain("Forbidden alternatives");
  });

  it("hands supported remote MCP candidates to the ToolHive remote proxy path and keeps guided local bridge deferred", () => {
    const remote = reviewMcpAutowireCandidate({ candidate: mcpAutowirePhase0Fixtures.context7 });
    expect(remote.handoff).toMatchObject({
      kind: "remote-mcp-proxy",
      status: "ready",
      outcome: "ready",
      nextToolName: "ambient_mcp_remote_proxy_describe",
    });
    expect(remote.review.blockers).toEqual([]);

    const guided = reviewMcpAutowireCandidate({ candidate: mcpAutowirePhase0Fixtures.ghidraMcp });
    expect(guided.handoff).toMatchObject({
      kind: "guided-local-bridge",
      status: "deferred",
      outcome: "guided-setup-required",
      nextToolName: "ambient_mcp_guided_bridge_describe",
    });
    expect(guided.review.blockers.join("\n")).toContain("open_question.blocks_install");
    expect(guided.review.blockers.join("\n")).not.toContain("guided-local-bridge");
    expect(mcpAutowireReviewResultText(guided)).toContain("Next tool: ambient_mcp_guided_bridge_describe");
  });

  it("keeps the Katzilla replay on Standard MCP import instead of host bridge fallback", () => {
    const result = reviewMcpAutowireCandidate({
      candidate: mcpKatzillaInstallFailureReplay.candidate,
      secretBindings: [{ envName: "KATZILLA_API_KEY", secretRef: `ambient-secret-ref:v1:${"a".repeat(64)}` }],
    });

    expect(result.handoff).toMatchObject({
      kind: "standard-mcp-import",
      status: "ready",
      nextToolName: "ambient_mcp_standard_import_describe",
    });
    const text = mcpAutowireReviewResultText(result);
    expect(text).toContain("Next tool: ambient_mcp_standard_import_describe");
    expect(text).not.toContain("ambient_mcp_guided_bridge_register");
    expect(text).not.toContain("supergateway");
  });

  it("blocks stale candidate hashes and undeclared secret bindings", () => {
    const result = reviewMcpAutowireCandidate({
      candidate: mcpAutowirePhase0Fixtures.context7,
      expectedCandidateHash: "stale",
      secretBindings: [{ envName: "NOT_DECLARED", secretRef: "ambient-secret://bad/ref" }],
    });

    expect(result.review.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("Candidate hash mismatch"),
      expect.stringContaining("Secret binding NOT_DECLARED is not declared"),
    ]));
    expect(result.handoff.status).toBe("blocked");
  });
});

function mcpbScraplingCandidate(): McpAutowireCandidate {
  const candidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
  candidate.id = "scrapling-github-mcpb";
  candidate.displayName = "Scrapling MCPB Package";
  candidate.runtime.sourceKind = "mcpb";
  candidate.runtime.package = {
    registryType: "mcpb",
    identifier: "scrapling.mcpb",
    version: "0.1.0",
    runtimeHint: "mcpb",
    packageArguments: [],
  };
  candidate.validationPlan.preflights = ["toolhive-version", "container-runtime", "mcpb-run-support", "mcp-tool-discovery"];
  candidate.evidence.push({
    id: "scrapling-mcpb",
    type: "server-json",
    locator: "https://github.com/D4Vinci/Scrapling/releases",
    summary: "Fixture evidence says an MCPB package exists, but Ambient has not validated ToolHive MCPB execution.",
  });
  candidate.runtime.evidenceRefs = ["scrapling-mcpb"];
  return candidate;
}
