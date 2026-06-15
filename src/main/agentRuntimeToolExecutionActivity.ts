import type { RuntimeActivity } from "../shared/types";

type RuntimeToolActivity = Extract<RuntimeActivity, { kind: "tool" }>;

export interface RuntimeToolExecutionRunningActivityInput {
  threadId: string;
  toolName: string;
  idleTimeoutMs: number;
}

export interface RuntimeToolExecutionTimeoutActivityInput {
  threadId: string;
  toolCallId: string;
  toolName: string;
  idleElapsedMs: number;
  idleTimeoutMs: number;
  startedAtMs: number;
  lastActivityAtMs: number;
}

export function runtimeToolExecutionTimeoutMessage(toolName: string, idleTimeoutMs: number): string {
  return `Local tool ${toolName} stalled after ${idleTimeoutMs}ms without progress. Ambient stopped this turn so the tool can be retried or inspected.`;
}

export function runtimeToolExecutionRunningActivity(input: RuntimeToolExecutionRunningActivityInput): RuntimeToolActivity {
  return {
    threadId: input.threadId,
    kind: "tool",
    status: "running",
    toolName: input.toolName,
    message: `Running local tool ${input.toolName}.`,
    idleElapsedMs: 0,
    idleTimeoutMs: input.idleTimeoutMs,
  };
}

export function runtimeToolExecutionTimeoutActivity(input: RuntimeToolExecutionTimeoutActivityInput): RuntimeToolActivity {
  return {
    threadId: input.threadId,
    kind: "tool",
    status: "timeout",
    toolName: input.toolName,
    message: runtimeToolExecutionTimeoutMessage(input.toolName, input.idleTimeoutMs),
    idleElapsedMs: input.idleElapsedMs,
    idleTimeoutMs: input.idleTimeoutMs,
    diagnostic: {
      toolCallId: input.toolCallId,
      startedAtMs: input.startedAtMs,
      lastActivityAtMs: input.lastActivityAtMs,
    },
  };
}
