import type {
  AmbientModelLocality,
  AmbientModelProviderId,
  AmbientProviderDescriptor,
} from "./ambientModels";
import {
  AMBIENT_PROVIDER_AMBIENT,
  AMBIENT_PROVIDER_GMI_CLOUD,
  AMBIENT_PROVIDER_LOCAL,
} from "./ambientModels";

export const MODEL_PROVIDER_INSTALL_TEMPLATE_SCHEMA_VERSION = "ambient-model-provider-install-template-v1" as const;
export const MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION = "ambient-model-provider-capability-probe-v1" as const;
export const MODEL_PROVIDER_CAPABILITY_ELIGIBILITY_SCHEMA_VERSION = "ambient-model-provider-capability-eligibility-v1" as const;

export type ModelProviderInstallTemplateKind = "known_provider" | "generic_openai_compatible" | "generic_anthropic_compatible" | "local_runtime";
export type ModelProviderEndpointCompatibility = "ambient-compatible" | "openai-compatible" | "anthropic-compatible" | "local-text";
export type ModelProviderSecretFlow = "ambient-managed" | "ambient_cli_secret_request" | "ambient_cli_env_bind" | "none";

export type ModelProviderCapabilityProbeId =
  | "streaming"
  | "context_window"
  | "structured_json"
  | "schema_output"
  | "tool_use"
  | "image_input"
  | "latency"
  | "error_shape"
  | "health"
  | "local_memory"
  | "reliability";

export type ModelProviderCapabilityProbeStatus = "passed" | "failed" | "skipped" | "unknown";

export interface ModelProviderInstallTemplate {
  schemaVersion: typeof MODEL_PROVIDER_INSTALL_TEMPLATE_SCHEMA_VERSION;
  id: string;
  label: string;
  kind: ModelProviderInstallTemplateKind;
  providerId: AmbientModelProviderId;
  compatibility: ModelProviderEndpointCompatibility;
  locality: AmbientModelLocality;
  secretFlow: ModelProviderSecretFlow;
  endpointBaseUrlRequired: boolean;
  defaultProbeIds: ModelProviderCapabilityProbeId[];
  requiredProbeIdsForMain: ModelProviderCapabilityProbeId[];
  requiredProbeIdsForSubagent: ModelProviderCapabilityProbeId[];
  notes: string[];
}

export interface ModelProviderCapabilityProbePlan {
  schemaVersion: typeof MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION;
  templateId: string;
  providerId: AmbientModelProviderId;
  modelId: string;
  generatedAt: string;
  compatibility: ModelProviderEndpointCompatibility;
  probeIds: ModelProviderCapabilityProbeId[];
  requiredProbeIdsForMain: ModelProviderCapabilityProbeId[];
  requiredProbeIdsForSubagent: ModelProviderCapabilityProbeId[];
  secretFlow: ModelProviderSecretFlow;
}

export interface ModelProviderCapabilityProbeObservation {
  probeId: ModelProviderCapabilityProbeId;
  status: ModelProviderCapabilityProbeStatus;
  measuredAt: string;
  latencyMs?: number;
  value?: unknown;
  evidence?: string;
  error?: string;
}

export interface ModelProviderCapabilityProbeReport {
  schemaVersion: typeof MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION;
  templateId: string;
  providerId: AmbientModelProviderId;
  modelId: string;
  generatedAt: string;
  observations: ModelProviderCapabilityProbeObservation[];
}

export interface ModelProviderCapabilityDiagnostic {
  probeId: ModelProviderCapabilityProbeId;
  requiredForMain: boolean;
  requiredForSubagent: boolean;
  status: ModelProviderCapabilityProbeStatus | "missing";
  message: string;
}

export interface ModelProviderCapabilityEligibility {
  schemaVersion: typeof MODEL_PROVIDER_CAPABILITY_ELIGIBILITY_SCHEMA_VERSION;
  providerId: AmbientModelProviderId;
  modelId: string;
  templateId: string;
  eligibleAsMain: boolean;
  eligibleAsSubagent: boolean;
  mainBlockers: string[];
  subagentBlockers: string[];
  warnings: string[];
  diagnostics: ModelProviderCapabilityDiagnostic[];
}

