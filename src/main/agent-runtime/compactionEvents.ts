import type { RuntimeActivity } from "../../shared/threadTypes";
import {
  runtimeCompactionFinishedActivity,
  runtimeCompactionStartingActivity,
} from "../agent-runtime/agentRuntimeCompactionActivity";
import type { NormalizedPiEvent } from "./agentRuntimePiFacade";

type RuntimeCompactionActivity = Extract<RuntimeActivity, { kind: "compaction" }>;
export type RuntimeCompactionEvent = Extract<NormalizedPiEvent, { kind: "compaction-start" | "compaction-end" }>;

export interface RuntimeCompactionEventContext {
  threadId: string;
}

export type RuntimeCompactionRuntimeErrorAction =
  | { kind: "set"; message: string }
  | { kind: "preserve" };

export type RuntimeCompactionEventModel =
  | {
      kind: "start";
      snapshotMessage: string;
      runtimeError: RuntimeCompactionRuntimeErrorAction;
      activeRunStatus: "compacting";
      activity: RuntimeCompactionActivity;
    }
  | {
      kind: "end";
      snapshotMessage?: string | undefined;
      runtimeError: RuntimeCompactionRuntimeErrorAction;
      activeRunStatus?: "streaming";
      activity: RuntimeCompactionActivity;
    };

export function runtimeCompactionEventModel(
  input: RuntimeCompactionEvent,
  context: RuntimeCompactionEventContext,
): RuntimeCompactionEventModel {
  if (input.kind === "compaction-start") {
    return {
      kind: "start",
      snapshotMessage: "Compaction started.",
      runtimeError: { kind: "preserve" },
      activeRunStatus: "compacting",
      activity: runtimeCompactionStartingActivity({
        threadId: context.threadId,
        reason: input.reason,
      }),
    };
  }

  return {
    kind: "end",
    snapshotMessage: input.error,
    runtimeError: compactionEndRuntimeErrorAction(input),
    ...(!input.aborted ? { activeRunStatus: "streaming" as const } : {}),
    activity: runtimeCompactionFinishedActivity({
      threadId: context.threadId,
      reason: input.reason,
      aborted: input.aborted,
      willRetry: input.willRetry,
      message: input.error,
    }),
  };
}

function compactionEndRuntimeErrorAction(
  input: Extract<RuntimeCompactionEvent, { kind: "compaction-end" }>,
): RuntimeCompactionRuntimeErrorAction {
  if (input.error && !input.willRetry && !input.aborted) {
    return { kind: "set", message: input.error };
  }
  return { kind: "preserve" };
}
