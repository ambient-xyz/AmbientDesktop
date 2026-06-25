import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { projectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardTouchedField,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import {
  mapProjectBoardCardRow,
  objectiveProvenanceJson,
  projectBoardClarificationDecisionImpactEventSummary,
  projectBoardDecisionImpactEventMetadata,
  type ProjectBoardCardStoreRow,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";
import {
  buildProjectBoardCardDraftUpdateState,
  buildProjectBoardCardPendingPiUpdateState,
  type UpdateProjectBoardCardMutationInput,
} from "./projectBoardCardDraftMutationState";

export type { UpdateProjectBoardCardMutationInput } from "./projectBoardCardDraftMutationState";

export interface ProjectStoreProjectBoardCardDraftMutationRepositoryDeps {
  listOrchestrationTasks(): OrchestrationTask[];
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  projectBoardRequiresProofSpec(boardId: string): boolean;
  assertProjectBoardCardProofReady(card: ProjectBoardCard): void;
  assertProjectBoardCardClarificationsResolved(card: ProjectBoardCard): void;
  assertProjectBoardRunFollowUpStillActionable(card: ProjectBoardCard): void;
  appendProjectBoardEvent(input: ProjectBoardCardMutationEventInput): void;
  syncProjectBoardTaskBlockers(boardId: string): void;
  syncProjectBoardCardsForLinkedTasks(): void;
}

export class ProjectStoreProjectBoardCardDraftMutationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardDraftMutationRepositoryDeps,
  ) {}

  createManualCard(input: { boardId: string; title?: string; description?: string }): ProjectBoardCard {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot accept new cards.");
    const now = new Date().toISOString();
    const id = randomUUID();
    const title = input.title?.trim() || "New draft card";
    const description =
      input.description?.trim() || "Manual draft card. Fill in scope, dependencies, acceptance criteria, and proof before ticketization.";
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO project_board_cards
          (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
           acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          board.id,
          title.slice(0, 180),
          description.slice(0, 4000),
          "draft",
          "needs_clarification",
          null,
          null,
          JSON.stringify(["manual"]),
          JSON.stringify([]),
          JSON.stringify(["Define the intended outcome before ticketization."]),
          JSON.stringify({ unit: [], integration: [], visual: [], manual: [] }),
          "manual",
          `manual:${id}`,
          null,
          null,
          null,
          now,
          now,
        );
      this.touchBoard(board.id, now);
      this.deps.appendProjectBoardEvent({
        boardId: board.id,
        kind: "manual_card_created",
        title: "Manual draft card created",
        summary: title.slice(0, 180),
        entityKind: "project_board_card",
        entityId: id,
        metadata: { cardId: id, sourceKind: "manual" },
        createdAt: now,
      });
    });
    transaction();
    return this.getProjectBoardCard(id);
  }

  updateCard(input: UpdateProjectBoardCardMutationInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Project board candidates can only be edited before ticketization.");
    }
    const now = new Date().toISOString();
    const draft = buildProjectBoardCardDraftUpdateState({
      current,
      update: input,
      now,
      requiresProofSpec: this.deps.projectBoardRequiresProofSpec(current.boardId),
    });
    if (draft.candidateStatus === "ready_to_create") {
      const nextForGates = {
        ...current,
        blockedBy: draft.blockedBy,
        testPlan: draft.testPlan,
        clarificationQuestions: draft.clarificationQuestions,
        clarificationSuggestions: draft.clarificationSuggestions,
        clarificationAnswers: draft.clarificationAnswers,
        clarificationDecisions: draft.clarificationDecisions,
      };
      this.deps.assertProjectBoardCardProofReady(nextForGates);
      this.deps.assertProjectBoardCardClarificationsResolved(nextForGates);
      this.deps.assertProjectBoardRunFollowUpStillActionable(nextForGates);
    }
    const decisionImpact = draft.changedClarificationAnswer
      ? projectBoardDecisionImpactPreview(this.deps.getProjectBoard(current.boardId), {
          question: draft.changedClarificationAnswer.question,
          answer: draft.changedClarificationAnswer.answer,
          answeredCardId: current.id,
        })
      : undefined;
    this.db
      .prepare(
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
             clarification_answers_json = ?,
             clarification_decisions_json = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        draft.title.slice(0, 180),
        draft.description,
        draft.candidateStatus,
        draft.priority,
        draft.phase,
        JSON.stringify(draft.labels),
        JSON.stringify(draft.blockedBy),
        JSON.stringify(draft.acceptanceCriteria),
        JSON.stringify(draft.testPlan),
        JSON.stringify(draft.sourceRefs),
        JSON.stringify(draft.clarificationQuestions),
        JSON.stringify(draft.clarificationSuggestions),
        JSON.stringify(draft.clarificationAnswers),
        JSON.stringify(draft.clarificationDecisions),
        JSON.stringify(draft.touchedFields),
        draft.touchedAt,
        now,
        input.cardId,
      );
    this.touchBoard(current.boardId, now);
    if (draft.changedFields.length > 0) {
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: decisionImpact ? "Clarification decision answered" : "Candidate card updated",
        summary: decisionImpact
          ? projectBoardClarificationDecisionImpactEventSummary(current.title, decisionImpact)
          : `${current.title} updated ${draft.changedFields.join(", ")}.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          changedFields: draft.changedFields,
          ...(decisionImpact ? { decisionImpact: projectBoardDecisionImpactEventMetadata(decisionImpact) } : {}),
        },
        createdAt: now,
      });
    }
    if (draft.changedFields.includes("candidateStatus") || draft.changedFields.includes("dependencies")) {
      this.deps.syncProjectBoardTaskBlockers(current.boardId);
      this.deps.syncProjectBoardCardsForLinkedTasks();
    }
    return this.getProjectBoardCard(input.cardId);
  }

  updateCardCandidateStatus(
    cardId: string,
    candidateStatus: ProjectBoardCardCandidateStatus,
    options: { actor?: "user" | "system"; reason?: string; relatedCardId?: string } = {},
  ): ProjectBoardCard {
    const current = this.getProjectBoardCard(cardId);
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Candidate status can only be changed before a board card is ticketized.");
    }
    if (candidateStatus === "ready_to_create") {
      this.deps.assertProjectBoardCardProofReady(current);
      this.deps.assertProjectBoardCardClarificationsResolved(current);
      this.deps.assertProjectBoardRunFollowUpStillActionable(current);
    }
    const now = new Date().toISOString();
    const changed = current.candidateStatus !== candidateStatus;
    const touchedByUser = changed && options.actor !== "system";
    const touchedFields = touchedByUser
      ? [...new Set([...(current.userTouchedFields ?? []), "candidateStatus" satisfies ProjectBoardCardTouchedField])]
      : (current.userTouchedFields ?? []);
    const touchedAt = touchedByUser ? now : (current.userTouchedAt ?? null);
    this.db
      .prepare(
        `UPDATE project_board_cards
         SET candidate_status = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(candidateStatus, JSON.stringify(touchedFields), touchedAt, now, cardId);
    this.touchBoard(current.boardId, now);
    if (changed) {
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "candidate_status_changed",
        title: "Candidate status changed",
        summary: `${current.title} moved from ${current.candidateStatus} to ${candidateStatus}.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          from: current.candidateStatus,
          to: candidateStatus,
          ...(options.actor ? { actor: options.actor } : {}),
          ...(options.reason ? { reason: options.reason } : {}),
          ...(options.relatedCardId ? { relatedCardId: options.relatedCardId } : {}),
        },
        createdAt: now,
      });
      this.deps.syncProjectBoardTaskBlockers(current.boardId);
      this.deps.syncProjectBoardCardsForLinkedTasks();
    }
    return this.getProjectBoardCard(cardId);
  }

  resolvePiUpdate(input: { cardId: string; action: "apply" | "ignore" }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    const pendingUpdate = current.pendingPiUpdate;
    if (!pendingUpdate) return current;
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Pi update suggestions can only be resolved before ticketization.");
    }
    const now = new Date().toISOString();
    if (input.action === "ignore") {
      this.db.prepare("UPDATE project_board_cards SET pending_pi_update_json = NULL, updated_at = ? WHERE id = ?").run(now, input.cardId);
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: "Pi update ignored",
        summary: `${current.title} kept the user-owned card fields.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: { cardId: current.id, sourceId: pendingUpdate.sourceId, action: "ignore" },
        createdAt: now,
      });
      return this.getProjectBoardCard(input.cardId);
    }

    const update = buildProjectBoardCardPendingPiUpdateState({ current, pendingUpdate, now });
    if (update.candidateStatus === "ready_to_create") {
      this.deps.assertProjectBoardCardProofReady({ ...current, testPlan: update.testPlan });
      this.deps.assertProjectBoardCardClarificationsResolved({
        ...current,
        clarificationQuestions: update.clarificationQuestions,
        clarificationSuggestions: update.clarificationSuggestions,
        clarificationAnswers: update.clarificationAnswers,
        clarificationDecisions: update.clarificationDecisions,
        candidateStatus: update.candidateStatus,
      });
    }
    this.db
      .prepare(
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
             clarification_answers_json = ?,
             clarification_decisions_json = ?,
             objective_provenance_json = ?,
             ui_mock_role = ?,
             requires_ui_mock_approval = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             pending_pi_update_json = NULL,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        update.title.trim().slice(0, 180),
        update.description.trim().slice(0, 4000),
        update.candidateStatus,
        update.priority,
        update.phase?.trim() ? update.phase.trim().slice(0, 80) : null,
        JSON.stringify(update.labels),
        JSON.stringify(update.blockedBy),
        JSON.stringify(update.acceptanceCriteria),
        JSON.stringify(update.testPlan),
        JSON.stringify(update.sourceRefs),
        JSON.stringify(update.clarificationQuestions),
        JSON.stringify(update.clarificationSuggestions),
        JSON.stringify(update.clarificationAnswers),
        JSON.stringify(update.clarificationDecisions),
        objectiveProvenanceJson(update.objectiveProvenance),
        update.uiMockRole ?? null,
        update.requiresUiMockApproval ? 1 : 0,
        JSON.stringify(update.touchedFields),
        now,
        now,
        input.cardId,
      );
    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Pi update applied",
      summary: `${current.title} accepted Pi updates for ${update.changedFields.join(", ")}.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: { cardId: current.id, sourceId: update.sourceId, action: "apply", changedFields: update.changedFields },
      createdAt: now,
    });
    return this.getProjectBoardCard(input.cardId);
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
