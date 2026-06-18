import type { LocalModelHostMemorySnapshot, LocalModelMemoryLimitBehavior, LocalModelResourcePolicyDecision, LocalModelResourceSettings } from "./localRuntimeTypes";

export const DEFAULT_LOCAL_RUNTIME_MAX_PROJECTED_MEMORY_UTILIZATION = 0.8;
export const DEFAULT_LOCAL_RUNTIME_MIN_FREE_MEMORY_RATIO_AFTER_LAUNCH = 0.2;
export const DEFAULT_LOCAL_RUNTIME_COMFORTABLE_FREE_MEMORY_RATIO = 0.4;

export interface NormalizedLocalRuntimeMemoryPolicySettings {
  maxResidentMemoryBytes?: number;
  maxProjectedMemoryUtilization: number;
  minFreeMemoryRatioAfterLaunch: number;
  comfortableFreeMemoryRatio: number;
  memoryLimitBehavior: LocalModelMemoryLimitBehavior;
}

export interface ResolveLocalRuntimeMemoryPolicyInput {
  settings?: LocalModelResourceSettings;
  hostMemory?: LocalModelHostMemorySnapshot;
  requestedEstimatedResidentMemoryBytes?: number;
  activeEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  activeEstimatedResidentMemoryBytesWithoutActual?: number;
  unloadCandidateIds?: string[];
}

export function normalizeLocalRuntimeMemoryPolicySettings(
  settings: LocalModelResourceSettings | undefined,
): NormalizedLocalRuntimeMemoryPolicySettings {
  const maxResidentMemoryBytes = finitePositiveNumber(settings?.maxResidentMemoryBytes)
    ? Math.floor(settings.maxResidentMemoryBytes)
    : undefined;
  return {
    ...(maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes } : {}),
    maxProjectedMemoryUtilization: normalizeRatio(
      settings?.maxProjectedMemoryUtilization,
      DEFAULT_LOCAL_RUNTIME_MAX_PROJECTED_MEMORY_UTILIZATION,
    ),
    minFreeMemoryRatioAfterLaunch: normalizeRatio(
      settings?.minFreeMemoryRatioAfterLaunch,
      DEFAULT_LOCAL_RUNTIME_MIN_FREE_MEMORY_RATIO_AFTER_LAUNCH,
    ),
    comfortableFreeMemoryRatio: normalizeRatio(
      settings?.comfortableFreeMemoryRatio,
      DEFAULT_LOCAL_RUNTIME_COMFORTABLE_FREE_MEMORY_RATIO,
    ),
    memoryLimitBehavior: settings?.memoryLimitBehavior ?? "warn",
  };
}

