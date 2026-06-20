import { describe, expect, it } from "vitest";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type {
  SubagentDependencyMode,
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
  SubagentWaitBarrierStatus,
} from "../../shared/subagentProtocol";
import {
  findSubagentWaitBarrierForRuns,
  resolveSubagentWaitContext,
  SUBAGENT_WAIT_CONTEXT_RESOLVER_SCHEMA_VERSION,
  type SubagentWaitContextResolverStore,
} from "./subagentWaitContextResolver";

describe("subagentWaitContextResolver", () => {
  it("uses required wait defaults and creates a single-run barrier", () => {
    const store = new FakeWaitStore([
      run({ id: "child-a", dependencyMode: "required" }),
    ]);

    const context = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: { childRunId: "child-a" },
      timeoutMs: 1234,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });

    expect(SUBAGENT_WAIT_CONTEXT_RESOLVER_SCHEMA_VERSION).toBe("ambient-subagent-wait-context-resolver-v1");
    expect(context.run.id).toBe("child-a");
    expect(context.childRuns.map((child) => child.id)).toEqual(["child-a"]);
    expect(context.waitBarrier).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-a"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
      timeoutMs: 1234,
      status: "waiting_on_children",
    });
    expect(store.createdBarriers).toHaveLength(1);
  });

  it("uses optional background wait defaults for optional child runs", () => {
    const store = new FakeWaitStore([
      run({ id: "child-bg", dependencyMode: "optional_background" }),
    ]);

    const context = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: { childRunId: "child-bg" },
      timeoutMs: 5000,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });

    expect(context.waitBarrier).toMatchObject({
      childRunIds: ["child-bg"],
      dependencyMode: "optional_background",
      failurePolicy: "degrade_partial",
      timeoutMs: 5000,
    });
  });

  it("uses mode-aware timeout resolution when creating wait barriers", () => {
    const store = new FakeWaitStore([
      run({ id: "child-required", dependencyMode: "required" }),
      run({ id: "child-bg", dependencyMode: "optional_background" }),
    ]);

    const required = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: { childRunId: "child-required" },
      timeoutMs: 60_000,
      resolveTimeoutMs: (mode) => mode === "optional_background" ? 5_000 : 600_000,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });
    const optional = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: { childRunId: "child-bg" },
      timeoutMs: 60_000,
      resolveTimeoutMs: (mode) => mode === "optional_background" ? 5_000 : 600_000,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });

    expect(required.waitBarrier).toMatchObject({
      childRunIds: ["child-required"],
      dependencyMode: "required_all",
      timeoutMs: 600_000,
    });
    expect(optional.waitBarrier).toMatchObject({
      childRunIds: ["child-bg"],
      dependencyMode: "optional_background",
      timeoutMs: 5_000,
    });
  });

  it("reuses matching aggregate barriers and preserves explicit quorum policy", () => {
    const store = new FakeWaitStore([
      run({ id: "child-a" }),
      run({ id: "child-b" }),
      run({ id: "child-c" }),
    ]);
    const oldResolved = store.addBarrier({
      id: "old-resolved",
      childRunIds: ["child-b", "child-a", "child-c"],
      dependencyMode: "quorum",
      failurePolicy: "degrade_partial",
      quorumThreshold: 2,
      status: "satisfied",
      createdAt: "2026-06-06T01:00:00.000Z",
    });
    const active = store.addBarrier({
      id: "active",
      childRunIds: ["child-c", "child-a", "child-b"],
      dependencyMode: "quorum",
      failurePolicy: "degrade_partial",
      quorumThreshold: 2,
      status: "waiting_on_children",
      createdAt: "2026-06-06T02:00:00.000Z",
    });

    const found = findSubagentWaitBarrierForRuns(store, "parent-run", {
      childRunIds: ["child-a", "child-b", "child-c"],
      dependencyMode: "quorum",
      failurePolicy: "degrade_partial",
      quorumThreshold: 2,
    });
    const context = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: {
        childRunIds: ["child-a", "child-b", "child-c", "child-b"],
        waitBarrierMode: "quorum",
        failurePolicy: "degrade_partial",
        quorumThreshold: 2,
        childRunId: "child-b",
      },
      timeoutMs: 10_000,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });

    expect(found).toBe(active);
    expect(context.run.id).toBe("child-b");
    expect(context.waitBarrier).toBe(active);
    expect(context.waitBarrier).not.toBe(oldResolved);
    expect(store.createdBarriers).toEqual([]);
  });

  it("keeps owner-scoped aggregate waits separate from ordinary waits over the same children", () => {
    const store = new FakeWaitStore([
      run({ id: "child-a" }),
      run({ id: "child-b" }),
    ]);
    const owned = store.addBarrier({
      id: "bridge-owned",
      childRunIds: ["child-a", "child-b"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
      ownerKind: "callable_workflow_symphony_launch_bridge",
      ownerId: "workflow-task-1",
      status: "waiting_on_children",
    });

    const bridgeContext = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      trustedWaitBarrierOwner: {
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: "workflow-task-1",
      },
      request: {
        childRunIds: ["child-a", "child-b"],
        waitBarrierMode: "required_all",
        failurePolicy: "ask_user",
      },
      timeoutMs: 10_000,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });
    const singleChildContext = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: {
        childRunId: "child-a",
      },
      timeoutMs: 10_000,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });
    const ordinaryContext = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: {
        childRunIds: ["child-a", "child-b"],
        waitBarrierMode: "required_all",
        failurePolicy: "ask_user",
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: "workflow-task-1",
      },
      timeoutMs: 10_000,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });

    expect(bridgeContext.waitBarrier).toBe(owned);
    expect(singleChildContext.waitBarrier).not.toBe(owned);
    expect(singleChildContext.waitBarrier).toMatchObject({
      childRunIds: ["child-a"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
    });
    expect(singleChildContext.waitBarrier.ownerKind).toBeUndefined();
    expect(ordinaryContext.waitBarrier).not.toBe(owned);
    expect(ordinaryContext.waitBarrier).toMatchObject({
      childRunIds: ["child-a", "child-b"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
    });
    expect(ordinaryContext.waitBarrier.ownerKind).toBeUndefined();
    expect(ordinaryContext.waitBarrier.ownerId).toBeUndefined();
    expect(store.createdBarriers).toHaveLength(2);
  });

  it("resolves explicit wait-barrier handles and validates child ownership", () => {
    const store = new FakeWaitStore([
      run({ id: "child-a" }),
      run({ id: "child-b" }),
    ]);
    const barrier = store.addBarrier({
      id: "barrier-explicit",
      childRunIds: ["child-a", "child-b"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
      status: "waiting_on_children",
    });

    const context = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: { waitBarrierId: "barrier-explicit", childRunId: "child-b" },
      timeoutMs: 42,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });

    expect(context.run.id).toBe("child-b");
    expect(context.childRuns.map((child) => child.id)).toEqual(["child-a", "child-b"]);
    expect(context.waitBarrier).toBe(barrier);
    expect(store.createdBarriers).toEqual([]);
  });

  it("returns the latest terminal child barrier for inspection instead of creating an implicit retry barrier", () => {
    const store = new FakeWaitStore([
      run({ id: "child-a" }),
    ]);
    const terminal = store.addBarrier({
      id: "timed-out-barrier",
      childRunIds: ["child-a"],
      dependencyMode: "required_all",
      failurePolicy: "ask_user",
      status: "timed_out",
      createdAt: "2026-06-06T02:00:00.000Z",
    });

    const context = resolveSubagentWaitContext({
      store,
      parentThread: { id: "parent-thread" },
      request: { childRunId: "child-a" },
      timeoutMs: 42,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    });

    expect(context.waitBarrier).toBe(terminal);
    expect(context.waitBarrier.status).toBe("timed_out");
    expect(store.createdBarriers).toEqual([]);
  });

  it("rejects aggregate waits across parent runs or with unrelated primary handles", () => {
    const store = new FakeWaitStore([
      run({ id: "child-a", parentRunId: "parent-run" }),
      run({ id: "child-b", parentRunId: "other-parent-run" }),
      run({ id: "child-c", parentRunId: "parent-run" }),
    ]);

    const base = {
      store,
      parentThread: { id: "parent-thread" },
      timeoutMs: 42,
      resolveTargetRun: targetRunResolver(store),
      resolveTargetWaitBarrier: targetWaitBarrierResolver(store),
    };

    expect(() =>
      resolveSubagentWaitContext({
        ...base,
        request: { childRunIds: ["child-a", "child-b"] },
      })
    ).toThrow("wait_agent childRunIds must belong to the same parent run.");

    expect(() =>
      resolveSubagentWaitContext({
        ...base,
        request: { childRunIds: ["child-a"], childRunId: "child-c" },
      })
    ).toThrow("is not part of the requested wait barrier childRunIds.");
  });
});

