import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpAutowireCandidate } from "./mcpAutowireFacade";

export const MCP_PERMISSION_CORPUS_REPORT_SCHEMA_VERSION = "ambient-mcp-permission-corpus-report-v1";
export const MCP_PERMISSION_CORPUS_FIXTURE_POLICY_SCHEMA_VERSION = "ambient-mcp-permission-corpus-fixture-policy-v1";

export type McpPermissionCorpusPattern =
  | "fixed_remote_api"
  | "public_web_egress"
  | "local_app_bridge"
  | "local_endpoint"
  | "filesystem_access"
  | "persistent_memory"
  | "database"
  | "ambient_secret"
  | "runtime_process"
  | "browser_runtime"
  | "external_account"
  | "unknown_install";

export interface McpPermissionCorpusEntry {
  id: string;
  label: string;
  category: string;
  sourceUrl?: string;
  candidate?: McpAutowireCandidate;
  evidenceText?: string;
}

export interface McpPermissionCorpusEntryResult {
  id: string;
  label: string;
  category: string;
  sourceUrl?: string;
  patterns: McpPermissionCorpusPattern[];
  recommendedLane?: McpAutowireCandidate["recommendedLane"];
  runtimeProvider?: McpAutowireCandidate["runtime"]["provider"];
  runtimeSourceKind?: McpAutowireCandidate["runtime"]["sourceKind"];
  transport?: McpAutowireCandidate["runtime"]["transport"];
  networkMode?: McpAutowireCandidate["permissions"]["network"]["mode"];
  riskLevel?: McpAutowireCandidate["riskSummary"]["level"];
  diagnostics: string[];
}

export interface McpPermissionCorpusPatternSummary {
  pattern: McpPermissionCorpusPattern;
  count: number;
  representativeEntryIds: string[];
  categories: string[];
}

export interface McpPermissionCorpusReport {
  schemaVersion: typeof MCP_PERMISSION_CORPUS_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  entryCount: number;
  expectedPatterns: McpPermissionCorpusPattern[];
  coveredPatterns: McpPermissionCorpusPattern[];
  missingPatterns: McpPermissionCorpusPattern[];
  patterns: McpPermissionCorpusPatternSummary[];
  entries: McpPermissionCorpusEntryResult[];
}

export interface McpPermissionCorpusFixturePolicy {
  schemaVersion: typeof MCP_PERMISSION_CORPUS_FIXTURE_POLICY_SCHEMA_VERSION;
  purpose: "normalizer-calibration-not-registry";
  minimumEntries: number;
  minimumEntriesPerCategory: number;
  minimumEntriesPerPattern: number;
  requiredCategories: string[];
  requiredPatterns: McpPermissionCorpusPattern[];
  requireSyntheticFixtureIds: boolean;
  forbidStaticSourceUrls: boolean;
  forbidEmbeddedCandidates: boolean;
  hiddenRegistryGuardrails: string[];
}

export interface McpPermissionCorpusFixturePolicyReport {
  schemaVersion: typeof MCP_PERMISSION_CORPUS_FIXTURE_POLICY_SCHEMA_VERSION;
  generatedAt: string;
  status: "passed" | "failed";
  policy: McpPermissionCorpusFixturePolicy;
  entryCount: number;
  categoryCounts: Array<{ category: string; count: number }>;
  patternCounts: Array<{ pattern: McpPermissionCorpusPattern; count: number }>;
  diagnostics: string[];
  hiddenRegistryViolations: Array<{ entryId: string; reason: string }>;
}

export interface McpPermissionCorpusReportOptions {
  now?: Date;
  candidates?: Iterable<McpAutowireCandidate>;
  entries?: Iterable<McpPermissionCorpusEntry>;
  expectedPatterns?: McpPermissionCorpusPattern[];
  maxRepresentativesPerPattern?: number;
}

export const defaultMcpPermissionCorpusPatterns: McpPermissionCorpusPattern[] = [
  "fixed_remote_api",
  "public_web_egress",
  "local_app_bridge",
  "local_endpoint",
  "filesystem_access",
  "persistent_memory",
  "database",
  "ambient_secret",
  "runtime_process",
  "browser_runtime",
  "external_account",
  "unknown_install",
];

export const defaultMcpPermissionCorpusFixtureCategories = [
  "browser-runtime",
  "database",
  "external-account",
  "filesystem",
  "fixed-remote-api",
  "local-bridge",
  "memory",
  "public-web",
  "runtime-process",
  "unknown",
];

