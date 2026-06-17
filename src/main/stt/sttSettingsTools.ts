import type { SttProviderCandidate, SttSettings, SttTranscriptionState } from "../../shared/types";

export interface SttStatusResult {
  settings: SttSettings;
  providers: SttProviderCandidate[];
  selectedProvider?: SttProviderCandidate;
  providerCount: number;
  availableProviderCount: number;
}

export interface SttSelectInput {
  providerCapabilityId?: string;
  providerAlias?: string;
  spokenLanguage?: string;
  enabled?: boolean;
  reason?: string;
}

export interface SttSelectPlan {
  previousSettings: SttSettings;
  nextSettings: SttSettings;
  previousProvider?: SttProviderCandidate;
  nextProvider: SttProviderCandidate;
  previousLanguage: string;
  nextLanguage: string;
  reason?: string;
  hasChanges: boolean;
}

export interface SttPolicyInput {
  enabled?: boolean;
  spokenLanguage?: string;
  autoSendAfterTranscription?: boolean;
  silenceFinalizeSeconds?: number;
  noSpeechGateEnabled?: boolean;
  noSpeechGateRmsThresholdDbfs?: number;
  stopTtsOnSpeech?: boolean;
  queueWhileAgentRuns?: boolean;
  pushToTalkShortcut?: string;
  clearPushToTalkShortcut?: boolean;
  reason?: string;
}

export interface SttPolicyPlan {
  previousSettings: SttSettings;
  nextSettings: SttSettings;
  reason?: string;
  hasChanges: boolean;
}

export interface SttTestInput {
  audioPath?: string;
  spokenLanguage?: string;
  reason?: string;
}

export function buildSttStatus(settings: SttSettings, providers: SttProviderCandidate[]): SttStatusResult {
  const selectedProvider = providers.find((provider) => provider.capabilityId === settings.providerCapabilityId);
  return {
    settings,
    providers,
    ...(selectedProvider ? { selectedProvider } : {}),
    providerCount: providers.length,
    availableProviderCount: providers.filter((provider) => provider.available).length,
  };
}

export function sttStatusText(status: SttStatusResult): string {
  const selectedProvider = status.selectedProvider
    ? `${status.selectedProvider.label} (${status.selectedProvider.capabilityId})`
    : status.settings.providerCapabilityId
      ? `Unknown provider (${status.settings.providerCapabilityId})`
      : "None";
  const providers = status.providers.length
    ? status.providers
        .map((provider) => {
          const languages = provider.languages.length ? provider.languages.join(", ") : "not declared";
          const diagnostics = provider.diagnostics
            ? [
                `; health=${provider.diagnostics.healthStatus}`,
                provider.diagnostics.distribution?.packageType ? `; packageType=${provider.diagnostics.distribution.packageType}` : "",
                provider.diagnostics.installPlan?.resolver ? `; installer=${provider.diagnostics.installPlan.resolver}` : "",
                provider.diagnostics.distribution?.bundledModelAssets === false ? "; modelAssets=not-bundled" : "",
              ].join("")
            : "";
          const validation = provider.validation
            ? `; validation=${provider.validation.status}; lane=${provider.validation.lane}; model=${provider.validation.model ?? "unknown"}`
            : "";
          const assets = provider.validation?.assetManifest
            ? `; assets=${provider.validation.assetManifest.model.id}@${provider.validation.assetManifest.model.revision.slice(0, 8)}`
            : "";
          return `- ${provider.label}: id=${provider.capabilityId}; package=${provider.packageName}; command=${provider.command}; available=${provider.available}; defaultLanguage=${provider.defaultLanguage ?? "unspecified"}${diagnostics}${validation}${assets}; languages=${languages}`;
        })
        .join("\n")
    : "- No installed STT providers discovered.";
  return [
    "Ambient STT status",
    `Enabled: ${status.settings.enabled}`,
    `Mode: ${status.settings.mode}`,
    `Selected provider: ${selectedProvider}`,
    `Spoken language: ${status.settings.spokenLanguage}`,
    `Microphone: ${status.settings.microphone?.label ?? status.settings.microphone?.deviceId ?? "System default"}`,
    `Push-to-talk shortcut: ${status.settings.pushToTalkShortcut ?? "not set"}`,
    `Auto-send after transcription: ${status.settings.autoSendAfterTranscription}`,
    `Silence before transcribe: ${status.settings.silenceFinalizeSeconds}s`,
    `No-speech gate: ${status.settings.noSpeechGate.enabled} at ${status.settings.noSpeechGate.rmsThresholdDbfs} dBFS RMS`,
    `Stop TTS on speech: ${status.settings.bargeIn.stopTtsOnSpeech}`,
    `Queue while agent runs: ${status.settings.bargeIn.queueWhileAgentRuns}`,
    `Providers: ${status.availableProviderCount}/${status.providerCount} available`,
    providers,
    "Use ambient_stt_select with exact providerCapabilityId values from this output to change provider or spoken language.",
    "Use ambient_stt_policy_update to change enablement, silence, no-speech gate, auto-send, shortcut, or queue policy.",
    "Use ambient_stt_test with a workspace-relative WAV artifact path to validate transcription; do not pass raw audio.",
  ].join("\n");
}

