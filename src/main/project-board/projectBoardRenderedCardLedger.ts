import type {
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardTouchedField,
  ProjectBoardRenderedCardDuplicateDecision,
  ProjectBoardRenderedCardInvalidationReason,
  ProjectBoardRenderedCardLedger,
  ProjectBoardRenderedCardLedgerEntry,
  ProjectBoardRenderedCardRestartAction,
  ProjectBoardRenderedCardSourceSnapshot,
  ProjectBoardRenderedCardSourceRef,
  ProjectBoardRenderedCardSplitLineage,
} from "../../shared/types";
import { stableBoardArtifactId } from "./projectBoardArtifacts";

const PROJECT_BOARD_RENDERED_CARD_LEDGER_SCHEMA_VERSION = 1;

const candidateStatuses = new Set<ProjectBoardCardCandidateStatus>([
  "needs_clarification",
  "ready_to_create",
  "evidence",
  "duplicate",
  "rejected",
]);

type CandidateLike = Record<string, unknown> & {
  sourceId?: unknown;
  cardId?: unknown;
  title?: unknown;
  candidateStatus?: unknown;
  phase?: unknown;
  blockedBy?: unknown;
  sourceRefs?: unknown;
  clarificationQuestions?: unknown;
  clarificationAnswers?: unknown;
  userTouchedFields?: unknown;
  userTouchedAt?: unknown;
};

export interface ProjectBoardRenderedCardLedgerSourceInput {
  id?: string;
  sourceId?: string;
  path?: string;
  title?: string;
  contentHash?: string;
}

export interface BuildProjectBoardRenderedCardLedgerOptions {
  sources?: readonly ProjectBoardRenderedCardLedgerSourceInput[];
  expectedSchemaVersion?: number;
  expectedRenderFingerprintsByCardId?: ReadonlyMap<string, string> | Record<string, string>;
  userTouchedCardIds?: Iterable<string>;
}

export function buildProjectBoardRenderedCardLedger(
  records: readonly unknown[],
  options: BuildProjectBoardRenderedCardLedgerOptions = {},
): ProjectBoardRenderedCardLedger {
  const candidates = latestCandidateRecords(records);
  const context = renderedCardLedgerContext(options);
  const entries = candidates.map((record) => projectBoardRenderedCardLedgerEntry(record, context));
  return {
    schemaVersion: PROJECT_BOARD_RENDERED_CARD_LEDGER_SCHEMA_VERSION,
    cardCount: entries.length,
    blockedCardCount: entries.filter((entry) => entry.restartAction === "wait_for_clarification" || entry.blockedBy.length > 0).length,
    duplicateCardCount: entries.filter((entry) => entry.duplicateDecision === "duplicate").length,
    rejectedCardCount: entries.filter((entry) => entry.duplicateDecision === "rejected").length,
    evidenceCardCount: entries.filter((entry) => entry.duplicateDecision === "evidence").length,
    splitLineageCount: entries.filter((entry) => entry.splitLineage).length,
    invalidatedCardCount: entries.filter((entry) => entry.invalidationState === "invalidated").length,
    checksum: stableBoardArtifactId("rendered-card-ledger", [stableJson(entries)]),
    entries,
  };
}

interface ProjectBoardRenderedCardLedgerContext {
  sourcesById: Map<string, ProjectBoardRenderedCardLedgerSourceInput>;
  sourcesByPath: Map<string, ProjectBoardRenderedCardLedgerSourceInput>;
  hasSourceContext: boolean;
  expectedSchemaVersion: number;
  expectedRenderFingerprintsByCardId: Map<string, string>;
  userTouchedCardIds: Set<string>;
}

function renderedCardLedgerContext(options: BuildProjectBoardRenderedCardLedgerOptions): ProjectBoardRenderedCardLedgerContext {
  const sourcesById = new Map<string, ProjectBoardRenderedCardLedgerSourceInput>();
  const sourcesByPath = new Map<string, ProjectBoardRenderedCardLedgerSourceInput>();
  for (const source of options.sources ?? []) {
    const sourceId = source.sourceId?.trim() || source.id?.trim();
    if (sourceId) sourcesById.set(sourceId, source);
    if (source.path?.trim()) sourcesByPath.set(source.path.trim(), source);
  }
  const expectedRenderFingerprintsByCardId =
    options.expectedRenderFingerprintsByCardId instanceof Map
      ? new Map(options.expectedRenderFingerprintsByCardId)
      : new Map(Object.entries(options.expectedRenderFingerprintsByCardId ?? {}));
  return {
    sourcesById,
    sourcesByPath,
    hasSourceContext: (options.sources?.length ?? 0) > 0,
    expectedSchemaVersion: options.expectedSchemaVersion ?? PROJECT_BOARD_RENDERED_CARD_LEDGER_SCHEMA_VERSION,
    expectedRenderFingerprintsByCardId,
    userTouchedCardIds: new Set(options.userTouchedCardIds ?? []),
  };
}

