import { describe, expect, it } from "vitest";
import {
  buildWebResearchProviderStackStatus,
  defaultWebResearchProviderStackSettings,
  normalizeSearchRoutingSettingsWithWebResearch,
  normalizeWebResearchProviderStackSettings,
  planWebResearchProviderOrder,
  resetWebResearchProviderOrder,
  updateWebResearchProviderOrder,
  webResearchProviderOrder,
  webResearchProviderStackStatusText,
} from "./webResearchProviderStack";

describe("webResearchProviderStack", () => {
  it("seeds Exa search, Scrapling fetch, and browser fallback defaults", () => {
    const settings = defaultWebResearchProviderStackSettings();
    expect(settings.preferences.search).toEqual(["exa-mcp-default", "ambient-browser"]);
    expect(settings.preferences.fetch).toEqual(["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"]);
    expect(settings.fallbackPolicy).toEqual({ allowBrowserFallback: true });
    expect(settings.providers.map((provider) => provider.providerId)).toEqual([
      "exa-mcp-default",
      "scrapling-mcp-default",
      "ambient-browser",
    ]);
    expect(settings.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "exa-mcp-default",
        capabilityKinds: ["search", "static_fetch_extract"],
      }),
      expect.objectContaining({
        providerId: "scrapling-mcp-default",
        capabilityKinds: ["dynamic_headless_browser"],
      }),
      expect.objectContaining({
        providerId: "ambient-browser",
        capabilityKinds: ["interactive_browser"],
      }),
    ]));
  });

  it("updates one role order and drops the legacy search preference lane", () => {
    const updated = updateWebResearchProviderOrder({
      settings: {
        webSearch: {
          activity: "web_search",
          preferredProvider: "ambient-brave-search",
          mode: "prefer",
          fallback: "allow",
        },
      },
      role: "search",
      providerOrder: ["ambient-browser", "exa-mcp-default", "ambient-browser", "unknown"],
      updatedAt: "2026-05-24T00:00:00.000Z",
    });
    expect(updated.webSearch).toBeUndefined();
    expect(updated.webResearch?.preferences.search).toEqual(["ambient-browser", "exa-mcp-default"]);
    expect(updated.webResearch?.updatedAt).toBe("2026-05-24T00:00:00.000Z");
  });

  it("migrates legacy webSearch into canonical webResearch without writing webSearch back", () => {
    const normalized = normalizeSearchRoutingSettingsWithWebResearch({
      webSearch: {
        activity: "web_search",
        preferredProvider: "ambient-brave-search",
        mode: "require",
        fallback: "block",
        updatedAt: "2026-05-10T00:00:00.000Z",
      },
    });

    expect(normalized.webSearch).toBeUndefined();
    expect(normalized.webResearch?.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "ambient-brave-search",
        label: "Ambient Brave Search",
        kind: "ambient-cli",
        roles: ["search"],
      }),
    ]));
    expect(normalized.webResearch?.preferences.search).toEqual([
      "ambient-brave-search",
      "exa-mcp-default",
      "ambient-browser",
    ]);
    expect(normalized.webResearch?.fallbackPolicy).toEqual({ allowBrowserFallback: false });
    expect(normalized.webResearch?.updatedAt).toBe("2026-05-10T00:00:00.000Z");
  });

  it("preserves dynamic installed providers in the canonical provider stack", () => {
    const normalized = normalizeWebResearchProviderStackSettings({
      providers: [
        {
          providerId: "ambient-brave-search",
          label: "Brave Search",
          kind: "ambient-cli",
          roles: ["search"],
          status: "enabled",
          privacyLabel: "Queries may be sent to Brave.",
          capabilityKinds: ["search"],
          capabilityProbeStatus: "passed",
          capabilityProbeEvidenceRefs: ["test:brave-search-health"],
          ambientCli: {
            packageId: "ambient-cli:ambient-brave-search",
            packageName: "ambient-brave-search",
            commandName: "search",
            capabilityId: "ambient-cli:ambient-brave-search:tool:search",
          },
        },
      ],
      preferences: {
        search: ["ambient-brave-search"],
      },
      fallbackPolicy: {
        allowBrowserFallback: false,
      },
    });

    expect(normalized.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "ambient-brave-search",
        label: "Brave Search",
        kind: "ambient-cli",
        roles: ["search"],
        privacyLabel: "Queries may be sent to Brave.",
        capabilityKinds: ["search"],
        capabilityProbeStatus: "passed",
        capabilityProbeEvidenceRefs: ["test:brave-search-health"],
        ambientCli: {
          packageId: "ambient-cli:ambient-brave-search",
          packageName: "ambient-brave-search",
          commandName: "search",
          capabilityId: "ambient-cli:ambient-brave-search:tool:search",
        },
      }),
    ]));
    expect(normalized.preferences.search).toEqual(["ambient-brave-search", "exa-mcp-default", "ambient-browser"]);
    expect(normalized.fallbackPolicy).toEqual({ allowBrowserFallback: false });
  });

  it("preserves MCP-backed web research provider bindings for broker execution", () => {
    const normalized = normalizeWebResearchProviderStackSettings({
      providers: [
        {
          providerId: "context7-docs-fetch",
          label: "Context7 Docs Fetch",
          kind: "toolhive-mcp",
          roles: ["fetch"],
          status: "enabled",
          mcp: {
            serverId: "context7",
            workloadName: "ambient-context7",
            toolName: "get-library-docs",
            argumentName: "url",
          },
        },
      ],
      preferences: {
        fetch: ["context7-docs-fetch"],
      },
    });
    const provider = normalized.providers.find((candidate) => candidate.providerId === "context7-docs-fetch");

    expect(provider).toMatchObject({
      kind: "toolhive-mcp",
      roles: ["fetch"],
      mcp: {
        serverId: "context7",
        workloadName: "ambient-context7",
        toolName: "get-library-docs",
        argumentName: "url",
      },
    });
    expect(normalized.preferences.fetch).toEqual([
      "context7-docs-fetch",
      "scrapling-mcp-default",
      "exa-mcp-default",
      "ambient-browser",
    ]);
    expect(planWebResearchProviderOrder({ settings: { webResearch: normalized }, role: "fetch" }).providerOrder[0]).toBe("context7-docs-fetch");
  });

  it("warns Pi that status is active-stack-only before missing-provider conclusions", () => {
    const text = webResearchProviderStackStatusText(buildWebResearchProviderStackStatus());

    expect(text).toContain("active/configured providers");
    expect(text).toContain("do not conclude Ambient lacks it");
    expect(text).toContain("web_research_provider_search");
    expect(text).toContain("web_research_provider_describe");
  });

  it("plans broker provider order with explicit browser fallback skip reasons", () => {
    const plan = planWebResearchProviderOrder({
      role: "search",
      providerOrder: ["unknown-provider", "ambient-browser", "exa-mcp-default", "exa-mcp-default"],
      settings: {
        webResearch: normalizeWebResearchProviderStackSettings({
          fallbackPolicy: { allowBrowserFallback: false },
        }),
      },
    });

    expect(plan.providerOrder).toEqual(["exa-mcp-default"]);
    expect(plan.providers.map((provider) => provider.providerId)).toEqual([
      "exa-mcp-default",
      "scrapling-mcp-default",
      "ambient-browser",
    ]);
    expect(plan.skippedProviders).toEqual([
      { providerId: "unknown-provider", reason: "Provider is not registered in Ambient web research settings." },
      { providerId: "ambient-browser", reason: "Ambient Browser fallback is disabled in web research settings." },
    ]);
  });

  it("resolves one-call provider order overrides from configured provider labels", () => {
    const plan = planWebResearchProviderOrder({
      role: "search",
      providerOrder: ["Ambient Browser", "Exa Search"],
    });

    expect(plan.providerOrder).toEqual(["ambient-browser", "exa-mcp-default"]);
    expect(plan.skippedProviders).toEqual([]);
  });

  it("plans default broker search and fetch order before browser fallback", () => {
    expect(planWebResearchProviderOrder({ role: "search" }).providerOrder).toEqual([
      "exa-mcp-default",
      "ambient-browser",
    ]);
    expect(planWebResearchProviderOrder({ role: "fetch" }).providerOrder).toEqual([
      "scrapling-mcp-default",
      "exa-mcp-default",
      "ambient-browser",
    ]);
  });

  it("normalizes provider order and emits compact status text", () => {
    const settings = resetWebResearchProviderOrder({}, "2026-05-24T00:00:00.000Z");
    expect(webResearchProviderOrder(settings, "fetch")).toEqual(["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"]);
    const status = buildWebResearchProviderStackStatus({
      settings,
      runtime: {
        "scrapling-mcp-default": { availability: "unavailable", reason: "ToolHive is not running." },
      },
    });
    const text = webResearchProviderStackStatusText(status);
    expect(text).toContain("search:");
    expect(text).toContain("Exa Search");
    expect(text).toContain("ToolHive is not running.");
    expect(text).toContain("Browser fallback: allowed.");
  });
});
