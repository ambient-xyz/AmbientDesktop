import type { ModelRuntimeSettings } from "../../shared/threadTypes";
import type { ModelRuntimeInstalledProviderSecretRef } from "../../shared/threadTypes";
import type { ModelProviderCapabilityProbeId } from "../../shared/modelProviderInstallTemplates";
import { modelProviderInstallTemplateById } from "../../shared/modelProviderInstallTemplates";
import {
  modelRuntimeSettingsWithInstalledProvider,
} from "../../shared/modelRuntimeSettings";
import {
  modelRuntimeInstalledProviderFromEndpointProbeResult,
  runModelProviderEndpointProbeService,
  type ModelProviderEndpointProbeServiceResult,
} from "./modelProviderEndpointProbeService";

export const MODEL_PROVIDER_SETTINGS_INSTALL_SCHEMA_VERSION = "ambient-model-provider-settings-install-v1" as const;

export interface ModelProviderSettingsInstallRequest {
  templateId: string;
  providerId?: string;
  providerLabel?: string;
  modelId: string;
  modelLabel?: string;
  baseUrl: string;
  generatedAt?: string;
  measuredAt?: string;
  timeoutMs?: number;
  anthropicVersion?: string;
  reliabilitySampleCount?: number;
  extraProbeIds?: readonly ModelProviderCapabilityProbeId[];
  enabled?: boolean;
  credentialRef?: {
    flow: "ambient_cli_secret_request" | "ambient_cli_env_bind";
    managedSecretRef: string;
    label?: string;
  };
}

export interface ModelProviderSettingsSecretRequest {
  templateId: string;
  providerId?: string;
  modelId: string;
  baseUrl: string;
  credentialRef?: {
    flow: "ambient_cli_secret_request" | "ambient_cli_env_bind";
    managedSecretRef: string;
    label?: string;
  };
}

export interface ModelProviderSettingsSecretResolution {
  ambientManagedSecret: string;
  secretRef: ModelRuntimeInstalledProviderSecretRef;
}

export interface ModelProviderSettingsInstallStore {
  getModelRuntimeSettings(): ModelRuntimeSettings;
  setModelRuntimeSettings(input: Partial<ModelRuntimeSettings>): ModelRuntimeSettings;
}

export interface InstallModelProviderEndpointForSettingsInput {
  request: ModelProviderSettingsInstallRequest;
  store: ModelProviderSettingsInstallStore;
  resolveSecret(input: ModelProviderSettingsSecretRequest): Promise<ModelProviderSettingsSecretResolution> | ModelProviderSettingsSecretResolution;
  fetchImpl?: typeof fetch;
}

export interface ModelProviderSettingsInstallResult {
  schemaVersion: typeof MODEL_PROVIDER_SETTINGS_INSTALL_SCHEMA_VERSION;
  installedProviderKey: string;
  settings: ModelRuntimeSettings;
  probeResult: ModelProviderEndpointProbeServiceResult;
}

export async function installModelProviderEndpointForSettings(
  input: InstallModelProviderEndpointForSettingsInput,
): Promise<ModelProviderSettingsInstallResult> {
  assertEndpointInstallTemplate(input.request.templateId);
  const secret = await input.resolveSecret({
    templateId: input.request.templateId,
    providerId: input.request.providerId,
    modelId: input.request.modelId,
    baseUrl: input.request.baseUrl,
    credentialRef: input.request.credentialRef,
  });
  const probeResult = await runModelProviderEndpointProbeService({
    ...input.request,
    ambientManagedSecret: secret.ambientManagedSecret,
    fetchImpl: input.fetchImpl,
  });
  const installedProvider = modelRuntimeInstalledProviderFromEndpointProbeResult({
    result: probeResult,
    enabled: input.request.enabled,
    secretRef: secret.secretRef,
    installedAt: input.request.generatedAt,
    updatedAt: input.request.generatedAt,
  });
  const settings = input.store.setModelRuntimeSettings(modelRuntimeSettingsWithInstalledProvider(
    input.store.getModelRuntimeSettings(),
    installedProvider,
  ));

  return {
    schemaVersion: MODEL_PROVIDER_SETTINGS_INSTALL_SCHEMA_VERSION,
    installedProviderKey: `${installedProvider.templateId}:${installedProvider.provider.id}:${installedProvider.profile.modelId}`,
    settings,
    probeResult,
  };
}

function assertEndpointInstallTemplate(templateId: string): void {
  const template = modelProviderInstallTemplateById(templateId);
  if (!template) throw new Error(`Unknown model provider install template: ${templateId}.`);
  if (template.compatibility === "local-text") {
    throw new Error("Settings endpoint provider install cannot run local-text runtime templates; use local runtime onboarding instead.");
  }
}
