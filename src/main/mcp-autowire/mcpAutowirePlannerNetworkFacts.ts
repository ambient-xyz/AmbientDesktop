import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "./mcpAutowireAmbientFacade";
import {
  callWorkflowPiJson,
  DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS,
  type WorkflowPiJsonCallInput,
  type WorkflowPiProgress,
} from "./mcpAutowireWorkflowFacade";

const NETWORK_REQUIREMENTS_SCHEMA_NAME = "ambient_mcp_autowire_network_requirements";

export type McpAutowireNetworkConfidence = "low" | "medium" | "high";

export interface McpAutowireNetworkHostFact {
  host: string;
  ports: number[];
  purpose: string;
  confidence: McpAutowireNetworkConfidence;
  evidence: Array<{ locator: string; summary: string }>;
}

export interface McpAutowireNetworkFacts {
  runtimeHosts: McpAutowireNetworkHostFact[];
  nonRuntimeHosts: Array<{ host: string; reason: string }>;
  needsBroadNetwork: boolean;
  openQuestions: string[];
}

export interface McpAutowireNetworkPackageIdentity {
  registryType: "npm" | "pypi";
  identifier: string;
  locator?: string;
}

interface McpAutowireNetworkEvidenceEntry {
  locator: string;
  text: string;
}

interface McpAutowireNetworkDiscoveryFetch {
  url: string;
  status: string;
  contentType?: string;
  textPreview?: string;
}

interface McpAutowireNetworkDiscoverySearch {
  query: string;
  results?: Array<{
    rawUrl: string;
    path: string;
    reason: string;
  }>;
}

export interface McpAutowireNetworkEvidenceInput {
  target?: unknown;
  instructions?: string;
  discoverySummary: string;
  fetches: McpAutowireNetworkDiscoveryFetch[];
  searches: McpAutowireNetworkDiscoverySearch[];
}

interface McpAutowireNetworkPlannerOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  idleTimeoutMs?: number;
  onProgress?: (progress: WorkflowPiProgress) => void;
  textCall?: WorkflowPiJsonCallInput<unknown>["textCall"];
}

export async function resolveMcpAutowireNetworkFacts(input: {
  targetUrl: string;
  sessionId: string;
  signal?: AbortSignal;
  systemPrompt: string;
  options: McpAutowireNetworkPlannerOptions;
  evidence: McpAutowireNetworkEvidenceInput;
  packageIdentity?: McpAutowireNetworkPackageIdentity;
}): Promise<McpAutowireNetworkFacts | undefined> {
  if (!input.packageIdentity) return undefined;
  const deterministic = deterministicMcpAutowireNetworkFacts(input.evidence);
  if (!deterministic.runtimeHosts.length) return deterministic;

  try {
    return await callWorkflowPiJson<McpAutowireNetworkFacts>({
      apiKey: input.options.apiKey,
      baseUrl: input.options.baseUrl,
      model: input.options.model ?? AMBIENT_DEFAULT_MODEL,
      schemaName: NETWORK_REQUIREMENTS_SCHEMA_NAME,
      sessionId: input.sessionId,
      responseSchema: mcpAutowireNetworkRequirementsPromptSchema(),
      systemPrompt: input.systemPrompt,
      prompt: mcpAutowireNetworkRequirementsPrompt({
        targetUrl: input.targetUrl,
        packageIdentity: input.packageIdentity,
        deterministic,
        evidenceEntries: mcpAutowireNetworkEvidenceEntries(input.evidence),
      }),
      validate: (value) => validateMcpAutowireNetworkFacts(value, deterministic),
      reasoning: false,
      maxTokens: 1_500,
      idleTimeoutMs: input.options.idleTimeoutMs ?? DEFAULT_WORKFLOW_PI_IDLE_TIMEOUT_MS,
      onProgress: input.options.onProgress,
      retryPolicy: aggressiveAmbientRetryPolicy(),
      signal: input.signal,
      textCall: input.options.textCall,
    });
  } catch {
    return deterministic;
  }
}

