import type Database from "better-sqlite3";
import type {
  ProjectBoardCard,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReview,
  ProjectBoardCardSplitOutcome,
  ProjectBoardCardSplitOutcomeStatus,
  ProjectBoardCardStatus,
  ProjectBoardSplitDecisionAction,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import {
  mapProjectBoardCardRow,
  normalizeCardTextList,
  normalizeTaskLabels,
  type ProjectBoardCardStoreRow,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardCardSplitDecisionRepositoryDeps {
  listOrchestrationTasks(): OrchestrationTask[];
  listOrchestrationRuns(limit?: number): OrchestrationRun[];
  getOrchestrationTask(taskId: string): OrchestrationTask;
  appendProjectBoardEvent(input: ProjectBoardCardMutationEventInput): void;
  syncProjectBoardTaskBlockers(boardId: string): void;
  syncProjectBoardCardsForLinkedTasks(): void;
}

export class ProjectStoreProjectBoardCardSplitDecisionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardSplitDecisionRepositoryDeps,
  ) {}

  resolveProjectBoardSplitDecision(input: { cardId: string; action: ProjectBoardSplitDecisionAction; reason?: string }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    const splitOutcome = current.splitOutcome;
    if (!splitOutcome) throw new Error("This project board card does not have a split outcome to resolve.");
    const task = current.orchestrationTaskId ? this.deps.getOrchestrationTask(current.orchestrationTaskId) : undefined;
    const activeRun = task
      ? this.deps
          .listOrchestrationRuns(200)
          .find((run) => run.taskId === task.id && ["claimed", "prepared", "preparing", "running", "retry_queued"].includes(run.status))
      : undefined;
    if (activeRun) throw new Error("Wait for the active card run to finish before resolving this split.");
    if (current.status === "done" || task?.state === "done") throw new Error("This split has already been closed.");

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000);
    const childCards = splitOutcome.childCardIds
      .map((id) => this.tryGetProjectBoardCard(id))
      .filter((card): card is ProjectBoardCard => Boolean(card));
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
          status === "done_via_split"
            ? "Split follow-ups were completed before the parent was closed."
            : "Parent was replaced by split follow-up cards.",
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

    const next = (() => {
      if (input.action === "approve_split") {
        return {
          cardStatus: current.status,
          proofReviewJson: current.proofReview ? JSON.stringify(current.proofReview) : null,
          splitOutcome: updatedOutcome("approved"),
          eventTitle: "Split follow-ups approved",
          eventSummary: `${current.title} follow-up split was approved for separate execution.`,
        };
      }
      if (input.action === "reject_split") {
        rejectDraftChildren();
        return {
          cardStatus: current.status,
          proofReviewJson: current.proofReview ? JSON.stringify(current.proofReview) : null,
          splitOutcome: updatedOutcome("rejected"),
          eventTitle: "Split follow-ups rejected",
          eventSummary: `${current.title} follow-up split was rejected; unticketized split children were moved out of execution.`,
        };
      }
      if (input.action === "retry_original") {
        updateTaskState("ready");
        rejectDraftChildren();
        return {
          cardStatus: "ready" as ProjectBoardCardStatus,
          proofReviewJson: null,
          splitOutcome: updatedOutcome("rejected"),
          eventTitle: "Original card queued for retry",
          eventSummary: `${current.title} returned to Ready and split follow-ups were rejected.`,
        };
      }
      if (input.action === "merge_followups") {
        updateTaskState("ready");
        rejectDraftChildren();
        const mergedCriteria = normalizeCardTextList(
          [...current.acceptanceCriteria, ...splitOutcome.remainingCriteria, ...childCards.flatMap((child) => child.acceptanceCriteria)],
          30,
        );
        const mergedLabels = normalizeTaskLabels([...current.labels, ...childCards.flatMap((child) => child.labels), "merged-follow-up"]);
        this.db
          .prepare("UPDATE project_board_cards SET acceptance_criteria_json = ?, labels_json = ? WHERE id = ?")
          .run(JSON.stringify(mergedCriteria), JSON.stringify(mergedLabels), current.id);
        return {
          cardStatus: "ready" as ProjectBoardCardStatus,
          proofReviewJson: null,
          splitOutcome: updatedOutcome("rejected"),
          eventTitle: "Split follow-ups merged into parent",
          eventSummary: `${current.title} returned to Ready with follow-up criteria merged back into the original card.`,
        };
      }
      if (input.action === "mark_replaced") {
        updateTaskState("done");
        return {
          cardStatus: "done" as ProjectBoardCardStatus,
          proofReviewJson: JSON.stringify(
            closureReview(
              "replaced",
              `${current.title} was closed as replaced by split follow-up cards.${reason ? ` Reason: ${reason}` : ""}`,
            ),
          ),
          splitOutcome: updatedOutcome("replaced"),
          eventTitle: "Parent closed as replaced",
          eventSummary: `${current.title} was marked replaced by split follow-up cards.`,
        };
      }

      if (childCards.length === 0 || childCards.length !== splitOutcome.childCardIds.length) {
        throw new Error("All split follow-up cards must be present before closing the parent as done via split.");
      }
      const openChildren = childCards.filter((child) => !childIsTerminal(child));
      if (openChildren.length > 0) {
        throw new Error(
          `Finish or mark represented split follow-up cards before closing the parent: ${openChildren.map((child) => child.title).join(", ")}`,
        );
      }
      updateTaskState("done");
      return {
        cardStatus: "done" as ProjectBoardCardStatus,
        proofReviewJson: JSON.stringify(
          closureReview(
            "done_via_split",
            `${current.title} was closed after its split follow-up cards reached terminal states.${reason ? ` Reason: ${reason}` : ""}`,
          ),
        ),
        splitOutcome: updatedOutcome("done_via_split"),
        eventTitle: "Parent closed via split",
        eventSummary: `${current.title} was closed because its split follow-up cards are complete or represented.`,
      };
    })();

    this.db
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = ?, split_outcome_json = ?, updated_at = ? WHERE id = ?")
      .run(next.cardStatus, next.proofReviewJson, JSON.stringify(next.splitOutcome), now, current.id);
    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_split",
      title: next.eventTitle,
      summary: next.eventSummary,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        taskId: task?.id,
        action: input.action,
        reason,
        splitOutcomeStatus: next.splitOutcome.status,
        sourceRunId: splitOutcome.sourceRunId,
        childCardIds: splitOutcome.childCardIds,
      },
      createdAt: now,
    });
    this.deps.syncProjectBoardTaskBlockers(current.boardId);
    this.deps.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(current.id);
  }

  private getProjectBoardCard(cardId: string): ProjectBoardCard {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
    if (!row) throw new Error(`Project board card not found: ${cardId}`);
    return mapProjectBoardCardRow(row, this.deps.listOrchestrationTasks());
  }

  private tryGetProjectBoardCard(cardId: string): ProjectBoardCard | undefined {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
    return row ? mapProjectBoardCardRow(row, this.deps.listOrchestrationTasks()) : undefined;
  }

  private touchBoard(boardId: string, updatedAt: string): void {
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
  }
}
