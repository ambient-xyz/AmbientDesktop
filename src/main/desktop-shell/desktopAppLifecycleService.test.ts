import { describe, expect, it, vi } from "vitest";
import { createDesktopAppLifecycleService, type DesktopAppLifecycleApp } from "./desktopAppLifecycleService";

function flushPromises(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

function createAppHarness() {
  const handlers = new Map<string, () => void>();
  const app: DesktopAppLifecycleApp = {
    on: vi.fn((event: string, listener: () => void) => {
      handlers.set(event, listener);
    }),
  };
  return { app, handlers };
}

function createService(input: {
  isDarwin?: boolean;
  reconcileMcpContainerRuntimeOnStartup?: () => Promise<unknown>;
  reconcileLocalDeepResearchInstallJob?: () => Promise<{ jobId: string; status?: string } | undefined>;
  closeLocalPreviewServers?: () => Promise<unknown>;
  shutdownPluginMcpServers?: () => Promise<unknown> | undefined;
} = {}) {
  const { app, handlers } = createAppHarness();
  const deps = {
    app,
    isDarwin: input.isDarwin ?? false,
    startDesktopUpdateService: vi.fn(),
    disposeDesktopUpdateService: vi.fn(),
    installAppMenu: vi.fn(),
    showOrCreateMainWindow: vi.fn(),
    reconcileMcpContainerRuntimeOnStartup: input.reconcileMcpContainerRuntimeOnStartup ?? vi.fn(async () => undefined),
    reconcileLocalDeepResearchInstallJob: input.reconcileLocalDeepResearchInstallJob ?? vi.fn(async () => undefined),
    clearManagedVoiceArtifactCaches: vi.fn(),
    clearImportedWorkspaceContextCache: vi.fn(),
    closeLocalPreviewServers: input.closeLocalPreviewServers ?? vi.fn(async () => undefined),
    stopWorkflowTraceRetentionSweep: vi.fn(),
    disposeAllProjectRuntimeHosts: vi.fn(),
    shutdownPluginMcpServers: input.shutdownPluginMcpServers ?? vi.fn(async () => undefined),
    disposeGoogleSidecarSupervisor: vi.fn(),
    denyAllPermissions: vi.fn(),
    quitApp: vi.fn(),
    warn: vi.fn(),
  };
  const service = createDesktopAppLifecycleService(deps);
  return { deps, handlers, service };
}

describe("createDesktopAppLifecycleService", () => {
  it("starts post-window services and installs the activate handler", async () => {
    const { deps, handlers, service } = createService({
      reconcileLocalDeepResearchInstallJob: vi.fn(async () => ({ jobId: "job-1", status: "interrupted" })),
    });

    service.startPostWindowStartupLifecycle();
    await flushPromises();

    expect(deps.startDesktopUpdateService).toHaveBeenCalledTimes(1);
    expect(deps.installAppMenu).toHaveBeenCalledTimes(1);
    expect(deps.reconcileMcpContainerRuntimeOnStartup).toHaveBeenCalledTimes(1);
    expect(deps.reconcileLocalDeepResearchInstallJob).toHaveBeenCalledTimes(1);
    expect(deps.warn).toHaveBeenCalledWith(
      "[local-deep-research] startup marked install job job-1 interrupted; retry will reuse partial managed assets when possible.",
    );
    expect(deps.app.on).toHaveBeenCalledWith("activate", deps.showOrCreateMainWindow);

    handlers.get("activate")?.();
    expect(deps.showOrCreateMainWindow).toHaveBeenCalledTimes(1);
  });

  it("warns when startup reconciliation tasks fail", async () => {
    const { deps, service } = createService({
      reconcileMcpContainerRuntimeOnStartup: vi.fn(async () => {
        throw new Error("container unavailable");
      }),
      reconcileLocalDeepResearchInstallJob: vi.fn(async () => {
        throw new Error("install state unreadable");
      }),
    });

    service.startPostWindowStartupLifecycle();
    await flushPromises();
    await flushPromises();

    expect(deps.warn).toHaveBeenCalledWith("[mcp-container-runtime] startup reconciliation failed: container unavailable");
    expect(deps.warn).toHaveBeenCalledWith("[local-deep-research] startup install reconciliation failed: install state unreadable");
  });

  it("cleans runtime state and quits on non-Darwin window close", async () => {
    const { deps, handlers, service } = createService({
      closeLocalPreviewServers: vi.fn(async () => {
        throw new Error("preview failed");
      }),
      shutdownPluginMcpServers: vi.fn(async () => {
        throw new Error("plugin failed");
      }),
    });
    service.installShutdownHandlers();

    handlers.get("window-all-closed")?.();
    await flushPromises();

    expect(deps.clearManagedVoiceArtifactCaches).toHaveBeenCalledWith("exit");
    expect(deps.clearImportedWorkspaceContextCache).toHaveBeenCalledWith("exit");
    expect(deps.closeLocalPreviewServers).toHaveBeenCalledTimes(1);
    expect(deps.stopWorkflowTraceRetentionSweep).toHaveBeenCalledTimes(1);
    expect(deps.disposeAllProjectRuntimeHosts).toHaveBeenCalledWith("Project runtime hosts disposed because the app closed.");
    expect(deps.shutdownPluginMcpServers).toHaveBeenCalledTimes(1);
    expect(deps.disposeGoogleSidecarSupervisor).toHaveBeenCalledTimes(1);
    expect(deps.denyAllPermissions).toHaveBeenCalledTimes(1);
    expect(deps.quitApp).toHaveBeenCalledTimes(1);
    expect(deps.disposeDesktopUpdateService).not.toHaveBeenCalled();
    expect(deps.warn).toHaveBeenCalledWith("Ambient local preview shutdown failed: preview failed");
    expect(deps.warn).toHaveBeenCalledWith("Ambient plugin MCP shutdown failed: plugin failed");
  });

  it("keeps the app open on Darwin after all windows close", () => {
    const { deps, handlers, service } = createService({ isDarwin: true });
    service.installShutdownHandlers();

    handlers.get("window-all-closed")?.();

    expect(deps.denyAllPermissions).toHaveBeenCalledTimes(1);
    expect(deps.quitApp).not.toHaveBeenCalled();
  });

  it("disposes update service during before-quit cleanup", () => {
    const { deps, handlers, service } = createService();
    service.installShutdownHandlers();

    handlers.get("before-quit")?.();

    expect(deps.disposeAllProjectRuntimeHosts).toHaveBeenCalledWith("Project runtime hosts disposed because the app quit.");
    expect(deps.disposeDesktopUpdateService).toHaveBeenCalledTimes(1);
    expect(deps.denyAllPermissions).not.toHaveBeenCalled();
    expect(deps.quitApp).not.toHaveBeenCalled();
  });
});
