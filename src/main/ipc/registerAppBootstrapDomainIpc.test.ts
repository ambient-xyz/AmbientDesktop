import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/types";
import { appBootstrapIpcChannels } from "./registerAppIpc";
import {
  appBootstrapDomainIpcChannels,
  registerAppBootstrapDomainIpc,
} from "./registerAppBootstrapDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerAppBootstrapDomainIpc", () => {
  it("registers app bootstrap channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...appBootstrapDomainIpcChannels]);
    expect([...appBootstrapDomainIpcChannels]).toEqual([
      ...appBootstrapIpcChannels,
    ]);
  });

  it("routes bootstrap state through the supplied state reader", async () => {
    const { deps, invoke, state } = registerWithFakes();

    await expect(invoke("app:bootstrap")).resolves.toBe(state);

    expect(deps.readBootstrapState).toHaveBeenCalledOnce();
  });
});

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const state = { activeThreadId: "thread-1" } as unknown as DesktopState;
  const deps = {
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    readBootstrapState: vi.fn(() => state),
  };

  registerAppBootstrapDomainIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    state,
  };
}
