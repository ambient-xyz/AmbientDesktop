import { formatAmbientPluginSourceKind, type AmbientPluginRuntimeFilter, type AmbientPluginSourceFilter } from "./pluginUiModel";
import { RightPanelPluginCapabilitiesPane } from "./RightPanelPluginCapabilitiesPane";
import { RightPanelPluginDiagnostics } from "./RightPanelPluginDiagnostics";
import { RightPanelPluginHomePane, RightPanelPluginOverviewHero } from "./RightPanelPluginHomePane";
import { RightPanelPluginInstalledPane } from "./RightPanelPluginInstalledPane";
import { RightPanelPluginMarketplacePane } from "./RightPanelPluginMarketplacePane";
import { RightPanelPluginMcpRuntime } from "./RightPanelPluginMcpRuntime";
import { RightPanelPluginMcpServers } from "./RightPanelPluginMcpServers";
import {
  pluginPanelViewLabel,
  pluginPanelViews,
  pluginRuntimeFilterLabel,
  pluginRuntimeFilters,
  type RightPanelPluginHostModel,
} from "./RightPanelPluginHostModel";
import { RightPanelPluginSourcesPane } from "./RightPanelPluginSourcesPane";
import type { RightPanelPluginHostProps } from "./RightPanelPluginHostTypes";

type RightPanelPluginHostViewsProps = {
  host: RightPanelPluginHostProps;
  model: RightPanelPluginHostModel;
};

