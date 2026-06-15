import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  BrowserCapabilityState,
  BrowserPageContent,
  BrowserCredentialSummary,
  BrowserKeypressResult,
  BrowserLocalPreviewSession,
  BrowserPickResult,
  BrowserRevealResult,
  BrowserScreenshotResult,
  BrowserSearchResult,
  SaveBrowserCredentialInput,
} from "../../shared/types";
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
  registerBrowserContentIpc,
  registerBrowserCredentialIpc,
  registerBrowserKeypressIpc,
  registerBrowserLocalPreviewIpc,
  registerBrowserNavigateIpc,
  registerBrowserPickIpc,
  registerBrowserProfileIpc,
  registerBrowserRevealIpc,
  registerBrowserSearchIpc,
  registerBrowserSessionIpc,
  registerBrowserUserActionIpc,
  registerBrowserViewBoundsIpc,
  type RegisterBrowserContentIpcDependencies,
  type RegisterBrowserCredentialIpcDependencies,
  type RegisterBrowserKeypressIpcDependencies,
  type RegisterBrowserLocalPreviewIpcDependencies,
  type RegisterBrowserNavigateIpcDependencies,
  type RegisterBrowserPickIpcDependencies,
  type RegisterBrowserProfileIpcDependencies,
  type RegisterBrowserRevealIpcDependencies,
  type RegisterBrowserSearchIpcDependencies,
  type RegisterBrowserSessionIpcDependencies,
  type RegisterBrowserUserActionIpcDependencies,
  type RegisterBrowserViewBoundsIpcDependencies,
} from "./registerBrowserIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

interface FakeHost {
  id: string;
}

