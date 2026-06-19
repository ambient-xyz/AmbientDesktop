import type { SearchProviderPreference, SearchRoutingSettings, WebResearchCapabilityKind, WebResearchCapabilityProbeStatus, WebResearchFallbackPolicy, WebResearchProviderConfig, WebResearchProviderConfigStatus, WebResearchProviderKind, WebResearchProviderRole, WebResearchProviderStackSettings } from "../../shared/webResearchTypes";
import {
  buildProviderStackStatus,
  cloneProviderStackPreferences,
  defaultProviderStackSettings,
  normalizeProviderStackSettings,
  planProviderStackOrder,
  updateProviderStackOrder,
  type ProviderStackDefinition,
} from "./webResearchProviderFacade";

export const WEB_RESEARCH_PROVIDER_STACK_SCHEMA_VERSION = "ambient-web-research-provider-stack-v1" as const;

export const WEB_RESEARCH_PROVIDER_IDS = {
  exa: "exa-mcp-default",
  scrapling: "scrapling-mcp-default",
  browser: "ambient-browser",
} as const;

export const WEB_RESEARCH_DEFAULT_PROVIDERS: WebResearchProviderConfig[] = [
  {
    providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
    label: "Exa Search",
    kind: "remote-mcp",
    roles: ["search", "fetch"],
    status: "enabled",
    capabilityKinds: ["search", "static_fetch_extract"],
    capabilityProbeStatus: "passed",
    capabilityProbeEvidenceRefs: ["builtin:web-research/exa-search", "builtin:web-research/exa-fetch"],
    optionalSecretRefs: ["EXA_API_KEY"],
    privacyLabel: "Queries and fetched public URLs may be sent to Exa.",
  },
  {
    providerId: WEB_RESEARCH_PROVIDER_IDS.scrapling,
    label: "Scrapling",
    kind: "toolhive-mcp",
    roles: ["fetch"],
    status: "enabled",
    capabilityKinds: ["dynamic_headless_browser"],
    capabilityProbeStatus: "passed",
    capabilityProbeEvidenceRefs: ["builtin:web-research/scrapling-headless-fetch"],
    privacyLabel: "Public pages are fetched through the local ToolHive-isolated Scrapling workload.",
  },
  {
    providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
    label: "Ambient Browser",
    kind: "built-in-browser",
    roles: ["search", "fetch", "interactive_browser"],
    status: "enabled",
    capabilityKinds: ["interactive_browser"],
    capabilityProbeStatus: "passed",
    capabilityProbeEvidenceRefs: ["builtin:web-research/ambient-browser-interactive"],
    privacyLabel: "Browser fallback uses Ambient's managed browser session and may need user-visible interaction.",
  },
];

export const WEB_RESEARCH_DEFAULT_PREFERENCES: Record<WebResearchProviderRole, string[]> = {
  search: [WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser],
  fetch: [WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser],
  interactive_browser: [WEB_RESEARCH_PROVIDER_IDS.browser],
};

export const WEB_RESEARCH_DEFAULT_FALLBACK_POLICY: WebResearchFallbackPolicy = {
  allowBrowserFallback: true,
};

const WEB_RESEARCH_PROVIDER_ROLE_LIST = ["search", "fetch", "interactive_browser"] as const satisfies readonly WebResearchProviderRole[];
const WEB_RESEARCH_PROVIDER_ROLES = new Set<WebResearchProviderRole>(WEB_RESEARCH_PROVIDER_ROLE_LIST);
const WEB_RESEARCH_PROVIDER_KINDS = new Set<WebResearchProviderKind>([
  "remote-mcp",
  "toolhive-mcp",
  "built-in-browser",
  "ambient-cli",
]);
const WEB_RESEARCH_PROVIDER_STATUSES = new Set<WebResearchProviderConfigStatus>(["enabled", "disabled"]);
const WEB_RESEARCH_CAPABILITY_KINDS = new Set<WebResearchCapabilityKind>([
  "search",
  "static_fetch_extract",
  "dynamic_headless_browser",
  "interactive_browser",
]);
const WEB_RESEARCH_CAPABILITY_PROBE_STATUSES = new Set<WebResearchCapabilityProbeStatus>(["untested", "passed", "failed", "degraded"]);
const SEARCH_ROUTING_MODES = new Set(["prefer", "require"]);
const SEARCH_ROUTING_FALLBACKS = new Set(["allow", "block"]);