export function planSttSelection(input: SttSelectInput, current: SttSettings, providers: SttProviderCandidate[]): SttSelectPlan {
  const previousProvider = current.providerCapabilityId
    ? providers.find((provider) => provider.capabilityId === current.providerCapabilityId)
    : undefined;
  const nextProvider = resolveSttProvider(input, current, providers);
  if (!nextProvider.available) {
    throw new Error(`STT provider "${nextProvider.label}" is not available: ${nextProvider.availabilityReason}`);
  }
  const nextLanguage = resolveSttLanguage(nextProvider, input.spokenLanguage, current.spokenLanguage);
  const nextSettings: SttSettings = {
    ...current,
    providerCapabilityId: nextProvider.capabilityId,
    spokenLanguage: nextLanguage,
    ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
  };

  return {
    previousSettings: current,
    nextSettings,
    ...(previousProvider ? { previousProvider } : {}),
    nextProvider,
    previousLanguage: current.spokenLanguage,
    nextLanguage,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    hasChanges: !sttSettingsEqual(current, nextSettings),
  };
}

export function sttSelectText(plan: SttSelectPlan, savedSettings: SttSettings): string {
  const previousProvider = plan.previousProvider ? `${plan.previousProvider.label} (${plan.previousProvider.capabilityId})` : "None";
  const nextProvider = `${plan.nextProvider.label} (${plan.nextProvider.capabilityId})`;
  return [
    "Ambient STT settings updated",
    `Provider: ${previousProvider} -> ${nextProvider}`,
    `Spoken language: ${plan.previousLanguage} -> ${savedSettings.spokenLanguage}`,
    `Enabled: ${plan.previousSettings.enabled} -> ${savedSettings.enabled}`,
  ].join("\n");
}

export function sttSelectNoopText(plan: SttSelectPlan): string {
  return [
    "Ambient STT settings already configured",
    `Provider: ${plan.nextProvider.label} (${plan.nextProvider.capabilityId})`,
    `Spoken language: ${plan.nextSettings.spokenLanguage}`,
    `Enabled: ${plan.nextSettings.enabled}`,
    "No settings were changed and no approval was required.",
  ].join("\n");
}

export function sttSelectApprovalDetail(plan: SttSelectPlan, workspacePath: string): string {
  const previousProvider = plan.previousProvider ? `${plan.previousProvider.label} (${plan.previousProvider.capabilityId})` : "None";
  const nextProvider = `${plan.nextProvider.label} (${plan.nextProvider.capabilityId})`;
  return [
    `Workspace: ${workspacePath}`,
    `Provider: ${previousProvider} -> ${nextProvider}`,
    `Spoken language: ${plan.previousLanguage} -> ${plan.nextLanguage}`,
    `Enabled: ${plan.previousSettings.enabled} -> ${plan.nextSettings.enabled}`,
    plan.reason ? `Reason: ${plan.reason}` : undefined,
  ].filter(Boolean).join("\n");
}

