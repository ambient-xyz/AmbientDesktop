import type { AgentMemoryStorageDiagnostics } from "../../shared/agentMemoryDiagnostics";
import type { AgentMemoryStarterStatus } from "../../shared/agentMemoryStarter";
import {
  MAX_ERROR_MESSAGES,
  MAX_EVIDENCE_STRING_CHARS,
  MAX_SUMMARY_MESSAGE_CHARS,
  agentMemoryOperationStatusKind,
  agentMemoryStarterAssetState,
  agentMemoryStarterBlockerCode,
  agentMemoryStarterNextAction,
  agentMemoryStarterRuntimeState,
  agentMemoryStarterState,
  arrayValue,
  boundedString,
  boundedStringArray,
  healthStatusValue,
  nonNegativeInteger,
  objectValue,
} from "./diagnosticExportHistoryStorageUtils";

export function diagnosticAgentMemoryFromStorage(input: unknown): AgentMemoryStorageDiagnostics | undefined {
  const value = objectValue(input);
  if (!value || value.schemaVersion !== "ambient-agent-memory-diagnostics-v1") return undefined;
  const status = healthStatusValue(value.status);
  const checkedAt = boundedString(value.checkedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const message = boundedString(value.message, MAX_SUMMARY_MESSAGE_CHARS);
  const activeThreadCount = nonNegativeInteger(value.activeThreadCount);
  const threadEnabledCount = nonNegativeInteger(value.threadEnabledCount);
  const dataDir = boundedString(value.dataDir, MAX_SUMMARY_MESSAGE_CHARS);
  const storageSchemaStatus = agentMemoryStorageSchemaStatus(value.storageSchemaStatus);
  const storageSchemaPath = boundedString(value.storageSchemaPath, MAX_SUMMARY_MESSAGE_CHARS);
  const storageSchemaExpectedVersion = boundedString(value.storageSchemaExpectedVersion, MAX_SUMMARY_MESSAGE_CHARS);
  const storageSchemaVersion = boundedString(value.storageSchemaVersion, MAX_SUMMARY_MESSAGE_CHARS);
  const storageSchemaMessage = boundedString(value.storageSchemaMessage, MAX_SUMMARY_MESSAGE_CHARS);
  const fileCount = nonNegativeInteger(value.fileCount);
  const totalBytes = nonNegativeInteger(value.totalBytes);
  const topLevelEntryCount = nonNegativeInteger(value.topLevelEntryCount);
  const nativePreflight = diagnosticAgentMemoryNativePreflightFromStorage(value.nativePreflight);
  const embedding = diagnosticAgentMemoryEmbeddingFromStorage(value.embedding);
  if (
    value.adapter !== "tencentdb" ||
    value.storageScope !== "workspace" ||
    !status ||
    !checkedAt ||
    !message ||
    typeof value.featureEnabled !== "boolean" ||
    typeof value.settingsEnabled !== "boolean" ||
    typeof value.defaultThreadEnabled !== "boolean" ||
    activeThreadCount === undefined ||
    threadEnabledCount === undefined ||
    !dataDir ||
    typeof value.dataDirExists !== "boolean" ||
    !storageSchemaStatus ||
    !storageSchemaPath ||
    !storageSchemaExpectedVersion ||
    !storageSchemaMessage ||
    fileCount === undefined ||
    totalBytes === undefined ||
    topLevelEntryCount === undefined ||
    value.rawContentIncluded !== false ||
    !embedding
  ) {
    return undefined;
  }
  return {
    schemaVersion: "ambient-agent-memory-diagnostics-v1",
    adapter: "tencentdb",
    storageScope: "workspace",
    checkedAt,
    status,
    message,
    featureEnabled: value.featureEnabled,
    settingsEnabled: value.settingsEnabled,
    defaultThreadEnabled: value.defaultThreadEnabled,
    embedding,
    activeThreadCount,
    threadEnabledCount,
    dataDir,
    dataDirExists: value.dataDirExists,
    storageSchemaStatus,
    storageSchemaPath,
    storageSchemaExpectedVersion,
    ...(storageSchemaVersion ? { storageSchemaVersion } : {}),
    storageSchemaMessage,
    fileCount,
    totalBytes,
    topLevelEntryCount,
    rawContentIncluded: false,
    ...(nativePreflight ? { nativePreflight } : {}),
    runtimeSnapshots: arrayValue(value.runtimeSnapshots)
      .flatMap((snapshot) => {
        const parsed = diagnosticAgentMemoryRuntimeSnapshotFromStorage(snapshot);
        return parsed ? [parsed] : [];
      })
      .slice(0, 50),
    errors: boundedStringArray(value.errors, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
  };
}

export function diagnosticAgentMemoryStarterFromStorage(input: unknown): AgentMemoryStarterStatus | undefined {
  const value = objectValue(input);
  if (!value || value.schemaVersion !== "ambient-agent-memory-starter-status-v1") return undefined;
  const checkedAt = boundedString(value.checkedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const operationId = boundedString(value.operationId, MAX_EVIDENCE_STRING_CHARS);
  const state = agentMemoryStarterState(value.state);
  const settings = diagnosticAgentMemoryStarterSettingsFromStorage(value.settings);
  const threadScope = diagnosticAgentMemoryStarterThreadScopeFromStorage(value.threadScope);
  const model = diagnosticAgentMemoryStarterAssetFromStorage(objectValue(value.assets)?.model);
  const runtimeAsset = diagnosticAgentMemoryStarterAssetFromStorage(objectValue(value.assets)?.runtime);
  const runtime = diagnosticAgentMemoryStarterRuntimeFromStorage(value.runtime);
  const embedding = diagnosticAgentMemoryEmbeddingFromStorage(value.embedding);
  const nativePreflight = diagnosticAgentMemoryNativePreflightFromStorage(value.nativePreflight);
  if (!checkedAt || !state || !settings || !threadScope || !model || !runtimeAsset || !runtime || !embedding || !nativePreflight) {
    return undefined;
  }
  return {
    schemaVersion: "ambient-agent-memory-starter-status-v1",
    checkedAt,
    ...(operationId ? { operationId } : {}),
    state,
    settings,
    threadScope,
    assets: {
      model,
      runtime: runtimeAsset,
    },
    runtime,
    embedding,
    nativePreflight,
    blockers: arrayValue(value.blockers)
      .flatMap((blocker) => {
        const parsed = diagnosticAgentMemoryStarterBlockerFromStorage(blocker);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_ERROR_MESSAGES),
    nextActions: arrayValue(value.nextActions)
      .flatMap((action) => {
        const parsed = agentMemoryStarterNextAction(action);
        return parsed ? [parsed] : [];
      })
      .slice(0, 8),
  };
}

function diagnosticAgentMemoryStarterSettingsFromStorage(input: unknown): AgentMemoryStarterStatus["settings"] | undefined {
  const value = objectValue(input);
  const featureFlags = objectValue(value?.featureFlags);
  const memory = objectValue(value?.memory);
  const embeddings = objectValue(memory?.embeddings);
  if (
    typeof featureFlags?.tencentDbMemory !== "boolean" ||
    typeof memory?.enabled !== "boolean" ||
    typeof memory.defaultThreadEnabled !== "boolean" ||
    memory.adapter !== "tencentdb" ||
    typeof memory.shortTermOffloadEnabled !== "boolean" ||
    memory.storageScope !== "workspace" ||
    typeof embeddings?.enabled !== "boolean" ||
    embeddings.providerMode !== "ambient-managed" ||
    typeof embeddings.autoStartProvider !== "boolean" ||
    typeof embeddings.sendDimensions !== "boolean" ||
    nonNegativeInteger(embeddings.maxInputChars) === undefined ||
    nonNegativeInteger(embeddings.timeoutMs) === undefined ||
    typeof embeddings.preflightEnabled !== "boolean"
  ) {
    return undefined;
  }
  const dimensions = nonNegativeInteger(embeddings.dimensions);
  return {
    featureFlags: {
      tencentDbMemory: featureFlags.tencentDbMemory,
    },
    memory: {
      mode:
        memory.mode === "enabled_all" || memory.mode === "per_thread" || memory.mode === "disabled"
          ? memory.mode
          : !memory.enabled
            ? "disabled"
            : memory.defaultThreadEnabled
              ? "enabled_all"
              : "per_thread",
      enabled: memory.enabled,
      defaultThreadEnabled: memory.defaultThreadEnabled,
      adapter: "tencentdb",
      shortTermOffloadEnabled: memory.shortTermOffloadEnabled,
      embeddings: {
        enabled: embeddings.enabled,
        providerMode: "ambient-managed",
        ...(boundedString(embeddings.providerCapabilityId, MAX_EVIDENCE_STRING_CHARS)
          ? { providerCapabilityId: boundedString(embeddings.providerCapabilityId, MAX_EVIDENCE_STRING_CHARS) }
          : {}),
        autoStartProvider: embeddings.autoStartProvider,
        ...(boundedString(embeddings.modelId, MAX_EVIDENCE_STRING_CHARS)
          ? { modelId: boundedString(embeddings.modelId, MAX_EVIDENCE_STRING_CHARS) }
          : {}),
        ...(dimensions !== undefined ? { dimensions } : {}),
        sendDimensions: embeddings.sendDimensions,
        maxInputChars: nonNegativeInteger(embeddings.maxInputChars) ?? 0,
        timeoutMs: nonNegativeInteger(embeddings.timeoutMs) ?? 0,
        preflightEnabled: embeddings.preflightEnabled,
      },
      storageScope: "workspace",
    },
  };
}

function diagnosticAgentMemoryStarterThreadScopeFromStorage(input: unknown): AgentMemoryStarterStatus["threadScope"] | undefined {
  const value = objectValue(input);
  if (typeof value?.activeThreadMemoryEnabled !== "boolean" || typeof value.defaultThreadEnabled !== "boolean") return undefined;
  const enabledThreadCount = nonNegativeInteger(value.enabledThreadCount);
  const activeThreadCount = nonNegativeInteger(value.activeThreadCount);
  return {
    ...(boundedString(value.activeThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { activeThreadId: boundedString(value.activeThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    activeThreadMemoryEnabled: value.activeThreadMemoryEnabled,
    defaultThreadEnabled: value.defaultThreadEnabled,
    ...(enabledThreadCount !== undefined ? { enabledThreadCount } : {}),
    ...(activeThreadCount !== undefined ? { activeThreadCount } : {}),
  };
}

function diagnosticAgentMemoryStarterAssetFromStorage(input: unknown): AgentMemoryStarterStatus["assets"]["model"] | undefined {
  const value = objectValue(input);
  const state = agentMemoryStarterAssetState(value?.state);
  if (!state) return undefined;
  const expectedBytes = nonNegativeInteger(value?.expectedBytes);
  const actualBytes = nonNegativeInteger(value?.actualBytes);
  return {
    state,
    ...(boundedString(value?.path, MAX_SUMMARY_MESSAGE_CHARS) ? { path: boundedString(value?.path, MAX_SUMMARY_MESSAGE_CHARS) } : {}),
    ...(expectedBytes !== undefined ? { expectedBytes } : {}),
    ...(actualBytes !== undefined ? { actualBytes } : {}),
    ...(boundedString(value?.expectedSha256, MAX_EVIDENCE_STRING_CHARS)
      ? { expectedSha256: boundedString(value?.expectedSha256, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.artifactId, MAX_EVIDENCE_STRING_CHARS)
      ? { artifactId: boundedString(value?.artifactId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.receiptPath, MAX_SUMMARY_MESSAGE_CHARS)
      ? { receiptPath: boundedString(value?.receiptPath, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
    ...(boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS)
      ? { message: boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
  };
}

function diagnosticAgentMemoryStarterRuntimeFromStorage(input: unknown): AgentMemoryStarterStatus["runtime"] | undefined {
  const value = objectValue(input);
  const state = agentMemoryStarterRuntimeState(value?.state);
  if (!state) return undefined;
  return {
    state,
    ...(boundedString(value?.runtimeId, MAX_EVIDENCE_STRING_CHARS)
      ? { runtimeId: boundedString(value?.runtimeId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.leaseId, MAX_EVIDENCE_STRING_CHARS)
      ? { leaseId: boundedString(value?.leaseId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.endpoint, MAX_SUMMARY_MESSAGE_CHARS)
      ? { endpoint: boundedString(value?.endpoint, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
    ...(boundedString(value?.ownerThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { ownerThreadId: boundedString(value?.ownerThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS)
      ? { message: boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
  };
}

function diagnosticAgentMemoryStarterBlockerFromStorage(input: unknown): AgentMemoryStarterStatus["blockers"][number] | undefined {
  const value = objectValue(input);
  const code = agentMemoryStarterBlockerCode(value?.code);
  const message = boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS);
  if (!code || !message || typeof value?.retryable !== "boolean") return undefined;
  return {
    code,
    message,
    ...(boundedString(value?.detail, MAX_SUMMARY_MESSAGE_CHARS) ? { detail: boundedString(value?.detail, MAX_SUMMARY_MESSAGE_CHARS) } : {}),
    retryable: value.retryable,
  };
}

function agentMemoryStorageSchemaStatus(input: unknown): AgentMemoryStorageDiagnostics["storageSchemaStatus"] | undefined {
  return input === "missing" || input === "current" || input === "unsupported" ? input : undefined;
}

function diagnosticAgentMemoryEmbeddingFromStorage(input: unknown): AgentMemoryStorageDiagnostics["embedding"] | undefined {
  const value = objectValue(input);
  if (!value || typeof value.enabled !== "boolean") return undefined;
  const status = agentMemoryEmbeddingStatus(value.status);
  const message = boundedString(value.message, MAX_SUMMARY_MESSAGE_CHARS);
  if (!status || !message) return undefined;
  const dimensions = nonNegativeInteger(value.dimensions);
  return {
    enabled: value.enabled,
    status,
    message,
    ...(boundedString(value.providerMode, MAX_EVIDENCE_STRING_CHARS)
      ? { providerMode: boundedString(value.providerMode, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.providerId, MAX_EVIDENCE_STRING_CHARS)
      ? { providerId: boundedString(value.providerId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.providerCapabilityId, MAX_EVIDENCE_STRING_CHARS)
      ? { providerCapabilityId: boundedString(value.providerCapabilityId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.packageName, MAX_EVIDENCE_STRING_CHARS)
      ? { packageName: boundedString(value.packageName, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.modelId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelId: boundedString(value.modelId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.modelProfileId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelProfileId: boundedString(value.modelProfileId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(dimensions !== undefined ? { dimensions } : {}),
    ...(boundedString(value.endpoint, MAX_SUMMARY_MESSAGE_CHARS)
      ? { endpoint: boundedString(value.endpoint, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
    ...(boundedString(value.runtimeId, MAX_EVIDENCE_STRING_CHARS)
      ? { runtimeId: boundedString(value.runtimeId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.runtimeStatus, MAX_EVIDENCE_STRING_CHARS)
      ? { runtimeStatus: boundedString(value.runtimeStatus, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(typeof value.running === "boolean" ? { running: value.running } : {}),
    ...(typeof value.autoStartProvider === "boolean" ? { autoStartProvider: value.autoStartProvider } : {}),
    ...(typeof value.preflightEnabled === "boolean" ? { preflightEnabled: value.preflightEnabled } : {}),
    ...(typeof value.sendDimensions === "boolean" ? { sendDimensions: value.sendDimensions } : {}),
    ...(nonNegativeInteger(value.maxInputChars) !== undefined ? { maxInputChars: nonNegativeInteger(value.maxInputChars) } : {}),
    ...(nonNegativeInteger(value.timeoutMs) !== undefined ? { timeoutMs: nonNegativeInteger(value.timeoutMs) } : {}),
    ...(agentMemoryEmbeddingReindexStatus(value.reindexStatus)
      ? { reindexStatus: agentMemoryEmbeddingReindexStatus(value.reindexStatus) }
      : {}),
    missingHints: boundedStringArray(value.missingHints, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
    ...(boundedString(value.lastError, MAX_SUMMARY_MESSAGE_CHARS)
      ? { lastError: boundedString(value.lastError, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
  };
}

function agentMemoryEmbeddingStatus(input: unknown): AgentMemoryStorageDiagnostics["embedding"]["status"] | undefined {
  return input === "disabled" ||
    input === "ready" ||
    input === "keyword_fallback" ||
    input === "starting" ||
    input === "unavailable" ||
    input === "error"
    ? input
    : undefined;
}

function agentMemoryEmbeddingReindexStatus(input: unknown): AgentMemoryStorageDiagnostics["embedding"]["reindexStatus"] | undefined {
  return input === "not_required" ||
    input === "pending" ||
    input === "partial" ||
    input === "complete" ||
    input === "error" ||
    input === "unknown"
    ? input
    : undefined;
}

function diagnosticAgentMemoryRuntimeSnapshotFromStorage(
  input: unknown,
): AgentMemoryStorageDiagnostics["runtimeSnapshots"][number] | undefined {
  const value = objectValue(input);
  const threadId = boundedString(value?.threadId, MAX_SUMMARY_MESSAGE_CHARS);
  const dataDir = boundedString(value?.dataDir, MAX_SUMMARY_MESSAGE_CHARS);
  const sessionKey = boundedString(value?.sessionKey, MAX_SUMMARY_MESSAGE_CHARS);
  if (!threadId || typeof value?.active !== "boolean" || !dataDir || !sessionKey) return undefined;
  const lastInitialize = diagnosticAgentMemoryOperationStatusFromStorage(value.lastInitialize);
  const lastEmbedding = diagnosticAgentMemoryOperationStatusFromStorage(value.lastEmbedding);
  const embedding = diagnosticAgentMemoryEmbeddingFromStorage(value.embedding);
  const lastRecall = diagnosticAgentMemoryOperationStatusFromStorage(value.lastRecall);
  const lastCapture = diagnosticAgentMemoryOperationStatusFromStorage(value.lastCapture);
  const lastSearch = diagnosticAgentMemoryOperationStatusFromStorage(value.lastSearch);
  const lastContextInjection = diagnosticAgentMemoryContextAccountingFromStorage(value.lastContextInjection);
  return {
    threadId,
    active: value.active,
    dataDir,
    sessionKey,
    ...(embedding ? { embedding } : {}),
    ...(lastInitialize ? { lastInitialize } : {}),
    ...(lastEmbedding ? { lastEmbedding } : {}),
    ...(lastRecall ? { lastRecall } : {}),
    ...(lastCapture ? { lastCapture } : {}),
    ...(lastSearch ? { lastSearch } : {}),
    ...(lastContextInjection ? { lastContextInjection } : {}),
  };
}

function diagnosticAgentMemoryNativePreflightFromStorage(input: unknown): AgentMemoryStorageDiagnostics["nativePreflight"] | undefined {
  const value = objectValue(input);
  if (!value || value.schemaVersion !== "ambient-agent-memory-native-preflight-v1") return undefined;
  const checkedAt = boundedString(value.checkedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const platform = boundedString(value.platform, MAX_EVIDENCE_STRING_CHARS);
  const arch = boundedString(value.arch, MAX_EVIDENCE_STRING_CHARS);
  const status = healthStatusValue(value.status);
  const message = boundedString(value.message, MAX_SUMMARY_MESSAGE_CHARS);
  if (!checkedAt || !platform || !arch || !status || !message || typeof value.coreModuleConfigured !== "boolean") return undefined;
  return {
    schemaVersion: "ambient-agent-memory-native-preflight-v1",
    checkedAt,
    platform,
    arch,
    ...(boundedString(value.nodeModuleVersion, MAX_EVIDENCE_STRING_CHARS)
      ? { nodeModuleVersion: boundedString(value.nodeModuleVersion, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    coreModuleConfigured: value.coreModuleConfigured,
    ...(boundedString(value.coreModuleSpecifier, MAX_EVIDENCE_STRING_CHARS)
      ? { coreModuleSpecifier: boundedString(value.coreModuleSpecifier, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    status,
    message,
    dependencies: arrayValue(value.dependencies)
      .flatMap((dependency) => {
        const parsed = diagnosticAgentMemoryNativePreflightDependencyFromStorage(dependency);
        return parsed ? [parsed] : [];
      })
      .slice(0, 12),
    errors: boundedStringArray(value.errors, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
  };
}

function diagnosticAgentMemoryNativePreflightDependencyFromStorage(
  input: unknown,
): NonNullable<AgentMemoryStorageDiagnostics["nativePreflight"]>["dependencies"][number] | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  const name = boundedString(value.name, MAX_EVIDENCE_STRING_CHARS);
  const status = healthStatusValue(value.status);
  const message = boundedString(value.message, MAX_SUMMARY_MESSAGE_CHARS);
  if (!name || typeof value.resolvable !== "boolean" || !status || !message) return undefined;
  return {
    name,
    ...(boundedString(value.expectedVersion, MAX_EVIDENCE_STRING_CHARS)
      ? { expectedVersion: boundedString(value.expectedVersion, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    resolvable: value.resolvable,
    ...(boundedString(value.version, MAX_EVIDENCE_STRING_CHARS)
      ? { version: boundedString(value.version, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.packageJsonPath, MAX_SUMMARY_MESSAGE_CHARS)
      ? { packageJsonPath: boundedString(value.packageJsonPath, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
    status,
    message,
  };
}

function diagnosticAgentMemoryContextAccountingFromStorage(
  input: unknown,
): NonNullable<AgentMemoryStorageDiagnostics["runtimeSnapshots"][number]["lastContextInjection"]> | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  const at = boundedString(value.at, MAX_SUMMARY_MESSAGE_CHARS);
  const messageCount = nonNegativeInteger(value.messageCount);
  const originalUserChars = nonNegativeInteger(value.originalUserChars);
  const recallContextChars = nonNegativeInteger(value.recallContextChars);
  const offloadContextChars = nonNegativeInteger(value.offloadContextChars);
  const totalInjectedChars = nonNegativeInteger(value.totalInjectedChars);
  const projectedUserMessageChars = nonNegativeInteger(value.projectedUserMessageChars);
  if (
    !at ||
    messageCount === undefined ||
    originalUserChars === undefined ||
    recallContextChars === undefined ||
    offloadContextChars === undefined ||
    totalInjectedChars === undefined ||
    projectedUserMessageChars === undefined ||
    typeof value.truncated !== "boolean"
  ) {
    return undefined;
  }
  return {
    at,
    messageCount,
    originalUserChars,
    recallContextChars,
    offloadContextChars,
    totalInjectedChars,
    projectedUserMessageChars,
    truncated: value.truncated,
  };
}

function diagnosticAgentMemoryOperationStatusFromStorage(
  input: unknown,
): NonNullable<AgentMemoryStorageDiagnostics["runtimeSnapshots"][number]["lastInitialize"]> | undefined {
  const value = objectValue(input);
  const status = agentMemoryOperationStatusKind(value?.status);
  const at = boundedString(value?.at, MAX_SUMMARY_MESSAGE_CHARS);
  if (!status || !at) return undefined;
  const total = nonNegativeInteger(value?.total);
  return {
    status,
    at,
    ...(boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS)
      ? { message: boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
    ...(boundedString(value?.moduleSpecifier, MAX_EVIDENCE_STRING_CHARS)
      ? { moduleSpecifier: boundedString(value?.moduleSpecifier, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(total !== undefined ? { total } : {}),
    ...(boundedString(value?.strategy, MAX_EVIDENCE_STRING_CHARS)
      ? { strategy: boundedString(value?.strategy, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS)
      ? { providerId: boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelId: boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS)
      ? { modelProfileId: boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(nonNegativeInteger(value?.dimensions) !== undefined ? { dimensions: nonNegativeInteger(value?.dimensions) } : {}),
    ...(boundedString(value?.endpoint, MAX_SUMMARY_MESSAGE_CHARS)
      ? { endpoint: boundedString(value?.endpoint, MAX_SUMMARY_MESSAGE_CHARS) }
      : {}),
  };
}
