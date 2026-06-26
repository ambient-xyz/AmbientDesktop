import type {
  MediaPlaybackSettings,
  SttProviderCandidate,
  SttSettings,
  VoiceSettings,
  VoiceSettingsAuditSource,
} from "../../../shared/localRuntimeTypes";
import type { PlannerSettings } from "../../../shared/plannerTypes";
import type { SearchRoutingSettings } from "../../../shared/webResearchTypes";
import type {
  UpdateMediaPlaybackSettingsInput,
  UpdatePlannerSettingsInput,
  UpdateSttSettingsInput,
  UpdateVoiceSettingsInput,
} from "../../../shared/desktopTypes";
import type { CollaborationMode, ThinkingLevel, ThreadSummary } from "../../../shared/threadTypes";
import type { AmbientCliPackageCatalog, DiscoverAmbientCliPackagesOptions } from "../agentRuntimeAmbientCliFacade";
import type { MessagingRemoteSurfaceSettingUpdateRequest, MessagingRemoteSurfaceSettingUpdateResult } from "../agentRuntimeMessagingFacade";
import { planSearchPreferenceUpdate, searchPreferenceUpdateText, type SearchPreferenceUpdateInput } from "../agentRuntimeWebResearchFacade";
import { planSttPolicyUpdate, sttPolicyNoopText, sttPolicyText, type SttPolicyInput } from "../agentRuntimeSttFacade";
import { planVoicePolicyUpdate, voicePolicyNoopText, voicePolicyText, type VoicePolicyInput } from "../agentRuntimeVoiceFacade";

export interface MessagingRemoteSurfaceCommandSettingUpdateVoiceAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

export interface MessagingRemoteSurfaceCommandSettingUpdateApplyOptions {
  input: MessagingRemoteSurfaceSettingUpdateRequest;
  threadId: string;
  workspacePath: string;
  getThread: (threadId: string) => ThreadSummary;
  updateThreadSettings: (threadId: string, next: Partial<Pick<ThreadSummary, "collaborationMode" | "thinkingLevel">>) => ThreadSummary;
  onThreadUpdated: (thread: ThreadSummary) => void;
  voice?: {
    readSettings: () => VoiceSettings;
    updateSettings?: (
      input: UpdateVoiceSettingsInput,
      audit?: MessagingRemoteSurfaceCommandSettingUpdateVoiceAuditContext,
    ) => Promise<VoiceSettings> | VoiceSettings;
    onStateUpdated?: () => void;
  };
  stt?: {
    readSettings: () => SttSettings;
    updateSettings?: (input: UpdateSttSettingsInput) => Promise<SttSettings> | SttSettings;
  };
  listSttProviders: (workspacePath: string) => Promise<SttProviderCandidate[]> | SttProviderCandidate[];
  media?: {
    readSettings: () => MediaPlaybackSettings;
    updateSettings?: (input: UpdateMediaPlaybackSettingsInput) => Promise<MediaPlaybackSettings> | MediaPlaybackSettings;
  };
  planner?: {
    readSettings?: () => PlannerSettings;
    updateSettings?: (input: UpdatePlannerSettingsInput) => Promise<PlannerSettings> | PlannerSettings;
  };
  search?: {
    readSettings: () => SearchRoutingSettings;
    updateSettings?: (input: SearchRoutingSettings) => Promise<SearchRoutingSettings> | SearchRoutingSettings;
  };
  discoverAmbientCliPackages: (workspacePath: string, options?: DiscoverAmbientCliPackagesOptions) => Promise<AmbientCliPackageCatalog>;
}

