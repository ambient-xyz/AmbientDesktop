import type {
  AmbientMcpDefaultCapabilitySummary,
  WebResearchProviderConfig,
  WebResearchProviderRole,
  WebResearchProviderStackSettings,
} from "../../shared/types";

const WEB_RESEARCH_UI_SCHEMA_VERSION = "ambient-web-research-provider-stack-v1" as const;

export const WEB_RESEARCH_UI_PROVIDER_IDS = {
  exa: "exa-mcp-default",
  scrapling: "scrapling-mcp-default",
  browser: "ambient-browser",
} as const;

export const WEB_RESEARCH_UI_DEFAULT_PROVIDERS: WebResearchProviderConfig[] = [
  {
    providerId: WEB_RESEARCH_UI_PROVIDER_IDS.exa,
    label: "Exa Search",
    kind: "remote-mcp",
    roles: ["search", "fetch"],
    status: "enabled",
    optionalSecretRefs: ["EXA_API_KEY"],
    privacyLabel: "Queries and fetched public URLs may be sent to Exa.",
  },
  {
    providerId: WEB_RESEARCH_UI_PROVIDER_IDS.scrapling,
    label: "Scrapling",
    kind: "toolhive-mcp",
    roles: ["fetch"],
    status: "enabled",
    privacyLabel: "Public pages are fetched through the local ToolHive-isolated Scrapling workload.",
  },
  {
    providerId: WEB_RESEARCH_UI_PROVIDER_IDS.browser,
    label: "Ambient Browser",
    kind: "built-in-browser",
    roles: ["search", "fetch", "interactive_browser"],
    status: "enabled",
    privacyLabel: "Browser fallback uses Ambient's managed browser session.",
  },
];

export const WEB_RESEARCH_UI_DEFAULT_PREFERENCES: Record<WebResearchProviderRole, string[]> = {
  search: [WEB_RESEARCH_UI_PROVIDER_IDS.exa, WEB_RESEARCH_UI_PROVIDER_IDS.browser],
  fetch: [WEB_RESEARCH_UI_PROVIDER_IDS.scrapling, WEB_RESEARCH_UI_PROVIDER_IDS.exa, WEB_RESEARCH_UI_PROVIDER_IDS.browser],
  interactive_browser: [WEB_RESEARCH_UI_PROVIDER_IDS.browser],
};

const WEB_RESEARCH_UI_DEFAULT_FALLBACK_POLICY = {
  allowBrowserFallback: true,
};

export function webResearchStackWithDefaults(stack?: WebResearchProviderStackSettings): WebResearchProviderStackSettings {
  if (!stack) {
    return {
      schemaVersion: WEB_RESEARCH_UI_SCHEMA_VERSION,
      providers: WEB_RESEARCH_UI_DEFAULT_PROVIDERS.map(cloneWebResearchProvider),
      preferences: {
        search: [...WEB_RESEARCH_UI_DEFAULT_PREFERENCES.search],
        fetch: [...WEB_RESEARCH_UI_DEFAULT_PREFERENCES.fetch],
        interactive_browser: [...WEB_RESEARCH_UI_DEFAULT_PREFERENCES.interactive_browser],
      },
      fallbackPolicy: { ...WEB_RESEARCH_UI_DEFAULT_FALLBACK_POLICY },
    };
  }
  const providers = mergeDefaultAndDynamicProviders(stack.providers);
  const providerIds = new Set(providers.map((provider) => provider.providerId));
  return {
    schemaVersion: WEB_RESEARCH_UI_SCHEMA_VERSION,
    providers,
    preferences: {
      search: webResearchRoleOrderWithDefaults(stack, "search", providerIds, providers),
      fetch: webResearchRoleOrderWithDefaults(stack, "fetch", providerIds, providers),
      interactive_browser: webResearchRoleOrderWithDefaults(stack, "interactive_browser", providerIds, providers),
    },
    fallbackPolicy: stack.fallbackPolicy ?? { ...WEB_RESEARCH_UI_DEFAULT_FALLBACK_POLICY },
    ...(stack.updatedAt ? { updatedAt: stack.updatedAt } : {}),
  };
}

