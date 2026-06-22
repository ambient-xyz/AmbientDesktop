import { describe, expect, it, vi } from "vitest";

import { subscribeRuntimePromptEvents } from "./runtimePromptEventSubscription";

function createHarness(options: { active?: boolean; streamHandled?: boolean; toolHandled?: boolean } = {}) {
  let handler: ((event: unknown) => void) | undefined;
  let sequence = 0;
  const unsubscribe = vi.fn();
  const markRunActivity = vi.fn(() => options.active ?? true);
  const incrementRunEventSeq = vi.fn(() => ++sequence);
  const markPostToolEvent = vi.fn();
  const recordPiStreamTraceEvent = vi.fn();
  const markPiStreamActivity = vi.fn();
  const streamEventDispatcher = {
    handle: vi.fn(() => options.streamHandled ?? false),
  };
  const toolEventDispatcher = {
    handle: vi.fn(() => options.toolHandled ?? false),
  };

  const subscription = subscribeRuntimePromptEvents({
    subscribe: (nextHandler) => {
      handler = nextHandler;
      return unsubscribe;
    },
    markRunActivity,
    incrementRunEventSeq,
    markPostToolEvent,
    recordPiStreamTraceEvent,
    markPiStreamActivity,
    streamEventDispatcher,
    toolEventDispatcher,
  });

  return {
    emit: (event: unknown) => handler?.(event),
    subscription,
    unsubscribe,
    markRunActivity,
    incrementRunEventSeq,
    markPostToolEvent,
    recordPiStreamTraceEvent,
    markPiStreamActivity,
    streamEventDispatcher,
    toolEventDispatcher,
  };
}

describe("subscribeRuntimePromptEvents", () => {
  it("returns the underlying unsubscribe callback", () => {
    const harness = createHarness();

    harness.subscription();

    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch inactive run events", () => {
    const harness = createHarness({ active: false });

    harness.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "ignored" },
    });

    expect(harness.markRunActivity).toHaveBeenCalledTimes(1);
    expect(harness.incrementRunEventSeq).not.toHaveBeenCalled();
    expect(harness.markPostToolEvent).not.toHaveBeenCalled();
    expect(harness.recordPiStreamTraceEvent).not.toHaveBeenCalled();
    expect(harness.streamEventDispatcher.handle).not.toHaveBeenCalled();
    expect(harness.toolEventDispatcher.handle).not.toHaveBeenCalled();
  });

  it("records assistant-start trace evidence and lets stream dispatch stop handling", () => {
    const harness = createHarness({ streamHandled: true });
    const event = { type: "message_start", message: { role: "assistant" } };

    harness.emit(event);

    expect(harness.incrementRunEventSeq).toHaveBeenCalledTimes(1);
    expect(harness.markPostToolEvent).toHaveBeenCalledTimes(1);
    expect(harness.recordPiStreamTraceEvent).toHaveBeenCalledWith(event, { kind: "assistant-start" });
    expect(harness.markPiStreamActivity).toHaveBeenCalledWith(false, event);
    expect(harness.streamEventDispatcher.handle).toHaveBeenCalledWith(
      { kind: "unknown" },
      event,
      { assistantStartEvent: true },
    );
    expect(harness.toolEventDispatcher.handle).not.toHaveBeenCalled();
  });

  it("traces normalized stream events before falling through to tool dispatch", () => {
    const harness = createHarness({ streamHandled: false, toolHandled: true });
    const event = {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "hello" },
    };
    const normalized = { kind: "assistant-update", delta: "hello" };

    harness.emit(event);

    expect(harness.recordPiStreamTraceEvent).toHaveBeenCalledWith(event, normalized);
    expect(harness.markPiStreamActivity).toHaveBeenCalledWith(false, event);
    expect(harness.streamEventDispatcher.handle).toHaveBeenCalledWith(
      normalized,
      event,
      { assistantStartEvent: false },
    );
    expect(harness.toolEventDispatcher.handle).toHaveBeenCalledWith(normalized, event, 1);
    expect(harness.streamEventDispatcher.handle.mock.invocationCallOrder[0]).toBeLessThan(
      harness.toolEventDispatcher.handle.mock.invocationCallOrder[0],
    );
  });

  it("does not treat user or custom message_end events as stream activity", () => {
    const harness = createHarness({ streamHandled: false });
    const userEvent = {
      type: "message_end",
      message: {
        role: "user",
        content: [{ type: "text", text: "Remember that my favorite day is the ides of march" }],
      },
    };
    const customEvent = {
      type: "message_end",
      message: {
        role: "custom",
        customType: "ambient-provider-selection-context",
        content: "Ambient provider-selection reminder",
      },
    };

    harness.emit(userEvent);
    harness.emit(customEvent);

    expect(harness.recordPiStreamTraceEvent).not.toHaveBeenCalled();
    expect(harness.markPiStreamActivity).not.toHaveBeenCalled();
    expect(harness.streamEventDispatcher.handle).toHaveBeenNthCalledWith(
      1,
      { kind: "unknown" },
      userEvent,
      { assistantStartEvent: false },
    );
    expect(harness.streamEventDispatcher.handle).toHaveBeenNthCalledWith(
      2,
      { kind: "unknown" },
      customEvent,
      { assistantStartEvent: false },
    );
    expect(harness.toolEventDispatcher.handle).toHaveBeenNthCalledWith(1, { kind: "unknown" }, userEvent, 1);
    expect(harness.toolEventDispatcher.handle).toHaveBeenNthCalledWith(2, { kind: "unknown" }, customEvent, 2);
  });

  it("still dispatches unknown non-assistant events without stream trace activity", () => {
    const harness = createHarness({ streamHandled: false });
    const event = { type: "custom_provider_signal" };

    harness.emit(event);

    expect(harness.recordPiStreamTraceEvent).not.toHaveBeenCalled();
    expect(harness.markPiStreamActivity).not.toHaveBeenCalled();
    expect(harness.streamEventDispatcher.handle).toHaveBeenCalledWith(
      { kind: "unknown" },
      event,
      { assistantStartEvent: false },
    );
    expect(harness.toolEventDispatcher.handle).toHaveBeenCalledWith({ kind: "unknown" }, event, 1);
  });
});
