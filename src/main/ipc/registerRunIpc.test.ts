import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  registerRunAbortIpc,
  runAbortIpcChannels,
  type RegisterRunAbortIpcDependencies,
} from "./registerRunIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerRunAbortIpc", () => {
  it("registers the run abort channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...runAbortIpcChannels]);
  });

  it("parses the thread id before aborting the run", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("run:abort", "thread-1")).resolves.toBeUndefined();

    expect(deps.abortRun).toHaveBeenCalledWith("thread-1");
  });

  it("rejects invalid input before aborting the run", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("run:abort", "")).toThrow();

    expect(deps.abortRun).not.toHaveBeenCalled();
  });

  it("propagates run abort errors", async () => {
    const error = new Error("runtime unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("run:abort", "thread-1")).rejects.toThrow("runtime unavailable");

    expect(deps.abortRun).toHaveBeenCalledWith("thread-1");
  });
});

function registerWithFakes(options: {
  error?: Error;
} = {}): {
  deps: RegisterRunAbortIpcDependencies;
  handlers: Map<string, IpcListener>;
  event: IpcMainInvokeEvent;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
} {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterRunAbortIpcDependencies = {
    handleIpc: vi.fn((channel, listener) => {
      handlers.set(channel, listener);
    }),
    abortRun: vi.fn(async () => {
      if (options.error) throw options.error;
    }),
  };
  const event = {} as IpcMainInvokeEvent;

  registerRunAbortIpc(deps);

  return {
    deps,
    handlers,
    event,
    invoke: (channel, raw) => {
      const listener = handlers.get(channel);
      if (!listener) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(listener(event, raw));
    },
  };
}