function mcpAutowireNetworkRequirementsPromptSchema(): unknown {
  return {
    type: "object",
    additionalProperties: false,
    required: ["runtimeHosts", "nonRuntimeHosts", "needsBroadNetwork", "openQuestions"],
    properties: {
      runtimeHosts: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["host", "ports", "purpose", "confidence", "evidence"],
          properties: {
            host: { type: "string", minLength: 1 },
            ports: { type: "array", items: { type: "integer", minimum: 1, maximum: 65535 } },
            purpose: { type: "string", minLength: 1 },
            confidence: { enum: ["low", "medium", "high"] },
            evidence: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["locator", "summary"],
                properties: {
                  locator: { type: "string", minLength: 1 },
                  summary: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
      },
      nonRuntimeHosts: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["host", "reason"],
          properties: {
            host: { type: "string", minLength: 1 },
            reason: { type: "string", minLength: 1 },
          },
        },
      },
      needsBroadNetwork: { type: "boolean" },
      openQuestions: { type: "array", maxItems: 6, items: { type: "string", minLength: 1 } },
    },
  };
}

function mcpAutowireNetworkRequirementsPrompt(input: {
  targetUrl: string;
  packageIdentity: McpAutowireNetworkPackageIdentity;
  deterministic: McpAutowireNetworkFacts;
  evidenceEntries: McpAutowireNetworkEvidenceEntry[];
}): string {
  const evidence = boundedNetworkEvidenceText(input.evidenceEntries);
  return [
    "Extract runtime outbound network requirements for a package-backed MCP server install.",
    "",
    `Target: ${input.targetUrl}`,
    `Package: ${input.packageIdentity.registryType}:${input.packageIdentity.identifier}`,
    input.deterministic.runtimeHosts.length
      ? `Deterministic candidate hosts: ${input.deterministic.runtimeHosts.map((fact) => fact.host).join(", ")}`
      : "Deterministic candidate hosts: none",
    "",
    "Return only public hosts the MCP server itself is likely to contact at runtime after installation.",
    "Exclude package registries, source-control hosts, documentation, images, badges, telemetry on GitHub pages, Copilot/GitHub asset APIs, and URLs used only for installing or reading evidence.",
    "If every deterministic candidate host is documentation, badge, social, portfolio, or source metadata noise, return runtimeHosts as [] and list those hosts under nonRuntimeHosts.",
    "Use hostnames only, without scheme, path, query, or credentials. Default HTTPS APIs to port 443 unless evidence states another port.",
    "If evidence shows a runtime API but no stable public host, set needsBroadNetwork true and add an open question.",
    "",
    "Evidence:",
    evidence || "(no bounded network evidence)",
  ].join("\n");
}

function boundedNetworkEvidenceText(entries: McpAutowireNetworkEvidenceEntry[]): string {
  let remaining = 24_000;
  const parts: string[] = [];
  for (const entry of entries) {
    if (remaining <= 0) break;
    const text = entry.text.replace(/\s+$/g, "").slice(0, Math.max(0, remaining));
    remaining -= text.length;
    parts.push([`[${entry.locator}]`, text].join("\n"));
  }
  return parts.join("\n\n");
}

function validateMcpAutowireNetworkFacts(value: unknown, fallback: McpAutowireNetworkFacts): McpAutowireNetworkFacts {
  if (!isRecord(value)) throw new Error("network requirements response must be an object");
  const runtimeHosts = Array.isArray(value.runtimeHosts)
    ? value.runtimeHosts.flatMap((entry) => normalizeNetworkHostFact(entry)).slice(0, 6)
    : [];
  const nonRuntimeHosts = Array.isArray(value.nonRuntimeHosts)
    ? value.nonRuntimeHosts.flatMap((entry) => normalizeNonRuntimeHostFact(entry)).slice(0, 12)
    : [];
  const emptyRuntimeOverridesFallback =
    fallback.runtimeHosts.length > 0 && runtimeHosts.length === 0 && nonRuntimeHostsCoverFallback(nonRuntimeHosts, fallback.runtimeHosts);
  if (fallback.runtimeHosts.length && !runtimeHosts.length && !emptyRuntimeOverridesFallback) {
    throw new Error(
      "runtimeHosts cannot be empty when deterministic evidence found host candidates unless nonRuntimeHosts explains each candidate",
    );
  }
  const openQuestions = Array.isArray(value.openQuestions)
    ? value.openQuestions
        .filter((question): question is string => typeof question === "string" && Boolean(question.trim()))
        .map((question) => question.trim())
        .slice(0, 6)
    : [];
  return {
    runtimeHosts: runtimeHosts.length ? runtimeHosts : emptyRuntimeOverridesFallback ? [] : fallback.runtimeHosts,
    nonRuntimeHosts,
    needsBroadNetwork: value.needsBroadNetwork === true,
    openQuestions,
  };
}

