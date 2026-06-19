import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { RunStatus } from "../../shared/threadTypes";
import {
  createAppWorkspaceNavigationControls,
  workspaceReplacementRunStatuses,
  workspaceThreadSelectionRequest,
} from "./AppWorkspaceNavigationControls";

function desktopState(threadRunStatuses?: Record<string, RunStatus>): DesktopState {
  return { threadRunStatuses } as DesktopState;
}

function navigationState({
  activeThreadId = "thread-1",
  activeWorkspacePath = "/repo",
  threadRunStatuses,
}: {
  activeThreadId?: string;
  activeWorkspacePath?: string;
  threadRunStatuses?: Record<string, RunStatus>;
} = {}): DesktopState {
  return {
    activeThreadId,
    activeWorkspace: { path: activeWorkspacePath },
    threadRunStatuses,
  } as DesktopState;
}

function createRecorder({ rememberDesktopStateResult }: { rememberDesktopStateResult?: false | DesktopState } = {}) {
  const calls: {
    composerDraftOptions: Array<{ clearSlashCommandSelection?: boolean } | undefined>;
    composerDrafts: string[];
    focusCount: number;
    projectBoardOpen: boolean[];
    projectPopovers: unknown[];
    projectsCollapsed: boolean[];
    remembered: DesktopState[];
    runStatuses: RunStatus[];
    sidebarAreas: string[];
    states: DesktopState[];
    threadRunStatuses: Record<string, RunStatus>[];
    workspaceRevision: number;
  } = {
    composerDraftOptions: [],
    composerDrafts: [],
    focusCount: 0,
    projectBoardOpen: [],
    projectPopovers: [],
    projectsCollapsed: [],
    remembered: [],
    runStatuses: [],
    sidebarAreas: [],
    states: [],
    threadRunStatuses: [],
    workspaceRevision: 0,
  };
  const controls = createAppWorkspaceNavigationControls({
    activeWorkspacePath: "/repo",
    applyCreatedThreadState: () => true,
    closeProjectBoard: () => calls.projectBoardOpen.push(false),
    currentWorkspacePath: "/repo",
    openNewWorkflowComposer: () => undefined,
    projectIdForWorkspacePath: (workspacePath) => `project:${workspacePath}`,
    rememberDesktopState: (next) => {
      calls.remembered.push(next);
      return rememberDesktopStateResult;
    },
    scheduleComposerFocusEnd: () => {
      calls.focusCount += 1;
    },
    setComposerDraft: (value, options) => {
      calls.composerDrafts.push(value);
      calls.composerDraftOptions.push(options);
    },
    setProjectPopover: (value) => {
      calls.projectPopovers.push(typeof value === "function" ? value(undefined) : value);
    },
    setProjectsCollapsed: (value) => {
      calls.projectsCollapsed.push(typeof value === "function" ? value(true) : value);
    },
    setRunStatus: (value) => {
      calls.runStatuses.push(typeof value === "function" ? value("idle") : value);
    },
    setSidebarArea: (value) => {
      calls.sidebarAreas.push(typeof value === "function" ? value("projects") : value);
    },
    setState: (value) => {
      const next = typeof value === "function" ? value(undefined) : value;
      if (next) calls.states.push(next);
    },
    setThreadRunStatuses: (value) => {
      calls.threadRunStatuses.push(typeof value === "function" ? value({}) : value);
    },
    setWorkspaceRevision: (value) => {
      calls.workspaceRevision = typeof value === "function" ? value(calls.workspaceRevision) : value;
    },
    sidebarArea: "projects",
    threadRunStatuses: { existing: "streaming" },
  });
  return { calls, controls };
}

describe("App workspace navigation controls", () => {
  it("replaces run statuses when loading a new workspace", () => {
    expect(workspaceReplacementRunStatuses(desktopState({ "thread-1": "streaming" }))).toEqual({
      "thread-1": "streaming",
    });
    expect(workspaceReplacementRunStatuses(desktopState())).toEqual({});
  });

  it("selects a thread directly inside the current workspace", () => {
    expect(workspaceThreadSelectionRequest({
      currentWorkspacePath: "/repo",
      projectIdForWorkspacePath: () => {
        throw new Error("project lookup should not be needed");
      },
      threadId: "thread-1",
      workspacePath: "/repo",
    })).toEqual({ kind: "thread", threadId: "thread-1" });
  });

  it("selects a project when the target thread belongs to another workspace", () => {
    expect(workspaceThreadSelectionRequest({
      currentWorkspacePath: "/repo",
      projectIdForWorkspacePath: (workspacePath) => `project:${workspacePath}`,
      threadId: "thread-2",
      workspacePath: "/other",
    })).toEqual({ kind: "project", projectId: "project:/other", threadId: "thread-2" });
  });

  it("ignores thread selection without a workspace path", () => {
    expect(workspaceThreadSelectionRequest({
      currentWorkspacePath: "/repo",
      projectIdForWorkspacePath: (workspacePath) => `project:${workspacePath}`,
      threadId: "thread-2",
      workspacePath: undefined,
    })).toBeUndefined();
  });

  it("ignores stale loaded-workspace desktop state without destructive cleanup", async () => {
    const next = navigationState({ activeWorkspacePath: "/other" });
    const { calls, controls } = createRecorder({ rememberDesktopStateResult: false });
    vi.stubGlobal("window", { ambientDesktop: { openWorkspace: vi.fn().mockResolvedValue(next) } });

    await controls.openWorkspace();

    expect(calls.remembered).toEqual([next]);
    expect(calls.states).toEqual([]);
    expect(calls.threadRunStatuses).toEqual([]);
    expect(calls.runStatuses).toEqual([]);
    expect(calls.sidebarAreas).toEqual([]);
    expect(calls.composerDrafts).toEqual([]);
    expect(calls.projectsCollapsed).toEqual([]);
    expect(calls.projectPopovers).toEqual([]);
    expect(calls.projectBoardOpen).toEqual([]);
    expect(calls.workspaceRevision).toBe(0);
    expect(calls.focusCount).toBe(0);
  });

  it("ignores stale project-selection desktop state without destructive cleanup", async () => {
    const next = navigationState({ activeThreadId: "thread-2", activeWorkspacePath: "/other" });
    const selectProject = vi.fn().mockResolvedValue(next);
    const { calls, controls } = createRecorder({ rememberDesktopStateResult: false });
    vi.stubGlobal("window", { ambientDesktop: { selectProject } });

    await controls.selectProject("/other");

    expect(selectProject).toHaveBeenCalledWith({ projectId: "project:/other" });
    expect(calls.remembered).toEqual([next]);
    expect(calls.states).toEqual([]);
    expect(calls.threadRunStatuses).toEqual([]);
    expect(calls.runStatuses).toEqual([]);
    expect(calls.sidebarAreas).toEqual([]);
    expect(calls.projectBoardOpen).toEqual([]);
    expect(calls.composerDrafts).toEqual([]);
    expect(calls.workspaceRevision).toBe(0);
  });
});
