import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { SecureInputPromptResponseInput } from "../../shared/permissionTypes";
import {
  registerSecureInputRespondIpc,
  secureInputRespondIpcChannels,
  type RegisterSecureInputRespondIpcDependencies,
} from "./registerSecureInputIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerSecureInputRespondIpc", () => {
  it("registers the secure input respond channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...secureInputRespondIpcChannels]);
  });

  it("parses secure input response before responding", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(
      invoke("secure-input:respond", {
        id: "secure-input-1",
        value: "123456",
        canceled: false,
        extra: "ignored",
      }),
    ).resolves.toBeUndefined();

    expect(deps.respondSecureInput).toHaveBeenCalledWith({
      id: "secure-input-1",
      value: "123456",
      canceled: false,
    });
  });

  it("rejects invalid secure input response before calling the dependency", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("secure-input:respond", { id: "" })).toThrow();
    expect(() => invoke("secure-input:respond", { id: "secure-input-1", canceled: "no" })).toThrow();

    expect(deps.respondSecureInput).not.toHaveBeenCalled();
  });

  it("propagates secure input response errors", async () => {
    const error = new Error("secure input response failed");
    const { deps, invoke } = registerWithFakes({ error });
    const input: SecureInputPromptResponseInput = {
      id: "secure-input-1",
      canceled: true,
    };

    await expect(invoke("secure-input:respond", input)).rejects.toThrow("secure input response failed");

    expect(deps.respondSecureInput).toHaveBeenCalledWith(input);
  });
});

function registerWithFakes({
  error,
}: {
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterSecureInputRespondIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    respondSecureInput: vi.fn(async (_input: SecureInputPromptResponseInput) => {
      if (error) throw error;
    }),
  };
  registerSecureInputRespondIpc(deps);

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
