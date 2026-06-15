import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/types";
import {
  projectArchiveChatsIpcChannels,
  projectPermanentWorktreeIpcChannels,
  projectRemoveIpcChannels,
  projectRevealIpcChannels,
  projectSelectIpcChannels,
  projectUpdateIpcChannels,
  registerProjectArchiveChatsIpc,
  registerProjectPermanentWorktreeIpc,
  registerProjectRemoveIpc,
  registerProjectRevealIpc,
  registerProjectSelectIpc,
  registerProjectUpdateIpc,
  type RegisterProjectArchiveChatsIpcDependencies,
  type RegisterProjectPermanentWorktreeIpcDependencies,
  type RegisterProjectRemoveIpcDependencies,
  type RegisterProjectRevealIpcDependencies,
  type RegisterProjectSelectIpcDependencies,
  type RegisterProjectUpdateIpcDependencies,
} from "./registerProjectIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

interface FakeHost {
  workspacePath: string;
  activeThreadId: string;
}

describe("registerProjectSelectIpc", () => {
  it("registers the project select channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...projectSelectIpcChannels]);
  });

  it("reads scoped state when selecting the active project with an explicit thread", async () => {
    const { deps, host, invoke } = registerWithFakes({
      resolvedWorkspacePath: "/tmp/active",
    });

    await expect(invoke("project:select", { projectId: "active-project", threadId: "thread-2" })).resolves.toEqual(sampleDesktopState("/tmp/active", "thread-2"));

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("active-project", host);
    expect(deps.normalizeWorkspacePath).toHaveBeenCalledWith("/tmp/active");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-2");
    expect(deps.activeThreadIdForHost).not.toHaveBeenCalled();
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });

  it("falls back to the active thread when selecting the active project without a thread", async () => {
    const { deps, host, invoke } = registerWithFakes({
      activeThreadId: "thread-active",
      resolvedWorkspacePath: "/tmp/active",
    });

    await expect(invoke("project:select", { projectId: "active-project" })).resolves.toEqual(sampleDesktopState("/tmp/active", "thread-active"));

    expect(deps.activeThreadIdForHost).toHaveBeenCalledWith(host);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-active");
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });

  it("switches workspaces when selecting a different project", async () => {
    const { deps, invoke } = registerWithFakes({
      resolvedWorkspacePath: "/tmp/other",
    });

    await expect(invoke("project:select", { projectId: "other-project", threadId: "thread-9" })).resolves.toEqual(sampleDesktopState("/tmp/other", "thread-9"));

    expect(deps.switchWorkspace).toHaveBeenCalledWith("/tmp/other", "thread-9");
    expect(deps.readStateForProjectHostAction).not.toHaveBeenCalled();
  });

  it("rejects invalid project select input before calling dependencies", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("project:select", { projectId: "" })).toThrow();
    expect(() => invoke("project:select", { projectId: "project-1", threadId: "" })).toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });
});

describe("registerProjectUpdateIpc", () => {
  it("registers the project update channel", () => {
    const { handlers } = registerUpdateWithFakes();

    expect([...handlers.keys()]).toEqual([...projectUpdateIpcChannels]);
  });

  it("updates provided project fields and returns active project state", async () => {
    const { deps, host, invoke } = registerUpdateWithFakes({
      resolvedWorkspacePath: "/tmp/project",
    });

    await expect(invoke("project:update", { projectId: "project-1", name: "Project One", pinned: true })).resolves.toEqual(sampleDesktopState("/tmp/active", "thread-1"));

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("project-1", host);
    expect(deps.setProjectDisplayName).toHaveBeenCalledWith("/tmp/project", "Project One");
    expect(deps.setProjectPinned).toHaveBeenCalledWith("/tmp/project", true);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });

  it("does not update omitted project fields", async () => {
    const { deps, invoke } = registerUpdateWithFakes({
      resolvedWorkspacePath: "/tmp/project",
    });

    await expect(invoke("project:update", { projectId: "project-1" })).resolves.toEqual(sampleDesktopState("/tmp/active", "thread-1"));

    expect(deps.setProjectDisplayName).not.toHaveBeenCalled();
    expect(deps.setProjectPinned).not.toHaveBeenCalled();
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledOnce();
  });

  it("rejects invalid project update input before calling dependencies", () => {
    const { deps, invoke } = registerUpdateWithFakes();

    expect(() => invoke("project:update", { projectId: "" })).toThrow();
    expect(() => invoke("project:update", { projectId: "project-1", name: "x".repeat(161) })).toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.setProjectDisplayName).not.toHaveBeenCalled();
    expect(deps.setProjectPinned).not.toHaveBeenCalled();
  });
});

