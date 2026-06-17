import { standardMcpImportSpec } from "../mcp/mcpInstallCatalog";
import { reviewMcpAutowireCandidate } from "./mcpAutowireReview";
import {
  MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
  MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
} from "./mcpAutowireSchemas";
import { TOOLHIVE_AMBIENT_GROUP } from "../tool-runtime/toolHiveRuntimeService";

export const MCP_AUTOWIRE_INITIAL_SIX_PACK_GATE_SCHEMA_VERSION = "ambient-mcp-autowire-initial-six-pack-gate-v1";

export const mcpAutowireInitialSixPackTargetIds = [
  "firefox-devtools-mcp",
  "fetch-mcp",
  "brasil-data-mcp",
  "server-filesystem",
  "mcp-server-sqlite",
  "csvglow",
] as const;

export type McpAutowireInitialSixPackTargetId = typeof mcpAutowireInitialSixPackTargetIds[number];

export interface McpAutowireInitialSixPackGateCase {
  schemaVersion: typeof MCP_AUTOWIRE_INITIAL_SIX_PACK_GATE_SCHEMA_VERSION;
  id: McpAutowireInitialSixPackTargetId;
  label: string;
  targetUrl: string;
  genericPrompt: string;
  promotedAt: string;
  candidate: McpAutowireCandidate;
  releaseContract: {
    serverId: string;
    toolHiveGroup: typeof TOOLHIVE_AMBIENT_GROUP;
    toolHiveRunSource: string;
    explicitInstallApprovalRequired: boolean;
    toolHiveWrapped: boolean;
    rawToolHiveFallbackAllowed: boolean;
    restartPersistenceRequired: boolean;
    sameNameReplacement?: boolean;
    managedFileExchange?: {
      containerPath: string;
      workspaceOutputPrefix: string;
      clickableArtifactRequired: boolean;
    };
    sourceBuildRecovery?: {
      failedRunSource: string;
      resolvedCommit: string;
      imageDigest: string;
    };
  };
  expected: {
    networkMode: McpAutowireCandidate["permissions"]["network"]["mode"];
    requiredAllowHosts?: string[];
    forbiddenAllowHosts?: string[];
    serverArgs: string[];
    runtimeImage?: string;
    volumes?: Array<{
      containerPath: string;
      mode: "ro" | "rw";
      hostPathIncludes?: string;
    }>;
    smokeTool: string;
    discoveredToolCount: number;
  };
  liveEvidence: string;
}

export interface McpAutowireInitialSixPackGateCaseResult {
  caseId: McpAutowireInitialSixPackTargetId;
  label: string;
  status: "passed" | "failed";
  diagnostics: string[];
}

export interface McpAutowireInitialSixPackGateReport {
  schemaVersion: "ambient-mcp-autowire-initial-six-pack-gate-report-v1";
  generatedAt: string;
  cases: number;
  passed: number;
  failed: number;
  results: McpAutowireInitialSixPackGateCaseResult[];
}

const standardEvidenceId = "discovery-summary";
const networkEvidenceId = "network-requirements";
const mountEvidenceId = "user-filesystem-mount";
const sourceBuildEvidenceId = "source-build-review";
const promotedAt = "2026-06-10";
const fixtureRoot = "/tmp/ambient-autowire-initial-six";
const sqliteResolvedCommit = "a3b0323ce23521190572460dff944722b0036b3c";
const sqliteImageDigest = "sha256:871526d5b0cad8f1f237fccb9337d614870972eec0feaeff695831ba4ab2f053";
const sqliteImageIdentifier = `ambient-source-built/mcp-sqlite-server-standard-mcp:${sqliteResolvedCommit.slice(0, 12)}`;
const sqliteRecipeHash = "2d208794e930cc5614b96a468d710910ac6e41cd86c9c2b3d4cee5c8e185ac86";

