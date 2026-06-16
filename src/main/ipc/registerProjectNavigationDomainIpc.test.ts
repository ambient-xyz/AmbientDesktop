import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/types";
import {
  projectSelectIpcChannels,
  projectUpdateIpcChannels,
} from "./registerProjectIpc";
import {
  projectNavigationDomainIpcChannels,
  registerProjectNavigationDomainIpc,
} from "./registerProjectNavigationDomainIpc";
import { threadSelectIpcChannels } from "./registerThreadIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerProjectNavigationDomainIpc", () => {
  it("registers thread and project navigation channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...projectNavigationDomainIpcChannels]);
    expect([...projectNavigationDomainIpcChannels]).toEqual([
      ...threadSelectIpcChannels,
      ...projectSelectIpcChannels,
      ...projectUpdateIpcChannels,
    ]);
  });

  it("routes thread selection through the thread host resolver", () => {
    const { deps, host, invoke, desktopState } = registerWithFakes();

    expect(invoke("thread:select", "thread-2")).toBe(desktopState);

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-2");
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "thread-2");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "thread-2");
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-2");
  });

  it("selects the active project without switching workspaces", () => {
    const { deps, host, invoke, desktopState } = registerWithFakes({
      resolvedWorkspacePath: "/workspace/project",
    });

    expect(invoke("project:select", { projectId: "project-1" })).toBe(desktopState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("project-1", host);
    expect(deps.activeThreadIdForHost).toHaveBeenCalledWith(host);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host, "thread-1");
    expect(deps.switchWorkspace).not.toHaveBeenCalled();
  });

  it("updates project metadata through the project registry adapters", () => {
    const { deps, host, invoke, desktopState } = registerWithFakes({
      resolvedWorkspacePath: "/workspace/project",
    });

    expect(invoke("project:update", {
      projectId: "project-1",
      name: "Renamed Project",
      pinned: true,
    })).toBe(desktopState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resolveRegisteredProjectPathForHost).toHaveBeenCalledWith("project-1", host);
    expect(deps.setProjectDisplayName).toHaveBeenCalledWith("/workspace/project", "Renamed Project");
    expect(deps.setProjectPinned).toHaveBeenCalledWith("/workspace/project", true);
    expect(deps.readStateForProjectHostAction).toHaveBeenCalledWith(host);
  });
});

function registerWithFakes({
  resolvedWorkspacePath = "/workspace/other",
}: {
  resolvedWorkspacePath?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const desktopState = { activeThreadId: "thread-1", projects: [] } as unknown as DesktopState;
  const host = {
    workspacePath: "/workspace/project",
  };
  const deps = {
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
    setProjectHostActiveThreadId: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    readStateForProjectHostAction: vi.fn(() => desktopState),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resolveRegisteredProjectPathForHost: vi.fn(() => resolvedWorkspacePath),
    normalizeWorkspacePath: vi.fn((workspacePath: string) => workspacePath),
    activeThreadIdForHost: vi.fn(() => "thread-1"),
    switchWorkspace: vi.fn(() => desktopState),
    setProjectDisplayName: vi.fn(),
    setProjectPinned: vi.fn(),
  };

  registerProjectNavigationDomainIpc(deps);

  return {
    deps,
    desktopState,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return handler({} as IpcMainInvokeEvent, raw);
    },
  };
}
