import { describe, expect, it, vi } from "vitest";

import type {
  BrowserPickResult,
  BrowserUserActionState,
} from "../../../shared/types";
import { BrowserUnavailableError } from "../../browserService";
import {
  browserPickText,
  registerBrowserPickTool,
  type BrowserPickToolRegistrationOptions,
} from "./agentRuntimeBrowserPickTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserPickTools", () => {
  it("registers browser_pick and returns selected element details", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const resultFixture = browserPick();
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const browserPickFn = vi.fn(async () => resultFixture);
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserPickAudit = vi.fn();

    registerBrowserPickTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      prepareBrowserToolProfile,
      browserPick: browserPickFn,
      emitBrowserState,
      recordBrowserPickAudit,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_pick"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const input = {
      prompt: "Pick the submit button",
      profileMode: "isolated",
    };
    const result = await registeredTools[0]!.execute("pick", input, undefined, (update: any) => updates.push(update));

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith(input, "thread-1", expect.any(Function));
    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "Waiting for browser element selection: Pick the submit button" }],
      details: {
        runtime: "ambient-browser",
        toolName: "browser_pick",
        status: "running",
      },
    });
    expect(browserPickFn).toHaveBeenCalledWith({
      prompt: "Pick the submit button",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(emitBrowserState).toHaveBeenCalledTimes(2);
    expect(recordBrowserPickAudit).toHaveBeenCalledWith({
      profileMode: "isolated",
      detail: "https://example.test\nPick the submit button",
    });
    expect(result.content[0].text).toBe(browserPickText(resultFixture));
    expect(result.details).toMatchObject({
      toolName: "browser_pick",
      profileMode: "isolated",
      runtime: "chrome",
      url: "https://example.test",
      selections: resultFixture.selections,
    });
  });

  it("returns browser unavailable fallback without recording an audit", async () => {
    const registeredTools: RegisteredTool[] = [];
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserPickAudit = vi.fn();

    registerBrowserPickTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserPick: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      emitBrowserState,
      recordBrowserPickAudit,
    }));

    const result = await registeredTools[0]!.execute("pick", { prompt: "Pick submit" });

    expect(result.content[0].text).toContain("Browser unavailable.");
    expect(result.content[0].text).toContain("Chrome missing");
    expect(result.details).toMatchObject({
      toolName: "browser_pick",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(emitBrowserState).toHaveBeenCalledTimes(2);
    expect(recordBrowserPickAudit).not.toHaveBeenCalled();
  });

  it("returns browser user-action results through the injected formatter", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();

    registerBrowserPickTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserPick: async () => action,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("pick", { prompt: "Pick submit" });

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_pick",
      profileMode: "isolated",
      userAction: action,
    });
  });

  it("propagates non-browser pick errors like the inline runtime path", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerBrowserPickTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserPick: async () => {
        throw new Error("Pick failed");
      },
    }));

    await expect(registeredTools[0]!.execute("pick", { prompt: "Pick submit" })).rejects.toThrow("Pick failed");
  });

  it("requires a non-empty prompt before preparing a browser profile", async () => {
    const registeredTools: RegisteredTool[] = [];
    const prepareBrowserToolProfile = vi.fn();

    registerBrowserPickTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ prepareBrowserToolProfile }));

    await expect(registeredTools[0]!.execute("pick", { prompt: " " })).rejects.toThrow("prompt is required.");
    expect(prepareBrowserToolProfile).not.toHaveBeenCalled();
  });

  it("formats selected and canceled pick results like the inline helper", () => {
    expect(browserPickText(browserPick())).toBe([
      "Browser picker sent 1 selected element(s) to Ambient.",
      "Title: Example",
      "URL: https://example.test",
      "Prompt: Pick the submit button",
      "",
      "1. BUTTON button.primary",
      "Text: Submit",
      "Candidates: button.primary, #submit",
      "Bounds: 10,20 120x32",
      "HTML: <button class=\"primary\">Submit</button>",
    ].join("\n"));
    expect(browserPickText(browserPick({
      canceled: true,
      selections: [],
    }))).toBe("Browser picker canceled.\nPrompt: Pick the submit button");
  });
});

function options(
  overrides: Partial<BrowserPickToolRegistrationOptions> = {},
): BrowserPickToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserPick: async () => browserPick(),
    emitBrowserState: async () => undefined,
    recordBrowserPickAudit: () => undefined,
    formatBrowserUserAction: () => "Browser needs action.",
    ...overrides,
  };
}

function browserPick(overrides: Partial<BrowserPickResult> = {}): BrowserPickResult {
  return {
    canceled: false,
    prompt: "Pick the submit button",
    title: "Example",
    url: "https://example.test",
    selections: [{
      selector: "button.primary",
      candidates: ["button.primary", "#submit"],
      tagName: "BUTTON",
      text: "Submit",
      html: "<button class=\"primary\">Submit</button>",
      boundingBox: {
        x: 10,
        y: 20,
        width: 120,
        height: 32,
      },
    }],
    ...overrides,
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "browser-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "browser_pick",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Complete the CAPTCHA.",
    startedAt: "2026-06-10T00:00:00.000Z",
    lastCheckedAt: "2026-06-10T00:00:00.000Z",
    canAutoResume: false,
  };
}
