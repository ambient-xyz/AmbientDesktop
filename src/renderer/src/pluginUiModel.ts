import type {
  AmbientGeneratedCapabilitySummary,
  AmbientMcpContainerRuntimeInstallAction,
  AmbientMcpContainerRuntimeLifecycleAction,
  AmbientMcpContainerRuntimeLifecycleCommand,
  AmbientMcpContainerRuntimeLifecyclePreview,
  AmbientMcpContainerRuntimeLifecycleProgress,
  AmbientMcpContainerRuntimeLifecycleResult,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpContainerRuntimeStatusKind,
  AmbientMcpDefaultCapabilitySummary,
  AmbientMcpInstalledServerSummary,
  AmbientMcpInstallPreview,
  AmbientMcpServerSearchResult,
  AmbientPluginAppAuthSummary,
  AmbientPluginAuthAccountSummary,
  AmbientPluginCapabilitySummary,
  AmbientPluginRegistry,
  AmbientPluginRuntime,
  AmbientPluginSourceKind,
  AmbientPluginSummary,
  CapabilityBuilderHistoryEntry,
  CodexMarketplaceSourceSummary,
  CodexPluginSummary,
  FirstPartyGoogleIntegrationState,
  PiPackageInstallScope,
  PiPackageSummary,
  PluginMcpRuntimeEvent,
} from "../../shared/pluginTypes";
import type { WorkflowPluginCapabilityGrant } from "../../shared/workflowTypes";

export type AmbientPluginSourceFilter = "all" | AmbientPluginSourceKind;
export type AmbientPluginRuntimeFilter = "all" | AmbientPluginRuntime;

export interface PluginActionState {
  label: string;
  disabled: boolean;
  title: string;
  visible: boolean;
}

export interface McpContainerRuntimeInstallActionView extends PluginActionState {
  actionId: string;
  primary: boolean;
  runtime: AmbientMcpContainerRuntimeInstallAction["runtime"];
  kind: AmbientMcpContainerRuntimeInstallAction["kind"];
  busyLabel: string;
  commandPreview?: string;
  managedExecution?: string;
}

export interface McpContainerRuntimeLifecycleActionView extends PluginActionState {
  action: AmbientMcpContainerRuntimeLifecycleAction;
  primary: boolean;
  danger: boolean;
  busyLabel: string;
}

export type McpContainerRuntimeLifecycleStatusView = {
  kind: "info" | "success" | "error";
  message: string;
};

export const mcpContainerRuntimeLifecycleForceWarningText =
  "Force quit and restart can interrupt every container on this runtime, including non-Ambient containers.";

export interface WorkflowPluginRequirementRow {
  capabilityId: string;
  pluginName: string;
  serverName: string;
  toolName: string;
  registeredName: string;
  availabilityLabel: string;
  availabilityReason?: string;
  blocked: boolean;
}

export interface CodexImportCandidateGroups {
  curated: CodexPluginSummary[];
  remote: CodexPluginSummary[];
  localCache: CodexPluginSummary[];
}

export type {
  CapabilityBuilderLauncherDraft,
  CapabilityBuilderLocality,
  ProviderCatalogSettingsCardView,
  RemoteSurfaceActivationPromptProvider,
  VoiceProviderGuidanceCard,
  VoiceProviderGuidanceTier,
  VoiceProviderGuidanceType,
  VoiceProviderRecommendation,
  VoiceProviderRecommendationLevel,
} from "./pluginUiModelProviderOnboarding";
export {
  buildCapabilityBuilderPrompt,
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
  buildVoiceProviderCapabilityPrompt,
  defaultCapabilityBuilderLauncherDraft,
  providerCatalogSettingsCardView,
  providerCatalogSettingsCardsForArea,
  recommendVoiceProviders,
  voiceProviderGuidanceCards,
} from "./pluginUiModelProviderOnboarding";
export type GoogleWorkspaceActionKind = "install" | "connect" | "repair" | "validate" | "cancel";

export type GoogleWorkspaceValidationFeedbackStatus = "validating" | "validated" | "failed";

export interface GoogleWorkspaceValidationFeedback {
  accountId: string;
  status: GoogleWorkspaceValidationFeedbackStatus;
  message?: string;
}

export interface GoogleWorkspaceValidationButtonView {
  label: string;
  icon: "none" | "spinner" | "success" | "error";
  tone: "default" | "success" | "error";
}

export interface GoogleWorkspaceAccountRow {
  id: string;
  accountId: string;
  label: string;
  identityLabel: string;
  handleLabel: string;
  email?: string;
  status: AmbientPluginAuthAccountSummary["status"];
  connectorLabels: string[];
  lastValidatedLabel?: string;
  validationError?: string;
}

export function groupCodexImportCandidates(candidates: CodexPluginSummary[]): CodexImportCandidateGroups {
  return {
    curated: candidates.filter((plugin) => plugin.marketplaceKind === "ambient-curated"),
    remote: candidates.filter((plugin) => plugin.sourceKind === "remote-marketplace" && plugin.marketplaceKind !== "ambient-curated"),
    localCache: candidates.filter((plugin) => plugin.sourceKind === "codex-cache"),
  };
}

export function filterAmbientPluginsBySource(
  plugins: AmbientPluginSummary[],
  sourceFilter: AmbientPluginSourceFilter,
): AmbientPluginSummary[] {
  if (sourceFilter === "all") return plugins;
  return plugins.filter((plugin) => plugin.sourceKind === sourceFilter);
}

export function filterAmbientCapabilities(
  capabilities: AmbientPluginCapabilitySummary[],
  filters: { source: AmbientPluginSourceFilter; runtime: AmbientPluginRuntimeFilter },
): AmbientPluginCapabilitySummary[] {
  return capabilities.filter((capability) => {
    const sourceMatches = filters.source === "all" || capability.sourceKind === filters.source;
    const runtimeMatches = filters.runtime === "all" || capability.runtimeSupport.includes(filters.runtime);
    return sourceMatches && runtimeMatches;
  });
}

export function capabilityDiagnosticsActionState(
  capability: Pick<AmbientPluginCapabilitySummary, "id" | "availability" | "availabilityReason">,
  busyCapabilityId?: string,
): PluginActionState {
  const busy = busyCapabilityId === capability.id;
  const anotherBusy = Boolean(busyCapabilityId && busyCapabilityId !== capability.id);
  return {
    label: busy ? "Inspecting" : "Details",
    disabled: anotherBusy,
    title: capability.availabilityReason
      ? `Show registry diagnostics. Current status: ${formatAmbientAvailability(capability.availability)}. ${capability.availabilityReason}`
      : "Show registry diagnostics for this capability.",
    visible: true,
  };
}

export function generatedCapabilitySourceActionState(
  generated: AmbientGeneratedCapabilitySummary | undefined,
  busyPath?: string,
): PluginActionState {
  const sourcePath = generated?.sourcePath?.trim();
  const busy = Boolean(sourcePath && busyPath === sourcePath);
  return {
    label: busy ? "Opening" : "Open source",
    disabled: !sourcePath || busy,
    title: sourcePath ? `Reveal generated capability source: ${sourcePath}` : "Generated capability source path is unavailable.",
    visible: Boolean(generated),
  };
}

export function generatedCapabilityValidationActionState(
  generated: AmbientGeneratedCapabilitySummary | undefined,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = generated?.sourcePath?.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Starting" : "Validate",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before starting capability validation."
        : `Start an approval-gated Capability Builder validation for: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: Boolean(generated),
  };
}

export function generatedCapabilityUpdatePlanActionState(
  generated: AmbientGeneratedCapabilitySummary | undefined,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = generated?.sourcePath?.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Planning" : "Plan update",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before planning a capability update."
        : `Start a Capability Builder update/rebuild plan for: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: Boolean(generated),
  };
}

