import type { IpcMain } from "electron";
import { z } from "zod";

import type { CompactThreadInput, ContextUsageSnapshot, RecoverThreadContextInput } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const contextUsageIpcChannels = ["context:usage"] as const;
export const contextCompactIpcChannels = ["context:compact"] as const;
export const contextRecoverIpcChannels = ["context:recover"] as const;

const threadIdSchema = z.string().min(1);
const compactThreadSchema = z.object({
  threadId: z.string().min(1),
  customInstructions: z.string().trim().min(1).max(20_000).optional(),
});
const recoverThreadContextSchema = z.object({
  threadId: z.string().min(1),
  reason: z.string().trim().min(1).max(20_000).optional(),
});

export interface RegisterContextUsageIpcDependencies {
  handleIpc: HandleIpc;
  getContextUsage(threadId: string): MaybePromise<ContextUsageSnapshot>;
}

export interface RegisterContextCompactIpcDependencies {
  handleIpc: HandleIpc;
  compactThread(input: CompactThreadInput): MaybePromise<ContextUsageSnapshot>;
}

export interface RegisterContextRecoverIpcDependencies {
  handleIpc: HandleIpc;
  recoverThreadContext(input: RecoverThreadContextInput): MaybePromise<ContextUsageSnapshot>;
}

export function registerContextUsageIpc({
  handleIpc,
  getContextUsage,
}: RegisterContextUsageIpcDependencies): void {
  handleIpc("context:usage", (_event, raw: string) => getContextUsage(threadIdSchema.parse(raw)));
}

export function registerContextCompactIpc({
  handleIpc,
  compactThread,
}: RegisterContextCompactIpcDependencies): void {
  handleIpc("context:compact", (_event, raw: CompactThreadInput) => compactThread(compactThreadSchema.parse(raw)));
}

export function registerContextRecoverIpc({
  handleIpc,
  recoverThreadContext,
}: RegisterContextRecoverIpcDependencies): void {
  handleIpc("context:recover", (_event, raw: RecoverThreadContextInput) =>
    recoverThreadContext(recoverThreadContextSchema.parse(raw)),
  );
}
