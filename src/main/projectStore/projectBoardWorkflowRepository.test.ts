import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import {
  ProjectStoreProjectBoardWorkflowRepository,
  type ProjectBoardWorkflowEventInput,
} from "./projectBoardWorkflowRepository";

const NOW = "2026-06-16T00:00:00.000Z";

describe("ProjectStoreProjectBoardWorkflowRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardWorkflowEventInput[];
  let repository: ProjectStoreProjectBoardWorkflowRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    events = [];
    repository = new ProjectStoreProjectBoardWorkflowRepository(db, {
      getProjectBoard: (boardId) => (boardId === "board-1" ? projectBoard(db, boardId) : undefined),
      listProjectBoardEvents: (_boardId, limit = 80) => events.slice(0, limit).map((event, index) => ({
        id: `event-${index + 1}`,
        createdAt: event.createdAt ?? NOW,
        ...event,
      })),
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
