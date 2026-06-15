import { describe, expect, it } from "vitest";

import type { DesktopState, RunStatus } from "../../shared/types";
import {
  workspaceReplacementRunStatuses,
  workspaceThreadSelectionRequest,
} from "./AppWorkspaceNavigationControls";

function desktopState(threadRunStatuses?: Record<string, RunStatus>): DesktopState {
  return { threadRunStatuses } as DesktopState;
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
});
