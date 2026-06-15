import { describe, expect, it, vi } from "vitest";

import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRoleProfile } from "../shared/subagentRoles";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  executeSubagentCancelAgent,
  SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION,
  type SubagentCancelAgentExecutorStore,
} from "./subagentCancelAgentExecutor";

describe("subagentCancelAgentExecutor", () => {
  it("replays an existing cancel request without repeating runtime or store mutations", async () => {
    const child = run({ status: "running" });
    const store = fakeStore({
      runs: [child],
      runEvents: [runEvent({
        type: "subagent.cancel_requested",
        preview: { idempotencyKey: "cancel:existing" },
      })],
    });
    const runtime = {
      cancelChildRun: vi.fn(),
    };

    const result = await executeSubagentCancelAgent({
      store,
      runtime,
      run: child,
      reason: "Stop this branch.",
      idempotencyKey: "cancel:existing",
      toolCallId: "tool-cancel",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION)
      .toBe("ambient-subagent-cancel-agent-executor-v1");
    expect(result).toMatchObject({
      schemaVersion: SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION,
      replay: true,
      run: child,
      reason: "Stop this branch.",
      idempotencyKey: "cancel:existing",
      waitBarriers: [],
    });
    expect(runtime.cancelChildRun).not.toHaveBeenCalled();
    expect(store.markSubagentRunStatus).not.toHaveBeenCalled();
    expect(store.appendSubagentRunEvent).not.toHaveBeenCalled();
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();
    expect(store.addMessage).not.toHaveBeenCalled();
  });

  it("cancels active children, parent-to-child mailbox work, wait barriers, and records parent lifecycle evidence", async () => {
    const child = run({
      id: "child-a",
      parentMessageId: "assistant-message",
      childThreadId: "thread-a",
      canonicalTaskPath: "root/0:worker",
      status: "running",
    });
    const pending = mailbox({ id: "mailbox-queued", runId: child.id, deliveryState: "queued" });
    const barrier = waitBarrier({ id: "barrier-a", childRunIds: [child.id] });
    const store = fakeStore({
      runs: [child],
      mailboxEvents: [pending],
      waitBarriers: [barrier],
    });
    const emitEvent = vi.fn();
    const createRuntimeCancelEventEmitter = vi.fn(() => emitEvent);
    const runtime = {
      cancelChildRun: vi.fn(() => ({ cancelled: true, run: child })),
    };

    const result = await executeSubagentCancelAgent({
      store,
      runtime,
      run: child,
      reason: "Parent no longer needs this branch.",
      idempotencyKey: "cancel:branch",
      toolCallId: "tool-cancel",
      createRuntimeCancelEventEmitter,
    });

    expect(runtime.cancelChildRun).toHaveBeenCalledWith({
      run: child,
      reason: "Parent no longer needs this branch.",
      idempotencyKey: "cancel:branch",
      emitEvent,
    });
    expect(createRuntimeCancelEventEmitter).toHaveBeenCalledWith(child);
    expect(store.markSubagentRunStatus).toHaveBeenCalledWith("child-a", "cancelled", {
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "child-a",
        status: "cancelled",
        partial: false,
        summary: "Parent no longer needs this branch.",
        childThreadId: "thread-a",
      },
    });
    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith("barrier-a", "cancelled", expect.objectContaining({
      resolutionArtifact: expect.objectContaining({
        schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
        synthesisAllowed: false,
      }),
    }));
    expect(store.updateSubagentMailboxEventDeliveryState).toHaveBeenCalledWith(
      "mailbox-queued",
      "cancelled",
      { now: undefined },
    );
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("child-a", {
      type: "subagent.cancel_requested",
      preview: expect.objectContaining({
        childRunId: "child-a",
        childThreadId: "thread-a",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: "root/0:worker",
        idempotencyKey: "cancel:branch",
        reason: "Parent no longer needs this branch.",
        toolCallId: "tool-cancel",
        waitBarriers: [expect.objectContaining({ id: "barrier-a", status: "cancelled" })],
        cancelledMailboxEvents: [expect.objectContaining({ id: "mailbox-queued", deliveryState: "cancelled" })],
      }),
    });
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledWith(expect.objectContaining({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.lifecycle_interrupted",
      idempotencyKey: "subagent:lifecycle_interrupted:parent_cancel_request:cancel:branch",
      payload: expect.objectContaining({
        childRunId: "child-a",
        previousStatus: "running",
        status: "cancelled",
        source: "parent_cancel_request",
        waitBarrierIds: ["barrier-a"],
        cancelledWaitBarrierIds: ["barrier-a"],
        waitBarrierConsequences: [
          expect.objectContaining({
            waitBarrierId: "barrier-a",
            status: "cancelled",
            synthesisAllowed: false,
            partial: false,
            consequence: "barrier_cancelled",
          }),
        ],
        cancelledMailboxEventIds: ["mailbox-queued"],
      }),
    }));
    expect(store.addMessage).toHaveBeenCalledWith({
      threadId: "thread-a",
      role: "system",
      content: "Sub-agent cancelled by parent.\n\nReason: Parent no longer needs this branch.",
      metadata: {
        runtime: "ambient-subagents",
        phase: "phase-2-pi-tool-surface",
        status: "cancelled",
        subagentRunId: "child-a",
      },
    });
    expect(result).toMatchObject({
      replay: false,
      run: expect.objectContaining({ id: "child-a", status: "cancelled" }),
      cancelledMailbox: expect.objectContaining({
        events: [expect.objectContaining({ id: "mailbox-queued", deliveryState: "cancelled" })],
      }),
      parentMailboxEvent: expect.objectContaining({ type: "subagent.lifecycle_interrupted" }),
      runEvent: expect.objectContaining({ type: "subagent.cancel_requested" }),
    });
  });

  it("preserves terminal initial runs when runtime state is stale", async () => {
    const completed = run({ id: "child-a", status: "completed" });
    const staleRunning = run({ id: "child-a", status: "running" });
    const store = fakeStore({ runs: [completed] });
    const runtime = {
      cancelChildRun: vi.fn(() => ({ cancelled: false, run: staleRunning })),
    };

    const result = await executeSubagentCancelAgent({
      store,
      runtime,
      run: completed,
      reason: "Stop if still running.",
      idempotencyKey: "cancel:terminal",
      toolCallId: "tool-cancel",
      createRuntimeCancelEventEmitter: vi.fn(() => vi.fn()),
    });

    expect(store.markSubagentRunStatus).not.toHaveBeenCalled();
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();
    expect(result.run.status).toBe("completed");
    expect(result.cancelledMailbox).toBeUndefined();
    expect(result.runEvent).toMatchObject({ type: "subagent.cancel_requested" });
    expect(store.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "child-thread",
      content: "Sub-agent cancelled by parent.\n\nReason: Stop if still running.",
    }));
  });
});

