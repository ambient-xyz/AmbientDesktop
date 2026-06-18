import type { PermissionMode } from "../../shared/permissionTypes";
import type { SendMessageInput } from "../../shared/desktopTypes";
import type { ProviderContinuationState, ToolIntentSnapshot } from "../../shared/threadTypes";
import type { AmbientStreamFailureKind } from "./agentRuntimeAmbientFacade";
import type { RuntimeSessionRecoveryContext } from "../agent-runtime/agentRuntimeAssistantRetryInput";
import type {
  PiStreamTraceReference,
  RuntimeProviderErrorDiagnostic,
} from "./provider-continuation/agentRuntimeProviderDiagnostics";
import {
  buildProviderInterruptionContinuationInput,
  type ProviderInterruptionToolSnapshot,
} from "./provider-continuation/agentRuntimeProviderContinuationHelpers";
import {
  persistPreparedProviderInterruptionToolArguments,
} from "./provider-continuation/agentRuntimeProviderInterruptionArguments";
import type { InterruptedToolCallRecoveryTracker } from "./recovery/interruptedToolCallRecovery";
import type { ToolArgumentProgressTracker } from "./agentRuntimeToolRuntimeFacade";
import {
  createRuntimeProviderContinuationState,
} from "./providerContinuationState";
import {
  runtimeOpenProviderInterruptionToolSnapshots,
  type PersistPreparedProviderInterruptionArguments,
} from "./providerInterruptionToolSnapshots";
import type { RuntimeStreamActivitySnapshot } from "./runtimeStreamActivityTracker";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";

export interface RuntimeProviderContinuationContextStateInput {
  message: string;
  kind: AmbientStreamFailureKind;
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
}

export interface RuntimeProviderContinuationContextInput {
  baseInput: SendMessageInput;
  workspacePath: string;
  runId: string;
  threadId: string;
  runtimeModel: string;
  piPreStreamTimeoutMs: number;
  piStreamIdleTimeoutMs: number;
  assistantFinalizationRetryMaxRetries: number;
  toolMessages: RuntimeToolMessageController;
  toolArgumentProgress: ToolArgumentProgressTracker;
  interruptedToolCallRecovery: InterruptedToolCallRecoveryTracker;
  startedToolCallIds: ReadonlySet<string>;
  toolIntents: ReadonlyMap<string, ToolIntentSnapshot>;
  getPermissionMode: () => PermissionMode;
  getModel: () => string;
  getRetrySourceUserMessageId: () => string | undefined;
  getCurrentAssistantMessageId: () => string;
  getSessionFile: () => string | undefined;
  getPiStreamActivity: () => RuntimeStreamActivitySnapshot;
  getPiStreamTraceReference: () => PiStreamTraceReference | undefined;
  getFirstAssistantVisibleTextAt: () => string | undefined;
  getFirstToolArgumentAt: () => string | undefined;
  getFirstToolExecutionStartedAt: () => string | undefined;
  getAssistantOutputChars: () => number;
  getThinkingOutputChars: () => number;
  getCurrentAssistantFinalText: () => string;
  getReceivedAnyText: () => boolean;
  chatStreamSemanticOutputSeen: () => boolean;
  currentPiStreamIdleSource: (kind: AmbientStreamFailureKind) => string | undefined;
  assistantFinalizationRetryNextAttemptFor: (
    reason: "provider_interruption_continuation",
    recoveryStateId?: string,
  ) => number;
  sessionRecoveryForCurrentSession: (
    kind: RuntimeSessionRecoveryContext["kind"],
    reason: string,
    providerContinuationStateId?: string,
  ) => RuntimeSessionRecoveryContext;
  updateRunDiagnostics: (diagnostics: { providerContinuationState: ProviderContinuationState }) => void;
  persistPreparedArguments?: PersistPreparedProviderInterruptionArguments;
  nowMs?: () => number;
}

export interface RuntimeProviderContinuationContext {
  collectOpenProviderInterruptionToolSnapshots: () => ProviderInterruptionToolSnapshot[];
  createProviderContinuationState: (
    input: RuntimeProviderContinuationContextStateInput,
  ) => ProviderContinuationState;
  persistProviderContinuationState: (state: ProviderContinuationState) => ProviderContinuationState;
  createProviderInterruptionContinuationInput: (input: {
    message: string;
    diagnostic: RuntimeProviderErrorDiagnostic;
    tools: ProviderInterruptionToolSnapshot[];
    completedToolMessageCount: number;
    continuationState: ProviderContinuationState;
  }) => SendMessageInput;
}

