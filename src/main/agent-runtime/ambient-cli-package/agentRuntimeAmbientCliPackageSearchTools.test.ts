import { describe, expect, it, vi } from "vitest";

import { ambientCliSearchText } from "./agentRuntimeAmbientCliPackageSearchModel";
import { registerAmbientCliPackageSearchTool } from "./agentRuntimeAmbientCliPackageSearchTools";

describe("agentRuntimeAmbientCliPackageSearchTools", () => {
  it("searches Ambient CLI capabilities and returns catalog metadata", async () => {
    const workspace = { path: "/workspace" };
    const resultFixture = searchResponseFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const searchAmbientCliCapabilities = vi.fn(async () => resultFixture);

    registerAmbientCliPackageSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      searchAmbientCliCapabilities,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli_search"]);

    const result = await registeredTools[0].execute("search", {
      query: "voice",
      limit: 5,
      includeUnavailable: true,
      kind: "command",
      packageName: "ambient-demo",
      command: "speak",
    });

    expect(searchAmbientCliCapabilities).toHaveBeenCalledWith(workspace.path, {
      query: "voice",
      limit: 5,
      includeUnavailable: true,
      includeHealth: false,
      kind: "command",
      packageName: "ambient-demo",
      command: "speak",
    });
    expect(result).toEqual({
      content: [{ type: "text", text: ambientCliSearchText(resultFixture) }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_search",
        query: "voice",
        resultCount: 1,
        truncated: false,
        packageIds: ["pkg-123"],
        catalogVersion: "catalog-v1",
      },
    });
  });

  it("omits blank and false optional fields like the inline runtime parser", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const searchAmbientCliCapabilities = vi.fn(async () => emptySearchResponseFixture());

    registerAmbientCliPackageSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      searchAmbientCliCapabilities,
    });

    await registeredTools[0].execute("search", {
      query: "",
      limit: Number.NaN,
      includeUnavailable: false,
      packageName: "",
      command: "",
    });

    expect(searchAmbientCliCapabilities).toHaveBeenCalledWith("/workspace", { includeHealth: false });
  });

  it("rejects unsupported search kinds before searching", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const searchAmbientCliCapabilities = vi.fn();

    registerAmbientCliPackageSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      searchAmbientCliCapabilities,
    });

    await expect(registeredTools[0].execute("search", { kind: "provider" })).rejects.toThrow("Unsupported Ambient CLI search kind: provider");
    expect(searchAmbientCliCapabilities).not.toHaveBeenCalled();
  });
});

function searchResponseFixture(): any {
  return {
    catalogVersion: "catalog-v1",
    truncated: false,
    results: [
      {
        packageId: "pkg-123",
        registryPluginId: "registry-plugin",
        sourceKind: "ambient-cli",
        packageName: "ambient-demo",
        version: "0.0.0",
        description: "Demo package.",
        installed: true,
        availability: "available",
        availabilityReason: "ready",
        commands: [
          {
            capabilityId: "pkg-123:command:speak",
            sourceKind: "ambient-cli",
            name: "speak",
            description: "Speak text.",
            cwd: "package",
            risk: [],
          },
        ],
        skills: [
          {
            capabilityId: "pkg-123:skill:demo",
            sourceKind: "ambient-cli",
            name: "demo-skill",
            description: "Use demo.",
            path: "/workspace/.ambient/cli-packages/ambient-demo/skills/demo/SKILL.md",
          },
        ],
        missingEnv: [],
        whyMatched: ["query matched command"],
        score: 10,
      },
    ],
  };
}

function emptySearchResponseFixture(): any {
  return {
    catalogVersion: "catalog-v1",
    truncated: false,
    results: [],
  };
}
