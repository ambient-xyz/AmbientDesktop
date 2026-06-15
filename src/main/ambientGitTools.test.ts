import { execFile } from "node:child_process";
import { appendFile, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  ambientGitCommit,
  ambientGitFinishToMain,
  ambientGitStatus,
  parseGitWorktreeList,
} from "./ambientGitTools";

const execFileAsync = promisify(execFile);

describe("Ambient Git tools", () => {
  it("parses git worktree porcelain output", () => {
    expect(
      parseGitWorktreeList([
        "worktree /repo",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /repo/.ambient-codex/worktrees/thread-1",
        "HEAD def456",
        "branch refs/heads/codex/thread-1",
        "",
      ].join("\n")),
    ).toEqual([
      { path: "/repo", head: "abc123", branch: "main" },
      { path: "/repo/.ambient-codex/worktrees/thread-1", head: "def456", branch: "codex/thread-1" },
    ]);
  });

  it("commits active thread worktree changes without touching the main owner", async () => {
    const repo = await createRepo("ambient-git-commit-");
    try {
      const worktree = join(repo.root, ".ambient-codex", "worktrees", "thread-1");
      await git(repo.root, "worktree", "add", "-b", "codex/thread-1", worktree, "HEAD");
      await writeFile(join(worktree, "feature.txt"), "thread work\n", "utf8");

      const result = await ambientGitCommit({
        projectRoot: repo.root,
        threadWorkspacePath: worktree,
        threadWorktree: {
          threadId: "thread-1",
          projectRoot: repo.root,
          worktreePath: worktree,
          branchName: "codex/thread-1",
          baseRef: "HEAD",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        commit: { message: "Add thread work", all: true },
      });

      expect(result).toMatchObject({ status: "complete", committed: true, branch: "codex/thread-1", remainingDirtyCount: 0 });
      expect(await git(worktree, "show", "--name-only", "--format=%s", "HEAD")).toContain("feature.txt");
      expect(await git(repo.root, "status", "--short")).toBe("");
    } finally {
      await cleanupRepo(repo.root);
    }
  });

  it("reports the main-owning worktree from thread status", async () => {
    const repo = await createRepo("ambient-git-status-");
    try {
      const worktree = join(repo.root, ".ambient-codex", "worktrees", "thread-1");
      await git(repo.root, "worktree", "add", "-b", "codex/thread-1", worktree, "HEAD");

      const result = await ambientGitStatus({
        projectRoot: repo.root,
        threadWorkspacePath: worktree,
        targetBranch: "main",
      });

      expect(result.status).toBe("complete");
      expect(result.branch).toBe("codex/thread-1");
      expect(result.mainOwner?.path).toBe(repo.root);
      expect(result.recommendedActions.join("\n")).toContain("ambient_git_finish_to_main");
    } finally {
      await cleanupRepo(repo.root);
    }
  });

  it("blocks finish-to-main when the target main worktree is dirty", async () => {
    const repo = await createRepo("ambient-git-dirty-main-");
    try {
      const worktree = await committedThreadWorktree(repo.root, "thread-dirty");
      await writeFile(join(repo.root, "main-dirty.txt"), "dirty\n", "utf8");

      const result = await ambientGitFinishToMain({
        projectRoot: repo.root,
        threadWorkspacePath: worktree,
        finish: { targetBranch: "main" },
      });

      expect(result).toMatchObject({ status: "blocked", pushed: false });
      expect(result.blockers[0].code).toBe("target-dirty");
    } finally {
      await cleanupRepo(repo.root);
    }
  });

  it("gates push when validation fails after a merge", async () => {
    const repo = await createRepo("ambient-git-validation-");
    try {
      const worktree = await committedThreadWorktree(repo.root, "thread-validation");

      const result = await ambientGitFinishToMain({
        projectRoot: repo.root,
        threadWorkspacePath: worktree,
        finish: { targetBranch: "main", validationCommands: ["echo validating && exit 7"], push: true },
      });

      expect(result.status).toBe("failed");
      expect(result.mergeCommit).toBeTruthy();
      expect(result.pushed).toBe(false);
      expect(result.validation).toEqual([expect.objectContaining({ command: "echo validating && exit 7", status: "failed" })]);
      expect(result.blockers[0].code).toBe("validation-failed");
    } finally {
      await cleanupRepo(repo.root);
    }
  });

  it("merges a committed thread branch into main", async () => {
    const repo = await createRepo("ambient-git-merge-");
    try {
      const worktree = await committedThreadWorktree(repo.root, "thread-merge");

      const result = await ambientGitFinishToMain({
        projectRoot: repo.root,
        threadWorkspacePath: worktree,
        finish: { targetBranch: "main", validationCommands: ["test -f thread-merge.txt"] },
      });

      expect(result).toMatchObject({ status: "complete", targetBranch: "main", targetWorktreePath: repo.root, pushed: false });
      expect(result.mergeCommit).toBeTruthy();
      expect(await git(repo.root, "show", "HEAD:thread-merge.txt")).toBe("thread-merge");
    } finally {
      await cleanupRepo(repo.root);
    }
  });

  it("pushes main only after validation succeeds", async () => {
    const repo = await createRepo("ambient-git-push-");
    const remote = await mkdtemp(join(tmpdir(), "ambient-git-remote-"));
    try {
      await git(remote, "init", "--bare");
      await git(repo.root, "remote", "add", "origin", remote);
      await git(repo.root, "push", "-u", "origin", "main");
      const worktree = await committedThreadWorktree(repo.root, "thread-push");

      const result = await ambientGitFinishToMain({
        projectRoot: repo.root,
        threadWorkspacePath: worktree,
        finish: { targetBranch: "main", validationCommands: ["test -f thread-push.txt"], push: true },
      });

      expect(result).toMatchObject({ status: "complete", pushed: true });
      expect(await git(remote, "show", "main:thread-push.txt")).toBe("thread-push");
    } finally {
      await cleanupRepo(repo.root);
      await cleanupRepo(remote);
    }
  });
});

async function createRepo(prefix: string): Promise<{ root: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "Ambient Test");
  await git(root, "config", "user.email", "ambient-test@example.com");
  await appendFile(join(root, ".git", "info", "exclude"), "\n.ambient-codex/\n", "utf8");
  await writeFile(join(root, "README.md"), "initial\n", "utf8");
  await git(root, "add", "README.md");
  await git(root, "commit", "-m", "Initial commit");
  return { root };
}

async function committedThreadWorktree(root: string, label: string): Promise<string> {
  const worktree = join(root, ".ambient-codex", "worktrees", label);
  await git(root, "worktree", "add", "-b", `codex/${label}`, worktree, "HEAD");
  await writeFile(join(worktree, `${label}.txt`), `${label}\n`, "utf8");
  const result = await ambientGitCommit({
    projectRoot: root,
    threadWorkspacePath: worktree,
    commit: { message: `Add ${label}`, all: true },
  });
  expect(result.status).toBe("complete");
  return worktree;
}

async function cleanupRepo(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", ["-C", cwd, ...args], { maxBuffer: 2_000_000 });
  return `${stdout}${stderr}`.trim();
}
