import { stat } from "node:fs/promises";
import { arch as hostArch, platform as hostPlatform } from "node:os";
import { relative, resolve } from "node:path";
import type {
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryEmbeddingLifecycleActionKind,
  AgentMemoryEmbeddingLifecycleActionStatus,
} from "../../../shared/agentMemoryDiagnostics";
import type { EmbeddingProviderCandidate, EmbeddingProviderRuntimeState } from "../../../shared/localRuntimeTypes";
import { managedInstallWorkspacePath } from "../../setup/managedInstallPaths";
import { miniCpmRuntimeReleaseManifestPrototype } from "../../mini-cpm/miniCpmRuntimeManifest";
import { selectLocalLlamaRuntimeArtifact } from "../../local-llama/localLlamaRuntimeManifest";
import {
  LocalLlamaServerSupervisor,
  readLocalLlamaServerState,
  type LocalLlamaServerLease,
} from "../../local-llama/localLlamaServerSupervisor";
import {
  detectLocalLlamaResidentProcesses,
  type LocalLlamaResidentProcess,
} from "../../local-llama/localLlamaResidencyPolicy";
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
    return {
      status: "blocked",
      reason: `Another llama.cpp runtime is already resident (${blockers.map((resident) => resident.id).join(", ")}); memory embeddings will not start a second local model automatically.`,
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
