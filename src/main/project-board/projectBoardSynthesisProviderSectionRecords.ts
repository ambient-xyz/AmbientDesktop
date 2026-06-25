import { AmbientStreamFailureError, isRetryableAmbientProviderError } from "./projectBoardAmbientFacade";
import { stableBoardArtifactId, validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { extractProjectBoardProposalJsonlRecordsFromText } from "./projectBoardProgressivePlanning";
import type { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import { projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import type { ProjectBoardSynthesisSource } from "./projectBoardSynthesis";
import { errorMessage, sectionIdForRecord } from "./projectBoardSynthesisPlannerPrompts";
import {
  duplicateClarificationQuestionValidationMetadata,
  settledClarificationValidationMetadata,
} from "./projectBoardSynthesisProviderValidation";

export const PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE = "section_semantic_idle_timeout";
export const PROJECT_BOARD_SECTION_RETRY_LIMIT = 2;

export class ProjectBoardSectionNoRecordsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectBoardSectionNoRecordsError";
  }
}

export type ProjectBoardSectionFailureKind = "semantic_idle_timeout" | "stream_idle_timeout" | "no_records" | "request_or_validation_error";

export function buildProjectBoardSectionRetryPrompt(input: {
  basePrompt: string;
  section: ProjectBoardPlanningSection;
  sectionNumber: number;
  sectionCount: number;
  retryAttempt: number;
  maxRetries: number;
  priorRecords: ProposalJsonlRecordArtifact[];
  failureKind?: ProjectBoardSectionFailureKind;
  failureMessage?: string;
}): string {
  const recentValidatedRecords = input.priorRecords
    .filter((record) => record.type === "candidate_card" || record.type === "question" || record.type === "source_coverage")
    .slice(-16)
    .map((record, index) => {
      if (record.type === "candidate_card") return `${index + 1}. candidate_card ${record.sourceId}: ${record.title}`;
      if (record.type === "question") return `${index + 1}. question ${record.questionId}: ${record.question}`;
      return `${index + 1}. source_coverage ${record.sourceId} ${record.range}: ${record.status}`;
    })
    .join("\n");
  const sectionRecords = input.priorRecords
    .filter((record) => sectionIdForRecord(record) === input.section.id)
    .slice(-8)
    .map((record, index) => `${index + 1}. ${record.type}${record.type === "progress" ? `:${record.stage}` : ""}`)
    .join("\n");
  return [
    input.basePrompt,
    "",
    "Section retry context:",
    `- Retry attempt: ${input.retryAttempt} of ${input.maxRetries}.`,
    `- Original section identity: section ${input.sectionNumber}/${input.sectionCount}, id ${input.section.id}, source ${input.section.sourceId}, range ${input.section.range}.`,
    `- Prior failure kind: ${input.failureKind ?? "unknown"}.`,
    `- Prior failure message: ${input.failureMessage ?? "No failure message was captured."}`,
    "- Recover this section during the active run. Do not defer unless the same concrete failure still applies.",
    "- Emit only missing records for this same section. Do not re-emit candidate_card, question, dependency_edge, or source_coverage records that already appear in the validated ledger.",
    "- If the prior failure was a validation error, correct the response shape and keep the product content faithful to the source.",
    "- If the prior failure was no_records, emit concrete candidate_card and source_coverage records or a specific question record explaining the blocking ambiguity.",
    "",
    "Recent validated ledger records to avoid duplicating:",
    recentValidatedRecords || "No validated candidate/question/coverage records have been emitted yet.",
    "",
    "Recent records already associated with this section:",
    sectionRecords || "No validated records are associated with this section yet.",
  ].join("\n");
}

export function normalizeSectionProgressiveRecords(
  responseText: string,
  section: ProjectBoardPlanningSection,
): ProposalJsonlRecordArtifact[] {
  const records = extractProjectBoardProposalJsonlRecordsFromText(responseText);
  if (records.length > 0) return dedupeProgressiveRecords(records);
  return [
    validateProposalJsonlRecordArtifact({
      type: "error",
      code: "section_no_records",
      message: `Ambient/Pi did not return any valid progressive planning records for ${section.sourcePath || section.sourceTitle} (${section.heading}).`,
      recoverable: true,
      createdAt: new Date().toISOString(),
      metadata: { sectionId: section.id, sourceId: section.sourceId, range: section.range },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: section.sourceId,
      range: section.range,
      status: "unresolved",
      cardIds: [],
      note: "No valid candidate card records were returned for this section.",
      updatedAt: new Date().toISOString(),
    }),
  ];
}

export function limitSectionCandidateCardRecords(
  records: ProposalJsonlRecordArtifact[],
  maxCardsPerSection: number,
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
    if (candidateCount <= maxCardsPerSection) {
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
      code: "section_batch_card_limit",
      message: `Ambient/Pi returned ${candidateCount} candidate cards for ${section.sourcePath || section.sourceTitle} (${section.heading}); kept the first ${maxCardsPerSection} so cards can be persisted and dispatched incrementally.`,
      createdAt: new Date().toISOString(),
      metadata: {
        sectionId: section.id,
        sourceId: section.sourceId,
        omittedCardIds,
        candidateCount,
        maxCardsPerSection,
      },
    }),
  ];
}

