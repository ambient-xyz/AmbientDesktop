import type { SearchRoutingSettings, WebResearchProviderConfig, WebResearchProviderRole } from "../../shared/webResearchTypes";
import type { AmbientCliPackageCatalog } from "./webResearchAmbientCliFacade";
import type { ProviderCatalogEntry } from "./webResearchProviderFacade";
import { getProviderCatalogEntries, providerSelectionGuidanceForProvider } from "./webResearchProviderFacade";
import {
  normalizeSearchRoutingSettingsWithWebResearch,
} from "./webResearchProviderStack";
import { webResearchSettingsWithDynamicProviderCatalogs } from "./searchSettingsTools";
import type { McpToolDescriptor } from "./webResearchMcpFacade";

export interface WebResearchProviderDiscoveryInput {
  settings?: SearchRoutingSettings;
  ambientCliCatalog?: AmbientCliPackageCatalog;
  mcpTools?: McpToolDescriptor[];
  providerCatalogEntries?: ProviderCatalogEntry[];
  query?: string;
  role?: WebResearchProviderRole;
  limit?: number;
}

export interface WebResearchProviderDescribeInput extends WebResearchProviderDiscoveryInput {
  provider: string;
}

export interface WebResearchConfiguredProviderCandidate {
  source: "configured";
  providerId: string;
  label: string;
  kind: WebResearchProviderConfig["kind"];
  roles: WebResearchProviderRole[];
  configuredStatus: WebResearchProviderConfig["status"];
  activeRoles: WebResearchProviderRole[];
  order: Partial<Record<WebResearchProviderRole, number>>;
  privacyLabel?: string;
  optionalSecretRefs: string[];
  ambientCli?: WebResearchProviderConfig["ambientCli"];
  mcp?: WebResearchProviderConfig["mcp"];
}

export interface WebResearchCatalogProviderCandidate {
  source: "known-addable";
  catalogId: string;
  displayName: string;
  providerName?: string;
  capabilityArea: string;
  installerShape?: string;
  recommendationTier: string;
  providerKind: string;
  summary: string;
  requiredSecrets: string[];
  optionalSecrets: string[];
  networkHosts: string[];
  firstPartyTemplate?: ProviderCatalogEntry["firstPartyTemplate"];
  capabilityBuilderDefaults?: ProviderCatalogEntry["capabilityBuilderDefaults"];
  validationTarget: string;
  selectionGuidance: string[];
}

export interface WebResearchProviderDiscoveryResult {
  schemaVersion: "ambient-web-research-provider-discovery-v1";
  query?: string;
  role?: WebResearchProviderRole;
  configuredProviders: WebResearchConfiguredProviderCandidate[];
  knownAddableProviders: WebResearchCatalogProviderCandidate[];
}

export interface WebResearchProviderDescribeResult extends WebResearchProviderDiscoveryResult {
  selectedProvider?: WebResearchConfiguredProviderCandidate | WebResearchCatalogProviderCandidate;
}

export function buildWebResearchProviderDiscovery(input: WebResearchProviderDiscoveryInput = {}): WebResearchProviderDiscoveryResult {
  const query = normalizeQuery(input.query);
  const role = input.role;
  const settings = webResearchSettingsWithDynamicProviderCatalogs(input.settings, {
    ambientCliCatalog: input.ambientCliCatalog,
    mcpTools: input.mcpTools,
  });
  const stack = normalizeSearchRoutingSettingsWithWebResearch(settings).webResearch;
  const configuredProviders = stack.providers
    .map((provider) => configuredCandidate(provider, stack.preferences))
    .filter((candidate) => candidateMatches(candidate, query, role));
  const knownAddableProviders = (input.providerCatalogEntries ?? getProviderCatalogEntries())
    .filter((entry) => entry.capabilityArea === "web-search" && entry.installerShape === "search-provider")
    .map(catalogCandidate)
    .filter((candidate) => candidateMatches(candidate, query, role));
  const limit = boundedDiscoveryLimit(input.limit);
  return {
    schemaVersion: "ambient-web-research-provider-discovery-v1",
    ...(query ? { query } : {}),
    ...(role ? { role } : {}),
    configuredProviders: configuredProviders.slice(0, limit),
    knownAddableProviders: knownAddableProviders.slice(0, limit),
  };
}

export function describeWebResearchProvider(input: WebResearchProviderDescribeInput): WebResearchProviderDescribeResult {
  const result = buildWebResearchProviderDiscovery({
    ...input,
    query: input.provider,
    limit: input.limit ?? 10,
  });
  const alias = normalizeAlias(input.provider);
  const selectedProvider = [...result.configuredProviders, ...result.knownAddableProviders]
    .find((candidate) => providerAliases(candidate).includes(alias));
  return {
    ...result,
    ...(selectedProvider ? { selectedProvider } : {}),
  };
}

