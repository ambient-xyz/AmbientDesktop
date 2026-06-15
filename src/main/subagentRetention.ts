import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRoleProfile } from "../shared/subagentRoles";
import type { AmbientFeatureFlagSnapshot, SubagentRunSummary, SubagentWaitBarrierSummary, ThreadSummary } from "../shared/types";

export const DEFAULT_SUBAGENT_TRANSCRIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_SUBAGENT_MAX_RETAINED_CHILDREN_PER_PARENT = 25;

export type SubagentRetentionAction = "retain" | "eligible_for_cleanup";

export type SubagentRetentionReason =
  | "missing_child_thread"
  | "child_thread_archived"
  | "child_thread_pinned"
  | "missing_parent_thread"
  | "parent_thread_active"
  | "role_retention_pinned"
  | "active_child"
  | "needs_attention"
  | "failed_child"
  | "parent_blocking_child"
  | "child_not_closed"
  | "retention_window_active"
  | "retention_window_elapsed"
  | "retention_cap_exceeded";

export interface SubagentRetentionDecision {
  runId: string;
  childThreadId: string;
  parentThreadId: string;
  status: SubagentRunStatus;
  retentionDefault: SubagentRoleProfile["retentionDefault"];
  action: SubagentRetentionAction;
  reason: SubagentRetentionReason;
  pinned: boolean;
  archived: boolean;
  parentArchived: boolean;
  summaryRetained: true;
  parentBlockingWaitBarrierIds: string[];
  closedAt?: string;
  archivedAt?: string;
  parentArchivedAt?: string;
  eligibleAt?: string;
  ageMs?: number;
}

export interface SubagentRetentionPlan {
  schemaVersion: "ambient-subagent-retention-plan-v1";
  createdAt: string;
  cleanupWindowMs: number;
  maxRetainedChildrenPerParent: number;
  decisions: SubagentRetentionDecision[];
  eligibleRunIds: string[];
  protectedRunIds: string[];
}

export interface SubagentRetentionCleanupResult {
  schemaVersion: "ambient-subagent-retention-cleanup-v1";
  createdAt: string;
  mode: "archive_child_threads";
  skipped?: boolean;
  skipReason?: "ambient_subagents_disabled";
  featureFlagSnapshot?: AmbientFeatureFlagSnapshot;
  plan: SubagentRetentionPlan;
  archivedRunIds: string[];
  archivedThreadIds: string[];
  skippedRunIds: string[];
}

export function planSubagentRetention(input: {
  runs: SubagentRunSummary[];
  threads: ThreadSummary[];
  now?: string;
  cleanupWindowMs?: number;
  maxRetainedChildrenPerParent?: number;
  waitBarriers?: SubagentWaitBarrierSummary[];
}): SubagentRetentionPlan {
  const createdAt = input.now ?? new Date().toISOString();
  const cleanupWindowMs = Math.max(0, Math.floor(input.cleanupWindowMs ?? DEFAULT_SUBAGENT_TRANSCRIPT_RETENTION_MS));
  const maxRetainedChildrenPerParent = Math.max(
    0,
    Math.floor(input.maxRetainedChildrenPerParent ?? DEFAULT_SUBAGENT_MAX_RETAINED_CHILDREN_PER_PARENT),
  );
  const threadsById = new Map(input.threads.map((thread) => [thread.id, thread]));
  const parentBlockingWaitBarrierIdsByRun = parentBlockingWaitBarrierIdsByRunId(input.waitBarriers ?? []);
  const decisions = applyRetainedChildCap(
    input.runs.map((run) => retentionDecisionForRun({
      run,
      thread: threadsById.get(run.childThreadId),
      parentThread: threadsById.get(run.parentThreadId),
      createdAt,
      cleanupWindowMs,
      parentBlockingWaitBarrierIds: parentBlockingWaitBarrierIdsByRun.get(run.id) ?? [],
    })),
    maxRetainedChildrenPerParent,
  );
  return {
    schemaVersion: "ambient-subagent-retention-plan-v1",
    createdAt,
    cleanupWindowMs,
    maxRetainedChildrenPerParent,
    decisions,
    eligibleRunIds: decisions.filter((decision) => decision.action === "eligible_for_cleanup").map((decision) => decision.runId),
    protectedRunIds: decisions.filter((decision) => decision.action === "retain").map((decision) => decision.runId),
  };
}

function applyRetainedChildCap(
  decisions: SubagentRetentionDecision[],
  maxRetainedChildrenPerParent: number,
): SubagentRetentionDecision[] {
  const selectedRunIds = new Set<string>();
  const decisionsByParent = new Map<string, SubagentRetentionDecision[]>();
  for (const decision of decisions) {
    const parentDecisions = decisionsByParent.get(decision.parentThreadId) ?? [];
    parentDecisions.push(decision);
    decisionsByParent.set(decision.parentThreadId, parentDecisions);
  }

  for (const parentDecisions of decisionsByParent.values()) {
    const visibleDecisions = parentDecisions.filter((decision) =>
      decision.reason !== "missing_child_thread" && !decision.archived
    );
    const alreadyEligibleCount = visibleDecisions.filter((decision) => decision.action === "eligible_for_cleanup").length;
    const retainedAfterScheduledCleanup = visibleDecisions.length - alreadyEligibleCount;
    const overflow = retainedAfterScheduledCleanup - maxRetainedChildrenPerParent;
    if (overflow <= 0) continue;

    const capCandidates = visibleDecisions
      .filter((decision) => decision.action === "retain" && decision.reason === "retention_window_active")
      .sort((left, right) =>
        retentionDecisionSortTime(left) - retentionDecisionSortTime(right) || left.runId.localeCompare(right.runId)
      );
    for (const decision of capCandidates.slice(0, overflow)) {
      selectedRunIds.add(decision.runId);
    }
  }

  if (selectedRunIds.size === 0) return decisions;
  return decisions.map((decision) =>
    selectedRunIds.has(decision.runId)
      ? { ...decision, action: "eligible_for_cleanup", reason: "retention_cap_exceeded" }
      : decision
  );
}

