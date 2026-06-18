import { piAssistantMessageMetadata } from "../agent-runtime/agentRuntimeAssistantMessageMetadata";
import { stripAssistantReasoningTags } from "./assistantVisibleText";
import type { NormalizedPiEvent } from "../pi/piEventMapper";

export type RuntimeAssistantEndEvent = Extract<NormalizedPiEvent, { kind: "assistant-end" }>;

export interface RuntimeAssistantEndEventContext {
  cleanupAbort: boolean;
  trailingVisibleText?: string | undefined;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalText: string;
  assistantOutputChars: number;
  assistantTextObservedAfterLastToolEnd: boolean;
  hasLastCompletedTool: boolean;
  hasLastAssistantTerminalEvent: boolean;
}

export type RuntimeAssistantEndRuntimeErrorAction =
  | { kind: "set"; message: string }
  | { kind: "preserve" };

export type RuntimeAssistantEndMessageOperation =
  | { kind: "replace"; content: string; metadata: Record<string, unknown> }
  | { kind: "finish"; status: "done" | "error" };

export interface RuntimeAssistantEndEventModel {
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalText: string;
  assistantOutputChars: number;
  assistantTextObservedAfterLastToolEnd: boolean;
  runtimeError: RuntimeAssistantEndRuntimeErrorAction;
  shouldRecordTerminalDiagnostic: boolean;
  primaryMessageOperation: RuntimeAssistantEndMessageOperation;
  trailingMessageOperation?: { kind: "append"; delta: string };
  markFirstAssistantVisibleText: boolean;
  scheduleTerminalCompletion: true;
}

export function runtimeAssistantEndEventModel(
  input: RuntimeAssistantEndEvent,
  context: RuntimeAssistantEndEventContext,
): RuntimeAssistantEndEventModel {
  const status: "done" | "error" = input.error && !context.cleanupAbort ? "error" : "done";
  const base = baseAssistantEndModel(input, context, status);
  const withPrimary = input.finalText && !context.currentAssistantReceivedText
    ? applyFinalText(input.finalText, context, base, status)
    : {
        ...base,
        primaryMessageOperation: { kind: "finish" as const, status },
      };

  if (!context.trailingVisibleText) return withPrimary;

  return {
    ...withPrimary,
    receivedAnyText: true,
    currentAssistantReceivedText: true,
    currentAssistantFinalText: withPrimary.currentAssistantFinalText + context.trailingVisibleText,
    assistantOutputChars: withPrimary.assistantOutputChars + context.trailingVisibleText.length,
    assistantTextObservedAfterLastToolEnd: withPrimary.assistantTextObservedAfterLastToolEnd || context.hasLastCompletedTool,
    trailingMessageOperation: { kind: "append", delta: context.trailingVisibleText },
  };
}

function baseAssistantEndModel(
  input: RuntimeAssistantEndEvent,
  context: RuntimeAssistantEndEventContext,
  status: "done" | "error",
): RuntimeAssistantEndEventModel {
  return {
    receivedAnyText: context.receivedAnyText,
    currentAssistantReceivedText: context.currentAssistantReceivedText,
    currentAssistantFinalText: context.currentAssistantFinalText,
    assistantOutputChars: context.assistantOutputChars,
    assistantTextObservedAfterLastToolEnd: context.assistantTextObservedAfterLastToolEnd,
    runtimeError: input.error && !context.cleanupAbort
      ? { kind: "set", message: input.error }
      : { kind: "preserve" },
    shouldRecordTerminalDiagnostic: !context.cleanupAbort || !context.hasLastAssistantTerminalEvent,
    primaryMessageOperation: { kind: "finish", status },
    markFirstAssistantVisibleText: false,
    scheduleTerminalCompletion: true,
  };
}

function applyFinalText(
  finalText: string,
  context: RuntimeAssistantEndEventContext,
  base: RuntimeAssistantEndEventModel,
  status: "done" | "error",
): RuntimeAssistantEndEventModel {
  const currentAssistantFinalText = stripAssistantReasoningTags(finalText);
  const currentAssistantReceivedText = Boolean(currentAssistantFinalText.trim());
  return {
    ...base,
    receivedAnyText: currentAssistantReceivedText,
    currentAssistantReceivedText,
    currentAssistantFinalText,
    assistantOutputChars: Math.max(context.assistantOutputChars, currentAssistantFinalText.length),
    assistantTextObservedAfterLastToolEnd:
      base.assistantTextObservedAfterLastToolEnd ||
      (currentAssistantReceivedText && context.hasLastCompletedTool),
    primaryMessageOperation: {
      kind: "replace",
      content: currentAssistantFinalText,
      metadata: piAssistantMessageMetadata(status),
    },
    markFirstAssistantVisibleText: currentAssistantReceivedText,
  };
}
