import type { IpcMain } from "electron";
import { z } from "zod";

import {
  MAX_MODEL_RUNTIME_PROVIDER_TIMEOUT_MS,
  MIN_MODEL_RUNTIME_PROVIDER_TIMEOUT_MS,
} from "../../shared/modelRuntimeSettings";
import {
  MAX_AGENT_MEMORY_EMBEDDING_INPUT_CHARS,
  MAX_AGENT_MEMORY_EMBEDDING_TIMEOUT_MS,
  MIN_AGENT_MEMORY_EMBEDDING_INPUT_CHARS,
  MIN_AGENT_MEMORY_EMBEDDING_TIMEOUT_MS,
} from "../../shared/agentMemorySettings";
import type {
  AgentMemoryClearInput,
  AgentMemoryClearResult,
  AgentMemoryEmbeddingLifecycleActionInput,
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemoryStorageDiagnostics,
} from "../../shared/agentMemoryDiagnostics";
import type {
  AgentMemorySettings,
  UpdateAgentMemorySettingsInput,
} from "../../shared/agentMemorySettings";
import type {
  AgentMemoryStarterDisableInput,
  AgentMemoryStarterEnableInput,
  AgentMemoryStarterOperationResult,
  AgentMemoryStarterRepairInput,
  AgentMemoryStarterStatus,
} from "../../shared/agentMemoryStarter";
import type {
  AppAppearance,
  SetThemePreferenceInput,
  ThinkingDisplaySettings,
  UpdateLocalDeepResearchSettingsInput,
  UpdateMediaPlaybackSettingsInput,
  UpdateModelRuntimeSettingsInput,
  UpdatePlannerSettingsInput,
  UpdateSearchRoutingSettingsInput,
  UpdateSttSettingsInput,
  UpdateThinkingDisplaySettingsInput,
  UpdateVoiceSettingsInput,
} from "../../shared/desktopTypes";
import type {
  AmbientFeatureFlagSettings,
  UpdateFeatureFlagSettingsInput,
} from "../../shared/featureFlags";
import type {
  LocalDeepResearchRunHistoryInput,
  LocalDeepResearchRunHistoryResult,
  LocalDeepResearchSettings,
  LocalDeepResearchSetupInput,
  LocalDeepResearchSetupResult,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  MediaPlaybackSettings,
  MessageVoiceArtifactInput,
  MessageVoiceState,
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
  RefreshVoiceProviderVoicesInput,
  RefreshVoiceProviderVoicesResult,
  RegenerateMessageVoiceInput,
  SetSttTtsSpeakingInput,
  SttProviderCandidate,
  SttProviderSetupInput,
  SttProviderSetupResult,
  SttQueueState,
  SttSettings,
  SttTestAudioInput,
  SttTestAudioResult,
  SttTranscribeAudioInput,
  SttTranscribeAudioResult,
  VoiceArtifactPruneResult,
  VoiceArtifactRetentionInput,
  VoiceArtifactRetentionSummary,
  VoiceOnboardingHostFacts,
  VoiceProviderCandidate,
  VoiceSettings,
  VoiceSettingsAuditSource,
} from "../../shared/localRuntimeTypes";
import type { PlannerSettings } from "../../shared/plannerTypes";
import type { ModelProviderCredentialSaveResult } from "../../shared/pluginTypes";
import type {
  InstallModelProviderEndpointInput,
  InstallModelProviderEndpointResult,
  ModelRuntimeSettings,
  SaveModelProviderCredentialInput,
} from "../../shared/threadTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const settingsIpcChannels = [
  "appearance:set-theme-preference",
  "media:update-playback-settings",
  "thinking-display:update-settings",
  "model-runtime:update-settings",
  "model-runtime:save-provider-credential",
  "model-runtime:install-endpoint-provider",
  "model-runtime:lifecycle-action",
  "feature-flags:update-settings",
  "memory:update-settings",
  "memory:starter-status",
  "memory:starter-enable",
  "memory:starter-repair",
  "memory:starter-disable",
  "memory:diagnostics",
  "memory:embedding-lifecycle-action",
  "memory:clear",
  "planner:update-settings",
  "search-routing:hydrate-settings",
  "search-routing:update-settings",
  "local-deep-research:update-settings",
  "voice:update-settings",
  "stt:update-settings",
  "voice:list-providers",
  "voice:refresh-provider-voices",
  "voice:onboarding-host-facts",
  "voice:regenerate-message",
  "voice:reveal-artifact",
  "voice:clear-artifact",
  "voice:inspect-artifacts",
  "voice:prune-artifacts",
  "stt:list-providers",
  "stt:setup-provider",
  "vision:minicpm-setup-provider",
  "vision:minicpm-analyze",
  "local-deep-research:setup",
  "local-deep-research:list-runs",
  "stt:save-test-audio",
  "stt:transcribe-audio",
  "stt:cancel-transcription",
  "stt:set-tts-speaking",
] as const;

