import type { DiagnosticExportLocalRuntimeEvidence, DiagnosticExportLocalRuntimeSummary } from "../../shared/diagnosticTypes";
import {
  MAX_ERROR_MESSAGES,
  MAX_EVIDENCE_STRING_CHARS,
  MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
  MAX_LOCAL_RUNTIME_EVIDENCE_ROWS,
  MAX_SUMMARY_MESSAGE_CHARS,
  arrayValue,
  boundedString,
  boundedStringArray,
  finiteNonNegativeNumber,
  healthStatusValue,
  nonNegativeInteger,
  objectValue,
} from "./diagnosticExportHistoryStorageUtils";

export function diagnosticLocalRuntimeSummaryFromStorage(input: unknown): DiagnosticExportLocalRuntimeSummary | undefined {
  const value = objectValue(input);
  const status = healthStatusValue(value?.status);
  const message = boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS);
  const runtimeCount = nonNegativeInteger(value?.runtimeCount);
  const runningCount = nonNegativeInteger(value?.runningCount);
  const activeLeaseCount = nonNegativeInteger(value?.activeLeaseCount);
  const stopBlockedCount = nonNegativeInteger(value?.stopBlockedCount);
  const restartBlockedCount = nonNegativeInteger(value?.restartBlockedCount);
  const untrackedCount = nonNegativeInteger(value?.untrackedCount);
  const staleLeaseCount = nonNegativeInteger(value?.staleLeaseCount);
  const releasedLeaseCount = nonNegativeInteger(value?.releasedLeaseCount);
  const crashedLeaseCount = nonNegativeInteger(value?.crashedLeaseCount);
  const activeEstimatedResidentMemoryBytes = nonNegativeInteger(value?.activeEstimatedResidentMemoryBytes);
  if (
    !status ||
    !message ||
    runtimeCount === undefined ||
    runningCount === undefined ||
    activeLeaseCount === undefined ||
    stopBlockedCount === undefined ||
    restartBlockedCount === undefined ||
    untrackedCount === undefined ||
    staleLeaseCount === undefined ||
    releasedLeaseCount === undefined ||
    crashedLeaseCount === undefined ||
    activeEstimatedResidentMemoryBytes === undefined
  ) {
    return undefined;
  }
  const activeActualResidentMemoryBytes = nonNegativeInteger(value?.activeActualResidentMemoryBytes);
  return {
    status,
    message,
    runtimeCount,
    runningCount,
    activeLeaseCount,
    stopBlockedCount,
    restartBlockedCount,
    untrackedCount,
    staleLeaseCount,
    releasedLeaseCount,
    crashedLeaseCount,
    activeEstimatedResidentMemoryBytes,
    ...(activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes } : {}),
    ...(boundedString(value?.memoryPolicyOutcome, MAX_EVIDENCE_STRING_CHARS)
      ? { memoryPolicyOutcome: boundedString(value?.memoryPolicyOutcome, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.memoryPolicyReason, MAX_SUMMARY_MESSAGE_CHARS)
      ? { memoryPolicyReason: boundedString(value?.memoryPolicyReason, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
    errorMessages: boundedStringArray(value?.errorMessages, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
  };
}

export function diagnosticLocalRuntimeEvidenceFromStorage(input: unknown): DiagnosticExportLocalRuntimeEvidence | undefined {
  const value = objectValue(input);
  if (value?.schemaVersion !== "ambient-local-runtime-diagnostic-evidence-v1" || value.source !== "diagnostic_export") {
    return undefined;
  }
  const capturedAt = boundedString(value.capturedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const truncated = typeof value.truncated === "boolean" ? value.truncated : undefined;
  const counts = diagnosticLocalRuntimeEvidenceCountsFromStorage(value.counts);
  const shownCounts = diagnosticLocalRuntimeEvidenceCountsFromStorage(value.shownCounts);
  const memoryEvidence = diagnosticLocalRuntimeMemoryEvidenceFromStorage(value.memoryEvidence);
  if (!capturedAt || truncated === undefined || !counts || !shownCounts || !memoryEvidence) return undefined;
  return {
    schemaVersion: "ambient-local-runtime-diagnostic-evidence-v1",
    source: "diagnostic_export",
    capturedAt,
    truncated,
    counts,
    shownCounts,
    runtimes: arrayValue(value.runtimes)
      .flatMap((item) => {
        const parsed = diagnosticLocalRuntimeEvidenceRuntimeFromStorage(item);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
    activeOwners: arrayValue(value.activeOwners)
      .flatMap((item) => {
        const parsed = diagnosticLocalRuntimeEvidenceOwnerFromStorage(item);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
    blockedActions: arrayValue(value.blockedActions)
      .flatMap((item) => {
        const parsed = diagnosticLocalRuntimeEvidenceBlockedActionFromStorage(item);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
    nextSafeActions: arrayValue(value.nextSafeActions)
      .flatMap((item) => {
        const parsed = diagnosticLocalRuntimeEvidenceNextSafeActionFromStorage(item);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
    memoryEvidence,
  };
}

function diagnosticLocalRuntimeEvidenceCountsFromStorage(input: unknown): DiagnosticExportLocalRuntimeEvidence["counts"] | undefined {
  const value = objectValue(input);
  const runtimes = nonNegativeInteger(value?.runtimes);
  const activeOwners = nonNegativeInteger(value?.activeOwners);
  const blockedActions = nonNegativeInteger(value?.blockedActions);
  const nextSafeActions = nonNegativeInteger(value?.nextSafeActions);
  if (runtimes === undefined || activeOwners === undefined || blockedActions === undefined || nextSafeActions === undefined) {
    return undefined;
  }
  return { runtimes, activeOwners, blockedActions, nextSafeActions };
}

function diagnosticLocalRuntimeEvidenceRuntimeFromStorage(
  input: unknown,
): DiagnosticExportLocalRuntimeEvidence["runtimes"][number] | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const runtimeEntryId = boundedString(value?.runtimeEntryId, MAX_SUMMARY_MESSAGE_CHARS);
  const capability = localRuntimeCapability(value?.capability);
  const trackingStatus = localRuntimeTrackingStatus(value?.trackingStatus);
  const running = typeof value?.running === "boolean" ? value.running : undefined;
  const ordinaryStopAllowed = typeof value?.ordinaryStopAllowed === "boolean" ? value.ordinaryStopAllowed : undefined;
  const ordinaryRestartAllowed = typeof value?.ordinaryRestartAllowed === "boolean" ? value.ordinaryRestartAllowed : undefined;
  const stopReason = boundedString(value?.stopReason, MAX_SUMMARY_MESSAGE_CHARS);
  const restartReason = boundedString(value?.restartReason, MAX_SUMMARY_MESSAGE_CHARS);
  const forceStopAllowed = typeof value?.forceStopAllowed === "boolean" ? value.forceStopAllowed : undefined;
  const forceRestartAllowed = typeof value?.forceRestartAllowed === "boolean" ? value.forceRestartAllowed : undefined;
  const forceStopRequiresSubagentCancellation =
    typeof value?.forceStopRequiresSubagentCancellation === "boolean" ? value.forceStopRequiresSubagentCancellation : undefined;
  const forceRestartRequiresSubagentCancellation =
    typeof value?.forceRestartRequiresSubagentCancellation === "boolean" ? value.forceRestartRequiresSubagentCancellation : undefined;
  const untracked = typeof value?.untracked === "boolean" ? value.untracked : undefined;
  if (
    sequence === undefined ||
    !runtimeEntryId ||
    !capability ||
    !trackingStatus ||
    running === undefined ||
    ordinaryStopAllowed === undefined ||
    ordinaryRestartAllowed === undefined ||
    !stopReason ||
    !restartReason ||
    forceStopAllowed === undefined ||
    forceRestartAllowed === undefined ||
    forceStopRequiresSubagentCancellation === undefined ||
    forceRestartRequiresSubagentCancellation === undefined ||
    untracked === undefined
  ) {
    return undefined;
  }
  const pid = nonNegativeInteger(value?.pid);
  const estimatedResidentMemoryBytes = nonNegativeInteger(value?.estimatedResidentMemoryBytes);
  const actualResidentMemoryBytes = nonNegativeInteger(value?.actualResidentMemoryBytes);
  return {
    sequence,
    runtimeEntryId,
    capability,
    trackingStatus,
    running,
    ...(boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS)
      ? { providerId: boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.modelRuntimeId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelRuntimeId: boundedString(value?.modelRuntimeId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelProfileId: boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelId: boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(pid !== undefined ? { pid } : {}),
    ...(boundedString(value?.endpoint, MAX_EVIDENCE_STRING_CHARS)
      ? { endpoint: boundedString(value?.endpoint, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes } : {}),
    ...(actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes } : {}),
    ...(boundedString(value?.memorySampledAt, MAX_EVIDENCE_STRING_CHARS)
      ? { memorySampledAt: boundedString(value?.memorySampledAt, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ownerLabels: boundedStringArray(value?.ownerLabels, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    activeLeaseIds: boundedStringArray(value?.activeLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    staleLeaseIds: boundedStringArray(value?.staleLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    releasedLeaseIds: boundedStringArray(value?.releasedLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    crashedLeaseIds: boundedStringArray(value?.crashedLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    ordinaryStopAllowed,
    ordinaryRestartAllowed,
    stopReason,
    restartReason,
    forceStopAllowed,
    forceRestartAllowed,
    forceStopRequiresSubagentCancellation,
    forceRestartRequiresSubagentCancellation,
    untracked,
  };
}

function diagnosticLocalRuntimeEvidenceOwnerFromStorage(
  input: unknown,
): DiagnosticExportLocalRuntimeEvidence["activeOwners"][number] | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const runtimeEntryId = boundedString(value?.runtimeEntryId, MAX_SUMMARY_MESSAGE_CHARS);
  const leaseId = boundedString(value?.leaseId, MAX_SUMMARY_MESSAGE_CHARS);
  const displayName = boundedString(value?.displayName, MAX_SUMMARY_MESSAGE_CHARS);
  const status = localRuntimeLeaseStatus(value?.status);
  const capabilityKind = localRuntimeCapability(value?.capabilityKind);
  const acquiredAt = boundedString(value?.acquiredAt, MAX_SUMMARY_MESSAGE_CHARS);
  const lastHeartbeatAt = boundedString(value?.lastHeartbeatAt, MAX_SUMMARY_MESSAGE_CHARS);
  if (
    sequence === undefined ||
    !runtimeEntryId ||
    !leaseId ||
    !displayName ||
    !status ||
    !capabilityKind ||
    !acquiredAt ||
    !lastHeartbeatAt
  ) {
    return undefined;
  }
  const pid = nonNegativeInteger(value?.pid);
  const estimatedResidentMemoryBytes = nonNegativeInteger(value?.estimatedResidentMemoryBytes);
  const actualResidentMemoryBytes = nonNegativeInteger(value?.actualResidentMemoryBytes);
  return {
    sequence,
    runtimeEntryId,
    leaseId,
    displayName,
    status,
    ...(boundedString(value?.parentThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { parentThreadId: boundedString(value?.parentThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.subagentThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { subagentThreadId: boundedString(value?.subagentThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.subagentRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { subagentRunId: boundedString(value?.subagentRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    capabilityKind,
    ...(boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS)
      ? { providerId: boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.modelRuntimeId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelRuntimeId: boundedString(value?.modelRuntimeId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelProfileId: boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelId: boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes } : {}),
    ...(actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes } : {}),
    ...(pid !== undefined ? { pid } : {}),
    ...(boundedString(value?.endpoint, MAX_EVIDENCE_STRING_CHARS)
      ? { endpoint: boundedString(value?.endpoint, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    acquiredAt,
    lastHeartbeatAt,
  };
}

function diagnosticLocalRuntimeEvidenceBlockedActionFromStorage(
  input: unknown,
): DiagnosticExportLocalRuntimeEvidence["blockedActions"][number] | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const runtimeEntryId = boundedString(value?.runtimeEntryId, MAX_SUMMARY_MESSAGE_CHARS);
  const action = localRuntimeActionKind(value?.action);
  const reason = boundedString(value?.reason, MAX_SUMMARY_MESSAGE_CHARS);
  const forceAllowed = typeof value?.forceAllowed === "boolean" ? value.forceAllowed : undefined;
  const forceRequiresSubagentCancellation =
    typeof value?.forceRequiresSubagentCancellation === "boolean" ? value.forceRequiresSubagentCancellation : undefined;
  const untracked = typeof value?.untracked === "boolean" ? value.untracked : undefined;
  if (
    sequence === undefined ||
    !runtimeEntryId ||
    !action ||
    !reason ||
    forceAllowed === undefined ||
    forceRequiresSubagentCancellation === undefined ||
    untracked === undefined
  ) {
    return undefined;
  }
  return {
    sequence,
    runtimeEntryId,
    action,
    reason,
    blockerLeaseIds: boundedStringArray(value?.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    affectedSubagentLabels: boundedStringArray(value?.affectedSubagentLabels, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    affectedSubagentThreadIds: boundedStringArray(
      value?.affectedSubagentThreadIds,
      MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
      MAX_EVIDENCE_STRING_CHARS,
    ),
    forceAllowed,
    forceRequiresSubagentCancellation,
    untracked,
  };
}

function diagnosticLocalRuntimeEvidenceNextSafeActionFromStorage(
  input: unknown,
): DiagnosticExportLocalRuntimeEvidence["nextSafeActions"][number] | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const action = localRuntimeNextActionKind(value?.action);
  const safety = localRuntimeNextActionSafety(value?.safety);
  const reason = boundedString(value?.reason, MAX_SUMMARY_MESSAGE_CHARS);
  if (sequence === undefined || !action || !safety || !reason) return undefined;
  const capability = localRuntimeCapability(value?.capability);
  const toolName = localRuntimeToolName(value?.toolName);
  const ownershipResolution = diagnosticLocalRuntimeOwnershipResolutionFromStorage(value?.ownershipResolution);
  return {
    sequence,
    action,
    safety,
    reason,
    ...(boundedString(value?.runtimeEntryId, MAX_EVIDENCE_STRING_CHARS)
      ? { runtimeEntryId: boundedString(value?.runtimeEntryId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.runtimeId, MAX_EVIDENCE_STRING_CHARS)
      ? { runtimeId: boundedString(value?.runtimeId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(capability ? { capability } : {}),
    ...(toolName ? { toolName } : {}),
    ...(boundedStringArray(value?.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS).length
      ? { blockerLeaseIds: boundedStringArray(value?.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedStringArray(value?.affectedSubagentLabels, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS).length
      ? {
          affectedSubagentLabels: boundedStringArray(
            value?.affectedSubagentLabels,
            MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
            MAX_EVIDENCE_STRING_CHARS,
          ),
        }
      : {}),
    ...(ownershipResolution ? { ownershipResolution } : {}),
    ...(typeof value?.untracked === "boolean" ? { untracked: value.untracked } : {}),
  };
}

function diagnosticLocalRuntimeOwnershipResolutionFromStorage(
  input: unknown,
): DiagnosticExportLocalRuntimeEvidence["nextSafeActions"][number]["ownershipResolution"] | undefined {
  const value = objectValue(input);
  const lifecycleAction = value?.lifecycleAction === "stop" || value?.lifecycleAction === "restart" ? value.lifecycleAction : undefined;
  const resolution = value?.resolution === "cancel-or-mark-affected-subagents" ? value.resolution : undefined;
  const requiresInventoryRefresh = value?.requiresInventoryRefresh === true ? value.requiresInventoryRefresh : undefined;
  const reason = boundedString(value?.reason, MAX_SUMMARY_MESSAGE_CHARS);
  if (!lifecycleAction || !resolution || !requiresInventoryRefresh || !reason) return undefined;
  return {
    lifecycleAction,
    resolution,
    requiresInventoryRefresh,
    reason,
    blockerLeaseIds: boundedStringArray(value?.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    affectedSubagentLabels: boundedStringArray(value?.affectedSubagentLabels, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
  };
}

function diagnosticLocalRuntimeMemoryEvidenceFromStorage(
  input: unknown,
): DiagnosticExportLocalRuntimeEvidence["memoryEvidence"] | undefined {
  const value = objectValue(input);
  const activeEstimatedResidentMemoryBytes = nonNegativeInteger(value?.activeEstimatedResidentMemoryBytes);
  const entryCountWithActualRss = nonNegativeInteger(value?.entryCountWithActualRss);
  const entryCountWithOnlyEstimate = nonNegativeInteger(value?.entryCountWithOnlyEstimate);
  const entryCountWithUnknownMemory = nonNegativeInteger(value?.entryCountWithUnknownMemory);
  if (
    activeEstimatedResidentMemoryBytes === undefined ||
    entryCountWithActualRss === undefined ||
    entryCountWithOnlyEstimate === undefined ||
    entryCountWithUnknownMemory === undefined
  ) {
    return undefined;
  }
  const activeActualResidentMemoryBytes = nonNegativeInteger(value?.activeActualResidentMemoryBytes);
  const activeResidentMemoryBasis = localRuntimeMemoryBasis(value?.activeResidentMemoryBasis);
  const requestedEstimatedResidentMemoryBytes = nonNegativeInteger(value?.requestedEstimatedResidentMemoryBytes);
  const projectedEstimatedResidentMemoryBytes = nonNegativeInteger(value?.projectedEstimatedResidentMemoryBytes);
  const projectedResidentMemoryBytes = nonNegativeInteger(value?.projectedResidentMemoryBytes);
  const projectedFreeMemoryBytes = nonNegativeInteger(value?.projectedFreeMemoryBytes);
  return {
    activeEstimatedResidentMemoryBytes,
    ...(activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes } : {}),
    ...(activeResidentMemoryBasis ? { activeResidentMemoryBasis } : {}),
    ...(requestedEstimatedResidentMemoryBytes !== undefined ? { requestedEstimatedResidentMemoryBytes } : {}),
    ...(projectedEstimatedResidentMemoryBytes !== undefined ? { projectedEstimatedResidentMemoryBytes } : {}),
    ...(projectedResidentMemoryBytes !== undefined ? { projectedResidentMemoryBytes } : {}),
    ...(finiteNonNegativeNumber(value?.projectedSystemMemoryUtilization) !== undefined
      ? { projectedSystemMemoryUtilization: finiteNonNegativeNumber(value?.projectedSystemMemoryUtilization) }
      : {}),
    ...(projectedFreeMemoryBytes !== undefined ? { projectedFreeMemoryBytes } : {}),
    ...(finiteNonNegativeNumber(value?.projectedFreeMemoryRatio) !== undefined
      ? { projectedFreeMemoryRatio: finiteNonNegativeNumber(value?.projectedFreeMemoryRatio) }
      : {}),
    uncertaintyReasons: boundedStringArray(value?.uncertaintyReasons, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    entryCountWithActualRss,
    entryCountWithOnlyEstimate,
    entryCountWithUnknownMemory,
  };
}

function localRuntimeCapability(value: unknown): DiagnosticExportLocalRuntimeEvidence["runtimes"][number]["capability"] | undefined {
  return value === "local-deep-research" || value === "minicpm-v" || value === "local-text" || value === "voice" || value === "embeddings"
    ? value
    : undefined;
}

function localRuntimeTrackingStatus(
  value: unknown,
): DiagnosticExportLocalRuntimeEvidence["runtimes"][number]["trackingStatus"] | undefined {
  return value === "managed" || value === "tracked" || value === "untracked" ? value : undefined;
}

function localRuntimeLeaseStatus(value: unknown): DiagnosticExportLocalRuntimeEvidence["activeOwners"][number]["status"] | undefined {
  return value === "acquiring" ||
    value === "running" ||
    value === "idle" ||
    value === "releasing" ||
    value === "released" ||
    value === "crashed"
    ? value
    : undefined;
}

function localRuntimeActionKind(value: unknown): DiagnosticExportLocalRuntimeEvidence["blockedActions"][number]["action"] | undefined {
  return value === "stop" || value === "restart" || value === "load" || value === "unload" ? value : undefined;
}

function localRuntimeNextActionKind(value: unknown): DiagnosticExportLocalRuntimeEvidence["nextSafeActions"][number]["action"] | undefined {
  return value === "inspect-status" ||
    value === "start-runtime" ||
    value === "stop-runtime" ||
    value === "restart-runtime" ||
    value === "force-stop-runtime" ||
    value === "force-restart-runtime" ||
    value === "wait-for-owner" ||
    value === "ask-user-to-stop-untracked" ||
    value === "review-memory-policy"
    ? value
    : undefined;
}

function localRuntimeNextActionSafety(
  value: unknown,
): DiagnosticExportLocalRuntimeEvidence["nextSafeActions"][number]["safety"] | undefined {
  return value === "safe" || value === "requires-approval" || value === "blocked" || value === "external" ? value : undefined;
}

function localRuntimeToolName(
  value: unknown,
): NonNullable<DiagnosticExportLocalRuntimeEvidence["nextSafeActions"][number]["toolName"]> | undefined {
  return value === "ambient_local_model_runtime_status" ||
    value === "ambient_local_model_runtime_start" ||
    value === "ambient_local_model_runtime_stop" ||
    value === "ambient_local_model_runtime_restart"
    ? value
    : undefined;
}

function localRuntimeMemoryBasis(
  value: unknown,
): NonNullable<DiagnosticExportLocalRuntimeEvidence["memoryEvidence"]["activeResidentMemoryBasis"]> | undefined {
  return value === "actual-rss" || value === "estimated" || value === "mixed" || value === "none" ? value : undefined;
}
