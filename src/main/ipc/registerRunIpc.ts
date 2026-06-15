import type { IpcMain } from "electron";
import { z } from "zod";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const runAbortIpcChannels = ["run:abort"] as const;

const threadIdSchema = z.string().min(1);

export interface RegisterRunAbortIpcDependencies {
  handleIpc: HandleIpc;
  abortRun(threadId: string): MaybePromise<void>;
}

export function registerRunAbortIpc({
  handleIpc,
  abortRun,
}: RegisterRunAbortIpcDependencies): void {
  handleIpc("run:abort", (_event, raw: string) => abortRun(threadIdSchema.parse(raw)));
}
