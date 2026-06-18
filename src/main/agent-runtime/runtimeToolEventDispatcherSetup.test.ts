import { describe, expect, it, vi } from "vitest";
import type { ToolArgumentProgressSnapshot, ToolIntentSnapshot } from "../../shared/threadTypes";
import type {
  RuntimeToolEventDispatcher,
  RuntimeToolEventDispatcherInput,
} from "./runtimeToolEventDispatcher";
import {
  createRuntimeToolEventDispatcherSetup,
  type RuntimeToolEventDispatcherSetupInput,
} from "./runtimeToolEventDispatcherSetup";

describe("createRuntimeToolEventDispatcherSetup", () => {
  it("creates the dispatcher with explicit runtime owners", () => {
    const dispatcher = createDispatcher();
    const dispatcherInputs: RuntimeToolEventDispatcherInput[] = [];
    const createToolEventDispatcher = vi.fn((dispatcherInput: RuntimeToolEventDispatcherInput) => {
      dispatcherInputs.push(dispatcherInput);
      return dispatcher;
    });
    const input = createInput({ createToolEventDispatcher });

    const setup = createRuntimeToolEventDispatcherSetup(input);

    expect(setup).toBe(dispatcher);
    expect(createToolEventDispatcher).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-1",
      workspacePath: "/workspace",
      permissionMode: "workspace",
      toolMessages: input.toolMessages,
      toolArgumentProgress: input.toolArgumentProgress,
      toolArgumentWatchdog: input.toolArgumentWatchdog,
      toolExecutionWatchdog: input.toolExecutionWatchdog,
      postToolContinuation: input.postToolContinuation,
      startedToolCallIds: input.startedToolCallIds,
      requestSubagentParentControlAbort: input.requestSubagentParentControlAbort,
    }));

    const dispatcherInput = dispatcherInputs[0]!;
    expect(dispatcherInput.clearEmptyAssistantStallWatchdog).toBe(input.emptyAssistantStallWatchdog.clear);
    expect(dispatcherInput.clearAssistantTerminalCompletion).toBe(input.assistantTerminalCompletion.clear);
    expect(dispatcherInput.markFirstToolArgumentObserved).toBe(input.streamTraceState.markFirstToolArgumentObserved);
    expect(dispatcherInput.markFirstToolExecutionObserved).toBe(input.streamTraceState.markFirstToolExecutionObserved);
    expect(dispatcherInput.rememberToolIntent).toBe(input.toolRecovery.rememberToolIntent);
    expect(dispatcherInput.trackInterruptedToolCallRecovery).toBe(input.toolRecovery.trackInterruptedToolCallRecovery);
    expect(dispatcherInput.markInterruptedToolCallNoLongerRecoverable).toBe(
      input.toolRecovery.markInterruptedToolCallNoLongerRecoverable,
    );
    expect(dispatcherInput.persistToolArgumentDiagnostics).toBe(input.toolRecovery.persistToolArgumentDiagnostics);
    expect(dispatcherInput.setLastCompletedTool).toBe(input.promptRunState.setLastCompletedTool);
    expect(dispatcherInput.markAssistantTextNotObservedAfterLastToolEnd).toBe(
      input.promptRunState.markAssistantTextNotObservedAfterLastToolEnd,
    );
  });

  it("maps active-run status and browser refresh callbacks through the setup context", () => {
    const dispatcherInputs: RuntimeToolEventDispatcherInput[] = [];
    const input = createInput({
      createToolEventDispatcher: vi.fn((dispatcherInput) => {
        dispatcherInputs.push(dispatcherInput);
        return createDispatcher();
      }),
    });

    createRuntimeToolEventDispatcherSetup(input);
    const dispatcherInput = dispatcherInputs[0]!;

    dispatcherInput.setActiveRunToolStatus();
    dispatcherInput.refreshBrowsersForArtifactChange("public/out.txt");

    expect(input.promptLifecycleControls.setActiveRunStatus).toHaveBeenCalledWith("tool");
    expect(input.refreshBrowsersForArtifactChange).toHaveBeenCalledWith(
      "thread-1",
      "/workspace",
      "public/out.txt",
    );
  });
});

