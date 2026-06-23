import { describe, expect, it, vi } from "vitest";

import type {
  BrowserCapabilityState,
  BrowserRuntimeKind,
  BrowserProfileMode,
} from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  createBrowserServiceControllers,
  type BrowserServiceControllerFactoryInput,
} from "./browserServiceControllers";

describe("BrowserService controller factory", () => {
  it("wires internal reveal state through the service snapshot controller", async () => {
    const input = baseInput({
      internalRunning: true,
      internalState: {
        running: true,
        runtime: "internal",
        activeTab: { id: "internal-tab", title: "Internal", url: "https://example.test" },
      } as BrowserCapabilityState,
    });

    const controllers = createBrowserServiceControllers(input);
    const result = await controllers.chromeReveal.revealActiveBrowser();

    expect(result).toMatchObject({
      runtime: "internal",
      target: "internal",
      status: "needs-internal-panel",
      activeTab: { id: "internal-tab" },
    });
    expect(input.state.getLastActivity()).toBe("Showing internal browser panel.");
  });

  it("keeps managed Chrome reveal fallback wired through service state", async () => {
    const input = baseInput({
      activeRuntime: "chrome",
      internalRunning: false,
      isChromeRunning: false,
    });

    const controllers = createBrowserServiceControllers(input);
    const result = await controllers.chromeReveal.revealActiveBrowser();

    expect(result).toMatchObject({
      runtime: "chrome",
      target: "managed-chrome",
      status: "not-running",
    });
    expect(input.actions.reattachChrome).toHaveBeenCalledWith("isolated");
    expect(input.state.getLastActivity()).toBe("Managed Chrome is not running.");
  });
});

function baseInput(overrides: {
  activeRuntime?: BrowserRuntimeKind;
  internalRunning?: boolean;
  internalState?: BrowserCapabilityState;
  isChromeRunning?: boolean;
} = {}): BrowserServiceControllerFactoryInput {
  const state = {
    activeRuntime: overrides.activeRuntime ?? "internal",
    activeTargetId: undefined as string | undefined,
    attachedChrome: false,
    browserWsUrl: undefined as string | undefined,
    chromeProcessId: undefined as number | undefined,
    chromeSessionId: undefined as string | undefined,
    lastActiveTab: undefined as BrowserServiceControllerFactoryInput["state"] extends { getLastActiveTab: () => infer T } ? T : never,
    lastActivity: undefined as string | undefined,
    lastError: undefined as string | undefined,
    lastSessionEvent: undefined as BrowserServiceControllerFactoryInput["state"] extends { getLastSessionEvent: () => infer T } ? T : never,
    port: undefined as number | undefined,
    profileMode: "isolated" as BrowserProfileMode,
    runtimeProfilePath: undefined as string | undefined,
  };
  const input: BrowserServiceControllerFactoryInput = {
    getWorkspace: () => ({ path: "/tmp/workspace", statePath: "/tmp/workspace/.ambient" }) as WorkspaceState,
    internalBrowser: {
      isAvailable: () => true,
      isRunning: () => overrides.internalRunning ?? true,
      getState: vi.fn(async () => overrides.internalState ?? ({ running: false, runtime: "internal" } as BrowserCapabilityState)),
      start: vi.fn(),
      stop: vi.fn(),
      shutdown: vi.fn(),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      keypress: vi.fn(),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    },
    options: {},
    state: {
      getPort: () => state.port,
      getBrowserWsUrl: () => state.browserWsUrl,
      setBrowserWsUrl: (url) => {
        state.browserWsUrl = url;
      },
      getActiveTargetId: () => state.activeTargetId,
      setActiveTargetId: (targetId) => {
        state.activeTargetId = targetId;
      },
      getLastActiveTab: () => state.lastActiveTab,
      setLastActiveTab: (tab) => {
        state.lastActiveTab = tab;
      },
      getLastActivity: () => state.lastActivity,
      setLastActivity: (message) => {
        state.lastActivity = message;
      },
      getLastError: () => state.lastError,
      setLastError: (message) => {
        state.lastError = message;
      },
      getLastSessionEvent: () => state.lastSessionEvent,
      getActivePicker: () => undefined,
      getProfileMode: () => state.profileMode,
      getRuntimeProfilePath: () => state.runtimeProfilePath,
      getAttachedToExistingSession: () => state.attachedChrome,
      getSessionId: () => state.chromeSessionId,
      getProcessId: () => state.chromeProcessId,
      getActiveRuntime: () => state.activeRuntime,
      setActiveRuntime: (runtime) => {
        state.activeRuntime = runtime;
      },
    },
    actions: {
      waitForVersion: vi.fn(),
      writeChromeSessionManifest: vi.fn(),
      screenshotChrome: vi.fn(),
      ensureChromeStarted: vi.fn(),
      closeActiveAboutBlankTarget: vi.fn(async () => false),
      detectChromeUserAction: vi.fn(),
      ensureInternalStarted: vi.fn(),
      isChromeRunning: vi.fn(() => overrides.isChromeRunning ?? false),
      stopChrome: vi.fn(),
      refreshChromeRunningState: vi.fn(),
      reattachChrome: vi.fn(async () => false),
      revealManagedChromeWindow: vi.fn(),
      rememberChromeBrowserActionTarget: vi.fn(),
      sameAsLastChromeBrowserActionTarget: vi.fn(),
      getChildProcessId: vi.fn(),
      hasInternalBrowser: vi.fn(() => true),
      notifyStateChanged: vi.fn(),
    },
    dependencies: {
      chromeAvailability: () => ({ available: true, executable: "/Applications/Chrome.app" }),
      chromeProfileSourcePath: () => "/Users/example/Chrome",
      defaultManagedChromeRevealBounds: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    },
  };
  return input;
}
