import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createDesktopIpcTrustService, isLoopbackHost } from "./desktopIpcTrustService";

function ipcEvent(input: {
  senderId?: number;
  frameUrl?: string;
  senderUrl?: string;
} = {}): IpcMainInvokeEvent {
  return {
    sender: {
      id: input.senderId ?? 1,
      getURL: () => input.senderUrl ?? "file:///app/out/renderer/index.html",
    },
    senderFrame: input.frameUrl === undefined ? undefined : { url: input.frameUrl },
  } as never;
}

function createHarness(input: {
  mainWindowId?: number;
  rendererUrl?: string;
  builtRendererUrl?: string;
} = {}) {
  let registeredListener: Parameters<IpcMain["handle"]>[1] | undefined;
  const ipcMain = {
    handle: vi.fn((_channel: string, listener: Parameters<IpcMain["handle"]>[1]) => {
      registeredListener = listener;
    }),
  };
  const service = createDesktopIpcTrustService({
    ipcMain: ipcMain as never,
    mainWindow: () => ({ webContents: { id: input.mainWindowId ?? 1 } }),
    rendererUrl: () => input.rendererUrl,
    builtRendererUrl: () => new URL(input.builtRendererUrl ?? "file:///app/out/renderer/index.html"),
  });
  return {
    ipcMain,
    invokeRegistered: (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!registeredListener) throw new Error("Missing registered listener.");
      return registeredListener(event, ...args);
    },
    service,
  };
}

describe("desktop IPC trust service", () => {
  it("identifies loopback hosts used for renderer trust", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("example.com")).toBe(false);
  });

  it("trusts only the exact built file renderer when no dev renderer URL is configured", () => {
    const { service } = createHarness();

    expect(service.isTrustedRendererUrl("file:///app/out/renderer/index.html")).toBe(true);
    expect(service.isTrustedRendererUrl("file:///app/out/renderer/other.html")).toBe(false);
    expect(service.isTrustedRendererUrl("http://localhost:5173")).toBe(false);
  });

  it("trusts loopback dev renderer origins and rejects non-loopback configured renderers", () => {
    const devHarness = createHarness({ rendererUrl: " http://localhost:5173/app " });

    expect(devHarness.service.isTrustedRendererUrl("http://localhost:5173/other")).toBe(true);
    expect(devHarness.service.isTrustedRendererUrl("http://127.0.0.1:5173/other")).toBe(false);
    expect(devHarness.service.isTrustedRendererUrl("https://example.com/app")).toBe(false);

    const untrustedDevHarness = createHarness({ rendererUrl: "https://example.com/app" });

    expect(untrustedDevHarness.service.isTrustedRendererUrl("https://example.com/app")).toBe(false);
    expect(untrustedDevHarness.service.isTrustedRendererUrl("file:///app/out/renderer/index.html")).toBe(false);
  });

  it("rejects IPC from non-main senders and untrusted renderer frames", () => {
    const { service } = createHarness();

    expect(() => service.assertTrustedMainWindowIpc(ipcEvent({ senderId: 2 }))).toThrow(
      "Main-process IPC is limited to the main application window.",
    );
    expect(() =>
      service.assertTrustedMainWindowIpc(ipcEvent({ frameUrl: "file:///tmp/other.html" }), "Test channel"),
    ).toThrow("Test channel rejected from an untrusted renderer frame.");
  });

  it("wraps ipcMain.handle with sender validation before invoking the channel listener", async () => {
    const { ipcMain, invokeRegistered, service } = createHarness();
    const listener = vi.fn(async (_event, first: string, second: string) => `${first}:${second}`);

    service.handleIpc("workspace:read-file", listener);

    expect(ipcMain.handle).toHaveBeenCalledWith("workspace:read-file", expect.any(Function));
    await expect(invokeRegistered(ipcEvent(), "a", "b")).resolves.toBe("a:b");
    expect(listener).toHaveBeenCalledWith(expect.any(Object), "a", "b");
    expect(() => invokeRegistered(ipcEvent({ senderId: 2 }), "a", "b")).toThrow(
      'IPC channel "workspace:read-file" is limited to the main application window.',
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
