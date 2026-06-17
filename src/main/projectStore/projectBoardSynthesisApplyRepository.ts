import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardEvent,
  ProjectBoardPlanningSnapshot,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import { dedupeProjectBoardQuestions, projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import type { ProjectBoardSynthesisDraft } from "../project-board/projectBoardSynthesis";
import { parseJsonObject } from "./projectStoreJson";
import {
  MAX_PROJECT_BOARD_SYNTHESIS_CARDS,
  projectBoardSynthesisCardAllowedForBoardSources,
  projectBoardSynthesisCardThreadId,
  type ProjectBoardSynthesisApplyOptions,
} from "./projectStoreFacadeHelpers";
import {
  buildProjectBoardCharterProjectSummary,
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardUiMockRole,
  normalizeTaskLabels,
  normalizeTaskReferences,
  objectiveProvenanceJson,
  projectBoardClaimSummaryFromEvents,
  projectBoardCardPendingPiUpdateFromSynthesisCard,
  projectBoardRequiresUiMockApprovalForSynthesisCard,
  mapProjectBoardSynthesisProposalRow,
  projectBoardSynthesisCardRowProtectedFromDraftReplacement,
  projectBoardSynthesisDraftWithSourceIdNamespace,
  projectBoardSynthesisMarkdown,
  projectBoardSynthesisStartFreshCardSnapshot,
  projectBoardUiMockRoleForSynthesisCard,
  type ProjectBoardCardStoreRow,
  type ProjectBoardCharterStoreRow,
  type ProjectBoardSynthesisProposalStoreRow,
  type ProjectBoardSynthesisRunStoreRow,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";

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

export interface SupersedeProjectBoardSynthesisCardsForStartFreshResult {
  supersededDraftCardIds: string[];
  demotedPreservedCardIds: string[];
  preservedCardIds: string[];
}

export class ProjectStoreProjectBoardSynthesisApplyRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSynthesisApplyRepositoryDeps,
  ) {}

  applyProjectBoardSynthesis(
    boardId: string,
    synthesis: ProjectBoardSynthesisDraft,
    options: ProjectBoardSynthesisApplyOptions = {},
  ): ProjectBoardSummary {
    synthesis = projectBoardSynthesisDraftWithSourceIdNamespace(synthesis, options.sourceIdNamespace);
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be synthesized.");
    this.deps.ensureProjectBoardQuestions(boardId);

    const now = new Date().toISOString();
    const existingSynthesisRows = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ? AND source_kind = 'board_synthesis'`,
      )
      .all(boardId) as ProjectBoardCardStoreRow[];
    const claimSummary = options.replaceExistingDraft ? projectBoardClaimSummaryFromEvents(this.deps.listProjectBoardEvents(boardId)) : undefined;
    const protectedClaimCardIds = new Set([
      ...(claimSummary?.active.map((claim) => claim.cardId) ?? []),
      ...(claimSummary?.conflicts.map((claim) => claim.cardId) ?? []),
    ]);
    const existingSynthesisRowsBySourceId = new Map(existingSynthesisRows.map((row) => [row.source_id, row]));
    const isProtectedExistingSynthesisCard = (row: ProjectBoardCardStoreRow) =>
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(row, protectedClaimCardIds);
    const protectedExistingCardRows = options.replaceExistingDraft
      ? existingSynthesisRows.filter(isProtectedExistingSynthesisCard)
      : existingSynthesisRows;
    const protectedExistingCardSourceIds = new Set(protectedExistingCardRows.map((row) => row.source_id));
    const replaceableExistingCardRows = options.replaceExistingDraft
      ? existingSynthesisRows.filter((row) => !isProtectedExistingSynthesisCard(row))
      : [];
    const replaceableExistingRowsBySourceId = new Map(replaceableExistingCardRows.map((row) => [row.source_id, row]));
    const boardSourceThreadId = board.source_thread_id?.trim() || undefined;
    const boardSources = this.deps.listProjectBoardSources(boardId);
    const pendingPiUpdates = options.replaceExistingDraft
      ? synthesis.cards
          .filter((card) => projectBoardSynthesisCardAllowedForBoardSources({ card, sources: boardSources, boardSourceThreadId }))
          .map((card) => {
            const existing = existingSynthesisRowsBySourceId.get(card.sourceId.trim());
            if (!existing || !isProtectedExistingSynthesisCard(existing)) return undefined;
            const update = projectBoardCardPendingPiUpdateFromSynthesisCard(existing, card, now);
            return update ? { cardId: existing.id, update } : undefined;
          })
          .filter((entry): entry is { cardId: string; update: ProjectBoardCardPendingPiUpdate } => Boolean(entry))
      : [];
    const candidateCards = synthesis.cards
      .filter((card) =>
        card.title.trim() &&
        card.sourceId.trim() &&
        !protectedExistingCardSourceIds.has(card.sourceId.trim()) &&
        projectBoardSynthesisCardAllowedForBoardSources({ card, sources: boardSources, boardSourceThreadId })
      )
      .slice(0, MAX_PROJECT_BOARD_SYNTHESIS_CARDS);
    const candidateCardSourceIds = new Set(candidateCards.map((card) => card.sourceId.trim()));
    const cardsToUpdate = options.replaceExistingDraft
      ? candidateCards.flatMap((card): { existing: ProjectBoardCardStoreRow; update: ProjectBoardCardPendingPiUpdate | undefined }[] => {
          const existing = replaceableExistingRowsBySourceId.get(card.sourceId.trim());
          if (!existing) return [];
          return [
            {
              existing,
              update: projectBoardCardPendingPiUpdateFromSynthesisCard(existing, card, now),
            },
          ];
        })
      : [];
    const cardsToInsert = candidateCards.filter((card) => !replaceableExistingRowsBySourceId.has(card.sourceId.trim()));
    const deleteStaleDraftCards = options.replaceExistingDraft ? (options.deleteStaleDraftCards ?? true) : false;
    const staleReplaceableDraftCardIds = deleteStaleDraftCards
      ? replaceableExistingCardRows.filter((row) => !candidateCardSourceIds.has(row.source_id)).map((row) => row.id)
      : [];
    const existingQuestions = this.deps.listProjectBoardQuestions(boardId);
    const existingQuestionTexts = existingQuestions.map((question) => question.question.trim());
    const questionsToInsert =
      options.insertQuestions === false
        ? []
        : dedupeProjectBoardQuestions(synthesis.questions, 8)
            .filter((question) => !existingQuestionTexts.some((existing) => projectBoardQuestionsAreNearDuplicates(existing, question)))
            .slice(0, 8);
    const summaryQuestions: ProjectBoardQuestion[] = [
      ...existingQuestions,
      ...questionsToInsert.map((question, index) => ({
        id: `pending-synthesis-question-${index + 1}`,
        boardId,
        question,
        required: true,
        createdAt: now,
        updatedAt: now,
      })),
    ];
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
    const markdown = projectBoardSynthesisMarkdown(board, synthesis);
    const activeCharterRow = board.charter_id
      ? (this.db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(board.charter_id) as ProjectBoardCharterStoreRow | undefined)
      : undefined;
    const existingBudgetPolicy = activeCharterRow ? parseJsonObject<Record<string, unknown>>(activeCharterRow.budget_policy_json, {}) : {};
    const synthesizedBudgetPolicy = {
      maxPassesPerCard: 6,
      maxRuntimeMsPerCard: 1_200_000,
      pauseOnTerminalBlocker: true,
    };
    const mergedBudgetPolicy = {
      ...synthesizedBudgetPolicy,
      ...existingBudgetPolicy,
    };
    const synthesizedSourcePolicy = {
      includeThreads: true,
      includeMarkdown: true,
      requireUserApproval: true,
      synthesizedAt: now,
      sourceNotes: synthesis.sourceNotes,
    };
    const synthesizedCharterSummary = buildProjectBoardCharterProjectSummary({
      board,
      questions: summaryQuestions,
      sources: boardSources,
      compiled: {
        goal: synthesis.goal.trim().slice(0, 2000),
        currentState: synthesis.currentState.trim().slice(0, 2000),
        targetUser: synthesis.targetUser.trim().slice(0, 1000),
        nonGoals: [],
        qualityBar: synthesis.qualityBar.trim().slice(0, 2000),
        testPolicy: {
          defaultProof: synthesis.qualityBar,
          requireProofSpec: true,
          unit: true,
          integration: true,
          visual: true,
          manual: true,
          proofScopeWarningPolicy: "advisory",
          synthesizedAt: now,
        },
        decisionPolicy: { default: "ask_when_ambiguous", assumptions: synthesis.assumptions },
        dependencyPolicy: { ordering: "blockers_first", source: "board_synthesis", explicitBlockers: true },
        budgetPolicy: mergedBudgetPolicy,
        sourcePolicy: synthesizedSourcePolicy,
        summary: synthesis.summary.trim().slice(0, 500),
        markdown,
      },
      generatedAt: now,
    });
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
            metadata: { cardId: entry.cardId, sourceId: entry.update.sourceId, changedFields: entry.update.changedFields, protectedPiUpdate: true },
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
          cardClarificationQuestions: synthesis.cards.map((card) => ({ sourceId: card.sourceId, clarificationQuestions: card.clarificationQuestions ?? [] })),
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
    const row = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
    if (row.status !== "pending") throw new Error(`Project board synthesis proposal is ${row.status}, not pending.`);
    const proposal = mapProjectBoardSynthesisProposalRow(row);
    if (proposal.reviewReport && proposal.cards.length === 0) {
      throw new Error("Lightweight PM review reports do not apply cards. Generate a draft board from the recommendation first.");
    }
    const pendingCards = proposal.cards.filter((card) => card.reviewStatus === "pending");
    if (pendingCards.length > 0) {
      throw new Error("Review every proposal card before applying accepted cards.");
    }
    const acceptedCards = proposal.cards.filter((card) => card.reviewStatus === "accepted");
    const mergedCards = proposal.cards.filter((card) => card.reviewStatus === "merged" && card.mergeTargetCardId);
    if (acceptedCards.length + mergedCards.length === 0) {
      throw new Error("Accept or merge at least one proposal card before applying.");
    }
    for (const card of mergedCards) {
      const target = this.db
        .prepare("SELECT id FROM project_board_cards WHERE id = ? AND board_id = ? AND status = 'draft' AND orchestration_task_id IS NULL")
        .get(card.mergeTargetCardId, proposal.boardId) as { id: string } | undefined;
      if (!target) throw new Error(`Merge target card is no longer an unlinked draft card: ${card.mergeTargetCardId}`);
    }
    const synthesis: ProjectBoardSynthesisDraft = {
      summary: proposal.summary,
      goal: proposal.goal,
      currentState: proposal.currentState,
      targetUser: proposal.targetUser,
      qualityBar: proposal.qualityBar,
      assumptions: proposal.assumptions,
      questions: proposal.questions,
      sourceNotes: proposal.sourceNotes,
      cards: acceptedCards.map((card) => ({
        sourceId: card.sourceId,
        title: card.title,
        description: card.description,
        candidateStatus: card.candidateStatus,
        priority: card.priority,
        phase: card.phase,
        labels: card.labels,
        blockedBy: card.blockedBy,
        acceptanceCriteria: card.acceptanceCriteria,
        testPlan: card.testPlan,
        sourceRefs: card.sourceRefs,
        clarificationQuestions: card.clarificationQuestions ?? [],
        clarificationSuggestions: card.clarificationSuggestions ?? [],
        clarificationDecisions: card.clarificationDecisions ?? [],
        objectiveProvenance: card.objectiveProvenance,
        uiMockRole: card.uiMockRole,
        requiresUiMockApproval: card.requiresUiMockApproval,
      })),
    };

    // Keep proposal apply aligned with the board-build path: once synthesis cards
    // exist, untouched planner-plan drafts become evidence instead of duplicate work.
    this.applyProjectBoardSynthesis(proposal.boardId, synthesis, {
      replaceExistingDraft: false,
      coverPlannerPlanDrafts: true,
    });
    const now = new Date().toISOString();
    const updateMergedCard = this.db.prepare(
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
           objective_provenance_json = COALESCE(?, objective_provenance_json),
           ui_mock_role = ?,
           requires_ui_mock_approval = ?,
           updated_at = ?
       WHERE id = ? AND board_id = ? AND status = 'draft' AND orchestration_task_id IS NULL`,
    );
    const mergedCardIds: string[] = [];
    for (const card of mergedCards) {
      const clarification = normalizeProjectBoardSynthesisClarificationFields({
        clarificationQuestions: card.clarificationQuestions,
        clarificationSuggestions: card.clarificationSuggestions,
        clarificationDecisions: card.clarificationDecisions,
        createdAt: now,
        updatedAt: now,
      });
      const result = updateMergedCard.run(
        card.title.trim().slice(0, 180),
        card.description.trim().slice(0, 4000),
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
        objectiveProvenanceJson(card.objectiveProvenance),
        normalizeProjectBoardUiMockRole(card.uiMockRole) ?? null,
        card.requiresUiMockApproval ? 1 : 0,
        now,
        card.mergeTargetCardId,
        proposal.boardId,
      );
      if (result.changes > 0 && card.mergeTargetCardId) mergedCardIds.push(card.mergeTargetCardId);
    }
    this.db
      .prepare("UPDATE project_board_synthesis_proposals SET status = 'applied', updated_at = ?, applied_at = ? WHERE id = ?")
      .run(now, now, input.proposalId);
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, proposal.boardId);
    const appliedPlanningSnapshot = this.appendProjectBoardPlanningSnapshotForProposal(proposal.boardId, proposal.id);
    this.deps.appendProjectBoardEvent({
      boardId: proposal.boardId,
      kind: "synthesis_proposal_applied",
      title: "Pi proposal accepted cards applied",
      summary: `${acceptedCards.length} accepted card${acceptedCards.length === 1 ? "" : "s"} applied and ${mergedCardIds.length} proposal card${mergedCardIds.length === 1 ? "" : "s"} merged.`,
      entityKind: "project_board_synthesis_proposal",
      entityId: proposal.id,
      metadata: {
        proposalId: proposal.id,
        acceptedSourceIds: acceptedCards.map((card) => card.sourceId),
        mergedSourceIds: mergedCards.map((card) => card.sourceId),
        mergedCardIds,
        deferredSourceIds: proposal.cards.filter((card) => card.reviewStatus === "deferred").map((card) => card.sourceId),
        rejectedSourceIds: proposal.cards.filter((card) => card.reviewStatus === "rejected").map((card) => card.sourceId),
        ...(appliedPlanningSnapshot
          ? {
              planningSnapshotId: appliedPlanningSnapshot.snapshot.id,
              planningSnapshotRunId: appliedPlanningSnapshot.runId,
              planningSnapshotKind: appliedPlanningSnapshot.snapshot.kind,
              planningSnapshotFingerprint: appliedPlanningSnapshot.snapshot.renderFingerprint,
              planningSnapshotCardIds: appliedPlanningSnapshot.snapshot.cardIds,
            }
          : {}),
      },
      createdAt: now,
    });
    const boardRow = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(proposal.boardId) as ProjectBoardStoreRow | undefined;
    if (!boardRow) throw new Error(`Project board not found after proposal apply: ${proposal.boardId}`);
    return this.deps.mapProjectBoard(boardRow);
  }

  private appendProjectBoardPlanningSnapshotForProposal(
    boardId: string,
    proposalId: string,
  ): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ?
           AND proposal_id = ?
           AND status IN ('paused', 'succeeded')
         ORDER BY updated_at DESC, started_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(boardId, proposalId) as ProjectBoardSynthesisRunStoreRow | undefined;
    if (!row) return undefined;
    const snapshot = this.deps.appendProjectBoardPlanningSnapshotForRun(row.id, row.status === "paused" ? "paused" : "final");
    return snapshot ? { runId: row.id, snapshot } : undefined;
  }

  supersedeProjectBoardSynthesisCardsForStartFresh(input: {
    boardId: string;
    runId: string;
    reason?: string;
  }): SupersedeProjectBoardSynthesisCardsForStartFreshResult {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND source_kind = 'board_synthesis'
           AND status != 'archived'`,
      )
      .all(input.boardId) as ProjectBoardCardStoreRow[];
    if (rows.length === 0) return { supersededDraftCardIds: [], demotedPreservedCardIds: [], preservedCardIds: [] };

    const claimSummary = projectBoardClaimSummaryFromEvents(this.deps.listProjectBoardEvents(input.boardId));
    const protectedClaimCardIds = new Set([
      ...claimSummary.active.map((claim) => claim.cardId),
      ...claimSummary.conflicts.map((claim) => claim.cardId),
    ]);
    const artifactRows = this.db
      .prepare("SELECT DISTINCT card_id FROM project_board_execution_artifacts WHERE board_id = ?")
      .all(input.boardId) as Array<{ card_id: string }>;
    const executionArtifactCardIds = new Set(artifactRows.map((row) => row.card_id));
    const isReplaceable = (row: ProjectBoardCardStoreRow): boolean =>
      !projectBoardSynthesisCardRowProtectedFromDraftReplacement(row, protectedClaimCardIds) &&
      !row.execution_thread_id &&
      !row.proof_review_json &&
      !row.split_outcome_json &&
      !executionArtifactCardIds.has(row.id);
    const replaceableRows = rows.filter(isReplaceable);
    const preservedRows = rows.filter((row) => !isReplaceable(row));
    const demotableRows = preservedRows.filter(
      (row) =>
        row.status === "ready" ||
        row.status === "in_progress" ||
        row.status === "blocked" ||
        Boolean(row.orchestration_task_id) ||
        Boolean(row.execution_thread_id) ||
        row.candidate_status === "ready_to_create",
    );
    const supersededDraftCardIds = replaceableRows.map((row) => row.id);
    const preservedCardIds = preservedRows.map((row) => row.id);
    const demotedPreservedCardIds = demotableRows.map((row) => row.id);
    const detachedTaskIds = demotableRows.map((row) => row.orchestration_task_id).filter((value): value is string => Boolean(value));
    const now = new Date().toISOString();
    const reason = input.reason?.trim() || "Start Fresh requested from a paused project-board synthesis run.";
    const archiveReplaceable = this.db.prepare(
      `UPDATE project_board_cards
       SET status = 'archived',
           candidate_status = 'duplicate',
           clarification_questions_json = '[]',
           clarification_answers_json = '[]',
           clarification_decisions_json = '[]',
           pending_pi_update_json = NULL,
           updated_at = ?
       WHERE id = ?`,
    );
    const demotePreserved = this.db.prepare(
      `UPDATE project_board_cards
       SET status = 'draft',
           candidate_status = CASE WHEN candidate_status = 'ready_to_create' THEN 'needs_clarification' ELSE candidate_status END,
           orchestration_task_id = NULL,
           execution_thread_id = NULL,
           pending_pi_update_json = NULL,
           updated_at = ?
       WHERE id = ?`,
    );
    const transaction = this.db.transaction(() => {
      for (const row of replaceableRows) archiveReplaceable.run(now, row.id);
      for (const row of demotableRows) demotePreserved.run(now, row.id);
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "card_updated",
        title: "Start Fresh cleared draft synthesis cards",
        summary: [
          supersededDraftCardIds.length
            ? `Superseded ${supersededDraftCardIds.length} untouched draft synthesis card${supersededDraftCardIds.length === 1 ? "" : "s"}.`
            : "No untouched draft synthesis cards needed superseding.",
          demotedPreservedCardIds.length
            ? `Moved ${demotedPreservedCardIds.length} preserved card${demotedPreservedCardIds.length === 1 ? "" : "s"} back to non-active review.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        entityKind: "project_board_synthesis_run",
        entityId: input.runId,
        metadata: {
          decision: "start_fresh_supersede_drafts",
          abandonedRunId: input.runId,
          reason,
          supersededDraftCardIds,
          supersededDraftCardCount: supersededDraftCardIds.length,
          supersededDraftCards: replaceableRows.slice(0, 80).map(projectBoardSynthesisStartFreshCardSnapshot),
          preservedCardIds,
          preservedCardCount: preservedCardIds.length,
          preservedCards: preservedRows.slice(0, 80).map(projectBoardSynthesisStartFreshCardSnapshot),
          demotedPreservedCardIds,
          demotedPreservedCardCount: demotedPreservedCardIds.length,
          detachedTaskIds,
        },
        createdAt: now,
      });
    });
    transaction();
    return { supersededDraftCardIds, demotedPreservedCardIds, preservedCardIds };
  }
}
