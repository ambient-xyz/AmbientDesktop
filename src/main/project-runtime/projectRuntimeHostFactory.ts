export interface ProjectRuntimeHostFactoryOptions {
  recoverActiveRuns?: boolean;
  recoverOrchestrationRuns?: boolean;
}

export interface ProjectRuntimeHostFactoryWorkspace {
  path: string;
}

export interface ProjectRuntimeHostFactoryStore<Workspace extends ProjectRuntimeHostFactoryWorkspace> {
  openWorkspace(
    workspacePath: string,
    options: { recoverActiveRuns: boolean; recoverOrchestrationRuns: boolean },
  ): Workspace;
  getAutomationAutoDispatchEnabled(): boolean;
}

export interface ProjectRuntimeHostFactoryRuntimeInput<Store, BrowserService, BrowserCredentialStore> {
  store: Store;
  browserService: BrowserService;
  browserCredentialStore: BrowserCredentialStore;
  activeThreadId(): string;
}

export interface ProjectRuntimeHostFactoryHostInput<
  Workspace,
  Store,
  InternalBrowserHost,
  BrowserService,
  BrowserCredentialStore,
  Runtime,
  Terminals,
  AutoDispatch,
> {
  workspace: Workspace;
  store: Store;
  internalBrowserHost: InternalBrowserHost;
  browserService: BrowserService;
  browserCredentialStore: BrowserCredentialStore;
  runtime: Runtime;
  terminals: Terminals;
  activeThreadId: string;
  autoDispatch: AutoDispatch;
}

export interface ProjectRuntimeHostFactoryHost {
  activeThreadId: string;
}

export interface ProjectRuntimeHostFactoryDependencies<
  Workspace extends ProjectRuntimeHostFactoryWorkspace,
  Store extends ProjectRuntimeHostFactoryStore<Workspace>,
  InternalBrowserHost,
  BrowserService,
  BrowserCredentialStore,
  Runtime,
  Terminals,
  AutoDispatch,
  Host extends ProjectRuntimeHostFactoryHost,
> {
  createProjectStore(): Store;
  createInternalBrowserHost(store: Store): InternalBrowserHost;
  createBrowserService(
    store: Store,
    internalBrowserHost: InternalBrowserHost,
    onStateChanged: () => void,
  ): BrowserService;
  onBrowserServiceStateChanged(browserService: BrowserService): void;
  createBrowserCredentialStore(store: Store): BrowserCredentialStore;
  createTerminalService(workspacePath: string): Terminals;
  initialActiveThreadIdForStore(store: Store): string;
  createRuntime(input: ProjectRuntimeHostFactoryRuntimeInput<Store, BrowserService, BrowserCredentialStore>): Runtime;
  createAutoDispatchState(enabled: boolean): AutoDispatch;
  createHost(input: ProjectRuntimeHostFactoryHostInput<
    Workspace,
    Store,
    InternalBrowserHost,
    BrowserService,
    BrowserCredentialStore,
    Runtime,
    Terminals,
    AutoDispatch
  >): Host;
}

export interface ProjectRuntimeHostFactory<Host> {
  createProjectRuntimeHost(workspacePath: string, options?: ProjectRuntimeHostFactoryOptions): Host;
}

export function createProjectRuntimeHostFactory<
  Workspace extends ProjectRuntimeHostFactoryWorkspace,
  Store extends ProjectRuntimeHostFactoryStore<Workspace>,
  InternalBrowserHost,
  BrowserService,
  BrowserCredentialStore,
  Runtime,
  Terminals,
  AutoDispatch,
  Host extends ProjectRuntimeHostFactoryHost,
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
}: ProjectRuntimeHostFactoryDependencies<
  Workspace,
  Store,
  InternalBrowserHost,
  BrowserService,
  BrowserCredentialStore,
  Runtime,
  Terminals,
  AutoDispatch,
  Host
>): ProjectRuntimeHostFactory<Host> {
  function createProjectRuntimeHost(
    workspacePath: string,
    options: ProjectRuntimeHostFactoryOptions = {},
  ): Host {
    const store = createProjectStore();
    const workspace = store.openWorkspace(workspacePath, {
      recoverActiveRuns: options.recoverActiveRuns ?? true,
      recoverOrchestrationRuns: options.recoverOrchestrationRuns ?? true,
    });
    const internalBrowserHost = createInternalBrowserHost(store);
    const browserService = createBrowserService(store, internalBrowserHost, () => {
      onBrowserServiceStateChanged(browserService);
    });
    const browserCredentialStore = createBrowserCredentialStore(store);
    const terminals = createTerminalService(workspace.path);
    const hostRef: { current?: Host } = {};
    const initialHostThreadId = initialActiveThreadIdForStore(store);
    const runtime = createRuntime({
      store,
      browserService,
      browserCredentialStore,
      activeThreadId: () => hostRef.current?.activeThreadId ?? initialHostThreadId,
    });
    const host = createHost({
      workspace,
      store,
      internalBrowserHost,
      browserService,
      browserCredentialStore,
      runtime,
      terminals,
      activeThreadId: initialHostThreadId,
      autoDispatch: createAutoDispatchState(store.getAutomationAutoDispatchEnabled()),
    });
    hostRef.current = host;
    return host;
  }

  return {
    createProjectRuntimeHost,
  };
}
