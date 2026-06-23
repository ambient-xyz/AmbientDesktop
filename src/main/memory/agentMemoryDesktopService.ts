import { randomUUID } from "node:crypto";
import type {
  AgentMemoryClearInput,
  AgentMemoryClearResult,
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryEmbeddingLifecycleActionInput,
  AgentMemoryEmbeddingLifecycleActionKind,
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemoryRuntimeSnapshot,
  AgentMemoryStorageDiagnostics,
} from "../../shared/agentMemoryDiagnostics";
import {
  agentMemoryStorageDiagnosticsWithEmbedding,
  mergeAgentMemoryEmbeddingLifecycleDiagnostics,
  mergeAgentMemoryEmbeddingLiveDiagnostics,
} from "../../shared/agentMemoryDiagnostics";
import {
  agentMemoryModeAllowsManagedRuntime,
  normalizeAgentMemorySettings,
  shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate,
  type AgentMemorySettings,
  type UpdateAgentMemorySettingsInput,
} from "../../shared/agentMemorySettings";
import type {
  AgentMemoryStarterDisableInput,
  AgentMemoryStarterEnableInput,
  AgentMemoryStarterOperationLogEntry,
  AgentMemoryStarterOperationResult,
  AgentMemoryStarterRepairInput,
  AgentMemoryStarterRuntimeStatus,
  AgentMemoryStarterStatus,
} from "../../shared/agentMemoryStarter";
import {
  isAmbientTencentDbMemoryEnabled,
  type AmbientFeatureFlagSnapshot,
  type UpdateFeatureFlagSettingsInput,
} from "../../shared/featureFlags";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  clearTencentDbMemoryStorage,
  inspectTencentDbMemoryDiagnostics,
} from "./tencentdb/diagnostics";
import {
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  detectAmbientMemoryEmbeddingAssets,
  repairAmbientMemoryResidentConflicts,
  runAmbientMemoryEmbeddingLifecycleAction,
} from "./tencentdb/managedEmbeddingProvider";
import { installAmbientMemoryEmbeddingAssets } from "./tencentdb/managedEmbeddingInstaller";
import {
  agentMemoryStarterAssetSnapshotFromDetection,
  agentMemoryStarterAssetSnapshotFromError,
  agentMemoryStarterDisableMemoryPatch,
  agentMemoryStarterEnableMemoryPatch,
  agentMemoryStarterStatusFromDiagnostics,
} from "./tencentdb/starter";

interface AgentMemoryDesktopProjectStore {
  getWorkspace(): WorkspaceState;
  getMemorySettings(): AgentMemorySettings;
  listThreads(): ThreadSummary[];
  getThread(threadId: string): ThreadSummary;
  updateThreadSettings(threadId: string, settings: { memoryEnabled?: boolean }): void;
}

interface AgentMemoryDesktopRuntime {
  listAgentMemoryRuntimeSnapshots(): readonly AgentMemoryRuntimeSnapshot[];
  applyMemorySettings(): AgentMemoryClearResult["activeSessionsReset"];
  applyThreadMemorySettings(threadId: string): void;
}

export interface AgentMemoryDesktopProjectRuntimeHost {
  workspacePath: string;
  store: AgentMemoryDesktopProjectStore;
  runtime: AgentMemoryDesktopRuntime;
  disposed?: boolean;
  agentMemoryEmbeddingRuntimeLeaseId?: string;
  agentMemoryEmbeddingRuntimeRelease?: () => Promise<void>;
}

export interface AgentMemoryDesktopServiceDependencies {
  activeThreadIdForHost(host: AgentMemoryDesktopProjectRuntimeHost): string;
  currentFeatureFlagSnapshot(targetStore: AgentMemoryDesktopProjectStore): AmbientFeatureFlagSnapshot;
  emitProjectStateIfActive(host: AgentMemoryDesktopProjectRuntimeHost, threadId?: string): void;
  normalizeWorkspacePath(workspacePath: string): string;
  requireActiveProjectRuntimeHost(): AgentMemoryDesktopProjectRuntimeHost;
  updateFeatureFlagSettings(
    input: UpdateFeatureFlagSettingsInput,
    host: AgentMemoryDesktopProjectRuntimeHost,
    options?: { runManagedEmbeddingLifecycle?: boolean },
  ): Promise<unknown>;
  updateMemorySettings(
    input: UpdateAgentMemorySettingsInput,
    host: AgentMemoryDesktopProjectRuntimeHost,
    options?: { runManagedEmbeddingLifecycle?: boolean; startManagedEmbeddings?: boolean },
  ): Promise<AgentMemorySettings>;
}

let agentMemoryDesktopServices: AgentMemoryDesktopServiceDependencies | undefined;

export function configureAgentMemoryDesktopService(dependencies: AgentMemoryDesktopServiceDependencies): void {
  agentMemoryDesktopServices = dependencies;
}