class FakeWaitStore implements SubagentWaitContextResolverStore {
  readonly runs = new Map<string, SubagentRunSummary>();
  readonly barriers: SubagentWaitBarrierSummary[] = [];
  readonly createdBarriers: SubagentWaitBarrierSummary[] = [];
  private nextBarrier = 1;

  constructor(runs: SubagentRunSummary[]) {
    for (const childRun of runs) this.runs.set(childRun.id, childRun);
  }

  getSubagentRun(runId: string): SubagentRunSummary {
    const childRun = this.runs.get(runId);
    if (!childRun) throw new Error(`Unknown run: ${runId}`);
    return childRun;
  }

  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[] {
    return this.barriers.filter((barrier) => barrier.parentRunId === parentRunId);
  }

  createSubagentWaitBarrier(input: {
    parentThreadId: string;
    parentRunId: string;
    childRunIds: string[];
    dependencyMode: SubagentWaitBarrierMode;
    failurePolicy: SubagentWaitBarrierFailurePolicy;
    ownerKind?: SubagentWaitBarrierSummary["ownerKind"];
    ownerId?: string;
    quorumThreshold?: number;
    timeoutMs?: number;
  }): SubagentWaitBarrierSummary {
    const barrier = barrierSummary({
      id: `created-${this.nextBarrier++}`,
      ...input,
      status: "waiting_on_children",
      createdAt: `2026-06-06T03:00:0${this.nextBarrier}.000Z`,
    });
    this.barriers.push(barrier);
    this.createdBarriers.push(barrier);
    return barrier;
  }

