import type {
  MiniCpmVisionDiagnosticItem,
  MiniCpmVisionSetupAction,
  MiniCpmVisionSetupResult,
  MiniCpmVisionValidationMetadata,
} from "../../shared/types";

export interface MiniCpmVisionSetupActionModel {
  action: MiniCpmVisionSetupAction;
  label: string;
  title: string;
  primary?: boolean;
  danger?: boolean;
}

export interface MiniCpmVisionSetupResultModel {
  statusLabel: string;
  statusTone: "success" | "warning" | "error" | "info";
  detailLabels: string[];
  diagnostics: MiniCpmVisionDiagnosticItem[];
}

export function miniCpmVisionSetupActions(result?: MiniCpmVisionSetupResult): MiniCpmVisionSetupActionModel[] {
  if (!result) {
    return [
      {
        action: "install",
        label: "Install",
        title: "Install or refresh the MiniCPM-V first-party provider package and bind a llama-server runtime",
        primary: true,
      },
      {
        action: "validate",
        label: "Validate",
        title: "Check the MiniCPM-V package and runtime without reinstalling",
      },
      {
        action: "uninstall",
        label: "Clean up",
        title: "Remove the Ambient-installed MiniCPM-V package and managed workspace cache",
        danger: true,
      },
    ];
  }
  if (result.status === "ready") {
    return [
      {
        action: "validate",
        label: "Re-run validation",
        title: "Re-run MiniCPM-V runtime validation",
        primary: true,
      },
      {
        action: "stop",
        label: "Stop runtime",
        title: "Stop the workspace-local MiniCPM-V daemon without uninstalling the provider or deleting runtime/model caches",
      },
      {
        action: "repair",
        label: "Repair",
        title: "Repair MiniCPM-V provider package bindings and validation metadata",
      },
      {
        action: "uninstall",
        label: "Clean up",
        title: "Remove the Ambient-installed MiniCPM-V package and managed workspace cache",
        danger: true,
      },
    ];
  }
  if (result.status === "stopped") {
    return [
      {
        action: "validate",
        label: "Validate",
        title: "Check MiniCPM-V package and runtime state; analysis can restart the managed daemon when needed",
        primary: true,
      },
      {
        action: "repair",
        label: "Repair",
        title: "Repair MiniCPM-V provider package bindings and validation metadata",
      },
      {
        action: "uninstall",
        label: "Clean up",
        title: "Remove the Ambient-installed MiniCPM-V package and managed workspace cache",
        danger: true,
      },
    ];
  }
  if (result.status === "uninstalled") {
    return [
      {
        action: "install",
        label: "Install",
        title: "Install or refresh the MiniCPM-V first-party provider package and bind a llama-server runtime",
        primary: true,
      },
      {
        action: "validate",
        label: "Validate",
        title: "Check the MiniCPM-V package and runtime without reinstalling",
      },
    ];
  }
  return [
    {
      action: "repair",
      label: "Repair",
      title: "Repair MiniCPM-V provider package bindings and validation metadata",
      primary: true,
    },
    {
      action: "validate",
      label: "Validate",
      title: "Check whether the MiniCPM-V runtime issue has been fixed",
    },
    {
      action: "install",
      label: "Reinstall",
      title: "Reinstall the MiniCPM-V first-party provider package",
    },
    {
      action: "uninstall",
      label: "Clean up",
      title: "Remove the Ambient-installed MiniCPM-V package and managed workspace cache",
      danger: true,
    },
  ];
}

export function miniCpmVisionSetupResultModel(result: MiniCpmVisionSetupResult): MiniCpmVisionSetupResultModel {
  const validation = miniCpmVisionValidationModel(result.validation);
  const installed = result.installStatuses.find((status) => status.packageName === result.packageName);
  return {
    statusLabel:
      result.status === "ready"
        ? result.validation.status === "passed"
          ? "MiniCPM-V validated"
          : "MiniCPM-V runtime ready"
        : result.status === "stopped"
          ? "MiniCPM-V stopped"
        : result.status === "needs-runtime"
          ? "MiniCPM-V needs llama-server"
          : result.status === "validation-failed"
            ? "MiniCPM-V validation failed"
            : result.status === "uninstalled"
              ? "MiniCPM-V cleaned up"
              : "MiniCPM-V setup failed",
    statusTone:
      result.status === "ready"
        ? "success"
        : result.status === "stopped"
          ? "info"
        : result.status === "uninstalled"
          ? "info"
        : result.status === "needs-runtime"
          ? "warning"
          : "error",
    detailLabels: [
      installed ? `Package: ${installed.status}` : "",
      result.cleanup ? `Package cleanup: ${result.cleanup.packageStatus}` : "",
      result.cleanup ? `Runtime stop: ${result.cleanup.stopStatus}` : "",
      result.runtimeInstall ? `Runtime install: ${result.runtimeInstall.status}` : "",
      result.runtimeInstall?.artifactId ? `Runtime artifact: ${result.runtimeInstall.artifactId}` : "",
      result.runtimeInstall?.receiptPath ? `Runtime receipt: ${result.runtimeInstall.receiptPath}` : "",
      result.runtimeInstall?.macosSecurity
        ? `macOS runtime security: quarantine ${result.runtimeInstall.macosSecurity.quarantineBefore}->${result.runtimeInstall.macosSecurity.quarantineAfter}, Gatekeeper ${result.runtimeInstall.macosSecurity.gatekeeperAssessment}, default download ${result.runtimeInstall.macosSecurity.defaultDownloadPromotion}${result.runtimeInstall.macosSecurity.promotionPolicy ? ` (${result.runtimeInstall.macosSecurity.promotionPolicy})` : ""}`
        : "",
      ...(result.cleanup?.paths.map((path) => `Cleanup ${path.path}: ${path.status}`) ?? []),
      ...validation.detailLabels,
      ...result.nextSteps,
    ].filter(Boolean),
    diagnostics: result.diagnostics.length ? result.diagnostics : validation.diagnostics,
  };
}

