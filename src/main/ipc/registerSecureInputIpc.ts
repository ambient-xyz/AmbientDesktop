import type { IpcMain } from "electron";
import { z } from "zod";

import type { SecureInputPromptResponseInput } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const secureInputRespondIpcChannels = ["secure-input:respond"] as const;

export interface RegisterSecureInputRespondIpcDependencies {
  handleIpc: HandleIpc;
  respondSecureInput(input: SecureInputPromptResponseInput): MaybePromise<void>;
}

const secureInputPromptResponseSchema = z.object({
  id: z.string().min(1),
  value: z.string().optional(),
  canceled: z.boolean().optional(),
}) satisfies z.ZodType<SecureInputPromptResponseInput>;

export function registerSecureInputRespondIpc({
  handleIpc,
  respondSecureInput,
}: RegisterSecureInputRespondIpcDependencies): void {
  handleIpc("secure-input:respond", (_event, raw: unknown) =>
    respondSecureInput(secureInputPromptResponseSchema.parse(raw)),
  );
}
