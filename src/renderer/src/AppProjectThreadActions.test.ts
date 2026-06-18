import { describe, expect, it } from "vitest";

import type { ProjectSummary } from "../../shared/projectBoardTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  projectIdForWorkspacePath,
  sidebarMenuPosition,
  threadActionInputForMenu,
  threadDeeplinkForMenu,
  threadSessionIdForMenu,
  threadWorkingDirectoryForMenu,
} from "./AppProjectThreadActions";
import type { ThreadContextMenuState } from "./AppActionDialogs";

function project(input: Partial<ProjectSummary> & Pick<ProjectSummary, "id" | "path">): ProjectSummary {
  return {
    name: input.path,
    pinned: false,
    threads: [],
    ...input,
  } as ProjectSummary;
}

function thread(input: Partial<ThreadSummary> & Pick<ThreadSummary, "id" | "workspacePath">): ThreadSummary {
  return {
    title: input.id,
    updatedAt: "2026-06-13T00:00:00.000Z",
    unread: false,
    pinned: false,
    ...input,
  } as ThreadSummary;
}

describe("App project/thread actions", () => {
  it("resolves project ids for workspace paths", () => {
    const projects = [
      project({ id: "project-1", path: "/repo" }),
      project({ id: "project-2", path: "/other" }),
    ];

    expect(projectIdForWorkspacePath(projects, "/other")).toBe("project-2");
    expect(() => projectIdForWorkspacePath(projects, "/missing")).toThrow("Project is not registered");
  });

  it("clamps sidebar menu coordinates inside the viewport", () => {
    expect(sidebarMenuPosition({
      clientX: 500,
      clientY: 700,
      menuWidth: 280,
      menuHeight: 330,
      viewportWidth: 640,
      viewportHeight: 800,
    })).toEqual({ x: 360, y: 470 });
    expect(sidebarMenuPosition({
      clientX: -40,
      clientY: -10,
      menuWidth: 280,
      menuHeight: 330,
      viewportWidth: 640,
      viewportHeight: 800,
    })).toEqual({ x: 8, y: 8 });
  });

  it("builds thread action inputs from the owning project", () => {
    const menu: ThreadContextMenuState = {
      thread: thread({ id: "thread-1", workspacePath: "/repo/worktree" }),
      workspacePath: "/repo",
      x: 20,
      y: 30,
    };

    expect(threadActionInputForMenu(menu, [project({ id: "project-1", path: "/repo" })])).toEqual({
      projectId: "project-1",
      threadId: "thread-1",
    });
    expect(threadActionInputForMenu(undefined, [])).toBeUndefined();
  });

  it("uses active worktrees for thread working directories", () => {
    expect(threadWorkingDirectoryForMenu(thread({
      id: "thread-1",
      workspacePath: "/repo",
      gitWorktree: {
        status: "active",
        threadId: "thread-1",
        branchName: "thread-1",
        projectRoot: "/repo",
        worktreePath: "/repo/.ambient-codex/worktrees/thread-1",
        createdAt: "2026-06-13T00:00:00.000Z",
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    }))).toBe("/repo/.ambient-codex/worktrees/thread-1");
    expect(threadWorkingDirectoryForMenu(thread({
      id: "thread-2",
      workspacePath: "/repo",
      gitWorktree: {
        status: "missing",
        threadId: "thread-2",
        branchName: "thread-2",
        projectRoot: "/repo",
        worktreePath: "/repo/.ambient-codex/worktrees/thread-2",
        createdAt: "2026-06-13T00:00:00.000Z",
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    }))).toBe("/repo");
  });

  it("derives copyable thread session identifiers and deeplinks", () => {
    const menu: ThreadContextMenuState = {
      thread: thread({
        id: "thread-1",
        workspacePath: "/repo",
        piSessionFile: "/tmp/sessions/session-123.jsonl",
      }),
      workspacePath: "/repo with spaces",
      x: 20,
      y: 30,
    };

    expect(threadSessionIdForMenu(menu.thread)).toBe("session-123");
    expect(threadSessionIdForMenu(thread({ id: "thread-2", workspacePath: "/repo" }))).toBe("thread-2");
    expect(threadDeeplinkForMenu(menu)).toBe("ambient://thread/thread-1?workspace=%2Frepo%20with%20spaces");
  });
});
