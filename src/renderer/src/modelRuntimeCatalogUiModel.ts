import type {
  AmbientModelRuntimeCatalog,
  AmbientModelRuntimeProfile,
  AmbientProviderDescriptor,
} from "../../shared/ambientModels";
import type {
  LocalRuntimeInventoryEntry,
  LocalRuntimeInventorySnapshot,
} from "../../shared/types";
import {
  modelProviderOnboardingSettingsModel,
  type ModelProviderOnboardingSettingsModel,
} from "./modelProviderOnboardingUiModel";

export type ModelRuntimeCatalogTone = "success" | "warning" | "error" | "info";

export interface ModelRuntimeCatalogProfileRow {
  id: string;
  label: string;
  modelId: string;
  profileId: string;
  providerLabel: string;
  locality: AmbientModelRuntimeProfile["locality"];
  statusLabel: string;
  tone: ModelRuntimeCatalogTone;
  capabilityLabels: string[];
  detailLabels: string[];
  unavailableReason?: string;
}

export type ModelRuntimeCatalogLocalModelsGroupId =
  | "text"
  | "research"
  | "vision"
  | "voice"
  | "embeddings"
  | "untracked";

export interface ModelRuntimeCatalogRuntimeAction {
  kind: "stop" | "restart" | "start" | "unload";
  label: string;
  enabled: boolean;
  title: string;
}

export interface ModelRuntimeCatalogRuntimeRow {
  id: string;
  label: string;
  modelRuntimeId?: string;
  modelLabel: string;
  capabilityLabel: string;
  capabilityGroupId: ModelRuntimeCatalogLocalModelsGroupId;
  statusLabel: string;
  tone: ModelRuntimeCatalogTone;
  ownerLabel: string;
  memoryLabel: string;
  running: boolean;
  trackingStatusLabel: string;
  endpointLabel?: string;
  pidLabel?: string;
  lifecycleActions: ModelRuntimeCatalogRuntimeAction[];
  ordinaryStopAction: ModelRuntimeCatalogRuntimeAction;
  ordinaryRestartAction: ModelRuntimeCatalogRuntimeAction;
  forceTerminationLabel: string;
  blockerSummaryLabel?: string;
  forceConsequenceLabel?: string;
  leaseStateLabel: string;
  blockerLabels: string[];
  affectedSubagentLabels: string[];
  detailLabels: string[];
}

export interface ModelRuntimeCatalogLocalModelsGroup {
  id: ModelRuntimeCatalogLocalModelsGroupId;
  label: string;
  summary: string;
  tone: ModelRuntimeCatalogTone;
  rows: ModelRuntimeCatalogRuntimeRow[];
  emptyLabel: string;
}

export interface ModelRuntimeCatalogSettingsModel {
  statusLabel: string;
  summary: string;
  generatedLabel: string;
  statusTone: ModelRuntimeCatalogTone;
  selectedProfile: ModelRuntimeCatalogProfileRow;
  mainProfileRows: ModelRuntimeCatalogProfileRow[];
  subagentProfileRows: ModelRuntimeCatalogProfileRow[];
  unavailableProfileRows: ModelRuntimeCatalogProfileRow[];
  localProfileRows: ModelRuntimeCatalogProfileRow[];
  localModelsStatusLabel: string;
  localModelsSummary: string;
  localRuntimeSummary: string;
  localRuntimeTone: ModelRuntimeCatalogTone;
  localRuntimeRows: ModelRuntimeCatalogRuntimeRow[];
  localRuntimeGroups: ModelRuntimeCatalogLocalModelsGroup[];
  providerOnboarding: ModelProviderOnboardingSettingsModel;
  validationRows: string[];
  searchText: string;
}

