import { stat } from "node:fs/promises";
import { arch as hostArch, platform as hostPlatform } from "node:os";
import { relative, resolve } from "node:path";
import type {
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryEmbeddingLifecycleActionKind,
  AgentMemoryEmbeddingLifecycleActionStatus,
} from "../../../shared/agentMemoryDiagnostics";
import type { EmbeddingProviderCandidate, EmbeddingProviderRuntimeState } from "../../../shared/localRuntimeTypes";
import { managedInstallWorkspacePath } from "./memorySetupFacade";
import { miniCpmRuntimeReleaseManifestPrototype } from "./memoryMiniCpmFacade";
import {
  detectLocalLlamaResidentProcesses,
  LocalLlamaServerSupervisor,
  readLocalLlamaServerState,
  selectLocalLlamaRuntimeArtifact,
  type LocalLlamaResidentProcess,
  type LocalLlamaServerLease,
} from "./memoryLocalLlamaFacade";
import {
  normalizeOpenAiEmbeddingBaseUrl,
  preflightOpenAiCompatibleEmbeddingEndpoint,
} from "./embeddingEndpointPreflight";
import {
  AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
  AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
  ambientMemoryEmbeddingModelCachePath,
  ambientMemoryEmbeddingModelProfile,
  ambientMemoryEmbeddingServerStateRoot,
  contextTokens,
  dimensions,
  estimatedResidentMemoryBytes,
  maxInputChars,
  modelSha256,
  modelSizeBytes,
} from "./managedEmbeddingRuntimeMetadata";
export {
  AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
  AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
  ambientMemoryEmbeddingModelCachePath,
  ambientMemoryEmbeddingModelProfile,
  ambientMemoryEmbeddingServerStateRoot,
} from "./managedEmbeddingRuntimeMetadata";

const defaultSupervisor = new LocalLlamaServerSupervisor();
const activeMemoryEmbeddingLeases = new Map<string, LocalLlamaServerLease>();

export interface AmbientMemoryEmbeddingAssetDetection {
  managedRoot: string;
  model: {
    status: "present" | "missing" | "mismatch";
    cachePath: string;
    expectedBytes: number;
    expectedSha256: string;
    sizeBytes?: number;
    reason?: string;
  };
  runtime: {
    status: "present" | "missing" | "unsupported";
    binaryPath?: string;
    artifactId?: string;
    receiptPath?: string;
    reason?: string;
  };
  stateRootPath: string;
  state?: Awaited<ReturnType<typeof readLocalLlamaServerState>>;
}

