import type { OrchestrationRun } from "../../shared/workflowTypes";
import type {
  ProjectBoardCard,
  ProjectBoardCardProofEvidenceQuality,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewReviewer,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardSplitOutcome,
  ProjectBoardCardTestPlan,
  ProjectBoardProofFollowUpSuggestion,
} from "../../shared/projectBoardTypes";
import { normalizeCardTextList, normalizeUnknownProjectBoardTestPlan } from "./projectBoardCardNormalizationMappers";
import { projectBoardChangedProofPaths, projectBoardIsMeaningfulChangedPath } from "./projectBoardProofPathMappers";
import {
  type ProjectBoardTaskToolAction,
  projectBoardTaskToolActionDiagnostics,
  projectBoardTaskToolActionIntegrityIssues,
  projectBoardTaskToolActionsForScope,
  projectBoardTaskToolActionsFromProofOfWork,
  projectBoardTaskToolBrowserTraces,
  projectBoardTaskToolCompleted,
  projectBoardTaskToolManualChecks,
  projectBoardTaskToolRemaining,
  projectBoardTaskToolScreenshots,
  projectBoardTaskToolVisualChecks,
} from "./projectStoreProjectBoardFacade";

export * from "./projectBoardProofPathMappers";

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
  return (
    /\b(no|not|without|missing|lacks?|unavailable|unable)\b.{0,80}\b(visual|screenshot|browser|canvas|nonblank|viewport|rendered|playwright)\b/.test(
      proofText,
    ) ||
    /\b(visual|screenshot|browser|canvas|nonblank|viewport|rendered|playwright)\b.{0,80}\b(no|not|without|missing|lacks?|unavailable|unable|wasn't|isn't)\b/.test(
      proofText,
    )
  );
}

export function projectBoardHasNegatedManualEvidence(proofText: string): boolean {
  return (
    /\b(no|not|without|missing|lacks?|unavailable|unable)\b.{0,80}\b(manual|review|opened|inspected|playthrough|played|verified)\b/.test(
      proofText,
    ) ||
    /\b(manual|review|opened|inspected|playthrough|played|verified)\b.{0,80}\b(no|not|without|missing|lacks?|unavailable|unable|wasn't|isn't)\b/.test(
      proofText,
    )
  );
}

export function projectBoardHasAcceptanceEvidence(proofText: string): boolean {
  return /\b(acceptance|criteria|done|completed|implemented|satisf(y|ies|ied)|verified|confirmed)\b/.test(proofText);
}

export function projectBoardHasUnitEvidence(proofText: string, proof: Record<string, unknown> | undefined): boolean {
  return (
    projectBoardAfterRunHookSucceeded(proof) || /\b(unit|vitest|jest|spec|tests?|passed|pnpm test|npm test|typecheck|tsc)\b/.test(proofText)
  );
}

export function projectBoardHasIntegrationEvidence(proofText: string, proof: Record<string, unknown> | undefined): boolean {
  return (
    projectBoardAfterRunHookSucceeded(proof) ||
    /\b(integration|e2e|smoke|electron|playwright|browser|build|passed|verified)\b/.test(proofText)
  );
}

export function projectBoardHasImplementationEvidence(
  proof: Record<string, unknown> | undefined,
  _proofText: string,
  workspacePath?: string,
): boolean {
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
  return normalizeCardTextList(
    [
      ...stringsFromProjectBoardUnknownArray(proof.manualChecks),
      ...projectBoardTaskToolManualChecks(projectBoardTaskToolActionsFromProofOfWork(proof)),
    ],
    40,
  );
}

export function projectBoardSatisfiedProofItems(
  card: ProjectBoardCard,
  proofText: string,
  proof: Record<string, unknown> | undefined,
  workspacePath?: string,
): string[] {
  const satisfied: string[] = [];
  if (projectBoardCardRequiresImplementationEvidence(card) && projectBoardHasImplementationEvidence(proof, proofText, workspacePath)) {
    satisfied.push("Implementation evidence recorded.");
  }
  if (card.acceptanceCriteria.length > 0 && projectBoardHasAcceptanceEvidence(proofText))
    satisfied.push("Acceptance criteria discussed in proof.");
  if (card.testPlan.unit.length > 0 && projectBoardHasUnitEvidence(proofText, proof)) satisfied.push("Unit proof recorded.");
  if (card.testPlan.integration.length > 0 && projectBoardHasIntegrationEvidence(proofText, proof))
    satisfied.push("Integration proof recorded.");
  if (card.testPlan.visual.length > 0 && projectBoardHasVisualEvidence(proofText, proof)) satisfied.push("Visual/browser proof recorded.");
  if (card.testPlan.manual.length > 0 && projectBoardHasManualEvidence(proofText, proof)) satisfied.push("Manual review proof recorded.");
  return satisfied;
}

