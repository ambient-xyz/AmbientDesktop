import { describe, expect, it } from "vitest";

import { resolveAmbientFeatureFlags } from "../../../shared/featureFlags";
import type { WebResearchProviderConfig, WebResearchProviderRole } from "../../../shared/webResearchTypes";
import type { SubagentToolScopeSnapshotSummary } from "../../../shared/subagentTypes";
import type { ChildLaunchPolicySnapshot } from "../../../shared/symphonyFineGrainedContracts";
import {
  buildSymphonyWebCapabilityRoutePlan as buildSymphonyWebCapabilityRoutePlanForStack,
  childToolScopeAllowsInteractiveBrowserFallback,
  planSymphonyWebResearchProviderOrder as planSymphonyWebResearchProviderOrderForStack,
  providerSupportedCapabilityKinds,
  type SymphonyWebCapabilityRoutePlanInput,
  type SymphonyWebResearchProviderPlanInput,
  type SymphonyWebResearchProviderRequestPlan,
  type SymphonyWebResearchProviderStack,
} from "./symphonyWebCapabilityRouter";

const WEB_RESEARCH_PROVIDER_IDS = {
  exa: "exa-mcp-default",
  scrapling: "scrapling-mcp-default",
  browser: "ambient-browser",
} as const;

interface SearchFixture {
  webResearch: SymphonyWebResearchProviderStack;
  fallbackPolicy: { allowBrowserFallback: boolean };
}

type RoutePlanFixtureInput = Omit<SymphonyWebCapabilityRoutePlanInput, "webResearch"> & {
  settings?: SearchFixture;
};

type ProviderPlanFixtureInput = Omit<SymphonyWebResearchProviderPlanInput, "webResearch" | "legacyPlan"> & {
  settings?: SearchFixture;
};

function buildSymphonyWebCapabilityRoutePlan(input: RoutePlanFixtureInput) {
  const { settings = searchSettings(), ...rest } = input;
  return buildSymphonyWebCapabilityRoutePlanForStack({
    ...rest,
    webResearch: settings.webResearch,
  });
}

function planSymphonyWebResearchProviderOrder(input: ProviderPlanFixtureInput) {
  const { settings = searchSettings(), ...rest } = input;
  return planSymphonyWebResearchProviderOrderForStack({
    ...rest,
    webResearch: settings.webResearch,
    legacyPlan: legacyPlanForFixture(settings, input.role, input.providerOrder),
  });
}

