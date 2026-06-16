import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent, SubagentWaitBarrierSummary } from "../../shared/types";
import type { SubagentParentControlAbortIntent } from "../agentRuntimeToolMessageMetadata";
import { createRuntimeAbortContext } from "./runtimeAbortContext";

interface Session {
  id: string;
}

describe("createRuntimeAbortContext", () => {
  it("aborts active runs by marking local abort state, finishing the run, and aborting the session", async () => {
    const { context, input, session } = setup();

    await context.activeRun.abort();

    expect(context.abortRequested()).toBe(true);
    expect(input.markQueuedMessagesAborted).toHaveBeenCalledTimes(1);
    expect(input.denyThread).toHaveBeenCalledWith("thread-1");
    expect(input.finishRun).toHaveBeenCalledWith("run-1", "aborted", undefined);
    expect(input.abortSessionRun).toHaveBeenCalledWith(session, "thread-1");
  });

  it("detaches active runs without finishing the persisted run", () => {
    const { context, input, session } = setup();

    context.activeRun.detach();

    expect(context.abortRequested()).toBe(true);
    expect(input.markQueuedMessagesAborted).toHaveBeenCalledTimes(1);
    expect(input.denyThread).toHaveBeenCalledWith("thread-1");
    expect(input.detachFromWorkspace).toHaveBeenCalledTimes(1);
    expect(input.finishRun).not.toHaveBeenCalled();
    expect(input.abortSessionRun).toHaveBeenCalledWith(session, "thread-1");
  });

  it("requests subagent parent-control abort only once and emits runtime activity", () => {
    const { context, input, session, events } = setup();
    const intent = parentControlIntent();

    context.requestSubagentParentControlAbort(intent);
    context.requestSubagentParentControlAbort({ ...intent, message: "second request ignored" });

    expect(context.abortRequested()).toBe(true);
    expect(context.subagentParentControlAbortIntent()).toBe(intent);
    expect(input.markQueuedMessagesAborted).toHaveBeenCalledTimes(1);
    expect(input.denyThread).toHaveBeenCalledTimes(1);
    expect(input.abortSessionRun).toHaveBeenCalledWith(session, "thread-1");
    expect(input.signalParentControlAbort).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        message: intent.message,
        outputChars: 42,
        thinkingChars: 7,
      }),
    }));
  });

  it("consumes subagent parent-control abort once while the run is active", async () => {
    const { context, input } = setup();
    const intent = parentControlIntent({ reason: "child_cancelled_parent" });
    context.requestSubagentParentControlAbort(intent);

    await context.consumeSubagentParentControlAbort();
    await context.consumeSubagentParentControlAbort();

    expect(input.cascadeSubagentsForStoppedParentRun).toHaveBeenCalledTimes(1);
    expect(input.cascadeSubagentsForStoppedParentRun).toHaveBeenCalledWith(
      "thread-1",
      "run-1",
      "child_cancelled_parent",
    );
  });

  it("reconciles parent-control wait barriers once when finishing the parent run", () => {
    const { context, input, events, barrier } = setup();
    context.requestSubagentParentControlAbort(parentControlIntent({ waitBarrierId: "barrier-1" }));

    context.finishParentRun("error", "stopped");
    context.finishParentRun("error", "stopped again");

    expect(input.finishRun).toHaveBeenCalledWith("run-1", "error", "stopped");
    expect(input.finishRun).toHaveBeenCalledWith("run-1", "error", "stopped again");
    expect(input.markSubagentParentControlBarrierReconciled).toHaveBeenCalledTimes(1);
    expect(input.markSubagentParentControlBarrierReconciled).toHaveBeenCalledWith({
      waitBarrierId: "barrier-1",
      source: "runtime_parent_abort",
    });
    expect(events).toContainEqual({ type: "subagent-wait-barrier-updated", barrier });
  });
});

function setup(overrides: Partial<Parameters<typeof createRuntimeAbortContext<Session>>[0]> = {}) {
  const events: DesktopEvent[] = [];
  const session = { id: "session-1" };
  const barrier = { id: "barrier-1", status: "satisfied" } as SubagentWaitBarrierSummary;
  const input = {
    threadId: "thread-1",
    runId: "run-1",
    dedicatedSessionKind: undefined,
    activeRunSettled: Promise.resolve(),
    addActivityListener: vi.fn(() => vi.fn()),
    queueMessage: vi.fn(async () => undefined),
    isRunStoreActive: vi.fn(() => true),
    finishRun: vi.fn(),
    markQueuedMessagesAborted: vi.fn(),
    denyThread: vi.fn(),
    detachFromWorkspace: vi.fn(),
    getSession: vi.fn(() => session),
    abortSessionRun: vi.fn(async () => undefined),
    markSubagentParentControlBarrierReconciled: vi.fn(() => barrier),
    cascadeSubagentsForStoppedParentRun: vi.fn(async () => undefined),
    getOutputChars: vi.fn(() => 42),
    getThinkingChars: vi.fn(() => 7),
    signalParentControlAbort: vi.fn(),
    emitRunEvent: vi.fn((event) => {
      events.push(event);
    }),
    ...overrides,
  } satisfies Parameters<typeof createRuntimeAbortContext<Session>>[0];
  return {
    context: createRuntimeAbortContext(input),
    input,
    events,
    session,
    barrier,
  };
}

function parentControlIntent(
  overrides: Partial<SubagentParentControlAbortIntent> = {},
): SubagentParentControlAbortIntent {
  return {
    reason: "child_requested_parent_cancel",
    message: "Child requested parent cancellation.",
    toolCallId: "tool-1",
    parentRunId: "run-1",
    waitBarrierId: "barrier-1",
    idempotencyKey: "idem-1",
    decision: "cancel_parent",
    ...overrides,
  };
}
