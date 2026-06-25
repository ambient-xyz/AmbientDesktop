import type {
  ProjectBoardCard,
  ProjectBoardCharterProjectSummary,
  ProjectBoardEvent,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSourceAuthorityRole,
  ProjectBoardSourceChangeState,
  ProjectBoardSourceClassifiedBy,
  ProjectBoardSourceKind,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import {
  buildProjectBoardKickoffContextBrief,
  projectBoardSourceAuthorityRole,
  projectBoardSourceChangeState,
  projectBoardSourceClassificationDefaults,
  projectBoardSourceContentHash,
  projectBoardSourceDeterministicAuthorityLocked,
  projectBoardSourceIncludedInSynthesis,
  projectBoardSourceKey,
} from "./projectStoreProjectBoardFacade";

export interface ProjectBoardSourceStoreRow {
  id: string;
  board_id: string;
  source_kind: ProjectBoardSourceKind;
  source_key: string | null;
  content_hash: string | null;
  change_state: ProjectBoardSourceChangeState | null;
  title: string;
  summary: string;
  excerpt: string | null;
  path: string | null;
  thread_id: string | null;
  artifact_id: string | null;
  message_id: string | null;
  byte_size: number | null;
  mtime: string | null;
  classification_reason: string | null;
  classified_by: ProjectBoardSourceClassifiedBy | null;
  classification_confidence: number | null;
  authority_role: ProjectBoardSourceAuthorityRole | null;
  include_in_synthesis: number | null;
  relevance: number;
  created_at: string;
  updated_at: string;
}

export function projectBoardCanonicalSourceKey(
  source: Pick<ProjectBoardSource, "sourceKey" | "path" | "threadId" | "artifactId" | "messageId" | "title">,
): string {
  return source.sourceKey?.trim() || projectBoardSourceKey(source);
}

export function projectBoardSourcesByCanonicalKey(sources: ProjectBoardSource[]): Map<string, ProjectBoardSource> {
  const byKey = new Map<string, ProjectBoardSource>();
  for (const source of sources) {
    const key = projectBoardCanonicalSourceKey(source);
    if (!byKey.has(key)) byKey.set(key, source);
  }
  return byKey;
}

export interface ProjectBoardSourceClassificationInput {
  sourceId?: string;
  sourceKey?: string;
  kind: ProjectBoardSourceKind;
  classificationReason: string;
  classificationConfidence: number;
  authorityRole: ProjectBoardSourceAuthorityRole;
  includeInSynthesis: boolean;
  model?: string;
}

export interface ProjectBoardSourceClassificationUpdate {
  source: ProjectBoardSource;
  kind: ProjectBoardSourceKind;
  relevance: number;
  confidence: number;
  authorityRole: ProjectBoardSourceAuthorityRole;
  includeInSynthesis: boolean;
  reason: string;
  model?: string;
}

export function projectBoardSourceClassificationUpdates(
  currentSources: ProjectBoardSource[],
  inputs: ProjectBoardSourceClassificationInput[],
): ProjectBoardSourceClassificationUpdate[] {
  const byId = new Map(currentSources.map((source) => [source.id, source]));
  const bySourceKey = projectBoardSourcesByCanonicalKey(currentSources);
  return inputs.flatMap((input) => {
    const current =
      (input.sourceId ? byId.get(input.sourceId) : undefined) ?? (input.sourceKey ? bySourceKey.get(input.sourceKey) : undefined);
    if (!current || current.classifiedBy === "user" || projectBoardSourceDeterministicAuthorityLocked(current)) return [];
    const kind = input.kind;
    const relevance = kind === "ignored" ? 0 : current.relevance;
    const confidence = Math.max(0, Math.min(1, input.classificationConfidence));
    const authorityRole = kind === "ignored" ? "ignored" : input.authorityRole;
    const includeInSynthesis = kind === "ignored" ? false : input.includeInSynthesis && authorityRole !== "ignored";
    const reason = input.classificationReason.trim().slice(0, 500) || `Ambient/Pi selected ${kind} for this project source.`;
    return [
      {
        source: current,
        kind,
        relevance,
        confidence,
        authorityRole,
        includeInSynthesis,
        reason,
        ...(input.model !== undefined ? { model: input.model } : {}),
      },
    ];
  });
}

export function projectBoardSourceShouldPreservePreviousClassification(
  previous: ProjectBoardSource | undefined,
  changeState: ProjectBoardSourceChangeState,
  next?: Pick<ProjectBoardSource, "kind" | "authorityRole" | "includeInSynthesis" | "classificationReason">,
): boolean {
  return Boolean(
    previous &&
    (previous.classifiedBy === "user" ||
      (changeState === "unchanged" &&
        !projectBoardSourceDeterministicAuthorityLocked(previous) &&
        !projectBoardSourceDeterministicAuthorityLocked(next ?? {}))),
  );
}

export interface ProjectBoardSourceUserClassificationUpdate {
  kind: ProjectBoardSourceKind;
  relevance: number;
  classifiedBy: ProjectBoardSourceClassifiedBy;
  classificationConfidence: number;
  classificationReason: string;
  authorityRole: ProjectBoardSourceAuthorityRole;
  includeInSynthesis: boolean;
}

export function projectBoardSourceUserClassificationUpdate(input: {
  previousKind: ProjectBoardSourceKind;
  previousRelevance: number;
  kind: ProjectBoardSourceKind;
  includeInSynthesis?: boolean;
}): ProjectBoardSourceUserClassificationUpdate {
  const relevance = input.kind === "ignored" ? 0 : input.previousRelevance;
  const classification = projectBoardSourceClassificationDefaults({
    kind: input.kind,
    relevance,
    classifiedBy: "user",
    reason:
      input.includeInSynthesis === undefined
        ? `User reclassified source from ${input.previousKind} to ${input.kind}.`
        : input.includeInSynthesis
          ? `User included ${input.kind} source for project-board synthesis.`
          : `User excluded ${input.kind} source from project-board synthesis.`,
  });
  const includeInSynthesis = input.kind === "ignored" ? false : (input.includeInSynthesis ?? classification.includeInSynthesis);
  return {
    kind: input.kind,
    relevance,
    classifiedBy: classification.classifiedBy,
    classificationConfidence: 1,
    classificationReason: classification.classificationReason,
    authorityRole: includeInSynthesis ? classification.authorityRole : "ignored",
    includeInSynthesis,
  };
}

export type ProjectBoardSourceStoreInput = Omit<ProjectBoardSource, "id" | "boardId" | "createdAt" | "updatedAt">;

export type NormalizedProjectBoardSourceStoreInput = ProjectBoardSourceStoreInput & {
  sourceKey: string;
  contentHash: string;
  excerpt: string;
  classificationReason: string;
  classifiedBy: ProjectBoardSourceClassifiedBy;
  classificationConfidence: number;
  authorityRole: ProjectBoardSourceAuthorityRole;
  includeInSynthesis: boolean;
};

export type ProjectBoardSourceRefreshSource = NormalizedProjectBoardSourceStoreInput & {
  id: string;
  changeState: ProjectBoardSourceChangeState;
  createdAt: string;
  preservedClassification: boolean;
};

export function normalizeProjectBoardSourceInputs(sources: ProjectBoardSourceStoreInput[]): NormalizedProjectBoardSourceStoreInput[] {
  return sources
    .filter((source) => source.title.trim())
    .slice(0, 80)
    .map((source) => {
      const relevance = Math.max(0, Math.min(100, Math.round(source.relevance)));
      const normalized = {
        ...source,
        title: source.title.trim().slice(0, 180),
        summary: source.summary.trim().slice(0, 1000),
        excerpt: source.excerpt?.trim().slice(0, 20_000) || "",
        relevance,
      };
      const classification = projectBoardSourceClassificationDefaults({
        kind: normalized.kind,
        relevance,
        reason: normalized.classificationReason,
        classifiedBy: normalized.classifiedBy,
        summary: normalized.summary,
      });
      return {
        ...normalized,
        sourceKey: projectBoardSourceKey(normalized),
        contentHash: projectBoardSourceContentHash(normalized),
        classificationReason: classification.classificationReason,
        classifiedBy: classification.classifiedBy,
        classificationConfidence: normalized.classificationConfidence ?? classification.classificationConfidence,
        authorityRole: normalized.authorityRole ?? classification.authorityRole,
        includeInSynthesis: normalized.includeInSynthesis ?? classification.includeInSynthesis,
      };
    });
}

export function projectBoardSourceRefreshSources(input: {
  previousSources: ProjectBoardSource[];
  sources: NormalizedProjectBoardSourceStoreInput[];
  now: string;
  createId: () => string;
}): ProjectBoardSourceRefreshSource[] {
  const previousByKey = projectBoardSourcesByCanonicalKey(input.previousSources);
  const claimedPreviousSourceIds = new Set<string>();
  return input.sources.map((source) => {
    const matchedPrevious = previousByKey.get(projectBoardCanonicalSourceKey(source));
    const previous = matchedPrevious && !claimedPreviousSourceIds.has(matchedPrevious.id) ? matchedPrevious : undefined;
    if (previous) claimedPreviousSourceIds.add(previous.id);
    const changeState = source.changeState ?? projectBoardSourceChangeState(previous, source);
    const preservePreviousClassification = projectBoardSourceShouldPreservePreviousClassification(previous, changeState, source);
    const kind = preservePreviousClassification ? previous!.kind : source.kind;
    const relevance = kind === "ignored" ? 0 : source.relevance;
    const classification = preservePreviousClassification
      ? {
          classificationReason: previous!.classificationReason ?? source.classificationReason,
          classifiedBy: previous!.classifiedBy ?? source.classifiedBy,
          classificationConfidence: previous!.classificationConfidence ?? source.classificationConfidence,
          authorityRole: previous!.authorityRole ?? source.authorityRole,
          includeInSynthesis: previous!.includeInSynthesis ?? source.includeInSynthesis,
        }
      : {
          classificationReason: source.classificationReason,
          classifiedBy: source.classifiedBy,
          classificationConfidence: source.classificationConfidence,
          authorityRole: source.authorityRole,
          includeInSynthesis: source.includeInSynthesis,
        };
    const defaults = projectBoardSourceClassificationDefaults({ kind, relevance, summary: source.summary });
    return {
      ...source,
      id: previous?.id ?? input.createId(),
      kind,
      relevance,
      changeState,
      classificationReason: classification.classificationReason ?? defaults.classificationReason,
      classifiedBy: classification.classifiedBy ?? "fallback_heuristic",
      classificationConfidence: classification.classificationConfidence ?? defaults.classificationConfidence,
      authorityRole: classification.authorityRole ?? projectBoardSourceAuthorityRole(kind, relevance),
      includeInSynthesis: kind === "ignored" ? false : (classification.includeInSynthesis ?? true),
      createdAt: previous?.createdAt ?? input.now,
      preservedClassification: Boolean(preservePreviousClassification && previous && previous.kind !== source.kind),
    };
  });
}

export function projectBoardSourceRefreshStoreRow(input: {
  source: ProjectBoardSourceRefreshSource;
  boardId: string;
  updatedAt: string;
}): ProjectBoardSourceStoreRow {
  const { source } = input;
  return {
    id: source.id,
    board_id: input.boardId,
    source_kind: source.kind,
    source_key: source.sourceKey,
    content_hash: source.contentHash,
    change_state: source.changeState,
    title: source.title,
    summary: source.summary,
    excerpt: source.excerpt || null,
    path: source.path ?? null,
    thread_id: source.threadId ?? null,
    artifact_id: source.artifactId ?? null,
    message_id: source.messageId ?? null,
    byte_size: source.byteSize ?? null,
    mtime: source.mtime ?? null,
    classification_reason: source.classificationReason ?? null,
    classified_by: source.classifiedBy ?? null,
    classification_confidence: source.classificationConfidence ?? null,
    authority_role: source.authorityRole ?? null,
    include_in_synthesis: source.includeInSynthesis === false ? 0 : 1,
    relevance: source.relevance,
    created_at: source.createdAt,
    updated_at: input.updatedAt,
  };
}

export function projectBoardSourceInputFromExisting(
  source: ProjectBoardSource,
): Omit<ProjectBoardSource, "id" | "boardId" | "createdAt" | "updatedAt"> {
  return {
    kind: source.kind,
    ...(source.sourceKey ? { sourceKey: source.sourceKey } : {}),
    ...(source.contentHash ? { contentHash: source.contentHash } : {}),
    ...(source.changeState ? { changeState: source.changeState } : {}),
    title: source.title,
    summary: source.summary,
    ...(source.excerpt ? { excerpt: source.excerpt } : {}),
    ...(source.path ? { path: source.path } : {}),
    ...(source.threadId ? { threadId: source.threadId } : {}),
    ...(source.artifactId ? { artifactId: source.artifactId } : {}),
    ...(source.messageId ? { messageId: source.messageId } : {}),
    ...(source.byteSize !== undefined ? { byteSize: source.byteSize } : {}),
    ...(source.mtime ? { mtime: source.mtime } : {}),
    ...(source.classificationReason ? { classificationReason: source.classificationReason } : {}),
    ...(source.classifiedBy ? { classifiedBy: source.classifiedBy } : {}),
    ...(source.classificationConfidence !== undefined ? { classificationConfidence: source.classificationConfidence } : {}),
    ...(source.authorityRole ? { authorityRole: source.authorityRole } : {}),
    ...(source.includeInSynthesis !== undefined ? { includeInSynthesis: source.includeInSynthesis } : {}),
    relevance: source.relevance,
  };
}

export function sourceDisplayName(source: Pick<ProjectBoardSource, "path" | "title" | "kind">): string {
  return source.path?.trim() || source.title.trim() || source.kind;
}

export function sourceMajorSystemLabel(source: ProjectBoardSource): string {
  const name = sourceDisplayName(source).replace(/\.[A-Za-z0-9]+$/, "");
  const words = name
    .split(/[/_:-]+|\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const meaningful = words.filter(
    (word) => !/^(src|docs?|test|tests?|spec|plan|implementation|architecture|readme|md|ts|tsx|js|jsx|json)$/i.test(word),
  );
  return (meaningful.length ? meaningful : words).slice(-3).join(" ");
}

export function projectBoardSourceImpactIncluded(source: ProjectBoardSource): boolean {
  return projectBoardSourceIncludedInSynthesis(source);
}

export function projectBoardSourceImpactDurablePlanPrimary(source: ProjectBoardSource): boolean {
  return (
    source.kind === "plan_artifact" &&
    source.path?.replace(/\\/g, "/").startsWith(".ambient/board/plans/") === true &&
    source.authorityRole === "primary" &&
    projectBoardSourceImpactIncluded(source)
  );
}

export function projectBoardSourceImpactEstimatedPromptChars(source: ProjectBoardSource): number {
  if (typeof source.byteSize === "number" && Number.isFinite(source.byteSize) && source.byteSize > 0) return Math.round(source.byteSize);
  return [source.title, source.summary, source.excerpt, source.path, source.threadId, source.artifactId, source.messageId]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n").length;
}

export interface ProjectBoardSourceUpdateImpactMetadata {
  schemaVersion: 1;
  sourceId: string;
  groupSourceIds: string[];
  from: {
    kind: ProjectBoardSourceKind;
    authorityRole?: ProjectBoardSourceAuthorityRole;
    includeInSynthesis?: boolean;
  };
  to: {
    kind: ProjectBoardSourceKind;
    authorityRole?: ProjectBoardSourceAuthorityRole;
    includeInSynthesis?: boolean;
  };
  existingCardsRewritten: false;
  modelCallRequired: false;
  additiveSynthesisAvailable: boolean;
  targetedRefreshOptional: boolean;
  nextRunFeedbackRecommended: boolean;
  affectedCardIds: string[];
  affectedDraftCardIds: string[];
  affectedExecutableCardIds: string[];
  affectedDraftCount: number;
  affectedExecutableCount: number;
  durablePlanPrimaryCount: number;
  includedChatCount: number;
  ignoredChatCount: number;
  selectedObservationCount: number;
  estimatedPromptChars: number;
  recommendedAction: "none" | "additive_source_elaboration" | "refresh_drafts" | "add_next_run_feedback";
  detail: string;
}

export interface ProjectBoardSourceDraftRefreshRecord {
  eventId?: string;
  createdAt?: string;
  impact: ProjectBoardSourceUpdateImpactMetadata;
}

export function projectBoardSourceUpdateImpactMetadata(input: {
  previousSource: ProjectBoardSource;
  nextSource: ProjectBoardSource;
  sources: ProjectBoardSource[];
  cards: ProjectBoardCard[];
}): ProjectBoardSourceUpdateImpactMetadata {
  const groupKey = projectBoardSourceImpactGroupKey(input.nextSource);
  const groupSources = input.sources.filter((source) => projectBoardSourceImpactGroupKey(source) === groupKey);
  const sourceKeys = new Set(groupSources.flatMap(projectBoardSourceImpactReferenceKeys));
  const affectedCards = input.cards.filter((card) =>
    [...(card.sourceRefs ?? []), card.sourceId].some((ref) => projectBoardSourceImpactReferenceMatchesAny(ref, sourceKeys)),
  );
  const affectedDraftCards = affectedCards.filter((card) => card.status === "draft");
  const affectedExecutableCards = affectedCards.filter((card) => card.status !== "draft" && card.status !== "archived");
  const includedGroupSources = groupSources.filter(projectBoardSourceImpactIncluded);
  const durablePlanPrimaryCount = input.sources.filter(projectBoardSourceImpactDurablePlanPrimary).length;
  const chatSources = input.sources.filter((source) => source.kind === "thread");
  const includedChatCount = chatSources.filter(projectBoardSourceImpactIncluded).length;
  const ignoredChatCount = chatSources.filter((source) => !projectBoardSourceImpactIncluded(source)).length;
  const additiveSynthesisAvailable = includedGroupSources.length > 0;
  const targetedRefreshOptional = affectedDraftCards.length > 0;
  const nextRunFeedbackRecommended = affectedExecutableCards.length > 0;
  const estimatedPromptChars = includedGroupSources.reduce(
    (total, source) => total + projectBoardSourceImpactEstimatedPromptChars(source),
    0,
  );
  return {
    schemaVersion: 1,
    sourceId: input.nextSource.id,
    groupSourceIds: groupSources.map((source) => source.id),
    from: {
      kind: input.previousSource.kind,
      authorityRole: input.previousSource.authorityRole,
      includeInSynthesis: input.previousSource.includeInSynthesis,
    },
    to: {
      kind: input.nextSource.kind,
      authorityRole: input.nextSource.authorityRole,
      includeInSynthesis: input.nextSource.includeInSynthesis,
    },
    existingCardsRewritten: false,
    modelCallRequired: false,
    additiveSynthesisAvailable,
    targetedRefreshOptional,
    nextRunFeedbackRecommended,
    affectedCardIds: affectedCards.map((card) => card.id),
    affectedDraftCardIds: affectedDraftCards.map((card) => card.id),
    affectedExecutableCardIds: affectedExecutableCards.map((card) => card.id),
    affectedDraftCount: affectedDraftCards.length,
    affectedExecutableCount: affectedExecutableCards.length,
    durablePlanPrimaryCount,
    includedChatCount,
    ignoredChatCount,
    selectedObservationCount: includedGroupSources.length,
    estimatedPromptChars,
    recommendedAction: projectBoardSourceImpactRecommendedAction({
      additiveSynthesisAvailable,
      targetedRefreshOptional,
      nextRunFeedbackRecommended,
    }),
    detail: projectBoardSourceImpactLedgerDetail({
      additiveSynthesisAvailable,
      targetedRefreshOptional,
      nextRunFeedbackRecommended,
      affectedDraftCount: affectedDraftCards.length,
      affectedExecutableCount: affectedExecutableCards.length,
      durablePlanPrimaryCount,
      ignoredChatCount,
    }),
  };
}

export function projectBoardSourceImpactMetadataFromEvent(event: ProjectBoardEvent): ProjectBoardSourceUpdateImpactMetadata | undefined {
  if (event.kind !== "source_updated") return undefined;
  const metadata = event.metadata as { sourceImpact?: Partial<ProjectBoardSourceUpdateImpactMetadata> };
  const impact = metadata.sourceImpact;
  if (!impact || impact.schemaVersion !== 1 || typeof impact.sourceId !== "string") return undefined;
  if (!Array.isArray(impact.groupSourceIds) || !Array.isArray(impact.affectedDraftCardIds)) return undefined;
  return impact as ProjectBoardSourceUpdateImpactMetadata;
}

export function projectBoardSourceDraftRefreshEventMetadata(event: ProjectBoardEvent):
  | {
      sourceImpactEventIds: string[];
      appliedCardIds: string[];
    }
  | undefined {
  if (event.kind !== "card_updated") return undefined;
  const metadata = event.metadata as {
    sourceImpact?: {
      appliedAction?: string;
      sourceImpactEventIds?: unknown;
      appliedCardIds?: unknown;
    };
  };
  const impact = metadata.sourceImpact;
  if (impact?.appliedAction !== "refresh_affected_drafts") return undefined;
  if (!Array.isArray(impact.sourceImpactEventIds) || !Array.isArray(impact.appliedCardIds)) return undefined;
  return {
    sourceImpactEventIds: impact.sourceImpactEventIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())),
    appliedCardIds: impact.appliedCardIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())),
  };
}

