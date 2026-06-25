import {
  registerMcpContainerRuntimeDeferIpc,
  registerMcpContainerRuntimeLaunchInstallIpc,
  registerMcpContainerRuntimeLifecyclePreviewIpc,
  registerMcpContainerRuntimeLifecycleRunIpc,
  registerMcpContainerRuntimeStatusIpc,
  registerMcpDefaultCapabilityInstallIpc,
  registerMcpInstalledListIpc,
  registerMcpRegistryDescribeIpc,
  registerMcpRegistryInstallIpc,
  registerMcpRegistrySearchIpc,
  registerMcpServerUninstallIpc,
  registerMcpToolReviewAcceptIpc,
} from "./registerMcpIpc";
import type { RegisterPluginToolingDomainIpcDependencies } from "./registerPluginToolingDomainIpc";

type RegisterPluginToolingMcpInstallDependencies = Pick<
  RegisterPluginToolingDomainIpcDependencies,
  | "acceptMcpToolDescriptorReviewForDesktop"
  | "activeThreadId"
  | "ambientMcpInstallPreview"
  | "app"
  | "buildContainerRuntimeInstallPlanFromProbe"
  | "createMcpInstallCatalog"
  | "createPrivilegedActionAdapter"
  | "emitMainWindowDesktopEvent"
  | "executeContainerRuntimeManagedInstallAction"
  | "handleIpc"
  | "installMcpDefaultCapabilityForDesktop"
  | "installMcpRegistryServerForDesktop"
  | "launchContainerRuntimeInstallAction"
  | "mcpContainerRuntimeSetupStatePath"
  | "openAllowedExternalUrl"
  | "openContainerRuntimeApplication"
  | "packageJson"
  | "privilegedActionAdapterSelectionFromEnv"
  | "privilegedCredentials"
  | "previewContainerRuntimeLifecycleAction"
  | "probeAmbientMcpContainerRuntimeStatus"
  | "probeContainerRuntime"
  | "recordContainerRuntimeDeferred"
  | "recordContainerRuntimeInstallLaunched"
  | "requireActiveProjectRuntimeHost"
  | "runContainerRuntimeLifecycleAction"
  | "uninstallMcpServerForDesktop"
  | "writeContainerRuntimeLifecycleRedactedLog"
  | "writeContainerRuntimeManagedInstallRedactedLog"
  | "writePrivilegedActionRedactedLog"
>;

