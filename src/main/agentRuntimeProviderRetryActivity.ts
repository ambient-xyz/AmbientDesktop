import type { RuntimeActivity } from "../shared/types";

type RuntimeRetryActivity = Extract<RuntimeActivity, { kind: "retry" }>;

export interface RuntimeProviderRetryStartingActivityInput {
  threadId: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  message: string;
}

export interface RuntimeProviderRetryFinishedActivityInput {
  threadId: string;
  success: boolean;
  attempt: number;
  message?: string;
}

export function runtimeProviderRetryStartingActivity(
  input: RuntimeProviderRetryStartingActivityInput,
): RuntimeRetryActivity {
  return {
    threadId: input.threadId,
    kind: "retry",
    status: "starting",
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    delayMs: input.delayMs,
    message: input.message,
  };
}

export function runtimeProviderRetryFinishedActivity(
  input: RuntimeProviderRetryFinishedActivityInput,
): RuntimeRetryActivity {
  return {
    threadId: input.threadId,
    kind: "retry",
    status: "finished",
    success: input.success,
    attempt: input.attempt,
    message: input.message,
  };
}