function latestCandidateRecords(records: readonly unknown[]): CandidateLike[] {
  const byId = new Map<string, CandidateLike>();
  for (const record of records) {
    if (!isRecord(record)) continue;
    if (record.type !== "candidate_card") continue;
    const candidate = record;
    const cardId = nonemptyString(candidate.sourceId) ?? nonemptyString(candidate.cardId);
    if (!cardId) continue;
    byId.set(cardId, candidate);
  }
  return [...byId.values()];
}

function isRecord(value: unknown): value is CandidateLike {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function projectBoardRenderedCardLedgerEntry(
  record: CandidateLike,
  context: ProjectBoardRenderedCardLedgerContext,
): ProjectBoardRenderedCardLedgerEntry {
  const cardId = nonemptyString(record.sourceId) ?? nonemptyString(record.cardId) ?? "unknown-card";
  const title = nonemptyString(record.title) ?? cardId;
  const candidateStatus = normalizeCandidateStatus(record.candidateStatus);
  const phase = nonemptyString(record.phase);
  const blockedBy = normalizeStringList(record.blockedBy);
  const sourceRefs = normalizeSourceRefs(record.sourceRefs);
  const sourceRefIds = uniqueStrings(sourceRefs.flatMap((ref) => (ref.sourceId ? [ref.sourceId] : [])));
  const sourceSnapshots = sourceSnapshotRefs(sourceRefs, context);
  const clarificationQuestions = normalizeStringList(record.clarificationQuestions);
  const clarificationAnswers = normalizeClarificationAnswers(record.clarificationAnswers);
  const answeredQuestions = new Set(clarificationAnswers.map((answer) => normalizeQuestionKey(answer.question)).filter(Boolean));
  const unresolvedQuestions = clarificationQuestions.filter((question) => !answeredQuestions.has(normalizeQuestionKey(question)));
  const pendingClarificationCount =
    unresolvedQuestions.length > 0
      ? unresolvedQuestions.length
      : candidateStatus === "needs_clarification"
        ? Math.max(1, clarificationQuestions.length)
        : 0;
  const clarificationState =
    pendingClarificationCount > 0 ? "pending" : clarificationQuestions.length > 0 ? "resolved" : "none";
  const duplicateDecision = renderedCardDuplicateDecision(candidateStatus);
  const splitLineage = inferSplitLineage(cardId);
  const userTouchedFields = normalizeTouchedFields(record.userTouchedFields);
  const userTouchedAt = nonemptyString(record.userTouchedAt);
  const renderFingerprint = stableBoardArtifactId("rendered-card", [
    stableJson({
      schemaVersion: PROJECT_BOARD_RENDERED_CARD_LEDGER_SCHEMA_VERSION,
      cardId,
      title,
      candidateStatus,
      phase,
      blockedBy,
      sourceRefs,
      sourceRefIds,
      sourceSnapshots,
      clarificationQuestions,
      clarificationAnswers,
      splitLineage,
      userTouchedFields,
      userTouchedAt,
    }),
  ]);
  const invalidationReasons = renderedCardInvalidationReasons({
    cardId,
    renderFingerprint,
    sourceSnapshots,
    userTouchedFields,
    context,
  });
  const invalidationState = invalidationReasons.length > 0 ? "invalidated" : "valid";
  const restartAction =
    invalidationState === "invalidated"
      ? "regenerate_card"
      : renderedCardRestartAction({ duplicateDecision, pendingClarificationCount });

  return {
    schemaVersion: PROJECT_BOARD_RENDERED_CARD_LEDGER_SCHEMA_VERSION,
    cardId,
    title,
    candidateStatus,
    ...(phase ? { phase } : {}),
    blockedBy,
    sourceRefs,
    sourceRefIds,
    sourceSnapshots,
    clarificationQuestionCount: clarificationQuestions.length,
    pendingClarificationCount,
    clarificationState,
    duplicateDecision,
    invalidationState,
    invalidationReasons,
    restartAction,
    renderFingerprint,
    ...(userTouchedFields.length > 0 ? { userTouchedFields } : {}),
    ...(userTouchedAt ? { userTouchedAt } : {}),
    ...(splitLineage ? { splitLineage } : {}),
  };
}

function sourceSnapshotRefs(
  sourceRefs: ProjectBoardRenderedCardSourceRef[],
  context: ProjectBoardRenderedCardLedgerContext,
): ProjectBoardRenderedCardSourceSnapshot[] {
  return sourceRefs.map((ref) => {
    const current = ref.sourceId ? context.sourcesById.get(ref.sourceId) : ref.path ? context.sourcesByPath.get(ref.path) : undefined;
    const currentContentHash = current?.contentHash?.trim();
    const state =
      ref.contentHash && currentContentHash && ref.contentHash !== currentContentHash
        ? "changed"
        : ref.contentHash && context.hasSourceContext && !current
          ? "missing"
          : ref.contentHash && currentContentHash
            ? "matched"
            : "unknown";
    return {
      ...(ref.sourceId ? { sourceId: ref.sourceId } : {}),
      ...(ref.path ? { path: ref.path } : {}),
      label: ref.label,
      ...(ref.contentHash ? { contentHash: ref.contentHash } : {}),
      ...(currentContentHash ? { currentContentHash } : {}),
      state,
    };
  });
}

function renderedCardInvalidationReasons(input: {
  cardId: string;
  renderFingerprint: string;
  sourceSnapshots: ProjectBoardRenderedCardSourceSnapshot[];
  userTouchedFields: ProjectBoardCardTouchedField[];
  context: ProjectBoardRenderedCardLedgerContext;
}): ProjectBoardRenderedCardInvalidationReason[] {
  const reasons: ProjectBoardRenderedCardInvalidationReason[] = [];
  if (input.context.expectedSchemaVersion !== PROJECT_BOARD_RENDERED_CARD_LEDGER_SCHEMA_VERSION) {
    reasons.push("card_schema_version_changed");
  }
  const expectedFingerprint = input.context.expectedRenderFingerprintsByCardId.get(input.cardId);
  if (expectedFingerprint && expectedFingerprint !== input.renderFingerprint) reasons.push("render_fingerprint_changed");
  if (input.sourceSnapshots.some((snapshot) => snapshot.state === "changed")) reasons.push("source_checksum_changed");
  if (input.sourceSnapshots.some((snapshot) => snapshot.state === "missing")) reasons.push("source_missing");
  if (input.userTouchedFields.length > 0 || input.context.userTouchedCardIds.has(input.cardId)) reasons.push("user_touched");
  return uniqueStrings(reasons) as ProjectBoardRenderedCardInvalidationReason[];
}

function normalizeCandidateStatus(value: unknown): ProjectBoardCardCandidateStatus {
  return typeof value === "string" && candidateStatuses.has(value as ProjectBoardCardCandidateStatus)
    ? (value as ProjectBoardCardCandidateStatus)
    : "needs_clarification";
}

function renderedCardDuplicateDecision(candidateStatus: ProjectBoardCardCandidateStatus): ProjectBoardRenderedCardDuplicateDecision {
  if (candidateStatus === "duplicate") return "duplicate";
  if (candidateStatus === "rejected") return "rejected";
  if (candidateStatus === "evidence") return "evidence";
  return "unique";
}

function renderedCardRestartAction(input: {
  duplicateDecision: ProjectBoardRenderedCardDuplicateDecision;
  pendingClarificationCount: number;
}): ProjectBoardRenderedCardRestartAction {
  if (input.duplicateDecision === "duplicate") return "skip_duplicate";
  if (input.duplicateDecision === "rejected") return "skip_rejected";
  if (input.duplicateDecision === "evidence") return "keep_evidence";
  if (input.pendingClarificationCount > 0) return "wait_for_clarification";
  return "reuse_rendered_card";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])));
}