export function registerPluginToolingMcpInstallIpc({
  handleIpc,
  acceptMcpToolDescriptorReviewForDesktop,
  activeThreadId,
  ambientMcpInstallPreview,
  app,
  buildContainerRuntimeInstallPlanFromProbe,
  createMcpInstallCatalog,
  createPrivilegedActionAdapter,
  emitMainWindowDesktopEvent,
  executeContainerRuntimeManagedInstallAction,
  installMcpDefaultCapabilityForDesktop,
  installMcpRegistryServerForDesktop,
  launchContainerRuntimeInstallAction,
  mcpContainerRuntimeSetupStatePath,
  openAllowedExternalUrl,
  openContainerRuntimeApplication,
  packageJson,
  privilegedActionAdapterSelectionFromEnv,
  privilegedCredentials,
  previewContainerRuntimeLifecycleAction,
  probeAmbientMcpContainerRuntimeStatus,
  probeContainerRuntime,
  recordContainerRuntimeDeferred,
  recordContainerRuntimeInstallLaunched,
  requireActiveProjectRuntimeHost,
  runContainerRuntimeLifecycleAction,
  uninstallMcpServerForDesktop,
  writeContainerRuntimeLifecycleRedactedLog,
  writeContainerRuntimeManagedInstallRedactedLog,
  writePrivilegedActionRedactedLog,
}: RegisterPluginToolingMcpInstallDependencies): void {
  registerMcpRegistrySearchIpc({
    handleIpc,
    searchRegistryServers: (input) => {
      const { catalog } = createMcpInstallCatalog();
      return catalog.searchRegistryServers(input);
    },
  });

  registerMcpRegistryDescribeIpc({
    handleIpc,
    describeRegistryServer: async (input) => {
      const { catalog } = createMcpInstallCatalog();
      return ambientMcpInstallPreview(await catalog.previewRegistryInstall(input));
    },
  });

  registerMcpInstalledListIpc({
    handleIpc,
    listInstalledServers: () => {
      const { catalog } = createMcpInstallCatalog();
      return catalog.listInstalledServers();
    },
  });

  registerMcpContainerRuntimeStatusIpc({
    handleIpc,
    probeContainerRuntimeStatus: probeAmbientMcpContainerRuntimeStatus,
  });

  registerMcpContainerRuntimeLaunchInstallIpc({
    handleIpc,
    launchContainerRuntimeInstall: async (input) => {
      const { toolHive } = createMcpInstallCatalog();
      const runtimeProbe = await probeContainerRuntime({ toolHive });
      const plan = buildContainerRuntimeInstallPlanFromProbe(runtimeProbe);
      if (!plan) {
        if (runtimeProbe.status === "ready") throw new Error("The isolated MCP container runtime is already ready.");
        throw new Error(runtimeProbe.message);
      }
      return launchContainerRuntimeInstallAction(plan, {
        actionId: input.actionId,
        openExternal: (url: string) => openAllowedExternalUrl(url, "mcp-container-runtime-install"),
        openApplication: openContainerRuntimeApplication,
        executeManagedInstall: (action: any) =>
          executeContainerRuntimeManagedInstallAction(action, {
            mode: input.mode ?? "execute",
            workspacePath: app.getPath("userData"),
            ...(activeThreadId ? { threadId: activeThreadId } : {}),
            privilegedAdapter: createPrivilegedActionAdapter({
              adapter: privilegedActionAdapterSelectionFromEnv(process.env),
              credentialRehearsalAvailable: true,
            }),
            requestCredential: (request: any) => privilegedCredentials.request(request),
            writeRedactedLog: (result: any) => writePrivilegedActionRedactedLog(app.getPath("userData"), result),
            writeManagedInstallLog: (result: any) => writeContainerRuntimeManagedInstallRedactedLog(app.getPath("userData"), result),
            onProgress: (progress: any) =>
              emitMainWindowDesktopEvent({
                type: "mcp-container-runtime-install-progress",
                progress,
              }),
          }),
      }).then(async (result: any) => {
        if (!result.managedResult || result.managedResult.status === "succeeded") {
          await recordContainerRuntimeInstallLaunched(mcpContainerRuntimeSetupStatePath(), result.action, {
            appVersion: packageJson.version,
          });
        }
        return result;
      });
    },
  });

  registerMcpContainerRuntimeDeferIpc({
    handleIpc,
    deferContainerRuntimeSetup: async () => {
      await recordContainerRuntimeDeferred(mcpContainerRuntimeSetupStatePath(), {
        appVersion: packageJson.version,
      });
      return probeAmbientMcpContainerRuntimeStatus();
    },
  });

  registerMcpContainerRuntimeLifecyclePreviewIpc({
    handleIpc,
    previewContainerRuntimeLifecycle: async (input) => {
      const status = await probeAmbientMcpContainerRuntimeStatus();
      return previewContainerRuntimeLifecycleAction({
        action: input.action,
        runtime: input.runtime,
        status,
      });
    },
  });

  registerMcpContainerRuntimeLifecycleRunIpc({
    handleIpc,
    runContainerRuntimeLifecycle: async (input) => {
      const result = await runContainerRuntimeLifecycleAction(input, {
        getStatus: probeAmbientMcpContainerRuntimeStatus,
        onProgress: (progress: any) =>
          emitMainWindowDesktopEvent({
            type: "mcp-container-runtime-lifecycle-progress",
            progress,
          }),
      });
      const logPath = await writeContainerRuntimeLifecycleRedactedLog(app.getPath("userData"), result);
      return {
        ...result,
        logPath,
      };
    },
  });

  registerMcpDefaultCapabilityInstallIpc({
    handleIpc,
    installDefaultCapability: (input) => installMcpDefaultCapabilityForDesktop(requireActiveProjectRuntimeHost(), input),
  });

  registerMcpRegistryInstallIpc({
    handleIpc,
    installRegistryServer: (input) => installMcpRegistryServerForDesktop(requireActiveProjectRuntimeHost(), input),
  });

  registerMcpServerUninstallIpc({
    handleIpc,
    uninstallServer: (input) => uninstallMcpServerForDesktop(requireActiveProjectRuntimeHost(), input),
  });

  registerMcpToolReviewAcceptIpc({
    handleIpc,
    acceptToolReview: (input) => acceptMcpToolDescriptorReviewForDesktop(requireActiveProjectRuntimeHost(), input),
  });
}