export function projectBoardSourceDraftRefreshRecordKey(record: ProjectBoardSourceDraftRefreshRecord): string {
  const ids = record.impact.groupSourceIds.length > 0 ? record.impact.groupSourceIds : [record.impact.sourceId];
  return ids.slice().sort().join("|");
}

export function projectBoardSourceImpactRecommendedAction(input: {
  additiveSynthesisAvailable: boolean;
  targetedRefreshOptional: boolean;
  nextRunFeedbackRecommended: boolean;
}): ProjectBoardSourceUpdateImpactMetadata["recommendedAction"] {
  if (input.nextRunFeedbackRecommended) return "add_next_run_feedback";
  if (input.targetedRefreshOptional) return "refresh_drafts";
  if (input.additiveSynthesisAvailable) return "additive_source_elaboration";
  return "none";
}

export function projectBoardSourceImpactLedgerDetail(input: {
  additiveSynthesisAvailable: boolean;
  targetedRefreshOptional: boolean;
  nextRunFeedbackRecommended: boolean;
  affectedDraftCount: number;
  affectedExecutableCount: number;
  durablePlanPrimaryCount: number;
  ignoredChatCount: number;
}): string {
  const parts = ["Source selection updated without rewriting existing cards or calling Pi."];
  if (input.additiveSynthesisAvailable) parts.push("The source can be used later for additive card elaboration.");
  if (input.targetedRefreshOptional)
    parts.push(
      `${input.affectedDraftCount} draft card${input.affectedDraftCount === 1 ? "" : "s"} cite this source and can be refreshed selectively.`,
    );
  if (input.nextRunFeedbackRecommended)
    parts.push(
      `${input.affectedExecutableCount} ticketized card${input.affectedExecutableCount === 1 ? "" : "s"} cite this source; use additive next-run feedback instead of rewriting approved cards.`,
    );
  if (input.durablePlanPrimaryCount > 0 && input.ignoredChatCount > 0)
    parts.push("Durable-plan authority is active, so ignored chats remain inspectable but excluded by default.");
  return parts.join(" ");
}

