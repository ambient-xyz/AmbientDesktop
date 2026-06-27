import { realpath, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserCredentialStore, BrowserService } from "./pluginsBrowserDogfoodFacade";
import { ProjectStore } from "./pluginsProjectStoreFacade";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import { buildFirstRunCapabilityOnboardingPrompt, buildProviderCatalogCardOnboardingPrompt } from "../../renderer/src/pluginUiModel";
import { providerCatalogSettingsState } from "./pluginsProviderFacade";
import { isolatePluginDiscoveryEnv, seedFixtureMarketplace, sendDogfoodTurn } from "./pluginDogfoodTestSupport";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-provider-dogfood-electron`,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataPath,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}));

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;

describeNative("Plugin provider catalog dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-provider-dogfood-")));
    restoreEnv = isolatePluginDiscoveryEnv(workspacePath);
    await seedFixtureMarketplace(workspacePath);
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    restoreEnv?.();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive(
    "keeps directly named provider cards during contextual live Ambient/Pi catalog lookups",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live provider catalog dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Provider catalog named provider dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during provider catalog named provider dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "agent",
        content: [
          "This is an Ambient Desktop provider catalog named-provider regression dogfood test.",
          "Call ambient_provider_catalog once with capabilityArea exactly voice-generation, installerShape exactly tts-provider, goal exactly ElevenLabs text-to-speech for HyperFrames video narration, and limit 10.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_ELEVENLABS_CONTEXT_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_ELEVENLABS_CONTEXT_OK",
      });
      expect(transcript).toContain("ambient_provider_catalog completed");
      expect(transcript).toContain("voice.elevenlabs");
      expect(transcript).toContain("ElevenLabs");
      expect(transcript).not.toContain("No known provider cards matched this query");
    },
    300_000,
  );

  itLive(
    "queries provider catalog recommendation memos during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live provider catalog dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Provider catalog recommendation memo dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during provider catalog dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "This is an Ambient Desktop provider catalog recommendation memo dogfood test.",
          "Call ambient_provider_catalog once for capabilityArea web-scraping.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_RECOMMENDATION_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_RECOMMENDATION_MEMO_OK",
      });
      expect(transcript).toContain("ambient_provider_catalog completed");
      expect(transcript).toContain("Scrapling");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("Real Scrapling dependency warmup");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea web-search with includeExperimental true and includeNeedsResearch true.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_SEARCH_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_SEARCH_MEMO_OK",
      });
      expect(transcript).toContain("Brave Search API");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("Google Programmable Search");
      expect(transcript).toContain("closed to new customers");
      expect(transcript).toContain("SearXNG");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea retrieval with includeExperimental true.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_RETRIEVAL_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_RETRIEVAL_MEMO_OK",
      });
      expect(transcript).toContain("Reason-ModernColBERT");
      expect(transcript).toContain("AgentIR-4B");
      expect(transcript).toContain("memoRole=research");
      expect(transcript).toContain("BM25/simple-vector");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea voice-generation with includeNeedsResearch true.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_VOICE_GENERATION_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_VOICE_GENERATION_MEMO_OK",
      });
      expect(transcript).toContain("Piper");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("Kokoro ONNX");
      expect(transcript).toContain("ElevenLabs");
      expect(transcript).toContain("Cartesia");
      expect(transcript).toContain("xAI Grok TTS");
      expect(transcript).toContain("XAI_API_KEY");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea deep-research with includeExperimental true and includeNeedsResearch true.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_DEEP_RESEARCH_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_DEEP_RESEARCH_MEMO_OK",
      });
      expect(transcript).toContain("LiteResearcher-4B");
      expect(transcript).toContain("memoRole=research");
      expect(transcript).toContain("Step-DeepResearch");
      expect(transcript).toContain("hosted/API reference");
      expect(transcript).toContain("trace/source/report artifacts");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea rich-documents with includeNeedsResearch true.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_RICH_DOCUMENTS_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_RICH_DOCUMENTS_MEMO_OK",
      });
      expect(transcript).toContain("Ambient Documents/Presentations/Spreadsheets runtimes");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("Ambient Office extraction/preview");
      expect(transcript).toContain("Google Workspace Docs/Sheets/Slides");
      expect(transcript).toContain("LibreOffice/Pandoc/OOXML libraries");
      expect(transcript).toContain("Microsoft 365 / Graph document workflows");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea svg-animation.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_SVG_ANIMATION_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_SVG_ANIMATION_MEMO_OK",
      });
      expect(transcript).toContain("Code-native SVG/CSS/SMIL");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("Lottie / dotLottie");
      expect(transcript).toContain("HyperFrames by HeyGen");
      expect(transcript).toContain("Remotion");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea image-generation.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_IMAGE_GENERATION_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_IMAGE_GENERATION_MEMO_OK",
      });
      expect(transcript).toContain("OpenAI GPT Image API");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("ComfyUI local image workflows");
      expect(transcript).toContain("fal Model APIs");
      expect(transcript).toContain("OPENAI_API_KEY");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea video-generation with includeNeedsResearch true.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_VIDEO_GENERATION_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_VIDEO_GENERATION_MEMO_OK",
      });
      expect(transcript).toContain("Runway API");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("Luma Dream Machine API");
      expect(transcript).toContain("ComfyUI local video workflows");
      expect(transcript).toContain("HyperFrames authored-motion video");
      expect(transcript).toContain("OpenAI Sora Videos API");
      expect(transcript).toContain("September 24, 2026");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea social-media with includeNeedsResearch true.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, secret, OAuth, social-posting, or external API tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_SOCIAL_MEDIA_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_SOCIAL_MEDIA_MEMO_OK",
      });
      expect(transcript).toContain("Bluesky / AT Protocol");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("Mastodon API");
      expect(transcript).toContain("Idempotency-Key");
      expect(transcript).toContain("X API");
      expect(transcript).toContain("LinkedIn Posts API");
      expect(transcript).toContain("memoRole=reserved");
      expect(transcript).toContain("BLUESKY_APP_PASSWORD");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "Now call ambient_provider_catalog once for capabilityArea agentic-services.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, secret, OAuth, Stripe, payment, or external API tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_AGENTIC_SERVICES_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_AGENTIC_SERVICES_MEMO_OK",
      });
      expect(transcript).toContain("Stripe Sandbox");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("STRIPE_SECRET_KEY");
      expect(transcript).toContain("sandbox-only");
      expect(transcript).toContain("Idempotency-Key");
      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    1_080_000,
  );

  itLive(
    "queries MiniCPM-V visual-understanding provider catalog during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V provider catalog dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("MiniCPM-V provider catalog dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during MiniCPM-V provider catalog dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "This is an Ambient Desktop MiniCPM-V provider catalog dogfood test.",
          "Call ambient_provider_catalog once for capabilityArea visual-understanding without includeExperimental.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, secret, model, image, or runtime tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_MINICPM_VISION_MEMO_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_MINICPM_VISION_MEMO_OK",
      });
      expect(transcript).toContain("ambient_provider_catalog completed");
      expect(transcript).toContain("MiniCPM-V");
      expect(transcript).toContain("vision-analysis-provider");
      expect(transcript).toContain("tier=recommended");
      expect(transcript).toContain("memoRole=primary");
      expect(transcript).toContain("Linux `drone` 24 GB GPU");
      expect(transcript).toContain("platformSupport=macos-arm64:supported");
      expect(transcript).toContain("linux-x64:supported");
      expect(transcript).toContain("windows-x64:experimental");
      expect(transcript).toContain("runtime acquisition/cache/preflight contract");
      expect(transcript).toContain("runtime release manifest/checksum verifier");
      expect(transcript).toContain("Visual evidence");
      expect(transcript).not.toContain("AMBIENT_DRONE_SSH_PASSWORD");
      expect(transcript).not.toContain("ambient@drone");
      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "queries voice-recognition provider catalog with Linux faster-whisper evidence",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live voice-recognition provider catalog dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Provider catalog voice-recognition Linux dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during voice-recognition provider catalog dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "This is an Ambient Desktop provider catalog voice-recognition evidence dogfood test.",
          "Call ambient_provider_catalog once for capabilityArea voice-recognition.",
          "Do not call capability builder, shell, browser, ambient_cli, install, validate, register, or secret tools.",
          "After the tool result is available, answer with exactly PROVIDER_CATALOG_VOICE_RECOGNITION_LINUX_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_VOICE_RECOGNITION_LINUX_OK",
      });
      expect(transcript).toContain("ambient_provider_catalog completed");
      expect(transcript).toContain("Qwen ASR");
      expect(transcript).toContain("faster-whisper");
      expect(transcript).toContain("memoRole=fallback");
      expect(transcript).toContain("Linux CUDA RTX 4090");
      expect(transcript).toContain("ambient_stt_status");

      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "uses provider-selection bootstrap reminder before recommending a provider",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live provider-selection bootstrap dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Provider selection bootstrap reminder dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during provider-selection bootstrap dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          "This is an Ambient Desktop provider-selection bootstrap reminder dogfood test.",
          "A user asks: Which local/offline TTS provider should Ambient start with for reading assistant replies aloud?",
          "Follow Ambient's provider-selection guidance. Do not answer from memory and do not install, scaffold, register, request secrets, or call provider APIs.",
          "After using the appropriate read-only guidance tool, answer with exactly PROVIDER_SELECTION_BOOTSTRAP_OK and nothing else.",
        ],
        expected: "PROVIDER_SELECTION_BOOTSTRAP_OK",
      });
      expect(transcript).toContain("ambient_provider_catalog completed");
      expect(transcript).toContain("Piper");
      expect(transcript).toContain("selection=Local vs cloud");
      expect(transcript).toContain("Health vs validation");
      expect(transcript).not.toContain("ambient_capability_builder_scaffold completed");

      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "plans settings-launched provider catalog onboarding through live Ambient/Pi",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live provider catalog settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const piper = providerCatalogSettingsState(new Date("2026-05-11T12:00:00.000Z")).cards.find((card) => card.id === "voice.piper");
      if (!piper) throw new Error("Expected voice.piper settings catalog card.");

      const thread = store.createThread("Provider catalog settings launch dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during provider catalog settings launch dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          buildProviderCatalogCardOnboardingPrompt(piper),
          "",
          "Dogfood constraint: execute only the two read-only planning steps requested above.",
          "Do not scaffold, install dependencies, download models, bind secrets, validate, register, activate, select providers, call ambient_cli, use shell, or use browser tools.",
          "After ambient_provider_catalog and ambient_capability_builder_plan both complete, answer with exactly PROVIDER_CATALOG_SETTINGS_LAUNCH_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_SETTINGS_LAUNCH_OK",
      });
      expect(transcript).toContain("ambient_provider_catalog completed");
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(transcript).toContain("voice.piper");
      expect(transcript).toContain("installerShape tts-provider");
      expect(transcript).not.toContain("ambient_capability_builder_scaffold completed");
      expect(transcript).not.toContain("ambient_capability_builder_install_deps completed");

      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    300_000,
  );

  itLive(
    "plans settings-launched STT and search provider catalog onboarding through live Ambient/Pi",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live provider catalog STT/search settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const settingsCatalog = providerCatalogSettingsState(new Date("2026-05-11T12:00:00.000Z"));
      const qwen = settingsCatalog.cards.find((card) => card.id === "stt.qwen-asr");
      const brave = settingsCatalog.cards.find((card) => card.id === "search.brave");
      if (!qwen) throw new Error("Expected stt.qwen-asr settings catalog card.");
      if (!brave) throw new Error("Expected search.brave settings catalog card.");

      const thread = store.createThread("Provider catalog STT and search settings launch dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during provider catalog STT/search settings launch dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          buildProviderCatalogCardOnboardingPrompt(qwen),
          "",
          "Dogfood constraint: execute only the two read-only planning steps requested above.",
          "Do not scaffold, install dependencies, download models, bind secrets, validate, register, activate, select providers, call ambient_cli, use shell, or use browser tools.",
          "After ambient_provider_catalog and ambient_capability_builder_plan both complete, answer with exactly PROVIDER_CATALOG_SETTINGS_STT_LAUNCH_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_SETTINGS_STT_LAUNCH_OK",
      });
      expect(transcript).toContain("ambient_provider_catalog completed");
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(transcript).toContain("stt.qwen-asr");
      expect(transcript).toContain("installerShape stt-provider");
      expect(transcript).not.toContain("ambient_stt_select completed");

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          buildProviderCatalogCardOnboardingPrompt(brave),
          "",
          "Dogfood constraint: execute only the two read-only planning steps requested above.",
          "Do not scaffold, install dependencies, download models, bind secrets, validate, register, activate, update search preferences, call ambient_cli, use shell, or use browser tools.",
          "After ambient_provider_catalog and ambient_capability_builder_plan both complete, answer with exactly PROVIDER_CATALOG_SETTINGS_SEARCH_LAUNCH_OK and nothing else.",
        ],
        expected: "PROVIDER_CATALOG_SETTINGS_SEARCH_LAUNCH_OK",
      });
      expect(transcript).toContain("search.brave");
      expect(transcript).toContain("installerShape search-provider");
      expect(transcript).toContain("BRAVE_API_KEY");
      expect(transcript).not.toContain("ambient_search_preference_update completed");
      expect(transcript).not.toContain("ambient_capability_builder_scaffold completed");

      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    360_000,
  );

  itLive(
    "starts catalog-backed first-run capability onboarding through live Ambient/Pi",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live first-run capability onboarding dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const settingsCatalog = providerCatalogSettingsState(new Date("2026-05-11T12:00:00.000Z"));
      const thread = store.createThread("Provider catalog first-run setup dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during first-run capability onboarding dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content: [
          buildFirstRunCapabilityOnboardingPrompt(undefined, settingsCatalog.cards),
          "",
          "Dogfood constraint: this is the first visible first-run setup response.",
          "Do not call tools, scaffold, install dependencies, download models, bind secrets, validate, register, activate, select providers, update search preferences, call ambient_cli, use shell, or use browser tools.",
          "Follow the required first response shape and include exactly these five choice labels: Set up voice, Set up speech input, Set up search/web, Set up remote access, Skip/resume later.",
          "End the response with exactly PROVIDER_CATALOG_FIRST_RUN_SETUP_OK.",
        ],
        expected: "PROVIDER_CATALOG_FIRST_RUN_SETUP_OK",
      });
      expect(transcript).toContain("Set up voice");
      expect(transcript).toContain("Set up speech input");
      expect(transcript).toContain("Set up search/web");
      expect(transcript).toContain("Set up remote access");
      expect(transcript).toContain("Skip/resume later");
      expect(transcript).not.toContain("ambient_provider_catalog completed");
      expect(transcript).not.toContain("ambient_capability_builder_plan completed");
      expect(transcript).not.toContain("ambient_capability_builder_scaffold completed");

      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );
});