const credential = {
  id: "credential-1",
  label: "Docs",
  origin: "https://example.com",
  username: "user@example.com",
  scope: "workspace",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies BrowserCredentialSummary;

const browserState = {
  running: true,
  profileMode: "isolated",
  runtime: "internal",
  internalAvailable: true,
  copiedProfileAvailable: false,
  chromeAvailable: false,
  browserLoginBrokerAvailable: true,
} satisfies BrowserCapabilityState;

const stoppedBrowserState = {
  ...browserState,
  running: false,
} satisfies BrowserCapabilityState;

const isolatedProfileState = {
  ...browserState,
  isolatedProfilePath: "/tmp/ambient-isolated-profile",
} satisfies BrowserCapabilityState;

const copiedProfileState = {
  ...browserState,
  sourceProfilePath: "/Users/test/Library/Application Support/Google/Chrome",
  copiedProfilePath: "/tmp/ambient-copied-profile",
  copiedProfileSourcePath: "/Users/test/Profile 1",
} satisfies BrowserCapabilityState;

const screenshotResult = {
  path: "/tmp/browser-screenshot.png",
  mimeType: "image/png",
  bytes: 128,
} satisfies BrowserScreenshotResult;

const keypressResult = {
  dispatchedCount: 1,
  keys: [
    {
      key: "Enter",
      code: "Enter",
      durationMs: 0,
    },
  ],
  focus: {
    requested: "page",
    found: true,
    tagName: "BODY",
  },
} satisfies BrowserKeypressResult;

const pageContent = {
  title: "Example",
  url: "https://example.com",
  text: "Example page text",
  links: [
    {
      text: "Docs",
      url: "https://example.com/docs",
    },
  ],
} satisfies BrowserPageContent;

const searchResults = [
  {
    title: "Example",
    url: "https://example.com",
    snippet: "Example snippet",
  },
] satisfies BrowserSearchResult[];

const localPreviewSession = {
  id: "preview-1",
  url: "http://127.0.0.1:5173/index.html",
  port: 5173,
  status: "started",
  rootPath: "/workspace",
  requestedPath: "/workspace/index.html",
  workspaceRelativeRoot: ".",
  workspaceRelativeRequestedPath: "index.html",
  expiresAt: "2026-01-01T00:10:00.000Z",
} satisfies BrowserLocalPreviewSession;

const pickResult = {
  canceled: false,
  prompt: "Pick a button",
  title: "Example",
  url: "https://example.com",
  selections: [
    {
      selector: "button.primary",
      candidates: ["button.primary", "text=Save"],
      tagName: "BUTTON",
      id: "save",
      className: "primary",
      text: "Save",
      html: "<button class=\"primary\" id=\"save\">Save</button>",
      boundingBox: {
        x: 10,
        y: 20,
        width: 100,
        height: 32,
      },
    },
  ],
} satisfies BrowserPickResult;

const canceledPickResult = {
  canceled: true,
  prompt: "Pick a button",
  selections: [],
} satisfies BrowserPickResult;

const userActionBrowserState = {
  ...browserState,
  userAction: {
    id: "action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    provider: "google",
    toolName: "browser_search",
    runtime: "internal",
    profileMode: "isolated",
    url: "https://example.com/challenge",
    title: "Challenge",
    origin: "https://example.com",
    message: "Complete the challenge.",
    startedAt: "2026-01-01T00:00:00.000Z",
    lastCheckedAt: "2026-01-01T00:00:01.000Z",
    canAutoResume: false,
  },
} satisfies BrowserCapabilityState;

const activeTabBrowserState = {
  ...browserState,
  activeTab: {
    url: "https://example.com/active",
    title: "Active",
  },
} satisfies BrowserCapabilityState;

const pickerPromptBrowserState = {
  ...browserState,
  pickerPrompt: "Pick a button",
} satisfies BrowserCapabilityState;

const revealResult = {
  runtime: "internal",
  target: "internal",
  status: "revealed",
  message: "The browser is in Ambient's inline Browser panel.",
  activeTab: {
    url: "https://example.com",
    title: "Example",
  },
} satisfies BrowserRevealResult;

const revealFallbackResult = {
  runtime: "chrome",
  target: "managed-chrome",
  status: "failed",
  message: "Could not foreground Chrome.",
  fallbackReason: "Window manager denied focus.",
} satisfies BrowserRevealResult;

describe("registerBrowserCredentialIpc", () => {
  it("registers the browser credential channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...browserCredentialIpcChannels]);
  });

  it("lists credentials only when the broker is enabled", async () => {
    const enabled = registerWithFakes();

    await expect(enabled.invoke("browser-credentials:list")).resolves.toEqual([credential]);
    expect(enabled.deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(enabled.deps.listBrowserCredentials).toHaveBeenCalledWith(enabled.host);

    const disabled = registerWithFakes({ browserLoginBrokerEnabled: false });

    await expect(disabled.invoke("browser-credentials:list")).resolves.toEqual([]);
    expect(disabled.deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(disabled.deps.listBrowserCredentials).not.toHaveBeenCalled();
  });

  it("saves credentials through the active host", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(
      invoke("browser-credentials:save", {
        id: "credential-1",
        label: "Docs",
        origin: "example.com",
        username: "user@example.com",
        password: "secret",
        scope: "global",
      }),
    ).resolves.toEqual([credential]);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.saveBrowserCredential).toHaveBeenCalledWith(host, {
      id: "credential-1",
      label: "Docs",
      origin: "example.com",
      username: "user@example.com",
      password: "secret",
      scope: "global",
    } satisfies SaveBrowserCredentialInput);
  });

  it("checks the broker before parsing saved credentials", async () => {
    const { deps, invoke } = registerWithFakes({ browserLoginBrokerEnabled: false });

    await expect(invoke("browser-credentials:save", { id: "" })).rejects.toThrow("Browser login broker is disabled");
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.saveBrowserCredential).not.toHaveBeenCalled();
  });

  it("preserves active host resolution before save validation", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("browser-credentials:save", { id: "" })).rejects.toThrow();
    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.saveBrowserCredential).not.toHaveBeenCalled();
  });

  it("deletes credentials through the active host", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(invoke("browser-credentials:delete", { id: "credential-1" })).resolves.toEqual([credential]);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.deleteBrowserCredential).toHaveBeenCalledWith(host, { id: "credential-1" });
  });

  it("checks the broker before parsing deleted credentials", async () => {
    const { deps, invoke } = registerWithFakes({ browserLoginBrokerEnabled: false });

    await expect(invoke("browser-credentials:delete", { id: "" })).rejects.toThrow("Browser login broker is disabled");
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.deleteBrowserCredential).not.toHaveBeenCalled();
  });
});

