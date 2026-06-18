import { describe, expect, it } from "vitest";

import type {
  AmbientGitCommitResult,
  AmbientGitFinishToMainResult,
  AmbientGitStatusResult,
} from "./agentRuntimeAmbientFacade";
import { registerGitTools } from "./agentRuntimeGitTools";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { ThreadWorktreeSummary } from "../../shared/threadTypes";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerGitTools", () => {
  it("registers the Git tools and forwards status requests with thread topology", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const statusCalls: unknown[] = [];
    const threadWorktree = worktree();

    registerGitTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: workspace(),
      projectRoot: () => "/tmp/project",
      threadWorktree: () => threadWorktree,
      ambientGitStatus: async (input) => {
        statusCalls.push(input);
        return statusResult(input.targetBranch ?? "main");
      },
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_git_status",
      "ambient_git_commit",
      "ambient_git_finish_to_main",
    ]);
    const status = registeredTools[0]!;
    expect(status.executionMode).toBe("sequential");

    const result = await status.execute("git-status", { targetBranch: "develop" }, undefined, (update: any) => updates.push(update));

    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Inspecting Ambient Git worktree topology." }],
        details: { runtime: "ambient-git", toolName: "ambient_git_status", status: "running" },
      },
    ]);
    expect(statusCalls).toEqual([{
      projectRoot: "/tmp/project",
      threadWorkspacePath: "/tmp/workspace",
      threadWorktree,
      targetBranch: "develop",
    }]);
    expect(result.content[0].text).toContain("Ambient Git status");
    expect(result.content[0].text).toContain("\"targetBranch\": \"develop\"");
    expect(result.details).toMatchObject({
      runtime: "ambient-git",
      toolName: "ambient_git_status",
      operation: "status",
      status: "complete",
    });
  });

  it("forwards commit requests to the active thread workspace and formats the result", async () => {
    const registeredTools: RegisteredTool[] = [];
    const commitCalls: unknown[] = [];
    const threadWorktree = worktree();

    registerGitTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: workspace(),
      projectRoot: () => "/tmp/project",
      threadWorktree: () => threadWorktree,
      ambientGitCommit: async (input) => {
        commitCalls.push(input);
        return commitResult();
      },
    });

    const commit = registeredTools.find((tool) => tool.name === "ambient_git_commit");
    if (!commit) throw new Error("Missing ambient_git_commit.");
    const result = await commit.execute("git-commit", {
      message: "Extract git tools",
      all: true,
    });

    expect(commitCalls).toEqual([{
      projectRoot: "/tmp/project",
      threadWorkspacePath: "/tmp/workspace",
      threadWorktree,
      commit: {
        message: "Extract git tools",
        all: true,
      },
    }]);
    expect(result.content[0].text).toContain("Ambient Git commit result");
    expect(result.content[0].text).toContain("\"commitHash\": \"abc123\"");
    expect(result.details).toMatchObject({
      runtime: "ambient-git",
      toolName: "ambient_git_commit",
      operation: "commit",
      status: "complete",
      committed: true,
    });
  });

  it("forwards finish-to-main requests without thread worktree metadata", async () => {
    const registeredTools: RegisteredTool[] = [];
    const finishCalls: unknown[] = [];
    const updates: any[] = [];

    registerGitTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: workspace(),
      projectRoot: () => "/tmp/project",
      threadWorktree: () => undefined,
      ambientGitFinishToMain: async (input) => {
        finishCalls.push(input);
        return finishResult();
      },
    });

    const finish = registeredTools.find((tool) => tool.name === "ambient_git_finish_to_main");
    if (!finish) throw new Error("Missing ambient_git_finish_to_main.");
    const result = await finish.execute("git-finish", {
      targetBranch: "main",
      validationCommands: ["pnpm run typecheck"],
      push: true,
    }, undefined, (update: any) => updates.push(update));

    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Preparing Ambient Git finish-to-main workflow." }],
        details: { runtime: "ambient-git", toolName: "ambient_git_finish_to_main", status: "running" },
      },
    ]);
    expect(finishCalls).toEqual([{
      projectRoot: "/tmp/project",
      threadWorkspacePath: "/tmp/workspace",
      finish: {
        targetBranch: "main",
        validationCommands: ["pnpm run typecheck"],
        push: true,
      },
    }]);
    expect(result.content[0].text).toContain("Ambient Git finish-to-main result");
    expect(result.details).toMatchObject({
      runtime: "ambient-git",
      toolName: "ambient_git_finish_to_main",
      operation: "finish_to_main",
      status: "complete",
      pushed: true,
    });
  });
});

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}

function worktree(): ThreadWorktreeSummary {
  return {
    threadId: "thread-1",
    projectRoot: "/tmp/project",
    worktreePath: "/tmp/workspace",
    branchName: "codex/example",
    status: "active",
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z",
  };
}

function statusResult(targetBranch: string): AmbientGitStatusResult & { targetBranch: string } {
  return {
    status: "complete",
    operation: "status",
    projectRoot: "/tmp/project",
    threadWorkspacePath: "/tmp/workspace",
    branch: "codex/example",
    dirtyCount: 0,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
    ahead: 0,
    behind: 0,
    worktrees: [],
    recommendedActions: [],
    blockers: [],
    targetBranch,
  };
}

function commitResult(): AmbientGitCommitResult {
  return {
    status: "complete",
    operation: "commit",
    projectRoot: "/tmp/project",
    threadWorkspacePath: "/tmp/workspace",
    branch: "codex/example",
    commitHash: "abc123",
    committed: true,
    stagedPaths: ["<all>"],
    remainingDirtyCount: 0,
    blockers: [],
  };
}

function finishResult(): AmbientGitFinishToMainResult {
  return {
    status: "complete",
    operation: "finish_to_main",
    projectRoot: "/tmp/project",
    threadWorkspacePath: "/tmp/workspace",
    sourceBranch: "codex/example",
    targetBranch: "main",
    sourceCommit: "abc123",
    mergeCommit: "def456",
    pushed: true,
    validation: [],
    blockers: [],
  };
}
