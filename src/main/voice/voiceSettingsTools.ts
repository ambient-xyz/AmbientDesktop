import type { VoiceLongReplyBehavior, VoiceMode, VoiceOutputFormat, VoiceProviderCandidate, VoiceProviderDynamicVoice, VoiceSettings } from "../../shared/types";

export interface VoiceStatusResult {
  settings: VoiceSettings;
  providers: VoiceProviderCandidate[];
  selectedProvider?: VoiceProviderCandidate;
  selectedVoice?: { id: string; label?: string };
  outputState: VoiceOutputStateSummary;
  preferredVoices: Array<{ providerCapabilityId: string; voiceId: string; providerLabel?: string; voiceLabel?: string }>;
  providerCount: number;
  availableProviderCount: number;
}

export type VoiceOutputState = "not-configured" | "off" | "ready" | "runtime-stopped" | "provider-unavailable";

export interface VoiceOutputStateSummary {
  state: VoiceOutputState;
  label: string;
  detail: string;
}

export interface VoiceSelectInput {
  providerCapabilityId?: string;
  providerAlias?: string;
  voiceId?: string;
  voiceAlias?: string;
  enabled?: boolean;
  autoplay?: boolean;
  format?: VoiceOutputFormat;
  reason?: string;
}

export interface VoiceSelectPlan {
  previousSettings: VoiceSettings;
  nextSettings: VoiceSettings;
  previousProvider?: VoiceProviderCandidate;
  nextProvider: VoiceProviderCandidate;
  previousVoice?: { id: string; label?: string };
  nextVoice?: { id: string; label?: string };
  reason?: string;
  hasChanges: boolean;
}

export interface VoicePolicyInput {
  enabled?: boolean;
  autoplay?: boolean;
  mode?: VoiceMode;
  maxChars?: number;
  longReply?: VoiceLongReplyBehavior;
  artifactCacheMaxMb?: number;
  reason?: string;
}

export interface VoicePolicyPlan {
  previousSettings: VoiceSettings;
  nextSettings: VoiceSettings;
  reason?: string;
  hasChanges: boolean;
}

export interface VoiceClonePlanInput {
  providerCapabilityId?: string;
  providerAlias?: string;
}

export interface VoiceCloneCreatePreviewInput extends VoiceClonePlanInput {
  sourceAudioFiles?: string[];
  consentConfirmed?: boolean;
  cloneName?: string;
  notes?: string;
}

export interface VoiceCloneCreateInput extends VoiceCloneCreatePreviewInput {
  selectCreatedVoice?: boolean;
  reason?: string;
}

export interface VoiceCloneManageInput extends VoiceClonePlanInput {
  voiceId?: string;
  voiceAlias?: string;
  reason?: string;
}

export interface VoiceClonePlanResult {
  provider: VoiceProviderCandidate;
  supported: boolean;
  selected: boolean;
  requirements: string[];
  guardrails: string[];
  nextSteps: string[];
}

export interface VoiceClonePreviewSourceFile {
  path: string;
  bytes: number;
  extension?: string;
}

export interface VoiceCloneCreatePreviewResult extends VoiceClonePlanResult {
  cloneName?: string;
  sourceFiles: VoiceClonePreviewSourceFile[];
  consentConfirmed: boolean;
  readyForCreateApproval: boolean;
  errors: string[];
  warnings: string[];
}

export interface VoiceCloneCreateCommandResult {
  voiceId: string;
  label?: string;
  providerId?: string;
  status?: string;
  cloned?: boolean;
  progressPercent?: number;
  retryAfterSeconds?: number;
  dashboardUrl?: string;
  verificationUrl?: string;
  failureReason?: string;
  localArtifactPaths?: string[];
}

export type VoiceCloneReadiness = "ready" | "pending" | "action-required" | "failed" | "unknown";

export interface VoiceCloneStatusSummary {
  rawStatus?: string;
  readiness: VoiceCloneReadiness;
  readyForSelection: boolean;
  shouldRetryStatus: boolean;
  progressPercent?: number;
  retryAfterSeconds?: number;
  dashboardUrl?: string;
  verificationUrl?: string;
  failureReason?: string;
  localArtifactPaths?: string[];
  cacheStatus?: "present" | "missing";
  missingLocalArtifactPaths?: string[];
  message: string;
  nextSteps: string[];
}

export interface VoiceCloneStatusReconcileInput {
  cachedVoice?: VoiceProviderDynamicVoice;
  localArtifacts?: Array<{ path: string; exists: boolean }>;
}

export interface VoiceCloneDeleteCommandResult {
  voiceId: string;
  deleted: boolean;
  providerId?: string;
  removedArtifactPaths?: string[];
}

export interface VoiceCloneCreatePlan extends VoiceCloneCreatePreviewResult {
  createCommand: string;
  selectCreatedVoice: boolean;
  reason?: string;
}

export interface VoiceCloneManagePlan extends VoiceClonePlanResult {
  voice: { id: string; label?: string };
  statusCommand?: string;
  deleteCommand?: string;
  reason?: string;
}

export function buildVoiceStatus(settings: VoiceSettings, providers: VoiceProviderCandidate[]): VoiceStatusResult {
  const selectedProvider = providers.find((provider) => provider.capabilityId === settings.providerCapabilityId);
  const selectedVoice = selectedProvider?.voices.find((voice) => voice.id === settings.voiceId);
  const preferredVoices = preferredVoiceRows(settings, providers);
  return {
    settings,
    providers,
    ...(selectedProvider ? { selectedProvider } : {}),
    ...(selectedVoice ? { selectedVoice } : {}),
    outputState: voiceOutputState(settings, selectedProvider),
    preferredVoices,
    providerCount: providers.length,
    availableProviderCount: providers.filter((provider) => provider.available).length,
  };
}

export function voiceOutputState(settings: VoiceSettings, selectedProvider?: VoiceProviderCandidate): VoiceOutputStateSummary {
  if (!selectedProvider) {
    return {
      state: "not-configured",
      label: "not configured",
      detail: "No TTS provider is selected for assistant voice output.",
    };
  }
  const runtime = selectedProvider.diagnostics?.runtimeState;
  if (runtime?.status === "stopped") {
    return {
      state: "runtime-stopped",
      label: "runtime stopped",
      detail: `${selectedProvider.label} is selected, but its local voice runtime is stopped. ${runtime.reason ?? selectedProvider.availabilityReason}`.trim(),
    };
  }
  if (!selectedProvider.available) {
    return {
      state: "provider-unavailable",
      label: "provider unavailable",
      detail: `${selectedProvider.label} is selected but cannot synthesize new voice right now. ${selectedProvider.availabilityReason}`.trim(),
    };
  }
  if (!settings.enabled) {
    const locality = selectedProvider.local ? "local " : selectedProvider.local === false ? "cloud " : "";
    return {
      state: "off",
      label: "off",
      detail: `${selectedProvider.label} is the selected ${locality}TTS provider, but Ambient voice output is disabled.`,
    };
  }
  return {
    state: "ready",
    label: "ready",
    detail: `${selectedProvider.label} is selected and available for assistant voice synthesis.`,
  };
}

