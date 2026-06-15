import { describe, expect, it } from "vitest";

import {
  runtimeSubagentDirectChildStoppedActivity,
  runtimeSubagentParentControlAbortActivity,
  runtimeSubagentParentStopCascadeActivity,
} from "./agentRuntimeSubagentParentControlActivity";

describe("agentRuntimeSubagentParentControlActivity", () => {
  it("builds the parent-control abort activity", () => {
    expect(runtimeSubagentParentControlAbortActivity({
      threadId: "thread-1",
      outputChars: 12,
      thinkingChars: 4,
      intent: {
        reason: "Parent run cancelled.",
        message: "Parent run cancelled.",
        toolCallId: "tool-call-1",
        parentRunId: "parent-run-1",
        waitBarrierId: "barrier-1",
        idempotencyKey: "idem-1",
        decision: "cancel_parent",
      },
    })).toEqual({
      threadId: "thread-1",
      kind: "stream",
      status: "running",
      outputChars: 12,
      thinkingChars: 4,
      message: "Parent run cancelled.",
      diagnostic: {
        reason: "subagent_parent_control_cancel_parent",
        toolCallId: "tool-call-1",
        parentRunId: "parent-run-1",
        waitBarrierId: "barrier-1",
        idempotencyKey: "idem-1",
        decision: "cancel_parent",
      },
    });
  });

  it("preserves optional diagnostic keys as undefined like the inline activity did", () => {
    expect(runtimeSubagentParentControlAbortActivity({
      threadId: "thread-1",
      outputChars: 0,
      thinkingChars: 0,
      intent: {
        reason: "Parent run cancelled.",
        message: "Parent run cancelled.",
        toolCallId: "tool-call-1",
      },
    })).toEqual({
      threadId: "thread-1",
      kind: "stream",
      status: "running",
      outputChars: 0,
      thinkingChars: 0,
      message: "Parent run cancelled.",
      diagnostic: {
        reason: "subagent_parent_control_cancel_parent",
        toolCallId: "tool-call-1",
        parentRunId: undefined,
        waitBarrierId: undefined,
        idempotencyKey: undefined,
        decision: undefined,
      },
    });
  });

  it("builds the direct child stopped activity", () => {
    expect(runtimeSubagentDirectChildStoppedActivity({
      threadId: "parent-thread-1",
      canonicalTaskPath: "research/child-a",
    })).toEqual({
      threadId: "parent-thread-1",
      kind: "stream",
      status: "running",
      outputChars: 0,
      message: "Stopped sub-agent child research/child-a; sibling children continue.",
    });
  });

  it("builds parent stop cascade activities with the existing pluralization", () => {
    expect(runtimeSubagentParentStopCascadeActivity({
      threadId: "parent-thread-1",
      cancelledRunCount: 1,
      detachedRunCount: 0,
      changedRunCount: 1,
    })).toEqual({
      threadId: "parent-thread-1",
      kind: "stream",
      status: "running",
      outputChars: 0,
      message: "Stopped parent run cascaded to 1 cancelled and 0 detached sub-agent child thread.",
    });
    expect(runtimeSubagentParentStopCascadeActivity({
      threadId: "parent-thread-2",
      cancelledRunCount: 2,
      detachedRunCount: 1,
      changedRunCount: 3,
    })).toEqual({
      threadId: "parent-thread-2",
      kind: "stream",
      status: "running",
      outputChars: 0,
      message: "Stopped parent run cascaded to 2 cancelled and 1 detached sub-agent child threads.",
    });
  });
});
