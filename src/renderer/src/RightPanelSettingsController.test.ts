import { describe, expect, it } from "vitest";

import { agentMemoryStarterEnableInputForMode } from "./RightPanelSettingsController";

describe("RightPanelSettingsController", () => {
  it("does not opt the active thread into memory during per-thread health setup", () => {
    expect(agentMemoryStarterEnableInputForMode("per_thread")).toEqual({
      enableCurrentThread: false,
      enableNewThreads: false,
    });
  });

  it("keeps globally enabled setup global without changing the active thread flag", () => {
    expect(agentMemoryStarterEnableInputForMode("enabled_all")).toEqual({
      enableCurrentThread: false,
      enableNewThreads: true,
    });
  });

  it("turns the current thread and new-thread default on when enabling from disabled", () => {
    expect(agentMemoryStarterEnableInputForMode("disabled")).toEqual({
      enableCurrentThread: true,
      enableNewThreads: true,
    });
  });
});
