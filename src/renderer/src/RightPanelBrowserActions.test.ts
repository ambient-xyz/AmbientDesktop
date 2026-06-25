import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrowserCapabilityState, BrowserScreenshotResult } from "../../shared/browserTypes";
import { createRightPanelBrowserActions, type BrowserInspectResult } from "./RightPanelBrowserActions";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

describe("RightPanelBrowserActions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navigates with the workspace-aware runtime and refreshes browser state", async () => {
    const state = browserState({ copiedProfileAvailable: true });
    const nextState = browserState({ running: true, activeTab: { title: "Example", url: "https://example.test" } });
    const ambientDesktop = {
      navigateBrowser: vi.fn(async () => ({ title: "Example", url: "https://example.test", text: "", links: [] })),
      getBrowserState: vi.fn(async () => nextState),
    };
    vi.stubGlobal("window", { ambientDesktop });
    const browserStateCell = stateCell<BrowserCapabilityState | undefined>(state);
    const browserUrlCell = stateCell("  https://example.test  ");
    const busyCell = stateCell<string | undefined>(undefined);
    const statusCell = stateCell<ApiKeyStatus | undefined>(undefined);

    const actions = createRightPanelBrowserActions({
      workspacePath: "/repo",
      browserState: state,
      browserUrl: browserUrlCell.current,
      browserSearch: "",
      browserPickPrompt: "",
      setBrowserState: browserStateCell.set,
      setBrowserUrl: browserUrlCell.set,
      setBrowserBusy: busyCell.set,
      setBrowserUserActionBusy: stateCell<string | undefined>(undefined).set,
      setBrowserError: stateCell<string | undefined>(undefined).set,
      setBrowserStatus: statusCell.set,
      setBrowserCopyDialogOpen: stateCell(false).set,
      setBrowserInspectResult: stateCell<BrowserInspectResult | undefined>(undefined).set,
      setLatestBrowserScreenshot: stateCell<BrowserScreenshotResult | undefined>(undefined).set,
      onBrowserUserActionCompleted: async () => undefined,
    });

    await actions.navigateBrowser();

    expect(ambientDesktop.navigateBrowser).toHaveBeenCalledWith({
      url: "https://example.test",
      profileMode: "copied",
      runtime: "chrome",
    });
    expect(ambientDesktop.getBrowserState).toHaveBeenCalledTimes(1);
    expect(browserStateCell.current).toBe(nextState);
    expect(browserUrlCell.current).toBe("https://example.test");
    expect(statusCell.current).toEqual({ kind: "success", message: "Opened Example." });
    expect(busyCell.current).toBeUndefined();
  });
});

function browserState(overrides: Partial<BrowserCapabilityState> = {}): BrowserCapabilityState {
  return {
    running: false,
    profileMode: "isolated",
    runtime: "chrome",
    internalAvailable: true,
    copiedProfileAvailable: false,
    chromeAvailable: true,
    browserLoginBrokerAvailable: false,
    ...overrides,
  };
}

function stateCell<T>(initial: T): { readonly current: T; set: Dispatch<SetStateAction<T>> } {
  let current = initial;
  return {
    get current() {
      return current;
    },
    set(next) {
      current = typeof next === "function" ? (next as (currentValue: T) => T)(current) : next;
    },
  };
}
