import type {
  AmbientModelCostClass,
  AmbientModelProviderId,
  AmbientModelRuntimeProfile,
  AmbientModelStructuredOutputSupport,
  AmbientModelToolUseSupport,
  AmbientModelTrustClass,
  AmbientProviderDescriptor,
} from "../../shared/ambientModels";
import type {
  ModelRuntimeInstalledProvider,
  ModelRuntimeInstalledProviderEndpointConfig,
  ModelRuntimeInstalledProviderSecretRef,
} from "../../shared/types";
import type {
  ModelProviderCapabilityEligibility,
  ModelProviderCapabilityProbeId,
  ModelProviderCapabilityProbeObservation,
  ModelProviderCapabilityProbePlan,
  ModelProviderCapabilityProbeReport,
  ModelProviderEndpointCompatibility,
  ModelProviderInstallTemplate,
} from "../../shared/modelProviderInstallTemplates";
import {
  buildModelProviderCapabilityProbePlan,
  modelProviderInstallTemplateById,
  modelRuntimeProfileWithCapabilityProbeEligibility,
  probeModelProviderCapabilityEligibility,
  providerDescriptorFromInstallTemplate,
} from "./modelProviderCapabilityProbe";
import { createModelProviderEndpointProbeAdapter } from "./modelProviderEndpointProbeAdapter";
import { runModelProviderCapabilityProbePlan } from "./modelProviderCapabilityProbeRunner";

export const MODEL_PROVIDER_ENDPOINT_PROBE_SERVICE_SCHEMA_VERSION = "ambient-model-provider-endpoint-probe-service-v1" as const;

type EndpointProbeCompatibility = Exclude<ModelProviderEndpointCompatibility, "local-text">;

export interface ModelProviderEndpointProbeServiceInput {
  templateId: string;
  providerId?: AmbientModelProviderId;
  providerLabel?: string;
  modelId: string;
  modelLabel?: string;
  baseUrl: string;
  ambientManagedSecret: string;
  generatedAt?: string;
  measuredAt?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  anthropicVersion?: string;
  reliabilitySampleCount?: number;
  extraProbeIds?: readonly ModelProviderCapabilityProbeId[];
}

export interface ModelProviderEndpointProbeServiceResult {
  schemaVersion: typeof MODEL_PROVIDER_ENDPOINT_PROBE_SERVICE_SCHEMA_VERSION;
  templateId: string;
  provider: AmbientProviderDescriptor;
  endpoint: ModelRuntimeInstalledProviderEndpointConfig;
  candidateProfile: AmbientModelRuntimeProfile;
  profile: AmbientModelRuntimeProfile;
  probePlan: ModelProviderCapabilityProbePlan;
  probeReport: ModelProviderCapabilityProbeReport;
  eligibility: ModelProviderCapabilityEligibility;
}

export interface ModelRuntimeInstalledProviderFromEndpointProbeInput {
  result: ModelProviderEndpointProbeServiceResult;
  installedAt?: string;
  updatedAt?: string;
  enabled?: boolean;
  secretRef?: ModelRuntimeInstalledProviderSecretRef;
}

export async function runModelProviderEndpointProbeService(
  input: ModelProviderEndpointProbeServiceInput,
): Promise<ModelProviderEndpointProbeServiceResult> {
  const template = requiredEndpointTemplate(input.templateId);
  const providerId = trimmedOrDefault(input.providerId, template.providerId) as AmbientModelProviderId;
  const modelId = requiredTrimmed(input.modelId, "Model id is required before endpoint capability probing.");
  const baseUrl = requiredTrimmed(input.baseUrl, "Endpoint base URL is required before endpoint capability probing.");
  const ambientManagedSecret = requiredTrimmed(
    input.ambientManagedSecret,
    "Ambient-managed secret material is required before endpoint capability probing.",
  );
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const probePlan = buildModelProviderCapabilityProbePlan({
    template,
    providerId,
    modelId,
    generatedAt,
    extraProbeIds: input.extraProbeIds,
  });
  const probeReport = await runModelProviderCapabilityProbePlan({
    plan: probePlan,
    generatedAt,
    measuredAt: input.measuredAt,
    adapter: createModelProviderEndpointProbeAdapter({
      compatibility: template.compatibility,
      baseUrl,
      modelId,
      apiKey: ambientManagedSecret,
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs,
      anthropicVersion: input.anthropicVersion,
      reliabilitySampleCount: input.reliabilitySampleCount,
    }),
  });
  const provider = providerDescriptorFromInstallTemplate({
    template,
    providerId,
    label: optionalTrimmed(input.providerLabel),
    notes: ["Endpoint capability probe service created a candidate runtime profile before Settings install."],
  });
  const endpoint = endpointConfigFromProbeInput({
    template,
    baseUrl,
    anthropicVersion: input.anthropicVersion,
  });
  const candidateProfile = candidateRuntimeProfileFromEndpointProbe({
    template,
    providerId,
    modelId,
    modelLabel: input.modelLabel,
    probeReport,
  });
  const eligibility = probeModelProviderCapabilityEligibility({
    template,
    profile: candidateProfile,
    report: probeReport,
  });
  const profile = modelRuntimeProfileWithCapabilityProbeEligibility(candidateProfile, eligibility);

  return {
    schemaVersion: MODEL_PROVIDER_ENDPOINT_PROBE_SERVICE_SCHEMA_VERSION,
    templateId: template.id,
    provider,
    endpoint,
    candidateProfile,
    profile,
    probePlan,
    probeReport,
    eligibility,
  };
}

