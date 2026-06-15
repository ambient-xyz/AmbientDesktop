import { MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION, type McpAutowireCandidate } from "./mcpAutowireSchemas";

const evidenceRef = "six-pack-evidence";
const sqliteReadmeEvidenceRef = "sqlite-readme";
const sqliteSourceBuildEvidenceRef = "sqlite-source-build-review";
const sqliteResolvedCommit = "0123456789abcdef0123456789abcdef01234567";
const sqliteImageDigest = `sha256:${"6".repeat(64)}`;
const sqliteRecipeHash = "7".repeat(64);

export const mcpAutowireSixPackTargetIds = [
  "a2asearch",
  "executeautomation-playwright",
  "heventure-search",
  "mcp-nixos",
  "qdrant-mcp",
  "sqlite-explorer-fastmcp",
] as const;

export type McpAutowireSixPackTargetId = typeof mcpAutowireSixPackTargetIds[number];

export function mcpAutowireSixPackEvaluationCandidateForUrl(targetUrl: string): McpAutowireCandidate {
  if (targetUrl.includes("a2asearch-mcp")) return mcpAutowireSixPackCandidateForId("a2asearch");
  if (targetUrl.includes("mcp-playwright")) return mcpAutowireSixPackCandidateForId("executeautomation-playwright");
  if (targetUrl.includes("heventure-search-mcp")) return mcpAutowireSixPackCandidateForId("heventure-search");
  if (targetUrl.includes("mcp-nixos")) return mcpAutowireSixPackCandidateForId("mcp-nixos");
  if (targetUrl.includes("mcp-server-qdrant")) return mcpAutowireSixPackCandidateForId("qdrant-mcp");
  if (targetUrl.includes("sqlite-explorer-fastmcp")) return sqliteSourceOnlyCandidate();
  throw new Error(`No Awesome MCP six-pack fixture for ${targetUrl}`);
}

export function mcpAutowireSixPackManagedLifecycleCandidates(): McpAutowireCandidate[] {
  return mcpAutowireSixPackTargetIds.map((id) => mcpAutowireSixPackManagedLifecycleCandidateForId(id));
}

export function mcpAutowireSixPackManagedLifecycleCandidateForId(id: McpAutowireSixPackTargetId): McpAutowireCandidate {
  if (id === "sqlite-explorer-fastmcp") return sqliteCustomImageCandidate();
  return mcpAutowireSixPackCandidateForId(id);
}

export function mcpAutowireSixPackCandidateForId(id: Exclude<McpAutowireSixPackTargetId, "sqlite-explorer-fastmcp">): McpAutowireCandidate {
  if (id === "a2asearch") {
    return standardSixPackCandidate({
      id: "a2asearch-mcp-standard-mcp",
      displayName: "A2A Search MCP",
      sourceUrl: "https://github.com/tadas-github/a2asearch-mcp",
      registryType: "npm",
      packageIdentifier: "a2asearch-mcp",
    });
  }
  if (id === "executeautomation-playwright") {
    return standardSixPackCandidate({
      id: "executeautomation-playwright-mcp-server-standard-mcp",
      displayName: "ExecuteAutomation Playwright MCP",
      sourceUrl: "https://github.com/executeautomation/mcp-playwright",
      registryType: "npm",
      packageIdentifier: "@executeautomation/playwright-mcp-server",
      runtimeImage: "node:22-alpine",
      updatePolicy: {
        mode: "managed-browser-security",
        reason: "Browser-class MCP runtime uses Playwright packages.",
        evidenceRefs: [evidenceRef],
      },
    });
  }
  if (id === "heventure-search") {
    return standardSixPackCandidate({
      id: "heventure-search-mcp-standard-mcp",
      displayName: "Heventure Search MCP",
      sourceUrl: "https://github.com/HughesCuit/heventure-search-mcp",
      registryType: "pypi",
      packageIdentifier: "heventure-search-mcp",
      optionalSecretName: "SERPAPI_KEY",
    });
  }
  if (id === "mcp-nixos") {
    return standardSixPackCandidate({
      id: "mcp-nixos-standard-mcp",
      displayName: "MCP NixOS",
      sourceUrl: "https://github.com/utensils/mcp-nixos",
      registryType: "pypi",
      packageIdentifier: "mcp-nixos",
    });
  }
  return standardSixPackCandidate({
    id: "mcp-server-qdrant-standard-mcp",
    displayName: "Qdrant MCP Server",
    sourceUrl: "https://github.com/qdrant/mcp-server-qdrant",
    registryType: "pypi",
    packageIdentifier: "mcp-server-qdrant",
    runtimeImage: "python:3.11-slim",
    optionalSecretName: "QDRANT_API_KEY",
  });
}

