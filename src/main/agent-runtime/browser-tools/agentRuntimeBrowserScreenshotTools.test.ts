import { describe, expect, it, vi } from "vitest";

import type {
  BrowserScreenshotResult,
  BrowserUserActionState,
} from "../../../shared/types";
import { AMBIENT_TOOL_CALL, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_SEARCH } from "../../ambient/ambientToolRouter";
import { BrowserUnavailableError } from "../../browser/browserService";
import {
  browserScreenshotMediaArtifact,
  browserScreenshotVisualAnalysisAvailability,
  registerBrowserScreenshotTool,
  type BrowserScreenshotToolRegistrationOptions,
} from "./agentRuntimeBrowserScreenshotTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeBrowserScreenshotTools", () => {
  it("registers browser_screenshot and returns visual evidence metadata", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const screenshot = browserScreenshot({
      runtime: "chrome",
      targetId: "target-1",
      statePreserved: true,
      sameTargetAsLastBrowserAction: true,
      freshLoad: false,
    });
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const browserScreenshotFn = vi.fn(async (input: any) => {
      input.onActivity?.("Browser screenshot pixels captured.");
      return screenshot;
    });
    const emitBrowserState = vi.fn(async () => undefined);
    const recordBrowserScreenshotAudit = vi.fn();
    const recordBrowserScreenshotArtifact = vi.fn();
    const withBrowserToolHeartbeat = vi.fn(async (_toolName: string, _message: string, operation: any, _onUpdate: any, _options: any) =>
      operation(() => undefined),
    );

    registerBrowserScreenshotTool(pi(registeredTools, {
      activeTools: ["browser_screenshot", "ambient_visual_analyze"],
      allTools: ["browser_screenshot", "ambient_visual_analyze"],
    }), options({
      prepareBrowserToolProfile,
      browserScreenshot: browserScreenshotFn,
      emitBrowserState,
      recordBrowserScreenshotAudit,
      recordBrowserScreenshotArtifact,
      withBrowserToolHeartbeat,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["browser_screenshot"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("screenshot", {
      profileMode: "isolated",
    }, signal, (update: any) => updates.push(update));

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith(expect.objectContaining({
      profileMode: "isolated",
    }), "thread-1", expect.any(Function));
    expect((prepareBrowserToolProfile.mock.calls as any)[0]?.[0]).not.toHaveProperty("allowInternalRuntime");
    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "Capturing browser screenshot." }],
      details: {
        runtime: "ambient-browser",
        toolName: "browser_screenshot",
        status: "running",
      },
    });
    expect(withBrowserToolHeartbeat).toHaveBeenCalledWith(
      "browser_screenshot",
      "Browser screenshot capture is still running.",
      expect.any(Function),
      expect.any(Function),
      { signal },
    );
    expect(browserScreenshotFn).toHaveBeenCalledWith(expect.objectContaining({
      profileMode: "isolated",
      runtime: "chrome",
      artifactWorkspacePath: "/workspace",
      onActivity: expect.any(Function),
    }));
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(recordBrowserScreenshotAudit).toHaveBeenCalledWith({
      profileMode: "isolated",
      detail: "https://example.test",
    });
    expect(recordBrowserScreenshotArtifact).toHaveBeenCalledWith({
      artifactRef: "latest_browser_screenshot",
      artifactPath: ".ambient-codex/browser/screenshots/current.png",
      path: "/workspace/.ambient-codex/browser/screenshots/current.png",
      title: "Example",
      url: "https://example.test",
      width: 1280,
      height: 720,
      bytes: 12345,
      runtime: "chrome",
      targetId: "target-1",
      statePreserved: true,
      sameTargetAsLastBrowserAction: true,
      freshLoad: false,
    });
    expect(result.content[0].text).toContain("Browser screenshot captured.");
    expect(result.content[0].text).toContain("Runtime: chrome");
    expect(result.content[0].text).toContain("Target: target-1");
    expect(result.content[0].text).toContain("State preserved: yes");
    expect(result.content[0].text).toContain("Same target as previous browser action: yes");
    expect(result.content[0].text).toContain("Fresh page load: no");
    expect(result.content[0].text).toContain("Artifact: .ambient-codex/browser/screenshots/current.png");
    expect(result.content[0].text).toContain("media notice: .ambient-codex/browser/screenshots/current.png");
    expect(result.content[0].text).toContain("Visual evidence status: screenshot pixels have not been inspected by the model.");
    expect(result.content[0].text).toContain("call ambient_visual_analyze");
    expect(result.content[0].text).toContain("\"browserScreenshot\":{\"ref\":\"latest\"");
    expect(result.details).toMatchObject({
      toolName: "browser_screenshot",
      profileMode: "isolated",
      runtime: "chrome",
      path: "/workspace/.ambient-codex/browser/screenshots/current.png",
      artifactPath: ".ambient-codex/browser/screenshots/current.png",
      targetId: "target-1",
      statePreserved: true,
      sameTargetAsLastBrowserAction: true,
      freshLoad: false,
      mediaArtifact: browserScreenshotMediaArtifact(screenshot),
      visualEvidence: {
        inspected: false,
        analyzer: "direct",
        artifactRef: "latest_browser_screenshot",
        analyzeInput: {
          browserScreenshot: {
            ref: "latest",
            artifactRef: "latest_browser_screenshot",
            label: "browser screenshot",
          },
          task: "ui_review",
        },
      },
    });
  });

  it("does not opt screenshot into internal preview runtime reuse", async () => {
    const registeredTools: RegisteredTool[] = [];
    const prepareBrowserToolProfile = vi.fn(async () => ({ profileMode: "isolated" as const, runtime: "chrome" as const }));
    const browserScreenshotFn = vi.fn(async () => browserScreenshot({
      title: "Calculator",
      url: "http://127.0.0.1:51234/calculator.html",
    }));

    registerBrowserScreenshotTool(pi(registeredTools), options({
      prepareBrowserToolProfile,
      browserScreenshot: browserScreenshotFn,
    }));

    const result = await registeredTools[0]!.execute("screenshot", {});

    expect(prepareBrowserToolProfile).toHaveBeenCalledWith({}, "thread-1", undefined);
    expect(browserScreenshotFn).toHaveBeenCalledWith(expect.objectContaining({
      profileMode: "isolated",
      runtime: "chrome",
      artifactWorkspacePath: "/workspace",
    }));
    expect(result.details).toMatchObject({
      toolName: "browser_screenshot",
      profileMode: "isolated",
      runtime: "chrome",
      title: "Calculator",
      url: "http://127.0.0.1:51234/calculator.html",
    });
  });

  it("returns browser unavailable fallback without recording an audit", async () => {
    const registeredTools: RegisteredTool[] = [];
    const recordBrowserScreenshotAudit = vi.fn();

    registerBrowserScreenshotTool(pi(registeredTools), options({
      browserScreenshot: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      recordBrowserScreenshotAudit,
    }));

    const result = await registeredTools[0]!.execute("screenshot", {});

    expect(result.content[0].text).toContain("Browser unavailable.");
    expect(result.content[0].text).toContain("Chrome missing");
    expect(result.details).toMatchObject({
      toolName: "browser_screenshot",
      profileMode: "isolated",
      runtime: "chrome",
    });
    expect(recordBrowserScreenshotAudit).not.toHaveBeenCalled();
  });

  it("returns browser user-action results through the injected formatter", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();

    registerBrowserScreenshotTool(pi(registeredTools), options({
      browserScreenshot: async () => action,
      formatBrowserUserAction: () => "Browser needs action.",
    }));

    const result = await registeredTools[0]!.execute("screenshot", {});

    expect(result.content[0].text).toBe("Browser needs action.");
    expect(result.details).toMatchObject({
      toolName: "browser_screenshot",
      profileMode: "isolated",
      userAction: action,
    });
  });

  it("propagates non-browser recoverable screenshot errors like the inline runtime path", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerBrowserScreenshotTool(pi(registeredTools), options({
      browserScreenshot: async () => {
        throw new Error("Screenshot failed");
      },
    }));

    await expect(registeredTools[0]!.execute("screenshot", {})).rejects.toThrow("Screenshot failed");
  });

  it("classifies visual analysis availability from active and registered tools", () => {
    expect(browserScreenshotVisualAnalysisAvailability(pi([], {
      activeTools: ["browser_screenshot", "ambient_visual_analyze"],
      allTools: ["browser_screenshot", "ambient_visual_analyze"],
    }))).toBe("direct");
    expect(browserScreenshotVisualAnalysisAvailability(pi([], {
      activeTools: ["browser_screenshot", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      allTools: ["browser_screenshot", "ambient_visual_analyze"],
    }))).toBe("routed");
    expect(browserScreenshotVisualAnalysisAvailability(pi([], {
      activeTools: ["browser_screenshot"],
      allTools: ["browser_screenshot", "ambient_visual_analyze"],
    }))).toBe("registered-inactive");
    expect(browserScreenshotVisualAnalysisAvailability(pi([], {
      activeTools: ["browser_screenshot"],
      allTools: ["browser_screenshot"],
    }))).toBe("unavailable");
  });
});

