import { describe, expect, it } from "vitest";
import type { SubagentMailboxEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import {
  buildSubagentChildMailboxEventInput,
  buildSubagentChildMailboxQueuedText,
  buildSubagentChildMailboxReplayText,
  buildSubagentChildMailboxRunEventInput,
  buildSubagentChildMailboxThreadMessage,
  compactSubagentChildMailboxEvent,
  compactSubagentChildRuntimeFollowup,
  createSubagentChildMailboxRequestIdempotencyKey,
  resolveSubagentChildMailboxRequest,
  SUBAGENT_CHILD_FOLLOWUP_MAILBOX_TYPE,
  SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION,
  SUBAGENT_CHILD_MESSAGE_MAILBOX_TYPE,
  subagentChildMailboxActionLabel,
  subagentChildMailboxRunEventType,
  subagentChildMailboxTypeForAction,
} from "./subagentMailboxRequest";

describe("subagentMailboxRequest", () => {
  it("maps send and followup actions to typed mailbox and run-event contracts", () => {
    expect(subagentChildMailboxTypeForAction("send_agent")).toBe(SUBAGENT_CHILD_MESSAGE_MAILBOX_TYPE);
    expect(subagentChildMailboxTypeForAction("followup_agent")).toBe(SUBAGENT_CHILD_FOLLOWUP_MAILBOX_TYPE);
    expect(subagentChildMailboxRunEventType("send_agent")).toBe("subagent.send_agent.queued");
    expect(subagentChildMailboxRunEventType("followup_agent")).toBe("subagent.followup_agent.queued");
    expect(subagentChildMailboxActionLabel("send_agent")).toBe("send");
    expect(subagentChildMailboxActionLabel("followup_agent")).toBe("followup");
  });

  it("resolves stable mailbox idempotency and preserves explicit keys", () => {
    const child = run({ id: "child-a", canonicalTaskPath: "root/0:reviewer" });
    const first = resolveSubagentChildMailboxRequest({
      run: child,
      action: "followup_agent",
      message: " Continue with the restart fixture. ",
      toolCallId: "tool-follow",
    });
    const replay = resolveSubagentChildMailboxRequest({
      run: child,
      action: "followup_agent",
      message: "Continue with the restart fixture.",
      toolCallId: "tool-follow",
    });
    const explicit = resolveSubagentChildMailboxRequest({
      run: child,
      action: "send_agent",
      message: "Context only.",
      explicitIdempotencyKey: "send:context",
      toolCallId: "tool-send",
    });

    expect(first).toMatchObject({
      schemaVersion: SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION,
      action: "followup_agent",
      message: "Continue with the restart fixture.",
      idempotencyKey: replay.idempotencyKey,
      eventType: "subagent.followup_agent.queued",
      mailboxType: "subagent.followup",
      toolCallId: "tool-follow",
    });
    expect(first.idempotencyKey).toContain("subagent:followup:");
    expect(createSubagentChildMailboxRequestIdempotencyKey({
      run: child,
      action: "send_agent",
      message: "Context only.",
    })).toContain("subagent:followup:");
    expect(createSubagentChildMailboxRequestIdempotencyKey({
      run: child,
      action: "send_agent",
      message: " Context only. ",
    })).toBe(createSubagentChildMailboxRequestIdempotencyKey({
      run: child,
      action: "send_agent",
      message: "Context only.",
    }));
    expect(explicit.idempotencyKey).toBe("send:context");
    expect(() => resolveSubagentChildMailboxRequest({
      run: child,
      action: "send_agent",
      message: "   ",
      toolCallId: "tool-empty",
    })).toThrow("message is required.");
  });

  it("builds mailbox rows, run-event previews, and child transcript messages", () => {
    const child = run({ id: "child-a", childThreadId: "thread-a" });
    const request = resolveSubagentChildMailboxRequest({
      run: child,
      action: "send_agent",
      message: `Context ${"x".repeat(400)}`,
      explicitIdempotencyKey: "send:long-context",
      toolCallId: "tool-send",
    });
    const mailbox = mailboxEvent({ id: "mailbox-a", runId: child.id, type: "subagent.message" });

    expect(buildSubagentChildMailboxEventInput(request)).toEqual({
      direction: "parent_to_child",
      type: "subagent.message",
      payload: {
        schemaVersion: SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION,
        message: request.message,
        action: "send_agent",
        idempotencyKey: "send:long-context",
        toolCallId: "tool-send",
      },
    });
    expect(buildSubagentChildMailboxRunEventInput(request, mailbox, child)).toEqual({
      type: "subagent.send_agent.queued",
      preview: {
        schemaVersion: SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION,
        childRunId: "child-a",
        childThreadId: "thread-a",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: child.canonicalTaskPath,
        idempotencyKey: "send:long-context",
        mailboxEventId: "mailbox-a",
        messagePreview: expect.stringMatching(/^Context x+/),
      },
    });
    expect(buildSubagentChildMailboxRunEventInput(request, mailbox, child).preview.messagePreview.length).toBeLessThanOrEqual(240);
    expect(buildSubagentChildMailboxThreadMessage({
      request,
      run: child,
      mailboxEvent: mailbox,
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
    })).toMatchObject({
      threadId: "thread-a",
      role: "system",
      content: expect.stringContaining("Parent queued a message for this sub-agent."),
      metadata: {
        runtime: "ambient-subagents",
        phase: "phase-2-pi-tool-surface",
        status: "queued",
        subagentRunId: "child-a",
        mailboxEventId: "mailbox-a",
      },
    });
  });

  it("links parent steering to a child supervisor request without raw parent payloads", () => {
    const child = run({ id: "child-a", childThreadId: "thread-a" });
    const request = resolveSubagentChildMailboxRequest({
      run: child,
      action: "followup_agent",
      message: "Use docs only.",
      explicitIdempotencyKey: "follow:docs-only",
      toolCallId: "tool-follow",
      supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
      supervisorChoiceId: "docs-only",
    });
    const mailbox = mailboxEvent({ id: "mailbox-a", runId: child.id, type: "subagent.followup" });

    expect(request).toMatchObject({
      supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
      supervisorChoiceId: "docs-only",
    });
    expect(createSubagentChildMailboxRequestIdempotencyKey({
      run: child,
      action: "followup_agent",
      message: "Use docs only.",
      supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
      supervisorChoiceId: "docs-only",
    })).not.toBe(createSubagentChildMailboxRequestIdempotencyKey({
      run: child,
      action: "followup_agent",
      message: "Use docs only.",
      supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
      supervisorChoiceId: "inspect-source",
    }));
    expect(buildSubagentChildMailboxEventInput(request)).toMatchObject({
      payload: {
        supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
        supervisorChoiceId: "docs-only",
      },
    });
    expect(buildSubagentChildMailboxRunEventInput(request, mailbox, child)).toMatchObject({
      preview: {
        childRunId: "child-a",
        childThreadId: "thread-a",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: child.canonicalTaskPath,
        supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
        supervisorChoiceId: "docs-only",
      },
    });
    expect(buildSubagentChildMailboxThreadMessage({
      request,
      run: child,
      mailboxEvent: mailbox,
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
    })).toMatchObject({
      metadata: {
        supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
        supervisorChoiceId: "docs-only",
      },
    });
  });

  it("builds replay and runtime followup summaries without exposing raw payloads", () => {
    const child = run({ id: "child-a", canonicalTaskPath: "root/0:reviewer" });
    const request = resolveSubagentChildMailboxRequest({
      run: child,
      action: "followup_agent",
      message: "Proceed.",
      explicitIdempotencyKey: "follow:proceed",
      toolCallId: "tool-follow",
    });
    const queuedMailbox = mailboxEvent({
      id: "mailbox-follow",
      runId: child.id,
      type: "subagent.followup",
      deliveryState: "queued",
      payload: { secret: "do-not-compact" },
    });
    const consumedMailbox = mailboxEvent({
      id: "mailbox-follow",
      runId: child.id,
      type: "subagent.followup",
      deliveryState: "consumed",
      deliveredAt: "2026-06-06T12:01:00.000Z",
      payload: { secret: "do-not-compact" },
    });

    expect(buildSubagentChildMailboxReplayText({
      request,
      canonicalTaskPath: child.canonicalTaskPath,
    })).toBe("Sub-agent root/0:reviewer already has this followup queued.");
    expect(buildSubagentChildMailboxQueuedText({
      request,
      canonicalTaskPath: child.canonicalTaskPath,
      runtimeFollowup: {
        accepted: true,
        message: "Runtime accepted follow-up.",
      },
    })).toBe("Queued followup for root/0:reviewer. Runtime accepted the follow-up for child execution.");
    expect(compactSubagentChildMailboxEvent(queuedMailbox)).toEqual({
      id: "mailbox-follow",
      runId: "child-a",
      direction: "parent_to_child",
      type: "subagent.followup",
      deliveryState: "queued",
      createdAt: "2026-06-06T12:00:00.000Z",
    });
    expect(compactSubagentChildRuntimeFollowup({
      accepted: true,
      run: child,
      mailboxEvent: consumedMailbox,
      message: `Runtime accepted ${"y".repeat(800)}`,
    }, queuedMailbox, (runtimeRun) => ({ id: runtimeRun.id, status: runtimeRun.status }))).toEqual({
      accepted: true,
      run: { id: "child-a", status: "running" },
      mailboxEvent: {
        id: "mailbox-follow",
        runId: "child-a",
        direction: "parent_to_child",
        type: "subagent.followup",
        deliveryState: "consumed",
        createdAt: "2026-06-06T12:00:00.000Z",
        deliveredAt: "2026-06-06T12:01:00.000Z",
      },
      message: expect.stringMatching(/^Runtime accepted y+/),
    });
  });
});

function run(overrides: {
  id?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: overrides.childThreadId ?? "child-thread",
    canonicalTaskPath: overrides.canonicalTaskPath ?? `root/${id}:reviewer`,
    roleId: "reviewer",
    dependencyMode: "required",
    status: "running",
  } as SubagentRunSummary;
}

function mailboxEvent(overrides: Partial<SubagentMailboxEventSummary> = {}): SubagentMailboxEventSummary {
  return {
    id: "mailbox",
    runId: "child-run",
    direction: "parent_to_child",
    type: "subagent.followup",
    payload: {},
    deliveryState: "queued",
    createdAt: "2026-06-06T12:00:00.000Z",
    ...overrides,
  };
}
