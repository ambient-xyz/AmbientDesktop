import type Database from "better-sqlite3";
import type {
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardEvent,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import {
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationSuggestions,
} from "./projectBoardMappers";
import {
  projectBoardClarificationDefaultAnsweredDecisions,
  projectBoardClarificationDefaultQuestionsShareDecisionTopic,
  type ProjectBoardClarificationDefaultSuggestion,
} from "./projectStoreProjectBoardFacade";

export type ProjectBoardClarificationDefaultEventInput = Omit<ProjectBoardEvent, "id" | "createdAt" | "metadata"> & {
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export interface ApplyProjectBoardClarificationDefaultSuggestionsInput {
  boardId: string;
  suggestions: ProjectBoardClarificationDefaultSuggestion[];
  targetCardIds?: string[];
  model?: string;
  telemetry?: { promptCharCount?: number; responseCharCount?: number; requestDurationMs?: number };
  fallbackUsed?: boolean;
  providerError?: string;
}

export interface ProjectStoreProjectBoardClarificationDefaultRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  appendProjectBoardEvent(input: ProjectBoardClarificationDefaultEventInput): void;
}

export class ProjectStoreProjectBoardClarificationDefaultRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardClarificationDefaultRepositoryDeps,
  ) {}

  applyProjectBoardClarificationDefaultSuggestions(
    input: ApplyProjectBoardClarificationDefaultSuggestionsInput,
  ): ProjectBoardSummary {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = new Date().toISOString();
    const targetCardIds = [...new Set((input.targetCardIds?.length ? input.targetCardIds : input.suggestions.map((item) => item.cardId)).filter(Boolean))];
    const suggestionsByCardId = new Map<string, ProjectBoardClarificationDefaultSuggestion[]>();
    for (const suggestion of input.suggestions) {
      if (!suggestion.cardId) continue;
      const list = suggestionsByCardId.get(suggestion.cardId) ?? [];
      list.push(suggestion);
      suggestionsByCardId.set(suggestion.cardId, list);
    }

    const appliedCardIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    let suggestedDecisionCount = 0;
    let safeSuggestionCount = 0;
    const answeredDecisions = projectBoardClarificationDefaultAnsweredDecisions(board.cards);
    const updateClarificationSuggestions = this.db.prepare(
      `UPDATE project_board_cards
       SET clarification_suggestions_json = ?,
           clarification_decisions_json = ?,
           updated_at = ?
       WHERE id = ?
         AND board_id = ?`,
    );

    for (const cardId of targetCardIds) {
      const current = board.cards.find((card) => card.id === cardId);
      if (!current || current.boardId !== board.id) {
        skippedReasons[cardId] = "Card was not found on this board.";
        continue;
      }
      if (current.status === "archived") {
        skippedReasons[cardId] = "Archived cards cannot receive clarification suggestions.";
        continue;
      }
      if (current.candidateStatus === "duplicate" || current.candidateStatus === "rejected" || current.candidateStatus === "evidence") {
        skippedReasons[cardId] = `Card candidate status is ${current.candidateStatus}.`;
        continue;
      }
      const suggestions = suggestionsByCardId.get(cardId) ?? [];
      if (suggestions.length === 0) {
        skippedReasons[cardId] = "Ambient/Pi did not return a clarification suggestion for this card.";
        continue;
      }

      const currentSuggestions = normalizeProjectBoardClarificationSuggestions(current.clarificationSuggestions ?? [], []);
      const currentDecisions = normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
        clarificationQuestions: current.clarificationQuestions,
        clarificationSuggestions: currentSuggestions,
        clarificationAnswers: current.clarificationAnswers,
        description: current.description,
        acceptanceCriteria: current.acceptanceCriteria,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
      });
      const nextSuggestions: ProjectBoardCardClarificationSuggestion[] = [...currentSuggestions];
      const nextDecisions: ProjectBoardCardClarificationDecision[] = currentDecisions.map((decision) => ({ ...decision }));
      let appliedForCard = 0;

      for (const suggestion of suggestions) {
        const decisionIndex = nextDecisions.findIndex(
          (decision) =>
            decision.state === "open" &&
            !decision.suggestedAnswer?.trim() &&
            (decision.id === suggestion.decisionId || projectBoardQuestionsAreNearDuplicates(decision.question, suggestion.question)),
        );
        if (decisionIndex < 0) continue;
        const decision = nextDecisions[decisionIndex];
        const relatedAnsweredDecision = answeredDecisions.find(
          (answered) =>
            answered.cardId !== current.id &&
            projectBoardClarificationDefaultQuestionsShareDecisionTopic(answered.question, decision.question),
        );
        if (relatedAnsweredDecision) {
          skippedReasons[cardId] = `Skipped conflicting default because "${relatedAnsweredDecision.cardTitle}" already answers an overlapping decision.`;
          continue;
        }
        const normalizedSuggestion = normalizeProjectBoardClarificationSuggestions(
          [
            {
              question: decision.question,
              suggestedAnswer: suggestion.suggestedAnswer,
              rationale: suggestion.rationale,
              confidence: suggestion.confidence,
              safeToAccept: suggestion.safeToAccept,
              questionKind: suggestion.questionKind,
            },
          ],
          [],
        )[0];
        if (!normalizedSuggestion) continue;
        const existingSuggestionIndex = nextSuggestions.findIndex((item) => projectBoardQuestionsAreNearDuplicates(item.question, decision.question));
        if (existingSuggestionIndex >= 0) nextSuggestions[existingSuggestionIndex] = normalizedSuggestion;
        else nextSuggestions.push(normalizedSuggestion);
        nextDecisions[decisionIndex] = {
          ...decision,
          suggestedAnswer: normalizedSuggestion.suggestedAnswer,
          rationale: normalizedSuggestion.rationale,
          confidence: normalizedSuggestion.confidence,
          safeToAccept: normalizedSuggestion.safeToAccept,
          questionKind: normalizedSuggestion.questionKind,
          updatedAt: now,
        };
        appliedForCard += 1;
        suggestedDecisionCount += 1;
        if (normalizedSuggestion.safeToAccept) safeSuggestionCount += 1;
      }

      if (appliedForCard === 0) {
        skippedReasons[cardId] = "No open clarification decision without a suggestion matched the returned suggestion.";
        continue;
      }
      const result = updateClarificationSuggestions.run(
        JSON.stringify(normalizeProjectBoardClarificationSuggestions(nextSuggestions, [])),
        JSON.stringify(normalizeProjectBoardClarificationDecisions(nextDecisions, {
          clarificationQuestions: current.clarificationQuestions,
          clarificationSuggestions: nextSuggestions,
          clarificationAnswers: current.clarificationAnswers,
          description: current.description,
          acceptanceCriteria: current.acceptanceCriteria,
          createdAt: current.createdAt,
          updatedAt: now,
        })),
        now,
        current.id,
        board.id,
      );
      if (result.changes <= 0) {
        skippedReasons[cardId] = "Card clarification suggestion metadata could not be updated.";
        continue;
      }
      appliedCardIds.push(cardId);
      this.deps.appendProjectBoardEvent({
        boardId: board.id,
        kind: "card_updated",
        title: "Clarification default suggested",
        summary: `${current.title} received ${appliedForCard} reviewable expert default${appliedForCard === 1 ? "" : "s"} without rewriting card specs.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          suggestedDecisionCount: appliedForCard,
          changedFields: ["clarificationSuggestions", "clarificationDecisions"],
          protectedPiUpdate: false,
          existingCardsRewritten: false,
          modelCallRequired: true,
        },
        createdAt: now,
      });
    }

    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    const skippedCardIds = targetCardIds.filter((cardId) => !appliedCardIds.includes(cardId));
    this.deps.appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_updated",
      title: "Clarification defaults suggested",
      summary:
        suggestedDecisionCount > 0
          ? `${input.fallbackUsed ? "Fallback rules" : "Ambient/Pi"} proposed ${suggestedDecisionCount} clarification default${
              suggestedDecisionCount === 1 ? "" : "s"
            } on ${appliedCardIds.length} card${appliedCardIds.length === 1 ? "" : "s"}; ${safeSuggestionCount} marked safe to accept. Card specs were not rewritten.`
          : `No clarification defaults were applied; ${skippedCardIds.length} card${skippedCardIds.length === 1 ? "" : "s"} skipped without rewriting card specs.`,
      entityKind: "project_board",
      entityId: board.id,
      metadata: {
        clarificationDefaults: {
          schemaVersion: 1,
          appliedAction: "suggest_expert_defaults",
          targetCardIds,
          appliedCardIds,
          skippedCardIds,
          skippedReasons,
          suggestedDecisionCount,
          safeSuggestionCount,
          existingCardsRewritten: false,
          modelCallRequired: true,
          ...(input.model ? { model: input.model } : {}),
          ...(typeof input.telemetry?.promptCharCount === "number" ? { promptCharCount: input.telemetry.promptCharCount } : {}),
          ...(typeof input.telemetry?.responseCharCount === "number" ? { responseCharCount: input.telemetry.responseCharCount } : {}),
          ...(typeof input.telemetry?.requestDurationMs === "number" ? { requestDurationMs: input.telemetry.requestDurationMs } : {}),
          ...(input.fallbackUsed ? { fallbackUsed: true } : {}),
          ...(input.providerError ? { providerError: input.providerError.slice(0, 500) } : {}),
        },
        suggestions: input.suggestions.map((suggestion) => ({
          cardId: suggestion.cardId,
          decisionId: suggestion.decisionId,
          question: suggestion.question,
          confidence: suggestion.confidence,
          safeToAccept: suggestion.safeToAccept,
          questionKind: suggestion.questionKind,
          rationale: suggestion.rationale,
        })),
      },
      createdAt: now,
    });
    return this.deps.getProjectBoard(board.id) ?? board;
  }
}
