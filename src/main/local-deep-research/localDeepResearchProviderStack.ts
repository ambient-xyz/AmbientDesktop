import type {
  LocalDeepResearchFinalSynthesisConfig,
  LocalDeepResearchFinalSynthesisMode,
  LocalDeepResearchProviderConfig,
  LocalDeepResearchProviderKind,
  LocalDeepResearchProviderRole,
  LocalDeepResearchProviderStackSettings,
  LocalDeepResearchSettings,
  LocalModelMemoryLimitBehavior,
  LocalModelResourceSettings,
} from "../../shared/localRuntimeTypes";
import {
  DEFAULT_LOCAL_RUNTIME_COMFORTABLE_FREE_MEMORY_RATIO,
  DEFAULT_LOCAL_RUNTIME_MAX_PROJECTED_MEMORY_UTILIZATION,
  DEFAULT_LOCAL_RUNTIME_MIN_FREE_MEMORY_RATIO_AFTER_LAUNCH,
} from "../../shared/localRuntimeMemoryPolicy";
import { normalizeLocalDeepResearchRunBudgetSettings } from "../../shared/localDeepResearchBudget";
import { getProviderCatalogEntries, providerSelectionGuidanceForProvider, type ProviderCatalogEntry } from "../provider/providerCatalog";
import {
  buildProviderStackStatus,
  defaultProviderStackSettings,
  normalizeProviderStackSettings,
  planProviderStackOrder,
  updateProviderStackOrder,
  type ProviderStackDefinition,
  type ProviderStackRuntimeSummary,
} from "../provider/providerStack";

export const LOCAL_DEEP_RESEARCH_PROVIDER_STACK_SCHEMA_VERSION = "ambient-local-deep-research-provider-stack-v1" as const;
export const LOCAL_DEEP_RESEARCH_PROVIDER_STACK_STATUS_SCHEMA_VERSION = "ambient-local-deep-research-provider-stack-status-v1" as const;
export const LOCAL_DEEP_RESEARCH_PROVIDER_DISCOVERY_SCHEMA_VERSION = "ambient-local-deep-research-provider-discovery-v1" as const;
export const LOCAL_MODEL_RESOURCE_SETTINGS_SCHEMA_VERSION = "ambient-local-model-resource-settings-v1" as const;
export const LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_SCHEMA_VERSION = "ambient-local-deep-research-final-synthesis-v1" as const;

export const LOCAL_DEEP_RESEARCH_PROVIDER_IDS = {
  liteResearcher: "local.deep-research.literesearcher",
} as const;

export const LOCAL_DEEP_RESEARCH_DEFAULT_PROVIDERS: LocalDeepResearchProviderConfig[] = [
  {
    providerId: LOCAL_DEEP_RESEARCH_PROVIDER_IDS.liteResearcher,
    label: "LiteResearcher",
    kind: "first-party",
    roles: ["research"],
    status: "enabled",
    capabilityId: "local.deep-research.literesearcher",
    privacyLabel: "LiteResearcher inference runs locally after Ambient installs the managed model and runtime; configured web providers may still receive search/fetch requests.",
    finalSynthesis: defaultLocalDeepResearchFinalSynthesisConfig(),
  },
];

export const LOCAL_DEEP_RESEARCH_DEFAULT_PREFERENCES: Record<LocalDeepResearchProviderRole, string[]> = {
  research: [LOCAL_DEEP_RESEARCH_PROVIDER_IDS.liteResearcher],
};

const LOCAL_DEEP_RESEARCH_PROVIDER_ROLE_LIST = ["research"] as const satisfies readonly LocalDeepResearchProviderRole[];
const LOCAL_DEEP_RESEARCH_PROVIDER_KINDS = new Set<LocalDeepResearchProviderKind>(["first-party", "ambient-cli", "mcp", "test-adapter"]);
const LOCAL_MODEL_MEMORY_LIMIT_BEHAVIORS = new Set<LocalModelMemoryLimitBehavior>(["warn", "refuse", "unload-idle", "ask-to-exceed"]);
const LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_MODES = new Set<LocalDeepResearchFinalSynthesisMode>(["local", "evidence_only"]);

const LOCAL_DEEP_RESEARCH_PROVIDER_STACK_DEFINITION: ProviderStackDefinition<
  typeof LOCAL_DEEP_RESEARCH_PROVIDER_STACK_SCHEMA_VERSION,
  LocalDeepResearchProviderRole,
  LocalDeepResearchProviderConfig
> = {
  schemaVersion: LOCAL_DEEP_RESEARCH_PROVIDER_STACK_SCHEMA_VERSION,
  roles: LOCAL_DEEP_RESEARCH_PROVIDER_ROLE_LIST,
  defaultProviders: LOCAL_DEEP_RESEARCH_DEFAULT_PROVIDERS,
  defaultPreferences: LOCAL_DEEP_RESEARCH_DEFAULT_PREFERENCES,
  cloneProvider: cloneLocalDeepResearchProvider,
  normalizeCustomProvider,
};

