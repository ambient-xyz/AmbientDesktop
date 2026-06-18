import { ambientModelLabel } from "../../shared/ambientModels";
import type { DesktopState } from "../../shared/desktopTypes";
import {
  contextUsagePresentation,
  desktopUpdateStatusText,
} from "./RightPanelSettingsCore";
import { formatDurationMs } from "./RightPanelSettingsRuntime";
import {
  settingsSearchMatches,
  type SettingsSearchTarget,
  type SettingsSectionNavItem,
} from "./RightPanelSettingsPrimitives";

type SettingsSearchTermPart = SettingsSearchTarget["terms"][number];

export type RightPanelSettingsSectionsInput = {
  appIsPackaged: boolean;
  voiceStatusLabel: string;
  collaborationMode: string;
  localModelsSummary: string;
  speechStatusLabel: string;
  searchWebStatus: string;
  mcpRuntimeStatus: string;
  visualCatalogCount: number;
  authoredVideoCatalogCount: number;
  writingStyleCatalogCount: number;
  activePermissionGrantCount: number;
  diagnosticStatusKind?: string;
  appVersion: string;
};

export function rightPanelSettingsSections({
  appIsPackaged,
  voiceStatusLabel,
  collaborationMode,
  localModelsSummary,
  speechStatusLabel,
  searchWebStatus,
  mcpRuntimeStatus,
  visualCatalogCount,
  authoredVideoCatalogCount,
  writingStyleCatalogCount,
  activePermissionGrantCount,
  diagnosticStatusKind,
  appVersion,
}: RightPanelSettingsSectionsInput): SettingsSectionNavItem[] {
  return [
    { id: "overview", label: "Overview", status: appIsPackaged ? "Packaged" : "Development" },
    { id: "voice", label: "Voice Output", status: voiceStatusLabel },
    { id: "model-mode", label: "Model & Mode", status: collaborationMode === "planner" ? "Planner" : "Agent" },
    { id: "local-models", label: "Local Models", status: localModelsSummary },
    { id: "speech", label: "Speech Input", status: speechStatusLabel },
    { id: "search-web", label: "Search & Web", status: searchWebStatus },
    { id: "mcp-runtime", label: "MCP Runtime & Web Research", status: mcpRuntimeStatus },
    {
      id: "media-browser",
      label: "Media & Vision",
      status: [
        visualCatalogCount ? `${visualCatalogCount} visual` : undefined,
        authoredVideoCatalogCount ? `${authoredVideoCatalogCount} video` : undefined,
      ].filter(Boolean).join(" / ") || undefined,
    },
    { id: "writing-style", label: "Writing Style", status: writingStyleCatalogCount ? `${writingStyleCatalogCount} catalog` : undefined },
    { id: "security-access", label: "Security & Access", status: `${activePermissionGrantCount} active` },
    { id: "diagnostics", label: "Diagnostics", status: diagnosticStatusKind },
    { id: "about", label: "About", status: appVersion },
  ];
}

export function rightPanelSettingsSectionSearchTerms({
  modelCatalogSearchText,
}: {
  modelCatalogSearchText?: string;
}): Record<string, SettingsSearchTermPart[]> {
  return {
    overview: ["overview", "workspace identity", "app version", "updates", "appearance", "core setup", "first run", "remote control", "remote access"],
    voice: ["voice output", "assistant voice settings"],
    "model-mode": ["model mode", "model & mode", "collaboration mode", "thinking display", "model runtime catalog", "model registry", "local models"],
    "local-models": ["local models", "llama.cpp", "runtime inventory", "resident memory", "local rss", "stop blockers", "sub-agent leases", "minicpm", "voice", "embeddings", modelCatalogSearchText],
    speech: ["speech input", "push to talk settings", "transcription settings"],
    "search-web": ["search web", "web search", "search provider", "provider catalog", "web research", "local deep research", "literesearcher", "llama.cpp", "exa", "scrapling"],
    "mcp-runtime": ["mcp runtime", "web research", "scrapling", "toolhive", "docker", "podman", "container runtime"],
    "media-browser": ["media", "generated media settings", "visual analysis", "vision provider", "screenshot analysis"],
    "writing-style": ["writing style", "style transfer", "tinystyler", "style profile", "rewrite in this style"],
    "security-access": ["security access", "security & access", "credential and permission settings"],
    diagnostics: ["diagnostics", "debug bundle", "diagnostic export history", "diagnostic import", "import diagnostics", "subagent maturity", "maturity gates", "feature flag graduation", "subagent repair", "restart repair", "replay evidence", "child timeline"],
    about: ["about", "app acknowledgements"],
  };
}

