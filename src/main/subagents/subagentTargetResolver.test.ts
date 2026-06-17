import { describe, expect, it } from "vitest";
import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import {
  assertSubagentRunOpenForAction,
  resolveSubagentTargetRun,
  resolveSubagentTargetWaitBarrier,
  SUBAGENT_TARGET_RESOLVER_SCHEMA_VERSION,
  type SubagentTargetResolverStore,
} from "./subagentTargetResolver";

describe("subagentTargetResolver", () => {
  it("resolves target runs by childRunId, agentId, and canonical task path within the parent thread", () => {
    const store = new FakeTargetStore([
      run({ id: "child-a", canonicalTaskPath: "root/0:explorer" }),
      run({ id: "child-b", canonicalTaskPath: "root/1:reviewer" }),
    ]);

    expect(SUBAGENT_TARGET_RESOLVER_SCHEMA_VERSION).toBe("ambient-subagent-target-resolver-v1");
    expect(resolveSubagentTargetRun({
      store,
      parentThreadId: "parent-thread",
      request: { childRunId: "child-a", canonicalTaskPath: "root/1:reviewer" },
    }).id).toBe("child-a");
    expect(resolveSubagentTargetRun({
      store,
      parentThreadId: "parent-thread",
      request: { agentId: "child-b" },
    }).id).toBe("child-b");
    expect(resolveSubagentTargetRun({
      store,
      parentThreadId: "parent-thread",
      request: { canonicalTaskPath: "root/1:reviewer" },
    }).id).toBe("child-b");
  });

  it("rejects missing runs and runs from another parent thread", () => {
    const store = new FakeTargetStore([
      run({ id: "foreign-child", parentThreadId: "other-parent" }),
    ]);

    expect(() => resolveSubagentTargetRun({
      store,
      parentThreadId: "parent-thread",
      request: { canonicalTaskPath: "root/missing:explorer" },
    })).toThrow("childRunId, agentId, or canonicalTaskPath must identify an existing sub-agent run.");
    expect(() => resolveSubagentTargetRun({
      store,
      parentThreadId: "parent-thread",
      request: { childRunId: "foreign-child" },
    })).toThrow("Sub-agent run foreign-child does not belong to the current parent thread.");
  });

  it("resolves a unique near-miss childRunId within the parent thread", () => {
    const store = new FakeTargetStore([
      run({ id: "ad971fef-fe2c-45ee-b6bb-c66612a8b4e0", canonicalTaskPath: "root/0:reviewer" }),
      run({ id: "345031bc-d3c4-4326-a57e-242011315e92", canonicalTaskPath: "root/1:reviewer" }),
    ]);

    expect(resolveSubagentTargetRun({
      store,
      parentThreadId: "parent-thread",
      request: { childRunId: "ad971fef-fe2c-45ee-b6bb-c6bb12a8b4e0" },
    }).id).toBe("ad971fef-fe2c-45ee-b6bb-c66612a8b4e0");
  });

  it("does not guess ambiguous near-miss childRunIds", () => {
    const store = new FakeTargetStore([
      run({ id: "ad971fef-fe2c-45ee-b6bb-c66612a8b4e0", canonicalTaskPath: "root/0:reviewer" }),
      run({ id: "ad971fef-fe2c-45ee-b6bb-c66612a8b4e1", canonicalTaskPath: "root/1:reviewer" }),
    ]);

    expect(() => resolveSubagentTargetRun({
      store,
      parentThreadId: "parent-thread",
      request: { childRunId: "ad971fef-fe2c-45ee-b6bb-c66612a8b4e9" },
    })).toThrow("childRunId, agentId, or canonicalTaskPath must identify an existing sub-agent run.");
  });

  it("resolves explicit wait barriers and latest barriers for target child runs", () => {
    const store = new FakeTargetStore([
      run({ id: "child-a", parentRunId: "parent-run" }),
      run({ id: "child-b", parentRunId: "parent-run" }),
    ], [
      barrier({ id: "older", childRunIds: ["child-a"], createdAt: "2026-06-06T00:00:00.000Z" }),
      barrier({ id: "newer", childRunIds: ["child-a"], createdAt: "2026-06-06T01:00:00.000Z" }),
      barrier({ id: "explicit", childRunIds: ["child-b"], createdAt: "2026-06-06T02:00:00.000Z" }),
    ]);

    expect(resolveSubagentTargetWaitBarrier({
      store,
      parentThreadId: "parent-thread",
      request: { waitBarrierId: "explicit" },
    }).id).toBe("explicit");
    expect(resolveSubagentTargetWaitBarrier({
      store,
      parentThreadId: "parent-thread",
      request: { childRunId: "child-a" },
    }).id).toBe("newer");
  });

  it("rejects wait barriers from another parent thread or missing child barriers", () => {
    const store = new FakeTargetStore([
      run({ id: "child-a", parentRunId: "parent-run" }),
    ], [
      barrier({ id: "foreign-barrier", parentThreadId: "other-parent", childRunIds: ["child-a"] }),
    ]);

    expect(() => resolveSubagentTargetWaitBarrier({
      store,
      parentThreadId: "parent-thread",
      request: { waitBarrierId: "foreign-barrier" },
    })).toThrow("Sub-agent wait barrier foreign-barrier does not belong to the current parent thread.");
    expect(() => resolveSubagentTargetWaitBarrier({
      store,
      parentThreadId: "parent-thread",
      request: { childRunId: "child-a" },
    })).toThrow("No sub-agent wait barrier exists for child run child-a.");
  });

  it("blocks actions against closed or terminal sub-agent runs", () => {
    expect(() => assertSubagentRunOpenForAction(run({ id: "closed", closedAt: "2026-06-06T00:00:00.000Z" }), "send_agent"))
      .toThrow("Cannot send_agent for closed sub-agent closed.");
    expect(() => assertSubagentRunOpenForAction(run({ id: "failed", status: "failed" }), "followup_agent"))
      .toThrow("Cannot followup_agent for terminal sub-agent failed (failed).");
    expect(() => assertSubagentRunOpenForAction(run({ id: "running", status: "running" }), "send_agent"))
      .not.toThrow();
  });
});

