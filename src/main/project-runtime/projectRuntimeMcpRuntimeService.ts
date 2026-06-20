import type { PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";

export interface ProjectRuntimeMcpRuntime {
  pluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[];
  restartPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined>;
  stopPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined>;
}

export interface ProjectRuntimeMcpRuntimeHost {
  runtime: ProjectRuntimeMcpRuntime;
}

export interface ProjectRuntimeMcpRuntimeServiceDependencies<Host extends ProjectRuntimeMcpRuntimeHost> {
  pluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[];
  projectRuntimeHosts(): readonly Host[];
}

export interface ProjectRuntimeMcpRuntimeService {
  projectRuntimeMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[];
  allPluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[];
  restartProjectRuntimeMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined>;
  stopProjectRuntimeMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined>;
}

export function createProjectRuntimeMcpRuntimeService<Host extends ProjectRuntimeMcpRuntimeHost>(
  dependencies: ProjectRuntimeMcpRuntimeServiceDependencies<Host>,
): ProjectRuntimeMcpRuntimeService {
  function projectRuntimeMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
    return dependencies.projectRuntimeHosts().flatMap((host) => host.runtime.pluginMcpRuntimeSnapshots());
  }

  function allPluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
    return [...dependencies.pluginMcpRuntimeSnapshots(), ...projectRuntimeMcpRuntimeSnapshots()];
  }

  async function restartProjectRuntimeMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    for (const host of dependencies.projectRuntimeHosts()) {
      const snapshots = await host.runtime.restartPluginMcpRuntime(key);
      if (snapshots) return allPluginMcpRuntimeSnapshots();
    }
    return undefined;
  }

  async function stopProjectRuntimeMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    for (const host of dependencies.projectRuntimeHosts()) {
      const snapshots = await host.runtime.stopPluginMcpRuntime(key);
      if (snapshots) return allPluginMcpRuntimeSnapshots();
    }
    return undefined;
  }

  return {
    allPluginMcpRuntimeSnapshots,
    projectRuntimeMcpRuntimeSnapshots,
    restartProjectRuntimeMcpRuntime,
    stopProjectRuntimeMcpRuntime,
  };
}
