import type { Dispatch, SetStateAction } from "react";

import type {
  AmbientMcpInstalledServerSummary,
  AmbientMcpInstallPreview,
  AmbientMcpServerSearchResult,
  ManagedDevServerSummary,
} from "../../shared/pluginTypes";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

type RefreshContainerRuntimeStatus = (
  openWhenNeedsAction?: boolean,
  options?: { continueDefaultCapabilitySetup?: boolean },
) => Promise<void>;

type RightPanelMcpServerActionsInput = {
  serverQuery: string;
  selectedPreview?: AmbientMcpInstallPreview;
  setRegistryResults: Dispatch<SetStateAction<AmbientMcpServerSearchResult[]>>;
  setInstalledServers: Dispatch<SetStateAction<AmbientMcpInstalledServerSummary[]>>;
  setSelectedPreview: Dispatch<SetStateAction<AmbientMcpInstallPreview | undefined>>;
  setServerBusy: Dispatch<SetStateAction<string | undefined>>;
  setServerStatus: Dispatch<SetStateAction<ApiKeyStatus | undefined>>;
  setServerError: Dispatch<SetStateAction<string | undefined>>;
  setManagedDevServers: Dispatch<SetStateAction<ManagedDevServerSummary[]>>;
  setManagedDevServerBusy: Dispatch<SetStateAction<string | undefined>>;
  setManagedDevServerError: Dispatch<SetStateAction<string | undefined>>;
  refreshContainerRuntimeStatus: RefreshContainerRuntimeStatus;
};

export function createRightPanelMcpServerActions({
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
}: RightPanelMcpServerActionsInput) {
  async function loadInstalledServers() {
    setServerBusy((busy) => busy ?? "installed");
    setServerError(undefined);
    try {
      setInstalledServers(await window.ambientDesktop.listMcpInstalledServers());
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerBusy((busy) => (busy === "installed" ? undefined : busy));
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
      setManagedDevServerBusy((busy) => (busy === "list" ? undefined : busy));
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
        message: results.length
          ? `Found ${results.length} ToolHive registry server${results.length === 1 ? "" : "s"}.`
          : "No registry servers matched.",
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

  return {
    loadInstalledServers,
    loadManagedDevServers,
    stopManagedDevServerProcess,
    searchRegistryServers,
    describeRegistryServer,
    installRegistryServer,
    uninstallServer,
    acceptToolDescriptorReview,
  };
}
