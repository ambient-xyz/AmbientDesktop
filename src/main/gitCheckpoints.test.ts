import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createGitCheckpoint, latestGitCheckpoint, restoreLatestGitCheckpoint } from "./gitCheckpoints";

const execFileAsync = promisify(execFile);

describe("git checkpoints", () => {
  it("captures tracked patches and untracked files, then restores them", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-checkpoint-repo-"));
    const statePath = await mkdtemp(join(tmpdir(), "ambient-checkpoint-state-"));
    try {
      await initRepo(workspacePath);
      await writeFile(join(workspacePath, "tracked.txt"), "initial\n", "utf8");
      await git(workspacePath, "add", "tracked.txt");
      await git(workspacePath, "commit", "-m", "initial");

      await writeFile(join(workspacePath, "tracked.txt"), "initial\ncheckpoint\n", "utf8");
      await writeFile(join(workspacePath, "new.txt"), "captured\n", "utf8");

      const checkpoint = await createGitCheckpoint({
        workspacePath,
        statePath,
        threadId: "thread-1",
        branchName: "main",
        kind: "pre-run",
        reason: "Before test run.",
      });

      expect(checkpoint).toMatchObject({
        threadId: "thread-1",
        branchName: "main",
        kind: "pre-run",
        untrackedFiles: ["new.txt"],
      });
      expect(checkpoint!.trackedPatchBytes).toBeGreaterThan(0);
      expect(await latestGitCheckpoint(statePath, "thread-1")).toMatchObject({ id: checkpoint!.id });

      await writeFile(join(workspacePath, "tracked.txt"), "damaged\n", "utf8");
      await unlink(join(workspacePath, "new.txt"));

      const restored = await restoreLatestGitCheckpoint({ workspacePath, statePath, threadId: "thread-1" });
      expect(restored?.id).toBe(checkpoint!.id);
      expect(await readFile(join(workspacePath, "tracked.txt"), "utf8")).toBe("initial\ncheckpoint\n");
      expect(await readFile(join(workspacePath, "new.txt"), "utf8")).toBe("captured\n");
      expect(await git(workspacePath, "status", "--short")).toContain(" M tracked.txt");
      expect(await git(workspacePath, "status", "--short")).toContain("?? new.txt");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
      await rm(statePath, { recursive: true, force: true });
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
