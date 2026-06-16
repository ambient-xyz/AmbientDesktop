import { describe, expect, it } from "vitest";

import { createRuntimePromptControlState } from "./runtimePromptControlState";

describe("createRuntimePromptControlState", () => {
  it("starts with queue, event, and stream-timeout control state unset", () => {
    const state = createRuntimePromptControlState();

    expect(state.snapshot()).toEqual({
      queueReady: false,
      runEventSeq: 0,
      streamWatchdogTimedOut: false,
      streamWatchdogTimeoutMessage: undefined,
    });
  });

  it("marks the queued-message gate ready", () => {
    const state = createRuntimePromptControlState();

    state.markQueueReady();

    expect(state.isQueueReady()).toBe(true);
    expect(state.snapshot().queueReady).toBe(true);
  });

  it("increments and returns the run event sequence", () => {
    const state = createRuntimePromptControlState();

    expect(state.incrementRunEventSeq()).toBe(1);
    expect(state.incrementRunEventSeq()).toBe(2);

    expect(state.runEventSeq()).toBe(2);
    expect(state.snapshot().runEventSeq).toBe(2);
  });

  it("tracks stream timeout status and timeout message", () => {
    const state = createRuntimePromptControlState();

    state.markStreamTimedOut();
    state.setStreamWatchdogTimeoutMessage("Ambient/Pi stream stalled after 30000 ms without stream activity.");

    expect(state.isStreamTimedOut()).toBe(true);
    expect(state.streamWatchdogTimeoutMessage()).toBe("Ambient/Pi stream stalled after 30000 ms without stream activity.");
    expect(state.snapshot()).toMatchObject({
      streamWatchdogTimedOut: true,
      streamWatchdogTimeoutMessage: "Ambient/Pi stream stalled after 30000 ms without stream activity.",
    });
  });

  it("allows the stream timeout message to be cleared", () => {
    const state = createRuntimePromptControlState();

    state.setStreamWatchdogTimeoutMessage("temporary timeout");
    state.setStreamWatchdogTimeoutMessage(undefined);

    expect(state.streamWatchdogTimeoutMessage()).toBeUndefined();
    expect(state.snapshot().streamWatchdogTimeoutMessage).toBeUndefined();
  });
});
