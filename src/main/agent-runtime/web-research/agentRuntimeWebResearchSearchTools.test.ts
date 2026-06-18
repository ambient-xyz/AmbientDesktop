import { describe, expect, it } from "vitest";

import type { BrowserSearchResult, BrowserUserActionState } from "../../../shared/browserTypes";
import type { WebResearchProviderConfig } from "../../../shared/webResearchTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { AmbientCliRunResult } from "../agentRuntimeAmbientCliFacade";
import { WEB_RESEARCH_PROVIDER_IDS, type WebResearchProviderRequestPlan } from "../agentRuntimeWebResearchFacade";
import { registerWebResearchSearchTools, type WebResearchSearchToolRegistrationOptions } from "./agentRuntimeWebResearchSearchTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerWebResearchSearchTools", () => {
  it("registers and returns the no-provider result with current query validation", async () => {
    const registeredTools: RegisteredTool[] = [];
    const planCalls: Array<{ input: Record<string, unknown>; signal?: AbortSignal }> = [];
    const signal = new AbortController().signal;

    registerWebResearchSearchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async (input, receivedSignal) => {
        planCalls.push({ input, signal: receivedSignal });
        return providerPlan([], [], [{ providerId: "disabled-provider", reason: "Provider is disabled." }]);
      },
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["web_research_search"]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("web-search", {
      query: "ambient simplification",
      providerOrder: ["disabled-provider"],
    }, signal);

    expect(planCalls).toEqual([{ input: { query: "ambient simplification", providerOrder: ["disabled-provider"] }, signal }]);
    expect(result.content[0].text).toContain("No configured web research search provider completed successfully.");
    expect(result.content[0].text).toContain("disabled-provider: skipped");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_search",
      role: "search",
      query: "ambient simplification",
      attempts: [
        {
          providerId: "disabled-provider",
          status: "skipped",
          reason: "Provider is disabled.",
        },
      ],
    });

    await expect(tool.execute("web-search", { query: " " })).rejects.toThrow("query is required.");
  });

  it("runs an Ambient CLI search provider with the original command arguments", async () => {
    const registeredTools: RegisteredTool[] = [];
    const commandCalls: Array<{ workspacePath: string; input: unknown }> = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const stdoutOutput = textOutput("cli stdout");

    registerWebResearchSearchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan([ambientCliProvider()], ["ambient-brave-search"]),
      runAmbientCliPackageCommand: async (workspacePath, input) => {
        commandCalls.push({ workspacePath, input });
        return {
          packageId: "ambient-cli:brave-search",
          packageName: "ambient-brave-search",
          commandName: "search",
          command: ["node", "./search.mjs", "ambient"],
          cwd: "/tmp/workspace",
          durationMs: 17,
          stdout: "Brave result",
          stdoutOutput,
        };
      },
    }));

    const result = await registeredTools[0]!.execute("web-search", {
      query: "ambient",
      maxResults: 4,
    }, signal, (update: any) => updates.push(update));

    expect(commandCalls).toEqual([
      {
        workspacePath: "/tmp/workspace",
        input: {
          packageName: "ambient-brave-search",
          command: "search",
          args: ["ambient"],
          signal,
        },
      },
    ]);
    expect(updates[0].content[0].text).toBe("Searching with Brave Search for \"ambient\".");
    expect(result.content[0].text).toContain("Web research search completed with ambient-brave-search.");
    expect(result.content[0].text).toContain("Brave result");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_search",
      role: "search",
      query: "ambient",
      selectedProvider: "ambient-brave-search",
      provider: {
        kind: "ambient-cli",
        providerId: "ambient-brave-search",
        label: "Brave Search",
        packageId: "ambient-cli:brave-search",
        packageName: "ambient-brave-search",
        commandName: "search",
        capabilityId: "web.search",
      },
      textOutput: stdoutOutput,
    });
  });

  it("returns browser user-action results after browser fallback search", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserCalls: unknown[] = [];
    const emittedBrowserStates: string[] = [];

    registerWebResearchSearchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan([browserProvider()], [WEB_RESEARCH_PROVIDER_IDS.browser]),
      browserSearch: async (input) => {
        browserCalls.push(input);
        return browserUserAction();
      },
      emitBrowserState: async () => {
        emittedBrowserStates.push("emitted");
      },
    }));

    const result = await registeredTools[0]!.execute("web-search", {
      query: "captcha query",
      fetchContent: true,
      maxResults: 2,
    });

    expect(browserCalls).toEqual([
      expect.objectContaining({
        query: "captcha query",
        maxResults: 2,
        fetchContent: true,
        profileMode: "isolated",
        runtime: "chrome",
        waitForUserAction: false,
        sourceThreadId: "thread-1",
      }),
    ]);
    expect(emittedBrowserStates).toEqual(["emitted"]);
    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      runtime: "chrome",
      toolName: "web_research_search",
      role: "search",
      query: "captcha query",
      profileMode: "isolated",
      userAction: expect.objectContaining({ kind: "captcha", status: "waiting" }),
      attempts: [
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
          status: "failed",
          reason: "Browser needs action.",
        },
      ],
    });
  });

  it("falls through to Exa when browser search needs user action and another provider is configured", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserCalls: unknown[] = [];
    const exaCalls: unknown[] = [];
    const output = textOutput("exa search output");

    registerWebResearchSearchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan(
        [browserProvider(), exaProvider()],
        [WEB_RESEARCH_PROVIDER_IDS.browser, WEB_RESEARCH_PROVIDER_IDS.exa],
      ),
      browserSearch: async (input) => {
        browserCalls.push(input);
        return browserUserAction();
      },
      callExaWebSearch: async (input) => {
        exaCalls.push(input);
        return {
          providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
          tool: "web_search_exa",
          text: "Exa result",
          output,
          durationMs: 31,
        };
      },
    }));

    const result = await registeredTools[0]!.execute("web-search", {
      query: "captcha query",
    });

    expect(browserCalls).toEqual([
      expect.objectContaining({
        query: "captcha query",
        waitForUserAction: false,
      }),
    ]);
    expect(exaCalls).toEqual([
      expect.objectContaining({
        workspacePath: "/tmp/workspace",
        query: "captcha query",
      }),
    ]);
    expect(result.content[0].text).toContain("Web research search completed with exa-mcp-default.");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_search",
      role: "search",
      query: "captcha query",
      selectedProvider: WEB_RESEARCH_PROVIDER_IDS.exa,
      attempts: [
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
          status: "failed",
          reason: "Browser needs action.",
        },
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
          status: "succeeded",
          tool: "web_search_exa",
          durationMs: 31,
        },
      ],
      textOutput: output,
    });
  });

  it("records browser search audits for successful browser fallback", async () => {
    const registeredTools: RegisteredTool[] = [];
    const audits: Array<{ profileMode: string; query: string }> = [];

    registerWebResearchSearchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan([browserProvider()], [WEB_RESEARCH_PROVIDER_IDS.browser]),
      browserSearch: async () => [browserResult()],
      recordBrowserSearchAudit: (input) => audits.push(input),
      now: sequenceClock([10, 35]),
    }));

    const result = await registeredTools[0]!.execute("web-search", {
      query: "browser query",
    });

    expect(audits).toEqual([{ profileMode: "isolated", query: "browser query" }]);
    expect(result.content[0].text).toContain("1. Browser result");
    expect(result.details).toMatchObject({
      runtime: "chrome",
      toolName: "web_research_search",
      role: "search",
      selectedProvider: WEB_RESEARCH_PROVIDER_IDS.browser,
      attempts: [
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
          status: "succeeded",
          tool: "browser_search",
          durationMs: 25,
        },
      ],
      results: [browserResult()],
    });
  });
});

