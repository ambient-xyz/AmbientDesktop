import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type {
  BrowserPageContent,
  BrowserSearchResult,
  BrowserUserActionState,
  WebResearchProviderConfig,
  WorkspaceState,
} from "../../shared/types";
import type { LocalDeepResearchProviderSnapshot } from "./localDeepResearchSetup";
import type { MaterializedTextOutput } from "../toolOutputArtifacts";
import {
  createAgentRuntimeLocalDeepResearchWebBroker,
  createLocalDeepResearchWebBroker,
  type LocalDeepResearchWebBrokerOptions,
} from "./agentRuntimeLocalDeepResearchWebBroker";
import {
  WEB_RESEARCH_PROVIDER_IDS,
  type WebResearchProviderRequestPlan,
} from "../webResearchProviderStack";

describe("agentRuntimeLocalDeepResearchWebBroker", () => {
  it("routes search through Ambient CLI with skipped provider metadata", async () => {
    const signal = new AbortController().signal;
    const updates: string[] = [];
    const webResearchProviderPlanForInput = vi.fn(async () => providerPlan(
      [ambientCliSearchProvider()],
      ["ambient-brave-search"],
      [{ providerId: "disabled-provider", reason: "Provider is disabled." }],
    ));
    const runAmbientCliPackageCommand = vi.fn(async () => ({
      packageId: "ambient-cli:brave",
      packageName: "ambient-brave-search",
      commandName: "search",
      command: ["node", "search.mjs", "ambient"],
      cwd: "/tmp/workspace",
      durationMs: 17,
      stdout: "Brave result",
      stdoutOutput: textOutput("Brave result", ".ambient/artifacts/brave.txt"),
    }));
    const broker = createLocalDeepResearchWebBroker(runtime({ signal, onUpdate: (update) => updates.push(toolText(update)) }), options({
      webResearchProviderPlanForInput,
      runAmbientCliPackageCommand,
    }));

    const result = await broker.search({ query: "ambient", maxResults: 4 });

    expect(webResearchProviderPlanForInput).toHaveBeenCalledWith(
      workspace(),
      { query: "ambient", maxResults: 4 },
      "search",
      signal,
      snapshot(),
    );
    expect(runAmbientCliPackageCommand).toHaveBeenCalledWith("/tmp/workspace", {
      packageName: "ambient-brave-search",
      command: "search",
      args: ["ambient"],
      signal,
    });
    expect(updates).toEqual([
      'Searching with Brave Search for "ambient".',
      'Brave Search search returned output for "ambient".',
    ]);
    expect(result).toMatchObject({
      text: "Brave result",
      selectedProvider: "ambient-brave-search",
      textOutputPath: ".ambient/artifacts/brave.txt",
      attempts: [
        {
          providerId: "disabled-provider",
          status: "skipped",
          reason: "Provider is disabled.",
        },
        {
          providerId: "ambient-brave-search",
          status: "succeeded",
          tool: "ambient_cli:ambient-brave-search:search",
          durationMs: 17,
        },
      ],
      metadata: {
        provider: "Brave Search",
        stdoutOutput: textOutput("Brave result", ".ambient/artifacts/brave.txt"),
      },
    });
  });

  it("routes Scrapling fetch results through Local Deep Research observations", async () => {
    const textOutputArtifact = textOutput("Scrapling text", ".ambient/artifacts/scrapling.txt");
    const tryRouteBrowserContentThroughScrapling = vi.fn(async () => ({
      result: toolResult("Scrapling text", {
        targetToolName: "scrape",
        textOutput: textOutputArtifact,
      }),
    }));
    const broker = createLocalDeepResearchWebBroker(runtime(), options({
      webResearchProviderPlanForInput: vi.fn(async () => providerPlan([], [WEB_RESEARCH_PROVIDER_IDS.scrapling])),
      tryRouteBrowserContentThroughScrapling,
    }));

    const result = await broker.visit({ url: "example.test/article", maxCharacters: 4096 });

    expect(tryRouteBrowserContentThroughScrapling).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-local-deep-research",
      workspace: workspace(),
      url: "https://example.test/article",
      rawInput: {
        url: "https://example.test/article",
        maxCharacters: 4096,
      },
    }));
    expect(result).toMatchObject({
      text: "Scrapling text",
      selectedProvider: WEB_RESEARCH_PROVIDER_IDS.scrapling,
      textOutputPath: ".ambient/artifacts/scrapling.txt",
      attempts: [
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.scrapling,
          status: "succeeded",
          tool: "scrape",
        },
      ],
      metadata: {
        textOutput: textOutputArtifact,
      },
    });
  });

  it("emits structured retrieval status for fetch wrappers", async () => {
    const updates: AgentToolResult<Record<string, unknown>>[] = [];
    const textOutputArtifact = textOutput("Scrapling text", ".ambient/artifacts/scrapling.txt");
    const broker = createLocalDeepResearchWebBroker(runtime({ onUpdate: (update) => updates.push(update) }), options({
      webResearchProviderPlanForInput: vi.fn(async () => providerPlan([], [WEB_RESEARCH_PROVIDER_IDS.scrapling])),
      tryRouteBrowserContentThroughScrapling: vi.fn(async () => ({
        result: toolResult("Scrapling text", {
          targetToolName: "scrape",
          textOutput: textOutputArtifact,
        }),
      })),
    }));

    await broker.visit({ url: "example.test/article", maxCharacters: 4096 });

    expect(updates.at(0)?.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      stage: "retrieval",
      localDeepResearchStatus: {
        stage: "retrieval",
        retrieval: {
          role: "fetch",
          status: "starting",
          providerId: WEB_RESEARCH_PROVIDER_IDS.scrapling,
          providerLabel: "Scrapling MCP",
          url: "https://example.test/article",
        },
      },
    });
    expect(updates.at(-1)?.details).toMatchObject({
      localDeepResearchStatus: {
        retrieval: {
          status: "succeeded",
          outputChars: "Scrapling text".length,
          textOutputPath: ".ambient/artifacts/scrapling.txt",
        },
      },
    });
  });

  it("normalizes browser fetch URLs and records user-action fallback attempts", async () => {
    const browserContent = vi.fn(async () => browserUserAction());
    const emitBrowserState = vi.fn(async () => undefined);
    const materializeBrowserPageContent = vi.fn(async (_workspacePath: string, _label: string, content: BrowserPageContent) => ({
      ...content,
      textOutput: textOutput(content.text, ".ambient/artifacts/browser.txt"),
    }));
    const recordBrowserFetchAudit = vi.fn();
    const broker = createLocalDeepResearchWebBroker(runtime(), options({
      webResearchProviderPlanForInput: vi.fn(async () => providerPlan([browserProvider()], [WEB_RESEARCH_PROVIDER_IDS.browser])),
      browserContent,
      emitBrowserState,
      materializeBrowserPageContent,
      recordBrowserFetchAudit,
    }));

    const result = await broker.visit({ url: "example.test/page", maxCharacters: 1200 });

    expect(browserContent).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://example.test/page",
      profileMode: "isolated",
      runtime: "chrome",
      waitForUserAction: false,
      sourceThreadId: "thread-local-deep-research",
    }));
    expect(emitBrowserState).toHaveBeenCalledTimes(1);
    expect(recordBrowserFetchAudit).not.toHaveBeenCalled();
    expect(materializeBrowserPageContent).not.toHaveBeenCalled();
    expect(result.text).toContain("No configured web research fetch provider completed successfully.");
    expect(result.attempts).toEqual([
      {
        providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
        status: "failed",
        reason: "Browser action required.",
      },
    ]);
  });

  it("creates AgentRuntime broker options with default browser formatting and audit wiring", async () => {
    const recordBrowserAudit = vi.fn();
    const browserSearch = vi.fn(async () => [browserResult()]);
    const broker = createAgentRuntimeLocalDeepResearchWebBroker(runtime(), {
      webResearchProviderPlanForInput: vi.fn(async () => providerPlan([browserProvider()], [WEB_RESEARCH_PROVIDER_IDS.browser])),
      webResearchExaApiKey: vi.fn(() => undefined),
      prepareBrowserToolProfile: vi.fn(async () => ({ profileMode: "copied" as const, runtime: "chrome" as const })),
      browserSearch,
      browserContent: vi.fn(async () => pageContent()),
      emitBrowserState: vi.fn(async () => undefined),
      recordBrowserAudit,
      tryRouteBrowserContentThroughScrapling: vi.fn(async () => ({ fallbackReason: "Scrapling unavailable." })),
      tryCallWebResearchMcpProvider: vi.fn(async () => ({ fallbackReason: "MCP unavailable." })),
      withBrowserToolHeartbeat: vi.fn(async (_toolName, _message, operation) => operation(() => undefined)),
      formatErrorMessage: (error, maxChars) => truncate(String(error instanceof Error ? error.message : error), maxChars),
      truncateDiagnosticText: truncate,
    });

    const result = await broker.search({ query: "ambient browser", maxResults: 2 });

    expect(browserSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "ambient browser",
      maxResults: 2,
      fetchContent: false,
      profileMode: "copied",
      runtime: "chrome",
      sourceThreadId: "thread-local-deep-research",
    }));
    expect(recordBrowserAudit).toHaveBeenCalledWith(
      "thread-local-deep-research",
      "ambient_local_deep_research_run",
      "browser-profile",
      "ambient browser",
    );
    expect(result).toMatchObject({
      selectedProvider: WEB_RESEARCH_PROVIDER_IDS.browser,
      text: expect.stringContaining("Browser result"),
      attempts: [
        {
          providerId: WEB_RESEARCH_PROVIDER_IDS.browser,
          status: "succeeded",
          tool: "browser_search",
        },
      ],
      metadata: {
        profileMode: "copied",
        runtime: "chrome",
        results: [browserResult()],
      },
    });
  });
});

