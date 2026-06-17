import type { DesktopEvent } from "../../shared/types";
import {
  approximateDiagnosticPayloadBytes,
  normalizedPiEventType,
} from "./provider-continuation/agentRuntimeProviderDiagnostics";
import { runtimePiStreamProgressActivity } from "../agentRuntimeStreamState";

export interface RuntimeStreamActivitySnapshot {
  eventCount: number;
  approximatePayloadBytes: number;
  firstEventAt?: string;
  firstEventType?: string;
  lastEventAt?: string;
  lastEventType?: string;
  lastActivityAtMs: number;
}

export interface RuntimeStreamActivityTrackerInput {
  threadId: string;
  idleTimeoutMs: number;
  progressThrottleMs: number;
  progressCharDelta: number;
  getOutputChars: () => number;
  getThinkingChars: () => number;
  resetStreamWatchdog: () => void;
  refreshEmptyAssistantStallWatchdog: () => void;
  resetAssistantTerminalCompletion: () => void;
  emitRunEvent: (event: DesktopEvent) => void;
  now?: () => number;
}

export interface RuntimeStreamActivityTracker {
  markActivity: (forceProgress?: boolean, event?: unknown) => void;
  snapshot: () => RuntimeStreamActivitySnapshot;
}

export function createRuntimeStreamActivityTracker(
  input: RuntimeStreamActivityTrackerInput,
): RuntimeStreamActivityTracker {
  const now = input.now ?? Date.now;
  let eventCount = 0;
  let approximatePayloadBytes = 0;
  let firstEventAt: string | undefined;
  let firstEventType: string | undefined;
  let lastEventAt: string | undefined;
  let lastEventType: string | undefined;
  let lastActivityAtMs = now();
  let lastProgressAt = 0;
  let lastProgressOutputChars = 0;
  let lastProgressThinkingChars = 0;

  const emitProgress = (force = false) => {
    const currentMs = now();
    const outputChars = input.getOutputChars();
    const thinkingChars = input.getThinkingChars();
    const outputDelta = Math.abs(outputChars - lastProgressOutputChars);
    const thinkingDelta = Math.abs(thinkingChars - lastProgressThinkingChars);
    if (
      !force &&
      currentMs - lastProgressAt < input.progressThrottleMs &&
      outputDelta < input.progressCharDelta &&
      thinkingDelta < input.progressCharDelta
    ) {
      return;
    }
    lastProgressAt = currentMs;
    lastProgressOutputChars = outputChars;
    lastProgressThinkingChars = thinkingChars;
    input.emitRunEvent({
      type: "runtime-activity",
      activity: runtimePiStreamProgressActivity({
        threadId: input.threadId,
        outputChars,
        thinkingChars,
        idleElapsedMs: Math.max(0, currentMs - lastActivityAtMs),
        idleTimeoutMs: input.idleTimeoutMs,
      }),
    });
  };

  const markActivity = (forceProgress = false, event?: unknown) => {
    const currentMs = now();
    const currentIso = new Date(currentMs).toISOString();
    eventCount += 1;
    firstEventAt = firstEventAt ?? currentIso;
    lastActivityAtMs = currentMs;
    lastEventAt = currentIso;
    const eventType = normalizedPiEventType(event);
    if (eventType) {
      firstEventType = firstEventType ?? eventType;
      lastEventType = eventType;
    }
    approximatePayloadBytes += approximateDiagnosticPayloadBytes(event);
    input.resetStreamWatchdog();
    input.refreshEmptyAssistantStallWatchdog();
    input.resetAssistantTerminalCompletion();
    emitProgress(forceProgress);
  };

  const snapshot = (): RuntimeStreamActivitySnapshot => ({
    eventCount,
    approximatePayloadBytes,
    ...(firstEventAt ? { firstEventAt } : {}),
    ...(firstEventType ? { firstEventType } : {}),
    ...(lastEventAt ? { lastEventAt } : {}),
    ...(lastEventType ? { lastEventType } : {}),
    lastActivityAtMs,
  });

  return {
    markActivity,
    snapshot,
  };
}
