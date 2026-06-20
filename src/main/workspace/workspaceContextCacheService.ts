export interface WorkspaceContextCacheThread {
  workspacePath: string;
}

export interface WorkspaceContextCacheWorkspace {
  path: string;
}

export interface WorkspaceContextCacheStore<Thread extends WorkspaceContextCacheThread = WorkspaceContextCacheThread> {
  getWorkspaceIfOpen(): WorkspaceContextCacheWorkspace | undefined;
  listThreads(): Thread[];
}

export interface WorkspaceContextCacheHost<Store extends WorkspaceContextCacheStore = WorkspaceContextCacheStore> {
  store: Store;
}

export interface WorkspaceContextCacheServiceDependencies<
  Host extends WorkspaceContextCacheHost<Store>,
  Store extends WorkspaceContextCacheStore,
> {
  projectRuntimeHostList(): Host[];
  activeStore(): Store | undefined;
  clearImportedWorkspaceContext(workspacePath: string): Promise<void>;
  clearImportedWorkspaceContextSync(workspacePath: string): void;
  warn(message: string): void;
}

export interface WorkspaceContextCacheService {
  clearImportedWorkspaceContextCache(reason: string, workspacePaths?: string[]): Promise<void>;
  clearImportedWorkspaceContextCacheSync(reason: string, workspacePaths?: string[]): void;
  knownWorkspaceContextPaths(): string[];
}

export function createWorkspaceContextCacheService<
  Host extends WorkspaceContextCacheHost<Store>,
  Store extends WorkspaceContextCacheStore,
>(
  dependencies: WorkspaceContextCacheServiceDependencies<Host, Store>,
): WorkspaceContextCacheService {
  function knownWorkspaceContextPaths(): string[] {
    const stores = dependencies.projectRuntimeHostList().map((host) => host.store);
    if (stores.length === 0) {
      const activeStore = dependencies.activeStore();
      if (activeStore) stores.push(activeStore);
    }
    return Array.from(
      new Set(
        stores.flatMap((targetStore) => {
          const workspace = targetStore.getWorkspaceIfOpen();
          if (!workspace) return [];
          return [
            workspace.path,
            ...targetStore.listThreads().map((thread) => thread.workspacePath),
          ];
        }),
      ),
    );
  }

  async function clearImportedWorkspaceContextCache(
    reason: string,
    workspacePaths = knownWorkspaceContextPaths(),
  ): Promise<void> {
    await Promise.all(
      workspacePaths.map(async (workspacePath) => {
        try {
          await dependencies.clearImportedWorkspaceContext(workspacePath);
        } catch (error) {
          dependencies.warn(`Failed to clear imported workspace context on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
    );
  }

  function clearImportedWorkspaceContextCacheSync(
    reason: string,
    workspacePaths = knownWorkspaceContextPaths(),
  ): void {
    for (const workspacePath of workspacePaths) {
      try {
        dependencies.clearImportedWorkspaceContextSync(workspacePath);
      } catch (error) {
        dependencies.warn(`Failed to clear imported workspace context on ${reason}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return {
    clearImportedWorkspaceContextCache,
    clearImportedWorkspaceContextCacheSync,
    knownWorkspaceContextPaths,
  };
}
