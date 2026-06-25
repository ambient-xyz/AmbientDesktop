import type { ProjectBoardPmReviewReport, ProjectBoardScopeContract } from "../../shared/projectBoardTypes";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardScopeContractFromTexts } from "./projectBoardPlanningContract";
import {
  isAdditiveProjectBoardRefinement,
  projectBoardScopeContractTexts,
  type ProjectBoardSynthesisDraft,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";

interface ProjectBoardWorkflowDraftLimitInput {
  compact: boolean;
  maxTotalCards: number;
  reason?: string;
}

export interface AdditiveDuplicateDiagnostic {
  sourceId: string;
  title: string;
  matchedSourceId?: string;
  matchedTitle?: string;
  reason: "source_id" | "title" | "intent_source_basis";
  score?: number;
  sourceBasisOverlap?: string[];
}

export interface CandidateCardFilterDiagnostic {
  sourceId: string;
  title: string;
}

export interface CandidateCardFilterResult {
  draft: ProjectBoardSynthesisDraft;
  diagnostics: CandidateCardFilterDiagnostic[];
  warningRecords: ProposalJsonlRecordArtifact[];
}

export interface ProjectBoardWorkflowDraftLimitResult {
  draft: ProjectBoardSynthesisDraft;
  omittedCardIds: string[];
  warningRecords: ProposalJsonlRecordArtifact[];
}

export function filterAdditiveDuplicateCards(
  draft: ProjectBoardSynthesisDraft,
  refinement?: ProjectBoardSynthesisRefinementContext,
): CandidateCardFilterResult {
  if (!refinement || !isAdditiveRefinement(refinement)) return { draft, diagnostics: [], warningRecords: [] };
  const cards: ProjectBoardSynthesisDraft["cards"] = [];
  const diagnostics: AdditiveDuplicateDiagnostic[] = [];
  const acceptedCards = [...refinement.previousDraft.cards];

  for (const card of draft.cards) {
    const match = additiveDuplicateMatch(card, acceptedCards);
    if (match) {
      diagnostics.push(match);
      continue;
    }
    cards.push(card);
    acceptedCards.push(card);
  }

  if (diagnostics.length === 0) return { draft, diagnostics: [], warningRecords: [] };
  const duplicateSummary = `Filtered ${diagnostics.length} duplicate candidate${diagnostics.length === 1 ? "" : "s"} already present in the board or this Add Cards pass.`;
  const filteredSummary = cards.length === 0 ? `${duplicateSummary} No net-new cards remain for this Add Cards pass.` : duplicateSummary;
  const filteredDraft = {
    ...draft,
    cards,
    sourceNotes: [...draft.sourceNotes, filteredSummary],
  };
  return {
    draft: filteredDraft,
    diagnostics,
    warningRecords: additiveDuplicateWarningRecords(diagnostics, filteredSummary),
  };
}

export function limitProjectBoardWorkflowDraft(
  draft: ProjectBoardSynthesisDraft,
  limits: ProjectBoardWorkflowDraftLimitInput,
  surface: string,
): ProjectBoardWorkflowDraftLimitResult {
  if (!limits.compact || !Number.isFinite(limits.maxTotalCards) || draft.cards.length <= limits.maxTotalCards) {
    return { draft, omittedCardIds: [], warningRecords: [] };
  }
  const maxTotalCards = Math.max(1, Math.floor(limits.maxTotalCards));
  const keptCards = draft.cards.slice(0, maxTotalCards);
  const omittedCards = draft.cards.slice(maxTotalCards);
  const omittedCardIds = omittedCards.map((card) => card.sourceId);
  const message = `Kept ${keptCards.length} candidate card${keptCards.length === 1 ? "" : "s"} because the extracted scope is shallow; ${omittedCards.length} extra candidate card${omittedCards.length === 1 ? "" : "s"} were dropped from the compact board workflow.`;
  return {
    draft: {
      ...draft,
      cards: keptCards,
      sourceNotes: [...draft.sourceNotes, message],
    },
    omittedCardIds,
    warningRecords: [
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "scope_contract_compact_board_card_limit",
        message,
        createdAt: new Date().toISOString(),
        metadata: {
          surface,
          maxTotalCards,
          omittedCardIds,
          compactReason: limits.reason,
        },
      }),
    ],
  };
}

