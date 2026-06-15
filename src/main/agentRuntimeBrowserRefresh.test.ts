import { describe, expect, it, vi } from "vitest";

import { refreshAgentRuntimeBrowsersForArtifactChange } from "./agentRuntimeBrowserRefresh";

describe("agentRuntimeBrowserRefresh", () => {
  it("refreshes managed and external browser previews for artifact changes", async () => {
    const refreshWorkspaceArtifact = vi.fn(async () => true);
    const refreshExternalFileBrowserTabs = vi.fn(async () => 2);
    const emitBrowserState = vi.fn();
    const emit = vi.fn();

    await refreshAgentRuntimeBrowsersForArtifactChange(refreshInput(), {
      refreshWorkspaceArtifact,
      refreshExternalFileBrowserTabs,
      emitBrowserState,
      emit,
    });

    expect(refreshWorkspaceArtifact).toHaveBeenCalledWith({
      workspacePath: "/workspace",
      changedPath: "site/index.html",
    });
    expect(refreshExternalFileBrowserTabs).toHaveBeenCalledWith("/workspace", "site/index.html");
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith({
      type: "runtime-activity",
      activity: {
        threadId: "thread-1",
        kind: "browser",
        status: "finished",
        message: "Refreshed preview for site/index.html.",
      },
    });
  });

  it("does not emit browser activity when the managed preview is not refreshed", async () => {
    const refreshWorkspaceArtifact = vi.fn(async () => false);
    const refreshExternalFileBrowserTabs = vi.fn(async () => 1);
    const emitBrowserState = vi.fn();
    const emit = vi.fn();

    await refreshAgentRuntimeBrowsersForArtifactChange(refreshInput(), {
      refreshWorkspaceArtifact,
      refreshExternalFileBrowserTabs,
      emitBrowserState,
      emit,
    });

    expect(refreshWorkspaceArtifact).toHaveBeenCalledOnce();
    expect(refreshExternalFileBrowserTabs).toHaveBeenCalledOnce();
    expect(emitBrowserState).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("keeps external refresh failures from blocking managed preview activity", async () => {
    const refreshWorkspaceArtifact = vi.fn(async () => true);
    const refreshExternalFileBrowserTabs = vi.fn(async () => {
      throw new Error("osascript failed");
    });
    const emitBrowserState = vi.fn();
    const emit = vi.fn();

    await refreshAgentRuntimeBrowsersForArtifactChange(refreshInput(), {
      refreshWorkspaceArtifact,
      refreshExternalFileBrowserTabs,
      emitBrowserState,
      emit,
    });

    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
  });

  it("treats managed refresh failures as not refreshed", async () => {
    const refreshWorkspaceArtifact = vi.fn(async () => {
      throw new Error("managed browser failed");
    });
    const refreshExternalFileBrowserTabs = vi.fn(async () => 1);
    const emitBrowserState = vi.fn();
    const emit = vi.fn();

    await refreshAgentRuntimeBrowsersForArtifactChange(refreshInput(), {
      refreshWorkspaceArtifact,
      refreshExternalFileBrowserTabs,
      emitBrowserState,
      emit,
    });

    expect(refreshExternalFileBrowserTabs).toHaveBeenCalledOnce();
    expect(emitBrowserState).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

function refreshInput() {
  return {
    threadId: "thread-1",
    workspacePath: "/workspace",
    artifactPath: "site/index.html",
  };
}
