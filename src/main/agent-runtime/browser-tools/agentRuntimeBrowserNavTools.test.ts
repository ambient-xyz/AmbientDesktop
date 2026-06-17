import { describe, expect, it, vi } from "vitest";

import type {
  BrowserPageContent,
  BrowserUserActionState,
} from "../../../shared/types";
import type { MaterializedTextOutput } from "../../toolOutputArtifacts";
import { BrowserUnavailableError } from "../../browserService";
import {
  registerBrowserNavTool,
  type BrowserNavToolRegistrationOptions,
} from "./agentRuntimeBrowserNavTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserNavTools", () => {
  it("registers browser_nav and returns materialized page content", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const content = browserContent({ url: "https://example.test/final" });
    const textOutput = textOutputFixture("Materialized page text.");
    const materializedContent = { ...content, text: "Materialized page text.", textOutput };
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const browserNavigate = vi.fn(async (input: any) => {
      input.onActivity?.("Browser navigation reached DOM content.");
      return content;
    });
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserNavAudit = vi.fn();
    const withBrowserToolHeartbeat = vi.fn(async (_toolName: string, _message: string, operation: any, _onUpdate: any, _options: any) =>
      operation(() => undefined),
    );
    const materializeBrowserPageContent = vi.fn(async () => materializedContent);
    const formatBrowserContent = vi.fn(() => "formatted browser page");

    registerBrowserNavTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      prepareBrowserToolProfile,
      browserNavigate,
      emitBrowserState,
      recordBrowserNavAudit,
      withBrowserToolHeartbeat,
      materializeBrowserPageContent,
      formatBrowserContent,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_nav"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("nav", {
      url: "https://example.test/start",
      newTab: true,
    }, signal, (update: any) => updates.push(update));

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.test/start" }), "thread-1", expect.any(Function));
    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "Navigating to https://example.test/start." }],
      details: {
        runtime: "ambient-browser",
        toolName: "browser_nav",
        status: "running",
      },
    });
    expect(withBrowserToolHeartbeat).toHaveBeenCalledWith(
      "browser_nav",
      "Browser navigation is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
      expect.any(Function),
      expect.any(Function),
      { signal },
    );
    expect(browserNavigate).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://example.test/start",
      newTab: true,
      profileMode: "isolated",
      runtime: "chrome",
      waitForUserAction: true,
      sourceThreadId: "thread-1",
      onActivity: expect.any(Function),
    }));
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(recordBrowserNavAudit).toHaveBeenCalledWith({ profileMode: "isolated", url: "https://example.test/final" });
    expect(materializeBrowserPageContent).toHaveBeenCalledWith("/workspace", "browser-nav", content);
    expect(formatBrowserContent).toHaveBeenCalledWith(materializedContent);
    expect(result).toEqual({
      content: [{ type: "text", text: "formatted browser page" }],
      details: {
        toolName: "browser_nav",
        profileMode: "isolated",
        runtime: "chrome",
        url: "https://example.test/final",
        textOutput,
      },
    });
  });

  it("returns browser unavailable fallback without recording an audit", async () => {
    const registeredTools: RegisteredTool[] = [];
    const recordBrowserNavAudit = vi.fn();

    registerBrowserNavTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserNavigate: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      recordBrowserNavAudit,
    }));

    const result = await registeredTools[0]!.execute("nav", { url: "https://example.test" });

    expect(result.content[0].text).toContain("Browser unavailable.");
    expect(result.content[0].text).toContain("Chrome missing");
    expect(result.details).toMatchObject({
      toolName: "browser_nav",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(recordBrowserNavAudit).not.toHaveBeenCalled();
  });

  it("returns recoverable browser navigation errors as tool errors", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerBrowserNavTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserNavigate: async () => {
        throw new Error("Navigation failed");
      },
    }));

    const result = await registeredTools[0]!.execute("nav", { url: "https://example.test" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Navigation failed");
    expect(result.details).toMatchObject({
      status: "error",
      toolName: "browser_nav",
      profileMode: "isolated",
      runtime: "chrome",
      url: "https://example.test",
    });
  });

  it("returns browser user-action results through the injected formatter", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();

    registerBrowserNavTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserNavigate: async () => action,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("nav", { url: "https://captcha.example.test" });

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_nav",
      profileMode: "isolated",
      userAction: action,
    });
  });

  it("preserves explicit workflow user-action handoff mode", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserNavigate = vi.fn(async () => browserContent());

    registerBrowserNavTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ browserNavigate }));

    await registeredTools[0]!.execute("nav", {
      url: "https://captcha.example.test",
      waitForUserAction: false,
    });

    expect(browserNavigate).toHaveBeenCalledWith(expect.objectContaining({
      waitForUserAction: false,
    }));
  });

  it("requires a non-empty url before preparing a browser profile", async () => {
    const registeredTools: RegisteredTool[] = [];
    const prepareBrowserToolProfile = vi.fn();

    registerBrowserNavTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ prepareBrowserToolProfile }));

    await expect(registeredTools[0]!.execute("nav", { url: " " })).rejects.toThrow("url is required.");
    expect(prepareBrowserToolProfile).not.toHaveBeenCalled();
  });
});

function options(
  overrides: Partial<BrowserNavToolRegistrationOptions> = {},
): BrowserNavToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserNavigate: async () => browserContent(),
    emitBrowserState: async () => undefined,
    recordBrowserNavAudit: () => undefined,
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    formatBrowserUserAction: () => "Browser needs action.",
    materializeBrowserPageContent: async (_workspacePath, _label, content) => content,
    formatBrowserContent: (content) => content.text,
    ...overrides,
  };
}

function browserContent(overrides: Partial<BrowserPageContent> = {}): BrowserPageContent {
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
    toolName: "browser_nav",
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
