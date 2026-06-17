import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AppAppearance,
  AgentMemoryClearResult,
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemoryStorageDiagnostics,
  AgentMemorySettings,
  AmbientFeatureFlagSettings,
  InstallModelProviderEndpointInput,
  InstallModelProviderEndpointResult,
  LocalDeepResearchRunHistoryResult,
  LocalDeepResearchSettings,
  LocalDeepResearchSetupResult,
  MediaPlaybackSettings,
  MessageVoiceState,
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionSetupResult,
  LocalModelRuntimeLifecycleActionResult,
  ModelProviderCredentialSaveResult,
  ModelRuntimeSettings,
  RefreshVoiceProviderVoicesResult,
  SaveModelProviderCredentialInput,
  SearchRoutingSettings,
  SetThemePreferenceInput,
  SttProviderCandidate,
  SttProviderSetupResult,
  SttQueueState,
  SttSettings,
  SttTestAudioResult,
  SttTranscribeAudioResult,
  VoiceArtifactPruneResult,
  VoiceArtifactRetentionSummary,
  VoiceOnboardingHostFacts,
  VoiceProviderCandidate,
  VoiceSettings,
} from "../../shared/types";
import {
  registerSettingsIpc,
  settingsIpcChannels,
  type RegisterSettingsIpcDependencies,
  type VoiceSttSettingsContext,
} from "./registerSettingsIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerSettingsIpc", () => {
  it("registers the core settings channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...settingsIpcChannels]);
  });

  it("parses inputs before calling settings dependencies", async () => {
    const { deps, invoke } = registerWithFakes();

    await invoke("media:update-playback-settings", { generatedMediaAutoplay: true });
    await invoke("thinking-display:update-settings", { mode: "transient" });
    await invoke("feature-flags:update-settings", { subagents: true, tencentDbMemory: true, slashCommands: true });
    await invoke("memory:update-settings", { enabled: true, defaultThreadEnabled: true });
    await expect(invoke("memory:diagnostics")).resolves.toMatchObject({ adapter: "tencentdb" });
    await expect(invoke("memory:embedding-lifecycle-action", { action: "check" })).resolves.toMatchObject({ status: "ready" });
    await invoke("memory:clear");
    await invoke("search-routing:update-settings", { webSearch: { activity: "web_search" }, extra: true });

    expect(deps.updateMediaPlaybackSettings).toHaveBeenCalledWith({ generatedMediaAutoplay: true });
    expect(deps.updateThinkingDisplaySettings).toHaveBeenCalledWith({ mode: "transient", showRunStatusCard: false });
    expect(deps.updateFeatureFlagSettings).toHaveBeenCalledWith({ subagents: true, tencentDbMemory: true, slashCommands: true });
    expect(deps.updateMemorySettings).toHaveBeenCalledWith({ enabled: true, defaultThreadEnabled: true });
    expect(deps.getAgentMemoryDiagnostics).toHaveBeenCalledOnce();
    expect(deps.runAgentMemoryEmbeddingLifecycleAction).toHaveBeenCalledWith({ action: "check" });
    expect(deps.clearAgentMemory).toHaveBeenCalledOnce();
    expect(deps.updateSearchRoutingSettings).toHaveBeenCalledWith({ webSearch: { activity: "web_search" }, extra: true });
  });

  it("rejects invalid model runtime timeout settings", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("model-runtime:update-settings", { providerPreStreamTimeoutMs: 4_999 })).rejects.toThrow();
    expect(deps.updateModelRuntimeSettings).not.toHaveBeenCalled();
  });

  it("installs endpoint providers through managed credential references only", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = sampleInstallModelProviderEndpointInput();

    await expect(invoke("model-runtime:install-endpoint-provider", input)).resolves.toEqual(sampleInstallModelProviderEndpointResult());

    expect(deps.installModelProviderEndpoint).toHaveBeenCalledWith(input);
    expect(JSON.stringify(vi.mocked(deps.installModelProviderEndpoint).mock.calls)).not.toContain("sk-");
  });

  it("saves model provider credentials as managed refs before endpoint install", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = sampleSaveModelProviderCredentialInput();

    await expect(invoke("model-runtime:save-provider-credential", input)).resolves.toEqual(sampleSaveModelProviderCredentialResult());

    expect(deps.saveModelProviderCredential).toHaveBeenCalledWith(input);
    expect(JSON.stringify(sampleSaveModelProviderCredentialResult())).not.toContain(input.value);
  });

  it("rejects invalid model provider credential save inputs before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("model-runtime:save-provider-credential", {
      ...sampleSaveModelProviderCredentialInput(),
      modelId: "",
    })).rejects.toThrow();

    expect(deps.saveModelProviderCredential).not.toHaveBeenCalled();
  });

  it("rejects raw endpoint provider secret material before install", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("model-runtime:install-endpoint-provider", {
      ...sampleInstallModelProviderEndpointInput(),
      apiKey: "sk-test-secret-value-123456",
    })).rejects.toThrow("cannot accept raw credential field apiKey");
    await expect(invoke("model-runtime:install-endpoint-provider", {
      ...sampleInstallModelProviderEndpointInput(),
      nested: {
        secret: "sk-test-secret-value-123456",
      },
    })).rejects.toThrow("cannot accept raw credential field nested.secret");
    expect(deps.installModelProviderEndpoint).not.toHaveBeenCalled();
  });

  it("runs local model runtime lifecycle actions through settings IPC", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = {
      action: "stop",
      runtimeId: "local-text-runtime",
      force: false,
      dryRun: false,
    };

    await expect(invoke("model-runtime:lifecycle-action", input)).resolves.toEqual(sampleLocalModelRuntimeLifecycleActionResult());

    expect(deps.runLocalModelRuntimeLifecycleAction).toHaveBeenCalledWith(input);
  });

  it("rejects invalid local model runtime lifecycle action input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("model-runtime:lifecycle-action", {
      action: "kill",
      runtimeId: "local-text-runtime",
    })).rejects.toThrow();

    expect(deps.runLocalModelRuntimeLifecycleAction).not.toHaveBeenCalled();
  });

  it("updates voice and STT settings through the active project context", async () => {
    const { deps, invoke } = registerWithFakes();
    const voiceInput = sampleVoiceSettings();
    const sttInput = sampleSttSettings();

    await invoke("voice:update-settings", voiceInput);
    await invoke("stt:update-settings", sttInput);

    const voiceCall = vi.mocked(deps.updateVoiceSettings).mock.calls[0];
    expect(voiceCall).toBeDefined();
    if (!voiceCall) throw new Error("Missing voice settings update call");
    expect(voiceCall[0]).toEqual(voiceInput);
    expect(voiceCall[1]).toEqual({ source: "settings-ui" });
    expect(voiceCall[2]).toMatchObject({
      providerStore: "project-store",
      workspacePath: "/tmp/ambient-workspace",
    });
    voiceCall[2].onStateUpdated();

    const sttCall = vi.mocked(deps.updateSttSettings).mock.calls[0];
    expect(sttCall).toBeDefined();
    if (!sttCall) throw new Error("Missing STT settings update call");
    expect(sttCall[0]).toEqual(sttInput);
    sttCall[1].onStateUpdated();

    expect(deps.activeVoiceSttContextForProjectHost).toHaveBeenCalledTimes(2);
    expect(deps.emitRuntimeFeatureStateUpdated).toHaveBeenCalledTimes(2);
    expect(deps.emitRuntimeFeatureStateUpdated).toHaveBeenCalledWith("project-store");
  });

  it("rejects invalid STT settings before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("stt:update-settings", {
      ...sampleSttSettings(),
      silenceFinalizeSeconds: 3,
    })).rejects.toThrow();
    expect(deps.updateSttSettings).not.toHaveBeenCalled();
  });

  it("lists voice and STT providers from the active project context", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("voice:list-providers")).resolves.toEqual([sampleVoiceProvider()]);
    await expect(invoke("stt:list-providers")).resolves.toEqual([sampleSttProvider()]);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.listVoiceProvidersWithCachedVoices).toHaveBeenCalledWith("project-store");
    expect(deps.activeVoiceSttContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.listSttProvidersWithValidation).toHaveBeenCalledWith("/tmp/ambient-workspace");
  });

  it("refreshes voice provider voices through the active project store", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = { providerCapabilityId: "voice-provider" };

    await expect(invoke("voice:refresh-provider-voices", input)).resolves.toEqual(sampleRefreshVoiceProviderVoicesResult());

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.refreshVoiceProviderCatalog).toHaveBeenCalledWith(input, "project-store");
  });

  it("rejects invalid voice provider refresh input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("voice:refresh-provider-voices", { providerCapabilityId: "" })).rejects.toThrow();
    expect(deps.refreshVoiceProviderCatalog).not.toHaveBeenCalled();
  });

  it("collects voice onboarding host facts with the app packaging state", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("voice:onboarding-host-facts")).resolves.toEqual(sampleVoiceOnboardingHostFacts());

    expect(deps.isAppPackaged).toHaveBeenCalledOnce();
    expect(deps.collectVoiceOnboardingHostFacts).toHaveBeenCalledWith({ isPackaged: false });
  });

  it("regenerates message voice after parsing the message input", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = { messageId: "message-1" };

    await expect(invoke("voice:regenerate-message", input)).resolves.toEqual(sampleMessageVoiceState());

    expect(deps.regenerateMessageVoice).toHaveBeenCalledWith(input);
  });

  it("rejects invalid message voice regeneration input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("voice:regenerate-message", { messageId: "" })).rejects.toThrow();
    expect(deps.regenerateMessageVoice).not.toHaveBeenCalled();
  });

  it("reveals message voice artifacts after parsing the message input", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = { messageId: "message-1" };

    await expect(invoke("voice:reveal-artifact", input)).resolves.toBeUndefined();

    expect(deps.revealMessageVoiceArtifact).toHaveBeenCalledWith(input);
  });

  it("clears message voice artifacts after parsing the message input", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = { messageId: "message-1" };

    await expect(invoke("voice:clear-artifact", input)).resolves.toEqual(sampleClearedMessageVoiceState());

    expect(deps.clearMessageVoiceArtifact).toHaveBeenCalledWith(input);
  });

  it("rejects invalid message voice artifact input before calling dependencies", async () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("voice:reveal-artifact", { messageId: "" })).toThrow();
    await expect(invoke("voice:clear-artifact", { messageId: "" })).rejects.toThrow();
    expect(deps.revealMessageVoiceArtifact).not.toHaveBeenCalled();
    expect(deps.clearMessageVoiceArtifact).not.toHaveBeenCalled();
  });

  it("inspects voice artifact retention through the active project host by default", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("voice:inspect-artifacts")).resolves.toEqual(sampleVoiceArtifactRetentionSummary());

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThread).not.toHaveBeenCalled();
    expect(deps.inspectVoiceArtifacts).toHaveBeenCalledWith(undefined, { store: "project-store" });
  });

  it("prunes voice artifact retention through the requested thread host", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = { threadId: "thread-1", providerCapabilityId: "voice-provider" };

    await expect(invoke("voice:prune-artifacts", input)).resolves.toEqual(sampleVoiceArtifactPruneResult());

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(deps.pruneVoiceArtifacts).toHaveBeenCalledWith(input, "thread-host");
  });

  it("rejects invalid voice artifact retention input before calling dependencies", async () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("voice:inspect-artifacts", { threadId: "" })).toThrow();
    await expect(invoke("voice:prune-artifacts", { providerCapabilityId: "" })).rejects.toThrow();
    expect(deps.inspectVoiceArtifacts).not.toHaveBeenCalled();
    expect(deps.pruneVoiceArtifacts).not.toHaveBeenCalled();
  });

  it("sets up an STT provider through the active project context", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = {
      provider: "qwen3-asr",
      action: "validate",
      installRuntime: true,
      runtimeBinaryPath: "/tmp/qwen3-asr",
      validationAudioPath: "/tmp/validation.wav",
      spokenLanguage: "English",
      selectProvider: true,
      enable: true,
    };

    await expect(invoke("stt:setup-provider", input)).resolves.toEqual(sampleSttSetupResult());

    expect(deps.setupSttProvider).toHaveBeenCalledWith(input, {
      targetStore: "project-store",
      workspacePath: "/tmp/ambient-workspace",
    });
  });

  it("rejects invalid STT provider setup input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("stt:setup-provider", { provider: "other-provider" })).rejects.toThrow();
    expect(deps.setupSttProvider).not.toHaveBeenCalled();
  });

  it("sets up MiniCPM vision through the active workspace context", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = {
      provider: "minicpm-v",
      action: "validate",
      installRuntime: true,
      runtimeBinaryPath: "/tmp/minicpm-v",
      runtimeArchivePath: "/tmp/minicpm-v.zip",
      runtimeArtifactId: "runtime-artifact",
      endpointUrl: "http://127.0.0.1:8800",
      validationImagePath: "/tmp/validation.png",
      validationTask: "ui_review",
      validationPrompt: "Describe the UI",
    };

    await expect(invoke("vision:minicpm-setup-provider", input)).resolves.toEqual(sampleMiniCpmVisionSetupResult());

    expect(deps.setupMiniCpmVision).toHaveBeenCalledWith(input, "/tmp/ambient-workspace");
  });

  it("rejects invalid MiniCPM vision setup input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("vision:minicpm-setup-provider", { provider: "other-provider" })).rejects.toThrow();
    expect(deps.setupMiniCpmVision).not.toHaveBeenCalled();
  });

  it("analyzes MiniCPM vision input through the active workspace context", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = {
      image: {
        path: "screenshots/ui.png",
        source: "workspace_file",
        label: "UI screenshot",
      },
      referenceImagePath: "screenshots/reference.png",
      task: "ui_review",
      prompt: "Review this interface",
      outputJsonPath: "artifacts/minicpm-analysis.json",
      runtimeBinaryPath: "/tmp/minicpm-v",
      endpointUrl: "http://127.0.0.1:8800",
      allowExternalImagePaths: false,
      startServer: true,
      stopAfter: true,
      waitMs: 1000,
      requestTimeoutMs: 5000,
      maxTokens: 512,
    };

    await expect(invoke("vision:minicpm-analyze", input)).resolves.toEqual(sampleMiniCpmVisionAnalysisResult());

    expect(deps.analyzeMiniCpmVision).toHaveBeenCalledWith(input, "/tmp/ambient-workspace");
  });

  it("rejects MiniCPM vision analyze input with conflicting image and video sources", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("vision:minicpm-analyze", {
      imagePath: "screenshots/ui.png",
      videoPath: "videos/demo.mp4",
    })).rejects.toThrow();
    expect(deps.analyzeMiniCpmVision).not.toHaveBeenCalled();
  });

  it("rejects MiniCPM vision analyze input without a visual source", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("vision:minicpm-analyze", { task: "ui_review" })).rejects.toThrow();
    expect(deps.analyzeMiniCpmVision).not.toHaveBeenCalled();
  });

  it("sets up local deep research through the active workspace context", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = {
      action: "validate",
      q8Override: true,
      installModel: false,
      installRuntime: true,
      runtimeArtifactId: "runtime-artifact",
    };

    await expect(invoke("local-deep-research:setup", input)).resolves.toEqual(sampleLocalDeepResearchSetupResult());

    expect(deps.setupLocalDeepResearch).toHaveBeenCalledWith(input, "/tmp/ambient-workspace");
  });

  it("rejects invalid local deep research setup input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("local-deep-research:setup", { action: "launch" })).rejects.toThrow();
    expect(deps.setupLocalDeepResearch).not.toHaveBeenCalled();
  });

  it("lists local deep research runs through the active workspace context", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("local-deep-research:list-runs", { limit: 5 })).resolves.toEqual(sampleLocalDeepResearchRunHistoryResult());

    expect(deps.listLocalDeepResearchRunsForSettings).toHaveBeenCalledWith({ limit: 5 }, "/tmp/ambient-workspace");
  });

  it("rejects invalid local deep research run history input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("local-deep-research:list-runs", { limit: 101 })).rejects.toThrow();
    expect(deps.listLocalDeepResearchRunsForSettings).not.toHaveBeenCalled();
  });

  it("parses Local Deep Research run budget settings before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = {
      runBudget: {
        defaultEffort: "deep",
        customMaxToolCalls: 80,
        onExhausted: "summarize",
      },
    };

    await expect(invoke("local-deep-research:update-settings", input)).resolves.toEqual(input);
    expect(deps.updateLocalDeepResearchSettings).toHaveBeenCalledWith(input);

    await expect(invoke("local-deep-research:update-settings", {
      runBudget: {
        defaultEffort: "unbounded",
      },
    })).rejects.toThrow();
    expect(deps.updateLocalDeepResearchSettings).toHaveBeenCalledTimes(1);
  });

  it("saves STT test audio through the active workspace context", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = sampleSttTestAudioInput();

    await expect(invoke("stt:save-test-audio", input)).resolves.toEqual(sampleSttTestAudioResult());

    expect(deps.saveSttTestAudio).toHaveBeenCalledWith("/tmp/ambient-workspace", input);
  });

  it("rejects invalid STT test audio input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("stt:save-test-audio", {
      ...sampleSttTestAudioInput(),
      audioBase64: "",
    })).rejects.toThrow();
    expect(deps.saveSttTestAudio).not.toHaveBeenCalled();
  });

  it("transcribes STT audio through the thread runtime host", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = sampleSttTranscribeAudioInput();

    await expect(invoke("stt:transcribe-audio", input)).resolves.toEqual(sampleSttTranscribeAudioResult());

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(deps.transcribeSttAudio).toHaveBeenCalledWith(input, "thread-host");
  });

  it("rejects invalid STT transcribe input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("stt:transcribe-audio", {
      ...sampleSttTranscribeAudioInput(),
      threadId: "",
    })).rejects.toThrow();
    expect(deps.transcribeSttAudio).not.toHaveBeenCalled();
  });

  it("cancels STT transcription through the active workspace context", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("stt:cancel-transcription")).resolves.toEqual(sampleSttQueueState());

    expect(deps.cancelSttTranscription).toHaveBeenCalledWith("/tmp/ambient-workspace");
  });

  it("sets STT TTS speaking state through the active workspace context", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = { speaking: true };

    await expect(invoke("stt:set-tts-speaking", input)).resolves.toEqual(sampleSttQueueState());

    expect(deps.setSttTtsSpeaking).toHaveBeenCalledWith(input, "/tmp/ambient-workspace");
  });

  it("rejects invalid STT TTS speaking input before calling the dependency", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("stt:set-tts-speaking", { speaking: "yes" })).rejects.toThrow();
    expect(deps.setSttTtsSpeaking).not.toHaveBeenCalled();
  });
});

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterSettingsIpcDependencies<VoiceSttSettingsContext<string>, string, string> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    setThemePreference: vi.fn(async (input: SetThemePreferenceInput): Promise<AppAppearance> => ({
      themePreference: input.themePreference,
      resolvedTheme: input.themePreference === "dark" ? "dark" : "light",
    })),
    updateMediaPlaybackSettings: vi.fn(async (input: MediaPlaybackSettings) => input),
    updateThinkingDisplaySettings: vi.fn(async (input) => input),
    updateModelRuntimeSettings: vi.fn(async (input) => ({
      aggressiveRetries: Boolean(input.aggressiveRetries),
      providerPreStreamTimeoutMs: input.providerPreStreamTimeoutMs ?? 10_000,
      providerStreamIdleTimeoutMs: input.providerStreamIdleTimeoutMs ?? 10_000,
      installedProviders: input.installedProviders ?? [],
    } satisfies ModelRuntimeSettings)),
    saveModelProviderCredential: vi.fn(async () => sampleSaveModelProviderCredentialResult()),
    installModelProviderEndpoint: vi.fn(async () => sampleInstallModelProviderEndpointResult()),
    runLocalModelRuntimeLifecycleAction: vi.fn(async () => sampleLocalModelRuntimeLifecycleActionResult()),
    updateFeatureFlagSettings: vi.fn(async (input): Promise<AmbientFeatureFlagSettings> => ({
      subagents: Boolean(input.subagents),
      tencentDbMemory: Boolean(input.tencentDbMemory),
      slashCommands: Boolean(input.slashCommands),
    })),
    updateMemorySettings: vi.fn(async (input): Promise<AgentMemorySettings> => ({
      enabled: Boolean(input.enabled),
      defaultThreadEnabled: Boolean(input.defaultThreadEnabled),
      adapter: input.adapter ?? "tencentdb",
      shortTermOffloadEnabled: Boolean(input.shortTermOffloadEnabled),
      embeddings: {
        enabled: Boolean(input.embeddings?.enabled),
        providerMode: "ambient-managed",
        ...(input.embeddings?.providerCapabilityId ? { providerCapabilityId: input.embeddings.providerCapabilityId } : {}),
        autoStartProvider: Boolean(input.embeddings?.autoStartProvider),
        ...(input.embeddings?.modelId ? { modelId: input.embeddings.modelId } : {}),
        ...(input.embeddings?.dimensions ? { dimensions: input.embeddings.dimensions } : {}),
        sendDimensions: Boolean(input.embeddings?.sendDimensions),
        maxInputChars: input.embeddings?.maxInputChars ?? 512,
        timeoutMs: input.embeddings?.timeoutMs ?? 10_000,
        preflightEnabled: input.embeddings?.preflightEnabled ?? true,
      },
      storageScope: input.storageScope ?? "workspace",
    })),
    getAgentMemoryDiagnostics: vi.fn(async () => sampleAgentMemoryDiagnostics()),
    runAgentMemoryEmbeddingLifecycleAction: vi.fn(async (input): Promise<AgentMemoryEmbeddingLifecycleActionResult> => ({
      schemaVersion: "ambient-agent-memory-embedding-lifecycle-action-v1",
      action: input.action,
      status: "ready",
      message: "Embedding endpoint preflight passed.",
      checkedAt: "2026-06-13T00:00:00.000Z",
      diagnostics: sampleAgentMemoryDiagnostics(),
    })),
    clearAgentMemory: vi.fn(async () => sampleAgentMemoryClearResult()),
    updatePlannerSettings: vi.fn(async (input) => input),
    hydrateSearchRoutingSettingsForActiveWorkspace: vi.fn(async () => ({} satisfies SearchRoutingSettings)),
    updateSearchRoutingSettings: vi.fn(async (input) => input as SearchRoutingSettings),
    updateLocalDeepResearchSettings: vi.fn(async (input) => input as LocalDeepResearchSettings),
    activeVoiceSttContextForProjectHost: vi.fn(() => ({
      targetStore: "project-store",
      workspacePath: "/tmp/ambient-workspace",
    })),
    emitRuntimeFeatureStateUpdated: vi.fn(),
    updateVoiceSettings: vi.fn(async (input: VoiceSettings) => input),
    updateSttSettings: vi.fn(async (input: SttSettings) => input),
    requireActiveProjectRuntimeHost: vi.fn(() => ({
      store: "project-store",
    })),
    listVoiceProvidersWithCachedVoices: vi.fn(async () => [sampleVoiceProvider()]),
    refreshVoiceProviderCatalog: vi.fn(async () => sampleRefreshVoiceProviderVoicesResult()),
    isAppPackaged: vi.fn(() => false),
    collectVoiceOnboardingHostFacts: vi.fn(async () => sampleVoiceOnboardingHostFacts()),
    regenerateMessageVoice: vi.fn(async () => sampleMessageVoiceState()),
    revealMessageVoiceArtifact: vi.fn(),
    clearMessageVoiceArtifact: vi.fn(async () => sampleClearedMessageVoiceState()),
    inspectVoiceArtifacts: vi.fn(async () => sampleVoiceArtifactRetentionSummary()),
    pruneVoiceArtifacts: vi.fn(async () => sampleVoiceArtifactPruneResult()),
    listSttProvidersWithValidation: vi.fn(async () => [sampleSttProvider()]),
    setupSttProvider: vi.fn(async () => sampleSttSetupResult()),
    setupMiniCpmVision: vi.fn(async () => sampleMiniCpmVisionSetupResult()),
    analyzeMiniCpmVision: vi.fn(async () => sampleMiniCpmVisionAnalysisResult()),
    setupLocalDeepResearch: vi.fn(async () => sampleLocalDeepResearchSetupResult()),
    listLocalDeepResearchRunsForSettings: vi.fn(async () => sampleLocalDeepResearchRunHistoryResult()),
    saveSttTestAudio: vi.fn(async () => sampleSttTestAudioResult()),
    requireProjectRuntimeHostForThread: vi.fn(() => "thread-host"),
    transcribeSttAudio: vi.fn(async () => sampleSttTranscribeAudioResult()),
    cancelSttTranscription: vi.fn(async () => sampleSttQueueState()),
    setSttTtsSpeaking: vi.fn(async () => sampleSttQueueState()),
  };
  registerSettingsIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function sampleAgentMemoryClearResult(): AgentMemoryClearResult {
  return {
    adapter: "tencentdb",
    clearedAt: "2026-06-13T00:00:00.000Z",
    dataDir: "/tmp/ambient-memory/tencentdb",
    dataDirExisted: true,
    removedFileCount: 2,
    removedBytes: 128,
    activeSessionsReset: {
      disposedSessions: 1,
      deferredSessions: 0,
      disposedThreadIds: ["thread-1"],
      deferredThreadIds: [],
    },
  };
}