function registerWithFakes(options: { browserLoginBrokerEnabled?: boolean } = {}) {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserCredentialIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    browserLoginBrokerEnabled: options.browserLoginBrokerEnabled ?? true,
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    listBrowserCredentials: vi.fn(() => [credential]),
    saveBrowserCredential: vi.fn(() => [credential]),
    deleteBrowserCredential: vi.fn(() => [credential]),
  };
  registerBrowserCredentialIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserSessionIpc", () => {
  it("registers the browser session channels", () => {
    const { handlers } = registerSessionWithFakes();

    expect([...handlers.keys()]).toEqual([...browserSessionIpcChannels]);
  });

  it("reads browser state through the active host", async () => {
    const { deps, host, invoke } = registerSessionWithFakes();

    await expect(invoke("browser:get-state")).resolves.toEqual(browserState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.readBrowserState).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).not.toHaveBeenCalled();
  });

  it("starts the browser through the state wrapper", async () => {
    const { deps, host, invoke } = registerSessionWithFakes();

    await expect(invoke("browser:start", { profileMode: "copied", runtime: "chrome" })).resolves.toEqual(browserState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.startBrowser).toHaveBeenCalledWith(host, { profileMode: "copied", runtime: "chrome" });
    expect(deps.withBrowserState).toHaveBeenCalledOnce();
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
  });

  it("preserves active host resolution before start validation", async () => {
    const { deps, invoke } = registerSessionWithFakes();

    await expect(invoke("browser:start", { profileMode: "bad" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.startBrowser).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
  });

  it("stops the browser through the state wrapper", async () => {
    const { deps, host, invoke } = registerSessionWithFakes();

    await expect(invoke("browser:stop")).resolves.toEqual(stoppedBrowserState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.stopBrowser).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
  });

  it("captures screenshots through the state wrapper", async () => {
    const { deps, host, invoke } = registerSessionWithFakes();

    await expect(invoke("browser:screenshot", { runtime: "internal" })).resolves.toEqual(screenshotResult);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.screenshotBrowser).toHaveBeenCalledWith(host, { runtime: "internal" });
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
  });

  it("preserves active host resolution before screenshot validation", async () => {
    const { deps, invoke } = registerSessionWithFakes();

    await expect(invoke("browser:screenshot", { runtime: "bad" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.screenshotBrowser).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
  });
});

function registerSessionWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserSessionIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    readBrowserState: vi.fn(() => Promise.resolve(browserState)),
    startBrowser: vi.fn(() => Promise.resolve(browserState)),
    stopBrowser: vi.fn(() => Promise.resolve(stoppedBrowserState)),
    screenshotBrowser: vi.fn(() => Promise.resolve(screenshotResult)),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserSessionIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserRevealIpc", () => {
  it("registers the browser reveal channel", () => {
    const { handlers } = registerRevealWithFakes();

    expect([...handlers.keys()]).toEqual([...browserRevealIpcChannels]);
  });

  it("reveals the browser through the state wrapper and records the revealed tab audit", async () => {
    const { deps, host, invoke } = registerRevealWithFakes();

    await expect(invoke("browser:reveal", { userActionId: "action-1", targetId: "target-1" })).resolves.toEqual(revealResult);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.revealBrowser).toHaveBeenCalledWith(host, { userActionId: "action-1", targetId: "target-1" });
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_reveal",
      "https://example.com",
      "The browser is in Ambient's inline Browser panel.",
    );
  });

  it("records fallback reveal audit details", async () => {
    const { deps, host, invoke } = registerRevealWithFakes({ revealResult: revealFallbackResult });

    await expect(invoke("browser:reveal")).resolves.toEqual(revealFallbackResult);

    expect(deps.revealBrowser).toHaveBeenCalledWith(host, undefined);
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_reveal",
      "managed-chrome",
      "Could not foreground Chrome. Window manager denied focus.",
    );
  });

  it("preserves active host resolution before reveal validation", async () => {
    const { deps, invoke } = registerRevealWithFakes();

    await expect(invoke("browser:reveal", { userActionId: "" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.revealBrowser).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
    expect(deps.recordBrowserControlAudit).not.toHaveBeenCalled();
  });
});

