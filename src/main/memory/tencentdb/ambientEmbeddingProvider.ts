import type { AgentMemoryEmbeddingDiagnostics } from "../../../shared/agentMemoryDiagnostics";
import type { AgentMemorySettings } from "../../../shared/agentMemorySettings";
import { normalizeAgentMemorySettings } from "../../../shared/agentMemorySettings";
import type { EmbeddingProviderCandidate } from "../../../shared/localRuntimeTypes";
import type { TencentMemoryConfig, TencentMemoryLogger } from "./upstreamContracts";
import { AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID } from "./managedEmbeddingProvider";
import {
  AMBIENT_TENCENT_MEMORY_LOCAL_EMBEDDING_API_KEY,
  normalizeOpenAiEmbeddingBaseUrl,
  preflightOpenAiCompatibleEmbeddingEndpoint,
} from "./embeddingEndpointPreflight";

export const AMBIENT_TENCENT_MEMORY_EMBEDDING_PROVIDER = "ambient-managed-llamacpp" as const;
export {
  AMBIENT_TENCENT_MEMORY_LOCAL_EMBEDDING_API_KEY,
  normalizeOpenAiEmbeddingBaseUrl,
  preflightOpenAiCompatibleEmbeddingEndpoint,
};

export interface AmbientTencentMemoryResolvedEmbeddingConfig {
  enabled: true;
  provider: typeof AMBIENT_TENCENT_MEMORY_EMBEDDING_PROVIDER;
  baseUrl: string;
  apiKey: typeof AMBIENT_TENCENT_MEMORY_LOCAL_EMBEDDING_API_KEY;
  model: string;
  dimensions: number;
  sendDimensions: boolean;
  maxInputChars: number;
  timeoutMs: number;
}

export interface AmbientTencentMemoryEmbeddingResolution {
  config?: AmbientTencentMemoryResolvedEmbeddingConfig;
  diagnostics: AgentMemoryEmbeddingDiagnostics;
  releaseEmbeddingRuntime?: () => Promise<void>;
}

export interface AmbientTencentMemoryEmbeddingStartInput {
  runtimeId: string;
  provider: EmbeddingProviderCandidate;
}

export interface AmbientTencentMemoryEmbeddingStartResult {
  status: string;
  reason?: string;
  release?: () => Promise<void>;
}

export interface AmbientTencentMemoryEmbeddingPrepareInput {
  runtimeId?: string;
  provider: EmbeddingProviderCandidate;
}

export interface AmbientTencentMemoryEmbeddingPrepareResult {
  status: "ready" | "installed" | "already-installed" | "partial" | "failed" | "skipped";
  reason?: string;
}

export interface ResolveAmbientTencentMemoryEmbeddingProviderInput {
  memorySettings: AgentMemorySettings;
  workspacePath: string;
  listEmbeddingProviders?: (workspacePath: string) => Promise<EmbeddingProviderCandidate[]> | EmbeddingProviderCandidate[];
  prepareEmbeddingProviderRuntime?: (input: AmbientTencentMemoryEmbeddingPrepareInput) => Promise<AmbientTencentMemoryEmbeddingPrepareResult> | AmbientTencentMemoryEmbeddingPrepareResult;
  startEmbeddingProviderRuntime?: (input: AmbientTencentMemoryEmbeddingStartInput) => Promise<AmbientTencentMemoryEmbeddingStartResult> | AmbientTencentMemoryEmbeddingStartResult;
  fetchImpl?: typeof fetch;
  logger?: TencentMemoryLogger;
}

interface SelectedEmbeddingProvider {
  provider: EmbeddingProviderCandidate;
  runtimeId?: string;
}

