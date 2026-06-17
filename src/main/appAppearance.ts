import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AppAppearance,
  LocalDeepResearchSettings,
  MediaPlaybackSettings,
  PlannerSettings,
  ResolvedTheme,
  SearchRoutingSettings,
  SttSettings,
  ThemePreference,
  ThinkingDisplayMode,
  ThinkingDisplaySettings,
  VoiceSettings,
} from "../shared/types";
import { normalizeLocalDeepResearchSettings } from "./local-deep-research/localDeepResearchProviderStack";
import { normalizeSearchRoutingSettingsWithWebResearch } from "./webResearchProviderStack";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const DEFAULT_MEDIA_PLAYBACK_SETTINGS: MediaPlaybackSettings = {
  generatedMediaAutoplay: false,
};
export const DEFAULT_THINKING_DISPLAY_SETTINGS: ThinkingDisplaySettings = {
  mode: "transient",
  showRunStatusCard: false,
};
export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  autoFinalize: true,
};
export const DEFAULT_SEARCH_ROUTING_SETTINGS: SearchRoutingSettings = {
  webResearch: normalizeSearchRoutingSettingsWithWebResearch(undefined).webResearch,
};
export const DEFAULT_LOCAL_DEEP_RESEARCH_SETTINGS: LocalDeepResearchSettings = normalizeLocalDeepResearchSettings(undefined);
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  mode: "assistant-final",
  autoplay: false,
  maxChars: 1500,
  longReply: "summarize",
  format: "mp3",
  artifactCacheMaxMb: 30,
};
export const DEFAULT_STT_SETTINGS: SttSettings = {
  enabled: false,
  spokenLanguage: "English",
  microphone: {},
  mode: "push-to-talk",
  autoSendAfterTranscription: true,
  silenceFinalizeSeconds: 0.8,
  noSpeechGate: {
    enabled: true,
    rmsThresholdDbfs: -55,
  },
  bargeIn: {
    stopTtsOnSpeech: true,
    queueWhileAgentRuns: true,
  },
};

const themePreferences = new Set<ThemePreference>(["system", "light", "dark"]);
const voiceModes = new Set<VoiceSettings["mode"]>(["off", "assistant-final", "always", "tagged"]);
const voiceLongReplyBehaviors = new Set<VoiceSettings["longReply"]>(["summarize", "skip", "ask"]);
const voiceOutputFormats = new Set<VoiceSettings["format"]>(["mp3", "wav", "ogg"]);
const sttModes = new Set<SttSettings["mode"]>(["push-to-talk"]);
const thinkingDisplayModes = new Set<ThinkingDisplayMode>(["off", "transient", "full"]);

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && themePreferences.has(value as ThemePreference);
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

export function resolveAppearance(themePreference: ThemePreference, systemPrefersDark: boolean): AppAppearance {
  const resolvedTheme: ResolvedTheme =
    themePreference === "system" ? (systemPrefersDark ? "dark" : "light") : themePreference;
  return { themePreference, resolvedTheme };
}

export function appearanceBackgroundColor(resolvedTheme: ResolvedTheme): string {
  return resolvedTheme === "dark" ? "#0f1418" : "#ffffff";
}

export function normalizeMediaPlaybackSettings(value: unknown): MediaPlaybackSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    generatedMediaAutoplay:
      typeof record.generatedMediaAutoplay === "boolean"
        ? record.generatedMediaAutoplay
        : DEFAULT_MEDIA_PLAYBACK_SETTINGS.generatedMediaAutoplay,
  };
}

export function normalizeThinkingDisplaySettings(value: unknown): ThinkingDisplaySettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    mode:
      typeof record.mode === "string" && thinkingDisplayModes.has(record.mode as ThinkingDisplayMode)
        ? (record.mode as ThinkingDisplayMode)
        : DEFAULT_THINKING_DISPLAY_SETTINGS.mode,
    showRunStatusCard:
      typeof record.showRunStatusCard === "boolean"
        ? record.showRunStatusCard
        : DEFAULT_THINKING_DISPLAY_SETTINGS.showRunStatusCard,
  };
}

export function normalizePlannerSettings(value: unknown): PlannerSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    autoFinalize: typeof record.autoFinalize === "boolean" ? record.autoFinalize : DEFAULT_PLANNER_SETTINGS.autoFinalize,
  };
}

export function normalizeSearchRoutingSettings(value: unknown): SearchRoutingSettings {
  return normalizeSearchRoutingSettingsWithWebResearch(value);
}

export function normalizeLocalDeepResearchAppSettings(value: unknown): LocalDeepResearchSettings {
  return normalizeLocalDeepResearchSettings(value);
}

