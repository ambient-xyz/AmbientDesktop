import type { ProjectBoardSynthesisRun, ProjectBoardSummary } from "../../shared/types";
import {
  DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  projectBoardSynthesisOutputCapRecovery,
  projectBoardSynthesisPartialStatus,
  projectBoardSynthesisSectionStatuses,
  projectBoardSynthesisStaleRecovery,
} from "../../shared/projectBoardSynthesisRecovery";
import { projectBoardRunIsKickoffDefaults } from "../../shared/projectBoardSynthesisGate";

export interface ProjectBoardSynthesisRunControlAction {
  visible: boolean;
  label: string;
  busyLabel: string;
  title: string;
  disabled: boolean;
}

export interface ProjectBoardSynthesisRunControlState {
  pause: ProjectBoardSynthesisRunControlAction;
  resume: ProjectBoardSynthesisRunControlAction;
  startFresh: ProjectBoardSynthesisRunControlAction;
}

export interface ProjectBoardSynthesisRunPromptBudgetMetric {
  label: string;
  value: string;
  title: string;
}

export interface ProjectBoardSynthesisRunPromptBudgetAudit {
  visible: boolean;
  tone: "ready" | "warning" | "danger" | "neutral";
  headline: string;
  detail: string;
  metrics: ProjectBoardSynthesisRunPromptBudgetMetric[];
  notes: string[];
}

export type ProjectBoardHistoryRecoveryActionId =
  | "retry_failed_sections"
  | "defer_failed_sections"
  | "retry_stalled_run"
  | "continue_planner_batch"
  | "resume_paused_run"
  | "start_fresh_from_paused_run"
  | "view_progressive_records"
  | "open_source_context";

export interface ProjectBoardHistoryRecoveryAction {
  id: ProjectBoardHistoryRecoveryActionId;
  label: string;
  title: string;
  disabled: boolean;
  tone: "primary" | "secondary" | "danger";
}

export interface ProjectBoardHistoryRecoveryRun {
  runId: string;
  status: ProjectBoardSynthesisRun["status"];
  stage: ProjectBoardSynthesisRun["stage"];
  title: string;
  summary: string;
  tone: "warning" | "danger" | "neutral";
  updatedAt: string;
  failedSectionCount: number;
  completedSectionCount: number;
  progressiveRecordCount: number;
  sourcePaths: string[];
  actions: ProjectBoardHistoryRecoveryAction[];
}

export function projectBoardSynthesisRunPromptBudgetMetrics(run?: ProjectBoardSynthesisRun): ProjectBoardSynthesisRunPromptBudgetMetric[] {
  if (!run) return [];
  const latestEvent = projectBoardLatestPromptBudgetEvent(run);
  const latestPromptCharCount =
    projectBoardMetadataNumber(latestEvent?.metadata, "latestPromptCharCount") ??
    projectBoardPromptBudgetAssessmentNumber(latestEvent?.metadata, "promptCharCount") ??
    (run.events.length <= 1 ? run.promptCharCount : undefined);
  const cumulativePromptCharCount =
    projectBoardMetadataNumber(latestEvent?.metadata, "cumulativePromptCharCount") ?? run.promptCharCount;
  const latestEstimatedInputTokens =
    projectBoardMetadataNumber(latestEvent?.metadata, "latestEstimatedInputTokens") ??
    (typeof latestPromptCharCount === "number" ? projectBoardEstimateTokensFromChars(latestPromptCharCount) : undefined);
  const cumulativeEstimatedInputTokens =
    projectBoardMetadataNumber(latestEvent?.metadata, "cumulativeEstimatedInputTokens") ??
    (typeof cumulativePromptCharCount === "number" ? projectBoardEstimateTokensFromChars(cumulativePromptCharCount) : undefined);
  const metrics: ProjectBoardSynthesisRunPromptBudgetMetric[] = [];
  const cumulativeDiffersFromLatest =
    typeof cumulativePromptCharCount === "number" &&
    (typeof latestPromptCharCount !== "number" || cumulativePromptCharCount !== latestPromptCharCount);
  if (typeof latestPromptCharCount === "number") {
    metrics.push({
      label: "Latest prompt chars",
      value: latestPromptCharCount.toLocaleString(),
      title: "Prompt characters sent in the latest Ambient/Pi request, not the whole run.",
    });
  }
  if (cumulativeDiffersFromLatest) {
    metrics.push({
      label: "Cumulative prompt chars",
      value: cumulativePromptCharCount.toLocaleString(),
      title: "Total prompt characters sent across all Ambient/Pi requests in this synthesis run.",
    });
  }
  if (typeof latestEstimatedInputTokens === "number" || typeof cumulativeEstimatedInputTokens === "number") {
    const parts = [
      typeof latestEstimatedInputTokens === "number" ? `~${latestEstimatedInputTokens.toLocaleString()} latest` : "",
      cumulativeDiffersFromLatest && typeof cumulativeEstimatedInputTokens === "number" ? `~${cumulativeEstimatedInputTokens.toLocaleString()} total` : "",
    ].filter(Boolean);
    metrics.push({
      label: "Est. input tokens",
      value: parts.join(" / "),
      title: "Approximate prompt-token estimate using the planner budget heuristic.",
    });
  }
  const compaction = projectBoardSynthesisRunCompactionMetric(run, latestEvent);
  if (compaction) metrics.push(compaction);
  return metrics;
}

