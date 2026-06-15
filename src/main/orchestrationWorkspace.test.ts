import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseWorkflowMarkdown } from "./workflow";
import { branchNameForTask, configureTaskWorkspaceRuntimeExcludes, prepareTaskWorkspace, workspaceKeyForTask } from "./orchestrationWorkspace";

const execFileAsync = promisify(execFile);

function workflow(root: string, strategy: "git-worktree" | "directory" = "git-worktree") {
  return parseWorkflowMarkdown(
    `---
workspace:
  strategy: ${strategy}
  root: ${JSON.stringify(root)}
  branch_prefix: ambient/
---
Prompt`,
    "/repo/WORKFLOW.md",
  ).config;
}

describe("orchestration workspace helpers", () => {
  it("sanitizes task identifiers for workspace keys and branch names", () => {
    expect(workspaceKeyForTask(" LOCAL 12: fix/ui ")).toBe("LOCAL_12_fix_ui");
    expect(branchNameForTask("ambient/", ".")).toBe("ambient/task");
  });
});

describe("prepareTaskWorkspace", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "ambient-workspaces-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("creates deterministic plain directories", async () => {
    const config = workflow(join(tempRoot, "tasks"), "directory");
    const prepared = await prepareTaskWorkspace(tempRoot, { identifier: "LOCAL-1", branchName: undefined }, config);
    const reused = await prepareTaskWorkspace(tempRoot, { identifier: "LOCAL-1", branchName: undefined }, config);

    expect(prepared).toMatchObject({
      path: join(tempRoot, "tasks", "LOCAL-1"),
      workspaceKey: "LOCAL-1",
      createdNow: true,
      strategy: "directory",
    });
    expect(reused.createdNow).toBe(false);
  });

  it("falls back to directories when git worktree strategy is selected outside a git repo", async () => {
    const prepared = await prepareTaskWorkspace(tempRoot, { identifier: "LOCAL-2", branchName: undefined }, workflow(join(tempRoot, "tasks")));

    expect(prepared.strategy).toBe("directory");
    expect(prepared.path).toBe(join(tempRoot, "tasks", "LOCAL-2"));
  });

  it("creates git worktrees when the project root is a git repository", async () => {
    if (!(await hasGit())) return;
    const repo = join(tempRoot, "repo");
    await makeGitRepo(repo);

    const prepared = await prepareTaskWorkspace(repo, { identifier: "LOCAL-3", branchName: undefined }, workflow(join(tempRoot, "tasks")));

    expect(prepared).toMatchObject({
      path: join(tempRoot, "tasks", "LOCAL-3"),
      workspaceKey: "LOCAL-3",
      createdNow: true,
      strategy: "git-worktree",
      branchName: "ambient/LOCAL-3",
    });
    const branch = await execFileAsync("git", ["-C", prepared.path, "branch", "--show-current"]);
    expect(branch.stdout.trim()).toBe("ambient/LOCAL-3");
  });

  it("uses a project-scoped fallback branch when a task branch is checked out by another project", async () => {
    if (!(await hasGit())) return;
    const repo = join(tempRoot, "repo");
    await makeGitRepo(repo);
    const firstProject = join(repo, "projects", "one");
    const secondProject = join(repo, "projects", "two");
    await mkdir(firstProject, { recursive: true });
    await mkdir(secondProject, { recursive: true });

    const first = await prepareTaskWorkspace(firstProject, { identifier: "LOCAL-1", branchName: undefined }, workflow(join(tempRoot, "one-tasks")));
    const second = await prepareTaskWorkspace(secondProject, { identifier: "LOCAL-1", branchName: undefined }, workflow(join(tempRoot, "two-tasks")));

    expect(first.branchName).toBe("ambient/LOCAL-1");
    expect(second.branchName).toMatch(/^ambient\/LOCAL-1-[0-9a-f]{10}$/);
    expect(second.branchName).not.toBe(first.branchName);
    const branch = await execFileAsync("git", ["-C", second.path, "branch", "--show-current"]);
    expect(branch.stdout.trim()).toBe(second.branchName);
  });

  it("bases git worktrees on completed dependency branches", async () => {
    if (!(await hasGit())) return;
    const repo = join(tempRoot, "repo");
    await makeGitRepo(repo);
    await execFileAsync("git", ["-C", repo, "switch", "-c", "ambient/LOCAL-1"]);
    await writeFile(join(repo, "index.html"), "<h1>Expense Splitter</h1>\n");
    await execFileAsync("git", ["-C", repo, "add", "index.html"]);
    await execFileAsync("git", ["-C", repo, "-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "complete local 1"]);
    await execFileAsync("git", ["-C", repo, "switch", "main"]);

    const prepared = await prepareTaskWorkspace(
      repo,
      { identifier: "LOCAL-2", branchName: undefined },
      workflow(join(tempRoot, "tasks")),
      ["ambient/LOCAL-1"],
    );

    const branch = await execFileAsync("git", ["-C", prepared.path, "branch", "--show-current"]);
    const files = await execFileAsync("git", ["-C", prepared.path, "ls-tree", "--name-only", "HEAD"]);
    expect(branch.stdout.trim()).toBe("ambient/LOCAL-2");
    expect(files.stdout).toContain("index.html");
    expect(prepared.baseRefs).toEqual(["ambient/LOCAL-1"]);
  });

  it("merges dependency branches into existing clean git task worktrees", async () => {
    if (!(await hasGit())) return;
    const repo = join(tempRoot, "repo");
    await makeGitRepo(repo);
    const config = workflow(join(tempRoot, "tasks"));
    const prepared = await prepareTaskWorkspace(repo, { identifier: "LOCAL-2", branchName: undefined }, config);

    await execFileAsync("git", ["-C", repo, "switch", "-c", "ambient/LOCAL-1"]);
    await writeFile(join(repo, "style.css"), "body { color: black; }\n");
    await execFileAsync("git", ["-C", repo, "add", "style.css"]);
    await execFileAsync("git", ["-C", repo, "-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "complete local 1"]);
    await execFileAsync("git", ["-C", repo, "switch", "main"]);

    const reused = await prepareTaskWorkspace(repo, { identifier: "LOCAL-2", branchName: prepared.branchName }, config, ["ambient/LOCAL-1"]);

    const files = await execFileAsync("git", ["-C", reused.path, "ls-tree", "--name-only", "HEAD"]);
    expect(reused.createdNow).toBe(false);
    expect(files.stdout).toContain("style.css");
    expect(reused.baseRefs).toEqual(["ambient/LOCAL-1"]);
  });

  it("ignores Ambient runtime artifacts in git task worktrees", async () => {
    if (!(await hasGit())) return;
    const repo = join(tempRoot, "repo");
    await makeGitRepo(repo);

    const prepared = await prepareTaskWorkspace(repo, { identifier: "LOCAL-5", branchName: undefined }, workflow(join(tempRoot, "tasks")));
    await mkdir(join(prepared.path, ".ambient", "cli-packages"), { recursive: true });
    await writeFile(join(prepared.path, ".ambient", "cli-packages", "packages.json"), "{}\n");
    await writeFile(join(prepared.path, "task-output.md"), "task material\n");

    await execFileAsync("git", ["-C", prepared.path, "add", "."]);

    const status = await execFileAsync("git", ["-C", prepared.path, "status", "--short"]);
    expect(status.stdout).toContain("A  task-output.md");
    expect(status.stdout).not.toContain(".ambient");

    const ignored = await execFileAsync("git", ["-C", prepared.path, "status", "--short", "--ignored", ".ambient"]);
    expect(ignored.stdout).toContain("!! .ambient/");

    const excludePath = (await execFileAsync("git", ["-C", prepared.path, "rev-parse", "--git-path", "info/exclude"])).stdout.trim();
    const exclude = await readFile(excludePath, "utf8");
    expect(exclude).toContain("# Ambient Local Task runtime artifacts");
    expect(exclude).toContain(".ambient/");
  });

  it("can restore Ambient runtime ignores on an existing git task worktree", async () => {
    if (!(await hasGit())) return;
    const repo = join(tempRoot, "repo");
    await makeGitRepo(repo);

    const prepared = await prepareTaskWorkspace(repo, { identifier: "LOCAL-6", branchName: undefined }, workflow(join(tempRoot, "tasks")));
    const excludePath = (await execFileAsync("git", ["-C", prepared.path, "rev-parse", "--git-path", "info/exclude"])).stdout.trim();
    await writeFile(excludePath, "# local ignores cleared during recovery\n", "utf8");

    await expect(configureTaskWorkspaceRuntimeExcludes(prepared.path)).resolves.toBe(true);
    await mkdir(join(prepared.path, ".ambient-codex", "runtime"), { recursive: true });
    await writeFile(join(prepared.path, ".ambient-codex", "runtime", "state.json"), "{}\n");
    await writeFile(join(prepared.path, "task-output.md"), "task material\n");
    await execFileAsync("git", ["-C", prepared.path, "add", "."]);

    const status = await execFileAsync("git", ["-C", prepared.path, "status", "--short"]);
    expect(status.stdout).toContain("A  task-output.md");
    expect(status.stdout).not.toContain(".ambient-codex");

    await expect(configureTaskWorkspaceRuntimeExcludes(prepared.path)).resolves.toBe(false);
  });

  it("fails clearly when git worktree strategy is selected for a repository without commits", async () => {
    if (!(await hasGit())) return;
    const repo = join(tempRoot, "repo-unborn");
    await execFileAsync("git", ["init", "-b", "main", repo]);

    await expect(prepareTaskWorkspace(repo, { identifier: "LOCAL-4", branchName: undefined }, workflow(join(tempRoot, "tasks")))).rejects.toThrow(
      "repository has no commits yet",
    );
  });
});

async function hasGit(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function makeGitRepo(repo: string): Promise<void> {
  await execFileAsync("git", ["init", "-b", "main", repo]);
  await writeFile(join(repo, "README.md"), "hello\n");
  await execFileAsync("git", ["-C", repo, "add", "README.md"]);
  await execFileAsync("git", ["-C", repo, "-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "init"]);
}