export function projectBoardSourceDraftRefreshNote(input: {
  sources: ProjectBoardSource[];
  impactRecordCount: number;
  selectedObservationCount: number;
}): string {
  const visibleSources = input.sources.slice(0, 4);
  const sourceLabels = visibleSources.map((source) => {
    const role = source.authorityRole ?? (projectBoardSourceImpactIncluded(source) ? "context" : "ignored");
    return `${sourceDisplayName(source)} (${role}${projectBoardSourceImpactIncluded(source) ? ", included" : ", excluded"})`;
  });
  const moreCount = Math.max(0, input.sources.length - visibleSources.length);
  const sourceText =
    sourceLabels.length > 0 ? `${sourceLabels.join("; ")}${moreCount > 0 ? `; +${moreCount} more` : ""}` : "current source selection";
  const observationText =
    input.selectedObservationCount > 0
      ? `${input.selectedObservationCount} included source observation${input.selectedObservationCount === 1 ? "" : "s"}`
      : "no included source observations";
  return [
    `Source authority was refreshed from ${input.impactRecordCount} source-impact record${input.impactRecordCount === 1 ? "" : "s"}.`,
    `Current impacted sources: ${sourceText}.`,
    `${observationText} are available for additive elaboration.`,
    "Existing draft text was not rewritten by Pi; review this note before ticketization or run Add Cards for a low-model targeted elaboration.",
  ].join(" ");
}

