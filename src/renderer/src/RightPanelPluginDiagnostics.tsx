import type { AmbientPluginRegistry, CodexPluginMcpInspectionCatalog, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import { formatJsonPreview, formatTaskState } from "./RightPanelDetailPanels";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";
import {
  formatPluginMcpLaunchCommand,
  formatPluginMcpRuntimeEvent,
} from "./pluginUiModel";

export function RightPanelPluginDiagnostics({
  registry,
  mcpRuntimeSnapshots,
  mcpRuntimeBusy,
  mcpInspection,
  onRestartMcpRuntime,
  onStopMcpRuntime,
}: {
  registry: Pick<AmbientPluginRegistry, "errors" | "sourceNotes">;
  mcpRuntimeSnapshots: PluginMcpRuntimeSnapshot[];
  mcpRuntimeBusy?: string;
  mcpInspection?: CodexPluginMcpInspectionCatalog;
  onRestartMcpRuntime: (key: string) => void;
  onStopMcpRuntime: (key: string) => void;
}) {
  return (
    <div className="plugin-list">
      {registry.errors.map((catalogError) => (
        <p className="panel-note" key={catalogError}>{catalogError}</p>
      ))}
      {registry.sourceNotes.map((note) => (
        <p className="panel-note" key={note}>{note}</p>
      ))}
      {mcpRuntimeSnapshots.length > 0 && (
        <section className="plugin-row">
          <div className="panel-section-heading">
            <strong>MCP Runtime State</strong>
            <span>{mcpRuntimeSnapshots.length} supervised server{mcpRuntimeSnapshots.length === 1 ? "" : "s"}</span>
          </div>
          <div className="plugin-mcp-results">
            {mcpRuntimeSnapshots.map((runtime) => (
              <div className={`plugin-mcp-result ${runtime.status}`} key={runtime.key}>
                <div>
                  <strong>{runtime.pluginName}: {runtime.serverName}</strong>
                  <div className="plugin-row-actions">
                    <span>{formatTaskState(runtime.status)}</span>
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={Boolean(mcpRuntimeBusy)}
                      onClick={() => onRestartMcpRuntime(runtime.key)}
                    >
                      {mcpRuntimeBusy === `restart:${runtime.key}` ? "Restarting" : "Restart"}
                    </button>
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={Boolean(mcpRuntimeBusy)}
                      onClick={() => onStopMcpRuntime(runtime.key)}
                    >
                      {mcpRuntimeBusy === `stop:${runtime.key}` ? "Stopping" : "Stop"}
                    </button>
                  </div>
                </div>
                <div className="plugin-badges">
                  {runtime.pid && <span>PID {runtime.pid}</span>}
                  <span>{runtime.permissionMode === "full-access" ? "Full access" : "Workspace scope"}</span>
                  <span>{runtime.requestCount} request{runtime.requestCount === 1 ? "" : "s"}</span>
                  {runtime.toolCount !== undefined && <span>{runtime.toolCount} tool{runtime.toolCount === 1 ? "" : "s"}</span>}
                  {runtime.startedAt && <span>Started {formatTimelineTime(runtime.startedAt)}</span>}
                </div>
                <code>{runtime.workspacePath}</code>
                <div className="plugin-sublist">
                  <strong>Launch plan</strong>
                  <span>command: {formatPluginMcpLaunchCommand(runtime)}</span>
                  <span>cwd: {runtime.cwd}</span>
                  <span>workspace: {runtime.workspacePath}</span>
                  <span>env keys: {runtime.envKeys.length ? runtime.envKeys.join(", ") : "none"}</span>
                  <span>fingerprint: {runtime.pluginFingerprint}</span>
                </div>
                {runtime.lastError && <p>{runtime.lastError}</p>}
                {runtime.stderr && <code>{runtime.stderr}</code>}
                {runtime.recentEvents?.length ? (
                  <div className="plugin-sublist">
                    <strong>Recent MCP activity</strong>
                    {runtime.recentEvents.slice(-6).map((event) => (
                      <span key={`${runtime.key}-${event.sequence}`}>
                        {formatPluginMcpRuntimeEvent(event)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}
      {mcpInspection ? (
        <div className="plugin-mcp-results">
          {mcpInspection.servers.map((server) => (
            <div className={`plugin-mcp-result ${server.status}`} key={`${server.pluginId}-${server.serverName}`}>
              <div>
                <strong>{server.pluginName}: {server.serverName}</strong>
                <span>{server.status}</span>
              </div>
              {server.reason && <p>{server.reason}</p>}
              {server.tools.map((tool) => (
                <code key={tool.name}>
                  {tool.name}{tool.description ? `: ${tool.description}` : ""}
                  {tool.inputSchema ? `\n${formatJsonPreview(tool.inputSchema)}` : ""}
                </code>
              ))}
              {server.stderr && <code>{server.stderr}</code>}
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-note">Run MCP inspection to validate plugin server launch and tool schemas.</p>
      )}
    </div>
  );
}
