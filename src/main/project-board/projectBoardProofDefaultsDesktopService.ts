import { projectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import type {
  ProjectBoardCard,
  ProjectBoardSource,
  ProjectSummary,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  RerunProjectBoardProofInput,
  SuggestProjectBoardClarificationDefaultsInput,
  SuggestProjectBoardProofInput,
} from "../../shared/projectBoardTypes";
import {
  ambientChatCompletionTransportTimeoutsFromEnv,
  ambientRetryPolicyFromSettings,
} from "./projectBoardAmbientFacade";
import {
  AmbientProjectBoardClarificationDefaultProvider,
  deterministicProjectBoardClarificationDefaultSuggestionForTarget,
  projectBoardClarificationDefaultSuggestionTargets,
} from "./projectBoardClarificationDefaultProvider";
import {
  AmbientProjectBoardDecisionDraftRefreshProvider,
  deterministicProjectBoardDecisionDraftRefreshSuggestionForCard,
} from "./projectBoardDecisionDraftRefreshProvider";
import { getAmbientProviderStatus } from "./projectBoardProviderFacade";
import {
  AmbientProjectBoardProofJudgeProvider,
  type AmbientProjectBoardProofJudgmentProgress,
  type ProjectBoardProofJudgmentContext,
} from "./projectBoardProofJudgeProvider";
import {
  AmbientProjectBoardProofSuggestionProvider,
  deterministicProjectBoardProofSuggestionForCard,
} from "./projectBoardProofSuggestionProvider";
import { ProjectStore } from "./projectBoardProjectStoreFacade";
import {
  AmbientProjectBoardSourceDraftRefreshProvider,
  deterministicProjectBoardSourceDraftRefreshSuggestionForCard,
} from "./projectBoardSourceDraftRefreshProvider";

export interface ProjectBoardProofDefaultsDesktopServiceDependencies {
  store(): ProjectStore;
  emitDesktopState(): void;
}

let projectBoardProofDefaultsDesktopServices: ProjectBoardProofDefaultsDesktopServiceDependencies | undefined;

export function configureProjectBoardProofDefaultsDesktopService(
  dependencies: ProjectBoardProofDefaultsDesktopServiceDependencies,
): void {
  projectBoardProofDefaultsDesktopServices = dependencies;
}

function services(): ProjectBoardProofDefaultsDesktopServiceDependencies {
  if (!projectBoardProofDefaultsDesktopServices) {
    throw new Error("Project Board proof/defaults desktop service has not been configured.");
  }
  return projectBoardProofDefaultsDesktopServices;
}

function defaultProjectBoardProofDefaultsStore(): ProjectStore {
  return services().store();
}

function emitDesktopState(): void {
  services().emitDesktopState();
}

function ambientRetryPolicyFromCurrentSettings(targetStore: ProjectStore = defaultProjectBoardProofDefaultsStore()) {
  const modelRuntimeSettings = targetStore.getModelRuntimeSettings();
  return modelRuntimeSettings.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings }) : undefined;
}

function recordProjectBoardProofJudgmentRetryActivity(
  context: ProjectBoardProofJudgmentContext,
  progress: AmbientProjectBoardProofJudgmentProgress,
  targetStore: ProjectStore = defaultProjectBoardProofDefaultsStore(),
): boolean {
  if (!progress.transientRetry) return false;
  const retryAttempt = progress.retryAttempt ?? 0;
  const maxRetries = progress.maxRetries ?? 0;
  const retryDelayMs = progress.retryDelayMs ?? 0;
  const retryPosition =
    retryAttempt > 0 && maxRetries > 0 ? `attempt ${retryAttempt}/${maxRetries}` : "the next available attempt";
  const retryDelay = retryDelayMs > 0 ? ` after ${retryDelayMs.toLocaleString()}ms` : "";
  targetStore.recordProjectBoardCardRunProgressEvent({
    boardId: context.card.boardId,
    cardId: context.card.id,
    runId: context.run.id,
    title: "Retrying Pi proof judgment",
    summary: `Transient Ambient/Pi proof judgment failure; retrying ${retryPosition}${retryDelay}.`,
    metadata: {
      transientRetry: true,
      aggressiveRetries: progress.aggressiveRetries === true,
      retryAttempt: progress.retryAttempt,
      maxRetries: progress.maxRetries,
      retryDelayMs: progress.retryDelayMs,
      error: progress.retryError,
      fallbackToNonStream: progress.fallbackToNonStream === true,
      responseCharCount: progress.responseCharCount,
      requestDurationMs: progress.requestDurationMs,
    },
  });
  return true;
}

