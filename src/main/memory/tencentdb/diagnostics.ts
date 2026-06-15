import { rm, readdir, stat } from "node:fs/promises";
import type {
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryRuntimeSnapshot,
  AgentMemoryStorageDiagnostics,
  AgentMemoryClearResult,
} from "../../../shared/agentMemoryDiagnostics";
import type { AgentMemorySettings } from "../../../shared/agentMemorySettings";
import { isAgentMemoryActiveForThread } from "../../../shared/agentMemorySettings";
import { isAmbientTencentDbMemoryEnabled, type AmbientFeatureFlagSnapshot } from "../../../shared/featureFlags";
import type { ThreadSummary, WorkspaceState } from "../../../shared/types";
import { inspectTencentDbMemoryNativePreflight } from "./preflight";
import { ambientTencentMemoryDataDir, inspectAmbientTencentMemoryStorageSchema } from "./storage";

export interface InspectTencentDbMemoryDiagnosticsInput {
  workspace: WorkspaceState;
  settings: AgentMemorySettings;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  threads: ThreadSummary[];
  runtimeSnapshots?: readonly AgentMemoryRuntimeSnapshot[];
  now?: Date;
}

export async function inspectTencentDbMemoryDiagnostics(
  input: InspectTencentDbMemoryDiagnosticsInput,
): Promise<AgentMemoryStorageDiagnostics> {
  const checkedAt = (input.now ?? new Date()).toISOString();
  const dataDir = ambientTencentMemoryDataDir(input.workspace.statePath);
  const featureEnabled = isAmbientTencentDbMemoryEnabled(input.featureFlagSnapshot);
  const threadEnabledCount = input.threads.filter((thread) => Boolean(thread.memoryEnabled)).length;
  const activeThreadCount = input.threads.filter((thread) =>
    isAgentMemoryActiveForThread({
      featureEnabled,
      settings: input.settings,
      threadMemoryEnabled: Boolean(thread.memoryEnabled),
    })
  ).length;
  const scan = await scanStorage(dataDir);
  const storageSchema = await inspectAmbientTencentMemoryStorageSchema(dataDir);
  const runtimeSnapshots = [...(input.runtimeSnapshots ?? [])]
    .sort((a, b) => a.threadId.localeCompare(b.threadId))
    .slice(0, 50);
  const runtimeErrors = runtimeSnapshots.flatMap((snapshot) => [
    snapshot.lastInitialize,
    snapshot.lastEmbedding,
    snapshot.lastRecall,
    snapshot.lastCapture,
    snapshot.lastSearch,
  ].filter((status) => status?.status === "error"));
  const embedding = agentMemoryEmbeddingDiagnostics(input.settings, runtimeSnapshots);
  const unavailableCore = runtimeSnapshots.some((snapshot) => snapshot.lastInitialize?.status === "unavailable");
  const nativePreflight = inspectTencentDbMemoryNativePreflight({ now: input.now });
  const nativeNeedsAttention = nativePreflight.status !== "healthy";
  const status = !featureEnabled || !input.settings.enabled
    ? "unavailable"
    : storageSchema.status === "unsupported"
      ? "error"
    : runtimeErrors.length
      ? "error"
      : unavailableCore || nativeNeedsAttention
        ? "needs_attention"
        : "healthy";
  const message = status === "unavailable"
    ? "TencentDB Agent Memory is disabled."
    : status === "error"
      ? storageSchema.status === "unsupported"
        ? storageSchema.message
        : "TencentDB Agent Memory has runtime errors."
      : unavailableCore
        ? "TencentDB Agent Memory is enabled but the reviewed core module is unavailable."
        : nativeNeedsAttention
          ? nativePreflight.message
        : "TencentDB Agent Memory diagnostics are available.";

  return {
    schemaVersion: "ambient-agent-memory-diagnostics-v1",
    adapter: "tencentdb",
    storageScope: input.settings.storageScope,
    checkedAt,
    status,
    message,
    featureEnabled,
    settingsEnabled: input.settings.enabled,
    defaultThreadEnabled: input.settings.defaultThreadEnabled,
    embedding,
    activeThreadCount,
    threadEnabledCount,
    dataDir,
    dataDirExists: scan.exists,
    storageSchemaStatus: storageSchema.status,
    storageSchemaPath: storageSchema.path,
    storageSchemaExpectedVersion: storageSchema.expectedVersion,
    ...(storageSchema.version ? { storageSchemaVersion: storageSchema.version } : {}),
    storageSchemaMessage: storageSchema.message,
    fileCount: scan.fileCount,
    totalBytes: scan.totalBytes,
    topLevelEntryCount: scan.topLevelEntryCount,
    rawContentIncluded: false,
    nativePreflight,
    runtimeSnapshots,
    errors: [
      ...scan.errors,
      ...(storageSchema.status === "unsupported" ? [storageSchema.message] : []),
      ...runtimeErrors.map((error) => error?.message).filter((message): message is string => Boolean(message)),
    ],
  };
}