export const defaultMcpPermissionCorpusFixturePolicy: McpPermissionCorpusFixturePolicy = {
  schemaVersion: MCP_PERMISSION_CORPUS_FIXTURE_POLICY_SCHEMA_VERSION,
  purpose: "normalizer-calibration-not-registry",
  minimumEntries: 50,
  minimumEntriesPerCategory: 3,
  minimumEntriesPerPattern: 5,
  requiredCategories: defaultMcpPermissionCorpusFixtureCategories,
  requiredPatterns: defaultMcpPermissionCorpusPatterns,
  requireSyntheticFixtureIds: true,
  forbidStaticSourceUrls: true,
  forbidEmbeddedCandidates: true,
  hiddenRegistryGuardrails: [
    "Static corpus fixtures are synthetic permission-shape examples, not installable plugin records.",
    "Do not include package coordinates, pinned versions, run commands, registry ids, ToolHive workload plans, source URLs, or embedded autowire candidates in the static fixture list.",
    "Use live dogfood fixtures and install catalog tests for real plugin promotion; use the permission corpus only to keep normalizer categories covered.",
  ],
};

export function buildMcpPermissionCorpusReport(options: McpPermissionCorpusReportOptions): McpPermissionCorpusReport {
  const entries = [
    ...mcpPermissionCorpusEntriesFromCandidates(options.candidates ?? []),
    ...(options.entries ?? []),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const entryResults = entries.map(classifyMcpPermissionCorpusEntry);
  const expectedPatterns = [...(options.expectedPatterns ?? defaultMcpPermissionCorpusPatterns)];
  const coveredPatterns = uniqueSorted(entryResults.flatMap((entry) => entry.patterns));
  const missingPatterns = expectedPatterns.filter((pattern) => !coveredPatterns.includes(pattern));
  const maxRepresentatives = Math.max(1, Math.floor(options.maxRepresentativesPerPattern ?? 3));
  const patterns = coveredPatterns.map((pattern) => {
    const matchingEntries = entryResults.filter((entry) => entry.patterns.includes(pattern));
    return {
      pattern,
      count: matchingEntries.length,
      representativeEntryIds: matchingEntries.slice(0, maxRepresentatives).map((entry) => entry.id),
      categories: uniqueSorted(matchingEntries.map((entry) => entry.category)),
    };
  });
  return {
    schemaVersion: MCP_PERMISSION_CORPUS_REPORT_SCHEMA_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    entryCount: entryResults.length,
    expectedPatterns,
    coveredPatterns,
    missingPatterns,
    patterns,
    entries: entryResults,
  };
}

export function evaluateMcpPermissionCorpusFixturePolicy(options: {
  entries: Iterable<McpPermissionCorpusEntry>;
  now?: Date;
  policy?: McpPermissionCorpusFixturePolicy;
}): McpPermissionCorpusFixturePolicyReport {
  const policy = options.policy ?? defaultMcpPermissionCorpusFixturePolicy;
  const entries = [...options.entries].sort((left, right) => left.id.localeCompare(right.id));
  const corpusReport = buildMcpPermissionCorpusReport({
    now: options.now,
    entries,
    expectedPatterns: policy.requiredPatterns,
    maxRepresentativesPerPattern: 10,
  });
  const categoryCounts = countsBy(entries.map((entry) => entry.category)).map(([category, count]) => ({ category, count }));
  const patternCounts = policy.requiredPatterns.map((pattern) => ({
    pattern,
    count: corpusReport.patterns.find((entry) => entry.pattern === pattern)?.count ?? 0,
  }));
  const diagnostics: string[] = [];
  const hiddenRegistryViolations: Array<{ entryId: string; reason: string }> = [];

  if (entries.length < policy.minimumEntries) {
    diagnostics.push(`Corpus fixture set has ${entries.length} entries; expected at least ${policy.minimumEntries}.`);
  }
  for (const category of policy.requiredCategories) {
    const count = categoryCounts.find((entry) => entry.category === category)?.count ?? 0;
    if (count < policy.minimumEntriesPerCategory) {
      diagnostics.push(`Category ${category} has ${count} entries; expected at least ${policy.minimumEntriesPerCategory}.`);
    }
  }
  for (const { pattern, count } of patternCounts) {
    if (count < policy.minimumEntriesPerPattern) {
      diagnostics.push(`Pattern ${pattern} has ${count} entries; expected at least ${policy.minimumEntriesPerPattern}.`);
    }
  }
  for (const pattern of corpusReport.missingPatterns) {
    diagnostics.push(`Pattern ${pattern} is missing from the fixture corpus.`);
  }

  for (const entry of entries) {
    if (policy.requireSyntheticFixtureIds && !entry.id.startsWith("fixture-")) {
      hiddenRegistryViolations.push({ entryId: entry.id, reason: "Static permission corpus fixtures must use fixture-* ids so they cannot be mistaken for installable server ids." });
    }
    if (policy.forbidStaticSourceUrls && entry.sourceUrl) {
      hiddenRegistryViolations.push({ entryId: entry.id, reason: "Static permission corpus fixtures must not include sourceUrl; real sources belong in dogfood or install catalog fixtures." });
    }
    if (policy.forbidEmbeddedCandidates && entry.candidate) {
      hiddenRegistryViolations.push({ entryId: entry.id, reason: "Static permission corpus fixtures must not embed full autowire candidates or run plans." });
    }
    const registryLikeReason = hiddenRegistryReason(entry);
    if (registryLikeReason) hiddenRegistryViolations.push({ entryId: entry.id, reason: registryLikeReason });
  }

  return {
    schemaVersion: MCP_PERMISSION_CORPUS_FIXTURE_POLICY_SCHEMA_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    status: diagnostics.length || hiddenRegistryViolations.length ? "failed" : "passed",
    policy,
    entryCount: entries.length,
    categoryCounts,
    patternCounts,
    diagnostics,
    hiddenRegistryViolations,
  };
}

export function mcpPermissionCorpusEntriesFromCandidates(candidates: Iterable<McpAutowireCandidate>): McpPermissionCorpusEntry[] {
  return [...candidates].map((candidate) => ({
    id: candidate.id,
    label: candidate.displayName,
    category: candidate.source.kind,
    ...(candidate.source.url ? { sourceUrl: candidate.source.url } : {}),
    candidate,
    evidenceText: candidateEvidenceText(candidate),
  }));
}

export function parseAwesomeMcpMarkdownCorpus(input: {
  markdown: string;
  sourceUrl?: string;
  sections?: string[];
  idPrefix?: string;
}): McpPermissionCorpusEntry[] {
  const wantedSections = new Set((input.sections ?? []).map(slugifyHeading));
  const entries: McpPermissionCorpusEntry[] = [];
  let currentSection = "";
  for (const rawLine of input.markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (heading) {
      currentSection = slugifyHeading(stripMarkdown(heading[2] ?? ""));
      continue;
    }
    if (wantedSections.size && !wantedSections.has(currentSection)) continue;
    const item = rawLine.match(/^\s*[-*]\s+(?:\[[^\]]+\]\(([^)]+)\)|<a\s+href=["']([^"']+)["'][^>]*>(.*?)<\/a>|([^-\n]+))(?:\s+[-–—:]\s+(.+))?/i);
    if (!item) continue;
    const url = item[1] ?? item[2];
    const markdownName = rawLine.match(/^\s*[-*]\s+\[([^\]]+)\]\(/)?.[1];
    const htmlName = item[3];
    const bareName = item[4];
    const label = stripMarkdown(markdownName ?? htmlName ?? bareName ?? "MCP server").trim();
    if (!label) continue;
    const description = stripMarkdown(item[5] ?? rawLine).trim();
    const id = stableCorpusId(input.idPrefix ?? "awesome-mcp", currentSection, label, url ?? description);
    entries.push({
      id,
      label,
      category: currentSection ? `awesome-mcp:${currentSection}` : "awesome-mcp",
      ...(url ? { sourceUrl: url } : input.sourceUrl ? { sourceUrl: `${input.sourceUrl}${currentSection ? `#${currentSection}` : ""}` } : {}),
      evidenceText: `${label}. ${description}`,
    });
  }
  return entries;
}

export async function writeMcpPermissionCorpusReport(report: McpPermissionCorpusReport, outputDir: string): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "mcp-permission-corpus-report.json");
  const markdownPath = join(outputDir, "mcp-permission-corpus-report.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, mcpPermissionCorpusReportMarkdown(report), "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

export function mcpPermissionCorpusReportMarkdown(report: McpPermissionCorpusReport): string {
  const patternRows = report.patterns.map((pattern) => [
    `| ${pattern.pattern} `,
    `${pattern.count} `,
    `${escapeMarkdownTable(pattern.representativeEntryIds.join(", "))} `,
    `${escapeMarkdownTable(pattern.categories.join(", "))} |`,
  ].join("| "));
  const entryRows = report.entries.map((entry) => [
    `| ${escapeMarkdownTable(entry.label)} `,
    `${escapeMarkdownTable(entry.category)} `,
    `${escapeMarkdownTable(entry.patterns.join(", "))} `,
    `${escapeMarkdownTable(entry.diagnostics.join("; ") || "none")} |`,
  ].join("| "));
  return [
    "# MCP Permission Corpus Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Entries: ${report.entryCount}`,
    `Covered patterns: ${report.coveredPatterns.length}`,
    `Missing patterns: ${report.missingPatterns.length ? report.missingPatterns.join(", ") : "none"}`,
    "",
    "## Patterns",
    "",
    "| Pattern | Count | Representatives | Categories |",
    "| --- | ---: | --- | --- |",
    ...patternRows,
    "",
    "## Entries",
    "",
    "| Entry | Category | Patterns | Diagnostics |",
    "| --- | --- | --- | --- |",
    ...entryRows,
    "",
  ].join("\n");
}

function classifyMcpPermissionCorpusEntry(entry: McpPermissionCorpusEntry): McpPermissionCorpusEntryResult {
  const candidate = entry.candidate;
  const text = normalizedCorpusText(entry);
  const patterns = new Set<McpPermissionCorpusPattern>();
  const diagnostics: string[] = [];

  if (candidate) classifyCandidate(candidate, patterns, diagnostics);
  classifyText(text, patterns);
  if (!patterns.size || candidate?.recommendedLane === "exploratory" || candidate?.runtime.sourceKind === "unknown") {
    patterns.add("unknown_install");
  }
  if (patterns.has("public_web_egress") && candidate?.permissions.network.mode === "broad" && !candidate.permissions.network.justification) {
    diagnostics.push("public_web_egress broad network mode has no justification.");
  }
  if (patterns.has("persistent_memory") && candidate && !candidate.openQuestions.some((question) => /retention|delet|persist|memory|storage/i.test(question.question))) {
    const toolEvidence = candidate.validationPlan.expectedTools.join(" ");
    if (!/\b(forget|delete|remove|retention)\b/i.test(toolEvidence)) diagnostics.push("persistent_memory lacks explicit retention/deletion evidence.");
  }

  return {
    id: entry.id,
    label: entry.label,
    category: entry.category,
    ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : {}),
    patterns: [...patterns].sort(),
    ...(candidate ? {
      recommendedLane: candidate.recommendedLane,
      runtimeProvider: candidate.runtime.provider,
      runtimeSourceKind: candidate.runtime.sourceKind,
      transport: candidate.runtime.transport,
      networkMode: candidate.permissions.network.mode,
      riskLevel: candidate.riskSummary.level,
    } : {}),
    diagnostics,
  };
}

