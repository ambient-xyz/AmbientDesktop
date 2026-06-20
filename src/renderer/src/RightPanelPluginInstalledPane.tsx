import { CheckCircle2, FolderOpen, RefreshCw, Trash2 } from "lucide-react";

import type {
  AmbientGeneratedCapabilitySummary,
  AmbientPluginCapabilitySummary,
  AmbientPluginSummary,
  CodexPluginSummary,
} from "../../shared/pluginTypes";
import {
  formatAmbientCapabilityKind,
  formatAmbientPluginSourceKind,
  formatAmbientRuntimeSupport,
  generatedCapabilityRemovalPlanActionState,
  generatedCapabilitySourceActionState,
  generatedCapabilityUpdatePlanActionState,
  generatedCapabilityValidationActionState,
  pluginDetailsActionState,
} from "./pluginUiModel";
import { formatPluginCompatibility, formatTaskState } from "./RightPanelDetailPanels";

type MaybePromise<T = unknown> = T | Promise<T>;

export type RightPanelPluginInstalledPaneProps = {
  plugins: AmbientPluginSummary[];
  capabilities: AmbientPluginCapabilitySummary[];
  codexPlugins: CodexPluginSummary[];
  selectedPluginDetailId?: string;
  setSelectedPluginDetailId: (id?: string) => void;
  running: boolean;
  generatedCapabilitySourceOpening?: string;
  generatedCapabilityValidationStarting?: string;
  generatedCapabilityUpdatePlanning?: string;
  generatedCapabilityRemovalPlanning?: string;
  pluginDependencyInstalling?: string;
  revealGeneratedCapabilitySource: (path: string | undefined) => MaybePromise;
  setPluginTrusted: (pluginId: string, trusted: boolean) => MaybePromise;
  setPluginEnabled: (pluginId: string, enabled: boolean) => MaybePromise;
  uninstallCodexPlugin: (pluginId: string) => MaybePromise;
  startGeneratedCapabilityValidation: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityUpdatePlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityRemovalPlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  installCodexPluginDependencies: (pluginId: string) => MaybePromise;
};

export function RightPanelPluginInstalledPane({
  plugins,
  capabilities,
  codexPlugins,
  selectedPluginDetailId,
  setSelectedPluginDetailId,
  running,
  generatedCapabilitySourceOpening,
  generatedCapabilityValidationStarting,
  generatedCapabilityUpdatePlanning,
  generatedCapabilityRemovalPlanning,
  pluginDependencyInstalling,
  revealGeneratedCapabilitySource,
  setPluginTrusted,
  setPluginEnabled,
  uninstallCodexPlugin,
  startGeneratedCapabilityValidation,
  startGeneratedCapabilityUpdatePlan,
  startGeneratedCapabilityRemovalPlan,
  installCodexPluginDependencies,
}: RightPanelPluginInstalledPaneProps) {
  const codexPluginsById = new Map(codexPlugins.map((plugin) => [plugin.id, plugin]));
  return (
    <div className="plugin-list">
      {plugins.length > 0 ? (
        plugins.map((plugin) => (
          <RightPanelInstalledPluginRow
            key={plugin.id}
            plugin={plugin}
            pluginCapabilities={capabilities.filter((capability) => capability.pluginId === plugin.sourcePluginId)}
            codexPlugin={codexPluginsById.get(plugin.sourcePluginId)}
            selectedPluginDetailId={selectedPluginDetailId}
            setSelectedPluginDetailId={setSelectedPluginDetailId}
            running={running}
            generatedCapabilitySourceOpening={generatedCapabilitySourceOpening}
            generatedCapabilityValidationStarting={generatedCapabilityValidationStarting}
            generatedCapabilityUpdatePlanning={generatedCapabilityUpdatePlanning}
            generatedCapabilityRemovalPlanning={generatedCapabilityRemovalPlanning}
            pluginDependencyInstalling={pluginDependencyInstalling}
            revealGeneratedCapabilitySource={revealGeneratedCapabilitySource}
            setPluginTrusted={setPluginTrusted}
            setPluginEnabled={setPluginEnabled}
            uninstallCodexPlugin={uninstallCodexPlugin}
            startGeneratedCapabilityValidation={startGeneratedCapabilityValidation}
            startGeneratedCapabilityUpdatePlan={startGeneratedCapabilityUpdatePlan}
            startGeneratedCapabilityRemovalPlan={startGeneratedCapabilityRemovalPlan}
            installCodexPluginDependencies={installCodexPluginDependencies}
          />
        ))
      ) : (
        <p className="panel-note">No installed plugins match the selected source filter.</p>
      )}
    </div>
  );
}