function registerRevealWithFakes(options: { revealResult?: BrowserRevealResult } = {}) {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserRevealIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    revealBrowser: vi.fn(() => Promise.resolve(options.revealResult ?? revealResult)),
    recordBrowserControlAudit: vi.fn(),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserRevealIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserProfileIpc", () => {
  it("registers the browser profile channels", () => {
    const { handlers } = registerProfileWithFakes();

    expect([...handlers.keys()]).toEqual([...browserProfileIpcChannels]);
  });

  it("clears the isolated profile through the state wrapper and records the profile audit", async () => {
    const { deps, host, invoke } = registerProfileWithFakes();

    await expect(invoke("browser:clear-isolated-profile")).resolves.toEqual(isolatedProfileState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.clearIsolatedBrowserProfile).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.recordBrowserProfileAudit).toHaveBeenCalledWith(
      host,
      "/tmp/ambient-isolated-profile",
      "User cleared isolated browser profile state.",
    );
  });

  it("uses the isolated profile fallback audit detail", async () => {
    const { deps, host, invoke } = registerProfileWithFakes({ isolatedState: browserState });

    await expect(invoke("browser:clear-isolated-profile")).resolves.toEqual(browserState);

    expect(deps.recordBrowserProfileAudit).toHaveBeenCalledWith(
      host,
      "Ambient isolated browser profile",
      "User cleared isolated browser profile state.",
    );
  });

  it("copies the Chrome profile through the state wrapper and records source and copy paths", async () => {
    const { deps, host, invoke } = registerProfileWithFakes();

    await expect(invoke("browser:copy-chrome-profile")).resolves.toEqual(copiedProfileState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.copyChromeProfile).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.recordBrowserProfileAudit).toHaveBeenCalledWith(
      host,
      "Source: /Users/test/Profile 1\nCopy: /tmp/ambient-copied-profile",
      "User copied a Chrome profile into Ambient-controlled browser state.",
    );
  });

  it("uses the Chrome profile source fallback audit detail", async () => {
    const fallbackCopiedState = {
      ...browserState,
      copiedProfilePath: "/tmp/fallback-copied-profile",
    } satisfies BrowserCapabilityState;
    const { deps, host, invoke } = registerProfileWithFakes({ copiedState: fallbackCopiedState });

    await expect(invoke("browser:copy-chrome-profile")).resolves.toEqual(fallbackCopiedState);

    expect(deps.recordBrowserProfileAudit).toHaveBeenCalledWith(
      host,
      "Source: unknown\nCopy: /tmp/fallback-copied-profile",
      "User copied a Chrome profile into Ambient-controlled browser state.",
    );
  });

  it("clears the copied profile through the state wrapper and records the profile audit", async () => {
    const { deps, host, invoke } = registerProfileWithFakes();

    await expect(invoke("browser:clear-copied-profile")).resolves.toEqual(copiedProfileState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.clearCopiedChromeProfile).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.recordBrowserProfileAudit).toHaveBeenCalledWith(
      host,
      "/tmp/ambient-copied-profile",
      "User cleared the copied Chrome profile.",
    );
  });

  it("uses the copied profile fallback audit detail", async () => {
    const { deps, host, invoke } = registerProfileWithFakes({ copiedState: browserState });

    await expect(invoke("browser:clear-copied-profile")).resolves.toEqual(browserState);

    expect(deps.recordBrowserProfileAudit).toHaveBeenCalledWith(
      host,
      "Ambient browser copied profile",
      "User cleared the copied Chrome profile.",
    );
  });
});

