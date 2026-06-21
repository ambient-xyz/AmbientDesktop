import { describe, expect, it } from "vitest";
import type { BrowserUserActionState } from "../../shared/browserTypes";
import { BrowserUnavailableError, BrowserUserActionCanceledError, BrowserUserActionTimedOutError } from "./agentRuntimeBrowserFacade";
import { browserRuntimeForAgentProfile, browserToolFallback, browserUnavailableText, selectAgentBrowserRuntime } from "./agentRuntimeAgentFacade";

describe("agent browser runtime selection", () => {
  it("keeps isolated agent sessions on Chrome", () => {
    expect(browserRuntimeForAgentProfile("isolated")).toBe("chrome");
  });

  it("keeps copied-profile sessions on Chrome", () => {
    expect(browserRuntimeForAgentProfile("copied")).toBe("chrome");
  });

  it("does not inherit an already-running internal browser for direct agent browser tools", () => {
    expect(
      selectAgentBrowserRuntime({
        browserState: {
          running: true,
          runtime: "internal",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: false,
          chromeAvailable: true,
          sourceProfilePath: undefined,
        },
      }),
    ).toMatchObject({
      profileMode: "isolated",
      runtime: "chrome",
      reason: "default-isolated-managed-chrome",
    });
  });

  it("reuses an already-running isolated managed Chrome profile without switching to the internal browser", () => {
    expect(
      selectAgentBrowserRuntime({
        browserState: {
          running: true,
          runtime: "chrome",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: false,
          chromeAvailable: true,
          sourceProfilePath: "/Users/example/Chrome",
        },
      }),
    ).toMatchObject({
      profileMode: "isolated",
      runtime: "chrome",
      shouldCopyProfile: false,
      reason: "reuse-running-managed-chrome",
    });
  });

  it("does not use a copied Chrome profile unless the caller explicitly requests it", () => {
    expect(
      selectAgentBrowserRuntime({
        browserState: {
          running: false,
          runtime: "chrome",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: true,
          chromeAvailable: true,
          sourceProfilePath: "/Users/example/Chrome",
        },
      }),
    ).toMatchObject({
      profileMode: "isolated",
      runtime: "chrome",
      shouldCopyProfile: false,
      reason: "default-isolated-managed-chrome",
    });

    expect(
      selectAgentBrowserRuntime({
        requestedProfileMode: "copied",
        browserState: {
          running: false,
          runtime: "chrome",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: true,
          chromeAvailable: true,
          sourceProfilePath: "/Users/example/Chrome",
        },
      }),
    ).toMatchObject({
      profileMode: "copied",
      runtime: "chrome",
      shouldCopyProfile: false,
      reason: "requested-copied-profile",
    });
  });

  it("allows the internal runtime only when a caller opts into that narrow path", () => {
    expect(
      selectAgentBrowserRuntime({
        requestedRuntime: "internal",
        allowInternalRuntime: true,
        browserState: {
          running: false,
          runtime: "internal",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: true,
          chromeAvailable: true,
          sourceProfilePath: "/Users/example/Chrome",
        },
      }),
    ).toMatchObject({
      profileMode: "isolated",
      runtime: "internal",
      shouldCopyProfile: false,
      reason: "explicit-internal-runtime",
    });
  });
});

describe("agent browser unavailable fallback", () => {
  it("turns unavailable browser errors into clear tool text", () => {
    const fallback = browserToolFallback(new BrowserUnavailableError("Chrome missing"));

    expect(fallback).toMatchObject({ unavailable: true, message: "Chrome missing" });
    if (!("unavailable" in fallback)) throw new Error("Expected browser unavailable fallback.");
    expect(browserUnavailableText(fallback)).toContain("Browser unavailable.");
    expect(browserUnavailableText(fallback)).toContain("Chrome missing");
  });

  it("preserves canceled user-action waits as tool failures", () => {
    const state = browserUserActionState("canceled");

    expect(() => browserToolFallback(new BrowserUserActionCanceledError(state))).toThrow(BrowserUserActionCanceledError);
  });

  it("preserves timed-out user-action waits as tool failures", () => {
    const state = browserUserActionState("timed-out");

    expect(() => browserToolFallback(new BrowserUserActionTimedOutError(state))).toThrow(BrowserUserActionTimedOutError);
  });
});

function browserUserActionState(status: BrowserUserActionState["status"]): BrowserUserActionState {
  return {
    id: `test-${status}`,
    active: false,
    status,
    kind: "captcha",
    provider: "google",
    toolName: "browser_search",
    runtime: "chrome",
    profileMode: "isolated",
    url: "https://www.google.com/search?q=bunny",
    title: "Google Search",
    origin: "https://www.google.com",
    message: "Complete the CAPTCHA in the browser.",
    startedAt: "2026-05-06T00:00:00.000Z",
    lastCheckedAt: "2026-05-06T00:00:01.000Z",
    canAutoResume: true,
  };
}