function sampleAgentMemoryDiagnostics(): AgentMemoryStorageDiagnostics {
  return {
    schemaVersion: "ambient-agent-memory-diagnostics-v1",
    adapter: "tencentdb",
    storageScope: "workspace",
    checkedAt: "2026-06-13T00:00:00.000Z",
    status: "healthy",
    message: "TencentDB Agent Memory diagnostics are available.",
    featureEnabled: true,
    settingsEnabled: true,
    defaultThreadEnabled: true,
    embedding: {
      enabled: false,
      status: "disabled",
      message: "TencentDB memory embeddings are disabled.",
    },
    activeThreadCount: 1,
    threadEnabledCount: 1,
    dataDir: "/tmp/ambient-memory/tencentdb",
    dataDirExists: true,
    storageSchemaStatus: "current",
    storageSchemaPath: "/tmp/ambient-memory/tencentdb/ambient-memory-schema.json",
    storageSchemaExpectedVersion: "ambient-tencent-memory-storage-v1",
    storageSchemaVersion: "ambient-tencent-memory-storage-v1",
    storageSchemaMessage: "TencentDB Agent Memory storage schema marker is current.",
    fileCount: 2,
    totalBytes: 128,
    topLevelEntryCount: 1,
    rawContentIncluded: false,
    runtimeSnapshots: [],
    errors: [],
  };
}