export function modelRuntimeCatalogSettingsModel(
  catalog: AmbientModelRuntimeCatalog,
  selectedModelId: string,
  runtimeInventory?: LocalRuntimeInventorySnapshot,
): ModelRuntimeCatalogSettingsModel {
  const providerById = new Map(catalog.providers.map((provider) => [provider.id, provider]));
  const rows = catalog.profiles.map((profile) => modelRuntimeCatalogProfileRow(profile, providerById));
  const profileByModelId = new Map(catalog.profiles.map((profile) => [profile.modelId, profile]));
  const profileByProfileId = new Map(catalog.profiles.map((profile) => [profile.profileId, profile]));
  const selectedProfile =
    rows.find((row) => row.modelId === selectedModelId) ??
    missingSelectedProfileRow(selectedModelId);
  const mainProfileRows = rows.filter((row) => catalog.selectableMainModelOptions.some((option) => option.id === row.modelId));
  const subagentProfileIds = new Set(catalog.selectableSubagentProfiles.map((profile) => profile.profileId));
  const subagentProfileRows = rows.filter((row) => subagentProfileIds.has(row.profileId));
  const unavailableProfileRows = rows.filter((row) => row.tone === "error");
  const localProfileRows = rows.filter((row) => row.locality === "local");
  const localRuntimeRows = (runtimeInventory?.entries ?? []).map((entry) =>
    modelRuntimeCatalogRuntimeRow(entry, profileByModelId, profileByProfileId)
  );
  const localRuntimeGroups = modelRuntimeCatalogLocalModelsGroups(localRuntimeRows);
  const providerOnboarding = modelProviderOnboardingSettingsModel();
  const validationRows = catalog.validationIssues.map((issue) => [
    issue.profileId ?? issue.providerId ?? "catalog",
    issue.field,
    issue.message,
  ].join(": "));
  const statusTone: ModelRuntimeCatalogTone =
    validationRows.length > 0 || selectedProfile.tone === "error"
      ? "error"
      : selectedProfile.tone === "warning" || unavailableProfileRows.length > 0
        ? "warning"
        : "success";
  const localRuntimeTone = runtimeInventoryTone(localRuntimeRows);
  const statusLabel = `${mainProfileRows.length} main / ${subagentProfileRows.length} sub-agent`;
  const summary = `${rows.length - unavailableProfileRows.length} available / ${unavailableProfileRows.length} unavailable`;
  const localRuntimeSummary = runtimeInventory
    ? runtimeInventorySummaryLabel(localRuntimeRows, runtimeInventory)
    : "No live runtime inventory";
  const localModelsStatusLabel = `${localProfileRows.length} local profile${localProfileRows.length === 1 ? "" : "s"}`;
  const localModelsSummary = runtimeInventory
    ? [
        `${localProfileRows.filter((row) => row.tone !== "error").length} configured`,
        `${localRuntimeRows.filter((row) => row.running).length} running`,
        `${runtimeInventory.activeLeases.length} in use`,
      ].join(" / ")
    : `${localProfileRows.filter((row) => row.tone !== "error").length} configured / inventory unavailable`;
  const searchText = [
    statusLabel,
    summary,
    localModelsStatusLabel,
    localModelsSummary,
    localRuntimeSummary,
    selectedProfile.label,
    selectedProfile.modelId,
    selectedProfile.providerLabel,
    selectedProfile.detailLabels.join(" "),
    rows.map((row) => [
      row.label,
      row.modelId,
      row.profileId,
      row.providerLabel,
      row.statusLabel,
      row.capabilityLabels.join(" "),
      row.detailLabels.join(" "),
      row.unavailableReason,
    ].filter(Boolean).join(" ")).join(" "),
    localRuntimeRows.map((row) => [
      row.label,
      row.modelLabel,
      row.capabilityLabel,
      row.statusLabel,
      row.ownerLabel,
      row.memoryLabel,
      row.endpointLabel,
      row.pidLabel,
      row.lifecycleActions.map((action) => `${action.label} ${action.enabled ? "enabled" : "disabled"} ${action.title}`).join(" "),
      row.ordinaryStopAction.label,
      row.ordinaryStopAction.title,
      row.ordinaryRestartAction.label,
      row.ordinaryRestartAction.title,
      row.forceTerminationLabel,
      row.blockerSummaryLabel,
      row.forceConsequenceLabel,
      row.leaseStateLabel,
      row.blockerLabels.join(" "),
      row.affectedSubagentLabels.join(" "),
      row.detailLabels.join(" "),
    ].filter(Boolean).join(" ")).join(" "),
    localRuntimeGroups.map((group) => `${group.label} ${group.summary} ${group.emptyLabel}`).join(" "),
    providerOnboarding.searchText,
    validationRows.join(" "),
  ].join(" ");
  return {
    statusLabel,
    summary,
    generatedLabel: catalog.generatedAt,
    statusTone,
    selectedProfile,
    mainProfileRows,
    subagentProfileRows,
    unavailableProfileRows,
    localProfileRows,
    localModelsStatusLabel,
    localModelsSummary,
    localRuntimeSummary,
    localRuntimeTone,
    localRuntimeRows,
    localRuntimeGroups,
    providerOnboarding,
    validationRows,
    searchText,
  };
}

