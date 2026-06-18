import type { DesktopEvent } from "../../shared/desktopTypes";
import { withTimeout } from "../agent-runtime/agentRuntimeTimeouts";
import type { PromptCompletion } from "./post-tool/postToolFinalization";
import {
  finalizeRuntimeAssistantTerminalCleanup,
  type RuntimeAssistantTerminalCleanupInput,
  type RuntimeAssistantTerminalCleanupResult,
  type RuntimeAssistantTerminalCleanupSession,
} from "./runtimeAssistantTerminalCleanup";

export interface RuntimePromptExecutionSession extends RuntimeAssistantTerminalCleanupSession {
  isStreaming?: boolean;
  prompt(promptContent: string, options: unknown): Promise<unknown>;
}

export interface RuntimePromptExecutionControllerInput {
  threadId: string;
  session: RuntimePromptExecutionSession;
  promptContent: string;
  images: unknown[];
  isStreamTimedOut: () => boolean;
  streamTimeoutMessage: () => string;
  recordPromptStart: (input: { sessionFile?: string; promptContent: string }) => void;
  assistantTerminalGraceMs: () => number;
  outputChars: () => number;
  thinkingChars: () => number;
  receivedAnyText: () => boolean;
  currentAssistantReceivedText: () => boolean;
  currentAssistantFinalTextChars: () => number;
  streamIdleTimeoutMs: number;
  abortGraceMs: number;
  lastAssistantTerminalEvent: () => RuntimeAssistantTerminalCleanupInput["lastAssistantTerminalEvent"];
  markCleanupInProgress: () => void;
  setAssistantTerminalCleanupDiagnostic: (diagnostic: RuntimeAssistantTerminalCleanupResult["diagnostic"]) => void;
  abortSessionRun: (session: RuntimeAssistantTerminalCleanupSession, threadId: string) => Promise<void>;
  removeActiveSessionIfCurrent: (session: RuntimeAssistantTerminalCleanupSession) => void;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimePromptExecutionController {
  promptCompletion: Promise<PromptCompletion>;
  finalizeAssistantTerminalRun: (pendingCompletion?: Promise<unknown>) => Promise<void>;
  waitForPromptAfterAbort: () => Promise<unknown>;
}

export function createRuntimePromptExecutionController(
  input: RuntimePromptExecutionControllerInput,
): RuntimePromptExecutionController {
  input.recordPromptStart({ sessionFile: input.session.sessionFile, promptContent: input.promptContent });
  const promptStartedAt = Date.now();
  const promptCompletion = input.session
    .prompt(input.promptContent, {
      ...(input.images.length ? { images: input.images } : {}),
      streamingBehavior: input.session.isStreaming ? "steer" : undefined,
      source: { type: "user" },
    } as any)
    .then((): PromptCompletion => "prompt")
    .catch((error) => {
      if (input.isStreamTimedOut()) throw new Error(input.streamTimeoutMessage());
      throw error;
    });

  const finalizeAssistantTerminalRun = async (pendingCompletion?: Promise<unknown>): Promise<void> => {
    const cleanup = await finalizeRuntimeAssistantTerminalCleanup({
      threadId: input.threadId,
      promptStartedAtMs: promptStartedAt,
      assistantTerminalGraceMs: input.assistantTerminalGraceMs(),
      outputChars: input.outputChars(),
      thinkingChars: input.thinkingChars(),
      receivedAnyText: input.receivedAnyText(),
      currentAssistantReceivedText: input.currentAssistantReceivedText(),
      currentAssistantFinalTextChars: input.currentAssistantFinalTextChars(),
      streamIdleTimeoutMs: input.streamIdleTimeoutMs,
      abortGraceMs: input.abortGraceMs,
      session: input.session,
      lastAssistantTerminalEvent: input.lastAssistantTerminalEvent(),
      promptCompletion,
      pendingCompletion,
      markCleanupInProgress: input.markCleanupInProgress,
      abortSessionRun: input.abortSessionRun,
      removeActiveSessionIfCurrent: input.removeActiveSessionIfCurrent,
      emitRunEvent: input.emitRunEvent,
    });
    input.setAssistantTerminalCleanupDiagnostic(cleanup.diagnostic);
  };

  return {
    promptCompletion,
    finalizeAssistantTerminalRun,
    waitForPromptAfterAbort: () => withTimeout(
      promptCompletion.catch(() => "prompt" as PromptCompletion),
      input.abortGraceMs,
    ),
  };
}
