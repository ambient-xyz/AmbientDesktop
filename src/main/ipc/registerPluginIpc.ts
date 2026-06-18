import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AddCodexMarketplaceInput,
  AmbientPluginAuthAccountSummary,
  AmbientPluginAuthStartResult,
  AmbientPluginCapabilityDiagnostics,
  AmbientPluginCapabilitySummary,
  AmbientPluginRegistry,
  CodexHostedMarketplaceReport,
  CodexPluginCatalog,
  CodexPluginDependencyInstallResult,
  CodexPluginMcpInspectionCatalog,
  CodexPluginSummary,
  CompletePluginAppAuthInput,
  GetAmbientPluginCapabilityDiagnosticsInput,
  ImportCodexPluginInput,
  InstallCodexPluginDependenciesInput,
  ListAmbientPluginRuntimeCapabilitiesInput,
  PluginAuthAccountActionInput,
  PluginMcpRuntimeActionInput,
  PluginMcpRuntimeSnapshot,
  ReadCodexPluginInput,
  RemoveCodexMarketplaceInput,
  SetCodexPluginEnabledInput,
  SetCodexPluginTrustedInput,
  StartPluginAppAuthInput,
  UninstallCodexPluginInput,
} from "../../shared/pluginTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const pluginDiscoveryIpcChannels = ["plugins:discover"] as const;
export const pluginRegistryIpcChannels = ["plugins:registry"] as const;
export const pluginRuntimeCapabilitiesIpcChannels = ["plugins:runtime-capabilities"] as const;
export const pluginCapabilityDiagnosticsIpcChannels = ["plugins:capability-diagnostics"] as const;
export const pluginReadIpcChannels = ["plugins:read"] as const;
export const pluginHostedMarketplaceIpcChannels = ["plugins:hosted-marketplace"] as const;
export const pluginMcpInspectionIpcChannels = ["plugins:inspect-mcp"] as const;
export const pluginMcpRuntimeListIpcChannels = ["plugins:mcp-runtimes"] as const;
export const pluginMcpRuntimeActionIpcChannels = [
  "plugins:mcp-runtime-restart",
  "plugins:mcp-runtime-stop",
] as const;
export const pluginAuthIpcChannels = [
  "plugins:auth-start",
  "plugins:auth-complete",
  "plugins:auth-revoke",
  "plugins:auth-disconnect",
  "plugins:auth-test",
] as const;
export const pluginSetEnabledIpcChannels = ["plugins:set-enabled"] as const;
export const pluginSetTrustedIpcChannels = ["plugins:set-trusted"] as const;
export const pluginImportCodexCacheIpcChannels = ["plugins:import-codex-cache"] as const;
export const pluginAddCodexMarketplaceIpcChannels = ["plugins:add-codex-marketplace"] as const;
export const pluginRemoveCodexMarketplaceIpcChannels = ["plugins:remove-codex-marketplace"] as const;
export const pluginUninstallCodexIpcChannels = ["plugins:uninstall-codex"] as const;
export const pluginInstallDependenciesIpcChannels = ["plugins:install-dependencies"] as const;

export interface RegisterPluginDiscoveryIpcDependencies {
  handleIpc: HandleIpc;
  readCodexPluginCatalog(): MaybePromise<CodexPluginCatalog>;
}

export interface RegisterPluginRegistryIpcDependencies {
  handleIpc: HandleIpc;
  readAmbientPluginRegistry(): MaybePromise<AmbientPluginRegistry>;
}

export interface RegisterPluginRuntimeCapabilitiesIpcDependencies {
  handleIpc: HandleIpc;
  listRuntimeCapabilities(input: ListAmbientPluginRuntimeCapabilitiesInput): MaybePromise<AmbientPluginCapabilitySummary[]>;
}

export interface RegisterPluginCapabilityDiagnosticsIpcDependencies {
  handleIpc: HandleIpc;
  getCapabilityDiagnostics(input: GetAmbientPluginCapabilityDiagnosticsInput): MaybePromise<AmbientPluginCapabilityDiagnostics>;
}

export interface RegisterPluginReadIpcDependencies {
  handleIpc: HandleIpc;
  readCodexPlugin(input: ReadCodexPluginInput): MaybePromise<CodexPluginSummary>;
}

export interface RegisterPluginHostedMarketplaceIpcDependencies {
  handleIpc: HandleIpc;
  readCodexHostedMarketplaceReport(): MaybePromise<CodexHostedMarketplaceReport>;
}

