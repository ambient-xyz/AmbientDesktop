import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  piToolingDomainIpcChannels,
  registerPiToolingDomainIpc,
  type RegisterPiToolingDomainIpcDependencies,
} from "./registerPiToolingDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPiToolingDomainIpc", () => {
  it("registers the Pi tooling domain channel table", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...piToolingDomainIpcChannels]);
  });

  it("routes Pi package inspection through the active project plugin state", async () => {
    const { catalog, deps, host, pluginStateReader, invoke } = registerWithFakes();

    await expect(invoke("pi-packages:inspect")).resolves.toBe(catalog);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.pluginStateReaderForStore).toHaveBeenCalledWith(host.store);
    expect(deps.pluginHost.inspectPiPackages).toHaveBeenCalledWith(host.workspacePath, pluginStateReader);
  });

  it("keeps Pi package install permission and runtime-reset wiring intact", async () => {
    const { catalog, deps, host, invoke, pluginStateReader } = registerWithFakes();

    await expect(invoke("pi-packages:install", { source: "./local-pi", scope: "workspace" })).resolves.toBe(catalog);

    expect(deps.pluginHost.previewPiPackageInstall).toHaveBeenCalledWith(host.workspacePath, {
      source: "./local-pi",
      scope: "workspace",
    });
    expect(deps.permissions.request).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      toolName: "pi_package_install",
      risk: "plugin-tool",
    }));
    expect(deps.pluginHost.installPiPackage).toHaveBeenCalledWith(
      host.workspacePath,
      { source: "./local-pi", scope: "workspace" },
      pluginStateReader,
    );
    expect(deps.resetProjectRuntimeAndPluginServers).toHaveBeenCalledWith(host);
  });

  it("keeps sandboxed Pi extension install permission audit wiring intact", async () => {
    const { catalog, deps, host, invoke } = registerWithFakes();

    await expect(invoke("pi-extension-sandbox:install", { source: "./sandboxed-pi" })).resolves.toBe(catalog);

    expect(deps.previewPiExtensionSandboxInstall).toHaveBeenCalledWith(host.workspacePath, {
      source: "./sandboxed-pi",
    });
    expect(deps.requestPermissionWithGrantRegistry).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        toolName: "ambient_pi_extension_install_sandboxed",
        risk: "plugin-tool",
      }),
      expect.objectContaining({
        store: host.store,
        workspacePath: host.workspacePath,
      }),
    );
    expect(host.store.addPermissionAudit).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "ambient_pi_extension_install_sandboxed",
      decision: "allowed",
      grantId: "grant-1",
    }));
    expect(deps.installPiExtensionSandboxPackage).toHaveBeenCalledWith(host.workspacePath, {
      source: "./sandboxed-pi",
    });
    expect(deps.emitPermissionAuditCreated).toHaveBeenCalledWith({ id: "audit-1" }, host.workspacePath);
    expect(deps.emitPluginCatalogUpdated).toHaveBeenCalledWith(host.workspacePath);
  });

  it("keeps privileged Pi install full-access audit wiring intact", async () => {
    const { catalog, deps, host, invoke } = registerWithFakes({ permissionMode: "full-access" });

    await expect(invoke("pi-privileged:install", { source: "./privileged-pi" })).resolves.toBe(catalog);

    expect(deps.requestPermissionWithGrantRegistry).not.toHaveBeenCalled();
    expect(deps.scanPiPrivilegedPackage).toHaveBeenCalledWith({ source: "./privileged-pi" });
    expect(host.store.addPermissionAudit).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "pi_privileged_install",
      decision: "allowed",
      decisionSource: "allowed_by_full_access",
    }));
    expect(deps.installPiPrivilegedPackage).toHaveBeenCalledWith(host.workspacePath, {
      source: "./privileged-pi",
      reviewedScan: expect.objectContaining({
        packageName: "privileged-pi",
        fingerprint: "fingerprint-1",
      }),
    });
    expect(deps.resetProjectRuntimeAndPluginServers).toHaveBeenCalledWith(host);
    expect(deps.emitPluginCatalogUpdated).toHaveBeenCalledWith(host.workspacePath);
  });
});