function nonRuntimeHostsCoverFallback(
  nonRuntimeHosts: Array<{ host: string; reason: string }>,
  fallbackHosts: McpAutowireNetworkHostFact[],
): boolean {
  const nonRuntime = new Set(nonRuntimeHosts.map((entry) => entry.host));
  return fallbackHosts.every((fact) => nonRuntime.has(fact.host));
}

function normalizeNetworkHostFact(value: unknown): McpAutowireNetworkHostFact[] {
  if (!isRecord(value)) return [];
  const host = normalizeRuntimeHost(typeof value.host === "string" ? value.host : "");
  if (!host) return [];
  const ports = uniqueSortedNumbers(
    Array.isArray(value.ports) ? value.ports.filter((port): port is number => Number.isInteger(port) && port > 0 && port <= 65535) : [443],
  );
  const confidence =
    value.confidence === "low" || value.confidence === "medium" || value.confidence === "high" ? value.confidence : "medium";
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.flatMap((entry) => normalizeNetworkEvidenceReference(entry)).slice(0, 3)
    : [];
  return [
    {
      host,
      ports: ports.length ? ports : [443],
      purpose: typeof value.purpose === "string" && value.purpose.trim() ? value.purpose.trim().slice(0, 240) : "Runtime API access.",
      confidence,
      evidence,
    },
  ];
}

function normalizeNonRuntimeHostFact(value: unknown): Array<{ host: string; reason: string }> {
  if (!isRecord(value)) return [];
  const host = normalizeAnyHostname(typeof value.host === "string" ? value.host : "");
  if (!host) return [];
  return [
    {
      host,
      reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim().slice(0, 240) : "Not a runtime API host.",
    },
  ];
}

function normalizeNetworkEvidenceReference(value: unknown): Array<{ locator: string; summary: string }> {
  if (!isRecord(value)) return [];
  const locator = typeof value.locator === "string" && value.locator.trim() ? value.locator.trim().slice(0, 500) : undefined;
  const summary = typeof value.summary === "string" && value.summary.trim() ? value.summary.trim().slice(0, 300) : undefined;
  return locator && summary ? [{ locator, summary }] : [];
}