describe("registerProjectRemoveIpc", () => {
  it("registers the project remove channel", () => {
    const { handlers } = registerRemoveWithFakes();

    expect([...handlers.keys()]).toEqual([...projectRemoveIpcChannels]);
  });

  it("removes an inactive project and returns active project state", async () => {
    const { deps, host, invoke } = registerRemoveWithFakes({
      resolvedWorkspacePath: "/tmp/other",
      registeredWorkspacePaths: ["/tmp/active", "/tmp/other"],
    });

    await expect(invoke("project:remove", { projectId: "other-project" })).resolves.toEqual(sampleDesktopState("/tmp/active", "thread-1"));

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("other-project", host);
    expect(deps.removeProject).toHaveBeenCalledWith("/tmp/other");
    expect(deps.disposeProjectRuntimeHost).toHaveBeenCalledWith("/tmp/other", "Project runtime host disposed because the project was removed.");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });

  it("switches to a remaining project before disposing the active project", async () => {
    const { deps, invoke } = registerRemoveWithFakes({
      resolvedWorkspacePath: "/tmp/active",
      registeredWorkspacePaths: ["/tmp/active", "/tmp/remaining"],
    });

    await expect(invoke("project:remove", { projectId: "active-project" })).resolves.toEqual(sampleDesktopState("/tmp/remaining", "thread-1"));

    expect(deps.removeProject).toHaveBeenCalledWith("/tmp/active");
    expect(deps.switchWorkspace).toHaveBeenCalledWith("/tmp/remaining");
    expect(deps.disposeProjectRuntimeHost).toHaveBeenCalledWith("/tmp/active", "Project runtime host disposed because the project was removed.");
    expect(deps.readStateForProjectHostAction).not.toHaveBeenCalled();
  });

  it("rejects removing the only open active project", () => {
    const { deps, invoke } = registerRemoveWithFakes({
      resolvedWorkspacePath: "/tmp/active",
      registeredWorkspacePaths: ["/tmp/active"],
    });

    expect(() => invoke("project:remove", { projectId: "active-project" })).toThrow("Cannot remove the only open project.");

    expect(deps.removeProject).not.toHaveBeenCalled();
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
    expect(deps.disposeProjectRuntimeHost).not.toHaveBeenCalled();
  });

  it("rejects invalid project remove input before calling dependencies", () => {
    const { deps, invoke } = registerRemoveWithFakes();

    expect(() => invoke("project:remove", { projectId: "" })).toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.removeProject).not.toHaveBeenCalled();
  });
});

describe("registerProjectRevealIpc", () => {
  it("registers the project reveal channel", () => {
    const { handlers } = registerRevealWithFakes();

    expect([...handlers.keys()]).toEqual([...projectRevealIpcChannels]);
  });

  it("opens the resolved project path", async () => {
    const { deps, host, invoke } = registerRevealWithFakes({
      resolvedWorkspacePath: "/tmp/project",
    });

    await expect(invoke("project:reveal", { projectId: "project-1" })).resolves.toBeUndefined();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("project-1", host);
    expect(deps.openProjectPath).toHaveBeenCalledWith("/tmp/project");
    expect(deps.showProjectInFolder).not.toHaveBeenCalled();
  });

  it("shows the project in its folder when opening reports an error", async () => {
    const { deps, invoke } = registerRevealWithFakes({
      resolvedWorkspacePath: "/tmp/project",
      openPathError: "failed to open",
    });

    await expect(invoke("project:reveal", { projectId: "project-1" })).resolves.toBeUndefined();

    expect(deps.openProjectPath).toHaveBeenCalledWith("/tmp/project");
    expect(deps.showProjectInFolder).toHaveBeenCalledWith("/tmp/project");
  });

  it("rejects invalid project reveal input before calling dependencies", async () => {
    const { deps, invoke } = registerRevealWithFakes();

    await expect(invoke("project:reveal", { projectId: "" })).rejects.toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.openProjectPath).not.toHaveBeenCalled();
  });
});

