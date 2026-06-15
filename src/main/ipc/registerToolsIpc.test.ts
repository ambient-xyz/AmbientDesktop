import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { ManagedDevServerSummary } from "../../shared/types";
import {
  registerToolsManagedDevServerStopIpc,
  registerToolsManagedDevServersIpc,
  toolsManagedDevServerStopIpcChannels,
  toolsManagedDevServersIpcChannels,
  type RegisterToolsManagedDevServerStopIpcDependencies,
  type RegisterToolsManagedDevServersIpcDependencies,
} from "./registerToolsIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerToolsManagedDevServersIpc", () => {
  it("registers the managed dev servers channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...toolsManagedDevServersIpcChannels]);
  });

  it("lists managed dev servers", async () => {
    const { deps, invoke, servers } = registerWithFakes();

    await expect(invoke("tools:managed-dev-servers")).resolves.toEqual(servers);

    expect(deps.listManagedDevServers).toHaveBeenCalledOnce();
  });

  it("propagates managed dev server list errors", async () => {
    const error = new Error("managed dev servers unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("tools:managed-dev-servers")).rejects.toThrow("managed dev servers unavailable");

    expect(deps.listManagedDevServers).toHaveBeenCalledOnce();
  });
});

describe("registerToolsManagedDevServerStopIpc", () => {
  it("registers the managed dev server stop channel", () => {
    const { handlers } = registerStopWithFakes();

    expect([...handlers.keys()]).toEqual([...toolsManagedDevServerStopIpcChannels]);
  });

  it("stops managed dev servers and returns the refreshed list", async () => {
    const { deps, invoke, servers } = registerStopWithFakes();

    await expect(invoke("tools:managed-dev-server-stop", { id: "dev-server-1", extra: true })).resolves.toEqual(
      servers,
    );

    expect(deps.stopManagedDevServer).toHaveBeenCalledWith("dev-server-1");
    expect(deps.listManagedDevServers).toHaveBeenCalledOnce();
  });

  it("rejects invalid stop input before calling dependencies", () => {
    const { deps, invoke } = registerStopWithFakes();

    expect(() => invoke("tools:managed-dev-server-stop", { id: "" })).toThrow();

    expect(deps.stopManagedDevServer).not.toHaveBeenCalled();
    expect(deps.listManagedDevServers).not.toHaveBeenCalled();
  });

  it("throws when the managed dev server is not found", () => {
    const { deps, invoke } = registerStopWithFakes({ stopped: false });

    expect(() => invoke("tools:managed-dev-server-stop", { id: "missing" })).toThrow(
      "Managed dev server was not found.",
    );

    expect(deps.stopManagedDevServer).toHaveBeenCalledWith("missing");
    expect(deps.listManagedDevServers).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  servers = sampleManagedDevServers(),
  error,
}: {
  servers?: ManagedDevServerSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    listManagedDevServers: vi.fn(async () => {
      if (error) throw error;
      return servers;
    }),
  } satisfies RegisterToolsManagedDevServersIpcDependencies;
  registerToolsManagedDevServersIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    servers,
  };
}

function registerStopWithFakes({
  servers = sampleManagedDevServers(),
  stopped = true,
}: {
  servers?: ManagedDevServerSummary[];
  stopped?: boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    stopManagedDevServer: vi.fn((_id: string) => stopped),
    listManagedDevServers: vi.fn(() => servers),
  } satisfies RegisterToolsManagedDevServerStopIpcDependencies;
  registerToolsManagedDevServerStopIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    servers,
  };
}

function sampleManagedDevServers(): ManagedDevServerSummary[] {
  return [
    {
      id: "dev-server-1",
      command: "pnpm dev",
      cwd: "/tmp/workspace",
      pid: 1234,
      startedAt: "2026-06-04T12:00:00.000Z",
      readyAt: "2026-06-04T12:00:02.000Z",
      sandboxKind: "policy-only",
      sandboxReason: "test sandbox",
    },
  ];
}
