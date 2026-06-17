import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type {
  BrowserPageContent,
  BrowserUserActionState,
} from "../../../shared/types";
import type { MaterializedTextOutput } from "../../toolOutputArtifacts";
import { BrowserUnavailableError } from "../../browserService";
import {
  registerBrowserContentTool,
  type BrowserContentToolRegistrationOptions,
} from "./agentRuntimeBrowserContentTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserContentTools", () => {
  it("returns Scrapling route results without using the browser fallback", async () => {
    const registeredTools: RegisteredTool[] = [];
    const signal = new AbortController().signal;
    const scraplingResult = toolResult("Scrapling text", {
      runtime: "ambient-mcp",
      toolName: "browser_content",
      targetToolName: "scrape",
      targetToolRef: "scrapling.scrape",
    });
    const tryRouteBrowserContentThroughScrapling = vi.fn(async () => ({ result: scraplingResult }));
    const prepareBrowserToolProfile = vi.fn();
    const browserContent = vi.fn();
    const emitBrowserState = vi.fn();

    registerBrowserContentTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      tryRouteBrowserContentThroughScrapling,
      prepareBrowserToolProfile,
      browserContent,
      emitBrowserState,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_content"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const input = { url: "https://example.test/article", maxCharacters: 1000 };
    const result = await registeredTools[0]!.execute("content", input, signal);

    expect(result).toBe(scraplingResult);
    expect(tryRouteBrowserContentThroughScrapling).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      workspace: workspace(),
      url: "https://example.test/article",
      rawInput: input,
      signal,
    }));
    expect(prepareBrowserToolProfile).not.toHaveBeenCalled();
    expect(browserContent).not.toHaveBeenCalled();
    expect(emitBrowserState).not.toHaveBeenCalled();
  });

  it("falls back to Ambient browser content and preserves fallback metadata", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const content = browserContentFixture({ url: "https://example.test/rendered" });
    const textOutput = textOutputFixture("Materialized page text.");
    const materializedContent = { ...content, text: "Materialized page text.", textOutput };
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const readBrowserContent = vi.fn(async (input: any) => {
      input.onActivity?.("Browser content received readable text.");
      return content;
    });
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserContentAudit = vi.fn();
    const withBrowserToolHeartbeat = vi.fn(async (_toolName: string, _message: string, operation: any, _onUpdate: any, _options: any) =>
      operation(() => undefined),
    );
    const materializeBrowserPageContent = vi.fn(async () => materializedContent);
    const formatBrowserContent = vi.fn(() => "formatted browser content");
    const formatDiagnosticText = vi.fn(() => "short fallback");

    registerBrowserContentTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      prepareBrowserToolProfile,
      browserContent: readBrowserContent,
      emitBrowserState,
      recordBrowserContentAudit,
      withBrowserToolHeartbeat,
      materializeBrowserPageContent,
      formatBrowserContent,
      formatDiagnosticText,
      tryRouteBrowserContentThroughScrapling: async () => ({ fallbackReason: "Scrapling unavailable with a long diagnostic." }),
    }));

    const result = await registeredTools[0]!.execute("content", {
      url: "https://example.test/source",
    }, signal, (update: any) => updates.push(update));

    expect(formatDiagnosticText).toHaveBeenCalledWith("Scrapling unavailable with a long diagnostic.", 1_000);
    expect(updates.map((update) => update.content[0].text)).toEqual([
      "Scrapling route unavailable; using Ambient browser content. short fallback",
      "Reading https://example.test/source.",
    ]);
    expect(prepareBrowserToolProfile).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.test/source" }), "thread-1", expect.any(Function));
    expect(withBrowserToolHeartbeat).toHaveBeenCalledWith(
      "browser_content",
      "Browser page reading is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
      expect.any(Function),
      expect.any(Function),
      { signal },
    );
    expect(readBrowserContent).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://example.test/source",
      profileMode: "isolated",
      runtime: "chrome",
      waitForUserAction: true,
      sourceThreadId: "thread-1",
      onActivity: expect.any(Function),
    }));
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(recordBrowserContentAudit).toHaveBeenCalledWith({ profileMode: "isolated", url: "https://example.test/rendered" });
    expect(materializeBrowserPageContent).toHaveBeenCalledWith("/workspace", "browser-content", content);
    expect(formatBrowserContent).toHaveBeenCalledWith(materializedContent);
    expect(result).toEqual({
      content: [{ type: "text", text: "formatted browser content" }],
      details: {
        toolName: "browser_content",
        profileMode: "isolated",
        runtime: "chrome",
        url: "https://example.test/rendered",
        preferredCapabilityFallback: "short fallback",
        textOutput,
      },
    });
  });

  it("returns browser unavailable fallback without recording an audit", async () => {
    const registeredTools: RegisteredTool[] = [];
    const recordBrowserContentAudit = vi.fn();

    registerBrowserContentTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserContent: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      recordBrowserContentAudit,
    }));

    const result = await registeredTools[0]!.execute("content", { url: "https://example.test" });

    expect(result.content[0].text).toContain("Browser unavailable.");
    expect(result.content[0].text).toContain("Chrome missing");
    expect(result.details).toMatchObject({
      toolName: "browser_content",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(recordBrowserContentAudit).not.toHaveBeenCalled();
  });

  it("returns recoverable browser content errors as tool errors", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerBrowserContentTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserContent: async () => {
        throw new Error("Read failed");
      },
    }));

    const result = await registeredTools[0]!.execute("content", { url: "https://example.test" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Read failed");
    expect(result.details).toMatchObject({
      status: "error",
      toolName: "browser_content",
      profileMode: "isolated",
      runtime: "chrome",
      url: "https://example.test",
    });
  });

  it("returns browser user-action results through the injected formatter", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();

    registerBrowserContentTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserContent: async () => action,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("content", { url: "https://captcha.example.test" });

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_content",
      profileMode: "isolated",
      userAction: action,
    });
  });

  it("preserves explicit workflow user-action handoff mode", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserContent = vi.fn(async () => browserContentFixture());

    registerBrowserContentTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ browserContent }));

    await registeredTools[0]!.execute("content", {
      url: "https://captcha.example.test",
      waitForUserAction: false,
    });

    expect(browserContent).toHaveBeenCalledWith(expect.objectContaining({
      waitForUserAction: false,
    }));
  });
});

