import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import {
  e2eEmitEventIpcChannels,
  registerE2eEmitEventIpc,
  type RegisterE2eEmitEventIpcDependencies,
} from "./registerE2eIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerE2eEmitEventIpc", () => {
  it("registers the E2E emit event channel when E2E is enabled", () => {
    const { handlers } = registerWithFakes({ enabled: true });

    expect([...handlers.keys()]).toEqual([...e2eEmitEventIpcChannels]);
  });

  it("does not register the E2E emit event channel when E2E is disabled", () => {
    const { deps, handlers } = registerWithFakes({ enabled: false });

    expect(handlers.size).toBe(0);
    expect(deps.handleIpc).not.toHaveBeenCalled();
  });

  it("forwards the raw desktop event with the invoking IPC event", async () => {
    const { deps, invoke } = registerWithFakes({ enabled: true });
    const event = {
      type: "e2e-message-captured",
      input: {
        threadId: "thread-1",
        content: "hello",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient",
        thinkingLevel: "minimal",
      },
    } satisfies DesktopEvent;

    await expect(invoke("e2e:emit-event", event)).resolves.toBeUndefined();

    expect(deps.emitDesktopEvent).toHaveBeenCalledWith(expect.any(Object), event);
  });

  it("propagates event emitter errors", async () => {
    const error = new Error("event bus unavailable");
    const { deps, invoke } = registerWithFakes({ enabled: true, error });
    const event = {
      type: "e2e-message-captured",
      input: {
        threadId: "thread-1",
        content: "hello",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient",
        thinkingLevel: "minimal",
      },
    } satisfies DesktopEvent;

    await expect(invoke("e2e:emit-event", event)).rejects.toThrow("event bus unavailable");

    expect(deps.emitDesktopEvent).toHaveBeenCalledWith(expect.any(Object), event);
  });
});

function registerWithFakes({
  enabled,
  error,
}: {
  enabled: boolean;
  error?: Error;
}): {
  deps: RegisterE2eEmitEventIpcDependencies;
  handlers: Map<string, IpcListener>;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
} {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterE2eEmitEventIpcDependencies = {
    handleIpc: vi.fn((channel, listener) => {
      handlers.set(channel, listener);
    }),
    isE2eEnabled: vi.fn(() => enabled),
    emitDesktopEvent: vi.fn(() => {
      if (error) throw error;
    }),
  };

  registerE2eEmitEventIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel, raw) => {
      const listener = handlers.get(channel);
      if (!listener) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => listener({} as IpcMainInvokeEvent, raw));
    },
  };
}
