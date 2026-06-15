export type AgentMemoryAdapter = "tencentdb";
export type AgentMemoryStorageScope = "workspace";
export type AgentMemoryEmbeddingProviderMode = "ambient-managed";

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
  enabled?: boolean;
  defaultThreadEnabled?: boolean;
  adapter?: AgentMemoryAdapter;
  shortTermOffloadEnabled?: boolean;
  embeddings?: Partial<AgentMemoryEmbeddingSettings>;
  storageScope?: AgentMemoryStorageScope;
}

export const DEFAULT_AGENT_MEMORY_EMBEDDING_SETTINGS: AgentMemoryEmbeddingSettings = {
  enabled: false,
  providerMode: "ambient-managed",
  autoStartProvider: false,
  sendDimensions: false,
  maxInputChars: 512,
  timeoutMs: 10_000,
  preflightEnabled: true,
};

export const DEFAULT_AGENT_MEMORY_SETTINGS: AgentMemorySettings = {
  enabled: false,
  defaultThreadEnabled: false,
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
  return {
    enabled: typeof input?.enabled === "boolean" ? input.enabled : DEFAULT_AGENT_MEMORY_SETTINGS.enabled,
    defaultThreadEnabled: typeof input?.defaultThreadEnabled === "boolean"
      ? input.defaultThreadEnabled
      : DEFAULT_AGENT_MEMORY_SETTINGS.defaultThreadEnabled,
    adapter: normalizeAgentMemoryAdapter(input?.adapter),
    shortTermOffloadEnabled: typeof input?.shortTermOffloadEnabled === "boolean"
      ? input.shortTermOffloadEnabled
      : DEFAULT_AGENT_MEMORY_SETTINGS.shortTermOffloadEnabled,
    embeddings: normalizeAgentMemoryEmbeddingSettings(input?.embeddings),
    storageScope: normalizeAgentMemoryStorageScope(input?.storageScope),
  };
}

export function applyAgentMemorySettingsPatch(
  current: AgentMemorySettings,
  patch: UpdateAgentMemorySettingsInput,
): AgentMemorySettings {
  return normalizeAgentMemorySettings({
    ...current,
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
  return Boolean(
    input.featureEnabled &&
    settings.enabled &&
    settings.adapter === "tencentdb" &&
    input.threadMemoryEnabled &&
    (input.storageHealthy ?? true),
  );
}
