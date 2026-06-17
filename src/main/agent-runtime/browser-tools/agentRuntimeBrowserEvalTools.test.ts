import { describe, expect, it, vi } from "vitest";

import type { BrowserUserActionState } from "../../../shared/types";
import { BrowserUnavailableError } from "../../browserService";
import {
  formatBrowserEvalValue,
  registerBrowserEvalTool,
  type BrowserEvalToolRegistrationOptions,
} from "./agentRuntimeBrowserEvalTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserEvalTools", () => {
  it("registers browser_eval and materializes successful evaluation output", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const evalResult = { title: "Fixture", count: 2 };
    const toolLongformInputPreview = { inputPath: ".ambient/longform/browser-eval.json" } as any;
    const materializedResult = {
      content: [{ type: "text" as const, text: "materialized eval output" }],
      details: { runtime: "ambient-browser", toolName: "browser_eval", materialized: true },
    };
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const browserEvaluate = vi.fn(async (input: any) => {
      input.onActivity?.("Browser evaluation produced a value.");
      return evalResult;
    });
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserEvalAudit = vi.fn();
    const withBrowserToolHeartbeat = vi.fn(async (_toolName: string, _message: string, operation: any, _onUpdate: any, _options: any) =>
      operation(() => undefined),
    );
    const buildToolLongformInputPreview = vi.fn(() => toolLongformInputPreview);
    const materializeBrowserToolResult = vi.fn(async () => materializedResult);

    registerBrowserEvalTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      prepareBrowserToolProfile,
      browserEvaluate,
      emitBrowserState,
      recordBrowserEvalAudit,
      withBrowserToolHeartbeat,
      buildToolLongformInputPreview,
      materializeBrowserToolResult: materializeBrowserToolResult as any,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_eval"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const input = { code: "return { title: document.title, count: 2 };" };
    const result = await registeredTools[0]!.execute("eval", input, signal, (update: any) => updates.push(update));

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith(input, "thread-1", expect.any(Function));
    expect(buildToolLongformInputPreview).toHaveBeenCalledWith("browser_eval", input);
    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "Evaluating JavaScript in the active browser page." }],
      details: {
        runtime: "ambient-browser",
        toolName: "browser_eval",
        status: "running",
        toolLongformInputPreview,
      },
    });
    expect(withBrowserToolHeartbeat).toHaveBeenCalledWith(
      "browser_eval",
      "Browser JavaScript evaluation is still running.",
      expect.any(Function),
      expect.any(Function),
      { signal },
    );
    expect(browserEvaluate).toHaveBeenCalledWith(expect.objectContaining({
      code: input.code,
      profileMode: "isolated",
      runtime: "chrome",
      onActivity: expect.any(Function),
    }));
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(recordBrowserEvalAudit).toHaveBeenCalledWith({ profileMode: "isolated", code: input.code });
    expect(materializeBrowserToolResult).toHaveBeenCalledWith(
      "/workspace",
      "browser-eval",
      "browser eval output",
      formatBrowserEvalValue(evalResult),
      {
        toolName: "browser_eval",
        profileMode: "isolated",
        runtime: "chrome",
        toolLongformInputPreview,
      },
    );
    expect(result).toBe(materializedResult);
  });

  it("returns browser unavailable fallback without recording an audit", async () => {
    const registeredTools: RegisteredTool[] = [];
    const recordBrowserEvalAudit = vi.fn();

    registerBrowserEvalTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserEvaluate: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      recordBrowserEvalAudit,
    }));

    const result = await registeredTools[0]!.execute("eval", { code: "return document.title;" });

    expect(result.content[0].text).toContain("Browser unavailable.");
    expect(result.content[0].text).toContain("Chrome missing");
    expect(result.details).toMatchObject({
      toolName: "browser_eval",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(recordBrowserEvalAudit).not.toHaveBeenCalled();
  });

  it("returns browser user-action results through the injected formatter", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();

    registerBrowserEvalTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserEvaluate: async () => action,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("eval", { code: "return document.title;" });

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_eval",
      profileMode: "isolated",
      userAction: action,
    });
  });

  it("propagates non-browser recoverable evaluation errors like the inline runtime path", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerBrowserEvalTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserEvaluate: async () => {
        throw new Error("Eval failed");
      },
    }));

    await expect(registeredTools[0]!.execute("eval", { code: "return document.title;" })).rejects.toThrow("Eval failed");
  });

  it("requires a non-empty code string before preparing a browser profile", async () => {
    const registeredTools: RegisteredTool[] = [];
    const prepareBrowserToolProfile = vi.fn();

    registerBrowserEvalTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ prepareBrowserToolProfile }));

    await expect(registeredTools[0]!.execute("eval", { code: " " })).rejects.toThrow("code is required.");
    expect(prepareBrowserToolProfile).not.toHaveBeenCalled();
  });

  it("formats primitive and structured eval values like the inline helper", () => {
    expect(formatBrowserEvalValue("plain text")).toBe("plain text");
    expect(formatBrowserEvalValue({ a: 1 })).toBe("{\n  \"a\": 1\n}");
    expect(formatBrowserEvalValue(undefined)).toBe("undefined");
  });
});

function options(
  overrides: Partial<BrowserEvalToolRegistrationOptions> = {},
): BrowserEvalToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserEvaluate: async () => undefined,
    emitBrowserState: async () => undefined,
    recordBrowserEvalAudit: () => undefined,
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    formatBrowserUserAction: () => "Browser needs action.",
    ...overrides,
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "browser-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "browser_eval",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Complete the CAPTCHA.",
    startedAt: "2026-06-10T00:00:00.000Z",
    lastCheckedAt: "2026-06-10T00:00:00.000Z",
    canAutoResume: false,
  };
}