function modelRuntimeCatalogRuntimeRow(
  entry: LocalRuntimeInventoryEntry,
  profileByModelId: ReadonlyMap<string, AmbientModelRuntimeProfile>,
  profileByProfileId: ReadonlyMap<string, AmbientModelRuntimeProfile>,
): ModelRuntimeCatalogRuntimeRow {
  const profile = entry.modelProfileId
    ? profileByProfileId.get(entry.modelProfileId)
    : entry.modelId
      ? profileByModelId.get(entry.modelId)
      : undefined;
  const ownerLabel = runtimeOwnerLabel(entry);
  const lifecycleActions = runtimeLifecycleActions(entry);
  const leaseStateLabel = runtimeLeaseStateLabel(entry);
  const affectedSubagentLabels = runtimeAffectedSubagentLabels(entry);
  const blockerSummaryLabel = runtimeBlockerSummaryLabel(entry);
  const forceConsequenceLabel = runtimeForceConsequenceLabel(entry);
  return {
    id: entry.id,
    label: profile?.label ?? entry.modelId ?? entry.modelProfileId ?? entry.id,
    ...(entry.modelRuntimeId ? { modelRuntimeId: entry.modelRuntimeId } : {}),
    modelLabel: entry.modelId ?? entry.modelProfileId ?? "Unknown model",
    capabilityLabel: runtimeCapabilityLabel(entry.capability),
    capabilityGroupId: runtimeCapabilityGroupId(entry),
    statusLabel: runtimeStatusLabel(entry),
    tone: runtimeTone(entry),
    ownerLabel,
    memoryLabel: runtimeMemoryLabel(entry),
    running: entry.running,
    trackingStatusLabel: runtimeTrackingStatusLabel(entry.trackingStatus),
    ...(entry.endpoint ? { endpointLabel: entry.endpoint } : {}),
    ...(entry.pid !== undefined ? { pidLabel: `pid ${entry.pid}` } : {}),
    lifecycleActions,
    ordinaryStopAction: {
      kind: "stop",
      label: entry.lifecycleDecision.stop.allowed ? "Stop" : "Stop disabled",
      enabled: entry.lifecycleDecision.stop.allowed,
      title: entry.lifecycleDecision.stop.reason,
    },
    ordinaryRestartAction: {
      kind: "restart",
      label: entry.lifecycleDecision.restart.allowed ? "Restart" : "Restart disabled",
      enabled: entry.lifecycleDecision.restart.allowed,
      title: entry.lifecycleDecision.restart.reason,
    },
    forceTerminationLabel: runtimeForceTerminationLabel(entry),
    ...(blockerSummaryLabel ? { blockerSummaryLabel } : {}),
    ...(forceConsequenceLabel ? { forceConsequenceLabel } : {}),
    leaseStateLabel,
    blockerLabels: uniqueLabels([
      ...entry.lifecycleDecision.stop.blockerLeaseIds,
      ...entry.lifecycleDecision.restart.blockerLeaseIds,
    ]),
    affectedSubagentLabels,
    detailLabels: runtimeDetailLabels(entry),
  };
}

const localRuntimeGroupDefinitions: Array<{
  id: ModelRuntimeCatalogLocalModelsGroupId;
  label: string;
  emptyLabel: string;
}> = [
  { id: "text", label: "Text", emptyLabel: "No local text runtime surfaced yet." },
  { id: "research", label: "Research", emptyLabel: "No Local Deep Research runtime surfaced yet." },
  { id: "vision", label: "Vision", emptyLabel: "No local vision runtime surfaced yet." },
  { id: "voice", label: "Voice", emptyLabel: "No local voice runtime surfaced yet." },
  { id: "embeddings", label: "Embeddings", emptyLabel: "No local embedding runtime surfaced yet." },
  { id: "untracked", label: "Untracked", emptyLabel: "No untracked local model processes detected." },
];

function modelRuntimeCatalogLocalModelsGroups(
  rows: readonly ModelRuntimeCatalogRuntimeRow[],
): ModelRuntimeCatalogLocalModelsGroup[] {
  return localRuntimeGroupDefinitions.map((definition) => {
    const groupRows = rows.filter((row) => row.capabilityGroupId === definition.id);
    return {
      ...definition,
      summary: groupRows.length
        ? `${groupRows.length} runtime${groupRows.length === 1 ? "" : "s"} / ${groupRows.filter((row) => row.running).length} running`
        : "0 runtimes",
      tone: runtimeInventoryTone(groupRows),
      rows: groupRows,
    };
  });
}

