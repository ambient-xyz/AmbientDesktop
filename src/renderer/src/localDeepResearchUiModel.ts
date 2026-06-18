import type { LocalRuntimeInventorySnapshot } from "../../shared/localRuntimeTypes";

export type LocalDeepResearchSetupAction = "status" | "install" | "repair" | "validate" | "smoke";
export type LocalDeepResearchSetupStatus = "ready" | "needs-install" | "blocked";
export type LocalDeepResearchStatusTone = "success" | "warning" | "error" | "info";
export type LocalDeepResearchDiagnosticSeverity = "info" | "warning" | "error";
export type LocalDeepResearchQ8OverrideDecision = "not-requested" | "accepted" | "warned" | "rejected";

export interface LocalDeepResearchSetupActionModel {
  action: LocalDeepResearchSetupAction;
  label: string;
  title: string;
  primary?: boolean;
}

export interface LocalDeepResearchDiagnosticItem {
  code: string;
  severity: LocalDeepResearchDiagnosticSeverity;
  title: string;
  detail: string;
  nextAction: string;
}

export interface LocalDeepResearchProfileSummary {
  id: string;
  displayName: string;
  filename: string;
  quantization: string;
  role?: string;
  sourceUrl?: string;
  sizeBytes?: number;
  estimatedResidentMemoryBytes?: {
    safe8k?: number;
    target16k?: number;
  };
}

export interface LocalDeepResearchModelSelectionSummary {
  profile: LocalDeepResearchProfileSummary;
  fallbackProfile?: LocalDeepResearchProfileSummary;
  memoryTier: string;
  contextMode: string;
  contextTokens: number;
  q8OverrideDecision: LocalDeepResearchQ8OverrideDecision;
  warnings: string[];
  blockers: string[];
  rationale: string[];
}

export interface LocalDeepResearchModelInstallSummary {
  status: "installed" | "missing";
  selectedProfileId: string;
  filename: string;
  sourceUrl: string;
  sizeBytes: number;
  sha256: string;
  contextTokens: number;
}

export interface LocalDeepResearchRuntimeVerificationSummary {
  status?: string;
  selectedArtifactId?: string;
  blockers?: string[];
  checks?: Array<{
    status: string;
    detail: string;
  }>;
}

export interface LocalDeepResearchRuntimeSummary {
  status: "ready" | "needs-install" | "blocked";
  source: string;
  manifestId: string;
  selectedArtifactId?: string;
  verification?: LocalDeepResearchRuntimeVerificationSummary;
}

export interface LocalDeepResearchProviderSnapshotSummary {
  capturedAt: string;
  searchOrder: string[];
  fetchOrder: string[];
  skippedSearchProviders: Array<{ providerId: string; reason: string }>;
  skippedFetchProviders: Array<{ providerId: string; reason: string }>;
  fallbackPolicy: {
    allowBrowserFallback: boolean;
  };
}

export interface LocalDeepResearchManagedAssetsSummary {
  managedRoot: string;
  model: {
    status: "missing" | "present" | "mismatch";
    profileId: string;
    filename: string;
    cachePath?: string;
    expectedSizeBytes?: number;
    sizeBytes?: number;
    verification?: string;
    reason?: string;
  };
  runtime: {
    status: "missing" | "present" | "mismatch" | "unsupported";
    source: string;
    manifestId: string;
    artifactId?: string;
    binaryPath?: string;
    receiptPath?: string;
    verification?: string;
    reason?: string;
  };
  warnings: string[];
}

export interface LocalDeepResearchInstallResultSummary {
  status: "installed" | "already-installed" | "partial" | "failed" | "skipped";
  modelInstall?: {
    attempted: boolean;
    status: "installed" | "already-installed" | "failed" | "skipped";
    filename: string;
    cachePath: string;
    bytes?: number;
    sha256?: string;
    downloadStatus?: "downloaded" | "resumed" | "reused";
    error?: string;
  };
  runtimeInstall?: {
    status: string;
    artifactId?: string;
    binaryPath?: string;
    receiptPath?: string;
    error?: string;
  };
  nextActions: string[];
}

