export type AgentMemoryAdapter = "tencentdb";
export type AgentMemoryStorageScope = "workspace";
export type AgentMemoryEmbeddingProviderMode = "ambient-managed";
export type AgentMemoryMode = "enabled_all" | "per_thread" | "disabled";

export const MIN_AGENT_MEMORY_EMBEDDING_TIMEOUT_MS = 1_000;
export const MAX_AGENT_MEMORY_EMBEDDING_TIMEOUT_MS = 120_000;
export const MIN_AGENT_MEMORY_EMBEDDING_INPUT_CHARS = 128;
export const MAX_AGENT_MEMORY_EMBEDDING_INPUT_CHARS = 20_000;

export interface AgentMemoryEmbeddingSettings {
  enabled: boolean;
  providerMode: AgentMemoryEmbeddingProviderMode;
  providerCapabilityId?: string;
  autoStartProvider: boolean;
  modelId?: string;
  dimensions?: number;
  sendDimensions: boolean;
  maxInputChars: number;
  timeoutMs: number;
  preflightEnabled: boolean;
}

export interface AgentMemorySettings {
  mode: AgentMemoryMode;
  enabled: boolean;
  defaultThreadEnabled: boolean;
  adapter: AgentMemoryAdapter;
  shortTermOffloadEnabled: boolean;
  embeddings: AgentMemoryEmbeddingSettings;
  storageScope: AgentMemoryStorageScope;
}

export interface AgentMemorySettingsInput extends Partial<Omit<AgentMemorySettings, "embeddings">> {
  embeddings?: Partial<AgentMemoryEmbeddingSettings> | null;
}

export interface UpdateAgentMemorySettingsInput {
  mode?: AgentMemoryMode;
  enabled?: boolean;
  defaultThreadEnabled?: boolean;
  adapter?: AgentMemoryAdapter;
  shortTermOffloadEnabled?: boolean;
  embeddings?: Partial<AgentMemoryEmbeddingSettings>;
  storageScope?: AgentMemoryStorageScope;
}

export const DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS: AgentMemoryEmbeddingSettings = {
  enabled: true,
  providerMode: "ambient-managed",
  autoStartProvider: true,
  sendDimensions: false,
  maxInputChars: 512,
  timeoutMs: 10_000,
  preflightEnabled: true,
};

export const DEFAULT_AGENT_MEMORY_SETTINGS: AgentMemorySettings = {
  mode: "enabled_all",
  enabled: true,
  defaultThreadEnabled: true,
  adapter: "tencentdb",
  shortTermOffloadEnabled: false,
  embeddings: DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS,
  storageScope: "workspace",
};

function normalizeAgentMemoryAdapter(value: unknown): AgentMemoryAdapter {
  return value === "tencentdb" ? "tencentdb" : DEFAULT_AGENT_MEMORY_SETTINGS.adapter;
}

function normalizeAgentMemoryStorageScope(value: unknown): AgentMemoryStorageScope {
  return value === "workspace" ? "workspace" : DEFAULT_AGENT_MEMORY_SETTINGS.storageScope;
}

function normalizeAgentMemoryEmbeddingProviderMode(value: unknown): AgentMemoryEmbeddingProviderMode {
  return value === "ambient-managed" ? "ambient-managed" : DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS.providerMode;
}

export function normalizeAgentMemoryMode(value: unknown): AgentMemoryMode {
  return isAgentMemoryMode(value)
    ? value
    : DEFAULT_AGENT_MEMORY_SETTINGS.mode;
}

function isAgentMemoryMode(value: unknown): value is AgentMemoryMode {
  return value === "enabled_all" || value === "per_thread" || value === "disabled";
}

function inferAgentMemoryMode(input?: AgentMemorySettingsInput | null): AgentMemoryMode {
  const hasMode = Boolean(input && Object.prototype.hasOwnProperty.call(input, "mode"));
  if (isAgentMemoryMode(input?.mode)) return input.mode;
  if (input && typeof input.enabled === "boolean") {
    if (!input.enabled) return "disabled";
    return input.defaultThreadEnabled === false ? "per_thread" : "enabled_all";
  }
  if (input && typeof input.defaultThreadEnabled === "boolean") {
    return input.defaultThreadEnabled ? "enabled_all" : "per_thread";
  }
  if (hasMode) return "disabled";
  return DEFAULT_AGENT_MEMORY_SETTINGS.mode;
}

