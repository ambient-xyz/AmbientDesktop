import { describe, expect, it, vi } from "vitest";

import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { createAgentRuntimeRemoteSurfaceControls } from "./agentRuntimeRemoteSurfaceControls";

describe("AgentRuntime remote surface controls", () => {
  it("owns pending project switches and completes them through runtime events", async () => {
    const switchProject = vi.fn(async () => undefined);
    const updateRuntimeEvent = vi.fn();
    const controls = createAgentRuntimeRemoteSurfaceControls({
      store: storeStub(),
      features: {
        projects: {
          switchProject,
        },
      } as AgentRuntimeFeatures,
      remoteSurfaceRuntimeEvents: () => ({ update: updateRuntimeEvent } as never),
      emitError: vi.fn(),
    });
    const projectSwitch = {
      runtimeEventId: "event-1",
      workspacePath: "/next",
      reason: "Remote owner requested project switch.",
      projectName: "Next",
    };

    controls.pendingProjectSwitchByThreadId.set("thread-1", projectSwitch);

    expect(controls.takePendingProjectSwitch("thread-1")).toBe(projectSwitch);
    expect(controls.takePendingProjectSwitch("thread-1")).toBeUndefined();
    await expect(controls.completePendingProjectSwitch(projectSwitch)).resolves.toBe("completed");
    expect(switchProject).toHaveBeenCalledWith({
      workspacePath: "/next",
      reason: "Remote owner requested project switch.",
    });
    expect(updateRuntimeEvent).toHaveBeenCalledWith("event-1", expect.objectContaining({
      relaySuggested: true,
      status: "completed",
      summary: "Active Ambient project switched to Next.",
    }));
  });

  it("delegates workflow recovery event discovery to the workflow store", () => {
    const store = storeStub();
    const controls = createAgentRuntimeRemoteSurfaceControls({
      store,
      features: {},
      remoteSurfaceRuntimeEvents: () => ({ update: vi.fn() } as never),
      emitError: vi.fn(),
    });

    expect(controls.workflowRecoveryEvents()).toEqual([]);
    expect(store.listWorkflowAgentFolders).toHaveBeenCalledTimes(1);
  });
});

function storeStub(): Pick<ProjectStore, "getWorkflowArtifact" | "listWorkflowAgentFolders" | "listWorkflowRunEvents"> {
  return {
    getWorkflowArtifact: vi.fn(() => ({ statePath: "/workspace/.ambient/workflow.json" }) as never),
    listWorkflowAgentFolders: vi.fn(() => []),
    listWorkflowRunEvents: vi.fn(() => []),
  };
}
