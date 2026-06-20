import { describe, expect, it, vi } from "vitest";
import {
  createProjectRuntimeHostFactory,
  type ProjectRuntimeHostFactoryHost,
  type ProjectRuntimeHostFactoryStore,
  type ProjectRuntimeHostFactoryWorkspace,
} from "./projectRuntimeHostFactory";

interface FakeWorkspace extends ProjectRuntimeHostFactoryWorkspace {
  statePath: string;
}

interface FakeStore extends ProjectRuntimeHostFactoryStore<FakeWorkspace> {
  workspace?: FakeWorkspace;
  autoDispatchEnabled: boolean;
}

interface FakeHost extends ProjectRuntimeHostFactoryHost {
  workspacePath: string;
  store: FakeStore;
  internalBrowserHost: { store: FakeStore };
  browserService: { store: FakeStore; emitStateChanged(): void };
  browserCredentialStore: { store: FakeStore };
  runtime: { activeThreadId: () => string };
  terminals: { workspacePath: string };
  autoDispatch: { enabled: boolean };
}

function createStore(): FakeStore {
  const store = {
    autoDispatchEnabled: true,
    openWorkspace: undefined as never,
    getAutomationAutoDispatchEnabled() {
      return this.autoDispatchEnabled;
    },
  } as FakeStore;
  store.openWorkspace = vi.fn((workspacePath: string): FakeWorkspace => {
    const workspace = { path: workspacePath, statePath: `${workspacePath}/.ambient` };
    store.workspace = workspace;
    return workspace;
  });
  return store;
}

function createHarness() {
  const stores: FakeStore[] = [];
  const createProjectStore = vi.fn(() => {
    const store = createStore();
    stores.push(store);
    return store;
  });
  const createInternalBrowserHost = vi.fn((store: FakeStore) => ({ store }));
  const onBrowserServiceStateChanged = vi.fn();
  const createBrowserService = vi.fn((
    store: FakeStore,
    _internalBrowserHost: { store: FakeStore },
    onStateChanged: () => void,
  ) => ({
    store,
    emitStateChanged: onStateChanged,
  }));
  const createBrowserCredentialStore = vi.fn((store: FakeStore) => ({ store }));
  const createTerminalService = vi.fn((workspacePath: string) => ({ workspacePath }));
  const initialActiveThreadIdForStore = vi.fn(() => "initial-thread");
  const createRuntime = vi.fn((input: { activeThreadId: () => string }) => ({
    activeThreadId: input.activeThreadId,
  }));
  const createAutoDispatchState = vi.fn((enabled: boolean) => ({ enabled }));
  const createHost = vi.fn((input: {
    workspace: FakeWorkspace;
    store: FakeStore;
    internalBrowserHost: { store: FakeStore };
    browserService: { store: FakeStore; emitStateChanged(): void };
    browserCredentialStore: { store: FakeStore };
    runtime: { activeThreadId: () => string };
    terminals: { workspacePath: string };
    activeThreadId: string;
    autoDispatch: { enabled: boolean };
  }): FakeHost => ({
    workspacePath: input.workspace.path,
    store: input.store,
    internalBrowserHost: input.internalBrowserHost,
    browserService: input.browserService,
    browserCredentialStore: input.browserCredentialStore,
    runtime: input.runtime,
    terminals: input.terminals,
    activeThreadId: input.activeThreadId,
    autoDispatch: input.autoDispatch,
  }));
  const factory = createProjectRuntimeHostFactory<
    FakeWorkspace,
    FakeStore,
    { store: FakeStore },
    { store: FakeStore; emitStateChanged(): void },
    { store: FakeStore },
    { activeThreadId: () => string },
    { workspacePath: string },
    { enabled: boolean },
    FakeHost
  >({
    createProjectStore,
    createInternalBrowserHost,
    createBrowserService,
    onBrowserServiceStateChanged,
    createBrowserCredentialStore,
    createTerminalService,
    initialActiveThreadIdForStore,
    createRuntime,
    createAutoDispatchState,
    createHost,
  });

  return {
    createAutoDispatchState,
    createBrowserService,
    createHost,
    createProjectStore,
    createRuntime,
    createTerminalService,
    factory,
    initialActiveThreadIdForStore,
    onBrowserServiceStateChanged,
    stores,
  };
}

describe("createProjectRuntimeHostFactory", () => {
  it("creates a runtime host with default recovery options and active-thread fallback", () => {
    const {
      createAutoDispatchState,
      createBrowserService,
      createHost,
      createProjectStore,
      createRuntime,
      createTerminalService,
      factory,
      initialActiveThreadIdForStore,
      stores,
    } = createHarness();

    const host = factory.createProjectRuntimeHost("/workspace/project");

    expect(createProjectStore).toHaveBeenCalledTimes(1);
    expect(stores[0].openWorkspace).toHaveBeenCalledWith("/workspace/project", {
      recoverActiveRuns: true,
      recoverOrchestrationRuns: true,
    });
    expect(createBrowserService).toHaveBeenCalledTimes(1);
    expect(createTerminalService).toHaveBeenCalledWith("/workspace/project");
    expect(initialActiveThreadIdForStore).toHaveBeenCalledWith(stores[0]);
    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(createAutoDispatchState).toHaveBeenCalledWith(true);
    expect(createHost).toHaveBeenCalledTimes(1);
    expect(host.workspacePath).toBe("/workspace/project");
    expect(host.activeThreadId).toBe("initial-thread");
    expect(host.runtime.activeThreadId()).toBe("initial-thread");

    host.activeThreadId = "changed-thread";
    expect(host.runtime.activeThreadId()).toBe("changed-thread");
  });

  it("preserves explicit recovery options", () => {
    const { factory, stores } = createHarness();

    factory.createProjectRuntimeHost("/workspace/project", {
      recoverActiveRuns: false,
      recoverOrchestrationRuns: false,
    });

    expect(stores[0].openWorkspace).toHaveBeenCalledWith("/workspace/project", {
      recoverActiveRuns: false,
      recoverOrchestrationRuns: false,
    });
  });

  it("forwards browser service state changes to the supplied active-browser hook", () => {
    const { factory, onBrowserServiceStateChanged } = createHarness();

    const host = factory.createProjectRuntimeHost("/workspace/project");
    host.browserService.emitStateChanged();

    expect(onBrowserServiceStateChanged).toHaveBeenCalledWith(host.browserService);
  });
});