const WEB_RESEARCH_PROVIDER_STACK_DEFINITION: ProviderStackDefinition<
  typeof WEB_RESEARCH_PROVIDER_STACK_SCHEMA_VERSION,
  WebResearchProviderRole,
  WebResearchProviderConfig
> = {
  schemaVersion: WEB_RESEARCH_PROVIDER_STACK_SCHEMA_VERSION,
  roles: WEB_RESEARCH_PROVIDER_ROLE_LIST,
  defaultProviders: WEB_RESEARCH_DEFAULT_PROVIDERS,
  defaultPreferences: WEB_RESEARCH_DEFAULT_PREFERENCES,
  cloneProvider: cloneWebResearchProvider,
  normalizeCustomProvider,
};

export interface WebResearchProviderRuntimeSummary {
  providerId: string;
  label: string;
  role: WebResearchProviderRole;
  kind: WebResearchProviderConfig["kind"];
  configuredStatus: WebResearchProviderConfig["status"];
  availability: "available" | "unavailable" | "disabled" | "unknown";
  reason?: string;
  privacyLabel?: string;
}

export interface WebResearchProviderStackStatus {
  schemaVersion: "ambient-web-research-provider-stack-status-v1";
  settings: WebResearchProviderStackSettings;
  roles: Array<{
    role: WebResearchProviderRole;
    providers: WebResearchProviderRuntimeSummary[];
  }>;
}

export interface WebResearchProviderRequestPlan {
  providers: WebResearchProviderConfig[];
  providerOrder: string[];
  skippedProviders: Array<{
    providerId: string;
    reason: string;
  }>;
}

export function defaultWebResearchProviderStackSettings(): WebResearchProviderStackSettings {
  const stack = defaultProviderStackSettings(WEB_RESEARCH_PROVIDER_STACK_DEFINITION);
  return {
    ...stack,
    fallbackPolicy: { ...WEB_RESEARCH_DEFAULT_FALLBACK_POLICY },
  };
}

export function normalizeSearchRoutingSettingsWithWebResearch(
  value: unknown,
): SearchRoutingSettings & { webResearch: WebResearchProviderStackSettings } {
  const record = objectRecord(value);
  return {
    webResearch: normalizeWebResearchProviderStackSettings(record.webResearch, {
      legacyWebSearch: normalizeLegacyWebSearchPreference(record.webSearch),
    }),
  };
}

