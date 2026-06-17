import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  commitGitPaths,
  createGitBranch,
  discardGitFile,
  getGitReview,
  gitStatusCounts,
  initializeGitRepository,
  parseAheadBehind,
  parseBranchList,
  stageAllGitFiles,
  stageGitFile,
  unstageAllGitFiles,
  unstageGitFile,
} from "./workspaceGit";

const execFileAsync = promisify(execFile);

describe("parseAheadBehind", () => {
  it("parses git rev-list left/right counts", () => {
    expect(parseAheadBehind("3\t1")).toEqual({ ahead: 3, behind: 1 });
    expect(parseAheadBehind("0 2")).toEqual({ ahead: 0, behind: 2 });
  });

  it("falls back to zeroes for empty output", () => {
    expect(parseAheadBehind("")).toEqual({ ahead: 0, behind: 0 });
  });
});

describe("parseBranchList", () => {
  it("normalizes branch output", () => {
    expect(parseBranchList("main\nfeature/work\n\n release ")).toEqual(["main", "feature/work", "release"]);
  });
});

describe("gitStatusCounts", () => {
  it("counts files by category", () => {
    expect(
      gitStatusCounts([
        { path: "app.ts", status: " M", category: "modified" },
        { path: "new.ts", status: "A ", category: "added" },
        { path: "notes.md", status: "??", category: "untracked" },
        { path: "notes-2.md", status: "??", category: "untracked" },
      ]),
    ).toEqual({
      added: 1,
      modified: 1,
      deleted: 0,
      renamed: 0,
      untracked: 2,
    });
  });
});

