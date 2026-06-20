export interface ProjectRuntimeThreadActionInput {
  threadId: string;
  projectId?: string;
}

export interface ProjectRuntimeThreadActionStore {
  getThread(threadId: string): unknown;
}

export interface ProjectRuntimeThreadActionHost<Store extends ProjectRuntimeThreadActionStore = ProjectRuntimeThreadActionStore> {
  workspacePath: string;
  store: Store;
}

export interface ProjectRuntimeThreadActionHostServiceDependencies<Host extends ProjectRuntimeThreadActionHost> {
  normalizeWorkspacePath(workspacePath: string): string;
  projectRuntimeHostForThread(threadId: string): Host | undefined;
  ensureProjectRuntimeHostForWorkspacePath(workspacePath: string): Host;
  resolveRegisteredProjectPathForHost(projectId: string, fallbackHost: Host): string;
  requireActiveProjectRuntimeHost(): Host;
}

export interface ProjectRuntimeThreadActionHostService<Host extends ProjectRuntimeThreadActionHost> {
  threadActionWorkspacePath(input: ProjectRuntimeThreadActionInput, fallbackHost: Host): string;
  requireProjectRuntimeHostForThreadAction(input: ProjectRuntimeThreadActionInput, fallbackHost?: Host): Host;
}

export function createProjectRuntimeThreadActionHostService<Host extends ProjectRuntimeThreadActionHost>({
  normalizeWorkspacePath,
  projectRuntimeHostForThread,
  ensureProjectRuntimeHostForWorkspacePath,
  resolveRegisteredProjectPathForHost,
  requireActiveProjectRuntimeHost,
}: ProjectRuntimeThreadActionHostServiceDependencies<Host>): ProjectRuntimeThreadActionHostService<Host> {
  function threadActionWorkspacePath(input: ProjectRuntimeThreadActionInput, fallbackHost: Host): string {
    if (!input.projectId) return fallbackHost.workspacePath;
    return normalizeWorkspacePath(resolveRegisteredProjectPathForHost(input.projectId, fallbackHost));
  }

  function requireProjectRuntimeHostForThreadAction(
    input: ProjectRuntimeThreadActionInput,
    fallbackHost = requireActiveProjectRuntimeHost(),
  ): Host {
    const host = projectRuntimeHostForThread(input.threadId) ??
      ensureProjectRuntimeHostForWorkspacePath(threadActionWorkspacePath(input, fallbackHost));
    host.store.getThread(input.threadId);
    return host;
  }

  return {
    threadActionWorkspacePath,
    requireProjectRuntimeHostForThreadAction,
  };
}