export function projectBoardSynthesisRunPromptBudgetAudit(run?: ProjectBoardSynthesisRun): ProjectBoardSynthesisRunPromptBudgetAudit | undefined {
  if (!run) return undefined;
  const latestEvent = projectBoardLatestPromptBudgetEvent(run);
  const eventWithCompaction = [...run.events]
    .reverse()
    .find((event) => Boolean(event.metadata?.plannerLedgerCompaction || event.metadata?.plannerLedgerCompactionStatus));
  const metadata = eventWithCompaction?.metadata ?? latestEvent?.metadata;
  const compaction = projectBoardMetadataObject(metadata, "plannerLedgerCompaction");
  const status = projectBoardMetadataText(metadata, "plannerLedgerCompactionStatus");
  const skipReason = projectBoardMetadataText(metadata, "plannerLedgerCompactionSkipReason");
  const latestPromptCharCount =
    projectBoardMetadataNumber(latestEvent?.metadata, "latestPromptCharCount") ??
    projectBoardPromptBudgetAssessmentNumber(latestEvent?.metadata, "promptCharCount") ??
    (run.events.length <= 1 ? run.promptCharCount : undefined);
  const cumulativePromptCharCount =
    projectBoardMetadataNumber(latestEvent?.metadata, "cumulativePromptCharCount") ?? run.promptCharCount;
  const cumulativeDiffersFromLatest =
    typeof cumulativePromptCharCount === "number" &&
    (typeof latestPromptCharCount !== "number" || cumulativePromptCharCount !== latestPromptCharCount);
  const latestAssessment = projectBoardMetadataObject(latestEvent?.metadata, "promptBudgetAssessment");
  const summarizationRecommended = projectBoardMetadataBoolean(latestAssessment, "summarizationRecommended");
  if (!latestEvent && !eventWithCompaction && !cumulativeDiffersFromLatest) return undefined;

  const cacheHit = projectBoardMetadataBoolean(compaction, "cacheHit") === true || status === "cache_hit";
  const compactionUsed = status === "used" || status === "cache_hit" || Boolean(compaction);
  const skipped = status === "skipped" || Boolean(skipReason);
  const metrics = projectBoardSynthesisRunPromptBudgetAuditMetrics({
    latestPromptCharCount,
    cumulativePromptCharCount,
    cumulativeDiffersFromLatest,
    compaction,
  });

  if (compactionUsed) {
    const compactionSource = projectBoardMetadataText(compaction, "source");
    const summary = projectBoardMetadataText(compaction, "summary");
    return {
      visible: true,
      tone: "ready",
      headline: cacheHit ? "Compacted planner context was reused" : "Compacted planner context was applied",
      detail: cumulativeDiffersFromLatest
        ? "Latest request size is separated from cumulative run cost. Repeated planner context was represented by a compact ledger before the latest model call."
        : "Repeated planner context was represented by a compact ledger before this model call.",
      metrics,
      notes: [
        compactionSource ? `Compaction source: ${compactionSource}.` : undefined,
        summary,
        "This audit is local telemetry; it does not run a full-board Pi preview.",
      ].filter((note): note is string => Boolean(note)),
    };
  }

  if (skipped) {
    return {
      visible: true,
      tone: skipReason === "planner_ledger_compaction_unavailable" || summarizationRecommended ? "warning" : "neutral",
      headline: projectBoardPromptCompactionSkipHeadline(skipReason),
      detail: projectBoardPromptCompactionSkipDetail(skipReason, cumulativeDiffersFromLatest),
      metrics,
      notes: [
        projectBoardPromptCompactionSkipTitle(skipReason),
        cumulativeDiffersFromLatest ? "The cumulative prompt count is total run cost across section calls, not one model request." : undefined,
      ].filter((note): note is string => Boolean(note)),
    };
  }

  if (summarizationRecommended) {
    return {
      visible: true,
      tone: "warning",
      headline: "Compaction decision missing",
      detail: "The latest prompt reached the summarization threshold, but the run did not record whether compaction was applied, reused, or skipped.",
      metrics,
      notes: ["Retry or resume paths should record explicit compaction telemetry before making another expensive model request."],
    };
  }

  if (cumulativeDiffersFromLatest) {
    return {
      visible: true,
      tone: "neutral",
      headline: "Prompt cost is cumulative, not one huge request",
      detail: "The run total aggregates multiple Ambient/Pi requests. The latest request metric is the size of the most recent model call.",
      metrics,
      notes: ["Compaction is only needed when the latest request or repeated context pressure crosses the planner budget threshold."],
    };
  }

  return undefined;
}

