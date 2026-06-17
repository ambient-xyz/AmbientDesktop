import type { ProviderContinuationState } from "../../shared/types";
import {
  buildProviderInterruptionContinuationNotice,
  type ProviderInterruptionDiagnostic,
  type ProviderInterruptionToolSnapshot,
} from "./provider-continuation/agentRuntimeProviderContinuationHelpers";
import type { ChatStreamInterruptionDiagnostic } from "../agentRuntimeSendStreamDiagnostics";

export interface ProviderInterruptionFinalizationInput {
  currentAssistantVisibleContent: string;
  message: string;
  diagnostic: ProviderInterruptionDiagnostic;
  tools: ProviderInterruptionToolSnapshot[];
  completedToolMessageCount: number;
  attempt: number;
  maxRetries: number;
  willContinue: boolean;
  continuationSetupError?: string | undefined;
  retryBudgetReason?: "incomplete_tool_argument_stream" | undefined;
  continuationState: ProviderContinuationState;
  streamInterruptionDiagnostic: ChatStreamInterruptionDiagnostic;
}

export interface ProviderInterruptionFinalizationMessage {
  content: string;
  metadata: Record<string, unknown>;
}

export interface ProviderInterruptionRecoveryFailureFinalizationInput {
  currentAssistantVisibleContent: string;
  interruptionNotice: string;
  streamInterruptionDiagnostic: ChatStreamInterruptionDiagnostic;
}

export function providerInterruptionFinalizationMessage(
  input: ProviderInterruptionFinalizationInput,
): ProviderInterruptionFinalizationMessage {
  const continuationMessage = input.continuationSetupError
    ? `${input.message}\nContinuation setup failed: ${input.continuationSetupError}`
    : input.message;
  const continuationNotice = buildProviderInterruptionContinuationNotice({
    message: continuationMessage,
    diagnostic: input.diagnostic,
    tools: input.tools,
    completedToolMessageCount: input.completedToolMessageCount,
    attempt: input.attempt,
    maxRetries: input.maxRetries,
    continuationScheduled: input.willContinue,
  });
  const continuationBudgetNotice = !input.willContinue
    ? [
        "",
        input.continuationSetupError
          ? `Ambient could not schedule the provider continuation: ${input.continuationSetupError}`
          : "Ambient stopped instead of retrying again because the provider repeatedly stalled before completing tool arguments.",
        !input.continuationSetupError && input.retryBudgetReason === "incomplete_tool_argument_stream"
          ? "The interrupted tool calls only reached incomplete argument streams, so replaying the same continuation is unlikely to make forward progress."
          : undefined,
      ].filter(Boolean).join("\n")
    : "";
  const content = input.currentAssistantVisibleContent.trim()
    ? `${input.currentAssistantVisibleContent}\n\n${continuationNotice}${continuationBudgetNotice}`
    : `${continuationNotice}${continuationBudgetNotice}`;

  return {
    content,
    metadata: {
      status: input.willContinue ? "done" : "error",
      runtime: "pi",
      provider: "ambient",
      retryingProviderError: input.willContinue,
      providerInterruptionContinuation: true,
      providerContinuationState: input.continuationState,
      piStreamInterruption: {
        ...input.streamInterruptionDiagnostic,
        ...(input.continuationSetupError ? { continuationSetupError: input.continuationSetupError } : {}),
      },
    },
  };
}

export function providerInterruptionRecoveryFailureFinalizationMessage(
  input: ProviderInterruptionRecoveryFailureFinalizationInput,
): ProviderInterruptionFinalizationMessage {
  const content = input.currentAssistantVisibleContent.trim()
    ? `${input.currentAssistantVisibleContent}\n\n${input.interruptionNotice}`
    : input.interruptionNotice;

  return {
    content,
    metadata: {
      status: "error",
      runtime: "pi",
      provider: "ambient",
      providerInterruptionContinuation: true,
      piStreamInterruption: input.streamInterruptionDiagnostic,
    },
  };
}