export interface StartAmbientMemoryEmbeddingRuntimeInput {
  workspacePath: string;
  ownerThreadId?: string;
  supervisor?: Pick<LocalLlamaServerSupervisor, "acquire">;
  detectResidents?: (workspacePath: string) => Promise<LocalLlamaResidentProcess[]> | LocalLlamaResidentProcess[];
  startupTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface StartAmbientMemoryEmbeddingRuntimeResult {
  status: "ready" | "started" | "blocked" | "failed";
  reason?: string;
  leaseId?: string;
  release?: () => Promise<void>;
  provider?: EmbeddingProviderCandidate;
}

type AmbientMemoryEmbeddingLifecycleSupervisor = Pick<LocalLlamaServerSupervisor, "acquire" | "stopProfile">;

export type AmbientMemoryResidentClassificationKind =
  | "current_managed_runtime"
  | "safe_ambient_memory_orphan"
  | "external_or_active_runtime"
  | "ambiguous";

export interface AmbientMemoryResidentClassification {
  kind: AmbientMemoryResidentClassificationKind;
  id: string;
  pid: number;
  reason: string;
  ppid?: number;
  endpoint?: string;
  modelId?: string;
  commandPreview?: string;
}

export interface AmbientMemoryResidentRepairResult {
  status: "clean" | "blocked" | "failed";
  reason: string;
  stopped: AmbientMemoryResidentClassification[];
  blockers: AmbientMemoryResidentClassification[];
  ignored: AmbientMemoryResidentClassification[];
}

export interface RunAmbientMemoryEmbeddingLifecycleActionInput {
  workspacePath: string;
  action: AgentMemoryEmbeddingLifecycleActionKind;
  supervisor?: AmbientMemoryEmbeddingLifecycleSupervisor;
  detectResidents?: (workspacePath: string) => Promise<LocalLlamaResidentProcess[]> | LocalLlamaResidentProcess[];
  fetchImpl?: typeof fetch;
  startupTimeoutMs?: number;
  idleTimeoutMs?: number;
  timeoutMs?: number;
  sendDimensions?: boolean;
}

export interface RunAmbientMemoryEmbeddingLifecycleActionResult {
  action: AgentMemoryEmbeddingLifecycleActionKind;
  status: AgentMemoryEmbeddingLifecycleActionStatus;
  reason: string;
  provider: EmbeddingProviderCandidate;
  leaseId?: string;
  release?: () => Promise<void>;
}

export interface RepairAmbientMemoryResidentConflictsInput {
  workspacePath: string;
  detectResidents?: (workspacePath: string) => Promise<LocalLlamaResidentProcess[]> | LocalLlamaResidentProcess[];
  processAlive?: (pid: number) => boolean;
  killProcess?: (pid: number, signal?: NodeJS.Signals) => void;
  sleep?: (ms: number) => Promise<void>;
  gracefulWaitMs?: number;
  killWaitMs?: number;
}

export async function detectAmbientMemoryEmbeddingAssets(
  workspacePath: string,
  input: { platform?: string; arch?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<AmbientMemoryEmbeddingAssetDetection> {
  const managedRoot = managedInstallWorkspacePath(workspacePath, input.env);
  const cachePath = ambientMemoryEmbeddingModelCachePath(managedRoot);
  const model = await detectModel(cachePath);
  const runtimeArtifact = selectLocalLlamaRuntimeArtifact(miniCpmRuntimeReleaseManifestPrototype.artifacts, {
    platform: input.platform ?? hostPlatform(),
    arch: input.arch ?? hostArch(),
  });
  const runtime = runtimeArtifact
    ? await detectRuntime(managedRoot, runtimeArtifact)
    : {
        status: "unsupported" as const,
        reason: `No shared llama.cpp runtime artifact is declared for ${input.platform ?? hostPlatform()} ${input.arch ?? hostArch()}.`,
      };
  const stateRootPath = ambientMemoryEmbeddingServerStateRoot(managedRoot);
  const state = await readLocalLlamaServerState(stateRootPath, AMBIENT_MEMORY_EMBEDDING_PROFILE_ID).catch(() => undefined);
  return {
    managedRoot,
    model,
    runtime,
    stateRootPath,
    ...(state ? { state } : {}),
  };
}

export async function discoverAmbientMemoryEmbeddingProviders(workspacePath: string): Promise<EmbeddingProviderCandidate[]> {
  const detection = await detectAmbientMemoryEmbeddingAssets(workspacePath);
  return [ambientMemoryEmbeddingProviderCandidate(workspacePath, detection)];
}

export async function repairAmbientMemoryResidentConflicts(
  input: RepairAmbientMemoryResidentConflictsInput,
): Promise<AmbientMemoryResidentRepairResult> {
  const detection = await detectAmbientMemoryEmbeddingAssets(input.workspacePath);
  let residents: LocalLlamaResidentProcess[];
  try {
    residents = await Promise.resolve((input.detectResidents ?? detectLocalLlamaResidentProcesses)(input.workspacePath));
  } catch (error) {
    return {
      status: "failed",
      reason: `Could not inspect resident llama.cpp processes: ${errorMessage(error)}`,
      stopped: [],
      blockers: [],
      ignored: [],
    };
  }

  const processAliveFn = input.processAlive ?? processAlive;
  const killProcess = input.killProcess ?? ((pid: number, signal?: NodeJS.Signals) => process.kill(pid, signal));
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms)));
  const gracefulWaitMs = input.gracefulWaitMs ?? 750;
  const killWaitMs = input.killWaitMs ?? 250;
  const stopped: AmbientMemoryResidentClassification[] = [];
  const blockers: AmbientMemoryResidentClassification[] = [];
  const ignored: AmbientMemoryResidentClassification[] = [];

