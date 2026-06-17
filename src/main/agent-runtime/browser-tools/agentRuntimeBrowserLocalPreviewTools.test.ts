import { describe, expect, it, vi } from "vitest";

import type {
  BrowserPageContent,
  BrowserUserActionState,
} from "../../../shared/types";
import { BrowserUnavailableError } from "../../browserService";
import { localPreviewSummary, type LocalPreviewSession } from "../../localPreviewServer";
import type { MaterializedTextOutput } from "../../toolOutputArtifacts";
import {
  registerBrowserLocalPreviewTool,
  type BrowserLocalPreviewToolRegistrationOptions,
} from "./agentRuntimeBrowserLocalPreviewTools";

type RegisteredTool = { name: string; executionMode?: string; prepareArguments?: (input: unknown) => unknown; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserLocalPreviewTools", () => {
  it("registers browser_local_preview and returns materialized page content", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const preview = localPreview();
    const content = browserContent({ url: preview.url });
    const textOutput = textOutputFixture("Materialized preview page.");
    const materializedContent = { ...content, text: "Materialized preview page.", textOutput };
    const openLocalPreview = vi.fn(async () => preview);
    const browserNavigate = vi.fn(async (input: any) => {
      input.onActivity?.("Local preview loaded.");
      return content;
    });
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserLocalPreviewAudit = vi.fn();
    const withBrowserToolHeartbeat = vi.fn(async (_toolName: string, _message: string, operation: any, _onUpdate: any, _options: any) =>
      operation(() => undefined),
    );
    const materializeBrowserPageContent = vi.fn(async () => materializedContent);
    const formatBrowserContent = vi.fn(() => "formatted preview page");

    registerBrowserLocalPreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      openLocalPreview,
      browserNavigate,
      emitBrowserState,
      recordBrowserLocalPreviewAudit,
      withBrowserToolHeartbeat,
      materializeBrowserPageContent,
      formatBrowserContent,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_local_preview"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("local-preview", { path: "dist/index.html" }, signal, (update: any) => updates.push(update));

    expect(openLocalPreview).toHaveBeenCalledWith({ workspacePath: "/workspace", path: "dist/index.html" });
    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Starting managed local preview for dist/index.html." }],
        details: {
          runtime: "ambient-browser",
          toolName: "browser_local_preview",
          status: "running",
        },
      },
      {
        content: [{ type: "text", text: `Opening ${preview.url}.` }],
        details: {
          runtime: "ambient-browser",
          toolName: "browser_local_preview",
          status: "running",
        },
      },
    ]);
    expect(withBrowserToolHeartbeat).toHaveBeenCalledWith(
      "browser_local_preview",
      "Local preview navigation is still running. If the page is loading assets, Ambient is waiting for the browser to become readable.",
      expect.any(Function),
      expect.any(Function),
      { signal },
    );
    expect(browserNavigate).toHaveBeenCalledWith(expect.objectContaining({
      url: preview.url,
      profileMode: "isolated",
      runtime: "chrome",
      waitForUserAction: true,
      sourceThreadId: "thread-1",
      onActivity: expect.any(Function),
    }));
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(recordBrowserLocalPreviewAudit).toHaveBeenCalledWith({ url: preview.url });
    expect(materializeBrowserPageContent).toHaveBeenCalledWith("/workspace", "browser-local-preview", content);
    expect(formatBrowserContent).toHaveBeenCalledWith(materializedContent);
    expect(result).toEqual({
      content: [{ type: "text", text: `${localPreviewSummary(preview)}\n\nformatted preview page` }],
      details: {
        toolName: "browser_local_preview",
        profileMode: "isolated",
        runtime: "chrome",
        url: preview.url,
        path: preview.workspaceRelativeRequestedPath,
        previewSessionId: preview.id,
        activeTargetStatus: "loaded",
        preview,
        textOutput,
      },
    });
  });

  it("returns browser unavailable fallback without recording an audit", async () => {
    const registeredTools: RegisteredTool[] = [];
    const preview = localPreview();
    const recordBrowserLocalPreviewAudit = vi.fn();
    const materializeBrowserPageContent = vi.fn();

    registerBrowserLocalPreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      openLocalPreview: async () => preview,
      browserNavigate: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      recordBrowserLocalPreviewAudit,
      materializeBrowserPageContent: materializeBrowserPageContent as any,
    }));

    const result = await registeredTools[0]!.execute("local-preview", { path: "index.html" });

    expect(result.content[0].text).toContain("Browser unavailable.");
    expect(result.content[0].text).toContain("Chrome missing");
    expect(result.details).toMatchObject({
      toolName: "browser_local_preview",
      preview,
    });
    expect(recordBrowserLocalPreviewAudit).not.toHaveBeenCalled();
    expect(materializeBrowserPageContent).not.toHaveBeenCalled();
  });

  it("accepts filePath as a compatibility alias for path", async () => {
    const registeredTools: RegisteredTool[] = [];
    const openLocalPreview = vi.fn(async () => localPreview());

    registerBrowserLocalPreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ openLocalPreview }));

    const prepared = registeredTools[0]!.prepareArguments?.({ filePath: "dist/index.html" });
    await registeredTools[0]!.execute("local-preview", prepared);

    expect(prepared).toEqual({ path: "dist/index.html" });
    expect(openLocalPreview).toHaveBeenCalledWith({ workspacePath: "/workspace", path: "dist/index.html" });
  });

  it("returns recoverable navigation errors as tool errors", async () => {
    const registeredTools: RegisteredTool[] = [];
    const preview = localPreview();

    registerBrowserLocalPreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      openLocalPreview: async () => preview,
      browserNavigate: async () => {
        throw new Error("Navigation failed");
      },
    }));

    const result = await registeredTools[0]!.execute("local-preview", { path: "index.html" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Navigation failed");
    expect(result.details).toMatchObject({
      status: "error",
      toolName: "browser_local_preview",
      profileMode: "isolated",
      runtime: "chrome",
      url: preview.url,
      preview,
    });
  });

  it("returns browser user-action results through the injected formatter", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();

    registerBrowserLocalPreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserNavigate: async () => action,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("local-preview", { path: "index.html" });

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_local_preview",
      preview: localPreview(),
      userAction: action,
    });
  });

  it("requires a non-empty path before starting a local preview", async () => {
    const registeredTools: RegisteredTool[] = [];
    const openLocalPreview = vi.fn();

    registerBrowserLocalPreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ openLocalPreview }));

    await expect(registeredTools[0]!.execute("local-preview", { path: " " })).rejects.toThrow("path is required.");
    expect(openLocalPreview).not.toHaveBeenCalled();
  });

  it("propagates local preview server errors before browser navigation", async () => {
    const registeredTools: RegisteredTool[] = [];
    const withBrowserToolHeartbeat = vi.fn();
    const emitBrowserState = vi.fn();

    registerBrowserLocalPreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      openLocalPreview: async () => {
        throw new Error("Preview target missing");
      },
      withBrowserToolHeartbeat,
      emitBrowserState,
    }));

    await expect(registeredTools[0]!.execute("local-preview", { path: "missing.html" })).rejects.toThrow("Preview target missing");
    expect(withBrowserToolHeartbeat).not.toHaveBeenCalled();
    expect(emitBrowserState).not.toHaveBeenCalled();
  });
});