export function projectBoardSourceImpactFeedbackText(input: {
  sources: ProjectBoardSource[];
  impactRecordCount: number;
  selectedObservationCount: number;
}): string {
  const visibleSources = input.sources.slice(0, 4);
  const sourceLabels = visibleSources.map((source) => {
    const role = source.authorityRole ?? (projectBoardSourceImpactIncluded(source) ? "context" : "ignored");
    return `${sourceDisplayName(source)} (${role}${projectBoardSourceImpactIncluded(source) ? ", included" : ", excluded"})`;
  });
  const moreCount = Math.max(0, input.sources.length - visibleSources.length);
  const sourceText =
    sourceLabels.length > 0 ? `${sourceLabels.join("; ")}${moreCount > 0 ? `; +${moreCount} more` : ""}` : "current source selection";
  const observationText =
    input.selectedObservationCount > 0
      ? `${input.selectedObservationCount} included source observation${input.selectedObservationCount === 1 ? "" : "s"}`
      : "no included source observations";
  return [
    `Source authority changed after this card was approved. Reconcile the next run against ${sourceText}.`,
    `${observationText} are currently eligible for additive source context.`,
    `This feedback came from ${input.impactRecordCount} source-impact record${input.impactRecordCount === 1 ? "" : "s"}.`,
    "Do not rewrite the approved card scope silently; if the source change materially broadens work, create a follow-up or split card.",
  ].join(" ");
}

