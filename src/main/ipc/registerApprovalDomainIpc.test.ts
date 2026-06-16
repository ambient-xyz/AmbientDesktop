import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  resolveAmbientFeatureFlags,
} from "../../shared/featureFlags";
import type {
  CancelSubagentRunInput,
  CloseSubagentRunInput,
  ResolveSubagentApprovalInput,
  ResolveSubagentWaitBarrierInput,
  SubagentApprovalResolutionResult,
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierResolutionResult,
  WorkflowRunDetail,
} from "../../shared/types";
import {
  approvalDomainIpcChannels,
  registerApprovalDomainIpc,
  type RegisterApprovalDomainIpcDependencies,
} from "./registerApprovalDomainIpc";
import { subagentApprovalIpcChannels } from "./registerSubagentIpc";
import { workflowApprovalIpcChannels } from "./registerWorkflowIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerApprovalDomainIpc", () => {
  it("registers workflow and sub-agent approval channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...approvalDomainIpcChannels]);
    expect([...approvalDomainIpcChannels]).toEqual([
      ...workflowApprovalIpcChannels,
      ...subagentApprovalIpcChannels,
    ]);
  });

  it("routes workflow approvals through the workflow run owner and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(invoke("workflow:resolve-approval", {
      runId: "workflow-run-1",
      approvalId: "approval-1",
      decision: "approved",
    })).resolves.toBe(workflowRunDetail);

    expect(deps.requireProjectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("workflow-run-1");
    expect(deps.resolveWorkflowApproval).toHaveBeenCalledWith(store, {
      runId: "workflow-run-1",
      approvalId: "approval-1",
      decision: "approved",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("wraps sub-agent approval mailbox events as project-scoped events", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(invoke("subagents:resolve-approval", {
      childRunId: "child-run-1",
      approvalId: "approval-worker-write",
      decision: "approved",
      approvalRequestParentMailboxEventId: "parent-mailbox-request",
    })).resolves.toBe(subagentApprovalResult);

    expect(deps.requireProjectRuntimeHostForSubagentRun).toHaveBeenCalledWith("child-run-1");
    expect(deps.resolveSubagentApprovalDecision).toHaveBeenCalledWith(store, {
      childRunId: "child-run-1",
      approvalId: "approval-worker-write",
      decision: "approved",
      approvalRequestParentMailboxEventId: "parent-mailbox-request",
    });
    expect(deps.emitProjectScopedEvent).toHaveBeenCalledWith(host, {
      type: "subagent-parent-mailbox-event-updated",
      mailboxEvent: requestParentMailboxEvent,
    });
    expect(deps.emitProjectScopedEvent).toHaveBeenCalledWith(host, {
      type: "subagent-parent-mailbox-event-updated",
      mailboxEvent: forwardedParentMailboxEvent,
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });

  it("routes wait-barrier and child-run controls through the runtime owner", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(invoke("subagents:resolve-wait-barrier", {
      waitBarrierId: "barrier-1",
      decision: "continue_with_partial",
      partialSummary: "Use the completed child work.",
    })).resolves.toBe(waitBarrierResolution);
    await expect(invoke("subagents:cancel-run", {
      childRunId: "child-run-1",
      reason: "Stop child.",
    })).resolves.toBe(cancelledRun);
    await expect(invoke("subagents:close-run", {
      childRunId: "child-run-1",
      reason: "Dismiss child.",
    })).resolves.toBe(closedRun);

    expect(deps.requireProjectRuntimeHostForSubagentWaitBarrier).toHaveBeenCalledWith("barrier-1");
    expect(host.runtime.resolveSubagentWaitBarrier).toHaveBeenCalledWith({
      waitBarrierId: "barrier-1",
      decision: "continue_with_partial",
      partialSummary: "Use the completed child work.",
    });
    expect(host.runtime.cancelSubagentRun).toHaveBeenCalledWith({
      childRunId: "child-run-1",
      reason: "Stop child.",
    });
    expect(host.runtime.closeSubagentRun).toHaveBeenCalledWith({
      childRunId: "child-run-1",
      reason: "Dismiss child.",
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
  });
});

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store = { marker: "approval-domain-store" };
  const host = {
    runtime: {
      resolveSubagentWaitBarrier: vi.fn((_input: ResolveSubagentWaitBarrierInput) => waitBarrierResolution),
      cancelSubagentRun: vi.fn((_input: CancelSubagentRunInput) => cancelledRun),
      closeSubagentRun: vi.fn((_input: CloseSubagentRunInput) => closedRun),
    },
    store,
    workspacePath: "/workspace",
  };
  const deps: RegisterApprovalDomainIpcDependencies<typeof store, typeof host> = {
    emitProjectScopedEvent: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    emitWorkflowUpdated: vi.fn(),
    getFeatureFlagSnapshot: vi.fn(() => resolveAmbientFeatureFlags({
      startup: {
        enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG],
        disabled: [],
      },
    })),
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForSubagentRun: vi.fn(() => host),
    requireProjectRuntimeHostForSubagentWaitBarrier: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRun: vi.fn(() => host),
    resolveSubagentApprovalDecision: vi.fn((_store: typeof store, _input: ResolveSubagentApprovalInput) => subagentApprovalResult),
    resolveWorkflowApproval: vi.fn(() => workflowRunDetail),
  };

  registerApprovalDomainIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
    store,
  };
}