type ProviderCatalogSearchCard = {
  id: string;
  displayName: string;
  recommendationSummary: string;
};

type LabelDetailSearchItem = {
  label: string;
  detail?: string;
};

type VoiceProviderSearchModel = {
  statusLabel: string;
  runtimeState: {
    label: string;
    detail?: string;
  };
  selectedProvider?: {
    label: string;
    capabilityId: string;
    voices: Array<{
      id: string;
      label?: string;
      locale?: string;
      style?: string[];
    }>;
  };
  selectedVoiceId?: string;
  selectedFormat?: string;
  enabledChecked: boolean;
  autoplayChecked: boolean;
  availabilityMessage?: string;
  diagnostics?: {
    statusLabel?: string;
    errorLabel?: string;
  };
};

type SttProviderSearchModel = {
  statusLabel: string;
  selectedProvider?: {
    label: string;
    capabilityId: string;
  };
  selectedLanguage: string;
  enabledChecked: boolean;
  availabilityMessage?: string;
  diagnostics?: {
    statusLabel?: string;
  };
};

type ModelCatalogSettingsSearchModel = {
  statusLabel: string;
  summary: string;
  searchText: string;
  localModelsStatusLabel: string;
  localModelsSummary: string;
  localRuntimeSummary: string;
  localProfileRows: Array<{
    label: string;
    modelId: string;
    profileId: string;
    statusLabel: string;
    detailLabels: string[];
  }>;
  localRuntimeGroups: Array<{
    label: string;
    summary: string;
    emptyLabel: string;
  }>;
  localRuntimeRows: Array<{
    label: string;
    modelLabel: string;
    capabilityLabel: string;
    statusLabel: string;
    ownerLabel: string;
    memoryLabel: string;
    lifecycleActions: Array<{
      label: string;
      title: string;
    }>;
    ordinaryStopAction: {
      title: string;
    };
  }>;
};

type LocalDeepResearchSearchState = {
  setupMessage?: string;
  setupStatusLabel?: string;
  progressTitle?: string;
  progressDetail?: string;
  q8Label?: string;
  runBudgetLabel?: string;
  runBudgetToolCalls?: number;
  runBudgetOnExhausted?: string;
  runHistoryMessage?: string;
  runs: Array<{
    status: string;
    question: string;
    modelProfileId?: string;
  }>;
  diagnostics: Array<{
    code: string;
    title: string;
  }>;
};

type McpRuntimeSearchState = {
  label: string;
  statusMessage?: string;
  error?: string;
  checkedAt?: string;
  defaultWebResearchCapability?: {
    status?: string;
    message?: string;
  };
  installedServers: Array<{
    serverId: string;
    workloadName: string;
  }>;
};

type DiagnosticsSearchModel = {
  diagnosticStatusKind?: string;
  diagnosticStatusMessage?: string;
  diagnosticExportHistorySearchText?: string;
  subagentMaturitySearchTerms: SettingsSearchTermPart[];
  subagentRepairSearchText?: string;
  subagentReplaySearchText?: string;
  localRuntimeEvidenceSearchText?: string;
};

