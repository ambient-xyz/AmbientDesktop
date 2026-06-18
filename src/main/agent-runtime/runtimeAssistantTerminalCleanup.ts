import type { DesktopEvent } from "../../shared/desktopTypes";
import {
  assistantTerminalCleanupActivity,
  assistantTerminalCleanupDiagnostic,
  type AssistantTerminalCleanupDiagnostic,
  type AssistantTerminalEventDiagnostic,
} from "../agent-runtime/agentRuntimeAssistantTerminalDiagnostics";
import { withTimeout } from "../agent-runtime/agentRuntimeTimeouts";

export interface RuntimeAssistantTerminalCleanupSession {
  sessionFile?: string;
  dispose(): void;
}

export interface RuntimeAssistantTerminalCleanupInput {
  threadId: string;
  promptStartedAtMs: number;
  assistantTerminalGraceMs: number;
  outputChars: number;
  thinkingChars: number;
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalTextChars: number;
  streamIdleTimeoutMs: number;
  abortGraceMs: number;
  session: RuntimeAssistantTerminalCleanupSession;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic;
  promptCompletion: Promise<unknown>;
  pendingCompletion?: Promise<unknown>;
  now?: () => number;
  markCleanupInProgress?: () => void;
  abortSessionRun: (session: RuntimeAssistantTerminalCleanupSession, threadId: string) => Promise<void>;
  removeActiveSessionIfCurrent: (session: RuntimeAssistantTerminalCleanupSession) => void;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimeAssistantTerminalCleanupResult {
  diagnostic: AssistantTerminalCleanupDiagnostic;
}

export async function finalizeRuntimeAssistantTerminalCleanup(
  input: RuntimeAssistantTerminalCleanupInput,
): Promise<RuntimeAssistantTerminalCleanupResult> {
  const diagnostic = assistantTerminalCleanupDiagnostic({
    nowMs: input.now?.() ?? Date.now(),
    promptStartedAtMs: input.promptStartedAtMs,
    assistantTerminalGraceMs: input.assistantTerminalGraceMs,
    outputChars: input.outputChars,
    thinkingChars: input.thinkingChars,
    receivedAnyText: input.receivedAnyText,
    currentAssistantReceivedText: input.currentAssistantReceivedText,
    currentAssistantFinalTextChars: input.currentAssistantFinalTextChars,
    sessionFile: input.session.sessionFile,
    lastAssistantTerminalEvent: input.lastAssistantTerminalEvent,
  });
  input.emitRunEvent({
    type: "runtime-activity",
    activity: assistantTerminalCleanupActivity({
      threadId: input.threadId,
      outputChars: input.outputChars,
      thinkingChars: input.thinkingChars,
      idleElapsedMs: input.assistantTerminalGraceMs,
      idleTimeoutMs: input.streamIdleTimeoutMs,
      diagnostic,
    }),
  });
  input.markCleanupInProgress?.();
  await input.abortSessionRun(input.session, input.threadId);
  input.removeActiveSessionIfCurrent(input.session);
  try {
    input.session.dispose();
  } catch {
    // Best-effort cleanup; the important part is that this interrupted
    // Pi session is not reused for the next user turn.
  }
  const pending: Promise<unknown>[] = [input.promptCompletion.catch(() => "prompt" as const)];
  if (input.pendingCompletion) pending.push(input.pendingCompletion.catch(() => "steer" as const));
  await withTimeout(Promise.all(pending), input.abortGraceMs);
  return { diagnostic };
}
