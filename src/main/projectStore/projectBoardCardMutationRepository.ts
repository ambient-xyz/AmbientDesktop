import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { projectBoardOpenClarificationQuestions } from "../../shared/projectBoardClarificationDecisions";
import { projectBoardDecisionImpactPreview, type ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import type {
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardRunFeedback,
  ProjectBoardCardSplitOutcome,
  ProjectBoardCardSplitOutcomeStatus,
  ProjectBoardCardStatus,
  ProjectBoardCardTestPlan,
  ProjectBoardCardTouchedField,
  ProjectBoardEvent,
  ProjectBoardPlanningSnapshot,
  ProjectBoardProofDecisionAction,
  RefreshProjectBoardDecisionDraftsInput,
  ProjectBoardSplitDecisionAction,
  ProjectBoardSynthesisRun,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { CreateOrchestrationTaskInput, OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { stableBoardArtifactId } from "../project-board/projectBoardArtifacts";
import type { ProjectBoardRunArtifactProjection } from "../project-board/projectBoardArtifactImport";
import {
  mapProjectBoardCardRow,
  normalizeCardTextList,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardUiMockRole,
  normalizeRunFollowUps,
  parseProjectBoardStringList,
  normalizeTaskLabels,
  normalizeTaskReferences,
  objectiveProvenanceJson,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardCardBlockedByOpenUxMockGate,
  projectBoardCardIsUxMockGate,
  projectBoardCardProofCount,
  projectBoardStatusForTask,
  projectBoardChangedClarificationAnswer,
  projectBoardClarificationDecisionImpactEventSummary,
  projectBoardClosedParentForRunFollowUp,
  projectBoardDescriptionWithClarificationAnswer,
  projectBoardDecisionImpactEventMetadata,
  projectBoardDecisionImpactFeedbackText,
  projectBoardExecutionArtifactCardId,
  projectBoardHasDecisionImpactFeedback,
  projectBoardMissingProofItems,
  projectBoardProofEvidenceText,
  projectBoardProofFollowUpOptionsFromSuggestion,
  projectBoardProofOfWorkForRun,
  projectBoardProofRevisionRunFeedback,
  projectBoardProofReviewApplicationBlocker,
  projectBoardProofReviewClosureModelForApplication,
  projectBoardQuestionMatchesAnyVariant,
  projectBoardRuntimeBudgetCompletedCriteria,
  projectBoardRuntimeBudgetExceeded,
  projectBoardRuntimeBudgetFollowUpClarificationQuestion,
  projectBoardRuntimeBudgetFollowUpDescription,
  projectBoardRuntimeBudgetHasMeaningfulProgress,
  projectBoardRuntimeBudgetRemainingCriteria,
  projectBoardRuntimeBudgetReviewForApplication,
  projectBoardRuntimeBudgetSplitOutcomeForReview,
  projectBoardRunHasReviewableProof,
  splitProjectBoardCardDescription,
  resolveProjectBoardTaskBlockers,
  projectBoardTaskStateForProofReview,
  projectBoardUxMockRejectionRunFeedback,
  type ProjectBoardCardStoreRow,
  type ProjectBoardProofReviewDraft,
  type ProjectBoardRunFollowUpInsertOptions,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";
import type { OrchestrationTaskRow } from "./orchestrationMappers";

export type ProjectBoardCardMutationEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardCardMutationRepositoryDeps {
  listOrchestrationTasks(): OrchestrationTask[];
  getActiveProjectBoard(): ProjectBoardSummary | undefined;
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  getRunningProjectBoardSynthesisRun(boardId: string): ProjectBoardSynthesisRun | undefined;
  listProjectBoardCards(boardId: string): ProjectBoardCard[];
  latestStableProjectBoardPlanningSnapshot(boardId: string): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined;
  projectBoardRequiresProofSpec(boardId: string): boolean;
  assertProjectBoardCardProofReady(card: ProjectBoardCard): void;
  assertProjectBoardCardClarificationsResolved(card: ProjectBoardCard): void;
  assertProjectBoardCardClaimAllowsLocalTicketization(card: ProjectBoardCard): void;
  assertProjectBoardRunFollowUpStillActionable(card: ProjectBoardCard): void;
  appendProjectBoardEvent(input: ProjectBoardCardMutationEventInput): void;
  syncProjectBoardTaskBlockers(boardId: string): void;
  syncProjectBoardCardsForLinkedTasks(): void;
  listOrchestrationRuns(limit?: number): OrchestrationRun[];
  createOrchestrationTask(input: CreateOrchestrationTaskInput): OrchestrationTask;
  getOrchestrationTask(taskId: string): OrchestrationTask;
  getOrchestrationRun(runId: string): OrchestrationRun;
  mapOrchestrationTask(row: OrchestrationTaskRow): OrchestrationTask;
  updateOrchestrationTaskDescription(taskId: string, description: string): void;
  projectBoardCardTaskDescription(card: ProjectBoardCard): string;
  assertProjectBoardUxMockGateOpen(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): void;
}

export interface UpdateProjectBoardCardMutationInput {
  cardId: string;
  title?: string;
  description?: string;
  candidateStatus?: ProjectBoardCardCandidateStatus;
  priority?: number | null;
  phase?: string | null;
  labels?: string[];
  blockedBy?: string[];
  acceptanceCriteria?: string[];
  testPlan?: ProjectBoardCardTestPlan;
  sourceRefs?: string[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
}

export class ProjectStoreProjectBoardCardMutationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardMutationRepositoryDeps,
  ) {}

  createManualCard(input: { boardId: string; title?: string; description?: string }): ProjectBoardCard {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot accept new cards.");
    const now = new Date().toISOString();
    const id = randomUUID();
    const title = input.title?.trim() || "New draft card";
    const description =
      input.description?.trim() ||
      "Manual draft card. Fill in scope, dependencies, acceptance criteria, and proof before ticketization.";
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO project_board_cards
          (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
           acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          board.id,
          title.slice(0, 180),
          description.slice(0, 4000),
          "draft",
          "needs_clarification",
          null,
          null,
          JSON.stringify(["manual"]),
          JSON.stringify([]),
          JSON.stringify(["Define the intended outcome before ticketization."]),
          JSON.stringify({ unit: [], integration: [], visual: [], manual: [] }),
          "manual",
          `manual:${id}`,
          null,
          null,
          null,
          now,
          now,
        );
      this.touchBoard(board.id, now);
      this.deps.appendProjectBoardEvent({
        boardId: board.id,
        kind: "manual_card_created",
        title: "Manual draft card created",
        summary: title.slice(0, 180),
        entityKind: "project_board_card",
        entityId: id,
        metadata: { cardId: id, sourceKind: "manual" },
        createdAt: now,
      });
    });
    transaction();
    return this.getProjectBoardCard(id);
  }

  attachLocalTaskToProjectBoard(input: { taskId: string; mode: "attach" | "evidence" }): ProjectBoardCard {
    const board = this.deps.getActiveProjectBoard();
    if (!board) throw new Error("Build a project board before attaching Local Tasks.");
    const task = this.deps.getOrchestrationTask(input.taskId);
    const existing = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND (
             orchestration_task_id = ?
             OR (source_kind = 'local_task_import' AND source_id = ?)
           )
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(board.id, task.id, task.id) as ProjectBoardCardStoreRow | undefined;
    if (existing) return mapProjectBoardCardRow(existing, this.deps.listOrchestrationTasks());

    const now = new Date().toISOString();
    const id = randomUUID();
    const attachMode = input.mode === "attach";
    const allTasks = this.deps.listOrchestrationTasks();
    const status: ProjectBoardCardStatus = attachMode ? projectBoardStatusForTask(task, allTasks) : "draft";
    const candidateStatus: ProjectBoardCardCandidateStatus = attachMode ? "ready_to_create" : "evidence";
    const description =
      task.description?.trim() ||
      (attachMode ? "Existing Local Task attached to this project board." : "Existing Local Task imported as completed board evidence.");
    const acceptanceCriteria = attachMode
      ? [`Complete Local Task ${task.identifier}: ${task.title}`]
      : [`Record Local Task ${task.identifier} as evidence for already-scoped work.`];
    const testPlan: ProjectBoardCardTestPlan = attachMode
      ? { unit: [], integration: [], visual: [], manual: ["Review the existing Local Task proof before closing the board card."] }
      : { unit: [], integration: [], visual: [], manual: ["Review imported Local Task history as completed evidence."] };
    this.db
      .prepare(
        `INSERT INTO project_board_cards
        (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
         acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        board.id,
        task.title,
        description,
        status,
        candidateStatus,
        task.priority ?? null,
        null,
        JSON.stringify(normalizeTaskLabels(["local-task", ...task.labels])),
        JSON.stringify(task.blockedBy),
        JSON.stringify(acceptanceCriteria),
        JSON.stringify(testPlan),
        "local_task_import",
        task.id,
        null,
        null,
        attachMode ? task.id : null,
        now,
        now,
      );
    this.touchBoard(board.id, now);
    this.deps.appendProjectBoardEvent({
      boardId: board.id,
      kind: attachMode ? "local_task_attached" : "local_task_imported_as_evidence",
      title: attachMode ? "Local Task attached" : "Local Task imported as evidence",
      summary: `${task.identifier}: ${task.title}`,
      entityKind: "orchestration_task",
      entityId: task.id,
      metadata: { taskId: task.id, identifier: task.identifier, mode: input.mode, cardId: id },
      createdAt: now,
    });
    this.deps.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(id);
  }

  splitProjectBoardCard(cardId: string): ProjectBoardCard[] {
    const current = this.getProjectBoardCard(cardId);
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Only unticketized draft board candidates can be split.");
    }
    const criteria = normalizeCardTextList(current.acceptanceCriteria, 12);
    if (criteria.length < 2) throw new Error("A candidate needs at least two acceptance criteria before it can be split.");
    const existing = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ? AND source_kind = ? AND source_id LIKE ?
         ORDER BY created_at ASC`,
      )
      .all(current.boardId, current.sourceKind, `${current.sourceId}#split:%`) as ProjectBoardCardStoreRow[];
    if (existing.length > 0) return existing.map((row) => mapProjectBoardCardRow(row, this.deps.listOrchestrationTasks()));

    const now = new Date().toISOString();
    const createdIds: string[] = [];
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE project_board_cards SET candidate_status = 'duplicate', updated_at = ? WHERE id = ?").run(now, current.id);
      const insert = this.db.prepare(
        `INSERT INTO project_board_cards
          (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
           acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id,
           source_message_id, orchestration_task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      criteria.forEach((criterion, index) => {
        const id = randomUUID();
        createdIds.push(id);
        const clarificationQuestions = normalizeProjectBoardClarificationQuestions(current.clarificationQuestions ?? [], 8);
        const clarificationDecisions = normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
          clarificationQuestions,
          clarificationSuggestions: current.clarificationSuggestions,
          clarificationAnswers: current.clarificationAnswers,
          createdAt: now,
          updatedAt: now,
        });
        insert.run(
          id,
          current.boardId,
          criterion.slice(0, 180),
          splitProjectBoardCardDescription(current, criterion),
          "draft",
          current.candidateStatus === "ready_to_create" ? "ready_to_create" : "needs_clarification",
          current.priority ?? null,
          current.phase ?? null,
          JSON.stringify(normalizeTaskLabels([...current.labels, "split"])),
          JSON.stringify(current.blockedBy),
          JSON.stringify([criterion]),
          JSON.stringify(current.testPlan),
          JSON.stringify(normalizeCardTextList(current.sourceRefs ?? [], 20)),
          JSON.stringify(clarificationQuestions),
          JSON.stringify(clarificationDecisions),
          current.sourceKind,
          `${current.sourceId}#split:${index + 1}`,
          current.sourceThreadId ?? null,
          current.sourceMessageId ?? null,
          null,
          now,
          now,
        );
      });
      this.touchBoard(current.boardId, now);
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_split",
        title: "Candidate split",
        summary: `${current.title} was split into ${createdIds.length} draft cards.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: { parentCardId: current.id, childCardIds: createdIds },
        createdAt: now,
      });
    });
    transaction();
    return createdIds.map((id) => this.getProjectBoardCard(id));
  }

  createProjectBoardProofFollowUpForRun(
    run: OrchestrationRun,
    parent: ProjectBoardCardStoreRow,
    review: ProjectBoardProofReviewDraft,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    const now = new Date().toISOString();
    const sourceId = `${run.id}#${options.sourceIdSuffix ?? "proof-review"}`;
    const existing = this.db
      .prepare("SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?")
      .get(parent.board_id, sourceId) as { id: string } | undefined;
    if (existing) return [existing.id];
    const cardId = randomUUID();
    const labels = [...new Set(["proof-follow-up", ...(options.labels ?? []), ...parseProjectBoardStringList(parent.labels_json)])];
    const title = options.title ?? `Complete proof for ${parent.title}`.slice(0, 180);
    const description = options.description ?? review.missing.join("\n").slice(0, 4000);
    const acceptanceCriteria = options.acceptanceCriteria?.length
      ? normalizeCardTextList(options.acceptanceCriteria, 30)
      : review.missing.length ? review.missing : ["Resolve missing proof before closing the parent card."];
    const clarificationQuestions = options.clarificationQuestions?.length
      ? normalizeProjectBoardClarificationQuestions(options.clarificationQuestions, 8)
      : [];
    const testPlan =
      options.testPlan ?? { unit: [], integration: [], visual: [], manual: ["Review the parent run proof packet and add the missing evidence."] };
    this.db
      .prepare(
        `INSERT INTO project_board_cards
         (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
          acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id, source_message_id,
          orchestration_task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cardId,
        parent.board_id,
        title,
        description,
        "draft",
        "needs_clarification",
        parent.priority === null ? null : parent.priority + 1,
        parent.phase,
        JSON.stringify(labels),
        JSON.stringify(options.blockByParent === false ? [] : [parent.id]),
        JSON.stringify(acceptanceCriteria),
        JSON.stringify(testPlan),
        JSON.stringify(clarificationQuestions),
        JSON.stringify(normalizeProjectBoardClarificationDecisions(undefined, { clarificationQuestions, createdAt: now, updatedAt: now })),
        "run_follow_up",
        sourceId,
        run.threadId ?? parent.source_thread_id,
        null,
        null,
        now,
        now,
      );
    this.touchBoard(parent.board_id, now);
    this.deps.appendProjectBoardEvent({
      boardId: parent.board_id,
      kind: "run_follow_up_created",
      title: "Proof follow-up proposed",
      summary: "Missing proof created a follow-up card in the draft inbox.",
      entityKind: "orchestration_run",
      entityId: run.id,
      metadata: {
        runId: run.id,
        parentCardId: parent.id,
        followUpCardIds: [cardId],
        proofReviewStatus: review.status,
        derivedFromParent: options.blockByParent === false,
        labels: options.labels ?? [],
        piSuggestedFollowUp: Boolean(options.labels?.includes("pi-suggested-follow-up")),
        suggestedTitle: options.title,
      },
      createdAt: now,
    });
    return [cardId];
  }

  createProjectBoardFollowUpCandidatesForRun(
    run: OrchestrationRun,
    parentRow?: ProjectBoardCardStoreRow,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    const followUps = normalizeRunFollowUps(run.proofOfWork?.followUps);
    if (followUps.length === 0) return [];
    const parent =
      parentRow ??
      (this.db
        .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
        .get(run.taskId) as ProjectBoardCardStoreRow | undefined);
    if (!parent) return [];

    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO project_board_cards
       (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
        acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id, source_message_id,
        orchestration_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const existing = this.db.prepare("SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?");
    const labels = [...new Set(["run-follow-up", ...(options.labels ?? []), ...parseProjectBoardStringList(parent.labels_json)])];
    const blockByParent = options.blockByParent !== false;
    const clarificationQuestions = options.clarificationQuestions?.length
      ? normalizeProjectBoardClarificationQuestions(options.clarificationQuestions, 8)
      : [];
    const clarificationDecisions = normalizeProjectBoardClarificationDecisions(undefined, {
      clarificationQuestions,
      createdAt: now,
      updatedAt: now,
    });
    let insertedIds: string[] = [];
    const transaction = this.db.transaction(() => {
      insertedIds = [];
      followUps.forEach((followUp, index) => {
        const sourceId = `${run.id}#follow-up:${index + 1}`;
        if (existing.get(parent.board_id, sourceId)) return;
        const cardId = randomUUID();
        insert.run(
          cardId,
          parent.board_id,
          followUp.title,
          followUp.description,
          "draft",
          "needs_clarification",
          parent.priority === null ? null : parent.priority + index + 1,
          parent.phase,
          JSON.stringify(labels),
          JSON.stringify(blockByParent ? [parent.id] : []),
          JSON.stringify(followUp.acceptanceCriteria),
          JSON.stringify(followUp.testPlan),
          JSON.stringify(clarificationQuestions),
          JSON.stringify(clarificationDecisions),
          "run_follow_up",
          sourceId,
          run.threadId ?? parent.source_thread_id,
          null,
          null,
          now,
          now,
        );
        insertedIds.push(cardId);
      });
      if (insertedIds.length > 0) {
        this.touchBoard(parent.board_id, now);
        this.deps.appendProjectBoardEvent({
          boardId: parent.board_id,
          kind: "run_follow_up_created",
          title: "Run follow-ups proposed",
          summary: `${insertedIds.length} follow-up card${insertedIds.length === 1 ? "" : "s"} entered the draft inbox.`,
          entityKind: "orchestration_run",
          entityId: run.id,
          metadata: {
            runId: run.id,
            parentCardId: parent.id,
            followUpCardIds: insertedIds,
            derivedFromParent: !blockByParent,
            labels: options.labels ?? [],
          },
          createdAt: now,
        });
      }
    });
    transaction();
    return insertedIds;
  }

  materializeProjectBoardPulledHandoffFollowUps(boardId: string, runArtifacts: ProjectBoardRunArtifactProjection[]): string[] {
    const artifactsWithFollowUps = runArtifacts.filter((artifact) => artifact.handoff?.followUps.length);
    if (artifactsWithFollowUps.length === 0) return [];

    const parentById = new Map(
      (this.db.prepare("SELECT * FROM project_board_cards WHERE board_id = ? AND status != 'archived'").all(boardId) as ProjectBoardCardStoreRow[]).map(
        (row) => [row.id, row],
      ),
    );
    const existing = this.db.prepare("SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?");
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO project_board_cards
       (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
        acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEvent = this.db.prepare(
      `INSERT OR IGNORE INTO project_board_events
       (id, board_id, event_kind, title, summary, entity_kind, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertedIds: string[] = [];
    let latestCreatedAt: string | undefined;

    for (const runArtifact of artifactsWithFollowUps) {
      const handoff = runArtifact.handoff;
      if (!handoff) continue;
      const runId = runArtifact.manifest?.runId ?? runArtifact.proof?.runId ?? handoff.runId ?? runArtifact.runPathId;
      const parentCardId = projectBoardExecutionArtifactCardId(runArtifact.manifest, runArtifact.proof, handoff);
      if (!parentCardId) continue;
      const parent = parentById.get(parentCardId);
      if (!parent) continue;

      const parentLabels = parseProjectBoardStringList(parent.labels_json);
      const labels = [...new Set(["run-follow-up", "pulled-handoff", ...parentLabels])];
      const runInsertedIds: string[] = [];
      handoff.followUps.forEach((followUp, index) => {
        const sourceId = `${runId}#follow-up:${index + 1}`;
        const existingCard = existing.get(boardId, sourceId) as { id: string } | undefined;
        if (existingCard) return;
        const cardId = stableBoardArtifactId("card", [boardId, "run_follow_up", sourceId]);
        const blockers = [...new Set([parent.id, ...followUp.blockedBy.filter((ref) => ref !== parent.id)])];
        const reason = followUp.reason.trim();
        const description = reason
          ? `Pulled handoff follow-up from ${parent.title}.\n\n${reason}`.slice(0, 4000)
          : `Pulled handoff follow-up from ${parent.title}.`;
        const acceptanceCriteria = reason
          ? [`Resolve follow-up: ${followUp.title}`, `Address handoff reason: ${reason}`]
          : [`Resolve follow-up: ${followUp.title}`];
        const testPlan: ProjectBoardCardTestPlan = {
          unit: [],
          integration: [],
          visual: [],
          manual: ["Review the pulled run handoff, confirm the follow-up scope, and attach proof before closing."],
        };
        const createdAt = handoff.createdAt;
        insert.run(
          cardId,
          boardId,
          followUp.title,
          description,
          "draft",
          "needs_clarification",
          parent.priority === null ? null : parent.priority + index + 1,
          parent.phase,
          JSON.stringify(labels),
          JSON.stringify(blockers),
          JSON.stringify(acceptanceCriteria),
          JSON.stringify(testPlan),
          "run_follow_up",
          sourceId,
          parent.source_thread_id,
          null,
          null,
          createdAt,
          createdAt,
        );
        insertedIds.push(cardId);
        runInsertedIds.push(cardId);
        latestCreatedAt = !latestCreatedAt || createdAt.localeCompare(latestCreatedAt) > 0 ? createdAt : latestCreatedAt;
      });

      if (runInsertedIds.length > 0) {
        insertEvent.run(
          stableBoardArtifactId("event", [boardId, "run_follow_up_created", runId]),
          boardId,
          "run_follow_up_created",
          "Pulled handoff follow-ups proposed",
          `${runInsertedIds.length} pulled handoff follow-up card${runInsertedIds.length === 1 ? "" : "s"} entered the draft inbox.`,
          "run",
          runId,
          JSON.stringify({ runId, parentCardId: parent.id, followUpCardIds: runInsertedIds, source: "pulled_handoff" }),
          handoff.createdAt,
        );
      }
    }

    if (insertedIds.length > 0) this.touchBoard(boardId, latestCreatedAt ?? new Date().toISOString());
    return insertedIds;
  }

  isProjectBoardProofReviewRunCurrent(runId: string, requireCurrentReview = false): boolean {
    const run = this.deps.getOrchestrationRun(runId);
    const parent = this.db
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(run.taskId) as ProjectBoardCardStoreRow | undefined;
    if (!parent) return false;
    return !this.projectBoardProofReviewApplicationBlocker(parent, run, requireCurrentReview);
  }

  applyProjectBoardCardProofReview(input: {
    runId: string;
    review: ProjectBoardCardProofReview;
    requireCurrentReview?: boolean;
    allowStaleRun?: boolean;
  }): ProjectBoardCard | undefined {
    const run = this.deps.getOrchestrationRun(input.runId);
    const parent = this.db
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(run.taskId) as ProjectBoardCardStoreRow | undefined;
    if (!parent) return undefined;
    const parentCard = mapProjectBoardCardRow(parent, this.deps.listOrchestrationTasks());
    const staleReason = input.allowStaleRun ? undefined : this.projectBoardProofReviewApplicationBlocker(parent, run, input.requireCurrentReview === true);
    if (staleReason) {
      this.deps.appendProjectBoardEvent({
        boardId: parent.board_id,
        kind: "card_proof_review_ignored",
        title: "Stale proof review ignored",
        summary: `${parent.title} received a proof judgment for an old or superseded run; the current card state was left unchanged.`,
        entityKind: "project_board_card",
        entityId: parent.id,
        metadata: {
          cardId: parent.id,
          runId: run.id,
          status: input.review.status,
          recommendedAction: input.review.recommendedAction,
          reviewer: input.review.reviewer ?? "deterministic",
          staleReason,
        },
        createdAt: new Date().toISOString(),
      });
      return this.getProjectBoardCard(parent.id);
    }
    const proof = projectBoardProofOfWorkForRun(run.proofOfWork, run, parentCard);
    const proofText = projectBoardProofEvidenceText(run.error, proof);
    const inputReview = projectBoardProofReviewClosureModelForApplication(
      projectBoardRuntimeBudgetReviewForApplication(input.review, proof, proofText, run.workspacePath),
      projectBoardMissingProofItems(parentCard, proofText, proof, run.workspacePath),
    );
    const runtimeBudgetSplit =
      projectBoardRuntimeBudgetExceeded(proof) &&
      inputReview.status === "needs_follow_up" &&
      projectBoardRuntimeBudgetHasMeaningfulProgress(proof, proofText, inputReview.satisfied, run.workspacePath);
    const runtimeBudgetRemaining = runtimeBudgetSplit
      ? projectBoardRuntimeBudgetRemainingCriteria(parentCard, proof, input.review)
      : [];
    const runtimeBudgetCompleted = runtimeBudgetSplit
      ? projectBoardRuntimeBudgetCompletedCriteria(proof, input.review.satisfied, run.workspacePath)
      : [];
    const hasExplicitFollowUps = normalizeRunFollowUps(run.proofOfWork?.followUps).length > 0;
    const runtimeBudgetFollowUpOptions: ProjectBoardRunFollowUpInsertOptions | undefined = runtimeBudgetSplit
      ? {
          blockByParent: false,
          labels: ["runtime-split-follow-up", "derived-from-parent"],
          clarificationQuestions: [projectBoardRuntimeBudgetFollowUpClarificationQuestion(parent.title)],
        }
      : undefined;
    const proofFollowUpSuggestionOptions = runtimeBudgetSplit
      ? undefined
      : projectBoardProofFollowUpOptionsFromSuggestion(inputReview.followUpSuggestion);
    const explicitFollowUpIds = this.createProjectBoardFollowUpCandidatesForRun(run, parent, runtimeBudgetFollowUpOptions);
    const proofFollowUpIds = inputReview.status === "needs_follow_up" && !hasExplicitFollowUps
      ? this.createProjectBoardProofFollowUpForRun(
          run,
          parent,
          {
            status: inputReview.status,
            summary: inputReview.summary,
            satisfied: inputReview.satisfied,
            missing: inputReview.missing,
          },
          runtimeBudgetSplit
            ? {
                blockByParent: false,
                labels: ["runtime-split-follow-up", "derived-from-parent"],
                title: `Continue ${parent.title}`.slice(0, 180),
                description: projectBoardRuntimeBudgetFollowUpDescription(parent.title, input.review, runtimeBudgetCompleted, runtimeBudgetRemaining),
                acceptanceCriteria: runtimeBudgetRemaining,
                clarificationQuestions: [projectBoardRuntimeBudgetFollowUpClarificationQuestion(parent.title)],
                sourceIdSuffix: "runtime-split",
              }
            : proofFollowUpSuggestionOptions,
        )
      : [];
    const now = new Date().toISOString();
    const review: ProjectBoardCardProofReview = {
      ...inputReview,
      followUpCardIds: [...new Set([...inputReview.followUpCardIds, ...explicitFollowUpIds, ...proofFollowUpIds])],
      runId: run.id,
      reviewedAt: now,
    };
    const splitOutcome = runtimeBudgetSplit
      ? projectBoardRuntimeBudgetSplitOutcomeForReview(parentCard, run, review, review.followUpCardIds, now)
      : undefined;
    const nextCardStatus: ProjectBoardCardStatus =
      review.status === "done" ? "done" : review.status === "ready_for_review" ? "review" : "blocked";
    this.db
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = ?, split_outcome_json = ?, updated_at = ? WHERE id = ?")
      .run(nextCardStatus, JSON.stringify(review), splitOutcome ? JSON.stringify(splitOutcome) : parent.split_outcome_json, now, parent.id);
    this.db
      .prepare("UPDATE orchestration_tasks SET state = ?, updated_at = ? WHERE id = ?")
      .run(projectBoardTaskStateForProofReview(review.status), now, run.taskId);
    this.touchBoard(parent.board_id, now);
    this.deps.appendProjectBoardEvent({
      boardId: parent.board_id,
      kind: "card_proof_reviewed",
      title: review.reviewer === "ambient_pi" ? "Card proof reviewed by Pi" : "Card proof reviewed",
      summary: review.summary,
      entityKind: "project_board_card",
      entityId: parent.id,
      metadata: {
        cardId: parent.id,
        runId: run.id,
        status: review.status,
        missing: review.missing,
        satisfied: review.satisfied,
        followUpCardIds: review.followUpCardIds,
        reviewer: review.reviewer ?? "deterministic",
        model: review.model,
        confidence: review.confidence,
        evidenceQuality: review.evidenceQuality,
        recommendedAction: review.recommendedAction,
        deterministicStatus: review.deterministicStatus,
        followUpSuggestionUsed: proofFollowUpIds.length > 0 && Boolean(proofFollowUpSuggestionOptions),
        followUpSuggestionTitle: proofFollowUpSuggestionOptions?.title,
        splitOutcome: splitOutcome
          ? {
              source: splitOutcome.source,
              status: splitOutcome.status,
              childCardIds: splitOutcome.childCardIds,
              completedCriteria: splitOutcome.completedCriteria.length,
              remainingCriteria: splitOutcome.remainingCriteria.length,
            }
          : undefined,
      },
      createdAt: now,
    });
    if (splitOutcome) {
      this.deps.appendProjectBoardEvent({
        boardId: parent.board_id,
        kind: "card_split",
        title: "Runtime-budget split proposed",
        summary: `${parent.title} timed out after meaningful progress; ${splitOutcome.childCardIds.length} follow-up card${splitOutcome.childCardIds.length === 1 ? "" : "s"} now represent the remaining scope.`,
        entityKind: "project_board_card",
        entityId: parent.id,
        metadata: {
          cardId: parent.id,
          runId: run.id,
          reason: splitOutcome.reason,
          completedCriteria: splitOutcome.completedCriteria,
          remainingCriteria: splitOutcome.remainingCriteria,
          childCardIds: splitOutcome.childCardIds,
        },
        createdAt: now,
      });
    }
    return this.getProjectBoardCard(parent.id);
  }

  resolveProjectBoardProofDecision(input: { cardId: string; action: ProjectBoardProofDecisionAction; reason?: string }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (!current.orchestrationTaskId) {
      throw new Error("Proof decisions require a ticketized project board card.");
    }
    const task = this.deps.getOrchestrationTask(current.orchestrationTaskId);
    const taskRuns = this.deps.listOrchestrationRuns(200).filter((run) => run.taskId === task.id);
    const activeRun = taskRuns.find((run) => ["claimed", "prepared", "preparing", "running", "retry_queued"].includes(run.status));
    if (activeRun) {
      throw new Error("Wait for the active card run to finish before resolving proof.");
    }
    const latestRun = taskRuns[0];
    const previousReview = current.proofReview;
    const alreadyDone = current.status === "done" || task.state.trim().toLowerCase().replace(/\s+/g, "_") === "done";
    if (alreadyDone && input.action === "retry") {
      throw new Error("Done project board cards cannot be sent back to Ready.");
    }
    const reviewableFinishedRun = Boolean(latestRun && projectBoardRunHasReviewableProof(latestRun, current));
    if (!previousReview && current.status !== "done" && !reviewableFinishedRun) {
      throw new Error("Run the card until a proof packet or PM proof review is ready before resolving proof.");
    }

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000);
    const previousSummary = previousReview?.summary ? ` Previous review: ${previousReview.summary}` : "";
    const proofRevisionFeedback = input.action === "retry" ? projectBoardProofRevisionRunFeedback(previousReview, reason, now) : undefined;
    const uxMockRejectionFeedback =
      input.action === "mark_blocked" && projectBoardCardIsUxMockGate(current)
        ? projectBoardUxMockRejectionRunFeedback(previousReview, reason, now)
        : undefined;
    const decisionFeedback = [proofRevisionFeedback, uxMockRejectionFeedback].filter(
      (feedback): feedback is ProjectBoardCardRunFeedback => Boolean(feedback),
    );
    const runFeedback =
      decisionFeedback.length > 0
        ? normalizeProjectBoardCardRunFeedback([...(current.runFeedback ?? []), ...decisionFeedback])
        : normalizeProjectBoardCardRunFeedback(current.runFeedback ?? []);
    const makeReview = (
      status: ProjectBoardCardProofReviewStatus,
      summary: string,
      recommendedAction: ProjectBoardCardProofRecommendedAction,
    ): ProjectBoardCardProofReview => ({
      status,
      summary,
      satisfied:
        status === "done"
          ? [...new Set([...(previousReview?.satisfied ?? []), "Accepted by user PM decision."])]
          : (previousReview?.satisfied ?? []),
      missing:
        status === "terminally_blocked"
          ? [...new Set([...(previousReview?.missing ?? []), reason || "Manual PM decision marked this card blocked."])]
          : [],
      followUpCardIds: previousReview?.followUpCardIds ?? [],
      runId: previousReview?.runId ?? "",
      reviewedAt: now,
      reviewer: previousReview?.reviewer,
      model: previousReview?.model,
      confidence: previousReview?.confidence,
      evidenceQuality: previousReview?.evidenceQuality,
      recommendedAction,
      deterministicStatus: previousReview?.deterministicStatus,
      deterministicSummary: previousReview?.deterministicSummary,
      judgeDurationMs: previousReview?.judgeDurationMs,
    });

    const next =
      input.action === "accept_done"
        ? {
            cardStatus: "done" as ProjectBoardCardStatus,
            taskState: "done",
            proofReviewJson: JSON.stringify(
              makeReview(
                "done",
                `Accepted as done by user PM decision.${reason ? ` Reason: ${reason}` : ""}${previousSummary}`,
                "close",
              ),
            ),
            eventTitle: "Proof accepted as done",
            eventSummary: `${current.title} was manually accepted as done.`,
          }
        : input.action === "retry"
          ? {
              cardStatus: "ready" as ProjectBoardCardStatus,
              taskState: "ready",
              proofReviewJson: null,
              eventTitle: "Proof sent back for revision",
              eventSummary: `${current.title} was returned to Ready with next-run proof feedback.`,
            }
          : {
              cardStatus: "blocked" as ProjectBoardCardStatus,
              taskState: "terminal_blocker",
              proofReviewJson: JSON.stringify(
                makeReview(
                  "terminally_blocked",
                  `Marked blocked by user PM decision.${reason ? ` Reason: ${reason}` : ""}${previousSummary}`,
                  "block",
                ),
              ),
              eventTitle: "Proof marked blocked",
              eventSummary: `${current.title} was manually marked blocked.`,
            };

    this.db
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = ?, run_feedback_json = ?, updated_at = ? WHERE id = ?")
      .run(next.cardStatus, next.proofReviewJson, JSON.stringify(runFeedback), now, current.id);
    this.db
      .prepare("UPDATE orchestration_tasks SET state = ?, updated_at = ? WHERE id = ?")
      .run(next.taskState, now, task.id);
    this.touchBoard(current.boardId, now);
    if (decisionFeedback.length > 0) {
      const updated = this.getProjectBoardCard(current.id);
      this.deps.updateOrchestrationTaskDescription(task.id, this.deps.projectBoardCardTaskDescription(updated));
    }
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: next.eventTitle,
      summary: next.eventSummary,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        taskId: task.id,
        action: input.action,
        reason,
        previousProofReviewStatus: previousReview?.status,
        previousRecommendedAction: previousReview?.recommendedAction,
        previousRunId: previousReview?.runId,
        runFeedback:
          decisionFeedback[0]
            ? {
                id: decisionFeedback[0].id,
                source: decisionFeedback[0].source,
                decisionQuestion: decisionFeedback[0].decisionQuestion,
                modelCallRequired: false,
              }
            : undefined,
        runFeedbackItems:
          decisionFeedback.length > 1
            ? decisionFeedback.map((feedback) => ({
                id: feedback.id,
                source: feedback.source,
                decisionQuestion: feedback.decisionQuestion,
                modelCallRequired: false,
              }))
            : undefined,
      },
      createdAt: now,
    });
    this.deps.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(current.id);
  }

  resolveProjectBoardSplitDecision(input: { cardId: string; action: ProjectBoardSplitDecisionAction; reason?: string }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    const splitOutcome = current.splitOutcome;
    if (!splitOutcome) throw new Error("This project board card does not have a split outcome to resolve.");
    const task = current.orchestrationTaskId ? this.deps.getOrchestrationTask(current.orchestrationTaskId) : undefined;
    const activeRun = task
      ? this.deps.listOrchestrationRuns(200).find((run) => run.taskId === task.id && ["claimed", "prepared", "preparing", "running", "retry_queued"].includes(run.status))
      : undefined;
    if (activeRun) throw new Error("Wait for the active card run to finish before resolving this split.");
    if (current.status === "done" || task?.state === "done") throw new Error("This split has already been closed.");

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000);
    const childCards = splitOutcome.childCardIds.map((id) => this.tryGetProjectBoardCard(id)).filter((card): card is ProjectBoardCard => Boolean(card));
    const childIds = childCards.map((card) => card.id);
    const rejectDraftChildren = () => {
      if (childIds.length === 0) return;
      const placeholders = childIds.map(() => "?").join(", ");
      this.db
        .prepare(
          `UPDATE project_board_cards
           SET candidate_status = 'rejected', updated_at = ?
           WHERE id IN (${placeholders}) AND orchestration_task_id IS NULL AND status = 'draft'`,
        )
        .run(now, ...childIds);
    };
    const updateTaskState = (state: string) => {
      if (!task) throw new Error("This split decision requires a ticketized project board card.");
      this.db.prepare("UPDATE orchestration_tasks SET state = ?, updated_at = ? WHERE id = ?").run(state, now, task.id);
    };
    const updatedOutcome = (status: ProjectBoardCardSplitOutcomeStatus): ProjectBoardCardSplitOutcome => ({
      ...splitOutcome,
      status,
      updatedAt: now,
    });
    const closureReview = (
      status: ProjectBoardCardSplitOutcomeStatus,
      summary: string,
      recommendedAction: ProjectBoardCardProofRecommendedAction = "close",
    ): ProjectBoardCardProofReview => ({
      status: "done",
      summary,
      satisfied: [
        ...new Set([
          ...(current.proofReview?.satisfied ?? []),
          status === "done_via_split" ? "Split follow-ups were completed before the parent was closed." : "Parent was replaced by split follow-up cards.",
        ]),
      ],
      missing: [],
      followUpCardIds: splitOutcome.childCardIds,
      runId: current.proofReview?.runId ?? splitOutcome.sourceRunId,
      reviewedAt: now,
      reviewer: current.proofReview?.reviewer,
      model: current.proofReview?.model,
      confidence: current.proofReview?.confidence,
      evidenceQuality: current.proofReview?.evidenceQuality,
      recommendedAction,
      deterministicStatus: current.proofReview?.deterministicStatus,
      deterministicSummary: current.proofReview?.deterministicSummary,
      judgeDurationMs: current.proofReview?.judgeDurationMs,
    });
    const childIsTerminal = (child: ProjectBoardCard): boolean =>
      child.status === "done" || child.candidateStatus === "evidence" || child.candidateStatus === "duplicate";

    let nextCardStatus: ProjectBoardCardStatus = current.status;
    let nextProofReviewJson: string | null = current.proofReview ? JSON.stringify(current.proofReview) : null;
    let nextSplitOutcome = splitOutcome;
    let eventTitle = "Split decision recorded";
    let eventSummary = `${current.title} split decision was updated.`;

    if (input.action === "approve_split") {
      nextSplitOutcome = updatedOutcome("approved");
      eventTitle = "Split follow-ups approved";
      eventSummary = `${current.title} follow-up split was approved for separate execution.`;
    } else if (input.action === "reject_split") {
      rejectDraftChildren();
      nextSplitOutcome = updatedOutcome("rejected");
      eventTitle = "Split follow-ups rejected";
      eventSummary = `${current.title} follow-up split was rejected; unticketized split children were moved out of execution.`;
    } else if (input.action === "retry_original") {
      updateTaskState("ready");
      rejectDraftChildren();
      nextCardStatus = "ready";
      nextProofReviewJson = null;
      nextSplitOutcome = updatedOutcome("rejected");
      eventTitle = "Original card queued for retry";
      eventSummary = `${current.title} returned to Ready and split follow-ups were rejected.`;
    } else if (input.action === "merge_followups") {
      updateTaskState("ready");
      rejectDraftChildren();
      const mergedCriteria = normalizeCardTextList(
        [
          ...current.acceptanceCriteria,
          ...splitOutcome.remainingCriteria,
          ...childCards.flatMap((child) => child.acceptanceCriteria),
        ],
        30,
      );
      const mergedLabels = normalizeTaskLabels([...current.labels, ...childCards.flatMap((child) => child.labels), "merged-follow-up"]);
      this.db
        .prepare("UPDATE project_board_cards SET acceptance_criteria_json = ?, labels_json = ? WHERE id = ?")
        .run(JSON.stringify(mergedCriteria), JSON.stringify(mergedLabels), current.id);
      nextCardStatus = "ready";
      nextProofReviewJson = null;
      nextSplitOutcome = updatedOutcome("rejected");
      eventTitle = "Split follow-ups merged into parent";
      eventSummary = `${current.title} returned to Ready with follow-up criteria merged back into the original card.`;
    } else if (input.action === "mark_replaced") {
      updateTaskState("done");
      nextCardStatus = "done";
      nextSplitOutcome = updatedOutcome("replaced");
      nextProofReviewJson = JSON.stringify(
        closureReview(
          "replaced",
          `${current.title} was closed as replaced by split follow-up cards.${reason ? ` Reason: ${reason}` : ""}`,
        ),
      );
      eventTitle = "Parent closed as replaced";
      eventSummary = `${current.title} was marked replaced by split follow-up cards.`;
    } else {
      if (childCards.length === 0 || childCards.length !== splitOutcome.childCardIds.length) {
        throw new Error("All split follow-up cards must be present before closing the parent as done via split.");
      }
      const openChildren = childCards.filter((child) => !childIsTerminal(child));
      if (openChildren.length > 0) {
        throw new Error(`Finish or mark represented split follow-up cards before closing the parent: ${openChildren.map((child) => child.title).join(", ")}`);
      }
      updateTaskState("done");
      nextCardStatus = "done";
      nextSplitOutcome = updatedOutcome("done_via_split");
      nextProofReviewJson = JSON.stringify(
        closureReview(
          "done_via_split",
          `${current.title} was closed after its split follow-up cards reached terminal states.${reason ? ` Reason: ${reason}` : ""}`,
        ),
      );
      eventTitle = "Parent closed via split";
      eventSummary = `${current.title} was closed because its split follow-up cards are complete or represented.`;
    }

    this.db
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = ?, split_outcome_json = ?, updated_at = ? WHERE id = ?")
      .run(nextCardStatus, nextProofReviewJson, JSON.stringify(nextSplitOutcome), now, current.id);
    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_split",
      title: eventTitle,
      summary: eventSummary,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        taskId: task?.id,
        action: input.action,
        reason,
        splitOutcomeStatus: nextSplitOutcome.status,
        sourceRunId: splitOutcome.sourceRunId,
        childCardIds: splitOutcome.childCardIds,
      },
      createdAt: now,
    });
    this.deps.syncProjectBoardTaskBlockers(current.boardId);
    this.deps.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(current.id);
  }

  updateCard(input: UpdateProjectBoardCardMutationInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Project board candidates can only be edited before ticketization.");
    }
    const title = input.title === undefined ? current.title : input.title.trim();
    if (!title) throw new Error("Project board card title cannot be empty.");
    const now = new Date().toISOString();
    const description = input.description === undefined ? current.description : input.description.trim().slice(0, 4000);
    let candidateStatus = input.candidateStatus ?? current.candidateStatus;
    const priority = input.priority === undefined ? (current.priority ?? null) : input.priority === null ? null : Math.max(0, Math.min(100, Math.round(input.priority)));
    const phase = input.phase === undefined ? (current.phase ?? null) : input.phase?.trim() ? input.phase.trim().slice(0, 80) : null;
    const labels = input.labels === undefined ? current.labels : normalizeTaskLabels(input.labels);
    const blockedBy = input.blockedBy === undefined ? current.blockedBy : normalizeTaskReferences(input.blockedBy);
    const acceptanceCriteria =
      input.acceptanceCriteria === undefined ? current.acceptanceCriteria : normalizeCardTextList(input.acceptanceCriteria, 30);
    const testPlan = input.testPlan === undefined ? current.testPlan : normalizeProjectBoardCardTestPlan(input.testPlan);
    const sourceRefs = input.sourceRefs === undefined ? (current.sourceRefs ?? []) : normalizeCardTextList(input.sourceRefs, 20);
    const clarificationQuestions =
      input.clarificationQuestions === undefined
        ? normalizeProjectBoardClarificationQuestions(current.clarificationQuestions ?? [], 8)
        : normalizeProjectBoardClarificationQuestions(input.clarificationQuestions, 8);
    const clarificationSuggestions =
      input.clarificationSuggestions === undefined
        ? current.clarificationSuggestions ?? []
        : normalizeProjectBoardClarificationSuggestions(input.clarificationSuggestions, []);
    const clarificationAnswers =
      input.clarificationAnswers === undefined
        ? current.clarificationAnswers ?? []
        : normalizeProjectBoardClarificationAnswers(input.clarificationAnswers);
    const clarificationInputsChanged =
      input.clarificationQuestions !== undefined ||
      input.clarificationSuggestions !== undefined ||
      input.clarificationAnswers !== undefined ||
      input.clarificationDecisions !== undefined ||
      input.description !== undefined ||
      input.acceptanceCriteria !== undefined;
    const clarificationDecisions =
      input.clarificationDecisions !== undefined
        ? normalizeProjectBoardClarificationDecisions(input.clarificationDecisions, {
            clarificationQuestions,
            clarificationSuggestions,
            clarificationAnswers,
            createdAt: current.createdAt,
            updatedAt: now,
          })
        : clarificationInputsChanged
          ? normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
              clarificationQuestions,
              clarificationSuggestions,
              clarificationAnswers,
              createdAt: current.createdAt,
              updatedAt: now,
            })
          : current.clarificationDecisions ?? [];
    if (
      input.candidateStatus === undefined &&
      candidateStatus === "needs_clarification" &&
      (!this.deps.projectBoardRequiresProofSpec(current.boardId) || projectBoardCardProofCount({ ...current, testPlan }) > 0) &&
      projectBoardOpenClarificationQuestions({
        clarificationDecisions,
        clarificationQuestions,
        clarificationSuggestions,
        clarificationAnswers,
        includeInlineQuestions: false,
        limit: 8,
      }).length === 0
    ) {
      candidateStatus = "ready_to_create";
    }
    if (candidateStatus === "ready_to_create") {
      const nextForGates = { ...current, blockedBy, testPlan, clarificationQuestions, clarificationSuggestions, clarificationAnswers, clarificationDecisions };
      this.deps.assertProjectBoardCardProofReady(nextForGates);
      this.deps.assertProjectBoardCardClarificationsResolved(nextForGates);
      this.deps.assertProjectBoardRunFollowUpStillActionable(nextForGates);
    }
    const changedFields = [
      title !== current.title ? "title" : undefined,
      description !== current.description ? "description" : undefined,
      candidateStatus !== current.candidateStatus ? "candidateStatus" : undefined,
      priority !== (current.priority ?? null) ? "priority" : undefined,
      phase !== (current.phase ?? null) ? "phase" : undefined,
      JSON.stringify(labels) !== JSON.stringify(current.labels) ? "labels" : undefined,
      JSON.stringify(blockedBy) !== JSON.stringify(current.blockedBy) ? "dependencies" : undefined,
      JSON.stringify(acceptanceCriteria) !== JSON.stringify(current.acceptanceCriteria) ? "acceptanceCriteria" : undefined,
      JSON.stringify(testPlan) !== JSON.stringify(current.testPlan) ? "testPlan" : undefined,
      JSON.stringify(sourceRefs) !== JSON.stringify(current.sourceRefs ?? []) ? "sourceRefs" : undefined,
      JSON.stringify(clarificationQuestions) !== JSON.stringify(current.clarificationQuestions ?? []) ? "clarificationQuestions" : undefined,
      JSON.stringify(clarificationSuggestions) !== JSON.stringify(current.clarificationSuggestions ?? []) ? "clarificationSuggestions" : undefined,
      JSON.stringify(clarificationAnswers) !== JSON.stringify(current.clarificationAnswers ?? []) ? "clarificationAnswers" : undefined,
      JSON.stringify(clarificationDecisions) !== JSON.stringify(current.clarificationDecisions ?? []) ? "clarificationDecisions" : undefined,
    ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
    const touchedFields =
      changedFields.length > 0 ? [...new Set([...(current.userTouchedFields ?? []), ...changedFields])] : current.userTouchedFields ?? [];
    const touchedAt = changedFields.length > 0 ? now : current.userTouchedAt ?? null;
    const changedClarificationAnswer = changedFields.includes("clarificationAnswers")
      ? projectBoardChangedClarificationAnswer(current.clarificationAnswers ?? [], clarificationAnswers)
      : undefined;
    const decisionImpact = changedClarificationAnswer
      ? projectBoardDecisionImpactPreview(this.deps.getProjectBoard(current.boardId), {
          question: changedClarificationAnswer.question,
          answer: changedClarificationAnswer.answer,
          answeredCardId: current.id,
        })
      : undefined;
    this.db
      .prepare(
        `UPDATE project_board_cards
         SET title = ?,
             description = ?,
             candidate_status = ?,
             priority = ?,
             phase = ?,
             labels_json = ?,
             blocked_by_json = ?,
             acceptance_criteria_json = ?,
             test_plan_json = ?,
             source_refs_json = ?,
             clarification_questions_json = ?,
             clarification_suggestions_json = ?,
             clarification_answers_json = ?,
             clarification_decisions_json = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        title.slice(0, 180),
        description,
        candidateStatus,
        priority,
        phase,
        JSON.stringify(labels),
        JSON.stringify(blockedBy),
        JSON.stringify(acceptanceCriteria),
        JSON.stringify(testPlan),
        JSON.stringify(sourceRefs),
        JSON.stringify(clarificationQuestions),
        JSON.stringify(clarificationSuggestions),
        JSON.stringify(clarificationAnswers),
        JSON.stringify(clarificationDecisions),
        JSON.stringify(touchedFields),
        touchedAt,
        now,
        input.cardId,
      );
    this.touchBoard(current.boardId, now);
    if (changedFields.length > 0) {
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: decisionImpact ? "Clarification decision answered" : "Candidate card updated",
        summary: decisionImpact
          ? projectBoardClarificationDecisionImpactEventSummary(current.title, decisionImpact)
          : `${current.title} updated ${changedFields.join(", ")}.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          changedFields,
          ...(decisionImpact ? { decisionImpact: projectBoardDecisionImpactEventMetadata(decisionImpact) } : {}),
        },
        createdAt: now,
      });
    }
    if (changedFields.includes("candidateStatus") || changedFields.includes("dependencies")) {
      this.deps.syncProjectBoardTaskBlockers(current.boardId);
      this.deps.syncProjectBoardCardsForLinkedTasks();
    }
    return this.getProjectBoardCard(input.cardId);
  }

  updateCardCandidateStatus(
    cardId: string,
    candidateStatus: ProjectBoardCardCandidateStatus,
    options: { actor?: "user" | "system"; reason?: string; relatedCardId?: string } = {},
  ): ProjectBoardCard {
    const current = this.getProjectBoardCard(cardId);
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Candidate status can only be changed before a board card is ticketized.");
    }
    if (candidateStatus === "ready_to_create") {
      this.deps.assertProjectBoardCardProofReady(current);
      this.deps.assertProjectBoardCardClarificationsResolved(current);
      this.deps.assertProjectBoardRunFollowUpStillActionable(current);
    }
    const now = new Date().toISOString();
    const changed = current.candidateStatus !== candidateStatus;
    const touchedByUser = changed && options.actor !== "system";
    const touchedFields = touchedByUser ? [...new Set([...(current.userTouchedFields ?? []), "candidateStatus" satisfies ProjectBoardCardTouchedField])] : current.userTouchedFields ?? [];
    const touchedAt = touchedByUser ? now : current.userTouchedAt ?? null;
    this.db
      .prepare(
        `UPDATE project_board_cards
         SET candidate_status = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(candidateStatus, JSON.stringify(touchedFields), touchedAt, now, cardId);
    this.touchBoard(current.boardId, now);
    if (changed) {
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "candidate_status_changed",
        title: "Candidate status changed",
        summary: `${current.title} moved from ${current.candidateStatus} to ${candidateStatus}.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          from: current.candidateStatus,
          to: candidateStatus,
          ...(options.actor ? { actor: options.actor } : {}),
          ...(options.reason ? { reason: options.reason } : {}),
          ...(options.relatedCardId ? { relatedCardId: options.relatedCardId } : {}),
        },
        createdAt: now,
      });
      this.deps.syncProjectBoardTaskBlockers(current.boardId);
      this.deps.syncProjectBoardCardsForLinkedTasks();
    }
    return this.getProjectBoardCard(cardId);
  }

  approveProjectBoardCard(cardId: string): ProjectBoardCard {
    const current = this.getProjectBoardCard(cardId);
    if (current.status !== "draft" && current.status !== "blocked") return current;
    if (current.candidateStatus !== "ready_to_create") {
      throw new Error("Only ready-to-create board candidates can be approved.");
    }
    this.deps.assertProjectBoardCardProofReady(current);
    this.deps.assertProjectBoardCardClarificationsResolved(current);
    this.deps.assertProjectBoardCardClaimAllowsLocalTicketization(current);
    this.deps.assertProjectBoardRunFollowUpStillActionable(current);
    this.deps.assertProjectBoardUxMockGateOpen(current, this.deps.listProjectBoardCards(current.boardId));
    const now = new Date().toISOString();
    const taskId = current.orchestrationTaskId ?? this.createTaskForProjectBoardCard(current).id;
    this.db
      .prepare("UPDATE project_board_cards SET status = 'ready', orchestration_task_id = ?, updated_at = ? WHERE id = ?")
      .run(taskId, now, cardId);
    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_ticketized",
      title: "Card ticketized",
      summary: `${current.title} was approved into a ready Local Task.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: { cardId: current.id, taskId, sourceKind: current.sourceKind, sourceId: current.sourceId },
      createdAt: now,
    });
    this.deps.syncProjectBoardTaskBlockers(current.boardId);
    this.deps.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(cardId);
  }

  private createTaskForProjectBoardCard(card: ProjectBoardCard): OrchestrationTask {
    const sourceUrl = `project-board-card:${card.id}`;
    const existing = this.db
      .prepare("SELECT * FROM orchestration_tasks WHERE source_kind = 'project_board_card' AND source_url = ? ORDER BY updated_at DESC LIMIT 1")
      .get(sourceUrl) as OrchestrationTaskRow | undefined;
    if (existing) return this.deps.mapOrchestrationTask(existing);
    const description = this.deps.projectBoardCardTaskDescription(card);
    const boardCards = this.deps.listProjectBoardCards(card.boardId);
    const blockedBy = resolveProjectBoardTaskBlockers(card, boardCards, this.deps.listOrchestrationTasks());
    const task = this.deps.createOrchestrationTask({
      title: card.title,
      description,
      state: "ready",
      priority: card.priority,
      labels: normalizeTaskLabels(["project-board", ...card.labels]),
      blockedBy,
    });
    this.db
      .prepare("UPDATE orchestration_tasks SET source_kind = ?, source_url = ?, updated_at = ? WHERE id = ?")
      .run("project_board_card", sourceUrl, new Date().toISOString(), task.id);
    return this.deps.getOrchestrationTask(task.id);
  }

  createReadyProjectBoardTasks(boardId: string): ProjectBoardCard[] {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot create ready tasks.");
    if (board.status !== "active") throw new Error("Project board charter must be active before creating ready tasks.");
    const runningSynthesis = this.deps.getRunningProjectBoardSynthesisRun(boardId);
    if (runningSynthesis) {
      throw new Error("Project board planning is still running; wait for it to finish or pause before creating ready tasks.");
    }
    const boardCards = this.deps.listProjectBoardCards(boardId);
    const eligible = boardCards
      .filter((card) => card.status === "draft" && !card.orchestrationTaskId && card.candidateStatus === "ready_to_create")
      .filter((card) => !projectBoardCardBlockedByOpenUxMockGate(card, boardCards))
      .filter((card) => !projectBoardClosedParentForRunFollowUp(card, boardCards));
    if (eligible.length === 0) return [];
    eligible.forEach((card) => {
      this.deps.assertProjectBoardCardProofReady(card);
      this.deps.assertProjectBoardCardClarificationsResolved(card);
      // Asserted up front with the other gates: claim checks used to run per card
      // inside the (non-transactional) approve loop, so a claimed card mid-list threw
      // after earlier cards were already ticketized -- partial work plus an error.
      this.deps.assertProjectBoardCardClaimAllowsLocalTicketization(card);
    });
    const planningSnapshot = this.deps.latestStableProjectBoardPlanningSnapshot(boardId);
    const synthesisEligible = eligible.filter((card) => card.sourceKind === "board_synthesis");
    if (synthesisEligible.length > 0) {
      if (!planningSnapshot) {
        throw new Error("Board synthesis cards require a completed or paused planning snapshot before creating ready tasks.");
      }
      const snapshotCardIds = new Set(planningSnapshot.snapshot.cardIds);
      const missingSnapshotCards = synthesisEligible.filter((card) => !snapshotCardIds.has(card.id));
      if (missingSnapshotCards.length > 0) {
        throw new Error(
          `${missingSnapshotCards.length} ready synthesis card${missingSnapshotCards.length === 1 ? " is" : "s are"} not part of the latest stable planning snapshot; pause or complete planning before creating ready tasks.`,
        );
      }
    }
    const ticketized = eligible.map((card) => this.approveProjectBoardCard(card.id));
    this.deps.syncProjectBoardTaskBlockers(boardId);
    this.deps.syncProjectBoardCardsForLinkedTasks();
    const now = new Date().toISOString();
    this.deps.appendProjectBoardEvent({
      boardId,
      kind: "ready_tasks_created",
      title: "Ready tasks created",
      summary: `${ticketized.length} ready candidate card${ticketized.length === 1 ? "" : "s"} became Local Tasks.`,
      entityKind: "project_board",
      entityId: boardId,
      metadata: {
        cardIds: ticketized.map((card) => card.id),
        taskIds: ticketized.map((card) => card.orchestrationTaskId).filter(Boolean),
        ...(planningSnapshot
          ? {
              planningSnapshotId: planningSnapshot.snapshot.id,
              planningSnapshotRunId: planningSnapshot.runId,
              planningSnapshotKind: planningSnapshot.snapshot.kind,
              planningSnapshotFingerprint: planningSnapshot.snapshot.renderFingerprint,
              planningSnapshotCardIds: planningSnapshot.snapshot.cardIds,
            }
          : {}),
      },
      createdAt: now,
    });
    this.touchBoard(boardId, now);
    return ticketized.map((card) => this.getProjectBoardCard(card.id));
  }

  resolvePiUpdate(input: { cardId: string; action: "apply" | "ignore" }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (!current.pendingPiUpdate) return current;
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Pi update suggestions can only be resolved before ticketization.");
    }
    const now = new Date().toISOString();
    if (input.action === "ignore") {
      this.db
        .prepare("UPDATE project_board_cards SET pending_pi_update_json = NULL, updated_at = ? WHERE id = ?")
        .run(now, input.cardId);
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: "Pi update ignored",
        summary: `${current.title} kept the user-owned card fields.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: { cardId: current.id, sourceId: current.pendingPiUpdate.sourceId, action: "ignore" },
        createdAt: now,
      });
      return this.getProjectBoardCard(input.cardId);
    }

    const update = current.pendingPiUpdate;
    const title = update.title ?? current.title;
    const description = update.description ?? current.description;
    const priority = update.priority ?? current.priority ?? null;
    const phase = update.phase ?? current.phase ?? null;
    const labels = update.labels ?? current.labels;
    const blockedBy = update.blockedBy ?? current.blockedBy;
    const acceptanceCriteria = update.acceptanceCriteria ?? current.acceptanceCriteria;
    const testPlan = update.testPlan ?? current.testPlan;
    const sourceRefs = update.sourceRefs ?? current.sourceRefs ?? [];
    const clarificationAnswers = normalizeProjectBoardClarificationAnswers(update.clarificationAnswers ?? current.clarificationAnswers ?? []);
    const normalizedClarification = normalizeProjectBoardSynthesisClarificationFields({
      clarificationQuestions: update.clarificationQuestions ?? current.clarificationQuestions ?? [],
      clarificationSuggestions: update.clarificationSuggestions ?? current.clarificationSuggestions ?? [],
      clarificationAnswers,
      clarificationDecisions: update.clarificationDecisions ?? current.clarificationDecisions,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    const clarificationQuestions = normalizedClarification.clarificationQuestions;
    const clarificationSuggestions = normalizedClarification.clarificationSuggestions;
    const clarificationDecisions = normalizedClarification.clarificationDecisions;
    const candidateStatus = update.candidateStatus
      ? projectBoardCandidateStatusForSynthesisUpdate(update.candidateStatus, current.candidateStatus, clarificationDecisions)
      : current.candidateStatus;
    const objectiveProvenance = update.objectiveProvenance ?? current.objectiveProvenance;
    const uiMockRole = update.uiMockRole ?? current.uiMockRole;
    const requiresUiMockApproval = update.requiresUiMockApproval ?? current.requiresUiMockApproval ?? false;
    if (candidateStatus === "ready_to_create") {
      this.deps.assertProjectBoardCardProofReady({ ...current, testPlan });
      this.deps.assertProjectBoardCardClarificationsResolved({
        ...current,
        clarificationQuestions,
        clarificationSuggestions,
        clarificationAnswers,
        clarificationDecisions,
        candidateStatus,
      });
    }
    const touchedFields = [...new Set([...(current.userTouchedFields ?? []), ...update.changedFields])];
    this.db
      .prepare(
        `UPDATE project_board_cards
         SET title = ?,
             description = ?,
             candidate_status = ?,
             priority = ?,
             phase = ?,
             labels_json = ?,
             blocked_by_json = ?,
             acceptance_criteria_json = ?,
             test_plan_json = ?,
             source_refs_json = ?,
             clarification_questions_json = ?,
             clarification_suggestions_json = ?,
             clarification_answers_json = ?,
             clarification_decisions_json = ?,
             objective_provenance_json = ?,
             ui_mock_role = ?,
             requires_ui_mock_approval = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             pending_pi_update_json = NULL,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        title.trim().slice(0, 180),
        description.trim().slice(0, 4000),
        candidateStatus,
        priority,
        phase?.trim() ? phase.trim().slice(0, 80) : null,
        JSON.stringify(normalizeTaskLabels(labels)),
        JSON.stringify(normalizeTaskReferences(blockedBy)),
        JSON.stringify(normalizeCardTextList(acceptanceCriteria, 30)),
        JSON.stringify(normalizeProjectBoardCardTestPlan(testPlan)),
        JSON.stringify(normalizeCardTextList(sourceRefs, 20)),
        JSON.stringify(normalizeProjectBoardClarificationQuestions(clarificationQuestions, 8)),
        JSON.stringify(normalizeProjectBoardClarificationSuggestions(clarificationSuggestions, [])),
        JSON.stringify(normalizeProjectBoardClarificationAnswers(clarificationAnswers)),
        JSON.stringify(clarificationDecisions),
        objectiveProvenanceJson(objectiveProvenance),
        normalizeProjectBoardUiMockRole(uiMockRole) ?? null,
        requiresUiMockApproval ? 1 : 0,
        JSON.stringify(touchedFields),
        now,
        now,
        input.cardId,
      );
    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Pi update applied",
      summary: `${current.title} accepted Pi updates for ${update.changedFields.join(", ")}.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: { cardId: current.id, sourceId: update.sourceId, action: "apply", changedFields: update.changedFields },
      createdAt: now,
    });
    return this.getProjectBoardCard(input.cardId);
  }

  addRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (!current.orchestrationTaskId || current.status === "draft") {
      throw new Error("Run feedback can only be added after a card has been approved into a Local Task.");
    }
    if (current.status === "done" || current.status === "archived") {
      throw new Error("Completed or archived cards cannot receive next-run feedback.");
    }
    if (current.status === "in_progress") {
      throw new Error("Wait for the active Local Task run to finish before adding next-run feedback.");
    }
    const feedbackText = input.feedback.trim();
    if (!feedbackText) throw new Error("Run feedback cannot be empty.");
    const now = new Date().toISOString();
    const feedback: ProjectBoardCardRunFeedback = {
      id: randomUUID(),
      feedback: feedbackText.slice(0, 1500),
      source: normalizeProjectBoardCardRunFeedbackSource(input.source),
      decisionQuestion: input.decisionQuestion?.trim() ? input.decisionQuestion.trim().slice(0, 500) : undefined,
      decisionAnswer: input.decisionAnswer?.trim() ? input.decisionAnswer.trim().slice(0, 1500) : undefined,
      sourceImpactEventId: input.sourceImpactEventId?.trim() ? input.sourceImpactEventId.trim().slice(0, 120) : undefined,
      sourceImpactEventIds: normalizeTaskReferences(input.sourceImpactEventIds ?? []),
      sourceIds: normalizeTaskReferences(input.sourceIds ?? []),
      createdAt: now,
      createdBy: "ambient-desktop",
    };
    const runFeedback = normalizeProjectBoardCardRunFeedback([...(current.runFeedback ?? []), feedback]);
    this.db
      .prepare("UPDATE project_board_cards SET run_feedback_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(runFeedback), now, current.id);
    this.touchBoard(current.boardId, now);
    const updated = this.getProjectBoardCard(current.id);
    this.deps.updateOrchestrationTaskDescription(
      current.orchestrationTaskId,
      this.deps.projectBoardCardTaskDescription(updated),
    );
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Run feedback added",
      summary: `${current.title} received additive next-run feedback. The approved card fields were not rewritten.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        taskId: current.orchestrationTaskId,
        runFeedback: {
          id: feedback.id,
          source: feedback.source,
          decisionQuestion: feedback.decisionQuestion,
          decisionAnswer: feedback.decisionAnswer,
          sourceImpactEventId: feedback.sourceImpactEventId,
          sourceImpactEventIds: feedback.sourceImpactEventIds,
          sourceIds: feedback.sourceIds,
          modelCallRequired: false,
        },
      },
      createdAt: now,
    });
    return this.getProjectBoardCard(current.id);
  }

  applyDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim().slice(0, 1500);
    if (!question || !answer) throw new Error("Decision impact feedback requires a question and answer.");

    const now = new Date().toISOString();
    const board = this.deps.getProjectBoard(current.boardId);
    const impact = projectBoardDecisionImpactPreview(board, { question, answer, answeredCardId: current.id });
    if (current.status === "draft" && !current.orchestrationTaskId) {
      const nextAnswers = normalizeProjectBoardClarificationAnswers([
        ...(current.clarificationAnswers ?? []),
        { question, answer, answeredAt: now },
      ]);
      this.updateCard({ cardId: current.id, clarificationAnswers: nextAnswers });
    } else {
      if (!current.orchestrationTaskId || current.status === "done" || current.status === "archived") {
        throw new Error("Decision impact feedback can only be applied to draft cards or active Local Task cards.");
      }
      if (current.status === "in_progress") {
        throw new Error("Wait for the active Local Task run to finish before applying decision feedback.");
      }
      this.recordProjectBoardClarificationAnswerMetadata(current, question, answer, now, impact);
    }
    const targets = impact.cards.filter((card) => card.state === "ready_needs_next_run_feedback");
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];

    for (const target of targets) {
      const targetCard = this.getProjectBoardCard(target.cardId);
      if (
        !targetCard.orchestrationTaskId ||
        targetCard.status === "draft" ||
        targetCard.status === "done" ||
        targetCard.status === "archived" ||
        targetCard.status === "in_progress" ||
        projectBoardHasDecisionImpactFeedback(targetCard, question, answer)
      ) {
        skippedCardIds.push(target.cardId);
        continue;
      }
      this.addRunFeedback({
        cardId: targetCard.id,
        feedback: projectBoardDecisionImpactFeedbackText(question, answer),
        source: "decision_impact",
        decisionQuestion: question,
        decisionAnswer: answer,
      });
      appliedCardIds.push(targetCard.id);
    }

    if (appliedCardIds.length > 0) {
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: "Decision impact applied",
        summary: `Clarification answer created next-run feedback for ${appliedCardIds.length} ticketized card${
          appliedCardIds.length === 1 ? "" : "s"
        }; ${skippedCardIds.length} skipped. 0 model calls.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          decisionImpact: {
            ...projectBoardDecisionImpactEventMetadata(impact),
            appliedAction: "create_next_run_feedback",
            appliedCardIds,
            skippedCardIds,
          },
        },
        createdAt: now,
      });
    }

    return this.getProjectBoardCard(current.id);
  }

  refreshDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (current.status !== "draft" || current.orchestrationTaskId) {
      throw new Error("Decision draft refresh must start from a draft clarification card before ticketization.");
    }
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim().slice(0, 1500);
    if (!question || !answer) throw new Error("Decision draft refresh requires a question and answer.");

    const board = this.deps.getProjectBoard(current.boardId);
    const impact = projectBoardDecisionImpactPreview(board, { question, answer, answeredCardId: current.id });
    const targetById = new Map(
      impact.cards
        .filter((card) => card.state === "draft_unblocked" || card.state === "draft_still_blocked" || card.state === "duplicate_hidden")
        .map((card) => [card.cardId, card]),
    );
    if (!targetById.has(current.id)) {
      targetById.set(current.id, {
        cardId: current.id,
        title: current.title,
        status: current.status,
        candidateStatus: current.candidateStatus,
        state: "draft_still_blocked",
        openBefore: 1,
        openAfter: 0,
        matchedQuestions: [question],
        duplicateQuestions: [],
        recommendedAction: "Save answer on the source draft.",
      });
    }

    const now = new Date().toISOString();
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];

    for (const target of targetById.values()) {
      const targetCard = this.getProjectBoardCard(target.cardId);
      if (targetCard.status !== "draft" || targetCard.orchestrationTaskId) {
        skippedCardIds.push(target.cardId);
        continue;
      }
      const variants = [...new Set([question, ...target.matchedQuestions, ...target.duplicateQuestions].map((value) => value.trim()).filter(Boolean))];
      const existingAnswer = (targetCard.clarificationAnswers ?? []).find((item) => projectBoardQuestionMatchesAnyVariant(item.question, variants));
      const answerQuestion = existingAnswer?.question ?? target.matchedQuestions[0] ?? target.duplicateQuestions[0] ?? question;
      const answeredAt = existingAnswer?.answer.trim() === answer ? existingAnswer.answeredAt : now;
      const nextAnswers = normalizeProjectBoardClarificationAnswers([
        ...(targetCard.clarificationAnswers ?? []),
        { question: answerQuestion, answer, answeredAt },
      ]);
      const nextQuestions = normalizeProjectBoardClarificationQuestions(
        (targetCard.clarificationQuestions ?? []).filter((candidate) => !projectBoardQuestionMatchesAnyVariant(candidate, variants)),
        8,
      );
      this.updateCard({
        cardId: targetCard.id,
        description: projectBoardDescriptionWithClarificationAnswer(targetCard.description, answerQuestion, answer).slice(0, 4000),
        clarificationQuestions: nextQuestions,
        clarificationAnswers: nextAnswers,
      });
      appliedCardIds.push(targetCard.id);
    }

    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Decision drafts refreshed",
      summary: `Clarification answer was applied to ${appliedCardIds.length} affected draft card${
        appliedCardIds.length === 1 ? "" : "s"
      }; ${skippedCardIds.length} skipped. 0 model calls.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        decisionImpact: {
          ...projectBoardDecisionImpactEventMetadata(impact),
          appliedAction: "refresh_affected_drafts",
          appliedCardIds,
          skippedCardIds,
        },
      },
      createdAt: now,
    });

    return this.getProjectBoardCard(current.id);
  }

  private recordProjectBoardClarificationAnswerMetadata(
    current: ProjectBoardCard,
    question: string,
    answer: string,
    now: string,
    decisionImpact: ProjectBoardDecisionImpactPreview,
  ): ProjectBoardCard {
    const nextAnswers = normalizeProjectBoardClarificationAnswers([
      ...(current.clarificationAnswers ?? []),
      { question, answer, answeredAt: now },
    ]);
    if (JSON.stringify(nextAnswers) === JSON.stringify(current.clarificationAnswers ?? [])) {
      return this.getProjectBoardCard(current.id);
    }
    const nextDecisions = normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
      clarificationQuestions: current.clarificationQuestions,
      clarificationSuggestions: current.clarificationSuggestions,
      clarificationAnswers: nextAnswers,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    const touchedFields = [
      ...new Set([
        ...(current.userTouchedFields ?? []),
        "clarificationAnswers" satisfies ProjectBoardCardTouchedField,
        "clarificationDecisions" satisfies ProjectBoardCardTouchedField,
      ]),
    ];
    this.db
      .prepare(
        `UPDATE project_board_cards
         SET clarification_answers_json = ?,
             clarification_decisions_json = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(nextAnswers), JSON.stringify(nextDecisions), JSON.stringify(touchedFields), now, now, current.id);
    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Clarification decision answered",
      summary: projectBoardClarificationDecisionImpactEventSummary(current.title, decisionImpact),
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        changedFields: ["clarificationAnswers", "clarificationDecisions"],
        decisionImpact: projectBoardDecisionImpactEventMetadata(decisionImpact),
      },
      createdAt: now,
    });
    return this.getProjectBoardCard(current.id);
  }

  private getProjectBoardCard(cardId: string): ProjectBoardCard {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as
      | ProjectBoardCardStoreRow
      | undefined;
    if (!row) throw new Error(`Project board card not found: ${cardId}`);
    return mapProjectBoardCardRow(row, this.deps.listOrchestrationTasks());
  }

  private tryGetProjectBoardCard(cardId: string): ProjectBoardCard | undefined {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as
      | ProjectBoardCardStoreRow
      | undefined;
    return row ? mapProjectBoardCardRow(row, this.deps.listOrchestrationTasks()) : undefined;
  }

  private touchBoard(boardId: string, updatedAt: string): void {
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
  }

  private projectBoardProofReviewApplicationBlocker(
    parent: ProjectBoardCardStoreRow,
    run: Pick<OrchestrationRun, "id" | "taskId">,
    requireCurrentReview: boolean,
  ): string | undefined {
    const latestRun = this.db
      .prepare("SELECT id FROM orchestration_runs WHERE task_id = ? ORDER BY started_at DESC, attempt_number DESC LIMIT 1")
      .get(run.taskId) as { id: string } | undefined;
    return projectBoardProofReviewApplicationBlocker({
      latestRunId: latestRun?.id,
      runId: run.id,
      proofReviewJson: parent.proof_review_json,
      requireCurrentReview,
    });
  }
}