interface VoiceSettingsAuditContextInput {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

export interface VoiceSttSettingsContext<Store = unknown> {
  targetStore: Store;
  workspacePath: string;
}

export interface ActiveProjectSettingsContext<Store = unknown> {
  store: Store;
}

export interface RegisterSettingsIpcDependencies<
  VoiceSttContext extends VoiceSttSettingsContext = VoiceSttSettingsContext,
  ActiveProjectStore = unknown,
  ThreadRuntimeHost = unknown,
  ActiveProjectHost extends ActiveProjectSettingsContext<ActiveProjectStore> = ActiveProjectSettingsContext<ActiveProjectStore>,
> {
  handleIpc: HandleIpc;
  setThemePreference(input: SetThemePreferenceInput): MaybePromise<AppAppearance>;
  updateMediaPlaybackSettings(input: UpdateMediaPlaybackSettingsInput): MaybePromise<MediaPlaybackSettings>;
  updateThinkingDisplaySettings(input: UpdateThinkingDisplaySettingsInput): MaybePromise<ThinkingDisplaySettings>;
  updateModelRuntimeSettings(input: UpdateModelRuntimeSettingsInput): MaybePromise<ModelRuntimeSettings>;
  saveModelProviderCredential(input: SaveModelProviderCredentialInput): MaybePromise<ModelProviderCredentialSaveResult>;
  installModelProviderEndpoint(input: InstallModelProviderEndpointInput): MaybePromise<InstallModelProviderEndpointResult>;
  runLocalModelRuntimeLifecycleAction(input: LocalModelRuntimeLifecycleActionInput): MaybePromise<LocalModelRuntimeLifecycleActionResult>;
  updateFeatureFlagSettings(input: UpdateFeatureFlagSettingsInput): MaybePromise<AmbientFeatureFlagSettings>;
  updateMemorySettings(input: UpdateAgentMemorySettingsInput): MaybePromise<AgentMemorySettings>;
  getAgentMemoryStarterStatus(): MaybePromise<AgentMemoryStarterStatus>;
  enableAgentMemoryStarter(input: AgentMemoryStarterEnableInput): MaybePromise<AgentMemoryStarterOperationResult>;
  repairAgentMemoryStarter(input: AgentMemoryStarterRepairInput): MaybePromise<AgentMemoryStarterOperationResult>;
  disableAgentMemoryStarter(input: AgentMemoryStarterDisableInput): MaybePromise<AgentMemoryStarterOperationResult>;
  getAgentMemoryDiagnostics(): MaybePromise<AgentMemoryStorageDiagnostics>;
  runAgentMemoryEmbeddingLifecycleAction(input: AgentMemoryEmbeddingLifecycleActionInput): MaybePromise<AgentMemoryEmbeddingLifecycleActionResult>;
  clearAgentMemory(input: AgentMemoryClearInput): MaybePromise<AgentMemoryClearResult>;
  updatePlannerSettings(input: UpdatePlannerSettingsInput): MaybePromise<PlannerSettings>;
  hydrateSearchRoutingSettingsForActiveWorkspace(): MaybePromise<SearchRoutingSettings>;
  updateSearchRoutingSettings(input: UpdateSearchRoutingSettingsInput): MaybePromise<SearchRoutingSettings>;
  updateLocalDeepResearchSettings(input: UpdateLocalDeepResearchSettingsInput): MaybePromise<LocalDeepResearchSettings>;
  activeVoiceSttContextForProjectHost(): VoiceSttContext;
  emitRuntimeFeatureStateUpdated(targetStore: VoiceSttContext["targetStore"]): void;
  updateVoiceSettings(
    input: UpdateVoiceSettingsInput,
    audit: VoiceSettingsAuditContextInput,
    options: {
      providerStore: VoiceSttContext["targetStore"];
      workspacePath: string;
      onStateUpdated: () => void;
    },
  ): MaybePromise<VoiceSettings>;
  updateSttSettings(
    input: UpdateSttSettingsInput,
    options: {
      onStateUpdated: () => void;
    },
  ): MaybePromise<SttSettings>;
  requireActiveProjectRuntimeHost(): ActiveProjectHost;
  listVoiceProvidersWithCachedVoices(targetStore: ActiveProjectStore): MaybePromise<VoiceProviderCandidate[]>;
  refreshVoiceProviderCatalog(
    input: RefreshVoiceProviderVoicesInput,
    targetStore: ActiveProjectStore,
  ): MaybePromise<RefreshVoiceProviderVoicesResult>;
  isAppPackaged(): boolean;
  collectVoiceOnboardingHostFacts(input: { isPackaged: boolean }): MaybePromise<VoiceOnboardingHostFacts>;
  regenerateMessageVoice(input: RegenerateMessageVoiceInput): MaybePromise<MessageVoiceState>;
  revealMessageVoiceArtifact(input: MessageVoiceArtifactInput): void;
  clearMessageVoiceArtifact(input: MessageVoiceArtifactInput): MaybePromise<MessageVoiceState>;
  inspectVoiceArtifacts(
    input: VoiceArtifactRetentionInput | undefined,
    host: ActiveProjectHost | ThreadRuntimeHost,
  ): MaybePromise<VoiceArtifactRetentionSummary>;
  pruneVoiceArtifacts(
    input: VoiceArtifactRetentionInput | undefined,
    host: ActiveProjectHost | ThreadRuntimeHost,
  ): MaybePromise<VoiceArtifactPruneResult>;
  listSttProvidersWithValidation(workspacePath: string): MaybePromise<SttProviderCandidate[]>;
  setupSttProvider(input: SttProviderSetupInput, context: VoiceSttContext): MaybePromise<SttProviderSetupResult>;
  setupMiniCpmVision(input: MiniCpmVisionSetupInput, workspacePath: string): MaybePromise<MiniCpmVisionSetupResult>;
  analyzeMiniCpmVision(input: MiniCpmVisionAnalyzeInput, workspacePath: string): MaybePromise<MiniCpmVisionAnalysisResult>;
  setupLocalDeepResearch(input: LocalDeepResearchSetupInput, workspacePath: string): MaybePromise<LocalDeepResearchSetupResult>;
  listLocalDeepResearchRunsForSettings(
    input: LocalDeepResearchRunHistoryInput | undefined,
    workspacePath: string,
  ): MaybePromise<LocalDeepResearchRunHistoryResult>;
  saveSttTestAudio(workspacePath: string, input: SttTestAudioInput): MaybePromise<SttTestAudioResult>;
  requireProjectRuntimeHostForThread(threadId: string): ThreadRuntimeHost;
  transcribeSttAudio(input: SttTranscribeAudioInput, host: ThreadRuntimeHost): MaybePromise<SttTranscribeAudioResult>;
  cancelSttTranscription(workspacePath: string): MaybePromise<SttQueueState>;
  setSttTtsSpeaking(input: SetSttTtsSpeakingInput, workspacePath: string): MaybePromise<SttQueueState>;
}

const themePreferenceSchema = z.enum(["system", "light", "dark"]);
const setThemePreferenceSchema = z.object({ themePreference: themePreferenceSchema });
const updateMediaPlaybackSettingsSchema = z.object({
  generatedMediaAutoplay: z.boolean(),
});
const updateThinkingDisplaySettingsSchema = z.object({
  mode: z.enum(["off", "transient", "full"]),
  showRunStatusCard: z.boolean().optional().default(false),
});
const updateModelRuntimeSettingsSchema = z.object({
  aggressiveRetries: z.boolean().optional(),
  showPromptCacheStatus: z.boolean().optional(),
  providerPreStreamTimeoutMs: z.number().int().min(MIN_MODEL_RUNTIME_PROVIDER_TIMEOUT_MS).max(MAX_MODEL_RUNTIME_PROVIDER_TIMEOUT_MS).optional(),
  providerStreamIdleTimeoutMs: z.number().int().min(MIN_MODEL_RUNTIME_PROVIDER_TIMEOUT_MS).max(MAX_MODEL_RUNTIME_PROVIDER_TIMEOUT_MS).optional(),
  installedProviders: z.array(z.unknown()).optional(),
});
const managedSecretReferencePattern = /^ambient-secret-ref:v1:[a-f0-9]{64}$/;
const modelProviderCapabilityProbeIdSchema = z.enum([
  "streaming",
  "context_window",
  "structured_json",
  "schema_output",
  "tool_use",
  "image_input",
  "latency",
  "error_shape",
  "health",
  "local_memory",
  "reliability",
]);
const installModelProviderEndpointSchema = z.object({
  templateId: z.string().trim().min(1).max(160),
  providerId: z.string().trim().min(1).max(160).optional(),
  providerLabel: z.string().trim().min(1).max(240).optional(),
  modelId: z.string().trim().min(1).max(240),
  modelLabel: z.string().trim().min(1).max(240).optional(),
  baseUrl: z.string().trim().min(1).max(2048),
  credentialRef: z.object({
    flow: z.enum(["ambient_cli_secret_request", "ambient_cli_env_bind"]),
    managedSecretRef: z.string().trim().regex(managedSecretReferencePattern),
    label: z.string().trim().min(1).max(240).optional(),
  }).strict(),
  generatedAt: z.string().trim().min(1).max(80).optional(),
  measuredAt: z.string().trim().min(1).max(80).optional(),
  timeoutMs: z.number().int().min(MIN_MODEL_RUNTIME_PROVIDER_TIMEOUT_MS).max(MAX_MODEL_RUNTIME_PROVIDER_TIMEOUT_MS).optional(),
  anthropicVersion: z.string().trim().min(1).max(80).optional(),
  reliabilitySampleCount: z.number().int().min(1).max(10).optional(),
  extraProbeIds: z.array(modelProviderCapabilityProbeIdSchema).max(16).optional(),
  enabled: z.boolean().optional(),
}).strict();
const saveModelProviderCredentialSchema = z.object({
  templateId: z.string().trim().min(1).max(160),
  providerId: z.string().trim().min(1).max(160).optional(),
  modelId: z.string().trim().min(1).max(240),
  baseUrl: z.string().trim().min(1).max(2048),
  label: z.string().trim().min(1).max(240).optional(),
  value: z.string().trim().min(1).max(100_000),
}).strict();
const localModelRuntimeLifecycleActionSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
  runtimeId: z.string().trim().min(1).max(240),
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
}).strict();
const updateFeatureFlagSettingsSchema = z.object({
  subagents: z.boolean().optional(),
  tencentDbMemory: z.boolean().optional(),
  slashCommands: z.boolean().optional(),
}).strict();
const updateMemoryEmbeddingSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  providerMode: z.enum(["ambient-managed"]).optional(),
  providerCapabilityId: z.string().trim().min(1).max(240).optional(),
  autoStartProvider: z.boolean().optional(),
  modelId: z.string().trim().min(1).max(240).optional(),
  dimensions: z.number().int().positive().max(100_000).optional(),
  sendDimensions: z.boolean().optional(),
  maxInputChars: z.number().int().min(MIN_AGENT_MEMORY_EMBEDDING_INPUT_CHARS).max(MAX_AGENT_MEMORY_EMBEDDING_INPUT_CHARS).optional(),
  timeoutMs: z.number().int().min(MIN_AGENT_MEMORY_EMBEDDING_TIMEOUT_MS).max(MAX_AGENT_MEMORY_EMBEDDING_TIMEOUT_MS).optional(),
  preflightEnabled: z.boolean().optional(),
}).strict();
const updateMemorySettingsSchema = z.object({
  mode: z.enum(["enabled_all", "per_thread", "disabled"]).optional(),
  enabled: z.boolean().optional(),
  defaultThreadEnabled: z.boolean().optional(),
  adapter: z.enum(["tencentdb"]).optional(),
  shortTermOffloadEnabled: z.boolean().optional(),
  embeddings: updateMemoryEmbeddingSettingsSchema.optional(),
  storageScope: z.enum(["workspace"]).optional(),
}).strict();
const agentMemoryEmbeddingLifecycleActionSchema = z.object({
  action: z.enum(["check", "start", "stop", "restart"]),
}).strict();
const agentMemoryClearSchema = z.object({
  workspacePath: z.string().trim().min(1).max(4096),
}).strict();
const agentMemoryStarterEnableSchema = z.object({
  enableCurrentThread: z.boolean().optional(),
  enableNewThreads: z.boolean().optional(),
}).strict();
const agentMemoryStarterRepairSchema = agentMemoryStarterEnableSchema;
const agentMemoryStarterDisableSchema = z.object({}).strict();
const updatePlannerSettingsSchema = z.object({
  autoFinalize: z.boolean(),
});
const updateSearchRoutingSettingsSchema = z.object({
  webSearch: z.unknown().optional(),
  webResearch: z.unknown().optional(),
}).passthrough();
const updateLocalDeepResearchSettingsSchema = z.object({
  providerStack: z.unknown().optional(),
  localModelResources: z.object({
    schemaVersion: z.string().optional(),
    maxResidentMemoryBytes: z.number().int().positive().optional(),
    memoryLimitBehavior: z.enum(["warn", "refuse", "unload-idle", "ask-to-exceed"]).optional(),
  }).optional(),
  runBudget: z.object({
    schemaVersion: z.string().optional(),
    defaultEffort: z.enum(["quick", "balanced", "deep", "exhaustive", "custom"]).optional(),
    customMaxToolCalls: z.number().int().positive().max(500).optional(),
    onExhausted: z.enum(["summarize", "ask_to_continue"]).optional(),
  }).optional(),
}).passthrough();
const localDeepResearchSetupSchema = z.object({
  action: z.enum(["status", "install", "repair", "validate", "smoke"]).optional(),
  q8Override: z.boolean().optional(),
  installModel: z.boolean().optional(),
  installRuntime: z.boolean().optional(),
  runtimeArtifactId: z.string().trim().min(1).optional(),
});
const localDeepResearchRunHistorySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
}).optional();
const sttTestAudioSchema = z.object({
  source: z.enum(["settings-microphone", "composer-push-to-talk"]),
  audioBase64: z.string().trim().min(1).max(30_000_000),
  threadId: z.string().trim().min(1).optional(),
  durationMs: z.number().positive().max(30_000).optional(),
  sampleRate: z.number().int().positive().optional(),
  channels: z.number().int().positive().max(8).optional(),
  microphoneDeviceId: z.string().trim().min(1).optional(),
  microphoneDeviceLabel: z.string().trim().min(1).max(160).optional(),
});
const sttTranscribeAudioSchema = z.object({
  threadId: z.string().trim().min(1),
  audioPath: z.string().trim().min(1),
  utteranceId: z.string().trim().min(1).optional(),
});
const setSttTtsSpeakingSchema = z.object({
  speaking: z.boolean(),
});
const refreshVoiceProviderVoicesSchema = z.object({
  providerCapabilityId: z.string().trim().min(1),
});
const regenerateMessageVoiceSchema = z.object({
  messageId: z.string().min(1),
});
const messageVoiceArtifactSchema = z.object({
  messageId: z.string().min(1),
});
const voiceArtifactRetentionSchema = z
  .object({
    threadId: z.string().min(1).optional(),
    providerCapabilityId: z.string().trim().min(1).optional(),
  })
  .optional();
const updateVoiceSettingsSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["off", "assistant-final", "always", "tagged"]),
  autoplay: z.boolean(),
  providerCapabilityId: z.string().trim().min(1).optional(),
  voiceId: z.string().trim().min(1).optional(),
  preferredVoicesByProvider: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional(),
  maxChars: z.number().int().min(250).max(20_000),
  longReply: z.enum(["summarize", "skip", "ask"]),
  format: z.enum(["mp3", "wav", "ogg"]),
  artifactCacheMaxMb: z.number().int().min(0).max(1024),
});
const updateSttSettingsSchema = z.object({
  enabled: z.boolean(),
  providerCapabilityId: z.string().trim().min(1).optional(),
  spokenLanguage: z.string().trim().min(1),
  pushToTalkShortcut: z.string().trim().min(1).optional(),
  microphone: z.object({
    deviceId: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).max(160).optional(),
  }).optional(),
  mode: z.literal("push-to-talk"),
  autoSendAfterTranscription: z.boolean(),
  silenceFinalizeSeconds: z.number().min(0.3).max(2.5),
  noSpeechGate: z.object({
    enabled: z.boolean(),
    rmsThresholdDbfs: z.number().min(-90).max(-20),
  }),
  bargeIn: z.object({
    stopTtsOnSpeech: z.boolean(),
    queueWhileAgentRuns: z.boolean(),
  }),
});
const sttProviderSetupSchema = z.object({
  provider: z.literal("qwen3-asr"),
  action: z.enum(["install", "repair", "validate"]).optional(),
  installRuntime: z.boolean().optional(),
  runtimeBinaryPath: z.string().trim().min(1).optional(),
  validationAudioPath: z.string().trim().min(1).optional(),
  spokenLanguage: z.string().trim().min(1).optional(),
  selectProvider: z.boolean().optional(),
  enable: z.boolean().optional(),
});
const miniCpmVisionTaskSchema = z.enum([
  "ui_review",
  "game_visual_review",
  "screenshot_ocr",
  "image_description",
  "design_comparison",
  "video_frame_review",
]);
const miniCpmVisionSetupSchema = z.object({
  provider: z.literal("minicpm-v"),
  action: z.enum(["install", "repair", "validate", "stop", "uninstall"]).optional(),
  installRuntime: z.boolean().optional(),
  runtimeBinaryPath: z.string().trim().min(1).optional(),
  runtimeArchivePath: z.string().trim().min(1).optional(),
  runtimeArtifactId: z.string().trim().min(1).optional(),
  endpointUrl: z.string().trim().min(1).optional(),
  validationImagePath: z.string().trim().min(1).optional(),
  validationTask: miniCpmVisionTaskSchema.optional(),
  validationPrompt: z.string().trim().min(1).max(8000).optional(),
});
const miniCpmVisionImageSourceSchema = z.enum([
  "workspace_file",
  "browser_screenshot",
  "chat_attachment",
  "media_artifact",
  "selected_screenshot",
  "external_file",
]);
const miniCpmVisionImageReferenceSchema = z.object({
  path: z.string().trim().min(1),
  absolute: z.boolean().optional(),
  source: miniCpmVisionImageSourceSchema.optional(),
  label: z.string().trim().min(1).max(240).optional(),
});
const miniCpmVisionVideoSourceSchema = z.enum([
  "workspace_file",
  "chat_attachment",
  "media_artifact",
  "external_file",
]);
const miniCpmVisionVideoReferenceSchema = z.object({
  path: z.string().trim().min(1),
  absolute: z.boolean().optional(),
  source: miniCpmVisionVideoSourceSchema.optional(),
  label: z.string().trim().min(1).max(240).optional(),
  frameTimestampMs: z.number().int().min(0).max(120_000).optional(),
});
const miniCpmVisionAnalyzeSchema = z.object({
  imagePath: z.string().trim().min(1).optional(),
  image: miniCpmVisionImageReferenceSchema.optional(),
  videoPath: z.string().trim().min(1).optional(),
  video: miniCpmVisionVideoReferenceSchema.optional(),
  frameTimestampMs: z.number().int().min(0).max(120_000).optional(),
  referenceImagePath: z.string().trim().min(1).optional(),
  referenceImage: miniCpmVisionImageReferenceSchema.optional(),
  task: miniCpmVisionTaskSchema.optional(),
  prompt: z.string().trim().min(1).max(8000).optional(),
  outputJsonPath: z.string().trim().min(1).optional(),
  runtimeBinaryPath: z.string().trim().min(1).optional(),
  endpointUrl: z.string().trim().min(1).optional(),
  allowExternalImagePaths: z.boolean().optional(),
  allowExternalMediaPaths: z.boolean().optional(),
  startServer: z.boolean().optional(),
  stopAfter: z.boolean().optional(),
  offline: z.boolean().optional(),
  waitMs: z.number().int().min(0).max(20 * 60 * 1000).optional(),
  requestTimeoutMs: z.number().int().min(5_000).max(20 * 60 * 1000).optional(),
  maxTokens: z.number().int().min(64).max(4096).optional(),
}).superRefine((input, context) => {
  const hasImage = Boolean(input.imagePath || input.image?.path);
  const hasVideo = Boolean(input.videoPath || input.video?.path);
  if (hasImage && hasVideo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MiniCPM-V analysis accepts one primary visual input: use image/imagePath or video/videoPath, not both.",
      path: ["imagePath"],
    });
  }
  if (!hasImage && !hasVideo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MiniCPM-V analysis requires imagePath, image.path, videoPath, or video.path.",
      path: ["imagePath"],
    });
  }
});