export function resolveLocalRuntimeMemoryPolicy(
  input: ResolveLocalRuntimeMemoryPolicyInput,
): LocalModelResourcePolicyDecision {
  const settings = normalizeLocalRuntimeMemoryPolicySettings(input.settings);
  const requestedEstimatedResidentMemoryBytes = nonNegativeNumber(input.requestedEstimatedResidentMemoryBytes);
  const requestedBytes = requestedEstimatedResidentMemoryBytes ?? 0;
  const activeEstimatedResidentMemoryBytes = nonNegativeNumber(input.activeEstimatedResidentMemoryBytes) ?? 0;
  const activeActualResidentMemoryBytes = nonNegativeNumber(input.activeActualResidentMemoryBytes);
  const activeEstimatedResidentMemoryBytesWithoutActual = nonNegativeNumber(input.activeEstimatedResidentMemoryBytesWithoutActual);
  const activeResidentMemoryBasis = activeActualResidentMemoryBytes !== undefined
    ? activeEstimatedResidentMemoryBytesWithoutActual !== undefined && activeEstimatedResidentMemoryBytesWithoutActual > 0
      ? "mixed"
      : "actual-rss"
    : activeEstimatedResidentMemoryBytes > 0
      ? "estimated"
      : "none";
  const activeResidentMemoryBytes = activeActualResidentMemoryBytes !== undefined
    ? activeActualResidentMemoryBytes + (activeEstimatedResidentMemoryBytesWithoutActual ?? 0)
    : activeEstimatedResidentMemoryBytes;
  const projectedEstimatedResidentMemoryBytes = activeEstimatedResidentMemoryBytes + requestedBytes;
  const projectedResidentMemoryBytes = activeResidentMemoryBytes + requestedBytes;
  const uncertaintyReasons = memoryUncertaintyReasons({
    requestedEstimatedResidentMemoryBytes,
    activeEstimatedResidentMemoryBytes,
    activeActualResidentMemoryBytes,
    activeEstimatedResidentMemoryBytesWithoutActual,
  });
  const absoluteExceededByBytes = settings.maxResidentMemoryBytes !== undefined
    ? Math.max(0, projectedEstimatedResidentMemoryBytes - settings.maxResidentMemoryBytes)
    : undefined;
  const hostProjection = projectHostMemory(input.hostMemory, requestedBytes);
  const hostPolicyExceeded = Boolean(hostProjection && (
    hostProjection.projectedSystemMemoryUtilization > settings.maxProjectedMemoryUtilization ||
    hostProjection.projectedFreeMemoryRatio < settings.minFreeMemoryRatioAfterLaunch
  ));
  const absolutePolicyExceeded = Boolean(absoluteExceededByBytes && absoluteExceededByBytes > 0);
  const common = {
    ...(requestedEstimatedResidentMemoryBytes !== undefined ? { requestedEstimatedResidentMemoryBytes } : {}),
    activeEstimatedResidentMemoryBytes,
    projectedEstimatedResidentMemoryBytes,
    ...(activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes } : {}),
    activeResidentMemoryBasis,
    projectedResidentMemoryBytes,
    ...(hostProjection ? {
      projectedSystemMemoryUtilization: hostProjection.projectedSystemMemoryUtilization,
      maxProjectedMemoryUtilization: settings.maxProjectedMemoryUtilization,
      projectedFreeMemoryBytes: hostProjection.projectedFreeMemoryBytes,
      projectedFreeMemoryRatio: hostProjection.projectedFreeMemoryRatio,
      minFreeMemoryRatioAfterLaunch: settings.minFreeMemoryRatioAfterLaunch,
      comfortableFreeMemoryRatio: settings.comfortableFreeMemoryRatio,
    } : {}),
    ...(settings.maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes: settings.maxResidentMemoryBytes } : {}),
    ...(absoluteExceededByBytes !== undefined && absoluteExceededByBytes > 0 ? { exceededByBytes: absoluteExceededByBytes } : {}),
    ...(uncertaintyReasons.length ? { uncertaintyReasons } : {}),
  } satisfies Partial<LocalModelResourcePolicyDecision>;

  if (hostPolicyExceeded || absolutePolicyExceeded) {
    return {
      outcome: settings.memoryLimitBehavior,
      reason: localRuntimeMemoryPolicyLimitReason({
        behavior: settings.memoryLimitBehavior,
        absoluteExceededByBytes,
        hostProjection,
        settings,
        unloadCandidateCount: input.unloadCandidateIds?.length ?? 0,
      }),
      ...common,
      unloadCandidateIds: input.unloadCandidateIds ?? [],
    };
  }

  if (hostProjection) {
    const freeMemoryRatioBeforeLaunch = safeRatio(hostProjection.availableMemoryBytes, hostProjection.totalMemoryBytes);
    const comfortable = freeMemoryRatioBeforeLaunch >= settings.comfortableFreeMemoryRatio;
    return {
      outcome: "within-limit",
      reason: comfortable
        ? `Projected local-model launch keeps ${formatPercent(hostProjection.projectedFreeMemoryRatio)} system memory free after launch.`
        : `Projected local-model launch stays within the ${formatPercent(settings.maxProjectedMemoryUtilization)} utilization ceiling and ${formatPercent(settings.minFreeMemoryRatioAfterLaunch)} free-memory floor.`,
      ...common,
      unloadCandidateIds: [],
    };
  }

  if (settings.maxResidentMemoryBytes !== undefined) {
    return {
      outcome: "within-limit",
      reason: "Projected local-model resident memory is within the configured ceiling.",
      ...common,
      unloadCandidateIds: [],
    };
  }

  return {
    outcome: "unlimited",
    reason: "No local-model resident-memory ceiling is configured.",
    ...common,
    unloadCandidateIds: [],
  };
}

function projectHostMemory(
  hostMemory: LocalModelHostMemorySnapshot | undefined,
  requestedBytes: number,
): {
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  projectedFreeMemoryBytes: number;
  projectedFreeMemoryRatio: number;
  projectedSystemMemoryUtilization: number;
} | undefined {
  if (!hostMemory) return undefined;
  const totalMemoryBytes = nonNegativeNumber(hostMemory.totalMemoryBytes);
  if (!totalMemoryBytes || totalMemoryBytes <= 0) return undefined;
  const availableMemoryBytes = nonNegativeNumber(hostMemory.availableMemoryBytes ?? hostMemory.freeMemoryBytes) ?? 0;
  const projectedFreeMemoryBytes = Math.max(0, availableMemoryBytes - requestedBytes);
  const projectedFreeMemoryRatio = safeRatio(projectedFreeMemoryBytes, totalMemoryBytes);
  return {
    totalMemoryBytes,
    availableMemoryBytes,
    projectedFreeMemoryBytes,
    projectedFreeMemoryRatio,
    projectedSystemMemoryUtilization: 1 - projectedFreeMemoryRatio,
  };
}

