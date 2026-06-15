import { useEffect, useState } from "react";

import type {
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PiPackageCatalog,
  PiPackageInstallScope,
  PiPrivilegedCatalog,
  PiPrivilegedSecurityScan,
} from "../../shared/types";

type UseRightPanelPiPackageControllerInput = {
  panel: string;
  resetWorkspacePath: string;
  eventWorkspacePath: string;
  onLoadPermissionAudit: () => Promise<void>;
  loadAmbientPluginRegistry: () => Promise<void>;
  loadPluginCatalog: () => Promise<void>;
};

export function useRightPanelPiPackageController({
  panel,
  resetWorkspacePath,
  eventWorkspacePath,
  onLoadPermissionAudit,
  loadAmbientPluginRegistry,
  loadPluginCatalog,
}: UseRightPanelPiPackageControllerInput) {
  const [piPackageCatalog, setPiPackageCatalog] = useState<PiPackageCatalog | undefined>();
  const [piPackageError, setPiPackageError] = useState<string | undefined>();
  const [piPackageInspecting, setPiPackageInspecting] = useState(false);
  const [selectedPiPackageDetailId, setSelectedPiPackageDetailId] = useState<string | undefined>();
  const [piPackageInstalling, setPiPackageInstalling] = useState(false);
  const [piPackageUninstalling, setPiPackageUninstalling] = useState<string | undefined>();
  const [piPackageEnabling, setPiPackageEnabling] = useState<string | undefined>();
  const [piExtensionSandboxCatalog, setPiExtensionSandboxCatalog] = useState<PiExtensionSandboxCatalog | undefined>();
  const [piExtensionSandboxInstalling, setPiExtensionSandboxInstalling] = useState(false);
  const [piExtensionSandboxFallback, setPiExtensionSandboxFallback] = useState<PiExtensionSandboxInstallPreview | undefined>();
  const [piExtensionSandboxUninstalling, setPiExtensionSandboxUninstalling] = useState<string | undefined>();
  const [piExtensionSandboxClearingHistory, setPiExtensionSandboxClearingHistory] = useState(false);
  const [piPrivilegedCatalog, setPiPrivilegedCatalog] = useState<PiPrivilegedCatalog | undefined>();
  const [piPrivilegedBusy, setPiPrivilegedBusy] = useState<string | undefined>();
  const [piPrivilegedClearingHistory, setPiPrivilegedClearingHistory] = useState(false);
  const [piPrivilegedScan, setPiPrivilegedScan] = useState<PiPrivilegedSecurityScan | undefined>();
  const [piPrivilegedScanSource, setPiPrivilegedScanSource] = useState<string | undefined>();
  const [piPrivilegedScanning, setPiPrivilegedScanning] = useState(false);
  const [piPrivilegedInstalling, setPiPrivilegedInstalling] = useState(false);
  const [piPackageSourceInput, setPiPackageSourceInput] = useState("");
  const [piPackageInstallScope, setPiPackageInstallScope] = useState<PiPackageInstallScope>("workspace");

  useEffect(() => {
    setPiPackageCatalog(undefined);
    setPiExtensionSandboxCatalog(undefined);
    setPiPrivilegedCatalog(undefined);
    setPiPrivilegedScan(undefined);
    setPiPrivilegedScanSource(undefined);
    setPiPackageError(undefined);
    setPiPackageUninstalling(undefined);
    setPiExtensionSandboxUninstalling(undefined);
    setPiPrivilegedBusy(undefined);
    setPiPrivilegedScanning(false);
    setPiPrivilegedInstalling(false);
    setPiPackageSourceInput("");
  }, [resetWorkspacePath]);

  useEffect(() => {
    return window.ambientDesktop.onEvent((event) => {
      if (event.type !== "pi-privileged-scan-updated") return;
      setPiExtensionSandboxFallback(event.fallback);
      setPiPrivilegedScan(event.scan);
      setPiPrivilegedScanSource(event.source);
      setPiPackageSourceInput(event.source);
      if (panel === "plugins") {
        void loadPluginCatalog();
        void inspectPiPackages();
      }
    });
  }, [panel, eventWorkspacePath]);

  async function inspectPiPackages() {
    setPiPackageError(undefined);
    setPiPackageInspecting(true);
    try {
      const [catalog, sandboxCatalog, privilegedCatalog] = await Promise.all([
        window.ambientDesktop.inspectPiPackages(),
        window.ambientDesktop.inspectPiExtensionSandboxPackages(),
        window.ambientDesktop.inspectPiPrivilegedPackages(),
      ]);
      setPiPackageCatalog(catalog);
      setPiExtensionSandboxCatalog(sandboxCatalog);
      setPiPrivilegedCatalog(privilegedCatalog);
      await onLoadPermissionAudit();
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageCatalog(undefined);
      setPiExtensionSandboxCatalog(undefined);
      setPiPrivilegedCatalog(undefined);
      setSelectedPiPackageDetailId(undefined);
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPackageInspecting(false);
    }
  }

  async function installPiPackage(source: string, scope: PiPackageInstallScope = piPackageInstallScope) {
    const normalizedSource = source.trim();
    if (!normalizedSource) return;
    setPiPackageError(undefined);
    setPiPackageInstalling(true);
    try {
      setPiPackageCatalog(await window.ambientDesktop.installPiPackage({ source: normalizedSource, scope }));
      setPiPackageSourceInput("");
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPackageInstalling(false);
    }
  }

  async function installPiExtensionSandboxPackage(source: string) {
    const normalizedSource = source.trim();
    if (!normalizedSource) return;
    setPiPackageError(undefined);
    setPiExtensionSandboxFallback(undefined);
    setPiExtensionSandboxInstalling(true);
    try {
      const preview = await window.ambientDesktop.previewPiExtensionSandboxPackage({ source: normalizedSource });
      if (!preview.installable) {
        setPiExtensionSandboxFallback(preview);
        setPiPrivilegedScanning(true);
        try {
          setPiPrivilegedScan(await window.ambientDesktop.scanPiPrivilegedPackage({ source: normalizedSource, scanOrigin: "sandbox-fallback" }));
          setPiPrivilegedScanSource(normalizedSource);
        } catch (scanError) {
          setPiPrivilegedScan(undefined);
          setPiPrivilegedScanSource(undefined);
          setPiPackageError(scanError instanceof Error ? scanError.message : String(scanError));
        } finally {
          setPiPrivilegedScanning(false);
        }
        return;
      }
      setPiExtensionSandboxCatalog(await window.ambientDesktop.installPiExtensionSandboxPackage({ source: normalizedSource }));
      await onLoadPermissionAudit();
      setPiPackageSourceInput("");
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiExtensionSandboxInstalling(false);
    }
  }

  async function scanPiPrivilegedPackage(source: string) {
    const normalizedSource = source.trim();
    if (!normalizedSource) return;
    setPiPackageError(undefined);
    setPiExtensionSandboxFallback(undefined);
    setPiPrivilegedScanning(true);
    try {
      setPiPrivilegedScan(await window.ambientDesktop.scanPiPrivilegedPackage({ source: normalizedSource, scanOrigin: "explicit" }));
      setPiPrivilegedScanSource(normalizedSource);
    } catch (error) {
      setPiPrivilegedScan(undefined);
      setPiPrivilegedScanSource(undefined);
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPrivilegedScanning(false);
    }
  }

  async function installPiPrivilegedPackage(source: string) {
    const normalizedSource = source.trim();
    if (!normalizedSource) return;
    setPiPackageError(undefined);
    setPiPrivilegedInstalling(true);
    try {
      setPiPrivilegedCatalog(await window.ambientDesktop.installPiPrivilegedPackage({ source: normalizedSource, scanOrigin: piPrivilegedScan?.scanOrigin ?? "explicit" }));
      await onLoadPermissionAudit();
      setPiPackageSourceInput("");
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPrivilegedInstalling(false);
    }
  }

  async function uninstallPiPackage(packageId: string) {
    setPiPackageError(undefined);
    setPiPackageUninstalling(packageId);
    try {
      setPiPackageCatalog(await window.ambientDesktop.uninstallPiPackage({ packageId }));
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPackageUninstalling(undefined);
    }
  }

  async function uninstallPiExtensionSandboxPackage(packageId: string) {
    setPiPackageError(undefined);
    setPiExtensionSandboxUninstalling(packageId);
    try {
      setPiExtensionSandboxCatalog(await window.ambientDesktop.uninstallPiExtensionSandboxPackage({ packageId }));
      await onLoadPermissionAudit();
      setSelectedPiPackageDetailId(undefined);
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiExtensionSandboxUninstalling(undefined);
    }
  }

  async function clearPiExtensionSandboxHistory() {
    setPiPackageError(undefined);
    setPiExtensionSandboxClearingHistory(true);
    try {
      setPiExtensionSandboxCatalog(await window.ambientDesktop.clearPiExtensionSandboxHistory());
      await onLoadPermissionAudit();
      setSelectedPiPackageDetailId(undefined);
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiExtensionSandboxClearingHistory(false);
    }
  }

  async function disablePiPrivilegedPackage(packageId: string) {
    setPiPackageError(undefined);
    setPiPrivilegedBusy(packageId);
    try {
      setPiPrivilegedCatalog(await window.ambientDesktop.disablePiPrivilegedPackage({ packageId }));
      await onLoadPermissionAudit();
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPrivilegedBusy(undefined);
    }
  }

  async function uninstallPiPrivilegedPackage(packageId: string) {
    setPiPackageError(undefined);
    setPiPrivilegedBusy(packageId);
    try {
      setPiPrivilegedCatalog(await window.ambientDesktop.uninstallPiPrivilegedPackage({ packageId }));
      await onLoadPermissionAudit();
      setSelectedPiPackageDetailId(undefined);
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPrivilegedBusy(undefined);
    }
  }

  async function clearPiPrivilegedPackageHistory() {
    setPiPackageError(undefined);
    setPiPrivilegedClearingHistory(true);
    try {
      setPiPrivilegedCatalog(await window.ambientDesktop.clearPiPrivilegedPackageHistory());
      await onLoadPermissionAudit();
      setSelectedPiPackageDetailId(undefined);
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPrivilegedClearingHistory(false);
    }
  }

  async function setPiPackageEnabled(packageId: string, enabled: boolean) {
    setPiPackageError(undefined);
    setPiPackageEnabling(packageId);
    try {
      setPiPackageCatalog(await window.ambientDesktop.setPiPackageEnabled({ packageId, enabled }));
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPiPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setPiPackageEnabling(undefined);
    }
  }

  return {
    piPackageCatalog,
    piPackageError,
    piPackageInspecting,
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
    inspectPiPackages,
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
  };
}
