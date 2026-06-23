import { type ChangeEvent } from "react";

import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import type {
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PiPackageCatalog,
  PiPackageInstallScope,
  PiPrivilegedCatalog,
  PiPrivilegedSecurityScan,
} from "../../shared/pluginTypes";
import {
  piExtensionSandboxUninstallActionState,
  piPackageEnableActionState,
  piPackageInstallActionState,
  piPackageUninstallActionState,
  piPrivilegedDisableActionState,
  piPrivilegedUninstallActionState,
} from "./pluginUiModel";
import {
  PiPrivilegedPackageDetailPanel,
  PiSandboxPackageDetailPanel,
  formatPiDependencyStatus,
  formatPiResourceCounts,
  formatPluginCompatibility,
  formatTaskState,
  piPackageAuditEntries,
} from "./RightPanelDetailPanels";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";

type MaybePromise<T = unknown> = T | Promise<T>;

export function PiPackageInstallControls({
  piPackageCatalog,
  piPackageInstalling,
  piExtensionSandboxInstalling,
  piPrivilegedScan,
  piPrivilegedScanSource,
  piPrivilegedScanning,
  piPrivilegedInstalling,
  piPackageSourceInput,
  setPiPackageSourceInput,
  piPackageInstallScope,
  setPiPackageInstallScope,
  installPiPackage,
  installPiExtensionSandboxPackage,
  scanPiPrivilegedPackage,
  installPiPrivilegedPackage,
}: {
  piPackageCatalog: PiPackageCatalog;
  piPackageInstalling: boolean;
  piExtensionSandboxInstalling: boolean;
  piPrivilegedScan?: PiPrivilegedSecurityScan;
  piPrivilegedScanSource?: string;
  piPrivilegedScanning: boolean;
  piPrivilegedInstalling: boolean;
  piPackageSourceInput: string;
  setPiPackageSourceInput: (value: string) => void;
  piPackageInstallScope: PiPackageInstallScope;
  setPiPackageInstallScope: (scope: PiPackageInstallScope) => void;
  installPiPackage: (source: string, scope?: PiPackageInstallScope) => MaybePromise;
  installPiExtensionSandboxPackage: (source: string) => MaybePromise;
  scanPiPrivilegedPackage: (source: string) => MaybePromise;
  installPiPrivilegedPackage: (source: string) => MaybePromise;
}) {
  const handleInstallScopeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setPiPackageInstallScope(event.target.value as PiPackageInstallScope);
  };

  return (
    <>
      <div className="panel-section-heading">
        <strong>Pi Packages</strong>
        <span>{piPackageCatalog.packages.length} managed or inspectable candidates</span>
      </div>
      <div className="pi-package-install-row">
        <input
          className="panel-input"
          value={piPackageSourceInput}
          placeholder="npm:pi-subagents, git:https://..., or ./local-package"
          onChange={(event) => setPiPackageSourceInput(event.target.value)}
        />
        <select
          className="panel-input pi-package-scope-select"
          value={piPackageInstallScope}
          onChange={handleInstallScopeChange}
        >
          <option value="workspace">Workspace</option>
          <option value="global">Global</option>
        </select>
        <button
          type="button"
          className="panel-button mini"
          disabled={piPackageInstalling || !piPackageSourceInput.trim()}
          onClick={() => void installPiPackage(piPackageSourceInput)}
        >
          {piPackageInstalling ? "Installing" : "Install"}
        </button>
        <button
          type="button"
          className="panel-button mini"
          disabled={piExtensionSandboxInstalling || !piPackageSourceInput.trim()}
          title="Install this tool-shaped Pi extension into Ambient's sandboxed compatibility host."
          onClick={() => void installPiExtensionSandboxPackage(piPackageSourceInput)}
        >
          {piExtensionSandboxInstalling ? "Installing" : "Install sandboxed"}
        </button>
        <button
          type="button"
          className="panel-button mini"
          disabled={piPrivilegedScanning || !piPackageSourceInput.trim()}
          title="Scan this source as a privileged Pi package without executing package code."
          onClick={() => void scanPiPrivilegedPackage(piPackageSourceInput)}
        >
          {piPrivilegedScanning ? "Scanning" : "Scan privileged"}
        </button>
        <button
          type="button"
          className="panel-button mini danger"
          disabled={
            piPrivilegedInstalling ||
            !piPrivilegedScan ||
            piPrivilegedScanSource !== piPackageSourceInput.trim()
          }
          title="Install the scanned privileged Pi package into Ambient-managed disabled state."
          onClick={() => void installPiPrivilegedPackage(piPackageSourceInput)}
        >
          {piPrivilegedInstalling ? "Installing" : "Install disabled"}
        </button>
      </div>
      {piPackageCatalog.sourceNotes.map((note) => (
        <p className="panel-note" key={note}>{note}</p>
      ))}
    </>
  );
}