export function retryableSectionResumeRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
  const deduped = dedupeProgressiveRecords(records);
  const retryableSections = retryableSectionKeysFromRecords(deduped);
  if (retryableSections.sectionIds.size === 0 && retryableSections.ranges.size === 0) return deduped;
  return deduped.filter((record) => !isRetryableSectionArtifact(record, retryableSections));
}

export function completedSectionIdsFromRecords(records: ProposalJsonlRecordArtifact[]): Set<string> {
  const retryableSections = retryableSectionKeysFromRecords(records);
  const completed = new Set<string>();
  for (const record of records) {
    if (record.type !== "progress" || record.stage !== "section_succeeded") continue;
    const sectionId = record.metadata.sectionId;
    if (typeof sectionId === "string" && sectionId.trim() && !retryableSections.sectionIds.has(sectionId.trim()))
      completed.add(sectionId.trim());
  }
  return completed;
}

export function retryableSectionKeysFromRecords(records: ProposalJsonlRecordArtifact[]): { sectionIds: Set<string>; ranges: Set<string> } {
  const sectionIds = new Set<string>();
  const ranges = new Set<string>();
  for (const record of records) {
    const sectionId = sectionIdForRecord(record);
    const rangeKey = sectionRangeKeyForRecord(record);
    const retryable =
      (record.type === "progress" && record.stage === "section_failed") ||
      (record.type === "error" &&
        ["section_planning_failed", "section_no_records", PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE].includes(record.code));
    if (!retryable) continue;
    if (sectionId) sectionIds.add(sectionId);
    if (rangeKey) ranges.add(rangeKey);
  }
  return { sectionIds, ranges };
}

export function isRetryableSectionArtifact(
  record: ProposalJsonlRecordArtifact,
  retryableSections: { sectionIds: Set<string>; ranges: Set<string> },
): boolean {
  const sectionId = sectionIdForRecord(record);
  if (sectionId && retryableSections.sectionIds.has(sectionId)) return true;
  const rangeKey = sectionRangeKeyForRecord(record);
  if (!rangeKey || !retryableSections.ranges.has(rangeKey)) return false;
  if (record.type === "source_coverage" && record.status === "unresolved") return true;
  if (
    record.type === "error" &&
    ["section_planning_failed", "section_no_records", PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE].includes(record.code)
  )
    return true;
  return record.type === "progress" && ["section_failed", "section_succeeded"].includes(record.stage);
}

export function sectionRangeKeyForRecord(record: ProposalJsonlRecordArtifact): string | undefined {
  const sourceId =
    record.type === "source_coverage" || record.type === "dependency_edge"
      ? undefined
      : "metadata" in record && typeof record.metadata.sourceId === "string"
        ? record.metadata.sourceId
        : undefined;
  const sourceCoverageSourceId = record.type === "source_coverage" ? record.sourceId : sourceId;
  const range =
    record.type === "source_coverage"
      ? record.range
      : "metadata" in record && typeof record.metadata.range === "string"
        ? record.metadata.range
        : "metadata" in record && typeof record.metadata.sectionRange === "string"
          ? record.metadata.sectionRange
          : undefined;
  if (!sourceCoverageSourceId?.trim() || !range?.trim()) return undefined;
  return `${sourceCoverageSourceId.trim()}::${range.trim()}`;
}

