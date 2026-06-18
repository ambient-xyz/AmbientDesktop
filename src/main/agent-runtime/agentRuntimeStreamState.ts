import type { AmbientStreamFailureKind } from "./agentRuntimeAmbientFacade";
import {
  piStreamStallTimeoutMessage,
  piStreamStartTimeoutMessage,
} from "./agentRuntimeTimeouts";
import type { RuntimeActivity } from "../../shared/threadTypes";
import type { PiStreamTraceReference } from "./provider-continuation/agentRuntimeProviderDiagnostics";

export interface RuntimePiStreamTimeoutActivityInput {
  threadId: string;
  outputChars: number;
  thinkingChars: number;
  timeoutMs: number;
  message: string;
  trace?: PiStreamTraceReference;
}

export interface RuntimePiStreamProgressActivityInput {
  threadId: string;
  outputChars: number;
  thinkingChars: number;
  idleElapsedMs: number;
  idleTimeoutMs: number;
}

export function runtimePiStreamFailureKind(piStreamEventCount: number): AmbientStreamFailureKind {
  return piStreamEventCount > 0 ? "stream_idle_timeout" : "pre_stream_timeout";
}

export function runtimePiStreamTimeoutMessage(
  piStreamEventCount: number,
  preStreamTimeoutMs: number,
  streamIdleTimeoutMs: number,
  streamWatchdogTimeoutMessage?: string,
): string {
  return streamWatchdogTimeoutMessage ??
    (piStreamEventCount > 0
      ? piStreamStallTimeoutMessage(streamIdleTimeoutMs)
      : piStreamStartTimeoutMessage(preStreamTimeoutMs));
}

export function runtimePiStreamTimeoutActivity(input: RuntimePiStreamTimeoutActivityInput): RuntimeActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "timeout",
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    idleElapsedMs: input.timeoutMs,
    idleTimeoutMs: input.timeoutMs,
    message: input.message,
    ...(input.trace ? { diagnostic: { trace: input.trace } } : {}),
  };
}

export function runtimePiStreamProgressActivity(input: RuntimePiStreamProgressActivityInput): RuntimeActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "running",
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    idleElapsedMs: input.idleElapsedMs,
    idleTimeoutMs: input.idleTimeoutMs,
  };
}
