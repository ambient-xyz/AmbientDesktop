import { useEffect, useRef, useState } from "react";

import type {
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpInstalledServerSummary,
  AmbientMcpInstallPreview,
  AmbientMcpServerSearchResult,
  ManagedDevServerSummary,
} from "../../shared/pluginTypes";
import { mcpDefaultCapabilityRuntimeHandoffCandidate } from "./pluginUiModel";
import { useRightPanelMcpContainerRuntimeLifecycleController } from "./RightPanelMcpContainerRuntimeLifecycleController";
import { useRightPanelMcpPluginRuntimeController } from "./RightPanelMcpPluginRuntimeController";
import { createRightPanelMcpServerActions } from "./RightPanelMcpServerActions";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export function useRightPanelMcpController({
  activeWorkspacePath,
  workspacePath,
  onClearMcpContainerRuntimeInstallProgress,
  onClearMcpDefaultCapabilityInstallProgress,
  onDefaultCapabilityInstalled,
}: {
  activeWorkspacePath: string;
  workspacePath: string;
  onClearMcpContainerRuntimeInstallProgress: () => void;
  onClearMcpDefaultCapabilityInstallProgress: () => void;
  onDefaultCapabilityInstalled: () => void;
}) {
  const pluginRuntime = useRightPanelMcpPluginRuntimeController();
  const [serverQuery, setServerQuery] = useState("context7");
  const [registryResults, setRegistryResults] = useState<AmbientMcpServerSearchResult[]>([]);
  const [installedServers, setInstalledServers] = useState<AmbientMcpInstalledServerSummary[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<AmbientMcpInstallPreview | undefined>();
  const [serverBusy, setServerBusy] = useState<string | undefined>();
  const [serverStatus, setServerStatus] = useState<ApiKeyStatus | undefined>();
  const [serverError, setServerError] = useState<string | undefined>();
  const [managedDevServers, setManagedDevServers] = useState<ManagedDevServerSummary[]>([]);
  const [managedDevServerBusy, setManagedDevServerBusy] = useState<string | undefined>();
  const [managedDevServerError, setManagedDevServerError] = useState<string | undefined>();
  const [containerRuntimeStatus, setContainerRuntimeStatus] = useState<AmbientMcpContainerRuntimeStatus | undefined>();
  const [containerRuntimeBusy, setContainerRuntimeBusy] = useState(false);
  const [containerRuntimeLaunchBusy, setContainerRuntimeLaunchBusy] = useState(false);
  const [containerRuntimeError, setContainerRuntimeError] = useState<string | undefined>();
  const [containerRuntimeActionStatus, setContainerRuntimeActionStatus] = useState<ApiKeyStatus | undefined>();
  const [containerRuntimeModalOpen, setContainerRuntimeModalOpen] = useState(false);
  const [containerRuntimeModalDismissed, setContainerRuntimeModalDismissed] = useState(false);
  const defaultCapabilityHandoffInFlightRef = useRef<AmbientMcpDefaultCapabilityInstallInput["capabilityId"] | undefined>(undefined);
  const containerRuntimeLifecycle = useRightPanelMcpContainerRuntimeLifecycleController({
    workspacePath,
    containerRuntimeStatus,
    setContainerRuntimeStatus,
    setContainerRuntimeActionStatus,
    setServerStatus,
    refreshContainerRuntimeStatus,
  });

  const mcpServerActions = createRightPanelMcpServerActions({
    serverQuery,
    selectedPreview,
    setRegistryResults,
    setInstalledServers,
    setSelectedPreview,
    setServerBusy,
    setServerStatus,
    setServerError,
    setManagedDevServers,
    setManagedDevServerBusy,
    setManagedDevServerError,
    refreshContainerRuntimeStatus,
  });

  function loadInstalledServers() {
    return mcpServerActions.loadInstalledServers();
  }

  function loadManagedDevServers() {
    return mcpServerActions.loadManagedDevServers();
  }

  function stopManagedDevServerProcess(serverId: string) {
    return mcpServerActions.stopManagedDevServerProcess(serverId);
  }

  async function refreshContainerRuntimeStatus(openWhenNeedsAction = false, options: { continueDefaultCapabilitySetup?: boolean } = {}) {
    setContainerRuntimeBusy(true);
    setContainerRuntimeError(undefined);
    let handoffCapabilityId: AmbientMcpDefaultCapabilityInstallInput["capabilityId"] | undefined;
    let handoffCapabilityTitle: string | undefined;
    try {
      const status = await window.ambientDesktop.getMcpContainerRuntimeStatus();
      setContainerRuntimeStatus(status);
      try {
        setInstalledServers(await window.ambientDesktop.listMcpInstalledServers());
      } catch (error) {
        setServerError(error instanceof Error ? error.message : String(error));
      }
      if (openWhenNeedsAction && status.setup.shouldPrompt && !containerRuntimeModalDismissed) {
        setContainerRuntimeModalOpen(true);
      }
      const handoffCandidate = options.continueDefaultCapabilitySetup ? mcpDefaultCapabilityRuntimeHandoffCandidate(status) : undefined;
      if (openWhenNeedsAction && handoffCandidate && !containerRuntimeModalDismissed) {
        setContainerRuntimeModalOpen(true);
      }
      if (handoffCandidate && defaultCapabilityHandoffInFlightRef.current !== handoffCandidate.capabilityId) {
        handoffCapabilityId = handoffCandidate.capabilityId;
        handoffCapabilityTitle = handoffCandidate.title;
      }
    } catch (error) {
      setContainerRuntimeError(error instanceof Error ? error.message : String(error));
      if (openWhenNeedsAction && !containerRuntimeModalDismissed) setContainerRuntimeModalOpen(true);
    } finally {
      setContainerRuntimeBusy(false);
    }
    if (handoffCapabilityId) {
      setServerStatus({
        kind: "info",
        message: `Runtime is ready. Continuing setup for ${handoffCapabilityTitle ?? handoffCapabilityId}.`,
      });
      await installDefaultCapability(handoffCapabilityId);
    }
  }

  async function launchContainerRuntimeInstaller(actionId?: string, mode: "execute" | "dry-run" = "execute") {
    setContainerRuntimeLaunchBusy(true);
    setContainerRuntimeError(undefined);
    setContainerRuntimeActionStatus(undefined);
    onClearMcpContainerRuntimeInstallProgress();
    try {
      const result = await window.ambientDesktop.launchMcpContainerRuntimeInstaller({
        actionId: actionId ?? containerRuntimeStatus?.installPlan?.primaryAction.id,
        mode,
      });
      setContainerRuntimeStatus((current) => (current ? { ...current, installPlan: result.plan } : current));
      const managedDryRun = result.managedResult?.status === "not-executed";
      const managedInstallFailed = Boolean(result.managedResult && result.managedResult.status !== "succeeded" && !managedDryRun);
      if (managedInstallFailed) setContainerRuntimeError(result.message);
      const actionStatus: ApiKeyStatus = {
        kind: managedInstallFailed ? "error" : result.managedResult?.status === "succeeded" ? "success" : "info",
        message: result.message,
      };
      setContainerRuntimeActionStatus(actionStatus);
      setServerStatus(actionStatus);
      if (!managedDryRun) await refreshContainerRuntimeStatus(false, { continueDefaultCapabilitySetup: !managedInstallFailed });
      if (managedInstallFailed) setContainerRuntimeError(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setContainerRuntimeError(message);
      setContainerRuntimeActionStatus({ kind: "error", message });
    } finally {
      setContainerRuntimeLaunchBusy(false);
    }
  }

  async function installDefaultCapability(capabilityId: AmbientMcpDefaultCapabilityInstallInput["capabilityId"]) {
    if (defaultCapabilityHandoffInFlightRef.current === capabilityId) return;
    defaultCapabilityHandoffInFlightRef.current = capabilityId;
    onClearMcpDefaultCapabilityInstallProgress();
    setServerBusy(`default-capability:${capabilityId}`);
    setContainerRuntimeError(undefined);
    setServerError(undefined);
    try {
      const result = await window.ambientDesktop.installMcpDefaultCapability({ capabilityId });
      if (result.installed) setInstalledServers(result.installed);
      setServerStatus({
        kind: result.status === "installed" || result.status === "already-installed" ? "success" : "error",
        message: result.message.split("\n")[0] ?? result.message,
      });
      if (result.status === "installed" || result.status === "already-installed") {
        onDefaultCapabilityInstalled();
      } else {
        setContainerRuntimeError(result.message);
      }
      await refreshContainerRuntimeStatus(false);
      await searchRegistryServers(false);
    } catch (error) {
      setContainerRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      if (defaultCapabilityHandoffInFlightRef.current === capabilityId) {
        defaultCapabilityHandoffInFlightRef.current = undefined;
      }
      setServerBusy(undefined);
    }
  }

  async function dismissContainerRuntimeSetup() {
    setContainerRuntimeModalDismissed(true);
    setContainerRuntimeModalOpen(false);
    if (!containerRuntimeStatus?.installPlan) return;
    setContainerRuntimeBusy(true);
    setContainerRuntimeError(undefined);
    try {
      setContainerRuntimeStatus(await window.ambientDesktop.deferMcpContainerRuntimeSetup());
    } catch (error) {
      setContainerRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setContainerRuntimeBusy(false);
    }
  }

  function searchRegistryServers(refresh = false) {
    return mcpServerActions.searchRegistryServers(refresh);
  }

  function describeRegistryServer(serverId: string, refresh = false) {
    return mcpServerActions.describeRegistryServer(serverId, refresh);
  }

  function installRegistryServer(serverId: string) {
    return mcpServerActions.installRegistryServer(serverId);
  }

  function uninstallServer(server: AmbientMcpInstalledServerSummary) {
    return mcpServerActions.uninstallServer(server);
  }

  function acceptToolDescriptorReview(server: AmbientMcpInstalledServerSummary) {
    return mcpServerActions.acceptToolDescriptorReview(server);
  }

  useEffect(() => {
    return window.ambientDesktop.onEvent((event) => {
      if (event.type === "mcp-container-runtime-setup-needed") {
        if (event.workspacePath && event.workspacePath !== workspacePath) return;
        setContainerRuntimeModalDismissed(false);
        void refreshContainerRuntimeStatus(true, { continueDefaultCapabilitySetup: false });
      }
    });
  }, [workspacePath]);

  useEffect(() => {
    setRegistryResults([]);
    setInstalledServers([]);
    setSelectedPreview(undefined);
    setServerBusy(undefined);
    setServerStatus(undefined);
    setServerError(undefined);
  }, [activeWorkspacePath]);

  return {
    inspection: pluginRuntime.inspection,
    runtimeSnapshots: pluginRuntime.runtimeSnapshots,
    inspectionError: pluginRuntime.inspectionError,
    runtimeBusy: pluginRuntime.runtimeBusy,
    inspecting: pluginRuntime.inspecting,
    serverQuery,
    setServerQuery,
    registryResults,
    installedServers,
    selectedPreview,
    serverBusy,
    serverStatus,
    serverError,
    managedDevServers,
    managedDevServerBusy,
    managedDevServerError,
    containerRuntimeStatus,
    containerRuntimeBusy,
    containerRuntimeLaunchBusy,
    containerRuntimeError,
    containerRuntimeActionStatus,
    containerRuntimeLifecyclePreview: containerRuntimeLifecycle.containerRuntimeLifecyclePreview,
    containerRuntimeLifecycleResult: containerRuntimeLifecycle.containerRuntimeLifecycleResult,
    containerRuntimeLifecycleProgress: containerRuntimeLifecycle.containerRuntimeLifecycleProgress,
    containerRuntimeLifecycleBusyKey: containerRuntimeLifecycle.containerRuntimeLifecycleBusyKey,
    containerRuntimeLifecycleError: containerRuntimeLifecycle.containerRuntimeLifecycleError,
    containerRuntimeModalOpen,
    setContainerRuntimeModalOpen,
    prepareCatalogLoad: pluginRuntime.prepareCatalogLoad,
    clearInspection: pluginRuntime.clearInspection,
    clearRuntimeSnapshots: pluginRuntime.clearRuntimeSnapshots,
    setRuntimeSnapshots: pluginRuntime.setRuntimeSnapshots,
    setManagedDevServers,
    loadInstalledServers,
    loadManagedDevServers,
    stopManagedDevServerProcess,
    refreshContainerRuntimeStatus,
    launchContainerRuntimeInstaller,
    previewContainerRuntimeLifecycle: containerRuntimeLifecycle.previewContainerRuntimeLifecycle,
    runContainerRuntimeLifecycle: containerRuntimeLifecycle.runContainerRuntimeLifecycle,
    installDefaultCapability,
    dismissContainerRuntimeSetup,
    searchRegistryServers,
    describeRegistryServer,
    installRegistryServer,
    uninstallServer,
    acceptToolDescriptorReview,
    inspectPluginMcp: pluginRuntime.inspectPluginMcp,
    restartPluginMcpRuntime: pluginRuntime.restartPluginMcpRuntime,
    stopPluginMcpRuntime: pluginRuntime.stopPluginMcpRuntime,
  };
}

export type RightPanelMcpController = ReturnType<typeof useRightPanelMcpController>;
