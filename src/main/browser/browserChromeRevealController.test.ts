import { describe, expect, it, vi } from "vitest";

import type { BrowserCapabilityState, BrowserProfileMode, BrowserRuntimeKind, BrowserUserActionState } from "../../shared/browserTypes";
import { BrowserChromeRevealController, type BrowserChromeRevealControllerOptions } from "./browserChromeRevealController";

describe("BrowserChromeRevealController", () => {
  it("routes internal browser reveals to the inline panel result", async () => {
    const tab = { id: "internal", title: "Challenge", url: "https://example.test/challenge" };
    const options = baseOptions({
      getActiveRuntime: () => "internal",
      internalStateSnapshot: vi.fn(async () => ({
        running: true,
        profileMode: "isolated",
        runtime: "internal",
        internalAvailable: true,
        copiedProfileAvailable: false,
        chromeAvailable: true,
        browserLoginBrokerAvailable: true,
        activeTab: tab,
      }) satisfies BrowserCapabilityState),
    });
    const controller = new BrowserChromeRevealController(options);

    await expect(controller.revealActiveBrowser()).resolves.toMatchObject({
      runtime: "internal",
      target: "internal",
      status: "needs-internal-panel",
      activeTab: tab,
    });
    expect(options.setLastActivity).toHaveBeenCalledWith("Showing internal browser panel.");
    expect(options.revealManagedChromeWindow).not.toHaveBeenCalled();
  });

  it("passes active browser-warning targets to the managed Chrome revealer", async () => {
    const tab = { id: "target-captcha", title: "Sorry", url: "https://www.google.com/sorry/index" };
    const options = baseOptions({
      getCurrentUserAction: () => userActionFixture({ id: "user-action-1", targetId: "target-captcha" }),
      revealManagedChromeWindow: vi.fn(async () => ({
        cdpActivated: true,
        foregroundAttempted: true,
        foregroundSucceeded: true,
        method: "test:foreground",
        activeTab: tab,
      })),
    });
    const controller = new BrowserChromeRevealController(options);

    await expect(controller.revealActiveBrowser({ userActionId: "user-action-1" })).resolves.toMatchObject({
      runtime: "chrome",
      target: "managed-chrome",
      status: "revealed",
      method: "test:foreground",
      activeTab: tab,
    });

    expect(options.revealManagedChromeWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "target-captcha",
        profileMode: "isolated",
        processId: 4242,
        profilePath: "/tmp/profile",
      }),
    );
    expect(options.setLastActiveTab).toHaveBeenCalledWith(tab);
    expect(options.setLastError).toHaveBeenCalledWith(undefined);
    expect(options.notifyStateChanged).toHaveBeenCalledOnce();
  });

  it("returns a not-running Chrome reveal after failed reattach", async () => {
    let running = false;
    const options = baseOptions({
      isChromeRunning: () => running,
      reattachChrome: vi.fn(async () => {
        running = false;
        return false;
      }),
    });
    const controller = new BrowserChromeRevealController(options);

    await expect(controller.revealActiveBrowser()).resolves.toMatchObject({
      runtime: "chrome",
      target: "managed-chrome",
      status: "not-running",
    });
    expect(options.reattachChrome).toHaveBeenCalledWith("isolated");
    expect(options.setLastActivity).toHaveBeenCalledWith("Managed Chrome is not running.");
    expect(options.revealManagedChromeWindow).not.toHaveBeenCalled();
  });
});

function baseOptions(overrides: Partial<BrowserChromeRevealControllerOptions> = {}): BrowserChromeRevealControllerOptions {
  return {
    refreshChromeRunningState: vi.fn(async () => undefined),
    getActiveRuntime: vi.fn(() => "chrome" as BrowserRuntimeKind),
    setActiveRuntime: vi.fn(),
    isInternalBrowserRunning: vi.fn(() => false),
    internalStateSnapshot: vi.fn(async () => ({
      running: false,
      profileMode: "isolated",
      runtime: "internal",
      internalAvailable: true,
      copiedProfileAvailable: false,
      chromeAvailable: true,
      browserLoginBrokerAvailable: true,
    }) satisfies BrowserCapabilityState),
    getCurrentUserAction: vi.fn(() => undefined),
    getProfileMode: vi.fn(() => "isolated" as BrowserProfileMode),
    getChromeProcessId: vi.fn(() => 4242),
    getChildProcessId: vi.fn(() => undefined),
    getRuntimeProfilePath: vi.fn(() => "/tmp/profile"),
    isChromeRunning: vi.fn(() => true),
    reattachChrome: vi.fn(async () => true),
    chromeAvailability: vi.fn(() => ({ executable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" })),
    revealManagedChromeWindow: vi.fn(async () => ({
      cdpActivated: true,
      foregroundAttempted: true,
      foregroundSucceeded: true,
    })),
    setLastActiveTab: vi.fn(),
    setLastActivity: vi.fn(),
    setLastError: vi.fn(),
    notifyStateChanged: vi.fn(),
    ...overrides,
  };
}

function userActionFixture(overrides: Partial<BrowserUserActionState> = {}): BrowserUserActionState {
  return {
    id: "user-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    provider: "google",
    toolName: "browser_search",
    runtime: "chrome",
    profileMode: "isolated",
    targetId: "target-1",
    message: "Browser warning",
    startedAt: "2026-06-22T00:00:00.000Z",
    lastCheckedAt: "2026-06-22T00:00:00.000Z",
    canAutoResume: false,
    ...overrides,
  };
}
