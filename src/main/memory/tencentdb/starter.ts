import type {
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryNativeDependencyPreflight,
  AgentMemoryStorageDiagnostics,
} from "../../../shared/agentMemoryDiagnostics";
import type { AgentMemorySettings, UpdateAgentMemorySettingsInput } from "../../../shared/agentMemorySettings";
import type {
  AgentMemoryStarterAssetStatus,
  AgentMemoryStarterBlocker,
  AgentMemoryStarterBlockerCode,
  AgentMemoryStarterEnableInput,
  AgentMemoryStarterNextAction,
  AgentMemoryStarterRuntimeStatus,
  AgentMemoryStarterState,
  AgentMemoryStarterStatus,
} from "../../../shared/agentMemoryStarter";
import type { AmbientFeatureFlagSettings } from "../../../shared/featureFlags";
import type { ThreadSummary } from "../../../shared/threadTypes";
import type { AmbientMemoryEmbeddingAssetDetection } from "./managedEmbeddingProvider";

export interface AgentMemoryStarterAssetSnapshot {
  model: AgentMemoryStarterAssetStatus;
  runtime: AgentMemoryStarterAssetStatus;
  runtimeStatus: AgentMemoryStarterRuntimeStatus;
}

export interface AgentMemoryStarterStatusInput {
  settings: {
    featureFlags: Pick<AmbientFeatureFlagSettings, "tencentDbMemory">;
    memory: AgentMemorySettings;
  };
  diagnostics: AgentMemoryStorageDiagnostics;
  assets: AgentMemoryStarterAssetSnapshot;
  runtimeOverride?: AgentMemoryStarterRuntimeStatus;
  activeThread?: Pick<ThreadSummary, "id" | "memoryEnabled">;
  operationId?: string;
  now?: Date;
}

export function agentMemoryStarterStatusFromDiagnostics(input: AgentMemoryStarterStatusInput): AgentMemoryStarterStatus {
  const checkedAt = (input.now ?? new Date(input.diagnostics.checkedAt)).toISOString();
  const memory = input.settings.memory;
  const embedding = input.diagnostics.embedding;
  const runtime = {
    ...runtimeStatusFromEmbedding(input.assets.runtimeStatus, embedding),
    ...input.runtimeOverride,
  };
  const nativePreflight = input.diagnostics.nativePreflight ?? missingNativePreflight(checkedAt);
  const threadScope = {
    ...(input.activeThread ? { activeThreadId: input.activeThread.id } : {}),
    activeThreadMemoryEnabled: input.activeThread ? Boolean(input.activeThread.memoryEnabled) : false,
    defaultThreadEnabled: memory.defaultThreadEnabled,
    enabledThreadCount: input.diagnostics.threadEnabledCount,
    activeThreadCount: input.diagnostics.activeThreadCount,
  };
  const requested = memory.enabled;
  const disabledRuntimeBlockers = requested ? [] : disabledRuntimeStarterBlockers(runtime, Boolean(input.runtimeOverride));
  const blockers = requested
    ? starterBlockers({
        diagnostics: input.diagnostics,
        memory,
        model: input.assets.model,
        runtimeAsset: input.assets.runtime,
        runtime,
        nativePreflight,
        activeThread: input.activeThread,
      })
    : disabledRuntimeBlockers;
  const state = starterState({
    requested: requested || disabledRuntimeBlockers.length > 0,
    blockers,
    embedding,
    runtime,
  });
  return {
    schemaVersion: "ambient-agent-memory-starter-status-v1",
    checkedAt,
    ...(input.operationId ? { operationId: input.operationId } : {}),
    state,
    settings: input.settings,
    threadScope,
    assets: {
      model: input.assets.model,
      runtime: input.assets.runtime,
    },
    runtime,
    embedding,
    nativePreflight,
    blockers,
    nextActions: starterNextActions({ state, blockers, embedding, runtime }),
  };
}