export type RightPanelSettingsSearchTargetsInput = {
  state: DesktopState;
  voiceProviderModel: VoiceProviderSearchModel;
  voiceProviderLabelMode: string;
  voiceSetupHealth: LabelDetailSearchItem[];
  voiceCatalogCards: ProviderCatalogSearchCard[];
  voiceArtifactRetentionError?: string;
  modelCatalogSettings: ModelCatalogSettingsSearchModel;
  subagentsEffectiveEnabled: boolean;
  sttProviderModel: SttProviderSearchModel;
  sttCatalogCards: ProviderCatalogSearchCard[];
  selectedSttMicrophoneLabel: string;
  sttMicrophoneSettingsValue: string;
  sttMicrophoneDevicesError?: string;
  sttMicTestMessage?: string;
  sttMicTestStatus: string;
  sttShortcutDisplayLabel: string;
  sttDiagnosticRows: Array<{
    title: string;
    detailLabels: string[];
  }>;
  webResearchSearchStatus: string;
  webResearchFetchStatus: string;
  searchRoutingStatus: string;
  searchRoutingDetail: string;
  searchCatalogCards: ProviderCatalogSearchCard[];
  localDeepResearch: LocalDeepResearchSearchState;
  mcpRuntime: McpRuntimeSearchState;
  miniCpmVisionSetupMessage?: string;
  miniCpmVisionDiagnostics: Array<{
    code: string;
    title: string;
  }>;
  visualCatalogCards: ProviderCatalogSearchCard[];
  authoredVideoCatalogCards: ProviderCatalogSearchCard[];
  writingStyleCatalogCards: ProviderCatalogSearchCard[];
  googleGrantGroups: Array<{
    accountHint: string;
    services: string[];
  }>;
  grantRegistrySummary: string;
  permissionAuditError?: string;
  diagnostics: DiagnosticsSearchModel;
};

