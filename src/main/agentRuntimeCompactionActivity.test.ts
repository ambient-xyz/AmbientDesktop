import { describe, expect, it } from "vitest";

import {
  runtimeCompactionFinishedActivity,
  runtimeCompactionStartingActivity,
} from "./agentRuntimeCompactionActivity";

describe("agentRuntimeCompactionActivity", () => {
  it("builds compaction starting activity", () => {
    expect(runtimeCompactionStartingActivity({
      threadId: "thread-1",
      reason: "threshold",
    })).toEqual({
      threadId: "thread-1",
      kind: "compaction",
      status: "starting",
      reason: "threshold",
    });
  });

  it("builds compaction finished activity", () => {
    expect(runtimeCompactionFinishedActivity({
      threadId: "thread-1",
      reason: "manual",
      aborted: false,
      willRetry: true,
      message: "Compacted.",
    })).toEqual({
      threadId: "thread-1",
      kind: "compaction",
      status: "finished",
      reason: "manual",
      aborted: false,
      willRetry: true,
      message: "Compacted.",
    });
    expect(runtimeCompactionFinishedActivity({
      threadId: "thread-1",
      reason: "overflow",
      aborted: true,
      willRetry: false,
    })).toEqual({
      threadId: "thread-1",
      kind: "compaction",
      status: "finished",
      reason: "overflow",
      aborted: true,
      willRetry: false,
      message: undefined,
    });
  });
});