export interface RegisterPluginMcpInspectionIpcDependencies {
  handleIpc: HandleIpc;
  inspectCodexPluginMcp(): MaybePromise<CodexPluginMcpInspectionCatalog>;
}

export interface RegisterPluginMcpRuntimeListIpcDependencies {
  handleIpc: HandleIpc;
  listPluginMcpRuntimeSnapshots(): MaybePromise<PluginMcpRuntimeSnapshot[]>;
}

export interface RegisterPluginMcpRuntimeActionIpcDependencies {
  handleIpc: HandleIpc;
  restartPluginMcpRuntime(key: string): MaybePromise<PluginMcpRuntimeSnapshot[] | undefined>;
  stopPluginMcpRuntime(key: string): MaybePromise<PluginMcpRuntimeSnapshot[] | undefined>;
}

export interface RegisterPluginAuthIpcDependencies {
  handleIpc: HandleIpc;
  startPluginAppAuth(input: StartPluginAppAuthInput): AmbientPluginAuthStartResult;
  completePluginAppAuth(input: CompletePluginAppAuthInput): MaybePromise<AmbientPluginAuthAccountSummary>;
  revokePluginAuthAccount(input: PluginAuthAccountActionInput): MaybePromise<AmbientPluginAuthAccountSummary>;
  disconnectPluginAuthAccount(input: PluginAuthAccountActionInput): MaybePromise<AmbientPluginAuthAccountSummary>;
  testPluginAuthAccount(input: PluginAuthAccountActionInput): MaybePromise<AmbientPluginAuthAccountSummary>;
  openPluginAuthUrl(url: string): MaybePromise<void>;
  reportPluginAuthOpenUrlError(error: unknown): void;
}

export interface RegisterPluginSetEnabledIpcDependencies {
  handleIpc: HandleIpc;
  setCodexPluginEnabled(input: SetCodexPluginEnabledInput): MaybePromise<CodexPluginCatalog>;
}

export interface RegisterPluginSetTrustedIpcDependencies {
  handleIpc: HandleIpc;
  setCodexPluginTrusted(input: SetCodexPluginTrustedInput): MaybePromise<CodexPluginCatalog>;
}

export interface RegisterPluginImportCodexCacheIpcDependencies {
  handleIpc: HandleIpc;
  importCodexPlugin(input: ImportCodexPluginInput): MaybePromise<CodexPluginCatalog>;
}

export interface RegisterPluginAddCodexMarketplaceIpcDependencies {
  handleIpc: HandleIpc;
  addCodexMarketplace(input: AddCodexMarketplaceInput): MaybePromise<CodexPluginCatalog>;
}

export interface RegisterPluginRemoveCodexMarketplaceIpcDependencies {
  handleIpc: HandleIpc;
  removeCodexMarketplace(input: RemoveCodexMarketplaceInput): MaybePromise<CodexPluginCatalog>;
}

export interface RegisterPluginUninstallCodexIpcDependencies {
  handleIpc: HandleIpc;
  uninstallCodexPlugin(input: UninstallCodexPluginInput): MaybePromise<CodexPluginCatalog>;
}

export interface RegisterPluginInstallDependenciesIpcDependencies {
  handleIpc: HandleIpc;
  installCodexPluginDependencies(
    input: InstallCodexPluginDependenciesInput,
  ): MaybePromise<CodexPluginDependencyInstallResult>;
}

