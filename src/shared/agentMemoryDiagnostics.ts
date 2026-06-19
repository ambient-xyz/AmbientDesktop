import type { AgentMemoryAdapter, AgentMemoryStorageScope } from "./agentMemorySettings";
import type { AgentMemoryStarterStatus } from "./agentMemoryStarter";
import type { DiagnosticExportHealthStatus } from "./diagnosticTypes";

export type AgentMemoryOperationStatusKind = "idle" | "ok" | "unavailable" | "error";

export interface AgentMemoryOperationStatus {
  status: AgentMemoryOperationStatusKind;
  at: string;
  message?: string;
  moduleSpecifier?: string;
  total?: number;
  strategy?: string;
  providerId?: string;
  modelId?: string;
  modelProfileId?: string;
  dimensions?: number;
  endpoint?: string;
}

export interface AgentMemoryContextAccountingSnapshot {
  at: string;
  messageCount: number;
  originalUserChars: number;
  recallContextChars: number;
  offloadContextChars: number;
  totalInjectedChars: number;
  projectedUserMessageChars: number;
  truncated: boolean;
}

export interface AgentMemoryRuntimeSnapshot {
  threadId: string;
  active: boolean;
  dataDir: string;
  sessionKey: string;
  embedding?: AgentMemoryEmbeddingDiagnostics;
  lastInitialize?: AgentMemoryOperationStatus;
  lastEmbedding?: AgentMemoryOperationStatus;
  lastRecall?: AgentMemoryOperationStatus;
  lastCapture?: AgentMemoryOperationStatus;
  lastSearch?: AgentMemoryOperationStatus;
  lastContextInjection?: AgentMemoryContextAccountingSnapshot;
}

export type AgentMemoryEmbeddingStatus =
  | "disabled"
  | "ready"
  | "keyword_fallback"
  | "starting"
  | "unavailable"
  | "error";

export type AgentMemoryEmbeddingReindexStatus =
  | "not_required"
  | "pending"
  | "partial"
  | "complete"
  | "error"
  | "unknown";

export interface AgentMemoryEmbeddingDiagnostics {
  enabled: boolean;
  status: AgentMemoryEmbeddingStatus;
  message: string;
  providerMode?: string;
  providerId?: string;
  providerCapabilityId?: string;
  packageName?: string;
  modelId?: string;
  modelProfileId?: string;
  dimensions?: number;
  endpoint?: string;
  runtimeId?: string;
  runtimeStatus?: string;
  running?: boolean;
  autoStartProvider?: boolean;
  preflightEnabled?: boolean;
  sendDimensions?: boolean;
  maxInputChars?: number;
  timeoutMs?: number;
  reindexStatus?: AgentMemoryEmbeddingReindexStatus;
  missingHints?: string[];
  lastError?: string;
}

export function mergeAgentMemoryEmbeddingLiveDiagnostics(
  snapshot: AgentMemoryEmbeddingDiagnostics,
  live: AgentMemoryEmbeddingDiagnostics,
): AgentMemoryEmbeddingDiagnostics {
  const merged: AgentMemoryEmbeddingDiagnostics = {
    ...snapshot,
    ...live,
  };
  for (const field of ["endpoint", "runtimeId", "runtimeStatus", "running"] as const) {
    if (!(field in live)) delete merged[field];
  }
  if (snapshot.reindexStatus && snapshot.reindexStatus !== "unknown") {
    merged.reindexStatus = snapshot.reindexStatus;
  } else if (!live.reindexStatus && snapshot.reindexStatus) {
    merged.reindexStatus = snapshot.reindexStatus;
  }

  const preserveSnapshotReindexDetail =
    snapshot.reindexStatus === "pending" ||
    snapshot.reindexStatus === "partial" ||
    snapshot.reindexStatus === "error";

  if (live.lastError) {
    merged.lastError = live.lastError;
  } else if (preserveSnapshotReindexDetail && snapshot.lastError) {
    merged.lastError = snapshot.lastError;
  } else {
    delete merged.lastError;
  }

  merged.missingHints = live.missingHints ?? snapshot.missingHints;
  return merged;
}

