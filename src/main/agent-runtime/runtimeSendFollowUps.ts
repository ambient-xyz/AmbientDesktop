import type { SendMessageInput } from "../../shared/types";

export interface RuntimeSendFollowUpHooks {
  awaitInternalRetryCompletion?: boolean;
}

export interface RuntimeSendFollowUpSchedulingInput {
  shouldEmitQueueClear: boolean;
  threadId: string;
  workspacePath: string;
  plannerRepairFollowUp?: SendMessageInput | undefined;
  interruptedToolCallRecoveryFollowUp?: SendMessageInput | undefined;
  providerInterruptionContinuation?: SendMessageInput | undefined;
  emptyResponseRetry?: SendMessageInput | undefined;
  emptyResponseRetryDelayMs: number;
  awaitInternalRetryCompletion: boolean;
  schedulePlannerDurableRepairFollowUp: (followUp: SendMessageInput, workspacePath: string) => void;
  send: (followUp: SendMessageInput, hooks?: RuntimeSendFollowUpHooks) => Promise<void>;
  emitError: (message: string, threadId: string, workspacePath: string) => void;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  sleep: (delayMs: number) => Promise<void>;
}

export interface RuntimeSendFollowUpSchedulingResult {
  hasPendingInternalFollowUp: boolean;
  scheduledFollowUpCount: number;
  awaitedEmptyResponseRetry: boolean;
}

export async function scheduleRuntimeSendFollowUps(
  input: RuntimeSendFollowUpSchedulingInput,
): Promise<RuntimeSendFollowUpSchedulingResult> {
  const hasPendingInternalFollowUp = Boolean(
    input.plannerRepairFollowUp ||
    input.interruptedToolCallRecoveryFollowUp ||
    input.providerInterruptionContinuation ||
    input.emptyResponseRetry,
  );
  if (!input.shouldEmitQueueClear) {
    return {
      hasPendingInternalFollowUp,
      scheduledFollowUpCount: 0,
      awaitedEmptyResponseRetry: false,
    };
  }

  let scheduledFollowUpCount = 0;
  if (input.plannerRepairFollowUp) {
    input.schedulePlannerDurableRepairFollowUp(input.plannerRepairFollowUp, input.workspacePath);
    scheduledFollowUpCount += 1;
  }
  if (input.interruptedToolCallRecoveryFollowUp) {
    scheduleSendFollowUp(input, input.interruptedToolCallRecoveryFollowUp, 0, "Interrupted tool-call recovery follow-up failed");
    scheduledFollowUpCount += 1;
  }
  if (input.providerInterruptionContinuation) {
    scheduleSendFollowUp(input, input.providerInterruptionContinuation, 0, "Provider interruption continuation failed");
    scheduledFollowUpCount += 1;
  }
  if (input.emptyResponseRetry) {
    if (input.awaitInternalRetryCompletion) {
      if (input.emptyResponseRetryDelayMs > 0) await input.sleep(input.emptyResponseRetryDelayMs);
      await input.send(input.emptyResponseRetry, { awaitInternalRetryCompletion: true });
      scheduledFollowUpCount += 1;
      return {
        hasPendingInternalFollowUp,
        scheduledFollowUpCount,
        awaitedEmptyResponseRetry: true,
      };
    }
    scheduleSendFollowUp(input, input.emptyResponseRetry, input.emptyResponseRetryDelayMs, "Assistant retry failed");
    scheduledFollowUpCount += 1;
  }

  return {
    hasPendingInternalFollowUp,
    scheduledFollowUpCount,
    awaitedEmptyResponseRetry: false,
  };
}

export function runtimeSendFollowUpSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function scheduleSendFollowUp(
  input: RuntimeSendFollowUpSchedulingInput,
  followUp: SendMessageInput,
  delayMs: number,
  failurePrefix: string,
): void {
  input.setTimeout(() => {
    void input.send(followUp).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      input.emitError(`${failurePrefix}: ${message}`, input.threadId, input.workspacePath);
    });
  }, delayMs);
}
