import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  InstallPiPackageInput,
  PiPackageCatalog,
  PiPackageInstallPreview,
  PreviewPiPackageInstallInput,
  SetPiPackageEnabledInput,
  UninstallPiPackageInput,
} from "../../shared/pluginTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const piPackagesInspectIpcChannels = ["pi-packages:inspect"] as const;
export const piPackagesPreviewInstallIpcChannels = ["pi-packages:preview-install"] as const;
export const piPackagesInstallIpcChannels = ["pi-packages:install"] as const;
export const piPackagesUninstallIpcChannels = ["pi-packages:uninstall"] as const;
export const piPackagesSetEnabledIpcChannels = ["pi-packages:set-enabled"] as const;

export interface RegisterPiPackagesInspectIpcDependencies {
  handleIpc: HandleIpc;
  inspectPiPackages(): MaybePromise<PiPackageCatalog>;
}

export interface RegisterPiPackagesPreviewInstallIpcDependencies {
  handleIpc: HandleIpc;
  previewPiPackageInstall(input: PreviewPiPackageInstallInput): MaybePromise<PiPackageInstallPreview>;
}

export interface RegisterPiPackagesInstallIpcDependencies {
  handleIpc: HandleIpc;
  installPiPackage(input: InstallPiPackageInput): MaybePromise<PiPackageCatalog>;
}

export interface RegisterPiPackagesUninstallIpcDependencies {
  handleIpc: HandleIpc;
  uninstallPiPackage(input: UninstallPiPackageInput): MaybePromise<PiPackageCatalog>;
}

export interface RegisterPiPackagesSetEnabledIpcDependencies {
  handleIpc: HandleIpc;
  setPiPackageEnabled(input: SetPiPackageEnabledInput): MaybePromise<PiPackageCatalog>;
}

const piPackageInstallSchema = z.object({
  source: z.string().min(1).max(2048),
  scope: z.enum(["workspace", "global"]).optional(),
}) satisfies z.ZodType<InstallPiPackageInput>;
const piPackageUninstallSchema = z.object({
  packageId: z.string().min(1).max(1024),
}) satisfies z.ZodType<UninstallPiPackageInput>;
const piPackageEnabledSchema = z.object({
  packageId: z.string().min(1).max(1024),
  enabled: z.boolean(),
}) satisfies z.ZodType<SetPiPackageEnabledInput>;

export function registerPiPackagesInspectIpc({
  handleIpc,
  inspectPiPackages,
}: RegisterPiPackagesInspectIpcDependencies): void {
  handleIpc("pi-packages:inspect", () => inspectPiPackages());
}

export function registerPiPackagesPreviewInstallIpc({
  handleIpc,
  previewPiPackageInstall,
}: RegisterPiPackagesPreviewInstallIpcDependencies): void {
  handleIpc("pi-packages:preview-install", (_event, raw: unknown) =>
    previewPiPackageInstall(piPackageInstallSchema.parse(raw)),
  );
}

export function registerPiPackagesInstallIpc({
  handleIpc,
  installPiPackage,
}: RegisterPiPackagesInstallIpcDependencies): void {
  handleIpc("pi-packages:install", (_event, raw: unknown) => installPiPackage(piPackageInstallSchema.parse(raw)));
}

export function registerPiPackagesUninstallIpc({
  handleIpc,
  uninstallPiPackage,
}: RegisterPiPackagesUninstallIpcDependencies): void {
  handleIpc("pi-packages:uninstall", (_event, raw: unknown) =>
    uninstallPiPackage(piPackageUninstallSchema.parse(raw)),
  );
}

export function registerPiPackagesSetEnabledIpc({
  handleIpc,
  setPiPackageEnabled,
}: RegisterPiPackagesSetEnabledIpcDependencies): void {
  handleIpc("pi-packages:set-enabled", (_event, raw: unknown) =>
    setPiPackageEnabled(piPackageEnabledSchema.parse(raw)),
  );
}
