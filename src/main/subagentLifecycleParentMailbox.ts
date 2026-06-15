import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../shared/types";

export const SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE = "subagent.lifecycle_interrupted" as const;
export const SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_SCHEMA_VERSION =
  "ambient-subagent-lifecycle-interruption-v1" as const;

export type SubagentLifecycleInterruptionSource =
  | "parent_cancel_request"
  | "direct_child_stop"
  | "desktop_restart"
  | "runtime_budget_exceeded"
  | "runtime_hard_cap_exceeded"
  | "runtime_idle_timeout"
  | "max_turns_exceeded";

export interface SubagentLifecycleInterruptionParentMailboxPayloadInput {
  run: SubagentRunSummary;
  previousStatus?: SubagentRunStatus;
  source: SubagentLifecycleInterruptionSource;
  reason: string;
  resultArtifact?: unknown;
  toolCallId?: string;
  waitBarrierIds?: readonly string[];
  waitBarriers?: readonly SubagentWaitBarrierSummary[];
  cancelledMailboxEventIds?: readonly string[];
}

export function subagentLifecycleInterruptionParentMailboxPayload(
  input: SubagentLifecycleInterruptionParentMailboxPayloadInput,
): Record<string, unknown> {
  const resultArtifact = compactResultArtifact(input.resultArtifact ?? input.run.resultArtifact);
  const waitBarrierIds = input.waitBarriers?.map((barrier) => barrier.id) ?? input.waitBarrierIds ?? [];
  const waitBarrierConsequences = input.waitBarriers?.map(compactWaitBarrierConsequence) ?? [];
  const cancelledWaitBarrierIds = waitBarrierConsequences
    .filter((barrier) => barrier.status === "cancelled")
    .map((barrier) => barrier.waitBarrierId);
  const failedWaitBarrierIds = waitBarrierConsequences
    .filter((barrier) => barrier.status === "failed")
    .map((barrier) => barrier.waitBarrierId);
  const partialWaitBarrierIds = waitBarrierConsequences
    .filter((barrier) => barrier.consequence === "partial_result_available")
    .map((barrier) => barrier.waitBarrierId);
  return {
    schemaVersion: SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_SCHEMA_VERSION,
    parentThreadId: input.run.parentThreadId,
    parentRunId: input.run.parentRunId,
    ...(input.run.parentMessageId ? { parentMessageId: input.run.parentMessageId } : {}),
    childRunId: input.run.id,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    roleId: input.run.roleId,
    ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
    status: input.run.status,
    source: input.source,
    reason: input.reason,
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    ...(waitBarrierIds.length ? { waitBarrierIds } : {}),
    ...(waitBarrierConsequences.length ? { waitBarrierConsequences } : {}),
    ...(cancelledWaitBarrierIds.length ? { cancelledWaitBarrierIds } : {}),
    ...(failedWaitBarrierIds.length ? { failedWaitBarrierIds } : {}),
    ...(partialWaitBarrierIds.length ? { partialWaitBarrierIds } : {}),
    ...(input.cancelledMailboxEventIds?.length ? { cancelledMailboxEventIds: [...input.cancelledMailboxEventIds] } : {}),
    ...(resultArtifact ? { resultArtifact } : {}),
  };
}

export function subagentLifecycleInterruptionIdempotencyKey(input: {
  runId: string;
  source: SubagentLifecycleInterruptionSource;
  idempotencyKey?: string;
}): string {
  return `subagent:lifecycle_interrupted:${input.source}:${input.idempotencyKey ?? input.runId}`;
}

function compactResultArtifact(value: unknown): Record<string, unknown> | undefined {
  const artifact = recordValue(value);
  if (!artifact) return undefined;
  const compact: Record<string, unknown> = {};
  copyStringField(artifact, compact, "status");
  copyBooleanField(artifact, compact, "partial");
  copyStringField(artifact, compact, "summary", 500);
  copyStringField(artifact, compact, "childThreadId");
  copyStringField(artifact, compact, "artifactPath");
  copyStringField(artifact, compact, "fullOutputPath");
  copyStringField(artifact, compact, "structuredOutputPath");
  copyStringField(artifact, compact, "provenanceHash");
  return Object.keys(compact).length ? compact : undefined;
}

function compactWaitBarrierConsequence(barrier: SubagentWaitBarrierSummary): {
  schemaVersion: "ambient-subagent-wait-barrier-consequence-v1";
  waitBarrierId: string;
  status: SubagentWaitBarrierSummary["status"];
  dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
  failurePolicy: SubagentWaitBarrierSummary["failurePolicy"];
  childRunIds: string[];
  synthesisAllowed: boolean;
  partial: boolean;
  consequence:
    | "partial_result_available"
    | "synthesis_available"
    | "barrier_cancelled"
    | "barrier_failed"
    | "barrier_timed_out"
    | "still_waiting";
  reason?: string;
} {
  const artifact = recordValue(barrier.resolutionArtifact);
  const evaluation = recordValue(artifact?.waitBarrierEvaluation);
  const synthesisAllowed = booleanValue(artifact?.synthesisAllowed) ?? booleanValue(evaluation?.synthesisAllowed) ?? false;
  const partial = booleanValue(evaluation?.partial) ?? booleanValue(artifact?.explicitPartial) ?? false;
  const consequence = synthesisAllowed && partial
    ? "partial_result_available"
    : synthesisAllowed
      ? "synthesis_available"
      : barrier.status === "cancelled"
        ? "barrier_cancelled"
        : barrier.status === "failed"
          ? "barrier_failed"
          : barrier.status === "timed_out"
            ? "barrier_timed_out"
            : "still_waiting";
  const reason = stringValue(evaluation?.reason);
  return {
    schemaVersion: "ambient-subagent-wait-barrier-consequence-v1",
    waitBarrierId: barrier.id,
    status: barrier.status,
    dependencyMode: barrier.dependencyMode,
    failurePolicy: barrier.failurePolicy,
    childRunIds: [...barrier.childRunIds],
    synthesisAllowed,
    partial,
    consequence,
    ...(reason ? { reason } : {}),
  };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function copyStringField(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: string,
  maxChars?: number,
): void {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) return;
  target[key] = maxChars === undefined ? value : truncate(value, maxChars);
}

function copyBooleanField(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  const value = source[key];
  if (typeof value === "boolean") target[key] = value;
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}
