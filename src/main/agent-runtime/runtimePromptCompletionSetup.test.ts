import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PromptCompletion } from "./post-tool/postToolFinalization";
import type { RuntimePostToolContinuationResult } from "./runtimePostToolContinuationController";
import {
  runRuntimePromptCompletionSetup,
  type RuntimePromptCompletionSetupInput,
} from "./runtimePromptCompletionSetup";
import type {
  RuntimePromptCompletionStageInput,
} from "./runtimePromptCompletionStage";
import type { RuntimeStreamWatchdogController } from "./runtimeStreamWatchdogController";

interface Session {
  id: string;
}

function pendingPromise<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

describe("runRuntimePromptCompletionSetup", () => {
  it("runs the completion stage with explicit runtime owners", async () => {
    const stageInputs: RuntimePromptCompletionStageInput[] = [];
    const input = createInput({
      runPromptCompletionStage: vi.fn(async (stageInput) => {
        stageInputs.push(stageInput);
        return { finalizedAfterToolIdle: true };
      }),
    });

    await expect(runRuntimePromptCompletionSetup(input)).resolves.toEqual({
      finalizedAfterToolIdle: true,
    });

    const stageInput = stageInputs[0]!;
    expect(input.runPromptCompletionStage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      preStreamTimeoutMs: 3_000,
      idleTimeoutMs: 30_000,
      isRunStoreActive: input.isRunStoreActive,
      markStreamTimedOut: input.promptControlState.markStreamTimedOut,
      setStreamTimeoutMessage: input.promptControlState.setStreamWatchdogTimeoutMessage,
      persistPiStreamTrace: input.persistPiStreamTrace,
      signalStreamWatchdogTimeout: input.promptLifecycleControls.signalStreamWatchdogTimeout,
      emitRunEvent: input.emitRunEvent,
      setStreamWatchdog: input.setStreamWatchdog,
      markQueueReady: input.promptControlState.markQueueReady,
      promptCompletion: input.promptExecution.promptCompletion,
      postToolContinuation: input.postToolContinuation,
      assistantTerminalCompletion: input.assistantTerminalCompletion,
      streamWatchdogCompletion: input.promptLifecycleControls.streamWatchdogCompletion,
      hasLastCompletedTool: input.promptRunState.hasLastCompletedTool,
      assistantTextObservedAfterLastToolEnd: input.promptRunState.assistantTextObservedAfterLastToolEnd,
      isStreamTimedOut: input.promptControlState.isStreamTimedOut,
      streamTimeoutMessage: input.streamTimeoutMessage,
      finalizeAssistantTerminalRun: input.finalizeAssistantTerminalRun,
      waitForPromptAfterAbort: input.promptExecution.waitForPromptAfterAbort,
      clearEmptyAssistantStallWatchdog: input.emptyAssistantStallWatchdog.clear,
      clearToolArgumentWatchdog: input.toolArgumentWatchdog.clear,
      clearToolExecutionWatchdog: input.toolExecutionWatchdog.clear,
      unsubscribePromptEvents: input.unsubscribePromptEvents,
    }));
    expect(stageInput.isPermissionWaiting()).toBe(false);
    expect(input.permissionWaits.isWaiting).toHaveBeenCalledTimes(1);
    expect(stageInput.isToolExecutionActive()).toBe(true);
    expect(input.toolExecutionWatchdog.isActive).toHaveBeenCalledTimes(1);
  });

  it("keeps stream state and tool timeout getters live", async () => {
    const stageInputs: RuntimePromptCompletionStageInput[] = [];
    const input = createInput({
      runPromptCompletionStage: vi.fn(async (stageInput) => {
        stageInputs.push(stageInput);
        return { finalizedAfterToolIdle: false };
      }),
    });

    await runRuntimePromptCompletionSetup(input);
    const stageInput = stageInputs[0]!;

    expect(stageInput.getStreamState()).toEqual({
      outputChars: 17,
      thinkingChars: 5,
      streamEventCount: 9,
    });
    expect(stageInput.isToolExecutionTimedOut()).toBe(false);
    vi.mocked(input.toolExecutionWatchdog.isTimedOut).mockReturnValue(true);
    vi.mocked(input.toolExecutionWatchdog.timeoutMessage).mockReturnValue("tool timed out");
    expect(stageInput.isToolExecutionTimedOut()).toBe(true);
    expect(stageInput.toolExecutionTimeoutMessage()).toBe("tool timed out");
  });

  it("routes aborts and queued-message flushes through the live session and queue owner", async () => {
    const stageInputs: RuntimePromptCompletionStageInput[] = [];
    const input = createInput({
      runPromptCompletionStage: vi.fn(async (stageInput) => {
        stageInputs.push(stageInput);
        return { finalizedAfterToolIdle: false };
      }),
    });

    await runRuntimePromptCompletionSetup(input);
    const stageInput = stageInputs[0]!;

    await stageInput.abortSessionRun();
    await stageInput.flushPendingQueuedMessages();

    expect(input.abortSessionRun).toHaveBeenCalledWith(input.session, "thread-1");
    expect(input.queuedMessages.flushPending).toHaveBeenCalledTimes(1);
  });
});

