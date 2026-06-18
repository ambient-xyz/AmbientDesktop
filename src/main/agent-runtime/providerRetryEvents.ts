import type { RuntimeActivity } from "../../shared/threadTypes";
import type { NormalizedPiEvent } from "./agentRuntimePiFacade";
import {
  runtimeProviderRetryFinishedActivity,
  runtimeProviderRetryStartingActivity,
} from "./provider-continuation/agentRuntimeProviderRetryActivity";

type RuntimeRetryActivity = Extract<RuntimeActivity, { kind: "retry" }>;
export type RuntimeProviderRetryEvent = Extract<NormalizedPiEvent, { kind: "auto-retry-start" | "auto-retry-end" }>;

export interface RuntimeProviderRetryEventContext {
  threadId: string;
  providerRetryAttemptCount: number;
  providerRetryLastError?: string | undefined;
  providerRetryBeforeVisibleOutput: boolean;
  providerRetryRecovered: boolean;
  receivedAnyText: boolean;
  assistantOutputChars: number;
  thinkingOutputChars: number;
  activeToolMessageCount: number;
}

export type RuntimeProviderRetryRuntimeErrorAction =
  | { kind: "clear" }
  | { kind: "set"; message: string }
  | { kind: "preserve" };

export type RuntimeProviderRetryEventModel =
  | {
      kind: "start";
      providerRetryAttemptCount: number;
      providerRetryLastError: string;
      providerRetryBeforeVisibleOutput: boolean;
      providerRetryRecovered: boolean;
      runtimeError: RuntimeProviderRetryRuntimeErrorAction;
      activeRunStatus: "retrying";
      activity: RuntimeRetryActivity;
    }
  | {
      kind: "end";
      providerRetryAttemptCount: number;
      providerRetryLastError?: string | undefined;
      providerRetryBeforeVisibleOutput: boolean;
      providerRetryRecovered: boolean;
      runtimeError: RuntimeProviderRetryRuntimeErrorAction;
      activeRunStatus?: "streaming";
      activity: RuntimeRetryActivity;
    };

export function runtimeProviderRetryEventModel(
  input: RuntimeProviderRetryEvent,
  context: RuntimeProviderRetryEventContext,
): RuntimeProviderRetryEventModel {
  if (input.kind === "auto-retry-start") {
    return {
      kind: "start",
      providerRetryAttemptCount: Math.max(context.providerRetryAttemptCount, input.attempt),
      providerRetryLastError: input.error,
      providerRetryBeforeVisibleOutput: context.providerRetryBeforeVisibleOutput || hasNoVisibleRuntimeOutput(context),
      providerRetryRecovered: context.providerRetryRecovered,
      runtimeError: { kind: "clear" },
      activeRunStatus: "retrying",
      activity: runtimeProviderRetryStartingActivity({
        threadId: context.threadId,
        attempt: input.attempt,
        maxAttempts: input.maxAttempts,
        delayMs: input.delayMs,
        message: input.error,
      }),
    };
  }

  const providerRetryRecovered = context.providerRetryRecovered || input.success;
  return {
    kind: "end",
    providerRetryAttemptCount: Math.max(context.providerRetryAttemptCount, input.attempt),
    providerRetryLastError: input.error || context.providerRetryLastError,
    providerRetryBeforeVisibleOutput: context.providerRetryBeforeVisibleOutput,
    providerRetryRecovered,
    runtimeError: retryEndRuntimeErrorAction(input.success, input.error),
    ...(input.success ? { activeRunStatus: "streaming" as const } : {}),
    activity: runtimeProviderRetryFinishedActivity({
      threadId: context.threadId,
      success: input.success,
      attempt: input.attempt,
      message: input.error,
    }),
  };
}

function hasNoVisibleRuntimeOutput(context: RuntimeProviderRetryEventContext): boolean {
  return (
    !context.receivedAnyText &&
    context.assistantOutputChars === 0 &&
    context.thinkingOutputChars === 0 &&
    context.activeToolMessageCount === 0
  );
}

function retryEndRuntimeErrorAction(
  success: boolean,
  error: string | undefined,
): RuntimeProviderRetryRuntimeErrorAction {
  if (success) return { kind: "clear" };
  if (error) return { kind: "set", message: error };
  return { kind: "preserve" };
}