function runtimeInventorySummaryLabel(
  rows: readonly ModelRuntimeCatalogRuntimeRow[],
  runtimeInventory: LocalRuntimeInventorySnapshot,
): string {
  const staleLeaseCount = uniqueLabels(runtimeInventory.entries.flatMap((entry) => entry.leaseState.staleLeaseIds)).length;
  const releasedLeaseCount = uniqueLabels(runtimeInventory.entries.flatMap((entry) => entry.leaseState.releasedLeaseIds)).length;
  const crashedLeaseCount = uniqueLabels(runtimeInventory.entries.flatMap((entry) => entry.leaseState.crashedLeaseIds)).length;
  const parts = [
    `${rows.length} runtime${rows.length === 1 ? "" : "s"}`,
    `${runtimeInventory.activeLeases.length} active lease${runtimeInventory.activeLeases.length === 1 ? "" : "s"}`,
    staleLeaseCount > 0 ? `${staleLeaseCount} stale lease${staleLeaseCount === 1 ? "" : "s"}` : undefined,
    releasedLeaseCount > 0 ? `${releasedLeaseCount} released lease${releasedLeaseCount === 1 ? "" : "s"}` : undefined,
    crashedLeaseCount > 0 ? `${crashedLeaseCount} crashed lease${crashedLeaseCount === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean);
  return parts.join(" / ");
}

function runtimeCapabilityGroupId(entry: LocalRuntimeInventoryEntry): ModelRuntimeCatalogLocalModelsGroupId {
  if (entry.trackingStatus === "untracked") return "untracked";
  if (entry.capability === "local-deep-research") return "research";
  if (entry.capability === "minicpm-v") return "vision";
  if (entry.capability === "voice") return "voice";
  if (entry.capability === "embeddings") return "embeddings";
  return "text";
}

function runtimeInventoryTone(rows: readonly ModelRuntimeCatalogRuntimeRow[]): ModelRuntimeCatalogTone {
  if (rows.some((row) => row.tone === "error")) return "error";
  if (rows.some((row) => row.tone === "warning")) return "warning";
  if (rows.length === 0) return "info";
  if (rows.every((row) => row.tone === "info")) return "info";
  return "success";
}

function runtimeTone(entry: LocalRuntimeInventoryEntry): ModelRuntimeCatalogTone {
  if (entry.trackingStatus === "untracked") return "error";
  if (entry.capability !== "local-text" && !entry.running) return "info";
  if (!entry.lifecycleDecision.stop.allowed && entry.running) return "warning";
  if (!entry.lifecycleDecision.restart.allowed && !entry.running) return "warning";
  if (!entry.running) return "info";
  return "success";
}

function runtimeStatusLabel(entry: LocalRuntimeInventoryEntry): string {
  return `${entry.running ? "Running" : "Stopped"} · ${runtimeTrackingStatusLabel(entry.trackingStatus)}`;
}

function runtimeTrackingStatusLabel(status: LocalRuntimeInventoryEntry["trackingStatus"]): string {
  if (status === "untracked") return "Untracked";
  if (status === "tracked") return "Tracked";
  return "Managed";
}

function runtimeOwnerLabel(entry: LocalRuntimeInventoryEntry): string {
  if (entry.owners.length === 0) return "No active owner";
  return `In use by ${entry.owners.map((owner) => owner.displayName).join(", ")}`;
}

function runtimeCapabilityLabel(capability: LocalRuntimeInventoryEntry["capability"]): string {
  if (capability === "local-deep-research") return "Local Deep Research";
  if (capability === "minicpm-v") return "MiniCPM-V";
  if (capability === "voice") return "Voice";
  if (capability === "embeddings") return "Embeddings";
  return "Local text";
}

function runtimeMemoryLabel(entry: LocalRuntimeInventoryEntry): string {
  const parts = [
    entry.actualResidentMemoryBytes !== undefined ? `Actual RSS ${formatBytes(entry.actualResidentMemoryBytes)}` : undefined,
    entry.estimatedResidentMemoryBytes !== undefined ? `Estimate ${formatBytes(entry.estimatedResidentMemoryBytes)}` : undefined,
  ].filter((label): label is string => Boolean(label));
  return parts.length ? parts.join(" / ") : "Memory unknown";
}

function runtimeForceTerminationLabel(entry: LocalRuntimeInventoryEntry): string {
  const actions = forceLifecycleActions(entry);
  const resolvingActions = actions
    .filter((action) => action.decision.forceAllowed && action.decision.forceRequiresSubagentCancellation)
    .map((action) => action.label);
  if (resolvingActions.length) return `Forced ${joinActionLabels(resolvingActions)} cancels affected sub-agents`;

  const availableActions = actions
    .filter((action) => action.decision.forceAllowed)
    .map((action) => action.label);
  if (availableActions.length) return `Forced ${joinActionLabels(availableActions)} available`;

  return "Force termination unavailable";
}

function runtimeBlockerSummaryLabel(entry: LocalRuntimeInventoryEntry): string | undefined {
  const decisions = forceLifecycleActions(entry);
  const blockerLeaseIds = uniqueLabels(decisions.flatMap((action) => action.decision.blockerLeaseIds));
  if (blockerLeaseIds.length > 0) {
    const blockedActions = decisions
      .filter((action) => action.decision.blockerLeaseIds.length > 0)
      .map((action) => action.label);
    return `Ordinary ${joinActionLabels(blockedActions)} blocked by ${blockerLeaseIds.length} active sub-agent ${blockerLeaseIds.length === 1 ? "lease" : "leases"}: ${blockerLeaseIds.join(", ")}`;
  }
  if (decisions.some((action) => action.decision.untracked)) {
    return "Ordinary Stop/Restart disabled because this local runtime is untracked.";
  }
  return undefined;
}

function runtimeForceConsequenceLabel(entry: LocalRuntimeInventoryEntry): string | undefined {
  const actions = forceLifecycleActions(entry);
  const resolvingActions = actions
    .filter((action) => action.decision.forceAllowed && action.decision.forceRequiresSubagentCancellation)
    .map((action) => action.label);
  if (resolvingActions.length > 0) {
    const affectedSubagents = runtimeAffectedSubagentLabels(entry);
    const affectedCount = affectedSubagents.length;
    const affectedSummary = affectedCount > 0
      ? `${affectedCount} affected ${affectedCount === 1 ? "sub-agent" : "sub-agents"}: ${affectedSubagents.join(", ")}`
      : "affected sub-agents";
    return `Forced ${joinActionLabels(resolvingActions)} will cancel or mark ${affectedSummary} before changing this runtime.`;
  }
  const availableActions = actions
    .filter((action) => action.decision.forceAllowed)
    .map((action) => action.label);
  if (availableActions.length > 0) {
    return `Forced ${joinActionLabels(availableActions)} can run after Ambient re-checks runtime blockers.`;
  }
  if (actions.some((action) => action.decision.untracked)) {
    return "Forced termination unavailable for untracked processes; ask the owner to stop it outside Ambient.";
  }
  return undefined;
}

function forceLifecycleActions(entry: LocalRuntimeInventoryEntry): Array<{
  label: "Stop" | "Restart";
  decision: LocalRuntimeInventoryEntry["lifecycleDecision"]["stop"];
}> {
  return [
    { label: "Stop", decision: entry.lifecycleDecision.stop },
    { label: "Restart", decision: entry.lifecycleDecision.restart },
  ];
}

function joinActionLabels(labels: string[]): string {
  return labels.join("/");
}

function runtimeAffectedSubagentLabels(entry: LocalRuntimeInventoryEntry): string[] {
  return uniqueLabels([
    ...(entry.lifecycleDecision.stop.affectedSubagents ?? []),
    ...(entry.lifecycleDecision.restart.affectedSubagents ?? []),
    ...(entry.lifecycleDecision.load.affectedSubagents ?? []),
    ...(entry.lifecycleDecision.unload.affectedSubagents ?? []),
  ].map((subagent) =>
    `${subagent.displayName} (${affectedSubagentHandleLabel(subagent)})`
  ));
}

function affectedSubagentHandleLabel(
  subagent: LocalRuntimeInventoryEntry["lifecycleDecision"]["stop"]["affectedSubagents"][number],
): string {
  if (!subagent.subagentRunId) return `${subagent.subagentThreadId}, lease ${subagent.leaseId}`;
  return `run ${subagent.subagentRunId}, thread ${subagent.subagentThreadId}, lease ${subagent.leaseId}`;
}

function runtimeLeaseStateLabel(entry: LocalRuntimeInventoryEntry): string {
  if (!entry.leases.length) return "No lease history";
  const parts = [
    entry.leaseState.activeLeaseIds.length > 0 ? `${entry.leaseState.activeLeaseIds.length} active lease${entry.leaseState.activeLeaseIds.length === 1 ? "" : "s"}` : undefined,
    entry.leaseState.staleLeaseIds.length > 0 ? `${entry.leaseState.staleLeaseIds.length} stale lease${entry.leaseState.staleLeaseIds.length === 1 ? "" : "s"}` : undefined,
    entry.leaseState.releasedLeaseIds.length > 0 ? `${entry.leaseState.releasedLeaseIds.length} released lease${entry.leaseState.releasedLeaseIds.length === 1 ? "" : "s"}` : undefined,
    entry.leaseState.crashedLeaseIds.length > 0 ? `${entry.leaseState.crashedLeaseIds.length} crashed lease${entry.leaseState.crashedLeaseIds.length === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "No active lease";
}

function runtimeDetailLabels(entry: LocalRuntimeInventoryEntry): string[] {
  return [
    entry.providerId ? `Provider: ${entry.providerId}` : undefined,
    entry.modelRuntimeId ? `Runtime: ${entry.modelRuntimeId}` : undefined,
    entry.modelProfileId ? `Profile: ${entry.modelProfileId}` : undefined,
    entry.startedAt ? `Started: ${entry.startedAt}` : undefined,
    entry.lastUsedAt ? `Last used: ${entry.lastUsedAt}` : undefined,
    entry.lastHeartbeatAt ? `Heartbeat: ${entry.lastHeartbeatAt}` : undefined,
    entry.leases.length ? `Lease state: ${runtimeLeaseStateLabel(entry)}` : undefined,
    ...runtimeAffectedSubagentLabels(entry).map((label) => `Affected sub-agent: ${label}`),
    entry.memorySampledAt ? `Memory sampled: ${entry.memorySampledAt}` : undefined,
    `Stop: ${entry.lifecycleDecision.stop.reason}`,
    `Restart: ${entry.lifecycleDecision.restart.reason}`,
    `Start: ${entry.lifecycleDecision.load.reason}`,
    `Unload: ${entry.lifecycleDecision.unload.reason}`,
  ].filter((label): label is string => Boolean(label));
}

function runtimeLifecycleActions(entry: LocalRuntimeInventoryEntry): ModelRuntimeCatalogRuntimeAction[] {
  return [
    runtimeLifecycleAction("stop", "Stop", entry.lifecycleDecision.stop),
    runtimeLifecycleAction("restart", "Restart", entry.lifecycleDecision.restart),
    runtimeLifecycleAction("start", "Start", entry.lifecycleDecision.load),
    runtimeLifecycleAction("unload", "Unload", entry.lifecycleDecision.unload),
  ];
}

function runtimeLifecycleAction(
  kind: ModelRuntimeCatalogRuntimeAction["kind"],
  label: string,
  decision: LocalRuntimeInventoryEntry["lifecycleDecision"]["stop"],
): ModelRuntimeCatalogRuntimeAction {
  return {
    kind,
    label: decision.allowed ? label : `${label} disabled`,
    enabled: decision.allowed,
    title: decision.reason,
  };
}

function uniqueLabels(labels: string[]): string[] {
  return [...new Set(labels.filter((label) => label.trim()))];
}

function modelRuntimeCatalogProfileRow(
  profile: AmbientModelRuntimeProfile,
  providerById: ReadonlyMap<string, AmbientProviderDescriptor>,
): ModelRuntimeCatalogProfileRow {
  const provider = providerById.get(profile.providerId);
  const statusLabel = profileStatusLabel(profile);
  return {
    id: profile.profileId,
    label: profile.label,
    modelId: profile.modelId,
    profileId: profile.profileId,
    providerLabel: provider?.label ?? profile.providerId,
    locality: profile.locality,
    statusLabel,
    tone: profileTone(profile),
    capabilityLabels: profileCapabilityLabels(profile),
    detailLabels: profileDetailLabels(profile, provider),
    ...(profile.unavailableReason ? { unavailableReason: profile.unavailableReason } : {}),
  };
}

function missingSelectedProfileRow(modelId: string): ModelRuntimeCatalogProfileRow {
  return {
    id: `missing:${modelId}`,
    label: `${modelId} (not in catalog)`,
    modelId,
    profileId: `missing:${modelId}`,
    providerLabel: "Unknown provider",
    locality: "cloud",
    statusLabel: "Unavailable",
    tone: "error",
    capabilityLabels: ["Not registered"],
    detailLabels: ["Selected model is not present in the current runtime catalog."],
    unavailableReason: "Selected model is not present in the current runtime catalog.",
  };
}

function profileTone(profile: AmbientModelRuntimeProfile): ModelRuntimeCatalogTone {
  if (!profile.available) return "error";
  if (profile.selectableAsMain || profile.selectableAsSubagent) return "success";
  return "warning";
}

function profileStatusLabel(profile: AmbientModelRuntimeProfile): string {
  if (!profile.available) return "Unavailable";
  if (profile.selectableAsMain && profile.selectableAsSubagent) return "Main + sub-agent";
  if (profile.selectableAsMain) return "Main only";
  if (profile.selectableAsSubagent) return "Sub-agent only";
  return "Available, not selectable";
}

function profileCapabilityLabels(profile: AmbientModelRuntimeProfile): string[] {
  return [
    profile.locality === "local" ? "Local" : "Cloud",
    profile.supportsStreaming ? "Streaming" : "No streaming",
    toolUseLabel(profile.toolUse),
    structuredOutputLabel(profile.structuredOutput),
  ];
}

function profileDetailLabels(profile: AmbientModelRuntimeProfile, provider?: AmbientProviderDescriptor): string[] {
  return [
    `Provider: ${profile.providerId}`,
    `Profile: ${profile.profileId}`,
    ...providerEndpointDetailLabels(provider),
    profile.contextWindowTokens !== undefined ? `Context: ${formatTokenCount(profile.contextWindowTokens)}` : "Context: unknown",
    profile.maxOutputTokens !== undefined ? `Max output: ${formatTokenCount(profile.maxOutputTokens)}` : "Max output: unknown",
    `Privacy: ${profile.privacyLabel}`,
    `Cost: ${profile.costClass}`,
    `Trust: ${profile.trustClass}`,
    profile.memoryClass ? `Memory: ${profile.memoryClass}` : undefined,
    profile.estimatedResidentMemoryBytes !== undefined ? `Estimated RSS: ${formatBytes(profile.estimatedResidentMemoryBytes)}` : undefined,
    profile.supportsVision ? "Vision" : undefined,
    profile.supportsAudio ? "Audio" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function providerEndpointDetailLabels(provider?: AmbientProviderDescriptor): string[] {
  if (!provider?.endpoint) return [];
  return [
    `Endpoint: ${provider.endpoint.baseUrl}`,
    `Endpoint compatibility: ${providerEndpointCompatibilityLabel(provider.endpoint.compatibility)}`,
    provider.endpoint.anthropicVersion ? `Anthropic version: ${provider.endpoint.anthropicVersion}` : undefined,
  ].filter((label): label is string => Boolean(label));
}

function providerEndpointCompatibilityLabel(compatibility: NonNullable<AmbientProviderDescriptor["endpoint"]>["compatibility"]): string {
  if (compatibility === "ambient-compatible") return "Ambient-compatible";
  if (compatibility === "anthropic-compatible") return "Anthropic-compatible";
  return "OpenAI-compatible";
}

function toolUseLabel(toolUse: AmbientModelRuntimeProfile["toolUse"]): string {
  if (toolUse === "ambient-tools") return "Ambient tools";
  if (toolUse === "mcp-compatible") return "MCP-compatible tools";
  return "No tools";
}

function structuredOutputLabel(structuredOutput: AmbientModelRuntimeProfile["structuredOutput"]): string {
  if (structuredOutput === "schema") return "Schema output";
  if (structuredOutput === "json-mode") return "JSON mode";
  return "No structured output";
}

function formatTokenCount(tokens: number): string {
  return `${tokens.toLocaleString("en-US")} tokens`;
}

function formatBytes(bytes: number): string {
  const gib = bytes / 1024 / 1024 / 1024;
  if (gib >= 1) return `${formatNumber(gib)} GiB`;
  const mib = bytes / 1024 / 1024;
  return `${formatNumber(mib)} MiB`;
}

function formatNumber(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}