export function webResearchProviderDiscoveryText(result: WebResearchProviderDiscoveryResult): string {
  const lines = [
    "Ambient web research provider discovery",
    result.query ? `Query: ${result.query}` : undefined,
    result.role ? `Role: ${result.role}` : undefined,
    "",
    "Configured providers:",
    ...formatConfiguredProviders(result.configuredProviders),
    "",
    "Known addable provider cards:",
    ...formatKnownAddableProviders(result.knownAddableProviders),
    "",
    "Use web_research_provider_describe before claiming whether a missing provider is known or addable.",
    "Use web_research_preferences_update only for installed/configured providers. For known addable provider cards, run ambient_provider_catalog through ambient_tool_search, ambient_tool_describe, and ambient_tool_call, then run ambient_capability_builder_plan.",
    "Do not search ToolHive or MCP registries for a provider that already has an Ambient provider catalog card unless the card or user explicitly calls for that lane.",
  ].filter((line): line is string => typeof line === "string");
  return lines.join("\n");
}

export function webResearchProviderDescribeText(result: WebResearchProviderDescribeResult, provider: string): string {
  const lines = [
    "Ambient web research provider description",
    `Provider query: ${provider}`,
    "",
  ];
  if (!result.selectedProvider) {
    lines.push(
      "No exact provider match was found.",
      "",
      webResearchProviderDiscoveryText(result),
    );
    return lines.join("\n");
  }
  const selected = result.selectedProvider;
  if (selected.source === "configured") {
    lines.push(...[
      `${selected.label} (${selected.providerId})`,
      `State: ${selected.configuredStatus}; source=configured; kind=${selected.kind}.`,
      `Roles: ${selected.roles.join(", ")}.`,
      `Active order: ${formatActiveRoles(selected)}.`,
      selected.privacyLabel ? `Privacy: ${selected.privacyLabel}` : undefined,
      selected.optionalSecretRefs.length ? `Secrets: ${selected.optionalSecretRefs.join(", ")}.` : undefined,
      selected.ambientCli ? `Ambient CLI: package=${selected.ambientCli.packageName}; command=${selected.ambientCli.commandName}.` : undefined,
      selected.mcp ? `MCP: server=${selected.mcp.serverId ?? "unknown"}; workload=${selected.mcp.workloadName ?? "unknown"}; tool=${selected.mcp.toolName}.` : undefined,
      "",
      "This provider is already registered in Ambient's web research stack. Use web_research_preferences_update to change persistent order, or providerOrder on web_research_search/web_research_fetch for a one-call override.",
    ].filter((line): line is string => typeof line === "string"));
    return lines.join("\n");
  }
  lines.push(...[
    `${selected.displayName} (${selected.catalogId})`,
    `State: known-addable; source=provider-catalog; installer=${selected.installerShape ?? "unspecified"}; tier=${selected.recommendationTier}.`,
    selected.providerName ? `Provider name: ${selected.providerName}.` : undefined,
    `Summary: ${selected.summary}`,
    selected.requiredSecrets.length ? `Required secrets: ${selected.requiredSecrets.join(", ")}.` : "Required secrets: none.",
    selected.optionalSecrets.length ? `Optional secrets: ${selected.optionalSecrets.join(", ")}.` : undefined,
    selected.networkHosts.length ? `Network hosts: ${selected.networkHosts.join(", ")}.` : undefined,
    selected.firstPartyTemplate?.available ? `First-party template: ${selected.firstPartyTemplate.templateId ?? "available"}.` : undefined,
    `Validation target: ${selected.validationTarget}`,
    selected.selectionGuidance.length ? `Selection guidance: ${selected.selectionGuidance.join(" ")}` : undefined,
    "",
    "This provider is not necessarily enabled. To add it, use ambient_tool_search, ambient_tool_describe, and ambient_tool_call to run ambient_provider_catalog for the current card, then run ambient_capability_builder_plan. Do not route this through ToolHive/MCP search unless a provider card or user explicitly selects that lane.",
  ].filter((line): line is string => typeof line === "string"));
  return lines.join("\n");
}

function configuredCandidate(
  provider: WebResearchProviderConfig,
  preferences: Partial<Record<WebResearchProviderRole, string[]>>,
): WebResearchConfiguredProviderCandidate {
  const order: Partial<Record<WebResearchProviderRole, number>> = {};
  const activeRoles: WebResearchProviderRole[] = [];
  for (const role of ["search", "fetch", "interactive_browser"] as WebResearchProviderRole[]) {
    const index = preferences[role]?.indexOf(provider.providerId) ?? -1;
    if (index >= 0) {
      activeRoles.push(role);
      order[role] = index + 1;
    }
  }
  return {
    source: "configured",
    providerId: provider.providerId,
    label: provider.label,
    kind: provider.kind,
    roles: [...provider.roles],
    configuredStatus: provider.status,
    activeRoles,
    order,
    ...(provider.privacyLabel ? { privacyLabel: provider.privacyLabel } : {}),
    optionalSecretRefs: [...(provider.optionalSecretRefs ?? [])],
    ...(provider.ambientCli ? { ambientCli: { ...provider.ambientCli } } : {}),
    ...(provider.mcp ? { mcp: { ...provider.mcp } } : {}),
  };
}

