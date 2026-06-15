import type { ChatMessage, DesktopEvent } from "../../shared/types";
import {
  createPostToolFinalizationTracker,
  type PostToolFinalizationTracker,
  type PromptCompletion,
} from "../postToolFinalization";
import {
  planPostToolContinuation,
  postToolContinuationActivity,
  postToolIdleContinuationPrompt,
  stalePostToolContinuationActivity,
  type CompletedToolSnapshot,
  type PostToolContinuationTrigger,
} from "../postToolContinuationScheduler";

export type RuntimePostToolContinuationCompletion =
  | PromptCompletion
  | "assistant-terminal"
  | "stream-timeout"
  | "tool-timeout"
  | "parent-control-abort";

export type RuntimePostToolContinuationResult = "continued" | "assistant-terminal" | "exhausted";

export interface RuntimePostToolContinuationControllerInput {
  threadId: string;
  runId: string;
  continuationIdleMs: number;
  finalizationIdleMs: number;
  tickMs: number;
  streamIdleTimeoutMs: number;
  maxAttempts: number;
  getOutputChars: () => number;
  getThinkingChars: () => number;
  getMessages: () => ChatMessage[];
  getLastCompletedTool: () => CompletedToolSnapshot | undefined;
  getRunEventSeq: () => number;
  resetStreamWatchdog: () => void;
  assistantTerminalCompletion: Promise<"assistant-terminal">;
  streamWatchdogCompletion: Promise<RuntimePostToolContinuationCompletion>;
  isStreamTimedOut: () => boolean;
  streamTimeoutMessage: () => string;
  isToolExecutionTimedOut: () => boolean;
  toolExecutionTimeoutMessage: () => string | undefined;
  steerContinuation: (prompt: string) => Promise<unknown>;
  finalizeAssistantTerminalRun: (pendingCompletion?: Promise<unknown>) => Promise<void>;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimePostToolContinuationController {
  markEvent: () => void;
  markAgentEnd: () => void;
  markToolStart: (toolCallId: string) => void;
  markToolEnd: (toolCallId: string) => void;
  wait: () => Promise<PromptCompletion>;
  stop: () => void;
  request: (trigger: PostToolContinuationTrigger) => Promise<RuntimePostToolContinuationResult>;
  extendToFinalizationWindow: () => boolean;
  idleMs: () => number;
  attempts: () => number;
}

export function createRuntimePostToolContinuationController(
  input: RuntimePostToolContinuationControllerInput,
): RuntimePostToolContinuationController {
  let idleMs = input.continuationIdleMs;
  let attempts = 0;
  let tracker: PostToolFinalizationTracker = createPostToolFinalizationTracker({
    idleMs,
    tickMs: input.tickMs,
  });

  const resetTracker = () => {
    tracker = createPostToolFinalizationTracker({
      idleMs,
      tickMs: input.tickMs,
    });
  };

  const request = async (
    trigger: PostToolContinuationTrigger,
  ): Promise<RuntimePostToolContinuationResult> => {
    if (attempts >= input.maxAttempts) return "exhausted";
    attempts += 1;
    input.emitRunEvent({
      type: "runtime-activity",
      activity: postToolContinuationActivity({
        threadId: input.threadId,
        outputChars: input.getOutputChars(),
        thinkingChars: input.getThinkingChars(),
        idleElapsedMs: idleMs,
        idleTimeoutMs: input.streamIdleTimeoutMs,
        trigger,
        attempt: attempts,
        maxAttempts: input.maxAttempts,
      }),
    });
    tracker.stop();
    idleMs = attempts < input.maxAttempts
      ? input.continuationIdleMs
      : input.finalizationIdleMs;
    const continuationPlan = planPostToolContinuation({
      messages: input.getMessages(),
      lastCompletedTool: input.getLastCompletedTool(),
      runId: input.runId,
      attempt: attempts,
      idleMs,
      currentEventSeq: input.getRunEventSeq(),
    });
    const continuationValidation = continuationPlan.validation;
    if (!continuationValidation.deliver) {
      input.emitRunEvent({
        type: "runtime-activity",
        activity: stalePostToolContinuationActivity({
          threadId: input.threadId,
          outputChars: input.getOutputChars(),
          thinkingChars: input.getThinkingChars(),
          idleElapsedMs: idleMs,
          idleTimeoutMs: input.streamIdleTimeoutMs,
          diagnostic: continuationValidation.diagnostic,
        }),
      });
      resetTracker();
      input.resetStreamWatchdog();
      return "continued";
    }

    resetTracker();
    tracker.markToolEnd(`post-tool-continuation-${attempts}`);
    input.resetStreamWatchdog();
    const steerPromise = input
      .steerContinuation(postToolIdleContinuationPrompt(continuationValidation.snapshot))
      .then(() => "steer" as const);
    const steerCompletion = await Promise.race<RuntimePostToolContinuationCompletion | "steer">([
      steerPromise,
      input.assistantTerminalCompletion,
      input.streamWatchdogCompletion,
    ]);
    if (input.isStreamTimedOut()) throw new Error(input.streamTimeoutMessage());
    if (input.isToolExecutionTimedOut()) {
      throw new Error(input.toolExecutionTimeoutMessage() ?? "Local tool execution timed out.");
    }
    if (steerCompletion === "assistant-terminal") {
      await input.finalizeAssistantTerminalRun(steerPromise);
      return "assistant-terminal";
    }
    return "continued";
  };

  return {
    markEvent: () => tracker.markEvent(),
    markAgentEnd: () => tracker.markAgentEnd(),
    markToolStart: (toolCallId) => tracker.markToolStart(toolCallId),
    markToolEnd: (toolCallId) => tracker.markToolEnd(toolCallId),
    wait: () => tracker.wait(),
    stop: () => tracker.stop(),
    request,
    extendToFinalizationWindow: () => {
      if (idleMs >= input.finalizationIdleMs) return false;
      tracker.stop();
      idleMs = input.finalizationIdleMs;
      resetTracker();
      tracker.markToolEnd("post-tool-finalization");
      return true;
    },
    idleMs: () => idleMs,
    attempts: () => attempts,
  };
}