export interface LocalDeepResearchValidationResultSummary {
  status: "passed" | "needs-install" | "blocked" | "failed";
  checkedAt: string;
  artifactPath: string;
  memoryTelemetry?: {
    status: "recorded" | "blocked";
    capturedAt: string;
    physicalMemoryClass: string;
    memoryTier: string;
    memoryPressure: string;
    selectedProfileId: string;
    fallbackProfileId?: string;
    contextTokens: number;
    q8OverrideDecision: LocalDeepResearchQ8OverrideDecision;
    reservationStatus: string;
	    reservationReason: string;
	    activeLocalModelCount: number;
	    activeLocalModelEstimatedResidentMemoryBytes: number;
	    activeLocalModelActualResidentMemoryBytes?: number;
	    coverageMissingPhysicalMemoryClasses: string[];
	    artifactPath: string;
	    markdownPath: string;
	  };
  providerPreferenceSmoke?: {
    status: "passed" | "failed";
    checkedAt: string;
    checkCount: number;
    artifactPath: string;
    markdownPath: string;
  };
  checks: Array<{
    id: string;
    title: string;
    status: "passed" | "warning" | "failed" | "blocked";
    detail: string;
    nextAction?: string;
  }>;
}

export interface LocalDeepResearchSmokeResultSummary {
  status: "passed" | "needs-install" | "blocked" | "failed";
  checkedAt: string;
  artifactPath: string;
  markdownPath: string;
  checks: Array<{
    id: string;
    title: string;
    status: "passed" | "warning" | "failed" | "blocked";
    detail: string;
    nextAction?: string;
  }>;
  chat?: {
    prompt: string;
    response: string;
    durationMs: number;
    requestTimeoutMs: number;
  };
  error?: string;
}

export interface LocalDeepResearchInstallProgressSummary {
  action: "install" | "repair";
  component: "setup" | "model" | "runtime" | "validation";
  phase: string;
  status: "running" | "completed" | "failed";
  message: string;
  profileId?: string;
  filename?: string;
  artifactId?: string;
  bytesReceived?: number;
  totalBytes?: number;
  percent?: number;
  recordedAt: string;
}

export interface LocalDeepResearchInstallProgressModel {
  title: string;
  detail: string;
  percent?: number;
  tone: LocalDeepResearchStatusTone;
}

export interface LocalModelResourceRegistrySummary {
  capturedAt: string;
  activeCount: number;
  activeEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  policyDecision: {
    outcome: string;
    reason: string;
    requestedEstimatedResidentMemoryBytes?: number;
    activeEstimatedResidentMemoryBytes: number;
    projectedEstimatedResidentMemoryBytes: number;
    activeActualResidentMemoryBytes?: number;
    activeResidentMemoryBasis?: "actual-rss" | "estimated" | "mixed" | "none";
    projectedResidentMemoryBytes?: number;
    projectedSystemMemoryUtilization?: number;
    maxProjectedMemoryUtilization?: number;
    projectedFreeMemoryBytes?: number;
    projectedFreeMemoryRatio?: number;
    minFreeMemoryRatioAfterLaunch?: number;
    comfortableFreeMemoryRatio?: number;
    uncertaintyReasons?: string[];
    maxResidentMemoryBytes?: number;
    exceededByBytes?: number;
    unloadCandidateIds: string[];
  };
  entries: Array<{
    id: string;
    pid?: number;
    running: boolean;
    ownerThreadId?: string;
    port?: number;
    modelId?: string;
    profileId?: string;
    quantization?: string;
    contextTokens?: number;
    estimatedResidentMemoryBytes?: number;
    actualResidentMemoryBytes?: number;
    idleTimeMs?: number;
  }>;
}

