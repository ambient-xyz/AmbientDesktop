import { z } from "zod";
import type {
  PermissionMode,
  RequestThreadPermissionModeChangeInput,
  UpdateThreadSettingsInput,
} from "../../shared/types";

const permissionModeSchema = z.enum(["full-access", "workspace"]);

export const updateThreadSettingsSchema = z
  .object({
    threadId: z.string().min(1),
    collaborationMode: z.enum(["agent", "planner"]).optional(),
    model: z.string().min(1).optional(),
    thinkingLevel: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
    memoryEnabled: z.boolean().optional(),
  })
  .strict();

export const threadPermissionModeChangeSchema = z
  .object({
    threadId: z.string().min(1),
    permissionMode: permissionModeSchema,
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export function parseThreadSettingsUpdate(raw: unknown): UpdateThreadSettingsInput {
  return updateThreadSettingsSchema.parse(raw);
}

export function parseThreadPermissionModeChange(raw: unknown): RequestThreadPermissionModeChangeInput {
  return threadPermissionModeChangeSchema.parse(raw);
}

export function permissionModeChangeAuditDetail(input: {
  previousPermissionMode: PermissionMode;
  nextPermissionMode: PermissionMode;
  reason?: string;
}): string {
  const base = `${input.previousPermissionMode} -> ${input.nextPermissionMode}`;
  return input.reason ? `${base}; reason: ${input.reason}` : base;
}