export interface LocalDeepResearchProviderStackStatus {
  schemaVersion: typeof LOCAL_DEEP_RESEARCH_PROVIDER_STACK_STATUS_SCHEMA_VERSION;
  settings: LocalDeepResearchProviderStackSettings;
  roles: Array<{
    role: LocalDeepResearchProviderRole;
    providers: ProviderStackRuntimeSummary<LocalDeepResearchProviderRole, LocalDeepResearchProviderConfig>[];
  }>;
  activeProvider?: LocalDeepResearchProviderConfig;
  providerOrder: string[];
  skippedProviders: Array<{
    providerId: string;
    reason: string;
  }>;
}

export interface LocalDeepResearchConfiguredProviderCandidate {
  source: "configured";
  providerId: string;
  label: string;
  kind: LocalDeepResearchProviderConfig["kind"];
  roles: LocalDeepResearchProviderRole[];
  configuredStatus: LocalDeepResearchProviderConfig["status"];
  order?: number;
  capabilityId?: string;
  privacyLabel?: string;
  optionalSecretRefs: string[];
  finalSynthesis: LocalDeepResearchFinalSynthesisConfig;
  ambientCli?: LocalDeepResearchProviderConfig["ambientCli"];
  mcp?: LocalDeepResearchProviderConfig["mcp"];
}

export interface LocalDeepResearchCatalogProviderCandidate {
  source: "known-addable";
  catalogId: string;
  displayName: string;
  providerName?: string;
  installerShape?: string;
  recommendationTier: string;
  providerKind: string;
  summary: string;
  requiredSecrets: string[];
  optionalSecrets: string[];
  networkHosts: string[];
  validationTarget: string;
  selectionGuidance: string[];
}

export interface LocalDeepResearchProviderDiscoveryResult {
  schemaVersion: typeof LOCAL_DEEP_RESEARCH_PROVIDER_DISCOVERY_SCHEMA_VERSION;
  query?: string;
  configuredProviders: LocalDeepResearchConfiguredProviderCandidate[];
  knownAddableProviders: LocalDeepResearchCatalogProviderCandidate[];
}

export interface LocalDeepResearchProviderDescribeResult extends LocalDeepResearchProviderDiscoveryResult {
  selectedProvider?: LocalDeepResearchConfiguredProviderCandidate | LocalDeepResearchCatalogProviderCandidate;
}

export interface LocalDeepResearchProviderPreferenceUpdateInput {
  action?: "set_order" | "prefer_provider" | "reset_defaults" | "set_final_synthesis";
  providerOrder?: string[];
  providerId?: string;
  providerAlias?: string;
  preferredProvider?: string;
  finalSynthesisMode?: LocalDeepResearchFinalSynthesisMode;
  mode?: LocalDeepResearchFinalSynthesisMode;
  sourceLimit?: number;
  evidencePreviewChars?: number;
  reason?: string;
}

export interface LocalDeepResearchProviderPreferenceUpdatePlan {
  action: NonNullable<LocalDeepResearchProviderPreferenceUpdateInput["action"]>;
  previousSettings: LocalDeepResearchSettings;
  nextSettings: LocalDeepResearchSettings;
  nextProvider?: LocalDeepResearchConfiguredProviderCandidate;
  nextFinalSynthesis?: LocalDeepResearchFinalSynthesisConfig;
  reason?: string;
  hasChanges: boolean;
}

export function defaultLocalDeepResearchProviderStackSettings(): LocalDeepResearchProviderStackSettings {
  return defaultProviderStackSettings(LOCAL_DEEP_RESEARCH_PROVIDER_STACK_DEFINITION);
}

export function defaultLocalDeepResearchSettings(): LocalDeepResearchSettings {
  return {
    providerStack: defaultLocalDeepResearchProviderStackSettings(),
    localModelResources: defaultLocalModelResourceSettings(),
    runBudget: normalizeLocalDeepResearchRunBudgetSettings(undefined),
  };
}

export function normalizeLocalDeepResearchSettings(value: unknown): LocalDeepResearchSettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    providerStack: normalizeLocalDeepResearchProviderStackSettings(record.providerStack ?? record.providers),
    localModelResources: normalizeLocalModelResourceSettings(record.localModelResources ?? record.resources),
    runBudget: normalizeLocalDeepResearchRunBudgetSettings(record.runBudget ?? record.budget ?? record.localResearchBudget),
  };
}