function registerProfileWithFakes(
  options: {
    isolatedState?: BrowserCapabilityState;
    copiedState?: BrowserCapabilityState;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserProfileIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    clearIsolatedBrowserProfile: vi.fn(() => Promise.resolve(options.isolatedState ?? isolatedProfileState)),
    copyChromeProfile: vi.fn(() => Promise.resolve(options.copiedState ?? copiedProfileState)),
    clearCopiedChromeProfile: vi.fn(() => Promise.resolve(options.copiedState ?? copiedProfileState)),
    recordBrowserProfileAudit: vi.fn(),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserProfileIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserViewBoundsIpc", () => {
  it("registers the browser view bounds channel", () => {
    const { handlers } = registerViewBoundsWithFakes();

    expect([...handlers.keys()]).toEqual([...browserViewBoundsIpcChannels]);
  });

  it("sets browser view bounds through the active host", async () => {
    const { deps, host, invoke } = registerViewBoundsWithFakes();

    await expect(
      invoke("browser:set-view-bounds", {
        x: 10,
        y: 20,
        width: 800,
        height: 600,
        visible: true,
      }),
    ).resolves.toBeUndefined();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.setBrowserViewBounds).toHaveBeenCalledWith(host, {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      visible: true,
    });
  });

  it("preserves active host resolution before view bounds validation", async () => {
    const { deps, invoke } = registerViewBoundsWithFakes();

    await expect(invoke("browser:set-view-bounds", { width: -1 })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.setBrowserViewBounds).not.toHaveBeenCalled();
  });
});

function registerViewBoundsWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserViewBoundsIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    setBrowserViewBounds: vi.fn(),
  };
  registerBrowserViewBoundsIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserKeypressIpc", () => {
  it("registers the browser keypress channel", () => {
    const { handlers } = registerKeypressWithFakes();

    expect([...handlers.keys()]).toEqual([...browserKeypressIpcChannels]);
  });

  it("sends keypresses through the state wrapper", async () => {
    const { deps, host, invoke } = registerKeypressWithFakes();

    await expect(
      invoke("browser:keypress", {
        keys: [{ key: "Enter", code: "Enter", durationMs: 0 }],
        focus: "page",
        profileMode: "isolated",
        runtime: "internal",
      }),
    ).resolves.toEqual(keypressResult);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.keypressBrowser).toHaveBeenCalledWith(host, {
      keys: [{ key: "Enter", code: "Enter", durationMs: 0 }],
      focus: "page",
      profileMode: "isolated",
      runtime: "internal",
    });
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
  });

  it("preserves active host resolution before keypress validation", async () => {
    const { deps, invoke } = registerKeypressWithFakes();

    await expect(invoke("browser:keypress", { keys: [] })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.keypressBrowser).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
  });
});

function registerKeypressWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserKeypressIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    keypressBrowser: vi.fn(() => Promise.resolve(keypressResult)),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserKeypressIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserContentIpc", () => {
  it("registers the browser content channel", () => {
    const { handlers } = registerContentWithFakes();

    expect([...handlers.keys()]).toEqual([...browserContentIpcChannels]);
  });

  it("reads browser content through the state wrapper", async () => {
    const { deps, host, invoke } = registerContentWithFakes();

    await expect(
      invoke("browser:content", {
        url: "https://example.com",
        profileMode: "isolated",
        runtime: "internal",
        waitForUserAction: true,
        userActionId: "action-1",
      }),
    ).resolves.toEqual(pageContent);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.readBrowserContent).toHaveBeenCalledWith(host, {
      url: "https://example.com",
      profileMode: "isolated",
      runtime: "internal",
      waitForUserAction: true,
      userActionId: "action-1",
    });
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
  });

  it("preserves active host resolution before content validation", async () => {
    const { deps, invoke } = registerContentWithFakes();

    await expect(invoke("browser:content", { url: "" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.readBrowserContent).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
  });
});

function registerContentWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserContentIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    readBrowserContent: vi.fn(() => Promise.resolve(pageContent)),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserContentIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserSearchIpc", () => {
  it("registers the browser search channel", () => {
    const { handlers } = registerSearchWithFakes();

    expect([...handlers.keys()]).toEqual([...browserSearchIpcChannels]);
  });

  it("searches through the state wrapper", async () => {
    const { deps, host, invoke } = registerSearchWithFakes();

    await expect(
      invoke("browser:search", {
        query: "ambient docs",
        maxResults: 3,
        fetchContent: true,
        profileMode: "isolated",
        runtime: "internal",
        waitForUserAction: true,
        userActionId: "action-1",
      }),
    ).resolves.toEqual(searchResults);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.searchBrowser).toHaveBeenCalledWith(host, {
      query: "ambient docs",
      maxResults: 3,
      fetchContent: true,
      profileMode: "isolated",
      runtime: "internal",
      waitForUserAction: true,
      userActionId: "action-1",
    });
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
  });

  it("preserves active host resolution before search validation", async () => {
    const { deps, invoke } = registerSearchWithFakes();

    await expect(invoke("browser:search", { query: "" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.searchBrowser).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
  });
});

function registerSearchWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserSearchIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    searchBrowser: vi.fn(() => Promise.resolve(searchResults)),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserSearchIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserNavigateIpc", () => {
  it("registers the browser navigate channel", () => {
    const { handlers } = registerNavigateWithFakes();

    expect([...handlers.keys()]).toEqual([...browserNavigateIpcChannels]);
  });

  it("navigates through the state wrapper", async () => {
    const { deps, host, invoke } = registerNavigateWithFakes();

    await expect(
      invoke("browser:navigate", {
        url: "https://example.com",
        newTab: true,
        profileMode: "copied",
        runtime: "chrome",
        waitForUserAction: true,
        userActionId: "action-1",
      }),
    ).resolves.toEqual(pageContent);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.isLoopbackWebUrl).toHaveBeenCalledWith("https://example.com");
    expect(deps.navigateBrowser).toHaveBeenCalledWith(host, {
      url: "https://example.com",
      newTab: true,
      profileMode: "copied",
      runtime: "chrome",
      waitForUserAction: true,
      userActionId: "action-1",
    });
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
  });

  it("forces loopback web URLs into the isolated internal browser", async () => {
    const { deps, host, invoke } = registerNavigateWithFakes({ loopback: true });

    await expect(
      invoke("browser:navigate", {
        url: "http://127.0.0.1:5173",
        profileMode: "copied",
        runtime: "chrome",
      }),
    ).resolves.toEqual(pageContent);

    expect(deps.navigateBrowser).toHaveBeenCalledWith(host, {
      url: "http://127.0.0.1:5173",
      profileMode: "isolated",
      runtime: "internal",
    });
  });

  it("preserves active host resolution before navigate validation", async () => {
    const { deps, invoke } = registerNavigateWithFakes();

    await expect(invoke("browser:navigate", { url: "" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.isLoopbackWebUrl).not.toHaveBeenCalled();
    expect(deps.navigateBrowser).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
  });
});

