import type { SendMessageInput, ThreadSummary } from "../shared/types";

export type RuntimeThreadSettingsUpdate = Partial<Pick<ThreadSummary, "collaborationMode" | "model" | "thinkingLevel">>;

export type RuntimeThreadSettingsSendInput = SendMessageInput & {
  internal?: true;
};

export function runtimeThreadSettingsUpdateFromSendInput(input: RuntimeThreadSettingsSendInput): RuntimeThreadSettingsUpdate {
  if (input.internal) return {};
  return {
    collaborationMode: input.collaborationMode,
    model: input.model,
    thinkingLevel: input.thinkingLevel,
  };
}

export function hasRuntimeThreadSettingsUpdate(update: RuntimeThreadSettingsUpdate): boolean {
  return Object.values(update).some((value) => value !== undefined);
}