export const MODEL_PROVIDER_INSTALL_TEMPLATES: ModelProviderInstallTemplate[] = [
  {
    schemaVersion: MODEL_PROVIDER_INSTALL_TEMPLATE_SCHEMA_VERSION,
    id: "ambient-managed",
    label: "Ambient managed provider",
    kind: "known_provider",
    providerId: AMBIENT_PROVIDER_AMBIENT,
    compatibility: "ambient-compatible",
    locality: "cloud",
    secretFlow: "ambient-managed",
    endpointBaseUrlRequired: false,
    defaultProbeIds: ["streaming", "context_window", "structured_json", "schema_output", "tool_use", "latency", "error_shape", "reliability"],
    requiredProbeIdsForMain: ["streaming", "context_window", "latency", "error_shape", "reliability"],
    requiredProbeIdsForSubagent: ["streaming", "context_window", "structured_json", "schema_output", "tool_use", "latency", "error_shape", "reliability"],
    notes: ["Known Ambient-compatible provider shape; probes still record observed behavior before eligibility."],
  },
  {
    schemaVersion: MODEL_PROVIDER_INSTALL_TEMPLATE_SCHEMA_VERSION,
    id: "gmi-cloud",
    label: "GMI Cloud Ambient-compatible provider",
    kind: "known_provider",
    providerId: AMBIENT_PROVIDER_GMI_CLOUD,
    compatibility: "ambient-compatible",
    locality: "cloud",
    secretFlow: "ambient_cli_env_bind",
    endpointBaseUrlRequired: true,
    defaultProbeIds: ["streaming", "context_window", "structured_json", "schema_output", "tool_use", "latency", "error_shape", "reliability"],
    requiredProbeIdsForMain: ["streaming", "context_window", "latency", "error_shape", "reliability"],
    requiredProbeIdsForSubagent: ["streaming", "context_window", "structured_json", "schema_output", "tool_use", "latency", "error_shape", "reliability"],
    notes: ["Temporary Ambient-compatible transport override; key material must stay in Ambient-managed secret or ignored env-bound files."],
  },
  {
    schemaVersion: MODEL_PROVIDER_INSTALL_TEMPLATE_SCHEMA_VERSION,
    id: "generic-openai-compatible",
    label: "Generic OpenAI-compatible endpoint",
    kind: "generic_openai_compatible",
    providerId: "custom-openai-compatible",
    compatibility: "openai-compatible",
    locality: "cloud",
    secretFlow: "ambient_cli_secret_request",
    endpointBaseUrlRequired: true,
    defaultProbeIds: ["streaming", "context_window", "structured_json", "schema_output", "tool_use", "image_input", "latency", "error_shape", "reliability"],
    requiredProbeIdsForMain: ["streaming", "context_window", "latency", "error_shape", "reliability"],
    requiredProbeIdsForSubagent: ["streaming", "context_window", "structured_json", "schema_output", "tool_use", "latency", "error_shape", "reliability"],
    notes: ["Generic installer must test actual endpoint behavior instead of trusting advertised OpenAI compatibility."],
  },
  {
    schemaVersion: MODEL_PROVIDER_INSTALL_TEMPLATE_SCHEMA_VERSION,
    id: "generic-anthropic-compatible",
    label: "Generic Anthropic-compatible endpoint",
    kind: "generic_anthropic_compatible",
    providerId: "custom-anthropic-compatible",
    compatibility: "anthropic-compatible",
    locality: "cloud",
    secretFlow: "ambient_cli_secret_request",
    endpointBaseUrlRequired: true,
    defaultProbeIds: ["streaming", "context_window", "structured_json", "tool_use", "image_input", "latency", "error_shape", "reliability"],
    requiredProbeIdsForMain: ["streaming", "context_window", "latency", "error_shape", "reliability"],
    requiredProbeIdsForSubagent: ["streaming", "context_window", "structured_json", "tool_use", "latency", "error_shape", "reliability"],
    notes: ["Generic installer must test actual endpoint behavior instead of trusting advertised Anthropic compatibility."],
  },
  {
    schemaVersion: MODEL_PROVIDER_INSTALL_TEMPLATE_SCHEMA_VERSION,
    id: "local-text-runtime",
    label: "Local text runtime",
    kind: "local_runtime",
    providerId: AMBIENT_PROVIDER_LOCAL,
    compatibility: "local-text",
    locality: "local",
    secretFlow: "none",
    endpointBaseUrlRequired: true,
    defaultProbeIds: ["streaming", "context_window", "structured_json", "latency", "error_shape", "health", "local_memory", "reliability"],
    requiredProbeIdsForMain: ["streaming", "context_window", "latency", "error_shape", "health", "local_memory", "reliability"],
    requiredProbeIdsForSubagent: ["streaming", "context_window", "structured_json", "latency", "error_shape", "health", "local_memory", "reliability"],
    notes: ["Local sub-agent delegation requires health, memory, and reliability evidence before child eligibility."],
  },
];

