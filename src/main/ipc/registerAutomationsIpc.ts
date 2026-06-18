import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleSummary,
  CreateAutomationFolderInput,
  CreateAutomationScheduleInput,
  MoveAutomationThreadInput,
  UpdateAutomationScheduleInput,
} from "../../shared/automationTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;
type AutomationScheduleExceptionListInput = { scheduleId?: string };

export const automationsListFoldersIpcChannels = ["automations:list-folders"] as const;
export const automationsCreateFolderIpcChannels = ["automations:create-folder"] as const;
export const automationsMoveThreadIpcChannels = ["automations:move-thread"] as const;
export const automationsListSchedulesIpcChannels = ["automations:list-schedules"] as const;
export const automationsCreateScheduleIpcChannels = ["automations:create-schedule"] as const;
export const automationsUpdateScheduleIpcChannels = ["automations:update-schedule"] as const;
export const automationsListScheduleExceptionsIpcChannels = ["automations:list-schedule-exceptions"] as const;
export const automationsSkipScheduleOccurrenceIpcChannels = ["automations:skip-schedule-occurrence"] as const;
export const automationsRescheduleScheduleOccurrenceIpcChannels = ["automations:reschedule-schedule-occurrence"] as const;
export const automationsUpdateScheduleOccurrenceRunLimitsIpcChannels = [
  "automations:update-schedule-occurrence-run-limits",
] as const;

export interface RegisterAutomationsListFoldersIpcDependencies {
  handleIpc: HandleIpc;
  listAutomationFolders(): MaybePromise<AutomationFolderSummary[]>;
}

export interface RegisterAutomationsCreateFolderIpcDependencies {
  handleIpc: HandleIpc;
  createAutomationFolder(input: CreateAutomationFolderInput): MaybePromise<AutomationFolderSummary[]>;
}

export interface RegisterAutomationsMoveThreadIpcDependencies {
  handleIpc: HandleIpc;
  moveAutomationThread(input: MoveAutomationThreadInput): MaybePromise<AutomationFolderSummary[]>;
}

export interface RegisterAutomationsListSchedulesIpcDependencies {
  handleIpc: HandleIpc;
  listAutomationSchedules(): MaybePromise<AutomationScheduleSummary[]>;
}

export interface RegisterAutomationsCreateScheduleIpcDependencies {
  handleIpc: HandleIpc;
  createAutomationSchedule(input: CreateAutomationScheduleInput): MaybePromise<AutomationScheduleSummary[]>;
}

export interface RegisterAutomationsUpdateScheduleIpcDependencies {
  handleIpc: HandleIpc;
  updateAutomationSchedule(input: UpdateAutomationScheduleInput): MaybePromise<AutomationScheduleSummary[]>;
}

export interface RegisterAutomationsListScheduleExceptionsIpcDependencies {
  handleIpc: HandleIpc;
  listAutomationScheduleExceptions(input: AutomationScheduleExceptionListInput): MaybePromise<AutomationScheduleExceptionSummary[]>;
}

export interface RegisterAutomationsSkipScheduleOccurrenceIpcDependencies {
  handleIpc: HandleIpc;
  skipAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
  ): MaybePromise<AutomationScheduleOccurrenceActionResult>;
}

export interface RegisterAutomationsRescheduleScheduleOccurrenceIpcDependencies {
  handleIpc: HandleIpc;
  rescheduleAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
  ): MaybePromise<AutomationScheduleOccurrenceActionResult>;
}

export interface RegisterAutomationsUpdateScheduleOccurrenceRunLimitsIpcDependencies {
  handleIpc: HandleIpc;
  updateAutomationScheduleOccurrenceRunLimits(
    input: AutomationScheduleOccurrenceActionInput,
  ): MaybePromise<AutomationScheduleOccurrenceActionResult>;
}

const automationFolderCreateSchema = z.object({
  name: z.string().min(1).max(120),
}) satisfies z.ZodType<CreateAutomationFolderInput>;

const automationThreadMoveSchema = z.object({
  threadId: z.string().min(1).max(512),
  folderId: z.string().min(1).max(256),
}) satisfies z.ZodType<MoveAutomationThreadInput>;

const automationScheduleRunLimitOverridesSchema = z.object({
  idleTimeoutMs: z.number().int().positive().optional(),
  maxRunMs: z.number().int().positive().nullable().optional(),
});

const automationScheduleCreateSchema = z.object({
  targetKind: z.enum(["local_task", "workflow_playbook", "workflow_thread", "workflow_version", "workflow_artifact", "folder"]),
  targetId: z.string().min(1).max(512),
  targetVersion: z.number().int().positive().optional(),
  preset: z.enum(["manual", "hourly", "daily", "weekdays", "weekly", "advanced"]),
  cronExpression: z.string().max(120).optional(),
  timezone: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  skipIfActive: z.boolean().optional(),
  runLimits: automationScheduleRunLimitOverridesSchema.optional(),
}) satisfies z.ZodType<CreateAutomationScheduleInput>;

