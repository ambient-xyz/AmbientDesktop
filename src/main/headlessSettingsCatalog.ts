import type { RuntimeUxSettingDescriptor } from "../shared/messagingGateway";

const RUNTIME_SNAPSHOT_TOOL = "ambient_runtime_surface_snapshot";
const REMOTE_COMMAND_PREVIEW_TOOL = "ambient_messaging_remote_surface_command_preview";
const REMOTE_COMMAND_APPLY_TOOL = "ambient_messaging_remote_surface_command_apply";
const REMOTE_COMMAND_TOOLS = [REMOTE_COMMAND_PREVIEW_TOOL, REMOTE_COMMAND_APPLY_TOOL];

export function buildHeadlessSettingsCatalog(): RuntimeUxSettingDescriptor[] {
  return [
    readyRead("overview.workspace", "Workspace", "overview", "overview.workspace", [
      "Workspace identity is exposed in runtime surface snapshots without renderer state.",
    ]),
    partialRead("overview.app", "App version and build", "overview", "overview.app", [
      "Desktop state has app/build metadata, but the headless runtime snapshot does not expose it yet.",
    ]),
    partialRead("overview.updates", "Updates", "overview", "overview.updates", [
      "Update status is renderer/main-process state and still needs a headless read projection.",
    ]),
    partialRead("overview.appearance", "Appearance", "overview", "overview.appearance", [
      "Theme preference is a Desktop UI preference and is not yet exposed through the Remote Ambient Surface command lane.",
    ]),

    readyMutate("voice.output", "Voice output policy", "voice", "voice.output", [
      "enable voice",
      "disable voice",
      "set voice mode off",
      "set voice mode assistant-final",
      "set voice longReply summarize",
      "set voice maxChars 1500",
    ], [
      "Voice output policy is readable in runtime surface snapshots and writable through the Remote Ambient Surface command lane.",
    ]),
    partialMutate("voice.provider", "Voice provider", "voice", "voice.provider", [
      "Voice provider selection is supported by chat voice tools, but not yet by Remote Ambient Surface command parsing.",
    ]),
    partialMutate("voice.voice", "Voice selection", "voice", "voice.voice", [
      "Per-provider voice selection is supported by chat voice tools, but not yet by Remote Ambient Surface command parsing.",
    ]),
    partialMutate("voice.format", "Voice artifact format", "voice", "voice.format", [
      "Voice format is readable in settings but not yet writable through Remote Ambient Surface commands.",
    ]),
    readyMutate("voice.playback", "Voice playback", "voice", "voice.playback", [
      "set voice autoplay on",
      "set voice autoplay off",
      "set voice enabled on",
      "set voice enabled off",
    ], [
      "Voice playback toggles are approval-gated and use the Remote Ambient Surface command lane.",
    ]),
    partialMutate("voice.artifacts", "Voice artifacts", "voice", "voice.artifacts", [
      "Voice artifact retention is readable in settings but cache cleanup and retention changes need a typed headless command.",
    ]),
    partialRead("voice.setup", "Voice setup and diagnostics", "voice", "voice.setup", [
      "Provider cache and diagnostics are available through voice tools, but the settings row itself is not yet projected as a headless setting.",
    ]),

    readyMutate("search.preference", "Search preference", "search", "search.preference", [
      "prefer search provider brave",
      "require search provider brave",
      "clear search preference",
    ], [
      "Search routing preference is readable in runtime surface snapshots and writable through the Remote Ambient Surface command lane.",
    ]),

    readyRead("model-mode.model", "Model", "model-mode", "model-mode.model", [
      "The active thread model is readable through runtime surface snapshots. Remote model switching remains intentionally out of scope until the model-selection contract is narrower.",
    ]),
    readyMutate("model-mode.mode", "Agent/planner mode", "model-mode", "model-mode.mode", [
      "set chat mode agent",
      "set chat mode planner",
      "set thread mode agent",
    ], [
      "The selected chat thread collaboration mode is readable in runtime surface snapshots and writable through the Remote Ambient Surface command lane.",
    ]),
    partialMutate("model-mode.aggressive-retries", "Aggressive retries", "model-mode", "model-mode.aggressive-retries", [
      "Aggressive retry settings are readable in Desktop state, but are not yet exposed through a typed headless settings API.",
    ]),
    readyMutate("model-mode.thinking", "Thinking level", "model-mode", "model-mode.thinking", [
      "set chat thinking minimal",
      "set chat thinking medium",
      "set thread thinking high",
    ], [
      "The selected chat thread thinking level is readable in runtime surface snapshots and writable through the Remote Ambient Surface command lane.",
    ]),
    readyRead("model-mode.context", "Context usage", "model-mode", "model-mode.context", [
      "Context usage is renderer-independent runtime state, but only read projection is in scope for this catalog slice.",
    ]),
    partialMutate("model-mode.compaction", "Compaction", "model-mode", "model-mode.compaction", [
      "Compaction settings exist in Desktop state, but are not yet exposed through a typed headless settings API.",
    ]),
    readyMutate("model-mode.planner", "Planner finalization", "model-mode", "model-mode.planner", [
      "set planner autoFinalize off",
      "set planner autoFinalize on",
      "set planner finalization manual",
      "set planner finalization automatic",
    ], [
      "Planner auto-finalization is readable in runtime surface snapshots and writable through the Remote Ambient Surface command lane.",
    ]),

    readyMutate("speech.input", "Speech input policy", "speech", "speech.input", [
      "enable speech input",
      "disable speech input",
      "set speech language English",
    ], [
      "Speech input enablement and language are readable in runtime surface snapshots and writable through the Remote Ambient Surface command lane.",
    ]),
    partialMutate("speech.provider", "Speech provider", "speech", "speech.provider", [
      "Speech provider selection is supported by STT tools, but not yet by Remote Ambient Surface command parsing.",
    ]),
    partialRead("speech.microphone", "Microphone", "speech", "speech.microphone", [
      "Microphone device selection and validation require local audio capture and are not headless-safe Remote Ambient Surface commands.",
    ]),
    readyMutate("speech.language", "Spoken language", "speech", "speech.language", [
      "set speech language English",
      "set stt language Spanish",
    ], [
      "Spoken language is approval-gated and uses the Remote Ambient Surface command lane.",
    ]),
    partialMutate("speech.shortcut", "Push-to-talk shortcut", "speech", "speech.shortcut", [
      "Keyboard shortcut capture is renderer-owned and needs a separate headless-safe representation.",
    ]),
    readyMutate("speech.behavior", "Speech behavior", "speech", "speech.behavior", [
      "set speech enabled on",
      "set speech autoSend on",
      "set speech autoSend off",
    ], [
      "Speech behavior toggles are approval-gated and use the Remote Ambient Surface command lane.",
    ]),
    readyMutate("speech.advanced", "Advanced speech recognition", "speech", "speech.advanced", [
      "set speech silence 0.8",
      "set speech noSpeechGate on",
      "set speech rmsThreshold -55",
      "set speech stopTtsOnSpeech on",
      "set speech queueWhileAgentRuns on",
    ], [
      "Advanced STT policy fields are approval-gated and use the Remote Ambient Surface command lane.",
    ]),

    readyMutate("media.generated", "Generated media playback", "media-browser", "media.generated", [
      "set generated media autoplay on",
      "set generated media autoplay off",
      "enable generated media autoplay",
      "disable generated media autoplay",
    ], [
      "Generated media autoplay is readable in runtime surface snapshots and writable through the Remote Ambient Surface command lane.",
    ]),

    partialRead("security.api-key", "Ambient API key source", "security-access", "security.api-key", [
      "Provider key source is visible in Desktop state; headless projection should expose source only, never key material.",
    ]),
    planned("security.browser", "Browser access", "security-access", "security.browser", [
      "Browser profile access needs a purpose-specific headless policy before remote control can inspect or change it.",
    ]),
    partialRead("security.google", "Google Workspace grants", "security-access", "security.google", [
      "Google grant state exists in Desktop, but still needs a concise headless projection.",
    ]),
    readyRead("security.grants", "Permission grants and pending approvals", "security-access", "security.grants", [
      "Pending permission prompts and active permission grants are readable in runtime surface snapshots and the notifications projection.",
      "Active grants can be revoked through the owner-authenticated Remote Ambient Surface command lane.",
    ]),
    readyRead("security.log", "Permission log", "security-access", "security.log", [
      "Recent permission audit summaries are readable in runtime surface snapshots and the notifications projection.",
      "The headless view exposes compact decisions and reasons, not full renderer audit UI affordances.",
    ]),

    planned("diagnostics.export", "Diagnostics export", "diagnostics", "diagnostics.export", [
      "Diagnostics export needs an explicit artifact policy before remote/headless use.",
    ]),
    partialRead("about.credits", "About and credits", "about", "about.credits", [
      "Static app metadata can be projected later; it is not needed for current Remote Ambient Surface operation.",
    ]),
  ];
}

