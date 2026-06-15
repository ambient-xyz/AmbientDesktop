import type {
  SearchRoutingFallback,
  SearchRoutingMode,
  SearchRoutingSettings,
  WebResearchProviderConfig,
  WebResearchProviderRole,
} from "../shared/types";
import type { AmbientCliPackageCatalog, AmbientCliPackageCommand, AmbientCliPackageSummary } from "./ambientCliPackages";
import type { McpToolDescriptor } from "./mcpToolBridge";
import { webResearchProviderConfigsFromMcpTools } from "./webResearchMcpProviderRegistry";
import {
  normalizeSearchRoutingSettingsWithWebResearch,
  WEB_RESEARCH_DEFAULT_PREFERENCES,
  WEB_RESEARCH_PROVIDER_IDS,
} from "./webResearchProviderStack";

export interface SearchProviderCandidate {
  packageId: string;
  packageName: string;
  label: string;
  commandName: string;
  capabilityId: string;
  available: boolean;
  reason?: string;
  description?: string;
  aliases: string[];
  optionalSecretRefs: string[];
}

export interface SearchPreferenceStatusResult {
  settings: SearchRoutingSettings;
  providers: SearchProviderCandidate[];
  selectedProvider?: SearchProviderCandidate;
  providerCount: number;
  availableProviderCount: number;
}

export interface SearchPreferenceUpdateInput {
  action?: "reset_search_defaults" | "prefer_provider" | "require_provider";
  activity?: "web_search";
  role?: WebResearchProviderRole;
  providerOrder?: string[];
  providerIds?: string[];
  preferredProvider?: string;
  providerAlias?: string;
  mode?: SearchRoutingMode;
  fallback?: SearchRoutingFallback;
  clear?: boolean;
  reason?: string;
}

export interface SearchPreferenceUpdatePlan {
  previousSettings: SearchRoutingSettings;
  nextSettings: SearchRoutingSettings;
  nextProvider?: SearchProviderCandidate;
  reason?: string;
  hasChanges: boolean;
}

export interface WebResearchPreferenceUpdatePlan {
  previousSettings: SearchRoutingSettings;
  nextSettings: SearchRoutingSettings;
  role: WebResearchProviderRole;
  action: "reset_search_defaults" | "set_provider_order" | "prefer_provider" | "require_provider";
  nextProvider?: WebResearchProviderConfig;
  nextOrder: string[];
  reason?: string;
  hasChanges: boolean;
}

export function webResearchProviderConfigsFromSearchCatalog(catalog: AmbientCliPackageCatalog): WebResearchProviderConfig[] {
  return searchProviderCandidates(catalog).map((provider) => ({
    providerId: provider.packageName,
    label: provider.label,
    kind: "ambient-cli",
    roles: ["search"],
    status: provider.available ? "enabled" : "disabled",
    privacyLabel: `Queries may be sent to ${provider.label}.`,
    ambientCli: {
      packageId: provider.packageId,
      packageName: provider.packageName,
      commandName: provider.commandName,
      capabilityId: provider.capabilityId,
    },
    ...(provider.optionalSecretRefs.length ? { optionalSecretRefs: provider.optionalSecretRefs } : {}),
  }));
}

export function webResearchSettingsWithAmbientCliProviderCatalog(
  settings: SearchRoutingSettings | undefined,
  catalog: AmbientCliPackageCatalog,
): SearchRoutingSettings {
  return webResearchSettingsWithDynamicProviderCatalogs(settings, { ambientCliCatalog: catalog });
}

