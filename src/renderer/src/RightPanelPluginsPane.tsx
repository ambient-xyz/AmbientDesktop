import type { ComponentType } from "react";
import type { DesktopState } from "../../shared/desktopTypes";
import type { SttProviderCandidate, VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import type {
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpDefaultCapabilityInstallProgress,
} from "../../shared/pluginTypes";
import type { useRightPanelCapabilityBuilderController } from "./RightPanelCapabilityBuilderController";
import type { RightPanelDiagnosticsController } from "./RightPanelDiagnosticsController";
import { mcpContainerRuntimeInstallBusyLabel } from "./RightPanelDialogs";
import type { RightPanelGoogleIntegrationBridge } from "./RightPanelGoogleIntegrationBridge";
import type { RightPanelMcpController } from "./RightPanelMcpController";
import type { useRightPanelPiPackageController } from "./RightPanelPiPackageController";
import type { useRightPanelPluginAuthController } from "./RightPanelPluginAuthController";
import type { useRightPanelPluginCatalogController } from "./RightPanelPluginCatalogController";
import { RightPanelPluginHost } from "./RightPanelPluginHost";
import type { RightPanelSettingsController } from "./RightPanelSettingsController";

type InfoTooltipProps = {
  label?: string;
  text: string;
  className?: string;
};

type RightPanelCapabilityBuilderController = ReturnType<typeof useRightPanelCapabilityBuilderController>;
type RightPanelPiPackageController = ReturnType<typeof useRightPanelPiPackageController>;
type RightPanelPluginAuthController = ReturnType<typeof useRightPanelPluginAuthController>;
type RightPanelPluginCatalogController = ReturnType<typeof useRightPanelPluginCatalogController>;

export type RightPanelPluginsPaneProps = {
  InfoTooltip: ComponentType<InfoTooltipProps>;
  state: DesktopState;
  running: boolean;
  voiceProviders: VoiceProviderCandidate[];
  sttProviders: SttProviderCandidate[];
  permissionAudit: PermissionAuditEntry[];
  mcpContainerRuntimeInstallProgress?: AmbientMcpContainerRuntimeManagedInstallProgress;
  mcpDefaultCapabilityInstallProgress?: AmbientMcpDefaultCapabilityInstallProgress;
  pluginCatalogPane: RightPanelPluginCatalogController;
  mcpPane: RightPanelMcpController;
  settingsPane: RightPanelSettingsController;
  diagnosticsPane: RightPanelDiagnosticsController;
  pluginAuthPane: RightPanelPluginAuthController;
  googleIntegrationBridge: RightPanelGoogleIntegrationBridge;
  capabilityBuilderLauncher: RightPanelCapabilityBuilderController;
  piPackagePane: RightPanelPiPackageController;
  onOpenMcpRuntimeSettings: () => void;
};

export function RightPanelPluginsPane({
  InfoTooltip,
  state,
  running,
  voiceProviders,
  sttProviders,
  permissionAudit,
  mcpContainerRuntimeInstallProgress,
  mcpDefaultCapabilityInstallProgress,
  pluginCatalogPane,
  mcpPane,
  settingsPane,
  diagnosticsPane,
  pluginAuthPane,
  googleIntegrationBridge,
  capabilityBuilderLauncher,
  piPackagePane,
  onOpenMcpRuntimeSettings,
}: RightPanelPluginsPaneProps) {
  return (
    <RightPanelPluginHost
      InfoTooltip={InfoTooltip}
      state={state}
      running={running}
      voiceProviders={voiceProviders}
      sttProviders={sttProviders}
      ambientPluginRegistry={pluginCatalogPane.ambientPluginRegistry}
      pluginCatalog={pluginCatalogPane.pluginCatalog}
      hostedMarketplaceReport={pluginCatalogPane.hostedMarketplaceReport}
      pluginView={pluginCatalogPane.pluginView}
      setPluginView={pluginCatalogPane.setPluginView}
      pluginSourceFilter={pluginCatalogPane.pluginSourceFilter}
      setPluginSourceFilter={pluginCatalogPane.setPluginSourceFilter}
      pluginRuntimeFilter={pluginCatalogPane.pluginRuntimeFilter}
      setPluginRuntimeFilter={pluginCatalogPane.setPluginRuntimeFilter}
      pluginCapabilityDiagnostics={pluginCatalogPane.pluginCapabilityDiagnostics}
      pluginCapabilityDiagnosticsBusy={pluginCatalogPane.pluginCapabilityDiagnosticsBusy}
      pluginCapabilityDiagnosticsError={pluginCatalogPane.pluginCapabilityDiagnosticsError}
      capabilityBuilderHistory={pluginCatalogPane.capabilityBuilderHistory}
      capabilityBuilderHistoryLoading={pluginCatalogPane.capabilityBuilderHistoryLoading}
      capabilityBuilderHistoryError={pluginCatalogPane.capabilityBuilderHistoryError}
      capabilityBuilderHistoryPreviewStarting={pluginCatalogPane.capabilityBuilderHistoryPreviewStarting}
      capabilityBuilderHistoryRepairPlanning={pluginCatalogPane.capabilityBuilderHistoryRepairPlanning}
      capabilityBuilderHistoryReregisterStarting={pluginCatalogPane.capabilityBuilderHistoryReregisterStarting}
      generatedCapabilitySourceOpening={pluginCatalogPane.generatedCapabilitySourceOpening}
      generatedCapabilityValidationStarting={pluginCatalogPane.generatedCapabilityValidationStarting}
      generatedCapabilityUpdatePlanning={pluginCatalogPane.generatedCapabilityUpdatePlanning}
      generatedCapabilityRemovalPlanning={pluginCatalogPane.generatedCapabilityRemovalPlanning}
      selectedPluginDetailId={pluginCatalogPane.selectedPluginDetailId}
      setSelectedPluginDetailId={pluginCatalogPane.setSelectedPluginDetailId}
      setCapabilityBuilderLauncherOpen={capabilityBuilderLauncher.setOpen}
      firstRunCapabilityOnboardingDismissed={settingsPane.firstRunCapabilityOnboardingDismissed}
      firstRunCapabilityOnboardingStarting={settingsPane.firstRunCapabilityOnboardingStarting}
      codexMarketplaceSourceInput={pluginCatalogPane.codexMarketplaceSourceInput}
      setCodexMarketplaceSourceInput={pluginCatalogPane.setCodexMarketplaceSourceInput}
      codexMarketplaceNameInput={pluginCatalogPane.codexMarketplaceNameInput}
      setCodexMarketplaceNameInput={pluginCatalogPane.setCodexMarketplaceNameInput}
      codexMarketplaceAllowExperimental={pluginCatalogPane.codexMarketplaceAllowExperimental}
      setCodexMarketplaceAllowExperimental={pluginCatalogPane.setCodexMarketplaceAllowExperimental}
      codexMarketplaceAdding={pluginCatalogPane.codexMarketplaceAdding}
      codexMarketplaceRemoving={pluginCatalogPane.codexMarketplaceRemoving}
      pluginCatalogError={pluginCatalogPane.pluginCatalogError}
      mcpInspection={mcpPane.inspection}
      mcpRuntimeSnapshots={mcpPane.runtimeSnapshots}
      mcpInspectionError={mcpPane.inspectionError}
      mcpRuntimeBusy={mcpPane.runtimeBusy}
      mcpInspecting={mcpPane.inspecting}
      mcpServerQuery={mcpPane.serverQuery}
      setMcpServerQuery={mcpPane.setServerQuery}
      mcpRegistryResults={mcpPane.registryResults}
      mcpInstalledServers={mcpPane.installedServers}
      mcpSelectedPreview={mcpPane.selectedPreview}
      mcpServerBusy={mcpPane.serverBusy}
      mcpServerStatus={mcpPane.serverStatus}
      mcpServerError={mcpPane.serverError}
      managedDevServers={mcpPane.managedDevServers}
      managedDevServerBusy={mcpPane.managedDevServerBusy}
      managedDevServerError={mcpPane.managedDevServerError}
      mcpContainerRuntimeStatus={mcpPane.containerRuntimeStatus}
      mcpContainerRuntimeBusy={mcpPane.containerRuntimeBusy}
      mcpContainerRuntimeLaunchBusy={mcpPane.containerRuntimeLaunchBusy}
      mcpContainerRuntimeError={mcpPane.containerRuntimeError}
      mcpContainerRuntimeInstallProgress={mcpContainerRuntimeInstallProgress}
      mcpDefaultCapabilityInstallProgress={mcpDefaultCapabilityInstallProgress}
      mcpContainerRuntimeInstallBusyLabel={mcpContainerRuntimeInstallBusyLabel}
      diagnosticBusy={diagnosticsPane.diagnosticBusy}
      diagnosticStatus={diagnosticsPane.diagnosticStatus}
      pluginAuthBusy={pluginAuthPane.pluginAuthBusy}
      pluginAuthStatus={pluginAuthPane.pluginAuthStatus}
      setPluginAuthStatus={pluginAuthPane.setPluginAuthStatus}
      pluginAuthPending={pluginAuthPane.pluginAuthPending}
      setPluginAuthPending={pluginAuthPane.setPluginAuthPending}
      pluginAuthCode={pluginAuthPane.pluginAuthCode}
      setPluginAuthCode={pluginAuthPane.setPluginAuthCode}
      googleIntegration={googleIntegrationBridge.googleIntegration}
      googleSetupAccountHint={pluginAuthPane.googleSetupAccountHint}
      setGoogleSetupAccountHint={pluginAuthPane.setGoogleSetupAccountHint}
      googleSetupBusy={pluginAuthPane.googleSetupBusy}
      googleValidationFeedback={pluginAuthPane.googleValidationFeedback}
      pluginDependencyInstalling={pluginCatalogPane.pluginDependencyInstalling}
      pluginDependencyStatus={pluginCatalogPane.pluginDependencyStatus}
      piPackageCatalog={piPackagePane.piPackageCatalog}
      piPackageError={piPackagePane.piPackageError}
      piPackageInspecting={piPackagePane.piPackageInspecting}
      selectedPiPackageDetailId={piPackagePane.selectedPiPackageDetailId}
      setSelectedPiPackageDetailId={piPackagePane.setSelectedPiPackageDetailId}
      piPackageInstalling={piPackagePane.piPackageInstalling}
      piPackageUninstalling={piPackagePane.piPackageUninstalling}
      piPackageEnabling={piPackagePane.piPackageEnabling}
      piExtensionSandboxCatalog={piPackagePane.piExtensionSandboxCatalog}
      piExtensionSandboxInstalling={piPackagePane.piExtensionSandboxInstalling}
      piExtensionSandboxFallback={piPackagePane.piExtensionSandboxFallback}
      piExtensionSandboxUninstalling={piPackagePane.piExtensionSandboxUninstalling}
      piExtensionSandboxClearingHistory={piPackagePane.piExtensionSandboxClearingHistory}
      piPrivilegedCatalog={piPackagePane.piPrivilegedCatalog}
      piPrivilegedBusy={piPackagePane.piPrivilegedBusy}
      piPrivilegedClearingHistory={piPackagePane.piPrivilegedClearingHistory}
      piPrivilegedScan={piPackagePane.piPrivilegedScan}
      piPrivilegedScanSource={piPackagePane.piPrivilegedScanSource}
      piPrivilegedScanning={piPackagePane.piPrivilegedScanning}
      piPrivilegedInstalling={piPackagePane.piPrivilegedInstalling}
      piPackageSourceInput={piPackagePane.piPackageSourceInput}
      setPiPackageSourceInput={piPackagePane.setPiPackageSourceInput}
      piPackageInstallScope={piPackagePane.piPackageInstallScope}
      setPiPackageInstallScope={piPackagePane.setPiPackageInstallScope}
      permissionAudit={permissionAudit}
      loadPluginCatalog={pluginCatalogPane.loadPluginCatalog}
      resumeFirstRunCapabilityOnboarding={settingsPane.resumeFirstRunCapabilityOnboarding}
      inspectPluginMcp={mcpPane.inspectPluginMcp}
      inspectPiPackages={piPackagePane.inspectPiPackages}
      startFirstRunCapabilityOnboarding={settingsPane.startFirstRunCapabilityOnboarding}
      dismissFirstRunCapabilityOnboarding={settingsPane.dismissFirstRunCapabilityOnboarding}
      completePluginAppAuth={pluginAuthPane.completePluginAppAuth}
      importCodexPlugin={pluginCatalogPane.importCodexPlugin}
      refreshMcpContainerRuntimeStatus={mcpPane.refreshContainerRuntimeStatus}
      setMcpContainerRuntimeModalOpen={mcpPane.setContainerRuntimeModalOpen}
      onOpenMcpRuntimeSettings={onOpenMcpRuntimeSettings}
      exportDiagnostics={diagnosticsPane.exportDiagnostics}
      launchMcpContainerRuntimeInstaller={mcpPane.launchContainerRuntimeInstaller}
      installMcpDefaultCapability={mcpPane.installDefaultCapability}
      loadManagedDevServers={mcpPane.loadManagedDevServers}
      stopManagedDevServerProcess={mcpPane.stopManagedDevServerProcess}
      searchMcpRegistryServers={mcpPane.searchRegistryServers}
      loadMcpInstalledServers={mcpPane.loadInstalledServers}
      acceptMcpToolDescriptorReview={mcpPane.acceptToolDescriptorReview}
      uninstallMcpServer={mcpPane.uninstallServer}
      describeMcpRegistryServer={mcpPane.describeRegistryServer}
      installMcpRegistryServer={mcpPane.installRegistryServer}
      revealGeneratedCapabilitySource={pluginCatalogPane.revealGeneratedCapabilitySource}
      setPluginTrusted={pluginCatalogPane.setPluginTrusted}
      setPluginEnabled={pluginCatalogPane.setPluginEnabled}
      uninstallCodexPlugin={pluginCatalogPane.uninstallCodexPlugin}
      startGeneratedCapabilityValidation={pluginCatalogPane.startGeneratedCapabilityValidation}
      startGeneratedCapabilityUpdatePlan={pluginCatalogPane.startGeneratedCapabilityUpdatePlan}
      startGeneratedCapabilityRemovalPlan={pluginCatalogPane.startGeneratedCapabilityRemovalPlan}
      installCodexPluginDependencies={pluginCatalogPane.installCodexPluginDependencies}
      startPluginAppAuth={pluginAuthPane.startPluginAppAuth}
      installGoogleWorkspaceCli={pluginAuthPane.installGoogleWorkspaceCli}
      confirmGoogleWorkspaceAccount={pluginAuthPane.confirmGoogleWorkspaceAccount}
      startGoogleWorkspaceSetup={pluginAuthPane.startGoogleWorkspaceSetup}
      importGoogleWorkspaceOAuthClient={pluginAuthPane.importGoogleWorkspaceOAuthClient}
      validateGoogleWorkspace={pluginAuthPane.validateGoogleWorkspace}
      cancelGoogleWorkspaceSetup={pluginAuthPane.cancelGoogleWorkspaceSetup}
      testPluginAuthAccount={pluginAuthPane.testPluginAuthAccount}
      disconnectGoogleWorkspace={pluginAuthPane.disconnectGoogleWorkspace}
      disconnectPluginAuthAccount={pluginAuthPane.disconnectPluginAuthAccount}
      revokePluginAuthAccount={pluginAuthPane.revokePluginAuthAccount}
      addCodexMarketplace={pluginCatalogPane.addCodexMarketplace}
      removeCodexMarketplace={pluginCatalogPane.removeCodexMarketplace}
      loadCapabilityBuilderHistory={pluginCatalogPane.loadCapabilityBuilderHistory}
      startCapabilityBuilderHistoryPreview={pluginCatalogPane.startCapabilityBuilderHistoryPreview}
      startCapabilityBuilderHistoryReregister={pluginCatalogPane.startCapabilityBuilderHistoryReregister}
      startCapabilityBuilderHistoryRepairPlan={pluginCatalogPane.startCapabilityBuilderHistoryRepairPlan}
      installPiPackage={piPackagePane.installPiPackage}
      installPiExtensionSandboxPackage={piPackagePane.installPiExtensionSandboxPackage}
      scanPiPrivilegedPackage={piPackagePane.scanPiPrivilegedPackage}
      installPiPrivilegedPackage={piPackagePane.installPiPrivilegedPackage}
      uninstallPiPackage={piPackagePane.uninstallPiPackage}
      setPiPackageEnabled={piPackagePane.setPiPackageEnabled}
      uninstallPiExtensionSandboxPackage={piPackagePane.uninstallPiExtensionSandboxPackage}
      clearPiExtensionSandboxHistory={piPackagePane.clearPiExtensionSandboxHistory}
      disablePiPrivilegedPackage={piPackagePane.disablePiPrivilegedPackage}
      uninstallPiPrivilegedPackage={piPackagePane.uninstallPiPrivilegedPackage}
      clearPiPrivilegedPackageHistory={piPackagePane.clearPiPrivilegedPackageHistory}
      inspectAmbientPluginCapability={pluginCatalogPane.inspectAmbientPluginCapability}
      restartPluginMcpRuntime={mcpPane.restartPluginMcpRuntime}
      stopPluginMcpRuntime={mcpPane.stopPluginMcpRuntime}
    />
  );
}
