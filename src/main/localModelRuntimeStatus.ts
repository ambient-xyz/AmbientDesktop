import { resolve } from "node:path";
import type {
  EmbeddingProviderCandidate,
  LocalModelHostMemorySnapshot,
  LocalModelResourceRegistrySnapshot,
  LocalModelResourceRequestedLaunch,
  LocalModelResourceSettings,
  LocalRuntimeInventoryEntry,
  LocalRuntimeInventorySnapshot,
  LocalRuntimeLeaseRecord,
  LocalRuntimePolicyHandoffSnapshot,
  LocalRuntimePolicyHandoffNextSafeAction,
  VoiceProviderCandidate,
} from "../shared/types";
import {
  detectLocalLlamaResidentProcesses,
  type DetectLocalLlamaResidentProcessesInput,
  type LocalLlamaResidentProcess,
} from "./localLlamaResidencyPolicy";
import {
  buildLocalModelResourceRegistry,
  embeddingProviderRuntimeRegistryEntries,
  voiceProviderRuntimeRegistryEntries,
} from "./localModelResourceRegistry";
import {
  buildLocalRuntimeInventory,
  buildLocalRuntimePolicyHandoff,
} from "./localRuntimeInventory";
import {
  localModelRuntimeStaleLeaseRecoverySummary,
  mergeLocalModelRuntimeLeaseRecoverySummaries,
  readRepairedLocalModelRuntimeLeaseJournalsWithRecovery,
  type LocalModelRuntimeLeaseRecoverySummary,
} from "./localModelRuntimeManager";

const localTextRuntimeRoot = ".ambient/local-model-runtime";

export interface LocalModelRuntimeStatusInput {
  workspacePath: string;
  settings?: LocalModelResourceSettings;
  residentProcesses?: LocalLlamaResidentProcess[];
  requestedLaunch?: LocalModelResourceRequestedLaunch;
  hostMemory?: LocalModelHostMemorySnapshot;
  leases?: LocalRuntimeLeaseRecord[];
  voiceProviders?: VoiceProviderCandidate[];
  embeddingProviders?: EmbeddingProviderCandidate[];
  additionalEntries?: LocalModelResourceRegistrySnapshot["entries"];
  includeStopped?: boolean;
  residentDetection?: DetectLocalLlamaResidentProcessesInput;
  leaseStaleMs?: number;
  now?: () => Date;
}

export interface LocalModelRuntimeStatusSnapshot {
  schemaVersion: "ambient-local-model-runtime-status-v1";
  capturedAt: string;
  registry: LocalModelResourceRegistrySnapshot;
  inventory: LocalRuntimeInventorySnapshot;
  policyHandoff: LocalRuntimePolicyHandoffSnapshot;
  leaseRecovery: LocalModelRuntimeLeaseRecoverySummary;
  summary: {
    runtimeCount: number;
    runningCount: number;
    activeLeaseCount: number;
    leaseRecoveryIssueCount: number;
    repairedLeaseCount: number;
    stopBlockedCount: number;
    restartBlockedCount: number;
    untrackedCount: number;
    staleLeaseCount: number;
    releasedLeaseCount: number;
    crashedLeaseCount: number;
    activeEstimatedResidentMemoryBytes: number;
    activeActualResidentMemoryBytes?: number;
    memoryPolicyOutcome: string;
    memoryPolicyReason: string;
  };
}

