import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentRunSummary } from "../../shared/types";
import {
  assertCanCloseSubagentRun,
  buildSubagentCloseAgentChildThreadMessage,
  buildSubagentCloseAgentReplayText,
  buildSubagentCloseAgentResultText,
  buildSubagentCloseRequestedRunEventPreview,
  CLOSE_BLOCKED_ACTIVE_STATUSES,
  createSubagentCloseAgentIdempotencyKey,
  DEFAULT_SUBAGENT_CLOSE_REASON,
  resolveSubagentCloseAgentRequest,
  SUBAGENT_CLOSE_REQUEST_EVENT_TYPE,
  SUBAGENT_CLOSE_RETAINED_HISTORY_MESSAGE,
} from "./subagentCloseAgent";

describe("subagentCloseAgent", () => {
  it("resolves default reasons and stable close idempotency keys", () => {
    const child = run({ id: "child-a", canonicalTaskPath: "root/0:reviewer" });
    const first = resolveSubagentCloseAgentRequest({ run: child });
    const replay = resolveSubagentCloseAgentRequest({ run: child });
    const explicit = resolveSubagentCloseAgentRequest({
      run: child,
      reason: "Release capacity after review.",
      idempotencyKey: "close:review",
    });

    expect(first).toEqual({
      reason: DEFAULT_SUBAGENT_CLOSE_REASON,
      idempotencyKey: replay.idempotencyKey,
    });
    expect(first.idempotencyKey).toContain("subagent:close:");
    expect(createSubagentCloseAgentIdempotencyKey({
      run: child,
      reason: "Release capacity after review.",
    })).toContain("subagent:close:");
    expect(explicit).toEqual({
      reason: "Release capacity after review.",
      idempotencyKey: "close:review",
    });
  });

  it("blocks active children from closing but allows inactive or already-closed children", () => {
    expect([...CLOSE_BLOCKED_ACTIVE_STATUSES]).toEqual(["reserved", "starting", "running", "waiting"]);
    for (const status of ["reserved", "starting", "running", "waiting"] as const) {
      expect(() => assertCanCloseSubagentRun(run({ id: `child-${status}`, status })))
        .toThrow(`Cannot close active sub-agent child-${status} (${status})`);
    }
    for (const status of ["completed", "failed", "needs_attention", "cancelled", "detached", "aborted_partial"] as const) {
      expect(() => assertCanCloseSubagentRun(run({ status }))).not.toThrow();
    }
    expect(() => assertCanCloseSubagentRun(run({ status: "running", closedAt: "2026-06-06T12:00:00.000Z" }))).not.toThrow();
  });

  it("builds stable close run-event previews", () => {
    const child = run({ id: "child-a", canonicalTaskPath: "root/0:reviewer" });
    expect(buildSubagentCloseRequestedRunEventPreview({
      run: child,
      idempotencyKey: "close:review",
      reason: "Release capacity after review.",
      toolCallId: "tool-close",
    })).toEqual({
      childRunId: "child-a",
      childThreadId: "child-thread",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      canonicalTaskPath: "root/0:reviewer",
      idempotencyKey: "close:review",
      reason: "Release capacity after review.",
      toolCallId: "tool-close",
    });
    expect(SUBAGENT_CLOSE_REQUEST_EVENT_TYPE).toBe("subagent.close_requested");
  });

  it("builds close messages that preserve transcript and artifact expectations", () => {
    expect(buildSubagentCloseAgentChildThreadMessage({
      reason: "Release capacity after review.",
    })).toBe(`Sub-agent closed by parent. ${SUBAGENT_CLOSE_RETAINED_HISTORY_MESSAGE}\n\nReason: Release capacity after review.`);
    expect(buildSubagentCloseAgentReplayText({
      canonicalTaskPath: "root/0:reviewer",
    })).toBe("Sub-agent root/0:reviewer is already closed; transcript and artifacts remain inspectable.");
    expect(buildSubagentCloseAgentResultText({
      canonicalTaskPath: "root/0:reviewer",
    })).toBe(`Closed sub-agent root/0:reviewer. ${SUBAGENT_CLOSE_RETAINED_HISTORY_MESSAGE}`);
  });
});

function run(overrides: {
  id?: string;
  canonicalTaskPath?: string;
  status?: SubagentRunStatus;
  closedAt?: string;
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: overrides.canonicalTaskPath ?? `root/${id}:reviewer`,
    roleId: "reviewer",
    dependencyMode: "required",
    status: overrides.status ?? "completed",
    ...(overrides.closedAt ? { closedAt: overrides.closedAt } : {}),
  } as SubagentRunSummary;
}
