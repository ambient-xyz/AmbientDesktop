import { Plug, Plus, Shield, Zap } from "lucide-react";
import type {
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpDefaultCapabilityInstallProgress,
} from "../../shared/types";
import {
  mcpContainerRuntimeDetailRows,
  mcpContainerRuntimeDiagnosticsActionState,
  mcpContainerRuntimeInstallActionViews,
  mcpContainerRuntimePrimaryActionLabel,
  mcpContainerRuntimeSetupResumeRows,
  mcpContainerRuntimeStatusLabel,
  mcpContainerRuntimeTone,
  mcpDefaultCapabilityInstallActionState,
  type CapabilityBuilderLauncherDraft,
} from "./pluginUiModel";
import { formatTaskState } from "./RightPanelDetailPanels";
import {
  mcpContainerRuntimeInstallProgressStatus,
  mcpDefaultCapabilityInstallProgressStatus,
} from "./RightPanelPluginHost";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export function mcpContainerRuntimeInstallBusyLabel(kind?: string): string {
  return kind === "managed-install" ? "Installing" : "Opening";
}

export function McpContainerRuntimeDialog({
  status,
  busy,
  launchBusy,
  diagnosticBusy,
  diagnosticStatus,
  actionStatus,
  installProgress,
  defaultCapabilityInstallProgress,
  defaultCapabilityBusyKey,
  error,
  onRefresh,
  onLaunchInstall,
  onExportDiagnostics,
  onInstallDefaultCapability,
  onOpenPlugins,
  onClose,
}: {
  status?: AmbientMcpContainerRuntimeStatus;
  busy: boolean;
  launchBusy: boolean;
  diagnosticBusy: boolean;
  diagnosticStatus?: ApiKeyStatus;
  actionStatus?: ApiKeyStatus;
  installProgress?: AmbientMcpContainerRuntimeManagedInstallProgress;
  defaultCapabilityInstallProgress?: AmbientMcpDefaultCapabilityInstallProgress;
  defaultCapabilityBusyKey?: string;
  error?: string;
  onRefresh: () => void;
  onLaunchInstall: (actionId?: string, mode?: "execute" | "dry-run") => void;
  onExportDiagnostics: () => void;
  onInstallDefaultCapability: (capabilityId: AmbientMcpDefaultCapabilityInstallInput["capabilityId"]) => void;
  onOpenPlugins: () => void;
  onClose: () => void;
}) {
  const tone = mcpContainerRuntimeTone(status?.status);
  const title = status?.status === "ready" ? "Isolated plugin runtime is ready" : "Set up isolated plugin runtime";
  const statusLabel = mcpContainerRuntimeStatusLabel(status?.status);
  const detailRows = status ? mcpContainerRuntimeDetailRows(status) : [];
  const primarySetupAction = status?.installPlan?.primaryAction;
  const diagnosticsAction = mcpContainerRuntimeDiagnosticsActionState(status, { error, busy: diagnosticBusy });
  const installActionViews = mcpContainerRuntimeInstallActionViews(status, { launchBusy });
  const primaryInstallActionView = installActionViews.find((action) => action.primary);
  const alternativeInstallActionViews = installActionViews.filter((action) => !action.primary);
  const setupResumeRows = mcpContainerRuntimeSetupResumeRows(status);
  const installProgressStatus = mcpContainerRuntimeInstallProgressStatus(installProgress);
  const defaultCapabilityInstallProgressStatus = mcpDefaultCapabilityInstallProgressStatus(defaultCapabilityInstallProgress);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`mcp-runtime-dialog tone-${tone}`} role="dialog" aria-modal="true" aria-labelledby="mcp-runtime-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="permission-dialog-header">
          <span className="dialog-icon">
            <Shield size={20} />
          </span>
          <div>
            <h2 id="mcp-runtime-dialog-title">{title}</h2>
            <p>
              Ambient uses Docker or Podman through ToolHive to isolate MCP plugins and browser-backed web research tools from your user account, files, browser data, and secrets.
            </p>
          </div>
        </header>
        <div className="mcp-runtime-dialog-scroll">
          <div className="mcp-runtime-dialog-status">
            <strong>{statusLabel}</strong>
            <span>{error ?? status?.message ?? "Checking Docker, Podman, and ToolHive runtime readiness."}</span>
          </div>
          {diagnosticStatus && <p className={`panel-status ${diagnosticStatus.kind}`}>{diagnosticStatus.message}</p>}
          {installProgressStatus && <p className={`panel-status ${installProgressStatus.kind}`}>{installProgressStatus.message}</p>}
          {defaultCapabilityInstallProgressStatus && <p className={`panel-status ${defaultCapabilityInstallProgressStatus.kind}`}>{defaultCapabilityInstallProgressStatus.message}</p>}
          {actionStatus && <p className={`panel-status ${actionStatus.kind}`}>{actionStatus.message}</p>}
          {detailRows.length > 0 && (
            <div className="plugin-badges">
              {detailRows.map((row) => <span key={row}>{row}</span>)}
            </div>
          )}
          {status?.hosts.length ? (
            <div className="plugin-note-list">
              {status.hosts.map((host) => (
                <span key={host.kind}>
                  {formatTaskState(host.kind)}: {formatTaskState(host.status)}{host.version ? ` ${host.version}` : ""}. {host.message}
                </span>
              ))}
            </div>
          ) : (
            <p className="panel-note">Runtime host details are not available yet.</p>
          )}
          {status?.installPlan && (
            <div className="plugin-detail-panel">
              <div className="panel-section-heading">
                <strong>{status.installPlan.primaryAction.label}</strong>
                <span>{formatTaskState(status.installPlan.preferredRuntime)}</span>
              </div>
              <p>{status.installPlan.summary}</p>
              <div className="plugin-note-list">
                {status.installPlan.prerequisites.map((item) => <span key={`prereq:${item}`}>{item}</span>)}
                {primaryInstallActionView?.commandPreview && (
                  <span>
                    Command plan: <code>{primaryInstallActionView.commandPreview}</code>
                  </span>
                )}
                {status.installPlan.postInstallSteps.map((item) => <span key={`step:${item}`}>{item}</span>)}
              </div>
            </div>
          )}
          {alternativeInstallActionViews.length > 0 && (
            <div className="plugin-detail-panel">
              <div className="panel-section-heading">
                <strong>Other supported paths</strong>
                <span>{alternativeInstallActionViews.length}</span>
              </div>
              <div className="plugin-note-list">
                {alternativeInstallActionViews.map((action) => (
                  <span key={action.actionId}>
                    {formatTaskState(action.runtime)}: {action.title}
                    {action.commandPreview && <code>{action.commandPreview}</code>}
                    {action.kind === "managed-install" && (
                      <button
                        type="button"
                        className="panel-button mini"
                        disabled={action.disabled}
                        title="Dry-run this managed install plan without executing package-manager commands."
                        onClick={() => onLaunchInstall(action.actionId, "dry-run")}
                      >
                        Review command plan
                      </button>
                    )}
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={action.disabled}
                      title={action.title}
                      onClick={() => onLaunchInstall(action.actionId)}
                    >
                      {launchBusy ? action.busyLabel : action.label}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {setupResumeRows.length > 0 && (
            <div className="plugin-detail-panel">
              <div className="panel-section-heading">
                <strong>Last setup attempt</strong>
                <span>resume</span>
              </div>
              <div className="plugin-note-list">
                {setupResumeRows.map((row) => <span key={row}>{row}</span>)}
              </div>
            </div>
          )}
          {status?.defaultCapabilities.length ? (
            <div className="plugin-detail-panel">
              <div className="panel-section-heading">
                <strong>Default capabilities</strong>
                <span>{status.defaultCapabilities.length}</span>
              </div>
              <div className="plugin-note-list">
                {status.defaultCapabilities.map((capability) => {
                  const action = mcpDefaultCapabilityInstallActionState(capability, {
                    runtimeReady: status.status === "ready",
                    busyKey: defaultCapabilityBusyKey,
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
            </div>
          ) : null}
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Not now
          </button>
          <button type="button" className="secondary-button" onClick={onOpenPlugins}>
            Open MCP settings
          </button>
          {diagnosticsAction.visible && (
            <button
              type="button"
              className="secondary-button"
              disabled={diagnosticsAction.disabled}
              title={diagnosticsAction.title}
              onClick={onExportDiagnostics}
            >
              {diagnosticsAction.label}
            </button>
          )}
          <button type="button" className="secondary-button" disabled={busy} onClick={onRefresh}>
            {busy ? "Checking" : mcpContainerRuntimePrimaryActionLabel(status?.status)}
          </button>
          {primarySetupAction?.kind === "managed-install" && (
            <button
              type="button"
              className="secondary-button"
              disabled={launchBusy}
              title="Dry-run this managed install plan without executing package-manager commands."
              onClick={() => onLaunchInstall(primarySetupAction.id, "dry-run")}
            >
              Review command plan
            </button>
          )}
          {primarySetupAction && (
            <button type="button" className="primary-button" disabled={launchBusy} onClick={() => onLaunchInstall(primarySetupAction.id)}>
              {launchBusy ? mcpContainerRuntimeInstallBusyLabel(primarySetupAction.kind) : primarySetupAction.label}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function CapabilityBuilderLauncherDialog({
  draft,
  newChat,
  busy,
  running,
  onChange,
  onChangeNewChat,
  onSubmit,
  onClose,
}: {
  draft: CapabilityBuilderLauncherDraft;
  newChat: boolean;
  busy: boolean;
  running: boolean;
  onChange: (patch: Partial<CapabilityBuilderLauncherDraft>) => void;
  onChangeNewChat: (value: boolean) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const canSubmit = Boolean(draft.goal.trim()) && !busy && !running;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="api-dialog capability-builder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capability-builder-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="api-dialog-header">
          <span className="dialog-icon plug-zap-dialog-icon">
            <Plug size={20} />
            <Zap size={12} />
            <Plus size={10} />
          </span>
          <div>
            <h2 id="capability-builder-dialog-title">Add Capability</h2>
            <p>Start a governed chat flow that plans an Ambient capability package before any scaffold or install step.</p>
          </div>
        </header>

        <label className="api-key-field">
          <span>Capability goal</span>
          <textarea
            className="panel-textarea capability-builder-goal"
            value={draft.goal}
            onChange={(event) => onChange({ goal: event.target.value })}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
              if (event.key === "Escape") onClose();
            }}
            placeholder="Generate voice files from text"
            disabled={busy}
            autoFocus
          />
        </label>

        <div className="capability-builder-grid">
          <label className="api-key-field">
            <span>Capability kind</span>
            <input
              value={draft.kind}
              onChange={(event) => onChange({ kind: event.target.value })}
              placeholder="artifact generator"
              disabled={busy}
            />
          </label>
          <label className="api-key-field">
            <span>Provider/runtime</span>
            <input
              value={draft.provider}
              onChange={(event) => onChange({ provider: event.target.value })}
              placeholder="Piper, ElevenLabs, ffmpeg"
              disabled={busy}
            />
          </label>
          <label className="api-key-field">
            <span>Output artifact type</span>
            <input
              value={draft.outputArtifact}
              onChange={(event) => onChange({ outputArtifact: event.target.value })}
              placeholder="WAV, MP3, PDF, JSON"
              disabled={busy}
            />
          </label>
          <label className="api-key-field">
            <span>Execution locality</span>
            <select
              className="panel-input"
              value={draft.locality}
              onChange={(event) => onChange({ locality: event.target.value as CapabilityBuilderLauncherDraft["locality"] })}
              disabled={busy}
            >
              <option value="either">Either</option>
              <option value="local">Local</option>
              <option value="network">Network/API</option>
            </select>
          </label>
        </div>

        <label className="plugin-toggle capability-builder-new-chat">
          <input type="checkbox" checked={newChat} disabled={busy} onChange={(event) => onChangeNewChat(event.target.checked)} />
          <span>Start in a new chat</span>
        </label>

        <div className="api-dialog-actions">
          <div className="api-dialog-left-actions">
            {running && <span className="panel-note">A run is already active.</span>}
          </div>
          <div className="api-dialog-right-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
              Close
            </button>
            <button type="button" className="primary-button" onClick={onSubmit} disabled={!canSubmit}>
              {busy ? "Starting..." : "Start planning"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
