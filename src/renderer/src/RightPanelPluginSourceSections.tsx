import { FileText, FolderOpen, Pencil, Plug, RefreshCw, Trash2 } from "lucide-react";

import type {
  AmbientGeneratedCapabilitySummary,
  CapabilityBuilderHistoryEntry,
  CapabilityBuilderHistoryResult,
  CodexHostedMarketplaceReport,
  CodexMarketplaceSourceSummary,
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
import { formatCodexMarketplaceSignatureStatus, formatCodexMarketplaceSourceKind, formatTaskState } from "./RightPanelDetailPanels";

type MaybePromise<T = unknown> = T | Promise<T>;

export function CodexMarketplaceAddSection({
  codexMarketplaceAllowExperimental,
  codexMarketplaceAdding,
  codexMarketplaceNameInput,
  codexMarketplaceSourceInput,
  setCodexMarketplaceAllowExperimental,
  setCodexMarketplaceNameInput,
  setCodexMarketplaceSourceInput,
  addCodexMarketplace,
}: {
  codexMarketplaceAllowExperimental: boolean;
  codexMarketplaceAdding: boolean;
  codexMarketplaceNameInput: string;
  codexMarketplaceSourceInput: string;
  setCodexMarketplaceAllowExperimental: (value: boolean) => void;
  setCodexMarketplaceNameInput: (value: string) => void;
  setCodexMarketplaceSourceInput: (value: string) => void;
  addCodexMarketplace: () => MaybePromise;
}) {
  const codexMarketplaceAddAction = codexMarketplaceAddActionState(
    codexMarketplaceSourceInput,
    codexMarketplaceAdding,
    codexMarketplaceAllowExperimental,
  );

  return (
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
  );
}

export function GeneratedCapabilitySourcesSection({
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
  loadCapabilityBuilderHistory,
  revealGeneratedCapabilitySource,
  startCapabilityBuilderHistoryPreview,
  startCapabilityBuilderHistoryRepairPlan,
  startCapabilityBuilderHistoryReregister,
  startGeneratedCapabilityRemovalPlan,
  startGeneratedCapabilityUpdatePlan,
}: {
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
  loadCapabilityBuilderHistory: () => MaybePromise;
  revealGeneratedCapabilitySource: (path: string | undefined) => MaybePromise;
  startCapabilityBuilderHistoryPreview: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  startCapabilityBuilderHistoryRepairPlan: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  startCapabilityBuilderHistoryReregister: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  startGeneratedCapabilityRemovalPlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityUpdatePlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
}) {
  const generatedCapabilityHistoryEntries = capabilityBuilderHistory?.entries ?? [];
  const generatedCapabilityHistoryMissingInstalled = generatedCapabilityHistoryEntries.filter((entry) => !entry.installedPresent);

  return (
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
                  {entry.commandNames.length > 0 && (
                    <span>
                      {entry.commandNames.length} command{entry.commandNames.length === 1 ? "" : "s"}
                    </span>
                  )}
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
                  ]
                    .filter(Boolean)
                    .join("\n")}
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
  );
}

export function CodexMarketplaceSourcesSection({
  codexMarketplaceRemoving,
  codexMarketplaceSources,
  removeCodexMarketplace,
}: {
  codexMarketplaceRemoving?: string;
  codexMarketplaceSources: CodexMarketplaceSourceSummary[];
  removeCodexMarketplace: (sourceId: string, source: string) => MaybePromise;
}) {
  return (
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
  );
}

export function HostedCodexMarketplaceSection({ report }: { report: CodexHostedMarketplaceReport }) {
  return (
    <section className="plugin-row">
      <div className="panel-section-heading">
        <strong>Hosted Codex Marketplace</strong>
        <span>{formatTaskState(report.status)}</span>
      </div>
      <p>{report.message}</p>
      <div className="plugin-badges">
        <span>{report.source === "codex-app-server" ? "Codex app-server oracle" : "Ambient local catalog"}</span>
        <span>
          {report.marketplaceCount} marketplace{report.marketplaceCount === 1 ? "" : "s"}
        </span>
        <span>
          {report.pluginCount} hosted plugin{report.pluginCount === 1 ? "" : "s"}
        </span>
        <span>{report.matchedPluginCount} matched in Ambient</span>
        <span>
          {report.readComparisonCount} read probe{report.readComparisonCount === 1 ? "" : "s"}
        </span>
        <span>{report.ambientCandidateCount} Ambient candidates</span>
      </div>
      {report.command && <code className="plugin-cache-path">{report.command}</code>}
      <div className="plugin-note-list">
        {report.notes.map((note) => (
          <span key={note}>{note}</span>
        ))}
      </div>
      <div className="plugin-sublist">
        <strong>Protocol methods</strong>
        <code>{report.protocolMethods.join(", ")}</code>
      </div>
      {report.marketplaceLoadErrors.length > 0 && (
        <div className="plugin-note-list">
          {report.marketplaceLoadErrors.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}
      {report.readComparisons.length > 0 && (
        <div className="plugin-sublist">
          <strong>Read comparisons</strong>
          {report.readComparisons.map((comparison) => (
            <span key={`${comparison.marketplaceName}:${comparison.pluginName}`}>
              {comparison.pluginName}: {formatTaskState(comparison.status)}
              {comparison.skillCount !== undefined ? `, ${comparison.skillCount} skills` : ""}
              {comparison.mcpServerCount !== undefined ? `, ${comparison.mcpServerCount} MCP servers` : ""}
              {comparison.error ? ` - ${comparison.error}` : ""}
            </span>
          ))}
        </div>
      )}
      {report.marketplaces.slice(0, 4).map((marketplace) => (
        <div className="plugin-sublist" key={`${marketplace.name}:${marketplace.path ?? "hosted"}`}>
          <strong>{marketplace.displayName ?? marketplace.name}</strong>
          <span>{formatCodexMarketplaceSourceKind(marketplace.marketplaceKind)}</span>
          <span>
            {marketplace.pluginCount} plugin{marketplace.pluginCount === 1 ? "" : "s"}
          </span>
          {marketplace.path && <code>{marketplace.path}</code>}
          {marketplace.plugins.slice(0, 8).map((plugin) => (
            <span key={plugin.id ?? `${marketplace.name}:${plugin.name}`}>
              {plugin.displayName ?? plugin.name}
              {plugin.installed !== undefined ? ` - ${plugin.installed ? "installed" : "not installed"}` : ""}
            </span>
          ))}
        </div>
      ))}
      {report.missingInAmbient.length > 0 && (
        <div className="plugin-note-list">
          <span>Hosted-only: {report.missingInAmbient.slice(0, 8).join(", ")}</span>
        </div>
      )}
      {report.extraInAmbient.length > 0 && (
        <div className="plugin-note-list">
          <span>Ambient-only: {report.extraInAmbient.slice(0, 8).join(", ")}</span>
        </div>
      )}
    </section>
  );
}