  for (const resident of residents) {
    const classification = classifyAmbientMemoryResident(resident, detection.state?.pid);
    if (classification.kind === "current_managed_runtime") {
      ignored.push(classification);
      continue;
    }
    if (!resident.running) {
      ignored.push({
        ...classification,
        reason: "Resident process is already stopped.",
      });
      continue;
    }
    if (classification.kind !== "safe_ambient_memory_orphan") {
      blockers.push(classification);
      continue;
    }

    try {
      killProcess(resident.pid, "SIGTERM");
    } catch (error) {
      if (processAliveFn(resident.pid)) {
        return {
          status: "failed",
          reason: `Could not stop orphaned Ambient memory embedding runtime ${resident.id}: ${errorMessage(error)}`,
          stopped,
          blockers,
          ignored,
        };
      }
    }
    await sleep(gracefulWaitMs);
    if (processAliveFn(resident.pid)) {
      try {
        killProcess(resident.pid, "SIGKILL");
      } catch {
        // The process may exit between the liveness check and the forced signal.
      }
      await sleep(killWaitMs);
    }
    if (processAliveFn(resident.pid)) {
      return {
        status: "failed",
        reason: `Orphaned Ambient memory embedding runtime ${resident.id} did not exit after termination.`,
        stopped,
        blockers,
        ignored,
      };
    }
    stopped.push(classification);
  }

  if (blockers.length > 0) {
    return {
      status: "blocked",
      reason: `Resident llama.cpp runtime conflict remains: ${blockers.map((blocker) => `${blocker.id}: ${blocker.reason}`).join("; ")}`,
      stopped,
      blockers,
      ignored,
    };
  }
  return {
    status: "clean",
    reason: stopped.length > 0
      ? `Stopped ${stopped.length} orphaned Ambient memory embedding runtime${stopped.length === 1 ? "" : "s"}.`
      : "No orphaned Ambient memory embedding runtimes needed cleanup.",
    stopped,
    blockers,
    ignored,
  };
}

export async function runAmbientMemoryEmbeddingLifecycleAction(
  input: RunAmbientMemoryEmbeddingLifecycleActionInput,
): Promise<RunAmbientMemoryEmbeddingLifecycleActionResult> {
  if (input.action === "start") return startMemoryEmbeddingLifecycle(input);
  if (input.action === "stop") return stopMemoryEmbeddingLifecycle(input);
  if (input.action === "restart") return restartMemoryEmbeddingLifecycle(input);
  return checkMemoryEmbeddingLifecycle(input);
}

