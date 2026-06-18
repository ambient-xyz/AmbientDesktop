import type {
  LocalModelResourceRegistryEntry,
  LocalModelResourceRegistrySnapshot,
  LocalRuntimeInventoryEntry,
  LocalRuntimeInventorySnapshot,
  LocalRuntimeAffectedSubagent,
  LocalRuntimeLifecycleActionDecision,
  LocalRuntimeLifecycleDecision,
  LocalRuntimeLeaseStateSummary,
  LocalRuntimeLeaseRecord,
  LocalRuntimeOwnerSummary,
  LocalRuntimePolicyHandoffActionKind,
  LocalRuntimePolicyHandoffBlockedAction,
  LocalRuntimePolicyHandoffMemoryEvidence,
  LocalRuntimePolicyHandoffNextSafeAction,
  LocalRuntimePolicyHandoffOwnershipResolution,
  LocalRuntimePolicyHandoffOwner,
  LocalRuntimePolicyHandoffRuntime,
  LocalRuntimePolicyHandoffSnapshot,
  LocalRuntimeStopDecision,
} from "../../shared/localRuntimeTypes";
import { localRuntimeLeaseMatchesResourceEntry } from "./localRuntimeLeaseMatching";

const activeLeaseStatuses = new Set<LocalRuntimeLeaseRecord["status"]>(["acquiring", "running", "idle", "releasing"]);

export const DEFAULT_LOCAL_RUNTIME_LEASE_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS = 4 * DEFAULT_LOCAL_RUNTIME_LEASE_HEARTBEAT_INTERVAL_MS;

export interface LocalRuntimeLeaseFreshnessOptions {
  now?: Date | string;
  staleMs?: number;
}

export interface BuildLocalRuntimeInventoryInput {
  registry: LocalModelResourceRegistrySnapshot;
  leases?: LocalRuntimeLeaseRecord[];
  capturedAt?: string;
  now?: () => Date;
  leaseStaleMs?: number;
}

export function buildLocalRuntimeInventory(input: BuildLocalRuntimeInventoryInput): LocalRuntimeInventorySnapshot {
  const leases = input.leases ?? [];
  const leaseFreshness = leaseFreshnessOptions(input);
  const activeLeases = leases.filter((lease) => isActiveLocalRuntimeLease(lease, leaseFreshness));
  const residentEntries = input.registry.entries.map((entry) => localRuntimeInventoryEntry(entry, leases, leaseFreshness));
  const leaseOnlyEntries = unmatchedActiveLeaseGroups(activeLeases, input.registry.entries)
    .map((leaseGroup) => leaseOnlyRuntimeInventoryEntry(leaseGroup, leaseFreshness));
  return {
    schemaVersion: "ambient-local-runtime-inventory-v1",
    capturedAt: input.capturedAt ?? input.registry.capturedAt,
    entries: [
      ...residentEntries,
      ...leaseOnlyEntries,
    ],
    activeLeases,
    memoryPolicy: input.registry.policyDecision,
  };
}

export function buildLocalRuntimePolicyHandoff(
  inventory: LocalRuntimeInventorySnapshot,
): LocalRuntimePolicyHandoffSnapshot {
  const runtimes = inventory.entries.map(localRuntimePolicyHandoffRuntime);
  const activeOwners = localRuntimePolicyHandoffOwners(inventory.entries);
  const blockedActions = inventory.entries.flatMap(localRuntimePolicyHandoffBlockedActions);
  const stopBlockers = blockedActions.filter((action) => action.action === "stop");
  const nextSafeActions = localRuntimePolicyHandoffNextSafeActions(inventory);
  return {
    schemaVersion: "ambient-local-runtime-policy-handoff-v1",
    capturedAt: inventory.capturedAt,
    runtimeCount: inventory.entries.length,
    runningCount: inventory.entries.filter((entry) => entry.running).length,
    activeLeaseCount: inventory.activeLeases.length,
    blockedActionCount: blockedActions.length,
    stopBlockedRuntimeIds: inventory.entries
      .filter((entry) => !entry.lifecycleDecision.stop.allowed)
      .map((entry) => entry.id),
    restartBlockedRuntimeIds: inventory.entries
      .filter((entry) => !entry.lifecycleDecision.restart.allowed)
      .map((entry) => entry.id),
    untrackedRuntimeIds: inventory.entries
      .filter((entry) => entry.trackingStatus === "untracked" || entry.lifecycleDecision.stop.untracked)
      .map((entry) => entry.id),
    ...(inventory.memoryPolicy ? { memoryPolicy: inventory.memoryPolicy } : {}),
    memoryEvidence: localRuntimePolicyHandoffMemoryEvidence(inventory),
    runtimes,
    activeOwners,
    blockedActions,
    stopBlockers,
    nextSafeActions,
  };
}

export function isActiveLocalRuntimeLease(
  lease: LocalRuntimeLeaseRecord,
  freshness: LocalRuntimeLeaseFreshnessOptions = {},
): boolean {
  if (!activeLeaseStatuses.has(lease.status)) return false;
  if (freshness.staleMs === undefined) return true;
  const staleMs = finitePositive(freshness.staleMs);
  if (staleMs === undefined) return true;
  const nowMs = freshnessNowMs(freshness.now);
  const heartbeatMs = Date.parse(lease.lastHeartbeatAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(heartbeatMs)) return false;
  return nowMs - heartbeatMs <= staleMs;
}

export function localRuntimeStopDecision(input: {
  capability?: LocalRuntimeInventoryEntry["capability"];
  trackingStatus: LocalRuntimeInventoryEntry["trackingStatus"];
  leases: LocalRuntimeLeaseRecord[];
  leaseFreshness?: LocalRuntimeLeaseFreshnessOptions;
  running?: boolean;
}): LocalRuntimeStopDecision {
  return stopDecisionFromLifecycle(localRuntimeLifecycleDecision({
    capability: input.capability,
    trackingStatus: input.trackingStatus,
    leases: input.leases,
    running: input.running ?? true,
    leaseFreshness: input.leaseFreshness,
  }));
}

