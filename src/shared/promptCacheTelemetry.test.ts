import { describe, expect, it } from "vitest";
import {
  promptCachePendingTelemetry,
  promptCacheTelemetryFromUsage,
  promptCacheUsageTokens,
} from "./promptCacheTelemetry";

describe("promptCacheTelemetry", () => {
  it("marks cache hits when provider usage reports cached input tokens", () => {
    expect(promptCacheTelemetryFromUsage({
      input: 15,
      output: 64,
      cacheRead: 29152,
      cacheWrite: 0,
      totalTokens: 29231,
    })).toEqual({
      status: "hit",
      usage: {
        input: 15,
        output: 64,
        cacheRead: 29152,
        cacheWrite: 0,
        totalTokens: 29231,
      },
    });
  });

  it("marks cache misses when provider usage reports zero cached input tokens", () => {
    expect(promptCacheTelemetryFromUsage({
      input: 29167,
      output: 64,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 29231,
    })).toEqual({
      status: "miss",
      usage: {
        input: 29167,
        output: 64,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 29231,
      },
    });
  });

  it("keeps usage unknown when cacheRead is absent or invalid", () => {
    expect(promptCacheTelemetryFromUsage({ input: 12, output: 4 })).toEqual({
      status: "unknown",
      usage: { input: 12, output: 4 },
    });
    expect(promptCacheTelemetryFromUsage({ input: 12, cacheRead: -1 })).toEqual({
      status: "unknown",
      usage: { input: 12 },
    });
    expect(promptCacheTelemetryFromUsage({ input: 12, cacheRead: Number.POSITIVE_INFINITY })).toEqual({
      status: "unknown",
      usage: { input: 12 },
    });
  });

  it("ignores absent, non-object, array, string, and non-finite usage values", () => {
    expect(promptCacheTelemetryFromUsage(undefined)).toEqual({ status: "unknown" });
    expect(promptCacheTelemetryFromUsage(null)).toEqual({ status: "unknown" });
    expect(promptCacheTelemetryFromUsage([])).toEqual({ status: "unknown" });
    expect(promptCacheTelemetryFromUsage({ input: "12", output: NaN, cacheRead: "0" })).toEqual({ status: "unknown" });
    expect(promptCacheUsageTokens({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 })).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
    });
  });

  it("can represent request-start pending status", () => {
    expect(promptCachePendingTelemetry()).toEqual({ status: "pending" });
  });
});