export const mcpAutowireInitialSixPackGateCases = [
  {
    schemaVersion: MCP_AUTOWIRE_INITIAL_SIX_PACK_GATE_SCHEMA_VERSION,
    id: "firefox-devtools-mcp",
    label: "Firefox DevTools MCP",
    targetUrl: "https://github.com/freema/firefox-devtools-mcp",
    genericPrompt: "Install this MCP: https://github.com/freema/firefox-devtools-mcp",
    promotedAt,
    candidate: packageBackedCandidate({
      id: "mozilla-firefox-devtools-mcp-standard-mcp",
      displayName: "Firefox DevTools MCP",
      sourceUrl: "https://github.com/freema/firefox-devtools-mcp",
      packageName: "@mozilla/firefox-devtools-mcp",
      registryType: "npm",
      runtimeHint: "npx -y @mozilla/firefox-devtools-mcp",
      runtimeImage: "node:22-alpine",
      network: {
        mode: "allowlist",
        allowHosts: ["www.mozilla.org", "codecov.io", "example.com", "glama.ai", "searchfox.org"],
        allowPorts: [443],
        justification: "@mozilla/firefox-devtools-mcp needs reviewed outbound HTTPS access for browser-driven validation targets.",
      },
      expectedTools: ["new_page", "list_pages", "take_snapshot"],
      updatePolicy: {
        mode: "managed-browser-security",
        reason: "Browser-class MCP runtime uses browser automation packages; Ambient and ToolHive must manage browser runtime security updates.",
        evidenceRefs: [standardEvidenceId],
      },
      riskLevel: "medium",
      riskReasons: ["Browser automation MCP is ToolHive-contained and uses reviewed network egress."],
    }),
    releaseContract: standardReleaseContract({
      serverId: "mozilla-firefox-devtools-mcp-standard-mcp",
      toolHiveRunSource: "npx://@mozilla/firefox-devtools-mcp",
      sameNameReplacement: true,
    }),
    expected: {
      networkMode: "allowlist",
      requiredAllowHosts: ["www.mozilla.org"],
      serverArgs: [],
      runtimeImage: "node:22-alpine",
      smokeTool: "new_page",
      discoveredToolCount: 8,
    },
    liveEvidence: "Desktop/GMI live gate installed through managed same-name ToolHive replacement, persisted endpoint, and discovered browser-control tools.",
  },
  {
    schemaVersion: MCP_AUTOWIRE_INITIAL_SIX_PACK_GATE_SCHEMA_VERSION,
    id: "fetch-mcp",
    label: "fetch-mcp",
    targetUrl: "https://github.com/zcaceres/fetch-mcp",
    genericPrompt: "Install this MCP: https://github.com/zcaceres/fetch-mcp and fetch https://example.com",
    promotedAt,
    candidate: packageBackedCandidate({
      id: "mcp-fetch-server-standard-mcp",
      displayName: "MCP Fetch Server",
      sourceUrl: "https://github.com/zcaceres/fetch-mcp",
      packageName: "mcp-fetch-server",
      registryType: "npm",
      runtimeHint: "npx -y mcp-fetch-server",
      network: {
        mode: "allowlist",
        allowHosts: ["example.com"],
        allowPorts: [443],
        justification: "The live smoke prompt only requested fetching https://example.com, so runtime egress is bounded to that host.",
      },
      expectedTools: ["fetch_html"],
      riskLevel: "medium",
      riskReasons: ["URL fetch capability must stay host-scoped unless the user approves broader egress."],
    }),
    releaseContract: standardReleaseContract({
      serverId: "mcp-fetch-server-standard-mcp",
      toolHiveRunSource: "npx://mcp-fetch-server",
    }),
    expected: {
      networkMode: "allowlist",
      requiredAllowHosts: ["example.com"],
      forbiddenAllowHosts: ["api.example.com", "www.youtube.com"],
      serverArgs: [],
      smokeTool: "fetch_html",
      discoveredToolCount: 1,
    },
    liveEvidence: "Desktop/GMI live gate installed through Standard MCP import and approved fetch_html against Example Domain.",
  },
  {
    schemaVersion: MCP_AUTOWIRE_INITIAL_SIX_PACK_GATE_SCHEMA_VERSION,
    id: "brasil-data-mcp",
    label: "Brasil Data MCP",
    targetUrl: "https://github.com/alanpcf/brasil-data-mcp",
    genericPrompt: "Install this MCP: https://github.com/alanpcf/brasil-data-mcp and look up CEP 01001-000",
    promotedAt,
    candidate: packageBackedCandidate({
      id: "brasil-data-mcp-standard-mcp",
      displayName: "Brasil Data MCP",
      sourceUrl: "https://github.com/alanpcf/brasil-data-mcp",
      packageName: "brasil-data-mcp",
      registryType: "npm",
      runtimeHint: "npx -y brasil-data-mcp",
      network: {
        mode: "allowlist",
        allowHosts: ["brasilapi.com.br"],
        allowPorts: [443],
        justification: "Brasil Data MCP runtime calls the fixed public BrasilAPI host for CEP and holiday lookups.",
      },
      expectedTools: ["consultar_cep"],
      riskLevel: "medium",
      riskReasons: ["Public-data MCP has a fixed reviewed API host and no secret requirement."],
    }),
    releaseContract: standardReleaseContract({
      serverId: "brasil-data-mcp-standard-mcp",
      toolHiveRunSource: "npx://brasil-data-mcp",
      sameNameReplacement: true,
    }),
    expected: {
      networkMode: "allowlist",
      requiredAllowHosts: ["brasilapi.com.br"],
      forbiddenAllowHosts: ["glama.ai", "modelcontextprotocol.io", "nodejs.org"],
      serverArgs: [],
      smokeTool: "consultar_cep",
      discoveredToolCount: 10,
    },
    liveEvidence: "Desktop/GMI live gate used visible approval, ToolHive phase heartbeats, endpoint persistence, and an approved consultar_cep smoke call.",
  },
  {
    schemaVersion: MCP_AUTOWIRE_INITIAL_SIX_PACK_GATE_SCHEMA_VERSION,
    id: "server-filesystem",
    label: "Server Filesystem",
    targetUrl: "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/filesystem",
    genericPrompt: "Install this MCP with read-only access to a disposable folder and list notes.txt.",
    promotedAt,
    candidate: packageBackedCandidate({
      id: "modelcontextprotocol-server-filesystem-standard-mcp",
      displayName: "Server Filesystem",
      sourceUrl: "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/filesystem",
      packageName: "@modelcontextprotocol/server-filesystem",
      registryType: "npm",
      runtimeHint: "npx -y @modelcontextprotocol/server-filesystem /projects/filesystem-fixture",
      network: {
        mode: "disabled",
        allowHosts: [],
        allowPorts: [],
        justification: "The initial gate only validates local read-only filesystem access.",
      },
      mounts: [{
        path: `${fixtureRoot}/filesystem-fixture`,
        containerPath: "/projects/filesystem-fixture",
        mode: "read-only",
        purpose: "User explicitly requested read-only filesystem access for this MCP install.",
      }],
      expectedTools: ["list_directory", "read_file"],
      riskLevel: "high",
      riskReasons: ["Local filesystem MCP access must stay scoped to reviewed read-only mounts."],
    }),
    releaseContract: standardReleaseContract({
      serverId: "modelcontextprotocol-server-filesystem-standard-mcp",
      toolHiveRunSource: "npx://@modelcontextprotocol/server-filesystem",
    }),
    expected: {
      networkMode: "disabled",
      serverArgs: ["/projects/filesystem-fixture"],
      volumes: [{ containerPath: "/projects/filesystem-fixture", mode: "ro", hostPathIncludes: "filesystem-fixture" }],
      smokeTool: "list_directory",
      discoveredToolCount: 14,
    },
    liveEvidence: "Desktop/GMI live gate preserved a reviewed read-only mount, appended the container path arg, survived restart, and read notes.txt through the MCP bridge.",
  },
  {
    schemaVersion: MCP_AUTOWIRE_INITIAL_SIX_PACK_GATE_SCHEMA_VERSION,
    id: "mcp-server-sqlite",
    label: "mcp-server-sqlite",
    targetUrl: "https://github.com/ofershap/mcp-server-sqlite",
    genericPrompt: "Install this MCP with read-only access to a disposable SQLite database and inspect the schema.",
    promotedAt,
    candidate: sqliteCustomImageCandidate(),
    releaseContract: standardReleaseContract({
      serverId: "mcp-sqlite-server-standard-mcp",
      toolHiveRunSource: sqliteImageIdentifier,
      sourceBuildRecovery: {
        failedRunSource: "npx://mcp-sqlite-server",
        resolvedCommit: sqliteResolvedCommit,
        imageDigest: sqliteImageDigest,
      },
    }),
    expected: {
      networkMode: "disabled",
      serverArgs: [],
      volumes: [{ containerPath: "/projects/library.db", mode: "ro", hostPathIncludes: "library.db" }],
      smokeTool: "schema",
      discoveredToolCount: 5,
    },
    liveEvidence: "Desktop/GMI live gate recovered a failed package import through the managed source-build lane, installed a pinned custom image, and approved schema inspection.",
  },
  {
    schemaVersion: MCP_AUTOWIRE_INITIAL_SIX_PACK_GATE_SCHEMA_VERSION,
    id: "csvglow",
    label: "csvglow",
    targetUrl: "https://github.com/Ratnaditya-J/csvglow",
    genericPrompt: "Install this MCP: https://github.com/Ratnaditya-J/csvglow, then generate a dashboard from an inline CSV.",
    promotedAt,
    candidate: packageBackedCandidate({
      id: "csvglow-standard-mcp",
      displayName: "Csvglow",
      sourceUrl: "https://github.com/Ratnaditya-J/csvglow",
      packageName: "csvglow",
      registryType: "pypi",
      runtimeHint: "uvx csvglow --mcp",
      packageArguments: [{ type: "switch", name: "--mcp", isFixed: true }],
      network: {
        mode: "allowlist",
        allowHosts: ["openclaw.dev"],
        allowPorts: [443],
        justification: "csvglow's package metadata points to the project host; dashboard generation itself uses managed file exchange.",
      },
      expectedTools: ["generate_dashboard"],
      riskLevel: "medium",
      riskReasons: ["Dashboard generation must use managed file exchange rather than broad workspace access."],
    }),
    releaseContract: standardReleaseContract({
      serverId: "csvglow-standard-mcp",
      toolHiveRunSource: "uvx://csvglow",
      managedFileExchange: {
        containerPath: "/ambient/mcp-files",
        workspaceOutputPrefix: ".ambient/mcp-outputs/",
        clickableArtifactRequired: true,
      },
    }),
    expected: {
      networkMode: "allowlist",
      requiredAllowHosts: ["openclaw.dev"],
      forbiddenAllowHosts: ["glama.ai"],
      serverArgs: ["--mcp"],
      smokeTool: "generate_dashboard",
      discoveredToolCount: 1,
    },
    liveEvidence: "Desktop/GMI live gate installed uvx://csvglow --mcp, rewrote file inputs/output_path through managed file exchange, and rendered the generated HTML artifact in-app after restart.",
  },
] as const satisfies readonly McpAutowireInitialSixPackGateCase[];

