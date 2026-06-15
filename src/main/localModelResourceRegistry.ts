import { freemem, totalmem } from "node:os";
import type {
  EmbeddingProviderCandidate,
  LocalModelResourcePolicyDecision,
  LocalModelResourceRegistryEntry,
  LocalModelResourceRegistrySnapshot,
  LocalModelResourceRequestedLaunch,
  LocalModelResourceSettings,
  LocalModelHostMemorySnapshot,
  LocalRuntimeLeaseRecord,
  VoiceProviderCandidate,
} from "../shared/types";
import { resolveLocalRuntimeMemoryPolicy } from "../shared/localRuntimeMemoryPolicy";
import { localDeepResearchProfileById } from "./localDeepResearchModelProfiles";
import {
  detectLocalLlamaResidentProcesses,
  type DetectLocalLlamaResidentProcessesInput,
  type LocalLlamaResidentProcess,
} from "./localLlamaResidencyPolicy";
import { normalizeLocalModelResourceSettings } from "./localDeepResearchProviderStack";
import {
  isActiveLocalRuntimeLease,
  type LocalRuntimeLeaseFreshnessOptions,
} from "./localRuntimeInventory";
import { localRuntimeActiveLeaseIdsForResourceEntry } from "./localRuntimeLeaseMatching";

export type LocalModelRequestedLaunch = LocalModelResourceRequestedLaunch;

export interface SampleLocalModelHostMemorySnapshotInput {
  now?: () => Date;
  totalMemoryBytes?: number;
  freeMemoryBytes?: number;
  availableMemoryBytes?: number;
}

export interface BuildLocalModelResourceRegistryInput {
  workspacePath: string;
  settings?: LocalModelResourceSettings;
  residentProcesses?: LocalLlamaResidentProcess[];
  additionalEntries?: LocalModelResourceRegistryEntry[];
  residentDetection?: DetectLocalLlamaResidentProcessesInput;
  requestedLaunch?: LocalModelRequestedLaunch;
  hostMemory?: LocalModelHostMemorySnapshot;
  leases?: LocalRuntimeLeaseRecord[];
  leaseStaleMs?: number;
  now?: () => Date;
}

export interface LocalModelResourceUnloadResult {
  attemptedIds: string[];
  stoppedIds: string[];
  failed: Array<{
    id: string;
    pid?: number;
    error: string;
  }>;
}

export interface LocalModelResourceLaunchPreflightResult {
  allowed: boolean;
  outcome: LocalModelResourcePolicyDecision["outcome"] | "unloaded-idle";
  reason: string;
  registry: LocalModelResourceRegistrySnapshot;
  unload?: LocalModelResourceUnloadResult;
}

export interface LocalModelResourcePolicySnapshotValidation {
  schemaVersion: "ambient-local-model-resource-policy-validation-v1";
  valid: boolean;
  errors: string[];
}

export interface EnforceLocalModelResourceLaunchPolicyInput {
  registry: LocalModelResourceRegistrySnapshot;
  approveExceed?: (decision: LocalModelResourcePolicyDecision) => Promise<boolean> | boolean;
  killProcess?: (pid: number, signal?: NodeJS.Signals) => void;
}

export async function buildLocalModelResourceRegistry(
  input: BuildLocalModelResourceRegistryInput,
): Promise<LocalModelResourceRegistrySnapshot> {
  const now = input.now ?? (() => new Date());
  const capturedAt = now().toISOString();
  const settings = normalizeLocalModelResourceSettings(input.settings);
  const residents = input.residentProcesses ?? await detectLocalLlamaResidentProcesses(input.workspacePath, input.residentDetection).catch(() => []);
  const activeLeases = activeLocalModelResourceLeases(input.leases, localModelResourceLeaseFreshness(input, capturedAt));
  const entries = localModelResourceEntriesWithActiveLeases([
    ...residents.map((resident) => localModelResourceEntry(resident, now)),
    ...normalizeAdditionalEntries(input.additionalEntries ?? []),
  ], activeLeases);
  const activeEntries = entries.filter((entry) => entry.running);
  const activeEstimatedResidentMemoryBytes = sumDefined(activeEntries.map((entry) => entry.estimatedResidentMemoryBytes)) ?? 0;
  const activeActualResidentMemoryBytes = sumDefined(activeEntries.map((entry) => entry.actualResidentMemoryBytes));
  return {
    schemaVersion: "ambient-local-model-resource-registry-v1",
    capturedAt,
    settings,
    entries,
    ...(input.requestedLaunch ? { requestedLaunch: input.requestedLaunch } : {}),
    ...(input.hostMemory ? { hostMemory: input.hostMemory } : {}),
    activeCount: activeEntries.length,
    activeEstimatedResidentMemoryBytes,
    ...(activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes } : {}),
    policyDecision: localModelResourcePolicyDecision({
      settings,
      entries: activeEntries,
      activeEstimatedResidentMemoryBytes,
      activeActualResidentMemoryBytes,
      requestedLaunch: input.requestedLaunch,
      hostMemory: input.hostMemory,
      leases: activeLeases,
    }),
  };
}