function services(): AgentMemoryDesktopServiceDependencies {
  if (!agentMemoryDesktopServices) throw new Error("Agent Memory desktop service has not been configured.");
  return agentMemoryDesktopServices;
}

function requireActiveProjectRuntimeHost(): AgentMemoryDesktopProjectRuntimeHost {
  return services().requireActiveProjectRuntimeHost();
}

function activeThreadIdForHost(host: AgentMemoryDesktopProjectRuntimeHost): string {
  return services().activeThreadIdForHost(host);
}

function currentFeatureFlagSnapshot(targetStore: AgentMemoryDesktopProjectStore): AmbientFeatureFlagSnapshot {
  return services().currentFeatureFlagSnapshot(targetStore);
}

function emitProjectStateIfActive(host: AgentMemoryDesktopProjectRuntimeHost, threadId?: string): void {
  services().emitProjectStateIfActive(host, threadId);
}

function normalizeWorkspacePath(workspacePath: string): string {
  return services().normalizeWorkspacePath(workspacePath);
}

function updateFeatureFlagSettings(
  input: UpdateFeatureFlagSettingsInput,
  host: AgentMemoryDesktopProjectRuntimeHost,
  options?: { runManagedEmbeddingLifecycle?: boolean },
): Promise<unknown> {
  return services().updateFeatureFlagSettings(input, host, options);
}

function updateMemorySettings(
  input: UpdateAgentMemorySettingsInput,
  host: AgentMemoryDesktopProjectRuntimeHost,
  options?: { runManagedEmbeddingLifecycle?: boolean; startManagedEmbeddings?: boolean },
): Promise<AgentMemorySettings> {
  return services().updateMemorySettings(input, host, options);
}

function agentMemoryManagedEmbeddingAutoStartEnabled(targetStore: AgentMemoryDesktopProjectStore): boolean {
  return agentMemoryDefaultManagedEmbeddingAutoStartEnabled(targetStore.getMemorySettings(), targetStore);
}

export function agentMemoryDefaultManagedEmbeddingAutoStartEnabled(
  settings: AgentMemorySettings,
  targetStore: AgentMemoryDesktopProjectStore,
): boolean {
  return agentMemoryDefaultManagedEmbeddingAutoStartEnabledForFeature(
    settings,
    isAmbientTencentDbMemoryEnabled(currentFeatureFlagSnapshot(targetStore)),
  );
}

export function agentMemoryDefaultManagedEmbeddingAutoStartEnabledForFeature(
  settings: AgentMemorySettings,
  featureEnabled: boolean,
): boolean {
  return Boolean(
    featureEnabled &&
    agentMemoryModeAllowsManagedRuntime(settings) &&
    settings.enabled &&
    settings.embeddings.enabled &&
    settings.embeddings.providerMode === "ambient-managed" &&
    settings.embeddings.autoStartProvider &&
    agentMemoryUsesDefaultManagedEmbeddingProvider(settings),
  );
}

function agentMemoryUsesDefaultManagedEmbeddingProvider(settings: AgentMemorySettings): boolean {
  return !settings.embeddings.providerCapabilityId ||
    settings.embeddings.providerCapabilityId === AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID;
}

export function startAgentMemoryManagedEmbeddingsAfterSettingsUpdate(
  host: AgentMemoryDesktopProjectRuntimeHost,
  targetStore: AgentMemoryDesktopProjectStore,
): void {
  enqueueAgentMemoryEmbeddingLifecycleBackgroundOperation(host, targetStore, "settings-start", async () => {
    if (host.disposed) return;
    if (!agentMemoryManagedEmbeddingAutoStartEnabled(targetStore)) return;
    await runAgentMemoryEmbeddingLifecycleActionWithoutQueue({ action: "start" }, host);
    if (host.disposed) return;
    if (!agentMemoryManagedEmbeddingAutoStartEnabled(targetStore)) {
      await runAgentMemoryEmbeddingLifecycleActionWithoutQueue({ action: "stop" }, host);
    }
    emitProjectStateIfActive(host);
  });
}

export function stopAgentMemoryManagedEmbeddingsAfterSettingsUpdate(
  host: AgentMemoryDesktopProjectRuntimeHost,
  targetStore: AgentMemoryDesktopProjectStore,
): void {
  enqueueAgentMemoryEmbeddingLifecycleBackgroundOperation(host, targetStore, "settings-stop", async () => {
    if (host.disposed) return;
    if (agentMemoryManagedEmbeddingAutoStartEnabled(targetStore)) return;
    await runAgentMemoryEmbeddingLifecycleActionWithoutQueue({ action: "stop" }, host);
    emitProjectStateIfActive(host);
  });
}