function classifyCandidate(
  candidate: McpAutowireCandidate,
  patterns: Set<McpPermissionCorpusPattern>,
  diagnostics: string[],
): void {
  if (candidate.permissions.network.mode === "broad") patterns.add("public_web_egress");
  if (candidate.permissions.network.allowHosts.some((host) => !isLocalHost(host))) patterns.add("fixed_remote_api");
  if (candidate.runtime.remote?.url) patterns.add("fixed_remote_api");
  if (candidate.permissions.network.allowHosts.some(isLocalHost) || candidate.permissions.network.allowPorts.length > 0) {
    if (candidate.permissions.network.mode === "local-only" || candidate.runtime.localBridge) patterns.add("local_endpoint");
  }
  if (candidate.runtime.localBridge || candidate.runtime.provider === "guided-local" || candidate.permissions.localApps.length) patterns.add("local_app_bridge");
  if (candidate.secrets.length) patterns.add("ambient_secret");
  if (candidate.permissions.filesystem.workspaceRead || candidate.permissions.filesystem.workspaceWrite || candidate.permissions.filesystem.extraMounts.length) {
    patterns.add("filesystem_access");
  }
  if (candidate.openQuestions.some((question) => question.impact === "filesystem")) patterns.add("filesystem_access");
  if (candidate.runtime.package || ["npm", "pypi", "oci", "mcpb", "custom-image"].includes(candidate.runtime.sourceKind)) patterns.add("runtime_process");
  if (candidate.permissions.localApps.length && candidate.permissions.network.mode !== "local-only") diagnostics.push("local_app_bridge should normally use local-only network mode.");
}