export function buildVoiceClonePlan(input: VoiceClonePlanInput, current: VoiceSettings, providers: VoiceProviderCandidate[]): VoiceClonePlanResult {
  const provider = resolveVoiceProvider(input, current, providers);
  const cloning = provider.voiceCloning;
  const supported = cloning?.supported === true;
  const requirements = supported
    ? [
        `Provider: ${provider.label} (${provider.capabilityId})`,
        `Mode: ${cloning.mode ?? "unspecified"}`,
        cloning.createCommand ? `Create command: ${cloning.createCommand}` : "Create command: not declared",
        cloning.inputs?.audioFormats.length ? `Accepted audio formats: ${cloning.inputs.audioFormats.join(", ")}` : "Accepted audio formats: not specified",
        cloning.inputs?.minDurationSeconds !== undefined ? `Minimum source duration: ${cloning.inputs.minDurationSeconds}s` : undefined,
        cloning.inputs?.maxDurationSeconds !== undefined ? `Maximum source duration: ${cloning.inputs.maxDurationSeconds}s` : undefined,
        cloning.inputs?.minSamples !== undefined ? `Minimum samples: ${cloning.inputs.minSamples}` : undefined,
        cloning.inputs?.maxSamples !== undefined ? `Maximum samples: ${cloning.inputs.maxSamples}` : undefined,
        cloning.inputs?.transcript ? `Transcript: ${cloning.inputs.transcript}` : undefined,
        cloning.requiresSecret?.length ? `Required secrets: ${cloning.requiresSecret.join(", ")}` : undefined,
        cloning.networkHosts?.length ? `Network hosts: ${cloning.networkHosts.join(", ")}` : undefined,
        cloning.costNote ? `Cost note: ${cloning.costNote}` : undefined,
        cloning.privacyNote ? `Privacy note: ${cloning.privacyNote}` : undefined,
        cloning.output?.creates.length ? `Clone output: ${cloning.output.creates.join(", ")}` : undefined,
        cloning.output?.appearsInDynamicCatalog !== undefined ? `Appears in dynamic voice catalog: ${cloning.output.appearsInDynamicCatalog}` : undefined,
      ].filter((item): item is string => Boolean(item))
    : [
        `Provider: ${provider.label} (${provider.capabilityId})`,
        "This provider does not declare voice cloning support.",
      ];
  return {
    provider,
    supported,
    selected: current.providerCapabilityId === provider.capabilityId,
    requirements,
    guardrails: [
      "Voice cloning is not performed by this read-only plan.",
      "Do not call provider CLIs, shell commands, browser tools, or cloud APIs to create a clone from this plan.",
      "Before any clone creation, the user must explicitly confirm they have rights and consent for every source audio sample.",
      "Source audio must come from user-selected workspace files or Ambient artifacts, not pasted chat text or hidden recordings.",
      "Cloud cloning must disclose network upload, privacy, retention, and cost implications before approval.",
      "Local cloning must disclose expected runtime, disk usage, model assets, and hardware fit before approval.",
    ],
    nextSteps: supported
      ? [
          "Ask the user which source audio files or managed artifacts they want to use.",
          "Ask for explicit consent/rights confirmation before any create workflow.",
          "Check required secrets or local assets before planning clone creation.",
          "Use a future Ambient clone-create workflow for creation; do not improvise with raw provider tools.",
        ]
      : [
          "Offer to choose a different installed voice provider that declares cloning support.",
          "If the user wants this provider to support cloning, use Capability Builder repair/onboarding to add reviewed metadata and implementation later.",
        ],
  };
}

export function buildVoiceCloneCreatePreview(
  input: VoiceCloneCreatePreviewInput,
  current: VoiceSettings,
  providers: VoiceProviderCandidate[],
  sourceFiles: VoiceClonePreviewSourceFile[],
): VoiceCloneCreatePreviewResult {
  const plan = buildVoiceClonePlan(input, current, providers);
  const cloning = plan.provider.voiceCloning;
  const errors: string[] = [];
  const warnings: string[] = [];
  const consentConfirmed = input.consentConfirmed === true;
  if (!plan.supported) errors.push(`Provider "${plan.provider.label}" does not declare voice cloning support.`);
  if (!consentConfirmed) errors.push("Explicit user consent/rights confirmation is required before clone creation can be previewed for approval.");
  if (!sourceFiles.length) errors.push("At least one user-selected workspace audio file is required.");
  const inputs = cloning?.inputs;
  const acceptedFormats = new Set((inputs?.audioFormats ?? []).map((format) => format.trim().replace(/^\./, "").toLowerCase()).filter(Boolean));
  if (acceptedFormats.size) {
    for (const file of sourceFiles) {
      if (!file.extension || !acceptedFormats.has(file.extension)) {
        errors.push(`Source file "${file.path}" is not one of the accepted formats: ${Array.from(acceptedFormats).join(", ")}.`);
      }
    }
  }
  if (inputs?.minSamples !== undefined && sourceFiles.length < inputs.minSamples) {
    errors.push(`At least ${inputs.minSamples} source sample${inputs.minSamples === 1 ? "" : "s"} required.`);
  }
  if (inputs?.maxSamples !== undefined && sourceFiles.length > inputs.maxSamples) {
    errors.push(`At most ${inputs.maxSamples} source sample${inputs.maxSamples === 1 ? "" : "s"} allowed.`);
  }
  if (!input.cloneName?.trim()) warnings.push("No cloneName supplied; a future create workflow should ask for a user-visible voice name.");
  if (inputs?.minDurationSeconds !== undefined || inputs?.maxDurationSeconds !== undefined) {
    warnings.push("Audio duration has not been measured in this preview; the create workflow must verify duration before upload/training.");
  }
  if (cloning?.mode === "cloud") warnings.push("Cloud clone creation will require a separate approval before any source audio upload.");
  if (cloning?.mode === "local") warnings.push("Local clone creation will require a separate approval before any model training or file generation.");
  return {
    ...plan,
    ...(input.cloneName?.trim() ? { cloneName: input.cloneName.trim() } : {}),
    sourceFiles,
    consentConfirmed,
    readyForCreateApproval: errors.length === 0,
    errors,
    warnings,
    nextSteps: errors.length === 0
      ? [
          "Show this preview to the user before any clone creation.",
          "Request explicit approval for the future clone-create operation.",
          "Only after approval may Ambient run a provider-specific clone workflow.",
          "After creation, refresh the provider voice catalog and select the new exact voice id only if the user asks.",
        ]
      : plan.nextSteps,
  };
}