export interface LocalDeepResearchSetupResult {
  action: LocalDeepResearchSetupAction;
  setupStatus: LocalDeepResearchSetupStatus;
  modelSelection: LocalDeepResearchModelSelectionSummary;
  modelInstall: LocalDeepResearchModelInstallSummary;
  llamaRuntime: LocalDeepResearchRuntimeSummary;
  localModelResources?: LocalModelResourceRegistrySummary;
  localRuntimeInventory?: LocalRuntimeInventorySnapshot;
  providerSnapshot: LocalDeepResearchProviderSnapshotSummary;
  managedAssets?: LocalDeepResearchManagedAssetsSummary;
  installResult?: LocalDeepResearchInstallResultSummary;
  validation?: LocalDeepResearchValidationResultSummary;
  smoke?: LocalDeepResearchSmokeResultSummary;
  warnings: string[];
  blockers: string[];
  nextActions: string[];
}

export interface LocalDeepResearchQ8OverrideModel {
  checked: boolean;
  label: string;
  title: string;
  tone: LocalDeepResearchStatusTone;
}

export interface LocalDeepResearchSetupResultModel {
  statusLabel: string;
  statusTone: LocalDeepResearchStatusTone;
  detailLabels: string[];
  diagnostics: LocalDeepResearchDiagnosticItem[];
  q8Override: LocalDeepResearchQ8OverrideModel;
}

export interface LocalDeepResearchRuntimeInventorySettingsRefreshInput {
  panel?: string;
  workspacePath?: string;
  setupStatus: "idle" | "running" | "success" | "error";
  hasRuntimeInventory: boolean;
  lastRefreshKey?: string;
}

export interface LocalDeepResearchRuntimeInventorySettingsRefreshDecision {
  shouldRefresh: boolean;
  refreshKey?: string;
}

export function localDeepResearchRuntimeInventorySettingsRefreshDecision(
  input: LocalDeepResearchRuntimeInventorySettingsRefreshInput,
): LocalDeepResearchRuntimeInventorySettingsRefreshDecision {
  if (
    input.panel !== "settings"
    || !input.workspacePath
    || input.hasRuntimeInventory
    || input.setupStatus === "idle"
    || input.setupStatus === "running"
  ) {
    return { shouldRefresh: false };
  }
  const refreshKey = `${input.workspacePath}:settings:${input.setupStatus}:missing-runtime-inventory`;
  return {
    shouldRefresh: input.lastRefreshKey !== refreshKey,
    refreshKey,
  };
}

export function localDeepResearchSetupActions(
  result?: LocalDeepResearchSetupResult,
): LocalDeepResearchSetupActionModel[] {
  if (!result) {
    return [
      {
        action: "status",
        label: "Check status",
        title: "Read the Local Deep Research setup contract without downloading model or runtime assets",
        primary: true,
      },
      {
        action: "install",
        label: "Install",
        title: "Install the selected LiteResearcher GGUF and shared llama.cpp runtime into Ambient-managed state",
      },
      {
        action: "validate",
        label: "Validate",
        title: "Validate Local Deep Research setup without downloading model or runtime assets",
      },
    ];
  }
  if (result.setupStatus === "ready") {
    return [
      {
        action: "validate",
        label: "Validate",
        title: "Validate Local Deep Research setup, model, runtime, and provider routing state",
        primary: true,
      },
      {
        action: "smoke",
        label: "Smoke test",
        title: "Launch the managed LiteResearcher GGUF through llama.cpp and record real local smoke evidence",
      },
      {
        action: "status",
        label: "Re-check",
        title: "Refresh Local Deep Research setup without writing validation evidence",
      },
      {
        action: "repair",
        label: "Repair",
        title: "Repair Ambient-managed Local Deep Research model and runtime assets",
      },
    ];
  }
  if (result.setupStatus === "needs-install") {
    return [
      {
        action: "install",
        label: "Install",
        title: "Install missing Local Deep Research model and llama.cpp runtime assets",
        primary: true,
      },
      {
        action: "status",
        label: "Re-check",
        title: "Refresh Local Deep Research setup before downloading assets",
      },
      {
        action: "validate",
        label: "Validate",
        title: "Write validation evidence for the current Local Deep Research setup state",
      },
      {
        action: "smoke",
        label: "Smoke test",
        title: "Attempt a real local llama.cpp smoke and record why setup is not ready",
      },
      {
        action: "repair",
        label: "Repair",
        title: "Force repair of Ambient-managed Local Deep Research model and runtime assets",
      },
    ];
  }
  return [
    {
      action: "status",
      label: "Re-check",
      title: "Refresh Local Deep Research setup after resolving blockers",
      primary: true,
    },
    {
      action: "validate",
      label: "Validate",
      title: "Write validation evidence for current Local Deep Research blockers",
    },
    {
      action: "smoke",
      label: "Smoke test",
      title: "Attempt a real local llama.cpp smoke and record why setup is blocked",
    },
    {
      action: "repair",
      label: "Repair",
      title: "Retry Ambient-managed Local Deep Research model and runtime installation after blockers are resolved",
    },
  ];
}

