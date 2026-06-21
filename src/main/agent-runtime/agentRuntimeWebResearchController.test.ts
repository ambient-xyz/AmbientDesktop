import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { SearchRoutingSettings, WebResearchProviderConfig } from "../../shared/webResearchTypes";
import { AgentRuntimeWebResearchController } from "./agentRuntimeWebResearchController";
import type { AmbientCliPackageCatalog } from "./agentRuntimeAmbientCliFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { WEB_RESEARCH_PROVIDER_IDS } from "./agentRuntimeWebResearchFacade";

type RegisteredTool = {
  name: string;
  execute: (toolCallId: string, input: Record<string, unknown>, signal?: AbortSignal) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
  }>;
};

describe("AgentRuntimeWebResearchController", () => {
  it("owns web-research extension wiring for browser-backed search", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-web-research-owner-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("web research");
      const discoverAmbientCliPackages = vi.fn(async () => emptyCatalog());
      const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
      const browserSearch = vi.fn(async () => [
        {
          title: "Ambient simplification",
          url: "https://example.test/ambient",
          snippet: "Refactor evidence.",
        },
      ]);
      const emitBrowserState = vi.fn(async () => undefined);
      const recordBrowserAudit = vi.fn();
      const controller = new AgentRuntimeWebResearchController({
        store,
        createMcpRuntime: () => undefined,
        readSearchSettings: () => browserOnlySettings(),
        mcpEnv: () => undefined,
        prepareBrowserToolProfile,
        browserSearch,
        browserContent: vi.fn(async () => ({
          title: "Ambient simplification",
          url: "https://example.test/ambient",
          text: "Refactor evidence.",
          links: [],
        })),
        emitBrowserState,
        recordBrowserAudit,
        resolveFirstPartyPluginPermission: vi.fn(async () => true),
        discoverAmbientCliPackages,
      });
      const registeredTools: RegisteredTool[] = [];
      controller.createWebResearchToolExtension(thread.id, workspace)({
        registerTool: (tool: unknown) => {
          registeredTools.push(tool as RegisteredTool);
        },
      } as unknown as Parameters<ExtensionFactory>[0]);
      const searchTool = registeredTools.find((tool) => tool.name === "web_research_search");

      expect(searchTool).toBeDefined();
      const result = await searchTool!.execute("search-call", { query: "ambient simplification" }, new AbortController().signal);

      expect(discoverAmbientCliPackages).toHaveBeenCalledWith(workspace.path, { includeHealth: true });
      expect(prepareBrowserToolProfile).toHaveBeenCalledWith({ query: "ambient simplification" }, thread.id, undefined);
      expect(browserSearch).toHaveBeenCalledWith(expect.objectContaining({
        query: "ambient simplification",
        profileMode: "isolated",
        runtime: "chrome",
        sourceThreadId: thread.id,
      }));
      expect(emitBrowserState).toHaveBeenCalledOnce();
      expect(recordBrowserAudit).toHaveBeenCalledWith(
        thread.id,
        "web_research_search",
        "browser-network",
        "ambient simplification",
      );
      expect(result.details).toMatchObject({
        toolName: "web_research_search",
        role: "search",
        query: "ambient simplification",
        selectedProvider: WEB_RESEARCH_PROVIDER_IDS.browser,
      });
      expect(result.content[0]?.text).toContain("Ambient simplification");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function browserOnlySettings(): SearchRoutingSettings {
  return {
    webResearch: {
      schemaVersion: "ambient-web-research-provider-stack-v1",
      providers: [browserProvider()],
      preferences: {
        search: [WEB_RESEARCH_PROVIDER_IDS.browser],
        fetch: [WEB_RESEARCH_PROVIDER_IDS.browser],
      },
      fallbackPolicy: { allowBrowserFallback: true },
    },
  };
}

function browserProvider(): WebResearchProviderConfig {
  return {
    providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
    label: "Ambient Browser",
    kind: "built-in-browser",
    roles: ["search", "fetch", "interactive_browser"],
    status: "enabled",
  };
}

function emptyCatalog(): AmbientCliPackageCatalog {
  return { packages: [], errors: [] };
}
