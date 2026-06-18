import type {
  LocalModelResourcePolicyDecision,
  LocalRuntimeInventoryEntry,
  LocalRuntimeInventorySnapshot,
} from "../../shared/localRuntimeTypes";
import {
  localRuntimeMemoryPolicyEvidenceText,
  localRuntimeResidentMemoryEvidenceText,
} from "./localModelRuntimeActionEvidence";
import type { LocalModelRuntimeStartResult as RuntimeManagerStartResult } from "./localModelRuntimeManager";
import type { LocalRuntimeProviderLifecycleResult } from "./localRuntimeProviderLifecycle";

export type LocalModelRuntimeStartStatus =
  | "ready"
  | "started"
  | "blocked"
  | "not-found"
  | "failed"
  | "unavailable";

export interface LocalModelRuntimeStartRequest {
  runtimeId: string;
  dryRun?: boolean;
}

export interface LocalModelRuntimeStartPlan {
  schemaVersion: "ambient-local-model-runtime-start-plan-v1";
  status: "ready" | "blocked" | "not-found";
  runtimeId: string;
  dryRun: boolean;
  reason: string;
  memoryPolicy?: LocalModelResourcePolicyDecision;
  entry?: LocalRuntimeInventoryEntry;
}

export interface LocalModelRuntimeStartToolResult {
  schemaVersion: "ambient-local-model-runtime-start-v1";
  status: LocalModelRuntimeStartStatus;
  runtimeId: string;
  dryRun: boolean;
  reason: string;
  memoryPolicy?: LocalModelResourcePolicyDecision;
  entry?: LocalRuntimeInventoryEntry;
  startResult?: RuntimeManagerStartResult;
  providerResult?: LocalRuntimeProviderLifecycleResult;
}

