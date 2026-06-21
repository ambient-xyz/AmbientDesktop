import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardCardProofReview, ProjectBoardCardSplitOutcome } from "../../shared/projectBoardTypes";
import type { CreateOrchestrationTaskInput, OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  mapOrchestrationRunRow,
  mapOrchestrationTaskRow,
  type OrchestrationRunRow,
  type OrchestrationTaskRow,
} from "./orchestrationMappers";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import { ProjectStoreProjectBoardCardSplitDecisionRepository } from "./projectBoardCardSplitDecisionRepository";
import type { ProjectBoardCardStoreRow } from "./projectBoardMappers";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";

describe("ProjectStoreProjectBoardCardSplitDecisionRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardCardMutationEventInput[];
  let syncedBoards: string[];
  let syncedCards: number;
  let repository: ProjectStoreProjectBoardCardSplitDecisionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    syncedBoards = [];
    syncedCards = 0;
    repository = new ProjectStoreProjectBoardCardSplitDecisionRepository(db, {
      listOrchestrationTasks: () => listTasks(db),
      listOrchestrationRuns: (limit) => listRuns(db, limit),
      getOrchestrationTask: (taskId) => getTask(db, taskId),
      appendProjectBoardEvent: (event) => events.push(event),
      syncProjectBoardTaskBlockers: (boardId) => syncedBoards.push(boardId),
      syncProjectBoardCardsForLinkedTasks: () => {
        syncedCards += 1;
      },
    });
    insertBoard(db, "board-1");
  });

  afterEach(() => {
    db.close();
  });

  it("persists split decisions", () => {
    const approveTask = createTask(db, {
      title: "Approve split task",
      description: "Approve split task description.",
      state: "needs_review",
      labels: ["split"],
      blockedBy: [],
    });
    insertTicketizedCard(db, {
      id: "approve-split-parent",
      boardId: "board-1",
      taskId: approveTask.id,
      title: "Approve split parent",
    });
    insertSplitChild(db, {
      id: "approve-split-child",
      boardId: "board-1",
      title: "Approve split child",
      acceptanceCriteria: ["Approve child criteria."],
    });
    seedProofReview(db, "approve-split-parent", proofReviewForRun("run-approve-split"));
    seedSplitOutcome(db, "approve-split-parent", ["approve-split-child"], {
      remainingCriteria: ["Approve remaining criteria."],
      sourceRunId: "run-approve-split",
    });

    const approved = repository.resolveProjectBoardSplitDecision({ cardId: "approve-split-parent", action: "approve_split" });

    expect(approved).toMatchObject({
      id: "approve-split-parent",
      splitOutcome: expect.objectContaining({ status: "approved", childCardIds: ["approve-split-child"] }),
    });
    expect(events.at(-1)).toMatchObject({
      kind: "card_split",
      title: "Split follow-ups approved",
      entityId: "approve-split-parent",
      metadata: expect.objectContaining({
        cardId: "approve-split-parent",
        taskId: approveTask.id,
        action: "approve_split",
        splitOutcomeStatus: "approved",
        sourceRunId: "run-approve-split",
        childCardIds: ["approve-split-child"],
      }),
    });

    const mergeTask = createTask(db, {
      title: "Merge split task",
      description: "Merge split task description.",
      state: "needs_review",
      labels: ["split"],
      blockedBy: [],
    });
    insertTicketizedCard(db, {
      id: "merge-split-parent",
      boardId: "board-1",
      taskId: mergeTask.id,
      title: "Merge split parent",
    });
    insertSplitChild(db, {
      id: "merge-split-child",
      boardId: "board-1",
      title: "Merge split child",
      acceptanceCriteria: ["Merge child criteria."],
      labels: ["child-label"],
    });
    seedProofReview(db, "merge-split-parent", proofReviewForRun("run-merge-split"));
    seedSplitOutcome(db, "merge-split-parent", ["merge-split-child"], {
      remainingCriteria: ["Merge remaining criteria."],
      sourceRunId: "run-merge-split",
    });

    const merged = repository.resolveProjectBoardSplitDecision({ cardId: "merge-split-parent", action: "merge_followups" });

    expect(merged).toMatchObject({
      id: "merge-split-parent",
      status: "ready",
      proofReview: undefined,
      splitOutcome: expect.objectContaining({ status: "rejected" }),
      acceptanceCriteria: ["Acceptance criteria completed.", "Merge remaining criteria.", "Merge child criteria."],
      labels: ["proof", "child-label", "merged-follow-up"],
    });
    expect(readCard(db, "merge-split-child")).toMatchObject({ candidate_status: "rejected" });
    expect(getTask(db, mergeTask.id).state).toBe("ready");
    expect(events.at(-1)).toMatchObject({
      title: "Split follow-ups merged into parent",
      metadata: expect.objectContaining({ action: "merge_followups", splitOutcomeStatus: "rejected" }),
    });

    const doneTask = createTask(db, {
      title: "Done split task",
      description: "Done split task description.",
      state: "needs_review",
      labels: ["split"],
      blockedBy: [],
    });
    insertTicketizedCard(db, {
      id: "done-split-parent",
      boardId: "board-1",
      taskId: doneTask.id,
      title: "Done split parent",
    });
    insertSplitChild(db, {
      id: "done-split-child",
      boardId: "board-1",
      title: "Done split child",
      status: "done",
      acceptanceCriteria: ["Done child criteria."],
    });
    seedProofReview(db, "done-split-parent", proofReviewForRun("run-done-split"));
    seedSplitOutcome(db, "done-split-parent", ["done-split-child"], {
      remainingCriteria: ["Done remaining criteria."],
      sourceRunId: "run-done-split",
    });

    const closed = repository.resolveProjectBoardSplitDecision({
      cardId: "done-split-parent",
      action: "accept_done_via_split",
      reason: "Children are terminal.",
    });

    expect(closed).toMatchObject({
      id: "done-split-parent",
      status: "done",
      proofReview: expect.objectContaining({
        status: "done",
        runId: "run-done-split",
        followUpCardIds: ["done-split-child"],
        satisfied: expect.arrayContaining(["Split follow-ups were completed before the parent was closed."]),
      }),
      splitOutcome: expect.objectContaining({ status: "done_via_split" }),
    });
    expect(getTask(db, doneTask.id).state).toBe("done");
    expect(events.at(-1)).toMatchObject({
      title: "Parent closed via split",
      metadata: expect.objectContaining({
        action: "accept_done_via_split",
        reason: "Children are terminal.",
        splitOutcomeStatus: "done_via_split",
      }),
    });
    expect(syncedBoards).toEqual(["board-1", "board-1", "board-1"]);
    expect(syncedCards).toBe(3);
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function insertTicketizedCard(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    taskId: string;
    title: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_kind, source_id, orchestration_task_id, created_at, updated_at)
     VALUES (?, ?, ?, 'Ticketized proof card.', 'in_progress', 'ready_to_create', 2, 'Phase 1', '["proof"]', '[]',
       '["Acceptance criteria completed."]',
       '{"unit":["Run unit proof."],"integration":[],"visual":[],"manual":["Manual review confirmed."]}',
       'planner_plan', ?, ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.boardId, input.title, `planner:${input.id}`, input.taskId);
}

function insertSplitChild(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    status?: ProjectBoardCard["status"];
    labels?: string[];
    acceptanceCriteria: string[];
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_kind, source_id, created_at, updated_at)
     VALUES (?, ?, ?, 'Split child card.', ?, 'ready_to_create', 3, 'Phase 1', ?, '[]',
       ?, '{"unit":["repository test"],"integration":[],"visual":[],"manual":[]}',
       'run_follow_up', ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(
    input.id,
    input.boardId,
    input.title,
    input.status ?? "draft",
    JSON.stringify(input.labels ?? ["split-child"]),
    JSON.stringify(input.acceptanceCriteria),
    `split:${input.id}`,
  );
}

function proofReviewForRun(runId: string): ProjectBoardCardProofReview {
  return {
    status: "ready_for_review",
    summary: "Proof is ready for PM review.",
    satisfied: ["Implementation evidence recorded."],
    missing: [],
    followUpCardIds: [],
    runId,
    reviewedAt: "2026-06-16T00:02:30.000Z",
    reviewer: "deterministic",
    recommendedAction: "close",
    evidenceQuality: "strong",
    confidence: 0.9,
  };
}

function seedProofReview(db: Database.Database, cardId: string, review: ProjectBoardCardProofReview): void {
  db.prepare("UPDATE project_board_cards SET status = 'review', proof_review_json = ? WHERE id = ?").run(JSON.stringify(review), cardId);
}

function seedSplitOutcome(
  db: Database.Database,
  cardId: string,
  childCardIds: string[],
  overrides: Partial<ProjectBoardCardSplitOutcome> = {},
): void {
  const splitOutcome: ProjectBoardCardSplitOutcome = {
    status: "proposed",
    source: "proof_review",
    sourceRunId: "run-split",
    reason: "The parent scope was split into follow-up cards.",
    partialProofSummary: "Parent made partial progress before split.",
    completedCriteria: ["Completed parent criteria."],
    remainingCriteria: ["Remaining parent criteria."],
    createdAt: "2026-06-16T00:02:00.000Z",
    updatedAt: "2026-06-16T00:02:00.000Z",
    ...overrides,
    childCardIds,
  };
  db.prepare("UPDATE project_board_cards SET split_outcome_json = ? WHERE id = ?").run(JSON.stringify(splitOutcome), cardId);
}

function listTasks(db: Database.Database): OrchestrationTask[] {
  const rows = db.prepare("SELECT * FROM orchestration_tasks ORDER BY created_at ASC, rowid ASC").all() as OrchestrationTaskRow[];
  return rows.map((row) => mapOrchestrationTaskRow(row));
}

function listRuns(db: Database.Database, limit = 50): OrchestrationRun[] {
  const rows = db.prepare("SELECT * FROM orchestration_runs ORDER BY started_at DESC LIMIT ?").all(limit) as OrchestrationRunRow[];
  return rows.map((row) => mapOrchestrationRunRow(row));
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