export function evaluateMcpAutowireInitialSixPackGate(
  cases: readonly McpAutowireInitialSixPackGateCase[] = mcpAutowireInitialSixPackGateCases,
  now: Date = new Date(),
): McpAutowireInitialSixPackGateReport {
  const results = cases.map(evaluateInitialSixPackCase);
  return {
    schemaVersion: "ambient-mcp-autowire-initial-six-pack-gate-report-v1",
    generatedAt: now.toISOString(),
    cases: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}

export function mcpAutowireInitialSixPackGateReportMarkdown(report: McpAutowireInitialSixPackGateReport): string {
  const rows = report.results.map((result) => `| ${escapeTable(result.label)} | ${result.caseId} | ${result.status} | ${result.diagnostics.length} |`);
  const details = report.results.map((result) => [
    `### ${result.label}`,
    "",
    result.diagnostics.length ? result.diagnostics.map((diagnostic) => `- ${diagnostic}`).join("\n") : "- none",
  ].join("\n"));
  return [
    "# MCP Autowire Initial Six-Pack Gate",
    "",
    `Generated: ${report.generatedAt}`,
    `Cases: ${report.cases}`,
    `Passed: ${report.passed}`,
    `Failed: ${report.failed}`,
    "",
    "| Candidate | Id | Status | Diagnostics |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "## Details",
    "",
    ...details,
  ].join("\n");
}

function evaluateInitialSixPackCase(testCase: McpAutowireInitialSixPackGateCase): McpAutowireInitialSixPackGateCaseResult {
  const diagnostics: string[] = [];
  const candidate = testCase.candidate;
  const validation = validateMcpAutowireCandidate(candidate);
  const review = reviewMcpAutowireCandidate({ candidate });
  const spec = standardMcpImportSpec(candidate);
  const contract = testCase.releaseContract;

  if (candidate.id !== contract.serverId) diagnostics.push(`Expected candidate/server id ${contract.serverId}, got ${candidate.id}.`);
  if (validation.blockers.length) diagnostics.push(`Candidate validation blockers: ${validation.blockers.map((issue) => issue.code).join(", ")}.`);
  if (!validation.readyForUserReview) diagnostics.push("Candidate is not ready for user review.");
  if (review.handoff.kind !== "standard-mcp-import") diagnostics.push(`Expected Standard MCP import handoff, got ${review.handoff.kind}.`);
  if (review.handoff.status !== "ready") diagnostics.push(`Expected ready handoff, got ${review.handoff.status}.`);
  if (spec.blockers.length) diagnostics.push(`Standard import blockers: ${spec.blockers.join("; ")}`);
  if (spec.toolHiveRunSource !== contract.toolHiveRunSource) diagnostics.push(`Expected ToolHive run source ${contract.toolHiveRunSource}, got ${spec.toolHiveRunSource ?? "none"}.`);
  if (contract.toolHiveGroup !== TOOLHIVE_AMBIENT_GROUP) diagnostics.push(`Expected ToolHive group ${TOOLHIVE_AMBIENT_GROUP}, got ${contract.toolHiveGroup}.`);
  if (!contract.toolHiveWrapped) diagnostics.push("Release contract must require ToolHive wrapping.");
  if (!contract.explicitInstallApprovalRequired) diagnostics.push("Release contract must require explicit user approval before install.");
  if (contract.rawToolHiveFallbackAllowed) diagnostics.push("Release contract must forbid raw ToolHive fallback.");
  if (!contract.restartPersistenceRequired) diagnostics.push("Release contract must require restart persistence.");
  if (candidate.permissions.network.mode !== testCase.expected.networkMode) diagnostics.push(`Expected network mode ${testCase.expected.networkMode}, got ${candidate.permissions.network.mode}.`);
  for (const host of testCase.expected.requiredAllowHosts ?? []) {
    if (!candidate.permissions.network.allowHosts.includes(host)) diagnostics.push(`Expected allow host ${host}.`);
  }
  for (const host of testCase.expected.forbiddenAllowHosts ?? []) {
    if (candidate.permissions.network.allowHosts.includes(host)) diagnostics.push(`Forbidden allow host ${host} is present.`);
  }
  if (!sameStringArray(spec.serverArgs, testCase.expected.serverArgs)) {
    diagnostics.push(`Expected server args ${JSON.stringify(testCase.expected.serverArgs)}, got ${JSON.stringify(spec.serverArgs)}.`);
  }
  if (testCase.expected.runtimeImage && spec.runtimeImage !== testCase.expected.runtimeImage) {
    diagnostics.push(`Expected runtime image ${testCase.expected.runtimeImage}, got ${spec.runtimeImage ?? "none"}.`);
  }
  for (const expectedVolume of testCase.expected.volumes ?? []) {
    const found = spec.volumes.some((volume) =>
      volume.containerPath === expectedVolume.containerPath &&
      volume.mode === expectedVolume.mode &&
      (!expectedVolume.hostPathIncludes || volume.hostPath.includes(expectedVolume.hostPathIncludes))
    );
    if (!found) diagnostics.push(`Expected ${expectedVolume.mode} volume for ${expectedVolume.containerPath}.`);
  }
  if (!candidate.validationPlan.expectedTools.includes(testCase.expected.smokeTool)) {
    diagnostics.push(`Expected smoke tool ${testCase.expected.smokeTool} in validation plan.`);
  }
  if (testCase.expected.discoveredToolCount < 1) diagnostics.push("Live evidence must record at least one discovered tool.");
  if (contract.managedFileExchange) {
    if (candidate.permissions.filesystem.workspaceRead || candidate.permissions.filesystem.workspaceWrite) {
      diagnostics.push("Managed file exchange candidates must not request broad workspace filesystem access.");
    }
    if (!contract.managedFileExchange.workspaceOutputPrefix.startsWith(".ambient/mcp-outputs/")) {
      diagnostics.push("Managed file exchange outputs must stay under .ambient/mcp-outputs/.");
    }
    if (!contract.managedFileExchange.clickableArtifactRequired) diagnostics.push("Managed file exchange gate must require a clickable artifact.");
  }
  if (contract.sourceBuildRecovery) {
    const sourceBuild = candidate.runtime.sourceBuild;
    if (candidate.runtime.sourceKind !== "custom-image") diagnostics.push(`Source-build recovery must end as custom-image, got ${candidate.runtime.sourceKind}.`);
    if (candidate.runtime.updatePolicy?.mode !== "pinned") diagnostics.push("Source-build recovery must pin the runtime update policy.");
    if (sourceBuild?.resolvedCommit !== contract.sourceBuildRecovery.resolvedCommit) {
      diagnostics.push(`Expected source-build commit ${contract.sourceBuildRecovery.resolvedCommit}, got ${sourceBuild?.resolvedCommit ?? "none"}.`);
    }
    if (sourceBuild?.imageDigest !== contract.sourceBuildRecovery.imageDigest) {
      diagnostics.push(`Expected source-build image digest ${contract.sourceBuildRecovery.imageDigest}, got ${sourceBuild?.imageDigest ?? "none"}.`);
    }
    if (contract.sourceBuildRecovery.failedRunSource === contract.toolHiveRunSource) {
      diagnostics.push("Source-build recovery must distinguish the failed package run source from the final custom image source.");
    }
  }

  return {
    caseId: testCase.id,
    label: testCase.label,
    status: diagnostics.length ? "failed" : "passed",
    diagnostics,
  };
}

function packageBackedCandidate(input: {
  id: string;
  displayName: string;
  sourceUrl: string;
  packageName: string;
  registryType: "npm" | "pypi";
  runtimeHint: string;
  packageArguments?: NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"];
  runtimeImage?: string;
  network: McpAutowireCandidate["permissions"]["network"];
  mounts?: McpAutowireCandidate["permissions"]["filesystem"]["extraMounts"];
  expectedTools: string[];
  updatePolicy?: McpAutowireCandidate["runtime"]["updatePolicy"];
  riskLevel: McpAutowireCandidate["riskSummary"]["level"];
  riskReasons: string[];
}): McpAutowireCandidate {
  const evidenceRefs = input.network.mode === "disabled" ? [standardEvidenceId] : [standardEvidenceId, networkEvidenceId];
  const permissionsEvidenceRefs = input.mounts?.length ? [...evidenceRefs, mountEvidenceId] : evidenceRefs;
  return {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: input.id,
    displayName: input.displayName,
    source: {
      kind: "github",
      url: input.sourceUrl,
      packageName: input.packageName,
      evidenceRefs: [standardEvidenceId],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: input.registryType,
      transport: "stdio",
      package: {
        registryType: input.registryType,
        identifier: input.packageName,
        runtimeHint: input.runtimeHint,
        ...(input.runtimeImage ? { runtimeImage: input.runtimeImage } : {}),
        packageArguments: input.packageArguments ?? [],
      },
      ...(input.updatePolicy ? { updatePolicy: input.updatePolicy } : {}),
      evidenceRefs: [standardEvidenceId],
    },
    secrets: [],
    permissions: {
      network: input.network,
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: input.mounts ?? [],
      },
      localApps: [],
      evidenceRefs: permissionsEvidenceRefs,
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "mcp-tool-discovery"],
      expectedTools: input.expectedTools,
      evidenceRefs: [standardEvidenceId],
    },
    evidence: [
      {
        id: standardEvidenceId,
        type: "readme",
        locator: input.sourceUrl,
        summary: `Promoted live gate found a package-backed Standard MCP server for ${input.packageName}.`,
      },
      ...(input.network.mode === "disabled"
        ? []
        : [{
            id: networkEvidenceId,
            type: "other" as const,
            locator: input.sourceUrl,
            summary: `Promoted live gate reviewed runtime network requirements for ${input.packageName}.`,
          }]),
      ...(input.mounts?.length
        ? [{
            id: mountEvidenceId,
            type: "other" as const,
            locator: "user-instructions",
            summary: "User explicitly requested scoped filesystem access for this MCP install.",
          }]
        : []),
    ],
    openQuestions: [],
    riskSummary: {
      level: input.riskLevel,
      reasons: input.riskReasons,
      evidenceRefs: [standardEvidenceId],
    },
  };
}