export function localRuntimeLifecycleDecision(input: {
  capability?: LocalRuntimeInventoryEntry["capability"];
  trackingStatus: LocalRuntimeInventoryEntry["trackingStatus"];
  leases: LocalRuntimeLeaseRecord[];
  running: boolean;
  leaseFreshness?: LocalRuntimeLeaseFreshnessOptions;
  providerLifecycle?: LocalRuntimeInventoryEntry["providerLifecycle"];
}): LocalRuntimeLifecycleDecision {
  const capability = input.capability ?? "local-text";
  if (input.trackingStatus === "untracked") {
    return {
      schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
      stop: untrackedLifecycleActionDecision("stop"),
      restart: untrackedLifecycleActionDecision("restart"),
      load: untrackedLifecycleActionDecision("load"),
      unload: untrackedLifecycleActionDecision("unload"),
    };
  }
  const activeOwnerLeases = input.leases.filter((lease) => isActiveLocalRuntimeLease(lease, input.leaseFreshness));
  if (capability !== "local-text") {
    if (input.providerLifecycle) {
      return providerLifecycleDecision({
        capability,
        lifecycle: input.providerLifecycle,
        running: input.running,
        activeOwnerLeases,
      });
    }
    return unsupportedCapabilityLifecycleDecision(capability, activeOwnerLeases);
  }
  if (activeOwnerLeases.length > 0) {
    const ownerReason = activeLeaseOwnerBlockReason(activeOwnerLeases);
    const affectedSubagents = localRuntimeAffectedSubagents(activeOwnerLeases);
    const ownedRuntimeDecision = lifecycleActionDecision({
      allowed: false,
      reason: ownerReason,
      blockerLeaseIds: activeOwnerLeases.map((lease) => lease.leaseId),
      affectedSubagents,
      forceAllowed: affectedSubagents.length > 0,
      forceRequiresSubagentCancellation: affectedSubagents.length > 0,
      untracked: false,
    });
    const loadDecision = lifecycleActionDecision({
      allowed: false,
      reason: input.running
        ? activeLeaseAlreadyRunningReason(activeOwnerLeases)
        : ownerReason,
      blockerLeaseIds: activeOwnerLeases.map((lease) => lease.leaseId),
      affectedSubagents,
      forceAllowed: false,
      forceRequiresSubagentCancellation: affectedSubagents.length > 0,
      untracked: false,
    });
    return {
      schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
      stop: ownedRuntimeDecision,
      restart: ownedRuntimeDecision,
      load: loadDecision,
      unload: ownedRuntimeDecision,
    };
  }
  if (!input.running) {
    const alreadyStopped = lifecycleActionDecision({
      allowed: false,
      reason: "Runtime is already stopped.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    });
    return {
      schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
      stop: alreadyStopped,
      restart: lifecycleActionDecision({
        allowed: true,
        reason: "No active sub-agent local runtime lease blocks ordinary Restart.",
        blockerLeaseIds: [],
        affectedSubagents: [],
        forceAllowed: true,
        forceRequiresSubagentCancellation: false,
        untracked: false,
      }),
      load: lifecycleActionDecision({
        allowed: true,
        reason: "No active sub-agent local runtime lease blocks ordinary Load.",
        blockerLeaseIds: [],
        affectedSubagents: [],
        forceAllowed: false,
        forceRequiresSubagentCancellation: false,
        untracked: false,
      }),
      unload: alreadyStopped,
    };
  }
  return {
    schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
    stop: lifecycleActionDecision({
      allowed: true,
      reason: "No active sub-agent local runtime lease blocks ordinary Stop.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: true,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    }),
    restart: lifecycleActionDecision({
      allowed: true,
      reason: "No active sub-agent local runtime lease blocks ordinary Restart.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: true,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    }),
    load: lifecycleActionDecision({
      allowed: false,
      reason: "Runtime is already running.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    }),
    unload: lifecycleActionDecision({
      allowed: true,
      reason: "No active sub-agent local runtime lease blocks ordinary Unload.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: true,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    }),
  };
}

function localRuntimePolicyHandoffRuntime(entry: LocalRuntimeInventoryEntry): LocalRuntimePolicyHandoffRuntime {
  return {
    runtimeEntryId: entry.id,
    capability: entry.capability,
    trackingStatus: entry.trackingStatus,
    running: entry.running,
    ...(entry.providerId ? { providerId: entry.providerId } : {}),
    ...(entry.modelRuntimeId ? { modelRuntimeId: entry.modelRuntimeId } : {}),
    ...(entry.modelProfileId ? { modelProfileId: entry.modelProfileId } : {}),
    ...(entry.modelId ? { modelId: entry.modelId } : {}),
    ...(entry.pid !== undefined ? { pid: entry.pid } : {}),
    ...(entry.endpoint ? { endpoint: entry.endpoint } : {}),
    ...(entry.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: entry.estimatedResidentMemoryBytes } : {}),
    ...(entry.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: entry.actualResidentMemoryBytes } : {}),
    ...(entry.memorySampledAt ? { memorySampledAt: entry.memorySampledAt } : {}),
    activeLeaseIds: entry.leaseState.activeLeaseIds,
    staleLeaseIds: entry.leaseState.staleLeaseIds,
    releasedLeaseIds: entry.leaseState.releasedLeaseIds,
    crashedLeaseIds: entry.leaseState.crashedLeaseIds,
    ordinaryStopAllowed: entry.lifecycleDecision.stop.allowed,
    ordinaryRestartAllowed: entry.lifecycleDecision.restart.allowed,
    untracked: entry.trackingStatus === "untracked" || entry.lifecycleDecision.stop.untracked,
  };
}

function localRuntimePolicyHandoffOwners(
  entries: LocalRuntimeInventoryEntry[],
): LocalRuntimePolicyHandoffOwner[] {
  return entries.flatMap((entry) => entry.leases
    .filter((lease) => entry.leaseState.activeLeaseIds.includes(lease.leaseId))
    .map((lease) => ({
      runtimeEntryId: entry.id,
      leaseId: lease.leaseId,
      ...(lease.parentThreadId ? { parentThreadId: lease.parentThreadId } : {}),
      ...(lease.subagentThreadId ? { subagentThreadId: lease.subagentThreadId } : {}),
      ...(lease.subagentRunId ? { subagentRunId: lease.subagentRunId } : {}),
      displayName: leaseOwnerLabel(lease),
      status: lease.status,
      capabilityKind: lease.capabilityKind,
      ...(lease.providerId ? { providerId: lease.providerId } : {}),
      ...(lease.modelRuntimeId ? { modelRuntimeId: lease.modelRuntimeId } : {}),
      ...(lease.modelProfileId ? { modelProfileId: lease.modelProfileId } : {}),
      ...(lease.modelId ? { modelId: lease.modelId } : {}),
      ...(lease.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: lease.estimatedResidentMemoryBytes } : {}),
      ...(lease.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: lease.actualResidentMemoryBytes } : {}),
      ...(lease.pid !== undefined ? { pid: lease.pid } : {}),
      ...(lease.endpoint ? { endpoint: lease.endpoint } : {}),
      acquiredAt: lease.acquiredAt,
      lastHeartbeatAt: lease.lastHeartbeatAt,
    })));
}

function localRuntimePolicyHandoffBlockedActions(
  entry: LocalRuntimeInventoryEntry,
): LocalRuntimePolicyHandoffBlockedAction[] {
  const actions = [
    { action: "stop", decision: entry.lifecycleDecision.stop },
    { action: "restart", decision: entry.lifecycleDecision.restart },
    { action: "load", decision: entry.lifecycleDecision.load },
    { action: "unload", decision: entry.lifecycleDecision.unload },
  ] satisfies Array<{
    action: LocalRuntimePolicyHandoffActionKind;
    decision: LocalRuntimeLifecycleActionDecision;
  }>;
  return actions
    .filter(({ decision }) => !decision.allowed)
    .map(({ action, decision }) => ({
      runtimeEntryId: entry.id,
      action,
      reason: decision.reason,
      blockerLeaseIds: decision.blockerLeaseIds,
      affectedSubagents: decision.affectedSubagents,
      forceAllowed: decision.forceAllowed,
      forceRequiresSubagentCancellation: decision.forceRequiresSubagentCancellation,
      untracked: decision.untracked,
    }));
}

function localRuntimePolicyHandoffMemoryEvidence(
  inventory: LocalRuntimeInventorySnapshot,
): LocalRuntimePolicyHandoffMemoryEvidence {
  const activeMemoryEntries = inventory.entries.filter((entry) => entry.running || entry.leaseState.activeLeaseIds.length > 0);
  const activeEstimatedResidentMemoryBytesFromEntries = sumNumbers(activeMemoryEntries.map((entry) => entry.estimatedResidentMemoryBytes));
  const activeActualResidentMemoryBytesFromEntries = sumDefined(activeMemoryEntries.map((entry) => entry.actualResidentMemoryBytes));
  const activeEstimatedResidentMemoryBytes = activeEstimatedResidentMemoryBytesFromEntries > 0
    ? activeEstimatedResidentMemoryBytesFromEntries
    : inventory.memoryPolicy?.activeEstimatedResidentMemoryBytes ?? 0;
  const activeActualResidentMemoryBytes = activeActualResidentMemoryBytesFromEntries
    ?? inventory.memoryPolicy?.activeActualResidentMemoryBytes;
  const entryCountWithActualRss = inventory.entries.filter((entry) => entry.actualResidentMemoryBytes !== undefined).length;
  const entryCountWithOnlyEstimate = inventory.entries.filter((entry) =>
    entry.actualResidentMemoryBytes === undefined && entry.estimatedResidentMemoryBytes !== undefined
  ).length;
  const entryCountWithUnknownMemory = inventory.entries.filter((entry) =>
    entry.actualResidentMemoryBytes === undefined && entry.estimatedResidentMemoryBytes === undefined
  ).length;
  const uncertaintyReasons = uniqueStrings([
    ...(inventory.memoryPolicy?.uncertaintyReasons ?? []),
    entryCountWithOnlyEstimate > 0
      ? `${entryCountWithOnlyEstimate} local runtime${entryCountWithOnlyEstimate === 1 ? " uses" : "s use"} resident-memory estimates because RSS is not available.`
      : undefined,
    entryCountWithUnknownMemory > 0
      ? `${entryCountWithUnknownMemory} local runtime${entryCountWithUnknownMemory === 1 ? " has" : "s have"} no resident-memory estimate or RSS sample.`
      : undefined,
  ]);
  return {
    activeEstimatedResidentMemoryBytes,
    ...(activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes } : {}),
    ...(inventory.memoryPolicy?.activeResidentMemoryBasis ? { activeResidentMemoryBasis: inventory.memoryPolicy.activeResidentMemoryBasis } : {}),
    ...(inventory.memoryPolicy?.requestedEstimatedResidentMemoryBytes !== undefined ? { requestedEstimatedResidentMemoryBytes: inventory.memoryPolicy.requestedEstimatedResidentMemoryBytes } : {}),
    ...(inventory.memoryPolicy?.projectedEstimatedResidentMemoryBytes !== undefined ? { projectedEstimatedResidentMemoryBytes: inventory.memoryPolicy.projectedEstimatedResidentMemoryBytes } : {}),
    ...(inventory.memoryPolicy?.projectedResidentMemoryBytes !== undefined ? { projectedResidentMemoryBytes: inventory.memoryPolicy.projectedResidentMemoryBytes } : {}),
    ...(inventory.memoryPolicy?.projectedSystemMemoryUtilization !== undefined ? { projectedSystemMemoryUtilization: inventory.memoryPolicy.projectedSystemMemoryUtilization } : {}),
    ...(inventory.memoryPolicy?.projectedFreeMemoryBytes !== undefined ? { projectedFreeMemoryBytes: inventory.memoryPolicy.projectedFreeMemoryBytes } : {}),
    ...(inventory.memoryPolicy?.projectedFreeMemoryRatio !== undefined ? { projectedFreeMemoryRatio: inventory.memoryPolicy.projectedFreeMemoryRatio } : {}),
    uncertaintyReasons,
    entryCountWithActualRss,
    entryCountWithOnlyEstimate,
    entryCountWithUnknownMemory,
  };
}

function localRuntimePolicyHandoffNextSafeActions(
  inventory: LocalRuntimeInventorySnapshot,
): LocalRuntimePolicyHandoffNextSafeAction[] {
  const actions: LocalRuntimePolicyHandoffNextSafeAction[] = [];
  if (inventory.memoryPolicy && memoryPolicyNeedsReview(inventory.memoryPolicy.outcome)) {
    actions.push({
      action: "review-memory-policy",
      safety: inventory.memoryPolicy.outcome === "ask-to-exceed" ? "requires-approval" : "blocked",
      reason: inventory.memoryPolicy.reason,
    });
  }
  if (!inventory.entries.length) {
    actions.push({
      action: "inspect-status",
      safety: "safe",
      reason: "No local runtime rows are currently visible; re-check including stopped runtimes before planning lifecycle changes.",
      toolName: "ambient_local_model_runtime_status",
      toolParams: { includeStopped: true },
    });
    return actions;
  }
  for (const entry of inventory.entries) {
    actions.push(...localRuntimeEntryNextSafeActions(entry));
  }
  return dedupeNextSafeActions(actions);
}

function localRuntimeEntryNextSafeActions(
  entry: LocalRuntimeInventoryEntry,
): LocalRuntimePolicyHandoffNextSafeAction[] {
  const actions: LocalRuntimePolicyHandoffNextSafeAction[] = [];
  const runtimeId = entry.id;
  if (entry.trackingStatus === "untracked" || entry.lifecycleDecision.stop.untracked) {
    actions.push({
      action: "ask-user-to-stop-untracked",
      safety: "external",
      runtimeEntryId: entry.id,
      runtimeId,
      capability: entry.capability,
      reason: "This local runtime is untracked, so Ambient ordinary Stop/Restart/Start remain disabled. Ask the owner or user to stop it outside Ambient, then call ambient_local_model_runtime_status again.",
      untracked: true,
    });
    return actions;
  }
  const affectedSubagents = uniqueAffectedSubagents([
    ...entry.lifecycleDecision.stop.affectedSubagents,
    ...entry.lifecycleDecision.restart.affectedSubagents,
    ...entry.lifecycleDecision.load.affectedSubagents,
  ]);
  const blockerLeaseIds = uniqueStrings([
    ...entry.lifecycleDecision.stop.blockerLeaseIds,
    ...entry.lifecycleDecision.restart.blockerLeaseIds,
    ...entry.lifecycleDecision.load.blockerLeaseIds,
  ]);
  if (blockerLeaseIds.length > 0) {
    actions.push({
      action: "wait-for-owner",
      safety: "blocked",
      runtimeEntryId: entry.id,
      runtimeId,
      capability: entry.capability,
      reason: affectedSubagents.length > 0
        ? "Wait for the owning sub-agent lease to release this runtime before ordinary lifecycle changes. Forced Stop/Restart requires explicit cancellation or failure marking for affected sub-agents."
        : "Wait for the active local runtime lease to release, become stale, or be repaired before ordinary lifecycle changes. Forced Stop/Restart is unavailable because owner metadata is incomplete.",
      blockerLeaseIds,
      affectedSubagents,
    });
    actions.push(...localRuntimeEntryForceResolutionActions(entry));
  }
  if (entry.lifecycleDecision.stop.allowed && entry.running) {
    actions.push({
      action: "stop-runtime",
      safety: "requires-approval",
      runtimeEntryId: entry.id,
      runtimeId,
      capability: entry.capability,
      reason: "Ordinary Stop is available for this managed runtime; preview with dryRun before changing process state.",
      toolName: "ambient_local_model_runtime_stop",
      toolParams: { runtimeId, dryRun: true },
    });
  }
  if (entry.lifecycleDecision.restart.allowed) {
    actions.push({
      action: "restart-runtime",
      safety: "requires-approval",
      runtimeEntryId: entry.id,
      runtimeId,
      capability: entry.capability,
      reason: "Ordinary Restart is available for this managed runtime; preview with dryRun before changing process state.",
      toolName: "ambient_local_model_runtime_restart",
      toolParams: { runtimeId, dryRun: true },
    });
  }
  if (entry.lifecycleDecision.load.allowed && !entry.running) {
    actions.push({
      action: "start-runtime",
      safety: "requires-approval",
      runtimeEntryId: entry.id,
      runtimeId,
      capability: entry.capability,
      reason: "Ordinary Start is available for this stopped managed runtime; preview with dryRun before changing process state.",
      toolName: "ambient_local_model_runtime_start",
      toolParams: { runtimeId, dryRun: true },
    });
  }
  return actions;
}

function localRuntimeEntryForceResolutionActions(
  entry: LocalRuntimeInventoryEntry,
): LocalRuntimePolicyHandoffNextSafeAction[] {
  return [
    forceResolutionActionForDecision({
      entry,
      action: "stop",
      forceAction: "force-stop-runtime",
      toolName: "ambient_local_model_runtime_stop",
      decision: entry.lifecycleDecision.stop,
    }),
    forceResolutionActionForDecision({
      entry,
      action: "restart",
      forceAction: "force-restart-runtime",
      toolName: "ambient_local_model_runtime_restart",
      decision: entry.lifecycleDecision.restart,
    }),
  ].filter((action): action is LocalRuntimePolicyHandoffNextSafeAction => Boolean(action));
}

function forceResolutionActionForDecision(input: {
  entry: LocalRuntimeInventoryEntry;
  action: "stop" | "restart";
  forceAction: "force-stop-runtime" | "force-restart-runtime";
  toolName: "ambient_local_model_runtime_stop" | "ambient_local_model_runtime_restart";
  decision: LocalRuntimeLifecycleActionDecision;
}): LocalRuntimePolicyHandoffNextSafeAction | undefined {
  if (
    input.decision.allowed ||
    !input.decision.forceAllowed ||
    !input.decision.forceRequiresSubagentCancellation ||
    input.decision.affectedSubagents.length === 0 ||
    input.decision.untracked
  ) {
    return undefined;
  }
  const label = input.action === "stop" ? "Stop" : "Restart";
  const ownershipResolution = localRuntimeForceOwnershipResolution({
    lifecycleAction: input.action,
    reason: input.decision.reason,
    blockerLeaseIds: input.decision.blockerLeaseIds,
    affectedSubagents: input.decision.affectedSubagents,
  });
  return {
    action: input.forceAction,
    safety: "requires-approval",
    runtimeEntryId: input.entry.id,
    runtimeId: input.entry.id,
    capability: input.entry.capability,
    reason: `Forced ${label} is available only through Ambient's ownership resolver: cancel or mark affected sub-agents, refresh inventory, then run the forced lifecycle action. Do not kill the process directly.`,
    toolName: input.toolName,
    toolParams: {
      runtimeId: input.entry.id,
      dryRun: true,
      force: true,
    },
    blockerLeaseIds: input.decision.blockerLeaseIds,
    affectedSubagents: input.decision.affectedSubagents,
    ownershipResolution,
  };
}

function localRuntimeForceOwnershipResolution(input: {
  lifecycleAction: "stop" | "restart";
  reason: string;
  blockerLeaseIds: string[];
  affectedSubagents: LocalRuntimeAffectedSubagent[];
}): LocalRuntimePolicyHandoffOwnershipResolution {
  return {
    schemaVersion: "ambient-local-runtime-policy-handoff-ownership-resolution-v1",
    required: true,
    lifecycleAction: input.lifecycleAction,
    resolution: "cancel-or-mark-affected-subagents",
    requiresInventoryRefresh: true,
    reason: input.reason,
    blockerLeaseIds: input.blockerLeaseIds,
    affectedSubagents: input.affectedSubagents,
  };
}

function memoryPolicyNeedsReview(outcome: NonNullable<LocalRuntimeInventorySnapshot["memoryPolicy"]>["outcome"]): boolean {
  return outcome === "refuse" || outcome === "unload-idle" || outcome === "ask-to-exceed";
}

function dedupeNextSafeActions(
  actions: LocalRuntimePolicyHandoffNextSafeAction[],
): LocalRuntimePolicyHandoffNextSafeAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.action}:${action.runtimeEntryId ?? ""}:${action.runtimeId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function localRuntimeInventoryEntry(
  entry: LocalModelResourceRegistryEntry,
  leases: LocalRuntimeLeaseRecord[],
  leaseFreshness: LocalRuntimeLeaseFreshnessOptions,
): LocalRuntimeInventoryEntry {
  const entryLeases = leases.filter((lease) => localRuntimeLeaseMatchesResourceEntry(lease, entry));
  const activeEntryLeases = entryLeases.filter((lease) => isActiveLocalRuntimeLease(lease, leaseFreshness));
  const estimatedResidentMemoryBytes =
    entry.estimatedResidentMemoryBytes ?? sumDefined(activeEntryLeases.map((lease) => lease.estimatedResidentMemoryBytes));
  const actualResidentMemoryBytes =
    entry.actualResidentMemoryBytes ?? sumDefined(activeEntryLeases.map((lease) => lease.actualResidentMemoryBytes));
  const trackingStatus = entry.trackingStatus ?? "managed";
  const lifecycleDecision = localRuntimeLifecycleDecision({
    capability: entry.capability,
    trackingStatus,
    leases: entryLeases,
    running: entry.running,
    leaseFreshness,
    providerLifecycle: entry.providerLifecycle,
  });
  return {
    schemaVersion: "ambient-local-runtime-inventory-entry-v1",
    id: entry.id,
    capability: entry.capability,
    ...(entry.providerId ? { providerId: entry.providerId } : {}),
    modelRuntimeId: entry.runtimeId ?? entry.id,
    ...(entry.profileId ? { modelProfileId: entry.profileId } : {}),
    ...(entry.modelId ? { modelId: entry.modelId } : {}),
    trackingStatus,
    running: entry.running,
    pid: entry.pid,
    ...(entry.endpointUrl ? { endpoint: entry.endpointUrl } : {}),
    ...(estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes } : {}),
    ...(actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes } : {}),
    ...(entry.memorySampledAt ? { memorySampledAt: entry.memorySampledAt } : {}),
    owners: localRuntimeOwners(entry, entryLeases, leaseFreshness),
    leases: entryLeases,
    leaseState: localRuntimeLeaseStateSummary(entryLeases, leaseFreshness),
    lifecycleDecision,
    stopDecision: stopDecisionFromLifecycle(lifecycleDecision),
    ...(entry.providerLifecycle ? { providerLifecycle: entry.providerLifecycle } : {}),
    ...(entry.startedAt ? { startedAt: entry.startedAt } : {}),
    ...(entry.lastUsedAt ? { lastUsedAt: entry.lastUsedAt } : {}),
    ...(lastLeaseHeartbeat(entryLeases) ? { lastHeartbeatAt: lastLeaseHeartbeat(entryLeases) } : {}),
  };
}

function leaseOnlyRuntimeInventoryEntry(
  leases: LocalRuntimeLeaseRecord[],
  leaseFreshness: LocalRuntimeLeaseFreshnessOptions,
): LocalRuntimeInventoryEntry {
  const primary = leases[0];
  if (!primary) throw new Error("Cannot build a local runtime inventory row without a lease.");
  const estimatedResidentMemoryBytes = sumDefined(leases.map((lease) => lease.estimatedResidentMemoryBytes));
  const actualResidentMemoryBytes = sumDefined(leases.map((lease) => lease.actualResidentMemoryBytes));
  const running = leases.some((lease) => lease.status === "running" || lease.status === "idle" || lease.status === "releasing");
  const lifecycleDecision = localRuntimeLifecycleDecision({
    capability: primary.capabilityKind,
    trackingStatus: "tracked",
    leases,
    running,
    leaseFreshness,
  });
  return {
    schemaVersion: "ambient-local-runtime-inventory-entry-v1",
    id: leaseRuntimeInventoryId(primary),
    capability: primary.capabilityKind,
    ...(primary.providerId ? { providerId: primary.providerId } : {}),
    ...(primary.modelRuntimeId ? { modelRuntimeId: primary.modelRuntimeId } : {}),
    ...(primary.modelProfileId ? { modelProfileId: primary.modelProfileId } : {}),
    ...(primary.modelId ? { modelId: primary.modelId } : {}),
    trackingStatus: "tracked",
    running,
    ...(primary.pid !== undefined ? { pid: primary.pid } : {}),
    ...(primary.endpoint ? { endpoint: primary.endpoint } : {}),
    ...(estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes } : {}),
    ...(actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes } : {}),
    owners: localRuntimeLeaseOwners(leases, leaseFreshness),
    leases,
    leaseState: localRuntimeLeaseStateSummary(leases, leaseFreshness),
    lifecycleDecision,
    stopDecision: stopDecisionFromLifecycle(lifecycleDecision),
    ...(lastLeaseHeartbeat(leases) ? { lastHeartbeatAt: lastLeaseHeartbeat(leases) } : {}),
  };
}

function localRuntimeOwners(
  entry: LocalModelResourceRegistryEntry,
  leases: LocalRuntimeLeaseRecord[],
  leaseFreshness: LocalRuntimeLeaseFreshnessOptions,
): LocalRuntimeOwnerSummary[] {
  const leaseOwners = localRuntimeLeaseOwners(leases, leaseFreshness);
  if (leaseOwners.length > 0) return leaseOwners;
  if (!entry.ownerThreadId) return [];
  return [{
    leaseId: `owner:${entry.ownerThreadId}`,
    parentThreadId: entry.parentThreadId ?? entry.ownerThreadId,
    ...(entry.subagentThreadId ? { subagentThreadId: entry.subagentThreadId } : {}),
    displayName: entry.ownerDisplayName ?? `thread ${entry.ownerThreadId}`,
    status: "idle",
  }];
}

function localRuntimeLeaseOwners(
  leases: LocalRuntimeLeaseRecord[],
  leaseFreshness: LocalRuntimeLeaseFreshnessOptions,
): LocalRuntimeOwnerSummary[] {
  return leases.filter((lease) => isActiveLocalRuntimeLease(lease, leaseFreshness)).map((lease) => ({
    leaseId: lease.leaseId,
    ...(lease.parentThreadId ? { parentThreadId: lease.parentThreadId } : {}),
    ...(lease.subagentThreadId ? { subagentThreadId: lease.subagentThreadId } : {}),
    ...(lease.subagentRunId ? { subagentRunId: lease.subagentRunId } : {}),
    displayName: leaseOwnerLabel(lease),
    status: lease.status,
  }));
}

function localRuntimeLeaseStateSummary(
  leases: LocalRuntimeLeaseRecord[],
  leaseFreshness: LocalRuntimeLeaseFreshnessOptions,
): LocalRuntimeLeaseStateSummary {
  const activeLeaseIds = leases
    .filter((lease) => isActiveLocalRuntimeLease(lease, leaseFreshness))
    .map((lease) => lease.leaseId);
  const staleLeaseIds = leases
    .filter((lease) => isStaleLocalRuntimeLease(lease, leaseFreshness))
    .map((lease) => lease.leaseId);
  const releasedLeaseIds = leases
    .filter((lease) => lease.status === "released")
    .map((lease) => lease.leaseId);
  const crashedLeaseIds = leases
    .filter((lease) => lease.status === "crashed")
    .map((lease) => lease.leaseId);
  const inactiveLeaseIds = leases
    .filter((lease) => !activeLeaseIds.includes(lease.leaseId))
    .map((lease) => lease.leaseId);
  return {
    activeLeaseIds,
    staleLeaseIds,
    releasedLeaseIds,
    crashedLeaseIds,
    inactiveLeaseIds,
  };
}

function isStaleLocalRuntimeLease(
  lease: LocalRuntimeLeaseRecord,
  freshness: LocalRuntimeLeaseFreshnessOptions,
): boolean {
  if (!activeLeaseStatuses.has(lease.status)) return false;
  if (freshness.staleMs === undefined) return false;
  return !isActiveLocalRuntimeLease(lease, freshness);
}

function leaseFreshnessOptions(input: BuildLocalRuntimeInventoryInput): LocalRuntimeLeaseFreshnessOptions {
  return {
    ...(input.leaseStaleMs !== undefined ? { staleMs: input.leaseStaleMs } : {}),
    ...(input.now ? { now: input.now() } : input.capturedAt ? { now: input.capturedAt } : {}),
  };
}

function lifecycleActionDecision(input: LocalRuntimeLifecycleActionDecision): LocalRuntimeLifecycleActionDecision {
  return input;
}

function untrackedLifecycleActionDecision(action: "stop" | "restart" | "load" | "unload"): LocalRuntimeLifecycleActionDecision {
  return lifecycleActionDecision({
    allowed: false,
    reason: `This local model process is untracked, so Ambient cannot assume it is safe to ${action}.`,
    blockerLeaseIds: [],
    affectedSubagents: [],
    forceAllowed: false,
    forceRequiresSubagentCancellation: false,
    untracked: true,
  });
}

function unsupportedCapabilityLifecycleDecision(
  capability: LocalRuntimeInventoryEntry["capability"],
  activeSubagentLeases: LocalRuntimeLeaseRecord[] = [],
): LocalRuntimeLifecycleDecision {
  return {
    schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
    stop: unsupportedCapabilityLifecycleActionDecision(capability, "stop", activeSubagentLeases),
    restart: unsupportedCapabilityLifecycleActionDecision(capability, "restart", activeSubagentLeases),
    load: unsupportedCapabilityLifecycleActionDecision(capability, "load", activeSubagentLeases),
    unload: unsupportedCapabilityLifecycleActionDecision(capability, "unload", activeSubagentLeases),
  };
}

function providerLifecycleDecision(input: {
  capability: LocalRuntimeInventoryEntry["capability"];
  lifecycle: NonNullable<LocalRuntimeInventoryEntry["providerLifecycle"]>;
  running: boolean;
  activeOwnerLeases: LocalRuntimeLeaseRecord[];
}): LocalRuntimeLifecycleDecision {
  return {
    schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
    stop: providerLifecycleActionDecision({
      capability: input.capability,
      lifecycle: input.lifecycle,
      action: "stop",
      running: input.running,
      activeOwnerLeases: input.activeOwnerLeases,
    }),
    restart: providerLifecycleActionDecision({
      capability: input.capability,
      lifecycle: input.lifecycle,
      action: "restart",
      running: input.running,
      activeOwnerLeases: input.activeOwnerLeases,
    }),
    load: providerLifecycleActionDecision({
      capability: input.capability,
      lifecycle: input.lifecycle,
      action: "load",
      running: input.running,
      activeOwnerLeases: input.activeOwnerLeases,
    }),
    unload: lifecycleActionDecision({
      allowed: false,
      reason: `${capabilityLifecycleLabel(input.capability)} runtimes do not expose a provider-declared Unload command; use Stop for non-destructive shutdown when available.`,
      blockerLeaseIds: input.activeOwnerLeases.map((lease) => lease.leaseId),
      affectedSubagents: localRuntimeAffectedSubagents(input.activeOwnerLeases),
      forceAllowed: false,
      forceRequiresSubagentCancellation: localRuntimeAffectedSubagents(input.activeOwnerLeases).length > 0,
      untracked: false,
    }),
  };
}

function providerLifecycleActionDecision(input: {
  capability: LocalRuntimeInventoryEntry["capability"];
  lifecycle: NonNullable<LocalRuntimeInventoryEntry["providerLifecycle"]>;
  action: "stop" | "restart" | "load";
  running: boolean;
  activeOwnerLeases: LocalRuntimeLeaseRecord[];
}): LocalRuntimeLifecycleActionDecision {
  const blockerLeaseIds = input.activeOwnerLeases.map((lease) => lease.leaseId);
  const affectedSubagents = localRuntimeAffectedSubagents(input.activeOwnerLeases);
  const providerAction = input.action === "load" ? input.lifecycle.start : input.lifecycle[input.action];
  if (!providerAction) {
    const ownerReason = input.activeOwnerLeases.length > 0 ? `${activeLeaseOwnerBlockReason(input.activeOwnerLeases)} ` : "";
    return lifecycleActionDecision({
      allowed: false,
      reason: `${ownerReason}${unsupportedCapabilityLifecycleReason(input.capability, input.action)}`,
      blockerLeaseIds,
      affectedSubagents,
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    });
  }
  if (input.activeOwnerLeases.length > 0) {
    return lifecycleActionDecision({
      allowed: false,
      reason: `${activeLeaseOwnerBlockReason(input.activeOwnerLeases)} Provider-declared ${actionLabel(input.action)} is blocked until the ${owningLeaseLabel(input.activeOwnerLeases)} releases this runtime.`,
      blockerLeaseIds,
      affectedSubagents,
      forceAllowed: input.action !== "load",
      forceRequiresSubagentCancellation: affectedSubagents.length > 0,
      untracked: false,
    });
  }
  if (input.action === "stop" && !input.running) {
    return lifecycleActionDecision({
      allowed: false,
      reason: "Runtime is already stopped.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    });
  }
  if (input.action === "load" && input.running) {
    return lifecycleActionDecision({
      allowed: false,
      reason: "Runtime is already running.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    });
  }
  return lifecycleActionDecision({
    allowed: true,
    reason: `${capabilityLifecycleLabel(input.capability)} runtime has provider-declared ${actionLabel(input.action)} command "${providerAction.command}".`,
    blockerLeaseIds: [],
    affectedSubagents: [],
    forceAllowed: false,
    forceRequiresSubagentCancellation: false,
    untracked: false,
  });
}

function unsupportedCapabilityLifecycleActionDecision(
  capability: LocalRuntimeInventoryEntry["capability"],
  action: "stop" | "restart" | "load" | "unload",
  activeOwnerLeases: LocalRuntimeLeaseRecord[] = [],
): LocalRuntimeLifecycleActionDecision {
  const affectedSubagents = localRuntimeAffectedSubagents(activeOwnerLeases);
  const ownerReason = activeOwnerLeases.length ? `${activeLeaseOwnerBlockReason(activeOwnerLeases)} ` : "";
  return lifecycleActionDecision({
    allowed: false,
    reason: `${ownerReason}${unsupportedCapabilityLifecycleReason(capability, action)}`,
    blockerLeaseIds: activeOwnerLeases.map((lease) => lease.leaseId),
    affectedSubagents,
    forceAllowed: false,
    forceRequiresSubagentCancellation: affectedSubagents.length > 0,
    untracked: false,
  });
}

function capabilityLifecycleLabel(capability: LocalRuntimeInventoryEntry["capability"]): string {
  if (capability === "voice") return "Voice";
  if (capability === "embeddings") return "Embedding";
  if (capability === "minicpm-v") return "MiniCPM-V";
  if (capability === "local-deep-research") return "Local Deep Research";
  return "Local model";
}

function unsupportedCapabilityLifecycleReason(
  capability: LocalRuntimeInventoryEntry["capability"],
  action: "stop" | "restart" | "load" | "unload",
): string {
  if (capability === "voice") {
    return `Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic ${actionLabel(action)} path for this row.`;
  }
  if (capability === "minicpm-v") {
    return `MiniCPM-V runtimes use the MiniCPM provider controls; Ambient has no safe generic ${actionLabel(action)} path for this row.`;
  }
  if (capability === "local-deep-research") {
    return `Local Deep Research runtimes are lease-managed by setup and run actions; Ambient has no safe generic ${actionLabel(action)} path for this row.`;
  }
  if (capability === "embeddings") {
    return `Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic ${actionLabel(action)} path for this row.`;
  }
  return `Ambient has no safe generic ${actionLabel(action)} path for this local runtime row.`;
}

function actionLabel(action: "stop" | "restart" | "load" | "unload"): string {
  if (action === "load") return "Start";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function stopDecisionFromLifecycle(lifecycle: LocalRuntimeLifecycleDecision): LocalRuntimeStopDecision {
  return {
    ordinaryStopAllowed: lifecycle.stop.allowed,
    reason: lifecycle.stop.reason,
    blockerLeaseIds: lifecycle.stop.blockerLeaseIds,
    affectedSubagents: lifecycle.stop.affectedSubagents,
    forceTerminationAllowed: lifecycle.stop.forceAllowed,
    forceRequiresSubagentCancellation: lifecycle.stop.forceRequiresSubagentCancellation,
    untracked: lifecycle.stop.untracked,
  };
}

function unmatchedActiveLeaseGroups(
  leases: LocalRuntimeLeaseRecord[],
  entries: LocalModelResourceRegistryEntry[],
): LocalRuntimeLeaseRecord[][] {
  const groups = new Map<string, LocalRuntimeLeaseRecord[]>();
  for (const lease of leases) {
    if (entries.some((entry) => localRuntimeLeaseMatchesResourceEntry(lease, entry))) continue;
    const key = leaseRuntimeKey(lease);
    const group = groups.get(key);
    if (group) {
      group.push(lease);
    } else {
      groups.set(key, [lease]);
    }
  }
  return [...groups.values()];
}

function leaseRuntimeInventoryId(lease: LocalRuntimeLeaseRecord): string {
  if (lease.modelRuntimeId) return `${lease.capabilityKind}:${lease.modelRuntimeId}:lease`;
  if (lease.pid !== undefined) return `${lease.capabilityKind}:pid:${lease.pid}:lease`;
  if (lease.endpoint) return `${lease.capabilityKind}:endpoint:${lease.endpoint}:lease`;
  if (lease.modelProfileId) return `${lease.capabilityKind}:${lease.modelProfileId}:lease`;
  if (lease.modelId) return `${lease.capabilityKind}:${lease.modelId}:lease`;
  return `${lease.capabilityKind}:lease:${lease.leaseId}`;
}

function leaseRuntimeKey(lease: LocalRuntimeLeaseRecord): string {
  if (lease.modelRuntimeId) return `runtime:${lease.capabilityKind}:${lease.modelRuntimeId}`;
  if (lease.pid !== undefined) return `pid:${lease.pid}`;
  if (lease.endpoint) return `endpoint:${lease.endpoint}`;
  if (lease.modelProfileId) return `profile:${lease.capabilityKind}:${lease.modelProfileId}`;
  if (lease.modelId) return `model:${lease.capabilityKind}:${lease.modelId}`;
  return `lease:${lease.leaseId}`;
}

function leaseOwnerLabel(lease: LocalRuntimeLeaseRecord): string {
  if (lease.ownerDisplayName?.trim()) {
    return lease.subagentThreadId?.trim()
      ? `sub-agent ${lease.ownerDisplayName.trim()}`
      : lease.ownerDisplayName.trim();
  }
  if (lease.subagentThreadId) return `sub-agent ${lease.subagentThreadId}`;
  if (lease.parentThreadId) return `thread ${lease.parentThreadId}`;
  return `lease ${lease.leaseId}`;
}

function activeLeaseOwnerReason(leases: LocalRuntimeLeaseRecord[]): string {
  return `In use by ${leases.map(leaseOwnerLabel).join(", ")}.`;
}

function activeLeaseOwnerBlockReason(leases: LocalRuntimeLeaseRecord[]): string {
  const incompleteLeaseIds = leases
    .filter((lease) => !lease.subagentThreadId?.trim())
    .map((lease) => lease.leaseId);
  if (!incompleteLeaseIds.length) return activeLeaseOwnerReason(leases);
  return `${activeLeaseOwnerReason(leases)} ${leaseListLabel(incompleteLeaseIds)} missing sub-agent thread metadata, so Ambient cannot safely force-cancel the owner.`;
}

function activeLeaseAlreadyRunningReason(leases: LocalRuntimeLeaseRecord[]): string {
  return leases.every((lease) => Boolean(lease.subagentThreadId?.trim()))
    ? "Runtime is already running and owned by an active sub-agent lease."
    : "Runtime is already running and owned by an active local runtime lease.";
}

function owningLeaseLabel(leases: LocalRuntimeLeaseRecord[]): string {
  return leases.every((lease) => Boolean(lease.subagentThreadId?.trim()))
    ? "owning sub-agent"
    : "owning lease";
}

function localRuntimeAffectedSubagents(leases: LocalRuntimeLeaseRecord[]): LocalRuntimeAffectedSubagent[] {
  return leases.flatMap((lease) => {
    const subagentThreadId = lease.subagentThreadId?.trim();
    if (!subagentThreadId) return [];
    return [{
      leaseId: lease.leaseId,
      ...(lease.parentThreadId ? { parentThreadId: lease.parentThreadId } : {}),
      subagentThreadId,
      ...(lease.subagentRunId ? { subagentRunId: lease.subagentRunId } : {}),
      displayName: leaseOwnerLabel(lease),
      status: lease.status,
      ...(lease.modelRuntimeId ? { modelRuntimeId: lease.modelRuntimeId } : {}),
      ...(lease.modelProfileId ? { modelProfileId: lease.modelProfileId } : {}),
      ...(lease.modelId ? { modelId: lease.modelId } : {}),
      ...(lease.providerId ? { providerId: lease.providerId } : {}),
      capabilityKind: lease.capabilityKind,
    }];
  });
}

function leaseListLabel(leaseIds: string[]): string {
  const label = leaseIds.length === 1 ? "Lease" : "Leases";
  return `${label} ${leaseIds.join(", ")} ${leaseIds.length === 1 ? "is" : "are"}`;
}

function lastLeaseHeartbeat(leases: LocalRuntimeLeaseRecord[]): string | undefined {
  const heartbeats = leases
    .map((lease) => lease.lastHeartbeatAt)
    .filter((value) => typeof value === "string" && value.trim())
    .sort();
  return heartbeats[heartbeats.length - 1];
}

function freshnessNowMs(now: Date | string | undefined): number {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "string") return Date.parse(now);
  return Date.now();
}

function finitePositive(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  let sum = 0;
  let found = false;
  for (const value of values) {
    if (value === undefined) continue;
    found = true;
    sum += Math.max(0, value);
  }
  return found ? sum : undefined;
}

function sumNumbers(values: Array<number | undefined>): number {
  let sum = 0;
  for (const value of values) {
    sum += Math.max(0, value ?? 0);
  }
  return sum;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function uniqueAffectedSubagents(
  affected: LocalRuntimeAffectedSubagent[],
): LocalRuntimeAffectedSubagent[] {
  const seen = new Set<string>();
  return affected.filter((subagent) => {
    const key = `${subagent.leaseId}:${subagent.subagentThreadId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