describe("registerProjectArchiveChatsIpc", () => {
  it("registers the project archive chats channel", () => {
    const { handlers } = registerArchiveChatsWithFakes();

    expect([...handlers.keys()]).toEqual([...projectArchiveChatsIpcChannels]);
  });

  it("archives chats through a loaded project host and returns scoped state", async () => {
    const { deps, loadedHost, invoke } = registerArchiveChatsWithFakes({
      resolvedWorkspacePath: "/tmp/loaded",
      loadedHost: { workspacePath: "/tmp/loaded", activeThreadId: "thread-old" },
      initialThreadId: "thread-initial",
    });

    await expect(invoke("project:archive-chats", { projectId: "loaded-project" })).resolves.toEqual(sampleDesktopState("/tmp/loaded", "thread-initial"));

    expect(deps.projectRuntimeHostForWorkspacePath).toHaveBeenCalledWith("/tmp/loaded");
    expect(deps.archiveProjectChatsForHost).toHaveBeenCalledWith(loadedHost);
    expect(deps.initialActiveThreadIdForHost).toHaveBeenCalledWith(loadedHost);
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(loadedHost, "thread-initial");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(loadedHost, "thread-initial");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(loadedHost, "thread-initial");
    expect(deps.archiveProjectChats).not.toHaveBeenCalled();
    expect(loadedHost?.activeThreadId).toBe("thread-initial");
  });

  it("archives chats directly for an unloaded project and returns active project state", async () => {
    const { deps, activeHost, invoke } = registerArchiveChatsWithFakes({
      resolvedWorkspacePath: "/tmp/unloaded",
      loadedHost: null,
    });

    await expect(invoke("project:archive-chats", { projectId: "unloaded-project" })).resolves.toEqual(sampleDesktopState("/tmp/active", "thread-1"));

    expect(deps.archiveProjectChats).toHaveBeenCalledWith("/tmp/unloaded");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(activeHost);
    expect(deps.archiveProjectChatsForHost).not.toHaveBeenCalled();
    expect(deps.setProjectHostActiveThreadId).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
  });

  it("rejects invalid project archive chats input before calling dependencies", () => {
    const { deps, invoke } = registerArchiveChatsWithFakes();

    expect(() => invoke("project:archive-chats", { projectId: "" })).toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.archiveProjectChats).not.toHaveBeenCalled();
    expect(deps.archiveProjectChatsForHost).not.toHaveBeenCalled();
  });
});