function sampleInstallModelProviderEndpointInput(): InstallModelProviderEndpointInput {
  return {
    templateId: "generic-openai-compatible",
    providerId: "customer-router",
    providerLabel: "Customer Router",
    modelId: "CUSTOM/Router Model v2",
    modelLabel: "Router Model v2",
    baseUrl: "https://provider.example",
    credentialRef: {
      flow: "ambient_cli_secret_request",
      managedSecretRef: `ambient-secret-ref:v1:${"a".repeat(64)}`,
      label: "Desktop secret request",
    },
    generatedAt: "2026-06-06T00:00:00.000Z",
    measuredAt: "2026-06-06T00:00:01.000Z",
    reliabilitySampleCount: 2,
    extraProbeIds: ["schema_output"],
    enabled: true,
  };
}

function sampleSaveModelProviderCredentialInput(): SaveModelProviderCredentialInput {
  return {
    templateId: "generic-openai-compatible",
    providerId: "customer-router",
    modelId: "CUSTOM/Router Model v2",
    baseUrl: "https://provider.example",
    label: "Customer router key",
    value: "sk-test-secret-value-123456",
  };
}

function sampleSaveModelProviderCredentialResult(): ModelProviderCredentialSaveResult {
  return {
    schemaVersion: "ambient-model-provider-credential-save-v1",
    templateId: "generic-openai-compatible",
    providerId: "customer-router",
    modelId: "CUSTOM/Router Model v2",
    baseUrl: "https://provider.example",
    configured: true,
    credentialRef: {
      flow: "ambient_cli_secret_request",
      managedSecretRef: `ambient-secret-ref:v1:${"c".repeat(64)}`,
      label: "Customer router key",
    },
  };
}

