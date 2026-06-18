import { modelProviderInstallTemplateById } from "../../shared/modelProviderInstallTemplates";
import type { ModelProviderCredentialSaveResult } from "../../shared/pluginTypes";
import type { SaveModelProviderCredentialInput } from "../../shared/threadTypes";
import { saveSecretReference, type SaveSecretReferenceInput } from "../security/secretReferenceStore";

export const MODEL_PROVIDER_CREDENTIAL_SAVE_SCHEMA_VERSION = "ambient-model-provider-credential-save-v1" as const;

export interface SaveModelProviderCredentialForSettingsInput {
  workspacePath: string;
  input: SaveModelProviderCredentialInput;
  saveSecretReferenceImpl?: (input: SaveSecretReferenceInput) => Promise<string> | string;
}

export async function saveModelProviderCredentialForSettings({
  workspacePath,
  input,
  saveSecretReferenceImpl = saveSecretReference,
}: SaveModelProviderCredentialForSettingsInput): Promise<ModelProviderCredentialSaveResult> {
  const template = modelProviderInstallTemplateById(input.templateId.trim());
  if (!template) throw new Error(`Unknown model provider install template: ${input.templateId}.`);
  if (template.compatibility === "local-text" || template.secretFlow === "none") {
    throw new Error("Local model provider templates do not use endpoint credentials.");
  }
  if (template.secretFlow === "ambient-managed") {
    throw new Error("Ambient-managed model provider templates do not accept user credentials.");
  }
  if (template.secretFlow !== "ambient_cli_secret_request" && template.secretFlow !== "ambient_cli_env_bind") {
    throw new Error("Model provider template does not use a supported Ambient-managed credential flow.");
  }

  const modelId = input.modelId.trim();
  const baseUrl = input.baseUrl.trim();
  const providerId = input.providerId?.trim() || template.providerId;
  const label = input.label?.trim() || credentialFlowLabel(template.secretFlow);
  const value = input.value.trim();
  if (!workspacePath.trim()) throw new Error("Workspace path is required for model provider credential storage.");
  if (!modelId) throw new Error("Model provider credential storage requires a model id.");
  if (!baseUrl) throw new Error("Model provider credential storage requires an endpoint base URL.");
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("Model provider endpoint base URL must start with http:// or https://.");
  if (!value) throw new Error("Model provider credential value is empty.");

  const managedSecretRef = await saveSecretReferenceImpl({
    scope: "model-provider",
    workspacePath,
    ownerId: modelProviderCredentialOwnerId({
      templateId: template.id,
      providerId,
      modelId,
      baseUrl,
    }),
    envName: modelProviderCredentialEnvName(template.id),
    value,
  });

  return {
    schemaVersion: MODEL_PROVIDER_CREDENTIAL_SAVE_SCHEMA_VERSION,
    templateId: template.id,
    providerId,
    modelId,
    baseUrl,
    configured: true,
    credentialRef: {
      flow: template.secretFlow,
      managedSecretRef,
      label,
    },
  };
}

function modelProviderCredentialOwnerId(input: {
  templateId: string;
  providerId: string;
  modelId: string;
  baseUrl: string;
}): string {
  return JSON.stringify({
    schemaVersion: "ambient-model-provider-credential-owner-v1",
    templateId: input.templateId,
    providerId: input.providerId,
    modelId: input.modelId,
    baseUrl: input.baseUrl,
  });
}

function modelProviderCredentialEnvName(templateId: string): string {
  if (templateId === "gmi-cloud") return "GMI_CLOUD_API_KEY";
  return "MODEL_PROVIDER_API_KEY";
}

function credentialFlowLabel(flow: "ambient_cli_secret_request" | "ambient_cli_env_bind"): string {
  return flow === "ambient_cli_env_bind" ? "Ignored env-bound secret file" : "Desktop secret request";
}