export function sampleLocalModelHostMemorySnapshot(
  input: SampleLocalModelHostMemorySnapshotInput = {},
): LocalModelHostMemorySnapshot {
  const totalMemoryBytes = positiveMemoryBytes(input.totalMemoryBytes) ?? Math.max(1, Math.floor(totalmem()));
  const freeMemoryBytes = clampMemoryBytes(input.freeMemoryBytes ?? freemem(), totalMemoryBytes);
  const availableMemoryBytes = clampMemoryBytes(input.availableMemoryBytes ?? freeMemoryBytes, totalMemoryBytes);
  return {
    schemaVersion: "ambient-local-model-host-memory-v1",
    sampledAt: (input.now ?? (() => new Date()))().toISOString(),
    totalMemoryBytes,
    freeMemoryBytes,
    availableMemoryBytes,
  };
}

export function localModelResourcePolicyDecision(input: {
  settings?: LocalModelResourceSettings;
  entries?: LocalModelResourceRegistryEntry[];
  activeEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  requestedLaunch?: LocalModelRequestedLaunch;
  hostMemory?: LocalModelHostMemorySnapshot;
  leases?: LocalRuntimeLeaseRecord[];
  leaseFreshness?: LocalRuntimeLeaseFreshnessOptions;
}): LocalModelResourcePolicyDecision {
  const entries = input.entries ?? [];
  const activeLeases = activeLocalModelResourceLeases(input.leases, input.leaseFreshness);
  const unloadCandidateIds = idleUnloadCandidates(entries, activeLeases);
  const activeEstimatedResidentMemoryBytesWithoutActual = input.activeActualResidentMemoryBytes !== undefined
    ? sumDefined(entries
      .filter((entry) => entry.running && entry.actualResidentMemoryBytes === undefined)
      .map((entry) => entry.estimatedResidentMemoryBytes))
    : undefined;
  return resolveLocalRuntimeMemoryPolicy({
    settings: normalizeLocalModelResourceSettings(input.settings),
    hostMemory: input.hostMemory,
    requestedEstimatedResidentMemoryBytes: input.requestedLaunch?.estimatedResidentMemoryBytes,
    activeEstimatedResidentMemoryBytes: input.activeEstimatedResidentMemoryBytes,
    activeActualResidentMemoryBytes: input.activeActualResidentMemoryBytes,
    activeEstimatedResidentMemoryBytesWithoutActual,
    unloadCandidateIds,
  });
}

