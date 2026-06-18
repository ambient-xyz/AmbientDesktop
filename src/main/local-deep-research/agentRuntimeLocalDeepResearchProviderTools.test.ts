import { describe, expect, it, vi } from "vitest";

import type { LocalDeepResearchSettings } from "../../shared/localRuntimeTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { normalizeLocalDeepResearchRunBudgetSettings } from "../../shared/localDeepResearchBudget";
import { defaultLocalModelResourceSettings, normalizeLocalDeepResearchSettings } from "./localDeepResearchProviderStack";
import { registerLocalDeepResearchProviderTools } from "./agentRuntimeLocalDeepResearchProviderTools";

interface RegisteredTool {
  name: string;
  executionMode?: string;
  parameters?: unknown;
  execute: (...args: any[]) => Promise<any>;
}

describe("registerLocalDeepResearchProviderTools", () => {
  it("registers read-only provider tools with Local Deep Research result details", async () => {
    const settings: LocalDeepResearchSettings = {
      providerStack: {
        schemaVersion: "ambient-local-deep-research-provider-stack-v1",
        providers: [
          {
            providerId: "local.deep-research.fixture",
            label: "Fixture Research",
            kind: "test-adapter",
            roles: ["research"],
            status: "enabled",
            privacyLabel: "Fixture provider for parity tests.",
          },
        ],
        preferences: {
          research: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        },
      },
      localModelResources: defaultLocalModelResourceSettings(),
      runBudget: normalizeLocalDeepResearchRunBudgetSettings(undefined),
    };
    const registeredTools: RegisteredTool[] = [];

    registerLocalDeepResearchProviderTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      readSettings: () => settings,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_local_deep_research_provider_status",
      "ambient_local_deep_research_provider_search",
      "ambient_local_deep_research_provider_describe",
      "ambient_local_deep_research_provider_update",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
    expect(registeredTools.every((tool) => tool.parameters)).toBe(true);

    const status = await toolByName(registeredTools, "ambient_local_deep_research_provider_status").execute("status", {});
    expect(status.content[0].text).toContain("Active provider: Fixture Research (local.deep-research.fixture).");
    expect(status.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_provider_status",
      status: "complete",
      activeProvider: {
        providerId: "local.deep-research.fixture",
      },
      providerOrder: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
    });

    const search = await toolByName(registeredTools, "ambient_local_deep_research_provider_search").execute("search", {
      query: "fixture",
      limit: 5,
    });
    expect(search.content[0].text).toContain("Ambient Local Deep Research provider discovery");
    expect(search.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_provider_search",
      status: "complete",
      query: "fixture",
      configuredProviders: [
        expect.objectContaining({
          providerId: "local.deep-research.fixture",
          label: "Fixture Research",
        }),
      ],
    });

    const describe = await toolByName(registeredTools, "ambient_local_deep_research_provider_describe").execute("describe", {
      provider: "local.deep-research.fixture",
    });
    expect(describe.content[0].text).toContain("This provider is configured.");
    expect(describe.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_provider_describe",
      status: "complete",
      provider: "local.deep-research.fixture",
      selectedProvider: {
        source: "configured",
        providerId: "local.deep-research.fixture",
      },
    });
  });

  it("requires a provider when describing Local Deep Research providers", async () => {
    const registeredTools: RegisteredTool[] = [];
    registerLocalDeepResearchProviderTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    });

    await expect(
      toolByName(registeredTools, "ambient_local_deep_research_provider_describe").execute("describe", {}),
    ).rejects.toThrow("provider is required.");
  });

  it("updates provider preference after approval", async () => {
    let settings = fixtureSettings({
      research: ["local.deep-research.literesearcher", "local.deep-research.fixture"],
    });
    const workspace = { path: "/tmp/ambient-local-deep-research-provider-tools" } as WorkspaceState;
    const updateSettings = vi.fn(async (input: LocalDeepResearchSettings) => {
      settings = normalizeLocalDeepResearchSettings(input);
      return settings;
    });
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const registeredTools: RegisteredTool[] = [];
    registerLocalDeepResearchProviderTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      threadId: "thread-local-research",
      workspace,
      getThread: () => ({ id: "thread-local-research", collaborationMode: "agent" }) as any,
      readSettings: () => settings,
      updateSettings,
      resolveFirstPartyPluginPermission,
    });

    const updates: string[] = [];
    const result = await toolByName(registeredTools, "ambient_local_deep_research_provider_update").execute(
      "provider-update",
      {
        action: "prefer_provider",
        providerId: "local.deep-research.fixture",
        reason: "Use the fixture provider first.",
      },
      undefined,
      (update: any) => updates.push(update.content[0]?.text ?? ""),
    );

    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread: expect.objectContaining({ id: "thread-local-research" }),
      workspace,
      toolName: "ambient_local_deep_research_provider_update",
      title: "Make Fixture Research the active Local Deep Research provider?",
      grantTargetLabel: "Update Local Deep Research provider preference",
    }));
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      providerStack: expect.objectContaining({
        preferences: {
          research: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        },
      }),
    }));
    expect(updates).toEqual(["Updating Ambient Local Deep Research provider preference."]);
    expect(result.content[0].text).toContain("Ambient Local Deep Research provider order updated");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_provider_update",
      status: "complete",
      selectedProvider: {
        providerId: "local.deep-research.fixture",
      },
      settings: {
        providerStack: {
          preferences: {
            research: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
          },
        },
      },
    });
  });

  it("updates provider final synthesis configuration after approval", async () => {
    let settings = fixtureSettings({
      research: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
    });
    const workspace = { path: "/tmp/ambient-local-deep-research-provider-tools" } as WorkspaceState;
    const updateSettings = vi.fn(async (input: LocalDeepResearchSettings) => {
      settings = normalizeLocalDeepResearchSettings(input);
      return settings;
    });
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const registeredTools: RegisteredTool[] = [];
    registerLocalDeepResearchProviderTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      threadId: "thread-local-research",
      workspace,
      getThread: () => ({ id: "thread-local-research", collaborationMode: "agent" }) as any,
      readSettings: () => settings,
      updateSettings,
      resolveFirstPartyPluginPermission,
    });

    const updates: string[] = [];
    const result = await toolByName(registeredTools, "ambient_local_deep_research_provider_update").execute(
      "provider-update",
      {
        action: "set_final_synthesis",
        providerId: "local.deep-research.fixture",
        finalSynthesisMode: "evidence_only",
        sourceLimit: 6,
        evidencePreviewChars: 800,
        reason: "Use parent synthesis for broad research.",
      },
      undefined,
      (update: any) => updates.push(update.content[0]?.text ?? ""),
    );

    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      title: "Update Fixture Research final synthesis mode?",
      grantTargetLabel: "Update Local Deep Research final synthesis configuration",
    }));
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      providerStack: expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "local.deep-research.fixture",
            finalSynthesis: {
              schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
              mode: "evidence_only",
              sourceLimit: 6,
              evidencePreviewChars: 800,
            },
          }),
        ]),
      }),
    }));
    expect(updates).toEqual(["Updating Ambient Local Deep Research final synthesis configuration."]);
    expect(result.content[0].text).toContain("provider final synthesis updated");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_provider_update",
      status: "complete",
      selectedProvider: {
        providerId: "local.deep-research.fixture",
        finalSynthesis: {
          mode: "evidence_only",
        },
      },
    });
  });

  it("keeps provider preference changes blocked in Planner Mode", async () => {
    const updateSettings = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const registeredTools: RegisteredTool[] = [];
    registerLocalDeepResearchProviderTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      threadId: "thread-local-research",
      workspace: { path: "/tmp/ambient-local-deep-research-provider-tools" } as WorkspaceState,
      getThread: () => ({ id: "thread-local-research", collaborationMode: "planner" }) as any,
      readSettings: () => fixtureSettings(),
      updateSettings,
      resolveFirstPartyPluginPermission,
    });

    await expect(
      toolByName(registeredTools, "ambient_local_deep_research_provider_update").execute("provider-update", {
        action: "prefer_provider",
        providerId: "local.deep-research.fixture",
      }),
    ).rejects.toThrow("Local Deep Research provider changes are blocked in Planner Mode.");
    expect(updateSettings).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
  });
});

function toolByName(registeredTools: RegisteredTool[], name: string): RegisteredTool {
  const tool = registeredTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

function fixtureSettings(input: { research?: string[] } = {}): LocalDeepResearchSettings {
  return normalizeLocalDeepResearchSettings({
    providerStack: {
      providers: [
        {
          providerId: "local.deep-research.fixture",
          label: "Fixture Research",
          kind: "test-adapter",
          roles: ["research"],
          status: "enabled",
          privacyLabel: "Fixture provider for parity tests.",
        },
      ],
      preferences: {
        research: input.research ?? ["local.deep-research.fixture", "local.deep-research.literesearcher"],
      },
    },
  });
}