function sampleInstallModelProviderEndpointResult(): InstallModelProviderEndpointResult {
  return {
    schemaVersion: "ambient-model-provider-settings-install-v1",
    installedProviderKey: "generic-openai-compatible:customer-router:CUSTOM/Router Model v2",
    settings: {
      aggressiveRetries: true,
      providerPreStreamTimeoutMs: 45_000,
      providerStreamIdleTimeoutMs: 30_000,
      installedProviders: [],
    },
    probeResult: {
      schemaVersion: "ambient-model-provider-endpoint-probe-service-v1",
      templateId: "generic-openai-compatible",
      provider: {
        id: "customer-router",
        label: "Customer Router",
        locality: "cloud",
        secretRequirement: "user-secret",
        supportsStreaming: true,
        supportsTools: true,
        notes: [],
      },
      endpoint: {
        schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1",
        compatibility: "openai-compatible",
        baseUrl: "https://provider.example",
      },
      candidateProfile: sampleEndpointRuntimeProfile(),
      profile: sampleEndpointRuntimeProfile(),
      probePlan: {
        schemaVersion: "ambient-model-provider-capability-probe-v1",
        templateId: "generic-openai-compatible",
        providerId: "customer-router",
        modelId: "CUSTOM/Router Model v2",
        generatedAt: "2026-06-06T00:00:00.000Z",
        compatibility: "openai-compatible",
        probeIds: ["streaming"],
        requiredProbeIdsForMain: ["streaming"],
        requiredProbeIdsForSubagent: ["streaming"],
        secretFlow: "ambient_cli_secret_request",
      },
      probeReport: {
        schemaVersion: "ambient-model-provider-capability-probe-v1",
        templateId: "generic-openai-compatible",
        providerId: "customer-router",
        modelId: "CUSTOM/Router Model v2",
        generatedAt: "2026-06-06T00:00:00.000Z",
        observations: [{
          probeId: "streaming",
          status: "passed",
          measuredAt: "2026-06-06T00:00:01.000Z",
        }],
      },
      eligibility: {
        schemaVersion: "ambient-model-provider-capability-eligibility-v1",
        templateId: "generic-openai-compatible",
        providerId: "customer-router",
        modelId: "CUSTOM/Router Model v2",
        eligibleAsMain: true,
        eligibleAsSubagent: true,
        mainBlockers: [],
        subagentBlockers: [],
        warnings: [],
        diagnostics: [],
      },
    },
  };
}