export function removeOmittedCandidateRecords(
  records: ProposalJsonlRecordArtifact[],
  omittedCardIds: string[],
): ProposalJsonlRecordArtifact[] {
  if (omittedCardIds.length === 0) return records;
  const omitted = new Set(omittedCardIds);
  return records.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "candidate_card" && omitted.has(record.sourceId)) return [];
    if (record.type === "question" && record.cardId && omitted.has(record.cardId)) return [];
    if (record.type === "dependency_edge" && (omitted.has(record.fromCardId) || omitted.has(record.toCardId))) return [];
    if (record.type === "source_coverage") {
      const cardIds = record.cardIds.filter((cardId) => !omitted.has(cardId));
      if (record.cardIds.length > 0 && cardIds.length === 0) return [];
      if (cardIds.length === record.cardIds.length) return [record];
      return [
        validateProposalJsonlRecordArtifact({
          ...record,
          cardIds,
          status: record.status === "covered" ? "partial" : record.status,
        }),
      ];
    }
    return [record];
  });
}

export function filterScopeContractCards(
  draft: ProjectBoardSynthesisDraft,
  input: {
    sources: ProjectBoardSynthesisSource[];
    refinement?: ProjectBoardSynthesisRefinementContext;
    pmReviewReport?: ProjectBoardPmReviewReport;
    scopeContract?: ProjectBoardScopeContract;
  },
): CandidateCardFilterResult {
  const scopeContract = input.scopeContract ?? projectBoardScopeContractFromTexts(projectBoardScopeContractTexts(input));
  const hasCapabilityContract = Boolean(
    scopeContract.requiredCapabilities?.length ||
    scopeContract.supportingCapabilities?.length ||
    scopeContract.optionalCapabilities?.length ||
    scopeContract.excludedCapabilities?.length,
  );
  const cards: ProjectBoardSynthesisDraft["cards"] = [];
  const diagnostics: CandidateCardFilterDiagnostic[] = [];
  const defaultedCards: CandidateCardFilterDiagnostic[] = [];
  for (const card of draft.cards) {
    const scopeLabels = card.labels.map((label) => label.trim().toLowerCase()).filter((label) => label.startsWith("scope:"));
    if (scopeLabels.includes("scope:optional") || scopeLabels.includes("scope:excluded")) {
      diagnostics.push({ sourceId: card.sourceId, title: card.title });
      continue;
    }
    // A missing scope: label is a model formatting drift, not a scope violation.
    // Failing here would throw away a fully assembled run after every section was
    // paid for, so default the card to scope:supporting and surface a warning.
    if (scopeLabels.length === 0 && hasCapabilityContract) {
      defaultedCards.push({ sourceId: card.sourceId, title: card.title });
      cards.push({ ...card, labels: [...card.labels, "scope:supporting"] });
      continue;
    }
    cards.push(card);
  }
  if (diagnostics.length === 0 && defaultedCards.length === 0) return { draft, diagnostics: [], warningRecords: [] };
  if (cards.length === 0) {
    throw new Error(
      `Ambient project-board synthesis returned only cards outside explicit scope constraints. Filtered ${diagnostics.length} scope-expanding candidate${diagnostics.length === 1 ? "" : "s"}.`,
    );
  }
  const warningRecords: ProposalJsonlRecordArtifact[] = [];
  const sourceNotes = [...draft.sourceNotes];
  if (diagnostics.length > 0) {
    const message = `Filtered ${diagnostics.length} candidate${diagnostics.length === 1 ? "" : "s"} that expanded beyond explicit scope constraints; extra features should be offered as optional next steps.`;
    sourceNotes.push(message);
    warningRecords.push(
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "scope_contract_candidate_filtered",
        message,
        createdAt: new Date().toISOString(),
        metadata: {
          filteredCount: diagnostics.length,
          filteredCandidates: diagnostics.slice(0, 20),
          exclusions: scopeContract.excluded,
          requiredCapabilities: scopeContract.requiredCapabilities ?? [],
          supportingCapabilities: scopeContract.supportingCapabilities ?? [],
          optionalCapabilities: scopeContract.optionalCapabilities ?? [],
        },
      }),
    );
  }
  if (defaultedCards.length > 0) {
    warningRecords.push(
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "scope_contract_unlabeled_candidate_defaulted",
        message: `Defaulted ${defaultedCards.length} candidate${defaultedCards.length === 1 ? "" : "s"} without a scope: label to scope:supporting instead of failing the run.`,
        createdAt: new Date().toISOString(),
        metadata: {
          defaultedCount: defaultedCards.length,
          defaultedCandidates: defaultedCards.slice(0, 20),
        },
      }),
    );
  }
  return {
    draft: {
      ...draft,
      cards,
      sourceNotes,
    },
    diagnostics,
    warningRecords,
  };
}

