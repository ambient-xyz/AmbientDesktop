import { describe, expect, it } from "vitest";
import {
  filterGitBranches,
  gitCommitActionState,
  gitCreateBranchActionState,
  gitPullRequestActionState,
  gitPullRequestReadiness,
  gitWorkModeSummary,
} from "./gitUiModel";

describe("filterGitBranches", () => {
  it("filters branches and keeps the current branch first", () => {
    expect(filterGitBranches(["feature/login", "main", "release", "main"], "e", "release")).toEqual([
      "release",
      "feature/login",
    ]);
  });
});

describe("gitCommitActionState", () => {
  it("requires a message, staged files, and no conflicts", () => {
    expect(gitCommitActionState({ review: { stagedCount: 1, conflictedCount: 0 }, message: "ship" })).toEqual({ disabled: false });
    expect(gitCommitActionState({ review: { stagedCount: 0, conflictedCount: 0 }, message: "ship" }).reason).toContain("Stage");
    expect(gitCommitActionState({ review: { stagedCount: 1, conflictedCount: 1 }, message: "ship" }).reason).toContain("conflicts");
    expect(gitCommitActionState({ review: { stagedCount: 1, conflictedCount: 0 }, message: " " }).reason).toContain("message");
  });
});

describe("gitCreateBranchActionState", () => {
  it("rejects empty, duplicate, and whitespace branch names", () => {
    expect(gitCreateBranchActionState({ name: "feature/git", branches: ["main"] })).toEqual({ disabled: false });
    expect(gitCreateBranchActionState({ name: "main", branches: ["main"] }).reason).toContain("already exists");
    expect(gitCreateBranchActionState({ name: "feature git", branches: ["main"] }).reason).toContain("spaces");
    expect(gitCreateBranchActionState({ name: "", branches: ["main"] }).reason).toContain("branch name");
  });
});

describe("gitPullRequestActionState", () => {
  it("requires a supported remote and pushed branch when needed", () => {
    expect(
      gitPullRequestActionState({
        review: { remote: "git@github.com:ambient-xyz/AmbientDesktop.git", compareUrl: "https://github.com/x/y/compare/z", ahead: 0, behind: 0, upstream: "origin/main", provider: "github" },
      }),
    ).toEqual({ disabled: false });
    expect(gitPullRequestActionState({ review: { remote: undefined, compareUrl: undefined, ahead: 0, behind: 0, upstream: undefined, provider: undefined } }).reason).toContain("remote");
    expect(gitPullRequestActionState({ review: { remote: "ssh://host/repo", compareUrl: undefined, ahead: 0, behind: 0, upstream: "origin/main", provider: "unknown" } }).reason).toContain("GitHub");
    expect(
      gitPullRequestActionState({
        review: { remote: "git@github.com:ambient-xyz/AmbientDesktop.git", compareUrl: "https://github.com/x/y/compare/z", ahead: 2, behind: 0, upstream: undefined, provider: "github" },
      }).reason,
    ).toContain("Push");
  });

  it("describes pull request readiness actions", () => {
    expect(
      gitPullRequestReadiness({
        remote: "git@github.com:ambient-xyz/AmbientDesktop.git",
        compareUrl: "https://github.com/x/y/compare/z",
        ahead: 1,
        behind: 0,
        upstream: "origin/feature",
        provider: "github",
      }),
    ).toMatchObject({ label: "Push required", action: "push", tone: "warning" });
    expect(
      gitPullRequestReadiness({
        remote: "git@github.com:ambient-xyz/AmbientDesktop.git",
        compareUrl: "https://github.com/x/y/compare/z",
        ahead: 0,
        behind: 1,
        upstream: "origin/feature",
        provider: "github",
      }),
    ).toMatchObject({ label: "Pull recommended", action: "pull" });
  });
});

describe("gitWorkModeSummary", () => {
  it("describes thread worktree and shared project root modes", () => {
    expect(
      gitWorkModeSummary({
        workspacePath: "/repo/worktrees/thread",
        projectRoot: "/repo",
        worktree: {
          threadId: "thread",
          projectRoot: "/repo",
          worktreePath: "/repo/worktrees/thread",
          branchName: "codex/thread",
          status: "active",
          createdAt: "now",
          updatedAt: "now",
        },
      }),
    ).toMatchObject({ label: "Thread worktree", tone: "active" });
    expect(gitWorkModeSummary({ workspacePath: "/repo", projectRoot: "/repo" })).toMatchObject({
      label: "Shared workspace",
      tone: "warning",
    });
  });
});
