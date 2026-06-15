import type {
  LocalModelResourcePolicyDecision,
  LocalRuntimeInventoryEntry,
  LocalRuntimeInventorySnapshot,
} from "../shared/types";
import {
  localRuntimeMemoryPolicyEvidenceText,
  localRuntimeResidentMemoryEvidenceText,
} from "./localModelRuntimeActionEvidence";
import {
  localRuntimeOwnershipResolutionText,
  type LocalRuntimeOwnershipResolutionResult,
} from "./localRuntimeOwnershipResolution";
import type { LocalModelRuntimeStopResult as RuntimeManagerStopResult } from "./localModelRuntimeManager";
import type { LocalRuntimeProviderLifecycleResult } from "./localRuntimeProviderLifecycle";

export type LocalModelRuntimeStopStatus =
  | "ready"
  | "stopped"
  | "blocked"
  | "not-found"
  | "failed"
  | "unavailable";

export interface LocalModelRuntimeStopRequest {
  runtimeId: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface LocalModelRuntimeStopPlan {
  schemaVersion: "ambient-local-model-runtime-stop-plan-v1";
  status: "ready" | "blocked" | "not-found";
  runtimeId: string;
  forceRequested: boolean;
  dryRun: boolean;
  reason: string;
  memoryPolicy?: LocalModelResourcePolicyDecision;
  entry?: LocalRuntimeInventoryEntry;
}

export interface LocalModelRuntimeStopToolResult {
  schemaVersion: "ambient-local-model-runtime-stop-v1";
  status: LocalModelRuntimeStopStatus;
  runtimeId: string;
  forceRequested: boolean;
  dryRun: boolean;
  reason: string;
  memoryPolicy?: LocalModelResourcePolicyDecision;
  entry?: LocalRuntimeInventoryEntry;
  stopResult?: RuntimeManagerStopResult;
  providerResult?: LocalRuntimeProviderLifecycleResult;
  ownershipResolution?: LocalRuntimeOwnershipResolutionResult;
}

export function planLocalModelRuntimeStop(input: {
  inventory: LocalRuntimeInventorySnapshot;
  request: LocalModelRuntimeStopRequest;
}): LocalModelRuntimeStopPlan {
  const runtimeId = normalizeRuntimeId(input.request.runtimeId);
  const forceRequested = input.request.force === true;
  const dryRun = input.request.dryRun === true;
  const memoryPolicy = input.inventory.memoryPolicy;
  const entry = findRuntimeInventoryEntry(input.inventory, runtimeId);
  if (!entry) {
    return {
      schemaVersion: "ambient-local-model-runtime-stop-plan-v1",
      status: "not-found",
      runtimeId,
      forceRequested,
      dryRun,
      reason: `No local model runtime row matches "${runtimeId}". Call ambient_local_model_runtime_status for current ids before stopping.`,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (entry.capability !== "local-text" && !entry.providerLifecycle) {
    return {
      schemaVersion: "ambient-local-model-runtime-stop-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: entry.lifecycleDecision.stop.reason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (entry.trackingStatus === "untracked") {
    return {
      schemaVersion: "ambient-local-model-runtime-stop-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: entry.lifecycleDecision.stop.reason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (!entry.lifecycleDecision.stop.allowed) {
    const forceDetail = forceRequested && entry.lifecycleDecision.stop.forceRequiresSubagentCancellation
      ? " Forced termination requires explicit cancellation or failure marking for the owning sub-agent before Ambient stops its model."
      : "";
    return {
      schemaVersion: "ambient-local-model-runtime-stop-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: `${entry.lifecycleDecision.stop.reason}${forceDetail}`.trim(),
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (!entry.modelRuntimeId && entry.capability === "local-text") {
    return {
      schemaVersion: "ambient-local-model-runtime-stop-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: "The selected local runtime row has no modelRuntimeId, so Ambient cannot target it for managed Stop.",
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  return {
    schemaVersion: "ambient-local-model-runtime-stop-plan-v1",
    status: "ready",
    runtimeId,
    forceRequested,
    dryRun,
    entry,
    ...(memoryPolicy ? { memoryPolicy } : {}),
    reason: dryRun
      ? `Local runtime ${runtimeTargetId(entry)} can be stopped; dryRun requested no process changes.`
      : `Local runtime ${runtimeTargetId(entry)} can be stopped by ordinary Stop.`,
  };
}

export function localModelRuntimeStopToolResult(input: {
  plan: LocalModelRuntimeStopPlan;
  stopResult?: RuntimeManagerStopResult;
  providerResult?: LocalRuntimeProviderLifecycleResult;
  ownershipResolution?: LocalRuntimeOwnershipResolutionResult;
}): LocalModelRuntimeStopToolResult {
  if (input.plan.status !== "ready") {
    return {
      schemaVersion: "ambient-local-model-runtime-stop-v1",
      status: input.plan.status,
      runtimeId: input.plan.runtimeId,
      forceRequested: input.plan.forceRequested,
      dryRun: input.plan.dryRun,
      reason: input.plan.reason,
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
      ...(input.ownershipResolution ? { ownershipResolution: input.ownershipResolution } : {}),
    };
  }
  if (input.plan.dryRun) {
    return {
      schemaVersion: "ambient-local-model-runtime-stop-v1",
      status: "ready",
      runtimeId: input.plan.runtimeId,
      forceRequested: input.plan.forceRequested,
      dryRun: true,
      reason: input.plan.reason,
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
      ...(input.ownershipResolution ? { ownershipResolution: input.ownershipResolution } : {}),
    };
  }
  if (!input.stopResult && !input.providerResult) {
    return {
      schemaVersion: "ambient-local-model-runtime-stop-v1",
      status: "unavailable",
      runtimeId: input.plan.runtimeId,
      forceRequested: input.plan.forceRequested,
      dryRun: false,
      reason: "Local model runtime Stop is not available in this Ambient runtime.",
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
      ...(input.ownershipResolution ? { ownershipResolution: input.ownershipResolution } : {}),
    };
  }
  if (input.providerResult) {
    return {
      schemaVersion: "ambient-local-model-runtime-stop-v1",
      status: input.providerResult.status as LocalModelRuntimeStopStatus,
      runtimeId: input.plan.runtimeId,
      forceRequested: input.plan.forceRequested,
      dryRun: false,
      reason: providerLifecycleStopReason(input.providerResult),
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
      providerResult: input.providerResult,
      ...(input.ownershipResolution ? { ownershipResolution: input.ownershipResolution } : {}),
    };
  }
  if (!input.stopResult) throw new Error("Stop result unexpectedly missing.");
  const reason = stopResultReason(input.stopResult);
  return {
    schemaVersion: "ambient-local-model-runtime-stop-v1",
    status: input.stopResult.status,
    runtimeId: input.plan.runtimeId,
    forceRequested: input.plan.forceRequested,
    dryRun: false,
    reason,
    ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
    ...(input.plan.entry ? { entry: input.plan.entry } : {}),
    stopResult: input.stopResult,
    ...(input.ownershipResolution ? { ownershipResolution: input.ownershipResolution } : {}),
  };
}

export function localModelRuntimeStopText(result: LocalModelRuntimeStopToolResult): string {
  const prefix = result.status === "stopped"
    ? "Local model runtime stopped"
    : result.status === "ready"
      ? "Local model runtime Stop ready"
      : result.status === "blocked"
        ? "Local model runtime Stop blocked"
        : result.status === "not-found"
          ? "Local model runtime Stop target not found"
          : result.status === "unavailable"
            ? "Local model runtime Stop unavailable"
            : "Local model runtime Stop failed";
  return [
    `${prefix}: ${result.runtimeId}.`,
    result.reason,
    result.entry ? `Tracking: ${result.entry.trackingStatus}; running: ${result.entry.running ? "yes" : "no"}.` : undefined,
    localRuntimeResidentMemoryEvidenceText(result.entry),
    localRuntimeMemoryPolicyEvidenceText(result.memoryPolicy),
    localRuntimeOwnershipResolutionText(result.ownershipResolution),
    result.entry?.owners.length
      ? `Owners: ${result.entry.owners.map((owner) => owner.displayName).join(", ")}.`
      : undefined,
    result.entry ? affectedSubagentStopText(result.entry) : undefined,
    result.stopResult?.pid !== undefined ? `PID: ${result.stopResult.pid}.` : undefined,
    result.providerResult?.commandName ? `Provider command: ${result.providerResult.commandName}.` : undefined,
    result.providerResult?.stdoutArtifactPath ? `Provider stdout: ${result.providerResult.stdoutArtifactPath}.` : undefined,
    result.providerResult?.stderrArtifactPath ? `Provider stderr: ${result.providerResult.stderrArtifactPath}.` : undefined,
  ].filter(Boolean).join("\n");
}

function affectedSubagentStopText(entry: LocalRuntimeInventoryEntry): string | undefined {
  const affected = entry.lifecycleDecision.stop.affectedSubagents;
  if (!affected.length) return undefined;
  return `Affected sub-agents: ${affected.map((subagent) =>
    `${subagent.displayName} (${subagent.subagentThreadId}, lease ${subagent.leaseId})`
  ).join(", ")}.`;
}

function findRuntimeInventoryEntry(
  inventory: LocalRuntimeInventorySnapshot,
  runtimeId: string,
): LocalRuntimeInventoryEntry | undefined {
  return inventory.entries.find((entry) =>
    entry.id === runtimeId ||
    entry.modelRuntimeId === runtimeId ||
    `${entry.capability}:${entry.modelRuntimeId ?? entry.id}` === runtimeId
  );
}

function stopResultReason(result: RuntimeManagerStopResult): string {
  if (result.status === "stopped") return "Managed local runtime process was stopped and its runtime state was marked stopped.";
  if (result.status === "blocked") return result.reason ?? "Local runtime Stop was blocked.";
  if (result.status === "not-found") return result.reason ?? "No matching managed local runtime state was found.";
  if (result.status === "failed") return result.error ?? "Local runtime Stop failed.";
  return "Local runtime Stop did not complete.";
}

function providerLifecycleStopReason(result: LocalRuntimeProviderLifecycleResult): string {
  if (result.status === "stopped") return result.reason ?? "Provider-declared local runtime Stop completed.";
  if (result.status === "blocked") return result.reason ?? "Provider-declared local runtime Stop was blocked.";
  if (result.status === "failed") return result.error ?? "Provider-declared local runtime Stop failed.";
  return result.reason ?? "Provider-declared local runtime Stop returned an unexpected status.";
}

function runtimeTargetId(entry: LocalRuntimeInventoryEntry): string {
  return entry.modelRuntimeId ?? entry.id;
}

function normalizeRuntimeId(value: string): string {
  return typeof value === "string" ? value.trim() : "";
}
