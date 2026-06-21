import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore workflow event ledger facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("records workflow repair decisions in the board event ledger", () => {
    const board = store.createProjectBoard({ title: "Workflow repair board" });

    const result = store.recordProjectBoardWorkflowRepair({
      boardId: board.id,
      action: "restore_generated_default",
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      previousWorkflowHash: "old-workflow-hash",
      workflowHash: "new-workflow-hash",
      backupPath: join(workspacePath, ".ambient-codex", "orchestration", "workflow-repairs", "WORKFLOW-backup.md"),
      status: "ready",
      createdAt: "2026-05-15T13:00:00.000Z",
    });

    expect(result.recorded).toBe(true);
    expect(store.getActiveProjectBoard()!.events!.at(-1)).toMatchObject({
      kind: "workflow_repaired",
      title: "WORKFLOW.md restored to generated default",
      metadata: expect.objectContaining({
        action: "restore_generated_default",
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        status: "ready",
        modelCallRequired: false,
      }),
    });
  });

  it("records guided workflow setting updates in the board event ledger", () => {
    const board = store.createProjectBoard({ title: "Workflow settings board" });

    const result = store.recordProjectBoardWorkflowSettingsUpdated({
      boardId: board.id,
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      previousWorkflowHash: "old-workflow-hash",
      workflowHash: "new-workflow-hash",
      backupPath: join(workspacePath, ".ambient-codex", "orchestration", "workflow-settings", "WORKFLOW-backup.md"),
      changedFields: ["orchestration.auto_dispatch", "proof_of_work.require_screenshots"],
      diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n-  auto_dispatch: true\n+  auto_dispatch: false",
      status: "ready",
      createdAt: "2026-05-16T13:00:00.000Z",
    });

    expect(result.recorded).toBe(true);
    const event = store.getActiveProjectBoard()!.events!.find((candidate) => candidate.kind === "workflow_settings_updated");
    expect(event).toMatchObject({
      kind: "workflow_settings_updated",
      title: "WORKFLOW.md settings updated",
      metadata: expect.objectContaining({
        changedFields: ["orchestration.auto_dispatch", "proof_of_work.require_screenshots"],
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        status: "ready",
        modelCallRequired: false,
      }),
    });
  });

  it("records raw workflow edits in the board event ledger", () => {
    const board = store.createProjectBoard({ title: "Workflow raw board" });

    const result = store.recordProjectBoardWorkflowRawUpdated({
      boardId: board.id,
      workflowPath: join(workspacePath, "WORKFLOW.md"),
      previousWorkflowHash: "old-workflow-hash",
      workflowHash: "new-workflow-hash",
      backupPath: join(workspacePath, ".ambient-codex", "orchestration", "workflow-raw-edits", "WORKFLOW-backup.md"),
      changed: true,
      diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n-Prompt\n+Prompt with hook",
      status: "ready",
      createdAt: "2026-05-16T13:30:00.000Z",
    });

    expect(result.recorded).toBe(true);
    const event = store.getActiveProjectBoard()!.events!.find((candidate) => candidate.kind === "workflow_raw_updated");
    expect(event).toMatchObject({
      kind: "workflow_raw_updated",
      title: "WORKFLOW.md raw edit saved",
      metadata: expect.objectContaining({
        changed: true,
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        backupPath: expect.stringContaining("workflow-raw-edits"),
        status: "ready",
        modelCallRequired: false,
        existingCardsRewritten: false,
      }),
    });
  });
});