const automationScheduleUpdateSchema = z.object({
  id: z.string().min(1).max(512),
  targetKind: z.enum(["local_task", "workflow_playbook", "workflow_thread", "workflow_version", "workflow_artifact", "folder"]).optional(),
  targetId: z.string().min(1).max(512).optional(),
  targetVersion: z.number().int().positive().optional(),
  preset: z.enum(["manual", "hourly", "daily", "weekdays", "weekly", "advanced"]).optional(),
  cronExpression: z.string().max(120).optional(),
  timezone: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  skipIfActive: z.boolean().optional(),
  runLimits: automationScheduleRunLimitOverridesSchema.optional(),
  editScope: z.enum(["this_occurrence", "this_and_following", "all_occurrences"]).optional(),
  occurrenceAt: z.string().min(1).max(80).optional(),
}) satisfies z.ZodType<UpdateAutomationScheduleInput>;

const automationScheduleExceptionListSchema = z
  .object({
    scheduleId: z.string().min(1).max(512).optional(),
  })
  .optional() satisfies z.ZodType<AutomationScheduleExceptionListInput | undefined>;

const automationScheduleOccurrenceActionSchema = z.object({
  scheduleId: z.string().min(1).max(512),
  occurrenceAt: z.string().min(1).max(80).optional(),
  replacementRunAt: z.string().min(1).max(80).optional(),
  runLimits: automationScheduleRunLimitOverridesSchema.optional(),
  reason: z.string().max(1000).optional(),
}) satisfies z.ZodType<AutomationScheduleOccurrenceActionInput>;

export function registerAutomationsListFoldersIpc({
  handleIpc,
  listAutomationFolders,
}: RegisterAutomationsListFoldersIpcDependencies): void {
  handleIpc("automations:list-folders", () => listAutomationFolders());
}

export function registerAutomationsCreateFolderIpc({
  handleIpc,
  createAutomationFolder,
}: RegisterAutomationsCreateFolderIpcDependencies): void {
  handleIpc("automations:create-folder", (_event, raw: unknown) =>
    createAutomationFolder(automationFolderCreateSchema.parse(raw)),
  );
}

export function registerAutomationsMoveThreadIpc({
  handleIpc,
  moveAutomationThread,
}: RegisterAutomationsMoveThreadIpcDependencies): void {
  handleIpc("automations:move-thread", (_event, raw: unknown) =>
    moveAutomationThread(automationThreadMoveSchema.parse(raw)),
  );
}

export function registerAutomationsListSchedulesIpc({
  handleIpc,
  listAutomationSchedules,
}: RegisterAutomationsListSchedulesIpcDependencies): void {
  handleIpc("automations:list-schedules", () => listAutomationSchedules());
}

export function registerAutomationsCreateScheduleIpc({
  handleIpc,
  createAutomationSchedule,
}: RegisterAutomationsCreateScheduleIpcDependencies): void {
  handleIpc("automations:create-schedule", (_event, raw: unknown) =>
    createAutomationSchedule(automationScheduleCreateSchema.parse(raw)),
  );
}

export function registerAutomationsUpdateScheduleIpc({
  handleIpc,
  updateAutomationSchedule,
}: RegisterAutomationsUpdateScheduleIpcDependencies): void {
  handleIpc("automations:update-schedule", (_event, raw: unknown) =>
    updateAutomationSchedule(automationScheduleUpdateSchema.parse(raw)),
  );
}

export function registerAutomationsListScheduleExceptionsIpc({
  handleIpc,
  listAutomationScheduleExceptions,
}: RegisterAutomationsListScheduleExceptionsIpcDependencies): void {
  handleIpc("automations:list-schedule-exceptions", (_event, raw: unknown) =>
    listAutomationScheduleExceptions(automationScheduleExceptionListSchema.parse(raw) ?? {}),
  );
}

export function registerAutomationsSkipScheduleOccurrenceIpc({
  handleIpc,
  skipAutomationScheduleOccurrence,
}: RegisterAutomationsSkipScheduleOccurrenceIpcDependencies): void {
  handleIpc("automations:skip-schedule-occurrence", (_event, raw: unknown) =>
    skipAutomationScheduleOccurrence(automationScheduleOccurrenceActionSchema.parse(raw)),
  );
}

export function registerAutomationsRescheduleScheduleOccurrenceIpc({
  handleIpc,
  rescheduleAutomationScheduleOccurrence,
}: RegisterAutomationsRescheduleScheduleOccurrenceIpcDependencies): void {
  handleIpc("automations:reschedule-schedule-occurrence", (_event, raw: unknown) =>
    rescheduleAutomationScheduleOccurrence(automationScheduleOccurrenceActionSchema.parse(raw)),
  );
}

export function registerAutomationsUpdateScheduleOccurrenceRunLimitsIpc({
  handleIpc,
  updateAutomationScheduleOccurrenceRunLimits,
}: RegisterAutomationsUpdateScheduleOccurrenceRunLimitsIpcDependencies): void {
  handleIpc("automations:update-schedule-occurrence-run-limits", (_event, raw: unknown) =>
    updateAutomationScheduleOccurrenceRunLimits(automationScheduleOccurrenceActionSchema.parse(raw)),
  );
}