export function normalizeWebResearchProviderStackSettings(
  value: unknown,
  options: { legacyWebSearch?: SearchProviderPreference } = {},
): WebResearchProviderStackSettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const legacyWebSearch = hasExplicitProviderPreference(record.preferences, "search") ? undefined : options.legacyWebSearch;
  const legacyProvider = legacyWebSearch ? providerFromLegacyWebSearch(legacyWebSearch) : undefined;
  const stack = normalizeProviderStackSettings(record, WEB_RESEARCH_PROVIDER_STACK_DEFINITION, {
    ...(legacyProvider ? { additionalProviders: [legacyProvider] } : {}),
  });
  const providerMap = new Map(stack.providers.map((provider) => [provider.providerId, provider]));
  const migratedPreferences = legacyWebSearch
    ? withLegacySearchPreference(stack.preferences, legacyWebSearch, providerMap)
    : stack.preferences;
  const updatedAt = stack.updatedAt ?? legacyWebSearch?.updatedAt;
  return {
    ...stack,
    preferences: migratedPreferences,
    fallbackPolicy: normalizeFallbackPolicy(record.fallbackPolicy, legacyWebSearch),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function searchRoutingSettingsWithDefaultWebResearch(settings: SearchRoutingSettings | undefined): SearchRoutingSettings {
  return normalizeSearchRoutingSettingsWithWebResearch(settings);
}

export function webResearchProviderOrder(
  settings: SearchRoutingSettings | WebResearchProviderStackSettings | undefined,
  role: WebResearchProviderRole,
): string[] {
  const stack = isWebResearchProviderStackSettings(settings)
    ? normalizeWebResearchProviderStackSettings(settings)
    : normalizeSearchRoutingSettingsWithWebResearch(settings).webResearch;
  return stack.preferences[role] ?? WEB_RESEARCH_DEFAULT_PREFERENCES[role];
}

export function planWebResearchProviderOrder(input: {
  settings?: SearchRoutingSettings;
  role: WebResearchProviderRole;
  providerOrder?: unknown;
}): WebResearchProviderRequestPlan {
  const stack = normalizeSearchRoutingSettingsWithWebResearch(input.settings).webResearch;
  const providerOrder = normalizeWebResearchProviderOrderInput(input.providerOrder, stack.providers);
  return planProviderStackOrder({
    stack,
    role: input.role,
    providerOrder,
    defaultPreferences: WEB_RESEARCH_DEFAULT_PREFERENCES,
    unknownProviderReason: "Provider is not registered in Ambient web research settings.",
    disabledProviderReason: "Provider is disabled in Ambient settings.",
    unsupportedRoleReason: (_provider, role) => `Provider does not support ${role}.`,
    blockedProviderReason: (provider) =>
      provider.providerId === WEB_RESEARCH_PROVIDER_IDS.browser && !stack.fallbackPolicy.allowBrowserFallback
        ? "Ambient Browser fallback is disabled in web research settings."
        : undefined,
  });
}

export function updateWebResearchProviderOrder(input: {
  settings: SearchRoutingSettings;
  role: WebResearchProviderRole;
  providerOrder: string[];
  updatedAt?: string;
}): SearchRoutingSettings {
  const stack = normalizeSearchRoutingSettingsWithWebResearch(input.settings).webResearch;
  const providerOrder = normalizeWebResearchProviderOrderInput(input.providerOrder, stack.providers) as string[];
  const updatedStack = updateProviderStackOrder({
    stack,
    role: input.role,
    providerOrder,
    defaultPreferences: WEB_RESEARCH_DEFAULT_PREFERENCES,
    updatedAt: input.updatedAt,
  });
  return {
    webResearch: {
      ...stack,
      ...updatedStack,
    },
  };
}

export function resetWebResearchProviderOrder(settings: SearchRoutingSettings, updatedAt = new Date().toISOString()): SearchRoutingSettings {
  void settings;
  return {
    webResearch: {
      ...defaultWebResearchProviderStackSettings(),
      updatedAt,
    },
  };
}

export function buildWebResearchProviderStackStatus(input: {
  settings?: SearchRoutingSettings;
  runtime?: Partial<Record<string, Omit<WebResearchProviderRuntimeSummary, "providerId" | "label" | "role" | "kind" | "configuredStatus" | "privacyLabel">>>;
} = {}): WebResearchProviderStackStatus {
  const settings = normalizeSearchRoutingSettingsWithWebResearch(input.settings).webResearch;
  return buildProviderStackStatus({
    schemaVersion: "ambient-web-research-provider-stack-status-v1",
    stack: settings,
    roles: WEB_RESEARCH_PROVIDER_ROLE_LIST,
    defaultPreferences: WEB_RESEARCH_DEFAULT_PREFERENCES,
    runtime: input.runtime,
    defaultAvailability: (provider) => defaultAvailability(provider.providerId),
  }) as WebResearchProviderStackStatus;
}

export function webResearchProviderStackStatusText(status: WebResearchProviderStackStatus): string {
  return [
    "Ambient web research provider stack",
    ...status.roles.map((role) => {
      const rows = role.providers.map((provider, index) => {
        const reason = provider.reason ? `; ${provider.reason}` : "";
        return `${index + 1}. ${provider.label} (${provider.providerId}) - ${provider.availability}${reason}`;
      });
      return [``, `${role.role}:`, ...rows].join("\n");
    }),
    "",
    `Browser fallback: ${status.settings.fallbackPolicy.allowBrowserFallback ? "allowed" : "blocked"}.`,
    "This status lists only active/configured providers. If the user asked about a provider that is not listed here, do not conclude Ambient lacks it; call web_research_provider_search or web_research_provider_describe before answering whether it is known, recommended, addable, or installable.",
    "Use web_research_search for public web discovery and web_research_fetch for known public URLs. Ambient will route through this order, record fallbacks, and keep Ambient Browser available for interactive or authenticated pages.",
  ].join("\n");
}

function normalizeCustomProvider(value: unknown): WebResearchProviderConfig | undefined {
  const record = objectRecord(value);
  const providerId = typeof record.providerId === "string" && record.providerId.trim() ? record.providerId.trim() : undefined;
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : undefined;
  const kind = typeof record.kind === "string" && WEB_RESEARCH_PROVIDER_KINDS.has(record.kind as WebResearchProviderKind)
    ? record.kind as WebResearchProviderKind
    : undefined;
  const roles = Array.isArray(record.roles)
    ? [...new Set(record.roles.filter((role): role is WebResearchProviderRole =>
        typeof role === "string" && WEB_RESEARCH_PROVIDER_ROLES.has(role as WebResearchProviderRole),
      ))]
    : [];
  const status = typeof record.status === "string" && WEB_RESEARCH_PROVIDER_STATUSES.has(record.status as WebResearchProviderConfigStatus)
    ? record.status as WebResearchProviderConfigStatus
    : "enabled";
  if (!providerId || !label || !kind || roles.length === 0) return undefined;
  const privacyLabel = typeof record.privacyLabel === "string" && record.privacyLabel.trim() ? record.privacyLabel.trim() : undefined;
  const optionalSecretRefs = Array.isArray(record.optionalSecretRefs)
    ? [...new Set(record.optionalSecretRefs.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim()))]
    : [];
  const capabilityKinds = normalizeCapabilityKinds(record.capabilityKinds);
  const capabilityProbeStatus = typeof record.capabilityProbeStatus === "string" &&
    WEB_RESEARCH_CAPABILITY_PROBE_STATUSES.has(record.capabilityProbeStatus as WebResearchCapabilityProbeStatus)
    ? record.capabilityProbeStatus as WebResearchCapabilityProbeStatus
    : undefined;
  const capabilityProbeEvidenceRefs = stringList(record.capabilityProbeEvidenceRefs);
  const capabilityFailureNotes = stringList(record.capabilityFailureNotes);
  const ambientCli = normalizeAmbientCliBinding(record.ambientCli);
  const mcp = normalizeMcpBinding(record.mcp);
  return {
    providerId,
    label,
    kind,
    roles,
    status,
    ...(capabilityKinds.length ? { capabilityKinds } : {}),
    ...(capabilityProbeStatus ? { capabilityProbeStatus } : {}),
    ...(capabilityProbeEvidenceRefs.length ? { capabilityProbeEvidenceRefs } : {}),
    ...(capabilityFailureNotes.length ? { capabilityFailureNotes } : {}),
    ...(privacyLabel ? { privacyLabel } : {}),
    ...(optionalSecretRefs.length ? { optionalSecretRefs } : {}),
    ...(ambientCli ? { ambientCli } : {}),
    ...(mcp ? { mcp } : {}),
  };
}