export function mergeAgentMemoryEmbeddingLifecycleDiagnostics(
  checked: AgentMemoryEmbeddingDiagnostics,
  lifecycle: AgentMemoryEmbeddingDiagnostics,
): AgentMemoryEmbeddingDiagnostics {
  if (checked.status === "error" || checked.status === "unavailable") {
    return mergeAgentMemoryEmbeddingLiveDiagnostics(lifecycle, checked);
  }
  return mergeAgentMemoryEmbeddingLiveDiagnostics(checked, lifecycle);
}

export interface AgentMemoryNativeDependencyPreflightDependency {
  name: string;
  expectedVersion?: string;
  resolvable: boolean;
  version?: string;
  packageJsonPath?: string;
  status: DiagnosticExportHealthStatus;
  message: string;
}

export interface AgentMemoryNativeDependencyPreflight {
  schemaVersion: "ambient-agent-memory-native-preflight-v1";
  checkedAt: string;
  platform: string;
  arch: string;
  nodeModuleVersion?: string;
  coreModuleConfigured: boolean;
  coreModuleSpecifier?: string;
  status: DiagnosticExportHealthStatus;
  message: string;
  dependencies: AgentMemoryNativeDependencyPreflightDependency[];
  errors: string[];
}

export interface AgentMemoryStorageDiagnostics {
  schemaVersion: "ambient-agent-memory-diagnostics-v1";
  adapter: AgentMemoryAdapter;
  storageScope: AgentMemoryStorageScope;
  checkedAt: string;
  status: DiagnosticExportHealthStatus;
  message: string;
  featureEnabled: boolean;
  settingsEnabled: boolean;
  defaultThreadEnabled: boolean;
  embedding: AgentMemoryEmbeddingDiagnostics;
  activeThreadCount: number;
  threadEnabledCount: number;
  dataDir: string;
  dataDirExists: boolean;
  storageSchemaStatus: "missing" | "current" | "unsupported";
  storageSchemaPath: string;
  storageSchemaExpectedVersion: string;
  storageSchemaVersion?: string;
  storageSchemaMessage: string;
  fileCount: number;
  totalBytes: number;
  topLevelEntryCount: number;
  rawContentIncluded: false;
  nativePreflight?: AgentMemoryNativeDependencyPreflight;
  runtimeSnapshots: AgentMemoryRuntimeSnapshot[];
  errors: string[];
}

export function agentMemoryStorageDiagnosticsWithEmbedding(
  diagnostics: AgentMemoryStorageDiagnostics,
  embedding: AgentMemoryEmbeddingDiagnostics,
): AgentMemoryStorageDiagnostics {
  const errors = [...diagnostics.errors];
  const embeddingError = embedding.status === "error"
    ? embedding.lastError ?? embedding.message
    : undefined;
  if (embeddingError && !errors.includes(embeddingError)) errors.push(embeddingError);
  const embeddingStatus: DiagnosticExportHealthStatus | undefined = embedding.status === "error" && diagnostics.status === "healthy"
    ? "error"
    : undefined;
  return {
    ...diagnostics,
    embedding,
    ...(embeddingStatus ? { status: embeddingStatus, message: embedding.message } : {}),
    errors,
  };
}

export interface AgentMemoryClearResult {
  adapter: AgentMemoryAdapter;
  clearedAt: string;
  dataDir: string;
  dataDirExisted: boolean;
  removedFileCount: number;
  removedBytes: number;
  activeSessionsReset: {
    disposedSessions: number;
    deferredSessions: number;
    disposedThreadIds: string[];
    deferredThreadIds: string[];
  };
}

export interface AgentMemoryClearInput {
  workspacePath: string;
}

export type AgentMemoryEmbeddingLifecycleActionKind = "check" | "start" | "stop" | "restart";

export type AgentMemoryEmbeddingLifecycleActionStatus =
  | "checked"
  | "ready"
  | "started"
  | "stopped"
  | "restarted"
  | "blocked"
  | "not-found"
  | "failed"
  | "unavailable";

export interface AgentMemoryEmbeddingLifecycleActionInput {
  action: AgentMemoryEmbeddingLifecycleActionKind;
}

export interface AgentMemoryEmbeddingLifecycleActionResult {
  schemaVersion: "ambient-agent-memory-embedding-lifecycle-action-v1";
  action: AgentMemoryEmbeddingLifecycleActionKind;
  status: AgentMemoryEmbeddingLifecycleActionStatus;
  message: string;
  checkedAt: string;
  diagnostics: AgentMemoryStorageDiagnostics;
  starterStatus?: AgentMemoryStarterStatus;
}
