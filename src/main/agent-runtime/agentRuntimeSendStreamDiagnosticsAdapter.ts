import type { RuntimeAssistantMessageController } from "./runtimeAssistantMessageController";
import type { RuntimePromptControlState } from "./runtimePromptControlState";
import type { RuntimeProviderRetryState } from "./runtimeProviderRetryState";
import { createRuntimeSendStreamDiagnostics } from "./agentRuntimeSendStreamDiagnostics";
import type { RuntimeStreamActivityTracker } from "./runtimeStreamActivityTracker";
import type { RuntimeStreamTraceState } from "./runtimeStreamTraceState";
import type { RuntimeTextOutputState } from "./runtimeTextOutputState";
import type { PiStreamTraceReference } from "./provider-continuation/agentRuntimeProviderDiagnostics";

export interface AgentRuntimeSendStreamDiagnosticsAdapterInput {
  runId: string;
  threadId: string;
  recentEventLimit: number;
  streamTraceState: RuntimeStreamTraceState;
  getWorkspaceStatePath: () => string;
  updateRunDiagnostics: (diagnostics: { piStreamTrace: PiStreamTraceReference }) => void;
  streamActivity: RuntimeStreamActivityTracker;
  outputState: RuntimeTextOutputState;
  providerRetryState: RuntimeProviderRetryState;
  promptControlState: Pick<RuntimePromptControlState, "streamWatchdogTimeoutMessage">;
  toolMessageCount: () => number;
  getSessionFile: () => string | undefined;
  piPreStreamTimeoutMs: number;
  piStreamIdleTimeoutMs: number;
  runStartedAt: string;
  promptContentLength: () => number;
  runtimeMessages: Pick<RuntimeAssistantMessageController, "currentAssistantMessageId">;
  runtimeModel: string | undefined;
}

export function createAgentRuntimeSendStreamDiagnosticsAdapter(input: AgentRuntimeSendStreamDiagnosticsAdapterInput) {
  return createRuntimeSendStreamDiagnostics({
    runId: input.runId,
    threadId: input.threadId,
    recentEventLimit: input.recentEventLimit,
    recentEvents: input.streamTraceState.recentEvents(),
    getWorkspaceStatePath: input.getWorkspaceStatePath,
    getTraceReference: input.streamTraceState.traceReference,
    setTraceReference: input.streamTraceState.setTraceReference,
    updateRunDiagnostics: input.updateRunDiagnostics,
    getState: () => {
      const streamActivity = input.streamActivity.snapshot();
      const output = input.outputState.snapshot();
      const providerRetry = input.providerRetryState.snapshot();
      return {
        piStreamEventCount: streamActivity.eventCount,
        streamWatchdogTimeoutMessage: input.promptControlState.streamWatchdogTimeoutMessage(),
        piPreStreamTimeoutMs: input.piPreStreamTimeoutMs,
        piStreamIdleTimeoutMs: input.piStreamIdleTimeoutMs,
        runStartedAt: input.runStartedAt,
        assistantOutputChars: output.assistantOutputChars,
        thinkingOutputChars: output.thinkingOutputChars,
        currentAssistantFinalText: output.currentAssistantFinalText,
        currentThinkingFinalText: output.currentThinkingFinalText,
        receivedAnyText: output.receivedAnyText,
        currentAssistantReceivedText: output.currentAssistantReceivedText,
        currentThinkingReceivedText: output.currentThinkingReceivedText,
        toolMessageCount: input.toolMessageCount(),
        sessionFile: input.getSessionFile(),
        piPromptStartLine: input.streamTraceState.piPromptStartLine(),
        piPromptUserLine: input.streamTraceState.piPromptUserLine(),
        promptContentSha256: input.streamTraceState.promptContentSha256(),
        promptContentLength: input.promptContentLength(),
        currentAssistantMessageId: input.runtimeMessages.currentAssistantMessageId(),
        runtimeModel: input.runtimeModel,
        piStreamApproximatePayloadBytes: streamActivity.approximatePayloadBytes,
        firstPiStreamEventAt: streamActivity.firstEventAt,
        firstPiStreamEventType: streamActivity.firstEventType,
        lastPiStreamEventAt: streamActivity.lastEventAt,
        lastPiStreamEventType: streamActivity.lastEventType,
        firstAssistantVisibleTextAt: output.firstAssistantVisibleTextAt,
        firstToolArgumentAt: input.streamTraceState.firstToolArgumentAt(),
        firstToolExecutionStartedAt: input.streamTraceState.firstToolExecutionStartedAt(),
        providerRetryAttemptCount: providerRetry.providerRetryAttemptCount,
        providerRetryLastError: providerRetry.providerRetryLastError,
      };
    },
  });
}
