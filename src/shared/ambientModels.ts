export const AMBIENT_KIMI_K2_7_CODE_MODEL = "moonshotai/kimi-k2.7-code";
export const AMBIENT_GLM_5_1_FP8_MODEL = "zai-org/GLM-5.1-FP8";
export const AMBIENT_GLM_5_2_FP8_MODEL = "zai-org/GLM-5.2-FP8";
export const AMBIENT_DEFAULT_MODEL = AMBIENT_KIMI_K2_7_CODE_MODEL;

export const AMBIENT_PROVIDER_AMBIENT = "ambient" as const;
export const AMBIENT_PROVIDER_GMI_CLOUD = "gmi-cloud" as const;
export const AMBIENT_PROVIDER_LOCAL = "local" as const;
export const AMBIENT_LOCAL_TEXT_MODEL = "local/text-4b" as const;

export type AmbientModelProviderId =
  | typeof AMBIENT_PROVIDER_AMBIENT
  | typeof AMBIENT_PROVIDER_GMI_CLOUD
  | typeof AMBIENT_PROVIDER_LOCAL
  | (string & {});

export type AmbientModelLocality = "cloud" | "local";
export type AmbientModelToolUseSupport = "none" | "ambient-tools" | "mcp-compatible";
export type AmbientModelStructuredOutputSupport = "none" | "json-mode" | "schema";
export type AmbientModelCostClass = "included" | "metered" | "local";
export type AmbientModelTrustClass = "ambient-managed" | "user-configured" | "local-user-managed";
export type AmbientProviderEndpointCompatibility = "ambient-compatible" | "openai-compatible" | "anthropic-compatible" | "local-text";

export interface AmbientProviderEndpointDescriptor {
  schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1";
  compatibility: Exclude<AmbientProviderEndpointCompatibility, "local-text">;
  baseUrl: string;
  anthropicVersion?: string;
}

export interface AmbientProviderDescriptor {
  id: AmbientModelProviderId;
  label: string;
  locality: AmbientModelLocality;
  secretRequirement: "ambient-managed" | "user-secret" | "none";
  supportsStreaming: boolean;
  supportsTools: boolean;
  endpoint?: AmbientProviderEndpointDescriptor;
  notes: string[];
}

export interface AmbientModelRuntimeProfile {
  schemaVersion: "ambient-model-runtime-profile-v1";
  profileId: string;
  providerId: AmbientModelProviderId;
  modelId: string;
  label: string;
  selectableAsMain: boolean;
  selectableAsSubagent: boolean;
  available: boolean;
  unavailableReason?: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  supportsStreaming: boolean;
  toolUse: AmbientModelToolUseSupport;
  structuredOutput: AmbientModelStructuredOutputSupport;
  supportsVision: boolean;
  supportsAudio: boolean;
  locality: AmbientModelLocality;
  costClass: AmbientModelCostClass;
  trustClass: AmbientModelTrustClass;
  privacyLabel: string;
  memoryClass?: "remote" | "small-local" | "medium-local" | "large-local";
  estimatedResidentMemoryBytes?: number;
  providerQuirks: string[];
}

export interface AmbientModelRuntimeSnapshot {
  schemaVersion: "ambient-model-runtime-snapshot-v1";
  resolvedAt: string;
  requestedModelId: string;
  profile: AmbientModelRuntimeProfile;
}

export interface AmbientModelOption {
  id: string;
  label: string;
  profileId: string;
  providerId: AmbientModelProviderId;
  locality: AmbientModelLocality;
  costClass: AmbientModelCostClass;
  privacyLabel: string;
}

export interface AmbientModelRuntimeCatalogValidationIssue {
  profileId?: string;
  providerId?: AmbientModelProviderId;
  field: string;
  message: string;
}

export interface AmbientModelRuntimeCatalog {
  schemaVersion: "ambient-model-runtime-catalog-v1";
  generatedAt: string;
  providers: AmbientProviderDescriptor[];
  profiles: AmbientModelRuntimeProfile[];
  selectableMainModelOptions: AmbientModelOption[];
  selectableSubagentProfiles: AmbientModelRuntimeProfile[];
  validationIssues: AmbientModelRuntimeCatalogValidationIssue[];
}

export const AMBIENT_LEGACY_MODEL_IDS = [
  ["glm-5.2", AMBIENT_GLM_5_2_FP8_MODEL],
  ["glm-5.1", AMBIENT_GLM_5_2_FP8_MODEL],
  ["glm-5", AMBIENT_GLM_5_2_FP8_MODEL],
  ["ambient/large", AMBIENT_GLM_5_2_FP8_MODEL],
  ["zai-org/GLM-5-FP8", AMBIENT_GLM_5_2_FP8_MODEL],
  [AMBIENT_GLM_5_1_FP8_MODEL, AMBIENT_GLM_5_2_FP8_MODEL],
] as const;