function sampleEndpointRuntimeProfile() {
  return {
    schemaVersion: "ambient-model-runtime-profile-v1" as const,
    profileId: "customer-router:CUSTOM/Router Model v2",
    providerId: "customer-router",
    modelId: "CUSTOM/Router Model v2",
    label: "Router Model v2",
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    supportsStreaming: true,
    toolUse: "ambient-tools" as const,
    structuredOutput: "schema" as const,
    supportsVision: false,
    supportsAudio: false,
    locality: "cloud" as const,
    costClass: "metered" as const,
    trustClass: "user-configured" as const,
    privacyLabel: "User-configured endpoint",
    providerQuirks: [],
  };
}

function sampleClearedMessageVoiceState(): MessageVoiceState {
  return {
    messageId: "message-1",
    threadId: "thread-1",
    status: "canceled",
    source: "assistant-text",
    sourceMessageId: "message-1",
    providerCapabilityId: "voice-provider",
    providerId: "voice",
    voiceId: "voice-id",
    spokenText: "Ready to speak.",
    spokenTextChars: 15,
    sourceTextChars: 15,
    lastAudioPath: ".ambient/voice/thread-1/message-1.mp3",
    error: "Voice artifact cleared.",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:02.000Z",
  };
}

function sampleMessageVoiceState(): MessageVoiceState {
  return {
    messageId: "message-1",
    threadId: "thread-1",
    status: "ready",
    source: "assistant-text",
    sourceMessageId: "message-1",
    providerCapabilityId: "voice-provider",
    providerId: "voice",
    voiceId: "voice-id",
    spokenText: "Ready to speak.",
    spokenTextChars: 15,
    sourceTextChars: 15,
    audioPath: ".ambient/voice/thread-1/message-1.mp3",
    mediaUrl: "ambient-media://workspace/media/message-1.mp3",
    mimeType: "audio/mpeg",
    durationMs: 1200,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:01.000Z",
  };
}