describe("symphonyWebCapabilityRouter", () => {
  it("sym-web-capability-routing: prefers Brave search, fetches static before dynamic, and blocks child browser fallback", () => {
    const settings = searchSettings({
      providers: [braveSearchProvider()],
      preferences: {
        search: ["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser],
        fetch: [WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser],
        interactive_browser: [WEB_RESEARCH_PROVIDER_IDS.browser],
      },
    });

    const routePlan = buildSymphonyWebCapabilityRoutePlan({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      interactiveBrowserApproved: false,
    });

    expect(routePlan.webProviderOrder).toEqual({
      search: ["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa],
      staticFetchExtract: [WEB_RESEARCH_PROVIDER_IDS.exa],
      dynamicHeadlessBrowser: [WEB_RESEARCH_PROVIDER_IDS.scrapling],
      interactiveBrowser: {
        providers: [],
        fallback: "deny",
      },
    });
    expect(routePlan.profiles.find((profile) => profile.providerId === WEB_RESEARCH_PROVIDER_IDS.browser)).toMatchObject({
      supportedKinds: ["interactive_browser"],
      userPreferenceRank: { interactive_browser: 1 },
    });

    const searchPlan = planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      interactiveBrowserApproved: false,
    });
    expect(searchPlan.providerOrder).toEqual(["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa]);
    expect(searchPlan.skippedProviders).toEqual([
      {
        providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
        reason: "Interactive browser fallback requires child-scoped browser approval.",
      },
    ]);

    const fetchPlan = planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "fetch",
      interactiveBrowserApproved: false,
    });
    expect(fetchPlan.providerOrder).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.scrapling]);
    expect(fetchPlan.skippedProviders).toEqual([
      {
        providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
        reason: "Interactive browser fallback requires child-scoped browser approval.",
      },
    ]);
  });

  it("preserves explicit one-call providerOrder after Symphony eligibility filtering", () => {
    const settings = searchSettings({
      providers: [braveSearchProvider(), kagiSearchProvider()],
      preferences: {
        search: ["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa],
        fetch: [WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa],
      },
    });

    expect(planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      providerOrder: [WEB_RESEARCH_PROVIDER_IDS.exa, "ambient-brave-search"],
      interactiveBrowserApproved: false,
    }).providerOrder).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa, "ambient-brave-search"]);

    expect(planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      providerOrder: ["ambient-kagi-search", WEB_RESEARCH_PROVIDER_IDS.exa],
      interactiveBrowserApproved: false,
    }).providerOrder).toEqual(["ambient-kagi-search", WEB_RESEARCH_PROVIDER_IDS.exa]);

    expect(planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "fetch",
      providerOrder: [WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa],
      interactiveBrowserApproved: false,
    }).providerOrder).toEqual([WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa]);
  });

  it("intersects routing with the persisted child launch web provider policy", () => {
    const settings = searchSettings({
      providers: [braveSearchProvider()],
      preferences: {
        search: ["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa],
        fetch: [WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa],
      },
    });
    const childLaunchPolicySnapshot = childLaunchPolicy({
      search: [WEB_RESEARCH_PROVIDER_IDS.exa],
      staticFetchExtract: [WEB_RESEARCH_PROVIDER_IDS.exa],
      dynamicHeadlessBrowser: [],
      interactiveBrowser: {
        providers: [],
        fallback: "deny",
      },
    });

    const routePlan = buildSymphonyWebCapabilityRoutePlan({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      childLaunchPolicySnapshot,
    });
    expect(routePlan.webProviderOrder.search).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa]);
    expect(routePlan.webProviderOrder.staticFetchExtract).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa]);
    expect(routePlan.webProviderOrder.dynamicHeadlessBrowser).toEqual([]);

    expect(planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      providerOrder: ["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa],
      childLaunchPolicySnapshot,
    }).providerOrder).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa]);

    expect(planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "fetch",
      providerOrder: [WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa],
      childLaunchPolicySnapshot,
    }).providerOrder).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa]);
  });

  it("preserves persisted launch provider order over current settings and one-call overrides", () => {
    const settings = searchSettings({
      providers: [braveSearchProvider()],
      preferences: {
        search: [WEB_RESEARCH_PROVIDER_IDS.exa, "ambient-brave-search"],
      },
    });
    const childLaunchPolicySnapshot = childLaunchPolicy({
      search: ["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa],
      staticFetchExtract: [],
      dynamicHeadlessBrowser: [],
      interactiveBrowser: {
        providers: [],
        fallback: "deny",
      },
    });

    expect(buildSymphonyWebCapabilityRoutePlan({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      childLaunchPolicySnapshot,
    }).webProviderOrder.search).toEqual(["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa]);

    expect(planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      providerOrder: [WEB_RESEARCH_PROVIDER_IDS.exa, "ambient-brave-search"],
      childLaunchPolicySnapshot,
    }).providerOrder).toEqual(["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa]);
  });

  it("keeps persisted launch providers when current settings preferences remove them", () => {
    const settings = searchSettings({
      providers: [braveSearchProvider()],
      preferences: {
        search: [WEB_RESEARCH_PROVIDER_IDS.exa],
      },
    });
    const childLaunchPolicySnapshot = childLaunchPolicy({
      search: ["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa],
      staticFetchExtract: [],
      dynamicHeadlessBrowser: [],
      interactiveBrowser: {
        providers: [],
        fallback: "deny",
      },
    });

    expect(buildSymphonyWebCapabilityRoutePlan({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      childLaunchPolicySnapshot,
    }).webProviderOrder.search).toEqual(["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa]);

    expect(planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      childLaunchPolicySnapshot,
    }).providerOrder).toEqual(["ambient-brave-search", WEB_RESEARCH_PROVIDER_IDS.exa]);
  });

  it("does not re-add policy browser fallback when current settings explicitly skip it", () => {
    const settings = searchSettings({
      preferences: {
        search: [WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser],
      },
      fallbackPolicy: { allowBrowserFallback: false },
    });
    const childLaunchPolicySnapshot = childLaunchPolicy({
      search: [WEB_RESEARCH_PROVIDER_IDS.exa],
      staticFetchExtract: [],
      dynamicHeadlessBrowser: [],
      interactiveBrowser: {
        providers: [WEB_RESEARCH_PROVIDER_IDS.browser],
        fallback: "approval_required",
      },
    });

    const plan = planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      childLaunchPolicySnapshot,
      interactiveBrowserApproved: true,
    });

    expect(plan.providerOrder).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa]);
    expect(plan.skippedProviders).toContainEqual(expect.objectContaining({
      providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
      reason: "Ambient Browser fallback is disabled in web research settings.",
    }));
  });

  it("keeps generic static fetch providers out of dynamic headless routing without explicit probe metadata", () => {
    const settings = searchSettings({
      providers: [firecrawlFetchProvider()],
      preferences: {
        fetch: ["firecrawl-static", WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa],
      },
    });

    const routePlan = buildSymphonyWebCapabilityRoutePlan({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      interactiveBrowserApproved: false,
    });

    expect(providerSupportedCapabilityKinds(firecrawlFetchProvider())).toEqual(["static_fetch_extract"]);
    expect(routePlan.webProviderOrder.staticFetchExtract).toEqual(["firecrawl-static", WEB_RESEARCH_PROVIDER_IDS.exa]);
    expect(routePlan.webProviderOrder.dynamicHeadlessBrowser).toEqual([WEB_RESEARCH_PROVIDER_IDS.scrapling]);
    expect(routePlan.webProviderOrder.dynamicHeadlessBrowser).not.toContain("firecrawl-static");
  });

  it("uses explicit dynamic-headless probe metadata and still orders static extraction first for fetch", () => {
    const settings = searchSettings({
      providers: [firecrawlFetchProvider(), browserlessHeadlessProvider()],
      preferences: {
        fetch: ["browserless-render", "firecrawl-static", WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa],
      },
    });

    const fetchPlan = planSymphonyWebResearchProviderOrder({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "fetch",
      interactiveBrowserApproved: false,
    });

    expect(fetchPlan.providerOrder).toEqual([
      "firecrawl-static",
      WEB_RESEARCH_PROVIDER_IDS.exa,
      "browserless-render",
      WEB_RESEARCH_PROVIDER_IDS.scrapling,
    ]);
  });

  it("requires non-failed probe evidence for dynamic headless providers", () => {
    const failedDynamic = browserlessHeadlessProvider({
      providerId: "browserless-failed",
      capabilityProbeStatus: "failed",
      capabilityFailureNotes: ["JS rendering probe timed out."],
    });
    const untestedDynamic = browserlessHeadlessProvider({
      providerId: "browserless-untested",
      capabilityProbeStatus: undefined,
    });
    const settings = searchSettings({
      providers: [failedDynamic, untestedDynamic],
      preferences: {
        fetch: ["browserless-failed", "browserless-untested", WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa],
      },
    });

    const routePlan = buildSymphonyWebCapabilityRoutePlan({
      settings,
      featureFlagSnapshot: enabledFeatureFlags(),
      interactiveBrowserApproved: false,
    });

    expect(routePlan.profiles.find((profile) => profile.providerId === "browserless-failed")).toMatchObject({
      supportedKinds: ["dynamic_headless_browser"],
      probeStatus: "failed",
      failureNotes: ["JS rendering probe timed out."],
    });
    expect(routePlan.profiles.find((profile) => profile.providerId === "browserless-untested")).toMatchObject({
      supportedKinds: ["dynamic_headless_browser"],
      probeStatus: "untested",
    });
    expect(routePlan.webProviderOrder.dynamicHeadlessBrowser).toEqual([WEB_RESEARCH_PROVIDER_IDS.scrapling]);
  });

  it("allows interactive browser routing only after child-scoped interactive authority is visible", () => {
    const deniedSnapshot = scopeSnapshot(["connector.read", "browser.read"]);
    const approvedSnapshot = scopeSnapshot(["connector.read", "browser.interactive"]);

    expect(childToolScopeAllowsInteractiveBrowserFallback(deniedSnapshot)).toBe(false);
    expect(childToolScopeAllowsInteractiveBrowserFallback(approvedSnapshot)).toBe(true);

    const routePlan = buildSymphonyWebCapabilityRoutePlan({
      settings: searchSettings(),
      featureFlagSnapshot: enabledFeatureFlags(),
      childToolScopeSnapshot: approvedSnapshot,
    });

    expect(routePlan.webProviderOrder.interactiveBrowser).toEqual({
      providers: [WEB_RESEARCH_PROVIDER_IDS.browser],
      fallback: "approval_required",
    });
    expect(planSymphonyWebResearchProviderOrder({
      settings: searchSettings(),
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      childToolScopeSnapshot: approvedSnapshot,
    }).providerOrder).toEqual([
      WEB_RESEARCH_PROVIDER_IDS.exa,
    ]);
    expect(planSymphonyWebResearchProviderOrder({
      settings: searchSettings(),
      featureFlagSnapshot: enabledFeatureFlags(),
      role: "search",
      childToolScopeSnapshot: approvedSnapshot,
      interactiveBrowserApproved: true,
    }).providerOrder).toEqual([
      WEB_RESEARCH_PROVIDER_IDS.exa,
      WEB_RESEARCH_PROVIDER_IDS.browser,
    ]);
  });

  it("keeps Symphony routing behind ambient.subagents", () => {
    expect(() => buildSymphonyWebCapabilityRoutePlan({
      settings: searchSettings(),
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        settings: { subagents: false },
        generatedAt: "2026-06-17T00:00:00.000Z",
      }),
    })).toThrow("ambient.subagents is off; Symphony fine-grained contracts are unavailable.");
  });
});