export function deterministicMcpAutowireNetworkFacts(input: McpAutowireNetworkEvidenceInput): McpAutowireNetworkFacts {
  const factsByHost = new Map<string, McpAutowireNetworkHostFact & { score: number }>();
  for (const entry of mcpAutowireNetworkEvidenceEntries(input)) {
    for (const match of entry.text.matchAll(/\bhttps?:\/\/([A-Za-z0-9.-]+)(?::(\d{1,5}))?(?:[/?#:)\\\]\s"']|$)/g)) {
      const host = normalizeRuntimeHost(match[1] ?? "");
      if (!host) continue;
      const port = match[2] ? Number(match[2]) : 443;
      if (!Number.isInteger(port) || port <= 0 || port > 65535) continue;
      const context = hostContext(entry.text, match.index ?? 0);
      const score = runtimeHostScore(host, context, entry.locator);
      if (score <= 0) continue;
      const existing = factsByHost.get(host);
      const evidence = { locator: entry.locator, summary: summarizeHostEvidence(host, context) };
      if (existing) {
        existing.score += score;
        existing.ports = uniqueSortedNumbers([...existing.ports, port]);
        if (!existing.evidence.some((candidate) => candidate.locator === evidence.locator && candidate.summary === evidence.summary)) {
          existing.evidence = [...existing.evidence, evidence].slice(0, 3);
        }
      } else {
        factsByHost.set(host, {
          host,
          ports: [port],
          purpose: "Runtime API access.",
          confidence: score >= 20 ? "high" : score >= 10 ? "medium" : "low",
          evidence: [evidence],
          score,
        });
      }
    }
  }
  const runtimeHosts = [...factsByHost.values()]
    .sort((a, b) => b.score - a.score || a.host.localeCompare(b.host))
    .slice(0, 6)
    .map((fact) => ({
      host: fact.host,
      ports: fact.ports,
      purpose: fact.purpose,
      confidence: fact.confidence,
      evidence: fact.evidence,
    }));
  const evidenceText = mcpAutowireNetworkEvidenceEntries(input)
    .map((entry) => entry.text)
    .join("\n");
  const needsBroadNetwork =
    !runtimeHosts.length && /\b(?:api|http|https|fetch\(|axios|requests|httpx|aiohttp|urllib|websocket)\b/i.test(evidenceText);
  return {
    runtimeHosts,
    nonRuntimeHosts: [],
    needsBroadNetwork,
    openQuestions: needsBroadNetwork ? ["Which fixed public API hosts should this MCP server be allowed to contact at runtime?"] : [],
  };
}

function mcpAutowireNetworkEvidenceEntries(input: McpAutowireNetworkEvidenceInput): McpAutowireNetworkEvidenceEntry[] {
  return [
    ...(input.instructions ? [{ locator: "user-instructions", text: input.instructions }] : []),
    ...(input.discoverySummary ? [{ locator: "discovery-summary", text: input.discoverySummary }] : []),
    ...input.fetches
      .filter((fetch) => fetch.status === "fetched" && Boolean(classificationFetchPreview(fetch)))
      .map((fetch) => ({ locator: fetch.url, text: classificationFetchPreview(fetch) })),
    ...input.searches.flatMap((search) =>
      (search.results ?? []).map((result) => ({
        locator: result.rawUrl,
        text: `${search.query}\n${result.path}\n${result.reason}`,
      })),
    ),
  ];
}

export function classificationFetchPreview(entry: McpAutowireNetworkDiscoveryFetch): string {
  if (entry.status !== "fetched" || !entry.textPreview) return "";
  if (entry.contentType?.toLowerCase().includes("text/html")) return "";
  return entry.textPreview.slice(0, 12_000);
}

function runtimeHostScore(host: string, context: string, locator: string): number {
  const text = `${host}\n${context}\n${locator}`.toLowerCase();
  if (isIgnoredRuntimeHost(host)) return -100;
  let score = 4;
  if (
    /\b(api|endpoint|base url|baseurl|powered by|provider|service|fetch|request|requests|httpx|axios|client|cep|holiday|holidays)\b/.test(
      text,
    )
  )
    score += 10;
  if (/\b(runtime|server|tool|mcp|query|lookup|retrieve|data)\b/.test(text)) score += 6;
  if (/\b(readme|docs?|badge|shield|asset|script|style|image|logo|sponsor|github page|copilot|registry|package)\b/.test(text)) score -= 6;
  if (host.startsWith("api.") || host.includes(".api.")) score += 2;
  return score;
}

function hostContext(text: string, index: number): string {
  return text.slice(Math.max(0, index - 240), Math.min(text.length, index + 360));
}

function summarizeHostEvidence(host: string, context: string): string {
  const compact = context.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 220) : `Evidence referenced ${host}.`;
}

export function bestNetworkEvidenceLocator(facts: McpAutowireNetworkFacts): string | undefined {
  return facts.runtimeHosts.flatMap((fact) => fact.evidence.map((entry) => entry.locator)).find(Boolean);
}

export function networkJustification(facts: McpAutowireNetworkFacts, packageName: string): string {
  const hosts = facts.runtimeHosts.map((fact) => fact.host);
  const purposes = facts.runtimeHosts.map((fact) => fact.purpose).filter(Boolean);
  return purposes.length
    ? `${packageName} needs outbound access to ${hosts.join(", ")} for ${purposes[0]}`
    : `${packageName} needs outbound access to its documented runtime API host${hosts.length === 1 ? "" : "s"} ${hosts.join(", ")}.`;
}

function normalizeRuntimeHost(value: string): string | undefined {
  const host = normalizeAnyHostname(value);
  if (!host || isIgnoredRuntimeHost(host) || !isPublicDomainHost(host)) return undefined;
  return host;
}

function normalizeAnyHostname(value: string): string | undefined {
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?:#].*$/, "")
    .replace(/^\.+|\.+$/g, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) return undefined;
  return trimmed;
}

function isPublicDomainHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;
  return true;
}

function isIgnoredRuntimeHost(host: string): boolean {
  return ignoredRuntimeHostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) || ignoredRuntimeHostExact.has(host);
}

export function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0 && value <= 65535))].sort((a, b) => a - b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const ignoredRuntimeHostExact = new Set(["api.githubcopilot.com", "github-cloud.s3.amazonaws.com", "github.gi"]);

const ignoredRuntimeHostSuffixes = [
  "crates.io",
  "docs.rs",
  "github.com",
  "githubusercontent.com",
  "githubassets.com",
  "githubcopilot.com",
  "npmjs.com",
  "pypi.org",
  "pythonhosted.org",
  "shields.io",
  "img.shields.io",
  "badge.fury.io",
  "badgen.net",
  "snyk.io",
  "w3.org",
  "schema.org",
];
