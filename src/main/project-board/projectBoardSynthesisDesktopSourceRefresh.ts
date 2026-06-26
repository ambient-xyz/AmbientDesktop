import type { ProjectBoardCharterProjectSummary, ProjectBoardSource } from "../../shared/projectBoardTypes";
import { ambientChatCompletionTransportTimeoutsFromEnv, ambientRetryPolicyFromSettings } from "./projectBoardAmbientFacade";
import {
  AmbientProjectBoardCharterSummaryProvider,
  type AmbientProjectBoardCharterSummaryResult,
} from "./projectBoardCharterSummaryProvider";
import { recordProjectBoardDirectHelperRetryActivity } from "./projectBoardDirectHelperRetryActivity";
import type { ProjectStore } from "./projectBoardProjectStoreFacade";
import { projectBoardSourceDeterministicAuthorityLocked, projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import {
  AmbientProjectBoardSourceClassifierProvider,
  type AmbientProjectBoardSourceBatchedClassificationResult,
} from "./projectBoardSourceClassifierProvider";
import { scanProjectBoardSources } from "./projectBoardSources";
import { synthesizeProjectBoardDraft } from "./projectBoardSynthesis";
import { createProjectBoardRunProgressEmitter } from "./projectBoardSynthesisDesktopProgress";

type ProjectBoardSourceTelemetryInput = Pick<
  ProjectBoardSource,
  "authorityRole" | "excerpt" | "includeInSynthesis" | "kind" | "path" | "summary" | "title"
>;

export interface ProjectBoardSynthesisSourceRefreshHost {
  store: ProjectStore;
}

export interface ProjectBoardSynthesisDesktopSourceRefreshServices {
  store(): ProjectStore;
  emitProjectBoardState(targetStore: ProjectStore, host?: ProjectBoardSynthesisSourceRefreshHost): void;
}

let projectBoardSynthesisDesktopSourceRefreshServices: ProjectBoardSynthesisDesktopSourceRefreshServices | undefined;

export function configureProjectBoardSynthesisDesktopSourceRefreshServices(
  dependencies: ProjectBoardSynthesisDesktopSourceRefreshServices,
): void {
  projectBoardSynthesisDesktopSourceRefreshServices = dependencies;
}

function services(): ProjectBoardSynthesisDesktopSourceRefreshServices {
  if (!projectBoardSynthesisDesktopSourceRefreshServices)
    throw new Error("Project Board synthesis desktop source refresh service has not been configured.");
  return projectBoardSynthesisDesktopSourceRefreshServices;
}

function defaultProjectBoardSynthesisStore(): ProjectStore {
  return services().store();
}

function emitProjectBoardState(
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
  host?: ProjectBoardSynthesisSourceRefreshHost,
): void {
  services().emitProjectBoardState(targetStore, host);
}

function ambientRetryPolicyFromCurrentSettings(targetStore: ProjectStore = defaultProjectBoardSynthesisStore()) {
  const modelRuntimeSettings = targetStore.getModelRuntimeSettings();
  return modelRuntimeSettings.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings }) : undefined;
}

export async function scanSourcesForProjectBoard(
  boardId: string,
  targetStore: ProjectStore = defaultProjectBoardSynthesisStore(),
): Promise<Awaited<ReturnType<typeof scanProjectBoardSources>>> {
  const board = targetStore.getProjectBoard(boardId);
  return scanProjectBoardSources(targetStore, {
    workspacePath: board?.projectPath ?? targetStore.getWorkspace().path,
    threadId: board?.sourceThreadId,
  });
}

export async function refreshProjectBoardSources(
  boardId: string,
  options: {
    synthesize?: boolean;
    runId?: string;
    model?: string;
    targetStore?: ProjectStore;
    host?: ProjectBoardSynthesisSourceRefreshHost;
  } = {},
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

export async function classifyProjectBoardSourcesWithPi(
  boardId: string,
  sources: ProjectBoardSource[],
  options: { model?: string; runId?: string; targetStore?: ProjectStore; host?: ProjectBoardSynthesisSourceRefreshHost } = {},
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
  const progressEmitter = runId
    ? createProjectBoardRunProgressEmitter(runId, { targetStore, host: options.host, emitProjectBoardState })
    : undefined;
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
    failedAttempts > 0 ? ` after ${failedAttempts} failed classification batch attempt${failedAttempts === 1 ? "" : "s"}` : "";
  if (piCount === 0) {
    return `Using fallback source classifications for ${fallbackCount} project source${fallbackCount === 1 ? "" : "s"}${failedAttemptPart}.`;
  }
  return `Ambient/Pi classified ${piPart}; ${fallbackCount} project source${fallbackCount === 1 ? "" : "s"} kept fallback classification${failedAttemptPart}.`;
}

export async function refreshProjectBoardCharterSummaryWithPi(
  boardId: string,
  sources: ProjectBoardSource[],
  options: {
    model?: string;
    runId?: string;
    force?: boolean;
    signal?: AbortSignal;
    targetStore?: ProjectStore;
    host?: ProjectBoardSynthesisSourceRefreshHost;
  } = {},
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
  const progressEmitter = runId
    ? createProjectBoardRunProgressEmitter(runId, { targetStore, host: options.host, emitProjectBoardState })
    : undefined;
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

export function projectBoardSourceTelemetry(sources: ProjectBoardSourceTelemetryInput[]) {
  const included = sources.filter(projectBoardSourceIncludedInSynthesis);
  const sourceCharCount = included.reduce(
    (total, source) => total + source.title.length + source.summary.length + (source.excerpt?.length ?? 0) + (source.path?.length ?? 0),
    0,
  );
  return { sourceCount: sources.length, includedSourceCount: included.length, sourceCharCount };
}