describe("registerProjectPermanentWorktreeIpc", () => {
  it("registers the project permanent worktree channel", () => {
    const { handlers } = registerPermanentWorktreeWithFakes();

    expect([...handlers.keys()]).toEqual([...projectPermanentWorktreeIpcChannels]);
  });

  it("creates a permanent worktree from the selected folder and switches to it", async () => {
    const { deps, host, invoke } = registerPermanentWorktreeWithFakes({
      resolvedWorkspacePath: "/tmp/source-project",
      dialogResult: { canceled: false, filePaths: ["/tmp/source-project-worktree"] },
      branchName: "codex/source-project-worktree-abc",
    });

    await expect(invoke("project:create-permanent-worktree", { projectId: "project-1" })).resolves.toEqual(sampleDesktopState("/tmp/source-project-worktree", "thread-1"));

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("project-1", host);
    expect(deps.showOpenDialog).toHaveBeenCalledWith({
      title: "Create permanent worktree",
      buttonLabel: "Create Worktree",
      defaultPath: "/tmp/source-project-worktree",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });
    expect(deps.permanentWorktreeBranchName).toHaveBeenCalledWith("/tmp/source-project");
    expect(deps.createPermanentWorktree).toHaveBeenCalledWith("/tmp/source-project", "/tmp/source-project-worktree", "codex/source-project-worktree-abc");
    expect(deps.switchWorkspace).toHaveBeenCalledWith("/tmp/source-project-worktree");
  });

  it("returns undefined when the worktree dialog is canceled", async () => {
    const { deps, invoke } = registerPermanentWorktreeWithFakes({
      dialogResult: { canceled: true, filePaths: ["/tmp/ignored"] },
    });

    await expect(invoke("project:create-permanent-worktree", { projectId: "project-1" })).resolves.toBeUndefined();

    expect(deps.createPermanentWorktree).not.toHaveBeenCalled();
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });

  it("returns undefined when the worktree dialog has no file path", async () => {
    const { deps, invoke } = registerPermanentWorktreeWithFakes({
      dialogResult: { canceled: false, filePaths: [] },
    });

    await expect(invoke("project:create-permanent-worktree", { projectId: "project-1" })).resolves.toBeUndefined();

    expect(deps.createPermanentWorktree).not.toHaveBeenCalled();
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });

  it("rejects invalid permanent worktree input before calling dependencies", async () => {
    const { deps, invoke } = registerPermanentWorktreeWithFakes();

    await expect(invoke("project:create-permanent-worktree", { projectId: "" })).rejects.toThrow();
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.showOpenDialog).not.toHaveBeenCalled();
    expect(deps.createPermanentWorktree).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  activeWorkspacePath = "/tmp/active",
  activeThreadId = "thread-1",
  resolvedWorkspacePath = "/tmp/active",
}: {
  activeWorkspacePath?: string;
  activeThreadId?: string;
  resolvedWorkspacePath?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    workspacePath: activeWorkspacePath,
    activeThreadId,
  };
  const deps: RegisterProjectSelectIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resolveRegisteredProjectPathForHost: vi.fn(() => resolvedWorkspacePath),
    normalizeWorkspacePath: vi.fn((workspacePath: string) => workspacePath),
    activeThreadIdForHost: vi.fn((targetHost: FakeHost) => targetHost.activeThreadId),
    readStateForProjectHostAction: vi.fn((_targetHost: FakeHost, threadId: string) => sampleDesktopState(activeWorkspacePath, threadId)),
    switchWorkspace: vi.fn((workspacePath: string, requestedThreadId = "thread-1") => sampleDesktopState(workspacePath, requestedThreadId)),
  };
  registerProjectSelectIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerPermanentWorktreeWithFakes({
  activeWorkspacePath = "/tmp/active",
  activeThreadId = "thread-1",
  resolvedWorkspacePath = "/tmp/source-project",
  dialogResult = { canceled: false, filePaths: ["/tmp/source-project-worktree"] },
  branchName = "codex/source-project-worktree",
}: {
  activeWorkspacePath?: string;
  activeThreadId?: string;
  resolvedWorkspacePath?: string;
  dialogResult?: { canceled: boolean; filePaths: string[] };
  branchName?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    workspacePath: activeWorkspacePath,
    activeThreadId,
  };
  const deps: RegisterProjectPermanentWorktreeIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resolveRegisteredProjectPathForHost: vi.fn(() => resolvedWorkspacePath),
    normalizeWorkspacePath: vi.fn((workspacePath: string) => workspacePath),
    showOpenDialog: vi.fn(async () => dialogResult),
    createPermanentWorktree: vi.fn(),
    permanentWorktreeBranchName: vi.fn(() => branchName),
    switchWorkspace: vi.fn((workspacePath: string) => sampleDesktopState(workspacePath, activeThreadId)),
  };
  registerProjectPermanentWorktreeIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerArchiveChatsWithFakes({
  activeWorkspacePath = "/tmp/active",
  activeThreadId = "thread-1",
  resolvedWorkspacePath = "/tmp/loaded",
  loadedHost = { workspacePath: "/tmp/loaded", activeThreadId: "thread-loaded" },
  initialThreadId = "thread-initial",
}: {
  activeWorkspacePath?: string;
  activeThreadId?: string;
  resolvedWorkspacePath?: string;
  loadedHost?: FakeHost | null;
  initialThreadId?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const activeHost: FakeHost = {
    workspacePath: activeWorkspacePath,
    activeThreadId,
  };
  const deps: RegisterProjectArchiveChatsIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => activeHost),
    resolveRegisteredProjectPathForHost: vi.fn(() => resolvedWorkspacePath),
    normalizeWorkspacePath: vi.fn((workspacePath: string) => workspacePath),
    projectRuntimeHostForWorkspacePath: vi.fn(() => loadedHost ?? undefined),
    archiveProjectChatsForHost: vi.fn(),
    initialActiveThreadIdForHost: vi.fn(() => initialThreadId),
    setProjectHostActiveThreadId: vi.fn((targetHost: FakeHost, threadId: string) => {
      targetHost.activeThreadId = threadId;
      return threadId;
    }),
    emitProjectStateIfActive: vi.fn(),
    archiveProjectChats: vi.fn(),
    readStateForProjectHostAction: vi.fn((targetHost: FakeHost, threadId = targetHost.activeThreadId) => sampleDesktopState(targetHost.workspacePath, threadId)),
  };
  registerProjectArchiveChatsIpc(deps);

  return {
    activeHost,
    deps,
    handlers,
    loadedHost,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRevealWithFakes({
  activeWorkspacePath = "/tmp/active",
  activeThreadId = "thread-1",
  resolvedWorkspacePath = "/tmp/project",
  openPathError = "",
}: {
  activeWorkspacePath?: string;
  activeThreadId?: string;
  resolvedWorkspacePath?: string;
  openPathError?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    workspacePath: activeWorkspacePath,
    activeThreadId,
  };
  const deps: RegisterProjectRevealIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resolveRegisteredProjectPathForHost: vi.fn(() => resolvedWorkspacePath),
    openProjectPath: vi.fn(async () => openPathError),
    showProjectInFolder: vi.fn(),
  };
  registerProjectRevealIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRemoveWithFakes({
  activeWorkspacePath = "/tmp/active",
  activeThreadId = "thread-1",
  resolvedWorkspacePath = "/tmp/other",
  registeredWorkspacePaths = ["/tmp/active", "/tmp/other"],
  existingWorkspacePaths = registeredWorkspacePaths,
}: {
  activeWorkspacePath?: string;
  activeThreadId?: string;
  resolvedWorkspacePath?: string;
  registeredWorkspacePaths?: string[];
  existingWorkspacePaths?: string[];
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    workspacePath: activeWorkspacePath,
    activeThreadId,
  };
  const deps: RegisterProjectRemoveIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resolveRegisteredProjectPathForHost: vi.fn(() => resolvedWorkspacePath),
    normalizeWorkspacePath: vi.fn((workspacePath: string) => workspacePath),
    listRegisteredProjectPaths: vi.fn(() => registeredWorkspacePaths),
    pathExists: vi.fn((workspacePath: string) => existingWorkspacePaths.includes(workspacePath)),
    removeProject: vi.fn(),
    switchWorkspace: vi.fn((workspacePath: string) => sampleDesktopState(workspacePath, "thread-1")),
    disposeProjectRuntimeHost: vi.fn(),
    readStateForProjectHostAction: vi.fn((targetHost: FakeHost) => sampleDesktopState(targetHost.workspacePath, targetHost.activeThreadId)),
  };
  registerProjectRemoveIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerUpdateWithFakes({
  activeWorkspacePath = "/tmp/active",
  activeThreadId = "thread-1",
  resolvedWorkspacePath = "/tmp/active",
}: {
  activeWorkspacePath?: string;
  activeThreadId?: string;
  resolvedWorkspacePath?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    workspacePath: activeWorkspacePath,
    activeThreadId,
  };
  const deps: RegisterProjectUpdateIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resolveRegisteredProjectPathForHost: vi.fn(() => resolvedWorkspacePath),
    setProjectDisplayName: vi.fn(),
    setProjectPinned: vi.fn(),
    readStateForProjectHostAction: vi.fn((targetHost: FakeHost) => sampleDesktopState(targetHost.workspacePath, targetHost.activeThreadId)),
  };
  registerProjectUpdateIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function sampleDesktopState(workspacePath: string, threadId: string): DesktopState {
  return {
    workspace: { path: workspacePath },
    activeWorkspace: { path: workspacePath },
    activeThreadId: threadId,
  } as DesktopState;
}
