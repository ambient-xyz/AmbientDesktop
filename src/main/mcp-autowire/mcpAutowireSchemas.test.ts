import { describe, expect, it } from "vitest";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFixtures";
import {
  MCP_INSTALL_REVIEW_SCHEMA_VERSION,
  MCP_TOOL_SNAPSHOT_SCHEMA_VERSION,
  TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
  mcpAutowireCandidateJsonSchema,
  mcpAutowireCandidatePromptSchema,
  parseMcpInstallReview,
  parseMcpToolSnapshot,
  parseToolHiveRunPlan,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
} from "./mcpAutowireSchemas";

describe("MCP autowire phase 0 schemas", () => {
  it("validates the guinea pig and awesome-mcp corpus fixtures with deterministic status", () => {
    const scrapling = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.scrapling);
    expect(scrapling.status).toBe("ready-for-review");
    expect(scrapling.outcome).toBe("ready");
    expect(scrapling.readyForToolHiveRun).toBe(false);
    expect(scrapling.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining(["network.broad_review", "package.unpinned", "source.unpinned_github"]));

    const context7 = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.context7);
    expect(context7.status).toBe("ready-for-review");
    expect(context7.outcome).toBe("ready");
    expect(context7.readyForToolHiveRun).toBe(false);
    expect(context7.blockers).toEqual([]);

    const ghidra = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.ghidraMcp);
    expect(ghidra.status).toBe("guided-setup");
    expect(ghidra.outcome).toBe("guided-setup-required");
    expect(ghidra.readyForToolHiveRun).toBe(false);
    expect(ghidra.blockers.map((issue) => issue.code)).toContain("open_question.blocks_install");

    const awesomeSearch = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.awesomeMcpSearchSeed);
    expect(awesomeSearch.status).toBe("blocked");
    expect(awesomeSearch.outcome).toBe("needs-evidence");
    expect(awesomeSearch.blockers.map((issue) => issue.code)).toEqual(expect.arrayContaining(["lane.exploratory_not_installable", "open_question.blocks_install"]));

    const awesomeMemory = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.awesomeMcpKnowledgeMemorySeed);
    expect(awesomeMemory.status).toBe("blocked");
    expect(awesomeMemory.outcome).toBe("needs-evidence");
    expect(awesomeMemory.blockers.map((issue) => issue.code)).toEqual(expect.arrayContaining(["lane.exploratory_not_installable", "open_question.blocks_install"]));
  });

  it("blocks evidence refs that are missing from the evidence table", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.context7) as McpAutowireCandidate;
    candidate.runtime.evidenceRefs = ["missing-evidence"];

    const report = validateMcpAutowireCandidate(candidate);

    expect(report.status).toBe("blocked");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "evidence.unknown_ref",
          path: "$.runtime.evidenceRefs",
        }),
      ]),
    );
  });

  it("keeps secret values out of candidate descriptors", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.context7) as Record<string, unknown>;
    const secrets = candidate.secrets as Array<Record<string, unknown>>;
    secrets[0].value = "should-never-be-here";

    const report = validateMcpAutowireCandidate(candidate);

    expect(report.status).toBe("blocked");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "schema.invalid",
          path: "$.secrets.0",
        }),
      ]),
    );
  });

  it("blocks install-lane and runtime provider mismatches", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.context7) as McpAutowireCandidate;
    candidate.recommendedLane = "standard-mcp";

    const report = validateMcpAutowireCandidate(candidate);

    expect(report.status).toBe("blocked");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "lane.provider_mismatch",
          path: "$.runtime.provider",
        }),
      ]),
    );
  });

  it("blocks broad host filesystem mounts", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.context7) as McpAutowireCandidate;
    candidate.permissions.filesystem.extraMounts.push({ path: "/Users", mode: "read-only", purpose: "bad broad mount" });

    const report = validateMcpAutowireCandidate(candidate);

    expect(report.status).toBe("blocked");
    expect(report.blockers.map((issue) => issue.code)).toContain("filesystem.broad_mount");
  });

  it("exposes a prompt-ready JSON schema for Ambient/Pi structured candidate generation", () => {
    expect(mcpAutowireCandidatePromptSchema()).toBe(mcpAutowireCandidateJsonSchema);
    expect(mcpAutowireCandidateJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { const: "ambient-mcp-autowire-v1" },
        recommendedLane: { enum: expect.arrayContaining(["standard-mcp", "remote-mcp", "cli-wrapper", "guided-local-bridge", "exploratory"]) },
        runtime: {
          properties: {
            package: {
              properties: {
                entrypoint: {
                  properties: {
                    kind: { enum: expect.arrayContaining(["default", "package-bin", "module"]) },
                  },
                },
                packageArguments: {
                  items: {
                    properties: {
                      type: { enum: expect.arrayContaining(["positional", "flag", "switch", "env", "unknown"]) },
                    },
                  },
                },
              },
            },
            updatePolicy: {
              properties: {
                mode: { enum: expect.arrayContaining(["pinned", "managed-browser-security", "user-managed-runtime", "unverified"]) },
              },
            },
          },
        },
      },
    });
  });

  it("requires a managed update policy for installable browser-class runtimes", () => {
    const missingPolicy = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
    delete missingPolicy.runtime.updatePolicy;

    const missingReport = validateMcpAutowireCandidate(missingPolicy);

    expect(missingReport.status).toBe("blocked");
    expect(missingReport.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "runtime.browser_update_policy_required",
        path: "$.runtime.updatePolicy",
      }),
    ]));

    const pinnedBrowser = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
    pinnedBrowser.runtime.updatePolicy = {
      mode: "pinned",
      reason: "Incorrectly pins the browser engine instead of using the managed browser update lane.",
      evidenceRefs: ["scrapling-readme"],
    };

    const pinnedReport = validateMcpAutowireCandidate(pinnedBrowser);

    expect(pinnedReport.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "runtime.browser_managed_update_required",
        path: "$.runtime.updatePolicy.mode",
      }),
    ]));
  });

  it("allows non-browser installable runtimes to omit a browser update policy", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.context7) as McpAutowireCandidate;
    delete candidate.runtime.updatePolicy;

    const report = validateMcpAutowireCandidate(candidate);

    expect(report.status).toBe("ready-for-review");
    expect(report.blockers.map((issue) => issue.code)).not.toContain("runtime.browser_update_policy_required");
  });

  it("allows only pinned source-built custom images through the ToolHive lane", () => {
    const missingDigest = sourceBuiltCustomImageCandidate();
    delete missingDigest.runtime.package!.digest;

    const missingDigestReport = validateMcpAutowireCandidate(missingDigest);

    expect(missingDigestReport.status).toBe("blocked");
    expect(missingDigestReport.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "toolhive.custom_image_source_build_required",
        path: "$.runtime.sourceKind",
      }),
    ]));

    const missingCommit = sourceBuiltCustomImageCandidate();
    delete missingCommit.source.resolvedCommit;

    const missingCommitReport = validateMcpAutowireCandidate(missingCommit);

    expect(missingCommitReport.status).toBe("blocked");
    expect(missingCommitReport.blockers.map((issue) => issue.code)).toContain("toolhive.custom_image_source_build_required");

    const ready = validateMcpAutowireCandidate(sourceBuiltCustomImageCandidate());

    expect(ready.status).toBe("ready-for-review");
    expect(ready.outcome).toBe("ready");
    expect(ready.readyForToolHiveRun).toBe(true);
    expect(ready.blockers).toEqual([]);
  });

  it("requires Remote MCP proxy candidates to match the ToolHive endpoint, auth, and network shape", () => {
    const base = structuredClone(mcpAutowirePhase0Fixtures.context7) as McpAutowireCandidate;
    expect(validateMcpAutowireCandidate(base).blockers).toEqual([]);

    const cases: Array<{
      name: string;
      mutate: (candidate: McpAutowireCandidate) => void;
      code: string;
      path: string;
    }> = [
      {
        name: "broad network mode",
        mutate: (candidate) => {
          candidate.permissions.network.mode = "broad";
          candidate.permissions.network.justification = "Bad remote proxy broad egress.";
        },
        code: "remote_mcp.allowlist_required",
        path: "$.permissions.network.mode",
      },
      {
        name: "host mismatch",
        mutate: (candidate) => {
          candidate.permissions.network.allowHosts = ["context7.com"];
        },
        code: "remote_mcp.host_allowlist_mismatch",
        path: "$.permissions.network.allowHosts",
      },
      {
        name: "port mismatch",
        mutate: (candidate) => {
          candidate.permissions.network.allowPorts = [8443];
        },
        code: "remote_mcp.port_allowlist_mismatch",
        path: "$.permissions.network.allowPorts",
      },
      {
        name: "insecure endpoint",
        mutate: (candidate) => {
          candidate.runtime.remote = { ...candidate.runtime.remote!, url: "http://mcp.context7.com/mcp" };
        },
        code: "remote_mcp.https_required",
        path: "$.runtime.remote.url",
      },
      {
        name: "private endpoint",
        mutate: (candidate) => {
          candidate.runtime.remote = { ...candidate.runtime.remote!, url: "https://127.0.0.1:8080/mcp" };
          candidate.permissions.network.allowHosts = ["127.0.0.1"];
          candidate.permissions.network.allowPorts = [8080];
        },
        code: "remote_mcp.public_host_required",
        path: "$.runtime.remote.url",
      },
      {
        name: "unsupported proxy header",
        mutate: (candidate) => {
          candidate.runtime.remote = { ...candidate.runtime.remote!, headers: ["Authorization", "X-API-Key"] };
        },
        code: "remote_mcp.unsupported_header",
        path: "$.runtime.remote.headers",
      },
    ];

    for (const entry of cases) {
      const candidate = structuredClone(base) as McpAutowireCandidate;
      entry.mutate(candidate);

      const report = validateMcpAutowireCandidate(candidate);

      expect(report.status, entry.name).toBe("blocked");
      expect(report.blockers, entry.name).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: entry.code,
          path: entry.path,
        }),
      ]));
    }
  });

  it("parses the downstream run-plan, review, and tool-snapshot schemas", () => {
    expect(parseToolHiveRunPlan({
      schemaVersion: TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
      serverId: "scrapling",
      workloadName: "ambient-scrapling-abc123",
      group: "ambient",
      isolateNetwork: true,
      permissionProfilePath: "/tmp/ambient/toolhive/scrapling.permissions.json",
      sourceRef: "server-json:https://github.com/D4Vinci/Scrapling",
      transport: "stdio",
      envSecretRefs: [],
      evidenceRefs: ["scrapling-server-json"],
    })).toMatchObject({ group: "ambient", isolateNetwork: true });

    expect(parseMcpInstallReview({
      schemaVersion: MCP_INSTALL_REVIEW_SCHEMA_VERSION,
      candidateId: "context7-remote-mcp",
      title: "Install Context7",
      recommendedLane: "remote-mcp",
      outcome: "deferred-unsupported-lane",
      summary: "Remote MCP documentation lookup.",
      sourceSummary: "GitHub source plus server metadata.",
      runtimeSummary: "Remote streamable HTTP MCP endpoint.",
      permissionSummary: "Network allowlist for mcp.context7.com.",
      secretSummary: "Optional CONTEXT7_API_KEY.",
      validationSummary: "Discover resolve-library-id and query-docs.",
      blockers: [],
      warnings: [],
      evidenceRefs: ["context7-server-json"],
    })).toMatchObject({ candidateId: "context7-remote-mcp" });

    expect(parseMcpToolSnapshot({
      schemaVersion: MCP_TOOL_SNAPSHOT_SCHEMA_VERSION,
      serverId: "context7",
      capturedAt: "2026-05-22T00:00:00.000Z",
      descriptorHash: "hash",
      tools: [
        {
          name: "resolve-library-id",
          description: "Resolve a library name.",
          inputSchema: { type: "object" },
        },
      ],
    })).toMatchObject({ serverId: "context7", tools: [expect.objectContaining({ name: "resolve-library-id" })] });
  });
});