function localModelResourceEntry(resident: LocalLlamaResidentProcess, now: () => Date): LocalModelResourceRegistryEntry {
  return {
    capability: resident.capability,
    id: resident.id,
    pid: resident.pid,
    running: resident.running,
    statePath: resident.statePath,
    ...(resident.providerId ? { providerId: resident.providerId } : {}),
    ...(resident.runtimeId ? { runtimeId: resident.runtimeId } : {}),
    ...(resident.trackingStatus ? { trackingStatus: resident.trackingStatus } : {}),
    ...(resident.ownerThreadId ? { ownerThreadId: resident.ownerThreadId } : {}),
    ...(resident.parentThreadId ? { parentThreadId: resident.parentThreadId } : {}),
    ...(resident.subagentThreadId ? { subagentThreadId: resident.subagentThreadId } : {}),
    ...(resident.ownerDisplayName ? { ownerDisplayName: resident.ownerDisplayName } : {}),
    ...(resident.activeLeaseIds ? { activeLeaseIds: resident.activeLeaseIds } : {}),
    ...(resident.endpointUrl ? { endpointUrl: resident.endpointUrl } : {}),
    ...(resident.port !== undefined ? { port: resident.port } : {}),
    ...(resident.modelId ? { modelId: resident.modelId } : {}),
    ...(resident.profileId ? { profileId: resident.profileId } : {}),
    ...(resident.profileId ? localDeepResearchQuantizationForProfile(resident.profileId) : {}),
    ...(resident.contextTokens ? { contextTokens: resident.contextTokens } : {}),
    ...(resident.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: resident.estimatedResidentMemoryBytes } : {}),
    ...(resident.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: resident.actualResidentMemoryBytes } : {}),
    ...(resident.memorySampledAt ? { memorySampledAt: resident.memorySampledAt } : {}),
    ...(resident.startedAt ? { startedAt: resident.startedAt } : {}),
    ...(resident.lastUsedAt ? { lastUsedAt: resident.lastUsedAt, idleTimeMs: idleTimeMs(resident.lastUsedAt, now()) } : {}),
    ...(resident.logPath ? { logPath: resident.logPath } : {}),
    ...(resident.stderrPath ? { stderrPath: resident.stderrPath } : {}),
  };
}

function normalizeAdditionalEntries(entries: LocalModelResourceRegistryEntry[]): LocalModelResourceRegistryEntry[] {
  return entries
    .filter((entry) => entry.id.trim())
    .map((entry) => {
      const normalized: LocalModelResourceRegistryEntry = { ...entry, id: entry.id.trim() };
      trimOptionalStringField(normalized, "providerId");
      trimOptionalStringField(normalized, "runtimeId");
      trimOptionalStringField(normalized, "profileId");
      trimOptionalStringField(normalized, "modelId");
      trimOptionalStringField(normalized, "statePath");
      trimOptionalStringField(normalized, "endpointUrl");
      return normalized;
    });
}

function trimOptionalStringField(
  record: LocalModelResourceRegistryEntry,
  key: "providerId" | "runtimeId" | "profileId" | "modelId" | "statePath" | "endpointUrl",
): void {
  const value = record[key];
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) {
    record[key] = trimmed;
  } else {
    delete record[key];
  }
}

function localDeepResearchQuantizationForProfile(profileId: string): Pick<LocalModelResourceRegistryEntry, "quantization"> {
  try {
    return { quantization: localDeepResearchProfileById(profileId as never).quantization };
  } catch {
    return {};
  }
}

export function localDeepResearchRequestedLaunch(input: {
  id?: string;
  ownerThreadId?: string;
  modelId?: string;
  profileId: string;
  contextTokens?: number;
  estimatedResidentMemoryBytes?: number;
}): LocalModelRequestedLaunch {
  return {
    capability: "local-deep-research",
    id: input.id ?? `local-deep-research:${input.profileId}:requested`,
    ...(input.ownerThreadId ? { ownerThreadId: input.ownerThreadId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    profileId: input.profileId,
    ...(input.contextTokens ? { contextTokens: input.contextTokens } : {}),
    ...(input.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.estimatedResidentMemoryBytes } : {}),
  };
}

export function localTextRequestedLaunch(input: {
  id?: string;
  ownerThreadId?: string;
  modelId: string;
  profileId?: string;
  contextTokens?: number;
  estimatedResidentMemoryBytes?: number;
}): LocalModelRequestedLaunch {
  return {
    capability: "local-text",
    id: input.id ?? `local-text:${input.profileId ?? input.modelId}:requested`,
    ...(input.ownerThreadId ? { ownerThreadId: input.ownerThreadId } : {}),
    modelId: input.modelId,
    ...(input.profileId ? { profileId: input.profileId } : {}),
    ...(input.contextTokens ? { contextTokens: input.contextTokens } : {}),
    ...(input.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.estimatedResidentMemoryBytes } : {}),
  };
}

