export interface ProjectRuntimeActiveThread {
  workspacePath: string;
}

export interface ProjectRuntimeActiveThreadStore<Thread extends ProjectRuntimeActiveThread = ProjectRuntimeActiveThread> {
  getThread(threadId: string): Thread;
  setLastActiveThreadId(threadId: string): void;
}

export interface ProjectRuntimeActiveThreadHost<
  Store extends ProjectRuntimeActiveThreadStore = ProjectRuntimeActiveThreadStore,
> {
  activeThreadId: string;
  store: Store;
}

export interface ProjectRuntimeActiveThreadServiceDependencies<
  Store extends ProjectRuntimeActiveThreadStore,
  Host extends ProjectRuntimeActiveThreadHost<Store>,
> {
  activeHost(): Host | undefined;
  activeStore(): Store;
  getActiveThreadId(): string;
  initialActiveThreadIdForStore(store: Store): string;
  setActiveThreadIdState(threadId: string): void;
}

export interface ProjectRuntimeActiveThreadService<
  Store extends ProjectRuntimeActiveThreadStore,
  Host extends ProjectRuntimeActiveThreadHost<Store>,
> {
  activeThreadIdForHost(host: Host): string;
  activeWorkspacePath(): string;
  initialActiveThreadId(): string;
  setActiveThreadId(threadId: string): string;
  setProjectHostActiveThreadId(host: Host, threadId: string): string;
}

export function createProjectRuntimeActiveThreadService<
  Store extends ProjectRuntimeActiveThreadStore,
  Host extends ProjectRuntimeActiveThreadHost<Store>,
>(
  dependencies: ProjectRuntimeActiveThreadServiceDependencies<Store, Host>,
): ProjectRuntimeActiveThreadService<Store, Host> {
  function setActiveThreadId(threadId: string): string {
    const activeStore = dependencies.activeStore();
    dependencies.setActiveThreadIdState(threadId);
    const activeHost = dependencies.activeHost();
    if (activeHost?.store === activeStore) activeHost.activeThreadId = threadId;
    activeStore.setLastActiveThreadId(threadId);
    return threadId;
  }

  function setProjectHostActiveThreadId(host: Host, threadId: string): string {
    host.activeThreadId = threadId;
    host.store.setLastActiveThreadId(threadId);
    if (dependencies.activeHost() === host) dependencies.setActiveThreadIdState(threadId);
    return threadId;
  }

  function activeThreadIdForHost(host: Host): string {
    try {
      host.store.getThread(host.activeThreadId);
      return host.activeThreadId;
    } catch {
      return setProjectHostActiveThreadId(host, dependencies.initialActiveThreadIdForStore(host.store));
    }
  }

  function activeWorkspacePath(): string {
    return dependencies.activeStore().getThread(dependencies.getActiveThreadId()).workspacePath;
  }

  function initialActiveThreadId(): string {
    return dependencies.initialActiveThreadIdForStore(dependencies.activeStore());
  }

  return {
    activeThreadIdForHost,
    activeWorkspacePath,
    initialActiveThreadId,
    setActiveThreadId,
    setProjectHostActiveThreadId,
  };
}
