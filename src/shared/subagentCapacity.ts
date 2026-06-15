import type { AmbientModelProviderId, AmbientModelRuntimeProfile } from "./ambientModels";
import type { SubagentRunStatus } from "./subagentProtocol";

export type SubagentCapacityLeaseStatus = "reserved" | "blocked" | "released";
export type SubagentCapacityLocalMemoryOutcome =
  | "not_applicable"
  | "unknown"
  | "unlimited"
  | "within-limit"
  | "warn"
  | "refuse"
  | "ask-to-exceed"
  | "unload-idle"
  | "unloaded-idle";

export interface SubagentCapacityLocalMemorySnapshot {
  outcome: SubagentCapacityLocalMemoryOutcome;
  allowed: boolean;
  reason: string;
  requestedEstimatedResidentMemoryBytes?: number;
  activeEstimatedResidentMemoryBytes?: number;
  activeActualResidentMemoryBytes?: number;
  activeResidentMemoryBasis?: "actual-rss" | "estimated" | "mixed" | "none";
  projectedEstimatedResidentMemoryBytes?: number;
  projectedResidentMemoryBytes?: number;
  projectedSystemMemoryUtilization?: number;
  maxProjectedMemoryUtilization?: number;
  projectedFreeMemoryBytes?: number;
  projectedFreeMemoryRatio?: number;
  minFreeMemoryRatioAfterLaunch?: number;
  comfortableFreeMemoryRatio?: number;
  maxResidentMemoryBytes?: number;
  exceededByBytes?: number;
  uncertaintyReasons?: string[];
  localRuntimeReservation?: SubagentCapacityLocalRuntimeReservationSnapshot;
  localRuntimeLeaseIds?: string[];
  unloadCandidateIds?: string[];
}

export interface SubagentCapacityLocalRuntimeReservationSnapshot {
  schemaVersion: "ambient-subagent-local-runtime-reservation-v1";
  status: "requested";
  runtimeId: string;
  requestedLaunchId: string;
  capabilityKind: string;
  providerId: AmbientModelProviderId;
  modelId: string;
  modelProfileId?: string;
  parentThreadId: string;
  ownerThreadId?: string;
  canonicalTaskPath: string;
  idempotencyKey: string;
  endpoint?: string;
  stateRootPath?: string;
  contextTokens?: number;
  estimatedResidentMemoryBytes?: number;
  memoryEstimateSource: "launch_descriptor" | "model_profile" | "unknown";
}

export interface SubagentCapacityProviderProfileSnapshot {
  schemaVersion: "ambient-subagent-capacity-model-profile-v1";
  profileId: string;
  label: string;
  available: boolean;
  selectableAsSubagent: boolean;
  supportsStreaming: boolean;
  toolUse: AmbientModelRuntimeProfile["toolUse"];
  structuredOutput: AmbientModelRuntimeProfile["structuredOutput"];
  supportsVision: boolean;
  supportsAudio: boolean;
  costClass: AmbientModelRuntimeProfile["costClass"];
  trustClass: AmbientModelRuntimeProfile["trustClass"];
  privacyLabel: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  memoryClass?: AmbientModelRuntimeProfile["memoryClass"];
  estimatedResidentMemoryBytes?: number;
}

export interface SubagentCapacityLeaseSnapshot {
  schemaVersion: "ambient-subagent-capacity-lease-v1";
  leaseId: string;
  status: SubagentCapacityLeaseStatus;
  resolvedAt: string;
  releasedAt?: string;
  releaseReason?: string;
  canonicalTaskPath: string;
  roleId: string;
  parentThreadId: string;
  parentRunId: string;
  childRunId?: string;
  childThreadId?: string;
  depth: {
    depth: number;
    maxDepth: number;
    allowed: boolean;
    reason: string;
  };
  provider: {
    providerId: AmbientModelProviderId;
    modelId: string;
    locality: AmbientModelRuntimeProfile["locality"];
    profile: SubagentCapacityProviderProfileSnapshot;
    openRunCount: number;
    projectedOpenRunCount: number;
    concurrencyLimit?: number;
    allowed: boolean;
    reason: string;
  };
  localMemory: SubagentCapacityLocalMemorySnapshot;
  blockingReasons: string[];
}

