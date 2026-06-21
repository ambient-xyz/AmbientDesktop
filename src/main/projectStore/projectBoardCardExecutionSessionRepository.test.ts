import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardEvent } from "../../shared/projectBoardTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import {
  ProjectStoreProjectBoardCardExecutionSessionRepository,
  type ProjectBoardCardExecutionSessionEventInput,
} from "./projectBoardCardExecutionSessionRepository";

const NOW = "2026-06-16T00:00:00.000Z";

describe("ProjectStoreProjectBoardCardExecutionSessionRepository", () => {
  let db: Database.Database;
  let threads: Map<string, ThreadSummary>;
  let events: ProjectBoardCardExecutionSessionEventInput[];
  let repository: ProjectStoreProjectBoardCardExecutionSessionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    threads = new Map();
    events = [];
    repository = new ProjectStoreProjectBoardCardExecutionSessionRepository(db, {
      tryGetThread: (threadId) => threads.get(threadId),
      createThread: (title, workspacePath) => {
        const thread = threadSummary(`thread-${threads.size + 1}`, title, workspacePath);
        threads.set(thread.id, thread);
        return thread;
      },
      getOrchestrationTask: (taskId) => orchestrationTask(taskId),
      appendProjectBoardEvent: (event) => {
        events.push(event);
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates and reuses a canonical execution thread for reuse-card policy cards", () => {
    insertCard(db, {
      id: "card-1",
      boardId: "board-1",
      taskId: "task-1",
      title: "Build cached card loop",
    });

    const first = repository.ensureProjectBoardCardExecutionThreadForTask({
      taskId: "task-1",
      workspacePath: "/workspace/task-1",
    });
    const second = repository.ensureProjectBoardCardExecutionThreadForTask({
      taskId: "task-1",
      workspacePath: "/workspace/task-1",
    });

    expect(first).toMatchObject({
      id: "thread-1",
      title: "task-1: Build cached card loop",
      workspacePath: "/workspace/task-1",
    });
    expect(second?.id).toBe(first?.id);
    expect(cardExecutionFields(db, "card-1")).toMatchObject({
      execution_thread_id: "thread-1",
      execution_session_policy: "reuse_card_session",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      boardId: "board-1",
      kind: "card_execution_session_assigned",
      entityId: "card-1",
      metadata: expect.objectContaining({
        cardId: "card-1",
        taskId: "task-1",
        executionThreadId: "thread-1",
        executionSessionPolicy: "reuse_card_session",
      }),
    } satisfies Partial<ProjectBoardEvent>);
    expect(boardUpdatedAt(db, "board-1")).not.toBe(NOW);
  });

  it("returns undefined when no active board card is linked to the task", () => {
    expect(
      repository.ensureProjectBoardCardExecutionThreadForTask({
        taskId: "task-missing",
        workspacePath: "/workspace/task-missing",
      }),
    ).toBeUndefined();
    expect(threads.size).toBe(0);
    expect(events).toEqual([]);
  });

  it("creates fresh execution threads for fresh-context policy cards", () => {
    const existing = threadSummary("thread-existing", "Existing", "/workspace/old");
    threads.set(existing.id, existing);
    insertCard(db, {
      id: "card-fresh",
      boardId: "board-1",
      taskId: "task-fresh",
      title: "Run with fresh context",
      executionThreadId: existing.id,
      executionSessionPolicy: "fresh_context",
    });

    const first = repository.ensureProjectBoardCardExecutionThreadForTask({
      taskId: "task-fresh",
      workspacePath: "/workspace/fresh",
    });
    const second = repository.ensureProjectBoardCardExecutionThreadForTask({
      taskId: "task-fresh",
      workspacePath: "/workspace/fresh",
    });

    expect(first?.id).toBe("thread-2");
    expect(second?.id).toBe("thread-3");
    expect(events.map((event) => event.metadata.previousThreadId)).toEqual(["thread-existing", "thread-2"]);
    expect(cardExecutionFields(db, "card-fresh")).toMatchObject({
      execution_thread_id: "thread-3",
      execution_session_policy: "fresh_context",
    });
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', ?, ?)`,
  ).run(id, NOW, NOW);
}

function insertCard(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    taskId: string;
    title: string;
    executionThreadId?: string;
    executionSessionPolicy?: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, acceptance_criteria_json,
       test_plan_json, source_kind, source_id, orchestration_task_id, execution_thread_id, execution_session_policy,
       created_at, updated_at)
     VALUES (?, ?, ?, 'Execution card.', 'in_progress', 'ready_to_create', '["Do the work."]',
       '{"unit":["repository test"],"integration":[],"visual":[],"manual":[]}',
       'planner_plan', ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.boardId,
    input.title,
    `planner:${input.id}`,
    input.taskId,
    input.executionThreadId ?? null,
    input.executionSessionPolicy ?? "reuse_card_session",
    NOW,
    NOW,
  );
}

function cardExecutionFields(
  db: Database.Database,
  cardId: string,
): { execution_thread_id?: string; execution_session_policy?: string } | undefined {
  return db
    .prepare("SELECT execution_thread_id, execution_session_policy FROM project_board_cards WHERE id = ?")
    .get(cardId) as { execution_thread_id?: string; execution_session_policy?: string } | undefined;
}

function boardUpdatedAt(db: Database.Database, boardId: string): string | undefined {
  return (db.prepare("SELECT updated_at FROM project_boards WHERE id = ?").get(boardId) as { updated_at?: string } | undefined)
    ?.updated_at;
}

function orchestrationTask(taskId: string): OrchestrationTask {
  return {
    id: taskId,
    identifier: taskId,
    title: `Task ${taskId}`,
    state: "doing",
    labels: [],
    blockedBy: [],
    sourceKind: "project_board",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function threadSummary(id: string, title: string, workspacePath: string): ThreadSummary {
  return {
    id,
    title,
    workspacePath,
    createdAt: NOW,
    updatedAt: NOW,
    lastMessagePreview: "",
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "<model>",
    thinkingLevel: "medium",
  };
}
