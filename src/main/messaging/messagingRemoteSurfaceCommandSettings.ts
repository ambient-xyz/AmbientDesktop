import type { MessagingAmbientSurface, MessagingBindingDescriptor, RuntimeSurfaceSnapshot } from "../../shared/messagingGateway";
import type { CollaborationMode, ThinkingLevel } from "../../shared/threadTypes";
import type { MessagingRemoteSurfaceSettingUpdateRequest } from "./messagingRemoteSurfaceCommandTypes";
import { normalizeCommand } from "./messagingRemoteSurfaceCommandParsing";

export function settingUpdateCommand(
  commandText: string,
  normalized: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
):
  | {
      kind: "update_setting";
      targetSurface: MessagingAmbientSurface;
      targetChat?: RuntimeSurfaceSnapshot["chats"][number];
      targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
      blocker?: string;
    }
  | undefined {
  if (["enable voice", "turn on voice", "voice on"].includes(normalized)) {
    return voicePolicyCommand("enabled", true, "enable voice");
  }
  if (["disable voice", "turn off voice", "voice off"].includes(normalized)) {
    return voicePolicyCommand("enabled", false, "disable voice");
  }

  const voiceMode = normalized.match(/^set\s+(?:setting\s+)?voice\s+mode\s+(.+)$/);
  if (voiceMode) {
    const mode = voiceMode[1]?.trim();
    if (!["off", "assistant-final", "always", "tagged"].includes(mode ?? "")) {
      return settingBlocker(`Unsupported voice mode: ${voiceMode[1]}. Use off, assistant-final, always, or tagged.`);
    }
    return voicePolicyCommand("mode", mode!, "set voice mode");
  }

  const voiceBoolean = normalized.match(/^set\s+(?:setting\s+)?voice\s+(enabled|autoplay)\s+(.+)$/);
  if (voiceBoolean) {
    const value = parseBooleanSettingValue(voiceBoolean[2] ?? "");
    if (value === undefined) return settingBlocker(`Unsupported boolean value: ${voiceBoolean[2]}. Use on/off, true/false, or yes/no.`);
    return voicePolicyCommand(voiceBoolean[1]!, value, `set voice ${voiceBoolean[1]}`);
  }

  const voiceLongReply = normalized.match(/^set\s+(?:setting\s+)?voice\s+(?:long[-\s]?reply|longreply)\s+(.+)$/);
  if (voiceLongReply) {
    const value = voiceLongReply[1]?.trim();
    if (!["summarize", "skip", "ask"].includes(value ?? "")) {
      return settingBlocker(`Unsupported voice long-reply behavior: ${voiceLongReply[1]}. Use summarize, skip, or ask.`);
    }
    return voicePolicyCommand("longReply", value!, "set voice longReply");
  }

  const voiceMaxChars = normalized.match(/^set\s+(?:setting\s+)?voice\s+(?:max\s+chars|maxchars|max\s+characters)\s+(\d+)$/);
  if (voiceMaxChars) {
    const value = Number.parseInt(voiceMaxChars[1] ?? "", 10);
    if (!Number.isFinite(value) || value < 100 || value > 20_000) {
      return settingBlocker("Voice maxChars must be between 100 and 20000.");
    }
    return voicePolicyCommand("maxChars", value, "set voice maxChars");
  }

  const threadSettings = threadSettingsCommand(normalized, binding, surface);
  if (threadSettings) return threadSettings;

  const plannerFinalization = plannerFinalizationCommand(normalized);
  if (plannerFinalization) return plannerFinalization;

  const speechPolicy = speechPolicyCommand(commandText, normalized);
  if (speechPolicy) return speechPolicy;

  const mediaPlayback = mediaPlaybackCommand(normalized);
  if (mediaPlayback) return mediaPlayback;

  const clearSearch = normalized.match(/^(?:clear|reset)\s+(?:web\s+)?search(?:\s+preference|\s+routing)?$/);
  if (clearSearch) {
    return {
      kind: "update_setting",
      targetSurface: "settings",
      targetSettingUpdate: {
        settingKey: "search",
        operation: "search_preference",
        clear: true,
        reason: "remote surface command cleared search preference",
      },
    };
  }

  const searchProvider = normalized.match(/^(prefer|require|set)\s+(?:web\s+)?search(?:\s+provider|\s+preference)?\s+(.+)$/);
  if (searchProvider) {
    const verb = searchProvider[1] ?? "set";
    const providerAlias = (searchProvider[2] ?? "").trim();
    if (!providerAlias) return settingBlocker("Search provider alias is empty.");
    const mode = verb === "require" ? "require" : "prefer";
    return {
      kind: "update_setting",
      targetSurface: "settings",
      targetSettingUpdate: {
        settingKey: "search",
        operation: "search_preference",
        providerAlias,
        mode,
        fallback: mode === "require" ? "block" : "allow",
        reason: `remote surface command ${mode} search provider`,
      },
    };
  }

  return undefined;
}