function fakeStore(input: {
  runs: SubagentRunSummary[];
  runEvents?: SubagentRunEventSummary[];
  mailboxEvents?: SubagentMailboxEventSummary[];
  waitBarriers?: SubagentWaitBarrierSummary[];
}): SubagentCancelAgentExecutorStore & {
  getSubagentRun: ReturnType<typeof vi.fn>;
  listSubagentRunEvents: ReturnType<typeof vi.fn>;
  markSubagentRunStatus: ReturnType<typeof vi.fn>;
  appendSubagentRunEvent: ReturnType<typeof vi.fn>;
  listSubagentMailboxEvents: ReturnType<typeof vi.fn>;
  updateSubagentMailboxEventDeliveryState: ReturnType<typeof vi.fn>;
  listSubagentWaitBarriersForParentRun: ReturnType<typeof vi.fn>;
  updateSubagentWaitBarrierStatus: ReturnType<typeof vi.fn>;
  appendSubagentParentMailboxEvent: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
} {
  const runs = new Map(input.runs.map((childRun) => [childRun.id, childRun]));
  const runEvents = [...(input.runEvents ?? [])];
  const mailboxEvents = new Map((input.mailboxEvents ?? []).map((event) => [event.id, event]));
  const waitBarriers = new Map((input.waitBarriers ?? []).map((barrier) => [barrier.id, barrier]));
  const parentMailboxEvents: SubagentParentMailboxEventSummary[] = [];

  const getSubagentRun = vi.fn((runId: string): SubagentRunSummary => {
    const childRun = runs.get(runId);
    if (!childRun) throw new Error(`Unknown run ${runId}`);
    return childRun;
  });
  const listSubagentRunEvents = vi.fn((runId: string): SubagentRunEventSummary[] => {
    return runEvents.filter((event) => event.runId === runId);
  });
  const markSubagentRunStatus = vi.fn((runId: string, status: SubagentRunStatus, options?: { resultArtifact?: unknown; now?: string }): SubagentRunSummary => {
    const current = getSubagentRun(runId);
    const updated = {
      ...current,
      status,
      ...(options?.resultArtifact !== undefined ? { resultArtifact: options.resultArtifact } : {}),
      ...(options?.now ? { updatedAt: options.now } : {}),
    } as SubagentRunSummary;
    runs.set(runId, updated);
    return updated;
  });
  const appendSubagentRunEvent = vi.fn((runId: string, eventInput: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string }): SubagentRunEventSummary => {
    const event = {
      runId,
      sequence: runEvents.length + 1,
      type: eventInput.type,
      ...(eventInput.preview !== undefined ? { preview: eventInput.preview } : {}),
      ...(eventInput.artifactPath ? { artifactPath: eventInput.artifactPath } : {}),
      createdAt: eventInput.createdAt ?? "2026-06-06T12:00:00.000Z",
    } as SubagentRunEventSummary;
    runEvents.push(event);
    return event;
  });
  const listSubagentMailboxEvents = vi.fn((runId: string): SubagentMailboxEventSummary[] => {
    return [...mailboxEvents.values()].filter((event) => event.runId === runId);
  });
  const updateSubagentMailboxEventDeliveryState = vi.fn((id: string, deliveryState: SubagentMailboxDeliveryState, options?: { now?: string; deliveredAt?: string | null }): SubagentMailboxEventSummary => {
    const event = mailboxEvents.get(id);
    if (!event) throw new Error(`Unknown mailbox event ${id}`);
    const updated = {
      ...event,
      deliveryState,
      ...(options?.now ? { updatedAt: options.now } : {}),
      ...(options?.deliveredAt !== undefined ? { deliveredAt: options.deliveredAt ?? undefined } : {}),
    } as SubagentMailboxEventSummary;
    mailboxEvents.set(id, updated);
    return updated;
  });
  const listSubagentWaitBarriersForParentRun = vi.fn((parentRunId: string): SubagentWaitBarrierSummary[] => {
    return [...waitBarriers.values()].filter((barrier) => barrier.parentRunId === parentRunId);
  });
  const updateSubagentWaitBarrierStatus = vi.fn((id: string, status: SubagentWaitBarrierSummary["status"], options?: { resolutionArtifact?: unknown; now?: string }): SubagentWaitBarrierSummary => {
    const barrier = waitBarriers.get(id);
    if (!barrier) throw new Error(`Unknown wait barrier ${id}`);
    const updated = {
      ...barrier,
      status,
      ...(options?.resolutionArtifact !== undefined ? { resolutionArtifact: options.resolutionArtifact } : {}),
      ...(options?.now ? { updatedAt: options.now } : {}),
    } as SubagentWaitBarrierSummary;
    waitBarriers.set(id, updated);
    return updated;
  });
  const appendSubagentParentMailboxEvent = vi.fn((eventInput): SubagentParentMailboxEventSummary => {
    const event = {
      id: `parent-mailbox-${parentMailboxEvents.length + 1}`,
      parentThreadId: eventInput.parentThreadId,
      parentRunId: eventInput.parentRunId,
      ...(eventInput.parentMessageId ? { parentMessageId: eventInput.parentMessageId } : {}),
      type: eventInput.type,
      payload: eventInput.payload,
      deliveryState: eventInput.deliveryState ?? "queued",
      ...(eventInput.idempotencyKey ? { idempotencyKey: eventInput.idempotencyKey } : {}),
      createdAt: eventInput.createdAt ?? "2026-06-06T12:00:00.000Z",
      updatedAt: eventInput.createdAt ?? "2026-06-06T12:00:00.000Z",
      ...(eventInput.deliveredAt ? { deliveredAt: eventInput.deliveredAt } : {}),
    } as SubagentParentMailboxEventSummary;
    parentMailboxEvents.push(event);
    return event;
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
    markSubagentRunStatus,
    appendSubagentRunEvent,
    listSubagentMailboxEvents,
    updateSubagentMailboxEventDeliveryState,
    listSubagentWaitBarriersForParentRun,
    updateSubagentWaitBarrierStatus,
    appendSubagentParentMailboxEvent,
    addMessage,
  };
}

