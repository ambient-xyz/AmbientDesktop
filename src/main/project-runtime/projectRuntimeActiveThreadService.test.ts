import { describe, expect, it, vi } from "vitest";
import {
  createProjectRuntimeActiveThreadService,
  type ProjectRuntimeActiveThreadHost,
  type ProjectRuntimeActiveThreadStore,
} from "./projectRuntimeActiveThreadService";

interface FakeThread {
  id: string;
  workspacePath: string;
}

interface FakeStore extends ProjectRuntimeActiveThreadStore<FakeThread> {
  lastActiveThreadId: string | undefined;
  threads: Map<string, FakeThread>;
}

type FakeHost = ProjectRuntimeActiveThreadHost<FakeStore>;

function createStore(threads: FakeThread[]): FakeStore {
  const store: FakeStore = {
    lastActiveThreadId: undefined,
    threads: new Map(threads.map((thread) => [thread.id, thread])),
    getThread(threadId) {
      const thread = store.threads.get(threadId);
      if (!thread) throw new Error(`Unknown thread ${threadId}`);
      return thread;
    },
    setLastActiveThreadId(threadId) {
      store.lastActiveThreadId = threadId;
    },
  };
  return store;
}

function createFixture() {
  const activeStore = createStore([
    { id: "thread-1", workspacePath: "/workspace/main" },
    { id: "thread-2", workspacePath: "/workspace/worktree" },
  ]);
  const inactiveStore = createStore([
    { id: "other-1", workspacePath: "/workspace/other" },
    { id: "other-fallback", workspacePath: "/workspace/other-fallback" },
  ]);
  const activeHost: FakeHost = { activeThreadId: "thread-1", store: activeStore };
  const inactiveHost: FakeHost = { activeThreadId: "other-1", store: inactiveStore };
  let currentActiveHost: FakeHost | undefined = activeHost;
  let currentActiveStore = activeStore;
  let activeThreadId = "thread-1";
  const setActiveThreadIdState = vi.fn((threadId: string) => {
    activeThreadId = threadId;
  });
  const service = createProjectRuntimeActiveThreadService({
    activeHost: () => currentActiveHost,
    activeStore: () => currentActiveStore,
    getActiveThreadId: () => activeThreadId,
    initialActiveThreadIdForStore: (store) =>
      store === inactiveStore ? "other-fallback" : "thread-1",
    setActiveThreadIdState,
  });

  return {
    activeHost,
    activeStore,
    get activeThreadId() {
      return activeThreadId;
    },
    inactiveHost,
    inactiveStore,
    service,
    setActiveHost(host: FakeHost | undefined) {
      currentActiveHost = host;
    },
    setActiveStore(store: FakeStore) {
      currentActiveStore = store;
    },
    setActiveThreadIdState,
  };
}

describe("project runtime active thread service", () => {
  it("sets the active thread on the active host and store", () => {
    const fixture = createFixture();

    expect(fixture.service.setActiveThreadId("thread-2")).toBe("thread-2");

    expect(fixture.activeThreadId).toBe("thread-2");
    expect(fixture.activeHost.activeThreadId).toBe("thread-2");
    expect(fixture.activeStore.lastActiveThreadId).toBe("thread-2");
    expect(fixture.setActiveThreadIdState).toHaveBeenCalledWith("thread-2");
  });

  it("updates an inactive host without changing the active global thread", () => {
    const fixture = createFixture();

    expect(fixture.service.setProjectHostActiveThreadId(fixture.inactiveHost, "other-fallback")).toBe("other-fallback");

    expect(fixture.activeThreadId).toBe("thread-1");
    expect(fixture.inactiveHost.activeThreadId).toBe("other-fallback");
    expect(fixture.inactiveStore.lastActiveThreadId).toBe("other-fallback");
    expect(fixture.setActiveThreadIdState).not.toHaveBeenCalled();
  });

  it("mirrors project-host thread changes into global state for the active host", () => {
    const fixture = createFixture();

    fixture.service.setProjectHostActiveThreadId(fixture.activeHost, "thread-2");

    expect(fixture.activeThreadId).toBe("thread-2");
    expect(fixture.activeHost.activeThreadId).toBe("thread-2");
    expect(fixture.activeStore.lastActiveThreadId).toBe("thread-2");
  });

  it("falls back to the initial thread when a host points at a removed thread", () => {
    const fixture = createFixture();
    fixture.inactiveHost.activeThreadId = "missing-thread";

    expect(fixture.service.activeThreadIdForHost(fixture.inactiveHost)).toBe("other-fallback");

    expect(fixture.inactiveHost.activeThreadId).toBe("other-fallback");
    expect(fixture.inactiveStore.lastActiveThreadId).toBe("other-fallback");
  });

  it("reads active workspace path and initial thread from current active store", () => {
    const fixture = createFixture();

    expect(fixture.service.activeWorkspacePath()).toBe("/workspace/main");
    expect(fixture.service.initialActiveThreadId()).toBe("thread-1");

    fixture.setActiveStore(fixture.inactiveStore);
    fixture.setActiveHost(fixture.inactiveHost);
    fixture.service.setProjectHostActiveThreadId(fixture.inactiveHost, "other-fallback");

    expect(fixture.service.activeWorkspacePath()).toBe("/workspace/other-fallback");
    expect(fixture.service.initialActiveThreadId()).toBe("other-fallback");
  });
});