export function localDeepResearchSetupResultModel(
  result: LocalDeepResearchSetupResult,
): LocalDeepResearchSetupResultModel {
  const profile = result.modelSelection.profile;
  const fallback = result.modelSelection.fallbackProfile;
  const managed = result.managedAssets;
  const install = result.installResult;
  const validation = result.validation;
  const runtimeArtifact = result.llamaRuntime.selectedArtifactId ?? result.llamaRuntime.verification?.selectedArtifactId;
  const residentMemory = estimatedResidentMemoryForContext(profile, result.modelSelection.contextTokens);
  return {
    statusLabel: localDeepResearchStatusLabel(result.setupStatus),
    statusTone: localDeepResearchStatusTone(result.setupStatus),
    detailLabels: [
      `Model: ${profile.displayName} (${profile.quantization}), ${result.modelSelection.contextTokens.toLocaleString()} tokens`,
      fallback ? `Fallback model: ${fallback.displayName} (${fallback.quantization})` : "",
      residentMemory ? `Estimated resident memory: ${formatBytes(residentMemory)}` : "",
      `Machine tier: ${formatLabel(result.modelSelection.memoryTier)}; context mode: ${formatLabel(result.modelSelection.contextMode)}`,
      `Q8 override: ${q8OverrideDecisionLabel(result.modelSelection.q8OverrideDecision)}`,
      `Model install: ${formatLabel(result.modelInstall.status)} (${formatBytes(result.modelInstall.sizeBytes)})`,
      managed ? `Model cache: ${formatLabel(managed.model.status)}${managed.model.verification ? `, ${formatLabel(managed.model.verification)}` : ""}` : "",
      managed?.model.reason ? `Model cache detail: ${managed.model.reason}` : "",
      `Runtime: ${formatLabel(result.llamaRuntime.status)} via ${formatLabel(result.llamaRuntime.source)}`,
      runtimeArtifact ? `Runtime artifact: ${runtimeArtifact}` : "",
      managed ? `Runtime cache: ${formatLabel(managed.runtime.status)}${managed.runtime.verification ? `, ${formatLabel(managed.runtime.verification)}` : ""}` : "",
      managed?.runtime.reason ? `Runtime cache detail: ${managed.runtime.reason}` : "",
      `Search route: ${routeLabel(result.providerSnapshot.searchOrder)}`,
      `Fetch route: ${routeLabel(result.providerSnapshot.fetchOrder)}`,
      `Browser fallback: ${result.providerSnapshot.fallbackPolicy.allowBrowserFallback ? "allowed" : "blocked"}`,
      result.providerSnapshot.capturedAt ? `Provider snapshot: ${result.providerSnapshot.capturedAt}` : "",
      result.localModelResources ? `Local model residents: ${result.localModelResources.activeCount}; estimated ${formatBytes(result.localModelResources.activeEstimatedResidentMemoryBytes)}${result.localModelResources.activeActualResidentMemoryBytes !== undefined ? `; actual ${formatBytes(result.localModelResources.activeActualResidentMemoryBytes)}` : ""}` : "",
      result.localModelResources ? `Local model resource policy: ${formatLabel(result.localModelResources.policyDecision.outcome)} - ${result.localModelResources.policyDecision.reason}` : "",
      result.localRuntimeInventory ? localRuntimeInventoryStatusLabel(result.localRuntimeInventory) : "",
      result.localRuntimeInventory ? localRuntimeInventoryStopLabel(result.localRuntimeInventory) : "",
      install ? `Install result: ${formatLabel(install.status)}` : "",
      install?.modelInstall ? `Model download: ${formatLabel(install.modelInstall.status)}${install.modelInstall.downloadStatus ? `, ${formatLabel(install.modelInstall.downloadStatus)}` : ""}` : "",
      install?.runtimeInstall ? `Runtime install: ${formatLabel(install.runtimeInstall.status)}` : "",
      validation ? `Validation: ${formatLabel(validation.status)} at ${validation.checkedAt}` : "",
      validation ? `Validation artifact: ${validation.artifactPath}` : "",
      validation?.memoryTelemetry ? `Memory telemetry: ${formatLabel(validation.memoryTelemetry.status)} for ${validation.memoryTelemetry.physicalMemoryClass} at ${validation.memoryTelemetry.capturedAt}` : "",
      validation?.memoryTelemetry ? `Memory telemetry report: ${validation.memoryTelemetry.markdownPath}` : "",
      validation?.memoryTelemetry ? `Memory reservation: ${formatLabel(validation.memoryTelemetry.reservationStatus)} - ${validation.memoryTelemetry.reservationReason}` : "",
      validation?.memoryTelemetry?.coverageMissingPhysicalMemoryClasses.length
        ? `Memory telemetry still missing: ${validation.memoryTelemetry.coverageMissingPhysicalMemoryClasses.join(", ")}`
        : "",
      validation?.providerPreferenceSmoke ? `Provider preference smoke: ${formatLabel(validation.providerPreferenceSmoke.status)} at ${validation.providerPreferenceSmoke.checkedAt}` : "",
      validation?.providerPreferenceSmoke ? `Provider preference report: ${validation.providerPreferenceSmoke.markdownPath}` : "",
      ...(validation?.checks.map((check) => `Validation ${check.title}: ${formatLabel(check.status)} - ${check.detail}`) ?? []),
      result.smoke ? `Smoke: ${formatLabel(result.smoke.status)} at ${result.smoke.checkedAt}` : "",
      result.smoke ? `Smoke artifact: ${result.smoke.artifactPath}` : "",
      result.smoke?.markdownPath ? `Smoke report: ${result.smoke.markdownPath}` : "",
      result.smoke?.chat ? `Smoke response: ${previewText(result.smoke.chat.response)}` : "",
      result.smoke?.error ? `Smoke error: ${result.smoke.error}` : "",
      ...(result.smoke?.checks.map((check) => `Smoke ${check.title}: ${formatLabel(check.status)} - ${check.detail}`) ?? []),
      ...result.modelSelection.rationale.map((item) => `Selection: ${item}`),
      ...result.warnings.map((item) => `Warning: ${item}`),
      ...result.blockers.map((item) => `Blocker: ${item}`),
      ...result.nextActions.map((item) => `Next: ${item}`),
    ].filter(Boolean),
    diagnostics: localDeepResearchDiagnostics(result),
    q8Override: localDeepResearchQ8OverrideModel(result),
  };
}

