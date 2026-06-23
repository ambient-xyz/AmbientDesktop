import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ProjectBoardCard, ProjectBoardSource, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import {
  mapProjectBoardCardRow,
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeTaskLabels,
  plannerPlanCandidateStatus,
  plannerPlanClarificationDecisions,
  plannerPlanClarificationQuestions,
  plannerPlanDraftCards,
} from "./projectBoardMappers";
import { hashProjectBoardSourceContent } from "./projectStoreProjectBoardFacade";
import {
  plannerPlanArtifactSourceContent,
  readManagedBoardPlanContent,
  type ProjectBoardCardRow,
  type ProjectBoardEventInput,
} from "./projectStoreFacadeHelpers";

export interface ProjectStoreProjectBoardPlannerPlanPromotionRepositoryDeps {
  appendProjectBoardEvent(input: ProjectBoardEventInput): void;
  createProjectBoard(input: { title?: string; summary?: string; replaceActive?: boolean; sourceThreadId?: string }): ProjectBoardSummary;
  getActiveProjectBoard(sourceThreadId?: string): ProjectBoardSummary | undefined;
  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact;
  getProjectArtifactWorkspacePath(): string;
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  getProjectBoardCard(cardId: string): ProjectBoardCard;
  promotePlannerDurableArtifactToBoardSource(artifactId: string): ProjectBoardSource | undefined;
}