function normalizeAmbientCliBinding(value: unknown): WebResearchProviderConfig["ambientCli"] | undefined {
  const record = objectRecord(value);
  const packageName = typeof record.packageName === "string" && record.packageName.trim() ? record.packageName.trim() : undefined;
  const commandName = typeof record.commandName === "string" && record.commandName.trim() ? record.commandName.trim() : undefined;
  if (!packageName || !commandName) return undefined;
  const packageId = typeof record.packageId === "string" && record.packageId.trim() ? record.packageId.trim() : undefined;
  const capabilityId = typeof record.capabilityId === "string" && record.capabilityId.trim() ? record.capabilityId.trim() : undefined;
  return {
    ...(packageId ? { packageId } : {}),
    packageName,
    commandName,
    ...(capabilityId ? { capabilityId } : {}),
  };
}

function normalizeMcpBinding(value: unknown): WebResearchProviderConfig["mcp"] | undefined {
  const record = objectRecord(value);
  const toolName = typeof record.toolName === "string" && record.toolName.trim() ? record.toolName.trim() : undefined;
  if (!toolName) return undefined;
  const serverId = typeof record.serverId === "string" && record.serverId.trim() ? record.serverId.trim() : undefined;
  const workloadName = typeof record.workloadName === "string" && record.workloadName.trim() ? record.workloadName.trim() : undefined;
  const argumentName = typeof record.argumentName === "string" && record.argumentName.trim() ? record.argumentName.trim() : undefined;
  return {
    ...(serverId ? { serverId } : {}),
    ...(workloadName ? { workloadName } : {}),
    toolName,
    ...(argumentName ? { argumentName } : {}),
  };
}

