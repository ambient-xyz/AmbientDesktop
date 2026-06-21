import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardCard,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardRunFeedback,
  ProjectBoardCardStatus,
  ProjectBoardCardTestPlan,
  ProjectBoardProofDecisionAction,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import type { ProjectBoardRunArtifactProjection } from "./projectStoreProjectBoardFacade";
import { stableBoardArtifactId } from "./projectStoreProjectBoardFacade";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import {
  mapProjectBoardCardRow,
  normalizeCardTextList,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeRunFollowUps,
  parseProjectBoardStringList,
  projectBoardCardIsUxMockGate,
  projectBoardExecutionArtifactCardId,
  projectBoardMissingProofItems,
  projectBoardProofEvidenceText,
  projectBoardProofFollowUpOptionsFromSuggestion,
  projectBoardProofOfWorkForRun,
  projectBoardProofRevisionRunFeedback,
  projectBoardProofReviewApplicationBlocker,
  projectBoardProofReviewClosureModelForApplication,
  projectBoardRuntimeBudgetCompletedCriteria,
  projectBoardRuntimeBudgetExceeded,
  projectBoardRuntimeBudgetFollowUpClarificationQuestion,
  projectBoardRuntimeBudgetFollowUpDescription,
  projectBoardRuntimeBudgetHasMeaningfulProgress,
  projectBoardRuntimeBudgetRemainingCriteria,
  projectBoardRuntimeBudgetReviewForApplication,
  projectBoardRuntimeBudgetSplitOutcomeForReview,
  projectBoardRunHasReviewableProof,
  projectBoardTaskStateForProofReview,
  projectBoardUxMockRejectionRunFeedback,
  type ProjectBoardCardStoreRow,
  type ProjectBoardProofReviewDraft,
  type ProjectBoardRunFollowUpInsertOptions,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardCardProofReviewRepositoryDeps {
  listOrchestrationTasks(): OrchestrationTask[];
  listOrchestrationRuns(limit?: number): OrchestrationRun[];
  getOrchestrationRun(runId: string): OrchestrationRun;
  getOrchestrationTask(taskId: string): OrchestrationTask;
  updateOrchestrationTaskDescription(taskId: string, description: string): void;
  projectBoardCardTaskDescription(card: ProjectBoardCard): string;
  appendProjectBoardEvent(input: ProjectBoardCardMutationEventInput): void;
  syncProjectBoardCardsForLinkedTasks(): void;
}

export class ProjectStoreProjectBoardCardProofReviewRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardProofReviewRepositoryDeps,
  ) {}

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
      : review.missing.length
        ? review.missing
        : ["Resolve missing proof before closing the parent card."];
    const clarificationQuestions = options.clarificationQuestions?.length
      ? normalizeProjectBoardClarificationQuestions(options.clarificationQuestions, 8)
      : [];
    const testPlan = options.testPlan ?? {
      unit: [],
      integration: [],
      visual: [],
      manual: ["Review the parent run proof packet and add the missing evidence."],
    };
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
        .prepare(
          "SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1",
        )
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
    const existing = this.db.prepare(
      "SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?",
    );
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
      (
        this.db
          .prepare("SELECT * FROM project_board_cards WHERE board_id = ? AND status != 'archived'")
          .all(boardId) as ProjectBoardCardStoreRow[]
      ).map((row) => [row.id, row]),
    );
    const existing = this.db.prepare(
      "SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?",
    );
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
      .prepare(
        "SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1",
      )
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
      .prepare(
        "SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1",
      )
      .get(run.taskId) as ProjectBoardCardStoreRow | undefined;
    if (!parent) return undefined;
    const parentCard = mapProjectBoardCardRow(parent, this.deps.listOrchestrationTasks());
    const staleReason = input.allowStaleRun
      ? undefined
      : this.projectBoardProofReviewApplicationBlocker(parent, run, input.requireCurrentReview === true);
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
    const runtimeBudgetRemaining = runtimeBudgetSplit ? projectBoardRuntimeBudgetRemainingCriteria(parentCard, proof, input.review) : [];
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
    const proofFollowUpIds =
      inputReview.status === "needs_follow_up" && !hasExplicitFollowUps
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
                  description: projectBoardRuntimeBudgetFollowUpDescription(
                    parent.title,
                    input.review,
                    runtimeBudgetCompleted,
                    runtimeBudgetRemaining,
                  ),
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
    const decisionFeedback = [proofRevisionFeedback, uxMockRejectionFeedback].filter((feedback): feedback is ProjectBoardCardRunFeedback =>
      Boolean(feedback),
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
              makeReview("done", `Accepted as done by user PM decision.${reason ? ` Reason: ${reason}` : ""}${previousSummary}`, "close"),
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
    this.db.prepare("UPDATE orchestration_tasks SET state = ?, updated_at = ? WHERE id = ?").run(next.taskState, now, task.id);
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
        runFeedback: decisionFeedback[0]
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

  private getProjectBoardCard(cardId: string): ProjectBoardCard {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
    if (!row) throw new Error(`Project board card not found: ${cardId}`);
    return mapProjectBoardCardRow(row, this.deps.listOrchestrationTasks());
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
