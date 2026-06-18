import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { RuntimeAbortContext, RuntimeAbortContextInput } from "./runtimeAbortContext";
import { createRuntimeAbortContextSetup, type RuntimeAbortContextSetupInput } from "./runtimeAbortContextSetup";
import type { RuntimeQueuedMessageSnapshot } from "./runtimeQueuedMessageController";

interface Session {
  id: string;
}

describe("createRuntimeAbortContextSetup", () => {
  it("creates the abort context with explicit runtime owners", async () => {
    const abortContext = createAbortContext();
    const abortInputs: RuntimeAbortContextInput<Session>[] = [];
    const createAbortContextMock = vi.fn((abortInput: RuntimeAbortContextInput<Session>) => {
      abortInputs.push(abortInput);
      return abortContext;
    });
    const input = createInput({
      createAbortContext: createAbortContextMock,
    });

    const setup = createRuntimeAbortContextSetup(input);

    expect(setup).toBe(abortContext);
    expect(input.createAbortContext).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      runId: "run-1",
      dedicatedSessionKind: "workflow-recording-review",
      activeRunSettled: input.activeRunSettled,
      addActivityListener: input.runEventScope.addActivityListener,
      isRunStoreActive: input.isRunStoreActive,
      finishRun: input.finishRun,
      denyThread: input.denyThread,
      getSession: input.getSession,
      abortSessionRun: input.abortSessionRun,
      markSubagentParentControlBarrierReconciled: input.markSubagentParentControlBarrierReconciled,
      cascadeSubagentsForStoppedParentRun: input.cascadeSubagentsForStoppedParentRun,
      emitRunEvent: input.emitRunEvent,
    }));

    const abortInput = abortInputs[0]!;
    const queuedMessage = queuedMessageSnapshot();
    await abortInput.queueMessage(queuedMessage);
    abortInput.markQueuedMessagesAborted();
    abortInput.detachFromWorkspace();
    abortInput.signalParentControlAbort();

    expect(input.queuedMessages.enqueue).toHaveBeenCalledWith(queuedMessage);
    expect(input.queuedMessages.markQueuedMessagesAborted).toHaveBeenCalledTimes(1);
    expect(input.runEventScope.detachFromWorkspace).toHaveBeenCalledTimes(1);
    expect(input.promptLifecycleControls.signalParentControlAbort).toHaveBeenCalledTimes(1);
  });

  it("passes live session and output-state getters through to the abort context", () => {
    const abortInputs: RuntimeAbortContextInput<Session>[] = [];
    const createAbortContextMock = vi.fn((abortInput: RuntimeAbortContextInput<Session>) => {
      abortInputs.push(abortInput);
      return createAbortContext();
    });
    const input = createInput({
      createAbortContext: createAbortContextMock,
    });
    const firstSession = { id: "session-1" };
    const secondSession = { id: "session-2" };
    let currentSession: Session | undefined = firstSession;
    vi.mocked(input.getSession).mockImplementation(() => currentSession);
    vi.mocked(input.outputState.assistantOutputChars).mockReturnValue(42);
    vi.mocked(input.outputState.thinkingOutputChars).mockReturnValue(7);

    createRuntimeAbortContextSetup(input);
    const abortInput = abortInputs[0]!;

    expect(abortInput.getSession()).toBe(firstSession);
    currentSession = secondSession;
    expect(abortInput.getSession()).toBe(secondSession);
    expect(abortInput.getOutputChars()).toBe(42);
    expect(abortInput.getThinkingChars()).toBe(7);
  });

  it("uses the real abort context with setup-owned dependencies", async () => {
    const events: DesktopEvent[] = [];
    const input = createInput({
      emitRunEvent: vi.fn((event) => {
        events.push(event);
      }),
    });

    const setup = createRuntimeAbortContextSetup(input);

    await setup.activeRun.abort();

    expect(input.queuedMessages.markQueuedMessagesAborted).toHaveBeenCalledTimes(1);
    expect(input.denyThread).toHaveBeenCalledWith("thread-1");
    expect(input.finishRun).toHaveBeenCalledWith("run-1", "aborted", undefined);
    expect(input.abortSessionRun).toHaveBeenCalledWith({ id: "session-1" }, "thread-1");
    setup.requestSubagentParentControlAbort({
      reason: "child_requested_parent_cancel",
      message: "Child requested parent cancellation.",
      toolCallId: "tool-1",
      parentRunId: "run-1",
      waitBarrierId: "barrier-1",
      idempotencyKey: "idem-1",
      decision: "cancel_parent",
    });
    expect(input.promptLifecycleControls.signalParentControlAbort).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        outputChars: 42,
        thinkingChars: 7,
      }),
    }));
  });
});

function createInput(
  overrides: Partial<RuntimeAbortContextSetupInput<Session>> = {},
): RuntimeAbortContextSetupInput<Session> {
  const barrier = { id: "barrier-1", status: "satisfied" } as SubagentWaitBarrierSummary;
  return {
    threadId: "thread-1",
    runId: "run-1",
    dedicatedSessionKind: "workflow-recording-review",
    activeRunSettled: Promise.resolve(),
    runEventScope: {
      addActivityListener: vi.fn(() => vi.fn()),
      detachFromWorkspace: vi.fn(),
    },
    queuedMessages: {
      enqueue: vi.fn(async () => undefined),
      markQueuedMessagesAborted: vi.fn(),
    },
    outputState: {
      assistantOutputChars: vi.fn(() => 42),
      thinkingOutputChars: vi.fn(() => 7),
    },
    promptLifecycleControls: {
      signalParentControlAbort: vi.fn(),
    },
    isRunStoreActive: vi.fn(() => true),
    finishRun: vi.fn(),
    denyThread: vi.fn(),
    getSession: vi.fn(() => ({ id: "session-1" })),
    abortSessionRun: vi.fn(async () => undefined),
    markSubagentParentControlBarrierReconciled: vi.fn(() => barrier),
    cascadeSubagentsForStoppedParentRun: vi.fn(async () => undefined),
    emitRunEvent: vi.fn(),
    ...overrides,
  };
}

function createAbortContext(): RuntimeAbortContext {
  return {
    activeRun: {
      abort: vi.fn(async () => undefined),
      detach: vi.fn(),
      queue: vi.fn(async () => undefined),
      settled: Promise.resolve(),
      addActivityListener: vi.fn(),
    },
    abortRequested: vi.fn(() => false),
    subagentParentControlAbortIntent: vi.fn(),
    finishParentRun: vi.fn(),
    consumeSubagentParentControlAbort: vi.fn(async () => undefined),
    requestSubagentParentControlAbort: vi.fn(),
  };
}

function queuedMessageSnapshot(): RuntimeQueuedMessageSnapshot {
  return {
    id: "message-1",
    content: "queued",
    status: "queued",
    delivery: "steer",
  };
}