export function generatedCapabilityRemovalPlanActionState(
  generated: AmbientGeneratedCapabilitySummary | undefined,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = generated?.sourcePath?.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Planning" : "Plan removal",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before planning capability removal."
        : `Start a safe uninstall/deactivation plan for: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: Boolean(generated),
  };
}

export function generatedCapabilitySummaryFromHistoryEntry(entry: CapabilityBuilderHistoryEntry): AmbientGeneratedCapabilitySummary {
  return {
    schemaVersion: "ambient-capability-builder-v1",
    status: entry.status,
    ...(entry.goal ? { goal: entry.goal } : {}),
    ...(entry.installerShape ? { installerShape: entry.installerShape } : {}),
    ...(entry.kind ? { kind: entry.kind } : {}),
    ...(entry.provider ? { provider: entry.provider } : {}),
    outputArtifactTypes: entry.artifactOutputTypes,
    sourcePath: entry.relativeRootPath,
    ...(entry.lastValidatedAt ? { lastValidatedAt: entry.lastValidatedAt } : {}),
    ...(entry.registeredAt ? { registeredAt: entry.registeredAt } : {}),
    ...(entry.installedPackageId ? { installedPackageId: entry.installedPackageId } : {}),
    ...(entry.installedSource ? { installedSource: entry.installedSource } : {}),
    ...(entry.version ? { installedVersion: entry.version } : {}),
    refs: {
      ...(typeof entry.refs.latest === "string" ? { latest: entry.refs.latest } : {}),
      ...(typeof entry.refs.installed === "string" ? { installed: entry.refs.installed } : {}),
      ...(typeof entry.refs.lastValidated === "string" ? { lastValidated: entry.refs.lastValidated } : {}),
      ...(typeof entry.refs.lastValidatedHash === "string" ? { lastValidatedHash: entry.refs.lastValidatedHash } : {}),
      ...(typeof entry.refs.lastRepair === "string" ? { lastRepair: entry.refs.lastRepair } : {}),
    },
  };
}

export function capabilityBuilderHistorySourceActionState(entry: CapabilityBuilderHistoryEntry, busyPath?: string): PluginActionState {
  const sourcePath = entry.relativeRootPath.trim();
  const busy = Boolean(sourcePath && busyPath === sourcePath);
  return {
    label: busy ? "Opening" : "Open source",
    disabled: !sourcePath || busy,
    title: sourcePath ? `Reveal preserved generated capability source: ${sourcePath}` : "Generated capability source path is unavailable.",
    visible: true,
  };
}

export function capabilityBuilderHistoryPreviewActionState(
  entry: CapabilityBuilderHistoryEntry,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = entry.relativeRootPath.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Starting" : "Preview",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before previewing this generated source."
        : `Start a chat-first preview for preserved generated source: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: true,
  };
}

export function capabilityBuilderHistoryReregisterActionState(
  entry: CapabilityBuilderHistoryEntry,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = entry.relativeRootPath.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Starting" : "Re-register",
    disabled: !sourcePath || busy || Boolean(options.running) || entry.installedPresent || !entry.valid,
    title: sourcePath
      ? entry.installedPresent
        ? "This generated capability is already installed; use validation or update planning instead."
        : !entry.valid
          ? "Repair or preview this generated source before re-registration; the current static preview has errors."
          : options.running
            ? "Wait for the current chat run to finish before starting re-registration."
            : `Start an approval-gated re-registration flow for: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: true,
  };
}

export function capabilityBuilderHistoryRepairPlanActionState(
  entry: CapabilityBuilderHistoryEntry,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = entry.relativeRootPath.trim();
  const needsRepair = !entry.valid || entry.errors.length > 0 || entry.warnings.length > 0;
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Planning" : "Plan repair",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before planning generated source repair."
        : `Start a chat-first repair plan for generated source: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: needsRepair,
  };
}

