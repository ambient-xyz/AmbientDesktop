import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureDefaultProjectBoardWorkflow,
  previewProjectBoardWorkflowRepair,
  repairProjectBoardWorkflow,
  updateProjectBoardWorkflowRaw,
  updateProjectBoardWorkflowSettings,
} from "./projectBoardWorkflowBootstrap";

describe("ensureDefaultProjectBoardWorkflow", () => {
  let roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots = [];
  });

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ambient-workflow-bootstrap-"));
    roots.push(root);
    return root;
  }

  it("creates a conservative default workflow when none exists", async () => {
    const root = await tempRoot();

    const result = await ensureDefaultProjectBoardWorkflow(root);

    expect(result.status).toBe("created");
    expect(result.workflowPath).toBe(join(root, "WORKFLOW.md"));
    expect(result.workspaceStrategy).toBe("directory");
    expect(result.workflow?.config.orchestration.autoDispatch).toBe(true);
    expect(result.workflow?.config.orchestration.maxConcurrentAgents).toBe(1);
    expect(result.workflow?.config.proofOfWork.requireDiffSummary).toBe(true);
    const workflowText = await readFile(join(root, "WORKFLOW.md"), "utf8");
    expect(workflowText).toContain("Execution workspace contract:");
    expect(workflowText).toContain("Writable task workspace: {{ workspace.path }}");
    expect(workflowText).toContain("only inside the writable task workspace");
    expect(workflowText).toContain("Description:\n{{ task.description }}");
  });

  it("returns an existing valid workflow without replacing it", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "WORKFLOW.md"), "Use {{ task.title }}", "utf8");

    const result = await ensureDefaultProjectBoardWorkflow(root);

    expect(result.status).toBe("exists");
    expect(result.markdown).toBeUndefined();
    expect(await readFile(join(root, "WORKFLOW.md"), "utf8")).toBe("Use {{ task.title }}");
  });

  it("reports invalid existing workflows without overwriting them", async () => {
    const root = await tempRoot();
    const invalid = `---
orchestration:
  max_concurrent_agents: nope
---
Prompt`;
    await writeFile(join(root, "WORKFLOW.md"), invalid, "utf8");

    const result = await ensureDefaultProjectBoardWorkflow(root);

    expect(result.status).toBe("invalid");
    expect(result.error?.code).toBe("workflow_validation_error");
    expect(await readFile(join(root, "WORKFLOW.md"), "utf8")).toBe(invalid);
  });

  it("repairs an invalid workflow by backing it up and restoring the generated default", async () => {
    const root = await tempRoot();
    const invalid = `---
orchestration:
  max_concurrent_agents: nope
---
Prompt`;
    await writeFile(join(root, "WORKFLOW.md"), invalid, "utf8");

    const preview = await previewProjectBoardWorkflowRepair(root);
    expect(preview).toMatchObject({
      workspaceStrategy: "directory",
      currentText: invalid,
      currentLineCount: 5,
      proposedText: expect.stringContaining("max_concurrent_agents: 1"),
      proposedLineCount: expect.any(Number),
      diff: expect.stringContaining("-  max_concurrent_agents: nope"),
    });
    expect(preview?.diff).toContain("+  max_concurrent_agents: 1");

    const result = await repairProjectBoardWorkflow(root, "restore_generated_default");

    expect(result.error).toBeUndefined();
    expect(result.workflow?.config.orchestration.maxConcurrentAgents).toBe(1);
    expect(result.previousWorkflowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.backupPath).toContain(".ambient-codex/orchestration/workflow-repairs/WORKFLOW-");
    expect(await readFile(result.backupPath!, "utf8")).toBe(invalid);
    expect(await readFile(join(root, "WORKFLOW.md"), "utf8")).toContain("Description:\n{{ task.description }}");
  });

  it("records a use-existing decision without modifying the invalid workflow", async () => {
    const root = await tempRoot();
    const invalid = `---
orchestration:
  max_concurrent_agents: nope
---
Prompt`;
    await writeFile(join(root, "WORKFLOW.md"), invalid, "utf8");

    const result = await repairProjectBoardWorkflow(root, "use_existing_anyway");

    expect(result.error?.code).toBe("workflow_validation_error");
    expect(result.backupPath).toBeUndefined();
    expect(await readFile(join(root, "WORKFLOW.md"), "utf8")).toBe(invalid);
  });

  it("updates guided workflow settings with validation, backup, and diff", async () => {
    const root = await tempRoot();
    await ensureDefaultProjectBoardWorkflow(root);

    const result = await updateProjectBoardWorkflowSettings(root, {
      autoDispatch: false,
      maxConcurrentAgents: 2,
      maxTurns: 35,
      workspaceStrategy: "directory",
      requireTests: true,
      requireScreenshots: true,
    });

    expect(result.error).toBeUndefined();
    expect(result.changedFields).toEqual([
      "orchestration.auto_dispatch",
      "orchestration.max_concurrent_agents",
      "orchestration.max_turns",
      "proof_of_work.require_tests",
      "proof_of_work.require_screenshots",
    ]);
    expect(result.previousWorkflowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.workflow?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.workflow?.contentHash).not.toBe(result.previousWorkflowHash);
    expect(result.backupPath).toContain(".ambient-codex/orchestration/workflow-settings/WORKFLOW-");
    expect(result.diff).toContain("-  auto_dispatch: true");
    expect(result.diff).toContain("+  auto_dispatch: false");
    expect(result.workflow?.config.orchestration.maxConcurrentAgents).toBe(2);
    expect(result.workflow?.config.orchestration.maxTurns).toBe(35);
    expect(result.workflow?.config.proofOfWork.requireTests).toBe(true);
    expect(result.workflow?.config.proofOfWork.requireScreenshots).toBe(true);
    expect(await readFile(result.backupPath!, "utf8")).toContain("auto_dispatch: true");
    expect(await readFile(join(root, "WORKFLOW.md"), "utf8")).toContain("max_concurrent_agents: 2");
  });

  it("updates raw workflow markdown only after validation, with backup and diff", async () => {
    const root = await tempRoot();
    await ensureDefaultProjectBoardWorkflow(root);
    const before = await readFile(join(root, "WORKFLOW.md"), "utf8");
    const next = before.replace("Complete the task in the prepared workspace.", "Complete the task in the prepared workspace and include a tiny visual smoke proof.");

    const result = await updateProjectBoardWorkflowRaw(root, { markdown: next });

    expect(result.error).toBeUndefined();
    expect(result.changed).toBe(true);
    expect(result.previousWorkflowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.workflow?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.workflow?.contentHash).not.toBe(result.previousWorkflowHash);
    expect(result.backupPath).toContain(".ambient-codex/orchestration/workflow-raw-edits/WORKFLOW-");
    expect(result.diff).toContain("-Complete the task in the prepared workspace.");
    expect(result.diff).toContain("+Complete the task in the prepared workspace and include a tiny visual smoke proof.");
    expect(await readFile(result.backupPath!, "utf8")).toBe(before);
    expect(await readFile(join(root, "WORKFLOW.md"), "utf8")).toBe(next);
  });

  it("rejects invalid raw workflow markdown without modifying the file", async () => {
    const root = await tempRoot();
    await ensureDefaultProjectBoardWorkflow(root);
    const before = await readFile(join(root, "WORKFLOW.md"), "utf8");

    const result = await updateProjectBoardWorkflowRaw(root, {
      markdown: "---\norchestration:\n  max_concurrent_agents: nope\n---\nPrompt",
    });

    expect(result.error?.code).toBe("workflow_validation_error");
    expect(result.changed).toBe(false);
    expect(result.backupPath).toBeUndefined();
    expect(result.diff).toContain("+  max_concurrent_agents: nope");
    expect(await readFile(join(root, "WORKFLOW.md"), "utf8")).toBe(before);
  });
});
