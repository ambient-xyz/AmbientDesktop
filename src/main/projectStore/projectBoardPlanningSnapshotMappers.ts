import { createHash } from "node:crypto";

import type {
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardSourceKind,
  ProjectBoardCardStatus,
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotCard,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardPlanningSnapshotSourceHash,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
  ProjectBoardSourceChangeState,
  ProjectBoardSourceKind,
  ProjectBoardSynthesisRunEvent,
  ProjectBoardSynthesisRunProgressiveRecord,
  ProjectBoardSynthesisRunProgressiveSummary,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
} from "../../shared/projectBoardTypes";
import { buildProjectBoardRenderedCardLedger } from "./projectStoreProjectBoardFacade";

const PROJECT_BOARD_SYNTHESIS_RUN_STAGES = new Set<ProjectBoardSynthesisRunStage>([
  "source_scan",
  "sources_persisted",
  "source_classification",
  "kickoff_defaults",
  "charter_summary",
  "deterministic_baseline",
  "model_request",
  "model_response",
  "schema_validation",
  "board_applied",
  "proposal_created",
  "paused",
  "failed",
]);

const PROJECT_BOARD_PLANNING_SNAPSHOT_KINDS = new Set<ProjectBoardPlanningSnapshotKind>(["incremental", "paused", "final", "manual"]);
const PROJECT_BOARD_SCOPE_FEATURE_VALUES = new Set<ProjectBoardScopeFeature>([
  "auth",
  "accounts",
  "analytics",
  "sync",
  "collaboration",
  "notifications",
  "backend",
  "payments",
  "deployment",
  "admin_reporting",
]);
const PROJECT_BOARD_CARD_STATUS_VALUES = new Set<ProjectBoardCardStatus>([
  "draft",
  "ready",
  "in_progress",
  "review",
  "done",
  "blocked",
  "archived",
]);
const PROJECT_BOARD_CARD_CANDIDATE_STATUS_VALUES = new Set<ProjectBoardCardCandidateStatus>([
  "needs_clarification",
  "ready_to_create",
  "evidence",
  "duplicate",
  "rejected",
]);
const PROJECT_BOARD_CARD_SOURCE_KIND_VALUES = new Set<ProjectBoardCardSourceKind>([
  "planner_plan",
  "manual",
  "run_follow_up",
  "local_task_import",
  "board_synthesis",
]);
const PROJECT_BOARD_SOURCE_KIND_VALUES = new Set<ProjectBoardSourceKind>([
  "thread",
  "plan_artifact",
  "architecture_artifact",
  "functional_spec",
  "implementation_plan",
  "report_artifact",
  "workflow_artifact",
  "implementation_file",
  "test_artifact",
  "git_state",
  "ignored",
  "markdown",
]);

export function normalizeProjectBoardSynthesisRunProgressiveRecord(value: unknown): ProjectBoardSynthesisRunProgressiveRecord[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = { ...(value as Record<string, unknown>) };
  if (typeof record.type !== "string" || !record.type.trim()) return [];
  record.type = record.type.trim();
  return [record as ProjectBoardSynthesisRunProgressiveRecord];
}

export function normalizeProjectBoardSynthesisRunEvent(value: unknown, fallbackCreatedAt: string): ProjectBoardSynthesisRunEvent[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const event = value as ProjectBoardSynthesisRunEvent;
  if (
    typeof event.stage !== "string" ||
    !PROJECT_BOARD_SYNTHESIS_RUN_STAGES.has(event.stage as ProjectBoardSynthesisRunStage) ||
    typeof event.title !== "string"
  ) {
    return [];
  }
  return [
    {
      stage: event.stage as ProjectBoardSynthesisRunStage,
      title: event.title,
      summary: typeof event.summary === "string" ? event.summary : "",
      metadata: event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {},
      createdAt: typeof event.createdAt === "string" ? event.createdAt : fallbackCreatedAt,
    },
  ];
}