function withLegacySearchPreference(
  preferences: Partial<Record<WebResearchProviderRole, string[]>>,
  legacyWebSearch: SearchProviderPreference,
  providers: Map<string, WebResearchProviderConfig>,
): Partial<Record<WebResearchProviderRole, string[]>> {
  const providerId = canonicalLegacyProviderId(legacyWebSearch.preferredProvider);
  if (!providers.get(providerId)?.roles.includes("search")) return preferences;
  const search = [providerId, ...(preferences.search ?? [])].filter((entry, index, list) => list.indexOf(entry) === index);
  return {
    ...preferences,
    search,
  };
}

function cloneWebResearchProvider(provider: WebResearchProviderConfig): WebResearchProviderConfig {
  return {
    ...provider,
    roles: [...provider.roles],
    ...(provider.capabilityKinds ? { capabilityKinds: [...provider.capabilityKinds] } : {}),
    ...(provider.capabilityProbeEvidenceRefs ? { capabilityProbeEvidenceRefs: [...provider.capabilityProbeEvidenceRefs] } : {}),
    ...(provider.capabilityFailureNotes ? { capabilityFailureNotes: [...provider.capabilityFailureNotes] } : {}),
    ...(provider.optionalSecretRefs ? { optionalSecretRefs: [...provider.optionalSecretRefs] } : {}),
    ...(provider.ambientCli ? { ambientCli: { ...provider.ambientCli } } : {}),
    ...(provider.mcp ? { mcp: { ...provider.mcp } } : {}),
  };
}

function normalizeWebResearchProviderOrderInput(value: unknown, providers: WebResearchProviderConfig[]): unknown {
  if (!Array.isArray(value)) return value;
  const aliases = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const provider of providers) {
    for (const alias of webResearchProviderAliases(provider)) {
      const existing = aliases.get(alias);
      if (existing && existing !== provider.providerId) {
        ambiguous.add(alias);
        continue;
      }
      aliases.set(alias, provider.providerId);
    }
  }
  return value.map((entry) => {
    if (typeof entry !== "string") return entry;
    const alias = normalizeProviderAlias(entry);
    if (ambiguous.has(alias)) return entry;
    return aliases.get(alias) ?? entry;
  });
}

function webResearchProviderAliases(provider: WebResearchProviderConfig): string[] {
  return [
    provider.providerId,
    provider.label,
    provider.ambientCli?.packageId,
    provider.ambientCli?.packageName,
    provider.ambientCli?.commandName,
    provider.ambientCli?.capabilityId,
    provider.mcp?.serverId,
    provider.mcp?.workloadName,
    provider.mcp?.toolName,
    provider.mcp?.serverId && provider.mcp.toolName ? `${provider.mcp.serverId}/${provider.mcp.toolName}` : undefined,
  ].flatMap((value) => value ? [normalizeProviderAlias(value)] : []);
}