function run(overrides: {
  id?: string;
  parentMessageId?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  status: SubagentRunStatus;
  resultArtifact?: unknown;
}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(overrides.parentMessageId ? { parentMessageId: overrides.parentMessageId } : {}),
    childThreadId: overrides.childThreadId ?? "child-thread",
    canonicalTaskPath: overrides.canonicalTaskPath ?? `root/${id}:reviewer`,
    roleId: "reviewer",
    roleProfileSnapshot: testRoleProfile(),
    dependencyMode: "required",
    status: overrides.status,
    ...(overrides.resultArtifact !== undefined ? { resultArtifact: overrides.resultArtifact } : {}),
  } as SubagentRunSummary;
}

function runEvent(overrides: {
  runId?: string;
  type: string;
  preview?: unknown;
}): SubagentRunEventSummary {
  return {
    runId: overrides.runId ?? "child-run",
    sequence: 1,
    type: overrides.type,
    ...(overrides.preview !== undefined ? { preview: overrides.preview } : {}),
    createdAt: "2026-06-06T12:00:00.000Z",
  } as SubagentRunEventSummary;
}

function testRoleProfile(): SubagentRoleProfile {
  return {
    schemaVersion: "ambient-subagent-role-profile-v1",
    id: "reviewer",
    label: "Reviewer",
    description: "Review fixture role.",
    developerInstructions: "Review.",
    promptMode: "replace",
    inheritParentTurns: false,
    inheritProjectContext: true,
    inheritSkills: false,
    nicknameCandidates: ["Reviewer"],
    defaultModelId: "test-model",
    allowedForkModes: ["recent_turns"],
    defaultForkMode: "recent_turns",
    allowedToolCategories: ["workspace.read"],
    deniedToolCategories: [],
    nestedFanout: "disabled",
    mutationPolicy: "read_only",
    memoryPolicy: "run_snapshot_only",
    schedulingPolicy: "live_parent_only",
    guardPolicy: {
      maxTurns: 1,
      maxRuntimeMs: 1000,
      allowPartialResult: true,
      structuredOutputRequired: false,
      implementationEvidenceRequired: false,
    },
    retentionDefault: "keep_until_parent_pruned",
  };
}

function mailbox(overrides: {
  id: string;
  runId: string;
  deliveryState: SubagentMailboxDeliveryState;
}): SubagentMailboxEventSummary {
  return {
    id: overrides.id,
    runId: overrides.runId,
    direction: "parent_to_child",
    type: "subagent.followup",
    payload: { message: "continue" },
    deliveryState: overrides.deliveryState,
    createdAt: "2026-06-06T12:00:00.000Z",
  } as SubagentMailboxEventSummary;
}

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T12:00:00.000Z",
    updatedAt: "2026-06-06T12:00:00.000Z",
    ...overrides,
  };
}
