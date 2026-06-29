import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AmbientApiKeyTestResult,
  ProviderStatus,
} from "../../shared/desktopTypes";
import type {
  BrokerNamedSecretUseInput,
  BrokerNamedSecretUseResult,
  DeleteNamedSecretInput,
  NamedSecretMetadataExport,
  NamedSecretSummary,
  SaveNamedSecretInput,
  UpdateNamedSecretInput,
} from "../../shared/namedSecretTypes";
import type { SecureStorageRepairGuidance, SecureStorageStatus } from "../../shared/secureStorageTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const ambientOpenKeysIpcChannels = ["ambient:open-keys"] as const;
export const ambientApiKeyIpcChannels = [
  "ambient:save-api-key",
  "ambient:clear-api-key",
  "ambient:test-api-key",
] as const;
export const ambientSecureStorageIpcChannels = [
  "secure-storage:refresh",
  "named-secrets:save",
  "named-secrets:update",
  "named-secrets:delete",
  "named-secrets:broker-local-fixture",
  "named-secrets:export-metadata",
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
  refreshAmbientModelDiscovery?(): MaybePromise<void>;
}

export interface RegisterAmbientSecureStorageIpcDependencies {
  handleIpc: HandleIpc;
  refreshSecureStorageStatus(): { status: SecureStorageStatus; guidance: SecureStorageRepairGuidance };
  saveNamedSecret(input: SaveNamedSecretInput): MaybePromise<NamedSecretSummary[]>;
  updateNamedSecret(input: UpdateNamedSecretInput): MaybePromise<NamedSecretSummary[]>;
  deleteNamedSecret(input: DeleteNamedSecretInput): MaybePromise<NamedSecretSummary[]>;
  brokerNamedSecretToLocalFixture(input: BrokerNamedSecretUseInput): MaybePromise<BrokerNamedSecretUseResult>;
  exportNamedSecretMetadata(): MaybePromise<NamedSecretMetadataExport>;
}

const namedSecretKindSchema = z.enum(["generic", "api-key", "token", "password", "login", "ssh-password"]);
const namedSecretScopeSchema = z.enum(["workspace", "global"]);
const saveNamedSecretSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  kind: namedSecretKindSchema.optional(),
  scope: namedSecretScopeSchema.optional(),
  notes: z.string().optional(),
}) satisfies z.ZodType<SaveNamedSecretInput>;
const updateNamedSecretSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
  kind: namedSecretKindSchema.optional(),
  scope: namedSecretScopeSchema.optional(),
  notes: z.string().optional(),
}) satisfies z.ZodType<UpdateNamedSecretInput>;
const deleteNamedSecretSchema = z.object({
  id: z.string().min(1),
}) satisfies z.ZodType<DeleteNamedSecretInput>;
const brokerNamedSecretUseSchema = z.object({
  id: z.string().min(1),
  purpose: z.string().min(1),
  target: z.literal("local-fixture"),
}) satisfies z.ZodType<BrokerNamedSecretUseInput>;

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
  refreshAmbientModelDiscovery,
}: RegisterAmbientApiKeyIpcDependencies): void {
  const refreshProvider = () => {
    resetRuntimeAndPluginServers();
    const provider = getAmbientProviderStatus(readCurrentSettingsModel());
    emitProviderUpdated(provider);
    return provider;
  };
  const refreshModels = () => {
    void Promise.resolve(refreshAmbientModelDiscovery?.()).catch(() => undefined);
  };

  handleIpc("ambient:save-api-key", (_event, apiKey: string) => {
    saveAmbientApiKey(z.string().parse(apiKey));
    const provider = refreshProvider();
    refreshModels();
    return provider;
  });

  handleIpc("ambient:clear-api-key", () => {
    clearSavedAmbientApiKey();
    const provider = refreshProvider();
    refreshModels();
    return provider;
  });

  handleIpc("ambient:test-api-key", (_event, apiKey?: string) => testAmbientApiKey(apiKey));
}

export function registerAmbientSecureStorageIpc({
  handleIpc,
  refreshSecureStorageStatus,
  saveNamedSecret,
  updateNamedSecret,
  deleteNamedSecret,
  brokerNamedSecretToLocalFixture,
  exportNamedSecretMetadata,
}: RegisterAmbientSecureStorageIpcDependencies): void {
  handleIpc("secure-storage:refresh", () => refreshSecureStorageStatus());
  handleIpc("named-secrets:save", (_event, raw: unknown) => saveNamedSecret(saveNamedSecretSchema.parse(raw)));
  handleIpc("named-secrets:update", (_event, raw: unknown) => updateNamedSecret(updateNamedSecretSchema.parse(raw)));
  handleIpc("named-secrets:delete", (_event, raw: unknown) => deleteNamedSecret(deleteNamedSecretSchema.parse(raw)));
  handleIpc("named-secrets:broker-local-fixture", (_event, raw: unknown) => brokerNamedSecretToLocalFixture(brokerNamedSecretUseSchema.parse(raw)));
  handleIpc("named-secrets:export-metadata", () => exportNamedSecretMetadata());
}
