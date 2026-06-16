import { describe, expect, it } from "vitest";
import type { SubagentMailboxEventSummary, SubagentRunEventSummary } from "../../shared/types";
import {
  subagentChildTranscriptMailboxEventRows,
  subagentChildTranscriptRuntimeEventRows,
  subagentChildTranscriptState,
} from "./subagentChildTranscriptUiModel";

describe("subagentChildTranscriptUiModel", () => {
  it("keeps running child transcripts live without a terminal summary", () => {
    const state = subagentChildTranscriptState({
      status: "running",
      statusLabel: "Running",
      statusTone: "active",
      preview: "Reading files.",
    });

    expect(state).toMatchObject({
      statusLabel: "Live",
      statusTone: "active",
      isTerminal: false,
      isSynthesisSafe: false,
      liveMarker: {
        label: "Child is running",
        tone: "active",
      },
    });
    expect(state.liveMarker?.detail).toContain("tool calls");
    expect(state.terminalSummary).toBeUndefined();
  });

  it("marks child approval waits as parent-action pauses instead of final summaries", () => {
    const state = subagentChildTranscriptState({
      status: "needs_attention",
      statusLabel: "Needs attention",
      statusTone: "warning",
      preview: "Approval requested.",
    });

    expect(state).toMatchObject({
      statusLabel: "Needs action",
      isTerminal: false,
      liveMarker: {
        label: "Child is paused for parent action",
        tone: "warning",
      },
    });
    expect(state.liveMarker?.detail).toContain("parent returns to waiting");
    expect(state.terminalSummary).toBeUndefined();
  });

  it("shows a completion end cap only after a synthesis-safe child result", () => {
    const state = subagentChildTranscriptState({
      status: "completed",
      statusLabel: "Completed",
      statusTone: "success",
      preview: "Summary ready for the parent.",
    });

    expect(state).toMatchObject({
      statusLabel: "Completed",
      statusTone: "success",
      isTerminal: true,
      isSynthesisSafe: true,
      terminalSummary: {
        label: "Completion summary",
        status: "Completed",
        detail: "Summary ready for the parent.",
        tone: "success",
      },
    });
    expect(state.liveMarker).toBeUndefined();
  });

  it("bounds long terminal summaries so they cannot bury the transcript", () => {
    const state = subagentChildTranscriptState({
      status: "completed",
      statusLabel: "Completed",
      statusTone: "success",
      preview: `Structured result ${"with verbose evidence ".repeat(40)}`,
    });

    expect(state.terminalSummary?.detail.length).toBeLessThanOrEqual(280);
    expect(state.terminalSummary?.detail).toContain("Full child output remains in the transcript above.");
  });

  it("labels terminal partial or failed child results without calling them synthesis-safe completions", () => {
    const state = subagentChildTranscriptState({
      status: "aborted_partial",
      statusLabel: "Aborted partial",
      statusTone: "warning",
      preview: "",
    });

    expect(state).toMatchObject({
      isTerminal: true,
      isSynthesisSafe: false,
      terminalSummary: {
        label: "Final child status",
        status: "Aborted partial",
        tone: "warning",
      },
    });
    expect(state.terminalSummary?.detail).toContain("partial result");
  });

  it("builds bounded recent child runtime event rows for the inline transcript", () => {
    const rows = subagentChildTranscriptRuntimeEventRows([
      event(1, "subagent.session.started", { summary: "Child session started." }),
      event(2, "subagent.approval.blocked", { message: "Needs parent approval." }),
      event(3, "subagent.tool.failed", { reason: "Read failed." }, ".ambient/subagents/run/tool.json"),
      event(4, "subagent.completed", { summary: "Child returned a result." }),
    ], { limit: 3 });

    expect(rows).toEqual([
      expect.objectContaining({
        key: "run-1:2:subagent.approval.blocked",
        label: "Subagent Approval Blocked",
        detail: "Needs parent approval.",
        tone: "warning",
      }),
      expect.objectContaining({
        key: "run-1:3:subagent.tool.failed",
        label: "Subagent Tool Failed",
        detail: "Read failed. / Artifact: .ambient/subagents/run/tool.json",
        artifactPath: ".ambient/subagents/run/tool.json",
        tone: "danger",
      }),
      expect.objectContaining({
        key: "run-1:4:subagent.completed",
        label: "Subagent Completed",
        detail: "Child returned a result.",
        tone: "success",
      }),
    ]);
  });

  it("keeps retry and approval runtime labels readable in live child transcripts", () => {
    const rows = subagentChildTranscriptRuntimeEventRows([
      event(1, "subagent.retry_child_session_starting", {
        idempotencyKey: "subagent:retry:run-1",
        previousStatus: "failed",
        messagePreview: "Retry the original delegated task in this same visible child thread.",
      }),
      event(2, "subagent.retry_consumed", {
        deliveryState: "consumed",
        mailboxEventId: "mailbox-retry",
      }),
      event(3, "subagent.approval_response.consumed", {
        approvalId: "approval-1",
        toolName: "Workspace Read",
      }),
      event(4, "subagent.result_contract_repair_exhausted", {
        reason: "Structured result roleId must match child role explorer.",
        maxAttempts: 3,
      }),
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        label: "Retry child session starting",
        detail: "Retry the original delegated task in this same visible child thread.",
        tone: "active",
      }),
      expect.objectContaining({
        label: "Retry request consumed",
        detail: "Delivery state: consumed / Mailbox event ID: mailbox-retry",
        tone: "active",
      }),
      expect.objectContaining({
        label: "Approval response delivered",
        detail: "Approval ID: approval-1 / Tool name: Workspace Read",
        tone: "warning",
      }),
      expect.objectContaining({
        label: "Result repair exhausted",
        detail: "Structured result roleId must match child role explorer.",
        tone: "danger",
      }),
    ]);
    expect(rows[0]?.detail).not.toContain("idempotencyKey");
  });

  it("renders queued parent-to-child mailbox work as child timeline rows", () => {
    const rows = subagentChildTranscriptMailboxEventRows([
      mailboxEvent("mailbox-retry", "subagent.retry", "queued", {
        previousStatus: "failed",
        message: "Retry the original delegated task in this same visible child thread.",
      }, "parent_to_child", 1),
      mailboxEvent("mailbox-followup", "subagent.followup", "queued", {
        messagePreview: "Please finish with a concise result.",
      }, "parent_to_child", 2),
      mailboxEvent("mailbox-approval", "subagent.approval_response", "consumed", {
        approvalId: "approval-1",
        decision: "approved",
        effectiveScope: "this_child_thread",
      }, "parent_to_child", 3),
      mailboxEvent("child-to-parent", "subagent.retry", "queued", {}, "child_to_parent", 4),
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        label: "Parent retry request",
        detail: "Delivery: queued / Retry the original delegated task in this same visible child thread.",
        tone: "active",
      }),
      expect.objectContaining({
        label: "Parent follow-up queued",
        detail: "Delivery: queued / Please finish with a concise result.",
        tone: "active",
      }),
      expect.objectContaining({
        label: "Parent approval response",
        detail: "Delivery: consumed / Decision: approved / Effective scope: this_child_thread / Approval ID: approval-1",
        tone: "success",
      }),
    ]);
  });
});

function event(
  sequence: number,
  type: string,
  preview?: unknown,
  artifactPath?: string,
): SubagentRunEventSummary {
  return {
    runId: "run-1",
    sequence,
    type,
    createdAt: `2026-06-13T00:00:0${sequence}.000Z`,
    ...(preview !== undefined ? { preview } : {}),
    ...(artifactPath ? { artifactPath } : {}),
  };
}

function mailboxEvent(
  id: string,
  type: string,
  deliveryState: SubagentMailboxEventSummary["deliveryState"],
  payload: unknown,
  direction: SubagentMailboxEventSummary["direction"] = "parent_to_child",
  second = 1,
): SubagentMailboxEventSummary {
  return {
    id,
    runId: "run-1",
    direction,
    type,
    payload,
    deliveryState,
    createdAt: `2026-06-13T00:01:0${second}.000Z`,
  };
}