export function planSttPolicyUpdate(input: SttPolicyInput, current: SttSettings, providers: SttProviderCandidate[] = []): SttPolicyPlan {
  const hasChange =
    typeof input.enabled === "boolean" ||
    input.spokenLanguage !== undefined ||
    typeof input.autoSendAfterTranscription === "boolean" ||
    input.silenceFinalizeSeconds !== undefined ||
    typeof input.noSpeechGateEnabled === "boolean" ||
    input.noSpeechGateRmsThresholdDbfs !== undefined ||
    typeof input.stopTtsOnSpeech === "boolean" ||
    typeof input.queueWhileAgentRuns === "boolean" ||
    input.pushToTalkShortcut !== undefined ||
    input.clearPushToTalkShortcut === true;
  if (!hasChange) throw new Error("No STT policy changes were requested.");
  if (input.enabled === true && !current.providerCapabilityId) {
    throw new Error("Select an available STT provider before enabling speech input.");
  }
  if (input.pushToTalkShortcut !== undefined && input.clearPushToTalkShortcut === true) {
    throw new Error("Pass either pushToTalkShortcut or clearPushToTalkShortcut, not both.");
  }
  const selectedProvider = current.providerCapabilityId
    ? providers.find((provider) => provider.capabilityId === current.providerCapabilityId)
    : undefined;

  const nextSettings: SttSettings = {
    ...current,
    ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
    ...(input.spokenLanguage !== undefined ? { spokenLanguage: selectedProvider ? resolveSttLanguage(selectedProvider, input.spokenLanguage, current.spokenLanguage) : validateSpokenLanguage(input.spokenLanguage) } : {}),
    ...(typeof input.autoSendAfterTranscription === "boolean" ? { autoSendAfterTranscription: input.autoSendAfterTranscription } : {}),
    ...(input.silenceFinalizeSeconds !== undefined ? { silenceFinalizeSeconds: validateSilenceFinalizeSeconds(input.silenceFinalizeSeconds) } : {}),
    noSpeechGate: {
      ...current.noSpeechGate,
      ...(typeof input.noSpeechGateEnabled === "boolean" ? { enabled: input.noSpeechGateEnabled } : {}),
      ...(input.noSpeechGateRmsThresholdDbfs !== undefined ? { rmsThresholdDbfs: validateRmsThreshold(input.noSpeechGateRmsThresholdDbfs) } : {}),
    },
    bargeIn: {
      ...current.bargeIn,
      ...(typeof input.stopTtsOnSpeech === "boolean" ? { stopTtsOnSpeech: input.stopTtsOnSpeech } : {}),
      ...(typeof input.queueWhileAgentRuns === "boolean" ? { queueWhileAgentRuns: input.queueWhileAgentRuns } : {}),
    },
  };
  if (input.pushToTalkShortcut !== undefined) nextSettings.pushToTalkShortcut = validateShortcut(input.pushToTalkShortcut);
  if (input.clearPushToTalkShortcut === true) delete nextSettings.pushToTalkShortcut;

  return {
    previousSettings: current,
    nextSettings,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    hasChanges: !sttSettingsEqual(current, nextSettings),
  };
}