export function rightPanelSettingsSearchTargets({
  state,
  voiceProviderModel,
  voiceProviderLabelMode,
  voiceSetupHealth,
  voiceCatalogCards,
  voiceArtifactRetentionError,
  modelCatalogSettings,
  subagentsEffectiveEnabled,
  sttProviderModel,
  sttCatalogCards,
  selectedSttMicrophoneLabel,
  sttMicrophoneSettingsValue,
  sttMicrophoneDevicesError,
  sttMicTestMessage,
  sttMicTestStatus,
  sttShortcutDisplayLabel,
  sttDiagnosticRows,
  webResearchSearchStatus,
  webResearchFetchStatus,
  searchRoutingStatus,
  searchRoutingDetail,
  searchCatalogCards,
  localDeepResearch,
  mcpRuntime,
  miniCpmVisionSetupMessage,
  miniCpmVisionDiagnostics,
  visualCatalogCards,
  authoredVideoCatalogCards,
  writingStyleCatalogCards,
  googleGrantGroups,
  grantRegistrySummary,
  permissionAuditError,
  diagnostics,
}: RightPanelSettingsSearchTargetsInput): SettingsSearchTarget[] {
  const selectedVoiceProvider = voiceProviderModel.selectedProvider;
  const selectedVoice = selectedVoiceProvider?.voices.find((voice) => voice.id === voiceProviderModel.selectedVoiceId);
  const selectedSttProvider = sttProviderModel.selectedProvider;
  const persistentSubagentsEnabled = Boolean(state.settings.featureFlags?.subagents);
  const subagentsFeatureFlag = state.featureFlagSnapshot?.flags["ambient.subagents"];
  const persistentSlashCommandsEnabled = Boolean(state.settings.featureFlags?.slashCommands);
  const slashCommandsFeatureFlag = state.featureFlagSnapshot?.flags["ambient.slashCommands"];
  const slashCommandsEffectiveEnabled = Boolean(slashCommandsFeatureFlag?.enabled);
  const persistentMemoryFeatureEnabled = Boolean(state.settings.featureFlags?.tencentDbMemory);
  const memoryFeatureFlag = state.featureFlagSnapshot?.flags["ambient.memory.tencentdb"];
  const memoryEffectiveEnabled = Boolean(memoryFeatureFlag?.enabled);
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId);
  const contextUsage = contextUsagePresentation(state.contextUsage, state.settings.compaction);

  return [
    { id: "overview.workspace", sectionId: "overview", terms: ["workspace", state.workspace.name, state.workspace.path] },
    { id: "overview.app", sectionId: "overview", terms: ["app", state.app.name, state.app.version, state.app.platform, state.app.arch, "pi", "build"] },
    { id: "overview.updates", sectionId: "overview", terms: ["updates", desktopUpdateStatusText(state.app.update), state.app.update.channel, state.app.update.feedUrl] },
    { id: "overview.appearance", sectionId: "overview", terms: ["appearance", "theme", state.appearance.themePreference] },
    {
      id: "overview.core-setup",
      sectionId: "overview",
      terms: [
        "core setup",
        "first run",
        "first-run",
        "setup assistant",
        "provider catalog",
        "voice setup",
        "speech setup",
        "stt setup",
        "search setup",
        state.providerCatalog.catalogVersion,
      ],
    },
    {
      id: "overview.remote-control",
      sectionId: "overview",
      terms: [
        "remote control",
        "remote access",
        "Remote Ambient Surface",
        "Telegram remote control",
        "Signal remote control",
        "owner loop",
        "messaging gateway",
        "not reviewed",
      ],
    },
    { id: "voice.output", sectionId: "voice", terms: ["voice output", "assistant voice", "long replies", voiceProviderModel.statusLabel, voiceProviderModel.runtimeState.label, voiceProviderModel.runtimeState.detail, voiceProviderLabelMode] },
    {
      id: "voice.provider",
      sectionId: "voice",
      terms: [
        "voice provider",
        "tts",
        selectedVoiceProvider?.label,
        selectedVoiceProvider?.capabilityId,
        voiceProviderModel.availabilityMessage,
        voiceProviderModel.diagnostics?.statusLabel,
        voiceProviderModel.diagnostics?.errorLabel,
      ],
    },
    ...(selectedVoiceProvider
      ? [
          { id: "voice.voice", sectionId: "voice", terms: ["voice", selectedVoice?.label, selectedVoice?.id, selectedVoice?.locale, selectedVoice?.style?.join(" ")] },
          { id: "voice.format", sectionId: "voice", terms: ["format", "audio", voiceProviderModel.selectedFormat] },
        ]
      : []),
    { id: "voice.playback", sectionId: "voice", terms: ["playback", "enable assistant voice", "autoplay", voiceProviderModel.enabledChecked, voiceProviderModel.autoplayChecked] },
    { id: "voice.setup", sectionId: "voice", terms: ["setup details", "health", "provider cache", "refresh activity", "audit", voiceSetupHealth.map((item) => `${item.label} ${item.detail}`).join(" ")] },
    { id: "voice.catalog", sectionId: "voice", terms: ["known providers", "provider catalog", "tts catalog", voiceCatalogCards.map((card) => `${card.displayName} ${card.id} ${card.recommendationSummary}`).join(" ")] },
    { id: "voice.artifacts", sectionId: "voice", terms: ["voice artifacts", "cache limit", "cleanup", "orphaned", voiceArtifactRetentionError] },
    { id: "model-mode.model", sectionId: "model-mode", terms: ["model", ambientModelLabel(state.settings.model), state.settings.model] },
    {
      id: "model-mode.model-catalog",
      sectionId: "model-mode",
      terms: [
        "model runtime catalog",
        "model registry",
        "runtime profiles",
        "main models",
        "sub-agent models",
        "local models",
        modelCatalogSettings.statusLabel,
        modelCatalogSettings.summary,
        modelCatalogSettings.searchText,
      ],
    },
    {
      id: "local-models.registry",
      sectionId: "local-models",
      terms: [
        "local model registry",
        "installed",
        "configured",
        "enabled",
        "local profiles",
        modelCatalogSettings.localModelsStatusLabel,
        modelCatalogSettings.localProfileRows.map((row) => `${row.label} ${row.modelId} ${row.profileId} ${row.statusLabel} ${row.detailLabels.join(" ")}`).join(" "),
      ],
    },
    {
      id: "local-models.runtime-inventory",
      sectionId: "local-models",
      terms: [
        "local runtime inventory",
        "running",
        "stopped",
        "in use",
        "rss",
        "resident memory",
        "stop",
        "restart",
        "lease",
        "sub-agent",
        "untracked",
        "llama.cpp",
        "MiniCPM",
        modelCatalogSettings.localRuntimeSummary,
        modelCatalogSettings.localModelsSummary,
        modelCatalogSettings.localRuntimeGroups.map((group) => `${group.label} ${group.summary} ${group.emptyLabel}`).join(" "),
        modelCatalogSettings.localRuntimeRows.map((row) => `${row.label} ${row.modelLabel} ${row.capabilityLabel} ${row.statusLabel} ${row.ownerLabel} ${row.memoryLabel} ${row.lifecycleActions.map((action) => `${action.label} ${action.title}`).join(" ")} ${row.ordinaryStopAction.title}`).join(" "),
      ],
    },
    { id: "model-mode.mode", sectionId: "model-mode", terms: ["mode", "planner", "agent", state.settings.collaborationMode] },
    { id: "model-mode.thinking-display", sectionId: "model-mode", terms: ["thinking display", "reasoning display", state.settings.thinkingDisplay.mode] },
    {
      id: "model-mode.subagents",
      sectionId: "model-mode",
      terms: [
        "experimental sub-agents",
        "subagents",
        "ambient.subagents",
        "child threads",
        "local models",
        persistentSubagentsEnabled ? "enabled" : "disabled",
        subagentsFeatureFlag?.source,
        subagentsEffectiveEnabled ? "effective enabled" : "effective disabled",
        "maturity gates",
        "feature flag graduation",
        ...diagnostics.subagentMaturitySearchTerms,
      ],
    },
    {
      id: "model-mode.slash-commands",
      sectionId: "model-mode",
      terms: [
        "slash command skills",
        "slash commands",
        "skills",
        "workflows",
        "composer picker",
        "ambient.slashCommands",
        "Codex skills",
        "Ambient CLI",
        "callable workflows",
        persistentSlashCommandsEnabled ? "enabled" : "disabled",
        slashCommandsFeatureFlag?.source,
        slashCommandsEffectiveEnabled ? "effective enabled" : "effective disabled",
      ],
    },
    {
      id: "model-mode.agent-memory",
      sectionId: "model-mode",
      terms: [
        "experimental Tencent memory",
        "agent memory",
        "agent memory starter",
        "enable feature",
        "repair memory",
        "memory setup",
        "tencentdb",
        "TencentCloud",
        "ambient.memory.tencentdb",
        "short-term offload",
        "managed embeddings",
        "semantic recall",
        "vector recall",
        "long-term memory",
        persistentMemoryFeatureEnabled ? "feature flag enabled" : "feature flag disabled",
        state.settings.memory.enabled ? "global memory enabled" : "global memory disabled",
        state.settings.memory.shortTermOffloadEnabled ? "short-term offload enabled" : "short-term offload disabled",
        state.settings.memory.embeddings.enabled ? "managed embeddings enabled" : "managed embeddings disabled",
        state.settings.memory.defaultThreadEnabled ? "new threads enabled" : "new threads disabled",
        activeThread?.memoryEnabled ? "this thread enabled" : "this thread disabled",
        memoryFeatureFlag?.source,
        memoryEffectiveEnabled ? "effective enabled" : "effective disabled",
      ],
    },
    {
      id: "model-mode.run-status-card",
      sectionId: "model-mode",
      terms: [
        "run status details",
        "status card",
        "ambient status",
        "streaming response",
        "tool execution",
        state.settings.thinkingDisplay.showRunStatusCard ? "shown" : "hidden",
      ],
    },
    { id: "model-mode.aggressive-retries", sectionId: "model-mode", terms: ["aggressive retries", "retry", "429", "rate limit", state.settings.modelRuntime.aggressiveRetries] },
    {
      id: "model-mode.provider-idle-timeout",
      sectionId: "model-mode",
      terms: [
        "provider stream idle retry",
        "stream idle timeout",
        "stall timeout",
        "Ambient Pi timeout",
        formatDurationMs(state.settings.modelRuntime.providerStreamIdleTimeoutMs),
      ],
    },
    {
      id: "model-mode.provider-pre-stream-timeout",
      sectionId: "model-mode",
      terms: [
        "pre-stream response timeout",
        "provider start timeout",
        "response headers timeout",
        "Ambient Pi did not start streaming",
        formatDurationMs(state.settings.modelRuntime.providerPreStreamTimeoutMs),
      ],
    },
    { id: "model-mode.context", sectionId: "model-mode", terms: ["context", contextUsage.label, contextUsage.title] },
    { id: "model-mode.compaction", sectionId: "model-mode", terms: ["compaction", "automatic", "manual", state.settings.compaction.autoCompactionEnabled] },
    { id: "model-mode.planner", sectionId: "model-mode", terms: ["planner finalization", "auto finalize", "final plan", state.settings.planner.autoFinalize] },
    { id: "speech.input", sectionId: "speech", terms: ["speech input", "push to talk", "transcript", sttProviderModel.statusLabel] },
    { id: "speech.provider", sectionId: "speech", terms: ["speech provider", "stt", selectedSttProvider?.label, selectedSttProvider?.capabilityId, sttProviderModel.availabilityMessage, sttProviderModel.diagnostics?.statusLabel] },
    { id: "speech.catalog", sectionId: "speech", terms: ["speech provider catalog", "stt catalog", "known providers", sttCatalogCards.map((card) => `${card.displayName} ${card.id} ${card.recommendationSummary}`).join(" ")] },
    { id: "speech.microphone", sectionId: "speech", terms: ["microphone", "input device", "record test sample", "validation", selectedSttMicrophoneLabel, sttMicrophoneSettingsValue, sttMicrophoneDevicesError, sttMicTestMessage, sttMicTestStatus] },
    { id: "speech.language", sectionId: "speech", terms: ["spoken language", "language", sttProviderModel.selectedLanguage] },
    { id: "speech.shortcut", sectionId: "speech", terms: ["push to talk shortcut", "shortcut", sttShortcutDisplayLabel] },
    { id: "speech.behavior", sectionId: "speech", terms: ["speech behavior", "enable speech input", sttProviderModel.enabledChecked] },
    { id: "speech.diagnostics", sectionId: "speech", terms: ["speech diagnostics", "provider cache", "refresh activity", sttDiagnosticRows.map((row) => `${row.title} ${row.detailLabels.join(" ")}`).join(" ")] },
    { id: "speech.advanced", sectionId: "speech", terms: ["advanced recognition", "silence", "transcribe", "rms", "auto send", "barge in", "queue"] },
    { id: "search-web.research-stack", sectionId: "search-web", terms: ["web research", "provider stack", "provider ordering", webResearchSearchStatus, webResearchFetchStatus] },
    {
      id: "search-web.local-deep-research",
      sectionId: "search-web",
      terms: [
        "local deep research",
        "LiteResearcher",
        "llama.cpp",
        "q4",
        "q8",
        "effort",
        "tool calls",
        "budget",
        "max tool calls",
        "exhaustion",
        "deep research",
        localDeepResearch.setupMessage,
        localDeepResearch.setupStatusLabel,
        localDeepResearch.progressTitle,
        localDeepResearch.progressDetail,
        localDeepResearch.q8Label,
        localDeepResearch.runBudgetLabel,
        localDeepResearch.runBudgetToolCalls,
        localDeepResearch.runBudgetOnExhausted,
        localDeepResearch.runHistoryMessage,
        localDeepResearch.runs.map((run) => `${run.status} ${run.question} ${run.modelProfileId ?? ""}`).join(" "),
        localDeepResearch.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.title}`).join(" "),
      ],
    },
    { id: "search-web.routing", sectionId: "search-web", terms: ["search routing", "web search preference", searchRoutingStatus, searchRoutingDetail] },
    { id: "search-web.catalog", sectionId: "search-web", terms: ["search provider catalog", "web search catalog", "deep research catalog", "known providers", searchCatalogCards.map((card) => `${card.displayName} ${card.id} ${card.recommendationSummary}`).join(" ")] },
    {
      id: "mcp-runtime.status",
      sectionId: "mcp-runtime",
      terms: ["mcp runtime", "container runtime", "toolhive", "docker", "podman", mcpRuntime.label, mcpRuntime.statusMessage, mcpRuntime.error],
    },
    {
      id: "mcp-runtime.scrapling",
      sectionId: "mcp-runtime",
      terms: ["scrapling", "web research", "default capability", mcpRuntime.defaultWebResearchCapability?.status, mcpRuntime.defaultWebResearchCapability?.message],
    },
    {
      id: "mcp-runtime.diagnostics",
      sectionId: "mcp-runtime",
      terms: ["mcp diagnostics", "toolhive diagnostics", "preflight", "export diagnostics", mcpRuntime.checkedAt],
    },
    {
      id: "mcp-runtime.plugins",
      sectionId: "mcp-runtime",
      terms: ["mcp plugins", "custom mcp", "toolhive registry", "installed mcp servers", mcpRuntime.installedServers.map((server) => `${server.serverId} ${server.workloadName}`).join(" ")],
    },
    { id: "media.minicpm-diagnostics", sectionId: "media-browser", terms: ["minicpm", "minicpm-v", "vision diagnostics", "llama-server", "ffmpeg", miniCpmVisionSetupMessage, miniCpmVisionDiagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.title}`).join(" ")] },
    { id: "media.visual-catalog", sectionId: "media-browser", terms: ["visual analysis provider catalog", "vision catalog", "screenshot analysis", "image review", visualCatalogCards.map((card) => `${card.displayName} ${card.id} ${card.recommendationSummary}`).join(" ")] },
    { id: "media.video-catalog", sectionId: "media-browser", terms: ["authored video provider catalog", "hyperframes", "motion graphics", "title card", "html to video", authoredVideoCatalogCards.map((card) => `${card.displayName} ${card.id} ${card.recommendationSummary}`).join(" ")] },
    { id: "media.generated", sectionId: "media-browser", terms: ["generated media", "image", "audio", "video", "autoplay", state.settings.media.generatedMediaAutoplay] },
    { id: "writing-style.catalog", sectionId: "writing-style", terms: ["writing style catalog", "style transfer", "TinyStyler", "ambient-tinystyler", "style profile", "rewrite in this style", writingStyleCatalogCards.map((card) => `${card.displayName} ${card.id} ${card.recommendationSummary}`).join(" ")] },
    { id: "security.api-key", sectionId: "security-access", terms: ["api key", "ambient api key", state.provider.source] },
    { id: "security.browser", sectionId: "security-access", terms: ["browser access", "chrome", "profile", "isolated profile"] },
    { id: "security.google", sectionId: "security-access", terms: ["google workspace grants", "gmail", "drive", "calendar", "plugins", "install capabilities", "connect account", googleGrantGroups.map((group) => `${group.accountHint} ${group.services.join(" ")}`).join(" ")] },
    { id: "security.grants", sectionId: "security-access", terms: ["permission grants", "persistent grants", "high risk", "full access", grantRegistrySummary] },
    { id: "security.log", sectionId: "security-access", terms: ["permission log", "audit", "fallback", "denied", "allowed", permissionAuditError] },
    { id: "diagnostics.export", sectionId: "diagnostics", terms: ["diagnostics", "export", "import", "bundle", "open diagnostic bundle", diagnostics.diagnosticStatusKind, diagnostics.diagnosticStatusMessage] },
    { id: "diagnostics.export-history", sectionId: "diagnostics", terms: ["diagnostic export history", "persisted diagnostics", "recent diagnostics", "saved diagnostic bundle", "imported diagnostic bundle", "exported artifact", "imported artifact", diagnostics.diagnosticExportHistorySearchText] },
    { id: "diagnostics.subagent-maturity", sectionId: "diagnostics", terms: ["subagent maturity", "sub-agent maturity", "maturity gates", "dogfood", "security signoff", "restart recovery", "workflow jitter release profile", ...diagnostics.subagentMaturitySearchTerms] },
    { id: "diagnostics.subagent-repair", sectionId: "diagnostics", terms: ["subagent repair", "sub-agent repair", "restart repair", "orphan child", "spawn edge", "missing artifact", diagnostics.subagentRepairSearchText] },
    { id: "diagnostics.subagent-replay", sectionId: "diagnostics", terms: ["subagent replay", "sub-agent replay", "replay evidence", "child timeline", "runtime event", "persisted event", "transcript preview", diagnostics.subagentReplaySearchText] },
    { id: "diagnostics.local-runtime-evidence", sectionId: "diagnostics", terms: ["local runtime evidence", "runtime lease", "runtime owner", "blocked stop", "blocked restart", "untracked runtime", "memory evidence", diagnostics.localRuntimeEvidenceSearchText] },
    { id: "about.credits", sectionId: "about", terms: ["about", "version", "acknowledgements", "credits", "third party", state.app.version] },
  ];
}

