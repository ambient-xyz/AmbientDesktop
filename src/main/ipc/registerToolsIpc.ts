import type { IpcMain } from "electron";
import { z } from "zod";

import type { ManagedDevServerSummary, StopManagedDevServerInput } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const toolsManagedDevServersIpcChannels = ["tools:managed-dev-servers"] as const;
export const toolsManagedDevServerStopIpcChannels = ["tools:managed-dev-server-stop"] as const;

export interface RegisterToolsManagedDevServersIpcDependencies {
  handleIpc: HandleIpc;
  listManagedDevServers(): MaybePromise<ManagedDevServerSummary[]>;
}

export interface RegisterToolsManagedDevServerStopIpcDependencies {
  handleIpc: HandleIpc;
  stopManagedDevServer(id: string): boolean;
  listManagedDevServers(): ManagedDevServerSummary[];
}

const managedDevServerStopSchema = z.object({
  id: z.string().min(1).max(128),
}) satisfies z.ZodType<StopManagedDevServerInput>;

export function registerToolsManagedDevServersIpc({
  handleIpc,
  listManagedDevServers,
}: RegisterToolsManagedDevServersIpcDependencies): void {
  handleIpc("tools:managed-dev-servers", () => listManagedDevServers());
}

export function registerToolsManagedDevServerStopIpc({
  handleIpc,
  stopManagedDevServer,
  listManagedDevServers,
}: RegisterToolsManagedDevServerStopIpcDependencies): void {
  handleIpc("tools:managed-dev-server-stop", (_event, raw: unknown): ManagedDevServerSummary[] => {
    const input = managedDevServerStopSchema.parse(raw);
    if (!stopManagedDevServer(input.id)) {
      throw new Error("Managed dev server was not found.");
    }
    return listManagedDevServers();
  });
}
