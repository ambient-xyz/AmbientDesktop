import {
  mcpAutowirePhase0Fixtures,
  type McpAutowireCandidate,
} from "./mcpAutowireFacade";
import { defaultMcpCatalogByServerId, loadDefaultMcpCatalog, type McpDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import { McpInstallCatalogPreviewOwner, catalogSourceForRegistryInfo, registryRiskHints } from "./mcpInstallCatalogPreviewOwner";
export { registryInfoToAutowireCandidate } from "./mcpInstallCatalogPreviewOwner";
import {
  McpInstallCatalogStandardImportPreviewOwner,
  type McpPackageMetadataResolver,
  type McpStandardImportPreview,
  type McpStandardImportPreviewInput,
} from "./mcpInstallCatalogStandardImportPreview";
import { McpInstallCatalogInventoryOwner } from "./mcpInstallCatalogInventory";
import type {
  McpCatalogSource,
  McpDefaultCapabilityInstallPreview,
  McpDefaultCatalogUpdatePreview,
  McpInstalledServerInventory,
  McpInstalledServerSummary,
  McpRegistryInstallPreview,
  McpRegistryInstallPreviewInput,
  McpRemoteMcpProxyPreview,
  McpRemoteMcpProxyPreviewInput,
  McpServerSearchInput,
  McpServerSearchResult,
} from "./mcpInstallCatalogTypes";
import { type ToolHiveRuntimeService } from "./mcpToolRuntimeFacade";

export type {
  McpPackageMetadataResolution,
  McpPackageMetadataResolver,
  McpSecretBinding,
  McpStandardImportFallbackRoute,
  McpStandardImportPreview,
  McpStandardImportPreviewInput,
} from "./mcpInstallCatalogStandardImportPreview";
export { standardMcpImportSpec } from "./mcpStandardImportSpec";
export type { McpStandardImportBlockedLaunchShape, StandardMcpImportSpec } from "./mcpStandardImportSpec";
export {
  mcpInstallPreviewReviewState,
  mcpInstallPreviewSecretBindings,
  mcpInstallPreviewSourceIdentity,
} from "./mcpInstallCatalogInstallState";
export {
  mcpDefaultCatalogUpdatePreviewText,
  mcpDefaultCapabilityInstallPreviewText,
  mcpInstalledServersText,
  mcpInstallPreviewText,
  mcpRegistryInstallPreviewText,
  mcpRemoteMcpProxyPreviewText,
  mcpServerSearchResultsText,
  mcpStandardImportPreviewText,
} from "./mcpInstallCatalogText";
export { createPublicMcpPackageMetadataResolver } from "./mcpPackageMetadataResolver";
export type {
  McpCatalogSource,
  McpDefaultCapabilityInstallPreview,
  McpDefaultCatalogUpdateDiff,
  McpDefaultCatalogUpdatePreview,
  McpInstallPreview,
  McpInstalledServerInventory,
  McpInstalledServerSummary,
  McpRegistryInstallPreview,
  McpRegistryInstallPreviewInput,
  McpRemoteMcpProxyPreview,
  McpRemoteMcpProxyPreviewInput,
  McpServerSearchInput,
  McpServerSearchResult,
  McpUnmanagedToolHiveWorkloadSummary,
} from "./mcpInstallCatalogTypes";

export class McpInstallCatalog {
  private readonly defaultCatalog: McpDefaultCatalogDescriptor[];
  private readonly defaultCatalogByServerId: Map<string, McpDefaultCatalogDescriptor>;
  private readonly inventoryOwner: McpInstallCatalogInventoryOwner;
  private readonly previewOwner: McpInstallCatalogPreviewOwner;
  private readonly standardImportPreviewOwner: McpInstallCatalogStandardImportPreviewOwner;

  constructor(
    private readonly toolHive: ToolHiveRuntimeService,
    options: { defaultCatalog?: McpDefaultCatalogDescriptor[]; packageMetadataResolver?: McpPackageMetadataResolver } = {},
  ) {
    this.defaultCatalog = options.defaultCatalog ?? loadDefaultMcpCatalog();
    this.defaultCatalogByServerId = defaultMcpCatalogByServerId(this.defaultCatalog);
    this.inventoryOwner = new McpInstallCatalogInventoryOwner({
      toolHive: this.toolHive,
      defaultCatalogByServerId: this.defaultCatalogByServerId,
    });
    this.previewOwner = new McpInstallCatalogPreviewOwner({
      toolHive: this.toolHive,
      defaultCatalog: this.defaultCatalog,
      defaultCatalogByServerId: this.defaultCatalogByServerId,
    });
    this.standardImportPreviewOwner = new McpInstallCatalogStandardImportPreviewOwner({
      toolHive: this.toolHive,
      packageMetadataResolver: options.packageMetadataResolver,
      registryListWithDefaults: (input) => this.registryListWithDefaults(input),
    });
  }

  async listInstalledServers(): Promise<McpInstalledServerSummary[]> {
    return (await this.listInstalledServerInventory()).servers;
  }

  async listInstalledServerInventory(): Promise<McpInstalledServerInventory> {
    return this.inventoryOwner.listInstalledServerInventory();
  }

  async previewDefaultCatalogUpdate(input: { serverId?: string; workloadName?: string }): Promise<McpDefaultCatalogUpdatePreview> {
    return this.inventoryOwner.previewDefaultCatalogUpdate(input);
  }

  async searchRegistryServers(input: McpServerSearchInput = {}): Promise<McpServerSearchResult[]> {
    const query = normalizeSearchQuery(input.query);
    const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 20)));
    const [registry, state] = await Promise.all([this.registryListWithDefaults(input), this.toolHive.readState()]);
    const installedByServerId = new Map(state.installedServers.map((server) => [server.serverId, server]));
    const results = registry
      .filter(isRecord)
      .map((entry) =>
        registrySearchResult(entry, installedByServerId.get(stringField(entry, ["name"]) ?? ""), catalogSourceForRegistryInfo(entry)),
      );
    results.push(...recommendedStandardMcpImportSearchResults(installedByServerId));
    return scoredSearchResults(results, query).slice(0, limit);
  }

  defaultCapabilityIdForServerId(serverId: string): "scrapling" | undefined {
    return this.defaultCatalogByServerId.get(serverId)?.defaultCapability?.capabilityId;
  }

  async previewRegistryInstall(input: McpRegistryInstallPreviewInput): Promise<McpRegistryInstallPreview> {
    return this.previewOwner.previewRegistryInstall(input);
  }

  async previewStandardMcpImport(input: McpStandardImportPreviewInput): Promise<McpStandardImportPreview> {
    return this.standardImportPreviewOwner.previewStandardMcpImport(input);
  }

  async previewRemoteMcpProxy(input: McpRemoteMcpProxyPreviewInput): Promise<McpRemoteMcpProxyPreview> {
    return this.previewOwner.previewRemoteMcpProxy(input);
  }

  async previewDefaultCapabilityInstall(input: { capabilityId: "scrapling" }): Promise<McpDefaultCapabilityInstallPreview> {
    return this.previewOwner.previewDefaultCapabilityInstall(input);
  }

  private async registryListWithDefaults(input: McpServerSearchInput): Promise<Record<string, unknown>[]> {
    const byId = new Map<string, Record<string, unknown>>(
      this.defaultCatalog.map((descriptor) => [
        descriptor.serverId,
        {
          ...descriptor.registryInfo,
          ambient_default_catalog: true,
        },
      ]),
    );
    try {
      for (const entry of await this.toolHive.registryList({ refresh: input.refresh })) {
        if (!isRecord(entry)) continue;
        const serverId = stringField(entry, ["name"]);
        if (!serverId) continue;
        byId.set(serverId, {
          ...entry,
          ...(byId.has(serverId) ? { ambient_default_catalog: true, ambient_live_registry: true } : { ambient_live_registry: true }),
        });
      }
    } catch (error) {
      if (!byId.size) throw error;
    }
    return [...byId.values()];
  }
}