export async function messagingRemoteSurfaceCommandApplySettingUpdate(
  options: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions,
): Promise<MessagingRemoteSurfaceSettingUpdateResult> {
  const { input, threadId, workspacePath } = options;
  const thread = options.getThread(threadId);
  if (thread.collaborationMode === "planner") throw new Error("Remote Ambient Surface settings changes are blocked in Planner Mode.");

  if (input.operation === "thread_settings") {
    const targetThreadId = input.threadId?.trim() || threadId;
    const current = options.getThread(targetThreadId);
    const next: Partial<Pick<ThreadSummary, "collaborationMode" | "thinkingLevel">> = {};
    if (input.field === "collaborationMode" && (input.value === "agent" || input.value === "planner")) {
      next.collaborationMode = input.value as CollaborationMode;
    } else if (
      input.field === "thinkingLevel" &&
      (input.value === "minimal" || input.value === "low" || input.value === "medium" || input.value === "high" || input.value === "xhigh")
    ) {
      next.thinkingLevel = input.value as ThinkingLevel;
    } else {
      throw new Error(`Unsupported thread settings command: ${input.field ?? "unknown field"}.`);
    }

    const changed =
      (next.collaborationMode !== undefined && next.collaborationMode !== current.collaborationMode) ||
      (next.thinkingLevel !== undefined && next.thinkingLevel !== current.thinkingLevel);
    if (!changed) {
      return {
        settingKey: "thread",
        operation: "thread_settings",
        changed: false,
        text: [
          "Ambient chat thread settings already configured",
          `Thread: ${current.title} (${current.id})`,
          `Mode: ${current.collaborationMode}`,
          `Thinking level: ${current.thinkingLevel}`,
          "No settings were changed.",
        ].join("\n"),
        previousSummary: threadSettingsSummary(current),
        nextSummary: threadSettingsSummary(current),
      };
    }

    const updated = options.updateThreadSettings(targetThreadId, next);
    options.onThreadUpdated(updated);
    return {
      settingKey: "thread",
      operation: "thread_settings",
      changed: true,
      text: [
        "Ambient chat thread settings updated",
        `Thread: ${updated.title} (${updated.id})`,
        next.collaborationMode !== undefined ? `Mode: ${current.collaborationMode} -> ${updated.collaborationMode}` : undefined,
        next.thinkingLevel !== undefined ? `Thinking level: ${current.thinkingLevel} -> ${updated.thinkingLevel}` : undefined,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      previousSummary: threadSettingsSummary(current),
      nextSummary: threadSettingsSummary(updated),
    };
  }

  if (input.operation === "voice_policy") {
    const current = options.voice?.readSettings();
    if (!current || !options.voice?.updateSettings) throw new Error("Ambient voice settings updates are not available in this runtime.");
    const voiceInput: VoicePolicyInput = { reason: input.reason };
    if (input.field === "enabled" && typeof input.value === "boolean") voiceInput.enabled = input.value;
    else if (input.field === "autoplay" && typeof input.value === "boolean") voiceInput.autoplay = input.value;
    else if (input.field === "mode" && typeof input.value === "string") voiceInput.mode = input.value as VoicePolicyInput["mode"];
    else if (input.field === "longReply" && typeof input.value === "string")
      voiceInput.longReply = input.value as VoicePolicyInput["longReply"];
    else if (input.field === "maxChars" && typeof input.value === "number") voiceInput.maxChars = input.value;
    else throw new Error(`Unsupported voice settings command: ${input.field ?? "unknown field"}.`);

    const plan = planVoicePolicyUpdate(voiceInput, current);
    if (!plan.hasChanges) {
      return {
        settingKey: "voice",
        operation: "voice_policy",
        changed: false,
        text: voicePolicyNoopText(plan),
        previousSummary: voiceSettingsSummary(plan.previousSettings),
        nextSummary: voiceSettingsSummary(plan.nextSettings),
      };
    }
    const savedSettings = await options.voice.updateSettings(plan.nextSettings, {
      source: "chat-tool",
      toolName: "ambient_messaging_remote_surface_command_apply",
      threadId,
      summary: "Remote Ambient Surface updated voice policy settings.",
    });
    options.voice.onStateUpdated?.();
    return {
      settingKey: "voice",
      operation: "voice_policy",
      changed: true,
      text: voicePolicyText(plan, savedSettings),
      previousSummary: voiceSettingsSummary(plan.previousSettings),
      nextSummary: voiceSettingsSummary(savedSettings),
    };
  }

  if (input.operation === "stt_policy") {
    const current = options.stt?.readSettings();
    if (!current || !options.stt?.updateSettings) throw new Error("Ambient STT settings updates are not available in this runtime.");
    const sttInput: SttPolicyInput = { reason: input.reason };
    if (input.field === "enabled" && typeof input.value === "boolean") sttInput.enabled = input.value;
    else if (input.field === "spokenLanguage" && typeof input.value === "string") sttInput.spokenLanguage = input.value;
    else if (input.field === "autoSendAfterTranscription" && typeof input.value === "boolean")
      sttInput.autoSendAfterTranscription = input.value;
    else if (input.field === "silenceFinalizeSeconds" && typeof input.value === "number") sttInput.silenceFinalizeSeconds = input.value;
    else if (input.field === "noSpeechGateEnabled" && typeof input.value === "boolean") sttInput.noSpeechGateEnabled = input.value;
    else if (input.field === "noSpeechGateRmsThresholdDbfs" && typeof input.value === "number")
      sttInput.noSpeechGateRmsThresholdDbfs = input.value;
    else if (input.field === "stopTtsOnSpeech" && typeof input.value === "boolean") sttInput.stopTtsOnSpeech = input.value;
    else if (input.field === "queueWhileAgentRuns" && typeof input.value === "boolean") sttInput.queueWhileAgentRuns = input.value;
    else throw new Error(`Unsupported STT settings command: ${input.field ?? "unknown field"}.`);

    const providers = await Promise.resolve(options.listSttProviders(workspacePath)).catch(() => []);
    const plan = planSttPolicyUpdate(sttInput, current, providers);
    if (!plan.hasChanges) {
      return {
        settingKey: "stt",
        operation: "stt_policy",
        changed: false,
        text: sttPolicyNoopText(plan),
        previousSummary: sttSettingsSummary(plan.previousSettings),
        nextSummary: sttSettingsSummary(plan.nextSettings),
      };
    }
    const savedSettings = await options.stt.updateSettings(plan.nextSettings);
    return {
      settingKey: "stt",
      operation: "stt_policy",
      changed: true,
      text: sttPolicyText(plan, savedSettings),
      previousSummary: sttSettingsSummary(plan.previousSettings),
      nextSummary: sttSettingsSummary(savedSettings),
    };
  }

  if (input.operation === "media_playback") {
    const current = options.media?.readSettings();
    if (!current || !options.media?.updateSettings)
      throw new Error("Ambient media playback settings updates are not available in this runtime.");
    if (input.field !== "generatedMediaAutoplay" || typeof input.value !== "boolean") {
      throw new Error(`Unsupported media playback settings command: ${input.field ?? "unknown field"}.`);
    }
    const nextSettings: UpdateMediaPlaybackSettingsInput = {
      ...current,
      generatedMediaAutoplay: input.value,
    };
    if (current.generatedMediaAutoplay === nextSettings.generatedMediaAutoplay) {
      return {
        settingKey: "media",
        operation: "media_playback",
        changed: false,
        text: [
          "Ambient generated media playback already configured",
          `Generated media autoplay: ${current.generatedMediaAutoplay}`,
          "No settings were changed and no approval was required.",
        ].join("\n"),
        previousSummary: mediaPlaybackSettingsSummary(current),
        nextSummary: mediaPlaybackSettingsSummary(current),
      };
    }
    const savedSettings = await options.media.updateSettings(nextSettings);
    return {
      settingKey: "media",
      operation: "media_playback",
      changed: true,
      text: [
        "Ambient generated media playback updated",
        `Generated media autoplay: ${current.generatedMediaAutoplay} -> ${savedSettings.generatedMediaAutoplay}`,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      previousSummary: mediaPlaybackSettingsSummary(current),
      nextSummary: mediaPlaybackSettingsSummary(savedSettings),
    };
  }

  if (input.operation === "planner_finalization") {
    const current = options.planner?.readSettings?.();
    if (!current || !options.planner?.updateSettings)
      throw new Error("Ambient Planner settings updates are not available in this runtime.");
    if (input.field !== "autoFinalize" || typeof input.value !== "boolean") {
      throw new Error(`Unsupported Planner settings command: ${input.field ?? "unknown field"}.`);
    }
    const nextSettings: UpdatePlannerSettingsInput = {
      ...current,
      autoFinalize: input.value,
    };
    if (current.autoFinalize === nextSettings.autoFinalize) {
      return {
        settingKey: "planner",
        operation: "planner_finalization",
        changed: false,
        text: [
          "Ambient Planner finalization already configured",
          `Auto-finalize: ${current.autoFinalize}`,
          "No settings were changed.",
        ].join("\n"),
        previousSummary: plannerSettingsSummary(current),
        nextSummary: plannerSettingsSummary(current),
      };
    }
    const savedSettings = await options.planner.updateSettings(nextSettings);
    return {
      settingKey: "planner",
      operation: "planner_finalization",
      changed: true,
      text: [
        "Ambient Planner finalization updated",
        `Auto-finalize: ${current.autoFinalize} -> ${savedSettings.autoFinalize}`,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      previousSummary: plannerSettingsSummary(current),
      nextSummary: plannerSettingsSummary(savedSettings),
    };
  }

  const current = options.search?.readSettings() ?? {};
  if (!options.search?.updateSettings) throw new Error("Ambient search preference updates are not available in this runtime.");
  const catalog = await options
    .discoverAmbientCliPackages(workspacePath, { includeHealth: true })
    .catch(() => ({ packages: [], errors: [] }));
  const searchInput: SearchPreferenceUpdateInput = input.clear
    ? { clear: true, reason: input.reason }
    : {
        providerAlias: input.providerAlias,
        mode: input.mode,
        fallback: input.fallback,
        reason: input.reason,
      };
  const plan = planSearchPreferenceUpdate(searchInput, current, catalog);
  if (!plan.hasChanges) {
    return {
      settingKey: "search",
      operation: "search_preference",
      changed: false,
      text: searchPreferenceUpdateText(plan, current),
      previousSummary: searchSettingsSummary(plan.previousSettings),
      nextSummary: searchSettingsSummary(plan.nextSettings),
    };
  }
  const savedSettings = await options.search.updateSettings(plan.nextSettings);
  return {
    settingKey: "search",
    operation: "search_preference",
    changed: true,
    text: searchPreferenceUpdateText(plan, savedSettings),
    previousSummary: searchSettingsSummary(plan.previousSettings),
    nextSummary: searchSettingsSummary(savedSettings),
  };
}

function voiceSettingsSummary(settings: VoiceSettings): string {
  return [
    `enabled=${settings.enabled}`,
    `mode=${settings.mode}`,
    `autoplay=${settings.autoplay}`,
    `longReply=${settings.longReply}`,
    `maxChars=${settings.maxChars}`,
    settings.providerCapabilityId ? `provider=${settings.providerCapabilityId}` : "provider=none",
    settings.voiceId ? `voice=${settings.voiceId}` : undefined,
  ]
    .filter(Boolean)
    .join("; ");
}

function searchSettingsSummary(settings: SearchRoutingSettings): string {
  const preference = settings.webSearch;
  if (!preference) return "preference=default";
  return `provider=${preference.preferredProvider}; mode=${preference.mode}; fallback=${preference.fallback}`;
}

function sttSettingsSummary(settings: SttSettings): string {
  return [
    `enabled=${settings.enabled}`,
    `mode=${settings.mode}`,
    `spokenLanguage=${settings.spokenLanguage}`,
    `microphone=${settings.microphone?.label ?? settings.microphone?.deviceId ?? "system-default"}`,
    `autoSendAfterTranscription=${settings.autoSendAfterTranscription}`,
    `silenceFinalizeSeconds=${settings.silenceFinalizeSeconds}`,
    `noSpeechGate=${settings.noSpeechGate.enabled}`,
    `rmsThresholdDbfs=${settings.noSpeechGate.rmsThresholdDbfs}`,
    `stopTtsOnSpeech=${settings.bargeIn.stopTtsOnSpeech}`,
    `queueWhileAgentRuns=${settings.bargeIn.queueWhileAgentRuns}`,
    settings.providerCapabilityId ? `provider=${settings.providerCapabilityId}` : "provider=none",
  ].join("; ");
}

function mediaPlaybackSettingsSummary(settings: MediaPlaybackSettings): string {
  return `generatedMediaAutoplay=${settings.generatedMediaAutoplay}`;
}

function plannerSettingsSummary(settings: PlannerSettings): string {
  return `autoFinalize=${settings.autoFinalize}`;
}

function threadSettingsSummary(thread: ThreadSummary): string {
  return `thread=${thread.title}; id=${thread.id}; mode=${thread.collaborationMode}; thinkingLevel=${thread.thinkingLevel}; model=${thread.model}`;
}
