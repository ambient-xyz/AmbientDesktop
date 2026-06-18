import { describe, expect, it } from "vitest";
import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
} from "../../shared/subagentTypes";
import {
  compactSubagentPiToolMailboxEvent,
  compactSubagentPiToolParentMailboxEvent,
  compactSubagentPiToolRunEvent,
  previewSubagentPiToolText,
  subagentPiToolResult,
  SUBAGENT_PI_TOOL_RESULT_SCHEMA_VERSION,
} from "./subagentPiToolResult";

describe("subagentPiToolResult", () => {
  it("builds Pi tool results without mutating detail payloads", () => {
    const details = { runId: "child-run", status: "running" };
    expect(SUBAGENT_PI_TOOL_RESULT_SCHEMA_VERSION).toBe("ambient-subagent-pi-tool-result-v1");
    expect(subagentPiToolResult("Queued follow-up.", details)).toEqual({
      content: [{ type: "text", text: "Queued follow-up." }],
      details,
    });
  });

  it("compacts run events with bounded handles and optional preview/artifact fields", () => {
    const event: SubagentRunEventSummary = {
      runId: "child-run",
      sequence: 7,
      type: "subagent.followup_agent.queued",
      createdAt: "2026-06-06T00:00:00.000Z",
      preview: { idempotencyKey: "follow:child" },
      artifactPath: "artifacts/followup.json",
    };

    expect(compactSubagentPiToolRunEvent(event)).toEqual({
      sequence: 7,
      type: "subagent.followup_agent.queued",
      createdAt: "2026-06-06T00:00:00.000Z",
      preview: { idempotencyKey: "follow:child" },
      artifactPath: "artifacts/followup.json",
    });
    expect(compactSubagentPiToolRunEvent({
      runId: "child-run",
      sequence: 8,
      type: "subagent.status",
      createdAt: "2026-06-06T00:00:01.000Z",
    })).toEqual({
      sequence: 8,
      type: "subagent.status",
      createdAt: "2026-06-06T00:00:01.000Z",
    });
  });

  it("compacts mailbox and parent-mailbox events into Pi-visible handles", () => {
    const mailbox: SubagentMailboxEventSummary = {
      id: "mailbox-1",
      runId: "child-run",
      direction: "parent_to_child",
      type: "subagent.message",
      payload: { message: "continue" },
      deliveryState: "delivered",
      createdAt: "2026-06-06T00:00:00.000Z",
      deliveredAt: "2026-06-06T00:00:02.000Z",
    };
    const parentMailbox: SubagentParentMailboxEventSummary = {
      id: "parent-mailbox-1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.grouped_completion",
      payload: { notificationCount: 2, childRunIds: ["child-a"], childRuns: [{ runId: "child-b" }] },
      deliveryState: "queued",
      idempotencyKey: "group:children",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:01.000Z",
    };

    expect(compactSubagentPiToolMailboxEvent(mailbox)).toEqual({
      id: "mailbox-1",
      runId: "child-run",
      direction: "parent_to_child",
      type: "subagent.message",
      deliveryState: "delivered",
      createdAt: "2026-06-06T00:00:00.000Z",
      deliveredAt: "2026-06-06T00:00:02.000Z",
    });
    expect(compactSubagentPiToolParentMailboxEvent(parentMailbox)).toEqual(expect.objectContaining({
      id: "parent-mailbox-1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.grouped_completion",
      idempotencyKey: "group:children",
      notificationCount: 2,
      childRunIds: ["child-a", "child-b"],
    }));
  });

  it("compacts singular child approval mailbox attribution for Pi-visible handles", () => {
    const parentMailbox: SubagentParentMailboxEventSummary = {
      id: "parent-mailbox-approval",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.child_approval_requested",
      payload: { childRunId: "child-approval", approvalId: "approval-write" },
      deliveryState: "queued",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:01.000Z",
    };

    expect(compactSubagentPiToolParentMailboxEvent(parentMailbox)).toEqual(expect.objectContaining({
      type: "subagent.child_approval_requested",
      childRunIds: ["child-approval"],
    }));
  });

  it("compacts singular child supervisor mailbox attribution for Pi-visible handles", () => {
    const parentMailbox: SubagentParentMailboxEventSummary = {
      id: "parent-mailbox-supervisor",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.child_supervisor_request",
      payload: {
        schemaVersion: "ambient-subagent-supervisor-request-v1",
        childRunId: "child-supervisor",
        kind: "need_decision",
        title: "Choose source strategy",
        messagePreview: "Use docs only or inspect source before summarizing.",
        parentRequiresAttention: true,
        marksChildComplete: false,
      },
      deliveryState: "queued",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:01.000Z",
    };

    expect(compactSubagentPiToolParentMailboxEvent(parentMailbox)).toEqual(expect.objectContaining({
      type: "subagent.child_supervisor_request",
      childRunIds: ["child-supervisor"],
    }));
  });

  it("keeps wait-barrier decision requests visible in Pi parent-mailbox handles", () => {
    const parentMailbox: SubagentParentMailboxEventSummary = {
      id: "parent-mailbox-barrier",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.wait_barrier_attention",
      payload: {
        childRunIds: ["child-a", "child-b"],
        childDecisionRequest: {
          schemaVersion: "ambient-symphony-child-decision-request-v1",
          requestId: "symphony-child-decision:parent-run:barrier-1:failed:2026",
          barrierId: "barrier-1",
          parentRunId: "parent-run",
          childRunIds: ["child-a", "child-b"],
          reason: "failed",
          options: ["retry_child", "cancel_group", "exit_symphony_mode"],
          recommendedOption: "retry_child",
          optionActions: [
            { option: "retry_child", toolAction: "resolve_barrier", decision: "retry_child" },
            { option: "cancel_group", toolAction: "resolve_barrier", decision: "cancel_parent", requiresUserDecision: true },
            { option: "exit_symphony_mode", toolAction: "resolve_barrier", decision: "fail_parent" },
          ],
          evidenceRefs: ["wait-barrier:barrier-1", "subagent-run:child-a", "subagent-run:child-b"],
          ignoredLargeField: "x".repeat(5000),
        },
        symphonyDecisionOptions: [
          { id: "retry_child", label: "Retry child", recommended: true },
          { id: "cancel_group", label: "Cancel group", recommended: false },
          { id: "exit_symphony_mode", label: "Exit Symphony", recommended: false },
        ],
      },
      deliveryState: "queued",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:01.000Z",
    };

    expect(compactSubagentPiToolParentMailboxEvent(parentMailbox)).toEqual(expect.objectContaining({
      type: "subagent.wait_barrier_attention",
      childRunIds: ["child-a", "child-b"],
      childDecisionRequest: {
        schemaVersion: "ambient-symphony-child-decision-request-v1",
        requestId: "symphony-child-decision:parent-run:barrier-1:failed:2026",
        barrierId: "barrier-1",
        parentRunId: "parent-run",
        childRunIds: ["child-a", "child-b"],
        reason: "failed",
        options: ["retry_child", "cancel_group", "exit_symphony_mode"],
        recommendedOption: "retry_child",
        optionActions: [
          { option: "retry_child", toolAction: "resolve_barrier", decision: "retry_child" },
          { option: "cancel_group", toolAction: "resolve_barrier", decision: "cancel_parent", requiresUserDecision: true },
          { option: "exit_symphony_mode", toolAction: "resolve_barrier", decision: "fail_parent" },
        ],
        evidenceRefs: ["wait-barrier:barrier-1", "subagent-run:child-a", "subagent-run:child-b"],
      },
      symphonyDecisionOptions: [
        { id: "retry_child", label: "Retry child", recommended: true },
        { id: "cancel_group", label: "Cancel group", recommended: false },
        { id: "exit_symphony_mode", label: "Exit Symphony", recommended: false },
      ],
    }));
  });

  it("normalizes and truncates Pi-visible preview text", () => {
    expect(previewSubagentPiToolText("  A\n  compact\tpreview  ")).toBe("A compact preview");
    expect(previewSubagentPiToolText("abcdef", 5)).toBe("ab...");
  });
});