export async function buildLocalModelRuntimeStatusSnapshot(
  input: LocalModelRuntimeStatusInput,
): Promise<LocalModelRuntimeStatusSnapshot> {
  const localTextStateRootPath = resolve(input.residentDetection?.localTextStateRootPath ?? resolve(input.workspacePath, localTextRuntimeRoot));
  const observedAt = (input.now ?? (() => new Date()))().toISOString();
  const residents = input.residentProcesses ?? await detectLocalLlamaResidentProcesses(input.workspacePath, {
    ...input.residentDetection,
    localTextStateRootPath,
    includeStopped: input.includeStopped,
  }).catch(() => []);
  const persistedLeaseResult = await readRepairedLocalModelRuntimeLeaseJournalsWithRecovery(localTextStateRootPath, {
    processAlive: input.residentDetection?.processAlive,
    now: () => new Date(observedAt),
    ...(input.leaseStaleMs !== undefined ? { staleMs: input.leaseStaleMs } : {}),
  }).catch(() => ({
    leases: [],
    recovery: mergeLocalModelRuntimeLeaseRecoverySummaries([], observedAt),
  }));
  const leases = mergeLocalRuntimeStatusLeases([
    ...(input.leases ?? []),
    ...persistedLeaseResult.leases,
  ]);
  const leaseRecovery = mergeLocalModelRuntimeLeaseRecoverySummaries([
    persistedLeaseResult.recovery,
    localModelRuntimeStaleLeaseRecoverySummary({
      leases,
      observedAt,
      staleMs: input.leaseStaleMs,
      source: "runtime_status",
    }),
  ], observedAt);
  const registry = await buildLocalModelResourceRegistry({
    workspacePath: input.workspacePath,
    settings: input.settings,
    residentProcesses: residents,
    additionalEntries: [
      ...voiceProviderRuntimeRegistryEntries(input.voiceProviders ?? []),
      ...embeddingProviderRuntimeRegistryEntries(input.embeddingProviders ?? []),
      ...(input.additionalEntries ?? []),
    ],
    requestedLaunch: input.requestedLaunch,
    hostMemory: input.hostMemory,
    leases,
    leaseStaleMs: input.leaseStaleMs,
    now: input.now,
  });
  const inventory = buildLocalRuntimeInventory({
    registry,
    leases,
    capturedAt: registry.capturedAt,
    leaseStaleMs: input.leaseStaleMs,
  });
  const policyHandoff = buildLocalRuntimePolicyHandoff(inventory);
  return {
    schemaVersion: "ambient-local-model-runtime-status-v1",
    capturedAt: registry.capturedAt,
    registry,
    inventory,
    policyHandoff,
    leaseRecovery,
    summary: {
      runtimeCount: inventory.entries.length,
      runningCount: inventory.entries.filter((entry) => entry.running).length,
      activeLeaseCount: inventory.activeLeases.length,
      leaseRecoveryIssueCount: leaseRecovery.issueCount,
      repairedLeaseCount: leaseRecovery.repairedLeaseIds.length,
      stopBlockedCount: inventory.entries.filter((entry) => !entry.lifecycleDecision.stop.allowed).length,
      restartBlockedCount: inventory.entries.filter((entry) => !entry.lifecycleDecision.restart.allowed).length,
      untrackedCount: inventory.entries.filter((entry) => entry.lifecycleDecision.stop.untracked).length,
      staleLeaseCount: uniqueLeaseCount(inventory.entries.flatMap((entry) => entry.leaseState.staleLeaseIds)),
      releasedLeaseCount: uniqueLeaseCount(inventory.entries.flatMap((entry) => entry.leaseState.releasedLeaseIds)),
      crashedLeaseCount: uniqueLeaseCount(inventory.entries.flatMap((entry) => entry.leaseState.crashedLeaseIds)),
      activeEstimatedResidentMemoryBytes: policyHandoff.memoryEvidence.activeEstimatedResidentMemoryBytes,
      ...(policyHandoff.memoryEvidence.activeActualResidentMemoryBytes !== undefined ? {
        activeActualResidentMemoryBytes: policyHandoff.memoryEvidence.activeActualResidentMemoryBytes,
      } : {}),
      memoryPolicyOutcome: registry.policyDecision.outcome,
      memoryPolicyReason: registry.policyDecision.reason,
    },
  };
}