function voicePolicyCommand(
  field: string,
  value: string | number | boolean,
  reason: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate: MessagingRemoteSurfaceSettingUpdateRequest;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    targetSettingUpdate: {
      settingKey: "voice",
      operation: "voice_policy",
      field,
      value,
      reason: `remote surface command ${reason}`,
    },
  };
}

function plannerFinalizationCommand(normalized: string):
  | {
      kind: "update_setting";
      targetSurface: "settings";
      targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
      blocker?: string;
    }
  | undefined {
  if (
    [
      "enable planner autofinalize",
      "enable planner auto finalize",
      "turn on planner autofinalize",
      "turn on planner auto finalize",
      "planner autofinalize on",
      "planner auto finalize on",
    ].includes(normalized)
  ) {
    return plannerFinalizationUpdateCommand(true, "enable planner autoFinalize");
  }
  if (
    [
      "disable planner autofinalize",
      "disable planner auto finalize",
      "turn off planner autofinalize",
      "turn off planner auto finalize",
      "planner autofinalize off",
      "planner auto finalize off",
    ].includes(normalized)
  ) {
    return plannerFinalizationUpdateCommand(false, "disable planner autoFinalize");
  }

  const booleanMatch = normalized.match(
    /^set\s+(?:setting\s+)?planner\s+(?:auto[-\s]?finalize|auto[-\s]?finalization|autofinalize|finalization\s+auto)\s+(.+)$/,
  );
  if (booleanMatch) {
    const value = parseBooleanSettingValue(booleanMatch[1] ?? "");
    if (value === undefined)
      return settingBlocker(`Unsupported planner autoFinalize value: ${booleanMatch[1]}. Use on/off, true/false, automatic, or manual.`);
    return plannerFinalizationUpdateCommand(value, "set planner autoFinalize");
  }

  const modeMatch = normalized.match(/^set\s+(?:setting\s+)?planner\s+finalization(?:\s+mode)?\s+(.+)$/);
  if (modeMatch) {
    const mode = normalizeCommand(modeMatch[1] ?? "").replace(/[-_]/g, " ");
    if (["automatic", "auto", "auto finalize", "autofinalize", "on"].includes(mode)) {
      return plannerFinalizationUpdateCommand(true, "set planner finalization automatic");
    }
    if (["manual", "off"].includes(mode)) {
      return plannerFinalizationUpdateCommand(false, "set planner finalization manual");
    }
    return settingBlocker(`Unsupported planner finalization mode: ${modeMatch[1]}. Use automatic or manual.`);
  }

  return undefined;
}

function plannerFinalizationUpdateCommand(
  autoFinalize: boolean,
  reason: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate: MessagingRemoteSurfaceSettingUpdateRequest;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    targetSettingUpdate: {
      settingKey: "planner",
      operation: "planner_finalization",
      field: "autoFinalize",
      value: autoFinalize,
      reason: `remote surface command ${reason}`,
    },
  };
}

function threadSettingsCommand(
  normalized: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
):
  | {
      kind: "update_setting";
      targetSurface: "chat";
      targetChat?: RuntimeSurfaceSnapshot["chats"][number];
      targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
      blocker?: string;
    }
  | undefined {
  const mode = normalized.match(/^set\s+(?:selected\s+)?(?:chat|thread)\s+(?:mode|collaboration\s+mode)\s+(.+)$/);
  if (mode) {
    const value = normalizeCommand(mode[1] ?? "");
    if (!isCollaborationMode(value)) return settingBlockerForChat(`Unsupported chat mode: ${mode[1]}. Use agent or planner.`);
    return threadSettingsUpdateCommand("collaborationMode", value, "set chat mode", binding, surface);
  }

  const thinking = normalized.match(
    /^set\s+(?:selected\s+)?(?:chat|thread)\s+(?:thinking|thinking\s+level|reasoning|reasoning\s+level)\s+(.+)$/,
  );
  if (thinking) {
    const value = normalizeCommand(thinking[1] ?? "");
    if (!isThinkingLevel(value))
      return settingBlockerForChat(`Unsupported chat thinking level: ${thinking[1]}. Use minimal, low, medium, high, or xhigh.`);
    return threadSettingsUpdateCommand("thinkingLevel", value, "set chat thinking", binding, surface);
  }

  return undefined;
}