export function sttPolicyText(plan: SttPolicyPlan, savedSettings: SttSettings): string {
  return [
    "Ambient STT policy updated",
    `Enabled: ${plan.previousSettings.enabled} -> ${savedSettings.enabled}`,
    `Spoken language: ${plan.previousSettings.spokenLanguage} -> ${savedSettings.spokenLanguage}`,
    `Auto-send after transcription: ${plan.previousSettings.autoSendAfterTranscription} -> ${savedSettings.autoSendAfterTranscription}`,
    `Silence before transcribe: ${plan.previousSettings.silenceFinalizeSeconds}s -> ${savedSettings.silenceFinalizeSeconds}s`,
    `No-speech gate: ${plan.previousSettings.noSpeechGate.enabled} -> ${savedSettings.noSpeechGate.enabled}`,
    `RMS no-speech threshold: ${plan.previousSettings.noSpeechGate.rmsThresholdDbfs} -> ${savedSettings.noSpeechGate.rmsThresholdDbfs} dBFS`,
    `Stop TTS on speech: ${plan.previousSettings.bargeIn.stopTtsOnSpeech} -> ${savedSettings.bargeIn.stopTtsOnSpeech}`,
    `Queue while agent runs: ${plan.previousSettings.bargeIn.queueWhileAgentRuns} -> ${savedSettings.bargeIn.queueWhileAgentRuns}`,
    `Push-to-talk shortcut: ${plan.previousSettings.pushToTalkShortcut ?? "not set"} -> ${savedSettings.pushToTalkShortcut ?? "not set"}`,
  ].join("\n");
}

export function sttPolicyNoopText(plan: SttPolicyPlan): string {
  return [
    "Ambient STT policy already configured",
    `Enabled: ${plan.nextSettings.enabled}`,
    `Spoken language: ${plan.nextSettings.spokenLanguage}`,
    `Silence before transcribe: ${plan.nextSettings.silenceFinalizeSeconds}s`,
    `No-speech gate: ${plan.nextSettings.noSpeechGate.enabled} at ${plan.nextSettings.noSpeechGate.rmsThresholdDbfs} dBFS RMS`,
    "No settings were changed and no approval was required.",
  ].join("\n");
}

export function sttPolicyApprovalDetail(plan: SttPolicyPlan, workspacePath: string): string {
  return [
    `Workspace: ${workspacePath}`,
    `Enabled: ${plan.previousSettings.enabled} -> ${plan.nextSettings.enabled}`,
    `Spoken language: ${plan.previousSettings.spokenLanguage} -> ${plan.nextSettings.spokenLanguage}`,
    `Auto-send after transcription: ${plan.previousSettings.autoSendAfterTranscription} -> ${plan.nextSettings.autoSendAfterTranscription}`,
    `Silence before transcribe: ${plan.previousSettings.silenceFinalizeSeconds}s -> ${plan.nextSettings.silenceFinalizeSeconds}s`,
    `No-speech gate: ${plan.previousSettings.noSpeechGate.enabled} -> ${plan.nextSettings.noSpeechGate.enabled}`,
    `RMS no-speech threshold: ${plan.previousSettings.noSpeechGate.rmsThresholdDbfs} -> ${plan.nextSettings.noSpeechGate.rmsThresholdDbfs} dBFS`,
    `Stop TTS on speech: ${plan.previousSettings.bargeIn.stopTtsOnSpeech} -> ${plan.nextSettings.bargeIn.stopTtsOnSpeech}`,
    `Queue while agent runs: ${plan.previousSettings.bargeIn.queueWhileAgentRuns} -> ${plan.nextSettings.bargeIn.queueWhileAgentRuns}`,
    `Push-to-talk shortcut: ${plan.previousSettings.pushToTalkShortcut ?? "not set"} -> ${plan.nextSettings.pushToTalkShortcut ?? "not set"}`,
    plan.reason ? `Reason: ${plan.reason}` : undefined,
  ].filter(Boolean).join("\n");
}