export function voiceProviderRuntimeRegistryEntries(
  providers: VoiceProviderCandidate[],
): LocalModelResourceRegistryEntry[] {
  return providers.flatMap((provider) => {
    const runtime = provider.diagnostics?.runtimeState;
    if (!runtime) return [];
    const runtimeId = runtime.modelRuntimeId ?? provider.providerId;
    return [{
      capability: "voice",
      id: `voice:${runtimeId}`,
      running: runtime.running,
      providerId: provider.providerId,
      runtimeId,
      trackingStatus: runtime.trackingStatus ?? "managed",
      ...(runtime.pid !== undefined ? { pid: runtime.pid } : {}),
      ...(runtime.endpoint ? { endpointUrl: runtime.endpoint, port: portFromEndpoint(runtime.endpoint) } : {}),
      ...(runtime.modelId ? { modelId: runtime.modelId } : {}),
      ...(runtime.modelProfileId ? { profileId: runtime.modelProfileId } : {}),
      ...(runtime.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: runtime.estimatedResidentMemoryBytes } : {}),
      ...(runtime.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: runtime.actualResidentMemoryBytes } : {}),
      ...(runtime.memorySampledAt ? { memorySampledAt: runtime.memorySampledAt } : {}),
      ...(runtime.startedAt ? { startedAt: runtime.startedAt } : {}),
      ...(runtime.lastUsedAt ? { lastUsedAt: runtime.lastUsedAt } : {}),
      ...(runtime.statePath ? { statePath: runtime.statePath } : {}),
      ...(runtime.providerLifecycle ?? provider.providerLifecycle ? { providerLifecycle: runtime.providerLifecycle ?? provider.providerLifecycle } : {}),
    }];
  });
}

export function embeddingProviderRuntimeRegistryEntries(
  providers: EmbeddingProviderCandidate[],
): LocalModelResourceRegistryEntry[] {
  return providers.flatMap((provider) => {
    const runtime = provider.diagnostics?.runtimeState;
    if (!runtime) return [];
    const runtimeId = runtime.modelRuntimeId ?? provider.providerId;
    return [{
      capability: "embeddings",
      id: `embeddings:${runtimeId}`,
      running: runtime.running,
      providerId: provider.providerId,
      runtimeId,
      trackingStatus: runtime.trackingStatus ?? "managed",
      ...(runtime.pid !== undefined ? { pid: runtime.pid } : {}),
      ...(runtime.endpoint ? { endpointUrl: runtime.endpoint, port: portFromEndpoint(runtime.endpoint) } : {}),
      ...(runtime.modelId ?? provider.modelId ? { modelId: runtime.modelId ?? provider.modelId } : {}),
      ...(runtime.modelProfileId ? { profileId: runtime.modelProfileId } : {}),
      ...(runtime.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: runtime.estimatedResidentMemoryBytes } : {}),
      ...(runtime.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: runtime.actualResidentMemoryBytes } : {}),
      ...(runtime.memorySampledAt ? { memorySampledAt: runtime.memorySampledAt } : {}),
      ...(runtime.startedAt ? { startedAt: runtime.startedAt } : {}),
      ...(runtime.lastUsedAt ? { lastUsedAt: runtime.lastUsedAt } : {}),
      ...(runtime.statePath ? { statePath: runtime.statePath } : {}),
      ...(runtime.providerLifecycle ?? provider.providerLifecycle ? { providerLifecycle: runtime.providerLifecycle ?? provider.providerLifecycle } : {}),
    }];
  });
}

