import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
} from "../shared/types";
import type {
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
} from "../shared/subagentProtocol";

export const SUBAGENT_WAIT_CONTEXT_RESOLVER_SCHEMA_VERSION =
  "ambient-subagent-wait-context-resolver-v1" as const;

export const SUBAGENT_WAIT_CONTEXT_BARRIER_MODES = [
  "required_all",
  "required_any",
  "quorum",
  "optional_background",
] as const;

export const SUBAGENT_WAIT_CONTEXT_BARRIER_FAILURE_POLICIES = [
  "fail_parent",
  "ask_user",
  "degrade_partial",
  "retry_child",
] as const;

export interface SubagentWaitContextResolverStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[];
  createSubagentWaitBarrier(input: {
    parentThreadId: string;
    parentRunId: string;
    childRunIds: string[];
    dependencyMode: SubagentWaitBarrierMode;
    failurePolicy: SubagentWaitBarrierFailurePolicy;
    quorumThreshold?: number;
    timeoutMs?: number;
  }): SubagentWaitBarrierSummary;
}

export interface SubagentWaitContext {
  run: SubagentRunSummary;
  childRuns: SubagentRunSummary[];
  waitBarrier: SubagentWaitBarrierSummary;
}

export interface ResolveSubagentWaitContextInput {
  store: SubagentWaitContextResolverStore;
  parentThread: Pick<ThreadSummary, "id">;
  request: Record<string, unknown>;
  timeoutMs: number;
  resolveTargetRun(request: Record<string, unknown>): SubagentRunSummary;
  resolveTargetWaitBarrier(request: Record<string, unknown>): SubagentWaitBarrierSummary;
}

export function resolveSubagentWaitContext(input: ResolveSubagentWaitContextInput): SubagentWaitContext {
  const waitBarrierId = optionalString(input.request.waitBarrierId);
  if (waitBarrierId) {
    const waitBarrier = input.resolveTargetWaitBarrier(input.request);
    const childRuns = waitBarrier.childRunIds.map((childRunId) => input.store.getSubagentRun(childRunId));
    validateSubagentWaitChildRuns(input.parentThread.id, childRuns);
    const run = resolvePrimarySubagentWaitRun(input, childRuns);
    return { run, childRuns, waitBarrier };
  }

  const requestedChildRunIds = optionalStringArray(input.request.childRunIds, "childRunIds");
  if (requestedChildRunIds.length > 0 || hasExplicitSubagentWaitBarrierPolicy(input.request)) {
    const childRuns = requestedChildRunIds.length > 0
      ? resolveSubagentWaitRunsByIds(input.store, input.parentThread.id, requestedChildRunIds)
      : [input.resolveTargetRun(input.request)];
    const waitBarrier = ensureSubagentWaitBarrierForRuns(input, childRuns);
    const run = resolvePrimarySubagentWaitRun(input, childRuns);
    return { run, childRuns, waitBarrier };
  }

  const run = input.resolveTargetRun(input.request);
  return {
    run,
    childRuns: [run],
    waitBarrier: ensureSubagentWaitBarrierForRun(input, run),
  };
}

export function ensureSubagentWaitBarrierForRuns(
  input: Pick<ResolveSubagentWaitContextInput, "store" | "parentThread" | "request" | "timeoutMs">,
  runs: SubagentRunSummary[],
): SubagentWaitBarrierSummary {
  validateSubagentWaitChildRuns(input.parentThread.id, runs);
  const childRunIds = runs.map((run) => run.id);
  const dependencyMode = enumValueOptionalStrict(
    input.request.waitBarrierMode,
    SUBAGENT_WAIT_CONTEXT_BARRIER_MODES,
    "waitBarrierMode",
  ) ?? defaultSubagentWaitBarrierModeForRuns(runs);
  const failurePolicy = enumValueOptionalStrict(
    input.request.failurePolicy,
    SUBAGENT_WAIT_CONTEXT_BARRIER_FAILURE_POLICIES,
    "failurePolicy",
  ) ?? defaultSubagentWaitBarrierFailurePolicy(dependencyMode);
  const quorumThreshold = optionalInteger(input.request.quorumThreshold, "quorumThreshold");
  const existing = findSubagentWaitBarrierForRuns(input.store, runs[0]!.parentRunId, {
    childRunIds,
    dependencyMode,
    failurePolicy,
    quorumThreshold,
  });
  if (existing) return existing;
  return input.store.createSubagentWaitBarrier({
    parentThreadId: input.parentThread.id,
    parentRunId: runs[0]!.parentRunId,
    childRunIds,
    dependencyMode,
    failurePolicy,
    ...(quorumThreshold !== undefined ? { quorumThreshold } : {}),
    timeoutMs: input.timeoutMs,
  });
}

