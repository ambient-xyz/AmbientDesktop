import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitWorkflowVersionRepo, restoreWorkflowVersionFiles, workflowVersionDiff } from "./workflowVersioning";

const versionFiles = ["manifest.json", "spec.json", "graph.json", "main.ts", "preview.md", "compile-context.json", "repair-history.json"];

describe("workflowVersioning", () => {
  let repoPath = "";

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "ambient-workflow-version-"));
    for (const file of versionFiles) {
      await writeFile(join(repoPath, file), `${file}: v1\n`, "utf8");
    }
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it("initializes a workflow artifact git repo and diffs versions", async () => {
    const first = await commitWorkflowVersionRepo({ repoPath, message: "Create workflow version" });
    expect(first.commitHash).toMatch(/^[a-f0-9]{40}$/);

    await writeFile(join(repoPath, "preview.md"), "preview.md: v2\n", "utf8");
    const second = await commitWorkflowVersionRepo({ repoPath, message: "Update workflow version" });
    expect(second.commitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(second.commitHash).not.toBe(first.commitHash);

    const diff = await workflowVersionDiff({ repoPath, from: first.commitHash, to: second.commitHash });
    expect(diff).toContain("-preview.md: v1");
    expect(diff).toContain("+preview.md: v2");
  });

  it("restores workflow version files from a prior artifact commit", async () => {
    const first = await commitWorkflowVersionRepo({ repoPath, message: "Create workflow version" });
    await writeFile(join(repoPath, "main.ts"), "main.ts: v2\n", "utf8");
    await commitWorkflowVersionRepo({ repoPath, message: "Update workflow version" });

    const result = await restoreWorkflowVersionFiles({ repoPath, commitHash: first.commitHash, files: ["main.ts"] });

    expect(result).toEqual({ repoPath, commitHash: first.commitHash, restoredFiles: ["main.ts"] });
    await expect(readFile(join(repoPath, "main.ts"), "utf8")).resolves.toBe("main.ts: v1\n");
  });

  it("can create an explicit empty revert commit when files already match", async () => {
    const first = await commitWorkflowVersionRepo({ repoPath, message: "Create workflow version" });
    const second = await commitWorkflowVersionRepo({ repoPath, message: "Revert workflow to version 1", allowEmpty: true });

    expect(second.commitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(second.commitHash).not.toBe(first.commitHash);
  });
});