export function sectionStatusProgressRecord(
  section: ProjectBoardPlanningSection,
  input: {
    status: "succeeded" | "failed" | "skipped";
    sectionNumber: number;
    sectionCount: number;
    summary: string;
    statusLabel?: string;
    metadata?: Record<string, unknown>;
  },
): ProposalJsonlRecordArtifact {
  const label = input.statusLabel ?? (input.status === "succeeded" ? "Completed" : input.status === "failed" ? "Failed" : "Skipped");
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage: `section_${input.status}`,
    title: `${label} section ${input.sectionNumber}/${input.sectionCount}`,
    summary: input.summary,
    createdAt: new Date().toISOString(),
    metadata: {
      ...(input.metadata ?? {}),
      sectionStatus: input.status,
      sectionId: section.id,
      sectionIndex: input.sectionNumber,
      sectionCount: input.sectionCount,
      sourceId: section.sourceId,
      sourcePath: section.sourcePath,
      sectionHeading: section.heading,
      sectionRange: section.range,
    },
  });
}

export function sectionRetryProgressRecord(
  section: ProjectBoardPlanningSection,
  input: {
    status: "started" | "succeeded" | "exhausted";
    sectionNumber: number;
    sectionCount: number;
    retryAttempt: number;
    maxRetries: number;
    failureKind?: ProjectBoardSectionFailureKind;
    error?: string;
    sectionResponseCharCount?: number;
    sectionDurationMs?: number;
  },
): ProposalJsonlRecordArtifact {
  const statusText = input.status === "started" ? "Started" : input.status === "succeeded" ? "Recovered" : "Exhausted";
  const stage = `section_retry_${input.status}`;
  const summary =
    input.status === "started"
      ? `Retry ${input.retryAttempt}/${input.maxRetries} started for ${section.heading} before the active run moved to another section.`
      : input.status === "succeeded"
        ? `Retry ${input.retryAttempt}/${input.maxRetries} recovered ${section.heading}.`
        : `Retry budget exhausted for ${section.heading}; manual recovery is now required.`;
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage,
    title: `${statusText} section retry ${input.retryAttempt}/${input.maxRetries}`,
    summary,
    createdAt: new Date().toISOString(),
    metadata: {
      sectionStatus: input.status === "succeeded" ? "succeeded" : "failed",
      retryStatus: input.status,
      retryAttempt: input.retryAttempt,
      maxRetries: input.maxRetries,
      retriesExhausted: input.status === "exhausted",
      failureKind: input.failureKind,
      error: input.error,
      sectionResponseCharCount: input.sectionResponseCharCount,
      sectionDurationMs: input.sectionDurationMs,
      sectionId: section.id,
      sectionIndex: input.sectionNumber,
      sectionCount: input.sectionCount,
      sourceId: section.sourceId,
      sourcePath: section.sourcePath,
      sectionHeading: section.heading,
      sectionRange: section.range,
    },
  });
}

