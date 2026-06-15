import { describe, expect, it } from "vitest";
import {
  localToolIdleTimeoutMs,
  unknownErrorMessage,
} from "./agentRuntimeUtilityHelpers";

describe("agentRuntimeUtilityHelpers", () => {
  it("uses the default local tool idle timeout unless a positive env override is provided", () => {
    expect(localToolIdleTimeoutMs({})).toBe(120_000);
    expect(localToolIdleTimeoutMs({ AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS: "30000" })).toBe(30_000);
    expect(localToolIdleTimeoutMs({ AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS: "2.7" })).toBe(3);
    expect(localToolIdleTimeoutMs({ AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS: "0" })).toBe(120_000);
    expect(localToolIdleTimeoutMs({ AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS: "-1" })).toBe(120_000);
    expect(localToolIdleTimeoutMs({ AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS: "not-a-number" })).toBe(120_000);
  });

  it("formats unknown errors the same way as the runtime did", () => {
    expect(unknownErrorMessage(new Error("boom"))).toBe("boom");
    expect(unknownErrorMessage("plain failure")).toBe("plain failure");
    expect(unknownErrorMessage(undefined)).toBe("undefined");
    expect(unknownErrorMessage({ code: "bad" })).toBe("[object Object]");
  });
});
