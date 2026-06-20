import type { ProjectRuntimeHostFactoryOptions } from "./projectRuntimeHostFactory";

export interface ProjectRuntimeHostActivationStore {
  getWorkspace(): { path: string };
}

export interface ProjectRuntimeHostActivationHost<
  Store extends ProjectRuntimeHostActivationStore = ProjectRuntimeHostActivationStore,
> {
  workspacePath: string;
  store: Store;
}

export interface ProjectRuntimeHostActivationDependencies<Host extends ProjectRuntimeHostActivationHost> {
  normalizeWorkspacePath(workspacePath: string): string;
  createProjectRuntimeHost(workspacePath: string, options?: ProjectRuntimeHostFactoryOptions): Host;
  runStartupReconciliation(reason: "project-runtime-created", host: Host): void;
  registerProjectWorkspacePath(workspacePath: string): void;
  onActiveHostChanged(host: Host | undefined): void;
}

export interface ProjectRuntimeHostActivationService<Host extends ProjectRuntimeHostActivationHost> {
  activeProjectRuntimeHost(): Host | undefined;
  activateProjectRuntimeHost(workspacePath: string): Host;
  ensureProjectRuntimeHostForWorkspacePath(workspacePath: string): Host;
  projectRuntimeHostForWorkspacePath(workspacePath: string): Host | undefined;
  projectRuntimeHostList(): Host[];
  removeProjectRuntimeHost(workspacePath: string): void;
  clearProjectRuntimeHosts(): void;
  clearActiveProjectRuntimeHost(): void;
}

export function createProjectRuntimeHostActivationService<Host extends ProjectRuntimeHostActivationHost>({
  normalizeWorkspacePath,
  createProjectRuntimeHost,
  runStartupReconciliation,
  registerProjectWorkspacePath,
  onActiveHostChanged,
}: ProjectRuntimeHostActivationDependencies<Host>): ProjectRuntimeHostActivationService<Host> {
  const projectRuntimeHosts = new Map<string, Host>();
  let activeHost: Host | undefined;

  function projectRuntimeHostList(): Host[] {
    return [...projectRuntimeHosts.values()];
  }

  function projectRuntimeHostForWorkspacePath(workspacePath: string): Host | undefined {
    return projectRuntimeHosts.get(normalizeWorkspacePath(workspacePath));
  }

  function registerProjectRuntimeHost(host: Host): void {
    projectRuntimeHosts.set(normalizeWorkspacePath(host.workspacePath), host);
    runStartupReconciliation("project-runtime-created", host);
    registerProjectWorkspacePath(host.store.getWorkspace().path);
  }

  function ensureProjectRuntimeHostForWorkspacePath(workspacePath: string): Host {
    const normalized = normalizeWorkspacePath(workspacePath);
    let host = projectRuntimeHosts.get(normalized);
    if (!host) {
      host = createProjectRuntimeHost(normalized);
      registerProjectRuntimeHost(host);
    }
    return host;
  }

  function activateProjectRuntimeHost(workspacePath: string): Host {
    const normalized = normalizeWorkspacePath(workspacePath);
    const host = ensureProjectRuntimeHostForWorkspacePath(normalized);
    activeHost = host;
    onActiveHostChanged(host);
    return host;
  }

  function removeProjectRuntimeHost(workspacePath: string): void {
    projectRuntimeHosts.delete(normalizeWorkspacePath(workspacePath));
  }

  function clearProjectRuntimeHosts(): void {
    projectRuntimeHosts.clear();
  }

  function clearActiveProjectRuntimeHost(): void {
    activeHost = undefined;
    onActiveHostChanged(undefined);
  }

  return {
    activeProjectRuntimeHost: () => activeHost,
    activateProjectRuntimeHost,
    ensureProjectRuntimeHostForWorkspacePath,
    projectRuntimeHostForWorkspacePath,
    projectRuntimeHostList,
    removeProjectRuntimeHost,
    clearProjectRuntimeHosts,
    clearActiveProjectRuntimeHost,
  };
}