describe("workspace git review/actions", () => {
  it("initializes a no-repo workspace and returns a git review", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-git-init-"));
    try {
      expect((await getGitReview({ workspacePath, projectRoot: workspacePath })).isGitRepository).toBe(false);

      await initializeGitRepository(workspacePath);

      const review = await getGitReview({ workspacePath, projectRoot: workspacePath });
      expect(review.isGitRepository).toBe(true);
      expect(review.branch).toMatch(/^(main|master)$/);
      expect(review.files).toEqual([]);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("initializes and commits only requested paths", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-git-path-commit-"));
    try {
      await writeFile(join(workspacePath, "durable.html"), "plan\n", "utf8");
      await writeFile(join(workspacePath, "notes.txt"), "leave uncommitted\n", "utf8");

      const result = await commitGitPaths(workspacePath, {
        paths: ["durable.html"],
        message: "Add durable plan",
      });

      expect(result.committed).toBe(true);
      const review = await getGitReview({ workspacePath, projectRoot: workspacePath });
      expect(review.isGitRepository).toBe(true);
      expect(review.files.map((file) => file.path)).toEqual(["notes.txt"]);
      expect((await git(workspacePath, "log", "--oneline", "-1"))).toContain("Add durable plan");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("force-commits requested ignored paths without adding adjacent ignored runtime files", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-git-force-path-commit-"));
    try {
      await initRepo(workspacePath);
      await writeFile(join(workspacePath, ".git", "info", "exclude"), ".ambient/\n", "utf8");
      await mkdir(join(workspacePath, ".ambient", "board", "plans"), { recursive: true });
      await mkdir(join(workspacePath, ".ambient", "cli-packages"), { recursive: true });
      await writeFile(join(workspacePath, ".ambient", "board", "plans", "durable.html"), "plan\n", "utf8");
      await writeFile(join(workspacePath, ".ambient", "board", "plans", "durable.manifest.json"), "{}\n", "utf8");
      await writeFile(join(workspacePath, ".ambient", "cli-packages", "packages.json"), "{}\n", "utf8");

      const result = await commitGitPaths(workspacePath, {
        paths: [".ambient/board/plans/durable.html", ".ambient/board/plans/durable.manifest.json"],
        message: "Add durable plan",
        force: true,
      });

      expect(result.committed).toBe(true);
      expect(await git(workspacePath, "ls-files")).toBe(
        ".ambient/board/plans/durable.html\n.ambient/board/plans/durable.manifest.json\n",
      );
      expect(await git(workspacePath, "status", "--short", "--ignored", "--", ".ambient/cli-packages/packages.json")).toContain(
        "!! .ambient/cli-packages/",
      );
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("reviews, stages, unstages, discards, and branches a temp repository", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-git-review-"));
    try {
      await initRepo(workspacePath);
      await writeFile(join(workspacePath, "tracked.txt"), "initial\n", "utf8");
      await git(workspacePath, "add", "tracked.txt");
      await git(workspacePath, "commit", "-m", "initial");

      await writeFile(join(workspacePath, "tracked.txt"), "initial\nchanged\n", "utf8");
      await writeFile(join(workspacePath, "new.txt"), "new file\n", "utf8");

      const review = await getGitReview({ workspacePath, projectRoot: workspacePath });
      expect(review).toMatchObject({
        isGitRepository: true,
        branch: "main",
        dirtyCount: 2,
        stagedCount: 0,
        unstagedCount: 1,
        untrackedCount: 1,
        conflictedCount: 0,
      });
      expect(review.additions).toBeGreaterThanOrEqual(1);
      expect(review.files.map((file) => file.path).sort()).toEqual(["new.txt", "tracked.txt"]);
      expect(review.files.find((file) => file.path === "tracked.txt")?.diff).toContain("+changed");
      expect(review.files.find((file) => file.path === "new.txt")?.diff).toContain("+new file");

      await stageGitFile(workspacePath, { path: "new.txt" });
      expect((await getGitReview({ workspacePath, projectRoot: workspacePath })).files.find((file) => file.path === "new.txt")?.staged).toBe(true);

      await unstageGitFile(workspacePath, { path: "new.txt" });
      expect((await getGitReview({ workspacePath, projectRoot: workspacePath })).files.find((file) => file.path === "new.txt")?.untracked).toBe(true);

      await discardGitFile(workspacePath, { path: "new.txt" });
      expect((await getGitReview({ workspacePath, projectRoot: workspacePath })).files.map((file) => file.path)).toEqual(["tracked.txt"]);

      await createGitBranch(workspacePath, { name: "ambient/test-branch", checkout: true });
      expect((await getGitReview({ workspacePath, projectRoot: workspacePath })).branch).toBe("ambient/test-branch");

      await discardGitFile(workspacePath, { path: "tracked.txt" });
      expect(await readFile(join(workspacePath, "tracked.txt"), "utf8")).toBe("initial\n");
      expect((await getGitReview({ workspacePath, projectRoot: workspacePath })).dirtyCount).toBe(0);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("tracks staged, unstaged, untracked counts and bulk stage/unstage actions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-git-bulk-"));
    try {
      await initRepo(workspacePath);
      await writeFile(join(workspacePath, "tracked.txt"), "initial\n", "utf8");
      await writeFile(join(workspacePath, "staged.txt"), "initial\n", "utf8");
      await git(workspacePath, "add", "tracked.txt", "staged.txt");
      await git(workspacePath, "commit", "-m", "initial");

      await writeFile(join(workspacePath, "tracked.txt"), "initial\nunstaged\n", "utf8");
      await writeFile(join(workspacePath, "staged.txt"), "initial\nstaged\n", "utf8");
      await writeFile(join(workspacePath, "untracked.txt"), "new\nfile\n", "utf8");
      await git(workspacePath, "add", "staged.txt");

      const review = await getGitReview({ workspacePath, projectRoot: workspacePath });
      expect(review).toMatchObject({
        dirtyCount: 3,
        stagedCount: 1,
        unstagedCount: 1,
        untrackedCount: 1,
        conflictedCount: 0,
      });

      await stageAllGitFiles(workspacePath);
      expect(await getGitReview({ workspacePath, projectRoot: workspacePath })).toMatchObject({
        dirtyCount: 3,
        stagedCount: 3,
        unstagedCount: 0,
        untrackedCount: 0,
      });

      await unstageAllGitFiles(workspacePath);
      expect(await getGitReview({ workspacePath, projectRoot: workspacePath })).toMatchObject({
        dirtyCount: 3,
        stagedCount: 0,
        unstagedCount: 2,
        untrackedCount: 1,
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

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
