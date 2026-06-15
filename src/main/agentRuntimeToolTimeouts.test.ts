import { describe, expect, it } from "vitest";

import { agentRuntimeToolExecutionIdleTimeoutMsForTool } from "./agentRuntimeToolTimeouts";

describe("agentRuntimeToolExecutionIdleTimeoutMsForTool", () => {
  it("honors longer first-party Desktop tool descriptor timeouts", () => {
    expect(agentRuntimeToolExecutionIdleTimeoutMsForTool(120_000, "ambient_visual_analyze")).toBe(360_000);
    expect(agentRuntimeToolExecutionIdleTimeoutMsForTool(120_000, "ambient_local_deep_research_run")).toBe(900_000);
    expect(agentRuntimeToolExecutionIdleTimeoutMsForTool(120_000, "browser_click")).toBe(300_000);
  });

  it("does not shorten the configured default timeout for short or unknown tools", () => {
    expect(agentRuntimeToolExecutionIdleTimeoutMsForTool(120_000, "ambient_git_status")).toBe(120_000);
    expect(agentRuntimeToolExecutionIdleTimeoutMsForTool(120_000, "unknown_tool")).toBe(120_000);
  });
});