function options(
  overrides: Partial<WebResearchSearchToolRegistrationOptions> = {},
): WebResearchSearchToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: workspace(),
    webResearchProviderPlanForInput: async () => providerPlan(),
    webResearchExaApiKey: () => undefined,
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserSearch: async () => [],
    emitBrowserState: async () => undefined,
    recordBrowserSearchAudit: () => undefined,
    tryCallWebResearchMcpProvider: async () => ({ fallbackReason: "not configured" }),
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    formatAmbientCliRun: (result) => `Ambient CLI completed: ${result.packageName}`,
    formatBrowserSearchResults: (results) => results.map((item, index) => `${index + 1}. ${item.title}\n${item.url}`).join("\n\n"),
    formatBrowserUserAction: () => "Browser needs action.",
    formatErrorMessage: (error) => error instanceof Error ? error.message : String(error),
    callExaWebSearch: async () => {
      throw new Error("exa unavailable");
    },
    runAmbientCliPackageCommand: async () => {
      throw new Error("ambient cli unavailable");
    },
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

function ambientCliProvider(): WebResearchProviderConfig {
  return {
    providerId: "ambient-brave-search",
    label: "Brave Search",
    kind: "ambient-cli",
    roles: ["search"],
    status: "enabled",
    ambientCli: {
      packageName: "ambient-brave-search",
      commandName: "search",
      capabilityId: "web.search",
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

function exaProvider(): WebResearchProviderConfig {
  return {
    providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
    label: "Exa Search",
    kind: "remote-mcp",
    roles: ["search", "fetch"],
    status: "enabled",
    mcp: {
      toolName: "web_search_exa",
    },
  };
}

function browserResult(): BrowserSearchResult {
  return {
    title: "Browser result",
    url: "https://example.test/result",
    snippet: "A browser search result.",
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "browser-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "browser_search",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Complete the CAPTCHA.",
    startedAt: "2026-06-07T00:00:00.000Z",
    lastCheckedAt: "2026-06-07T00:00:00.000Z",
    canAutoResume: false,
  };
}

function textOutput(text: string): NonNullable<AmbientCliRunResult["stdoutOutput"]> {
  return {
    text,
    truncated: false,
    totalChars: text.length,
    previewChars: text.length,
    redacted: false,
    redactionCount: 0,
  };
}

function sequenceClock(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}