class FakeTargetStore implements SubagentTargetResolverStore {
  private readonly runs = new Map<string, SubagentRunSummary>();
  private readonly barriers = new Map<string, SubagentWaitBarrierSummary>();

  constructor(runs: SubagentRunSummary[] = [], barriers: SubagentWaitBarrierSummary[] = []) {
    for (const childRun of runs) this.runs.set(childRun.id, childRun);
    for (const waitBarrier of barriers) this.barriers.set(waitBarrier.id, waitBarrier);
  }

  getSubagentRun(runId: string): SubagentRunSummary {
    const childRun = this.runs.get(runId);
    if (!childRun) throw new Error(`Unknown run: ${runId}`);
    return childRun;
  }

  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary {
    const waitBarrier = this.barriers.get(id);
    if (!waitBarrier) throw new Error(`Unknown wait barrier: ${id}`);
    return waitBarrier;
  }

  listSubagentRunsForParentThread(parentThreadId: string): SubagentRunSummary[] {
    return [...this.runs.values()].filter((childRun) => childRun.parentThreadId === parentThreadId);
  }

  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[] {
    return [...this.barriers.values()].filter((waitBarrier) => waitBarrier.parentRunId === parentRunId);
  }
}

function run(input: {
  id: string;
  parentThreadId?: string;
  parentRunId?: string;
  canonicalTaskPath?: string;
  status?: SubagentRunSummary["status"];
  closedAt?: string;
}): SubagentRunSummary {
  return {
    id: input.id,
    parentThreadId: input.parentThreadId ?? "parent-thread",
    parentRunId: input.parentRunId ?? "parent-run",
    canonicalTaskPath: input.canonicalTaskPath ?? `root/${input.id}:explorer`,
    status: input.status ?? "running",
    ...(input.closedAt ? { closedAt: input.closedAt } : {}),
  } as SubagentRunSummary;
}

function barrier(input: {
  id: string;
  parentThreadId?: string;
  parentRunId?: string;
  childRunIds: string[];
  createdAt?: string;
}): SubagentWaitBarrierSummary {
  return {
    id: input.id,
    parentThreadId: input.parentThreadId ?? "parent-thread",
    parentRunId: input.parentRunId ?? "parent-run",
    childRunIds: input.childRunIds,
    dependencyMode: "required_all",
    failurePolicy: "ask_user",
    status: "waiting_on_children",
    createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
  };
}