function agentMemoryLegacyPatchMode(
  current: AgentMemorySettings,
  patch: UpdateAgentMemorySettingsInput,
): AgentMemoryMode {
  if (patch.mode) return normalizeAgentMemoryMode(patch.mode);
  if (patch.enabled === false) return "disabled";
  if (patch.enabled === true && patch.defaultThreadEnabled === false) return "per_thread";
  if (patch.enabled === true) return "enabled_all";
  if (patch.defaultThreadEnabled === false && current.mode === "enabled_all") return "per_thread";
  if (patch.defaultThreadEnabled === true && current.mode === "per_thread") return "enabled_all";
  return current.mode;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeAgentMemoryEmbeddingSettings(
  input?: Partial<AgentMemoryEmbeddingSettings> | null,
): AgentMemoryEmbeddingSettings {
  return {
    enabled: typeof input?.enabled === "boolean" ? input.enabled : DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS.enabled,
    providerMode: normalizeAgentMemoryEmbeddingProviderMode(input?.providerMode),
    ...(normalizeOptionalString(input?.providerCapabilityId) ? { providerCapabilityId: normalizeOptionalString(input?.providerCapabilityId) } : {}),
    autoStartProvider: typeof input?.autoStartProvider === "boolean"
      ? input.autoStartProvider
      : DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS.autoStartProvider,
    ...(normalizeOptionalString(input?.modelId) ? { modelId: normalizeOptionalString(input?.modelId) } : {}),
    ...(normalizeOptionalPositiveInteger(input?.dimensions) ? { dimensions: normalizeOptionalPositiveInteger(input?.dimensions) } : {}),
    sendDimensions: typeof input?.sendDimensions === "boolean"
      ? input.sendDimensions
      : DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS.sendDimensions,
    maxInputChars: normalizeBoundedInteger(
      input?.maxInputChars,
      DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS.maxInputChars,
      MIN_AGENT_MEMORY_EMBEDDING_INPUT_CHARS,
      MAX_AGENT_MEMORY_EMBEDDING_INPUT_CHARS,
    ),
    timeoutMs: normalizeBoundedInteger(
      input?.timeoutMs,
      DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS.timeoutMs,
      MIN_AGENT_MEMORY_EMBEDDING_TIMEOUT_MS,
      MAX_AGENT_MEMORY_EMBEDDING_TIMEOUT_MS,
    ),
    preflightEnabled: typeof input?.preflightEnabled === "boolean"
      ? input.preflightEnabled
      : DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS.preflightEnabled,
  };
}

export function normalizeAgentMemorySettings(input?: AgentMemorySettingsInput | null): AgentMemorySettings {
  const mode = inferAgentMemoryMode(input);
  const embeddings = normalizeAgentMemoryEmbeddingSettings(input?.embeddings);
  const managedEmbeddings = {
    ...embeddings,
    providerMode: "ambient-managed" as const,
    enabled: mode === "disabled" ? false : embeddings.enabled,
    autoStartProvider: mode === "disabled" ? false : embeddings.autoStartProvider,
  };
  return {
    mode,
    enabled: mode !== "disabled",
    defaultThreadEnabled: mode === "enabled_all",
    adapter: normalizeAgentMemoryAdapter(input?.adapter),
    shortTermOffloadEnabled: typeof input?.shortTermOffloadEnabled === "boolean"
      ? input.shortTermOffloadEnabled
      : DEFAULT_AGENT_MEMORY_SETTINGS.shortTermOffloadEnabled,
    embeddings: managedEmbeddings,
    storageScope: normalizeAgentMemoryStorageScope(input?.storageScope),
  };
}

export function applyAgentMemorySettingsPatch(
  current: AgentMemorySettings,
  patch: UpdateAgentMemorySettingsInput,
): AgentMemorySettings {
  const mode = agentMemoryLegacyPatchMode(current, patch);
  return normalizeAgentMemorySettings({
    ...current,
    mode,
    ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
    ...(typeof patch.defaultThreadEnabled === "boolean" ? { defaultThreadEnabled: patch.defaultThreadEnabled } : {}),
    ...(patch.adapter === "tencentdb" ? { adapter: patch.adapter } : {}),
    ...(typeof patch.shortTermOffloadEnabled === "boolean" ? { shortTermOffloadEnabled: patch.shortTermOffloadEnabled } : {}),
    ...(patch.embeddings && typeof patch.embeddings === "object" ? {
      embeddings: normalizeAgentMemoryEmbeddingSettings({
        ...current.embeddings,
        ...patch.embeddings,
      }),
    } : {}),
    ...(patch.storageScope === "workspace" ? { storageScope: patch.storageScope } : {}),
  });
}

export function isAgentMemoryActiveForThread(input: {
  featureEnabled: boolean;
  settings?: AgentMemorySettingsInput | null;
  threadMemoryEnabled: boolean;
  storageHealthy?: boolean;
}): boolean {
  const settings = normalizeAgentMemorySettings(input.settings);
  const policyAllowsThread = settings.mode === "enabled_all" ||
    (settings.mode === "per_thread" && input.threadMemoryEnabled);
  return Boolean(
    input.featureEnabled &&
    settings.enabled &&
    settings.adapter === "tencentdb" &&
    policyAllowsThread &&
    (input.storageHealthy ?? true),
  );
}

export function agentMemoryModeAllowsManagedRuntime(settings: AgentMemorySettingsInput | null | undefined): boolean {
  return normalizeAgentMemorySettings(settings).mode !== "disabled";
}

export function shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate(
  previous: AgentMemorySettings,
  next: AgentMemorySettings,
): boolean {
  const nextManagedAutoStart = Boolean(
    next.mode !== "disabled" &&
    next.enabled &&
    next.embeddings.enabled &&
    next.embeddings.providerMode === "ambient-managed" &&
    next.embeddings.autoStartProvider,
  );
  if (!nextManagedAutoStart) return false;
  const previousManagedAutoStart = Boolean(
    previous.mode !== "disabled" &&
    previous.enabled &&
    previous.embeddings.enabled &&
    previous.embeddings.providerMode === "ambient-managed" &&
    previous.embeddings.autoStartProvider,
  );
  return !previousManagedAutoStart ||
    previous.embeddings.providerCapabilityId !== next.embeddings.providerCapabilityId;
}