export function agentMemoryStarterAssetSnapshotFromDetection(
  detection: AmbientMemoryEmbeddingAssetDetection,
): AgentMemoryStarterAssetSnapshot {
  const model: AgentMemoryStarterAssetStatus = {
    state: detection.model.status,
    path: detection.model.cachePath,
    expectedBytes: detection.model.expectedBytes,
    ...(detection.model.sizeBytes !== undefined ? { actualBytes: detection.model.sizeBytes } : {}),
    expectedSha256: detection.model.expectedSha256,
    ...(detection.model.reason ? { message: detection.model.reason } : {}),
  };
  const runtime: AgentMemoryStarterAssetStatus = {
    state: detection.runtime.status,
    ...(detection.runtime.binaryPath ? { path: detection.runtime.binaryPath } : {}),
    ...(detection.runtime.artifactId ? { artifactId: detection.runtime.artifactId } : {}),
    ...(detection.runtime.receiptPath ? { receiptPath: detection.runtime.receiptPath } : {}),
    ...(detection.runtime.reason ? { message: detection.runtime.reason } : {}),
  };
  const state = detection.state;
  const liveState = state?.pid && state.endpointUrl && processAlive(state.pid) ? state : undefined;
  const runtimeStatus: AgentMemoryStarterRuntimeStatus = liveState
    ? {
        state: "running",
        runtimeId: liveState.profileId,
        endpoint: liveState.endpointUrl,
        message: "Ambient-managed memory embedding runtime state file reports a running endpoint.",
      }
    : detection.model.status === "present" && detection.runtime.status === "present"
      ? {
          state: "stopped",
          runtimeId: detection.state?.profileId,
          message: "Ambient-managed memory embedding assets are installed, but the endpoint is not running.",
        }
      : {
          state: detection.runtime.status === "unsupported" ? "blocked" : "unknown",
          runtimeId: detection.state?.profileId,
          message: detection.model.reason ?? detection.runtime.reason ?? "Ambient-managed memory embedding runtime is not ready.",
        };
  return { model, runtime, runtimeStatus };
}

export function agentMemoryStarterAssetSnapshotFromError(error: unknown): AgentMemoryStarterAssetSnapshot {
  const message = errorMessage(error);
  return {
    model: {
      state: "unknown",
      message: `Could not inspect the managed embedding model: ${message}`,
    },
    runtime: {
      state: "unknown",
      message: `Could not inspect the managed embedding runtime: ${message}`,
    },
    runtimeStatus: {
      state: "failed",
      message,
    },
  };
}

export function agentMemoryStarterEnableMemoryPatch(
  input: AgentMemoryStarterEnableInput = {},
  options: { enableNewThreadsDefault?: boolean } = { enableNewThreadsDefault: true },
): UpdateAgentMemorySettingsInput {
  const patch: UpdateAgentMemorySettingsInput = {
    enabled: true,
    adapter: "tencentdb",
    embeddings: {
      enabled: true,
      providerMode: "ambient-managed",
      providerCapabilityId: undefined,
      autoStartProvider: true,
      modelId: undefined,
      dimensions: undefined,
      sendDimensions: false,
      preflightEnabled: true,
    },
    storageScope: "workspace",
  };
  const enableNewThreads = input.enableNewThreads ?? options.enableNewThreadsDefault;
  if (typeof enableNewThreads === "boolean") patch.defaultThreadEnabled = enableNewThreads;
  return patch;
}

export function agentMemoryStarterDisableMemoryPatch(): UpdateAgentMemorySettingsInput {
  return {
    enabled: false,
    embeddings: {
      enabled: false,
      autoStartProvider: false,
    },
  };
}

