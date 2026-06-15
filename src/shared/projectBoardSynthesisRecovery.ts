import type { ProjectBoardSynthesisRun } from "./types";

export const DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS = 5 * 60 * 1000;

export interface ProjectBoardSectionStatusView {
  key: string;
  status: "succeeded" | "failed" | "skipped" | "pending";
  sectionIndex?: number;
  sectionCount?: number;
  sourcePath?: string;
  sectionHeading?: string;
  failureKind?: string;
  summary: string;
  updatedAt: string;
}

export interface ProjectBoardSynthesisPartialStatus {
  failedCount: number;
  completedCount: number;
  reusedCount: number;
  sectionCount: number;
  hasFailedSections: boolean;
  hasPartialProposal: boolean;
  deferred: boolean;
  failedSectionIds: string[];
  failedSectionHeadings: string[];
  summary: string;
}

export interface ProjectBoardSynthesisStaleRecovery {
  stale: boolean;
  idleMs: number;
  completedCount: number;
  reusedCount: number;
  failedCount: number;
  sectionCount: number;
  summary: string;
}

export interface ProjectBoardSynthesisOutputCapRecovery {
  canContinue: boolean;
  finishReason?: string;
  stopReason?: string;
  outputTokenBudget?: number;
  lastValidRecordId?: string;
  lastValidRecordType?: string;
  lastValidRecordIndex?: number;
  plannerBatchIndex?: number;
  plannerBatchCount?: number;
  summary: string;
}

export function projectBoardSynthesisSectionStatuses(run: ProjectBoardSynthesisRun): ProjectBoardSectionStatusView[] {
  const byKey = new Map<string, ProjectBoardSectionStatusView>();
  for (const record of run.progressiveRecords ?? []) {
    if (record.type !== "progress") continue;
    const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : {};
    const rawStatus = metadata.sectionStatus;
    const status =
      rawStatus === "succeeded" || rawStatus === "failed" || rawStatus === "skipped" || rawStatus === "pending"
        ? rawStatus
        : undefined;
    if (!status) continue;
    const sectionId = typeof metadata.sectionId === "string" && metadata.sectionId.trim() ? metadata.sectionId.trim() : undefined;
    const sectionIndex = numberMetadata(metadata.sectionIndex);
    const sectionHeading = typeof metadata.sectionHeading === "string" && metadata.sectionHeading.trim() ? metadata.sectionHeading.trim() : undefined;
    const recordTitle = typeof record.title === "string" && record.title.trim() ? record.title.trim() : "Section status";
    const key = sectionId ?? `${sectionIndex ?? byKey.size}:${sectionHeading ?? recordTitle}`;
    byKey.set(key, {
      key,
      status,
      sectionIndex,
      sectionCount: numberMetadata(metadata.sectionCount),
      sourcePath: typeof metadata.sourcePath === "string" && metadata.sourcePath.trim() ? metadata.sourcePath.trim() : undefined,
      sectionHeading,
      failureKind: typeof metadata.failureKind === "string" && metadata.failureKind.trim() ? metadata.failureKind.trim() : undefined,
      summary: typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : recordTitle,
      updatedAt: typeof record.createdAt === "string" ? record.createdAt : run.updatedAt,
    });
  }
  return [...byKey.values()].sort(
    (left, right) =>
      (left.sectionIndex ?? Number.MAX_SAFE_INTEGER) - (right.sectionIndex ?? Number.MAX_SAFE_INTEGER) ||
      left.key.localeCompare(right.key),
  );
}

export function projectBoardSynthesisPartialStatus(run: ProjectBoardSynthesisRun): ProjectBoardSynthesisPartialStatus {
  const statuses = projectBoardSynthesisSectionStatuses(run);
  const failed = statuses.filter((status) => status.status === "failed");
  const completed = statuses.filter((status) => status.status === "succeeded");
  const reused = statuses.filter((status) => status.status === "skipped");
  const summary = run.progressiveSummary;
  // Use one data source per run: mixing status-record counts with summary fallbacks
  // (and || overriding a genuine 0) could report "2 sections need retry" alongside an
  // empty failed-section list, or sum counts from two different sources.
  const hasStatusRecords = statuses.length > 0;
  const failedCount = hasStatusRecords ? failed.length : summary?.sectionFailedCount ?? 0;
  const completedCount = hasStatusRecords ? completed.length : summary?.sectionSucceededCount ?? 0;
  const reusedCount = hasStatusRecords ? reused.length : summary?.sectionSkippedCount ?? 0;
  const sectionCountFromStatus = Math.max(...statuses.map((status) => status.sectionCount ?? 0), 0);
  const sectionCount = Math.max(sectionCountFromStatus, failedCount + completedCount + reusedCount);
  const producedCards = Boolean(run.proposalId) || (summary?.candidateCardCount ?? 0) > 0 || (run.status === "succeeded" && (run.cardCount ?? 0) > 0);
  const deferred = run.events.some((event) => event.metadata?.decision === "defer_failed_sections");
  const failedSectionHeadings = failed
    .map((status) => status.sectionHeading || status.sourcePath || status.key)
    .filter((value, index, values) => values.indexOf(value) === index);
  return {
    failedCount,
    completedCount: completedCount + reusedCount,
    reusedCount,
    sectionCount,
    hasFailedSections: failedCount > 0,
    hasPartialProposal: failedCount > 0 && producedCards,
    deferred,
    failedSectionIds: failed.length > 0 ? failed.map((status) => status.key) : [],
    failedSectionHeadings,
    summary: partialStatusSummary({ failedCount, completedCount, reusedCount, sectionCount, producedCards, deferred }),
  };
}

