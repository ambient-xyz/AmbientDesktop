import { describe, expect, it } from "vitest";

import {
  automationAutoDispatchStatusFromError,
  automationSurfaceErrorMessage,
} from "./AutomationsWorkspaceSurfaceController";

describe("Automations workspace surface controller helpers", () => {
  it("normalizes unknown surface load errors for UI state", () => {
    expect(automationSurfaceErrorMessage(new Error("Board unavailable"))).toBe("Board unavailable");
    expect(automationSurfaceErrorMessage("offline")).toBe("offline");
  });

  it("models auto-dispatch fallback status when the desktop request fails", () => {
    expect(automationAutoDispatchStatusFromError(new Error("Timer unavailable"))).toEqual({
      enabled: false,
      workflowAllows: true,
      inFlight: false,
      lastError: "Timer unavailable",
      lastStartedRunIds: [],
      lastStartedRuns: [],
    });
  });
});
