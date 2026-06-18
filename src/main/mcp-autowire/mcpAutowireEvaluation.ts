import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { standardMcpImportSpec } from "./mcpAutowireMcpInstallFacade";
import { mcpAutowirePlanResultText, planMcpAutowire, type McpAutowirePlanInput, type McpAutowirePlanResult, type McpAutowirePlannerOptions } from "./mcpAutowirePlanner";
import { mcpAutowireReviewResultText, reviewMcpAutowireCandidate, type McpAutowireReviewResult } from "./mcpAutowireReview";
import type { McpAutowireCandidate, McpAutowireOutcome } from "./mcpAutowireSchemas";
import { TOOLHIVE_AMBIENT_GROUP } from "./mcpAutowireToolRuntimeFacade";

export const MCP_AUTOWIRE_DOGFOOD_FIXTURE_SCHEMA_VERSION = "ambient-mcp-autowire-dogfood-fixture-v1";

export type McpAutowireEvaluationCategory =
  | "guinea-pig"
  | "awesome-search"
  | "awesome-knowledge-memory"
  | "awesome-six-pack";

export type McpAutowirePromotionSignal =
  | "installable-toolhive-registry"
  | "standard-import-candidate"
  | "custom-source-build-candidate"
  | "remote-runtime-candidate"
  | "guided-local-candidate"
  | "needs-more-evidence"
  | "blocked"
  | "planner-error";

export interface McpAutowireDogfoodFixture {
  schemaVersion: typeof MCP_AUTOWIRE_DOGFOOD_FIXTURE_SCHEMA_VERSION;
  id: string;
  targetId: string;
  label: string;
  source: "live-ambient";
  promotedAt: string;
  rationale: string;
  expected: {
    status: McpAutowireEvaluationCaseResult["status"];
    promotionSignal: McpAutowirePromotionSignal;
    recommendedLane: McpAutowireCandidate["recommendedLane"];
    runtimeProvider: McpAutowireCandidate["runtime"]["provider"];
    runtimeSourceKind: McpAutowireCandidate["runtime"]["sourceKind"];
    transport: McpAutowireCandidate["runtime"]["transport"];
    handoffKind: NonNullable<McpAutowireEvaluationCaseResult["review"]>["handoff"]["kind"];
    handoffStatus: NonNullable<McpAutowireEvaluationCaseResult["review"]>["handoff"]["status"];
    handoffOutcome: McpAutowireOutcome;
    networkMode?: McpAutowireCandidate["permissions"]["network"]["mode"];
    networkModes?: Array<McpAutowireCandidate["permissions"]["network"]["mode"]>;
    requiredLocalApps?: string[];
    requiredAllowPorts?: number[];
    requiredEvidenceIds?: string[];
    requiredEvidenceLocatorSubstrings?: string[];
    requiredIssueSubstrings?: string[];
    forbiddenHandoffKinds?: Array<NonNullable<McpAutowireEvaluationCaseResult["review"]>["handoff"]["kind"]>;
  };
}

export interface McpAutowireDogfoodFixtureCaseResult {
  fixture: McpAutowireDogfoodFixture;
  target?: McpAutowireEvaluationTarget;
  status: "passed" | "failed" | "skipped";
  diagnostics: string[];
}

export interface McpAutowireDogfoodFixtureReport {
  schemaVersion: "ambient-mcp-autowire-dogfood-fixture-report-v1";
  sourceRunId: string;
  generatedAt: string;
  providerLabel: string;
  fixtures: number;
  evaluated: number;
  passed: number;
  failed: number;
  skipped: number;
  results: McpAutowireDogfoodFixtureCaseResult[];
}

export interface McpAutowireEvaluationTarget {
  id: string;
  label: string;
  targetUrl: string;
  category: McpAutowireEvaluationCategory;
  sourceListUrl?: string;
  rationale: string;
  instructions: string;
  expectedSignals: McpAutowirePromotionSignal[];
  allowedDiscovery?: McpAutowirePlanInput["allowedDiscovery"];
}

export interface McpAutowireEvaluationCaseResult {
  target: McpAutowireEvaluationTarget;
  status: "ready" | "deferred" | "blocked" | "planner-error";
  promotionSignal: McpAutowirePromotionSignal;
  plan?: McpAutowirePlanResult;
  review?: McpAutowireReviewResult;
  issueSummary: string[];
}

export interface McpAutowireEvaluationReport {
  schemaVersion: "ambient-mcp-autowire-evaluation-v1";
  runId: string;
  generatedAt: string;
  providerLabel: string;
  targets: number;
  summary: Record<McpAutowirePromotionSignal, number>;
  results: McpAutowireEvaluationCaseResult[];
}

export type McpAutowireRuntimeGateStatus = "ready" | "deferred" | "blocked";

