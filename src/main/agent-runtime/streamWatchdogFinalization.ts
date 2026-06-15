import type { ChatStreamInterruptionDiagnostic } from "../agentRuntimeSendStreamDiagnostics";

export interface StreamWatchdogFinalizationInput {
  status: "aborted" | "error";
  currentAssistantVisibleContent: string;
  interruptionNotice: string;
  streamInterruptionDiagnostic: ChatStreamInterruptionDiagnostic;
}

export interface StreamWatchdogFinalizationMessage {
  content: string;
  metadata: Record<string, unknown>;
}

export function streamWatchdogFinalizationMessage(
  input: StreamWatchdogFinalizationInput,
): StreamWatchdogFinalizationMessage {
  const content = input.currentAssistantVisibleContent.trim()
    ? `${input.currentAssistantVisibleContent}\n\n${input.interruptionNotice}`
    : input.interruptionNotice;

  return {
    content,
    metadata: {
      status: input.status,
      runtime: "pi",
      provider: "ambient",
      piStreamInterruption: input.streamInterruptionDiagnostic,
    },
  };
}
