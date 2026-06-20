import { FileText, FolderOpen, Pencil, Plug, RefreshCw, Trash2 } from "lucide-react";

import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import type {
  AmbientGeneratedCapabilitySummary,
  CapabilityBuilderHistoryEntry,
  CapabilityBuilderHistoryResult,
  CodexHostedMarketplaceReport,
  CodexMarketplaceSourceSummary,
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PiPackageCatalog,
  PiPackageInstallScope,
  PiPrivilegedCatalog,
  PiPrivilegedSecurityScan,
} from "../../shared/pluginTypes";
import {
  capabilityBuilderHistoryPreviewActionState,
  capabilityBuilderHistoryRepairPlanActionState,
  capabilityBuilderHistoryReregisterActionState,
  capabilityBuilderHistorySourceActionState,
  codexMarketplaceAddActionState,
  codexMarketplaceRemoveActionState,
  generatedCapabilityRemovalPlanActionState,
  generatedCapabilitySummaryFromHistoryEntry,
  generatedCapabilityUpdatePlanActionState,
} from "./pluginUiModel";
import {
  formatCodexMarketplaceSignatureStatus,
  formatCodexMarketplaceSourceKind,
  formatTaskState,
} from "./RightPanelDetailPanels";
import { RightPanelPluginPiPackagesPane } from "./RightPanelPluginPiPackagesPane";

type MaybePromise<T = unknown> = T | Promise<T>;

export type RightPanelPluginSourcesPaneProps = {
  running: boolean;
  capabilityBuilderHistory?: CapabilityBuilderHistoryResult;
  capabilityBuilderHistoryLoading: boolean;
  capabilityBuilderHistoryError?: string;
  capabilityBuilderHistoryPreviewStarting?: string;
  capabilityBuilderHistoryRepairPlanning?: string;
  capabilityBuilderHistoryReregisterStarting?: string;
  generatedCapabilitySourceOpening?: string;
  generatedCapabilityUpdatePlanning?: string;
  generatedCapabilityRemovalPlanning?: string;
  codexMarketplaceSources: CodexMarketplaceSourceSummary[];
  codexMarketplaceSourceInput: string;
  setCodexMarketplaceSourceInput: (value: string) => void;
  codexMarketplaceNameInput: string;
  setCodexMarketplaceNameInput: (value: string) => void;
  codexMarketplaceAllowExperimental: boolean;
  setCodexMarketplaceAllowExperimental: (value: boolean) => void;
  codexMarketplaceAdding: boolean;
  codexMarketplaceRemoving?: string;
  hostedMarketplaceReport?: CodexHostedMarketplaceReport;
  piPackageCatalog?: PiPackageCatalog;
  selectedPiPackageDetailId?: string;
  setSelectedPiPackageDetailId: (id?: string) => void;
  piPackageInstalling: boolean;
  piPackageUninstalling?: string;
  piPackageEnabling?: string;
  piExtensionSandboxCatalog?: PiExtensionSandboxCatalog;
  piExtensionSandboxInstalling: boolean;
  piExtensionSandboxFallback?: PiExtensionSandboxInstallPreview;
  piExtensionSandboxUninstalling?: string;
  piExtensionSandboxClearingHistory: boolean;
  piPrivilegedCatalog?: PiPrivilegedCatalog;
  piPrivilegedBusy?: string;
  piPrivilegedClearingHistory: boolean;
  piPrivilegedScan?: PiPrivilegedSecurityScan;
  piPrivilegedScanSource?: string;
  piPrivilegedScanning: boolean;
  piPrivilegedInstalling: boolean;
  piPackageSourceInput: string;
  setPiPackageSourceInput: (value: string) => void;
  piPackageInstallScope: PiPackageInstallScope;
  setPiPackageInstallScope: (scope: PiPackageInstallScope) => void;
  permissionAudit: PermissionAuditEntry[];
  addCodexMarketplace: () => MaybePromise;
  removeCodexMarketplace: (sourceId: string, source: string) => MaybePromise;
  loadCapabilityBuilderHistory: () => MaybePromise;
  startCapabilityBuilderHistoryPreview: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  startCapabilityBuilderHistoryReregister: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  startCapabilityBuilderHistoryRepairPlan: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  revealGeneratedCapabilitySource: (path: string | undefined) => MaybePromise;
  startGeneratedCapabilityUpdatePlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityRemovalPlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  installPiPackage: (source: string, scope?: PiPackageInstallScope) => MaybePromise;
  installPiExtensionSandboxPackage: (source: string) => MaybePromise;
  scanPiPrivilegedPackage: (source: string) => MaybePromise;
  installPiPrivilegedPackage: (source: string) => MaybePromise;
  uninstallPiPackage: (packageId: string) => MaybePromise;
  setPiPackageEnabled: (packageId: string, enabled: boolean) => MaybePromise;
  uninstallPiExtensionSandboxPackage: (packageId: string) => MaybePromise;
  clearPiExtensionSandboxHistory: () => MaybePromise;
  disablePiPrivilegedPackage: (packageId: string) => MaybePromise;
  uninstallPiPrivilegedPackage: (packageId: string) => MaybePromise;
  clearPiPrivilegedPackageHistory: () => MaybePromise;
};