export async function startAmbientMemoryEmbeddingRuntime(
  input: StartAmbientMemoryEmbeddingRuntimeInput,
): Promise<StartAmbientMemoryEmbeddingRuntimeResult> {
  const detection = await detectAmbientMemoryEmbeddingAssets(input.workspacePath);
  const provider = ambientMemoryEmbeddingProviderCandidate(input.workspacePath, detection);
  if (detection.model.status !== "present") {
    return { status: "blocked", reason: detection.model.reason ?? "EmbeddingGemma model is not installed.", provider };
  }
  if (detection.runtime.status !== "present" || !detection.runtime.binaryPath) {
    return { status: "blocked", reason: detection.runtime.reason ?? "Shared llama.cpp runtime is not installed.", provider };
  }

  const existingLease = activeMemoryEmbeddingLeases.get(input.workspacePath);
  if (existingLease) {
    return { status: "ready", leaseId: existingLease.leaseId, provider };
  }

  const residents = await Promise.resolve((input.detectResidents ?? detectLocalLlamaResidentProcesses)(input.workspacePath)).catch(() => []);
  const blockers = residents.filter((resident) => resident.running && resident.pid !== detection.state?.pid);
  if (blockers.length > 0) {
    const classifications = blockers.map((resident) => classifyAmbientMemoryResident(resident, detection.state?.pid));
    return {
      status: "blocked",
      reason: residentConflictStartReason(classifications),
      provider,
    };
  }

  try {
    const supervisor = input.supervisor ?? defaultSupervisor;
    const lease = await supervisor.acquire({
      profileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
      runtimeBinaryPath: detection.runtime.binaryPath,
      modelPath: detection.model.cachePath,
      stateRootPath: detection.stateRootPath,
      contextTokens,
      ownerThreadId: input.ownerThreadId,
      gpuLayers: 99,
      startupTimeoutMs: input.startupTimeoutMs ?? 180_000,
      idleTimeoutMs: input.idleTimeoutMs ?? 0,
      extraArgs: [
        "--embedding",
        "--alias",
        AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
      ],
    });
    activeMemoryEmbeddingLeases.set(input.workspacePath, lease);
    return {
      status: "started",
      leaseId: lease.leaseId,
      release: releaseMemoryEmbeddingLease(input.workspacePath, lease.leaseId),
      provider: ambientMemoryEmbeddingProviderCandidate(input.workspacePath, {
        ...detection,
        state: lease.state,
      }),
    };
  } catch (error) {
    return {
      status: "failed",
      reason: errorMessage(error),
      provider,
    };
  }
}

async function startMemoryEmbeddingLifecycle(
  input: RunAmbientMemoryEmbeddingLifecycleActionInput,
): Promise<RunAmbientMemoryEmbeddingLifecycleActionResult> {
  const result = await startAmbientMemoryEmbeddingRuntime({
    workspacePath: input.workspacePath,
    supervisor: input.supervisor,
    detectResidents: input.detectResidents,
    startupTimeoutMs: input.startupTimeoutMs,
    idleTimeoutMs: input.idleTimeoutMs,
  });
  const provider = result.provider ?? (await discoverAmbientMemoryEmbeddingProviders(input.workspacePath))[0];
  if (result.status === "started" || result.status === "ready") {
    return lifecycleResult({
      action: "start",
      status: result.status,
      reason: result.status === "ready" ? "Ambient-managed memory embeddings are already running." : "Ambient-managed memory embeddings started.",
      provider,
      ...(result.leaseId ? { leaseId: result.leaseId } : {}),
      ...(result.release ? { release: result.release } : {}),
    });
  }
  return lifecycleResult({
    action: "start",
    status: result.status === "failed" ? "failed" : "blocked",
    reason: result.reason ?? "Ambient-managed memory embeddings could not start.",
    provider,
  });
}

async function stopMemoryEmbeddingLifecycle(
  input: RunAmbientMemoryEmbeddingLifecycleActionInput,
): Promise<RunAmbientMemoryEmbeddingLifecycleActionResult> {
  const detection = await detectAmbientMemoryEmbeddingAssets(input.workspacePath);
  let provider = ambientMemoryEmbeddingProviderCandidate(input.workspacePath, detection);
  const existingLease = activeMemoryEmbeddingLeases.get(input.workspacePath);
  if (existingLease) {
    try {
      await existingLease.release();
      activeMemoryEmbeddingLeases.delete(input.workspacePath);
    } catch (error) {
      return lifecycleResult({
        action: "stop",
        status: "failed",
        reason: `Ambient-managed memory embeddings did not stop cleanly: ${errorMessage(error)}`,
        provider,
      });
    }
    provider = (await discoverAmbientMemoryEmbeddingProviders(input.workspacePath))[0];
    return lifecycleResult({
      action: "stop",
      status: "stopped",
      reason: "Ambient-managed memory embeddings stopped.",
      provider,
    });
  }

  const supervisor = input.supervisor ?? defaultSupervisor;
  const stopped = await supervisor.stopProfile({
    stateRootPath: detection.stateRootPath,
    profileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
  });
  provider = (await discoverAmbientMemoryEmbeddingProviders(input.workspacePath))[0];
  if (stopped.status === "stopped") {
    return lifecycleResult({
      action: "stop",
      status: "stopped",
      reason: "Ambient-managed memory embeddings stopped.",
      provider,
    });
  }
  if (stopped.status === "still-leased") {
    const count = stopped.remainingLeases ?? 1;
    return lifecycleResult({
      action: "stop",
      status: "blocked",
      reason: `Ambient-managed memory embeddings are still leased by ${count} active owner${count === 1 ? "" : "s"}.`,
      provider,
    });
  }
  return lifecycleResult({
    action: "stop",
    status: "not-found",
    reason: "Ambient-managed memory embeddings are not running.",
    provider,
  });
}