export function webResearchSettingsWithDynamicProviderCatalogs(
  settings: SearchRoutingSettings | undefined,
  input: {
    ambientCliCatalog?: AmbientCliPackageCatalog;
    mcpTools?: McpToolDescriptor[];
  } = {},
): SearchRoutingSettings {
  const webResearch = normalizeSearchRoutingSettingsWithWebResearch(settings).webResearch;
  const providers = mergeWebResearchProviders(webResearch.providers, [
    ...(input.ambientCliCatalog ? webResearchProviderConfigsFromSearchCatalog(input.ambientCliCatalog) : []),
    ...(input.mcpTools ? webResearchProviderConfigsFromMcpTools(input.mcpTools) : []),
  ]);
  const providerMap = new Map(providers.map((provider) => [provider.providerId, provider]));
  return {
    webResearch: {
      ...webResearch,
      providers,
      preferences: {
        ...webResearch.preferences,
        search: appendDynamicProvidersBeforeBrowser("search", webResearch.preferences.search ?? [], providers, providerMap),
        fetch: appendDynamicProvidersBeforeBrowser("fetch", webResearch.preferences.fetch ?? [], providers, providerMap),
      },
    },
  };
}

export function buildSearchPreferenceStatus(settings: SearchRoutingSettings, catalog: AmbientCliPackageCatalog): SearchPreferenceStatusResult {
  const canonicalSettings = webResearchSettingsWithAmbientCliProviderCatalog(settings, catalog);
  const providers = searchProviderCandidates(catalog);
  const selectedProviderId = preferredAmbientCliSearchProviderId(canonicalSettings);
  const selectedProvider = selectedProviderId
    ? providers.find((provider) => provider.aliases.includes(normalizeAlias(selectedProviderId)))
    : undefined;
  return {
    settings: canonicalSettings,
    providers,
    ...(selectedProvider ? { selectedProvider } : {}),
    providerCount: providers.length,
    availableProviderCount: providers.filter((provider) => provider.available).length,
  };
}

export function planSearchPreferenceUpdate(
  input: SearchPreferenceUpdateInput,
  current: SearchRoutingSettings,
  catalog: AmbientCliPackageCatalog,
  now = new Date(),
): SearchPreferenceUpdatePlan {
  if (input.activity && input.activity !== "web_search") throw new Error(`Unsupported search routing activity: ${input.activity}`);
  const action = input.action?.trim();
  if (action && action !== "reset_search_defaults" && action !== "prefer_provider" && action !== "require_provider") {
    throw new Error(`Unsupported search preference action: ${action}`);
  }
  if (input.clear && action && action !== "reset_search_defaults") {
    throw new Error("clear=true can only be combined with action=reset_search_defaults.");
  }
  const reason = input.reason?.trim();
  const previousSettings = webResearchSettingsWithAmbientCliProviderCatalog(current, catalog);
  const previousStack = normalizeSearchRoutingSettingsWithWebResearch(previousSettings).webResearch;
  if (input.clear || action === "reset_search_defaults") {
    const nextSettings: SearchRoutingSettings = {
      webResearch: {
        ...previousStack,
        preferences: {
          ...previousStack.preferences,
          search: defaultCanonicalSearchOrder(previousStack.providers),
        },
        fallbackPolicy: { allowBrowserFallback: true },
        updatedAt: now.toISOString(),
      },
    };
    return {
      previousSettings,
      nextSettings,
      ...(reason ? { reason } : {}),
      hasChanges: !searchSettingsEqual(current, nextSettings),
    };
  }

  const providers = searchProviderCandidates(catalog);
  const nextProvider = resolveSearchProvider(input, providers);
  const actionMode: SearchRoutingMode | undefined = action === "require_provider" ? "require" : action === "prefer_provider" ? "prefer" : undefined;
  const mode = input.mode ?? actionMode ?? "prefer";
  const fallback = input.fallback ?? (mode === "require" ? "block" : previousStack.fallbackPolicy.allowBrowserFallback ? "allow" : "block");
  const search = [nextProvider.packageName, ...(previousStack.preferences.search ?? [])].filter((providerId, index, list) => list.indexOf(providerId) === index);
  const nextSettings: SearchRoutingSettings = {
    webResearch: {
      ...previousStack,
      preferences: {
        ...previousStack.preferences,
        search,
      },
      fallbackPolicy: {
        allowBrowserFallback: fallback !== "block",
      },
      updatedAt: now.toISOString(),
    },
  };
  return {
    previousSettings,
    nextSettings,
    nextProvider,
    ...(reason ? { reason } : {}),
    hasChanges: !searchSettingsEqual(current, nextSettings, { ignoreUpdatedAt: true }),
  };
}