function projectBoardSynthesisRunPromptBudgetAuditMetrics(input: {
  latestPromptCharCount?: number;
  cumulativePromptCharCount?: number;
  cumulativeDiffersFromLatest: boolean;
  compaction?: Record<string, unknown>;
}): ProjectBoardSynthesisRunPromptBudgetMetric[] {
  const metrics: ProjectBoardSynthesisRunPromptBudgetMetric[] = [];
  if (typeof input.latestPromptCharCount === "number") {
    metrics.push({
      label: "Latest request",
      value: input.latestPromptCharCount.toLocaleString(),
      title: "Prompt characters sent in the latest Ambient/Pi request.",
    });
  }
  if (input.cumulativeDiffersFromLatest && typeof input.cumulativePromptCharCount === "number") {
    metrics.push({
      label: "Run total",
      value: input.cumulativePromptCharCount.toLocaleString(),
      title: "Cumulative prompt characters across all model requests in this planner run.",
    });
  }
  const renderedCardCount = projectBoardMetadataNumber(input.compaction, "renderedCardCount");
  const omittedRenderedCardCount = projectBoardMetadataNumber(input.compaction, "omittedRenderedCardCount");
  const finalPromptCharCount = projectBoardMetadataNumber(input.compaction, "finalPromptCharCount");
  const sourceCount = projectBoardMetadataNumber(input.compaction, "sourceCount");
  if (typeof renderedCardCount === "number") {
    metrics.push({
      label: "Compacted cards",
      value: renderedCardCount.toLocaleString(),
      title: "Rendered-card records represented by compact planner context.",
    });
  }
  if (typeof omittedRenderedCardCount === "number" && omittedRenderedCardCount > 0) {
    metrics.push({
      label: "Omitted cards",
      value: omittedRenderedCardCount.toLocaleString(),
      title: "Rendered-card records omitted from the direct prompt because they remain represented by the compact summary.",
    });
  }
  if (typeof sourceCount === "number" && sourceCount > 0) {
    metrics.push({
      label: "Sources",
      value: sourceCount.toLocaleString(),
      title: "Source records represented by the compaction context.",
    });
  }
  if (typeof finalPromptCharCount === "number") {
    metrics.push({
      label: "Final prompt",
      value: finalPromptCharCount.toLocaleString(),
      title: "Prompt characters after compaction was applied to the actual model request.",
    });
  }
  return metrics.slice(0, 6);
}

