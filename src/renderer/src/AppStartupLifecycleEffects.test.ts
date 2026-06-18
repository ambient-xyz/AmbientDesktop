import { describe, expect, it } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import {
  appBootstrapRunStatus,
  shouldRunMcpContainerRuntimeStartupCheck,
} from "./AppStartupLifecycleEffects";

describe("AppStartupLifecycleEffects", () => {
  it("derives the active thread run status from bootstrap state", () => {
    expect(appBootstrapRunStatus({
      activeThreadId: "thread-1",
      threadRunStatuses: { "thread-1": "streaming" },
    })).toBe("streaming");
    expect(appBootstrapRunStatus({ activeThreadId: "thread-1" })).toBe("idle");
  });

  it("runs the MCP startup check only once after state is available", () => {
    expect(shouldRunMcpContainerRuntimeStartupCheck({ state: undefined, alreadyChecked: false })).toBe(false);
    expect(shouldRunMcpContainerRuntimeStartupCheck({ state: desktopState(), alreadyChecked: true })).toBe(false);
    expect(shouldRunMcpContainerRuntimeStartupCheck({ state: desktopState(), alreadyChecked: false })).toBe(true);
  });
});

function desktopState(): DesktopState {
  return {
    activeThreadId: "thread-1",
    workspace: { name: "Project", path: "/workspace" },
  } as unknown as DesktopState;
}
