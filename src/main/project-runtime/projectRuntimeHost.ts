export interface ProjectRuntimeHost<
  Store = unknown,
  InternalBrowserHost = unknown,
  BrowserService = unknown,
  BrowserCredentialStore = unknown,
  Runtime = unknown,
  Terminals = unknown,
  AutoDispatch = unknown,
> {
  workspacePath: string;
  store: Store;
  internalBrowserHost: InternalBrowserHost;
  browserService: BrowserService;
  browserCredentialStore: BrowserCredentialStore;
  runtime: Runtime;
  terminals: Terminals;
  activeThreadId: string;
  autoDispatch: AutoDispatch;
  agentMemoryEmbeddingRuntimeLeaseId?: string;
  agentMemoryEmbeddingRuntimeRelease?: () => Promise<void>;
  disposed?: boolean;
}
