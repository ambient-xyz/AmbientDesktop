import type {
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  ManagedDevServerSummary,
} from "../../shared/pluginTypes";
import {
  RightPanelManagedDevServersSection,
  RightPanelMcpRuntimeStatusSection,
  type RightPanelMcpRuntimePanelActionState,
} from "./RightPanelPluginMcpRuntimeSections";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export function RightPanelPluginMcpRuntime({
  runtimeStatus,
  runtimeToneClass,
  runtimeLabel,
  runtimeBusy,
  runtimeLaunchBusy,
  runtimeError,
  diagnosticsAction,
  diagnosticStatus,
  installProgressStatus,
  defaultCapabilityInstallProgressStatus,
  setupResumeRows,
  mcpServerBusy,
  managedDevServers,
  managedDevServerBusy,
  managedDevServerError,
  installBusyLabel,
  onRefreshRuntime,
  onOpenRuntimeReview,
  onOpenRuntimeSettings,
  onExportDiagnostics,
  onLaunchInstaller,
  onReviewInstallCommandPlan,
  onInstallDefaultCapability,
  onLoadManagedDevServers,
  onStopManagedDevServer,
}: {
  runtimeStatus?: AmbientMcpContainerRuntimeStatus;
  runtimeToneClass: string;
  runtimeLabel: string;
  runtimeBusy: boolean;
  runtimeLaunchBusy: boolean;
  runtimeError?: string;
  diagnosticsAction: RightPanelMcpRuntimePanelActionState;
  diagnosticStatus?: ApiKeyStatus;
  installProgressStatus?: ApiKeyStatus;
  defaultCapabilityInstallProgressStatus?: ApiKeyStatus;
  setupResumeRows: string[];
  mcpServerBusy?: string;
  managedDevServers: ManagedDevServerSummary[];
  managedDevServerBusy?: string;
  managedDevServerError?: string;
  installBusyLabel: (kind?: string) => string;
  onRefreshRuntime: () => void;
  onOpenRuntimeReview: () => void;
  onOpenRuntimeSettings: () => void;
  onExportDiagnostics: () => void;
  onLaunchInstaller: () => void;
  onReviewInstallCommandPlan: () => void;
  onInstallDefaultCapability: (capabilityId: AmbientMcpDefaultCapabilityInstallInput["capabilityId"]) => void;
  onLoadManagedDevServers: () => void;
  onStopManagedDevServer: (id: string) => void;
}) {
  return (
    <>
      <RightPanelMcpRuntimeStatusSection
        runtimeStatus={runtimeStatus}
        runtimeToneClass={runtimeToneClass}
        runtimeLabel={runtimeLabel}
        runtimeBusy={runtimeBusy}
        runtimeLaunchBusy={runtimeLaunchBusy}
        runtimeError={runtimeError}
        diagnosticsAction={diagnosticsAction}
        diagnosticStatus={diagnosticStatus}
        installProgressStatus={installProgressStatus}
        defaultCapabilityInstallProgressStatus={defaultCapabilityInstallProgressStatus}
        setupResumeRows={setupResumeRows}
        mcpServerBusy={mcpServerBusy}
        installBusyLabel={installBusyLabel}
        onRefreshRuntime={onRefreshRuntime}
        onOpenRuntimeReview={onOpenRuntimeReview}
        onOpenRuntimeSettings={onOpenRuntimeSettings}
        onExportDiagnostics={onExportDiagnostics}
        onLaunchInstaller={onLaunchInstaller}
        onReviewInstallCommandPlan={onReviewInstallCommandPlan}
        onInstallDefaultCapability={onInstallDefaultCapability}
      />
      <RightPanelManagedDevServersSection
        managedDevServers={managedDevServers}
        managedDevServerBusy={managedDevServerBusy}
        managedDevServerError={managedDevServerError}
        onLoadManagedDevServers={onLoadManagedDevServers}
        onStopManagedDevServer={onStopManagedDevServer}
      />
    </>
  );
}