export function planWebResearchPreferenceUpdate(
  input: SearchPreferenceUpdateInput,
  current: SearchRoutingSettings,
  catalog: AmbientCliPackageCatalog,
  now = new Date(),
): WebResearchPreferenceUpdatePlan {
  if (input.activity && input.activity !== "web_search") throw new Error(`Unsupported search routing activity: ${input.activity}`);
  const action = input.action?.trim();
  if (action && action !== "reset_search_defaults" && action !== "prefer_provider" && action !== "require_provider") {
    throw new Error(`Unsupported web research preference action: ${action}`);
  }
  if (input.clear && action && action !== "reset_search_defaults") {
    throw new Error("clear=true can only be combined with action=reset_search_defaults.");
  }
  const reason = input.reason?.trim();
  const previousSettings = webResearchSettingsWithAmbientCliProviderCatalog(current, catalog);
  const previousStack = normalizeSearchRoutingSettingsWithWebResearch(previousSettings).webResearch;
  const role = normalizeWebResearchRole(input.role);

  if (input.clear || action === "reset_search_defaults") {
    const nextOrder = defaultCanonicalSearchOrder(previousStack.providers);
    const nextSettings: SearchRoutingSettings = {
      webResearch: {
        ...previousStack,
        preferences: {
          ...previousStack.preferences,
          search: nextOrder,
        },
        fallbackPolicy: { allowBrowserFallback: true },
        updatedAt: now.toISOString(),
      },
    };
    return {
      previousSettings,
      nextSettings,
      role: "search",
      action: "reset_search_defaults",
      nextOrder,
      ...(reason ? { reason } : {}),
      hasChanges: !searchSettingsEqual(current, nextSettings),
    };
  }

  const explicitOrder = arrayOfStrings(input.providerOrder) ?? arrayOfStrings(input.providerIds);
  const actionMode: SearchRoutingMode | undefined = action === "require_provider" ? "require" : action === "prefer_provider" ? "prefer" : undefined;
  const mode = input.mode ?? actionMode ?? "prefer";
  const fallback = input.fallback ?? (mode === "require" ? "block" : previousStack.fallbackPolicy.allowBrowserFallback ? "allow" : "block");
  const providerMap = new Map(previousStack.providers.map((provider) => [provider.providerId, provider]));
  const existingOrder = previousStack.preferences[role] ?? WEB_RESEARCH_DEFAULT_PREFERENCES[role].filter((providerId) => providerMap.has(providerId));

  if (explicitOrder) {
    if (explicitOrder.length === 0) throw new Error("providerOrder must include at least one provider id or label.");
    const nextOrder = resolveWebResearchProviderOrder(explicitOrder, previousStack.providers, role);
    const nextSettings: SearchRoutingSettings = {
      webResearch: {
        ...previousStack,
        preferences: {
          ...previousStack.preferences,
          [role]: nextOrder,
        },
        fallbackPolicy: { allowBrowserFallback: fallback !== "block" },
        updatedAt: now.toISOString(),
      },
    };
    return {
      previousSettings,
      nextSettings,
      role,
      action: "set_provider_order",
      nextOrder,
      ...(reason ? { reason } : {}),
      hasChanges: !searchSettingsEqual(current, nextSettings, { ignoreUpdatedAt: true }),
    };
  }

  const requestedProvider = input.preferredProvider?.trim() || input.providerAlias?.trim();
  if (!requestedProvider) {
    throw new Error("Pass providerOrder for exact Search & Web ordering, preferredProvider/providerAlias for a single provider preference, or action=reset_search_defaults.");
  }
  const nextProvider = resolveWebResearchProvider(requestedProvider, previousStack.providers, role);
  const nextOrder = [nextProvider.providerId, ...existingOrder].filter((providerId, index, list) => list.indexOf(providerId) === index);
  const nextSettings: SearchRoutingSettings = {
    webResearch: {
      ...previousStack,
      preferences: {
        ...previousStack.preferences,
        [role]: nextOrder,
      },
      fallbackPolicy: { allowBrowserFallback: fallback !== "block" },
      updatedAt: now.toISOString(),
    },
  };
  return {
    previousSettings,
    nextSettings,
    role,
    action: mode === "require" ? "require_provider" : "prefer_provider",
    nextProvider,
    nextOrder,
    ...(reason ? { reason } : {}),
    hasChanges: !searchSettingsEqual(current, nextSettings, { ignoreUpdatedAt: true }),
  };
}

