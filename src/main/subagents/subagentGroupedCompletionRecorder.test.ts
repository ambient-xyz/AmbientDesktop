import { describe, expect, it, vi } from "vitest";

import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
} from "../../shared/types";
import {
  recordSubagentGroupedCompletionNotificationIfNeeded,
  SUBAGENT_GROUPED_COMPLETION_RECORDER_SCHEMA_VERSION,
  subagentGroupedCompletionSummary,
  type SubagentGroupedCompletionRecorderStore,
} from "./subagentGroupedCompletionRecorder";

describe("subagentGroupedCompletionRecorder", () => {
  it("records optional background completions with bounded artifact summaries", () => {
    const store = fakeStore();
    const event = recordSubagentGroupedCompletionNotificationIfNeeded({
      store,
      run: childRun({
        status: "completed",
        parentMessageId: "assistant-message",
        resultArtifact: { summary: "Child produced a synthesis-safe background note." },
        completedAt: "2026-06-06T00:00:00.000Z",
      }),
      synthesisAllowed: true,
    });

    expect(SUBAGENT_GROUPED_COMPLETION_RECORDER_SCHEMA_VERSION)
      .toBe("ambient-subagent-grouped-completion-recorder-v1");
    expect(store.upsertSubagentGroupedCompletionNotification).toHaveBeenCalledTimes(1);
    expect(store.upsertSubagentGroupedCompletionNotification).toHaveBeenCalledWith({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      child: {
        runId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:researcher",
        roleId: "researcher",
        status: "completed",
        summary: "Child produced a synthesis-safe background note.",
        completedAt: "2026-06-06T00:00:00.000Z",
      },
    });
    expect(event).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      type: "subagent.grouped_completion",
      deliveryState: "queued",
    });
  });

  it("records terminal partial or failed background children without requiring synthesis-safe completion", () => {
    const store = fakeStore();

    recordSubagentGroupedCompletionNotificationIfNeeded({
      store,
      run: childRun({ status: "aborted_partial", resultArtifact: { summary: "Partial but worth surfacing." } }),
      synthesisAllowed: false,
    });

    expect(store.upsertSubagentGroupedCompletionNotification).toHaveBeenCalledWith(expect.objectContaining({
      child: expect.objectContaining({
        status: "aborted_partial",
        summary: "Partial but worth surfacing.",
      }),
    }));
  });

  it("does not record required, active, or unsafe completed children", () => {
    const store = fakeStore();

    expect(recordSubagentGroupedCompletionNotificationIfNeeded({
      store,
      run: childRun({ dependencyMode: "required", status: "completed" }),
      synthesisAllowed: true,
    })).toBeUndefined();
    expect(recordSubagentGroupedCompletionNotificationIfNeeded({
      store,
      run: childRun({ status: "running" }),
      synthesisAllowed: true,
    })).toBeUndefined();
    expect(recordSubagentGroupedCompletionNotificationIfNeeded({
      store,
      run: childRun({ status: "completed" }),
      synthesisAllowed: false,
    })).toBeUndefined();

    expect(store.upsertSubagentGroupedCompletionNotification).not.toHaveBeenCalled();
  });

  it("falls back to canonical path status and truncates long summaries", () => {
    const fallback = subagentGroupedCompletionSummary(childRun({
      status: "failed",
      resultArtifact: { note: "No summary field." },
    }));
    const longSummary = subagentGroupedCompletionSummary(childRun({
      status: "completed",
      resultArtifact: { summary: "x".repeat(1300) },
    }));

    expect(fallback).toBe("root/0:researcher finished with status failed.");
    expect(longSummary).toHaveLength(1200);
    expect(longSummary.endsWith("...")).toBe(true);
  });
});

function fakeStore(): SubagentGroupedCompletionRecorderStore & {
  upsertSubagentGroupedCompletionNotification: ReturnType<typeof vi.fn>;
} {
  const upsertSubagentGroupedCompletionNotification = vi.fn((input): SubagentParentMailboxEventSummary => ({
    id: `parent-mailbox-${upsertSubagentGroupedCompletionNotification.mock.calls.length}`,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: "subagent.grouped_completion",
    payload: {
      childRuns: [input.child],
    },
    deliveryState: "queued",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  }));
  return { upsertSubagentGroupedCompletionNotification };
}

function childRun(input: {
  dependencyMode?: SubagentRunSummary["dependencyMode"];
  status: SubagentRunSummary["status"];
  parentMessageId?: string;
  resultArtifact?: unknown;
  completedAt?: string;
}): SubagentRunSummary {
  return {
    id: "child-run",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:researcher",
    roleId: "researcher",
    dependencyMode: input.dependencyMode ?? "optional_background",
    status: input.status,
    ...(input.resultArtifact ? { resultArtifact: input.resultArtifact } : {}),
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
  } as SubagentRunSummary;
}