function standardSixPackCandidate(input: {
  id: string;
  displayName: string;
  sourceUrl: string;
  registryType: "npm" | "pypi";
  packageIdentifier: string;
  runtimeImage?: string;
  optionalSecretName?: string;
  updatePolicy?: NonNullable<McpAutowireCandidate["runtime"]["updatePolicy"]>;
}): McpAutowireCandidate {
  return {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: input.id,
    displayName: input.displayName,
    source: {
      kind: "github",
      url: input.sourceUrl,
      packageName: input.packageIdentifier,
      evidenceRefs: [evidenceRef],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: input.registryType,
      transport: "stdio",
      package: {
        registryType: input.registryType,
        identifier: input.packageIdentifier,
        ...(input.runtimeImage ? { runtimeImage: input.runtimeImage } : {}),
        packageArguments: [],
      },
      ...(input.updatePolicy ? { updatePolicy: input.updatePolicy } : {}),
      evidenceRefs: [evidenceRef],
    },
    secrets: input.optionalSecretName
      ? [{
          name: input.optionalSecretName,
          required: false,
          secret: true,
          purpose: `Optional runtime secret for ${input.displayName}.`,
          evidenceRefs: [evidenceRef],
        }]
      : [],
    permissions: {
      network: {
        mode: "broad",
        allowHosts: [],
        allowPorts: [],
        justification: "Six-pack fixture uses upstream network behavior and requires user review before runtime.",
      },
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: [],
      },
      localApps: [],
      evidenceRefs: [evidenceRef],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "mcp-tool-discovery"],
      expectedTools: ["query"],
      evidenceRefs: [evidenceRef],
    },
    evidence: [{
      id: evidenceRef,
      type: "awesome-mcp",
      locator: input.sourceUrl,
      summary: "Fixture models a reviewed Awesome MCP six-pack Standard MCP import candidate.",
    }],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: ["Runs an upstream MCP package through ToolHive Standard MCP import."],
      evidenceRefs: [evidenceRef],
    },
  };
}

function sqliteSourceOnlyCandidate(): McpAutowireCandidate {
  return {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "sqlite-explorer-fastmcp-source",
    displayName: "SQLite Explorer FastMCP",
    source: {
      kind: "github",
      url: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
      packageName: "sqlite-explorer-fastmcp-mcp-server",
      evidenceRefs: [sqliteReadmeEvidenceRef],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "unknown",
      transport: "stdio",
      evidenceRefs: [sqliteReadmeEvidenceRef],
    },
    secrets: [],
    permissions: {
      network: { mode: "disabled", allowHosts: [], allowPorts: [] },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: [sqliteReadmeEvidenceRef],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime"],
      expectedTools: ["query"],
      evidenceRefs: [sqliteReadmeEvidenceRef],
    },
    evidence: [{
      id: sqliteReadmeEvidenceRef,
      type: "readme",
      locator: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
      summary: "README describes a GitHub-only FastMCP SQLite server source.",
    }],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: ["GitHub-only source needs a reviewed custom ToolHive source build."],
      evidenceRefs: [sqliteReadmeEvidenceRef],
    },
  };
}

function sqliteCustomImageCandidate(): McpAutowireCandidate {
  return {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "sqlite-explorer-fastmcp-custom-image",
    displayName: "SQLite Explorer FastMCP",
    source: {
      kind: "github",
      url: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
      resolvedCommit: sqliteResolvedCommit,
      packageName: "sqlite-explorer-fastmcp-mcp-server",
      evidenceRefs: [sqliteSourceBuildEvidenceRef],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "custom-image",
      transport: "stdio",
      package: {
        registryType: "oci",
        identifier: `ambient-source-built/sqlite-explorer-fastmcp:${sqliteResolvedCommit.slice(0, 7)}`,
        digest: sqliteImageDigest,
        packageArguments: [{
          type: "env",
          name: "SQLITE_DB_PATH",
          valueHint: "/data/test.db",
          isFixed: true,
        }],
      },
      updatePolicy: {
        mode: "pinned",
        reason: "Built from a reviewed SQLite Explorer source commit into a local OCI image with a recorded digest.",
        evidenceRefs: [sqliteSourceBuildEvidenceRef],
      },
      sourceBuild: {
        schemaVersion: "ambient-mcp-custom-source-build-v1",
        sourceUrl: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
        resolvedCommit: sqliteResolvedCommit,
        recipeKind: "existing-reviewed-image",
        recipeHash: sqliteRecipeHash,
        imageIdentifier: `ambient-source-built/sqlite-explorer-fastmcp:${sqliteResolvedCommit.slice(0, 7)}`,
        imageDigest: sqliteImageDigest,
        evidenceRefs: [sqliteSourceBuildEvidenceRef],
      },
      evidenceRefs: [sqliteSourceBuildEvidenceRef],
    },
    secrets: [],
    permissions: {
      network: { mode: "disabled", allowHosts: [], allowPorts: [] },
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: [
          {
            path: "/tmp/ambient-sqlite-explorer-source/sqlite_explorer.py",
            containerPath: "/app/sqlite_explorer.py",
            mode: "read-only",
            purpose: "Mount reviewed SQLite Explorer source read-only into the FastMCP runner image.",
          },
          {
            path: "/tmp/ambient-sqlite-explorer-data",
            containerPath: "/data",
            mode: "read-only",
            purpose: "Mount a disposable SQLite validation database read-only.",
          },
        ],
      },
      localApps: [],
      evidenceRefs: [sqliteSourceBuildEvidenceRef],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "source-image-digest", "mcp-tool-discovery"],
      expectedTools: ["read_query", "list_tables", "describe_table"],
      evidenceRefs: [sqliteSourceBuildEvidenceRef],
    },
    evidence: [{
      id: sqliteSourceBuildEvidenceRef,
      type: "other",
      locator: "reviewed-source-build:sqlite-explorer-fastmcp",
      summary: "Fixture models a reviewed SQLite Explorer custom ToolHive source image from a pinned GitHub commit.",
    }],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: ["Runs a reviewed local image built from pinned SQLite Explorer source."],
      evidenceRefs: [sqliteSourceBuildEvidenceRef],
    },
  };
}
