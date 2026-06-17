import { statSync } from "node:fs";

export const PI_SESSION_FILE_COMMIT_WAIT_MS = 500;
export const PI_SESSION_FILE_COMMIT_POLL_MS = 25;

export type PiSessionFileCommitReason =
  | "session-created"
  | "run-finished"
  | "compaction-finished"
  | "visible-transcript-recovery"
  | "model-changed"
  | "provider-continuation";

export interface PiSessionFileCommitWaitResult {
  committed: boolean;
  elapsedMs: number;
  sessionFile?: string;
  sessionFileExists: boolean;
}

export function piSessionFileExists(sessionFile: string | undefined): boolean {
  if (!sessionFile) return false;
  try {
    return statSync(sessionFile).isFile();
  } catch {
    return false;
  }
}

export async function waitForPiSessionFileCommit(
  sessionFile: string | undefined,
  options: {
    timeoutMs?: number;
    pollMs?: number;
  } = {},
): Promise<PiSessionFileCommitWaitResult> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, options.timeoutMs ?? PI_SESSION_FILE_COMMIT_WAIT_MS);
  const pollMs = Math.max(1, options.pollMs ?? PI_SESSION_FILE_COMMIT_POLL_MS);

  if (!sessionFile) {
    return {
      committed: false,
      elapsedMs: 0,
      sessionFile,
      sessionFileExists: false,
    };
  }

  while (true) {
    if (piSessionFileExists(sessionFile)) {
      return {
        committed: true,
        elapsedMs: Date.now() - startedAt,
        sessionFile,
        sessionFileExists: true,
      };
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      return {
        committed: false,
        elapsedMs,
        sessionFile,
        sessionFileExists: false,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, timeoutMs - elapsedMs)));
  }
}

export function piSessionFileCommitDiagnostic(input: {
  reason: PiSessionFileCommitReason;
  result: PiSessionFileCommitWaitResult;
  waitTimeoutMs?: number;
}): Record<string, unknown> {
  return {
    reason: input.reason,
    sessionFile: input.result.sessionFile,
    sessionFileCommitted: input.result.committed,
    sessionFileExists: input.result.sessionFileExists,
    waitedMs: input.result.elapsedMs,
    waitTimeoutMs: input.waitTimeoutMs ?? PI_SESSION_FILE_COMMIT_WAIT_MS,
  };
}
