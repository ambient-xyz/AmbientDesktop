import { dirname } from "node:path";
import type {
  ProjectBoardPmReviewReport,
  ProjectBoardSource,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunStage,
  RetryProjectBoardSynthesisInput,
} from "../../shared/projectBoardTypes";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardPlannerContinuationForRetry, type ProjectBoardPlannerBatchContinuation } from "./projectBoardPlannerContinuation";
import { readProjectBoardPlannerWorkspaceRecordsFromRoot } from "./projectBoardPlannerWorkspace";
import { ProjectStore } from "./projectBoardProjectStoreFacade";
import {
  projectBoardProgressiveRecordsFromDraft,
  projectBoardSynthesisDraftFromProgressiveRecords,
} from "./projectBoardProgressivePlanning";
import type { ProjectBoardSynthesisDraft } from "./projectBoardSynthesis";
import type { AmbientProjectBoardSynthesisProgressiveBatch } from "./projectBoardSynthesisProvider";

export interface ProjectBoardSynthesisDesktopProgressHost {
  store: ProjectStore;
}

export type ProjectBoardRunProgressPatch = {
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

export const PROJECT_BOARD_RUN_PROGRESS_EMIT_INTERVAL_MS = 2_000;

export function createProjectBoardRunProgressEmitter(
  runId: string,
  options: {
    intervalMs?: number;
    targetStore: ProjectStore;
    host?: ProjectBoardSynthesisDesktopProgressHost;
    emitProjectBoardState(targetStore: ProjectStore, host?: ProjectBoardSynthesisDesktopProgressHost): void;
  },
) {
  let latest: ProjectBoardRunProgressPatch | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const targetStore = options.targetStore;
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
      options.emitProjectBoardState(targetStore, options.host);
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

export function projectBoardValidatedProgressiveRecordsFromRun(
  runId: string | undefined,
  targetStore: ProjectStore,
): ProposalJsonlRecordArtifact[] {
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

export interface ProjectBoardRetryResumeRecords {
  records: ProposalJsonlRecordArtifact[];
  continuation?: ProjectBoardPlannerBatchContinuation;
}

export async function projectBoardValidatedProgressiveRecordsForRetry(
  runId: string | undefined,
  options: { mode?: RetryProjectBoardSynthesisInput["mode"]; targetStore: ProjectStore },
): Promise<ProjectBoardRetryResumeRecords> {
  const targetStore = options.targetStore;
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

export function applyProjectBoardIncrementalSynthesisFromRun(input: {
  boardId: string;
  runId: string;
  fallback: ProjectBoardSynthesisDraft;
  model?: string;
  startedAt: number;
  replaceExistingDraft: boolean;
  sourceIdNamespace?: string;
  targetStore: ProjectStore;
}): void {
  const targetStore = input.targetStore;
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

export function recordProjectBoardSynthesisCardBuildEvents(
  runId: string,
  cards: ProjectBoardSynthesisDraft["cards"],
  targetStore: ProjectStore,
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

export function recordProjectBoardSynthesisProgressiveRecords(
  runId: string,
  draft: ProjectBoardSynthesisDraft,
  sources: ProjectBoardSource[],
  proposalId: string | undefined,
  records: ProposalJsonlRecordArtifact[] | undefined,
  targetStore: ProjectStore,
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

export function recordProjectBoardSynthesisProgressiveBatch(
  runId: string,
  batch: AmbientProjectBoardSynthesisProgressiveBatch,
  targetStore: ProjectStore,
): void {
  const candidateCount = batch.records.filter((record) => record.type === "candidate_card").length;
  const questionCount = batch.records.filter((record) => record.type === "question").length;
  const coverageCount = batch.records.filter((record) => record.type === "source_coverage").length;
  const errorCount = batch.records.filter((record) => record.type === "error").length;
  const semanticIdleCount = batch.records.filter(
    (record) => record.type === "error" && record.code === "section_semantic_idle_timeout",
  ).length;
  const sectionStatus = batch.records.find((record) => record.type === "progress" && typeof record.metadata.sectionStatus === "string");
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

export function upsertProjectBoardProgressiveProposalFromRun(input: {
  boardId: string;
  runId: string;
  fallback: ProjectBoardSynthesisDraft;
  model?: string;
  startedAt: number;
  targetStore: ProjectStore;
}): ProjectBoardSynthesisProposal | undefined {
  const targetStore = input.targetStore;
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
    existingRun?.proposalId && existingRun.boardId === input.boardId
      ? targetStore.getProjectBoardSynthesisProposal(existingRun.proposalId)
      : undefined;
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

export function createOrUpdateProjectBoardSynthesisProposalForRun(input: {
  boardId: string;
  runId: string;
  synthesis: ProjectBoardSynthesisDraft;
  reviewReport?: ProjectBoardPmReviewReport;
  model?: string;
  durationMs?: number;
  targetStore: ProjectStore;
}): ProjectBoardSynthesisProposal {
  const targetStore = input.targetStore;
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
