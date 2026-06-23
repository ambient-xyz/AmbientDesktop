import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JsonRpcWebSocketClient,
  type BrowserChromeTargetController,
} from "./browserChromeTargetController";
import { BrowserServiceWorkspaceRefreshController } from "./browserServiceWorkspaceRefreshController";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BrowserServiceWorkspaceRefreshController", () => {
  it("reloads matching Chrome workspace preview targets and records refreshed active tab state", async () => {
    const workspace = "/tmp/ambient-browser-refresh";
    const activeUrl = `file://${join(workspace, "app", "index.html")}`;
    const request = vi.fn(async () => ({}));
    const close = vi.fn();
    const connect = vi.spyOn(JsonRpcWebSocketClient, "connect").mockResolvedValue({
      request,
      close,
    } as unknown as JsonRpcWebSocketClient);
    const setLastActiveTab = vi.fn();
    const setLastActivity = vi.fn();
    const setLastError = vi.fn();
    const chromeTargets = {
      targets: vi.fn(async () => [
        {
          id: "active",
          type: "page",
          title: "Preview",
          url: activeUrl,
          webSocketDebuggerUrl: "ws://active",
        },
        {
          id: "external",
          type: "page",
          title: "External",
          url: "https://example.com/",
          webSocketDebuggerUrl: "ws://external",
        },
        {
          id: "no-debugger-url",
          type: "page",
          title: "No debugger",
          url: activeUrl,
        },
      ]),
    } as unknown as BrowserChromeTargetController;
    const controller = new BrowserServiceWorkspaceRefreshController({
      chromeTargets,
      isChromeRunning: () => true,
      getActiveTargetId: () => "active",
      setLastActiveTab,
      setLastActivity,
      setLastError,
    });

    await expect(controller.refreshWorkspaceArtifact({ workspacePath: workspace, changedPath: "app/main.js" })).resolves.toBe(true);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith("ws://active");
    expect(request).toHaveBeenCalledWith("Page.reload", { ignoreCache: true }, 8_000);
    expect(close).toHaveBeenCalledTimes(1);
    expect(setLastActiveTab).toHaveBeenCalledWith({
      id: "active",
      title: "Preview",
      url: activeUrl,
    });
    expect(setLastActivity).toHaveBeenCalledWith("Reloaded browser preview after app/main.js changed.");
    expect(setLastError).toHaveBeenCalledWith(undefined);
  });
});
