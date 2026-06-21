import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardCardProofReview } from "../../shared/projectBoardTypes";
import type { CreateOrchestrationTaskInput, OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  mapOrchestrationRunRow,
  mapOrchestrationTaskRow,
  type OrchestrationRunRow,
  type OrchestrationTaskRow,
} from "./orchestrationMappers";
import { ProjectStoreProjectBoardCardProofReviewRepository } from "./projectBoardCardProofReviewRepository";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import { mapProjectBoardCardRow, type ProjectBoardCardStoreRow } from "./projectBoardMappers";
import { PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION, type ProjectBoardRunArtifactProjection } from "./projectStoreProjectBoardFacade";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";

describe("ProjectStoreProjectBoardCardProofReviewRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardCardMutationEventInput[];
  let syncedCards: number;
  let taskDescriptionUpdates: Array<{ taskId: string; description: string }>;
  let repository: ProjectStoreProjectBoardCardProofReviewRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    syncedCards = 0;
    taskDescriptionUpdates = [];
    repository = new ProjectStoreProjectBoardCardProofReviewRepository(db, {
      listOrchestrationTasks: () => listTasks(db),
      listOrchestrationRuns: (limit) => listRuns(db, limit),
      getOrchestrationTask: (taskId) => getTask(db, taskId),
      getOrchestrationRun: (runId) => getRun(db, runId),
      updateOrchestrationTaskDescription: (taskId, description) => {
        taskDescriptionUpdates.push({ taskId, description });
      },
      projectBoardCardTaskDescription: (card) => `Task description for ${card.title}`,
      appendProjectBoardEvent: (event) => events.push(event),
      syncProjectBoardCardsForLinkedTasks: () => {
        syncedCards += 1;
      },
    });
    insertBoard(db, "board-1");
  });

  afterEach(() => {
    db.close();
  });

  it("creates proof-review follow-up cards", () => {
    insertSplitCandidate(db, {
      id: "proof-parent",
      boardId: "board-1",
      title: "Parent proof card",
      description: "Parent proof card description.",
      sourceKind: "planner_plan",
      sourceId: "artifact-2",
      sourceThreadId: "parent-thread",
      sourceMessageId: "parent-message",
      labels: ["plan"],
      acceptanceCriteria: ["Implement the proof path.", "Record manual evidence."],
    });
    const parent = readCard(db, "proof-parent");
    const run: OrchestrationRun = {
      id: "run-proof",
      taskId: "task-proof-parent",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/workspace",
      threadId: "run-thread",
      startedAt: "2026-06-16T00:00:00.000Z",
    };

    const ids = repository.createProjectBoardProofFollowUpForRun(
      run,
      parent,
      {
        status: "needs_follow_up",
        summary: "Missing proof needs a follow-up.",
        satisfied: ["Implementation evidence recorded."],
        missing: ["Manual review proof missing."],
      },
      {
        blockByParent: false,
        labels: ["pi-suggested-follow-up", "deploy"],
        title: "Capture deploy proof",
        description: "Capture the deploy proof package.",
        acceptanceCriteria: ["Attach deploy proof."],
        clarificationQuestions: ["Which environment needs proof?"],
      },
    );
    const duplicateIds = repository.createProjectBoardProofFollowUpForRun(run, parent, {
      status: "needs_follow_up",
      summary: "Missing proof needs a follow-up.",
      satisfied: [],
      missing: ["Manual review proof missing."],
    });

    expect(duplicateIds).toEqual(ids);
    expect(events.filter((event) => event.title === "Proof follow-up proposed")).toHaveLength(1);
    const followUp = listCards(db, "board-1").find((card) => card.id === ids[0]);
    expect(followUp).toMatchObject({
      boardId: "board-1",
      title: "Capture deploy proof",
      description: "Capture the deploy proof package.",
      status: "draft",
      candidateStatus: "needs_clarification",
      priority: 4,
      phase: "Phase 1",
      labels: ["proof-follow-up", "pi-suggested-follow-up", "deploy", "plan"],
      blockedBy: [],
      acceptanceCriteria: ["Attach deploy proof."],
      clarificationQuestions: ["Which environment needs proof?"],
      sourceKind: "run_follow_up",
      sourceId: "run-proof#proof-review",
      sourceThreadId: "run-thread",
      orchestrationTaskId: undefined,
    });
    expect(events.at(-1)).toMatchObject({
      kind: "run_follow_up_created",
      title: "Proof follow-up proposed",
      entityKind: "orchestration_run",
      entityId: "run-proof",
      metadata: expect.objectContaining({
        runId: "run-proof",
        parentCardId: "proof-parent",
        followUpCardIds: ids,
        proofReviewStatus: "needs_follow_up",
        derivedFromParent: true,
        labels: ["pi-suggested-follow-up", "deploy"],
        piSuggestedFollowUp: true,
        suggestedTitle: "Capture deploy proof",
      }),
    });
  });

  it("creates explicit run follow-up candidates", () => {
    insertSplitCandidate(db, {
      id: "run-parent",
      boardId: "board-1",
      title: "Parent run card",
      description: "Parent run card description.",
      sourceKind: "planner_plan",
      sourceId: "artifact-3",
      sourceThreadId: "parent-thread",
      sourceMessageId: "parent-message",
      labels: ["plan"],
      acceptanceCriteria: ["Ship the parent work.", "Record follow-ups."],
    });
    const parent = readCard(db, "run-parent");
    const run: OrchestrationRun = {
      id: "run-explicit",
      taskId: "task-run-parent",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/workspace",
      threadId: "run-thread",
      startedAt: "2026-06-16T00:00:00.000Z",
      proofOfWork: {
        followUps: [
          {
            title: "Add visual edge coverage",
            description: "The run found a missing visual edge case.",
            acceptanceCriteria: ["Capture the edge case."],
            testPlan: { visual: ["Run visual smoke for the edge case."] },
          },
          "Document the follow-up policy",
        ],
      },
    };

    const ids = repository.createProjectBoardFollowUpCandidatesForRun(run, parent, {
      labels: ["runtime-split-follow-up"],
      clarificationQuestions: ["Should these follow-ups remain blocked by the parent?"],
    });
    const duplicateIds = repository.createProjectBoardFollowUpCandidatesForRun(run, parent);

    expect(ids).toHaveLength(2);
    expect(duplicateIds).toEqual([]);
    const followUps = listCards(db, "board-1").filter((card) => ids.includes(card.id));
    expect(followUps).toEqual([
      expect.objectContaining({
        title: "Add visual edge coverage",
        description: "The run found a missing visual edge case.",
        status: "draft",
        candidateStatus: "needs_clarification",
        priority: 4,
        phase: "Phase 1",
        labels: ["run-follow-up", "runtime-split-follow-up", "plan"],
        blockedBy: ["run-parent"],
        acceptanceCriteria: ["Capture the edge case."],
        clarificationQuestions: ["Should these follow-ups remain blocked by the parent?"],
        sourceKind: "run_follow_up",
        sourceId: "run-explicit#follow-up:1",
        sourceThreadId: "run-thread",
        orchestrationTaskId: undefined,
      }),
      expect.objectContaining({
        title: "Document the follow-up policy",
        description: "Follow-up proposed by a completed project board run.",
        priority: 5,
        labels: ["run-follow-up", "runtime-split-follow-up", "plan"],
        blockedBy: ["run-parent"],
        acceptanceCriteria: ["Resolve follow-up: Document the follow-up policy"],
        sourceKind: "run_follow_up",
        sourceId: "run-explicit#follow-up:2",
        sourceThreadId: "run-thread",
      }),
    ]);
    expect(events.filter((event) => event.title === "Run follow-ups proposed")).toEqual([
      expect.objectContaining({
        kind: "run_follow_up_created",
        entityKind: "orchestration_run",
        entityId: "run-explicit",
        metadata: expect.objectContaining({
          runId: "run-explicit",
          parentCardId: "run-parent",
          followUpCardIds: ids,
          derivedFromParent: false,
          labels: ["runtime-split-follow-up"],
        }),
      }),
    ]);
  });

  it("materializes pulled handoff follow-ups", () => {
    insertSplitCandidate(db, {
      id: "handoff-parent",
      boardId: "board-1",
      title: "Parent handoff card",
      description: "Parent handoff card description.",
      sourceKind: "planner_plan",
      sourceId: "artifact-4",
      sourceThreadId: "parent-thread",
      sourceMessageId: "parent-message",
      labels: ["plan"],
      acceptanceCriteria: ["Ship the parent work.", "Pull collaborator handoffs."],
    });
    const runArtifacts: ProjectBoardRunArtifactProjection[] = [
      {
        runPathId: "run-pulled",
        handoff: {
          schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
          runId: "run-pulled",
          boardId: "board-1",
          cardId: "handoff-parent",
          summary: "Pulled collaborator handoff.",
          completed: ["Initial work completed."],
          remaining: ["Follow-up work remains."],
          risks: [],
          followUps: [
            {
              title: "Add collaborator visual proof",
              reason: "Collaborator left screenshot proof for a separate pass.",
              blockedBy: ["handoff-parent", "external-card"],
            },
            {
              title: "Document collaborator handoff",
              reason: "",
              blockedBy: [],
            },
          ],
          createdAt: "2026-06-16T00:05:00.000Z",
        },
      },
    ];

    const ids = repository.materializeProjectBoardPulledHandoffFollowUps("board-1", runArtifacts);
    const duplicateIds = repository.materializeProjectBoardPulledHandoffFollowUps("board-1", runArtifacts);

    expect(ids).toHaveLength(2);
    expect(duplicateIds).toEqual([]);
    const followUps = listCards(db, "board-1").filter((card) => ids.includes(card.id));
    expect(followUps).toEqual([
      expect.objectContaining({
        title: "Add collaborator visual proof",
        description: "Pulled handoff follow-up from Parent handoff card.\n\nCollaborator left screenshot proof for a separate pass.",
        status: "draft",
        candidateStatus: "needs_clarification",
        priority: 4,
        phase: "Phase 1",
        labels: ["run-follow-up", "pulled-handoff", "plan"],
        blockedBy: ["handoff-parent", "external-card"],
        acceptanceCriteria: [
          "Resolve follow-up: Add collaborator visual proof",
          "Address handoff reason: Collaborator left screenshot proof for a separate pass.",
        ],
        sourceKind: "run_follow_up",
        sourceId: "run-pulled#follow-up:1",
        sourceThreadId: "parent-thread",
        orchestrationTaskId: undefined,
      }),
      expect.objectContaining({
        title: "Document collaborator handoff",
        description: "Pulled handoff follow-up from Parent handoff card.",
        priority: 5,
        labels: ["run-follow-up", "pulled-handoff", "plan"],
        blockedBy: ["handoff-parent"],
        acceptanceCriteria: ["Resolve follow-up: Document collaborator handoff"],
        sourceKind: "run_follow_up",
        sourceId: "run-pulled#follow-up:2",
        sourceThreadId: "parent-thread",
      }),
    ]);
    expect(readBoardUpdatedAt(db, "board-1")).toBe("2026-06-16T00:05:00.000Z");
    expect(readProjectBoardEvents(db, "board-1").filter((event) => event.event_kind === "run_follow_up_created")).toEqual([
      expect.objectContaining({
        title: "Pulled handoff follow-ups proposed",
        entity_kind: "run",
        entity_id: "run-pulled",
        metadata_json: JSON.stringify({
          runId: "run-pulled",
          parentCardId: "handoff-parent",
          followUpCardIds: ids,
          source: "pulled_handoff",
        }),
      }),
    ]);
  });

  it("checks proof-review currentness and applies proof reviews", () => {
    const task = createTask(db, {
      title: "Proof application task",
      description: "Apply proof review.",
      state: "running",
      labels: ["proof"],
      blockedBy: [],
    });
    insertTicketizedCard(db, {
      id: "proof-application-card",
      boardId: "board-1",
      taskId: task.id,
      title: "Proof application card",
    });
    const staleRun = createRun(db, {
      id: "run-stale-proof",
      taskId: task.id,
      status: "completed",
      startedAt: "2026-06-16T00:01:00.000Z",
      proofOfWork: {
        changedFiles: ["src/feature.ts"],
        testOutput: "Unit proof passed. Acceptance criteria completed.",
        manualChecks: ["Manual review confirmed."],
      },
    });
    const currentRun = createRun(db, {
      id: "run-current-proof",
      taskId: task.id,
      status: "completed",
      startedAt: "2026-06-16T00:02:00.000Z",
      proofOfWork: {
        changedFiles: ["src/feature.ts"],
        testOutput: "Unit proof passed. Acceptance criteria completed.",
        manualChecks: ["Manual review confirmed."],
      },
    });

    expect(repository.isProjectBoardProofReviewRunCurrent(staleRun.id, true)).toBe(false);
    expect(repository.isProjectBoardProofReviewRunCurrent(currentRun.id)).toBe(true);
    expect(repository.isProjectBoardProofReviewRunCurrent(currentRun.id, true)).toBe(false);
    const stale = repository.applyProjectBoardCardProofReview({
      runId: staleRun.id,
      requireCurrentReview: true,
      review: {
        status: "done",
        summary: "Late proof judge tried to close an old run.",
        satisfied: ["Old proof."],
        missing: [],
        followUpCardIds: [],
        runId: staleRun.id,
        reviewedAt: "2026-06-16T00:03:00.000Z",
        reviewer: "ambient_pi",
        recommendedAction: "close",
        evidenceQuality: "strong",
        confidence: 0.9,
      },
    });

    expect(stale).toMatchObject({ id: "proof-application-card", proofReview: undefined });
    expect(readCard(db, "proof-application-card")).toMatchObject({ status: "in_progress", proof_review_json: null });
    expect(events.at(-1)).toMatchObject({
      kind: "card_proof_review_ignored",
      title: "Stale proof review ignored",
      entityId: "proof-application-card",
      metadata: expect.objectContaining({ runId: staleRun.id, staleReason: "newer_run_started" }),
    });

    const applied = repository.applyProjectBoardCardProofReview({
      runId: currentRun.id,
      review: {
        status: "done",
        summary: "Current proof satisfies the card.",
        satisfied: [
          "Implementation evidence recorded.",
          "Acceptance criteria discussed in proof.",
          "Unit proof recorded.",
          "Manual review proof recorded.",
        ],
        missing: [],
        followUpCardIds: [],
        runId: currentRun.id,
        reviewedAt: "2026-06-16T00:04:00.000Z",
        reviewer: "ambient_pi",
        recommendedAction: "close",
        evidenceQuality: "strong",
        confidence: 0.95,
      },
    });

    expect(applied).toMatchObject({
      id: "proof-application-card",
      status: "done",
      proofReview: expect.objectContaining({
        status: "done",
        summary: "Current proof satisfies the card.",
        runId: currentRun.id,
        reviewer: "ambient_pi",
        recommendedAction: "close",
        confidence: 0.95,
      }),
    });
    expect(getTask(db, task.id).state).toBe("done");
    expect(readBoardUpdatedAt(db, "board-1")).not.toBe("2026-06-16T00:00:00.000Z");
    expect(events.at(-1)).toMatchObject({
      kind: "card_proof_reviewed",
      title: "Card proof reviewed by Pi",
      entityId: "proof-application-card",
      metadata: expect.objectContaining({
        cardId: "proof-application-card",
        runId: currentRun.id,
        status: "done",
        followUpCardIds: [],
        reviewer: "ambient_pi",
        recommendedAction: "close",
      }),
    });
  });

  it("persists PM proof decisions", () => {
    const retryTask = createTask(db, {
      title: "Retry proof task",
      description: "Retry proof task description.",
      state: "needs_review",
      labels: ["proof"],
      blockedBy: [],
    });
    insertTicketizedCard(db, {
      id: "retry-proof-card",
      boardId: "board-1",
      taskId: retryTask.id,
      title: "Retry proof card",
    });
    const retryRun = createRun(db, {
      id: "run-retry-proof",
      taskId: retryTask.id,
      status: "completed",
      startedAt: "2026-06-16T00:03:00.000Z",
      proofOfWork: { changedFiles: ["src/retry.ts"], testOutput: "Initial proof passed." },
    });
    seedProofReview(db, "retry-proof-card", proofReviewForRun(retryRun.id));

    const retried = repository.resolveProjectBoardProofDecision({
      cardId: "retry-proof-card",
      action: "retry",
      reason: "Add mobile screenshot proof before closing.",
    });

    expect(retried).toMatchObject({ id: "retry-proof-card", status: "ready", proofReview: undefined });
    expect(retried.runFeedback).toEqual([
      expect.objectContaining({
        source: "proof_review",
        decisionQuestion: "Why was this proof sent back for revision?",
        decisionAnswer: "Add mobile screenshot proof before closing.",
        feedback: expect.stringContaining("Add mobile screenshot proof before closing."),
      }),
    ]);
    expect(getTask(db, retryTask.id).state).toBe("ready");
    expect(taskDescriptionUpdates).toEqual([{ taskId: retryTask.id, description: "Task description for Retry proof card" }]);
    expect(events.at(-1)).toMatchObject({
      kind: "card_updated",
      title: "Proof sent back for revision",
      entityId: "retry-proof-card",
      metadata: expect.objectContaining({
        cardId: "retry-proof-card",
        taskId: retryTask.id,
        action: "retry",
        reason: "Add mobile screenshot proof before closing.",
        previousProofReviewStatus: "ready_for_review",
        previousRunId: retryRun.id,
        runFeedback: expect.objectContaining({
          source: "proof_review",
          decisionQuestion: "Why was this proof sent back for revision?",
          modelCallRequired: false,
        }),
      }),
    });

    const doneTask = createTask(db, {
      title: "Done proof task",
      description: "Done proof task description.",
      state: "needs_review",
      labels: ["proof"],
      blockedBy: [],
    });
    insertTicketizedCard(db, {
      id: "done-proof-card",
      boardId: "board-1",
      taskId: doneTask.id,
      title: "Done proof card",
    });
    const doneRun = createRun(db, {
      id: "run-done-proof",
      taskId: doneTask.id,
      status: "completed",
      startedAt: "2026-06-16T00:04:00.000Z",
      proofOfWork: { changedFiles: ["src/done.ts"], testOutput: "Done proof passed." },
    });
    seedProofReview(db, "done-proof-card", proofReviewForRun(doneRun.id));

    const done = repository.resolveProjectBoardProofDecision({
      cardId: "done-proof-card",
      action: "accept_done",
      reason: "Proof is sufficient.",
    });

    expect(done).toMatchObject({
      id: "done-proof-card",
      status: "done",
      proofReview: expect.objectContaining({
        status: "done",
        recommendedAction: "close",
        runId: doneRun.id,
        satisfied: expect.arrayContaining(["Accepted by user PM decision."]),
      }),
    });
    expect(done.proofReview?.summary).toContain("Proof is sufficient.");
    expect(getTask(db, doneTask.id).state).toBe("done");
    expect(events.at(-1)).toMatchObject({
      title: "Proof accepted as done",
      metadata: expect.objectContaining({ action: "accept_done", previousRunId: doneRun.id }),
    });

    const blockedTask = createTask(db, {
      title: "Blocked proof task",
      description: "Blocked proof task description.",
      state: "needs_review",
      labels: ["proof"],
      blockedBy: [],
    });
    insertTicketizedCard(db, {
      id: "blocked-proof-card",
      boardId: "board-1",
      taskId: blockedTask.id,
      title: "Blocked proof card",
    });
    const blockedRun = createRun(db, {
      id: "run-blocked-proof",
      taskId: blockedTask.id,
      status: "completed",
      startedAt: "2026-06-16T00:05:00.000Z",
      proofOfWork: { changedFiles: ["src/blocked.ts"], testOutput: "Blocked proof collected." },
    });
    seedProofReview(db, "blocked-proof-card", proofReviewForRun(blockedRun.id));

    const blocked = repository.resolveProjectBoardProofDecision({
      cardId: "blocked-proof-card",
      action: "mark_blocked",
      reason: "Missing API key.",
    });

    expect(blocked).toMatchObject({
      id: "blocked-proof-card",
      status: "blocked",
      proofReview: expect.objectContaining({ status: "terminally_blocked", recommendedAction: "block" }),
    });
    expect(blocked.proofReview?.missing).toContain("Missing API key.");
    expect(getTask(db, blockedTask.id).state).toBe("terminal_blocker");
    expect(events.at(-1)).toMatchObject({
      title: "Proof marked blocked",
      metadata: expect.objectContaining({ action: "mark_blocked", previousRunId: blockedRun.id }),
    });
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

function insertSplitCandidate(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    description: string;
    sourceKind: string;
    sourceId: string;
    sourceThreadId: string;
    sourceMessageId: string;
    labels: string[];
    acceptanceCriteria: string[];
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json, clarification_decisions_json,
       source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', 'ready_to_create', 3, 'Phase 1', ?, '[]',
       ?, '{"unit":["repository test"],"integration":[],"visual":[],"manual":[]}', '["plan.md"]', '["Confirm the split?"]', '[]',
       ?, ?, ?, ?, NULL, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(
    input.id,
    input.boardId,
    input.title,
    input.description,
    JSON.stringify(input.labels),
    JSON.stringify(input.acceptanceCriteria),
    input.sourceKind,
    input.sourceId,
    input.sourceThreadId,
    input.sourceMessageId,
  );
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

function listRuns(db: Database.Database, limit = 50): OrchestrationRun[] {
  const rows = db.prepare("SELECT * FROM orchestration_runs ORDER BY started_at DESC LIMIT ?").all(limit) as OrchestrationRunRow[];
  return rows.map((row) => mapOrchestrationRunRow(row));
}

function readBoardUpdatedAt(db: Database.Database, boardId: string): string {
  const row = db.prepare("SELECT updated_at FROM project_boards WHERE id = ?").get(boardId) as { updated_at: string } | undefined;
  if (!row) throw new Error(`Board not found: ${boardId}`);
  return row.updated_at;
}

function readProjectBoardEvents(
  db: Database.Database,
  boardId: string,
): Array<{ event_kind: string; title: string; entity_kind: string | null; entity_id: string | null; metadata_json: string }> {
  return db
    .prepare(
      "SELECT event_kind, title, entity_kind, entity_id, metadata_json FROM project_board_events WHERE board_id = ? ORDER BY created_at ASC, rowid ASC",
    )
    .all(boardId) as Array<{
    event_kind: string;
    title: string;
    entity_kind: string | null;
    entity_id: string | null;
    metadata_json: string;
  }>;
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

function createRun(
  db: Database.Database,
  input: {
    id: string;
    taskId: string;
    status: string;
    startedAt: string;
    proofOfWork?: Record<string, unknown>;
  },
): OrchestrationRun {
  db.prepare(
    `INSERT INTO orchestration_runs
      (id, task_id, attempt_number, status, workspace_path, thread_id, pi_session_file, started_at, finished_at, last_event_at, error, proof_of_work_json)
     VALUES (?, ?, 1, ?, '/workspace', ?, NULL, ?, ?, ?, NULL, ?)`,
  ).run(
    input.id,
    input.taskId,
    input.status,
    `thread-${input.id}`,
    input.startedAt,
    input.status === "completed" ? input.startedAt : null,
    input.startedAt,
    input.proofOfWork ? JSON.stringify(input.proofOfWork) : null,
  );
  return getRun(db, input.id);
}

function getTask(db: Database.Database, taskId: string): OrchestrationTask {
  const row = db.prepare("SELECT * FROM orchestration_tasks WHERE id = ?").get(taskId) as OrchestrationTaskRow | undefined;
  if (!row) throw new Error(`Task not found: ${taskId}`);
  return mapOrchestrationTaskRow(row);
}

function getRun(db: Database.Database, runId: string): OrchestrationRun {
  const row = db.prepare("SELECT * FROM orchestration_runs WHERE id = ?").get(runId) as OrchestrationRunRow | undefined;
  if (!row) throw new Error(`Run not found: ${runId}`);
  return mapOrchestrationRunRow(row);
}

function readCard(db: Database.Database, cardId: string): ProjectBoardCardStoreRow {
  const row = db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
  if (!row) throw new Error(`Card not found: ${cardId}`);
  return row;
}