export interface SubagentCapacityExistingRun {
  id: string;
  status: SubagentRunStatus;
  closedAt?: string;
  modelRuntimeSnapshot?: {
    profile?: {
      profileId?: string;
      providerId?: AmbientModelProviderId;
      modelId?: string;
    };
  };
}

export interface ResolveSubagentCapacityLeaseInput {
  parentThreadId: string;
  parentRunId: string;
  canonicalTaskPath: string;
  roleId: string;
  model: AmbientModelRuntimeProfile;
  existingRuns?: SubagentCapacityExistingRun[];
  providerConcurrencyLimit?: number;
  maxDepth?: number;
  localMemory?: SubagentCapacityLocalMemorySnapshot;
  now?: string;
  leaseId?: string;
}

export function resolveSubagentCapacityLease(input: ResolveSubagentCapacityLeaseInput): SubagentCapacityLeaseSnapshot {
  const now = input.now ?? new Date().toISOString();
  const depth = capacityDepth(input.canonicalTaskPath);
  const maxDepth = input.maxDepth ?? 1;
  const depthAllowed = depth <= maxDepth;
  const providerOpenRunCount = openProviderRunCount(input.existingRuns ?? [], input.model.providerId);
  const projectedOpenRunCount = providerOpenRunCount + 1;
  const providerLimit = normalizePositiveInteger(input.providerConcurrencyLimit);
  const providerAllowed = providerLimit === undefined || projectedOpenRunCount <= providerLimit;
  const localMemory = input.localMemory ?? defaultLocalMemorySnapshot(input.model);
  const blockingReasons = [
    depthAllowed ? undefined : `Sub-agent depth ${depth} exceeds maximum depth ${maxDepth}.`,
    providerAllowed ? undefined : `Provider ${input.model.providerId} would exceed its sub-agent concurrency limit (${projectedOpenRunCount}/${providerLimit}).`,
    localMemory.allowed ? undefined : localMemory.reason,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    schemaVersion: "ambient-subagent-capacity-lease-v1",
    leaseId: input.leaseId ?? defaultCapacityLeaseId({
      parentRunId: input.parentRunId,
      canonicalTaskPath: input.canonicalTaskPath,
      providerId: input.model.providerId,
      modelId: input.model.modelId,
    }),
    status: blockingReasons.length ? "blocked" : "reserved",
    resolvedAt: now,
    canonicalTaskPath: input.canonicalTaskPath,
    roleId: input.roleId,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    depth: {
      depth,
      maxDepth,
      allowed: depthAllowed,
      reason: depthAllowed
        ? `Sub-agent depth ${depth} is within the configured maximum depth ${maxDepth}.`
        : `Sub-agent depth ${depth} exceeds the configured maximum depth ${maxDepth}.`,
    },
    provider: {
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      locality: input.model.locality,
      profile: subagentCapacityProviderProfileSnapshot(input.model),
      openRunCount: providerOpenRunCount,
      projectedOpenRunCount,
      ...(providerLimit !== undefined ? { concurrencyLimit: providerLimit } : {}),
      allowed: providerAllowed,
      reason: providerLimit === undefined
        ? "No provider sub-agent concurrency ceiling is configured; recording an open-run reservation."
        : providerAllowed
        ? `Projected provider sub-agent count ${projectedOpenRunCount} is within the configured limit ${providerLimit}.`
        : `Projected provider sub-agent count ${projectedOpenRunCount} exceeds the configured limit ${providerLimit}.`,
    },
    localMemory,
    blockingReasons,
  };
}

export function materializeSubagentCapacityLeaseForRun(
  lease: SubagentCapacityLeaseSnapshot,
  input: {
    childRunId: string;
    childThreadId: string;
    canonicalTaskPath: string;
    parentThreadId: string;
    parentRunId: string;
    roleId: string;
  },
): SubagentCapacityLeaseSnapshot {
  return {
    ...lease,
    canonicalTaskPath: input.canonicalTaskPath,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    roleId: input.roleId,
    childRunId: input.childRunId,
    childThreadId: input.childThreadId,
  };
}