function classifyText(text: string, patterns: Set<McpPermissionCorpusPattern>): void {
  if (/\b(api key|apikey|token|secret|oauth|authorization|bearer|credential|login)\b/i.test(text)) patterns.add("ambient_secret");
  if (/\b(search|scrap|crawl|browser|web page|webpage|fetch|transcript|youtube|internet|url)\b/i.test(text)) patterns.add("public_web_egress");
  if (/\b(remote mcp|hosted|api endpoint|cloud api|saas|http endpoint|https endpoint)\b/i.test(text)) patterns.add("fixed_remote_api");
  if (/\b(localhost|127\.0\.0\.1|local bridge|desktop app|extension|ghidra|blender|figma)\b/i.test(text)) {
    patterns.add("local_app_bridge");
    patterns.add("local_endpoint");
  }
  if (/\b(file|filesystem|directory|folder|workspace|mount|path|read files|write files)\b/i.test(text)) patterns.add("filesystem_access");
  if (/\b(memory|knowledge|remember|recall|forget|retention|deletion|embedding|vector|store|persist|index)\b/i.test(text)) patterns.add("persistent_memory");
  if (/\b(database|postgres|postgresql|mysql|sqlite|redis|mongodb|supabase|sql)\b/i.test(text)) patterns.add("database");
  if (/\b(npx|uvx|pipx|docker|container|subprocess|command|shell|cli|runtime|package)\b/i.test(text)) patterns.add("runtime_process");
  if (/\b(browser|chrome|chromium|playwright|puppeteer|screenshot|selenium)\b/i.test(text)) {
    patterns.add("browser_runtime");
    patterns.add("runtime_process");
  }
  if (/\b(github|gitlab|slack|google|gmail|drive|calendar|notion|linear|jira|stripe|aws|azure|cloudflare|external account|workspace account|cloud account|saas)\b/i.test(text)) patterns.add("external_account");
}

