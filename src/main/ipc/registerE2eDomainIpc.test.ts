import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import { e2eEmitEventIpcChannels, e2ePermissionGrantProbeIpcChannels } from "./registerE2eIpc";
import {
  e2eDomainIpcChannels,
  registerE2eDomainIpc,
} from "./registerE2eDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerE2eDomainIpc", () => {
  it("registers E2E channels in the previous main registrar order when E2E is enabled", () => {
    const { handlers } = registerWithFakes({ enabled: true });

    expect([...handlers.keys()]).toEqual([...e2eDomainIpcChannels]);
    expect([...e2eDomainIpcChannels]).toEqual([
      ...e2eEmitEventIpcChannels,
      ...e2ePermissionGrantProbeIpcChannels,
    ]);
  });

  it("keeps the E2E domain disabled when E2E mode is off", () => {
    const { handlers } = registerWithFakes({ enabled: false });

    expect(handlers.size).toBe(0);
  });

  it("routes E2E events through the supplied desktop event emitter", async () => {
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

  it("routes E2E permission grant probes through the supplied resolver", async () => {
    const { deps, invoke } = registerWithFakes({ enabled: true });
    const input = {
      request: {
        threadId: "thread-1",
        toolName: "google_workspace_call",
        title: "Grant?",
        message: "Check grant",
        risk: "plugin-tool" as const,
      },
    };

    await expect(invoke("e2e:resolve-permission-grant", input)).resolves.toEqual({ allowed: false, decisionSource: "denied_by_user", response: "deny", promptRequested: true });

    expect(deps.resolvePermissionGrant).toHaveBeenCalledWith(input);
  });
});

function registerWithFakes({
  enabled,
}: {
  enabled: boolean;
}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    isE2eEnabled: vi.fn(() => enabled),
    emitDesktopEvent: vi.fn(),
    resolvePermissionGrant: vi.fn(async () => ({ allowed: false, decisionSource: "denied_by_user", response: "deny" as const, promptRequested: true })),
  };

  registerE2eDomainIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