function registerWithFakes(options: { permissionMode?: string } = {}): {
  catalog: { packages: unknown[]; history: unknown[] };
  deps: RegisterPiToolingDomainIpcDependencies;
  handlers: Map<string, IpcListener>;
  host: {
    workspacePath: string;
    store: {
      addPermissionAudit: ReturnType<typeof vi.fn>;
      clearPiPackageEnabled: ReturnType<typeof vi.fn>;
      getThread: ReturnType<typeof vi.fn>;
      setPiPackageEnabled: ReturnType<typeof vi.fn>;
    };
  };
  invoke(channel: string, raw?: unknown): Promise<unknown>;
  pluginStateReader: { plugins: unknown[] };
} {
  const handlers = new Map<string, IpcListener>();
  const catalog = { packages: [], history: [] };
  const pluginStateReader = { plugins: [] };
  const thread = {
    id: "thread-1",
    permissionMode: options.permissionMode ?? "workspace",
    workspacePath: "/tmp/workspace",
  };
  const host = {
    workspacePath: "/tmp/workspace",
    store: {
      addPermissionAudit: vi.fn(() => ({ id: "audit-1" })),
      clearPiPackageEnabled: vi.fn(),
      getThread: vi.fn(() => thread),
      setPiPackageEnabled: vi.fn(),
    },
  };
  const deps: RegisterPiToolingDomainIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    activeThreadIdForHost: vi.fn(() => "thread-1"),
    clearPiExtensionSandboxHistory: vi.fn(() => catalog),
    clearPiPrivilegedPackageHistory: vi.fn(() => catalog),
    disablePiPrivilegedPackage: vi.fn(() => ({
      id: "privileged-1",
      packageName: "privileged-pi",
      scan: { scanOrigin: "explicit" },
      source: "./privileged-pi",
    })),
    discoverPiExtensionSandboxPackages: vi.fn(() => catalog),
    discoverPiPrivilegedPackages: vi.fn(() => catalog),
    emitPermissionAuditCreated: vi.fn(),
    emitPluginCatalogUpdated: vi.fn(),
    formatPiExtensionSandboxInstallApprovalDetail: vi.fn(() => "sandbox detail"),
    formatPiPrivilegedInstallApprovalDetail: vi.fn(() => "privileged detail"),
    formatPiResourceCountsForPermission: vi.fn(() => "0 resources"),
    installPiExtensionSandboxPackage: vi.fn(() => catalog),
    installPiPrivilegedPackage: vi.fn(() => catalog),
    permissionGrantTargetHash: vi.fn(() => "grant-hash"),
    permissions: { request: vi.fn(() => ({ allowed: true })) },
    pluginHost: {
      inspectPiPackages: vi.fn(() => catalog),
      installPiPackage: vi.fn(() => catalog),
      previewPiPackageInstall: vi.fn(() => ({
        installable: true,
        errors: [],
        normalizedSource: "./local-pi",
        notes: [],
        scope: "workspace",
      })),
      uninstallPiPackage: vi.fn(() => catalog),
      validatePiPackageEnablement: vi.fn(),
    },
    pluginStateReaderForStore: vi.fn(() => pluginStateReader),
    previewPiExtensionSandboxInstall: vi.fn(() => ({
      errors: [],
      installable: true,
      packageName: "sandboxed-pi",
    })),
    requestPermissionWithGrantRegistry: vi.fn(() => ({
      allowed: true,
      decisionSource: "user",
      grant: { id: "grant-1" },
    })),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resetProjectRuntimeAndPluginServers: vi.fn(),
    revokePluginGrantsForLabels: vi.fn(),
    scanPiPrivilegedPackage: vi.fn(() => ({
      fingerprint: "fingerprint-1",
      packageName: "privileged-pi",
    })),
    uninstallPiExtensionSandboxPackage: vi.fn(() => ({
      catalog,
      removed: {
        id: "sandbox-1",
        name: "sandboxed-pi",
        rootPath: "/tmp/workspace/.ambient/pi-extension-sandboxes/sandboxed-pi",
        source: "./sandboxed-pi",
      },
    })),
    uninstallPiPrivilegedPackage: vi.fn(() => ({
      catalog,
      manualCleanup: [],
      removed: {
        id: "privileged-1",
        packageName: "privileged-pi",
        rootPath: "/tmp/workspace/.ambient/pi-privileged-installs/privileged-pi",
        scan: { scanOrigin: "explicit" },
        source: "./privileged-pi",
      },
    })),
  };

  registerPiToolingDomainIpc(deps);

  return {
    catalog,
    deps,
    handlers,
    host,
    invoke: (channel, raw) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
    pluginStateReader,
  };
}