const activeProjectBoardProofJudgmentsByStore = new WeakMap<
  ProjectStore,
  Map<string, { controller: AbortController; promise: Promise<void> }>
>();

function activeProjectBoardProofJudgmentsForStore(
  targetStore: ProjectStore,
): Map<string, { controller: AbortController; promise: Promise<void> }> {
  let active = activeProjectBoardProofJudgmentsByStore.get(targetStore);
  if (!active) {
    active = new Map();
    activeProjectBoardProofJudgmentsByStore.set(targetStore, active);
  }
  return active;
}

export async function reviewFinishedProjectBoardRun(
  runId: string,
  targetStoreOrOptions: ProjectStore | { restart?: boolean; reason?: string } = defaultProjectBoardProofDefaultsStore(),
  emitUpdate: () => void = emitDesktopState,
  options: { restart?: boolean; reason?: string } = {},
): Promise<void> {
  const targetStore = targetStoreOrOptions instanceof ProjectStore ? targetStoreOrOptions : defaultProjectBoardProofDefaultsStore();
  const proofOptions = targetStoreOrOptions instanceof ProjectStore ? options : targetStoreOrOptions;
  const activeJudgments = activeProjectBoardProofJudgmentsForStore(targetStore);
  const active = activeJudgments.get(runId);
  if (active) {
    if (!proofOptions.restart) return active.promise;
    active.controller.abort(new Error("Proof judgment was restarted for this run."));
  }
  const controller = new AbortController();
  const promise = reviewFinishedProjectBoardRunOnce(runId, targetStore, emitUpdate, { ...proofOptions, controller }).finally(() => {
    if (activeJudgments.get(runId)?.controller === controller) activeJudgments.delete(runId);
  });
  activeJudgments.set(runId, { controller, promise });
  return promise;
}

