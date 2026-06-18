import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AmbientCliSecretSaveResult,
  SaveAmbientCliSecretInput,
} from "../../shared/pluginTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const ambientCliSaveSecretIpcChannels = ["ambient-cli:save-secret"] as const;

export interface RegisterAmbientCliSaveSecretIpcDependencies {
  handleIpc: HandleIpc;
  saveAmbientCliSecret(input: SaveAmbientCliSecretInput): MaybePromise<AmbientCliSecretSaveResult>;
}

const ambientCliSecretSaveSchema = z.object({
  packageId: z.string().min(1).optional(),
  packageName: z.string().min(1).optional(),
  builderSourcePath: z.string().min(1).optional(),
  mcpServerId: z.string().min(1).optional(),
  mcpCandidateId: z.string().min(1).optional(),
  mcpCandidateRef: z.string().min(1).optional(),
  envName: z.string().min(1),
  value: z.string().min(1),
}) satisfies z.ZodType<SaveAmbientCliSecretInput>;

export function registerAmbientCliSaveSecretIpc({
  handleIpc,
  saveAmbientCliSecret,
}: RegisterAmbientCliSaveSecretIpcDependencies): void {
  handleIpc("ambient-cli:save-secret", (_event, raw: unknown) =>
    saveAmbientCliSecret(ambientCliSecretSaveSchema.parse(raw)),
  );
}