export function runAgentMemoryStartupReconciliation(
  reason: "project-runtime-created",
  host: AgentMemoryDesktopProjectRuntimeHost,
  options: {
    featureEnabled?: boolean;
    start?: typeof runAgentMemoryEmbeddingLifecycleAction;
    stop?: typeof runAgentMemoryEmbeddingLifecycleAction;
    warn?: (message: string) => void;
  } = {},
): void {
  const start = options.start ?? runAgentMemoryEmbeddingLifecycleAction;
  const stop = options.stop ?? runAgentMemoryEmbeddingLifecycleAction;
  const warn = options.warn ?? console.warn;
  const settings = normalizeAgentMemorySettings(host.store.getMemorySettings());
  if (!settings.enabled || settings.adapter !== "tencentdb" || !agentMemoryModeAllowsManagedRuntime(settings)) return;
  const featureEnabled = options.featureEnabled ?? isAmbientTencentDbMemoryEnabled(currentFeatureFlagSnapshot(host.store));
  if (!shouldRunAgentMemoryStartupReconciliation(host, settings, featureEnabled)) return;
  void start({ action: "start" }, host).then((result) => {
    const currentSettings = normalizeAgentMemorySettings(host.store.getMemorySettings());
    const currentFeatureEnabled = options.featureEnabled ?? isAmbientTencentDbMemoryEnabled(currentFeatureFlagSnapshot(host.store));
    if (!shouldRunAgentMemoryStartupReconciliation(host, currentSettings, currentFeatureEnabled)) {
      void stop({ action: "stop" }, host).catch((error) => {
        warn(`Agent Memory ${reason} startup stop after opt-out failed: ${agentMemoryStarterErrorMessage(error)}`);
      });
      return;
    }
    if (result.status === "ready" || result.status === "started" || host.disposed) return;
    warn(`[memory] ${reason} startup start completed with status=${result.status}: ${result.message}`);
  }, (error) => {
    warn(`Agent Memory ${reason} startup start failed: ${agentMemoryStarterErrorMessage(error)}`);
  });
}

function shouldRunAgentMemoryStartupReconciliation(
  host: AgentMemoryDesktopProjectRuntimeHost,
  settings: AgentMemorySettings,
  featureEnabled: boolean,
): boolean {
  if (host.disposed) return false;
  if (!agentMemoryDefaultManagedEmbeddingAutoStartEnabledForFeature(settings, featureEnabled)) return false;
  if (settings.mode === "enabled_all") return true;
  if (settings.mode !== "per_thread") return false;
  return host.store.listThreads().some((thread) => thread.kind !== "subagent_child" && Boolean(thread.memoryEnabled));
}

export async function getAgentMemoryDiagnostics(
  host = requireActiveProjectRuntimeHost(),
  options: { liveEmbeddingCheck?: boolean } = {},
) {
  const diagnostics = await inspectTencentDbMemoryDiagnostics({
    workspace: host.store.getWorkspace(),
    settings: host.store.getMemorySettings(),
    featureFlagSnapshot: currentFeatureFlagSnapshot(host.store),
    threads: host.store.listThreads(),
    runtimeSnapshots: host.runtime.listAgentMemoryRuntimeSnapshots(),
  });
  if (options.liveEmbeddingCheck === false) return diagnostics;
  return agentMemoryDiagnosticsWithEmbeddingCheck(host, diagnostics);
}

const activeAgentMemoryStarterOperations = new Map<string, {
  operation: "enable" | "repair" | "disable";
  requestKey: string;
  promise: Promise<AgentMemoryStarterOperationResult>;
}>();
const activeAgentMemoryEmbeddingLifecycleOperations = new Map<string, Promise<void>>();

