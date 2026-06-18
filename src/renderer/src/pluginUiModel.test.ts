import { describe, expect, it } from "vitest";
import { providerCatalogSettingsState } from "../../main/provider/providerCatalog";
import type { ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilitySummary, AmbientPluginAppAuthSummary, AmbientPluginCapabilitySummary, AmbientPluginRegistry, AmbientPluginSummary, CapabilityBuilderHistoryEntry, CodexPluginSummary, FirstPartyGoogleIntegrationState } from "../../shared/pluginTypes";
import {
  buildCapabilityBuilderPrompt,
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
  buildVoiceProviderCapabilityPrompt,
  buildCapabilityBuilderHistoryPreviewPrompt,
  buildCapabilityBuilderHistoryRepairPlanPrompt,
  buildCapabilityBuilderHistoryReregisterPrompt,
  buildGeneratedCapabilityRemovalPlanPrompt,
  buildGeneratedCapabilityUpdatePlanPrompt,
  buildGeneratedCapabilityValidationPrompt,
  capabilityBuilderHistoryPreviewActionState,
  capabilityBuilderHistoryRepairPlanActionState,
  capabilityBuilderHistoryReregisterActionState,
  capabilityBuilderHistorySourceActionState,
  capabilityDiagnosticsActionState,
  codexImportActionState,
  codexMarketplaceAddActionState,
  codexMarketplaceRemoveActionState,
  dedupeGoogleWorkspaceAccounts,
  defaultCapabilityBuilderLauncherDraft,
  filterAmbientCapabilities,
  filterAmbientPluginsBySource,
  formatAmbientAvailability,
  formatAmbientCapabilityKind,
  formatAmbientPluginSourceKind,
  formatAmbientRuntimeSupport,
  formatPluginMcpLaunchCommand,
  formatPluginMcpRuntimeEvent,
  generatedCapabilitySourceActionState,
  generatedCapabilitySummaryFromHistoryEntry,
  generatedCapabilityRemovalPlanActionState,
  generatedCapabilityUpdatePlanActionState,
  generatedCapabilityValidationActionState,
  googleWorkspaceAccountRows,
  googleWorkspaceActionState,
  googleWorkspaceConnectorLabel,
  googleWorkspaceValidationButtonView,
  googleWorkspaceValidationFeedbackForAccount,
  googleWorkspaceStatusItems,
  groupCodexImportCandidates,
  mcpContainerRuntimeDetailRows,
  mcpContainerRuntimeDiagnosticsActionState,
  mcpContainerRuntimeInstallActionViews,
  mcpContainerRuntimePrimaryActionLabel,
  mcpContainerRuntimeSetupResumeRows,
  mcpContainerRuntimeShouldOpenStartupPanel,
  mcpContainerRuntimeStatusLabel,
  mcpContainerRuntimeTone,
  mcpDefaultCapabilityInstallActionState,
  mcpDefaultCapabilityRuntimeHandoffCandidate,
  mcpInstalledServerStatusLabel,
  mcpServerInstallActionState,
  mcpServerSearchResultSubtitle,
  mcpServerUninstallActionState,
  mcpToolReviewAcceptActionState,
  piExtensionSandboxUninstallActionState,
  piPackageEnableActionState,
  piPackageInstallActionState,
  piPackageUninstallActionState,
  piPrivilegedDisableActionState,
  piPrivilegedUninstallActionState,
  pluginAuthCompleteActionState,
  pluginDetailsActionState,
  providerCatalogSettingsCardsForArea,
  providerCatalogSettingsCardView,
  recommendVoiceProviders,
  voiceProviderGuidanceCards,
  workflowPluginRequirementRows,
} from "./pluginUiModel";