export function buildVoiceCloneCreatePlan(
  input: VoiceCloneCreateInput,
  current: VoiceSettings,
  providers: VoiceProviderCandidate[],
  sourceFiles: VoiceClonePreviewSourceFile[],
): VoiceCloneCreatePlan {
  const preview = buildVoiceCloneCreatePreview(input, current, providers, sourceFiles);
  const createCommand = preview.provider.voiceCloning?.createCommand?.trim();
  if (!preview.readyForCreateApproval) {
    throw new Error(`Voice clone create is not ready for approval: ${preview.errors.join("; ")}`);
  }
  if (!createCommand) {
    throw new Error(`Voice provider "${preview.provider.label}" declares cloning metadata but no reviewed createCommand.`);
  }
  if (createCommand !== preview.provider.command) {
    throw new Error(`Voice provider "${preview.provider.label}" clone createCommand "${createCommand}" is not the installed provider command "${preview.provider.command}".`);
  }
  if (!preview.cloneName) {
    throw new Error("cloneName is required for voice clone creation.");
  }
  return {
    ...preview,
    createCommand,
    selectCreatedVoice: input.selectCreatedVoice === true,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  };
}

export function parseVoiceCloneCreateStdout(stdout: string | undefined): VoiceCloneCreateCommandResult {
  if (!stdout?.trim()) throw new Error("Voice clone create command did not return JSON metadata.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Voice clone create command did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Voice clone create command JSON must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  const voiceId = stringValue(record.voiceId) ?? stringValue(record.voice_id) ?? stringValue(record.id) ?? stringValue(record.providerVoiceId);
  if (!voiceId) throw new Error("Voice clone create command JSON must include voiceId.");
  return {
    voiceId,
    ...(stringValue(record.label) ?? stringValue(record.name) ? { label: stringValue(record.label) ?? stringValue(record.name) } : {}),
    ...(stringValue(record.providerId) ? { providerId: stringValue(record.providerId) } : {}),
    ...(stringValue(record.status) ? { status: stringValue(record.status) } : {}),
    ...(typeof record.cloned === "boolean" ? { cloned: record.cloned } : {}),
    ...cloneStatusMetadata(record),
  };
}

export function summarizeVoiceCloneStatus(
  provider: VoiceProviderCandidate,
  result: VoiceCloneCreateCommandResult,
  reconcile: VoiceCloneStatusReconcileInput = {},
): VoiceCloneStatusSummary {
  const providerId = normalizeAlias(result.providerId ?? provider.providerId ?? provider.packageName);
  const rawStatus = result.status;
  const normalizedStatus = normalizeStatus(rawStatus);
  const readiness = voiceCloneReadiness(providerId, normalizedStatus);
  const cacheStatus = result.cloned === true ? reconcile.cachedVoice ? "present" : "missing" : undefined;
  const missingLocalArtifactPaths = (reconcile.localArtifacts ?? []).filter((artifact) => !artifact.exists).map((artifact) => artifact.path);
  return {
    ...(rawStatus ? { rawStatus } : {}),
    readiness,
    readyForSelection: readiness === "ready" && missingLocalArtifactPaths.length === 0,
    shouldRetryStatus: readiness === "pending" || readiness === "unknown",
    ...(result.progressPercent !== undefined ? { progressPercent: result.progressPercent } : {}),
    ...(result.retryAfterSeconds !== undefined ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    ...(result.dashboardUrl ? { dashboardUrl: result.dashboardUrl } : {}),
    ...(result.verificationUrl ? { verificationUrl: result.verificationUrl } : {}),
    ...(result.failureReason ? { failureReason: result.failureReason } : {}),
    ...(result.localArtifactPaths?.length ? { localArtifactPaths: result.localArtifactPaths } : {}),
    ...(cacheStatus ? { cacheStatus } : {}),
    ...(missingLocalArtifactPaths.length ? { missingLocalArtifactPaths } : {}),
    message: voiceCloneStatusMessage(provider.label, readiness, rawStatus, result),
    nextSteps: voiceCloneStatusNextSteps(provider.label, readiness, providerId, result, { cacheStatus, missingLocalArtifactPaths }),
  };
}

export function buildVoiceCloneManagePlan(
  input: VoiceCloneManageInput,
  current: VoiceSettings,
  providers: VoiceProviderCandidate[],
): VoiceCloneManagePlan {
  const plan = buildVoiceClonePlan(input, current, providers);
  if (!plan.supported) throw new Error(`Voice provider "${plan.provider.label}" does not declare voice cloning support.`);
  const voice = resolveManagedCloneVoice(plan.provider, input, current.voiceId);
  return {
    ...plan,
    voice,
    ...(plan.provider.voiceCloning?.statusCommand?.trim() ? { statusCommand: plan.provider.voiceCloning.statusCommand.trim() } : {}),
    ...(plan.provider.voiceCloning?.deleteCommand?.trim() ? { deleteCommand: plan.provider.voiceCloning.deleteCommand.trim() } : {}),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  };
}

export function parseVoiceCloneDeleteStdout(stdout: string | undefined, expectedVoiceId: string): VoiceCloneDeleteCommandResult {
  if (!stdout?.trim()) return { voiceId: expectedVoiceId, deleted: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Voice clone delete command did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Voice clone delete command JSON must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  const voiceId = stringValue(record.voiceId) ?? stringValue(record.voice_id) ?? stringValue(record.id) ?? expectedVoiceId;
  const deleted = record.deleted === undefined ? true : record.deleted === true;
  return {
    voiceId,
    deleted,
    ...(stringValue(record.providerId) ? { providerId: stringValue(record.providerId) } : {}),
    ...deleteArtifactMetadata(record),
  };
}

export function planVoiceSelection(input: VoiceSelectInput, current: VoiceSettings, providers: VoiceProviderCandidate[]): VoiceSelectPlan {
  const previousProvider = current.providerCapabilityId
    ? providers.find((provider) => provider.capabilityId === current.providerCapabilityId)
    : undefined;
  const nextProvider = resolveVoiceProvider(input, current, providers);
  if (!nextProvider.available) {
    throw new Error(`Voice provider "${nextProvider.label}" is not available: ${nextProvider.availabilityReason}`);
  }

  const previousVoice = previousProvider?.voices.find((voice) => voice.id === current.voiceId);
  const nextVoice = resolveVoice(
    nextProvider,
    input,
    current.providerCapabilityId === nextProvider.capabilityId ? current.voiceId : undefined,
    current.preferredVoicesByProvider?.[nextProvider.capabilityId],
  );
  const nextFormat = resolveVoiceFormat(nextProvider, input.format, current.format);
  const preferredVoicesByProvider = nextVoice
    ? {
        ...(current.preferredVoicesByProvider ?? {}),
        [nextProvider.capabilityId]: nextVoice.id,
      }
    : current.preferredVoicesByProvider;
  const nextSettings: VoiceSettings = {
    ...current,
    ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
    ...(typeof input.autoplay === "boolean" ? { autoplay: input.autoplay } : {}),
    providerCapabilityId: nextProvider.capabilityId,
    ...(nextVoice ? { voiceId: nextVoice.id } : {}),
    ...(preferredVoicesByProvider ? { preferredVoicesByProvider } : {}),
    format: nextFormat,
  };

  return {
    previousSettings: current,
    nextSettings,
    ...(previousProvider ? { previousProvider } : {}),
    nextProvider,
    ...(previousVoice ? { previousVoice } : {}),
    ...(nextVoice ? { nextVoice } : {}),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    hasChanges: !voiceSettingsEqual(current, nextSettings),
  };
}

export function voiceStatusText(status: VoiceStatusResult): string {
  const selectedProvider = status.selectedProvider
    ? `${status.selectedProvider.label} (${status.selectedProvider.capabilityId})`
    : status.settings.providerCapabilityId
      ? `Unknown provider (${status.settings.providerCapabilityId})`
      : "None";
  const selectedVoice = status.selectedVoice
    ? voiceLabel(status.selectedVoice)
    : status.settings.voiceId
      ? status.settings.voiceId
      : "None";
  const providers = status.providers.length
    ? status.providers
        .map((provider) => {
          const voices = provider.voices.length ? provider.voices.map(voiceLabel).join(", ") : "none declared";
          const preferredVoiceId = status.settings.preferredVoicesByProvider?.[provider.capabilityId];
          const preferredVoice = preferredVoiceId ? provider.voices.find((voice) => voice.id === preferredVoiceId) : undefined;
          const preferred = preferredVoiceId ? `; preferredVoice=${preferredVoice ? voiceLabel(preferredVoice) : preferredVoiceId}` : "";
          const cloning = provider.voiceCloning
            ? `; voiceCloning=${provider.voiceCloning.supported ? ["supported", provider.voiceCloning.mode, provider.voiceCloning.requiresConsent !== undefined ? `consent=${provider.voiceCloning.requiresConsent}` : undefined].filter(Boolean).join(",") : "not-supported"}`
            : "";
          return `- ${provider.label}: id=${provider.capabilityId}; package=${provider.packageName}; command=${provider.command}; available=${provider.available}; format=${provider.format}${preferred}${cloning}; voices=${voices}`;
        })
        .join("\n")
    : "- No installed voice providers discovered.";
  const preferredVoiceText = status.preferredVoices.length
    ? status.preferredVoices
        .map((preference) => {
          const provider = preference.providerLabel ? `${preference.providerLabel} (${preference.providerCapabilityId})` : preference.providerCapabilityId;
          const voice = preference.voiceLabel ? `${preference.voiceLabel} (${preference.voiceId})` : preference.voiceId;
          return `- ${provider}: ${voice}`;
        })
        .join("\n")
    : "- None recorded yet.";
  return [
    "Ambient voice status",
    `Enabled: ${status.settings.enabled}`,
    `Mode: ${status.settings.mode}`,
    `Autoplay: ${status.settings.autoplay}`,
    `Output state: ${status.outputState.label}`,
    `Output detail: ${status.outputState.detail}`,
    `Selected provider: ${selectedProvider}`,
    `Selected voice: ${selectedVoice}`,
    `Output format: ${status.settings.format}`,
    `Long reply: ${status.settings.longReply}`,
    `Max chars: ${status.settings.maxChars}`,
    `Artifact cache max MB: ${status.settings.artifactCacheMaxMb}`,
    "Preferred voices by provider:",
    preferredVoiceText,
    `Providers: ${status.availableProviderCount}/${status.providerCount} available`,
    providers,
    "Use ambient_voice_select with exact providerCapabilityId and voiceId values from this output to change provider, voice, or format.",
    "Use ambient_voice_policy_update to change enabled, autoplay, mode, longReply, maxChars, or artifactCacheMaxMb.",
  ].join("\n");
}

export function voiceClonePlanText(plan: VoiceClonePlanResult): string {
  return [
    "Ambient voice clone plan",
    `Provider: ${plan.provider.label} (${plan.provider.capabilityId})`,
    `Selected provider: ${plan.selected}`,
    `Voice cloning supported: ${plan.supported}`,
    "",
    "Requirements:",
    ...plan.requirements.map((item) => `- ${item}`),
    "",
    "Guardrails:",
    ...plan.guardrails.map((item) => `- ${item}`),
    "",
    "Next steps:",
    ...plan.nextSteps.map((item) => `- ${item}`),
  ].join("\n");
}

export function voiceCloneCreatePreviewText(preview: VoiceCloneCreatePreviewResult): string {
  return [
    "Ambient voice clone create preview",
    `Provider: ${preview.provider.label} (${preview.provider.capabilityId})`,
    `Voice cloning supported: ${preview.supported}`,
    `Consent confirmed: ${preview.consentConfirmed}`,
    `Ready for create approval: ${preview.readyForCreateApproval}`,
    preview.cloneName ? `Clone name: ${preview.cloneName}` : "Clone name: not provided",
    "",
    "Source audio files:",
    ...(preview.sourceFiles.length
      ? preview.sourceFiles.map((file) => `- ${file.path} (${file.extension ?? "unknown"}; ${file.bytes.toLocaleString()} bytes)`)
      : ["- None"]),
    "",
    "Requirements:",
    ...preview.requirements.map((item) => `- ${item}`),
    ...(preview.errors.length ? ["", "Errors:", ...preview.errors.map((item) => `- ${item}`)] : []),
    ...(preview.warnings.length ? ["", "Warnings:", ...preview.warnings.map((item) => `- ${item}`)] : []),
    "",
    "Guardrails:",
    ...preview.guardrails.map((item) => `- ${item}`),
    "",
    "Next steps:",
    ...preview.nextSteps.map((item) => `- ${item}`),
    "",
    "No audio was uploaded, no model was trained, and no cloned voice was created.",
  ].join("\n");
}

export function voiceCloneCreateApprovalDetail(plan: VoiceCloneCreatePlan, workspacePath: string): string {
  const cloning = plan.provider.voiceCloning;
  return [
    `Workspace: ${workspacePath}`,
    `Provider: ${plan.provider.label} (${plan.provider.capabilityId})`,
    `Command: ${plan.createCommand} --clone-create`,
    `Clone name: ${plan.cloneName}`,
    `Source files: ${plan.sourceFiles.map((file) => `${file.path} (${file.bytes.toLocaleString()} bytes)`).join(", ")}`,
    `Consent confirmed: ${plan.consentConfirmed}`,
    `Mode: ${cloning?.mode ?? "unspecified"}`,
    cloning?.networkHosts?.length ? `Network hosts: ${cloning.networkHosts.join(", ")}` : undefined,
    cloning?.requiresSecret?.length ? `Required secrets: ${cloning.requiresSecret.join(", ")}` : undefined,
    cloning?.privacyNote ? `Privacy: ${cloning.privacyNote}` : undefined,
    cloning?.costNote ? `Cost: ${cloning.costNote}` : undefined,
    `Select created voice after creation: ${plan.selectCreatedVoice}`,
    plan.reason ? `Reason: ${plan.reason}` : undefined,
    "No clone will be created unless this approval is granted.",
  ].filter(Boolean).join("\n");
}

export function voiceCloneCreateText(
  plan: VoiceCloneCreatePlan,
  commandResult: VoiceCloneCreateCommandResult,
  options: { selected: boolean; cacheUpdated: boolean; durationMs: number; stdoutArtifactPath?: string; stderrArtifactPath?: string },
): string {
  return [
    "Ambient voice clone created",
    `Provider: ${plan.provider.label} (${plan.provider.capabilityId})`,
    `Voice: ${commandResult.label ? `${commandResult.label} (${commandResult.voiceId})` : commandResult.voiceId}`,
    commandResult.status ? `Provider status: ${commandResult.status}` : undefined,
    commandResult.localArtifactPaths?.length ? `Local artifacts: ${commandResult.localArtifactPaths.join(", ")}` : undefined,
    `Dynamic voice cache updated: ${options.cacheUpdated}`,
    `Selected for chat voice: ${options.selected}`,
    `Duration: ${options.durationMs} ms`,
    options.stdoutArtifactPath ? `Full stdout: ${options.stdoutArtifactPath}` : undefined,
    options.stderrArtifactPath ? `Full stderr: ${options.stderrArtifactPath}` : undefined,
    "Use ambient_voice_list_voices to inspect the cached cloned voice, or ambient_voice_select with this exact voiceId to use it later.",
  ].filter(Boolean).join("\n");
}

export function voiceCloneStatusText(plan: VoiceCloneManagePlan, result: VoiceCloneCreateCommandResult, reconcile: VoiceCloneStatusReconcileInput = {}): string {
  const summary = summarizeVoiceCloneStatus(plan.provider, result, reconcile);
  return [
    "Ambient voice clone status",
    `Provider: ${plan.provider.label} (${plan.provider.capabilityId})`,
    `Voice: ${result.label ? `${result.label} (${result.voiceId})` : result.voiceId}`,
    result.status ? `Provider status: ${result.status}` : "Provider status: not reported",
    `Readiness: ${summary.readiness}`,
    `Ready for chat selection: ${summary.readyForSelection}`,
    `Retry status later: ${summary.shouldRetryStatus}`,
    summary.progressPercent !== undefined ? `Progress: ${summary.progressPercent}%` : undefined,
    summary.retryAfterSeconds !== undefined ? `Retry after: ${summary.retryAfterSeconds}s` : undefined,
    summary.dashboardUrl ? `Provider dashboard: ${summary.dashboardUrl}` : undefined,
    summary.verificationUrl ? `Provider verification: ${summary.verificationUrl}` : undefined,
    summary.failureReason ? `Failure reason: ${summary.failureReason}` : undefined,
    summary.cacheStatus ? `Dynamic cache: ${summary.cacheStatus}` : undefined,
    summary.localArtifactPaths?.length ? `Local artifacts: ${summary.localArtifactPaths.join(", ")}` : undefined,
    summary.missingLocalArtifactPaths?.length ? `Missing local artifacts: ${summary.missingLocalArtifactPaths.join(", ")}` : undefined,
    `Cloned: ${result.cloned === undefined ? "unknown" : result.cloned}`,
    `Summary: ${summary.message}`,
    "Next steps:",
    ...summary.nextSteps.map((step) => `- ${step}`),
    "This status check did not create, delete, or select a voice.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function voiceCloneDeleteApprovalDetail(plan: VoiceCloneManagePlan, workspacePath: string): string {
  const cloning = plan.provider.voiceCloning;
  return [
    `Workspace: ${workspacePath}`,
    `Provider: ${plan.provider.label} (${plan.provider.capabilityId})`,
    `Command: ${plan.deleteCommand ?? "not declared"} --clone-delete`,
    `Voice: ${voiceLabel(plan.voice)}`,
    cloning?.mode ? `Mode: ${cloning.mode}` : undefined,
    cloning?.networkHosts?.length ? `Network hosts: ${cloning.networkHosts.join(", ")}` : undefined,
    `Reason: ${plan.reason ?? "User requested cloned voice deletion."}`,
    "This may permanently remove provider-side or local cloned voice assets and cannot be undone by Ambient.",
  ].filter(Boolean).join("\n");
}

export function voiceCloneDeleteText(
  plan: VoiceCloneManagePlan,
  result: VoiceCloneDeleteCommandResult,
  options: { cacheUpdated: boolean; selectedVoiceCleared: boolean; durationMs: number; stdoutArtifactPath?: string; stderrArtifactPath?: string },
): string {
  return [
    "Ambient voice clone deleted",
    `Provider: ${plan.provider.label} (${plan.provider.capabilityId})`,
    `Voice: ${voiceLabel(plan.voice)}`,
    `Provider reported deleted: ${result.deleted}`,
    result.removedArtifactPaths?.length ? `Removed local artifacts: ${result.removedArtifactPaths.join(", ")}` : undefined,
    `Dynamic voice cache updated: ${options.cacheUpdated}`,
    `Selected voice cleared: ${options.selectedVoiceCleared}`,
    `Duration: ${options.durationMs} ms`,
    options.stdoutArtifactPath ? `Full stdout: ${options.stdoutArtifactPath}` : undefined,
    options.stderrArtifactPath ? `Full stderr: ${options.stderrArtifactPath}` : undefined,
  ].filter(Boolean).join("\n");
}

export function voiceSelectText(plan: VoiceSelectPlan, savedSettings: VoiceSettings): string {
  const previousProvider = plan.previousProvider ? `${plan.previousProvider.label} (${plan.previousProvider.capabilityId})` : "None";
  const nextProvider = `${plan.nextProvider.label} (${plan.nextProvider.capabilityId})`;
  const previousVoice = plan.previousVoice ? voiceLabel(plan.previousVoice) : plan.previousSettings.voiceId ?? "None";
  const nextVoice = plan.nextVoice ? voiceLabel(plan.nextVoice) : savedSettings.voiceId ?? "None";
  return [
    "Ambient voice settings updated",
    `Provider: ${previousProvider} -> ${nextProvider}`,
    `Voice: ${previousVoice} -> ${nextVoice}`,
    `Enabled: ${plan.previousSettings.enabled} -> ${savedSettings.enabled}`,
    `Autoplay: ${plan.previousSettings.autoplay} -> ${savedSettings.autoplay}`,
    `Format: ${plan.previousSettings.format} -> ${savedSettings.format}`,
  ].join("\n");
}

export function voiceSelectNoopText(plan: VoiceSelectPlan): string {
  const provider = `${plan.nextProvider.label} (${plan.nextProvider.capabilityId})`;
  const voice = plan.nextVoice ? voiceLabel(plan.nextVoice) : plan.nextSettings.voiceId ?? "None";
  return [
    "Ambient voice settings already configured",
    `Provider: ${provider}`,
    `Voice: ${voice}`,
    `Format: ${plan.nextSettings.format}`,
    "No settings were changed and no approval was required.",
  ].join("\n");
}

export function voiceSelectApprovalDetail(plan: VoiceSelectPlan, workspacePath: string): string {
  const previousProvider = plan.previousProvider ? `${plan.previousProvider.label} (${plan.previousProvider.capabilityId})` : "None";
  const nextProvider = `${plan.nextProvider.label} (${plan.nextProvider.capabilityId})`;
  const previousVoice = plan.previousVoice ? voiceLabel(plan.previousVoice) : plan.previousSettings.voiceId ?? "None";
  const nextVoice = plan.nextVoice ? voiceLabel(plan.nextVoice) : plan.nextSettings.voiceId ?? "None";
  return [
    `Workspace: ${workspacePath}`,
    `Provider: ${previousProvider} -> ${nextProvider}`,
    `Voice: ${previousVoice} -> ${nextVoice}`,
    `Enabled: ${plan.previousSettings.enabled} -> ${plan.nextSettings.enabled}`,
    `Autoplay: ${plan.previousSettings.autoplay} -> ${plan.nextSettings.autoplay}`,
    `Format: ${plan.previousSettings.format} -> ${plan.nextSettings.format}`,
    plan.reason ? `Reason: ${plan.reason}` : undefined,
  ].filter(Boolean).join("\n");
}

export function planVoicePolicyUpdate(input: VoicePolicyInput, current: VoiceSettings): VoicePolicyPlan {
  const hasChange =
    typeof input.enabled === "boolean" ||
    typeof input.autoplay === "boolean" ||
    input.mode !== undefined ||
    input.maxChars !== undefined ||
    input.longReply !== undefined ||
    input.artifactCacheMaxMb !== undefined;
  if (!hasChange) throw new Error("No voice policy changes were requested.");
  const nextSettings: VoiceSettings = {
    ...current,
    ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
    ...(typeof input.autoplay === "boolean" ? { autoplay: input.autoplay } : {}),
    ...(input.mode !== undefined ? { mode: validateVoiceMode(input.mode) } : {}),
    ...(input.maxChars !== undefined ? { maxChars: validateMaxChars(input.maxChars) } : {}),
    ...(input.longReply !== undefined ? { longReply: validateLongReply(input.longReply) } : {}),
    ...(input.artifactCacheMaxMb !== undefined ? { artifactCacheMaxMb: validateArtifactCacheMaxMb(input.artifactCacheMaxMb) } : {}),
  };
  return {
    previousSettings: current,
    nextSettings,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    hasChanges: !voiceSettingsEqual(current, nextSettings),
  };
}

export function voicePolicyText(plan: VoicePolicyPlan, savedSettings: VoiceSettings): string {
  return [
    "Ambient voice policy updated",
    `Enabled: ${plan.previousSettings.enabled} -> ${savedSettings.enabled}`,
    `Autoplay: ${plan.previousSettings.autoplay} -> ${savedSettings.autoplay}`,
    `Mode: ${plan.previousSettings.mode} -> ${savedSettings.mode}`,
    `Long reply: ${plan.previousSettings.longReply} -> ${savedSettings.longReply}`,
    `Max chars: ${plan.previousSettings.maxChars} -> ${savedSettings.maxChars}`,
    `Artifact cache max MB: ${plan.previousSettings.artifactCacheMaxMb} -> ${savedSettings.artifactCacheMaxMb}`,
  ].join("\n");
}

export function voicePolicyNoopText(plan: VoicePolicyPlan): string {
  return [
    "Ambient voice policy already configured",
    `Enabled: ${plan.nextSettings.enabled}`,
    `Autoplay: ${plan.nextSettings.autoplay}`,
    `Mode: ${plan.nextSettings.mode}`,
    `Long reply: ${plan.nextSettings.longReply}`,
    `Max chars: ${plan.nextSettings.maxChars}`,
    `Artifact cache max MB: ${plan.nextSettings.artifactCacheMaxMb}`,
    "No settings were changed and no approval was required.",
  ].join("\n");
}

export function voicePolicyApprovalDetail(plan: VoicePolicyPlan, workspacePath: string): string {
  return [
    `Workspace: ${workspacePath}`,
    `Enabled: ${plan.previousSettings.enabled} -> ${plan.nextSettings.enabled}`,
    `Autoplay: ${plan.previousSettings.autoplay} -> ${plan.nextSettings.autoplay}`,
    `Mode: ${plan.previousSettings.mode} -> ${plan.nextSettings.mode}`,
    `Long reply: ${plan.previousSettings.longReply} -> ${plan.nextSettings.longReply}`,
    `Max chars: ${plan.previousSettings.maxChars} -> ${plan.nextSettings.maxChars}`,
    `Artifact cache max MB: ${plan.previousSettings.artifactCacheMaxMb} -> ${plan.nextSettings.artifactCacheMaxMb}`,
    plan.reason ? `Reason: ${plan.reason}` : undefined,
  ].filter(Boolean).join("\n");
}

function resolveVoiceProvider(input: VoiceSelectInput, current: VoiceSettings, providers: VoiceProviderCandidate[]): VoiceProviderCandidate {
  if (input.providerCapabilityId) {
    const exact = providers.find((provider) => provider.capabilityId === input.providerCapabilityId);
    if (!exact) throw new Error(`Voice provider capability id "${input.providerCapabilityId}" is not installed.`);
    return exact;
  }

  if (input.providerAlias?.trim()) {
    const alias = normalizeAlias(input.providerAlias);
    const matches = providers.filter((provider) => providerAliases(provider).includes(alias));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new Error(`Voice provider alias "${input.providerAlias}" is ambiguous. Use an exact providerCapabilityId.`);
    }
    throw new Error(`Voice provider alias "${input.providerAlias}" did not match an installed provider.`);
  }

  if (current.providerCapabilityId) {
    const currentProvider = providers.find((provider) => provider.capabilityId === current.providerCapabilityId);
    if (currentProvider) return currentProvider;
    throw new Error(`Current voice provider "${current.providerCapabilityId}" is not installed.`);
  }

  throw new Error("No voice provider selected. Pass providerCapabilityId from ambient_voice_status.");
}

function resolveVoice(
  provider: VoiceProviderCandidate,
  input: VoiceSelectInput,
  currentVoiceId: string | undefined,
  preferredVoiceId: string | undefined,
): { id: string; label?: string } | undefined {
  if (input.voiceId) {
    const exact = provider.voices.find((voice) => voice.id === input.voiceId);
    if (!exact && provider.voices.length > 0) throw new Error(`Voice "${input.voiceId}" is not declared by provider "${provider.label}".`);
    return exact ?? { id: input.voiceId };
  }

  if (input.voiceAlias?.trim()) {
    const alias = normalizeAlias(input.voiceAlias);
    const matches = provider.voices.filter((voice) => [voice.id, voice.label].filter(Boolean).map(normalizeAlias).includes(alias));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Voice alias "${input.voiceAlias}" is ambiguous for provider "${provider.label}". Use exact voiceId.`);
    throw new Error(`Voice alias "${input.voiceAlias}" did not match provider "${provider.label}".`);
  }

  if (currentVoiceId) {
    const current = provider.voices.find((voice) => voice.id === currentVoiceId);
    if (current || provider.voices.length === 0) return current ?? { id: currentVoiceId };
  }

  if (preferredVoiceId) {
    const preferred = provider.voices.find((voice) => voice.id === preferredVoiceId);
    if (preferred || provider.voices.length === 0) return preferred ?? { id: preferredVoiceId };
  }

  return provider.voices[0];
}

function resolveManagedCloneVoice(
  provider: VoiceProviderCandidate,
  input: VoiceCloneManageInput,
  currentVoiceId: string | undefined,
): { id: string; label?: string } {
  if (input.voiceId?.trim()) {
    const id = input.voiceId.trim();
    return provider.voices.find((voice) => voice.id === id) ?? { id };
  }
  if (input.voiceAlias?.trim()) {
    const alias = normalizeAlias(input.voiceAlias);
    const matches = provider.voices.filter((voice) => [voice.id, voice.label].filter(Boolean).map(normalizeAlias).includes(alias));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Voice alias "${input.voiceAlias}" is ambiguous for provider "${provider.label}". Use exact voiceId.`);
    throw new Error(`Voice alias "${input.voiceAlias}" did not match provider "${provider.label}".`);
  }
  if (currentVoiceId && provider.voices.some((voice) => voice.id === currentVoiceId)) {
    return provider.voices.find((voice) => voice.id === currentVoiceId)!;
  }
  throw new Error("voiceId is required when the selected voice is not managed by the requested provider.");
}

function resolveVoiceFormat(provider: VoiceProviderCandidate, requested: VoiceOutputFormat | undefined, current: VoiceOutputFormat): VoiceOutputFormat {
  if (requested) {
    if (!provider.formats.includes(requested)) throw new Error(`Voice provider "${provider.label}" does not support ${requested} output.`);
    return requested;
  }
  if (provider.formats.includes(current)) return current;
  return provider.format;
}

function providerAliases(provider: VoiceProviderCandidate): string[] {
  return [
    provider.capabilityId,
    provider.providerId,
    provider.packageId,
    provider.packageName,
    provider.command,
    provider.label,
    `${provider.packageName}:${provider.command}`,
  ].map(normalizeAlias);
}

function preferredVoiceRows(settings: VoiceSettings, providers: VoiceProviderCandidate[]): VoiceStatusResult["preferredVoices"] {
  const preferences = settings.preferredVoicesByProvider ?? {};
  return Object.entries(preferences).map(([providerCapabilityId, voiceId]) => {
    const provider = providers.find((candidate) => candidate.capabilityId === providerCapabilityId);
    const voice = provider?.voices.find((candidate) => candidate.id === voiceId);
    return {
      providerCapabilityId,
      voiceId,
      ...(provider ? { providerLabel: provider.label } : {}),
      ...(voice?.label ? { voiceLabel: voice.label } : {}),
    };
  });
}

function normalizeAlias(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cloneStatusMetadata(record: Record<string, unknown>): Pick<VoiceCloneCreateCommandResult, "progressPercent" | "retryAfterSeconds" | "dashboardUrl" | "verificationUrl" | "failureReason" | "localArtifactPaths"> {
  const progressPercent = boundedNumber(record.progressPercent ?? record.progress_percent ?? record.progress, 0, 100);
  const retryAfterSeconds = boundedNumber(record.retryAfterSeconds ?? record.retry_after_seconds ?? record.retryAfter, 0, 86_400);
  const dashboardUrl = safeHttpUrl(record.dashboardUrl ?? record.dashboard_url ?? record.providerUrl ?? record.provider_url);
  const verificationUrl = safeHttpUrl(record.verificationUrl ?? record.verification_url ?? record.actionUrl ?? record.action_url);
  const failureReason = boundedString(record.failureReason ?? record.failure_reason ?? record.errorReason ?? record.error_reason ?? record.error, 500);
  const localArtifactPaths = safeLocalArtifactPaths(record.localArtifactPaths ?? record.local_artifact_paths ?? record.artifactPaths ?? record.artifacts);
  return {
    ...(progressPercent !== undefined ? { progressPercent } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(dashboardUrl ? { dashboardUrl } : {}),
    ...(verificationUrl ? { verificationUrl } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(localArtifactPaths.length ? { localArtifactPaths } : {}),
  };
}

function deleteArtifactMetadata(record: Record<string, unknown>): Pick<VoiceCloneDeleteCommandResult, "removedArtifactPaths"> {
  const removedArtifactPaths = safeLocalArtifactPaths(record.removedArtifactPaths ?? record.removed_artifact_paths ?? record.localArtifactPaths ?? record.local_artifact_paths);
  return removedArtifactPaths.length ? { removedArtifactPaths } : {};
}

function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function safeHttpUrl(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function safeLocalArtifactPaths(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : typeof value === "string" && value.trim() ? [value] : [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const item of rawItems) {
    const path = typeof item === "string" ? item.trim().replaceAll("\\", "/") : "";
    if (!path || path.startsWith("/") || path.startsWith("~") || path.includes("://")) continue;
    const parts = path.split("/").filter(Boolean);
    if (!parts.length || parts.some((part) => part === "." || part === "..")) continue;
    const normalized = parts.join("/");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      paths.push(normalized);
    }
  }
  return paths.slice(0, 20);
}

function normalizeStatus(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function voiceCloneReadiness(providerId: string, status: string | undefined): VoiceCloneReadiness {
  if (!status) return "unknown";
  if (["ready", "active", "complete", "completed", "done", "available", "enabled"].includes(status)) return "ready";
  if (["pending", "processing", "queued", "training", "creating", "created", "building", "initializing", "generating", "in-progress"].includes(status)) return "pending";
  if (["requires-verification", "verification-required", "needs-verification", "requires-review", "review-required", "consent-required", "requires-action", "action-required"].includes(status)) return "action-required";
  if (["failed", "error", "errored", "rejected", "disabled", "deleted", "not-found", "unavailable"].includes(status)) return "failed";
  if (providerId.includes("elevenlabs") && status.includes("verification")) return "action-required";
  if (providerId.includes("cartesia") && (status.includes("training") || status.includes("processing"))) return "pending";
  if (status.includes("fail") || status.includes("error") || status.includes("reject")) return "failed";
  if (status.includes("pending") || status.includes("process") || status.includes("train") || status.includes("queue")) return "pending";
  if (status.includes("ready") || status.includes("complete") || status.includes("active")) return "ready";
  return "unknown";
}

function voiceCloneStatusMessage(providerLabel: string, readiness: VoiceCloneReadiness, rawStatus: string | undefined, result: VoiceCloneCreateCommandResult): string {
  const raw = rawStatus ? ` Provider reported "${rawStatus}".` : "";
  const progress = result.progressPercent !== undefined ? ` Progress is ${result.progressPercent}%.` : "";
  const retry = result.retryAfterSeconds !== undefined ? ` Provider suggests retrying after ${result.retryAfterSeconds} seconds.` : "";
  const failure = result.failureReason ? ` Reason: ${result.failureReason}` : "";
  if (readiness === "ready") return `${providerLabel} reports this cloned voice is ready.${raw}`;
  if (readiness === "pending") return `${providerLabel} is still preparing this cloned voice.${raw}${progress}${retry}`;
  if (readiness === "action-required") return `${providerLabel} requires user/provider-side action before this cloned voice is ready.${raw}`;
  if (readiness === "failed") return `${providerLabel} reports this cloned voice is not usable.${raw}${failure}`;
  return `${providerLabel} did not return a recognized clone readiness state.${raw}`;
}

function voiceCloneStatusNextSteps(
  providerLabel: string,
  readiness: VoiceCloneReadiness,
  providerId: string,
  result: VoiceCloneCreateCommandResult,
  reconcile: { cacheStatus?: "present" | "missing"; missingLocalArtifactPaths: string[] },
): string[] {
  const reconcileSteps = voiceCloneReconcileNextSteps(reconcile);
  if (readiness === "ready") {
    return [
      "Use ambient_voice_select with this exact voiceId only if the user wants this cloned voice for chat output.",
      "Use ambient_voice_list_voices to confirm it appears in Ambient's cached catalog.",
      ...reconcileSteps,
    ];
  }
  if (readiness === "pending") {
    const retry = result.retryAfterSeconds !== undefined
      ? `Retry ambient_voice_clone_status after at least ${result.retryAfterSeconds} seconds.`
      : "Retry ambient_voice_clone_status after the provider has had time to finish training or processing.";
    return [
      "Do not select this voice for chat yet.",
      retry,
      "If it remains pending for an unusual amount of time, inspect the provider dashboard or repair the capability.",
      ...reconcileSteps,
    ];
  }
  if (readiness === "action-required") {
    const providerSpecific = providerId.includes("elevenlabs")
      ? "Complete any required ElevenLabs verification, consent, or dashboard review before retrying status."
      : `Complete the provider-side action required by ${providerLabel} before retrying status.`;
    return [
      "Do not select this voice for chat yet.",
      providerSpecific,
      ...(result.verificationUrl ? [`Open the provider verification link only if the user asks: ${result.verificationUrl}`] : []),
      ...(result.dashboardUrl ? [`Open the provider dashboard only if the user asks: ${result.dashboardUrl}`] : []),
      "After the action is complete, retry ambient_voice_clone_status.",
      ...reconcileSteps,
    ];
  }
  if (readiness === "failed") {
    return [
      "Do not select this voice for chat.",
      result.failureReason ? `Explain the provider failure reason: ${result.failureReason}` : "Explain the provider failure and offer to delete the failed clone or create a new clone with better source audio.",
      "Use ambient_voice_clone_delete only after explicit user approval.",
      ...reconcileSteps,
    ];
  }
  return [
    "Do not assume this voice is ready for chat.",
    "Retry ambient_voice_clone_status or refresh the provider voice catalog.",
    "If the provider keeps returning an unknown state, repair the capability's status mapping.",
    ...reconcileSteps,
  ];
}

function voiceCloneReconcileNextSteps(reconcile: { cacheStatus?: "present" | "missing"; missingLocalArtifactPaths: string[] }): string[] {
  const steps: string[] = [];
  if (reconcile.cacheStatus === "missing") {
    steps.push("Ambient's dynamic voice cache does not contain this cloned voice yet; run ambient_voice_refresh_voices if the provider supports discovery, or rerun clone creation only if the user intended to recreate it.");
  }
  if (reconcile.missingLocalArtifactPaths.length) {
    steps.push("One or more local cloned-model artifacts are missing; do not select this voice until the provider is repaired or the clone is recreated.");
  }
  return steps;
}

function validateVoiceMode(value: VoiceMode): VoiceMode {
  if (value === "off" || value === "assistant-final" || value === "always" || value === "tagged") return value;
  throw new Error(`Unsupported voice mode "${value}".`);
}

function validateLongReply(value: VoiceLongReplyBehavior): VoiceLongReplyBehavior {
  if (value === "summarize" || value === "skip" || value === "ask") return value;
  throw new Error(`Unsupported long-reply behavior "${value}".`);
}

function validateMaxChars(value: number): number {
  if (!Number.isInteger(value) || value < 100 || value > 10_000) {
    throw new Error("Voice maxChars must be an integer between 100 and 10000.");
  }
  return value;
}

function validateArtifactCacheMaxMb(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1024) {
    throw new Error("Voice artifactCacheMaxMb must be an integer between 0 and 1024.");
  }
  return value;
}

function voiceSettingsEqual(left: VoiceSettings, right: VoiceSettings): boolean {
  return (
    left.enabled === right.enabled &&
    left.mode === right.mode &&
    left.autoplay === right.autoplay &&
    left.providerCapabilityId === right.providerCapabilityId &&
    left.voiceId === right.voiceId &&
    preferredVoicesEqual(left.preferredVoicesByProvider, right.preferredVoicesByProvider) &&
    left.maxChars === right.maxChars &&
    left.longReply === right.longReply &&
    left.format === right.format &&
    left.artifactCacheMaxMb === right.artifactCacheMaxMb
  );
}

function preferredVoicesEqual(left: Record<string, string> | undefined, right: Record<string, string> | undefined): boolean {
  const leftEntries = Object.entries(left ?? {}).filter(([, value]) => value);
  const rightEntries = Object.entries(right ?? {}).filter(([, value]) => value);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value]) => right?.[key] === value);
}

function voiceLabel(voice: { id: string; label?: string }): string {
  return voice.label ? `${voice.label} (${voice.id})` : voice.id;
}