export function searchPreferenceStatusText(status: SearchPreferenceStatusResult): string {
  const searchOrder = normalizeSearchRoutingSettingsWithWebResearch(status.settings).webResearch.preferences.search ?? [];
  const selected = status.selectedProvider
    ? `${status.selectedProvider.label} (${status.selectedProvider.packageName}:${status.selectedProvider.commandName})`
    : searchOrder[0]
      ? `Configured provider (${searchOrder[0]})`
      : "None";
  const providers = status.providers.length
    ? status.providers
        .map((provider) => {
          const availability = provider.available ? "available" : `unavailable${provider.reason ? `: ${provider.reason}` : ""}`;
          return `- ${provider.label}: packageName=${provider.packageName}; command=${provider.commandName}; ${availability}`;
        })
        .join("\n")
    : "- No installed Ambient CLI search providers found.";
  return [
    "Ambient search routing status",
    `Activity: web_research_search`,
    `Search order: ${searchOrder.join(" -> ") || "default"}`,
    `First provider: ${selected}`,
    `Browser fallback: ${normalizeSearchRoutingSettingsWithWebResearch(status.settings).webResearch.fallbackPolicy.allowBrowserFallback ? "allowed" : "blocked"}`,
    `Installed search providers: ${status.availableProviderCount}/${status.providerCount} available`,
    providers,
    "",
    "Use web_research_preferences_update with providerOrder for exact Search & Web swaps or rollbacks; use action=prefer_provider plus providerAlias/preferredProvider for a single configured provider preference.",
    "Use action=reset_search_defaults to clear/reset the stored web_research_search provider preference.",
    "For one-turn overrides, pass providerOrder to web_research_search or web_research_fetch instead; per-call overrides do not mutate global Search & Web settings.",
    "For public knowledge retrieval, call web_research_search or web_research_fetch unless the user explicitly asks for browser behavior.",
  ].join("\n");
}

export function searchPreferenceUpdateText(plan: SearchPreferenceUpdatePlan, savedSettings: SearchRoutingSettings): string {
  const stack = normalizeSearchRoutingSettingsWithWebResearch(savedSettings).webResearch;
  const searchOrder = stack.preferences.search ?? [];
  const fallback = stack.fallbackPolicy.allowBrowserFallback ? "allow" : "block";
  if (!plan.hasChanges) {
    return [
      "Ambient search routing unchanged",
      `web_research_search already uses: ${searchOrder.join(" -> ") || "default routing"}.`,
      `Browser fallback: ${fallback}.`,
    ].join("\n");
  }
  if (!plan.nextProvider) {
    return [
      "Ambient search routing updated",
      `web_research_search reset to: ${searchOrder.join(" -> ") || "default routing"}.`,
      `Browser fallback: ${fallback}.`,
    ].join("\n");
  }
  return [
    "Ambient search routing updated",
    `web_research_search now tries ${plan.nextProvider.label} (${plan.nextProvider.packageName}) first.`,
    `Search order: ${searchOrder.join(" -> ")}.`,
    `Browser fallback: ${fallback}.`,
  ].filter(Boolean).join("\n");
}

export function webResearchPreferenceUpdateText(plan: WebResearchPreferenceUpdatePlan, savedSettings: SearchRoutingSettings): string {
  const stack = normalizeSearchRoutingSettingsWithWebResearch(savedSettings).webResearch;
  const order = stack.preferences[plan.role] ?? [];
  const fallback = stack.fallbackPolicy.allowBrowserFallback ? "allow" : "block";
  if (!plan.hasChanges) {
    return [
      "Ambient web research preferences unchanged",
      `${plan.role} order already uses: ${order.join(" -> ") || "default routing"}.`,
      `Browser fallback: ${fallback}.`,
    ].join("\n");
  }
  if (plan.action === "reset_search_defaults") {
    return [
      "Ambient web research preferences updated",
      `web_research_search reset to: ${order.join(" -> ") || "default routing"}.`,
      `Browser fallback: ${fallback}.`,
    ].join("\n");
  }
  return [
    "Ambient web research preferences updated",
    `${plan.role} order: ${order.join(" -> ")}.`,
    plan.nextProvider ? `${plan.nextProvider.label} (${plan.nextProvider.providerId}) is first for ${plan.role}.` : undefined,
    `Browser fallback: ${fallback}.`,
  ].filter(Boolean).join("\n");
}

