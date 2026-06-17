import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES } from "./subagentWaitBarrierEvaluation";

export const SUBAGENT_TARGET_RESOLVER_SCHEMA_VERSION =
  "ambient-subagent-target-resolver-v1" as const;

export interface SubagentTargetResolverStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary;
  listSubagentRunsForParentThread(parentThreadId: string): SubagentRunSummary[];
  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[];
}

export interface ResolveSubagentTargetInput {
  store: SubagentTargetResolverStore;
  parentThreadId: string;
  request: Record<string, unknown>;
}

export function resolveSubagentTargetRun(input: ResolveSubagentTargetInput): SubagentRunSummary {
  const childRunId = optionalString(input.request.childRunId)
    ?? optionalString(input.request.agentId);
  const canonicalTaskPath = optionalString(input.request.canonicalTaskPath);
  const parentRuns = () => input.store.listSubagentRunsForParentThread(input.parentThreadId);
  const run = childRunId
    ? resolveByChildRunId(input.store, parentRuns, childRunId)
    : parentRuns().find((candidate) => candidate.canonicalTaskPath === canonicalTaskPath);
  if (!run) throw new Error("childRunId, agentId, or canonicalTaskPath must identify an existing sub-agent run.");
  if (run.parentThreadId !== input.parentThreadId) {
    throw new Error(`Sub-agent run ${run.id} does not belong to the current parent thread.`);
  }
  return run;
}

export function resolveSubagentTargetWaitBarrier(input: ResolveSubagentTargetInput): SubagentWaitBarrierSummary {
  const waitBarrierId = optionalString(input.request.waitBarrierId);
  if (waitBarrierId) {
    const barrier = input.store.getSubagentWaitBarrier(waitBarrierId);
    assertSubagentWaitBarrierBelongsToParentThread(barrier, input.parentThreadId);
    return barrier;
  }
  const run = resolveSubagentTargetRun(input);
  const barrier = input.store
    .listSubagentWaitBarriersForParentRun(run.parentRunId)
    .filter((candidate) =>
      candidate.parentThreadId === input.parentThreadId
      && candidate.childRunIds.includes(run.id)
    )
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  if (!barrier) throw new Error(`No sub-agent wait barrier exists for child run ${run.id}.`);
  return barrier;
}

export function assertSubagentRunOpenForAction(
  run: Pick<SubagentRunSummary, "id" | "closedAt" | "status">,
  action: string,
): void {
  if (run.closedAt) throw new Error(`Cannot ${action} for closed sub-agent ${run.id}.`);
  if (SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status as SubagentRunStatus)) {
    throw new Error(`Cannot ${action} for terminal sub-agent ${run.id} (${run.status}).`);
  }
}

function assertSubagentWaitBarrierBelongsToParentThread(
  barrier: SubagentWaitBarrierSummary,
  parentThreadId: string,
): void {
  if (barrier.parentThreadId !== parentThreadId) {
    throw new Error(`Sub-agent wait barrier ${barrier.id} does not belong to the current parent thread.`);
  }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveByChildRunId(
  store: Pick<SubagentTargetResolverStore, "getSubagentRun">,
  parentRuns: () => SubagentRunSummary[],
  childRunId: string,
): SubagentRunSummary | undefined {
  try {
    return store.getSubagentRun(childRunId);
  } catch {
    return uniqueNearMissRun(parentRuns(), childRunId);
  }
}

function uniqueNearMissRun(runs: SubagentRunSummary[], childRunId: string): SubagentRunSummary | undefined {
  if (!looksLikeRunId(childRunId)) return undefined;
  const candidates = runs
    .map((run) => ({ run, distance: levenshteinDistance(run.id, childRunId) }))
    .filter((candidate) =>
      candidate.distance > 0 &&
      candidate.distance <= 2 &&
      shareStableRunIdShape(candidate.run.id, childRunId)
    )
    .sort((a, b) => a.distance - b.distance);
  if (candidates.length !== 1) return undefined;
  return candidates[0].run;
}

function looksLikeRunId(value: string): boolean {
  return /^[a-z0-9-]{12,}$/i.test(value);
}

function shareStableRunIdShape(left: string, right: string): boolean {
  return left.slice(0, 8) === right.slice(0, 8) ||
    left.slice(-8) === right.slice(-8);
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}