function sqliteCustomImageCandidate(): McpAutowireCandidate {
  return {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "mcp-sqlite-server-standard-mcp",
    displayName: "MCP Sqlite Server",
    source: {
      kind: "github",
      url: "https://github.com/ofershap/mcp-server-sqlite",
      packageName: "mcp-sqlite-server",
      resolvedCommit: sqliteResolvedCommit,
      evidenceRefs: [standardEvidenceId, sourceBuildEvidenceId],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "custom-image",
      transport: "stdio",
      package: {
        registryType: "oci",
        identifier: sqliteImageIdentifier,
        digest: sqliteImageDigest,
        runtimeHint: "node /app/dist/index.js",
        packageArguments: [],
      },
      updatePolicy: {
        mode: "pinned",
        reason: `Custom source image built from reviewed commit ${sqliteResolvedCommit} and pinned by OCI digest.`,
        evidenceRefs: [sourceBuildEvidenceId],
      },
      sourceBuild: {
        schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
        sourceUrl: "https://github.com/ofershap/mcp-server-sqlite",
        resolvedCommit: sqliteResolvedCommit,
        recipeKind: "generated-dockerfile",
        recipeHash: sqliteRecipeHash,
        imageIdentifier: sqliteImageIdentifier,
        imageDigest: sqliteImageDigest,
        evidenceRefs: [sourceBuildEvidenceId],
      },
      evidenceRefs: [sourceBuildEvidenceId],
    },
    secrets: [],
    permissions: {
      network: {
        mode: "disabled",
        allowHosts: [],
        allowPorts: [],
        justification: "Discovery indicates this MCP works against local SQLite/database files and does not require runtime network access.",
      },
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: [{
          path: `${fixtureRoot}/sqlite-fixture/library.db`,
          containerPath: "/projects/library.db",
          mode: "read-only",
          purpose: "User explicitly requested read-only filesystem access for this MCP install.",
        }],
      },
      localApps: [],
      evidenceRefs: [standardEvidenceId, mountEvidenceId],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "source-image-digest", "mcp-tool-discovery"],
      expectedTools: ["schema"],
      evidenceRefs: [standardEvidenceId, sourceBuildEvidenceId],
    },
    evidence: [
      {
        id: standardEvidenceId,
        type: "readme",
        locator: "https://raw.githubusercontent.com/ofershap/mcp-server-sqlite/main/package.json",
        summary: "Discovery found a documented MCP package mcp-sqlite-server before runtime package import failed.",
      },
      {
        id: mountEvidenceId,
        type: "other",
        locator: "user-instructions",
        summary: "User explicitly requested scoped SQLite database access for this MCP install.",
      },
      {
        id: sourceBuildEvidenceId,
        type: "other",
        locator: `https://github.com/ofershap/mcp-server-sqlite@${sqliteResolvedCommit}`,
        summary: `Reviewed custom ToolHive source build produced OCI image ${sqliteImageIdentifier} at digest ${sqliteImageDigest}.`,
      },
    ],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: [
        "Package-backed MCP server is scoped to local SQLite/database files without runtime network egress.",
        "Runs a custom source-built OCI image pinned to a reviewed GitHub commit and digest.",
      ],
      evidenceRefs: [standardEvidenceId, sourceBuildEvidenceId],
    },
  };
}

function standardReleaseContract(input: {
  serverId: string;
  toolHiveRunSource: string;
  sameNameReplacement?: boolean;
  managedFileExchange?: McpAutowireInitialSixPackGateCase["releaseContract"]["managedFileExchange"];
  sourceBuildRecovery?: McpAutowireInitialSixPackGateCase["releaseContract"]["sourceBuildRecovery"];
}): McpAutowireInitialSixPackGateCase["releaseContract"] {
  return {
    serverId: input.serverId,
    toolHiveGroup: TOOLHIVE_AMBIENT_GROUP,
    toolHiveRunSource: input.toolHiveRunSource,
    explicitInstallApprovalRequired: true,
    toolHiveWrapped: true,
    rawToolHiveFallbackAllowed: false,
    restartPersistenceRequired: true,
    ...(input.sameNameReplacement ? { sameNameReplacement: true } : {}),
    ...(input.managedFileExchange ? { managedFileExchange: input.managedFileExchange } : {}),
    ...(input.sourceBuildRecovery ? { sourceBuildRecovery: input.sourceBuildRecovery } : {}),
  };
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