function readyRead(
  key: string,
  label: string,
  sectionId: string,
  rowId: string,
  notes: string[],
): RuntimeUxSettingDescriptor {
  return setting({ key, label, sectionId, rowId, status: "ready", readable: true, writable: false, approval: false, plannerSafe: true, notes });
}

function readyMutate(
  key: string,
  label: string,
  sectionId: string,
  rowId: string,
  commandExamples: string[],
  notes: string[],
): RuntimeUxSettingDescriptor {
  return setting({
    key,
    label,
    sectionId,
    rowId,
    status: "ready",
    readable: true,
    writable: true,
    approval: true,
    plannerSafe: false,
    toolNames: REMOTE_COMMAND_TOOLS,
    commandExamples,
    notes,
  });
}

function partialRead(
  key: string,
  label: string,
  sectionId: string,
  rowId: string,
  notes: string[],
): RuntimeUxSettingDescriptor {
  return setting({ key, label, sectionId, rowId, status: "partial", readable: true, writable: false, approval: false, plannerSafe: true, notes });
}

function partialMutate(
  key: string,
  label: string,
  sectionId: string,
  rowId: string,
  notes: string[],
): RuntimeUxSettingDescriptor {
  return setting({ key, label, sectionId, rowId, status: "partial", readable: true, writable: false, approval: true, plannerSafe: false, notes });
}

