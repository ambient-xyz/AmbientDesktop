import type {
  LocalDeepResearchInstallerShape,
  LocalDeepResearchProviderConfig,
  LocalDeepResearchSettings,
  LocalModelResourceRegistrySnapshot,
  LocalRuntimeInventoryEntry,
  LocalRuntimeInventorySnapshot,
  SearchRoutingSettings,
  WebResearchFallbackPolicy,
  WebResearchProviderConfig,
} from "../../shared/types";
import { normalizeLocalModelResourceSettings } from "./localDeepResearchProviderStack";
import type { MiniCpmVisionRuntimeReleaseManifest, MiniCpmVisionRuntimeReleaseManifestVerification } from "../../shared/types";
import { miniCpmRuntimeReleaseManifestPrototype, verifyMiniCpmRuntimeReleaseManifest } from "../mini-cpm/miniCpmRuntimeManifest";
import {
  detectLocalDeepResearchMachineFacts,
  localDeepResearchEstimatedResidentMemoryBytes,
  selectLocalDeepResearchModelProfile,
  type LocalDeepResearchMachineFacts,
  type LocalDeepResearchModelSelection,
} from "./localDeepResearchModelProfiles";
import {
  normalizeSearchRoutingSettingsWithWebResearch,
  planWebResearchProviderOrder,
  type WebResearchProviderRequestPlan,
} from "../web-research/webResearchProviderStack";
import { buildLocalDeepResearchProviderStackStatus } from "./localDeepResearchProviderStack";
import { buildLocalRuntimeInventory } from "../local-runtime/localRuntimeInventory";

export type LocalDeepResearchInstallState = "installed" | "missing";
export type LocalDeepResearchSetupStatus = "ready" | "needs-install" | "blocked";

export interface LocalDeepResearchProviderSnapshot {
  schemaVersion: "ambient-local-deep-research-provider-snapshot-v1";
  capturedAt: string;
  activeProvider?: LocalDeepResearchProviderConfig;
  providerOrder: string[];
  skippedProviders: Array<{
    providerId: string;
    reason: string;
  }>;
  providers: WebResearchProviderConfig[];
  searchOrder: string[];
  fetchOrder: string[];
  skippedSearchProviders: WebResearchProviderRequestPlan["skippedProviders"];
  skippedFetchProviders: WebResearchProviderRequestPlan["skippedProviders"];
  fallbackPolicy: WebResearchFallbackPolicy;
}

export interface LocalDeepResearchSetupContract {
  schemaVersion: "ambient-local-deep-research-setup-contract-v1";
  capabilityId: "local.deep-research.literesearcher";
  status: LocalDeepResearchSetupStatus;
  modelSelection: LocalDeepResearchModelSelection;
    modelInstall: {
      status: LocalDeepResearchInstallState;
      selectedProfileId: string;
    filename: string;
    sourceUrl: string;
      sizeBytes: number;
      sha256: string;
      contextTokens: number;
  };
  runtime: {
    status: "ready" | "needs-install" | "blocked";
    source: "shared-llama-cpp-runtime";
    manifestId: string;
    selectedArtifactId?: string;
    verification: MiniCpmVisionRuntimeReleaseManifestVerification;
  };
  installerShape: LocalDeepResearchInstallerShape;
  localModelResources: LocalModelResourceRegistrySnapshot;
  localRuntimeInventory: LocalRuntimeInventorySnapshot;
  providerSnapshot: LocalDeepResearchProviderSnapshot;
  warnings: string[];
  blockers: string[];
  nextActions: string[];
}

export interface LocalDeepResearchSetupInput {
  localDeepResearchSettings?: LocalDeepResearchSettings;
  searchSettings?: SearchRoutingSettings;
  machineFacts?: Partial<LocalDeepResearchMachineFacts>;
  q8Override?: boolean;
  modelInstallState?: LocalDeepResearchInstallState;
  runtimeInstalled?: boolean;
  runtimeArtifactId?: string;
  runtimeBinaryPath?: string;
  runtimeManifest?: MiniCpmVisionRuntimeReleaseManifest;
  localModelResources?: LocalModelResourceRegistrySnapshot;
  localRuntimeInventory?: LocalRuntimeInventorySnapshot;
  assetWarnings?: string[];
  now?: () => Date;
}