export function planLocalModelRuntimeStart(input: {
  inventory: LocalRuntimeInventorySnapshot;
  request: LocalModelRuntimeStartRequest;
}): LocalModelRuntimeStartPlan {
  const runtimeId = normalizeRuntimeId(input.request.runtimeId);
  const dryRun = input.request.dryRun === true;
  const memoryPolicy = input.inventory.memoryPolicy;
  const entry = findRuntimeInventoryEntry(input.inventory, runtimeId);
  if (!entry) {
    return {
      schemaVersion: "ambient-local-model-runtime-start-plan-v1",
      status: "not-found",
      runtimeId,
      dryRun,
      reason: `No local model runtime row matches "${runtimeId}". Call ambient_local_model_runtime_status with includeStopped=true for current ids before starting.`,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (entry.capability !== "local-text" && !entry.providerLifecycle) {
    return {
      schemaVersion: "ambient-local-model-runtime-start-plan-v1",
      status: "blocked",
      runtimeId,
      dryRun,
      entry,
      reason: entry.lifecycleDecision.load.reason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (entry.trackingStatus === "untracked") {
    return {
      schemaVersion: "ambient-local-model-runtime-start-plan-v1",
      status: "blocked",
      runtimeId,
      dryRun,
      entry,
      reason: entry.lifecycleDecision.load.reason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (!entry.lifecycleDecision.load.allowed) {
    return {
      schemaVersion: "ambient-local-model-runtime-start-plan-v1",
      status: "blocked",
      runtimeId,
      dryRun,
      entry,
      reason: entry.lifecycleDecision.load.reason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  if (!entry.modelRuntimeId && entry.capability === "local-text") {
    return {
      schemaVersion: "ambient-local-model-runtime-start-plan-v1",
      status: "blocked",
      runtimeId,
      dryRun,
      entry,
      reason: "The selected local runtime row has no modelRuntimeId, so Ambient cannot target it for managed Start.",
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  const memoryPolicyBlockReason = localRuntimeLifecycleMemoryPolicyBlockReason(memoryPolicy, "Start");
  if (memoryPolicyBlockReason) {
    return {
      schemaVersion: "ambient-local-model-runtime-start-plan-v1",
      status: "blocked",
      runtimeId,
      dryRun,
      entry,
      reason: memoryPolicyBlockReason,
      ...(memoryPolicy ? { memoryPolicy } : {}),
    };
  }
  return {
    schemaVersion: "ambient-local-model-runtime-start-plan-v1",
    status: "ready",
    runtimeId,
    dryRun,
    entry,
    ...(memoryPolicy ? { memoryPolicy } : {}),
    reason: dryRun
      ? `Local runtime ${runtimeTargetId(entry)} can be started; dryRun requested no process changes.`
      : `Local runtime ${runtimeTargetId(entry)} can be started by ordinary Start.`,
  };
}

export function localModelRuntimeStartToolResult(input: {
  plan: LocalModelRuntimeStartPlan;
  startResult?: RuntimeManagerStartResult;
  providerResult?: LocalRuntimeProviderLifecycleResult;
}): LocalModelRuntimeStartToolResult {
  if (input.plan.status !== "ready") {
    return {
      schemaVersion: "ambient-local-model-runtime-start-v1",
      status: input.plan.status,
      runtimeId: input.plan.runtimeId,
      dryRun: input.plan.dryRun,
      reason: input.plan.reason,
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
    };
  }
  if (input.plan.dryRun) {
    return {
      schemaVersion: "ambient-local-model-runtime-start-v1",
      status: "ready",
      runtimeId: input.plan.runtimeId,
      dryRun: true,
      reason: input.plan.reason,
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
    };
  }
  if (!input.startResult && !input.providerResult) {
    return {
      schemaVersion: "ambient-local-model-runtime-start-v1",
      status: "unavailable",
      runtimeId: input.plan.runtimeId,
      dryRun: false,
      reason: "Local model runtime Start is not available in this Ambient runtime.",
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
    };
  }
  if (input.providerResult) {
    return {
      schemaVersion: "ambient-local-model-runtime-start-v1",
      status: input.providerResult.status as LocalModelRuntimeStartStatus,
      runtimeId: input.plan.runtimeId,
      dryRun: false,
      reason: providerLifecycleStartReason(input.providerResult),
      ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
      ...(input.plan.entry ? { entry: input.plan.entry } : {}),
      providerResult: input.providerResult,
    };
  }
  if (!input.startResult) throw new Error("Start result unexpectedly missing.");
  const reason = startResultReason(input.startResult);
  return {
    schemaVersion: "ambient-local-model-runtime-start-v1",
    status: input.startResult.status,
    runtimeId: input.plan.runtimeId,
    dryRun: false,
    reason,
    ...(input.plan.memoryPolicy ? { memoryPolicy: input.plan.memoryPolicy } : {}),
    ...(input.plan.entry ? { entry: input.plan.entry } : {}),
    startResult: input.startResult,
  };
}

export function localModelRuntimeStartText(result: LocalModelRuntimeStartToolResult): string {
  const prefix = result.status === "started"
    ? "Local model runtime started"
    : result.status === "ready"
      ? "Local model runtime Start ready"
      : result.status === "blocked"
        ? "Local model runtime Start blocked"
        : result.status === "not-found"
          ? "Local model runtime Start target not found"
          : result.status === "unavailable"
            ? "Local model runtime Start unavailable"
            : "Local model runtime Start failed";
  return [
    `${prefix}: ${result.runtimeId}.`,
    result.reason,
    result.entry ? `Tracking: ${result.entry.trackingStatus}; running: ${result.entry.running ? "yes" : "no"}.` : undefined,
    localRuntimeResidentMemoryEvidenceText(result.entry),
    localRuntimeMemoryPolicyEvidenceText(result.memoryPolicy),
    result.entry?.owners.length
      ? `Owners: ${result.entry.owners.map((owner) => owner.displayName).join(", ")}.`
      : undefined,
    result.startResult?.previousPid !== undefined ? `Previous PID: ${result.startResult.previousPid}.` : undefined,
    result.startResult?.pid !== undefined ? `PID: ${result.startResult.pid}.` : undefined,
    result.providerResult?.commandName ? `Provider command: ${result.providerResult.commandName}.` : undefined,
    result.providerResult?.stdoutArtifactPath ? `Provider stdout: ${result.providerResult.stdoutArtifactPath}.` : undefined,
    result.providerResult?.stderrArtifactPath ? `Provider stderr: ${result.providerResult.stderrArtifactPath}.` : undefined,
  ].filter(Boolean).join("\n");
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

function startResultReason(result: RuntimeManagerStartResult): string {
  if (result.status === "started") return "Managed local runtime process was launched from persisted runtime state.";
  if (result.status === "blocked") return result.reason ?? "Local runtime Start was blocked.";
  if (result.status === "not-found") return result.reason ?? "No matching managed local runtime state was found.";
  if (result.status === "failed") return result.error ?? "Local runtime Start failed.";
  return "Local runtime Start did not complete.";
}

function providerLifecycleStartReason(result: LocalRuntimeProviderLifecycleResult): string {
  if (result.status === "started") return result.reason ?? "Provider-declared local runtime Start completed.";
  if (result.status === "blocked") return result.reason ?? "Provider-declared local runtime Start was blocked.";
  if (result.status === "failed") return result.error ?? "Provider-declared local runtime Start failed.";
  return result.reason ?? "Provider-declared local runtime Start returned an unexpected status.";
}

function runtimeTargetId(entry: LocalRuntimeInventoryEntry): string {
  return entry.modelRuntimeId ?? entry.id;
}

function localRuntimeLifecycleMemoryPolicyBlockReason(
  policy: LocalModelResourcePolicyDecision | undefined,
  action: "Start",
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