export function buildCapabilityBuilderHistoryPreviewPrompt(entry: CapabilityBuilderHistoryEntry): string {
  const lines = [
    "Preview this preserved generated Ambient capability source.",
    `Package: ${entry.packageName}`,
    `Builder source path: ${entry.relativeRootPath}`,
    `Current history status: ${entry.status}`,
    entry.goal ? `Original goal: ${entry.goal}` : undefined,
    entry.provider ? `Provider/runtime: ${entry.provider}` : undefined,
    entry.refs.lastRepair ? `Last repair ref: ${entry.refs.lastRepair}` : undefined,
    entry.commandNames.length ? `Declared commands: ${entry.commandNames.join(", ")}` : undefined,
    entry.artifactOutputTypes.length ? `Output artifact types: ${entry.artifactOutputTypes.join(", ")}` : undefined,
    entry.unregisteredAt ? `Unregistered at: ${entry.unregisteredAt}` : undefined,
    "Use the Capability Builder management flow.",
    "First call ambient_capability_builder_history for this package, then call ambient_capability_builder_preview for the builder source path.",
    "Summarize validity, errors, warnings, risks, declared commands, env, artifacts, and health checks.",
    "Do not install dependencies, validate, register, unregister, edit files, or change package state.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildCapabilityBuilderHistoryRepairPlanPrompt(entry: CapabilityBuilderHistoryEntry): string {
  const lines = [
    "Plan a repair for this preserved generated Ambient capability source.",
    `Package: ${entry.packageName}`,
    `Builder source path: ${entry.relativeRootPath}`,
    `Current history status: ${entry.status}`,
    `Current static preview validity: ${entry.valid ? "valid" : "invalid"}`,
    entry.goal ? `Original goal: ${entry.goal}` : undefined,
    entry.provider ? `Provider/runtime: ${entry.provider}` : undefined,
    entry.refs.lastRepair ? `Last repair ref: ${entry.refs.lastRepair}` : undefined,
    entry.commandNames.length ? `Declared commands: ${entry.commandNames.join(", ")}` : undefined,
    entry.artifactOutputTypes.length ? `Output artifact types: ${entry.artifactOutputTypes.join(", ")}` : undefined,
    entry.errors.length ? `Current preview errors: ${entry.errors.join("; ")}` : undefined,
    entry.warnings.length ? `Current preview warnings: ${entry.warnings.join("; ")}` : undefined,
    "Use the Capability Builder management flow.",
    "Call ambient_capability_builder_repair_plan for the builder source path. Do not call ambient_capability_builder_history or ambient_capability_builder_preview separately during this repair-planning turn.",
    "Present the returned repair plan before changing anything. The plan should include intended descriptor, SKILL.md, wrapper script, test, dependency, env, artifact, validation, and rollback steps as applicable.",
    ...ttsProviderConversionGuidanceForHistoryEntry(entry),
    ...advancedLocalVoiceRepairGuidance(entry),
    "Do not edit files, install dependencies, validate, register, unregister, delete files, or use generic Ambient CLI install/uninstall tools until I approve a specific next step.",
    "Do not call ambient_capability_builder_register until a later approved validation succeeds for the repaired source.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

function advancedLocalVoiceRepairGuidance(entry: CapabilityBuilderHistoryEntry): string[] {
  const text = [
    entry.packageName,
    entry.goal,
    entry.provider,
    entry.commandNames.join(" "),
    entry.warnings.join(" "),
    entry.errors.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!/(mlx|kokoro)/.test(text)) return [];
  return [
    "Advanced local TTS repair guidance:",
    "- Treat mlx-audio/Kokoro as a pinned-environment repair, not an open-ended package-manager retry loop.",
    "- Plan one pinned Python/runtime strategy before mutation: exact Python version, package pins or lockfile, mlx-audio source/version, model id, optional text-processing deps, and known ABI risks.",
    "- Account for fresh dogfood findings: Kokoro through mlx-audio may require misaki plus transitive text-processing deps such as num2words and spaCy, and naive latest-package installs can hit NumPy/Thinc ABI mismatches.",
    "- The repair plan should include a tiny synthesis smoke test that writes a WAV artifact, a bounded health check that does not download large models repeatedly, and a rollback path to the previous package Git ref.",
    "- If the pinned plan is not viable on the detected host, stop and recommend Piper or a cloud provider instead of continuing dependency retries.",
  ];
}

export function buildCapabilityBuilderHistoryReregisterPrompt(entry: CapabilityBuilderHistoryEntry): string {
  const lines = [
    "Re-register this preserved generated Ambient capability package after approval.",
    `Package: ${entry.packageName}`,
    `Builder source path: ${entry.relativeRootPath}`,
    `Current history status: ${entry.status}`,
    entry.goal ? `Original goal: ${entry.goal}` : undefined,
    entry.provider ? `Provider/runtime: ${entry.provider}` : undefined,
    entry.refs.lastRepair ? `Last repair ref: ${entry.refs.lastRepair}` : undefined,
    entry.refs.lastValidated ? `Last validated ref: ${entry.refs.lastValidated}` : undefined,
    entry.unregisteredAt ? `Unregistered at: ${entry.unregisteredAt}` : undefined,
    "Use the Capability Builder management flow.",
    "First call ambient_capability_builder_history for this package, then call ambient_capability_builder_preview for the builder source path.",
    "If the source is invalid or already installed, stop and report the issue.",
    "If the preview is valid, ask me to approve re-registration; after approval, call ambient_capability_builder_register for the same builder source path.",
    "Do not install dependencies, edit files, delete files, or use generic Ambient CLI install/uninstall tools.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildGeneratedCapabilityValidationPrompt(input: {
  packageName: string;
  generated: AmbientGeneratedCapabilitySummary;
}): string {
  const sourcePath = input.generated.sourcePath?.trim();
  const lines = [
    "Validate this generated Ambient capability package.",
    `Package: ${input.packageName}`,
    sourcePath ? `Builder source path: ${sourcePath}` : undefined,
    input.generated.goal ? `Original goal: ${input.generated.goal}` : undefined,
    input.generated.kind ? `Capability kind: ${input.generated.kind}` : undefined,
    input.generated.provider ? `Provider/runtime: ${input.generated.provider}` : undefined,
    input.generated.outputArtifactTypes.length ? `Output artifact types: ${input.generated.outputArtifactTypes.join(", ")}` : undefined,
    input.generated.refs.lastRepair ? `Last repair ref: ${input.generated.refs.lastRepair}` : undefined,
    input.generated.refs.installed ? `Installed ref: ${input.generated.refs.installed}` : undefined,
    "Use the Capability Builder management flow.",
    ...ttsProviderConversionGuidanceForGeneratedCapability(input.generated),
    "First call ambient_capability_builder_preview for the builder source path and summarize errors, warnings, risks, declared commands, env, artifacts, and health checks.",
    "If the preview is valid, ask me to approve validation; after approval, call ambient_capability_builder_validate for the same source path.",
    "Do not install dependencies, register, rebuild, uninstall, or change files unless I explicitly approve that as a separate step.",
    "After validation, report the validation status, log path, artifact paths, and current git ref.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildGeneratedCapabilityUpdatePlanPrompt(input: {
  packageName: string;
  generated: AmbientGeneratedCapabilitySummary;
}): string {
  const sourcePath = input.generated.sourcePath?.trim();
  const lines = [
    "Plan an update or rebuild for this generated Ambient capability package.",
    `Package: ${input.packageName}`,
    sourcePath ? `Builder source path: ${sourcePath}` : undefined,
    input.generated.goal ? `Original goal: ${input.generated.goal}` : undefined,
    input.generated.kind ? `Capability kind: ${input.generated.kind}` : undefined,
    input.generated.provider ? `Provider/runtime: ${input.generated.provider}` : undefined,
    input.generated.outputArtifactTypes.length ? `Output artifact types: ${input.generated.outputArtifactTypes.join(", ")}` : undefined,
    input.generated.refs.latest ? `Latest source ref: ${input.generated.refs.latest}` : undefined,
    input.generated.refs.lastRepair ? `Last repair ref: ${input.generated.refs.lastRepair}` : undefined,
    input.generated.refs.installed ? `Installed ref: ${input.generated.refs.installed}` : undefined,
    input.generated.refs.lastValidated ? `Last validated ref: ${input.generated.refs.lastValidated}` : undefined,
    "Use the Capability Builder management flow.",
    ...ttsProviderConversionGuidanceForGeneratedCapability(input.generated),
    "Use Capability Builder tools only for package inspection. Do not use shell, browser, ambient_cli, direct filesystem, or package install tools during this planning step.",
    "First inspect the builder source path and current installed/generated provenance, then call ambient_capability_builder_update_plan for the builder source path.",
    "Do not call ambient_capability_builder_preview separately during update planning; ambient_capability_builder_update_plan already includes preview facts.",
    "Propose a concise update/rebuild plan before making any changes. Include intended file changes, dependency commands, env or permission changes, artifact behavior changes, validation plan, registration impact, version/ref handling, rollback point, and user approval checkpoints.",
    "Do not install dependencies, edit files, run validation, register, rebuild, uninstall, or change package state until I approve a specific next step.",
    "If no update is needed, say so and recommend validation instead of making changes.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildGeneratedCapabilityRemovalPlanPrompt(input: {
  packageName: string;
  generated: AmbientGeneratedCapabilitySummary;
}): string {
  const sourcePath = input.generated.sourcePath?.trim();
  const lines = [
    "Plan safe removal or deactivation for this generated Ambient capability package.",
    `Package: ${input.packageName}`,
    sourcePath ? `Builder source path: ${sourcePath}` : undefined,
    input.generated.installedPackageId ? `Installed package id: ${input.generated.installedPackageId}` : undefined,
    input.generated.installedSource ? `Installed source: ${input.generated.installedSource}` : undefined,
    input.generated.goal ? `Original goal: ${input.generated.goal}` : undefined,
    input.generated.outputArtifactTypes.length ? `Output artifact types: ${input.generated.outputArtifactTypes.join(", ")}` : undefined,
    input.generated.refs.lastRepair ? `Last repair ref: ${input.generated.refs.lastRepair}` : undefined,
    input.generated.refs.installed ? `Installed ref: ${input.generated.refs.installed}` : undefined,
    "Use the Capability Builder management flow.",
    "Use Capability Builder tools only for package inspection. Do not use shell, browser, ambient_cli, direct filesystem, or package install tools during this planning step.",
    "First inspect the installed/generated provenance and builder source path, then call ambient_capability_builder_removal_plan.",
    "Do not call ambient_capability_builder_preview separately during removal planning; ambient_capability_builder_removal_plan already includes preview facts when builder source exists.",
    "Propose a concise removal plan before changing anything. Distinguish installed Ambient CLI package state, managed builder source, package Git history, validation logs, generated artifacts, env/secret metadata, and registry visibility.",
    "Recommend the least destructive default: unregister or disable the installed capability while preserving builder source, Git history, validation logs, and artifacts unless I explicitly approve deletion.",
    "If I approve least-destructive unregister/deactivation, call ambient_capability_builder_unregister; do not use generic Ambient CLI uninstall for generated capabilities.",
    "Do not delete files, unregister, disable, edit package state, remove secrets, or change registry/install metadata until I approve a specific next step.",
    "Include rollback steps for restoring the installed capability or re-registering from the preserved builder source.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

function ttsProviderConversionGuidanceForGeneratedCapability(generated: AmbientGeneratedCapabilitySummary): string[] {
  if (
    !isTtsLikeNonProviderCapability({
      installerShape: generated.installerShape,
      kind: generated.kind,
      goal: generated.goal,
      provider: generated.provider,
      commandNames: [],
      outputArtifactTypes: generated.outputArtifactTypes,
      warnings: [],
      errors: [],
    })
  ) {
    return [];
  }
  return ttsProviderConversionGuidanceLines();
}

function ttsProviderConversionGuidanceForHistoryEntry(entry: CapabilityBuilderHistoryEntry): string[] {
  if (
    !isTtsLikeNonProviderCapability({
      installerShape: entry.installerShape,
      kind: entry.kind,
      goal: entry.goal,
      provider: entry.provider,
      commandNames: entry.commandNames,
      outputArtifactTypes: entry.artifactOutputTypes,
      warnings: entry.warnings,
      errors: entry.errors,
    })
  ) {
    return [];
  }
  return ttsProviderConversionGuidanceLines();
}

function ttsProviderConversionGuidanceLines(): string[] {
  return [
    "TTS provider conversion guidance:",
    "- This generated package appears to produce TTS/audio artifacts but is not currently an Ambient chat voice provider.",
    "- If the user wants assistant voice output, read-aloud chat, or provider selection in Settings, do not validate, register, or re-register it as a one-off artifact generator.",
    "- Plan repair with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
    "- The repair should add installerShape tts-provider provenance, descriptor voiceProvider metadata, the normalized --text/--output/--format/--voice command contract, concise JSON stdout, and provider-contract validation before registration.",
  ];
}

function isTtsLikeNonProviderCapability(input: {
  installerShape?: string;
  kind?: string;
  goal?: string;
  provider?: string;
  commandNames: string[];
  outputArtifactTypes: string[];
  warnings: string[];
  errors: string[];
}): boolean {
  if (input.installerShape === "tts-provider") return false;
  const text = [
    input.kind,
    input.goal,
    input.provider,
    ...input.commandNames,
    ...input.outputArtifactTypes,
    ...input.warnings,
    ...input.errors,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    /\b(tts|text[- ]?to[- ]?speech|speech|voice|read aloud|chat voic|spoken|synthesi[sz]e)\b/i.test(text) ||
    input.outputArtifactTypes.some((type) => /^(wav|mp3|ogg)$/i.test(type.trim()))
  );
}

export function pluginAuthCompleteActionState(hasPendingAuth: boolean, code: string, completing: boolean): PluginActionState {
  return {
    label: completing ? "Completing" : "Complete auth",
    disabled: completing || !code.trim(),
    title: hasPendingAuth
      ? code.trim()
        ? "Complete the pending plugin app authorization with this code."
        : "Paste the authorization code from the provider to finish plugin app auth."
      : "Start plugin app auth before completing it.",
    visible: hasPendingAuth,
  };
}

export function pluginDetailsActionState(
  plugin: Pick<AmbientPluginSummary, "id" | "installState" | "enabled" | "trusted">,
  selectedPluginId?: string,
): PluginActionState {
  const selected = selectedPluginId === plugin.id;
  return {
    label: selected ? "Hide details" : "Details",
    disabled: false,
    title: [
      `Install state: ${formatPluginToken(plugin.installState)}.`,
      plugin.enabled ? "Enabled." : "Disabled.",
      plugin.trusted ? "Trusted." : "Trust may be required before executable capabilities run.",
    ].join(" "),
    visible: true,
  };
}

export function mcpServerSearchResultSubtitle(result: AmbientMcpServerSearchResult): string {
  return [
    result.transport ? formatPluginToken(result.transport) : undefined,
    result.tier ? formatPluginToken(result.tier) : undefined,
    result.status ? formatPluginToken(result.status) : undefined,
    result.tools.length ? `${result.tools.length} tool${result.tools.length === 1 ? "" : "s"}` : undefined,
    result.installed ? `installed as ${result.workloadName ?? "Ambient workload"}` : "not installed",
  ]
    .filter((part): part is string => Boolean(part))
    .join(" - ");
}

export function mcpInstalledServerStatusLabel(server: AmbientMcpInstalledServerSummary): string {
  if (server.runtimeListError) return "Runtime status unavailable";
  return server.workloadStatus ? formatPluginToken(server.workloadStatus) : "Status unknown";
}

export function mcpContainerRuntimeStatusLabel(status?: AmbientMcpContainerRuntimeStatusKind): string {
  if (!status) return "Checking";
  if (status === "ready") return "Ready";
  if (status === "installed-not-running") return "Installed, not running";
  if (status === "missing") return "Runtime missing";
  if (status === "unsupported") return "ToolHive unavailable";
  if (status === "blocked-by-permissions") return "Permission repair needed";
  return "Needs review";
}

export function mcpContainerRuntimeTone(status?: AmbientMcpContainerRuntimeStatusKind): "success" | "warning" | "error" | "info" {
  if (!status) return "info";
  if (status === "ready") return "success";
  if (status === "installed-not-running" || status === "missing" || status === "blocked-by-permissions") return "warning";
  return "error";
}

export function mcpContainerRuntimePrimaryActionLabel(status?: AmbientMcpContainerRuntimeStatusKind): string {
  if (!status) return "Refresh status";
  if (status === "ready") return "Refresh status";
  if (status === "installed-not-running") return "Retry after starting runtime";
  if (status === "blocked-by-permissions") return "Open permission repair steps";
  if (status === "missing") return "Refresh after installing runtime";
  if (status === "unsupported") return "Retry ToolHive check";
  return "Refresh status";
}

export function mcpContainerRuntimeDetailRows(status: AmbientMcpContainerRuntimeStatus): string[] {
  return [
    `Runtime: ${status.runtime ? formatPluginToken(status.runtime) : "Not detected"}`,
    `ToolHive: ${mcpContainerRuntimeStatusLabel(status.toolHive.status === "ready" ? "ready" : "unsupported")}`,
    `Next: ${formatPluginToken(status.nextAction)}`,
    ...(status.installPlan ? [`Setup: ${status.installPlan.primaryAction.label}`] : []),
    ...(status.setup.promptSuppressed ? [`Prompt: ${formatPluginToken(status.setup.reason)}`] : []),
    ...(status.setup.userDecision === "install-launched" && status.setup.installActionId
      ? [`Last setup action: ${status.setup.installActionId}`]
      : []),
    ...(status.setup.userDecision === "install-launched" && status.setup.installRuntime
      ? [`Last setup runtime: ${formatPluginToken(status.setup.installRuntime)}`]
      : []),
    `Checked: ${new Date(status.checkedAt).toLocaleString()}`,
    ...(status.processHints ?? []).map((hint) => {
      const location = hint.applicationPath ?? hint.executablePath;
      return [
        `Process: ${formatPluginToken(hint.kind)} ${hint.processName}`,
        location ? `at ${location}` : undefined,
        `confidence ${hint.confidence}`,
      ].filter(Boolean).join(" ");
    }),
    ...status.postInstallQueue.map((item) => `${formatPluginToken(item.capabilityId)}: ${formatPluginToken(item.status)}`),
    ...status.defaultCapabilities.map((item) => `${formatPluginToken(item.capabilityId)} Reconcile: ${formatPluginToken(item.status)}`),
  ];
}

export function mcpContainerRuntimeSetupResumeRows(status: AmbientMcpContainerRuntimeStatus | undefined): string[] {
  const setup = status?.setup;
  if (!setup || setup.userDecision !== "install-launched") return [];
  return [
    setup.installActionId ? `Last setup action: ${setup.installActionId}` : undefined,
    setup.installRuntime ? `Runtime: ${formatPluginToken(setup.installRuntime)}` : undefined,
    setup.installUrl ? `Opened URL: ${setup.installUrl}` : undefined,
    setup.lastDecisionAt ? `Opened at: ${setup.lastDecisionAt}` : undefined,
  ].filter((row): row is string => Boolean(row));
}

export function mcpServerInstallActionState(preview: AmbientMcpInstallPreview | undefined, busyKey?: string): PluginActionState {
  if (!preview) {
    return {
      label: "Install",
      disabled: true,
      visible: false,
      title: "Review an MCP server before installing it.",
    };
  }
  const running = busyKey === `install:${preview.serverId}`;
  if (running) {
    return {
      label: "Installing",
      disabled: true,
      visible: true,
      title: "Installing this MCP server through ToolHive.",
    };
  }
  if (preview.blockers.length > 0 || !preview.runPlan) {
    return {
      label: "Blocked",
      disabled: true,
      visible: true,
      title: preview.blockers[0] ?? "Install blockers must be resolved before this server can run.",
    };
  }
  return {
    label: "Install",
    disabled: false,
    visible: true,
    title: `Install ${preview.title} as ${preview.runPlan.workloadName}.`,
  };
}

export function mcpDefaultCapabilityInstallActionState(
  capability: AmbientMcpDefaultCapabilitySummary | undefined,
  input: { runtimeReady?: boolean; busyKey?: string } = {},
): PluginActionState {
  if (!capability || capability.status === "installed") {
    return {
      label: "Set up",
      disabled: true,
      visible: false,
      title: capability ? `${capability.title} is already installed.` : "No default capability selected.",
    };
  }
  const busy = input.busyKey === `default-capability:${capability.capabilityId}`;
  if (busy || capability.status === "installing" || capability.status === "warming_up") {
    const checking = capability.status === "warming_up" || mcpDefaultCapabilityHasExistingInstallEvidence(capability);
    return {
      label: checking ? "Checking" : "Setting up",
      disabled: true,
      visible: true,
      title: checking
        ? `${capability.title} is being checked with existing Ambient default capability state.`
        : `Installing ${capability.title} through the Ambient default ToolHive runtime path.`,
    };
  }
  if (capability.nextAction === "approve-default-capability" || capability.nextAction === "install-default-capability") {
    const hasExistingInstallEvidence = mcpDefaultCapabilityHasExistingInstallEvidence(capability);
    return {
      label:
        capability.status === "failed"
          ? `Repair ${capability.title}`
          : hasExistingInstallEvidence
            ? `Retry ${capability.title}`
            : `Set up ${capability.title}`,
      disabled: input.runtimeReady !== true,
      visible: true,
      title:
        input.runtimeReady === true
          ? hasExistingInstallEvidence
            ? `Retry ${capability.title} as the Ambient default capability ${capability.workloadName} using the existing install state.`
            : `Install ${capability.title} as the Ambient default capability ${capability.workloadName}.`
          : `${capability.title} is waiting for the isolated MCP runtime to become ready.`,
    };
  }
  if (capability.nextAction === "install-runtime") {
    return {
      label: "Runtime needed",
      disabled: true,
      visible: true,
      title: capability.message,
    };
  }
  if (capability.nextAction === "review-descriptor") {
    return {
      label: "Review needed",
      disabled: true,
      visible: true,
      title: capability.message,
    };
  }
  return {
    label: capability.status === "failed" || capability.nextAction === "inspect-failure" ? `Repair ${capability.title}` : "Inspect",
    disabled: true,
    visible: true,
    title: capability.message,
  };
}

function mcpDefaultCapabilityHasExistingInstallEvidence(capability: AmbientMcpDefaultCapabilitySummary): boolean {
  return Boolean(
    capability.installedEndpoint ||
    capability.installedWorkloadStatus ||
    capability.status === "installing" ||
    capability.status === "warming_up" ||
    capability.status === "failed" ||
    capability.nextAction === "inspect-failure",
  );
}

export function mcpContainerRuntimeDiagnosticsActionState(
  status: AmbientMcpContainerRuntimeStatus | undefined,
  input: { error?: string; busy?: boolean } = {},
): PluginActionState {
  const error = input.error?.trim();
  const defaultCapabilityNeedsAttention = Boolean(
    status?.defaultCapabilities.some(
      (capability) =>
        capability.status === "failed" ||
        capability.status === "blocked_descriptor" ||
        capability.status === "needs_review" ||
        capability.nextAction === "inspect-failure" ||
        capability.nextAction === "review-descriptor",
    ),
  );
  const visible = Boolean(error || (status && status.status !== "ready") || defaultCapabilityNeedsAttention);
  const busy = Boolean(input.busy);
  return {
    label: busy ? "Exporting" : "Export diagnostics",
    disabled: busy || !visible,
    visible,
    title: busy
      ? "Diagnostic export is already running."
      : error
        ? `Export an MCP runtime diagnostic bundle. Current error: ${error}`
        : defaultCapabilityNeedsAttention
          ? "Export an MCP runtime diagnostic bundle with default capability reconciliation state, ToolHive status, and recent app diagnostics."
          : "Export an MCP runtime diagnostic bundle with runtime probe state, host readiness, and recent app diagnostics.",
  };
}

export function mcpContainerRuntimeInstallActionViews(
  status: AmbientMcpContainerRuntimeStatus | undefined,
  input: { launchBusy?: boolean } = {},
): McpContainerRuntimeInstallActionView[] {
  const plan = status?.installPlan;
  if (!plan) return [];
  const actions = [plan.primaryAction, ...plan.alternatives];
  const seen = new Set<string>();
  const uniqueActions = actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
  return uniqueActions.map((action, index) => {
    const commandPreview = action.managedInstall?.commands.map((command) => [command.exe, ...command.args].join(" ")).join(" && ");
    return {
      actionId: action.id,
      label: action.label,
      disabled: Boolean(input.launchBusy),
      visible: true,
      primary: index === 0,
      runtime: action.runtime,
      kind: action.kind,
      busyLabel: action.kind === "managed-install" ? "Installing" : "Opening",
      ...(commandPreview ? { commandPreview } : {}),
      ...(action.managedInstall?.execution ? { managedExecution: action.managedInstall.execution } : {}),
      title:
        action.kind === "managed-install" && action.managedInstall
          ? [
              action.reason,
              `Strategy: ${action.managedInstall.strategy}`,
              `Execution: ${action.managedInstall.execution}`,
              `Commands: ${commandPreview}`,
            ].join("\n")
          : action.reason,
    };
  });
}

export function mcpContainerRuntimeLifecycleActionViews(
  status: AmbientMcpContainerRuntimeStatus | undefined,
  input: { busyKey?: string; disabled?: boolean } = {},
): McpContainerRuntimeLifecycleActionView[] {
  if (!status || status.status === "ready" || status.status === "missing") return [];
  const hasRuntimeTarget = Boolean(
    status.runtime === "docker" ||
    status.runtime === "podman" ||
    status.runtime === "colima" ||
    status.hosts.some((host) => (host.kind === "docker" || host.kind === "podman" || host.kind === "colima") && host.status !== "missing"),
  );
  if (!hasRuntimeTarget) return [];
  const actions: AmbientMcpContainerRuntimeLifecycleAction[] =
    status.status === "installed-not-running" ? ["restart", "force-quit-and-restart", "open-recovery"] : ["open-recovery"];
  return actions.map((action, index) => {
    const previewBusy = input.busyKey === `preview:${action}`;
    const runBusy = input.busyKey === `run:${action}`;
    const busy = previewBusy || runBusy;
    const danger = action === "force-quit-and-restart";
    return {
      action,
      label: busy ? lifecycleBusyLabel(action, previewBusy) : lifecycleActionLabel(action),
      disabled: Boolean(input.disabled || input.busyKey),
      visible: true,
      primary: index === 0,
      danger,
      busyLabel: lifecycleBusyLabel(action, false),
      title: lifecycleActionTitle(action),
    };
  });
}

export function mcpContainerRuntimeLifecycleRunActionState(
  preview: AmbientMcpContainerRuntimeLifecyclePreview | undefined,
  input: { busyKey?: string } = {},
): PluginActionState & { danger: boolean } {
  const action = preview?.action ?? "restart";
  const busy = Boolean(preview && input.busyKey === `run:${preview.action}`);
  const blocked = !preview || preview.status !== "available";
  const force = preview?.action === "force-quit-and-restart";
  return {
    label: busy
      ? lifecycleBusyLabel(action, false)
      : !preview
        ? "Preview first"
        : force
          ? "Confirm force quit and restart"
          : preview.action === "open-recovery"
            ? "Open recovery"
            : "Run restart",
    disabled: busy || blocked || Boolean(input.busyKey && !busy),
    visible: Boolean(preview),
    danger: force,
    title: !preview
      ? "Preview the runtime lifecycle action before running it."
      : blocked
        ? preview.summary
        : force
          ? mcpContainerRuntimeLifecycleForceWarningText
          : preview.summary,
  };
}

export function mcpContainerRuntimeLifecycleStatusView(input: {
  preview?: AmbientMcpContainerRuntimeLifecyclePreview;
  progress?: AmbientMcpContainerRuntimeLifecycleProgress;
  result?: AmbientMcpContainerRuntimeLifecycleResult;
  error?: string;
}): McpContainerRuntimeLifecycleStatusView | undefined {
  if (input.error) return { kind: "error", message: input.error };
  if (input.result) {
    return {
      kind: input.result.status === "ready" || input.result.status === "running" ? "success" : "error",
      message: input.result.message,
    };
  }
  if (input.progress) {
    return {
      kind: input.progress.status === "failed" ? "error" : input.progress.status === "succeeded" ? "success" : "info",
      message: input.progress.message,
    };
  }
  if (input.preview) {
    return {
      kind: input.preview.status === "blocked" ? "error" : "info",
      message: input.preview.summary,
    };
  }
  return undefined;
}

export function mcpContainerRuntimeLifecyclePreviewRows(preview: AmbientMcpContainerRuntimeLifecyclePreview | undefined): string[] {
  if (!preview) return [];
  return [
    `Action: ${formatPluginToken(preview.action)}`,
    `Runtime: ${formatPluginToken(preview.runtime)}`,
    `Platform: ${preview.platform}`,
    `Reason: ${formatPluginToken(preview.reason)}`,
    `Interruption: ${preview.expectedInterruption}`,
    `Targets: ${preview.targets.length}`,
    `Commands: ${preview.commands.length}`,
  ];
}

export function mcpContainerRuntimeLifecycleWarnings(preview: AmbientMcpContainerRuntimeLifecyclePreview | undefined): string[] {
  if (!preview) return [];
  const warnings = [...preview.warnings];
  if (preview.requiresConfirmation && !warnings.includes(mcpContainerRuntimeLifecycleForceWarningText)) {
    warnings.unshift(mcpContainerRuntimeLifecycleForceWarningText);
  }
  return warnings;
}

export function mcpContainerRuntimeLifecycleCommandPreview(command: AmbientMcpContainerRuntimeLifecycleCommand): string {
  return [command.exe, ...command.args].join(" ");
}

function lifecycleActionLabel(action: AmbientMcpContainerRuntimeLifecycleAction): string {
  if (action === "force-quit-and-restart") return "Preview force quit";
  if (action === "open-recovery") return "Preview recovery";
  return "Preview restart";
}

function lifecycleBusyLabel(action: AmbientMcpContainerRuntimeLifecycleAction, previewing: boolean): string {
  if (previewing) return "Previewing";
  if (action === "force-quit-and-restart") return "Force restarting";
  if (action === "open-recovery") return "Opening";
  return "Restarting";
}

function lifecycleActionTitle(action: AmbientMcpContainerRuntimeLifecycleAction): string {
  if (action === "force-quit-and-restart") return mcpContainerRuntimeLifecycleForceWarningText;
  if (action === "open-recovery") return "Preview recovery guidance for this runtime and platform.";
  return "Preview the graceful runtime restart plan before running it.";
}

export function mcpDefaultCapabilityRuntimeHandoffCandidate(
  status: AmbientMcpContainerRuntimeStatus | undefined,
): AmbientMcpDefaultCapabilitySummary | undefined {
  if (!status || status.status !== "ready") return undefined;
  return status.defaultCapabilities.find((capability) => {
    const action = mcpDefaultCapabilityInstallActionState(capability, { runtimeReady: true });
    return (
      action.visible &&
      !action.disabled &&
      (capability.nextAction === "approve-default-capability" || capability.nextAction === "install-default-capability")
    );
  });
}

export function mcpContainerRuntimeShouldOpenStartupPanel(status: AmbientMcpContainerRuntimeStatus | undefined): boolean {
  if (!status) return false;
  if (status.setup.shouldPrompt) return true;
  return Boolean(mcpDefaultCapabilityRuntimeHandoffCandidate(status));
}

export function mcpServerUninstallActionState(server: AmbientMcpInstalledServerSummary, busyKey?: string): PluginActionState {
  const running = busyKey === `uninstall:${server.serverId}:${server.workloadName}`;
  return {
    label: running ? "Removing" : "Uninstall",
    disabled: running,
    visible: true,
    title: running
      ? "Removing this Ambient-managed ToolHive workload."
      : `Stop and remove ${server.workloadName}. Secrets are not deleted.`,
  };
}

export function mcpToolReviewAcceptActionState(server: AmbientMcpInstalledServerSummary, busyKey?: string): PluginActionState {
  const running = busyKey === `tool-review:${server.serverId}:${server.workloadName}`;
  const needsReview = server.toolDescriptorReviewStatus === "needs-review";
  return {
    label: running ? "Trusting" : "Trust tools",
    disabled: running || !needsReview || !server.lastKnownToolDescriptorHash,
    visible: needsReview,
    title: running
      ? "Trusting the current MCP tool descriptor snapshot."
      : !server.lastKnownToolDescriptorHash
        ? "Refresh MCP tool discovery before accepting this descriptor review."
        : "Trust the current tool descriptor snapshot for this installed MCP server.",
  };
}

export function googleWorkspaceConnectorLabel(connectorId: string): string {
  if (connectorId === "google.gmail") return "Gmail";
  if (connectorId === "google.calendar") return "Calendar";
  if (connectorId === "google.drive") return "Drive";
  return connectorId;
}

export function dedupeGoogleWorkspaceAccounts(connectors: AmbientPluginAppAuthSummary[]): AmbientPluginAuthAccountSummary[] {
  const accountsById = new Map<string, AmbientPluginAuthAccountSummary>();
  for (const connector of connectors) {
    for (const account of connector.accounts) {
      accountsById.set(account.accountId, account);
    }
  }
  return [...accountsById.values()];
}

export function googleWorkspaceAccountRows(
  connectors: AmbientPluginAppAuthSummary[],
  formatTime: (value: string) => string = (value) => value,
): GoogleWorkspaceAccountRow[] {
  const connectorLabelsByAccountId = new Map<string, Set<string>>();
  for (const connector of connectors) {
    for (const account of connector.accounts) {
      const labels = connectorLabelsByAccountId.get(account.accountId) ?? new Set<string>();
      labels.add(googleWorkspaceConnectorLabel(connector.connectorId));
      connectorLabelsByAccountId.set(account.accountId, labels);
    }
  }
  return dedupeGoogleWorkspaceAccounts(connectors).map((account) => ({
    id: account.id,
    accountId: account.accountId,
    label: account.label,
    identityLabel: account.email ?? account.label,
    handleLabel: account.accountId === "default" ? "default" : account.accountId,
    email: account.email,
    status: account.status,
    connectorLabels: [...(connectorLabelsByAccountId.get(account.accountId) ?? new Set<string>())],
    lastValidatedLabel: account.lastValidatedAt ? formatTime(account.lastValidatedAt) : undefined,
    validationError: account.validationError,
  }));
}

export function googleWorkspaceStatusItems(
  integration: FirstPartyGoogleIntegrationState | undefined,
  formatTime: (value: string) => string = (value) => value,
): string[] {
  if (!integration) return ["Not loaded"];
  const items = [
    `Auth ${formatPluginToken(integration.authMode)}`,
    `${integration.sidecar.adapter === "gws" ? "gws" : "Sidecar"} ${formatPluginToken(integration.sidecar.state)}`,
    integration.install ? `Install ${formatPluginToken(integration.install.status)}` : undefined,
    integration.setup ? `Setup ${formatPluginToken(integration.setup.status)}` : undefined,
    integration.setup?.oauthClientConfigured === true ? "OAuth client Configured" : undefined,
    integration.setup?.oauthClientConfigured === false ? "OAuth client Required" : undefined,
    integration.sidecar.pending ? `${integration.sidecar.pending} pending` : undefined,
    integration.setup?.startedAt ? `Started ${formatTime(integration.setup.startedAt)}` : undefined,
    integration.setup?.finishedAt ? `Finished ${formatTime(integration.setup.finishedAt)}` : undefined,
  ].filter((item): item is string => Boolean(item));
  return integration.enabled ? items : [...items, "Unavailable"];
}

export function googleWorkspaceValidationFeedbackForAccount(
  feedback: GoogleWorkspaceValidationFeedback | undefined,
  accountId: string | undefined,
): GoogleWorkspaceValidationFeedback | undefined {
  if (!feedback || !accountId) return undefined;
  return feedback.accountId === accountId ? feedback : undefined;
}

export function googleWorkspaceValidationButtonView(
  baseLabel: string,
  feedback: GoogleWorkspaceValidationFeedback | undefined,
): GoogleWorkspaceValidationButtonView {
  if (feedback?.status === "validating") {
    return {
      label: "Validating",
      icon: "spinner",
      tone: "default",
    };
  }
  if (feedback?.status === "validated") {
    return {
      label: "Validated",
      icon: "success",
      tone: "success",
    };
  }
  if (feedback?.status === "failed") {
    return {
      label: "Retry",
      icon: "error",
      tone: "error",
    };
  }
  return {
    label: baseLabel,
    icon: "none",
    tone: "default",
  };
}

export function googleWorkspaceActionState(
  integration: FirstPartyGoogleIntegrationState | undefined,
  action: GoogleWorkspaceActionKind,
  busy?: string,
): PluginActionState {
  const usesGws = integration?.authMode === "gws";
  const sidecarMissing = usesGws && integration?.sidecar.state === "missing";
  const installRunning = integration?.install?.status === "running";
  const setupRunning = integration?.setup?.status === "running" || integration?.setup?.status === "validating";
  const anyBusy = Boolean(busy || installRunning || setupRunning);
  if (action === "install") {
    const installing = busy === "install" || installRunning;
    return {
      label: installing ? "Installing" : "Install gws",
      disabled: !usesGws || installing || Boolean(busy),
      title: usesGws
        ? "Install Ambient's pinned, checksum-verified Google Workspace CLI binary."
        : "Managed gws install is only used by the Google Workspace CLI adapter.",
      visible:
        usesGws &&
        (sidecarMissing || integration?.install?.status === "error" || integration?.install?.status === "unsupported" || installRunning),
    };
  }
  if (action === "connect") {
    return {
      label: busy === "login" ? "Starting" : "Connect account",
      disabled: !usesGws || !integration?.enabled || sidecarMissing || anyBusy,
      title: sidecarMissing
        ? "Install gws before connecting a Google account."
        : "Start Google sign-in in the browser for a local gws account.",
      visible: usesGws,
    };
  }
  if (action === "repair") {
    return {
      label: busy === "setup" ? "Starting" : "Repair setup",
      disabled: !usesGws || !integration?.enabled || sidecarMissing || anyBusy,
      title: sidecarMissing
        ? "Install gws before repairing Google setup."
        : "Run gws auth setup for cases that need OAuth client or project repair.",
      visible: usesGws,
    };
  }
  if (action === "validate") {
    return {
      label: busy === "validate" ? "Validating" : "Validate",
      disabled: !usesGws || !integration?.enabled || sidecarMissing || anyBusy,
      title: sidecarMissing
        ? "Install gws before validating a Google account."
        : "Run identity, Gmail, Calendar, and Drive read probes for this account.",
      visible: usesGws,
    };
  }
  return {
    label: busy === "cancel" ? "Canceling" : "Cancel setup",
    disabled: !setupRunning || busy === "cancel",
    title: setupRunning
      ? "Cancel the in-flight Google Workspace setup or login process."
      : "No Google Workspace setup is currently running.",
    visible: Boolean(usesGws && setupRunning),
  };
}

export function codexMarketplaceAddActionState(source: string, adding: boolean, allowExperimentalUrl = false): PluginActionState {
  if (adding) {
    return {
      label: "Adding",
      disabled: true,
      title: "Ambient is adding this Codex marketplace source.",
      visible: true,
    };
  }
  const trimmed = source.trim();
  if (trimmed && isExperimentalCodexMarketplaceUrl(trimmed) && !allowExperimentalUrl) {
    return {
      label: "Enable advanced URL",
      disabled: true,
      title: "Arbitrary marketplace URLs are experimental. Enable advanced URL sources before adding a non-GitHub remote marketplace.",
      visible: true,
    };
  }
  return {
    label: "Add source",
    disabled: trimmed.length === 0,
    title: trimmed
      ? "Add a local Codex marketplace path, GitHub URL, GitHub owner/repo shorthand, or opted-in advanced URL."
      : "Enter a Codex marketplace path, GitHub URL, owner/repo shorthand, or opted-in advanced URL.",
    visible: true,
  };
}

function isExperimentalCodexMarketplaceUrl(source: string): boolean {
  return /^https?:\/\//i.test(source) && !isGithubMarketplaceUrl(source);
}

function isGithubMarketplaceUrl(source: string): boolean {
  return /^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(source) || /^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/.+/i.test(source);
}

export function codexMarketplaceRemoveActionState(
  source: Pick<CodexMarketplaceSourceSummary, "id" | "removable">,
  removingSourceId?: string,
): PluginActionState {
  if (!source.removable) {
    return {
      label: "Remove",
      disabled: true,
      title: "Built-in and environment-configured marketplace sources cannot be removed from workspace state.",
      visible: false,
    };
  }
  const removingThis = removingSourceId === source.id;
  return {
    label: removingThis ? "Removing" : "Remove",
    disabled: Boolean(removingSourceId),
    title: removingThis
      ? "Ambient is removing this Codex marketplace source."
      : "Remove this Codex marketplace source from Ambient workspace state.",
    visible: true,
  };
}

export function formatAmbientPluginSourceKind(sourceKind: AmbientPluginSummary["sourceKind"]): string {
  if (sourceKind === "codex-workspace") return "Codex workspace";
  if (sourceKind === "codex-cache") return "Codex cache";
  if (sourceKind === "codex-ambient-curated") return "Ambient curated";
  if (sourceKind === "codex-remote-marketplace") return "Codex remote";
  if (sourceKind === "pi-workspace") return "Pi workspace";
  if (sourceKind === "pi-ambient-workspace") return "Pi Ambient workspace";
  if (sourceKind === "pi-ambient-global") return "Pi Ambient global";
  if (sourceKind === "pi-project-settings") return "Pi project";
  if (sourceKind === "pi-user-settings") return "Pi user";
  if (sourceKind === "pi-gallery") return "Pi gallery";
  if (sourceKind === "ambient-cli") return "Ambient CLI";
  return "Ambient built-in";
}

export function formatAmbientCapabilityKind(kind: AmbientPluginCapabilitySummary["kind"]): string {
  if (kind === "mcp-tool") return "MCP tool";
  if (kind === "runtime-extension") return "Runtime extension";
  return formatPluginToken(kind);
}

export function formatAmbientAvailability(availability: AmbientPluginCapabilitySummary["availability"]): string {
  if (availability === "auth-required") return "Needs auth";
  if (availability === "untrusted") return "Needs trust";
  return formatPluginToken(availability);
}

export function formatAmbientRuntimeSupport(runtimes: AmbientPluginCapabilitySummary["runtimeSupport"]): string {
  return runtimes.map((runtime) => formatPluginToken(runtime)).join(", ");
}

export function formatPluginMcpRuntimeEvent(event: PluginMcpRuntimeEvent): string {
  const name = formatPluginMcpRuntimeEventName(event);
  const status = event.status === "succeeded" ? "ok" : event.status === "failed" ? "failed" : "started";
  const target = event.toolName ? `: ${event.toolName}` : "";
  const duration = event.durationMs !== undefined ? ` in ${event.durationMs}ms` : "";
  const detail = event.error ? ` - ${event.error}` : "";
  return `${name}${target} ${status}${duration}${detail}`;
}

export function formatPluginMcpLaunchCommand(input: { command?: string; args: string[] }): string {
  return [input.command ?? "(missing command)", ...input.args].join(" ");
}

function formatPluginMcpRuntimeEventName(event: PluginMcpRuntimeEvent): string {
  if (event.method === "initialize") return "Initialize";
  if (event.method === "tools/list") return "List tools";
  if (event.method === "tools/call") return "Call tool";
  if (event.method === "stderr") return "stderr";
  if (event.method === "crashed") return "Crash";
  if (event.method === "unhealthy") return "Unhealthy";
  if (event.method === "stop") return "Stop";
  if (event.method === "restart") return "Restart";
  return formatPluginToken(event.method);
}

export function workflowPluginRequirementRows(
  grants: WorkflowPluginCapabilityGrant[] | undefined,
  registry?: AmbientPluginRegistry,
): WorkflowPluginRequirementRow[] {
  return (grants ?? []).map((grant) => {
    const capability = registry?.capabilities.find(
      (item) => item.kind === "mcp-tool" && item.pluginId === grant.pluginId && item.serverName === grant.serverName,
    );
    if (!capability) {
      return {
        capabilityId: grant.capabilityId,
        pluginName: grant.pluginName,
        serverName: grant.serverName,
        toolName: grant.toolName,
        registeredName: grant.registeredName,
        availabilityLabel: registry ? "Unavailable" : "Not checked",
        availabilityReason: registry ? "Capability was not found in the plugin registry." : undefined,
        blocked: Boolean(registry),
      };
    }
    const automationSupported = capability.runtimeSupport.includes("automation");
    return {
      capabilityId: grant.capabilityId,
      pluginName: grant.pluginName,
      serverName: grant.serverName,
      toolName: grant.toolName,
      registeredName: grant.registeredName,
      availabilityLabel: automationSupported ? formatAmbientAvailability(capability.availability) : "Not exposed to automations",
      availabilityReason: automationSupported ? capability.availabilityReason : "Capability is not exposed to automations.",
      blocked: !automationSupported || capability.availability !== "available",
    };
  });
}

export function codexImportActionState(
  plugin: Pick<CodexPluginSummary, "compatibilityTier" | "imported" | "sourceKind" | "updateAvailable">,
): PluginActionState {
  const remoteCandidate = plugin.sourceKind === "remote-marketplace";
  const updateAvailable = Boolean(plugin.updateAvailable);
  if (plugin.imported) {
    return {
      label: remoteCandidate ? "Registered" : "Imported",
      disabled: true,
      title: remoteCandidate ? "This remote Codex plugin source is already registered." : "This Codex plugin is already imported.",
      visible: true,
    };
  }
  if (plugin.compatibilityTier === "unsupported") {
    return {
      label: updateAvailable ? "Update" : remoteCandidate ? "Register" : "Import",
      disabled: true,
      title: "Unsupported Codex plugins cannot be imported until Ambient can expose at least one usable capability.",
      visible: true,
    };
  }
  return {
    label: updateAvailable ? "Update" : remoteCandidate ? "Register" : "Import",
    disabled: false,
    title: updateAvailable
      ? "Update this Ambient-imported Codex plugin from its remote marketplace source."
      : remoteCandidate
        ? "Register this remote Codex plugin source in the Ambient workspace marketplace."
        : "Import this Codex plugin into the Ambient workspace marketplace.",
    visible: true,
  };
}

export function piPackageInstallActionState(
  pkg: Pick<PiPackageSummary, "installed" | "packageSpec">,
  installing: boolean,
  scope: PiPackageInstallScope = "workspace",
): PluginActionState {
  if (!pkg.packageSpec) {
    return {
      label: "Install",
      disabled: true,
      title: "No installable Pi package source is available for this entry.",
      visible: false,
    };
  }
  if (pkg.installed) {
    return {
      label: "Installed",
      disabled: true,
      title: "This Pi package is already registered in Ambient-managed package state.",
      visible: false,
    };
  }
  if (installing) {
    return {
      label: "Install",
      disabled: true,
      title: "Another Pi package install is already in progress.",
      visible: true,
    };
  }
  return {
    label: "Install",
    disabled: false,
    title: `Register this Pi package in Ambient-managed ${scope} package state without executing package code.`,
    visible: true,
  };
}

export function piPackageUninstallActionState(
  pkg: Pick<PiPackageSummary, "id" | "installed">,
  uninstallingPackageId?: string,
): PluginActionState {
  if (!pkg.installed) {
    return {
      label: "Uninstall",
      disabled: true,
      title: "Only Ambient-installed Pi packages can be uninstalled from this view.",
      visible: false,
    };
  }
  const uninstallingThis = uninstallingPackageId === pkg.id;
  return {
    label: uninstallingThis ? "Removing" : "Uninstall",
    disabled: Boolean(uninstallingPackageId),
    title: uninstallingThis
      ? "Ambient is removing this Pi package from managed package state."
      : "Remove this Pi package from Ambient-managed package state without changing Pi settings.",
    visible: true,
  };
}

export function piExtensionSandboxUninstallActionState(pkg: { id: string }, uninstallingPackageId?: string): PluginActionState {
  const uninstallingThis = uninstallingPackageId === pkg.id;
  return {
    label: uninstallingThis ? "Removing" : "Uninstall",
    disabled: Boolean(uninstallingPackageId),
    title: uninstallingThis
      ? "Ambient is removing this sandboxed Pi extension package and revoking related grants."
      : "Remove this sandboxed Pi extension package from Ambient-managed state.",
    visible: true,
  };
}

export function piPrivilegedDisableActionState(pkg: { id: string; status: string }, busyPackageId?: string): PluginActionState {
  const busyThis = busyPackageId === pkg.id;
  const disabled = pkg.status === "disabled";
  return {
    label: busyThis ? "Disabling" : "Disable",
    disabled: Boolean(busyPackageId) || disabled,
    title: disabled
      ? "This privileged Pi package is already disabled; no hooks, MCP servers, or commands are active through Ambient."
      : "Disable Ambient-managed privileged registrations without deleting package data.",
    visible: true,
  };
}

export function piPrivilegedUninstallActionState(pkg: { id: string }, busyPackageId?: string): PluginActionState {
  const busyThis = busyPackageId === pkg.id;
  return {
    label: busyThis ? "Removing" : "Uninstall",
    disabled: Boolean(busyPackageId),
    title: busyThis
      ? "Ambient is removing this privileged Pi install and revoking related grants."
      : "Remove this privileged Pi install from Ambient-managed state. Only manifest-owned files are removed.",
    visible: true,
  };
}

export function piPackageEnableActionState(
  pkg: Pick<PiPackageSummary, "installed" | "enabled" | "compatibilityTier" | "resourceCounts">,
  enabling: boolean,
): PluginActionState {
  if (!pkg.installed) {
    return {
      label: "Disabled",
      disabled: true,
      title: "Install this Pi package in Ambient before enabling its declarative resources.",
      visible: false,
    };
  }
  if (pkg.compatibilityTier === "unsupported") {
    return {
      label: pkg.enabled ? "Enabled" : "Disabled",
      disabled: true,
      title: "Unsupported Pi packages cannot be enabled.",
      visible: true,
    };
  }
  if (pkg.resourceCounts.extension > 0) {
    return {
      label: pkg.enabled ? "Enabled" : "Disabled",
      disabled: true,
      title: "Pi packages with extensions cannot be enabled until Ambient has Pi extension trust and sandboxing.",
      visible: true,
    };
  }
  return {
    label: pkg.enabled ? "Enabled" : "Disabled",
    disabled: enabling,
    title: pkg.enabled
      ? "Disable this package's declarative Pi resources for new chat sessions."
      : "Enable declarative Pi resources without running package extension code.",
    visible: true,
  };
}

function formatPluginToken(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
