import type { IpcMain } from "electron";
import { z } from "zod";

import type { PrivilegedCredentialPromptResponseInput } from "../../shared/permissionTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const privilegedCredentialRespondIpcChannels = ["privileged-credential:respond"] as const;

export interface RegisterPrivilegedCredentialRespondIpcDependencies {
  handleIpc: HandleIpc;
  respondPrivilegedCredential(input: PrivilegedCredentialPromptResponseInput): MaybePromise<void>;
}

const privilegedCredentialPromptResponseSchema = z.object({
  id: z.string().min(1),
  credential: z.string().optional(),
  canceled: z.boolean().optional(),
}) satisfies z.ZodType<PrivilegedCredentialPromptResponseInput>;

export function registerPrivilegedCredentialRespondIpc({
  handleIpc,
  respondPrivilegedCredential,
}: RegisterPrivilegedCredentialRespondIpcDependencies): void {
  handleIpc("privileged-credential:respond", (_event, raw: unknown) =>
    respondPrivilegedCredential(privilegedCredentialPromptResponseSchema.parse(raw)),
  );
}
