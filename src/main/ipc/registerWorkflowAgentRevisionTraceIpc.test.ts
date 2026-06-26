import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowRevisionSummary } from "../../shared/workflowTypes";
import {
  registerWorkflowAgentRevisionIpc,
  registerWorkflowAgentTraceIpc,
  workflowAgentRevisionIpcChannels,
  workflowAgentTraceIpcChannels,
  type RegisterWorkflowAgentRevisionIpcDependencies,
  type RegisterWorkflowAgentTraceIpcDependencies,
} from "./registerWorkflowIpc";
import {
  appliedWorkflowRevision,
  workflowDashboard,
  workflowExplorationTrace,
  workflowGraphSnapshot,
  workflowRevision,
  workflowVersion,
  type FakeWorkflowAgentRevisionHost,
  type FakeWorkflowAgentRevisionStore,
  type FakeWorkflowAgentTraceHost,
  type FakeWorkflowAgentTraceStore,
  type IpcListener,
} from "./registerWorkflowAgentIpcTestSupport";

describe("registerWorkflowAgentRevisionIpc", () => {
  it("registers the workflow-agent revision channels", () => {
    const { handlers } = registerRevisionWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentRevisionIpcChannels]);
  });

  it("lists revisions through the workflow thread host", async () => {
    const { deps, invoke, store } = registerRevisionWithFakes();

    await expect(invoke("workflow-agents:list-revisions", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual([workflowRevision]);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.listWorkflowRevisions).toHaveBeenCalledWith("workflow-thread-1");
  });

  it("restores versions and emits workflow updates", async () => {
    const { deps, host, invoke } = registerRevisionWithFakes();

    await expect(invoke("workflow-agents:restore-version", { versionId: "version-1", approveRestored: true })).resolves.toBe(
      workflowDashboard,
    );

    expect(deps.requireProjectRuntimeHostForWorkflowVersion).toHaveBeenCalledWith("version-1");
    expect(deps.restoreWorkflowVersion).toHaveBeenCalledWith(host, { versionId: "version-1", approveRestored: true });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith("/workspace");
  });

  it("creates and updates revisions through the owning hosts", async () => {
    const { deps, invoke, store } = registerRevisionWithFakes();

    await expect(
      invoke("workflow-agents:create-revision", {
        workflowThreadId: "workflow-thread-1",
        requestedChange: "Make retries clearer.",
        baseVersionId: "version-1",
        status: "proposed",
      }),
    ).resolves.toBe(workflowRevision);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.createWorkflowRevision).toHaveBeenCalledWith({
      workflowThreadId: "workflow-thread-1",
      requestedChange: "Make retries clearer.",
      baseVersionId: "version-1",
      status: "proposed",
    });

    await expect(invoke("workflow-agents:update-revision", { id: "revision-1", status: "draft" })).resolves.toBe(workflowRevision);

    expect(deps.requireProjectRuntimeHostForWorkflowRevision).toHaveBeenCalledWith("revision-1");
    expect(store.updateWorkflowRevision).toHaveBeenCalledWith({ id: "revision-1", status: "draft" });
  });

  it("records revision decisions only when the status changes", async () => {
    const changed = registerRevisionWithFakes();

    await expect(changed.invoke("workflow-agents:resolve-revision", { id: "revision-1", decision: "applied" })).resolves.toBe(
      appliedWorkflowRevision,
    );

    expect(changed.store.getWorkflowRevision).toHaveBeenCalledWith("revision-1");
    expect(changed.store.resolveWorkflowRevision).toHaveBeenCalledWith({ id: "revision-1", decision: "applied" });
    expect(changed.deps.recordWorkflowRevisionDecisionInChat).toHaveBeenCalledWith(appliedWorkflowRevision, "applied", changed.store);

    const unchanged = registerRevisionWithFakes({
      beforeRevision: appliedWorkflowRevision,
      resolvedRevision: appliedWorkflowRevision,
    });

    await expect(unchanged.invoke("workflow-agents:resolve-revision", { id: "revision-1", decision: "applied" })).resolves.toBe(
      appliedWorkflowRevision,
    );
    expect(unchanged.deps.recordWorkflowRevisionDecisionInChat).not.toHaveBeenCalled();
  });

  it("rejects invalid revision input before resolving hosts", async () => {
    const { deps, invoke, store } = registerRevisionWithFakes();

    await expect(invoke("workflow-agents:list-versions", { workflowThreadId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowThread).not.toHaveBeenCalled();
    expect(store.listWorkflowVersions).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowAgentTraceIpc", () => {
  it("registers the workflow-agent trace channels", () => {
    const { handlers } = registerAgentTraceWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowAgentTraceIpcChannels]);
  });

  it("lists graph snapshots through the workflow thread host", async () => {
    const { deps, invoke, store } = registerAgentTraceWithFakes();

    await expect(invoke("workflow-agents:list-graph-snapshots", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual([
      workflowGraphSnapshot,
    ]);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.listWorkflowGraphSnapshots).toHaveBeenCalledWith("workflow-thread-1");
  });

  it("lists exploration traces through the workflow thread host", async () => {
    const { deps, invoke, store } = registerAgentTraceWithFakes();

    await expect(invoke("workflow-agents:list-exploration-traces", { workflowThreadId: "workflow-thread-1" })).resolves.toEqual([
      workflowExplorationTrace,
    ]);

    expect(deps.requireProjectRuntimeHostForWorkflowThread).toHaveBeenCalledWith("workflow-thread-1");
    expect(store.listWorkflowExplorationTraces).toHaveBeenCalledWith("workflow-thread-1");
  });

  it("rejects invalid trace input before resolving hosts", async () => {
    const { deps, invoke, store } = registerAgentTraceWithFakes();

    await expect(invoke("workflow-agents:list-graph-snapshots", { workflowThreadId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowThread).not.toHaveBeenCalled();
    expect(store.listWorkflowGraphSnapshots).not.toHaveBeenCalled();
  });
});
function registerAgentTraceWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentTraceStore = {
    listWorkflowGraphSnapshots: vi.fn(() => [workflowGraphSnapshot]),
    listWorkflowExplorationTraces: vi.fn(() => [workflowExplorationTrace]),
  };
  const host: FakeWorkflowAgentTraceHost = {
    store,
  };
  const deps: RegisterWorkflowAgentTraceIpcDependencies<FakeWorkflowAgentTraceStore, FakeWorkflowAgentTraceHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowThread: vi.fn(() => host),
  };
  registerWorkflowAgentTraceIpc(deps);

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
function registerRevisionWithFakes(
  options: {
    beforeRevision?: WorkflowRevisionSummary;
    resolvedRevision?: WorkflowRevisionSummary;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowAgentRevisionStore = {
    listWorkflowRevisions: vi.fn(() => [workflowRevision]),
    listWorkflowVersions: vi.fn(() => [workflowVersion]),
    createWorkflowRevision: vi.fn(() => workflowRevision),
    getWorkflowRevision: vi.fn(() => options.beforeRevision ?? workflowRevision),
    updateWorkflowRevision: vi.fn(() => workflowRevision),
    resolveWorkflowRevision: vi.fn(() => options.resolvedRevision ?? appliedWorkflowRevision),
  };
  const host: FakeWorkflowAgentRevisionHost = {
    store,
    workspacePath: "/workspace",
  };
  const deps: RegisterWorkflowAgentRevisionIpcDependencies<FakeWorkflowAgentRevisionStore, FakeWorkflowAgentRevisionHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowThread: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowVersion: vi.fn(() => host),
    requireProjectRuntimeHostForWorkflowRevision: vi.fn(() => host),
    restoreWorkflowVersion: vi.fn(() => Promise.resolve(workflowDashboard)),
    emitWorkflowUpdated: vi.fn(),
    recordWorkflowRevisionDecisionInChat: vi.fn(),
  };
  registerWorkflowAgentRevisionIpc(deps);

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