export function filterProjectBoardGeneratedCards(
  draft: ProjectBoardSynthesisDraft,
  input: {
    sources: ProjectBoardSynthesisSource[];
    refinement?: ProjectBoardSynthesisRefinementContext;
    pmReviewReport?: ProjectBoardPmReviewReport;
    scopeContract?: ProjectBoardScopeContract;
  },
): CandidateCardFilterResult {
  const duplicateFiltered = filterAdditiveDuplicateCards(draft, input.refinement);
  const scopeFiltered = filterScopeContractCards(duplicateFiltered.draft, input);
  return {
    draft: scopeFiltered.draft,
    diagnostics: [...duplicateFiltered.diagnostics, ...scopeFiltered.diagnostics],
    warningRecords: [...duplicateFiltered.warningRecords, ...scopeFiltered.warningRecords],
  };
}

export function scopeContractFilterCountFromRecords(records: ProposalJsonlRecordArtifact[]): number {
  return records.filter(
    (record) =>
      record.type === "warning" &&
      (record.code === "scope_contract_candidate_filtered" || record.code === "scope_contract_compact_board_card_limit"),
  ).length;
}

export function additiveDuplicateWarningRecords(
  diagnostics: AdditiveDuplicateDiagnostic[],
  message: string,
): ProposalJsonlRecordArtifact[] {
  if (diagnostics.length === 0) return [];
  return [
    validateProposalJsonlRecordArtifact({
      type: "warning",
      code: "add_cards_duplicate_candidate_filtered",
      message,
      createdAt: new Date().toISOString(),
      metadata: {
        duplicateCount: diagnostics.length,
        duplicateCandidates: diagnostics.slice(0, 20),
      },
    }),
  ];
}

export function removeFilteredDuplicateCandidateRecords(
  records: ProposalJsonlRecordArtifact[],
  diagnostics: CandidateCardFilterDiagnostic[],
): ProposalJsonlRecordArtifact[] {
  if (diagnostics.length === 0) return records;
  const duplicateSourceIds = new Set(diagnostics.map((diagnostic) => normalizeExactText(diagnostic.sourceId)).filter(Boolean));
  const duplicateTitles = new Set(diagnostics.map((diagnostic) => normalizeExactText(diagnostic.title)).filter(Boolean));
  const droppedSourceIds = new Set<string>();
  const retainedRecords = records.filter((record) => {
    if (record.type !== "candidate_card") return true;
    const sourceId = normalizeExactText(record.sourceId);
    const title = normalizeExactText(record.title);
    if (sourceId && duplicateSourceIds.has(sourceId)) {
      droppedSourceIds.add(sourceId);
      return false;
    }
    if (title && duplicateTitles.has(title)) {
      droppedSourceIds.add(sourceId);
      return false;
    }
    return true;
  });
  return retainedRecords.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "dependency_edge") {
      return !droppedSourceIds.has(normalizeExactText(record.fromCardId)) && !droppedSourceIds.has(normalizeExactText(record.toCardId))
        ? [record]
        : [];
    }
    if (record.type === "source_coverage") {
      const cardIds = record.cardIds.filter((cardId) => !droppedSourceIds.has(normalizeExactText(cardId)));
      if (cardIds.length === 0) return [];
      if (cardIds.length === record.cardIds.length) return [record];
      return [
        validateProposalJsonlRecordArtifact({
          ...record,
          cardIds,
          status: record.status === "covered" ? "partial" : record.status,
        }),
      ];
    }
    return [record];
  });
}