  addBarrier(input: {
    id: string;
    childRunIds: string[];
    dependencyMode: SubagentWaitBarrierMode;
    failurePolicy: SubagentWaitBarrierFailurePolicy;
    ownerKind?: SubagentWaitBarrierSummary["ownerKind"];
    ownerId?: string;
    quorumThreshold?: number;
    status: SubagentWaitBarrierStatus;
    parentThreadId?: string;
    parentRunId?: string;
    createdAt?: string;
  }): SubagentWaitBarrierSummary {
    const barrier = barrierSummary(input);
    this.barriers.push(barrier);
    return barrier;
  }
}

function targetRunResolver(store: FakeWaitStore): (request: Record<string, unknown>) => SubagentRunSummary {
  return (request) => {
    const childRunId = stringInput(request.childRunId) ?? stringInput(request.agentId);
    const canonicalTaskPath = stringInput(request.canonicalTaskPath);
    const childRun = childRunId
      ? store.getSubagentRun(childRunId)
      : [...store.runs.values()].find((candidate) => candidate.canonicalTaskPath === canonicalTaskPath);
    if (!childRun) throw new Error("childRunId, agentId, or canonicalTaskPath must identify an existing sub-agent run.");
    if (childRun.parentThreadId !== "parent-thread") {
      throw new Error(`Sub-agent run ${childRun.id} does not belong to the current parent thread.`);
    }
    return childRun;
  };
}

function targetWaitBarrierResolver(store: FakeWaitStore): (request: Record<string, unknown>) => SubagentWaitBarrierSummary {
  return (request) => {
    const waitBarrierId = stringInput(request.waitBarrierId);
    const barrier = store.barriers.find((candidate) => candidate.id === waitBarrierId);
    if (!barrier) throw new Error(`Unknown wait barrier: ${waitBarrierId ?? ""}`);
    if (barrier.parentThreadId !== "parent-thread") {
      throw new Error(`Sub-agent wait barrier ${barrier.id} does not belong to the current parent thread.`);
    }
    return barrier;
  };
}

function run(input: {
  id: string;
  parentThreadId?: string;
  parentRunId?: string;
  dependencyMode?: SubagentDependencyMode;
}): SubagentRunSummary {
  return {
    id: input.id,
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: input.parentThreadId ?? "parent-thread",
    parentRunId: input.parentRunId ?? "parent-run",
    childThreadId: `${input.id}-thread`,
    canonicalTaskPath: `root/${input.id}:explorer`,
    roleId: "explorer",
    roleProfileSnapshot: { id: "explorer" },
    roleProfileSnapshotSource: "resolved",
    dependencyMode: input.dependencyMode ?? "required",
    status: "running",
    featureFlagSnapshot: { subagents: true },
    modelRuntimeSnapshot: { modelId: "glm-5.1" },
    capacityLeaseSnapshot: { status: "reserved" },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  } as unknown as SubagentRunSummary;
}

function barrierSummary(input: {
  id: string;
  childRunIds: string[];
  dependencyMode: SubagentWaitBarrierMode;
  failurePolicy: SubagentWaitBarrierFailurePolicy;
  ownerKind?: SubagentWaitBarrierSummary["ownerKind"];
  ownerId?: string;
  quorumThreshold?: number;
  status: SubagentWaitBarrierStatus;
  parentThreadId?: string;
  parentRunId?: string;
  timeoutMs?: number;
  createdAt?: string;
}): SubagentWaitBarrierSummary {
  return {
    id: input.id,
    parentThreadId: input.parentThreadId ?? "parent-thread",
    parentRunId: input.parentRunId ?? "parent-run",
    childRunIds: input.childRunIds,
    dependencyMode: input.dependencyMode,
    status: input.status,
    failurePolicy: input.failurePolicy,
    ...(input.ownerKind ? { ownerKind: input.ownerKind } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    ...(input.quorumThreshold !== undefined ? { quorumThreshold: input.quorumThreshold } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
  };
}

function stringInput(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
