import type { SendMessageInput } from "../../shared/types";
import type { ToolArgumentProgressTracker } from "../tool-runtime/toolArgumentProgress";
import type { InterruptedToolCallRecoveryTracker } from "../interruptedToolCallRecovery";
import type { RuntimeAssistantMessageController } from "./runtimeAssistantMessageController";
import {
  createRuntimeProviderContinuationContext,
  type RuntimeProviderContinuationContext,
  type RuntimeProviderContinuationContextInput,
} from "./runtimeProviderContinuationContext";
import type { RuntimeStreamActivityTracker } from "./runtimeStreamActivityTracker";
import type { RuntimeStreamTraceState } from "./runtimeStreamTraceState";
import type { RuntimeTextOutputState } from "./runtimeTextOutputState";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";

export interface RuntimeProviderContinuationSetupInput {
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
  toolIntents: RuntimeProviderContinuationContextInput["toolIntents"];
  runtimeMessages: RuntimeAssistantMessageController;
  outputState: RuntimeTextOutputState;
  streamActivity: RuntimeStreamActivityTracker;
  streamTraceState: RuntimeStreamTraceState;
  getPermissionMode: RuntimeProviderContinuationContextInput["getPermissionMode"];
  getModel: RuntimeProviderContinuationContextInput["getModel"];
  getRetrySourceUserMessageId: RuntimeProviderContinuationContextInput["getRetrySourceUserMessageId"];
  getSessionFile: RuntimeProviderContinuationContextInput["getSessionFile"];
  chatStreamSemanticOutputSeen: RuntimeProviderContinuationContextInput["chatStreamSemanticOutputSeen"];
  currentPiStreamIdleSource: RuntimeProviderContinuationContextInput["currentPiStreamIdleSource"];
  assistantFinalizationRetryNextAttemptFor: RuntimeProviderContinuationContextInput["assistantFinalizationRetryNextAttemptFor"];
  sessionRecoveryForCurrentSession: RuntimeProviderContinuationContextInput["sessionRecoveryForCurrentSession"];
  updateRunDiagnostics: RuntimeProviderContinuationContextInput["updateRunDiagnostics"];
  createProviderContinuationContext?: typeof createRuntimeProviderContinuationContext;
}

export function createRuntimeProviderContinuationSetup(
  input: RuntimeProviderContinuationSetupInput,
): RuntimeProviderContinuationContext {
  return (input.createProviderContinuationContext ?? createRuntimeProviderContinuationContext)({
    baseInput: input.baseInput,
    workspacePath: input.workspacePath,
    runId: input.runId,
    threadId: input.threadId,
    runtimeModel: input.runtimeModel,
    piPreStreamTimeoutMs: input.piPreStreamTimeoutMs,
    piStreamIdleTimeoutMs: input.piStreamIdleTimeoutMs,
    assistantFinalizationRetryMaxRetries: input.assistantFinalizationRetryMaxRetries,
    toolMessages: input.toolMessages,
    toolArgumentProgress: input.toolArgumentProgress,
    interruptedToolCallRecovery: input.interruptedToolCallRecovery,
    startedToolCallIds: input.startedToolCallIds,
    toolIntents: input.toolIntents,
    getPermissionMode: input.getPermissionMode,
    getModel: input.getModel,
    getRetrySourceUserMessageId: input.getRetrySourceUserMessageId,
    getCurrentAssistantMessageId: input.runtimeMessages.currentAssistantMessageId,
    getSessionFile: input.getSessionFile,
    getPiStreamActivity: input.streamActivity.snapshot,
    getPiStreamTraceReference: input.streamTraceState.traceReference,
    getFirstAssistantVisibleTextAt: input.outputState.firstAssistantVisibleTextAt,
    getFirstToolArgumentAt: input.streamTraceState.firstToolArgumentAt,
    getFirstToolExecutionStartedAt: input.streamTraceState.firstToolExecutionStartedAt,
    getAssistantOutputChars: input.outputState.assistantOutputChars,
    getThinkingOutputChars: input.outputState.thinkingOutputChars,
    getCurrentAssistantFinalText: input.outputState.currentAssistantFinalText,
    getReceivedAnyText: input.outputState.receivedAnyText,
    chatStreamSemanticOutputSeen: input.chatStreamSemanticOutputSeen,
    currentPiStreamIdleSource: input.currentPiStreamIdleSource,
    assistantFinalizationRetryNextAttemptFor: input.assistantFinalizationRetryNextAttemptFor,
    sessionRecoveryForCurrentSession: input.sessionRecoveryForCurrentSession,
    updateRunDiagnostics: input.updateRunDiagnostics,
  });
}