export function buildLocalDeepResearchSetupContract(input: LocalDeepResearchSetupInput = {}): LocalDeepResearchSetupContract {
  const now = input.now ?? (() => new Date());
  const machineFacts = detectLocalDeepResearchMachineFacts(input.machineFacts);
  const modelSelection = selectLocalDeepResearchModelProfile({
    machineFacts,
    q8Override: input.q8Override,
  });
  const modelInstallState = input.modelInstallState ?? "missing";
  const runtimeVerification = verifyMiniCpmRuntimeReleaseManifest({
    manifest: input.runtimeManifest ?? miniCpmRuntimeReleaseManifestPrototype,
    platform: machineFacts.platform,
    arch: machineFacts.arch,
    artifactId: input.runtimeArtifactId,
    binaryPath: input.runtimeBinaryPath,
  });
  const runtimeStatus = runtimeContractStatus(runtimeVerification, Boolean(input.runtimeInstalled));
  const providerSnapshot = buildLocalDeepResearchProviderSnapshot({
    localDeepResearchSettings: input.localDeepResearchSettings,
    settings: input.searchSettings,
    capturedAt: now().toISOString(),
  });
  const localModelResources = input.localModelResources ?? fallbackLocalModelResourceRegistry({
    capturedAt: now().toISOString(),
    settings: input.localDeepResearchSettings?.localModelResources,
    machineFacts,
    selectedEstimatedResidentMemoryBytes: localDeepResearchEstimatedResidentMemoryBytes(modelSelection.profile, modelSelection.contextTokens),
  });
  const localRuntimeInventory = input.localRuntimeInventory ?? buildLocalRuntimeInventory({
    registry: localModelResources,
    capturedAt: localModelResources.capturedAt,
  });
  const runtimeResidentWarnings = localRuntimeResidentWarnings(localRuntimeInventory);
  const blockers = [
    ...modelSelection.blockers,
    ...resourceBlockers(localModelResources),
    ...runtimeBlockers(runtimeStatus, runtimeVerification),
    ...providerBlockers(providerSnapshot),
  ];
  const warnings = [
    ...modelSelection.warnings,
    ...runtimeResidentWarnings,
    ...resourceWarnings(localModelResources),
    ...runtimeWarnings(runtimeStatus, runtimeVerification),
    ...providerWarnings(providerSnapshot),
    ...(input.assetWarnings ?? []),
  ];
  const nextActions = nextSetupActions({
    modelInstallState,
    runtimeStatus,
    providerSnapshot,
    localModelResources,
    blockers,
  });
  const status: LocalDeepResearchSetupStatus = blockers.length
    ? "blocked"
    : modelInstallState === "installed" && runtimeStatus === "ready"
      ? "ready"
      : "needs-install";
  const installerShape = buildLocalDeepResearchInstallerShape({
    modelSelection,
    machineFacts,
    modelInstallState,
    runtimeStatus,
    runtimeVerification,
  });

  return {
    schemaVersion: "ambient-local-deep-research-setup-contract-v1",
    capabilityId: "local.deep-research.literesearcher",
    status,
    modelSelection,
    modelInstall: {
      status: modelInstallState,
      selectedProfileId: modelSelection.profile.id,
      filename: modelSelection.profile.filename,
      sourceUrl: modelSelection.profile.sourceUrl,
      sizeBytes: modelSelection.profile.sizeBytes,
      sha256: modelSelection.profile.sha256,
      contextTokens: modelSelection.contextTokens,
    },
    runtime: {
      status: runtimeStatus,
      source: "shared-llama-cpp-runtime",
      manifestId: runtimeVerification.manifestId,
      ...(runtimeVerification.selectedArtifactId ? { selectedArtifactId: runtimeVerification.selectedArtifactId } : {}),
      verification: runtimeVerification,
    },
    installerShape,
    localModelResources,
    localRuntimeInventory,
    providerSnapshot,
    warnings: dedupe(warnings),
    blockers: dedupe(blockers),
    nextActions: dedupe(nextActions),
  };
}