function projectBoardLatestPromptBudgetEvent(run: ProjectBoardSynthesisRun): ProjectBoardSynthesisRun["events"][number] | undefined {
  return [...run.events]
    .reverse()
    .find((event) => Boolean(event.metadata?.promptBudgetAssessment || event.metadata?.latestPromptCharCount || event.metadata?.plannerLedgerCompactionStatus));
}

function projectBoardSynthesisRunCompactionMetric(
  run: ProjectBoardSynthesisRun,
  latestEvent?: ProjectBoardSynthesisRun["events"][number],
): ProjectBoardSynthesisRunPromptBudgetMetric | undefined {
  const eventWithCompaction = [...run.events]
    .reverse()
    .find((event) => Boolean(event.metadata?.plannerLedgerCompaction || event.metadata?.plannerLedgerCompactionStatus));
  const metadata = eventWithCompaction?.metadata ?? latestEvent?.metadata;
  const status = projectBoardMetadataText(metadata, "plannerLedgerCompactionStatus");
  const compaction = projectBoardMetadataObject(metadata, "plannerLedgerCompaction");
  const skipReason = projectBoardMetadataText(metadata, "plannerLedgerCompactionSkipReason");
  const cacheHit = projectBoardMetadataBoolean(compaction, "cacheHit");
  if (status === "cache_hit" || cacheHit === true) {
    return { label: "Compaction", value: "Reused", title: "Reused a cached planner-ledger compaction for this request." };
  }
  if (status === "used" || compaction) {
    return { label: "Compaction", value: "Applied", title: "Used compacted planner context before the latest card-planning request." };
  }
  if (status === "started") {
    return { label: "Compaction", value: "Running", title: "The planner is compacting context before asking for more cards." };
  }
  if (status === "skipped" || skipReason) {
    return {
      label: "Compaction",
      value: projectBoardPromptCompactionSkipLabel(skipReason),
      title: projectBoardPromptCompactionSkipTitle(skipReason),
    };
  }
  const latestAssessment = projectBoardMetadataObject(latestEvent?.metadata, "promptBudgetAssessment");
  const summarizationRecommended = projectBoardMetadataBoolean(latestAssessment, "summarizationRecommended");
  if (summarizationRecommended) {
    return {
      label: "Compaction",
      value: "Recommended",
      title: "The latest prompt reached the planner summarization threshold, but no compaction decision was recorded.",
    };
  }
  return undefined;
}

function projectBoardPromptCompactionSkipLabel(reason?: string): string {
  if (reason === "sectioned_planning_compaction_not_supported") return "Skipped: legacy sectioned";
  if (reason === "section_prompt_below_threshold" || reason === "latest_prompt_below_threshold" || reason === "raw_prompt_below_threshold") {
    return "Skipped: below threshold";
  }
  if (reason === "planner_ledger_compaction_unavailable") return "Skipped: unavailable";
  if (reason === "legacy_full_synthesis_not_compacted") return "Skipped: legacy path";
  if (reason === "charter_review_not_compacted") return "Skipped: review path";
  return "Skipped";
}

