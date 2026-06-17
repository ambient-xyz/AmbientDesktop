import type { RuntimeActivity } from "../../../shared/types";
import type { SubagentParentControlAbortIntent } from "../tools/agentRuntimeToolMessageMetadata";

type RuntimeStreamActivity = Extract<RuntimeActivity, { kind: "stream" }>;

export interface RuntimeSubagentParentControlAbortActivityInput {
  threadId: string;
  outputChars: number;
  thinkingChars: number;
  intent: SubagentParentControlAbortIntent;
}

export interface RuntimeSubagentDirectChildStoppedActivityInput {
  threadId: string;
  canonicalTaskPath: string;
}

export interface RuntimeSubagentParentStopCascadeActivityInput {
  threadId: string;
  cancelledRunCount: number;
  detachedRunCount: number;
  changedRunCount: number;
}

export function runtimeSubagentParentControlAbortActivity(
  input: RuntimeSubagentParentControlAbortActivityInput,
): RuntimeStreamActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "running",
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    message: input.intent.message,
    diagnostic: {
      reason: "subagent_parent_control_cancel_parent",
      toolCallId: input.intent.toolCallId,
      parentRunId: input.intent.parentRunId,
      waitBarrierId: input.intent.waitBarrierId,
      idempotencyKey: input.intent.idempotencyKey,
      decision: input.intent.decision,
    },
  };
}

export function runtimeSubagentDirectChildStoppedActivity(
  input: RuntimeSubagentDirectChildStoppedActivityInput,
): RuntimeStreamActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "running",
    outputChars: 0,
    message: `Stopped sub-agent child ${input.canonicalTaskPath}; sibling children continue.`,
  };
}

export function runtimeSubagentParentStopCascadeActivity(
  input: RuntimeSubagentParentStopCascadeActivityInput,
): RuntimeStreamActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "running",
    outputChars: 0,
    message: `Stopped parent run cascaded to ${input.cancelledRunCount} cancelled and ${input.detachedRunCount} detached sub-agent child thread${input.changedRunCount === 1 ? "" : "s"}.`,
  };
}