export function buildLocalDeepResearchProviderSnapshot(input: {
  localDeepResearchSettings?: LocalDeepResearchSettings;
  settings?: SearchRoutingSettings;
  capturedAt: string;
}): LocalDeepResearchProviderSnapshot {
  const normalized = normalizeSearchRoutingSettingsWithWebResearch(input.settings).webResearch;
  const localProviderStatus = buildLocalDeepResearchProviderStackStatus({ settings: input.localDeepResearchSettings });
  const searchPlan = planWebResearchProviderOrder({ settings: input.settings, role: "search" });
  const fetchPlan = planWebResearchProviderOrder({ settings: input.settings, role: "fetch" });
  return {
    schemaVersion: "ambient-local-deep-research-provider-snapshot-v1",
    capturedAt: input.capturedAt,
    ...(localProviderStatus.activeProvider ? { activeProvider: localProviderStatus.activeProvider } : {}),
    providerOrder: localProviderStatus.providerOrder,
    skippedProviders: localProviderStatus.skippedProviders,
    providers: normalized.providers,
    searchOrder: searchPlan.providerOrder,
    fetchOrder: fetchPlan.providerOrder,
    skippedSearchProviders: searchPlan.skippedProviders,
    skippedFetchProviders: fetchPlan.skippedProviders,
    fallbackPolicy: normalized.fallbackPolicy,
  };
}

export function localDeepResearchSetupContractText(contract: LocalDeepResearchSetupContract): string {
  const model = contract.modelSelection.profile;
  const fallback = contract.modelSelection.fallbackProfile
    ? `; fallback ${contract.modelSelection.fallbackProfile.displayName}`
    : "";
  const searchRoute = contract.providerSnapshot.searchOrder.length
    ? contract.providerSnapshot.searchOrder.join(" -> ")
    : "none";
  const fetchRoute = contract.providerSnapshot.fetchOrder.length
    ? contract.providerSnapshot.fetchOrder.join(" -> ")
    : "none";
  const activeProvider = contract.providerSnapshot.activeProvider
    ? `${contract.providerSnapshot.activeProvider.label} (${contract.providerSnapshot.activeProvider.providerId})`
    : "none";

  return [
    `Local Deep Research setup status: ${contract.status}.`,
    `Research provider: ${activeProvider}.`,
    `Model: ${model.displayName} (${model.quantization}), ${contract.modelSelection.contextTokens} context tokens, install ${contract.modelInstall.status}${fallback}.`,
    `Runtime: ${contract.runtime.status} via ${contract.runtime.source}${contract.runtime.selectedArtifactId ? ` (${contract.runtime.selectedArtifactId})` : ""}.`,
    `Installer shape: ${contract.installerShape.installerKind}; expected disk ${formatBytes(contract.installerShape.disk.expectedDiskBytes)}, resident memory ${formatBytes(contract.installerShape.memory.estimatedResidentMemoryBytes)}, server ${contract.installerShape.server.host}:${contract.installerShape.server.port}.`,
    `Local model resources: ${contract.localModelResources.activeCount} active; estimated ${formatBytes(contract.localModelResources.activeEstimatedResidentMemoryBytes)}${contract.localModelResources.activeActualResidentMemoryBytes !== undefined ? `; actual ${formatBytes(contract.localModelResources.activeActualResidentMemoryBytes)}` : ""}; policy ${contract.localModelResources.policyDecision.outcome}.`,
    `Local runtime inventory: ${contract.localRuntimeInventory.entries.length} runtime${contract.localRuntimeInventory.entries.length === 1 ? "" : "s"}; ${contract.localRuntimeInventory.activeLeases.length} active lease${contract.localRuntimeInventory.activeLeases.length === 1 ? "" : "s"}; ${localRuntimeInventoryStopSummary(contract.localRuntimeInventory)}.`,
    localModelMemoryPolicyText(contract.localModelResources),
    `Confirmation required for: ${contract.installerShape.confirmation.requiredForActions.join(", ")}.`,
    `Lifecycle: progress event ${contract.installerShape.lifecycle.progressEvent}; cancellation ${contract.installerShape.lifecycle.cancellation.mechanism}; logs ${contract.installerShape.lifecycle.logs.installJobRoot}.`,
    `Search route: ${searchRoute}.`,
    `Fetch route: ${fetchRoute}.`,
    `Browser fallback: ${contract.providerSnapshot.fallbackPolicy.allowBrowserFallback ? "allowed" : "blocked"}.`,
    "",
    ...sectionLines("Blockers", contract.blockers),
    ...sectionLines("Warnings", contract.warnings),
    ...sectionLines("Next actions", contract.nextActions),
    "",
    "Provider preferences are captured at call time. If Search & Web provider settings change, call this again before the next research run.",
  ].join("\n");
}

