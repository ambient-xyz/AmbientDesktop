import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  InstallPiExtensionSandboxPackageInput,
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PreviewPiExtensionSandboxPackageInput,
  UninstallPiExtensionSandboxPackageInput,
} from "../../shared/pluginTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const piExtensionSandboxInspectIpcChannels = ["pi-extension-sandbox:inspect"] as const;
export const piExtensionSandboxPreviewIpcChannels = ["pi-extension-sandbox:preview"] as const;
export const piExtensionSandboxInstallIpcChannels = ["pi-extension-sandbox:install"] as const;
export const piExtensionSandboxUninstallIpcChannels = ["pi-extension-sandbox:uninstall"] as const;
export const piExtensionSandboxClearHistoryIpcChannels = ["pi-extension-sandbox:clear-history"] as const;

export interface RegisterPiExtensionSandboxInspectIpcDependencies {
  handleIpc: HandleIpc;
  inspectPiExtensionSandboxPackages(): MaybePromise<PiExtensionSandboxCatalog>;
}

export interface RegisterPiExtensionSandboxPreviewIpcDependencies {
  handleIpc: HandleIpc;
  previewPiExtensionSandboxPackage(
    input: PreviewPiExtensionSandboxPackageInput,
  ): MaybePromise<PiExtensionSandboxInstallPreview>;
}

export interface RegisterPiExtensionSandboxInstallIpcDependencies {
  handleIpc: HandleIpc;
  installPiExtensionSandboxPackage(
    input: InstallPiExtensionSandboxPackageInput,
  ): MaybePromise<PiExtensionSandboxCatalog>;
}

export interface RegisterPiExtensionSandboxUninstallIpcDependencies {
  handleIpc: HandleIpc;
  uninstallPiExtensionSandboxPackage(
    input: UninstallPiExtensionSandboxPackageInput,
  ): MaybePromise<PiExtensionSandboxCatalog>;
}

export interface RegisterPiExtensionSandboxClearHistoryIpcDependencies {
  handleIpc: HandleIpc;
  clearPiExtensionSandboxHistory(): MaybePromise<PiExtensionSandboxCatalog>;
}

export const piExtensionSandboxInstallSchema = z.object({
  source: z.string().min(1).max(2048),
  allowedNetworkHosts: z.array(z.string().min(1).max(253)).max(50).optional(),
}) satisfies z.ZodType<InstallPiExtensionSandboxPackageInput>;
const piExtensionSandboxUninstallSchema = z
  .object({
    packageId: z.string().min(1).max(1024).optional(),
    packageName: z.string().min(1).max(512).optional(),
  })
  .refine(
    (input) => Boolean(input.packageId || input.packageName),
    "packageId or packageName is required.",
  ) satisfies z.ZodType<UninstallPiExtensionSandboxPackageInput>;

export function registerPiExtensionSandboxInspectIpc({
  handleIpc,
  inspectPiExtensionSandboxPackages,
}: RegisterPiExtensionSandboxInspectIpcDependencies): void {
  handleIpc("pi-extension-sandbox:inspect", () => inspectPiExtensionSandboxPackages());
}

export function registerPiExtensionSandboxPreviewIpc({
  handleIpc,
  previewPiExtensionSandboxPackage,
}: RegisterPiExtensionSandboxPreviewIpcDependencies): void {
  handleIpc("pi-extension-sandbox:preview", (_event, raw: unknown) =>
    previewPiExtensionSandboxPackage(piExtensionSandboxInstallSchema.parse(raw)),
  );
}

export function registerPiExtensionSandboxInstallIpc({
  handleIpc,
  installPiExtensionSandboxPackage,
}: RegisterPiExtensionSandboxInstallIpcDependencies): void {
  handleIpc("pi-extension-sandbox:install", (_event, raw: unknown) =>
    installPiExtensionSandboxPackage(piExtensionSandboxInstallSchema.parse(raw)),
  );
}

export function registerPiExtensionSandboxUninstallIpc({
  handleIpc,
  uninstallPiExtensionSandboxPackage,
}: RegisterPiExtensionSandboxUninstallIpcDependencies): void {
  handleIpc("pi-extension-sandbox:uninstall", (_event, raw: unknown) =>
    uninstallPiExtensionSandboxPackage(piExtensionSandboxUninstallSchema.parse(raw)),
  );
}

export function registerPiExtensionSandboxClearHistoryIpc({
  handleIpc,
  clearPiExtensionSandboxHistory,
}: RegisterPiExtensionSandboxClearHistoryIpcDependencies): void {
  handleIpc("pi-extension-sandbox:clear-history", () => clearPiExtensionSandboxHistory());
}
