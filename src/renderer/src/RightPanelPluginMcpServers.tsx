import { RefreshCw, Search } from "lucide-react";
import type { AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult } from "../../shared/pluginTypes";
import {
  mcpInstalledServerStatusLabel,
  mcpServerInstallActionState,
  mcpServerSearchResultSubtitle,
  mcpServerUninstallActionState,
  mcpToolReviewAcceptActionState,
} from "./pluginUiModel";

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
  const installAction = mcpServerInstallActionState(selectedPreview, busyKey);

  return (
    <>
      <section className="plugin-row">
        <div className="plugin-row-header">
          <strong>ToolHive Registry</strong>
          <div className="plugin-row-actions">
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={Boolean(busyKey)}
              onClick={() => onSearchRegistry(true)}
              title="Refresh the ToolHive registry before searching."
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
        </div>
        <form
          className="browser-action-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchRegistry(false);
          }}
        >
          <input
            type="search"
            className="panel-input"
            value={query}
            placeholder="Search registry servers"
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <button type="submit" className="panel-button mini icon-panel-button" disabled={busyKey === "search"}>
            <Search size={13} />
            {busyKey === "search" ? "Searching" : "Search"}
          </button>
        </form>
      </section>

      <section className="plugin-row">
        <div className="plugin-row-header">
          <strong>Installed MCP Servers</strong>
          <div className="plugin-row-actions">
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={busyKey === "installed"}
              onClick={onLoadInstalledServers}
            >
              <RefreshCw size={13} />
              {busyKey === "installed" ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
        {installedServers.length > 0 ? (
          <div className="plugin-sublist">
            {installedServers.map((server) => {
              const uninstallAction = mcpServerUninstallActionState(server, busyKey);
              const toolReviewAction = mcpToolReviewAcceptActionState(server, busyKey);
              return (
                <div className="plugin-row plugin-import-row" key={`${server.serverId}:${server.workloadName}`}>
                  <div className="plugin-row-header">
                    <strong>{server.serverId}</strong>
                    <div className="plugin-row-actions">
                      <span>{mcpInstalledServerStatusLabel(server)}</span>
                      {toolReviewAction.visible && (
                        <button
                          type="button"
                          className="panel-button mini"
                          disabled={toolReviewAction.disabled}
                          title={toolReviewAction.title}
                          onClick={() => onAcceptToolReview(server)}
                        >
                          {toolReviewAction.label}
                        </button>
                      )}
                      <button
                        type="button"
                        className="panel-button mini danger"
                        disabled={uninstallAction.disabled}
                        title={uninstallAction.title}
                        onClick={() => onUninstallServer(server)}
                      >
                        {uninstallAction.label}
                      </button>
                    </div>
                  </div>
                  <div className="plugin-badges">
                    <span>{server.workloadName}</span>
                    {server.endpoint && <span>{server.endpoint}</span>}
                    {typeof server.lastKnownToolCount === "number" && <span>{server.lastKnownToolCount} cached tool{server.lastKnownToolCount === 1 ? "" : "s"}</span>}
                    {server.toolDescriptorReviewStatus && <span>tool review {server.toolDescriptorReviewStatus}</span>}
                    {Boolean(server.toolPolicyCount) && <span>{server.toolPolicyCount} tool polic{server.toolPolicyCount === 1 ? "y" : "ies"}{server.hiddenToolPolicyCount ? `, ${server.hiddenToolPolicyCount} hidden` : ""}{server.blockedToolPolicyCount ? `, ${server.blockedToolPolicyCount} blocked` : ""}</span>}
                    {server.lastKnownToolDescriptorHash && <span>hash {server.lastKnownToolDescriptorHash.slice(0, 12)}</span>}
                  </div>
                  {server.toolDescriptorReviewStatus === "needs-review" && (
                    <p className="panel-note">
                      Tool descriptors changed. Review current tools before trusting this server again.
                      {server.toolDescriptorReviewReason ? ` ${server.toolDescriptorReviewReason}` : ""}
                    </p>
                  )}
                  <code className="plugin-cache-path" title={server.permissionProfilePath}>
                    {server.permissionProfilePath}
                  </code>
                  {server.runtimeListError && <p className="panel-note">{server.runtimeListError}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="panel-note">No Ambient-managed ToolHive MCP servers are installed.</p>
        )}
      </section>

      <section className="plugin-row">
        <div className="plugin-row-header">
          <strong>Registry Results</strong>
          <span>{registryResults.length} result{registryResults.length === 1 ? "" : "s"}</span>
        </div>
        {registryResults.length > 0 ? (
          <div className="plugin-sublist">
            {registryResults.map((result) => {
              const describing = busyKey === `describe:${result.serverId}`;
              return (
                <div className="plugin-row plugin-import-row" key={result.serverId}>
                  <div className="plugin-row-header">
                    <strong>{result.title}</strong>
                    <div className="plugin-row-actions">
                      <button
                        type="button"
                        className="panel-button mini"
                        disabled={describing}
                        onClick={() => onDescribeServer(result.serverId)}
                      >
                        {describing ? "Reviewing" : "Review"}
                      </button>
                      {result.installed && <span>Installed</span>}
                    </div>
                  </div>
                  <p>{result.description}</p>
                  <div className="plugin-badges">
                    <span>{result.serverId}</span>
                    <span>{mcpServerSearchResultSubtitle(result)}</span>
                    {result.repositoryUrl && <span>{result.repositoryUrl}</span>}
                  </div>
                  {(result.tags.length > 0 || result.riskHints.length > 0) && (
                    <div className="plugin-note-list">
                      {result.tags.slice(0, 8).map((tag) => <span key={`tag:${result.serverId}:${tag}`}>{tag}</span>)}
                      {result.riskHints.slice(0, 4).map((hint) => <span key={`risk:${result.serverId}:${hint}`}>{hint}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="panel-note">Search the ToolHive registry to review installable MCP servers.</p>
        )}
      </section>

      {selectedPreview && (
        <section className="plugin-row">
          <div className="plugin-row-header">
            <strong>{selectedPreview.title}</strong>
            <div className="plugin-row-actions">
              <span>{selectedPreview.riskLevel}</span>
              {installAction.visible && (
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={installAction.disabled || !runtimeReady || runtimeBusy}
                  title={
                    !runtimeReady
                      ? "Set up the isolated Docker/Podman runtime before installing MCP servers."
                      : installAction.title
                  }
                  onClick={() => onInstallServer(selectedPreview.serverId)}
                >
                  {!runtimeReady ? "Runtime needed" : installAction.label}
                </button>
              )}
            </div>
          </div>
          <p>{selectedPreview.summary}</p>
          <div className="plugin-badges">
            <span>{selectedPreview.sourceSummary}</span>
            <span>{selectedPreview.runtimeSummary}</span>
            <span>{selectedPreview.permissionSummary}</span>
            <span>{selectedPreview.secretSummary}</span>
          </div>
          {selectedPreview.runPlan && (
            <code className="plugin-cache-path">
              {[
                `server: ${selectedPreview.runPlan.serverId}`,
                `workload: ${selectedPreview.runPlan.workloadName}`,
                `group: ${selectedPreview.runPlan.group}`,
                `transport: ${selectedPreview.runPlan.transport}`,
                `profile: ${selectedPreview.runPlan.permissionProfilePath}`,
              ].join("\n")}
            </code>
          )}
          {(selectedPreview.blockers.length > 0 || selectedPreview.warnings.length > 0) && (
            <div className="plugin-note-list">
              {selectedPreview.blockers.map((blocker) => <span key={`blocker:${blocker}`}>Blocker: {blocker}</span>)}
              {selectedPreview.warnings.map((warning) => <span key={`warning:${warning}`}>Warning: {warning}</span>)}
            </div>
          )}
          {selectedPreview.expectedTools.length > 0 && (
            <div className="plugin-note-list">
              {selectedPreview.expectedTools.slice(0, 10).map((tool) => <span key={`tool:${tool}`}>{tool}</span>)}
            </div>
          )}
        </section>
      )}
    </>
  );
}