function registrySearchResult(
  entry: Record<string, unknown>,
  installed: { workloadName: string } | undefined,
  catalogSource: McpCatalogSource,
): McpServerSearchResult {
  const serverId = requiredStringField(entry, ["name"], "registry server name");
  const tags = stringArrayField(entry, ["tags"]);
  const tools = stringArrayField(entry, ["tools"]);
  const riskHints = registryRiskHints(entry);
  const defaultCapability = catalogSource === "ambient-default" || catalogSource === "ambient-default+toolhive-registry";
  return {
    serverId,
    title: stringField(entry, ["title"]) ?? serverId,
    description: stringField(entry, ["description"]) ?? "",
    catalogSource,
    status: stringField(entry, ["status"]),
    tier: stringField(entry, ["tier"]),
    transport: stringField(entry, ["transport"]),
    repositoryUrl: stringField(entry, ["repository_url", "repositoryUrl"]),
    tags,
    tools,
    installed: Boolean(installed),
    ...(installed ? { workloadName: installed.workloadName } : {}),
    riskHints,
    ...(defaultCapability
      ? {
          nextAction: `Call ambient_mcp_server_describe with serverId=${serverId}, then ambient_mcp_server_install after approval. Ambient routes built-in defaults through the default capability installer and runtime setup handoff.`,
        }
      : {}),
  };
}

