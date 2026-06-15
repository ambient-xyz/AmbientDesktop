import { describe, expect, it, vi } from "vitest";

import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
} from "../shared/types";
import {
  executeSubagentChildMailbox,
  SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION,
  type SubagentChildMailboxExecutorStore,
} from "./subagentChildMailboxExecutor";

describe("subagentChildMailboxExecutor", () => {
  it("queues parent-to-child messages with matching run-event and child-thread evidence", async () => {
    const child = run({ id: "child-a", childThreadId: "thread-a", canonicalTaskPath: "root/0:reviewer" });
    const store = fakeStore({ runs: [child] });

    const result = await executeSubagentChildMailbox({
      store,
      run: child,
      action: "send_agent",
      message: " Share this context without starting a new turn. ",
      idempotencyKey: "send:context",
      toolCallId: "tool-send",
      createRuntimeFollowupEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION)
      .toBe("ambient-subagent-child-mailbox-executor-v1");
    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledWith("child-a", {
      direction: "parent_to_child",
      type: "subagent.message",
      payload: {
        schemaVersion: "ambient-subagent-child-mailbox-request-v1",
        message: "Share this context without starting a new turn.",
        action: "send_agent",
        idempotencyKey: "send:context",
        toolCallId: "tool-send",
      },
    });
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("child-a", {
      type: "subagent.send_agent.queued",
      preview: {
        schemaVersion: "ambient-subagent-child-mailbox-request-v1",
        childRunId: "child-a",
        childThreadId: "thread-a",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: "root/0:reviewer",
        idempotencyKey: "send:context",
        mailboxEventId: "mailbox-1",
        messagePreview: "Share this context without starting a new turn.",
      },
    });
    expect(store.addMessage).toHaveBeenCalledWith({
      threadId: "thread-a",
      role: "system",
      content: "Parent queued a message for this sub-agent.\n\nShare this context without starting a new turn.",
      metadata: {
        runtime: "ambient-subagents",
        phase: "phase-2-pi-tool-surface",
        status: "queued",
        subagentRunId: "child-a",
        mailboxEventId: "mailbox-1",
      },
    });
    expect(result).toMatchObject({
      schemaVersion: SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION,
      replay: false,
      idempotencyKey: "send:context",
      request: {
        action: "send_agent",
        eventType: "subagent.send_agent.queued",
        mailboxType: "subagent.message",
      },
      mailboxEvent: {
        id: "mailbox-1",
        type: "subagent.message",
        deliveryState: "queued",
      },
      runEvent: {
        type: "subagent.send_agent.queued",
      },
    });
  });

  it("queues supervisor steering with matching child mailbox metadata", async () => {
    const child = run({ id: "child-a", childThreadId: "thread-a", canonicalTaskPath: "root/0:reviewer" });
    const store = fakeStore({ runs: [child] });

    const result = await executeSubagentChildMailbox({
      store,
      run: child,
      action: "followup_agent",
      message: "Use docs only.",
      idempotencyKey: "follow:docs-only",
      toolCallId: "tool-follow",
      supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
      supervisorChoiceId: "docs-only",
      createRuntimeFollowupEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledWith("child-a", {
      direction: "parent_to_child",
      type: "subagent.followup",
      payload: {
        schemaVersion: "ambient-subagent-child-mailbox-request-v1",
        message: "Use docs only.",
        action: "followup_agent",
        idempotencyKey: "follow:docs-only",
        toolCallId: "tool-follow",
        supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
        supervisorChoiceId: "docs-only",
      },
    });
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("child-a", {
      type: "subagent.followup_agent.queued",
      preview: {
        schemaVersion: "ambient-subagent-child-mailbox-request-v1",
        childRunId: "child-a",
        childThreadId: "thread-a",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: "root/0:reviewer",
        idempotencyKey: "follow:docs-only",
        mailboxEventId: "mailbox-1",
        messagePreview: "Use docs only.",
        supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
        supervisorChoiceId: "docs-only",
      },
    });
    expect(store.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
        supervisorChoiceId: "docs-only",
      }),
    }));
    expect(result.request).toMatchObject({
      supervisorRequestParentMailboxEventId: "parent-mailbox-supervisor",
      supervisorChoiceId: "docs-only",
    });
  });

  it("replays persisted mailbox run events without duplicating child mailbox mutations", async () => {
    const child = run({ id: "child-a" });
    const mailbox = mailboxEvent({
      id: "mailbox-existing",
      runId: "child-a",
      type: "subagent.followup",
    });
    const event = runEvent({
      runId: "child-a",
      type: "subagent.followup_agent.queued",
      preview: {
        idempotencyKey: "follow:existing",
        mailboxEventId: "mailbox-existing",
      },
    });
    const store = fakeStore({
      runs: [child],
      mailboxEvents: [mailbox],
      runEvents: [event],
    });

    const result = await executeSubagentChildMailbox({
      store,
      run: child,
      action: "followup_agent",
      message: "Continue.",
      idempotencyKey: "follow:existing",
      toolCallId: "tool-follow",
      createRuntimeFollowupEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(result).toMatchObject({
      replay: true,
      idempotencyKey: "follow:existing",
      runEvent: event,
      mailboxEvent: mailbox,
    });
    expect(store.appendSubagentMailboxEvent).not.toHaveBeenCalled();
    expect(store.appendSubagentRunEvent).not.toHaveBeenCalled();
    expect(store.updateSubagentMailboxEventDeliveryState).not.toHaveBeenCalled();
    expect(store.addMessage).not.toHaveBeenCalled();
  });

  it("hands followups to the runtime with delivery state callbacks and runtime event emitters", async () => {
    const child = run({ id: "child-a", status: "needs_attention" });
    const store = fakeStore({ runs: [child] });
    const emitEvent = vi.fn();
    const createRuntimeFollowupEventEmitter = vi.fn(() => emitEvent);
    const runtime = {
      followupChildRun: vi.fn(({ run: runtimeRun, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent: runtimeEmit }) => {
        markMailboxDelivered("2026-06-06T12:01:00.000Z");
        runtimeEmit({
          source: "followup_agent",
          type: "status",
          status: runtimeRun.status,
          message: `Delivered ${mailboxEvent.id}.`,
        });
        const consumed = markMailboxConsumed("2026-06-06T12:02:00.000Z");
        return {
          accepted: true,
          run: runtimeRun,
          mailboxEvent: consumed,
          message: "Runtime accepted follow-up.",
        };
      }),
    };

    const result = await executeSubagentChildMailbox({
      store,
      runtime,
      run: child,
      action: "followup_agent",
      message: "Continue with the restart-smoke fixture.",
      idempotencyKey: "follow:restart-smoke",
      toolCallId: "tool-follow",
      createRuntimeFollowupEventEmitter,
    });

    expect(createRuntimeFollowupEventEmitter).toHaveBeenCalledWith(child);
    expect(runtime.followupChildRun).toHaveBeenCalledWith(expect.objectContaining({
      run: child,
      message: "Continue with the restart-smoke fixture.",
      mailboxEvent: expect.objectContaining({
        id: "mailbox-1",
        type: "subagent.followup",
        deliveryState: "queued",
      }),
      idempotencyKey: "follow:restart-smoke",
      emitEvent,
    }));
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenNthCalledWith(
      1,
      "mailbox-1",
      "delivered",
      { now: "2026-06-06T12:01:00.000Z" },
    );
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenNthCalledWith(
      2,
      "mailbox-1",
      "consumed",
      { now: "2026-06-06T12:02:00.000Z" },
    );
    expect(emitEvent).toHaveBeenCalledWith({
      source: "followup_agent",
      type: "status",
      status: "needs_attention",
      message: "Delivered mailbox-1.",
    });
    expect(result).toMatchObject({
      replay: false,
      runtimeFollowup: {
        accepted: true,
        message: "Runtime accepted follow-up.",
      },
      mailboxEvent: {
        id: "mailbox-1",
        type: "subagent.followup",
        deliveryState: "consumed",
        deliveredAt: "2026-06-06T12:01:00.000Z",
      },
    });
  });
});

function fakeStore(input: {
  runs: SubagentRunSummary[];
  runEvents?: SubagentRunEventSummary[];
  mailboxEvents?: SubagentMailboxEventSummary[];
}): SubagentChildMailboxExecutorStore & {
  getSubagentRun: ReturnType<typeof vi.fn>;
  listSubagentRunEvents: ReturnType<typeof vi.fn>;
  listSubagentMailboxEvents: ReturnType<typeof vi.fn>;
  appendSubagentMailboxEvent: ReturnType<typeof vi.fn>;
  appendSubagentRunEvent: ReturnType<typeof vi.fn>;
  updateSubagentMailboxEventDeliveryState: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
} {
  const runs = new Map(input.runs.map((childRun) => [childRun.id, childRun]));
  const runEvents = [...(input.runEvents ?? [])];
  const mailboxEvents = new Map((input.mailboxEvents ?? []).map((event) => [event.id, event]));

  const getSubagentRun = vi.fn((runId: string): SubagentRunSummary => {
    const childRun = runs.get(runId);
    if (!childRun) throw new Error(`Unknown run ${runId}`);
    return childRun;
  });
  const listSubagentRunEvents = vi.fn((runId: string): SubagentRunEventSummary[] => {
    return runEvents.filter((event) => event.runId === runId);
  });
  const listSubagentMailboxEvents = vi.fn((runId: string): SubagentMailboxEventSummary[] => {
    return [...mailboxEvents.values()].filter((event) => event.runId === runId);
  });
  const appendSubagentMailboxEvent = vi.fn((runId: string, eventInput: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload?: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    createdAt?: string;
  }): SubagentMailboxEventSummary => {
    const event = mailboxEvent({
      id: `mailbox-${mailboxEvents.size + 1}`,
      runId,
      direction: eventInput.direction,
      type: eventInput.type,
      payload: eventInput.payload,
      deliveryState: eventInput.deliveryState ?? "queued",
      createdAt: eventInput.createdAt ?? "2026-06-06T12:00:00.000Z",
    });
    mailboxEvents.set(event.id, event);
    return event;
  });
  const appendSubagentRunEvent = vi.fn((runId: string, eventInput: {
    type: string;
    preview?: unknown;
    artifactPath?: string;
    createdAt?: string;
  }): SubagentRunEventSummary => {
    const event = runEvent({
      runId,
      type: eventInput.type,
      preview: eventInput.preview,
      artifactPath: eventInput.artifactPath,
      createdAt: eventInput.createdAt ?? "2026-06-06T12:00:00.000Z",
      sequence: runEvents.length + 1,
    });
    runEvents.push(event);
    return event;
  });
  const updateSubagentMailboxEventDeliveryState = vi.fn((
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary => {
    const event = mailboxEvents.get(id);
    if (!event) throw new Error(`Unknown mailbox event ${id}`);
    const updated = {
      ...event,
      deliveryState,
      deliveredAt: deliveryState === "delivered"
        ? options?.deliveredAt ?? options?.now ?? event.deliveredAt
        : event.deliveredAt,
    } as SubagentMailboxEventSummary;
    mailboxEvents.set(id, updated);
    return updated;
  });
  const addMessage = vi.fn((message: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }) => message);

  return {
    getSubagentRun,
    listSubagentRunEvents,
    listSubagentMailboxEvents,
    appendSubagentMailboxEvent,
    appendSubagentRunEvent,
    updateSubagentMailboxEventDeliveryState,
    addMessage,
  };
}

function run(overrides: {
  id?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  status?: SubagentRunStatus;
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
    status: overrides.status ?? "running",
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

function runEvent(overrides: {
  runId?: string;
  sequence?: number;
  type: string;
  preview?: unknown;
  artifactPath?: string;
  createdAt?: string;
}): SubagentRunEventSummary {
  return {
    runId: overrides.runId ?? "child-run",
    sequence: overrides.sequence ?? 1,
    type: overrides.type,
    ...(overrides.preview !== undefined ? { preview: overrides.preview } : {}),
    ...(overrides.artifactPath ? { artifactPath: overrides.artifactPath } : {}),
    createdAt: overrides.createdAt ?? "2026-06-06T12:00:00.000Z",
  } as SubagentRunEventSummary;
}