export function miniCpmVisionValidationModel(validation: MiniCpmVisionValidationMetadata): MiniCpmVisionSetupResultModel {
  const statusLabel =
    validation.status === "passed"
      ? "Validation passed"
      : validation.status === "runtime-ready"
        ? "Runtime ready"
        : validation.status === "stopped"
          ? "Runtime stopped"
        : validation.status === "needs-runtime"
          ? "Runtime missing"
          : validation.status === "failed"
            ? "Validation failed"
            : validation.status === "uninstalled"
              ? "Provider cleaned up"
              : "Validation not run";
  const statusTone =
    validation.status === "passed"
      ? "success"
      : validation.status === "runtime-ready" || validation.status === "stopped" || validation.status === "not-run" || validation.status === "uninstalled"
        ? "info"
        : validation.status === "needs-runtime"
          ? "warning"
          : "error";
  const detailLabels = [
    validation.lane ? `Lane: ${validation.lane}` : "",
    validation.runtimeVersion ? `Runtime: ${validation.runtimeVersion}` : "",
    validation.runtimeContract ? `Runtime acquisition: ${validation.runtimeContract.mode}` : "",
    validation.runtimeContract ? `Runtime cache: ${validation.runtimeContract.runtimeCacheRoot}` : "",
    validation.runtimeContract?.ambientManagedDownload.manifestVerification
      ? `Runtime manifest: ${validation.runtimeContract.ambientManagedDownload.manifestVerification.status}`
      : "",
    validation.runtimeContract?.ambientManagedDownload.manifestVerification?.selectedArtifactId
      ? `Runtime artifact: ${validation.runtimeContract.ambientManagedDownload.manifestVerification.selectedArtifactId}`
      : "",
    validation.runtimeInstall ? `Runtime install: ${validation.runtimeInstall.status}` : "",
    validation.runtimeInstall?.receiptPath ? `Runtime install receipt: ${validation.runtimeInstall.receiptPath}` : "",
    validation.runtimeInstall?.macosSecurity
      ? `macOS runtime security: quarantine ${validation.runtimeInstall.macosSecurity.quarantineBefore}->${validation.runtimeInstall.macosSecurity.quarantineAfter}, Gatekeeper ${validation.runtimeInstall.macosSecurity.gatekeeperAssessment}, default download ${validation.runtimeInstall.macosSecurity.defaultDownloadPromotion}${validation.runtimeInstall.macosSecurity.promotionPolicy ? ` (${validation.runtimeInstall.macosSecurity.promotionPolicy})` : ""}`
      : "",
    validation.binaryPath ? `Binary: ${validation.binaryPath}` : "",
    validation.model ? `Model: ${validation.model}` : "",
    validation.endpoint ? `Endpoint: ${validation.endpoint}` : "",
    validation.endpointMode ? `Endpoint mode: ${validation.endpointMode}` : "",
    validation.endpointModelIds?.length ? `Endpoint models: ${validation.endpointModelIds.join(", ")}` : "",
    ...miniCpmRuntimeStateDetailLabels(validation.runtimeState),
    validation.summary ? `Summary: ${validation.summary}` : "",
    validation.artifactPath ? `Artifact: ${validation.artifactPath}` : "",
    validation.durationMs !== undefined ? `Elapsed: ${Math.round(validation.durationMs).toLocaleString()} ms` : "",
    validation.updatedAt ? `Updated: ${validation.updatedAt}` : "",
    validation.error ? `Error: ${validation.error}` : "",
    ...(validation.runtimeContract?.preflight.map((check) => `Preflight ${check.label}: ${check.status}`) ?? []),
    ...(validation.runtimeContract?.ambientManagedDownload.manifestVerification?.checks.map((check) => `Runtime manifest ${check.label}: ${check.status}`) ?? []),
    ...validation.missingHints,
  ].filter(Boolean);
  return {
    statusLabel,
    statusTone,
    detailLabels,
    diagnostics: validation.diagnostics ?? [],
  };
}

function miniCpmRuntimeStateDetailLabels(runtimeState: MiniCpmVisionValidationMetadata["runtimeState"]): string[] {
  if (!runtimeState) return [];
  return [
    `Runtime state: ${runtimeState.status}`,
    runtimeState.pid ? `Runtime pid: ${runtimeState.pid}` : "",
    runtimeState.previousPid ? `Runtime previous pid: ${runtimeState.previousPid}` : "",
    runtimeState.endpoint ? `Runtime endpoint: ${runtimeState.endpoint}` : "",
    runtimeState.stoppedAt ? `Runtime stopped: ${runtimeState.stoppedAt}` : "",
    runtimeState.reason ? `Runtime detail: ${runtimeState.reason}` : "",
  ].filter(Boolean);
}
