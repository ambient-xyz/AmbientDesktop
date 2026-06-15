import { describe, expect, it } from "vitest";

import {
  pendingProjectComposerDraftValue,
  shouldRefreshAutomationSidebar,
  subagentFallbackSelection,
} from "./AppSidebarLifecycleEffects";

describe("AppSidebarLifecycleEffects", () => {
  it("refreshes automation sidebar data only while the automation area is active", () => {
    expect(shouldRefreshAutomationSidebar("automations")).toBe(true);
    expect(shouldRefreshAutomationSidebar("projects")).toBe(false);
  });

  it("routes hidden subagent child threads back to their parent thread", () => {
    expect(subagentFallbackSelection({
      activeThreadKind: "subagent_child",
      activeThreadParentThreadId: "parent-1",
      activeThreadWorkspacePath: "/workspace/child",
      subagentUiEnabled: false,
      workspacePath: "/workspace",
    })).toEqual({
      threadId: "parent-1",
      workspacePath: "/workspace/child",
    });

    expect(subagentFallbackSelection({
      activeThreadKind: "subagent_child",
      activeThreadParentThreadId: "parent-1",
      activeThreadWorkspacePath: undefined,
      subagentUiEnabled: false,
      workspacePath: "/workspace",
    })).toEqual({
      threadId: "parent-1",
      workspacePath: "/workspace",
    });
  });

  it("does not route when subagent UI is enabled or the active thread is not a child", () => {
    expect(subagentFallbackSelection({
      activeThreadKind: "subagent_child",
      activeThreadParentThreadId: "parent-1",
      activeThreadWorkspacePath: "/workspace/child",
      subagentUiEnabled: true,
      workspacePath: "/workspace",
    })).toBeUndefined();

    expect(subagentFallbackSelection({
      activeThreadKind: "chat",
      activeThreadParentThreadId: "parent-1",
      activeThreadWorkspacePath: "/workspace/child",
      subagentUiEnabled: false,
      workspacePath: "/workspace",
    })).toBeUndefined();

    expect(subagentFallbackSelection({
      activeThreadKind: "subagent_child",
      activeThreadParentThreadId: undefined,
      activeThreadWorkspacePath: "/workspace/child",
      subagentUiEnabled: false,
      workspacePath: "/workspace",
    })).toBeUndefined();
  });

  it("flushes pending project composer drafts only in the project sidebar area", () => {
    const pending = { value: "Draft prompt", nonce: 1 };
    expect(pendingProjectComposerDraftValue(pending, "projects")).toBe("Draft prompt");
    expect(pendingProjectComposerDraftValue(pending, "automations")).toBeUndefined();
    expect(pendingProjectComposerDraftValue(undefined, "projects")).toBeUndefined();
  });
});
