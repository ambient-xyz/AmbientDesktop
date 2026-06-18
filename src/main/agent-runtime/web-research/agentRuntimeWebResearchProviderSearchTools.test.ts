import { describe, expect, it } from "vitest";

import type { SearchRoutingSettings } from "../../../shared/webResearchTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { AmbientCliPackageCatalog } from "../agentRuntimeAmbientCliFacade";
import type { McpToolDescriptor } from "../agentRuntimeMcpFacade";
import { registerWebResearchProviderSearchTools } from "./agentRuntimeWebResearchProviderSearchTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerWebResearchProviderSearchTools", () => {
  it("registers and executes the web research provider search tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const catalogCalls: Array<{ workspacePath: string; options: unknown }> = [];
    const mcpSignals: unknown[] = [];
    const signal = new AbortController().signal;

    registerWebResearchProviderSearchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: workspace(),
      readSettings: () => ({}),
      discoverAmbientCliPackages: async (workspacePath, options) => {
        catalogCalls.push({ workspacePath, options });
        return braveCatalog();
      },
      discoverMcpProviderTools: async (receivedSignal) => {
        mcpSignals.push(receivedSignal);
        return [mcpSearchTool()];
      },
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["web_research_provider_search"]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("provider-search", {
      query: "brave",
      role: "search",
      limit: 3,
    }, signal);

    expect(catalogCalls).toEqual([{ workspacePath: "/tmp/workspace", options: { includeHealth: true } }]);
    expect(mcpSignals).toEqual([signal]);
    expect(result.content[0].text).toContain("Ambient web research provider discovery");
    expect(result.content[0].text).toContain("Query: brave");
    expect(result.content[0].text).toContain("Role: search");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_provider_search",
      status: "complete",
      schemaVersion: "ambient-web-research-provider-discovery-v1",
      query: "brave",
      role: "search",
      configuredProviders: expect.arrayContaining([
        expect.objectContaining({
          providerId: "ambient-brave-search",
          source: "configured",
          kind: "ambient-cli",
          configuredStatus: "enabled",
        }),
      ]),
    });
  });

  it("falls back to an empty Ambient CLI catalog when discovery fails", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerWebResearchProviderSearchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: workspace(),
      readSettings: () => ({}) satisfies SearchRoutingSettings,
      discoverAmbientCliPackages: async () => {
        throw new Error("catalog unavailable");
      },
      discoverMcpProviderTools: async () => [mcpSearchTool()],
    });

    const result = await registeredTools[0]!.execute("provider-search", {
      query: "tavily",
      role: "search",
    });

    expect(result.content[0].text).toContain("Ambient web research provider discovery");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_provider_search",
      status: "complete",
      configuredProviders: expect.arrayContaining([
        expect.objectContaining({
          providerId: "mcp:io.example/tavily.search",
          source: "configured",
          kind: "remote-mcp",
        }),
      ]),
    });
    expect(result.details.configuredProviders).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "ambient-brave-search" }),
    ]));
  });

  it("uses current role validation semantics", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerWebResearchProviderSearchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: workspace(),
      readSettings: () => undefined,
      discoverAmbientCliPackages: async () => braveCatalog(),
      discoverMcpProviderTools: async () => [],
    });

    await expect(registeredTools[0]!.execute("provider-search", {
      role: "research",
    })).rejects.toThrow("role must be search, fetch, or interactive_browser.");
  });
});

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}

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

function mcpSearchTool(): McpToolDescriptor {
  return {
    serverId: "io.example/tavily",
    workloadName: "ambient-tavily",
    toolRef: "io.example/tavily.search",
    workloadStatus: "running",
    endpoint: "https://mcp.example.test",
    reviewStatus: "trusted",
    name: "search",
    description: "Web search provider.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
      },
    },
  };
}