export function localModelRuntimeStatusText(
  snapshot: LocalModelRuntimeStatusSnapshot,
  options: { limit?: number } = {},
): string {
  const limit = normalizeLimit(options.limit);
  const rows = snapshot.inventory.entries.slice(0, limit);
  const omitted = snapshot.inventory.entries.length - rows.length;
  return [
    localRuntimeSummaryLine(snapshot),
    localRuntimeLeaseRecoveryText(snapshot),
    `Memory policy: ${snapshot.summary.memoryPolicyOutcome} - ${snapshot.summary.memoryPolicyReason}`,
    `Resident memory: estimated ${formatBytes(snapshot.summary.activeEstimatedResidentMemoryBytes)}${snapshot.summary.activeActualResidentMemoryBytes !== undefined ? `; actual ${formatBytes(snapshot.summary.activeActualResidentMemoryBytes)}` : ""}.`,
    `Lifecycle blockers: stop ${snapshot.summary.stopBlockedCount}; restart ${snapshot.summary.restartBlockedCount}; untracked processes: ${snapshot.summary.untrackedCount}.`,
    localRuntimeNextSafeActionsText(snapshot),
    rows.length ? "Runtime rows:" : "Runtime rows: none.",
    ...rows.map((entry) => `- ${localRuntimeEntryText(entry)}`),
    omitted > 0 ? `- ${omitted} additional runtime${omitted === 1 ? "" : "s"} omitted from text; inspect details.inventory.entries for the full structured snapshot.` : "",
  ].filter(Boolean).join("\n");
}

function localRuntimeLeaseRecoveryText(snapshot: LocalModelRuntimeStatusSnapshot): string | undefined {
  if (!snapshot.leaseRecovery.issueCount) return undefined;
  const parts = [
    snapshot.leaseRecovery.repairedLeaseIds.length
      ? `${snapshot.leaseRecovery.repairedLeaseIds.length} repaired lease${snapshot.leaseRecovery.repairedLeaseIds.length === 1 ? "" : "s"}`
      : undefined,
    snapshot.leaseRecovery.staleLeaseIds.length
      ? `${snapshot.leaseRecovery.staleLeaseIds.length} stale lease${snapshot.leaseRecovery.staleLeaseIds.length === 1 ? "" : "s"} no longer blocking`
      : undefined,
    snapshot.leaseRecovery.crashedLeaseIds.length
      ? `${snapshot.leaseRecovery.crashedLeaseIds.length} crashed lease${snapshot.leaseRecovery.crashedLeaseIds.length === 1 ? "" : "s"}`
      : undefined,
  ].filter(Boolean);
  return `Lease recovery: ${parts.join("; ")}.`;
}

function localRuntimeNextSafeActionsText(snapshot: LocalModelRuntimeStatusSnapshot): string | undefined {
  const actions = snapshot.policyHandoff.nextSafeActions.slice(0, 12);
  if (!actions.length) return undefined;
  const omitted = snapshot.policyHandoff.nextSafeActions.length - actions.length;
  return [
    "Next safe actions:",
    ...actions.map((action) => `- ${localRuntimeNextSafeActionText(action)}`),
    omitted > 0 ? `- ${omitted} additional next action${omitted === 1 ? "" : "s"} omitted from text; inspect details.policyHandoff.nextSafeActions for the full list.` : undefined,
  ].filter(Boolean).join("\n");
}

function localRuntimeNextSafeActionText(action: LocalRuntimePolicyHandoffNextSafeAction): string {
  const target = action.runtimeEntryId ? ` for ${action.runtimeEntryId}` : "";
  const tool = action.toolName
    ? ` Tool: ${action.toolName}${action.toolParams ? ` ${JSON.stringify(action.toolParams)}` : ""}.`
    : "";
  const blockers = action.blockerLeaseIds?.length ? ` Blocker leases: ${action.blockerLeaseIds.join(", ")}.` : "";
  const affected = action.affectedSubagents?.length
    ? ` Affected sub-agents: ${action.affectedSubagents.map((subagent) =>
        `${subagent.displayName} (${affectedSubagentHandleLabel(subagent)})`
      ).join(", ")}.`
    : "";
  const ownershipResolution = action.ownershipResolution
    ? ` Ownership resolution: ${action.ownershipResolution.resolution}; refresh inventory before forcing ${action.ownershipResolution.lifecycleAction}.`
    : "";
  return `${action.safety} ${action.action}${target}: ${action.reason}${tool}${blockers}${affected}${ownershipResolution}`;
}

