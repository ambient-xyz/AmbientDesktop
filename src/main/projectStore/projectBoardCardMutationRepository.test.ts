import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardCardPendingPiUpdate, ProjectBoardPlanningSnapshot } from "../../shared/projectBoardTypes";
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