export async function resolveAmbientTencentMemoryEmbeddingProvider(
  input: ResolveAmbientTencentMemoryEmbeddingProviderInput,
): Promise<AmbientTencentMemoryEmbeddingResolution> {
  const settings = normalizeAgentMemorySettings(input.memorySettings);
  const embeddingSettings = settings.embeddings;
  if (!embeddingSettings.enabled) {
    return {
      diagnostics: {
        enabled: false,
        status: "disabled",
        message: "TencentDB memory embeddings are disabled.",
      },
    };
  }

  const baseDiagnostics: AgentMemoryEmbeddingDiagnostics = {
    enabled: true,
    status: "keyword_fallback",
    message: "TencentDB memory embeddings are enabled but no Ambient embedding provider has been resolved.",
    providerMode: embeddingSettings.providerMode,
    autoStartProvider: embeddingSettings.autoStartProvider,
    preflightEnabled: embeddingSettings.preflightEnabled,
    sendDimensions: embeddingSettings.sendDimensions,
    maxInputChars: embeddingSettings.maxInputChars,
    timeoutMs: embeddingSettings.timeoutMs,
    reindexStatus: "unknown",
  };

  if (!input.listEmbeddingProviders) {
    return fallback(baseDiagnostics, "Ambient embedding provider discovery is unavailable for this runtime.");
  }

  let providers: EmbeddingProviderCandidate[];
  try {
    providers = await Promise.resolve(input.listEmbeddingProviders(input.workspacePath));
  } catch (error) {
    return {
      diagnostics: {
        ...baseDiagnostics,
        status: "error",
        message: "Ambient embedding provider discovery failed; TencentDB memory will use keyword fallback.",
        lastError: errorMessage(error),
      },
    };
  }

  let selected = selectEmbeddingProvider(providers, embeddingSettings.providerCapabilityId);
  if (embeddingSettings.autoStartProvider) {
    const prepared = await prepareManagedEmbeddingProviderIfNeeded({
      baseDiagnostics,
      input,
      providers,
      selected,
      providerCapabilityId: embeddingSettings.providerCapabilityId,
    });
    if (prepared.result) return prepared.result;
    if (prepared.providers) {
      providers = prepared.providers;
      selected = prepared.selected;
    }
  }
  if (!selected) {
    return fallback(baseDiagnostics, embeddingSettings.providerCapabilityId
      ? `No Ambient embedding provider matched ${embeddingSettings.providerCapabilityId}.`
      : "No available local Ambient embedding provider reported an endpoint.");
  }

  let releaseEmbeddingRuntime: (() => Promise<void>) | undefined;
  if (shouldStartProvider(selected.provider) && embeddingSettings.autoStartProvider) {
    const runtimeId = selected.runtimeId;
    if (!runtimeId || !input.startEmbeddingProviderRuntime) {
      return fallback(providerDiagnostics(baseDiagnostics, selected.provider, runtimeId), "Selected embedding provider is not running and cannot be auto-started from this runtime.");
    }
    const startResult: AmbientTencentMemoryEmbeddingStartResult = await Promise.resolve(input.startEmbeddingProviderRuntime({ runtimeId, provider: selected.provider }))
      .catch((error) => ({ status: "error", reason: errorMessage(error) }));
    if (startResult.status !== "started" && startResult.status !== "ready") {
      return fallback(providerDiagnostics(baseDiagnostics, selected.provider, runtimeId), `Selected embedding provider did not start: ${startResult.reason ?? startResult.status}.`);
    }
    releaseEmbeddingRuntime = startResult.release;
    providers = await Promise.resolve(input.listEmbeddingProviders(input.workspacePath)).catch(() => providers);
    selected = selectEmbeddingProvider(providers, embeddingSettings.providerCapabilityId) ?? selected;
  }

  const provider = selected.provider;
  const runtime = provider.diagnostics?.runtimeState;
  const endpoint = stringValue(runtime?.endpoint);
  const model = stringValue(embeddingSettings.modelId) ?? stringValue(runtime?.modelId) ?? stringValue(provider.modelId);
  const dimensions = positiveInteger(embeddingSettings.dimensions) ?? positiveInteger(provider.dimensions);
  const diagnostics = providerDiagnostics(baseDiagnostics, provider, selected.runtimeId);

  if (!provider.available) {
    return fallback({
      ...diagnostics,
      missingHints: provider.diagnostics?.missingHints,
    }, `Selected embedding provider is unavailable: ${provider.availabilityReason}`);
  }
  if (!runtime?.running) {
    return fallback(diagnostics, "Selected embedding provider is not running; keyword fallback remains active.");
  }
  if (!endpoint) return fallback(diagnostics, "Selected embedding provider did not report a local endpoint.");
  if (!model) return fallback(diagnostics, "Selected embedding provider did not report a model id.");
  if (!dimensions) return fallback(diagnostics, "Selected embedding provider did not report embedding dimensions.");

  const baseUrl = normalizeOpenAiEmbeddingBaseUrl(endpoint);
  let sendDimensions = embeddingSettings.sendDimensions;
  if (embeddingSettings.preflightEnabled) {
    const preflight = await preflightOpenAiCompatibleEmbeddingEndpoint({
      fetchImpl: input.fetchImpl,
      baseUrl,
      model,
      dimensions,
      sendDimensions,
      timeoutMs: embeddingSettings.timeoutMs,
    });
    if (!preflight.ok) {
      input.logger?.warn(`Ambient embedding preflight failed: ${preflight.message}`);
      return fallback({
        ...diagnostics,
        endpoint: baseUrl,
        lastError: preflight.message,
      }, "Embedding endpoint preflight failed; TencentDB memory will use keyword fallback.");
    }
    sendDimensions = preflight.sendDimensions;
  }

  return {
    config: {
      enabled: true,
      provider: AMBIENT_TENCENT_MEMORY_EMBEDDING_PROVIDER,
      baseUrl,
      apiKey: AMBIENT_TENCENT_MEMORY_LOCAL_EMBEDDING_API_KEY,
      model,
      dimensions,
      sendDimensions,
      maxInputChars: embeddingSettings.maxInputChars,
      timeoutMs: embeddingSettings.timeoutMs,
    },
    diagnostics: {
      ...diagnostics,
      status: "ready",
      message: embeddingSettings.preflightEnabled
        ? "Ambient-managed embedding provider preflight passed; TencentDB vector recall is enabled."
        : "Ambient-managed embedding provider resolved without preflight; TencentDB vector recall is enabled.",
      modelId: model,
      dimensions,
      endpoint: baseUrl,
      sendDimensions,
      reindexStatus: "unknown",
    },
    ...(releaseEmbeddingRuntime ? { releaseEmbeddingRuntime } : {}),
  };
}