function catalogCandidate(entry: ProviderCatalogEntry): WebResearchCatalogProviderCandidate {
  return {
    source: "known-addable",
    catalogId: entry.id,
    displayName: entry.displayName,
    ...(entry.capabilityBuilderDefaults?.provider ? { providerName: entry.capabilityBuilderDefaults.provider } : {}),
    capabilityArea: entry.capabilityArea,
    ...(entry.installerShape ? { installerShape: entry.installerShape } : {}),
    recommendationTier: entry.recommendationTier,
    providerKind: entry.providerKind,
    summary: entry.recommendationSummary,
    requiredSecrets: entry.secrets.filter((secret) => secret.required).map((secret) => secret.envName),
    optionalSecrets: entry.secrets.filter((secret) => !secret.required).map((secret) => secret.envName),
    networkHosts: [...entry.networkHosts],
    ...(entry.firstPartyTemplate ? { firstPartyTemplate: { ...entry.firstPartyTemplate } } : {}),
    ...(entry.capabilityBuilderDefaults ? { capabilityBuilderDefaults: { ...entry.capabilityBuilderDefaults } } : {}),
    validationTarget: entry.ambientContract.validationTarget,
    selectionGuidance: providerSelectionGuidanceForProvider(entry).slice(0, 4),
  };
}

function formatConfiguredProviders(providers: WebResearchConfiguredProviderCandidate[]): string[] {
  if (!providers.length) return ["- No configured providers matched."];
  return providers.map((provider) => {
    const active = formatActiveRoles(provider);
    const secrets = provider.optionalSecretRefs.length ? `; secrets=${provider.optionalSecretRefs.join(",")}` : "";
    return `- ${provider.label} (${provider.providerId}) source=configured; state=${provider.configuredStatus}; kind=${provider.kind}; roles=${provider.roles.join(",")}; active=${active}${secrets}`;
  });
}

function formatKnownAddableProviders(providers: WebResearchCatalogProviderCandidate[]): string[] {
  if (!providers.length) return ["- No known addable provider cards matched."];
  return providers.map((provider) => {
    const secrets = provider.requiredSecrets.length ? `; requiredSecrets=${provider.requiredSecrets.join(",")}` : "";
    const hosts = provider.networkHosts.length ? `; hosts=${provider.networkHosts.join(",")}` : "";
    const providerName = provider.providerName ? `; provider=${provider.providerName}` : "";
    return `- ${provider.displayName} (${provider.catalogId}) source=provider-catalog; state=known-addable; installer=${provider.installerShape ?? "unspecified"}; tier=${provider.recommendationTier}${providerName}${secrets}${hosts}`;
  });
}

function candidateMatches(
  candidate: WebResearchConfiguredProviderCandidate | WebResearchCatalogProviderCandidate,
  query: string | undefined,
  role: WebResearchProviderRole | undefined,
): boolean {
  if (role && candidate.source === "configured" && !candidate.roles.includes(role)) return false;
  if (role && candidate.source === "known-addable" && role !== "search") return false;
  if (!query) return true;
  const haystack = providerAliases(candidate).join(" ");
  return haystack.includes(normalizeAlias(query));
}

function providerAliases(candidate: WebResearchConfiguredProviderCandidate | WebResearchCatalogProviderCandidate): string[] {
  if (candidate.source === "configured") {
    return [
      candidate.providerId,
      candidate.label,
      candidate.kind,
      candidate.ambientCli?.packageName,
      candidate.ambientCli?.commandName,
      candidate.ambientCli?.capabilityId,
      candidate.mcp?.serverId,
      candidate.mcp?.workloadName,
      candidate.mcp?.toolName,
    ].flatMap((value) => value ? [normalizeAlias(value)] : []);
  }
  return [
    candidate.catalogId,
    candidate.displayName,
    candidate.providerName,
    candidate.installerShape,
    candidate.recommendationTier,
    ...candidate.requiredSecrets,
    ...candidate.networkHosts,
    candidate.firstPartyTemplate?.templateId,
    candidate.capabilityBuilderDefaults?.provider,
  ].flatMap((value) => value ? [normalizeAlias(value)] : []);
}

function formatActiveRoles(provider: WebResearchConfiguredProviderCandidate): string {
  if (!provider.activeRoles.length) return "not in active order";
  return provider.activeRoles.map((role) => `${role}#${provider.order[role]}`).join(", ");
}

function normalizeQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase();
}

function boundedDiscoveryLimit(value: unknown): number {
  const limit = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 10;
  return Math.max(1, Math.min(limit, 25));
}