export function normalizeVoiceSettings(value: unknown): VoiceSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const providerCapabilityId = typeof record.providerCapabilityId === "string" && record.providerCapabilityId.trim()
    ? record.providerCapabilityId.trim()
    : undefined;
  const voiceId = typeof record.voiceId === "string" && record.voiceId.trim() ? record.voiceId.trim() : undefined;
  const preferredVoicesByProvider = normalizePreferredVoicesByProvider(record.preferredVoicesByProvider);
  const maxChars = typeof record.maxChars === "number" && Number.isFinite(record.maxChars)
    ? Math.max(250, Math.min(Math.floor(record.maxChars), 20_000))
    : DEFAULT_VOICE_SETTINGS.maxChars;
  const artifactCacheMaxMb = typeof record.artifactCacheMaxMb === "number" && Number.isFinite(record.artifactCacheMaxMb)
    ? Math.max(0, Math.min(Math.floor(record.artifactCacheMaxMb), 1024))
    : DEFAULT_VOICE_SETTINGS.artifactCacheMaxMb;
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_VOICE_SETTINGS.enabled,
    mode: typeof record.mode === "string" && voiceModes.has(record.mode as VoiceSettings["mode"])
      ? (record.mode as VoiceSettings["mode"])
      : DEFAULT_VOICE_SETTINGS.mode,
    autoplay: typeof record.autoplay === "boolean" ? record.autoplay : DEFAULT_VOICE_SETTINGS.autoplay,
    ...(providerCapabilityId ? { providerCapabilityId } : {}),
    ...(voiceId ? { voiceId } : {}),
    ...(Object.keys(preferredVoicesByProvider).length ? { preferredVoicesByProvider } : {}),
    maxChars,
    longReply: typeof record.longReply === "string" && voiceLongReplyBehaviors.has(record.longReply as VoiceSettings["longReply"])
      ? (record.longReply as VoiceSettings["longReply"])
      : DEFAULT_VOICE_SETTINGS.longReply,
    format: typeof record.format === "string" && voiceOutputFormats.has(record.format as VoiceSettings["format"])
      ? (record.format as VoiceSettings["format"])
      : DEFAULT_VOICE_SETTINGS.format,
    artifactCacheMaxMb,
  };
}

function normalizePreferredVoicesByProvider(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([providerCapabilityId, voiceId]) => {
    const provider = providerCapabilityId.trim();
    const voice = typeof voiceId === "string" ? voiceId.trim() : "";
    return provider && voice ? [[provider, voice] as const] : [];
  });
  return Object.fromEntries(entries);
}

export function normalizeSttSettings(value: unknown): SttSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const gate = record.noSpeechGate && typeof record.noSpeechGate === "object" ? (record.noSpeechGate as Record<string, unknown>) : {};
  const bargeIn = record.bargeIn && typeof record.bargeIn === "object" ? (record.bargeIn as Record<string, unknown>) : {};
  const microphone = record.microphone && typeof record.microphone === "object" ? (record.microphone as Record<string, unknown>) : {};
  const providerCapabilityId = typeof record.providerCapabilityId === "string" && record.providerCapabilityId.trim()
    ? record.providerCapabilityId.trim()
    : undefined;
  const pushToTalkShortcut = typeof record.pushToTalkShortcut === "string" && record.pushToTalkShortcut.trim()
    ? record.pushToTalkShortcut.trim()
    : undefined;
  const microphoneDeviceId = typeof microphone.deviceId === "string" && microphone.deviceId.trim()
    ? microphone.deviceId.trim()
    : undefined;
  const microphoneLabel = typeof microphone.label === "string" && microphone.label.trim()
    ? microphone.label.trim()
    : undefined;
  const spokenLanguage = typeof record.spokenLanguage === "string" && record.spokenLanguage.trim()
    ? record.spokenLanguage.trim()
    : DEFAULT_STT_SETTINGS.spokenLanguage;
  const silenceFinalizeSeconds = typeof record.silenceFinalizeSeconds === "number" && Number.isFinite(record.silenceFinalizeSeconds)
    ? clampNumber(record.silenceFinalizeSeconds, 0.3, 2.5)
    : DEFAULT_STT_SETTINGS.silenceFinalizeSeconds;
  const rmsThresholdDbfs = typeof gate.rmsThresholdDbfs === "number" && Number.isFinite(gate.rmsThresholdDbfs)
    ? clampNumber(gate.rmsThresholdDbfs, -90, -20)
    : DEFAULT_STT_SETTINGS.noSpeechGate.rmsThresholdDbfs;
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_STT_SETTINGS.enabled,
    ...(providerCapabilityId ? { providerCapabilityId } : {}),
    spokenLanguage,
    ...(pushToTalkShortcut ? { pushToTalkShortcut } : {}),
    microphone: {
      ...(microphoneDeviceId ? { deviceId: microphoneDeviceId } : {}),
      ...(microphoneLabel ? { label: microphoneLabel.slice(0, 160) } : {}),
    },
    mode: typeof record.mode === "string" && sttModes.has(record.mode as SttSettings["mode"])
      ? (record.mode as SttSettings["mode"])
      : DEFAULT_STT_SETTINGS.mode,
    autoSendAfterTranscription:
      typeof record.autoSendAfterTranscription === "boolean"
        ? record.autoSendAfterTranscription
        : DEFAULT_STT_SETTINGS.autoSendAfterTranscription,
    silenceFinalizeSeconds,
    noSpeechGate: {
      enabled: typeof gate.enabled === "boolean" ? gate.enabled : DEFAULT_STT_SETTINGS.noSpeechGate.enabled,
      rmsThresholdDbfs,
    },
    bargeIn: {
      stopTtsOnSpeech: typeof bargeIn.stopTtsOnSpeech === "boolean" ? bargeIn.stopTtsOnSpeech : DEFAULT_STT_SETTINGS.bargeIn.stopTtsOnSpeech,
      queueWhileAgentRuns: typeof bargeIn.queueWhileAgentRuns === "boolean" ? bargeIn.queueWhileAgentRuns : DEFAULT_STT_SETTINGS.bargeIn.queueWhileAgentRuns,
    },
  };
}

