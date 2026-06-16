import type { SendMessageInput } from "../../shared/types";

export interface RuntimeSendPendingFollowUpsSnapshot {
  pendingPlannerRepairFollowUp?: SendMessageInput | undefined;
  pendingEmptyResponseRetry?: SendMessageInput | undefined;
  pendingInterruptedToolCallRecoveryFollowUp?: SendMessageInput | undefined;
  pendingProviderInterruptionContinuation?: SendMessageInput | undefined;
  pendingEmptyResponseRetryDelayMs: number;
}

export interface RuntimeSendPendingFollowUps {
  pendingEmptyResponseRetryDelayMs: () => number;
  setPendingPlannerRepairFollowUp: (followUp: SendMessageInput | undefined) => void;
  setPendingEmptyResponseRetry: (followUp: SendMessageInput | undefined) => void;
  setPendingInterruptedToolCallRecoveryFollowUp: (followUp: SendMessageInput | undefined) => void;
  setPendingProviderInterruptionContinuation: (followUp: SendMessageInput | undefined) => void;
  applyPromptSuccess: (result: {
    pendingEmptyResponseRetry?: SendMessageInput | undefined;
    pendingPlannerRepairFollowUp?: SendMessageInput | undefined;
  }) => void;
  snapshot: () => RuntimeSendPendingFollowUpsSnapshot;
}

export function createRuntimeSendPendingFollowUps(input: {
  emptyResponseRetryDelayMs: number;
}): RuntimeSendPendingFollowUps {
  let pendingPlannerRepairFollowUp: SendMessageInput | undefined;
  let pendingEmptyResponseRetry: SendMessageInput | undefined;
  let pendingInterruptedToolCallRecoveryFollowUp: SendMessageInput | undefined;
  let pendingProviderInterruptionContinuation: SendMessageInput | undefined;

  return {
    pendingEmptyResponseRetryDelayMs: () => input.emptyResponseRetryDelayMs,
    setPendingPlannerRepairFollowUp: (followUp) => {
      pendingPlannerRepairFollowUp = followUp;
    },
    setPendingEmptyResponseRetry: (followUp) => {
      pendingEmptyResponseRetry = followUp;
    },
    setPendingInterruptedToolCallRecoveryFollowUp: (followUp) => {
      pendingInterruptedToolCallRecoveryFollowUp = followUp;
    },
    setPendingProviderInterruptionContinuation: (followUp) => {
      pendingProviderInterruptionContinuation = followUp;
    },
    applyPromptSuccess: (result) => {
      pendingEmptyResponseRetry = result.pendingEmptyResponseRetry;
      pendingPlannerRepairFollowUp = result.pendingPlannerRepairFollowUp;
    },
    snapshot: () => ({
      pendingPlannerRepairFollowUp,
      pendingEmptyResponseRetry,
      pendingInterruptedToolCallRecoveryFollowUp,
      pendingProviderInterruptionContinuation,
      pendingEmptyResponseRetryDelayMs: input.emptyResponseRetryDelayMs,
    }),
  };
}
