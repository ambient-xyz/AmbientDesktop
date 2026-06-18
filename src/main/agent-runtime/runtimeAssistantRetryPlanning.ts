import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { InterruptedToolCallRecoverySnapshot } from "../../shared/threadTypes";
import type { PiSessionFileCommitReason } from "../session/sessionFileCommit";
import {
  assistantFinalizationRetryAttemptsUsedForReason,
  buildAssistantFinalizationRetryInput,
  buildRuntimeSessionRecoveryContext,
  type AssistantFinalizationRetryReason,
  type AssistantFinalizationRetrySendInput,
  type AssistantFinalizationRetryState,
  type RuntimeSessionRecoveryContext,
} from "../agent-runtime/agentRuntimeAssistantRetryInput";
import {
  buildInterruptedToolCallRecoveryInput,
  type InterruptedToolCallRecoverySendInput,
} from "../agent-runtime/agentRuntimeInterruptedToolRecoveryInput";

export interface RuntimeAssistantRetryPlanningInput {
  baseInput: SendMessageInput;
  threadId: string;
  usesDedicatedReviewSession: boolean;
  activeAssistantFinalizationRetry?: AssistantFinalizationRetryState | undefined;
  assistantFinalizationRetryMaxRetries: number;
  retrySourceUserMessageId?: string | undefined;
  interruptedToolCallRecoveryAttemptsUsed: number;
  interruptedToolCallRecoveryMaxRetries: number;
  getPermissionMode: () => PermissionMode;
  getCurrentSessionFile: () => string | undefined;
  getCurrentThreadPiSessionFile: () => string | null | undefined;
  shouldUseCurrentSessionForRetry?: (() => boolean) | undefined;
  commitThreadPiSessionFile: (input: {
    threadId: string;
    sessionFile: string;
    currentPiSessionFile?: string | null | undefined;
    reason: PiSessionFileCommitReason;
    emit: (event: DesktopEvent) => void;
  }) => Promise<unknown>;
  emit: (event: DesktopEvent) => void;
  fileExists?: ((path: string) => boolean) | undefined;
}

export interface RuntimeAssistantRetryPlanning {
  assistantFinalizationRetryAttemptsUsedFor: (
    reason: AssistantFinalizationRetryReason,
    recoveryStateId?: string,
  ) => number;
  assistantFinalizationRetryNextAttemptFor: (
    reason: AssistantFinalizationRetryReason,
    recoveryStateId?: string,
  ) => number;
  canScheduleAssistantFinalizationRetryFor: (
    reason: AssistantFinalizationRetryReason,
    recoveryStateId?: string,
  ) => boolean;
  sessionRecoveryForCurrentSession: (
    kind: RuntimeSessionRecoveryContext["kind"],
    reason: string,
    providerContinuationStateId?: string,
  ) => RuntimeSessionRecoveryContext;
  persistCurrentSessionPointerForRetry: (reason: PiSessionFileCommitReason) => Promise<void>;
  createAssistantFinalizationRetryInput: (
    reason: AssistantFinalizationRetryReason,
    sessionRecovery?: RuntimeSessionRecoveryContext,
    recoveryStateId?: string,
  ) => AssistantFinalizationRetrySendInput;
  createInterruptedToolCallRecoveryInput: (
    snapshots: InterruptedToolCallRecoverySnapshot[],
  ) => InterruptedToolCallRecoverySendInput;
}

export function createRuntimeAssistantRetryPlanning(
  input: RuntimeAssistantRetryPlanningInput,
): RuntimeAssistantRetryPlanning {
  const assistantFinalizationRetryAttemptsUsedFor = (
    reason: AssistantFinalizationRetryReason,
    recoveryStateId?: string,
  ) => assistantFinalizationRetryAttemptsUsedForReason(
    input.activeAssistantFinalizationRetry,
    reason,
    input.assistantFinalizationRetryMaxRetries,
    recoveryStateId,
  );
  const assistantFinalizationRetryNextAttemptFor = (
    reason: AssistantFinalizationRetryReason,
    recoveryStateId?: string,
  ) => assistantFinalizationRetryAttemptsUsedFor(reason, recoveryStateId) + 1;
  const canScheduleAssistantFinalizationRetryFor = (
    reason: AssistantFinalizationRetryReason,
    recoveryStateId?: string,
  ) => Boolean(input.retrySourceUserMessageId) &&
    assistantFinalizationRetryAttemptsUsedFor(reason, recoveryStateId) < input.assistantFinalizationRetryMaxRetries;
  const sessionRecoveryForCurrentSession = (
    kind: RuntimeSessionRecoveryContext["kind"],
    reason: string,
    providerContinuationStateId?: string,
  ): RuntimeSessionRecoveryContext => {
    const previousSessionFile = input.shouldUseCurrentSessionForRetry?.() === false
      ? undefined
      : input.getCurrentSessionFile();
    return buildRuntimeSessionRecoveryContext({
      kind,
      reason,
      ...(previousSessionFile ? { previousSessionFile } : {}),
      ...(providerContinuationStateId ? { providerContinuationStateId } : {}),
      ...(input.fileExists ? { fileExists: input.fileExists } : {}),
    });
  };

  return {
    assistantFinalizationRetryAttemptsUsedFor,
    assistantFinalizationRetryNextAttemptFor,
    canScheduleAssistantFinalizationRetryFor,
    sessionRecoveryForCurrentSession,
    persistCurrentSessionPointerForRetry: async (reason) => {
      if (input.usesDedicatedReviewSession) return;
      const sessionFile = input.getCurrentSessionFile();
      if (!sessionFile) return;
      const currentPiSessionFile = input.getCurrentThreadPiSessionFile();
      if (currentPiSessionFile === sessionFile) return;
      await input.commitThreadPiSessionFile({
        threadId: input.threadId,
        sessionFile,
        currentPiSessionFile,
        reason,
        emit: input.emit,
      });
    },
    createAssistantFinalizationRetryInput: (reason, sessionRecovery, recoveryStateId) =>
      buildAssistantFinalizationRetryInput({
        baseInput: input.baseInput,
        permissionMode: input.getPermissionMode(),
        retrySourceUserMessageId: input.retrySourceUserMessageId as string,
        attempt: assistantFinalizationRetryNextAttemptFor(reason, recoveryStateId),
        maxRetries: input.assistantFinalizationRetryMaxRetries,
        reason,
        ...(sessionRecovery ? { sessionRecovery } : {}),
        ...(recoveryStateId ? { recoveryStateId } : {}),
      }),
    createInterruptedToolCallRecoveryInput: (snapshots) =>
      buildInterruptedToolCallRecoveryInput({
        baseInput: input.baseInput,
        permissionMode: input.getPermissionMode(),
        sessionRecovery: sessionRecoveryForCurrentSession(
          "interrupted_tool_call_recovery",
          "Continuing after Ambient/Pi interrupted while preparing tool arguments.",
        ),
        attempt: input.interruptedToolCallRecoveryAttemptsUsed + 1,
        maxRetries: input.interruptedToolCallRecoveryMaxRetries,
        snapshots,
      }),
  };
}
