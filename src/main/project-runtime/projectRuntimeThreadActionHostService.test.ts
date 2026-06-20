import { describe, expect, it, vi } from "vitest";
import {
  createProjectRuntimeThreadActionHostService,
  type ProjectRuntimeThreadActionHost,
  type ProjectRuntimeThreadActionStore,
} from "./projectRuntimeThreadActionHostService";

interface FakeStore extends ProjectRuntimeThreadActionStore {
  getThreadMock: ReturnType<typeof vi.fn>;
}

type FakeHost = ProjectRuntimeThreadActionHost<FakeStore> & { id: string };

function createHost(id: string, workspacePath: string): FakeHost {
  const getThreadMock = vi.fn((threadId: string) => ({ id: threadId }));
  return {
    id,
    workspacePath,
    store: {
      getThread: (threadId: string) => getThreadMock(threadId),
      getThreadMock,
    },
  };
}

function createHarness() {
  const activeHost = createHost("active", "/workspace/active");
  const existingThreadHost = createHost("existing", "/workspace/existing");
  const ensuredHost = createHost("ensured", "/workspace/project-normalized");
  const projectRuntimeHostForThread = vi.fn((threadId: string) =>
    threadId === "existing-thread" ? existingThreadHost : undefined,
  );
  const ensureProjectRuntimeHostForWorkspacePath = vi.fn(() => ensuredHost);
  const resolveRegisteredProjectPathForHost = vi.fn(() => "/workspace/project");
  const normalizeWorkspacePath = vi.fn((workspacePath: string) => `${workspacePath}-normalized`);
  const requireActiveProjectRuntimeHost = vi.fn(() => activeHost);
  const service = createProjectRuntimeThreadActionHostService({
    normalizeWorkspacePath,
    projectRuntimeHostForThread,
    ensureProjectRuntimeHostForWorkspacePath,
    resolveRegisteredProjectPathForHost,
    requireActiveProjectRuntimeHost,
  });
  return {
    activeHost,
    ensureProjectRuntimeHostForWorkspacePath,
    ensuredHost,
    existingThreadHost,
    normalizeWorkspacePath,
    projectRuntimeHostForThread,
    requireActiveProjectRuntimeHost,
    resolveRegisteredProjectPathForHost,
    service,
  };
}

describe("project runtime thread action host service", () => {
  it("uses an existing host for the target thread before resolving project fallback", () => {
    const harness = createHarness();

    const host = harness.service.requireProjectRuntimeHostForThreadAction({
      threadId: "existing-thread",
      projectId: "project-1",
    }, harness.activeHost);

    expect(host).toBe(harness.existingThreadHost);
    expect(harness.resolveRegisteredProjectPathForHost).not.toHaveBeenCalled();
    expect(harness.ensureProjectRuntimeHostForWorkspacePath).not.toHaveBeenCalled();
    expect(harness.existingThreadHost.store.getThreadMock).toHaveBeenCalledWith("existing-thread");
  });

  it("resolves project-scoped workspace fallback when the thread host is not registered", () => {
    const harness = createHarness();

    const host = harness.service.requireProjectRuntimeHostForThreadAction({
      threadId: "new-thread",
      projectId: "project-1",
    }, harness.activeHost);

    expect(host).toBe(harness.ensuredHost);
    expect(harness.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("project-1", harness.activeHost);
    expect(harness.normalizeWorkspacePath).toHaveBeenCalledWith("/workspace/project");
    expect(harness.ensureProjectRuntimeHostForWorkspacePath).toHaveBeenCalledWith("/workspace/project-normalized");
    expect(harness.ensuredHost.store.getThreadMock).toHaveBeenCalledWith("new-thread");
  });

  it("falls back to the active host workspace when no project id is provided", () => {
    const harness = createHarness();

    const host = harness.service.requireProjectRuntimeHostForThreadAction({ threadId: "new-thread" });

    expect(host).toBe(harness.ensuredHost);
    expect(harness.requireActiveProjectRuntimeHost).toHaveBeenCalled();
    expect(harness.resolveRegisteredProjectPathForHost).not.toHaveBeenCalled();
    expect(harness.ensureProjectRuntimeHostForWorkspacePath).toHaveBeenCalledWith("/workspace/active");
  });

  it("propagates missing-thread validation errors from the selected host", () => {
    const harness = createHarness();
    harness.ensuredHost.store.getThreadMock.mockImplementation(() => {
      throw new Error("missing thread");
    });

    expect(() =>
      harness.service.requireProjectRuntimeHostForThreadAction({ threadId: "missing-thread" }, harness.activeHost),
    ).toThrow("missing thread");
  });
});
