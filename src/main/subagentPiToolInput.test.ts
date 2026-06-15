import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS,
  enumValue,
  MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS,
  objectInput,
  optionalString,
  requiredString,
  resolveSubagentPiToolInput,
  resolveSubagentPiToolWaitTimeoutMs,
  SUBAGENT_PI_TOOL_INPUT_SCHEMA_VERSION,
} from "./subagentPiToolInput";

describe("subagentPiToolInput", () => {
  const actions = ["spawn_agent", "wait_agent", "close_agent"] as const;

  it("resolves typed Pi tool inputs from object params only", () => {
    expect(SUBAGENT_PI_TOOL_INPUT_SCHEMA_VERSION).toBe("ambient-subagent-pi-tool-input-v1");
    expect(resolveSubagentPiToolInput({ action: " wait_agent ", wait: { timeoutMs: 12 } }, actions)).toEqual({
      input: { action: " wait_agent ", wait: { timeoutMs: 12 } },
      action: "wait_agent",
    });
    expect(() => resolveSubagentPiToolInput(["wait_agent"], actions)).toThrow(
      "action must be one of spawn_agent, wait_agent, close_agent.",
    );
  });

  it("normalizes optional and required string values with precise validation errors", () => {
    expect(optionalString("  child-a  ")).toBe("child-a");
    expect(optionalString("  ")).toBeUndefined();
    expect(optionalString(12)).toBeUndefined();
    expect(requiredString({ message: "  continue  " }, "message")).toBe("continue");
    expect(() => requiredString({ message: " " }, "message")).toThrow("message is required.");
    expect(enumValue(" close_agent ", actions, "action")).toBe("close_agent");
    expect(() => enumValue("cancel_agent", actions, "action")).toThrow(
      "action must be one of spawn_agent, wait_agent, close_agent.",
    );
  });

  it("clamps wait timeouts to the bounded Pi-visible wait contract", () => {
    expect(resolveSubagentPiToolWaitTimeoutMs({})).toBe(DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: Number.NaN } })).toBe(DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: -20 } })).toBe(0);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: 12.9 } })).toBe(12);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: 900_000 } })).toBe(MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
  });

  it("coerces non-object inputs to empty records without preserving arrays", () => {
    expect(objectInput(undefined)).toEqual({});
    expect(objectInput(["action"])).toEqual({});
    expect(objectInput({ action: "spawn_agent" })).toEqual({ action: "spawn_agent" });
  });
});
