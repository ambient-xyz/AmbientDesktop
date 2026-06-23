import type { RuntimeActivity } from "../../shared/threadTypes";
import { promptCacheUsageTokens } from "../../shared/promptCacheTelemetry";

type RuntimeStreamActivity = Extract<RuntimeActivity, { kind: "stream" }>;

export interface AssistantTerminalEventDiagnostic {
  eventType: string;
  stopReason?: string;
  responseId?: string;
  contentBlockCount?: number;
  finalTextChars?: number;
  error?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  };
}

export interface AssistantTerminalCleanupDiagnostic {
  reason: "assistant-terminal-before-prompt-resolved";
  cleanupAction: "abort-and-dispose-session";
  promptPendingMs: number;
  assistantTerminalGraceMs: number;
  outputChars: number;
  thinkingChars: number;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalTextChars: number;
  sessionFile?: string;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic;
}

export interface AssistantTerminalCleanupDiagnosticInput {
  nowMs: number;
  promptStartedAtMs: number;
  assistantTerminalGraceMs: number;
  outputChars: number;
  thinkingChars: number;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalTextChars: number;
  sessionFile?: string | undefined;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic | undefined;
}

export interface AssistantTerminalCleanupActivityInput {
  threadId: string;
  outputChars: number;
  thinkingChars: number;
  idleElapsedMs: number;
  idleTimeoutMs: number;
  diagnostic: AssistantTerminalCleanupDiagnostic;
}

export function assistantTerminalEventDiagnostic(event: any, finalText?: string, error?: string): AssistantTerminalEventDiagnostic | undefined {
  const message = event?.message;
  const usage = message?.usage && typeof message.usage === "object" ? message.usage : undefined;
  const usageTokens = promptCacheUsageTokens(usage);
  const content = Array.isArray(message?.content) ? message.content : undefined;
  const diagnostic: AssistantTerminalEventDiagnostic = {
    eventType: String(event?.type ?? "unknown"),
    ...(typeof message?.stopReason === "string" ? { stopReason: message.stopReason } : {}),
    ...(typeof message?.responseId === "string" ? { responseId: message.responseId } : {}),
    ...(content ? { contentBlockCount: content.length } : {}),
    ...(finalText !== undefined ? { finalTextChars: finalText.length } : {}),
    ...(error ? { error: error.slice(0, 240) } : {}),
    ...(usageTokens
      ? {
          usage: usageTokens,
        }
      : {}),
  };
  return diagnostic;
}

export function assistantTerminalCleanupDiagnostic(
  input: AssistantTerminalCleanupDiagnosticInput,
): AssistantTerminalCleanupDiagnostic {
  return {
    reason: "assistant-terminal-before-prompt-resolved",
    cleanupAction: "abort-and-dispose-session",
    promptPendingMs: Math.max(0, input.nowMs - input.promptStartedAtMs),
    assistantTerminalGraceMs: input.assistantTerminalGraceMs,
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    receivedAnyText: input.receivedAnyText,
    currentAssistantReceivedText: input.currentAssistantReceivedText,
    currentAssistantFinalTextChars: input.currentAssistantFinalTextChars,
    ...(input.sessionFile ? { sessionFile: input.sessionFile } : {}),
    ...(input.lastAssistantTerminalEvent ? { lastAssistantTerminalEvent: input.lastAssistantTerminalEvent } : {}),
  };
}

export function assistantTerminalCleanupActivity(input: AssistantTerminalCleanupActivityInput): RuntimeStreamActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "running",
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    idleElapsedMs: input.idleElapsedMs,
    idleTimeoutMs: input.idleTimeoutMs,
    message: "Ambient observed final assistant output before the Pi prompt promise resolved; finalizing the visible turn.",
    diagnostic: input.diagnostic,
  };
}