function options(
  overrides: Partial<BrowserScreenshotToolRegistrationOptions> = {},
): BrowserScreenshotToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    prepareBrowserToolProfile: async () => ({ profileMode: "isolated", runtime: "chrome" }),
    browserScreenshot: async () => browserScreenshot(),
    emitBrowserState: async () => undefined,
    recordBrowserScreenshotAudit: () => undefined,
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    formatBrowserUserAction: () => "Browser needs action.",
    formatMediaArtifactNotice: (artifact) => `media notice: ${artifact.artifactPath}`,
    ...overrides,
  };
}

function pi(
  registeredTools: RegisteredTool[],
  tools: { activeTools?: string[]; allTools?: string[] } = {},
) {
  return {
    registerTool: (tool: any) => {
      registeredTools.push(tool);
    },
    getActiveTools: () => tools.activeTools ?? ["browser_screenshot"],
    getAllTools: () => (tools.allTools ?? ["browser_screenshot"]).map((name) => ({
      name,
      description: "",
      parameters: {} as any,
      sourceInfo: {} as any,
    })),
  };
}

function browserScreenshot(overrides: Partial<BrowserScreenshotResult> = {}): BrowserScreenshotResult {
  return {
    path: "/workspace/.ambient-codex/browser/screenshots/current.png",
    artifactPath: ".ambient-codex/browser/screenshots/current.png",
    title: "Example",
    url: "https://example.test",
    width: 1280,
    height: 720,
    bytes: 12345,
    mimeType: "image/png",
    ...overrides,
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "browser-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "browser_screenshot",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Complete the CAPTCHA.",
    startedAt: "2026-06-10T00:00:00.000Z",
    lastCheckedAt: "2026-06-10T00:00:00.000Z",
    canAutoResume: false,
  };
}