function enqueueAgentMemoryEmbeddingLifecycleBackgroundOperation(
  host: AgentMemoryDesktopProjectRuntimeHost,
  targetStore: AgentMemoryDesktopProjectStore,
  operation: "settings-start" | "settings-stop",
  run: () => Promise<void>,
): void {
  void enqueueAgentMemoryEmbeddingLifecycleOperation(host, targetStore, operation, run).catch((error) => {
    console.warn(`Agent Memory managed embedding settings ${operation} operation failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function enqueueAgentMemoryEmbeddingLifecycleOperation<T>(
  host: AgentMemoryDesktopProjectRuntimeHost,
  targetStore: AgentMemoryDesktopProjectStore,
  _operation: AgentMemoryEmbeddingLifecycleActionInput["action"] | "settings-start" | "settings-stop",
  run: () => Promise<T>,
): Promise<T> {
  const workspacePath = targetStore.getWorkspace().path;
  const previous = activeAgentMemoryEmbeddingLifecycleOperations.get(workspacePath) ?? Promise.resolve();
  const operationPromise = previous.catch(() => undefined).then(run);
  const queuePromise = operationPromise
    .then(() => undefined, () => undefined)
    .finally(() => {
      if (activeAgentMemoryEmbeddingLifecycleOperations.get(workspacePath) === queuePromise) {
        activeAgentMemoryEmbeddingLifecycleOperations.delete(workspacePath);
      }
    });
  activeAgentMemoryEmbeddingLifecycleOperations.set(workspacePath, queuePromise);
  return operationPromise;
}

export async function getAgentMemoryStarterStatus(
  host = requireActiveProjectRuntimeHost(),
  operationId?: string,
): Promise<AgentMemoryStarterStatus> {
  return readAgentMemoryStarterStatus(host, operationId);
}

export async function enableAgentMemoryStarter(
  input: AgentMemoryStarterEnableInput = {},
  host = requireActiveProjectRuntimeHost(),
): Promise<AgentMemoryStarterOperationResult> {
  return runAgentMemoryStarterOperationWithLock(host, "enable", input, () => runAgentMemoryStarterSetupOperation("enable", input, host));
}

export async function repairAgentMemoryStarter(
  input: AgentMemoryStarterRepairInput = {},
  host = requireActiveProjectRuntimeHost(),
): Promise<AgentMemoryStarterOperationResult> {
  if (host.store.getMemorySettings().mode === "disabled") {
    return runAgentMemoryStarterOperationWithLock(host, "disable", input, () => runAgentMemoryStarterDisableOperation(host));
  }
  return runAgentMemoryStarterOperationWithLock(host, "repair", input, () => runAgentMemoryStarterSetupOperation("repair", input, host));
}

export async function disableAgentMemoryStarter(
  input: AgentMemoryStarterDisableInput = {},
  host = requireActiveProjectRuntimeHost(),
): Promise<AgentMemoryStarterOperationResult> {
  return runAgentMemoryStarterOperationWithLock(host, "disable", input, () => runAgentMemoryStarterDisableOperation(host));
}

async function runAgentMemoryStarterOperationWithLock(
  host: AgentMemoryDesktopProjectRuntimeHost,
  operation: "enable" | "repair" | "disable",
  input: AgentMemoryStarterEnableInput | AgentMemoryStarterRepairInput | AgentMemoryStarterDisableInput,
  run: () => Promise<AgentMemoryStarterOperationResult>,
): Promise<AgentMemoryStarterOperationResult> {
  const workspacePath = host.store.getWorkspace().path;
  const active = activeAgentMemoryStarterOperations.get(workspacePath);
  const requestKey = agentMemoryStarterOperationRequestKey(input);
  if (active) {
    if (active.operation === operation && active.requestKey === requestKey) return active.promise;
    throw new Error(`Agent Memory starter ${active.operation} operation is already in progress for this workspace.`);
  }
  const promise = run().finally(() => {
    if (activeAgentMemoryStarterOperations.get(workspacePath)?.promise === promise) {
      activeAgentMemoryStarterOperations.delete(workspacePath);
    }
  });
  activeAgentMemoryStarterOperations.set(workspacePath, { operation, requestKey, promise });
  return promise;
}

async function runAgentMemoryStarterDisableOperation(
  host: AgentMemoryDesktopProjectRuntimeHost,
): Promise<AgentMemoryStarterOperationResult> {
  const operationId = randomUUID();
  const startedAt = new Date().toISOString();
  const log: AgentMemoryStarterOperationLogEntry[] = [];
  let runtimeOverride: AgentMemoryStarterRuntimeStatus | undefined;
  appendAgentMemoryStarterLog(log, "disable", "started", "Disabling Agent Memory.");
  await updateMemorySettings(agentMemoryStarterDisableMemoryPatch(), host, { runManagedEmbeddingLifecycle: false });
  appendAgentMemoryStarterLog(log, "settings", "passed", "Agent Memory mode is disabled and managed embeddings are stopped; stored memories are preserved.");
  try {
    const stopped = await runAgentMemoryEmbeddingLifecycleAction({ action: "stop" }, host);
    appendAgentMemoryStarterLog(
      log,
      "stop-embeddings",
      stopped.status === "failed" ? "failed" : stopped.status === "blocked" ? "blocked" : "passed",
      stopped.message,
    );
    if (stopped.status === "failed" || stopped.status === "blocked") {
      runtimeOverride = {
        state: stopped.status === "blocked" ? "blocked" : "failed",
        message: stopped.message,
      };
    }
  } catch (error) {
    const message = agentMemoryStarterErrorMessage(error);
    runtimeOverride = {
      state: "failed",
      message,
    };
    appendAgentMemoryStarterLog(log, "stop-embeddings", "failed", message, "stop_failed");
  }
  const status = await readAgentMemoryStarterStatus(host, operationId, undefined, runtimeOverride);
  return {
    schemaVersion: "ambient-agent-memory-starter-operation-result-v1",
    operationId,
    operation: "disable",
    startedAt,
    completedAt: new Date().toISOString(),
    status,
    log,
  };
}

async function runAgentMemoryStarterSetupOperation(
  operation: "enable" | "repair",
  input: AgentMemoryStarterEnableInput | AgentMemoryStarterRepairInput,
  host: AgentMemoryDesktopProjectRuntimeHost,
): Promise<AgentMemoryStarterOperationResult> {
  const operationId = randomUUID();
  const startedAt = new Date().toISOString();
  const log: AgentMemoryStarterOperationLogEntry[] = [];
  appendAgentMemoryStarterLog(log, operation, "started", `${operation === "repair" ? "Repairing" : "Enabling"} Agent Memory.`);
  await updateFeatureFlagSettings({ tencentDbMemory: true }, host, { runManagedEmbeddingLifecycle: false });
  appendAgentMemoryStarterLog(log, "feature-flag", "passed", "TencentDB Agent Memory feature gate is enabled for this workspace.");
  const memoryBeforeEnable = host.store.getMemorySettings();
  await updateMemorySettings(
    agentMemoryStarterEnableMemoryPatch(input, {
      enableNewThreadsDefault: operation === "enable" && memoryBeforeEnable.mode === "disabled" ? true : undefined,
      modeDefault: operation === "repair"
        ? memoryBeforeEnable.mode
        : memoryBeforeEnable.mode === "disabled" ? "enabled_all" : memoryBeforeEnable.mode,
    }),
    host,
    { runManagedEmbeddingLifecycle: false, startManagedEmbeddings: false },
  );
  appendAgentMemoryStarterLog(log, "settings", "passed", "Agent Memory policy and managed embedding auto-start are configured.");

  const threadId = activeThreadIdForHost(host);
  const shouldEnableCurrentThread = operation === "enable"
    ? input.enableCurrentThread !== false
    : input.enableCurrentThread === true;
  if (!shouldEnableCurrentThread) {
    appendAgentMemoryStarterLog(log, "active-thread", "skipped", "Active thread memory was left unchanged by request.");
  } else {
    const activeThread = host.store.getThread(threadId);
    if (activeThread.memoryEnabled) {
      appendAgentMemoryStarterLog(log, "active-thread", "skipped", `Agent Memory was already enabled for thread ${threadId}.`);
    } else {
      host.store.updateThreadSettings(threadId, { memoryEnabled: true });
      host.runtime.applyThreadMemorySettings(threadId);
      appendAgentMemoryStarterLog(log, "active-thread", "passed", `Agent Memory is enabled for thread ${threadId}.`);
      emitProjectStateIfActive(host, threadId);
    }
  }

  let assetsReadyForStart = false;
  try {
    const install = await installAmbientMemoryEmbeddingAssets({
      workspacePath: host.store.getWorkspace().path,
      action: operation === "repair" ? "repair" : "install",
    });
    const modelStatus = install.modelInstall?.status ?? "skipped";
    appendAgentMemoryStarterLog(
      log,
      "install-model",
      modelStatus === "failed" ? "failed" : modelStatus === "skipped" ? "skipped" : "passed",
      install.modelInstall?.error ?? `EmbeddingGemma model install ${modelStatus}.`,
      modelStatus === "failed" ? "install_failed" : undefined,
      install.modelInstall?.cachePath,
    );
    const runtimeStatus = install.runtimeInstall?.status ?? "skipped";
    appendAgentMemoryStarterLog(
      log,
      "install-runtime",
      runtimeStatus === "failed" || runtimeStatus === "unsupported" ? "failed" : runtimeStatus === "skipped" ? "skipped" : "passed",
      install.runtimeInstall?.error ?? `Shared llama.cpp runtime install ${runtimeStatus}.`,
      runtimeStatus === "failed" || runtimeStatus === "unsupported" ? "install_failed" : undefined,
      install.runtimeInstall?.receiptPath ?? install.runtimeInstall?.binaryPath,
    );
    assetsReadyForStart = install.managedAssets.model.status === "present" && install.managedAssets.runtime.status === "present";
    if (!assetsReadyForStart) {
      appendAgentMemoryStarterLog(
        log,
        "install-assets",
        install.status === "failed" ? "failed" : "blocked",
        install.nextActions[0] ?? "Agent Memory managed embedding assets are not ready.",
        "install_failed",
      );
    }
  } catch (error) {
    appendAgentMemoryStarterLog(log, "install-assets", "failed", agentMemoryStarterErrorMessage(error), "install_failed");
  }

  let lifecycleDiagnostics: AgentMemoryStorageDiagnostics | undefined;
  let runtimeOverride: AgentMemoryStarterRuntimeStatus | undefined;
  let residentCleanupBlocksStart = false;
  if (assetsReadyForStart && operation === "repair") {
    try {
      appendAgentMemoryStarterLog(
        log,
        "resident-cleanup",
        "started",
        "Inspecting resident llama.cpp runtimes before retrying memory embeddings.",
      );
      const cleanup = await repairAmbientMemoryResidentConflicts({
        workspacePath: host.store.getWorkspace().path,
      });
      appendAgentMemoryStarterLog(
        log,
        "resident-cleanup",
        cleanup.status === "clean" ? cleanup.stopped.length > 0 ? "passed" : "skipped" : cleanup.status,
        cleanup.reason,
        cleanup.status === "clean" ? undefined : "resident_runtime_conflict",
      );
      if (cleanup.status !== "clean") {
        residentCleanupBlocksStart = true;
        runtimeOverride = {
          state: cleanup.status === "failed" ? "failed" : "blocked",
          message: cleanup.reason,
        };
      }
    } catch (error) {
      const message = agentMemoryStarterErrorMessage(error);
      residentCleanupBlocksStart = true;
      runtimeOverride = {
        state: "failed",
        message,
      };
      appendAgentMemoryStarterLog(log, "resident-cleanup", "failed", message, "resident_runtime_conflict");
    }
  }

  if (assetsReadyForStart && !residentCleanupBlocksStart) {
    try {
      const started = await runAgentMemoryEmbeddingLifecycleAction({ action: "start" }, host);
      lifecycleDiagnostics = started.diagnostics;
      appendAgentMemoryStarterLog(
        log,
        "start-embeddings",
        started.status === "failed" ? "failed" : started.status === "blocked" ? "blocked" : "passed",
        started.message,
      );
    } catch (error) {
      appendAgentMemoryStarterLog(log, "start-embeddings", "failed", agentMemoryStarterErrorMessage(error), "start_failed");
    }
  } else if (residentCleanupBlocksStart) {
    appendAgentMemoryStarterLog(log, "start-embeddings", "skipped", "Embedding runtime start skipped because resident cleanup did not complete.");
  } else {
    appendAgentMemoryStarterLog(log, "start-embeddings", "skipped", "Embedding runtime start skipped until managed assets are installed.");
  }

  const status = await readAgentMemoryStarterStatus(host, operationId, lifecycleDiagnostics, runtimeOverride);
  if (status.state !== "ready" && status.blockers[0]) {
    const blocker = status.blockers[0];
    appendAgentMemoryStarterLog(log, "final-status", "blocked", blocker.message, blocker.code);
  } else if (status.state !== "ready") {
    appendAgentMemoryStarterLog(log, "final-status", "blocked", `Agent Memory starter is ${status.state}; next action: ${status.nextActions[0] ?? "inspect diagnostics"}.`);
  } else {
    appendAgentMemoryStarterLog(log, "final-status", "passed", "Agent Memory starter status is ready.");
  }
  return {
    schemaVersion: "ambient-agent-memory-starter-operation-result-v1",
    operationId,
    operation,
    startedAt,
    completedAt: new Date().toISOString(),
    status,
    log,
  };
}

async function readAgentMemoryStarterStatus(
  host: AgentMemoryDesktopProjectRuntimeHost,
  operationId?: string,
  diagnosticsOverride?: AgentMemoryStorageDiagnostics,
  runtimeOverride?: AgentMemoryStarterRuntimeStatus,
): Promise<AgentMemoryStarterStatus> {
  const workspace = host.store.getWorkspace();
  const activeThread = host.store.getThread(activeThreadIdForHost(host));
  const [baseDiagnostics, assets] = await Promise.all([
    diagnosticsOverride ? Promise.resolve(diagnosticsOverride) : getAgentMemoryDiagnostics(host),
    detectAmbientMemoryEmbeddingAssets(workspace.path)
      .then(agentMemoryStarterAssetSnapshotFromDetection)
      .catch(agentMemoryStarterAssetSnapshotFromError),
  ]);
  const diagnostics = baseDiagnostics;
  return agentMemoryStarterStatusFromDiagnostics({
    settings: {
      featureFlags: { tencentDbMemory: diagnostics.featureEnabled },
      memory: host.store.getMemorySettings(),
    },
    diagnostics,
    assets,
    ...(runtimeOverride ? { runtimeOverride } : {}),
    activeThread,
    operationId,
  });
}

async function agentMemoryDiagnosticsWithEmbeddingCheck(
  host: AgentMemoryDesktopProjectRuntimeHost,
  diagnostics: AgentMemoryStorageDiagnostics,
): Promise<AgentMemoryStorageDiagnostics> {
  const settings = host.store.getMemorySettings();
  if (
    !diagnostics.featureEnabled ||
    !diagnostics.settingsEnabled ||
    !agentMemoryModeAllowsManagedRuntime(settings) ||
    !settings.embeddings.enabled ||
    settings.embeddings.providerMode !== "ambient-managed"
  ) {
    return diagnostics;
  }
  try {
    const lifecycle = await runAmbientMemoryEmbeddingLifecycleAction({
      workspacePath: host.store.getWorkspace().path,
      action: "check",
      sendDimensions: settings.embeddings.sendDimensions,
      timeoutMs: settings.embeddings.timeoutMs,
    });
    return agentMemoryStorageDiagnosticsWithEmbedding(
      diagnostics,
      mergeAgentMemoryEmbeddingLiveDiagnostics(
        diagnostics.embedding,
        agentMemoryEmbeddingDiagnosticsFromLifecycle(settings, lifecycle, "check"),
      ),
    );
  } catch {
    return diagnostics;
  }
}

function appendAgentMemoryStarterLog(
  log: AgentMemoryStarterOperationLogEntry[],
  step: string,
  status: AgentMemoryStarterOperationLogEntry["status"],
  message: string,
  blockerCode?: AgentMemoryStarterOperationLogEntry["blockerCode"],
  artifactPath?: string,
): void {
  log.push({
    at: new Date().toISOString(),
    step,
    status,
    message,
    ...(blockerCode ? { blockerCode } : {}),
    ...(artifactPath ? { artifactPath } : {}),
  });
}

function agentMemoryStarterOperationRequestKey(
  input: AgentMemoryStarterEnableInput | AgentMemoryStarterRepairInput | AgentMemoryStarterDisableInput,
): string {
  return JSON.stringify(Object.keys(input).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = (input as Record<string, unknown>)[key];
    return result;
  }, {}));
}

function agentMemoryStarterErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runAgentMemoryEmbeddingLifecycleAction(
  input: AgentMemoryEmbeddingLifecycleActionInput,
  host = requireActiveProjectRuntimeHost(),
): Promise<AgentMemoryEmbeddingLifecycleActionResult> {
  return enqueueAgentMemoryEmbeddingLifecycleOperation(host, host.store, input.action, () =>
    runAgentMemoryEmbeddingLifecycleActionWithoutQueue(input, host));
}

async function runAgentMemoryEmbeddingLifecycleActionWithoutQueue(
  input: AgentMemoryEmbeddingLifecycleActionInput,
  host = requireActiveProjectRuntimeHost(),
): Promise<AgentMemoryEmbeddingLifecycleActionResult> {
  const workspace = host.store.getWorkspace();
  const settings = host.store.getMemorySettings();
  const lifecycle = await runAmbientMemoryEmbeddingLifecycleAction({
    workspacePath: workspace.path,
    action: input.action,
    sendDimensions: settings.embeddings.sendDimensions,
    timeoutMs: settings.embeddings.timeoutMs,
  });
  if (host.disposed) {
    releaseAgentMemoryEmbeddingLifecycleLease(lifecycle, "project runtime host disposed before lifecycle completion");
    throw new Error("Project runtime host was disposed before Agent Memory embedding lifecycle completion.");
  }
  retainAgentMemoryEmbeddingRuntimeLease(host, input.action, lifecycle);
  if (
    input.action !== "check" &&
    ["ready", "started", "stopped", "restarted"].includes(lifecycle.status)
  ) {
    host.runtime.applyMemorySettings();
  }
  const diagnostics = await getAgentMemoryDiagnostics(host, { liveEmbeddingCheck: input.action !== "check" });
  const lifecycleEmbedding = agentMemoryEmbeddingDiagnosticsFromLifecycle(settings, lifecycle, input.action);
  const embedding = input.action === "check"
    ? mergeAgentMemoryEmbeddingLiveDiagnostics(diagnostics.embedding, lifecycleEmbedding)
    : mergeAgentMemoryEmbeddingLifecycleDiagnostics(diagnostics.embedding, lifecycleEmbedding);
  const updatedDiagnostics = agentMemoryStorageDiagnosticsWithEmbedding(
    diagnostics,
    embedding,
  );
  const starterStatus = await readAgentMemoryStarterStatus(host, undefined, updatedDiagnostics);
  return {
    schemaVersion: "ambient-agent-memory-embedding-lifecycle-action-v1",
    action: input.action,
    status: lifecycle.status,
    message: lifecycle.reason,
    checkedAt: new Date().toISOString(),
    diagnostics: updatedDiagnostics,
    starterStatus,
  };
}

function releaseAgentMemoryEmbeddingLifecycleLease(
  lifecycle: Awaited<ReturnType<typeof runAmbientMemoryEmbeddingLifecycleAction>>,
  reason: string,
): void {
  if (!lifecycle.release) return;
  void lifecycle.release().catch((error) => {
    console.warn(`Agent Memory embedding runtime lease release failed after ${reason}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function retainAgentMemoryEmbeddingRuntimeLease(
  host: AgentMemoryDesktopProjectRuntimeHost,
  action: AgentMemoryEmbeddingLifecycleActionInput["action"],
  lifecycle: Awaited<ReturnType<typeof runAmbientMemoryEmbeddingLifecycleAction>>,
): void {
  if (host.disposed) {
    releaseAgentMemoryEmbeddingLifecycleLease(lifecycle, "project runtime host disposed before lease retention");
    return;
  }
  if (
    (action === "start" || action === "restart") &&
    lifecycle.release &&
    lifecycle.leaseId &&
    ["ready", "started", "restarted"].includes(lifecycle.status)
  ) {
    if (host.agentMemoryEmbeddingRuntimeLeaseId && host.agentMemoryEmbeddingRuntimeLeaseId !== lifecycle.leaseId) {
      releaseAgentMemoryEmbeddingRuntimeForHost(host, "Agent Memory embedding runtime lease replaced.");
    }
    host.agentMemoryEmbeddingRuntimeLeaseId = lifecycle.leaseId;
    host.agentMemoryEmbeddingRuntimeRelease = lifecycle.release;
    return;
  }
  if (action === "stop" && ["stopped", "not-found"].includes(lifecycle.status)) {
    releaseAgentMemoryEmbeddingRuntimeForHost(host, "Agent Memory embedding runtime stopped.");
  }
}

export function releaseAgentMemoryEmbeddingRuntimeForHost(host: AgentMemoryDesktopProjectRuntimeHost, reason: string): void {
  const release = host.agentMemoryEmbeddingRuntimeRelease;
  const leaseId = host.agentMemoryEmbeddingRuntimeLeaseId;
  delete host.agentMemoryEmbeddingRuntimeLeaseId;
  delete host.agentMemoryEmbeddingRuntimeRelease;
  if (!release) return;
  void release().catch((error) => {
    console.warn(`Agent Memory embedding runtime lease release failed${leaseId ? ` (${leaseId})` : ""} after ${reason}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function agentMemoryEmbeddingDiagnosticsFromLifecycle(
  settings: AgentMemorySettings,
  lifecycle: Awaited<ReturnType<typeof runAmbientMemoryEmbeddingLifecycleAction>>,
  action: AgentMemoryEmbeddingLifecycleActionKind,
): AgentMemoryEmbeddingDiagnostics {
  const provider = lifecycle.provider;
  const runtime = provider.diagnostics?.runtimeState;
  const ready = lifecycle.status === "ready" || lifecycle.status === "started" || lifecycle.status === "restarted";
  const stopped = lifecycle.status === "stopped" || lifecycle.status === "not-found";
  const runtimeStatus = lifecycle.status === "blocked" || (lifecycle.status === "failed" && action !== "check")
    ? lifecycle.status
    : runtime?.status;
  const status: AgentMemoryEmbeddingDiagnostics["status"] = ready
    ? "ready"
    : lifecycle.status === "failed"
      ? "error"
      : lifecycle.status === "unavailable"
        ? "unavailable"
        : "keyword_fallback";
  return {
    enabled: settings.embeddings.enabled,
    status: stopped ? "keyword_fallback" : status,
    message: lifecycle.reason,
    providerMode: settings.embeddings.providerMode,
    providerId: provider.providerId,
    providerCapabilityId: provider.capabilityId,
    packageName: provider.packageName,
    ...(provider.modelId ? { modelId: provider.modelId } : {}),
    ...(runtime?.modelProfileId ? { modelProfileId: runtime.modelProfileId } : {}),
    ...(provider.dimensions !== undefined ? { dimensions: provider.dimensions } : {}),
    ...(runtime?.endpoint ? { endpoint: runtime.endpoint } : {}),
    ...(runtime?.modelRuntimeId ? { runtimeId: `embeddings:${runtime.modelRuntimeId}` } : {}),
    ...(runtimeStatus ? { runtimeStatus } : {}),
    ...(runtime ? { running: runtime.running } : {}),
    autoStartProvider: settings.embeddings.autoStartProvider,
    preflightEnabled: settings.embeddings.preflightEnabled,
    sendDimensions: settings.embeddings.sendDimensions,
    maxInputChars: settings.embeddings.maxInputChars,
    timeoutMs: settings.embeddings.timeoutMs,
    reindexStatus: ready ? "unknown" : "not_required",
    missingHints: provider.diagnostics?.missingHints,
    ...(lifecycle.status === "failed" ? { lastError: lifecycle.reason } : {}),
  };
}

export async function clearAgentMemory(input: AgentMemoryClearInput, host = requireActiveProjectRuntimeHost()) {
  if (normalizeWorkspacePath(input.workspacePath) !== normalizeWorkspacePath(host.workspacePath)) {
    throw new Error("Agent Memory clear workspace no longer matches the active workspace.");
  }
  const activeSessionsReset = host.runtime.applyMemorySettings();
  const result = await clearTencentDbMemoryStorage({
    workspace: host.store.getWorkspace(),
    activeSessionsReset,
  });
  emitProjectStateIfActive(host);
  return result;
}
