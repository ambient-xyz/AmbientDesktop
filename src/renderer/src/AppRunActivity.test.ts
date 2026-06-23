import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RUN_ACTIVITY_PLACEHOLDER,
  createRunActivityLineFromCounter,
  formatRuntimeActivity,
  runActivityThinkingDeltaUpdate,
  runRetryStatsFromActivity,
  shouldAppendRunActivityLine,
  shouldRenderRuntimeActivityUpdate,
  summarizeRunActivity,
  workflowReviewRetryStatusLabel,
  type RunActivityLine,
} from "./AppRunActivity";

describe("summarizeRunActivity", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("summarizes tool activity without changing run line semantics", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T05:00:05.000Z"));

    const lines: RunActivityLine[] = [
      { id: "activity-1", kind: "state", text: "Starting Ambient session.", timestamp: Date.parse("2026-06-04T05:00:00.000Z") },
      { id: "activity-2", kind: "tool", text: "Tool execution is in progress.", timestamp: Date.parse("2026-06-04T05:00:01.000Z") },
    ];

    expect(summarizeRunActivity(lines, "tool")).toEqual({
      title: "Running tools",
      subtitle: "Tool execution is in progress.",
      metrics: ["Observed 2 events", "Tools 1", "Worked 5s"],
    });
  });

  it("keeps the placeholder line available to empty feeds", () => {
    expect(RUN_ACTIVITY_PLACEHOLDER).toMatchObject({
      id: "activity-placeholder",
      kind: "state",
      text: "Preparing run context.",
    });
  });

  it("creates stable run activity line ids from the counter and timestamp", () => {
    expect(createRunActivityLineFromCounter({
      counter: 3,
      kind: "tool",
      text: "Tool execution is in progress.",
      timestamp: 1_717_476_000_000,
    })).toEqual({
      id: "activity-1717476000000-3",
      kind: "tool",
      text: "Tool execution is in progress.",
      timestamp: 1_717_476_000_000,
    });
  });

  it("keeps append dedupe behavior explicit for the App shell", () => {
    const lines: RunActivityLine[] = [
      { id: "activity-1", kind: "state", text: "Waiting for model output.", timestamp: 1 },
    ];

    expect(shouldAppendRunActivityLine({
      currentLines: lines,
      normalizedText: "",
    })).toBe(false);
    expect(shouldAppendRunActivityLine({
      currentLines: lines,
      normalizedText: "Waiting for model output.",
    })).toBe(false);
    expect(shouldAppendRunActivityLine({
      currentLines: lines,
      dedupe: false,
      normalizedText: "Waiting for model output.",
    })).toBe(true);
    expect(shouldAppendRunActivityLine({
      currentLines: lines,
      normalizedText: "Tool execution is in progress.",
    })).toBe(true);
  });

  it("buffers thinking deltas until a line boundary or sentence boundary is available", () => {
    expect(runActivityThinkingDeltaUpdate(undefined, "Thinking through")).toEqual({
      completedLines: [],
      remainder: "Thinking through",
    });
    expect(runActivityThinkingDeltaUpdate("Thinking through", " it.\nNext")).toEqual({
      completedLines: ["Thinking through it."],
      remainder: "Next",
    });
    expect(runActivityThinkingDeltaUpdate("A".repeat(141), "")).toEqual({
      completedLines: ["A".repeat(141)],
      remainder: "",
    });
  });

  it("rate-limits only high-frequency streaming activity replacements", () => {
    const previous = {
      text: "Streaming response: 10 output chars.",
      renderedAt: 1_000,
    };

    expect(
      shouldRenderRuntimeActivityUpdate({
        activity: { threadId: "thread-id", kind: "stream", status: "running", outputChars: 11 },
        now: 1_050,
        previous,
        text: "Streaming response: 11 output chars.",
      }),
    ).toBe(false);
    expect(
      shouldRenderRuntimeActivityUpdate({
        activity: { threadId: "thread-id", kind: "stream", status: "running", outputChars: 11 },
        now: 1_300,
        previous,
        text: "Streaming response: 11 output chars.",
      }),
    ).toBe(true);
    expect(
      shouldRenderRuntimeActivityUpdate({
        activity: { threadId: "thread-id", kind: "stream", status: "timeout", outputChars: 11 },
        now: 1_050,
        previous,
        text: "Ambient/Pi stream timed out after 30s.",
      }),
    ).toBe(true);
  });

  it("tracks retry stats and labels without changing review status text", () => {
    const starting = runRetryStatsFromActivity(undefined, {
      threadId: "thread-id",
      kind: "retry",
      status: "starting",
      attempt: 2,
      maxAttempts: 5,
      delayMs: 2000,
      message: "Network pause",
    });

    expect(starting).toEqual({
      attempt: 2,
      maxAttempts: 5,
      completed: 1,
      active: true,
      recovered: false,
      lastMessage: "Network pause",
      delayMs: 2000,
    });
    expect(workflowReviewRetryStatusLabel(starting, true)).toBe("Aggressive retries 2/5 running");

    const finished = runRetryStatsFromActivity(starting, {
      threadId: "thread-id",
      kind: "retry",
      status: "finished",
      success: true,
      attempt: 2,
    });

    expect(finished).toMatchObject({
      attempt: 2,
      maxAttempts: 5,
      completed: 2,
      active: false,
      recovered: true,
      lastMessage: "Network pause",
      delayMs: 2000,
    });
    expect(workflowReviewRetryStatusLabel(undefined, false)).toBe("Retries 0 attempted");
    expect(workflowReviewRetryStatusLabel(finished, false)).toBe("Retries 2/5 recovered");
  });

  it("formats runtime activity status lines", () => {
    expect(
      formatRuntimeActivity({
        threadId: "thread-id",
        kind: "stream",
        status: "running",
        outputChars: 1234,
        thinkingChars: 50,
        idleElapsedMs: 2000,
        idleTimeoutMs: 5000,
      }),
    ).toBe("Streaming response: 1,234 output chars, 50 thinking chars, idle 2s / 5s timeout.");

    expect(
      formatRuntimeActivity({
        threadId: "thread-id",
        kind: "stream",
        status: "timeout",
        outputChars: 0,
        idleTimeoutMs: 7000,
      }),
    ).toBe("Ambient/Pi stream timed out after 7s.");

    expect(
      formatRuntimeActivity({
        threadId: "thread-id",
        kind: "retry",
        status: "starting",
        attempt: 2,
        maxAttempts: 5,
        delayMs: 2000,
        message: "Network pause",
      }),
    ).toBe("Retrying attempt 2/5 in 2s: Network pause");

    expect(
      formatRuntimeActivity({
        threadId: "thread-id",
        kind: "compaction",
        status: "starting",
        reason: "overflow",
      }),
    ).toBe("Compacting context (provider context overflow).");
  });
});
