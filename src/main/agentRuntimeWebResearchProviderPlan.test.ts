import { describe, expect, it, vi } from "vitest";

import type {
  SearchRoutingSettings,
  WebResearchProviderConfig,
  WorkspaceState,
} from "../shared/types";
import type { AmbientCliPackageCatalog } from "./ambientCliPackages";
import type { LocalDeepResearchProviderSnapshot } from "./localDeepResearchSetup";
import type { McpToolDescriptor } from "./mcpToolBridge";
import {
  localDeepResearchProviderOrderForRole,
  searchSettingsWithLocalDeepResearchProviderSnapshot,
  webResearchProviderPlanForInput,
  type WebResearchProviderPlanOptions,
} from "./agentRuntimeWebResearchProviderPlan";
import { WEB_RESEARCH_PROVIDER_IDS } from "./webResearchProviderStack";

describe("agentRuntimeWebResearchProviderPlan", () => {
  it("hydrates dynamic catalogs and honors one-turn provider order", async () => {
    const signal = new AbortController().signal;
    const discoverAmbientCliPackages = vi.fn(async () => emptyCatalog());
    const discoverMcpProviderTools = vi.fn(async () => [mcpSearchTool()]);

    const result = await webResearchProviderPlanForInput({
      workspace: workspace(),
      input: { providerOrder: ["mcp:test-search/web_search", WEB_RESEARCH_PROVIDER_IDS.browser] },
      role: "search",
      signal,
    }, options({
      discoverAmbientCliPackages,
      discoverMcpProviderTools,
    }));

    expect(discoverAmbientCliPackages).toHaveBeenCalledWith("/tmp/workspace", { includeHealth: true });
    expect(discoverMcpProviderTools).toHaveBeenCalledWith(signal);
    expect(result.providerOrder).toEqual(["mcp:test-search/web_search", WEB_RESEARCH_PROVIDER_IDS.browser]);
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "mcp:test-search/web_search",
        kind: "remote-mcp",
        roles: ["search"],
        mcp: {
          serverId: "test-search",
          workloadName: "search-workload",
          toolName: "web_search",
          argumentName: "query",
        },
      }),
    ]));
  });

  it("falls back to an empty Ambient CLI catalog when discovery fails", async () => {
    const discoverAmbientCliPackages = vi.fn(async () => {
      throw new Error("catalog unavailable");
    });

    const result = await webResearchProviderPlanForInput({
      workspace: workspace(),
      input: {},
      role: "search",
    }, options({
      discoverAmbientCliPackages,
    }));

    expect(result.providerOrder).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa, WEB_RESEARCH_PROVIDER_IDS.browser]);
    expect(result.skippedProviders).toEqual([]);
  });

  it("can force browser fallback out of child web-research provider plans", async () => {
    const result = await webResearchProviderPlanForInput({
      workspace: workspace(),
      input: {},
      role: "search",
      allowBrowserFallback: false,
    }, options());

    expect(result.providerOrder).toEqual([WEB_RESEARCH_PROVIDER_IDS.exa]);
    expect(result.skippedProviders).toEqual([
      {
        providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
        reason: "Ambient Browser fallback is disabled in web research settings.",
      },
    ]);
  });

  it("uses Local Deep Research snapshot order and provider metadata over input overrides", async () => {
    const snapshot = localDeepResearchSnapshot();

    const result = await webResearchProviderPlanForInput({
      workspace: workspace(),
      input: { providerOrder: [WEB_RESEARCH_PROVIDER_IDS.browser] },
      role: "search",
      providerSnapshot: snapshot,
    }, options({
      readSettings: () => ({
        webResearch: {
          schemaVersion: "ambient-web-research-provider-stack-v1",
          providers: [disabledProvider("local-research"), browserProvider()],
          preferences: {
            search: [WEB_RESEARCH_PROVIDER_IDS.browser],
            fetch: [WEB_RESEARCH_PROVIDER_IDS.browser],
          },
          fallbackPolicy: { allowBrowserFallback: true },
        },
      }),
    }));

    expect(result.providerOrder).toEqual(["local-research"]);
    expect(result.skippedProviders).toEqual([
      {
        providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
        reason: "Ambient Browser fallback is disabled in web research settings.",
      },
    ]);
    expect(result.providers.find((provider) => provider.providerId === "local-research")).toMatchObject({
      providerId: "local-research",
      label: "Local Research",
      status: "enabled",
    });
    expect(localDeepResearchProviderOrderForRole(snapshot, "search")).toEqual(["local-research", WEB_RESEARCH_PROVIDER_IDS.browser]);
    expect(localDeepResearchProviderOrderForRole(snapshot, "interactive_browser")).toBeUndefined();
  });

  it("merges Local Deep Research snapshot settings without mutating the input", () => {
    const snapshot = localDeepResearchSnapshot();
    const settings: SearchRoutingSettings = {
      webResearch: {
        schemaVersion: "ambient-web-research-provider-stack-v1",
        providers: [disabledProvider("local-research"), browserProvider()],
        preferences: {
          search: [WEB_RESEARCH_PROVIDER_IDS.browser],
          fetch: [WEB_RESEARCH_PROVIDER_IDS.browser],
        },
        fallbackPolicy: { allowBrowserFallback: true },
      },
    };

    const merged = searchSettingsWithLocalDeepResearchProviderSnapshot(settings, snapshot);

    expect(merged.webResearch?.providers[0]).toMatchObject({
      providerId: "local-research",
      status: "enabled",
    });
    expect(merged.webResearch?.preferences.search).toEqual(["local-research", WEB_RESEARCH_PROVIDER_IDS.browser]);
    expect(merged.webResearch?.preferences.fetch).toEqual([WEB_RESEARCH_PROVIDER_IDS.browser]);
    expect(merged.webResearch?.fallbackPolicy).toEqual({ allowBrowserFallback: false });
    expect(merged.webResearch?.updatedAt).toBe("2026-06-11T00:00:00.000Z");
    expect(settings.webResearch?.providers[0]).toMatchObject({
      providerId: "local-research",
      status: "disabled",
    });
  });
});