const legacyModelMap = new Map<string, string>(AMBIENT_LEGACY_MODEL_IDS);

export const AMBIENT_PROVIDER_DESCRIPTORS: AmbientProviderDescriptor[] = [
  {
    id: AMBIENT_PROVIDER_AMBIENT,
    label: "Ambient",
    locality: "cloud",
    secretRequirement: "ambient-managed",
    supportsStreaming: true,
    supportsTools: true,
    notes: ["Primary Ambient-compatible provider for product chat and Pi sessions."],
  },
  {
    id: AMBIENT_PROVIDER_GMI_CLOUD,
    label: "GMI Cloud",
    locality: "cloud",
    secretRequirement: "user-secret",
    supportsStreaming: true,
    supportsTools: true,
    notes: ["Temporary Ambient-compatible transport override used during provider outage validation."],
  },
  {
    id: AMBIENT_PROVIDER_LOCAL,
    label: "Local runtime",
    locality: "local",
    secretRequirement: "none",
    supportsStreaming: true,
    supportsTools: false,
    notes: ["User-managed local runtime profiles stay unavailable until an explicit runtime launch descriptor is configured."],
  },
];

export const AMBIENT_MODEL_RUNTIME_PROFILES: AmbientModelRuntimeProfile[] = [
  {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: `${AMBIENT_PROVIDER_AMBIENT}:${AMBIENT_DEFAULT_MODEL}`,
    providerId: AMBIENT_PROVIDER_AMBIENT,
    modelId: AMBIENT_DEFAULT_MODEL,
    label: "Kimi K2.7 Code",
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    contextWindowTokens: 262_144,
    maxOutputTokens: 262_144,
    supportsStreaming: true,
    toolUse: "ambient-tools",
    structuredOutput: "schema",
    supportsVision: true,
    supportsAudio: false,
    locality: "cloud",
    costClass: "included",
    trustClass: "ambient-managed",
    privacyLabel: "Ambient managed cloud model",
    memoryClass: "remote",
    providerQuirks: [
      "Qualified for main Ambient/Pi calls with live endpoint probes on 2026-06-14.",
      "OpenRouter Ambient metadata reports max_completion_tokens=262144 and structured output/tool parameters.",
      "Supports image input through the Ambient/Pi OpenAI-compatible image_url content path.",
    ],
  },
  {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: `${AMBIENT_PROVIDER_AMBIENT}:${AMBIENT_GLM_5_2_FP8_MODEL}`,
    providerId: AMBIENT_PROVIDER_AMBIENT,
    modelId: AMBIENT_GLM_5_2_FP8_MODEL,
    label: "GLM-5.2 FP8",
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    contextWindowTokens: 202_752,
    maxOutputTokens: 202_752,
    supportsStreaming: true,
    toolUse: "ambient-tools",
    structuredOutput: "schema",
    supportsVision: false,
    supportsAudio: false,
    locality: "cloud",
    costClass: "included",
    trustClass: "ambient-managed",
    privacyLabel: "Ambient managed cloud model",
    memoryClass: "remote",
    providerQuirks: [
      "Discovered through the Ambient /v1/models endpoint after the GLM 5.2 migration.",
      "Uses Ambient/Pi streaming and timeout semantics.",
      "Streams reasoning deltas before visible content on small prompts.",
    ],
  },
  {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}`,
    providerId: AMBIENT_PROVIDER_LOCAL,
    modelId: AMBIENT_LOCAL_TEXT_MODEL,
    label: "Local Text 4B",
    selectableAsMain: false,
    selectableAsSubagent: false,
    available: false,
    unavailableReason: "Local text runtime is not configured in this Ambient Desktop build.",
    contextWindowTokens: 16_384,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    toolUse: "none",
    structuredOutput: "none",
    supportsVision: false,
    supportsAudio: false,
    locality: "local",
    costClass: "local",
    trustClass: "local-user-managed",
    privacyLabel: "Local user-managed text runtime",
    memoryClass: "small-local",
    providerQuirks: [
      "Text-only Phase 3 placeholder; requires a configured launch descriptor before selection.",
      "No Ambient/Pi tools are exposed to this profile.",
    ],
  },
];

export const AMBIENT_MODEL_OPTIONS = ambientModelOptionsFromRuntimeProfiles();

export function ambientModelRuntimeCatalogFromProfiles(input: {
  generatedAt?: string;
  providers?: readonly AmbientProviderDescriptor[];
  profiles?: readonly AmbientModelRuntimeProfile[];
  validationIssues?: readonly AmbientModelRuntimeCatalogValidationIssue[];
} = {}): AmbientModelRuntimeCatalog {
  const providers = input.providers ?? AMBIENT_PROVIDER_DESCRIPTORS;
  const profiles = input.profiles ?? AMBIENT_MODEL_RUNTIME_PROFILES;
  return {
    schemaVersion: "ambient-model-runtime-catalog-v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    providers: providers.map(cloneAmbientProviderDescriptor),
    profiles: profiles.map(cloneAmbientModelRuntimeProfile),
    selectableMainModelOptions: ambientModelOptionsFromRuntimeProfiles(profiles),
    selectableSubagentProfiles: profiles
      .filter((profile) => profile.available && profile.selectableAsSubagent)
      .map(cloneAmbientModelRuntimeProfile),
    validationIssues: (input.validationIssues ?? []).map(cloneAmbientModelRuntimeCatalogValidationIssue),
  };
}

export function ambientModelOptionsFromRuntimeProfiles(
  profiles: readonly AmbientModelRuntimeProfile[] = AMBIENT_MODEL_RUNTIME_PROFILES,
): AmbientModelOption[] {
  const options = profiles
    .filter((profile) => profile.available && profile.selectableAsMain)
    .map(ambientModelOptionFromProfile);
  if (options.length > 0) return options;
  return [ambientModelOptionFromProfile(resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL))];
}

export function normalizeAmbientModelId(modelId?: string): string {
  const trimmed = modelId?.trim();
  if (!trimmed) return AMBIENT_DEFAULT_MODEL;
  if (trimmed === AMBIENT_DEFAULT_MODEL) return AMBIENT_DEFAULT_MODEL;
  return legacyModelMap.get(trimmed) ?? trimmed;
}

export function ambientModelLabel(modelId: string): string {
  const normalized = normalizeAmbientModelId(modelId);
  return resolveAmbientModelRuntimeProfile(normalized).label;
}

export function resolveAmbientModelRuntimeProfile(modelId?: string): AmbientModelRuntimeProfile {
  const normalized = normalizeAmbientModelId(modelId);
  const profile = AMBIENT_MODEL_RUNTIME_PROFILES.find((candidate) => candidate.modelId === normalized);
  if (profile) return profile;
  return {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: `unknown:${normalized}`,
    providerId: "unknown",
    modelId: normalized,
    label: `${normalized} (unavailable)`,
    selectableAsMain: false,
    selectableAsSubagent: false,
    available: false,
    unavailableReason: "Model is not registered in this Ambient Desktop build.",
    supportsStreaming: false,
    toolUse: "none",
    structuredOutput: "none",
    supportsVision: false,
    supportsAudio: false,
    locality: "cloud",
    costClass: "metered",
    trustClass: "user-configured",
    privacyLabel: "Unknown provider",
    providerQuirks: ["Preserved from stored settings or transcript; not eligible for new runs until registered."],
  };
}

export function createAmbientModelRuntimeSnapshotFromProfile(
  requestedModelId: string,
  profile: AmbientModelRuntimeProfile,
  resolvedAt = new Date().toISOString(),
): AmbientModelRuntimeSnapshot {
  return {
    schemaVersion: "ambient-model-runtime-snapshot-v1",
    resolvedAt,
    requestedModelId,
    profile,
  };
}

export function createAmbientModelRuntimeSnapshot(modelId: string, resolvedAt = new Date().toISOString()): AmbientModelRuntimeSnapshot {
  return createAmbientModelRuntimeSnapshotFromProfile(
    modelId,
    resolveAmbientModelRuntimeProfile(modelId),
    resolvedAt,
  );
}

function ambientModelOptionFromProfile(profile: AmbientModelRuntimeProfile): AmbientModelOption {
  return {
    id: profile.modelId,
    label: profile.label,
    profileId: profile.profileId,
    providerId: profile.providerId,
    locality: profile.locality,
    costClass: profile.costClass,
    privacyLabel: profile.privacyLabel,
  };
}

function cloneAmbientProviderDescriptor(provider: AmbientProviderDescriptor): AmbientProviderDescriptor {
  return {
    ...provider,
    ...(provider.endpoint ? { endpoint: { ...provider.endpoint } } : {}),
    notes: [...provider.notes],
  };
}

function cloneAmbientModelRuntimeProfile(profile: AmbientModelRuntimeProfile): AmbientModelRuntimeProfile {
  return {
    ...profile,
    providerQuirks: [...profile.providerQuirks],
  };
}

function cloneAmbientModelRuntimeCatalogValidationIssue(
  issue: AmbientModelRuntimeCatalogValidationIssue,
): AmbientModelRuntimeCatalogValidationIssue {
  return { ...issue };
}
