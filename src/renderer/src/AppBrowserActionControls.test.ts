import { describe, expect, it } from "vitest";

import type { BrowserCapabilityState, BrowserUserActionState } from "../../shared/browserTypes";
import {
  browserUserActionActiveTabContext,
  browserUserActionCompletionPrompt,
  browserUserActionDeliveryForRunningState,
} from "./AppBrowserActionControls";

describe("App browser action controls", () => {
  it("builds the existing continuation prompt with active browser tab context", () => {
    expect(browserUserActionCompletionPrompt(
      userAction({ toolName: "browser_click" }),
      browserState({
        activeTab: {
          title: "Checkout",
          url: "https://example.test/checkout",
        },
      }),
    )).toBe(
      "I completed the browser warning. Please retry the blocked browser_click operation and continue answering my previous request. The active browser tab is now \"Checkout\" at https://example.test/checkout. If the active browser page already contains the needed result, use it directly.",
    );
  });

  it("uses Untitled when active tab context has only a URL", () => {
    expect(browserUserActionActiveTabContext(browserState({ activeTab: { url: "https://example.test" } }))).toBe(
      " The active browser tab is now \"Untitled\" at https://example.test.",
    );
  });

  it("omits browser tab context when no active tab URL is available", () => {
    expect(browserUserActionActiveTabContext(browserState())).toBe("");
  });

  it("keeps delivery mode tied to whether a run is already active", () => {
    expect(browserUserActionDeliveryForRunningState(true)).toBe("follow-up");
    expect(browserUserActionDeliveryForRunningState(false)).toBe("prompt");
  });
});

function userAction(overrides: Partial<BrowserUserActionState> = {}): BrowserUserActionState {
  return {
    id: "action-1",
    active: true,
    status: "waiting",
    kind: "login",
    toolName: "browser_action",
    runtime: "chrome",
    profileMode: "isolated",
    message: "Review the browser",
    startedAt: "2026-06-13T00:00:00.000Z",
    lastCheckedAt: "2026-06-13T00:00:01.000Z",
    canAutoResume: false,
    ...overrides,
  };
}

function browserState(overrides: Partial<BrowserCapabilityState> = {}): BrowserCapabilityState {
  return {
    running: true,
    profileMode: "isolated",
    runtime: "chrome",
    internalAvailable: true,
    copiedProfileAvailable: false,
    chromeAvailable: true,
    browserLoginBrokerAvailable: false,
    ...overrides,
  };
}
