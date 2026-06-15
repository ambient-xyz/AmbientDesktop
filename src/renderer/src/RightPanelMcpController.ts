import { useEffect, useRef, useState } from "react";

import type {
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpInstallPreview,
  AmbientMcpInstalledServerSummary,
  AmbientMcpServerSearchResult,
  AmbientMcpContainerRuntimeStatus,
  CodexPluginMcpInspectionCatalog,
  ManagedDevServerSummary,
  PluginMcpRuntimeSnapshot,
} from "../../shared/types";
import { mcpDefaultCapabilityRuntimeHandoffCandidate } from "./pluginUiModel";
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
  const [inspection, setInspection] = useState<CodexPluginMcpInspectionCatalog | undefined>();
  const [runtimeSnapshots, setRuntimeSnapshots] = useState<PluginMcpRuntimeSnapshot[]>([]);
  const [inspectionError, setInspectionError] = useState<string | undefined>();
  const [runtimeBusy, setRuntimeBusy] = useState<string | undefined>();
  const [inspecting, setInspecting] = useState(false);
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

  function prepareCatalogLoad() {
    setInspection(undefined);
    setInspectionError(undefined);
  }

  function clearInspection() {
    setInspection(undefined);
    setRuntimeSnapshots([]);
    setInspectionError(undefined);
  }

  function clearRuntimeSnapshots() {
    setRuntimeSnapshots([]);
  }

  async function loadInstalledServers() {
    setServerBusy((busy) => busy ?? "installed");
    setServerError(undefined);
    try {
      setInstalledServers(await window.ambientDesktop.listMcpInstalledServers());
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerBusy((busy) => busy === "installed" ? undefined : busy);
    }
  }

  async function loadManagedDevServers() {
    setManagedDevServerBusy((busy) => busy ?? "list");
    setManagedDevServerError(undefined);
    try {
      setManagedDevServers(await window.ambientDesktop.listManagedDevServers());
    } catch (error) {
      setManagedDevServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setManagedDevServerBusy((busy) => busy === "list" ? undefined : busy);
    }
  }

  async function stopManagedDevServerProcess(serverId: string) {
    setManagedDevServerBusy(serverId);
    setManagedDevServerError(undefined);
    try {
      setManagedDevServers(await window.ambientDesktop.stopManagedDevServer({ id: serverId }));
      setServerStatus({ kind: "success", message: "Managed dev server stopped." });
    } catch (error) {
      setManagedDevServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setManagedDevServerBusy(undefined);
    }
  }

  async function refreshContainerRuntimeStatus(
    openWhenNeedsAction = false,
    options: { continueDefaultCapabilitySetup?: boolean } = {},
  ) {
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
      setContainerRuntimeStatus((current) => current ? { ...current, installPlan: result.plan } : current);
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

  async function searchRegistryServers(refresh = false) {
    setServerBusy("search");
    setServerError(undefined);
    try {
      const results = await window.ambientDesktop.searchMcpRegistryServers({
        query: serverQuery.trim() || undefined,
        limit: 25,
        refresh,
      });
      setRegistryResults(results);
      setServerStatus({
        kind: "info",
        message: results.length ? `Found ${results.length} ToolHive registry server${results.length === 1 ? "" : "s"}.` : "No registry servers matched.",
      });
      if (selectedPreview && !results.some((result) => result.serverId === selectedPreview.serverId)) {
        setSelectedPreview(undefined);
      }
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerBusy(undefined);
    }
  }

  async function describeRegistryServer(serverId: string, refresh = false) {
    setServerBusy(`describe:${serverId}`);
    setServerError(undefined);
    try {
      const preview = await window.ambientDesktop.describeMcpRegistryServer({ serverId, refresh });
      setSelectedPreview(preview);
      setServerStatus({
        kind: preview.blockers.length ? "error" : "info",
        message: preview.blockers.length
          ? `${preview.title} has ${preview.blockers.length} install blocker${preview.blockers.length === 1 ? "" : "s"}.`
          : `${preview.title} is ready for install review.`,
      });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerBusy(undefined);
    }
  }

  async function installRegistryServer(serverId: string) {
    setServerBusy(`install:${serverId}`);
    setServerError(undefined);
    try {
      const result = await window.ambientDesktop.installMcpRegistryServer({ serverId });
      if (result.installed) setInstalledServers(result.installed);
      setServerStatus({
        kind: result.status === "installed" || result.status === "already-installed" ? "success" : "error",
        message: result.message.split("\n")[0] ?? result.message,
      });
      if (result.status === "runtime-preflight-failed") {
        await refreshContainerRuntimeStatus(true, { continueDefaultCapabilitySetup: true });
      }
      await searchRegistryServers(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerBusy(undefined);
    }
  }

  async function uninstallServer(server: AmbientMcpInstalledServerSummary) {
    setServerBusy(`uninstall:${server.serverId}:${server.workloadName}`);
    setServerError(undefined);
    try {
      const result = await window.ambientDesktop.uninstallMcpServer({
        serverId: server.serverId,
        workloadName: server.workloadName,
      });
      setInstalledServers(result.installed);
      setServerStatus({ kind: "success", message: result.message.split("\n")[0] ?? result.message });
      await searchRegistryServers(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerBusy(undefined);
    }
  }

  async function acceptToolDescriptorReview(server: AmbientMcpInstalledServerSummary) {
    setServerBusy(`tool-review:${server.serverId}:${server.workloadName}`);
    setServerError(undefined);
    try {
      const result = await window.ambientDesktop.acceptMcpToolDescriptorReview({
        serverId: server.serverId,
        workloadName: server.workloadName,
        expectedDescriptorHash: server.lastKnownToolDescriptorHash,
      });
      setInstalledServers(result.installed);
      setServerStatus({
        kind: result.status === "trusted" || result.status === "already-trusted" ? "success" : "info",
        message: result.message,
      });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerBusy(undefined);
    }
  }

  async function inspectPluginMcp() {
    setInspectionError(undefined);
    setInspecting(true);
    try {
      setInspection(await window.ambientDesktop.inspectCodexPluginMcp());
      setRuntimeSnapshots(await window.ambientDesktop.listPluginMcpRuntimeSnapshots());
    } catch (error) {
      setInspection(undefined);
      setInspectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setInspecting(false);
    }
  }

  async function restartPluginMcpRuntime(key: string) {
    setInspectionError(undefined);
    setRuntimeBusy(`restart:${key}`);
    try {
      setRuntimeSnapshots(await window.ambientDesktop.restartPluginMcpRuntime({ key }));
    } catch (error) {
      setInspectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeBusy(undefined);
    }
  }

  async function stopPluginMcpRuntime(key: string) {
    setInspectionError(undefined);
    setRuntimeBusy(`stop:${key}`);
    try {
      setRuntimeSnapshots(await window.ambientDesktop.stopPluginMcpRuntime({ key }));
    } catch (error) {
      setInspectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeBusy(undefined);
    }
  }

  useEffect(() => {
    return window.ambientDesktop.onEvent((event) => {
      if (event.type !== "mcp-container-runtime-setup-needed") return;
      if (event.workspacePath && event.workspacePath !== workspacePath) return;
      setContainerRuntimeModalDismissed(false);
      void refreshContainerRuntimeStatus(true, { continueDefaultCapabilitySetup: false });
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
    inspection,
    runtimeSnapshots,
    inspectionError,
    runtimeBusy,
    inspecting,
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
    containerRuntimeModalOpen,
    setContainerRuntimeModalOpen,
    prepareCatalogLoad,
    clearInspection,
    clearRuntimeSnapshots,
    setRuntimeSnapshots,
    setManagedDevServers,
    loadInstalledServers,
    loadManagedDevServers,
    stopManagedDevServerProcess,
    refreshContainerRuntimeStatus,
    launchContainerRuntimeInstaller,
    installDefaultCapability,
    dismissContainerRuntimeSetup,
    searchRegistryServers,
    describeRegistryServer,
    installRegistryServer,
    uninstallServer,
    acceptToolDescriptorReview,
    inspectPluginMcp,
    restartPluginMcpRuntime,
    stopPluginMcpRuntime,
  };
}

export type RightPanelMcpController = ReturnType<typeof useRightPanelMcpController>;