function recommendedStandardMcpImportSearchResults(installedByServerId: Map<string, { workloadName: string }>): McpServerSearchResult[] {
  const scrapling = mcpAutowirePhase0Fixtures.scrapling as McpAutowireCandidate;
  const targetUrl = scrapling.source.url ?? "https://github.com/D4Vinci/Scrapling";
  const installed = installedByServerId.get(scrapling.id);
  return [
    {
      serverId: scrapling.id,
      title: scrapling.displayName,
      description: "Reviewed Ambient recommendation for public web scraping via Scrapling's Standard MCP server.json/uvx flow.",
      catalogSource: "ambient-recommended-standard-import",
      status: "recommended",
      tier: "ambient-reviewed",
      transport: scrapling.runtime.transport,
      repositoryUrl: targetUrl,
      tags: ["scrapling", "web", "scraping", "fetch", "browser", "standard-mcp", "uvx"],
      tools: scrapling.validationPlan.expectedTools,
      installed: Boolean(installed),
      ...(installed ? { workloadName: installed.workloadName } : {}),
      riskHints: [...scrapling.riskSummary.reasons, "Uses external web or browser/data-extraction capabilities."],
      nextAction: `Run ambient_mcp_autowire_plan with targetUrl=${targetUrl}, then ambient_mcp_autowire_review for the returned candidateRef.`,
    },
  ];
}

function normalizeSearchQuery(query: string | undefined): string {
  const trimmed = (query ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  if (["*", "all", "any", "registry", "toolhive registry", "mcp", "mcp servers"].includes(trimmed)) return "";
  return trimmed;
}

function searchHaystack(entry: McpServerSearchResult): string {
  return [
    entry.serverId,
    entry.title,
    entry.description,
    entry.repositoryUrl ?? "",
    entry.tags.join(" "),
    entry.tools.join(" "),
    entry.riskHints.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function scoredSearchResults(results: McpServerSearchResult[], query: string): McpServerSearchResult[] {
  if (!query) return results;
  return results
    .map((entry, index) => ({ entry, index, score: searchScore(entry, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.entry);
}

function searchScore(entry: McpServerSearchResult, query: string): number {
  const haystack = searchHaystack(entry);
  let score = haystack.includes(query) ? 100 : 0;
  const tokens = expandedSearchTokens(query);
  if (!tokens.length) return score;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 6 ? 6 : 3;
  }
  if (
    (entry.catalogSource === "ambient-default" || entry.catalogSource === "ambient-default+toolhive-registry") &&
    tokens.some((token) => SCRAPING_SEARCH_TOKENS.has(token))
  )
    score += 16;
  if (entry.catalogSource === "ambient-recommended-standard-import" && tokens.some((token) => SCRAPING_SEARCH_TOKENS.has(token)))
    score += 8;
  return score;
}

const SCRAPING_SEARCH_TOKENS = new Set([
  "web",
  "scrape",
  "scraping",
  "scraper",
  "crawl",
  "crawler",
  "fetch",
  "url",
  "browser",
  "automation",
  "puppeteer",
  "playwright",
  "firecrawl",
  "scrapling",
]);

function expandedSearchTokens(query: string): string[] {
  const direct = query
    .split(/[^a-z0-9@._/-]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
  const expanded = new Set(direct);
  if (direct.some((token) => SCRAPING_SEARCH_TOKENS.has(token))) {
    for (const token of SCRAPING_SEARCH_TOKENS) expanded.add(token);
  }
  return [...expanded];
}

const SEARCH_STOP_WORDS = new Set(["a", "an", "and", "for", "of", "on", "the", "to", "with"]);

function requiredStringField(value: Record<string, unknown>, keys: string[], label: string): string {
  const found = stringField(value, keys);
  if (!found) throw new Error(`Missing ${label}.`);
  return found;
}

function stringField(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return undefined;
}

function stringArrayField(value: unknown, keys: string[]): string[] {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const entry = value[key];
    if (Array.isArray(entry))
      return entry.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
