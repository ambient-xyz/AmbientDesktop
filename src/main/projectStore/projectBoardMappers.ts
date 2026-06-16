import { projectBoardProofPolicyRequiresProofSpec } from "../../shared/projectBoardProofImpact";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

import type {
  OrchestrationRun,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClaimSummary,
  ProjectBoardCardProofEvidenceQuality,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewReviewer,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardSourceKind,
  ProjectBoardCardSplitOutcome,
  ProjectBoardCardSplitOutcomeStatus,
  ProjectBoardCardExecutionSessionPolicy,
  ProjectBoardCardStatus,
  ProjectBoardCardRunFeedback,
  ProjectBoardCardRunFeedbackSource,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardTestPlan,
  ProjectBoardCardTouchedField,
  ProjectBoardCharter,
  ProjectBoardCharterProjectSummary,
  ProjectBoardCharterStatus,
  ProjectBoardEvent,
  ProjectBoardEventKind,
  ProjectBoardExecutionArtifact,
  ProjectBoardExecutionArtifactHandoff,
  ProjectBoardExecutionArtifactProof,
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotCard,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardPlanningSnapshotSourceHash,
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardProofFollowUpSuggestion,
  ProjectBoardQuestion,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
  ProjectBoardSource,
  ProjectBoardSourceAuthorityRole,
  ProjectBoardSourceChangeState,
  ProjectBoardSourceClassifiedBy,
  ProjectBoardSourceKind,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalAnswer,
  ProjectBoardSynthesisProposalCard,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectBoardSynthesisProposalStatus,
  ProjectBoardSummary,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunEvent,
  ProjectBoardSynthesisRunProgressiveRecord,
  ProjectBoardSynthesisRunProgressiveSummary,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
  ProjectBoardStatus,
  ProjectBoardUiMockRole,
  OrchestrationTask,
  PlannerPlanArtifact,
  PlannerPlanStep,
} from "../../shared/types";

export type {
  OrchestrationTask,
  ProjectBoardCard,
  ProjectBoardCharter,
  ProjectBoardEvent,
  ProjectBoardExecutionArtifact,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSummary,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisRun,
} from "../../shared/types";

