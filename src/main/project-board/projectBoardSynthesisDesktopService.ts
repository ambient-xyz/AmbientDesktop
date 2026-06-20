import { dirname } from "node:path";
import type { DesktopState } from "../../shared/desktopTypes";
import {
  assertProjectBoardCardGenerationAllowed,
  assertProjectBoardCharterReviewAllowed,
} from "../../shared/projectBoardSynthesisGate";
import {
  DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  projectBoardSynthesisOutputCapRecovery,
  projectBoardSynthesisPartialStatus,
} from "../../shared/projectBoardSynthesisRecovery";
import type {
  PauseProjectBoardSynthesisInput,
  ProjectBoardCharterProjectSummary,
  ProjectBoardPmReviewReport,
  ProjectBoardSource,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunStage,
  ProjectSummary,
  RefineProjectBoardSynthesisInput,
  RefreshProjectBoardSourcesInput,
  RetryProjectBoardSynthesisInput,
  SuggestProjectBoardKickoffDefaultsInput,
} from "../../shared/projectBoardTypes";
import {
  ambientChatCompletionTransportTimeoutsFromEnv,
  ambientRetryPolicyFromSettings,
} from "./projectBoardAmbientFacade";
import { getAmbientProviderStatus } from "./projectBoardProviderFacade";
import { ProjectStore } from "./projectBoardProjectStoreFacade";
import {
  AmbientProjectBoardCharterSummaryProvider,
  type AmbientProjectBoardCharterSummaryResult,
} from "./projectBoardCharterSummaryProvider";
import {
  projectBoardConsolidationCandidates,
  runProjectBoardCandidateConsolidation,
} from "./projectBoardCandidateConsolidation";
import { recordProjectBoardDirectHelperRetryActivity } from "./projectBoardDirectHelperRetryActivity";
import {
  projectBoardSemanticIdleDogfoodFastRetryEnabled,
  seedProjectBoardSemanticIdleDogfoodRetry,
} from "./projectBoardDogfoodDesktopService";
import { getProjectBoardGitSyncStatus } from "./projectBoardGitSync";
import {
  AmbientProjectBoardKickoffDefaultProvider,
  buildProjectBoardKickoffContextBrief,
  projectBoardKickoffDefaultSuggestionTargets,
} from "./projectBoardKickoffDefaultProvider";
import { createProjectBoardPlannerWorkspace, readProjectBoardPlannerWorkspaceRecordsFromRoot } from "./projectBoardPlannerWorkspace";
import { projectBoardPlannerContinuationForRetry, type ProjectBoardPlannerBatchContinuation } from "./projectBoardPlannerContinuation";
import {
  projectBoardProgressiveRecordsFromDraft,
  projectBoardSynthesisDraftFromProgressiveRecords,
} from "./projectBoardProgressivePlanning";
import { readAmbientApiKey } from "./projectBoardSecurityFacade";
import {
  annotateProjectBoardDraftWithObjectiveProvenance,
  annotateProjectBoardProgressiveRecordsWithObjectiveProvenance,
  deterministicProjectBoardSourceElaborationDraft,
  projectBoardSourceScopeAnswersForRefinement,
  selectProjectBoardSynthesisSources,
} from "./projectBoardSourceElaboration";
import {
  projectBoardSourceDeterministicAuthorityLocked,
  projectBoardSourceIncludedInSynthesis,
} from "./projectBoardSourceIdentity";
import {
  AmbientProjectBoardSourceClassifierProvider,
  type AmbientProjectBoardSourceBatchedClassificationResult,
} from "./projectBoardSourceClassifierProvider";
import { scanProjectBoardSources } from "./projectBoardSources";
import {
  projectBoardPmReviewGitContextFromStatus,
  projectBoardSynthesisDraftFromProposal,
  synthesizeProjectBoardDraft,
  type ProjectBoardPmReviewGitContext,
  type ProjectBoardSynthesisDraft,
  type ProjectBoardSynthesisRefinementAnswer,
} from "./projectBoardSynthesis";
import {
  AmbientProjectBoardSynthesisProvider,
  type AmbientProjectBoardSynthesisProgress,
  type AmbientProjectBoardSynthesisProgressiveBatch,
  type ProjectBoardSynthesisReasoning,
} from "./projectBoardSynthesisProvider";
import { projectBoardShouldUseSectionedPlanningForWorkflow } from "./projectBoardWorkflowPlanningDepth";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";

export interface ProjectBoardSynthesisRuntimeHost {
  store: ProjectStore;
}

export interface ProjectBoardSynthesisDesktopServiceDependencies {
  store(): ProjectStore;
  emitProjectBoardState(targetStore: ProjectStore, host?: ProjectBoardSynthesisRuntimeHost): void;
  emitProjectStateIfActive(host: ProjectBoardSynthesisRuntimeHost): void;
  readStateForProjectHostAction(host: ProjectBoardSynthesisRuntimeHost): DesktopState;
}

let projectBoardSynthesisDesktopServices: ProjectBoardSynthesisDesktopServiceDependencies | undefined;

export function configureProjectBoardSynthesisDesktopService(dependencies: ProjectBoardSynthesisDesktopServiceDependencies): void {
  projectBoardSynthesisDesktopServices = dependencies;
}

function services(): ProjectBoardSynthesisDesktopServiceDependencies {
  if (!projectBoardSynthesisDesktopServices) throw new Error("Project Board synthesis desktop service has not been configured.");
  return projectBoardSynthesisDesktopServices;
}

function defaultProjectBoardSynthesisStore(): ProjectStore {
  return services().store();
}

function emitProjectBoardState(targetStore: ProjectStore = defaultProjectBoardSynthesisStore(), host?: ProjectBoardSynthesisRuntimeHost): void {
  services().emitProjectBoardState(targetStore, host);
}

function emitProjectStateIfActive(host: ProjectBoardSynthesisRuntimeHost): void {
  services().emitProjectStateIfActive(host);
}

function readStateForProjectHostAction(host: ProjectBoardSynthesisRuntimeHost): DesktopState {
  return services().readStateForProjectHostAction(host);
}

function ambientRetryPolicyFromCurrentSettings(targetStore: ProjectStore = defaultProjectBoardSynthesisStore()) {
  const modelRuntimeSettings = targetStore.getModelRuntimeSettings();
  return modelRuntimeSettings.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings }) : undefined;
}

const projectBoardSynthesisPauseRequests = new Set<string>();
const projectBoardSynthesisAbortControllers = new Map<string, AbortController>();
const PROJECT_BOARD_SYNTHESIS_STALE_MS = DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS;

function isProjectBoardSynthesisPauseRequested(runId: string, targetStore: ProjectStore = defaultProjectBoardSynthesisStore()): boolean {
  return projectBoardSynthesisPauseRequests.has(runId) || targetStore.getProjectBoardSynthesisRun(runId)?.status === "pause_requested";
}

function abortProjectBoardSynthesisForPause(runId: string, reason: string, targetStore: ProjectStore = defaultProjectBoardSynthesisStore()): boolean {
  if (!isProjectBoardSynthesisPauseRequested(runId, targetStore)) return false;
  const controller = projectBoardSynthesisAbortControllers.get(runId);
  if (!controller || controller.signal.aborted) return true;
  controller.abort(new Error(reason));
  return true;
}

export function pauseProjectBoardSynthesisForProjectHost(host: ProjectBoardSynthesisRuntimeHost, input: PauseProjectBoardSynthesisInput): void {
  const targetStore = host.store;
  const run = targetStore.requestProjectBoardSynthesisRunPause({
    boardId: input.boardId,
    runId: input.runId,
    reason: input.reason,
  });
  if (run.status !== "paused" && projectBoardSynthesisAbortControllers.has(input.runId)) {
    projectBoardSynthesisPauseRequests.add(input.runId);
    abortProjectBoardSynthesisForPause(input.runId, input.reason?.trim() || "Project-board planning pause requested.", targetStore);
  } else if (run.status === "pause_requested") {
    projectBoardSynthesisPauseRequests.delete(input.runId);
    targetStore.markProjectBoardSynthesisRunPaused({
      boardId: input.boardId,
      runId: input.runId,
      reason:
        "Planning pause was finalized immediately because this desktop process has no active Ambient/Pi planner stream for the run.",
      metadata: {
        orphanedPauseRequest: true,
        recoverySource: "pause_request_without_active_controller",
      },
    });
  }
}

export async function retryProjectBoardSynthesisForProjectHost(
  host: ProjectBoardSynthesisRuntimeHost,
  input: RetryProjectBoardSynthesisInput,
): Promise<DesktopState> {
  const targetStore = host.store;
  if (input.retryOfRunId && input.mode === "failed_sections") {
    recordProjectBoardSynthesisSectionDecision(input.boardId, input.retryOfRunId, "retry_failed_sections", undefined, targetStore);
    emitProjectStateIfActive(host);
    if (projectBoardSemanticIdleDogfoodFastRetryEnabled()) {
      seedProjectBoardSemanticIdleDogfoodRetry(input.boardId, input.retryOfRunId, targetStore);
      emitProjectStateIfActive(host);
      return readStateForProjectHostAction(host);
    }
  } else if (input.retryOfRunId && input.mode === "stalled_run") {
    targetStore.markProjectBoardSynthesisRunStalled({
      boardId: input.boardId,
      runId: input.retryOfRunId,
      reason: "Marked stalled from the project-board progress panel before retrying.",
    });
    emitProjectStateIfActive(host);
  } else if (input.retryOfRunId && input.mode === "continue_batch") {
    recordProjectBoardSynthesisPlannerContinuationDecision(input.boardId, input.retryOfRunId, targetStore);
    emitProjectStateIfActive(host);
  } else if (input.retryOfRunId && input.mode === "paused_run") {
    recordProjectBoardSynthesisResumeDecision(input.boardId, input.retryOfRunId, targetStore);
    emitProjectStateIfActive(host);
  } else if (input.retryOfRunId && input.mode === "start_fresh") {
    recordProjectBoardSynthesisStartFreshDecision(input.boardId, input.retryOfRunId, targetStore);
    emitProjectStateIfActive(host);
  }
  await applyProjectBoardLiveSynthesis(input.boardId, {
    replaceExistingDraft: true,
    retryOfRunId: input.retryOfRunId,
    retryMode: input.mode,
    targetStore,
    host,
  });
  return readStateForProjectHostAction(host);
}

export function recoverOrphanedProjectBoardSynthesisPauseRequests(board?: ProjectSummary["board"], targetStore: ProjectStore = defaultProjectBoardSynthesisStore()): ProjectSummary["board"] {
  if (!board) return board;
  let recovered = false;
  for (const run of board.synthesisRuns ?? []) {
    if (run.status !== "pause_requested") continue;
    if (projectBoardSynthesisAbortControllers.has(run.id)) continue;
    projectBoardSynthesisPauseRequests.delete(run.id);
    targetStore.markProjectBoardSynthesisRunPaused({
      boardId: board.id,
      runId: run.id,
      reason: "Planning pause was finalized because no active Ambient/Pi planner stream is attached to this desktop process.",
      metadata: {
        orphanedPauseRequest: true,
        recoverySource: "desktop_state_recovery",
      },
    });
    recovered = true;
  }
  return recovered ? targetStore.getProjectBoard(board.id) : board;
}


type ProjectBoardRunProgressPatch = {
  stage?: ProjectBoardSynthesisRunStage;
  model?: string;
  sourceCount?: number;
  includedSourceCount?: number;
  sourceCharCount?: number;
  promptCharCount?: number;
  responseCharCount?: number;
  cardCount?: number;
  questionCount?: number;
  warningCount?: number;
};

const PROJECT_BOARD_RUN_PROGRESS_EMIT_INTERVAL_MS = 2_000;


function createProjectBoardRunProgressEmitter(
  runId: string,
  options: { intervalMs?: number; targetStore?: ProjectStore; host?: ProjectBoardSynthesisRuntimeHost } = {},
) {
  let latest: ProjectBoardRunProgressPatch | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const targetStore = options.targetStore ?? defaultProjectBoardSynthesisStore();
  const intervalMs = options.intervalMs ?? PROJECT_BOARD_RUN_PROGRESS_EMIT_INTERVAL_MS;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!latest) return;
    const progress = latest;
    latest = undefined;
    try {
      const updated = targetStore.tryUpdateProjectBoardSynthesisRunProgress(runId, progress);
      if (!updated) {
        console.warn(`Ignored project-board synthesis progress for missing run: ${runId}`);
        return;
      }
      emitProjectBoardState(targetStore, options.host);
    } catch (error) {
      console.warn("Ignored project-board synthesis progress flush failure", error);
    }
  };

  return {
    update(progress: ProjectBoardRunProgressPatch) {
      latest = mergeDefinedProjectBoardRunProgress(latest, progress);
      if (timer) return;
      timer = setTimeout(flush, intervalMs);
    },
    flush,
  };
}

