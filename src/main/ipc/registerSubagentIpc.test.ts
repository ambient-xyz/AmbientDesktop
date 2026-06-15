import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type {
  CancelSubagentRunInput,
  CloseSubagentRunInput,
  ResolveSubagentApprovalInput,
  ResolveSubagentWaitBarrierInput,
  SubagentApprovalResolutionResult,
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierResolutionResult,
} from "../../shared/types";
import {
  registerSubagentApprovalIpc,
  subagentApprovalIpcChannels,
  type RegisterSubagentApprovalIpcDependencies,
} from "./registerSubagentIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerSubagentApprovalIpc", () => {
  it("registers the sub-agent approval channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...subagentApprovalIpcChannels]);
  });

  it("resolves child approvals only when ambient.subagents is enabled", async () => {
    const { deps, host, invoke, store } = registerWithFakes();

    await expect(invoke("subagents:resolve-approval", {
      childRunId: "child-run",
      approvalId: "approval-worker-write",
      decision: "approved",
      approvalRequestParentMailboxEventId: "parent-mailbox-request",
      userDecision: "Approve for this child.",
    })).resolves.toBe(result);

    expect(deps.requireProjectRuntimeHostForSubagentRun).toHaveBeenCalledWith("child-run");
    expect(deps.resolveSubagentApproval).toHaveBeenCalledWith(store, {
      childRunId: "child-run",
      approvalId: "approval-worker-write",
      decision: "approved",
      approvalRequestParentMailboxEventId: "parent-mailbox-request",
      userDecision: "Approve for this child.",
    });
    expect(deps.emitSubagentParentMailboxEventUpdated).toHaveBeenCalledWith(host, result.approvalRequestParentMailboxEvent);
    expect(deps.emitSubagentParentMailboxEventUpdated).toHaveBeenCalledWith(host, result.approvalForwardedParentMailboxEvent);
    expect(deps.emitProjectStateUpdated).toHaveBeenCalledWith(host);
  });

  it("rejects disabled feature state before writing approval responses", async () => {
    const { deps, invoke } = registerWithFakes({ enabled: false });

    await expect(invoke("subagents:resolve-approval", {
      childRunId: "child-run",
      approvalId: "approval-worker-write",
      decision: "denied",
    })).rejects.toThrow(/ambient\.subagents is off/);

    expect(deps.resolveSubagentApproval).not.toHaveBeenCalled();
    expect(deps.emitSubagentParentMailboxEventUpdated).not.toHaveBeenCalled();
    expect(deps.emitProjectStateUpdated).not.toHaveBeenCalled();
  });

  it("rejects malformed approval input before resolving hosts", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("subagents:resolve-approval", {
      childRunId: "",
      approvalId: "approval-worker-write",
      decision: "approved",
    })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForSubagentRun).not.toHaveBeenCalled();
    expect(deps.resolveSubagentApproval).not.toHaveBeenCalled();
  });

  it("routes child cancel and close controls only when ambient.subagents is enabled", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(invoke("subagents:cancel-run", {
      childRunId: "child-run",
      reason: "Stop this child from the parent cluster.",
    })).resolves.toBe(cancelledRun);
    await expect(invoke("subagents:close-run", {
      childRunId: "child-run",
      reason: "Release child capacity from the parent cluster.",
    })).resolves.toBe(closedRun);

    expect(deps.requireProjectRuntimeHostForSubagentRun).toHaveBeenCalledWith("child-run");
    expect(deps.cancelSubagentRun).toHaveBeenCalledWith(host, {
      childRunId: "child-run",
      reason: "Stop this child from the parent cluster.",
    });
    expect(deps.closeSubagentRun).toHaveBeenCalledWith(host, {
      childRunId: "child-run",
      reason: "Release child capacity from the parent cluster.",
    });
    expect(deps.emitProjectStateUpdated).toHaveBeenCalledWith(host);
  });

  it("routes wait-barrier decisions only when ambient.subagents is enabled", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(invoke("subagents:resolve-wait-barrier", {
      waitBarrierId: "barrier-1",
      decision: "cancel_parent",
      userDecision: "Cancel the blocked parent path.",
    })).resolves.toBe(waitBarrierResolution);

    expect(deps.requireProjectRuntimeHostForSubagentWaitBarrier).toHaveBeenCalledWith("barrier-1");
    expect(deps.resolveSubagentWaitBarrier).toHaveBeenCalledWith(host, {
      waitBarrierId: "barrier-1",
      decision: "cancel_parent",
      userDecision: "Cancel the blocked parent path.",
    });
    expect(deps.emitProjectStateUpdated).toHaveBeenCalledWith(host);
  });

  it("rejects disabled wait-barrier controls before runtime mutations", async () => {
    const { deps, invoke } = registerWithFakes({ enabled: false });

    await expect(invoke("subagents:resolve-wait-barrier", {
      waitBarrierId: "barrier-1",
      decision: "retry_child",
    })).rejects.toThrow(/ambient\.subagents is off/);

    expect(deps.resolveSubagentWaitBarrier).not.toHaveBeenCalled();
  });

  it("rejects malformed wait-barrier controls before resolving hosts", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("subagents:resolve-wait-barrier", {
      waitBarrierId: "",
      decision: "retry_child",
    })).rejects.toThrow();
    await expect(invoke("subagents:resolve-wait-barrier", {
      waitBarrierId: "barrier-1",
      decision: "unknown",
    })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForSubagentWaitBarrier).not.toHaveBeenCalled();
    expect(deps.resolveSubagentWaitBarrier).not.toHaveBeenCalled();
  });

  it("rejects disabled child controls before runtime mutations", async () => {
    const { deps, invoke } = registerWithFakes({ enabled: false });

    await expect(invoke("subagents:cancel-run", { childRunId: "child-run" })).rejects.toThrow(/ambient\.subagents is off/);
    await expect(invoke("subagents:close-run", { childRunId: "child-run" })).rejects.toThrow(/ambient\.subagents is off/);

    expect(deps.cancelSubagentRun).not.toHaveBeenCalled();
    expect(deps.closeSubagentRun).not.toHaveBeenCalled();
  });

  it("rejects malformed child controls before resolving hosts", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("subagents:cancel-run", { childRunId: "" })).rejects.toThrow();
    await expect(invoke("subagents:close-run", { childRunId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForSubagentRun).not.toHaveBeenCalled();
    expect(deps.cancelSubagentRun).not.toHaveBeenCalled();
    expect(deps.closeSubagentRun).not.toHaveBeenCalled();
  });
});

