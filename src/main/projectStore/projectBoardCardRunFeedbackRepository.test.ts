import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardPlanningSnapshot } from "../../shared/projectBoardTypes";
import type { CreateOrchestrationTaskInput, OrchestrationTask } from "../../shared/workflowTypes";
import {
  mapOrchestrationTaskRow,
  type OrchestrationTaskRow,
} from "./orchestrationMappers";
import { ProjectStoreProjectBoardCardDraftMutationRepository } from "./projectBoardCardDraftMutationRepository";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import { ProjectStoreProjectBoardCardRunFeedbackRepository } from "./projectBoardCardRunFeedbackRepository";
import { ProjectStoreProjectBoardCardTicketizationRepository } from "./projectBoardCardTicketizationRepository";
import { mapProjectBoardCardRow, type ProjectBoardCardStoreRow } from "./projectBoardMappers";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";

describe("ProjectStoreProjectBoardCardRunFeedbackRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardCardMutationEventInput[];
  let syncedBoards: string[];
  let taskDescriptionUpdates: Array<{ taskId: string; description: string }>;
  let latestPlanningSnapshot: { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined;
  let draftMutations: ProjectStoreProjectBoardCardDraftMutationRepository;
  let ticketizationMutations: ProjectStoreProjectBoardCardTicketizationRepository;
  let repository: ProjectStoreProjectBoardCardRunFeedbackRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    syncedBoards = [];
    taskDescriptionUpdates = [];
    latestPlanningSnapshot = undefined;
    const deps = {
      listOrchestrationTasks: () => listTasks(db),
      getActiveProjectBoard: () => ({
        id: "board-1",
        projectPath: "/workspace",
        status: "active" as const,
        title: "Project board",
        summary: "",
        cards: [],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-06-16T00:00:00.000Z",
        updatedAt: "2026-06-16T00:00:00.000Z",
      }),
      getProjectBoard: (boardId: string) => ({
        id: boardId,
        projectPath: "/workspace",
        status: "active" as const,
        title: "Project board",
        summary: "",
        cards: listCards(db, boardId),
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-06-16T00:00:00.000Z",
        updatedAt: "2026-06-16T00:00:00.000Z",
      }),
      getRunningProjectBoardSynthesisRun: () => undefined,
      listProjectBoardCards: (boardId: string) => listCards(db, boardId),
      latestStableProjectBoardPlanningSnapshot: () => latestPlanningSnapshot,
      projectBoardRequiresProofSpec: () => false,
      assertProjectBoardCardProofReady: () => undefined,
      assertProjectBoardCardClarificationsResolved: () => undefined,
      assertProjectBoardCardClaimAllowsLocalTicketization: () => undefined,
      assertProjectBoardRunFollowUpStillActionable: () => undefined,
      appendProjectBoardEvent: (event: ProjectBoardCardMutationEventInput) => events.push(event),
      syncProjectBoardTaskBlockers: (boardId: string) => syncedBoards.push(boardId),
      syncProjectBoardCardsForLinkedTasks: () => undefined,
      createOrchestrationTask: (input: CreateOrchestrationTaskInput) => createTask(db, input),
      getOrchestrationTask: (taskId: string) => getTask(db, taskId),
      mapOrchestrationTask: (row: OrchestrationTaskRow) => mapOrchestrationTaskRow(row),
      updateOrchestrationTaskDescription: (taskId: string, description: string) => {
        taskDescriptionUpdates.push({ taskId, description });
      },
      projectBoardCardTaskDescription: (card: ProjectBoardCard) => `Task description for ${card.title}`,
      assertProjectBoardUxMockGateOpen: () => undefined,
    };
    draftMutations = new ProjectStoreProjectBoardCardDraftMutationRepository(db, deps);
    ticketizationMutations = new ProjectStoreProjectBoardCardTicketizationRepository(db, deps);
    repository = new ProjectStoreProjectBoardCardRunFeedbackRepository(db, {
      ...deps,
      updateCard: (input) => draftMutations.updateCard(input),
    });
    insertBoard(db, "board-1");
  });

  afterEach(() => {
    db.close();
  });

  it("owns run feedback mutations for ticketized cards", () => {
    const task = createTask(db, {
      title: "Ready draft",
      description: "Ready draft task.",
      state: "ready",
      labels: ["manual"],
    });
    insertTicketizedCard(db, {
      id: "feedback-card",
      boardId: "board-1",
      taskId: task.id,
      title: "Ready draft",
    });
    db.prepare("UPDATE project_board_cards SET status = 'ready', orchestration_task_id = ?, updated_at = ? WHERE id = ?").run(
      task.id,
      "2026-06-16T00:01:00.000Z",
      "feedback-card",
    );

    const withFeedback = repository.addRunFeedback({
      cardId: "feedback-card",
      feedback: "Use the new keyboard policy next run.",
      source: "decision_impact",
      decisionQuestion: "What changed?",
      decisionAnswer: "Keyboard policy changed.",
    });

    expect(withFeedback.runFeedback).toEqual([
      expect.objectContaining({
        feedback: "Use the new keyboard policy next run.",
        source: "decision_impact",
      }),
    ]);
    expect(taskDescriptionUpdates).toEqual([{ taskId: task.id, description: "Task description for Ready draft" }]);
    expect(events.at(-1)).toMatchObject({
      title: "Run feedback added",
      metadata: expect.objectContaining({ taskId: task.id }),
    });
  });

  it("owns decision-impact feedback for draft answers and linked ticketized card run feedback", () => {
    const question = "What greeting should the app render?";
    const answer = "Hello from Ambient.";
    const source = draftMutations.createManualCard({
      boardId: "board-1",
      title: "Choose greeting copy",
      description: "Decide the greeting copy before final implementation.",
    });
    draftMutations.updateCard({
      cardId: source.id,
      acceptanceCriteria: ["Greeting copy is selected."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Confirm PM answer is recorded."] },
      clarificationQuestions: [question],
    });
    const linked = draftMutations.createManualCard({
      boardId: "board-1",
      title: "Render greeting",
      description: "Render the greeting.",
    });
    const linkedReady = draftMutations.updateCard({
      cardId: linked.id,
      description: `Render the greeting in the HTML app.\n${question}`,
      acceptanceCriteria: ["The app renders the PM-approved greeting."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Open the app and confirm the greeting text."] },
      candidateStatus: "ready_to_create",
    });
    const approved = ticketizationMutations.approveProjectBoardCard(linkedReady.id);

    const updatedSource = repository.applyDecisionImpactFeedback({ cardId: source.id, question, answer });

    expect(updatedSource.clarificationAnswers).toEqual([
      expect.objectContaining({
        question,
        answer,
      }),
    ]);
    const updatedLinked = listCards(db, "board-1").find((card) => card.id === approved.id);
    expect(updatedLinked).toMatchObject({
      title: "Render greeting",
      description: `Render the greeting in the HTML app.\n${question}`,
      runFeedback: [
        expect.objectContaining({
          source: "decision_impact",
          decisionQuestion: question,
          decisionAnswer: answer,
        }),
      ],
    });
    expect(taskDescriptionUpdates).toEqual([{ taskId: approved.orchestrationTaskId, description: "Task description for Render greeting" }]);
    expect(events.some((event) => event.title === "Run feedback added")).toBe(true);
    expect(events.at(-1)).toMatchObject({
      title: "Decision impact applied",
      metadata: expect.objectContaining({
        cardId: source.id,
        decisionImpact: expect.objectContaining({
          appliedAction: "create_next_run_feedback",
          modelCallRequired: false,
          appliedCardIds: [approved.id],
          skippedCardIds: [],
        }),
      }),
    });

    repository.applyDecisionImpactFeedback({ cardId: source.id, question, answer });
    const duplicateCheck = listCards(db, "board-1").find((card) => card.id === approved.id);
    expect(duplicateCheck?.runFeedback).toHaveLength(1);
  });

  it("owns decision draft refresh persistence across affected draft cards", () => {
    const question = "Should numpad operators map directly to calculator operators?";
    const answer = "Support direct numpad operator mappings.";
    const source = draftMutations.createManualCard({
      boardId: "board-1",
      title: "Choose keyboard policy",
      description: "Resolve the keyboard policy.",
    });
    draftMutations.updateCard({
      cardId: source.id,
      acceptanceCriteria: ["The keyboard policy is recorded."],
      testPlan: { unit: ["Decision is captured."], integration: [], visual: [], manual: [] },
      clarificationQuestions: [question],
    });
    const affected = draftMutations.createManualCard({
      boardId: "board-1",
      title: "Implement keyboard input",
      description: `Implement keyboard input.\n${question}`,
    });
    draftMutations.updateCard({
      cardId: affected.id,
      acceptanceCriteria: ["Keyboard input follows the PM-approved policy."],
      testPlan: { unit: ["Keyboard unit tests pass."], integration: [], visual: [], manual: [] },
      clarificationQuestions: [question],
    });

    const refreshed = repository.refreshDecisionDrafts({ cardId: source.id, question, answer });

    expect(refreshed.clarificationQuestions).toEqual([]);
    expect(refreshed.clarificationAnswers).toEqual([
      expect.objectContaining({
        question,
        answer,
      }),
    ]);
    const refreshedAffected = listCards(db, "board-1").find((card) => card.id === affected.id);
    expect(refreshedAffected?.clarificationQuestions).toEqual([]);
    expect(refreshedAffected?.clarificationAnswers).toEqual([
      expect.objectContaining({
        question,
        answer,
      }),
    ]);
    expect(refreshedAffected?.description).toContain("## Clarifications");
    expect(refreshedAffected?.description).toContain(answer);
    expect(events.at(-1)).toMatchObject({
      title: "Decision drafts refreshed",
      metadata: expect.objectContaining({
        cardId: source.id,
        decisionImpact: expect.objectContaining({
          appliedAction: "refresh_affected_drafts",
          modelCallRequired: false,
          appliedCardIds: expect.arrayContaining([source.id, affected.id]),
          skippedCardIds: [],
        }),
      }),
    });

    repository.refreshDecisionDrafts({ cardId: source.id, question, answer });
    const duplicateCheck = listCards(db, "board-1").find((card) => card.id === affected.id);
    expect(duplicateCheck?.clarificationAnswers).toHaveLength(1);
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
