import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONAL_BACKGROUND_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS,
  DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS,
  enumValue,
  MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS,
  MIN_REQUIRED_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS,
  objectInput,
  optionalString,
  requiredString,
  resolveRequiredSubagentPiToolWaitTimeoutFloorMs,
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

  it("uses a ten-minute required-child default and floor for Pi-visible waits", () => {
    expect(resolveSubagentPiToolWaitTimeoutMs({})).toBe(DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: Number.NaN } })).toBe(DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: -20 } })).toBe(MIN_REQUIRED_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: 12.9 } })).toBe(MIN_REQUIRED_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: 900_000 } })).toBe(900_000);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: 90 * 60_000 } })).toBe(MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
  });

  it("allows shorter optional-background progress waits", () => {
    const options = { waitBarrierMode: "optional_background" as const };
    expect(resolveSubagentPiToolWaitTimeoutMs({}, options)).toBe(DEFAULT_OPTIONAL_BACKGROUND_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: -20 } }, options)).toBe(0);
    expect(resolveSubagentPiToolWaitTimeoutMs({ wait: { timeoutMs: 12.9 } }, options)).toBe(12);
  });

  it("keeps the required floor configurable for deterministic tests", () => {
    expect(resolveRequiredSubagentPiToolWaitTimeoutFloorMs({
      AMBIENT_SUBAGENT_REQUIRED_WAIT_TIMEOUT_FLOOR_MS: "250",
    })).toBe(250);
    expect(resolveSubagentPiToolWaitTimeoutMs(
      { wait: { timeoutMs: 1 } },
      { env: { AMBIENT_SUBAGENT_REQUIRED_WAIT_TIMEOUT_FLOOR_MS: "250" } },
    )).toBe(250);
  });

  it("coerces non-object inputs to empty records without preserving arrays", () => {
    expect(objectInput(undefined)).toEqual({});
    expect(objectInput(["action"])).toEqual({});
    expect(objectInput({ action: "spawn_agent" })).toEqual({ action: "spawn_agent" });
  });
});
