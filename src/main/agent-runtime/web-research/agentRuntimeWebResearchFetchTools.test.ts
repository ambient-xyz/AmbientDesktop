import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

import type { BrowserPageContent, BrowserUserActionState } from "../../../shared/browserTypes";
import type { WebResearchProviderConfig } from "../../../shared/webResearchTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { MaterializedTextOutput } from "../../tool-runtime/toolOutputArtifacts";
import { WEB_RESEARCH_PROVIDER_IDS, type WebResearchProviderRequestPlan } from "../../web-research/webResearchProviderStack";
import { registerWebResearchFetchTools, type WebResearchFetchToolRegistrationOptions } from "./agentRuntimeWebResearchFetchTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerWebResearchFetchTools", () => {
  it("registers and returns the no-provider result with current URL validation", async () => {
    const registeredTools: RegisteredTool[] = [];
    const planCalls: Array<{ input: Record<string, unknown>; signal?: AbortSignal }> = [];
    const signal = new AbortController().signal;

    registerWebResearchFetchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async (input, receivedSignal) => {
        planCalls.push({ input, signal: receivedSignal });
        return providerPlan([], [], [{ providerId: "disabled-provider", reason: "Provider is disabled." }]);
      },
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["web_research_fetch"]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("web-fetch", {
      url: "example.test/page",
      providerOrder: ["disabled-provider"],
    }, signal);

    expect(planCalls).toEqual([{ input: { url: "example.test/page", providerOrder: ["disabled-provider"] }, signal }]);
    expect(result.content[0].text).toContain("No configured web research fetch provider completed successfully.");
    expect(result.content[0].text).toContain("disabled-provider: skipped");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_fetch",
      role: "fetch",
      url: "https://example.test/page",
      attempts: [
        {
          providerId: "disabled-provider",
          status: "skipped",
          reason: "Provider is disabled.",
        },
      ],
    });

    await expect(tool.execute("web-fetch", { url: " " })).rejects.toThrow("url is required.");
    await expect(tool.execute("web-fetch", { url: "ftp://example.test/file" })).rejects.toThrow("web_research_fetch only supports public HTTP(S) URLs.");
  });

  it("runs Scrapling before other fetch providers with normalized URL input", async () => {
    const registeredTools: RegisteredTool[] = [];
    const scraplingCalls: unknown[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const scraplingTextOutput = textOutput("scrapling output");

    registerWebResearchFetchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan([scraplingProvider(), exaProvider()], [WEB_RESEARCH_PROVIDER_IDS.scrapling, WEB_RESEARCH_PROVIDER_IDS.exa]),
      tryRouteBrowserContentThroughScrapling: async (input) => {
        scraplingCalls.push(input);
        return {
          result: toolResult("Scrapling text", {
            targetToolName: "scrape",
            targetToolRef: "scrapling.scrape",
            textOutput: scraplingTextOutput,
          }),
        };
      },
      now: sequenceClock([100, 142]),
    }));

    const result = await registeredTools[0]!.execute("web-fetch", {
      url: "example.test/article",
      maxCharacters: 4096,
    }, signal, (update: any) => updates.push(update));

    expect(updates[0].content[0].text).toBe("Reading https://example.test/article with Scrapling MCP.");
    expect(scraplingCalls).toEqual([
      expect.objectContaining({
        threadId: "thread-1",
        workspace: workspace(),
        url: "https://example.test/article",
        rawInput: {
          url: "https://example.test/article",
          maxCharacters: 4096,
        },
        signal,
      }),
    ]);
    expect(result.content[0].text).toContain("Web research fetch completed with scrapling-mcp-default.");
    expect(result.content[0].text).toContain("Scrapling text");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_fetch",
      role: "fetch",
      url: "https://example.test/article",
      selectedProvider: WEB_RESEARCH_PROVIDER_IDS.scrapling,
      targetToolName: "scrape",
      attempts: [
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.scrapling,
          status: "succeeded",
          tool: "scrape",
          durationMs: 42,
        },
      ],
      textOutput: scraplingTextOutput,
    });
  });

  it("runs Exa fetch with current normalized arguments", async () => {
    const registeredTools: RegisteredTool[] = [];
    const exaCalls: unknown[] = [];
    const output = textOutput("exa output");

    registerWebResearchFetchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan([exaProvider()], [WEB_RESEARCH_PROVIDER_IDS.exa]),
      webResearchExaApiKey: () => "test-key",
      callExaWebFetch: async (input) => {
        exaCalls.push(input);
        return {
          providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
          tool: "web_fetch_exa",
          text: "Exa text",
          output,
          durationMs: 19,
        };
      },
    }));

    const signal = new AbortController().signal;
    const result = await registeredTools[0]!.execute("web-fetch", {
      url: "example.test/source",
      maxCharacters: 10000,
    }, signal);

    expect(exaCalls).toEqual([
      {
        workspacePath: "/tmp/workspace",
        url: "https://example.test/source",
        maxCharacters: 10000,
        signal,
        apiKey: "test-key",
      },
    ]);
    expect(result.content[0].text).toContain("Web research fetch completed with exa-mcp-default.");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_fetch",
      role: "fetch",
      url: "https://example.test/source",
      selectedProvider: WEB_RESEARCH_PROVIDER_IDS.exa,
      attempts: [
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
          status: "succeeded",
          tool: "web_fetch_exa",
          durationMs: 19,
        },
      ],
      textOutput: output,
    });
  });

  it("records browser fetch audits for successful browser fallback", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserCalls: unknown[] = [];
    const audits: Array<{ profileMode: string; url: string }> = [];
    const browserTextOutput = textOutput("browser materialized");

    registerWebResearchFetchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan([browserProvider()], [WEB_RESEARCH_PROVIDER_IDS.browser]),
      browserContent: async (input) => {
        browserCalls.push(input);
        return browserContent();
      },
      materializeBrowserPageContent: async (_workspacePath, _label, content) => ({
        ...content,
        textOutput: browserTextOutput,
      }),
      recordBrowserFetchAudit: (input) => audits.push(input),
      now: sequenceClock([10, 37]),
    }));

    const result = await registeredTools[0]!.execute("web-fetch", {
      url: "example.test/browser",
    });

    expect(browserCalls).toEqual([
      expect.objectContaining({
        url: "https://example.test/browser",
        profileMode: "isolated",
        runtime: "chrome",
        waitForUserAction: false,
        sourceThreadId: "thread-1",
      }),
    ]);
    expect(audits).toEqual([{ profileMode: "isolated", url: "https://example.test/rendered" }]);
    expect(result.content[0].text).toContain("Title: Browser page");
    expect(result.content[0].text).toContain("Text:");
    expect(result.details).toMatchObject({
      runtime: "chrome",
      toolName: "web_research_fetch",
      role: "fetch",
      selectedProvider: WEB_RESEARCH_PROVIDER_IDS.browser,
      url: "https://example.test/rendered",
      attempts: [
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
          status: "succeeded",
          tool: "browser_content",
          durationMs: 27,
        },
      ],
      textOutput: browserTextOutput,
    });
  });

  it("returns browser user-action results after browser fallback fetch", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserCalls: unknown[] = [];
    const emittedBrowserStates: string[] = [];

    registerWebResearchFetchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan([browserProvider()], [WEB_RESEARCH_PROVIDER_IDS.browser]),
      browserContent: async (input) => {
        browserCalls.push(input);
        return browserUserAction();
      },
      emitBrowserState: async () => {
        emittedBrowserStates.push("emitted");
      },
    }));

    const result = await registeredTools[0]!.execute("web-fetch", {
      url: "https://example.test/captcha",
    });

    expect(browserCalls).toEqual([
      expect.objectContaining({
        url: "https://example.test/captcha",
        waitForUserAction: false,
      }),
    ]);
    expect(emittedBrowserStates).toEqual(["emitted"]);
    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      runtime: "chrome",
      toolName: "web_research_fetch",
      role: "fetch",
      url: "https://example.test/captcha",
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

  it("falls through to Exa when browser fetch needs user action and another provider is configured", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserCalls: unknown[] = [];
    const exaCalls: unknown[] = [];
    const output = textOutput("exa fetch output");

    registerWebResearchFetchTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      webResearchProviderPlanForInput: async () => providerPlan(
        [browserProvider(), exaProvider()],
        [WEB_RESEARCH_PROVIDER_IDS.browser, WEB_RESEARCH_PROVIDER_IDS.exa],
      ),
      browserContent: async (input) => {
        browserCalls.push(input);
        return browserUserAction();
      },
      callExaWebFetch: async (input) => {
        exaCalls.push(input);
        return {
          providerId: WEB_RESEARCH_PROVIDER_IDS.exa,
          tool: "web_fetch_exa",
          text: "Exa text",
          output,
          durationMs: 23,
        };
      },
    }));

    const result = await registeredTools[0]!.execute("web-fetch", {
      url: "https://example.test/captcha",
    });

    expect(browserCalls).toEqual([
      expect.objectContaining({
        url: "https://example.test/captcha",
        waitForUserAction: false,
      }),
    ]);
    expect(exaCalls).toEqual([
      expect.objectContaining({
        workspacePath: "/tmp/workspace",
        url: "https://example.test/captcha",
      }),
    ]);
    expect(result.content[0].text).toContain("Web research fetch completed with exa-mcp-default.");
    expect(result.details).toMatchObject({
      runtime: "ambient-web-research",
      toolName: "web_research_fetch",
      role: "fetch",
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
          tool: "web_fetch_exa",
          durationMs: 23,
        },
      ],
      textOutput: output,
    });
  });
});