export interface McpAutowireRuntimeGateCaseResult {
  target: McpAutowireEvaluationTarget;
  status: McpAutowireRuntimeGateStatus;
  handoffKind?: NonNullable<McpAutowireEvaluationCaseResult["review"]>["handoff"]["kind"];
  runtimeLane?: "toolhive-registry" | "standard-mcp-import" | "remote-mcp-proxy" | "custom-source-build" | "guided-local-bridge";
  group?: string;
  toolHiveRunSource?: string;
  sourceRef?: string;
  runtimeImage?: string;
  serverArgs: string[];
  issues: string[];
}

export interface McpAutowireRuntimeGateReport {
  schemaVersion: "ambient-mcp-autowire-runtime-gate-v1";
  sourceRunId: string;
  generatedAt: string;
  providerLabel: string;
  targets: number;
  summary: Record<McpAutowireRuntimeGateStatus, number>;
  results: McpAutowireRuntimeGateCaseResult[];
}

export const mcpAutowirePromotedDogfoodFixtures = [
  {
    schemaVersion: MCP_AUTOWIRE_DOGFOOD_FIXTURE_SCHEMA_VERSION,
    id: "live-ambient-ghidramcp-guided-local-bridge",
    targetId: "ghidramcp",
    label: "GhidraMCP guided local bridge",
    source: "live-ambient",
    promotedAt: "2026-05-23",
    rationale:
      "Live Ambient dogfood classified GhidraMCP as guided local bridge setup, not a silent ToolHive install, generic shell setup, or remote MCP endpoint.",
    expected: {
      status: "deferred",
      promotionSignal: "guided-local-candidate",
      recommendedLane: "guided-local-bridge",
      runtimeProvider: "guided-local",
      runtimeSourceKind: "local-bridge",
      transport: "sse",
      handoffKind: "guided-local-bridge",
      handoffStatus: "deferred",
      handoffOutcome: "guided-setup-required",
      networkModes: ["local-only", "allowlist"],
      requiredLocalApps: ["Ghidra"],
      requiredAllowPorts: [8080, 8081],
      requiredEvidenceLocatorSubstrings: ["GhidraMCP/main/README.md"],
      requiredIssueSubstrings: ["open_question.blocks_install"],
      forbiddenHandoffKinds: ["toolhive-registry-install", "standard-mcp-import", "remote-mcp-proxy"],
    },
  },
] as const satisfies readonly McpAutowireDogfoodFixture[];

export interface McpAutowireEvaluationOptions extends McpAutowirePlannerOptions {
  providerLabel?: string;
  runId?: string;
  now?: Date;
  targetIds?: string[];
  targets?: readonly McpAutowireEvaluationTarget[];
  planner?: (input: McpAutowirePlanInput, options: McpAutowirePlannerOptions) => Promise<McpAutowirePlanResult>;
  onCaseResult?: (result: McpAutowireEvaluationCaseResult) => void | Promise<void>;
}

const defaultDiscovery = {
  urlFetch: true,
  githubRaw: true,
  search: true,
  maxFetches: 6,
  maxSearches: 2,
  maxBytesPerFetch: 24_000,
};

const awesomeSearchUrl = "https://github.com/punkpeye/awesome-mcp-servers#search";
const awesomeKnowledgeMemoryUrl = "https://github.com/punkpeye/awesome-mcp-servers#knowledge--memory";
const awesomeSixPackUrl = "https://github.com/punkpeye/awesome-mcp-servers";

