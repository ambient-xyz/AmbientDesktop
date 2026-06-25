import type { AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult } from "../../shared/pluginTypes";
import {
  RightPanelInstalledMcpServersSection,
  RightPanelMcpRegistryResultsSection,
  RightPanelSelectedMcpPreviewSection,
  RightPanelToolHiveRegistrySearchSection,
} from "./RightPanelPluginMcpServerSections";

export function RightPanelPluginMcpServers({
  query,
  busyKey,
  installedServers,
  registryResults,
  selectedPreview,
  runtimeReady,
  runtimeBusy,
  onQueryChange,
  onSearchRegistry,
  onLoadInstalledServers,
  onAcceptToolReview,
  onUninstallServer,
  onDescribeServer,
  onInstallServer,
}: {
  query: string;
  busyKey?: string;
  installedServers: AmbientMcpInstalledServerSummary[];
  registryResults: AmbientMcpServerSearchResult[];
  selectedPreview?: AmbientMcpInstallPreview;
  runtimeReady: boolean;
  runtimeBusy: boolean;
  onQueryChange: (query: string) => void;
  onSearchRegistry: (refresh: boolean) => void;
  onLoadInstalledServers: () => void;
  onAcceptToolReview: (server: AmbientMcpInstalledServerSummary) => void;
  onUninstallServer: (server: AmbientMcpInstalledServerSummary) => void;
  onDescribeServer: (serverId: string) => void;
  onInstallServer: (serverId: string) => void;
}) {
  return (
    <>
      <RightPanelToolHiveRegistrySearchSection
        query={query}
        busyKey={busyKey}
        onQueryChange={onQueryChange}
        onSearchRegistry={onSearchRegistry}
      />
      <RightPanelInstalledMcpServersSection
        busyKey={busyKey}
        installedServers={installedServers}
        onAcceptToolReview={onAcceptToolReview}
        onLoadInstalledServers={onLoadInstalledServers}
        onUninstallServer={onUninstallServer}
      />
      <RightPanelMcpRegistryResultsSection busyKey={busyKey} registryResults={registryResults} onDescribeServer={onDescribeServer} />
      <RightPanelSelectedMcpPreviewSection
        busyKey={busyKey}
        selectedPreview={selectedPreview}
        runtimeReady={runtimeReady}
        runtimeBusy={runtimeBusy}
        onInstallServer={onInstallServer}
      />
    </>
  );
}
