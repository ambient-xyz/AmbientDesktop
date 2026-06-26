import { describe, expect, it } from "vitest";
import { providerCatalogSettingsState } from "../../main/provider/providerCatalog";
import {
  buildCapabilityBuilderPrompt,
  providerCatalogSettingsCardView,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
  buildVoiceProviderCapabilityPrompt,
  defaultCapabilityBuilderLauncherDraft,
  recommendVoiceProviders,
  voiceProviderGuidanceCards,
} from "./pluginUiModel";

describe("plugin UI model provider prompts", () => {
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
    expect(prompt).toContain(
      "Present exactly three choices: Local baseline (Piper), Cloud quality/latency (ElevenLabs or Cartesia), and Custom/advanced provider.",
    );
    expect(prompt).toContain("Do not call ambient_capability_builder_plan until the user has selected one of these paths");
    expect(prompt).toContain("Local baseline or Piper: immediately call ambient_capability_builder_plan");
    expect(prompt).toContain(
      "Kokoro ONNX: immediately call ambient_capability_builder_plan for the first-party Kokoro ONNX tts-provider template",
    );
    expect(prompt).toContain("ElevenLabs: call ambient_capability_builder_plan with installerShape tts-provider, locality network");
    expect(prompt).toContain("Cartesia: call ambient_capability_builder_plan with installerShape tts-provider, locality network");
    expect(prompt).toContain("Custom/advanced: before planning, inspect upstream README/install/example docs");
    expect(prompt).toContain(
      "Existing generated TTS/audio artifact package: do not validate, register, or re-register it as-is for chat voicing.",
    );
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
    const localDeepResearch = providerCatalogSettingsState(new Date("2026-05-28T12:00:00.000Z")).cards.find(
      (card) => card.id === "deep.literesearcher-4b",
    );
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
    const tinystyler = providerCatalogSettingsState(new Date("2026-06-17T12:00:00.000Z")).cards.find(
      (card) => card.id === "writing.tinystyler",
    );
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

  it("builds Settings Remote Ambient Surface activation prompts for reviewed and unsupported providers", () => {
    const telegramPrompt = buildRemoteSurfaceActivationPrompt("telegram");
    expect(telegramPrompt).toContain("Ambient Remote Ambient Surface setup request.");
    expect(telegramPrompt).toContain("Launch source: Settings Remote control.");
    expect(telegramPrompt).toContain("Provider preference: Telegram.");
    expect(telegramPrompt).toContain(
      "Call ambient_messaging_remote_surface_activation_plan first with requestText exactly: set up Telegram remote control for Ambient Desktop projects",
    );
    expect(telegramPrompt).toContain("call ambient_messaging_telegram_owner_loop_activation_plan next");
    expect(telegramPrompt).toContain("not external Messaging Connector chat-with-others");
    expect(telegramPrompt).toContain("do not send provider messages during setup planning");

    const signalPrompt = buildRemoteSurfaceActivationPrompt("signal");
    expect(signalPrompt).toContain("Provider preference: Signal.");
    expect(signalPrompt).toContain(
      "Call ambient_messaging_remote_surface_activation_plan first with requestText exactly: set up Signal remote control for Ambient Desktop projects",
    );
    expect(signalPrompt).toContain(
      "if the product shortcut returns unsupported_provider, surface the repair/status prompt in chat and stop",
    );
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
    expect(voiceProviderGuidanceCards.find((card) => card.id === "mlx-audio")?.setupNotes).toContain(
      "optional text-processing dependencies",
    );
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
});
