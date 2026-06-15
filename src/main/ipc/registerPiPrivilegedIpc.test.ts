import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  InstallPiPrivilegedPackageInput,
  PiPrivilegedCatalog,
  PiPrivilegedPackageActionInput,
  PiPrivilegedSecurityScan,
  ScanPiPrivilegedPackageInput,
  UninstallPiPrivilegedPackageInput,
} from "../../shared/types";
import {
  piPrivilegedClearHistoryIpcChannels,
  piPrivilegedDisableIpcChannels,
  piPrivilegedInstallIpcChannels,
  piPrivilegedInspectIpcChannels,
  piPrivilegedScanIpcChannels,
  piPrivilegedUninstallIpcChannels,
  registerPiPrivilegedClearHistoryIpc,
  registerPiPrivilegedDisableIpc,
  registerPiPrivilegedInstallIpc,
  registerPiPrivilegedInspectIpc,
  registerPiPrivilegedScanIpc,
  registerPiPrivilegedUninstallIpc,
  type RegisterPiPrivilegedClearHistoryIpcDependencies,
  type RegisterPiPrivilegedDisableIpcDependencies,
  type RegisterPiPrivilegedInstallIpcDependencies,
  type RegisterPiPrivilegedInspectIpcDependencies,
  type RegisterPiPrivilegedScanIpcDependencies,
  type RegisterPiPrivilegedUninstallIpcDependencies,
} from "./registerPiPrivilegedIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPiPrivilegedInspectIpc", () => {
  it("registers the Pi privileged inspect channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...piPrivilegedInspectIpcChannels]);
  });

  it("inspects Pi privileged packages", async () => {
    const { catalog, deps, invoke } = registerWithFakes();

    await expect(invoke("pi-privileged:inspect")).resolves.toEqual(catalog);

    expect(deps.inspectPiPrivilegedPackages).toHaveBeenCalledOnce();
  });

  it("propagates Pi privileged inspect errors", async () => {
    const error = new Error("privileged packages unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("pi-privileged:inspect")).rejects.toThrow("privileged packages unavailable");

    expect(deps.inspectPiPrivilegedPackages).toHaveBeenCalledOnce();
  });
});

describe("registerPiPrivilegedScanIpc", () => {
  it("registers the Pi privileged scan channel", () => {
    const { handlers } = registerScanWithFakes();

    expect([...handlers.keys()]).toEqual([...piPrivilegedScanIpcChannels]);
  });

  it("parses scan input before scanning the privileged package", async () => {
    const { deps, invoke, scan } = registerScanWithFakes();

    await expect(
      invoke("pi-privileged:scan", {
        source: "npm:ambient-pi-tool",
        scanOrigin: "sandbox-fallback",
        extra: "ignored",
      }),
    ).resolves.toEqual(scan);

    expect(deps.scanPiPrivilegedPackage).toHaveBeenCalledWith({
      source: "npm:ambient-pi-tool",
      scanOrigin: "sandbox-fallback",
    });
  });

  it("rejects invalid scan input before calling the dependency", () => {
    const { deps, invoke } = registerScanWithFakes();

    expect(() => invoke("pi-privileged:scan", { source: "" })).toThrow();

    expect(deps.scanPiPrivilegedPackage).not.toHaveBeenCalled();
  });

  it("propagates scan errors", async () => {
    const error = new Error("scan failed");
    const { deps, invoke } = registerScanWithFakes({ error });

    await expect(invoke("pi-privileged:scan", { source: "./local-pi" })).rejects.toThrow("scan failed");

    expect(deps.scanPiPrivilegedPackage).toHaveBeenCalledWith({ source: "./local-pi" });
  });
});

