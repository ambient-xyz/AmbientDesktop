import { describe, expect, it } from "vitest";

import type { DesktopEvent } from "../../shared/types";
import {
  createAppDesktopEventGuards,
  desktopEventMatchesWorkspaceProject,
  promptRequestMatchesProject,
  promptRequestWorkspacePath,
} from "./AppDesktopEventGuards";
import type { WorkspaceProjectAliases } from "./workspaceEventMatching";

describe("App desktop event guards", () => {
  it("uses project path before request workspace and event workspace fallbacks", () => {
    expect(promptRequestWorkspacePath(
      { projectPath: "/project", workspacePath: "/workspace" },
      "/event-workspace",
    )).toBe("/project");
    expect(promptRequestWorkspacePath({ workspacePath: "/workspace" }, "/event-workspace")).toBe("/workspace");
    expect(promptRequestWorkspacePath({}, "/event-workspace")).toBe("/event-workspace");
  });

  it("matches unscoped prompts and active-project prompts", () => {
    expect(promptRequestMatchesProject({}, "/repo")).toBe(true);
    expect(promptRequestMatchesProject({ workspacePath: "/repo" }, "/repo")).toBe(true);
    expect(promptRequestMatchesProject({ workspacePath: "/other" }, undefined)).toBe(true);
    expect(promptRequestMatchesProject({ projectPath: "/repo", workspacePath: "/other" }, "/repo")).toBe(true);
    expect(promptRequestMatchesProject({ workspacePath: "/other" }, "/repo")).toBe(false);
  });

  it("matches desktop events through workspace aliases", () => {
    const aliases: WorkspaceProjectAliases = {
      "/repo": "/repo",
      "/repo/.ambient-codex/worktrees/thread-1": "/repo",
    };
    const event = {
      type: "run-status",
      workspacePath: "/repo/.ambient-codex/worktrees/thread-1",
      threadId: "thread-1",
      status: "starting",
    } as DesktopEvent;

    expect(desktopEventMatchesWorkspaceProject(event, "/repo", aliases)).toBe(true);
    expect(desktopEventMatchesWorkspaceProject(event, "/other", aliases)).toBe(false);
  });

  it("creates ref-backed active-project guards for App event handlers", () => {
    const activeProjectRootRef = { current: "/repo" };
    const workspaceProjectAliasesRef = {
      current: {
        "/repo/.ambient-codex/worktrees/thread-1": "/repo",
      } satisfies WorkspaceProjectAliases,
    };
    const guards = createAppDesktopEventGuards({ activeProjectRootRef, workspaceProjectAliasesRef });
    const event: DesktopEvent = {
      type: "run-status",
      workspacePath: "/repo/.ambient-codex/worktrees/thread-1",
      threadId: "thread-1",
      status: "starting",
    };

    expect(guards.desktopEventMatchesActiveProject(event)).toBe(true);
    expect(guards.promptRequestMatchesActiveProject({ workspacePath: "/other" })).toBe(false);

    activeProjectRootRef.current = "/other";

    expect(guards.desktopEventMatchesActiveProject(event)).toBe(false);
    expect(guards.promptRequestMatchesActiveProject({ workspacePath: "/other" })).toBe(true);
  });
});
