import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import {
  ProjectStoreProjectBoardWorkflowRepository,
  type ProjectBoardWorkflowEventInput,
} from "./projectBoardWorkflowRepository";

const NOW = "2026-06-16T00:00:00.000Z";

describe("ProjectStoreProjectBoardWorkflowRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardWorkflowEventInput[];
  let runs: Map<string, OrchestrationRun>;
  let cardsByTaskId: Map<string, ProjectBoardCard>;
  let repository: ProjectStoreProjectBoardWorkflowRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    events = [];
    runs = new Map();
    cardsByTaskId = new Map();
    repository = new ProjectStoreProjectBoardWorkflowRepository(db, {
      getProjectBoard: (boardId) => (boardId === "board-1" ? projectBoard(db, boardId) : undefined),
      listProjectBoardEvents: (_boardId, limit = 80) => events.slice(0, limit).map((event, index) => ({
        id: `event-${index + 1}`,
        createdAt: event.createdAt ?? NOW,
        ...event,
      })),
      getOrchestrationRun: (runId) => {
        const run = runs.get(runId);
        if (!run) throw new Error(`Orchestration run not found: ${runId}`);
        return run;
      },
      getProjectBoardCardForOrchestrationTask: (taskId) => cardsByTaskId.get(taskId),
      updateOrchestrationRun: (input) => {
        const current = runs.get(input.id);
        if (!current) throw new Error(`Orchestration run not found: ${input.id}`);
        const updated = {
          ...current,
          status: input.status,
          error: Object.hasOwn(input, "error") ? (input.error ?? undefined) : current.error,
          proofOfWork: input.proofOfWork ?? current.proofOfWork,
          finishedAt: input.finish ? NOW : current.finishedAt,
        };
        runs.set(input.id, updated);
        return updated;
      },
      appendProjectBoardEvent: (event) => {
        events.unshift(event);
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("records workflow creation and suppresses repeated latest workflow-created events", () => {
    const first = repository.recordProjectBoardWorkflowCreated({
      boardId: "board-1",
      workflowPath: " /workspace/project/WORKFLOW.md ",
      workflowHash: "hash-1",
      source: "auto_dispatch",
      workspaceStrategy: "git-worktree",
      autoDispatch: true,
      maxConcurrentAgents: 3,
      createdAt: "2026-06-16T00:01:00.000Z",
    });
    const duplicate = repository.recordProjectBoardWorkflowCreated({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "hash-1",
      source: "auto_dispatch",
      workspaceStrategy: "git-worktree",
      autoDispatch: true,
      maxConcurrentAgents: 3,
      createdAt: "2026-06-16T00:02:00.000Z",
    });
    const changed = repository.recordProjectBoardWorkflowCreated({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "hash-2",
      source: "manual_prepare",
      workspaceStrategy: "directory",
      autoDispatch: false,
      maxConcurrentAgents: 1,
      createdAt: "2026-06-16T00:03:00.000Z",
    });

    expect(first.recorded).toBe(true);
    expect(duplicate.recorded).toBe(false);
    expect(changed.recorded).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "workflow_created",
      title: "Default WORKFLOW.md created",
      summary: "Ambient created /workspace/project/WORKFLOW.md with directory workspace strategy for Local Task dispatch.",
      metadata: expect.objectContaining({
        source: "manual_prepare",
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflowHash: "hash-2",
        workspaceStrategy: "directory",
        autoDispatch: false,
        maxConcurrentAgents: 1,
        dedupeKey: "manual_prepare:/workspace/project/WORKFLOW.md",
      }),
    });
    expect(events[1]).toMatchObject({
      kind: "workflow_created",
      summary: "Ambient created /workspace/project/WORKFLOW.md with git-worktree workspace strategy for Local Task dispatch.",
      metadata: expect.objectContaining({
        source: "auto_dispatch",
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflowHash: "hash-1",
        workspaceStrategy: "git-worktree",
        autoDispatch: true,
        maxConcurrentAgents: 3,
        dedupeKey: "auto_dispatch:/workspace/project/WORKFLOW.md",
      }),
    });
    expect(first.board.updatedAt).toBe("2026-06-16T00:01:00.000Z");
    expect(duplicate.board.updatedAt).toBe("2026-06-16T00:01:00.000Z");
    expect(changed.board.updatedAt).toBe("2026-06-16T00:03:00.000Z");
    expect(boardUpdatedAt(db, "board-1")).toBe("2026-06-16T00:03:00.000Z");
  });

  it("records workflow repair decisions with repair metadata and refreshed board state", () => {
    const restored = repository.recordProjectBoardWorkflowRepair({
      boardId: "board-1",
      action: "restore_generated_default",
      workflowPath: " /workspace/project/WORKFLOW.md ",
      workflowHash: "new-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/.ambient-codex/orchestration/workflow-repairs/WORKFLOW-backup.md",
      status: "ready",
      createdAt: "2026-06-16T00:04:00.000Z",
    });
    const kept = repository.recordProjectBoardWorkflowRepair({
      boardId: "board-1",
      action: "use_existing_anyway",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "invalid-workflow-hash",
      status: "invalid",
      message: "Validation failed.",
      createdAt: "2026-06-16T00:05:00.000Z",
    });

    expect(restored.recorded).toBe(true);
    expect(kept.recorded).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "workflow_repaired",
      title: "Invalid WORKFLOW.md kept after review",
      summary: "The existing workflow at /workspace/project/WORKFLOW.md was kept. Local Task preparation remains blocked until validation passes.",
      metadata: expect.objectContaining({
        action: "use_existing_anyway",
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflowHash: "invalid-workflow-hash",
        status: "invalid",
        message: "Validation failed.",
        modelCallRequired: false,
      }),
    });
    expect(events[1]).toMatchObject({
      kind: "workflow_repaired",
      title: "WORKFLOW.md restored to generated default",
      summary: "Ambient backed up the existing workflow and restored a generated default at /workspace/project/WORKFLOW.md.",
      metadata: expect.objectContaining({
        action: "restore_generated_default",
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        backupPath: "/workspace/project/.ambient-codex/orchestration/workflow-repairs/WORKFLOW-backup.md",
        status: "ready",
        modelCallRequired: false,
      }),
    });
    expect(restored.board.updatedAt).toBe("2026-06-16T00:04:00.000Z");
    expect(kept.board.updatedAt).toBe("2026-06-16T00:05:00.000Z");
    expect(boardUpdatedAt(db, "board-1")).toBe("2026-06-16T00:05:00.000Z");
  });

  it("records guided workflow setting updates with normalized field metadata and refreshed board state", () => {
    const changed = repository.recordProjectBoardWorkflowSettingsUpdated({
      boardId: "board-1",
      workflowPath: " /workspace/project/WORKFLOW.md ",
      workflowHash: "new-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/.ambient-codex/orchestration/workflow-settings/WORKFLOW-backup.md",
      changedFields: [
        " proof_of_work.require_screenshots ",
        "orchestration.auto_dispatch",
        "orchestration.auto_dispatch",
        "",
      ],
      diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n-  auto_dispatch: true\n+  auto_dispatch: false",
      status: "ready",
      createdAt: "2026-06-16T00:06:00.000Z",
    });
    const reviewed = repository.recordProjectBoardWorkflowSettingsUpdated({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      changedFields: [" ", ""],
      status: "ready",
      message: "No guided settings changed.",
      createdAt: "2026-06-16T00:07:00.000Z",
    });

    expect(changed.recorded).toBe(true);
    expect(reviewed.recorded).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "workflow_settings_updated",
      title: "WORKFLOW.md settings updated",
      summary: "Reviewed /workspace/project/WORKFLOW.md; no guided workflow settings changed.",
      metadata: expect.objectContaining({
        workflowPath: "/workspace/project/WORKFLOW.md",
        changedFields: [],
        status: "ready",
        message: "No guided settings changed.",
        modelCallRequired: false,
      }),
    });
    expect(events[1]).toMatchObject({
      kind: "workflow_settings_updated",
      title: "WORKFLOW.md settings updated",
      summary: "Updated orchestration.auto_dispatch, proof_of_work.require_screenshots in /workspace/project/WORKFLOW.md.",
      metadata: expect.objectContaining({
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        backupPath: "/workspace/project/.ambient-codex/orchestration/workflow-settings/WORKFLOW-backup.md",
        changedFields: ["orchestration.auto_dispatch", "proof_of_work.require_screenshots"],
        diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n-  auto_dispatch: true\n+  auto_dispatch: false",
        status: "ready",
        modelCallRequired: false,
      }),
    });
    expect(changed.board.updatedAt).toBe("2026-06-16T00:06:00.000Z");
    expect(reviewed.board.updatedAt).toBe("2026-06-16T00:07:00.000Z");
    expect(boardUpdatedAt(db, "board-1")).toBe("2026-06-16T00:07:00.000Z");
  });

  it("records raw workflow edits with saved, reviewed, and rejected summaries", () => {
    const saved = repository.recordProjectBoardWorkflowRawUpdated({
      boardId: "board-1",
      workflowPath: " /workspace/project/WORKFLOW.md ",
      workflowHash: "new-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/.ambient-codex/orchestration/workflow-raw-edits/WORKFLOW-backup.md",
      changed: true,
      diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n-Prompt\n+Prompt with hook",
      status: "ready",
      createdAt: "2026-06-16T00:08:00.000Z",
    });
    const reviewed = repository.recordProjectBoardWorkflowRawUpdated({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      changed: false,
      status: "ready",
      createdAt: "2026-06-16T00:09:00.000Z",
    });
    const rejected = repository.recordProjectBoardWorkflowRawUpdated({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      changed: true,
      status: "invalid",
      message: "Missing required steps",
      createdAt: "2026-06-16T00:10:00.000Z",
    });

    expect(saved.recorded).toBe(true);
    expect(reviewed.recorded).toBe(true);
    expect(rejected.recorded).toBe(true);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      kind: "workflow_raw_updated",
      title: "WORKFLOW.md raw edit rejected",
      summary: "Raw WORKFLOW.md edit was not saved because validation failed: Missing required steps.",
      metadata: expect.objectContaining({
        workflowPath: "/workspace/project/WORKFLOW.md",
        changed: true,
        status: "invalid",
        message: "Missing required steps",
        modelCallRequired: false,
        existingCardsRewritten: false,
      }),
    });
    expect(events[1]).toMatchObject({
      kind: "workflow_raw_updated",
      title: "WORKFLOW.md raw edit reviewed",
      summary: "Reviewed /workspace/project/WORKFLOW.md; no raw workflow changes were saved.",
      metadata: expect.objectContaining({
        workflowPath: "/workspace/project/WORKFLOW.md",
        changed: false,
        status: "ready",
        modelCallRequired: false,
        existingCardsRewritten: false,
      }),
    });
    expect(events[2]).toMatchObject({
      kind: "workflow_raw_updated",
      title: "WORKFLOW.md raw edit saved",
      summary: "Saved validated raw WORKFLOW.md changes to /workspace/project/WORKFLOW.md.",
      metadata: expect.objectContaining({
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflowHash: "new-workflow-hash",
        previousWorkflowHash: "old-workflow-hash",
        backupPath: "/workspace/project/.ambient-codex/orchestration/workflow-raw-edits/WORKFLOW-backup.md",
        changed: true,
        diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n-Prompt\n+Prompt with hook",
        status: "ready",
        modelCallRequired: false,
        existingCardsRewritten: false,
      }),
    });
    expect(saved.board.updatedAt).toBe("2026-06-16T00:08:00.000Z");
    expect(reviewed.board.updatedAt).toBe("2026-06-16T00:09:00.000Z");
    expect(rejected.board.updatedAt).toBe("2026-06-16T00:10:00.000Z");
    expect(boardUpdatedAt(db, "board-1")).toBe("2026-06-16T00:10:00.000Z");
  });

  it("resolves workflow impact by clearing stale runs, recording skips, and keeping old preparations", () => {
    cardsByTaskId.set("task-prepared", projectBoardCard("card-prepared", "task-prepared"));
    cardsByTaskId.set("task-retry", projectBoardCard("card-retry", "task-retry"));
    cardsByTaskId.set("task-active", projectBoardCard("card-active", "task-active"));
    cardsByTaskId.set("task-foreign", projectBoardCard("card-foreign", "task-foreign", "board-2"));
    runs.set("run-prepared", orchestrationRun("run-prepared", "task-prepared", "prepared", { kind: "preparation" }));
    runs.set("run-retry", orchestrationRun("run-retry", "task-retry", "retry_queued"));
    runs.set("run-active", orchestrationRun("run-active", "task-active", "running"));
    runs.set("run-foreign", orchestrationRun("run-foreign", "task-foreign", "prepared"));

    const prepareAgain = repository.resolveProjectBoardWorkflowImpact({
      boardId: "board-1",
      action: "prepare_again",
      runIds: [" run-prepared ", "run-prepared", "run-retry", "missing-run", "run-active", "run-foreign"],
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "new-workflow-hash",
      createdAt: "2026-06-16T00:11:00.000Z",
    });

    expect(prepareAgain).toEqual({
      clearedRunIds: ["run-prepared", "run-retry"],
      skippedRuns: [
        { runId: "missing-run", reason: "run_not_found" },
        { runId: "run-active", reason: "run_active" },
        { runId: "run-foreign", reason: "run_not_linked_to_board" },
      ],
    });
    expect(runs.get("run-prepared")).toMatchObject({
      status: "canceled",
      error: "Cleared so this Local Task can be prepared again under the current WORKFLOW.md.",
      proofOfWork: expect.objectContaining({
        kind: "preparation",
        workflowImpact: expect.objectContaining({
          action: "prepare_again",
          clearedAt: "2026-06-16T00:11:00.000Z",
          workflowPath: "/workspace/project/WORKFLOW.md",
          workflowHash: "new-workflow-hash",
          previousStatus: "prepared",
        }),
      }),
    });
    expect(runs.get("run-retry")).toMatchObject({
      status: "canceled",
      proofOfWork: expect.objectContaining({
        workflowImpact: expect.objectContaining({ previousStatus: "retry_queued" }),
      }),
    });
    expect(runs.get("run-active")?.status).toBe("running");
    expect(events[0]).toMatchObject({
      kind: "workflow_impact_resolved",
      title: "Workflow impact prepare-again selected",
      summary: "2 stale prepared runs cleared; 3 skipped. Fresh preparation can now use the current WORKFLOW.md.",
      metadata: expect.objectContaining({
        action: "prepare_again",
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflowHash: "new-workflow-hash",
        affectedRunIds: ["run-prepared", "run-retry", "run-active"],
        affectedTaskIds: ["task-prepared", "task-retry", "task-active"],
        affectedCardIds: ["card-prepared", "card-retry", "card-active"],
        clearedRunIds: ["run-prepared", "run-retry"],
        skippedRunIds: ["missing-run", "run-active", "run-foreign"],
        skippedReasons: {
          "missing-run": "run_not_found",
          "run-active": "run_active",
          "run-foreign": "run_not_linked_to_board",
        },
        modelCallRequired: false,
      }),
    });
    expect(boardUpdatedAt(db, "board-1")).toBe("2026-06-16T00:11:00.000Z");

    const keep = repository.resolveProjectBoardWorkflowImpact({
      boardId: "board-1",
      action: "continue_old_prep",
      runIds: ["run-active"],
      workflowHash: "newer-workflow-hash",
      createdAt: "2026-06-16T00:12:00.000Z",
    });

    expect(keep).toEqual({ clearedRunIds: [], skippedRuns: [] });
    expect(runs.get("run-active")?.status).toBe("running");
    expect(events[0]).toMatchObject({
      kind: "workflow_impact_resolved",
      title: "Workflow impact old preparation kept",
      summary: "1 prepared run kept under existing preparation. Future preparation will use the current WORKFLOW.md.",
      metadata: expect.objectContaining({
        action: "continue_old_prep",
        workflowHash: "newer-workflow-hash",
        affectedRunIds: ["run-active"],
        clearedRunIds: [],
        skippedRuns: [],
        modelCallRequired: false,
      }),
    });
    expect(boardUpdatedAt(db, "board-1")).toBe("2026-06-16T00:12:00.000Z");
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace/project', 'active', 'Project board', '', ?, ?)`,
  ).run(id, NOW, NOW);
}

