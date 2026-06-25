import type { ProjectBoardRenderedCardLedgerEntry } from "../../shared/projectBoardTypes";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { extractProjectBoardProposalJsonlRecordsWithDiagnostics } from "./projectBoardProgressivePlanning";
import type { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import { buildProjectBoardRenderedCardLedger } from "./projectBoardRenderedCardLedger";
import type { ProjectBoardSynthesisSource } from "./projectBoardSynthesis";
import { parseProjectBoardSynthesisJson, type PlannerBatchStatus } from "./projectBoardSynthesisPlannerPrompts";
import { normalizeExactText } from "./projectBoardSynthesisProviderCandidateFilters";

export function limitPlannerBatchCandidateCardRecords(
  records: ProposalJsonlRecordArtifact[],
  maxCardsPerBatch: number,
  section: ProjectBoardPlanningSection,
): ProposalJsonlRecordArtifact[] {
  const kept: ProposalJsonlRecordArtifact[] = [];
  const keptCardIds = new Set<string>();
  const omittedCardIds: string[] = [];
  let candidateCount = 0;
  for (const record of records) {
    if (record.type !== "candidate_card") {
      kept.push(record);
      continue;
    }
    candidateCount += 1;
    if (candidateCount <= maxCardsPerBatch) {
      kept.push(record);
      keptCardIds.add(record.sourceId);
    } else {
      omittedCardIds.push(record.sourceId);
    }
  }
  if (omittedCardIds.length === 0) return kept;
  const sanitized = kept.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "source_coverage") {
      return [
        validateProposalJsonlRecordArtifact({
          ...record,
          cardIds: record.cardIds.filter((cardId) => keptCardIds.has(cardId)),
          status:
            record.status === "covered" && record.cardIds.some((cardId) => omittedCardIds.includes(cardId)) ? "partial" : record.status,
        }),
      ];
    }
    if (record.type === "dependency_edge" && (omittedCardIds.includes(record.fromCardId) || omittedCardIds.includes(record.toCardId))) {
      return [];
    }
    return [record];
  });
  return [
    ...sanitized,
    validateProposalJsonlRecordArtifact({
      type: "warning",
      code: "planner_batch_card_limit",
      message: `Ambient/Pi returned ${candidateCount} candidate cards for planner batch ${section.heading}; kept the first ${maxCardsPerBatch} so cards can be persisted and dispatched incrementally.`,
      createdAt: new Date().toISOString(),
      metadata: {
        sectionId: section.id,
        sourceId: section.sourceId,
        omittedCardIds,
        candidateCount,
        maxCardsPerBatch,
      },
    }),
  ];
}

export function attachPlannerRecordSourceSnapshots(
  records: ProposalJsonlRecordArtifact[],
  sources: ProjectBoardSynthesisSource[],
): ProposalJsonlRecordArtifact[] {
  const sourceById = new Map(sources.flatMap((source) => (source.id?.trim() ? [[source.id.trim(), source] as const] : [])));
  const sourceByPath = new Map(sources.flatMap((source) => (source.path?.trim() ? [[source.path.trim(), source] as const] : [])));
  return records.map((record) => {
    if (record.type !== "candidate_card") return record;
    const sourceRefs = record.sourceRefs.map((ref) => {
      if (ref.contentHash) return ref;
      const source = ref.sourceId ? sourceById.get(ref.sourceId) : ref.path ? sourceByPath.get(ref.path) : undefined;
      if (!source?.contentHash) return ref;
      return { ...ref, contentHash: source.contentHash };
    });
    if (JSON.stringify(sourceRefs) === JSON.stringify(record.sourceRefs)) return record;
    return validateProposalJsonlRecordArtifact({ ...record, sourceRefs });
  });
}

export interface PlannerBatchRenderedDuplicateDiagnostic {
  sourceId: string;
  title: string;
  matchedCardId: string;
  matchedTitle: string;
  reason: "source_id" | "title";
  duplicateDecision: ProjectBoardRenderedCardLedgerEntry["duplicateDecision"];
  invalidationState: ProjectBoardRenderedCardLedgerEntry["invalidationState"];
  invalidationReasons: ProjectBoardRenderedCardLedgerEntry["invalidationReasons"];
  restartAction: ProjectBoardRenderedCardLedgerEntry["restartAction"];
  renderFingerprint: string;
}

