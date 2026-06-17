import { describe, expect, it, vi } from "vitest";

import type {
  BrowserKeypressResult,
  BrowserUserActionState,
} from "../../../shared/types";
import { BrowserUnavailableError } from "../../browser/browserService";
import {
  browserKeypressSummary,
  browserKeypressText,
  registerBrowserKeypressTool,
  type BrowserKeypressToolRegistrationOptions,
} from "./agentRuntimeBrowserKeypressTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserKeypressTools", () => {
  it("registers browser_keypress and returns dispatched keypress details", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const keypress = browserKeypress();
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const browserKeypressFn = vi.fn(async () => keypress);
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserKeypressAudit = vi.fn();
    const withBrowserToolHeartbeat = vi.fn(async (_toolName: string, _message: string, operation: any, _onUpdate: any, _options: any) =>
      operation(() => undefined),
    );

    registerBrowserKeypressTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      prepareBrowserToolProfile,
      browserKeypress: browserKeypressFn,
      emitBrowserState,
      recordBrowserKeypressAudit,
      withBrowserToolHeartbeat,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_keypress"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const input = {
      keys: [{ key: "Enter", code: "Enter", durationMs: 12 }],
      focus: "#search",
      profileMode: "isolated",
    };
    const result = await registeredTools[0]!.execute("keypress", input, signal, (update: any) => updates.push(update));

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith(input, "thread-1", expect.any(Function));
    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "Dispatching keyboard input to the active browser page." }],
      details: {
        runtime: "ambient-browser",
        toolName: "browser_keypress",
        status: "running",
      },
    });
    expect(withBrowserToolHeartbeat).toHaveBeenCalledWith(
      "browser_keypress",
      "Browser keyboard input is still running.",
      expect.any(Function),
      expect.any(Function),
      { signal },
    );
    expect(browserKeypressFn).toHaveBeenCalledWith({
      keys: input.keys,
      focus: "#search",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(recordBrowserKeypressAudit).toHaveBeenCalledWith({
      profileMode: "isolated",
      detail: `https://example.test\n${browserKeypressSummary(keypress)}`,
    });
    expect(result.content[0].text).toBe(browserKeypressText(keypress));
    expect(result.details).toMatchObject({
      toolName: "browser_keypress",
      profileMode: "isolated",
      runtime: "chrome",
      url: "https://example.test",
      dispatchedCount: 1,
    });
  });

  it("passes an empty key list through when keys is not an array", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserKeypressFn = vi.fn(async () => browserKeypress());

    registerBrowserKeypressTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ browserKeypress: browserKeypressFn }));

    await registeredTools[0]!.execute("keypress", { keys: "Enter" });

    expect(browserKeypressFn).toHaveBeenCalledWith(expect.objectContaining({
      keys: [],
    }));
  });

  it("returns browser unavailable fallback without recording an audit", async () => {
    const registeredTools: RegisteredTool[] = [];
    const recordBrowserKeypressAudit = vi.fn();

    registerBrowserKeypressTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserKeypress: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      recordBrowserKeypressAudit,
    }));

    const result = await registeredTools[0]!.execute("keypress", { keys: [{ key: "A", code: "KeyA" }] });

    expect(result.content[0].text).toContain("Browser unavailable.");
    expect(result.content[0].text).toContain("Chrome missing");
    expect(result.details).toMatchObject({
      toolName: "browser_keypress",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(recordBrowserKeypressAudit).not.toHaveBeenCalled();
  });

  it("returns browser user-action results through the injected formatter", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();

    registerBrowserKeypressTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserKeypress: async () => action,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("keypress", { keys: [{ key: "A", code: "KeyA" }] });

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_keypress",
      profileMode: "isolated",
      userAction: action,
    });
  });

  it("propagates non-browser keypress errors like the inline runtime path", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerBrowserKeypressTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserKeypress: async () => {
        throw new Error("Keypress failed");
      },
    }));

    await expect(registeredTools[0]!.execute("keypress", { keys: [{ key: "A", code: "KeyA" }] })).rejects.toThrow("Keypress failed");
  });

  it("formats keypress text and fallback focus like the inline helper", () => {
    const keypress = browserKeypress({
      keys: [
        { key: " ", code: "", durationMs: 8 },
        { key: "A", code: "KeyA", durationMs: 8 },
      ],
      focus: {
        requested: "#missing",
        found: false,
      },
      title: undefined,
      url: undefined,
    });

    expect(browserKeypressSummary(keypress)).toBe("Space, KeyA");
    expect(browserKeypressText(keypress)).toBe([
      "Browser keypress dispatched.",
      "Keys: Space, KeyA",
      "Focus: #missing (fallback) -> page",
      "Capture a screenshot or inspect browser state before claiming the interaction worked.",
    ].join("\n"));
  });
});

function options(
  overrides: Partial<BrowserKeypressToolRegistrationOptions> = {},
): BrowserKeypressToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserKeypress: async () => browserKeypress(),
    emitBrowserState: async () => undefined,
    recordBrowserKeypressAudit: () => undefined,
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    formatBrowserUserAction: () => "Browser needs action.",
    ...overrides,
  };
}

function browserKeypress(overrides: Partial<BrowserKeypressResult> = {}): BrowserKeypressResult {
  return {
    dispatchedCount: 1,
    keys: [{ key: "Enter", code: "Enter", durationMs: 12 }],
    focus: {
      requested: "#search",
      found: true,
      tagName: "INPUT",
      id: "search",
      className: "search active",
    },
    title: "Example",
    url: "https://example.test",
    ...overrides,
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "browser-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "browser_keypress",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Complete the CAPTCHA.",
    startedAt: "2026-06-10T00:00:00.000Z",
    lastCheckedAt: "2026-06-10T00:00:00.000Z",
    canAutoResume: false,
  };
}
