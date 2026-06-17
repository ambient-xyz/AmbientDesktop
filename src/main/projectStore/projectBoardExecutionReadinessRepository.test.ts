import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import {
  ProjectStoreProjectBoardExecutionReadinessRepository,
  type ProjectBoardExecutionReadinessEventInput,
} from "./projectBoardExecutionReadinessRepository";

const NOW = "2026-06-16T00:00:00.000Z";

describe("ProjectStoreProjectBoardExecutionReadinessRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardExecutionReadinessEventInput[];
  let repository: ProjectStoreProjectBoardExecutionReadinessRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    events = [];
    repository = new ProjectStoreProjectBoardExecutionReadinessRepository(db, {
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

  it("records execution readiness blockers and suppresses repeated latest blockers", () => {
    const first = repository.recordProjectBoardExecutionReadinessBlocker({
      boardId: "board-1",
      source: "auto_dispatch",
      blocker: "missing_workflow",
      title: "Execution blocked: missing WORKFLOW.md",
      summary: "Ready Local Tasks could not be prepared because WORKFLOW.md is missing.",
      workflowPath: "/workspace/WORKFLOW.md",
      error: "  Workflow file not found.  ",
      createdAt: "2026-06-16T00:01:00.000Z",
    });
    const duplicate = repository.recordProjectBoardExecutionReadinessBlocker({
      boardId: "board-1",
      source: "auto_dispatch",
      blocker: "missing_workflow",
      title: "Execution blocked: missing WORKFLOW.md",
      summary: "Ready Local Tasks could not be prepared because WORKFLOW.md is missing.",
      workflowPath: "/workspace/WORKFLOW.md",
      error: "Workflow file not found.",
      createdAt: "2026-06-16T00:02:00.000Z",
    });
    const changed = repository.recordProjectBoardExecutionReadinessBlocker({
      boardId: "board-1",
      source: "manual_prepare",
      blocker: "invalid_workflow",
      title: "Execution blocked: invalid WORKFLOW.md",
      summary: "Ready Local Tasks could not be prepared because WORKFLOW.md is invalid.",
      workflowPath: "/workspace/WORKFLOW.md",
      error: "Workflow validation failed.",
      metadata: { validator: "workflow-schema" },
      createdAt: "2026-06-16T00:03:00.000Z",
    });

    expect(first.recorded).toBe(true);
    expect(duplicate.recorded).toBe(false);
    expect(changed.recorded).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "execution_readiness_blocked",
      title: "Execution blocked: invalid WORKFLOW.md",
      metadata: expect.objectContaining({
        validator: "workflow-schema",
        source: "manual_prepare",
        blocker: "invalid_workflow",
        workflowPath: "/workspace/WORKFLOW.md",
        error: "Workflow validation failed.",
      }),
    });
    expect(events[1]).toMatchObject({
      kind: "execution_readiness_blocked",
      title: "Execution blocked: missing WORKFLOW.md",
      metadata: expect.objectContaining({
        source: "auto_dispatch",
        blocker: "missing_workflow",
        workflowPath: "/workspace/WORKFLOW.md",
        error: "Workflow file not found.",
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