function options(
  overrides: Partial<WebResearchFetchToolRegistrationOptions> = {},
): WebResearchFetchToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: workspace(),
    webResearchProviderPlanForInput: async () => providerPlan(),
    webResearchExaApiKey: () => undefined,
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserContent: async () => browserContent(),
    emitBrowserState: async () => undefined,
    recordBrowserFetchAudit: () => undefined,
    tryRouteBrowserContentThroughScrapling: async () => ({}),
    tryCallWebResearchMcpProvider: async () => ({ fallbackReason: "not configured" }),
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    materializeBrowserPageContent: async (_workspacePath, _label, content) => content,
    formatBrowserContent: (content) => [
      content.title ? `Title: ${content.title}` : "",
      content.url ? `URL: ${content.url}` : "",
      content.text ? `Text:\n${content.text}` : "No readable page text extracted.",
    ].filter(Boolean).join("\n\n"),
    formatBrowserUserAction: () => "Browser needs action.",
    formatErrorMessage: (error) => error instanceof Error ? error.message : String(error),
    callExaWebFetch: async () => {
      throw new Error("exa unavailable");
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

function scraplingProvider(): WebResearchProviderConfig {
  return {
    providerId: WEB_RESEARCH_PROVIDER_IDS.scrapling,
    label: "Scrapling",
    kind: "toolhive-mcp",
    roles: ["fetch"],
    status: "enabled",
    mcp: {
      toolName: "scrape",
    },
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
      toolName: "web_fetch_exa",
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

function browserContent(): BrowserPageContent {
  return {
    title: "Browser page",
    url: "https://example.test/rendered",
    text: "Readable browser page text.",
    links: [],
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "browser-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "browser_content",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Complete the CAPTCHA.",
    startedAt: "2026-06-07T00:00:00.000Z",
    lastCheckedAt: "2026-06-07T00:00:00.000Z",
    canAutoResume: false,
  };
}

function toolResult(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function textOutput(text: string): MaterializedTextOutput {
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
