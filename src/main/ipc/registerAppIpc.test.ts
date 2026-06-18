import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import {
  appBootstrapIpcChannels,
  registerAppBootstrapIpc,
  type RegisterAppBootstrapIpcDependencies,
} from "./registerAppIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerAppBootstrapIpc", () => {
  it("registers the app bootstrap channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...appBootstrapIpcChannels]);
  });

  it("reads the bootstrap state", async () => {
    const { deps, invoke, state } = registerWithFakes();

    await expect(invoke("app:bootstrap")).resolves.toEqual(state);

    expect(deps.readBootstrapState).toHaveBeenCalledOnce();
  });

  it("propagates bootstrap state read errors", async () => {
    const error = new Error("state unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("app:bootstrap")).rejects.toThrow("state unavailable");

    expect(deps.readBootstrapState).toHaveBeenCalledOnce();
  });
});

function registerWithFakes({
  state = sampleDesktopState(),
  error,
}: {
  state?: DesktopState;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAppBootstrapIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readBootstrapState: vi.fn(async () => {
      if (error) throw error;
      return state;
    }),
  };
  registerAppBootstrapIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    state,
  };
}

function sampleDesktopState(): DesktopState {
  return { activeThreadId: "thread-1" } as DesktopState;
}