function projectBoardPromptCompactionSkipHeadline(reason?: string): string {
  if (reason === "sectioned_planning_compaction_not_supported") return "Legacy run skipped section compaction";
  if (reason === "section_prompt_below_threshold" || reason === "latest_prompt_below_threshold" || reason === "raw_prompt_below_threshold") {
    return "Latest request stayed below compaction threshold";
  }
  if (reason === "planner_ledger_compaction_unavailable") return "Compaction was unavailable";
  if (reason === "legacy_full_synthesis_not_compacted") return "Legacy synthesis path skipped compaction";
  if (reason === "charter_review_not_compacted") return "Charter review skipped compaction";
  return "Compaction was skipped";
}

function projectBoardPromptCompactionSkipDetail(reason: string | undefined, cumulativeDiffersFromLatest: boolean): string {
  if (reason === "section_prompt_below_threshold" || reason === "latest_prompt_below_threshold" || reason === "raw_prompt_below_threshold") {
    return cumulativeDiffersFromLatest
      ? "The full run is expensive cumulatively, but the latest model request stayed below the request-level compaction threshold."
      : "The latest model request stayed below the request-level compaction threshold.";
  }
  if (reason === "sectioned_planning_compaction_not_supported") {
    return "This record came from the old sectioned-planning telemetry path. Current sectioned runs can compact repeated context when budget pressure is high.";
  }
  if (reason === "planner_ledger_compaction_unavailable") {
    return "The request needed compact planner context, but no reusable compaction record was available for that call.";
  }
  if (reason === "legacy_full_synthesis_not_compacted") return "The old whole-board synthesis route did not use the planner-ledger compaction helper.";
  if (reason === "charter_review_not_compacted") return "The charter review route is intentionally lightweight and does not compact planner card context.";
  return "The run recorded an explicit skip instead of applying or reusing compact planner context.";
}

function projectBoardPromptCompactionSkipTitle(reason?: string): string {
  if (reason === "sectioned_planning_compaction_not_supported") {
    return "Older sectioned-planning events used this skip reason before sectioned RLM compaction shipped. Current sectioned runs compact repeated context when budget pressure crosses threshold.";
  }
  if (reason === "planner_ledger_compaction_unavailable") {
    return "The raw planner prompt needed compaction, but no compacted planner ledger was available for this request.";
  }
  if (reason === "legacy_full_synthesis_not_compacted") return "This legacy whole-board synthesis path does not compact prompts yet.";
  if (reason === "charter_review_not_compacted") return "This lightweight PM Review path does not compact prompts yet.";
  return "The latest request stayed below the prompt summarization threshold, so no compaction was needed.";
}

function projectBoardPromptBudgetAssessmentNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  return projectBoardMetadataNumber(projectBoardMetadataObject(metadata, "promptBudgetAssessment"), key);
}

function projectBoardMetadataObject(metadata: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = metadata?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function projectBoardMetadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function projectBoardMetadataText(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function projectBoardMetadataBoolean(metadata: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function projectBoardEstimateTokensFromChars(charCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, charCount) / 4));
}

export function projectBoardSynthesisRunControlState(
  run?: ProjectBoardSynthesisRun,
  options: { pauseBusy?: boolean; resumeBusy?: boolean; startFreshBusy?: boolean } = {},
): ProjectBoardSynthesisRunControlState {
  const pauseBusy = Boolean(options.pauseBusy);
  const resumeBusy = Boolean(options.resumeBusy);
  const startFreshBusy = Boolean(options.startFreshBusy);
  const planningRun = Boolean(run && !projectBoardRunIsKickoffDefaults(run));
  return {
    pause: {
      visible: planningRun && run?.status === "running",
      label: "Pause Planning",
      busyLabel: "Pausing",
      title: "Pause planning at the next safe checkpoint. Validated cards and planner records will be reusable on resume.",
      disabled: pauseBusy,
    },
    resume: {
      visible: planningRun && run?.status === "paused",
      label: "Resume Planning",
      busyLabel: "Resuming",
      title: "Resume planning from the paused checkpoint using validated planner records.",
      disabled: resumeBusy,
    },
    startFresh: {
      visible: planningRun && run?.status === "paused",
      label: "Start Fresh",
      busyLabel: "Starting Fresh",
      title:
        "Abandon this paused checkpoint, clear untouched draft cards from that planning run, and start a fresh planner run from the current charter and sources. Ticketized, manual, and user-edited cards are preserved for review and will not stay active by default.",
      disabled: startFreshBusy,
    },
  };
}