async function restartMemoryEmbeddingLifecycle(
  input: RunAmbientMemoryEmbeddingLifecycleActionInput,
): Promise<RunAmbientMemoryEmbeddingLifecycleActionResult> {
  const stopped = await stopMemoryEmbeddingLifecycle({ ...input, action: "stop" });
  if (!["stopped", "not-found"].includes(stopped.status)) {
    return lifecycleResult({
      action: "restart",
      status: stopped.status === "failed" ? "failed" : "blocked",
      reason: stopped.reason,
      provider: stopped.provider,
    });
  }
  const started = await startAmbientMemoryEmbeddingRuntime({
    workspacePath: input.workspacePath,
    supervisor: input.supervisor,
    detectResidents: input.detectResidents,
    startupTimeoutMs: input.startupTimeoutMs,
    idleTimeoutMs: input.idleTimeoutMs,
  });
  const provider = started.provider ?? (await discoverAmbientMemoryEmbeddingProviders(input.workspacePath))[0];
  if (started.status === "started" || started.status === "ready") {
    return lifecycleResult({
      action: "restart",
      status: "restarted",
      reason: "Ambient-managed memory embeddings restarted.",
      provider,
      ...(started.leaseId ? { leaseId: started.leaseId } : {}),
      ...(started.release ? { release: started.release } : {}),
    });
  }
  return lifecycleResult({
    action: "restart",
    status: started.status === "failed" ? "failed" : "blocked",
    reason: started.reason ?? "Ambient-managed memory embeddings could not restart.",
    provider,
  });
}

async function checkMemoryEmbeddingLifecycle(
  input: RunAmbientMemoryEmbeddingLifecycleActionInput,
): Promise<RunAmbientMemoryEmbeddingLifecycleActionResult> {
  const detection = await detectAmbientMemoryEmbeddingAssets(input.workspacePath);
  const provider = ambientMemoryEmbeddingProviderCandidate(input.workspacePath, detection);
  if (!provider.available) {
    return lifecycleResult({
      action: "check",
      status: "unavailable",
      reason: provider.availabilityReason,
      provider,
    });
  }
  const runtime = provider.diagnostics?.runtimeState;
  const endpoint = runtime?.endpoint;
  if (!runtime?.running || !endpoint) {
    return lifecycleResult({
      action: "check",
      status: "not-found",
      reason: "Ambient-managed memory embeddings are installed but not running.",
      provider,
    });
  }
  const preflight = await preflightOpenAiCompatibleEmbeddingEndpoint({
    fetchImpl: input.fetchImpl,
    baseUrl: normalizeOpenAiEmbeddingBaseUrl(endpoint),
    model: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
    dimensions,
    sendDimensions: input.sendDimensions ?? false,
    timeoutMs: input.timeoutMs ?? 10_000,
  });
  return lifecycleResult({
    action: "check",
    status: preflight.ok ? "ready" : "failed",
    reason: preflight.message,
    provider,
  });
}

function lifecycleResult(input: RunAmbientMemoryEmbeddingLifecycleActionResult): RunAmbientMemoryEmbeddingLifecycleActionResult {
  return input;
}

export function ambientMemoryEmbeddingDiagnosticsHint(): Pick<
  AgentMemoryEmbeddingDiagnostics,
  "providerId" | "providerCapabilityId" | "modelId" | "modelProfileId" | "dimensions" | "maxInputChars"