export function modelProviderInstallTemplateById(templateId: string): ModelProviderInstallTemplate | undefined {
  return MODEL_PROVIDER_INSTALL_TEMPLATES.find((template) => template.id === templateId);
}

export function modelProviderInstallTemplatesForProvider(providerId: AmbientModelProviderId): ModelProviderInstallTemplate[] {
  return MODEL_PROVIDER_INSTALL_TEMPLATES
    .filter((template) => template.providerId === providerId)
    .map(cloneTemplate);
}

export function providerDescriptorFromInstallTemplate(input: {
  template: ModelProviderInstallTemplate;
  providerId?: AmbientModelProviderId;
  label?: string;
  notes?: readonly string[];
}): AmbientProviderDescriptor {
  return {
    id: input.providerId ?? input.template.providerId,
    label: input.label ?? input.template.label,
    locality: input.template.locality,
    secretRequirement: input.template.secretFlow === "none"
      ? "none"
      : input.template.secretFlow === "ambient-managed"
        ? "ambient-managed"
        : "user-secret",
    supportsStreaming: input.template.defaultProbeIds.includes("streaming"),
    supportsTools: input.template.defaultProbeIds.includes("tool_use"),
    notes: [...input.template.notes, ...(input.notes ?? [])],
  };
}

export function buildModelProviderCapabilityProbePlan(input: {
  template: ModelProviderInstallTemplate;
  modelId: string;
  providerId?: AmbientModelProviderId;
  generatedAt?: string;
  extraProbeIds?: readonly ModelProviderCapabilityProbeId[];
}): ModelProviderCapabilityProbePlan {
  const probeIds = uniqueProbeIds([
    ...input.template.defaultProbeIds,
    ...input.template.requiredProbeIdsForMain,
    ...input.template.requiredProbeIdsForSubagent,
    ...(input.extraProbeIds ?? []),
  ]);
  return {
    schemaVersion: MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
    templateId: input.template.id,
    providerId: input.providerId ?? input.template.providerId,
    modelId: input.modelId.trim(),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    compatibility: input.template.compatibility,
    probeIds,
    requiredProbeIdsForMain: uniqueProbeIds(input.template.requiredProbeIdsForMain),
    requiredProbeIdsForSubagent: uniqueProbeIds(input.template.requiredProbeIdsForSubagent),
    secretFlow: input.template.secretFlow,
  };
}

function uniqueProbeIds(ids: readonly ModelProviderCapabilityProbeId[]): ModelProviderCapabilityProbeId[] {
  return [...new Set(ids)];
}

function cloneTemplate(template: ModelProviderInstallTemplate): ModelProviderInstallTemplate {
  return {
    ...template,
    defaultProbeIds: [...template.defaultProbeIds],
    requiredProbeIdsForMain: [...template.requiredProbeIdsForMain],
    requiredProbeIdsForSubagent: [...template.requiredProbeIdsForSubagent],
    notes: [...template.notes],
  };
}
