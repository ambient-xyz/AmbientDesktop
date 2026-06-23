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
  PiExtensionSandboxFallbackPanel,
  PiManagedPackageList,
  PiPackageInstallControls,
  PiPrivilegedInstallsSection,
  PiPrivilegedScanPanel,
  PiSandboxedToolsSection,
} from "./RightPanelPluginPiPackageSections";

type MaybePromise<T = unknown> = T | Promise<T>;

export type RightPanelPluginPiPackagesPaneProps = {
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

export function RightPanelPluginPiPackagesPane({
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
}: RightPanelPluginPiPackagesPaneProps) {
  if (!piPackageCatalog) {
    return null;
  }

  return (
    <section className="plugin-import-section pi-package-section">
      <PiPackageInstallControls
        piPackageCatalog={piPackageCatalog}
        piPackageInstalling={piPackageInstalling}
        piExtensionSandboxInstalling={piExtensionSandboxInstalling}
        piPrivilegedScan={piPrivilegedScan}
        piPrivilegedScanSource={piPrivilegedScanSource}
        piPrivilegedScanning={piPrivilegedScanning}
        piPrivilegedInstalling={piPrivilegedInstalling}
        piPackageSourceInput={piPackageSourceInput}
        setPiPackageSourceInput={setPiPackageSourceInput}
        piPackageInstallScope={piPackageInstallScope}
        setPiPackageInstallScope={setPiPackageInstallScope}
        installPiPackage={installPiPackage}
        installPiExtensionSandboxPackage={installPiExtensionSandboxPackage}
        scanPiPrivilegedPackage={scanPiPrivilegedPackage}
        installPiPrivilegedPackage={installPiPrivilegedPackage}
      />
      <PiExtensionSandboxFallbackPanel
        fallback={piExtensionSandboxFallback}
        piPrivilegedScanning={piPrivilegedScanning}
      />
      <PiPrivilegedScanPanel scan={piPrivilegedScan} />
      <PiManagedPackageList
        catalog={piPackageCatalog}
        piPackageInstalling={piPackageInstalling}
        piPackageUninstalling={piPackageUninstalling}
        piPackageEnabling={piPackageEnabling}
        piPackageInstallScope={piPackageInstallScope}
        installPiPackage={installPiPackage}
        uninstallPiPackage={uninstallPiPackage}
        setPiPackageEnabled={setPiPackageEnabled}
      />
      <PiSandboxedToolsSection
        catalog={piExtensionSandboxCatalog}
        selectedPiPackageDetailId={selectedPiPackageDetailId}
        setSelectedPiPackageDetailId={setSelectedPiPackageDetailId}
        piExtensionSandboxUninstalling={piExtensionSandboxUninstalling}
        piExtensionSandboxClearingHistory={piExtensionSandboxClearingHistory}
        permissionAudit={permissionAudit}
        uninstallPiExtensionSandboxPackage={uninstallPiExtensionSandboxPackage}
        clearPiExtensionSandboxHistory={clearPiExtensionSandboxHistory}
      />
      <PiPrivilegedInstallsSection
        catalog={piPrivilegedCatalog}
        selectedPiPackageDetailId={selectedPiPackageDetailId}
        setSelectedPiPackageDetailId={setSelectedPiPackageDetailId}
        piPrivilegedBusy={piPrivilegedBusy}
        piPrivilegedClearingHistory={piPrivilegedClearingHistory}
        permissionAudit={permissionAudit}
        disablePiPrivilegedPackage={disablePiPrivilegedPackage}
        uninstallPiPrivilegedPackage={uninstallPiPrivilegedPackage}
        clearPiPrivilegedPackageHistory={clearPiPrivilegedPackageHistory}
      />
    </section>

  );
}
