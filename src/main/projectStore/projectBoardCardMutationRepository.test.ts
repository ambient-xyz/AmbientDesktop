import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ProjectBoardCard,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardProofReview,
  ProjectBoardCardSplitOutcome,
  ProjectBoardPlanningSnapshot,
} from "../../shared/projectBoardTypes";
import type { CreateOrchestrationTaskInput, OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION } from "../projectBoardArtifacts";
import type { ProjectBoardRunArtifactProjection } from "../projectBoardArtifactImport";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import {
  ProjectStoreProjectBoardCardMutationRepository,
  type ProjectBoardCardMutationEventInput,
} from "./projectBoardCardMutationRepository";
import { mapOrchestrationRunRow, mapOrchestrationTaskRow, type OrchestrationRunRow, type OrchestrationTaskRow } from "./orchestrationMappers";
import { mapProjectBoardCardRow, type ProjectBoardCardStoreRow } from "./projectBoardMappers";

describe("ProjectStoreProjectBoardCardMutationRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardCardMutationEventInput[];
  let syncedBoards: string[];
  let syncedCards: number;
  let taskDescriptionUpdates: Array<{ taskId: string; description: string }>;
  let latestPlanningSnapshot: { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined;
  let repository: ProjectStoreProjectBoardCardMutationRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    syncedBoards = [];
    syncedCards = 0;
    taskDescriptionUpdates = [];
    latestPlanningSnapshot = undefined;
    repository = new ProjectStoreProjectBoardCardMutationRepository(db, {
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
      getProjectBoard: (boardId) => ({
        id: boardId,
        projectPath: "/workspace",
        status: "active",
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
      listProjectBoardCards: (boardId) => listCards(db, boardId),
      latestStableProjectBoardPlanningSnapshot: () => latestPlanningSnapshot,
      projectBoardRequiresProofSpec: () => false,
      assertProjectBoardCardProofReady: () => undefined,
      assertProjectBoardCardClarificationsResolved: () => undefined,
      assertProjectBoardCardClaimAllowsLocalTicketization: () => undefined,
      assertProjectBoardRunFollowUpStillActionable: () => undefined,
      appendProjectBoardEvent: (event) => events.push(event),
      syncProjectBoardTaskBlockers: (boardId) => syncedBoards.push(boardId),
      syncProjectBoardCardsForLinkedTasks: () => {
        syncedCards += 1;
      },
      listOrchestrationRuns: (limit) => listRuns(db, limit),
      createOrchestrationTask: (input) => createTask(db, input),
      getOrchestrationTask: (taskId) => getTask(db, taskId),
      getOrchestrationRun: (runId) => getRun(db, runId),
      mapOrchestrationTask: (row) => mapOrchestrationTaskRow(row),
      updateOrchestrationTaskDescription: (taskId, description) => {
        taskDescriptionUpdates.push({ taskId, description });
      },
      projectBoardCardTaskDescription: (card) => `Task description for ${card.title}`,
      assertProjectBoardUxMockGateOpen: () => undefined,
    });
    insertBoard(db, "board-1");
  });

  afterEach(() => {
    db.close();
  });

  it("owns single-card approval into a ready Local Task", () => {
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

  it("owns Local Task attach and evidence import card creation", () => {
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

  it("owns draft candidate splitting without creating Local Tasks", () => {
    insertSplitCandidate(db, {
      id: "split-card",
      boardId: "board-1",
      title: "Parent candidate",
      description: "Parent candidate description.",
      sourceKind: "planner_plan",
      sourceId: "artifact-1",
      sourceThreadId: "thread-1",
      sourceMessageId: "message-1",
      labels: ["plan"],
      acceptanceCriteria: ["Build the draft board.", "Verify the draft board."],
    });

    const children = repository.splitProjectBoardCard("split-card");
    const splitAgain = repository.splitProjectBoardCard("split-card");

    expect(children.map((item) => item.title)).toEqual(["Build the draft board.", "Verify the draft board."]);
    expect(splitAgain.map((item) => item.id)).toEqual(children.map((item) => item.id));
    expect(children).toEqual([
      expect.objectContaining({
        boardId: "board-1",
        status: "draft",
        candidateStatus: "ready_to_create",
        sourceKind: "planner_plan",
        sourceId: "artifact-1#split:1",
        sourceThreadId: "thread-1",
        sourceMessageId: "message-1",
        labels: ["plan", "split"],
        orchestrationTaskId: undefined,
        acceptanceCriteria: ["Build the draft board."],
      }),
      expect.objectContaining({
        boardId: "board-1",
        status: "draft",
        candidateStatus: "ready_to_create",
        sourceKind: "planner_plan",
        sourceId: "artifact-1#split:2",
        sourceThreadId: "thread-1",
        sourceMessageId: "message-1",
        labels: ["plan", "split"],
        orchestrationTaskId: undefined,
        acceptanceCriteria: ["Verify the draft board."],
      }),
    ]);
    expect(children[0].description).toContain("Split from: Parent candidate");
    expect(readCard(db, "split-card")).toMatchObject({ candidate_status: "duplicate" });
    expect(listTasks(db)).toEqual([]);
    expect(events.filter((event) => event.kind === "card_split")).toEqual([
      expect.objectContaining({
        title: "Candidate split",
        entityId: "split-card",
        metadata: expect.objectContaining({ parentCardId: "split-card", childCardIds: children.map((item) => item.id) }),
      }),
    ]);
  });

  it("owns proof-review follow-up card creation", () => {
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

  it("owns explicit run follow-up candidate creation", () => {
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

  it("owns pulled handoff follow-up materialization", () => {
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

  it("owns proof-review currentness checks and application persistence", () => {
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
        satisfied: ["Implementation evidence recorded.", "Acceptance criteria discussed in proof.", "Unit proof recorded.", "Manual review proof recorded."],
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

  it("owns PM proof decision persistence", () => {
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

  it("owns split decision persistence", () => {
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
      metadata: expect.objectContaining({ action: "accept_done_via_split", reason: "Children are terminal.", splitOutcomeStatus: "done_via_split" }),
    });
    expect(syncedBoards).toEqual(["board-1", "board-1", "board-1"]);
    expect(syncedCards).toBe(3);
  });

  it("owns ready task creation and the synthesis planning snapshot gate", () => {
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

  it("owns manual card, draft edit, Pi update, and run feedback mutations", () => {
    const created = repository.createManualCard({
      boardId: "board-1",
      title: "  Draft card  ",
      description: "  Initial draft.  ",
    });

    expect(created).toMatchObject({
      boardId: "board-1",
      title: "Draft card",
      status: "draft",
      candidateStatus: "needs_clarification",
      labels: ["manual"],
    });
    expect(events[0]).toMatchObject({
      kind: "manual_card_created",
      entityId: created.id,
    });

    const updated = repository.updateCard({
      cardId: created.id,
      title: "Ready draft",
      labels: ["manual", "ui"],
      acceptanceCriteria: ["Visible UI works."],
      testPlan: { unit: ["state model"], integration: [], visual: [], manual: ["inspect UI"] },
    });

    expect(updated).toMatchObject({
      title: "Ready draft",
      candidateStatus: "ready_to_create",
      labels: ["manual", "ui"],
      userTouchedFields: expect.arrayContaining(["title", "labels", "acceptanceCriteria", "testPlan", "candidateStatus"]),
    });
    expect(events.some((event) => event.kind === "card_updated" && event.entityId === created.id)).toBe(true);
    expect(syncedBoards).toContain("board-1");
    expect(syncedCards).toBeGreaterThan(0);

    const needsClarification = repository.updateCardCandidateStatus(updated.id, "needs_clarification", {
      actor: "system",
      reason: "planning consolidation",
    });
    expect(needsClarification.candidateStatus).toBe("needs_clarification");
    expect(events.at(-1)).toMatchObject({
      kind: "candidate_status_changed",
      metadata: expect.objectContaining({ actor: "system", reason: "planning consolidation" }),
    });

    const pendingUpdate: ProjectBoardCardPendingPiUpdate = {
      sourceId: "decision:test",
      createdAt: "2026-06-16T00:00:00.000Z",
      changedFields: ["description", "labels"],
      description: "Pi-refined description.",
      labels: ["manual", "refined"],
    };
    db.prepare("UPDATE project_board_cards SET pending_pi_update_json = ? WHERE id = ?").run(JSON.stringify(pendingUpdate), updated.id);

    const piApplied = repository.resolvePiUpdate({ cardId: updated.id, action: "apply" });
    expect(piApplied).toMatchObject({
      description: "Pi-refined description.",
      labels: ["manual", "refined"],
      pendingPiUpdate: undefined,
    });
    expect(events.at(-1)).toMatchObject({
      title: "Pi update applied",
      metadata: expect.objectContaining({ sourceId: "decision:test", action: "apply" }),
    });

    db.prepare("UPDATE project_board_cards SET status = 'ready', orchestration_task_id = ?, updated_at = ? WHERE id = ?")
      .run("task-1", "2026-06-16T00:01:00.000Z", updated.id);
    const withFeedback = repository.addRunFeedback({
      cardId: updated.id,
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
    expect(taskDescriptionUpdates).toEqual([{ taskId: "task-1", description: "Task description for Ready draft" }]);
    expect(events.at(-1)).toMatchObject({
      title: "Run feedback added",
      metadata: expect.objectContaining({ taskId: "task-1" }),
    });
  });

  it("owns decision-impact feedback for draft answers and linked ticketized card run feedback", () => {
    const question = "What greeting should the app render?";
    const answer = "Hello from Ambient.";
    const source = repository.createManualCard({
      boardId: "board-1",
      title: "Choose greeting copy",
      description: "Decide the greeting copy before final implementation.",
    });
    repository.updateCard({
      cardId: source.id,
      acceptanceCriteria: ["Greeting copy is selected."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Confirm PM answer is recorded."] },
      clarificationQuestions: [question],
    });
    const linked = repository.createManualCard({
      boardId: "board-1",
      title: "Render greeting",
      description: "Render the greeting.",
    });
    const linkedReady = repository.updateCard({
      cardId: linked.id,
      description: `Render the greeting in the HTML app.\n${question}`,
      acceptanceCriteria: ["The app renders the PM-approved greeting."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Open the app and confirm the greeting text."] },
      candidateStatus: "ready_to_create",
    });
    const approved = repository.approveProjectBoardCard(linkedReady.id);

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
    const source = repository.createManualCard({
      boardId: "board-1",
      title: "Choose keyboard policy",
      description: "Resolve the keyboard policy.",
    });
    repository.updateCard({
      cardId: source.id,
      acceptanceCriteria: ["The keyboard policy is recorded."],
      testPlan: { unit: ["Decision is captured."], integration: [], visual: [], manual: [] },
      clarificationQuestions: [question],
    });
    const affected = repository.createManualCard({
      boardId: "board-1",
      title: "Implement keyboard input",
      description: `Implement keyboard input.\n${question}`,
    });
    repository.updateCard({
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
  const rows = db
    .prepare("SELECT * FROM orchestration_tasks ORDER BY created_at ASC, rowid ASC")
    .all() as OrchestrationTaskRow[];
  return rows.map((row) => mapOrchestrationTaskRow(row));
}

function listRuns(db: Database.Database, limit = 50): OrchestrationRun[] {
  const rows = db
    .prepare("SELECT * FROM orchestration_runs ORDER BY started_at DESC LIMIT ?")
    .all(limit) as OrchestrationRunRow[];
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
    .prepare("SELECT event_kind, title, entity_kind, entity_id, metadata_json FROM project_board_events WHERE board_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(boardId) as Array<{ event_kind: string; title: string; entity_kind: string | null; entity_id: string | null; metadata_json: string }>;
}

function createTask(db: Database.Database, input: CreateOrchestrationTaskInput): OrchestrationTask {
  const taskId = `task-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
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