function retentionDecisionSortTime(decision: SubagentRetentionDecision): number {
  const closed = decision.closedAt ? Date.parse(decision.closedAt) : Number.NaN;
  if (Number.isFinite(closed)) return closed;
  return Number.MAX_SAFE_INTEGER;
}

function retentionDecisionForRun(input: {
  run: SubagentRunSummary;
  thread: ThreadSummary | undefined;
  parentThread: ThreadSummary | undefined;
  createdAt: string;
  cleanupWindowMs: number;
  parentBlockingWaitBarrierIds: string[];
}): SubagentRetentionDecision {
  const retentionDefault = input.run.roleProfileSnapshot.retentionDefault;
  const base = {
    runId: input.run.id,
    childThreadId: input.run.childThreadId,
    parentThreadId: input.run.parentThreadId,
    status: input.run.status,
    retentionDefault,
    pinned: Boolean(input.thread?.pinned),
    archived: Boolean(input.thread?.archivedAt),
    parentArchived: Boolean(input.parentThread?.archivedAt),
    summaryRetained: true as const,
    parentBlockingWaitBarrierIds: input.parentBlockingWaitBarrierIds,
    ...(input.run.closedAt ? { closedAt: input.run.closedAt } : {}),
    ...(input.thread?.archivedAt ? { archivedAt: input.thread.archivedAt } : {}),
    ...(input.parentThread?.archivedAt ? { parentArchivedAt: input.parentThread.archivedAt } : {}),
  };
  if (!input.thread) return { ...base, action: "retain", reason: "missing_child_thread" };
  if (input.thread.archivedAt) return { ...base, action: "retain", reason: "child_thread_archived" };
  if (input.thread.pinned) return { ...base, action: "retain", reason: "child_thread_pinned" };
  if (input.run.status === "needs_attention") return { ...base, action: "retain", reason: "needs_attention" };
  if (input.run.status === "failed") return { ...base, action: "retain", reason: "failed_child" };
  if (isActiveStatus(input.run.status)) return { ...base, action: "retain", reason: "active_child" };
  if (input.parentBlockingWaitBarrierIds.length > 0) return { ...base, action: "retain", reason: "parent_blocking_child" };
  if (!input.run.closedAt) return { ...base, action: "retain", reason: "child_not_closed" };
  if (retentionDefault === "pinned") return { ...base, action: "retain", reason: "role_retention_pinned" };
  if (retentionDefault === "keep_until_parent_pruned") {
    if (!input.parentThread) return { ...base, action: "retain", reason: "missing_parent_thread" };
    if (!input.parentThread.archivedAt) return { ...base, action: "retain", reason: "parent_thread_active" };
  }

  const ageMs = elapsedMs(input.run.closedAt, input.createdAt);
  const eligibleAt = addMsIso(input.run.closedAt, input.cleanupWindowMs);
  if (ageMs === undefined || ageMs < input.cleanupWindowMs) {
    return {
      ...base,
      action: "retain",
      reason: "retention_window_active",
      ...(eligibleAt ? { eligibleAt } : {}),
      ...(typeof ageMs === "number" ? { ageMs } : {}),
    };
  }
  return {
    ...base,
    action: "eligible_for_cleanup",
    reason: "retention_window_elapsed",
    ...(eligibleAt ? { eligibleAt } : {}),
    ageMs,
  };
}

function isActiveStatus(status: SubagentRunStatus): boolean {
  return ["reserved", "starting", "running", "waiting"].includes(status);
}

function parentBlockingWaitBarrierIdsByRunId(
  waitBarriers: readonly SubagentWaitBarrierSummary[],
): Map<string, string[]> {
  const byRunId = new Map<string, string[]>();
  for (const barrier of waitBarriers) {
    if (!isParentBlockingWaitBarrier(barrier)) continue;
    for (const childRunId of barrier.childRunIds) {
      const ids = byRunId.get(childRunId) ?? [];
      ids.push(barrier.id);
      byRunId.set(childRunId, ids);
    }
  }
  return byRunId;
}

function isParentBlockingWaitBarrier(barrier: SubagentWaitBarrierSummary): boolean {
  if (barrier.dependencyMode === "optional_background") return false;
  return barrier.status === "waiting_on_children" ||
    barrier.status === "failed" ||
    barrier.status === "timed_out";
}

function elapsedMs(startIso: string, endIso: string): number | undefined {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return Math.max(0, end - start);
}

function addMsIso(startIso: string, ms: number): string | undefined {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return undefined;
  return new Date(start + ms).toISOString();
}