> {
  return {
    providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    providerCapabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
    modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
    dimensions,
    maxInputChars,
  };
}

function ambientMemoryEmbeddingProviderCandidate(
  workspacePath: string,
  detection: AmbientMemoryEmbeddingAssetDetection,
): EmbeddingProviderCandidate {
  const running = Boolean(detection.state?.pid && processAlive(detection.state.pid));
  const runtimeState: EmbeddingProviderRuntimeState = {
    schemaVersion: "ambient-embedding-provider-runtime-state-v1",
    status: running ? "running" : detection.model.status === "present" && detection.runtime.status === "present" ? "stopped" : "unavailable",
    running,
    trackingStatus: "managed",
    modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
    modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
    modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
    estimatedResidentMemoryBytes,
    ...(detection.state?.pid ? { pid: detection.state.pid } : {}),
    ...(running && detection.state?.endpointUrl ? { endpoint: detection.state.endpointUrl } : {}),
    statePath: relative(workspacePath, detection.stateRootPath),
    ...(detection.state?.startedAt ? { startedAt: detection.state.startedAt } : {}),
    ...(detection.state?.lastUsedAt ? { lastUsedAt: detection.state.lastUsedAt } : {}),
    ...(detection.model.status !== "present" ? { reason: detection.model.reason } : detection.runtime.status !== "present" ? { reason: detection.runtime.reason } : {}),
  };
  const available = detection.model.status === "present" && detection.runtime.status === "present";
  return {
    packageId: "ambient:first-party:memory-embeddings",
    packageName: "Ambient Managed Memory Embeddings",
    command: "embeddinggemma_300m_q8_0",
    capabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    label: "EmbeddingGemma 300M Q8_0",
    description: "Ambient-managed llama.cpp embedding provider for the TencentDB Agent Memory experiment.",
    modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
    dimensions,
    local: true,
    installed: available,
    available,
    availabilityReason: available
      ? "EmbeddingGemma model and shared llama.cpp runtime are present in Ambient-managed state."
      : unavailableReason(detection),
    diagnostics: {
      healthStatus: available ? "passed" : "unknown",
      missingHints: missingHints(detection),
      runtimeState,
    },
  };
}

async function detectModel(cachePath: string): Promise<AmbientMemoryEmbeddingAssetDetection["model"]> {
  const details = await stat(cachePath).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  });
  if (!details) {
    return {
      status: "missing",
      cachePath,
      expectedBytes: modelSizeBytes,
      expectedSha256: modelSha256,
      reason: "EmbeddingGemma GGUF is not present in Ambient-managed state.",
    };
  }
  if (!details.isFile()) {
    return {
      status: "mismatch",
      cachePath,
      expectedBytes: modelSizeBytes,
      expectedSha256: modelSha256,
      reason: "EmbeddingGemma managed cache path exists but is not a file.",
    };
  }
  if (details.size !== modelSizeBytes) {
    return {
      status: "mismatch",
      cachePath,
      expectedBytes: modelSizeBytes,
      expectedSha256: modelSha256,
      sizeBytes: details.size,
      reason: `EmbeddingGemma GGUF is ${details.size} bytes; expected ${modelSizeBytes}.`,
    };
  }
  return {
    status: "present",
    cachePath,
    expectedBytes: modelSizeBytes,
    expectedSha256: modelSha256,
    sizeBytes: details.size,
  };
}