export function defaultLocalModelResourceSettings(): LocalModelResourceSettings {
  return {
    schemaVersion: LOCAL_MODEL_RESOURCE_SETTINGS_SCHEMA_VERSION,
    maxProjectedMemoryUtilization: DEFAULT_LOCAL_RUNTIME_MAX_PROJECTED_MEMORY_UTILIZATION,
    minFreeMemoryRatioAfterLaunch: DEFAULT_LOCAL_RUNTIME_MIN_FREE_MEMORY_RATIO_AFTER_LAUNCH,
    comfortableFreeMemoryRatio: DEFAULT_LOCAL_RUNTIME_COMFORTABLE_FREE_MEMORY_RATIO,
    memoryLimitBehavior: "warn",
  };
}

export function normalizeLocalModelResourceSettings(value: unknown): LocalModelResourceSettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const maxResidentMemoryBytes = typeof record.maxResidentMemoryBytes === "number" && Number.isFinite(record.maxResidentMemoryBytes) && record.maxResidentMemoryBytes > 0
    ? Math.floor(record.maxResidentMemoryBytes)
    : undefined;
  const memoryLimitBehavior = typeof record.memoryLimitBehavior === "string" && LOCAL_MODEL_MEMORY_LIMIT_BEHAVIORS.has(record.memoryLimitBehavior as LocalModelMemoryLimitBehavior)
    ? record.memoryLimitBehavior as LocalModelMemoryLimitBehavior
    : "warn";
  return {
    schemaVersion: LOCAL_MODEL_RESOURCE_SETTINGS_SCHEMA_VERSION,
    ...(maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes } : {}),
    maxProjectedMemoryUtilization: normalizeLocalModelResourceRatio(
      record.maxProjectedMemoryUtilization,
      DEFAULT_LOCAL_RUNTIME_MAX_PROJECTED_MEMORY_UTILIZATION,
    ),
    minFreeMemoryRatioAfterLaunch: normalizeLocalModelResourceRatio(
      record.minFreeMemoryRatioAfterLaunch,
      DEFAULT_LOCAL_RUNTIME_MIN_FREE_MEMORY_RATIO_AFTER_LAUNCH,
    ),
    comfortableFreeMemoryRatio: normalizeLocalModelResourceRatio(
      record.comfortableFreeMemoryRatio,
      DEFAULT_LOCAL_RUNTIME_COMFORTABLE_FREE_MEMORY_RATIO,
    ),
    memoryLimitBehavior,
  };
}

export function defaultLocalDeepResearchFinalSynthesisConfig(): LocalDeepResearchFinalSynthesisConfig {
  return {
    schemaVersion: LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_SCHEMA_VERSION,
    mode: "local",
    sourceLimit: 12,
    evidencePreviewChars: 1_200,
  };
}

export function normalizeLocalDeepResearchFinalSynthesisConfig(value: unknown): LocalDeepResearchFinalSynthesisConfig {
  const fallback = defaultLocalDeepResearchFinalSynthesisConfig();
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mode = typeof record.mode === "string" && LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_MODES.has(record.mode as LocalDeepResearchFinalSynthesisMode)
    ? record.mode as LocalDeepResearchFinalSynthesisMode
    : fallback.mode;
  return {
    schemaVersion: LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_SCHEMA_VERSION,
    mode,
    sourceLimit: boundedInteger(record.sourceLimit, fallback.sourceLimit, 1, 50),
    evidencePreviewChars: boundedInteger(record.evidencePreviewChars, fallback.evidencePreviewChars, 200, 12_000),
  };
}

function normalizeLocalModelResourceRatio(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;
}

export function normalizeLocalDeepResearchProviderStackSettings(value: unknown): LocalDeepResearchProviderStackSettings {
  return normalizeProviderStackSettings(value, LOCAL_DEEP_RESEARCH_PROVIDER_STACK_DEFINITION);
}

export function activeLocalDeepResearchProvider(settings: LocalDeepResearchSettings | undefined): LocalDeepResearchProviderConfig | undefined {
  return buildLocalDeepResearchProviderStackStatus({ settings }).activeProvider;
}

export function buildLocalDeepResearchProviderStackStatus(input: {
  settings?: LocalDeepResearchSettings;
  runtime?: Partial<Record<string, Omit<ProviderStackRuntimeSummary<LocalDeepResearchProviderRole, LocalDeepResearchProviderConfig>, "providerId" | "label" | "role" | "kind" | "configuredStatus" | "privacyLabel">>>;
} = {}): LocalDeepResearchProviderStackStatus {
  const settings = normalizeLocalDeepResearchSettings(input.settings).providerStack;
  const plan = planLocalDeepResearchProviderOrder(settings);
  const status = buildProviderStackStatus({
    schemaVersion: LOCAL_DEEP_RESEARCH_PROVIDER_STACK_STATUS_SCHEMA_VERSION,
    stack: settings,
    roles: LOCAL_DEEP_RESEARCH_PROVIDER_ROLE_LIST,
    defaultPreferences: LOCAL_DEEP_RESEARCH_DEFAULT_PREFERENCES,
    runtime: input.runtime,
    defaultAvailability: (provider) => provider.kind === "first-party" ? "available" : "unknown",
  });
  return {
    ...status,
    settings,
    activeProvider: plan.providerOrder[0] ? settings.providers.find((provider) => provider.providerId === plan.providerOrder[0]) : undefined,
    providerOrder: plan.providerOrder,
    skippedProviders: plan.skippedProviders,
  };
}