export function validateLocalModelResourcePolicySnapshot(
  registry: LocalModelResourceRegistrySnapshot,
): LocalModelResourcePolicySnapshotValidation {
  const errors: string[] = [];
  const settings = normalizeLocalModelResourceSettings(registry.settings);
  const decision = registry.policyDecision;
  const activeEntries = registry.entries.filter((entry) => entry.running);
  const activeEntryEstimate = sumDefined(activeEntries.map((entry) => entry.estimatedResidentMemoryBytes)) ?? 0;
  const activeEntryActual = sumDefined(activeEntries.map((entry) => entry.actualResidentMemoryBytes));
  const validationRequestedLaunch = registry.requestedLaunch ?? requestedLaunchFromPolicyDecision(decision, activeEntries);
  const requestedEstimatedResidentMemoryBytes = validationRequestedLaunch?.estimatedResidentMemoryBytes;
  const expectedDecision = localModelResourcePolicyDecision({
    settings,
    entries: activeEntries,
    activeEstimatedResidentMemoryBytes: registry.activeEstimatedResidentMemoryBytes,
    activeActualResidentMemoryBytes: registry.activeActualResidentMemoryBytes,
    requestedLaunch: validationRequestedLaunch,
    hostMemory: registry.hostMemory,
  });

  if (registry.schemaVersion !== "ambient-local-model-resource-registry-v1") {
    errors.push("registry schemaVersion is not ambient-local-model-resource-registry-v1");
  }
  if (registry.settings.schemaVersion !== "ambient-local-model-resource-settings-v1") {
    errors.push("settings schemaVersion is not ambient-local-model-resource-settings-v1");
  }
  if (registry.requestedLaunch) {
    validateRequestedLaunch(errors, registry.requestedLaunch);
  }
  if (registry.hostMemory) {
    validateHostMemory(errors, registry.hostMemory);
  }
  if (!isFiniteNonNegativeInteger(registry.activeCount)) {
    errors.push("activeCount must be a finite non-negative integer");
  } else if (registry.activeCount < activeEntries.length) {
    errors.push(`activeCount ${registry.activeCount} is lower than the ${activeEntries.length} running entries in the snapshot`);
  }
  if (!isFiniteNonNegativeNumber(registry.activeEstimatedResidentMemoryBytes)) {
    errors.push("activeEstimatedResidentMemoryBytes must be a finite non-negative number");
  } else if (registry.activeEstimatedResidentMemoryBytes < activeEntryEstimate) {
    errors.push("activeEstimatedResidentMemoryBytes is lower than the known running-entry estimate");
  }
  if (registry.activeActualResidentMemoryBytes !== undefined) {
    if (!isFiniteNonNegativeNumber(registry.activeActualResidentMemoryBytes)) {
      errors.push("activeActualResidentMemoryBytes must be a finite non-negative number when present");
    } else if (activeEntryActual !== undefined && registry.activeActualResidentMemoryBytes < activeEntryActual) {
      errors.push("activeActualResidentMemoryBytes is lower than the known running-entry actual RSS");
    }
  }
  if (!decision || typeof decision !== "object") {
    errors.push("policyDecision must be present");
  } else {
    if (typeof decision.reason !== "string" || !decision.reason.trim()) errors.push("policyDecision.reason must be non-empty");
    compareString(errors, "policyDecision.outcome", decision.outcome, expectedDecision.outcome);
    compareOptionalNumber(errors, "policyDecision.requestedEstimatedResidentMemoryBytes", decision.requestedEstimatedResidentMemoryBytes, requestedEstimatedResidentMemoryBytes);
    compareNumber(errors, "policyDecision.activeEstimatedResidentMemoryBytes", decision.activeEstimatedResidentMemoryBytes, registry.activeEstimatedResidentMemoryBytes);
    compareOptionalNumber(errors, "policyDecision.activeActualResidentMemoryBytes", decision.activeActualResidentMemoryBytes, registry.activeActualResidentMemoryBytes);
    compareNumber(errors, "policyDecision.projectedEstimatedResidentMemoryBytes", decision.projectedEstimatedResidentMemoryBytes, expectedDecision.projectedEstimatedResidentMemoryBytes);
    compareOptionalNumber(errors, "policyDecision.maxResidentMemoryBytes", decision.maxResidentMemoryBytes, expectedDecision.maxResidentMemoryBytes);
    compareOptionalNumber(errors, "policyDecision.exceededByBytes", decision.exceededByBytes, expectedDecision.exceededByBytes);
    compareStringArray(errors, "policyDecision.unloadCandidateIds", decision.unloadCandidateIds, expectedDecision.unloadCandidateIds);
    if (registry.hostMemory) {
      compareString(errors, "policyDecision.activeResidentMemoryBasis", decision.activeResidentMemoryBasis ?? "", expectedDecision.activeResidentMemoryBasis ?? "");
      compareOptionalNumber(errors, "policyDecision.projectedResidentMemoryBytes", decision.projectedResidentMemoryBytes, expectedDecision.projectedResidentMemoryBytes);
      compareOptionalNumber(errors, "policyDecision.projectedSystemMemoryUtilization", decision.projectedSystemMemoryUtilization, expectedDecision.projectedSystemMemoryUtilization);
      compareOptionalNumber(errors, "policyDecision.maxProjectedMemoryUtilization", decision.maxProjectedMemoryUtilization, expectedDecision.maxProjectedMemoryUtilization);
      compareOptionalNumber(errors, "policyDecision.projectedFreeMemoryBytes", decision.projectedFreeMemoryBytes, expectedDecision.projectedFreeMemoryBytes);
      compareOptionalNumber(errors, "policyDecision.projectedFreeMemoryRatio", decision.projectedFreeMemoryRatio, expectedDecision.projectedFreeMemoryRatio);
      compareOptionalNumber(errors, "policyDecision.minFreeMemoryRatioAfterLaunch", decision.minFreeMemoryRatioAfterLaunch, expectedDecision.minFreeMemoryRatioAfterLaunch);
      compareOptionalNumber(errors, "policyDecision.comfortableFreeMemoryRatio", decision.comfortableFreeMemoryRatio, expectedDecision.comfortableFreeMemoryRatio);
      compareStringArray(errors, "policyDecision.uncertaintyReasons", decision.uncertaintyReasons ?? [], expectedDecision.uncertaintyReasons ?? []);
    }
    if (requestedEstimatedResidentMemoryBytes !== undefined && !isFiniteNonNegativeNumber(requestedEstimatedResidentMemoryBytes)) {
      errors.push("policyDecision.requestedEstimatedResidentMemoryBytes must be a finite non-negative number when present");
    }
  }

  return {
    schemaVersion: "ambient-local-model-resource-policy-validation-v1",
    valid: errors.length === 0,
    errors,
  };
}

