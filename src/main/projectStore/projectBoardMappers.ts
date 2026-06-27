import { randomUUID } from "node:crypto";

import { projectBoardProofPolicyRequiresProofSpec } from "../../shared/projectBoardProofImpact";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardRunFeedback,
  ProjectBoardCardStatus,
  ProjectBoardCardTouchedField,
  ProjectBoardProofFollowUpSuggestion,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";

export type { OrchestrationTask } from "../../shared/workflowTypes";
export type {
  ProjectBoardCard,
  ProjectBoardCharter,
  ProjectBoardEvent,
  ProjectBoardExecutionArtifact,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSummary,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisRun,
} from "../../shared/projectBoardTypes";

import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import { parseProjectBoardCardTouchedFields, parseProjectBoardStringList } from "./projectBoardJsonMappers";
import { normalizeProjectBoardCardRunFeedback } from "./projectBoardCardRunFeedbackMappers";
import { normalizeTaskReferences, projectBoardCardMatchesRef } from "./projectBoardCardReferenceMappers";
import type { ProjectBoardRunFollowUpInsertOptions } from "./projectBoardProofMappers";
import {
  mapProjectBoardCardProofReview,
  normalizeProjectBoardProofFollowUpSuggestion,
  type ProjectBoardCardStoreRow,
} from "./projectBoardRowMappers";
export * from "./projectBoardArtifactMappers";
export * from "./projectBoardCardNormalizationMappers";
export * from "./projectBoardCardReferenceMappers";
export * from "./projectBoardCardRunFeedbackMappers";
export * from "./projectBoardClarificationMappers";
export * from "./projectBoardJsonMappers";
export * from "./projectBoardPlanningSnapshotMappers";
export * from "./projectBoardProofMappers";
export * from "./projectBoardRowMappers";
export * from "./projectBoardSourceMappers";
export * from "./projectBoardSynthesisCardMappers";
export * from "./projectBoardTaskPlanningMappers";

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

export function projectBoardClosedParentForRunFollowUp(
  card: ProjectBoardCard,
  boardCards: ProjectBoardCard[],
): ProjectBoardCard | undefined {
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
    feedback:
      `UX mock rejected. ${details.length > 0 ? details.join(" ") : "Keep downstream UI implementation blocked until a revised mock is approved."}`.slice(
        0,
        1500,
      ),
    source: "proof_review",
    decisionQuestion: "Why was this UX mock rejected?",
    decisionAnswer: reason || previousReview?.summary || "UX mock rejected by user PM decision.",
    createdAt: now,
    createdBy: "ambient-desktop",
  };
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
