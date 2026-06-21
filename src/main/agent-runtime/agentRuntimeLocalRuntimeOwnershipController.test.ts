import { describe, expect, it, vi } from "vitest";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import {
  AgentRuntimeLocalRuntimeOwnershipController,
  type AgentRuntimeLocalRuntimeOwnershipControllerOptions,
  type AgentRuntimeLocalRuntimeOwnershipDependencies,
} from "./agentRuntimeLocalRuntimeOwnershipController";
import type { LocalRuntimeOwnershipResolutionRequest } from "./agentRuntimeLocalRuntimeFacade";
import type { SubagentRuntimeEventEmitter } from "./agentRuntimePiFacade";

describe("AgentRuntimeLocalRuntimeOwnershipController", () => {
  it("cancels mapped owning sub-agent runs once and resolves all matching leases", async () => {
    const activeRun = subagentRun({
      id: "run-review",
      childThreadId: "child-review",
      parentThreadId: "parent-thread",
      status: "running",
      canonicalTaskPath: "root/review",
    });
    const executeSubagentCancelAgent = vi.fn(async (
      input: Parameters<AgentRuntimeLocalRuntimeOwnershipDependencies["executeSubagentCancelAgent"]>[0],
    ) => ({
      schemaVersion: "ambient-subagent-cancel-agent-executor-v1",
      replay: false,
      run: { ...input.run, status: "cancelled" },
      reason: input.reason ?? "",
      idempotencyKey: input.idempotencyKey ?? "",
      waitBarriers: [],
    }) as unknown as Awaited<ReturnType<AgentRuntimeLocalRuntimeOwnershipDependencies["executeSubagentCancelAgent"]>>);
    const emitSubagentRunAndChildThreadUpdated = vi.fn();
    const controller = new AgentRuntimeLocalRuntimeOwnershipController({
      store: storeWithRuns([activeRun]),
      createSubagentEventingStore: vi.fn(() => eventingStore()),
      cancelChildRun: vi.fn(async () => {
        throw new Error("The fake cancel executor should not call the runtime cancel adapter.");
      }),
      createRuntimeCancelEventEmitter: vi.fn(() => eventEmitter()),
      emitSubagentRunAndChildThreadUpdated,
      dependencies: { executeSubagentCancelAgent },
    });

    const result = await controller.resolveForForcedAction(request({
      action: "stop",
      affectedSubagents: [
        { leaseId: "lease-a", subagentThreadId: "child-review", parentThreadId: "parent-thread" },
        { leaseId: "lease-b", subagentThreadId: "child-review", parentThreadId: "parent-thread" },
      ],
    }));

    expect(executeSubagentCancelAgent).toHaveBeenCalledTimes(1);
    expect(executeSubagentCancelAgent.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      run: activeRun,
      toolCallId: "local-runtime-stop-ownership",
    }));
    expect(executeSubagentCancelAgent.mock.calls[0]?.[0].reason).toContain(
      "Forced local runtime Stop requested for local-text-runtime",
    );
    expect(emitSubagentRunAndChildThreadUpdated).toHaveBeenCalledWith(expect.objectContaining({
      id: "run-review",
      status: "cancelled",
    }));
    expect(result).toMatchObject({
      schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
      action: "stop",
      runtimeId: "local-text-runtime",
      status: "resolved",
      resolvedLeaseIds: ["lease-a", "lease-b"],
      resolvedChildRunIds: ["run-review"],
    });
  });

  it("blocks resolution when an affected lease cannot be mapped to a sub-agent run", async () => {
    const executeSubagentCancelAgent = vi.fn(async (
      input: Parameters<AgentRuntimeLocalRuntimeOwnershipDependencies["executeSubagentCancelAgent"]>[0],
    ) => ({
      schemaVersion: "ambient-subagent-cancel-agent-executor-v1",
      replay: false,
      run: input.run,
      reason: input.reason ?? "",
      idempotencyKey: input.idempotencyKey ?? "",
      waitBarriers: [],
    }) as unknown as Awaited<ReturnType<AgentRuntimeLocalRuntimeOwnershipDependencies["executeSubagentCancelAgent"]>>);
    const controller = new AgentRuntimeLocalRuntimeOwnershipController({
      store: storeWithRuns([]),
      createSubagentEventingStore: vi.fn(() => eventingStore()),
      cancelChildRun: vi.fn(async () => {
        throw new Error("No runtime cancellation should be attempted for unmapped leases.");
      }),
      createRuntimeCancelEventEmitter: vi.fn(() => eventEmitter()),
      emitSubagentRunAndChildThreadUpdated: vi.fn(),
      dependencies: { executeSubagentCancelAgent },
    });

    const result = await controller.resolveForForcedAction(request({
      action: "restart",
      affectedSubagents: [
        { leaseId: "lease-missing", subagentThreadId: "missing-child-thread" },
      ],
    }));

    expect(executeSubagentCancelAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
      action: "restart",
      runtimeId: "local-text-runtime",
      status: "blocked",
      resolvedLeaseIds: [],
      resolvedChildRunIds: [],
      blockedLeaseIds: ["lease-missing"],
    });
    expect(result.reason).toContain("No active sub-agent run maps to child thread missing-child-thread.");
  });
});

function storeWithRuns(runs: SubagentRunSummary[]): AgentRuntimeLocalRuntimeOwnershipControllerOptions["store"] {
  return {
    listAllSubagentRuns: () => runs,
  };
}

function eventingStore(): ReturnType<AgentRuntimeLocalRuntimeOwnershipControllerOptions["createSubagentEventingStore"]> {
  return {} as ReturnType<AgentRuntimeLocalRuntimeOwnershipControllerOptions["createSubagentEventingStore"]>;
}

function eventEmitter(): SubagentRuntimeEventEmitter {
  return (() => undefined) as unknown as SubagentRuntimeEventEmitter;
}

function subagentRun(input: Partial<SubagentRunSummary> & Pick<SubagentRunSummary, "id" | "childThreadId" | "parentThreadId" | "status" | "canonicalTaskPath">): SubagentRunSummary {
  return {
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    title: "Review worker",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    roleId: "reviewer",
    dependencyMode: "required",
    ...input,
  } as unknown as SubagentRunSummary;
}

function request(input: {
  action: LocalRuntimeOwnershipResolutionRequest["action"];
  affectedSubagents: Array<{
    leaseId: string;
    subagentThreadId: string;
    parentThreadId?: string;
    subagentRunId?: string;
  }>;
}): LocalRuntimeOwnershipResolutionRequest {
  return {
    schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
    action: input.action,
    runtimeId: "local-text-runtime",
    entryId: "local-text:local-text-runtime:5001",
    modelRuntimeId: "local-text-runtime",
    capabilityKind: "local-text",
    blockerLeaseIds: input.affectedSubagents.map((affected) => affected.leaseId),
    affectedSubagents: input.affectedSubagents.map((affected) => ({
      leaseId: affected.leaseId,
      subagentThreadId: affected.subagentThreadId,
      ...(affected.parentThreadId ? { parentThreadId: affected.parentThreadId } : {}),
      ...(affected.subagentRunId ? { subagentRunId: affected.subagentRunId } : {}),
      displayName: `sub-agent ${affected.subagentThreadId}`,
      status: "running",
      capabilityKind: "local-text",
    })),
    activeLeases: [],
    reason: "In use by local sub-agent.",
  };
}