export const mcpAutowireEvaluationTargets = [
  {
    id: "scrapling",
    label: "Scrapling",
    targetUrl: "https://github.com/D4Vinci/Scrapling",
    category: "guinea-pig",
    rationale: "Primary web-scraping guinea pig with likely Python/stdio MCP metadata and broad task-dependent network risk.",
    instructions: [
      "Classify the best Ambient install lane for Scrapling.",
      "Prefer standard-mcp if official server metadata or package instructions expose a stdio MCP server.",
      "Treat broad web egress as a user-review warning unless the source lacks an explicit justification.",
    ].join(" "),
    expectedSignals: ["standard-import-candidate", "blocked"],
  },
  {
    id: "context7",
    label: "Context7",
    targetUrl: "https://github.com/upstash/context7",
    category: "guinea-pig",
    rationale: "Primary documentation guinea pig with both package and hosted endpoint signals.",
    instructions: [
      "Classify the best Ambient install lane for Context7.",
      "Prefer remote-mcp only if an explicit hosted MCP endpoint is found; otherwise use standard-mcp if package metadata is clearer.",
      "Do not invent endpoint URLs, package versions, or runtime validation.",
    ].join(" "),
    expectedSignals: ["remote-runtime-candidate", "standard-import-candidate", "needs-more-evidence"],
  },
  {
    id: "ghidramcp",
    label: "GhidraMCP",
    targetUrl: "https://github.com/lauriewired/GhidraMCP",
    category: "guinea-pig",
    rationale: "Primary guided-local guinea pig because the MCP bridge depends on a user-run Ghidra application and extension.",
    instructions: [
      "Classify GhidraMCP without silently containerizing it.",
      "Prefer guided-local-bridge when the source controls a local Ghidra application, plugin, extension, or bridge.",
      "Open questions about local Ghidra installation or loaded projects should block install.",
    ].join(" "),
    expectedSignals: ["guided-local-candidate", "blocked"],
  },
  {
    id: "rippr",
    label: "rippr",
    targetUrl: "https://github.com/mrslbt/rippr",
    category: "awesome-search",
    sourceListUrl: awesomeSearchUrl,
    rationale: "awesome-mcp search/data-extraction entry with npx install notes and no advertised API-key requirement.",
    instructions: [
      "Classify this awesome-mcp Search & Data Extraction entry.",
      "Prefer standard-mcp if package metadata or README install instructions expose an MCP server.",
      "Call out YouTube/network terms and host-permission uncertainty as review items.",
    ].join(" "),
    expectedSignals: ["standard-import-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "anybrowse",
    label: "AnyBrowse",
    targetUrl: "https://github.com/kc23go/anybrowse",
    category: "awesome-search",
    sourceListUrl: awesomeSearchUrl,
    rationale: "awesome-mcp search/data-extraction entry that advertises a remote MCP endpoint.",
    instructions: [
      "Classify this awesome-mcp Search & Data Extraction entry.",
      "Prefer remote-mcp only if the repository or README declares an explicit hosted MCP endpoint.",
      "If endpoint, auth, cost, or data-retention facts are unclear, return explicit blockers rather than inventing them.",
    ].join(" "),
    expectedSignals: ["remote-runtime-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "waypath",
    label: "Waypath",
    targetUrl: "https://github.com/TheStack-ai/waypath",
    category: "awesome-knowledge-memory",
    sourceListUrl: awesomeKnowledgeMemoryUrl,
    rationale: "awesome-mcp knowledge/memory entry with local-first memory semantics that should stress persistence review.",
    instructions: [
      "Classify this awesome-mcp Knowledge & Memory entry.",
      "Prefer standard-mcp only if package metadata or README install instructions expose a supported MCP server path.",
      "Persistence, retention, deletion, and workspace-data access details are install-critical and should block when unclear.",
    ].join(" "),
    expectedSignals: ["standard-import-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "instinct",
    label: "Instinct",
    targetUrl: "https://github.com/yakuphanycl/instinct",
    category: "awesome-knowledge-memory",
    sourceListUrl: awesomeKnowledgeMemoryUrl,
    rationale: "awesome-mcp knowledge/memory entry that says it is published on PyPI and registered in the MCP Registry.",
    instructions: [
      "Classify this awesome-mcp Knowledge & Memory entry.",
      "Prefer standard-mcp if registry or PyPI MCP server metadata is explicit.",
      "Persistence, retention, deletion, local database paths, and workspace-data access details are install-critical.",
    ].join(" "),
    expectedSignals: ["installable-toolhive-registry", "standard-import-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "a2asearch",
    label: "A2A Search MCP",
    targetUrl: "https://github.com/tadas-github/a2asearch-mcp",
    category: "awesome-six-pack",
    sourceListUrl: awesomeSixPackUrl,
    rationale: "Awesome MCP six-pack aggregator/discovery server with no-auth npm install notes.",
    instructions: [
      "Classify this Awesome MCP six-pack aggregator server.",
      "Prefer standard-mcp if npm package evidence confirms npx a2asearch-mcp.",
      "No secret should be required unless upstream evidence explicitly says so.",
    ].join(" "),
    expectedSignals: ["standard-import-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "executeautomation-playwright",
    label: "ExecuteAutomation Playwright MCP",
    targetUrl: "https://github.com/executeautomation/mcp-playwright",
    category: "awesome-six-pack",
    sourceListUrl: awesomeSixPackUrl,
    rationale: "Awesome MCP six-pack browser automation server that should exercise browser-class runtime policy and ToolHive containment.",
    instructions: [
      "Classify this Awesome MCP six-pack browser automation server.",
      "Prefer standard-mcp only when package metadata or README install instructions expose the Playwright MCP package.",
      "Browser-class runtimes must declare managed browser update policy and must not receive arbitrary host filesystem access.",
    ].join(" "),
    expectedSignals: ["standard-import-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "heventure-search",
    label: "Heventure Search MCP",
    targetUrl: "https://github.com/HughesCuit/heventure-search-mcp",
    category: "awesome-six-pack",
    sourceListUrl: awesomeSixPackUrl,
    rationale: "Awesome MCP six-pack cloud search server with a simple Python package path and no API-key requirement in the list.",
    instructions: [
      "Classify this Awesome MCP six-pack search server.",
      "Prefer standard-mcp if uvx or PyPI package evidence confirms heventure-search-mcp.",
      "Review outbound search/network access and do not invent an API key requirement.",
    ].join(" "),
    expectedSignals: ["standard-import-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "mcp-nixos",
    label: "MCP NixOS",
    targetUrl: "https://github.com/utensils/mcp-nixos",
    category: "awesome-six-pack",
    sourceListUrl: awesomeSixPackUrl,
    rationale: "Awesome MCP six-pack developer documentation/package lookup server that should exercise low-risk Python stdio behavior.",
    instructions: [
      "Classify this Awesome MCP six-pack documentation lookup server.",
      "Prefer standard-mcp if uvx or PyPI package evidence confirms mcp-nixos.",
      "Expected validation should use read-only NixOS/nix-darwin lookup tools and require no secrets.",
    ].join(" "),
    expectedSignals: ["standard-import-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "qdrant-mcp",
    label: "Qdrant MCP Server",
    targetUrl: "https://github.com/qdrant/mcp-server-qdrant",
    category: "awesome-six-pack",
    sourceListUrl: awesomeSixPackUrl,
    rationale: "Awesome MCP six-pack vector database memory server with local-path and optional API-key modes.",
    instructions: [
      "Classify this Awesome MCP six-pack vector database server.",
      "Prefer standard-mcp if uvx or PyPI package evidence confirms mcp-server-qdrant.",
      "Distinguish local Qdrant path mode from remote URL mode; QDRANT_API_KEY should not be required for local mode.",
    ].join(" "),
    expectedSignals: ["standard-import-candidate", "needs-more-evidence", "blocked"],
  },
  {
    id: "sqlite-explorer-fastmcp",
    label: "SQLite Explorer FastMCP",
    targetUrl: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
    category: "awesome-six-pack",
    sourceListUrl: awesomeSixPackUrl,
    rationale: "Awesome MCP six-pack GitHub-only Python source server with a local SQLite file and read-only safety semantics.",
    instructions: [
      "Classify this Awesome MCP six-pack GitHub-only Python source server.",
      "Do not hallucinate a PyPI package. If registry/npm/PyPI/OCI/remote lanes do not fit, surface the need for the custom ToolHive source lane.",
      "A final V2 install must pin the GitHub commit, mount a disposable SQLite database read-only, set SQLITE_DB_PATH, and survive restart.",
    ].join(" "),
    expectedSignals: ["custom-source-build-candidate", "needs-more-evidence", "blocked"],
  },
] as const satisfies readonly McpAutowireEvaluationTarget[];

export async function runMcpAutowireEvaluationMatrix(options: McpAutowireEvaluationOptions): Promise<McpAutowireEvaluationReport> {
  const runDate = options.now ?? new Date();
  const runId = options.runId ?? `mcp-autowire-${runDate.toISOString().replace(/[:.]/g, "-")}`;
  const targets = selectedEvaluationTargets(options.targets ?? mcpAutowireEvaluationTargets, options.targetIds);
  const results: McpAutowireEvaluationCaseResult[] = [];
  const planner = options.planner ?? planMcpAutowire;

  for (const target of targets) {
    const result = await runMcpAutowireEvaluationTarget(target, options, planner);
    results.push(result);
    await options.onCaseResult?.(result);
  }

  return {
    schemaVersion: "ambient-mcp-autowire-evaluation-v1",
    runId,
    generatedAt: runDate.toISOString(),
    providerLabel: options.providerLabel ?? "unknown",
    targets: results.length,
    summary: summarizePromotionSignals(results),
    results,
  };
}

export async function writeMcpAutowireEvaluationReport(report: McpAutowireEvaluationReport, outputDir: string): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, `${report.runId}.json`);
  const markdownPath = join(outputDir, `${report.runId}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  const json = JSON.stringify(redactEvaluationReport(report), null, 2);
  const markdown = mcpAutowireEvaluationReportMarkdown(report);
  await Promise.all([
    writeFile(jsonPath, json, "utf8"),
    writeFile(markdownPath, markdown, "utf8"),
    writeFile(latestJsonPath, json, "utf8"),
    writeFile(latestMarkdownPath, markdown, "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

export async function writeMcpAutowireDogfoodFixtureReport(
  report: McpAutowireDogfoodFixtureReport,
  outputDir: string,
): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, `${report.sourceRunId}.dogfood-fixtures.json`);
  const markdownPath = join(outputDir, `${report.sourceRunId}.dogfood-fixtures.md`);
  const latestJsonPath = join(outputDir, "latest.dogfood-fixtures.json");
  const latestMarkdownPath = join(outputDir, "latest.dogfood-fixtures.md");
  const json = JSON.stringify(report, null, 2);
  const markdown = mcpAutowireDogfoodFixtureReportMarkdown(report);
  await Promise.all([
    writeFile(jsonPath, json, "utf8"),
    writeFile(markdownPath, markdown, "utf8"),
    writeFile(latestJsonPath, json, "utf8"),
    writeFile(latestMarkdownPath, markdown, "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

export async function writeMcpAutowireRuntimeGateReport(
  report: McpAutowireRuntimeGateReport,
  outputDir: string,
): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, `${report.sourceRunId}.runtime-gate.json`);
  const markdownPath = join(outputDir, `${report.sourceRunId}.runtime-gate.md`);
  const latestJsonPath = join(outputDir, "latest.runtime-gate.json");
  const latestMarkdownPath = join(outputDir, "latest.runtime-gate.md");
  const json = JSON.stringify(report, null, 2);
  const markdown = mcpAutowireRuntimeGateReportMarkdown(report);
  await Promise.all([
    writeFile(jsonPath, json, "utf8"),
    writeFile(markdownPath, markdown, "utf8"),
    writeFile(latestJsonPath, json, "utf8"),
    writeFile(latestMarkdownPath, markdown, "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

export function evaluateMcpAutowireRuntimeGate(report: McpAutowireEvaluationReport): McpAutowireRuntimeGateReport {
  const results = report.results.map(runtimeGateCaseResult);
  return {
    schemaVersion: "ambient-mcp-autowire-runtime-gate-v1",
    sourceRunId: report.runId,
    generatedAt: report.generatedAt,
    providerLabel: report.providerLabel,
    targets: results.length,
    summary: runtimeGateSummary(results),
    results,
  };
}

export function mcpAutowireRuntimeGateReportMarkdown(report: McpAutowireRuntimeGateReport): string {
  const rows = report.results.map((result) => [
    escapeMarkdownTable(result.target.label),
    escapeMarkdownTable(result.status),
    escapeMarkdownTable(result.handoffKind ?? "none"),
    escapeMarkdownTable(result.runtimeLane ?? "none"),
    escapeMarkdownTable(result.toolHiveRunSource ?? "none"),
    escapeMarkdownTable(result.runtimeImage ?? "none"),
    String(result.issues.length),
  ]);
  return [
    `# MCP Autowire Runtime Gate - ${report.sourceRunId}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Provider: ${report.providerLabel}`,
    `Targets: ${report.targets}`,
    "",
    "## Summary",
    "",
    ...(["ready", "deferred", "blocked"] as const).map((status) => `- ${status}: ${report.summary[status]}`),
    "",
    "## Results",
    "",
    "| Target | Status | Handoff | Runtime lane | ToolHive run source | Runtime image | Issues |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "## Issues",
    "",
    ...report.results.flatMap((result) => [
      `### ${result.target.label}`,
      result.issues.length ? result.issues.map((issue) => `- ${issue}`).join("\n") : "- none",
      "",
    ]),
  ].join("\n");
}

function runtimeGateCaseResult(result: McpAutowireEvaluationCaseResult): McpAutowireRuntimeGateCaseResult {
  const handoff = result.review?.handoff;
  const candidate = result.plan?.candidate;
  if (!handoff || !candidate) {
    return {
      target: result.target,
      status: "blocked",
      serverArgs: [],
      issues: result.issueSummary.length ? result.issueSummary : ["No reviewed Autowire candidate was available for runtime gating."],
    };
  }

  if (handoff.kind === "standard-mcp-import") {
    const spec = standardMcpImportSpec(candidate);
    const issues = [
      ...spec.blockers,
      ...(spec.toolHiveRunSource ? [] : ["Standard MCP import did not produce a ToolHive run source."]),
    ];
    return {
      target: result.target,
      status: issues.length ? spec.blockedOutcome === "deferred-unsupported-lane" ? "deferred" : "blocked" : "ready",
      handoffKind: handoff.kind,
      runtimeLane: "standard-mcp-import",
      group: TOOLHIVE_AMBIENT_GROUP,
      ...(spec.toolHiveRunSource ? { toolHiveRunSource: spec.toolHiveRunSource } : {}),
      sourceRef: spec.sourceRef,
      ...(spec.runtimeImage ? { runtimeImage: spec.runtimeImage } : {}),
      serverArgs: spec.serverArgs,
      issues,
    };
  }

  if (handoff.kind === "toolhive-registry-install") {
    const registryId = candidate.source.registryId;
    const issues = registryId ? [] : ["ToolHive registry install handoff did not include a registry id."];
    return {
      target: result.target,
      status: issues.length ? "blocked" : "ready",
      handoffKind: handoff.kind,
      runtimeLane: "toolhive-registry",
      group: TOOLHIVE_AMBIENT_GROUP,
      ...(registryId ? { toolHiveRunSource: `toolhive-registry:${registryId}`, sourceRef: `toolhive-registry:${registryId}` } : {}),
      serverArgs: [],
      issues,
    };
  }

  if (handoff.kind === "remote-mcp-proxy") {
    const remoteUrl = candidate.runtime.remote?.url;
    const issues = remoteUrl ? [] : ["Remote MCP proxy handoff did not include a remote URL."];
    return {
      target: result.target,
      status: issues.length ? "blocked" : "ready",
      handoffKind: handoff.kind,
      runtimeLane: "remote-mcp-proxy",
      group: TOOLHIVE_AMBIENT_GROUP,
      ...(remoteUrl ? { toolHiveRunSource: remoteUrl, sourceRef: remoteUrl } : {}),
      serverArgs: [],
      issues,
    };
  }

  if (handoff.kind === "custom-source-build") {
    return {
      target: result.target,
      status: "deferred",
      handoffKind: handoff.kind,
      runtimeLane: "custom-source-build",
      group: TOOLHIVE_AMBIENT_GROUP,
      serverArgs: [],
      issues: ["Custom source build review must emit a pinned custom-image candidate before ToolHive runtime import."],
    };
  }

  if (handoff.kind === "guided-local-bridge") {
    return {
      target: result.target,
      status: "deferred",
      handoffKind: handoff.kind,
      runtimeLane: "guided-local-bridge",
      serverArgs: [],
      issues: ["Guided local bridge setup is not an Ambient-managed ToolHive workload and must complete its own local bridge gate."],
    };
  }

  return {
    target: result.target,
    status: "blocked",
    handoffKind: handoff.kind,
    serverArgs: [],
    issues: result.issueSummary.length ? result.issueSummary : [`Handoff ${handoff.kind} is not ready for runtime import.`],
  };
}

function runtimeGateSummary(results: McpAutowireRuntimeGateCaseResult[]): Record<McpAutowireRuntimeGateStatus, number> {
  return {
    ready: results.filter((result) => result.status === "ready").length,
    deferred: results.filter((result) => result.status === "deferred").length,
    blocked: results.filter((result) => result.status === "blocked").length,
  };
}

export function evaluateMcpAutowireDogfoodFixtures(
  report: McpAutowireEvaluationReport,
  input: {
    fixtures?: readonly McpAutowireDogfoodFixture[];
    requireAll?: boolean;
  } = {},
): McpAutowireDogfoodFixtureReport {
  const fixtures = input.fixtures ?? mcpAutowirePromotedDogfoodFixtures;
  const resultByTargetId = new Map(report.results.map((result) => [result.target.id, result]));
  const results = fixtures.map((fixture) => {
    const result = resultByTargetId.get(fixture.targetId);
    if (!result) {
      const status = input.requireAll ? "failed" : "skipped";
      return {
        fixture,
        status,
        diagnostics: input.requireAll ? [`Target ${fixture.targetId} was not present in evaluation report ${report.runId}.`] : [],
      } satisfies McpAutowireDogfoodFixtureCaseResult;
    }
    const diagnostics = dogfoodFixtureDiagnostics(fixture, result);
    return {
      fixture,
      target: result.target,
      status: diagnostics.length ? "failed" : "passed",
      diagnostics,
    } satisfies McpAutowireDogfoodFixtureCaseResult;
  });
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  return {
    schemaVersion: "ambient-mcp-autowire-dogfood-fixture-report-v1",
    sourceRunId: report.runId,
    generatedAt: report.generatedAt,
    providerLabel: report.providerLabel,
    fixtures: fixtures.length,
    evaluated: results.length - skipped,
    passed,
    failed,
    skipped,
    results,
  };
}

export function mcpAutowireDogfoodFixtureReportMarkdown(report: McpAutowireDogfoodFixtureReport): string {
  const rows = report.results.map((result) => [
    `| ${escapeMarkdownTable(result.fixture.label)} `,
    `${escapeMarkdownTable(result.fixture.targetId)} `,
    `${escapeMarkdownTable(result.status)} `,
    `${result.diagnostics.length} |`,
  ].join("| "));
  const details = report.results.map((result) => [
    `### ${result.fixture.label}`,
    "",
    `- Fixture: ${result.fixture.id}`,
    `- Target: ${result.fixture.targetId}`,
    `- Status: ${result.status}`,
    `- Rationale: ${result.fixture.rationale}`,
    "",
    "Diagnostics:",
    result.diagnostics.length ? result.diagnostics.map((diagnostic) => `- ${diagnostic}`).join("\n") : "- none",
  ].join("\n"));
  return [
    `# MCP Autowire Dogfood Fixture Report - ${report.sourceRunId}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Provider: ${report.providerLabel}`,
    `Fixtures: ${report.fixtures}`,
    `Evaluated: ${report.evaluated}`,
    `Passed: ${report.passed}`,
    `Failed: ${report.failed}`,
    `Skipped: ${report.skipped}`,
    "",
    "| Fixture | Target | Status | Diagnostics |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "## Details",
    "",
    ...details,
  ].join("\n");
}

export function mcpAutowireEvaluationReportMarkdown(report: McpAutowireEvaluationReport): string {
  const rows = report.results.map((result) => [
    `| ${escapeMarkdownTable(result.target.label)} `,
    `${escapeMarkdownTable(result.target.category)} `,
    `${escapeMarkdownTable(result.status)} `,
    `${escapeMarkdownTable(result.promotionSignal)} `,
    `${escapeMarkdownTable(result.plan?.candidate?.recommendedLane ?? "none")} `,
    `${escapeMarkdownTable(result.review?.handoff.kind ?? "none")} `,
    `${result.issueSummary.length} |`,
  ].join("| "));
  const details = report.results.map((result) => [
    `### ${result.target.label}`,
    "",
    `- URL: ${result.target.targetUrl}`,
    `- Rationale: ${result.target.rationale}`,
    `- Promotion signal: ${result.promotionSignal}`,
    `- Status: ${result.status}`,
    `- Candidate: ${result.plan?.candidate?.id ?? "none"}`,
    `- Lane: ${result.plan?.candidate?.recommendedLane ?? "none"}`,
    `- Handoff: ${result.review?.handoff.kind ?? "none"} (${result.review?.handoff.status ?? "none"}, ${result.review?.handoff.outcome ?? "none"})`,
    `- Candidate hash: ${result.plan?.validation.candidateHash ?? "none"}`,
    "",
    "Issues:",
    result.issueSummary.length ? result.issueSummary.map((issue) => `- ${issue}`).join("\n") : "- none",
  ].join("\n"));

  return [
    `# MCP Autowire Evaluation - ${report.runId}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Provider: ${report.providerLabel}`,
    `Targets: ${report.targets}`,
    "",
    "## Summary",
    "",
    ...Object.entries(report.summary).map(([signal, count]) => `- ${signal}: ${count}`),
    "",
    "## Results",
    "",
    "| Target | Category | Status | Promotion signal | Lane | Handoff | Issues |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Details",
    "",
    ...details,
  ].join("\n");
}

function selectedEvaluationTargets(
  targets: readonly McpAutowireEvaluationTarget[],
  targetIds: string[] | undefined,
): McpAutowireEvaluationTarget[] {
  if (!targetIds?.length) return [...targets];
  const byId = new Map(targets.map((target) => [target.id, target]));
  return targetIds.map((id) => {
    const target = byId.get(id);
    if (!target) throw new Error(`Unknown MCP autowire evaluation target '${id}'. Known targets: ${[...byId.keys()].join(", ")}`);
    return target;
  });
}

async function runMcpAutowireEvaluationTarget(
  target: McpAutowireEvaluationTarget,
  options: McpAutowireEvaluationOptions,
  planner: (input: McpAutowirePlanInput, options: McpAutowirePlannerOptions) => Promise<McpAutowirePlanResult>,
): Promise<McpAutowireEvaluationCaseResult> {
  try {
    const plan = await planner({
      targetUrl: target.targetUrl,
      instructions: target.instructions,
      allowedDiscovery: { ...defaultDiscovery, ...target.allowedDiscovery },
    }, options);
    const review = plan.candidate ? reviewMcpAutowireCandidate({ candidate: plan.candidate, expectedCandidateHash: plan.validation.candidateHash }) : undefined;
    const promotionSignal = classifyPromotionSignal(plan, review);
    const status = evaluationStatus(plan, review, promotionSignal);
    const issueSummary = [
      ...plan.validation.blockers.map((issue) => `[plan:${issue.code}] ${issue.message}`),
      ...(review?.review.blockers ?? []).map((issue) => `[review] ${issue}`),
    ];
    if (!target.expectedSignals.includes(promotionSignal)) {
      issueSummary.push(`Unexpected promotion signal ${promotionSignal}; expected one of ${target.expectedSignals.join(", ")}.`);
    }
    return { target, status, promotionSignal, plan, review, issueSummary };
  } catch (error) {
    return {
      target,
      status: "planner-error",
      promotionSignal: "planner-error",
      issueSummary: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function classifyPromotionSignal(plan: McpAutowirePlanResult, review: McpAutowireReviewResult | undefined): McpAutowirePromotionSignal {
  if (!plan.candidate) return "planner-error";
  if (review?.handoff.kind === "toolhive-registry-install" && review.handoff.status === "ready") return "installable-toolhive-registry";
  if (review?.handoff.kind === "custom-source-build") return "custom-source-build-candidate";
  if (plan.candidate.recommendedLane === "standard-mcp") return "standard-import-candidate";
  if (plan.candidate.recommendedLane === "remote-mcp") return "remote-runtime-candidate";
  if (plan.candidate.recommendedLane === "guided-local-bridge") return "guided-local-candidate";
  if (plan.candidate.recommendedLane === "exploratory") return "needs-more-evidence";
  return plan.validation.blockers.length ? "blocked" : "needs-more-evidence";
}

function evaluationStatus(
  plan: McpAutowirePlanResult,
  review: McpAutowireReviewResult | undefined,
  promotionSignal: McpAutowirePromotionSignal,
): McpAutowireEvaluationCaseResult["status"] {
  if (promotionSignal === "planner-error") return "planner-error";
  if (review?.handoff.status === "ready") return "ready";
  if (review?.handoff.status === "deferred") return "deferred";
  if (plan.validation.blockers.length || review?.review.blockers.length) return "blocked";
  return "deferred";
}

function summarizePromotionSignals(results: McpAutowireEvaluationCaseResult[]): Record<McpAutowirePromotionSignal, number> {
  const summary: Record<McpAutowirePromotionSignal, number> = {
    "installable-toolhive-registry": 0,
    "standard-import-candidate": 0,
    "custom-source-build-candidate": 0,
    "remote-runtime-candidate": 0,
    "guided-local-candidate": 0,
    "needs-more-evidence": 0,
    blocked: 0,
    "planner-error": 0,
  };
  for (const result of results) summary[result.promotionSignal] += 1;
  return summary;
}

function dogfoodFixtureDiagnostics(fixture: McpAutowireDogfoodFixture, result: McpAutowireEvaluationCaseResult): string[] {
  const expected = fixture.expected;
  const candidate = result.plan?.candidate;
  const review = result.review;
  const diagnostics: string[] = [];
  if (result.status !== expected.status) diagnostics.push(`Expected status ${expected.status}, got ${result.status}.`);
  if (result.promotionSignal !== expected.promotionSignal) diagnostics.push(`Expected promotionSignal ${expected.promotionSignal}, got ${result.promotionSignal}.`);
  if (!candidate) diagnostics.push("Expected a candidate, got none.");
  if (candidate && candidate.recommendedLane !== expected.recommendedLane) diagnostics.push(`Expected lane ${expected.recommendedLane}, got ${candidate.recommendedLane}.`);
  if (candidate && candidate.runtime.provider !== expected.runtimeProvider) diagnostics.push(`Expected runtime provider ${expected.runtimeProvider}, got ${candidate.runtime.provider}.`);
  if (candidate && candidate.runtime.sourceKind !== expected.runtimeSourceKind) diagnostics.push(`Expected runtime sourceKind ${expected.runtimeSourceKind}, got ${candidate.runtime.sourceKind}.`);
  if (candidate && candidate.runtime.transport !== expected.transport) diagnostics.push(`Expected transport ${expected.transport}, got ${candidate.runtime.transport}.`);
  const allowedNetworkModes = expected.networkModes ?? (expected.networkMode ? [expected.networkMode] : undefined);
  if (candidate && allowedNetworkModes && !allowedNetworkModes.includes(candidate.permissions.network.mode)) {
    diagnostics.push(`Expected network mode ${allowedNetworkModes.join(" or ")}, got ${candidate.permissions.network.mode}.`);
  }
  const localApps = new Set(candidate?.permissions.localApps.map((app) => app.toLowerCase()) ?? []);
  for (const app of expected.requiredLocalApps ?? []) {
    if (!localApps.has(app.toLowerCase())) diagnostics.push(`Expected local app ${app}.`);
  }
  for (const port of expected.requiredAllowPorts ?? []) {
    if (!candidate?.permissions.network.allowPorts.includes(port)) diagnostics.push(`Expected network allow port ${port}.`);
  }
  const evidenceIds = new Set(candidate?.evidence.map((evidence) => evidence.id) ?? []);
  for (const evidenceId of expected.requiredEvidenceIds ?? []) {
    if (!evidenceIds.has(evidenceId)) diagnostics.push(`Expected evidence id ${evidenceId}.`);
  }
  for (const locatorSubstring of expected.requiredEvidenceLocatorSubstrings ?? []) {
    if (!candidate?.evidence.some((evidence) => evidence.locator.includes(locatorSubstring))) {
      diagnostics.push(`Expected evidence locator containing ${locatorSubstring}.`);
    }
  }
  if (!review) {
    diagnostics.push("Expected review result, got none.");
  } else {
    if (review.handoff.kind !== expected.handoffKind) diagnostics.push(`Expected handoff kind ${expected.handoffKind}, got ${review.handoff.kind}.`);
    if (review.handoff.status !== expected.handoffStatus) diagnostics.push(`Expected handoff status ${expected.handoffStatus}, got ${review.handoff.status}.`);
    if (review.handoff.outcome !== expected.handoffOutcome) diagnostics.push(`Expected handoff outcome ${expected.handoffOutcome}, got ${review.handoff.outcome}.`);
    if (expected.forbiddenHandoffKinds?.includes(review.handoff.kind)) diagnostics.push(`Forbidden handoff kind ${review.handoff.kind} was selected.`);
  }
  const issues = result.issueSummary.join("\n");
  for (const substring of expected.requiredIssueSubstrings ?? []) {
    if (!issues.includes(substring)) diagnostics.push(`Expected issue substring ${substring}.`);
  }
  return diagnostics;
}

function redactEvaluationReport(report: McpAutowireEvaluationReport): McpAutowireEvaluationReport {
  return {
    ...report,
    results: report.results.map((result) => ({
      ...result,
      plan: result.plan ? {
        ...result.plan,
        discovery: {
          ...result.plan.discovery,
          toolProgress: [],
        },
      } : undefined,
    })),
  };
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function mcpAutowireEvaluationCaseText(result: McpAutowireEvaluationCaseResult): string {
  if (!result.plan) {
    return [
      `${result.target.label}: planner error`,
      ...result.issueSummary.map((issue) => `- ${issue}`),
    ].join("\n");
  }
  return [
    `# ${result.target.label}`,
    "",
    mcpAutowirePlanResultText(result.plan),
    "",
    result.review ? mcpAutowireReviewResultText(result.review) : "No review result.",
  ].join("\n");
}
