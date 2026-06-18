import { piThinkingMessageMetadata } from "../agent-runtime/agentRuntimeAssistantMessageMetadata";
import type { NormalizedPiEvent } from "./agentRuntimePiFacade";

export type RuntimeThinkingEvent = Extract<
  NormalizedPiEvent,
  { kind: "thinking-start" | "thinking-update" | "thinking-end" }
>;

export interface RuntimeThinkingEventContext {
  currentThinkingReceivedText: boolean;
  currentThinkingFinalText: string;
  thinkingOutputChars: number;
}

export type RuntimeThinkingMessageOperation =
  | { kind: "ensure" }
  | { kind: "append"; delta: string }
  | { kind: "replace"; content: string; metadata: Record<string, unknown> };

export interface RuntimeThinkingEventModel {
  currentThinkingReceivedText: boolean;
  currentThinkingFinalText: string;
  thinkingOutputChars: number;
  messageOperation?: RuntimeThinkingMessageOperation;
  markPiStreamActivity: boolean;
  activeRunStatus?: "streaming";
  finish: boolean;
}

export function runtimeThinkingEventModel(
  input: RuntimeThinkingEvent,
  context: RuntimeThinkingEventContext,
): RuntimeThinkingEventModel {
  if (input.kind === "thinking-start") {
    return {
      ...context,
      messageOperation: { kind: "ensure" },
      markPiStreamActivity: false,
      activeRunStatus: "streaming",
      finish: false,
    };
  }

  if (input.kind === "thinking-update") {
    return {
      ...thinkingTextUpdate(input, context),
      activeRunStatus: "streaming",
      finish: false,
    };
  }

  return {
    ...thinkingTextUpdate(input, context),
    finish: true,
  };
}

function thinkingTextUpdate(
  input: Extract<RuntimeThinkingEvent, { kind: "thinking-update" | "thinking-end" }>,
  context: RuntimeThinkingEventContext,
): Omit<RuntimeThinkingEventModel, "activeRunStatus" | "finish"> {
  if (input.kind === "thinking-update" && input.delta) {
    return {
      currentThinkingReceivedText: true,
      currentThinkingFinalText: context.currentThinkingFinalText + input.delta,
      thinkingOutputChars: context.thinkingOutputChars + input.delta.length,
      messageOperation: { kind: "append", delta: input.delta },
      markPiStreamActivity: true,
    };
  }

  if (input.finalText && !context.currentThinkingReceivedText) {
    return {
      currentThinkingReceivedText: context.currentThinkingReceivedText,
      currentThinkingFinalText: input.finalText,
      thinkingOutputChars: Math.max(context.thinkingOutputChars, input.finalText.length),
      messageOperation: {
        kind: "replace",
        content: input.finalText,
        metadata: piThinkingMessageMetadata("thinking"),
      },
      markPiStreamActivity: false,
    };
  }

  return {
    ...context,
    markPiStreamActivity: false,
  };
}