export function filterPlannerBatchRenderedCardDuplicates(
  records: ProposalJsonlRecordArtifact[],
  priorRecords: ProposalJsonlRecordArtifact[],
  section: ProjectBoardPlanningSection,
  sources: ProjectBoardSynthesisSource[],
): {
  records: ProposalJsonlRecordArtifact[];
  diagnostics: PlannerBatchRenderedDuplicateDiagnostic[];
  warningRecords: ProposalJsonlRecordArtifact[];
} {
  const renderedCards = [...buildProjectBoardRenderedCardLedger(priorRecords, { sources }).entries];
  if (renderedCards.length === 0) return { records, diagnostics: [], warningRecords: [] };

  const diagnostics: PlannerBatchRenderedDuplicateDiagnostic[] = [];
  const invalidatedMatches: PlannerBatchRenderedDuplicateDiagnostic[] = [];
  const retainedRecords: ProposalJsonlRecordArtifact[] = [];
  const droppedCardIds = new Set<string>();
  for (const record of records) {
    if (record.type !== "candidate_card") {
      retainedRecords.push(record);
      continue;
    }
    const match = renderedCardDuplicateMatch(record, renderedCards);
    if (match) {
      if (match.restartAction === "regenerate_card") {
        invalidatedMatches.push(match);
      } else {
        diagnostics.push(match);
        droppedCardIds.add(normalizeExactText(record.sourceId));
        continue;
      }
    }
    retainedRecords.push(record);
    const entry = buildProjectBoardRenderedCardLedger([record], { sources }).entries[0];
    if (entry) renderedCards.push(entry);
  }

  if (diagnostics.length === 0 && invalidatedMatches.length === 0) return { records, diagnostics: [], warningRecords: [] };
  const sanitizedRecords = retainedRecords.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "question" && record.cardId && droppedCardIds.has(normalizeExactText(record.cardId))) return [];
    if (
      record.type === "dependency_edge" &&
      (droppedCardIds.has(normalizeExactText(record.fromCardId)) || droppedCardIds.has(normalizeExactText(record.toCardId)))
    ) {
      return [];
    }
    if (record.type === "source_coverage") {
      const cardIds = record.cardIds.filter((cardId) => !droppedCardIds.has(normalizeExactText(cardId)));
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

  const warningRecords: ProposalJsonlRecordArtifact[] = [];
  if (diagnostics.length > 0) {
    const duplicateSummary = `Filtered ${diagnostics.length} planner-batch candidate card${
      diagnostics.length === 1 ? "" : "s"
    } already present in the rendered-card ledger.`;
    warningRecords.push(
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "planner_batch_rendered_card_duplicate_filtered",
        message: duplicateSummary,
        createdAt: new Date().toISOString(),
        metadata: {
          enforcement: "rendered_card_ledger",
          sectionId: section.id,
          sourceId: section.sourceId,
          duplicateCount: diagnostics.length,
          duplicateCandidates: diagnostics.slice(0, 20),
        },
      }),
    );
  }
  if (invalidatedMatches.length > 0) {
    const invalidatedSummary = `Allowed ${invalidatedMatches.length} planner-batch candidate card${
      invalidatedMatches.length === 1 ? "" : "s"
    } to regenerate because the rendered-card ledger entry was invalidated.`;
    warningRecords.push(
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "planner_batch_rendered_card_ledger_invalidated",
        message: invalidatedSummary,
        createdAt: new Date().toISOString(),
        metadata: {
          enforcement: "rendered_card_ledger",
          sectionId: section.id,
          sourceId: section.sourceId,
          invalidatedCount: invalidatedMatches.length,
          invalidatedCandidates: invalidatedMatches.slice(0, 20),
        },
      }),
    );
  }
  return {
    records: sanitizedRecords,
    diagnostics,
    warningRecords,
  };
}

export function renderedCardDuplicateMatch(
  record: Extract<ProposalJsonlRecordArtifact, { type: "candidate_card" }>,
  renderedCards: ProjectBoardRenderedCardLedgerEntry[],
): PlannerBatchRenderedDuplicateDiagnostic | undefined {
  const sourceId = normalizeExactText(record.sourceId);
  const title = normalizeExactText(record.title);
  for (const rendered of renderedCards) {
    const renderedCardId = normalizeExactText(rendered.cardId);
    const renderedTitle = normalizeExactText(rendered.title);
    const reason = sourceId && sourceId === renderedCardId ? "source_id" : title && title === renderedTitle ? "title" : undefined;
    if (!reason) continue;
    return {
      sourceId: record.sourceId,
      title: record.title,
      matchedCardId: rendered.cardId,
      matchedTitle: rendered.title,
      reason,
      duplicateDecision: rendered.duplicateDecision,
      invalidationState: rendered.invalidationState,
      invalidationReasons: rendered.invalidationReasons,
      restartAction: rendered.restartAction,
      renderFingerprint: rendered.renderFingerprint,
    };
  }
  return undefined;
}

export function plannerBatchStatusFromResponse(responseText: string, records: ProposalJsonlRecordArtifact[]): PlannerBatchStatus {
  const parsed = safeParsePlannerBatchObject(responseText);
  const status =
    typeof parsed?.plannerStatus === "string" ? parsed.plannerStatus : typeof parsed?.status === "string" ? parsed.status : undefined;
  if (isPlannerBatchStatus(status)) return status;
  // proposal_final is stripped from normalized batch records, so a model signaling
  // completion only via that record must be detected on the raw extraction or the
  // run would be billed for extra batches until coverage/maxBatches stops it.
  if (
    records.some((record) => record.type === "proposal_final") ||
    extractProjectBoardProposalJsonlRecordsWithDiagnostics(responseText).records.some((record) => record.type === "proposal_final")
  ) {
    return "planning_complete";
  }
  if (records.some((record) => record.type === "question") && !records.some((record) => record.type === "candidate_card"))
    return "needs_user_decision";
  return "continue";
}

export function safeParsePlannerBatchObject(responseText: string): Record<string, unknown> | undefined {
  try {
    const parsed = parseProjectBoardSynthesisJson(responseText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function isPlannerBatchStatus(value: unknown): value is PlannerBatchStatus {
  return (
    value === "continue" ||
    value === "planning_complete" ||
    value === "needs_user_decision" ||
    value === "budget_exhausted" ||
    value === "stale_source_snapshot" ||
    value === "validation_failed" ||
    value === "user_cancelled"
  );
}

export function previewProjectBoardPlannerResponse(responseText: string): string {
  return responseText.replace(/\s+/g, " ").trim().slice(0, 500);
}