function buildLocalDeepResearchInstallerShape(input: {
  modelSelection: LocalDeepResearchModelSelection;
  machineFacts: LocalDeepResearchMachineFacts;
  modelInstallState: LocalDeepResearchInstallState;
  runtimeStatus: LocalDeepResearchSetupContract["runtime"]["status"];
  runtimeVerification: MiniCpmVisionRuntimeReleaseManifestVerification;
}): LocalDeepResearchInstallerShape {
  const profile = input.modelSelection.profile;
  const runtimeArtifact = input.runtimeVerification.artifacts.find((artifact) => artifact.id === input.runtimeVerification.selectedArtifactId);
  const runtimeDownloadBytes = runtimeArtifact?.archiveSizeBytes;
  const estimatedResidentMemoryBytes = localDeepResearchEstimatedResidentMemoryBytes(profile, input.modelSelection.contextTokens);
  const memoryFit: LocalDeepResearchInstallerShape["memory"]["fit"] = input.modelSelection.blockers.length
    ? "blocked"
    : input.modelSelection.warnings.length
      ? "warning"
      : "selected";
  const expectedDiskBytes = profile.sizeBytes + (runtimeDownloadBytes ?? 0);
  return {
    schemaVersion: "ambient-local-model-installer-shape-v1",
    installerKind: "local-model",
    capabilityId: "local.deep-research.literesearcher",
    modelFamily: "LiteResearcher-4B",
    modelProfileId: profile.id,
    modelDisplayName: profile.displayName,
    quantization: profile.quantization,
    runtime: {
      source: "shared-llama-cpp-runtime",
      manifestId: input.runtimeVerification.manifestId,
      status: input.runtimeStatus,
      ...(input.runtimeVerification.selectedArtifactId ? { selectedArtifactId: input.runtimeVerification.selectedArtifactId } : {}),
      ...(runtimeDownloadBytes !== undefined ? { downloadBytes: runtimeDownloadBytes } : {}),
    },
    disk: {
      managedRootKind: "workspace-managed-state",
      modelDownloadBytes: profile.sizeBytes,
      ...(runtimeDownloadBytes !== undefined ? { runtimeDownloadBytes } : {}),
      expectedDiskBytes,
      cacheRoots: [
        ".ambient/local-deep-research/models",
        ".ambient/vision/minicpm-v/runtime",
      ],
    },
    memory: {
      memoryTier: input.modelSelection.memoryTier,
      contextMode: input.modelSelection.contextMode,
      contextTokens: input.modelSelection.contextTokens,
      estimatedResidentMemoryBytes,
      activeLocalModelCount: input.machineFacts.activeLocalModelCount,
      activeLocalModelEstimatedResidentMemoryBytes: input.machineFacts.activeLocalModelEstimatedResidentMemoryBytes,
      fit: memoryFit,
      warnings: input.modelSelection.warnings,
      blockers: input.modelSelection.blockers,
    },
    server: {
      host: "127.0.0.1",
      port: "auto",
      portAllocation: "loopback-auto-on-launch",
      lifecycle: "lease-managed",
      idleTimeoutMs: 5 * 60_000,
      startsOnActions: ["smoke", "run"],
    },
    confirmation: {
      required: true,
      requiredForActions: ["install", "repair", "smoke"],
      reasons: [
        input.modelInstallState === "installed"
          ? `Selected model is already present; repair may still verify or replace ${profile.filename}.`
          : `Download ${formatBytes(profile.sizeBytes)} for ${profile.filename}.`,
        input.runtimeStatus === "ready"
          ? "Shared llama.cpp runtime is already present."
          : `Install shared llama.cpp runtime${runtimeDownloadBytes !== undefined ? ` (${formatBytes(runtimeDownloadBytes)})` : ""}.`,
        `Reserve approximately ${formatBytes(estimatedResidentMemoryBytes)} resident memory before local llama-server runs.`,
        "Smoke and research runs start a lease-managed llama-server on an auto-selected 127.0.0.1 port.",
      ],
    },
    lifecycle: {
      progressEvent: "local-deep-research-install-progress",
      progressPhases: [
        "preflight",
        "model-cache-check",
        "model-download-started",
        "model-download-progress",
        "model-download-verified",
        "model-installed",
        "model-reused",
        "runtime-install-started",
        "runtime-install-completed",
        "validation-ready",
        "failed",
      ],
      cancellation: {
        supported: true,
        mechanism: "tool-abort-signal",
        resumableDownloads: true,
      },
      logs: {
        installJobRoot: ".ambient/local-deep-research/install-jobs",
        serverStateRoot: ".ambient/local-deep-research/llama-server",
      },
      cleanup: {
        managedModelRoot: ".ambient/local-deep-research/models",
        managedRuntimeRoot: ".ambient/vision/minicpm-v/runtime",
        action: "settings-managed-cleanup",
      },
      smokeTest: {
        setupAction: "smoke",
        queryKind: "tiny-local-chat",
      },
    },
  };
}

