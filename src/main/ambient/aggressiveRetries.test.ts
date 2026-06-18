import { describe, expect, it } from "vitest";
import {
  AGGRESSIVE_RETRY_BACKOFF_MS,
  AmbientStreamFailureError,
  aggressiveAmbientRetryPolicy,
  ambientRetryPolicyFromLegacyOptions,
  ambientRetryPolicyFromSettings,
  isReplaySafeInterruptedStream,
  isRetryableAmbientProviderError,
  retryDelayForAttempt,
} from "./aggressiveRetries";

describe("aggressive retry policy", () => {
  it("locks the aggressive backoff schedule to the product contract", () => {
    expect([...AGGRESSIVE_RETRY_BACKOFF_MS]).toEqual([
      1_000,
      2_000,
      3_000,
      4_000,
      5_000,
      5_000,
      5_000,
      5_000,
      5_000,
      5_000,
    ]);
    expect(aggressiveAmbientRetryPolicy()).toMatchObject({
      enabled: true,
      maxRetries: 10,
      providerMaxRetryDelayMs: 5_000,
    });
  });

  it("uses one-based retry attempts and repeats the final schedule entry", () => {
    const policy = aggressiveAmbientRetryPolicy();

    expect([1, 2, 3, 4, 5, 6, 10, 11].map((attempt) => retryDelayForAttempt(policy, attempt))).toEqual([
      1_000,
      2_000,
      3_000,
      4_000,
      5_000,
      5_000,
      5_000,
      5_000,
    ]);
  });

  it("keeps legacy retry behavior compatible with the previous transient attempts shape", () => {
    expect(ambientRetryPolicyFromLegacyOptions({ maxAttempts: 4, baseDelayMs: 2_000 })).toEqual({
      enabled: true,
      maxRetries: 3,
      backoffMs: [2_000, 4_000, 8_000],
      providerMaxRetryDelayMs: 60_000,
    });
    expect(ambientRetryPolicyFromLegacyOptions({ maxAttempts: 1, baseDelayMs: 0 })).toMatchObject({
      enabled: false,
      maxRetries: 0,
      backoffMs: [],
    });
  });

  it("derives aggressive mode from the future persisted settings shape", () => {
    expect(ambientRetryPolicyFromSettings({ modelRuntime: { aggressiveRetries: true } })).toMatchObject({
      enabled: true,
      maxRetries: 10,
      backoffMs: AGGRESSIVE_RETRY_BACKOFF_MS,
    });
    expect(ambientRetryPolicyFromSettings({ modelRuntime: { aggressiveRetries: false } })).toMatchObject({
      enabled: true,
      maxRetries: 3,
    });
  });

  it("classifies provider and interrupted-stream failures without retrying user or policy failures", () => {
    expect(isRetryableAmbientProviderError(new Error("429 Upstream request failed"))).toBe(true);
    expect(isRetryableAmbientProviderError(new Error("Ambient/Pi stream stalled after 60000ms without stream activity."))).toBe(true);
    expect(isRetryableAmbientProviderError(new Error("Ambient workflow compiler did not return valid JSON: Unterminated string in JSON at position 42"))).toBe(true);
    expect(isRetryableAmbientProviderError(new AmbientStreamFailureError("stream_closed_before_done", "Ambient/Pi stream ended before completion."))).toBe(true);
    expect(isRetryableAmbientProviderError(new AmbientStreamFailureError("network_abort", "Socket closed during read."))).toBe(true);

    expect(isRetryableAmbientProviderError(new Error("Ambient API key is not configured."))).toBe(false);
    expect(isRetryableAmbientProviderError(new Error("permission denied by user"))).toBe(false);
    expect(isRetryableAmbientProviderError(new Error("schema validation failed"))).toBe(false);
    expect(isRetryableAmbientProviderError(new AmbientStreamFailureError("user_abort", "User stopped the run."))).toBe(false);
    expect(isRetryableAmbientProviderError(new AmbientStreamFailureError("stream_closed_before_done", "Partial output.", { responseCharCount: 7 }))).toBe(false);
    expect(isRetryableAmbientProviderError(new AmbientStreamFailureError("network_abort", "Tool started.", { toolCallSeen: true }))).toBe(false);
  });

  it("only treats interrupted streams as replay-safe before semantic output or tool calls", () => {
    expect(isReplaySafeInterruptedStream(new AmbientStreamFailureError("pre_stream_timeout", "Ambient/Pi did not start streaming."))).toBe(true);
    expect(isReplaySafeInterruptedStream(new AmbientStreamFailureError("stream_idle_timeout", "Ambient/Pi stream stalled."))).toBe(true);
    expect(isReplaySafeInterruptedStream(new AmbientStreamFailureError("stream_idle_timeout", "Ambient/Pi stream stalled.", { semanticOutputSeen: true }))).toBe(false);
    expect(isReplaySafeInterruptedStream(new AmbientStreamFailureError("stream_idle_timeout", "Ambient/Pi stream stalled.", { toolCallSeen: true }))).toBe(false);
    expect(isReplaySafeInterruptedStream(new AmbientStreamFailureError("user_abort", "User stopped the run."))).toBe(false);
  });
});