export function additiveDuplicateMatch(
  card: ProjectBoardSynthesisDraft["cards"][number],
  existingCards: ProjectBoardSynthesisDraft["cards"],
): AdditiveDuplicateDiagnostic | undefined {
  const sourceId = normalizeExactText(card.sourceId);
  const title = normalizeExactText(card.title);
  const sourceBasis = sourceBasisTokens(card);
  const titleTokens = intentTokens(card.title);
  const intent = intentTokens(intentTextForCard(card));

  for (const existing of existingCards) {
    const existingSourceId = normalizeExactText(existing.sourceId);
    const existingTitle = normalizeExactText(existing.title);
    if (sourceId && sourceId === existingSourceId) {
      return duplicateDiagnostic(card, existing, "source_id");
    }
    if (title && title === existingTitle) {
      return duplicateDiagnostic(card, existing, "title");
    }

    const sourceOverlap = intersection(sourceBasis, sourceBasisTokens(existing));
    if (sourceOverlap.size === 0) continue;
    const titleScore = overlapScore(titleTokens, intentTokens(existing.title));
    const titleOverlap = intersection(titleTokens, intentTokens(existing.title)).size;
    const intentScore = overlapScore(intent, intentTokens(intentTextForCard(existing)));
    const intentOverlap = intersection(intent, intentTokens(intentTextForCard(existing))).size;
    if (
      (titleOverlap >= 3 && titleScore >= 0.58) ||
      (titleOverlap >= 3 && containmentScore(titleTokens, intentTokens(existing.title)) >= 0.75) ||
      (intentOverlap >= 5 && intentScore >= 0.68)
    ) {
      return duplicateDiagnostic(card, existing, "intent_source_basis", Math.max(titleScore, intentScore), [...sourceOverlap]);
    }
  }
  return undefined;
}

export function duplicateDiagnostic(
  card: ProjectBoardSynthesisDraft["cards"][number],
  matchedCard: ProjectBoardSynthesisDraft["cards"][number],
  reason: AdditiveDuplicateDiagnostic["reason"],
  score?: number,
  sourceBasisOverlap?: string[],
): AdditiveDuplicateDiagnostic {
  return {
    sourceId: card.sourceId,
    title: card.title,
    matchedSourceId: matchedCard.sourceId,
    matchedTitle: matchedCard.title,
    reason,
    ...(score === undefined ? {} : { score: Number(score.toFixed(3)) }),
    ...(sourceBasisOverlap?.length ? { sourceBasisOverlap } : {}),
  };
}

export const INTENT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "by",
  "card",
  "cards",
  "create",
  "build",
  "add",
  "implement",
  "make",
  "setup",
  "set",
  "up",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "proof",
  "test",
  "tests",
  "the",
  "this",
  "to",
  "with",
]);

export function normalizeExactText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function sourceBasisTokens(card: ProjectBoardSynthesisDraft["cards"][number]): Set<string> {
  return tokenSet([card.sourceId, card.sourceRefs.join(" "), card.phase ?? "", card.labels.join(" ")].join(" "));
}

export function intentTextForCard(card: ProjectBoardSynthesisDraft["cards"][number]): string {
  return [
    card.title,
    card.phase ?? "",
    card.labels.join(" "),
    card.description.slice(0, 800),
    card.acceptanceCriteria.slice(0, 4).join(" "),
  ].join(" ");
}

export function intentTokens(value: string): Set<string> {
  return tokenSet(value, INTENT_STOP_WORDS);
}

export function tokenSet(value: string, stopWords: Set<string> = new Set()): Set<string> {
  const tokens = new Set<string>();
  for (const rawToken of value.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const token = stemIntentToken(rawToken);
    if (token.length <= 2 || stopWords.has(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

export function stemIntentToken(token: string): string {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = intersection(a, b).size;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : overlap / union;
}

export function containmentScore(a: Set<string>, b: Set<string>): number {
  const denominator = Math.min(a.size, b.size);
  if (denominator === 0) return 0;
  return intersection(a, b).size / denominator;
}

export function intersection(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const value of a) if (b.has(value)) result.add(value);
  return result;
}

export function isAdditiveRefinement(refinement: ProjectBoardSynthesisRefinementContext): boolean {
  return isAdditiveProjectBoardRefinement(refinement);
}
