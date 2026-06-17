import { describe, expect, it } from "vitest";
import type { AmbientCliPackageCatalog } from "../ambient-cli/ambientCliPackages";
import type { McpToolDescriptor } from "../mcp/mcpToolBridge";
import { hydrateWebResearchSettings } from "./webResearchSettingsHydration";

describe("hydrateWebResearchSettings", () => {
  it("merges installed Ambient CLI and MCP web providers without mutating persisted settings directly", async () => {
    const settings = await hydrateWebResearchSettings({
      settings: {
        webResearch: {
          schemaVersion: "ambient-web-research-provider-stack-v1",
          providers: [],
          preferences: {
            search: ["exa-mcp-default", "ambient-browser"],
            fetch: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
          },
          fallbackPolicy: { allowBrowserFallback: true },
        },
      },
      discoverAmbientCliCatalog: async () => braveCatalog(),
      discoverMcpTools: async () => [
        mcpTool({
          serverId: "io.example/tavily",
          name: "search",
          description: "Search the public web with Tavily.",
          inputSchema: schema("query"),
        }),
        mcpTool({
          serverId: "io.example/page-reader",
          name: "fetch_page",
          description: "Fetch a public web page as markdown content.",
          inputSchema: schema("url"),
        }),
      ],
    });

    expect(settings.webResearch?.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "ambient-brave-search", kind: "ambient-cli" }),
      expect.objectContaining({ providerId: "mcp:io.example/tavily/search", kind: "toolhive-mcp" }),
      expect.objectContaining({ providerId: "mcp:io.example/page-reader/fetch_page", kind: "toolhive-mcp" }),
    ]));
    expect(settings.webResearch?.preferences.search).toEqual([
      "ambient-brave-search",
      "exa-mcp-default",
      "mcp:io.example/tavily/search",
      "ambient-browser",
    ]);
    expect(settings.webResearch?.preferences.fetch).toEqual([
      "scrapling-mcp-default",
      "exa-mcp-default",
      "mcp:io.example/page-reader/fetch_page",
      "ambient-browser",
    ]);
  });

  it("falls back to the canonical stack when dynamic discovery fails", async () => {
    const settings = await hydrateWebResearchSettings({
      discoverAmbientCliCatalog: async () => {
        throw new Error("catalog unavailable");
      },
      discoverMcpTools: async () => {
        throw new Error("mcp unavailable");
      },
    });

    expect(settings.webResearch?.preferences.search).toEqual(["exa-mcp-default", "ambient-browser"]);
    expect(settings.webResearch?.preferences.fetch).toEqual(["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"]);
  });
});

function braveCatalog(): AmbientCliPackageCatalog {
  return {
    packages: [
      {
        id: "ambient-cli:brave-search",
        name: "ambient-brave-search",
        description: "Search the web with Brave Search.",
        rootPath: "/tmp/ambient-brave-search",
        source: "imported",
        installed: true,
        skills: [],
        commands: [
          {
            name: "search",
            description: "Search the web with Brave Search.",
            command: "node",
            args: ["./scripts/run.mjs"],
            cwd: "package",
          },
        ],
        envRequirements: [],
        errors: [],
        healthChecks: [],
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

function mcpTool(input: Pick<McpToolDescriptor, "serverId" | "name" | "description" | "inputSchema">): McpToolDescriptor {
  return {
    workloadName: `ambient-${input.serverId.split("/").pop() ?? "mcp"}`,
    toolRef: `${input.serverId}/${input.name}`,
    endpoint: "http://127.0.0.1:34567/mcp",
    reviewStatus: "trusted",
    workloadStatus: "running",
    ...input,
  };
}

function schema(requiredName: string): unknown {
  return {
    type: "object",
    properties: {
      [requiredName]: { type: "string" },
    },
    required: [requiredName],
    additionalProperties: false,
  };
}