function localRuntimeEntryText(entry: LocalRuntimeInventoryEntry): string {
  return [
    entry.id,
    runtimeStatusLabel(entry),
    capabilityLabel(entry.capability),
    entry.modelId ? `model ${entry.modelId}` : undefined,
    entry.modelProfileId ? `profile ${entry.modelProfileId}` : undefined,
    entry.pid !== undefined ? `pid ${entry.pid}` : undefined,
    entry.endpoint ? `endpoint ${entry.endpoint}` : undefined,
    memoryLabel(entry),
    ownerLabel(entry),
    leaseStateLabel(entry),
    lifecycleActionLabel(entry),
    affectedSubagentLabel(entry),
    entry.lifecycleDecision.stop.allowed
      ? "ordinary Stop allowed"
      : `Stop disabled: ${entry.lifecycleDecision.stop.reason}`,
    entry.lifecycleDecision.restart.allowed
      ? "ordinary Restart allowed"
      : `Restart disabled: ${entry.lifecycleDecision.restart.reason}`,
    forceLifecycleStatusLabel(entry),
  ].filter(Boolean).join("; ");
}

function runtimeStatusLabel(entry: LocalRuntimeInventoryEntry): string {
  return `${entry.running ? "running" : "stopped"} ${entry.trackingStatus}`;
}

function capabilityLabel(capability: LocalRuntimeInventoryEntry["capability"]): string {
  if (capability === "local-deep-research") return "local deep research";
  if (capability === "minicpm-v") return "MiniCPM vision";
  if (capability === "voice") return "voice";
  if (capability === "embeddings") return "embeddings";
  return "local text";
}

