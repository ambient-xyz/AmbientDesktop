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
import type { LocalModelRuntimeRestartResult as RuntimeManagerRestartResult } from "./localModelRuntimeManager";
import type { LocalRuntimeProviderLifecycleResult } from "./localRuntimeProviderLifecycle";

export type LocalModelRuntimeRestartStatus =
  | "ready"
  | "restarted"
  | "blocked"
  | "not-found"
  | "failed"
  | "unavailable";

export interface LocalModelRuntimeRestartRequest {
  runtimeId: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface LocalModelRuntimeRestartPlan {
  schemaVersion: "ambient-local-model-runtime-restart-plan-v1";
  status: "ready" | "blocked" | "not-found";
  runtimeId: string;
  forceRequested: boolean;
  dryRun: boolean;
  reason: string;
  memoryPolicy?: LocalModelResourcePolicyDecision;
  entry?: LocalRuntimeInventoryEntry;
}

export interface LocalModelRuntimeRestartToolResult {
  schemaVersion: "ambient-local-model-runtime-restart-v1";
  status: LocalModelRuntimeRestartStatus;
  runtimeId: string;
  forceRequested: boolean;
  dryRun: boolean;
  reason: string;
  memoryPolicy?: LocalModelResourcePolicyDecision;
  entry?: LocalRuntimeInventoryEntry;
  restartResult?: RuntimeManagerRestartResult;
  providerResult?: LocalRuntimeProviderLifecycleResult;
  ownershipResolution?: LocalRuntimeOwnershipResolutionResult;
}

export function planLocalModelRuntimeRestart(input: {
  inventory: LocalRuntimeInventorySnapshot;
  request: LocalModelRuntimeRestartRequest;
}): LocalModelRuntimeRestartPlan {
  const runtimeId = normalizeRuntimeId(input.request.runtimeId);
  const forceRequested = input.request.force === true;
  const dryRun = input.request.dryRun === true;
  const memoryPolicy = input.inventory.memoryPolicy;
  const entry = findRuntimeInventoryEntry(input.inventory, runtimeId);
  if (!entry) {
    return {
      schemaVersion: "ambient-local-model-runtime-restart-plan-v1",
      status: "not-found",
      runtimeId,
      forceRequested,
      dryRun,
      reason: `No local model runtime row matches "${runtimeId}". Call ambient_local_model_runtime_status for current ids before restarting.`,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (entry.capability !== "local-text" && !entry.providerLifecycle) {
    return {
      schemaVersion: "ambient-local-model-runtime-restart-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: entry.lifecycleDecision.restart.reason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (entry.trackingStatus === "untracked") {
    return {
      schemaVersion: "ambient-local-model-runtime-restart-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: entry.lifecycleDecision.restart.reason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (!entry.lifecycleDecision.restart.allowed) {
    const forceDetail = forceRequested && entry.lifecycleDecision.restart.forceRequiresSubagentCancellation
      ? " Forced restart requires explicit cancellation or failure marking for the owning sub-agent before Ambient restarts its model."
      : "";
    return {
      schemaVersion: "ambient-local-model-runtime-restart-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: `${entry.lifecycleDecision.restart.reason}${forceDetail}`.trim(),
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (!entry.modelRuntimeId && entry.capability === "local-text") {
    return {
      schemaVersion: "ambient-local-model-runtime-restart-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: "The selected local runtime row has no modelRuntimeId, so Ambient cannot target it for managed Restart.",
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  const memoryPolicyBlockReason = localRuntimeLifecycleMemoryPolicyBlockReason(memoryPolicy, "Restart");
  if (memoryPolicyBlockReason) {
    return {
      schemaVersion: "ambient-local-model-runtime-restart-plan-v1",
      status: "blocked",
      runtimeId,
      forceRequested,
      dryRun,
      entry,
      reason: memoryPolicyBlockReason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  return {
    schemaVersion: "ambient-local-model-runtime-restart-plan-v1",
    status: "ready",
    runtimeId,
    forceRequested,
    dryRun,
    entry,
    ...(memoryPolicy ? { memoryPolicy } : {}),
    reason: dryRun
      ? `Local runtime ${runtimeTargetId(entry)} can be restarted; dryRun requested no process changes.`
      : `Local runtime ${runtimeTargetId(entry)} can be restarted by ordinary Restart.`,
  };
}

export function localModelRuntimeRestartToolResult(input: {
  plan: LocalModelRuntimeRestartPlan;
  restartResult?: RuntimeManagerRestartResult;
  providerResult?: LocalRuntimeProviderLifecycleResult;
  ownershipResolution?: LocalRuntimeOwnershipResolutionResult;
}): LocalModelRuntimeRestartToolResult {
  if (input.plan.status !== "ready") {
    return {
      schemaVersion: "ambient-local-model-runtime-restart-v1",
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
      schemaVersion: "ambient-local-model-runtime-restart-v1",
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
  if (!input.restartResult && !input.providerResult) {
    return {
      schemaVersion: "ambient-local-model-runtime-restart-v1",
      status: "unavailable",
      runtimeId: input.plan.runtimeId,
      forceRequested: input.plan.forceRequested,
      dryRun: false,
      reason: "Local model runtime Restart is not available in this Ambient runtime.",
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
      ...(input.ownershipResolution ? { ownershipResolution: input.ownershipResolution } : {}),
    };
  }
  if (input.providerResult) {
    return {
      schemaVersion: "ambient-local-model-runtime-restart-v1",
      status: input.providerResult.status as LocalModelRuntimeRestartStatus,
      runtimeId: input.plan.runtimeId,
      forceRequested: input.plan.forceRequested,
      dryRun: false,
      reason: providerLifecycleRestartReason(input.providerResult),
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
      providerResult: input.providerResult,
      ...(input.ownershipResolution ? { ownershipResolution: input.ownershipResolution } : {}),
    };
  }
  if (!input.restartResult) throw new Error("Restart result unexpectedly missing.");
  const reason = restartResultReason(input.restartResult);
  return {
    schemaVersion: "ambient-local-model-runtime-restart-v1",
    status: input.restartResult.status,
    runtimeId: input.plan.runtimeId,
    forceRequested: input.plan.forceRequested,
    dryRun: false,
    reason,
    ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
    ...(input.plan.entry ? { entry: input.plan.entry } : {}),
    restartResult: input.restartResult,
    ...(input.ownershipResolution ? { ownershipResolution: input.ownershipResolution } : {}),
  };
}

export function localModelRuntimeRestartText(result: LocalModelRuntimeRestartToolResult): string {
  const prefix = result.status === "restarted"
    ? "Local model runtime restarted"
    : result.status === "ready"
      ? "Local model runtime Restart ready"
      : result.status === "blocked"
        ? "Local model runtime Restart blocked"
        : result.status === "not-found"
          ? "Local model runtime Restart target not found"
          : result.status === "unavailable"
            ? "Local model runtime Restart unavailable"
            : "Local model runtime Restart failed";
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
    result.entry ? affectedSubagentRestartText(result.entry) : undefined,
    result.restartResult?.previousPid !== undefined ? `Previous PID: ${result.restartResult.previousPid}.` : undefined,
    result.restartResult?.pid !== undefined ? `PID: ${result.restartResult.pid}.` : undefined,
    result.providerResult?.commandName ? `Provider command: ${result.providerResult.commandName}.` : undefined,
    result.providerResult?.stdoutArtifactPath ? `Provider stdout: ${result.providerResult.stdoutArtifactPath}.` : undefined,
    result.providerResult?.stderrArtifactPath ? `Provider stderr: ${result.providerResult.stderrArtifactPath}.` : undefined,
  ].filter(Boolean).join("\n");
}

function affectedSubagentRestartText(entry: LocalRuntimeInventoryEntry): string | undefined {
  const affected = entry.lifecycleDecision.restart.affectedSubagents;
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

function restartResultReason(result: RuntimeManagerRestartResult): string {
  if (result.status === "restarted") return "Managed local runtime process was stopped, relaunched, and its runtime state was refreshed.";
  if (result.status === "blocked") return result.reason ?? "Local runtime Restart was blocked.";
  if (result.status === "not-found") return result.reason ?? "No matching managed local runtime state was found.";
  if (result.status === "failed") return result.error ?? "Local runtime Restart failed.";
  return "Local runtime Restart did not complete.";
}

function providerLifecycleRestartReason(result: LocalRuntimeProviderLifecycleResult): string {
  if (result.status === "restarted") return result.reason ?? "Provider-declared local runtime Restart completed.";
  if (result.status === "blocked") return result.reason ?? "Provider-declared local runtime Restart was blocked.";
  if (result.status === "failed") return result.error ?? "Provider-declared local runtime Restart failed.";
  return result.reason ?? "Provider-declared local runtime Restart returned an unexpected status.";
}

function runtimeTargetId(entry: LocalRuntimeInventoryEntry): string {
  return entry.modelRuntimeId ?? entry.id;
}

function localRuntimeLifecycleMemoryPolicyBlockReason(
  policy: LocalModelResourcePolicyDecision | undefined,
  action: "Restart",
): string | undefined {
  if (!policy) return undefined;
  if (policy.outcome !== "refuse" && policy.outcome !== "ask-to-exceed" && policy.outcome !== "unload-idle") {
    return undefined;
  }
  return `Local runtime ${action} is blocked by local model memory policy: ${policy.reason}`;
}

function normalizeRuntimeId(value: string): string {
  return typeof value === "string" ? value.trim() : "";
}
