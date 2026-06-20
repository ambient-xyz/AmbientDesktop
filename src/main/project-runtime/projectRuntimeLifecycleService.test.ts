import { describe, expect, it, vi } from "vitest";
import {
  createProjectRuntimeLifecycleService,
  type ProjectRuntimeLifecycleHost,
  type ProjectRuntimeLifecycleStore,
} from "./projectRuntimeLifecycleService";

interface FakeStore extends ProjectRuntimeLifecycleStore {
  artifactWorkspacePath: string;
  board: {
    runs: Array<{ workspacePath: string }>;
    tasks: Array<{ workspacePath?: string }>;
  };
  threads: Array<{ workspacePath: string }>;
  close: () => void;
}

type FakeHost = ProjectRuntimeLifecycleHost<FakeStore> & {
  id: string;
  browserShutdown: () => Promise<undefined>;
  interruptActiveRuns: (reason: string) => void;
  resetSessions: () => void;
  stopAllTerminals: () => void;
};

function createStore(input: Partial<FakeStore> = {}): FakeStore {
  return {
    artifactWorkspacePath: input.artifactWorkspacePath ?? "/workspace/artifacts",
    board: input.board ?? { runs: [], tasks: [] },
    threads: input.threads ?? [],
    close: input.close ?? vi.fn(),
    getProjectArtifactWorkspacePath() {
      return this.artifactWorkspacePath;
    },
    listOrchestrationBoard() {
      return this.board;
    },
    listThreads() {
      return this.threads;
    },
  };
}

function createHost(id: string, store = createStore({ artifactWorkspacePath: `/workspace/${id}/artifacts` })): FakeHost {
  const interruptActiveRuns = vi.fn();
  const resetSessions = vi.fn();
  const stopAllTerminals = vi.fn();
  const browserShutdown = vi.fn(async () => undefined);
  return {
    id,
    workspacePath: `/workspace/${id}`,
    store,
    runtime: {
      interruptActiveRuns,
      resetSessions,
    },
    terminals: {
      stopAll: stopAllTerminals,
    },
    browserService: {
      shutdown: browserShutdown,
    },
    interruptActiveRuns,
    resetSessions,
    stopAllTerminals,
    browserShutdown,
  };
}