export function releaseSubagentCapacityLease(
  lease: SubagentCapacityLeaseSnapshot,
  input: { releasedAt: string; reason: string },
): SubagentCapacityLeaseSnapshot {
  if (lease.status === "released" && lease.releasedAt) return lease;
  return {
    ...lease,
    status: "released",
    releasedAt: input.releasedAt,
    releaseReason: input.reason,
  };
}

export function fallbackSubagentCapacityLease(input: {
  parentThreadId: string;
  parentRunId: string;
  canonicalTaskPath: string;
  roleId: string;
  model: AmbientModelRuntimeProfile;
  now?: string;
}): SubagentCapacityLeaseSnapshot {
  return resolveSubagentCapacityLease({
    ...input,
    now: input.now,
    localMemory: defaultLocalMemorySnapshot(input.model),
  });
}

export function isSubagentCapacityLeaseSnapshot(value: unknown): value is SubagentCapacityLeaseSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === "ambient-subagent-capacity-lease-v1" &&
    typeof record.leaseId === "string" &&
    typeof record.status === "string" &&
    typeof record.canonicalTaskPath === "string" &&
    typeof record.parentThreadId === "string" &&
    typeof record.parentRunId === "string" &&
    typeof record.roleId === "string" &&
    Array.isArray(record.blockingReasons);
}

export function subagentCapacityProviderProfileSnapshot(
  model: AmbientModelRuntimeProfile,
): SubagentCapacityProviderProfileSnapshot {
  return {
    schemaVersion: "ambient-subagent-capacity-model-profile-v1",
    profileId: model.profileId,
    label: model.label,
    available: model.available,
    selectableAsSubagent: model.selectableAsSubagent,
    supportsStreaming: model.supportsStreaming,
    toolUse: model.toolUse,
    structuredOutput: model.structuredOutput,
    supportsVision: model.supportsVision,
    supportsAudio: model.supportsAudio,
    costClass: model.costClass,
    trustClass: model.trustClass,
    privacyLabel: model.privacyLabel,
    ...(model.contextWindowTokens !== undefined ? { contextWindowTokens: model.contextWindowTokens } : {}),
    ...(model.maxOutputTokens !== undefined ? { maxOutputTokens: model.maxOutputTokens } : {}),
    ...(model.memoryClass !== undefined ? { memoryClass: model.memoryClass } : {}),
    ...(model.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: model.estimatedResidentMemoryBytes } : {}),
  };
}

function defaultLocalMemorySnapshot(model: AmbientModelRuntimeProfile): SubagentCapacityLocalMemorySnapshot {
  if (model.locality !== "local") {
    return {
      outcome: "not_applicable",
      allowed: true,
      reason: "Cloud sub-agent models do not reserve local resident memory.",
    };
  }
  const requestedEstimatedResidentMemoryBytes = model.estimatedResidentMemoryBytes;
  return {
    outcome: "unknown",
    allowed: true,
    reason: requestedEstimatedResidentMemoryBytes === undefined
      ? "No local-model resident-memory estimate is registered; the local runtime must still pass launch preflight before execution."
      : "No local-model resource registry snapshot was provided; the local runtime must still pass launch preflight before execution.",
    ...(requestedEstimatedResidentMemoryBytes !== undefined ? {
      requestedEstimatedResidentMemoryBytes,
      projectedEstimatedResidentMemoryBytes: requestedEstimatedResidentMemoryBytes,
    } : {}),
  };
}

function openProviderRunCount(runs: SubagentCapacityExistingRun[], providerId: AmbientModelProviderId): number {
  return runs.filter((run) => {
    if (run.closedAt) return false;
    return run.modelRuntimeSnapshot?.profile?.providerId === providerId;
  }).length;
}

function capacityDepth(canonicalTaskPath: string): number {
  const segments = canonicalTaskPath.split("/").map((segment) => segment.trim()).filter(Boolean);
  return Math.max(0, segments.length - 1);
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;
  const integer = Math.floor(value);
  return integer > 0 ? integer : undefined;
}

function defaultCapacityLeaseId(input: {
  parentRunId: string;
  canonicalTaskPath: string;
  providerId: AmbientModelProviderId;
  modelId: string;
}): string {
  const raw = `${input.parentRunId}:${input.canonicalTaskPath}:${input.providerId}:${input.modelId}`;
  return `subagent-capacity:${raw.replace(/[^a-zA-Z0-9._:-]+/g, "-")}`;
}