const pluginReadSchema = z.object({
  pluginId: z.string().min(1).max(1024),
}) satisfies z.ZodType<ReadCodexPluginInput>;
const pluginRuntimeCapabilitiesSchema = z.object({
  runtime: z.enum(["chat", "workflow", "automation", "ui"]),
}) satisfies z.ZodType<ListAmbientPluginRuntimeCapabilitiesInput>;
const pluginCapabilityDiagnosticsSchema = z.object({
  capabilityId: z.string().min(1).max(2048),
}) satisfies z.ZodType<GetAmbientPluginCapabilityDiagnosticsInput>;
const pluginMcpRuntimeActionSchema = z.object({
  key: z.string().min(1).max(8192),
}) satisfies z.ZodType<PluginMcpRuntimeActionInput>;
const pluginAppAuthStartSchema = z.object({
  connectorId: z.string().min(1).max(512),
  scopes: z.array(z.string().min(1).max(256)).max(100).optional(),
}) satisfies z.ZodType<StartPluginAppAuthInput>;
const pluginAppAuthCompleteSchema = z.object({
  state: z.string().min(1).max(512),
  code: z.string().min(1).max(4096),
}) satisfies z.ZodType<CompletePluginAppAuthInput>;
const pluginAuthAccountActionSchema = z.object({
  accountId: z.string().min(1).max(512),
}) satisfies z.ZodType<PluginAuthAccountActionInput>;
const pluginEnabledSchema = z.object({
  pluginId: z.string().min(1).max(512),
  enabled: z.boolean(),
}) satisfies z.ZodType<SetCodexPluginEnabledInput>;
const pluginTrustedSchema = z.object({
  pluginId: z.string().min(1).max(512),
  trusted: z.boolean(),
}) satisfies z.ZodType<SetCodexPluginTrustedInput>;
const pluginImportCodexCacheSchema = z.object({
  pluginId: z.string().min(1).max(1024),
}) satisfies z.ZodType<ImportCodexPluginInput>;
const pluginMarketplaceAddSchema = z.object({
  source: z.string().min(1).max(4096),
  name: z.string().min(1).max(256).optional(),
  allowExperimental: z.boolean().optional(),
}) satisfies z.ZodType<AddCodexMarketplaceInput>;
const pluginMarketplaceRemoveSchema = z.object({
  source: z.string().min(1).max(4096),
}) satisfies z.ZodType<RemoveCodexMarketplaceInput>;
const pluginUninstallCodexSchema = z.object({
  pluginId: z.string().min(1).max(1024),
}) satisfies z.ZodType<UninstallCodexPluginInput>;
const pluginDependencyInstallSchema = z.object({
  pluginId: z.string().min(1).max(1024),
}) satisfies z.ZodType<InstallCodexPluginDependenciesInput>;

async function resolvePluginMcpRuntimeAction(
  raw: unknown,
  action: (key: string) => MaybePromise<PluginMcpRuntimeSnapshot[] | undefined>,
): Promise<PluginMcpRuntimeSnapshot[]> {
  const input = pluginMcpRuntimeActionSchema.parse(raw);
  const snapshots = await action(input.key);
  if (snapshots) return snapshots;
  throw new Error("Plugin MCP runtime was not found.");
}

export function registerPluginDiscoveryIpc({
  handleIpc,
  readCodexPluginCatalog,
}: RegisterPluginDiscoveryIpcDependencies): void {
  handleIpc("plugins:discover", () => readCodexPluginCatalog());
}

export function registerPluginRegistryIpc({
  handleIpc,
  readAmbientPluginRegistry,
}: RegisterPluginRegistryIpcDependencies): void {
  handleIpc("plugins:registry", () => readAmbientPluginRegistry());
}

export function registerPluginRuntimeCapabilitiesIpc({
  handleIpc,
  listRuntimeCapabilities,
}: RegisterPluginRuntimeCapabilitiesIpcDependencies): void {
  handleIpc("plugins:runtime-capabilities", (_event, raw: unknown) => {
    const input = pluginRuntimeCapabilitiesSchema.parse(raw);
    return listRuntimeCapabilities(input);
  });
}

export function registerPluginCapabilityDiagnosticsIpc({
  handleIpc,
  getCapabilityDiagnostics,
}: RegisterPluginCapabilityDiagnosticsIpcDependencies): void {
  handleIpc("plugins:capability-diagnostics", (_event, raw: unknown) => {
    const input = pluginCapabilityDiagnosticsSchema.parse(raw);
    return getCapabilityDiagnostics(input);
  });
}

export function registerPluginReadIpc({ handleIpc, readCodexPlugin }: RegisterPluginReadIpcDependencies): void {
  handleIpc("plugins:read", (_event, raw: ReadCodexPluginInput) => readCodexPlugin(pluginReadSchema.parse(raw)));
}

export function registerPluginHostedMarketplaceIpc({
  handleIpc,
  readCodexHostedMarketplaceReport,
}: RegisterPluginHostedMarketplaceIpcDependencies): void {
  handleIpc("plugins:hosted-marketplace", () => readCodexHostedMarketplaceReport());
}

export function registerPluginMcpInspectionIpc({
  handleIpc,
  inspectCodexPluginMcp,
}: RegisterPluginMcpInspectionIpcDependencies): void {
  handleIpc("plugins:inspect-mcp", () => inspectCodexPluginMcp());
}

export function registerPluginMcpRuntimeListIpc({
  handleIpc,
  listPluginMcpRuntimeSnapshots,
}: RegisterPluginMcpRuntimeListIpcDependencies): void {
  handleIpc("plugins:mcp-runtimes", () => listPluginMcpRuntimeSnapshots());
}

