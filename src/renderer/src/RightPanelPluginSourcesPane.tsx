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
  CodexMarketplaceAddSection,
  CodexMarketplaceSourcesSection,
  GeneratedCapabilitySourcesSection,
  HostedCodexMarketplaceSection,
} from "./RightPanelPluginSourceSections";
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
  return (
    <div className="plugin-list">
      <CodexMarketplaceAddSection
        codexMarketplaceAllowExperimental={codexMarketplaceAllowExperimental}
        codexMarketplaceAdding={codexMarketplaceAdding}
        codexMarketplaceNameInput={codexMarketplaceNameInput}
        codexMarketplaceSourceInput={codexMarketplaceSourceInput}
        setCodexMarketplaceAllowExperimental={setCodexMarketplaceAllowExperimental}
        setCodexMarketplaceNameInput={setCodexMarketplaceNameInput}
        setCodexMarketplaceSourceInput={setCodexMarketplaceSourceInput}
        addCodexMarketplace={addCodexMarketplace}
      />
      <GeneratedCapabilitySourcesSection
        running={running}
        capabilityBuilderHistory={capabilityBuilderHistory}
        capabilityBuilderHistoryLoading={capabilityBuilderHistoryLoading}
        capabilityBuilderHistoryError={capabilityBuilderHistoryError}
        capabilityBuilderHistoryPreviewStarting={capabilityBuilderHistoryPreviewStarting}
        capabilityBuilderHistoryRepairPlanning={capabilityBuilderHistoryRepairPlanning}
        capabilityBuilderHistoryReregisterStarting={capabilityBuilderHistoryReregisterStarting}
        generatedCapabilitySourceOpening={generatedCapabilitySourceOpening}
        generatedCapabilityUpdatePlanning={generatedCapabilityUpdatePlanning}
        generatedCapabilityRemovalPlanning={generatedCapabilityRemovalPlanning}
        loadCapabilityBuilderHistory={loadCapabilityBuilderHistory}
        revealGeneratedCapabilitySource={revealGeneratedCapabilitySource}
        startCapabilityBuilderHistoryPreview={startCapabilityBuilderHistoryPreview}
        startCapabilityBuilderHistoryRepairPlan={startCapabilityBuilderHistoryRepairPlan}
        startCapabilityBuilderHistoryReregister={startCapabilityBuilderHistoryReregister}
        startGeneratedCapabilityRemovalPlan={startGeneratedCapabilityRemovalPlan}
        startGeneratedCapabilityUpdatePlan={startGeneratedCapabilityUpdatePlan}
      />
      <CodexMarketplaceSourcesSection
        codexMarketplaceRemoving={codexMarketplaceRemoving}
        codexMarketplaceSources={codexMarketplaceSources}
        removeCodexMarketplace={removeCodexMarketplace}
      />
      {hostedMarketplaceReport && <HostedCodexMarketplaceSection report={hostedMarketplaceReport} />}
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