function threadSettingsUpdateCommand(
  field: "collaborationMode" | "thinkingLevel",
  value: CollaborationMode | ThinkingLevel,
  reason: string,
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): {
  kind: "update_setting";
  targetSurface: "chat";
  targetChat?: RuntimeSurfaceSnapshot["chats"][number];
  targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
  blocker?: string;
} {
  const targetChat = selectedChatForThreadSettings(binding, surface);
  if (!targetChat) {
    return settingBlockerForChat(
      "No target chat thread is selected. Open a chat first or bind this Remote Ambient Surface conversation to a chat.",
    );
  }
  return {
    kind: "update_setting",
    targetSurface: "chat",
    targetChat,
    targetSettingUpdate: {
      settingKey: "thread",
      operation: "thread_settings",
      threadId: targetChat.id,
      threadTitle: targetChat.title,
      field,
      value,
      reason: `remote surface command ${reason}`,
    },
  };
}

function selectedChatForThreadSettings(
  binding: MessagingBindingDescriptor | undefined,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["chats"][number] | undefined {
  if (binding?.chatThreadId) {
    const selected = surface.chats.find((chat) => chat.id === binding.chatThreadId);
    if (selected) return selected;
  }
  if (surface.activeChatId) {
    const active = surface.chats.find((chat) => chat.id === surface.activeChatId);
    if (active) return active;
  }
  if (surface.chats.length === 1) return surface.chats[0];
  return undefined;
}

function isCollaborationMode(value: string): value is CollaborationMode {
  return value === "agent" || value === "planner";
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function settingBlockerForChat(blocker: string): {
  kind: "update_setting";
  targetSurface: "chat";
  blocker: string;
} {
  return {
    kind: "update_setting",
    targetSurface: "chat",
    blocker,
  };
}

function speechPolicyCommand(
  commandText: string,
  normalized: string,
):
  | {
      kind: "update_setting";
      targetSurface: "settings";
      targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
      blocker?: string;
    }
  | undefined {
  if (
    [
      "enable speech",
      "enable speech input",
      "turn on speech",
      "turn on speech input",
      "speech on",
      "speech input on",
      "enable stt",
      "stt on",
    ].includes(normalized)
  ) {
    return sttPolicyCommand("enabled", true, "enable speech input");
  }
  if (
    [
      "disable speech",
      "disable speech input",
      "turn off speech",
      "turn off speech input",
      "speech off",
      "speech input off",
      "disable stt",
      "stt off",
    ].includes(normalized)
  ) {
    return sttPolicyCommand("enabled", false, "disable speech input");
  }

  const prefix = "(?:speech|speech input|stt)";
  const speechBoolean = normalized.match(
    new RegExp(
      `^set\\s+(?:setting\\s+)?${prefix}\\s+(enabled|auto[-\\s]?send|autosend|auto[-\\s]?send[-\\s]?after[-\\s]?transcription|no[-\\s]?speech[-\\s]?gate|stop[-\\s]?tts[-\\s]?on[-\\s]?speech|queue[-\\s]?while[-\\s]?agent[-\\s]?runs)\\s+(.+)$`,
    ),
  );
  if (speechBoolean) {
    const value = parseBooleanSettingValue(speechBoolean[2] ?? "");
    if (value === undefined) return settingBlocker(`Unsupported boolean value: ${speechBoolean[2]}. Use on/off, true/false, or yes/no.`);
    const field = normalizeSpeechField(speechBoolean[1] ?? "");
    if (!field) return settingBlocker(`Unsupported speech policy field: ${speechBoolean[1]}.`);
    return sttPolicyCommand(field, value, `set speech ${field}`);
  }

  const language = commandText.trim().match(/^(?:set\s+)?(?:speech|speech input|stt)\s+(?:language|spoken\s+language)\s+(.+)$/i);
  if (language) {
    const value = language[1]?.trim().replace(/\s+/g, " ");
    if (!value) return settingBlocker("Speech language is empty.");
    if (value.length > 80) return settingBlocker("Speech language is too long. Use 80 characters or fewer.");
    return sttPolicyCommand("spokenLanguage", value, "set speech language");
  }

  const silence = normalized.match(
    new RegExp(
      `^set\\s+(?:setting\\s+)?${prefix}\\s+(?:silence|silence\\s+finalize|silence\\s+finalize\\s+seconds|silence\\s+before\\s+transcribe)\\s+([0-9]+(?:\\.[0-9]+)?)$`,
    ),
  );
  if (silence) {
    const value = Number.parseFloat(silence[1] ?? "");
    if (!Number.isFinite(value) || value < 0.3 || value > 2.5)
      return settingBlocker("Speech silenceFinalizeSeconds must be between 0.3 and 2.5.");
    return sttPolicyCommand("silenceFinalizeSeconds", value, "set speech silenceFinalizeSeconds");
  }

  const rms = normalized.match(
    new RegExp(
      `^set\\s+(?:setting\\s+)?${prefix}\\s+(?:rms|rms\\s+threshold|no[-\\s]?speech[-\\s]?gate\\s+rms|no[-\\s]?speech[-\\s]?threshold)\\s+(-?[0-9]+)$`,
    ),
  );
  if (rms) {
    const value = Number.parseInt(rms[1] ?? "", 10);
    if (!Number.isFinite(value) || value < -90 || value > -20)
      return settingBlocker("Speech RMS threshold must be between -90 and -20 dBFS.");
    return sttPolicyCommand("noSpeechGateRmsThresholdDbfs", value, "set speech noSpeechGateRmsThresholdDbfs");
  }

  return undefined;
}

function normalizeSpeechField(field: string): string | undefined {
  const normalized = normalizeCommand(field).replace(/[-_]/g, " ");
  if (normalized === "enabled") return "enabled";
  if (["auto send", "autosend", "auto send after transcription"].includes(normalized)) return "autoSendAfterTranscription";
  if (normalized === "no speech gate") return "noSpeechGateEnabled";
  if (normalized === "stop tts on speech") return "stopTtsOnSpeech";
  if (normalized === "queue while agent runs") return "queueWhileAgentRuns";
  return undefined;
}

function sttPolicyCommand(
  field: string,
  value: string | number | boolean,
  reason: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate: MessagingRemoteSurfaceSettingUpdateRequest;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    targetSettingUpdate: {
      settingKey: "stt",
      operation: "stt_policy",
      field,
      value,
      reason: `remote surface command ${reason}`,
    },
  };
}

function mediaPlaybackCommand(normalized: string):
  | {
      kind: "update_setting";
      targetSurface: "settings";
      targetSettingUpdate?: MessagingRemoteSurfaceSettingUpdateRequest;
      blocker?: string;
    }
  | undefined {
  if (
    ["enable generated media autoplay", "turn on generated media autoplay", "generated media autoplay on", "media autoplay on"].includes(
      normalized,
    )
  ) {
    return mediaPlaybackUpdateCommand(true, "enable generated media autoplay");
  }
  if (
    [
      "disable generated media autoplay",
      "turn off generated media autoplay",
      "generated media autoplay off",
      "media autoplay off",
    ].includes(normalized)
  ) {
    return mediaPlaybackUpdateCommand(false, "disable generated media autoplay");
  }
  const mediaBoolean = normalized.match(
    /^set\s+(?:setting\s+)?(?:generated\s+media|media|media\s+browser)\s+(?:autoplay|auto[-\s]?play|generated\s+media\s+autoplay)\s+(.+)$/,
  );
  if (mediaBoolean) {
    const value = parseBooleanSettingValue(mediaBoolean[1] ?? "");
    if (value === undefined) return settingBlocker(`Unsupported boolean value: ${mediaBoolean[1]}. Use on/off, true/false, or yes/no.`);
    return mediaPlaybackUpdateCommand(value, "set generated media autoplay");
  }
  return undefined;
}

function mediaPlaybackUpdateCommand(
  generatedMediaAutoplay: boolean,
  reason: string,
): {
  kind: "update_setting";
  targetSurface: "settings";
  targetSettingUpdate: MessagingRemoteSurfaceSettingUpdateRequest;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    targetSettingUpdate: {
      settingKey: "media",
      operation: "media_playback",
      field: "generatedMediaAutoplay",
      value: generatedMediaAutoplay,
      reason: `remote surface command ${reason}`,
    },
  };
}

function settingBlocker(blocker: string): {
  kind: "update_setting";
  targetSurface: "settings";
  blocker: string;
} {
  return {
    kind: "update_setting",
    targetSurface: "settings",
    blocker,
  };
}

function parseBooleanSettingValue(value: string): boolean | undefined {
  const normalized = normalizeCommand(value);
  if (["on", "true", "yes", "enabled", "enable", "1"].includes(normalized)) return true;
  if (["automatic", "auto"].includes(normalized)) return true;
  if (["off", "false", "no", "disabled", "disable", "manual", "0"].includes(normalized)) return false;
  return undefined;
}