function createInput(
  overrides: Partial<RuntimeToolEventDispatcherSetupInput> = {},
): RuntimeToolEventDispatcherSetupInput {
  const progress = toolArgumentProgress();
  return {
    threadId: "thread-1",
    runId: "run-1",
    workspacePath: "/workspace",
    permissionMode: "workspace",
    toolMessages: {
      size: vi.fn(() => 0),
      toolCallIds: vi.fn(function* () {}),
      inputs: vi.fn(() => new Map()),
      recoveryInputs: vi.fn(() => new Map()),
      labels: vi.fn(() => new Map()),
      messageId: vi.fn(() => "message-1"),
      inputContent: vi.fn(),
      recoveryInput: vi.fn(),
      recoveryInputSource: vi.fn(),
      longformInputPreview: vi.fn(),
      editInputPreview: vi.fn(),
      metadataFor: vi.fn(() => ({})),
      rememberRecoveryInput: vi.fn(),
      rememberLongformInputPreview: vi.fn(),
      rememberEditInputPreview: vi.fn(),
      upsertInputMessage: vi.fn(),
      emitRunningToolEvent: vi.fn(),
      applyResultUpdate: vi.fn(),
      markOpenToolMessagesFailed: vi.fn(() => 0),
      cleanupToolCall: vi.fn(),
    },
    toolArgumentProgress: {
      current: vi.fn(() => progress),
      recordArgumentEvent: vi.fn(() => progress),
      markExecutionStart: vi.fn(() => progress),
      markExecutionEnd: vi.fn(() => progress),
    },
    toolArgumentWatchdog: {
      schedule: vi.fn(),
    },
    toolExecutionWatchdog: {
      begin: vi.fn(),
      mark: vi.fn(),
      finish: vi.fn(),
    },
    postToolContinuation: {
      markToolStart: vi.fn(),
      markToolEnd: vi.fn(),
    },
    startedToolCallIds: new Set(),
    emptyAssistantStallWatchdog: {
      clear: vi.fn(),
    },
    assistantTerminalCompletion: {
      clear: vi.fn(),
    },
    streamTraceState: {
      markFirstToolArgumentObserved: vi.fn(),
      markFirstToolExecutionObserved: vi.fn(),
    },
    toolRecovery: {
      rememberToolIntent: vi.fn(() => toolIntentSnapshot()),
      trackInterruptedToolCallRecovery: vi.fn(() => progress),
      markInterruptedToolCallNoLongerRecoverable: vi.fn(() => progress),
      persistToolArgumentDiagnostics: vi.fn(),
    },
    promptLifecycleControls: {
      setActiveRunStatus: vi.fn(),
    },
    promptRunState: {
      setLastCompletedTool: vi.fn(),
      markAssistantTextNotObservedAfterLastToolEnd: vi.fn(),
    },
    requestSubagentParentControlAbort: vi.fn(),
    refreshBrowsersForArtifactChange: vi.fn(),
    ...overrides,
  } as RuntimeToolEventDispatcherSetupInput;
}

function createDispatcher(): RuntimeToolEventDispatcher {
  return {
    handle: vi.fn(() => false),
  };
}

function toolArgumentProgress(): ToolArgumentProgressSnapshot {
  return {
    version: 1,
    phase: "argument_stream",
    eventType: "toolcall_delta",
    toolCallId: "tool-call-1",
    toolName: "file_write",
    uiStatus: "Receiving input",
    argumentStartedAt: "2026-06-15T00:00:00.000Z",
    argumentUpdatedAt: "2026-06-15T00:00:01.000Z",
    argumentElapsedMs: 1000,
    argumentComplete: false,
    inputChars: 12,
    observedArgumentChars: 12,
    deltaChars: 3,
    totalDeltaChars: 12,
    maxDeltaChars: 3,
    argumentEventCount: 1,
    toolcallDeltaCount: 1,
    meaningfulGrowthCount: 1,
    charsPerSecond: 12,
  };
}

function toolIntentSnapshot(): ToolIntentSnapshot {
  return {
    version: 1,
    toolCallId: "tool-call-1",
    toolName: "file_write",
    operationKind: "tool_execution",
    materiality: "important",
    substituteAllowed: true,
    createdAt: "2026-06-15T00:00:00.000Z",
  };
}
