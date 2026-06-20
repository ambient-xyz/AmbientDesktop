export interface DesktopAppLifecycleApp {
  on(event: "activate" | "before-quit" | "window-all-closed", listener: () => void): unknown;
}

export interface LocalDeepResearchStartupJob {
  jobId: string;
  status?: string;
}

export interface DesktopAppLifecycleDependencies {
  app: DesktopAppLifecycleApp;
  isDarwin: boolean;
  startDesktopUpdateService(): void;
  disposeDesktopUpdateService(): void;
  installAppMenu(): void;
  showOrCreateMainWindow(): void;
  reconcileMcpContainerRuntimeOnStartup(): Promise<unknown>;
  reconcileLocalDeepResearchInstallJob(): Promise<LocalDeepResearchStartupJob | undefined>;
  clearManagedVoiceArtifactCaches(reason: string): void;
  clearImportedWorkspaceContextCache(reason: string): void;
  closeLocalPreviewServers(): Promise<unknown>;
  stopWorkflowTraceRetentionSweep(): void;
  disposeAllProjectRuntimeHosts(reason: string): void;
  shutdownPluginMcpServers(): Promise<unknown> | undefined;
  disposeGoogleSidecarSupervisor(): void;
  denyAllPermissions(): void;
  quitApp(): void;
  warn(message: string): void;
}

export interface DesktopAppLifecycleService {
  startPostWindowStartupLifecycle(): void;
  installShutdownHandlers(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createDesktopAppLifecycleService({
  app,
  isDarwin,
  startDesktopUpdateService,
  disposeDesktopUpdateService,
  installAppMenu,
  showOrCreateMainWindow,
  reconcileMcpContainerRuntimeOnStartup,
  reconcileLocalDeepResearchInstallJob,
  clearManagedVoiceArtifactCaches,
  clearImportedWorkspaceContextCache,
  closeLocalPreviewServers,
  stopWorkflowTraceRetentionSweep,
  disposeAllProjectRuntimeHosts,
  shutdownPluginMcpServers,
  disposeGoogleSidecarSupervisor,
  denyAllPermissions,
  quitApp,
  warn,
}: DesktopAppLifecycleDependencies): DesktopAppLifecycleService {
  function startPostWindowStartupLifecycle(): void {
    startDesktopUpdateService();
    installAppMenu();
    void reconcileMcpContainerRuntimeOnStartup().catch((error) => {
      warn(`[mcp-container-runtime] startup reconciliation failed: ${errorMessage(error)}`);
    });
    void reconcileLocalDeepResearchInstallJob().then((job) => {
      if (job?.status === "interrupted") {
        warn(`[local-deep-research] startup marked install job ${job.jobId} interrupted; retry will reuse partial managed assets when possible.`);
      }
    }).catch((error) => {
      warn(`[local-deep-research] startup install reconciliation failed: ${errorMessage(error)}`);
    });
    app.on("activate", showOrCreateMainWindow);
  }

  function runCommonShutdown(disposeReason: string): void {
    clearManagedVoiceArtifactCaches("exit");
    clearImportedWorkspaceContextCache("exit");
    void closeLocalPreviewServers().catch((error) => {
      warn(`Ambient local preview shutdown failed: ${errorMessage(error)}`);
    });
    stopWorkflowTraceRetentionSweep();
    disposeAllProjectRuntimeHosts(disposeReason);
    void shutdownPluginMcpServers()?.catch((error) => {
      warn(`Ambient plugin MCP shutdown failed: ${errorMessage(error)}`);
    });
    disposeGoogleSidecarSupervisor();
  }

  function installShutdownHandlers(): void {
    app.on("window-all-closed", () => {
      runCommonShutdown("Project runtime hosts disposed because the app closed.");
      denyAllPermissions();
      if (!isDarwin) quitApp();
    });

    app.on("before-quit", () => {
      runCommonShutdown("Project runtime hosts disposed because the app quit.");
      disposeDesktopUpdateService();
    });
  }

  return {
    startPostWindowStartupLifecycle,
    installShutdownHandlers,
  };
}
