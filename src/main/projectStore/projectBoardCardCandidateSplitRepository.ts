import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import {
  mapProjectBoardCardRow,
  normalizeCardTextList,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeTaskLabels,
  splitProjectBoardCardDescription,
  type ProjectBoardCardStoreRow,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardCardCandidateSplitRepositoryDeps {
  listOrchestrationTasks(): OrchestrationTask[];
  appendProjectBoardEvent(input: ProjectBoardCardMutationEventInput): void;
}

export class ProjectStoreProjectBoardCardCandidateSplitRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardCandidateSplitRepositoryDeps,
  ) {}

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

  private getProjectBoardCard(cardId: string): ProjectBoardCard {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
    if (!row) throw new Error(`Project board card not found: ${cardId}`);
    return mapProjectBoardCardRow(row, this.deps.listOrchestrationTasks());
  }

  private touchBoard(boardId: string, updatedAt: string): void {
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
  }
}
