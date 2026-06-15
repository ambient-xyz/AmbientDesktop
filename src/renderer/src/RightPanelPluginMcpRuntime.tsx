import { Download, RefreshCw } from "lucide-react";
import type {
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  ManagedDevServerSummary,
} from "../../shared/types";
import {
  mcpContainerRuntimeDetailRows,
  mcpDefaultCapabilityInstallActionState,
} from "./pluginUiModel";
import { formatTaskState } from "./RightPanelDetailPanels";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

type PanelActionState = {
  visible: boolean;
  disabled: boolean;
  title?: string;
  label: string;
};

export function RightPanelPluginMcpRuntime({
  runtimeStatus,
  runtimeToneClass,
  runtimeLabel,
  runtimeBusy,
  runtimeLaunchBusy,
  runtimeError,
  diagnosticsAction,
  diagnosticStatus,
  installProgressStatus,
  defaultCapabilityInstallProgressStatus,
  setupResumeRows,
  mcpServerBusy,
  managedDevServers,
  managedDevServerBusy,
  managedDevServerError,
  installBusyLabel,
  onRefreshRuntime,
  onOpenRuntimeReview,
  onOpenRuntimeSettings,
  onExportDiagnostics,
  onLaunchInstaller,
  onReviewInstallCommandPlan,
  onInstallDefaultCapability,
  onLoadManagedDevServers,
  onStopManagedDevServer,
}: {
  runtimeStatus?: AmbientMcpContainerRuntimeStatus;
  runtimeToneClass: string;
  runtimeLabel: string;
  runtimeBusy: boolean;
  runtimeLaunchBusy: boolean;
  runtimeError?: string;
  diagnosticsAction: PanelActionState;
  diagnosticStatus?: ApiKeyStatus;
  installProgressStatus?: ApiKeyStatus;
  defaultCapabilityInstallProgressStatus?: ApiKeyStatus;
  setupResumeRows: string[];
  mcpServerBusy?: string;
  managedDevServers: ManagedDevServerSummary[];
  managedDevServerBusy?: string;
  managedDevServerError?: string;
  installBusyLabel: (kind?: string) => string;
  onRefreshRuntime: () => void;
  onOpenRuntimeReview: () => void;
  onOpenRuntimeSettings: () => void;
  onExportDiagnostics: () => void;
  onLaunchInstaller: () => void;
  onReviewInstallCommandPlan: () => void;
  onInstallDefaultCapability: (capabilityId: AmbientMcpDefaultCapabilityInstallInput["capabilityId"]) => void;
  onLoadManagedDevServers: () => void;
  onStopManagedDevServer: (id: string) => void;
}) {
  return (
    <>
      <section className={`plugin-row mcp-runtime-status-row tone-${runtimeToneClass}`}>
        <div className="plugin-row-header">
          <strong>Isolated MCP Runtime</strong>
          <div className="plugin-row-actions">
            <span>{runtimeLabel}</span>
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={runtimeBusy}
              onClick={onRefreshRuntime}
              title="Check ToolHive, Docker, Podman, and platform runtime readiness."
            >
              <RefreshCw size={13} />
              {runtimeBusy ? "Checking" : "Refresh"}
            </button>
            <button type="button" className="panel-button mini" onClick={onOpenRuntimeReview}>
              Review setup
            </button>
            <button
              type="button"
              className="panel-button mini"
              onClick={onOpenRuntimeSettings}
              title="Open the durable Settings recovery panel for MCP runtime and Scrapling setup."
            >
              Runtime settings
            </button>
            {diagnosticsAction.visible && (
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={diagnosticsAction.disabled}
                title={diagnosticsAction.title}
                onClick={onExportDiagnostics}
              >
                <Download size={13} />
                {diagnosticsAction.label}
              </button>
            )}
            {runtimeStatus?.installPlan?.primaryAction && (
              <>
                {runtimeStatus.installPlan.primaryAction.kind === "managed-install" && (
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={runtimeLaunchBusy}
                    onClick={onReviewInstallCommandPlan}
                    title="Dry-run this managed install plan without executing package-manager commands."
                  >
                    Review command plan
                  </button>
                )}
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={runtimeLaunchBusy}
                  onClick={onLaunchInstaller}
                >
                  {runtimeLaunchBusy
                    ? installBusyLabel(runtimeStatus.installPlan.primaryAction.kind)
                    : runtimeStatus.installPlan.primaryAction.label}
                </button>
              </>
            )}
          </div>
        </div>
        <p>
          {runtimeError ??
            runtimeStatus?.message ??
            "Ambient checks ToolHive plus Docker or Podman before installing isolated MCP plugins."}
        </p>
        {diagnosticsAction.visible && diagnosticStatus && (
          <p className={`panel-status ${diagnosticStatus.kind}`}>{diagnosticStatus.message}</p>
        )}
        {installProgressStatus && (
          <p className={`panel-status ${installProgressStatus.kind}`}>{installProgressStatus.message}</p>
        )}
        {defaultCapabilityInstallProgressStatus && (
          <p className={`panel-status ${defaultCapabilityInstallProgressStatus.kind}`}>{defaultCapabilityInstallProgressStatus.message}</p>
        )}
        {runtimeStatus && (
          <>
            <div className="plugin-badges">
              {mcpContainerRuntimeDetailRows(runtimeStatus).map((row) => <span key={row}>{row}</span>)}
            </div>
            {runtimeStatus.installPlan && (
              <div className="plugin-note-list">
                <span>{runtimeStatus.installPlan.summary}</span>
                <span>Primary setup: {runtimeStatus.installPlan.primaryAction.label}</span>
                {runtimeStatus.setup.promptSuppressed && (
                  <span>Prompt paused: {formatTaskState(runtimeStatus.setup.reason)}</span>
                )}
                {setupResumeRows.map((row) => <span key={row}>{row}</span>)}
              </div>
            )}
            {runtimeStatus.defaultCapabilities.length > 0 && (
              <div className="plugin-note-list">
                {runtimeStatus.defaultCapabilities.map((capability) => {
                  const action = mcpDefaultCapabilityInstallActionState(capability, {
                    runtimeReady: runtimeStatus.status === "ready",
                    busyKey: mcpServerBusy,
                  });
                  return (
                    <span key={capability.capabilityId}>
                      {capability.title}: {formatTaskState(capability.status)}. {capability.message}
                      {action.visible && (
                        <button
                          type="button"
                          className="panel-button mini"
                          disabled={action.disabled}
                          title={action.title}
                          onClick={() => onInstallDefaultCapability(capability.capabilityId)}
                        >
                          {action.label}
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="plugin-note-list">
              {runtimeStatus.hosts.map((host) => (
                <span key={host.kind}>
                  {formatTaskState(host.kind)}: {formatTaskState(host.status)}{host.version ? ` ${host.version}` : ""}. {host.message}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="plugin-row">
        <div className="plugin-row-header">
          <strong>Managed Dev Servers</strong>
          <div className="plugin-row-actions">
            <span>{managedDevServers.length} running</span>
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={managedDevServerBusy === "list"}
              onClick={onLoadManagedDevServers}
              title="Refresh background dev-server processes started by Ambient tool calls."
            >
              <RefreshCw size={13} />
              {managedDevServerBusy === "list" ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
        <p>
          Dev-server-shaped commands resolve after readiness and continue here as managed background processes instead
          of blocking the agent loop.
        </p>
        {managedDevServerError && <p className="panel-status error">{managedDevServerError}</p>}
        {managedDevServers.length > 0 ? (
          <div className="plugin-sublist">
            {managedDevServers.map((server) => (
              <div className="plugin-row plugin-import-row" key={server.id}>
                <div className="plugin-row-header">
                  <strong>{server.command}</strong>
                  <div className="plugin-row-actions">
                    {server.pid && <span>pid {server.pid}</span>}
                    <button
                      type="button"
                      className="panel-button mini danger"
                      disabled={managedDevServerBusy === server.id}
                      onClick={() => onStopManagedDevServer(server.id)}
                      title="Stop this managed background dev server."
                    >
                      {managedDevServerBusy === server.id ? "Stopping" : "Stop"}
                    </button>
                  </div>
                </div>
                <div className="plugin-badges">
                  <span>{server.id}</span>
                  <span>ready {formatTimelineTime(server.readyAt)}</span>
                  <span>started {formatTimelineTime(server.startedAt)}</span>
                  <span>{formatTaskState(server.sandboxKind)}</span>
                </div>
                <code className="plugin-cache-path" title={server.cwd}>
                  {server.cwd}
                </code>
                {server.sandboxReason && <p className="panel-note">{server.sandboxReason}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-note">No managed dev servers are currently running.</p>
        )}
      </section>
    </>
  );
}