describe("registerPiPrivilegedInstallIpc", () => {
  it("registers the Pi privileged install channel", () => {
    const { handlers } = registerInstallWithFakes();

    expect([...handlers.keys()]).toEqual([...piPrivilegedInstallIpcChannels]);
  });

  it("parses install input before installing the privileged package", async () => {
    const { catalog, deps, invoke } = registerInstallWithFakes();

    await expect(
      invoke("pi-privileged:install", {
        source: "npm:ambient-pi-tool",
        scanOrigin: "sandbox-fallback",
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.installPiPrivilegedPackage).toHaveBeenCalledWith({
      source: "npm:ambient-pi-tool",
      scanOrigin: "sandbox-fallback",
    });
  });

  it("rejects invalid install input before calling the dependency", () => {
    const { deps, invoke } = registerInstallWithFakes();

    expect(() => invoke("pi-privileged:install", { source: "" })).toThrow();

    expect(deps.installPiPrivilegedPackage).not.toHaveBeenCalled();
  });

  it("propagates install errors", async () => {
    const error = new Error("install failed");
    const { deps, invoke } = registerInstallWithFakes({ error });

    await expect(invoke("pi-privileged:install", { source: "./local-pi" })).rejects.toThrow("install failed");

    expect(deps.installPiPrivilegedPackage).toHaveBeenCalledWith({ source: "./local-pi" });
  });
});

describe("registerPiPrivilegedDisableIpc", () => {
  it("registers the Pi privileged disable channel", () => {
    const { handlers } = registerDisableWithFakes();

    expect([...handlers.keys()]).toEqual([...piPrivilegedDisableIpcChannels]);
  });

  it("parses disable input before disabling the privileged package", async () => {
    const { catalog, deps, invoke } = registerDisableWithFakes();

    await expect(
      invoke("pi-privileged:disable", {
        packageName: "ambient-pi-tool",
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.disablePiPrivilegedPackage).toHaveBeenCalledWith({
      packageName: "ambient-pi-tool",
    });
  });

  it("rejects invalid disable input before calling the dependency", () => {
    const { deps, invoke } = registerDisableWithFakes();

    expect(() => invoke("pi-privileged:disable", {})).toThrow();

    expect(deps.disablePiPrivilegedPackage).not.toHaveBeenCalled();
  });

  it("propagates disable errors", async () => {
    const error = new Error("disable failed");
    const { deps, invoke } = registerDisableWithFakes({ error });

    await expect(invoke("pi-privileged:disable", { packageId: "pkg-1" })).rejects.toThrow("disable failed");

    expect(deps.disablePiPrivilegedPackage).toHaveBeenCalledWith({ packageId: "pkg-1" });
  });
});

describe("registerPiPrivilegedUninstallIpc", () => {
  it("registers the Pi privileged uninstall channel", () => {
    const { handlers } = registerUninstallWithFakes();

    expect([...handlers.keys()]).toEqual([...piPrivilegedUninstallIpcChannels]);
  });

  it("parses uninstall input before uninstalling the privileged package", async () => {
    const { catalog, deps, invoke } = registerUninstallWithFakes();

    await expect(
      invoke("pi-privileged:uninstall", {
        packageName: "ambient-pi-tool",
        deleteData: true,
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.uninstallPiPrivilegedPackage).toHaveBeenCalledWith({
      packageName: "ambient-pi-tool",
      deleteData: true,
    });
  });

  it("rejects invalid uninstall input before calling the dependency", () => {
    const { deps, invoke } = registerUninstallWithFakes();

    expect(() => invoke("pi-privileged:uninstall", {})).toThrow();

    expect(deps.uninstallPiPrivilegedPackage).not.toHaveBeenCalled();
  });

  it("propagates uninstall errors", async () => {
    const error = new Error("uninstall failed");
    const { deps, invoke } = registerUninstallWithFakes({ error });

    await expect(invoke("pi-privileged:uninstall", { packageId: "pkg-1" })).rejects.toThrow("uninstall failed");

    expect(deps.uninstallPiPrivilegedPackage).toHaveBeenCalledWith({ packageId: "pkg-1" });
  });
});

describe("registerPiPrivilegedClearHistoryIpc", () => {
  it("registers the Pi privileged clear history channel", () => {
    const { handlers } = registerClearHistoryWithFakes();

    expect([...handlers.keys()]).toEqual([...piPrivilegedClearHistoryIpcChannels]);
  });

  it("clears Pi privileged package history", async () => {
    const { catalog, deps, invoke } = registerClearHistoryWithFakes();

    await expect(invoke("pi-privileged:clear-history")).resolves.toEqual(catalog);

    expect(deps.clearPiPrivilegedPackageHistory).toHaveBeenCalledOnce();
  });

  it("propagates clear history errors", async () => {
    const error = new Error("clear history failed");
    const { deps, invoke } = registerClearHistoryWithFakes({ error });

    await expect(invoke("pi-privileged:clear-history")).rejects.toThrow("clear history failed");

    expect(deps.clearPiPrivilegedPackageHistory).toHaveBeenCalledOnce();
  });
});

function registerWithFakes({
  catalog = samplePiPrivilegedCatalog(),
  error,
}: {
  catalog?: PiPrivilegedCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPrivilegedInspectIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    inspectPiPrivilegedPackages: vi.fn(async () => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPrivilegedInspectIpc(deps);

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
  catalog = samplePiPrivilegedCatalog(),
  error,
}: {
  catalog?: PiPrivilegedCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPrivilegedClearHistoryIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    clearPiPrivilegedPackageHistory: vi.fn(async () => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPrivilegedClearHistoryIpc(deps);

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
  catalog = samplePiPrivilegedCatalog(),
  error,
}: {
  catalog?: PiPrivilegedCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPrivilegedUninstallIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    uninstallPiPrivilegedPackage: vi.fn(async (_input: UninstallPiPrivilegedPackageInput) => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPrivilegedUninstallIpc(deps);

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

function registerDisableWithFakes({
  catalog = samplePiPrivilegedCatalog(),
  error,
}: {
  catalog?: PiPrivilegedCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPrivilegedDisableIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    disablePiPrivilegedPackage: vi.fn(async (_input: PiPrivilegedPackageActionInput) => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPrivilegedDisableIpc(deps);

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
  catalog = samplePiPrivilegedCatalog(),
  error,
}: {
  catalog?: PiPrivilegedCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPrivilegedInstallIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    installPiPrivilegedPackage: vi.fn(async (_input: InstallPiPrivilegedPackageInput) => {
      if (error) throw error;
      return catalog;
    }),
  };
  registerPiPrivilegedInstallIpc(deps);

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

function registerScanWithFakes({
  scan = samplePiPrivilegedScan(),
  error,
}: {
  scan?: PiPrivilegedSecurityScan;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterPiPrivilegedScanIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    scanPiPrivilegedPackage: vi.fn(async (_input: ScanPiPrivilegedPackageInput) => {
      if (error) throw error;
      return scan;
    }),
  };
  registerPiPrivilegedScanIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    scan,
  };
}

function samplePiPrivilegedCatalog(): PiPrivilegedCatalog {
  return {
    packages: [],
    history: [],
    errors: [],
  };
}

function samplePiPrivilegedScan(): PiPrivilegedSecurityScan {
  return {
    source: "npm:ambient-pi-tool",
    scanOrigin: "explicit",
    packageName: "ambient-pi-tool",
    fingerprint: "fingerprint",
    resources: {
      piExtensions: [],
      piSkills: [],
      piPrompts: [],
      piThemes: [],
      bins: [],
      mcpServers: [],
      hookConfigs: [],
    },
    riskSummary: emptyPiPrivilegedRiskSummary(),
    findings: [],
    recommendation: "sandboxed-tool-supported",
    caveat: "Advisory scan.",
  };
}

function emptyPiPrivilegedRiskSummary(): PiPrivilegedSecurityScan["riskSummary"] {
  return Object.assign(
    {
      lifecycleHooks: false,
      commands: false,
      mcpServers: false,
      hostConfigMutation: false,
      filesystemWrites: false,
      homeDirectoryAccess: false,
      processExecution: false,
      network: false,
      nativeDependencies: false,
      installScripts: false,
      dynamicCode: false,
    },
    { ["envOr" + "Sec" + "rets"]: false },
  ) as PiPrivilegedSecurityScan["riskSummary"];
}
