import { describe, expect, it, vi } from "vitest";

import type { BrowserScreenshotResult } from "../../shared/browserTypes";
import { BrowserServiceUserActionController } from "./browserUserActionController";

describe("BrowserServiceUserActionController", () => {
  it("tracks active user-action state and clears matching resolved detections", () => {
    const harness = createHarness();
    const state = harness.controller.normalizeDetection(
      {
        detected: true,
        kind: "captcha",
        provider: "google",
        url: "https://www.google.com/sorry/index",
        title: "Sorry",
        origin: "https://www.google.com",
        message: "Google verification required.",
      },
      {
        toolName: "browser_content",
        runtime: "internal",
        profileMode: "isolated",
        sourceThreadId: "thread-1",
      },
    );

    expect(state).toMatchObject({
      active: true,
      status: "waiting",
      kind: "captcha",
      provider: "google",
      sourceThreadId: "thread-1",
    });
    expect(harness.controller.activeBlock()).toBe(state);
    expect(harness.controller.activeBlock({ userActionId: state?.id })).toBeUndefined();

    harness.controller.clearResolved({
      runtime: "internal",
      profileMode: "isolated",
      message: "Browser user action no longer detected.",
    });

    expect(harness.controller.current).toBeUndefined();
    expect(harness.lastActivity()).toBe("Browser user action no longer detected.");
  });

  it("checks detached internal user actions before clearing them on resume", async () => {
    const harness = createHarness({
      detectInternalUserAction: vi.fn(async () => ({ detected: false, url: "https://example.test", title: "Done" })),
    });
    harness.controller.normalizeDetection(
      {
        detected: true,
        kind: "mfa",
        provider: "unknown",
        url: "https://example.test/login",
        title: "Login",
      },
      {
        toolName: "browser_nav",
        runtime: "internal",
        profileMode: "isolated",
      },
    );

    await harness.controller.resume();

    expect(harness.ensureInternalStarted).toHaveBeenCalledOnce();
    expect(harness.detectInternalUserAction).toHaveBeenCalledOnce();
    expect(harness.controller.current).toBeUndefined();
    expect(harness.lastActivity()).toBe("Browser user action completed.");
  });
});

function createHarness(overrides: Partial<{
  detectInternalUserAction: () => Promise<unknown>;
}> = {}) {
  let lastActivity = "";
  let lastError: string | undefined;
  const ensureInternalStarted = vi.fn(async () => undefined);
  const detectInternalUserAction = overrides.detectInternalUserAction ?? vi.fn(async () => undefined);
  const controller = new BrowserServiceUserActionController({
    currentChromeTargetId: () => "target-1",
    captureChromeScreenshot: vi.fn(async () => ({ path: "browser/screenshot.png", bytes: 12 }) satisfies BrowserScreenshotResult),
    ensureChromeStarted: vi.fn(async () => undefined),
    ensureChromeTarget: vi.fn(async () => undefined),
    detectChromeUserAction: vi.fn(async () => undefined),
    ensureInternalStarted,
    detectInternalUserAction,
    setLastActivity: (message) => {
      lastActivity = message;
    },
    setLastError: (message) => {
      lastError = message;
    },
    notifyStateChanged: vi.fn(),
  });
  return {
    controller,
    ensureInternalStarted,
    detectInternalUserAction,
    lastActivity: () => lastActivity,
    lastError: () => lastError,
  };
}