export function webResearchProvidersForRole(stack: WebResearchProviderStackSettings, role: WebResearchProviderRole): WebResearchProviderConfig[] {
  const byId = new Map(stack.providers.map((provider) => [provider.providerId, provider]));
  return (stack.preferences[role] ?? []).map((providerId) => byId.get(providerId)).filter((provider): provider is WebResearchProviderConfig => Boolean(provider));
}

export function moveWebResearchProvider(stack: WebResearchProviderStackSettings, role: WebResearchProviderRole, providerId: string, direction: -1 | 1): WebResearchProviderStackSettings {
  const order = [...(stack.preferences[role] ?? [])];
  const from = order.indexOf(providerId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return stack;
  [order[from], order[to]] = [order[to], order[from]];
  return {
    ...stack,
    preferences: {
      ...stack.preferences,
      [role]: order,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function resetWebResearchRole(stack: WebResearchProviderStackSettings, role: WebResearchProviderRole): WebResearchProviderStackSettings {
  const preferredDynamicProviderIds = role === "search"
    ? stack.providers
      .filter((provider) =>
        provider.status === "enabled" &&
        provider.roles.includes("search") &&
        !WEB_RESEARCH_UI_DEFAULT_PREFERENCES.search.includes(provider.providerId) &&
        isPreferredDynamicSearchProvider(provider)
      )
      .map((provider) => provider.providerId)
    : [];
  return {
    ...stack,
    preferences: {
      ...stack.preferences,
      [role]: [...preferredDynamicProviderIds, ...WEB_RESEARCH_UI_DEFAULT_PREFERENCES[role]]
        .filter((providerId, index, list) => list.indexOf(providerId) === index),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function setWebResearchBrowserFallback(stack: WebResearchProviderStackSettings, allowBrowserFallback: boolean): WebResearchProviderStackSettings {
  return {
    ...stack,
    fallbackPolicy: { allowBrowserFallback },
    updatedAt: new Date().toISOString(),
  };
}

export function setWebResearchProviderEnabled(
  stack: WebResearchProviderStackSettings,
  providerId: string,
  enabled: boolean,
): WebResearchProviderStackSettings {
  if (!stack.providers.some((provider) => provider.providerId === providerId)) return stack;
  return {
    ...stack,
    providers: stack.providers.map((provider) =>
      provider.providerId === providerId
        ? { ...provider, status: enabled ? "enabled" : "disabled" }
        : cloneWebResearchProvider(provider),
    ),
    updatedAt: new Date().toISOString(),
  };
}

export type WebResearchProviderHealthTone = "success" | "warning" | "error" | "info";

export interface WebResearchProviderHealthBadge {
  label: string;
  tone: WebResearchProviderHealthTone;
  detail: string;
}

export interface WebResearchProviderHealthContext {
  scraplingDefaultCapability?: Pick<
    AmbientMcpDefaultCapabilitySummary,
    "capabilityId" | "status" | "nextAction" | "message" | "runtimeStatus" | "installedWorkloadStatus" | "installedEndpoint"
  >;
}

export function webResearchProviderHealthBadge(
  provider: WebResearchProviderConfig,
  context: WebResearchProviderHealthContext = {},
): WebResearchProviderHealthBadge {
  if (provider.status === "disabled") {
    return {
      label: "Disabled",
      tone: "warning",
      detail: "This provider is disabled in Search & Web settings and broker calls will skip it.",
    };
  }
  if (provider.providerId === WEB_RESEARCH_UI_PROVIDER_IDS.scrapling) {
    return scraplingHealthBadge(context.scraplingDefaultCapability);
  }
  if (provider.kind === "built-in-browser") {
    return {
      label: "Available",
      tone: "info",
      detail: "Ambient Browser is built in and remains available for fallback or explicit browser work.",
    };
  }
  if (provider.kind === "remote-mcp") {
    return {
      label: provider.optionalSecretRefs?.length ? "No key needed" : "Ready",
      tone: "success",
      detail: provider.optionalSecretRefs?.length
        ? "This remote provider can run with its default access path; an API key can be configured later for higher quotas."
        : "This remote provider is configured for web research routing.",
    };
  }
  if (provider.kind === "ambient-cli") {
    return {
      label: "Installed",
      tone: "success",
      detail: provider.ambientCli
        ? `Ambient CLI package ${provider.ambientCli.packageName} is registered for ${provider.ambientCli.commandName}.`
        : "Ambient CLI provider is registered.",
    };
  }
  if (provider.kind === "toolhive-mcp") {
    return {
      label: "Trusted",
      tone: "success",
      detail: provider.mcp
        ? `MCP tool ${provider.mcp.toolName} is available through ${provider.mcp.workloadName}.`
        : "ToolHive-managed MCP provider is configured.",
    };
  }
  return {
    label: "Configured",
    tone: "info",
    detail: "Provider is configured in Search & Web settings.",
  };
}

export type WebResearchProviderSetupActionKind =
  | "install-scrapling"
  | "open-mcp-runtime"
  | "configure-ambient-cli-secret";

export interface WebResearchProviderSetupAction {
  kind: WebResearchProviderSetupActionKind;
  label: string;
  title: string;
  disabled: boolean;
  packageId?: string;
  packageName?: string;
  envName?: string;
}

export interface WebResearchProviderSetupActionContext extends WebResearchProviderHealthContext {
  scraplingRuntimeReady?: boolean;
  scraplingBusy?: boolean;
}

export function webResearchProviderSetupAction(
  provider: WebResearchProviderConfig,
  context: WebResearchProviderSetupActionContext = {},
): WebResearchProviderSetupAction | undefined {
  if (provider.status === "disabled") return undefined;

  if (provider.providerId === WEB_RESEARCH_UI_PROVIDER_IDS.scrapling) {
    return scraplingSetupAction(context);
  }

  const ambientCli = provider.ambientCli;
  const requiredSecret = provider.optionalSecretRefs?.[0];
  if (ambientCli && requiredSecret) {
    return {
      kind: "configure-ambient-cli-secret",
      label: "Configure key",
      title: `Open Desktop secret entry for ${ambientCli.packageName} ${requiredSecret}.`,
      disabled: false,
      packageId: ambientCli.packageId,
      packageName: ambientCli.packageName,
      envName: requiredSecret,
    };
  }

  return undefined;
}

function mergeDefaultAndDynamicProviders(providers: WebResearchProviderConfig[]): WebResearchProviderConfig[] {
  const defaultIds = new Set(WEB_RESEARCH_UI_DEFAULT_PROVIDERS.map((provider) => provider.providerId));
  const providersById = new Map(providers.map((provider) => [provider.providerId, provider]));
  const merged = WEB_RESEARCH_UI_DEFAULT_PROVIDERS.map((provider) => {
    const existing = providersById.get(provider.providerId);
    return existing ? { ...provider, status: existing.status } : cloneWebResearchProvider(provider);
  });
  for (const provider of providers) {
    if (defaultIds.has(provider.providerId)) continue;
    merged.push(cloneWebResearchProvider(provider));
  }
  return merged;
}

function scraplingSetupAction(context: WebResearchProviderSetupActionContext): WebResearchProviderSetupAction | undefined {
  const capability = context.scraplingDefaultCapability;
  if (!capability) {
    return {
      kind: "open-mcp-runtime",
      label: "Check setup",
      title: "Open MCP Runtime & Web Research settings to inspect the default Scrapling capability.",
      disabled: false,
    };
  }
  if (capability.status === "installed") return undefined;
  if (context.scraplingBusy || capability.status === "installing") {
    return {
      kind: "install-scrapling",
      label: "Setting up",
      title: "Scrapling setup is already running.",
      disabled: true,
    };
  }
  if (capability.nextAction === "install-runtime" || capability.status === "blocked_runtime") {
    return {
      kind: "open-mcp-runtime",
      label: "Install runtime",
      title: capability.message,
      disabled: false,
    };
  }
  if (capability.nextAction === "approve-default-capability" || capability.nextAction === "install-default-capability") {
    return {
      kind: "install-scrapling",
      label: "Set up Scrapling",
      title: context.scraplingRuntimeReady
        ? "Install Ambient's default isolated Scrapling web research capability."
        : capability.message,
      disabled: context.scraplingRuntimeReady !== true,
    };
  }
  return {
    kind: "open-mcp-runtime",
    label: capability.status === "failed" || capability.nextAction === "inspect-failure" ? "Inspect issue" : "Review setup",
    title: capability.message,
    disabled: false,
  };
}

function scraplingHealthBadge(
  capability?: WebResearchProviderHealthContext["scraplingDefaultCapability"],
): WebResearchProviderHealthBadge {
  if (!capability) {
    return {
      label: "Checking",
      tone: "info",
      detail: "Open or refresh MCP Runtime & Web Research status to check the default Scrapling workload.",
    };
  }
  if (capability.status === "installed") {
    return {
      label: "Ready",
      tone: "success",
      detail: capability.installedEndpoint
        ? `Scrapling is installed and reachable at ${capability.installedEndpoint}.`
        : capability.message,
    };
  }
  if (capability.status === "installing") {
    return {
      label: "Setting up",
      tone: "info",
      detail: capability.message,
    };
  }
  if (capability.status === "failed") {
    return {
      label: "Error",
      tone: "error",
      detail: capability.message,
    };
  }
  if (capability.nextAction === "review-descriptor" || capability.status === "blocked_descriptor" || capability.status === "needs_review") {
    return {
      label: "Review needed",
      tone: "warning",
      detail: capability.message,
    };
  }
  if (
    capability.nextAction === "install-runtime" ||
    capability.nextAction === "approve-default-capability" ||
    capability.nextAction === "install-default-capability" ||
    capability.status === "not_configured" ||
    capability.status === "blocked_runtime" ||
    capability.status === "blocked_approval"
  ) {
    return {
      label: "Setup needed",
      tone: "warning",
      detail: capability.message,
    };
  }
  return {
    label: "Needs attention",
    tone: "warning",
    detail: capability.message,
  };
}

function webResearchRoleOrderWithDefaults(
  stack: WebResearchProviderStackSettings,
  role: WebResearchProviderRole,
  providerIds: Set<string>,
  providers: WebResearchProviderConfig[],
): string[] {
  const requested = (stack.preferences[role] ?? []).filter((providerId) => providerIds.has(providerId));
  const defaultProviderIds = new Set(WEB_RESEARCH_UI_DEFAULT_PREFERENCES[role]);
  const providerMap = new Map(providers.map((provider) => [provider.providerId, provider]));
  const requestedPreferredDynamic = role === "search"
    ? requested.filter((providerId) => {
      const provider = providerMap.get(providerId);
      return provider && !defaultProviderIds.has(providerId) && isPreferredDynamicSearchProvider(provider);
    })
    : [];
  const requestedRest = requested.filter((providerId) => !requestedPreferredDynamic.includes(providerId));
  const dynamicProviders = providers
    .filter((provider) => provider.roles.includes(role) && !requested.includes(provider.providerId) && !defaultProviderIds.has(provider.providerId));
  const preferredDynamic = role === "search"
    ? dynamicProviders.filter(isPreferredDynamicSearchProvider).map((provider) => provider.providerId)
    : [];
  const dynamic = dynamicProviders
    .filter((provider) => !preferredDynamic.includes(provider.providerId))
    .map((provider) => provider.providerId);
  const defaults = WEB_RESEARCH_UI_DEFAULT_PREFERENCES[role].filter((providerId) => providerIds.has(providerId) && !requested.includes(providerId));
  return [...requestedPreferredDynamic, ...preferredDynamic, ...requestedRest, ...dynamic, ...defaults]
    .filter((providerId, index, list) => list.indexOf(providerId) === index);
}

function isPreferredDynamicSearchProvider(provider: WebResearchProviderConfig): boolean {
  const haystack = [
    provider.providerId,
    provider.label,
    provider.privacyLabel,
    provider.ambientCli?.packageId,
    provider.ambientCli?.packageName,
    provider.ambientCli?.commandName,
    provider.ambientCli?.capabilityId,
    provider.mcp?.serverId,
    provider.mcp?.workloadName,
    provider.mcp?.toolName,
  ].filter(Boolean).join(" ").toLowerCase();
  return /\bbrave\b/.test(haystack) || haystack.includes("brave-search");
}

function cloneWebResearchProvider(provider: WebResearchProviderConfig): WebResearchProviderConfig {
  return {
    ...provider,
    roles: [...provider.roles],
    ...(provider.optionalSecretRefs ? { optionalSecretRefs: [...provider.optionalSecretRefs] } : {}),
    ...(provider.ambientCli ? { ambientCli: { ...provider.ambientCli } } : {}),
    ...(provider.mcp ? { mcp: { ...provider.mcp } } : {}),
  };
}
