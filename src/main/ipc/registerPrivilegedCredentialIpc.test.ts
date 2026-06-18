import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { PrivilegedCredentialPromptResponseInput } from "../../shared/permissionTypes";
import {
  privilegedCredentialRespondIpcChannels,
  registerPrivilegedCredentialRespondIpc,
  type RegisterPrivilegedCredentialRespondIpcDependencies,
} from "./registerPrivilegedCredentialIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPrivilegedCredentialRespondIpc", () => {
  it("registers the privileged credential respond channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...privilegedCredentialRespondIpcChannels]);
  });

  it("parses credential response input before responding", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(
      invoke("privileged-credential:respond", {
        id: "credential-request-1",
        credential: "ephemeral value",
        canceled: false,
        extra: "ignored",
      }),
    ).resolves.toBeUndefined();

    expect(deps.respondPrivilegedCredential).toHaveBeenCalledWith({
      id: "credential-request-1",
      credential: "ephemeral value",
      canceled: false,
    });
  });

  it("rejects invalid credential response input before calling the dependency", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("privileged-credential:respond", { id: "" })).toThrow();
    expect(() => invoke("privileged-credential:respond", { id: "credential-request-1", canceled: "no" })).toThrow();

    expect(deps.respondPrivilegedCredential).not.toHaveBeenCalled();
  });

  it("propagates credential response errors", async () => {
    const error = new Error("credential response failed");
    const { deps, invoke } = registerWithFakes({ error });
    const input: PrivilegedCredentialPromptResponseInput = {
      id: "credential-request-1",
      canceled: true,
    };

    await expect(invoke("privileged-credential:respond", input)).rejects.toThrow("credential response failed");

    expect(deps.respondPrivilegedCredential).toHaveBeenCalledWith(input);
  });
});

function registerWithFakes({
  error,
}: {
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPrivilegedCredentialRespondIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    respondPrivilegedCredential: vi.fn(async (_input: PrivilegedCredentialPromptResponseInput) => {
      if (error) throw error;
    }),
  };
  registerPrivilegedCredentialRespondIpc(deps);

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