export function localDeepResearchQ8OverrideModel(
  result?: LocalDeepResearchSetupResult,
): LocalDeepResearchQ8OverrideModel {
  if (!result) {
    return {
      checked: false,
      label: "Automatic Q4/Q8 selection",
      title: "Ambient chooses Q8 on high-memory hosts and Q4 elsewhere until setup is checked.",
      tone: "info",
    };
  }
  const decision = result.modelSelection.q8OverrideDecision;
  const quantization = result.modelSelection.profile.quantization;
  if (decision === "accepted" || decision === "warned") {
    return {
      checked: quantization === "Q8_0",
      label: decision === "accepted" ? "Q8 override accepted" : "Q8 override allowed with warning",
      title: decision === "accepted"
        ? "The host qualifies for the Q8 override. Q4 remains the fallback under pressure."
        : "The host may run Q8, but launch preflight can still fall back to Q4.",
      tone: decision === "accepted" ? "success" : "warning",
    };
  }
  if (decision === "rejected") {
    return {
      checked: false,
      label: "Q8 override rejected",
      title: "Deterministic memory policy rejected Q8 for this host state; Q4 remains selected.",
      tone: "error",
    };
  }
  if (quantization === "Q8_0") {
    return {
      checked: false,
      label: "Q8 auto-selected",
      title: "The host qualifies for the high-quality Q8 profile without an override.",
      tone: "success",
    };
  }
  return {
    checked: false,
    label: result.modelSelection.fallbackProfile?.quantization === "Q8_0"
      ? "Q8 available as override"
      : "Q4 selected by policy",
    title: "Use Q8 only through the advanced override after setup preflight confirms enough headroom.",
    tone: "info",
  };
}