function planned(
  key: string,
  label: string,
  sectionId: string,
  rowId: string,
  notes: string[],
): RuntimeUxSettingDescriptor {
  return setting({ key, label, sectionId, rowId, status: "planned", readable: false, writable: false, approval: true, plannerSafe: false, notes });
}

function setting(input: {
  key: string;
  label: string;
  sectionId: string;
  rowId: string;
  status: RuntimeUxSettingDescriptor["headlessStatus"];
  readable: boolean;
  writable: boolean;
  approval: boolean;
  plannerSafe: boolean;
  toolNames?: string[];
  commandExamples?: string[];
  notes: string[];
}): RuntimeUxSettingDescriptor {
  return {
    key: input.key,
    label: input.label,
    sectionId: input.sectionId,
    rowId: input.rowId,
    headlessStatus: input.status,
    headlessReadable: input.readable,
    headlessWritable: input.writable,
    requiresApproval: input.approval,
    plannerSafe: input.plannerSafe,
    ...(input.toolNames?.length ? { toolNames: input.toolNames } : {}),
    ...(input.commandExamples?.length ? { commandExamples: input.commandExamples } : {}),
    notes: input.notes,
  };
}

export const HEADLESS_SETTINGS_RUNTIME_SNAPSHOT_TOOL = RUNTIME_SNAPSHOT_TOOL;
export const HEADLESS_SETTINGS_REMOTE_COMMAND_TOOLS = REMOTE_COMMAND_TOOLS;