export function dedupeProjectBoardSynthesisRunProgressiveRecords(
  records: ProjectBoardSynthesisRunProgressiveRecord[],
): ProjectBoardSynthesisRunProgressiveRecord[] {
  const seen = new Set<string>();
  const result: ProjectBoardSynthesisRunProgressiveRecord[] = [];
  for (const record of records) {
    const key = JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

export function summarizeProjectBoardSynthesisRunProgressiveRecords(
  records: ProjectBoardSynthesisRunProgressiveRecord[],
): ProjectBoardSynthesisRunProgressiveSummary {
  const renderedCardLedger = buildProjectBoardRenderedCardLedger(records);
  const summary: ProjectBoardSynthesisRunProgressiveSummary = {
    recordCount: records.length,
    candidateCardCount: 0,
    questionCount: 0,
    sourceCoverageCount: 0,
    dependencyEdgeCount: 0,
    warningCount: 0,
    errorCount: 0,
  };
  for (const record of records) {
    if (record.type === "candidate_card") {
      summary.candidateCardCount += 1;
      if (typeof record.title === "string" && record.title.trim()) summary.latestCandidateCardTitle = record.title.trim();
    } else if (record.type === "question") {
      summary.questionCount += 1;
      if (typeof record.question === "string" && record.question.trim()) summary.latestQuestion = record.question.trim();
    } else if (record.type === "proposal_final") {
      summary.proposalFinalCount = (summary.proposalFinalCount ?? 0) + 1;
    } else if (record.type === "source_coverage") {
      summary.sourceCoverageCount += 1;
    } else if (record.type === "dependency_edge") {
      summary.dependencyEdgeCount += 1;
    } else if (record.type === "warning") {
      summary.warningCount += 1;
      if (typeof record.message === "string" && record.message.trim()) summary.latestWarning = record.message.trim();
    } else if (record.type === "error") {
      summary.errorCount += 1;
      if (typeof record.message === "string" && record.message.trim()) summary.latestError = record.message.trim();
      if (record.code === "section_semantic_idle_timeout") {
        summary.semanticIdleSectionCount = (summary.semanticIdleSectionCount ?? 0) + 1;
      }
    } else if (record.type === "progress") {
      const metadata =
        record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? (record.metadata as Record<string, unknown>)
          : {};
      const sectionStatus = metadata.sectionStatus;
      if (sectionStatus === "succeeded") summary.sectionSucceededCount = (summary.sectionSucceededCount ?? 0) + 1;
      else if (sectionStatus === "failed") summary.sectionFailedCount = (summary.sectionFailedCount ?? 0) + 1;
      else if (sectionStatus === "skipped") summary.sectionSkippedCount = (summary.sectionSkippedCount ?? 0) + 1;
      const sectionHeading = metadata.sectionHeading;
      if (typeof sectionHeading === "string" && sectionHeading.trim()) summary.latestSectionHeading = sectionHeading.trim();
    }
  }
  if (renderedCardLedger.cardCount > 0) {
    summary.renderedCardCount = renderedCardLedger.cardCount;
    summary.renderedCardBlockedCount = renderedCardLedger.blockedCardCount;
    summary.renderedCardDuplicateCount = renderedCardLedger.duplicateCardCount;
    summary.renderedCardRejectedCount = renderedCardLedger.rejectedCardCount;
    summary.renderedCardEvidenceCount = renderedCardLedger.evidenceCardCount;
    summary.renderedCardSplitLineageCount = renderedCardLedger.splitLineageCount;
    summary.renderedCardInvalidatedCount = renderedCardLedger.invalidatedCardCount;
    summary.renderedCardLedgerChecksum = renderedCardLedger.checksum;
    summary.renderedCardLedger = renderedCardLedger.entries;
  }
  return summary;
}

export function normalizeProjectBoardPlanningSnapshot(
  value: ProjectBoardPlanningSnapshot,
  fallbackCreatedAt: string,
): ProjectBoardPlanningSnapshot[] {
  if (!value || typeof value !== "object") return [];
  if (typeof value.id !== "string" || !value.id.trim()) return [];
  if (typeof value.boardId !== "string" || !value.boardId.trim()) return [];
  if (typeof value.runId !== "string" || !value.runId.trim()) return [];
  if (!PROJECT_BOARD_PLANNING_SNAPSHOT_KINDS.has(value.kind)) return [];
  if (!PROJECT_BOARD_SYNTHESIS_RUN_STAGES.has(value.planningStage)) return [];
  const planningStatus: ProjectBoardSynthesisRunStatus = [
    "running",
    "pause_requested",
    "paused",
    "abandoned",
    "succeeded",
    "failed",
  ].includes(value.planningStatus)
    ? value.planningStatus
    : "running";
  const sourceHashes = Array.isArray(value.sourceHashes)
    ? value.sourceHashes.flatMap((source): ProjectBoardPlanningSnapshotSourceHash[] => {
        if (!source || typeof source !== "object") return [];
        const sourceId = typeof source.sourceId === "string" ? source.sourceId.trim() : "";
        const kind = typeof source.kind === "string" ? (source.kind as ProjectBoardSourceKind) : "markdown";
        if (!sourceId || !PROJECT_BOARD_SOURCE_KIND_VALUES.has(kind)) return [];
        return [
          {
            sourceId,
            kind,
            ...(typeof source.sourceKey === "string" && source.sourceKey.trim() ? { sourceKey: source.sourceKey.trim() } : {}),
            ...(typeof source.path === "string" && source.path.trim() ? { path: source.path.trim() } : {}),
            ...(typeof source.contentHash === "string" && source.contentHash.trim() ? { contentHash: source.contentHash.trim() } : {}),
            ...(typeof source.changeState === "string" && ["new", "changed", "unchanged", "removed"].includes(source.changeState)
              ? { changeState: source.changeState as ProjectBoardSourceChangeState }
              : {}),
            ...(typeof source.includeInSynthesis === "boolean" ? { includeInSynthesis: source.includeInSynthesis } : {}),
          },
        ];
      })
    : [];
  const cards = Array.isArray(value.cards)
    ? value.cards.flatMap((card): ProjectBoardPlanningSnapshotCard[] => {
        if (!card || typeof card !== "object") return [];
        const cardId = typeof card.cardId === "string" ? card.cardId.trim() : "";
        const sourceId = typeof card.sourceId === "string" ? card.sourceId.trim() : "";
        const sourceKind =
          typeof card.sourceKind === "string" && PROJECT_BOARD_CARD_SOURCE_KIND_VALUES.has(card.sourceKind as ProjectBoardCardSourceKind)
            ? (card.sourceKind as ProjectBoardCardSourceKind)
            : "board_synthesis";
        const status =
          typeof card.status === "string" && PROJECT_BOARD_CARD_STATUS_VALUES.has(card.status as ProjectBoardCardStatus)
            ? (card.status as ProjectBoardCardStatus)
            : "draft";
        const candidateStatus =
          typeof card.candidateStatus === "string" &&
          PROJECT_BOARD_CARD_CANDIDATE_STATUS_VALUES.has(card.candidateStatus as ProjectBoardCardCandidateStatus)
            ? (card.candidateStatus as ProjectBoardCardCandidateStatus)
            : "needs_clarification";
        const renderFingerprint = typeof card.renderFingerprint === "string" ? card.renderFingerprint.trim() : "";
        if (!cardId || !sourceId || !renderFingerprint) return [];
        return [
          {
            cardId,
            sourceId,
            sourceKind,
            title: typeof card.title === "string" ? card.title : "",
            status,
            candidateStatus,
            sourceRefs: Array.isArray(card.sourceRefs) ? card.sourceRefs.filter((item): item is string => typeof item === "string") : [],
            blockedBy: Array.isArray(card.blockedBy) ? card.blockedBy.filter((item): item is string => typeof item === "string") : [],
            renderFingerprint,
            ...(typeof card.orchestrationTaskId === "string" && card.orchestrationTaskId.trim()
              ? { orchestrationTaskId: card.orchestrationTaskId.trim() }
              : {}),
          },
        ];
      })
    : [];
  const cardIds = Array.isArray(value.cardIds)
    ? value.cardIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : cards.map((card) => card.cardId);
  const scopeContract = normalizeProjectBoardScopeContract(value.scopeContract);
  const planningDepth = normalizeProjectBoardPlanningDepthAssessment(value.planningDepth);
  return [
    {
      id: value.id.trim(),
      boardId: value.boardId.trim(),
      runId: value.runId.trim(),
      kind: value.kind,
      planningStatus,
      planningStage: value.planningStage,
      createdAt: typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt.trim() : fallbackCreatedAt,
      cardCount: Math.max(
        0,
        Math.round(typeof value.cardCount === "number" && Number.isFinite(value.cardCount) ? value.cardCount : cards.length),
      ),
      readyCandidateCount: Math.max(
        0,
        Math.round(
          typeof value.readyCandidateCount === "number" && Number.isFinite(value.readyCandidateCount) ? value.readyCandidateCount : 0,
        ),
      ),
      ticketizedCount: Math.max(
        0,
        Math.round(typeof value.ticketizedCount === "number" && Number.isFinite(value.ticketizedCount) ? value.ticketizedCount : 0),
      ),
      sourceHashes,
      ...(scopeContract ? { scopeContract } : {}),
      ...(planningDepth ? { planningDepth } : {}),
      cardIds,
      cards,
      renderFingerprint:
        typeof value.renderFingerprint === "string" && value.renderFingerprint.trim()
          ? value.renderFingerprint.trim()
          : projectBoardPlanningStableHash("planning-snapshot", { sourceHashes, cards }),
    },
  ];
}

function normalizeProjectBoardScopeContract(value: unknown): ProjectBoardScopeContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    included: normalizeProjectBoardScopeFeatures(record.included),
    excluded: normalizeProjectBoardScopeFeatures(record.excluded),
    requiredCapabilities: normalizePlanningSnapshotStringArray(record.requiredCapabilities, 20, 500),
    supportingCapabilities: normalizePlanningSnapshotStringArray(record.supportingCapabilities, 20, 500),
    optionalCapabilities: normalizePlanningSnapshotStringArray(record.optionalCapabilities, 20, 500),
    excludedCapabilities: normalizePlanningSnapshotStringArray(record.excludedCapabilities, 20, 500),
    planningDepth: normalizeProjectBoardPlanningDepthAssessment(record.planningDepth),
    planningDepthHints: normalizePlanningSnapshotStringArray(record.planningDepthHints, 12, 500),
    openQuestions: normalizePlanningSnapshotStringArray(record.openQuestions, 12, 500),
    evidence: normalizePlanningSnapshotStringArray(record.evidence, 20, 500),
  };
}