function providerSettingsCard(patch: Partial<ProviderCatalogSettingsCard> = {}): ProviderCatalogSettingsCard {
  return {
    id: "voice.piper",
    displayName: "Piper",
    capabilityArea: "voice-generation",
    installerShape: "tts-provider",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary: "Reliable local/offline provider.",
    deploymentRole: "primary",
    recommendation: "Use Piper as the default local baseline.",
    bestFor: ["Offline voice"],
    tradeoffs: ["Less expressive than hosted voices"],
    avoidWhen: ["The user needs high-fidelity expressive speech immediately"],
    platforms: ["macos-arm64", "linux-x64"],
    hardwareFit: ["CPU-friendly"],
    firstPartyTemplate: { available: true, templateId: "tts-provider:piper" },
    capabilityBuilderDefaults: { provider: "Piper", locality: "local", outputFileArtifacts: ["wav"] },
    ambientContract: {
      commandContract: "TTS command writes a WAV artifact.",
      descriptorRequirements: ["installerShape tts-provider", "voiceProvider command metadata"],
      artifactPolicy: "Write audio artifacts to user-visible workspace paths.",
      validationTarget: "Generate a tiny WAV through Ambient.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    costPrivacyNotes: ["No cloud upload."],
    maintenanceNotes: ["Pin model assets."],
    safetyBoundaries: ["No voice cloning unless declared."],
    knownQuirks: ["Voice quality varies by model."],
    researchStatus: "live-dogfooded",
    docs: [{ label: "Piper repository", url: "https://github.com/rhasspy/piper" }],
    ...patch,
  };
}

describe("plugin UI model", () => {
  it("builds a chat-first Capability Builder launcher prompt", () => {
    expect(defaultCapabilityBuilderLauncherDraft()).toEqual({
      goal: "",
      kind: "",
      provider: "",
      outputArtifact: "",
      locality: "either",
    });
    expect(
      buildCapabilityBuilderPrompt({
        goal: "Generate WAV voice files from text",
        kind: "artifact generator",
        provider: "Piper",
        outputArtifact: "WAV",
        locality: "local",
      }),
    ).toBe(
      [
        "Create an Ambient capability package.",
        "Goal: Generate WAV voice files from text",
        "Capability kind: artifact generator",
        "Provider/runtime: Piper",
        "Output artifact type: WAV",
        "Execution locality: local",
        "Use the Capability Builder flow.",
        "First call ambient_capability_builder_plan with these details.",
        "If the goal is assistant voice output, read-aloud chat, chat voicing, or TTS provider setup, use installerShape tts-provider unless I explicitly ask only for one-off audio-file generation.",
        "If a generated package already exists that produces TTS/audio artifacts but is not selectable for chat voicing, route through Capability Builder repair: convert it to installerShape tts-provider before validation, registration, or re-registration.",
        "For ElevenLabs or Cartesia assistant voicing, plan the first-party cloud tts-provider template, Builder-scoped secret capture through ambient_capability_builder_secret_request, exact network host declarations, and one tiny validation synthesis.",
        "Inspect the current host OS, architecture, relevant runtimes, and package managers before choosing an implementation strategy.",
        "If a provider, URL, repo, model, binary, or library is named, read the upstream README/install/example docs first and summarize platform-specific guidance.",
        "Identify platform-specific install/runtime paths, model/download behavior, expected asset sizes when known, license notes, sample inputs/assets needed for smoke tests, and whether local execution is viable.",
        "Plan exact text handling for user-provided text; prefer file-input flags when punctuation, quotes, whitespace, or long text may be hard to pass safely as CLI args.",
        "Plan user-visible artifact output paths; final generated files should not live only inside package internals.",
        "Ask clarifying questions only if required before scaffolding.",
        "Present the viable implementation and dependency-install strategy before any install commands.",
        "Do not scaffold files, install dependencies, register the package, or activate anything until I approve the plan.",
      ].join("\n"),
    );
  });

  it("builds a voice-provider-specific Capability Builder prompt", () => {
    const prompt = buildVoiceProviderCapabilityPrompt();
    expect(prompt).toContain("Installer shape: tts-provider.");
    expect(prompt).toContain("Machine facts:");
    expect(prompt).toContain("OS/arch: unknown");
    expect(prompt).toContain("Provider recommendation summary:");
    expect(prompt).toContain("First-turn behavior: briefly explain these recommendations");
    expect(prompt).toContain("Piper: recommended now");
    expect(prompt).toContain("ElevenLabs: good option");
    expect(prompt).toContain("Cartesia: good option");
    expect(prompt).toContain("Custom repo/API/model: custom only");
    expect(prompt).toContain("Required first response shape when no provider is already selected:");
    expect(prompt).toContain("Present exactly three choices: Local baseline (Piper), Cloud quality/latency (ElevenLabs or Cartesia), and Custom/advanced provider.");
    expect(prompt).toContain("Do not call ambient_capability_builder_plan until the user has selected one of these paths");
    expect(prompt).toContain("Local baseline or Piper: immediately call ambient_capability_builder_plan");
    expect(prompt).toContain("Kokoro ONNX: immediately call ambient_capability_builder_plan for the first-party Kokoro ONNX tts-provider template");
    expect(prompt).toContain("ElevenLabs: call ambient_capability_builder_plan with installerShape tts-provider, locality network");
    expect(prompt).toContain("Cartesia: call ambient_capability_builder_plan with installerShape tts-provider, locality network");
    expect(prompt).toContain("Custom/advanced: before planning, inspect upstream README/install/example docs");
    expect(prompt).toContain("Existing generated TTS/audio artifact package: do not validate, register, or re-register it as-is for chat voicing.");
    expect(prompt).toContain("Piper fast path requirements:");
    expect(prompt).toContain("Use the first-party Piper tts-provider scaffold/template");
    expect(prompt).toContain("en_US-lessac-medium.onnx");
    expect(prompt).toContain("expected size about 63,100,000 bytes");
    expect(prompt).toContain("uvx --from piper-tts piper");
    expect(prompt).toContain("Health check must fail clearly when model assets are missing");
    expect(prompt).toContain("Validation must generate a real WAV through Ambient's registered provider path");
    expect(prompt).toContain("Kokoro ONNX fast path requirements:");
    expect(prompt).toContain("Use the first-party Kokoro ONNX tts-provider scaffold/template");
    expect(prompt).toContain("kokoro-v1.0.int8.onnx");
    expect(prompt).toContain("expected size 92,361,271 bytes");
    expect(prompt).toContain("uv run --with kokoro-onnx --with soundfile python ./scripts/synthesize.py");
    expect(prompt).toContain("Cloud provider fast path requirements:");
    expect(prompt).toContain("For ElevenLabs, plan envNames ELEVENLABS_API_KEY");
    expect(prompt).toContain("POST /v1/text-to-speech/{voiceId}");
    expect(prompt).toContain("For Cartesia, plan envNames CARTESIA_API_KEY");
    expect(prompt).toContain("POST /tts/bytes with Cartesia-Version");
    expect(prompt).toContain("ambient_capability_builder_secret_request for Desktop-owned key entry");
    expect(prompt).toContain("ambient_cli_secret_request or ambient_cli_env_bind only after a package is installed/registered");
    expect(prompt).toContain("Never ask the user to paste, type, reveal, summarize, or confirm API key values in chat");
    expect(prompt).toContain("Secret values must not appear in descriptors, logs, artifacts, stdout, stderr");
    expect(prompt).toContain("never put base64 audio or large provider responses in stdout");
    expect(prompt).not.toMatch(/paste your API key/i);
    expect(prompt).not.toMatch(/send me your API key/i);
    expect(prompt).toContain("Do not search bundled app markdown, .asar internals");
    expect(prompt).toContain("Known local/open-source provider cards:");
    expect(prompt).toContain("Piper (local, recommended)");
    expect(prompt).toContain("Kokoro / MLX TTS");
    expect(prompt).toContain("Kokoro ONNX");
    expect(prompt).toContain("NeuTTS");
    expect(prompt).toContain("Chatterbox");
    expect(prompt).toContain("F5-TTS");
    expect(prompt).toContain("Fish-Speech");
    expect(prompt).toContain("CosyVoice");
    expect(prompt).toContain("IndexTTS");
    expect(prompt).toContain("Orpheus TTS");
    expect(prompt).toContain("VibeVoice");
    expect(prompt).toContain("VoxCPM");
    expect(prompt).toContain("Qwen3-TTS");
    expect(prompt).toContain("MiMo Voice/TTS");
    expect(prompt).toContain("Known cloud provider cards:");
    expect(prompt).toContain("ElevenLabs (cloud, recommended)");
    expect(prompt).toContain("Cartesia (cloud, recommended)");
    expect(prompt).toContain("ambient_capability_builder_secret_request");
    expect(prompt).toContain("ambient_cli_secret_request");
    expect(prompt).toContain("ambient_cli_env_bind");
    expect(prompt).toContain("never expose secret values");
    expect(prompt).toContain("Command contract: accept --text <text>, --output <path>, --format <wav|mp3|ogg>");
    expect(prompt).toContain("not require Pi to call ambient_cli for every spoken reply");
    expect(prompt).toContain("repair it into the tts-provider contract before validation or registration");
  });

  it("filters and presents provider catalog settings cards", () => {
    const piper = providerSettingsCard({ id: "voice.piper", displayName: "Piper", recommendationTier: "recommended" });
    const search = providerSettingsCard({
      id: "search.brave",
      displayName: "Brave Search",
      capabilityArea: "web-search",
      installerShape: "search-provider",
    });

    expect(providerCatalogSettingsCardsForArea([piper, search], "voice-generation")).toEqual([piper]);
    expect(providerCatalogSettingsCardView(piper)).toEqual({
      id: "voice.piper",
      title: "Piper",
      subtitle: "Reliable local/offline provider.",
      tone: "recommended",
      meta: ["role primary", "local / open-source", "tts-provider", "first-party template"],
      actionLabel: "Set up",
      actionTitle: "Start provider setup for Piper",
    });
  });

  it("routes non-installable catalog cards through read-only review instead of setup", () => {
    const card = providerSettingsCard({
      id: "search.visible-browser-reference",
      displayName: "Visible Browser Search",
      capabilityArea: "web-search",
      installerShape: "browser-tooling",
      providerKind: "browser-mediated",
      sourceModel: "closed-source",
      recommendationSummary: "Existing visible browser search fallback, not an installable provider.",
      installability: {
        status: "not-installable",
        reason: "This path uses existing browser/web research tooling and cannot be installed as a provider.",
        actionLabel: "Review",
        actionTitle: "Review visible browser search guidance.",
      },
      tradeoffs: ["Not an installed provider"],
      ambientContract: {
        commandContract: "Use existing browser-mediated search tools.",
        descriptorRequirements: ["Use approved browser tooling", "Do not claim installed-provider status"],
        artifactPolicy: "Return bounded snippets only.",
        validationTarget: "Run a visible smoke only after user approval.",
      },
    });

    const view = providerCatalogSettingsCardView(card);
    const prompt = buildProviderCatalogCardOnboardingPrompt(card);

    expect(view.actionLabel).toBe("Review");
    expect(view.actionTitle).toBe("Review visible browser search guidance.");
    expect(view.meta).toContain("not installable");
    expect(prompt).toContain("Installability: not-installable.");
    expect(prompt).toContain("This catalog card is not installable");
    expect(prompt).toContain("web_research_status");
    expect(prompt).toContain("Do not call ambient_capability_builder_plan");
    expect(prompt).toContain("ambient_cli_package_install");
    expect(prompt).not.toContain("Then call ambient_capability_builder_plan for this selected card");
    expect(prompt).not.toContain("Use installed-provider status tools before claiming active state");
  });

  it("uses supplied provider catalog cards in the generic voice onboarding prompt", () => {
    const piper = providerSettingsCard({ id: "voice.piper", displayName: "Piper" });
    const prompt = buildVoiceProviderCapabilityPrompt(undefined, [piper]);

    expect(prompt).toContain("Known provider catalog cards:");
    expect(prompt).toContain("Piper (voice.piper, recommended): Reliable local/offline provider.");
    expect(prompt).toContain("validation: Generate a tiny WAV through Ambient.");
    expect(prompt).not.toContain("Known local/open-source provider cards:");
  });

  it("builds a selected provider catalog card onboarding prompt", () => {
    const card = providerSettingsCard({
      id: "voice.piper",
      displayName: "Piper",
      capabilityBuilderDefaults: {
        provider: "Piper",
        locality: "local",
        outputFileArtifacts: ["wav"],
        modelAssets: ["Piper voice model"],
      },
      modelAssets: [{ name: "Piper voice model", expectedSize: "about 63 MB", cachePolicy: "Provider-local models directory." }],
    });
    const prompt = buildProviderCatalogCardOnboardingPrompt(card, {
      os: {
        platform: "darwin",
        release: "25.5.0",
        arch: "arm64",
        appMode: "development",
      },
      hardware: {
        cpuModel: "Apple M3 Max",
        cpuCount: 16,
        memoryBytes: 48 * 1024 * 1024 * 1024,
        accelerator: "Apple Silicon",
      },
      runtimes: [
        { name: "Node.js", command: "node", available: true, version: "v25.2.1" },
        { name: "uv", command: "uv", available: true, version: "uv 0.9.0" },
      ],
    });

    expect(prompt).toContain("Ambient provider catalog onboarding request.");
    expect(prompt).toContain("Launch source: Settings provider catalog card.");
    expect(prompt).toContain("Selected catalog card id: voice.piper.");
    expect(prompt).toContain("Machine facts:");
    expect(prompt).toContain("OS/arch: darwin 25.5.0 / arm64.");
    expect(prompt).toContain("Installability: installable.");
    expect(prompt).toContain("Ambient contract:");
    expect(prompt).toContain("Descriptor requirement: installerShape tts-provider");
    expect(prompt).toContain("Validation target: Generate a tiny WAV through Ambient.");
    expect(prompt).toContain("Avoid when: The user needs high-fidelity expressive speech immediately");
    expect(prompt).toContain("Capability Builder defaults:");
    expect(prompt).toContain("Output file artifacts: wav");
    expect(prompt).toContain("Model assets: Piper voice model");
    expect(prompt).toContain("ambient_tool_call to run ambient_provider_catalog with capabilityArea voice-generation");
    expect(prompt).toContain("Then call ambient_capability_builder_plan for this selected card");
    expect(prompt).toContain("ambient_voice_status for TTS");
    expect(prompt).toContain("ambient_stt_status for STT");
    expect(prompt).toContain("ambient_search_preference_status or ambient_cli_search for search providers");
    expect(prompt).toContain("Settings did not install anything.");
    expect(prompt).not.toMatch(/paste your API key/i);
  });

  it("builds selected STT and search catalog card onboarding prompts", () => {
    const qwen = providerSettingsCard({
      id: "stt.qwen-asr",
      displayName: "Qwen ASR",
      capabilityArea: "voice-recognition",
      installerShape: "stt-provider",
      recommendationSummary: "Favored local ASR path.",
      capabilityBuilderDefaults: {
        provider: "Qwen ASR",
        locality: "local",
        responseFormats: ["json", "text"],
        modelAssets: ["Qwen ASR model assets"],
      },
      ambientContract: {
        commandContract: "STT command accepts an audio file and returns transcript text plus structured metadata.",
        descriptorRequirements: ["installerShape stt-provider", "audio input declaration", "transcript response format"],
        artifactPolicy: "Preserve input audio path and transcript metadata.",
        validationTarget: "Transcribe a small known WAV through Ambient STT.",
      },
    });
    const brave = providerSettingsCard({
      id: "search.brave",
      displayName: "Brave Search API",
      capabilityArea: "web-search",
      installerShape: "search-provider",
      providerKind: "cloud",
      sourceModel: "closed-source",
      recommendationSummary: "API-backed web search provider.",
      capabilityBuilderDefaults: {
        provider: "Brave Search",
        locality: "network",
        responseFormats: ["json"],
        envNames: ["BRAVE_API_KEY"],
        networkHosts: ["api.search.brave.com"],
      },
      secrets: [{ envName: "BRAVE_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
      networkHosts: ["api.search.brave.com"],
      ambientContract: {
        commandContract: "Search command returns bounded JSON/text results.",
        descriptorRequirements: ["installerShape search-provider", "required env declaration", "response format declaration"],
        artifactPolicy: "No user file artifact required for a tiny search smoke test.",
        validationTarget: "Run one tiny query through Ambient CLI/provider wrappers.",
      },
    });

    const qwenPrompt = buildProviderCatalogCardOnboardingPrompt(qwen);
    const bravePrompt = buildProviderCatalogCardOnboardingPrompt(brave);

    expect(qwenPrompt).toContain("capabilityArea voice-recognition");
    expect(qwenPrompt).toContain("installerShape stt-provider");
    expect(qwenPrompt).toContain("ambient_stt_status for STT");
    expect(qwenPrompt).toContain("Transcribe a small known WAV through Ambient STT.");
    expect(bravePrompt).toContain("capabilityArea web-search");
    expect(bravePrompt).toContain("installerShape search-provider");
    expect(bravePrompt).toContain("BRAVE_API_KEY: required via ambient_capability_builder_secret_request");
    expect(bravePrompt).toContain("Network hosts: api.search.brave.com");
    expect(bravePrompt).toContain("ambient_search_preference_status or ambient_cli_search for search providers");
    expect(bravePrompt).not.toMatch(/paste your API key/i);
  });

  it("routes selected HyperFrames catalog onboarding through bundled Ambient CLI", () => {
    const hyperframes = providerSettingsCard({
      id: "video.hyperframes-authored-motion",
      displayName: "HyperFrames authored-motion video",
      capabilityArea: "video-generation",
      installerShape: "artifact-generator",
      recommendationSummary: "Bundled Ambient CLI path for deterministic authored video.",
      firstPartyTemplate: { available: true, templateId: "ambient-cli:ambient-hyperframes" },
      ambientContract: {
        commandContract: "Ambient CLI package ambient-hyperframes exposes doctor, setup-plan, init, inspect, and render commands.",
        descriptorRequirements: ["Ambient CLI package ambient-hyperframes", "source project path", "video artifact output"],
        artifactPolicy: "Save source files, rendered media, first-frame preview, render logs, and media metadata.",
        validationTarget: "Render one tiny scene through ambient_cli hyperframes_render.",
      },
    });

    const prompt = buildProviderCatalogCardOnboardingPrompt(hyperframes);

    expect(prompt).toContain("capabilityArea video-generation");
    expect(prompt).toContain("First-party template: ambient-cli:ambient-hyperframes");
    expect(prompt).toContain("call ambient_cli_search for packageName ambient-hyperframes");
    expect(prompt).toContain("hyperframes_doctor");
    expect(prompt).toContain("hyperframes_setup_plan");
    expect(prompt).toContain("hyperframes_render");
    expect(prompt).toContain("do not install FFmpeg, browser runtime, Node, or npm packages silently");
    expect(prompt).toContain("Do not route HyperFrames through Capability Builder scaffolding or the Scrapling/default MCP capability lane");
  });

  it("routes selected MiniCPM-V visual catalog onboarding through typed visual tools", () => {
    const minicpm = providerSettingsCard({
      id: "vision.minicpm-v",
      displayName: "MiniCPM-V",
      capabilityArea: "visual-understanding",
      installerShape: "vision-analysis-provider",
      recommendationTier: "recommended",
      recommendationSummary: "Local visual analyzer for screenshots and UI/game frames.",
      ambientContract: {
        commandContract: "Visual analyzer accepts bounded image files and returns structured observations.",
        descriptorRequirements: ["installerShape vision-analysis-provider", "structured JSON output schema"],
        artifactPolicy: "Preserve redacted request/response artifacts and workspace-relative image paths.",
        validationTarget: "Analyze a real Ambient Desktop screenshot through the typed visual tool.",
      },
      capabilityBuilderDefaults: {
        provider: "MiniCPM-V",
        locality: "local",
        responseFormats: ["json"],
        modelAssets: ["MiniCPM-V 4.5 Q4_K_M GGUF", "MiniCPM-V multimodal projector"],
      },
      platformSupport: [
        {
          platform: "macos-arm64",
          status: "supported",
          runtime: "llama.cpp Metal",
          installMode: "Recommended managed runtime plus Ambient model cache.",
          evidence: ["Mac llama.cpp smoke"],
          caveats: ["Apple Silicon scoped support."],
        },
        {
          platform: "windows-x64",
          status: "experimental",
          runtime: "llama.cpp Windows x64",
          installMode: "User-managed runtime only.",
          evidence: ["Upstream support only"],
          caveats: ["No real Windows smoke evidence yet."],
        },
      ],
    });

    const prompt = buildProviderCatalogCardOnboardingPrompt(minicpm);

    expect(prompt).toContain("capabilityArea visual-understanding");
    expect(prompt).toContain("installerShape vision-analysis-provider");
    expect(prompt).toContain("Recommendation tier: recommended");
    expect(prompt).toContain("Platform support: macos-arm64: supported");
    expect(prompt).toContain("windows-x64: experimental");
    expect(prompt).toContain("No real Windows smoke evidence yet");
    expect(prompt).toContain("ambient_visual_minicpm_setup with action install, validate, repair, stop, or uninstall");
    expect(prompt).toContain("returned runtimeContract as authoritative");
    expect(prompt).toContain("default managed runtime download");
    expect(prompt).toContain("user-managed llama-server");
    expect(prompt).toContain("user-approved local archive");
    expect(prompt).toContain("Windows default download remains disabled");
    expect(prompt).toContain("pass endpointUrl only when the user approved a local localhost");
    expect(prompt).toContain("allowed hosts, user consent, media privacy, secret handling, request redaction, artifact retention, network egress controls, ui copy");
    expect(prompt).toContain("do not add an extra provider argument");
    expect(prompt).toContain("ambient_visual_analyze with a bounded workspace screenshot");
    expect(prompt).toContain("video/videoPath plus frameTimestampMs");
    expect(prompt).toContain("task preset such as ui_review");
    expect(prompt).toContain("or fall back to raw ambient_cli for ordinary setup");
    expect(prompt).not.toContain("Then call ambient_capability_builder_plan for this selected card");
  });

  it("release-gates the real recommended MiniCPM-V settings card and onboarding prompt", () => {
    const minicpm = providerCatalogSettingsState(new Date("2026-05-12T12:00:00.000Z")).cards.find((card) => card.id === "vision.minicpm-v");
    expect(minicpm).toBeDefined();
    const card = minicpm!;
    const view = providerCatalogSettingsCardView(card);
    const prompt = buildProviderCatalogCardOnboardingPrompt(card);

    expect(view).toMatchObject({
      id: "vision.minicpm-v",
      title: "MiniCPM-V",
      tone: "recommended",
    });
    expect(view.meta).toEqual(
      expect.arrayContaining([
        "role primary",
        "local / open-source",
        "vision-analysis-provider",
        "first-party template",
        "hosts github.com, huggingface.co, ollama.com, localhost",
      ]),
    );
    expect(prompt).toContain("Recommendation tier: recommended");
    expect(prompt).toContain("Deployment role: primary");
    expect(prompt).toContain("Platform support: macos-arm64: supported");
    expect(prompt).toContain("linux-x64: supported");
    expect(prompt).toContain("windows-x64: experimental");
    expect(prompt).toContain("Recommended default Ambient-managed macOS arm64 runtime download");
    expect(prompt).toContain("Recommended default Ambient-managed Linux x64 Vulkan runtime download");
    expect(prompt).toContain("Windows default download remains disabled");
    expect(prompt).toContain("ambient_visual_minicpm_setup with action install, validate, repair, stop, or uninstall");
    expect(prompt).toContain("ambient_visual_analyze with a bounded workspace screenshot");
    expect(prompt).not.toContain("Scoped recommendation is pending");
    expect(prompt).not.toContain("Provider catalog/deployment copy");
    expect(prompt).not.toContain("AMBIENT_DRONE_SSH_PASSWORD");
    expect(prompt).not.toContain("ambient@drone");
  });

  it("release-gates the Local Deep Research provider catalog card and typed onboarding prompt", () => {
    const localDeepResearch = providerCatalogSettingsState(new Date("2026-05-28T12:00:00.000Z")).cards.find((card) => card.id === "deep.literesearcher-4b");
    expect(localDeepResearch).toBeDefined();
    const card = localDeepResearch!;
    const view = providerCatalogSettingsCardView(card);
    const prompt = buildProviderCatalogCardOnboardingPrompt(card);

    expect(view).toMatchObject({
      id: "deep.literesearcher-4b",
      title: "Local Deep Research (LiteResearcher-4B)",
      tone: "recommended",
    });
    expect(view.meta).toEqual(
      expect.arrayContaining([
        "role primary",
        "hybrid / open-source",
        "custom-cli",
        "first-party template",
        "hosts huggingface.co, github.com, localhost",
      ]),
    );
    expect(card.localArtifactStatus).toBe("local-ready");
    expect(card.firstPartyTemplate?.templateId).toBe("local-deep-research:literesearcher-llamacpp");
    expect(prompt).toContain("Capability area: deep-research.");
    expect(prompt).toContain("First-party template: local-deep-research:literesearcher-llamacpp");
    expect(prompt).toContain("ambient_local_deep_research_setup with action status or validate first");
    expect(prompt).toContain("ambient_local_deep_research_setup with action install or repair");
    expect(prompt).toContain("ambient_local_deep_research_run for bounded mixed-source research tasks");
    expect(prompt).toContain("Search & Web provider preferences");
    expect(prompt).toContain("provider preference changes apply to the next run without reinstalling the model");
    expect(prompt).toContain("Q8 as high-memory/default-on-workstation or explicit advanced override");
    expect(prompt).toContain("citationValidation.status");
    expect(prompt).toContain("do not scaffold a custom Capability Builder package");
    expect(prompt).toContain("Do not call ambient_capability_builder_plan");
    expect(prompt).toContain("bind upstream Serper/Scrape.do keys");
    expect(prompt).not.toContain("Then call ambient_capability_builder_plan for this selected card");
  });

  it("routes the TinyStyler settings card through Ambient CLI package setup", () => {
    const tinystyler = providerCatalogSettingsState(new Date("2026-06-17T12:00:00.000Z")).cards.find((card) => card.id === "writing.tinystyler");
    expect(tinystyler).toBeDefined();
    const card = tinystyler!;
    const view = providerCatalogSettingsCardView(card);
    const prompt = buildProviderCatalogCardOnboardingPrompt(card);

    expect(view).toMatchObject({
      id: "writing.tinystyler",
      title: "TinyStyler writing-style transfer",
      tone: "conditional",
      actionLabel: "Set up",
    });
    expect(view.meta).toEqual(
      expect.arrayContaining([
        "role primary",
        "local / open-source",
        "custom-cli",
        "first-party template",
        "hosts huggingface.co, cdn-lfs.huggingface.co, pypi.org, files.pythonhosted.org",
      ]),
    );
    expect(card.capabilityArea).toBe("writing-style-transfer");
    expect(card.firstPartyTemplate?.templateId).toBe("ambient-cli:ambient-tinystyler");
    expect(prompt).toContain("Capability area: writing-style-transfer.");
    expect(prompt).toContain("First-party template: ambient-cli:ambient-tinystyler");
    expect(prompt).toContain("ambient_cli_search for packageName ambient-tinystyler");
    expect(prompt).toContain("ambient_cli_describe for packageName ambient-tinystyler");
    expect(prompt).toContain("tinystyler_doctor --json");
    expect(prompt).toContain("tinystyler_profile");
    expect(prompt).toContain("tinystyler_transfer");
    expect(prompt).toContain("Keep raw user examples out of chat and artifacts");
    expect(prompt).not.toContain("Then call ambient_capability_builder_plan for this selected card");
  });

  it("release-gates real non-installable catalog cards", () => {
    const state = providerCatalogSettingsState(new Date("2026-05-29T12:00:00.000Z"));
    const google = state.cards.find((card) => card.id === "search.google-browser");
    const tailscale = state.cards.find((card) => card.id === "chat-bridging.tailscale");
    expect(google).toBeDefined();
    expect(tailscale).toBeDefined();

    for (const card of [google!, tailscale!]) {
      const view = providerCatalogSettingsCardView(card);
      const prompt = buildProviderCatalogCardOnboardingPrompt(card);

      expect(card.installability?.status).toBe("not-installable");
      expect(view.meta).toContain("not installable");
      expect(view.actionLabel).not.toBe("Set up");
      expect(prompt).toContain("Installability: not-installable.");
      expect(prompt).toContain("This catalog card is not installable");
      expect(prompt).toContain("Do not call ambient_capability_builder_plan");
      expect(prompt).not.toContain("Then call ambient_capability_builder_plan for this selected card");
      expect(prompt).not.toContain("Use installed-provider status tools before claiming active state");
    }
  });

  it("builds a chat-first first-run capability onboarding prompt", () => {
    const prompt = buildFirstRunCapabilityOnboardingPrompt(
      {
        os: {
          platform: "darwin",
          release: "25.5.0",
          arch: "arm64",
          appMode: "packaged",
        },
        hardware: {
          cpuModel: "Apple M3 Max",
          cpuCount: 16,
          memoryBytes: 48 * 1024 * 1024 * 1024,
          accelerator: "Apple Silicon; Metal acceleration likely available for MLX-compatible local providers.",
        },
        runtimes: [
          { name: "Node.js", command: "node", available: true, version: "v25.2.1" },
          { name: "Python 3", command: "python3", available: true, version: "Python 3.12.0" },
          { name: "uv", command: "uv", available: true, version: "uv 0.9.0" },
        ],
      },
      [
        providerSettingsCard({ id: "voice.piper", displayName: "Piper" }),
        providerSettingsCard({
          id: "stt.qwen-asr",
          displayName: "Qwen ASR",
          capabilityArea: "voice-recognition",
          installerShape: "stt-provider",
          recommendationSummary: "Primary local speech recognition card.",
          ambientContract: {
            commandContract: "STT command accepts an audio file and returns a transcript.",
            descriptorRequirements: ["installerShape stt-provider"],
            artifactPolicy: "Preserve transcript metadata.",
            validationTarget: "Transcribe a small WAV through Ambient STT.",
          },
        }),
        providerSettingsCard({
          id: "search.brave",
          displayName: "Brave Search",
          capabilityArea: "web-search",
          installerShape: "search-provider",
          providerKind: "cloud",
          sourceModel: "closed-source",
          recommendationSummary: "Primary API-backed web search card.",
          capabilityBuilderDefaults: {
            provider: "Brave Search",
            locality: "network",
            responseFormats: ["json"],
            envNames: ["BRAVE_API_KEY"],
            networkHosts: ["api.search.brave.com"],
          },
          secrets: [{ envName: "BRAVE_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
          networkHosts: ["api.search.brave.com"],
        }),
        providerSettingsCard({
          id: "vision.minicpm",
          displayName: "MiniCPM-V",
          capabilityArea: "visual-understanding",
          installerShape: "visual-understanding-provider",
          recommendationSummary: "Local visual understanding card.",
        }),
        providerSettingsCard({
          id: "docs.office",
          displayName: "Office Parser",
          capabilityArea: "rich-documents",
          installerShape: "rich-documents-provider",
          recommendationSummary: "Local rich-document parser card.",
        }),
        providerSettingsCard({
          id: "writing.tinystyler",
          displayName: "TinyStyler",
          capabilityArea: "writing-style-transfer",
          installerShape: "custom-cli",
          recommendationSummary: "Local writing-style transfer card.",
        }),
      ],
    );
    expect(prompt).toContain("Ambient first-run capability onboarding request.");
    expect(prompt).toContain("Launch source: first-run macro onboarding.");
    expect(prompt).toContain("Machine facts:");
    expect(prompt).toContain("OS/arch: darwin 25.5.0 / arm64.");
    expect(prompt).toContain("Catalog-backed setup cards:");
    expect(prompt).toContain("Voice Output catalog cards:");
    expect(prompt).toContain("Piper (voice.piper, recommended): Reliable local/offline provider.");
    expect(prompt).toContain("Speech Input catalog cards:");
    expect(prompt).toContain("Qwen ASR (stt.qwen-asr, recommended): Primary local speech recognition card.");
    expect(prompt).toContain("Search, Web, and Research catalog cards:");
    expect(prompt).toContain("Brave Search (search.brave, recommended): Primary API-backed web search card.");
    expect(prompt).toContain("Media and Vision catalog cards:");
    expect(prompt).toContain("MiniCPM-V (vision.minicpm, recommended): Local visual understanding card.");
    expect(prompt).toContain("Documents and Office catalog cards:");
    expect(prompt).toContain("Office Parser (docs.office, recommended): Local rich-document parser card.");
    expect(prompt).toContain("Writing Style catalog cards:");
    expect(prompt).toContain("TinyStyler (writing.tinystyler, recommended): Local writing-style transfer card.");
    expect(prompt).toContain("do not invent a separate first-run recommendation list");
    expect(prompt).toContain("Initial setup areas:");
    expect(prompt).toContain("Voice/TTS: use installer shape tts-provider and the voice-generation catalog cards above.");
    expect(prompt).toContain("Speech input/STT: use installer shape stt-provider and the voice-recognition catalog cards above.");
    expect(prompt).toContain("Search, web, and research: use the web-search, web-scraping, retrieval, and deep-research catalog cards above.");
    expect(prompt).toContain("Media and vision: use visual-understanding, image-generation, video-generation, and svg-animation catalog cards.");
    expect(prompt).toContain("Documents and Office: use rich-documents catalog cards");
    expect(prompt).toContain("Writing Style: use writing-style-transfer catalog cards.");
    expect(prompt).toContain("MCP runtime and default web research: treat container runtime recovery and the default Scrapling ToolHive capability as core setup.");
    expect(prompt).toContain("Remote access: use Remote Ambient Surface, not Messaging Connector.");
    expect(prompt).toContain("Advanced services: social-media, agentic-services, and chat-bridging cards are core product setup");
    expect(prompt).toContain("API-backed providers and secrets: use Ambient-managed secret flows only.");
    expect(prompt).toContain("Present compact choices: Set up voice, Set up speech input, Set up search/web/research, Set up media/vision, Set up documents, Set up writing style, Set up remote access, or Skip/resume later.");
    expect(prompt).toContain("Do not call ambient_capability_builder_plan until the user chooses one setup area");
    expect(prompt).toContain("If the user chooses voice, use the TTS provider onboarding rules");
    expect(prompt).toContain("If the user chooses speech input, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses search/web/research, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses media/vision, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses documents, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses writing style, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses remote access, call ambient_messaging_remote_surface_activation_plan first");
    expect(prompt).toContain("If Signal or another unsupported provider is selected, surface the unsupported-provider repair/status prompts");
    expect(prompt).toContain("All mutation is approval-gated");
    expect(prompt).toContain("preserve full large outputs as artifacts with bounded previews");
    expect(prompt).not.toMatch(/paste your API key/i);
    expect(prompt).not.toMatch(/send me your API key/i);
  });

  it("builds Settings Remote Ambient Surface activation prompts for reviewed and unsupported providers", () => {
    const telegramPrompt = buildRemoteSurfaceActivationPrompt("telegram");
    expect(telegramPrompt).toContain("Ambient Remote Ambient Surface setup request.");
    expect(telegramPrompt).toContain("Launch source: Settings Remote control.");
    expect(telegramPrompt).toContain("Provider preference: Telegram.");
    expect(telegramPrompt).toContain("Call ambient_messaging_remote_surface_activation_plan first with requestText exactly: set up Telegram remote control for Ambient Desktop projects");
    expect(telegramPrompt).toContain("call ambient_messaging_telegram_owner_loop_activation_plan next");
    expect(telegramPrompt).toContain("not external Messaging Connector chat-with-others");
    expect(telegramPrompt).toContain("do not send provider messages during setup planning");

    const signalPrompt = buildRemoteSurfaceActivationPrompt("signal");
    expect(signalPrompt).toContain("Provider preference: Signal.");
    expect(signalPrompt).toContain("Call ambient_messaging_remote_surface_activation_plan first with requestText exactly: set up Signal remote control for Ambient Desktop projects");
    expect(signalPrompt).toContain("if the product shortcut returns unsupported_provider, surface the repair/status prompt in chat and stop");
    expect(signalPrompt).toContain("Do not call Signal low-level tools");
    expect(signalPrompt).toContain("generic Messaging Connector setup");
    expect(signalPrompt).toContain("provider message reads");
    expect(signalPrompt).toContain("provider sends");

    const choosePrompt = buildRemoteSurfaceActivationPrompt();
    expect(choosePrompt).toContain("Provider preference: reviewed provider choice.");
    expect(choosePrompt).toContain("set up remote control for Ambient Desktop projects");
    expect(choosePrompt).toContain("offer Telegram as the reviewed route");
  });

  it("includes deterministic host facts in the voice-provider prompt when available", () => {
    const prompt = buildVoiceProviderCapabilityPrompt({
      os: {
        platform: "darwin",
        release: "25.5.0",
        arch: "arm64",
        appMode: "packaged",
      },
      hardware: {
        cpuModel: "Apple M3 Max",
        cpuCount: 16,
        memoryBytes: 36 * 1024 * 1024 * 1024,
        accelerator: "Apple Silicon; Metal acceleration likely available for MLX-compatible local providers.",
      },
      runtimes: [
        { name: "Node.js", command: "node", available: true, version: "v22.0.0" },
        { name: "Python 3", command: "python3", available: false, detail: "not found on PATH" },
        { name: "uv", command: "uv", available: true, version: "uv 0.9.0" },
      ],
    });
    expect(prompt).toContain("OS/arch: darwin 25.5.0 / arm64.");
    expect(prompt).toContain("App mode: packaged.");
    expect(prompt).toContain("CPU/RAM: Apple M3 Max; 16 logical cores; 36 GiB RAM.");
    expect(prompt).toContain("Accelerator: Apple Silicon; Metal acceleration likely available");
    expect(prompt).toContain("Node.js (node): available, v22.0.0");
    expect(prompt).toContain("Python 3 (python3): missing, not found on PATH");
    expect(prompt).toContain("uv (uv): available, uv 0.9.0");
    expect(prompt).toContain("Kokoro / MLX TTS: good option");
    expect(prompt).toContain("Apple Silicon and runtime facts make this a plausible higher-quality local option");
  });

  it("ranks voice providers from deterministic host facts", () => {
    const recommendations = recommendVoiceProviders({
      os: {
        platform: "darwin",
        release: "25.5.0",
        arch: "arm64",
        appMode: "packaged",
      },
      hardware: {
        cpuModel: "Apple M3 Max",
        cpuCount: 16,
        memoryBytes: 48 * 1024 * 1024 * 1024,
        accelerator: "Apple Silicon; Metal acceleration likely available for MLX-compatible local providers.",
      },
      runtimes: [
        { name: "Python 3", command: "python3", available: true, version: "Python 3.12.0" },
        { name: "uv", command: "uv", available: true, version: "uv 0.9.0" },
        { name: "Homebrew", command: "brew", available: true, version: "Homebrew 4.5.0" },
      ],
    });
    expect(recommendations.find((recommendation) => recommendation.card.id === "piper")).toMatchObject({
      level: "recommended-now",
    });
    expect(recommendations.find((recommendation) => recommendation.card.id === "kokoro-mlx")).toMatchObject({
      level: "good-option",
    });
    expect(recommendations.find((recommendation) => recommendation.card.id === "kokoro-onnx")).toMatchObject({
      level: "good-option",
    });
    expect(recommendations.find((recommendation) => recommendation.card.id === "elevenlabs")).toMatchObject({
      level: "good-option",
    });
    expect(recommendations.find((recommendation) => recommendation.card.id === "neutts")).toMatchObject({
      level: "advanced-only",
    });
    expect(recommendations.find((recommendation) => recommendation.card.id === "custom")).toMatchObject({
      level: "custom-only",
    });
  });

  it("keeps first-party voice provider guidance cards explicit", () => {
    expect(voiceProviderGuidanceCards.map((card) => card.id)).toEqual([
      "piper",
      "kokoro-mlx",
      "mlx-audio",
      "kokoro-onnx",
      "pure-c-voxtral",
      "neutts",
      "chatterbox",
      "f5-tts",
      "fish-speech",
      "cosyvoice",
      "indextts",
      "orpheus",
      "vibevoice",
      "voxcpm",
      "qwen3-tts",
      "mimo-voice",
      "elevenlabs",
      "cartesia",
      "openai-speech",
      "custom",
    ]);
    expect(voiceProviderGuidanceCards.find((card) => card.id === "elevenlabs")).toMatchObject({
      envNames: ["ELEVENLABS_API_KEY"],
      networkHosts: ["api.elevenlabs.io"],
    });
    expect(voiceProviderGuidanceCards.find((card) => card.id === "cartesia")).toMatchObject({
      envNames: ["CARTESIA_API_KEY"],
      networkHosts: ["api.cartesia.ai"],
    });
    expect(voiceProviderGuidanceCards.find((card) => card.id === "mlx-audio")?.setupNotes).toContain("optional text-processing dependencies");
    expect(voiceProviderGuidanceCards.find((card) => card.id === "kokoro-mlx")?.tradeoffs).toContain("NumPy/Thinc ABI failure");
    expect(voiceProviderGuidanceCards.find((card) => card.id === "kokoro-onnx")?.setupNotes).toContain("Dogfood succeeded");
    expect(voiceProviderGuidanceCards.find((card) => card.id === "kokoro-onnx")?.setupNotes).toContain("1,000 characters or less");
    expect(voiceProviderGuidanceCards.find((card) => card.id === "chatterbox")).toMatchObject({
      type: "local",
      tier: "advanced",
      template: "custom",
    });
    expect(voiceProviderGuidanceCards.find((card) => card.id === "vibevoice")).toMatchObject({
      type: "local",
      tier: "experimental",
      template: "custom",
    });
  });

  it("formats plugin source, capability, availability, and runtime labels", () => {
    expect(formatAmbientPluginSourceKind("pi-ambient-workspace")).toBe("Pi Ambient workspace");
    expect(formatAmbientPluginSourceKind("codex-ambient-curated")).toBe("Ambient curated");
    expect(formatAmbientPluginSourceKind("codex-remote-marketplace")).toBe("Codex remote");
    expect(formatAmbientPluginSourceKind("ambient-cli")).toBe("Ambient CLI");
    expect(formatAmbientCapabilityKind("mcp-tool")).toBe("MCP tool");
    expect(formatAmbientCapabilityKind("runtime-extension")).toBe("Runtime extension");
    expect(formatAmbientAvailability("auth-required")).toBe("Needs auth");
    expect(formatAmbientAvailability("untrusted")).toBe("Needs trust");
    expect(formatAmbientRuntimeSupport(["chat", "workflow", "automation"])).toBe("Chat, Workflow, Automation");
  });

  it("formats MCP runtime launch and lifecycle event diagnostics", () => {
    expect(formatPluginMcpLaunchCommand({ command: "node", args: ["server.js", "--stdio"] })).toBe("node server.js --stdio");
    expect(formatPluginMcpLaunchCommand({ args: [] })).toBe("(missing command)");
    expect(
      formatPluginMcpRuntimeEvent({
        sequence: 1,
        method: "tools/call",
        toolName: "search",
        status: "failed",
        startedAt: "2026-05-04T00:00:00.000Z",
        finishedAt: "2026-05-04T00:00:00.125Z",
        durationMs: 125,
        error: "Timed out waiting for MCP tools/call.",
      }),
    ).toBe("Call tool: search failed in 125ms - Timed out waiting for MCP tools/call.");
    expect(
      formatPluginMcpRuntimeEvent({
        sequence: 2,
        method: "restart",
        status: "succeeded",
        startedAt: "2026-05-04T00:00:00.000Z",
        durationMs: 0,
        error: "Manual runtime restart completed.",
      }),
    ).toBe("Restart ok in 0ms - Manual runtime restart completed.");
    expect(
      formatPluginMcpRuntimeEvent({
        sequence: 3,
        method: "stderr",
        status: "succeeded",
        startedAt: "2026-05-04T00:00:00.000Z",
        error: "warning",
      }),
    ).toBe("stderr ok - warning");
  });

  it("models Codex import button labels and disabled states", () => {
    expect(codexImportActionState({ compatibilityTier: "supported", imported: false, sourceKind: "codex-cache" })).toMatchObject({
      label: "Import",
      disabled: false,
      visible: true,
    });
    expect(codexImportActionState({ compatibilityTier: "partial", imported: false, sourceKind: "remote-marketplace" })).toMatchObject({
      label: "Register",
      disabled: false,
      visible: true,
    });
    expect(codexImportActionState({ compatibilityTier: "supported", imported: false, sourceKind: "remote-marketplace", updateAvailable: true })).toMatchObject({
      label: "Update",
      disabled: false,
      title: expect.stringContaining("Update"),
    });
    expect(codexImportActionState({ compatibilityTier: "unsupported", imported: false, sourceKind: "codex-cache" })).toMatchObject({
      label: "Import",
      disabled: true,
      title: expect.stringContaining("Unsupported"),
    });
    expect(codexImportActionState({ compatibilityTier: "supported", imported: true, sourceKind: "remote-marketplace" })).toMatchObject({
      label: "Registered",
      disabled: true,
    });
  });

  it("groups Codex import candidates by marketplace source", () => {
    const candidates = [
      { id: "curated", name: "curated", sourceKind: "remote-marketplace" as const, marketplaceKind: "ambient-curated" as const },
      { id: "remote", name: "remote", sourceKind: "remote-marketplace" as const, marketplaceKind: "remote" as const },
      { id: "cache", name: "cache", sourceKind: "codex-cache" as const, marketplaceKind: "workspace" as const },
    ] as CodexPluginSummary[];

    expect(groupCodexImportCandidates(candidates)).toMatchObject({
      curated: [expect.objectContaining({ name: "curated" })],
      remote: [expect.objectContaining({ name: "remote" })],
      localCache: [expect.objectContaining({ name: "cache" })],
    });
  });

  it("models Codex marketplace remove button visibility and busy state", () => {
    expect(codexMarketplaceRemoveActionState({ id: "workspace:.agents/plugins/marketplace.json", removable: false })).toMatchObject({
      label: "Remove",
      disabled: true,
      visible: false,
    });
    expect(codexMarketplaceRemoveActionState({ id: "url:https://example.test/marketplace.json", removable: true })).toMatchObject({
      label: "Remove",
      disabled: false,
      visible: true,
    });
    expect(
      codexMarketplaceRemoveActionState(
        { id: "url:https://example.test/marketplace.json", removable: true },
        "url:https://example.test/marketplace.json",
      ),
    ).toMatchObject({
      label: "Removing",
      disabled: true,
    });
  });

  it("models Pi package install button visibility and disabled states", () => {
    expect(piPackageInstallActionState({ packageSpec: "npm:pi-subagents", installed: false }, false)).toMatchObject({
      label: "Install",
      disabled: false,
      title: expect.stringContaining("workspace package state"),
      visible: true,
    });
    expect(piPackageInstallActionState({ packageSpec: "npm:pi-subagents", installed: false }, false, "global")).toMatchObject({
      title: expect.stringContaining("global package state"),
    });
    expect(piPackageInstallActionState({ packageSpec: "npm:pi-subagents", installed: false }, true)).toMatchObject({
      label: "Install",
      disabled: true,
      title: expect.stringContaining("in progress"),
      visible: true,
    });
    expect(piPackageInstallActionState({ packageSpec: "npm:pi-subagents", installed: true }, false)).toMatchObject({
      label: "Installed",
      disabled: true,
      visible: false,
    });
    expect(piPackageInstallActionState({ installed: false }, false)).toMatchObject({
      label: "Install",
      disabled: true,
      visible: false,
    });
  });

  it("models Pi package enable toggle visibility and disabled states", () => {
    const declarative = {
      installed: true,
      enabled: false,
      compatibilityTier: "supported" as const,
      resourceCounts: { extension: 0, skill: 1, prompt: 0, theme: 0 },
    };
    expect(piPackageEnableActionState(declarative, false)).toMatchObject({
      label: "Disabled",
      disabled: false,
      visible: true,
      title: expect.stringContaining("declarative Pi resources"),
    });
    expect(piPackageEnableActionState({ ...declarative, enabled: true }, false)).toMatchObject({
      label: "Enabled",
      disabled: false,
      title: expect.stringContaining("Disable"),
    });
    expect(piPackageEnableActionState(declarative, true)).toMatchObject({
      disabled: true,
      visible: true,
    });
    expect(piPackageEnableActionState({ ...declarative, installed: false }, false)).toMatchObject({
      visible: false,
      disabled: true,
    });
    expect(piPackageEnableActionState({ ...declarative, resourceCounts: { extension: 1, skill: 1, prompt: 0, theme: 0 } }, false)).toMatchObject({
      disabled: true,
      title: expect.stringContaining("extensions"),
    });
    expect(piPackageEnableActionState({ ...declarative, compatibilityTier: "unsupported" }, false)).toMatchObject({
      disabled: true,
      title: expect.stringContaining("Unsupported"),
    });
  });

  it("models Pi package uninstall button visibility and busy state", () => {
    expect(piPackageUninstallActionState({ id: "pkg-1", installed: false }, undefined)).toMatchObject({
      label: "Uninstall",
      disabled: true,
      visible: false,
    });
    expect(piPackageUninstallActionState({ id: "pkg-1", installed: true }, undefined)).toMatchObject({
      label: "Uninstall",
      disabled: false,
      visible: true,
    });
    expect(piPackageUninstallActionState({ id: "pkg-1", installed: true }, "pkg-1")).toMatchObject({
      label: "Removing",
      disabled: true,
      title: expect.stringContaining("removing"),
    });
    expect(piPackageUninstallActionState({ id: "pkg-1", installed: true }, "pkg-2")).toMatchObject({
      label: "Uninstall",
      disabled: true,
      visible: true,
    });
  });

  it("models sandboxed and privileged Pi package management actions", () => {
    expect(piExtensionSandboxUninstallActionState({ id: "sandbox-1" })).toMatchObject({
      label: "Uninstall",
      disabled: false,
      visible: true,
    });
    expect(piExtensionSandboxUninstallActionState({ id: "sandbox-1" }, "sandbox-1")).toMatchObject({
      label: "Removing",
      disabled: true,
      title: expect.stringContaining("revoking"),
    });
    expect(piPrivilegedDisableActionState({ id: "priv-1", status: "disabled" })).toMatchObject({
      label: "Disable",
      disabled: true,
      title: expect.stringContaining("already disabled"),
    });
    expect(piPrivilegedDisableActionState({ id: "priv-1", status: "active" })).toMatchObject({
      label: "Disable",
      disabled: false,
    });
    expect(piPrivilegedUninstallActionState({ id: "priv-1" }, "priv-1")).toMatchObject({
      label: "Removing",
      disabled: true,
    });
  });

  it("filters plugin rows by source and capabilities by source/runtime", () => {
    const plugins: AmbientPluginSummary[] = [
      {
        id: "codex:one",
        sourcePluginId: "one",
        sourceKind: "codex-workspace" as const,
        sourceLabel: "Workspace",
        name: "one",
        installState: "installed" as const,
        compatibilityTier: "supported" as const,
        enabled: true,
        trusted: true,
        capabilityCount: 1,
        supportLabels: [],
        diagnostics: [],
      },
      {
        id: "pi:two",
        sourcePluginId: "two",
        sourceKind: "pi-gallery" as const,
        sourceLabel: "Gallery",
        name: "two",
        installState: "importable" as const,
        compatibilityTier: "partial" as const,
        enabled: false,
        trusted: false,
        capabilityCount: 1,
        supportLabels: [],
        diagnostics: [],
      },
    ];
    const capabilities: AmbientPluginCapabilitySummary[] = [
      {
        id: "cap-chat",
        pluginId: "one",
        pluginName: "one",
        kind: "skill" as const,
        name: "chat skill",
        sourceKind: "codex-workspace" as const,
        runtimeSupport: ["chat"],
        enabled: true,
        trusted: true,
        availability: "available" as const,
        supportLabels: [],
        diagnostics: [],
      },
      {
        id: "cap-workflow",
        pluginId: "two",
        pluginName: "two",
        kind: "tool" as const,
        name: "workflow tool",
        sourceKind: "pi-gallery" as const,
        runtimeSupport: ["workflow", "automation"],
        enabled: false,
        trusted: false,
        availability: "disabled" as const,
        supportLabels: [],
        diagnostics: [],
      },
    ];

    expect(filterAmbientPluginsBySource(plugins, "pi-gallery").map((plugin) => plugin.name)).toEqual(["two"]);
    expect(filterAmbientCapabilities(capabilities, { source: "all", runtime: "workflow" }).map((capability) => capability.name)).toEqual([
      "workflow tool",
    ]);
    expect(filterAmbientCapabilities(capabilities, { source: "codex-workspace", runtime: "workflow" })).toEqual([]);
  });

  it("models capability diagnostics action state", () => {
    const capability = {
      id: "cap-1",
      availability: "auth-required" as const,
      availabilityReason: "Connect an account before using this capability.",
    };

    expect(capabilityDiagnosticsActionState(capability)).toMatchObject({
      label: "Details",
      disabled: false,
      visible: true,
      title: expect.stringContaining("Needs auth"),
    });
    expect(capabilityDiagnosticsActionState(capability, "cap-1")).toMatchObject({
      label: "Inspecting",
      disabled: false,
    });
    expect(capabilityDiagnosticsActionState(capability, "other")).toMatchObject({
      label: "Details",
      disabled: true,
    });
  });

  it("joins workflow plugin requirements with registry availability for automations", () => {
    const grant = {
      capabilityId: "plugin-1:mcp-tool:server:fixture_original",
      pluginId: "plugin-1",
      pluginName: "Fixture",
      serverName: "server",
      toolName: "fixture_original",
      registeredName: "fixture_tool",
    };
    const registry: AmbientPluginRegistry = {
      plugins: [],
      capabilities: [
        {
          id: "plugin-1:mcp-server:server",
          pluginId: "plugin-1",
          pluginName: "Fixture",
          kind: "mcp-tool" as const,
          name: "server",
          sourceKind: "codex-workspace" as const,
          runtimeSupport: ["workflow", "automation"],
          enabled: true,
          trusted: false,
          availability: "untrusted" as const,
          availabilityReason: "Trust this plugin before automation dispatch.",
          serverName: "server",
          supportLabels: [],
          diagnostics: [],
        },
      ],
      sources: [],
      errors: [],
      sourceNotes: [],
    };

    expect(workflowPluginRequirementRows([grant], registry)).toEqual([
      expect.objectContaining({
        registeredName: "fixture_tool",
        availabilityLabel: "Needs trust",
        availabilityReason: "Trust this plugin before automation dispatch.",
        blocked: true,
      }),
    ]);
    expect(workflowPluginRequirementRows([grant], undefined)).toEqual([
      expect.objectContaining({ registeredName: "fixture_tool", availabilityLabel: "Not checked", blocked: false }),
    ]);
    expect(workflowPluginRequirementRows([grant], { ...registry, capabilities: [] })).toEqual([
      expect.objectContaining({ registeredName: "fixture_tool", availabilityLabel: "Unavailable", blocked: true }),
    ]);
  });

  it("models plugin detail action state", () => {
    const plugin = {
      id: "plugin-1",
      installState: "installed" as const,
      enabled: false,
      trusted: false,
    };

    expect(pluginDetailsActionState(plugin)).toMatchObject({
      label: "Details",
      disabled: false,
      visible: true,
      title: expect.stringContaining("Disabled"),
    });
    expect(pluginDetailsActionState(plugin, "plugin-1")).toMatchObject({
      label: "Hide details",
    });
  });

  it("models MCP server registry and lifecycle actions", () => {
    const result = {
      serverId: "context7",
      title: "Context7",
      description: "Library documentation.",
      transport: "streamable-http",
      tier: "community",
      status: "active",
      tags: ["docs"],
      tools: ["resolve-library-id", "get-library-docs"],
      installed: false,
      riskHints: [],
    };
    expect(mcpServerSearchResultSubtitle(result)).toBe("Streamable Http - Community - Active - 2 tools - not installed");

    const preview = {
      serverId: "context7",
      title: "Context7",
      summary: "Install Context7.",
      sourceSummary: "ToolHive registry",
      runtimeSummary: "ToolHive",
      permissionSummary: "Network isolated",
      secretSummary: "No secrets",
      validationSummary: "Valid",
      blockers: [],
      warnings: [],
      riskLevel: "low",
      riskReasons: ["registry server"],
      runPlan: {
        serverId: "context7",
        workloadName: "ambient-context7",
        group: "ambient",
        isolateNetwork: true,
        transport: "streamable-http",
        permissionProfilePath: "/tmp/profile.json",
        sourceRef: "toolhive-registry:context7",
      },
      permissionProfile: { path: "/tmp/profile.json", sha256: "abc" },
      expectedTools: ["get-library-docs"],
      reviewText: "Install Context7.",
    };
    expect(mcpServerInstallActionState(preview)).toMatchObject({
      label: "Install",
      disabled: false,
      visible: true,
      title: expect.stringContaining("ambient-context7"),
    });
    expect(mcpServerInstallActionState({ ...preview, blockers: ["Secret TOKEN is required."], runPlan: undefined })).toMatchObject({
      label: "Blocked",
      disabled: true,
      title: "Secret TOKEN is required.",
    });
    expect(mcpServerInstallActionState(preview, "install:context7")).toMatchObject({
      label: "Installing",
      disabled: true,
    });

    const installed = {
      serverId: "context7",
      workloadName: "ambient-context7",
      permissionProfilePath: "/tmp/profile.json",
      permissionProfileSha256: "abc",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
      workloadStatus: "running",
    };
    expect(mcpInstalledServerStatusLabel(installed)).toBe("Running");
    expect(mcpServerUninstallActionState(installed)).toMatchObject({
      label: "Uninstall",
      disabled: false,
    });
    expect(mcpServerUninstallActionState(installed, "uninstall:context7:ambient-context7")).toMatchObject({
      label: "Removing",
      disabled: true,
    });
    expect(mcpToolReviewAcceptActionState(installed)).toMatchObject({
      visible: false,
    });
    const drifted = {
      ...installed,
      lastKnownToolDescriptorHash: "hash123",
      toolDescriptorReviewStatus: "needs-review" as const,
    };
    expect(mcpToolReviewAcceptActionState(drifted)).toMatchObject({
      label: "Trust tools",
      disabled: false,
      visible: true,
    });
    expect(mcpToolReviewAcceptActionState(drifted, "tool-review:context7:ambient-context7")).toMatchObject({
      label: "Trusting",
      disabled: true,
      visible: true,
    });
  });

  it("models MCP container runtime status for the plugin settings surface", () => {
    expect(mcpContainerRuntimeStatusLabel("ready")).toBe("Ready");
    expect(mcpContainerRuntimeStatusLabel("installed-not-running")).toBe("Installed, not running");
    expect(mcpContainerRuntimeStatusLabel("blocked-by-permissions")).toBe("Permission repair needed");
    expect(mcpContainerRuntimeStatusLabel("missing")).toBe("Runtime missing");
    expect(mcpContainerRuntimeTone("ready")).toBe("success");
    expect(mcpContainerRuntimeTone("blocked-by-permissions")).toBe("warning");
    expect(mcpContainerRuntimeTone("missing")).toBe("warning");
    expect(mcpContainerRuntimeTone("unsupported")).toBe("error");
    expect(mcpContainerRuntimePrimaryActionLabel("installed-not-running")).toBe("Retry after starting runtime");
    expect(mcpContainerRuntimePrimaryActionLabel("blocked-by-permissions")).toBe("Open permission repair steps");

    const rows = mcpContainerRuntimeDetailRows({
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:00:00.000Z",
      durationMs: 12,
      message: "No container runtime detected.",
      nextAction: "install-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
        preflightOk: false,
        versionLine: "ToolHive v0.28.2",
      },
      hosts: [
        {
          kind: "docker",
          status: "missing",
          message: "docker CLI was not found.",
        },
      ],
      setup: {
        userDecision: "install-launched",
        shouldPrompt: false,
        promptSuppressed: true,
        reason: "install-launched",
        lastDecisionAt: "2026-05-23T20:10:00.000Z",
        installActionId: "podman-desktop-macos",
        installRuntime: "podman",
        installUrl: "https://podman-desktop.io/downloads",
        upgradeReconciledAppVersion: "1.2.3",
      },
      postInstallQueue: [
        {
          kind: "default-capability",
          capabilityId: "scrapling",
          status: "blocked",
        },
      ],
      defaultCapabilities: [
        {
          schemaVersion: "ambient-mcp-default-capability-v1",
          capabilityId: "scrapling",
          title: "Scrapling",
          status: "blocked_runtime",
          nextAction: "install-runtime",
          message: "Scrapling is blocked until the isolated runtime is ready.",
          serverId: "io.github.d4vinci/scrapling",
          workloadName: "ambient-scrapling",
          descriptorHash: "descriptor-sha",
          imageDigest: "sha256:abc",
          runtimeStatus: "missing",
          lastReconciledAt: "2026-05-23T20:10:00.000Z",
          appVersion: "1.2.3",
        },
      ],
      installPlan: {
        schemaVersion: "ambient-container-runtime-install-plan-v1",
        platform: "darwin",
        arch: "arm64",
        status: "missing",
        preferredRuntime: "podman",
        summary: "Install Podman Desktop.",
        primaryAction: {
          id: "podman-desktop-macos",
          label: "Open Podman Desktop download",
          kind: "open-installer",
          runtime: "podman",
          url: "https://podman-desktop.io/downloads",
          reason: "Preferred runtime.",
        },
        alternatives: [],
        prerequisites: [],
        warnings: [],
        postInstallSteps: [],
      },
    });

    expect(rows).toEqual(expect.arrayContaining([
      "Runtime: Not detected",
      "ToolHive: Ready",
      "Next: Install Runtime",
      "Setup: Open Podman Desktop download",
      "Prompt: Install Launched",
      "Last setup action: podman-desktop-macos",
      "Last setup runtime: Podman",
      "Scrapling: Blocked",
      "Scrapling Reconcile: Blocked Runtime",
    ]));
    expect(mcpContainerRuntimeSetupResumeRows({
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:00:00.000Z",
      durationMs: 12,
      message: "No container runtime detected.",
      nextAction: "install-runtime",
      toolHive: { status: "ready", message: "ToolHive is ready." },
      hosts: [],
      setup: {
        userDecision: "install-launched",
        shouldPrompt: false,
        promptSuppressed: true,
        reason: "install-launched",
        lastDecisionAt: "2026-05-23T20:10:00.000Z",
        installActionId: "podman-desktop-macos",
        installRuntime: "podman",
        installUrl: "https://podman-desktop.io/downloads",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
    })).toEqual([
      "Last setup action: podman-desktop-macos",
      "Runtime: Podman",
      "Opened URL: https://podman-desktop.io/downloads",
      "Opened at: 2026-05-23T20:10:00.000Z",
    ]);
  });

  it("models generated capability source action state", () => {
    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/piper-tts",
      refs: {},
    };

    expect(generatedCapabilitySourceActionState(generated)).toMatchObject({
      label: "Open source",
      disabled: false,
      visible: true,
      title: "Reveal generated capability source: ./.ambient/capability-builder/packages/piper-tts",
    });
    expect(generatedCapabilitySourceActionState(generated, generated.sourcePath)).toMatchObject({
      label: "Opening",
      disabled: true,
      visible: true,
    });
    expect(generatedCapabilitySourceActionState(undefined)).toMatchObject({
      disabled: true,
      visible: false,
    });
  });

  it("models default MCP capability setup actions", () => {
    const capability = {
      schemaVersion: "ambient-mcp-default-capability-v1" as const,
      capabilityId: "scrapling" as const,
      title: "Scrapling",
      status: "blocked_approval" as const,
      nextAction: "approve-default-capability" as const,
      message: "Runtime is ready. Scrapling is waiting for default capability approval.",
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      runtimeStatus: "ready" as const,
      lastReconciledAt: "2026-05-23T20:10:00.000Z",
      appVersion: "1.2.3",
    };

    expect(mcpDefaultCapabilityInstallActionState(capability, { runtimeReady: true })).toMatchObject({
      label: "Set up Scrapling",
      disabled: false,
      visible: true,
    });
    expect(mcpDefaultCapabilityInstallActionState(capability, { runtimeReady: false })).toMatchObject({
      label: "Set up Scrapling",
      disabled: true,
      visible: true,
    });
    expect(mcpDefaultCapabilityInstallActionState(capability, { runtimeReady: true, busyKey: "default-capability:scrapling" })).toMatchObject({
      label: "Setting up",
      disabled: true,
      visible: true,
    });
    expect(mcpDefaultCapabilityInstallActionState({ ...capability, status: "installed", nextAction: "none" })).toMatchObject({
      visible: false,
    });
  });

  it("selects a default MCP capability handoff only after runtime readiness", () => {
    const capability = {
      schemaVersion: "ambient-mcp-default-capability-v1" as const,
      capabilityId: "scrapling" as const,
      title: "Scrapling",
      status: "blocked_approval" as const,
      nextAction: "approve-default-capability" as const,
      message: "Runtime is ready. Scrapling is waiting for default capability approval.",
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      runtimeStatus: "ready" as const,
      lastReconciledAt: "2026-05-23T20:10:00.000Z",
      appVersion: "1.2.3",
    };
    const status = {
      schemaVersion: "ambient-container-runtime-probe-v1" as const,
      status: "ready" as const,
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "Runtime ready.",
      nextAction: "none" as const,
      toolHive: {
        status: "ready" as const,
        message: "ToolHive is ready.",
        preflightOk: true,
      },
      hosts: [],
      setup: {
        userDecision: "none" as const,
        shouldPrompt: false,
        promptSuppressed: false,
        reason: "runtime-ready" as const,
      },
      postInstallQueue: [],
      defaultCapabilities: [capability],
    };

    expect(mcpDefaultCapabilityRuntimeHandoffCandidate(status)).toBe(capability);
    expect(mcpDefaultCapabilityRuntimeHandoffCandidate({ ...status, status: "missing", defaultCapabilities: [capability] })).toBeUndefined();
    expect(mcpDefaultCapabilityRuntimeHandoffCandidate({
      ...status,
      defaultCapabilities: [{ ...capability, status: "installed", nextAction: "none" }],
    })).toBeUndefined();
    expect(mcpDefaultCapabilityRuntimeHandoffCandidate({
      ...status,
      defaultCapabilities: [{ ...capability, status: "needs_review", nextAction: "review-descriptor" }],
    })).toBeUndefined();
  });

  it("opens the MCP startup panel for runtime prompts or ready default capability handoff", () => {
    const baseStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1" as const,
      status: "missing" as const,
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "No runtime detected.",
      nextAction: "install-runtime" as const,
      toolHive: {
        status: "ready" as const,
        message: "ToolHive is ready.",
      },
      hosts: [],
      setup: {
        userDecision: "none" as const,
        shouldPrompt: true,
        promptSuppressed: false,
        reason: "runtime-missing" as const,
      },
      postInstallQueue: [],
      defaultCapabilities: [],
    };
    const handoffCapability = {
      schemaVersion: "ambient-mcp-default-capability-v1" as const,
      capabilityId: "scrapling" as const,
      title: "Scrapling",
      status: "blocked_approval" as const,
      nextAction: "approve-default-capability" as const,
      message: "Runtime is ready. Scrapling is waiting for default capability approval.",
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      runtimeStatus: "ready" as const,
      lastReconciledAt: "2026-05-23T20:10:00.000Z",
      appVersion: "1.2.3",
    };

    expect(mcpContainerRuntimeShouldOpenStartupPanel(baseStatus)).toBe(true);
    expect(mcpContainerRuntimeShouldOpenStartupPanel({
      ...baseStatus,
      setup: { ...baseStatus.setup, shouldPrompt: false, promptSuppressed: true, reason: "user-deferred" },
    })).toBe(false);
    expect(mcpContainerRuntimeShouldOpenStartupPanel({
      ...baseStatus,
      status: "ready",
      message: "Runtime ready.",
      nextAction: "none",
      setup: { ...baseStatus.setup, shouldPrompt: false, reason: "runtime-ready" },
      defaultCapabilities: [handoffCapability],
    })).toBe(true);
    expect(mcpContainerRuntimeShouldOpenStartupPanel({
      ...baseStatus,
      status: "ready",
      message: "Runtime ready.",
      nextAction: "none",
      setup: { ...baseStatus.setup, shouldPrompt: false, reason: "runtime-ready" },
      defaultCapabilities: [{ ...handoffCapability, status: "installed", nextAction: "none" }],
    })).toBe(false);
  });

  it("models MCP runtime diagnostic export action state", () => {
    const baseStatus: AmbientMcpContainerRuntimeStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "No runtime detected.",
      nextAction: "install-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
      },
      hosts: [],
      setup: {
        userDecision: "none",
        shouldPrompt: true,
        promptSuppressed: false,
        reason: "runtime-missing",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
    };
    const installedScrapling: AmbientMcpDefaultCapabilitySummary = {
      schemaVersion: "ambient-mcp-default-capability-v1",
      capabilityId: "scrapling",
      title: "Scrapling",
      status: "installed",
      nextAction: "none",
      message: "Scrapling is installed.",
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      runtimeStatus: "ready",
      lastReconciledAt: "2026-05-23T20:10:00.000Z",
      appVersion: "1.2.3",
    };
    const readyStatus: AmbientMcpContainerRuntimeStatus = {
      ...baseStatus,
      status: "ready",
      message: "Runtime ready.",
      nextAction: "none",
      setup: { ...baseStatus.setup, shouldPrompt: false, reason: "runtime-ready" },
      defaultCapabilities: [installedScrapling],
    };

    expect(mcpContainerRuntimeDiagnosticsActionState(undefined).visible).toBe(false);
    expect(mcpContainerRuntimeDiagnosticsActionState(readyStatus).visible).toBe(false);

    const missingAction = mcpContainerRuntimeDiagnosticsActionState(baseStatus);
    expect(missingAction).toMatchObject({
      label: "Export diagnostics",
      disabled: false,
      visible: true,
    });
    expect(missingAction.title).toContain("runtime probe state");

    const errorAction = mcpContainerRuntimeDiagnosticsActionState(readyStatus, { error: "ToolHive preflight failed" });
    expect(errorAction.visible).toBe(true);
    expect(errorAction.title).toContain("ToolHive preflight failed");

    const failedCapabilityAction = mcpContainerRuntimeDiagnosticsActionState({
      ...readyStatus,
      defaultCapabilities: [{ ...installedScrapling, status: "failed", nextAction: "inspect-failure", message: "Smoke test failed." }],
    });
    expect(failedCapabilityAction.visible).toBe(true);
    expect(failedCapabilityAction.title).toContain("default capability reconciliation");

    expect(mcpContainerRuntimeDiagnosticsActionState(baseStatus, { busy: true })).toMatchObject({
      label: "Exporting",
      disabled: true,
      visible: true,
    });
  });

  it("models all safe MCP runtime install and recovery launcher choices", () => {
    const status: AmbientMcpContainerRuntimeStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "No runtime detected.",
      nextAction: "install-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
      },
      hosts: [],
      setup: {
        userDecision: "none",
        shouldPrompt: true,
        promptSuppressed: false,
        reason: "runtime-missing",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
      installPlan: {
        schemaVersion: "ambient-container-runtime-install-plan-v1",
        platform: "darwin",
        arch: "arm64",
        status: "missing",
        preferredRuntime: "podman",
        summary: "Install Podman Desktop.",
        primaryAction: {
          id: "podman-desktop-macos",
          label: "Open Podman Desktop download",
          kind: "open-installer",
          runtime: "podman",
          url: "https://podman-desktop.io/downloads",
          reason: "Podman is the preferred fresh install path.",
        },
        alternatives: [
          {
            id: "podman-cli-macos-docs",
            label: "Open Podman CLI install docs",
            kind: "open-documentation",
            runtime: "podman",
            url: "https://podman.io/docs/installation",
            reason: "Use this if you prefer Homebrew.",
          },
          {
            id: "docker-desktop-macos",
            label: "Open Docker Desktop download",
            kind: "open-installer",
            runtime: "docker",
            url: "https://www.docker.com/products/docker-desktop/",
            reason: "Docker Desktop is accepted if you already prefer Docker.",
          },
          {
            id: "docker-desktop-macos",
            label: "Open Docker Desktop download",
            kind: "open-installer",
            runtime: "docker",
            url: "https://www.docker.com/products/docker-desktop/",
            reason: "Duplicate fixture.",
          },
        ],
        prerequisites: [],
        warnings: [],
        postInstallSteps: [],
      },
    };

    expect(mcpContainerRuntimeInstallActionViews(undefined)).toEqual([]);
    expect(mcpContainerRuntimeInstallActionViews(status)).toEqual([
      expect.objectContaining({
        actionId: "podman-desktop-macos",
        primary: true,
        disabled: false,
        runtime: "podman",
        kind: "open-installer",
      }),
      expect.objectContaining({
        actionId: "podman-cli-macos-docs",
        primary: false,
        disabled: false,
        runtime: "podman",
        kind: "open-documentation",
      }),
      expect.objectContaining({
        actionId: "docker-desktop-macos",
        primary: false,
        disabled: false,
        runtime: "docker",
        kind: "open-installer",
      }),
    ]);
    expect(mcpContainerRuntimeInstallActionViews(status, { launchBusy: true }).every((action) => action.disabled)).toBe(true);
  });

  it("models managed MCP runtime install command previews", () => {
    const status: AmbientMcpContainerRuntimeStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "No runtime detected.",
      nextAction: "install-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
      },
      hosts: [],
      setup: {
        userDecision: "none",
        shouldPrompt: true,
        promptSuppressed: false,
        reason: "runtime-missing",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
      installPlan: {
        schemaVersion: "ambient-container-runtime-install-plan-v1",
        platform: "darwin",
        arch: "arm64",
        status: "missing",
        preferredRuntime: "podman",
        summary: "Install Podman Desktop.",
        primaryAction: {
          id: "podman-desktop-macos-homebrew",
          label: "Install Podman Desktop with Homebrew",
          kind: "managed-install",
          runtime: "podman",
          url: "https://podman-desktop.io/downloads/macos",
          reason: "Install through Homebrew.",
          managedInstall: {
            schemaVersion: "ambient-container-runtime-managed-install-v1",
            execution: "user-command",
            strategy: "homebrew-cask-podman-desktop",
            packageName: "podman-desktop",
            platform: "darwin",
            requiresCredential: false,
            commands: [
              {
                exe: "brew",
                args: ["install", "--cask", "podman-desktop"],
                rationale: "Install Podman Desktop.",
              },
            ],
            fallbackActionIds: ["podman-desktop-macos"],
          },
        },
        alternatives: [],
        prerequisites: [],
        warnings: [],
        postInstallSteps: [],
      },
    };

    expect(mcpContainerRuntimeInstallActionViews(status)).toEqual([
      expect.objectContaining({
        actionId: "podman-desktop-macos-homebrew",
        kind: "managed-install",
        busyLabel: "Installing",
        commandPreview: "brew install --cask podman-desktop",
        managedExecution: "user-command",
        title: expect.stringContaining("Commands: brew install --cask podman-desktop"),
      }),
    ]);
  });

  it("models preserved generated capability history actions and prompts", () => {
    const entry: CapabilityBuilderHistoryEntry = {
      packageName: "piper-tts",
      rootPath: "/workspace/.ambient/capability-builder/packages/piper-tts",
      relativeRootPath: ".ambient/capability-builder/packages/piper-tts",
      gitSha: "def456",
      valid: true,
      status: "unregistered",
      goal: "Generate WAV voice files from text",
      kind: "artifact generator",
      provider: "Piper",
      version: "0.1.0",
      installedPresent: false,
      lastValidatedAt: "2026-05-06T01:00:00.000Z",
      unregisteredAt: "2026-05-06T02:00:00.000Z",
      validationArtifacts: [],
      refs: { latest: "def456", lastRepair: "repair789", lastValidated: "def456", installed: null },
      commandNames: ["piper_tts"],
      envNames: [],
      artifactOutputTypes: ["WAV"],
      logFiles: [],
      possibleArtifactFiles: [],
      errors: [],
      warnings: [],
    };

    expect(generatedCapabilitySummaryFromHistoryEntry(entry)).toMatchObject({
      schemaVersion: "ambient-capability-builder-v1",
      status: "unregistered",
      goal: "Generate WAV voice files from text",
      provider: "Piper",
      outputArtifactTypes: ["WAV"],
      sourcePath: ".ambient/capability-builder/packages/piper-tts",
      refs: { latest: "def456", lastRepair: "repair789", lastValidated: "def456" },
    });
    expect(capabilityBuilderHistorySourceActionState(entry)).toMatchObject({
      label: "Open source",
      disabled: false,
      visible: true,
    });
    expect(capabilityBuilderHistoryPreviewActionState(entry, { running: true })).toMatchObject({
      disabled: true,
      title: "Wait for the current chat run to finish before previewing this generated source.",
    });
    expect(capabilityBuilderHistoryReregisterActionState(entry)).toMatchObject({
      label: "Re-register",
      disabled: false,
      visible: true,
    });
    expect(capabilityBuilderHistoryReregisterActionState({ ...entry, installedPresent: true })).toMatchObject({
      disabled: true,
      title: "This generated capability is already installed; use validation or update planning instead.",
    });
    expect(capabilityBuilderHistoryReregisterActionState({ ...entry, valid: false })).toMatchObject({
      disabled: true,
      title: "Repair or preview this generated source before re-registration; the current static preview has errors.",
    });
    expect(capabilityBuilderHistoryRepairPlanActionState(entry)).toMatchObject({
      visible: false,
      disabled: false,
    });
    expect(capabilityBuilderHistoryRepairPlanActionState({ ...entry, valid: false, errors: ["SKILL.md is missing."] })).toMatchObject({
      label: "Plan repair",
      disabled: false,
      visible: true,
      title: "Start a chat-first repair plan for generated source: .ambient/capability-builder/packages/piper-tts",
    });
    expect(buildCapabilityBuilderHistoryPreviewPrompt(entry)).toBe(
      [
        "Preview this preserved generated Ambient capability source.",
        "Package: piper-tts",
        "Builder source path: .ambient/capability-builder/packages/piper-tts",
        "Current history status: unregistered",
        "Original goal: Generate WAV voice files from text",
        "Provider/runtime: Piper",
        "Last repair ref: repair789",
        "Declared commands: piper_tts",
        "Output artifact types: WAV",
        "Unregistered at: 2026-05-06T02:00:00.000Z",
        "Use the Capability Builder management flow.",
        "First call ambient_capability_builder_history for this package, then call ambient_capability_builder_preview for the builder source path.",
        "Summarize validity, errors, warnings, risks, declared commands, env, artifacts, and health checks.",
        "Do not install dependencies, validate, register, unregister, edit files, or change package state.",
      ].join("\n"),
    );
    expect(buildCapabilityBuilderHistoryReregisterPrompt(entry)).toBe(
      [
        "Re-register this preserved generated Ambient capability package after approval.",
        "Package: piper-tts",
        "Builder source path: .ambient/capability-builder/packages/piper-tts",
        "Current history status: unregistered",
        "Original goal: Generate WAV voice files from text",
        "Provider/runtime: Piper",
        "Last repair ref: repair789",
        "Last validated ref: def456",
        "Unregistered at: 2026-05-06T02:00:00.000Z",
        "Use the Capability Builder management flow.",
        "First call ambient_capability_builder_history for this package, then call ambient_capability_builder_preview for the builder source path.",
        "If the source is invalid or already installed, stop and report the issue.",
        "If the preview is valid, ask me to approve re-registration; after approval, call ambient_capability_builder_register for the same builder source path.",
        "Do not install dependencies, edit files, delete files, or use generic Ambient CLI install/uninstall tools.",
      ].join("\n"),
    );
    expect(buildCapabilityBuilderHistoryRepairPlanPrompt({ ...entry, valid: false, errors: ["SKILL.md is missing."] })).toBe(
      [
        "Plan a repair for this preserved generated Ambient capability source.",
        "Package: piper-tts",
        "Builder source path: .ambient/capability-builder/packages/piper-tts",
        "Current history status: unregistered",
        "Current static preview validity: invalid",
        "Original goal: Generate WAV voice files from text",
        "Provider/runtime: Piper",
        "Last repair ref: repair789",
        "Declared commands: piper_tts",
        "Output artifact types: WAV",
        "Current preview errors: SKILL.md is missing.",
        "Use the Capability Builder management flow.",
        "Call ambient_capability_builder_repair_plan for the builder source path. Do not call ambient_capability_builder_history or ambient_capability_builder_preview separately during this repair-planning turn.",
        "Present the returned repair plan before changing anything. The plan should include intended descriptor, SKILL.md, wrapper script, test, dependency, env, artifact, validation, and rollback steps as applicable.",
        "TTS provider conversion guidance:",
        "- This generated package appears to produce TTS/audio artifacts but is not currently an Ambient chat voice provider.",
        "- If the user wants assistant voice output, read-aloud chat, or provider selection in Settings, do not validate, register, or re-register it as a one-off artifact generator.",
        "- Plan repair with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
        "- The repair should add installerShape tts-provider provenance, descriptor voiceProvider metadata, the normalized --text/--output/--format/--voice command contract, concise JSON stdout, and provider-contract validation before registration.",
        "Do not edit files, install dependencies, validate, register, unregister, delete files, or use generic Ambient CLI install/uninstall tools until I approve a specific next step.",
        "Do not call ambient_capability_builder_register until a later approved validation succeeds for the repaired source.",
      ].join("\n"),
    );
  });

  it("adds pinned-environment guidance to advanced local voice repair prompts", () => {
    const entry: CapabilityBuilderHistoryEntry = {
      packageName: "ambient-mlx-audio-kokoro",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-mlx-audio-kokoro",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-mlx-audio-kokoro",
      valid: true,
      status: "draft",
      goal: "Create a local Kokoro voice provider through mlx-audio",
      kind: "tts-provider",
      provider: "mlx-audio",
      installedPresent: false,
      validationArtifacts: [],
      refs: { latest: "abc123" },
      commandNames: ["kokoro_tts"],
      envNames: [],
      artifactOutputTypes: ["WAV"],
      logFiles: ["capability-validation-log.jsonl"],
      possibleArtifactFiles: [],
      errors: [],
      warnings: ["validation failed with NumPy/Thinc ABI mismatch"],
    };

    const prompt = buildCapabilityBuilderHistoryRepairPlanPrompt(entry);

    expect(prompt).toContain("Advanced local TTS repair guidance:");
    expect(prompt).toContain("pinned-environment repair");
    expect(prompt).toContain("misaki plus transitive text-processing deps such as num2words and spaCy");
    expect(prompt).toContain("NumPy/Thinc ABI mismatches");
    expect(prompt).toContain("If the pinned plan is not viable");
  });

  it("models generated capability validation action state and prompt", () => {
    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      goal: "Generate WAV voice files from text",
      kind: "artifact generator",
      provider: "Piper",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/piper-tts",
      refs: { installed: "abc123", lastRepair: "repair789" },
    };

    expect(generatedCapabilityValidationActionState(generated)).toMatchObject({
      label: "Validate",
      disabled: false,
      visible: true,
      title: "Start an approval-gated Capability Builder validation for: ./.ambient/capability-builder/packages/piper-tts",
    });
    expect(generatedCapabilityValidationActionState(generated, { busyPath: generated.sourcePath })).toMatchObject({
      label: "Starting",
      disabled: true,
    });
    expect(generatedCapabilityValidationActionState(generated, { running: true })).toMatchObject({
      disabled: true,
      title: "Wait for the current chat run to finish before starting capability validation.",
    });

    expect(buildGeneratedCapabilityValidationPrompt({ packageName: "piper-tts", generated })).toBe(
      [
        "Validate this generated Ambient capability package.",
        "Package: piper-tts",
        "Builder source path: ./.ambient/capability-builder/packages/piper-tts",
        "Original goal: Generate WAV voice files from text",
        "Capability kind: artifact generator",
        "Provider/runtime: Piper",
        "Output artifact types: WAV",
        "Last repair ref: repair789",
        "Installed ref: abc123",
        "Use the Capability Builder management flow.",
        "TTS provider conversion guidance:",
        "- This generated package appears to produce TTS/audio artifacts but is not currently an Ambient chat voice provider.",
        "- If the user wants assistant voice output, read-aloud chat, or provider selection in Settings, do not validate, register, or re-register it as a one-off artifact generator.",
        "- Plan repair with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
        "- The repair should add installerShape tts-provider provenance, descriptor voiceProvider metadata, the normalized --text/--output/--format/--voice command contract, concise JSON stdout, and provider-contract validation before registration.",
        "First call ambient_capability_builder_preview for the builder source path and summarize errors, warnings, risks, declared commands, env, artifacts, and health checks.",
        "If the preview is valid, ask me to approve validation; after approval, call ambient_capability_builder_validate for the same source path.",
        "Do not install dependencies, register, rebuild, uninstall, or change files unless I explicitly approve that as a separate step.",
        "After validation, report the validation status, log path, artifact paths, and current git ref.",
      ].join("\n"),
    );
  });

  it("models generated capability update planning action state and prompt", () => {
    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      goal: "Generate WAV voice files from text",
      kind: "artifact generator",
      provider: "Piper",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/piper-tts",
      refs: { latest: "def456", lastRepair: "repair789", installed: "abc123", lastValidated: "abc123" },
    };

    expect(generatedCapabilityUpdatePlanActionState(generated)).toMatchObject({
      label: "Plan update",
      disabled: false,
      visible: true,
      title: "Start a Capability Builder update/rebuild plan for: ./.ambient/capability-builder/packages/piper-tts",
    });
    expect(generatedCapabilityUpdatePlanActionState(generated, { busyPath: generated.sourcePath })).toMatchObject({
      label: "Planning",
      disabled: true,
    });
    expect(generatedCapabilityUpdatePlanActionState(generated, { running: true })).toMatchObject({
      disabled: true,
      title: "Wait for the current chat run to finish before planning a capability update.",
    });

    expect(buildGeneratedCapabilityUpdatePlanPrompt({ packageName: "piper-tts", generated })).toBe(
      [
        "Plan an update or rebuild for this generated Ambient capability package.",
        "Package: piper-tts",
        "Builder source path: ./.ambient/capability-builder/packages/piper-tts",
        "Original goal: Generate WAV voice files from text",
        "Capability kind: artifact generator",
        "Provider/runtime: Piper",
        "Output artifact types: WAV",
        "Latest source ref: def456",
        "Last repair ref: repair789",
        "Installed ref: abc123",
        "Last validated ref: abc123",
        "Use the Capability Builder management flow.",
        "TTS provider conversion guidance:",
        "- This generated package appears to produce TTS/audio artifacts but is not currently an Ambient chat voice provider.",
        "- If the user wants assistant voice output, read-aloud chat, or provider selection in Settings, do not validate, register, or re-register it as a one-off artifact generator.",
        "- Plan repair with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
        "- The repair should add installerShape tts-provider provenance, descriptor voiceProvider metadata, the normalized --text/--output/--format/--voice command contract, concise JSON stdout, and provider-contract validation before registration.",
        "Use Capability Builder tools only for package inspection. Do not use shell, browser, ambient_cli, direct filesystem, or package install tools during this planning step.",
        "First inspect the builder source path and current installed/generated provenance, then call ambient_capability_builder_update_plan for the builder source path.",
        "Do not call ambient_capability_builder_preview separately during update planning; ambient_capability_builder_update_plan already includes preview facts.",
        "Propose a concise update/rebuild plan before making any changes. Include intended file changes, dependency commands, env or permission changes, artifact behavior changes, validation plan, registration impact, version/ref handling, rollback point, and user approval checkpoints.",
        "Do not install dependencies, edit files, run validation, register, rebuild, uninstall, or change package state until I approve a specific next step.",
        "If no update is needed, say so and recommend validation instead of making changes.",
      ].join("\n"),
    );
  });

  it("models generated capability removal planning action state and prompt", () => {
    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      goal: "Generate WAV voice files from text",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/piper-tts",
      installedPackageId: "ambient-cli:generated:piper-tts",
      installedSource: "./.ambient/cli-packages/imported/piper-tts",
      refs: { installed: "abc123", lastRepair: "repair789" },
    };

    expect(generatedCapabilityRemovalPlanActionState(generated)).toMatchObject({
      label: "Plan removal",
      disabled: false,
      visible: true,
      title: "Start a safe uninstall/deactivation plan for: ./.ambient/capability-builder/packages/piper-tts",
    });
    expect(generatedCapabilityRemovalPlanActionState(generated, { busyPath: generated.sourcePath })).toMatchObject({
      label: "Planning",
      disabled: true,
    });
    expect(generatedCapabilityRemovalPlanActionState(generated, { running: true })).toMatchObject({
      disabled: true,
      title: "Wait for the current chat run to finish before planning capability removal.",
    });

    expect(buildGeneratedCapabilityRemovalPlanPrompt({ packageName: "piper-tts", generated })).toBe(
      [
        "Plan safe removal or deactivation for this generated Ambient capability package.",
        "Package: piper-tts",
        "Builder source path: ./.ambient/capability-builder/packages/piper-tts",
        "Installed package id: ambient-cli:generated:piper-tts",
        "Installed source: ./.ambient/cli-packages/imported/piper-tts",
        "Original goal: Generate WAV voice files from text",
        "Output artifact types: WAV",
        "Last repair ref: repair789",
        "Installed ref: abc123",
        "Use the Capability Builder management flow.",
        "Use Capability Builder tools only for package inspection. Do not use shell, browser, ambient_cli, direct filesystem, or package install tools during this planning step.",
        "First inspect the installed/generated provenance and builder source path, then call ambient_capability_builder_removal_plan.",
        "Do not call ambient_capability_builder_preview separately during removal planning; ambient_capability_builder_removal_plan already includes preview facts when builder source exists.",
        "Propose a concise removal plan before changing anything. Distinguish installed Ambient CLI package state, managed builder source, package Git history, validation logs, generated artifacts, env/secret metadata, and registry visibility.",
        "Recommend the least destructive default: unregister or disable the installed capability while preserving builder source, Git history, validation logs, and artifacts unless I explicitly approve deletion.",
        "If I approve least-destructive unregister/deactivation, call ambient_capability_builder_unregister; do not use generic Ambient CLI uninstall for generated capabilities.",
        "Do not delete files, unregister, disable, edit package state, remove secrets, or change registry/install metadata until I approve a specific next step.",
        "Include rollback steps for restoring the installed capability or re-registering from the preserved builder source.",
      ].join("\n"),
    );
  });

  it("models plugin auth completion action state", () => {
    expect(pluginAuthCompleteActionState(false, "", false)).toMatchObject({
      visible: false,
      disabled: true,
    });
    expect(pluginAuthCompleteActionState(true, "", false)).toMatchObject({
      label: "Complete auth",
      visible: true,
      disabled: true,
      title: expect.stringContaining("Paste"),
    });
    expect(pluginAuthCompleteActionState(true, "code", false)).toMatchObject({
      disabled: false,
      title: expect.stringContaining("Complete"),
    });
    expect(pluginAuthCompleteActionState(true, "code", true)).toMatchObject({
      label: "Completing",
      disabled: true,
    });
  });

  it("models Google Workspace account rows and action states", () => {
    const integration = googleIntegrationFixture();
    expect(googleWorkspaceConnectorLabel("google.gmail")).toBe("Gmail");
    expect(googleWorkspaceConnectorLabel("google.calendar")).toBe("Calendar");
    expect(dedupeGoogleWorkspaceAccounts(integration.connectors).map((account) => account.accountId)).toEqual(["travis@example.test"]);
    expect(googleWorkspaceAccountRows(integration.connectors, () => "just now")).toEqual([
      expect.objectContaining({
        accountId: "travis@example.test",
        email: "travis@example.test",
        identityLabel: "travis@example.test",
        handleLabel: "travis@example.test",
        connectorLabels: ["Gmail", "Calendar", "Drive"],
        lastValidatedLabel: "just now",
      }),
    ]);
    expect(googleWorkspaceStatusItems(integration)).toEqual(
      expect.arrayContaining(["Auth Gws", "gws Available", "Install Completed", "Setup Idle"]),
    );
    expect(googleWorkspaceStatusItems({ ...integration, setup: { status: "error", oauthClientConfigured: false } })).toEqual(
      expect.arrayContaining(["OAuth client Required"]),
    );
    expect(googleWorkspaceStatusItems({ ...integration, setup: { status: "completed", oauthClientConfigured: true } })).toEqual(
      expect.arrayContaining(["OAuth client Configured"]),
    );
    expect(googleWorkspaceActionState(integration, "connect")).toMatchObject({
      label: "Connect account",
      disabled: false,
      visible: true,
    });
    expect(googleWorkspaceActionState({ ...integration, sidecar: { ...integration.sidecar, state: "missing" } }, "install")).toMatchObject({
      label: "Install gws",
      disabled: false,
      visible: true,
    });
    expect(googleWorkspaceActionState({ ...integration, setup: { status: "running" } }, "cancel")).toMatchObject({
      label: "Cancel setup",
      disabled: false,
      visible: true,
    });
    expect(googleWorkspaceActionState({ ...integration, setup: { status: "running" } }, "validate")).toMatchObject({
      disabled: true,
    });
    expect(googleWorkspaceValidationFeedbackForAccount({ accountId: "travis@example.test", status: "validated" }, "travis@example.test")).toMatchObject({
      status: "validated",
    });
    expect(googleWorkspaceValidationFeedbackForAccount({ accountId: "travis@example.test", status: "validated" }, "other")).toBeUndefined();
    expect(googleWorkspaceValidationButtonView("Validate", undefined)).toEqual({
      label: "Validate",
      icon: "none",
      tone: "default",
    });
    expect(googleWorkspaceValidationButtonView("Validate", { accountId: "travis@example.test", status: "validating" })).toEqual({
      label: "Validating",
      icon: "spinner",
      tone: "default",
    });
    expect(googleWorkspaceValidationButtonView("Validate", { accountId: "travis@example.test", status: "validated" })).toEqual({
      label: "Validated",
      icon: "success",
      tone: "success",
    });
    expect(googleWorkspaceValidationButtonView("Validate", { accountId: "travis@example.test", status: "failed" })).toEqual({
      label: "Retry",
      icon: "error",
      tone: "error",
    });
  });

  it("keeps gws local account handles distinct from discovered Google emails", () => {
    const integration = googleIntegrationFixture();
    const handledAccount = {
      ...integration.connectors[0]!.accounts[0]!,
      id: "gws:work",
      accountId: "work",
      label: "travis@example.test",
      email: "travis@example.test",
    };
    const personalAccount = {
      ...integration.connectors[0]!.accounts[0]!,
      id: "gws:personal",
      accountId: "personal",
      label: "travis.good@gmail.com",
      email: "travis.good@gmail.com",
    };
    const connectors: AmbientPluginAppAuthSummary[] = ["google.gmail", "google.calendar", "google.drive"].map((connectorId) => ({
      connectorId,
      status: "available",
      accounts: connectorId === "google.drive" ? [personalAccount, handledAccount] : [handledAccount],
    }));

    expect(dedupeGoogleWorkspaceAccounts(connectors).map((account) => account.accountId)).toEqual(["work", "personal"]);
    expect(googleWorkspaceAccountRows(connectors)).toEqual([
      expect.objectContaining({
        accountId: "work",
        identityLabel: "travis@example.test",
        handleLabel: "work",
        connectorLabels: ["Gmail", "Calendar", "Drive"],
      }),
      expect.objectContaining({
        accountId: "personal",
        identityLabel: "travis.good@gmail.com",
        handleLabel: "personal",
        connectorLabels: ["Drive"],
      }),
    ]);
  });

  it("models Codex marketplace add action state", () => {
    expect(codexMarketplaceAddActionState("", false)).toMatchObject({
      label: "Add source",
      disabled: true,
    });
    expect(codexMarketplaceAddActionState("openai/codex-plugins", false)).toMatchObject({
      label: "Add source",
      disabled: false,
      title: expect.stringContaining("GitHub"),
    });
    expect(codexMarketplaceAddActionState("https://github.com/openai/codex-plugins", false)).toMatchObject({
      label: "Add source",
      disabled: false,
    });
    expect(codexMarketplaceAddActionState("https://plugins.example.test/marketplace.json", false)).toMatchObject({
      label: "Enable advanced URL",
      disabled: true,
      title: expect.stringContaining("experimental"),
    });
    expect(codexMarketplaceAddActionState("https://plugins.example.test/marketplace.json", false, true)).toMatchObject({
      label: "Add source",
      disabled: false,
    });
    expect(codexMarketplaceAddActionState("openai/codex-plugins", true)).toMatchObject({
      label: "Adding",
      disabled: true,
    });
  });
});

function googleIntegrationFixture(): FirstPartyGoogleIntegrationState {
  const account = {
    id: "account-1",
    accountId: "travis@example.test",
    label: "travis@example.test",
    email: "travis@example.test",
    status: "available" as const,
    grantedScopes: ["gmail.readonly", "calendar.readonly", "drive.readonly"],
    connectedAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    lastValidatedAt: "2026-05-04T00:00:00.000Z",
  };
  const connectors: AmbientPluginAppAuthSummary[] = ["google.gmail", "google.calendar", "google.drive"].map((connectorId) => ({
    connectorId,
    status: "available",
    accounts: [account],
  }));
  return {
    enabled: true,
    authMode: "gws",
    connectors,
    install: {
      status: "completed",
      version: "0.22.3",
      platform: "darwin",
      arch: "arm64",
      binaryPath: "/tmp/gws",
    },
    setup: { status: "idle" },
    sidecar: {
      adapter: "gws",
      state: "available",
      binaryPath: "/tmp/gws",
      configDir: "/tmp/gws-config",
      pending: 0,
    },
  };
}