function normalizeProviderAlias(value: string): string {
  return value.trim().toLowerCase();
}

function cloneDefaultPreferences(): Record<WebResearchProviderRole, string[]> {
  return cloneProviderStackPreferences(WEB_RESEARCH_DEFAULT_PREFERENCES);
}

function normalizeFallbackPolicy(value: unknown, legacyWebSearch?: SearchProviderPreference): WebResearchFallbackPolicy {
  const record = objectRecord(value);
  const allowBrowserFallback = typeof record.allowBrowserFallback === "boolean"
    ? record.allowBrowserFallback
    : legacyWebSearch?.fallback === "block"
      ? false
      : WEB_RESEARCH_DEFAULT_FALLBACK_POLICY.allowBrowserFallback;
  return { allowBrowserFallback };
}

function normalizeCapabilityKinds(value: unknown): WebResearchCapabilityKind[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is WebResearchCapabilityKind =>
    typeof entry === "string" && WEB_RESEARCH_CAPABILITY_KINDS.has(entry as WebResearchCapabilityKind),
  ))];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim()))]
    : [];
}

function normalizeLegacyWebSearchPreference(value: unknown): SearchProviderPreference | undefined {
  const record = objectRecord(value);
  const preferredProvider = typeof record.preferredProvider === "string" && record.preferredProvider.trim()
    ? record.preferredProvider.trim()
    : undefined;
  if (!preferredProvider) return undefined;
  const mode = typeof record.mode === "string" && SEARCH_ROUTING_MODES.has(record.mode)
    ? record.mode as SearchProviderPreference["mode"]
    : "prefer";
  const fallback = typeof record.fallback === "string" && SEARCH_ROUTING_FALLBACKS.has(record.fallback)
    ? record.fallback as SearchProviderPreference["fallback"]
    : mode === "require" ? "block" : "allow";
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim() ? record.updatedAt.trim() : undefined;
  return {
    activity: "web_search",
    preferredProvider,
    mode,
    fallback,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function providerFromLegacyWebSearch(legacyWebSearch: SearchProviderPreference): WebResearchProviderConfig | undefined {
  const providerId = canonicalLegacyProviderId(legacyWebSearch.preferredProvider);
  if (providerId === WEB_RESEARCH_PROVIDER_IDS.browser || providerId === WEB_RESEARCH_PROVIDER_IDS.exa) {
    return undefined;
  }
  return {
    providerId,
    label: humanizeProviderId(providerId),
    kind: "ambient-cli",
    roles: ["search"],
    status: "enabled",
    privacyLabel: "Installed Ambient CLI search provider.",
  };
}

function canonicalLegacyProviderId(providerId: string): string {
  if (providerId === "browser") return WEB_RESEARCH_PROVIDER_IDS.browser;
  if (providerId === "exa" || providerId === "exa-search") return WEB_RESEARCH_PROVIDER_IDS.exa;
  return providerId;
}

function humanizeProviderId(providerId: string): string {
  return providerId
    .split(/[-_:]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasExplicitProviderPreference(value: unknown, role: WebResearchProviderRole): boolean {
  const record = objectRecord(value);
  return Array.isArray(record[role]);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isWebResearchProviderStackSettings(value: unknown): value is WebResearchProviderStackSettings {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).schemaVersion === WEB_RESEARCH_PROVIDER_STACK_SCHEMA_VERSION,
  );
}

function defaultAvailability(providerId: string): WebResearchProviderRuntimeSummary["availability"] {
  if (providerId === WEB_RESEARCH_PROVIDER_IDS.browser) return "available";
  if (providerId === WEB_RESEARCH_PROVIDER_IDS.exa) return "available";
  return "unknown";
}
