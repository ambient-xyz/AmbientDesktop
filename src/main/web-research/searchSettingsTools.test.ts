import { describe, expect, it } from "vitest";
import type { AmbientCliPackageCatalog } from "./webResearchAmbientCliFacade";
import {
  appendSearchRoutingGuidance,
  buildSearchPreferenceStatus,
  planWebResearchPreferenceUpdate,
  planSearchPreferenceUpdate,
  searchPreferenceStatusText,
  searchPreferenceUpdateText,
  webResearchProviderConfigsFromSearchCatalog,
  webResearchSettingsWithDynamicProviderCatalogs,
  webResearchSettingsWithAmbientCliProviderCatalog,
} from "./searchSettingsTools";

function braveCatalog(): AmbientCliPackageCatalog {
  return {
    packages: [
      {
        id: "ambient-cli:brave-search",
        name: "ambient-brave-search",
        version: "0.1.0",
        description: "Search the web with Brave Search.",
        rootPath: "/tmp/ambient-brave-search",
        source: "imported",
        installed: true,
        skills: [{ name: "brave-search", description: "Use Brave Search for web search.", path: "SKILL.md" }],
        commands: [
          {
            name: "search",
            description: "Search the web with Brave Search.",
            command: "node",
            args: ["./scripts/run.mjs"],
            cwd: "package",
            healthCheck: ["node", "./scripts/run.mjs", "--health"],
          },
        ],
        envRequirements: [],
        errors: [],
        healthChecks: [
          {
            commandName: "search",
            command: ["node", "./scripts/run.mjs", "--health"],
            cwd: "/tmp/ambient-brave-search",
            passed: true,
          },
        ],
        generated: {
          schemaVersion: "ambient-capability-builder-v1",
          status: "registered",
          goal: "Create a Brave Search provider.",
          installerShape: "search-provider",
          kind: "cloud-api",
          provider: "Brave Search",
          outputArtifactTypes: [],
          locality: "network",
          refs: {},
        },
      },
    ],
    errors: [],
  };
}

function arxivCatalog(): AmbientCliPackageCatalog {
  return {
    packages: [
      {
        id: "ambient-cli:pi-arxiv",
        name: "pi-arxiv",
        version: "0.1.0",
        description: "Search arXiv papers.",
        rootPath: "/tmp/pi-arxiv",
        source: "imported",
        installed: true,
        skills: [{ name: "arxiv", description: "Search arXiv.", path: "SKILL.md" }],
        commands: [
          {
            name: "arxiv_search",
            description: "Search arXiv papers.",
            command: "node",
            args: ["./scripts/run.mjs"],
            cwd: "package",
          },
        ],
        envRequirements: [],
        errors: [],
      },
    ],
    errors: [],
  };
}

