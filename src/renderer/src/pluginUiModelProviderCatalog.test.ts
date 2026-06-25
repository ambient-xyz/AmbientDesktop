import { describe, expect, it } from "vitest";
import type { ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import {
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildVoiceProviderCapabilityPrompt,
  providerCatalogSettingsCardsForArea,
  providerCatalogSettingsCardView,
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

describe("plugin UI model provider catalog onboarding", () => {
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
    expect(prompt).toContain(
      "Do not route HyperFrames through Capability Builder scaffolding or the Scrapling/default MCP capability lane",
    );
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
    expect(prompt).toContain(
      "allowed hosts, user consent, media privacy, secret handling, request redaction, artifact retention, network egress controls, ui copy",
    );
    expect(prompt).toContain("do not add an extra provider argument");
    expect(prompt).toContain("ambient_visual_analyze with a bounded workspace screenshot");
    expect(prompt).toContain("video/videoPath plus frameTimestampMs");
    expect(prompt).toContain("task preset such as ui_review");
    expect(prompt).toContain("or fall back to raw ambient_cli for ordinary setup");
    expect(prompt).not.toContain("Then call ambient_capability_builder_plan for this selected card");
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
    expect(prompt).toContain(
      "Search, web, and research: use the web-search, web-scraping, retrieval, and deep-research catalog cards above.",
    );
    expect(prompt).toContain(
      "Media and vision: use visual-understanding, image-generation, video-generation, and svg-animation catalog cards.",
    );
    expect(prompt).toContain("Documents and Office: use rich-documents catalog cards");
    expect(prompt).toContain("Writing Style: use writing-style-transfer catalog cards.");
    expect(prompt).toContain(
      "MCP runtime and default web research: treat container runtime recovery and the default Scrapling ToolHive capability as core setup.",
    );
    expect(prompt).toContain("Remote access: use Remote Ambient Surface, not Messaging Connector.");
    expect(prompt).toContain("Advanced services: social-media, agentic-services, and chat-bridging cards are core product setup");
    expect(prompt).toContain("API-backed providers and secrets: use Ambient-managed secret flows only.");
    expect(prompt).toContain(
      "Present compact choices: Set up voice, Set up speech input, Set up search/web/research, Set up media/vision, Set up documents, Set up writing style, Set up remote access, or Skip/resume later.",
    );
    expect(prompt).toContain("Do not call ambient_capability_builder_plan until the user chooses one setup area");
    expect(prompt).toContain("If the user chooses voice, use the TTS provider onboarding rules");
    expect(prompt).toContain("If the user chooses speech input, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses search/web/research, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses media/vision, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses documents, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses writing style, run ambient_provider_catalog through ambient_tool_search");
    expect(prompt).toContain("If the user chooses remote access, call ambient_messaging_remote_surface_activation_plan first");
    expect(prompt).toContain(
      "If Signal or another unsupported provider is selected, surface the unsupported-provider repair/status prompts",
    );
    expect(prompt).toContain("All mutation is approval-gated");
    expect(prompt).toContain("preserve full large outputs as artifacts with bounded previews");
    expect(prompt).not.toMatch(/paste your API key/i);
    expect(prompt).not.toMatch(/send me your API key/i);
  });
});