export function sttProviderTestText(providerLabel: string, state: SttTranscriptionState): string {
  const gate = state.noSpeechGate;
  return [
    state.status === "ready" ? "Ambient STT test succeeded" : state.status === "no-speech" ? "Ambient STT test detected no speech" : "Ambient STT test finished",
    `Provider: ${providerLabel}`,
    `Status: ${state.status}`,
    `Language: ${state.language}`,
    state.text ? `Transcript: ${state.text}` : undefined,
    state.durationMs !== undefined ? `Provider elapsed: ${Math.round(state.durationMs)} ms` : undefined,
    gate?.rmsDbfs !== undefined ? `RMS: ${gate.rmsDbfs.toFixed(1)} dBFS` : undefined,
    gate?.thresholdDbfs !== undefined ? `No-speech threshold: ${gate.thresholdDbfs} dBFS` : undefined,
    state.normalizedAudioPath ? `Normalized audio artifact: ${state.normalizedAudioPath}` : undefined,
    state.transcriptPath ? `Transcript artifact: ${state.transcriptPath}` : undefined,
    state.jsonPath ? `JSON artifact: ${state.jsonPath}` : undefined,
    state.stdoutPath ? `stdout artifact: ${state.stdoutPath}` : undefined,
    state.stderrPath ? `stderr artifact: ${state.stderrPath}` : undefined,
    "Raw audio bytes were not returned to the agent.",
  ].filter(Boolean).join("\n");
}

function resolveSttProvider(input: SttSelectInput, current: SttSettings, providers: SttProviderCandidate[]): SttProviderCandidate {
  if (input.providerCapabilityId) {
    const exact = providers.find((provider) => provider.capabilityId === input.providerCapabilityId);
    if (!exact) throw new Error(`STT provider capability id "${input.providerCapabilityId}" is not installed.`);
    return exact;
  }

  if (input.providerAlias?.trim()) {
    const alias = normalizeAlias(input.providerAlias);
    const matches = providers.filter((provider) => providerAliases(provider).includes(alias));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`STT provider alias "${input.providerAlias}" is ambiguous. Use an exact providerCapabilityId.`);
    throw new Error(`STT provider alias "${input.providerAlias}" did not match an installed provider.`);
  }

  if (current.providerCapabilityId) {
    const currentProvider = providers.find((provider) => provider.capabilityId === current.providerCapabilityId);
    if (currentProvider) return currentProvider;
    throw new Error(`Current STT provider "${current.providerCapabilityId}" is not installed.`);
  }

  throw new Error("No STT provider selected. Pass providerCapabilityId from ambient_stt_status.");
}

function resolveSttLanguage(provider: SttProviderCandidate, requested: string | undefined, current: string): string {
  if (requested !== undefined) return providerLanguage(provider, validateSpokenLanguage(requested));
  const currentLanguage = current.trim();
  if (currentLanguage && providerLanguage(provider, currentLanguage, { strict: false })) return currentLanguage;
  return provider.defaultLanguage ?? provider.languages[0] ?? (currentLanguage || "English");
}

function providerLanguage(provider: SttProviderCandidate, language: string, options: { strict?: boolean } = {}): string {
  const normalized = normalizeAlias(language);
  if (!provider.languages.length) return language;
  const match = provider.languages.find((candidate) => normalizeAlias(candidate) === normalized);
  if (match) return match;
  if (options.strict === false) return "";
  throw new Error(`STT provider "${provider.label}" does not declare support for spoken language "${language}".`);
}

function providerAliases(provider: SttProviderCandidate): string[] {
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

function validateSpokenLanguage(value: string): string {
  const language = value.trim();
  if (!language) throw new Error("STT spokenLanguage must be non-empty.");
  if (language.length > 80) throw new Error("STT spokenLanguage is too long.");
  return language;
}

function validateShortcut(value: string): string {
  const shortcut = value.trim();
  if (!shortcut) throw new Error("Push-to-talk shortcut must be non-empty. Use clearPushToTalkShortcut to clear it.");
  if (shortcut.length > 80 || /[\r\n]/.test(shortcut)) throw new Error("Push-to-talk shortcut is invalid.");
  return shortcut;
}

function validateSilenceFinalizeSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0.3 || value > 2.5) {
    throw new Error("silenceFinalizeSeconds must be a number from 0.3 to 2.5.");
  }
  return Math.round(value * 100) / 100;
}

function validateRmsThreshold(value: number): number {
  if (!Number.isFinite(value) || value < -90 || value > -20) {
    throw new Error("noSpeechGateRmsThresholdDbfs must be a number from -90 to -20.");
  }
  return Math.round(value);
}

function sttSettingsEqual(left: SttSettings, right: SttSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeAlias(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