export function RightPanelPluginSourcesPane({
  running,
  capabilityBuilderHistory,
  capabilityBuilderHistoryLoading,
  capabilityBuilderHistoryError,
  capabilityBuilderHistoryPreviewStarting,
  capabilityBuilderHistoryRepairPlanning,
  capabilityBuilderHistoryReregisterStarting,
  generatedCapabilitySourceOpening,
  generatedCapabilityUpdatePlanning,
  generatedCapabilityRemovalPlanning,
  codexMarketplaceSources,
  codexMarketplaceSourceInput,
  setCodexMarketplaceSourceInput,
  codexMarketplaceNameInput,
  setCodexMarketplaceNameInput,
  codexMarketplaceAllowExperimental,
  setCodexMarketplaceAllowExperimental,
  codexMarketplaceAdding,
  codexMarketplaceRemoving,
  hostedMarketplaceReport,
  piPackageCatalog,
  selectedPiPackageDetailId,
  setSelectedPiPackageDetailId,
  piPackageInstalling,
  piPackageUninstalling,
  piPackageEnabling,
  piExtensionSandboxCatalog,
  piExtensionSandboxInstalling,
  piExtensionSandboxFallback,
  piExtensionSandboxUninstalling,
  piExtensionSandboxClearingHistory,
  piPrivilegedCatalog,
  piPrivilegedBusy,
  piPrivilegedClearingHistory,
  piPrivilegedScan,
  piPrivilegedScanSource,
  piPrivilegedScanning,
  piPrivilegedInstalling,
  piPackageSourceInput,
  setPiPackageSourceInput,
  piPackageInstallScope,
  setPiPackageInstallScope,
  permissionAudit,
  addCodexMarketplace,
  removeCodexMarketplace,
  loadCapabilityBuilderHistory,
  startCapabilityBuilderHistoryPreview,
  startCapabilityBuilderHistoryReregister,
  startCapabilityBuilderHistoryRepairPlan,
  revealGeneratedCapabilitySource,
  startGeneratedCapabilityUpdatePlan,
  startGeneratedCapabilityRemovalPlan,
  installPiPackage,
  installPiExtensionSandboxPackage,
  scanPiPrivilegedPackage,
  installPiPrivilegedPackage,
  uninstallPiPackage,
  setPiPackageEnabled,
  uninstallPiExtensionSandboxPackage,
  clearPiExtensionSandboxHistory,
  disablePiPrivilegedPackage,
  uninstallPiPrivilegedPackage,
  clearPiPrivilegedPackageHistory,
}: RightPanelPluginSourcesPaneProps) {
  const generatedCapabilityHistoryEntries = capabilityBuilderHistory?.entries ?? [];
  const generatedCapabilityHistoryMissingInstalled = generatedCapabilityHistoryEntries.filter((entry) => !entry.installedPresent);
  const codexMarketplaceAddAction = codexMarketplaceAddActionState(
    codexMarketplaceSourceInput,
    codexMarketplaceAdding,
    codexMarketplaceAllowExperimental,
  );

  return (
    <div className="plugin-list">
      <section className="plugin-row">
        <div className="panel-section-heading">
          <strong>Add Codex Marketplace</strong>
          <span>Local path, GitHub, or advanced URL</span>
        </div>
        <div className="plugin-marketplace-add-row">
          <input
            className="panel-input"
            value={codexMarketplaceSourceInput}
            placeholder="./marketplace.json, https://..., or owner/repo"
            onChange={(event) => setCodexMarketplaceSourceInput(event.target.value)}
          />
          <input
            className="panel-input"
            value={codexMarketplaceNameInput}
            placeholder="Optional label"
            onChange={(event) => setCodexMarketplaceNameInput(event.target.value)}
          />
          <label
            className="plugin-toggle"
            title="Arbitrary non-GitHub marketplace URLs are experimental and should only be used for sources you trust."
          >
            <input
              type="checkbox"
              checked={codexMarketplaceAllowExperimental}
              onChange={(event) => setCodexMarketplaceAllowExperimental(event.target.checked)}
            />
            <span>Advanced URL</span>
          </label>
          <button
            type="button"
            className="panel-button mini"
            disabled={codexMarketplaceAddAction.disabled}
            title={codexMarketplaceAddAction.title}
            onClick={() => void addCodexMarketplace()}
          >
            {codexMarketplaceAddAction.label}
          </button>
        </div>
      </section>
      <section className="plugin-row">
        <div className="panel-section-heading">
          <strong>Generated Capability Sources</strong>
          <span>
            {capabilityBuilderHistoryLoading
              ? "Loading"
              : `${generatedCapabilityHistoryEntries.length} preserved source${generatedCapabilityHistoryEntries.length === 1 ? "" : "s"}, ${generatedCapabilityHistoryMissingInstalled.length} unregistered`}
          </span>
        </div>
        {capabilityBuilderHistoryError ? (
          <p className="panel-note">{capabilityBuilderHistoryError}</p>
        ) : generatedCapabilityHistoryEntries.length > 0 ? (
          <div className="plugin-sublist">
            {capabilityBuilderHistory?.errors.length ? (
              <div className="plugin-note-list">
                {capabilityBuilderHistory.errors.slice(0, 5).map((note) => (
                  <span key={note}>Discovery error: {note}</span>
                ))}
              </div>
            ) : null}
            {generatedCapabilityHistoryEntries.map((entry) => {
              const generated = generatedCapabilitySummaryFromHistoryEntry(entry);
              const sourceAction = capabilityBuilderHistorySourceActionState(entry, generatedCapabilitySourceOpening);
              const previewAction = capabilityBuilderHistoryPreviewActionState(entry, {
                busyPath: capabilityBuilderHistoryPreviewStarting,
                running,
              });
              const reregisterAction = capabilityBuilderHistoryReregisterActionState(entry, {
                busyPath: capabilityBuilderHistoryReregisterStarting,
                running,
              });
              const repairAction = capabilityBuilderHistoryRepairPlanActionState(entry, {
                busyPath: capabilityBuilderHistoryRepairPlanning,
                running,
              });
              const updateAction = generatedCapabilityUpdatePlanActionState(generated, {
                busyPath: generatedCapabilityUpdatePlanning,
                running,
              });
              const removalAction = generatedCapabilityRemovalPlanActionState(generated, {
                busyPath: generatedCapabilityRemovalPlanning,
                running,
              });
              return (
                <div className="plugin-source-entry" key={entry.relativeRootPath}>
                  <div className="plugin-row-header">
                    <strong>{entry.packageName}</strong>
                    <div className="plugin-row-actions">
                      <button
                        type="button"
                        className="panel-button mini icon-panel-button"
                        disabled={sourceAction.disabled}
                        title={sourceAction.title}
                        onClick={() => void revealGeneratedCapabilitySource(entry.relativeRootPath)}
                      >
                        <FolderOpen size={13} />
                        {sourceAction.label}
                      </button>
                      <button
                        type="button"
                        className="panel-button mini icon-panel-button"
                        disabled={previewAction.disabled}
                        title={previewAction.title}
                        onClick={() => void startCapabilityBuilderHistoryPreview(entry)}
                      >
                        <FileText size={13} />
                        {previewAction.label}
                      </button>
                      <button
                        type="button"
                        className="panel-button mini icon-panel-button"
                        disabled={reregisterAction.disabled}
                        title={reregisterAction.title}
                        onClick={() => void startCapabilityBuilderHistoryReregister(entry)}
                      >
                        <Plug size={13} />
                        {reregisterAction.label}
                      </button>
                      {repairAction.visible && (
                        <button
                          type="button"
                          className="panel-button mini icon-panel-button"
                          disabled={repairAction.disabled}
                          title={repairAction.title}
                          onClick={() => void startCapabilityBuilderHistoryRepairPlan(entry)}
                        >
                          <Pencil size={13} />
                          {repairAction.label}
                        </button>
                      )}
                      <button
                        type="button"
                        className="panel-button mini icon-panel-button"
                        disabled={updateAction.disabled}
                        title={updateAction.title}
                        onClick={() => void startGeneratedCapabilityUpdatePlan(entry.packageName, generated)}
                      >
                        <RefreshCw size={13} />
                        {updateAction.label}
                      </button>
                      <button
                        type="button"
                        className="panel-button mini icon-panel-button danger"
                        disabled={removalAction.disabled}
                        title={removalAction.title}
                        onClick={() => void startGeneratedCapabilityRemovalPlan(entry.packageName, generated)}
                      >
                        <Trash2 size={13} />
                        {removalAction.label}
                      </button>
                    </div>
                  </div>
                  {entry.goal && <p>{entry.goal}</p>}
                  <div className="plugin-badges">
                    <span>{formatTaskState(entry.status)}</span>
                    <span>{entry.valid ? "Valid preview" : "Preview has errors"}</span>
                    <span>{entry.installedPresent ? "Installed" : "Not installed"}</span>
                    {entry.kind && <span>{entry.kind}</span>}
                    {entry.provider && <span>{entry.provider}</span>}
                    {entry.commandNames.length > 0 && <span>{entry.commandNames.length} command{entry.commandNames.length === 1 ? "" : "s"}</span>}
                    {entry.artifactOutputTypes.length > 0 && <span>{entry.artifactOutputTypes.join(", ")}</span>}
                  </div>
                  <code className="plugin-cache-path">
                    {[
                      entry.relativeRootPath,
                      entry.gitSha ? `sha: ${entry.gitSha}` : undefined,
                      entry.lastValidatedAt ? `validated: ${entry.lastValidatedAt}` : undefined,
                      entry.registeredAt ? `registered: ${entry.registeredAt}` : undefined,
                      entry.unregisteredAt ? `unregistered: ${entry.unregisteredAt}` : undefined,
                      entry.refs.installed ? `installed ref: ${entry.refs.installed}` : undefined,
                      entry.refs.lastValidated ? `validated ref: ${entry.refs.lastValidated}` : undefined,
                      entry.refs.lastRepair ? `repair ref: ${entry.refs.lastRepair}` : undefined,
                    ].filter(Boolean).join("\n")}
                  </code>
                  {(entry.errors.length > 0 || entry.warnings.length > 0) && (
                    <div className="plugin-note-list">
                      {[...entry.errors, ...entry.warnings].slice(0, 5).map((note) => (
                        <span key={note}>{note}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p>No generated capability sources have been created in this workspace yet.</p>
        )}
        <div className="plugin-row-actions">
          <button
            type="button"
            className="panel-button mini"
            disabled={capabilityBuilderHistoryLoading}
            onClick={() => void loadCapabilityBuilderHistory()}
          >
            {capabilityBuilderHistoryLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </section>
      <section className="plugin-row">
        <div className="panel-section-heading">
          <strong>Sources</strong>
          <span>{codexMarketplaceSources.length} marketplace entries</span>
        </div>
        {codexMarketplaceSources.length > 0 ? (
          <div className="plugin-sublist">
            {codexMarketplaceSources.map((source) => {
              const removeAction = codexMarketplaceRemoveActionState(source, codexMarketplaceRemoving);
              return (
                <div className="plugin-source-entry" key={source.id}>
                  <code>
                    {[
                      source.label,
                      formatCodexMarketplaceSourceKind(source.kind),
                      source.source,
                      source.pluginCount !== undefined ? `${source.pluginCount} plugins` : undefined,
                      source.signatureStatus ? formatCodexMarketplaceSignatureStatus(source.signatureStatus) : undefined,
                      source.signatureKeyId ? `signature key: ${source.signatureKeyId}` : undefined,
                      source.signatureGeneratedAt ? `signed: ${source.signatureGeneratedAt}` : undefined,
                      source.signatureError ? `signature error: ${source.signatureError}` : undefined,
                      source.contentChecksum,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </code>
                  {removeAction.visible && (
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={removeAction.disabled}
                      title={removeAction.title}
                      onClick={() => void removeCodexMarketplace(source.id, source.source)}
                    >
                      {removeAction.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p>No Codex marketplace source is configured for this workspace.</p>
        )}
      </section>
      {hostedMarketplaceReport && (
        <section className="plugin-row">
          <div className="panel-section-heading">
            <strong>Hosted Codex Marketplace</strong>
            <span>{formatTaskState(hostedMarketplaceReport.status)}</span>
          </div>
          <p>{hostedMarketplaceReport.message}</p>
          <div className="plugin-badges">
            <span>{hostedMarketplaceReport.source === "codex-app-server" ? "Codex app-server oracle" : "Ambient local catalog"}</span>
            <span>{hostedMarketplaceReport.marketplaceCount} marketplace{hostedMarketplaceReport.marketplaceCount === 1 ? "" : "s"}</span>
            <span>{hostedMarketplaceReport.pluginCount} hosted plugin{hostedMarketplaceReport.pluginCount === 1 ? "" : "s"}</span>
            <span>{hostedMarketplaceReport.matchedPluginCount} matched in Ambient</span>
            <span>{hostedMarketplaceReport.readComparisonCount} read probe{hostedMarketplaceReport.readComparisonCount === 1 ? "" : "s"}</span>
            <span>{hostedMarketplaceReport.ambientCandidateCount} Ambient candidates</span>
          </div>
          {hostedMarketplaceReport.command && <code className="plugin-cache-path">{hostedMarketplaceReport.command}</code>}
          <div className="plugin-note-list">
            {hostedMarketplaceReport.notes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>
          <div className="plugin-sublist">
            <strong>Protocol methods</strong>
            <code>{hostedMarketplaceReport.protocolMethods.join(", ")}</code>
          </div>
          {hostedMarketplaceReport.marketplaceLoadErrors.length > 0 && (
            <div className="plugin-note-list">
              {hostedMarketplaceReport.marketplaceLoadErrors.map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          )}
          {hostedMarketplaceReport.readComparisons.length > 0 && (
            <div className="plugin-sublist">
              <strong>Read comparisons</strong>
              {hostedMarketplaceReport.readComparisons.map((comparison) => (
                <span key={`${comparison.marketplaceName}:${comparison.pluginName}`}>
                  {comparison.pluginName}: {formatTaskState(comparison.status)}
                  {comparison.skillCount !== undefined ? `, ${comparison.skillCount} skills` : ""}
                  {comparison.mcpServerCount !== undefined ? `, ${comparison.mcpServerCount} MCP servers` : ""}
                  {comparison.error ? ` - ${comparison.error}` : ""}
                </span>
              ))}
            </div>
          )}
          {hostedMarketplaceReport.marketplaces.slice(0, 4).map((marketplace) => (
            <div className="plugin-sublist" key={`${marketplace.name}:${marketplace.path ?? "hosted"}`}>
              <strong>{marketplace.displayName ?? marketplace.name}</strong>
              <span>{formatCodexMarketplaceSourceKind(marketplace.marketplaceKind)}</span>
              <span>{marketplace.pluginCount} plugin{marketplace.pluginCount === 1 ? "" : "s"}</span>
              {marketplace.path && <code>{marketplace.path}</code>}
              {marketplace.plugins.slice(0, 8).map((plugin) => (
                <span key={plugin.id ?? `${marketplace.name}:${plugin.name}`}>
                  {plugin.displayName ?? plugin.name}
                  {plugin.installed !== undefined ? ` - ${plugin.installed ? "installed" : "not installed"}` : ""}
                </span>
              ))}
            </div>
          ))}
          {hostedMarketplaceReport.missingInAmbient.length > 0 && (
            <div className="plugin-note-list">
              <span>Hosted-only: {hostedMarketplaceReport.missingInAmbient.slice(0, 8).join(", ")}</span>
            </div>
          )}
          {hostedMarketplaceReport.extraInAmbient.length > 0 && (
            <div className="plugin-note-list">
              <span>Ambient-only: {hostedMarketplaceReport.extraInAmbient.slice(0, 8).join(", ")}</span>
            </div>
          )}
        </section>
      )}
      <RightPanelPluginPiPackagesPane
        piPackageCatalog={piPackageCatalog}
        selectedPiPackageDetailId={selectedPiPackageDetailId}
        setSelectedPiPackageDetailId={setSelectedPiPackageDetailId}
        piPackageInstalling={piPackageInstalling}
        piPackageUninstalling={piPackageUninstalling}
        piPackageEnabling={piPackageEnabling}
        piExtensionSandboxCatalog={piExtensionSandboxCatalog}
        piExtensionSandboxInstalling={piExtensionSandboxInstalling}
        piExtensionSandboxFallback={piExtensionSandboxFallback}
        piExtensionSandboxUninstalling={piExtensionSandboxUninstalling}
        piExtensionSandboxClearingHistory={piExtensionSandboxClearingHistory}
        piPrivilegedCatalog={piPrivilegedCatalog}
        piPrivilegedBusy={piPrivilegedBusy}
        piPrivilegedClearingHistory={piPrivilegedClearingHistory}
        piPrivilegedScan={piPrivilegedScan}
        piPrivilegedScanSource={piPrivilegedScanSource}
        piPrivilegedScanning={piPrivilegedScanning}
        piPrivilegedInstalling={piPrivilegedInstalling}
        piPackageSourceInput={piPackageSourceInput}
        setPiPackageSourceInput={setPiPackageSourceInput}
        piPackageInstallScope={piPackageInstallScope}
        setPiPackageInstallScope={setPiPackageInstallScope}
        permissionAudit={permissionAudit}
        installPiPackage={installPiPackage}
        installPiExtensionSandboxPackage={installPiExtensionSandboxPackage}
        scanPiPrivilegedPackage={scanPiPrivilegedPackage}
        installPiPrivilegedPackage={installPiPrivilegedPackage}
        uninstallPiPackage={uninstallPiPackage}
        setPiPackageEnabled={setPiPackageEnabled}
        uninstallPiExtensionSandboxPackage={uninstallPiExtensionSandboxPackage}
        clearPiExtensionSandboxHistory={clearPiExtensionSandboxHistory}
        disablePiPrivilegedPackage={disablePiPrivilegedPackage}
        uninstallPiPrivilegedPackage={uninstallPiPrivilegedPackage}
        clearPiPrivilegedPackageHistory={clearPiPrivilegedPackageHistory}
      />
    </div>
  );
}
