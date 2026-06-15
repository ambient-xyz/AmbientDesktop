import type { ProviderStatus } from "../shared/types";
import { AMBIENT_DEFAULT_MODEL, normalizeAmbientModelId } from "../shared/ambientModels";
import {
  getActiveAmbientProviderBaseUrl,
  getActiveAmbientProviderId,
  getActiveAmbientProviderLabel,
  getActiveAmbientProviderModelOverride,
  getAmbientApiKeySource,
  readAmbientApiKey,
} from "./credentialStore";

export function getAmbientProviderStatus(model = AMBIENT_DEFAULT_MODEL): ProviderStatus {
  const providerId = getActiveAmbientProviderId();
  const source = getAmbientApiKeySource();
  const providerModel = getActiveAmbientProviderModelOverride(providerId) || model;
  return {
    providerId,
    providerLabel: getActiveAmbientProviderLabel(providerId),
    debugOverride: providerId !== "ambient",
    baseUrl: normalizeAmbientBaseUrl(getActiveAmbientProviderBaseUrl(providerId)),
    model: normalizeAmbientModelId(providerModel),
    hasApiKey: Boolean(readAmbientApiKey()),
    source,
    storage: source === "saved" ? "os-encrypted" : source === "env" ? "environment" : "none",
  };
}

export function normalizeAmbientBaseUrl(baseUrl?: string): string {
  const root = (baseUrl || getActiveAmbientProviderBaseUrl() || "https://api.ambient.xyz").replace(/\/+$/, "");
  return root.endsWith("/v1") ? root : `${root}/v1`;
}
