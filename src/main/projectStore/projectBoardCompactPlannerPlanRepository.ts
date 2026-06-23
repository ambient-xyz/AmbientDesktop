import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ProjectBoardEvent, ProjectBoardQuestion, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import {
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeTaskLabels,
  plannerPlanCandidateStatus,
  plannerPlanClarificationDecisions,
  plannerPlanClarificationQuestions,
  plannerPlanDraftCards,
  plannerPlanShouldStayCompact,
} from "./projectBoardMappers";
import {
  compactPlannerPlanKickoffAnswer,
  type ProjectBoardCardRow,
  type ProjectBoardRow,
} from "./projectStoreFacadeHelpers";

export type ProjectBoardCompactPlannerPlanEventInput = Omit<ProjectBoardEvent, "id" | "createdAt" | "metadata"> & {
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export interface ProjectStoreProjectBoardCompactPlannerPlanRepositoryDeps {
  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact;
  ensureProjectBoardQuestions(boardId: string): ProjectBoardQuestion[];
  finalizeProjectBoardKickoff(boardId: string): ProjectBoardSummary;
  appendProjectBoardEvent(input: ProjectBoardCompactPlannerPlanEventInput): void;
}

export class ProjectStoreProjectBoardCompactPlannerPlanRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCompactPlannerPlanRepositoryDeps,
  ) {}

  reconcileCompactPlannerPlanDraftBoard(boardRow: ProjectBoardRow): boolean {
    if (boardRow.status !== "draft") return false;
    const existing = this.db
      .prepare("SELECT * FROM project_board_cards WHERE board_id = ? ORDER BY created_at ASC, rowid ASC")
      .all(boardRow.id) as ProjectBoardCardRow[];
    const artifactId = this.compactPlannerPlanArtifactIdForRows(existing);
    if (!artifactId) return false;

    let artifact: PlannerPlanArtifact;
    try {
      artifact = this.deps.getPlannerPlanArtifact(artifactId);
    } catch {
      return false;
    }
    const draftCards = plannerPlanDraftCards(artifact);
    if (artifact.status !== "ready" || draftCards.length !== 1 || !plannerPlanShouldStayCompact(artifact)) return false;

    const alreadyCompact = existing.length === 1 && existing[0]?.source_id === artifact.id;
    const shouldReplaceCards = !alreadyCompact;
    const questions = this.deps.ensureProjectBoardQuestions(boardRow.id);
    const unansweredQuestions = questions.filter((question) => question.required && !question.answer?.trim());

    const now = new Date().toISOString();
    const candidateStatus = plannerPlanCandidateStatus(artifact);
    const clarificationQuestions = plannerPlanClarificationQuestions(artifact);
    const clarificationDecisions = plannerPlanClarificationDecisions(artifact, now);
    const compactCard = draftCards[0];
    const compactLabelsJson = JSON.stringify(normalizeTaskLabels(compactCard.labels));
    const compactBlockedByJson = JSON.stringify(compactCard.blockedBy);
    const compactAcceptanceCriteriaJson = JSON.stringify(normalizeCardTextList(compactCard.acceptanceCriteria, 30));
    const compactTestPlanJson = JSON.stringify(normalizeProjectBoardCardTestPlan(compactCard.testPlan));
    const compactClarificationQuestionsJson = JSON.stringify(clarificationQuestions);
    const compactClarificationDecisionsJson = JSON.stringify(clarificationDecisions);
    const compactRow = alreadyCompact ? existing[0] : undefined;
    const shouldUpdateCompactCard = Boolean(
      compactRow &&
        (compactRow.title !== compactCard.title ||
          compactRow.description !== compactCard.description ||
          compactRow.candidate_status !== candidateStatus ||
          compactRow.labels_json !== compactLabelsJson ||
          compactRow.blocked_by_json !== compactBlockedByJson ||
          compactRow.acceptance_criteria_json !== compactAcceptanceCriteriaJson ||
          compactRow.test_plan_json !== compactTestPlanJson ||
          compactRow.clarification_questions_json !== compactClarificationQuestionsJson ||
          compactRow.clarification_decisions_json !== compactClarificationDecisionsJson),
    );
    if (!shouldReplaceCards && unansweredQuestions.length === 0 && !shouldUpdateCompactCard) return false;

    const createdIds: string[] = [];
    const replacedCardIds = shouldReplaceCards ? existing.map((row) => row.id) : [];
    const transaction = this.db.transaction(() => {
      if (shouldReplaceCards) {
        const deleteCard = this.db.prepare("DELETE FROM project_board_cards WHERE id = ? AND board_id = ?");
        for (const cardId of replacedCardIds) deleteCard.run(cardId, boardRow.id);
        const compactCardId = randomUUID();
        createdIds.push(compactCardId);
        this.db
          .prepare(
            `INSERT INTO project_board_cards
            (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
             acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id,
             source_message_id, orchestration_task_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            compactCardId,
            boardRow.id,
            compactCard.title,
            compactCard.description,
            "draft",
            candidateStatus,
            null,
            null,
            compactLabelsJson,
            compactBlockedByJson,
            compactAcceptanceCriteriaJson,
            compactTestPlanJson,
            compactClarificationQuestionsJson,
            compactClarificationDecisionsJson,
            "planner_plan",
            compactCard.sourceId,
            artifact.threadId,
            artifact.sourceMessageId,
            null,
            now,
            now,
          );
      } else if (compactRow && shouldUpdateCompactCard) {
        this.db
          .prepare(
            `UPDATE project_board_cards
             SET title = ?,
                 description = ?,
                 candidate_status = ?,
                 labels_json = ?,
                 blocked_by_json = ?,
                 acceptance_criteria_json = ?,
                 test_plan_json = ?,
                 clarification_questions_json = ?,
                 clarification_decisions_json = ?,
                 source_thread_id = ?,
                 source_message_id = ?,
                 updated_at = ?
             WHERE id = ?
               AND board_id = ?
               AND status = 'draft'
               AND source_kind = 'planner_plan'
               AND orchestration_task_id IS NULL`,
          )
          .run(
            compactCard.title,
            compactCard.description,
            candidateStatus,
            compactLabelsJson,
            compactBlockedByJson,
            compactAcceptanceCriteriaJson,
            compactTestPlanJson,
            compactClarificationQuestionsJson,
            compactClarificationDecisionsJson,
            artifact.threadId,
            artifact.sourceMessageId,
            now,
            compactRow.id,
            boardRow.id,
          );
      }

      const answerQuestion = this.db.prepare("UPDATE project_board_questions SET answer = ?, answered_at = ?, updated_at = ? WHERE id = ? AND board_id = ?");
      unansweredQuestions.forEach((question, index) => {
        answerQuestion.run(compactPlannerPlanKickoffAnswer(artifact, question.question, index), now, now, question.id, boardRow.id);
      });

      this.deps.appendProjectBoardEvent({
        boardId: boardRow.id,
        kind: "plan_promoted",
        title: shouldReplaceCards ? "Compact plan recovered" : shouldUpdateCompactCard ? "Compact plan draft normalized" : "Compact plan charter completed",
        summary: shouldReplaceCards
          ? `${artifact.title.trim() || "Planner plan"} replaced ${replacedCardIds.length} untouched step candidate${replacedCardIds.length === 1 ? "" : "s"} with one compact candidate and completed kickoff from the durable plan.`
          : shouldUpdateCompactCard
            ? `${artifact.title.trim() || "Planner plan"} refreshed the compact candidate and completed kickoff from the durable plan.`
            : `${artifact.title.trim() || "Planner plan"} completed kickoff from the compact durable plan.`,
        entityKind: "project_board",
        entityId: boardRow.id,
        metadata: {
          artifactId: artifact.id,
          cardIds: createdIds,
          updatedCardIds: compactRow && shouldUpdateCompactCard ? [compactRow.id] : [],
          replacedCardIds,
          answeredQuestionIds: unansweredQuestions.map((question) => question.id),
          decomposition: "single_card",
          autoFinalizedCompactPlan: true,
        },
        createdAt: now,
      });
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardRow.id);
    });
    transaction();
    this.deps.finalizeProjectBoardKickoff(boardRow.id);
    return true;
  }

  private compactPlannerPlanArtifactIdForRows(rows: ProjectBoardCardRow[]): string | undefined {
    if (rows.length === 0) return undefined;
    const artifactIds = new Set<string>();
    for (const row of rows) {
      if (
        row.status !== "draft" ||
        row.source_kind !== "planner_plan" ||
        row.orchestration_task_id ||
        ["evidence", "duplicate", "rejected"].includes(row.candidate_status) ||
        row.user_touched_at ||
        (row.user_touched_fields_json && row.user_touched_fields_json !== "[]")
      ) {
        return undefined;
      }
      const artifactId = row.source_id.includes("#step:") ? row.source_id.slice(0, row.source_id.indexOf("#step:")) : row.source_id;
      if (!artifactId.trim()) return undefined;
      artifactIds.add(artifactId);
    }
    return artifactIds.size === 1 ? [...artifactIds][0] : undefined;
  }
}
