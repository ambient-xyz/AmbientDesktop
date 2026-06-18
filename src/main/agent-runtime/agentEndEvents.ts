import type { AssistantTerminalEventDiagnostic } from "../agent-runtime/agentRuntimeAssistantTerminalDiagnostics";
import { stripAssistantReasoningTags } from "./assistantVisibleText";
import type { NormalizedPiEvent } from "./agentRuntimePiFacade";

export type RuntimeAgentEndEvent = Extract<NormalizedPiEvent, { kind: "agent-end" }>;

export interface RuntimeAgentEndEventContext {
  rawEvent: unknown;
  shouldIgnoreError: (error: string) => boolean;
  receivedAnyText: boolean;
  currentAssistantFinalText: string;
  assistantTextObservedAfterLastToolEnd: boolean;
  hasLastCompletedTool: boolean;
}

export type RuntimeAgentEndRuntimeErrorAction =
  | { kind: "set"; message: string }
  | { kind: "preserve" };

export interface RuntimeAgentEndEventModel {
  terminalDiagnostic: AssistantTerminalEventDiagnostic;
  runtimeError: RuntimeAgentEndRuntimeErrorAction;
  currentAssistantFinalText: string;
  assistantTextObservedAfterLastToolEnd: boolean;
  scheduleTerminalCompletion: true;
}

export function runtimeAgentEndEventModel(
  input: RuntimeAgentEndEvent,
  context: RuntimeAgentEndEventContext,
): RuntimeAgentEndEventModel {
  return {
    terminalDiagnostic: agentEndTerminalDiagnostic(input, context),
    runtimeError: lastRuntimeError(input, context),
    currentAssistantFinalText: agentEndFinalText(input, context),
    assistantTextObservedAfterLastToolEnd: agentEndObservedAfterTool(input, context),
    scheduleTerminalCompletion: true,
  };
}

function agentEndTerminalDiagnostic(
  input: RuntimeAgentEndEvent,
  context: RuntimeAgentEndEventContext,
): AssistantTerminalEventDiagnostic {
  const rawEvent = context.rawEvent as { type?: unknown; messages?: unknown };
  return {
    eventType: String(rawEvent?.type ?? "agent_end"),
    ...(Array.isArray(rawEvent?.messages) ? { contentBlockCount: rawEvent.messages.length } : {}),
    finalTextChars: input.finalTexts.join("").length,
    ...(input.errors.length ? { error: input.errors.join("; ").slice(0, 240) } : {}),
  };
}

function lastRuntimeError(input: RuntimeAgentEndEvent, context: RuntimeAgentEndEventContext): RuntimeAgentEndRuntimeErrorAction {
  const message = input.errors.filter((error) => !context.shouldIgnoreError(error)).at(-1);
  return message ? { kind: "set", message } : { kind: "preserve" };
}

function agentEndFinalText(input: RuntimeAgentEndEvent, context: RuntimeAgentEndEventContext): string {
  if (context.receivedAnyText) return context.currentAssistantFinalText;
  let currentAssistantFinalText = context.currentAssistantFinalText;
  for (const text of input.finalTexts) {
    if (text) currentAssistantFinalText = stripAssistantReasoningTags(text);
  }
  return currentAssistantFinalText;
}

function agentEndObservedAfterTool(
  input: RuntimeAgentEndEvent,
  context: RuntimeAgentEndEventContext,
): boolean {
  if (context.assistantTextObservedAfterLastToolEnd) return true;
  if (!context.hasLastCompletedTool) return false;
  return input.finalTexts.some((text) => Boolean(text.trim()));
}
