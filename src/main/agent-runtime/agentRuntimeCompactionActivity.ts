import type { RuntimeActivity } from "../../shared/types";

type RuntimeCompactionActivity = Extract<RuntimeActivity, { kind: "compaction" }>;
type RuntimeCompactionStartingActivity = Extract<RuntimeCompactionActivity, { status: "starting" }>;
type RuntimeCompactionFinishedActivity = Extract<RuntimeCompactionActivity, { status: "finished" }>;
type RuntimeCompactionReason = RuntimeCompactionActivity["reason"];

export interface RuntimeCompactionStartingActivityInput {
  threadId: string;
  reason: RuntimeCompactionReason;
}

export interface RuntimeCompactionFinishedActivityInput {
  threadId: string;
  reason: RuntimeCompactionReason;
  aborted: boolean;
  willRetry: boolean;
  message?: string;
}

export function runtimeCompactionStartingActivity(
  input: RuntimeCompactionStartingActivityInput,
): RuntimeCompactionStartingActivity {
  return {
    threadId: input.threadId,
    kind: "compaction",
    status: "starting",
    reason: input.reason,
  };
}

export function runtimeCompactionFinishedActivity(
  input: RuntimeCompactionFinishedActivityInput,
): RuntimeCompactionFinishedActivity {
  return {
    threadId: input.threadId,
    kind: "compaction",
    status: "finished",
    reason: input.reason,
    aborted: input.aborted,
    willRetry: input.willRetry,
    message: input.message,
  };
}
