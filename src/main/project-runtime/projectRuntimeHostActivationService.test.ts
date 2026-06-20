import { describe, expect, it, vi } from "vitest";
import {
  createProjectRuntimeHostActivationService,
  type ProjectRuntimeHostActivationHost,
  type ProjectRuntimeHostActivationStore,
} from "./projectRuntimeHostActivationService";

interface FakeStore extends ProjectRuntimeHostActivationStore {
  workspacePath: string;
}

interface FakeHost extends ProjectRuntimeHostActivationHost<FakeStore> {
  id: string;
}

function createHost(id: string, workspacePath = `/workspace/${id}`): FakeHost {
  return {
    id,
    workspacePath,
    store: {
      workspacePath,
      getWorkspace() {
        return { path: this.workspacePath };
      },
    },
  };
}

function createHarness(input: { hosts?: FakeHost[] } = {}) {
  const createdHosts = [...(input.hosts ?? [])];
  const createProjectRuntimeHost = vi.fn((workspacePath: string) => {
    const host = createHost(`created-${createdHosts.length + 1}`, workspacePath);
    createdHosts.push(host);
    return host;
  });
  const runStartupReconciliation = vi.fn();
  const registerProjectWorkspacePath = vi.fn();
  const onActiveHostChanged = vi.fn();
  const service = createProjectRuntimeHostActivationService<FakeHost>({
    normalizeWorkspacePath: (workspacePath) => workspacePath.toLowerCase(),
    createProjectRuntimeHost,
    runStartupReconciliation,
    registerProjectWorkspacePath,
    onActiveHostChanged,
  });
  return {
    createProjectRuntimeHost,
    createdHosts,
    onActiveHostChanged,
    registerProjectWorkspacePath,
    runStartupReconciliation,
    service,
  };
}

describe("createProjectRuntimeHostActivationService", () => {
  it("creates, registers, and returns a project runtime host on first ensure", () => {
    const {
      createProjectRuntimeHost,
      registerProjectWorkspacePath,
      runStartupReconciliation,
      service,
    } = createHarness();

    const host = service.ensureProjectRuntimeHostForWorkspacePath("/WORKSPACE/PROJECT");

    expect(host.workspacePath).toBe("/workspace/project");
    expect(createProjectRuntimeHost).toHaveBeenCalledWith("/workspace/project");
    expect(runStartupReconciliation).toHaveBeenCalledWith("project-runtime-created", host);
    expect(registerProjectWorkspacePath).toHaveBeenCalledWith("/workspace/project");
    expect(service.projectRuntimeHostForWorkspacePath("/workspace/project")).toBe(host);
    expect(service.projectRuntimeHostList()).toEqual([host]);
  });

  it("reuses existing hosts without rerunning startup reconciliation", () => {
    const { createProjectRuntimeHost, registerProjectWorkspacePath, runStartupReconciliation, service } = createHarness();

    const first = service.ensureProjectRuntimeHostForWorkspacePath("/workspace/project");
    const second = service.ensureProjectRuntimeHostForWorkspacePath("/WORKSPACE/PROJECT");

    expect(second).toBe(first);
    expect(createProjectRuntimeHost).toHaveBeenCalledTimes(1);
    expect(runStartupReconciliation).toHaveBeenCalledTimes(1);
    expect(registerProjectWorkspacePath).toHaveBeenCalledTimes(1);
  });

  it("activates a host and notifies the shell mirror", () => {
    const { onActiveHostChanged, service } = createHarness();

    const host = service.activateProjectRuntimeHost("/workspace/project");

    expect(service.activeProjectRuntimeHost()).toBe(host);
    expect(onActiveHostChanged).toHaveBeenCalledWith(host);
  });

  it("removes hosts by normalized workspace path", () => {
    const { service } = createHarness();
    const host = service.ensureProjectRuntimeHostForWorkspacePath("/workspace/project");

    service.removeProjectRuntimeHost("/WORKSPACE/PROJECT");

    expect(service.projectRuntimeHostForWorkspacePath(host.workspacePath)).toBeUndefined();
    expect(service.projectRuntimeHostList()).toEqual([]);
  });

  it("clears host registries and the active host independently", () => {
    const { onActiveHostChanged, service } = createHarness();
    const host = service.activateProjectRuntimeHost("/workspace/project");

    service.clearProjectRuntimeHosts();
    expect(service.projectRuntimeHostList()).toEqual([]);
    expect(service.activeProjectRuntimeHost()).toBe(host);

    service.clearActiveProjectRuntimeHost();
    expect(service.activeProjectRuntimeHost()).toBeUndefined();
    expect(onActiveHostChanged).toHaveBeenLastCalledWith(undefined);
  });
});