function enabledFeatureFlags() {
  return resolveAmbientFeatureFlags({
    settings: { subagents: true },
    generatedAt: "2026-06-17T00:00:00.000Z",
  });
}

function searchSettings(input: {
  providers?: WebResearchProviderConfig[];
  preferences?: Partial<Record<WebResearchProviderRole, string[]>>;
  fallbackPolicy?: { allowBrowserFallback: boolean };
} = {}): SearchFixture {
  const fallbackPolicy = input.fallbackPolicy ?? { allowBrowserFallback: true };
  return {
    webResearch: {
      providers: mergeProviders([...defaultProviders(), ...(input.providers ?? [])]),
      preferences: {
        search: [WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser],
        fetch: [WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser],
        interactive_browser: [WEB_RESEARCH_PROVIDER_IDS.browser],
        ...input.preferences,
      },
    },
    fallbackPolicy,
  };
}

function legacyPlanForFixture(
  fixture: SearchFixture,
  role: Extract<WebResearchProviderRole, "search" | "fetch">,
  providerOrder: unknown,
): SymphonyWebResearchProviderRequestPlan {
  const providerById = new Map(fixture.webResearch.providers.map((provider) => [provider.providerId, provider]));
  const requestedOrder = Array.isArray(providerOrder) && providerOrder.some((entry) => typeof entry === "string" && entry.trim())
    ? providerOrder.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : fixture.webResearch.preferences[role] ?? [];
  const skippedProviders: SymphonyWebResearchProviderRequestPlan["skippedProviders"] = [];
  const order: string[] = [];
  for (const providerId of dedupe(requestedOrder)) {
    const provider = providerById.get(providerId);
    if (!provider) {
      skippedProviders.push({ providerId, reason: "Provider is not registered in Ambient web research settings." });
      continue;
    }
    if (provider.status !== "enabled") {
      skippedProviders.push({ providerId, reason: "Provider is disabled in Ambient settings." });
      continue;
    }
    if (!provider.roles.includes(role)) {
      skippedProviders.push({ providerId, reason: `Provider does not support ${role}.` });
      continue;
    }
    if (providerId === WEB_RESEARCH_PROVIDER_IDS.browser && !fixture.fallbackPolicy.allowBrowserFallback) {
      skippedProviders.push({ providerId, reason: "Ambient Browser fallback is disabled in web research settings." });
      continue;
    }
    order.push(providerId);
  }
  return {
    providers: fixture.webResearch.providers,
    providerOrder: order,
    skippedProviders,
  };
}