async function reviewFinishedProjectBoardRunOnce(
  runId: string,
  targetStore: ProjectStore,
  emitUpdate: () => void,
  options: { controller: AbortController; reason?: string },
): Promise<void> {
  const context = targetStore.getProjectBoardProofReviewContextForRun(runId);
  if (!context) return;

  const model = targetStore.getDefaultSettings().model;
  const fallback = context.deterministicReview;
  const requireCurrentReview = Boolean(context.card.proofReview?.runId === runId);
  if (!targetStore.isProjectBoardProofReviewRunCurrent(runId, requireCurrentReview)) return;
  try {
    const result = await new AmbientProjectBoardProofJudgeProvider({
      model,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      signal: options.controller.signal,
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).judge({
      ...context,
      onProgress: (progress) => {
        if (requireCurrentReview && !targetStore.isProjectBoardProofReviewRunCurrent(runId, true)) {
          options.controller.abort(new Error("Proof judgment was superseded by a newer card state."));
          return;
        }
        if (recordProjectBoardProofJudgmentRetryActivity(context, progress, targetStore)) emitUpdate();
      },
    });
    targetStore.applyProjectBoardCardProofReview({
      runId,
      review: {
        status: result.judgment.status,
        summary: result.judgment.summary,
        satisfied: result.judgment.satisfied,
        missing: result.judgment.missing,
        followUpCardIds: [],
        runId,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model,
        confidence: result.judgment.confidence,
        evidenceQuality: result.judgment.evidenceQuality,
        recommendedAction: result.judgment.recommendedAction,
        deterministicStatus: fallback.status,
        deterministicSummary: fallback.summary,
        judgeDurationMs: result.telemetry.requestDurationMs,
        followUpSuggestion: result.judgment.followUpSuggestion,
      },
      requireCurrentReview,
    });
  } catch (error) {
    if (options.controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    targetStore.applyProjectBoardCardProofReview({
      runId,
      review: {
        ...fallback,
        reviewer: "deterministic",
        summary: `${fallback.summary} Ambient/Pi proof judgment was unavailable, so deterministic proof review was used. ${message}`.slice(0, 1_000),
      },
      requireCurrentReview,
    });
  }
  emitUpdate();
}

export async function rerunProjectBoardProof(
  input: RerunProjectBoardProofInput,
  targetStore: ProjectStore = defaultProjectBoardProofDefaultsStore(),
  emitUpdate: () => void = emitDesktopState,
): Promise<void> {
  const card = targetStore.getProjectBoardCard(input.cardId);
  if (!card.orchestrationTaskId) throw new Error("Automatic proof can only be re-run for ticketized project-board cards.");
  const runs = targetStore.listOrchestrationRuns(200).filter((run) => run.taskId === card.orchestrationTaskId);
  const latestRun = runs[0];
  if (!latestRun) throw new Error("No Local Task run is available to re-run proof against.");
  if (["claimed", "prepared", "preparing", "running", "retry_queued"].includes(latestRun.status)) {
    throw new Error("Wait for the current Local Task run to finish before re-running automatic proof.");
  }
  if (!latestRun.proofOfWork) throw new Error("The latest Local Task run has no proof packet to judge.");
  const reason = input.reason?.trim();
  targetStore.recordProjectBoardCardRunProgressEvent({
    boardId: card.boardId,
    cardId: card.id,
    runId: latestRun.id,
    title: "Re-running Pi proof judgment",
    summary: reason
      ? `Automatic PM proof judgment was re-run. Reason: ${reason}`
      : "Automatic PM proof judgment was re-run for the latest proof packet.",
    metadata: {
      cardId: card.id,
      runId: latestRun.id,
      reason,
      modelCallRequired: true,
    },
  });
  emitUpdate();
  await reviewFinishedProjectBoardRun(latestRun.id, targetStore, emitUpdate, { restart: true, reason });
}

export async function suggestProjectBoardProof(
  input: SuggestProjectBoardProofInput,
  targetStore: ProjectStore = defaultProjectBoardProofDefaultsStore(),
): Promise<void> {
  const board = targetStore.getProjectBoard(input.boardId);
  if (!board) throw new Error(`Project board not found: ${input.boardId}`);
  const explicitCardIds = input.cardIds?.length ? [...new Set(input.cardIds)] : undefined;
  const requestedCardIds =
    explicitCardIds ??
    board.cards
      .filter((card) => card.status !== "archived" && card.candidateStatus !== "duplicate" && card.candidateStatus !== "rejected" && card.candidateStatus !== "evidence")
      .filter((card) => projectBoardProofItemCount(card) === 0)
      .map((card) => card.id);
  const targetCardIds = requestedCardIds.slice(0, 12);
  const draftTargets = board.cards
    .filter((card) => targetCardIds.includes(card.id))
    .filter((card) => card.status === "draft" && !card.orchestrationTaskId)
    .filter((card) => card.candidateStatus !== "duplicate" && card.candidateStatus !== "rejected" && card.candidateStatus !== "evidence")
    .filter((card) => projectBoardProofItemCount(card) === 0)
    .slice(0, 12);

  if (targetCardIds.length === 0 || draftTargets.length === 0) {
    targetStore.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: [],
    });
    return;
  }

  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const requestStartedAt = Date.now();
  try {
    const result = await new AmbientProjectBoardProofSuggestionProvider({
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).suggest({
      boardTitle: board.title,
      charter: board.charter,
      cards: draftTargets,
    });
    targetStore.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: result.suggestions,
      model: providerStatus.model,
      telemetry: result.telemetry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: draftTargets.map(deterministicProjectBoardProofSuggestionForCard),
      model: providerStatus.model,
      telemetry: {
        promptCharCount: 0,
        responseCharCount: 0,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      fallbackUsed: true,
      providerError: message,
    });
  }
}

export async function suggestProjectBoardClarificationDefaults(
  input: SuggestProjectBoardClarificationDefaultsInput,
  targetStore: ProjectStore = defaultProjectBoardProofDefaultsStore(),
): Promise<void> {
  const board = targetStore.getProjectBoard(input.boardId);
  if (!board) throw new Error(`Project board not found: ${input.boardId}`);
  const explicitCardIds = input.cardIds?.length ? [...new Set(input.cardIds)] : undefined;
  const targets = projectBoardClarificationDefaultSuggestionTargets(board.cards, {
    cardIds: explicitCardIds,
    limit: 12,
  });
  const targetCardIds = [...new Set((explicitCardIds ?? targets.map((target) => target.cardId)).filter(Boolean))].slice(0, 50);

  if (targets.length === 0) {
    targetStore.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: [],
    });
    return;
  }

  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const requestStartedAt = Date.now();
  try {
    const result = await new AmbientProjectBoardClarificationDefaultProvider({
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).suggest({
      boardTitle: board.title,
      charter: board.charter,
      targets,
    });
    targetStore.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: result.suggestions,
      model: providerStatus.model,
      telemetry: result.telemetry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds,
      suggestions: targets.map(deterministicProjectBoardClarificationDefaultSuggestionForTarget),
      model: providerStatus.model,
      telemetry: {
        promptCharCount: 0,
        responseCharCount: 0,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      fallbackUsed: true,
      providerError: message,
    });
  }
}