function options(overrides: Partial<LocalDeepResearchWebBrokerOptions> = {}): LocalDeepResearchWebBrokerOptions {
  return {
    webResearchProviderPlanForInput: vi.fn(async () => providerPlan([], [])),
    webResearchExaApiKey: vi.fn(() => undefined),
    prepareBrowserToolProfile: vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const })),
    browserSearch: vi.fn(async () => []),
    browserContent: vi.fn(async () => pageContent()),
    emitBrowserState: vi.fn(async () => undefined),
    recordBrowserSearchAudit: vi.fn(),
    recordBrowserFetchAudit: vi.fn(),
    tryRouteBrowserContentThroughScrapling: vi.fn(async () => ({ fallbackReason: "Scrapling unavailable." })),
    tryCallWebResearchMcpProvider: vi.fn(async () => ({ fallbackReason: "MCP unavailable." })),
    materializeBrowserPageContent: vi.fn(async (_workspacePath, _label, content) => ({
      ...content,
      textOutput: textOutput(content.text, ".ambient/artifacts/browser.txt"),
    })),
    withBrowserToolHeartbeat: vi.fn(async (_toolName, _message, operation) => operation(() => undefined)),
    runAmbientCliPackageCommand: vi.fn(async () => ({
      packageId: "ambient-cli:default",
      packageName: "ambient-default",
      commandName: "search",
      command: ["node", "search.mjs"],
      cwd: "/tmp/workspace",
      durationMs: 1,
      stdout: "default",
    })),
    formatBrowserContent: (content) => `Content: ${content.text}`,
    formatBrowserUserAction: vi.fn(() => "Browser action required."),
    formatErrorMessage: (error, maxChars) => truncate(String(error instanceof Error ? error.message : error), maxChars),
    truncateDiagnosticText: truncate,
    ...overrides,
  };
}