function candidateEvidenceText(candidate: McpAutowireCandidate): string {
  return [
    candidate.displayName,
    candidate.source.packageName,
    candidate.runtime.package?.identifier,
    candidate.runtime.package?.runtimeHint,
    candidate.runtime.remote?.url,
    candidate.runtime.localBridge?.commandHint,
    ...(candidate.runtime.localBridge?.setupSteps ?? []),
    ...candidate.permissions.localApps,
    candidate.permissions.network.justification,
    ...candidate.validationPlan.preflights,
    ...candidate.validationPlan.expectedTools,
    ...candidate.evidence.map((evidence) => `${evidence.type} ${evidence.locator} ${evidence.summary}`),
    ...candidate.openQuestions.map((question) => question.question),
    ...candidate.riskSummary.reasons,
  ].filter(Boolean).join(" ");
}

function normalizedCorpusText(entry: McpPermissionCorpusEntry): string {
  return [
    entry.label,
    entry.category,
    entry.sourceUrl,
    entry.evidenceText,
    entry.candidate ? candidateEvidenceText(entry.candidate) : undefined,
  ].filter(Boolean).join(" ").toLowerCase();
}

function uniqueSorted<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort();
}

function countsBy(values: Iterable<string>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function hiddenRegistryReason(entry: McpPermissionCorpusEntry): string | undefined {
  const text = [entry.label, entry.sourceUrl, entry.evidenceText].filter(Boolean).join(" ");
  if (/\b(?:thv|toolhive)\s+run\b/i.test(text)) return "Static permission corpus fixtures must not include ToolHive run commands.";
  if (/\b(?:npx|uvx|pipx|docker)\s+(?:run|exec|pull|install)\b/i.test(text)) return "Static permission corpus fixtures must not include package-manager or container install/run commands.";
  if (/\b(?:ghcr\.io\/|docker\.io\/|npmjs\.com\/package|pypi\.org\/project)\b/i.test(text)) return "Static permission corpus fixtures must not include package registry coordinates.";
  if (/\b(?:sha256:[a-f0-9]{16,}|@[0-9]+\.[0-9]+\.[0-9]+)\b/i.test(text)) return "Static permission corpus fixtures must not include version pins or image digests.";
  if (/\bambient-secret-ref:v1:[a-f0-9]{64}\b/i.test(text)) return "Static permission corpus fixtures must not include Ambient secret references.";
  return undefined;
}

function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "0.0.0.0";
}

function stripMarkdown(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function slugifyHeading(value: string): string {
  return stripMarkdown(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stableCorpusId(prefix: string, section: string, label: string, discriminator: string): string {
  const base = slugifyHeading(`${prefix}-${section}-${label}`).slice(0, 80) || "mcp-corpus-entry";
  const hash = Math.abs(hashString(`${section}\0${label}\0${discriminator}`)).toString(36).slice(0, 6);
  return `${base}-${hash}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