function starterBlockers(input: {
  diagnostics: AgentMemoryStorageDiagnostics;
  memory: AgentMemorySettings;
  model: AgentMemoryStarterAssetStatus;
  runtimeAsset: AgentMemoryStarterAssetStatus;
  runtime: AgentMemoryStarterRuntimeStatus;
  nativePreflight: AgentMemoryNativeDependencyPreflight;
  activeThread?: Pick<ThreadSummary, "id" | "memoryEnabled">;
}): AgentMemoryStarterBlocker[] {
  const blockers: AgentMemoryStarterBlocker[] = [];
  const add = (
    code: AgentMemoryStarterBlockerCode,
    message: string,
    retryable: boolean,
    detail?: string,
  ) => {
    if (blockers.some((blocker) => blocker.code === code)) return;
    blockers.push({ code, message, retryable, ...(detail ? { detail } : {}) });
  };

  if (!input.diagnostics.featureEnabled) {
    add(
      "feature_disabled",
      "TencentDB Agent Memory is blocked by the resolved feature flag state.",
      false,
      "Check launch-time feature flag overrides before retrying setup.",
    );
  }
  if (!input.memory.enabled) {
    add("global_memory_disabled", "Agent Memory is disabled globally.", true);
  }
  if (input.diagnostics.featureEnabled && input.diagnostics.storageSchemaStatus === "unsupported") {
    add("storage_unhealthy", input.diagnostics.storageSchemaMessage, false);
  }
  if (
    input.diagnostics.featureEnabled &&
    input.diagnostics.status !== "healthy" &&
    !isEmbeddingOnlyDiagnosticsIssue(input.diagnostics)
  ) {
    add("storage_unhealthy", input.diagnostics.message, true);
  }
  if (!input.memory.embeddings.enabled || input.memory.embeddings.providerMode !== "ambient-managed" || !input.memory.embeddings.autoStartProvider) {
    add(
      "managed_embeddings_disabled",
      "Ambient-managed embeddings must be enabled with auto-start for Agent Memory setup.",
      true,
    );
  }
  if (input.activeThread && !input.activeThread.memoryEnabled) {
    add("thread_memory_disabled", "Agent Memory is disabled for the active thread.", true);
  }

  if (input.model.state === "missing") {
    add("model_missing", input.model.message ?? "EmbeddingGemma model asset is missing.", true, input.model.path);
  } else if (input.model.state === "mismatch") {
    add("model_mismatch", input.model.message ?? "EmbeddingGemma model asset does not match the expected receipt.", true, input.model.path);
  } else if (input.model.state === "unsupported") {
    add("model_missing", input.model.message ?? "EmbeddingGemma model asset is unsupported on this host.", false);
  }

  if (input.runtimeAsset.state === "missing") {
    add("runtime_missing", input.runtimeAsset.message ?? "Shared llama.cpp runtime asset is missing.", true, input.runtimeAsset.path);
  } else if (input.runtimeAsset.state === "unsupported") {
    add("runtime_unsupported", input.runtimeAsset.message ?? "No supported shared llama.cpp runtime is available for this host.", false);
  } else if (input.runtimeAsset.state === "mismatch") {
    add("runtime_missing", input.runtimeAsset.message ?? "Shared llama.cpp runtime asset does not match the expected receipt.", true, input.runtimeAsset.path);
  }

  if (input.runtime.state === "blocked") {
    add("resident_runtime_conflict", input.runtime.message ?? "Another local runtime is blocking memory embeddings.", true);
  } else if (input.runtime.state === "failed") {
    add("start_failed", input.runtime.message ?? "Ambient-managed memory embeddings failed to start.", true);
  }

  if (input.nativePreflight.status !== "healthy") {
    add("native_preflight_failed", input.nativePreflight.message, true);
  }
  if (input.diagnostics.embedding.status === "error") {
    add(
      "embedding_preflight_failed",
      input.diagnostics.embedding.lastError ?? input.diagnostics.embedding.message,
      true,
    );
  } else if (
    input.diagnostics.embedding.status === "unavailable" &&
    !blockers.some((blocker) => blocker.code === "model_missing" || blocker.code === "runtime_missing" || blocker.code === "runtime_unsupported")
  ) {
    add("start_failed", input.diagnostics.embedding.message, true);
  }
  return blockers;
}

function isEmbeddingOnlyDiagnosticsIssue(diagnostics: AgentMemoryStorageDiagnostics): boolean {
  if (diagnostics.status === "healthy" || diagnostics.embedding.status !== "error") return false;
  return diagnostics.message === diagnostics.embedding.message;
}

function disabledRuntimeStarterBlockers(
  runtime: AgentMemoryStarterRuntimeStatus,
  explicitDisableFailure: boolean,
): AgentMemoryStarterBlocker[] {
  if (runtime.state !== "running" && !(explicitDisableFailure && ["blocked", "failed"].includes(runtime.state))) return [];
  const message = runtime.message ?? (runtime.state === "running"
    ? "Ambient-managed memory embeddings are still running after Agent Memory was disabled."
    : "Ambient-managed memory embeddings could not stop cleanly.");
  return [{
    code: "stop_failed",
    message,
    retryable: true,
  }];
}