export type RightPanelSettingsSearchModelInput = {
  query: string;
  sections: SettingsSectionNavItem[];
  sectionSearchTerms: Record<string, SettingsSearchTermPart[]>;
  targets: SettingsSearchTarget[];
};

export type RightPanelSettingsSearchModel = {
  searchActive: boolean;
  visibleSections: SettingsSectionNavItem[];
  visibleSearchResultCount: number;
  sectionVisible: (sectionId: string) => boolean;
  rowVisible: (sectionId: string, rowId: string) => boolean;
};

export function rightPanelSettingsSearchModel({
  query,
  sections,
  sectionSearchTerms,
  targets,
}: RightPanelSettingsSearchModelInput): RightPanelSettingsSearchModel {
  const searchTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searchActive = searchTokens.length > 0;
  const matchingSectionIds = new Set(
    searchActive
      ? Object.entries(sectionSearchTerms)
          .filter(([, terms]) => settingsSearchMatches(searchTokens, terms))
          .map(([sectionId]) => sectionId)
      : sections.map((section) => section.id),
  );
  const matchingRowIds = new Set(
    searchActive
      ? targets.filter((target) => settingsSearchMatches(searchTokens, target.terms)).map((target) => target.id)
      : targets.map((target) => target.id),
  );
  const visibleSectionIds = new Set(searchActive ? Array.from(matchingSectionIds) : sections.map((section) => section.id));
  if (searchActive) {
    for (const target of targets) {
      if (matchingRowIds.has(target.id)) visibleSectionIds.add(target.sectionId);
    }
  }
  const sectionHasMatchingRows = (sectionId: string) =>
    targets.some((target) => target.sectionId === sectionId && matchingRowIds.has(target.id));
  const sectionVisible = (sectionId: string) => !searchActive || visibleSectionIds.has(sectionId);
  const rowVisible = (sectionId: string, rowId: string) =>
    !searchActive || matchingRowIds.has(rowId) || (matchingSectionIds.has(sectionId) && !sectionHasMatchingRows(sectionId));
  const sectionMatchCount = (sectionId: string) =>
    targets.filter((target) => target.sectionId === sectionId && rowVisible(sectionId, target.id)).length;
  const visibleSearchResultCount = targets.filter((target) => rowVisible(target.sectionId, target.id)).length;
  const visibleSections = sections
    .filter((section) => sectionVisible(section.id))
    .map((section) =>
      searchActive
        ? {
            ...section,
            status: `${sectionMatchCount(section.id)} match${sectionMatchCount(section.id) === 1 ? "" : "es"}`,
          }
        : section,
    );

  return {
    searchActive,
    visibleSections,
    visibleSearchResultCount,
    sectionVisible,
    rowVisible,
  };
}
