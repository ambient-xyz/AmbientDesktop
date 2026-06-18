import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AmbientApiKeyTestResult,
  ProviderStatus,
} from "../../shared/desktopTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const ambientOpenKeysIpcChannels = ["ambient:open-keys"] as const;
export const ambientApiKeyIpcChannels = [
  "ambient:save-api-key",
  "ambient:clear-api-key",
  "ambient:test-api-key",
] as const;

export interface RegisterAmbientOpenKeysIpcDependencies {
  handleIpc: HandleIpc;
  ambientKeysUrl: string;
  openAllowedExternalUrl(raw: string, source: string): MaybePromise<void>;
}

export interface RegisterAmbientApiKeyIpcDependencies {
  handleIpc: HandleIpc;
  saveAmbientApiKey(apiKey: string): void;
  clearSavedAmbientApiKey(): void;
  testAmbientApiKey(apiKey?: string): Promise<AmbientApiKeyTestResult>;
  resetRuntimeAndPluginServers(): void;
  readCurrentSettingsModel(): string;
  getAmbientProviderStatus(model: string): ProviderStatus;
  emitProviderUpdated(provider: ProviderStatus): void;
}

export function registerAmbientOpenKeysIpc({
  handleIpc,
  ambientKeysUrl,
  openAllowedExternalUrl,
}: RegisterAmbientOpenKeysIpcDependencies): void {
  handleIpc("ambient:open-keys", async () => {
    await openAllowedExternalUrl(ambientKeysUrl, "ambient-keys");
  });
}

export function registerAmbientApiKeyIpc({
  handleIpc,
  saveAmbientApiKey,
  clearSavedAmbientApiKey,
  testAmbientApiKey,
  resetRuntimeAndPluginServers,
  readCurrentSettingsModel,
  getAmbientProviderStatus,
  emitProviderUpdated,
}: RegisterAmbientApiKeyIpcDependencies): void {
  const refreshProvider = () => {
    resetRuntimeAndPluginServers();
    const provider = getAmbientProviderStatus(readCurrentSettingsModel());
    emitProviderUpdated(provider);
    return provider;
  };

  handleIpc("ambient:save-api-key", (_event, apiKey: string) => {
    saveAmbientApiKey(z.string().parse(apiKey));
    return refreshProvider();
  });

  handleIpc("ambient:clear-api-key", () => {
    clearSavedAmbientApiKey();
    return refreshProvider();
  });

  handleIpc("ambient:test-api-key", (_event, apiKey?: string) => testAmbientApiKey(apiKey));
}
