import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  clipboardIpcChannels,
  registerClipboardIpc,
  type RegisterClipboardIpcDependencies,
} from "./registerClipboardIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerClipboardIpc", () => {
  it("registers the clipboard channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...clipboardIpcChannels]);
  });

  it("reads text from the clipboard dependency", async () => {
    const { deps, invoke } = registerWithFakes({ clipboardText: "hello clipboard" });

    await expect(invoke("clipboard:read-text")).resolves.toBe("hello clipboard");

    expect(deps.readText).toHaveBeenCalledOnce();
  });

  it("writes parsed text to the clipboard dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("clipboard:write-text", "copy me")).resolves.toBeUndefined();

    expect(deps.writeText).toHaveBeenCalledWith("copy me");
  });

  it("rejects non-string clipboard writes before writing", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("clipboard:write-text", 42)).toThrow();
    expect(deps.writeText).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  clipboardText = "clipboard text",
}: {
  clipboardText?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterClipboardIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readText: vi.fn(() => clipboardText),
    writeText: vi.fn(),
  };
  registerClipboardIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
