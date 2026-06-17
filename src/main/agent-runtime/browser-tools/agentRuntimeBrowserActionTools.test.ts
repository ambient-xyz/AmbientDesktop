import { describe, expect, it, vi } from "vitest";

import {
  registerBrowserActionTools,
  type BrowserActionToolRegistrationOptions,
} from "./agentRuntimeBrowserActionTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserActionTools", () => {
  it("registers action tools and clicks through the active browser page", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "internal" as const }));
    const browserEvaluate = vi.fn(async () => ({
      ok: true,
      title: "Calculator",
      url: "http://127.0.0.1:4100/index.html",
      element: { tagName: "BUTTON", id: "digit-7", text: "7" },
    }));
    const recordBrowserActionAudit = vi.fn();

    registerBrowserActionTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      prepareBrowserToolProfile,
      browserEvaluate,
      recordBrowserActionAudit,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "browser_click",
      "browser_get_value",
      "browser_wait_for",
      "browser_assert",
    ]);

    const result = await registeredTools[0]!.execute("click-1", { text: "7" }, undefined, (update: any) => updates.push(update));

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith({ allowInternalRuntime: true, text: "7" }, "thread-1", expect.any(Function));
    expect(browserEvaluate).toHaveBeenCalledWith(expect.objectContaining({
      profileMode: "isolated",
      runtime: "internal",
      code: expect.stringContaining("browser_click"),
      onActivity: expect.any(Function),
    }));
    expect(recordBrowserActionAudit).toHaveBeenCalledWith({
      toolName: "browser_click",
      profileMode: "isolated",
      detail: expect.stringContaining("text \"7\""),
    });
    expect(updates[0].content[0].text).toContain("Clicking text \"7\"");
    expect(result.content[0].text).toContain("Browser click completed.");
    expect(result.details).toMatchObject({
      toolName: "browser_click",
      profileMode: "isolated",
      runtime: "internal",
      ok: true,
    });
  });

  it("returns concise repair guidance when code is sent to a browser action tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserEvaluate = vi.fn();

    registerBrowserActionTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserEvaluate,
    }));

    const result = await registeredTools[0]!.execute("click-1", { code: "document.querySelector('#btn-4').click()" });

    expect(browserEvaluate).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("browser_click does not accept or execute JavaScript code.");
    expect(result.content[0].text).toContain("Use browser_eval only when you intentionally need JavaScript evaluation.");
    expect(result.details).toMatchObject({
      toolName: "browser_click",
      status: "error",
    });
  });

  it("rejects browser clicks without a selector or text target", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserEvaluate = vi.fn();

    registerBrowserActionTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserEvaluate,
    }));

    const result = await registeredTools[0]!.execute("click-1", {});

    expect(browserEvaluate).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("browser_click requires selector or text.");
    expect(result.details).toMatchObject({
      toolName: "browser_click",
      status: "error",
    });
  });

  it("treats selector plus text as a scoped text target", async () => {
    const registeredTools: RegisteredTool[] = [];
    const browserEvaluate = vi.fn(async () => ({
      ok: true,
      title: "Calculator",
      url: "http://127.0.0.1:4100/index.html",
      element: { tagName: "BUTTON", text: "2" },
    }));
    const recordBrowserActionAudit = vi.fn();

    registerBrowserActionTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserEvaluate,
      recordBrowserActionAudit,
    }));

    const result = await registeredTools[0]!.execute("click-1", { selector: "button", text: "2" });

    expect(browserEvaluate).toHaveBeenCalledWith(expect.objectContaining({
      code: expect.stringContaining("findBySelectorAndText(selector, text)"),
    }));
    expect(recordBrowserActionAudit).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.stringContaining("selector \"button\" with text \"2\""),
    }));
    expect(result.content[0].text).toContain("Element: button \"2\"");
  });
});

function options(overrides: Partial<BrowserActionToolRegistrationOptions> = {}): BrowserActionToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserEvaluate: async () => ({ ok: true }),
    emitBrowserState: async () => undefined,
    recordBrowserActionAudit: () => undefined,
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    formatBrowserUserAction: () => "Browser needs action.",
    ...overrides,
  };
}