export function projectBoardMissingProofItems(
  card: ProjectBoardCard,
  proofText: string,
  proof: Record<string, unknown> | undefined,
  workspacePath?: string,
): string[] {
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
  if (card.testPlan.unit.length > 0 && !projectBoardHasUnitEvidence(proofText, proof))
    missing.push(`Unit proof missing: ${card.testPlan.unit[0]}`);
  if (card.testPlan.integration.length > 0 && !projectBoardHasIntegrationEvidence(proofText, proof)) {
    missing.push(`Integration proof missing: ${card.testPlan.integration[0]}`);
  }
  if (card.testPlan.visual.length > 0 && !projectBoardHasVisualEvidence(proofText, proof))
    missing.push(`Visual proof missing: ${card.testPlan.visual[0]}`);
  if (card.testPlan.manual.length > 0 && !projectBoardHasManualEvidence(proofText, proof))
    missing.push(`Manual proof missing: ${card.testPlan.manual[0]}`);
  return missing;
}

function projectBoardCardRequiresImplementationEvidence(card: Pick<ProjectBoardCard, "candidateStatus" | "phase" | "sourceKind">): boolean {
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
      summary: terminalBlocker
        ? "The latest run appears terminally blocked."
        : `The latest run ended as ${run.status}; retry or inspect before closing.`,
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
  if (explicitFollowUps.length > 0)
    missing.push(`${explicitFollowUps.length} run follow-up${explicitFollowUps.length === 1 ? "" : "s"} proposed before closure.`);
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
    summary:
      hasDurableTaskCompletion && run.status !== "completed"
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
      missing: normalizeCardTextList(
        [reason, "Durable task_complete action was not recorded before the runtime budget stopped the run.", ...review.missing],
        30,
      ),
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

export function projectBoardRuntimeBudgetCompletedCriteria(
  proof: Record<string, unknown> | undefined,
  satisfied: string[] = [],
  workspacePath?: string,
): string[] {
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
    maxRuntimeMs:
      typeof runtimeBudget.maxRuntimeMs === "number" && Number.isFinite(runtimeBudget.maxRuntimeMs)
        ? runtimeBudget.maxRuntimeMs
        : undefined,
    elapsedMs:
      typeof runtimeBudget.elapsedMs === "number" && Number.isFinite(runtimeBudget.elapsedMs) ? runtimeBudget.elapsedMs : undefined,
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
  return [...byId.values()].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.actionId.localeCompare(right.actionId),
  );
}

export function projectBoardRuntimeBudgetReason(runtimeBudget: Record<string, unknown>): string {
  const nextAction =
    typeof runtimeBudget.recommendedNextAction === "string" && runtimeBudget.recommendedNextAction.trim()
      ? runtimeBudget.recommendedNextAction.trim()
      : "Review partial workspace changes and retry, split, or create a narrower follow-up card.";
  const maxRuntime =
    typeof runtimeBudget.maxRuntimeMs === "number" && Number.isFinite(runtimeBudget.maxRuntimeMs)
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
      const description =
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : "Follow-up proposed by a completed project board run.";
      const acceptanceCriteria = Array.isArray(record.acceptanceCriteria)
        ? normalizeCardTextList(
            record.acceptanceCriteria.map((entry) => String(entry)),
            30,
          )
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
  const fragments = [...text.split(/\r?\n/), ...normalized.split(/(?<=[.!?])\s+/)]
    .map((item) => item.replace(/^[-*>\s]+/, "").trim())
    .filter(Boolean);
  const match =
    fragments.find((fragment) => projectBoardTerminalBlockerPattern().test(fragment)) ??
    (projectBoardTerminalBlockerPattern().test(normalized) ? normalized : undefined);
  return match ? match.slice(0, 700) : undefined;
}

function projectBoardTerminalBlockerPattern(): RegExp {
  return /\b(terminal blocker|unrecoverable|cannot continue|can't continue|needs? (an? )?(api key|credential|password|access|decision|user|human|clarification|permission)|missing (api key|credential|password|access|secret)|requires? (a )?(user|human|product|scope) decision|blocked (on|by) (missing )?(api key|credential|password|access|secret|user decision|human decision|product decision)|waiting on (user|human|credential|access|api key|product decision|scope decision))\b/i;
}
