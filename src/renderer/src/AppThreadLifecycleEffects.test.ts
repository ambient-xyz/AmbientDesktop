import { describe, expect, it } from "vitest";

import type { ChatMessage, DesktopState } from "../../shared/types";
import {
  appMessageActivityKindMap,
  clearAppDesktopStateRefs,
  rememberAppDesktopStateRefs,
  type AppDesktopStateRefs,
} from "./AppThreadLifecycleEffects";

describe("AppThreadLifecycleEffects", () => {
  it("tracks active thread and project refs while preserving workspace aliases", () => {
    const refs = refsForTest();
    rememberAppDesktopStateRefs(desktopState(), refs);

    expect(refs.activeThreadIdRef.current).toBe("thread-1");
    expect(refs.activeProjectRootRef.current).toBe("/workspace");
    expect(refs.workspaceProjectAliasesRef.current["/workspace"]).toBe("/workspace");
    expect(refs.workspaceProjectAliasesRef.current["/worktrees/thread-1"]).toBe("/workspace");

    clearAppDesktopStateRefs(refs);

    expect(refs.activeThreadIdRef.current).toBeUndefined();
    expect(refs.activeProjectRootRef.current).toBeUndefined();
    expect(refs.workspaceProjectAliasesRef.current["/worktrees/thread-1"]).toBe("/workspace");
  });

  it("derives message activity kinds for App event streaming", () => {
    expect(appMessageActivityKindMap([
      message({ id: "user-1", role: "user" }),
      message({ id: "assistant-1", role: "assistant" }),
      message({ id: "thinking-1", role: "assistant", metadata: { kind: "thinking" } }),
      message({ id: "tool-1", role: "tool" }),
    ])).toEqual({
      "assistant-1": "assistant",
      "thinking-1": "thinking",
      "tool-1": "tool",
      "user-1": "user",
    });
  });
});

function refsForTest(): AppDesktopStateRefs {
  return {
    activeProjectRootRef: { current: undefined },
    activeThreadIdRef: { current: undefined },
    workspaceProjectAliasesRef: { current: {} },
  };
}

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id ?? "message",
    threadId: overrides.threadId ?? "thread-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function desktopState(): DesktopState {
  const thread = {
    id: "thread-1",
    title: "Thread",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    messageCount: 0,
    workspacePath: "/workspace",
    gitWorktree: {
      projectRoot: "/workspace",
      worktreePath: "/worktrees/thread-1",
      branch: "thread-1",
    },
  };
  return {
    activeThreadId: "thread-1",
    activeWorkspace: { name: "Thread workspace", path: "/worktrees/thread-1" },
    automationFolders: [],
    projects: [{ id: "project-1", name: "Project", path: "/workspace", threads: [thread] }],
    threads: [thread],
    workspace: { name: "Project", path: "/workspace" },
    workflowAgentFolders: [],
  } as unknown as DesktopState;
}
