import { describe, expect, it } from "vitest";

import {
  runtimePiStreamFailureKind,
  runtimePiStreamProgressActivity,
  runtimePiStreamTimeoutActivity,
  runtimePiStreamTimeoutMessage,
} from "./agentRuntimeStreamState";

describe("runtimePiStreamFailureKind", () => {
  it("classifies pre-stream and idle stream failures from event count", () => {
    expect(runtimePiStreamFailureKind(0)).toBe("pre_stream_timeout");
    expect(runtimePiStreamFailureKind(1)).toBe("stream_idle_timeout");
  });
});

describe("runtimePiStreamTimeoutMessage", () => {
  it("uses explicit watchdog messages before derived timeout messages", () => {
    expect(runtimePiStreamTimeoutMessage(0, 1000, 2000, "custom timeout")).toBe("custom timeout");
  });

  it("builds start and stall timeout messages from stream state", () => {
    expect(runtimePiStreamTimeoutMessage(0, 1000, 2000)).toContain("did not start streaming");
    expect(runtimePiStreamTimeoutMessage(2, 1000, 2000)).toContain("stream stalled");
  });
});

describe("runtimePiStreamTimeoutActivity", () => {
  it("builds a Pi stream timeout activity", () => {
    expect(runtimePiStreamTimeoutActivity({
      threadId: "thread-1",
      outputChars: 12,
      thinkingChars: 4,
      timeoutMs: 30000,
      message: "Ambient/Pi stream stalled after 30000 ms without stream activity.",
    })).toEqual({
      threadId: "thread-1",
      kind: "stream",
      status: "timeout",
      outputChars: 12,
      thinkingChars: 4,
      idleElapsedMs: 30000,
      idleTimeoutMs: 30000,
      message: "Ambient/Pi stream stalled after 30000 ms without stream activity.",
    });
  });

  it("includes trace diagnostics when available", () => {
    const trace = {
      path: "/tmp/pi-stream-trace.json",
      eventCount: 2,
      recentEventCount: 2,
      reason: "timeout",
      recordedAt: "2026-06-12T19:00:00.000Z",
    };

    expect(runtimePiStreamTimeoutActivity({
      threadId: "thread-1",
      outputChars: 0,
      thinkingChars: 0,
      timeoutMs: 1000,
      message: "Ambient/Pi did not start streaming within 1000 ms.",
      trace,
    })).toMatchObject({
      diagnostic: { trace },
    });
  });
});

describe("runtimePiStreamProgressActivity", () => {
  it("builds a Pi stream progress activity", () => {
    expect(runtimePiStreamProgressActivity({
      threadId: "thread-1",
      outputChars: 24,
      thinkingChars: 6,
      idleElapsedMs: 250,
      idleTimeoutMs: 30000,
    })).toEqual({
      threadId: "thread-1",
      kind: "stream",
      status: "running",
      outputChars: 24,
      thinkingChars: 6,
      idleElapsedMs: 250,
      idleTimeoutMs: 30000,
    });
  });
});