function starterState(input: {
  requested: boolean;
  blockers: AgentMemoryStarterBlocker[];
  embedding: AgentMemoryEmbeddingDiagnostics;
  runtime: AgentMemoryStarterRuntimeStatus;
}): AgentMemoryStarterState {
  if (!input.requested) return "off";
  if (input.embedding.status === "starting" || input.runtime.state === "starting") return "starting";
  if (
    input.blockers.some((blocker) =>
      blocker.code === "native_preflight_failed" ||
      blocker.code === "embedding_preflight_failed" ||
      blocker.code === "storage_unhealthy" ||
      blocker.code === "model_mismatch" ||
      blocker.code === "runtime_unsupported" ||
      blocker.code === "resident_runtime_conflict" ||
      blocker.code === "start_failed" ||
      blocker.code === "stop_failed"
    )
  ) {
    return "needs_repair";
  }
  if (!input.blockers.length && input.embedding.status === "ready" && input.runtime.state === "running") {
    return "ready";
  }
  return "setup_required";
}

function starterNextActions(input: {
  state: AgentMemoryStarterState;
  blockers: AgentMemoryStarterBlocker[];
  embedding: AgentMemoryEmbeddingDiagnostics;
  runtime: AgentMemoryStarterRuntimeStatus;
}): AgentMemoryStarterNextAction[] {
  const actions: AgentMemoryStarterNextAction[] = [];
  const push = (action: AgentMemoryStarterNextAction) => {
    if (!actions.includes(action)) actions.push(action);
  };
  if (input.state === "off") {
    push("enable");
    return actions;
  }
  if (input.state === "ready") {
    push("disable");
    push("clear_memory");
    return actions;
  }

  if (input.blockers.some((blocker) => blocker.code === "model_missing" || blocker.code === "runtime_missing")) push("install");
  if (input.blockers.some((blocker) => blocker.code === "managed_embeddings_disabled" || blocker.code === "thread_memory_disabled" || blocker.code === "global_memory_disabled")) push("enable");
  if (
    input.blockers.length === 0 &&
    input.runtime.state !== "blocked" &&
    input.runtime.state !== "failed" &&
    (input.runtime.state === "stopped" || input.embedding.status === "keyword_fallback")
  ) {
    push("start");
  }
  if (input.blockers.some((blocker) => blocker.code === "native_preflight_failed" || blocker.code === "embedding_preflight_failed")) push("retry_preflight");
  const hasStopFailed = input.blockers.some((blocker) => blocker.code === "stop_failed");
  if (
    !hasStopFailed &&
    (input.state === "needs_repair" || input.blockers.some((blocker) => blocker.code === "storage_unhealthy" || blocker.code === "model_mismatch" || blocker.code === "runtime_unsupported" || blocker.code === "resident_runtime_conflict" || blocker.code === "start_failed"))
  ) {
    push("repair");
  }
  if (input.blockers.some((blocker) => !blocker.retryable || blocker.code === "storage_unhealthy" || blocker.code === "start_failed" || blocker.code === "stop_failed" || blocker.code === "resident_runtime_conflict")) push("open_logs");
  push("disable");
  return actions;
}

function runtimeStatusFromEmbedding(
  current: AgentMemoryStarterRuntimeStatus,
  embedding: AgentMemoryEmbeddingDiagnostics,
): AgentMemoryStarterRuntimeStatus {
  if (embedding.runtimeStatus === "failed") {
    return { ...current, state: "failed", message: embedding.lastError ?? embedding.message };
  }
  if (embedding.runtimeStatus === "blocked") {
    return { ...current, state: "blocked", message: embedding.message };
  }
  if (embedding.runtimeStatus === "starting" || embedding.status === "starting") {
    return { ...current, state: "starting", message: embedding.message };
  }
  if (current.state === "running" && (embedding.running || embedding.runtimeStatus === "running")) {
    return {
      ...current,
      state: "running",
      ...(embedding.runtimeId ? { runtimeId: embedding.runtimeId } : {}),
      ...(embedding.endpoint ? { endpoint: embedding.endpoint } : {}),
      message: embedding.message,
    };
  }
  return current;
}

function missingNativePreflight(checkedAt: string): AgentMemoryNativeDependencyPreflight {
  return {
    schemaVersion: "ambient-agent-memory-native-preflight-v1",
    checkedAt,
    platform: process.platform,
    arch: process.arch,
    coreModuleConfigured: false,
    status: "unavailable",
    message: "TencentDB Agent Memory native dependency preflight has not run.",
    dependencies: [],
    errors: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    return code === "EPERM";
  }
}
