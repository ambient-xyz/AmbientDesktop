import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AmbientMcpContainerRuntimeInstallLaunchInput,
  AmbientMcpContainerRuntimeInstallLaunchResult,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpInstalledServerSummary,
  AmbientMcpInstallPreview,
  AmbientMcpServerDescribeInput,
  AmbientMcpServerInstallInput,
  AmbientMcpServerInstallResult,
  AmbientMcpServerSearchInput,
  AmbientMcpServerSearchResult,
  AmbientMcpServerUninstallInput,
  AmbientMcpServerUninstallResult,
  AmbientMcpToolReviewAcceptInput,
  AmbientMcpToolReviewAcceptResult,
} from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const mcpRegistrySearchIpcChannels = ["mcp:registry-search"] as const;
export const mcpRegistryDescribeIpcChannels = ["mcp:registry-describe"] as const;
export const mcpInstalledListIpcChannels = ["mcp:installed-list"] as const;
export const mcpContainerRuntimeStatusIpcChannels = ["mcp:container-runtime-status"] as const;
export const mcpContainerRuntimeLaunchInstallIpcChannels = ["mcp:container-runtime-launch-install"] as const;
export const mcpContainerRuntimeDeferIpcChannels = ["mcp:container-runtime-defer"] as const;
export const mcpDefaultCapabilityInstallIpcChannels = ["mcp:default-capability-install"] as const;
export const mcpRegistryInstallIpcChannels = ["mcp:registry-install"] as const;
export const mcpServerUninstallIpcChannels = ["mcp:server-uninstall"] as const;
export const mcpToolReviewAcceptIpcChannels = ["mcp:tool-review-accept"] as const;

export interface RegisterMcpRegistrySearchIpcDependencies {
  handleIpc: HandleIpc;
  searchRegistryServers(input: AmbientMcpServerSearchInput): MaybePromise<AmbientMcpServerSearchResult[]>;
}

export interface RegisterMcpRegistryDescribeIpcDependencies {
  handleIpc: HandleIpc;
  describeRegistryServer(input: AmbientMcpServerDescribeInput): MaybePromise<AmbientMcpInstallPreview>;
}

export interface RegisterMcpInstalledListIpcDependencies {
  handleIpc: HandleIpc;
  listInstalledServers(): MaybePromise<AmbientMcpInstalledServerSummary[]>;
}

export interface RegisterMcpContainerRuntimeStatusIpcDependencies {
  handleIpc: HandleIpc;
  probeContainerRuntimeStatus(): MaybePromise<AmbientMcpContainerRuntimeStatus>;
}

export interface RegisterMcpContainerRuntimeLaunchInstallIpcDependencies {
  handleIpc: HandleIpc;
  launchContainerRuntimeInstall(input: AmbientMcpContainerRuntimeInstallLaunchInput): MaybePromise<AmbientMcpContainerRuntimeInstallLaunchResult>;
}

export interface RegisterMcpContainerRuntimeDeferIpcDependencies {
  handleIpc: HandleIpc;
  deferContainerRuntimeSetup(): MaybePromise<AmbientMcpContainerRuntimeStatus>;
}

export interface RegisterMcpDefaultCapabilityInstallIpcDependencies {
  handleIpc: HandleIpc;
  installDefaultCapability(input: AmbientMcpDefaultCapabilityInstallInput): MaybePromise<AmbientMcpServerInstallResult>;
}

export interface RegisterMcpRegistryInstallIpcDependencies {
  handleIpc: HandleIpc;
  installRegistryServer(input: AmbientMcpServerInstallInput): MaybePromise<AmbientMcpServerInstallResult>;
}

export interface RegisterMcpServerUninstallIpcDependencies {
  handleIpc: HandleIpc;
  uninstallServer(input: AmbientMcpServerUninstallInput): MaybePromise<AmbientMcpServerUninstallResult>;
}

export interface RegisterMcpToolReviewAcceptIpcDependencies {
  handleIpc: HandleIpc;
  acceptToolReview(input: AmbientMcpToolReviewAcceptInput): MaybePromise<AmbientMcpToolReviewAcceptResult>;
}