function localRuntimeMemoryPolicyLimitReason(input: {
  behavior: LocalModelMemoryLimitBehavior;
  absoluteExceededByBytes?: number;
  hostProjection?: ReturnType<typeof projectHostMemory>;
  settings: NormalizedLocalRuntimeMemoryPolicySettings;
  unloadCandidateCount: number;
}): string {
  if (!input.hostProjection && input.absoluteExceededByBytes && input.absoluteExceededByBytes > 0) {
    if (input.behavior === "warn") return `Projected local-model resident memory exceeds the configured ceiling by ${formatGiB(input.absoluteExceededByBytes)} GiB; continuing with warning behavior.`;
    if (input.behavior === "refuse") return `Projected local-model resident memory exceeds the configured ceiling by ${formatGiB(input.absoluteExceededByBytes)} GiB; refusing launch.`;
    if (input.behavior === "ask-to-exceed") return `Projected local-model resident memory exceeds the configured ceiling by ${formatGiB(input.absoluteExceededByBytes)} GiB; user approval is required to exceed it.`;
    return input.unloadCandidateCount
      ? `Projected local-model resident memory exceeds the configured ceiling by ${formatGiB(input.absoluteExceededByBytes)} GiB; unload idle local models before launch.`
      : `Projected local-model resident memory exceeds the configured ceiling by ${formatGiB(input.absoluteExceededByBytes)} GiB, but no idle local models are available to unload.`;
  }
  const reasons: string[] = [];
  if (input.hostProjection) {
    if (input.hostProjection.projectedSystemMemoryUtilization > input.settings.maxProjectedMemoryUtilization) {
      reasons.push(`projected system memory utilization would reach ${formatPercent(input.hostProjection.projectedSystemMemoryUtilization)}, above the ${formatPercent(input.settings.maxProjectedMemoryUtilization)} ceiling`);
    }
    if (input.hostProjection.projectedFreeMemoryRatio < input.settings.minFreeMemoryRatioAfterLaunch) {
      reasons.push(`projected free memory would fall to ${formatPercent(input.hostProjection.projectedFreeMemoryRatio)}, below the ${formatPercent(input.settings.minFreeMemoryRatioAfterLaunch)} floor`);
    }
  }
  if (input.absoluteExceededByBytes && input.absoluteExceededByBytes > 0) {
    reasons.push(`projected resident memory exceeds the configured ceiling by ${formatGiB(input.absoluteExceededByBytes)} GiB`);
  }
  const base = reasons.length ? `Projected local-model launch is over policy: ${reasons.join("; ")}.` : "Projected local-model launch is over policy.";
  if (input.behavior === "warn") return `${base} Continuing with warning behavior.`;
  if (input.behavior === "refuse") return `${base} Refusing launch.`;
  if (input.behavior === "ask-to-exceed") return `${base} User approval is required to exceed it.`;
  return `${base} Unload idle local models before launch.`;
}

function memoryUncertaintyReasons(input: {
  requestedEstimatedResidentMemoryBytes?: number;
  activeEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  activeEstimatedResidentMemoryBytesWithoutActual?: number;
}): string[] {
  const reasons: string[] = [];
  if (
    input.activeActualResidentMemoryBytes !== undefined &&
    input.activeEstimatedResidentMemoryBytesWithoutActual !== undefined &&
    input.activeEstimatedResidentMemoryBytesWithoutActual > 0
  ) {
    reasons.push("Active resident model memory mixes actual RSS for sampled runtimes with estimates for runtimes that have not reported RSS.");
  } else if (input.activeEstimatedResidentMemoryBytes > 0 && input.activeActualResidentMemoryBytes === undefined) {
    reasons.push("Active resident model memory uses estimates because actual RSS is not available.");
  }
  if (input.requestedEstimatedResidentMemoryBytes === undefined) {
    reasons.push("Requested model memory estimate is not available.");
  }
  return reasons;
}

function normalizeRatio(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value <= 0 || value >= 1) return fallback;
  return value;
}

function nonNegativeNumber(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function finitePositiveNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.max(0, Math.min(1, numerator / denominator));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatGiB(bytes: number): string {
  return (Math.max(0, bytes) / (1024 ** 3)).toFixed(1);
}