export async function regenerateProjectBoardDecisionDrafts(
  input: RegenerateProjectBoardDecisionDraftsInput,
  targetStore: ProjectStore = defaultProjectBoardProofDefaultsStore(),
): Promise<void> {
  const current = targetStore.getProjectBoardCard(input.cardId);
  if (current.status !== "draft" || current.orchestrationTaskId) {
    throw new Error("Decision draft Pi refresh must start from a draft clarification card before ticketization.");
  }
  const board = targetStore.getProjectBoard(current.boardId);
  if (!board) throw new Error(`Project board not found: ${current.boardId}`);
  const targetCards = projectBoardDecisionDraftRefreshTargets(board, input).slice(0, 8);
  if (targetCards.length === 0) {
    targetStore.stageProjectBoardDecisionDraftPiUpdates({
      ...input,
      suggestions: [],
      fallbackUsed: true,
      providerError: "No affected draft cards matched this decision.",
      telemetry: { promptCharCount: 0, responseCharCount: 0, requestDurationMs: 0 },
    });
    return;
  }

  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const requestStartedAt = Date.now();
  try {
    const result = await new AmbientProjectBoardDecisionDraftRefreshProvider({
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).refresh({
      boardTitle: board.title,
      charter: board.charter,
      question: input.question,
      answer: input.answer,
      cards: targetCards,
    });
    targetStore.stageProjectBoardDecisionDraftPiUpdates({
      ...input,
      suggestions: result.suggestions,
      model: providerStatus.model,
      telemetry: result.telemetry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.stageProjectBoardDecisionDraftPiUpdates({
      ...input,
      suggestions: targetCards.map((card) => deterministicProjectBoardDecisionDraftRefreshSuggestionForCard(card, input)),
      model: providerStatus.model,
      telemetry: {
        promptCharCount: 0,
        responseCharCount: 0,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      fallbackUsed: true,
      providerError: message,
    });
  }
}

function projectBoardDecisionDraftRefreshTargets(
  board: NonNullable<ProjectSummary["board"]>,
  input: RegenerateProjectBoardDecisionDraftsInput,
): ProjectBoardCard[] {
  const impact = projectBoardDecisionImpactPreview(board, {
    question: input.question,
    answer: input.answer,
    answeredCardId: input.cardId,
  });
  const targetIds = new Set(
    impact.cards
      .filter((card) => card.state === "draft_unblocked" || card.state === "draft_still_blocked" || card.state === "duplicate_hidden")
      .map((card) => card.cardId),
  );
  targetIds.add(input.cardId);
  return board.cards
    .filter((card) => targetIds.has(card.id))
    .filter((card) => card.status === "draft" && !card.orchestrationTaskId);
}

export async function regenerateProjectBoardSourceDrafts(
  input: RegenerateProjectBoardSourceDraftsInput,
  targetStore: ProjectStore = defaultProjectBoardProofDefaultsStore(),
): Promise<void> {
  const board = targetStore.getProjectBoard(input.boardId);
  if (!board) throw new Error(`Project board not found: ${input.boardId}`);
  const context = projectBoardSourceDraftRefreshContext(board, input);
  const targetCards = context.targetCards.slice(0, 8);
  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const requestStartedAt = Date.now();

  if (targetCards.length === 0) {
    targetStore.stageProjectBoardSourceDraftPiUpdates({
      ...input,
      suggestions: [],
      model: providerStatus.model,
      telemetry: { promptCharCount: 0, responseCharCount: 0, requestDurationMs: 0 },
      fallbackUsed: true,
      providerError: "No affected draft cards matched this source impact.",
    });
    return;
  }

  try {
    const result = await new AmbientProjectBoardSourceDraftRefreshProvider({
      model: providerStatus.model,
      baseUrl: providerStatus.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).refresh({
      boardTitle: board.title,
      charter: board.charter,
      sources: context.sources,
      sourceChangeSummary: context.sourceChangeSummary,
      cards: targetCards,
    });
    targetStore.stageProjectBoardSourceDraftPiUpdates({
      ...input,
      suggestions: result.suggestions,
      model: providerStatus.model,
      telemetry: result.telemetry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.stageProjectBoardSourceDraftPiUpdates({
      ...input,
      suggestions: targetCards.map((card) =>
        deterministicProjectBoardSourceDraftRefreshSuggestionForCard(card, { sourceChangeSummary: context.sourceChangeSummary }),
      ),
      model: providerStatus.model,
      telemetry: {
        promptCharCount: 0,
        responseCharCount: 0,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      fallbackUsed: true,
      providerError: message,
    });
  }
}

function projectBoardSourceDraftRefreshContext(
  board: NonNullable<ProjectSummary["board"]>,
  input: RegenerateProjectBoardSourceDraftsInput,
): { targetCards: ProjectBoardCard[]; sources: ProjectBoardSource[]; sourceChangeSummary: string } {
  const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
  const records: Array<{
    eventId?: string;
    sourceId: string;
    groupSourceIds: string[];
    affectedDraftCardIds: string[];
    detail?: string;
    recommendedAction?: string;
    selectedObservationCount?: number;
  }> = [];
  const seenKeys = new Set<string>();
  for (const event of board.events ?? []) {
    if (event.kind !== "source_updated") continue;
    const impact = (event.metadata as {
      sourceImpact?: {
        sourceId?: unknown;
        groupSourceIds?: unknown;
        affectedDraftCardIds?: unknown;
        targetedRefreshOptional?: unknown;
        detail?: unknown;
        recommendedAction?: unknown;
        selectedObservationCount?: unknown;
      };
    }).sourceImpact;
    if (impact?.targetedRefreshOptional !== true || typeof impact.sourceId !== "string") continue;
    const groupSourceIds = Array.isArray(impact.groupSourceIds)
      ? impact.groupSourceIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    if (input.sourceImpactEventId && event.id !== input.sourceImpactEventId) continue;
    if (selectedSourceIds.size > 0 && ![impact.sourceId, ...groupSourceIds].some((id) => selectedSourceIds.has(id))) continue;
    const affectedDraftCardIds = Array.isArray(impact.affectedDraftCardIds)
      ? impact.affectedDraftCardIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    const key = (groupSourceIds.length > 0 ? groupSourceIds : [impact.sourceId]).slice().sort().join("|");
    if (!input.sourceImpactEventId && seenKeys.has(key)) continue;
    seenKeys.add(key);
    records.push({
      eventId: event.id,
      sourceId: impact.sourceId,
      groupSourceIds,
      affectedDraftCardIds,
      detail: typeof impact.detail === "string" ? impact.detail : undefined,
      recommendedAction: typeof impact.recommendedAction === "string" ? impact.recommendedAction : undefined,
      selectedObservationCount: typeof impact.selectedObservationCount === "number" ? impact.selectedObservationCount : undefined,
    });
  }

  const sourceIds = records.length > 0
    ? [...new Set(records.flatMap((record) => record.groupSourceIds.length > 0 ? record.groupSourceIds : [record.sourceId]))]
    : [...selectedSourceIds];
  const affectedDraftCardIds = records.length > 0
    ? new Set(records.flatMap((record) => record.affectedDraftCardIds))
    : new Set<string>();
  const sources = board.sources.filter((source) => sourceIds.includes(source.id));
  const targetCards = board.cards
    .filter((card) => card.status === "draft" && !card.orchestrationTaskId)
    .filter((card) => {
      if (affectedDraftCardIds.size > 0) return affectedDraftCardIds.has(card.id);
      if (sourceIds.length === 0) return false;
      return sourceIds.some((sourceId) => card.sourceRefs?.includes(sourceId) || card.sourceId === sourceId);
    });
  const sourceLabels = sources.slice(0, 6).map((source) => {
    const role = source.authorityRole ?? (source.includeInSynthesis ? "context" : "ignored");
    return `${source.title} (${role}${source.includeInSynthesis ? ", included" : ", excluded"})`;
  });
  const sourceChangeSummary = [
    records.map((record) => record.detail).filter(Boolean).join(" "),
    sourceLabels.length > 0 ? `Impacted sources: ${sourceLabels.join("; ")}.` : "",
    records.length > 0
      ? `Source-impact events: ${records.map((record) => record.eventId).filter(Boolean).join(", ") || "direct source selection"}.`
      : "Direct selected-source refresh.",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    targetCards,
    sources,
    sourceChangeSummary: sourceChangeSummary || "Source authority changed for selected source context.",
  };
}

function projectBoardProofItemCount(card: ProjectBoardCard): number {
  return card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length;
}