export function createRuntimeProviderContinuationContext(
  input: RuntimeProviderContinuationContextInput,
): RuntimeProviderContinuationContext {
  const persistPreparedArguments = input.persistPreparedArguments ?? persistPreparedProviderInterruptionToolArguments;

  const collectOpenProviderInterruptionToolSnapshots = (): ProviderInterruptionToolSnapshot[] =>
    runtimeOpenProviderInterruptionToolSnapshots({
      toolCallIds: input.toolMessages.toolCallIds(),
      workspacePath: input.workspacePath,
      runId: input.runId,
      progressForToolCall: (toolCallId) => input.toolArgumentProgress.current(toolCallId),
      toolInputs: input.toolMessages.inputs(),
      toolRecoveryInputs: input.toolMessages.recoveryInputs(),
      toolLabels: input.toolMessages.labels(),
      startedToolCallIds: input.startedToolCallIds,
      toolIntents: input.toolIntents,
      persistPreparedArguments,
    });

  const createProviderContinuationState = (
    stateInput: RuntimeProviderContinuationContextStateInput,
  ): ProviderContinuationState => {
    const nowMs = input.nowMs?.() ?? Date.now();
    const streamActivity = input.getPiStreamActivity();
    const sessionFile = input.getSessionFile();
    const firstVisibleTextAt = input.getFirstAssistantVisibleTextAt();
    const firstToolArgumentAt = input.getFirstToolArgumentAt();
    const firstToolExecutionStartedAt = input.getFirstToolExecutionStartedAt();
    const traceReference = input.getPiStreamTraceReference();
    return createRuntimeProviderContinuationState({
      ...stateInput,
      nowMs,
      run: {
        runId: input.runId,
        threadId: input.threadId,
        assistantMessageId: input.getCurrentAssistantMessageId(),
        model: input.runtimeModel,
        ...(sessionFile ? { sessionFile } : {}),
      },
      stream: {
        eventCount: streamActivity.eventCount,
        approximatePayloadBytes: streamActivity.approximatePayloadBytes,
        preStreamTimeoutMs: input.piPreStreamTimeoutMs,
        streamIdleTimeoutMs: input.piStreamIdleTimeoutMs,
        ...(streamActivity.firstEventAt ? { firstEventAt: streamActivity.firstEventAt } : {}),
        ...(streamActivity.firstEventType ? { firstEventType: streamActivity.firstEventType } : {}),
        ...(streamActivity.lastEventAt ? { lastEventAt: streamActivity.lastEventAt } : {}),
        ...(streamActivity.lastEventType ? { lastEventType: streamActivity.lastEventType } : {}),
        idleSource: input.currentPiStreamIdleSource(stateInput.kind),
        ...(firstVisibleTextAt ? { firstVisibleTextAt } : {}),
        ...(firstToolArgumentAt ? { firstToolArgumentAt } : {}),
        ...(firstToolExecutionStartedAt ? { firstToolExecutionStartedAt } : {}),
        assistantOutputChars: input.getAssistantOutputChars(),
        thinkingOutputChars: input.getThinkingOutputChars(),
        currentAssistantFinalTextChars: input.getCurrentAssistantFinalText().length,
        semanticOutputSeen: input.chatStreamSemanticOutputSeen(),
        receivedAnyText: input.getReceivedAnyText(),
        ...(traceReference ? { trace: traceReference } : {}),
      },
      toolDiagnostics: input.toolArgumentProgress.diagnostics(nowMs),
      interruptedToolCallRecoveryDiagnostics: input.interruptedToolCallRecovery.diagnostics(nowMs),
      toolInputs: input.toolMessages.inputs(),
      toolIntents: input.toolIntents,
      toolMetadataFor: input.toolMessages.metadataFor,
    });
  };

  const persistProviderContinuationState = (state: ProviderContinuationState): ProviderContinuationState => {
    input.updateRunDiagnostics({ providerContinuationState: state });
    return state;
  };

  const createProviderInterruptionContinuationInput: RuntimeProviderContinuationContext["createProviderInterruptionContinuationInput"] = (
    continuationInput,
  ) => buildProviderInterruptionContinuationInput({
    baseInput: input.baseInput,
    permissionMode: input.getPermissionMode(),
    model: input.getModel(),
    retrySourceUserMessageId: input.getRetrySourceUserMessageId()!,
    attempt: input.assistantFinalizationRetryNextAttemptFor(
      "provider_interruption_continuation",
      continuationInput.continuationState.stateId,
    ),
    maxRetries: input.assistantFinalizationRetryMaxRetries,
    sessionRecovery: input.sessionRecoveryForCurrentSession(
      "provider_interruption_continuation",
      "Continuing after Ambient/Pi provider interruption using the existing Pi session file when available.",
      continuationInput.continuationState.stateId,
    ),
    message: continuationInput.message,
    diagnostic: continuationInput.diagnostic,
    tools: continuationInput.tools,
    completedToolMessageCount: continuationInput.completedToolMessageCount,
    hadVisibleAssistantOutput: input.chatStreamSemanticOutputSeen(),
    continuationState: continuationInput.continuationState,
  });

  return {
    collectOpenProviderInterruptionToolSnapshots,
    createProviderContinuationState,
    persistProviderContinuationState,
    createProviderInterruptionContinuationInput,
  };
}