function registerNavigateWithFakes(options: { loopback?: boolean } = {}) {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserNavigateIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    isLoopbackWebUrl: vi.fn(() => options.loopback ?? false),
    navigateBrowser: vi.fn(() => Promise.resolve(pageContent)),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserNavigateIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserLocalPreviewIpc", () => {
  it("registers the browser local-preview channel", () => {
    const { handlers } = registerLocalPreviewWithFakes();

    expect([...handlers.keys()]).toEqual([...browserLocalPreviewIpcChannels]);
  });

  it("opens a local preview, navigates to it, and records the preview audit", async () => {
    const { deps, host, invoke } = registerLocalPreviewWithFakes();

    await expect(invoke("browser:local-preview", { path: "index.html" })).resolves.toEqual({
      preview: localPreviewSession,
      content: pageContent,
    });

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.openBrowserLocalPreview).toHaveBeenCalledWith(host, { path: "index.html" });
    expect(deps.navigateBrowser).toHaveBeenCalledWith(host, {
      url: "http://127.0.0.1:5173/index.html",
      profileMode: "isolated",
      runtime: "internal",
      waitForUserAction: false,
    });
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_local_preview",
      "http://127.0.0.1:5173/index.html",
      "User opened local preview for index.html.",
    );
  });

  it("preserves active host resolution before local-preview validation", async () => {
    const { deps, invoke } = registerLocalPreviewWithFakes();

    await expect(invoke("browser:local-preview", { path: "" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.openBrowserLocalPreview).not.toHaveBeenCalled();
    expect(deps.navigateBrowser).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
    expect(deps.recordBrowserControlAudit).not.toHaveBeenCalled();
  });
});

function registerLocalPreviewWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserLocalPreviewIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    openBrowserLocalPreview: vi.fn(() => Promise.resolve(localPreviewSession)),
    navigateBrowser: vi.fn(() => Promise.resolve(pageContent)),
    recordBrowserControlAudit: vi.fn(),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserLocalPreviewIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserPickIpc", () => {
  it("registers the browser picker channels", () => {
    const { handlers } = registerPickWithFakes();

    expect([...handlers.keys()]).toEqual([...browserPickIpcChannels]);
  });

  it("starts the picker, emits current state, wraps the result, and records completed selections", async () => {
    const { deps, host, invoke } = registerPickWithFakes();

    await expect(invoke("browser:pick", { prompt: "Pick a button", profileMode: "copied", runtime: "chrome" })).resolves.toEqual(pickResult);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.pickBrowser).toHaveBeenCalledWith(host, { prompt: "Pick a button", profileMode: "copied", runtime: "chrome" });
    expect(deps.emitBrowserStateForHost).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.browserAuditFallbackTarget).not.toHaveBeenCalled();
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_pick",
      "https://example.com\nPick a button",
      "User completed browser picker with 1 selection(s).",
    );
  });

  it("passes browser user-action picker results through without recording picker audit", async () => {
    const { deps, invoke } = registerPickWithFakes({ pickResult: userActionBrowserState.userAction });

    await expect(invoke("browser:pick", { prompt: "Pick a button" })).resolves.toEqual(userActionBrowserState.userAction);

    expect(deps.emitBrowserStateForHost).toHaveBeenCalledOnce();
    expect(deps.withBrowserState).toHaveBeenCalledWith(expect.anything(), expect.any(Promise));
    expect(deps.recordBrowserControlAudit).not.toHaveBeenCalled();
  });

  it("uses the audit fallback target for canceled picker results without a URL", async () => {
    const { deps, host, invoke } = registerPickWithFakes({ pickResult: canceledPickResult });

    await expect(invoke("browser:pick", { prompt: "Pick a button" })).resolves.toEqual(canceledPickResult);

    expect(deps.browserAuditFallbackTarget).toHaveBeenCalledWith(host);
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_pick",
      "/workspace\nPick a button",
      "User canceled browser picker from the Browser panel.",
    );
  });

  it("preserves active host resolution before picker validation", async () => {
    const { deps, invoke } = registerPickWithFakes();

    await expect(invoke("browser:pick", { prompt: "" })).rejects.toThrow();

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.pickBrowser).not.toHaveBeenCalled();
    expect(deps.emitBrowserStateForHost).not.toHaveBeenCalled();
    expect(deps.withBrowserState).not.toHaveBeenCalled();
  });

  it("cancels an active picker and records the saved prompt", async () => {
    const { deps, host, invoke } = registerPickWithFakes();

    await expect(invoke("browser:cancel-pick")).resolves.toEqual(browserState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.readBrowserState).toHaveBeenCalledWith(host);
    expect(deps.cancelBrowserPick).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_pick",
      "Pick a button",
      "User requested browser picker cancellation.",
    );
  });

  it("uses the picker prompt fallback when cancellation has no saved prompt", async () => {
    const { deps, host, invoke } = registerPickWithFakes({ pickerState: browserState });

    await expect(invoke("browser:cancel-pick")).resolves.toEqual(browserState);

    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_pick",
      "Browser picker",
      "User requested browser picker cancellation.",
    );
  });
});

