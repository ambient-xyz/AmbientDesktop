import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  projectBoardDomainIpcChannels,
  registerProjectBoardDomainIpc,
  type RegisterProjectBoardDomainIpcDependencies,
} from "./registerProjectBoardDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerProjectBoardDomainIpc", () => {
  it("registers the Project Board domain channel table", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...projectBoardDomainIpcChannels]);
  });

  it("keeps Project Board git status dependency wiring intact", async () => {
    const { board, deps, host, invoke, runtimeSnapshot, status } = registerWithFakes();

    await expect(invoke("project-board:git-sync-status", { boardId: "board-1" })).resolves.toBe(status);

    expect(deps.requireProjectRuntimeHostForProjectBoard).toHaveBeenCalledWith("board-1");
    expect(deps.requireProjectBoardForAction).toHaveBeenCalledWith("board-1", host.store);
    expect(deps.getProjectBoardGitSyncStatus).toHaveBeenCalledWith(board, { runtime: runtimeSnapshot });
  });

  it("keeps Project Board creation routed through the domain dependency bundle", async () => {
    const { deps, invoke, state } = registerWithFakes();

    await expect(invoke("project-board:create", { projectId: "project-1", title: " Ship it " })).resolves.toBe(
      state,
    );

    expect(deps.createProjectBoardForProjectHost).toHaveBeenCalledWith({
      projectId: "project-1",
      title: "Ship it",
    });
  });
});

function registerWithFakes(): {
  board: { boardId: string };
  deps: RegisterProjectBoardDomainIpcDependencies;
  handlers: Map<string, IpcListener>;
  host: { store: { listOrchestrationBoard: ReturnType<typeof vi.fn> } };
  invoke(channel: string, raw?: unknown): Promise<unknown>;
  runtimeSnapshot: { tasks: unknown[] };
  state: { activeThreadId: string };
  status: { clean: boolean };
} {
  const handlers = new Map<string, IpcListener>();
  const runtimeSnapshot = { tasks: [] };
  const host = {
    store: {
      listOrchestrationBoard: vi.fn(() => runtimeSnapshot),
    },
  };
  const board = { boardId: "board-1" };
  const state = { activeThreadId: "thread-1" };
  const status = { clean: true };
  const deps: RegisterProjectBoardDomainIpcDependencies = new Proxy(
    {
      handleIpc: vi.fn((channel: string, listener: IpcListener) => {
        handlers.set(channel, listener);
      }),
      createProjectBoardForProjectHost: vi.fn(() => state),
      getProjectBoardGitSyncStatus: vi.fn(() => status),
      requireProjectBoardForAction: vi.fn(() => board),
      requireProjectRuntimeHostForProjectBoard: vi.fn(() => host),
    },
    {
      get(target, property: string | symbol) {
        if (property in target) return target[property as keyof typeof target];
        return vi.fn();
      },
    },
  ) as unknown as RegisterProjectBoardDomainIpcDependencies;

  registerProjectBoardDomainIpc(deps);

  return {
    board,
    deps,
    handlers,
    host,
    invoke: (channel, raw) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
    runtimeSnapshot,
    state,
    status,
  };
}