function mergeDefinedProjectBoardRunProgress(
  current: ProjectBoardRunProgressPatch | undefined,
  nextProgress: ProjectBoardRunProgressPatch,
): ProjectBoardRunProgressPatch {
  const next = { ...current };
  if (nextProgress.stage !== undefined) next.stage = nextProgress.stage;
  if (nextProgress.model !== undefined) next.model = nextProgress.model;
  if (nextProgress.sourceCount !== undefined) next.sourceCount = nextProgress.sourceCount;
  if (nextProgress.includedSourceCount !== undefined) next.includedSourceCount = nextProgress.includedSourceCount;
  if (nextProgress.sourceCharCount !== undefined) next.sourceCharCount = nextProgress.sourceCharCount;
  if (nextProgress.promptCharCount !== undefined) next.promptCharCount = nextProgress.promptCharCount;
  if (nextProgress.responseCharCount !== undefined) next.responseCharCount = nextProgress.responseCharCount;
  if (nextProgress.cardCount !== undefined) next.cardCount = nextProgress.cardCount;
  if (nextProgress.questionCount !== undefined) next.questionCount = nextProgress.questionCount;
  if (nextProgress.warningCount !== undefined) next.warningCount = nextProgress.warningCount;
  return next;
}


async function scanSourcesForProjectBoard(
  boardId: string,
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): Promise<Awaited<ReturnType<typeof scanProjectBoardSources>>> {
  const board = targetStore.getProjectBoard(boardId);
  return scanProjectBoardSources(targetStore, { workspacePath: board?.projectPath ?? targetStore.getWorkspace().path, threadId: board?.sourceThreadId });
}

export async function refreshProjectBoardSources(
  boardId: string,
  options: { synthesize?: boolean; runId?: string; model?: string; targetStore?: ProjectStore; host?: ProjectBoardSynthesisRuntimeHost } = {},
): Promise<void> {
  const targetStore = options.targetStore ?? defaultProjectBoardSynthesisStore();
  const sources = await scanSourcesForProjectBoard(boardId, targetStore);
  const sourceTelemetry = projectBoardSourceTelemetry(sources);
  if (options.runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
      stage: "source_scan",
      title: "Scanned project sources",
      summary: `Scanned ${sourceTelemetry.sourceCount} source${sourceTelemetry.sourceCount === 1 ? "" : "s"} and kept ${sourceTelemetry.includedSourceCount} for the board source snapshot.`,
      metadata: { ...sourceTelemetry, sourceRefreshOnly: true },
      ...sourceTelemetry,
    });
    emitProjectBoardState(targetStore, options.host);
  }
  const replacedSources = targetStore.replaceProjectBoardSources(boardId, sources);
  if (options.runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
      stage: "sources_persisted",
      title: "Persisted source snapshot",
      summary: `Saved ${replacedSources.length} source record${replacedSources.length === 1 ? "" : "s"} before source classification.`,
      metadata: { persistedSourceCount: replacedSources.length, sourceRefreshOnly: true },
    });
    emitProjectBoardState(targetStore, options.host);
  }
  const persistedSources = await classifyProjectBoardSourcesWithPi(boardId, replacedSources, {
    model: options.model,
    runId: options.runId,
    targetStore,
    host: options.host,
  });
  if (options.synthesize) {
    targetStore.applyProjectBoardSynthesis(boardId, synthesizeProjectBoardDraft(persistedSources));
    await refreshProjectBoardCharterSummaryWithPi(boardId, persistedSources, {
      model: options.model,
      runId: options.runId,
      force: true,
      targetStore,
      host: options.host,
    });
  } else if (targetStore.getProjectBoard(boardId)?.charter?.status === "active") {
    await refreshProjectBoardCharterSummaryWithPi(boardId, persistedSources, {
      model: options.model,
      runId: options.runId,
      targetStore,
      host: options.host,
    });
  } else if (options.runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
      stage: "charter_summary",
      title: "Deferred charter project summary",
      summary:
        "Source refresh completed while the kickoff charter is still a draft. The Pi charter summary will refresh after kickoff answers finalize the active charter.",
      metadata: { sourceRefreshOnly: true, deferredUntilActiveCharter: true },
    });
    emitProjectBoardState(targetStore, options.host);
  }
}