export function applyAmbientTencentMemoryEmbeddingConfig(
  config: TencentMemoryConfig,
  embedding?: AmbientTencentMemoryResolvedEmbeddingConfig,
): TencentMemoryConfig {
  if (!embedding) return config;
  return {
    ...config,
    embedding: {
      ...(typeof config.embedding === "object" && config.embedding ? config.embedding as Record<string, unknown> : {}),
      ...embedding,
    },
  };
}

function selectEmbeddingProvider(
  providers: EmbeddingProviderCandidate[],
  providerCapabilityId?: string,
): SelectedEmbeddingProvider | undefined {
  const candidates = providers
    .map((provider) => ({ provider, runtimeId: embeddingRuntimeId(provider) }))
    .filter(({ provider }) => !providerCapabilityId || provider.capabilityId === providerCapabilityId || provider.providerId === providerCapabilityId);
  if (providerCapabilityId) return candidates[0];
  return candidates.find(({ provider }) => provider.local && provider.available && Boolean(provider.diagnostics?.runtimeState?.endpoint))
    ?? candidates.find(({ provider }) => provider.local && provider.available)
    ?? candidates.find(({ provider }) => provider.available && Boolean(provider.diagnostics?.runtimeState?.endpoint));
}

function embeddingRuntimeId(provider: EmbeddingProviderCandidate): string | undefined {
  const runtime = provider.diagnostics?.runtimeState;
  const runtimeId = stringValue(runtime?.modelRuntimeId) ?? stringValue(provider.providerId);
  return runtimeId ? `embeddings:${runtimeId}` : undefined;
}

function shouldStartProvider(provider: EmbeddingProviderCandidate): boolean {
  const runtime = provider.diagnostics?.runtimeState;
  return Boolean(runtime && !runtime.running && (provider.providerLifecycle || provider.providerId === AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID));
}