function createInput(
  overrides: Partial<RuntimePromptCompletionSetupInput<Session>> = {},
): RuntimePromptCompletionSetupInput<Session> {
  return {
    threadId: "thread-1",
    preStreamTimeoutMs: 3_000,
    idleTimeoutMs: 30_000,
    session: { id: "session-1" },
    isRunStoreActive: vi.fn(() => true),
    permissionWaits: {
      isWaiting: vi.fn(() => false),
    },
    toolExecutionWatchdog: {
      isActive: vi.fn(() => true),
      isTimedOut: vi.fn(() => false),
      timeoutMessage: vi.fn(() => undefined),
      clear: vi.fn(),
    },
    toolArgumentWatchdog: {
      clear: vi.fn(),
    },
    emptyAssistantStallWatchdog: {
      clear: vi.fn(),
    },
    promptControlState: {
      markStreamTimedOut: vi.fn(),
      setStreamWatchdogTimeoutMessage: vi.fn(),
      markQueueReady: vi.fn(),
      isStreamTimedOut: vi.fn(() => false),
    },
    persistPiStreamTrace: vi.fn(() => undefined),
    outputState: {
      assistantOutputChars: vi.fn(() => 17),
      thinkingOutputChars: vi.fn(() => 5),
    },
    streamActivity: {
      snapshot: vi.fn(() => ({
        eventCount: 9,
        approximatePayloadBytes: 512,
        lastActivityAtMs: 1_000,
      })),
    },
    abortSessionRun: vi.fn(async () => undefined),
    promptLifecycleControls: {
      signalStreamWatchdogTimeout: vi.fn(),
      streamWatchdogCompletion: pendingPromise(),
    },
    emitRunEvent: vi.fn((_event: DesktopEvent) => undefined),
    setStreamWatchdog: vi.fn((_controller: RuntimeStreamWatchdogController) => undefined),
    queuedMessages: {
      flushPending: vi.fn(async () => undefined),
    },
    promptExecution: {
      promptCompletion: Promise.resolve("prompt" as PromptCompletion),
      waitForPromptAfterAbort: vi.fn(async () => "prompt"),
    },
    postToolContinuation: {
      wait: vi.fn(() => pendingPromise<PromptCompletion>()),
      request: vi.fn(() => Promise.resolve("stopped" as RuntimePostToolContinuationResult)),
      extendToFinalizationWindow: vi.fn(() => false),
      stop: vi.fn(),
    },
    assistantTerminalCompletion: {
      completion: pendingPromise(),
      clear: vi.fn(),
    },
    promptRunState: {
      hasLastCompletedTool: vi.fn(() => false),
      assistantTextObservedAfterLastToolEnd: vi.fn(() => false),
    },
    streamTimeoutMessage: vi.fn(() => "Ambient/Pi stream stalled after 30000 ms without stream activity."),
    finalizeAssistantTerminalRun: vi.fn(async () => undefined),
    unsubscribePromptEvents: vi.fn(),
    ...overrides,
  };
}