export async function refreshProjectBoardSourcesForProjectHost(
  host: ProjectBoardSynthesisRuntimeHost,
  input: RefreshProjectBoardSourcesInput,
): Promise<DesktopState> {
  const targetStore = host.store;
  const model = targetStore.getDefaultSettings().model;
  const prepared = prepareProjectBoardSynthesisRun({
    boardId: input.boardId,
    model,
    intent: "source refresh",
  }, targetStore, host);
  if (prepared.reused) {
    return readStateForProjectHostAction(host);
  }
  emitProjectStateIfActive(host);
  try {
    await refreshProjectBoardSources(input.boardId, { runId: prepared.run.id, model, targetStore, host });
    targetStore.recordProjectBoardSynthesisRunEvent(prepared.run.id, {
      stage: "sources_persisted",
      title: "Project sources refreshed",
      summary: "The project board source snapshot is current. New or changed sources are ready for PM review and card elaboration.",
      metadata: { sourceRefreshOnly: true },
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    emitProjectStateIfActive(host);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.recordProjectBoardSynthesisRunEvent(prepared.run.id, {
      stage: "failed",
      title: "Source refresh failed",
      summary: message,
      metadata: { sourceRefreshOnly: true, error: message },
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    emitProjectStateIfActive(host);
    throw error;
  }
  return readStateForProjectHostAction(host);
}

async function classifyProjectBoardSourcesWithPi(
  boardId: string,
  sources: ProjectBoardSource[],
  options: { model?: string; runId?: string; targetStore?: ProjectStore; host?: ProjectBoardSynthesisRuntimeHost } = {},
): Promise<ProjectBoardSource[]> {
  const targetStore = options.targetStore ?? defaultProjectBoardSynthesisStore();
  const candidates = sources.filter(
    (source) =>
      source.classifiedBy !== "user" &&
      !projectBoardSourceDeterministicAuthorityLocked(source) &&
      (source.changeState === "new" || source.changeState === "changed" || !source.classifiedBy),
  );
  if (candidates.length === 0) {
    if (options.runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
        stage: "source_classification",
        title: "Source classification already current",
        summary: "No new or changed non-user sources needed Pi classification.",
        metadata: { candidateCount: 0 },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return sources;
  }

  const model = options.model ?? targetStore.getDefaultSettings().model;
  const runId = options.runId;
  const progressEmitter = runId ? createProjectBoardRunProgressEmitter(runId, { targetStore, host: options.host }) : undefined;
  if (runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(runId, {
      stage: "source_classification",
      title: "Asked Ambient/Pi to classify sources",
      summary: `Sending ${candidates.length} new or changed source${candidates.length === 1 ? "" : "s"} to Ambient/Pi for source-role classification.`,
      metadata: { sourceCount: candidates.length, model },
    });
    emitProjectBoardState(targetStore, options.host);
  }

  try {
    const result = await new AmbientProjectBoardSourceClassifierProvider({
      model,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).classifyBatched({
      sources: candidates,
      projectName: targetStore.getWorkspace().name,
      onProgress: runId
        ? (progress) => {
            if (
              recordProjectBoardDirectHelperRetryActivity({
                store: targetStore,
                runId,
                stage: "source_classification",
                title: "Retrying Pi source classification",
                helperLabel: "source classification",
                progress,
                flushProgress: () => progressEmitter?.flush(),
              })
            ) {
              emitProjectBoardState(targetStore, options.host);
              return;
            }
            progressEmitter?.update({
              stage: "source_classification",
              responseCharCount: progress.responseCharCount,
            });
          }
        : undefined,
    });
    progressEmitter?.flush();
    const classifiedSources =
      result.classifications.length > 0
        ? targetStore.applyProjectBoardSourceClassifications(
            boardId,
            result.classifications.map((classification) => ({
              sourceId: classification.sourceId,
              sourceKey: classification.sourceKey,
              kind: classification.effectiveKind,
              classificationReason: classification.classificationReason,
              classificationConfidence: classification.classificationConfidence,
              authorityRole: classification.authorityRole,
              includeInSynthesis: classification.includeInSynthesis,
              model,
            })),
        )
        : sources;
    if (runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(runId, {
        stage: "source_classification",
        title: result.classifications.length > 0 ? "Applied Pi source classifications" : "Pi source classification unavailable",
        summary: projectBoardSourceClassificationSummary(result),
        metadata: { ...result.telemetry, failures: result.failures, fallbackSourceIds: result.fallbackSourceIds },
        promptCharCount: result.telemetry.promptCharCount,
        responseCharCount: result.telemetry.responseCharCount,
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return classifiedSources;
  } catch (error) {
    progressEmitter?.flush();
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(runId, {
        stage: "source_classification",
        title: "Pi source classification unavailable",
        summary: `Using fallback source classifications because Ambient/Pi classification failed: ${message}`,
        metadata: { error: message, candidateCount: candidates.length, fallback: true },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return sources;
  }
}

function projectBoardSourceClassificationSummary(result: AmbientProjectBoardSourceBatchedClassificationResult): string {
  const piCount = result.classifications.length;
  const fallbackCount = result.fallbackSourceIds.length;
  const piPart = `${piCount} project source${piCount === 1 ? "" : "s"}`;
  if (fallbackCount === 0) {
    return `Ambient/Pi classified ${piPart} before synthesis.`;
  }
  const failedAttempts = result.failures.length;
  const failedAttemptPart =
    failedAttempts > 0
      ? ` after ${failedAttempts} failed classification batch attempt${failedAttempts === 1 ? "" : "s"}`
      : "";
  if (piCount === 0) {
    return `Using fallback source classifications for ${fallbackCount} project source${fallbackCount === 1 ? "" : "s"}${failedAttemptPart}.`;
  }
  return `Ambient/Pi classified ${piPart}; ${fallbackCount} project source${fallbackCount === 1 ? "" : "s"} kept fallback classification${failedAttemptPart}.`;
}

async function refreshProjectBoardCharterSummaryWithPi(
  boardId: string,
  sources: ProjectBoardSource[],
  options: { model?: string; runId?: string; force?: boolean; signal?: AbortSignal; targetStore?: ProjectStore; host?: ProjectBoardSynthesisRuntimeHost } = {},
): Promise<ProjectBoardCharterProjectSummary | undefined> {
  const targetStore = options.targetStore ?? defaultProjectBoardSynthesisStore();
  const board = targetStore.getProjectBoard(boardId);
  if (!board?.charter) return undefined;
  const generatedAt = new Date().toISOString();
  const fallbackSummary = targetStore.buildActiveProjectBoardCharterProjectSummary(boardId, generatedAt);
  const currentSummary = board.charter.projectSummary;
  if (!options.force && projectBoardCharterSummaryIsFresh(currentSummary, fallbackSummary) && currentSummary?.generator === "ambient_rlm") {
    if (options.runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(options.runId, {
        stage: "charter_summary",
        title: "Charter project summary already current",
        summary: "The active charter project summary already matches the current source and answer checksums.",
        metadata: {
          generator: currentSummary.generator,
          sourceChecksumCount: currentSummary.sourceChecksumSet.length,
          charterAnswerChecksum: currentSummary.charterAnswerChecksum,
          cached: true,
        },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return currentSummary;
  }

  const model = options.model ?? targetStore.getDefaultSettings().model;
  const runId = options.runId;
  const progressEmitter = runId ? createProjectBoardRunProgressEmitter(runId, { targetStore, host: options.host }) : undefined;
  if (runId) {
    targetStore.recordProjectBoardSynthesisRunEvent(runId, {
      stage: "charter_summary",
      title: "Asked Ambient/Pi for charter project summary",
      summary: `Refreshing the active charter project summary from ${sources.length} source${sources.length === 1 ? "" : "s"} and current kickoff answers.`,
      metadata: {
        model,
        sourceCount: sources.length,
        previousGenerator: currentSummary?.generator,
        stale: !projectBoardCharterSummaryIsFresh(currentSummary, fallbackSummary),
      },
    });
    emitProjectBoardState(targetStore, options.host);
  }

  try {
    const result = await new AmbientProjectBoardCharterSummaryProvider({
      model,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      ...ambientChatCompletionTransportTimeoutsFromEnv(),
    }).summarize({
      charter: board.charter,
      sources,
      projectName: targetStore.getWorkspace().name,
      fallbackSummary,
      generatedAt,
      signal: options.signal,
      onProgress: runId
        ? (progress) => {
            if (
              recordProjectBoardDirectHelperRetryActivity({
                store: targetStore,
                runId,
                stage: "charter_summary",
                title: "Retrying Pi charter summary",
                helperLabel: "charter summary",
                progress,
                flushProgress: () => progressEmitter?.flush(),
              })
            ) {
              emitProjectBoardState(targetStore, options.host);
              return;
            }
            progressEmitter?.update({
              stage: "charter_summary",
              responseCharCount: progress.responseCharCount,
            });
          }
        : undefined,
    });
    progressEmitter?.flush();
    targetStore.updateProjectBoardCharterProjectSummary({
      boardId,
      summary: result.summary,
      title: "Applied Pi charter project summary",
      eventSummary: "Updated the active charter project summary with Ambient/Pi grounded project-shape context.",
      metadata: { ...result.telemetry, model },
      createdAt: generatedAt,
    });
    if (runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(runId, {
        stage: "charter_summary",
        title: "Applied Pi charter project summary",
        summary: projectBoardCharterSummaryRunSummary(result),
        metadata: { ...result.telemetry, generator: result.summary.generator },
        promptCharCount: result.telemetry.promptCharCount,
        responseCharCount: result.telemetry.responseCharCount,
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return result.summary;
  } catch (error) {
    progressEmitter?.flush();
    if (options.signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (!projectBoardCharterSummaryIsFresh(currentSummary, fallbackSummary)) {
      targetStore.updateProjectBoardCharterProjectSummary({
        boardId,
        summary: fallbackSummary,
        title: "Applied fallback charter project summary",
        eventSummary: `Used deterministic project-shape context because Ambient/Pi summary refresh failed: ${message}`,
        metadata: { error: message, fallback: true, model },
        createdAt: generatedAt,
      });
    }
    if (runId) {
      targetStore.recordProjectBoardSynthesisRunEvent(runId, {
        stage: "charter_summary",
        title: "Pi charter summary unavailable",
        summary: `Using deterministic charter project summary because Ambient/Pi summary refresh failed: ${message}`,
        metadata: { error: message, fallback: true, model },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    return projectBoardCharterSummaryIsFresh(currentSummary, fallbackSummary) ? currentSummary : fallbackSummary;
  }
}

function projectBoardCharterSummaryIsFresh(
  current: ProjectBoardCharterProjectSummary | undefined,
  fallback: ProjectBoardCharterProjectSummary,
): boolean {
  if (!current) return false;
  if (current.charterAnswerChecksum !== fallback.charterAnswerChecksum) return false;
  if (current.sourceChecksumSet.length !== fallback.sourceChecksumSet.length) return false;
  const currentChecksums = [...current.sourceChecksumSet].sort();
  const nextChecksums = [...fallback.sourceChecksumSet].sort();
  return currentChecksums.every((checksum, index) => checksum === nextChecksums[index]);
}

function projectBoardCharterSummaryRunSummary(result: AmbientProjectBoardCharterSummaryResult): string {
  return `Ambient/Pi refreshed charter project context with ${result.summary.majorSystems.length} major system${
    result.summary.majorSystems.length === 1 ? "" : "s"
  }, ${result.summary.sourceCoverage.length} source coverage note${
    result.summary.sourceCoverage.length === 1 ? "" : "s"
  }, and ${result.summary.coverageGaps.length} coverage gap${result.summary.coverageGaps.length === 1 ? "" : "s"}.`;
}

function projectBoardSourceTelemetry(sources: Awaited<ReturnType<typeof scanProjectBoardSources>>) {
  const included = sources.filter(projectBoardSourceIncludedInSynthesis);
  const sourceCharCount = included.reduce(
    (total, source) => total + source.title.length + source.summary.length + (source.excerpt?.length ?? 0) + (source.path?.length ?? 0),
    0,
  );
  return { sourceCount: sources.length, includedSourceCount: included.length, sourceCharCount };
}

function projectBoardAnsweredQuestionsForRefinement(
  boardId: string,
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): ProjectBoardSynthesisRefinementAnswer[] {
  const boardSummary = targetStore.getProjectBoard(boardId);
  if (boardSummary?.id !== boardId) return [];
  const charterAnswers: ProjectBoardSynthesisRefinementAnswer[] = boardSummary.questions
    .filter((question) => question.answer?.trim())
    .map((question) => ({ question: `Charter kickoff: ${question.question}`, answer: question.answer!.trim(), source: "charter" }));
  const cardClarificationAnswers: ProjectBoardSynthesisRefinementAnswer[] = boardSummary.cards.flatMap((card) =>
    (card.clarificationAnswers ?? []).flatMap((answer) => {
      const question = answer.question.trim();
      const text = answer.answer.trim();
      if (!question || !text) return [];
      return [
        {
          question: `Card clarification (${card.title}): ${question}`,
          answer: text,
          source: "card_clarification" as const,
          cardId: card.id,
          cardTitle: card.title,
        },
      ];
    }),
  );
  return [...charterAnswers, ...cardClarificationAnswers].slice(0, 60);
}

export function requireProjectBoardForAction(boardId: string, targetStore: ProjectStore = defaultProjectBoardSynthesisStore()) {
  const board = targetStore.getProjectBoard(boardId);
  if (!board) throw new Error(`Project board not found: ${boardId}`);
  return board;
}

async function projectBoardPmReviewGitContextForBoard(
  boardId: string,
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): Promise<ProjectBoardPmReviewGitContext> {
  try {
    const status = await getProjectBoardGitSyncStatus(requireProjectBoardForAction(boardId, targetStore), {
      runtime: targetStore.listOrchestrationBoard(),
    });
    return projectBoardPmReviewGitContextFromStatus(status);
  } catch (error) {
    return {
      mode: "unknown",
      isGitRepository: false,
      hasRemote: false,
      dirtyBoardFileCount: 0,
      dirtyBoardFiles: [],
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function prepareProjectBoardSynthesisRun(input: {
  boardId: string;
  model?: string;
  retryOfRunId?: string;
  intent: string;
}, targetStore: ProjectStore = defaultProjectBoardSynthesisStore(), host?: ProjectBoardSynthesisRuntimeHost): { run: ProjectBoardSynthesisRun; reused: boolean } {
  requireProjectBoardForAction(input.boardId, targetStore);
  const staleBefore = new Date(Date.now() - PROJECT_BOARD_SYNTHESIS_STALE_MS).toISOString();
  const staleRuns = targetStore.failStaleProjectBoardSynthesisRuns({
    boardId: input.boardId,
    staleBefore,
    reason: `No project-board synthesis progress was recorded for at least ${Math.round(
      PROJECT_BOARD_SYNTHESIS_STALE_MS / 60_000,
    )} minutes, so this run was marked failed before starting a new ${input.intent} request.`,
  });
  if (staleRuns.length > 0) emitProjectBoardState(targetStore, host);

  const running = targetStore.getRunningProjectBoardSynthesisRun(input.boardId, { excludeStages: ["kickoff_defaults"] });
  if (running) {
    const updatedAt = running.updatedAt ? new Date(running.updatedAt).getTime() : NaN;
    const idleMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : undefined;
    const run = targetStore.recordProjectBoardSynthesisRunEvent(running.id, {
      stage: running.stage,
      title: "Joined running synthesis",
      summary: `Skipped a duplicate ${input.intent} request because project-board synthesis is already running. The existing run will continue to stream progress and produce the board output.`,
      metadata: {
        duplicateRequest: true,
        intent: input.intent,
        retryOfRunId: input.retryOfRunId,
        runningRunId: running.id,
        idleMs,
      },
    });
    emitProjectBoardState(targetStore, host);
    return { run, reused: true };
  }

  return {
    run: targetStore.createProjectBoardSynthesisRun({ boardId: input.boardId, model: input.model, retryOfRunId: input.retryOfRunId }),
    reused: false,
  };
}


function projectBoardValidatedProgressiveRecordsFromRun(runId?: string, targetStore: ProjectStore = defaultProjectBoardSynthesisStore()): ProposalJsonlRecordArtifact[] {
  if (!runId?.trim()) return [];
  const run = targetStore.getProjectBoardSynthesisRun(runId.trim());
  if (!run?.progressiveRecords?.length) return [];
  return run.progressiveRecords.flatMap((record) => {
    try {
      return [validateProposalJsonlRecordArtifact(record)];
    } catch {
      return [];
    }
  });
}

interface ProjectBoardRetryResumeRecords {
  records: ProposalJsonlRecordArtifact[];
  continuation?: ProjectBoardPlannerBatchContinuation;
}

async function projectBoardValidatedProgressiveRecordsForRetry(
  runId?: string,
  options: { mode?: RetryProjectBoardSynthesisInput["mode"]; targetStore?: ProjectStore } = {},
): Promise<ProjectBoardRetryResumeRecords> {
  const targetStore = options.targetStore ?? defaultProjectBoardSynthesisStore();
  if (!runId?.trim()) return { records: [] };
  const run = targetStore.getProjectBoardSynthesisRun(runId.trim());
  if (!run) return { records: [] };
  if (options.mode === "start_fresh") return { records: [] };
  const records: ProposalJsonlRecordArtifact[] = [...projectBoardValidatedProgressiveRecordsFromRun(run.id, targetStore)];
  for (const rootPath of projectBoardPlannerWorkspaceRootsFromRun(run)) {
    const workspaceRecords = await readProjectBoardPlannerWorkspaceRecordsFromRoot(rootPath);
    for (const record of workspaceRecords) {
      try {
        records.push(validateProposalJsonlRecordArtifact(record));
      } catch {
        // Workspace reads are validated at the artifact boundary; keep retry loading tolerant of older or partial files.
      }
    }
  }
  const deduped = dedupeProjectBoardProgressiveRecords(records);
  if (options.mode === "continue_batch" || options.mode === "paused_run") {
    const continuation = projectBoardPlannerContinuationForRetry(run, deduped);
    if (options.mode === "continue_batch" && !continuation.continuation) {
      throw new Error("This synthesis run has no recoverable planner-batch output checkpoint to continue.");
    }
    return continuation;
  }
  return { records: deduped };
}

function projectBoardPlannerWorkspaceRootsFromRun(run: ProjectBoardSynthesisRun): string[] {
  const roots = new Set<string>();
  for (const event of run.events) {
    const root = event.metadata.plannerWorkspaceRoot;
    if (typeof root === "string" && root.trim()) roots.add(root.trim());
    const aggregatePath = event.metadata.aggregateJsonlPath;
    if (typeof aggregatePath === "string" && aggregatePath.trim()) roots.add(dirname(dirname(aggregatePath.trim())));
  }
  return [...roots];
}

function dedupeProjectBoardProgressiveRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
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

function createProjectBoardSynthesisProvider(model: string, targetStore: ProjectStore = defaultProjectBoardSynthesisStore()): AmbientProjectBoardSynthesisProvider {
  return new AmbientProjectBoardSynthesisProvider({
    model,
    reasoning: projectBoardSynthesisReasoningConfigFromEnv(),
    maxToolRounds: projectBoardSynthesisMaxToolRoundsFromEnv(),
    retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
  });
}

function isRecoverableEmptyPlannerCardFailure(error: unknown): boolean {
  const message = projectBoardSynthesisErrorMessage(error);
  return /Planner-batch Ambient\/Pi synthesis did not produce any candidate cards|Ambient project-board synthesis returned an empty response/i.test(message);
}

function projectBoardSynthesisErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function projectBoardSynthesisReasoningConfigFromEnv(): ProjectBoardSynthesisReasoning | undefined {
  const explicitNoReasoning = (process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_NO_REASONING ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(explicitNoReasoning)) return false;
  const reasoning = (process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_REASONING ?? "").trim().toLowerCase();
  if (!reasoning) return undefined;
  if (["0", "false", "none", "off", "disabled", "no_reasoning"].includes(reasoning)) return false;
  if (!["xhigh", "high", "medium", "low", "minimal"].includes(reasoning)) return undefined;
  const maxTokens = Number(process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_REASONING_MAX_TOKENS);
  const exclude = (process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_REASONING_EXCLUDE ?? "true").trim().toLowerCase();
  const effort = reasoning as NonNullable<Exclude<ProjectBoardSynthesisReasoning, false>["effort"]>;
  return {
    effort,
    enabled: true,
    exclude: !["0", "false", "no", "off"].includes(exclude),
    ...(Number.isFinite(maxTokens) && maxTokens >= 0 ? { max_tokens: Math.floor(maxTokens) } : {}),
  } satisfies ProjectBoardSynthesisReasoning;
}

function projectBoardSynthesisMaxToolRoundsFromEnv(): number | undefined {
  const raw = process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_MAX_TOOL_ROUNDS;
  if (raw === undefined || !raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(8, Math.floor(value)));
}

export function applyProjectBoardIncrementalSynthesisFromRun(input: {
  boardId: string;
  runId: string;
  fallback: ProjectBoardSynthesisDraft;
  model?: string;
  startedAt: number;
  replaceExistingDraft: boolean;
  sourceIdNamespace?: string;
  targetStore?: ProjectStore;
}): void {
  const targetStore = input.targetStore ?? defaultProjectBoardSynthesisStore();
  const records = projectBoardValidatedProgressiveRecordsFromRun(input.runId, targetStore);
  if (!records.some((record) => record.type === "candidate_card")) return;
  let draft: ProjectBoardSynthesisDraft;
  try {
    draft = projectBoardSynthesisDraftFromProgressiveRecords(records, input.fallback);
  } catch (error) {
    targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "schema_validation",
      title: "Incremental board batch not ready",
      summary: `Progressive records were saved, but they cannot be applied to the board yet: ${error instanceof Error ? error.message : String(error)}`,
      metadata: { progressive: true, error: error instanceof Error ? error.message : String(error), recordCount: records.length },
    });
    return;
  }

  const before = targetStore.getProjectBoard(input.boardId);
  const beforeSourceIds = new Set(before?.id === input.boardId ? before.cards.map((card) => card.sourceId) : []);
  const summary = targetStore.applyProjectBoardSynthesis(input.boardId, draft, {
    replaceExistingDraft: input.replaceExistingDraft,
    insertQuestions: false,
    deleteStaleDraftCards: false,
    sourceIdNamespace: input.sourceIdNamespace,
    snapshotRunId: input.runId,
    snapshotKind: "incremental",
    coverPlannerPlanDrafts: true,
  });
  const insertedCards = summary.cards.filter((card) => card.sourceKind === "board_synthesis" && !beforeSourceIds.has(card.sourceId));
  targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
    stage: "board_applied",
    title: "Applied incremental Pi card batch",
    summary: [
      `Applied ${draft.cards.length} progressive card${draft.cards.length === 1 ? "" : "s"} to the draft inbox before full planning completed.`,
      insertedCards.length ? `${insertedCards.length} new card${insertedCards.length === 1 ? "" : "s"} appeared in the board.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    metadata: {
      progressive: true,
      recordCount: records.length,
      cardCount: draft.cards.length,
      insertedCardIds: insertedCards.map((card) => card.id),
      insertedSourceIds: insertedCards.map((card) => card.sourceId),
      durationMs: Date.now() - input.startedAt,
      model: input.model,
    },
    cardCount: draft.cards.length,
    questionCount: draft.questions.length,
  });
}

async function consolidateProjectBoardSynthesisCandidates(input: {
  boardId: string;
  runId: string;
  model: string;
  targetStore: ProjectStore;
  host?: ProjectBoardSynthesisRuntimeHost;
}): Promise<void> {
  const targetStore = input.targetStore;
  try {
    const board = targetStore.getProjectBoard(input.boardId);
    if (!board) return;
    const candidates = projectBoardConsolidationCandidates(board.cards);
    if (candidates.length < 2) return;
    const apiKey = (readAmbientApiKey() ?? "").trim();
    if (!apiKey) return;
    const groups = await runProjectBoardCandidateConsolidation({
      boardId: input.boardId,
      projectName: targetStore.getWorkspace().name,
      candidates,
      model: input.model,
      apiKey,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
    });
    let markedCount = 0;
    const markedGroups: Array<{ survivorCardId: string; duplicateCardIds: string[]; reason: string }> = [];
    for (const group of groups) {
      const marked: string[] = [];
      for (const duplicateCardId of group.duplicateCardIds) {
        try {
          targetStore.updateProjectBoardCardCandidateStatus(duplicateCardId, "duplicate", {
            actor: "system",
            reason: group.reason || "Consolidation pass found this card duplicates another candidate.",
            relatedCardId: group.survivorCardId,
          });
          marked.push(duplicateCardId);
          markedCount += 1;
        } catch {
          // The card may have been ticketized or edited since the snapshot; leave it alone.
        }
      }
      if (marked.length > 0) markedGroups.push({ ...group, duplicateCardIds: marked });
    }
    targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "board_applied",
      title: markedCount > 0 ? "Consolidated duplicate candidates" : "Candidate consolidation found no duplicates",
      summary:
        markedCount > 0
          ? `An LLM review of all ${candidates.length} draft candidates marked ${markedCount} card${markedCount === 1 ? "" : "s"} as duplicates across ${markedGroups.length} group${markedGroups.length === 1 ? "" : "s"}. Duplicates stay in the Draft Inbox for audit.`
          : `An LLM review of all ${candidates.length} draft candidates found no duplicate cards.`,
      metadata: { consolidation: true, candidateCount: candidates.length, markedCount, groups: markedGroups },
    });
    if (markedCount > 0) emitProjectBoardState(targetStore, input.host);
  } catch (error) {
    // Consolidation is additive polish; a failure must never poison a succeeded planning run.
    try {
      targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
        stage: "board_applied",
        title: "Candidate consolidation skipped",
        summary: projectBoardSynthesisErrorMessage(error),
        metadata: { consolidation: true, failed: true },
      });
    } catch {
      /* run may be gone; nothing left to record */
    }
  }
}

export async function applyProjectBoardLiveSynthesis(
  boardId: string,
  options: {
    replaceExistingDraft?: boolean;
    retryOfRunId?: string;
    retryMode?: RetryProjectBoardSynthesisInput["mode"];
    targetStore?: ProjectStore;
    host?: ProjectBoardSynthesisRuntimeHost;
  } = {},
): Promise<void> {
  const targetStore = options.targetStore ?? defaultProjectBoardSynthesisStore();
  assertProjectBoardCardGenerationAllowed(requireProjectBoardForAction(boardId, targetStore), "Board synthesis");
  const startedAt = Date.now();
  const model = targetStore.getDefaultSettings().model;
  const prepared = prepareProjectBoardSynthesisRun({
    boardId,
    model,
    retryOfRunId: options.retryOfRunId,
    intent: options.retryMode === "start_fresh" ? "fresh synthesis" : options.retryOfRunId ? "retry synthesis" : "board synthesis",
  }, targetStore, options.host);
  if (prepared.reused) return;
  const run = prepared.run;
  const sourceIdNamespace = options.retryMode === "start_fresh" ? projectBoardStartFreshSourceIdNamespace(run.id) : undefined;
  projectBoardSynthesisPauseRequests.delete(run.id);
  const synthesisAbortController = new AbortController();
  projectBoardSynthesisAbortControllers.set(run.id, synthesisAbortController);
  const progressEmitter = createProjectBoardRunProgressEmitter(run.id, { targetStore, host: options.host });
  let progressiveRecordsPersisted = false;
  const shouldPause = () => isProjectBoardSynthesisPauseRequested(run.id, targetStore);
  const abortIfPauseRequested = () =>
    abortProjectBoardSynthesisForPause(run.id, "Project-board planning pause requested for this synthesis run.", targetStore);
  emitProjectBoardState(targetStore, options.host);
  try {
    const sources = await scanSourcesForProjectBoard(boardId, targetStore);
    const sourceTelemetry = projectBoardSourceTelemetry(sources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "source_scan",
      title: "Scanned project sources",
      summary: `Scanned ${sourceTelemetry.sourceCount} source${sourceTelemetry.sourceCount === 1 ? "" : "s"} and kept ${sourceTelemetry.includedSourceCount} for synthesis.`,
      metadata: sourceTelemetry,
      ...sourceTelemetry,
    });
    emitProjectBoardState(targetStore, options.host);
    let persistedSources = targetStore.replaceProjectBoardSources(boardId, sources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "sources_persisted",
      title: "Persisted source snapshot",
      summary: `Saved ${persistedSources.length} source record${persistedSources.length === 1 ? "" : "s"} for this board synthesis run.`,
      metadata: { persistedSourceCount: persistedSources.length },
    });
    emitProjectBoardState(targetStore, options.host);
    persistedSources = await classifyProjectBoardSourcesWithPi(boardId, persistedSources, { model, runId: run.id, targetStore, host: options.host });
    abortIfPauseRequested();
    await refreshProjectBoardCharterSummaryWithPi(boardId, persistedSources, {
      model,
      runId: run.id,
      signal: synthesisAbortController.signal,
      targetStore,
      host: options.host,
    });
    abortIfPauseRequested();
    const deterministicBaseline = synthesizeProjectBoardDraft(persistedSources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "deterministic_baseline",
      title: "Built deterministic baseline",
      summary: `Prepared a baseline with ${deterministicBaseline.cards.length} card${deterministicBaseline.cards.length === 1 ? "" : "s"} before asking Pi.`,
      metadata: { cardCount: deterministicBaseline.cards.length, questionCount: deterministicBaseline.questions.length },
      cardCount: deterministicBaseline.cards.length,
      questionCount: deterministicBaseline.questions.length,
    });
    emitProjectBoardState(targetStore, options.host);
    const charterAnswers = projectBoardAnsweredQuestionsForRefinement(boardId, targetStore);
    const activeBoard = targetStore.getProjectBoard(boardId);
    const charterProjectSummary = activeBoard?.id === boardId ? activeBoard.charter?.projectSummary : undefined;
    const provider = createProjectBoardSynthesisProvider(model, targetStore);
    const refinement = charterAnswers.length
      ? {
          previousDraft: deterministicBaseline,
          answers: charterAnswers,
          mode: "refine" as const,
        }
      : undefined;
    const plannerWorkspace = await createProjectBoardPlannerWorkspace({
      projectPath: targetStore.getWorkspace().path,
      boardId,
      runId: run.id,
      projectName: targetStore.getWorkspace().name,
      operation: "board_synthesis",
      sources: persistedSources,
    });
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "sources_persisted",
      title: "Prepared planner session workspace",
      summary: `Wrote ${plannerWorkspace.sources.length} source file${
        plannerWorkspace.sources.length === 1 ? "" : "s"
      }, a planner-session descriptor, ledger, and JSONL output targets for Pi planning artifacts.`,
      metadata: {
        plannerSessionId: plannerWorkspace.sessionId,
        plannerWorkspaceRoot: plannerWorkspace.rootPath,
        plannerSessionDescriptor: plannerWorkspace.sessionPath,
        plannerLedgerPath: plannerWorkspace.ledgerPath,
        plannerWorkspaceManifest: plannerWorkspace.manifestPath,
        aggregateJsonlPath: plannerWorkspace.aggregateJsonlPath,
        sourceFileCount: plannerWorkspace.sources.length,
        batchPolicy: plannerWorkspace.batchPolicy,
        executionMode: "pi_session_stream",
        compatibilityFallback: "direct_chat_compat",
      },
    });
    emitProjectBoardState(targetStore, options.host);
    const retryResume = await projectBoardValidatedProgressiveRecordsForRetry(options.retryOfRunId, { mode: options.retryMode, targetStore });
    const resumeFromRecords = retryResume.records;
    if (resumeFromRecords.length > 0) {
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "schema_validation",
        title: retryResume.continuation ? "Loaded planner-batch continuation checkpoint" : "Loaded previous section records",
        summary: retryResume.continuation
          ? `Continuation will reuse ${resumeFromRecords.length} validated progressive planning record${
              resumeFromRecords.length === 1 ? "" : "s"
            } through ${retryResume.continuation.lastValidRecordType} ${retryResume.continuation.lastValidRecordId}, then ask Pi for the next missing cards without stitching partial JSON.`
          : `Retry will reuse ${resumeFromRecords.length} validated progressive planning record${
              resumeFromRecords.length === 1 ? "" : "s"
            } from the previous synthesis run and its durable planner workspace where section status permits it.`,
        metadata: {
          retryOfRunId: options.retryOfRunId,
          retryMode: options.retryMode,
          progressiveRecordCount: resumeFromRecords.length,
          plannerContinuation: retryResume.continuation,
        },
      });
      emitProjectBoardState(targetStore, options.host);
    }
    const onProgress = (progress: AmbientProjectBoardSynthesisProgress) => {
      if (progress.metadata?.streaming === true) {
        progressEmitter.update({
          stage: progress.stage,
          promptCharCount: progress.promptCharCount,
          responseCharCount: progress.responseCharCount,
          cardCount: progress.cardCount,
          questionCount: progress.questionCount,
        });
        abortIfPauseRequested();
        return;
      }
      progressEmitter.flush();
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: progress.stage,
        title: progress.title,
        summary: progress.summary,
        metadata: progress.metadata,
        promptCharCount: progress.promptCharCount,
        responseCharCount: progress.responseCharCount,
        cardCount: progress.cardCount,
        questionCount: progress.questionCount,
      });
      emitProjectBoardState(targetStore, options.host);
      abortIfPauseRequested();
    };
    const onProgressiveRecords = (batch: AmbientProjectBoardSynthesisProgressiveBatch) => {
      progressiveRecordsPersisted = true;
      progressEmitter.flush();
      recordProjectBoardSynthesisProgressiveBatch(run.id, batch, targetStore);
      applyProjectBoardIncrementalSynthesisFromRun({
        boardId,
        runId: run.id,
        fallback: deterministicBaseline,
        model,
        startedAt,
        replaceExistingDraft: options.replaceExistingDraft ?? true,
        sourceIdNamespace,
        targetStore,
      });
      emitProjectBoardState(targetStore, options.host);
      abortIfPauseRequested();
    };
    const result = projectBoardShouldUseSectionedPlanningForWorkflow(persistedSources, refinement)
      ? await provider.synthesizeSectionedWithTelemetry({
          sources: persistedSources,
          projectName: targetStore.getWorkspace().name,
          refinement,
          ...(charterProjectSummary ? { charterProjectSummary } : {}),
          resumeFromRecords,
          onProgress,
          onProgressiveRecords,
          plannerWorkspace,
          shouldPause,
          signal: synthesisAbortController.signal,
        })
      : await provider.synthesizePlannerBatchesWithTelemetry({
          sources: persistedSources,
          projectName: targetStore.getWorkspace().name,
          refinement,
          ...(charterProjectSummary ? { charterProjectSummary } : {}),
          resumeFromRecords,
          resumeContinuation: retryResume.continuation,
          onProgress,
          onProgressiveRecords,
          plannerWorkspace,
          shouldPause,
          signal: synthesisAbortController.signal,
        });
    progressEmitter.flush();
    const pauseRequestedAfterResult = result.telemetry.paused || isProjectBoardSynthesisPauseRequested(run.id, targetStore);
    if (!progressiveRecordsPersisted) {
      recordProjectBoardSynthesisProgressiveRecords(run.id, result.draft, persistedSources, undefined, result.progressiveRecords, targetStore);
    }
    recordProjectBoardSynthesisCardBuildEvents(run.id, result.draft.cards, targetStore);
    emitProjectBoardState(targetStore, options.host);
    targetStore.applyProjectBoardSynthesis(boardId, result.draft, {
      replaceExistingDraft: options.replaceExistingDraft ?? true,
      insertQuestions: false,
      deleteStaleDraftCards: result.telemetry.partial !== true,
      sourceIdNamespace,
      coverPlannerPlanDrafts: true,
    });
    if (pauseRequestedAfterResult) {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      targetStore.markProjectBoardSynthesisRunPaused({
        boardId,
        runId: run.id,
        reason: result.telemetry.paused
          ? "Planning paused at the requested checkpoint."
          : "Planning paused after the synthesis result completed while a pause was requested.",
        metadata: {
          durationMs: Date.now() - startedAt,
          pauseRequestedAfterResult: !result.telemetry.paused,
          scopeContract: result.scopeContract,
          planningDepth: result.planningDepth,
          ...result.telemetry,
        },
      });
      emitProjectBoardState(targetStore, options.host);
      return;
    }
    await refreshProjectBoardCharterSummaryWithPi(boardId, persistedSources, { model, runId: run.id, force: true, targetStore, host: options.host });
    projectBoardSynthesisPauseRequests.delete(run.id);
    projectBoardSynthesisAbortControllers.delete(run.id);
    const partialSectionSummary =
      result.telemetry.failedSectionCount && result.telemetry.failedSectionCount > 0
        ? ` ${result.telemetry.failedSectionCount} source section${result.telemetry.failedSectionCount === 1 ? "" : "s"} failed and can be retried.`
        : "";
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "board_applied",
      title: result.telemetry.partial ? "Applied partial Pi board synthesis" : "Applied Pi board synthesis",
      summary: `Applied ${result.draft.cards.length} candidate card${
        result.draft.cards.length === 1 ? "" : "s"
      } from Ambient/Pi to the draft inbox.${partialSectionSummary}`,
      metadata: { durationMs: Date.now() - startedAt, scopeContract: result.scopeContract, planningDepth: result.planningDepth, ...result.telemetry },
      status: "succeeded",
      promptCharCount: result.telemetry.promptCharCount,
      responseCharCount: result.telemetry.responseCharCount,
      cardCount: result.telemetry.cardCount,
      questionCount: result.telemetry.questionCount,
      completedAt: new Date().toISOString(),
    });
    emitProjectBoardState(targetStore, options.host);
    await consolidateProjectBoardSynthesisCandidates({ boardId, runId: run.id, model, targetStore, host: options.host });
  } catch (error) {
    const runStillExists = Boolean(targetStore.getProjectBoardSynthesisRun(run.id));
    if (isProjectBoardSynthesisPauseRequested(run.id, targetStore) || synthesisAbortController.signal.aborted) {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      progressEmitter.flush();
      if (!runStillExists) {
        emitProjectBoardState(targetStore, options.host);
        return;
      }
      const abortReason =
        synthesisAbortController.signal.reason instanceof Error
          ? synthesisAbortController.signal.reason.message
          : synthesisAbortController.signal.aborted
            ? "Transport aborted after pause was requested."
            : error instanceof Error
              ? error.message
              : String(error);
      targetStore.markProjectBoardSynthesisRunPaused({
        boardId,
        runId: run.id,
        reason: "Planning paused after canceling the active Ambient/Pi stream.",
        metadata: {
          durationMs: Date.now() - startedAt,
          transportAbort: true,
          abortReason,
          progressiveRecordsPersisted,
        },
      });
      emitProjectBoardState(targetStore, options.host);
      return;
    }
    projectBoardSynthesisPauseRequests.delete(run.id);
    projectBoardSynthesisAbortControllers.delete(run.id);
    progressEmitter.flush();
    if (!runStillExists) {
      emitProjectBoardState(targetStore, options.host);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "failed",
      title: "Board synthesis failed",
      summary: message,
      metadata: { message },
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    emitProjectBoardState(targetStore, options.host);
    throw error;
  }
}

export function startProjectBoardSynthesisAfterPlanPromotion(host: ProjectBoardSynthesisRuntimeHost, boardId: string): void {
  const targetStore = host.store;
  const board = targetStore.getProjectBoard(boardId);
  if (!board || board.status === "archived") return;
  // Park the automatic planning pass while the compact durable-plan card is already
  // ticketized or executing: planning would only propose duplicate step cards for the
  // exact scope a worker is building right now. Manual Revise Board stays available.
  if (targetStore.parkAutomaticPlanningForExecutingPlanCard(boardId)) {
    emitProjectStateIfActive(host);
    return;
  }
  void applyProjectBoardLiveSynthesis(boardId, { replaceExistingDraft: true, targetStore, host }).catch((error) => {
    console.warn("Project-board synthesis after plan promotion failed.", error);
    emitProjectStateIfActive(host);
  });
}

export function recordProjectBoardSynthesisSectionDecision(
  boardId: string,
  runId: string,
  decision: "retry_failed_sections" | "defer_failed_sections",
  reason?: string,
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): void {
  const run = targetStore.getProjectBoardSynthesisRun(runId);
  if (!run || run.boardId !== boardId) throw new Error("Project board synthesis run not found for this board.");
  const partial = projectBoardSynthesisPartialStatus(run);
  if (!partial.hasFailedSections) throw new Error("This synthesis run has no failed source sections to recover.");
  const failedLabel = `${partial.failedCount} failed source section${partial.failedCount === 1 ? "" : "s"}`;
  const title = decision === "retry_failed_sections" ? "Retry requested for failed sections" : "Deferred failed source sections";
  const summary =
    decision === "retry_failed_sections"
      ? `Starting a resumable retry for ${failedLabel}. Completed section records from this run will be reused where section status permits it.`
      : `Kept the current partial proposal and deferred ${failedLabel}. Retry remains available from this run if the deferred sections become important.`;
  targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: run.stage,
    title,
    summary: reason?.trim() ? `${summary} Reason: ${reason.trim()}` : summary,
    metadata: {
      decision,
      failedSectionCount: partial.failedCount,
      failedSectionIds: partial.failedSectionIds,
      failedSectionHeadings: partial.failedSectionHeadings,
      partialProposal: partial.hasPartialProposal,
    },
  });
}

function recordProjectBoardSynthesisPlannerContinuationDecision(
  boardId: string,
  runId: string,
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): void {
  const run = targetStore.getProjectBoardSynthesisRun(runId);
  if (!run || run.boardId !== boardId) throw new Error("Project board synthesis run not found for this board.");
  const continuation = projectBoardSynthesisOutputCapRecovery(run);
  if (!continuation.canContinue) throw new Error("This synthesis run has no recoverable planner-batch output checkpoint to continue.");
  targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: run.stage,
    title: "Continue planner batch requested",
    summary: continuation.summary,
    metadata: {
      decision: "continue_planner_batch",
      finishReason: continuation.finishReason,
      stopReason: continuation.stopReason,
      outputTokenBudget: continuation.outputTokenBudget,
      lastValidRecordId: continuation.lastValidRecordId,
      lastValidRecordType: continuation.lastValidRecordType,
      lastValidRecordIndex: continuation.lastValidRecordIndex,
      plannerBatchIndex: continuation.plannerBatchIndex,
      plannerBatchCount: continuation.plannerBatchCount,
    },
  });
}

function recordProjectBoardSynthesisResumeDecision(boardId: string, runId: string, targetStore: ProjectStore = defaultProjectBoardSynthesisStore()): void {
  const run = targetStore.getProjectBoardSynthesisRun(runId);
  if (!run || run.boardId !== boardId) throw new Error("Project board synthesis run not found for this board.");
  if (run.status !== "paused") throw new Error("Only a paused project-board synthesis run can be resumed.");
  const continuation = projectBoardSynthesisOutputCapRecovery(run);
  targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: run.stage,
    title: "Resume planning requested",
    summary: continuation.canContinue
      ? `${continuation.summary} Resume will keep the paused run immutable and create a new continuation run.`
      : "Resume will reuse validated progressive records from the paused run and ask Ambient/Pi for remaining cards.",
    metadata: {
      decision: "resume_paused_planning",
      recoverablePlannerBatch: continuation.canContinue,
      finishReason: continuation.finishReason,
      stopReason: continuation.stopReason,
      outputTokenBudget: continuation.outputTokenBudget,
      lastValidRecordId: continuation.lastValidRecordId,
      lastValidRecordType: continuation.lastValidRecordType,
      lastValidRecordIndex: continuation.lastValidRecordIndex,
      plannerBatchIndex: continuation.plannerBatchIndex,
      plannerBatchCount: continuation.plannerBatchCount,
    },
  });
}

function recordProjectBoardSynthesisStartFreshDecision(boardId: string, runId: string, targetStore: ProjectStore = defaultProjectBoardSynthesisStore()): void {
  targetStore.abandonProjectBoardSynthesisRunPause({
    boardId,
    runId,
    reason: "Start Fresh requested instead of resuming this paused checkpoint.",
  });
  targetStore.supersedeProjectBoardSynthesisCardsForStartFresh({
    boardId,
    runId,
    reason: "Start Fresh requested instead of resuming this paused checkpoint.",
  });
}

function projectBoardStartFreshSourceIdNamespace(runId: string): string {
  return `start-fresh:${runId}:`;
}

function recordProjectBoardSynthesisCardBuildEvents(
  runId: string,
  cards: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["synthesizeWithTelemetry"]>>["draft"]["cards"],
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): void {
  const visibleCards = cards.slice(0, 60);
  visibleCards.forEach((card, index) => {
    targetStore.recordProjectBoardSynthesisRunEvent(runId, {
      stage: "schema_validation",
      title: `Prepared card ${index + 1}/${cards.length}`,
      summary: `${card.title}${card.phase ? ` · ${card.phase}` : ""}${card.blockedBy.length ? ` · blocked by ${card.blockedBy.join(", ")}` : ""}`,
      metadata: { sourceId: card.sourceId, phase: card.phase, sourceRefs: card.sourceRefs },
      cardCount: index + 1,
    });
  });
  if (cards.length > visibleCards.length) {
    targetStore.recordProjectBoardSynthesisRunEvent(runId, {
      stage: "schema_validation",
      title: "Prepared remaining cards",
      summary: `${cards.length - visibleCards.length} additional card${cards.length - visibleCards.length === 1 ? "" : "s"} were validated and are ready to apply.`,
      metadata: { omittedCardCount: cards.length - visibleCards.length },
      cardCount: cards.length,
    });
  }
}

function recordProjectBoardSynthesisProgressiveRecords(
  runId: string,
  draft: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["synthesizeWithTelemetry"]>>["draft"],
  sources: ProjectBoardSource[],
  proposalId?: string,
  records?: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["synthesizeWithTelemetry"]>>["progressiveRecords"],
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): void {
  const progressiveRecords =
    records && records.length > 0
      ? records
      : projectBoardProgressiveRecordsFromDraft({
          draft,
          sources,
          proposalId: proposalId ?? runId,
          createdAt: new Date().toISOString(),
          includeProgress: false,
        });
  targetStore.recordProjectBoardSynthesisRunProgressiveRecords(runId, progressiveRecords, {
    summary: `Persisted ${draft.cards.length} candidate card${draft.cards.length === 1 ? "" : "s"}, ${draft.questions.length} question${draft.questions.length === 1 ? "" : "s"}, and source coverage before applying board state.`,
  });
}

function recordProjectBoardSynthesisProgressiveBatch(
  runId: string,
  batch: AmbientProjectBoardSynthesisProgressiveBatch,
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): void {
  const candidateCount = batch.records.filter((record) => record.type === "candidate_card").length;
  const questionCount = batch.records.filter((record) => record.type === "question").length;
  const coverageCount = batch.records.filter((record) => record.type === "source_coverage").length;
  const errorCount = batch.records.filter((record) => record.type === "error").length;
  const semanticIdleCount = batch.records.filter((record) => record.type === "error" && record.code === "section_semantic_idle_timeout").length;
  const sectionStatus = batch.records.find(
    (record) => record.type === "progress" && typeof record.metadata.sectionStatus === "string",
  );
  const lastCard = batch.records.filter((record) => record.type === "candidate_card").at(-1);
  targetStore.recordProjectBoardSynthesisRunProgressiveRecords(runId, batch.records, {
    title: `Imported section ${batch.sectionIndex}/${batch.sectionCount} planning records`,
    summary: [
      `${batch.records.length} record${batch.records.length === 1 ? "" : "s"}`,
      sectionStatus?.type === "progress" ? `section ${sectionStatus.metadata.sectionStatus}` : "",
      candidateCount ? `${candidateCount} card${candidateCount === 1 ? "" : "s"}` : "",
      questionCount ? `${questionCount} question${questionCount === 1 ? "" : "s"}` : "",
      coverageCount ? `${coverageCount} coverage update${coverageCount === 1 ? "" : "s"}` : "",
      semanticIdleCount ? `${semanticIdleCount} semantic-idle stall${semanticIdleCount === 1 ? "" : "s"}` : "",
      errorCount ? `${errorCount} recoverable error${errorCount === 1 ? "" : "s"}` : "",
      lastCard?.type === "candidate_card" ? `last card: ${lastCard.title}` : "",
      `${batch.section.sourcePath || batch.section.sourceTitle} (${batch.section.heading})`,
    ]
      .filter(Boolean)
      .join(" · "),
  });
}

function upsertProjectBoardProgressiveProposalFromRun(input: {
  boardId: string;
  runId: string;
  fallback: ProjectBoardSynthesisDraft;
  model?: string;
  startedAt: number;
  targetStore?: ProjectStore;
}): ProjectBoardSynthesisProposal | undefined {
  const targetStore = input.targetStore ?? defaultProjectBoardSynthesisStore();
  const records = projectBoardValidatedProgressiveRecordsFromRun(input.runId, targetStore);
  if (!records.some((record) => record.type === "candidate_card")) return undefined;
  let draft: ProjectBoardSynthesisDraft;
  try {
    draft = projectBoardSynthesisDraftFromProgressiveRecords(records, input.fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "schema_validation",
      title: "Progressive PM Review proposal not ready",
      summary: `Progressive section records were saved, but they do not yet form a reviewable proposal: ${message}`,
      metadata: { progressive: true, error: message, recordCount: records.length },
    });
    return undefined;
  }

  const existingRun = targetStore.getProjectBoardSynthesisRun(input.runId);
  const existingProposal =
    existingRun?.proposalId && existingRun.boardId === input.boardId ? targetStore.getProjectBoardSynthesisProposal(existingRun.proposalId) : undefined;
  const proposal =
    existingProposal?.status === "pending" && existingProposal.boardId === input.boardId
      ? targetStore.updateProjectBoardSynthesisProposal({
          proposalId: existingProposal.id,
          synthesis: draft,
          model: input.model,
          durationMs: Date.now() - input.startedAt,
        })
      : targetStore.createProjectBoardSynthesisProposal({
          boardId: input.boardId,
          synthesis: draft,
          model: input.model,
          durationMs: Date.now() - input.startedAt,
        });

  targetStore.recordProjectBoardSynthesisRunEvent(input.runId, {
    stage: "proposal_created",
    title: existingProposal ? "Updated live PM Review proposal" : "Created live PM Review proposal",
    summary: `Imported ${draft.cards.length} progressive card${draft.cards.length === 1 ? "" : "s"} and ${draft.questions.length} question${
      draft.questions.length === 1 ? "" : "s"
    } into a reviewable partial proposal.`,
    metadata: {
      proposalId: proposal.id,
      progressive: true,
      recordCount: records.length,
      cardCount: draft.cards.length,
      questionCount: draft.questions.length,
      sourceNoteCount: draft.sourceNotes.length,
    },
    proposalId: proposal.id,
    cardCount: draft.cards.length,
    questionCount: draft.questions.length,
  });
  return proposal;
}

function createOrUpdateProjectBoardSynthesisProposalForRun(input: {
  boardId: string;
  runId: string;
  synthesis: ProjectBoardSynthesisDraft;
  reviewReport?: ProjectBoardPmReviewReport;
  model?: string;
  durationMs?: number;
  targetStore?: ProjectStore;
}): ProjectBoardSynthesisProposal {
  const targetStore = input.targetStore ?? defaultProjectBoardSynthesisStore();
  const run = targetStore.getProjectBoardSynthesisRun(input.runId);
  const existingProposal =
    run?.proposalId && run.boardId === input.boardId ? targetStore.getProjectBoardSynthesisProposal(run.proposalId) : undefined;
  if (existingProposal?.status === "pending" && existingProposal.boardId === input.boardId) {
    return targetStore.updateProjectBoardSynthesisProposal({
      proposalId: existingProposal.id,
      synthesis: input.synthesis,
      reviewReport: input.reviewReport,
      model: input.model,
      durationMs: input.durationMs,
    });
  }
  return targetStore.createProjectBoardSynthesisProposal({
    boardId: input.boardId,
    synthesis: input.synthesis,
    reviewReport: input.reviewReport,
    model: input.model,
    durationMs: input.durationMs,
  });
}

function applyPmReviewActivationProposalToDraftInbox(proposal: ProjectBoardSynthesisProposal, targetStore: ProjectStore = defaultProjectBoardSynthesisStore()): {
  autoAcceptedSourceIds: string[];
  acceptedSourceIds: string[];
  mergedSourceIds: string[];
  draftCardIds: string[];
} {
  let reviewedProposal = proposal;
  const autoAcceptedSourceIds: string[] = [];
  for (const card of proposal.cards) {
    if (card.reviewStatus !== "pending") continue;
    reviewedProposal = targetStore.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: card.sourceId,
      reviewStatus: "accepted",
      reason: "Accepted automatically by Generate Draft Board from the lightweight PM Review recommendation.",
    });
    autoAcceptedSourceIds.push(card.sourceId);
  }
  const acceptedSourceIds = reviewedProposal.cards.filter((card) => card.reviewStatus === "accepted").map((card) => card.sourceId);
  const mergedSourceIds = reviewedProposal.cards
    .filter((card) => card.reviewStatus === "merged" && card.mergeTargetCardId)
    .map((card) => card.sourceId);
  const actionableSourceIds = new Set([...acceptedSourceIds, ...mergedSourceIds]);
  const summary = targetStore.applyProjectBoardSynthesisProposal({ proposalId: proposal.id });
  const draftCardIds = summary.cards
    .filter((card) => card.status === "draft" && card.sourceKind === "board_synthesis" && actionableSourceIds.has(card.sourceId))
    .map((card) => card.id);
  return { autoAcceptedSourceIds, acceptedSourceIds, mergedSourceIds, draftCardIds };
}


export async function suggestProjectBoardKickoffDefaults(
  input: SuggestProjectBoardKickoffDefaultsInput,
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
  host?: ProjectBoardSynthesisRuntimeHost,
): Promise<void> {
  const emitUpdate = () => emitProjectBoardState(targetStore, host);
  const board = targetStore.getProjectBoard(input.boardId);
  if (!board) throw new Error(`Project board not found: ${input.boardId}`);
  if (board.status !== "draft") throw new Error("Kickoff defaults can only be suggested before the project board charter is active.");
  const explicitQuestionIds = input.questionIds?.length ? [...new Set(input.questionIds)] : undefined;
  const targets = projectBoardKickoffDefaultSuggestionTargets(board.questions, board.sources, {
    questionIds: explicitQuestionIds,
    limit: 8,
  });
  const targetQuestionIds = [...new Set((explicitQuestionIds ?? targets.map((target) => target.questionId)).filter(Boolean))].slice(0, 20);

  if (targets.length === 0) {
    targetStore.applyProjectBoardKickoffDefaultSuggestions({
      boardId: board.id,
      targetQuestionIds,
      suggestions: [],
    });
    return;
  }

  const providerStatus = getAmbientProviderStatus(targetStore.getDefaultSettings().model);
  const sourceTelemetry = projectBoardSourceTelemetry(board.sources);
  const contextBrief = buildProjectBoardKickoffContextBrief({
    questions: board.questions,
    sources: board.sources,
    generatedAt: new Date().toISOString(),
  });
  const contextBriefCharCount = JSON.stringify(contextBrief).length;
  const run = targetStore.createProjectBoardSynthesisRun({
    boardId: board.id,
    model: providerStatus.model,
    initialStage: "kickoff_defaults",
    initialTitle: "Kickoff default suggestions started",
    initialSummary: `Suggesting editable kickoff defaults one question at a time for ${targets.length} unanswered question${
      targets.length === 1 ? "" : "s"
    }.`,
    initialMetadata: {
      model: providerStatus.model,
      helper: "kickoff_defaults",
      targetQuestionIds,
      sequential: true,
      contextBriefCharCount,
      contextBriefSourceCount: contextBrief.sourceNotes.length,
      durablePlanSourceCount: contextBrief.durablePlanSourceIds.length,
    },
    ...sourceTelemetry,
  });
  emitUpdate();
  targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: "kickoff_defaults",
    title: "Prepared kickoff context brief",
    summary: `Condensed ${contextBrief.sourceNotes.length} source note${contextBrief.sourceNotes.length === 1 ? "" : "s"} into a ${contextBriefCharCount.toLocaleString()} character kickoff brief before asking per-question defaults.`,
    metadata: {
      helper: "kickoff_defaults",
      contextBriefCharCount,
      contextBriefSourceCount: contextBrief.sourceNotes.length,
      durablePlanSourceIds: contextBrief.durablePlanSourceIds,
      includedSourceCount: contextBrief.includedSourceCount,
      ignoredSourceCount: contextBrief.ignoredSourceCount,
    },
    ...sourceTelemetry,
  });
  emitUpdate();
  const progressEmitter = createProjectBoardRunProgressEmitter(run.id, { targetStore, host });
  const requestStartedAt = Date.now();
  const provider = new AmbientProjectBoardKickoffDefaultProvider({
    model: providerStatus.model,
    baseUrl: providerStatus.baseUrl,
    retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
    ...ambientChatCompletionTransportTimeoutsFromEnv(),
  });
  let cumulativePromptCharCount = 0;
  let cumulativeResponseCharCount = 0;
  const appliedQuestionIds: string[] = [];
  const skippedQuestionIds: string[] = [];
  let providerError: string | undefined;

  for (const [index, target] of targets.entries()) {
    const position = index + 1;
    let activePromptCharCount = 0;
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "kickoff_defaults",
      title: `Suggesting kickoff default ${position}/${targets.length}`,
      summary: target.question,
      metadata: {
        helper: "kickoff_defaults",
        questionId: target.questionId,
        question: target.question,
        position,
        total: targets.length,
        contextBriefCharCount,
      },
      ...sourceTelemetry,
      promptCharCount: cumulativePromptCharCount || undefined,
      responseCharCount: cumulativeResponseCharCount || undefined,
      questionCount: appliedQuestionIds.length,
    });
    emitUpdate();
    try {
      const result = await provider.suggest({
        boardTitle: board.title,
        boardSummary: board.summary,
        questions: board.questions,
        sources: board.sources,
        contextBrief,
        questionIds: [target.questionId],
        onProgress: (progress) => {
          if (typeof progress.promptCharCount === "number" && progress.promptCharCount > 0) {
            activePromptCharCount = progress.promptCharCount;
          }
          const promptCharCount = cumulativePromptCharCount + activePromptCharCount;
          if (
            recordProjectBoardDirectHelperRetryActivity({
              store: targetStore,
              runId: run.id,
              stage: "kickoff_defaults",
              title: "Retrying Pi kickoff default",
              helperLabel: "kickoff default suggestion",
              progress: {
                ...progress,
                promptCharCount: promptCharCount || progress.promptCharCount,
                responseCharCount: cumulativeResponseCharCount + progress.responseCharCount,
              },
              flushProgress: () => progressEmitter.flush(),
            })
          ) {
            emitUpdate();
            return;
          }
          progressEmitter.update({
            stage: "kickoff_defaults",
            model: providerStatus.model,
            ...sourceTelemetry,
            promptCharCount: promptCharCount || cumulativePromptCharCount || undefined,
            responseCharCount: cumulativeResponseCharCount + progress.responseCharCount,
            questionCount: appliedQuestionIds.length,
            warningCount: skippedQuestionIds.length,
          });
        },
      });
      progressEmitter.flush();
      cumulativePromptCharCount += result.telemetry.promptCharCount;
      cumulativeResponseCharCount += result.telemetry.responseCharCount;
      const suggested = result.suggestions.filter((suggestion) => suggestion.questionId === target.questionId);
      const summary = targetStore.applyProjectBoardKickoffDefaultSuggestions({
        boardId: board.id,
        targetQuestionIds: [target.questionId],
        suggestions: suggested,
        model: providerStatus.model,
        telemetry: result.telemetry,
      });
      const applied = summary.questions.find((question) => question.id === target.questionId && question.suggestedAnswer?.trim());
      if (applied) appliedQuestionIds.push(target.questionId);
      else skippedQuestionIds.push(target.questionId);
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "kickoff_defaults",
        title: applied ? `Saved kickoff default ${position}/${targets.length}` : `No kickoff default returned ${position}/${targets.length}`,
        summary: applied
          ? `Ambient/Pi suggested an editable default for "${target.question}".`
          : `Ambient/Pi did not return a default for "${target.question}".`,
        metadata: {
          helper: "kickoff_defaults",
          questionId: target.questionId,
          question: target.question,
          position,
          total: targets.length,
          applied: Boolean(applied),
          telemetry: result.telemetry,
        },
        ...sourceTelemetry,
        promptCharCount: cumulativePromptCharCount,
        responseCharCount: cumulativeResponseCharCount,
        questionCount: appliedQuestionIds.length,
        warningCount: skippedQuestionIds.length,
      });
      emitUpdate();
    } catch (error) {
      progressEmitter.flush();
      providerError = error instanceof Error ? error.message : String(error);
      const remainingQuestionIds = targets.slice(index).map((remaining) => remaining.questionId);
      skippedQuestionIds.push(...remainingQuestionIds.filter((questionId) => !skippedQuestionIds.includes(questionId)));
      targetStore.applyProjectBoardKickoffDefaultSuggestions({
        boardId: board.id,
        targetQuestionIds: remainingQuestionIds,
        suggestions: [],
        model: providerStatus.model,
        telemetry: {
          promptCharCount: cumulativePromptCharCount + activePromptCharCount,
          responseCharCount: 0,
          requestDurationMs: Date.now() - requestStartedAt,
        },
        providerError,
      });
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "failed",
        title: "Pi kickoff defaults failed",
        summary: providerError,
        metadata: {
          helper: "kickoff_defaults",
          questionId: target.questionId,
          remainingQuestionIds,
          appliedQuestionIds,
          skippedQuestionIds,
          error: providerError,
        },
        ...sourceTelemetry,
        promptCharCount: cumulativePromptCharCount + activePromptCharCount || undefined,
        responseCharCount: cumulativeResponseCharCount || undefined,
        questionCount: appliedQuestionIds.length,
        warningCount: skippedQuestionIds.length,
        status: "failed",
        error: providerError,
        completedAt: new Date().toISOString(),
        skipPlanningSnapshot: true,
      });
      emitUpdate();
      break;
    }
  }

  if (!providerError) {
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "kickoff_defaults",
      title: "Kickoff default suggestions finished",
      summary: `Applied ${appliedQuestionIds.length} of ${targets.length} editable kickoff default${targets.length === 1 ? "" : "s"}.`,
      metadata: {
        helper: "kickoff_defaults",
        targetQuestionIds,
        appliedQuestionIds,
        skippedQuestionIds,
        sequential: true,
        requestDurationMs: Date.now() - requestStartedAt,
      },
      ...sourceTelemetry,
      promptCharCount: cumulativePromptCharCount,
      responseCharCount: cumulativeResponseCharCount,
      questionCount: appliedQuestionIds.length,
      warningCount: skippedQuestionIds.length,
      status: "succeeded",
      completedAt: new Date().toISOString(),
      skipPlanningSnapshot: true,
    });
    emitUpdate();
  }
}


export async function refineProjectBoardSynthesisForProjectHost(
  host: ProjectBoardSynthesisRuntimeHost,
  input: RefineProjectBoardSynthesisInput,
): Promise<DesktopState> {
  const targetStore = host.store;
  const synthesisMode = input.mode ?? "board_synthesis";
  const board = requireProjectBoardForAction(input.boardId, targetStore);
  if (synthesisMode === "charter_review") {
    assertProjectBoardCharterReviewAllowed(board);
  } else if (synthesisMode === "source_elaboration") {
    assertProjectBoardCardGenerationAllowed(board, "Add Cards");
  } else {
    assertProjectBoardCardGenerationAllowed(board, "Board synthesis");
  }
  const startedAt = Date.now();
  const model = targetStore.getDefaultSettings().model;
  const previousProposal = input.proposalId
    ? targetStore.getProjectBoardSynthesisProposal(input.proposalId)
    : targetStore.getLatestPendingProjectBoardSynthesisProposal(input.boardId);
  if (input.proposalId && !previousProposal) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
  if (previousProposal && previousProposal.boardId !== input.boardId) throw new Error("Project board synthesis proposal does not belong to this board.");
  const prepared = prepareProjectBoardSynthesisRun({
    boardId: input.boardId,
    model,
    intent: synthesisMode === "source_elaboration" && input.objective?.trim()
      ? "add cards from objective"
      : synthesisMode === "source_elaboration"
        ? "add cards from sources"
        : synthesisMode === "charter_review"
          ? "charter review"
        : "PM review synthesis",
  }, targetStore, host);
  if (prepared.reused) {
    return readStateForProjectHostAction(host);
  }
  const run = prepared.run;
  projectBoardSynthesisPauseRequests.delete(run.id);
  const synthesisAbortController = new AbortController();
  projectBoardSynthesisAbortControllers.set(run.id, synthesisAbortController);
  const progressEmitter = createProjectBoardRunProgressEmitter(run.id, { targetStore, host });
  let progressiveRecordsPersisted = false;
  const shouldPause = () => isProjectBoardSynthesisPauseRequested(run.id, targetStore);
  const abortIfPauseRequested = () =>
    abortProjectBoardSynthesisForPause(run.id, "Project-board PM Review planning pause requested for this synthesis run.", targetStore);
  emitProjectStateIfActive(host);
  try {
    const sources = await scanSourcesForProjectBoard(input.boardId, targetStore);
    const sourceTelemetry = projectBoardSourceTelemetry(sources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "source_scan",
      title: "Scanned project sources",
      summary: `Scanned ${sourceTelemetry.sourceCount} source${sourceTelemetry.sourceCount === 1 ? "" : "s"} and kept ${sourceTelemetry.includedSourceCount} for synthesis.`,
      metadata: sourceTelemetry,
      ...sourceTelemetry,
    });
    emitProjectStateIfActive(host);
    let persistedSources = targetStore.replaceProjectBoardSources(input.boardId, sources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "sources_persisted",
      title: "Persisted source snapshot",
      summary: `Saved ${persistedSources.length} source record${persistedSources.length === 1 ? "" : "s"} for this PM synthesis run.`,
      metadata: { persistedSourceCount: persistedSources.length },
    });
    emitProjectStateIfActive(host);
    persistedSources = await classifyProjectBoardSourcesWithPi(input.boardId, persistedSources, { model, runId: run.id, targetStore, host });
    abortIfPauseRequested();
    await refreshProjectBoardCharterSummaryWithPi(input.boardId, persistedSources, {
      model,
      runId: run.id,
      signal: synthesisAbortController.signal,
      targetStore,
      host,
    });
    abortIfPauseRequested();
    const sourceSelection = selectProjectBoardSynthesisSources(persistedSources, input.sourceIds);
    const synthesisSources = sourceSelection.sources;
    const addCardsObjective = synthesisMode === "source_elaboration" ? input.objective?.trim() : undefined;
    if (sourceSelection.selected) {
      const scopedTelemetry = projectBoardSourceTelemetry(synthesisSources);
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "sources_persisted",
        title: "Selected source scope",
        summary: `Elaborating cards from ${synthesisSources.length} selected source${synthesisSources.length === 1 ? "" : "s"} without replacing existing board work.`,
        metadata: { selectedSourceIds: sourceSelection.selectedSourceIds, ...scopedTelemetry },
        ...scopedTelemetry,
      });
      emitProjectStateIfActive(host);
    }
    if (addCardsObjective) {
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "sources_persisted",
        title: "Captured Add Cards objective",
        summary: `Using a ${addCardsObjective.length.toLocaleString()} character objective to elaborate net-new cards without replacing existing board work.`,
        metadata: {
          objectiveCharCount: addCardsObjective.length,
          selectedSourceScope: sourceSelection.selected,
          selectedSourceIds: sourceSelection.selectedSourceIds,
        },
      });
      emitProjectStateIfActive(host);
    }
    const addCardsObjectiveProvenanceContext = {
      objective: addCardsObjective,
      selectedSourceScope: sourceSelection.selected,
      selectedSourceIds: sourceSelection.selectedSourceIds,
      sourceContextAvailable: synthesisSources.length > 0,
    };
    const deterministicBaseline = synthesizeProjectBoardDraft(synthesisSources);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "deterministic_baseline",
      title: "Built deterministic baseline",
      summary: `Prepared a baseline with ${deterministicBaseline.cards.length} card${deterministicBaseline.cards.length === 1 ? "" : "s"} before asking Pi.`,
      metadata: { cardCount: deterministicBaseline.cards.length, questionCount: deterministicBaseline.questions.length },
      cardCount: deterministicBaseline.cards.length,
      questionCount: deterministicBaseline.questions.length,
    });
    emitProjectStateIfActive(host);
    const charterAnswers = projectBoardAnsweredQuestionsForRefinement(input.boardId, targetStore);
    const activeBoard = targetStore.getProjectBoard(input.boardId);
    const charterProjectSummary = activeBoard?.id === input.boardId ? activeBoard.charter?.projectSummary : undefined;
    const sourceScopeAnswers = projectBoardSourceScopeAnswersForRefinement({
      boardId: input.boardId,
      board: activeBoard,
      sources: synthesisSources,
      mode: synthesisMode,
      selectedSourceScope: sourceSelection.selected,
      objective: addCardsObjective,
    });
    const proposalAnswers: ProjectBoardSynthesisRefinementAnswer[] =
      previousProposal?.answers.map((answer) => ({ question: `PM Review: ${answer.question}`, answer: answer.answer, source: "pm_review" })) ?? [];
    const pmReviewActivationReport =
      synthesisMode === "board_synthesis" && previousProposal?.reviewReport ? previousProposal.reviewReport : undefined;
    const refinement =
      sourceScopeAnswers.length > 0 || charterAnswers.length > 0 || proposalAnswers.length > 0 || pmReviewActivationReport
        ? {
            previousDraft: previousProposal ? projectBoardSynthesisDraftFromProposal(previousProposal) : deterministicBaseline,
            answers: [...sourceScopeAnswers, ...charterAnswers, ...proposalAnswers],
            // The caller knows which flow this is; never re-infer it from answer text.
            mode: synthesisMode === "source_elaboration" ? ("additive" as const) : ("refine" as const),
            ...(pmReviewActivationReport ? { pmReviewReport: pmReviewActivationReport } : {}),
          }
          : undefined;
    const provider = createProjectBoardSynthesisProvider(model, targetStore);
    if (synthesisMode === "charter_review") {
      const pmReviewGitContext = await projectBoardPmReviewGitContextForBoard(input.boardId, targetStore);
      const result = await provider.reviewCharterWithTelemetry({
        sources: synthesisSources,
        projectName: targetStore.getWorkspace().name,
        refinement,
        ...(charterProjectSummary ? { charterProjectSummary } : {}),
        gitContext: pmReviewGitContext,
        onProgress: (progress) => {
          if (progress.metadata?.streaming === true) {
            progressEmitter.update({
              stage: progress.stage,
              promptCharCount: progress.promptCharCount,
              responseCharCount: progress.responseCharCount,
              cardCount: progress.cardCount,
              questionCount: progress.questionCount,
            });
            abortIfPauseRequested();
            return;
          }
          progressEmitter.flush();
          targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
            stage: progress.stage,
            title: progress.title,
            summary: progress.summary,
            metadata: progress.metadata,
            promptCharCount: progress.promptCharCount,
            responseCharCount: progress.responseCharCount,
            cardCount: progress.cardCount,
            questionCount: progress.questionCount,
          });
          emitProjectStateIfActive(host);
          abortIfPauseRequested();
        },
        signal: synthesisAbortController.signal,
      });
      recordProjectBoardSynthesisProgressiveRecords(run.id, result.draft, synthesisSources, undefined, undefined, targetStore);
      const proposal = createOrUpdateProjectBoardSynthesisProposalForRun({
        boardId: input.boardId,
        runId: run.id,
        synthesis: result.draft,
        reviewReport: result.reviewReport,
        model,
        durationMs: Date.now() - startedAt,
        targetStore,
      });
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "proposal_created",
        title: "Created lightweight PM Review report",
        summary: `Created a zero-card charter review report with ${result.reviewReport.blockingQuestions.length} blocking question${
          result.reviewReport.blockingQuestions.length === 1 ? "" : "s"
        } and readiness ${result.reviewReport.readiness.replace(/_/g, " ")}.`,
        metadata: {
          ...result.telemetry,
          proposalId: proposal.id,
          readiness: result.reviewReport.readiness,
          sourceConfidence: result.reviewReport.sourceConfidence,
          gitState: result.reviewReport.gitState,
          reviewReport: true,
          cardCount: 0,
          questionCount: result.reviewReport.blockingQuestions.length,
          generatedCardPolicy: "zero_cards",
        },
        status: "succeeded",
        proposalId: proposal.id,
        promptCharCount: result.telemetry.promptCharCount,
        responseCharCount: result.telemetry.responseCharCount,
        cardCount: 0,
        questionCount: result.telemetry.questionCount,
        completedAt: new Date().toISOString(),
      });
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      emitProjectStateIfActive(host);
      return readStateForProjectHostAction(host);
    }
    const plannerWorkspace = await createProjectBoardPlannerWorkspace({
      projectPath: targetStore.getWorkspace().path,
      boardId: input.boardId,
      runId: run.id,
      projectName: targetStore.getWorkspace().name,
      operation: synthesisMode === "source_elaboration" ? "source_elaboration" : "board_synthesis",
      sources: synthesisSources,
    });
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "sources_persisted",
      title: "Prepared planner session workspace",
      summary: `Wrote ${plannerWorkspace.sources.length} source file${
        plannerWorkspace.sources.length === 1 ? "" : "s"
      }, a planner-session descriptor, ledger, and JSONL output targets for Pi planning artifacts.`,
      metadata: {
        plannerSessionId: plannerWorkspace.sessionId,
        plannerWorkspaceRoot: plannerWorkspace.rootPath,
        plannerSessionDescriptor: plannerWorkspace.sessionPath,
        plannerLedgerPath: plannerWorkspace.ledgerPath,
        plannerWorkspaceManifest: plannerWorkspace.manifestPath,
        aggregateJsonlPath: plannerWorkspace.aggregateJsonlPath,
        sourceFileCount: plannerWorkspace.sources.length,
        batchPolicy: plannerWorkspace.batchPolicy,
        executionMode: "pi_session_stream",
        compatibilityFallback: "direct_chat_compat",
        sourceElaboration: synthesisMode === "source_elaboration",
        addCardsObjective: Boolean(addCardsObjective),
        addCardsObjectiveCharCount: addCardsObjective?.length,
        pmReviewActivation: Boolean(pmReviewActivationReport),
        pmReviewReadiness: pmReviewActivationReport?.readiness,
        pmReviewConstraintCount: pmReviewActivationReport?.cardGenerationConstraints.length,
      },
    });
    emitProjectStateIfActive(host);
    const onProgress = (progress: AmbientProjectBoardSynthesisProgress) => {
      if (progress.metadata?.streaming === true) {
        progressEmitter.update({
          stage: progress.stage,
          promptCharCount: progress.promptCharCount,
          responseCharCount: progress.responseCharCount,
          cardCount: progress.cardCount,
          questionCount: progress.questionCount,
        });
        abortIfPauseRequested();
        return;
      }
      progressEmitter.flush();
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: progress.stage,
        title: progress.title,
        summary: progress.summary,
        metadata: progress.metadata,
        promptCharCount: progress.promptCharCount,
        responseCharCount: progress.responseCharCount,
        cardCount: progress.cardCount,
        questionCount: progress.questionCount,
      });
      emitProjectStateIfActive(host);
      abortIfPauseRequested();
    };
    const onProgressiveRecords = (batch: AmbientProjectBoardSynthesisProgressiveBatch) => {
      progressiveRecordsPersisted = true;
      progressEmitter.flush();
      const annotatedBatch = annotateProjectBoardProgressiveRecordsWithObjectiveProvenance(
        batch.records,
        addCardsObjectiveProvenanceContext,
      );
      recordProjectBoardSynthesisProgressiveBatch(
        run.id,
        {
          ...batch,
          records: [...annotatedBatch.records, ...annotatedBatch.warningRecords],
          accumulatedRecordCount: batch.accumulatedRecordCount + annotatedBatch.warningRecords.length,
        },
        targetStore,
      );
      const progressiveProposal = upsertProjectBoardProgressiveProposalFromRun({
        boardId: input.boardId,
        runId: run.id,
        fallback: previousProposal ? projectBoardSynthesisDraftFromProposal(previousProposal) : deterministicBaseline,
        model,
        startedAt,
        targetStore,
      });
      if (pmReviewActivationReport && progressiveProposal?.cards.length) {
        const pmReviewProgressiveDraftInboxApply = applyPmReviewActivationProposalToDraftInbox(progressiveProposal, targetStore);
        targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
          stage: "board_applied",
          title: "Rendered PM Review activation cards to Draft Inbox",
          summary: `Draft Inbox now has ${pmReviewProgressiveDraftInboxApply.draftCardIds.length} generated activation card${
            pmReviewProgressiveDraftInboxApply.draftCardIds.length === 1 ? "" : "s"
          } from the lightweight PM Review recommendation while planning continues.`,
          metadata: {
            proposalId: progressiveProposal.id,
            pmReviewActivation: true,
            progressive: true,
            autoAcceptedSourceIds: pmReviewProgressiveDraftInboxApply.autoAcceptedSourceIds,
            acceptedSourceIds: pmReviewProgressiveDraftInboxApply.acceptedSourceIds,
            mergedSourceIds: pmReviewProgressiveDraftInboxApply.mergedSourceIds,
            draftCardIds: pmReviewProgressiveDraftInboxApply.draftCardIds,
          },
          proposalId: progressiveProposal.id,
          cardCount: pmReviewProgressiveDraftInboxApply.draftCardIds.length,
        });
      }
      emitProjectStateIfActive(host);
      abortIfPauseRequested();
    };
    let result: Awaited<ReturnType<AmbientProjectBoardSynthesisProvider["synthesizePlannerBatchesWithTelemetry"]>>;
    try {
      result = projectBoardShouldUseSectionedPlanningForWorkflow(synthesisSources, refinement)
        ? await provider.synthesizeSectionedWithTelemetry({
            sources: synthesisSources,
            projectName: targetStore.getWorkspace().name,
            refinement,
            ...(charterProjectSummary ? { charterProjectSummary } : {}),
            onProgress,
            onProgressiveRecords,
            plannerWorkspace,
            shouldPause,
            signal: synthesisAbortController.signal,
          })
        : await provider.synthesizePlannerBatchesWithTelemetry({
            sources: synthesisSources,
            projectName: targetStore.getWorkspace().name,
            refinement,
            ...(charterProjectSummary ? { charterProjectSummary } : {}),
            onProgress,
            onProgressiveRecords,
            plannerWorkspace,
            shouldPause,
            signal: synthesisAbortController.signal,
          });
    } catch (error) {
      if (synthesisMode !== "source_elaboration" || !isRecoverableEmptyPlannerCardFailure(error)) throw error;
      const recoveredDraft = deterministicProjectBoardSourceElaborationDraft({
        sources: synthesisSources,
        objective: addCardsObjective,
        projectName: targetStore.getWorkspace().name,
      });
      const recoveredRecords = projectBoardProgressiveRecordsFromDraft({ draft: recoveredDraft, sources: synthesisSources });
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "schema_validation",
        title: "Recovered deterministic Add Cards proposal",
        summary: `Ambient/Pi did not return candidate cards for the selected source scope, so Ambient recovered ${recoveredDraft.cards.length} deterministic card${
          recoveredDraft.cards.length === 1 ? "" : "s"
        } from the promoted source artifact.`,
        metadata: {
          recovery: "deterministic_source_elaboration",
          providerFailure: projectBoardSynthesisErrorMessage(error),
          selectedSourceIds: sourceSelection.selectedSourceIds,
          sourceElaboration: true,
          cardCount: recoveredDraft.cards.length,
          progressiveRecordCount: recoveredRecords.length,
        },
        promptCharCount: 0,
        responseCharCount: 0,
        cardCount: recoveredDraft.cards.length,
        questionCount: recoveredDraft.questions.length,
      });
      emitProjectStateIfActive(host);
      result = {
        draft: recoveredDraft,
        progressiveRecords: recoveredRecords,
        telemetry: {
          promptCharCount: 0,
          responseCharCount: 0,
          requestDurationMs: Date.now() - startedAt,
          cardCount: recoveredDraft.cards.length,
          questionCount: recoveredDraft.questions.length,
          progressiveRecordCount: recoveredRecords.length,
          partial: true,
        },
      };
    }
    progressEmitter.flush();
    const pauseRequestedAfterResult = result.telemetry.paused || isProjectBoardSynthesisPauseRequested(run.id, targetStore);
    const objectiveAnnotatedDraft = annotateProjectBoardDraftWithObjectiveProvenance(
      result.draft,
      addCardsObjectiveProvenanceContext,
    );
    const synthesisDraft = objectiveAnnotatedDraft.draft;
    const resultProgressiveRecordAnnotation = result.progressiveRecords
      ? annotateProjectBoardProgressiveRecordsWithObjectiveProvenance(
          result.progressiveRecords,
          addCardsObjectiveProvenanceContext,
        )
      : undefined;
    const resultProgressiveRecords = resultProgressiveRecordAnnotation
      ? [...resultProgressiveRecordAnnotation.records, ...resultProgressiveRecordAnnotation.warningRecords]
      : objectiveAnnotatedDraft.warningRecords.length > 0
        ? [
            ...projectBoardProgressiveRecordsFromDraft({
              draft: synthesisDraft,
              sources: synthesisSources,
            }),
            ...objectiveAnnotatedDraft.warningRecords,
          ]
        : undefined;
    if (!progressiveRecordsPersisted) {
      recordProjectBoardSynthesisProgressiveRecords(run.id, synthesisDraft, synthesisSources, undefined, resultProgressiveRecords, targetStore);
    }
    recordProjectBoardSynthesisCardBuildEvents(run.id, synthesisDraft.cards, targetStore);
    emitProjectStateIfActive(host);
    const proposal = createOrUpdateProjectBoardSynthesisProposalForRun({
      boardId: input.boardId,
      runId: run.id,
      synthesis: synthesisDraft,
      model,
      durationMs: Date.now() - startedAt,
      targetStore,
    });
    const pmReviewDraftInboxApply = pmReviewActivationReport ? applyPmReviewActivationProposalToDraftInbox(proposal, targetStore) : undefined;
    const partialSectionSummary =
      result.telemetry.failedSectionCount && result.telemetry.failedSectionCount > 0
        ? ` ${result.telemetry.failedSectionCount} source section${result.telemetry.failedSectionCount === 1 ? "" : "s"} failed and can be retried.`
        : "";
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "proposal_created",
      title: result.telemetry.partial ? "Created partial PM Review proposal" : "Created PM Review proposal",
      summary: `Created a reviewable proposal with ${synthesisDraft.cards.length} card${
        synthesisDraft.cards.length === 1 ? "" : "s"
      } and ${synthesisDraft.questions.length} question${synthesisDraft.questions.length === 1 ? "" : "s"}.${partialSectionSummary}`,
      metadata: {
        proposalId: proposal.id,
        ...result.telemetry,
        pmReviewActivationDraftInboxApplied: Boolean(pmReviewDraftInboxApply),
        pmReviewActivationDraftCardCount: pmReviewDraftInboxApply?.draftCardIds.length,
      },
      status: pmReviewDraftInboxApply ? undefined : "succeeded",
      proposalId: proposal.id,
      promptCharCount: result.telemetry.promptCharCount,
      responseCharCount: result.telemetry.responseCharCount,
      cardCount: result.telemetry.cardCount,
      questionCount: result.telemetry.questionCount,
      completedAt: pmReviewDraftInboxApply || pauseRequestedAfterResult ? undefined : new Date().toISOString(),
    });
    if (pmReviewDraftInboxApply) {
      targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
        stage: "board_applied",
        title: "Generated Draft Inbox cards from PM Review",
        summary: `Applied ${pmReviewDraftInboxApply.draftCardIds.length} generated draft card${
          pmReviewDraftInboxApply.draftCardIds.length === 1 ? "" : "s"
        } from the lightweight PM Review recommendation.`,
        metadata: {
          proposalId: proposal.id,
          pmReviewActivation: true,
          autoAcceptedSourceIds: pmReviewDraftInboxApply.autoAcceptedSourceIds,
          acceptedSourceIds: pmReviewDraftInboxApply.acceptedSourceIds,
          mergedSourceIds: pmReviewDraftInboxApply.mergedSourceIds,
          draftCardIds: pmReviewDraftInboxApply.draftCardIds,
        },
        status: pauseRequestedAfterResult ? undefined : "succeeded",
        proposalId: proposal.id,
        promptCharCount: result.telemetry.promptCharCount,
        responseCharCount: result.telemetry.responseCharCount,
        cardCount: pmReviewDraftInboxApply.draftCardIds.length,
        questionCount: result.telemetry.questionCount,
        completedAt: pauseRequestedAfterResult ? undefined : new Date().toISOString(),
      });
    }
    if (pauseRequestedAfterResult) {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      targetStore.markProjectBoardSynthesisRunPaused({
        boardId: input.boardId,
        runId: run.id,
        reason: result.telemetry.paused
          ? "PM Review planning paused at the requested checkpoint."
          : "PM Review planning paused after the synthesis result completed while a pause was requested.",
        metadata: {
          durationMs: Date.now() - startedAt,
          pauseRequestedAfterResult: !result.telemetry.paused,
          pmReviewActivation: Boolean(pmReviewActivationReport),
          progressiveRecordsPersisted,
          ...result.telemetry,
        },
      });
      emitProjectStateIfActive(host);
    } else {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      if (pmReviewDraftInboxApply && pmReviewDraftInboxApply.draftCardIds.length > 0) {
        await consolidateProjectBoardSynthesisCandidates({ boardId: input.boardId, runId: run.id, model, targetStore, host });
      }
    }
  } catch (error) {
    if (isProjectBoardSynthesisPauseRequested(run.id, targetStore) || synthesisAbortController.signal.aborted) {
      projectBoardSynthesisPauseRequests.delete(run.id);
      projectBoardSynthesisAbortControllers.delete(run.id);
      progressEmitter.flush();
      const abortReason =
        synthesisAbortController.signal.reason instanceof Error
          ? synthesisAbortController.signal.reason.message
          : synthesisAbortController.signal.aborted
            ? "Transport aborted after pause was requested."
            : error instanceof Error
              ? error.message
              : String(error);
      targetStore.markProjectBoardSynthesisRunPaused({
        boardId: input.boardId,
        runId: run.id,
        reason: "PM Review planning paused after canceling the active Ambient/Pi stream.",
        metadata: {
          durationMs: Date.now() - startedAt,
          transportAbort: true,
          abortReason,
          progressiveRecordsPersisted,
        },
      });
      emitProjectStateIfActive(host);
      return readStateForProjectHostAction(host);
    }
    projectBoardSynthesisPauseRequests.delete(run.id);
    projectBoardSynthesisAbortControllers.delete(run.id);
    progressEmitter.flush();
    const message = error instanceof Error ? error.message : String(error);
    targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "failed",
      title: "Synthesis run failed",
      summary: message,
      metadata: { error: message },
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    emitProjectStateIfActive(host);
    throw error;
  }
  return readStateForProjectHostAction(host);
}
