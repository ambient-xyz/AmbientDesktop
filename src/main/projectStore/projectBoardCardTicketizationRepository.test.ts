import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardPlanningSnapshot } from "../../shared/projectBoardTypes";
import type { CreateOrchestrationTaskInput, OrchestrationTask } from "../../shared/workflowTypes";
import { mapOrchestrationTaskRow, type OrchestrationTaskRow } from "./orchestrationMappers";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import { ProjectStoreProjectBoardCardTicketizationRepository } from "./projectBoardCardTicketizationRepository";
import { mapProjectBoardCardRow, type ProjectBoardCardStoreRow } from "./projectBoardMappers";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";

describe("ProjectStoreProjectBoardCardTicketizationRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardCardMutationEventInput[];
  let syncedBoards: string[];
  let syncedCards: number;
  let latestPlanningSnapshot: { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined;
  let repository: ProjectStoreProjectBoardCardTicketizationRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    syncedBoards = [];
    syncedCards = 0;
    latestPlanningSnapshot = undefined;
    repository = new ProjectStoreProjectBoardCardTicketizationRepository(db, {
      listOrchestrationTasks: () => listTasks(db),
      getActiveProjectBoard: () => ({
        id: "board-1",
        projectPath: "/workspace",
        status: "active",
        title: "Project board",
        summary: "",
        cards: [],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-06-16T00:00:00.000Z",
        updatedAt: "2026-06-16T00:00:00.000Z",
      }),
      getRunningProjectBoardSynthesisRun: () => undefined,
      listProjectBoardCards: (boardId) => listCards(db, boardId),
      latestStableProjectBoardPlanningSnapshot: () => latestPlanningSnapshot,
      assertProjectBoardCardProofReady: () => undefined,
      assertProjectBoardCardClarificationsResolved: () => undefined,
      assertProjectBoardCardClaimAllowsLocalTicketization: () => undefined,
      assertProjectBoardRunFollowUpStillActionable: () => undefined,
      appendProjectBoardEvent: (event) => events.push(event),
      syncProjectBoardTaskBlockers: (boardId) => syncedBoards.push(boardId),
      syncProjectBoardCardsForLinkedTasks: () => {
        syncedCards += 1;
      },
      createOrchestrationTask: (input) => createTask(db, input),
      getOrchestrationTask: (taskId) => getTask(db, taskId),
      mapOrchestrationTask: (row) => mapOrchestrationTaskRow(row),
      projectBoardCardTaskDescription: (card) => `Task description for ${card.title}`,
      assertProjectBoardUxMockGateOpen: () => undefined,
    });
    insertBoard(db, "board-1");
  });

  afterEach(() => {
    db.close();
  });

  it("approves one ready card into a Local Task", () => {
    insertReadyCard(db, {
      id: "manual-card",
      boardId: "board-1",
      title: "Manual card",
      sourceKind: "manual",
      sourceId: "manual:ready",
    });

    const approved = repository.approveProjectBoardCard("manual-card");

    expect(approved).toMatchObject({
      id: "manual-card",
      status: "ready",
      orchestrationTaskId: "task-manual-card",
    });
    expect(syncedBoards).toEqual(["board-1"]);
    expect(syncedCards).toBe(1);
    expect(events.at(-1)).toMatchObject({
      kind: "card_ticketized",
      entityId: "manual-card",
      metadata: expect.objectContaining({
        cardId: "manual-card",
        taskId: "task-manual-card",
        sourceKind: "manual",
        sourceId: "manual:ready",
      }),
    });
  });

  it("attaches Local Tasks and imports completed-task evidence cards", () => {
    const attachTask = createTask(db, {
      title: "Existing task",
      description: " Existing task description. ",
      state: "ready",
      priority: 4,
      labels: ["ui"],
      blockedBy: [],
    });
    const attached = repository.attachLocalTaskToProjectBoard({ taskId: attachTask.id, mode: "attach" });

    expect(attached).toMatchObject({
      boardId: "board-1",
      title: "Existing task",
      description: "Existing task description.",
      status: "ready",
      candidateStatus: "ready_to_create",
      priority: 4,
      labels: ["local-task", "ui"],
      sourceKind: "local_task_import",
      sourceId: attachTask.id,
      orchestrationTaskId: attachTask.id,
      acceptanceCriteria: [`Complete Local Task ${attachTask.identifier}: Existing task`],
      testPlan: expect.objectContaining({
        manual: ["Review the existing Local Task proof before closing the board card."],
      }),
    });
    expect(events.at(-1)).toMatchObject({
      kind: "local_task_attached",
      entityKind: "orchestration_task",
      entityId: attachTask.id,
      metadata: expect.objectContaining({ taskId: attachTask.id, identifier: attachTask.identifier, mode: "attach", cardId: attached.id }),
    });
    expect(syncedCards).toBe(1);

    const duplicate = repository.attachLocalTaskToProjectBoard({ taskId: attachTask.id, mode: "attach" });
    expect(duplicate.id).toBe(attached.id);
    expect(events).toHaveLength(1);
    expect(syncedCards).toBe(1);

    const evidenceTask = createTask(db, {
      title: "Completed task",
      description: "",
      state: "done",
      labels: ["proof"],
      blockedBy: [],
    });
    const imported = repository.attachLocalTaskToProjectBoard({ taskId: evidenceTask.id, mode: "evidence" });

    expect(imported).toMatchObject({
      boardId: "board-1",
      title: "Completed task",
      description: "Existing Local Task imported as completed board evidence.",
      status: "draft",
      candidateStatus: "evidence",
      labels: ["local-task", "proof"],
      sourceKind: "local_task_import",
      sourceId: evidenceTask.id,
      orchestrationTaskId: undefined,
      acceptanceCriteria: [`Record Local Task ${evidenceTask.identifier} as evidence for already-scoped work.`],
      testPlan: expect.objectContaining({
        manual: ["Review imported Local Task history as completed evidence."],
      }),
    });
    expect(events.at(-1)).toMatchObject({
      kind: "local_task_imported_as_evidence",
      metadata: expect.objectContaining({ taskId: evidenceTask.id, mode: "evidence", cardId: imported.id }),
    });
    expect(syncedCards).toBe(2);
  });

  it("creates ready tasks after the synthesis planning snapshot gate is satisfied", () => {
    insertReadyCard(db, {
      id: "synthesis-card",
      boardId: "board-1",
      title: "Synthesis card",
      sourceKind: "board_synthesis",
      sourceId: "synthesis:ready",
    });
    insertReadyCard(db, {
      id: "manual-card",
      boardId: "board-1",
      title: "Manual card",
      sourceKind: "manual",
      sourceId: "manual:ready",
    });

    expect(() => repository.createReadyProjectBoardTasks("board-1")).toThrow(
      "Board synthesis cards require a completed or paused planning snapshot before creating ready tasks.",
    );
    expect(readCard(db, "synthesis-card")).toMatchObject({ status: "draft", orchestration_task_id: null });

    latestPlanningSnapshot = {
      runId: "run-1",
      snapshot: {
        id: "snapshot-1",
        boardId: "board-1",
        runId: "run-1",
        kind: "final",
        planningStatus: "succeeded",
        planningStage: "proposal_created",
        createdAt: "2026-06-16T00:00:00.000Z",
        cardCount: 1,
        readyCandidateCount: 1,
        ticketizedCount: 0,
        sourceHashes: [],
        cardIds: ["synthesis-card"],
        cards: [],
        renderFingerprint: "snapshot:fingerprint",
      },
    };

    const ticketized = repository.createReadyProjectBoardTasks("board-1");

    expect(ticketized).toEqual([
      expect.objectContaining({ id: "synthesis-card", status: "ready", orchestrationTaskId: "task-synthesis-card" }),
      expect.objectContaining({ id: "manual-card", status: "ready", orchestrationTaskId: "task-manual-card" }),
    ]);
    expect(syncedBoards).toEqual(["board-1", "board-1", "board-1"]);
    expect(syncedCards).toBe(3);
    expect(events.at(-1)).toMatchObject({
      kind: "ready_tasks_created",
      metadata: expect.objectContaining({
        cardIds: ["synthesis-card", "manual-card"],
        taskIds: ["task-synthesis-card", "task-manual-card"],
        planningSnapshotId: "snapshot-1",
        planningSnapshotRunId: "run-1",
        planningSnapshotKind: "final",
        planningSnapshotFingerprint: "snapshot:fingerprint",
        planningSnapshotCardIds: ["synthesis-card"],
      }),
    });
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function insertReadyCard(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    sourceKind: string;
    sourceId: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, acceptance_criteria_json,
       test_plan_json, source_kind, source_id, created_at, updated_at)
     VALUES (?, ?, ?, 'Ready card.', 'draft', 'ready_to_create', '["Do the work."]',
       '{"unit":["repository test"],"integration":[],"visual":[],"manual":[]}',
       ?, ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.boardId, input.title, input.sourceKind, input.sourceId);
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

function createTask(db: Database.Database, input: CreateOrchestrationTaskInput): OrchestrationTask {
  const taskId = `task-${input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
  db.prepare(
    `INSERT INTO orchestration_tasks
      (id, identifier, title, description, state, priority, labels_json, blocked_by_json,
       project_path, branch_name, workspace_path, source_kind, source_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'local', NULL,
       '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(
    taskId,
    `TASK-${taskId}`,
    input.title,
    input.description ?? null,
    input.state ?? "ready",
    input.priority ?? null,
    JSON.stringify(input.labels ?? []),
    JSON.stringify(input.blockedBy ?? []),
  );
  return getTask(db, taskId);
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
