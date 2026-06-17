import type {
  LocalRuntimeAffectedSubagent,
  LocalRuntimeInventoryEntry,
  LocalRuntimeLeaseRecord,
} from "../../shared/types";

export type LocalRuntimeOwnershipResolutionAction = "stop" | "restart";

export type LocalRuntimeOwnershipResolutionStatus = "resolved" | "blocked" | "failed";

export interface LocalRuntimeOwnershipResolutionRequest {
  schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1";
  action: LocalRuntimeOwnershipResolutionAction;
  runtimeId: string;
  entryId: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  providerId?: string;
  capabilityKind: LocalRuntimeInventoryEntry["capability"];
  blockerLeaseIds: string[];
  affectedSubagents: LocalRuntimeAffectedSubagent[];
  activeLeases: LocalRuntimeLeaseRecord[];
  reason: string;
}

export interface LocalRuntimeOwnershipResolutionResult {
  schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1";
  action: LocalRuntimeOwnershipResolutionAction;
  runtimeId: string;
  status: LocalRuntimeOwnershipResolutionStatus;
  reason: string;
  affectedSubagents: LocalRuntimeAffectedSubagent[];
  resolvedLeaseIds?: string[];
  resolvedChildRunIds?: string[];
  blockedLeaseIds?: string[];
  error?: string;
}

export type ResolveLocalRuntimeOwnership = (
  request: LocalRuntimeOwnershipResolutionRequest,
) => Promise<LocalRuntimeOwnershipResolutionResult> | LocalRuntimeOwnershipResolutionResult;

export function localRuntimeOwnershipResolutionRequest(input: {
  action: LocalRuntimeOwnershipResolutionAction;
  runtimeId: string;
  entry: LocalRuntimeInventoryEntry;
}): LocalRuntimeOwnershipResolutionRequest {
  const decision = input.action === "stop"
    ? input.entry.lifecycleDecision.stop
    : input.entry.lifecycleDecision.restart;
  const blockerLeaseIds = [...decision.blockerLeaseIds];
  return {
    schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
    action: input.action,
    runtimeId: input.runtimeId,
    entryId: input.entry.id,
    ...(input.entry.modelRuntimeId ? { modelRuntimeId: input.entry.modelRuntimeId } : {}),
    ...(input.entry.modelProfileId ? { modelProfileId: input.entry.modelProfileId } : {}),
    ...(input.entry.modelId ? { modelId: input.entry.modelId } : {}),
    ...(input.entry.providerId ? { providerId: input.entry.providerId } : {}),
    capabilityKind: input.entry.capability,
    blockerLeaseIds,
    affectedSubagents: decision.affectedSubagents,
    activeLeases: input.entry.leases.filter((lease) => blockerLeaseIds.includes(lease.leaseId)),
    reason: decision.reason,
  };
}

export function localRuntimeOwnershipResolutionBlocked(
  request: LocalRuntimeOwnershipResolutionRequest,
  reason = "Forced local runtime action requires a sub-agent ownership resolver before Ambient can cancel or mark affected child runs.",
): LocalRuntimeOwnershipResolutionResult {
  return {
    schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
    action: request.action,
    runtimeId: request.runtimeId,
    status: "blocked",
    reason,
    affectedSubagents: request.affectedSubagents,
  };
}

export function localRuntimeOwnershipResolutionFailed(
  request: LocalRuntimeOwnershipResolutionRequest,
  error: unknown,
): LocalRuntimeOwnershipResolutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
    action: request.action,
    runtimeId: request.runtimeId,
    status: "failed",
    reason: `Sub-agent ownership resolution failed: ${message}`,
    affectedSubagents: request.affectedSubagents,
    error: message,
  };
}

export function localRuntimeOwnershipResolutionText(
  result: LocalRuntimeOwnershipResolutionResult | undefined,
): string | undefined {
  if (!result) return undefined;
  const prefix = result.status === "resolved"
    ? "Ownership resolution resolved"
    : result.status === "blocked"
      ? "Ownership resolution blocked"
      : "Ownership resolution failed";
  const affected = result.affectedSubagents.length
    ? ` Affected sub-agents: ${result.affectedSubagents.map((subagent) =>
        `${subagent.displayName} (${affectedSubagentHandleLabel(subagent)})`
      ).join(", ")}.`
    : "";
  return `${prefix}: ${result.reason}${affected}`;
}

export function localRuntimeOwnershipResolutionAfterInventoryRefresh(input: {
  result: LocalRuntimeOwnershipResolutionResult | undefined;
  action: LocalRuntimeOwnershipResolutionAction;
  entry?: LocalRuntimeInventoryEntry;
}): LocalRuntimeOwnershipResolutionResult | undefined {
  if (!input.result || input.result.status !== "resolved" || !input.entry) return input.result;
  const decision = input.action === "stop"
    ? input.entry.lifecycleDecision.stop
    : input.entry.lifecycleDecision.restart;
  if (!decision.forceRequiresSubagentCancellation || decision.blockerLeaseIds.length === 0) return input.result;
  const resolvedLeaseIds = new Set(input.result.resolvedLeaseIds ?? []);
  const retainedLeaseIds = decision.blockerLeaseIds.filter((leaseId) =>
    resolvedLeaseIds.size ? resolvedLeaseIds.has(leaseId) : true
  );
  if (!retainedLeaseIds.length) return input.result;
  const actionLabel = input.action === "stop" ? "Stop" : "Restart";
  return {
    ...input.result,
    status: "blocked",
    reason: `Cancelled or marked the owning sub-agent, but ${leaseListLabel(retainedLeaseIds)} still active in the local runtime inventory. Ambient will not force ${actionLabel} until the runtime owner releases the lease or repair marks it stale, released, or crashed.`,
    blockedLeaseIds: uniqueStrings([
      ...(input.result.blockedLeaseIds ?? []),
      ...retainedLeaseIds,
    ]),
  };
}

function affectedSubagentHandleLabel(subagent: LocalRuntimeAffectedSubagent): string {
  if (!subagent.subagentRunId) return `${subagent.subagentThreadId}, lease ${subagent.leaseId}`;
  return `run ${subagent.subagentRunId}, thread ${subagent.subagentThreadId}, lease ${subagent.leaseId}`;
}

function leaseListLabel(leaseIds: string[]): string {
  const label = leaseIds.length === 1 ? "lease" : "leases";
  return `${label} ${leaseIds.join(", ")}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