type RightPanelInstalledPluginRowProps = {
  plugin: AmbientPluginSummary;
  pluginCapabilities: AmbientPluginCapabilitySummary[];
  codexPlugin?: CodexPluginSummary;
  selectedPluginDetailId?: string;
  setSelectedPluginDetailId: (id?: string) => void;
  running: boolean;
  generatedCapabilitySourceOpening?: string;
  generatedCapabilityValidationStarting?: string;
  generatedCapabilityUpdatePlanning?: string;
  generatedCapabilityRemovalPlanning?: string;
  pluginDependencyInstalling?: string;
  revealGeneratedCapabilitySource: (path: string | undefined) => MaybePromise;
  setPluginTrusted: (pluginId: string, trusted: boolean) => MaybePromise;
  setPluginEnabled: (pluginId: string, enabled: boolean) => MaybePromise;
  uninstallCodexPlugin: (pluginId: string) => MaybePromise;
  startGeneratedCapabilityValidation: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityUpdatePlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityRemovalPlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  installCodexPluginDependencies: (pluginId: string) => MaybePromise;
};

function RightPanelInstalledPluginRow({
  plugin,
  pluginCapabilities,
  codexPlugin,
  selectedPluginDetailId,
  setSelectedPluginDetailId,
  running,
  generatedCapabilitySourceOpening,
  generatedCapabilityValidationStarting,
  generatedCapabilityUpdatePlanning,
  generatedCapabilityRemovalPlanning,
  pluginDependencyInstalling,
  revealGeneratedCapabilitySource,
  setPluginTrusted,
  setPluginEnabled,
  uninstallCodexPlugin,
  startGeneratedCapabilityValidation,
  startGeneratedCapabilityUpdatePlan,
  startGeneratedCapabilityRemovalPlan,
  installCodexPluginDependencies,
}: RightPanelInstalledPluginRowProps) {
  const detailsAction = pluginDetailsActionState(plugin, selectedPluginDetailId);
  const generatedSourceAction = generatedCapabilitySourceActionState(plugin.generated, generatedCapabilitySourceOpening);
  const generatedValidationAction = generatedCapabilityValidationActionState(plugin.generated, {
    busyPath: generatedCapabilityValidationStarting,
    running,
  });
  const generatedUpdatePlanAction = generatedCapabilityUpdatePlanActionState(plugin.generated, {
    busyPath: generatedCapabilityUpdatePlanning,
    running,
  });
  const generatedRemovalPlanAction = generatedCapabilityRemovalPlanActionState(plugin.generated, {
    busyPath: generatedCapabilityRemovalPlanning,
    running,
  });
  const detailsOpen = selectedPluginDetailId === plugin.id;
  const pluginSourceDetailLines = [
    plugin.sourcePluginId,
    plugin.generated?.sourcePath ? `builder source: ${plugin.generated.sourcePath}` : undefined,
    plugin.generated?.status ? `build status: ${plugin.generated.status}` : undefined,
    plugin.generated?.registeredAt ? `registered: ${plugin.generated.registeredAt}` : undefined,
    plugin.generated?.lastValidatedAt ? `validated: ${plugin.generated.lastValidatedAt}` : undefined,
    plugin.generated?.refs.installed ? `installed ref: ${plugin.generated.refs.installed}` : undefined,
    plugin.generated?.refs.lastValidated ? `validated ref: ${plugin.generated.refs.lastValidated}` : undefined,
    plugin.generated?.refs.lastRepair ? `repair ref: ${plugin.generated.refs.lastRepair}` : undefined,
    plugin.generated?.refs.latest ? `latest ref: ${plugin.generated.refs.latest}` : undefined,
    codexPlugin?.rootPath ? `root: ${codexPlugin.rootPath}` : undefined,
    codexPlugin?.sourceType ? `source: ${codexPlugin.sourceType}` : undefined,
    codexPlugin?.sourceUrl ? `url: ${codexPlugin.sourceUrl}` : undefined,
    codexPlugin?.sourcePath ? `path: ${codexPlugin.sourcePath}` : undefined,
    codexPlugin?.sourceRef ? `ref: ${codexPlugin.sourceRef}` : undefined,
    codexPlugin?.sourceSha ? `sha: ${codexPlugin.sourceSha}` : undefined,
    codexPlugin?.sourceChecksum ? `checksum: ${codexPlugin.sourceChecksum}` : undefined,
    codexPlugin?.sourceBundleChecksum ? `bundle checksum: ${codexPlugin.sourceBundleChecksum}` : undefined,
    codexPlugin?.publisher ? `publisher: ${codexPlugin.publisher}` : undefined,
    codexPlugin?.license ? `license: ${codexPlugin.license}` : undefined,
    codexPlugin?.ambientCompatibility ? `ambient compatibility: ${codexPlugin.ambientCompatibility}` : undefined,
    codexPlugin?.capabilitySummary?.length ? `marketplace capabilities: ${codexPlugin.capabilitySummary.join(", ")}` : undefined,
    codexPlugin?.authPolicy ? `auth policy: ${codexPlugin.authPolicy}` : undefined,
  ].filter((line): line is string => Boolean(line));

  return (
    <section className="plugin-row">
      <div className="plugin-row-header">
        <strong>{plugin.displayName ?? plugin.name}</strong>
        {codexPlugin ? (
          <div className="plugin-row-actions">
            {detailsAction.visible && (
              <button
                type="button"
                className="panel-button mini"
                title={detailsAction.title}
                onClick={() => setSelectedPluginDetailId(detailsOpen ? undefined : plugin.id)}
              >
                {detailsAction.label}
              </button>
            )}
            {generatedSourceAction.visible && (
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={generatedSourceAction.disabled}
                title={generatedSourceAction.title}
                onClick={() => void revealGeneratedCapabilitySource(plugin.generated?.sourcePath)}
              >
                <FolderOpen size={13} />
                {generatedSourceAction.label}
              </button>
            )}
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void setPluginTrusted(codexPlugin.id, !codexPlugin.trusted)}
            >
              {codexPlugin.trusted ? "Revoke trust" : "Trust"}
            </button>
            <label className="plugin-toggle">
              <input
                type="checkbox"
                checked={codexPlugin.enabled}
                onChange={(event) => void setPluginEnabled(codexPlugin.id, event.target.checked)}
              />
              <span>{plugin.version ?? "local"}</span>
            </label>
            <button
              type="button"
              className="panel-button mini danger"
              title="Remove this plugin from the workspace marketplace. Ambient-owned imported plugin files are deleted."
              onClick={() => void uninstallCodexPlugin(codexPlugin.id)}
            >
              Uninstall
            </button>
          </div>
        ) : (
          <div className="plugin-row-actions">
            {detailsAction.visible && (
              <button
                type="button"
                className="panel-button mini"
                title={detailsAction.title}
                onClick={() => setSelectedPluginDetailId(detailsOpen ? undefined : plugin.id)}
              >
                {detailsAction.label}
              </button>
            )}
            {generatedSourceAction.visible && (
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={generatedSourceAction.disabled}
                title={generatedSourceAction.title}
                onClick={() => void revealGeneratedCapabilitySource(plugin.generated?.sourcePath)}
              >
                <FolderOpen size={13} />
                {generatedSourceAction.label}
              </button>
            )}
            <span>{plugin.installState}</span>
          </div>
        )}
      </div>
      {plugin.description && <p>{plugin.description}</p>}
      <div className="plugin-badges">
        <span>{formatAmbientPluginSourceKind(plugin.sourceKind)}</span>
        <span className={`plugin-tier ${plugin.compatibilityTier}`}>{formatPluginCompatibility(plugin.compatibilityTier)}</span>
        <span>{plugin.enabled ? "Enabled" : "Disabled"}</span>
        <span>{plugin.trusted ? "Trusted" : "Trust required for code"}</span>
        <span>{plugin.capabilityCount} capabilities</span>
        {plugin.supportLabels.map((label) => (
          <span className="plugin-support-label" key={label}>{label}</span>
        ))}
      </div>
      {plugin.diagnostics.length > 0 && (
        <div className="plugin-note-list">
          {plugin.diagnostics.slice(0, 5).map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}
      {detailsOpen && (
        <div className="plugin-detail-panel">
          <div className="panel-section-heading">
            <strong>Plugin Details</strong>
            <span>{plugin.sourceLabel}</span>
          </div>
          <div className="plugin-badges">
            <span>{formatAmbientPluginSourceKind(plugin.sourceKind)}</span>
            <span>{formatTaskState(plugin.installState)}</span>
            <span>{plugin.enabled ? "Enabled" : "Disabled"}</span>
            <span>{plugin.trusted ? "Trusted" : "Trust required"}</span>
            <span>{pluginCapabilities.length} capability{pluginCapabilities.length === 1 ? "" : "s"}</span>
          </div>
          <code className="plugin-cache-path">{pluginSourceDetailLines.join("\n")}</code>
          {plugin.generated && (
            <div className="plugin-detail-actions">
              <div className="plugin-note-list">
                <span>Generated capability management starts a chat-first Capability Builder flow.</span>
              </div>
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={generatedValidationAction.disabled}
                title={generatedValidationAction.title}
                onClick={() => void startGeneratedCapabilityValidation(plugin.displayName ?? plugin.name, plugin.generated)}
              >
                <CheckCircle2 size={13} />
                {generatedValidationAction.label}
              </button>
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={generatedUpdatePlanAction.disabled}
                title={generatedUpdatePlanAction.title}
                onClick={() => void startGeneratedCapabilityUpdatePlan(plugin.displayName ?? plugin.name, plugin.generated)}
              >
                <RefreshCw size={13} />
                {generatedUpdatePlanAction.label}
              </button>
              <button
                type="button"
                className="panel-button mini icon-panel-button danger"
                disabled={generatedRemovalPlanAction.disabled}
                title={generatedRemovalPlanAction.title}
                onClick={() => void startGeneratedCapabilityRemovalPlan(plugin.displayName ?? plugin.name, plugin.generated)}
              >
                <Trash2 size={13} />
                {generatedRemovalPlanAction.label}
              </button>
            </div>
          )}
          {codexPlugin?.dependencyStatus?.required && (
            <div className="plugin-detail-actions">
              <div className="plugin-note-list">
                <span>
                  Dependencies {codexPlugin.dependencyStatus.installed ? "installed" : "missing"} via {codexPlugin.dependencyStatus.manager}
                </span>
                {!codexPlugin.dependencyStatus.installed && codexPlugin.dependencyStatus.missingPackages.length > 0 && (
                  <span>{codexPlugin.dependencyStatus.missingPackages.slice(0, 6).join(", ")}</span>
                )}
              </div>
              {!codexPlugin.dependencyStatus.installed && (
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={pluginDependencyInstalling === codexPlugin.id}
                  title="Install package dependencies for this plugin MCP server. Ambient will ask for confirmation first and disable lifecycle scripts."
                  onClick={() => void installCodexPluginDependencies(codexPlugin.id)}
                >
                  {pluginDependencyInstalling === codexPlugin.id ? "Installing" : "Install dependencies"}
                </button>
              )}
            </div>
          )}
          {pluginCapabilities.length > 0 && (
            <div className="plugin-note-list">
              {pluginCapabilities.slice(0, 8).map((capability) => (
                <span key={capability.id}>
                  {capability.displayName ?? capability.name} - {formatAmbientCapabilityKind(capability.kind)} - {formatAmbientRuntimeSupport(capability.runtimeSupport)}
                </span>
              ))}
            </div>
          )}
          {plugin.diagnostics.length === 0 && <p>No plugin diagnostics were reported.</p>}
        </div>
      )}
    </section>
  );
}
