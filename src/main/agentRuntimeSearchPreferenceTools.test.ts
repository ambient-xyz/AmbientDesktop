import { describe, expect, it } from "vitest";

import type { SearchRoutingSettings, ThreadSummary, WorkspaceState } from "../shared/types";
import type { AmbientCliPackageCatalog } from "./ambientCliPackages";
import {
  registerSearchPreferenceTools,
  type SearchPreferenceToolPermissionRequest,
  type SearchPreferenceToolRegistrationOptions,
} from "./agentRuntimeSearchPreferenceTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerSearchPreferenceTools", () => {
  it("registers the status tool and reports installed Ambient CLI search providers", async () => {
    const registeredTools: RegisteredTool[] = [];
    const catalogCalls: Array<{ workspacePath: string; options: unknown }> = [];

    registerSearchPreferenceTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      discoverAmbientCliPackages: async (workspacePath, catalogOptions) => {
        catalogCalls.push({ workspacePath, options: catalogOptions });
        return braveCatalog();
      },
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_search_preference_status",
      "web_research_preferences_update",
    ]);
    const status = registeredTools[0]!;
    expect(status.executionMode).toBe("sequential");

    const result = await status.execute("search-pref-status", {});

    expect(catalogCalls).toEqual([{ workspacePath: "/tmp/workspace", options: { includeHealth: true } }]);
    expect(result.content[0].text).toContain("Ambient search routing status");
    expect(result.content[0].text).toContain("Brave Search");
    expect(result.details).toMatchObject({
      runtime: "ambient-search-routing",
      toolName: "ambient_search_preference_status",
      status: "complete",
      providerCount: 1,
      availableProviderCount: 1,
      selectedProvider: expect.objectContaining({
        packageName: "ambient-brave-search",
        label: "Brave Search",
      }),
    });
  });

  it("returns no-op without approval when the requested provider preference is already active", async () => {
    const registeredTools: RegisteredTool[] = [];
    const permissionRequests: SearchPreferenceToolPermissionRequest[] = [];
    const updates: SearchRoutingSettings[] = [];

    registerSearchPreferenceTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      readSettings: currentPreferredSettings,
      updateSettings: async (input) => {
        updates.push(input);
        return input;
      },
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
    }));

    const update = registeredTools.find((tool) => tool.name === "web_research_preferences_update");
    if (!update) throw new Error("Missing web_research_preferences_update.");
    const result = await update.execute("search-pref-noop", {
      action: "prefer_provider",
      providerAlias: "Brave Search",
    });

    expect(permissionRequests).toEqual([]);
    expect(updates).toEqual([]);
    expect(result.content[0].text).toContain("Ambient web research preferences unchanged");
    expect(result.details).toMatchObject({
      runtime: "ambient-search-routing",
      toolName: "web_research_preferences_update",
      status: "no-op",
      role: "search",
      providerOrder: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
      settings: expect.objectContaining({
        webResearch: expect.objectContaining({
          preferences: expect.objectContaining({
            search: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
          }),
        }),
      }),
      selectedProvider: expect.objectContaining({
        providerId: "ambient-brave-search",
      }),
    });
  });

  it("persists an approved provider preference through the canonical webResearch settings model", async () => {
    const registeredTools: RegisteredTool[] = [];
    const permissionRequests: SearchPreferenceToolPermissionRequest[] = [];
    const updates: SearchRoutingSettings[] = [];
    const toolUpdates: any[] = [];

    registerSearchPreferenceTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      readSettings: currentDefaultSettings,
      updateSettings: async (input) => {
        updates.push(input);
        return input;
      },
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
    }));

    const update = registeredTools.find((tool) => tool.name === "web_research_preferences_update");
    if (!update) throw new Error("Missing web_research_preferences_update.");
    const result = await update.execute("search-pref-require", {
      action: "require_provider",
      providerAlias: "Brave Search",
      reason: "Use the configured Brave search provider.",
    }, undefined, (toolUpdate: any) => toolUpdates.push(toolUpdate));

    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/tmp/workspace" },
      toolName: "web_research_preferences_update",
      title: "Require Brave Search for search?",
      message: "Ambient wants to update the global Search & Web preference for future public research routing.",
      grantTargetLabel: "Update Search & Web routing preference",
      allowedReason: "Ambient web research preference change approved by Ambient permission grant policy.",
      deniedReason: "Ambient web research preference prompt denied or timed out.",
    });
    expect(permissionRequests[0]!.detail).toContain("Scope: Global Search & Web settings");
    expect(permissionRequests[0]!.detail).toContain("Provider: Brave Search (ambient-brave-search)");
    expect(permissionRequests[0]!.grantTargetIdentity).toMatch(/^web_research_preferences_update\0\{/);
    expect(toolUpdates).toEqual([
      expect.objectContaining({
        content: [{ type: "text", text: "Updating Ambient web research provider preference." }],
        details: expect.objectContaining({
          runtime: "ambient-search-routing",
          toolName: "web_research_preferences_update",
          status: "running",
          role: "search",
          providerOrder: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
        }),
      }),
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      webResearch: expect.objectContaining({
        preferences: expect.objectContaining({
          search: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
        }),
        fallbackPolicy: { allowBrowserFallback: false },
        updatedAt: "2026-06-07T00:00:00.000Z",
      }),
    });
    expect(result.details).toMatchObject({
      runtime: "ambient-search-routing",
      toolName: "web_research_preferences_update",
      status: "complete",
      settings: updates[0],
      selectedProvider: expect.objectContaining({
        label: "Brave Search",
        providerId: "ambient-brave-search",
      }),
      providerOrder: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
    });
    expect(result.details.settings.webSearch).toBeUndefined();
  });

  it("blocks preference updates in Planner Mode before requesting approval", async () => {
    const registeredTools: RegisteredTool[] = [];
    const permissionRequests: SearchPreferenceToolPermissionRequest[] = [];

    registerSearchPreferenceTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getThread: () => thread({ collaborationMode: "planner" }),
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
    }));

    const update = registeredTools.find((tool) => tool.name === "web_research_preferences_update");
    if (!update) throw new Error("Missing web_research_preferences_update.");

    await expect(update.execute("planner-search-pref", {
      action: "prefer_provider",
      providerAlias: "Brave Search",
    })).rejects.toThrow("Search preference changes are blocked in Planner Mode.");
    expect(permissionRequests).toEqual([]);
  });
});

