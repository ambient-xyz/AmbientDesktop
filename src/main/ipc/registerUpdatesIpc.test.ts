import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  DesktopUpdateCheckReason,
  DesktopUpdateState,
} from "../../shared/desktopTypes";
import { registerUpdatesIpc, updatesIpcChannels, type RegisterUpdatesIpcDependencies } from "./registerUpdatesIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerUpdatesIpc", () => {
  it("registers the update channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...updatesIpcChannels]);
  });

  it("delegates update state actions to update service dependencies", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("updates:get-state")).resolves.toEqual(sampleUpdateState("idle"));
    await expect(invoke("updates:download")).resolves.toEqual(sampleUpdateState("downloading"));
    await expect(invoke("updates:install")).resolves.toEqual(sampleUpdateState("installing"));
    await expect(invoke("updates:dismiss")).resolves.toEqual(sampleUpdateState("idle"));

    expect(deps.getUpdateState).toHaveBeenCalledOnce();
    expect(deps.downloadUpdate).toHaveBeenCalledOnce();
    expect(deps.installUpdateAndRestart).toHaveBeenCalledOnce();
    expect(deps.dismissUpdateNotification).toHaveBeenCalledOnce();
  });

  it("checks for updates with a parsed reason and defaults to manual", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("updates:check")).resolves.toEqual(sampleUpdateState("checking"));
    await expect(invoke("updates:check", "scheduled")).resolves.toEqual(sampleUpdateState("checking"));

    expect(deps.checkForUpdates).toHaveBeenNthCalledWith(1, "manual");
    expect(deps.checkForUpdates).toHaveBeenNthCalledWith(2, "scheduled");
  });

  it("rejects invalid update check reasons before calling the dependency", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("updates:check", "later")).toThrow();
    expect(deps.checkForUpdates).not.toHaveBeenCalled();
  });
});

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterUpdatesIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    getUpdateState: vi.fn(() => sampleUpdateState("idle")),
    checkForUpdates: vi.fn(async (_reason: DesktopUpdateCheckReason) => sampleUpdateState("checking")),
    downloadUpdate: vi.fn(async () => sampleUpdateState("downloading")),
    installUpdateAndRestart: vi.fn(() => sampleUpdateState("installing")),
    dismissUpdateNotification: vi.fn(() => sampleUpdateState("idle")),
  };
  registerUpdatesIpc(deps);

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

function sampleUpdateState(status: DesktopUpdateState["status"]): DesktopUpdateState {
  return {
    enabled: true,
    status,
    currentVersion: "0.1.52",
    channel: "latest",
    canCheck: status !== "checking",
    canDownload: status === "available",
    canInstall: status === "downloaded",
  };
}