function options(
  overrides: Partial<BrowserContentToolRegistrationOptions> = {},
): BrowserContentToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: workspace(),
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserContent: async () => browserContentFixture(),
    emitBrowserState: async () => undefined,
    recordBrowserContentAudit: () => undefined,
    tryRouteBrowserContentThroughScrapling: async () => ({}),
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    materializeBrowserPageContent: async (_workspacePath, _label, content) => content,
    formatBrowserContent: (content) => content.text,
    formatBrowserUserAction: () => "Browser needs action.",
    formatDiagnosticText: (value, maxChars) => value.slice(0, maxChars),
    ...overrides,
  };
}

function workspace() {
  return {
    path: "/workspace",
    name: "workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/session",
  };
}

function browserContentFixture(overrides: Partial<BrowserPageContent> = {}): BrowserPageContent {
  return {
    title: "Example",
    url: "https://example.test",
    text: "Readable page text.",
    links: [],
    ...overrides,
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
    startedAt: "2026-06-10T00:00:00.000Z",
    lastCheckedAt: "2026-06-10T00:00:00.000Z",
    canAutoResume: false,
  };
}

function textOutputFixture(text: string): MaterializedTextOutput {
  return {
    text,
    truncated: false,
    totalChars: text.length,
    previewChars: text.length,
    redacted: false,
    redactionCount: 0,
  };
}

function toolResult(text: string, details: Record<string, unknown> = {}): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}