export function modelRuntimeInstalledProviderFromEndpointProbeResult(
  input: ModelRuntimeInstalledProviderFromEndpointProbeInput,
): ModelRuntimeInstalledProvider {
  const installedAt = input.installedAt ?? input.result.probeReport.generatedAt;
  return {
    schemaVersion: "ambient-model-runtime-installed-provider-v1",
    source: "settings-provider-onboarding",
    templateId: input.result.templateId,
    enabled: input.enabled ?? true,
    installedAt,
    updatedAt: input.updatedAt ?? installedAt,
    provider: input.result.provider,
    profile: input.result.profile,
    endpoint: input.result.endpoint,
    ...(input.secretRef ? { secretRef: input.secretRef } : {}),
    probeReport: input.result.probeReport,
    eligibility: input.result.eligibility,
  };
}

function requiredEndpointTemplate(templateId: string): ModelProviderInstallTemplate & { compatibility: EndpointProbeCompatibility } {
  const template = modelProviderInstallTemplateById(templateId);
  if (!template) throw new Error(`Unknown model provider install template: ${templateId}.`);
  if (template.compatibility === "local-text") {
    throw new Error("Endpoint probe service cannot run local-text runtime templates; use local runtime probes instead.");
  }
  return template as ModelProviderInstallTemplate & { compatibility: EndpointProbeCompatibility };
}

function endpointConfigFromProbeInput(input: {
  template: ModelProviderInstallTemplate & { compatibility: EndpointProbeCompatibility };
  baseUrl: string;
  anthropicVersion?: string;
}): ModelRuntimeInstalledProviderEndpointConfig {
  return {
    schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1",
    compatibility: input.template.compatibility,
    baseUrl: normalizedEndpointBaseUrl(input.baseUrl),
    ...(input.template.compatibility === "anthropic-compatible"
      ? { anthropicVersion: optionalTrimmed(input.anthropicVersion) ?? "2023-06-01" }
      : {}),
  };
}

function candidateRuntimeProfileFromEndpointProbe(input: {
  template: ModelProviderInstallTemplate;
  providerId: AmbientModelProviderId;
  modelId: string;
  modelLabel?: string;
  probeReport: ModelProviderCapabilityProbeReport;
}): AmbientModelRuntimeProfile {
  const supportsStreaming = probePassed(input.probeReport, "streaming");
  const toolUse = toolUseFromReport(input.probeReport);
  const structuredOutput = structuredOutputFromReport(input.probeReport);
  const supportsVision = probePassed(input.probeReport, "image_input");
  return {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: `${input.providerId}:${input.modelId}`,
    providerId: input.providerId,
    modelId: input.modelId,
    label: optionalTrimmed(input.modelLabel) ?? input.modelId,
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    contextWindowTokens: contextWindowTokensFromReport(input.probeReport),
    supportsStreaming,
    toolUse,
    structuredOutput,
    supportsVision,
    supportsAudio: false,
    locality: input.template.locality,
    costClass: costClassForTemplate(input.template),
    trustClass: trustClassForTemplate(input.template),
    privacyLabel: privacyLabelForTemplate(input.template),
    memoryClass: input.template.locality === "cloud" ? "remote" : undefined,
    providerQuirks: [
      `Configured through Settings provider onboarding using ${input.template.label}.`,
      "Exact provider and model ids were preserved before capability eligibility narrowing.",
      `Probe status summary: ${probeStatusSummary(input.probeReport)}.`,
    ],
  };
}

function toolUseFromReport(report: ModelProviderCapabilityProbeReport): AmbientModelToolUseSupport {
  return probePassed(report, "tool_use") ? "ambient-tools" : "none";
}

function structuredOutputFromReport(report: ModelProviderCapabilityProbeReport): AmbientModelStructuredOutputSupport {
  if (probePassed(report, "schema_output")) return "schema";
  if (probePassed(report, "structured_json")) return "json-mode";
  return "none";
}

function contextWindowTokensFromReport(report: ModelProviderCapabilityProbeReport): number | undefined {
  const value = probeObservation(report, "context_window")?.value;
  if (!isRecord(value)) return undefined;
  const contextWindowTokens = value.contextWindowTokens;
  return typeof contextWindowTokens === "number" && Number.isFinite(contextWindowTokens) && contextWindowTokens > 0
    ? Math.floor(contextWindowTokens)
    : undefined;
}

function probePassed(report: ModelProviderCapabilityProbeReport, probeId: ModelProviderCapabilityProbeId): boolean {
  return probeObservation(report, probeId)?.status === "passed";
}

function probeObservation(
  report: ModelProviderCapabilityProbeReport,
  probeId: ModelProviderCapabilityProbeId,
): ModelProviderCapabilityProbeObservation | undefined {
  return report.observations.find((observation) => observation.probeId === probeId);
}

function costClassForTemplate(template: ModelProviderInstallTemplate): AmbientModelCostClass {
  if (template.locality === "local") return "local";
  return template.secretFlow === "ambient-managed" ? "included" : "metered";
}

function trustClassForTemplate(template: ModelProviderInstallTemplate): AmbientModelTrustClass {
  if (template.locality === "local") return "local-user-managed";
  return template.secretFlow === "ambient-managed" ? "ambient-managed" : "user-configured";
}

function privacyLabelForTemplate(template: ModelProviderInstallTemplate): string {
  if (template.locality === "local") return "Local user-managed runtime";
  return template.secretFlow === "ambient-managed" ? "Ambient managed cloud model" : "User configured cloud provider";
}

function probeStatusSummary(report: ModelProviderCapabilityProbeReport): string {
  return report.observations
    .map((observation) => `${observation.probeId}:${observation.status}`)
    .join(", ");
}

function requiredTrimmed(value: string | undefined, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimmedOrDefault(value: string | undefined, fallback: string): string {
  return optionalTrimmed(value) ?? fallback;
}

function normalizedEndpointBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
