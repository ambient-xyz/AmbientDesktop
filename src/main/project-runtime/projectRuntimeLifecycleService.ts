export interface ProjectRuntimeLifecycleThread {
  workspacePath: string;
}

export interface ProjectRuntimeLifecycleBoard {
  runs: Array<{ workspacePath: string }>;
  tasks: Array<{ workspacePath?: string }>;
}

export interface ProjectRuntimeLifecycleStore {
  close(): void;
  getProjectArtifactWorkspacePath(): string;
  listOrchestrationBoard(): ProjectRuntimeLifecycleBoard;
  listThreads(): ProjectRuntimeLifecycleThread[];
}

export interface ProjectRuntimeLifecycleHost<Store extends ProjectRuntimeLifecycleStore = ProjectRuntimeLifecycleStore> {
  workspacePath: string;
  store: Store;
  runtime: {
    interruptActiveRuns(reason: string): unknown;
    resetSessions(): unknown;
  };
  terminals: {
    stopAll(): unknown;
  };
  browserService: {
    shutdown(): Promise<unknown>;
  };
  disposed?: boolean;
}

export interface ProjectRuntimeLifecycleDependencies<Host extends ProjectRuntimeLifecycleHost> {
  defaultRuntimeResetReason: string;
  normalizeWorkspacePath(workspacePath: string): string;
  projectRuntimeHostList(): Host[];
  activeProjectRuntimeHost(): Host | undefined;
  projectRuntimeHostForWorkspacePath(workspacePath: string): Host | undefined;
  removeProjectRuntimeHost(workspacePath: string): void;
  clearProjectRuntimeHosts(): void;
  clearSttRuntimes(): void;
  clearActiveProjectRuntimeHost(): void;
  stopAutoDispatch(reason: string, host: Host): void;
  disposeSttRuntimeForWorkspace(workspacePath: string, reason: string): void;
  releaseAgentMemoryEmbeddingRuntimeForHost(host: Host, reason: string): void;
  shutdownPluginMcpServers(): Promise<unknown> | undefined;
  shutdownPluginMcpServersForWorkspace(workspacePath: string): Promise<unknown>;
  warn(message: string): void;
}

export interface ProjectRuntimeLifecycleService<Host extends ProjectRuntimeLifecycleHost> {
  resetRuntimeAndPluginServers(reason?: string): void;
  workspacePathsForProjectRuntimeHost(host: Host): string[];
  resetProjectRuntimeAndPluginServers(host: Host, reason?: string): void;
  disposeProjectRuntimeHost(workspacePath: string, reason: string): void;
  disposeAllProjectRuntimeHosts(reason: string): void;
}

export function createProjectRuntimeLifecycleService<Host extends ProjectRuntimeLifecycleHost>({
  defaultRuntimeResetReason,
  normalizeWorkspacePath,
  projectRuntimeHostList,
  activeProjectRuntimeHost,
  projectRuntimeHostForWorkspacePath,
  removeProjectRuntimeHost,
  clearProjectRuntimeHosts,
  clearSttRuntimes,
  clearActiveProjectRuntimeHost,
  stopAutoDispatch,
  disposeSttRuntimeForWorkspace,
  releaseAgentMemoryEmbeddingRuntimeForHost,
  shutdownPluginMcpServers,
  shutdownPluginMcpServersForWorkspace,
  warn,
}: ProjectRuntimeLifecycleDependencies<Host>): ProjectRuntimeLifecycleService<Host> {
  function warnAmbientPluginMcpShutdownFailed(error: unknown): void {
    warn(`Ambient plugin MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  function warnProjectBrowserShutdownFailed(error: unknown): void {
    warn(`Project browser shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  function resetRuntimeAndPluginServers(reason = defaultRuntimeResetReason): void {
    for (const host of projectRuntimeHostList()) {
      host.runtime.interruptActiveRuns(reason);
      host.runtime.resetSessions();
    }
    void shutdownPluginMcpServers()?.catch(warnAmbientPluginMcpShutdownFailed);
  }

  function orchestrationBoardWorkspacePaths(board: ProjectRuntimeLifecycleBoard): string[] {
    return [
      ...board.runs.map((run) => run.workspacePath),
      ...board.tasks.map((task) => task.workspacePath).filter((path): path is string => Boolean(path)),
    ];
  }

  function workspacePathsForProjectRuntimeHost(host: Host): string[] {
    const board = host.store.listOrchestrationBoard();
    return [
      ...new Set(
        [
          host.workspacePath,
          host.store.getProjectArtifactWorkspacePath(),
          ...host.store.listThreads().map((thread) => thread.workspacePath),
          ...orchestrationBoardWorkspacePaths(board),
        ].map((workspacePath) => normalizeWorkspacePath(workspacePath)),
      ),
    ];
  }

  function resetProjectRuntimeAndPluginServers(host: Host, reason = defaultRuntimeResetReason): void {
    host.runtime.interruptActiveRuns(reason);
    host.runtime.resetSessions();
    void Promise.all(
      workspacePathsForProjectRuntimeHost(host).map((workspacePath) => shutdownPluginMcpServersForWorkspace(workspacePath)),
    ).catch(warnAmbientPluginMcpShutdownFailed);
  }

  function disposeHost(host: Host, reason: string, sttWorkspacePath: string): void {
    host.disposed = true;
    stopAutoDispatch(reason, host);
    host.terminals.stopAll();
    host.runtime.interruptActiveRuns(reason);
    host.runtime.resetSessions();
    disposeSttRuntimeForWorkspace(sttWorkspacePath, reason);
    releaseAgentMemoryEmbeddingRuntimeForHost(host, reason);
    void host.browserService.shutdown().catch(warnProjectBrowserShutdownFailed);
    host.store.close();
  }

  function disposeProjectRuntimeHost(workspacePath: string, reason: string): void {
    const normalized = normalizeWorkspacePath(workspacePath);
    const host = projectRuntimeHostForWorkspacePath(normalized);
    if (!host) return;
    if (activeProjectRuntimeHost() === host) {
      throw new Error("Cannot dispose the active project runtime host before switching projects.");
    }
    disposeHost(host, reason, normalized);
    removeProjectRuntimeHost(normalized);
  }

  function disposeAllProjectRuntimeHosts(reason: string): void {
    for (const host of projectRuntimeHostList()) {
      disposeHost(host, reason, host.workspacePath);
    }
    clearProjectRuntimeHosts();
    clearSttRuntimes();
    clearActiveProjectRuntimeHost();
  }

  return {
    resetRuntimeAndPluginServers,
    workspacePathsForProjectRuntimeHost,
    resetProjectRuntimeAndPluginServers,
    disposeProjectRuntimeHost,
    disposeAllProjectRuntimeHosts,
  };
}