export function projectBoardSynthesisOutputCapRecovery(run: ProjectBoardSynthesisRun): ProjectBoardSynthesisOutputCapRecovery {
  const metadata = latestOutputCapRecoveryMetadata(run);
  const finishReason = stringMetadata(metadata?.finishReason);
  const stopReason = stringMetadata(metadata?.stopReason);
  const lastValidRecordId = stringMetadata(metadata?.lastValidRecordId);
  const lastValidRecordType = stringMetadata(metadata?.lastValidRecordType);
  const lastValidRecordIndex = numberMetadata(metadata?.lastValidRecordIndex);
  const plannerBatchIndex = numberMetadata(metadata?.plannerBatchIndex);
  const plannerBatchCount = numberMetadata(metadata?.plannerBatchCount);
  const outputTokenBudget = numberMetadata(metadata?.outputTokenBudget);
  const canContinue = Boolean(metadata && lastValidRecordId && lastValidRecordType);
  const batchText = plannerBatchIndex
    ? `planner batch ${plannerBatchIndex}${plannerBatchCount ? `/${plannerBatchCount}` : ""}`
    : "the active planner batch";
  const reasonText = recoverableStopReasonText(finishReason, stopReason);
  const markerText =
    lastValidRecordId && lastValidRecordType
      ? `The last valid record was ${lastValidRecordType} ${lastValidRecordId}.`
      : "No last-valid-record checkpoint was recorded.";
  return {
    canContinue,
    finishReason,
    stopReason,
    outputTokenBudget,
    lastValidRecordId,
    lastValidRecordType,
    lastValidRecordIndex,
    plannerBatchIndex,
    plannerBatchCount,
    summary: canContinue
      ? `Ambient/Pi stopped ${batchText} because of ${reasonText}. ${markerText} Continue the batch to reuse validated records and ask Pi only for the missing next cards.`
      : "This synthesis run has no recoverable planner-batch output checkpoint.",
  };
}

export function projectBoardSynthesisStaleRecovery(
  run: ProjectBoardSynthesisRun,
  input: { nowMs?: number; staleMs?: number } = {},
): ProjectBoardSynthesisStaleRecovery {
  const partial = projectBoardSynthesisPartialStatus(run);
  const updatedAtMs = Date.parse(run.updatedAt);
  const nowMs = input.nowMs ?? Date.now();
  const staleMs = input.staleMs ?? DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS;
  // An unparsable timestamp must read as stale, not fresh: idleMs = 0 would let a
  // stuck running run with a corrupted updatedAt block new planning forever.
  const idleMs = Number.isFinite(updatedAtMs) ? Math.max(0, nowMs - updatedAtMs) : Number.POSITIVE_INFINITY;
  const stale = (run.status === "running" || run.status === "pause_requested") && idleMs >= staleMs;
  const reusableCount = partial.completedCount;
  const staleText = stale ? `No board operation update has been recorded for ${formatRecoveryDelay(idleMs)}.` : "This board operation is still receiving recent progress updates.";
  const reuseText =
    reusableCount > 0
      ? `Retry can reuse ${reusableCount} completed or reused section record${reusableCount === 1 ? "" : "s"} and resume from uncovered work.`
      : "Retry will restart the board operation because no completed section records are available yet.";
  return {
    stale,
    idleMs,
    completedCount: partial.completedCount,
    reusedCount: partial.reusedCount,
    failedCount: partial.failedCount,
    sectionCount: partial.sectionCount,
    summary: `${staleText} ${reuseText}`,
  };
}

export function sectionStatusLabel(status: ProjectBoardSectionStatusView["status"], failureKind?: string): string {
  if (status === "failed" && failureKind === "semantic_idle_timeout") return "Stalled, retryable";
  if (status === "failed") return "Needs retry";
  if (status === "skipped") return "Reused from previous run";
  if (status === "pending") return "Pending";
  return "Completed";
}

function formatRecoveryDelay(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function partialStatusSummary({
  failedCount,
  completedCount,
  reusedCount,
  sectionCount,
  producedCards,
  deferred,
}: {
  failedCount: number;
  completedCount: number;
  reusedCount: number;
  sectionCount: number;
  producedCards: boolean;
  deferred: boolean;
}): string {
  if (failedCount <= 0) return "All source sections that reported status completed successfully.";
  const complete = Math.max(completedCount + reusedCount, 0);
  const denominator = sectionCount > 0 ? ` of ${sectionCount}` : "";
  const partial = producedCards ? "A partial proposal was created" : "No usable proposal was created";
  const deferredText = deferred ? " These failed sections were explicitly deferred." : "";
  return `${partial}; ${failedCount} source section${failedCount === 1 ? "" : "s"} still ${
    failedCount === 1 ? "needs" : "need"
  } retry and ${complete}${denominator} section${complete === 1 ? " is" : "s are"} complete or reused.${deferredText}`;
}

function numberMetadata(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recoverableStopReasonText(finishReason?: string, stopReason?: string): string {
  if (stopReason === "pause_requested") return stopReason;
  return finishReason || stopReason || "an output budget stop";
}

function latestOutputCapRecoveryMetadata(run: ProjectBoardSynthesisRun): Record<string, unknown> | undefined {
  for (let index = run.events.length - 1; index >= 0; index -= 1) {
    const metadata = run.events[index]?.metadata;
    if (metadata?.recoverableOutputStop === true) return metadata;
  }
  for (let index = (run.progressiveRecords ?? []).length - 1; index >= 0; index -= 1) {
    const record = run.progressiveRecords?.[index];
    if (record?.type !== "progress") continue;
    const metadata = record.metadata;
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const recordMetadata = metadata as Record<string, unknown>;
      if (recordMetadata.recoverableOutputStop === true) return recordMetadata;
    }
  }
  return undefined;
}
