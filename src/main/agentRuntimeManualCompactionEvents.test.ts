import { describe, expect, it } from "vitest";

import type { DesktopEvent } from "../shared/types";
import { createManualCompactionEventHandler } from "./agentRuntimeManualCompactionEvents";

interface Harness {
  handler: ReturnType<typeof createManualCompactionEventHandler<object>>;
  session: object;
  events: DesktopEvent[];
  snapshots: Array<{ threadId: string; session: object; message?: string }>;
}

function createHarness(): Harness {
  const session = {};
  const events: DesktopEvent[] = [];
  const snapshots: Array<{ threadId: string; session: object; message?: string }> = [];
  return {
    session,
    events,
    snapshots,
    handler: createManualCompactionEventHandler({
      threadId: "thread-1",
      session,
      recordContextUsageSnapshot: (threadId, currentSession, message) => {
        snapshots.push({ threadId, session: currentSession, message });
      },
      emit: (event) => events.push(event),
    }),
  };
}

describe("createManualCompactionEventHandler", () => {
  it("records and emits manual compaction start events", () => {
    const harness = createHarness();

    harness.handler.handle({ type: "compaction_start", reason: "manual" });

    expect(harness.snapshots).toEqual([
      {
        threadId: "thread-1",
        session: harness.session,
        message: "Manual compaction started.",
      },
    ]);
    expect(harness.events).toEqual([
      {
        type: "runtime-activity",
        activity: {
          threadId: "thread-1",
          kind: "compaction",
          status: "starting",
          reason: "manual",
        },
      },
    ]);
    expect(harness.handler.runtimeError).toBeUndefined();
  });

  it("records and emits compaction end events", () => {
    const harness = createHarness();

    harness.handler.handle({
      type: "compaction_end",
      reason: "threshold",
      aborted: false,
      willRetry: true,
      errorMessage: "compaction retrying",
    });

    expect(harness.snapshots).toEqual([
      {
        threadId: "thread-1",
        session: harness.session,
        message: "compaction retrying",
      },
    ]);
    expect(harness.events).toEqual([
      {
        type: "runtime-activity",
        activity: {
          threadId: "thread-1",
          kind: "compaction",
          status: "finished",
          reason: "threshold",
          aborted: false,
          willRetry: true,
          message: "compaction retrying",
        },
      },
    ]);
    expect(harness.handler.runtimeError).toBe("compaction retrying");
  });

  it("does not treat aborted compaction errors as runtime errors", () => {
    const harness = createHarness();

    harness.handler.handle({
      type: "compaction_end",
      reason: "overflow",
      aborted: true,
      willRetry: false,
      errorMessage: "compaction cancelled",
    });

    expect(harness.events).toEqual([
      {
        type: "runtime-activity",
        activity: {
          threadId: "thread-1",
          kind: "compaction",
          status: "finished",
          reason: "overflow",
          aborted: true,
          willRetry: false,
          message: "compaction cancelled",
        },
      },
    ]);
    expect(harness.handler.runtimeError).toBeUndefined();
  });

  it("ignores unrelated Pi events", () => {
    const harness = createHarness();

    harness.handler.handle({ type: "assistant_update", delta: "hello" });

    expect(harness.snapshots).toEqual([]);
    expect(harness.events).toEqual([]);
    expect(harness.handler.runtimeError).toBeUndefined();
  });
});
