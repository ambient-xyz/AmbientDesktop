import { stripAssistantReasoningTags } from "../assistantVisibleText";
import type { NormalizedPiEvent } from "../pi/piEventMapper";

export type RuntimeAssistantUpdateEvent = Extract<NormalizedPiEvent, { kind: "assistant-update" }>;

export interface RuntimeAssistantUpdateEventContext {
  cleanupAbort: boolean;
  visibleDelta?: string | undefined;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalText: string;
  assistantOutputChars: number;
  assistantTextObservedAfterLastToolEnd: boolean;
  hasLastCompletedTool: boolean;
}

export type RuntimeAssistantUpdateRuntimeErrorAction =
  | { kind: "set"; message: string }
  | { kind: "preserve" };

export type RuntimeAssistantUpdateMessageOperation =
  | { kind: "append"; delta: string };

export interface RuntimeAssistantUpdateEventModel {
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalText: string;
  assistantOutputChars: number;
  assistantTextObservedAfterLastToolEnd: boolean;
  runtimeError: RuntimeAssistantUpdateRuntimeErrorAction;
  messageOperation?: RuntimeAssistantUpdateMessageOperation;
  markPiStreamActivity: boolean;
  activeRunStatus?: "streaming";
  markFirstAssistantVisibleText: boolean;
}

export function runtimeAssistantUpdateEventModel(
  input: RuntimeAssistantUpdateEvent,
  context: RuntimeAssistantUpdateEventContext,
): RuntimeAssistantUpdateEventModel {
  const base = baseAssistantUpdateModel(input, context);

  if (input.delta) {
    if (!context.visibleDelta) {
      return {
        ...base,
        markPiStreamActivity: true,
        activeRunStatus: "streaming",
      };
    }

    const currentAssistantFinalText = context.currentAssistantFinalText + context.visibleDelta;
    return {
      ...base,
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText,
      assistantOutputChars: context.assistantOutputChars + context.visibleDelta.length,
      assistantTextObservedAfterLastToolEnd: context.assistantTextObservedAfterLastToolEnd || context.hasLastCompletedTool,
      messageOperation: { kind: "append", delta: context.visibleDelta },
      markPiStreamActivity: true,
      activeRunStatus: "streaming",
      markFirstAssistantVisibleText: true,
    };
  }

  if (input.finalText && !context.currentAssistantReceivedText) {
    const currentAssistantFinalText = stripAssistantReasoningTags(input.finalText);
    return {
      ...base,
      currentAssistantFinalText,
      assistantOutputChars: Math.max(context.assistantOutputChars, currentAssistantFinalText.length),
      assistantTextObservedAfterLastToolEnd:
        context.assistantTextObservedAfterLastToolEnd ||
        (Boolean(currentAssistantFinalText.trim()) && context.hasLastCompletedTool),
    };
  }

  return base;
}

function baseAssistantUpdateModel(
  input: RuntimeAssistantUpdateEvent,
  context: RuntimeAssistantUpdateEventContext,
): RuntimeAssistantUpdateEventModel {
  return {
    receivedAnyText: context.receivedAnyText,
    currentAssistantReceivedText: context.currentAssistantReceivedText,
    currentAssistantFinalText: context.currentAssistantFinalText,
    assistantOutputChars: context.assistantOutputChars,
    assistantTextObservedAfterLastToolEnd: context.assistantTextObservedAfterLastToolEnd,
    runtimeError: input.error && !context.cleanupAbort
      ? { kind: "set", message: input.error }
      : { kind: "preserve" },
    markPiStreamActivity: false,
    markFirstAssistantVisibleText: false,
  };
}