export function registerSettingsIpc<
  VoiceSttContext extends VoiceSttSettingsContext = VoiceSttSettingsContext,
  ActiveProjectStore = unknown,
  ThreadRuntimeHost = unknown,
  ActiveProjectHost extends ActiveProjectSettingsContext<ActiveProjectStore> = ActiveProjectSettingsContext<ActiveProjectStore>,
>({
  handleIpc,
  setThemePreference,
  updateMediaPlaybackSettings,
  updateThinkingDisplaySettings,
  updateModelRuntimeSettings,
  saveModelProviderCredential,
  installModelProviderEndpoint,
  runLocalModelRuntimeLifecycleAction,
  updateFeatureFlagSettings,
  updateMemorySettings,
  getAgentMemoryStarterStatus,
  enableAgentMemoryStarter,
  repairAgentMemoryStarter,
  disableAgentMemoryStarter,
  getAgentMemoryDiagnostics,
  runAgentMemoryEmbeddingLifecycleAction,
  clearAgentMemory,
  updatePlannerSettings,
  hydrateSearchRoutingSettingsForActiveWorkspace,
  updateSearchRoutingSettings,
  updateLocalDeepResearchSettings,
  activeVoiceSttContextForProjectHost,
  emitRuntimeFeatureStateUpdated,
  updateVoiceSettings,
  updateSttSettings,
  requireActiveProjectRuntimeHost,
  listVoiceProvidersWithCachedVoices,
  refreshVoiceProviderCatalog,
  isAppPackaged,
  collectVoiceOnboardingHostFacts,
  regenerateMessageVoice,
  revealMessageVoiceArtifact,
  clearMessageVoiceArtifact,
  inspectVoiceArtifacts,
  pruneVoiceArtifacts,
  listSttProvidersWithValidation,
  setupSttProvider,
  setupMiniCpmVision,
  analyzeMiniCpmVision,
  setupLocalDeepResearch,
  listLocalDeepResearchRunsForSettings,
  saveSttTestAudio,
  requireProjectRuntimeHostForThread,
  transcribeSttAudio,
  cancelSttTranscription,
  setSttTtsSpeaking,
}: RegisterSettingsIpcDependencies<VoiceSttContext, ActiveProjectStore, ThreadRuntimeHost, ActiveProjectHost>): void {
  handleIpc("appearance:set-theme-preference", async (_event, raw: SetThemePreferenceInput) => {
    const input = setThemePreferenceSchema.parse(raw);
    return setThemePreference(input);
  });
  handleIpc("media:update-playback-settings", async (_event, raw: UpdateMediaPlaybackSettingsInput) => {
    const input = updateMediaPlaybackSettingsSchema.parse(raw);
    return updateMediaPlaybackSettings(input);
  });
  handleIpc("thinking-display:update-settings", async (_event, raw: UpdateThinkingDisplaySettingsInput) => {
    const input = updateThinkingDisplaySettingsSchema.parse(raw);
    return updateThinkingDisplaySettings(input);
  });
  handleIpc("model-runtime:update-settings", async (_event, raw: UpdateModelRuntimeSettingsInput) => {
    const input = updateModelRuntimeSettingsSchema.parse(raw) as UpdateModelRuntimeSettingsInput;
    return updateModelRuntimeSettings(input);
  });
  handleIpc("model-runtime:save-provider-credential", async (_event, raw: SaveModelProviderCredentialInput) => {
    const input = saveModelProviderCredentialSchema.parse(raw) as SaveModelProviderCredentialInput;
    return saveModelProviderCredential(input);
  });
  handleIpc("model-runtime:install-endpoint-provider", async (_event, raw: InstallModelProviderEndpointInput) => {
    assertNoRawModelProviderEndpointInstallSecretMaterial(raw);
    const input = installModelProviderEndpointSchema.parse(raw) as InstallModelProviderEndpointInput;
    return installModelProviderEndpoint(input);
  });
  handleIpc("model-runtime:lifecycle-action", async (_event, raw: LocalModelRuntimeLifecycleActionInput) => {
    const input = localModelRuntimeLifecycleActionSchema.parse(raw) as LocalModelRuntimeLifecycleActionInput;
    return runLocalModelRuntimeLifecycleAction(input);
  });
  handleIpc("feature-flags:update-settings", async (_event, raw: UpdateFeatureFlagSettingsInput) => {
    const input = updateFeatureFlagSettingsSchema.parse(raw);
    return updateFeatureFlagSettings(input);
  });
  handleIpc("memory:update-settings", async (_event, raw: UpdateAgentMemorySettingsInput) => {
    const input = updateMemorySettingsSchema.parse(raw);
    return updateMemorySettings(input);
  });
  handleIpc("memory:starter-status", async () => getAgentMemoryStarterStatus());
  handleIpc("memory:starter-enable", async (_event, raw: AgentMemoryStarterEnableInput | undefined) => {
    const input = agentMemoryStarterEnableSchema.parse(raw ?? {});
    return enableAgentMemoryStarter(input);
  });
  handleIpc("memory:starter-repair", async (_event, raw: AgentMemoryStarterRepairInput | undefined) => {
    const input = agentMemoryStarterRepairSchema.parse(raw ?? {});
    return repairAgentMemoryStarter(input);
  });
  handleIpc("memory:starter-disable", async (_event, raw: AgentMemoryStarterDisableInput | undefined) => {
    const input = agentMemoryStarterDisableSchema.parse(raw ?? {});
    return disableAgentMemoryStarter(input);
  });
  handleIpc("memory:diagnostics", async () => getAgentMemoryDiagnostics());
  handleIpc("memory:embedding-lifecycle-action", async (_event, raw: AgentMemoryEmbeddingLifecycleActionInput) => {
    const input = agentMemoryEmbeddingLifecycleActionSchema.parse(raw);
    return runAgentMemoryEmbeddingLifecycleAction(input);
  });
  handleIpc("memory:clear", async (_event, raw: AgentMemoryClearInput) => {
    const input = agentMemoryClearSchema.parse(raw);
    return clearAgentMemory(input);
  });
  handleIpc("planner:update-settings", async (_event, raw: UpdatePlannerSettingsInput) => {
    const input = updatePlannerSettingsSchema.parse(raw);
    return updatePlannerSettings(input);
  });
  handleIpc("search-routing:hydrate-settings", () => hydrateSearchRoutingSettingsForActiveWorkspace());
  handleIpc("search-routing:update-settings", async (_event, raw: UpdateSearchRoutingSettingsInput) => {
    const input = updateSearchRoutingSettingsSchema.parse(raw) as UpdateSearchRoutingSettingsInput;
    return updateSearchRoutingSettings(input);
  });
  handleIpc("local-deep-research:update-settings", async (_event, raw: UpdateLocalDeepResearchSettingsInput) => {
    const input = updateLocalDeepResearchSettingsSchema.parse(raw) as UpdateLocalDeepResearchSettingsInput;
    return updateLocalDeepResearchSettings(input);
  });
  handleIpc("voice:update-settings", async (_event, raw: UpdateVoiceSettingsInput) => {
    const input = updateVoiceSettingsSchema.parse(raw);
    const context = activeVoiceSttContextForProjectHost();
    return updateVoiceSettings(input, { source: "settings-ui" }, {
      providerStore: context.targetStore,
      workspacePath: context.workspacePath,
      onStateUpdated: () => emitRuntimeFeatureStateUpdated(context.targetStore),
    });
  });
  handleIpc("stt:update-settings", async (_event, raw: UpdateSttSettingsInput) => {
    const input = updateSttSettingsSchema.parse(raw);
    const context = activeVoiceSttContextForProjectHost();
    return updateSttSettings(input, { onStateUpdated: () => emitRuntimeFeatureStateUpdated(context.targetStore) });
  });
  handleIpc("voice:list-providers", () => listVoiceProvidersWithCachedVoices(requireActiveProjectRuntimeHost().store));
  handleIpc("voice:refresh-provider-voices", async (_event, raw: RefreshVoiceProviderVoicesInput) => {
    const input = refreshVoiceProviderVoicesSchema.parse(raw);
    return refreshVoiceProviderCatalog(input, requireActiveProjectRuntimeHost().store);
  });
  handleIpc("voice:onboarding-host-facts", () => collectVoiceOnboardingHostFacts({ isPackaged: isAppPackaged() }));
  handleIpc("voice:regenerate-message", async (_event, raw: RegenerateMessageVoiceInput) => {
    const input = regenerateMessageVoiceSchema.parse(raw);
    return regenerateMessageVoice(input);
  });
  handleIpc("voice:reveal-artifact", (_event, raw: MessageVoiceArtifactInput) => {
    const input = messageVoiceArtifactSchema.parse(raw);
    revealMessageVoiceArtifact(input);
  });
  handleIpc("voice:clear-artifact", async (_event, raw: MessageVoiceArtifactInput) => {
    const input = messageVoiceArtifactSchema.parse(raw);
    return clearMessageVoiceArtifact(input);
  });
  handleIpc("voice:inspect-artifacts", (_event, raw: VoiceArtifactRetentionInput | undefined) => {
    const input = voiceArtifactRetentionSchema.parse(raw);
    return inspectVoiceArtifacts(input, input?.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost());
  });
  handleIpc("voice:prune-artifacts", async (_event, raw: VoiceArtifactRetentionInput | undefined) => {
    const input = voiceArtifactRetentionSchema.parse(raw);
    return pruneVoiceArtifacts(input, input?.threadId ? requireProjectRuntimeHostForThread(input.threadId) : requireActiveProjectRuntimeHost());
  });
  handleIpc("stt:list-providers", () => listSttProvidersWithValidation(activeVoiceSttContextForProjectHost().workspacePath));
  handleIpc("stt:setup-provider", async (_event, raw: SttProviderSetupInput) => {
    const input = sttProviderSetupSchema.parse(raw);
    return setupSttProvider(input, activeVoiceSttContextForProjectHost());
  });
  handleIpc("vision:minicpm-setup-provider", async (_event, raw: MiniCpmVisionSetupInput) => {
    const input = miniCpmVisionSetupSchema.parse(raw);
    return setupMiniCpmVision(input, activeVoiceSttContextForProjectHost().workspacePath);
  });
  handleIpc("vision:minicpm-analyze", async (_event, raw: MiniCpmVisionAnalyzeInput) => {
    const input = miniCpmVisionAnalyzeSchema.parse(raw);
    return analyzeMiniCpmVision(input, activeVoiceSttContextForProjectHost().workspacePath);
  });
  handleIpc("local-deep-research:setup", async (_event, raw: LocalDeepResearchSetupInput) => {
    const input = localDeepResearchSetupSchema.parse(raw);
    return setupLocalDeepResearch(input, activeVoiceSttContextForProjectHost().workspacePath);
  });
  handleIpc("local-deep-research:list-runs", async (_event, raw: LocalDeepResearchRunHistoryInput | undefined) => {
    const input = localDeepResearchRunHistorySchema.parse(raw);
    return listLocalDeepResearchRunsForSettings(input, activeVoiceSttContextForProjectHost().workspacePath);
  });
  handleIpc("stt:save-test-audio", async (_event, raw: SttTestAudioInput) => {
    const input = sttTestAudioSchema.parse(raw);
    return saveSttTestAudio(activeVoiceSttContextForProjectHost().workspacePath, input);
  });
  handleIpc("stt:transcribe-audio", async (_event, raw: SttTranscribeAudioInput) => {
    const input = sttTranscribeAudioSchema.parse(raw);
    return transcribeSttAudio(input, requireProjectRuntimeHostForThread(input.threadId));
  });
  handleIpc("stt:cancel-transcription", () => cancelSttTranscription(activeVoiceSttContextForProjectHost().workspacePath));
  handleIpc("stt:set-tts-speaking", async (_event, raw: SetSttTtsSpeakingInput) => {
    const input = setSttTtsSpeakingSchema.parse(raw);
    return setSttTtsSpeaking(input, activeVoiceSttContextForProjectHost().workspacePath);
  });
}

function assertNoRawModelProviderEndpointInstallSecretMaterial(value: unknown, path: string[] = []): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRawModelProviderEndpointInstallSecretMaterial(entry, [...path, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (rawProviderInstallSecretKey(key)) {
      throw new Error(`Model provider endpoint install cannot accept raw credential field ${[...path, key].join(".")}. Use credentialRef.managedSecretRef.`);
    }
    assertNoRawModelProviderEndpointInstallSecretMaterial(nested, [...path, key]);
  }
}

function rawProviderInstallSecretKey(key: string): boolean {
  return /^(api[_-]?key|ambientManagedSecret|authorization|bearer|password|secret|token|value)$/i.test(key.trim());
}
