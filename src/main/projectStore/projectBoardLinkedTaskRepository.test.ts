import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import { mapOrchestrationTaskRow, type OrchestrationTaskRow } from "./orchestrationMappers";
import { ProjectStoreProjectBoardLinkedTaskRepository } from "./projectBoardLinkedTaskRepository";
import { mapProjectBoardCardRow, type ProjectBoardCardStoreRow } from "./projectBoardMappers";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";

const NOW = "2026-06-22T12:00:00.000Z";

describe("ProjectStoreProjectBoardLinkedTaskRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardEvent[];
  let describedInputs: { cardId: string; budgetPolicy?: Record<string, unknown> }[];
  let repository: ProjectStoreProjectBoardLinkedTaskRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    describedInputs = [];
    repository = new ProjectStoreProjectBoardLinkedTaskRepository(db, {
      getProjectBoard: (boardId) => projectBoardSummary(boardId),
      getProjectBoardCardForOrchestrationTask: (taskId) => listCards(db, "board-1").find((card) => card.orchestrationTaskId === taskId),
      getOrchestrationTask: (taskId) => getTask(db, taskId),
      listOrchestrationTasks: () => listTasks(db),
      listProjectBoardCards: (boardId) => listCards(db, boardId),
      listProjectBoardEvents: (boardId) => events.filter((event) => event.boardId === boardId),
      dependencyAwareProjectBoardCardTaskDescription: ({ card, budgetPolicy }) => {
        describedInputs.push({ cardId: card.id, budgetPolicy });
        return `Dependency-aware task description for ${card.title}`;
      },
    });
    insertBoard(db, "board-1");
  });

  afterEach(() => {
    db.close();
  });

  it("syncs linked card status, task blockers, task descriptions, and remote claim blockers", () => {
    insertTask(db, { id: "task-dependency", identifier: "LOCAL-1", title: "Dependency", state: "done" });
    insertTask(db, { id: "task-current", identifier: "LOCAL-2", title: "Current", state: "ready", description: "Old description" });
    insertCard(db, {
      id: "card-dependency",
      boardId: "board-1",
      title: "Dependency card",
      status: "done",
      taskId: "task-dependency",
    });
    insertCard(db, {
      id: "card-current",
      boardId: "board-1",
      title: "Current card",
      status: "ready",
      taskId: "task-current",
      blockedBy: ["card-dependency"],
    });

    repository.syncProjectBoardTaskBlockers("board-1");
    expect(getTask(db, "task-current").blockedBy).toEqual(["LOCAL-1"]);

    db.prepare("UPDATE orchestration_tasks SET state = 'done' WHERE id = 'task-current'").run();
    repository.syncProjectBoardCardsForLinkedTasks();
    expect(readCard(db, "card-current").status).toBe("done");
    expect(repository.projectBoardTaskHasClosedDoneCard("task-current")).toBe(true);

    const refreshed = repository.refreshProjectBoardTaskDescriptionForTask("task-current");
    expect(refreshed?.description).toBe("Dependency-aware task description for Current card");
    expect(describedInputs).toEqual([{ cardId: "card-current", budgetPolicy: { maxConcurrentAgents: 2 } }]);

    events.push(remoteCardClaimEvent("board-1", "card-current"));
    expect(repository.projectBoardClaimBlockedTaskIds()).toEqual(["task-current"]);
  });
});

function projectBoardSummary(boardId: string): ProjectBoardSummary {
  return {
    id: boardId,
    projectPath: "/workspace",
    status: "active",
    title: "Project board",
    summary: "",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    charter: { budgetPolicy: { maxConcurrentAgents: 2 } } as unknown as ProjectBoardSummary["charter"],
    createdAt: NOW,
    updatedAt: NOW,
  } as ProjectBoardSummary;
}

function remoteCardClaimEvent(boardId: string, cardId: string): ProjectBoardEvent {
  return {
    id: "evt-remote-claim",
    boardId,
    kind: "card_claimed",
    title: "Card claimed",
    summary: "Remote desktop claimed this ticketized card.",
    entityKind: "project_board_card",
    entityId: cardId,
    metadata: {
      cardId,
      runId: "run-remote",
      agentId: "remote-desktop",
      leaseUntil: "2099-05-04T12:10:00.000Z",
      artifactEventType: "card.claimed",
    },
    createdAt: "2099-05-04T12:00:00.000Z",
  };
}

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', ?, ?)`,
  ).run(id, NOW, NOW);
}

function insertTask(
  db: Database.Database,
  input: {
    id: string;
    identifier: string;
    title: string;
    state: string;
    description?: string;
    blockedBy?: string[];
  },
): void {
  db.prepare(
    `INSERT INTO orchestration_tasks
      (id, identifier, title, description, state, labels_json, blocked_by_json, project_path, source_kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '[]', ?, '/workspace', 'local', ?, ?)`,
  ).run(input.id, input.identifier, input.title, input.description ?? null, input.state, JSON.stringify(input.blockedBy ?? []), NOW, NOW);
}

function insertCard(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    status: string;
    taskId: string;
    blockedBy?: string[];
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, blocked_by_json,
       source_kind, source_id, orchestration_task_id, created_at, updated_at)
     VALUES (?, ?, ?, 'Card description.', ?, 'ready_to_create', ?, 'manual', ?, ?, ?, ?)`,
  ).run(input.id, input.boardId, input.title, input.status, JSON.stringify(input.blockedBy ?? []), input.id, input.taskId, NOW, NOW);
}

function listCards(db: Database.Database, boardId: string): ProjectBoardCard[] {
  const rows = db
    .prepare("SELECT * FROM project_board_cards WHERE board_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(boardId) as ProjectBoardCardStoreRow[];
  return rows.map((row) => mapProjectBoardCardRow(row, listTasks(db)));
}

function listTasks(db: Database.Database): OrchestrationTask[] {
  const rows = db.prepare("SELECT * FROM orchestration_tasks ORDER BY created_at ASC, rowid ASC").all() as OrchestrationTaskRow[];
  return rows.map((row) => mapOrchestrationTaskRow(row));
}

function getTask(db: Database.Database, taskId: string): OrchestrationTask {
  const row = db.prepare("SELECT * FROM orchestration_tasks WHERE id = ?").get(taskId) as OrchestrationTaskRow | undefined;
  if (!row) throw new Error(`Task not found: ${taskId}`);
  return mapOrchestrationTaskRow(row);
}

function readCard(db: Database.Database, cardId: string): ProjectBoardCardStoreRow {
  const row = db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
  if (!row) throw new Error(`Card not found: ${cardId}`);
  return row;
}