function normalizeProjectBoardPlanningDepthAssessment(value: unknown): ProjectBoardPlanningDepthAssessment | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const level =
    typeof record.level === "string" && ["shallow", "standard", "deep", "phased"].includes(record.level) ? record.level : undefined;
  if (!level) return undefined;
  const rawScore = typeof record.score === "number" && Number.isFinite(record.score) ? record.score : 0;
  return {
    score: Math.max(0, Math.min(100, Math.round(rawScore))),
    level: level as ProjectBoardPlanningDepthAssessment["level"],
    signals: normalizePlanningSnapshotStringArray(record.signals, 20, 500),
    guidance: typeof record.guidance === "string" ? record.guidance.trim().slice(0, 1000) : "",
  };
}

function normalizeProjectBoardScopeFeatures(value: unknown): ProjectBoardScopeFeature[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ProjectBoardScopeFeature>();
  for (const item of value) {
    if (typeof item !== "string" || !PROJECT_BOARD_SCOPE_FEATURE_VALUES.has(item as ProjectBoardScopeFeature)) continue;
    seen.add(item as ProjectBoardScopeFeature);
  }
  return [...seen];
}

function normalizePlanningSnapshotStringArray(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, limit);
}

export function projectBoardPlanningStableHash(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(projectBoardPlanningStableJson(value)).digest("hex").slice(0, 24)}`;
}

export function projectBoardPlanningStableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => projectBoardPlanningStableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${projectBoardPlanningStableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
