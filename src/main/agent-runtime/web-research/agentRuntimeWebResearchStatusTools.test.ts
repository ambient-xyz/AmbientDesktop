import { describe, expect, it } from "vitest";

import type { SearchRoutingSettings, WorkspaceState } from "../../../shared/types";
import type { AmbientCliPackageCatalog } from "../../ambient-cli/ambientCliPackages";
import type { McpToolDescriptor } from "../../mcp/mcpToolBridge";
import { registerWebResearchStatusTools } from "./agentRuntimeWebResearchStatusTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerWebResearchStatusTools", () => {
  it("registers and executes the web research status tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const catalogCalls: Array<{ workspacePath: string; options: unknown }> = [];
    const mcpSignals: unknown[] = [];
    const runtimeSignals: unknown[] = [];
    const signal = new AbortController().signal;

    registerWebResearchStatusTools({
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
      webResearchRuntimeSummary: async (receivedSignal) => {
        runtimeSignals.push(receivedSignal);
        return {
          "ambient-browser": {
            availability: "available",
            reason: "Ambient managed browser fallback is available.",
          },
        };
      },
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["web_research_status"]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("status", {}, signal);

    expect(catalogCalls).toEqual([{ workspacePath: "/tmp/workspace", options: { includeHealth: true } }]);
    expect(mcpSignals).toEqual([signal]);
    expect(runtimeSignals).toEqual([signal]);
    expect(result.content[0].text).toContain("Ambient web research provider stack");
    expect(result.content[0].text).toContain("ambient-brave-search");
    expect(result.content[0].text).toContain("Installed Ambient CLI search provider is available.");
    expect(result.content[0].text).toContain("Tavily Search");
    expect(result.content[0].text).toContain("Installed MCP provider is available through the web research broker.");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_status",
      status: "complete",
      settings: {
        providers: expect.arrayContaining([
          expect.objectContaining({ providerId: "ambient-brave-search", kind: "ambient-cli", status: "enabled" }),
          expect.objectContaining({ providerId: "mcp:io.example/tavily.search", kind: "remote-mcp", status: "enabled" }),
        ]),
      },
      roles: expect.arrayContaining([
        expect.objectContaining({
          role: "search",
          providers: expect.arrayContaining([
            expect.objectContaining({ providerId: "ambient-brave-search", availability: "available" }),
            expect.objectContaining({ providerId: "mcp:io.example/tavily.search", availability: "available" }),
          ]),
        }),
      ]),
    });
  });

  it("falls back to an empty Ambient CLI catalog when discovery fails", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerWebResearchStatusTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: workspace(),
      readSettings: () => ({}) satisfies SearchRoutingSettings,
      discoverAmbientCliPackages: async () => {
        throw new Error("catalog unavailable");
      },
      discoverMcpProviderTools: async () => [],
      webResearchRuntimeSummary: async () => ({}),
    });

    const result = await registeredTools[0]!.execute("status", {});

    expect(result.content[0].text).toContain("Ambient web research provider stack");
    expect(result.content[0].text).not.toContain("ambient-brave-search");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_status",
      status: "complete",
    });
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
