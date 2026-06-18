import { randomUUID } from "node:crypto";

import type { InterruptedToolCallRecoveryDiagnostics, InterruptedToolCallRecoverySnapshot, ProviderContinuationState, ProviderContinuationToolState, ToolArgumentProgressSnapshot, ToolArgumentStreamDiagnostics, ToolIntentSnapshot } from "../../shared/threadTypes";
import type { ProviderInterruptionToolSnapshot } from "./provider-continuation/agentRuntimeProviderContinuationHelpers";
import { compactToolInputPreview } from "./provider-continuation/agentRuntimeProviderDiagnostics";
import type { PiStreamTraceReference } from "./provider-continuation/agentRuntimeProviderDiagnostics";
import { stringMetadata } from "./tools/agentRuntimeToolMessageMetadata";

export type RuntimeProviderContinuationToolMaps = {
  toolInputs: ReadonlyMap<string, string>;
  toolIntents: ReadonlyMap<string, ToolIntentSnapshot>;
  toolMetadataFor: (toolCallId: string) => Record<string, unknown>;
};

export type RuntimeProviderContinuationToolProgressInput = RuntimeProviderContinuationToolMaps & {
  progress: ToolArgumentProgressSnapshot;
  interruptedToolCallIds?: ReadonlySet<string>;
  failureReason?: string;
  recoverySnapshots?: ReadonlyMap<string, InterruptedToolCallRecoverySnapshot>;
};

export type RuntimeProviderContinuationOpenSnapshotInput = RuntimeProviderContinuationToolMaps & {
  snapshot: ProviderInterruptionToolSnapshot;
  failureReason: string;
};

export type RuntimeProviderContinuationStateInput = RuntimeProviderContinuationToolMaps & {
  message: string;
  kind: string;
  retryScheduled: boolean;
  replaySafe: boolean;
  continuationSafe?: boolean;
  retryUsesFreshSession?: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  retryReason?: string;
  retryDelayMs?: number;
  openToolCalls?: ProviderInterruptionToolSnapshot[];
  completedToolMessageCount: number;
  receivedAnyText?: boolean;
  stateId?: string;
  nowMs?: number;
  run: {
    runId: string;
    threadId: string;
    assistantMessageId: string;
    model: string;
    sessionFile?: string;
  };
  stream: {
    eventCount: number;
    approximatePayloadBytes: number;
    preStreamTimeoutMs: number;
    streamIdleTimeoutMs: number;
    firstEventAt?: string;
    firstEventType?: string;
    lastEventAt?: string;
    lastEventType?: string;
    idleSource?: string;
    firstVisibleTextAt?: string;
    firstToolArgumentAt?: string;
    firstToolExecutionStartedAt?: string;
    assistantOutputChars: number;
    thinkingOutputChars: number;
    currentAssistantFinalTextChars: number;
    semanticOutputSeen: boolean;
    receivedAnyText: boolean;
    trace?: PiStreamTraceReference;
  };
  toolDiagnostics: Pick<ToolArgumentStreamDiagnostics, "active" | "completed">;
  interruptedToolCallRecoveryDiagnostics?: Pick<InterruptedToolCallRecoveryDiagnostics, "active" | "completed">;
};