export function searchPreferenceApprovalDetail(plan: SearchPreferenceUpdatePlan, workspacePath: string): string {
  return [
    `Workspace: ${workspacePath}`,
    "Scope: Global Search & Web settings",
    `Activity: web_research_search`,
    `Previous: ${searchSettingsSummary(plan.previousSettings)}`,
    `Next: ${searchSettingsSummary(plan.nextSettings)}`,
    plan.nextProvider ? `Provider command: ambient_cli packageName="${plan.nextProvider.packageName}" command="${plan.nextProvider.commandName}"` : undefined,
    plan.reason ? `Reason: ${plan.reason}` : undefined,
  ].filter(Boolean).join("\n");
}

export function webResearchPreferenceApprovalDetail(plan: WebResearchPreferenceUpdatePlan, workspacePath: string): string {
  return [
    `Workspace: ${workspacePath}`,
    "Scope: Global Search & Web settings",
    `Role: ${plan.role}`,
    `Previous: ${searchSettingsSummary(plan.previousSettings)}`,
    `Next: ${searchSettingsSummary(plan.nextSettings)}`,
    plan.nextProvider ? `Provider: ${plan.nextProvider.label} (${plan.nextProvider.providerId})` : undefined,
    plan.reason ? `Reason: ${plan.reason}` : undefined,
  ].filter(Boolean).join("\n");
}

export function searchRoutingGuidance(settings: SearchRoutingSettings): string | undefined {
  const stack = normalizeSearchRoutingSettingsWithWebResearch(settings).webResearch;
  const search = stack.preferences.search ?? [];
  const firstProvider = search[0];
  if (!firstProvider || firstProvider === WEB_RESEARCH_PROVIDER_IDS.exa) return undefined;
  return [
    "Ambient search routing preference:",
    `- For public web discovery, use web_research_search when active, or route it through ambient_tool_search, ambient_tool_describe, and ambient_tool_call. Ambient will try "${firstProvider}" first according to the global Search & Web settings.`,
    `- Browser fallback policy: ${stack.fallbackPolicy.allowBrowserFallback ? "allow" : "block"}.`,
    "- Explicit user instructions in the current turn override this preference, such as 'use browser search for this one'.",
  ].join("\n");
}

export function appendSearchRoutingGuidance(prompt: string, settings: SearchRoutingSettings | undefined): string {
  const guidance = settings ? searchRoutingGuidance(settings) : undefined;
  return guidance ? `${prompt}\n\n${guidance}` : prompt;
}

function searchProviderCandidates(catalog: AmbientCliPackageCatalog): SearchProviderCandidate[] {
  return catalog.packages.flatMap((pkg) => {
    const searchProvider = pkg.generated?.installerShape === "search-provider";
    const commands = searchProvider ? pkg.commands.filter((command) => searchy([command.name, command.description])) : [];
    return commands.map((command) => searchProviderCandidate(pkg, command));
  });
}