export function sectionFailureRecords(
  section: ProjectBoardPlanningSection,
  input: {
    sectionNumber: number;
    sectionCount: number;
    error: unknown;
    sectionResponseCharCount: number;
    sectionDurationMs: number;
    failureKind?: ProjectBoardSectionFailureKind;
    completedSectionCount?: number;
    candidateCardCount?: number;
    questionCount?: number;
  },
): ProposalJsonlRecordArtifact[] {
  const message = errorMessage(input.error);
  const createdAt = new Date().toISOString();
  const failureKind = input.failureKind ?? projectBoardSectionFailureKind(input.error);
  const semanticIdle = failureKind === "semantic_idle_timeout";
  const noRecords = failureKind === "no_records";
  const completedSectionCount = Math.max(0, Math.floor(input.completedSectionCount ?? 0));
  const candidateCardCount = Math.max(0, Math.floor(input.candidateCardCount ?? 0));
  const questionCount = Math.max(0, Math.floor(input.questionCount ?? 0));
  return [
    sectionStatusProgressRecord(section, {
      status: "failed",
      sectionNumber: input.sectionNumber,
      sectionCount: input.sectionCount,
      statusLabel: semanticIdle ? "Stalled" : noRecords ? "No records" : undefined,
      summary: semanticIdle
        ? `Section planning stalled without model content or planner records and can be retried from the last completed section: ${message}`
        : noRecords
          ? `Section planning returned no valid records after inline retry budget was exhausted: ${message}`
          : `Section planning failed and can be retried without discarding earlier section records: ${message}`,
      metadata: {
        recoverable: true,
        retryable: true,
        failureKind,
        error: message,
        sectionResponseCharCount: input.sectionResponseCharCount,
        sectionDurationMs: input.sectionDurationMs,
        completedSectionCount,
        candidateCardCount,
        questionCount,
        semanticIdleTimeoutMs: semanticIdleTimeoutMsFromMessage(message),
        ...settledClarificationValidationMetadata(input.error),
        ...duplicateClarificationQuestionValidationMetadata(input.error),
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "error",
      code: semanticIdle ? PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE : noRecords ? "section_no_records" : "section_planning_failed",
      message: semanticIdle
        ? `Ambient/Pi planning stalled for ${section.sourcePath || section.sourceTitle} (${section.heading}) because no model content or planner records arrived: ${message}`
        : noRecords
          ? `Ambient/Pi planning returned no valid records for ${section.sourcePath || section.sourceTitle} (${section.heading}) after inline retry: ${message}`
          : `Ambient/Pi planning failed for ${section.sourcePath || section.sourceTitle} (${section.heading}): ${message}`,
      recoverable: true,
      createdAt,
      metadata: {
        sectionId: section.id,
        sourceId: section.sourceId,
        range: section.range,
        sectionIndex: input.sectionNumber,
        sectionCount: input.sectionCount,
        failureKind,
        retryable: true,
        completedSectionCount,
        candidateCardCount,
        questionCount,
        semanticIdleTimeoutMs: semanticIdleTimeoutMsFromMessage(message),
        ...settledClarificationValidationMetadata(input.error),
        ...duplicateClarificationQuestionValidationMetadata(input.error),
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: section.sourceId,
      range: section.range,
      status: "unresolved",
      cardIds: [],
      note: semanticIdle
        ? `Section planning stalled before source coverage could be resolved; retry this section to ask Pi for this source slice again. ${message}`
        : noRecords
          ? `Section planning returned no valid records after inline retry; retry this section manually or defer it. ${message}`
          : `Section planning failed before source coverage could be resolved: ${message}`,
      updatedAt: createdAt,
    }),
  ];
}

export function projectBoardSectionFailureKind(error: unknown): ProjectBoardSectionFailureKind {
  if (error instanceof ProjectBoardSectionNoRecordsError) return "no_records";
  const message = errorMessage(error).toLowerCase();
  if (message.includes("without model content") || message.includes("without planner records")) return "semantic_idle_timeout";
  if (message.includes("without streaming events") || message.includes("stalled before streaming began")) return "stream_idle_timeout";
  if (message.includes("no valid planning records")) return "no_records";
  return "request_or_validation_error";
}

export function shouldRetryProjectBoardSectionFailure(error: unknown, input: { signal?: AbortSignal }): boolean {
  if (input.signal?.aborted) return false;
  if (error instanceof AmbientStreamFailureError && !isRetryableAmbientProviderError(error)) return false;
  const failureKind = projectBoardSectionFailureKind(error);
  return (
    failureKind === "no_records" ||
    failureKind === "semantic_idle_timeout" ||
    failureKind === "stream_idle_timeout" ||
    failureKind === "request_or_validation_error"
  );
}

export function semanticIdleTimeoutMsFromMessage(message: string): number | undefined {
  const match = message.match(/after\s+([\d,]+)ms\s+without model content/i);
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export function dedupeProgressiveRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
  const seen = new Set<string>();
  const result: ProposalJsonlRecordArtifact[] = [];
  for (const record of records) {
    const key = JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

export function recordsNotAlreadySeen(
  records: ProposalJsonlRecordArtifact[],
  existing: ProposalJsonlRecordArtifact[],
): ProposalJsonlRecordArtifact[] {
  const existingKeys = new Set(existing.map((record) => JSON.stringify(record)));
  return records.filter((record) => !existingKeys.has(JSON.stringify(record)));
}

export function wholeBoardPlanningSection(sources: ProjectBoardSynthesisSource[], projectName?: string): ProjectBoardPlanningSection {
  const included = sources.filter(projectBoardSourceIncludedInSynthesis);
  return {
    id: stableBoardArtifactId("section", [
      "whole-board",
      projectName,
      included.map((source) => source.id || source.path || source.title).join("|"),
    ]),
    sourceId: "workspace:all-sources",
    sourceKind: "implementation_plan",
    sourceTitle: projectName ? `${projectName} project corpus` : "Project corpus",
    sourceSummary: `${included.length} included source${included.length === 1 ? "" : "s"} prepared for whole-board synthesis.`,
    heading: "Whole board",
    range: "all",
    content: "",
    charCount: included.reduce((sum, source) => sum + [source.title, source.summary, source.excerpt, source.path].join("\n").length, 0),
    sourceIndex: 0,
    sectionIndex: 0,
    sourceSectionIndex: 0,
    sourceSectionCount: 1,
  };
}