export function localDeepResearchInstallProgressModel(
  progress: LocalDeepResearchInstallProgressSummary,
): LocalDeepResearchInstallProgressModel {
  const percent = typeof progress.percent === "number"
    ? Math.max(0, Math.min(100, progress.percent))
    : progress.bytesReceived !== undefined && progress.totalBytes
      ? Math.max(0, Math.min(100, Math.round((progress.bytesReceived / progress.totalBytes) * 100)))
      : undefined;
  const detailParts = [
    formatLabel(progress.component),
    progress.filename,
    progress.artifactId,
    progress.bytesReceived !== undefined && progress.totalBytes !== undefined
      ? `${formatBytes(progress.bytesReceived)} of ${formatBytes(progress.totalBytes)}`
      : progress.totalBytes !== undefined
        ? formatBytes(progress.totalBytes)
        : "",
    percent !== undefined ? `${Math.round(percent)}%` : "",
  ].filter(Boolean);
  return {
    title: progress.message,
    detail: detailParts.join(" · "),
    ...(percent !== undefined ? { percent } : {}),
    tone: progress.status === "failed" ? "error" : progress.status === "completed" ? "success" : "info",
  };
}

function localDeepResearchStatusLabel(status: LocalDeepResearchSetupStatus): string {
  if (status === "ready") return "Local Deep Research ready";
  if (status === "needs-install") return "Local Deep Research needs install";
  return "Local Deep Research blocked";
}

function localDeepResearchStatusTone(status: LocalDeepResearchSetupStatus): LocalDeepResearchStatusTone {
  if (status === "ready") return "success";
  if (status === "needs-install") return "warning";
  return "error";
}

function localRuntimeInventoryStatusLabel(inventory: LocalRuntimeInventorySnapshot): string {
  const runningCount = inventory.entries.filter((entry) => entry.running).length;
  return `Local runtime inventory: ${inventory.entries.length} runtime${inventory.entries.length === 1 ? "" : "s"}; ${runningCount} running; ${inventory.activeLeases.length} active lease${inventory.activeLeases.length === 1 ? "" : "s"}`;
}

