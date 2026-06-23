import { Package, Plug, Plus, RefreshCw, Zap } from "lucide-react";
import type { RightPanelPluginHostModel } from "./RightPanelPluginHostModel";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";
import type { RightPanelPluginHostProps } from "./RightPanelPluginHostTypes";

type RightPanelPluginHostChromeProps = {
  host: RightPanelPluginHostProps;
  model: RightPanelPluginHostModel;
};

export function RightPanelPluginHostChrome({ host, model }: RightPanelPluginHostChromeProps) {
  return (
    <>
      <div className="panel-action-row">
        <button type="button" className="panel-button icon-panel-button" onClick={() => void host.loadPluginCatalog()}>
          <RefreshCw size={14} />
          Refresh
        </button>
        <button
          type="button"
          className="panel-button icon-only-panel-button"
          disabled={host.running}
          onClick={() => host.setCapabilityBuilderLauncherOpen(true)}
          title={host.running ? "Wait for the current run to finish before starting Capability Builder." : "Add capability"}
          aria-label="Add capability"
        >
          <span className="plug-zap-plus-icon" aria-hidden="true">
            <Plug size={14} />
            <Zap size={10} />
            <Plus size={9} />
          </span>
        </button>
        {host.firstRunCapabilityOnboardingDismissed && (
          <button type="button" className="panel-button mini" onClick={host.resumeFirstRunCapabilityOnboarding}>
            Resume setup
          </button>
        )}
        <button
          type="button"
          className="panel-button icon-panel-button"
          disabled={!host.pluginCatalog || host.mcpInspecting}
          onClick={() => void host.inspectPluginMcp()}
        >
          <Plug size={14} />
          {host.mcpInspecting ? "Inspecting" : "Inspect MCP"}
        </button>
        <button
          type="button"
          className="panel-button icon-panel-button"
          disabled={host.piPackageInspecting}
          onClick={() => void host.inspectPiPackages()}
          title="Inspect Pi package metadata without installing or running package code."
        >
          <Package size={14} />
          {host.piPackageInspecting ? "Inspecting" : "Inspect Pi packages"}
        </button>
      </div>
      {host.mcpInspectionError && <p className="panel-note">{host.mcpInspectionError}</p>}
      {host.piPackageError && <p className="panel-note">{host.piPackageError}</p>}
      {model.showFirstRunCapabilityOnboarding && (
        <section className="plugin-auth-complete">
          <div>
            <strong>Set up core capabilities</strong>
            <span>
              Start a skippable chat-first setup for voice, search/web, remote access, browser automation, and document/media conversion.
            </span>
          </div>
          <button
            type="button"
            className="panel-button mini"
            disabled={host.running || host.firstRunCapabilityOnboardingStarting}
            onClick={() => void host.startFirstRunCapabilityOnboarding()}
          >
            {host.firstRunCapabilityOnboardingStarting ? "Starting" : "Start setup"}
          </button>
          <button type="button" className="panel-button mini" onClick={host.dismissFirstRunCapabilityOnboarding}>
            Skip for now
          </button>
        </section>
      )}
      {host.pluginAuthStatus && <p className={`panel-status ${host.pluginAuthStatus.kind}`}>{host.pluginAuthStatus.message}</p>}
      {host.pluginAuthPending && (
        <section className="plugin-auth-complete">
          <div>
            <strong>{host.pluginAuthPending.providerId === "google.workspace" ? "Finish Google Auth" : "Finish Plugin App Auth"}</strong>
            <span>
              {host.pluginAuthPending.providerId} expires {formatTimelineTime(host.pluginAuthPending.expiresAt)}
            </span>
          </div>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="panel-input"
            value={host.pluginAuthCode}
            placeholder="Authorization code"
            onChange={(event) => host.setPluginAuthCode(event.target.value)}
          />
          <button
            type="button"
            className="panel-button mini"
            disabled={model.pluginAuthCompleteAction.disabled}
            title={model.pluginAuthCompleteAction.title}
            onClick={() => void host.completePluginAppAuth()}
          >
            {model.pluginAuthCompleteAction.label}
          </button>
          <button
            type="button"
            className="panel-button mini"
            disabled={Boolean(host.pluginAuthBusy)}
            onClick={() => {
              host.setPluginAuthPending(undefined);
              host.setPluginAuthCode("");
            }}
          >
            Cancel
          </button>
        </section>
      )}
      {host.pluginDependencyStatus && (
        <p className={`panel-status ${host.pluginDependencyStatus.kind}`}>{host.pluginDependencyStatus.message}</p>
      )}
      {host.mcpServerStatus && <p className={`panel-status ${host.mcpServerStatus.kind}`}>{host.mcpServerStatus.message}</p>}
      {host.mcpServerError && <p className="panel-status error">{host.mcpServerError}</p>}
      {host.pluginCapabilityDiagnosticsError && <p className="panel-note">{host.pluginCapabilityDiagnosticsError}</p>}
    </>
  );
}
