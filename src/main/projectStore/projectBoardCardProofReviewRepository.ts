import type Database from "better-sqlite3";
import type {
  ProjectBoardCard,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardRunFeedback,
  ProjectBoardCardStatus,
  ProjectBoardProofDecisionAction,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import type { ProjectBoardRunArtifactProjection } from "./projectStoreProjectBoardFacade";
import {
  mapProjectBoardCardRow,
  normalizeProjectBoardCardRunFeedback,
  projectBoardCardIsUxMockGate,
  projectBoardProofRevisionRunFeedback,
  projectBoardProofReviewApplicationBlocker,
  projectBoardRunHasReviewableProof,
  projectBoardUxMockRejectionRunFeedback,
  type ProjectBoardCardStoreRow,
  type ProjectBoardProofReviewDraft,
  type ProjectBoardRunFollowUpInsertOptions,
} from "./projectBoardMappers";
import {
  completeProjectBoardProofReviewApplication,
  prepareProjectBoardProofReviewApplication,
} from "./projectBoardProofReviewApplyPlan";
import {
  ProjectStoreProjectBoardRunFollowUpRepository,
  type ProjectStoreProjectBoardRunFollowUpRepositoryDeps,
} from "./projectBoardRunFollowUpRepository";

export interface ProjectStoreProjectBoardCardProofReviewRepositoryDeps
  extends ProjectStoreProjectBoardRunFollowUpRepositoryDeps {
  listOrchestrationTasks(): OrchestrationTask[];
  listOrchestrationRuns(limit?: number): OrchestrationRun[];
  getOrchestrationRun(runId: string): OrchestrationRun;
  getOrchestrationTask(taskId: string): OrchestrationTask;
  updateOrchestrationTaskDescription(taskId: string, description: string): void;
  projectBoardCardTaskDescription(card: ProjectBoardCard): string;
  syncProjectBoardCardsForLinkedTasks(): void;
}

export class ProjectStoreProjectBoardCardProofReviewRepository {
  private readonly runFollowUps: ProjectStoreProjectBoardRunFollowUpRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardProofReviewRepositoryDeps,
  ) {
    this.runFollowUps = new ProjectStoreProjectBoardRunFollowUpRepository(db, deps);
  }

  createProjectBoardProofFollowUpForRun(
    run: OrchestrationRun,
    parent: ProjectBoardCardStoreRow,
    review: ProjectBoardProofReviewDraft,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    return this.runFollowUps.createProjectBoardProofFollowUpForRun(run, parent, review, options);
  }

  createProjectBoardFollowUpCandidatesForRun(
    run: OrchestrationRun,
    parentRow?: ProjectBoardCardStoreRow,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    return this.runFollowUps.createProjectBoardFollowUpCandidatesForRun(run, parentRow, options);
  }

  materializeProjectBoardPulledHandoffFollowUps(boardId: string, runArtifacts: ProjectBoardRunArtifactProjection[]): string[] {
    return this.runFollowUps.materializeProjectBoardPulledHandoffFollowUps(boardId, runArtifacts);
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
    const preparation = prepareProjectBoardProofReviewApplication({ run, parentCard, review: input.review });
    const explicitFollowUpIds = this.createProjectBoardFollowUpCandidatesForRun(run, parent, preparation.explicitFollowUpOptions);
    const proofFollowUpIds =
      preparation.proofFollowUpDraft
        ? this.createProjectBoardProofFollowUpForRun(run, parent, preparation.proofFollowUpDraft, preparation.proofFollowUpOptions)
        : [];
    const now = new Date().toISOString();
    const application = completeProjectBoardProofReviewApplication({
      run,
      parentCard,
      preparation,
      explicitFollowUpIds,
      proofFollowUpIds,
      now,
    });
    this.db
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = ?, split_outcome_json = ?, updated_at = ? WHERE id = ?")
      .run(
        application.nextCardStatus,
        JSON.stringify(application.review),
        application.splitOutcome ? JSON.stringify(application.splitOutcome) : parent.split_outcome_json,
        now,
        parent.id,
      );
    this.db.prepare("UPDATE orchestration_tasks SET state = ?, updated_at = ? WHERE id = ?").run(application.taskState, now, run.taskId);
    this.touchBoard(parent.board_id, now);
    this.deps.appendProjectBoardEvent({
      boardId: parent.board_id,
      kind: "card_proof_reviewed",
      title: application.reviewedEvent.title,
      summary: application.reviewedEvent.summary,
      entityKind: "project_board_card",
      entityId: parent.id,
      metadata: application.reviewedEvent.metadata,
      createdAt: now,
    });
    if (application.splitEvent) {
      this.deps.appendProjectBoardEvent({
        boardId: parent.board_id,
        kind: "card_split",
        title: application.splitEvent.title,
        summary: application.splitEvent.summary,
        entityKind: "project_board_card",
        entityId: parent.id,
        metadata: application.splitEvent.metadata,
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