export function localModelResourcePolicySnapshotValidationReason(
  validation: LocalModelResourcePolicySnapshotValidation,
): string {
  if (validation.valid) return "Local-model resource policy snapshot is valid.";
  const preview = validation.errors.slice(0, 3).join("; ");
  const remaining = validation.errors.length > 3 ? `; +${validation.errors.length - 3} more` : "";
  return `Local-model resource policy snapshot is invalid: ${preview}${remaining}.`;
}

export async function enforceLocalModelResourceLaunchPolicy(
  input: EnforceLocalModelResourceLaunchPolicyInput,
): Promise<LocalModelResourceLaunchPreflightResult> {
  const validation = validateLocalModelResourcePolicySnapshot(input.registry);
  if (!validation.valid) {
    return {
      allowed: false,
      outcome: "refuse",
      reason: localModelResourcePolicySnapshotValidationReason(validation),
      registry: input.registry,
    };
  }
  const decision = input.registry.policyDecision;
  if (decision.outcome === "unlimited" || decision.outcome === "within-limit" || decision.outcome === "warn") {
    return {
      allowed: true,
      outcome: decision.outcome,
      reason: decision.reason,
      registry: input.registry,
    };
  }
  if (decision.outcome === "refuse") {
    return {
      allowed: false,
      outcome: "refuse",
      reason: decision.reason,
      registry: input.registry,
    };
  }
  if (decision.outcome === "ask-to-exceed") {
    const approved = await input.approveExceed?.(decision);
    return {
      allowed: Boolean(approved),
      outcome: "ask-to-exceed",
      reason: approved
        ? "User approved exceeding the configured local-model resident-memory ceiling for this launch."
        : decision.reason,
      registry: input.registry,
    };
  }
  const unload = unloadLocalModelResourceCandidates({
    registry: input.registry,
    killProcess: input.killProcess,
  });
  const allowed = unload.stoppedIds.length > 0 && unload.failed.length === 0;
  return {
    allowed,
    outcome: allowed ? "unloaded-idle" : "unload-idle",
    reason: allowed
      ? `Unloaded ${unload.stoppedIds.length} idle local model server${unload.stoppedIds.length === 1 ? "" : "s"} before launch.`
      : decision.reason,
    registry: input.registry,
    unload,
  };
}