function sampleVoiceArtifactRetentionSummary(): VoiceArtifactRetentionSummary {
  return {
    threadId: "thread-1",
    providerCapabilityId: "voice-provider",
    rootPath: "/tmp/ambient-workspace/.ambient/voice",
    managedFileCount: 2,
    managedBytes: 4096,
    referencedFileCount: 1,
    referencedBytes: 2048,
    orphanedFileCount: 1,
    orphanedBytes: 2048,
    referencedPreview: [".ambient/voice/thread-1/message-1.mp3"],
    orphanedPreview: [".ambient/voice/thread-1/orphan.mp3"],
  };
}

function sampleVoiceArtifactPruneResult(): VoiceArtifactPruneResult {
  return {
    ...sampleVoiceArtifactRetentionSummary(),
    deletedFileCount: 1,
    deletedBytes: 2048,
    deletedPreview: [".ambient/voice/thread-1/orphan.mp3"],
  };
}

function sampleVoiceOnboardingHostFacts(): VoiceOnboardingHostFacts {
  return {
    os: {
      platform: "darwin",
      release: "25.0.0",
      arch: "arm64",
      appMode: "development",
    },
    hardware: {
      cpuModel: "Apple M3",
      cpuCount: 8,
      memoryBytes: 18_000_000_000,
      accelerator: "Apple Silicon; Metal acceleration likely available for MLX-compatible local providers.",
    },
    runtimes: [
      {
        name: "Node.js",
        command: "node",
        available: true,
        version: "v24.0.0",
      },
    ],
  };
}

