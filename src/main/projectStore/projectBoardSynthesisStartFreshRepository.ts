import type Database from "better-sqlite3";
import type { ProjectBoardEvent } from "../../shared/projectBoardTypes";
import {
  projectBoardClaimSummaryFromEvents,
  projectBoardSynthesisCardRowProtectedFromDraftReplacement,
  projectBoardSynthesisStartFreshCardSnapshot,
  type ProjectBoardCardStoreRow,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";

export type ProjectBoardSynthesisStartFreshEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardSynthesisStartFreshRepositoryDeps {
  listProjectBoardEvents(boardId: string): ProjectBoardEvent[];
  appendProjectBoardEvent(input: ProjectBoardSynthesisStartFreshEventInput): void;
}

export interface SupersedeProjectBoardSynthesisCardsForStartFreshResult {
  supersededDraftCardIds: string[];
  demotedPreservedCardIds: string[];
  preservedCardIds: string[];
}

export class ProjectStoreProjectBoardSynthesisStartFreshRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSynthesisStartFreshRepositoryDeps,
  ) {}

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
