import type Database from "better-sqlite3";
import type {
  ProjectBoardEvent,
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import type { ProjectBoardSynthesisApplyOptions } from "./projectStoreFacadeHelpers";
import {
  mapProjectBoardSynthesisProposalRow,
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardUiMockRole,
  normalizeTaskLabels,
  normalizeTaskReferences,
  objectiveProvenanceJson,
  type ProjectBoardStoreRow,
  type ProjectBoardSynthesisProposalStoreRow,
  type ProjectBoardSynthesisRunStoreRow,
} from "./projectBoardMappers";

export type ProjectBoardSynthesisProposalApplyEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardSynthesisProposalApplyRepositoryDeps {
  mapProjectBoard(row: ProjectBoardStoreRow): ProjectBoardSummary;
  appendProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind): ProjectBoardPlanningSnapshot | undefined;
  appendProjectBoardEvent(input: ProjectBoardSynthesisProposalApplyEventInput): void;
}

export interface ProjectStoreProjectBoardSynthesisProposalApplyRepositoryOptions {
  applyProjectBoardSynthesis(
    boardId: string,
    synthesis: ProjectBoardSynthesisDraft,
    options?: ProjectBoardSynthesisApplyOptions,
  ): ProjectBoardSummary;
}

export class ProjectStoreProjectBoardSynthesisProposalApplyRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSynthesisProposalApplyRepositoryDeps,
    private readonly options: ProjectStoreProjectBoardSynthesisProposalApplyRepositoryOptions,
  ) {}

  applyProjectBoardSynthesisProposal(input: { proposalId: string; replaceExistingDraft?: boolean }): ProjectBoardSummary {
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?").get(input.proposalId) as
      | ProjectBoardSynthesisProposalStoreRow
      | undefined;
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
    this.options.applyProjectBoardSynthesis(proposal.boardId, synthesis, {
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
}