function agentMemoryEmbeddingDiagnostics(
  settings: AgentMemorySettings,
  runtimeSnapshots: AgentMemoryRuntimeSnapshot[],
): AgentMemoryEmbeddingDiagnostics {
  const latest = runtimeSnapshots
    .map((snapshot) => snapshot.embedding)
    .filter((diagnostics): diagnostics is AgentMemoryEmbeddingDiagnostics => Boolean(diagnostics))
    .sort((left, right) => statusSortKey(right) - statusSortKey(left))[0];
  if (latest) return latest;
  if (!settings.embeddings.enabled) {
    return {
      enabled: false,
      status: "disabled",
      message: "TencentDB memory embeddings are disabled.",
    };
  }
  return {
    enabled: true,
    status: "keyword_fallback",
    message: "TencentDB memory embeddings are enabled but no active runtime has resolved an embedding provider yet.",
    providerMode: settings.embeddings.providerMode,
    autoStartProvider: settings.embeddings.autoStartProvider,
    preflightEnabled: settings.embeddings.preflightEnabled,
    sendDimensions: settings.embeddings.sendDimensions,
    maxInputChars: settings.embeddings.maxInputChars,
    timeoutMs: settings.embeddings.timeoutMs,
    reindexStatus: "unknown",
  };
}

function statusSortKey(diagnostics: AgentMemoryEmbeddingDiagnostics): number {
  if (diagnostics.status === "ready") return 5;
  if (diagnostics.status === "error") return 4;
  if (diagnostics.status === "keyword_fallback") return 3;
  if (diagnostics.status === "starting") return 2;
  if (diagnostics.status === "unavailable") return 1;
  return 0;
}

export async function clearTencentDbMemoryStorage(input: {
  workspace: WorkspaceState;
  activeSessionsReset: AgentMemoryClearResult["activeSessionsReset"];
  now?: Date;
}): Promise<AgentMemoryClearResult> {
  const dataDir = ambientTencentMemoryDataDir(input.workspace.statePath);
  const before = await scanStorage(dataDir);
  await rm(dataDir, { recursive: true, force: true });
  return {
    adapter: "tencentdb",
    clearedAt: (input.now ?? new Date()).toISOString(),
    dataDir,
    dataDirExisted: before.exists,
    removedFileCount: before.fileCount,
    removedBytes: before.totalBytes,
    activeSessionsReset: input.activeSessionsReset,
  };
}

async function scanStorage(root: string): Promise<{
  exists: boolean;
  fileCount: number;
  totalBytes: number;
  topLevelEntryCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return { exists: true, fileCount: 0, totalBytes: rootStat.size, topLevelEntryCount: 0, errors: ["Memory data path exists but is not a directory."] };
    }
  } catch (error) {
    if (isNotFoundError(error)) return { exists: false, fileCount: 0, totalBytes: 0, topLevelEntryCount: 0, errors };
    return { exists: false, fileCount: 0, totalBytes: 0, topLevelEntryCount: 0, errors: [errorMessage(error)] };
  }

  const topLevel = await readdir(root).catch((error) => {
    errors.push(errorMessage(error));
    return [];
  });
  const totals = await scanDirectory(root, errors);
  return {
    exists: true,
    fileCount: totals.fileCount,
    totalBytes: totals.totalBytes,
    topLevelEntryCount: topLevel.length,
    errors,
  };
}

async function scanDirectory(dir: string, errors: string[]): Promise<{ fileCount: number; totalBytes: number }> {
  let fileCount = 0;
  let totalBytes = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch((error) => {
    errors.push(errorMessage(error));
    return [];
  });
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      const child = await scanDirectory(path, errors);
      fileCount += child.fileCount;
      totalBytes += child.totalBytes;
      continue;
    }
    if (!entry.isFile()) continue;
    fileCount += 1;
    try {
      totalBytes += (await stat(path)).size;
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  return { fileCount, totalBytes };
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
