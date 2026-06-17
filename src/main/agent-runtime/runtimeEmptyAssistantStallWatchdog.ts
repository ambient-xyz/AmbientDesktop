import type { DesktopEvent } from "../../shared/types";
import { emptyAssistantStallRuntimeActivity } from "../agentRuntimeEmptyAssistantStallActivity";
import type { PiStreamTraceReference } from "./provider-continuation/agentRuntimeProviderDiagnostics";
import { piStreamStallTimeoutMessage } from "../agentRuntimeTimeouts";

export interface RuntimeEmptyAssistantStallWatchdogState {
  outputChars: number;
  thinkingChars: number;
  assistantStartCount: number;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalText: string;
  streamEventCount: number;
  sessionFile?: string;
}

export interface RuntimeEmptyAssistantStallWatchdogInput {
  threadId: string;
  idleTimeoutMs: number;
  isRunStoreActive: () => boolean;
  isStreamTimedOut: () => boolean;
  markStreamTimedOut: () => void;
  setStreamTimeoutMessage: (message: string) => void;
  persistPiStreamTrace: (message: string) => PiStreamTraceReference | undefined;
  getState: () => RuntimeEmptyAssistantStallWatchdogState;
  abortSessionRun: () => void;
  signalStreamWatchdogTimeout: () => void;
  emitRunEvent: (event: DesktopEvent) => void;
  setTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface RuntimeEmptyAssistantStallWatchdog {
  clear: () => void;
  schedule: () => void;
  refreshOnStreamActivity: () => void;
}

function hasAssistantText(state: RuntimeEmptyAssistantStallWatchdogState): boolean {
  return state.currentAssistantReceivedText || Boolean(state.currentAssistantFinalText.trim());
}

export function createRuntimeEmptyAssistantStallWatchdog(
  input: RuntimeEmptyAssistantStallWatchdogInput,
): RuntimeEmptyAssistantStallWatchdog {
  const scheduleTimeout = input.setTimeout ?? setTimeout;
  const clearScheduledTimeout = input.clearTimeout ?? clearTimeout;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (idleTimer) clearScheduledTimeout(idleTimer);
    idleTimer = undefined;
  };

  const schedule = () => {
    clear();
    if (hasAssistantText(input.getState())) return;
    idleTimer = scheduleTimeout(() => {
      idleTimer = undefined;
      const state = input.getState();
      if (!input.isRunStoreActive() || input.isStreamTimedOut() || hasAssistantText(state)) return;
      input.markStreamTimedOut();
      const message = piStreamStallTimeoutMessage(input.idleTimeoutMs);
      input.setStreamTimeoutMessage(message);
      const trace = input.persistPiStreamTrace(message);
      input.emitRunEvent({
        type: "runtime-activity",
        activity: emptyAssistantStallRuntimeActivity({
          threadId: input.threadId,
          outputChars: state.outputChars,
          thinkingChars: state.thinkingChars,
          idleTimeoutMs: input.idleTimeoutMs,
          message,
          assistantStartCount: state.assistantStartCount,
          receivedAnyText: state.receivedAnyText,
          currentAssistantReceivedText: state.currentAssistantReceivedText,
          currentAssistantFinalTextChars: state.currentAssistantFinalText.length,
          streamEventCount: state.streamEventCount,
          ...(state.sessionFile ? { sessionFile: state.sessionFile } : {}),
          ...(trace ? { trace } : {}),
        }),
      });
      input.abortSessionRun();
      input.signalStreamWatchdogTimeout();
    }, input.idleTimeoutMs);
  };

  const refreshOnStreamActivity = () => {
    if (!idleTimer) return;
    if (hasAssistantText(input.getState())) return;
    schedule();
  };

  return {
    clear,
    schedule,
    refreshOnStreamActivity,
  };
}
