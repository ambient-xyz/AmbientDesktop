import { describe, expect, it } from "vitest";
import type { AmbientCliPackageCatalog } from "./webResearchAmbientCliFacade";
import {
  buildWebResearchProviderDiscovery,
  describeWebResearchProvider,
  webResearchProviderDescribeText,
  webResearchProviderDiscoveryText,
} from "./webResearchProviderDiscovery";

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
        envRequirements: [{ name: "BRAVE_API_KEY", required: true, description: "Brave Search API key." }],
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

describe("webResearchProviderDiscovery", () => {
  it("surfaces Brave as a known addable provider even when it is not enabled", () => {
    const result = buildWebResearchProviderDiscovery({ query: "Brave Search", role: "search" });

    expect(result.configuredProviders).toHaveLength(0);
    expect(result.knownAddableProviders).toEqual([
      expect.objectContaining({
        catalogId: "search.brave",
        providerName: "Brave Search",
        recommendationTier: "recommended",
        requiredSecrets: ["BRAVE_API_KEY"],
        networkHosts: ["api.search.brave.com"],
      }),
    ]);
    const text = webResearchProviderDiscoveryText(result);
    expect(text).toContain("state=known-addable");
    expect(text).toContain("ambient_provider_catalog");
    expect(text).toContain("ambient_capability_builder_plan");
    expect(text).toContain("Do not search ToolHive or MCP registries");
  });

  it("describes the Brave provider catalog card with the correct setup lane", () => {
    const result = describeWebResearchProvider({ provider: "Brave Search" });
    const text = webResearchProviderDescribeText(result, "Brave Search");

    expect(result.selectedProvider).toMatchObject({
      source: "known-addable",
      catalogId: "search.brave",
    });
    expect(text).toContain("State: known-addable");
    expect(text).toContain("Required secrets: BRAVE_API_KEY");
    expect(text).toContain("Network hosts: api.search.brave.com");
    expect(text).toContain("ambient_provider_catalog");
    expect(text).toContain("ambient_capability_builder_plan");
    expect(text).toContain("Do not route this through ToolHive/MCP search");
  });

  it("distinguishes installed/configured Brave from the known addable provider card", () => {
    const result = buildWebResearchProviderDiscovery({
      query: "Brave",
      role: "search",
      ambientCliCatalog: braveCatalog(),
    });

    expect(result.configuredProviders).toEqual([
      expect.objectContaining({
        providerId: "ambient-brave-search",
        label: "Brave Search",
        source: "configured",
        configuredStatus: "enabled",
      }),
    ]);
    expect(result.knownAddableProviders).toEqual([
      expect.objectContaining({
        catalogId: "search.brave",
        source: "known-addable",
      }),
    ]);
    const described = describeWebResearchProvider({
      provider: "ambient-brave-search",
      ambientCliCatalog: braveCatalog(),
    });
    expect(webResearchProviderDescribeText(described, "ambient-brave-search")).toContain("already registered in Ambient's web research stack");
  });
});