function options(
  overrides: Partial<SearchPreferenceToolRegistrationOptions> = {},
): SearchPreferenceToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: workspace(),
    getThread: () => thread(),
    readSettings: () => ({}),
    updateSettings: async (input) => input,
    discoverAmbientCliPackages: async () => braveCatalog(),
    resolveFirstPartyPluginPermission: async () => true,
    now: () => new Date("2026-06-07T00:00:00.000Z"),
    ...overrides,
  };
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}

function thread(overrides: Record<string, unknown> = {}): ThreadSummary {
  return {
    id: "thread-1",
    collaborationMode: "default",
    permissionMode: "default",
    ...overrides,
  } as unknown as ThreadSummary;
}

function currentDefaultSettings(): SearchRoutingSettings {
  return {
    webResearch: {
      schemaVersion: "ambient-web-research-provider-stack-v1",
      providers: [
        { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "enabled" },
        { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch"], status: "enabled" },
      ],
      preferences: {
        search: ["exa-mcp-default", "ambient-browser"],
        fetch: ["exa-mcp-default", "ambient-browser"],
      },
      fallbackPolicy: { allowBrowserFallback: true },
      updatedAt: "2026-06-06T00:00:00.000Z",
    },
  } as SearchRoutingSettings;
}

function currentPreferredSettings(): SearchRoutingSettings {
  return {
    webResearch: {
      schemaVersion: "ambient-web-research-provider-stack-v1",
      providers: [
        { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "enabled" },
        { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch"], status: "enabled" },
        { providerId: "ambient-brave-search", label: "Brave Search", kind: "ambient-cli", roles: ["search"], status: "enabled" },
      ],
      preferences: {
        search: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
        fetch: ["exa-mcp-default", "ambient-browser"],
      },
      fallbackPolicy: { allowBrowserFallback: true },
      updatedAt: "2026-06-06T00:00:00.000Z",
    },
  } as SearchRoutingSettings;
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
          installerShape: "search-provider",
          provider: "Brave Search",
          outputArtifactTypes: [],
          refs: {},
        },
      },
    ],
    errors: [],
  };
}