async function detectRuntime(
  managedRoot: string,
  artifact: typeof miniCpmRuntimeReleaseManifestPrototype.artifacts[number],
): Promise<AmbientMemoryEmbeddingAssetDetection["runtime"]> {
  const binaryPath = resolve(managedRoot, ".ambient/vision/minicpm-v/runtime", artifact.cacheSubdir, artifact.binaryRelativePath);
  const receiptPath = resolve(managedRoot, ".ambient/vision/minicpm-v/runtime", artifact.cacheSubdir, "ambient-runtime-install.json");
  const details = await stat(binaryPath).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  });
  if (!details) {
    return {
      status: "missing",
      artifactId: artifact.id,
      binaryPath,
      receiptPath,
      reason: "Shared llama.cpp runtime binary is not present in Ambient-managed state.",
    };
  }
  if (!details.isFile()) {
    return {
      status: "missing",
      artifactId: artifact.id,
      binaryPath,
      receiptPath,
      reason: "Shared llama.cpp runtime cache path exists but is not a file.",
    };
  }
  return {
    status: "present",
    artifactId: artifact.id,
    binaryPath,
    receiptPath,
  };
}

function missingHints(detection: AmbientMemoryEmbeddingAssetDetection): string[] {
  const hints: string[] = [];
  if (detection.model.status !== "present") {
    hints.push(`Download ${ambientMemoryEmbeddingModelProfile.sourceUrl} to ${detection.model.cachePath}.`);
    hints.push(`Expected bytes: ${modelSizeBytes}; SHA-256: ${modelSha256}.`);
  }
  if (detection.runtime.status !== "present") {
    hints.push(detection.runtime.reason ?? "Install the shared Ambient-managed llama.cpp runtime.");
  }
  return hints;
}

function unavailableReason(detection: AmbientMemoryEmbeddingAssetDetection): string {
  return [
    detection.model.status !== "present" ? detection.model.reason : undefined,
    detection.runtime.status !== "present" ? detection.runtime.reason : undefined,
  ].filter(Boolean).join(" ") || "EmbeddingGemma provider assets are not ready.";
}

function residentConflictStartReason(classifications: AmbientMemoryResidentClassification[]): string {
  const ids = classifications.map((classification) => classification.id).join(", ");
  const safeOrphans = classifications.filter((classification) => classification.kind === "safe_ambient_memory_orphan");
  if (safeOrphans.length === classifications.length) {
    return `Another llama.cpp runtime is already resident (${ids}); Repair can stop the orphaned Ambient memory embedding runtime${safeOrphans.length === 1 ? "" : "s"} and retry start.`;
  }
  if (safeOrphans.length > 0) {
    return `Another llama.cpp runtime is already resident (${ids}); Repair can clean the orphaned Ambient memory embedding runtime${safeOrphans.length === 1 ? "" : "s"}, but external or active llama.cpp runtimes must be stopped by the user.`;
  }
  return `Another llama.cpp runtime is already resident (${ids}); Ambient will not stop external or active llama.cpp runtimes automatically. Stop the other runtime, then retry Agent Memory repair.`;
}

function classifyAmbientMemoryResident(
  resident: LocalLlamaResidentProcess,
  currentStatePid?: number,
): AmbientMemoryResidentClassification {
  const base = residentClassificationBase(resident);
  if (resident.pid === currentStatePid) {
    return {
      ...base,
      kind: "current_managed_runtime",
      reason: "Resident matches the current Ambient-managed memory embedding state.",
    };
  }

  const commandLine = resident.commandLine ?? "";
  if (!commandLine.trim()) {
    return {
      ...base,
      kind: "ambiguous",
      reason: "Resident command line is unavailable; Ambient will not stop it automatically.",
    };
  }

  const tokens = shellishTokens(commandLine);
  const binaryPath = tokens[0] ?? "";
  const modelPath = stringArg(commandLine, ["--model", "-m"]) ?? resident.modelId;
  const alias = stringArg(commandLine, ["--alias"]);
  const embeddingMode = tokens.includes("--embedding");
  const ambientRuntime = isAmbientManagedLlamaRuntimePath(binaryPath) || commandContainsAmbientManagedLlamaRuntime(commandLine);
  const ambientMemoryModel = isAmbientManagedMemoryEmbeddingModelPath(modelPath) || commandContainsAmbientManagedMemoryEmbeddingModel(commandLine);
  const orphaned = resident.ppid === 1;
  const memoryEmbeddingCommand =
    resident.trackingStatus === "untracked" &&
    embeddingMode &&
    alias === AMBIENT_MEMORY_EMBEDDING_MODEL_ID &&
    ambientRuntime &&
    ambientMemoryModel;

  if (memoryEmbeddingCommand && orphaned) {
    return {
      ...base,
      kind: "safe_ambient_memory_orphan",
      reason: "Untracked Ambient-managed memory embedding runtime is orphaned and safe for Repair cleanup.",
    };
  }

  if (memoryEmbeddingCommand) {
    return {
      ...base,
      kind: "external_or_active_runtime",
      reason: resident.ppid === undefined
        ? "Ambient-managed memory embedding runtime has unknown parent process; Ambient will not stop it automatically."
        : `Ambient-managed memory embedding runtime still has parent PID ${resident.ppid}; Ambient will not stop it automatically.`,
    };
  }

  return {
    ...base,
    kind: "external_or_active_runtime",
    reason: "Resident llama.cpp runtime is not an orphaned Ambient memory embedding process; Ambient will not stop it automatically.",
  };
}

