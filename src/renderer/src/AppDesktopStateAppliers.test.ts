import { describe, expect, it } from "vitest";

import type { DesktopState, RunStatus } from "../../shared/types";
import {
  appDesktopWorkspaceChanged,
  createAppDesktopStateAppliers,
  mergeAppDesktopRunStatuses,
  runStatusForDesktopState,
} from "./AppDesktopStateAppliers";

function desktopState({
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
  } as unknown as DesktopState;
}

function createRecorder() {
  const calls: {
    composerDrafts: string[];
    projectBoardOpen: boolean[];
    remembered: DesktopState[];
    runStatuses: RunStatus[];
    sidebarAreas: string[];
    states: DesktopState[];
    threadRunStatuses: Record<string, RunStatus>[];
    workspaceRevision: number;
  } = {
    composerDrafts: [],
    projectBoardOpen: [],
    remembered: [],
    runStatuses: [],
    sidebarAreas: [],
    states: [],
    threadRunStatuses: [],
    workspaceRevision: 0,
  };
  const appliers = createAppDesktopStateAppliers({
    activeWorkspacePath: "/repo",
    closeProjectBoard: () => calls.projectBoardOpen.push(false),
    rememberDesktopState: (next) => calls.remembered.push(next),
    setComposerDraft: (value) => calls.composerDrafts.push(value),
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
    threadRunStatuses: { existing: "streaming" },
  });
  return { appliers, calls };
}

describe("App desktop state appliers", () => {
  it("merges run status snapshots and derives the active thread status", () => {
    const next = desktopState({
      activeThreadId: "thread-2",
      threadRunStatuses: { "thread-2": "tool" },
    });
    const merged = mergeAppDesktopRunStatuses({ "thread-1": "streaming" }, next);

    expect(merged).toEqual({ "thread-1": "streaming", "thread-2": "tool" });
    expect(runStatusForDesktopState(next, merged)).toBe("tool");
    expect(runStatusForDesktopState(desktopState({ activeThreadId: "missing" }), merged)).toBe("idle");
  });

  it("detects active workspace path changes", () => {
    expect(appDesktopWorkspaceChanged(desktopState({ activeWorkspacePath: "/repo" }), "/repo")).toBe(false);
    expect(appDesktopWorkspaceChanged(desktopState({ activeWorkspacePath: "/other" }), "/repo")).toBe(true);
  });

  it("applies project-action desktop state and clears composer state after workspace changes", () => {
    const { appliers, calls } = createRecorder();
    const next = desktopState({
      activeThreadId: "thread-2",
      activeWorkspacePath: "/other",
      threadRunStatuses: { "thread-2": "retrying" },
    });

    appliers.applyProjectActionState(next);

    expect(calls.threadRunStatuses).toEqual([{ existing: "streaming", "thread-2": "retrying" }]);
    expect(calls.remembered).toEqual([next]);
    expect(calls.states).toEqual([next]);
    expect(calls.sidebarAreas).toEqual(["projects"]);
    expect(calls.runStatuses).toEqual(["retrying"]);
    expect(calls.composerDrafts).toEqual([""]);
    expect(calls.workspaceRevision).toBe(1);
  });

  it("applies created-thread desktop state while preserving same-workspace revision", () => {
    const { appliers, calls } = createRecorder();
    const next = desktopState({
      activeThreadId: "thread-3",
      activeWorkspacePath: "/repo",
      threadRunStatuses: { "thread-3": "starting" },
    });

    appliers.applyCreatedThreadState(next, "/repo");

    expect(calls.threadRunStatuses).toEqual([{ existing: "streaming", "thread-3": "starting" }]);
    expect(calls.sidebarAreas).toEqual(["projects"]);
    expect(calls.runStatuses).toEqual(["starting"]);
    expect(calls.composerDrafts).toEqual([""]);
    expect(calls.projectBoardOpen).toEqual([false]);
    expect(calls.workspaceRevision).toBe(0);
  });

  it("applies automation desktop state without clearing the composer", () => {
    const { appliers, calls } = createRecorder();
    const next = desktopState({
      activeThreadId: "thread-4",
      activeWorkspacePath: "/other",
      threadRunStatuses: { "thread-4": "idle" },
    });

    appliers.applyAutomationDesktopState(next);

    expect(calls.runStatuses).toEqual(["idle"]);
    expect(calls.composerDrafts).toEqual([]);
    expect(calls.sidebarAreas).toEqual([]);
    expect(calls.workspaceRevision).toBe(1);
  });
});
