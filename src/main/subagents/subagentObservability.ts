import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import {
  SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_SCHEMA_VERSION,
  SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
  SUBAGENT_BATCH_PROGRESS_SCHEMA_VERSION,
} from "./subagentBatchJobs";

export type SubagentObservabilityEventType =
  | "subagent.spawn_attempt"
  | "subagent.spawn_rejected"
  | "subagent.spawn_failed"
  | "subagent.status_changed"
  | "subagent.wait_duration"
  | "subagent.cancellation_cascade"
  | "subagent.tool_denied"
  | "subagent.grouped_completion"
  | "subagent.batch_progress"
  | "subagent.usage"
  | "subagent.local_memory"
  | "subagent.restart_reconciliation";

export interface SubagentObservabilityEvent {
  schemaVersion: "ambient-subagent-observability-v1";
  type: SubagentObservabilityEventType;
  createdAt: string;
  runId?: string;
  parentRunId?: string;
  childThreadId?: string;
  status?: SubagentRunStatus;
  durationMs?: number;
  tokenCount?: number;
  costMicros?: number;
  localMemoryBytes?: number;
  deniedToolCategory?: string;
  reason?: string;
}

export interface SubagentObservabilityEventValidationIssue {
  id: "child-run-attribution";
  eventType: SubagentObservabilityEventType;
  message: string;
}

export interface SubagentObservabilitySummary {
  schemaVersion: "ambient-subagent-observability-summary-v1";
  createdAt: string;
  spawnAttempts: number;
  failedSpawns: number;
  waitDurations: {
    count: number;
    totalMs: number;
    maxMs: number;
  };
  cancellationCascades: number;
  childRuntimeAborts: number;
  toolDenials: {
    count: number;
    byCategory: Record<string, number>;
  };
  usage: {
    tokenCount: number;
    costMicros: number;
  };
  localMemory: {
    eventCount: number;
    peakBytes?: number;
  };
  childIdle: {
    openRunCount: number;
    totalMs: number;
    maxMs: number;
  };
  groupedCompletions: number;
  batchProgress: {
    notificationCount: number;
    jobCount: number;
    itemCount: number;
    acceptedReportCount: number;
    pendingItemCount: number;
    completedJobCount: number;
  };
  needsAttentionRequests: number;
  restartReconciliations: number;
  statusCounts: Partial<Record<SubagentRunStatus, number>>;
}

export interface SummarizeSubagentObservabilityInput {
  runs: SubagentRunSummary[];
  runEvents?: SubagentRunEventSummary[];
  waitBarriers?: SubagentWaitBarrierSummary[];
  parentMailboxEvents?: SubagentParentMailboxEventSummary[];
  toolScopeSnapshots?: SubagentToolScopeSnapshotSummary[];
  createdAt?: string;
}

export function createSubagentObservabilityEvent(
  input: Omit<SubagentObservabilityEvent, "schemaVersion" | "createdAt"> & { createdAt?: string },
): SubagentObservabilityEvent {
  const event: SubagentObservabilityEvent = {
    schemaVersion: "ambient-subagent-observability-v1",
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...input,
  };
  const issues = validateSubagentObservabilityEventAttribution(event);
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(" "));
  return event;
}

export function childRunAttributionRequired(event: SubagentObservabilityEvent): boolean {
  return [
    "subagent.status_changed",
    "subagent.wait_duration",
    "subagent.cancellation_cascade",
    "subagent.tool_denied",
    "subagent.usage",
    "subagent.local_memory",
  ].includes(event.type);
}

export function validateSubagentObservabilityEventAttribution(
  event: SubagentObservabilityEvent,
): SubagentObservabilityEventValidationIssue[] {
  if (!childRunAttributionRequired(event) || event.runId) return [];
  return [
    {
      id: "child-run-attribution",
      eventType: event.type,
      message: `Sub-agent observability event ${event.type} must identify the originating child run.`,
    },
  ];
}