export function RightPanelPluginHostViews({ host, model }: RightPanelPluginHostViewsProps) {
  const registry = model.registry;

  if (host.pluginCatalogError) {
    return <p className="panel-note">{host.pluginCatalogError}</p>;
  }

  if (!registry) {
    return <p className="panel-note">Loading plugins...</p>;
  }

  return (
    <div className="plugin-list">
      <RightPanelPluginOverviewHero
        InfoTooltip={host.InfoTooltip}
        pluginCount={registry.plugins.length}
        availableCapabilityCount={model.availableCapabilities}
        trustRequiredCapabilityCount={model.trustRequiredCapabilities}
        attentionCapabilityCount={model.authRequiredCapabilities + model.errorCapabilities}
      />

      <div className="panel-tabs plugin-tabs" role="tablist" aria-label="Plugin views">
        {pluginPanelViews.map((view) => (
          <button
            type="button"
            key={view}
            className={[host.pluginView === view ? "selected" : "", view === "capabilities" ? "install-capabilities-tab" : ""]
              .filter(Boolean)
              .join(" ")}
            role="tab"
            aria-selected={host.pluginView === view}
            onClick={() => host.setPluginView(view)}
          >
            {pluginPanelViewLabel(view)}
          </button>
        ))}
      </div>

      {(host.pluginView === "installed" || host.pluginView === "capabilities") && (
        <div className="plugin-filter-row" aria-label="Plugin filters">
          <label>
            <span>Source</span>
            <select
              value={host.pluginSourceFilter}
              onChange={(event) => host.setPluginSourceFilter(event.target.value as AmbientPluginSourceFilter)}
            >
              {model.sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source === "all" ? "All sources" : formatAmbientPluginSourceKind(source)}
                </option>
              ))}
            </select>
          </label>
          {host.pluginView === "capabilities" && (
            <label>
              <span>Runtime</span>
              <select
                value={host.pluginRuntimeFilter}
                onChange={(event) => host.setPluginRuntimeFilter(event.target.value as AmbientPluginRuntimeFilter)}
              >
                {pluginRuntimeFilters.map((runtime) => (
                  <option key={runtime} value={runtime}>
                    {pluginRuntimeFilterLabel(runtime)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {host.pluginView === "home" && (
        <RightPanelPluginHomePane
          permissionMode={host.state.settings.permissionMode}
          installedOrDiscoveredPluginCount={model.installedPlugins.length}
          importablePluginCount={model.importablePlugins.length}
          capabilityCount={registry.capabilities.length}
          sourceCount={registry.sources.length}
          trustRequiredCapabilityCount={model.trustRequiredCapabilities}
          authRequiredCapabilityCount={model.authRequiredCapabilities}
          errorCapabilityCount={model.errorCapabilities}
        />
      )}

      {host.pluginView === "mcp" && (
        <div className="plugin-list">
          <RightPanelPluginMcpRuntime
            runtimeStatus={host.mcpContainerRuntimeStatus}
            runtimeToneClass={model.mcpContainerRuntimeToneClass}
            runtimeLabel={model.mcpContainerRuntimeLabel}
            runtimeBusy={host.mcpContainerRuntimeBusy}
            runtimeLaunchBusy={host.mcpContainerRuntimeLaunchBusy}
            runtimeError={host.mcpContainerRuntimeError}
            diagnosticsAction={model.mcpContainerRuntimeDiagnosticsAction}
            diagnosticStatus={host.diagnosticStatus}
            installProgressStatus={model.mcpContainerRuntimeInstallProgressStatusView}
            defaultCapabilityInstallProgressStatus={model.mcpDefaultCapabilityInstallProgressStatusView}
            setupResumeRows={model.mcpContainerRuntimeSetupResume}
            mcpServerBusy={host.mcpServerBusy}
            managedDevServers={host.managedDevServers}
            managedDevServerBusy={host.managedDevServerBusy}
            managedDevServerError={host.managedDevServerError}
            installBusyLabel={host.mcpContainerRuntimeInstallBusyLabel}
            onRefreshRuntime={() => void host.refreshMcpContainerRuntimeStatus(false, { continueDefaultCapabilitySetup: true })}
            onOpenRuntimeReview={() => host.setMcpContainerRuntimeModalOpen(true)}
            onOpenRuntimeSettings={host.onOpenMcpRuntimeSettings}
            onExportDiagnostics={() => void host.exportDiagnostics()}
            onLaunchInstaller={() => void host.launchMcpContainerRuntimeInstaller()}
            onReviewInstallCommandPlan={() => void host.launchMcpContainerRuntimeInstaller(undefined, "dry-run")}
            onInstallDefaultCapability={(capabilityId) => void host.installMcpDefaultCapability(capabilityId)}
            onLoadManagedDevServers={() => void host.loadManagedDevServers()}
            onStopManagedDevServer={(id) => void host.stopManagedDevServerProcess(id)}
          />

          <RightPanelPluginMcpServers
            query={host.mcpServerQuery}
            busyKey={host.mcpServerBusy}
            installedServers={host.mcpInstalledServers}
            registryResults={host.mcpRegistryResults}
            selectedPreview={host.mcpSelectedPreview}
            runtimeReady={model.mcpContainerRuntimeReady}
            runtimeBusy={host.mcpContainerRuntimeBusy}
            onQueryChange={host.setMcpServerQuery}
            onSearchRegistry={(refresh) => void host.searchMcpRegistryServers(refresh)}
            onLoadInstalledServers={() => void host.loadMcpInstalledServers()}
            onAcceptToolReview={(server) => void host.acceptMcpToolDescriptorReview(server)}
            onUninstallServer={(server) => void host.uninstallMcpServer(server)}
            onDescribeServer={(serverId) => void host.describeMcpRegistryServer(serverId)}
            onInstallServer={(serverId) => void host.installMcpRegistryServer(serverId)}
          />
        </div>
      )}

      {host.pluginView === "marketplace" && (
        <RightPanelPluginMarketplacePane
          marketplaceSources={model.codexMarketplaceSources}
          importCandidates={host.pluginCatalog?.importCandidates ?? []}
          importCodexPlugin={host.importCodexPlugin}
        />
      )}

      {host.pluginView === "installed" && (
        <RightPanelPluginInstalledPane
          plugins={model.filteredInstalledPlugins}
          capabilities={registry.capabilities}
          codexPlugins={host.pluginCatalog?.plugins ?? []}
          selectedPluginDetailId={host.selectedPluginDetailId}
          setSelectedPluginDetailId={host.setSelectedPluginDetailId}
          running={host.running}
          generatedCapabilitySourceOpening={host.generatedCapabilitySourceOpening}
          generatedCapabilityValidationStarting={host.generatedCapabilityValidationStarting}
          generatedCapabilityUpdatePlanning={host.generatedCapabilityUpdatePlanning}
          generatedCapabilityRemovalPlanning={host.generatedCapabilityRemovalPlanning}
          pluginDependencyInstalling={host.pluginDependencyInstalling}
          revealGeneratedCapabilitySource={host.revealGeneratedCapabilitySource}
          setPluginTrusted={host.setPluginTrusted}
          setPluginEnabled={host.setPluginEnabled}
          uninstallCodexPlugin={host.uninstallCodexPlugin}
          startGeneratedCapabilityValidation={host.startGeneratedCapabilityValidation}
          startGeneratedCapabilityUpdatePlan={host.startGeneratedCapabilityUpdatePlan}
          startGeneratedCapabilityRemovalPlan={host.startGeneratedCapabilityRemovalPlan}
          installCodexPluginDependencies={host.installCodexPluginDependencies}
        />
      )}

      {host.pluginView === "capabilities" && (
        <RightPanelPluginCapabilitiesPane
          capabilities={model.filteredCapabilities}
          running={host.running}
          pluginCapabilityDiagnostics={host.pluginCapabilityDiagnostics}
          pluginCapabilityDiagnosticsBusy={host.pluginCapabilityDiagnosticsBusy}
          generatedCapabilitySourceOpening={host.generatedCapabilitySourceOpening}
          generatedCapabilityValidationStarting={host.generatedCapabilityValidationStarting}
          generatedCapabilityUpdatePlanning={host.generatedCapabilityUpdatePlanning}
          generatedCapabilityRemovalPlanning={host.generatedCapabilityRemovalPlanning}
          pluginAuthBusy={host.pluginAuthBusy}
          googleIntegration={host.googleIntegration}
          googleSetupAccountHint={host.googleSetupAccountHint}
          setGoogleSetupAccountHint={host.setGoogleSetupAccountHint}
          googleSetupBusy={host.googleSetupBusy}
          googleValidationFeedback={host.googleValidationFeedback}
          setPluginAuthStatus={host.setPluginAuthStatus}
          startPluginAppAuth={host.startPluginAppAuth}
          installGoogleWorkspaceCli={host.installGoogleWorkspaceCli}
          confirmGoogleWorkspaceAccount={host.confirmGoogleWorkspaceAccount}
          startGoogleWorkspaceSetup={host.startGoogleWorkspaceSetup}
          importGoogleWorkspaceOAuthClient={host.importGoogleWorkspaceOAuthClient}
          validateGoogleWorkspace={host.validateGoogleWorkspace}
          cancelGoogleWorkspaceSetup={host.cancelGoogleWorkspaceSetup}
          testPluginAuthAccount={host.testPluginAuthAccount}
          disconnectGoogleWorkspace={host.disconnectGoogleWorkspace}
          disconnectPluginAuthAccount={host.disconnectPluginAuthAccount}
          revokePluginAuthAccount={host.revokePluginAuthAccount}
          revealGeneratedCapabilitySource={host.revealGeneratedCapabilitySource}
          startGeneratedCapabilityValidation={host.startGeneratedCapabilityValidation}
          startGeneratedCapabilityUpdatePlan={host.startGeneratedCapabilityUpdatePlan}
          startGeneratedCapabilityRemovalPlan={host.startGeneratedCapabilityRemovalPlan}
          inspectAmbientPluginCapability={host.inspectAmbientPluginCapability}
        />
      )}

      {host.pluginView === "sources" && (
        <RightPanelPluginSourcesPane
          running={host.running}
          capabilityBuilderHistory={host.capabilityBuilderHistory}
          capabilityBuilderHistoryLoading={host.capabilityBuilderHistoryLoading}
          capabilityBuilderHistoryError={host.capabilityBuilderHistoryError}
          capabilityBuilderHistoryPreviewStarting={host.capabilityBuilderHistoryPreviewStarting}
          capabilityBuilderHistoryRepairPlanning={host.capabilityBuilderHistoryRepairPlanning}
          capabilityBuilderHistoryReregisterStarting={host.capabilityBuilderHistoryReregisterStarting}
          generatedCapabilitySourceOpening={host.generatedCapabilitySourceOpening}
          generatedCapabilityUpdatePlanning={host.generatedCapabilityUpdatePlanning}
          generatedCapabilityRemovalPlanning={host.generatedCapabilityRemovalPlanning}
          codexMarketplaceSources={model.codexMarketplaceSources}
          codexMarketplaceSourceInput={host.codexMarketplaceSourceInput}
          setCodexMarketplaceSourceInput={host.setCodexMarketplaceSourceInput}
          codexMarketplaceNameInput={host.codexMarketplaceNameInput}
          setCodexMarketplaceNameInput={host.setCodexMarketplaceNameInput}
          codexMarketplaceAllowExperimental={host.codexMarketplaceAllowExperimental}
          setCodexMarketplaceAllowExperimental={host.setCodexMarketplaceAllowExperimental}
          codexMarketplaceAdding={host.codexMarketplaceAdding}
          codexMarketplaceRemoving={host.codexMarketplaceRemoving}
          hostedMarketplaceReport={host.hostedMarketplaceReport}
          piPackageCatalog={host.piPackageCatalog}
          selectedPiPackageDetailId={host.selectedPiPackageDetailId}
          setSelectedPiPackageDetailId={host.setSelectedPiPackageDetailId}
          piPackageInstalling={host.piPackageInstalling}
          piPackageUninstalling={host.piPackageUninstalling}
          piPackageEnabling={host.piPackageEnabling}
          piExtensionSandboxCatalog={host.piExtensionSandboxCatalog}
          piExtensionSandboxInstalling={host.piExtensionSandboxInstalling}
          piExtensionSandboxFallback={host.piExtensionSandboxFallback}
          piExtensionSandboxUninstalling={host.piExtensionSandboxUninstalling}
          piExtensionSandboxClearingHistory={host.piExtensionSandboxClearingHistory}
          piPrivilegedCatalog={host.piPrivilegedCatalog}
          piPrivilegedBusy={host.piPrivilegedBusy}
          piPrivilegedClearingHistory={host.piPrivilegedClearingHistory}
          piPrivilegedScan={host.piPrivilegedScan}
          piPrivilegedScanSource={host.piPrivilegedScanSource}
          piPrivilegedScanning={host.piPrivilegedScanning}
          piPrivilegedInstalling={host.piPrivilegedInstalling}
          piPackageSourceInput={host.piPackageSourceInput}
          setPiPackageSourceInput={host.setPiPackageSourceInput}
          piPackageInstallScope={host.piPackageInstallScope}
          setPiPackageInstallScope={host.setPiPackageInstallScope}
          permissionAudit={host.permissionAudit}
          addCodexMarketplace={host.addCodexMarketplace}
          removeCodexMarketplace={host.removeCodexMarketplace}
          loadCapabilityBuilderHistory={host.loadCapabilityBuilderHistory}
          startCapabilityBuilderHistoryPreview={host.startCapabilityBuilderHistoryPreview}
          startCapabilityBuilderHistoryReregister={host.startCapabilityBuilderHistoryReregister}
          startCapabilityBuilderHistoryRepairPlan={host.startCapabilityBuilderHistoryRepairPlan}
          revealGeneratedCapabilitySource={host.revealGeneratedCapabilitySource}
          startGeneratedCapabilityUpdatePlan={host.startGeneratedCapabilityUpdatePlan}
          startGeneratedCapabilityRemovalPlan={host.startGeneratedCapabilityRemovalPlan}
          installPiPackage={host.installPiPackage}
          installPiExtensionSandboxPackage={host.installPiExtensionSandboxPackage}
          scanPiPrivilegedPackage={host.scanPiPrivilegedPackage}
          installPiPrivilegedPackage={host.installPiPrivilegedPackage}
          uninstallPiPackage={host.uninstallPiPackage}
          setPiPackageEnabled={host.setPiPackageEnabled}
          uninstallPiExtensionSandboxPackage={host.uninstallPiExtensionSandboxPackage}
          clearPiExtensionSandboxHistory={host.clearPiExtensionSandboxHistory}
          disablePiPrivilegedPackage={host.disablePiPrivilegedPackage}
          uninstallPiPrivilegedPackage={host.uninstallPiPrivilegedPackage}
          clearPiPrivilegedPackageHistory={host.clearPiPrivilegedPackageHistory}
        />
      )}

      {host.pluginView === "diagnostics" && (
        <RightPanelPluginDiagnostics
          registry={registry}
          mcpRuntimeSnapshots={host.mcpRuntimeSnapshots}
          mcpRuntimeBusy={host.mcpRuntimeBusy}
          mcpInspection={host.mcpInspection}
          onRestartMcpRuntime={(key) => void host.restartPluginMcpRuntime(key)}
          onStopMcpRuntime={(key) => void host.stopPluginMcpRuntime(key)}
        />
      )}
    </div>
  );
}
