import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  browserContentIpcChannels,
  browserCredentialIpcChannels,
  browserKeypressIpcChannels,
  browserLocalPreviewIpcChannels,
  browserNavigateIpcChannels,
  browserPickIpcChannels,
  browserProfileIpcChannels,
  browserRevealIpcChannels,
  browserSearchIpcChannels,
  browserSessionIpcChannels,
  browserUserActionIpcChannels,
  browserViewBoundsIpcChannels,
} from "./registerBrowserIpc";
import {
  browserDomainIpcChannels,
  registerBrowserDomainIpc,
  type BrowserDomainRuntimeHost,
} from "./registerBrowserDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerBrowserDomainIpc", () => {
  it("registers browser channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...browserDomainIpcChannels]);
    expect([...browserDomainIpcChannels]).toEqual([
      ...browserCredentialIpcChannels,
      ...browserSessionIpcChannels,
      ...browserRevealIpcChannels,
      ...browserProfileIpcChannels,
      ...browserNavigateIpcChannels,
      ...browserLocalPreviewIpcChannels,
      ...browserSearchIpcChannels,
      ...browserContentIpcChannels,
      ...browserKeypressIpcChannels,
      ...browserPickIpcChannels,
      ...browserUserActionIpcChannels,
      ...browserViewBoundsIpcChannels,
    ]);
  });

  it("keeps disabled browser credentials from reaching the active host", async () => {
    const { deps, host, invoke } = registerWithFakes({ browserLoginBrokerEnabled: false });

    expect(invoke("browser-credentials:list")).toEqual([]);
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(host.browserCredentialStore.list).not.toHaveBeenCalled();
  });

  it("routes browser navigation through loopback isolation and browser-state tracking", async () => {
    const { deps, host, invoke, pageContent } = registerWithFakes({
      isLoopbackWebUrl: (url) => url.startsWith("http://localhost:"),
    });

    await expect(invoke("browser:navigate", { url: "http://localhost:5173/app", newTab: true })).resolves.toEqual(
      pageContent,
    );

    expect(host.browserService.navigate).toHaveBeenCalledWith({
      url: "http://localhost:5173/app",
      newTab: true,
      profileMode: "isolated",
      runtime: "internal",
    });
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
  });

  it("opens local previews through the injected preview server and records the audit", async () => {
    const { deps, host, invoke, pageContent, preview } = registerWithFakes();

    await expect(invoke("browser:local-preview", { path: "reports/index.html" })).resolves.toEqual({
      preview,
      content: pageContent,
    });

    expect(deps.openBrowserLocalPreview).toHaveBeenCalledWith(host, { path: "reports/index.html" });
    expect(host.browserService.navigate).toHaveBeenCalledWith({
      url: preview.url,
      profileMode: "isolated",
      runtime: "internal",
      waitForUserAction: false,
    });
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_local_preview",
      preview.url,
      "User opened local preview for reports/index.html.",
    );
  });

  it("uses the host workspace path as the browser picker fallback target", async () => {
    const { deps, host, invoke, pickerResult } = registerWithFakes();

    await expect(invoke("browser:pick", { prompt: "Pick the report link" })).resolves.toEqual(pickerResult);

    expect(deps.emitBrowserStateForHost).toHaveBeenCalledWith(host);
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_pick",
      [host.workspacePath, "Pick the report link"].join("\n"),
      "User completed browser picker with 1 selection(s).",
    );
  });
});

function registerWithFakes(options: {
  browserLoginBrokerEnabled?: boolean;
  isLoopbackWebUrl?: (url: string) => boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const pageContent = { url: "https://example.test", title: "Example" };
  const preview = {
    id: "preview-1",
    url: "http://127.0.0.1:49152/reports/index.html",
    port: 49152,
    status: "started" as const,
    rootPath: "/workspace",
    requestedPath: "/workspace/reports/index.html",
    workspacePath: "/workspace",
    workspaceRelativeRoot: ".",
    workspaceRelativeRequestedPath: "reports/index.html",
    expiresAt: "2026-06-15T12:00:00.000Z",
  };
  const pickerResult = {
    canceled: false,
    selections: [{ text: "Report", href: "/reports/index.html" }],
  };
  const browserState = {
    active: true,
    activeTab: { url: "https://example.test" },
    pickerPrompt: "Pick something",
  };
  const host: BrowserDomainRuntimeHost = {
    workspacePath: "/workspace",
    browserCredentialStore: {
      list: vi.fn(async () => [{ id: "credential-1" }]),
      save: vi.fn(async () => [{ id: "credential-2" }]),
      delete: vi.fn(async () => []),
    },
    browserService: {
      getState: vi.fn(async () => browserState),
      start: vi.fn(async () => browserState),
      stop: vi.fn(async () => ({ active: false })),
      screenshot: vi.fn(async () => ({ imagePath: "/tmp/screenshot.png" })),
      revealActiveBrowser: vi.fn(async () => ({ status: "revealed", target: "browser", message: "Revealed" })),
      clearIsolatedBrowserProfile: vi.fn(async () => ({ isolatedProfilePath: "/profile" })),
      copyChromeProfile: vi.fn(async () => ({ copiedProfilePath: "/copy" })),
      clearCopiedChromeProfile: vi.fn(async () => ({ copiedProfilePath: "/copy" })),
      navigate: vi.fn(async () => pageContent),
      search: vi.fn(async () => [{ title: "Result" }]),
      content: vi.fn(async () => pageContent),
      keypress: vi.fn(async () => ({ ok: true })),
      pick: vi.fn(async () => pickerResult),
      cancelPick: vi.fn(async () => browserState),
      resumeUserAction: vi.fn(async () => browserState),
      cancelUserAction: vi.fn(async () => browserState),
      setViewBounds: vi.fn(),
    },
  };
  const deps = {
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    browserLoginBrokerEnabled: options.browserLoginBrokerEnabled ?? true,
    emitBrowserStateForHost: vi.fn(async () => undefined),
    isLoopbackWebUrl: vi.fn(options.isLoopbackWebUrl ?? (() => false)),
    openBrowserLocalPreview: vi.fn(async () => preview),
    recordBrowserControlAudit: vi.fn(),
    recordBrowserProfileAudit: vi.fn(),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    withBrowserState: vi.fn(async (_host, operation) => operation),
  };

  registerBrowserDomainIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return handler({} as IpcMainInvokeEvent, ...args);
    },
    pageContent,
    pickerResult,
    preview,
  };
}