function runtime(overrides: Partial<Parameters<typeof createLocalDeepResearchWebBroker>[0]> = {}): Parameters<typeof createLocalDeepResearchWebBroker>[0] {
  return {
    threadId: "thread-local-deep-research",
    workspace: workspace(),
    providerSnapshot: snapshot(),
    ...overrides,
  };
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "Workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/sessions",
  };
}

function snapshot(): LocalDeepResearchProviderSnapshot {
  return {
    schemaVersion: "ambient-local-deep-research-provider-snapshot-v1",
    capturedAt: "2026-06-11T00:00:00.000Z",
    providerOrder: [],
    skippedProviders: [],
    providers: [],
    searchOrder: [],
    fetchOrder: [],
    skippedSearchProviders: [],
    skippedFetchProviders: [],
    fallbackPolicy: { allowBrowserFallback: true },
  };
}

function providerPlan(
  providers: WebResearchProviderConfig[],
  providerOrder: string[],
  skippedProviders: WebResearchProviderRequestPlan["skippedProviders"] = [],
): WebResearchProviderRequestPlan {
  return {
    providers,
    providerOrder,
    skippedProviders,
  };
}

function ambientCliSearchProvider(): WebResearchProviderConfig {
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

function browserResult(): BrowserSearchResult {
  return {
    title: "Browser result",
    url: "https://example.test/result",
    snippet: "A browser search result.",
  };
}

function pageContent(): BrowserPageContent {
  return {
    title: "Example",
    url: "https://example.test/page",
    text: "Example page",
    links: [],
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "browser_content",
    runtime: "chrome",
    profileMode: "isolated",
    sourceThreadId: "thread-local-deep-research",
    url: "https://example.test/page",
    message: "Complete the challenge.",
    startedAt: "2026-06-11T00:00:00.000Z",
    lastCheckedAt: "2026-06-11T00:00:00.000Z",
    canAutoResume: false,
  };
}

function toolResult(text: string, details: Record<string, unknown> = {}): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function toolText(update: AgentToolResult<Record<string, unknown>>): string {
  return update.content.map((item) => item.type === "text" ? item.text : "").join("\n");
}

function textOutput(text: string, artifactPath?: string): MaterializedTextOutput {
  return {
    text,
    truncated: false,
    totalChars: text.length,
    previewChars: text.length,
    redacted: false,
    redactionCount: 0,
    ...(artifactPath ? { artifactPath, artifactBytes: text.length } : {}),
  };
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}
