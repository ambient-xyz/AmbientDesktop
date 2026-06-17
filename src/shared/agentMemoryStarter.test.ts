import { describe, expect, it } from "vitest";
import {
  AGENT_MEMORY_STARTER_BLOCKER_CODES,
  AGENT_MEMORY_STARTER_NEXT_ACTIONS,
  AGENT_MEMORY_STARTER_STATES,
  agentMemoryStarterPrimaryAction,
  isAgentMemoryStarterTerminalState,
  type AgentMemoryStarterStatus,
} from "./agentMemoryStarter";

describe("agent memory starter contracts", () => {
  it("exports the stable starter state, blocker, and action vocabulary", () => {
    expect(AGENT_MEMORY_STARTER_STATES).toEqual([
      "off",
      "setup_required",
      "installing",
      "starting",
      "ready",
      "needs_repair",
      "disabling",
    ]);
    expect(AGENT_MEMORY_STARTER_BLOCKER_CODES).toEqual(expect.arrayContaining([
      "feature_disabled",
      "global_memory_disabled",
      "thread_memory_disabled",
      "managed_embeddings_disabled",
      "model_missing",
      "runtime_missing",
      "resident_runtime_conflict",
      "native_preflight_failed",
      "embedding_preflight_failed",
    ]));
    expect(AGENT_MEMORY_STARTER_NEXT_ACTIONS).toEqual([
      "enable",
      "install",
      "repair",
      "start",
      "retry_preflight",
      "open_logs",
      "disable",
      "clear_memory",
    ]);
  });

  it("classifies only stable idle states as terminal", () => {
    expect(isAgentMemoryStarterTerminalState("off")).toBe(true);
    expect(isAgentMemoryStarterTerminalState("ready")).toBe(true);
    expect(isAgentMemoryStarterTerminalState("needs_repair")).toBe(true);
    expect(isAgentMemoryStarterTerminalState("setup_required")).toBe(false);
    expect(isAgentMemoryStarterTerminalState("installing")).toBe(false);
    expect(isAgentMemoryStarterTerminalState("starting")).toBe(false);
    expect(isAgentMemoryStarterTerminalState("disabling")).toBe(false);
  });

  it("chooses the primary action from state and safe next actions", () => {
    expect(agentMemoryStarterPrimaryAction(status("off", []))).toBe("enable");
    expect(agentMemoryStarterPrimaryAction(status("setup_required", ["install", "open_logs"]))).toBe("install");
    expect(agentMemoryStarterPrimaryAction(status("setup_required", ["repair"]))).toBe("repair");
    expect(agentMemoryStarterPrimaryAction(status("needs_repair", ["open_logs", "retry_preflight"]))).toBe("retry_preflight");
    expect(agentMemoryStarterPrimaryAction(status("needs_repair", ["start"]))).toBe("start");
    expect(agentMemoryStarterPrimaryAction(status("ready", ["disable"]))).toBe("disable");
    expect(agentMemoryStarterPrimaryAction(status("installing", ["open_logs"]))).toBeUndefined();
  });
});

function status(
  state: AgentMemoryStarterStatus["state"],
  nextActions: AgentMemoryStarterStatus["nextActions"],
): Pick<AgentMemoryStarterStatus, "state" | "nextActions"> {
  return { state, nextActions };
}
