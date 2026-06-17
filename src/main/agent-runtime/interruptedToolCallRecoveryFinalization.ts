import type {
  InterruptedToolCallRecoverySnapshot,
  ProviderContinuationState,
} from "../../shared/types";
import { buildInterruptedToolCallRecoveryNotice } from "../interruptedToolCallRecovery";
import type { ChatStreamInterruptionDiagnostic } from "../agent-runtime/agentRuntimeSendStreamDiagnostics";

export interface InterruptedToolCallRecoveryFinalizationInput {
  message: string;
  snapshots: InterruptedToolCallRecoverySnapshot[];
  willContinue: boolean;
  continuationState: ProviderContinuationState;
  streamInterruptionDiagnostic: ChatStreamInterruptionDiagnostic;
  retryAttempt: number;
  maxRetries: number;
}

export interface InterruptedToolCallRecoveryFinalizationMessage {
  content: string;
  metadata: Record<string, unknown>;
}

export function interruptedToolCallRecoveryFinalizationMessage(
  input: InterruptedToolCallRecoveryFinalizationInput,
): InterruptedToolCallRecoveryFinalizationMessage {
  const recoveryNotice = buildInterruptedToolCallRecoveryNotice(input.message, input.snapshots);
  const content = input.willContinue
    ? `${recoveryNotice}\n\nAmbient is starting a continuation turn with the saved partial arguments.`
    : `${recoveryNotice}\n\nAmbient did not auto-continue because the continuation retry budget was already used.`;

  return {
    content,
    metadata: {
      status: input.willContinue ? "done" : "error",
      runtime: "pi",
      provider: "ambient",
      recoveringInterruptedToolCall: input.willContinue,
      providerContinuationState: input.continuationState,
      piStreamInterruption: {
        ...input.streamInterruptionDiagnostic,
        retryScheduled: input.willContinue,
        replaySafe: true,
        retryReason: "interrupted_tool_call_recovery",
        retryAttempt: input.retryAttempt,
        maxRetries: input.maxRetries,
        interruptedToolCallRecovery: {
          scheduled: input.willContinue,
          snapshots: input.snapshots,
        },
      },
    },
  };
}
