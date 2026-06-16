import { describe, expect, it } from "vitest";
import {
  moveWebResearchProvider,
  resetWebResearchRole,
  setWebResearchBrowserFallback,
  setWebResearchProviderEnabled,
  webResearchProviderHealthBadge,
  webResearchProviderSetupAction,
  webResearchProvidersForRole,
  webResearchStackWithDefaults,
} from "./searchWebSettingsModel";

describe("searchWebSettingsModel", () => {
  it("preserves dynamic providers and renders them in role order", () => {
    const stack = webResearchStackWithDefaults({
      schemaVersion: "ambient-web-research-provider-stack-v1",
      providers: [
        {
          providerId: "ambient-brave-search",
          label: "Brave Search",
          kind: "ambient-cli",
          roles: ["search"],
          status: "enabled",
          privacyLabel: "Queries may be sent to Brave.",
          ambientCli: {
            packageId: "ambient-cli:brave-search",
            packageName: "ambient-brave-search",
            commandName: "search",
          },
        },
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
        search: ["exa-mcp-default", "ambient-brave-search", "ambient-browser"],
        fetch: ["context7-docs-fetch", "scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
      },
      fallbackPolicy: { allowBrowserFallback: true },
    });

    expect(stack.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "ambient-brave-search",
        kind: "ambient-cli",
        ambientCli: expect.objectContaining({ packageName: "ambient-brave-search", commandName: "search" }),
      }),
      expect.objectContaining({
        providerId: "context7-docs-fetch",
        kind: "toolhive-mcp",
        mcp: expect.objectContaining({ toolName: "get-library-docs", argumentName: "url" }),
      }),
    ]));
    expect(webResearchProvidersForRole(stack, "search").map((provider) => provider.providerId)).toEqual([
      "ambient-brave-search",
      "exa-mcp-default",
      "ambient-browser",
    ]);
    expect(webResearchProvidersForRole(stack, "fetch").map((provider) => provider.providerId)).toEqual([
      "context7-docs-fetch",
      "scrapling-mcp-default",
      "exa-mcp-default",
      "ambient-browser",
    ]);
  });

  it("updates role ordering and browser fallback without mutating unrelated preferences", () => {
    const stack = webResearchStackWithDefaults();
    const moved = moveWebResearchProvider(stack, "fetch", "scrapling-mcp-default", 1);
    const fallback = setWebResearchBrowserFallback(moved, false);

    expect(moved.preferences.fetch).toEqual(["exa-mcp-default", "scrapling-mcp-default", "ambient-browser"]);
    expect(fallback.fallbackPolicy).toEqual({ allowBrowserFallback: false });
    expect(fallback.preferences.fetch).toEqual(moved.preferences.fetch);
    expect(resetWebResearchRole(fallback, "fetch").preferences.fetch).toEqual([
      "scrapling-mcp-default",
      "exa-mcp-default",
      "ambient-browser",
    ]);
  });

  it("toggles provider enabled state without removing it from configured order", () => {
    const stack = webResearchStackWithDefaults();
    const disabled = setWebResearchProviderEnabled(stack, "exa-mcp-default", false);
    const enabled = setWebResearchProviderEnabled(disabled, "exa-mcp-default", true);

    expect(disabled.providers.find((provider) => provider.providerId === "exa-mcp-default")?.status).toBe("disabled");
    expect(disabled.preferences.search).toEqual(stack.preferences.search);
    expect(webResearchProvidersForRole(disabled, "search").map((provider) => provider.providerId)).toEqual([
      "exa-mcp-default",
      "ambient-browser",
    ]);
    expect(enabled.providers.find((provider) => provider.providerId === "exa-mcp-default")?.status).toBe("enabled");
  });

  it("builds provider health badges from config and Scrapling runtime state", () => {
    const stack = webResearchStackWithDefaults({
      schemaVersion: "ambient-web-research-provider-stack-v1",
      providers: [
        {
          providerId: "ambient-brave-search",
          label: "Brave Search",
          kind: "ambient-cli",
          roles: ["search"],
          status: "enabled",
          ambientCli: {
            packageId: "ambient-cli:brave-search",
            packageName: "ambient-brave-search",
            commandName: "search",
          },
        },
      ],
      preferences: {
        search: ["exa-mcp-default", "ambient-brave-search", "ambient-browser"],
      },
      fallbackPolicy: { allowBrowserFallback: true },
    });
    const exa = stack.providers.find((provider) => provider.providerId === "exa-mcp-default")!;
    const brave = stack.providers.find((provider) => provider.providerId === "ambient-brave-search")!;
    const scrapling = stack.providers.find((provider) => provider.providerId === "scrapling-mcp-default")!;
    const disabled = setWebResearchProviderEnabled(stack, "ambient-brave-search", false).providers.find(
      (provider) => provider.providerId === "ambient-brave-search",
    )!;

    expect(webResearchProviderHealthBadge(exa)).toMatchObject({ label: "No key needed", tone: "success" });
    expect(webResearchProviderHealthBadge(brave)).toMatchObject({ label: "Installed", tone: "success" });
    expect(webResearchProviderHealthBadge(disabled)).toMatchObject({ label: "Disabled", tone: "warning" });
    expect(webResearchProviderHealthBadge(scrapling, {
      scraplingDefaultCapability: {
        capabilityId: "scrapling",
        status: "installed",
        nextAction: "none",
        message: "Scrapling is installed.",
        runtimeStatus: "ready",
        installedEndpoint: "http://127.0.0.1:3333/mcp",
      },
    })).toMatchObject({ label: "Ready", tone: "success" });
    expect(webResearchProviderHealthBadge(scrapling, {
      scraplingDefaultCapability: {
        capabilityId: "scrapling",
        status: "blocked_runtime",
        nextAction: "install-runtime",
        message: "Container runtime is missing.",
        runtimeStatus: "missing",
      },
    })).toMatchObject({ label: "Setup needed", tone: "warning" });
    expect(webResearchProviderHealthBadge(scrapling, {
      scraplingDefaultCapability: {
        capabilityId: "scrapling",
        status: "failed",
        nextAction: "inspect-failure",
        message: "Install failed.",
        runtimeStatus: "ready",
      },
    })).toMatchObject({ label: "Error", tone: "error" });
  });

  it("derives provider setup actions without mutating provider preferences", () => {
    const stack = webResearchStackWithDefaults({
      schemaVersion: "ambient-web-research-provider-stack-v1",
      providers: [
        {
          providerId: "ambient-brave-search",
          label: "Brave Search",
          kind: "ambient-cli",
          roles: ["search"],
          status: "enabled",
          optionalSecretRefs: ["BRAVE_API_KEY"],
          ambientCli: {
            packageId: "ambient-cli:brave-search",
            packageName: "brave-search",
            commandName: "search",
          },
        },
      ],
      preferences: {
        search: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
      },
      fallbackPolicy: { allowBrowserFallback: true },
    });
    const brave = stack.providers.find((provider) => provider.providerId === "ambient-brave-search")!;
    const scrapling = stack.providers.find((provider) => provider.providerId === "scrapling-mcp-default")!;

    expect(webResearchProviderSetupAction(brave)).toMatchObject({
      kind: "configure-ambient-cli-secret",
      label: "Configure key",
      packageId: "ambient-cli:brave-search",
      packageName: "brave-search",
      envName: "BRAVE_API_KEY",
    });
    expect(webResearchProviderSetupAction(setWebResearchProviderEnabled(stack, "ambient-brave-search", false).providers.find(
      (provider) => provider.providerId === "ambient-brave-search",
    )!)).toBeUndefined();
    expect(webResearchProviderSetupAction(scrapling, {
      scraplingDefaultCapability: {
        capabilityId: "scrapling",
        status: "blocked_runtime",
        nextAction: "install-runtime",
        message: "Container runtime is missing.",
        runtimeStatus: "missing",
      },
    })).toMatchObject({ kind: "open-mcp-runtime", label: "Install runtime", disabled: false });
    expect(webResearchProviderSetupAction(scrapling, {
      scraplingRuntimeReady: true,
      scraplingDefaultCapability: {
        capabilityId: "scrapling",
        status: "not_configured",
        nextAction: "install-default-capability",
        message: "Scrapling can be installed.",
        runtimeStatus: "ready",
      },
    })).toMatchObject({ kind: "install-scrapling", label: "Set up Scrapling", disabled: false });
    expect(webResearchProviderSetupAction(scrapling, {
      scraplingDefaultCapability: {
        capabilityId: "scrapling",
        status: "installed",
        nextAction: "none",
        message: "Scrapling is installed.",
        runtimeStatus: "ready",
      },
    })).toBeUndefined();
  });
});
