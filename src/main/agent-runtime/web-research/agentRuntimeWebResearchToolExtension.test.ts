import { describe, expect, it } from "vitest";

import type {
  SearchRoutingSettings,
  WebResearchProviderConfig,
  WebResearchProviderRole,
  WorkspaceState,
} from "../../../shared/types";
import type { AmbientCliPackageCatalog } from "../../ambient-cli/ambientCliPackages";
import {
  createAgentRuntimeWebResearchToolExtension,
  type AgentRuntimeWebResearchToolExtensionOptions,
} from "./agentRuntimeWebResearchToolExtension";
import type { WebResearchProviderRequestPlan } from "../../web-research/webResearchProviderStack";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("createAgentRuntimeWebResearchToolExtension", () => {
  it("registers web research tools and routes search/fetch planner roles", async () => {
    const registeredTools: RegisteredTool[] = [];
    const catalogCalls: Array<{ workspacePath: string; options: unknown }> = [];
    const mcpSignals: unknown[] = [];
    const runtimeSignals: unknown[] = [];
    const planCalls: Array<{ input: Record<string, unknown>; role: WebResearchProviderRole; signal?: AbortSignal }> = [];
    const signal = new AbortController().signal;

    const extension = createAgentRuntimeWebResearchToolExtension(options({
      discoverAmbientCliPackages: async (workspacePath, receivedOptions) => {
        catalogCalls.push({ workspacePath, options: receivedOptions });
        return emptyCatalog();
      },
      discoverMcpProviderTools: async (receivedSignal) => {
        mcpSignals.push(receivedSignal);
        return [];
      },
      webResearchRuntimeSummary: async (receivedSignal) => {
        runtimeSignals.push(receivedSignal);
        return {};
      },
      webResearchProviderPlanForInput: async (input, role, receivedSignal) => {
        planCalls.push({ input, role, signal: receivedSignal });
        return providerPlan([], [], [{ providerId: `disabled-${role}`, reason: `${role} disabled.` }]);
      },
    }));
    extension({ registerTool: (tool: any) => { registeredTools.push(tool); } } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "web_research_status",
      "web_research_provider_search",
      "web_research_provider_describe",
      "web_research_search",
      "web_research_fetch",
    ]);

    const tools = new Map(registeredTools.map((tool) => [tool.name, tool]));
    const status = await tools.get("web_research_status")!.execute("status", {}, signal);
    const search = await tools.get("web_research_search")!.execute("search", { query: "ambient simplification" }, signal);
    const fetch = await tools.get("web_research_fetch")!.execute("fetch", { url: "https://example.test/read" }, signal);

    expect(catalogCalls).toEqual([{ workspacePath: "/tmp/workspace", options: { includeHealth: true } }]);
    expect(mcpSignals).toEqual([signal]);
    expect(runtimeSignals).toEqual([signal]);
    expect(planCalls).toEqual([
      { input: { query: "ambient simplification" }, role: "search", signal },
      { input: { url: "https://example.test/read" }, role: "fetch", signal },
    ]);
    expect(status.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_status",
      status: "complete",
    });
    expect(search.content[0].text).toContain("No configured web research search provider completed successfully.");
    expect(fetch.content[0].text).toContain("No configured web research fetch provider completed successfully.");
  });
});

function options(
  overrides: Partial<AgentRuntimeWebResearchToolExtensionOptions> = {},
): AgentRuntimeWebResearchToolExtensionOptions {
  return {
    threadId: "thread-1",
    workspace: workspace(),
    readSettings: () => ({}) satisfies SearchRoutingSettings,
    discoverAmbientCliPackages: async () => emptyCatalog(),
    discoverMcpProviderTools: async () => [],
    webResearchRuntimeSummary: async () => ({}),
    webResearchProviderPlanForInput: async () => providerPlan(),
    webResearchExaApiKey: () => undefined,
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserSearch: async () => [],
    browserContent: async () => ({
      title: "Browser page",
      url: "https://example.test/read",
      text: "Readable page text.",
      links: [],
    }),
    emitBrowserState: async () => undefined,
    recordBrowserAudit: () => undefined,
    tryRouteBrowserContentThroughScrapling: async () => ({}),
    tryCallWebResearchMcpProvider: async () => ({ fallbackReason: "not configured" }),
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    formatErrorMessage: (error) => error instanceof Error ? error.message : String(error),
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

function emptyCatalog(): AmbientCliPackageCatalog {
  return {
    packages: [],
    errors: [],
  };
}

function providerPlan(
  providers: WebResearchProviderConfig[] = [],
  providerOrder: string[] = [],
  skippedProviders: WebResearchProviderRequestPlan["skippedProviders"] = [],
): WebResearchProviderRequestPlan {
  return {
    providers,
    providerOrder,
    skippedProviders,
  };
}
