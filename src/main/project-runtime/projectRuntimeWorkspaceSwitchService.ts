export interface ProjectRuntimeWorkspaceSwitchThread {
  id: string;
}

export interface ProjectRuntimeWorkspaceSwitchStore {
  getAutomationAutoDispatchEnabled(): boolean;
  getWorkspace(): { path: string };
  listThreads(): ProjectRuntimeWorkspaceSwitchThread[];
}

export interface ProjectRuntimeWorkspaceSwitchAutoDispatchState {
  enabled: boolean;
  lastError?: string;
}

export interface ProjectRuntimeWorkspaceSwitchHost<
  Store extends ProjectRuntimeWorkspaceSwitchStore = ProjectRuntimeWorkspaceSwitchStore,
> {
  store: Store;
  autoDispatch: ProjectRuntimeWorkspaceSwitchAutoDispatchState;
}

export interface ProjectRuntimeWorkspaceSwitchDependencies<
  Host extends ProjectRuntimeWorkspaceSwitchHost,
  State,
> {
  activateProjectRuntimeHost(workspacePath: string): Host;
  clearImportedWorkspaceContextCacheSync(reason: "workspace-switch"): void;
  runWorkflowTraceRetentionSweep(reason: "workspace-switch", host: Host): void;
  scheduleWorkflowTraceRetentionSweep(): void;
  scheduleAutoDispatch(delayMs: number, host: Host): void;
  registerProjectWorkspacePath(workspacePath: string): void;
  initialActiveThreadId(): string;
  setActiveThreadId(threadId: string): string;
  readState(threadId: string): State;
}

export interface ProjectRuntimeWorkspaceSwitchService<State> {
  switchWorkspace(workspacePath: string, requestedThreadId?: string): State;
}

export function createProjectRuntimeWorkspaceSwitchService<
  Host extends ProjectRuntimeWorkspaceSwitchHost,
  State,
>({
  activateProjectRuntimeHost,
  clearImportedWorkspaceContextCacheSync,
  runWorkflowTraceRetentionSweep,
  scheduleWorkflowTraceRetentionSweep,
  scheduleAutoDispatch,
  registerProjectWorkspacePath,
  initialActiveThreadId,
  setActiveThreadId,
  readState,
}: ProjectRuntimeWorkspaceSwitchDependencies<Host, State>): ProjectRuntimeWorkspaceSwitchService<State> {
  function resolveRequestedThreadId(host: Host, requestedThreadId: string | undefined): string {
    const threads = host.store.listThreads();
    return requestedThreadId && threads.some((thread) => thread.id === requestedThreadId)
      ? requestedThreadId
      : initialActiveThreadId();
  }

  function switchWorkspace(workspacePath: string, requestedThreadId?: string): State {
    clearImportedWorkspaceContextCacheSync("workspace-switch");
    const host = activateProjectRuntimeHost(workspacePath);
    clearImportedWorkspaceContextCacheSync("workspace-switch");
    runWorkflowTraceRetentionSweep("workspace-switch", host);
    scheduleWorkflowTraceRetentionSweep();
    host.autoDispatch.enabled = host.store.getAutomationAutoDispatchEnabled();
    host.autoDispatch.lastError = undefined;
    if (host.autoDispatch.enabled) scheduleAutoDispatch(1_000, host);
    registerProjectWorkspacePath(host.store.getWorkspace().path);
    const activeThreadId = setActiveThreadId(resolveRequestedThreadId(host, requestedThreadId));
    return readState(activeThreadId);
  }

  return {
    switchWorkspace,
  };
}