export function ensureSubagentWaitBarrierForRun(
  input: Pick<ResolveSubagentWaitContextInput, "store" | "parentThread" | "timeoutMs">,
  run: SubagentRunSummary,
): SubagentWaitBarrierSummary {
  const barriers = input.store
    .listSubagentWaitBarriersForParentRun(run.parentRunId)
    .filter((barrier) => barrier.childRunIds.includes(run.id));
  const existing = barriers.find((barrier) => barrier.status === "waiting_on_children") ?? barriers.at(-1);
  if (existing) return existing;
  return input.store.createSubagentWaitBarrier({
    parentThreadId: input.parentThread.id,
    parentRunId: run.parentRunId,
    childRunIds: [run.id],
    dependencyMode: run.dependencyMode === "optional_background" ? "optional_background" : "required_all",
    failurePolicy: run.dependencyMode === "optional_background" ? "degrade_partial" : "ask_user",
    timeoutMs: input.timeoutMs,
  });
}

export function findSubagentWaitBarrierForRuns(
  store: Pick<SubagentWaitContextResolverStore, "listSubagentWaitBarriersForParentRun">,
  parentRunId: string,
  input: {
    childRunIds: string[];
    dependencyMode: SubagentWaitBarrierMode;
    failurePolicy: SubagentWaitBarrierFailurePolicy;
    quorumThreshold?: number;
  },
): SubagentWaitBarrierSummary | undefined {
  const expectedChildKey = subagentWaitChildRunSetKey(input.childRunIds);
  const matches = store
    .listSubagentWaitBarriersForParentRun(parentRunId)
    .filter((barrier) =>
      subagentWaitChildRunSetKey(barrier.childRunIds) === expectedChildKey &&
      barrier.dependencyMode === input.dependencyMode &&
      barrier.failurePolicy === input.failurePolicy &&
      (input.dependencyMode !== "quorum" || barrier.quorumThreshold === input.quorumThreshold)
    )
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return matches.slice().reverse().find((barrier) => barrier.status === "waiting_on_children") ?? matches.at(-1);
}

export function defaultSubagentWaitBarrierModeForRuns(runs: SubagentRunSummary[]): SubagentWaitBarrierMode {
  return runs.every((run) => run.dependencyMode === "optional_background") ? "optional_background" : "required_all";
}

export function defaultSubagentWaitBarrierFailurePolicy(
  dependencyMode: SubagentWaitBarrierMode,
): SubagentWaitBarrierFailurePolicy {
  return dependencyMode === "optional_background" ? "degrade_partial" : "ask_user";
}

export function hasExplicitSubagentWaitBarrierPolicy(input: Record<string, unknown>): boolean {
  return input.waitBarrierMode !== undefined || input.failurePolicy !== undefined || input.quorumThreshold !== undefined;
}

export function resolveSubagentWaitRunsByIds(
  store: Pick<SubagentWaitContextResolverStore, "getSubagentRun">,
  parentThreadId: string,
  childRunIds: string[],
): SubagentRunSummary[] {
  const runs = [...new Set(childRunIds)].map((childRunId) => store.getSubagentRun(childRunId));
  validateSubagentWaitChildRuns(parentThreadId, runs);
  return runs;
}

export function validateSubagentWaitChildRuns(parentThreadId: string, runs: SubagentRunSummary[]): void {
  if (runs.length === 0) throw new Error("wait_agent requires at least one child run.");
  const parentRunId = runs[0]!.parentRunId;
  for (const run of runs) {
    if (run.parentThreadId !== parentThreadId) {
      throw new Error(`Sub-agent run ${run.id} does not belong to the current parent thread.`);
    }
    if (run.parentRunId !== parentRunId) {
      throw new Error("wait_agent childRunIds must belong to the same parent run.");
    }
  }
}

export function resolvePrimarySubagentWaitRun(
  input: Pick<ResolveSubagentWaitContextInput, "parentThread" | "request" | "resolveTargetRun">,
  childRuns: SubagentRunSummary[],
): SubagentRunSummary {
  const hasExplicitRunHandle =
    input.request.childRunId !== undefined ||
    input.request.agentId !== undefined ||
    input.request.canonicalTaskPath !== undefined;
  if (!hasExplicitRunHandle) return childRuns[0]!;
  const run = input.resolveTargetRun(input.request);
  if (!childRuns.some((childRun) => childRun.id === run.id)) {
    throw new Error(`Sub-agent run ${run.id} is not part of the requested wait barrier childRunIds.`);
  }
  return run;
}

export function subagentWaitChildRunSetKey(childRunIds: string[]): string {
  return [...new Set(childRunIds)].sort().join("\u0000");
}

function optionalStringArray(value: unknown, key: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array of strings.`);
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) throw new Error(`${key} must be an array of strings.`);
    return item.trim();
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function enumValueOptionalStrict<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  key: string,
): T[number] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function optionalInteger(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${key} must be a positive integer.`);
  return Number(value);
}