export function PiExtensionSandboxFallbackPanel({
  fallback,
  piPrivilegedScanning,
}: {
  fallback?: PiExtensionSandboxInstallPreview;
  piPrivilegedScanning: boolean;
}) {
  if (!fallback) return null;

  return (
    <section className="plugin-row pi-package-row">
      <div className="plugin-row-header">
        <strong>Sandbox fallback: {fallback.packageName ?? fallback.source}</strong>
        <div className="plugin-row-actions">
          {fallback.version && <span>{fallback.version}</span>}
          <span>{piPrivilegedScanning ? "Scanning privileged" : "Use privileged review"}</span>
        </div>
      </div>
      <p>
        This package could not be installed in the sandboxed Pi tool host. Ambient is scanning it for the disabled privileged install path instead.
      </p>
      <div className="plugin-badges">
        <span>Sandbox blocked</span>
        {fallback.entrypoint && <span>{fallback.entrypoint}</span>}
        <span>{fallback.allowedNetworkHosts.length ? `Network: ${fallback.allowedNetworkHosts.join(", ")}` : "No network"}</span>
      </div>
      <div className="plugin-note-list">
        {fallback.errors.slice(0, 6).map((error) => (
          <span key={error}>{error}</span>
        ))}
      </div>
    </section>
  );
}