function runtimeContractStatus(
  verification: MiniCpmVisionRuntimeReleaseManifestVerification,
  runtimeInstalled: boolean,
): LocalDeepResearchSetupContract["runtime"]["status"] {
  if (verification.status === "blocked" || verification.status === "failed") return "blocked";
  return runtimeInstalled ? "ready" : "needs-install";
}

function runtimeBlockers(
  status: LocalDeepResearchSetupContract["runtime"]["status"],
  verification: MiniCpmVisionRuntimeReleaseManifestVerification,
): string[] {
  if (status !== "blocked") return [];
  const blockers = verification.blockers.length ? verification.blockers : [];
  const checkBlockers = verification.checks
    .filter((check) => check.status === "blocked" || check.status === "failed")
    .map((check) => check.detail);
  return [...blockers, ...checkBlockers];
}

function runtimeWarnings(
  status: LocalDeepResearchSetupContract["runtime"]["status"],
  verification: MiniCpmVisionRuntimeReleaseManifestVerification,
): string[] {
  if (status === "ready") return [];
  const notRun = verification.checks
    .filter((check) => check.status === "not-run")
    .map((check) => check.detail);
  if (status === "needs-install") {
    return [
      "Local Deep Research needs a managed llama.cpp runtime before research runs can start.",
      ...notRun,
    ];
  }
  return [];
}

function providerBlockers(snapshot: LocalDeepResearchProviderSnapshot): string[] {
  const blockers: string[] = [];
  if (!snapshot.activeProvider) blockers.push("Local Deep Research needs at least one enabled Local Deep Research provider.");
  if (!snapshot.searchOrder.length) blockers.push("Local Deep Research needs at least one enabled search provider in the Ambient web research stack.");
  if (!snapshot.fetchOrder.length) blockers.push("Local Deep Research needs at least one enabled fetch/scrape provider in the Ambient web research stack.");
  return blockers;
}

function providerWarnings(snapshot: LocalDeepResearchProviderSnapshot): string[] {
  return [
    ...snapshot.skippedProviders.map((provider) => `Local Deep Research provider ${provider.providerId} skipped: ${provider.reason}`),
    ...snapshot.skippedSearchProviders.map((provider) => `Search provider ${provider.providerId} skipped: ${provider.reason}`),
    ...snapshot.skippedFetchProviders.map((provider) => `Fetch provider ${provider.providerId} skipped: ${provider.reason}`),
  ];
}

