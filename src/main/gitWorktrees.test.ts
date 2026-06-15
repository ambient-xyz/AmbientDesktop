import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "../shared/types";
import { attachExistingThreadWorktree, branchNameForThread, prepareThreadWorktree } from "./gitWorktrees";

const execFileAsync = promisify(execFile);

describe("git worktrees", () => {
  it("creates an isolated worktree and deterministic thread branch", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-thread-worktree-"));
    try {
      await initRepo(projectRoot);
      await writeFile(join(projectRoot, "app.txt"), "root\n", "utf8");
      await git(projectRoot, "add", "app.txt");
      await git(projectRoot, "commit", "-m", "initial");
      await writeFile(join(projectRoot, "app.txt"), "root\nproject dirty\n", "utf8");
      await writeFile(join(projectRoot, "asset.txt"), "untracked asset\n", "utf8");

      const thread = threadSummary({ id: "thread-1234567890", title: "Build Git UI", workspacePath: projectRoot });
      expect(branchNameForThread(thread)).toBe("ambient/build-git-ui-thread-1");
      const worktree = await prepareThreadWorktree(projectRoot, thread);

      expect(worktree).toMatchObject({
        threadId: thread.id,
        projectRoot,
        branchName: "ambient/build-git-ui-thread-1",
        status: "active",
      });
      expect(worktree?.worktreePath).toBe(join(projectRoot, ".ambient-codex", "worktrees", thread.id));
      expect(await git(worktree!.worktreePath, "branch", "--show-current")).toBe(`${worktree!.branchName}\n`);
      expect(await readFile(join(projectRoot, ".git", "info", "exclude"), "utf8")).toContain(".ambient-codex/");
      expect(await readFile(join(worktree!.worktreePath, "app.txt"), "utf8")).toBe("root\nproject dirty\n");

      await writeFile(join(worktree!.worktreePath, "app.txt"), "worktree\n", "utf8");
      expect(await readFile(join(projectRoot, "app.txt"), "utf8")).toBe("root\nproject dirty\n");
      expect(await readFile(join(worktree!.worktreePath, "asset.txt"), "utf8")).toBe("untracked asset\n");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not prepare a worktree for non-git projects", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-no-git-worktree-"));
    try {
      await expect(prepareThreadWorktree(projectRoot, threadSummary({ workspacePath: projectRoot }))).resolves.toBeUndefined();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("defers worktree creation for unborn repositories and succeeds after the first commit", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-unborn-worktree-"));
    try {
      await git(projectRoot, "init", "-b", "main");
      await git(projectRoot, "config", "user.email", "ambient@example.com");
      await git(projectRoot, "config", "user.name", "Ambient Test");
      const thread = threadSummary({ id: "thread-unborn1234", workspacePath: projectRoot });

      const unborn = await prepareThreadWorktree(projectRoot, thread);
      expect(unborn).toMatchObject({
        status: "shared",
        worktreePath: projectRoot,
        branchName: "main",
      });
      expect(unborn?.error).toContain("no commits yet");

      await writeFile(join(projectRoot, "README.md"), "ready\n", "utf8");
      await git(projectRoot, "add", "README.md");
      await git(projectRoot, "commit", "-m", "initial");

      const active = await prepareThreadWorktree(projectRoot, { ...thread, gitWorktree: unborn });
      expect(active).toMatchObject({
        status: "active",
        branchName: "ambient/chat-thread-u",
      });
      expect(await readFile(join(active!.worktreePath, "README.md"), "utf8")).toBe("ready\n");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("attaches an existing worktree for a thread", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-attach-root-"));
    const worktreePath = await mkdtemp(join(tmpdir(), "ambient-attach-worktree-"));
    try {
      await initRepo(projectRoot);
      await writeFile(join(projectRoot, "README.md"), "ready\n", "utf8");
      await git(projectRoot, "add", "README.md");
      await git(projectRoot, "commit", "-m", "initial");
      await git(projectRoot, "worktree", "add", "-b", "ambient/existing", worktreePath, "HEAD");
      const thread = threadSummary({ id: "thread-attach123", workspacePath: projectRoot });

      const attached = await attachExistingThreadWorktree(projectRoot, worktreePath, thread);

      expect(attached).toMatchObject({
        threadId: thread.id,
        projectRoot,
        worktreePath: await realpath(worktreePath),
        branchName: "ambient/existing",
        status: "active",
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(worktreePath, { recursive: true, force: true });
    }
  });

  it("rejects worktrees from another repository", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-attach-root-"));
    const otherRoot = await mkdtemp(join(tmpdir(), "ambient-attach-other-"));
    try {
      await initRepo(projectRoot);
      await writeFile(join(projectRoot, "README.md"), "ready\n", "utf8");
      await git(projectRoot, "add", "README.md");
      await git(projectRoot, "commit", "-m", "initial");
      await initRepo(otherRoot);

      await expect(attachExistingThreadWorktree(projectRoot, otherRoot, threadSummary({ workspacePath: projectRoot }))).rejects.toThrow(
        /not a worktree for the current project/,
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(otherRoot, { recursive: true, force: true });
    }
  });
});

function threadSummary(input: Partial<ThreadSummary> = {}): ThreadSummary {
  const now = new Date().toISOString();
  return {
    id: input.id ?? "thread-abcdef1234",
    title: input.title ?? "New chat",
    workspacePath: input.workspacePath ?? "",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
      lastMessagePreview: input.lastMessagePreview ?? "",
      permissionMode: input.permissionMode ?? "full-access",
      collaborationMode: input.collaborationMode ?? "agent",
      model: input.model ?? "glm-5.1",
    thinkingLevel: input.thinkingLevel ?? "high",
    gitWorktree: input.gitWorktree,
    piSessionFile: input.piSessionFile,
  };
}

async function initRepo(workspacePath: string): Promise<void> {
  await git(workspacePath, "init", "-b", "main");
  await git(workspacePath, "config", "user.email", "ambient@example.com");
  await git(workspacePath, "config", "user.name", "Ambient Test");
}

async function git(workspacePath: string, ...args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", ["-C", workspacePath, ...args], {
    timeout: 30_000,
    maxBuffer: 4_000_000,
  });
  return `${stdout}${stderr}`;
}