function sampleRefreshVoiceProviderVoicesResult(): RefreshVoiceProviderVoicesResult {
  return {
    providerCapabilityId: "voice-provider",
    providerLabel: "Voice Provider",
    source: "cloud-api",
    refreshedAt: "2026-06-04T00:00:00.000Z",
    expiresAt: "2026-06-05T00:00:00.000Z",
    voiceCount: 2,
    durationMs: 42,
    stdoutArtifactPath: ".ambient/voice/stdout.txt",
  };
}

function sampleSttQueueState(): SttQueueState {
  return {
    phase: "idle",
    queuedUtteranceIds: [],
  };
}

function sampleSttTranscribeAudioInput() {
  return {
    threadId: "thread-1",
    audioPath: "/tmp/ambient-workspace/.ambient/stt/utterance-1.webm",
    utteranceId: "utterance-1",
  };
}

function sampleSttTranscribeAudioResult(): SttTranscribeAudioResult {
  return {
    state: {
      utteranceId: "utterance-1",
      threadId: "thread-1",
      status: "ready",
      audioPath: "/tmp/ambient-workspace/.ambient/stt/utterance-1.webm",
      text: "hello ambient",
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:01.000Z",
    },
    queue: {
      phase: "ready_to_send",
      activeUtteranceId: "utterance-1",
      queuedUtteranceIds: [],
    },
  };
}

function sampleSttTestAudioInput() {
  return {
    source: "settings-microphone",
    audioBase64: "YW1iaWVudA==",
    threadId: "thread-1",
    durationMs: 1200,
    sampleRate: 48_000,
    channels: 1,
    microphoneDeviceId: "mic-1",
    microphoneDeviceLabel: "Default microphone",
  };
}

function sampleSttTestAudioResult(): SttTestAudioResult {
  return {
    threadId: "thread-1",
    utteranceId: "utterance-1",
    audioPath: "/tmp/ambient-workspace/.ambient/stt/utterance-1.webm",
    bytes: 1024,
    durationMs: 1200,
    sampleRate: 48_000,
    channels: 1,
    microphoneDeviceId: "mic-1",
    microphoneDeviceLabel: "Default microphone",
    createdAt: "2026-06-04T00:00:00.000Z",
  };
}

