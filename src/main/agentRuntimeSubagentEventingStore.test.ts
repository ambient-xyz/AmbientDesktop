import { describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  DesktopEvent,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
} from "../shared/types";
import type { LocalTextSubagentRuntimeStore } from "./local-runtime/localTextSubagentRuntime";
import { createAgentRuntimeSubagentEventingStore } from "./agentRuntimeSubagentEventingStore";
import type { SubagentPiToolStore } from "./subagents/subagentPiTools";

describe("createAgentRuntimeSubagentEventingStore", () => {
  it("emits run events and run updates after creating a subagent run", () => {
    const harness = createHarness();

    const created = harness.eventingStore.createSubagentRun({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      title: "Child",
      roleId: "worker",
      canonicalTaskPath: "Task",
      featureFlagSnapshot: {} as Parameters<SubagentPiToolStore["createSubagentRun"]>[0]["featureFlagSnapshot"],
      modelRuntimeSnapshot: {} as Parameters<SubagentPiToolStore["createSubagentRun"]>[0]["modelRuntimeSnapshot"],
    });

    expect(created).toBe(harness.run);
    expect(harness.store.createSubagentRun).toHaveBeenCalledTimes(1);
    expect(harness.calls).toEqual([
      "store.createSubagentRun",
      "emitSubagentRunEventsSince:child-run:0",
      "emitSubagentRunAndChildThreadUpdated:child-run",
    ]);
  });

  it("emits run event and scope snapshot callbacks with the current run", () => {
    const harness = createHarness();

    expect(harness.eventingStore.appendSubagentRunEvent("child-run", { type: "note" })).toEqual(runEvent(1));
    expect(harness.eventingStore.recordSubagentToolScopeSnapshot("child-run", {
      scope: {} as SubagentToolScopeSnapshotSummary["scope"],
    })).toEqual(toolScopeSnapshot(1));

    expect(harness.store.getSubagentRun).toHaveBeenCalledWith("child-run");
    expect(harness.calls).toEqual([
      "store.appendSubagentRunEvent:child-run",
      "store.getSubagentRun:child-run",
      "emitSubagentRunEventCreated:child-run:1",
      "store.recordSubagentToolScopeSnapshot:child-run",
      "store.getSubagentRun:child-run",
      "emitSubagentToolScopeSnapshotRecorded:child-run:1",
    ]);
  });

  it("uses the previous run-event sequence for status changes and close", () => {
    const harness = createHarness();

    expect(harness.eventingStore.markSubagentRunStatus("child-run", "completed", { now: "2026-06-12T00:00:02.000Z" })).toEqual(harness.run);
    expect(harness.eventingStore.closeSubagentRun("child-run", "2026-06-12T00:00:03.000Z")).toEqual(harness.run);

    expect(harness.calls).toEqual([
      "latestSubagentRunEventSequence:child-run",
      "store.markSubagentRunStatus:child-run:completed",
      "emitSubagentRunAndChildThreadUpdated:child-run",
      "emitSubagentRunEventsSince:child-run:7",
      "latestSubagentRunEventSequence:child-run",
      "store.closeSubagentRun:child-run",
      "emitSubagentRunAndChildThreadUpdated:child-run",
      "emitSubagentRunEventsSince:child-run:7",
    ]);
  });

  it("emits barrier, parent mailbox, and message updates after delegated writes", () => {
    const harness = createHarness();

    expect(harness.eventingStore.createSubagentWaitBarrier({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-run"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
    })).toEqual(harness.barrier);
    expect(harness.eventingStore.updateSubagentWaitBarrierStatus("barrier-1", "satisfied")).toEqual(harness.barrier);
    expect(harness.eventingStore.upsertSubagentGroupedCompletionNotification({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      child: {
        runId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "Task",
        roleId: "worker",
        status: "completed",
        summary: "Done",
      },
    })).toEqual(harness.parentMailboxEvent);
    expect(harness.eventingStore.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      type: "status",
      payload: {},
    })).toEqual(harness.parentMailboxEvent);
    expect(harness.eventingStore.updateSubagentParentMailboxEventDeliveryState("parent-mailbox-1", "delivered")).toEqual(harness.parentMailboxEvent);
    expect(harness.eventingStore.addMessage({
      threadId: "child-thread",
      role: "assistant",
      content: "Done",
    })).toEqual(harness.message);

    expect(harness.calls).toEqual([
      "store.createSubagentWaitBarrier",
      "emitSubagentWaitBarrierUpdated:barrier-1",
      "store.updateSubagentWaitBarrierStatus:barrier-1:satisfied",
      "emitSubagentWaitBarrierUpdated:barrier-1",
      "store.upsertSubagentGroupedCompletionNotification",
      "emitSubagentParentMailboxEventUpdated:parent-mailbox-1",
      "store.appendSubagentParentMailboxEvent",
      "emitSubagentParentMailboxEventUpdated:parent-mailbox-1",
      "store.updateSubagentParentMailboxEventDeliveryState:parent-mailbox-1:delivered",
      "emitSubagentParentMailboxEventUpdated:parent-mailbox-1",
      "store.addMessage:child-thread",
      "emit:message-created",
      "store.getThread:child-thread",
      "emit:thread-updated",
    ]);
    expect(harness.emitted).toEqual([
      { type: "message-created", message: harness.message },
      { type: "thread-updated", thread: thread({ id: "child-thread" }) },
    ]);
  });

  it("keeps passive store methods as direct delegation and emits child mailbox updates after mailbox writes", () => {
    const harness = createHarness();

    expect(harness.eventingStore.getThread("parent-thread")).toEqual(thread({ id: "parent-thread" }));
    expect(harness.eventingStore.getSubagentRun("child-run")).toEqual(harness.run);
    expect(harness.eventingStore.getSubagentWaitBarrier("barrier-1")).toEqual(harness.barrier);
    expect(harness.eventingStore.listSubagentRunsForParentThread("parent-thread")).toEqual([harness.run]);
    expect(harness.eventingStore.listSubagentRunEvents("child-run")).toEqual([runEvent(1)]);
    expect(harness.eventingStore.listSubagentToolScopeSnapshots("child-run")).toEqual([toolScopeSnapshot(1)]);
    expect(harness.eventingStore.listSubagentWaitBarriersForParentRun("parent-run")).toEqual([harness.barrier]);
    expect(harness.eventingStore.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([harness.parentMailboxEvent]);
    expect(harness.eventingStore.getSubagentParentMailboxEvent("parent-mailbox-1")).toEqual(harness.parentMailboxEvent);
    expect(harness.eventingStore.appendSubagentMailboxEvent("child-run", {
      direction: "parent_to_child",
      type: "steering",
      payload: {},
    })).toEqual(mailboxEvent());
    expect(harness.eventingStore.listSubagentMailboxEvents("child-run")).toEqual([mailboxEvent()]);
    expect(harness.eventingStore.updateSubagentMailboxEventDeliveryState("mailbox-1", "consumed")).toEqual(mailboxEvent({ deliveryState: "consumed" }));

    expect(harness.emitted).toEqual([]);
    expect(harness.calls).toEqual([
      "store.getThread:parent-thread",
      "store.getSubagentRun:child-run",
      "store.getSubagentWaitBarrier:barrier-1",
      "store.listSubagentRunsForParentThread:parent-thread",
      "store.listSubagentRunEvents:child-run",
      "store.listSubagentToolScopeSnapshots:child-run",
      "store.listSubagentWaitBarriersForParentRun:parent-run",
      "store.listSubagentParentMailboxEventsForParentRun:parent-run",
      "store.getSubagentParentMailboxEvent:parent-mailbox-1",
      "store.appendSubagentMailboxEvent:child-run",
      "store.getSubagentRun:child-run",
      "emitSubagentMailboxEventUpdated:child-run:mailbox-1",
      "store.listSubagentMailboxEvents:child-run",
      "store.updateSubagentMailboxEventDeliveryState:mailbox-1:consumed",
      "store.getSubagentRun:child-run",
      "emitSubagentMailboxEventUpdated:child-run:mailbox-1",
    ]);
  });
});