export function summarizeSubagentObservability(input: SummarizeSubagentObservabilityInput): SubagentObservabilitySummary {
  const runEvents = input.runEvents ?? [];
  const waitBarriers = input.waitBarriers ?? [];
  const parentMailboxEvents = input.parentMailboxEvents ?? [];
  const toolScopeSnapshots = input.toolScopeSnapshots ?? [];
  const createdAt = input.createdAt ?? new Date().toISOString();
  const statusCounts: Partial<Record<SubagentRunStatus, number>> = {};
  let tokenCount = 0;
  let costMicros = 0;
  let localMemoryEventCount = 0;
  let peakLocalMemoryBytes: number | undefined;
  let failedSpawnEvents = 0;
  let restartReconciliations = 0;
  let needsAttentionEvents = 0;

  for (const run of input.runs) {
    statusCounts[run.status] = (statusCounts[run.status] ?? 0) + 1;
  }

  for (const event of runEvents) {
    if (event.type === "subagent.spawn_failed" || event.type === "subagent.spawn_rejected") failedSpawnEvents += 1;
    if (event.type === "subagent.restart_reconciled" || event.type === "subagent.restart_diagnostic") restartReconciliations += 1;
    if (event.type === "subagent.needs_attention") needsAttentionEvents += 1;
    const runtime = runtimeEventPreview(event.preview);
    if (!runtime) continue;
    tokenCount += runtime.tokenCount ?? 0;
    costMicros += runtime.costMicros ?? 0;
    if (typeof runtime.localMemoryBytes === "number") {
      localMemoryEventCount += 1;
      peakLocalMemoryBytes = Math.max(peakLocalMemoryBytes ?? 0, runtime.localMemoryBytes);
    }
  }

  const waitDurations = waitBarriers
    .map((barrier) => durationMs(barrier.createdAt, barrier.resolvedAt))
    .filter((duration): duration is number => typeof duration === "number");
  const childIdleDurations = input.runs
    .filter((run) => isOpenSubagentRun(run))
    .map((run) => durationMs(run.updatedAt, createdAt))
    .filter((duration): duration is number => typeof duration === "number");
  const toolDenials = summarizeToolDenials(toolScopeSnapshots);
  const failedRunSpawns = input.runs.filter((run) => run.status === "failed" && !run.startedAt).length;
  const batchProgress = summarizeBatchProgress(parentMailboxEvents);
  const parentSpawnFailures = parentMailboxEvents.filter((event) => event.type === "subagent.spawn_failed").length;
  const parentCancellationCascades = parentMailboxEvents.filter((event) => event.type === "subagent.cancellation_cascade").length;
  const parentControlRestartReconciliations = parentMailboxEvents.filter((event) => event.type === "subagent.parent_control_reconciled").length;
  const reservedRunEvents = runEvents.filter((event) => event.type === "subagent.reserved").length;
  const cancelledWaitBarriers = waitBarriers.filter((barrier) => barrier.status === "cancelled").length;
  const childRuntimeAborts = runEvents.filter((event) => event.type === "subagent.child_runtime_aborted").length;

  return {
    schemaVersion: "ambient-subagent-observability-summary-v1",
    createdAt,
    spawnAttempts: Math.max(input.runs.length + parentSpawnFailures, reservedRunEvents + parentSpawnFailures),
    failedSpawns: failedSpawnEvents + failedRunSpawns + parentSpawnFailures,
    waitDurations: {
      count: waitDurations.length,
      totalMs: waitDurations.reduce((total, duration) => total + duration, 0),
      maxMs: waitDurations.reduce((max, duration) => Math.max(max, duration), 0),
    },
    cancellationCascades: Math.max(parentCancellationCascades, cancelledWaitBarriers),
    childRuntimeAborts,
    toolDenials,
    usage: {
      tokenCount,
      costMicros,
    },
    localMemory: {
      eventCount: localMemoryEventCount,
      ...(typeof peakLocalMemoryBytes === "number" ? { peakBytes: peakLocalMemoryBytes } : {}),
    },
    childIdle: {
      openRunCount: childIdleDurations.length,
      totalMs: childIdleDurations.reduce((total, duration) => total + duration, 0),
      maxMs: childIdleDurations.reduce((max, duration) => Math.max(max, duration), 0),
    },
    groupedCompletions: parentMailboxEvents.filter((event) => event.type === "subagent.grouped_completion").length,
    batchProgress,
    needsAttentionRequests: Math.max(needsAttentionEvents, statusCounts.needs_attention ?? 0),
    restartReconciliations: restartReconciliations + parentControlRestartReconciliations,
    statusCounts,
  };
}