function searchProviderCandidate(pkg: AmbientCliPackageSummary, command: AmbientCliPackageCommand): SearchProviderCandidate {
  const health = commandHealth(pkg, command.name);
  const available = pkg.installed && pkg.errors.length === 0 && health !== "failed";
  const label = pkg.generated?.provider ?? pkg.name;
  const reason = pkg.errors[0] ?? (health === "failed" ? "health check failed" : undefined);
  const optionalSecretRefs = pkg.envRequirements.filter((env) => env.required).map((env) => env.name);
  const aliases = [
    pkg.id,
    pkg.name,
    label,
    pkg.generated?.provider,
    command.name,
    `${pkg.name}:${command.name}`,
    `ambient-cli:${pkg.name}:tool:${command.name}`,
  ].flatMap((value) => value ? [normalizeAlias(value)] : []);
  return {
    packageId: pkg.id,
    packageName: pkg.name,
    label,
    commandName: command.name,
    capabilityId: `ambient-cli:${pkg.name}:tool:${command.name}`,
    available,
    optionalSecretRefs,
    ...(reason ? { reason } : {}),
    ...(command.description ?? pkg.description ? { description: command.description ?? pkg.description } : {}),
    aliases: Array.from(new Set(aliases)),
  };
}

function mergeWebResearchProviders(
  currentProviders: WebResearchProviderConfig[],
  catalogProviders: WebResearchProviderConfig[],
): WebResearchProviderConfig[] {
  const byId = new Map(currentProviders.map((provider) => [provider.providerId, provider]));
  const merged = [...currentProviders];
  for (const provider of catalogProviders) {
    const existing = byId.get(provider.providerId);
    if (existing) {
      const next = {
        ...provider,
        status: existing.status,
      };
      const index = merged.findIndex((candidate) => candidate.providerId === provider.providerId);
      if (index >= 0) merged[index] = next;
      byId.set(provider.providerId, next);
      continue;
    }
    merged.push(provider);
    byId.set(provider.providerId, provider);
  }
  return merged;
}

function appendDynamicProvidersBeforeBrowser(
  role: Extract<WebResearchProviderRole, "search" | "fetch">,
  currentSearchOrder: string[],
  providers: WebResearchProviderConfig[],
  providerMap: Map<string, WebResearchProviderConfig>,
): string[] {
  const defaultOrder = WEB_RESEARCH_DEFAULT_PREFERENCES[role];
  const existing = currentSearchOrder.length ? currentSearchOrder : defaultOrder.filter((providerId) => providerMap.has(providerId));
  const defaultProviderIds = new Set(defaultOrder);
  const dynamicProviderIds = providers
    .filter((provider) =>
      provider.roles.includes(role) &&
      provider.status === "enabled" &&
      !existing.includes(provider.providerId)
      && !defaultProviderIds.has(provider.providerId)
    )
    .map((provider) => provider.providerId);
  const result = [...existing];
  const browserIndex = result.indexOf(WEB_RESEARCH_PROVIDER_IDS.browser);
  for (const providerId of dynamicProviderIds) {
    if (!providerMap.get(providerId)?.roles.includes(role)) continue;
    if (browserIndex >= 0) {
      result.splice(Math.max(0, result.indexOf(WEB_RESEARCH_PROVIDER_IDS.browser)), 0, providerId);
    } else {
      result.push(providerId);
    }
  }
  return result.filter((providerId, index, list) => list.indexOf(providerId) === index);
}