export function projectBoardSynthesisMarkdown(board: { title: string }, synthesis: ProjectBoardSynthesisDraft): string {
  const questions = synthesis.questions.map((question) => `- ${question}`);
  const assumptions = synthesis.assumptions.map((assumption) => `- ${assumption}`);
  const sources = synthesis.sourceNotes.map((source) => `- ${source}`);
  const cards = synthesis.cards.map((card, index) => {
    const blockers = card.blockedBy.length ? ` Blocked by: ${card.blockedBy.join(", ")}.` : "";
    const clarification = card.clarificationQuestions?.length ? ` Questions: ${card.clarificationQuestions.join(" ")}` : "";
    return `${index + 1}. ${card.title} (${card.candidateStatus}).${blockers}${clarification}`;
  });
  return [
    `# ${board.title}`,
    "",
    "## Synthesized Goal",
    "",
    synthesis.goal,
    "",
    "## Current State",
    "",
    synthesis.currentState,
    "",
    "## Target User",
    "",
    synthesis.targetUser,
    "",
    "## Quality Bar",
    "",
    synthesis.qualityBar,
    "",
    "## Assumptions",
    "",
    assumptions.length ? assumptions.join("\n") : "- None recorded.",
    "",
    "## Open Questions",
    "",
    questions.length ? questions.join("\n") : "- No synthesis-specific questions.",
    "",
    "## Proposed Cards",
    "",
    cards.length ? cards.join("\n") : "- No cards proposed yet.",
    "",
    "## Source Basis",
    "",
    sources.length ? sources.join("\n") : "- No sources scanned yet.",
  ].join("\n");
}