function options(
  overrides: Partial<BrowserLocalPreviewToolRegistrationOptions> = {},
): BrowserLocalPreviewToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    openLocalPreview: async () => localPreview(),
    browserNavigate: async () => browserContent(),
    emitBrowserState: async () => undefined,
    recordBrowserLocalPreviewAudit: () => undefined,
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    materializeBrowserPageContent: async (_workspacePath, _label, content) => content,
    formatBrowserContent: (content) => content.text,
    formatBrowserUserAction: () => "Browser needs action.",
    ...overrides,
  };
}

function localPreview(overrides: Partial<LocalPreviewSession> = {}): LocalPreviewSession {
  return {
    id: "preview-1",
    url: "http://127.0.0.1:4100/index.html",
    port: 4100,
    status: "started",
    rootPath: "/workspace/dist",
    requestedPath: "/workspace/dist/index.html",
    workspaceRelativeRoot: "dist",
    workspaceRelativeRequestedPath: "dist/index.html",
    expiresAt: "2026-06-10T00:10:00.000Z",
    ...overrides,
  };
}

function browserContent(overrides: Partial<BrowserPageContent> = {}): BrowserPageContent {
  return {
    title: "Example",
    url: "http://127.0.0.1:4100/index.html",
    text: "Preview page text.",
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
    toolName: "browser_local_preview",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Complete the browser action.",
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