function resolveSearchProvider(input: SearchPreferenceUpdateInput, providers: SearchProviderCandidate[]): SearchProviderCandidate {
  const requested = input.preferredProvider?.trim() || input.providerAlias?.trim();
  if (!requested) throw new Error("Pass preferredProvider or providerAlias for provider preference actions, or use action=reset_search_defaults.");
  const alias = normalizeAlias(requested);
  const matches = providers.filter((provider) => provider.aliases.includes(alias));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Search provider "${requested}" is ambiguous. Use an exact packageName or capability id.`);
  throw new Error(`Search provider "${requested}" did not match an installed Ambient CLI search provider. Call web_research_status first.`);
}

function resolveWebResearchProviderOrder(
  requestedOrder: string[],
  providers: WebResearchProviderConfig[],
  role: WebResearchProviderRole,
): string[] {
  return requestedOrder
    .map((provider) => resolveWebResearchProvider(provider, providers, role).providerId)
    .filter((providerId, index, list) => list.indexOf(providerId) === index);
}

function resolveWebResearchProvider(
  requested: string,
  providers: WebResearchProviderConfig[],
  role: WebResearchProviderRole,
): WebResearchProviderConfig {
  const alias = normalizeAlias(requested);
  const matches = providers.filter((provider) => webResearchProviderAliases(provider).includes(alias));
  if (matches.length > 1) throw new Error(`Web research provider "${requested}" is ambiguous. Use an exact providerId from web_research_status.`);
  const provider = matches[0];
  if (!provider) {
    throw new Error([
      `Web research provider "${requested}" did not match a configured provider for ${role}.`,
      `Call web_research_status and pass exact provider ids or labels. Available ${role} providers: ${availableProviderSummary(providers, role)}.`,
    ].join(" "));
  }
  if (!provider.roles.includes(role)) throw new Error(`Web research provider "${provider.providerId}" does not support ${role}.`);
  if (provider.status !== "enabled") throw new Error(`Web research provider "${provider.providerId}" is ${provider.status}; enable or repair it before using it in provider order.`);
  return provider;
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
  ].flatMap((value) => value ? [normalizeAlias(value)] : []);
}

function availableProviderSummary(providers: WebResearchProviderConfig[], role: WebResearchProviderRole): string {
  const available = providers.filter((provider) => provider.roles.includes(role));
  if (!available.length) return "none";
  return available.map((provider) => `${provider.providerId} (${provider.label})`).join(", ");
}

function arrayOfStrings(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error("providerOrder/providerIds must be an array of provider ids or labels.");
  return value.map((item) => {
    if (typeof item !== "string" || !item.trim()) throw new Error("providerOrder/providerIds must contain only non-empty strings.");
    return item.trim();
  });
}

function normalizeWebResearchRole(value: unknown): WebResearchProviderRole {
  if (value === undefined || value === null || value === "") return "search";
  if (value === "search" || value === "fetch" || value === "interactive_browser") return value;
  throw new Error("role must be search, fetch, or interactive_browser.");
}

function commandHealth(pkg: AmbientCliPackageSummary, commandName: string): "passed" | "failed" | "unknown" {
  const health = pkg.healthChecks?.find((check) => check.commandName === commandName);
  if (!health) return "unknown";
  return health.passed ? "passed" : "failed";
}

function searchy(values: Array<string | undefined>): boolean {
  return values.some((value) => /\b(search|brave|web)\b/i.test(value ?? ""));
}

function normalizeAlias(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function searchSettingsEqual(left: SearchRoutingSettings, right: SearchRoutingSettings, options: { ignoreUpdatedAt?: boolean } = {}): boolean {
  const leftStack = normalizeSearchRoutingSettingsWithWebResearch(left).webResearch;
  const rightStack = normalizeSearchRoutingSettingsWithWebResearch(right).webResearch;
  const clean = (settings: typeof leftStack) => ({
    providers: settings.providers.map((provider) => ({
      providerId: provider.providerId,
      status: provider.status,
    })),
    preferences: settings.preferences,
    fallbackPolicy: settings.fallbackPolicy,
    ...(options.ignoreUpdatedAt ? {} : { updatedAt: settings.updatedAt }),
  });
  return JSON.stringify(clean(leftStack)) === JSON.stringify(clean(rightStack));
}

function preferredAmbientCliSearchProviderId(settings: SearchRoutingSettings): string | undefined {
  const stack = normalizeSearchRoutingSettingsWithWebResearch(settings).webResearch;
  const providerMap = new Map(stack.providers.map((provider) => [provider.providerId, provider]));
  return (stack.preferences.search ?? []).find((providerId) => providerMap.get(providerId)?.kind === "ambient-cli");
}

function defaultCanonicalSearchOrder(providers: WebResearchProviderConfig[]): string[] {
  const providerIds = new Set(providers.map((provider) => provider.providerId));
  return [WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser].filter((providerId) => providerIds.has(providerId));
}

function searchSettingsSummary(settings: SearchRoutingSettings): string {
  const stack = normalizeSearchRoutingSettingsWithWebResearch(settings).webResearch;
  return [
    `Search order: ${(stack.preferences.search ?? []).join(" -> ") || "default"}`,
    `Browser fallback: ${stack.fallbackPolicy.allowBrowserFallback ? "allow" : "block"}`,
  ].join("; ");
}