export function projectBoardHistoryRecoveryQueue(
  board: Pick<ProjectBoardSummary, "sources" | "synthesisRuns">,
  input: { nowMs?: number; staleMs?: number } = {},
): ProjectBoardHistoryRecoveryRun[] {
  const runs = board.synthesisRuns ?? [];
  return runs
    .map((run) => projectBoardHistoryRecoveryRun(run, board, runs, input))
    .filter((run): run is ProjectBoardHistoryRecoveryRun => Boolean(run))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function projectBoardHistoryRecoveryRun(
  run: ProjectBoardSynthesisRun,
  board: Pick<ProjectBoardSummary, "sources">,
  runs: ProjectBoardSynthesisRun[],
  input: { nowMs?: number; staleMs?: number },
): ProjectBoardHistoryRecoveryRun | undefined {
  const sectionStatuses = projectBoardSynthesisSectionStatuses(run);
  const partial = projectBoardSynthesisPartialStatus(run);
  const stale = projectBoardSynthesisStaleRecovery(run, {
    nowMs: input.nowMs,
    staleMs: input.staleMs ?? DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  });
  const outputCap = projectBoardSynthesisOutputCapRecovery(run);
  const controls = projectBoardSynthesisRunControlState(run);
  const progressiveRecordCount = run.progressiveRecords?.length ?? run.progressiveRecordCount ?? 0;
  const running = run.status === "running" || run.status === "pause_requested";
  const abandoned = run.status === "abandoned";
  const recoveredByRun = runs.find((candidate) => candidate.retryOfRunId === run.id && candidate.status === "succeeded");
  const actions: ProjectBoardHistoryRecoveryAction[] = [];
  if (partial.hasFailedSections && !running && !abandoned && !recoveredByRun) {
    actions.push({
      id: "retry_failed_sections",
      label: "Retry failed sections now",
      title: "Start a resumable Ambient/Pi retry that reuses completed section records and replans only failed or uncovered source sections.",
      disabled: false,
      tone: "primary",
    });
    actions.push({
      id: "defer_failed_sections",
      label: partial.deferred ? "Failed sections deferred" : "Defer failed sections",
      title: partial.deferred
        ? "These failed source sections were already deferred; retry remains available if they become important."
        : "Keep the current partial proposal and record that failed source sections are intentionally deferred.",
      disabled: partial.deferred,
      tone: "secondary",
    });
  }
  if (stale.stale && running) {
    actions.push({
      id: "retry_stalled_run",
      label: "Mark stale and retry",
      title: stale.summary,
      disabled: false,
      tone: "primary",
    });
  }
  if (outputCap.canContinue && !running && run.status !== "paused" && !abandoned) {
    actions.push({
      id: "continue_planner_batch",
      label: "Continue planner batch",
      title: outputCap.summary,
      disabled: false,
      tone: "primary",
    });
  }
  if (controls.resume.visible) {
    actions.push({
      id: "resume_paused_run",
      label: controls.resume.label,
      title: controls.resume.title,
      disabled: controls.resume.disabled,
      tone: "primary",
    });
  }
  if (controls.startFresh.visible) {
    actions.push({
      id: "start_fresh_from_paused_run",
      label: controls.startFresh.label,
      title: controls.startFresh.title,
      disabled: controls.startFresh.disabled,
      tone: "danger",
    });
  }
  if (progressiveRecordCount > 0) {
    actions.push({
      id: "view_progressive_records",
      label: "View progressive records",
      title: "Expand the validated progressive records saved during this run.",
      disabled: false,
      tone: "secondary",
    });
  }
  const sourcePaths = projectBoardHistoryRecoverySourcePaths(sectionStatuses, board.sources ?? []);
  if (sourcePaths.length > 0) {
    actions.push({
      id: "open_source_context",
      label: "Open source context",
      title: "Jump to the Charter source review surface for the source context that fed this run.",
      disabled: false,
      tone: "secondary",
    });
  }
  if (actions.length === 0) return undefined;
  const completedSectionCount = partial.completedCount + partial.reusedCount;
  const summary = projectBoardHistoryRecoverySummary({
    run,
    partialSummary: partial.summary,
    staleSummary: stale.summary,
    outputCapSummary: outputCap.summary,
    hasFailedSections: partial.hasFailedSections,
    recoveredByRunId: recoveredByRun?.id,
    stale: stale.stale,
    canContinue: outputCap.canContinue,
    progressiveRecordCount,
  });
  return {
    runId: run.id,
    status: run.status,
    stage: run.stage,
    title: projectBoardHistoryRecoveryTitle(run, partial.hasFailedSections, stale.stale, outputCap.canContinue, recoveredByRun?.id),
    summary,
    tone:
      recoveredByRun
        ? "neutral"
        : run.status === "failed" || partial.hasFailedSections
          ? "danger"
          : stale.stale || run.status === "paused"
            ? "warning"
            : "neutral",
    updatedAt: run.updatedAt,
    failedSectionCount: partial.failedCount,
    completedSectionCount,
    progressiveRecordCount,
    sourcePaths,
    actions,
  };
}

function projectBoardHistoryRecoverySummary(input: {
  run: ProjectBoardSynthesisRun;
  partialSummary: string;
  staleSummary: string;
  outputCapSummary: string;
  hasFailedSections: boolean;
  recoveredByRunId?: string;
  stale: boolean;
  canContinue: boolean;
  progressiveRecordCount: number;
}): string {
  if (input.recoveredByRunId) {
    return `Recovered by retry run ${input.recoveredByRunId}. The original progressive records remain available for audit and source context.`;
  }
  if (input.hasFailedSections) return input.partialSummary;
  if (input.stale) return input.staleSummary;
  if (input.run.status === "paused") return "Planning is paused at a reusable checkpoint. Resume continues from validated planner records; Start Fresh abandons the checkpoint and replans from current sources.";
  if (input.canContinue) return input.outputCapSummary;
  return `${input.progressiveRecordCount.toLocaleString()} progressive planning record${input.progressiveRecordCount === 1 ? "" : "s"} saved for audit.`;
}

function projectBoardHistoryRecoveryTitle(
  run: ProjectBoardSynthesisRun,
  hasFailedSections: boolean,
  stale: boolean,
  canContinue: boolean,
  recoveredByRunId?: string,
): string {
  if (recoveredByRunId) return "Recovered by retry";
  if (hasFailedSections) return "Failed source sections need a decision";
  if (stale) return "Planning appears stale";
  if (run.status === "paused") return "Paused run can resume";
  if (canContinue) return "Planner batch can continue";
  return "Progressive records are available";
}

function projectBoardHistoryRecoverySourcePaths(
  sectionStatuses: ReturnType<typeof projectBoardSynthesisSectionStatuses>,
  sources: ProjectBoardSummary["sources"],
): string[] {
  const paths = new Set<string>();
  for (const status of sectionStatuses) {
    if (status.sourcePath) paths.add(status.sourcePath);
  }
  if (paths.size === 0) {
    for (const source of sources) {
      if (source.includeInSynthesis === false || source.authorityRole === "ignored" || source.kind === "ignored") continue;
      const path = source.path?.trim() || source.title?.trim();
      if (path) paths.add(path);
      if (paths.size >= 3) break;
    }
  }
  return [...paths].slice(0, 3);
}
