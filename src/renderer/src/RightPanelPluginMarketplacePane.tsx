import type { ReactNode } from "react";
import type { CodexMarketplaceSourceSummary, CodexPluginSummary } from "../../shared/pluginTypes";
import { codexImportActionState, groupCodexImportCandidates } from "./pluginUiModel";
import {
  formatCodexMarketplaceSignatureStatus,
  formatCodexPluginSourceKind,
  formatPluginCompatibility,
} from "./RightPanelDetailPanels";

type MaybePromise<T = unknown> = T | Promise<T>;

export type RightPanelPluginMarketplacePaneProps = {
  marketplaceSources: CodexMarketplaceSourceSummary[];
  importCandidates: CodexPluginSummary[];
  importCodexPlugin: (pluginId: string) => MaybePromise;
};

function renderCodexImportCandidate(plugin: CodexPluginSummary, importCodexPlugin: (pluginId: string) => MaybePromise): ReactNode {
  const importAction = codexImportActionState(plugin);
  const sourceDetails = [
    plugin.rootPath,
    plugin.sourceUrl ? `url: ${plugin.sourceUrl}` : undefined,
    plugin.sourcePath ? `path: ${plugin.sourcePath}` : undefined,
    plugin.sourceRef ? `ref: ${plugin.sourceRef}` : undefined,
    plugin.sourceSha ? `sha: ${plugin.sourceSha}` : undefined,
    plugin.sourceChecksum ? `checksum: ${plugin.sourceChecksum}` : undefined,
    plugin.sourceBundleChecksum ? `bundle checksum: ${plugin.sourceBundleChecksum}` : undefined,
    plugin.capabilitySummary?.length ? `capabilities: ${plugin.capabilitySummary.join(", ")}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");

  return (
    <section className="plugin-row plugin-import-row" key={plugin.id}>
      <div className="plugin-row-header">
        <strong>{plugin.displayName ?? plugin.name}</strong>
        <div className="plugin-row-actions">
          <button
            type="button"
            className="panel-button mini"
            disabled={importAction.disabled}
            title={importAction.title}
            onClick={() => void importCodexPlugin(plugin.id)}
          >
            {importAction.label}
          </button>
          <span>{plugin.version}</span>
        </div>
      </div>
      {plugin.description && <p>{plugin.description}</p>}
      <div className="plugin-badges">
        <span>{plugin.marketplaceName}</span>
        <span className={`plugin-tier ${plugin.compatibilityTier}`}>{formatPluginCompatibility(plugin.compatibilityTier)}</span>
        <span>{formatCodexPluginSourceKind(plugin)}</span>
        {plugin.updateAvailable && <span>Update available</span>}
        {plugin.authPolicy && <span>Auth {plugin.authPolicy}</span>}
        {plugin.publisher && <span>{plugin.publisher}</span>}
        {plugin.license && <span>{plugin.license}</span>}
        {plugin.ambientCompatibility && <span>{plugin.ambientCompatibility}</span>}
      </div>
      <code className="plugin-cache-path" title={sourceDetails}>
        {sourceDetails}
      </code>
    </section>
  );
}

export function RightPanelPluginMarketplacePane({
  marketplaceSources,
  importCandidates,
  importCodexPlugin,
}: RightPanelPluginMarketplacePaneProps) {
  const candidateGroups = groupCodexImportCandidates(importCandidates);
  const curatedMarketplaceSources = marketplaceSources.filter((source) => source.kind === "ambient-curated");

  return (
    <div className="plugin-list">
      <section className="plugin-row">
        <div className="panel-section-heading">
          <strong>Ambient Curated Marketplace</strong>
          <span>{candidateGroups.curated.length} plugin{candidateGroups.curated.length === 1 ? "" : "s"}</span>
        </div>
        <p>
          Ambient-curated marketplace entries are Codex-compatible plugin sources with publisher, license, provenance, checksum,
          capability, and compatibility metadata attached before Ambient exposes them for install.
        </p>
        {curatedMarketplaceSources.length > 0 ? (
          <div className="plugin-sublist">
            {curatedMarketplaceSources.map((source) => (
              <span key={source.id}>
                {source.label}
                {source.pluginCount !== undefined ? ` - ${source.pluginCount} plugins` : ""}
                {source.signatureStatus ? ` - ${formatCodexMarketplaceSignatureStatus(source.signatureStatus)}` : ""}
                {source.signatureKeyId ? ` - key ${source.signatureKeyId}` : ""}
                {source.contentChecksum ? ` - ${source.contentChecksum}` : ""}
              </span>
            ))}
          </div>
        ) : (
          <p className="panel-note">No Ambient curated marketplace source is configured for this workspace.</p>
        )}
      </section>

      {candidateGroups.curated.length > 0 ? (
        <section className="plugin-import-section">
          <div className="panel-section-heading">
            <strong>Curated Plugins</strong>
            <span>{candidateGroups.curated.length} available</span>
          </div>
          {candidateGroups.curated.map((plugin) => renderCodexImportCandidate(plugin, importCodexPlugin))}
        </section>
      ) : (
        <p className="panel-note">No curated plugins are available from the configured sources.</p>
      )}

      {candidateGroups.remote.length > 0 && (
        <section className="plugin-import-section">
          <div className="panel-section-heading">
            <strong>Other Remote Marketplaces</strong>
            <span>{candidateGroups.remote.length} available</span>
          </div>
          {candidateGroups.remote.map((plugin) => renderCodexImportCandidate(plugin, importCodexPlugin))}
        </section>
      )}

      {candidateGroups.localCache.length > 0 && (
        <section className="plugin-import-section">
          <div className="panel-section-heading">
            <strong>Local Codex Cache</strong>
            <span>{candidateGroups.localCache.length} available</span>
          </div>
          {candidateGroups.localCache.map((plugin) => renderCodexImportCandidate(plugin, importCodexPlugin))}
        </section>
      )}
    </div>
  );
}