function localRuntimeSummaryLine(snapshot: LocalModelRuntimeStatusSnapshot): string {
  const inactiveLeaseParts = [
    snapshot.summary.staleLeaseCount > 0 ? `${snapshot.summary.staleLeaseCount} stale lease${snapshot.summary.staleLeaseCount === 1 ? "" : "s"}` : undefined,
    snapshot.summary.releasedLeaseCount > 0 ? `${snapshot.summary.releasedLeaseCount} released lease${snapshot.summary.releasedLeaseCount === 1 ? "" : "s"}` : undefined,
    snapshot.summary.crashedLeaseCount > 0 ? `${snapshot.summary.crashedLeaseCount} crashed lease${snapshot.summary.crashedLeaseCount === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean);
  const inactiveSuffix = inactiveLeaseParts.length ? `; ${inactiveLeaseParts.join("; ")}` : "";
  return `Local model runtime status: ${snapshot.summary.runtimeCount} runtime${snapshot.summary.runtimeCount === 1 ? "" : "s"}; ${snapshot.summary.runningCount} running; ${snapshot.summary.activeLeaseCount} active lease${snapshot.summary.activeLeaseCount === 1 ? "" : "s"}${inactiveSuffix}.`;
}

function memoryLabel(entry: LocalRuntimeInventoryEntry): string | undefined {
  if (entry.actualResidentMemoryBytes !== undefined && entry.estimatedResidentMemoryBytes !== undefined) {
    return `memory actual ${formatBytes(entry.actualResidentMemoryBytes)} / estimate ${formatBytes(entry.estimatedResidentMemoryBytes)}`;
  }
  if (entry.actualResidentMemoryBytes !== undefined) return `memory actual ${formatBytes(entry.actualResidentMemoryBytes)}`;
  if (entry.estimatedResidentMemoryBytes !== undefined) return `memory estimate ${formatBytes(entry.estimatedResidentMemoryBytes)}`;
  return undefined;
}

function ownerLabel(entry: LocalRuntimeInventoryEntry): string {
  if (!entry.owners.length) return "owner none";
  return `owner ${entry.owners.map((owner) => owner.displayName).join(", ")}`;
}

function leaseStateLabel(entry: LocalRuntimeInventoryEntry): string | undefined {
  if (!entry.leases.length) return undefined;
  const parts = [
    entry.leaseState.activeLeaseIds.length > 0 ? `active ${entry.leaseState.activeLeaseIds.join(", ")}` : undefined,
    entry.leaseState.staleLeaseIds.length > 0 ? `stale ${entry.leaseState.staleLeaseIds.join(", ")}` : undefined,
    entry.leaseState.releasedLeaseIds.length > 0 ? `released ${entry.leaseState.releasedLeaseIds.join(", ")}` : undefined,
    entry.leaseState.crashedLeaseIds.length > 0 ? `crashed ${entry.leaseState.crashedLeaseIds.join(", ")}` : undefined,
  ].filter(Boolean);
  return parts.length ? `leases ${parts.join("; ")}` : undefined;
}

function lifecycleActionLabel(entry: LocalRuntimeInventoryEntry): string {
  const actionRows = [
    ["Stop", entry.lifecycleDecision.stop.allowed],
    ["Restart", entry.lifecycleDecision.restart.allowed],
    ["Start", entry.lifecycleDecision.load.allowed],
    ["Unload", entry.lifecycleDecision.unload.allowed],
  ] satisfies Array<[string, boolean]>;
  const actions = actionRows.map(([label, allowed]) => `${label} ${allowed ? "allowed" : "disabled"}`);
  return `actions ${actions.join(", ")}`;
}

function affectedSubagentLabel(entry: LocalRuntimeInventoryEntry): string | undefined {
  const affected = uniqueAffectedSubagents([
    ...entry.lifecycleDecision.stop.affectedSubagents,
    ...entry.lifecycleDecision.restart.affectedSubagents,
    ...entry.lifecycleDecision.load.affectedSubagents,
    ...entry.lifecycleDecision.unload.affectedSubagents,
  ]);
  if (!affected.length) return undefined;
  return `affected sub-agents ${affected.map((subagent) =>
    `${subagent.displayName} (${affectedSubagentHandleLabel(subagent)})`
  ).join(", ")}`;
}

function affectedSubagentHandleLabel(
  subagent: LocalRuntimeInventoryEntry["lifecycleDecision"]["stop"]["affectedSubagents"][number],
): string {
  if (!subagent.subagentRunId) return `${subagent.subagentThreadId}, lease ${subagent.leaseId}`;
  return `run ${subagent.subagentRunId}, thread ${subagent.subagentThreadId}, lease ${subagent.leaseId}`;
}

function forceLifecycleStatusLabel(entry: LocalRuntimeInventoryEntry): string | undefined {
  const actions = forceLifecycleActions(entry);
  const resolvingActions = actions
    .filter((action) => action.decision.forceAllowed && action.decision.forceRequiresSubagentCancellation)
    .map((action) => action.label);
  if (resolvingActions.length) return `forced ${joinActionLabels(resolvingActions)} requires sub-agent cancellation`;

  const unavailableOwnerActions = actions
    .filter((action) => !action.decision.forceAllowed && action.decision.forceRequiresSubagentCancellation)
    .map((action) => action.label);
  if (unavailableOwnerActions.length) {
    return `forced ${joinActionLabels(unavailableOwnerActions)} unavailable until the active sub-agent releases this runtime`;
  }
  return undefined;
}

function forceLifecycleActions(entry: LocalRuntimeInventoryEntry): Array<{
  label: "Stop" | "Restart";
  decision: LocalRuntimeInventoryEntry["lifecycleDecision"]["stop"];
}> {
  return [
    { label: "Stop", decision: entry.lifecycleDecision.stop },
    { label: "Restart", decision: entry.lifecycleDecision.restart },
  ];
}

function joinActionLabels(labels: string[]): string {
  return labels.join("/");
}

function uniqueAffectedSubagents(
  affected: LocalRuntimeInventoryEntry["lifecycleDecision"]["stop"]["affectedSubagents"],
): LocalRuntimeInventoryEntry["lifecycleDecision"]["stop"]["affectedSubagents"] {
  const seen = new Set<string>();
  return affected.filter((subagent) => {
    const key = `${subagent.leaseId}:${subagent.subagentThreadId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? NaN)) return 20;
  return Math.max(1, Math.min(50, Math.floor(limit as number)));
}

function uniqueLeaseCount(leaseIds: string[]): number {
  return new Set(leaseIds).size;
}

function mergeLocalRuntimeStatusLeases(leases: LocalRuntimeLeaseRecord[]): LocalRuntimeLeaseRecord[] {
  const byId = new Map<string, LocalRuntimeLeaseRecord>();
  for (const lease of leases) {
    if (!byId.has(lease.leaseId)) byId.set(lease.leaseId, lease);
  }
  return [...byId.values()];
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const mib = bytes / (1024 ** 2);
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(2)} GiB`;
}