function sourceBuiltCustomImageCandidate(): McpAutowireCandidate {
  return {
    schemaVersion: "ambient-mcp-autowire-v1",
    id: "source-built-katzilla-mcp",
    displayName: "Source Built Katzilla MCP",
    source: {
      kind: "github",
      url: "https://github.com/codeislaw101/katzilla-sdk",
      resolvedCommit: "abc1234deadbeef",
      packageName: "@katzilla/mcp",
      evidenceRefs: ["source-build-review"],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "custom-image",
      transport: "stdio",
      package: {
        registryType: "oci",
        identifier: "ambient-source-built/katzilla-mcp:abc1234",
        digest: `sha256:${"c".repeat(64)}`,
        packageArguments: [],
      },
      updatePolicy: {
        mode: "pinned",
        reason: "Built from a reviewed source commit into a local OCI image with a recorded digest.",
        evidenceRefs: ["source-build-review"],
      },
      evidenceRefs: ["source-build-review"],
    },
    secrets: [],
    permissions: {
      network: { mode: "allowlist", allowHosts: ["api.katzilla.dev"], allowPorts: [443] },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["source-build-review"],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "source-image-digest", "mcp-tool-discovery"],
      expectedTools: ["query"],
      evidenceRefs: ["source-build-review"],
    },
    evidence: [
      {
        id: "source-build-review",
        type: "other",
        locator: "source-built fixture",
        summary: "Fixture models a reviewed source-built OCI image produced from a pinned commit.",
      },
    ],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: ["Runs a reviewed local image built from pinned source."],
      evidenceRefs: ["source-build-review"],
    },
  };
}