function createHarness(input: {
  hosts?: FakeHost[];
  activeHost?: FakeHost;
  globalPluginShutdown?: () => Promise<unknown>;
  workspacePluginShutdown?: (workspacePath: string) => Promise<unknown>;
} = {}) {
  const hosts = input.hosts ?? [];
  let activeHost = input.activeHost;
  const removeProjectRuntimeHost = vi.fn((workspacePath: string) => {
    const index = hosts.findIndex((host) => host.workspacePath.toLowerCase() === workspacePath.toLowerCase());
    if (index >= 0) hosts.splice(index, 1);
  });
  const clearProjectRuntimeHosts = vi.fn(() => {
    hosts.splice(0, hosts.length);
  });
  const clearSttRuntimes = vi.fn();
  const clearActiveProjectRuntimeHost = vi.fn(() => {
    activeHost = undefined;
  });
  const stopAutoDispatch = vi.fn();
  const disposeSttRuntimeForWorkspace = vi.fn();
  const releaseAgentMemoryEmbeddingRuntimeForHost = vi.fn();
  const shutdownPluginMcpServers = input.globalPluginShutdown ?? vi.fn(async () => undefined);
  const shutdownPluginMcpServersForWorkspace = input.workspacePluginShutdown ?? vi.fn(async () => undefined);
  const warn = vi.fn();
  const service = createProjectRuntimeLifecycleService<FakeHost>({
    defaultRuntimeResetReason: "default reset",
    normalizeWorkspacePath: (workspacePath) => workspacePath.toLowerCase(),
    projectRuntimeHostList: () => hosts,
    activeProjectRuntimeHost: () => activeHost,
    projectRuntimeHostForWorkspacePath: (workspacePath) =>
      hosts.find((host) => host.workspacePath.toLowerCase() === workspacePath.toLowerCase()),
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
  });
  return {
    clearActiveProjectRuntimeHost,
    clearProjectRuntimeHosts,
    clearSttRuntimes,
    disposeSttRuntimeForWorkspace,
    hosts,
    releaseAgentMemoryEmbeddingRuntimeForHost,
    removeProjectRuntimeHost,
    service,
    shutdownPluginMcpServers,
    shutdownPluginMcpServersForWorkspace,
    stopAutoDispatch,
    warn,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createProjectRuntimeLifecycleService", () => {
  it("collects normalized unique workspace paths for a project runtime host", () => {
    const host = createHost("project", createStore({
      artifactWorkspacePath: "/WORKSPACE/PROJECT/artifacts",
      threads: [
        { workspacePath: "/workspace/project" },
        { workspacePath: "/workspace/project/thread" },
      ],
      board: {
        runs: [{ workspacePath: "/workspace/project/run" }],
        tasks: [{ workspacePath: "/workspace/project/task" }, {}, { workspacePath: "/WORKSPACE/PROJECT/TASK" }],
      },
    }));
    host.workspacePath = "/WORKSPACE/PROJECT";
    const { service } = createHarness({ hosts: [host] });

    expect(service.workspacePathsForProjectRuntimeHost(host)).toEqual([
      "/workspace/project",
      "/workspace/project/artifacts",
      "/workspace/project/thread",
      "/workspace/project/run",
      "/workspace/project/task",
    ]);
  });

  it("resets every project runtime and shuts down global plugin servers", async () => {
    const first = createHost("first");
    const second = createHost("second");
    const globalPluginShutdown = vi.fn(async () => {
      throw new Error("global failed");
    });
    const { service, warn } = createHarness({ hosts: [first, second], globalPluginShutdown });

    service.resetRuntimeAndPluginServers("manual reset");
    await flushPromises();

    expect(first.interruptActiveRuns).toHaveBeenCalledWith("manual reset");
    expect(second.interruptActiveRuns).toHaveBeenCalledWith("manual reset");
    expect(first.resetSessions).toHaveBeenCalledTimes(1);
    expect(second.resetSessions).toHaveBeenCalledTimes(1);
    expect(globalPluginShutdown).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Ambient plugin MCP shutdown failed: global failed");
  });

  it("resets one project runtime and shuts down workspace plugin servers for every associated path", async () => {
    const host = createHost("project", createStore({
      artifactWorkspacePath: "/workspace/project/artifacts",
      threads: [{ workspacePath: "/workspace/project/thread" }],
      board: {
        runs: [{ workspacePath: "/workspace/project/run" }],
        tasks: [{ workspacePath: "/workspace/project/task" }],
      },
    }));
    const workspacePluginShutdown = vi.fn(async (workspacePath: string) => {
      if (workspacePath.endsWith("/task")) throw new Error("workspace failed");
    });
    const { service, warn } = createHarness({ hosts: [host], workspacePluginShutdown });

    service.resetProjectRuntimeAndPluginServers(host, "project reset");
    await flushPromises();

    expect(host.interruptActiveRuns).toHaveBeenCalledWith("project reset");
    expect(host.resetSessions).toHaveBeenCalledTimes(1);
    expect(workspacePluginShutdown.mock.calls.map(([workspacePath]) => workspacePath)).toEqual([
      "/workspace/project",
      "/workspace/project/artifacts",
      "/workspace/project/thread",
      "/workspace/project/run",
      "/workspace/project/task",
    ]);
    expect(warn).toHaveBeenCalledWith("Ambient plugin MCP shutdown failed: workspace failed");
  });

  it("disposes an inactive project runtime host and removes it from the registry", async () => {
    const host = createHost("project");
    const activeHost = createHost("active");
    const {
      disposeSttRuntimeForWorkspace,
      hosts,
      releaseAgentMemoryEmbeddingRuntimeForHost,
      removeProjectRuntimeHost,
      service,
      stopAutoDispatch,
    } = createHarness({ hosts: [host, activeHost], activeHost });

    service.disposeProjectRuntimeHost("/WORKSPACE/PROJECT", "removed");
    await flushPromises();

    expect(host.disposed).toBe(true);
    expect(stopAutoDispatch).toHaveBeenCalledWith("removed", host);
    expect(host.stopAllTerminals).toHaveBeenCalledTimes(1);
    expect(host.interruptActiveRuns).toHaveBeenCalledWith("removed");
    expect(host.resetSessions).toHaveBeenCalledTimes(1);
    expect(disposeSttRuntimeForWorkspace).toHaveBeenCalledWith("/workspace/project", "removed");
    expect(releaseAgentMemoryEmbeddingRuntimeForHost).toHaveBeenCalledWith(host, "removed");
    expect(host.browserShutdown).toHaveBeenCalledTimes(1);
    expect(host.store.close).toHaveBeenCalledTimes(1);
    expect(removeProjectRuntimeHost).toHaveBeenCalledWith("/workspace/project");
    expect(hosts).toEqual([activeHost]);
  });

  it("does not dispose the active project runtime host", () => {
    const host = createHost("project");
    const { service, stopAutoDispatch } = createHarness({ hosts: [host], activeHost: host });

    expect(() => service.disposeProjectRuntimeHost("/workspace/project", "removed")).toThrow(
      "Cannot dispose the active project runtime host before switching projects.",
    );
    expect(host.disposed).toBeUndefined();
    expect(stopAutoDispatch).not.toHaveBeenCalled();
  });

  it("disposes all project runtime hosts and clears runtime lifecycle registries", async () => {
    const first = createHost("first");
    const second = createHost("second");
    const {
      clearActiveProjectRuntimeHost,
      clearProjectRuntimeHosts,
      clearSttRuntimes,
      disposeSttRuntimeForWorkspace,
      hosts,
      releaseAgentMemoryEmbeddingRuntimeForHost,
      service,
      stopAutoDispatch,
    } = createHarness({ hosts: [first, second], activeHost: first });

    service.disposeAllProjectRuntimeHosts("app quit");
    await flushPromises();

    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
    expect(stopAutoDispatch).toHaveBeenCalledWith("app quit", first);
    expect(stopAutoDispatch).toHaveBeenCalledWith("app quit", second);
    expect(disposeSttRuntimeForWorkspace).toHaveBeenCalledWith("/workspace/first", "app quit");
    expect(disposeSttRuntimeForWorkspace).toHaveBeenCalledWith("/workspace/second", "app quit");
    expect(releaseAgentMemoryEmbeddingRuntimeForHost).toHaveBeenCalledWith(first, "app quit");
    expect(releaseAgentMemoryEmbeddingRuntimeForHost).toHaveBeenCalledWith(second, "app quit");
    expect(first.browserShutdown).toHaveBeenCalledTimes(1);
    expect(second.browserShutdown).toHaveBeenCalledTimes(1);
    expect(first.store.close).toHaveBeenCalledTimes(1);
    expect(second.store.close).toHaveBeenCalledTimes(1);
    expect(clearProjectRuntimeHosts).toHaveBeenCalledTimes(1);
    expect(clearSttRuntimes).toHaveBeenCalledTimes(1);
    expect(clearActiveProjectRuntimeHost).toHaveBeenCalledTimes(1);
    expect(hosts).toEqual([]);
  });
});
