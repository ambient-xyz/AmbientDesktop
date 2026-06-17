import { describe, expect, it, vi } from "vitest";
import {
  BrowserToolTimeoutError,
  browserToolTimeoutMs,
  withBrowserToolHeartbeat,
} from "./agentRuntimeBrowserToolHeartbeat";

describe("agentRuntimeBrowserToolHeartbeat", () => {
  it("bounds hung browser tool operations while continuing heartbeat updates", async () => {
    vi.useFakeTimers();
    try {
      const updates: string[] = [];
      const pending = withBrowserToolHeartbeat(
        "browser_nav",
        "Browser navigation is still running.",
        () => new Promise<string>(() => undefined),
        (update) => updates.push(update.content[0]?.text ?? ""),
        { timeoutMs: 50, heartbeatMs: 20 },
      ).catch((error) => error);

      await vi.advanceTimersByTimeAsync(20);
      expect(updates).toEqual(["Browser navigation is still running."]);

      await vi.advanceTimersByTimeAsync(30);
      const error = await pending;
      expect(error).toBeInstanceOf(BrowserToolTimeoutError);
      expect(error.message).toContain("browser_nav timed out after 50ms");
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors runtime abort signals for browser tool operations", async () => {
    const controller = new AbortController();
    const pending = withBrowserToolHeartbeat(
      "browser_screenshot",
      "Browser screenshot capture is still running.",
      () => new Promise<string>(() => undefined),
      undefined,
      { signal: controller.signal, timeoutMs: 1_000 },
    ).catch((error) => error);

    controller.abort(new Error("Run canceled."));

    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Run canceled.");
  });

  it("resets the browser idle timeout on operation activity", async () => {
    vi.useFakeTimers();
    try {
      const updates: string[] = [];
      const pending = withBrowserToolHeartbeat(
        "browser_nav",
        "Browser navigation is still running.",
        (markActivity) =>
          new Promise<string>((resolve) => {
            setTimeout(() => markActivity("Browser received navigation progress."), 40);
            setTimeout(() => markActivity("Browser DOM is still changing."), 80);
            setTimeout(() => resolve("loaded"), 120);
          }),
        (update) => updates.push(update.content[0]?.text ?? ""),
        { timeoutMs: 50, heartbeatMs: 1_000 },
      );

      await vi.advanceTimersByTimeAsync(120);

      await expect(pending).resolves.toBe("loaded");
      expect(updates).toEqual([
        "Browser received navigation progress.",
        "Browser DOM is still changing.",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a bounded default browser tool timeout with environment override", () => {
    expect(browserToolTimeoutMs({})).toBe(90_000);
    expect(browserToolTimeoutMs({ AMBIENT_BROWSER_TOOL_TIMEOUT_MS: "2500" })).toBe(2_500);
    expect(browserToolTimeoutMs({ AMBIENT_BROWSER_TOOL_TIMEOUT_MS: "0" })).toBe(90_000);
  });
});