function defaultProviders(): WebResearchProviderConfig[] {
  return [
    {
      providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
      label: "Exa Search",
      kind: "remote-mcp",
      roles: ["search", "fetch"],
      status: "enabled",
      capabilityKinds: ["search", "static_fetch_extract"],
      capabilityProbeStatus: "passed",
      capabilityProbeEvidenceRefs: ["test:exa-search", "test:exa-fetch"],
    },
    {
      providerId: WEB_RESEARCH_PROVIDER_IDS.scrapling,
      label: "Scrapling",
      kind: "toolhive-mcp",
      roles: ["fetch"],
      status: "enabled",
      capabilityKinds: ["dynamic_headless_browser"],
      capabilityProbeStatus: "passed",
      capabilityProbeEvidenceRefs: ["test:scrapling-headless-fetch"],
    },
    {
      providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
      label: "Ambient Browser",
      kind: "built-in-browser",
      roles: ["search", "fetch", "interactive_browser"],
      status: "enabled",
      capabilityKinds: ["interactive_browser"],
      capabilityProbeStatus: "passed",
      capabilityProbeEvidenceRefs: ["test:ambient-browser-interactive"],
    },
  ];
}

function mergeProviders(providers: WebResearchProviderConfig[]): WebResearchProviderConfig[] {
  const merged = new Map<string, WebResearchProviderConfig>();
  for (const provider of providers) merged.set(provider.providerId, provider);
  return [...merged.values()];
}

