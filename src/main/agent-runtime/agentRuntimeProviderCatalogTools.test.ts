import { describe, expect, it } from "vitest";

import { ambientCapabilityBuilderPlanInput } from "./agentRuntimeCapabilityBuilderFacade";
import { providerCatalogBootstrapReminder } from "./agentRuntimeProviderFacade";
import { createProviderCatalogToolExtension } from "./agentRuntimeProviderCatalogTools";

describe("AgentRuntime provider catalog tools", () => {
  it("normalizes known Brave Search Builder plan inputs from older Pi argument shapes", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Can we add brave search as a provider to Ambient?",
      installerShape: "search-provider",
      outputFileArtifactTypes: "[]",
    });

    expect(input).toMatchObject({
      capabilityName: "ambient-brave-search",
      installerShape: "search-provider",
      provider: "Brave Search",
      locality: "network",
      responseFormats: ["JSON"],
      envNames: ["BRAVE_API_KEY"],
      networkHosts: ["api.search.brave.com"],
    });
    expect(input.outputFileArtifacts).toBeUndefined();
  });

  it("registers a read-only provider catalog tool that returns catalog guidance", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const handlers: Record<string, (event: any) => Promise<any> | any> = {};
    const fakePi = {
      registerTool: (tool: any) => registeredTools.push(tool),
      on: (event: string, handler: (event: any) => Promise<any> | any) => {
        handlers[event] = handler;
      },
    } as any;

    createProviderCatalogToolExtension()(fakePi);

    const catalogTool = registeredTools.find((tool) => tool.name === "ambient_provider_catalog");
    expect(catalogTool).toBeDefined();
    expect(handlers.before_agent_start).toBeDefined();
    expect(handlers.context).toBeDefined();

    const startContext = await handlers.before_agent_start({ systemPrompt: "Base system prompt" });
    expect(startContext.systemPrompt).toContain("Base system prompt");
    expect(startContext.systemPrompt).toContain("Ambient provider-selection reminder");
    expect(startContext.message).toMatchObject({
      customType: "ambient-provider-selection-context",
      content: providerCatalogBootstrapReminder,
      display: false,
    });

    const filtered = await handlers.context({
      messages: [
        { customType: "ambient-provider-selection-context", content: "stale reminder" },
        { customType: "other", content: "keep" },
      ],
    });
    expect(filtered.messages).toEqual([{ customType: "other", content: "keep" }]);

    const result = await catalogTool!.execute("catalog-call", {
      capabilityArea: "deep-research",
      includeExperimental: true,
      includeNeedsResearch: true,
    });

    expect(result.content[0].text).toContain("LiteResearcher-4B");
    expect(result.content[0].text).toContain("localArtifacts=conditional-local");
    expect(result.details).toMatchObject({
      runtime: "ambient-provider-catalog",
      toolName: "ambient_provider_catalog",
      status: "complete",
    });
    expect(result.details.providers.some((provider: { id: string }) => provider.id === "deep.step-deepresearch")).toBe(true);
  });
});