export class ProjectStoreProjectBoardPlannerPlanPromotionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardPlannerPlanPromotionRepositoryDeps,
  ) {}

  projectBoardExecutingPlannerPlanCard(boardId: string): ProjectBoardCard | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND source_kind = 'planner_plan'
           AND (orchestration_task_id IS NOT NULL OR status IN ('ready', 'in_progress', 'review'))
           AND candidate_status NOT IN ('evidence', 'duplicate', 'rejected')
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(boardId) as ProjectBoardCardRow | undefined;
    return row ? mapProjectBoardCardRow(row) : undefined;
  }

  parkAutomaticPlanningForExecutingPlanCard(boardId: string): ProjectBoardCard | undefined {
    const card = this.projectBoardExecutingPlannerPlanCard(boardId);
    if (!card) return undefined;
    this.deps.appendProjectBoardEvent({
      boardId,
      kind: "board_synthesized",
      title: "Automatic planning parked",
      summary: `Skipped the automatic planning pass because "${card.title}" is already ${card.orchestrationTaskId ? "ticketized" : "executing"}; planning now would propose duplicate cards for in-flight work. Use Revise Board if you still want step cards.`,
      entityKind: "project_board",
      entityId: boardId,
      metadata: { planningParked: true, executingPlannerPlanCardId: card.id },
      createdAt: new Date().toISOString(),
    });
    return card;
  }

  promotePlannerPlanToBoard(artifactId: string): ProjectBoardCard {
    const artifact = this.deps.getPlannerPlanArtifact(artifactId);
    if (artifact.status !== "ready") throw new Error("Only ready planner plans can be added to the project board.");
    let board = this.deps.getActiveProjectBoard(artifact.threadId);
    if (artifact.durableArtifactPath) {
      const linkedSource = this.deps.promotePlannerDurableArtifactToBoardSource(artifact.id);
      if (linkedSource) board = this.deps.getProjectBoard(linkedSource.boardId) ?? board;
    }
    board ??= this.deps.createProjectBoard({
      title: `${artifact.title.trim() || "Planner plan"} board`,
      summary: artifact.summary.trim() || "Project board created from a durable planner plan.",
      sourceThreadId: artifact.threadId,
    });
    const draftCards = plannerPlanDraftCards(artifact);

    const existing = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND source_kind = 'planner_plan'
           AND (source_id = ? OR source_id LIKE ?)
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(board.id, artifact.id, `${artifact.id}#step:%`) as ProjectBoardCardRow[];
    const replaceExistingPromotion =
      existing.length > 0 &&
      draftCards.length === 1 &&
      existing.some((row) => row.source_id.includes("#step:")) &&
      existing.every(
        (row) =>
          row.status === "draft" &&
          row.source_kind === "planner_plan" &&
          !row.orchestration_task_id &&
          !["evidence", "duplicate", "rejected"].includes(row.candidate_status) &&
          !row.user_touched_at &&
          (!row.user_touched_fields_json || row.user_touched_fields_json === "[]"),
      );
    if (existing.length > 0 && !replaceExistingPromotion) return this.deps.getProjectBoardCard(existing[0].id);

    const now = new Date().toISOString();
    const durablePlanContent = artifact.durableArtifactPath
      ? (readManagedBoardPlanContent(this.deps.getProjectArtifactWorkspacePath(), artifact.durableArtifactPath) ??
        plannerPlanArtifactSourceContent(artifact))
      : plannerPlanArtifactSourceContent(artifact);
    const durablePlanContentHash = hashProjectBoardSourceContent(durablePlanContent);
    const candidateStatus = plannerPlanCandidateStatus(artifact);
    const clarificationQuestions = plannerPlanClarificationQuestions(artifact);
    const clarificationDecisions = plannerPlanClarificationDecisions(artifact, now);
    const replacedCardIds = replaceExistingPromotion ? existing.map((row) => row.id) : [];
    const promotedPlanTitle = artifact.title.trim() || "Planner plan";
    const promotionTitle = replacedCardIds.length > 0 ? "Plan draft refreshed" : "Plan added to board";
    const promotionSummary =
      replacedCardIds.length > 0
        ? `${promotedPlanTitle} replaced ${replacedCardIds.length} untouched step candidate${replacedCardIds.length === 1 ? "" : "s"} with a compact draft inbox card.`
        : draftCards.length === 1
          ? `${promotedPlanTitle} entered the draft inbox as a candidate card.`
          : `${promotedPlanTitle} entered the draft inbox as ${draftCards.length} linked candidate cards.`;
    const createdIds: string[] = [];
    const transaction = this.db.transaction(() => {
      if (replacedCardIds.length > 0) {
        const deleteCard = this.db.prepare("DELETE FROM project_board_cards WHERE id = ? AND board_id = ?");
        for (const cardId of replacedCardIds) deleteCard.run(cardId, board.id);
      }
      const insert = this.db.prepare(
        `INSERT INTO project_board_cards
        (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
         acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id,
         source_message_id, orchestration_task_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const draft of draftCards) {
        const id = randomUUID();
        createdIds.push(id);
        insert.run(
          id,
          board.id,
          draft.title,
          draft.description,
          "draft",
          candidateStatus,
          null,
          null,
          JSON.stringify(normalizeTaskLabels(draft.labels)),
          JSON.stringify(draft.blockedBy),
          JSON.stringify(normalizeCardTextList(draft.acceptanceCriteria, 30)),
          JSON.stringify(normalizeProjectBoardCardTestPlan(draft.testPlan)),
          JSON.stringify(clarificationQuestions),
          JSON.stringify(clarificationDecisions),
          "planner_plan",
          draft.sourceId,
          artifact.threadId,
          artifact.sourceMessageId,
          null,
          now,
          now,
        );
      }

      this.deps.appendProjectBoardEvent({
        boardId: board.id,
        kind: "plan_promoted",
        title: promotionTitle,
        summary: promotionSummary,
        entityKind: "project_board_card",
        entityId: createdIds[0],
        metadata: {
          artifactId: artifact.id,
          threadId: artifact.threadId,
          sourceMessageId: artifact.sourceMessageId,
          durablePlanPath: artifact.durableArtifactPath,
          durablePlanContentHash,
          durablePlanGeneratedAt: artifact.durableArtifactGeneratedAt,
          candidateStatus,
          cardIds: createdIds,
          replacedCardIds,
          cardCount: createdIds.length,
          decomposition: draftCards.length === 1 ? "single_card" : "plan_steps",
        },
        createdAt: now,
      });
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    });
    transaction();
    return this.deps.getProjectBoardCard(createdIds[0]);
  }
}
