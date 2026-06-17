import type {
  AgentMemoryStorageDiagnostics,
  AmbientFeatureFlagSnapshot,
  DiagnosticExportHealthStatus,
  DiagnosticExportLocalRuntimeEvidence,
  DiagnosticExportLocalRuntimeSummary,
  DiagnosticExportResult,
  DiagnosticExportSubagentCompletionGuardSummary,
  DiagnosticExportSubagentLifecycleSummary,
  DiagnosticExportSubagentReplayEvidence,
  DiagnosticExportSubagentReplayParentMailboxItem,
  DiagnosticExportSubagentReplaySummary,
  DiagnosticExportSubagentReplayTimelineItem,
  DiagnosticExportSubagentReplayTranscriptItem,
  SubagentRepairIssueKind,
} from "../../shared/types";
import {
  AMBIENT_SLASH_COMMANDS_FEATURE_FLAG,
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG,
  type AmbientFeatureFlagId,
} from "../../shared/featureFlags";

export const DIAGNOSTIC_EXPORT_HISTORY_STORAGE_KEY = "ambient.diagnosticExportHistory.v1";

const DIAGNOSTIC_EXPORT_HISTORY_STORAGE_SCHEMA_VERSION = "ambient-diagnostic-export-history-v1";
const MAX_SUMMARY_MESSAGE_CHARS = 1_000;
const MAX_EVIDENCE_STRING_CHARS = 500;
const MAX_ERROR_MESSAGES = 8;
const MAX_REPLAY_ROWS = 240;
const MAX_RESTART_REPAIR_IDS = 120;
const MAX_LOCAL_RUNTIME_EVIDENCE_ROWS = 240;
const MAX_LOCAL_RUNTIME_EVIDENCE_IDS = 120;

const SUBAGENT_REPAIR_ISSUE_KINDS = new Set<SubagentRepairIssueKind>([
  "missing_parent_thread",
  "missing_child_thread",
  "orphan_child_thread",
  "thread_run_mismatch",
  "active_run_interrupted",
  "missing_lifecycle_start",
  "missing_lifecycle_stop",
  "missing_feature_flag_snapshot",
  "subagent_feature_flag_disabled",
  "missing_model_runtime_snapshot",
  "model_runtime_snapshot_mismatch",
  "missing_capacity_lease",
  "capacity_lease_mismatch",
  "missing_prompt_snapshot",
  "prompt_snapshot_mismatch",
  "missing_tool_scope_snapshot",
  "tool_scope_snapshot_mismatch",
  "missing_result_artifact",
  "invalid_result_artifact",
  "result_artifact_mismatch",
  "missing_spawn_edge",
  "dangling_spawn_edge",
  "spawn_edge_mismatch",
  "dangling_wait_barrier_child",
  "parent_cancel_control_unreconciled",
]);

export interface DiagnosticExportHistoryModel {
  summary: string;
  rows: DiagnosticExportHistoryRowModel[];
  searchText: string;
}

export interface DiagnosticExportHistoryRowModel {
  id: string;
  label: string;
  detail: string;
  replayStatus: string;
  replayTone: "success" | "warning" | "danger" | "neutral";
  localRuntimeStatus: string;
  localRuntimeTone: "success" | "warning" | "danger" | "neutral";
  selected: boolean;
  path: string;
  searchText: string;
}

export interface DiagnosticExportHistoryStorageState {
  history: DiagnosticExportResult[];
  selectedId?: string;
}

export function diagnosticExportHistoryEntryId(result: DiagnosticExportResult): string {
  return `${result.path}\u0000${result.createdAt}`;
}

export function recordDiagnosticExportHistory(
  history: DiagnosticExportResult[],
  result: DiagnosticExportResult,
  limit = 5,
): DiagnosticExportResult[] {
  const id = diagnosticExportHistoryEntryId(result);
  const deduped = history.filter((entry) => diagnosticExportHistoryEntryId(entry) !== id);
  return [result, ...deduped].slice(0, Math.max(1, limit));
}

export function selectedDiagnosticExportFromHistory(
  history: DiagnosticExportResult[],
  selectedId: string | undefined,
): DiagnosticExportResult | undefined {
  return history.find((entry) => diagnosticExportHistoryEntryId(entry) === selectedId) ?? history[0];
}

export function diagnosticExportHistoryModel(
  history: DiagnosticExportResult[],
  selectedId: string | undefined,
): DiagnosticExportHistoryModel | undefined {
  if (!history.length) return undefined;
  const selected = selectedDiagnosticExportFromHistory(history, selectedId);
  const selectedEntryId = selected ? diagnosticExportHistoryEntryId(selected) : undefined;
  const rows = history.map((entry) => diagnosticExportHistoryRow(entry, selectedEntryId));
  return {
    summary: `${history.length} diagnostic bundle${history.length === 1 ? "" : "s"} available`,
    rows,
    searchText: rows.map((row) => row.searchText).join(" "),
  };
}

export function encodeDiagnosticExportHistoryStorage(state: DiagnosticExportHistoryStorageState): string {
  const history = persistableDiagnosticExportHistory(state.history);
  const selectedId = state.selectedId && history.some((entry) => diagnosticExportHistoryEntryId(entry) === state.selectedId)
    ? state.selectedId
    : history[0] ? diagnosticExportHistoryEntryId(history[0]) : undefined;
  return `${JSON.stringify({
    schemaVersion: DIAGNOSTIC_EXPORT_HISTORY_STORAGE_SCHEMA_VERSION,
    history,
    ...(selectedId ? { selectedId } : {}),
  })}\n`;
}

export function decodeDiagnosticExportHistoryStorage(raw: string | null | undefined): DiagnosticExportHistoryStorageState {
  if (!raw) return { history: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const payload = objectValue(parsed);
    if (payload?.schemaVersion !== DIAGNOSTIC_EXPORT_HISTORY_STORAGE_SCHEMA_VERSION) return { history: [] };
    const history = persistableDiagnosticExportHistory(arrayValue(payload.history).flatMap((entry) => {
      const result = diagnosticExportResultFromStorage(entry);
      return result ? [result] : [];
    }));
    const selectedId = typeof payload.selectedId === "string" && history.some((entry) => diagnosticExportHistoryEntryId(entry) === payload.selectedId)
      ? payload.selectedId
      : history[0] ? diagnosticExportHistoryEntryId(history[0]) : undefined;
    return { history, ...(selectedId ? { selectedId } : {}) };
  } catch {
    return { history: [] };
  }
}

function persistableDiagnosticExportHistory(history: DiagnosticExportResult[], limit = 5): DiagnosticExportResult[] {
  return history.flatMap((entry) => {
    const result = diagnosticExportResultFromStorage(entry);
    return result ? [result] : [];
  }).slice(0, Math.max(1, limit));
}

function diagnosticExportResultFromStorage(input: unknown): DiagnosticExportResult | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  const path = typeof value.path === "string" ? value.path : undefined;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : undefined;
  const bytes = finiteNonNegativeNumber(value.bytes);
  if (!path || !createdAt || typeof bytes !== "number") return undefined;

  const replaySummary = diagnosticReplaySummaryFromStorage(objectValue(objectValue(value.summary)?.subagents)?.replayEvidence);
  const localRuntimeSummary = diagnosticLocalRuntimeSummaryFromStorage(objectValue(value.summary)?.localRuntimes);
  const agentMemory = diagnosticAgentMemoryFromStorage(objectValue(value.summary)?.agentMemory);
  const featureFlags = diagnosticFeatureFlagSnapshotFromStorage(objectValue(value.summary)?.featureFlags);
  const replayEvidence = diagnosticReplayEvidenceFromStorage(objectValue(objectValue(value.subagents)?.replayEvidence));
  const localRuntimeEvidence = diagnosticLocalRuntimeEvidenceFromStorage(objectValue(objectValue(value.localRuntimes)?.evidence));
  const summary = replaySummary || localRuntimeSummary || agentMemory || featureFlags
    ? {
        ...(featureFlags ? { featureFlags } : {}),
        ...(agentMemory ? { agentMemory } : {}),
        subagents: {
          ...(replaySummary ? { replayEvidence: replaySummary } : {}),
        },
        ...(localRuntimeSummary ? { localRuntimes: localRuntimeSummary } : {}),
      } as unknown as DiagnosticExportResult["summary"]
    : undefined;
  return {
    path,
    bytes,
    createdAt,
    ...(summary ? { summary } : {}),
    ...(replayEvidence
      ? {
          subagents: {
            replayEvidence,
          },
        }
      : {}),
    ...(localRuntimeEvidence
      ? {
          localRuntimes: {
            evidence: localRuntimeEvidence,
          },
        }
      : {}),
  };
}