function dedupe(values: readonly string[]): string[] {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

function braveSearchProvider(): WebResearchProviderConfig {
  return {
    providerId: "ambient-brave-search",
    label: "Brave Search",
    kind: "ambient-cli",
    roles: ["search"],
    status: "enabled",
    capabilityKinds: ["search"],
    capabilityProbeStatus: "passed",
    capabilityProbeEvidenceRefs: ["test:brave-health"],
    ambientCli: {
      packageName: "ambient-brave-search",
      commandName: "search",
    },
  };
}

function kagiSearchProvider(): WebResearchProviderConfig {
  return {
    ...braveSearchProvider(),
    providerId: "ambient-kagi-search",
    label: "Kagi Search",
    ambientCli: {
      packageName: "ambient-kagi-search",
      commandName: "search",
    },
  };
}

function firecrawlFetchProvider(): WebResearchProviderConfig {
  return {
    providerId: "firecrawl-static",
    label: "Firecrawl Static Fetch",
    kind: "remote-mcp",
    roles: ["fetch"],
    status: "enabled",
    mcp: {
      serverId: "firecrawl",
      workloadName: "firecrawl",
      toolName: "fetch",
      argumentName: "url",
    },
  };
}

function browserlessHeadlessProvider(
  overrides: Partial<WebResearchProviderConfig> = {},
): WebResearchProviderConfig {
  return {
    providerId: "browserless-render",
    label: "Browserless Render",
    kind: "remote-mcp",
    roles: ["fetch"],
    status: "enabled",
    capabilityKinds: ["dynamic_headless_browser"],
    capabilityProbeStatus: "passed",
    capabilityProbeEvidenceRefs: ["test:browserless-js-render"],
    mcp: {
      serverId: "browserless",
      workloadName: "browserless",
      toolName: "render",
      argumentName: "url",
    },
    ...overrides,
  };
}

function scopeSnapshot(piVisibleCategories: SubagentToolScopeSnapshotSummary["scope"]["piVisibleCategories"]): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run",
    sequence: 1,
    createdAt: "2026-06-17T00:00:00.000Z",
    resolverInputs: {},
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: [...piVisibleCategories],
      piVisibleCategories: [...piVisibleCategories],
      deniedCategories: [],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: "interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    },
  };
}

function childLaunchPolicy(
  webProviderOrder: ChildLaunchPolicySnapshot["webProviderOrder"],
): Pick<ChildLaunchPolicySnapshot, "webProviderOrder"> {
  return { webProviderOrder };
}
