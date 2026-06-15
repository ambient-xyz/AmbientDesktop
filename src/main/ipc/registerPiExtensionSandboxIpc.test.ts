import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  InstallPiExtensionSandboxPackageInput,
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PreviewPiExtensionSandboxPackageInput,
  UninstallPiExtensionSandboxPackageInput,
} from "../../shared/types";
import {
  piExtensionSandboxClearHistoryIpcChannels,
  piExtensionSandboxInstallIpcChannels,
  piExtensionSandboxInspectIpcChannels,
  piExtensionSandboxPreviewIpcChannels,
  piExtensionSandboxUninstallIpcChannels,
  registerPiExtensionSandboxClearHistoryIpc,
  registerPiExtensionSandboxInstallIpc,
  registerPiExtensionSandboxInspectIpc,
  registerPiExtensionSandboxPreviewIpc,
  registerPiExtensionSandboxUninstallIpc,
  type RegisterPiExtensionSandboxClearHistoryIpcDependencies,
  type RegisterPiExtensionSandboxInstallIpcDependencies,
  type RegisterPiExtensionSandboxInspectIpcDependencies,
  type RegisterPiExtensionSandboxPreviewIpcDependencies,
  type RegisterPiExtensionSandboxUninstallIpcDependencies,
} from "./registerPiExtensionSandboxIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPiExtensionSandboxInspectIpc", () => {
  it("registers the Pi extension sandbox inspect channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...piExtensionSandboxInspectIpcChannels]);
  });

  it("inspects Pi extension sandbox packages", async () => {
    const { catalog, deps, invoke } = registerWithFakes();

    await expect(invoke("pi-extension-sandbox:inspect")).resolves.toEqual(catalog);

    expect(deps.inspectPiExtensionSandboxPackages).toHaveBeenCalledOnce();
  });

  it("propagates Pi extension sandbox inspect errors", async () => {
    const error = new Error("sandbox packages unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("pi-extension-sandbox:inspect")).rejects.toThrow("sandbox packages unavailable");

    expect(deps.inspectPiExtensionSandboxPackages).toHaveBeenCalledOnce();
  });
});

describe("registerPiExtensionSandboxPreviewIpc", () => {
  it("registers the Pi extension sandbox preview channel", () => {
    const { handlers } = registerPreviewWithFakes();

    expect([...handlers.keys()]).toEqual([...piExtensionSandboxPreviewIpcChannels]);
  });

  it("parses preview input before previewing the sandbox package", async () => {
    const { deps, invoke, preview } = registerPreviewWithFakes();

    await expect(
      invoke("pi-extension-sandbox:preview", {
        source: "./local-pi-extension",
        allowedNetworkHosts: ["api.example.com"],
        extra: "ignored",
      }),
    ).resolves.toEqual(preview);

    expect(deps.previewPiExtensionSandboxPackage).toHaveBeenCalledWith({
      source: "./local-pi-extension",
      allowedNetworkHosts: ["api.example.com"],
    });
  });

  it("rejects invalid preview input before calling the dependency", () => {
    const { deps, invoke } = registerPreviewWithFakes();

    expect(() => invoke("pi-extension-sandbox:preview", { source: "", allowedNetworkHosts: [] })).toThrow();

    expect(deps.previewPiExtensionSandboxPackage).not.toHaveBeenCalled();
  });

  it("propagates preview errors", async () => {
    const error = new Error("preview failed");
    const { deps, invoke } = registerPreviewWithFakes({ error });

    await expect(invoke("pi-extension-sandbox:preview", { source: "./local-pi-extension" })).rejects.toThrow(
      "preview failed",
    );

    expect(deps.previewPiExtensionSandboxPackage).toHaveBeenCalledWith({ source: "./local-pi-extension" });
  });
});