function localRuntimeInventoryStopLabel(inventory: LocalRuntimeInventorySnapshot): string {
  const blockedEntries = inventory.entries.filter((entry) => !entry.lifecycleDecision.stop.allowed);
  if (!inventory.entries.length) return "Local runtime stop policy: no resident runtime rows";
  if (!blockedEntries.length) return "Local runtime stop policy: ordinary Stop allowed for managed rows";
  const reasons = blockedEntries.map((entry) => entry.lifecycleDecision.stop.reason).filter(Boolean);
  return `Local runtime stop policy: ${reasons.join("; ")}`;
}

function localDeepResearchDiagnostics(result: LocalDeepResearchSetupResult): LocalDeepResearchDiagnosticItem[] {
  const diagnostics: LocalDeepResearchDiagnosticItem[] = [];
  for (const blocker of result.blockers) {
    diagnostics.push({
      code: "setup-blocked",
      severity: "error",
      title: "Setup blocker",
      detail: blocker,
      nextAction: "Resolve the blocker, then re-check Local Deep Research setup.",
    });
  }
  for (const warning of [...result.warnings, ...(result.managedAssets?.warnings ?? [])]) {
    diagnostics.push({
      code: "setup-warning",
      severity: "warning",
      title: "Setup warning",
      detail: warning,
      nextAction: "Review the warning before starting a long research run.",
    });
  }
  if (result.modelInstall.status !== "installed") {
    diagnostics.push({
      code: "model-missing",
      severity: "warning",
      title: "LiteResearcher model missing",
      detail: `${result.modelInstall.filename} is not installed in Ambient-managed state.`,
      nextAction: "Install Local Deep Research from Settings.",
    });
  }
  if (result.llamaRuntime.status !== "ready") {
    diagnostics.push({
      code: result.llamaRuntime.status === "blocked" ? "runtime-blocked" : "runtime-missing",
      severity: result.llamaRuntime.status === "blocked" ? "error" : "warning",
      title: result.llamaRuntime.status === "blocked" ? "llama.cpp runtime blocked" : "llama.cpp runtime missing",
      detail: `Runtime state is ${formatLabel(result.llamaRuntime.status)} via ${formatLabel(result.llamaRuntime.source)}.`,
      nextAction: result.llamaRuntime.status === "blocked"
        ? "Resolve runtime manifest or platform support blockers."
        : "Install or repair the shared Ambient-managed llama.cpp runtime.",
    });
  }
  for (const entry of result.localRuntimeInventory?.entries ?? []) {
    if (entry.lifecycleDecision.stop.allowed) continue;
    diagnostics.push({
      code: entry.lifecycleDecision.stop.untracked ? "local-runtime-untracked" : "local-runtime-stop-blocked",
      severity: entry.lifecycleDecision.stop.untracked ? "warning" : "error",
      title: entry.lifecycleDecision.stop.untracked ? "Untracked local runtime" : "Local runtime Stop blocked",
      detail: `${entry.id}: ${entry.lifecycleDecision.stop.reason}`,
      nextAction: entry.lifecycleDecision.stop.forceRequiresSubagentCancellation
        ? "Inspect or cancel the owning sub-agent before forcing runtime termination."
        : "Use runtime diagnostics before trying to stop this process.",
    });
  }
  for (const provider of result.providerSnapshot.skippedSearchProviders) {
    diagnostics.push({
      code: "search-provider-skipped",
      severity: "warning",
      title: "Search provider skipped",
      detail: `${provider.providerId}: ${provider.reason}`,
      nextAction: "Update Search & Web provider preferences if this provider should be used.",
    });
  }
  for (const provider of result.providerSnapshot.skippedFetchProviders) {
    diagnostics.push({
      code: "fetch-provider-skipped",
      severity: "warning",
      title: "Fetch provider skipped",
      detail: `${provider.providerId}: ${provider.reason}`,
      nextAction: "Update Search & Web provider preferences if this provider should be used.",
    });
  }
  if (result.installResult?.modelInstall?.status === "failed") {
    diagnostics.push({
      code: "model-install-failed",
      severity: "error",
      title: "Model install failed",
      detail: result.installResult.modelInstall.error ?? "The LiteResearcher model download did not complete.",
      nextAction: "Retry install after checking network access and available disk space.",
    });
  }
  if (result.installResult?.runtimeInstall?.status === "failed") {
    diagnostics.push({
      code: "runtime-install-failed",
      severity: "error",
      title: "Runtime install failed",
      detail: result.installResult.runtimeInstall.error ?? "The shared llama.cpp runtime install did not complete.",
      nextAction: "Retry repair after checking the managed runtime download path.",
    });
  }
  for (const check of result.validation?.checks ?? []) {
    if (check.status === "passed") continue;
    diagnostics.push({
      code: `validation-${check.id}`,
      severity: check.status === "blocked" || check.status === "failed" ? "error" : "warning",
      title: check.title,
      detail: check.detail,
      nextAction: check.nextAction ?? "Review Local Deep Research validation details.",
    });
  }
  if (result.validation?.memoryTelemetry?.status === "blocked") {
    diagnostics.push({
      code: "memory-telemetry-blocked",
      severity: "error",
      title: "Memory telemetry blocked",
      detail: result.validation.memoryTelemetry.reservationReason,
      nextAction: "Open the memory telemetry report, free local model memory, or disable Q8 override before retrying.",
    });
  }
  if (result.validation?.providerPreferenceSmoke?.status === "failed") {
    diagnostics.push({
      code: "provider-preference-smoke-failed",
      severity: "error",
      title: "Provider preference smoke failed",
      detail: `${result.validation.providerPreferenceSmoke.checkCount} provider preference checks were recorded.`,
      nextAction: "Open the provider preference smoke report and inspect Search & Web routing settings.",
    });
  }
  for (const check of result.smoke?.checks ?? []) {
    if (check.status === "passed") continue;
    diagnostics.push({
      code: `smoke-${check.id}`,
      severity: check.status === "blocked" || check.status === "failed" ? "error" : "warning",
      title: check.title,
      detail: check.detail,
      nextAction: check.nextAction ?? "Review Local Deep Research smoke evidence.",
    });
  }
  if (result.smoke?.error) {
    diagnostics.push({
      code: "smoke-failed",
      severity: "error",
      title: "Real-asset smoke failed",
      detail: result.smoke.error,
      nextAction: "Open the smoke artifact and llama-server logs, then retry Local Deep Research repair.",
    });
  }
  return diagnostics;
}

function q8OverrideDecisionLabel(decision: LocalDeepResearchQ8OverrideDecision): string {
  if (decision === "accepted") return "accepted";
  if (decision === "warned") return "allowed with warning";
  if (decision === "rejected") return "rejected";
  return "not requested";
}

function routeLabel(providers: string[]): string {
  return providers.length ? providers.join(" -> ") : "none";
}

function formatLabel(value: string): string {
  return value.replace(/[-_]+/g, " ");
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "unknown size";
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
  const mib = bytes / 1024 ** 2;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`;
}

function estimatedResidentMemoryForContext(
  profile: LocalDeepResearchProfileSummary,
  contextTokens: number,
): number | undefined {
  const safe8k = profile.estimatedResidentMemoryBytes?.safe8k;
  const target16k = profile.estimatedResidentMemoryBytes?.target16k;
  if (safe8k === undefined || target16k === undefined) return undefined;
  const growthBytesPer8k = Math.max(0, target16k - safe8k);
  const extraSteps = Math.max(0, Math.ceil((Math.max(8192, contextTokens) - 8192) / 8192));
  return safe8k + extraSteps * growthBytesPer8k;
}

function previewText(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 160 ? `${collapsed.slice(0, 157)}...` : collapsed;
}