export function projectBoardSourceImpactGroupKey(source: ProjectBoardSource): string {
  const contentKey = [projectBoardSourceImpactNormalizeText(source.title), projectBoardSourceImpactNormalizeText(source.summary)]
    .filter(Boolean)
    .join("|");
  if (contentKey.length >= 16) return `content:${contentKey}`;
  return [source.kind, source.path ?? "", source.threadId ?? "", source.artifactId ?? "", source.messageId ?? "", source.id].join(":");
}

export function projectBoardSourceImpactReferenceKeys(source: ProjectBoardSource): string[] {
  return [source.id, source.sourceKey, source.path, source.title, source.artifactId, source.threadId, source.messageId]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(projectBoardSourceImpactReferenceKey)
    .filter(Boolean);
}

export function projectBoardSourceImpactReferenceMatchesAny(ref: string, sourceKeys: Set<string>): boolean {
  const normalized = projectBoardSourceImpactReferenceKey(ref);
  if (!normalized) return false;
  for (const key of sourceKeys) {
    if (!key) continue;
    if (normalized === key) return true;
    if (key.length >= 6 && normalized.includes(key)) return true;
    if (normalized.length >= 6 && key.includes(normalized)) return true;
  }
  return false;
}

export function projectBoardSourceImpactReferenceKey(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, "/").replace(/\s+/g, " ");
}

export function projectBoardSourceImpactNormalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/g, "")
    .replace(/\b202\d[-:t0-9.]*z?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function compileProjectBoardCharter(
  board: { title: string; summary: string },
  questions: ProjectBoardQuestion[],
  sources: ProjectBoardSource[],
): {
  goal: string;
  currentState: string;
  targetUser: string;
  nonGoals: string[];
  qualityBar: string;
  testPolicy: Record<string, unknown>;
  decisionPolicy: Record<string, unknown>;
  dependencyPolicy: Record<string, unknown>;
  budgetPolicy: Record<string, unknown>;
  sourcePolicy: Record<string, unknown>;
  summary: string;
  markdown: string;
} {
  const answers = questions.map((question) => question.answer?.trim() || "");
  const includedSources = sources.filter(projectBoardSourceIncludedInSynthesis);
  const goal = answers[0] || board.summary || board.title;
  const sourcePolicyText = answers[1] || "Use the scanned sources as supporting context and ask when they conflict.";
  const decisionPolicyText = answers[2] || "Ask when ambiguous; document assumptions when proceeding.";
  const proofPolicyText = answers[3] || "Require unit, integration, visual, or manual proof appropriate to each card.";
  const executionPolicyText =
    answers[4] ||
    "Work dependency-ready cards first, keep retrying incomplete cards within the project pass budget, and stop for terminal blockers.";
  const authoritativeSources = includedSources
    .filter((source) => source.kind !== "thread")
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, 8)
    .map((source) => source.path || source.title);
  const sourceLines = includedSources
    .slice(0, 12)
    .map((source) => `- ${source.title} (${source.kind}${source.path ? `: ${source.path}` : ""})`);
  const markdown = [
    `# ${board.title}`,
    "",
    "## Goal",
    "",
    goal,
    "",
    "## Source Authority",
    "",
    sourcePolicyText,
    "",
    "## Decision Policy",
    "",
    decisionPolicyText,
    "",
    "## Proof Policy",
    "",
    proofPolicyText,
    "",
    "## Execution Policy",
    "",
    executionPolicyText,
    "",
    "## Source Corpus",
    "",
    sourceLines.length ? sourceLines.join("\n") : "- No sources scanned yet.",
  ].join("\n");
  return {
    goal,
    currentState: `Kickoff completed with ${includedSources.length} included project source${includedSources.length === 1 ? "" : "s"}.`,
    targetUser: "",
    nonGoals: [],
    qualityBar: proofPolicyText,
    testPolicy: {
      defaultProof: proofPolicyText,
      requireProofSpec: true,
      unit: true,
      integration: true,
      visual: true,
      manual: true,
      proofScopeWarningPolicy: "advisory",
    },
    decisionPolicy: { defaultPolicy: decisionPolicyText },
    dependencyPolicy: { ordering: "blockers_first", source: "board_dependencies", executionPolicy: executionPolicyText },
    budgetPolicy: {
      maxPassesPerCard: 6,
      maxRuntimeMsPerCard: 1_200_000,
      pauseOnTerminalBlocker: true,
      executionPolicy: executionPolicyText,
    },
    sourcePolicy: { policy: sourcePolicyText, authoritativeSources },
    summary: goal.slice(0, 500),
    markdown,
  };
}