export function unloadLocalModelResourceCandidates(input: {
  registry: LocalModelResourceRegistrySnapshot;
  candidateIds?: string[];
  killProcess?: (pid: number, signal?: NodeJS.Signals) => void;
}): LocalModelResourceUnloadResult {
  const killProcess = input.killProcess ?? defaultKillProcess;
  const candidateIds = input.candidateIds ?? input.registry.policyDecision.unloadCandidateIds;
  const candidateIdSet = new Set(candidateIds);
  const result: LocalModelResourceUnloadResult = {
    attemptedIds: candidateIds,
    stoppedIds: [],
    failed: [],
  };
  for (const entry of input.registry.entries) {
    if (!candidateIdSet.has(entry.id)) continue;
    try {
      if (entry.pid === undefined) throw new Error("No tracked process id is available for this local runtime.");
      killProcess(entry.pid, "SIGTERM");
      result.stoppedIds.push(entry.id);
    } catch (error) {
      result.failed.push({
        id: entry.id,
        pid: entry.pid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

function idleUnloadCandidates(
  entries: LocalModelResourceRegistryEntry[],
  activeLeases: LocalRuntimeLeaseRecord[] = [],
): string[] {
  return entries
    .filter((entry) => entry.running && (entry.idleTimeMs ?? 0) > 0 && !localModelResourceEntryHasActiveLease(entry, activeLeases))
    .sort((left, right) => (right.idleTimeMs ?? 0) - (left.idleTimeMs ?? 0))
    .map((entry) => entry.id);
}

function localModelResourceEntryHasActiveLease(
  entry: LocalModelResourceRegistryEntry,
  activeLeases: LocalRuntimeLeaseRecord[],
): boolean {
  if (entry.activeLeaseIds?.some((id) => id.trim())) return true;
  return activeLeases.some((lease) => localRuntimeActiveLeaseIdsForResourceEntry(entry, [lease]).length > 0);
}

function localModelResourceEntriesWithActiveLeases(
  entries: LocalModelResourceRegistryEntry[],
  activeLeases: LocalRuntimeLeaseRecord[],
): LocalModelResourceRegistryEntry[] {
  if (!activeLeases.length) return entries;
  return entries.map((entry) => {
    const activeLeaseIds = localRuntimeActiveLeaseIdsForResourceEntry(entry, activeLeases);
    if (!activeLeaseIds.length) return entry;
    return { ...entry, activeLeaseIds };
  });
}

function activeLocalModelResourceLeases(
  leases: LocalRuntimeLeaseRecord[] | undefined,
  leaseFreshness: LocalRuntimeLeaseFreshnessOptions = {},
): LocalRuntimeLeaseRecord[] {
  return (leases ?? []).filter((lease) => isActiveLocalRuntimeLease(lease, leaseFreshness));
}

function localModelResourceLeaseFreshness(
  input: Pick<BuildLocalModelResourceRegistryInput, "leaseStaleMs">,
  capturedAt: string,
): LocalRuntimeLeaseFreshnessOptions {
  return {
    now: capturedAt,
    ...(input.leaseStaleMs !== undefined ? { staleMs: input.leaseStaleMs } : {}),
  };
}

function idleTimeMs(lastUsedAt: string, now: Date): number | undefined {
  const parsed = Date.parse(lastUsedAt);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, now.getTime() - parsed);
}

function validateRequestedLaunch(errors: string[], requestedLaunch: LocalModelResourceRequestedLaunch): void {
  if (!["local-deep-research", "minicpm-v", "local-text", "voice", "embeddings"].includes(requestedLaunch.capability)) {
    errors.push(`requestedLaunch.capability ${String(requestedLaunch.capability)} is not supported`);
  }
  if (typeof requestedLaunch.id !== "string" || !requestedLaunch.id.trim()) errors.push("requestedLaunch.id must be non-empty");
  validateOptionalString(errors, "requestedLaunch.ownerThreadId", requestedLaunch.ownerThreadId);
  validateOptionalString(errors, "requestedLaunch.modelId", requestedLaunch.modelId);
  validateOptionalString(errors, "requestedLaunch.profileId", requestedLaunch.profileId);
  if (requestedLaunch.contextTokens !== undefined && !isFiniteNonNegativeInteger(requestedLaunch.contextTokens)) {
    errors.push("requestedLaunch.contextTokens must be a finite non-negative integer when present");
  }
  if (requestedLaunch.estimatedResidentMemoryBytes !== undefined && !isFiniteNonNegativeNumber(requestedLaunch.estimatedResidentMemoryBytes)) {
    errors.push("requestedLaunch.estimatedResidentMemoryBytes must be a finite non-negative number when present");
  }
}

function requestedLaunchFromPolicyDecision(
  decision: LocalModelResourcePolicyDecision,
  activeEntries: LocalModelResourceRegistryEntry[],
): LocalModelResourceRequestedLaunch | undefined {
  if (decision.requestedEstimatedResidentMemoryBytes === undefined) return undefined;
  return {
    capability: activeEntries[0]?.capability ?? "local-text",
    id: "policy-decision-requested-launch",
    estimatedResidentMemoryBytes: decision.requestedEstimatedResidentMemoryBytes,
  };
}

function validateHostMemory(errors: string[], hostMemory: LocalModelHostMemorySnapshot): void {
  if (hostMemory.schemaVersion !== "ambient-local-model-host-memory-v1") {
    errors.push("hostMemory schemaVersion is not ambient-local-model-host-memory-v1");
  }
  if (typeof hostMemory.sampledAt !== "string" || !hostMemory.sampledAt.trim()) {
    errors.push("hostMemory.sampledAt must be non-empty");
  }
  if (!isFiniteNonNegativeNumber(hostMemory.totalMemoryBytes) || hostMemory.totalMemoryBytes <= 0) {
    errors.push("hostMemory.totalMemoryBytes must be a finite positive number");
  }
  if (!isFiniteNonNegativeNumber(hostMemory.freeMemoryBytes)) {
    errors.push("hostMemory.freeMemoryBytes must be a finite non-negative number");
  }
  if (hostMemory.availableMemoryBytes !== undefined && !isFiniteNonNegativeNumber(hostMemory.availableMemoryBytes)) {
    errors.push("hostMemory.availableMemoryBytes must be a finite non-negative number when present");
  }
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  let seen = false;
  let sum = 0;
  for (const value of values) {
    if (value === undefined || !Number.isFinite(value)) continue;
    seen = true;
    sum += Math.max(0, value);
  }
  return seen ? sum : undefined;
}

function isFiniteNonNegativeNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteNonNegativeInteger(value: number | undefined): value is number {
  return isFiniteNonNegativeNumber(value) && Number.isInteger(value);
}

function positiveMemoryBytes(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function clampMemoryBytes(value: number, totalMemoryBytes: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), totalMemoryBytes);
}

function portFromEndpoint(endpoint: string): number | undefined {
  try {
    const parsed = new URL(endpoint);
    const port = Number.parseInt(parsed.port, 10);
    return Number.isFinite(port) && port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}

function validateOptionalString(errors: string[], label: string, value: unknown): void {
  if (value !== undefined && (typeof value !== "string" || !value.trim())) errors.push(`${label} must be non-empty when present`);
}

function compareString(errors: string[], label: string, actual: string, expected: string): void {
  if (actual !== expected) errors.push(`${label} expected ${expected} but found ${actual}`);
}

function compareNumber(errors: string[], label: string, actual: number | undefined, expected: number): void {
  if (!isFiniteNonNegativeNumber(actual)) {
    errors.push(`${label} must be a finite non-negative number`);
    return;
  }
  if (actual !== expected) errors.push(`${label} expected ${expected} but found ${actual}`);
}

function compareOptionalNumber(errors: string[], label: string, actual: number | undefined, expected: number | undefined): void {
  if (expected === undefined) {
    if (actual !== undefined) errors.push(`${label} expected undefined but found ${actual}`);
    return;
  }
  compareNumber(errors, label, actual, expected);
}

function compareStringArray(errors: string[], label: string, actual: string[], expected: string[]): void {
  if (!Array.isArray(actual)) {
    errors.push(`${label} must be an array`);
    return;
  }
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    errors.push(`${label} expected [${expected.join(", ")}] but found [${actual.join(", ")}]`);
  }
}

function defaultKillProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  process.kill(pid, signal);
}