const touchedFields = new Set<ProjectBoardCardTouchedField>([
  "title",
  "description",
  "candidateStatus",
  "priority",
  "phase",
  "labels",
  "dependencies",
  "acceptanceCriteria",
  "testPlan",
  "sourceRefs",
  "clarificationQuestions",
  "clarificationAnswers",
]);

function normalizeTouchedFields(value: unknown): ProjectBoardCardTouchedField[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.flatMap((item) => (typeof item === "string" && touchedFields.has(item as ProjectBoardCardTouchedField) ? [item] : []))) as ProjectBoardCardTouchedField[];
}

function normalizeSourceRefs(value: unknown): ProjectBoardRenderedCardSourceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: ProjectBoardRenderedCardSourceRef[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const label = item.trim();
      if (label) refs.push({ label });
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const sourceId = nonemptyString(raw.sourceId);
    const path = nonemptyString(raw.path);
    const range = nonemptyString(raw.range);
    const note = nonemptyString(raw.note);
    const contentHash = nonemptyString(raw.contentHash);
    if (!sourceId && !path) continue;
    refs.push({
      ...(sourceId ? { sourceId } : {}),
      ...(path ? { path } : {}),
      ...(range ? { range } : {}),
      ...(note ? { note } : {}),
      ...(contentHash ? { contentHash } : {}),
      label: sourceRefLabel({ sourceId, path, range }),
    });
  }
  return refs;
}

function normalizeClarificationAnswers(value: unknown): ProjectBoardCardClarificationAnswer[] {
  if (!Array.isArray(value)) return [];
  const answers: ProjectBoardCardClarificationAnswer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const question = nonemptyString(raw.question);
    const answer = nonemptyString(raw.answer);
    if (!question || !answer) continue;
    answers.push({
      question,
      answer,
      answeredAt: nonemptyString(raw.answeredAt) ?? "",
    });
  }
  return answers;
}

function inferSplitLineage(cardId: string): ProjectBoardRenderedCardSplitLineage | undefined {
  const match = /^(.*)#split:(\d+)$/.exec(cardId);
  if (!match?.[1]) return undefined;
  return {
    parentCardId: match[1],
    childIndex: Number.parseInt(match[2] ?? "0", 10),
    source: "candidate_split",
  };
}

function sourceRefLabel(input: { sourceId?: string; path?: string; range?: string }): string {
  const base = input.sourceId ?? input.path ?? "source";
  return input.range ? `${base}:${input.range}` : base;
}

function nonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeQuestionKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  );
}