export function buildProjectBoardCharterProjectSummary(input: {
  board: { title: string };
  questions: ProjectBoardQuestion[];
  sources: ProjectBoardSource[];
  compiled: ReturnType<typeof compileProjectBoardCharter>;
  generatedAt: string;
}): ProjectBoardCharterProjectSummary {
  const includedSources = input.sources
    .filter(projectBoardSourceIncludedInSynthesis)
    .sort((left, right) => right.relevance - left.relevance || sourceDisplayName(left).localeCompare(sourceDisplayName(right)));
  const corpusText = includedSources
    .map((source) => `${source.title}\n${source.summary}\n${source.excerpt ?? ""}\n${source.path ?? ""}\n${source.kind}`)
    .join("\n\n");
  const sourceChecksumSet = includedSources.map((source) => `${source.id}:${projectBoardSourceContentHash(source)}`).sort();
  const kickoffContextBrief = buildProjectBoardKickoffContextBrief({
    questions: input.questions,
    sources: input.sources,
    generatedAt: input.generatedAt,
  });
  const answerChecksum = projectBoardSourceContentHash({
    title: input.board.title,
    summary: input.compiled.goal,
    excerpt: JSON.stringify(
      input.questions.map((question) => ({
        id: question.id,
        question: question.question,
        answer: question.answer ?? "",
      })),
    ),
  });
  const majorSystems = uniqueLimitedStrings([...includedSources.map(sourceMajorSystemLabel), ...keywordSystemHints(corpusText)], 8);
  const coverageGaps = projectBoardCharterCoverageGaps(includedSources);
  const unresolvedDecisions = input.questions
    .filter((question) => question.required && !question.answer?.trim())
    .map((question) => question.question);
  const risks = uniqueLimitedStrings(
    [
      ...coverageGaps.map((gap) => `Coverage gap: ${gap}`),
      ...includedSources
        .filter((source) =>
          /\b(risk|blocker|blocked|unknown|todo|gap|conflict|ambiguous|defer)\b/i.test(
            `${source.title}\n${source.summary}\n${source.excerpt ?? ""}`,
          ),
        )
        .map((source) => `Review ${sourceDisplayName(source)} for risks or unresolved scope.`),
    ],
    8,
  );
  const dependencyHints = uniqueLimitedStrings(
    [
      ...includedSources
        .filter((source) =>
          /\b(depend|blocked|sequence|phase|stage|foundation|before|after|prereq)\b/i.test(
            `${source.title}\n${source.summary}\n${source.excerpt ?? ""}`,
          ),
        )
        .map((source) => `Use dependency cues from ${sourceDisplayName(source)}.`),
      input.compiled.dependencyPolicy.executionPolicy,
    ].filter((item): item is string => typeof item === "string" && item.trim().length > 0),
    8,
  );
  const sourceCoverage = includedSources
    .slice(0, 12)
    .map((source) =>
      [
        sourceDisplayName(source),
        source.kind,
        `${Math.round(source.relevance)} relevance`,
        source.authorityRole ? `${source.authorityRole} authority` : "",
      ]
        .filter(Boolean)
        .join(" - "),
    );
  const citations = includedSources.slice(0, 10).map((source) => {
    const ref = source.path || source.threadId || source.artifactId || source.messageId || source.id;
    return `${sourceDisplayName(source)} (${ref})`;
  });
  return {
    summary: truncateForProjectBoardSummary(
      [
        input.compiled.goal,
        input.compiled.currentState,
        majorSystems.length ? `Major systems: ${majorSystems.join(", ")}.` : "",
        coverageGaps.length ? `Known coverage gaps: ${coverageGaps.join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      1500,
    ),
    majorSystems,
    sourceCoverage,
    risks,
    dependencyHints,
    unresolvedDecisions,
    citations,
    coverageGaps,
    sourceChecksumSet,
    charterAnswerChecksum: answerChecksum,
    kickoffContextBrief,
    generatedAt: input.generatedAt,
    generator: "fallback_heuristic",
  };
}

export function keywordSystemHints(text: string): string[] {
  const hints: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\b(renderer|render loop|canvas|webgl|three\.js|hud|visual)\b/i, "Rendering and visual proof"],
    [/\b(input|controls?|keyboard|mouse|touch)\b/i, "Input and controls"],
    [/\b(state|store|reducer|model|persistence|database|sqlite)\b/i, "State and persistence"],
    [/\b(api|ipc|server|provider|session|stream)\b/i, "Provider and session integration"],
    [/\b(test|proof|playwright|vitest|smoke|validation)\b/i, "Testing and proof"],
    [/\b(auth|secret|permission|policy|security)\b/i, "Security and permissions"],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) hints.push(label);
  }
  return hints;
}

export function projectBoardCharterCoverageGaps(sources: ProjectBoardSource[]): string[] {
  const kinds = new Set(sources.map((source) => source.kind));
  const gaps: string[] = [];
  if (!kinds.has("functional_spec") && !kinds.has("implementation_plan") && !kinds.has("architecture_artifact")) {
    gaps.push("No authoritative spec, architecture, or implementation plan source was included.");
  }
  if (!kinds.has("test_artifact")) gaps.push("No dedicated test/proof artifact was included.");
  if (sources.length === 0) gaps.push("No included source material was available at charter finalization.");
  return gaps;
}

export function uniqueLimitedStrings(values: Array<string | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(truncateForProjectBoardSummary(normalized, 240));
    if (result.length >= limit) break;
  }
  return result;
}

export function truncateForProjectBoardSummary(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function projectBoardDescriptionWithSourceImpactRefresh(description: string, note: string): string {
  const trimmed = description.trim();
  const block = `## Source impact refresh\n${note.trim()}`;
  if (!trimmed) return block;
  const sourceRefreshBlock = /\n*##\s+Source impact refresh\s*\n[\s\S]*?(?=\n##\s+|$)/i;
  if (sourceRefreshBlock.test(trimmed)) return trimmed.replace(sourceRefreshBlock, `\n\n${block}`).trim();
  return `${trimmed}\n\n${block}`;
}

export function projectBoardSourceRefreshSummary(input: {
  nextCount: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  removedCount: number;
  preservedClassificationCount: number;
}): string {
  const parts = [
    input.newCount > 0 ? `${input.newCount} new` : "",
    input.changedCount > 0 ? `${input.changedCount} changed` : "",
    input.unchangedCount > 0 ? `${input.unchangedCount} unchanged` : "",
    input.removedCount > 0 ? `${input.removedCount} removed` : "",
  ].filter(Boolean);
  const changeSummary = parts.length > 0 ? parts.join(", ") : "no source changes";
  const preserved =
    input.preservedClassificationCount > 0
      ? ` Preserved ${input.preservedClassificationCount} existing classification${input.preservedClassificationCount === 1 ? "" : "s"}.`
      : "";
  return `${input.nextCount} project source${input.nextCount === 1 ? "" : "s"} scanned: ${changeSummary}.${preserved}`;
}

export interface ProjectBoardSourceRefreshStats {
  sourceKinds: Record<string, number>;
  sourceChangeStates: Record<string, number>;
  preservedClassificationCount: number;
  removedSourceKeys: string[];
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  removedCount: number;
}

export function projectBoardSourceKindCounts<T extends { kind: ProjectBoardSourceKind }>(sources: T[]): Record<string, number> {
  return sources.reduce<Record<string, number>>((counts, source) => {
    counts[source.kind] = (counts[source.kind] ?? 0) + 1;
    return counts;
  }, {});
}

export function projectBoardSourceRefreshStats(input: {
  previousSources: ProjectBoardSource[];
  nextSources: Array<{
    sourceKey: string;
    kind: ProjectBoardSourceKind;
    changeState: ProjectBoardSourceChangeState;
    preservedClassification?: boolean;
  }>;
}): ProjectBoardSourceRefreshStats {
  const sourceKinds = projectBoardSourceKindCounts(input.nextSources);
  const sourceChangeStates = input.nextSources.reduce<Record<string, number>>((counts, source) => {
    counts[source.changeState] = (counts[source.changeState] ?? 0) + 1;
    return counts;
  }, {});
  const preservedClassificationCount = input.nextSources.filter((source) => source.preservedClassification).length;
  const nextKeys = new Set(input.nextSources.map((source) => source.sourceKey));
  const removedSourceKeys = input.previousSources
    .map((source) => source.sourceKey ?? projectBoardSourceKey(source))
    .filter((sourceKey) => !nextKeys.has(sourceKey));
  return {
    sourceKinds,
    sourceChangeStates,
    preservedClassificationCount,
    removedSourceKeys,
    newCount: sourceChangeStates.new ?? 0,
    changedCount: sourceChangeStates.changed ?? 0,
    unchangedCount: sourceChangeStates.unchanged ?? 0,
    removedCount: removedSourceKeys.length,
  };
}

export function projectBoardSourceRefreshEventMetadata(input: {
  previousSources: ProjectBoardSource[];
  nextSources: unknown[];
  stats: ProjectBoardSourceRefreshStats;
}): Record<string, unknown> {
  return {
    previousCount: input.previousSources.length,
    nextCount: input.nextSources.length,
    sourceKinds: input.stats.sourceKinds,
    sourceChangeStates: input.stats.sourceChangeStates,
    newCount: input.stats.newCount,
    changedCount: input.stats.changedCount,
    unchangedCount: input.stats.unchangedCount,
    removedCount: input.stats.removedCount,
    removedSourceKeys: input.stats.removedSourceKeys.slice(0, 20),
    preservedClassificationCount: input.stats.preservedClassificationCount,
  };
}