function nextSetupActions(input: {
  modelInstallState: LocalDeepResearchInstallState;
  runtimeStatus: LocalDeepResearchSetupContract["runtime"]["status"];
  providerSnapshot: LocalDeepResearchProviderSnapshot;
  localModelResources: LocalModelResourceRegistrySnapshot;
  blockers: string[];
}): string[] {
  const actions: string[] = [];
  if (input.modelInstallState !== "installed") actions.push("Install the selected LiteResearcher GGUF profile into the Ambient Local Deep Research model cache.");
  if (input.runtimeStatus === "needs-install") actions.push("Install or validate the shared Ambient-managed llama.cpp runtime.");
  if (input.localModelResources.policyDecision.outcome === "refuse") actions.push("Relax the local-model memory policy, lower active resident memory, or change the policy behavior before starting a local model.");
  if (input.localModelResources.policyDecision.outcome === "unload-idle") actions.push("Unload idle local models or change the local-model memory policy behavior before starting another model.");
  if (input.localModelResources.policyDecision.outcome === "ask-to-exceed") actions.push("Ask the user before exceeding the configured local-model memory policy.");
  if (!input.providerSnapshot.activeProvider) actions.push("Enable or configure at least one Ambient Local Deep Research provider.");
  if (!input.providerSnapshot.searchOrder.length) actions.push("Enable or configure at least one Ambient web research search provider.");
  if (!input.providerSnapshot.fetchOrder.length) actions.push("Enable or configure at least one Ambient web research fetch/scrape provider.");
  if (input.blockers.length) actions.push("Resolve setup blockers before starting a research run.");
  if (!actions.length) actions.push("Run Local Deep Research validation with a bounded mixed multi-source synthesis task.");
  return actions;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function fallbackLocalModelResourceRegistry(input: {
  capturedAt: string;
  settings?: LocalDeepResearchSettings["localModelResources"];
  machineFacts: LocalDeepResearchMachineFacts;
  selectedEstimatedResidentMemoryBytes: number;
}): LocalModelResourceRegistrySnapshot {
  const settings = normalizeLocalModelResourceSettings(input.settings);
  const activeEstimatedResidentMemoryBytes = Math.max(0, input.machineFacts.activeLocalModelEstimatedResidentMemoryBytes);
  const projectedEstimatedResidentMemoryBytes = activeEstimatedResidentMemoryBytes + Math.max(0, input.selectedEstimatedResidentMemoryBytes);
  const maxResidentMemoryBytes = settings.maxResidentMemoryBytes;
  const exceededByBytes = maxResidentMemoryBytes ? projectedEstimatedResidentMemoryBytes - maxResidentMemoryBytes : undefined;
  const overLimit = exceededByBytes !== undefined && exceededByBytes > 0;
  return {
    schemaVersion: "ambient-local-model-resource-registry-v1",
    capturedAt: input.capturedAt,
    settings,
    entries: [],
    requestedLaunch: {
      capability: "local-deep-research",
      id: "local-deep-research:setup-requested",
      estimatedResidentMemoryBytes: input.selectedEstimatedResidentMemoryBytes,
    },
    activeCount: input.machineFacts.activeLocalModelCount,
    activeEstimatedResidentMemoryBytes,
    policyDecision: {
      outcome: !maxResidentMemoryBytes ? "unlimited" : overLimit ? settings.memoryLimitBehavior : "within-limit",
      reason: !maxResidentMemoryBytes
        ? "No local-model resident-memory ceiling is configured."
        : overLimit
          ? "Projected local-model resident memory exceeds the configured ceiling."
          : "Projected local-model resident memory is within the configured ceiling.",
      requestedEstimatedResidentMemoryBytes: input.selectedEstimatedResidentMemoryBytes,
      activeEstimatedResidentMemoryBytes,
      projectedEstimatedResidentMemoryBytes,
      ...(maxResidentMemoryBytes ? { maxResidentMemoryBytes } : {}),
      ...(overLimit ? { exceededByBytes } : {}),
      unloadCandidateIds: [],
    },
  };
}

function resourceBlockers(registry: LocalModelResourceRegistrySnapshot): string[] {
  return registry.policyDecision.outcome === "refuse"
    ? [registry.policyDecision.reason]
    : [];
}

function resourceWarnings(registry: LocalModelResourceRegistrySnapshot): string[] {
  return ["warn", "unload-idle", "ask-to-exceed"].includes(registry.policyDecision.outcome)
    ? [registry.policyDecision.reason]
    : [];
}

function localRuntimeInventoryStopSummary(inventory: LocalRuntimeInventorySnapshot): string {
  const blockedStops = inventory.entries.filter((entry) => !entry.stopDecision.ordinaryStopAllowed);
  if (!inventory.entries.length) return "no resident runtime rows";
  if (!blockedStops.length) return "ordinary Stop allowed for managed rows";
  const blockerReasons = blockedStops
    .map((entry) => entry.stopDecision.reason)
    .filter((reason) => reason.trim());
  return blockerReasons.length
    ? blockerReasons.join("; ")
    : `${blockedStops.length} runtime stop ${blockedStops.length === 1 ? "blocker" : "blockers"}`;
}

function localRuntimeResidentWarnings(inventory: LocalRuntimeInventorySnapshot): string[] {
  const runningEntries = inventory.entries.filter((entry) => entry.running);
  if (!runningEntries.length) return [];
  const visibleEntries = runningEntries.slice(0, 3);
  const warnings = visibleEntries.map((entry) => {
    const stopClause = entry.stopDecision.ordinaryStopAllowed
      ? "Use the local runtime Stop action only if you want to free memory before retrying."
      : `Ambient will not stop it automatically: ${entry.stopDecision.reason}`;
    return `${runtimeEntryLabel(entry)} is already resident${runtimeEntryFacts(entry)}. Local Deep Research will account for this process in memory policy instead of blocking solely on process count. ${stopClause}`;
  });
  const omitted = runningEntries.length - visibleEntries.length;
  if (omitted > 0) warnings.push(`${omitted} additional local runtime${omitted === 1 ? "" : "s"} omitted; inspect localRuntimeInventory.entries for complete ownership and memory evidence.`);
  return warnings;
}

function runtimeEntryLabel(entry: LocalRuntimeInventoryEntry): string {
  if (entry.trackingStatus === "untracked") return "Untracked local llama.cpp process";
  return `${capitalize(entry.trackingStatus)} ${capabilityLabel(entry.capability)} runtime`;
}

function runtimeEntryFacts(entry: LocalRuntimeInventoryEntry): string {
  const facts = [
    entry.pid !== undefined ? `pid ${entry.pid}` : undefined,
    entry.endpoint ? `endpoint ${entry.endpoint}` : undefined,
    entry.modelId ? `model ${shortModelId(entry.modelId)}` : entry.modelProfileId ? `profile ${entry.modelProfileId}` : undefined,
    entry.actualResidentMemoryBytes !== undefined
      ? `actual RSS ${formatBytes(entry.actualResidentMemoryBytes)}`
      : entry.estimatedResidentMemoryBytes !== undefined
        ? `estimated memory ${formatBytes(entry.estimatedResidentMemoryBytes)}`
        : undefined,
    entry.owners.length ? `owner ${entry.owners.map((owner) => owner.displayName).join(", ")}` : undefined,
  ].filter((fact): fact is string => Boolean(fact));
  return facts.length ? ` (${facts.join("; ")})` : "";
}

function capabilityLabel(capability: LocalRuntimeInventoryEntry["capability"]): string {
  if (capability === "local-deep-research") return "Local Deep Research";
  if (capability === "minicpm-v") return "MiniCPM-V";
  if (capability === "local-text") return "local text";
  if (capability === "voice") return "voice";
  return "embedding";
}

function shortModelId(modelId: string): string {
  const trimmed = modelId.trim();
  const normalized = trimmed.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? trimmed;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function localModelMemoryPolicyText(registry: LocalModelResourceRegistrySnapshot): string {
  const decision = registry.policyDecision;
  if (decision.maxProjectedMemoryUtilization !== undefined || decision.projectedSystemMemoryUtilization !== undefined) {
    return [
      `Local model memory policy: ceiling ${decision.maxProjectedMemoryUtilization !== undefined ? formatPercent(decision.maxProjectedMemoryUtilization) : "unknown"} system utilization`,
      `keep ${decision.minFreeMemoryRatioAfterLaunch !== undefined ? formatPercent(decision.minFreeMemoryRatioAfterLaunch) : "unknown"} free`,
      `projected utilization ${decision.projectedSystemMemoryUtilization !== undefined ? formatPercent(decision.projectedSystemMemoryUtilization) : "unknown"}`,
      decision.projectedFreeMemoryBytes !== undefined ? `projected free ${formatBytes(decision.projectedFreeMemoryBytes)}` : undefined,
      decision.maxResidentMemoryBytes !== undefined ? `advanced resident ceiling ${formatBytes(decision.maxResidentMemoryBytes)}` : undefined,
    ].filter((part): part is string => Boolean(part)).join("; ") + ".";
  }
  return decision.maxResidentMemoryBytes !== undefined
    ? `Local model memory ceiling: ${formatBytes(decision.maxResidentMemoryBytes)}; projected ${formatBytes(decision.projectedEstimatedResidentMemoryBytes)}.`
    : "Local model memory ceiling: not configured.";
}

function sectionLines(title: string, values: string[]): string[] {
  if (!values.length) return [`${title}: none.`];
  return [`${title}:`, ...values.map((value) => `- ${value}`)];
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const mib = bytes / (1024 ** 2);
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(2)} GiB`;
}
