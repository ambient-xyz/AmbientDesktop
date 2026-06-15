import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  InstallPiPackageInput,
  PiPackageCatalog,
  PiPackageInstallPreview,
  PreviewPiPackageInstallInput,
  SetPiPackageEnabledInput,
  UninstallPiPackageInput,
} from "../../shared/types";
import {
  piPackagesInspectIpcChannels,
  piPackagesInstallIpcChannels,
  piPackagesPreviewInstallIpcChannels,
  piPackagesSetEnabledIpcChannels,
  piPackagesUninstallIpcChannels,
  registerPiPackagesInspectIpc,
  registerPiPackagesInstallIpc,
  registerPiPackagesPreviewInstallIpc,
  registerPiPackagesSetEnabledIpc,
  registerPiPackagesUninstallIpc,
  type RegisterPiPackagesInspectIpcDependencies,
  type RegisterPiPackagesInstallIpcDependencies,
  type RegisterPiPackagesPreviewInstallIpcDependencies,
  type RegisterPiPackagesSetEnabledIpcDependencies,
  type RegisterPiPackagesUninstallIpcDependencies,
} from "./registerPiPackageIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPiPackagesInspectIpc", () => {
  it("registers the Pi package inspect channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...piPackagesInspectIpcChannels]);
  });

  it("inspects Pi packages", async () => {
    const { catalog, deps, invoke } = registerWithFakes();

    await expect(invoke("pi-packages:inspect")).resolves.toEqual(catalog);

    expect(deps.inspectPiPackages).toHaveBeenCalledOnce();
  });

  it("propagates Pi package inspect errors", async () => {
    const error = new Error("Pi packages unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("pi-packages:inspect")).rejects.toThrow("Pi packages unavailable");

    expect(deps.inspectPiPackages).toHaveBeenCalledOnce();
  });
});

describe("registerPiPackagesPreviewInstallIpc", () => {
  it("registers the Pi package preview install channel", () => {
    const { handlers } = registerPreviewInstallWithFakes();

    expect([...handlers.keys()]).toEqual([...piPackagesPreviewInstallIpcChannels]);
  });

  it("parses preview install input before previewing the package", async () => {
    const { deps, invoke, preview } = registerPreviewInstallWithFakes();

    await expect(
      invoke("pi-packages:preview-install", {
        source: "./local-pi",
        scope: "workspace",
        extra: "ignored",
      }),
    ).resolves.toEqual(preview);

    expect(deps.previewPiPackageInstall).toHaveBeenCalledWith({
      source: "./local-pi",
      scope: "workspace",
    });
  });

  it("rejects invalid preview install input before calling the dependency", () => {
    const { deps, invoke } = registerPreviewInstallWithFakes();

    expect(() => invoke("pi-packages:preview-install", { source: "", scope: "workspace" })).toThrow();

    expect(deps.previewPiPackageInstall).not.toHaveBeenCalled();
  });

  it("propagates preview install errors", async () => {
    const error = new Error("preview failed");
    const { deps, invoke } = registerPreviewInstallWithFakes({ error });

    await expect(invoke("pi-packages:preview-install", { source: "./local-pi" })).rejects.toThrow("preview failed");

    expect(deps.previewPiPackageInstall).toHaveBeenCalledWith({ source: "./local-pi" });
  });
});

