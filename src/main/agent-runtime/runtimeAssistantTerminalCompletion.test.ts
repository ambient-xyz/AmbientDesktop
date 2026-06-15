import { describe, expect, it, vi } from "vitest";
import { createRuntimeAssistantTerminalCompletion } from "./runtimeAssistantTerminalCompletion";

describe("createRuntimeAssistantTerminalCompletion", () => {
  it("resolves assistant-terminal after the configured grace period when assistant text exists", async () => {
    vi.useFakeTimers();
    try {
      const completion = createRuntimeAssistantTerminalCompletion({
        defaultGraceMs: 15_000,
        hasAssistantText: () => true,
      });

      completion.schedule();
      expect(completion.isArmed()).toBe(true);
      expect(completion.graceMs()).toBe(15_000);
      vi.advanceTimersByTime(15_000);

      await expect(completion.completion).resolves.toBe("assistant-terminal");
      expect(completion.isArmed()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not schedule without assistant text", () => {
    vi.useFakeTimers();
    try {
      const completion = createRuntimeAssistantTerminalCompletion({
        defaultGraceMs: 15_000,
        hasAssistantText: () => false,
      });

      completion.schedule();
      vi.advanceTimersByTime(15_000);

      expect(completion.isArmed()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets an armed timer on activity using the current grace period", async () => {
    vi.useFakeTimers();
    try {
      const completion = createRuntimeAssistantTerminalCompletion({
        defaultGraceMs: 15_000,
        hasAssistantText: () => true,
      });

      completion.schedule(500);
      vi.advanceTimersByTime(400);
      completion.resetOnActivity();
      vi.advanceTimersByTime(400);
      expect(completion.isArmed()).toBe(true);
      vi.advanceTimersByTime(100);

      await expect(completion.completion).resolves.toBe("assistant-terminal");
      expect(completion.graceMs()).toBe(500);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not arm a timer when resetOnActivity is called before schedule", () => {
    vi.useFakeTimers();
    try {
      const completion = createRuntimeAssistantTerminalCompletion({
        defaultGraceMs: 15_000,
        hasAssistantText: () => true,
      });

      completion.resetOnActivity();
      vi.advanceTimersByTime(15_000);

      expect(completion.isArmed()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears an armed timer", () => {
    vi.useFakeTimers();
    try {
      const completion = createRuntimeAssistantTerminalCompletion({
        defaultGraceMs: 15_000,
        hasAssistantText: () => true,
      });

      completion.schedule();
      completion.clear();
      vi.advanceTimersByTime(15_000);

      expect(completion.isArmed()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