export function PiPrivilegedScanPanel({
  scan,
}: {
  scan?: PiPrivilegedSecurityScan;
}) {
  if (!scan) return null;

  return (
    <section className="plugin-row pi-package-row">
      <div className="plugin-row-header">
        <strong>Privileged Scan: {scan.packageName}</strong>
        <div className="plugin-row-actions">
          <span>{scan.version ?? "unversioned"}</span>
          <span>{scan.findings.length} finding{scan.findings.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      {scan.description && <p>{scan.description}</p>}
      <div className="plugin-badges">
        <span>{scan.recommendation === "privileged-review-required" ? "Privileged review required" : "Sandbox eligible"}</span>
        <span>{scan.scanOrigin === "sandbox-fallback" ? "From sandbox fallback" : "Explicit privileged scan"}</span>
        <span>{scan.resources.piExtensions.length} Pi extension{scan.resources.piExtensions.length === 1 ? "" : "s"}</span>
        <span>{scan.resources.bins.length} command surface{scan.resources.bins.length === 1 ? "" : "s"}</span>
        <span>{scan.resources.mcpServers.length || scan.riskSummary.mcpServers ? "MCP config detected" : "No MCP config"}</span>
        <span>{scan.fingerprint.slice(0, 12)}</span>
      </div>
      {scan.findings.length > 0 && (
        <div className="plugin-note-list">
          {scan.findings.slice(0, 10).map((finding) => (
            <span key={`${finding.category}:${finding.message}`}>[{finding.severity}] {finding.category}: {finding.message}</span>
          ))}
        </div>
      )}
      <div className="plugin-note-list">
        <span>Install disabled keeps this package inactive; Ambient will not activate hooks, MCP servers, commands, background processes, or Pi settings changes.</span>
        <span>{scan.caveat}</span>
      </div>
      <code className="plugin-cache-path">{scan.source}</code>
    </section>
  );
}

export function PiManagedPackageList({
  catalog,
  piPackageInstalling,
  piPackageUninstalling,
  piPackageEnabling,
  piPackageInstallScope,
  installPiPackage,
  uninstallPiPackage,
  setPiPackageEnabled,
}: {
  catalog: PiPackageCatalog;
  piPackageInstalling: boolean;
  piPackageUninstalling?: string;
  piPackageEnabling?: string;
  piPackageInstallScope: PiPackageInstallScope;
  installPiPackage: (source: string, scope?: PiPackageInstallScope) => MaybePromise;
  uninstallPiPackage: (packageId: string) => MaybePromise;
  setPiPackageEnabled: (packageId: string, enabled: boolean) => MaybePromise;
}) {
  return (
    <>
      {catalog.packages.map((pkg) => {
        const installAction = piPackageInstallActionState(pkg, piPackageInstalling, piPackageInstallScope);
        const uninstallAction = piPackageUninstallActionState(pkg, piPackageUninstalling);
        const enableAction = piPackageEnableActionState(pkg, piPackageEnabling === pkg.id);
        return (
          <section className="plugin-row pi-package-row" key={pkg.id}>
            <div className="plugin-row-header">
              <strong>{pkg.name}</strong>
              <div className="plugin-row-actions">
                {installAction.visible && (
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={installAction.disabled}
                    title={installAction.title}
                    onClick={() => void installPiPackage(pkg.packageSpec!)}
                  >
                    {installAction.label}
                  </button>
                )}
                {uninstallAction.visible && (
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={uninstallAction.disabled}
                    title={uninstallAction.title}
                    onClick={() => void uninstallPiPackage(pkg.id)}
                  >
                    {uninstallAction.label}
                  </button>
                )}
                {enableAction.visible && (
                  <label
                    className="plugin-toggle"
                    title={enableAction.title}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(pkg.enabled)}
                      disabled={enableAction.disabled}
                      onChange={(event) => void setPiPackageEnabled(pkg.id, event.target.checked)}
                    />
                    <span>{enableAction.label}</span>
                  </label>
                )}
                <span>{pkg.version ?? pkg.sourceLabel}</span>
              </div>
            </div>
            {pkg.description && <p>{pkg.description}</p>}
            <div className="plugin-badges">
              <span>{pkg.sourceLabel}</span>
              {pkg.installScope && <span>{formatTaskState(pkg.installScope)} scope</span>}
              <span>{pkg.installed ? "Ambient installed" : "Inspect only"}</span>
              <span>{pkg.enabled ? "Enabled" : "Disabled"}</span>
              <span className={`plugin-tier ${pkg.compatibilityTier}`}>{formatPluginCompatibility(pkg.compatibilityTier)}</span>
              <span>{formatPiResourceCounts(pkg.resourceCounts)}</span>
              {pkg.dependencyStatus?.required && <span>{formatPiDependencyStatus(pkg.dependencyStatus)}</span>}
              {pkg.dependencyStatus?.missingPackages.length ? (
                <span>Missing {pkg.dependencyStatus.missingPackages.slice(0, 4).join(", ")}</span>
              ) : null}
            </div>
            {pkg.compatibilityNotes.length > 0 && (
              <div className="plugin-note-list">
                {pkg.compatibilityNotes.map((note) => (
                  <span key={note}>{note}</span>
                ))}
              </div>
            )}
            {pkg.packageSpec && <code className="plugin-cache-path">{pkg.packageSpec}</code>}
          </section>
        );
      })}
    </>
  );
}