function diagnosticFeatureFlagSnapshotFromStorage(input: unknown): AmbientFeatureFlagSnapshot | undefined {
  const value = objectValue(input);
  const flags = objectValue(value?.flags);
  const schemaVersion = value?.schemaVersion === "ambient-feature-flags-v1" ? value.schemaVersion : undefined;
  const generatedAt = boundedString(value?.generatedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const subagents = diagnosticFeatureFlagResolutionFromStorage(
    flags?.[AMBIENT_SUBAGENTS_FEATURE_FLAG],
    AMBIENT_SUBAGENTS_FEATURE_FLAG,
  );
  if (!schemaVersion || !generatedAt || !subagents) return undefined;
  return {
    schemaVersion,
    generatedAt,
    flags: {
      [AMBIENT_SUBAGENTS_FEATURE_FLAG]: subagents,
      [AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG]: diagnosticFeatureFlagResolutionFromStorage(
        flags?.[AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG],
        AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG,
      ) ?? defaultDiagnosticFeatureFlagResolution(AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG),
      [AMBIENT_SLASH_COMMANDS_FEATURE_FLAG]: diagnosticFeatureFlagResolutionFromStorage(
        flags?.[AMBIENT_SLASH_COMMANDS_FEATURE_FLAG],
        AMBIENT_SLASH_COMMANDS_FEATURE_FLAG,
      ) ?? defaultDiagnosticFeatureFlagResolution(AMBIENT_SLASH_COMMANDS_FEATURE_FLAG),
    },
  };
}

function diagnosticFeatureFlagResolutionFromStorage(
  input: unknown,
  id: AmbientFeatureFlagId,
): AmbientFeatureFlagSnapshot["flags"][AmbientFeatureFlagId] | undefined {
  const flag = objectValue(input);
  const enabled = typeof flag?.enabled === "boolean" ? flag.enabled : undefined;
  const source = featureFlagSourceValue(flag?.source);
  const defaultEnabled = typeof flag?.defaultEnabled === "boolean" ? flag.defaultEnabled : undefined;
  if (enabled === undefined || !source || defaultEnabled === undefined) return undefined;
  return {
    id,
    enabled,
    source,
    defaultEnabled,
    ...(typeof flag?.settingsEnabled === "boolean" ? { settingsEnabled: flag.settingsEnabled } : {}),
  };
}

function defaultDiagnosticFeatureFlagResolution(
  id: AmbientFeatureFlagId,
): AmbientFeatureFlagSnapshot["flags"][AmbientFeatureFlagId] {
  return {
    id,
    enabled: false,
    source: "default",
    defaultEnabled: false,
  };
}

function diagnosticLocalRuntimeSummaryFromStorage(input: unknown): DiagnosticExportLocalRuntimeSummary | undefined {
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
    !status || !message || runtimeCount === undefined || runningCount === undefined ||
    activeLeaseCount === undefined || stopBlockedCount === undefined || restartBlockedCount === undefined ||
    untrackedCount === undefined || staleLeaseCount === undefined || releasedLeaseCount === undefined ||
    crashedLeaseCount === undefined || activeEstimatedResidentMemoryBytes === undefined
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
    ...(boundedString(value?.memoryPolicyOutcome, MAX_EVIDENCE_STRING_CHARS) ? { memoryPolicyOutcome: boundedString(value?.memoryPolicyOutcome, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.memoryPolicyReason, MAX_SUMMARY_MESSAGE_CHARS) ? { memoryPolicyReason: boundedString(value?.memoryPolicyReason, MAX_SUMMARY_MESSAGE_CHARS) } : {}),
    errorMessages: boundedStringArray(value?.errorMessages, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
  };
}

function diagnosticAgentMemoryFromStorage(input: unknown): AgentMemoryStorageDiagnostics | undefined {
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
    value.adapter !== "tencentdb" || value.storageScope !== "workspace" || !status || !checkedAt || !message ||
    typeof value.featureEnabled !== "boolean" || typeof value.settingsEnabled !== "boolean" ||
    typeof value.defaultThreadEnabled !== "boolean" || activeThreadCount === undefined ||
    threadEnabledCount === undefined || !dataDir || typeof value.dataDirExists !== "boolean" ||
    !storageSchemaStatus || !storageSchemaPath || !storageSchemaExpectedVersion || !storageSchemaMessage ||
    fileCount === undefined || totalBytes === undefined || topLevelEntryCount === undefined ||
    value.rawContentIncluded !== false || !embedding
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
    runtimeSnapshots: arrayValue(value.runtimeSnapshots).flatMap((snapshot) => {
      const parsed = diagnosticAgentMemoryRuntimeSnapshotFromStorage(snapshot);
      return parsed ? [parsed] : [];
    }).slice(0, 50),
    errors: boundedStringArray(value.errors, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
  };
}

function agentMemoryStorageSchemaStatus(input: unknown): AgentMemoryStorageDiagnostics["storageSchemaStatus"] | undefined {
  return input === "missing" || input === "current" || input === "unsupported" ? input : undefined;
}

function diagnosticAgentMemoryEmbeddingFromStorage(
  input: unknown,
): AgentMemoryStorageDiagnostics["embedding"] | undefined {
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
    ...(boundedString(value.providerMode, MAX_EVIDENCE_STRING_CHARS) ? { providerMode: boundedString(value.providerMode, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.providerId, MAX_EVIDENCE_STRING_CHARS) ? { providerId: boundedString(value.providerId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.providerCapabilityId, MAX_EVIDENCE_STRING_CHARS) ? { providerCapabilityId: boundedString(value.providerCapabilityId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.packageName, MAX_EVIDENCE_STRING_CHARS) ? { packageName: boundedString(value.packageName, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.modelId, MAX_EVIDENCE_STRING_CHARS) ? { modelId: boundedString(value.modelId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.modelProfileId, MAX_EVIDENCE_STRING_CHARS) ? { modelProfileId: boundedString(value.modelProfileId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(dimensions !== undefined ? { dimensions } : {}),
    ...(boundedString(value.endpoint, MAX_SUMMARY_MESSAGE_CHARS) ? { endpoint: boundedString(value.endpoint, MAX_SUMMARY_MESSAGE_CHARS) } : {}),
    ...(boundedString(value.runtimeId, MAX_EVIDENCE_STRING_CHARS) ? { runtimeId: boundedString(value.runtimeId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.runtimeStatus, MAX_EVIDENCE_STRING_CHARS) ? { runtimeStatus: boundedString(value.runtimeStatus, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(typeof value.running === "boolean" ? { running: value.running } : {}),
    ...(typeof value.autoStartProvider === "boolean" ? { autoStartProvider: value.autoStartProvider } : {}),
    ...(typeof value.preflightEnabled === "boolean" ? { preflightEnabled: value.preflightEnabled } : {}),
    ...(typeof value.sendDimensions === "boolean" ? { sendDimensions: value.sendDimensions } : {}),
    ...(nonNegativeInteger(value.maxInputChars) !== undefined ? { maxInputChars: nonNegativeInteger(value.maxInputChars) } : {}),
    ...(nonNegativeInteger(value.timeoutMs) !== undefined ? { timeoutMs: nonNegativeInteger(value.timeoutMs) } : {}),
    ...(agentMemoryEmbeddingReindexStatus(value.reindexStatus) ? { reindexStatus: agentMemoryEmbeddingReindexStatus(value.reindexStatus) } : {}),
    missingHints: boundedStringArray(value.missingHints, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
    ...(boundedString(value.lastError, MAX_SUMMARY_MESSAGE_CHARS) ? { lastError: boundedString(value.lastError, MAX_SUMMARY_MESSAGE_CHARS) } : {}),
  };
}

function agentMemoryEmbeddingStatus(input: unknown): AgentMemoryStorageDiagnostics["embedding"]["status"] | undefined {
  return input === "disabled" || input === "ready" || input === "keyword_fallback" || input === "starting" || input === "unavailable" || input === "error"
    ? input
    : undefined;
}

function agentMemoryEmbeddingReindexStatus(input: unknown): AgentMemoryStorageDiagnostics["embedding"]["reindexStatus"] | undefined {
  return input === "not_required" || input === "pending" || input === "partial" || input === "complete" || input === "error" || input === "unknown"
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

function diagnosticAgentMemoryNativePreflightFromStorage(
  input: unknown,
): AgentMemoryStorageDiagnostics["nativePreflight"] | undefined {
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
    ...(boundedString(value.nodeModuleVersion, MAX_EVIDENCE_STRING_CHARS) ? { nodeModuleVersion: boundedString(value.nodeModuleVersion, MAX_EVIDENCE_STRING_CHARS) } : {}),
    coreModuleConfigured: value.coreModuleConfigured,
    ...(boundedString(value.coreModuleSpecifier, MAX_EVIDENCE_STRING_CHARS) ? { coreModuleSpecifier: boundedString(value.coreModuleSpecifier, MAX_EVIDENCE_STRING_CHARS) } : {}),
    status,
    message,
    dependencies: arrayValue(value.dependencies).flatMap((dependency) => {
      const parsed = diagnosticAgentMemoryNativePreflightDependencyFromStorage(dependency);
      return parsed ? [parsed] : [];
    }).slice(0, 12),
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
    ...(boundedString(value.expectedVersion, MAX_EVIDENCE_STRING_CHARS) ? { expectedVersion: boundedString(value.expectedVersion, MAX_EVIDENCE_STRING_CHARS) } : {}),
    resolvable: value.resolvable,
    ...(boundedString(value.version, MAX_EVIDENCE_STRING_CHARS) ? { version: boundedString(value.version, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.packageJsonPath, MAX_SUMMARY_MESSAGE_CHARS) ? { packageJsonPath: boundedString(value.packageJsonPath, MAX_SUMMARY_MESSAGE_CHARS) } : {}),
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
    !at || messageCount === undefined || originalUserChars === undefined || recallContextChars === undefined ||
    offloadContextChars === undefined || totalInjectedChars === undefined || projectedUserMessageChars === undefined ||
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
    ...(boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS) ? { message: boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS) } : {}),
    ...(boundedString(value?.moduleSpecifier, MAX_EVIDENCE_STRING_CHARS) ? { moduleSpecifier: boundedString(value?.moduleSpecifier, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(boundedString(value?.strategy, MAX_EVIDENCE_STRING_CHARS) ? { strategy: boundedString(value?.strategy, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) ? { providerId: boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) ? { modelId: boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) ? { modelProfileId: boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(nonNegativeInteger(value?.dimensions) !== undefined ? { dimensions: nonNegativeInteger(value?.dimensions) } : {}),
    ...(boundedString(value?.endpoint, MAX_SUMMARY_MESSAGE_CHARS) ? { endpoint: boundedString(value?.endpoint, MAX_SUMMARY_MESSAGE_CHARS) } : {}),
  };
}

function diagnosticLocalRuntimeEvidenceFromStorage(input: unknown): DiagnosticExportLocalRuntimeEvidence | undefined {
  const value = objectValue(input);
  if (
    value?.schemaVersion !== "ambient-local-runtime-diagnostic-evidence-v1" ||
    value.source !== "diagnostic_export"
  ) {
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
    runtimes: arrayValue(value.runtimes).flatMap((item) => {
      const parsed = diagnosticLocalRuntimeEvidenceRuntimeFromStorage(item);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
    activeOwners: arrayValue(value.activeOwners).flatMap((item) => {
      const parsed = diagnosticLocalRuntimeEvidenceOwnerFromStorage(item);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
    blockedActions: arrayValue(value.blockedActions).flatMap((item) => {
      const parsed = diagnosticLocalRuntimeEvidenceBlockedActionFromStorage(item);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
    nextSafeActions: arrayValue(value.nextSafeActions).flatMap((item) => {
      const parsed = diagnosticLocalRuntimeEvidenceNextSafeActionFromStorage(item);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
    memoryEvidence,
  };
}

function diagnosticLocalRuntimeEvidenceCountsFromStorage(
  input: unknown,
): DiagnosticExportLocalRuntimeEvidence["counts"] | undefined {
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
    sequence === undefined || !runtimeEntryId || !capability || !trackingStatus || running === undefined ||
    ordinaryStopAllowed === undefined || ordinaryRestartAllowed === undefined || !stopReason || !restartReason ||
    forceStopAllowed === undefined || forceRestartAllowed === undefined ||
    forceStopRequiresSubagentCancellation === undefined || forceRestartRequiresSubagentCancellation === undefined ||
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
    ...(boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) ? { providerId: boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.modelRuntimeId, MAX_EVIDENCE_STRING_CHARS) ? { modelRuntimeId: boundedString(value?.modelRuntimeId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) ? { modelProfileId: boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) ? { modelId: boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(pid !== undefined ? { pid } : {}),
    ...(boundedString(value?.endpoint, MAX_EVIDENCE_STRING_CHARS) ? { endpoint: boundedString(value?.endpoint, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes } : {}),
    ...(actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes } : {}),
    ...(boundedString(value?.memorySampledAt, MAX_EVIDENCE_STRING_CHARS) ? { memorySampledAt: boundedString(value?.memorySampledAt, MAX_EVIDENCE_STRING_CHARS) } : {}),
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
  if (sequence === undefined || !runtimeEntryId || !leaseId || !displayName || !status || !capabilityKind || !acquiredAt || !lastHeartbeatAt) {
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
    ...(boundedString(value?.parentThreadId, MAX_EVIDENCE_STRING_CHARS) ? { parentThreadId: boundedString(value?.parentThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.subagentThreadId, MAX_EVIDENCE_STRING_CHARS) ? { subagentThreadId: boundedString(value?.subagentThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.subagentRunId, MAX_EVIDENCE_STRING_CHARS) ? { subagentRunId: boundedString(value?.subagentRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    capabilityKind,
    ...(boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) ? { providerId: boundedString(value?.providerId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.modelRuntimeId, MAX_EVIDENCE_STRING_CHARS) ? { modelRuntimeId: boundedString(value?.modelRuntimeId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) ? { modelProfileId: boundedString(value?.modelProfileId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) ? { modelId: boundedString(value?.modelId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes } : {}),
    ...(actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes } : {}),
    ...(pid !== undefined ? { pid } : {}),
    ...(boundedString(value?.endpoint, MAX_EVIDENCE_STRING_CHARS) ? { endpoint: boundedString(value?.endpoint, MAX_EVIDENCE_STRING_CHARS) } : {}),
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
  const forceRequiresSubagentCancellation = typeof value?.forceRequiresSubagentCancellation === "boolean"
    ? value.forceRequiresSubagentCancellation
    : undefined;
  const untracked = typeof value?.untracked === "boolean" ? value.untracked : undefined;
  if (sequence === undefined || !runtimeEntryId || !action || !reason || forceAllowed === undefined || forceRequiresSubagentCancellation === undefined || untracked === undefined) {
    return undefined;
  }
  return {
    sequence,
    runtimeEntryId,
    action,
    reason,
    blockerLeaseIds: boundedStringArray(value?.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    affectedSubagentLabels: boundedStringArray(value?.affectedSubagentLabels, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
    affectedSubagentThreadIds: boundedStringArray(value?.affectedSubagentThreadIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS),
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
    ...(boundedString(value?.runtimeEntryId, MAX_EVIDENCE_STRING_CHARS) ? { runtimeEntryId: boundedString(value?.runtimeEntryId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.runtimeId, MAX_EVIDENCE_STRING_CHARS) ? { runtimeId: boundedString(value?.runtimeId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(capability ? { capability } : {}),
    ...(toolName ? { toolName } : {}),
    ...(boundedStringArray(value?.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS).length
      ? { blockerLeaseIds: boundedStringArray(value?.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedStringArray(value?.affectedSubagentLabels, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS).length
      ? { affectedSubagentLabels: boundedStringArray(value?.affectedSubagentLabels, MAX_LOCAL_RUNTIME_EVIDENCE_IDS, MAX_EVIDENCE_STRING_CHARS) }
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

function diagnosticReplaySummaryFromStorage(input: unknown): DiagnosticExportSubagentReplaySummary | undefined {
  const value = objectValue(input);
  const status = healthStatusValue(value?.status);
  const message = boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS);
  const runCount = nonNegativeInteger(value?.runCount);
  const childThreadCount = nonNegativeInteger(value?.childThreadCount);
  const persistedRunEventCount = nonNegativeInteger(value?.persistedRunEventCount);
  const runtimeEventCount = nonNegativeInteger(value?.runtimeEventCount);
  const parentMailboxEventCount = nonNegativeInteger(value?.parentMailboxEventCount);
  const transcriptMessageCount = nonNegativeInteger(value?.transcriptMessageCount);
  const callableWorkflowTaskCount = nonNegativeInteger(value?.callableWorkflowTaskCount) ?? 0;
  const truncated = typeof value?.truncated === "boolean" ? value.truncated : undefined;
  if (
    !status || !message || runCount === undefined || childThreadCount === undefined ||
    persistedRunEventCount === undefined || runtimeEventCount === undefined ||
    parentMailboxEventCount === undefined || transcriptMessageCount === undefined || truncated === undefined
  ) {
    return undefined;
  }
  return {
    status,
    message,
    runCount,
    childThreadCount,
    persistedRunEventCount,
    runtimeEventCount,
    parentMailboxEventCount,
    transcriptMessageCount,
    callableWorkflowTaskCount,
    truncated,
    errorMessages: boundedStringArray(value?.errorMessages, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
  };
}

function diagnosticReplayEvidenceFromStorage(input: unknown): DiagnosticExportSubagentReplayEvidence | undefined {
  const value = objectValue(input);
  if (
    value?.schemaVersion !== "ambient-subagent-replay-evidence-v1" ||
    value.source !== "diagnostic_export" ||
    value.liveTokens !== false
  ) {
    return undefined;
  }
  const createdAt = boundedString(value.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const truncated = typeof value.truncated === "boolean" ? value.truncated : undefined;
  const counts = diagnosticReplayCountsFromStorage(value.counts);
  const shownCounts = diagnosticReplayCountsFromStorage(value.shownCounts);
  const restartRepair = diagnosticReplayRestartRepairFromStorage(value.restartRepair);
  if (!createdAt || truncated === undefined || !counts || !shownCounts || !restartRepair) return undefined;
  return {
    schemaVersion: "ambient-subagent-replay-evidence-v1",
    source: "diagnostic_export",
    createdAt,
    liveTokens: false,
    truncated,
    counts,
    shownCounts,
    childThreads: arrayValue(value.childThreads).flatMap((thread) => {
      const parsed = diagnosticReplayChildThreadFromStorage(thread);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_REPLAY_ROWS),
    runtimeEventTimeline: arrayValue(value.runtimeEventTimeline).flatMap((event) => {
      const parsed = diagnosticReplayTimelineItemFromStorage(event);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_REPLAY_ROWS),
    persistedRunEventTimeline: arrayValue(value.persistedRunEventTimeline).flatMap((event) => {
      const parsed = diagnosticReplayTimelineItemFromStorage(event);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_REPLAY_ROWS),
    parentMailboxTimeline: arrayValue(value.parentMailboxTimeline).flatMap((event) => {
      const parsed = diagnosticReplayParentMailboxItemFromStorage(event);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_REPLAY_ROWS),
    transcriptTimeline: arrayValue(value.transcriptTimeline).flatMap((item) => {
      const parsed = diagnosticReplayTranscriptItemFromStorage(item);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_REPLAY_ROWS),
    callableWorkflowTaskTimeline: arrayValue(value.callableWorkflowTaskTimeline).flatMap((item) => {
      const parsed = diagnosticReplayCallableWorkflowTaskFromStorage(item);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_REPLAY_ROWS),
    restartRepair,
  };
}

function diagnosticReplayCountsFromStorage(input: unknown): DiagnosticExportSubagentReplayEvidence["counts"] | undefined {
  const value = objectValue(input);
  const runs = nonNegativeInteger(value?.runs);
  const childThreads = nonNegativeInteger(value?.childThreads);
  const persistedRunEvents = nonNegativeInteger(value?.persistedRunEvents);
  const runtimeEvents = nonNegativeInteger(value?.runtimeEvents);
  const parentMailboxEvents = nonNegativeInteger(value?.parentMailboxEvents);
  const transcriptMessages = nonNegativeInteger(value?.transcriptMessages);
  const callableWorkflowTasks = nonNegativeInteger(value?.callableWorkflowTasks) ?? 0;
  if (
    runs === undefined || childThreads === undefined || persistedRunEvents === undefined ||
    runtimeEvents === undefined || parentMailboxEvents === undefined || transcriptMessages === undefined
  ) {
    return undefined;
  }
  return { runs, childThreads, persistedRunEvents, runtimeEvents, parentMailboxEvents, transcriptMessages, callableWorkflowTasks };
}

function diagnosticReplayChildThreadFromStorage(
  input: unknown,
): DiagnosticExportSubagentReplayEvidence["childThreads"][number] | undefined {
  const value = objectValue(input);
  const threadId = boundedString(value?.threadId, MAX_SUMMARY_MESSAGE_CHARS);
  if (!threadId) return undefined;
  return {
    threadId,
    ...(boundedString(value?.runId, MAX_EVIDENCE_STRING_CHARS) ? { runId: boundedString(value?.runId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.parentThreadId, MAX_EVIDENCE_STRING_CHARS) ? { parentThreadId: boundedString(value?.parentThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.parentRunId, MAX_EVIDENCE_STRING_CHARS) ? { parentRunId: boundedString(value?.parentRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) ? { canonicalTaskPath: boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(typeof value?.collapsedByDefault === "boolean" ? { collapsedByDefault: value.collapsedByDefault } : {}),
    ...(boundedString(value?.status, MAX_EVIDENCE_STRING_CHARS) ? { status: boundedString(value?.status, MAX_EVIDENCE_STRING_CHARS) } : {}),
  };
}

function diagnosticReplayTimelineItemFromStorage(input: unknown): DiagnosticExportSubagentReplayTimelineItem | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const createdAt = boundedString(value?.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const runId = boundedString(value?.runId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentRunId = boundedString(value?.parentRunId, MAX_SUMMARY_MESSAGE_CHARS);
  const childThreadId = boundedString(value?.childThreadId, MAX_SUMMARY_MESSAGE_CHARS);
  const type = boundedString(value?.type, MAX_SUMMARY_MESSAGE_CHARS);
  if (sequence === undefined || !createdAt || !runId || !parentRunId || !childThreadId || !type) return undefined;
  return {
    sequence,
    createdAt,
    runId,
    parentRunId,
    childThreadId,
    type,
    ...(boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) ? { canonicalTaskPath: boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.roleId, MAX_EVIDENCE_STRING_CHARS) ? { roleId: boundedString(value?.roleId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.source, MAX_EVIDENCE_STRING_CHARS) ? { source: boundedString(value?.source, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.status, MAX_EVIDENCE_STRING_CHARS) ? { status: boundedString(value?.status, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.toolName, MAX_EVIDENCE_STRING_CHARS) ? { toolName: boundedString(value?.toolName, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.textPreview, MAX_EVIDENCE_STRING_CHARS) ? { textPreview: boundedString(value?.textPreview, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.messagePreview, MAX_EVIDENCE_STRING_CHARS) ? { messagePreview: boundedString(value?.messagePreview, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.artifactPath, MAX_EVIDENCE_STRING_CHARS) ? { artifactPath: boundedString(value?.artifactPath, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.approvalId, MAX_EVIDENCE_STRING_CHARS) ? { approvalId: boundedString(value?.approvalId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.approvalSource, MAX_EVIDENCE_STRING_CHARS) ? { approvalSource: boundedString(value?.approvalSource, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(typeof value?.worktreeIsolated === "boolean" ? { worktreeIsolated: value.worktreeIsolated } : {}),
    ...(boundedString(value?.worktreePath, MAX_EVIDENCE_STRING_CHARS) ? { worktreePath: boundedString(value?.worktreePath, MAX_EVIDENCE_STRING_CHARS) } : {}),
  };
}

function diagnosticReplayParentMailboxItemFromStorage(input: unknown): DiagnosticExportSubagentReplayParentMailboxItem | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const id = boundedString(value?.id, MAX_SUMMARY_MESSAGE_CHARS);
  const createdAt = boundedString(value?.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const updatedAt = boundedString(value?.updatedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const parentThreadId = boundedString(value?.parentThreadId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentRunId = boundedString(value?.parentRunId, MAX_SUMMARY_MESSAGE_CHARS);
  const type = boundedString(value?.type, MAX_SUMMARY_MESSAGE_CHARS);
  const deliveryState = subagentMailboxDeliveryState(value?.deliveryState);
  if (sequence === undefined || !id || !createdAt || !updatedAt || !parentThreadId || !parentRunId || !type || !deliveryState) {
    return undefined;
  }
  const deniedCategoryIds = boundedStringArray(value?.deniedCategoryIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const deniedToolIds = boundedStringArray(value?.deniedToolIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const deniedCategoryLabels = boundedStringArray(value?.deniedCategoryLabels, 80, MAX_EVIDENCE_STRING_CHARS);
  const deniedToolLabels = boundedStringArray(value?.deniedToolLabels, 80, MAX_EVIDENCE_STRING_CHARS);
  const childThreadIds = boundedStringArray(value?.childThreadIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const canonicalTaskPaths = boundedStringArray(value?.canonicalTaskPaths, 80, MAX_EVIDENCE_STRING_CHARS);
  const childSourceLabels = boundedStringArray(value?.childSourceLabels, 80, MAX_EVIDENCE_STRING_CHARS);
  const completionGuardSummary = diagnosticReplayCompletionGuardSummaryFromStorage(value?.completionGuardSummary);
  const lifecycleSummary = diagnosticReplayLifecycleSummaryFromStorage(value?.lifecycleSummary);
  return {
    sequence,
    id,
    createdAt,
    updatedAt,
    parentThreadId,
    parentRunId,
    type,
    deliveryState,
    childRunIds: boundedStringArray(value?.childRunIds, 80, MAX_EVIDENCE_STRING_CHARS),
    ...(childThreadIds.length ? { childThreadIds } : {}),
    ...(canonicalTaskPaths.length ? { canonicalTaskPaths } : {}),
    ...(childSourceLabels.length ? { childSourceLabels } : {}),
    ...(boundedString(value?.parentMessageId, MAX_EVIDENCE_STRING_CHARS) ? { parentMessageId: boundedString(value?.parentMessageId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.idempotencyKey, MAX_EVIDENCE_STRING_CHARS) ? { idempotencyKey: boundedString(value?.idempotencyKey, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.payloadPreview, MAX_EVIDENCE_STRING_CHARS) ? { payloadPreview: boundedString(value?.payloadPreview, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.failureStage, MAX_EVIDENCE_STRING_CHARS) ? { failureStage: boundedString(value?.failureStage, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.approvalMode, MAX_EVIDENCE_STRING_CHARS) ? { approvalMode: boundedString(value?.approvalMode, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(typeof value?.approvalUnavailable === "boolean" ? { approvalUnavailable: value.approvalUnavailable } : {}),
    ...(deniedCategoryIds.length ? { deniedCategoryIds } : {}),
    ...(deniedToolIds.length ? { deniedToolIds } : {}),
    ...(deniedCategoryLabels.length ? { deniedCategoryLabels } : {}),
    ...(deniedToolLabels.length ? { deniedToolLabels } : {}),
    ...(completionGuardSummary ? { completionGuardSummary } : {}),
    ...(lifecycleSummary ? { lifecycleSummary } : {}),
  };
}

function diagnosticReplayCompletionGuardSummaryFromStorage(
  input: unknown,
): DiagnosticExportSubagentCompletionGuardSummary | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  const summary: DiagnosticExportSubagentCompletionGuardSummary = {
    ...(typeof value.valid === "boolean" ? { valid: value.valid } : {}),
    ...(typeof value.synthesisAllowed === "boolean" ? { synthesisAllowed: value.synthesisAllowed } : {}),
    ...(typeof value.required === "boolean" ? { required: value.required } : {}),
    ...(nonNegativeInteger(value.structuredEvidenceCount) !== undefined ? { structuredEvidenceCount: nonNegativeInteger(value.structuredEvidenceCount) } : {}),
    ...(nonNegativeInteger(value.ambientEvidenceCount) !== undefined ? { ambientEvidenceCount: nonNegativeInteger(value.ambientEvidenceCount) } : {}),
    ...(nonNegativeInteger(value.isolatedWorktreeEvidenceCount) !== undefined ? { isolatedWorktreeEvidenceCount: nonNegativeInteger(value.isolatedWorktreeEvidenceCount) } : {}),
    ...(nonNegativeInteger(value.approvalEvidenceCount) !== undefined ? { approvalEvidenceCount: nonNegativeInteger(value.approvalEvidenceCount) } : {}),
    ...(boundedString(value.reason, MAX_EVIDENCE_STRING_CHARS) ? { reason: boundedString(value.reason, MAX_EVIDENCE_STRING_CHARS) } : {}),
  };
  return Object.keys(summary).length ? summary : undefined;
}

function diagnosticReplayLifecycleSummaryFromStorage(
  input: unknown,
): DiagnosticExportSubagentLifecycleSummary | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  const detachedRunIds = boundedStringArray(value.detachedRunIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const cancelledRunIds = boundedStringArray(value.cancelledRunIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const stoppedChildRunIds = boundedStringArray(value.stoppedChildRunIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const unchangedRunIds = boundedStringArray(value.unchangedRunIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const cancelledWaitBarrierIds = boundedStringArray(value.cancelledWaitBarrierIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const cancelledMailboxEventIds = boundedStringArray(value.cancelledMailboxEventIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const summary: DiagnosticExportSubagentLifecycleSummary = {
    ...(boundedString(value.action, MAX_EVIDENCE_STRING_CHARS) ? { action: boundedString(value.action, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.source, MAX_EVIDENCE_STRING_CHARS) ? { source: boundedString(value.source, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.status, MAX_EVIDENCE_STRING_CHARS) ? { status: boundedString(value.status, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.waitBarrierId, MAX_EVIDENCE_STRING_CHARS) ? { waitBarrierId: boundedString(value.waitBarrierId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.barrierStatus, MAX_EVIDENCE_STRING_CHARS) ? { barrierStatus: boundedString(value.barrierStatus, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.reason, MAX_EVIDENCE_STRING_CHARS) ? { reason: boundedString(value.reason, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.userDecisionPreview, MAX_EVIDENCE_STRING_CHARS) ? { userDecisionPreview: boundedString(value.userDecisionPreview, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.partialSummaryPreview, MAX_EVIDENCE_STRING_CHARS) ? { partialSummaryPreview: boundedString(value.partialSummaryPreview, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(detachedRunIds.length ? { detachedRunIds } : {}),
    ...(cancelledRunIds.length ? { cancelledRunIds } : {}),
    ...(stoppedChildRunIds.length ? { stoppedChildRunIds } : {}),
    ...(unchangedRunIds.length ? { unchangedRunIds } : {}),
    ...(cancelledWaitBarrierIds.length ? { cancelledWaitBarrierIds } : {}),
    ...(cancelledMailboxEventIds.length ? { cancelledMailboxEventIds } : {}),
    ...(typeof value.parentCancellationRequested === "boolean" ? { parentCancellationRequested: value.parentCancellationRequested } : {}),
  };
  return Object.keys(summary).length ? summary : undefined;
}

function diagnosticReplayTranscriptItemFromStorage(input: unknown): DiagnosticExportSubagentReplayTranscriptItem | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const createdAt = boundedString(value?.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const threadId = boundedString(value?.threadId, MAX_SUMMARY_MESSAGE_CHARS);
  const role = chatRoleValue(value?.role);
  const contentPreview = boundedString(value?.contentPreview, MAX_SUMMARY_MESSAGE_CHARS);
  if (sequence === undefined || !createdAt || !threadId || !role || !contentPreview) return undefined;
  return {
    sequence,
    createdAt,
    threadId,
    role,
    contentPreview,
    ...(boundedString(value?.childRunId, MAX_EVIDENCE_STRING_CHARS) ? { childRunId: boundedString(value?.childRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.childThreadId, MAX_EVIDENCE_STRING_CHARS) ? { childThreadId: boundedString(value?.childThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
  };
}

function diagnosticReplayCallableWorkflowTaskFromStorage(
  input: unknown,
): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number] | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const taskId = boundedString(value?.taskId, MAX_SUMMARY_MESSAGE_CHARS);
  const launchId = boundedString(value?.launchId, MAX_SUMMARY_MESSAGE_CHARS);
  const createdAt = boundedString(value?.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const updatedAt = boundedString(value?.updatedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const parentThreadId = boundedString(value?.parentThreadId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentRunId = boundedString(value?.parentRunId, MAX_SUMMARY_MESSAGE_CHARS);
  const toolName = boundedString(value?.toolName, MAX_SUMMARY_MESSAGE_CHARS);
  const sourceKind = boundedString(value?.sourceKind, MAX_SUMMARY_MESSAGE_CHARS);
  const title = boundedString(value?.title, MAX_SUMMARY_MESSAGE_CHARS);
  const status = callableWorkflowTaskStatus(value?.status);
  const statusLabel = boundedString(value?.statusLabel, MAX_SUMMARY_MESSAGE_CHARS);
  const blocking = typeof value?.blocking === "boolean" ? value.blocking : undefined;
  const runnerDeferredReason = boundedString(value?.runnerDeferredReason, MAX_SUMMARY_MESSAGE_CHARS);
  const artifactLinkState = callableWorkflowArtifactLinkState(value?.artifactLinkState);
  const runLinkState = callableWorkflowRunLinkState(value?.runLinkState);
  if (
    sequence === undefined || !taskId || !launchId || !createdAt || !updatedAt || !parentThreadId || !parentRunId ||
    !toolName || !sourceKind || !title || !status || !statusLabel || blocking === undefined ||
    !runnerDeferredReason || !artifactLinkState || !runLinkState
  ) {
    return undefined;
  }
  const tokenCount = nonNegativeInteger(value?.tokenCount);
  const costMicros = nonNegativeInteger(value?.costMicros);
  return {
    sequence,
    taskId,
    launchId,
    createdAt,
    updatedAt,
    parentThreadId,
    parentRunId,
    toolName,
    sourceKind,
    title,
    status,
    statusLabel,
    blocking,
    runnerDeferredReason,
    workflowRunEventTypes: boundedStringArray(value?.workflowRunEventTypes, 80, MAX_EVIDENCE_STRING_CHARS),
    artifactLinkState,
    runLinkState,
    ...(boundedString(value?.parentMessageId, MAX_EVIDENCE_STRING_CHARS) ? { parentMessageId: boundedString(value?.parentMessageId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.workflowThreadId, MAX_EVIDENCE_STRING_CHARS) ? { workflowThreadId: boundedString(value?.workflowThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.workflowArtifactId, MAX_EVIDENCE_STRING_CHARS) ? { workflowArtifactId: boundedString(value?.workflowArtifactId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.workflowArtifactTitle, MAX_EVIDENCE_STRING_CHARS) ? { workflowArtifactTitle: boundedString(value?.workflowArtifactTitle, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(workflowArtifactStatus(value?.workflowArtifactStatus) ? { workflowArtifactStatus: workflowArtifactStatus(value?.workflowArtifactStatus)! } : {}),
    ...(boundedString(value?.workflowRunId, MAX_EVIDENCE_STRING_CHARS) ? { workflowRunId: boundedString(value?.workflowRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(workflowRunStatus(value?.workflowRunStatus) ? { workflowRunStatus: workflowRunStatus(value?.workflowRunStatus)! } : {}),
    ...(boundedString(value?.callerKind, MAX_EVIDENCE_STRING_CHARS) ? { callerKind: boundedString(value?.callerKind, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.childThreadId, MAX_EVIDENCE_STRING_CHARS) ? { childThreadId: boundedString(value?.childThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.childRunId, MAX_EVIDENCE_STRING_CHARS) ? { childRunId: boundedString(value?.childRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.subagentRunId, MAX_EVIDENCE_STRING_CHARS) ? { subagentRunId: boundedString(value?.subagentRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) ? { canonicalTaskPath: boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.approvalSource, MAX_EVIDENCE_STRING_CHARS) ? { approvalSource: boundedString(value?.approvalSource, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.approvalScope, MAX_EVIDENCE_STRING_CHARS) ? { approvalScope: boundedString(value?.approvalScope, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(typeof value?.worktreeIsolated === "boolean" ? { worktreeIsolated: value.worktreeIsolated } : {}),
    ...(boundedString(value?.worktreeStatus, MAX_EVIDENCE_STRING_CHARS) ? { worktreeStatus: boundedString(value?.worktreeStatus, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.nestedFanoutSource, MAX_EVIDENCE_STRING_CHARS) ? { nestedFanoutSource: boundedString(value?.nestedFanoutSource, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.lastEventType, MAX_EVIDENCE_STRING_CHARS) ? { lastEventType: boundedString(value?.lastEventType, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.lastEventMessage, MAX_EVIDENCE_STRING_CHARS) ? { lastEventMessage: boundedString(value?.lastEventMessage, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(tokenCount !== undefined ? { tokenCount } : {}),
    ...(costMicros !== undefined ? { costMicros } : {}),
  };
}

function callableWorkflowTaskStatus(value: unknown): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["status"] | undefined {
  return value === "queued" || value === "compiling" || value === "running" || value === "paused" ||
    value === "succeeded" || value === "failed" || value === "canceled"
    ? value
    : undefined;
}

function workflowArtifactStatus(value: unknown): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["workflowArtifactStatus"] | undefined {
  return value === "draft" || value === "ready_for_preview" || value === "approved" || value === "rejected" || value === "archived"
    ? value
    : undefined;
}

function workflowRunStatus(value: unknown): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["workflowRunStatus"] | undefined {
  return value === "created" || value === "previewed" || value === "running" || value === "paused" || value === "needs_input" ||
    value === "succeeded" || value === "failed" || value === "canceled" || value === "skipped"
    ? value
    : undefined;
}

function callableWorkflowArtifactLinkState(value: unknown): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["artifactLinkState"] | undefined {
  return value === "not_linked" || value === "linked" || value === "missing" ? value : undefined;
}

function callableWorkflowRunLinkState(value: unknown): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["runLinkState"] | undefined {
  return value === "not_linked" || value === "linked" || value === "missing" || value === "artifact_mismatch" ? value : undefined;
}

function subagentMailboxDeliveryState(value: unknown): DiagnosticExportSubagentReplayParentMailboxItem["deliveryState"] | undefined {
  return value === "queued" || value === "delivered" || value === "consumed" || value === "failed" || value === "cancelled"
    ? value
    : undefined;
}

function localRuntimeCapability(
  value: unknown,
): DiagnosticExportLocalRuntimeEvidence["runtimes"][number]["capability"] | undefined {
  return value === "local-deep-research" ||
    value === "minicpm-v" ||
    value === "local-text" ||
    value === "voice" ||
    value === "embeddings"
    ? value
    : undefined;
}

function localRuntimeTrackingStatus(
  value: unknown,
): DiagnosticExportLocalRuntimeEvidence["runtimes"][number]["trackingStatus"] | undefined {
  return value === "managed" || value === "tracked" || value === "untracked" ? value : undefined;
}

function localRuntimeLeaseStatus(
  value: unknown,
): DiagnosticExportLocalRuntimeEvidence["activeOwners"][number]["status"] | undefined {
  return value === "acquiring" ||
    value === "running" ||
    value === "idle" ||
    value === "releasing" ||
    value === "released" ||
    value === "crashed"
    ? value
    : undefined;
}

function localRuntimeActionKind(
  value: unknown,
): DiagnosticExportLocalRuntimeEvidence["blockedActions"][number]["action"] | undefined {
  return value === "stop" || value === "restart" || value === "load" || value === "unload" ? value : undefined;
}

function localRuntimeNextActionKind(
  value: unknown,
): DiagnosticExportLocalRuntimeEvidence["nextSafeActions"][number]["action"] | undefined {
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
  return value === "safe" || value === "requires-approval" || value === "blocked" || value === "external"
    ? value
    : undefined;
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

function featureFlagSourceValue(value: unknown): AmbientFeatureFlagSnapshot["flags"][typeof AMBIENT_SUBAGENTS_FEATURE_FLAG]["source"] | undefined {
  return value === "default" ||
    value === "settings" ||
    value === "startup_arg_enable" ||
    value === "startup_arg_disable" ||
    value === "harness_enable" ||
    value === "harness_disable"
    ? value
    : undefined;
}

function diagnosticReplayRestartRepairFromStorage(
  input: unknown,
): DiagnosticExportSubagentReplayEvidence["restartRepair"] | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  return {
    observedIssueKinds: arrayValue(value.observedIssueKinds).filter((kind): kind is SubagentRepairIssueKind => (
      typeof kind === "string" && SUBAGENT_REPAIR_ISSUE_KINDS.has(kind as SubagentRepairIssueKind)
    )).slice(0, MAX_RESTART_REPAIR_IDS),
    repairedRunIds: boundedStringArray(value.repairedRunIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    repairedBarrierIds: boundedStringArray(value.repairedBarrierIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    repairedParentControlBarrierIds: boundedStringArray(value.repairedParentControlBarrierIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    repairableSpawnEdgeRunIds: boundedStringArray(value.repairableSpawnEdgeRunIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    danglingSpawnEdgeRunIds: boundedStringArray(value.danglingSpawnEdgeRunIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    diagnosticRunIds: boundedStringArray(value.diagnosticRunIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    callableWorkflowTaskIssues: arrayValue(value.callableWorkflowTaskIssues).flatMap((issue) => {
      const parsed = diagnosticReplayCallableWorkflowRestartIssueFromStorage(issue);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_REPLAY_ROWS),
  };
}

function diagnosticReplayCallableWorkflowRestartIssueFromStorage(
  input: unknown,
): DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number] | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const issueId = boundedString(value?.issueId, MAX_SUMMARY_MESSAGE_CHARS);
  const kind = callableWorkflowTaskRestartIssueKind(value?.kind);
  const severity = diagnosticSeverity(value?.severity);
  const messagePreview = boundedString(value?.messagePreview, MAX_SUMMARY_MESSAGE_CHARS);
  const taskId = boundedString(value?.taskId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentThreadId = boundedString(value?.parentThreadId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentRunId = boundedString(value?.parentRunId, MAX_SUMMARY_MESSAGE_CHARS);
  if (!value || sequence === undefined || !issueId || !kind || !severity || !messagePreview || !taskId || !parentThreadId || !parentRunId) {
    return undefined;
  }
  const taskStatus = callableWorkflowTaskStatus(value.taskStatus);
  return {
    sequence,
    issueId,
    kind,
    severity,
    messagePreview,
    taskId,
    parentThreadId,
    parentRunId,
    ...(taskStatus ? { taskStatus } : {}),
    ...(boundedString(value.taskStatusLabel, MAX_EVIDENCE_STRING_CHARS) ? { taskStatusLabel: boundedString(value.taskStatusLabel, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(typeof value.blocking === "boolean" ? { blocking: value.blocking } : {}),
    ...(boundedString(value.runnerDeferredReason, MAX_EVIDENCE_STRING_CHARS) ? { runnerDeferredReason: boundedString(value.runnerDeferredReason, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.workflowArtifactId, MAX_EVIDENCE_STRING_CHARS) ? { workflowArtifactId: boundedString(value.workflowArtifactId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.workflowRunId, MAX_EVIDENCE_STRING_CHARS) ? { workflowRunId: boundedString(value.workflowRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.callerKind, MAX_EVIDENCE_STRING_CHARS) ? { callerKind: boundedString(value.callerKind, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.callerThreadId, MAX_EVIDENCE_STRING_CHARS) ? { callerThreadId: boundedString(value.callerThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.callerRunId, MAX_EVIDENCE_STRING_CHARS) ? { callerRunId: boundedString(value.callerRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.childThreadId, MAX_EVIDENCE_STRING_CHARS) ? { childThreadId: boundedString(value.childThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.childRunId, MAX_EVIDENCE_STRING_CHARS) ? { childRunId: boundedString(value.childRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.subagentRunId, MAX_EVIDENCE_STRING_CHARS) ? { subagentRunId: boundedString(value.subagentRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) ? { canonicalTaskPath: boundedString(value.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.childParentThreadId, MAX_EVIDENCE_STRING_CHARS) ? { childParentThreadId: boundedString(value.childParentThreadId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.childParentRunId, MAX_EVIDENCE_STRING_CHARS) ? { childParentRunId: boundedString(value.childParentRunId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.approvalSource, MAX_EVIDENCE_STRING_CHARS) ? { approvalSource: boundedString(value.approvalSource, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.approvalScope, MAX_EVIDENCE_STRING_CHARS) ? { approvalScope: boundedString(value.approvalScope, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(typeof value.worktreeRequired === "boolean" ? { worktreeRequired: value.worktreeRequired } : {}),
    ...(typeof value.worktreeIsolated === "boolean" ? { worktreeIsolated: value.worktreeIsolated } : {}),
    ...(boundedString(value.worktreeStatus, MAX_EVIDENCE_STRING_CHARS) ? { worktreeStatus: boundedString(value.worktreeStatus, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(typeof value.nestedFanoutRequired === "boolean" ? { nestedFanoutRequired: value.nestedFanoutRequired } : {}),
    ...(boundedString(value.nestedFanoutSource, MAX_EVIDENCE_STRING_CHARS) ? { nestedFanoutSource: boundedString(value.nestedFanoutSource, MAX_EVIDENCE_STRING_CHARS) } : {}),
  };
}

function callableWorkflowTaskRestartIssueKind(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number]["kind"] | undefined {
  return value === "missing_parent_thread" ||
    value === "missing_parent_run" ||
    value === "parent_run_thread_mismatch" ||
    value === "active_task_interrupted" ||
    value === "missing_workflow_artifact" ||
    value === "missing_workflow_thread" ||
    value === "missing_workflow_run" ||
    value === "workflow_run_artifact_mismatch" ||
    value === "missing_task_artifact_link" ||
    value === "workflow_run_terminal_task_unfinished"
    ? value
    : undefined;
}

function diagnosticSeverity(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number]["severity"] | undefined {
  return value === "info" || value === "warning" || value === "error" ? value : undefined;
}

function diagnosticExportHistoryRow(
  result: DiagnosticExportResult,
  selectedId: string | undefined,
): DiagnosticExportHistoryRowModel {
  const id = diagnosticExportHistoryEntryId(result);
  const replay = result.summary?.subagents.replayEvidence;
  const localRuntime = result.summary?.localRuntimes;
  const agentMemory = result.summary?.agentMemory;
  const featureFlagStatus = diagnosticFeatureFlagStatus(result.summary?.featureFlags);
  const agentMemoryStatus = agentMemory
    ? [
        agentMemory.status === "healthy" ? "Agent memory healthy" : `Agent memory ${agentMemory.status.replace(/_/g, " ")}`,
        agentMemory.fileCount > 0 ? countLabel(agentMemory.fileCount, "memory file") : undefined,
        agentMemory.runtimeSnapshots.length > 0 ? countLabel(agentMemory.runtimeSnapshots.length, "runtime snapshot") : undefined,
      ].filter(Boolean).join(" / ")
    : undefined;
  const replayStatus = replay
    ? [
        replay.status === "healthy" ? "Replay healthy" : `Replay ${replay.status.replace(/_/g, " ")}`,
        replay.runCount > 0 ? countLabel(replay.runCount, "child run") : undefined,
        replay.runtimeEventCount > 0 ? countLabel(replay.runtimeEventCount, "runtime event") : undefined,
        replay.truncated ? "bounded" : undefined,
      ].filter(Boolean).join(" / ")
    : "Replay unavailable";
  const localRuntimeStatus = localRuntime
    ? [
        localRuntime.status === "healthy" ? "Local runtime healthy" : `Local runtime ${localRuntime.status.replace(/_/g, " ")}`,
        localRuntime.runtimeCount > 0 ? countLabel(localRuntime.runtimeCount, "runtime") : undefined,
        localRuntime.activeLeaseCount > 0 ? countLabel(localRuntime.activeLeaseCount, "active lease") : undefined,
        localRuntime.stopBlockedCount > 0 ? countLabel(localRuntime.stopBlockedCount, "stop blocker") : undefined,
        localRuntime.restartBlockedCount > 0 ? countLabel(localRuntime.restartBlockedCount, "restart blocker") : undefined,
        localRuntime.untrackedCount > 0 ? processCountLabel(localRuntime.untrackedCount, "untracked") : undefined,
        localRuntime.memoryPolicyOutcome && localRuntime.memoryPolicyOutcome !== "within-limit" && localRuntime.memoryPolicyOutcome !== "unlimited"
          ? `memory ${localRuntime.memoryPolicyOutcome}`
          : undefined,
      ].filter(Boolean).join(" / ")
    : "Local runtime unavailable";
  const label = fileNameFromPath(result.path);
  const loadedEvidence = [
    result.subagents?.replayEvidence ? "timeline evidence loaded" : undefined,
    result.localRuntimes?.evidence ? "runtime evidence loaded" : undefined,
  ].filter(Boolean).join(", ");
  const detail = [
    result.createdAt,
    formatDiagnosticExportSize(result.bytes),
    featureFlagStatus,
    loadedEvidence || (replay || localRuntime || agentMemory ? "summary only" : undefined),
  ].filter(Boolean).join(" / ");
  const replayEvidence = result.subagents?.replayEvidence;
  const localRuntimeEvidence = result.localRuntimes?.evidence;
  const searchText = [
    label,
    result.path,
    result.createdAt,
    featureFlagStatus,
    replayStatus,
    replay?.message,
    agentMemoryStatus,
    agentMemory ? diagnosticAgentMemorySearchText(agentMemory) : undefined,
    localRuntimeStatus,
    localRuntime ? diagnosticLocalRuntimeSearchText(localRuntime) : undefined,
    replayEvidence ? diagnosticReplayEvidenceSearchText(replayEvidence) : undefined,
    localRuntimeEvidence ? diagnosticLocalRuntimeEvidenceSearchText(localRuntimeEvidence) : undefined,
  ].filter(Boolean).join(" ");
  return {
    id,
    label,
    detail,
    replayStatus,
    replayTone: replayTone(replay?.status, replay?.truncated),
    localRuntimeStatus,
    localRuntimeTone: localRuntimeTone(localRuntime?.status),
    selected: id === selectedId,
    path: result.path,
    searchText,
  };
}

function diagnosticAgentMemorySearchText(summary: AgentMemoryStorageDiagnostics): string {
  return [
    summary.message,
    summary.status,
    summary.featureEnabled ? "memory feature enabled" : "memory feature disabled",
    summary.settingsEnabled ? "memory setting enabled" : "memory setting disabled",
    summary.defaultThreadEnabled ? "memory default threads enabled" : "memory default threads disabled",
    `memory embeddings ${summary.embedding.status}`,
    summary.embedding.modelId,
    summary.embedding.providerId,
    `active threads ${summary.activeThreadCount}`,
    `thread enabled ${summary.threadEnabledCount}`,
    summary.dataDirExists ? "memory data dir exists" : "memory data dir missing",
    `memory storage schema ${summary.storageSchemaStatus}`,
    summary.storageSchemaVersion,
    summary.storageSchemaMessage,
    `memory files ${summary.fileCount}`,
    `memory bytes ${summary.totalBytes}`,
    `memory top level ${summary.topLevelEntryCount}`,
    summary.rawContentIncluded ? undefined : "raw memory content omitted",
    summary.nativePreflight ? `native preflight ${summary.nativePreflight.status} ${summary.nativePreflight.message}` : undefined,
    summary.nativePreflight?.dependencies.map((dependency) => [
      dependency.name,
      dependency.status,
      dependency.resolvable ? "resolvable" : "unresolved",
      dependency.version,
    ].filter(Boolean).join(" ")).join(" "),
    summary.errors.join(" "),
    summary.runtimeSnapshots.map((snapshot) => [
      snapshot.threadId,
      snapshot.active ? "active" : "inactive",
      snapshot.lastInitialize?.status,
      snapshot.lastInitialize?.message,
      snapshot.lastRecall?.status,
      snapshot.lastRecall?.message,
      snapshot.lastCapture?.status,
      snapshot.lastCapture?.message,
      snapshot.lastSearch?.status,
      snapshot.lastSearch?.message,
      snapshot.lastContextInjection ? `context injection ${snapshot.lastContextInjection.totalInjectedChars} chars` : undefined,
      snapshot.lastContextInjection ? `offload ${snapshot.lastContextInjection.offloadContextChars} chars` : undefined,
    ].filter(Boolean).join(" ")).join(" "),
  ].filter(Boolean).join(" ");
}

function diagnosticFeatureFlagStatus(featureFlags: AmbientFeatureFlagSnapshot | undefined): string | undefined {
  const flag = featureFlags?.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG];
  if (!flag) return undefined;
  return `${AMBIENT_SUBAGENTS_FEATURE_FLAG} ${flag.enabled ? "enabled" : "disabled"} via ${flag.source.replace(/_/g, " ")}`;
}

function diagnosticLocalRuntimeSearchText(summary: DiagnosticExportLocalRuntimeSummary): string {
  return [
    summary.message,
    summary.status,
    `runtime ${summary.runtimeCount}`,
    `running ${summary.runningCount}`,
    `active lease ${summary.activeLeaseCount}`,
    `stop blocker ${summary.stopBlockedCount}`,
    `restart blocker ${summary.restartBlockedCount}`,
    `untracked ${summary.untrackedCount}`,
    `stale lease ${summary.staleLeaseCount}`,
    `released lease ${summary.releasedLeaseCount}`,
    `crashed lease ${summary.crashedLeaseCount}`,
    summary.memoryPolicyOutcome ? `memory ${summary.memoryPolicyOutcome}` : undefined,
    summary.memoryPolicyReason,
    summary.errorMessages.join(" "),
  ].filter(Boolean).join(" ");
}

function diagnosticLocalRuntimeEvidenceSearchText(evidence: DiagnosticExportLocalRuntimeEvidence): string {
  return [
    evidence.capturedAt,
    evidence.truncated ? "runtime evidence bounded" : undefined,
    evidence.runtimes.map((runtime) => [
      runtime.runtimeEntryId,
      runtime.capability,
      runtime.trackingStatus,
      runtime.running ? "running" : "stopped",
      runtime.providerId,
      runtime.modelRuntimeId,
      runtime.modelProfileId,
      runtime.modelId,
      runtime.pid === undefined ? undefined : `pid ${runtime.pid}`,
      runtime.endpoint,
      runtime.ownerLabels.join(" "),
      runtime.activeLeaseIds.join(" "),
      runtime.staleLeaseIds.join(" "),
      runtime.releasedLeaseIds.join(" "),
      runtime.crashedLeaseIds.join(" "),
      runtime.ordinaryStopAllowed ? "ordinary stop allowed" : "ordinary stop blocked",
      runtime.ordinaryRestartAllowed ? "ordinary restart allowed" : "ordinary restart blocked",
      runtime.stopReason,
      runtime.restartReason,
      runtime.forceStopRequiresSubagentCancellation ? "force stop requires subagent cancellation" : undefined,
      runtime.forceRestartRequiresSubagentCancellation ? "force restart requires subagent cancellation" : undefined,
      runtime.untracked ? "untracked runtime" : undefined,
    ].filter(Boolean).join(" ")).join(" "),
    evidence.activeOwners.map((owner) => [
      owner.runtimeEntryId,
      owner.leaseId,
      owner.displayName,
      owner.status,
      owner.parentThreadId,
      owner.subagentThreadId,
      owner.subagentRunId,
      owner.capabilityKind,
      owner.providerId,
      owner.modelRuntimeId,
      owner.modelProfileId,
      owner.modelId,
      owner.pid === undefined ? undefined : `pid ${owner.pid}`,
      owner.endpoint,
      owner.acquiredAt,
      owner.lastHeartbeatAt,
    ].filter(Boolean).join(" ")).join(" "),
    evidence.blockedActions.map((action) => [
      action.runtimeEntryId,
      action.action,
      action.reason,
      action.blockerLeaseIds.join(" "),
      action.affectedSubagentLabels.join(" "),
      action.affectedSubagentThreadIds.join(" "),
      action.forceAllowed ? "force allowed" : "force blocked",
      action.forceRequiresSubagentCancellation ? "requires subagent cancellation" : undefined,
      action.untracked ? "untracked" : undefined,
    ].filter(Boolean).join(" ")).join(" "),
    evidence.nextSafeActions.map((action) => [
      action.action,
      action.safety,
      action.reason,
      action.runtimeEntryId,
      action.runtimeId,
      action.capability,
      action.toolName,
      action.blockerLeaseIds?.join(" "),
      action.affectedSubagentLabels?.join(" "),
      action.ownershipResolution?.lifecycleAction,
      action.ownershipResolution?.resolution,
      action.ownershipResolution?.reason,
      action.ownershipResolution?.blockerLeaseIds.join(" "),
      action.ownershipResolution?.affectedSubagentLabels.join(" "),
      action.untracked ? "untracked" : undefined,
    ].filter(Boolean).join(" ")).join(" "),
    evidence.memoryEvidence.activeResidentMemoryBasis,
    evidence.memoryEvidence.uncertaintyReasons.join(" "),
  ].filter(Boolean).join(" ");
}

function diagnosticReplayEvidenceSearchText(evidence: DiagnosticExportSubagentReplayEvidence): string {
  return [
    evidence.childThreads.map((thread) => [
      thread.threadId,
      thread.runId,
      thread.parentThreadId,
      thread.parentRunId,
      thread.canonicalTaskPath,
      thread.status,
    ].filter(Boolean).join(" ")).join(" "),
    evidence.runtimeEventTimeline.map(diagnosticReplayTimelineSearchText).join(" "),
    evidence.persistedRunEventTimeline.map(diagnosticReplayTimelineSearchText).join(" "),
    evidence.parentMailboxTimeline.map(diagnosticReplayParentMailboxSearchText).join(" "),
    evidence.callableWorkflowTaskTimeline.map(diagnosticReplayCallableWorkflowTaskSearchText).join(" "),
    evidence.restartRepair.callableWorkflowTaskIssues.map(diagnosticReplayCallableWorkflowRestartIssueSearchText).join(" "),
    evidence.transcriptTimeline.map((item) => [
      item.threadId,
      item.childRunId,
      item.childThreadId,
      item.role,
      item.contentPreview,
    ].filter(Boolean).join(" ")).join(" "),
  ].filter(Boolean).join(" ");
}

function diagnosticReplayCallableWorkflowTaskSearchText(
  task: DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number],
): string {
  return [
    task.taskId,
    task.launchId,
    task.parentThreadId,
    task.parentRunId,
    task.parentMessageId,
    task.toolName,
    task.sourceKind,
    task.title,
    task.status,
    task.statusLabel,
    task.runnerDeferredReason,
    task.workflowThreadId,
    task.workflowArtifactId,
    task.workflowArtifactTitle,
    task.workflowArtifactStatus,
    task.workflowRunId,
    task.workflowRunStatus,
    task.workflowRunEventTypes.join(" "),
    task.artifactLinkState,
    task.runLinkState,
    task.callerKind,
    task.childThreadId,
    task.childRunId,
    task.subagentRunId,
    task.canonicalTaskPath,
    task.approvalSource,
    task.approvalScope,
    task.worktreeIsolated === undefined ? undefined : `worktree ${task.worktreeIsolated ? "isolated" : "parent workspace"}`,
    task.worktreeStatus,
    task.nestedFanoutSource,
    task.lastEventType,
    task.lastEventMessage,
  ].filter(Boolean).join(" ");
}

function diagnosticReplayCallableWorkflowRestartIssueSearchText(
  issue: DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number],
): string {
  return [
    issue.issueId,
    issue.kind,
    issue.severity,
    issue.messagePreview,
    issue.taskId,
    issue.taskStatus,
    issue.taskStatusLabel,
    issue.blocking === undefined ? undefined : issue.blocking ? "blocking" : "background",
    issue.runnerDeferredReason,
    issue.parentThreadId,
    issue.parentRunId,
    issue.workflowArtifactId,
    issue.workflowRunId,
    issue.callerKind,
    issue.callerThreadId,
    issue.callerRunId,
    issue.childThreadId,
    issue.childRunId,
    issue.subagentRunId,
    issue.canonicalTaskPath,
    issue.childParentThreadId,
    issue.childParentRunId,
    issue.approvalSource,
    issue.approvalScope,
    issue.worktreeRequired ? "worktree required" : undefined,
    issue.worktreeIsolated === undefined ? undefined : `worktree ${issue.worktreeIsolated ? "isolated" : "parent workspace"}`,
    issue.worktreeStatus,
    issue.nestedFanoutRequired ? "nested fanout required" : undefined,
    issue.nestedFanoutSource,
  ].filter(Boolean).join(" ");
}

function diagnosticReplayTimelineSearchText(event: DiagnosticExportSubagentReplayTimelineItem): string {
  return [
    event.runId,
    event.parentRunId,
    event.childThreadId,
    event.canonicalTaskPath,
    event.roleId,
    event.source,
    event.status,
    event.type,
    event.toolName,
    event.textPreview,
    event.messagePreview,
    event.artifactPath,
    event.approvalId,
    event.approvalSource,
    event.worktreeIsolated === undefined ? undefined : `worktree ${event.worktreeIsolated ? "isolated" : "parent workspace"}`,
    event.worktreePath,
  ].filter(Boolean).join(" ");
}

function diagnosticReplayParentMailboxSearchText(event: DiagnosticExportSubagentReplayParentMailboxItem): string {
  return [
    event.id,
    event.parentThreadId,
    event.parentRunId,
    event.parentMessageId,
    event.type,
    event.deliveryState,
    event.childRunIds.join(" "),
    event.childThreadIds?.join(" "),
    event.canonicalTaskPaths?.join(" "),
    event.childSourceLabels?.join(" "),
    event.failureStage,
    event.approvalMode,
    event.approvalUnavailable === undefined ? undefined : `approval unavailable ${event.approvalUnavailable}`,
    event.deniedCategoryIds?.join(" "),
    event.deniedToolIds?.join(" "),
    event.deniedCategoryLabels?.join(" "),
    event.deniedToolLabels?.join(" "),
    diagnosticReplayCompletionGuardSearchText(event.completionGuardSummary),
    diagnosticReplayLifecycleSummarySearchText(event.lifecycleSummary),
    event.payloadPreview,
    event.idempotencyKey,
  ].filter(Boolean).join(" ");
}

function diagnosticReplayCompletionGuardSearchText(
  summary: DiagnosticExportSubagentCompletionGuardSummary | undefined,
): string | undefined {
  if (!summary) return undefined;
  return [
    "completion guard",
    summary.valid === undefined ? undefined : `valid ${summary.valid}`,
    summary.synthesisAllowed === undefined ? undefined : `synthesisAllowed ${summary.synthesisAllowed}`,
    summary.required === undefined ? undefined : `required ${summary.required}`,
    summary.structuredEvidenceCount === undefined ? undefined : `structured ${summary.structuredEvidenceCount}`,
    summary.ambientEvidenceCount === undefined ? undefined : `Ambient ${summary.ambientEvidenceCount}`,
    summary.isolatedWorktreeEvidenceCount === undefined ? undefined : `isolated worktree ${summary.isolatedWorktreeEvidenceCount}`,
    summary.approvalEvidenceCount === undefined ? undefined : `approval ${summary.approvalEvidenceCount}`,
    summary.reason,
  ].filter(Boolean).join(" ");
}

function diagnosticReplayLifecycleSummarySearchText(
  summary: DiagnosticExportSubagentLifecycleSummary | undefined,
): string | undefined {
  if (!summary) return undefined;
  return [
    "lifecycle",
    summary.action,
    summary.source,
    summary.status,
    summary.waitBarrierId,
    summary.barrierStatus,
    summary.reason,
    summary.userDecisionPreview,
    summary.partialSummaryPreview,
    summary.detachedRunIds?.join(" "),
    summary.cancelledRunIds?.join(" "),
    summary.stoppedChildRunIds?.join(" "),
    summary.unchangedRunIds?.join(" "),
    summary.cancelledWaitBarrierIds?.join(" "),
    summary.cancelledMailboxEventIds?.join(" "),
    summary.parentCancellationRequested === undefined ? undefined : `parentCancellationRequested ${summary.parentCancellationRequested}`,
  ].filter(Boolean).join(" ");
}

function replayTone(status: string | undefined, truncated: boolean | undefined): DiagnosticExportHistoryRowModel["replayTone"] {
  if (status === "error") return "danger";
  if (status === "needs_attention" || truncated) return "warning";
  if (status === "healthy") return "success";
  return "neutral";
}

function localRuntimeTone(status: DiagnosticExportHealthStatus | undefined): DiagnosticExportHistoryRowModel["localRuntimeTone"] {
  if (status === "error") return "danger";
  if (status === "needs_attention") return "warning";
  if (status === "healthy") return "success";
  return "neutral";
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function processCountLabel(count: number, prefix: string): string {
  return `${count} ${prefix} ${count === 1 ? "process" : "processes"}`;
}

function formatDiagnosticExportSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function boundedString(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length <= limit ? value : value.slice(0, Math.max(0, limit));
}

function boundedStringArray(value: unknown, limit: number, stringLimit: number): string[] {
  return arrayValue(value).flatMap((entry) => {
    const parsed = boundedString(entry, stringLimit);
    return parsed ? [parsed] : [];
  }).slice(0, Math.max(0, limit));
}

function healthStatusValue(value: unknown): DiagnosticExportHealthStatus | undefined {
  return value === "healthy" || value === "needs_attention" || value === "error" || value === "unavailable"
    ? value
    : undefined;
}

function agentMemoryOperationStatusKind(
  value: unknown,
): NonNullable<AgentMemoryStorageDiagnostics["runtimeSnapshots"][number]["lastInitialize"]>["status"] | undefined {
  return value === "idle" || value === "ok" || value === "unavailable" || value === "error" ? value : undefined;
}

function chatRoleValue(value: unknown): DiagnosticExportSubagentReplayTranscriptItem["role"] | undefined {
  return value === "user" || value === "assistant" || value === "system" || value === "tool" ? value : undefined;
}