export function localDeepResearchProviderStackStatusText(status: LocalDeepResearchProviderStackStatus): string {
  const active = status.activeProvider
    ? `${status.activeProvider.label} (${status.activeProvider.providerId})`
    : "none";
  return [
    "Ambient Local Deep Research provider stack",
    `Active provider: ${active}.`,
    "",
    "Research order:",
    ...status.roles[0].providers.map((provider, index) => {
      const reason = provider.reason ? `; ${provider.reason}` : "";
      return `${index + 1}. ${provider.label} (${provider.providerId}) - ${provider.availability}${reason}`;
    }),
    ...status.skippedProviders.map((provider) => `Skipped ${provider.providerId}: ${provider.reason}`),
    status.activeProvider ? `Final synthesis: ${formatFinalSynthesisMode(finalSynthesisForProvider(status.activeProvider).mode)}.` : undefined,
    "",
    "Only the top enabled provider is active for the next Local Deep Research run. Use local_deep_research_provider_update to change persistent order with approval.",
    "Use local_deep_research_provider_search or local_deep_research_provider_describe before claiming whether another local deep research provider is configured or addable.",
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function buildLocalDeepResearchProviderDiscovery(input: {
  settings?: LocalDeepResearchSettings;
  providerCatalogEntries?: ProviderCatalogEntry[];
  query?: string;
  limit?: number;
} = {}): LocalDeepResearchProviderDiscoveryResult {
  const query = normalizeQuery(input.query);
  const settings = normalizeLocalDeepResearchSettings(input.settings).providerStack;
  const configuredProviders = settings.providers
    .map((provider) => configuredCandidate(provider, settings.preferences))
    .filter((candidate) => candidateMatches(candidate, query));
  const knownAddableProviders = (input.providerCatalogEntries ?? getProviderCatalogEntries())
    .filter((entry) => entry.capabilityArea === "deep-research")
    .map(catalogCandidate)
    .filter((candidate) => candidateMatches(candidate, query));
  const limit = boundedDiscoveryLimit(input.limit);
  return {
    schemaVersion: LOCAL_DEEP_RESEARCH_PROVIDER_DISCOVERY_SCHEMA_VERSION,
    ...(query ? { query } : {}),
    configuredProviders: configuredProviders.slice(0, limit),
    knownAddableProviders: knownAddableProviders.slice(0, limit),
  };
}

export function describeLocalDeepResearchProvider(input: {
  settings?: LocalDeepResearchSettings;
  providerCatalogEntries?: ProviderCatalogEntry[];
  provider: string;
  limit?: number;
}): LocalDeepResearchProviderDescribeResult {
  const result = buildLocalDeepResearchProviderDiscovery({
    settings: input.settings,
    providerCatalogEntries: input.providerCatalogEntries,
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

export function localDeepResearchProviderDiscoveryText(result: LocalDeepResearchProviderDiscoveryResult): string {
  return [
    "Ambient Local Deep Research provider discovery",
    result.query ? `Query: ${result.query}` : undefined,
    "",
    "Configured providers:",
    ...formatConfiguredProviders(result.configuredProviders),
    "",
    "Known addable deep-research cards:",
    ...formatKnownAddableProviders(result.knownAddableProviders),
    "",
    "Use local_deep_research_provider_describe before recommending setup or reordering.",
    "Use local_deep_research_provider_update only for configured providers. Known-addable cards still need their own setup plan before they can be made active.",
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function localDeepResearchProviderDescribeText(result: LocalDeepResearchProviderDescribeResult, provider: string): string {
  const lines = [
    "Ambient Local Deep Research provider description",
    `Provider query: ${provider}`,
    "",
  ];
  if (!result.selectedProvider) {
    lines.push("No exact provider match was found.", "", localDeepResearchProviderDiscoveryText(result));
    return lines.join("\n");
  }
  const selected = result.selectedProvider;
  if (selected.source === "configured") {
    lines.push(...[
      `${selected.label} (${selected.providerId})`,
      `State: ${selected.configuredStatus}; source=configured; kind=${selected.kind}.`,
      `Order: ${selected.order ? `research#${selected.order}` : "not in active order"}.`,
      selected.capabilityId ? `Capability: ${selected.capabilityId}.` : undefined,
      selected.privacyLabel ? `Privacy: ${selected.privacyLabel}` : undefined,
      `Final synthesis: ${formatFinalSynthesisMode(selected.finalSynthesis.mode)}; sourceLimit=${selected.finalSynthesis.sourceLimit}; evidencePreviewChars=${selected.finalSynthesis.evidencePreviewChars}.`,
      selected.optionalSecretRefs.length ? `Secrets: ${selected.optionalSecretRefs.join(", ")}.` : undefined,
      selected.ambientCli ? `Ambient CLI: package=${selected.ambientCli.packageName}; command=${selected.ambientCli.commandName}.` : undefined,
      selected.mcp ? `MCP: server=${selected.mcp.serverId ?? "unknown"}; workload=${selected.mcp.workloadName ?? "unknown"}; tool=${selected.mcp.toolName}.` : undefined,
      "",
      "This provider is configured. Use local_deep_research_provider_update to make it top priority, set the complete provider order, or change final synthesis mode.",
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
    `Validation target: ${selected.validationTarget}`,
    selected.selectionGuidance.length ? `Selection guidance: ${selected.selectionGuidance.join(" ")}` : undefined,
    "",
    "This provider is not configured. Add or validate it through its own setup plan before making it active in the Local Deep Research provider stack.",
  ].filter((line): line is string => typeof line === "string"));
  return lines.join("\n");
}

export function planLocalDeepResearchProviderPreferenceUpdate(
  input: LocalDeepResearchProviderPreferenceUpdateInput,
  current: LocalDeepResearchSettings | undefined,
  now = new Date(),
): LocalDeepResearchProviderPreferenceUpdatePlan {
  const action = input.action ?? (
    input.finalSynthesisMode || input.mode
      ? "set_final_synthesis"
      : input.providerOrder?.length
        ? "set_order"
        : input.providerId || input.providerAlias || input.preferredProvider
          ? "prefer_provider"
          : "reset_defaults"
  );
  if (!["set_order", "prefer_provider", "reset_defaults", "set_final_synthesis"].includes(action)) throw new Error(`Unsupported Local Deep Research provider action: ${action}`);
  const previousSettings = normalizeLocalDeepResearchSettings(current);
  const previousStack = previousSettings.providerStack;
  const reason = input.reason?.trim();
  let providerOrder: string[];
  let nextProvider: LocalDeepResearchConfiguredProviderCandidate | undefined;
  let nextFinalSynthesis: LocalDeepResearchFinalSynthesisConfig | undefined;
  if (action === "set_final_synthesis") {
    const provider = resolveConfiguredProvider(input, previousStack);
    nextFinalSynthesis = normalizeLocalDeepResearchFinalSynthesisConfig({
      mode: input.finalSynthesisMode ?? input.mode,
      sourceLimit: input.sourceLimit,
      evidencePreviewChars: input.evidencePreviewChars,
    });
    const nextStack: LocalDeepResearchProviderStackSettings = {
      ...previousStack,
      providers: previousStack.providers.map((candidate) => candidate.providerId === provider.providerId
        ? {
            ...candidate,
            finalSynthesis: nextFinalSynthesis,
          }
        : candidate),
      updatedAt: now.toISOString(),
    };
    nextProvider = configuredCandidate(
      nextStack.providers.find((candidate) => candidate.providerId === provider.providerId) ?? provider,
      nextStack.preferences,
    );
    const nextSettings: LocalDeepResearchSettings = {
      providerStack: nextStack,
      localModelResources: previousSettings.localModelResources,
      runBudget: previousSettings.runBudget,
    };
    return {
      action,
      previousSettings,
      nextSettings,
      ...(nextProvider ? { nextProvider } : {}),
      nextFinalSynthesis,
      ...(reason ? { reason } : {}),
      hasChanges: !localDeepResearchProviderSettingsEqual(previousSettings, nextSettings, { ignoreUpdatedAt: true }),
    };
  }
  if (action === "reset_defaults") {
    providerOrder = [...LOCAL_DEEP_RESEARCH_DEFAULT_PREFERENCES.research];
  } else if (action === "set_order") {
    if (!input.providerOrder?.length) throw new Error("Pass providerOrder when action=set_order.");
    providerOrder = resolveConfiguredProviderOrder(input.providerOrder, previousStack);
  } else {
    const provider = resolveConfiguredProvider(input, previousStack);
    nextProvider = configuredCandidate(provider, previousStack.preferences);
    providerOrder = [
      provider.providerId,
      ...(previousStack.preferences.research ?? []),
    ].filter((providerId, index, list) => list.indexOf(providerId) === index);
  }
  const nextStack = updateProviderStackOrder({
    stack: previousStack,
    role: "research",
    providerOrder,
    defaultPreferences: LOCAL_DEEP_RESEARCH_DEFAULT_PREFERENCES,
    updatedAt: now.toISOString(),
  }) as LocalDeepResearchProviderStackSettings;
  const nextSettings: LocalDeepResearchSettings = {
    providerStack: nextStack,
    localModelResources: previousSettings.localModelResources,
    runBudget: previousSettings.runBudget,
  };
  return {
    action,
    previousSettings,
    nextSettings,
    ...(nextProvider ? { nextProvider } : {}),
    ...(reason ? { reason } : {}),
    hasChanges: !localDeepResearchProviderSettingsEqual(previousSettings, nextSettings, { ignoreUpdatedAt: true }),
  };
}

export function localDeepResearchProviderPreferenceUpdateText(plan: LocalDeepResearchProviderPreferenceUpdatePlan, savedSettings: LocalDeepResearchSettings): string {
  const status = buildLocalDeepResearchProviderStackStatus({ settings: savedSettings });
  if (plan.action === "set_final_synthesis") {
    const synthesis = plan.nextProvider?.finalSynthesis ?? plan.nextFinalSynthesis;
    if (!plan.hasChanges) {
      return [
        "Ambient Local Deep Research provider final synthesis unchanged",
        `Provider: ${plan.nextProvider ? `${plan.nextProvider.label} (${plan.nextProvider.providerId})` : "unknown"}.`,
        synthesis ? `Final synthesis: ${formatFinalSynthesisMode(synthesis.mode)}.` : undefined,
      ].filter((line): line is string => typeof line === "string").join("\n");
    }
    return [
      "Ambient Local Deep Research provider final synthesis updated",
      `Provider: ${plan.nextProvider ? `${plan.nextProvider.label} (${plan.nextProvider.providerId})` : "unknown"}.`,
      synthesis ? `Final synthesis: ${formatFinalSynthesisMode(synthesis.mode)}; sourceLimit=${synthesis.sourceLimit}; evidencePreviewChars=${synthesis.evidencePreviewChars}.` : undefined,
      `Active provider: ${status.activeProvider ? `${status.activeProvider.label} (${status.activeProvider.providerId})` : "none"}.`,
    ].filter((line): line is string => typeof line === "string").join("\n");
  }
  if (!plan.hasChanges) {
    return [
      "Ambient Local Deep Research provider order unchanged",
      `Active provider: ${status.activeProvider ? `${status.activeProvider.label} (${status.activeProvider.providerId})` : "none"}.`,
      `Research order: ${status.providerOrder.join(" -> ") || "none"}.`,
    ].join("\n");
  }
  return [
    "Ambient Local Deep Research provider order updated",
    `Active provider: ${status.activeProvider ? `${status.activeProvider.label} (${status.activeProvider.providerId})` : "none"}.`,
    `Research order: ${status.providerOrder.join(" -> ") || "none"}.`,
    status.activeProvider ? `Final synthesis: ${formatFinalSynthesisMode(finalSynthesisForProvider(status.activeProvider).mode)}.` : undefined,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function localDeepResearchProviderPreferenceApprovalDetail(plan: LocalDeepResearchProviderPreferenceUpdatePlan, workspacePath: string): string {
  return [
    `Workspace: ${workspacePath}`,
    "Scope: Global Local Deep Research provider preference",
    `Previous: ${localDeepResearchProviderSettingsSummary(plan.previousSettings)}`,
    `Next: ${localDeepResearchProviderSettingsSummary(plan.nextSettings)}`,
    plan.nextProvider ? `Provider: ${plan.nextProvider.label} (${plan.nextProvider.providerId})` : undefined,
    plan.nextFinalSynthesis ? `Final synthesis: ${formatFinalSynthesisMode(plan.nextFinalSynthesis.mode)}; sourceLimit=${plan.nextFinalSynthesis.sourceLimit}; evidencePreviewChars=${plan.nextFinalSynthesis.evidencePreviewChars}` : undefined,
    plan.reason ? `Reason: ${plan.reason}` : undefined,
  ].filter(Boolean).join("\n");
}

function planLocalDeepResearchProviderOrder(settings: LocalDeepResearchProviderStackSettings) {
  return planProviderStackOrder({
    stack: settings,
    role: "research",
    defaultPreferences: LOCAL_DEEP_RESEARCH_DEFAULT_PREFERENCES,
    unknownProviderReason: "Provider is not registered in Ambient Local Deep Research settings.",
    disabledProviderReason: "Provider is disabled in Ambient Local Deep Research settings.",
  });
}

function normalizeCustomProvider(value: unknown): LocalDeepResearchProviderConfig | undefined {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const providerId = typeof record.providerId === "string" && record.providerId.trim() ? record.providerId.trim() : undefined;
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : undefined;
  const kind = typeof record.kind === "string" && LOCAL_DEEP_RESEARCH_PROVIDER_KINDS.has(record.kind as LocalDeepResearchProviderKind)
    ? record.kind as LocalDeepResearchProviderKind
    : undefined;
  if (!providerId || !label || !kind) return undefined;
  const status = record.status === "disabled" ? "disabled" as const : "enabled" as const;
  const capabilityId = typeof record.capabilityId === "string" && record.capabilityId.trim() ? record.capabilityId.trim() : undefined;
  const privacyLabel = typeof record.privacyLabel === "string" && record.privacyLabel.trim() ? record.privacyLabel.trim() : undefined;
  const optionalSecretRefs = Array.isArray(record.optionalSecretRefs)
    ? [...new Set(record.optionalSecretRefs.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim()))]
    : [];
  const ambientCli = normalizeAmbientCliBinding(record.ambientCli);
  const mcp = normalizeMcpBinding(record.mcp);
  const finalSynthesis = normalizeLocalDeepResearchFinalSynthesisConfig(record.finalSynthesis);
  return {
    providerId,
    label,
    kind,
    roles: ["research"],
    status,
    ...(capabilityId ? { capabilityId } : {}),
    ...(privacyLabel ? { privacyLabel } : {}),
    ...(optionalSecretRefs.length ? { optionalSecretRefs } : {}),
    finalSynthesis,
    ...(ambientCli ? { ambientCli } : {}),
    ...(mcp ? { mcp } : {}),
  };
}

function cloneLocalDeepResearchProvider(provider: LocalDeepResearchProviderConfig): LocalDeepResearchProviderConfig {
  return {
    ...provider,
    roles: [...provider.roles],
    ...(provider.optionalSecretRefs ? { optionalSecretRefs: [...provider.optionalSecretRefs] } : {}),
    finalSynthesis: normalizeLocalDeepResearchFinalSynthesisConfig(provider.finalSynthesis),
    ...(provider.ambientCli ? { ambientCli: { ...provider.ambientCli } } : {}),
    ...(provider.mcp ? { mcp: { ...provider.mcp } } : {}),
  };
}

function normalizeAmbientCliBinding(value: unknown): LocalDeepResearchProviderConfig["ambientCli"] | undefined {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function normalizeMcpBinding(value: unknown): LocalDeepResearchProviderConfig["mcp"] | undefined {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function configuredCandidate(
  provider: LocalDeepResearchProviderConfig,
  preferences: Partial<Record<LocalDeepResearchProviderRole, string[]>>,
): LocalDeepResearchConfiguredProviderCandidate {
  const index = preferences.research?.indexOf(provider.providerId) ?? -1;
  return {
    source: "configured",
    providerId: provider.providerId,
    label: provider.label,
    kind: provider.kind,
    roles: [...provider.roles],
    configuredStatus: provider.status,
    ...(index >= 0 ? { order: index + 1 } : {}),
    ...(provider.capabilityId ? { capabilityId: provider.capabilityId } : {}),
    ...(provider.privacyLabel ? { privacyLabel: provider.privacyLabel } : {}),
    optionalSecretRefs: [...(provider.optionalSecretRefs ?? [])],
    finalSynthesis: finalSynthesisForProvider(provider),
    ...(provider.ambientCli ? { ambientCli: { ...provider.ambientCli } } : {}),
    ...(provider.mcp ? { mcp: { ...provider.mcp } } : {}),
  };
}

function catalogCandidate(entry: ProviderCatalogEntry): LocalDeepResearchCatalogProviderCandidate {
  return {
    source: "known-addable",
    catalogId: entry.id,
    displayName: entry.displayName,
    ...(entry.capabilityBuilderDefaults?.provider ? { providerName: entry.capabilityBuilderDefaults.provider } : {}),
    ...(entry.installerShape ? { installerShape: entry.installerShape } : {}),
    recommendationTier: entry.recommendationTier,
    providerKind: entry.providerKind,
    summary: entry.recommendationSummary,
    requiredSecrets: entry.secrets.filter((secret) => secret.required).map((secret) => secret.envName),
    optionalSecrets: entry.secrets.filter((secret) => !secret.required).map((secret) => secret.envName),
    networkHosts: [...entry.networkHosts],
    validationTarget: entry.ambientContract.validationTarget,
    selectionGuidance: providerSelectionGuidanceForProvider(entry).slice(0, 4),
  };
}

function formatConfiguredProviders(providers: LocalDeepResearchConfiguredProviderCandidate[]): string[] {
  if (!providers.length) return ["- No configured providers matched."];
  return providers.map((provider) => {
    const secrets = provider.optionalSecretRefs.length ? `; secrets=${provider.optionalSecretRefs.join(",")}` : "";
    return `- ${provider.label} (${provider.providerId}) source=configured; state=${provider.configuredStatus}; kind=${provider.kind}; order=${provider.order ? `research#${provider.order}` : "inactive"}; finalSynthesis=${provider.finalSynthesis.mode}${secrets}`;
  });
}

function formatKnownAddableProviders(providers: LocalDeepResearchCatalogProviderCandidate[]): string[] {
  if (!providers.length) return ["- No known addable deep-research cards matched."];
  return providers.map((provider) => {
    const secrets = provider.requiredSecrets.length ? `; requiredSecrets=${provider.requiredSecrets.join(",")}` : "";
    const hosts = provider.networkHosts.length ? `; hosts=${provider.networkHosts.join(",")}` : "";
    const providerName = provider.providerName ? `; provider=${provider.providerName}` : "";
    return `- ${provider.displayName} (${provider.catalogId}) source=provider-catalog; state=known-addable; installer=${provider.installerShape ?? "unspecified"}; tier=${provider.recommendationTier}${providerName}${secrets}${hosts}`;
  });
}

function resolveConfiguredProvider(
  input: LocalDeepResearchProviderPreferenceUpdateInput,
  stack: LocalDeepResearchProviderStackSettings,
): LocalDeepResearchProviderConfig {
  const requested = input.providerId?.trim() || input.providerAlias?.trim() || input.preferredProvider?.trim();
  if (!requested) throw new Error(`Pass providerId, providerAlias, or preferredProvider for ${input.action ?? "provider update"}.`);
  const alias = normalizeAlias(requested);
  const matches = stack.providers.filter((provider) => providerAliases(configuredCandidate(provider, stack.preferences)).includes(alias));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Local Deep Research provider "${requested}" is ambiguous. Use an exact providerId.`);
  throw new Error(`Local Deep Research provider "${requested}" is not configured. Call local_deep_research_provider_search first.`);
}

function resolveConfiguredProviderOrder(
  providerOrder: string[],
  stack: LocalDeepResearchProviderStackSettings,
): string[] {
  return providerOrder
    .map((provider) => resolveConfiguredProvider({ action: "set_order", providerId: provider }, stack).providerId)
    .filter((providerId, index, list) => list.indexOf(providerId) === index);
}

function candidateMatches(
  candidate: LocalDeepResearchConfiguredProviderCandidate | LocalDeepResearchCatalogProviderCandidate,
  query: string | undefined,
): boolean {
  if (!query) return true;
  return providerAliases(candidate).join(" ").includes(normalizeAlias(query));
}

function providerAliases(candidate: LocalDeepResearchConfiguredProviderCandidate | LocalDeepResearchCatalogProviderCandidate): string[] {
  if (candidate.source === "configured") {
    return [
      candidate.providerId,
      candidate.label,
      candidate.kind,
      candidate.capabilityId,
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
  ].flatMap((value) => value ? [normalizeAlias(value)] : []);
}

function localDeepResearchProviderSettingsEqual(
  left: LocalDeepResearchSettings,
  right: LocalDeepResearchSettings,
  options: { ignoreUpdatedAt?: boolean } = {},
): boolean {
  const clean = (settings: LocalDeepResearchSettings) => ({
    providers: settings.providerStack.providers.map((provider) => ({
      providerId: provider.providerId,
      status: provider.status,
      finalSynthesis: normalizeLocalDeepResearchFinalSynthesisConfig(provider.finalSynthesis),
    })),
    preferences: settings.providerStack.preferences,
    ...(options.ignoreUpdatedAt ? {} : { updatedAt: settings.providerStack.updatedAt }),
  });
  return JSON.stringify(clean(left)) === JSON.stringify(clean(right));
}

function localDeepResearchProviderSettingsSummary(settings: LocalDeepResearchSettings): string {
  const status = buildLocalDeepResearchProviderStackStatus({ settings });
  return [
    `Active: ${status.activeProvider ? `${status.activeProvider.label} (${status.activeProvider.providerId})` : "none"}`,
    `Order: ${status.providerOrder.join(" -> ") || "none"}`,
    status.activeProvider ? `Final synthesis: ${formatFinalSynthesisMode(finalSynthesisForProvider(status.activeProvider).mode)}` : undefined,
  ].filter((line): line is string => typeof line === "string").join("; ");
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

function finalSynthesisForProvider(provider: LocalDeepResearchProviderConfig): LocalDeepResearchFinalSynthesisConfig {
  return normalizeLocalDeepResearchFinalSynthesisConfig(provider.finalSynthesis);
}

function formatFinalSynthesisMode(mode: LocalDeepResearchFinalSynthesisMode): string {
  return mode === "evidence_only"
    ? "defer final synthesis to parent from evidence packet"
    : "local LiteResearcher synthesis with deterministic citation repair";
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(numeric, max));
}