describe("registerPiExtensionSandboxInstallIpc", () => {
  it("registers the Pi extension sandbox install channel", () => {
    const { handlers } = registerInstallWithFakes();

    expect([...handlers.keys()]).toEqual([...piExtensionSandboxInstallIpcChannels]);
  });

  it("parses install input before installing the sandbox package", async () => {
    const { catalog, deps, invoke } = registerInstallWithFakes();

    await expect(
      invoke("pi-extension-sandbox:install", {
        source: "./local-pi-extension",
        allowedNetworkHosts: ["api.example.com"],
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.installPiExtensionSandboxPackage).toHaveBeenCalledWith({
      source: "./local-pi-extension",
      allowedNetworkHosts: ["api.example.com"],
    });
  });

  it("rejects invalid install input before calling the dependency", () => {
    const { deps, invoke } = registerInstallWithFakes();

    expect(() => invoke("pi-extension-sandbox:install", { source: "", allowedNetworkHosts: [] })).toThrow();

    expect(deps.installPiExtensionSandboxPackage).not.toHaveBeenCalled();
  });

  it("propagates install errors", async () => {
    const error = new Error("install failed");
    const { deps, invoke } = registerInstallWithFakes({ error });

    await expect(invoke("pi-extension-sandbox:install", { source: "./local-pi-extension" })).rejects.toThrow(
      "install failed",
    );

    expect(deps.installPiExtensionSandboxPackage).toHaveBeenCalledWith({ source: "./local-pi-extension" });
  });
});

describe("registerPiExtensionSandboxUninstallIpc", () => {
  it("registers the Pi extension sandbox uninstall channel", () => {
    const { handlers } = registerUninstallWithFakes();

    expect([...handlers.keys()]).toEqual([...piExtensionSandboxUninstallIpcChannels]);
  });

  it("parses uninstall input before uninstalling the sandbox package", async () => {
    const { catalog, deps, invoke } = registerUninstallWithFakes();

    await expect(
      invoke("pi-extension-sandbox:uninstall", {
        packageName: "extension-pkg",
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.uninstallPiExtensionSandboxPackage).toHaveBeenCalledWith({
      packageName: "extension-pkg",
    });
  });

  it("rejects invalid uninstall input before calling the dependency", () => {
    const { deps, invoke } = registerUninstallWithFakes();

    expect(() => invoke("pi-extension-sandbox:uninstall", {})).toThrow();

    expect(deps.uninstallPiExtensionSandboxPackage).not.toHaveBeenCalled();
  });

  it("propagates uninstall errors", async () => {
    const error = new Error("uninstall failed");
    const { deps, invoke } = registerUninstallWithFakes({ error });

    await expect(invoke("pi-extension-sandbox:uninstall", { packageId: "pkg-1" })).rejects.toThrow(
      "uninstall failed",
    );

    expect(deps.uninstallPiExtensionSandboxPackage).toHaveBeenCalledWith({ packageId: "pkg-1" });
  });
});

describe("registerPiExtensionSandboxClearHistoryIpc", () => {
  it("registers the Pi extension sandbox clear-history channel", () => {
    const { handlers } = registerClearHistoryWithFakes();

    expect([...handlers.keys()]).toEqual([...piExtensionSandboxClearHistoryIpcChannels]);
  });

  it("clears Pi extension sandbox history", async () => {
    const { catalog, deps, invoke } = registerClearHistoryWithFakes();

    await expect(invoke("pi-extension-sandbox:clear-history")).resolves.toEqual(catalog);

    expect(deps.clearPiExtensionSandboxHistory).toHaveBeenCalledOnce();
  });

  it("propagates clear-history errors", async () => {
    const error = new Error("clear history failed");
    const { deps, invoke } = registerClearHistoryWithFakes({ error });

    await expect(invoke("pi-extension-sandbox:clear-history")).rejects.toThrow("clear history failed");

    expect(deps.clearPiExtensionSandboxHistory).toHaveBeenCalledOnce();
  });
});

function registerWithFakes({
  catalog = samplePiExtensionSandboxCatalog(),
  error,
}: {
  catalog?: PiExtensionSandboxCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiExtensionSandboxInspectIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    inspectPiExtensionSandboxPackages: vi.fn(async () => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiExtensionSandboxInspectIpc(deps);

  return {
    catalog,
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerClearHistoryWithFakes({
  catalog = samplePiExtensionSandboxCatalog(),
  error,
}: {
  catalog?: PiExtensionSandboxCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiExtensionSandboxClearHistoryIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    clearPiExtensionSandboxHistory: vi.fn(async () => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiExtensionSandboxClearHistoryIpc(deps);

  return {
    catalog,
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerUninstallWithFakes({
  catalog = samplePiExtensionSandboxCatalog(),
  error,
}: {
  catalog?: PiExtensionSandboxCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiExtensionSandboxUninstallIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    uninstallPiExtensionSandboxPackage: vi.fn(async (_input: UninstallPiExtensionSandboxPackageInput) => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiExtensionSandboxUninstallIpc(deps);

  return {
    catalog,
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

function registerInstallWithFakes({
  catalog = samplePiExtensionSandboxCatalog(),
  error,
}: {
  catalog?: PiExtensionSandboxCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiExtensionSandboxInstallIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    installPiExtensionSandboxPackage: vi.fn(async (_input: InstallPiExtensionSandboxPackageInput) => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiExtensionSandboxInstallIpc(deps);

  return {
    catalog,
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

function registerPreviewWithFakes({
  preview = samplePiExtensionSandboxPreview(),
  error,
}: {
  preview?: PiExtensionSandboxInstallPreview;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiExtensionSandboxPreviewIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    previewPiExtensionSandboxPackage: vi.fn(async (_input: PreviewPiExtensionSandboxPackageInput) => {
      if (error) throw error;
      return preview;
    }),
  };
  registerPiExtensionSandboxPreviewIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    preview,
  };
}

function samplePiExtensionSandboxCatalog(): PiExtensionSandboxCatalog {
  return {
    packages: [],
    history: [],
    errors: [],
  };
}

function samplePiExtensionSandboxPreview(): PiExtensionSandboxInstallPreview {
  return {
    source: "./local-pi-extension",
    allowedNetworkHosts: [],
    installable: true,
    errors: [],
  };
}