describe("searchSettingsTools", () => {
  it("summarizes installed search providers and tells Pi how to set a preference", () => {
    const status = buildSearchPreferenceStatus({}, braveCatalog());

    expect(status.availableProviderCount).toBe(1);
    expect(status.providers[0]).toMatchObject({
      packageName: "ambient-brave-search",
      commandName: "search",
      available: true,
    });
    expect(status.settings.webResearch?.preferences.search).toContain("ambient-brave-search");
    expect(searchPreferenceStatusText(status)).toContain("Use web_research_preferences_update");
    expect(searchPreferenceStatusText(status)).toContain("action=prefer_provider");
    expect(searchPreferenceStatusText(status)).toContain("action=reset_search_defaults");
    expect(searchPreferenceStatusText(status)).toContain("per-call overrides do not mutate global Search & Web settings");
  });

  it("projects installed Ambient CLI search providers into the web research provider registry", () => {
    const settings = webResearchSettingsWithAmbientCliProviderCatalog({}, braveCatalog());

    expect(webResearchProviderConfigsFromSearchCatalog(braveCatalog())).toEqual([
      expect.objectContaining({
        providerId: "ambient-brave-search",
        label: "Brave Search",
        kind: "ambient-cli",
        roles: ["search"],
        status: "enabled",
        ambientCli: {
          packageId: "ambient-cli:brave-search",
          packageName: "ambient-brave-search",
          commandName: "search",
          capabilityId: "ambient-cli:ambient-brave-search:tool:search",
        },
      }),
    ]);
    expect(settings.webResearch?.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "ambient-brave-search", kind: "ambient-cli" }),
    ]));
    expect(settings.webResearch?.preferences.search).toEqual([
      "ambient-brave-search",
      "exa-mcp-default",
      "ambient-browser",
    ]);
  });

  it("does not promote arbitrary search-like Ambient CLI packages into public web research providers", () => {
    const settings = webResearchSettingsWithAmbientCliProviderCatalog({}, arxivCatalog());

    expect(webResearchProviderConfigsFromSearchCatalog(arxivCatalog())).toEqual([]);
    expect(settings.webResearch?.providers.map((provider) => provider.providerId)).not.toContain("pi-arxiv");
    expect(settings.webResearch?.preferences.search).toEqual([
      "exa-mcp-default",
      "ambient-browser",
    ]);
  });

  it("projects installed MCP search and fetch providers into the shared web research stack", () => {
    const settings = webResearchSettingsWithDynamicProviderCatalogs({}, {
      mcpTools: [
        {
          serverId: "io.example/brave-mcp",
          workloadName: "ambient-brave-mcp",
          toolRef: "io.example/brave-mcp/web_search",
          endpoint: "http://127.0.0.1:3030/mcp",
          reviewStatus: "trusted",
          workloadStatus: "running",
          name: "web_search",
          description: "Search the public web with Brave Search.",
          inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        },
        {
          serverId: "io.example/page-reader",
          workloadName: "ambient-page-reader",
          toolRef: "io.example/page-reader/fetch_page",
          endpoint: "http://127.0.0.1:3031/mcp",
          reviewStatus: "trusted",
          workloadStatus: "running",
          name: "fetch_page",
          description: "Fetch a public web page as markdown content.",
          inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        },
      ],
    });

    expect(settings.webResearch?.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "mcp:io.example/brave-mcp/web_search",
        kind: "toolhive-mcp",
        roles: ["search"],
        mcp: expect.objectContaining({ toolName: "web_search", argumentName: "query" }),
      }),
      expect.objectContaining({
        providerId: "mcp:io.example/page-reader/fetch_page",
        roles: ["fetch"],
        mcp: expect.objectContaining({ toolName: "fetch_page", argumentName: "url" }),
      }),
    ]));
    expect(settings.webResearch?.preferences.search).toEqual([
      "mcp:io.example/brave-mcp/web_search",
      "exa-mcp-default",
      "ambient-browser",
    ]);
    expect(settings.webResearch?.preferences.fetch).toEqual([
      "scrapling-mcp-default",
      "exa-mcp-default",
      "mcp:io.example/page-reader/fetch_page",
      "ambient-browser",
    ]);
  });

  it("plans a chat-controlled Brave Search preference", () => {
    const plan = planSearchPreferenceUpdate(
      { activity: "web_search", action: "prefer_provider", providerAlias: "Brave Search" },
      {},
      braveCatalog(),
      new Date("2026-05-10T00:00:00.000Z"),
    );

    expect(plan.hasChanges).toBe(true);
    expect(plan.nextProvider).toMatchObject({ packageName: "ambient-brave-search" });
    expect(plan.nextSettings.webSearch).toBeUndefined();
    expect(plan.nextSettings.webResearch?.preferences.search).toEqual([
      "ambient-brave-search",
      "exa-mcp-default",
      "ambient-browser",
    ]);
    expect(plan.nextSettings.webResearch?.fallbackPolicy).toEqual({ allowBrowserFallback: true });
    expect(searchPreferenceUpdateText(plan, plan.nextSettings)).toContain("web_research_search now tries Brave Search");
  });

  it("plans exact web research search order using provider labels", () => {
    const plan = planWebResearchPreferenceUpdate(
      { role: "search", providerOrder: ["Ambient Browser", "Exa Search"] },
      {},
      { packages: [], errors: [] },
      new Date("2026-06-14T00:00:00.000Z"),
    );

    expect(plan.hasChanges).toBe(true);
    expect(plan.nextSettings.webResearch?.preferences.search).toEqual([
      "ambient-browser",
      "exa-mcp-default",
    ]);
    expect(plan.nextOrder).toEqual(["ambient-browser", "exa-mcp-default"]);
  });

  it("rejects absent provider names instead of persisting known-addable catalog names", () => {
    expect(() =>
      planWebResearchPreferenceUpdate(
        { role: "search", providerOrder: ["Brave Search", "Exa Search"] },
        {},
        { packages: [], errors: [] },
      )
    ).toThrow("did not match a configured provider");
  });

  it("plans exact rollback to the original web research search order", () => {
    const current = {
      webResearch: {
        schemaVersion: "ambient-web-research-provider-stack-v1",
        providers: [
          { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "enabled" },
          { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch", "interactive_browser"], status: "enabled" },
        ],
        preferences: {
          search: ["ambient-browser", "exa-mcp-default"],
          fetch: ["exa-mcp-default", "ambient-browser"],
          interactive_browser: ["ambient-browser"],
        },
        fallbackPolicy: { allowBrowserFallback: true },
      },
    };
    const plan = planWebResearchPreferenceUpdate(
      { role: "search", providerOrder: ["exa-mcp-default", "ambient-browser"] },
      current as any,
      { packages: [], errors: [] },
    );

    expect(plan.nextSettings.webResearch?.preferences.search).toEqual([
      "exa-mcp-default",
      "ambient-browser",
    ]);
  });

  it("defaults require mode to blocking fallback", () => {
    const plan = planSearchPreferenceUpdate(
      { action: "require_provider", providerAlias: "ambient-brave-search" },
      { webSearch: { activity: "web_search", preferredProvider: "other-search", mode: "prefer", fallback: "allow" } },
      braveCatalog(),
      new Date("2026-05-10T00:00:00.000Z"),
    );

    expect(plan.nextSettings.webResearch?.fallbackPolicy).toEqual({ allowBrowserFallback: false });
  });

  it("injects routing guidance before Pi chooses search tools", () => {
    const prompt = appendSearchRoutingGuidance("Find recent Pynchon mentions.", {
      webResearch: {
        schemaVersion: "ambient-web-research-provider-stack-v1",
        providers: [
          {
            providerId: "ambient-brave-search",
            label: "Brave Search",
            kind: "ambient-cli",
            roles: ["search"],
            status: "enabled",
          },
        ],
        preferences: {
          search: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
        },
        fallbackPolicy: { allowBrowserFallback: true },
      },
    });

    expect(prompt).toContain('Ambient will try "ambient-brave-search" first');
    expect(prompt).toContain("ambient_tool_call");
    expect(prompt).toContain("Explicit user instructions in the current turn override this preference");
  });

  it("plans clearing the preference", () => {
    const plan = planSearchPreferenceUpdate(
      { action: "reset_search_defaults" },
      { webSearch: { activity: "web_search", preferredProvider: "ambient-brave-search", mode: "prefer", fallback: "allow" } },
      braveCatalog(),
    );

    expect(plan.hasChanges).toBe(true);
    expect(plan.nextSettings.webResearch?.preferences.search).toEqual(["ambient-brave-search", "exa-mcp-default", "ambient-browser"]);
    expect(plan.nextSettings.webResearch?.fallbackPolicy).toEqual({ allowBrowserFallback: true });
  });

  it("keeps legacy clear=true compatibility while rejecting empty preference updates", () => {
    const legacyClear = planSearchPreferenceUpdate(
      { clear: true },
      { webSearch: { activity: "web_search", preferredProvider: "ambient-brave-search", mode: "prefer", fallback: "allow" } },
      braveCatalog(),
    );

    expect(legacyClear.nextSettings.webResearch?.preferences.search).toEqual(["ambient-brave-search", "exa-mcp-default", "ambient-browser"]);
    expect(() => planSearchPreferenceUpdate({}, {}, braveCatalog())).toThrow("action=reset_search_defaults");
  });

  it("rejects contradictory reset and provider preference actions", () => {
    expect(() => planSearchPreferenceUpdate({ action: "prefer_provider", clear: true, providerAlias: "Brave Search" }, {}, braveCatalog())).toThrow(
      "clear=true can only be combined",
    );
  });
});