import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import { projectBoardStructuredClarificationDecisions } from "../../shared/projectBoardClarificationDecisions";
import type { ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import { dedupeProjectBoardQuestions, projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import { normalizeProjectBoardPmReviewReport, type ProjectBoardSynthesisCardInput, type ProjectBoardSynthesisDraft } from "../projectBoardSynthesis";
import { buildProjectBoardRenderedCardLedger } from "../projectBoardRenderedCardLedger";
import { buildProjectBoardKickoffContextBrief } from "../projectBoardKickoffDefaultProvider";
import type { BoardEventArtifact, ProposalManifestArtifact, RunHandoffArtifact, RunManifestArtifact, RunProofArtifact } from "../projectBoardArtifacts";
import {
  projectBoardSourceAuthorityRole,
  projectBoardSourceChangeState,
  projectBoardSourceClassificationDefaults,
  projectBoardSourceContentHash,
  projectBoardSourceDeterministicAuthorityLocked,
  projectBoardSourceIncludedInSynthesis,
  projectBoardSourceKey,
} from "../projectBoardSourceIdentity";
import {
  type ProjectBoardTaskToolAction,
  projectBoardTaskToolActionDiagnostics,
  projectBoardTaskToolActionIntegrityIssues,
  projectBoardTaskToolActionsForScope,
  projectBoardTaskToolActionsFromProofOfWork,
  projectBoardTaskToolBrowserTraces,
  projectBoardTaskToolChangedFiles,
  projectBoardTaskToolCompleted,
  projectBoardTaskToolManualChecks,
  projectBoardTaskToolRemaining,
  projectBoardTaskToolScreenshots,
  projectBoardTaskToolVisualChecks,
} from "../projectBoardTaskTools";
import { defaultProjectBoardClaimAgentId, projectBoardClaimProjectionFromProjectBoardEvents } from "../projectBoardClaims";
import { normalizePlannerOpenQuestions } from "../plannerMode";

export interface ProjectBoardStoreRow {
  id: string;
  project_path: string;
  source_thread_id: string | null;
  status: ProjectBoardStatus;
  title: string;
  summary: string;
  charter_id: string | null;
  active_draft_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectBoardExecutionArtifactStoreRow {
  id: string;
  board_id: string;
  card_id: string;
  status: string;
  source: string;
  agent_id: string | null;
  pi_session_id: string | null;
  workspace_branch: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  proof_json: string | null;
  handoff_json: string | null;
  created_at: string;
}

export interface ProjectBoardCardPendingPiUpdateStoreRow {
  title: string;
  description: string;
  candidate_status: ProjectBoardCardCandidateStatus;
  priority: number | null;
  phase: string | null;
  labels_json: string;
  blocked_by_json: string;
  acceptance_criteria_json: string;
  test_plan_json: string;
  source_refs_json: string | null;
  clarification_questions_json: string | null;
  clarification_suggestions_json: string | null;
  clarification_answers_json: string | null;
  clarification_decisions_json: string | null;
  ui_mock_role: string | null;
  requires_ui_mock_approval: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectBoardCardStoreRow extends ProjectBoardCardPendingPiUpdateStoreRow {
  id: string;
  board_id: string;
  status: ProjectBoardCardStatus;
  source_kind: ProjectBoardCardSourceKind;
  source_id: string;
  source_thread_id: string | null;
  source_message_id: string | null;
  orchestration_task_id: string | null;
  execution_thread_id: string | null;
  execution_session_policy: ProjectBoardCardExecutionSessionPolicy | null;
  proof_review_json: string | null;
  split_outcome_json: string | null;
  objective_provenance_json: string | null;
  run_feedback_json: string | null;
  user_touched_fields_json: string | null;
  user_touched_at: string | null;
  pending_pi_update_json: string | null;
}

export interface ProjectBoardCardDependencyExecutionEntry {
  ref: string;
  title: string;
  cardId?: string;
  taskId?: string;
  cardStatus?: string;
  taskIdentifier?: string;
  taskState?: string;
  workspacePath?: string;
  branchName?: string;
  latestRunId?: string;
  latestRunStatus?: string;
  proofSummary?: string;
  changedFiles: string[];
  commands: string[];
  manualChecks: string[];
  completed: string[];
}

export interface ProjectBoardCardDependencyExecutionContext {
  available: ProjectBoardCardDependencyExecutionEntry[];
  pending: string[];
}

export function projectBoardResolveInside(rootPath: string, relativePath: string): string {
  if (!relativePath.trim() || isAbsolute(relativePath)) throw new Error(`Deliverable path must be workspace-relative: ${relativePath}`);
  const root = resolve(rootPath);
  const candidate = resolve(root, relativePath);
  const offset = relative(root, candidate);
  if (!offset || offset.startsWith("..") || isAbsolute(offset)) throw new Error(`Deliverable path escapes its root: ${relativePath}`);
  return candidate;
}

export function projectBoardDependencyArtifactKey(entry: ProjectBoardCardDependencyExecutionEntry, runId: string): string {
  const label = [entry.taskIdentifier, entry.title, entry.ref]
    .map((item) => item?.trim())
    .find((item): item is string => Boolean(item));
  const safeLabel = (label ?? "dependency")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const hash = createHash("sha256").update(`${entry.ref}\n${entry.taskId ?? ""}\n${runId}`).digest("hex").slice(0, 12);
  return `${safeLabel || "dependency"}-${hash}`;
}

export interface ProjectBoardDependencyArtifactImport {
  kind: "project_board_dependency_artifact_import";
  version: 1;
  key: string;
  boardId: string;
  dependentCardId: string;
  dependentTaskId: string;
  dependencyRef: string;
  dependencyTitle: string;
  dependencyCardId?: string;
  dependencyTaskId?: string;
  dependencyTaskIdentifier?: string;
  dependencyRunId?: string;
  sourceWorkspacePath?: string;
  importPath: string;
  filesRoot: string;
  manifestPath: string;
  declaredMaterialFiles: string[];
  materialFiles: string[];
  skippedFiles: string[];
  excludedFiles: string[];
  changedFiles: string[];
  commands: string[];
  manualChecks: string[];
  completed: string[];
  proofSummary?: string;
  importedAt: string;
}

export interface ProjectBoardDependencyArtifactImportResult {
  kind: "project_board_dependency_artifact_import_result";
  version: 1;
  boardId?: string;
  dependentCardId?: string;
  dependentTaskId: string;
  workspacePath: string;
  artifactRoot: string;
  manifestPath: string;
  imports: ProjectBoardDependencyArtifactImport[];
  pending: string[];
  importedAt: string;
}

export function projectBoardDependencyArtifactPromptSection(result?: ProjectBoardDependencyArtifactImportResult): string {
  if (!result || (result.imports.length === 0 && result.pending.length === 0)) return "";
  const lines = [
    "Dependency artifact imports:",
    "- Ambient has staged available dependency artifacts into this run workspace. Prefer these imported files over copying from sibling task workspaces.",
    `- Artifact root: ${result.artifactRoot}`,
    `- Import manifest: ${result.manifestPath}`,
  ];
  if (result.imports.length) {
    lines.push("Available imported dependency bundles:");
    for (const item of result.imports.slice(0, 8)) {
      const identity = item.dependencyTaskIdentifier ? `${item.dependencyTaskIdentifier}: ${item.dependencyTitle}` : item.dependencyTitle;
      lines.push(`- ${identity}; blocker ref: ${item.dependencyRef}`);
      lines.push(`  - Files root: ${item.filesRoot}`);
      lines.push(`  - Bundle manifest: ${item.manifestPath}`);
      if (item.materialFiles.length) lines.push(`  - Imported material files: ${item.materialFiles.slice(0, 12).join(", ")}`);
      if (item.skippedFiles.length) lines.push(`  - Missing or skipped files: ${item.skippedFiles.slice(0, 8).join(", ")}`);
      if (item.commands.length) lines.push(`  - Source proof commands: ${item.commands.slice(0, 5).join(" | ")}`);
      if (item.proofSummary) lines.push(`  - Source proof summary: ${item.proofSummary}`);
    }
  }
  if (result.pending.length) {
    lines.push("Pending dependency artifact imports:");
    lines.push(...result.pending.slice(0, 8).map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

export function projectBoardClaimSummaryFromEvents(events: ProjectBoardEvent[]): NonNullable<ProjectBoardSummary["claims"]> {
  const localAgentId = defaultProjectBoardClaimAgentId();
  const projection = projectBoardClaimProjectionFromProjectBoardEvents(events);
  return {
    active: projection.activeClaims.map((claim) => ({
      status: "active",
      cardId: claim.cardId,
      runId: claim.runId,
      agentId: claim.agentId,
      eventId: claim.eventId,
      claimedAt: claim.claimedAt,
      expiredAt: claim.expiredAt,
      leaseUntil: claim.leaseUntil,
      lastHeartbeatAt: claim.lastHeartbeatAt,
      appInstanceId: claim.appInstanceId,
      displayName: claim.displayName,
      workspaceBranch: claim.workspaceBranch,
      baseCommit: claim.baseCommit,
      expirationRecorded: claim.expirationRecorded,
      ownedByLocal: claim.agentId === localAgentId,
    })),
    expired: projection.expiredClaims.map((claim) => ({
      status: "expired",
      cardId: claim.cardId,
      runId: claim.runId,
      agentId: claim.agentId,
      eventId: claim.eventId,
      claimedAt: claim.claimedAt,
      expiredAt: claim.expiredAt,
      leaseUntil: claim.leaseUntil,
      lastHeartbeatAt: claim.lastHeartbeatAt,
      appInstanceId: claim.appInstanceId,
      displayName: claim.displayName,
      workspaceBranch: claim.workspaceBranch,
      baseCommit: claim.baseCommit,
      expirationRecorded: claim.expirationRecorded,
      ownedByLocal: claim.agentId === localAgentId,
    })),
    conflicts: projection.conflicts.map((conflict) => ({
      status: "conflict",
      cardId: conflict.cardId,
      runId: conflict.runId,
      agentId: conflict.agentId,
      eventId: conflict.eventId,
      claimedAt: conflict.createdAt,
      leaseUntil: conflict.leaseUntil,
      appInstanceId: conflict.appInstanceId,
      displayName: conflict.displayName,
      workspaceBranch: conflict.workspaceBranch,
      baseCommit: conflict.baseCommit,
      blockedByRunId: conflict.blockedByRunId,
      ownedByLocal: conflict.agentId === localAgentId,
    })),
  };
}

export function projectBoardCardsWithClaimSummaries(
  cards: ProjectBoardCard[],
  claims: NonNullable<ProjectBoardSummary["claims"]>,
): ProjectBoardCard[] {
  const activeByCard = new Map(claims.active.map((claim) => [claim.cardId, claim]));
  const expiredByCard = new Map(claims.expired.map((claim) => [claim.cardId, claim]));
  const conflictsByCard = new Map<string, ProjectBoardCardClaimSummary[]>();
  for (const conflict of claims.conflicts) {
    conflictsByCard.set(conflict.cardId, [...(conflictsByCard.get(conflict.cardId) ?? []), conflict]);
  }
  return cards.map((card) => ({
    ...card,
    claim: activeByCard.get(card.id) ?? expiredByCard.get(card.id),
    claimConflicts: conflictsByCard.get(card.id),
  }));
}

export function projectBoardClaimBlockedTaskIdsForRows(
  rows: ProjectBoardCardStoreRow[],
  claims: NonNullable<ProjectBoardSummary["claims"]>,
): string[] {
  const activeByCard = new Map(claims.active.map((claim) => [claim.cardId, claim]));
  const conflictCardIds = new Set(claims.conflicts.map((claim) => claim.cardId));
  return rows.flatMap((row) => {
    if (!row.orchestration_task_id) return [];
    const active = activeByCard.get(row.id);
    return conflictCardIds.has(row.id) || (active && !active.ownedByLocal) ? [row.orchestration_task_id] : [];
  });
}

const PROJECT_BOARD_PROTECTED_CANDIDATE_STATUSES = new Set<ProjectBoardCardCandidateStatus>(["evidence", "duplicate", "rejected"]);
export function projectBoardSynthesisCardRowProtectedFromDraftReplacement(
  row: ProjectBoardCardStoreRow,
  protectedClaimCardIds: ReadonlySet<string> = new Set(),
): boolean {
  return (
    row.status !== "draft" ||
    Boolean(row.orchestration_task_id) ||
    protectedClaimCardIds.has(row.id) ||
    parseProjectBoardCardTouchedFields(row.user_touched_fields_json).length > 0 ||
    PROJECT_BOARD_PROTECTED_CANDIDATE_STATUSES.has(row.candidate_status) ||
    Boolean(row.pending_pi_update_json)
  );
}

export interface ProjectBoardSynthesisStartFreshCardSnapshot {
  cardId: string;
  title: string;
  sourceId: string;
  status: ProjectBoardCardStatus;
  candidateStatus: ProjectBoardCardCandidateStatus;
  userTouchedFields: ProjectBoardCardTouchedField[];
  orchestrationTaskId?: string;
  executionThreadId?: string;
  clarificationQuestionCount: number;
}

export function projectBoardSynthesisStartFreshCardSnapshot(row: ProjectBoardCardStoreRow): ProjectBoardSynthesisStartFreshCardSnapshot {
  return {
    cardId: row.id,
    title: row.title,
    sourceId: row.source_id,
    status: row.status,
    candidateStatus: row.candidate_status,
    userTouchedFields: parseProjectBoardCardTouchedFields(row.user_touched_fields_json),
    orchestrationTaskId: row.orchestration_task_id ?? undefined,
    executionThreadId: row.execution_thread_id ?? undefined,
    clarificationQuestionCount: parseProjectBoardStringList(row.clarification_questions_json).length,
  };
}

export interface ProjectBoardCardClosedStateRow {
  status: ProjectBoardCardStatus | string;
  proof_review_json: string | null;
}

export function projectBoardCardRowIsClosedDone(row: ProjectBoardCardClosedStateRow): boolean {
  if (row.status === "done") return true;
  if (!row.proof_review_json) return false;
  try {
    return mapProjectBoardCardProofReview(row.proof_review_json, normalizeProjectBoardProofFollowUpSuggestion)?.status === "done";
  } catch {
    return false;
  }
}

export function resolveProjectBoardTaskBlockers(card: ProjectBoardCard, cards: ProjectBoardCard[], tasks: OrchestrationTask[]): string[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return normalizeTaskReferences(
    card.blockedBy.flatMap((blockerRef) => {
      const blockerCard = cards.find((candidate) => candidate.id !== card.id && projectBoardCardMatchesRef(candidate, blockerRef));
      if (blockerCard && projectBoardCardIsTerminalAuditCandidate(blockerCard)) return [];
      if (!blockerCard?.orchestrationTaskId) return blockerRef;
      return tasksById.get(blockerCard.orchestrationTaskId)?.identifier ?? blockerCard.orchestrationTaskId;
    }),
  );
}

export function projectBoardCardIsTerminalAuditCandidate(card: Pick<ProjectBoardCard, "candidateStatus">): boolean {
  return card.candidateStatus === "evidence" || card.candidateStatus === "duplicate" || card.candidateStatus === "rejected";
}

export function projectBoardClosedParentForRunFollowUp(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): ProjectBoardCard | undefined {
  if (card.sourceKind !== "run_follow_up") return undefined;
  return boardCards.find(
    (candidate) =>
      candidate.id !== card.id &&
      card.blockedBy.some((ref) => projectBoardCardMatchesRef(candidate, ref)) &&
      (candidate.status === "done" || candidate.proofReview?.status === "done" || candidate.candidateStatus === "evidence"),
  );
}

export function projectBoardTestPolicyRequiresProofSpec(policy: Record<string, unknown>): boolean {
  // Delegate to the shared negation-aware helper so the main-process proof gate and
  // the renderer agree; a stale bare-regex copy here read "tests are not required" as
  // strict, making the UI enable Create Ready Tasks and main throw on the click.
  return projectBoardProofPolicyRequiresProofSpec(policy);
}

export type ProjectBoardProofReviewApplicationBlocker =
  | "newer_run_started"
  | "proof_review_cleared"
  | "proof_review_superseded"
  | "proof_review_unreadable";

export function projectBoardProofReviewApplicationBlocker(input: {
  latestRunId?: string;
  runId: string;
  proofReviewJson: string | null;
  requireCurrentReview: boolean;
}): ProjectBoardProofReviewApplicationBlocker | undefined {
  if (input.latestRunId && input.latestRunId !== input.runId) return "newer_run_started";
  if (!input.requireCurrentReview) return undefined;
  if (!input.proofReviewJson) return "proof_review_cleared";
  try {
    const currentReview = mapProjectBoardCardProofReview(input.proofReviewJson, normalizeProjectBoardProofFollowUpSuggestion);
    if (currentReview?.runId !== input.runId) return "proof_review_superseded";
  } catch {
    return "proof_review_unreadable";
  }
  return undefined;
}

export interface PlannerPlanDraftCard {
  title: string;
  description: string;
  sourceId: string;
  labels: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  testPlan: ProjectBoardCardTestPlan;
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
      (input.sourceId ? byId.get(input.sourceId) : undefined) ??
      (input.sourceKey ? bySourceKey.get(input.sourceKey) : undefined);
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
    .split(/[\/_\-:]+|\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const meaningful = words.filter((word) => !/^(src|docs?|test|tests?|spec|plan|implementation|architecture|readme|md|ts|tsx|js|jsx|json)$/i.test(word));
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
    .join("\n")
    .length;
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
  const estimatedPromptChars = includedGroupSources.reduce((total, source) => total + projectBoardSourceImpactEstimatedPromptChars(source), 0);
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

export function projectBoardSourceDraftRefreshEventMetadata(event: ProjectBoardEvent): {
  sourceImpactEventIds: string[];
  appliedCardIds: string[];
} | undefined {
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
  if (input.targetedRefreshOptional) parts.push(`${input.affectedDraftCount} draft card${input.affectedDraftCount === 1 ? "" : "s"} cite this source and can be refreshed selectively.`);
  if (input.nextRunFeedbackRecommended) parts.push(`${input.affectedExecutableCount} ticketized card${input.affectedExecutableCount === 1 ? "" : "s"} cite this source; use additive next-run feedback instead of rewriting approved cards.`);
  if (input.durablePlanPrimaryCount > 0 && input.ignoredChatCount > 0) parts.push("Durable-plan authority is active, so ignored chats remain inspectable but excluded by default.");
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
  const sourceText = sourceLabels.length > 0
    ? `${sourceLabels.join("; ")}${moreCount > 0 ? `; +${moreCount} more` : ""}`
    : "current source selection";
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
  const sourceText = sourceLabels.length > 0
    ? `${sourceLabels.join("; ")}${moreCount > 0 ? `; +${moreCount} more` : ""}`
    : "current source selection";
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

export function compileProjectBoardCharter(board: { title: string; summary: string }, questions: ProjectBoardQuestion[], sources: ProjectBoardSource[]): {
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
  const executionPolicyText = answers[4] || "Work dependency-ready cards first, keep retrying incomplete cards within the project pass budget, and stop for terminal blockers.";
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
    budgetPolicy: { maxPassesPerCard: 6, maxRuntimeMsPerCard: 1_200_000, pauseOnTerminalBlocker: true, executionPolicy: executionPolicyText },
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
  const majorSystems = uniqueLimitedStrings(
    [
      ...includedSources.map(sourceMajorSystemLabel),
      ...keywordSystemHints(corpusText),
    ],
    8,
  );
  const coverageGaps = projectBoardCharterCoverageGaps(includedSources);
  const unresolvedDecisions = input.questions
    .filter((question) => question.required && !question.answer?.trim())
    .map((question) => question.question);
  const risks = uniqueLimitedStrings(
    [
      ...coverageGaps.map((gap) => `Coverage gap: ${gap}`),
      ...includedSources
        .filter((source) => /\b(risk|blocker|blocked|unknown|todo|gap|conflict|ambiguous|defer)\b/i.test(`${source.title}\n${source.summary}\n${source.excerpt ?? ""}`))
        .map((source) => `Review ${sourceDisplayName(source)} for risks or unresolved scope.`),
    ],
    8,
  );
  const dependencyHints = uniqueLimitedStrings(
    [
      ...includedSources
        .filter((source) => /\b(depend|blocked|sequence|phase|stage|foundation|before|after|prereq)\b/i.test(`${source.title}\n${source.summary}\n${source.excerpt ?? ""}`))
        .map((source) => `Use dependency cues from ${sourceDisplayName(source)}.`),
      input.compiled.dependencyPolicy.executionPolicy,
    ].filter((item): item is string => typeof item === "string" && item.trim().length > 0),
    8,
  );
  const sourceCoverage = includedSources.slice(0, 12).map((source) =>
    [sourceDisplayName(source), source.kind, `${Math.round(source.relevance)} relevance`, source.authorityRole ? `${source.authorityRole} authority` : ""]
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

export function firstMeaningfulLine(content: string): string {
  return (
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find(Boolean) ?? ""
  );
}

export function plannerVerificationToTestPlan(verification: string[]): ProjectBoardCardTestPlan {
  const buckets: ProjectBoardCardTestPlan = { unit: [], integration: [], visual: [], manual: [] };
  const items = verification.map((entry) => entry.trim()).filter(Boolean);
  for (const item of items) {
    const lower = item.toLowerCase();
    if (lower.includes("unit")) buckets.unit.push(item);
    else if (lower.includes("visual") || lower.includes("screenshot") || lower.includes("browser")) buckets.visual.push(item);
    else if (lower.includes("integration") || lower.includes("e2e") || lower.includes("smoke")) buckets.integration.push(item);
    else buckets.manual.push(item);
  }
  if (!items.length) buckets.manual.push("Review changed behavior against the plan.");
  return buckets;
}

export function plannerPlanClarificationQuestions(artifact: PlannerPlanArtifact): string[] {
  return normalizeProjectBoardClarificationQuestions(
    [
      ...normalizePlannerOpenQuestions(artifact.openQuestions).filter(plannerOpenQuestionBlocksCandidateReadiness),
      ...artifact.decisionQuestions.filter((question) => question.required && !question.answer).map((question) => question.question),
    ],
    8,
  );
}

export function plannerPlanClarificationDecisions(artifact: PlannerPlanArtifact, now: string): ProjectBoardCardClarificationDecision[] {
  const openQuestions = normalizePlannerOpenQuestions(artifact.openQuestions)
    .filter(plannerOpenQuestionBlocksCandidateReadiness)
    .map((question) => ({ question, decision: undefined }));
  const decisionQuestions = artifact.decisionQuestions
    .filter((question) => question.required && !question.answer)
    .map((question) => ({ question: question.question, decision: question }));
  return normalizeProjectBoardClarificationDecisions(
    [...openQuestions, ...decisionQuestions].map(({ question, decision }) => {
      const suggestedOption = decision?.options.find((option) => option.id === decision.recommendedOptionId);
      const suggestedAnswer = suggestedOption ? `${suggestedOption.label}: ${suggestedOption.description}` : undefined;
      return {
        id: decision?.id?.trim() || `planner-${stableProjectBoardRef(question)}`,
        question,
        canonicalKey: stableProjectBoardRef(question),
        source: "card",
        state: "open",
        ...(suggestedAnswer
          ? {
              suggestedAnswer,
              rationale: "Recommended option from the durable planner decision question.",
              confidence: "medium",
              safeToAccept: false,
              questionKind: "user_preference",
            }
          : {}),
        createdAt: now,
        updatedAt: now,
      } satisfies ProjectBoardCardClarificationDecision;
    }),
    {
      clarificationQuestions: plannerPlanClarificationQuestions(artifact),
      clarificationSuggestions: [],
      clarificationAnswers: [],
      createdAt: now,
      updatedAt: now,
    },
  );
}

function plannerOpenQuestionBlocksCandidateReadiness(question: string): boolean {
  const normalized = question.trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  if (/^risk\s*:/i.test(normalized)) return false;
  if (/^open question\s*:/i.test(normalized) && /\b(out of scope|optional|future|later|nice[-\s]?to[-\s]?have|easy to add)\b/i.test(normalized)) {
    return false;
  }
  return true;
}

export function plannerPlanCandidateStatus(artifact: PlannerPlanArtifact): ProjectBoardCardCandidateStatus {
  return plannerPlanClarificationQuestions(artifact).length > 0 ? "needs_clarification" : "ready_to_create";
}

export function plannerPlanShouldStayCompact(_artifact: PlannerPlanArtifact, _steps: PlannerPlanStep[] = _artifact.steps.filter((step) => step.title.trim())): boolean {
  return true;
}

export function plannerPlanDraftCards(artifact: PlannerPlanArtifact): PlannerPlanDraftCard[] {
  const testPlan = plannerVerificationToTestPlan(artifact.verification);
  const steps = artifact.steps.filter((step) => step.title.trim());
  if (plannerPlanShouldStayCompact(artifact, steps)) {
    return [
      {
        title: artifact.title.trim() || steps[0]?.title.trim() || "Planner plan",
        description: artifact.summary.trim() || firstMeaningfulLine(artifact.content) || "Planner-mode implementation card.",
        sourceId: artifact.id,
        labels: ["plan"],
        blockedBy: [],
        acceptanceCriteria: steps.length ? steps.map((step) => step.title.trim()).filter(Boolean) : ["Plan goals are implemented and verified."],
        testPlan,
      },
    ];
  }

  return steps.map((step, index) => {
    const sourceId = plannerPlanStepSourceId(artifact.id, step, index);
    const previousStep = index > 0 ? steps[index - 1] : undefined;
    return {
      title: step.title.trim().slice(0, 180),
      description: plannerPlanStepDescription(artifact, step, index, steps.length),
      sourceId,
      labels: ["plan", "step"],
      blockedBy: previousStep ? [plannerPlanStepSourceId(artifact.id, previousStep, index - 1)] : [],
      acceptanceCriteria: plannerPlanStepAcceptanceCriteria(step),
      testPlan,
    };
  });
}

function plannerPlanStepSourceId(artifactId: string, step: PlannerPlanStep, index: number): string {
  return `${artifactId}#step:${stableProjectBoardRef(step.id || step.title || `step-${index + 1}`)}`;
}

function stableProjectBoardRef(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "step";
}

function plannerPlanStepDescription(artifact: PlannerPlanArtifact, step: PlannerPlanStep, index: number, total: number): string {
  return [
    artifact.summary.trim(),
    step.detail?.trim(),
    `Plan: ${artifact.title.trim() || "Planner plan"}.`,
    `Step ${index + 1} of ${total}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function plannerPlanStepAcceptanceCriteria(step: PlannerPlanStep): string[] {
  const detail = step.detail?.trim();
  if (!detail) return [step.title.trim()];
  const criteria = normalizeCardTextList(
    detail
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean),
    12,
  );
  return criteria.length ? criteria : [step.title.trim()];
}

export function normalizeTaskState(state: string): string {
  return state.trim().toLowerCase().replace(/\s+/g, "_") || "todo";
}

export function projectBoardStatusForTask(task: OrchestrationTask, allTasks: OrchestrationTask[]): ProjectBoardCardStatus {
  const state = normalizeTaskState(task.state);
  if (state === "in_progress") return "in_progress";
  if (state === "review" || state === "needs_review") return "review";
  if (state === "needs_info" || state === "budget_exhausted" || state === "terminal_blocker") return "blocked";
  if (state === "done" || state === "canceled" || state === "duplicate") return "done";
  if (orchestrationTaskHasActiveBlocker(task, allTasks)) return "blocked";
  return "ready";
}

export function projectBoardCardStatusWithProofReview(
  status: ProjectBoardCardStatus,
  proofReview: ProjectBoardCardProofReview | undefined,
): ProjectBoardCardStatus {
  if (!proofReview) return status;
  if (proofReview.status === "done") return "done";
  if (proofReview.status === "ready_for_review") return status === "done" ? "done" : "review";
  if (proofReview.status === "needs_follow_up" || proofReview.status === "retry_recommended" || proofReview.status === "terminally_blocked") {
    return "blocked";
  }
  return status;
}

export function projectBoardTaskStateForProofReview(status: ProjectBoardCardProofReviewStatus): string {
  if (status === "done") return "done";
  if (status === "ready_for_review") return "needs_review";
  if (status === "terminally_blocked") return "terminal_blocker";
  return "needs_info";
}

export interface ProjectBoardProofReviewDraft {
  status: ProjectBoardCardProofReviewStatus;
  summary: string;
  satisfied: string[];
  missing: string[];
  reviewer?: ProjectBoardCardProofReviewReviewer;
  model?: string;
  confidence?: number;
  evidenceQuality?: ProjectBoardCardProofEvidenceQuality;
  recommendedAction?: ProjectBoardCardProofRecommendedAction;
  deterministicStatus?: ProjectBoardCardProofReviewStatus;
  deterministicSummary?: string;
  judgeDurationMs?: number;
  followUpSuggestion?: ProjectBoardProofFollowUpSuggestion;
}

export function projectBoardProofReviewFromDraft(
  draft: ProjectBoardProofReviewDraft,
  run: OrchestrationRun,
  reviewedAt: string,
  followUpCardIds: string[] = [],
): ProjectBoardCardProofReview {
  return {
    status: draft.status,
    summary: draft.summary,
    satisfied: draft.satisfied,
    missing: draft.missing,
    followUpCardIds,
    runId: run.id,
    reviewedAt,
    reviewer: draft.reviewer,
    model: draft.model,
    confidence: draft.confidence,
    evidenceQuality: draft.evidenceQuality,
    recommendedAction: draft.recommendedAction,
    deterministicStatus: draft.deterministicStatus,
    deterministicSummary: draft.deterministicSummary,
    judgeDurationMs: draft.judgeDurationMs,
    followUpSuggestion: draft.followUpSuggestion,
  };
}

export function projectBoardProofObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function stringsFromProjectBoardUnknownArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

export function projectBoardPromptList(values: string[], maxItems: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, maxItems);
}

export function projectBoardPromptSummary(...values: Array<string | undefined>): string | undefined {
  const value = values.map((item) => item?.trim()).find(Boolean);
  return value ? value.slice(0, 700) : undefined;
}

export function projectBoardProofEvidenceText(error: string | undefined, proof: Record<string, unknown> | undefined): string {
  return [
    error ?? "",
    typeof proof?.lastAssistantText === "string" ? proof.lastAssistantText : "",
    typeof proof?.testOutput === "string" ? proof.testOutput : "",
    typeof proof?.diff === "string" ? proof.diff : "",
    typeof proof?.lastAssistantStatus === "string" ? proof.lastAssistantStatus : "",
    proof?.afterRunHook ? JSON.stringify(proof.afterRunHook) : "",
    proof?.browserEvidence ? JSON.stringify(proof.browserEvidence) : "",
    Array.isArray(proof?.taskToolActions) ? JSON.stringify(proof.taskToolActions) : "",
    Array.isArray(proof?.taskActions) ? JSON.stringify(proof.taskActions) : "",
    Array.isArray(proof?.modelTaskActions) ? JSON.stringify(proof.modelTaskActions) : "",
    Array.isArray(proof?.commands) ? JSON.stringify(proof.commands) : "",
    Array.isArray(proof?.visualChecks) ? JSON.stringify(proof.visualChecks) : "",
    Array.isArray(proof?.screenshots) ? JSON.stringify(proof.screenshots) : "",
    proof?.focusLoop ? JSON.stringify(proof.focusLoop) : "",
    proof?.projectBoardRuntimeBudget ? JSON.stringify(proof.projectBoardRuntimeBudget) : "",
    Array.isArray(proof?.gitStatus) ? proof.gitStatus.join("\n") : "",
  ]
    .join("\n")
    .toLowerCase();
}

export function projectBoardAfterRunHookSucceeded(proof: Record<string, unknown> | undefined): boolean {
  const hook = projectBoardProofObject(proof?.afterRunHook);
  return Boolean(hook && hook.ok !== false);
}

export function projectBoardProofRequestsDone(proof: Record<string, unknown> | undefined): boolean {
  const status = typeof proof?.projectBoardStatus === "string" ? proof.projectBoardStatus : undefined;
  const review = projectBoardProofObject(proof?.projectBoardReview);
  return status === "done" || review?.status === "done" || proof?.markProjectBoardDone === true;
}

export function projectBoardHasNegatedVisualEvidence(proofText: string): boolean {
  return /\b(no|not|without|missing|lacks?|unavailable|unable)\b.{0,80}\b(visual|screenshot|browser|canvas|nonblank|viewport|rendered|playwright)\b/.test(
    proofText,
  ) || /\b(visual|screenshot|browser|canvas|nonblank|viewport|rendered|playwright)\b.{0,80}\b(no|not|without|missing|lacks?|unavailable|unable|wasn't|isn't)\b/.test(
    proofText,
  );
}

export function projectBoardHasNegatedManualEvidence(proofText: string): boolean {
  return /\b(no|not|without|missing|lacks?|unavailable|unable)\b.{0,80}\b(manual|review|opened|inspected|playthrough|played|verified)\b/.test(
    proofText,
  ) || /\b(manual|review|opened|inspected|playthrough|played|verified)\b.{0,80}\b(no|not|without|missing|lacks?|unavailable|unable|wasn't|isn't)\b/.test(
    proofText,
  );
}

export function projectBoardHasAcceptanceEvidence(proofText: string): boolean {
  return /\b(acceptance|criteria|done|completed|implemented|satisf(y|ies|ied)|verified|confirmed)\b/.test(proofText);
}

export function projectBoardHasUnitEvidence(proofText: string, proof: Record<string, unknown> | undefined): boolean {
  return projectBoardAfterRunHookSucceeded(proof) || /\b(unit|vitest|jest|spec|tests?|passed|pnpm test|npm test|typecheck|tsc)\b/.test(proofText);
}

export function projectBoardHasIntegrationEvidence(proofText: string, proof: Record<string, unknown> | undefined): boolean {
  return projectBoardAfterRunHookSucceeded(proof) || /\b(integration|e2e|smoke|electron|playwright|browser|build|passed|verified)\b/.test(proofText);
}

export function projectBoardChangedPathForImplementationEvidence(path: string, workspacePath?: string): string {
  const cleaned = projectBoardLocalPathLike(path.replace(/^"+|"+$/g, "").replace(/^\.\/+/, ""));
  if (!workspacePath) return cleaned;
  try {
    const normalizedWorkspace = projectBoardLocalPathLike(workspacePath).replace(/\/+$/, "");
    if (!isAbsolute(cleaned) || !isAbsolute(normalizedWorkspace)) return cleaned;
    const relativePath = relative(normalizedWorkspace, cleaned);
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return cleaned;
    return relativePath;
  } catch {
    return cleaned;
  }
}

function projectBoardLocalPathLike(path: string): string {
  if (!/^file:\/\//i.test(path)) return path;
  try {
    return decodeURIComponent(new URL(path).pathname);
  } catch {
    return path.replace(/^file:\/\//i, "");
  }
}

export function projectBoardIsMeaningfulChangedPath(path: string, workspacePath?: string): boolean {
  const normalized = projectBoardChangedPathForImplementationEvidence(path, workspacePath).replace(/\\/g, "/").replace(/^"+|"+$/g, "").replace(/^\.\/+/, "");
  if (!normalized) return false;
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return false;
  if (normalized.includes("/.git/") || normalized.startsWith(".git/")) return false;
  if (normalized.includes("/.ambient/") || normalized.startsWith(".ambient/")) return false;
  if (normalized.includes("/.ambient-codex/") || normalized.startsWith(".ambient-codex/")) return false;
  if (normalized.includes("/.vite/") || normalized.startsWith(".vite/")) return false;
  if (/(^|\/)\.DS_Store$/.test(normalized)) return false;
  return true;
}

export function projectBoardChangedProofPaths(proof: Record<string, unknown>, workspacePath?: string): string[] {
  const paths: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;
      paths.push(projectBoardChangedPathForImplementationEvidence(trimmed.replace(/^[MADRCU?! ]+\s+/, ""), workspacePath));
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (typeof record.path === "string") paths.push(projectBoardChangedPathForImplementationEvidence(record.path.trim(), workspacePath));
    else if (typeof record.file === "string") paths.push(projectBoardChangedPathForImplementationEvidence(record.file.trim(), workspacePath));
  };
  if (Array.isArray(proof.changedFiles)) proof.changedFiles.forEach(push);
  if (Array.isArray(proof.gitStatus)) proof.gitStatus.forEach(push);
  projectBoardTaskToolChangedFiles(projectBoardTaskToolActionsFromProofOfWork(proof)).forEach(push);
  return paths.filter(Boolean);
}

export function projectBoardHasImplementationEvidence(proof: Record<string, unknown> | undefined, _proofText: string, workspacePath?: string): boolean {
  if (!proof) return false;
  const changedPaths = projectBoardChangedProofPaths(proof, workspacePath);
  if (changedPaths.length > 0) return changedPaths.some((path) => projectBoardIsMeaningfulChangedPath(path, workspacePath));
  const diff = typeof proof.diff === "string" ? proof.diff.trim() : "";
  if (!diff) return false;
  const diffPaths = [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].flatMap((match) => [match[1], match[2]]);
  if (diffPaths.length > 0) return diffPaths.some((path) => projectBoardIsMeaningfulChangedPath(path, workspacePath));
  return true;
}

export function projectBoardHasVisualEvidence(proofText: string, proof: Record<string, unknown> | undefined): boolean {
  if (!proof) return false;
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proof);
  if (
    projectBoardTaskToolScreenshots(taskActions).length > 0 ||
    projectBoardTaskToolBrowserTraces(taskActions).length > 0 ||
    projectBoardTaskToolVisualChecks(taskActions).length > 0
  ) {
    return true;
  }
  if (Array.isArray(proof.screenshots) && proof.screenshots.length > 0) return true;
  if (Array.isArray(proof.visualChecks) && proof.visualChecks.length > 0) return true;
  const browserEvidence = projectBoardProofObject(proof.browserEvidence);
  if (Number(browserEvidence?.screenshotCount ?? 0) > 0 || Number(browserEvidence?.visualCheckCount ?? 0) > 0) return true;
  if (projectBoardHasNegatedVisualEvidence(proofText)) return false;
  return false;
}

export function projectBoardHasManualEvidence(proofText: string, proof: Record<string, unknown> | undefined): boolean {
  const manualChecks = projectBoardStructuredManualChecks(proof);
  if (manualChecks.some((check) => !projectBoardHasNegatedManualEvidence(check.toLowerCase()))) return true;
  if (projectBoardHasNegatedManualEvidence(proofText)) return false;
  return /\b(manual review (confirmed|passed|complete|completed)|manually (confirmed|verified|inspected|reviewed)|opened .{0,80}(confirmed|verified|inspected)|playthrough (passed|completed|verified))\b/.test(
    proofText,
  );
}

function projectBoardStructuredManualChecks(proof: Record<string, unknown> | undefined): string[] {
  if (!proof) return [];
  return normalizeCardTextList([
    ...stringsFromProjectBoardUnknownArray(proof.manualChecks),
    ...projectBoardTaskToolManualChecks(projectBoardTaskToolActionsFromProofOfWork(proof)),
  ], 40);
}

export function projectBoardSatisfiedProofItems(card: ProjectBoardCard, proofText: string, proof: Record<string, unknown> | undefined, workspacePath?: string): string[] {
  const satisfied: string[] = [];
  if (projectBoardCardRequiresImplementationEvidence(card) && projectBoardHasImplementationEvidence(proof, proofText, workspacePath)) {
    satisfied.push("Implementation evidence recorded.");
  }
  if (card.acceptanceCriteria.length > 0 && projectBoardHasAcceptanceEvidence(proofText)) satisfied.push("Acceptance criteria discussed in proof.");
  if (card.testPlan.unit.length > 0 && projectBoardHasUnitEvidence(proofText, proof)) satisfied.push("Unit proof recorded.");
  if (card.testPlan.integration.length > 0 && projectBoardHasIntegrationEvidence(proofText, proof)) satisfied.push("Integration proof recorded.");
  if (card.testPlan.visual.length > 0 && projectBoardHasVisualEvidence(proofText, proof)) satisfied.push("Visual/browser proof recorded.");
  if (card.testPlan.manual.length > 0 && projectBoardHasManualEvidence(proofText, proof)) satisfied.push("Manual review proof recorded.");
  return satisfied;
}

export function projectBoardMissingProofItems(card: ProjectBoardCard, proofText: string, proof: Record<string, unknown> | undefined, workspacePath?: string): string[] {
  const missing: string[] = [];
  if (!proof) return ["No proof packet recorded."];
  const runtimeBudget = projectBoardRuntimeBudgetFromProof(proof);
  if (runtimeBudget?.exceeded === true) {
    missing.push(projectBoardRuntimeBudgetReason(runtimeBudget));
  }
  const taskActionIntegrityIssues = projectBoardTaskToolActionIntegrityIssues(projectBoardTaskToolActionsFromProofOfWork(proof));
  missing.push(...taskActionIntegrityIssues.map((issue) => `Task action proof integrity issue: ${issue}`));
  const afterRunHook = projectBoardProofObject(proof.afterRunHook);
  if (afterRunHook?.ok === false) missing.push("afterRun hook failed.");
  if (card.acceptanceCriteria.length > 0 && !projectBoardHasAcceptanceEvidence(proofText)) {
    missing.push("Acceptance criteria were not explicitly addressed in the proof packet.");
  }
  if (projectBoardCardRequiresImplementationEvidence(card) && !projectBoardHasImplementationEvidence(proof, proofText, workspacePath)) {
    missing.push("No changed implementation files or meaningful diff evidence recorded.");
  }
  if (card.testPlan.unit.length > 0 && !projectBoardHasUnitEvidence(proofText, proof)) missing.push(`Unit proof missing: ${card.testPlan.unit[0]}`);
  if (card.testPlan.integration.length > 0 && !projectBoardHasIntegrationEvidence(proofText, proof)) {
    missing.push(`Integration proof missing: ${card.testPlan.integration[0]}`);
  }
  if (card.testPlan.visual.length > 0 && !projectBoardHasVisualEvidence(proofText, proof)) missing.push(`Visual proof missing: ${card.testPlan.visual[0]}`);
  if (card.testPlan.manual.length > 0 && !projectBoardHasManualEvidence(proofText, proof)) missing.push(`Manual proof missing: ${card.testPlan.manual[0]}`);
  return missing;
}

function projectBoardCardRequiresImplementationEvidence(
  card: Pick<ProjectBoardCard, "candidateStatus" | "phase" | "sourceKind">,
): boolean {
  if (card.sourceKind === "local_task_import" || card.candidateStatus === "evidence") return false;
  const phase = card.phase?.trim().toLowerCase() ?? "";
  return !/\b(verification|validation|proof|qa)\b/.test(phase);
}

export function projectBoardRuntimeBudgetFromProof(proof: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return projectBoardProofObject(proof?.projectBoardRuntimeBudget ?? proof?.runtimeBudget);
}

export function projectBoardRuntimeBudgetExceeded(proof: Record<string, unknown> | undefined): boolean {
  return projectBoardRuntimeBudgetFromProof(proof)?.exceeded === true;
}

export function projectBoardRuntimeBudgetHasMeaningfulProgress(
  proof: Record<string, unknown> | undefined,
  proofText: string,
  _satisfied: string[],
  workspacePath?: string,
): boolean {
  if (!proof) return false;
  if (projectBoardHasImplementationEvidence(proof, proofText, workspacePath)) return true;
  return false;
}

export function evaluateProjectBoardCardProof(card: ProjectBoardCard, run: OrchestrationRun): ProjectBoardProofReviewDraft {
  const proof = projectBoardProofOfWorkForRun(run.proofOfWork, run, card);
  const proofText = projectBoardProofEvidenceText(run.error, proof);
  const terminalBlockerDetail = projectBoardTerminalBlockerDetail(run.error, proof, proofText);
  const hasDurableTaskCompletion = projectBoardHasTrustworthyTaskCompletion(proof);
  if (run.status !== "completed" && !hasDurableTaskCompletion) {
    const terminalBlocker = Boolean(terminalBlockerDetail) || run.status === "stalled";
    return {
      status: terminalBlocker ? "terminally_blocked" : "retry_recommended",
      summary: terminalBlocker ? "The latest run appears terminally blocked." : `The latest run ended as ${run.status}; retry or inspect before closing.`,
      satisfied: [],
      missing: [terminalBlockerDetail ? `Terminal blocker: ${terminalBlockerDetail}` : run.error || `Run status is ${run.status}.`],
      evidenceQuality: "weak",
      recommendedAction: terminalBlocker ? "block" : "retry",
    };
  }
  if (terminalBlockerDetail) {
    return {
      status: "terminally_blocked",
      summary: "The run finished but reported a blocker that needs user or scope intervention.",
      satisfied: projectBoardSatisfiedProofItems(card, proofText, proof, run.workspacePath),
      missing: [`Terminal blocker: ${terminalBlockerDetail}`],
      evidenceQuality: "weak",
      recommendedAction: "block",
    };
  }

  const satisfied = projectBoardSatisfiedProofItems(card, proofText, proof, run.workspacePath);
  const missing = projectBoardMissingProofItems(card, proofText, proof, run.workspacePath);
  const explicitFollowUps = normalizeRunFollowUps(proof?.followUps);
  if (explicitFollowUps.length > 0) missing.push(`${explicitFollowUps.length} run follow-up${explicitFollowUps.length === 1 ? "" : "s"} proposed before closure.`);
  if (missing.length > 0) {
    if (
      projectBoardRuntimeBudgetExceeded(proof) &&
      explicitFollowUps.length === 0 &&
      !projectBoardRuntimeBudgetHasMeaningfulProgress(proof, proofText, satisfied, run.workspacePath)
    ) {
      return {
        status: "retry_recommended",
        summary: "The run hit the runtime budget before recording meaningful implementation progress.",
        satisfied,
        missing,
        evidenceQuality: "weak",
        recommendedAction: "retry",
      };
    }
    return {
      status: "needs_follow_up",
      summary: "The run produced evidence, but the board card still needs follow-up before closure.",
      satisfied,
      missing,
      evidenceQuality: satisfied.length > 0 ? "mixed" : "weak",
      recommendedAction: "follow_up",
    };
  }

  const deterministicClose =
    projectBoardProofRequestsDone(proof) ||
    (hasDurableTaskCompletion && card.testPlan.manual.length === 0 && card.testPlan.visual.length === 0);
  return {
    status: deterministicClose ? "done" : "ready_for_review",
    summary: hasDurableTaskCompletion && run.status !== "completed"
      ? `The run ended as ${run.status}, but it recorded durable task_complete proof before the final response failed. The proof packet satisfies the recorded acceptance and proof expectations.`
      : "The proof packet satisfies the recorded acceptance and proof expectations.",
    satisfied,
    missing: [],
    evidenceQuality: "strong",
    recommendedAction: "close",
  };
}

export function projectBoardRuntimeBudgetReviewForApplication(
  review: ProjectBoardCardProofReview,
  proof: Record<string, unknown> | undefined,
  proofText: string,
  workspacePath?: string,
): ProjectBoardCardProofReview {
  if (!projectBoardRuntimeBudgetExceeded(proof)) return review;
  const runtimeBudget = projectBoardRuntimeBudgetFromProof(proof);
  if (!runtimeBudget) return review;
  const reason = projectBoardRuntimeBudgetReason(runtimeBudget);
  if (!projectBoardRuntimeBudgetHasMeaningfulProgress(proof, proofText, review.satisfied, workspacePath)) {
    return {
      ...review,
      status: "retry_recommended",
      summary: "The run hit the runtime budget before recording meaningful implementation progress.",
      satisfied: [],
      missing: normalizeCardTextList([reason, ...review.missing], 30),
      evidenceQuality: "weak",
      recommendedAction: "retry",
    };
  }
  if ((review.status === "done" || review.status === "ready_for_review") && !projectBoardRuntimeBudgetHasDurableCompletion(proof)) {
    return {
      ...review,
      status: "needs_follow_up",
      summary: "The run collected proof but hit the runtime budget before recording durable task completion.",
      missing: normalizeCardTextList([reason, "Durable task_complete action was not recorded before the runtime budget stopped the run.", ...review.missing], 30),
      evidenceQuality: review.evidenceQuality === "strong" ? "mixed" : review.evidenceQuality,
      recommendedAction: "follow_up",
    };
  }
  return review;
}

export function projectBoardProofReviewClosureModelForApplication(
  review: ProjectBoardCardProofReview,
  deterministicMissing: string[],
): ProjectBoardCardProofReview {
  if (review.status !== "done") return review;
  const unresolvedIssues = normalizeCardTextList([...(review.missing ?? []), ...deterministicMissing], 30);
  const evidenceIsStrong = review.evidenceQuality === "strong";
  if (evidenceIsStrong && unresolvedIssues.length === 0) return review;
  const reason = !evidenceIsStrong
    ? "the proof judge did not rate the evidence strong"
    : `${unresolvedIssues.length} proof issue${unresolvedIssues.length === 1 ? " remains" : "s remain"}`;
  return {
    ...review,
    status: "ready_for_review",
    summary: `${review.summary} PM review is required before auto-closure because ${reason}.`,
    missing: unresolvedIssues,
    recommendedAction: review.recommendedAction === "close" ? "close" : review.recommendedAction,
  };
}

export function projectBoardRuntimeBudgetTrustworthyTaskActions(proof: Record<string, unknown> | undefined): ProjectBoardTaskToolAction[] {
  return projectBoardTaskToolActionsFromProofOfWork(proof).filter(
    (action) => projectBoardTaskToolActionIntegrityIssues([action]).length === 0,
  );
}

export function projectBoardRuntimeBudgetHasDurableCompletion(proof: Record<string, unknown> | undefined): boolean {
  return projectBoardRuntimeBudgetTrustworthyTaskActions(proof).some((action) => action.action === "task_complete");
}

export function projectBoardRuntimeBudgetCompletedCriteria(proof: Record<string, unknown> | undefined, satisfied: string[] = [], workspacePath?: string): string[] {
  const handoff = projectBoardProofObject(proof?.handoff);
  const proofText = projectBoardProofEvidenceText(undefined, proof);
  const hasImplementationEvidence = projectBoardHasImplementationEvidence(proof, proofText, workspacePath);
  const taskActions = projectBoardRuntimeBudgetTrustworthyTaskActions(proof);
  return normalizeRuntimeBudgetCriteria(
    [
      ...(hasImplementationEvidence ? ["Implementation evidence recorded.", ...satisfied] : []),
      ...stringsFromProjectBoardUnknownArray(handoff?.completed),
      ...stringsFromProjectBoardUnknownArray(proof?.completed),
      ...projectBoardTaskToolCompleted(taskActions),
    ],
    20,
  );
}

export function projectBoardRuntimeBudgetRemainingCriteria(
  card: ProjectBoardCard,
  proof: Record<string, unknown> | undefined,
  review: Pick<ProjectBoardCardProofReview, "missing">,
): string[] {
  const handoff = projectBoardProofObject(proof?.handoff);
  const taskActions = projectBoardRuntimeBudgetTrustworthyTaskActions(proof);
  const remaining = normalizeRuntimeBudgetCriteria(
    [
      ...stringsFromProjectBoardUnknownArray(handoff?.remaining),
      ...stringsFromProjectBoardUnknownArray(proof?.remaining),
      ...stringsFromProjectBoardUnknownArray(proof?.nextSteps),
      ...projectBoardTaskToolRemaining(taskActions),
      ...review.missing,
    ],
    30,
  );
  return remaining.length > 0 ? remaining : card.acceptanceCriteria;
}

export function projectBoardRuntimeBudgetPartialProofSummary(
  run: Pick<OrchestrationRun, "error">,
  proof: Record<string, unknown> | undefined,
  review: Pick<ProjectBoardCardProofReview, "summary">,
): string {
  const handoff = projectBoardProofObject(proof?.handoff);
  const explicitSummary =
    (typeof handoff?.summary === "string" && handoff.summary.trim()) ||
    (typeof proof?.summary === "string" && proof.summary.trim()) ||
    (typeof proof?.lastAssistantText === "string" && proof.lastAssistantText.trim()) ||
    review.summary ||
    run.error ||
    "Runtime budget stopped the card after partial progress.";
  return explicitSummary.slice(0, 4000);
}

export function projectBoardRuntimeBudgetSplitOutcomeForReview(
  card: ProjectBoardCard,
  run: OrchestrationRun,
  review: ProjectBoardCardProofReview,
  childCardIds: string[],
  now: string,
): ProjectBoardCardSplitOutcome | undefined {
  const proof = run.proofOfWork;
  const proofText = projectBoardProofEvidenceText(run.error, proof);
  const runtimeBudget = projectBoardRuntimeBudgetFromProof(proof);
  if (!runtimeBudget || runtimeBudget.exceeded !== true) return undefined;
  if (!projectBoardRuntimeBudgetHasMeaningfulProgress(proof, proofText, review.satisfied, run.workspacePath)) return undefined;
  const reason = projectBoardRuntimeBudgetReason(runtimeBudget);
  return {
    status: "proposed",
    source: "runtime_budget",
    sourceRunId: run.id,
    reason,
    partialProofSummary: projectBoardRuntimeBudgetPartialProofSummary(run, proof, review),
    completedCriteria: projectBoardRuntimeBudgetCompletedCriteria(proof, review.satisfied, run.workspacePath),
    remainingCriteria: projectBoardRuntimeBudgetRemainingCriteria(card, proof, review),
    childCardIds,
    maxRuntimeMs: typeof runtimeBudget.maxRuntimeMs === "number" && Number.isFinite(runtimeBudget.maxRuntimeMs) ? runtimeBudget.maxRuntimeMs : undefined,
    elapsedMs: typeof runtimeBudget.elapsedMs === "number" && Number.isFinite(runtimeBudget.elapsedMs) ? runtimeBudget.elapsedMs : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function projectBoardRuntimeBudgetFollowUpDescription(
  parentTitle: string,
  review: ProjectBoardProofReviewDraft,
  completedCriteria: string[],
  remainingCriteria: string[],
): string {
  const sections = [`Runtime-budget split follow-up derived from ${parentTitle}.`];
  if (review.summary.trim()) sections.push(review.summary.trim());
  if (completedCriteria.length) sections.push(["Completed before timeout:", ...completedCriteria.map((item) => `- ${item}`)].join("\n"));
  if (remainingCriteria.length) sections.push(["Remaining scope:", ...remainingCriteria.map((item) => `- ${item}`)].join("\n"));
  return sections.join("\n\n").slice(0, 4000);
}

export function projectBoardRuntimeBudgetFollowUpClarificationQuestion(parentTitle: string): string {
  return `Confirm this runtime-budget follow-up accurately captures the remaining scope for "${parentTitle}" before ticketizing it.`;
}

export function mergeProjectBoardTaskToolActionsForProof(actions: ProjectBoardTaskToolAction[]): ProjectBoardTaskToolAction[] {
  const byId = new Map<string, ProjectBoardTaskToolAction>();
  for (const action of actions) {
    const current = byId.get(action.actionId);
    if (!current) {
      byId.set(action.actionId, action);
      continue;
    }
    byId.set(action.actionId, {
      ...current,
      ...action,
      metadata: {
        ...current.metadata,
        ...action.metadata,
      },
    } as ProjectBoardTaskToolAction);
  }
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.actionId.localeCompare(right.actionId));
}

export function projectBoardRuntimeBudgetReason(runtimeBudget: Record<string, unknown>): string {
  const nextAction = typeof runtimeBudget.recommendedNextAction === "string" && runtimeBudget.recommendedNextAction.trim()
    ? runtimeBudget.recommendedNextAction.trim()
    : "Review partial workspace changes and retry, split, or create a narrower follow-up card.";
  const maxRuntime = typeof runtimeBudget.maxRuntimeMs === "number" && Number.isFinite(runtimeBudget.maxRuntimeMs)
    ? ` after ${Math.round(runtimeBudget.maxRuntimeMs / 1000)}s`
    : "";
  return `Runtime budget exceeded${maxRuntime}: ${nextAction}`;
}

export function normalizeRuntimeBudgetCriteria(items: string[], limit = 20): string[] {
  const normalized: string[] = [];
  const keys: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = runtimeBudgetCriteriaKey(trimmed);
    if (!key) continue;
    const duplicate = keys.some((existingKey) => existingKey === key || runtimeBudgetCriteriaSubsumes(existingKey, key));
    if (duplicate) continue;
    normalized.push(trimmed);
    keys.push(key);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function runtimeBudgetCriteriaKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[-*>\s]+/, "")
    .replace(/\bruntime budget exceeded after \d+s?:\s*/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function runtimeBudgetCriteriaSubsumes(left: string, right: string): boolean {
  if (left.length < 36 || right.length < 36) return false;
  return left.includes(right) || right.includes(left);
}

export function orchestrationTaskHasActiveBlocker(task: OrchestrationTask, allTasks: OrchestrationTask[]): boolean {
  if (task.blockedBy.length === 0) return false;
  const tasksById = new Map(allTasks.map((candidate) => [candidate.id, candidate]));
  const tasksByIdentifier = new Map(allTasks.map((candidate) => [candidate.identifier, candidate]));
  const acceptableStates = new Set(["review", "needs_review", "done", "canceled", "duplicate"]);
  return task.blockedBy.some((blockerRef) => {
    const blocker = tasksById.get(blockerRef) ?? tasksByIdentifier.get(blockerRef);
    if (!blocker) return true;
    return !acceptableStates.has(normalizeTaskState(blocker.state));
  });
}

export interface ProjectBoardRunFollowUpCandidate {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  testPlan: ProjectBoardCardTestPlan;
}

export interface ProjectBoardRunFollowUpInsertOptions {
  blockByParent?: boolean;
  labels?: string[];
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  testPlan?: ProjectBoardCardTestPlan;
  clarificationQuestions?: string[];
  sourceIdSuffix?: string;
}

export function normalizeRunFollowUps(value: unknown): ProjectBoardRunFollowUpCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): ProjectBoardRunFollowUpCandidate | undefined => {
      if (typeof item === "string") {
        const title = item.trim();
        if (!title) return undefined;
        return {
          title,
          description: "Follow-up proposed by a completed project board run.",
          acceptanceCriteria: [`Resolve follow-up: ${title}`],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Review follow-up scope before ticketization."] },
        };
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : `Run follow-up ${index + 1}`;
      const description = typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : "Follow-up proposed by a completed project board run.";
      const acceptanceCriteria = Array.isArray(record.acceptanceCriteria)
        ? normalizeCardTextList(record.acceptanceCriteria.map((entry) => String(entry)), 30)
        : [`Resolve follow-up: ${title}`];
      const testPlan =
        record.testPlan && typeof record.testPlan === "object" && !Array.isArray(record.testPlan)
          ? normalizeUnknownProjectBoardTestPlan(record.testPlan as Record<string, unknown>)
          : { unit: [], integration: [], visual: [], manual: ["Review follow-up scope before ticketization."] };
      return { title, description, acceptanceCriteria, testPlan };
    })
    .filter((item): item is ProjectBoardRunFollowUpCandidate => Boolean(item))
    .slice(0, 20);
}

export function projectBoardProofFollowUpOptionsFromSuggestion(
  suggestion: ProjectBoardProofFollowUpSuggestion | undefined,
): ProjectBoardRunFollowUpInsertOptions | undefined {
  const normalized = normalizeProjectBoardProofFollowUpSuggestion(suggestion);
  if (!normalized) return undefined;
  return {
    ...(normalized.title ? { title: normalized.title } : {}),
    ...(normalized.description ? { description: normalized.description } : {}),
    ...(normalized.acceptanceCriteria?.length ? { acceptanceCriteria: normalized.acceptanceCriteria } : {}),
    ...(normalized.testPlan ? { testPlan: normalized.testPlan } : {}),
    ...(normalized.clarificationQuestions?.length ? { clarificationQuestions: normalized.clarificationQuestions } : {}),
    labels: ["pi-suggested-follow-up", ...(normalized.labels ?? [])],
  };
}

export function projectBoardCardProofCount(card: Pick<ProjectBoardCard, "testPlan">): number {
  return card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length;
}

export function projectBoardProofOfWorkForRun(
  proof: Record<string, unknown> | undefined,
  run: Pick<OrchestrationRun, "id" | "taskId">,
  card?: Pick<ProjectBoardCard, "id">,
): Record<string, unknown> | undefined {
  if (!proof) return undefined;
  const taskActions = projectBoardTaskToolActionsForScope(projectBoardTaskToolActionsFromProofOfWork(proof), {
    runId: run.id,
    taskId: run.taskId,
    cardId: card?.id,
  });
  if (taskActions.length === 0) {
    const rest = { ...proof };
    delete rest.taskToolActions;
    delete rest.taskActions;
    delete rest.modelTaskActions;
    delete rest.taskActionDiagnostics;
    return rest;
  }
  return {
    ...proof,
    taskToolActions: taskActions,
    taskActionDiagnostics: projectBoardTaskToolActionDiagnostics(taskActions),
  };
}

export function projectBoardHasTrustworthyTaskCompletion(proof: Record<string, unknown> | undefined): boolean {
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proof);
  if (!taskActions.some((action) => action.action === "task_complete")) return false;
  return projectBoardTaskToolActionIntegrityIssues(taskActions).length === 0;
}

export function projectBoardRunHasReviewableProof(run: OrchestrationRun, card: ProjectBoardCard): boolean {
  const proof = projectBoardProofOfWorkForRun(run.proofOfWork, run, card);
  if (!proof) return false;
  if (projectBoardHasTrustworthyTaskCompletion(proof)) return true;
  const proofText = projectBoardProofEvidenceText(run.error, proof);
  return Boolean(proofText.trim() || projectBoardChangedProofPaths(proof, run.workspacePath).length > 0);
}

export function projectBoardTerminalBlockerDetail(
  error: string | undefined,
  proof: Record<string, unknown> | undefined,
  proofText: string,
): string | undefined {
  const directValues = [
    proof?.terminalBlocker,
    proof?.blocker,
    proof?.blockedReason,
    proof?.blockerQuestion,
    proof?.needsUserDecision,
    proof?.requiresUserDecision,
  ];
  for (const value of directValues) {
    for (const candidate of projectBoardProofTextCandidates(value)) {
      const detail = projectBoardTerminalBlockerLine(candidate);
      if (detail) return detail;
    }
  }

  const narrativeValues = [proof?.lastAssistantText, proof?.testOutput, proof?.focusLoop, proof?.projectBoardReview];
  for (const value of narrativeValues) {
    for (const candidate of projectBoardProofTextCandidates(value)) {
      const detail = projectBoardTerminalBlockerLine(candidate);
      if (detail) return detail;
    }
  }
  for (const candidate of projectBoardProofTextCandidates(error)) {
    const detail = projectBoardTerminalBlockerLine(candidate);
    if (detail) return detail;
  }
  return projectBoardTerminalBlockerLine(proofText);
}

function projectBoardProofTextCandidates(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return [JSON.stringify(value)];
}

function projectBoardTerminalBlockerLine(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  const fragments = [
    ...text.split(/\r?\n/),
    ...normalized.split(/(?<=[.!?])\s+/),
  ]
    .map((item) => item.replace(/^[-*>\s]+/, "").trim())
    .filter(Boolean);
  const match = fragments.find((fragment) => projectBoardTerminalBlockerPattern().test(fragment)) ??
    (projectBoardTerminalBlockerPattern().test(normalized) ? normalized : undefined);
  return match ? match.slice(0, 700) : undefined;
}

function projectBoardTerminalBlockerPattern(): RegExp {
  return /\b(terminal blocker|unrecoverable|cannot continue|can't continue|needs? (an? )?(api key|credential|password|access|decision|user|human|clarification|permission)|missing (api key|credential|password|access|secret)|requires? (a )?(user|human|product|scope) decision|blocked (on|by) (missing )?(api key|credential|password|access|secret|user decision|human decision|product decision)|waiting on (user|human|credential|access|api key|product decision|scope decision))\b/i;
}

const DEFAULT_PROJECT_BOARD_MAX_PASSES_PER_CARD = 6;
const DEFAULT_PROJECT_BOARD_MAX_RUNTIME_MS_PER_CARD = 1_200_000;

export function projectBoardCardClosePolicyDescription(budgetPolicy?: Record<string, unknown>): string {
  const maxPasses = readProjectBoardPositiveInteger(budgetPolicy?.maxPassesPerCard) ?? DEFAULT_PROJECT_BOARD_MAX_PASSES_PER_CARD;
  const maxRuntimeMs =
    readProjectBoardPositiveInteger(budgetPolicy?.maxRuntimeMsPerCard) ??
    readProjectBoardPositiveMinutesAsMs(budgetPolicy?.maxRuntimeMinutesPerCard) ??
    DEFAULT_PROJECT_BOARD_MAX_RUNTIME_MS_PER_CARD;
  return [
    "Execution close policy:",
    `- Aim for the smallest sufficient proof for this card; do not broaden scope beyond the card's acceptance criteria.`,
    `- Ambient will stop or review this card after ${maxPasses} focus pass${maxPasses === 1 ? "" : "es"} or about ${formatProjectBoardRuntimeDuration(maxRuntimeMs)} of worker runtime.`,
    "- Make task_heartbeat the first observable board action for the run, before reading/editing files or running shell commands; include the immediate plan and proof target.",
    "- Call task_heartbeat after each meaningful milestone or before any long verification loop, so the board shows real progress.",
    "- Call task_report_proof as soon as changed files, commands, screenshots, or manual checks are available; do not wait until every optional polish item is done.",
    "- If the proof satisfies the card, call task_complete immediately. If the remaining work no longer fits this card, call task_create_followup or task_report_handoff instead of continuing silently.",
    "- Do not end the run with only task_show and/or task_heartbeat; before the final assistant response, report proof, completion, a blocker, a follow-up, or a handoff through the task-action protocol.",
  ].join("\n");
}

export function splitProjectBoardCardDescription(card: ProjectBoardCard, criterion: string): string {
  return [card.description.trim(), `Split from: ${card.title}`, `Scope: ${criterion}`].filter(Boolean).join("\n\n");
}

export function projectBoardCardTaskDescription(
  card: ProjectBoardCard,
  budgetPolicy?: Record<string, unknown>,
  dependencyExecutionContext?: ProjectBoardCardDependencyExecutionContext,
): string {
  const executionSessionPolicy = normalizeProjectBoardCardExecutionSessionPolicy(card.executionSessionPolicy);
  const sections = [card.description.trim()];
  sections.push(
    [
      "Execution session policy:",
      `- ${executionSessionPolicy === "reuse_card_session" ? "Reuse this board card's canonical Pi session across retries and focus passes." : "Start from a fresh Pi context for each prepared run of this card."}`,
      "- Keep stable project charter, card scope, dependencies, and proof expectations before variable run notes so provider KV cache reuse stays high.",
    ].join("\n"),
  );
  sections.push(projectBoardCardClosePolicyDescription(budgetPolicy));
  const uxMockGateSection = projectBoardUxMockGateTaskDescriptionSection(card);
  if (uxMockGateSection) sections.push(uxMockGateSection);
  if (card.acceptanceCriteria.length) {
    sections.push(["Acceptance criteria:", ...card.acceptanceCriteria.map((item) => `- ${item}`)].join("\n"));
  }
  if (card.blockedBy.length) {
    sections.push(["Dependencies / blockers:", ...card.blockedBy.map((item) => `- ${item}`)].join("\n"));
  }
  const dependencyContextSection = renderProjectBoardCardDependencyExecutionContext(dependencyExecutionContext);
  if (dependencyContextSection) sections.push(dependencyContextSection);
  const activeRunFeedback = normalizeProjectBoardCardRunFeedback(card.runFeedback).slice(-8);
  if (activeRunFeedback.length) {
    sections.push(
      [
        "Next-run feedback / additive PM instructions:",
        "- Treat these as additive instructions for this run. Do not rewrite the approved card scope unless the feedback explicitly says to reopen or split the card.",
        ...activeRunFeedback.map((item) => {
          const source =
            item.source === "decision_impact"
              ? "decision impact"
              : item.source === "proof_review"
                ? "proof review"
                : item.source === "source_impact"
                  ? "source impact"
                  : "manual";
          const decision = item.decisionQuestion ? ` (${item.decisionQuestion}${item.decisionAnswer ? ` -> ${item.decisionAnswer}` : ""})` : "";
          return `- ${source}${decision}: ${item.feedback}`;
        }),
      ].join("\n"),
    );
  }
  const testLines = [
    ...card.testPlan.unit.map((item) => `- Unit: ${item}`),
    ...card.testPlan.integration.map((item) => `- Integration: ${item}`),
    ...card.testPlan.visual.map((item) => `- Visual: ${item}`),
    ...card.testPlan.manual.map((item) => `- Manual: ${item}`),
  ];
  if (testLines.length) sections.push(["Proof expectations:", ...testLines].join("\n"));
  if (card.testPlan.visual.length) {
    sections.push(
      [
        "Visual proof artifact requirements:",
        "- Use browser_nav to open the local page and browser_screenshot to capture the viewport when browser UI proof matters.",
        "- For interactive pages, games, canvas apps, shortcuts, or keyboard controls, use browser_keypress for real browser input before taking post-interaction proof.",
        "- Ambient collects screenshots from .ambient-codex/browser/screenshots in the project or prepared workspace.",
        "- Do not mark visual proof complete from narrative text alone; capture a real screenshot or report a terminal blocker if browser_screenshot returns empty output, the viewport is 0x0, or browser tooling is unavailable.",
      ].join("\n"),
    );
  }
  return sections.filter(Boolean).join("\n\n");
}

function projectBoardUxMockGateTaskDescriptionSection(card: ProjectBoardCard): string | undefined {
  if (!projectBoardCardIsUxMockGate(card)) return undefined;
  return [
    "UX mock approval artifact requirements:",
    "- Produce or update one self-contained HTML mock/spec file in the workspace so Ambient can preview it directly.",
    "- Do not rely on remote assets, external CDNs, or build-only state; inline the CSS and any small demo data needed for review.",
    "- Show the intended desktop layout and narrow/mobile viewport treatment for the primary user-facing flow.",
    "- Include visible review notes in the artifact for interaction affordances, important states, and user approval criteria.",
    "- Use browser_nav and browser_screenshot against the local HTML file for desktop and narrow viewport proof when browser tooling is available.",
    "- End with a concise handoff that names the HTML file path and whether the mock is ready for user approval or needs revision.",
  ].join("\n");
}

export function renderProjectBoardCardDependencyExecutionContext(context?: ProjectBoardCardDependencyExecutionContext): string {
  if (!context || (context.available.length === 0 && context.pending.length === 0)) return "";
  const lines = [
    "Dependency execution context:",
    "- Treat available dependency outputs as current board state even if this task workspace or the owning project root does not contain those files yet.",
    "- Ambient imports material files from available dependencies into the prepared run workspace under .ambient/dependency-artifacts/<dependency-key>/files when a run is prepared or started.",
    "- Prefer imported dependency artifact bundles for implementation and verification. Use read-only dependency workspaces only for bounded inspection or missing-artifact diagnosis.",
    "- Do not infer that an available dependency is incomplete only because its branch has not been merged into this workspace.",
  ];
  if (context.available.length) {
    lines.push("Available dependency outputs:");
    for (const item of context.available.slice(0, 8)) {
      const identity = item.taskIdentifier ? `${item.taskIdentifier}: ${item.title}` : item.title;
      const status = [
        item.cardStatus ? `card ${item.cardStatus}` : "",
        item.taskState ? `task ${item.taskState}` : "",
        item.latestRunStatus ? `latest run ${item.latestRunStatus}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`- ${identity}${status ? ` (${status})` : ""}; blocker ref: ${item.ref}`);
      if (item.latestRunId) lines.push(`  - Dependency run: ${item.latestRunId}`);
      if (item.workspacePath) lines.push(`  - Read-only fallback dependency workspace: ${item.workspacePath}`);
      if (item.branchName) lines.push(`  - Dependency branch: ${item.branchName}`);
      if (item.changedFiles.length) lines.push(`  - Declared import files: ${item.changedFiles.slice(0, 8).join(", ")}`);
      if (item.commands.length) lines.push(`  - Proof commands: ${item.commands.slice(0, 5).join(" | ")}`);
      if (item.manualChecks.length) lines.push(`  - Manual checks: ${item.manualChecks.slice(0, 4).join(" | ")}`);
      if (item.completed.length) lines.push(`  - Completed items: ${item.completed.slice(0, 5).join(" | ")}`);
      if (item.proofSummary) lines.push(`  - Proof summary: ${item.proofSummary}`);
    }
  }
  if (context.pending.length) {
    lines.push("Still-blocking or unresolved dependencies:");
    lines.push(...context.pending.slice(0, 8).map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

function readProjectBoardPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function readProjectBoardPositiveMinutesAsMs(value: unknown): number | undefined {
  const minutes = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())
      ? Number(value.trim())
      : undefined;
  return minutes && minutes > 0 ? Math.max(1, Math.round(minutes * 60 * 1000)) : undefined;
}

function formatProjectBoardRuntimeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "the configured runtime budget";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
}

const projectBoardEventKinds = new Set<ProjectBoardEventKind>([
  "board_created",
  "board_revision_started",
  "status_changed",
  "sources_refreshed",
  "board_synthesized",
  "synthesis_proposal_created",
  "synthesis_proposal_answered",
  "synthesis_proposal_card_reviewed",
  "synthesis_proposal_applied",
  "source_updated",
  "question_answered",
  "kickoff_defaults_suggested",
  "charter_finalized",
  "charter_summary_refreshed",
  "plan_promoted",
  "card_updated",
  "candidate_status_changed",
  "card_split",
  "card_ticketized",
  "card_execution_session_assigned",
  "card_run_prepared",
  "card_run_started",
  "card_run_progress",
  "card_run_completed",
  "card_run_failed",
  "card_run_blocked",
  "card_run_canceled",
  "card_run_stalled",
  "card_run_handoff_created",
  "card_claimed",
  "card_heartbeat",
  "card_claim_released",
  "card_claim_expired",
  "execution_readiness_blocked",
  "workflow_created",
  "workflow_impact_resolved",
  "workflow_repaired",
  "workflow_settings_updated",
  "workflow_raw_updated",
  "ready_tasks_created",
  "run_follow_up_created",
  "card_proof_reviewed",
  "card_proof_review_ignored",
  "manual_card_created",
  "local_task_attached",
  "local_task_imported_as_evidence",
  "deliverable_integration_resolved",
]);

const projectBoardEventKindByArtifactType: Partial<Record<BoardEventArtifact["type"], ProjectBoardEventKind>> = {
  "board.created": "board_created",
  "board.status_changed": "status_changed",
  "board.synthesized": "board_synthesized",
  "board.ready_tasks_created": "ready_tasks_created",
  "charter.revision_started": "board_revision_started",
  "charter.question_answered": "question_answered",
  "charter.kickoff_defaults_suggested": "kickoff_defaults_suggested",
  "charter.applied": "charter_finalized",
  "charter.summary_refreshed": "charter_summary_refreshed",
  "sources.refreshed": "sources_refreshed",
  "source.classified": "source_updated",
  "source.changed": "source_updated",
  "plan.promoted": "plan_promoted",
  "proposal.completed": "synthesis_proposal_created",
  "proposal.question_answered": "synthesis_proposal_answered",
  "proposal.card_reviewed": "synthesis_proposal_card_reviewed",
  "proposal.applied": "synthesis_proposal_applied",
  "proposal.failed": "synthesis_proposal_created",
  "card.created": "manual_card_created",
  "card.updated": "card_updated",
  "card.status_changed": "candidate_status_changed",
  "card.split": "card_split",
  "card.ticketized": "card_ticketized",
  "card.execution_session_assigned": "card_execution_session_assigned",
  "run.prepared": "card_run_prepared",
  "run.started": "card_run_started",
  "run.progress": "card_run_progress",
  "run.completed": "card_run_completed",
  "run.failed": "card_run_failed",
  "run.blocked": "card_run_blocked",
  "run.canceled": "card_run_canceled",
  "run.stalled": "card_run_stalled",
  "run.handoff_created": "card_run_handoff_created",
  "card.claimed": "card_claimed",
  "card.heartbeat": "card_heartbeat",
  "card.claim_released": "card_claim_released",
  "card.claim_expired": "card_claim_expired",
  "board.execution_readiness_blocked": "execution_readiness_blocked",
  "board.workflow_created": "workflow_created",
  "board.workflow_impact_resolved": "workflow_impact_resolved",
  "board.workflow_repaired": "workflow_repaired",
  "board.workflow_settings_updated": "workflow_settings_updated",
  "board.workflow_raw_updated": "workflow_raw_updated",
  "card.proof_reviewed": "card_proof_reviewed",
  "card.followup_created": "run_follow_up_created",
  "local_task.attached": "local_task_attached",
  "local_task.imported_as_evidence": "local_task_imported_as_evidence",
  "run.deliverable_integration_resolved": "deliverable_integration_resolved",
};

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

export interface ProjectBoardEventStoreRow {
  id: string;
  board_id: string;
  event_kind: ProjectBoardEventKind;
  title: string;
  summary: string;
  entity_kind: string | null;
  entity_id: string | null;
  metadata_json: string;
  created_at: string;
}

export interface ProjectBoardCharterStoreRow {
  id: string;
  board_id: string;
  version: number;
  status: ProjectBoardCharterStatus;
  goal: string;
  current_state: string;
  target_user: string;
  non_goals_json: string;
  quality_bar: string;
  test_policy_json: string;
  decision_policy_json: string;
  dependency_policy_json: string;
  budget_policy_json: string;
  source_policy_json: string;
  markdown: string;
  project_summary_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectBoardQuestionStoreRow {
  id: string;
  board_id: string;
  question_order: number;
  question: string;
  required: number;
  answer: string | null;
  answered_at: string | null;
  suggested_answer: string | null;
  suggestion_rationale: string | null;
  suggestion_confidence: string | null;
  suggestion_source_ids_json: string | null;
  suggestion_context_fingerprint: string | null;
  suggestion_generated_at: string | null;
  suggestion_model: string | null;
  suggestion_provider_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectBoardSynthesisProposalStoreRow {
  id: string;
  board_id: string;
  status: ProjectBoardSynthesisProposalStatus;
  summary: string;
  goal: string;
  current_state: string;
  target_user: string;
  quality_bar: string;
  assumptions_json: string;
  questions_json: string;
  answers_json: string;
  source_notes_json: string;
  cards_json: string;
  review_report_json: string | null;
  model: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

export interface ProjectBoardSynthesisRunStoreRow {
  id: string;
  board_id: string;
  proposal_id: string | null;
  retry_of_run_id: string | null;
  status: ProjectBoardSynthesisRunStatus;
  stage: ProjectBoardSynthesisRunStage;
  model: string | null;
  source_count: number;
  included_source_count: number;
  source_char_count: number;
  prompt_char_count: number | null;
  response_char_count: number | null;
  card_count: number | null;
  question_count: number | null;
  warning_count: number;
  error: string | null;
  events_json: string;
  progressive_records_json: string | null;
  planning_snapshots_json: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type ProjectBoardProofFollowUpSuggestionNormalizer = (value: unknown) => ProjectBoardProofFollowUpSuggestion | undefined;

export interface ProjectBoardClarificationDecisionFallback {
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  description?: string;
  acceptanceCriteria?: string[];
  createdAt?: string;
  updatedAt?: string;
}

const PROJECT_BOARD_CARD_TOUCHED_FIELDS = new Set<ProjectBoardCardTouchedField>([
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
  "clarificationSuggestions",
  "clarificationAnswers",
  "clarificationDecisions",
  "uiMockMetadata",
]);

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
const PROJECT_BOARD_CARD_STATUS_VALUES = new Set<ProjectBoardCardStatus>(["draft", "ready", "in_progress", "review", "done", "blocked", "archived"]);
const PROJECT_BOARD_CARD_CANDIDATE_STATUS_VALUES = new Set<ProjectBoardCardCandidateStatus>([
  "needs_clarification",
  "ready_to_create",
  "evidence",
  "duplicate",
  "rejected",
]);
const PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARD_REVIEW_STATUSES = new Set<ProjectBoardSynthesisProposalCardReviewStatus>([
  "pending",
  "accepted",
  "deferred",
  "rejected",
  "merged",
]);

export function projectBoardSynthesisProposalCardReviewStatus(value: unknown): ProjectBoardSynthesisProposalCardReviewStatus | undefined {
  return typeof value === "string" && PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARD_REVIEW_STATUSES.has(value as ProjectBoardSynthesisProposalCardReviewStatus)
    ? (value as ProjectBoardSynthesisProposalCardReviewStatus)
    : undefined;
}

const PROJECT_BOARD_COPYABLE_SESSION_RUN_STATUSES = new Set(["completed", "failed", "canceled", "stalled"]);

export function projectBoardRunStatusCanCopySession(status: string): boolean {
  return PROJECT_BOARD_COPYABLE_SESSION_RUN_STATUSES.has(status);
}

const MAX_PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARDS = 120;
const PROJECT_BOARD_CARD_SOURCE_KIND_VALUES = new Set<ProjectBoardCardSourceKind>([
  "planner_plan",
  "manual",
  "run_follow_up",
  "local_task_import",
  "board_synthesis",
]);
const PROJECT_BOARD_CARD_RUN_FEEDBACK_SOURCES = new Set<ProjectBoardCardRunFeedbackSource>([
  "manual",
  "decision_impact",
  "proof_review",
  "source_impact",
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

export function normalizeProjectBoardClarificationQuestions(items: string[], limit = 8): string[] {
  return dedupeProjectBoardQuestions(items, limit).map((item) => item.slice(0, 500));
}

export function normalizeProjectBoardCardTestPlan(testPlan: ProjectBoardCardTestPlan): ProjectBoardCardTestPlan {
  return {
    unit: normalizeCardTextList(testPlan.unit),
    integration: normalizeCardTextList(testPlan.integration),
    visual: normalizeCardTextList(testPlan.visual),
    manual: normalizeCardTextList(testPlan.manual),
  };
}

export function normalizeUnknownProjectBoardTestPlan(testPlan: Record<string, unknown>): ProjectBoardCardTestPlan {
  return normalizeProjectBoardCardTestPlan({
    unit: Array.isArray(testPlan.unit) ? testPlan.unit.map((entry) => String(entry)) : [],
    integration: Array.isArray(testPlan.integration) ? testPlan.integration.map((entry) => String(entry)) : [],
    visual: Array.isArray(testPlan.visual) ? testPlan.visual.map((entry) => String(entry)) : [],
    manual: Array.isArray(testPlan.manual) ? testPlan.manual.map((entry) => String(entry)) : [],
  });
}

export function normalizeCardTextList(items: string[], limit = 20): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

export function normalizeTaskLabels(labels: string[]): string[] {
  return [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))];
}

export function normalizeTaskReferences(refs: string[]): string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].slice(0, 50);
}

export function normalizeProjectBoardUiMockRole(value: unknown): ProjectBoardUiMockRole | undefined {
  return value === "mock_gate" || value === "gated_implementation" ? value : undefined;
}

export function projectBoardCardIsUxMockGate(
  card: Pick<ProjectBoardSynthesisCardInput, "sourceId" | "title" | "labels" | "description"> & { uiMockRole?: ProjectBoardUiMockRole },
): boolean {
  if (card.uiMockRole === "mock_gate") return true;
  const haystack = `${card.sourceId}\n${card.title}\n${card.description}`.toLowerCase();
  return (
    card.sourceId === "synthesis:ux-mock-approval" ||
    card.labels.some((label) => label.toLowerCase() === "ux-mock-approval") ||
    /\b(ux|ui|user interface)\b.{0,40}\b(mock|prototype|wireframe|approval|review)\b/.test(haystack) ||
    /\b(mock|prototype|wireframe)\b.{0,40}\b(ux|ui|user interface|approval|review)\b/.test(haystack)
  );
}

export function projectBoardUxMockGateSatisfied(card: {
  status: ProjectBoardCardStatus;
  candidateStatus: ProjectBoardCardCandidateStatus;
}): boolean {
  return card.status === "done" || card.candidateStatus === "evidence";
}

export function projectBoardUiMockRoleForSynthesisCard(card: ProjectBoardSynthesisCardInput): ProjectBoardUiMockRole | undefined {
  return normalizeProjectBoardUiMockRole(card.uiMockRole) ?? (projectBoardCardIsUxMockGate(card) ? "mock_gate" : undefined);
}

export function projectBoardRequiresUiMockApprovalForSynthesisCard(card: ProjectBoardSynthesisCardInput): boolean {
  if (typeof card.requiresUiMockApproval === "boolean") return card.requiresUiMockApproval;
  return Boolean(projectBoardUiMockRoleForSynthesisCard(card) === "gated_implementation" || card.blockedBy.includes("synthesis:ux-mock-approval"));
}

export function projectBoardCardMatchesRef(card: ProjectBoardCard, ref: string): boolean {
  const normalized = ref.trim();
  if (!normalized) return false;
  return [card.id, card.sourceId, card.orchestrationTaskId ?? "", `card:${card.id}`, `project-board-card:${card.id}`]
    .filter(Boolean)
    .includes(normalized);
}

export function projectBoardCardBlockedByOpenUxMockGate(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): boolean {
  return Boolean(projectBoardOpenUxMockGateBlocker(card, boardCards) || projectBoardCardMissingRequiredUxMockGate(card, boardCards));
}

export function projectBoardOpenUxMockGateBlocker(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): ProjectBoardCard | undefined {
  if (projectBoardCardIsUxMockGate(card)) return undefined;
  const blockers = card.blockedBy
    .map((ref) => boardCards.find((candidate) => projectBoardCardMatchesRef(candidate, ref)))
    .filter((candidate): candidate is ProjectBoardCard => Boolean(candidate));
  return blockers.find((candidate) => projectBoardCardIsUxMockGate(candidate) && !projectBoardUxMockGateSatisfied(candidate));
}

export function projectBoardCardMissingRequiredUxMockGate(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): boolean {
  if (projectBoardCardIsUxMockGate(card)) return false;
  if (card.uiMockRole !== "gated_implementation" && !card.requiresUiMockApproval) return false;
  const blockers = card.blockedBy
    .map((ref) => boardCards.find((candidate) => projectBoardCardMatchesRef(candidate, ref)))
    .filter((candidate): candidate is ProjectBoardCard => Boolean(candidate));
  return !blockers.some((candidate) => projectBoardCardIsUxMockGate(candidate) && projectBoardUxMockGateSatisfied(candidate));
}

export function normalizeProjectBoardCardExecutionSessionPolicy(
  policy: string | null | undefined,
): ProjectBoardCardExecutionSessionPolicy {
  return policy === "fresh_context" ? "fresh_context" : "reuse_card_session";
}

export function normalizeProjectBoardClarificationSuggestions(
  value: ProjectBoardCardClarificationSuggestion[] | undefined,
  fallback: ProjectBoardCardClarificationSuggestion[] = [],
): ProjectBoardCardClarificationSuggestion[] {
  const normalized: ProjectBoardCardClarificationSuggestion[] = [];
  for (const suggestion of value ?? fallback) {
    if (!suggestion) continue;
    const question = suggestion.question?.trim().slice(0, 500) ?? "";
    const suggestedAnswer = suggestion.suggestedAnswer?.trim().slice(0, 1500) ?? "";
    const rationale = suggestion.rationale?.trim().slice(0, 1000) ?? "";
    if (!question || !suggestedAnswer) continue;
    const questionKind =
      suggestion.questionKind === "expert_default" || suggestion.questionKind === "user_preference" || suggestion.questionKind === "external_constraint"
        ? suggestion.questionKind
        : "user_preference";
    const normalizedSuggestion: ProjectBoardCardClarificationSuggestion = {
      question,
      suggestedAnswer,
      rationale: rationale || "Expert suggested answer from Ambient planning.",
      confidence: suggestion.confidence === "high" || suggestion.confidence === "medium" || suggestion.confidence === "low" ? suggestion.confidence : "low",
      safeToAccept: Boolean(suggestion.safeToAccept) && questionKind === "expert_default",
      questionKind,
    };
    const index = normalized.findIndex((item) => projectBoardQuestionsAreNearDuplicates(item.question, question));
    if (index >= 0) normalized[index] = normalizedSuggestion;
    else normalized.push(normalizedSuggestion);
  }
  return normalized.slice(0, 20);
}

export function parseProjectBoardClarificationSuggestions(value: string | null | undefined): ProjectBoardCardClarificationSuggestion[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return normalizeProjectBoardClarificationSuggestions(
      parsed.filter(
        (item): item is ProjectBoardCardClarificationSuggestion =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof item.question === "string" &&
          typeof item.suggestedAnswer === "string",
      ),
    );
  } catch {
    return [];
  }
}

export function normalizeProjectBoardClarificationAnswers(
  value: ProjectBoardCardClarificationAnswer[] | undefined,
  fallback: ProjectBoardCardClarificationAnswer[] = [],
): ProjectBoardCardClarificationAnswer[] {
  const source = value ?? fallback;
  const seen = new Set<string>();
  const answers: ProjectBoardCardClarificationAnswer[] = [];
  for (const item of source) {
    const question = typeof item.question === "string" ? item.question.trim().slice(0, 500) : "";
    const answer = typeof item.answer === "string" ? item.answer.trim().slice(0, 1500) : "";
    const answeredAt = typeof item.answeredAt === "string" && item.answeredAt.trim() ? item.answeredAt.trim().slice(0, 80) : new Date().toISOString();
    if (!question || !answer) continue;
    const key = question.toLowerCase();
    const existing = answers.find((candidate) => projectBoardQuestionsAreNearDuplicates(candidate.question, question));
    if (seen.has(key) || existing) {
      if (existing) {
        existing.answer = answer;
        existing.answeredAt = answeredAt;
      }
      continue;
    }
    seen.add(key);
    answers.push({ question, answer, answeredAt });
  }
  // Keep the newest answers at the cap so a fresh answer is never the one dropped.
  return answers.slice(-20);
}

export function parseProjectBoardClarificationAnswers(value: string | null | undefined): ProjectBoardCardClarificationAnswer[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return normalizeProjectBoardClarificationAnswers(
      parsed.filter(
        (item): item is ProjectBoardCardClarificationAnswer =>
          Boolean(item) && typeof item === "object" && typeof item.question === "string" && typeof item.answer === "string",
      ),
    );
  } catch {
    return [];
  }
}

export function normalizeProjectBoardClarificationDecisions(
  value: ProjectBoardCardClarificationDecision[] | undefined,
  fallback: ProjectBoardClarificationDecisionFallback = {},
): ProjectBoardCardClarificationDecision[] {
  return projectBoardStructuredClarificationDecisions({
    clarificationDecisions: value,
    clarificationQuestions: normalizeProjectBoardClarificationQuestions(fallback.clarificationQuestions ?? [], 8),
    clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(fallback.clarificationSuggestions ?? [], []),
    clarificationAnswers: normalizeProjectBoardClarificationAnswers(fallback.clarificationAnswers ?? []),
    description: fallback.description,
    acceptanceCriteria: fallback.acceptanceCriteria,
    createdAt: fallback.createdAt,
    updatedAt: fallback.updatedAt,
    includeInlineQuestions: false,
    limit: 20,
  });
}

export function parseProjectBoardClarificationDecisions(
  value: string | null | undefined,
  fallback: ProjectBoardClarificationDecisionFallback = {},
): ProjectBoardCardClarificationDecision[] {
  if (!value) return normalizeProjectBoardClarificationDecisions(undefined, fallback);
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return normalizeProjectBoardClarificationDecisions(undefined, fallback);
    const decisions = normalizeProjectBoardClarificationDecisions(
      parsed.filter(
        (item): item is ProjectBoardCardClarificationDecision =>
          Boolean(item) && typeof item === "object" && typeof item.question === "string",
      ),
      fallback,
    );
    return decisions.length > 0 ? decisions : normalizeProjectBoardClarificationDecisions(undefined, fallback);
  } catch {
    return normalizeProjectBoardClarificationDecisions(undefined, fallback);
  }
}

export function normalizeProjectBoardSynthesisClarificationFields(input: {
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  createdAt?: string;
  updatedAt?: string;
}): {
  clarificationQuestions: string[];
  clarificationSuggestions: ProjectBoardCardClarificationSuggestion[];
  clarificationDecisions: ProjectBoardCardClarificationDecision[];
} {
  const answers = normalizeProjectBoardClarificationAnswers(input.clarificationAnswers ?? []);
  const baseQuestions = normalizeProjectBoardClarificationQuestions(input.clarificationQuestions ?? [], 8).filter(
    (question) => !projectBoardClarificationQuestionHasAnswer(question, answers),
  );
  const baseSuggestions = normalizeProjectBoardClarificationSuggestions(input.clarificationSuggestions ?? [], []);
  const seedDecisions = normalizeProjectBoardClarificationDecisions(input.clarificationDecisions, {
    clarificationQuestions: baseQuestions,
    clarificationSuggestions: baseSuggestions,
    clarificationAnswers: answers,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  const decisionQuestions = seedDecisions.filter((decision) => decision.state === "open").map((decision) => decision.question);
  const decisionSuggestions = seedDecisions.flatMap((decision): ProjectBoardCardClarificationSuggestion[] => {
    if (decision.state !== "open" || !decision.suggestedAnswer?.trim()) return [];
    const questionKind = decision.questionKind ?? "user_preference";
    return [
      {
        question: decision.question,
        suggestedAnswer: decision.suggestedAnswer.trim(),
        rationale: decision.rationale?.trim() || "Suggested default from the structured clarification decision.",
        confidence: decision.confidence ?? "low",
        safeToAccept: Boolean(decision.safeToAccept) && questionKind === "expert_default",
        questionKind,
      },
    ];
  });
  const clarificationQuestions =
    baseQuestions.length > 0 ? baseQuestions : normalizeProjectBoardClarificationQuestions(decisionQuestions, 8);
  const clarificationSuggestions =
    baseSuggestions.length > 0 ? baseSuggestions : normalizeProjectBoardClarificationSuggestions(decisionSuggestions, []);
  const clarificationDecisions = normalizeProjectBoardClarificationDecisions(input.clarificationDecisions, {
    clarificationQuestions,
    clarificationSuggestions,
    clarificationAnswers: answers,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  return { clarificationQuestions, clarificationSuggestions, clarificationDecisions };
}

export function projectBoardClarificationQuestionHasAnswer(
  question: string,
  answers: ProjectBoardCardClarificationAnswer[],
): boolean {
  return answers.some((answer) => answer.answer.trim() && projectBoardQuestionsAreNearDuplicates(answer.question, question));
}

export function projectBoardUnansweredClarificationQuestions(
  questions: string[],
  answers: ProjectBoardCardClarificationAnswer[],
): string[] {
  return normalizeProjectBoardClarificationQuestions(questions, 8).filter(
    (question) => !projectBoardClarificationQuestionHasAnswer(question, answers),
  );
}

export function projectBoardClarificationDecisionsHaveOpenQuestion(
  decisions: ProjectBoardCardClarificationDecision[],
): boolean {
  return decisions.some((decision) => decision.state === "open");
}

export function projectBoardCandidateStatusForSynthesisUpdate(
  incoming: ProjectBoardCardCandidateStatus,
  existing: ProjectBoardCardCandidateStatus,
  clarificationDecisions: ProjectBoardCardClarificationDecision[],
): ProjectBoardCardCandidateStatus {
  if (incoming === "needs_clarification" && existing !== "needs_clarification" && !projectBoardClarificationDecisionsHaveOpenQuestion(clarificationDecisions)) {
    return existing;
  }
  return incoming;
}

export function projectBoardChangedClarificationAnswer(
  previousAnswers: ProjectBoardCardClarificationAnswer[],
  nextAnswers: ProjectBoardCardClarificationAnswer[],
): ProjectBoardCardClarificationAnswer | undefined {
  for (const answer of nextAnswers) {
    const previous = previousAnswers.find((candidate) => projectBoardQuestionsAreNearDuplicates(candidate.question, answer.question));
    if (!previous || previous.answer.trim() !== answer.answer.trim() || previous.answeredAt.trim() !== answer.answeredAt.trim()) return answer;
  }
  return undefined;
}

export function projectBoardClarificationAnswerSection(question: string, answer: string): string {
  return [`- Q: ${question.trim()}`, `  A: ${answer.trim()}`].join("\n");
}

export function projectBoardDescriptionWithClarificationAnswer(description: string, question: string, answer: string): string {
  const trimmed = description.trim();
  const entry = projectBoardClarificationAnswerSection(question, answer);
  if (!trimmed) return `## Clarifications\n${entry}`;
  if (trimmed.includes(entry)) return trimmed;
  if (/^##\s+Clarifications\s*$/im.test(trimmed)) return `${trimmed}\n${entry}`;
  return `${trimmed}\n\n## Clarifications\n${entry}`;
}

export function projectBoardQuestionMatchesAnyVariant(question: string, variants: string[]): boolean {
  return variants.some((variant) => projectBoardQuestionsAreNearDuplicates(question, variant));
}

export function projectBoardClarificationDecisionImpactEventSummary(
  cardTitle: string,
  impact: ProjectBoardDecisionImpactPreview,
): string {
  if (!impact.visible) return `${cardTitle} answered a clarification. No linked card impact; 0 model calls.`;
  return `${cardTitle} answered a clarification. ${impact.detail} 0 model calls.`;
}

export function projectBoardDecisionImpactEventMetadata(impact: ProjectBoardDecisionImpactPreview): Record<string, unknown> {
  return {
    triggerType: "clarification_answer",
    question: impact.question,
    canonicalKey: impact.canonicalKey,
    answeredCardId: impact.answeredCardId,
    affectedCardCount: impact.affectedCardIds.length,
    affectedCardIds: impact.affectedCardIds.slice(0, 40),
    affectedCounts: {
      unblockedDrafts: impact.unblockedDraftCount,
      stillBlockedDrafts: impact.stillBlockedDraftCount,
      duplicateVariantsHidden: impact.duplicateHiddenCount,
      readyFeedback: impact.readyFeedbackCount,
      auditOnly: impact.auditOnlyCount,
    },
    targetedRefreshOptional: impact.targetedRefreshOptional,
    modelCallRequired: impact.modelCallRequired,
    recommendedActions: impact.recommendedActions,
  };
}

export function projectBoardDecisionImpactFeedbackText(question: string, answer: string): string {
  return [
    `Clarification decision impact: ${question}`,
    `Decision answer: ${answer}.`,
    "Apply this PM decision in the next run without rewriting the approved card silently.",
  ]
    .join(" ")
    .slice(0, 1500);
}

export function projectBoardHasDecisionImpactFeedback(card: ProjectBoardCard, question: string, answer: string): boolean {
  return normalizeProjectBoardCardRunFeedback(card.runFeedback ?? []).some(
    (item) =>
      item.source === "decision_impact" &&
      Boolean(item.decisionQuestion) &&
      projectBoardQuestionsAreNearDuplicates(item.decisionQuestion ?? "", question) &&
      (item.decisionAnswer?.trim() ?? "") === answer,
  );
}

export function projectBoardHasSourceImpactFeedback(card: ProjectBoardCard, sourceImpactEventIds: string[], sourceIds: string[]): boolean {
  const sourceImpactEventIdSet = new Set(sourceImpactEventIds);
  const sourceIdSet = new Set(sourceIds);
  return normalizeProjectBoardCardRunFeedback(card.runFeedback ?? []).some((item) => {
    if (item.source !== "source_impact") return false;
    if (item.sourceImpactEventId && sourceImpactEventIdSet.has(item.sourceImpactEventId)) return true;
    if ((item.sourceImpactEventIds ?? []).some((eventId) => sourceImpactEventIdSet.has(eventId))) return true;
    if (sourceImpactEventIdSet.size > 0) return false;
    return (item.sourceIds ?? []).some((sourceId) => sourceIdSet.has(sourceId));
  });
}

export function projectBoardProofRevisionRunFeedback(
  previousReview: ProjectBoardCard["proofReview"] | undefined,
  reason: string | undefined,
  now: string,
): ProjectBoardCardRunFeedback | undefined {
  const details = [
    reason ? `Reviewer note: ${reason}` : "",
    previousReview?.summary ? `Previous proof review: ${previousReview.summary}` : "",
    previousReview?.missing?.length ? `Missing evidence: ${previousReview.missing.slice(0, 5).join("; ")}` : "",
    previousReview?.recommendedAction ? `Previous recommendation: ${previousReview.recommendedAction.replace(/_/g, " ")}` : "",
  ].filter(Boolean);
  if (details.length === 0) return undefined;
  return {
    id: randomUUID(),
    feedback: `Proof revision requested. ${details.join(" ")}`.slice(0, 1500),
    source: "proof_review",
    decisionQuestion: "Why was this proof sent back for revision?",
    decisionAnswer: reason || previousReview?.summary,
    createdAt: now,
    createdBy: "ambient-desktop",
  };
}

export function projectBoardUxMockRejectionRunFeedback(
  previousReview: ProjectBoardCard["proofReview"] | undefined,
  reason: string | undefined,
  now: string,
): ProjectBoardCardRunFeedback {
  const details = [
    reason ? `Reviewer note: ${reason}` : "",
    previousReview?.summary ? `Previous mock review: ${previousReview.summary}` : "",
    previousReview?.missing?.length ? `Missing or rejected criteria: ${previousReview.missing.slice(0, 5).join("; ")}` : "",
  ].filter(Boolean);
  return {
    id: randomUUID(),
    feedback: `UX mock rejected. ${details.length > 0 ? details.join(" ") : "Keep downstream UI implementation blocked until a revised mock is approved."}`.slice(0, 1500),
    source: "proof_review",
    decisionQuestion: "Why was this UX mock rejected?",
    decisionAnswer: reason || previousReview?.summary || "UX mock rejected by user PM decision.",
    createdAt: now,
    createdBy: "ambient-desktop",
  };
}

function projectBoardClarificationDecisionComparisonValue(decision: ProjectBoardCardClarificationDecision): Record<string, unknown> {
  if (decision.state === "answered") {
    return {
      question: decision.question,
      canonicalKey: decision.canonicalKey,
      state: decision.state,
      answer: decision.answer,
    };
  }
  return {
    question: decision.question,
    canonicalKey: decision.canonicalKey,
    source: decision.source,
    state: decision.state,
    duplicateOf: decision.duplicateOf,
    answer: decision.answer,
    suggestedAnswer: decision.suggestedAnswer,
    rationale: decision.rationale,
    confidence: decision.confidence,
    safeToAccept: Boolean(decision.safeToAccept),
    questionKind: decision.questionKind,
  };
}

export function projectBoardClarificationDecisionsEquivalent(
  left: ProjectBoardCardClarificationDecision[],
  right: ProjectBoardCardClarificationDecision[],
): boolean {
  return (
    projectBoardPlanningStableJson(left.map(projectBoardClarificationDecisionComparisonValue)) ===
    projectBoardPlanningStableJson(right.map(projectBoardClarificationDecisionComparisonValue))
  );
}

export function normalizeProjectBoardObjectiveProvenance(
  value: unknown,
): ProjectBoardSynthesisProposalCard["objectiveProvenance"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const objective = typeof candidate.objective === "string" ? candidate.objective.trim().slice(0, 2000) : "";
  if (!objective) return undefined;
  const groundingMode =
    candidate.groundingMode === "selected_sources" ||
    candidate.groundingMode === "source_scan" ||
    candidate.groundingMode === "objective_only"
      ? candidate.groundingMode
      : "objective_only";
  const selectedSourceIds = Array.isArray(candidate.selectedSourceIds)
    ? normalizeCardTextList(candidate.selectedSourceIds.filter((item): item is string => typeof item === "string"), 50)
    : [];
  const sourceRefCount = typeof candidate.sourceRefCount === "number" && Number.isFinite(candidate.sourceRefCount)
    ? Math.max(0, Math.round(candidate.sourceRefCount))
    : 0;
  const weakGrounding = typeof candidate.weakGrounding === "boolean"
    ? candidate.weakGrounding
    : sourceRefCount === 0 || groundingMode === "objective_only";
  const sourceGap = typeof candidate.sourceGap === "string" && candidate.sourceGap.trim()
    ? candidate.sourceGap.trim().slice(0, 2000)
    : undefined;
  return {
    objective,
    groundingMode,
    selectedSourceIds,
    sourceRefCount,
    weakGrounding,
    sourceGap,
  };
}

export function objectiveProvenanceJson(value: unknown): string | null {
  const normalized = normalizeProjectBoardObjectiveProvenance(value);
  return normalized ? JSON.stringify(normalized) : null;
}

export function sourceRefArtifactStrings(sourceRefs: Array<{ sourceId?: string; path?: string; range?: string }>): string[] {
  return normalizeCardTextList(
    sourceRefs
      .map((ref) => {
        const base = ref.path?.trim() || ref.sourceId?.trim() || "";
        return base ? (ref.range ? `${base}#${ref.range}` : base) : "";
      })
      .filter(Boolean),
    20,
  );
}

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

export function projectBoardEventKindFromArtifact(event: BoardEventArtifact): ProjectBoardEventKind {
  const currentKind = event.payload.currentKind;
  if (typeof currentKind === "string" && projectBoardEventKinds.has(currentKind as ProjectBoardEventKind)) {
    return currentKind as ProjectBoardEventKind;
  }
  return projectBoardEventKindByArtifactType[event.type] ?? "card_updated";
}

export function projectBoardEventTitleFromArtifact(event: BoardEventArtifact): string {
  const title = event.payload.title;
  if (typeof title === "string" && title.trim()) return title.trim().slice(0, 180);
  if (event.type === "run.prepared") return "Run prepared";
  if (event.type === "run.started") return "Run started";
  if (event.type === "run.progress") return "Run progress";
  if (event.type === "run.completed") return "Run completed";
  if (event.type === "run.failed") return "Run failed";
  if (event.type === "run.blocked") return "Run blocked";
  if (event.type === "run.canceled") return "Run canceled";
  if (event.type === "run.stalled") return "Run stalled";
  if (event.type === "run.handoff_created") return "Run handoff created";
  if (event.type === "card.claimed") return "Card claimed";
  if (event.type === "card.heartbeat") return "Card claim heartbeat";
  if (event.type === "card.claim_released") return "Card claim released";
  if (event.type === "card.claim_expired") return "Card claim expired";
  return event.type;
}

export function projectBoardEventSummaryFromArtifact(event: BoardEventArtifact): string {
  const summary = event.payload.summary;
  if (typeof summary !== "string" && event.type.startsWith("run.")) {
    const runId = typeof event.payload.runId === "string" ? event.payload.runId : event.entityId;
    const cardId = typeof event.payload.cardId === "string" ? event.payload.cardId : "unknown card";
    const status = typeof event.payload.normalizedStatus === "string" ? event.payload.normalizedStatus : event.type.replace("run.", "");
    return `Imported ${status.replace(/_/g, " ")} run ${runId} for ${cardId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claimed") {
    const agent = typeof event.payload.agentId === "string" ? event.payload.agentId : event.actor?.agentId ?? "another desktop";
    const leaseUntil = typeof event.payload.leaseUntil === "string" ? ` until ${event.payload.leaseUntil}` : "";
    return `Card claim recorded for ${event.entityId} by ${agent}${leaseUntil}.`;
  }
  if (typeof summary !== "string" && event.type === "card.heartbeat") {
    return `Claim heartbeat recorded for ${event.entityId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claim_released") {
    return `Card claim released for ${event.entityId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claim_expired") {
    return `Card claim expired for ${event.entityId}.`;
  }
  return typeof summary === "string" ? summary.slice(0, 1000) : "";
}

export function projectBoardEventMetadataFromArtifact(event: BoardEventArtifact): Record<string, unknown> {
  const metadata = event.payload.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  return { ...event.payload, artifactEventType: event.type, artifactPayload: event.payload, artifactActor: event.actor };
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

export function projectBoardExecutionArtifactStatus(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  if (manifest?.status) return manifest.status;
  if (handoff) return "completed";
  if (proof) return "review";
  return "prepared";
}

export function projectBoardExecutionArtifactCardId(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string | undefined {
  return manifest?.cardId ?? proof?.cardId ?? handoff?.cardId;
}

export function projectBoardExecutionArtifactStartedAt(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  return manifest?.startedAt ?? proof?.createdAt ?? handoff?.createdAt ?? new Date().toISOString();
}

export function projectBoardExecutionArtifactUpdatedAt(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  return manifest?.updatedAt ?? handoff?.createdAt ?? proof?.createdAt ?? projectBoardExecutionArtifactStartedAt(manifest, proof, handoff);
}

export function projectBoardExecutionArtifactProofFromArtifact(proof: RunProofArtifact): ProjectBoardExecutionArtifactProof {
  return {
    summary: proof.summary,
    commands: proof.commands,
    changedFiles: proof.changedFiles,
    screenshots: proof.screenshots,
    browserTraces: proof.browserTraces,
    visualChecks: proof.visualChecks,
    manualChecks: proof.manualChecks,
    createdAt: proof.createdAt,
  };
}

export function projectBoardExecutionArtifactHandoffFromArtifact(handoff: RunHandoffArtifact): ProjectBoardExecutionArtifactHandoff {
  return {
    summary: handoff.summary,
    completed: handoff.completed,
    remaining: handoff.remaining,
    risks: handoff.risks,
    followUps: handoff.followUps,
    createdAt: handoff.createdAt,
  };
}

export function projectBoardRunStageFromManifest(manifest: ProposalManifestArtifact): ProjectBoardSynthesisRunStage {
  if (manifest.status === "failed" || manifest.stage === "failed") return "failed";
  if (manifest.status === "abandoned") return "paused";
  if (manifest.status === "paused" || manifest.stage === "paused") return "paused";
  if (manifest.stage === "source_scan") return "source_scan";
  if (manifest.stage === "source_classification") return "source_classification";
  if (manifest.stage === "importing") return "schema_validation";
  if (manifest.stage === "completed") return "proposal_created";
  return "model_request";
}

export function projectBoardRunStageFromArtifactProgress(stage: string): ProjectBoardSynthesisRunStage {
  const normalized = stage.trim().toLowerCase();
  if (normalized === "source_scan") return "source_scan";
  if (normalized === "sources_persisted") return "sources_persisted";
  if (normalized === "source_classification") return "source_classification";
  if (normalized === "deterministic_baseline") return "deterministic_baseline";
  if (normalized === "model_request") return "model_request";
  if (normalized === "model_response") return "model_response";
  if (normalized === "schema_validation" || normalized === "importing") return "schema_validation";
  if (normalized === "board_applied") return "board_applied";
  if (normalized === "proposal_created" || normalized === "completed") return "proposal_created";
  if (normalized === "paused" || normalized === "planning_paused") return "paused";
  if (normalized === "failed") return "failed";
  return "model_response";
}

export function projectBoardRunStatusFromProposalManifest(manifest: ProposalManifestArtifact): ProjectBoardSynthesisRunStatus {
  if (manifest.status === "abandoned") return "abandoned";
  if (manifest.status === "pause_requested" || manifest.status === "paused") return manifest.status;
  if (manifest.status === "failed") return "failed";
  if (manifest.status === "running") return "running";
  return "succeeded";
}

export function normalizeProjectBoardSynthesisProposalAnswer(
  value: unknown,
  fallbackAnsweredAt: string,
): ProjectBoardSynthesisProposalAnswer[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const answer = value as ProjectBoardSynthesisProposalAnswer;
  if (typeof answer.answer !== "string" || !answer.answer.trim()) return [];
  const questionIndex = typeof answer.questionIndex === "number" && Number.isInteger(answer.questionIndex) ? answer.questionIndex : -1;
  if (questionIndex < 0) return [];
  return [
    {
      questionIndex,
      question: typeof answer.question === "string" ? answer.question : "",
      answer: answer.answer,
      answeredAt: typeof answer.answeredAt === "string" ? answer.answeredAt : fallbackAnsweredAt,
    },
  ];
}

export function normalizeProjectBoardProofFollowUpSuggestion(value: unknown): ProjectBoardProofFollowUpSuggestion | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 180) : undefined;
  const description =
    typeof record.description === "string" && record.description.trim() ? record.description.trim().slice(0, 4_000) : undefined;
  const acceptanceCriteria = Array.isArray(record.acceptanceCriteria)
    ? normalizeCardTextList(record.acceptanceCriteria.map((entry) => String(entry)), 30)
    : [];
  const testPlan =
    record.testPlan && typeof record.testPlan === "object" && !Array.isArray(record.testPlan)
      ? normalizeUnknownProjectBoardTestPlan(record.testPlan as Record<string, unknown>)
      : undefined;
  const hasTestPlan = Boolean(
    testPlan && (testPlan.unit.length || testPlan.integration.length || testPlan.visual.length || testPlan.manual.length),
  );
  const clarificationQuestions = Array.isArray(record.clarificationQuestions)
    ? normalizeProjectBoardClarificationQuestions(record.clarificationQuestions.map((entry) => String(entry)), 8)
    : [];
  const labels = Array.isArray(record.labels) ? normalizeTaskLabels(record.labels.map((entry) => String(entry))).slice(0, 12) : [];
  const rationale = typeof record.rationale === "string" && record.rationale.trim() ? record.rationale.trim().slice(0, 1_000) : undefined;
  const hasScope = Boolean(title || description || acceptanceCriteria.length || hasTestPlan || clarificationQuestions.length);
  if (!hasScope) return undefined;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(acceptanceCriteria.length ? { acceptanceCriteria } : {}),
    ...(hasTestPlan ? { testPlan } : {}),
    ...(clarificationQuestions.length ? { clarificationQuestions } : {}),
    ...(labels.length ? { labels } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

export function projectBoardSynthesisDraftWithSourceIdNamespace(
  synthesis: ProjectBoardSynthesisDraft,
  namespace: string | undefined,
): ProjectBoardSynthesisDraft {
  const prefix = namespace?.trim();
  if (!prefix) return synthesis;
  const sourceIdByOriginal = new Map<string, string>();
  for (const card of synthesis.cards) {
    const original = card.sourceId.trim();
    if (!original || original.startsWith(prefix)) continue;
    sourceIdByOriginal.set(original, `${prefix}${original}`);
  }
  if (sourceIdByOriginal.size === 0) return synthesis;
  const rewriteReference = (value: string): string => {
    const trimmed = value.trim();
    return sourceIdByOriginal.get(trimmed) ?? value;
  };
  return {
    ...synthesis,
    cards: synthesis.cards.map((card) => {
      const sourceId = card.sourceId.trim();
      return {
        ...card,
        sourceId: sourceIdByOriginal.get(sourceId) ?? sourceId,
        blockedBy: card.blockedBy.map(rewriteReference),
      };
    }),
  };
}

export function normalizeProjectBoardSynthesisProposalCard(card: ProjectBoardSynthesisProposalCard): ProjectBoardSynthesisProposalCard {
  return {
    sourceId: typeof card.sourceId === "string" ? card.sourceId : "",
    title: typeof card.title === "string" ? card.title : "",
    description: typeof card.description === "string" ? card.description : "",
    candidateStatus: card.candidateStatus ?? "needs_clarification",
    priority: typeof card.priority === "number" ? card.priority : undefined,
    phase: typeof card.phase === "string" ? card.phase : undefined,
    labels: Array.isArray(card.labels) ? card.labels.filter((label): label is string => typeof label === "string") : [],
    blockedBy: Array.isArray(card.blockedBy) ? card.blockedBy.filter((blocker): blocker is string => typeof blocker === "string") : [],
    acceptanceCriteria: Array.isArray(card.acceptanceCriteria)
      ? card.acceptanceCriteria.filter((criterion): criterion is string => typeof criterion === "string")
      : [],
    testPlan: normalizeProjectBoardCardTestPlan(card.testPlan ?? { unit: [], integration: [], visual: [], manual: [] }),
    sourceRefs: Array.isArray(card.sourceRefs) ? card.sourceRefs.filter((ref): ref is string => typeof ref === "string") : [],
    clarificationQuestions: Array.isArray(card.clarificationQuestions)
      ? card.clarificationQuestions.filter((question): question is string => typeof question === "string")
      : [],
    clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(card.clarificationSuggestions ?? [], []),
    objectiveProvenance: normalizeProjectBoardObjectiveProvenance(card.objectiveProvenance),
    uiMockRole: normalizeProjectBoardUiMockRole(card.uiMockRole),
    requiresUiMockApproval: Boolean(card.requiresUiMockApproval),
    reviewStatus: projectBoardSynthesisProposalCardReviewStatus(card.reviewStatus) ?? "pending",
    reviewReason: typeof card.reviewReason === "string" && card.reviewReason.trim() ? card.reviewReason : undefined,
    mergeTargetCardId: typeof card.mergeTargetCardId === "string" && card.mergeTargetCardId.trim() ? card.mergeTargetCardId : undefined,
    reviewedAt: typeof card.reviewedAt === "string" && card.reviewedAt.trim() ? card.reviewedAt : undefined,
  };
}

export function projectBoardSynthesisProposalCardsFromDraft(
  synthesis: ProjectBoardSynthesisDraft,
  existingCards: ProjectBoardSynthesisProposalCard[] = [],
): ProjectBoardSynthesisProposalCard[] {
  const existingBySourceId = new Map(existingCards.map((card) => [card.sourceId, card]));
  return synthesis.cards
    .filter((card) => card.title.trim() && card.sourceId.trim())
    .slice(0, MAX_PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARDS)
    .map((card) => {
      const normalized: ProjectBoardSynthesisProposalCard = {
        sourceId: card.sourceId.trim(),
        title: card.title.trim().slice(0, 180),
        description: card.description.trim().slice(0, 4000),
        candidateStatus: card.candidateStatus,
        priority: typeof card.priority === "number" ? Math.max(1, Math.round(card.priority)) : undefined,
        phase: card.phase?.trim().slice(0, 120) || undefined,
        labels: normalizeTaskLabels(card.labels),
        blockedBy: normalizeTaskReferences(card.blockedBy),
        acceptanceCriteria: normalizeCardTextList(card.acceptanceCriteria, 30),
        testPlan: normalizeProjectBoardCardTestPlan(card.testPlan),
        sourceRefs: normalizeCardTextList(card.sourceRefs, 20),
        clarificationQuestions: normalizeProjectBoardClarificationQuestions(card.clarificationQuestions ?? [], 8),
        clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(card.clarificationSuggestions ?? [], []),
        objectiveProvenance: normalizeProjectBoardObjectiveProvenance(card.objectiveProvenance),
        uiMockRole: projectBoardUiMockRoleForSynthesisCard(card),
        requiresUiMockApproval: projectBoardRequiresUiMockApprovalForSynthesisCard(card),
        reviewStatus: "pending",
      };
      const existing = existingBySourceId.get(normalized.sourceId);
      if (!existing || !projectBoardSynthesisProposalCardReviewStillApplies(existing, normalized)) return normalized;
      return {
        ...normalized,
        reviewStatus: existing.reviewStatus,
        reviewReason: existing.reviewReason,
        mergeTargetCardId: existing.mergeTargetCardId,
        reviewedAt: existing.reviewedAt,
      };
    });
}

export function projectBoardCardPendingPiUpdateFromSynthesisCard(
  existing: ProjectBoardCardPendingPiUpdateStoreRow,
  incoming: ProjectBoardSynthesisCardInput,
  createdAt: string,
): ProjectBoardCardPendingPiUpdate | undefined {
  const existingClarificationAnswers = parseProjectBoardClarificationAnswers(existing.clarification_answers_json);
  const normalizedClarification = normalizeProjectBoardSynthesisClarificationFields({
    clarificationQuestions: incoming.clarificationQuestions,
    clarificationSuggestions: incoming.clarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    clarificationDecisions: incoming.clarificationDecisions,
    createdAt,
    updatedAt: createdAt,
  });
  const normalizedClarificationDecisions = normalizedClarification.clarificationDecisions;
  const normalizedCandidateStatus = projectBoardCandidateStatusForSynthesisUpdate(
    incoming.candidateStatus,
    existing.candidate_status,
    normalizedClarificationDecisions,
  );
  const normalized = {
    sourceId: incoming.sourceId.trim(),
    title: incoming.title.trim().slice(0, 180),
    description: incoming.description.trim().slice(0, 4000),
    candidateStatus: normalizedCandidateStatus,
    priority: typeof incoming.priority === "number" ? Math.max(1, Math.round(incoming.priority)) : undefined,
    phase: incoming.phase?.trim().slice(0, 120) || undefined,
    labels: normalizeTaskLabels(incoming.labels),
    blockedBy: normalizeTaskReferences(incoming.blockedBy),
    acceptanceCriteria: normalizeCardTextList(incoming.acceptanceCriteria, 30),
    testPlan: normalizeProjectBoardCardTestPlan(incoming.testPlan),
    sourceRefs: normalizeCardTextList(incoming.sourceRefs, 20),
    clarificationQuestions: normalizedClarification.clarificationQuestions,
    clarificationSuggestions: normalizedClarification.clarificationSuggestions,
    objectiveProvenance: normalizeProjectBoardObjectiveProvenance(incoming.objectiveProvenance),
    uiMockRole: projectBoardUiMockRoleForSynthesisCard(incoming),
    requiresUiMockApproval: projectBoardRequiresUiMockApprovalForSynthesisCard(incoming),
  };
  const existingPriority = existing.priority ?? undefined;
  const existingPhase = existing.phase ?? undefined;
  const existingLabels = parseProjectBoardStringList(existing.labels_json);
  const existingBlockedBy = parseProjectBoardStringList(existing.blocked_by_json);
  const existingAcceptanceCriteria = parseProjectBoardStringList(existing.acceptance_criteria_json);
  const existingTestPlan = parseProjectBoardCardTestPlan(existing.test_plan_json);
  const existingSourceRefs = parseProjectBoardStringList(existing.source_refs_json);
  const existingClarificationQuestions = parseProjectBoardStringList(existing.clarification_questions_json);
  const existingOpenClarificationQuestions = projectBoardUnansweredClarificationQuestions(existingClarificationQuestions, existingClarificationAnswers);
  const existingClarificationSuggestions = parseProjectBoardClarificationSuggestions(existing.clarification_suggestions_json);
  const existingUiMockRole = normalizeProjectBoardUiMockRole(existing.ui_mock_role);
  const existingRequiresUiMockApproval = Boolean(existing.requires_ui_mock_approval);
  const existingClarificationDecisions = parseProjectBoardClarificationDecisions(existing.clarification_decisions_json, {
    clarificationQuestions: existingClarificationQuestions,
    clarificationSuggestions: existingClarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    createdAt: existing.created_at,
    updatedAt: existing.updated_at,
  });
  const changedFields: ProjectBoardCardTouchedField[] = [
    normalized.title !== existing.title ? "title" : undefined,
    normalized.description !== existing.description ? "description" : undefined,
    normalized.candidateStatus !== existing.candidate_status ? "candidateStatus" : undefined,
    normalized.priority !== existingPriority ? "priority" : undefined,
    normalized.phase !== existingPhase ? "phase" : undefined,
    JSON.stringify(normalized.labels) !== JSON.stringify(existingLabels) ? "labels" : undefined,
    JSON.stringify(normalized.blockedBy) !== JSON.stringify(existingBlockedBy) ? "dependencies" : undefined,
    JSON.stringify(normalized.acceptanceCriteria) !== JSON.stringify(existingAcceptanceCriteria) ? "acceptanceCriteria" : undefined,
    JSON.stringify(normalized.testPlan) !== JSON.stringify(existingTestPlan) ? "testPlan" : undefined,
    JSON.stringify(normalized.sourceRefs) !== JSON.stringify(existingSourceRefs) ? "sourceRefs" : undefined,
    JSON.stringify(normalized.clarificationQuestions) !== JSON.stringify(existingOpenClarificationQuestions) ? "clarificationQuestions" : undefined,
    JSON.stringify(normalized.clarificationSuggestions) !== JSON.stringify(existingClarificationSuggestions) ? "clarificationSuggestions" : undefined,
    projectBoardClarificationDecisionsEquivalent(normalizedClarificationDecisions, existingClarificationDecisions) ? undefined : "clarificationDecisions",
    normalized.uiMockRole !== existingUiMockRole || normalized.requiresUiMockApproval !== existingRequiresUiMockApproval ? "uiMockMetadata" : undefined,
  ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
  if (changedFields.length === 0) return undefined;
  return {
    sourceId: normalized.sourceId,
    createdAt,
    changedFields,
    title: normalized.title,
    description: normalized.description,
    candidateStatus: normalized.candidateStatus,
    priority: normalized.priority,
    phase: normalized.phase,
    labels: normalized.labels,
    blockedBy: normalized.blockedBy,
    acceptanceCriteria: normalized.acceptanceCriteria,
    testPlan: normalized.testPlan,
    sourceRefs: normalized.sourceRefs,
    clarificationQuestions: normalized.clarificationQuestions,
    clarificationSuggestions: normalized.clarificationSuggestions,
    clarificationDecisions: normalizedClarificationDecisions,
    objectiveProvenance: normalized.objectiveProvenance,
    uiMockRole: normalized.uiMockRole,
    requiresUiMockApproval: normalized.requiresUiMockApproval,
  };
}

export function projectBoardMaterialPendingPiUpdateForRow(
  row: ProjectBoardCardPendingPiUpdateStoreRow,
  pending: ProjectBoardCardPendingPiUpdate,
): ProjectBoardCardPendingPiUpdate | undefined {
  const existingCandidateStatus = row.candidate_status ?? "ready_to_create";
  const existingPriority = row.priority ?? undefined;
  const existingPhase = row.phase ?? undefined;
  const existingLabels = parseProjectBoardStringList(row.labels_json);
  const existingBlockedBy = parseProjectBoardStringList(row.blocked_by_json);
  const existingAcceptanceCriteria = parseProjectBoardStringList(row.acceptance_criteria_json);
  const existingTestPlan = parseProjectBoardCardTestPlan(row.test_plan_json);
  const existingSourceRefs = parseProjectBoardStringList(row.source_refs_json);
  const existingClarificationQuestions = parseProjectBoardStringList(row.clarification_questions_json);
  const existingClarificationAnswers = parseProjectBoardClarificationAnswers(row.clarification_answers_json);
  const existingOpenClarificationQuestions = projectBoardUnansweredClarificationQuestions(existingClarificationQuestions, existingClarificationAnswers);
  const existingClarificationSuggestions = parseProjectBoardClarificationSuggestions(row.clarification_suggestions_json);
  const existingUiMockRole = normalizeProjectBoardUiMockRole(row.ui_mock_role);
  const existingRequiresUiMockApproval = Boolean(row.requires_ui_mock_approval);
  const existingClarificationDecisions = parseProjectBoardClarificationDecisions(row.clarification_decisions_json, {
    clarificationQuestions: existingClarificationQuestions,
    clarificationSuggestions: existingClarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  const nextClarificationAnswers = normalizeProjectBoardClarificationAnswers(pending.clarificationAnswers ?? existingClarificationAnswers);
  const nextClarification = normalizeProjectBoardSynthesisClarificationFields({
    clarificationQuestions: pending.clarificationQuestions ?? existingClarificationQuestions,
    clarificationSuggestions: pending.clarificationSuggestions ?? existingClarificationSuggestions,
    clarificationAnswers: nextClarificationAnswers,
    clarificationDecisions: pending.clarificationDecisions ?? existingClarificationDecisions,
    createdAt: row.created_at,
    updatedAt: pending.createdAt || row.updated_at,
  });
  const nextCandidateStatus = pending.candidateStatus
    ? projectBoardCandidateStatusForSynthesisUpdate(pending.candidateStatus, existingCandidateStatus, nextClarification.clarificationDecisions)
    : existingCandidateStatus;
  const changedFields: ProjectBoardCardTouchedField[] = [
    pending.title !== undefined && pending.title.trim().slice(0, 180) !== row.title ? "title" : undefined,
    pending.description !== undefined && pending.description.trim().slice(0, 4000) !== row.description ? "description" : undefined,
    pending.candidateStatus !== undefined && nextCandidateStatus !== existingCandidateStatus ? "candidateStatus" : undefined,
    pending.priority !== undefined && pending.priority !== existingPriority ? "priority" : undefined,
    pending.phase !== undefined && (pending.phase?.trim().slice(0, 80) || undefined) !== existingPhase ? "phase" : undefined,
    pending.labels !== undefined && JSON.stringify(normalizeTaskLabels(pending.labels)) !== JSON.stringify(existingLabels) ? "labels" : undefined,
    pending.blockedBy !== undefined && JSON.stringify(normalizeTaskReferences(pending.blockedBy)) !== JSON.stringify(existingBlockedBy) ? "dependencies" : undefined,
    pending.acceptanceCriteria !== undefined && JSON.stringify(normalizeCardTextList(pending.acceptanceCriteria, 30)) !== JSON.stringify(existingAcceptanceCriteria)
      ? "acceptanceCriteria"
      : undefined,
    pending.testPlan !== undefined && JSON.stringify(normalizeProjectBoardCardTestPlan(pending.testPlan)) !== JSON.stringify(existingTestPlan) ? "testPlan" : undefined,
    pending.sourceRefs !== undefined && JSON.stringify(normalizeCardTextList(pending.sourceRefs, 20)) !== JSON.stringify(existingSourceRefs) ? "sourceRefs" : undefined,
    pending.clarificationQuestions !== undefined && JSON.stringify(nextClarification.clarificationQuestions) !== JSON.stringify(existingOpenClarificationQuestions)
      ? "clarificationQuestions"
      : undefined,
    pending.clarificationSuggestions !== undefined &&
    JSON.stringify(nextClarification.clarificationSuggestions) !== JSON.stringify(existingClarificationSuggestions)
      ? "clarificationSuggestions"
      : undefined,
    pending.clarificationAnswers !== undefined && JSON.stringify(nextClarificationAnswers) !== JSON.stringify(existingClarificationAnswers)
      ? "clarificationAnswers"
      : undefined,
    pending.clarificationDecisions !== undefined &&
    !projectBoardClarificationDecisionsEquivalent(nextClarification.clarificationDecisions, existingClarificationDecisions)
      ? "clarificationDecisions"
      : undefined,
    pending.uiMockRole !== undefined && normalizeProjectBoardUiMockRole(pending.uiMockRole) !== existingUiMockRole ? "uiMockMetadata" : undefined,
    pending.requiresUiMockApproval !== undefined && Boolean(pending.requiresUiMockApproval) !== existingRequiresUiMockApproval ? "uiMockMetadata" : undefined,
  ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
  if (changedFields.length === 0) return undefined;
  return { ...pending, changedFields };
}

export function projectBoardSynthesisProposalCardReviewStillApplies(
  existing: ProjectBoardSynthesisProposalCard,
  next: ProjectBoardSynthesisProposalCard,
): boolean {
  if (existing.reviewStatus === "pending") return false;
  return (
    existing.title === next.title &&
    existing.description === next.description &&
    existing.candidateStatus === next.candidateStatus &&
    existing.priority === next.priority &&
    existing.phase === next.phase &&
    stringListsEqual(existing.labels, next.labels) &&
    stringListsEqual(existing.blockedBy, next.blockedBy) &&
    stringListsEqual(existing.acceptanceCriteria, next.acceptanceCriteria) &&
    stringListsEqual(existing.sourceRefs, next.sourceRefs) &&
    stringListsEqual(existing.clarificationQuestions ?? [], next.clarificationQuestions ?? []) &&
    JSON.stringify(existing.clarificationSuggestions ?? []) === JSON.stringify(next.clarificationSuggestions ?? []) &&
    stringListsEqual(existing.testPlan.unit, next.testPlan.unit) &&
    stringListsEqual(existing.testPlan.integration, next.testPlan.integration) &&
    stringListsEqual(existing.testPlan.visual, next.testPlan.visual) &&
    stringListsEqual(existing.testPlan.manual, next.testPlan.manual) &&
    JSON.stringify(existing.objectiveProvenance ?? null) === JSON.stringify(next.objectiveProvenance ?? null) &&
    existing.uiMockRole === next.uiMockRole &&
    Boolean(existing.requiresUiMockApproval) === Boolean(next.requiresUiMockApproval)
  );
}

function stringListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
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
      const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
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
  const planningStatus: ProjectBoardSynthesisRunStatus = ["running", "pause_requested", "paused", "abandoned", "succeeded", "failed"].includes(value.planningStatus)
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
          typeof card.candidateStatus === "string" && PROJECT_BOARD_CARD_CANDIDATE_STATUS_VALUES.has(card.candidateStatus as ProjectBoardCardCandidateStatus)
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
            ...(typeof card.orchestrationTaskId === "string" && card.orchestrationTaskId.trim() ? { orchestrationTaskId: card.orchestrationTaskId.trim() } : {}),
          },
        ];
      })
    : [];
  const cardIds = Array.isArray(value.cardIds) ? value.cardIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : cards.map((card) => card.cardId);
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
      cardCount: Math.max(0, Math.round(typeof value.cardCount === "number" && Number.isFinite(value.cardCount) ? value.cardCount : cards.length)),
      readyCandidateCount: Math.max(
        0,
        Math.round(typeof value.readyCandidateCount === "number" && Number.isFinite(value.readyCandidateCount) ? value.readyCandidateCount : 0),
      ),
      ticketizedCount: Math.max(0, Math.round(typeof value.ticketizedCount === "number" && Number.isFinite(value.ticketizedCount) ? value.ticketizedCount : 0)),
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
  const level = typeof record.level === "string" && ["shallow", "standard", "deep", "phased"].includes(record.level) ? record.level : undefined;
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

export function mapProjectBoardExecutionArtifactRow(row: ProjectBoardExecutionArtifactStoreRow): ProjectBoardExecutionArtifact {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    status: row.status,
    source: row.source === "local_export" ? "local_export" : "git",
    agentId: row.agent_id ?? undefined,
    piSessionId: row.pi_session_id ?? undefined,
    workspaceBranch: row.workspace_branch ?? undefined,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    proof: row.proof_json ? normalizeProjectBoardExecutionProof(parseProjectBoardJsonObject<Record<string, unknown> | undefined>(row.proof_json, undefined)) : undefined,
    handoff: row.handoff_json
      ? normalizeProjectBoardExecutionHandoff(parseProjectBoardJsonObject<Record<string, unknown> | undefined>(row.handoff_json, undefined))
      : undefined,
    createdAt: row.created_at,
  };
}

export function mapProjectBoardSourceRow(row: ProjectBoardSourceStoreRow): ProjectBoardSource {
  return {
    id: row.id,
    boardId: row.board_id,
    kind: row.source_kind,
    sourceKey: row.source_key ?? projectBoardSourceKey({
      kind: row.source_kind,
      title: row.title,
      summary: row.summary,
      excerpt: row.excerpt ?? undefined,
      path: row.path ?? undefined,
      threadId: row.thread_id ?? undefined,
      artifactId: row.artifact_id ?? undefined,
      messageId: row.message_id ?? undefined,
    }),
    contentHash: row.content_hash ?? undefined,
    changeState: row.change_state ?? undefined,
    title: row.title,
    summary: row.summary,
    excerpt: row.excerpt ?? undefined,
    path: row.path ?? undefined,
    threadId: row.thread_id ?? undefined,
    artifactId: row.artifact_id ?? undefined,
    messageId: row.message_id ?? undefined,
    byteSize: row.byte_size ?? undefined,
    mtime: row.mtime ?? undefined,
    classificationReason: row.classification_reason ?? undefined,
    classifiedBy: row.classified_by ?? undefined,
    classificationConfidence: row.classification_confidence ?? undefined,
    authorityRole: row.authority_role ?? undefined,
    includeInSynthesis: row.include_in_synthesis === null ? undefined : row.include_in_synthesis === 1,
    relevance: row.relevance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardEventRow(row: ProjectBoardEventStoreRow): ProjectBoardEvent {
  return {
    id: row.id,
    boardId: row.board_id,
    kind: row.event_kind,
    title: row.title,
    summary: row.summary,
    entityKind: row.entity_kind ?? undefined,
    entityId: row.entity_id ?? undefined,
    metadata: parseProjectBoardJsonObject<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: row.created_at,
  };
}

export function mapProjectBoardCharterRow(row: ProjectBoardCharterStoreRow): ProjectBoardCharter {
  const projectSummary = row.project_summary_json
    ? parseProjectBoardJsonObject<ProjectBoardCharterProjectSummary | undefined>(row.project_summary_json, undefined)
    : undefined;
  return {
    id: row.id,
    boardId: row.board_id,
    version: row.version,
    status: row.status,
    goal: row.goal,
    currentState: row.current_state,
    targetUser: row.target_user,
    nonGoals: parseProjectBoardStringList(row.non_goals_json),
    qualityBar: row.quality_bar,
    testPolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.test_policy_json, {}),
    decisionPolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.decision_policy_json, {}),
    dependencyPolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.dependency_policy_json, {}),
    budgetPolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.budget_policy_json, {}),
    sourcePolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.source_policy_json, {}),
    markdown: row.markdown,
    ...(projectSummary ? { projectSummary } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardQuestionRow(row: ProjectBoardQuestionStoreRow, sources?: ProjectBoardSource[]): ProjectBoardQuestion {
  const contextFingerprint = row.suggestion_context_fingerprint ?? undefined;
  const currentFingerprint =
    contextFingerprint && sources
      ? projectBoardKickoffDefaultContextFingerprint({ question: row.question, sources })
      : undefined;
  const confidence =
    row.suggestion_confidence === "high" || row.suggestion_confidence === "medium" || row.suggestion_confidence === "low"
      ? row.suggestion_confidence
      : undefined;
  return {
    id: row.id,
    boardId: row.board_id,
    question: row.question,
    required: row.required === 1,
    answer: row.answer ?? undefined,
    answeredAt: row.answered_at ?? undefined,
    suggestedAnswer: row.suggested_answer ?? undefined,
    suggestedAnswerRationale: row.suggestion_rationale ?? undefined,
    suggestedAnswerConfidence: confidence,
    suggestedAnswerSourceIds: parseProjectBoardStringList(row.suggestion_source_ids_json ?? "[]"),
    suggestedAnswerContextFingerprint: contextFingerprint,
    suggestedAnswerGeneratedAt: row.suggestion_generated_at ?? undefined,
    suggestedAnswerModel: row.suggestion_model ?? undefined,
    suggestedAnswerProviderError: row.suggestion_provider_error ?? undefined,
    suggestedAnswerStale: Boolean(contextFingerprint && currentFingerprint && contextFingerprint !== currentFingerprint),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardSynthesisProposalRow(row: ProjectBoardSynthesisProposalStoreRow): ProjectBoardSynthesisProposal {
  return {
    id: row.id,
    boardId: row.board_id,
    status: row.status,
    summary: row.summary,
    goal: row.goal,
    currentState: row.current_state,
    targetUser: row.target_user,
    qualityBar: row.quality_bar,
    assumptions: parseProjectBoardStringList(row.assumptions_json),
    questions: parseProjectBoardStringList(row.questions_json),
    answers: parseProjectBoardJsonArray(row.answers_json).flatMap((answer) => normalizeProjectBoardSynthesisProposalAnswer(answer, row.updated_at)),
    sourceNotes: parseProjectBoardStringList(row.source_notes_json),
    cards: parseProjectBoardJsonArray<ProjectBoardSynthesisProposalCard>(row.cards_json).map(normalizeProjectBoardSynthesisProposalCard),
    reviewReport: row.review_report_json
      ? normalizeProjectBoardPmReviewReportForStore(parseProjectBoardJsonObject<unknown>(row.review_report_json, undefined))
      : undefined,
    model: row.model ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at ?? undefined,
  };
}

export function mapProjectBoardSynthesisRunRow(row: ProjectBoardSynthesisRunStoreRow): ProjectBoardSynthesisRun {
  const progressiveRecords = parseProjectBoardJsonArray<ProjectBoardSynthesisRunProgressiveRecord>(row.progressive_records_json ?? "[]").flatMap(
    normalizeProjectBoardSynthesisRunProgressiveRecord,
  );
  const progressiveSummary = summarizeProjectBoardSynthesisRunProgressiveRecords(progressiveRecords);
  const planningSnapshots = parseProjectBoardJsonArray<ProjectBoardPlanningSnapshot>(row.planning_snapshots_json ?? "[]").flatMap((snapshot) =>
    normalizeProjectBoardPlanningSnapshot(snapshot, row.updated_at),
  );
  return {
    id: row.id,
    boardId: row.board_id,
    proposalId: row.proposal_id ?? undefined,
    retryOfRunId: row.retry_of_run_id ?? undefined,
    status: row.status,
    stage: row.stage,
    model: row.model ?? undefined,
    sourceCount: row.source_count,
    includedSourceCount: row.included_source_count,
    sourceCharCount: row.source_char_count,
    promptCharCount: row.prompt_char_count ?? undefined,
    responseCharCount: row.response_char_count ?? undefined,
    cardCount: row.card_count ?? undefined,
    questionCount: row.question_count ?? undefined,
    warningCount: row.warning_count,
    error: row.error ?? undefined,
    ...(progressiveRecords.length
      ? {
          progressiveRecordCount: progressiveRecords.length,
          progressiveSummary,
          progressiveRecords,
        }
      : {}),
    ...(planningSnapshots.length ? { planningSnapshots } : {}),
    events: parseProjectBoardJsonArray<ProjectBoardSynthesisRunEvent>(row.events_json).flatMap((event) =>
      normalizeProjectBoardSynthesisRunEvent(event, row.updated_at),
    ),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function mapProjectBoardRow(input: {
  row: ProjectBoardStoreRow;
  charter?: ProjectBoardCharter;
  cards: ProjectBoardCard[];
  sources: ProjectBoardSource[];
  questions: ProjectBoardQuestion[];
  proposals: ProjectBoardSynthesisProposal[];
  synthesisRuns: ProjectBoardSynthesisRun[];
  executionArtifacts: ProjectBoardExecutionArtifact[];
  events: ProjectBoardEvent[];
  claims: NonNullable<ProjectBoardSummary["claims"]>;
}): ProjectBoardSummary {
  const { row } = input;
  return {
    id: row.id,
    projectPath: row.project_path,
    sourceThreadId: row.source_thread_id ?? undefined,
    status: row.status,
    title: row.title,
    summary: row.summary,
    charterId: row.charter_id ?? undefined,
    charter: input.charter,
    activeDraftId: row.active_draft_id ?? undefined,
    cards: input.cards,
    sources: input.sources,
    questions: input.questions,
    proposals: input.proposals,
    synthesisRuns: input.synthesisRuns,
    executionArtifacts: input.executionArtifacts,
    events: input.events,
    claims: input.claims,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardCardRow(row: ProjectBoardCardStoreRow, tasks: OrchestrationTask[] = []): ProjectBoardCard {
  const linkedTask = row.orchestration_task_id ? tasks.find((task) => task.id === row.orchestration_task_id) : undefined;
  const proofReview = row.proof_review_json
    ? mapProjectBoardCardProofReview(row.proof_review_json, normalizeProjectBoardProofFollowUpSuggestion)
    : undefined;
  const splitOutcome = row.split_outcome_json ? mapProjectBoardCardSplitOutcome(row.split_outcome_json) : undefined;
  const projectedStatus = linkedTask ? projectBoardStatusForTask(linkedTask, tasks) : row.status;
  const userTouchedFields = parseProjectBoardCardTouchedFields(row.user_touched_fields_json);
  const rawPendingPiUpdate = row.pending_pi_update_json
    ? parseProjectBoardJsonObject<ProjectBoardCardPendingPiUpdate | undefined>(row.pending_pi_update_json, undefined)
    : undefined;
  const pendingPiUpdate = rawPendingPiUpdate ? projectBoardMaterialPendingPiUpdateForRow(row, rawPendingPiUpdate) : undefined;
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    description: row.description,
    status: projectBoardCardStatusWithProofReview(projectedStatus, proofReview),
    candidateStatus: row.candidate_status ?? "ready_to_create",
    priority: row.priority ?? undefined,
    phase: row.phase ?? undefined,
    labels: parseProjectBoardStringList(row.labels_json),
    blockedBy: parseProjectBoardStringList(row.blocked_by_json),
    acceptanceCriteria: parseProjectBoardStringList(row.acceptance_criteria_json),
    testPlan: parseProjectBoardCardTestPlan(row.test_plan_json),
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    sourceRefs: parseProjectBoardStringList(row.source_refs_json),
    clarificationQuestions: parseProjectBoardStringList(row.clarification_questions_json),
    clarificationSuggestions: parseProjectBoardClarificationSuggestions(row.clarification_suggestions_json),
    clarificationAnswers: parseProjectBoardClarificationAnswers(row.clarification_answers_json),
    clarificationDecisions: parseProjectBoardClarificationDecisions(row.clarification_decisions_json, {
      clarificationQuestions: parseProjectBoardStringList(row.clarification_questions_json),
      clarificationSuggestions: parseProjectBoardClarificationSuggestions(row.clarification_suggestions_json),
      clarificationAnswers: parseProjectBoardClarificationAnswers(row.clarification_answers_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
    runFeedback: parseProjectBoardCardRunFeedback(row.run_feedback_json),
    objectiveProvenance: normalizeProjectBoardObjectiveProvenance(
      row.objective_provenance_json ? parseProjectBoardJsonObject<unknown>(row.objective_provenance_json, undefined) : undefined,
    ),
    uiMockRole: normalizeProjectBoardUiMockRole(row.ui_mock_role),
    requiresUiMockApproval: Boolean(row.requires_ui_mock_approval),
    sourceThreadId: row.source_thread_id ?? undefined,
    sourceMessageId: row.source_message_id ?? undefined,
    orchestrationTaskId: row.orchestration_task_id ?? undefined,
    executionThreadId: row.execution_thread_id ?? undefined,
    executionSessionPolicy: normalizeProjectBoardCardExecutionSessionPolicy(row.execution_session_policy),
    proofReview,
    splitOutcome,
    userTouchedFields: userTouchedFields.length > 0 ? userTouchedFields : undefined,
    userTouchedAt: row.user_touched_at ?? undefined,
    pendingPiUpdate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardCardSplitOutcome(value: string): ProjectBoardCardSplitOutcome | undefined {
  const outcome = parseProjectBoardJsonObject<ProjectBoardCardSplitOutcome | undefined>(value, undefined);
  if (!outcome || typeof outcome !== "object") return undefined;
  const statuses = new Set<ProjectBoardCardSplitOutcomeStatus>(["proposed", "approved", "rejected", "replaced", "done_via_split"]);
  if (!statuses.has(outcome.status)) return undefined;
  const source =
    outcome.source === "runtime_budget" || outcome.source === "proof_review" || outcome.source === "manual"
      ? outcome.source
      : "manual";
  return {
    status: outcome.status,
    source,
    sourceRunId: typeof outcome.sourceRunId === "string" ? outcome.sourceRunId : "",
    reason: typeof outcome.reason === "string" ? outcome.reason : "",
    partialProofSummary: typeof outcome.partialProofSummary === "string" ? outcome.partialProofSummary : "",
    completedCriteria: Array.isArray(outcome.completedCriteria)
      ? outcome.completedCriteria.filter((item): item is string => typeof item === "string")
      : [],
    remainingCriteria: Array.isArray(outcome.remainingCriteria)
      ? outcome.remainingCriteria.filter((item): item is string => typeof item === "string")
      : [],
    childCardIds: Array.isArray(outcome.childCardIds)
      ? outcome.childCardIds.filter((item): item is string => typeof item === "string")
      : [],
    maxRuntimeMs: typeof outcome.maxRuntimeMs === "number" && Number.isFinite(outcome.maxRuntimeMs) ? outcome.maxRuntimeMs : undefined,
    elapsedMs: typeof outcome.elapsedMs === "number" && Number.isFinite(outcome.elapsedMs) ? outcome.elapsedMs : undefined,
    createdAt: typeof outcome.createdAt === "string" ? outcome.createdAt : "",
    updatedAt: typeof outcome.updatedAt === "string" ? outcome.updatedAt : "",
  };
}

export function mapProjectBoardCardProofReview(
  value: string,
  normalizeFollowUpSuggestion: ProjectBoardProofFollowUpSuggestionNormalizer = () => undefined,
): ProjectBoardCardProofReview | undefined {
  const review = parseProjectBoardJsonObject<ProjectBoardCardProofReview | undefined>(value, undefined);
  if (!review || typeof review !== "object") return undefined;
  const statuses = new Set<ProjectBoardCardProofReviewStatus>(["ready_for_review", "needs_follow_up", "terminally_blocked", "retry_recommended", "done"]);
  if (!statuses.has(review.status)) return undefined;
  const followUpSuggestion = normalizeFollowUpSuggestion(review.followUpSuggestion);
  return {
    status: review.status,
    summary: typeof review.summary === "string" ? review.summary : "",
    satisfied: Array.isArray(review.satisfied) ? review.satisfied.filter((item): item is string => typeof item === "string") : [],
    missing: Array.isArray(review.missing) ? review.missing.filter((item): item is string => typeof item === "string") : [],
    followUpCardIds: Array.isArray(review.followUpCardIds)
      ? review.followUpCardIds.filter((item): item is string => typeof item === "string")
      : [],
    runId: typeof review.runId === "string" ? review.runId : "",
    reviewedAt: typeof review.reviewedAt === "string" ? review.reviewedAt : "",
    reviewer: review.reviewer === "ambient_pi" || review.reviewer === "deterministic" ? review.reviewer : undefined,
    model: typeof review.model === "string" ? review.model : undefined,
    confidence: typeof review.confidence === "number" && Number.isFinite(review.confidence) ? review.confidence : undefined,
    evidenceQuality:
      review.evidenceQuality === "strong" || review.evidenceQuality === "mixed" || review.evidenceQuality === "weak"
        ? review.evidenceQuality
        : undefined,
    recommendedAction:
      review.recommendedAction === "close" ||
      review.recommendedAction === "retry" ||
      review.recommendedAction === "follow_up" ||
      review.recommendedAction === "ask_user" ||
      review.recommendedAction === "block"
        ? review.recommendedAction
        : undefined,
    deterministicStatus: statuses.has(review.deterministicStatus as ProjectBoardCardProofReviewStatus)
      ? (review.deterministicStatus as ProjectBoardCardProofReviewStatus)
      : undefined,
    deterministicSummary: typeof review.deterministicSummary === "string" ? review.deterministicSummary : undefined,
    judgeDurationMs: typeof review.judgeDurationMs === "number" && Number.isFinite(review.judgeDurationMs) ? review.judgeDurationMs : undefined,
    ...(followUpSuggestion ? { followUpSuggestion } : {}),
  };
}

export function parseProjectBoardStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardStringList", value, error);
    return [];
  }
}

export function parseProjectBoardCardTouchedFields(value: string | null | undefined): ProjectBoardCardTouchedField[] {
  return parseProjectBoardStringList(value).filter((field): field is ProjectBoardCardTouchedField =>
    PROJECT_BOARD_CARD_TOUCHED_FIELDS.has(field as ProjectBoardCardTouchedField),
  );
}

export function parseProjectBoardCardTestPlan(value: string | null | undefined): ProjectBoardCardTestPlan {
  if (!value) return { unit: [], integration: [], visual: [], manual: [] };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { unit: [], integration: [], visual: [], manual: [] };
    const candidate = parsed as Partial<ProjectBoardCardTestPlan>;
    return normalizeProjectBoardCardTestPlan({
      unit: Array.isArray(candidate.unit) ? candidate.unit.filter((item): item is string => typeof item === "string") : [],
      integration: Array.isArray(candidate.integration) ? candidate.integration.filter((item): item is string => typeof item === "string") : [],
      visual: Array.isArray(candidate.visual) ? candidate.visual.filter((item): item is string => typeof item === "string") : [],
      manual: Array.isArray(candidate.manual) ? candidate.manual.filter((item): item is string => typeof item === "string") : [],
    });
  } catch {
    return { unit: [], integration: [], visual: [], manual: [] };
  }
}

export function normalizeProjectBoardCardRunFeedbackSource(value: unknown): ProjectBoardCardRunFeedbackSource {
  return typeof value === "string" && PROJECT_BOARD_CARD_RUN_FEEDBACK_SOURCES.has(value as ProjectBoardCardRunFeedbackSource)
    ? (value as ProjectBoardCardRunFeedbackSource)
    : "manual";
}

export function normalizeProjectBoardCardRunFeedback(
  value: ProjectBoardCardRunFeedback[] | undefined,
  fallback: ProjectBoardCardRunFeedback[] = [],
): ProjectBoardCardRunFeedback[] {
  const source = value ?? fallback;
  const feedback: ProjectBoardCardRunFeedback[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 120) : randomUUID();
    const text = typeof item.feedback === "string" ? item.feedback.trim().slice(0, 1500) : "";
    if (!text || seen.has(id)) continue;
    const sourceKind = normalizeProjectBoardCardRunFeedbackSource(item.source);
    const createdAt =
      typeof item.createdAt === "string" && item.createdAt.trim() ? item.createdAt.trim().slice(0, 80) : new Date().toISOString();
    const decisionQuestion =
      typeof item.decisionQuestion === "string" && item.decisionQuestion.trim() ? item.decisionQuestion.trim().slice(0, 500) : undefined;
    const decisionAnswer =
      typeof item.decisionAnswer === "string" && item.decisionAnswer.trim() ? item.decisionAnswer.trim().slice(0, 1500) : undefined;
    const sourceImpactEventId =
      typeof item.sourceImpactEventId === "string" && item.sourceImpactEventId.trim() ? item.sourceImpactEventId.trim().slice(0, 120) : undefined;
    const sourceImpactEventIds = Array.isArray(item.sourceImpactEventIds)
      ? [
          ...new Set(
            item.sourceImpactEventIds
              .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
              .map((id) => id.trim().slice(0, 120)),
          ),
        ].slice(0, 100)
      : undefined;
    const sourceIds = Array.isArray(item.sourceIds)
      ? [...new Set(item.sourceIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim().slice(0, 200)))].slice(0, 100)
      : undefined;
    const createdBy = typeof item.createdBy === "string" && item.createdBy.trim() ? item.createdBy.trim().slice(0, 120) : undefined;
    seen.add(id);
    feedback.push({
      id,
      feedback: text,
      source: sourceKind,
      decisionQuestion,
      decisionAnswer,
      sourceImpactEventId,
      ...(sourceImpactEventIds?.length ? { sourceImpactEventIds } : {}),
      ...(sourceIds?.length ? { sourceIds } : {}),
      createdAt,
      createdBy,
    });
  }
  // New feedback is appended at the end, so cap by keeping the newest entries —
  // keeping the first 20 would silently drop every new item once a card hits the cap.
  return feedback.slice(-20);
}

export function parseProjectBoardCardRunFeedback(value: string | null | undefined): ProjectBoardCardRunFeedback[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return normalizeProjectBoardCardRunFeedback(
      parsed.filter(
        (item): item is ProjectBoardCardRunFeedback =>
          Boolean(item) && typeof item === "object" && typeof item.feedback === "string" && typeof item.source === "string",
      ),
    );
  } catch {
    return [];
  }
}

// Corrupted persisted JSON falls back to an empty value, and the next
// read-modify-write persists that emptiness permanently — log loudly so the
// corruption is at least diagnosable from logs.
function warnCorruptProjectBoardJson(parser: string, json: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[project-board] ${parser}: corrupted persisted JSON treated as empty (${reason}): ${json.slice(0, 200)}`);
}

function parseProjectBoardJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardJsonObject", json, error);
    return fallback;
  }
}

function parseProjectBoardJsonArray<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardJsonArray", json, error);
    return [];
  }
}

function normalizeProjectBoardExecutionProof(value: Record<string, unknown> | undefined): ProjectBoardExecutionArtifactProof | undefined {
  if (!value || typeof value.summary !== "string") return undefined;
  return {
    ...value,
    summary: value.summary,
    commands: toStringArray(value.commands),
    changedFiles: toStringArray(value.changedFiles),
  } as ProjectBoardExecutionArtifactProof;
}

function normalizeProjectBoardExecutionHandoff(value: Record<string, unknown> | undefined): ProjectBoardExecutionArtifactHandoff | undefined {
  if (!value || typeof value.summary !== "string") return undefined;
  return {
    ...value,
    summary: value.summary,
    completed: toStringArray(value.completed),
    remaining: toStringArray(value.remaining),
  } as ProjectBoardExecutionArtifactHandoff;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeProjectBoardPmReviewReportForStore(value: unknown): ProjectBoardSynthesisProposal["reviewReport"] {
  try {
    return normalizeProjectBoardPmReviewReport(value);
  } catch {
    return undefined;
  }
}