function providerDiagnostics(
  base: AgentMemoryEmbeddingDiagnostics,
  provider: EmbeddingProviderCandidate,
  runtimeId?: string,
): AgentMemoryEmbeddingDiagnostics {
  const runtime = provider.diagnostics?.runtimeState;
  return {
    ...base,
    providerId: provider.providerId,
    providerCapabilityId: provider.capabilityId,
    packageName: provider.packageName,
    ...(provider.modelId ? { modelId: provider.modelId } : {}),
    ...(runtime?.modelProfileId ? { modelProfileId: runtime.modelProfileId } : {}),
    ...(provider.dimensions !== undefined ? { dimensions: provider.dimensions } : {}),
    ...(runtime?.endpoint ? { endpoint: normalizeOpenAiEmbeddingBaseUrl(runtime.endpoint) } : {}),
    ...(runtimeId ? { runtimeId } : {}),
    ...(runtime?.status ? { runtimeStatus: runtime.status } : {}),
    ...(runtime ? { running: runtime.running } : {}),
    missingHints: provider.diagnostics?.missingHints,
  };
}

function fallback(
  diagnostics: AgentMemoryEmbeddingDiagnostics,
  message: string,
): AmbientTencentMemoryEmbeddingResolution {
  return {
    diagnostics: {
      ...diagnostics,
      status: diagnostics.status === "error" ? "error" : "keyword_fallback",
      message,
      reindexStatus: "not_required",
    },
  };
}

async function prepareManagedEmbeddingProviderIfNeeded(input: {
  baseDiagnostics: AgentMemoryEmbeddingDiagnostics;
  input: ResolveAmbientTencentMemoryEmbeddingProviderInput;
  providers: EmbeddingProviderCandidate[];
  selected?: SelectedEmbeddingProvider;
  providerCapabilityId?: string;
}): Promise<{
  providers?: EmbeddingProviderCandidate[];
  selected?: SelectedEmbeddingProvider;
  result?: AmbientTencentMemoryEmbeddingResolution;
}> {
  const selected = input.selected
    ?? selectRepairableManagedEmbeddingProvider(input.providers, input.providerCapabilityId);
  if (!selected || !shouldPrepareManagedProvider(selected.provider)) return {};
  if (!input.input.prepareEmbeddingProviderRuntime) {
    return {
      result: fallback(
        providerDiagnostics(input.baseDiagnostics, selected.provider, selected.runtimeId),
        "Selected embedding provider requires managed asset repair but this runtime cannot install it.",
      ),
    };
  }
  const prepareResult = await Promise.resolve(input.input.prepareEmbeddingProviderRuntime({
    runtimeId: selected.runtimeId,
    provider: selected.provider,
  })).catch((error) => ({ status: "failed" as const, reason: errorMessage(error) }));
  if (!isSuccessfulPrepareStatus(prepareResult.status)) {
    return {
      result: fallback(
        providerDiagnostics(input.baseDiagnostics, selected.provider, selected.runtimeId),
        `Selected embedding provider could not be prepared: ${prepareResult.reason ?? prepareResult.status}.`,
      ),
    };
  }
  const providers = await Promise.resolve(input.input.listEmbeddingProviders?.(input.input.workspacePath) ?? input.providers)
    .catch(() => input.providers);
  return {
    providers,
    selected: selectEmbeddingProvider(providers, input.providerCapabilityId)
      ?? selectRepairableManagedEmbeddingProvider(providers, input.providerCapabilityId),
  };
}

function isSuccessfulPrepareStatus(status: AmbientTencentMemoryEmbeddingPrepareResult["status"]): boolean {
  return status === "ready" || status === "installed" || status === "already-installed";
}

function selectRepairableManagedEmbeddingProvider(
  providers: EmbeddingProviderCandidate[],
  providerCapabilityId?: string,
): SelectedEmbeddingProvider | undefined {
  const candidates = providers
    .map((provider) => ({ provider, runtimeId: embeddingRuntimeId(provider) }))
    .filter(({ provider }) => isManagedMemoryEmbeddingProvider(provider))
    .filter(({ provider }) => !providerCapabilityId || provider.capabilityId === providerCapabilityId || provider.providerId === providerCapabilityId);
  return candidates[0];
}

function shouldPrepareManagedProvider(provider: EmbeddingProviderCandidate): boolean {
  return isManagedMemoryEmbeddingProvider(provider) && !provider.available;
}

function isManagedMemoryEmbeddingProvider(provider: EmbeddingProviderCandidate): boolean {
  return provider.providerId === AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID || provider.capabilityId === AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
