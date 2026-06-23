import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { projectBoardDecisionImpactPreview, type ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import type {
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ProjectBoardCard,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardRunFeedback,
  ProjectBoardCardTouchedField,
  ProjectBoardSummary,
  RefreshProjectBoardDecisionDraftsInput,
} from "../../shared/projectBoardTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import type { UpdateProjectBoardCardMutationInput } from "./projectBoardCardDraftMutationRepository";
import type { StageProjectBoardDecisionDraftPiUpdatesInput } from "./projectStoreFacadeHelpers";
import {
  mapProjectBoardCardRow,
  normalizeCardTextList,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeTaskLabels,
  normalizeTaskReferences,
  projectBoardClarificationDecisionImpactEventSummary,
  projectBoardDescriptionWithClarificationAnswer,
  projectBoardDecisionImpactEventMetadata,
  projectBoardDecisionImpactFeedbackText,
  projectBoardHasDecisionImpactFeedback,
  projectBoardQuestionMatchesAnyVariant,
  type ProjectBoardCardStoreRow,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardCardRunFeedbackRepositoryExternalDeps {
  listOrchestrationTasks(): OrchestrationTask[];
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  updateOrchestrationTaskDescription(taskId: string, description: string): void;
  projectBoardCardTaskDescription(card: ProjectBoardCard): string;
  appendProjectBoardEvent(input: ProjectBoardCardMutationEventInput): void;
}

export interface ProjectStoreProjectBoardCardRunFeedbackRepositoryDeps
  extends ProjectStoreProjectBoardCardRunFeedbackRepositoryExternalDeps {
  updateCard(input: UpdateProjectBoardCardMutationInput): ProjectBoardCard;
}

export class ProjectStoreProjectBoardCardRunFeedbackRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardRunFeedbackRepositoryDeps,
  ) {}

  addRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (!current.orchestrationTaskId || current.status === "draft") {
      throw new Error("Run feedback can only be added after a card has been approved into a Local Task.");
    }
    if (current.status === "done" || current.status === "archived") {
      throw new Error("Completed or archived cards cannot receive next-run feedback.");
    }
    if (current.status === "in_progress") {
      throw new Error("Wait for the active Local Task run to finish before adding next-run feedback.");
    }
    const feedbackText = input.feedback.trim();
    if (!feedbackText) throw new Error("Run feedback cannot be empty.");
    const now = new Date().toISOString();
    const feedback: ProjectBoardCardRunFeedback = {
      id: randomUUID(),
      feedback: feedbackText.slice(0, 1500),
      source: normalizeProjectBoardCardRunFeedbackSource(input.source),
      decisionQuestion: input.decisionQuestion?.trim() ? input.decisionQuestion.trim().slice(0, 500) : undefined,
      decisionAnswer: input.decisionAnswer?.trim() ? input.decisionAnswer.trim().slice(0, 1500) : undefined,
      sourceImpactEventId: input.sourceImpactEventId?.trim() ? input.sourceImpactEventId.trim().slice(0, 120) : undefined,
      sourceImpactEventIds: normalizeTaskReferences(input.sourceImpactEventIds ?? []),
      sourceIds: normalizeTaskReferences(input.sourceIds ?? []),
      createdAt: now,
      createdBy: "ambient-desktop",
    };
    const runFeedback = normalizeProjectBoardCardRunFeedback([...(current.runFeedback ?? []), feedback]);
    this.db
      .prepare("UPDATE project_board_cards SET run_feedback_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(runFeedback), now, current.id);
    this.touchBoard(current.boardId, now);
    const updated = this.getProjectBoardCard(current.id);
    this.deps.updateOrchestrationTaskDescription(current.orchestrationTaskId, this.deps.projectBoardCardTaskDescription(updated));
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Run feedback added",
      summary: `${current.title} received additive next-run feedback. The approved card fields were not rewritten.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        taskId: current.orchestrationTaskId,
        runFeedback: {
          id: feedback.id,
          source: feedback.source,
          decisionQuestion: feedback.decisionQuestion,
          decisionAnswer: feedback.decisionAnswer,
          sourceImpactEventId: feedback.sourceImpactEventId,
          sourceImpactEventIds: feedback.sourceImpactEventIds,
          sourceIds: feedback.sourceIds,
          modelCallRequired: false,
        },
      },
      createdAt: now,
    });
    return this.getProjectBoardCard(current.id);
  }

  applyDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim().slice(0, 1500);
    if (!question || !answer) throw new Error("Decision impact feedback requires a question and answer.");

    const now = new Date().toISOString();
    const board = this.deps.getProjectBoard(current.boardId);
    const impact = projectBoardDecisionImpactPreview(board, { question, answer, answeredCardId: current.id });
    if (current.status === "draft" && !current.orchestrationTaskId) {
      const nextAnswers = normalizeProjectBoardClarificationAnswers([
        ...(current.clarificationAnswers ?? []),
        { question, answer, answeredAt: now },
      ]);
      this.deps.updateCard({ cardId: current.id, clarificationAnswers: nextAnswers });
    } else {
      if (!current.orchestrationTaskId || current.status === "done" || current.status === "archived") {
        throw new Error("Decision impact feedback can only be applied to draft cards or active Local Task cards.");
      }
      if (current.status === "in_progress") {
        throw new Error("Wait for the active Local Task run to finish before applying decision feedback.");
      }
      this.recordProjectBoardClarificationAnswerMetadata(current, question, answer, now, impact);
    }
    const targets = impact.cards.filter((card) => card.state === "ready_needs_next_run_feedback");
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];

    for (const target of targets) {
      const targetCard = this.getProjectBoardCard(target.cardId);
      if (
        !targetCard.orchestrationTaskId ||
        targetCard.status === "draft" ||
        targetCard.status === "done" ||
        targetCard.status === "archived" ||
        targetCard.status === "in_progress" ||
        projectBoardHasDecisionImpactFeedback(targetCard, question, answer)
      ) {
        skippedCardIds.push(target.cardId);
        continue;
      }
      this.addRunFeedback({
        cardId: targetCard.id,
        feedback: projectBoardDecisionImpactFeedbackText(question, answer),
        source: "decision_impact",
        decisionQuestion: question,
        decisionAnswer: answer,
      });
      appliedCardIds.push(targetCard.id);
    }

    if (appliedCardIds.length > 0) {
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: "Decision impact applied",
        summary: `Clarification answer created next-run feedback for ${appliedCardIds.length} ticketized card${
          appliedCardIds.length === 1 ? "" : "s"
        }; ${skippedCardIds.length} skipped. 0 model calls.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          decisionImpact: {
            ...projectBoardDecisionImpactEventMetadata(impact),
            appliedAction: "create_next_run_feedback",
            appliedCardIds,
            skippedCardIds,
          },
        },
        createdAt: now,
      });
    }

    return this.getProjectBoardCard(current.id);
  }

  refreshDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (current.status !== "draft" || current.orchestrationTaskId) {
      throw new Error("Decision draft refresh must start from a draft clarification card before ticketization.");
    }
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim().slice(0, 1500);
    if (!question || !answer) throw new Error("Decision draft refresh requires a question and answer.");

    const board = this.deps.getProjectBoard(current.boardId);
    const impact = projectBoardDecisionImpactPreview(board, { question, answer, answeredCardId: current.id });
    const targetById = new Map(
      impact.cards
        .filter((card) => card.state === "draft_unblocked" || card.state === "draft_still_blocked" || card.state === "duplicate_hidden")
        .map((card) => [card.cardId, card]),
    );
    if (!targetById.has(current.id)) {
      targetById.set(current.id, {
        cardId: current.id,
        title: current.title,
        status: current.status,
        candidateStatus: current.candidateStatus,
        state: "draft_still_blocked",
        openBefore: 1,
        openAfter: 0,
        matchedQuestions: [question],
        duplicateQuestions: [],
        recommendedAction: "Save answer on the source draft.",
      });
    }

    const now = new Date().toISOString();
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];

    for (const target of targetById.values()) {
      const targetCard = this.getProjectBoardCard(target.cardId);
      if (targetCard.status !== "draft" || targetCard.orchestrationTaskId) {
        skippedCardIds.push(target.cardId);
        continue;
      }
      const variants = [
        ...new Set([question, ...target.matchedQuestions, ...target.duplicateQuestions].map((value) => value.trim()).filter(Boolean)),
      ];
      const existingAnswer = (targetCard.clarificationAnswers ?? []).find((item) =>
        projectBoardQuestionMatchesAnyVariant(item.question, variants),
      );
      const answerQuestion = existingAnswer?.question ?? target.matchedQuestions[0] ?? target.duplicateQuestions[0] ?? question;
      const answeredAt = existingAnswer?.answer.trim() === answer ? existingAnswer.answeredAt : now;
      const nextAnswers = normalizeProjectBoardClarificationAnswers([
        ...(targetCard.clarificationAnswers ?? []),
        { question: answerQuestion, answer, answeredAt },
      ]);
      const nextQuestions = normalizeProjectBoardClarificationQuestions(
        (targetCard.clarificationQuestions ?? []).filter((candidate) => !projectBoardQuestionMatchesAnyVariant(candidate, variants)),
        8,
      );
      this.deps.updateCard({
        cardId: targetCard.id,
        description: projectBoardDescriptionWithClarificationAnswer(targetCard.description, answerQuestion, answer).slice(0, 4000),
        clarificationQuestions: nextQuestions,
        clarificationAnswers: nextAnswers,
      });
      appliedCardIds.push(targetCard.id);
    }

    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Decision drafts refreshed",
      summary: `Clarification answer was applied to ${appliedCardIds.length} affected draft card${
        appliedCardIds.length === 1 ? "" : "s"
      }; ${skippedCardIds.length} skipped. 0 model calls.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        decisionImpact: {
          ...projectBoardDecisionImpactEventMetadata(impact),
          appliedAction: "refresh_affected_drafts",
          appliedCardIds,
          skippedCardIds,
        },
      },
      createdAt: now,
    });

    return this.getProjectBoardCard(current.id);
  }

  stageDecisionDraftPiUpdates(input: StageProjectBoardDecisionDraftPiUpdatesInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (current.status !== "draft" || current.orchestrationTaskId) {
      throw new Error("Decision draft Pi refresh must start from a draft clarification card before ticketization.");
    }
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim().slice(0, 1500);
    if (!question || !answer) throw new Error("Decision draft Pi refresh requires a question and answer.");

    const board = this.deps.getProjectBoard(current.boardId);
    const impact = projectBoardDecisionImpactPreview(board, { question, answer, answeredCardId: current.id });
    const targetById = new Map(
      impact.cards
        .filter((card) => card.state === "draft_unblocked" || card.state === "draft_still_blocked" || card.state === "duplicate_hidden")
        .map((card) => [card.cardId, card]),
    );
    if (!targetById.has(current.id)) {
      targetById.set(current.id, {
        cardId: current.id,
        title: current.title,
        status: current.status,
        candidateStatus: current.candidateStatus,
        state: "draft_still_blocked",
        openBefore: 1,
        openAfter: 0,
        matchedQuestions: [question],
        duplicateQuestions: [],
        recommendedAction: "Save answer on the source draft.",
      });
    }

    const suggestionsByCardId = new Map(input.suggestions.map((suggestion) => [suggestion.cardId, suggestion]));
    const now = new Date().toISOString();
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const updatePendingPi = this.db.prepare(
      `UPDATE project_board_cards
       SET pending_pi_update_json = ?,
           updated_at = ?
       WHERE id = ?`,
    );

    for (const target of targetById.values()) {
      const targetCard = this.getProjectBoardCard(target.cardId);
      if (targetCard.status !== "draft" || targetCard.orchestrationTaskId) {
        skippedCardIds.push(target.cardId);
        continue;
      }

      const variants = [
        ...new Set([question, ...target.matchedQuestions, ...target.duplicateQuestions].map((value) => value.trim()).filter(Boolean)),
      ];
      const existingAnswer = (targetCard.clarificationAnswers ?? []).find((item) =>
        projectBoardQuestionMatchesAnyVariant(item.question, variants),
      );
      const answerQuestion = existingAnswer?.question ?? target.matchedQuestions[0] ?? target.duplicateQuestions[0] ?? question;
      const answeredAt = existingAnswer?.answer.trim() === answer ? existingAnswer.answeredAt : now;
      const nextAnswers = normalizeProjectBoardClarificationAnswers([
        ...(targetCard.clarificationAnswers ?? []),
        { question: answerQuestion, answer, answeredAt },
      ]);
      const suggestion = suggestionsByCardId.get(targetCard.id);
      const suggestedQuestions = suggestion?.clarificationQuestions ?? targetCard.clarificationQuestions ?? [];
      const nextQuestions = normalizeProjectBoardClarificationQuestions(
        suggestedQuestions.filter((candidate) => !projectBoardQuestionMatchesAnyVariant(candidate, variants)),
        8,
      );
      const nextDescription = (suggestion?.description?.trim()
        ? suggestion.description.trim()
        : projectBoardDescriptionWithClarificationAnswer(targetCard.description, answerQuestion, answer)
      ).slice(0, 4000);
      const nextLabels = suggestion?.labels ? normalizeTaskLabels(suggestion.labels) : targetCard.labels;
      const nextAcceptanceCriteria = suggestion?.acceptanceCriteria
        ? normalizeCardTextList(suggestion.acceptanceCriteria, 30)
        : targetCard.acceptanceCriteria;
      const nextTestPlan = suggestion?.testPlan ? normalizeProjectBoardCardTestPlan(suggestion.testPlan) : targetCard.testPlan;
      const nextDecisions = normalizeProjectBoardClarificationDecisions(targetCard.clarificationDecisions, {
        clarificationQuestions: nextQuestions,
        clarificationSuggestions: targetCard.clarificationSuggestions,
        clarificationAnswers: nextAnswers,
        createdAt: targetCard.createdAt,
        updatedAt: now,
      });
      const changedFields: ProjectBoardCardTouchedField[] = [
        nextDescription !== targetCard.description ? "description" : undefined,
        JSON.stringify(nextLabels) !== JSON.stringify(targetCard.labels) ? "labels" : undefined,
        JSON.stringify(nextAcceptanceCriteria) !== JSON.stringify(targetCard.acceptanceCriteria) ? "acceptanceCriteria" : undefined,
        JSON.stringify(nextTestPlan) !== JSON.stringify(targetCard.testPlan) ? "testPlan" : undefined,
        JSON.stringify(nextQuestions) !== JSON.stringify(targetCard.clarificationQuestions ?? []) ? "clarificationQuestions" : undefined,
        JSON.stringify(nextAnswers) !== JSON.stringify(targetCard.clarificationAnswers ?? []) ? "clarificationAnswers" : undefined,
        JSON.stringify(nextDecisions) !== JSON.stringify(targetCard.clarificationDecisions ?? []) ? "clarificationDecisions" : undefined,
      ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));

      if (changedFields.length === 0) {
        skippedCardIds.push(targetCard.id);
        continue;
      }

      const pendingUpdate: ProjectBoardCardPendingPiUpdate = {
        sourceId: `decision:${impact.canonicalKey}`,
        createdAt: now,
        changedFields,
        description: nextDescription,
        labels: nextLabels,
        acceptanceCriteria: nextAcceptanceCriteria,
        testPlan: nextTestPlan,
        clarificationQuestions: nextQuestions,
        clarificationAnswers: nextAnswers,
        clarificationDecisions: nextDecisions,
      };
      const result = updatePendingPi.run(JSON.stringify(pendingUpdate), now, targetCard.id);
      if (result.changes <= 0) {
        skippedCardIds.push(targetCard.id);
        continue;
      }
      appliedCardIds.push(targetCard.id);
      this.deps.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: "Decision draft Pi update available",
        summary: `${targetCard.title} received a reviewable Pi update from a PM decision (${changedFields.join(", ")}).`,
        entityKind: "project_board_card",
        entityId: targetCard.id,
        metadata: {
          cardId: targetCard.id,
          sourceId: pendingUpdate.sourceId,
          changedFields,
          decisionQuestion: question,
          decisionAnswer: answer,
          protectedPiUpdate: true,
          modelCallRequired: true,
        },
        createdAt: now,
      });
    }

    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Decision draft Pi refresh proposed",
      summary: `Pi proposed reviewable updates for ${appliedCardIds.length} affected draft card${
        appliedCardIds.length === 1 ? "" : "s"
      }; ${skippedCardIds.length} skipped. Approved cards were not rewritten.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        decisionImpact: {
          ...projectBoardDecisionImpactEventMetadata(impact),
          appliedAction: "propose_targeted_draft_refresh",
          modelCallRequired: true,
          appliedCardIds,
          skippedCardIds,
          pendingPiUpdateCardIds: appliedCardIds,
          existingCardsRewritten: false,
          fallbackUsed: Boolean(input.fallbackUsed),
          providerError: input.providerError,
          model: input.model,
          telemetry: input.telemetry,
        },
      },
      createdAt: now,
    });

    return this.getProjectBoardCard(current.id);
  }

  private recordProjectBoardClarificationAnswerMetadata(
    current: ProjectBoardCard,
    question: string,
    answer: string,
    now: string,
    decisionImpact: ProjectBoardDecisionImpactPreview,
  ): ProjectBoardCard {
    const nextAnswers = normalizeProjectBoardClarificationAnswers([
      ...(current.clarificationAnswers ?? []),
      { question, answer, answeredAt: now },
    ]);
    if (JSON.stringify(nextAnswers) === JSON.stringify(current.clarificationAnswers ?? [])) {
      return this.getProjectBoardCard(current.id);
    }
    const nextDecisions = normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
      clarificationQuestions: current.clarificationQuestions,
      clarificationSuggestions: current.clarificationSuggestions,
      clarificationAnswers: nextAnswers,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    const touchedFields = [
      ...new Set([
        ...(current.userTouchedFields ?? []),
        "clarificationAnswers" satisfies ProjectBoardCardTouchedField,
        "clarificationDecisions" satisfies ProjectBoardCardTouchedField,
      ]),
    ];
    this.db
      .prepare(
        `UPDATE project_board_cards
         SET clarification_answers_json = ?,
             clarification_decisions_json = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(nextAnswers), JSON.stringify(nextDecisions), JSON.stringify(touchedFields), now, now, current.id);
    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Clarification decision answered",
      summary: projectBoardClarificationDecisionImpactEventSummary(current.title, decisionImpact),
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        changedFields: ["clarificationAnswers", "clarificationDecisions"],
        decisionImpact: projectBoardDecisionImpactEventMetadata(decisionImpact),
      },
      createdAt: now,
    });
    return this.getProjectBoardCard(current.id);
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