function sampleLocalDeepResearchRunHistoryResult(): LocalDeepResearchRunHistoryResult {
  return {
    schemaVersion: "ambient-local-deep-research-run-history-v1",
    runsRootPath: "/tmp/ambient-workspace/.ambient/local-deep-research/runs",
    entries: [],
    truncated: false,
  };
}

function sampleLocalDeepResearchSetupResult(): LocalDeepResearchSetupResult {
  return {
    schemaVersion: "ambient-local-deep-research-setup-result-v1",
    action: "validate",
    capabilityId: "local.deep-research.literesearcher",
    setupStatus: "ready",
    warnings: [],
    blockers: [],
    nextActions: [],
  } as unknown as LocalDeepResearchSetupResult;
}

function sampleLocalModelRuntimeLifecycleActionResult(): LocalModelRuntimeLifecycleActionResult {
  return {
    schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
    action: "stop",
    runtimeId: "local-text-runtime",
    status: "stopped",
    message: "Local model runtime stopped: local-text-runtime.",
    dryRun: false,
    forceRequested: false,
    before: {
      inventory: {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-06-07T00:00:00.000Z",
        entries: [],
        activeLeases: [],
      },
      localModelResources: {
        schemaVersion: "ambient-local-model-resource-registry-v1",
        capturedAt: "2026-06-07T00:00:00.000Z",
        entries: [],
        activeCount: 0,
        activeEstimatedResidentMemoryBytes: 0,
      },
    },
  } as unknown as LocalModelRuntimeLifecycleActionResult;
}

function sampleMiniCpmVisionAnalysisResult(): MiniCpmVisionAnalysisResult {
  return {
    provider: "minicpm-v",
    status: "passed",
    packageName: "MiniCPM Vision",
    task: "ui_review",
    prompt: "Review this interface",
    durationMs: 25,
    summary: "The interface is readable.",
    observations: [],
    limitations: [],
    image: {
      path: "screenshots/ui.png",
      basename: "ui.png",
      bytes: 1234,
      sha256: "abc123",
      role: "primary",
      source: "workspace_file",
    },
    artifacts: {
      jsonPath: "artifacts/minicpm-analysis.json",
    },
    installStatuses: [],
    commands: [],
    validation: {
      valid: true,
      errors: [],
    },
    redaction: {
      returnedImagePathIsWorkspaceRelative: true,
      stdoutDoesNotContainAbsoluteImagePath: true,
      artifactPathIsWorkspaceRelative: true,
    },
  };
}

function sampleMiniCpmVisionSetupResult(): MiniCpmVisionSetupResult {
  return {
    provider: "minicpm-v",
    action: "validate",
    status: "ready",
    packageName: "MiniCPM Vision",
    installStatuses: [],
    runtimeCandidates: [],
    validation: {
      schemaVersion: "ambient-minicpm-v-provider-validation-v1",
      provider: "minicpm-v",
      packageName: "MiniCPM Vision",
      status: "passed",
      updatedAt: "2026-06-04T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      lane: "native",
      missingHints: [],
    },
    diagnostics: [],
    nextSteps: [],
  };
}

function sampleSttSetupResult(): SttProviderSetupResult {
  return {
    provider: "qwen3-asr",
    action: "validate",
    status: "ready",
    packageName: "STT Package",
    installStatuses: [],
    providers: [sampleSttProvider()],
    validation: {
      schemaVersion: "ambient-stt-provider-validation-v1",
      provider: "qwen3-asr",
      packageName: "STT Package",
      status: "passed",
      updatedAt: "2026-06-04T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      lane: "native",
      missingHints: [],
    },
    runtimeCandidates: [],
    nextSteps: [],
  };
}

function sampleVoiceProvider(): VoiceProviderCandidate {
  return {
    packageId: "voice-package",
    packageName: "Voice Package",
    command: "voice-command",
    capabilityId: "voice-provider",
    providerId: "voice",
    label: "Voice Provider",
    format: "mp3",
    formats: ["mp3"],
    voices: [],
    installed: true,
    available: true,
    availabilityReason: "Available",
  };
}

function sampleSttProvider(): SttProviderCandidate {
  return {
    packageId: "stt-package",
    packageName: "STT Package",
    command: "stt-command",
    capabilityId: "stt-provider",
    providerId: "stt",
    label: "STT Provider",
    languages: ["English"],
    installed: true,
    available: true,
    availabilityReason: "Available",
  };
}

function sampleVoiceSettings(): VoiceSettings {
  return {
    enabled: true,
    mode: "assistant-final",
    autoplay: true,
    providerCapabilityId: "voice-provider",
    voiceId: "voice-id",
    preferredVoicesByProvider: {
      "voice-provider": "voice-id",
    },
    maxChars: 1500,
    longReply: "summarize",
    format: "mp3",
    artifactCacheMaxMb: 30,
  };
}

function sampleSttSettings(): SttSettings {
  return {
    enabled: true,
    providerCapabilityId: "stt-provider",
    spokenLanguage: "English",
    pushToTalkShortcut: "Alt+Space",
    microphone: {
      deviceId: "mic-1",
      label: "Default microphone",
    },
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
}