const mcpContainerRuntimeInstallLaunchSchema = z.object({
  actionId: z.string().min(1).max(128).optional(),
  mode: z.enum(["execute", "dry-run"]).optional(),
}) satisfies z.ZodType<AmbientMcpContainerRuntimeInstallLaunchInput>;
const mcpDefaultCapabilityInstallSchema = z.object({
  capabilityId: z.literal("scrapling"),
}) satisfies z.ZodType<AmbientMcpDefaultCapabilityInstallInput>;
const mcpServerInstallSchema = z.object({
  serverId: z.string().min(1).max(512),
  refresh: z.boolean().optional(),
  secretBindings: z.array(z.object({
    envName: z.string().min(1).max(256),
    secretRef: z.string().min(1).max(512),
  })).optional(),
}) satisfies z.ZodType<AmbientMcpServerInstallInput>;
const mcpServerUninstallSchema = z.object({
  serverId: z.string().min(1).max(512).optional(),
  workloadName: z.string().min(1).max(256).optional(),
}).refine((input) => Boolean(input.serverId || input.workloadName), {
  message: "serverId or workloadName is required.",
});
const mcpToolReviewAcceptSchema = z.object({
  serverId: z.string().min(1).max(512).optional(),
  workloadName: z.string().min(1).max(256).optional(),
  expectedDescriptorHash: z.string().min(1).max(128).optional(),
}).refine((input) => Boolean(input.serverId || input.workloadName), {
  message: "serverId or workloadName is required.",
});
const mcpServerSearchSchema = z.object({
  query: z.string().max(512).optional(),
  limit: z.number().finite().min(1).max(50).optional(),
  refresh: z.boolean().optional(),
}) satisfies z.ZodType<AmbientMcpServerSearchInput>;
const mcpServerDescribeSchema = z.object({
  serverId: z.string().min(1).max(512),
  refresh: z.boolean().optional(),
  secretBindings: z.array(z.object({
    envName: z.string().min(1).max(256),
    secretRef: z.string().min(1).max(512),
  })).optional(),
}) satisfies z.ZodType<AmbientMcpServerDescribeInput>;

export function registerMcpRegistrySearchIpc({
  handleIpc,
  searchRegistryServers,
}: RegisterMcpRegistrySearchIpcDependencies): void {
  handleIpc("mcp:registry-search", (_event, raw: unknown) => {
    const input = mcpServerSearchSchema.parse(raw ?? {});
    return searchRegistryServers(input);
  });
}

export function registerMcpRegistryDescribeIpc({
  handleIpc,
  describeRegistryServer,
}: RegisterMcpRegistryDescribeIpcDependencies): void {
  handleIpc("mcp:registry-describe", (_event, raw: unknown) => {
    const input = mcpServerDescribeSchema.parse(raw);
    return describeRegistryServer(input);
  });
}

export function registerMcpInstalledListIpc({
  handleIpc,
  listInstalledServers,
}: RegisterMcpInstalledListIpcDependencies): void {
  handleIpc("mcp:installed-list", () => listInstalledServers());
}

export function registerMcpContainerRuntimeStatusIpc({
  handleIpc,
  probeContainerRuntimeStatus,
}: RegisterMcpContainerRuntimeStatusIpcDependencies): void {
  handleIpc("mcp:container-runtime-status", () => probeContainerRuntimeStatus());
}

export function registerMcpContainerRuntimeLaunchInstallIpc({
  handleIpc,
  launchContainerRuntimeInstall,
}: RegisterMcpContainerRuntimeLaunchInstallIpcDependencies): void {
  handleIpc("mcp:container-runtime-launch-install", (_event, raw: unknown) => {
    const input = mcpContainerRuntimeInstallLaunchSchema.parse(raw ?? {});
    return launchContainerRuntimeInstall(input);
  });
}

export function registerMcpContainerRuntimeDeferIpc({
  handleIpc,
  deferContainerRuntimeSetup,
}: RegisterMcpContainerRuntimeDeferIpcDependencies): void {
  handleIpc("mcp:container-runtime-defer", () => deferContainerRuntimeSetup());
}

export function registerMcpDefaultCapabilityInstallIpc({
  handleIpc,
  installDefaultCapability,
}: RegisterMcpDefaultCapabilityInstallIpcDependencies): void {
  handleIpc("mcp:default-capability-install", (_event, raw: unknown) => {
    const input = mcpDefaultCapabilityInstallSchema.parse(raw);
    return installDefaultCapability(input);
  });
}

export function registerMcpRegistryInstallIpc({
  handleIpc,
  installRegistryServer,
}: RegisterMcpRegistryInstallIpcDependencies): void {
  handleIpc("mcp:registry-install", (_event, raw: unknown) => {
    const input = mcpServerInstallSchema.parse(raw);
    return installRegistryServer(input);
  });
}

export function registerMcpServerUninstallIpc({
  handleIpc,
  uninstallServer,
}: RegisterMcpServerUninstallIpcDependencies): void {
  handleIpc("mcp:server-uninstall", (_event, raw: unknown) => {
    const input = mcpServerUninstallSchema.parse(raw);
    return uninstallServer(input);
  });
}

export function registerMcpToolReviewAcceptIpc({
  handleIpc,
  acceptToolReview,
}: RegisterMcpToolReviewAcceptIpcDependencies): void {
  handleIpc("mcp:tool-review-accept", (_event, raw: unknown) => {
    const input = mcpToolReviewAcceptSchema.parse(raw);
    return acceptToolReview(input);
  });
}
