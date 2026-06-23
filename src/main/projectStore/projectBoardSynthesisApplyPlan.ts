import type {
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardEvent,
  ProjectBoardQuestion,
  ProjectBoardSource,
} from "../../shared/projectBoardTypes";
import { dedupeProjectBoardQuestions, projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { parseJsonObject } from "./projectStoreJson";
import {
  MAX_PROJECT_BOARD_SYNTHESIS_CARDS,
  projectBoardSynthesisCardAllowedForBoardSources,
  type ProjectBoardSynthesisApplyOptions,
} from "./projectStoreFacadeHelpers";
import {
  buildProjectBoardCharterProjectSummary,
  projectBoardClaimSummaryFromEvents,
  projectBoardCardPendingPiUpdateFromSynthesisCard,
  projectBoardSynthesisCardRowProtectedFromDraftReplacement,
  projectBoardSynthesisDraftWithSourceIdNamespace,
  projectBoardSynthesisMarkdown,
  type ProjectBoardCardStoreRow,
  type ProjectBoardCharterStoreRow,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";

export interface ProjectBoardSynthesisApplyPlanInput {
  board: ProjectBoardStoreRow;
  synthesis: ProjectBoardSynthesisDraft;
  options: ProjectBoardSynthesisApplyOptions;
  now: string;
  existingSynthesisRows: ProjectBoardCardStoreRow[];
  existingQuestions: ProjectBoardQuestion[];
  boardSources: ProjectBoardSource[];
  boardEvents: ProjectBoardEvent[];
  activeCharterRow: ProjectBoardCharterStoreRow | undefined;
}

export interface ProjectBoardSynthesisApplyPlan {
  synthesis: ProjectBoardSynthesisDraft;
  boardSources: ProjectBoardSource[];
  boardSourceThreadId: string | undefined;
  existingSynthesisRows: ProjectBoardCardStoreRow[];
  pendingPiUpdates: Array<{ cardId: string; update: ProjectBoardCardPendingPiUpdate }>;
  cardsToUpdate: Array<{ existing: ProjectBoardCardStoreRow; update: ProjectBoardCardPendingPiUpdate | undefined }>;
  cardsToInsert: ProjectBoardSynthesisDraft["cards"];
  deleteStaleDraftCards: boolean;
  staleReplaceableDraftCardIds: string[];
  questionsToInsert: string[];
  summaryQuestions: ProjectBoardQuestion[];
  markdown: string;
  mergedBudgetPolicy: Record<string, unknown>;
  synthesizedSourcePolicy: Record<string, unknown>;
  synthesizedCharterSummary: ReturnType<typeof buildProjectBoardCharterProjectSummary>;
}

export function buildProjectBoardSynthesisApplyPlan({
  board,
  synthesis: rawSynthesis,
  options,
  now,
  existingSynthesisRows,
  existingQuestions,
  boardSources,
  boardEvents,
  activeCharterRow,
}: ProjectBoardSynthesisApplyPlanInput): ProjectBoardSynthesisApplyPlan {
  const synthesis = projectBoardSynthesisDraftWithSourceIdNamespace(rawSynthesis, options.sourceIdNamespace);
  const claimSummary = options.replaceExistingDraft ? projectBoardClaimSummaryFromEvents(boardEvents) : undefined;
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
    ? candidateCards.flatMap((card): Array<{ existing: ProjectBoardCardStoreRow; update: ProjectBoardCardPendingPiUpdate | undefined }> => {
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
      boardId: board.id,
      question,
      required: true,
      createdAt: now,
      updatedAt: now,
    })),
  ];
  const markdown = projectBoardSynthesisMarkdown(board, synthesis);
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

  return {
    synthesis,
    boardSources,
    boardSourceThreadId,
    existingSynthesisRows,
    pendingPiUpdates,
    cardsToUpdate,
    cardsToInsert,
    deleteStaleDraftCards,
    staleReplaceableDraftCardIds,
    questionsToInsert,
    summaryQuestions,
    markdown,
    mergedBudgetPolicy,
    synthesizedSourcePolicy,
    synthesizedCharterSummary,
  };
}
