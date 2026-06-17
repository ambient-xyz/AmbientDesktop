import type { RuntimeActivity } from "../shared/types";
import type { PiStreamTraceReference } from "./agent-runtime/provider-continuation/agentRuntimeProviderDiagnostics";

export interface EmptyAssistantStallActivityInput {
  threadId: string;
  outputChars: number;
  thinkingChars: number;
  idleTimeoutMs: number;
  message: string;
  assistantStartCount: number;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalTextChars: number;
  streamEventCount: number;
  sessionFile?: string;
  trace?: PiStreamTraceReference;
}

export function emptyAssistantStallRuntimeActivity(input: EmptyAssistantStallActivityInput): RuntimeActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "timeout",
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    idleElapsedMs: input.idleTimeoutMs,
    idleTimeoutMs: input.idleTimeoutMs,
    message: input.message,
    diagnostic: {
      reason: "empty-assistant-stream-stall",
      assistantStartCount: input.assistantStartCount,
      receivedAnyText: input.receivedAnyText,
      currentAssistantReceivedText: input.currentAssistantReceivedText,
      currentAssistantFinalTextChars: input.currentAssistantFinalTextChars,
      streamEventCount: input.streamEventCount,
      ...(input.sessionFile ? { sessionFile: input.sessionFile } : {}),
      ...(input.trace ? { trace: input.trace } : {}),
    },
  };
}