export function runtimeProviderContinuationToolStateFromProgress({
  progress,
  interruptedToolCallIds,
  failureReason,
  recoverySnapshots,
  toolInputs,
  toolIntents,
  toolMetadataFor,
}: RuntimeProviderContinuationToolProgressInput): ProviderContinuationToolState {
  const interrupted = interruptedToolCallIds?.has(progress.toolCallId) ?? false;
  const executionStarted = Boolean(progress.executionStartedAt);
  const metadata = toolMetadataFor(progress.toolCallId);
  const recovery = recoverySnapshots?.get(progress.toolCallId);
  const status: ProviderContinuationToolState["status"] =
    interrupted
      ? "interrupted"
      : progress.phase === "completed"
        ? "completed"
        : executionStarted
          ? "started"
          : progress.argumentComplete
            ? "prepared"
            : "preparing";
  const certainty: ProviderContinuationToolState["certainty"] =
    progress.phase === "completed"
      ? "completed"
      : executionStarted
        ? "started_unknown"
        : progress.argumentComplete
          ? "prepared_only"
          : "preparing";
  const inputContent = toolInputs.get(progress.toolCallId);
  return {
    version: 1,
    toolCallId: progress.toolCallId,
    toolName: progress.toolName,
    status,
    certainty,
    phase: progress.phase,
    executionStarted,
    mayHaveSideEffects: executionStarted || progress.phase === "completed",
    argumentComplete: progress.argumentComplete,
    inputChars: Math.max(inputContent?.length ?? 0, progress.inputChars),
    observedArgumentChars: progress.observedArgumentChars,
    ...(compactToolInputPreview(inputContent) ? { inputPreview: compactToolInputPreview(inputContent) } : {}),
    ...(stringMetadata(metadata.artifactPath) ? { artifactPath: stringMetadata(metadata.artifactPath) } : {}),
    ...(progress.argumentStartedAt ? { argumentStartedAt: progress.argumentStartedAt } : {}),
    ...(progress.argumentUpdatedAt ? { argumentUpdatedAt: progress.argumentUpdatedAt } : {}),
    ...(progress.executionStartedAt ? { executionStartedAt: progress.executionStartedAt } : {}),
    ...(progress.executionCompletedAt ? { executionCompletedAt: progress.executionCompletedAt } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(recovery?.argumentPath ? { recoveryArgumentPath: recovery.argumentPath } : {}),
    ...(recovery?.workspaceRelativeArgumentPath ? { workspaceRelativeRecoveryArgumentPath: recovery.workspaceRelativeArgumentPath } : {}),
    ...(toolIntents.get(progress.toolCallId) ? { intent: toolIntents.get(progress.toolCallId) } : {}),
  };
}

export function runtimeProviderContinuationToolStateFromOpenSnapshot({
  snapshot,
  failureReason,
  toolMetadataFor,
}: RuntimeProviderContinuationOpenSnapshotInput): ProviderContinuationToolState {
  const metadata = toolMetadataFor(snapshot.toolCallId);
  return {
    version: 1,
    toolCallId: snapshot.toolCallId,
    toolName: snapshot.toolName,
    status: "interrupted",
    certainty: snapshot.certainty,
    phase: snapshot.executionStarted ? "execution" : "argument_stream",
    executionStarted: snapshot.executionStarted,
    mayHaveSideEffects: snapshot.executionStarted,
    argumentComplete: snapshot.argumentComplete,
    inputChars: snapshot.inputChars,
    observedArgumentChars: snapshot.inputChars,
    ...(snapshot.inputPreview ? { inputPreview: snapshot.inputPreview } : {}),
    ...(stringMetadata(metadata.artifactPath) ? { artifactPath: stringMetadata(metadata.artifactPath) } : {}),
    ...(snapshot.recoveryArgumentPath ? { recoveryArgumentPath: snapshot.recoveryArgumentPath } : {}),
    ...(snapshot.workspaceRelativeRecoveryArgumentPath
      ? { workspaceRelativeRecoveryArgumentPath: snapshot.workspaceRelativeRecoveryArgumentPath }
      : {}),
    ...(snapshot.executionStartedAt ? { executionStartedAt: snapshot.executionStartedAt } : {}),
    ...(snapshot.intent ? { intent: snapshot.intent } : {}),
    failureReason,
  };
}

export function createRuntimeProviderContinuationState(input: RuntimeProviderContinuationStateInput): ProviderContinuationState {
  const nowMs = input.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();
  const recoverySnapshots = new Map(
    [
      ...(input.interruptedToolCallRecoveryDiagnostics?.active ?? []),
      ...(input.interruptedToolCallRecoveryDiagnostics?.completed ?? []),
    ].map((snapshot) => [snapshot.toolCallId, snapshot]),
  );
  const interruptedToolCallIds = new Set(input.openToolCalls?.map((tool) => tool.toolCallId) ?? []);
  const stateByToolCallId = new Map<string, ProviderContinuationToolState>();
  const pushState = (state: ProviderContinuationToolState) => stateByToolCallId.set(state.toolCallId, state);
  for (const progress of input.toolDiagnostics.completed) {
    pushState(runtimeProviderContinuationToolStateFromProgress({
      progress,
      recoverySnapshots,
      toolInputs: input.toolInputs,
      toolIntents: input.toolIntents,
      toolMetadataFor: input.toolMetadataFor,
    }));
  }
  for (const progress of input.toolDiagnostics.active) {
    pushState(runtimeProviderContinuationToolStateFromProgress({
      progress,
      interruptedToolCallIds,
      failureReason: interruptedToolCallIds.has(progress.toolCallId) ? input.message : undefined,
      recoverySnapshots,
      toolInputs: input.toolInputs,
      toolIntents: input.toolIntents,
      toolMetadataFor: input.toolMetadataFor,
    }));
  }
  for (const snapshot of input.openToolCalls ?? []) {
    const snapshotState = runtimeProviderContinuationToolStateFromOpenSnapshot({
      snapshot,
      failureReason: input.message,
      toolInputs: input.toolInputs,
      toolIntents: input.toolIntents,
      toolMetadataFor: input.toolMetadataFor,
    });
    const existing = stateByToolCallId.get(snapshot.toolCallId);
    if (existing) {
      pushState({
        ...existing,
        ...(snapshotState.recoveryArgumentPath ? { recoveryArgumentPath: snapshotState.recoveryArgumentPath } : {}),
        ...(snapshotState.workspaceRelativeRecoveryArgumentPath
          ? { workspaceRelativeRecoveryArgumentPath: snapshotState.workspaceRelativeRecoveryArgumentPath }
          : {}),
      });
    } else {
      pushState(snapshotState);
    }
  }
  const all = [...stateByToolCallId.values()];
  return {
    version: 1,
    stateId: input.stateId ?? `provider-continuation-${randomUUID()}`,
    createdAt: now,
    runId: input.run.runId,
    threadId: input.run.threadId,
    assistantMessageId: input.run.assistantMessageId,
    provider: "ambient",
    model: input.run.model,
    failure: {
      kind: input.kind,
      message: input.message,
    },
    retry: {
      scheduled: input.retryScheduled,
      replaySafe: input.replaySafe,
      ...(input.continuationSafe !== undefined ? { continuationSafe: input.continuationSafe } : {}),
      ...(input.retryUsesFreshSession !== undefined ? { usesFreshSession: input.retryUsesFreshSession } : {}),
      ...(input.retryAttempt !== undefined ? { attempt: input.retryAttempt } : {}),
      ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
      ...(input.retryReason ? { reason: input.retryReason } : {}),
      ...(input.retryDelayMs !== undefined ? { delayMs: input.retryDelayMs } : {}),
    },
    stream: {
      eventCount: input.stream.eventCount,
      approximatePayloadBytes: input.stream.approximatePayloadBytes,
      preStreamTimeoutMs: input.stream.preStreamTimeoutMs,
      streamIdleTimeoutMs: input.stream.streamIdleTimeoutMs,
      ...(input.stream.firstEventAt ? { firstEventAt: input.stream.firstEventAt } : {}),
      ...(input.stream.firstEventType ? { firstEventType: input.stream.firstEventType } : {}),
      ...(input.stream.lastEventAt ? { lastEventAt: input.stream.lastEventAt } : {}),
      ...(input.stream.lastEventType ? { lastEventType: input.stream.lastEventType } : {}),
      ...(input.stream.idleSource ? { idleSource: input.stream.idleSource } : {}),
      ...(input.stream.firstVisibleTextAt ? { firstVisibleTextAt: input.stream.firstVisibleTextAt } : {}),
      ...(input.stream.firstToolArgumentAt ? { firstToolArgumentAt: input.stream.firstToolArgumentAt } : {}),
      ...(input.stream.firstToolExecutionStartedAt ? { firstToolExecutionStartedAt: input.stream.firstToolExecutionStartedAt } : {}),
      assistantOutputChars: input.stream.assistantOutputChars,
      thinkingOutputChars: input.stream.thinkingOutputChars,
      currentAssistantFinalTextChars: input.stream.currentAssistantFinalTextChars,
      semanticOutputSeen: input.stream.semanticOutputSeen,
      receivedAnyText: input.receivedAnyText ?? input.stream.receivedAnyText,
      ...(input.stream.trace ? { trace: input.stream.trace } : {}),
    },
    assistant: {
      messageId: input.run.assistantMessageId,
      hasVisibleOutput: input.stream.semanticOutputSeen,
      outputChars: input.stream.assistantOutputChars,
      thinkingChars: input.stream.thinkingOutputChars,
    },
    tools: {
      all,
      open: all.filter((tool) => tool.status !== "completed" && tool.status !== "failed"),
      completed: all.filter((tool) => tool.status === "completed"),
      interrupted: all.filter((tool) => tool.status === "interrupted"),
      mayHaveSideEffects: all.filter((tool) => tool.mayHaveSideEffects),
      completedToolMessageCount: input.completedToolMessageCount,
    },
    ...(input.run.sessionFile ? { sessionFile: input.run.sessionFile } : {}),
  };
}
