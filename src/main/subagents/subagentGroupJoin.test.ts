import { describe, expect, it } from "vitest";
import {
  buildSubagentGroupedCompletionNotificationDraft,
  createSubagentGroupedCompletionIdempotencyKey,
  createSubagentGroupedCompletionPayloadFingerprint,
  SUBAGENT_GROUPED_COMPLETION_SCHEMA_VERSION,
} from "./subagentGroupJoin";

describe("subagentGroupJoin", () => {
  it("creates a queued parent mailbox notification for the first background completion", () => {
    const draft = buildSubagentGroupedCompletionNotificationDraft({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      child: childCompletion({ runId: "child-run-1" }),
    });

    expect(draft.payload).toEqual({
      schemaVersion: SUBAGENT_GROUPED_COMPLETION_SCHEMA_VERSION,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      status: "queued",
      notificationCount: 1,
      childRuns: [childCompletion({ runId: "child-run-1" })],
    });
    expect(draft.payloadFingerprint).toBe(createSubagentGroupedCompletionPayloadFingerprint([{ runId: "child-run-1" }]));
    expect(draft.idempotencyKey).toBe(createSubagentGroupedCompletionIdempotencyKey(draft.payloadFingerprint));
  });

  it("updates an existing child completion in place without creating duplicate child rows", () => {
    const original = buildSubagentGroupedCompletionNotificationDraft({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      child: childCompletion({ runId: "child-run-1", summary: "Original summary." }),
    });
    const updated = buildSubagentGroupedCompletionNotificationDraft({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      existingPayload: original.payload,
      child: childCompletion({ runId: "child-run-1", status: "aborted_partial", summary: "Updated partial summary." }),
    });

    expect(updated.payload.notificationCount).toBe(1);
    expect(updated.payload.childRuns).toEqual([
      childCompletion({ runId: "child-run-1", status: "aborted_partial", summary: "Updated partial summary." }),
    ]);
    expect(updated.idempotencyKey).toBe(original.idempotencyKey);
  });

  it("rebatches straggler completions into the latest queued parent notification", () => {
    const first = buildSubagentGroupedCompletionNotificationDraft({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      existingPayload: { schemaVersion: "unknown", childRuns: [{ runId: "ignored" }] },
      child: childCompletion({ runId: "child-run-1", summary: "First child completed." }),
    });
    const rebatch = buildSubagentGroupedCompletionNotificationDraft({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      existingPayload: first.payload,
      child: childCompletion({ runId: "child-run-2", summary: "Second child completed later." }),
    });

    expect(rebatch.payload.notificationCount).toBe(2);
    expect(rebatch.payload.childRuns.map((child) => child.runId)).toEqual(["child-run-1", "child-run-2"]);
    expect(rebatch.payload.childRuns.map((child) => child.summary)).toEqual([
      "First child completed.",
      "Second child completed later.",
    ]);
    expect(rebatch.payloadFingerprint).toBe(createSubagentGroupedCompletionPayloadFingerprint([
      { runId: "child-run-2" },
      { runId: "child-run-1" },
    ]));
    expect(rebatch.idempotencyKey).not.toBe(first.idempotencyKey);
  });
});

function childCompletion(overrides: {
  runId: string;
  status?: "completed" | "aborted_partial";
  summary?: string;
}) {
  return {
    runId: overrides.runId,
    childThreadId: `${overrides.runId}-thread`,
    canonicalTaskPath: `root/1:${overrides.runId}`,
    roleId: "summarizer",
    status: overrides.status ?? "completed",
    summary: overrides.summary ?? "Child completed.",
    completedAt: "2026-06-05T12:00:00.000Z",
  };
}
