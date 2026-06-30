import type { ModelProviderEndpointCompatibility, ModelProviderSecretFlow } from "./modelProviderInstallTemplates";

export interface ModelRuntimeInstalledProviderEndpointConfig {
  schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1";
  compatibility: Exclude<ModelProviderEndpointCompatibility, "local-text">;
  baseUrl: string;
  anthropicVersion?: string;
}

export interface InstallModelProviderEndpointCredentialRefInput {
  flow: Extract<ModelProviderSecretFlow, "ambient_cli_secret_request" | "ambient_cli_env_bind">;
  managedSecretRef: string;
  label?: string;
}