function createHarness() {
  const calls: string[] = [];
  const emitted: DesktopEvent[] = [];
  const currentRun = run();
  const currentBarrier = waitBarrier();
  const currentParentMailboxEvent = parentMailboxEvent();
  const currentMessage = message();

  const store = {
    getThread: vi.fn((threadId: string) => {
      calls.push(`store.getThread:${threadId}`);
      return thread({ id: threadId });
    }),
    createSubagentRun: vi.fn(() => {
      calls.push("store.createSubagentRun");
      return currentRun;
    }),
    getSubagentRun: vi.fn((runId: string) => {
      calls.push(`store.getSubagentRun:${runId}`);
      return currentRun;
    }),
    getSubagentWaitBarrier: vi.fn((id: string) => {
      calls.push(`store.getSubagentWaitBarrier:${id}`);
      return currentBarrier;
    }),
    listSubagentRunsForParentThread: vi.fn((parentThreadId: string) => {
      calls.push(`store.listSubagentRunsForParentThread:${parentThreadId}`);
      return [currentRun];
    }),
    listSubagentRunEvents: vi.fn((runId: string) => {
      calls.push(`store.listSubagentRunEvents:${runId}`);
      return [runEvent(1)];
    }),
    appendSubagentRunEvent: vi.fn((runId: string) => {
      calls.push(`store.appendSubagentRunEvent:${runId}`);
      return runEvent(1);
    }),
    recordSubagentToolScopeSnapshot: vi.fn((runId: string) => {
      calls.push(`store.recordSubagentToolScopeSnapshot:${runId}`);
      return toolScopeSnapshot(1);
    }),
    listSubagentToolScopeSnapshots: vi.fn((runId: string) => {
      calls.push(`store.listSubagentToolScopeSnapshots:${runId}`);
      return [toolScopeSnapshot(1)];
    }),
    markSubagentRunStatus: vi.fn((runId: string, status: string) => {
      calls.push(`store.markSubagentRunStatus:${runId}:${status}`);
      return currentRun;
    }),
    closeSubagentRun: vi.fn((runId: string) => {
      calls.push(`store.closeSubagentRun:${runId}`);
      return currentRun;
    }),
    createSubagentWaitBarrier: vi.fn(() => {
      calls.push("store.createSubagentWaitBarrier");
      return currentBarrier;
    }),
    listSubagentWaitBarriersForParentRun: vi.fn((parentRunId: string) => {
      calls.push(`store.listSubagentWaitBarriersForParentRun:${parentRunId}`);
      return [currentBarrier];
    }),
    upsertSubagentGroupedCompletionNotification: vi.fn(() => {
      calls.push("store.upsertSubagentGroupedCompletionNotification");
      return currentParentMailboxEvent;
    }),
    updateSubagentWaitBarrierStatus: vi.fn((id: string, status: string) => {
      calls.push(`store.updateSubagentWaitBarrierStatus:${id}:${status}`);
      return currentBarrier;
    }),
    appendSubagentMailboxEvent: vi.fn((runId: string) => {
      calls.push(`store.appendSubagentMailboxEvent:${runId}`);
      return mailboxEvent();
    }),
    appendSubagentParentMailboxEvent: vi.fn(() => {
      calls.push("store.appendSubagentParentMailboxEvent");
      return currentParentMailboxEvent;
    }),
    listSubagentParentMailboxEventsForParentRun: vi.fn((parentRunId: string) => {
      calls.push(`store.listSubagentParentMailboxEventsForParentRun:${parentRunId}`);
      return [currentParentMailboxEvent];
    }),
    getSubagentParentMailboxEvent: vi.fn((id: string) => {
      calls.push(`store.getSubagentParentMailboxEvent:${id}`);
      return currentParentMailboxEvent;
    }),
    updateSubagentParentMailboxEventDeliveryState: vi.fn((id: string, deliveryState: string) => {
      calls.push(`store.updateSubagentParentMailboxEventDeliveryState:${id}:${deliveryState}`);
      return currentParentMailboxEvent;
    }),
    listSubagentMailboxEvents: vi.fn((runId: string) => {
      calls.push(`store.listSubagentMailboxEvents:${runId}`);
      return [mailboxEvent()];
    }),
    updateSubagentMailboxEventDeliveryState: vi.fn((id: string, deliveryState: string) => {
      calls.push(`store.updateSubagentMailboxEventDeliveryState:${id}:${deliveryState}`);
      return mailboxEvent({ deliveryState: deliveryState as SubagentMailboxEventSummary["deliveryState"] });
    }),
    addMessage: vi.fn((input: Parameters<LocalTextSubagentRuntimeStore["addMessage"]>[0]) => {
      calls.push(`store.addMessage:${input.threadId}`);
      return currentMessage;
    }),
  } as unknown as SubagentPiToolStore & LocalTextSubagentRuntimeStore;

  const eventingStore = createAgentRuntimeSubagentEventingStore({
    store,
    emit: (event) => {
      calls.push(`emit:${event.type}`);
      emitted.push(event);
    },
    emitSubagentRunAndChildThreadUpdated: (subagentRun) => calls.push(`emitSubagentRunAndChildThreadUpdated:${subagentRun.id}`),
    emitSubagentRunEventCreated: (subagentRun, event) => calls.push(`emitSubagentRunEventCreated:${subagentRun.id}:${event.sequence}`),
    emitSubagentToolScopeSnapshotRecorded: (subagentRun, snapshot) => calls.push(`emitSubagentToolScopeSnapshotRecorded:${subagentRun.id}:${snapshot.sequence}`),
    emitSubagentWaitBarrierUpdated: (barrier) => calls.push(`emitSubagentWaitBarrierUpdated:${barrier.id}`),
    emitSubagentMailboxEventUpdated: (subagentRun, event) => calls.push(`emitSubagentMailboxEventUpdated:${subagentRun.id}:${event.id}`),
    emitSubagentParentMailboxEventUpdated: (event) => calls.push(`emitSubagentParentMailboxEventUpdated:${event.id}`),
    emitSubagentRunEventsSince: (subagentRun, sequence) => calls.push(`emitSubagentRunEventsSince:${subagentRun.id}:${sequence}`),
    latestSubagentRunEventSequence: (runId) => {
      calls.push(`latestSubagentRunEventSequence:${runId}`);
      return 7;
    },
  });

  return {
    barrier: currentBarrier,
    calls,
    emitted,
    eventingStore,
    message: currentMessage,
    parentMailboxEvent: currentParentMailboxEvent,
    run: currentRun,
    store,
  };
}

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "parent-thread",
    title: "Thread",
    workspacePath: "/tmp/workspace",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:01.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient",
    thinkingLevel: "medium",
    ...overrides,
  };
}

