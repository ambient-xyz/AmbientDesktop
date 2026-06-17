import type { PromptCompletion } from "./post-tool/postToolFinalization";
import type {
  RuntimePostToolContinuationController,
  RuntimePostToolContinuationResult,
} from "./runtimePostToolContinuationController";

export type RuntimePromptCompletion =
  | PromptCompletion
  | "assistant-terminal"
  | "stream-timeout"
  | "tool-timeout"
  | "parent-control-abort";

export interface RuntimePromptCompletionLoopInput {
  promptCompletion: Promise<PromptCompletion>;
  postToolContinuation: Pick<
    RuntimePostToolContinuationController,
    "wait" | "request" | "extendToFinalizationWindow"
  >;
  assistantTerminalCompletion: Promise<"assistant-terminal">;
  streamWatchdogCompletion: Promise<RuntimePromptCompletion>;
  hasLastCompletedTool: () => boolean;
  assistantTextObservedAfterLastToolEnd: () => boolean;
  isStreamTimedOut: () => boolean;
  streamTimeoutMessage: () => string;
  isToolExecutionTimedOut: () => boolean;
  toolExecutionTimeoutMessage: () => string | undefined;
  finalizeAssistantTerminalRun: () => Promise<void>;
  abortSessionRun: () => Promise<void>;
  waitForPromptAfterAbort: () => Promise<unknown>;
  cleanup: () => void;
}

export interface RuntimePromptCompletionLoopResult {
  finalizedAfterToolIdle: boolean;
}

export async function runRuntimePromptCompletionLoop(
  input: RuntimePromptCompletionLoopInput,
): Promise<RuntimePromptCompletionLoopResult> {
  let finalizedAfterToolIdle = false;
  try {
    while (true) {
      const completion = await Promise.race<RuntimePromptCompletion>([
        input.promptCompletion,
        input.postToolContinuation.wait(),
        input.assistantTerminalCompletion,
        input.streamWatchdogCompletion,
      ]);
      if (input.isStreamTimedOut()) throw new Error(input.streamTimeoutMessage());
      if (input.isToolExecutionTimedOut()) {
        throw new Error(input.toolExecutionTimeoutMessage() ?? "Local tool execution timed out.");
      }
      if (completion === "parent-control-abort") {
        await input.waitForPromptAfterAbort();
        break;
      }
      if (completion === "assistant-terminal") {
        await input.finalizeAssistantTerminalRun();
        break;
      }
      if (
        completion === "prompt" &&
        input.hasLastCompletedTool() &&
        !input.assistantTextObservedAfterLastToolEnd()
      ) {
        const continuation = await input.postToolContinuation.request("prompt-resolved-after-tool");
        if (shouldBreakForContinuation(continuation)) break;
        if (continuation === "continued") continue;
      }
      if (completion !== "post-tool-idle") break;
      const continuation = await input.postToolContinuation.request("post-tool-idle");
      if (shouldBreakForContinuation(continuation)) break;
      if (continuation === "continued") continue;
      if (input.postToolContinuation.extendToFinalizationWindow()) {
        continue;
      }
      finalizedAfterToolIdle = true;
      await input.abortSessionRun();
      await input.waitForPromptAfterAbort();
      break;
    }
  } finally {
    input.cleanup();
  }
  return { finalizedAfterToolIdle };
}

function shouldBreakForContinuation(continuation: RuntimePostToolContinuationResult): boolean {
  return continuation === "assistant-terminal";
}
