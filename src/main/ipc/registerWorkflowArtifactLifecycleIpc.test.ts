import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  CancelWorkflowRunInput,
  ResolveWorkflowApprovalInput,
  RevalidateWorkflowArtifactInput,
  ReviewWorkflowArtifactInput,
  UpdateWorkflowArtifactSourceInput,
  UpdateWorkflowConnectorGrantInput,
} from "../../shared/workflowTypes";
import type { WorkflowConnectorDescriptor } from "./ipcWorkflowFacade";
import {
  registerWorkflowApprovalIpc,
  registerWorkflowArtifactRevalidationIpc,
  registerWorkflowArtifactReviewIpc,
  registerWorkflowArtifactSourceIpc,
  registerWorkflowCancelRunIpc,
  registerWorkflowConnectorGrantIpc,
  workflowApprovalIpcChannels,
  workflowArtifactRevalidationIpcChannels,
  workflowArtifactReviewIpcChannels,
  workflowArtifactSourceIpcChannels,
  workflowCancelRunIpcChannels,
  workflowConnectorGrantIpcChannels,
  type RegisterWorkflowApprovalIpcDependencies,
  type RegisterWorkflowArtifactRevalidationIpcDependencies,
  type RegisterWorkflowArtifactReviewIpcDependencies,
  type RegisterWorkflowArtifactSourceIpcDependencies,
  type RegisterWorkflowCancelRunIpcDependencies,
  type RegisterWorkflowConnectorGrantIpcDependencies,
} from "./registerWorkflowIpc";
import {
  workflowConnectorDescriptors,
  workflowDashboard,
  workflowRunDetail,
  type FakeWorkflowApprovalHost,
  type FakeWorkflowApprovalStore,
  type FakeWorkflowArtifactRevalidationHost,
  type FakeWorkflowArtifactRevalidationStore,
  type FakeWorkflowArtifactReviewHost,
  type FakeWorkflowArtifactReviewStore,
  type FakeWorkflowArtifactSourceHost,
  type FakeWorkflowArtifactSourceStore,
  type FakeWorkflowCancelRunHost,
  type FakeWorkflowCancelRunStore,
  type FakeWorkflowConnectorGrantHost,
  type FakeWorkflowConnectorGrantStore,
  type FakeWorkflowRunAbortController,
} from "./registerWorkflowExecutionIpcTestSupport";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerWorkflowApprovalIpc", () => {
  it("registers the workflow approval channels", () => {
    const { handlers } = registerApprovalWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowApprovalIpcChannels]);
  });

  it("resolves approvals through the run owner host and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerApprovalWithFakes();

    await expect(
      invoke("workflow:resolve-approval", {
        runId: "run-1",
        approvalId: "approval-1",
        decision: "approved",
      }),
    ).resolves.toBe(workflowRunDetail);

    expect(deps.requireProjectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.resolveWorkflowApproval).toHaveBeenCalledWith(store, {
      runId: "run-1",
      approvalId: "approval-1",
      decision: "approved",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid approval input before resolving hosts", async () => {
    const { deps, invoke } = registerApprovalWithFakes();

    await expect(
      invoke("workflow:resolve-approval", {
        runId: "",
        approvalId: "approval-1",
        decision: "approved",
      }),
    ).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowRun).not.toHaveBeenCalled();
    expect(deps.resolveWorkflowApproval).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowCancelRunIpc", () => {
  it("registers the workflow cancel-run channels", () => {
    const { handlers } = registerCancelRunWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowCancelRunIpcChannels]);
  });

  it("aborts active workflow runs and emits workflow updates", async () => {
    const { controller, deps, host, invoke, store } = registerCancelRunWithFakes();

    await expect(invoke("workflow:cancel-run", { runId: "run-1" })).resolves.toBe(workflowDashboard);

    expect(deps.projectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.activeWorkflowRunHost).not.toHaveBeenCalled();
    expect(deps.activeWorkflowRunController).toHaveBeenCalledWith("run-1");
    expect(controller?.abort).toHaveBeenCalledOnce();
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
    expect(deps.readWorkflowDashboard).toHaveBeenCalledWith(store);
  });

  it("returns the dashboard without emitting when no active controller is available", async () => {
    const { deps, invoke, store } = registerCancelRunWithFakes({ controller: null });

    await expect(invoke("workflow:cancel-run", { runId: "run-1" })).resolves.toBe(workflowDashboard);

    expect(deps.activeWorkflowRunController).toHaveBeenCalledWith("run-1");
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
    expect(deps.readWorkflowDashboard).toHaveBeenCalledWith(store);
  });

  it("falls back to the active run host when the project run host is unavailable", async () => {
    const { deps, host, invoke } = registerCancelRunWithFakes({ projectHost: null });

    await expect(invoke("workflow:cancel-run", { runId: "run-1" })).resolves.toBe(workflowDashboard);

    expect(deps.projectRuntimeHostForWorkflowRun).toHaveBeenCalledWith("run-1");
    expect(deps.activeWorkflowRunHost).toHaveBeenCalledWith("run-1");
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid cancel input before resolving hosts", async () => {
    const { deps, invoke } = registerCancelRunWithFakes();

    await expect(invoke("workflow:cancel-run", { runId: "" })).rejects.toThrow();

    expect(deps.projectRuntimeHostForWorkflowRun).not.toHaveBeenCalled();
    expect(deps.activeWorkflowRunHost).not.toHaveBeenCalled();
    expect(deps.activeWorkflowRunController).not.toHaveBeenCalled();
    expect(deps.readWorkflowDashboard).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowArtifactReviewIpc", () => {
  it("registers the workflow artifact review channels", () => {
    const { handlers } = registerArtifactReviewWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowArtifactReviewIpcChannels]);
  });

  it("reviews artifacts through the artifact owner host and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerArtifactReviewWithFakes();

    await expect(
      invoke("workflow:review-artifact", {
        artifactId: "artifact-1",
        decision: "approved",
      }),
    ).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.reviewWorkflowArtifact).toHaveBeenCalledWith(store, {
      artifactId: "artifact-1",
      decision: "approved",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid review input before resolving hosts", async () => {
    const { deps, invoke } = registerArtifactReviewWithFakes();

    await expect(
      invoke("workflow:review-artifact", {
        artifactId: "",
        decision: "approved",
      }),
    ).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.reviewWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowConnectorGrantIpc", () => {
  it("registers the workflow connector grant channels", () => {
    const { handlers } = registerConnectorGrantWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowConnectorGrantIpcChannels]);
  });

  it("updates connector grants through the artifact owner host and emits workflow updates", async () => {
    const { deps, host, invoke, store } = registerConnectorGrantWithFakes();

    await expect(
      invoke("workflow:update-connector-grant", {
        artifactId: "artifact-1",
        connectorId: "gmail",
        accountId: "account-1",
        dataRetention: "redacted_audit",
      }),
    ).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.updateWorkflowConnectorGrant).toHaveBeenCalledWith(store, {
      artifactId: "artifact-1",
      connectorId: "gmail",
      accountId: "account-1",
      dataRetention: "redacted_audit",
    });
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid connector grant input before resolving hosts", async () => {
    const { deps, invoke } = registerConnectorGrantWithFakes();

    await expect(
      invoke("workflow:update-connector-grant", {
        artifactId: "artifact-1",
        connectorId: "gmail",
      }),
    ).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.updateWorkflowConnectorGrant).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowArtifactRevalidationIpc", () => {
  it("registers the workflow artifact revalidation channels", () => {
    const { handlers } = registerArtifactRevalidationWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowArtifactRevalidationIpcChannels]);
  });

  it("revalidates artifacts through the artifact owner host and connector descriptors", async () => {
    const { deps, host, invoke, store } = registerArtifactRevalidationWithFakes();

    await expect(invoke("workflow:revalidate-artifact", { artifactId: "artifact-1" })).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.revalidateWorkflowArtifact).toHaveBeenCalledWith(
      store,
      { artifactId: "artifact-1" },
      {
        connectorDescriptors: workflowConnectorDescriptors,
      },
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid revalidation input before resolving hosts", async () => {
    const { deps, invoke } = registerArtifactRevalidationWithFakes();

    await expect(invoke("workflow:revalidate-artifact", { artifactId: "" })).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.connectorDescriptors).not.toHaveBeenCalled();
    expect(deps.revalidateWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

describe("registerWorkflowArtifactSourceIpc", () => {
  it("registers the workflow artifact source channels", () => {
    const { handlers } = registerArtifactSourceWithFakes();

    expect([...handlers.keys()]).toEqual([...workflowArtifactSourceIpcChannels]);
  });

  it("updates artifact source through the artifact owner host and connector descriptors", async () => {
    const { deps, host, invoke, store } = registerArtifactSourceWithFakes();

    await expect(
      invoke("workflow:update-artifact-source", {
        artifactId: "artifact-1",
        source: "steps:\n  - inspect workspace",
      }),
    ).resolves.toBe(workflowDashboard);

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).toHaveBeenCalledWith("artifact-1");
    expect(deps.connectorDescriptors).toHaveBeenCalledOnce();
    expect(deps.updateWorkflowArtifactSource).toHaveBeenCalledWith(
      store,
      {
        artifactId: "artifact-1",
        source: "steps:\n  - inspect workspace",
      },
      {
        connectorDescriptors: workflowConnectorDescriptors,
      },
    );
    expect(deps.emitWorkflowUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("rejects invalid source input before resolving hosts", async () => {
    const { deps, invoke } = registerArtifactSourceWithFakes();

    await expect(
      invoke("workflow:update-artifact-source", {
        artifactId: "artifact-1",
        source: "",
      }),
    ).rejects.toThrow();

    expect(deps.requireProjectRuntimeHostForWorkflowArtifact).not.toHaveBeenCalled();
    expect(deps.connectorDescriptors).not.toHaveBeenCalled();
    expect(deps.updateWorkflowArtifactSource).not.toHaveBeenCalled();
    expect(deps.emitWorkflowUpdated).not.toHaveBeenCalled();
  });
});

function registerApprovalWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowApprovalStore = {
    marker: "workflow-approval-store",
  };
  const host: FakeWorkflowApprovalHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowApprovalIpcDependencies<FakeWorkflowApprovalStore, FakeWorkflowApprovalHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowRun: vi.fn(() => host),
    resolveWorkflowApproval: vi.fn((_store: FakeWorkflowApprovalStore, _input: ResolveWorkflowApprovalInput) => workflowRunDetail),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowApprovalIpc(deps);

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

function registerCancelRunWithFakes(
  options: {
    projectHost?: FakeWorkflowCancelRunHost | null;
    activeHost?: FakeWorkflowCancelRunHost | null;
    controller?: FakeWorkflowRunAbortController | null;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowCancelRunStore = {
    marker: "workflow-cancel-run-store",
  };
  const host: FakeWorkflowCancelRunHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const projectHost = options.projectHost === undefined ? host : options.projectHost;
  const activeHost = options.activeHost === undefined ? host : options.activeHost;
  const controller = options.controller === undefined ? { abort: vi.fn() } : options.controller;
  const deps: RegisterWorkflowCancelRunIpcDependencies<FakeWorkflowCancelRunStore, FakeWorkflowCancelRunHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    projectRuntimeHostForWorkflowRun: vi.fn((_runId: string) => projectHost ?? undefined),
    activeWorkflowRunHost: vi.fn((_runId: string) => activeHost ?? undefined),
    activeWorkflowRunController: vi.fn((_runId: string) => controller ?? undefined),
    readWorkflowDashboard: vi.fn((_store: FakeWorkflowCancelRunStore) => workflowDashboard),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowCancelRunIpc(deps);

  return {
    controller,
    deps,
    handlers,
    host,
    store,
    invoke: (channel: string, raw?: CancelWorkflowRunInput | unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerArtifactReviewWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowArtifactReviewStore = {
    marker: "workflow-artifact-review-store",
  };
  const host: FakeWorkflowArtifactReviewHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowArtifactReviewIpcDependencies<FakeWorkflowArtifactReviewStore, FakeWorkflowArtifactReviewHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    reviewWorkflowArtifact: vi.fn((_store: FakeWorkflowArtifactReviewStore, _input: ReviewWorkflowArtifactInput) => workflowDashboard),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowArtifactReviewIpc(deps);

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

function registerConnectorGrantWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowConnectorGrantStore = {
    marker: "workflow-connector-grant-store",
  };
  const host: FakeWorkflowConnectorGrantHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowConnectorGrantIpcDependencies<FakeWorkflowConnectorGrantStore, FakeWorkflowConnectorGrantHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    updateWorkflowConnectorGrant: vi.fn(
      (_store: FakeWorkflowConnectorGrantStore, _input: UpdateWorkflowConnectorGrantInput) => workflowDashboard,
    ),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowConnectorGrantIpc(deps);

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

function registerArtifactRevalidationWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowArtifactRevalidationStore = {
    marker: "workflow-artifact-revalidation-store",
  };
  const host: FakeWorkflowArtifactRevalidationHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowArtifactRevalidationIpcDependencies<
    FakeWorkflowArtifactRevalidationStore,
    FakeWorkflowArtifactRevalidationHost
  > = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    revalidateWorkflowArtifact: vi.fn(
      (
        _store: FakeWorkflowArtifactRevalidationStore,
        _input: RevalidateWorkflowArtifactInput,
        _options: { connectorDescriptors: WorkflowConnectorDescriptor[] },
      ) => workflowDashboard,
    ),
    connectorDescriptors: vi.fn(() => workflowConnectorDescriptors),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowArtifactRevalidationIpc(deps);

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

function registerArtifactSourceWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const store: FakeWorkflowArtifactSourceStore = {
    marker: "workflow-artifact-source-store",
  };
  const host: FakeWorkflowArtifactSourceHost = {
    store,
    workspacePath: "/runtime-workspace",
  };
  const deps: RegisterWorkflowArtifactSourceIpcDependencies<FakeWorkflowArtifactSourceStore, FakeWorkflowArtifactSourceHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForWorkflowArtifact: vi.fn(() => host),
    updateWorkflowArtifactSource: vi.fn(
      (
        _store: FakeWorkflowArtifactSourceStore,
        _input: UpdateWorkflowArtifactSourceInput,
        _options: { connectorDescriptors: WorkflowConnectorDescriptor[] },
      ) => workflowDashboard,
    ),
    connectorDescriptors: vi.fn(() => workflowConnectorDescriptors),
    emitWorkflowUpdated: vi.fn(),
  };
  registerWorkflowArtifactSourceIpc(deps);

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