function options(overrides: Partial<WebResearchProviderPlanOptions> = {}): WebResearchProviderPlanOptions {
  return {
    readSettings: vi.fn(() => ({})),
    discoverAmbientCliPackages: vi.fn(async () => emptyCatalog()),
    discoverMcpProviderTools: vi.fn(async () => []),
    ...overrides,
  };
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "Workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/sessions",
  };
}

function emptyCatalog(): AmbientCliPackageCatalog {
  return { packages: [], errors: [] };
}

function mcpSearchTool(): McpToolDescriptor {
  return {
    serverId: "test-search",
    workloadName: "search-workload",
    toolRef: "test-search/web_search",
    endpoint: "https://mcp.example.test/sse",
    reviewStatus: "trusted",
    name: "web_search",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
      },
    },
  };
}

function browserProvider(): WebResearchProviderConfig {
  return {
    providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
    label: "Ambient Browser",
    kind: "built-in-browser",
    roles: ["search", "fetch", "interactive_browser"],
    status: "enabled",
  };
}

function disabledProvider(providerId: string): WebResearchProviderConfig {
  return {
    providerId,
    label: "Disabled Local Research",
    kind: "ambient-cli",
    roles: ["search"],
    status: "disabled",
  };
}

function localDeepResearchSnapshot(): LocalDeepResearchProviderSnapshot {
  return {
    schemaVersion: "ambient-local-deep-research-provider-snapshot-v1",
    capturedAt: "2026-06-11T00:00:00.000Z",
    providerOrder: ["local-research", WEB_RESEARCH_PROVIDER_IDS.browser],
    skippedProviders: [],
    providers: [
      {
        providerId: "local-research",
        label: "Local Research",
        kind: "ambient-cli",
        roles: ["search"],
        status: "enabled",
      },
    ],
    searchOrder: ["local-research", WEB_RESEARCH_PROVIDER_IDS.browser],
    fetchOrder: [WEB_RESEARCH_PROVIDER_IDS.browser],
    skippedSearchProviders: [],
    skippedFetchProviders: [],
    fallbackPolicy: { allowBrowserFallback: false },
  };
}