function run(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    childThreadId: "child-thread",
    canonicalTaskPath: "Task",
    roleId: "worker",
    roleProfileSnapshot: {} as SubagentRunSummary["roleProfileSnapshot"],
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "running",
    featureFlagSnapshot: {} as SubagentRunSummary["featureFlagSnapshot"],
    modelRuntimeSnapshot: {} as SubagentRunSummary["modelRuntimeSnapshot"],
    capacityLeaseSnapshot: {} as SubagentRunSummary["capacityLeaseSnapshot"],
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:01.000Z",
    ...overrides,
  };
}

function runEvent(sequence: number, overrides: Partial<SubagentRunEventSummary> = {}): SubagentRunEventSummary {
  return {
    runId: "child-run",
    sequence,
    type: "note",
    createdAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}

function toolScopeSnapshot(sequence: number, overrides: Partial<SubagentToolScopeSnapshotSummary> = {}): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run",
    sequence,
    createdAt: "2026-06-12T00:00:00.000Z",
    scope: {} as SubagentToolScopeSnapshotSummary["scope"],
    resolverInputs: {},
    ...overrides,
  };
}

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:01.000Z",
    ...overrides,
  };
}

function parentMailboxEvent(overrides: Partial<SubagentParentMailboxEventSummary> = {}): SubagentParentMailboxEventSummary {
  return {
    id: "parent-mailbox-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    type: "status",
    payload: {},
    deliveryState: "queued",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:01.000Z",
    ...overrides,
  };
}

function mailboxEvent(overrides: Partial<SubagentMailboxEventSummary> = {}): SubagentMailboxEventSummary {
  return {
    id: "mailbox-1",
    runId: "child-run",
    direction: "parent_to_child",
    type: "steering",
    payload: {},
    deliveryState: "queued",
    createdAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    threadId: "child-thread",
    role: "assistant",
    content: "Done",
    createdAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}
