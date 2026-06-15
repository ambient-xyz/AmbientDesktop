import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  linksOpenExternalIpcChannels,
  registerLinksOpenExternalIpc,
  type RegisterLinksOpenExternalIpcDependencies,
} from "./registerLinksIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerLinksOpenExternalIpc", () => {
  it("registers the links open external channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...linksOpenExternalIpcChannels]);
  });

  it("routes Google Workspace setup URLs to the Google Workspace opener", async () => {
    const { deps, invoke } = registerWithFakes({ googleWorkspaceSetup: true });

    await expect(invoke("links:open-external", " https://accounts.google.com/o/oauth2/v2/auth ")).resolves.toBeUndefined();

    expect(deps.parseExternalOpenUrl).toHaveBeenCalledWith(" https://accounts.google.com/o/oauth2/v2/auth ");
    expect(deps.openGoogleWorkspaceUrl).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth");
    expect(deps.isLoopbackWebUrl).not.toHaveBeenCalled();
    expect(deps.openRendererLocalUrlInAmbientBrowser).not.toHaveBeenCalled();
    expect(deps.openAllowedExternalUrl).not.toHaveBeenCalled();
  });

  it("routes loopback URLs to the Ambient browser", async () => {
    const { deps, invoke } = registerWithFakes({ loopback: true });

    await expect(invoke("links:open-external", "http://localhost:5173/path")).resolves.toBeUndefined();

    expect(deps.isGoogleWorkspaceSetupUrl).toHaveBeenCalledWith("http://localhost:5173/path");
    expect(deps.isLoopbackWebUrl).toHaveBeenCalledWith("http://localhost:5173/path");
    expect(deps.openRendererLocalUrlInAmbientBrowser).toHaveBeenCalledWith("http://localhost:5173/path");
    expect(deps.openGoogleWorkspaceUrl).not.toHaveBeenCalled();
    expect(deps.openAllowedExternalUrl).not.toHaveBeenCalled();
  });

  it("opens ordinary external URLs through the external URL policy", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("links:open-external", "https://example.com/page")).resolves.toBeUndefined();

    expect(deps.openAllowedExternalUrl).toHaveBeenCalledWith("https://example.com/page", "renderer-link");
    expect(deps.openGoogleWorkspaceUrl).not.toHaveBeenCalled();
    expect(deps.openRendererLocalUrlInAmbientBrowser).not.toHaveBeenCalled();
  });

  it("rejects non-string link input before parsing", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("links:open-external", 42)).rejects.toThrow();

    expect(deps.parseExternalOpenUrl).not.toHaveBeenCalled();
    expect(deps.isGoogleWorkspaceSetupUrl).not.toHaveBeenCalled();
    expect(deps.isLoopbackWebUrl).not.toHaveBeenCalled();
    expect(deps.openAllowedExternalUrl).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  googleWorkspaceSetup = false,
  loopback = false,
}: {
  googleWorkspaceSetup?: boolean;
  loopback?: boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterLinksOpenExternalIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    parseExternalOpenUrl: vi.fn((raw: string) => raw.trim()),
    isGoogleWorkspaceSetupUrl: vi.fn(() => googleWorkspaceSetup),
    openGoogleWorkspaceUrl: vi.fn(async () => undefined),
    isLoopbackWebUrl: vi.fn(() => loopback),
    openRendererLocalUrlInAmbientBrowser: vi.fn(async () => undefined),
    openAllowedExternalUrl: vi.fn(async () => undefined),
  };
  registerLinksOpenExternalIpc(deps);

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