function projectBoard(db: Database.Database, boardId: string): ProjectBoardSummary {
  const row = db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as {
    id: string;
    project_path: string;
    status: ProjectBoardSummary["status"];
    title: string;
    summary: string;
    created_at: string;
    updated_at: string;
  };
  return {
    id: row.id,
    projectPath: row.project_path,
    status: row.status,
    title: row.title,
    summary: row.summary,
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function boardUpdatedAt(db: Database.Database, boardId: string): string | undefined {
  return (db.prepare("SELECT updated_at FROM project_boards WHERE id = ?").get(boardId) as { updated_at?: string } | undefined)
    ?.updated_at;
}

function projectBoardCard(id: string, taskId: string, boardId = "board-1"): ProjectBoardCard {
  return {
    id,
    boardId,
    title: `Card ${id}`,
    description: "",
    status: "ready",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: "manual",
    sourceId: id,
    orchestrationTaskId: taskId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function orchestrationRun(
  id: string,
  taskId: string,
  status: string,
  proofOfWork?: Record<string, unknown>,
): OrchestrationRun {
  return {
    id,
    taskId,
    attemptNumber: 0,
    status,
    workspacePath: "/workspace/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
    startedAt: NOW,
    lastEventAt: NOW,
    proofOfWork,
  };
}
