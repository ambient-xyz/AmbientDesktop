import type { DesktopEvent } from "../shared/types";
import { normalizePiEvent } from "./piEventMapper";

export interface ManualCompactionEventRecorder<TSession> {
  threadId: string;
  session: TSession;
  recordContextUsageSnapshot: (threadId: string, session: TSession, message?: string) => unknown;
  emit: (event: DesktopEvent) => void;
}

export interface ManualCompactionEventHandler {
  readonly runtimeError: string | undefined;
  handle(event: unknown): void;
}

export function createManualCompactionEventHandler<TSession>(
  input: ManualCompactionEventRecorder<TSession>,
): ManualCompactionEventHandler {
  let runtimeError: string | undefined;
  return {
    get runtimeError() {
      return runtimeError;
    },
    handle(event: unknown): void {
      const normalized = normalizePiEvent(event);
      if (normalized.kind === "compaction-start") {
        input.recordContextUsageSnapshot(input.threadId, input.session, "Manual compaction started.");
        input.emit({
          type: "runtime-activity",
          activity: {
            threadId: input.threadId,
            kind: "compaction",
            status: "starting",
            reason: normalized.reason,
          },
        });
      }
      if (normalized.kind === "compaction-end") {
        input.recordContextUsageSnapshot(input.threadId, input.session, normalized.error);
        input.emit({
          type: "runtime-activity",
          activity: {
            threadId: input.threadId,
            kind: "compaction",
            status: "finished",
            reason: normalized.reason,
            aborted: normalized.aborted,
            willRetry: normalized.willRetry,
            message: normalized.error,
          },
        });
        if (normalized.error && !normalized.aborted) runtimeError = normalized.error;
      }
    },
  };
}
