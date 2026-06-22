import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  AgentRuntimeSubagentActionController,
  type AgentRuntimeSubagentActionControllerOptions,
  type AgentRuntimeSubagentActionDependencies,
} from "./agentRuntimeSubagentActionController";

type SubagentActionStore = AgentRuntimeSubagentActionControllerOptions["store"];
type EventingStore = ReturnType<AgentRuntimeSubagentActionController["createEventingStore"]>;

describe("AgentRuntimeSubagentActionController", () => {
  it("emits run, thread, and incremental run-event desktop updates", () => {
    const emitted: DesktopEvent[] = [];
    const run = subagentRun();
    const thread = threadSummary();
    const firstEvent = runEvent({ sequence: 1 });
    const secondEvent = runEvent({ sequence: 2 });
    const controller = new AgentRuntimeSubagentActionController({
      store: storeDouble({
        getThread: vi.fn(() => thread),
        listSubagentRunEvents: vi.fn(() => [firstEvent, secondEvent]),
      }),
      cancelChildRun: vi.fn(),
      retryChildRun: vi.fn(),
      emit: (event) => emitted.push(event),
    });

    controller.emitRunAndChildThreadUpdated(run);
    controller.emitRunEventsSince(run, 1);

    expect(emitted).toEqual([
      { type: "subagent-run-updated", run },
      { type: "thread-updated", thread },
      { type: "subagent-run-event-created", run, event: secondEvent },
    ]);
    expect(controller.latestRunEventSequence(run.id)).toBe(2);
  });

  it("resolves wait barriers through the desktop parent-cluster executor contract", async () => {
    const barrier = waitBarrier();
    const run = subagentRun();
    const parentMailboxEvent = parentMailboxEventSummary();
    const eventingStore = {} as EventingStore;
    const executeSubagentBarrierDecision = vi.fn(async (
      input: Parameters<AgentRuntimeSubagentActionDependencies["executeSubagentBarrierDecision"]>[0],
    ) => {
      expect(input.store).toBe(eventingStore);
      expect(input.barrier).toBe(barrier);
      expect(input.decision).toBe("continue_with_partial");
      expect(input.idempotencyKey).toBe("barrier-key");
      expect(input.toolCallId).toBe("desktop-parent-cluster-resolve-barrier");
      expect(input.runtime?.cancelChildRun).toEqual(expect.any(Function));
      expect(input.runtime?.retryChildRun).toEqual(expect.any(Function));
      expect(input.createRuntimeCancelEventEmitter(run)).toEqual(expect.any(Function));
      expect(input.createRuntimeRetryEventEmitter?.(run)).toEqual(expect.any(Function));
      return {
        schemaVersion: "ambient-subagent-barrier-decision-executor-v1",
        replay: false,
        barrier,
        childRuns: [run],
        decision: "continue_with_partial",
        parentMailboxEvent,
      } as Awaited<ReturnType<AgentRuntimeSubagentActionDependencies["executeSubagentBarrierDecision"]>>;
    });
    const controller = controllerWithDependencies({
      store: storeDouble({ getSubagentWaitBarrier: vi.fn(() => barrier) }),
      dependencies: {
        createAgentRuntimeSubagentEventingStore: vi.fn(() => eventingStore),
        executeSubagentBarrierDecision,
      },
    });

    await expect(controller.resolveWaitBarrier({
      waitBarrierId: barrier.id,
      decision: "continue_with_partial",
      userDecision: "Ship partial result.",
      partialSummary: "One child is complete.",
      idempotencyKey: "barrier-key",
    })).resolves.toEqual({
      schemaVersion: "ambient-subagent-wait-barrier-resolution-result-v1",
      replay: false,
      waitBarrier: barrier,
      childRuns: [run],
      decision: "continue_with_partial",
      parentMailboxEvent,
    });
    expect(executeSubagentBarrierDecision).toHaveBeenCalledTimes(1);
  });

  it("rejects optional-background wait-barrier resolutions before executing", async () => {
    const executeSubagentBarrierDecision = vi.fn();
    const controller = controllerWithDependencies({
      store: storeDouble({
        getSubagentWaitBarrier: vi.fn(() => waitBarrier({ dependencyMode: "optional_background" })),
      }),
      dependencies: { executeSubagentBarrierDecision },
    });

    await expect(controller.resolveWaitBarrier({
      waitBarrierId: "barrier-1",
      decision: "fail_parent",
    })).rejects.toThrow("optional background work");
    expect(executeSubagentBarrierDecision).not.toHaveBeenCalled();
  });

  it("cancels and closes sub-agent runs through desktop parent-cluster executors", async () => {
    const emitted: DesktopEvent[] = [];
    const run = subagentRun();
    const cancelledRun = subagentRun({ status: "cancelled" });
    const closeableRun = subagentRun({ status: "completed", completedAt: "2026-06-21T00:00:02.000Z" });
    const closedRun = subagentRun({ closedAt: "2026-06-21T00:00:03.000Z" });
    const eventingStore = {} as EventingStore;
    const executeSubagentCancelAgent = vi.fn(async (
      input: Parameters<AgentRuntimeSubagentActionDependencies["executeSubagentCancelAgent"]>[0],
    ) => {
      expect(input.store).toBe(eventingStore);
      expect(input.run).toBe(run);
      expect(input.reason).toBe("Stop it.");
      expect(input.toolCallId).toBe("desktop-parent-cluster-cancel");
      expect(input.runtime?.cancelChildRun).toEqual(expect.any(Function));
      expect(input.createRuntimeCancelEventEmitter(run)).toEqual(expect.any(Function));
      return {
        schemaVersion: "ambient-subagent-cancel-agent-executor-v1",
        replay: false,
        run: cancelledRun,
        reason: "Stop it.",
        idempotencyKey: "cancel-key",
        waitBarriers: [],
      } as Awaited<ReturnType<AgentRuntimeSubagentActionDependencies["executeSubagentCancelAgent"]>>;
    });
    const executeSubagentCloseAgent = vi.fn((
      input: Parameters<AgentRuntimeSubagentActionDependencies["executeSubagentCloseAgent"]>[0],
    ) => {
      expect(input.store).toBe(eventingStore);
      expect(input.run).toBe(closeableRun);
      expect(input.reason).toBe("Done.");
      expect(input.toolCallId).toBe("desktop-parent-cluster-close");
      return {
        schemaVersion: "ambient-subagent-close-agent-executor-v1",
        replay: false,
        run: closedRun,
        reason: "Done.",
        idempotencyKey: "close-key",
      } as ReturnType<AgentRuntimeSubagentActionDependencies["executeSubagentCloseAgent"]>;
    });
    const controller = controllerWithDependencies({
      store: storeDouble({
        getSubagentRun: vi.fn()
          .mockReturnValueOnce(run)
          .mockReturnValueOnce(closeableRun),
        getThread: vi.fn(() => threadSummary()),
      }),
      emit: (event) => emitted.push(event),
      dependencies: {
        createAgentRuntimeSubagentEventingStore: vi.fn(() => eventingStore),
        executeSubagentCancelAgent,
        executeSubagentCloseAgent,
      },
    });

    await expect(controller.cancelRun({ childRunId: run.id, reason: "Stop it." })).resolves.toBe(cancelledRun);
    expect(controller.closeRun({ childRunId: run.id, reason: "Done." })).toBe(closedRun);

    expect(executeSubagentCancelAgent).toHaveBeenCalledTimes(1);
    expect(executeSubagentCloseAgent).toHaveBeenCalledTimes(1);
    expect(emitted.filter((event) => event.type === "subagent-run-updated")).toHaveLength(2);
    expect(emitted.filter((event) => event.type === "thread-updated")).toHaveLength(2);
  });

  it("rejects canceling an already closed sub-agent before executor dispatch", async () => {
    const executeSubagentCancelAgent = vi.fn();
    const controller = controllerWithDependencies({
      store: storeDouble({
        getSubagentRun: vi.fn(() => subagentRun({ closedAt: "2026-06-21T00:00:03.000Z" })),
      }),
      dependencies: { executeSubagentCancelAgent },
    });

    await expect(controller.cancelRun({ childRunId: "child-run" })).rejects.toThrow("already released capacity");
    expect(executeSubagentCancelAgent).not.toHaveBeenCalled();
  });
});