export function registerPluginMcpRuntimeActionIpc({
  handleIpc,
  restartPluginMcpRuntime,
  stopPluginMcpRuntime,
}: RegisterPluginMcpRuntimeActionIpcDependencies): void {
  handleIpc("plugins:mcp-runtime-restart", (_event, raw: unknown) => resolvePluginMcpRuntimeAction(raw, restartPluginMcpRuntime));
  handleIpc("plugins:mcp-runtime-stop", (_event, raw: unknown) => resolvePluginMcpRuntimeAction(raw, stopPluginMcpRuntime));
}

export function registerPluginAuthIpc({
  handleIpc,
  startPluginAppAuth,
  completePluginAppAuth,
  revokePluginAuthAccount,
  disconnectPluginAuthAccount,
  testPluginAuthAccount,
  openPluginAuthUrl,
  reportPluginAuthOpenUrlError,
}: RegisterPluginAuthIpcDependencies): void {
  handleIpc("plugins:auth-start", async (_event, raw: unknown) => {
    const pending = startPluginAppAuth(pluginAppAuthStartSchema.parse(raw));
    void Promise.resolve(openPluginAuthUrl(pending.authorizationUrl)).catch(reportPluginAuthOpenUrlError);
    return pending;
  });

  handleIpc("plugins:auth-complete", async (_event, raw: unknown) =>
    completePluginAppAuth(pluginAppAuthCompleteSchema.parse(raw)),
  );

  handleIpc("plugins:auth-revoke", async (_event, raw: unknown) =>
    revokePluginAuthAccount(pluginAuthAccountActionSchema.parse(raw)),
  );

  handleIpc("plugins:auth-disconnect", async (_event, raw: unknown) =>
    disconnectPluginAuthAccount(pluginAuthAccountActionSchema.parse(raw)),
  );

  handleIpc("plugins:auth-test", async (_event, raw: unknown) =>
    testPluginAuthAccount(pluginAuthAccountActionSchema.parse(raw)),
  );
}

export function registerPluginSetEnabledIpc({
  handleIpc,
  setCodexPluginEnabled,
}: RegisterPluginSetEnabledIpcDependencies): void {
  handleIpc("plugins:set-enabled", async (_event, raw: unknown) =>
    setCodexPluginEnabled(pluginEnabledSchema.parse(raw)),
  );
}

export function registerPluginSetTrustedIpc({
  handleIpc,
  setCodexPluginTrusted,
}: RegisterPluginSetTrustedIpcDependencies): void {
  handleIpc("plugins:set-trusted", async (_event, raw: unknown) =>
    setCodexPluginTrusted(pluginTrustedSchema.parse(raw)),
  );
}

export function registerPluginImportCodexCacheIpc({
  handleIpc,
  importCodexPlugin,
}: RegisterPluginImportCodexCacheIpcDependencies): void {
  handleIpc("plugins:import-codex-cache", async (_event, raw: unknown) =>
    importCodexPlugin(pluginImportCodexCacheSchema.parse(raw)),
  );
}

export function registerPluginAddCodexMarketplaceIpc({
  handleIpc,
  addCodexMarketplace,
}: RegisterPluginAddCodexMarketplaceIpcDependencies): void {
  handleIpc("plugins:add-codex-marketplace", async (_event, raw: unknown) =>
    addCodexMarketplace(pluginMarketplaceAddSchema.parse(raw)),
  );
}

export function registerPluginRemoveCodexMarketplaceIpc({
  handleIpc,
  removeCodexMarketplace,
}: RegisterPluginRemoveCodexMarketplaceIpcDependencies): void {
  handleIpc("plugins:remove-codex-marketplace", async (_event, raw: unknown) =>
    removeCodexMarketplace(pluginMarketplaceRemoveSchema.parse(raw)),
  );
}

export function registerPluginUninstallCodexIpc({
  handleIpc,
  uninstallCodexPlugin,
}: RegisterPluginUninstallCodexIpcDependencies): void {
  handleIpc("plugins:uninstall-codex", async (_event, raw: unknown) =>
    uninstallCodexPlugin(pluginUninstallCodexSchema.parse(raw)),
  );
}

export function registerPluginInstallDependenciesIpc({
  handleIpc,
  installCodexPluginDependencies,
}: RegisterPluginInstallDependenciesIpcDependencies): void {
  handleIpc("plugins:install-dependencies", async (_event, raw: unknown) =>
    installCodexPluginDependencies(pluginDependencyInstallSchema.parse(raw)),
  );
}