export function PiSandboxedToolsSection({
  catalog,
  selectedPiPackageDetailId,
  setSelectedPiPackageDetailId,
  piExtensionSandboxUninstalling,
  piExtensionSandboxClearingHistory,
  permissionAudit,
  uninstallPiExtensionSandboxPackage,
  clearPiExtensionSandboxHistory,
}: {
  catalog?: PiExtensionSandboxCatalog;
  selectedPiPackageDetailId?: string;
  setSelectedPiPackageDetailId: (id?: string) => void;
  piExtensionSandboxUninstalling?: string;
  piExtensionSandboxClearingHistory: boolean;
  permissionAudit: PermissionAuditEntry[];
  uninstallPiExtensionSandboxPackage: (packageId: string) => MaybePromise;
  clearPiExtensionSandboxHistory: () => MaybePromise;
}) {
  if (!catalog) return null;

  return (
    <section className="plugin-import-section pi-package-subsection">
      <div className="panel-section-heading">
        <strong>Sandboxed Pi Tools</strong>
        <span>{catalog.packages.length} installed</span>
      </div>
      {catalog.errors.map((error) => (
        <p className="panel-note error" key={error}>{error}</p>
      ))}
      {catalog.packages.length === 0 ? (
        <p className="panel-note">No sandboxed Pi tool packages are installed.</p>
      ) : (
        catalog.packages.map((pkg) => {
          const uninstallAction = piExtensionSandboxUninstallActionState(pkg, piExtensionSandboxUninstalling);
          const detailId = `sandbox:${pkg.id}`;
          const detailsOpen = selectedPiPackageDetailId === detailId;
          const auditEntries = piPackageAuditEntries(permissionAudit, { packageName: pkg.name, packageId: pkg.id, source: pkg.source });
          return (
            <section className="plugin-row pi-package-row" key={pkg.id}>
              <div className="plugin-row-header">
                <strong>{pkg.name}</strong>
                <div className="plugin-row-actions">
                  <button
                    type="button"
                    className="panel-button mini"
                    onClick={() => setSelectedPiPackageDetailId(detailsOpen ? undefined : detailId)}
                  >
                    {detailsOpen ? "Hide details" : "Details"}
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={uninstallAction.disabled}
                    title={uninstallAction.title}
                    onClick={() => void uninstallPiExtensionSandboxPackage(pkg.id)}
                  >
                    {uninstallAction.label}
                  </button>
                  <span>{pkg.version ?? "installed"}</span>
                </div>
              </div>
              {pkg.description && <p>{pkg.description}</p>}
              <div className="plugin-badges">
                <span>Sandboxed</span>
                <span>{pkg.tools.length} tools</span>
                <span>{pkg.allowedNetworkHosts.length ? `Network: ${pkg.allowedNetworkHosts.join(", ")}` : "No network"}</span>
                {pkg.errors.length ? <span className="plugin-tier unsupported">Errors</span> : <span className="plugin-tier supported">Ready</span>}
              </div>
              {pkg.tools.length > 0 && (
                <div className="plugin-note-list">
                  {pkg.tools.map((tool) => (
                    <span key={tool.name}>{tool.name}{tool.description ? `: ${tool.description}` : ""}</span>
                  ))}
                </div>
              )}
              {pkg.errors.length > 0 && (
                <div className="plugin-note-list">
                  {pkg.errors.map((error) => (
                    <span key={error}>{error}</span>
                  ))}
                </div>
              )}
              <code className="plugin-cache-path">{pkg.rootPath}</code>
              {detailsOpen && (
                <PiSandboxPackageDetailPanel
                  pkg={pkg}
                  auditEntries={auditEntries}
                />
              )}
            </section>
          );
        })
      )}
      {catalog.history.length > 0 && (
        <div className="plugin-sublist pi-package-history-list">
          <div className="panel-section-heading">
            <strong>Removed Sandboxed Pi Tools</strong>
            <button
              type="button"
              className="panel-button mini danger"
              disabled={piExtensionSandboxClearingHistory}
              onClick={() => void clearPiExtensionSandboxHistory()}
            >
              {piExtensionSandboxClearingHistory ? "Clearing" : "Clear history"}
            </button>
          </div>
          {catalog.history.slice(0, 8).map((pkg) => {
            const detailId = `sandbox-history:${pkg.id}:${pkg.removedAt}`;
            const detailsOpen = selectedPiPackageDetailId === detailId;
            const auditEntries = piPackageAuditEntries(permissionAudit, { packageName: pkg.name, packageId: pkg.id, source: pkg.source });
            return (
              <section className="plugin-row pi-package-row removed" key={`${pkg.id}:${pkg.removedAt}`}>
                <div className="plugin-row-header">
                  <strong>{pkg.name}</strong>
                  <div className="plugin-row-actions">
                    <button
                      type="button"
                      className="panel-button mini"
                      onClick={() => setSelectedPiPackageDetailId(detailsOpen ? undefined : detailId)}
                    >
                      {detailsOpen ? "Hide details" : "Details"}
                    </button>
                    <span>Removed {formatTimelineTime(pkg.removedAt)}</span>
                  </div>
                </div>
                {pkg.description && <p>{pkg.description}</p>}
                <div className="plugin-badges">
                  <span>Removed</span>
                  <span>Sandboxed</span>
                  <span>{pkg.tools.length} tools</span>
                  <span>{pkg.removalReason}</span>
                </div>
                {detailsOpen && (
                  <PiSandboxPackageDetailPanel
                    pkg={pkg}
                    auditEntries={auditEntries}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function PiPrivilegedInstallsSection({
  catalog,
  selectedPiPackageDetailId,
  setSelectedPiPackageDetailId,
  piPrivilegedBusy,
  piPrivilegedClearingHistory,
  permissionAudit,
  disablePiPrivilegedPackage,
  uninstallPiPrivilegedPackage,
  clearPiPrivilegedPackageHistory,
}: {
  catalog?: PiPrivilegedCatalog;
  selectedPiPackageDetailId?: string;
  setSelectedPiPackageDetailId: (id?: string) => void;
  piPrivilegedBusy?: string;
  piPrivilegedClearingHistory: boolean;
  permissionAudit: PermissionAuditEntry[];
  disablePiPrivilegedPackage: (packageId: string) => MaybePromise;
  uninstallPiPrivilegedPackage: (packageId: string) => MaybePromise;
  clearPiPrivilegedPackageHistory: () => MaybePromise;
}) {
  if (!catalog) return null;

  return (
    <section className="plugin-import-section pi-package-subsection">
      <div className="panel-section-heading">
        <strong>Privileged Pi Installs</strong>
        <span>{catalog.packages.length} installed disabled or managed</span>
      </div>
      {catalog.errors.map((error) => (
        <p className="panel-note error" key={error}>{error}</p>
      ))}
      {catalog.packages.length === 0 ? (
        <p className="panel-note">No privileged Pi installs are registered.</p>
      ) : (
        catalog.packages.map((pkg) => {
          const disableAction = piPrivilegedDisableActionState(pkg, piPrivilegedBusy);
          const uninstallAction = piPrivilegedUninstallActionState(pkg, piPrivilegedBusy);
          const detailId = `privileged:${pkg.id}`;
          const detailsOpen = selectedPiPackageDetailId === detailId;
          const auditEntries = piPackageAuditEntries(permissionAudit, { packageName: pkg.packageName, packageId: pkg.id, source: pkg.source });
          const risks = Object.entries(pkg.scan.riskSummary)
            .filter(([, detected]) => detected)
            .map(([risk]) => risk);
          return (
            <section className="plugin-row pi-package-row" key={pkg.id}>
              <div className="plugin-row-header">
                <strong>{pkg.packageName}</strong>
                <div className="plugin-row-actions">
                  <button
                    type="button"
                    className="panel-button mini"
                    onClick={() => setSelectedPiPackageDetailId(detailsOpen ? undefined : detailId)}
                  >
                    {detailsOpen ? "Hide details" : "Details"}
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={disableAction.disabled}
                    title={disableAction.title}
                    onClick={() => void disablePiPrivilegedPackage(pkg.id)}
                  >
                    {disableAction.label}
                  </button>
                  <button
                    type="button"
                    className="panel-button mini danger"
                    disabled={uninstallAction.disabled}
                    title={uninstallAction.title}
                    onClick={() => void uninstallPiPrivilegedPackage(pkg.id)}
                  >
                    {uninstallAction.label}
                  </button>
                  <span>{pkg.version ?? "installed"}</span>
                </div>
              </div>
              <p>{pkg.scan.description ?? "Privileged package installed in Ambient-managed disabled state."}</p>
              <div className="plugin-badges">
                <span>{formatTaskState(pkg.status)}</span>
                <span>{pkg.scan.recommendation === "privileged-review-required" ? "Privileged review required" : "Sandbox eligible"}</span>
                <span>{pkg.scan.scanOrigin === "sandbox-fallback" ? "From sandbox fallback" : "Explicit privileged scan"}</span>
                <span>{pkg.scan.findings.length} findings</span>
                <span>{risks.length ? risks.slice(0, 4).map(formatTaskState).join(", ") : "No risk flags"}</span>
              </div>
              {pkg.scan.findings.length > 0 && (
                <div className="plugin-note-list">
                  {pkg.scan.findings.slice(0, 8).map((finding) => (
                    <span key={`${finding.category}:${finding.message}`}>[{finding.severity}] {finding.category}: {finding.message}</span>
                  ))}
                </div>
              )}
              <div className="plugin-note-list">
                <span>Alpha install is inactive: Ambient does not activate hooks, MCP servers, commands, background processes, or Pi settings changes.</span>
                <span>{pkg.scan.caveat}</span>
              </div>
              <code className="plugin-cache-path">{pkg.rootPath}</code>
              {detailsOpen && (
                <PiPrivilegedPackageDetailPanel
                  pkg={pkg}
                  auditEntries={auditEntries}
                />
              )}
            </section>
          );
        })
      )}
      {catalog.history.length > 0 && (
        <div className="plugin-sublist pi-package-history-list">
          <div className="panel-section-heading">
            <strong>Removed Privileged Pi Installs</strong>
            <button
              type="button"
              className="panel-button mini danger"
              disabled={piPrivilegedClearingHistory}
              onClick={() => void clearPiPrivilegedPackageHistory()}
            >
              {piPrivilegedClearingHistory ? "Clearing" : "Clear history"}
            </button>
          </div>
          {catalog.history.slice(0, 8).map((pkg) => {
            const detailId = `privileged-history:${pkg.id}:${pkg.removedAt}`;
            const detailsOpen = selectedPiPackageDetailId === detailId;
            const auditEntries = piPackageAuditEntries(permissionAudit, { packageName: pkg.packageName, packageId: pkg.id, source: pkg.source });
            const risks = Object.entries(pkg.scan.riskSummary)
              .filter(([, detected]) => detected)
              .map(([risk]) => risk);
            return (
              <section className="plugin-row pi-package-row removed" key={`${pkg.id}:${pkg.removedAt}`}>
                <div className="plugin-row-header">
                  <strong>{pkg.packageName}</strong>
                  <div className="plugin-row-actions">
                    <button
                      type="button"
                      className="panel-button mini"
                      onClick={() => setSelectedPiPackageDetailId(detailsOpen ? undefined : detailId)}
                    >
                      {detailsOpen ? "Hide details" : "Details"}
                    </button>
                    <span>Removed {formatTimelineTime(pkg.removedAt)}</span>
                  </div>
                </div>
                <p>{pkg.scan.description ?? "Removed privileged package retained for review."}</p>
                <div className="plugin-badges">
                  <span>Removed</span>
                  <span>{pkg.scan.scanOrigin === "sandbox-fallback" ? "From sandbox fallback" : "Explicit privileged scan"}</span>
                  <span>{pkg.scan.findings.length} findings</span>
                  <span>{risks.length ? risks.slice(0, 4).map(formatTaskState).join(", ") : "No risk flags"}</span>
                </div>
                {detailsOpen && (
                  <PiPrivilegedPackageDetailPanel
                    pkg={pkg}
                    auditEntries={auditEntries}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