function registerWithFakes(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const handlers = new Map<string, IpcListener>();
  const store = { marker: "subagent-approval-store" };
  const host = {
    store,
    workspacePath: "/workspace",
  };
  const deps: RegisterSubagentApprovalIpcDependencies<typeof store, typeof host> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForSubagentRun: vi.fn(() => host),
    getFeatureFlagSnapshot: vi.fn(() => resolveAmbientFeatureFlags({
      startup: {
        enabled: enabled ? [AMBIENT_SUBAGENTS_FEATURE_FLAG] : [],
        disabled: enabled ? [] : [AMBIENT_SUBAGENTS_FEATURE_FLAG],
      },
    })),
    resolveSubagentApproval: vi.fn((_store: typeof store, _input: ResolveSubagentApprovalInput) => result),
    resolveSubagentWaitBarrier: vi.fn((_host: typeof host, _input: ResolveSubagentWaitBarrierInput) => waitBarrierResolution),
    requireProjectRuntimeHostForSubagentWaitBarrier: vi.fn(() => host),
    cancelSubagentRun: vi.fn((_host: typeof host, _input: CancelSubagentRunInput) => cancelledRun),
    closeSubagentRun: vi.fn((_host: typeof host, _input: CloseSubagentRunInput) => closedRun),
    emitSubagentParentMailboxEventUpdated: vi.fn(),
    emitProjectStateUpdated: vi.fn(),
  };
  registerSubagentApprovalIpc(deps);

  return {
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

const requestParentMailboxEvent: SubagentParentMailboxEventSummary = {
  id: "parent-mailbox-request",
  parentThreadId: "parent-thread",
  parentRunId: "parent-run",
  parentMessageId: "assistant-message",
  type: "subagent.child_approval_requested",
  payload: { childRunId: "child-run", approvalId: "approval-worker-write" },
  deliveryState: "consumed",
  createdAt: "2026-06-06T17:00:00.000Z",
  updatedAt: "2026-06-06T17:05:00.000Z",
  deliveredAt: "2026-06-06T17:05:00.000Z",
};

const forwardedParentMailboxEvent: SubagentParentMailboxEventSummary = {
  id: "parent-mailbox-forwarded",
  parentThreadId: "parent-thread",
  parentRunId: "parent-run",
  parentMessageId: "assistant-message",
  type: "subagent.child_approval_forwarded",
  payload: { childRunId: "child-run", approvalId: "approval-worker-write", decision: "approved" },
  deliveryState: "delivered",
  createdAt: "2026-06-06T17:05:00.000Z",
  updatedAt: "2026-06-06T17:05:00.000Z",
  deliveredAt: "2026-06-06T17:05:00.000Z",
};

const result = {
  schemaVersion: "ambient-subagent-approval-resolution-v1",
  replay: false,
  childRun: { id: "child-run" },
  approvalId: "approval-worker-write",
  decision: "approved",
  requestedScope: "this_action",
  effectiveScope: "this_action",
  childAlwaysDefaulted: false,
  parentRemainsBlocked: true,
  approvalRequestParentMailboxEvent: requestParentMailboxEvent,
  approvalForwardedParentMailboxEvent: forwardedParentMailboxEvent,
} as SubagentApprovalResolutionResult;

const cancelledRun = {
  id: "child-run",
  status: "cancelled",
  childThreadId: "child-thread",
} as SubagentRunSummary;

const closedRun = {
  id: "child-run",
  status: "completed",
  childThreadId: "child-thread",
  closedAt: "2026-06-06T18:00:00.000Z",
} as SubagentRunSummary;

const waitBarrierResolution = {
  schemaVersion: "ambient-subagent-wait-barrier-resolution-result-v1",
  replay: false,
  decision: "cancel_parent",
  waitBarrier: {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "cancelled",
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T17:00:00.000Z",
    updatedAt: "2026-06-06T17:05:00.000Z",
  },
  childRuns: [cancelledRun],
  parentMailboxEvent: forwardedParentMailboxEvent,
} as SubagentWaitBarrierResolutionResult;