describe("registerPiPackagesInstallIpc", () => {
  it("registers the Pi package install channel", () => {
    const { handlers } = registerInstallWithFakes();

    expect([...handlers.keys()]).toEqual([...piPackagesInstallIpcChannels]);
  });

  it("parses install input before installing the package", async () => {
    const { catalog, deps, invoke } = registerInstallWithFakes();

    await expect(
      invoke("pi-packages:install", {
        source: "./local-pi",
        scope: "workspace",
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.installPiPackage).toHaveBeenCalledWith({
      source: "./local-pi",
      scope: "workspace",
    });
  });

  it("rejects invalid install input before calling the dependency", () => {
    const { deps, invoke } = registerInstallWithFakes();

    expect(() => invoke("pi-packages:install", { source: "", scope: "workspace" })).toThrow();

    expect(deps.installPiPackage).not.toHaveBeenCalled();
  });

  it("propagates install errors", async () => {
    const error = new Error("install failed");
    const { deps, invoke } = registerInstallWithFakes({ error });

    await expect(invoke("pi-packages:install", { source: "./local-pi" })).rejects.toThrow("install failed");

    expect(deps.installPiPackage).toHaveBeenCalledWith({ source: "./local-pi" });
  });
});

describe("registerPiPackagesUninstallIpc", () => {
  it("registers the Pi package uninstall channel", () => {
    const { handlers } = registerUninstallWithFakes();

    expect([...handlers.keys()]).toEqual([...piPackagesUninstallIpcChannels]);
  });

  it("parses uninstall input before uninstalling the package", async () => {
    const { catalog, deps, invoke } = registerUninstallWithFakes();

    await expect(
      invoke("pi-packages:uninstall", {
        packageId: "pkg-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.uninstallPiPackage).toHaveBeenCalledWith({
      packageId: "pkg-1",
    });
  });

  it("rejects invalid uninstall input before calling the dependency", () => {
    const { deps, invoke } = registerUninstallWithFakes();

    expect(() => invoke("pi-packages:uninstall", { packageId: "" })).toThrow();

    expect(deps.uninstallPiPackage).not.toHaveBeenCalled();
  });

  it("propagates uninstall errors", async () => {
    const error = new Error("uninstall failed");
    const { deps, invoke } = registerUninstallWithFakes({ error });

    await expect(invoke("pi-packages:uninstall", { packageId: "pkg-1" })).rejects.toThrow("uninstall failed");

    expect(deps.uninstallPiPackage).toHaveBeenCalledWith({ packageId: "pkg-1" });
  });
});

describe("registerPiPackagesSetEnabledIpc", () => {
  it("registers the Pi package set-enabled channel", () => {
    const { handlers } = registerSetEnabledWithFakes();

    expect([...handlers.keys()]).toEqual([...piPackagesSetEnabledIpcChannels]);
  });

  it("parses set-enabled input before updating package state", async () => {
    const { catalog, deps, invoke } = registerSetEnabledWithFakes();

    await expect(
      invoke("pi-packages:set-enabled", {
        packageId: "pkg-1",
        enabled: true,
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.setPiPackageEnabled).toHaveBeenCalledWith({
      packageId: "pkg-1",
      enabled: true,
    });
  });

  it("rejects invalid set-enabled input before calling the dependency", () => {
    const { deps, invoke } = registerSetEnabledWithFakes();

    expect(() => invoke("pi-packages:set-enabled", { packageId: "", enabled: true })).toThrow();

    expect(deps.setPiPackageEnabled).not.toHaveBeenCalled();
  });

  it("propagates set-enabled errors", async () => {
    const error = new Error("set enabled failed");
    const { deps, invoke } = registerSetEnabledWithFakes({ error });

    await expect(invoke("pi-packages:set-enabled", { packageId: "pkg-1", enabled: false })).rejects.toThrow(
      "set enabled failed",
    );

    expect(deps.setPiPackageEnabled).toHaveBeenCalledWith({ packageId: "pkg-1", enabled: false });
  });
});

function registerWithFakes({
  catalog = samplePiPackageCatalog(),
  error,
}: {
  catalog?: PiPackageCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPackagesInspectIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    inspectPiPackages: vi.fn(async () => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPackagesInspectIpc(deps);

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

function registerPreviewInstallWithFakes({
  preview = samplePiPackageInstallPreview(),
  error,
}: {
  preview?: PiPackageInstallPreview;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPackagesPreviewInstallIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    previewPiPackageInstall: vi.fn(async (_input: PreviewPiPackageInstallInput) => {
      if (error) throw error;
      return preview;
    }),
  };
  registerPiPackagesPreviewInstallIpc(deps);

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

function registerInstallWithFakes({
  catalog = samplePiPackageCatalog(),
  error,
}: {
  catalog?: PiPackageCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPackagesInstallIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    installPiPackage: vi.fn(async (_input: InstallPiPackageInput) => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPackagesInstallIpc(deps);

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

function registerUninstallWithFakes({
  catalog = samplePiPackageCatalog(),
  error,
}: {
  catalog?: PiPackageCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPackagesUninstallIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    uninstallPiPackage: vi.fn(async (_input: UninstallPiPackageInput) => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPackagesUninstallIpc(deps);

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

function registerSetEnabledWithFakes({
  catalog = samplePiPackageCatalog(),
  error,
}: {
  catalog?: PiPackageCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPackagesSetEnabledIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    setPiPackageEnabled: vi.fn(async (_input: SetPiPackageEnabledInput) => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPackagesSetEnabledIpc(deps);

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

function samplePiPackageCatalog(): PiPackageCatalog {
  return {
    packages: [],
    errors: [],
    sourceNotes: [],
  };
}

function samplePiPackageInstallPreview(): PiPackageInstallPreview {
  return {
    source: "./local-pi",
    normalizedSource: "./local-pi",
    scope: "workspace",
    installable: true,
    errors: [],
    notes: [],
  };
}
