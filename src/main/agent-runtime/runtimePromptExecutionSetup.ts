import type { DesktopEvent } from "../../shared/desktopTypes";
import type { RuntimeAssistantTerminalCompletion } from "./runtimeAssistantTerminalCompletion";
import type { RuntimePromptControlState } from "./runtimePromptControlState";
import {
  createRuntimePromptExecutionController,
  type RuntimePromptExecutionController,
  type RuntimePromptExecutionControllerInput,
  type RuntimePromptExecutionSession,
} from "./runtimePromptExecutionController";
import type { RuntimePromptRunState } from "./runtimePromptRunState";
import type { RuntimeStreamTraceState } from "./runtimeStreamTraceState";
import type { RuntimeTextOutputState } from "./runtimeTextOutputState";

export interface RuntimePromptExecutionSetupInput {
  threadId: string;
  session: RuntimePromptExecutionSession;
  promptContent: string;
  images: unknown[];
  promptControlState: Pick<RuntimePromptControlState, "isStreamTimedOut">;
  streamTimeoutMessage: () => string;
  streamTraceState: Pick<RuntimeStreamTraceState, "recordPromptStart">;
  assistantTerminalCompletion: Pick<RuntimeAssistantTerminalCompletion, "graceMs">;
  outputState: Pick<
    RuntimeTextOutputState,
    | "assistantOutputChars"
    | "thinkingOutputChars"
    | "receivedAnyText"
    | "currentAssistantReceivedText"
    | "currentAssistantFinalText"
  >;
  streamIdleTimeoutMs: number;
  abortGraceMs: number;
  promptRunState: Pick<
    RuntimePromptRunState,
    | "lastAssistantTerminalEvent"
    | "markAssistantTerminalCleanupInProgress"
    | "setAssistantTerminalCleanupDiagnostic"
  >;
  abortSessionRun: RuntimePromptExecutionControllerInput["abortSessionRun"];
  removeActiveSessionIfCurrent: RuntimePromptExecutionControllerInput["removeActiveSessionIfCurrent"];
  emitRunEvent: (event: DesktopEvent) => void;
  createPromptExecutionController?: (
    input: RuntimePromptExecutionControllerInput,
  ) => RuntimePromptExecutionController;
}

export function createRuntimePromptExecutionSetup(
  input: RuntimePromptExecutionSetupInput,
): RuntimePromptExecutionController {
  const createPromptExecutionController =
    input.createPromptExecutionController ?? createRuntimePromptExecutionController;
  return createPromptExecutionController({
    threadId: input.threadId,
    session: input.session,
    promptContent: input.promptContent,
    images: input.images,
    isStreamTimedOut: input.promptControlState.isStreamTimedOut,
    streamTimeoutMessage: input.streamTimeoutMessage,
    recordPromptStart: input.streamTraceState.recordPromptStart,
    assistantTerminalGraceMs: input.assistantTerminalCompletion.graceMs,
    outputChars: input.outputState.assistantOutputChars,
    thinkingChars: input.outputState.thinkingOutputChars,
    receivedAnyText: input.outputState.receivedAnyText,
    currentAssistantReceivedText: input.outputState.currentAssistantReceivedText,
    currentAssistantFinalTextChars: () => input.outputState.currentAssistantFinalText().length,
    streamIdleTimeoutMs: input.streamIdleTimeoutMs,
    abortGraceMs: input.abortGraceMs,
    lastAssistantTerminalEvent: input.promptRunState.lastAssistantTerminalEvent,
    markCleanupInProgress: input.promptRunState.markAssistantTerminalCleanupInProgress,
    setAssistantTerminalCleanupDiagnostic: input.promptRunState.setAssistantTerminalCleanupDiagnostic,
    abortSessionRun: input.abortSessionRun,
    removeActiveSessionIfCurrent: input.removeActiveSessionIfCurrent,
    emitRunEvent: input.emitRunEvent,
  });
}
