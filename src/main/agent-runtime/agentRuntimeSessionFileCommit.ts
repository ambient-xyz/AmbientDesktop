import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  PI_SESSION_FILE_COMMIT_WAIT_MS,
  piSessionFileCommitDiagnostic,
  waitForPiSessionFileCommit,
  type PiSessionFileCommitReason,
  type PiSessionFileCommitWaitResult,
} from "../session/sessionFileCommit";

export interface AgentRuntimeThreadPiSessionFileCommitInput {
  threadId: string;
  sessionFile?: string;
  currentPiSessionFile?: string | null;
  reason: PiSessionFileCommitReason;
  emit: (event: DesktopEvent) => void;
}

export interface AgentRuntimeThreadPiSessionFileCommitDeps {
  updateThreadSettings: (threadId: string, settings: { piSessionFile: string }) => ThreadSummary;
  waitForCommit?: (sessionFile: string) => Promise<PiSessionFileCommitWaitResult>;
}

export async function commitAgentRuntimeThreadPiSessionFile(
  input: AgentRuntimeThreadPiSessionFileCommitInput,
  deps: AgentRuntimeThreadPiSessionFileCommitDeps,
): Promise<ThreadSummary | undefined> {
  if (!input.sessionFile || input.sessionFile === input.currentPiSessionFile) return undefined;

  const result = await (deps.waitForCommit ?? waitForPiSessionFileCommit)(input.sessionFile);
  if (!result.committed) {
    input.emit({
      type: "runtime-activity",
      activity: {
        threadId: input.threadId,
        kind: "stream",
        status: "running",
        outputChars: 0,
        idleElapsedMs: result.elapsedMs,
        idleTimeoutMs: PI_SESSION_FILE_COMMIT_WAIT_MS,
        message:
          "Pi session file is still committing; Ambient kept the previous session pointer and will retry after more session activity.",
        diagnostic: piSessionFileCommitDiagnostic({
          reason: input.reason,
          result,
          waitTimeoutMs: PI_SESSION_FILE_COMMIT_WAIT_MS,
        }),
      },
    });
    return undefined;
  }

  const thread = deps.updateThreadSettings(input.threadId, { piSessionFile: input.sessionFile });
  input.emit({ type: "thread-updated", thread });
  return thread;
}