function controllerWithDependencies(input: {
  store?: SubagentActionStore;
  emit?: (event: DesktopEvent) => void;
  dependencies?: Partial<AgentRuntimeSubagentActionDependencies>;
} = {}): AgentRuntimeSubagentActionController {
  return new AgentRuntimeSubagentActionController({
    store: input.store ?? storeDouble(),
    cancelChildRun: vi.fn(),
    retryChildRun: vi.fn(),
    emit: input.emit ?? vi.fn(),
    dependencies: input.dependencies,
  });
}

function storeDouble(overrides: Partial<SubagentActionStore> = {}): SubagentActionStore {
  const defaults = {
    getThread: vi.fn(() => threadSummary()),
    getSubagentRun: vi.fn(() => subagentRun()),
    getSubagentWaitBarrier: vi.fn(() => waitBarrier()),
    listSubagentRunEvents: vi.fn(() => []),
  } as Partial<SubagentActionStore>;
  return {
    ...defaults,
    ...overrides,
  } as SubagentActionStore;
}

function subagentRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "child-run",
    childThreadId: "child-thread",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    canonicalTaskPath: "Task",
    status: "running",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:01.000Z",
    ...overrides,
  } as SubagentRunSummary;
}

function threadSummary(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "child-thread",
    title: "Child",
    workspacePath: "/tmp/workspace",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    lastMessagePreview: "",
    model: "ambient-test-model",
    thinkingLevel: "medium",
    permissionMode: "workspace",
    collaborationMode: "agent",
    ...overrides,
  };
}

function runEvent(overrides: Partial<SubagentRunEventSummary> = {}): SubagentRunEventSummary {
  return {
    runId: "child-run",
    sequence: 1,
    type: "subagent.status",
    createdAt: "2026-06-21T00:00:02.000Z",
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
    failurePolicy: "degrade_partial",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

function parentMailboxEventSummary(
  overrides: Partial<SubagentParentMailboxEventSummary> = {},
): SubagentParentMailboxEventSummary {
  return {
    id: "parent-mailbox-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    type: "subagent.barrier_decision",
    payload: {},
    deliveryState: "queued",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}
