import { describe, expect, it } from "vitest";

import {
  nextProjectBoardPlanPickerOpen,
  projectBoardThreadPlanActionForShell,
  projectBoardTopbarActionTitle,
} from "./AppProjectBoardShellControls";

describe("AppProjectBoardShellControls", () => {
  it("hides ready planner plans while workflow recording suppresses project boards", () => {
    expect(projectBoardThreadPlanActionForShell({
      busy: false,
      hasBoard: true,
      readyPlanCount: 2,
      suppressesProjectBoard: true,
    })).toMatchObject({
      kind: "no_ready_plan",
      disabled: true,
    });
  });

  it("keeps the topbar project-board title local unless another workspace is active", () => {
    expect(projectBoardTopbarActionTitle({
      actionKind: "open",
      actionTitle: "Open board",
      activeWorkspacePath: "/workspace/app",
      workspaceName: "App",
      workspacePath: "/workspace/app",
    })).toBe("Open board");

    expect(projectBoardTopbarActionTitle({
      actionKind: "open",
      actionTitle: "Open board",
      activeWorkspacePath: "/workspace/app/.ambient/tasks/task-1",
      workspaceName: "App",
      workspacePath: "/workspace/app",
    })).toBe("Open board. This opens the project board for App; this chat is running in /workspace/app/.ambient/tasks/task-1.");
  });

  it("toggles the planner picker only for enabled multi-plan actions", () => {
    expect(nextProjectBoardPlanPickerOpen({
      currentOpen: false,
      disabled: false,
      readyPlanCount: 2,
      suppressesProjectBoard: false,
    })).toBe(true);

    expect(nextProjectBoardPlanPickerOpen({
      currentOpen: false,
      disabled: false,
      readyPlanCount: 1,
      suppressesProjectBoard: false,
    })).toBe(false);

    expect(nextProjectBoardPlanPickerOpen({
      currentOpen: true,
      disabled: true,
      readyPlanCount: 2,
      suppressesProjectBoard: false,
    })).toBe(true);
  });
});