function isOpenSubagentRun(run: SubagentRunSummary): boolean {
  if (run.closedAt) return false;
  return ["reserved", "starting", "running", "waiting", "needs_attention"].includes(run.status);
}

function summarizeToolDenials(snapshots: SubagentToolScopeSnapshotSummary[]): SubagentObservabilitySummary["toolDenials"] {
  const byCategory: Record<string, number> = {};
  for (const snapshot of snapshots) {
    for (const denied of snapshot.scope.deniedCategories) {
      byCategory[denied.id] = (byCategory[denied.id] ?? 0) + 1;
    }
  }
  return {
    count: Object.values(byCategory).reduce((total, count) => total + count, 0),
    byCategory,
  };
}

function summarizeBatchProgress(events: SubagentParentMailboxEventSummary[]): SubagentObservabilitySummary["batchProgress"] {
  const progressEvents = events
    .filter((event) => event.type === SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE)
    .map((event) => ({ event, summary: batchProgressSummary(event.payload) }))
    .filter((item): item is { event: SubagentParentMailboxEventSummary; summary: BatchProgressSummary } => Boolean(item.summary));
  const latestByJobId = new Map<string, { event: SubagentParentMailboxEventSummary; summary: BatchProgressSummary }>();
  for (const item of progressEvents) {
    const existing = latestByJobId.get(item.summary.jobId);
    if (!existing || Date.parse(item.event.updatedAt) >= Date.parse(existing.event.updatedAt)) {
      latestByJobId.set(item.summary.jobId, item);
    }
  }
  const latest = [...latestByJobId.values()].map((item) => item.summary);
  return {
    notificationCount: progressEvents.length,
    jobCount: latest.length,
    itemCount: latest.reduce((total, summary) => total + summary.itemCount, 0),
    acceptedReportCount: latest.reduce((total, summary) => total + summary.acceptedReportCount, 0),
    pendingItemCount: latest.reduce((total, summary) => total + summary.pendingCount, 0),
    completedJobCount: latest.filter((summary) => summary.itemCount > 0 && summary.pendingCount === 0).length,
  };
}

interface BatchProgressSummary {
  jobId: string;
  itemCount: number;
  acceptedReportCount: number;
  pendingCount: number;
}

function batchProgressSummary(payload: unknown): BatchProgressSummary | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  if (record.schemaVersion !== SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_SCHEMA_VERSION) return undefined;
  const summary = record.summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return undefined;
  const summaryRecord = summary as Record<string, unknown>;
  if (summaryRecord.schemaVersion !== SUBAGENT_BATCH_PROGRESS_SCHEMA_VERSION) return undefined;
  if (typeof summaryRecord.jobId !== "string") return undefined;
  if (typeof summaryRecord.itemCount !== "number") return undefined;
  if (typeof summaryRecord.acceptedReportCount !== "number") return undefined;
  if (typeof summaryRecord.pendingCount !== "number") return undefined;
  return {
    jobId: summaryRecord.jobId,
    itemCount: summaryRecord.itemCount,
    acceptedReportCount: summaryRecord.acceptedReportCount,
    pendingCount: summaryRecord.pendingCount,
  };
}

function runtimeEventPreview(preview: unknown): Pick<SubagentObservabilityEvent, "tokenCount" | "costMicros" | "localMemoryBytes"> | undefined {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return undefined;
  const record = preview as Record<string, unknown>;
  if (record.schemaVersion !== "ambient-subagent-runtime-event-v1") return undefined;
  return {
    ...(typeof record.tokenCount === "number" ? { tokenCount: record.tokenCount } : {}),
    ...(typeof record.costMicros === "number" ? { costMicros: record.costMicros } : {}),
    ...(typeof record.localMemoryBytes === "number" ? { localMemoryBytes: record.localMemoryBytes } : {}),
  };
}

function durationMs(startedAt: string, completedAt?: string): number | undefined {
  if (!completedAt) return undefined;
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return undefined;
  return Math.max(0, completed - started);
}
