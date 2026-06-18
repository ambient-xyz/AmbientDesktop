import type { ProviderStatus } from "../../shared/desktopTypes";
import type { ApiKeyStatus } from "./RightPanel";

export function getInitialApiKeyStatus(provider?: ProviderStatus): ApiKeyStatus | undefined {
  const providerLabel = provider?.providerLabel ?? "Ambient";
  if (provider?.source === "saved") {
    return { kind: "success", message: `A saved ${providerLabel} API key is active.` };
  }
  if (provider?.source === "env") {
    return { kind: "info", message: `Using a ${providerLabel} API key from the environment or startup file. Saving a key here will replace it for this app.` };
  }
  return undefined;
}

export function looksLikeApiKey(value: string): boolean {
  return value.length >= 20 && !/\s/.test(value);
}
