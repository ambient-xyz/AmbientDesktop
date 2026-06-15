import type {
  InterruptedToolCallRecoverySnapshot,
  MessageDelivery,
  PermissionMode,
  SendMessageInput,
} from "../shared/types";
import { buildInterruptedToolCallRecoveryPrompt } from "./interruptedToolCallRecovery";
import type { RuntimeSessionRecoveryContext } from "./agentRuntimeAssistantRetryInput";

export interface InterruptedToolCallRecoveryState {
  attempt: number;
  maxRetries: number;
  sourceToolCallIds: string[];
}

export type InterruptedToolCallRecoverySendInput =
  Pick<
    SendMessageInput,
    | "threadId"
    | "content"
    | "permissionMode"
    | "collaborationMode"
    | "model"
    | "thinkingLevel"
    | "context"
    | "workflowThreadId"
    | "preserveActiveThread"
  > & {
    visibleUserContent: string;
    modelContentOverride: string;
    delivery: Extract<MessageDelivery, "follow-up">;
    internal: true;
    sessionRecovery: RuntimeSessionRecoveryContext;
    interruptedToolCallRecovery: InterruptedToolCallRecoveryState;
  };

export function buildInterruptedToolCallRecoveryInput(input: {
  baseInput: SendMessageInput;
  permissionMode: PermissionMode;
  sessionRecovery: RuntimeSessionRecoveryContext;
  attempt: number;
  maxRetries: number;
  snapshots: InterruptedToolCallRecoverySnapshot[];
}): InterruptedToolCallRecoverySendInput {
  const content = buildInterruptedToolCallRecoveryPrompt(input.snapshots);
  return {
    threadId: input.baseInput.threadId,
    content,
    visibleUserContent: "Continue the interrupted tool call from the saved partial arguments.",
    modelContentOverride: content,
    permissionMode: input.permissionMode,
    collaborationMode: input.baseInput.collaborationMode,
    model: input.baseInput.model,
    thinkingLevel: input.baseInput.thinkingLevel,
    delivery: "follow-up",
    preserveActiveThread: true,
    internal: true,
    sessionRecovery: input.sessionRecovery,
    ...(input.baseInput.context?.length ? { context: input.baseInput.context } : {}),
    ...(input.baseInput.workflowThreadId ? { workflowThreadId: input.baseInput.workflowThreadId } : {}),
    interruptedToolCallRecovery: {
      attempt: input.attempt,
      maxRetries: input.maxRetries,
      sourceToolCallIds: input.snapshots.map((snapshot) => snapshot.toolCallId),
    },
  };
}
