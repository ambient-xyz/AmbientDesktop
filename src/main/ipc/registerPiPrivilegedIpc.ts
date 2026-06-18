import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  InstallPiPrivilegedPackageInput,
  PiPrivilegedCatalog,
  PiPrivilegedPackageActionInput,
  PiPrivilegedSecurityScan,
  ScanPiPrivilegedPackageInput,
  UninstallPiPrivilegedPackageInput,
} from "../../shared/pluginTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const piPrivilegedInspectIpcChannels = ["pi-privileged:inspect"] as const;
export const piPrivilegedScanIpcChannels = ["pi-privileged:scan"] as const;
export const piPrivilegedInstallIpcChannels = ["pi-privileged:install"] as const;
export const piPrivilegedDisableIpcChannels = ["pi-privileged:disable"] as const;
export const piPrivilegedUninstallIpcChannels = ["pi-privileged:uninstall"] as const;
export const piPrivilegedClearHistoryIpcChannels = ["pi-privileged:clear-history"] as const;

export interface RegisterPiPrivilegedInspectIpcDependencies {
  handleIpc: HandleIpc;
  inspectPiPrivilegedPackages(): MaybePromise<PiPrivilegedCatalog>;
}

export interface RegisterPiPrivilegedScanIpcDependencies {
  handleIpc: HandleIpc;
  scanPiPrivilegedPackage(input: ScanPiPrivilegedPackageInput): MaybePromise<PiPrivilegedSecurityScan>;
}

export interface RegisterPiPrivilegedInstallIpcDependencies {
  handleIpc: HandleIpc;
  installPiPrivilegedPackage(input: InstallPiPrivilegedPackageInput): MaybePromise<PiPrivilegedCatalog>;
}

export interface RegisterPiPrivilegedDisableIpcDependencies {
  handleIpc: HandleIpc;
  disablePiPrivilegedPackage(input: PiPrivilegedPackageActionInput): MaybePromise<PiPrivilegedCatalog>;
}

export interface RegisterPiPrivilegedUninstallIpcDependencies {
  handleIpc: HandleIpc;
  uninstallPiPrivilegedPackage(input: UninstallPiPrivilegedPackageInput): MaybePromise<PiPrivilegedCatalog>;
}

export interface RegisterPiPrivilegedClearHistoryIpcDependencies {
  handleIpc: HandleIpc;
  clearPiPrivilegedPackageHistory(): MaybePromise<PiPrivilegedCatalog>;
}

export const piPrivilegedSourceSchema = z.object({
  source: z.string().min(1).max(2048),
  scanOrigin: z.enum(["explicit", "sandbox-fallback"]).optional(),
}) satisfies z.ZodType<ScanPiPrivilegedPackageInput>;

export const piPrivilegedPackageActionSchema = (
  z.object({
    packageId: z.string().min(1).max(1024).optional(),
    packageName: z.string().min(1).max(512).optional(),
  })
  .refine((input) => Boolean(input.packageId || input.packageName), "packageId or packageName is required.")
) satisfies z.ZodType<PiPrivilegedPackageActionInput>;

export const piPrivilegedUninstallSchema = (
  piPrivilegedPackageActionSchema.extend({
    deleteData: z.boolean().optional(),
  })
) satisfies z.ZodType<UninstallPiPrivilegedPackageInput>;

export function registerPiPrivilegedInspectIpc({
  handleIpc,
  inspectPiPrivilegedPackages,
}: RegisterPiPrivilegedInspectIpcDependencies): void {
  handleIpc("pi-privileged:inspect", () => inspectPiPrivilegedPackages());
}

export function registerPiPrivilegedScanIpc({
  handleIpc,
  scanPiPrivilegedPackage,
}: RegisterPiPrivilegedScanIpcDependencies): void {
  handleIpc("pi-privileged:scan", (_event, raw: unknown) =>
    scanPiPrivilegedPackage(piPrivilegedSourceSchema.parse(raw)),
  );
}

export function registerPiPrivilegedInstallIpc({
  handleIpc,
  installPiPrivilegedPackage,
}: RegisterPiPrivilegedInstallIpcDependencies): void {
  handleIpc("pi-privileged:install", (_event, raw: unknown) =>
    installPiPrivilegedPackage(piPrivilegedSourceSchema.parse(raw)),
  );
}

export function registerPiPrivilegedDisableIpc({
  handleIpc,
  disablePiPrivilegedPackage,
}: RegisterPiPrivilegedDisableIpcDependencies): void {
  handleIpc("pi-privileged:disable", (_event, raw: unknown) =>
    disablePiPrivilegedPackage(piPrivilegedPackageActionSchema.parse(raw)),
  );
}

export function registerPiPrivilegedUninstallIpc({
  handleIpc,
  uninstallPiPrivilegedPackage,
}: RegisterPiPrivilegedUninstallIpcDependencies): void {
  handleIpc("pi-privileged:uninstall", (_event, raw: unknown) =>
    uninstallPiPrivilegedPackage(piPrivilegedUninstallSchema.parse(raw)),
  );
}

export function registerPiPrivilegedClearHistoryIpc({
  handleIpc,
  clearPiPrivilegedPackageHistory,
}: RegisterPiPrivilegedClearHistoryIpcDependencies): void {
  handleIpc("pi-privileged:clear-history", () => clearPiPrivilegedPackageHistory());
}