function residentClassificationBase(resident: LocalLlamaResidentProcess): Omit<AmbientMemoryResidentClassification, "kind" | "reason"> {
  return {
    id: resident.id,
    pid: resident.pid,
    ...(resident.ppid !== undefined ? { ppid: resident.ppid } : {}),
    ...(resident.endpointUrl ? { endpoint: resident.endpointUrl } : {}),
    ...(resident.modelId ? { modelId: resident.modelId } : {}),
    ...(resident.commandLine ? { commandPreview: boundedPreview(resident.commandLine) } : {}),
  };
}

function isAmbientManagedLlamaRuntimePath(path: string | undefined): boolean {
  const normalized = normalizePathForMatching(path);
  return Boolean(normalized && normalized.includes("/.ambient/vision/minicpm-v/runtime/") && /\/llama-[^/]*\/llama-server$/.test(normalized));
}

function isAmbientManagedMemoryEmbeddingModelPath(path: string | undefined): boolean {
  const normalized = normalizePathForMatching(path);
  return Boolean(
    normalized &&
    normalized.includes("/.ambient/memory/tencentdb/embeddings/models/") &&
    normalized.includes("embeddinggemma-300m") &&
    normalized.endsWith(".gguf")
  );
}

function commandContainsAmbientManagedLlamaRuntime(commandLine: string): boolean {
  const normalized = normalizePathForMatching(commandLine);
  return Boolean(
    normalized &&
    normalized.includes("/.ambient/vision/minicpm-v/runtime/") &&
    /\/llama-[^/\s]+\/llama-server(?:\s|$)/.test(normalized)
  );
}

function commandContainsAmbientManagedMemoryEmbeddingModel(commandLine: string): boolean {
  const normalized = normalizePathForMatching(commandLine);
  return Boolean(
    normalized &&
    normalized.includes("/.ambient/memory/tencentdb/embeddings/models/") &&
    /embeddinggemma-300m[^\s]*\.gguf(?:\s|$)/.test(normalized)
  );
}

function normalizePathForMatching(path: string | undefined): string | undefined {
  return path?.trim().replace(/\\/g, "/");
}

function stringArg(args: string, flags: string[]): string | undefined {
  const tokens = shellishTokens(args);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    for (const flag of flags) {
      if (token === flag) {
        return tokens[index + 1]?.trim() || undefined;
      }
      if (token.startsWith(`${flag}=`)) {
        return token.slice(flag.length + 1).trim() || undefined;
      }
    }
  }
  return undefined;
}

function shellishTokens(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

function boundedPreview(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}

function releaseMemoryEmbeddingLease(workspacePath: string, leaseId: string): () => Promise<void> {
  return async () => {
    const lease = activeMemoryEmbeddingLeases.get(workspacePath);
    if (!lease || lease.leaseId !== leaseId) return;
    activeMemoryEmbeddingLeases.delete(workspacePath);
    await lease.release();
  };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
