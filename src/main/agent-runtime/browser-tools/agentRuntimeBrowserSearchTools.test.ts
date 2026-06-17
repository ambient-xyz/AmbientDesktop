import { describe, expect, it, vi } from "vitest";

import type {
  BrowserSearchResult,
  BrowserUserActionState,
} from "../../../shared/types";
import { BrowserUnavailableError } from "../../browserService";
import {
  browserSearchText,
  registerBrowserSearchTool,
  type BrowserSearchToolRegistrationOptions,
} from "./agentRuntimeBrowserSearchTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserSearchTools", () => {
  it("registers browser_search and materializes successful search results", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const resultFixture = [browserResult({ content: "Full page text." })];
    const materializedResult = {
      content: [{ type: "text" as const, text: "materialized browser results" }],
      details: { runtime: "ambient-browser", toolName: "browser_search", materialized: true },
    };
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const browserSearch = vi.fn(async (input: any) => {
      input.onActivity?.("Browser search received results.");
      return resultFixture;
    });
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserSearchAudit = vi.fn();
    const withBrowserToolHeartbeat = vi.fn(async (_toolName: string, _message: string, operation: any, _onUpdate: any, _options: any) =>
      operation(() => undefined),
    );
    const materializeBrowserToolResult = vi.fn(async () => materializedResult);

    registerBrowserSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      prepareBrowserToolProfile,
      browserSearch,
      emitBrowserState,
      recordBrowserSearchAudit,
      withBrowserToolHeartbeat,
      materializeBrowserToolResult: materializeBrowserToolResult as any,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_search"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("search", {
      query: "ambient",
      maxResults: 3,
      fetchContent: true,
    }, signal, (update: any) => updates.push(update));

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith(expect.objectContaining({ query: "ambient" }), "thread-1", expect.any(Function));
    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "Searching Google for \"ambient\"." }],
      details: {
        runtime: "ambient-browser",
        toolName: "browser_search",
        status: "running",
      },
    });
    expect(withBrowserToolHeartbeat).toHaveBeenCalledWith(
      "browser_search",
      "Browser search is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
      expect.any(Function),
      expect.any(Function),
      { signal },
    );
    expect(browserSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "ambient",
      maxResults: 3,
      fetchContent: true,
      profileMode: "isolated",
      runtime: "chrome",
      waitForUserAction: true,
      sourceThreadId: "thread-1",
      onActivity: expect.any(Function),
    }));
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(recordBrowserSearchAudit).toHaveBeenCalledWith({ profileMode: "isolated", query: "ambient" });
    expect(materializeBrowserToolResult).toHaveBeenCalledWith(
      "/workspace",
      "browser-search",
      "browser search output",
      browserSearchText(resultFixture),
      {
        toolName: "browser_search",
        profileMode: "isolated",
        runtime: "chrome",
        results: resultFixture,
      },
    );
    expect(result).toBe(materializedResult);
  });

  it("returns browser unavailable fallback without recording an audit", async () => {
    const registeredTools: RegisteredTool[] = [];
    const recordBrowserSearchAudit = vi.fn();

    registerBrowserSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserSearch: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      recordBrowserSearchAudit,
    }));

    const result = await registeredTools[0]!.execute("search", { query: "ambient" });

    expect(result.content[0].text).toContain("Browser unavailable.");
    expect(result.content[0].text).toContain("Chrome missing");
    expect(result.details).toMatchObject({
      toolName: "browser_search",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(recordBrowserSearchAudit).not.toHaveBeenCalled();
  });

  it("returns recoverable browser search errors as tool errors", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerBrowserSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserSearch: async () => {
        throw new Error("Search failed");
      },
    }));

    const result = await registeredTools[0]!.execute("search", { query: "ambient" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Search failed");
    expect(result.details).toMatchObject({
      status: "error",
      toolName: "browser_search",
      profileMode: "isolated",
      runtime: "chrome",
      query: "ambient",
    });
  });

  it("returns browser user-action results through the injected formatter", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();

    registerBrowserSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserSearch: async () => action,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("search", { query: "captcha query" });

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_search",
      profileMode: "isolated",
      userAction: action,
    });
  });

  it("preserves explicit workflow user-action handoff mode", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserSearch = vi.fn(async () => []);

    registerBrowserSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ browserSearch }));

    await registeredTools[0]!.execute("search", {
      query: "captcha query",
      waitForUserAction: false,
    });

    expect(browserSearch).toHaveBeenCalledWith(expect.objectContaining({
      waitForUserAction: false,
    }));
  });

  it("requires a non-empty query before preparing a browser profile", async () => {
    const registeredTools: RegisteredTool[] = [];
    const prepareBrowserToolProfile = vi.fn();

    registerBrowserSearchTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ prepareBrowserToolProfile }));

    await expect(registeredTools[0]!.execute("search", { query: " " })).rejects.toThrow("query is required.");
    expect(prepareBrowserToolProfile).not.toHaveBeenCalled();
  });
});

function options(
  overrides: Partial<BrowserSearchToolRegistrationOptions> = {},
): BrowserSearchToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserSearch: async () => [],
    emitBrowserState: async () => undefined,
    recordBrowserSearchAudit: () => undefined,
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    formatBrowserUserAction: () => "Browser needs action.",
    ...overrides,
  };
}

function browserResult(overrides: Partial<BrowserSearchResult> = {}): BrowserSearchResult {
  return {
    title: "Browser result",
    url: "https://example.test/result",
    snippet: "A browser search result.",
    ...overrides,
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
