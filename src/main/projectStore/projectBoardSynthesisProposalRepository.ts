import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardEvent,
  ProjectBoardPmReviewReport,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCardReviewStatus,
} from "../../shared/projectBoardTypes";
import {
  normalizeProjectBoardPmReviewReport,
  type ProjectBoardSynthesisDraft,
} from "../project-board/projectBoardSynthesis";
import {
  mapProjectBoardSynthesisProposalRow,
  normalizeCardTextList,
  projectBoardSynthesisProposalCardReviewStatus,
  projectBoardSynthesisProposalCardsFromDraft,
  type ProjectBoardCardStoreRow,
  type ProjectBoardStoreRow,
  type ProjectBoardSynthesisProposalStoreRow,
} from "./projectBoardMappers";

export type ProjectBoardSynthesisProposalEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardSynthesisProposalRepositoryDeps {
  appendProjectBoardEvent(input: ProjectBoardSynthesisProposalEventInput): void;
}

export class ProjectStoreProjectBoardSynthesisProposalRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSynthesisProposalRepositoryDeps,
  ) {}

  createProjectBoardSynthesisProposal(input: {
    boardId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be refined.");
    const now = new Date().toISOString();
    const proposalId = randomUUID();
    const cards = projectBoardSynthesisProposalCardsFromDraft(input.synthesis);
    const reviewReport = input.reviewReport ? normalizeProjectBoardPmReviewReport(input.reviewReport) : undefined;
    if (cards.length === 0 && !reviewReport) throw new Error("Project board synthesis proposal must include at least one card or a PM review report.");

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE project_board_synthesis_proposals
           SET status = 'superseded', updated_at = ?
           WHERE board_id = ? AND status = 'pending'`,
        )
        .run(now, input.boardId);
      this.db
        .prepare(
          `INSERT INTO project_board_synthesis_proposals
           (id, board_id, status, summary, goal, current_state, target_user, quality_bar,
            assumptions_json, questions_json, answers_json, source_notes_json, cards_json, review_report_json, model, duration_ms, created_at, updated_at, applied_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          proposalId,
          input.boardId,
          "pending",
          input.synthesis.summary.trim().slice(0, 500),
          input.synthesis.goal.trim().slice(0, 2000),
          input.synthesis.currentState.trim().slice(0, 2000),
          input.synthesis.targetUser.trim().slice(0, 1000),
          input.synthesis.qualityBar.trim().slice(0, 2000),
          JSON.stringify(normalizeCardTextList(input.synthesis.assumptions, 20)),
          JSON.stringify(normalizeCardTextList(input.synthesis.questions, 12)),
          JSON.stringify([]),
          JSON.stringify(normalizeCardTextList(input.synthesis.sourceNotes, 20)),
          JSON.stringify(cards),
          reviewReport ? JSON.stringify(reviewReport) : null,
          input.model?.trim() || null,
          typeof input.durationMs === "number" && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
          now,
          now,
          null,
        );
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "synthesis_proposal_created",
        title: reviewReport ? "Pi charter review ready" : "Pi synthesis proposal ready",
        summary: reviewReport
          ? `A lightweight PM review report is ready with ${input.synthesis.questions.length} blocking question${input.synthesis.questions.length === 1 ? "" : "s"} and zero generated cards.`
          : `${cards.length} candidate card${cards.length === 1 ? "" : "s"} and ${input.synthesis.questions.length} question${input.synthesis.questions.length === 1 ? "" : "s"} are ready for PM review.`,
        entityKind: "project_board_synthesis_proposal",
        entityId: proposalId,
        metadata: {
          proposalId,
          model: input.model,
          durationMs: input.durationMs,
          cardCount: cards.length,
          questionCount: input.synthesis.questions.length,
          reviewReport: Boolean(reviewReport),
          readiness: reviewReport?.readiness,
          supersededPending: true,
        },
        createdAt: now,
      });
    });
    transaction();
    const row = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found after create: ${proposalId}`);
    return mapProjectBoardSynthesisProposalRow(row);
  }

  updateProjectBoardSynthesisProposal(input: {
    proposalId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    const row = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
    if (row.status !== "pending") throw new Error(`Project board synthesis proposal is ${row.status}, not pending.`);
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(row.board_id) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${row.board_id}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be refined.");
    const existingProposal = mapProjectBoardSynthesisProposalRow(row);
    const cards = projectBoardSynthesisProposalCardsFromDraft(input.synthesis, existingProposal.cards);
    const reviewReport = input.reviewReport ? normalizeProjectBoardPmReviewReport(input.reviewReport) : undefined;
    if (cards.length === 0 && !reviewReport) throw new Error("Project board synthesis proposal must include at least one card or a PM review report.");
    const now = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE project_board_synthesis_proposals
           SET summary = ?,
               goal = ?,
               current_state = ?,
               target_user = ?,
               quality_bar = ?,
               assumptions_json = ?,
               questions_json = ?,
               source_notes_json = ?,
               cards_json = ?,
               review_report_json = ?,
               model = COALESCE(?, model),
               duration_ms = COALESCE(?, duration_ms),
               updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.synthesis.summary.trim().slice(0, 500),
          input.synthesis.goal.trim().slice(0, 2000),
          input.synthesis.currentState.trim().slice(0, 2000),
          input.synthesis.targetUser.trim().slice(0, 1000),
          input.synthesis.qualityBar.trim().slice(0, 2000),
          JSON.stringify(normalizeCardTextList(input.synthesis.assumptions, 20)),
          JSON.stringify(normalizeCardTextList(input.synthesis.questions, 12)),
          JSON.stringify(normalizeCardTextList(input.synthesis.sourceNotes, 20)),
          JSON.stringify(cards),
          reviewReport ? JSON.stringify(reviewReport) : null,
          input.model?.trim() || null,
          typeof input.durationMs === "number" && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
          now,
          input.proposalId,
        );
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
      this.deps.appendProjectBoardEvent({
        boardId: row.board_id,
        kind: "synthesis_proposal_created",
        title: reviewReport ? "Pi charter review updated" : "Pi synthesis proposal updated",
        summary: reviewReport
          ? `A lightweight PM review report is ready with ${input.synthesis.questions.length} blocking question${input.synthesis.questions.length === 1 ? "" : "s"} and zero generated cards.`
          : `${cards.length} candidate card${cards.length === 1 ? "" : "s"} and ${input.synthesis.questions.length} question${
              input.synthesis.questions.length === 1 ? "" : "s"
            } are available for PM review.`,
        entityKind: "project_board_synthesis_proposal",
        entityId: input.proposalId,
        metadata: {
          proposalId: input.proposalId,
          model: input.model,
          durationMs: input.durationMs,
          cardCount: cards.length,
          questionCount: input.synthesis.questions.length,
          reviewReport: Boolean(reviewReport),
          readiness: reviewReport?.readiness,
          progressiveUpdate: true,
        },
        createdAt: now,
      });
    });
    transaction();
    const updated = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    if (!updated) throw new Error(`Project board synthesis proposal not found after update: ${input.proposalId}`);
    return mapProjectBoardSynthesisProposalRow(updated);
  }

  getProjectBoardSynthesisProposal(proposalId: string): ProjectBoardSynthesisProposal | undefined {
    const row = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    return row ? mapProjectBoardSynthesisProposalRow(row) : undefined;
  }

  getLatestPendingProjectBoardSynthesisProposal(boardId: string): ProjectBoardSynthesisProposal | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM project_board_synthesis_proposals
         WHERE board_id = ? AND status = 'pending'
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(boardId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    return row ? mapProjectBoardSynthesisProposalRow(row) : undefined;
  }

  answerProjectBoardSynthesisProposalQuestion(input: {
    proposalId: string;
    questionIndex: number;
    answer: string;
  }): ProjectBoardSynthesisProposal {
    const row = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
    if (row.status !== "pending") throw new Error(`Project board synthesis proposal is ${row.status}, not pending.`);
    const proposal = mapProjectBoardSynthesisProposalRow(row);
    if (!Number.isInteger(input.questionIndex) || input.questionIndex < 0 || input.questionIndex >= proposal.questions.length) {
      throw new Error(`Project board synthesis proposal question not found: ${input.questionIndex}`);
    }
    const answer = input.answer.trim();
    if (!answer) throw new Error("Project board synthesis proposal answer cannot be empty.");
    const now = new Date().toISOString();
    const question = proposal.questions[input.questionIndex];
    const answers = [
      ...proposal.answers.filter((candidate) => candidate.questionIndex !== input.questionIndex),
      { questionIndex: input.questionIndex, question, answer: answer.slice(0, 4000), answeredAt: now },
    ].sort((left, right) => left.questionIndex - right.questionIndex);

    this.db
      .prepare("UPDATE project_board_synthesis_proposals SET answers_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(answers), now, input.proposalId);
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, proposal.boardId);
    this.deps.appendProjectBoardEvent({
      boardId: proposal.boardId,
      kind: "synthesis_proposal_answered",
      title: "Pi proposal question answered",
      summary: question.slice(0, 1000),
      entityKind: "project_board_synthesis_proposal",
      entityId: proposal.id,
      metadata: { proposalId: proposal.id, questionIndex: input.questionIndex, question, answer: answer.slice(0, 1000) },
      createdAt: now,
    });
    const updated = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    if (!updated) throw new Error(`Project board synthesis proposal not found after answer: ${input.proposalId}`);
    return mapProjectBoardSynthesisProposalRow(updated);
  }

  reviewProjectBoardSynthesisProposalCard(input: {
    proposalId: string;
    sourceId: string;
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus;
    reason?: string;
    mergeTargetCardId?: string;
  }): ProjectBoardSynthesisProposal {
    const row = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
    if (row.status !== "pending") throw new Error(`Project board synthesis proposal is ${row.status}, not pending.`);
    if (!projectBoardSynthesisProposalCardReviewStatus(input.reviewStatus)) {
      throw new Error(`Unsupported proposal card review status: ${input.reviewStatus}`);
    }
    const proposal = mapProjectBoardSynthesisProposalRow(row);
    const index = proposal.cards.findIndex((card) => card.sourceId === input.sourceId);
    if (index < 0) throw new Error(`Project board synthesis proposal card not found: ${input.sourceId}`);

    const mergeTargetCardId = input.reviewStatus === "merged" ? input.mergeTargetCardId?.trim() : undefined;
    if (input.reviewStatus === "merged") {
      if (!mergeTargetCardId) throw new Error("Merged proposal cards require a target draft card.");
      const target = this.db
        .prepare("SELECT * FROM project_board_cards WHERE id = ?")
        .get(mergeTargetCardId) as ProjectBoardCardStoreRow | undefined;
      if (!target || target.board_id !== proposal.boardId || target.status !== "draft" || target.orchestration_task_id) {
        throw new Error("Merged proposal cards require an unlinked draft card on the same board.");
      }
    }

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000) || undefined;
    const cards = proposal.cards.map((card, cardIndex) =>
      cardIndex === index
        ? {
            ...card,
            reviewStatus: input.reviewStatus,
            reviewReason: reason,
            mergeTargetCardId,
            reviewedAt: now,
          }
        : card,
    );
    this.db
      .prepare("UPDATE project_board_synthesis_proposals SET cards_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(cards), now, input.proposalId);
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, proposal.boardId);
    this.deps.appendProjectBoardEvent({
      boardId: proposal.boardId,
      kind: "synthesis_proposal_card_reviewed",
      title: "Pi proposal card reviewed",
      summary: `${proposal.cards[index].title} marked ${input.reviewStatus}.`,
      entityKind: "project_board_synthesis_proposal",
      entityId: proposal.id,
      metadata: { proposalId: proposal.id, sourceId: input.sourceId, reviewStatus: input.reviewStatus, reason, mergeTargetCardId },
      createdAt: now,
    });
    const updated = this.db
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalStoreRow | undefined;
    if (!updated) throw new Error(`Project board synthesis proposal not found after card review: ${input.proposalId}`);
    return mapProjectBoardSynthesisProposalRow(updated);
  }
}
