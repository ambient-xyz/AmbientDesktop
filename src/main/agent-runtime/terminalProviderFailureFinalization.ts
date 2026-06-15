import type { RuntimeProviderErrorDiagnostic } from "../agentRuntimeProviderDiagnostics";
import type { ChatStreamInterruptionDiagnostic } from "../agentRuntimeSendStreamDiagnostics";
import type { SubagentParentControlAbortIntent } from "../agentRuntimeToolMessageMetadata";

export interface TerminalProviderFailureFinalizationInput {
  status: "aborted" | "error";
  abortRequested: boolean;
  abortMessage: string;
  providerErrorContent: string;
  providerErrorDiagnostic?: RuntimeProviderErrorDiagnostic | undefined;
  streamInterruptionDiagnostic?: ChatStreamInterruptionDiagnostic | undefined;
  subagentParentControlAbortIntent?: SubagentParentControlAbortIntent | undefined;
}

export interface TerminalProviderFailureFinalizationMessage {
  content: string;
  metadata: Record<string, unknown>;
}

export function terminalProviderFailureFinalizationMessage(
  input: TerminalProviderFailureFinalizationInput,
): TerminalProviderFailureFinalizationMessage {
  return {
    content: input.abortRequested ? input.abortMessage : input.providerErrorContent,
    metadata: {
      status: input.status,
      runtime: "pi",
      provider: "ambient",
      ...(input.subagentParentControlAbortIntent ? { subagentParentControlAbort: input.subagentParentControlAbortIntent } : {}),
      ...(input.abortRequested
        ? {}
        : {
            providerErrorDiagnostic: input.providerErrorDiagnostic,
            piStreamInterruption: input.streamInterruptionDiagnostic,
          }),
    },
  };
}