export async function readThemePreference(filePath: string): Promise<ThemePreference> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    return normalizeThemePreference(parsed.themePreference);
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export async function writeThemePreference(filePath: string, themePreference: ThemePreference): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ themePreference }, null, 2)}\n`, "utf8");
}

export async function readMediaPlaybackSettings(filePath: string): Promise<MediaPlaybackSettings> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    return normalizeMediaPlaybackSettings(parsed.mediaPlayback);
  } catch {
    return DEFAULT_MEDIA_PLAYBACK_SETTINGS;
  }
}

export async function readThinkingDisplaySettings(filePath: string): Promise<ThinkingDisplaySettings> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    return normalizeThinkingDisplaySettings(parsed.thinkingDisplay);
  } catch {
    return DEFAULT_THINKING_DISPLAY_SETTINGS;
  }
}

export async function readPlannerSettings(filePath: string): Promise<PlannerSettings> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    return normalizePlannerSettings(parsed.planner);
  } catch {
    return DEFAULT_PLANNER_SETTINGS;
  }
}

export async function readVoiceSettings(filePath: string): Promise<VoiceSettings> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    return normalizeVoiceSettings(parsed.voice);
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export async function readSearchRoutingSettings(filePath: string): Promise<SearchRoutingSettings> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    return normalizeSearchRoutingSettings(parsed.search);
  } catch {
    return DEFAULT_SEARCH_ROUTING_SETTINGS;
  }
}

export async function readLocalDeepResearchSettings(filePath: string): Promise<LocalDeepResearchSettings> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    return normalizeLocalDeepResearchAppSettings(parsed.localDeepResearch);
  } catch {
    return DEFAULT_LOCAL_DEEP_RESEARCH_SETTINGS;
  }
}

export async function readSttSettings(filePath: string): Promise<SttSettings> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    return normalizeSttSettings(parsed.stt);
  } catch {
    return DEFAULT_STT_SETTINGS;
  }
}

export async function writeMediaPlaybackSettings(filePath: string, mediaPlayback: MediaPlaybackSettings): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...existing, mediaPlayback }, null, 2)}\n`, "utf8");
}

export async function writeThinkingDisplaySettings(filePath: string, thinkingDisplay: ThinkingDisplaySettings): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...existing, thinkingDisplay: normalizeThinkingDisplaySettings(thinkingDisplay) }, null, 2)}\n`, "utf8");
}

export async function writePlannerSettings(filePath: string, planner: PlannerSettings): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...existing, planner: normalizePlannerSettings(planner) }, null, 2)}\n`, "utf8");
}

export async function writeVoiceSettings(filePath: string, voice: VoiceSettings): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...existing, voice: normalizeVoiceSettings(voice) }, null, 2)}\n`, "utf8");
}

export async function writeSearchRoutingSettings(filePath: string, search: SearchRoutingSettings): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...existing, search: normalizeSearchRoutingSettings(search) }, null, 2)}\n`, "utf8");
}

export async function writeLocalDeepResearchSettings(filePath: string, localDeepResearch: LocalDeepResearchSettings): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...existing, localDeepResearch: normalizeLocalDeepResearchAppSettings(localDeepResearch) }, null, 2)}\n`, "utf8");
}

export async function writeSttSettings(filePath: string, stt: SttSettings): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...existing, stt: normalizeSttSettings(stt) }, null, 2)}\n`, "utf8");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
