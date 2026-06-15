import type { ProjectBoardSource } from "../shared/types";
import {
  stableBoardArtifactId,
  validateProposalJsonlRecordArtifact,
  type ProposalJsonlRecordArtifact,
} from "./projectBoardArtifacts";
import { projectBoardQuestionsAreNearDuplicates } from "../shared/projectBoardQuestionDedupe";
import type {
  ProjectBoardSynthesisCardInput,
  ProjectBoardSynthesisDraft,
  ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import {
  projectBoardClarificationDecisionsForCandidate,
  projectBoardClarificationQuestionsForCandidate,
  projectBoardClarificationSuggestionsForCandidate,
} from "./projectBoardSynthesis";
import { projectBoardProofScopeWarningRecords } from "./projectBoardProofScope";

export interface ProjectBoardProgressiveRecordsInput {
  draft: ProjectBoardSynthesisDraft;
  sources?: Array<ProjectBoardSynthesisSource | ProjectBoardSource>;
  proposalId?: string;
  createdAt?: string;
  includeProgress?: boolean;
}

export interface ProjectBoardProgressiveDraftFallback {
  summary?: string;
  goal?: string;
  currentState?: string;
  targetUser?: string;
  qualityBar?: string;
  projectName?: string;
}

export function projectBoardProgressiveRecordsFromDraft(input: ProjectBoardProgressiveRecordsInput): ProposalJsonlRecordArtifact[] {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const sourceLookup = sourceLookupFor(input.sources ?? []);
  const records: ProposalJsonlRecordArtifact[] = [];
  if (input.includeProgress ?? true) {
    records.push(
      validateProposalJsonlRecordArtifact({
        type: "progress",
        stage: "cards",
        title: "Prepared candidate cards",
        summary: `Prepared ${input.draft.cards.length} candidate card${input.draft.cards.length === 1 ? "" : "s"} and ${input.draft.questions.length} question${input.draft.questions.length === 1 ? "" : "s"}.`,
        createdAt,
        metadata: { cardCount: input.draft.cards.length, questionCount: input.draft.questions.length },
      }),
    );
  }

  for (const card of input.draft.cards) {
    records.push(validateProposalJsonlRecordArtifact(candidateCardRecord(card, sourceLookup)));
  }
  for (const [questionIndex, question] of input.draft.questions.entries()) {
    records.push(
      validateProposalJsonlRecordArtifact({
        type: "question",
        questionId: stableBoardArtifactId("question", [input.proposalId, questionIndex, question]),
        question,
        required: true,
        createdAt,
      }),
    );
  }
  records.push(...sourceCoverageRecords(input.draft, input.sources ?? [], createdAt));
  records.push(...dependencyEdgeRecords(input.draft, createdAt));
  records.push(...warningRecords(input.draft, createdAt));
  records.push(validateProposalJsonlRecordArtifact(proposalFinalRecord(input.draft, createdAt)));
  return records;
}

export function projectBoardSynthesisDraftFromProgressiveRecords(
  records: ProposalJsonlRecordArtifact[],
  fallback: ProjectBoardProgressiveDraftFallback = {},
): ProjectBoardSynthesisDraft {
  const final = records.filter((record) => record.type === "proposal_final").at(-1);
  const questionsByCardId = new Map<string, string[]>();
  for (const record of records) {
    if (record.type !== "question" || !record.cardId) continue;
    questionsByCardId.set(record.cardId, [...(questionsByCardId.get(record.cardId) ?? []), record.question]);
  }
  const latestCardsBySourceId = new Map<string, Extract<ProposalJsonlRecordArtifact, { type: "candidate_card" }>>();
  for (const record of records) {
    if (record.type === "candidate_card") latestCardsBySourceId.set(record.sourceId, record);
  }
  const cards = [...latestCardsBySourceId.values()].map((record): ProjectBoardSynthesisCardInput => {
    const clarificationQuestions = dedupeStrings([
      ...(record.clarificationQuestions ?? []),
      ...(questionsByCardId.get(record.sourceId) ?? []),
    ]);
    const clarificationDecisions = projectBoardClarificationDecisionsForCandidate({
      title: record.title,
      candidateStatus: record.candidateStatus,
      description: record.description,
      clarificationDecisions: record.clarificationDecisions,
      clarificationQuestions,
      clarificationSuggestions: record.clarificationSuggestions ?? [],
      acceptanceCriteria: record.acceptanceCriteria,
      testPlan: record.testPlan,
    });
    const mirroredQuestions = projectBoardClarificationQuestionsForCandidate({
      title: record.title,
      candidateStatus: record.candidateStatus,
      description: record.description,
      clarificationDecisions,
      clarificationQuestions,
      clarificationSuggestions: record.clarificationSuggestions ?? [],
      acceptanceCriteria: record.acceptanceCriteria,
      testPlan: record.testPlan,
    });
    return {
      sourceId: record.sourceId,
      title: record.title,
      description: record.description,
      candidateStatus: record.candidateStatus,
      priority: record.priority,
      phase: record.phase,
      labels: record.labels,
      blockedBy: record.blockedBy,
      acceptanceCriteria: record.acceptanceCriteria,
      testPlan: record.testPlan,
      sourceRefs: record.sourceRefs.flatMap(sourceRefToString),
      clarificationQuestions: mirroredQuestions,
      clarificationSuggestions: projectBoardClarificationSuggestionsForCandidate({
        title: record.title,
        candidateStatus: record.candidateStatus,
        description: record.description,
        clarificationDecisions,
        clarificationQuestions: mirroredQuestions,
        clarificationSuggestions: record.clarificationSuggestions ?? [],
        acceptanceCriteria: record.acceptanceCriteria,
        testPlan: record.testPlan,
      }),
      clarificationDecisions,
      objectiveProvenance: record.objectiveProvenance,
      uiMockRole: record.uiMockRole,
      requiresUiMockApproval: record.requiresUiMockApproval,
    };
  });
  if (cards.length === 0) {
    throw new Error("Progressive project-board planning records did not include any candidate cards.");
  }
  const cardClarificationQuestions = cards.flatMap((card) => card.clarificationQuestions ?? []);
  const questions = dedupeStrings([
    ...(final?.type === "proposal_final" ? final.questions : []),
    ...records.flatMap((record) => (record.type === "question" && !record.cardId ? [record.question] : [])),
  ]).filter((question) => !cardClarificationQuestions.some((cardQuestion) => projectBoardQuestionsAreNearDuplicates(cardQuestion, question)));
  const coverageNotes = records.flatMap((record) =>
    record.type === "source_coverage" && record.note ? [`${record.sourceId}: ${record.status}. ${record.note}`] : [],
  );
  const warnings = records.flatMap((record) => (record.type === "warning" ? [`Warning ${record.code}: ${record.message}`] : []));
  return {
    summary: final?.type === "proposal_final" ? final.summary : fallback.summary ?? `Recovered ${cards.length} candidate card${cards.length === 1 ? "" : "s"} from progressive planning records.`,
    goal: final?.type === "proposal_final" ? final.goal : fallback.goal ?? (fallback.projectName ? `Build the project board for ${fallback.projectName}.` : "Build the project board from recovered planning records."),
    currentState: final?.type === "proposal_final" ? final.currentState : fallback.currentState ?? "Recovered from progressive planning artifacts before a final proposal was available.",
    targetUser: final?.type === "proposal_final" ? final.targetUser : fallback.targetUser ?? "Project board reviewer.",
    qualityBar: final?.type === "proposal_final" ? final.qualityBar : fallback.qualityBar ?? "Every recovered card should carry acceptance criteria and proof expectations before execution.",
    assumptions: final?.type === "proposal_final" ? final.assumptions : [],
    questions,
    sourceNotes: [...(final?.type === "proposal_final" ? final.sourceNotes : []), ...coverageNotes, ...warnings].slice(0, 20),
    cards,
  };
}

export interface ProjectBoardProposalJsonlExtraction {
  records: ProposalJsonlRecordArtifact[];
  droppedCount: number;
  firstError?: string;
}

export function extractProjectBoardProposalJsonlRecordsWithDiagnostics(text: string): ProjectBoardProposalJsonlExtraction {
  const records: ProposalJsonlRecordArtifact[] = [];
  const drops: ExtractionDropTracker = { count: 0 };
  const maybeObject = parseLooseJsonObject(text);
  const objectRecords =
    maybeObject && Array.isArray(maybeObject.progressiveRecords)
      ? maybeObject.progressiveRecords
      : maybeObject && Array.isArray(maybeObject.records)
        ? maybeObject.records
        : [];
  for (const record of objectRecords) {
    const validated = validateProposalJsonlRecord(record, drops);
    if (validated) records.push(validated);
  }

  for (const block of fencedJsonlBlocks(text)) {
    records.push(...parseJsonlLines(block, drops));
  }
  if (records.length === 0) records.push(...parseJsonlLines(text, drops));
  return { records: dedupeRecords(records), droppedCount: drops.count, firstError: drops.firstError };
}

export function extractProjectBoardProposalJsonlRecordsFromText(text: string): ProposalJsonlRecordArtifact[] {
  const { records, droppedCount, firstError } = extractProjectBoardProposalJsonlRecordsWithDiagnostics(text);
  // Partial loss used to be invisible: 4 of 6 cards could fail validation while the
  // section reported success. Surface it through the existing warning plumbing. A
  // fully-empty result stays empty so the section_no_records retry path still fires.
  if (droppedCount === 0 || records.length === 0) return records;
  return [
    ...records,
    validateProposalJsonlRecordArtifact({
      type: "warning",
      code: "proposal_jsonl_records_dropped",
      message: `${droppedCount} JSONL planning record${droppedCount === 1 ? "" : "s"} failed validation and ${droppedCount === 1 ? "was" : "were"} dropped from this response.${firstError ? ` First error: ${firstError.slice(0, 500)}` : ""}`,
      createdAt: new Date().toISOString(),
      metadata: { droppedCount, ...(firstError ? { firstError: firstError.slice(0, 500) } : {}) },
    }),
  ];
}

export function proposalJsonlContent(records: ProposalJsonlRecordArtifact[], type?: ProposalJsonlRecordArtifact["type"]): string {
  const filtered = type ? records.filter((record) => record.type === type) : records;
  return filtered.map((record) => JSON.stringify(record)).join("\n").concat(filtered.length > 0 ? "\n" : "");
}

function candidateCardRecord(
  card: ProjectBoardSynthesisCardInput,
  sourceLookup: ReturnType<typeof sourceLookupFor>,
): ProposalJsonlRecordArtifact {
  const clarificationQuestions = projectBoardClarificationQuestionsForCandidate(card);
  const clarificationDecisions = projectBoardClarificationDecisionsForCandidate({
    ...card,
    clarificationQuestions,
  });
  const clarificationSuggestions = projectBoardClarificationSuggestionsForCandidate({
    ...card,
    clarificationDecisions,
    clarificationQuestions,
  });
  return validateProposalJsonlRecordArtifact({
    type: "candidate_card",
    sourceId: card.sourceId,
    title: card.title,
    description: card.description,
    candidateStatus: card.candidateStatus,
    priority: card.priority,
    phase: card.phase,
    labels: card.labels,
    blockedBy: card.blockedBy.filter((blocker) => safeArtifactId(blocker)),
    sourceRefs: card.sourceRefs.flatMap((ref) => sourceRefFromString(ref, sourceLookup)),
    clarificationQuestions,
    clarificationSuggestions,
    clarificationDecisions,
    acceptanceCriteria: card.acceptanceCriteria,
    testPlan: card.testPlan,
    objectiveProvenance: card.objectiveProvenance,
    uiMockRole: card.uiMockRole,
    requiresUiMockApproval: card.requiresUiMockApproval,
  });
}

function proposalFinalRecord(draft: ProjectBoardSynthesisDraft, createdAt: string): ProposalJsonlRecordArtifact {
  return validateProposalJsonlRecordArtifact({
    type: "proposal_final",
    summary: draft.summary,
    goal: draft.goal,
    currentState: draft.currentState,
    targetUser: draft.targetUser,
    qualityBar: draft.qualityBar,
    assumptions: draft.assumptions,
    questions: draft.questions,
    sourceNotes: draft.sourceNotes,
    createdAt,
    metadata: {
      cardCount: draft.cards.length,
      questionCount: draft.questions.length,
    },
  });
}

function sourceCoverageRecords(
  draft: ProjectBoardSynthesisDraft,
  sources: Array<ProjectBoardSynthesisSource | ProjectBoardSource>,
  updatedAt: string,
): ProposalJsonlRecordArtifact[] {
  return sources
    .filter((source) => source.kind !== "ignored" && source.includeInSynthesis !== false)
    .map((source) => {
      const sourceId = source.id && safeArtifactId(source.id) ? source.id : stableBoardArtifactId("source", [source.path, source.title]);
      const cardIds = draft.cards.filter((card) => cardCoversSource(card, source)).map((card) => card.sourceId);
      return validateProposalJsonlRecordArtifact({
        type: "source_coverage",
        sourceId,
        status: cardIds.length > 0 ? "covered" : "unresolved",
        cardIds,
        note:
          cardIds.length > 0
            ? `${cardIds.length} candidate card${cardIds.length === 1 ? "" : "s"} reference this source.`
            : "No candidate card explicitly references this source yet.",
        updatedAt,
      });
    });
}

function dependencyEdgeRecords(draft: ProjectBoardSynthesisDraft, createdAt: string): ProposalJsonlRecordArtifact[] {
  const candidateIds = new Set(draft.cards.map((card) => card.sourceId));
  return draft.cards.flatMap((card) =>
    card.blockedBy.flatMap((blocker) => {
      if (!candidateIds.has(blocker) || blocker === card.sourceId) return [];
      return [
        validateProposalJsonlRecordArtifact({
          type: "dependency_edge",
          fromCardId: blocker,
          toCardId: card.sourceId,
          reason: `${card.title} is blocked by ${blocker}.`,
          createdAt,
        }),
      ];
    }),
  );
}

function warningRecords(draft: ProjectBoardSynthesisDraft, createdAt: string): ProposalJsonlRecordArtifact[] {
  const candidateIds = new Set(draft.cards.map((card) => card.sourceId));
  const dependencyWarnings = draft.cards.flatMap((card) =>
    card.blockedBy.flatMap((blocker) => {
      if (candidateIds.has(blocker)) return [];
      return [
        validateProposalJsonlRecordArtifact({
          type: "warning",
          code: "external_dependency",
          message: `${card.title} references blocker '${blocker}' that is not a candidate card in this proposal.`,
          createdAt,
          metadata: { cardId: card.sourceId, blocker },
        }),
      ];
    }),
  );
  return [...dependencyWarnings, ...projectBoardProofScopeWarningRecords(draft.cards, createdAt)];
}

function sourceLookupFor(sources: Array<ProjectBoardSynthesisSource | ProjectBoardSource>) {
  const byLoose = new Map<string, ProjectBoardSynthesisSource | ProjectBoardSource>();
  for (const source of sources) {
    const keys = [source.id, source.path, source.title].filter((value): value is string => Boolean(value?.trim()));
    for (const key of keys) byLoose.set(normalizeLoose(key), source);
  }
  return byLoose;
}

function sourceRefFromString(ref: string, sourceLookup: ReturnType<typeof sourceLookupFor>): Array<{ sourceId?: string; path?: string; contentHash?: string }> {
  const trimmed = ref.trim();
  if (!trimmed) return [];
  const source = sourceLookup.get(normalizeLoose(trimmed));
  if (source?.id) return [{ sourceId: source.id, ...(source.contentHash ? { contentHash: source.contentHash } : {}) }];
  if (isSafeProjectRelativePath(trimmed)) return [{ path: trimmed }];
  return [];
}

function sourceRefToString(ref: { sourceId?: string; path?: string; range?: string; quote?: string; note?: string; contentHash?: string }): string[] {
  if (ref.path) return [ref.path];
  if (ref.sourceId) return [ref.sourceId];
  return [];
}

function cardCoversSource(card: ProjectBoardSynthesisCardInput, source: ProjectBoardSynthesisSource | ProjectBoardSource): boolean {
  const needles = [source.id, source.path, source.title].filter((value): value is string => Boolean(value?.trim())).map(normalizeLoose);
  const haystack = normalizeLoose([card.sourceId, card.title, card.description, ...card.sourceRefs].join("\n"));
  return needles.some((needle) => needle.length > 0 && haystack.includes(needle));
}

function fencedJsonlBlocks(text: string): string[] {
  return [...text.matchAll(/```(?:jsonl|ndjson|json-lines)?\s*([\s\S]*?)```/gi)].map((match) => match[1]?.trim() ?? "").filter(Boolean);
}

interface ExtractionDropTracker {
  count: number;
  firstError?: string;
}

function parseJsonlLines(text: string, drops?: ExtractionDropTracker): ProposalJsonlRecordArtifact[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim().replace(/^data:\s*/, "");
      if (!trimmed || !trimmed.startsWith("{")) return [];
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        const validated = validateProposalJsonlRecord(parsed, drops);
        return validated ? [validated] : [];
      } catch (error) {
        recordExtractionDrop(drops, error);
        return [];
      }
    });
}

function recordExtractionDrop(drops: ExtractionDropTracker | undefined, error: unknown): void {
  if (!drops) return;
  drops.count += 1;
  if (!drops.firstError) drops.firstError = error instanceof Error ? error.message : String(error);
}

function parseLooseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

function validateProposalJsonlRecord(value: unknown, drops?: ExtractionDropTracker): ProposalJsonlRecordArtifact | undefined {
  try {
    return validateProposalJsonlRecordArtifact(value);
  } catch (error) {
    recordExtractionDrop(drops, error);
    return undefined;
  }
}

function dedupeRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = JSON.stringify(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeArtifactId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,159}$/.test(value);
}

function isSafeProjectRelativePath(value: string): boolean {
  return Boolean(value) && !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value) && !value.split(/[\\/]+/).includes("..");
}

function normalizeLoose(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeLoose(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
