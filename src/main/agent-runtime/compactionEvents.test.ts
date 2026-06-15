import { describe, expect, it } from "vitest";

import { runtimeCompactionEventModel } from "./compactionEvents";

describe("compactionEvents", () => {
  it("models compaction start", () => {
    expect(runtimeCompactionEventModel({
      kind: "compaction-start",
      reason: "threshold",
    }, {
      threadId: "thread-1",
    })).toEqual({
      kind: "start",
      snapshotMessage: "Compaction started.",
      runtimeError: { kind: "preserve" },
      activeRunStatus: "compacting",
      activity: {
        threadId: "thread-1",
        kind: "compaction",
        status: "starting",
        reason: "threshold",
      },
    });
  });

  it("models a successful compaction finish", () => {
    expect(runtimeCompactionEventModel({
      kind: "compaction-end",
      reason: "manual",
      aborted: false,
      willRetry: false,
    }, {
      threadId: "thread-1",
    })).toEqual({
      kind: "end",
      snapshotMessage: undefined,
      runtimeError: { kind: "preserve" },
      activeRunStatus: "streaming",
      activity: {
        threadId: "thread-1",
        kind: "compaction",
        status: "finished",
        reason: "manual",
        aborted: false,
        willRetry: false,
        message: undefined,
      },
    });
  });

  it("preserves runtime error when compaction failed but will retry", () => {
    const model = runtimeCompactionEventModel({
      kind: "compaction-end",
      reason: "overflow",
      aborted: false,
      willRetry: true,
      error: "Context compaction overflowed.",
    }, {
      threadId: "thread-1",
    });

    expect(model.snapshotMessage).toBe("Context compaction overflowed.");
    expect(model.runtimeError).toEqual({ kind: "preserve" });
    expect(model.activeRunStatus).toBe("streaming");
  });

  it("preserves runtime error and status when compaction is aborted", () => {
    const model = runtimeCompactionEventModel({
      kind: "compaction-end",
      reason: "threshold",
      aborted: true,
      willRetry: false,
      error: "Compaction aborted.",
    }, {
      threadId: "thread-1",
    });

    expect(model.runtimeError).toEqual({ kind: "preserve" });
    expect(model.activeRunStatus).toBeUndefined();
  });

  it("sets runtime error when compaction fails without retry or abort", () => {
    const model = runtimeCompactionEventModel({
      kind: "compaction-end",
      reason: "overflow",
      aborted: false,
      willRetry: false,
      error: "Compaction failed.",
    }, {
      threadId: "thread-1",
    });

    expect(model.runtimeError).toEqual({ kind: "set", message: "Compaction failed." });
    expect(model.activeRunStatus).toBe("streaming");
  });
});
