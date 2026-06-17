import type { IpcMain } from "electron";
import { z } from "zod";

import type { CapabilityBuilderHistoryInput, CapabilityBuilderHistoryResult } from "../capability-builder/capabilityBuilder";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const capabilityBuilderHistoryIpcChannels = ["capability-builder:history"] as const;

export interface RegisterCapabilityBuilderHistoryIpcDependencies {
  handleIpc: HandleIpc;
  getWorkspacePath(): string;
  discoverCapabilityBuilderHistory(
    workspacePath: string,
    input: CapabilityBuilderHistoryInput,
  ): MaybePromise<CapabilityBuilderHistoryResult>;
}

const capabilityBuilderHistorySchema = z.object({
  includeRegistered: z.boolean().optional(),
  includeDrafts: z.boolean().optional(),
  packageName: z.string().max(256).optional(),
}) satisfies z.ZodType<CapabilityBuilderHistoryInput>;

export function registerCapabilityBuilderHistoryIpc({
  handleIpc,
  getWorkspacePath,
  discoverCapabilityBuilderHistory,
}: RegisterCapabilityBuilderHistoryIpcDependencies): void {
  handleIpc("capability-builder:history", (_event, raw: unknown) => {
    const input = capabilityBuilderHistorySchema.parse(raw ?? {});
    return discoverCapabilityBuilderHistory(getWorkspacePath(), input);
  });
}