function registerPickWithFakes(
  options: {
    pickResult?: BrowserPickResult | NonNullable<BrowserCapabilityState["userAction"]>;
    pickerState?: BrowserCapabilityState;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserPickIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    pickBrowser: vi.fn(() => Promise.resolve(options.pickResult ?? pickResult)),
    readBrowserState: vi.fn(() => Promise.resolve(options.pickerState ?? pickerPromptBrowserState)),
    cancelBrowserPick: vi.fn(() => Promise.resolve(browserState)),
    emitBrowserStateForHost: vi.fn(() => Promise.resolve()),
    browserAuditFallbackTarget: vi.fn(() => "/workspace"),
    recordBrowserControlAudit: vi.fn(),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserPickIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

describe("registerBrowserUserActionIpc", () => {
  it("registers the browser user-action channels", () => {
    const { handlers } = registerUserActionWithFakes();

    expect([...handlers.keys()]).toEqual([...browserUserActionIpcChannels]);
  });

  it("resumes the user action through the state wrapper and records the challenge URL", async () => {
    const { deps, host, invoke } = registerUserActionWithFakes();

    await expect(invoke("browser:user-action-resume")).resolves.toEqual(userActionBrowserState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.resumeBrowserUserAction).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.browserAuditFallbackTarget).not.toHaveBeenCalled();
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_user_action",
      "https://example.com/challenge",
      "User asked Ambient to continue after completing a browser challenge.",
    );
  });

  it("cancels the user action through the state wrapper and records the active tab URL", async () => {
    const { deps, host, invoke } = registerUserActionWithFakes();

    await expect(invoke("browser:user-action-cancel")).resolves.toEqual(activeTabBrowserState);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.cancelBrowserUserAction).toHaveBeenCalledWith(host);
    expect(deps.withBrowserState).toHaveBeenCalledWith(host, expect.any(Promise));
    expect(deps.browserAuditFallbackTarget).not.toHaveBeenCalled();
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_user_action",
      "https://example.com/active",
      "User canceled a browser challenge wait.",
    );
  });

  it("uses the audit fallback target when the result has no browser URL", async () => {
    const { deps, host, invoke } = registerUserActionWithFakes({ resumeState: browserState });

    await expect(invoke("browser:user-action-resume")).resolves.toEqual(browserState);

    expect(deps.browserAuditFallbackTarget).toHaveBeenCalledWith(host);
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_user_action",
      "/workspace",
      "User asked Ambient to continue after completing a browser challenge.",
    );
  });
});

function registerUserActionWithFakes(
  options: {
    resumeState?: BrowserCapabilityState;
    cancelState?: BrowserCapabilityState;
  } = {},
) {
  const handlers = new Map<string, IpcListener>();
  const host = { id: "host-1" } satisfies FakeHost;
  const deps: RegisterBrowserUserActionIpcDependencies<FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resumeBrowserUserAction: vi.fn(() => Promise.resolve(options.resumeState ?? userActionBrowserState)),
    cancelBrowserUserAction: vi.fn(() => Promise.resolve(options.cancelState ?? activeTabBrowserState)),
    browserAuditFallbackTarget: vi.fn(() => "/workspace"),
    recordBrowserControlAudit: vi.fn(),
    withBrowserState: vi.fn((_host, operation) => operation),
  };
  registerBrowserUserActionIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
