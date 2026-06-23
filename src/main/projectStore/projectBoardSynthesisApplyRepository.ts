import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardEvent,
  ProjectBoardPlanningSnapshot,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { projectBoardSynthesisCardThreadId, type ProjectBoardSynthesisApplyOptions } from "./projectStoreFacadeHelpers";
import {
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardUiMockRole,
  normalizeTaskLabels,
  normalizeTaskReferences,
  objectiveProvenanceJson,
  projectBoardRequiresUiMockApprovalForSynthesisCard,
  projectBoardUiMockRoleForSynthesisCard,
  type ProjectBoardCardStoreRow,
  type ProjectBoardCharterStoreRow,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";
import { buildProjectBoardSynthesisApplyPlan } from "./projectBoardSynthesisApplyPlan";
import { ProjectStoreProjectBoardSynthesisProposalApplyRepository } from "./projectBoardSynthesisProposalApplyRepository";

export type ProjectBoardSynthesisApplyEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardSynthesisApplyRepositoryDeps {
  ensureProjectBoardQuestions(boardId: string): ProjectBoardQuestion[];
  listProjectBoardEvents(boardId: string): ProjectBoardEvent[];
  listProjectBoardSources(boardId: string): ProjectBoardSource[];
  listProjectBoardQuestions(boardId: string): ProjectBoardQuestion[];
  mapProjectBoard(row: ProjectBoardStoreRow): ProjectBoardSummary;
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  appendProjectBoardPlanningSnapshotForRun(
    runId: string,
    kind: ProjectBoardSynthesisApplyOptions["snapshotKind"],
  ): ProjectBoardPlanningSnapshot | undefined;
  appendProjectBoardEvent(input: ProjectBoardSynthesisApplyEventInput): void;
}

export class ProjectStoreProjectBoardSynthesisApplyRepository {
  private readonly proposalApplyRepository: ProjectStoreProjectBoardSynthesisProposalApplyRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSynthesisApplyRepositoryDeps,
  ) {
    this.proposalApplyRepository = new ProjectStoreProjectBoardSynthesisProposalApplyRepository(db, deps, {
      applyProjectBoardSynthesis: (boardId, synthesis, options) => this.applyProjectBoardSynthesis(boardId, synthesis, options),
    });
  }

  applyProjectBoardSynthesis(
    boardId: string,
    synthesis: ProjectBoardSynthesisDraft,
    options: ProjectBoardSynthesisApplyOptions = {},
  ): ProjectBoardSummary {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be synthesized.");
    this.deps.ensureProjectBoardQuestions(boardId);

    const now = new Date().toISOString();
    const activeCharterRow = board.charter_id
      ? (this.db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(board.charter_id) as
          | ProjectBoardCharterStoreRow
          | undefined)
      : undefined;
    const synthesisPlan = buildProjectBoardSynthesisApplyPlan({
      board,
      synthesis,
      options,
      now,
      existingSynthesisRows: this.db
        .prepare(
          `SELECT * FROM project_board_cards
           WHERE board_id = ? AND source_kind = 'board_synthesis'`,
        )
        .all(boardId) as ProjectBoardCardStoreRow[],
      existingQuestions: this.deps.listProjectBoardQuestions(boardId),
      boardSources: this.deps.listProjectBoardSources(boardId),
      boardEvents: options.replaceExistingDraft ? this.deps.listProjectBoardEvents(boardId) : [],
      activeCharterRow,
    });
    synthesis = synthesisPlan.synthesis;
    const {
      boardSources,
      boardSourceThreadId,
      existingSynthesisRows,
      pendingPiUpdates,
      cardsToUpdate,
      cardsToInsert,
      deleteStaleDraftCards,
      staleReplaceableDraftCardIds,
      questionsToInsert,
      markdown,
      mergedBudgetPolicy,
      synthesizedSourcePolicy,
      synthesizedCharterSummary,
    } = synthesisPlan;
    const maxOrder = this.db
      .prepare("SELECT COALESCE(MAX(question_order), -1) AS question_order FROM project_board_questions WHERE board_id = ?")
      .get(boardId) as { question_order: number };
    const insertedCardIds: string[] = [];
    const updatedCardIds: string[] = [];
    const preservedDraftCardIds = new Set<string>();
    const coveredPlannerPlanCardIds: string[] = [];
    const insertedQuestionIds: string[] = [];
    const protectedPiUpdateCardIds: string[] = [];
    const protectedPiUpdateSourceIds: string[] = [];
    const transaction = this.db.transaction(() => {
      if (pendingPiUpdates.length > 0) {
        const updatePendingPi = this.db.prepare(
          `UPDATE project_board_cards
           SET pending_pi_update_json = ?,
               updated_at = ?
           WHERE id = ?`,
        );
        for (const entry of pendingPiUpdates) {
          const result = updatePendingPi.run(JSON.stringify(entry.update), now, entry.cardId);
          if (result.changes <= 0) continue;
          protectedPiUpdateCardIds.push(entry.cardId);
          protectedPiUpdateSourceIds.push(entry.update.sourceId);
          this.deps.appendProjectBoardEvent({
            boardId,
            kind: "card_updated",
            title: "Pi update available",
            summary: `Pi proposed updates to a protected card (${entry.update.changedFields.join(", ")}).`,
            entityKind: "project_board_card",
            entityId: entry.cardId,
            metadata: {
              cardId: entry.cardId,
              sourceId: entry.update.sourceId,
              changedFields: entry.update.changedFields,
              protectedPiUpdate: true,
            },
            createdAt: now,
          });
        }
      }
      if (staleReplaceableDraftCardIds.length > 0) {
        const placeholders = staleReplaceableDraftCardIds.map(() => "?").join(", ");
        this.db.prepare(`DELETE FROM project_board_cards WHERE id IN (${placeholders})`).run(...staleReplaceableDraftCardIds);
      }
      if (board.charter_id) {
        this.db
          .prepare(
            `UPDATE project_board_charters
             SET goal = ?,
                 current_state = ?,
                 target_user = ?,
                 non_goals_json = ?,
                 quality_bar = ?,
                 test_policy_json = ?,
                 decision_policy_json = ?,
                 dependency_policy_json = ?,
                 budget_policy_json = ?,
                 source_policy_json = ?,
                 markdown = ?,
                 project_summary_json = ?,
                 updated_at = ?
             WHERE id = ?`,
          )
          .run(
            synthesis.goal.trim().slice(0, 2000),
            synthesis.currentState.trim().slice(0, 2000),
            synthesis.targetUser.trim().slice(0, 1000),
            JSON.stringify([]),
            synthesis.qualityBar.trim().slice(0, 2000),
            JSON.stringify({
              defaultProof: synthesis.qualityBar,
              requireProofSpec: true,
              unit: true,
              integration: true,
              visual: true,
              manual: true,
              proofScopeWarningPolicy: "advisory",
              synthesizedAt: now,
            }),
            JSON.stringify({ default: "ask_when_ambiguous", assumptions: synthesis.assumptions }),
            JSON.stringify({ ordering: "blockers_first", source: "board_synthesis", explicitBlockers: true }),
            JSON.stringify(mergedBudgetPolicy),
            JSON.stringify(synthesizedSourcePolicy),
            markdown,
            JSON.stringify(synthesizedCharterSummary),
            now,
            board.charter_id,
          );
      }

      const insertQuestion = this.db.prepare(
        `INSERT INTO project_board_questions
         (id, board_id, question_order, question, required, answer, answered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      questionsToInsert.forEach((question, index) => {
        const questionId = randomUUID();
        insertedQuestionIds.push(questionId);
        insertQuestion.run(questionId, boardId, maxOrder.question_order + index + 1, question, 1, null, null, now, now);
      });

      const insertCard = this.db.prepare(
        `INSERT OR IGNORE INTO project_board_cards
        (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
         acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json, clarification_suggestions_json, clarification_decisions_json,
         source_kind, source_id, source_thread_id,
         source_message_id, orchestration_task_id, objective_provenance_json, ui_mock_role, requires_ui_mock_approval, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const updateReplaceableCard = this.db.prepare(
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
             clarification_decisions_json = ?,
             objective_provenance_json = ?,
             ui_mock_role = ?,
             requires_ui_mock_approval = ?,
             pending_pi_update_json = NULL,
             updated_at = ?
         WHERE id = ?
           AND board_id = ?
           AND status = 'draft'
           AND source_kind = 'board_synthesis'
           AND orchestration_task_id IS NULL`,
      );
      for (const entry of cardsToUpdate) {
        preservedDraftCardIds.add(entry.existing.id);
        if (!entry.update) continue;
        const result = updateReplaceableCard.run(
          entry.update.title,
          entry.update.description,
          entry.update.candidateStatus,
          entry.update.priority ?? null,
          entry.update.phase ?? null,
          JSON.stringify(entry.update.labels),
          JSON.stringify(entry.update.blockedBy),
          JSON.stringify(entry.update.acceptanceCriteria),
          JSON.stringify(entry.update.testPlan),
          JSON.stringify(entry.update.sourceRefs),
          JSON.stringify(entry.update.clarificationQuestions),
          JSON.stringify(normalizeProjectBoardClarificationSuggestions(entry.update.clarificationSuggestions ?? [], [])),
          JSON.stringify(entry.update.clarificationDecisions ?? []),
          objectiveProvenanceJson(entry.update.objectiveProvenance),
          normalizeProjectBoardUiMockRole(entry.update.uiMockRole) ?? null,
          entry.update.requiresUiMockApproval ? 1 : 0,
          now,
          entry.existing.id,
          boardId,
        );
        if (result.changes > 0) updatedCardIds.push(entry.existing.id);
      }
      for (const card of cardsToInsert) {
        const cardId = randomUUID();
        const clarification = normalizeProjectBoardSynthesisClarificationFields({
          clarificationQuestions: card.clarificationQuestions,
          clarificationSuggestions: card.clarificationSuggestions,
          clarificationDecisions: card.clarificationDecisions,
          createdAt: now,
          updatedAt: now,
        });
        const result = insertCard.run(
          cardId,
          boardId,
          card.title.trim().slice(0, 180),
          card.description.trim().slice(0, 4000),
          "draft",
          card.candidateStatus,
          typeof card.priority === "number" ? Math.max(1, Math.round(card.priority)) : null,
          card.phase?.trim().slice(0, 120) || null,
          JSON.stringify(normalizeTaskLabels(card.labels)),
          JSON.stringify(normalizeTaskReferences(card.blockedBy)),
          JSON.stringify(normalizeCardTextList(card.acceptanceCriteria, 30)),
          JSON.stringify(normalizeProjectBoardCardTestPlan(card.testPlan)),
          JSON.stringify(normalizeCardTextList(card.sourceRefs, 20)),
          JSON.stringify(clarification.clarificationQuestions),
          JSON.stringify(clarification.clarificationSuggestions),
          JSON.stringify(clarification.clarificationDecisions),
          "board_synthesis",
          card.sourceId.trim(),
          projectBoardSynthesisCardThreadId({ card, sources: boardSources, boardSourceThreadId }),
          null,
          null,
          objectiveProvenanceJson(card.objectiveProvenance),
          projectBoardUiMockRoleForSynthesisCard(card) ?? null,
          projectBoardRequiresUiMockApprovalForSynthesisCard(card) ? 1 : 0,
          now,
          now,
        );
        if (result.changes > 0) insertedCardIds.push(cardId);
      }
      if (options.coverPlannerPlanDrafts && (insertedCardIds.length + updatedCardIds.length > 0 || existingSynthesisRows.length > 0)) {
        const plannerPlanRows = this.db
          .prepare(
            `SELECT id, title FROM project_board_cards
             WHERE board_id = ?
               AND status = 'draft'
               AND source_kind = 'planner_plan'
               AND orchestration_task_id IS NULL
               AND candidate_status NOT IN ('evidence', 'duplicate', 'rejected')
               AND user_touched_at IS NULL
               AND (user_touched_fields_json IS NULL OR user_touched_fields_json = '[]')`,
          )
          .all(boardId) as Array<{ id: string; title: string }>;
        const markCovered = this.db.prepare("UPDATE project_board_cards SET candidate_status = 'evidence', updated_at = ? WHERE id = ?");
        for (const row of plannerPlanRows) {
          const result = markCovered.run(now, row.id);
          if (result.changes <= 0) continue;
          coveredPlannerPlanCardIds.push(row.id);
          this.deps.appendProjectBoardEvent({
            boardId,
            kind: "card_updated",
            title: "Planner plan covered by synthesis",
            summary: `${row.title} was marked covered because Ambient/Pi created actionable board-synthesis candidate cards from the plan source.`,
            entityKind: "project_board_card",
            entityId: row.id,
            metadata: { cardId: row.id, candidateStatus: "evidence", coveredBySynthesisCardIds: [...updatedCardIds, ...insertedCardIds] },
            createdAt: now,
          });
        }
      }

      this.db
        .prepare("UPDATE project_boards SET summary = ?, updated_at = ? WHERE id = ?")
        .run((synthesis.summary || board.summary).trim().slice(0, 500), now, boardId);
      this.deps.appendProjectBoardEvent({
        boardId,
        kind: "board_synthesized",
        title: "Board synthesis applied",
        summary: `${insertedCardIds.length + updatedCardIds.length} candidate card${insertedCardIds.length + updatedCardIds.length === 1 ? "" : "s"} and ${insertedQuestionIds.length} kickoff question${insertedQuestionIds.length === 1 ? "" : "s"} applied from project sources.`,
        entityKind: "project_board",
        entityId: boardId,
        metadata: {
          cardIds: insertedCardIds,
          updatedCardIds,
          appliedCardIds: [...updatedCardIds, ...insertedCardIds],
          questionIds: insertedQuestionIds,
          skippedDuplicateCards: cardsToInsert.length - insertedCardIds.length,
          replacedDraftCardCount: staleReplaceableDraftCardIds.length,
          staleDraftDeletionSkipped: options.replaceExistingDraft === true && !deleteStaleDraftCards,
          updatedDraftCardCount: updatedCardIds.length,
          coveredPlannerPlanCardIds,
          coveredPlannerPlanCardCount: coveredPlannerPlanCardIds.length,
          preservedDraftCardIds: Array.from(preservedDraftCardIds),
          preservedDraftCardCount: preservedDraftCardIds.size,
          protectedPiUpdateCardIds,
          protectedPiUpdateSourceIds,
          protectedPiUpdateCount: protectedPiUpdateCardIds.length,
          sourceNotes: synthesis.sourceNotes,
          assumptions: synthesis.assumptions,
          cardSources: synthesis.cards.map((card) => ({ sourceId: card.sourceId, sourceRefs: card.sourceRefs })),
          cardClarificationQuestions: synthesis.cards.map((card) => ({
            sourceId: card.sourceId,
            clarificationQuestions: card.clarificationQuestions ?? [],
          })),
        },
        createdAt: now,
      });
    });
    transaction();
    const updated = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!updated) throw new Error(`Project board not found after synthesis: ${boardId}`);
    let summary = this.deps.mapProjectBoard(updated);
    if (options.snapshotRunId) {
      this.deps.appendProjectBoardPlanningSnapshotForRun(options.snapshotRunId, options.snapshotKind ?? "manual");
      summary = this.deps.getProjectBoard(boardId) ?? summary;
    }
    return summary;
  }

  applyProjectBoardSynthesisProposal(input: { proposalId: string; replaceExistingDraft?: boolean }): ProjectBoardSummary {
    return this.proposalApplyRepository.applyProjectBoardSynthesisProposal(input);
  }
}