const workflowRunDetail = {
  id: "workflow-run-1",
  status: "running",
} as unknown as WorkflowRunDetail;

const requestParentMailboxEvent: SubagentParentMailboxEventSummary = {
  id: "parent-mailbox-request",
  parentThreadId: "parent-thread",
  parentRunId: "parent-run",
  parentMessageId: "assistant-message",
  type: "subagent.child_approval_requested",
  payload: { childRunId: "child-run-1", approvalId: "approval-worker-write" },
  deliveryState: "consumed",
  createdAt: "2026-06-16T17:00:00.000Z",
  updatedAt: "2026-06-16T17:05:00.000Z",
  deliveredAt: "2026-06-16T17:05:00.000Z",
};

const forwardedParentMailboxEvent: SubagentParentMailboxEventSummary = {
  id: "parent-mailbox-forwarded",
  parentThreadId: "parent-thread",
  parentRunId: "parent-run",
  parentMessageId: "assistant-message",
  type: "subagent.approval_forwarded",
  payload: { childRunId: "child-run-1", approvalId: "approval-worker-write" },
  deliveryState: "consumed",
  createdAt: "2026-06-16T17:06:00.000Z",
  updatedAt: "2026-06-16T17:06:00.000Z",
  deliveredAt: "2026-06-16T17:06:00.000Z",
};

const subagentApprovalResult: SubagentApprovalResolutionResult = {
  schemaVersion: "ambient-subagent-approval-resolution-v1",
  replay: false,
  childRun: {
    id: "child-run-1",
    status: "running",
  } as unknown as SubagentRunSummary,
  approvalId: "approval-worker-write",
  decision: "approved",
  requestedScope: "workspace-write",
  effectiveScope: "workspace-write",
  childAlwaysDefaulted: false,
  parentRemainsBlocked: false,
  approvalRequestParentMailboxEvent: requestParentMailboxEvent,
  approvalForwardedParentMailboxEvent: forwardedParentMailboxEvent,
};

const waitBarrierResolution: SubagentWaitBarrierResolutionResult = {
  schemaVersion: "ambient-subagent-wait-barrier-resolution-result-v1",
  replay: false,
  childRuns: [{
    id: "child-run-1",
    status: "completed",
  } as unknown as SubagentRunSummary],
  decision: "continue_with_partial",
  waitBarrier: {
    id: "barrier-1",
    status: "resolved",
  } as unknown as SubagentWaitBarrierResolutionResult["waitBarrier"],
};

const cancelledRun = {
  id: "child-run-1",
  status: "cancelled",
} as unknown as SubagentRunSummary;

const closedRun = {
  id: "child-run-1",
  status: "closed",
} as unknown as SubagentRunSummary;
