import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { ProjectStore } from "./pluginsProjectStoreFacade";
import { AmbientPluginHost } from "./pluginHost";
import {
  ensureFirstPartyAmbientCliPackages,
  installAmbientCliPackageSource,
  runAmbientCliPackageCommand,
  saveAmbientCliPackageEnvSecret,
} from "./pluginsAmbientCliFacade";
import { AgentRuntime, discoverPiExtensionSandboxPackages, discoverPiPrivilegedPackages } from "./pluginsAgentRuntimeDogfoodFacade";
import { deterministicWavFixtureVoiceRunner, writeVoiceDiscoveryCacheEntry } from "./pluginsVoiceDogfoodFacade";
import { setupQwen3AsrProvider } from "../stt/sttProviderInstaller";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { SttSettings, VoiceProviderCandidate, VoiceSettings } from "../../shared/localRuntimeTypes";
import type { PermissionPromptResolution } from "../../shared/permissionTypes";
import { buildFirstRunCapabilityOnboardingPrompt, buildProviderCatalogCardOnboardingPrompt } from "../../renderer/src/pluginUiModel";
import { providerCatalogSettingsState } from "./pluginsProviderFacade";
import {
  braveSearchDogfoodDescriptor,
  isolatePluginDiscoveryEnv,
  pluginStateReader,
  readDogfoodSecret,
  renderMiniCpmFixtureVideo,
  restoreOptionalEnv,
  restoreProcessEnv,
  seedAmbientCliFixture,
  seedFixtureMarketplace,
  seedSelfInstallMarketplace,
  sendDogfoodTurn,
  trustFixturePlugin,
  writeMiniCpmDogfoodEvidence,
} from "./pluginDogfoodTestSupport";

const execFileAsync = promisify(execFile);

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-dogfood-electron`,
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
const itMiniCpmLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" && process.env.AMBIENT_MINICPM_VISION_LIVE === "1" ? it : it.skip;
const itHyperframesLive = process.env.AMBIENT_HYPERFRAMES_LIVE === "1" ? it : it.skip;

describeNative("Plugin chat dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-dogfood-")));
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

  it("loads, trusts, and invokes the fixture Codex MCP plugin from a workspace marketplace", async () => {
    const host = new AmbientPluginHost();
    try {
      const fixture = await trustFixturePlugin(store, workspacePath);
      const catalog = await host.readCodexPluginCatalog(workspacePath, pluginStateReader(store));
      const trustedFixture = catalog.plugins.find((plugin) => plugin.name === "ambient-fixture");
      const registrations = await host.buildCodexPluginMcpToolRegistrations([fixture], {
        permissionMode: "workspace",
        workspacePath,
      });
      const registration = registrations.find((tool) => tool.originalName === "ambient_fixture_workspace_summary");
      expect(trustedFixture).toMatchObject({ enabled: true, trusted: true });
      expect(registration).toMatchObject({
        registeredName: "ambient_fixture_workspace_summary",
        tool: expect.objectContaining({ pluginName: "ambient-fixture", serverName: "ambient-fixture" }),
      });

      const result = await host.callCodexPluginMcpTool(
        registration!.launchPlan,
        { toolName: registration!.originalName, arguments: { includeFiles: false } },
        { permissionMode: "workspace", workspacePath },
      );

      expect(result.content[0].text).toContain("Ambient fixture MCP summary");
      expect(result.content[0].text).toContain("cwd:");
      expect(result.content[0].text).toContain("/plugins/ambient-fixture");
    } finally {
      await host.shutdownPluginMcpServers();
    }
  });

  itLive(
    "invokes a trusted fixture Codex MCP plugin during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin chat dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await trustFixturePlugin(store, workspacePath);
      const thread = store.createThread("Plugin dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during trusted plugin dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop plugin dogfood test.",
          "Call the Codex plugin MCP tool named ambient_fixture_workspace_summary with includeFiles=false.",
          "After the tool result is available, answer with one short sentence containing the exact token PLUGIN_DOGFOOD_OK and the cwd from the tool result.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);

      expect(transcript).toContain("PLUGIN_DOGFOOD_OK");
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            threadId: thread.id,
            toolName: "ambient_fixture_workspace_summary",
            risk: "plugin-tool",
            decision: "allowed",
          }),
        ]),
      );
      expect(runtime.pluginMcpRuntimeSnapshots()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pluginName: "ambient-fixture",
            serverName: "ambient-fixture",
            workspacePath,
          }),
        ]),
      );
    },
    360_000,
  );

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

  itHyperframesLive(
    "discovers, describes, and uses bundled HyperFrames through live Ambient/Pi",
    async () => {
      const previousFakeRender = process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER;
      process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER = "1";
      await ensureFirstPartyAmbientCliPackages(workspacePath, {
        packageNames: ["ambient-hyperframes"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });

      const thread = store.createThread("HyperFrames Ambient CLI dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName === "ambient_cli") return { allowed: true, mode: "allow_once" };
            throw new Error(`Unexpected permission prompt during HyperFrames dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is a live Ambient/Pi dogfood test for the bundled HyperFrames Ambient CLI package.",
            "Use standard Ambient CLI mechanisms only; do not use shell, browser, Capability Builder, plugin install, or Scrapling/MCP tools.",
            "First call ambient_cli_search for HyperFrames authored motion title card video.",
            "Then call ambient_cli_describe for packageName ambient-hyperframes.",
            "Then call ambient_cli for packageName ambient-hyperframes command hyperframes_init with args --project-dir hf-live --title Live HyperFrames --subtitle Ambient CLI dogfood.",
            "Then call ambient_cli for command hyperframes_inspect with args --source hf-live/comp.html --json.",
            "Then call ambient_cli for command hyperframes_render with args --source hf-live/comp.html --output .ambient/hyperframes/renders/live-dogfood.mp4 --json.",
            "After the render tool result returns, answer with exactly HYPERFRAMES_LIVE_DOGFOOD_OK and include the rendered output path from the tool result.",
          ].join("\n"),
        });

        const transcript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        expect(transcript).toContain("HYPERFRAMES_LIVE_DOGFOOD_OK");
        expect(transcript).toContain("ambient_cli_search completed");
        expect(transcript).toContain("ambient_cli_describe completed");
        expect(transcript).toContain("ambient_cli completed");
        expect(transcript).toContain(".ambient/hyperframes/renders/live-dogfood.mp4");
        const rendered = await stat(join(workspacePath, ".ambient", "hyperframes", "renders", "live-dogfood.mp4"));
        expect(rendered.size).toBeGreaterThan(0);
      } finally {
        if (previousFakeRender === undefined) {
          delete process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER;
        } else {
          process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER = previousFakeRender;
        }
      }
    },
    360_000,
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

  itLive(
    "preserves generic plugin markdown input metadata from a live Ambient run",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin markdown longform dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await trustFixturePlugin(store, workspacePath);
      const markdown = [
        "# Long Plugin Markdown",
        "",
        "This payload exists to exercise generic plugin input preview metadata.",
        "details ".repeat(90),
      ].join("\n");
      expect(markdown.length).toBeGreaterThan(500);
      const thread = store.createThread("Plugin markdown longform dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during trusted plugin markdown dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop generic plugin longform display dogfood test.",
          "Call the Codex plugin MCP tool named ambient_fixture_markdown_echo with markdown exactly:",
          "```markdown",
          markdown,
          "```",
          "After the tool result is available, answer with one short sentence containing PLUGIN_MARKDOWN_LONGFORM_OK and markdownLength.",
          "Do not use browser, shell, read, write, edit, or ambient_cli tools.",
        ].join("\n"),
      });

      const messages = store.listMessages(thread.id);
      const transcript = messages.map((message) => message.content).join("\n");
      const pluginMessage = messages.find(
        (message) => message.metadata?.toolName === "ambient_fixture_markdown_echo" && message.metadata?.toolLongformInputPreview,
      );
      const longformPreview = pluginMessage?.metadata?.toolLongformInputPreview as
        | { kind?: string; title?: string; items?: Array<{ fieldPath?: string; chars?: number; language?: string }> }
        | undefined;

      expect(transcript).toContain("PLUGIN_MARKDOWN_LONGFORM_OK");
      expect(transcript).toContain("markdownLength");
      expect(longformPreview).toMatchObject({
        kind: "longform-input",
        title: "Long input",
        items: [
          {
            fieldPath: "markdown",
            language: "markdown",
          },
        ],
      });
      expect(longformPreview?.items?.[0]?.chars).toBeGreaterThan(500);
    },
    240_000,
  );

  itLive(
    "preserves large plugin MCP output metadata from a live Ambient run",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin output metadata dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await trustFixturePlugin(store, workspacePath);
      const thread = store.createThread("Plugin output metadata dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during trusted plugin output metadata dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop plugin MCP large output display dogfood test.",
          'Call the Codex plugin MCP tool named ambient_fixture_markdown_echo with markdown exactly "large plugin output metadata dogfood" and outputLines exactly 260.',
          "After the tool result is available, answer with one short sentence containing PLUGIN_OUTPUT_METADATA_OK and outputLines.",
          "Do not quote generated output lines in the final answer.",
          "Do not use browser, shell, read, write, edit, or ambient_cli tools.",
        ].join("\n"),
      });

      const messages = store.listMessages(thread.id);
      const transcript = messages.map((message) => message.content).join("\n");
      const pluginMessage = messages.find(
        (message) => message.metadata?.toolName === "ambient_fixture_markdown_echo" && message.metadata?.toolResultDetails,
      );
      const largeOutputPreview = (
        pluginMessage?.metadata?.toolResultDetails as
          | { largeOutputPreview?: { items?: Array<{ chars?: number; previewChars?: number; artifactPath?: string }> } }
          | undefined
      )?.largeOutputPreview;
      const artifactPath = largeOutputPreview?.items?.[0]?.artifactPath;

      expect(transcript).toContain("PLUGIN_OUTPUT_METADATA_OK");
      expect(transcript).toContain("outputLines");
      expect(largeOutputPreview?.items?.[0]?.chars).toBeGreaterThan(12_000);
      expect(largeOutputPreview?.items?.[0]?.previewChars).toBe(12_000);
      expect(artifactPath).toMatch(/^\.ambient\/tool-outputs\/.+\.txt$/);
      const artifact = await readFile(join(workspacePath, artifactPath!), "utf8");
      expect(artifact).toContain("pluginOutputLine 0260");
    },
    240_000,
  );

  itLive(
    "switches Ambient voice provider and voice through chat settings tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live voice settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const permissionResolutions: PermissionPromptResolution[] = [];
      const voiceSettingsAudit: Array<{ toolName?: string; threadId?: string; source?: string; input: VoiceSettings }> = [];
      let voiceSettings: VoiceSettings = {
        enabled: true,
        mode: "assistant-final",
        autoplay: true,
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        voiceId: "rachel",
        maxChars: 1500,
        longReply: "summarize",
        format: "mp3",
        artifactCacheMaxMb: 30,
      };
      const voiceProviders: VoiceProviderCandidate[] = [
        {
          packageId: "ambient-elevenlabs-tts",
          packageName: "ambient-elevenlabs-tts",
          command: "elevenlabs_tts",
          capabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          providerId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          label: "ElevenLabs",
          format: "mp3",
          formats: ["mp3"],
          voices: [{ id: "rachel", label: "Rachel" }],
          local: false,
          voiceDiscovery: {
            command: "elevenlabs_tts",
            cacheTtlSeconds: 86400,
            requiresNetwork: true,
            requiresSecret: ["ELEVENLABS_API_KEY"],
            source: "cloud-api",
          },
          installed: true,
          available: true,
          availabilityReason: "ready",
        },
        {
          packageId: "ambient-piper-tts",
          packageName: "ambient-piper-tts",
          command: "piper_tts",
          capabilityId: "ambient-cli:piper:tool:piper_tts",
          providerId: "ambient-cli:piper:tool:piper_tts",
          label: "Piper TTS",
          format: "wav",
          formats: ["wav"],
          voices: [
            { id: "en_US-lessac-medium", label: "Lessac" },
            { id: "en_US-amy-medium", label: "Amy" },
          ],
          local: true,
          installed: true,
          available: true,
          availabilityReason: "ready",
        },
      ];
      const thread = store.createThread("Voice settings tool dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (!["ambient_voice_select", "ambient_voice_policy_update", "ambient_voice_test"].includes(request.toolName)) {
              throw new Error(`Unexpected permission prompt during voice settings dogfood: ${request.title}`);
            }
            const resolution: PermissionPromptResolution = { allowed: true, mode: "allow_once" };
            permissionResolutions.push(resolution);
            return resolution;
          },
          denyThread: () => undefined,
        },
        {
          voice: {
            readSettings: () => voiceSettings,
            updateSettings: async (input, audit) => {
              voiceSettingsAudit.push({ input, source: audit?.source, toolName: audit?.toolName, threadId: audit?.threadId });
              voiceSettings = { ...input };
              return voiceSettings;
            },
            listProviders: () => voiceProviders,
            testRunner: deterministicWavFixtureVoiceRunner(),
            createMediaUrl: ({ relativePath }) => `ambient-media://dogfood/${encodeURIComponent(relativePath)}`,
          },
        },
      );

      let transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Please switch Ambient's chat voice provider to Piper TTS.",
          "Use the normal product path for changing voice settings.",
          "Do not tell me to open Settings. Do not use shell, browser, ambient_cli, install, repair, validate, or register tools.",
          "After the switch completes, answer with exactly VOICE_PROVIDER_SWITCH_OK and include the selected provider capability id.",
        ],
        expected: "VOICE_PROVIDER_SWITCH_OK",
      });

      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_select completed");
      expect(transcript).toContain("ambient-cli:piper:tool:piper_tts");
      expect(transcript).not.toContain("ambient_cli completed");
      expect(voiceSettings).toMatchObject({
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        voiceId: "en_US-lessac-medium",
        format: "wav",
      });
      expect(voiceSettingsAudit.at(-1)).toMatchObject({
        source: "chat-tool",
        toolName: "ambient_voice_select",
        threadId: thread.id,
      });

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Now switch the selected Piper voice to Amy.",
          "Use the normal product path for changing voice settings.",
          "Do not tell me to open Settings. Do not use shell, browser, ambient_cli, install, repair, validate, or register tools.",
          "After the switch completes, answer with exactly VOICE_VOICE_SWITCH_OK and include the selected voice id.",
        ],
        expected: "VOICE_VOICE_SWITCH_OK",
      });

      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_select completed");
      expect(transcript).toContain("en_US-amy-medium");
      expect(transcript).not.toContain("ambient_cli completed");
      expect(voiceSettings).toMatchObject({
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        voiceId: "en_US-amy-medium",
        format: "wav",
      });
      expect(voiceSettingsAudit.at(-1)).toMatchObject({
        source: "chat-tool",
        toolName: "ambient_voice_select",
        threadId: thread.id,
      });

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Now turn Ambient chat voice off, disable voice autoplay, and skip voicing long replies.",
          "Use the normal product path for changing voice policy.",
          "Do not tell me to open Settings. Do not use shell, browser, ambient_cli, install, repair, validate, register, or provider selection tools.",
          "After the policy change completes, answer with exactly VOICE_POLICY_UPDATE_OK and include the new enabled, autoplay, and longReply values.",
        ],
        expected: "VOICE_POLICY_UPDATE_OK",
      });

      const policyTranscript = transcript.slice(transcript.indexOf("Now turn Ambient chat voice off"));
      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_policy_update completed");
      expect(policyTranscript).not.toContain("ambient_voice_select completed");
      expect(policyTranscript).not.toContain("ambient_cli completed");
      expect(voiceSettings).toMatchObject({
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        voiceId: "en_US-amy-medium",
        enabled: false,
        autoplay: false,
        longReply: "skip",
        format: "wav",
      });
      expect(voiceSettingsAudit.at(-1)).toMatchObject({
        source: "chat-tool",
        toolName: "ambient_voice_policy_update",
        threadId: thread.id,
      });

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Now test the selected voice provider with a tiny phrase.",
          "Use the normal product path for testing the selected chat voice provider.",
          "Do not use shell, browser, ambient_cli, install, repair, validate, or register tools.",
          "After the test completes, answer with exactly VOICE_PROVIDER_TEST_OK and include the generated audio path.",
        ],
        expected: "VOICE_PROVIDER_TEST_OK",
      });

      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_test completed");
      expect(transcript).toContain(".ambient/voice/");
      expect(transcript).toContain(".wav");
      expect(transcript).not.toContain("ambient_cli completed");
      expect(permissionResolutions).toHaveLength(4);
      expect(voiceSettingsAudit).toHaveLength(3);

      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Now set the selected Piper voice to Amy again.",
          "Use the normal product path for changing voice settings.",
          "If it is already Amy, report that it is already configured. Do not ask for approval for a no-op.",
          "Do not tell me to open Settings. Do not use shell, browser, ambient_cli, install, repair, validate, or register tools.",
          "After checking, answer with exactly VOICE_NOOP_OK.",
        ],
        expected: "VOICE_NOOP_OK",
      });

      const noopTranscript = transcript.slice(transcript.indexOf("Now set the selected Piper voice to Amy again"));
      expect(noopTranscript).toContain("already configured");
      expect(noopTranscript).not.toContain("ambient_cli completed");
      expect(permissionResolutions).toHaveLength(4);
      expect(voiceSettingsAudit).toHaveLength(3);
    },
    240_000,
  );

  itLive(
    "lists cached dynamic voice catalog entries through chat settings tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live voice list dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      let voiceSettings: VoiceSettings = {
        enabled: true,
        mode: "assistant-final",
        autoplay: true,
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        voiceId: "rachel",
        maxChars: 1500,
        longReply: "summarize",
        format: "mp3",
        artifactCacheMaxMb: 30,
      };
      const voiceProviders: VoiceProviderCandidate[] = [
        {
          packageId: "ambient-elevenlabs-tts",
          packageName: "ambient-elevenlabs-tts",
          command: "elevenlabs_tts",
          capabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          providerId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          label: "ElevenLabs",
          format: "mp3",
          formats: ["mp3"],
          voices: [{ id: "rachel", label: "Rachel" }],
          local: false,
          voiceDiscovery: {
            command: "elevenlabs_tts",
            cacheTtlSeconds: 86400,
            requiresNetwork: true,
            requiresSecret: ["ELEVENLABS_API_KEY"],
            source: "cloud-api",
          },
          installed: true,
          available: true,
          availabilityReason: "ready",
        },
      ];
      await writeVoiceDiscoveryCacheEntry(workspacePath, {
        providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
        providerLabel: "ElevenLabs",
        source: "cloud-api",
        refreshedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        voiceCount: 3,
        voices: [
          { id: "rachel", label: "Rachel", style: ["clear"] },
          {
            id: "british-warm-narrator",
            label: "British Warm Narrator",
            locale: "en-GB",
            language: "English",
            style: ["warm", "narration"],
          },
          { id: "us-bright-host", label: "US Bright Host", locale: "en-US", language: "English", style: ["bright"] },
        ],
      });

      const thread = store.createThread("Voice list tool dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during voice list dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          voice: {
            readSettings: () => voiceSettings,
            updateSettings: async (input) => {
              voiceSettings = { ...input };
              return voiceSettings;
            },
            listProviders: () => voiceProviders,
            testRunner: deterministicWavFixtureVoiceRunner(),
            createMediaUrl: ({ relativePath }) => `ambient-media://dogfood/${encodeURIComponent(relativePath)}`,
          },
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "First call ambient_voice_status.",
          "Then call ambient_voice_list_voices with providerCapabilityId exactly ambient-cli:elevenlabs:tool:elevenlabs_tts, query exactly warm, locale exactly en-GB, and limit 5.",
          "Do not use shell, browser, ambient_cli, install, repair, validate, register, provider test, provider selection, or policy tools.",
          "After checking, answer with exactly VOICE_LIST_OK and include the exact matching voice id.",
        ],
        expected: "VOICE_LIST_OK",
      });

      expect(transcript).toContain("ambient_voice_status completed");
      expect(transcript).toContain("ambient_voice_list_voices completed");
      expect(transcript).toContain("british-warm-narrator");
      expect(transcript).not.toContain("ambient_cli completed");
    },
    180_000,
  );

  itLive(
    "surfaces Qwen ASR needs-runtime metadata through live Ambient STT status",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Qwen ASR STT status dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const previousBinary = process.env.AMBIENT_QWEN3_ASR_BINARY;
      const previousModel = process.env.AMBIENT_QWEN3_ASR_MODEL;
      const missingRuntimePath = join(workspacePath, "missing-llama-mtmd-cli");
      const sttSettings: SttSettings = {
        enabled: false,
        spokenLanguage: "English",
        mode: "push-to-talk",
        autoSendAfterTranscription: false,
        silenceFinalizeSeconds: 0.8,
        noSpeechGate: { enabled: true, rmsThresholdDbfs: -50 },
        bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
      };

      try {
        process.env.AMBIENT_QWEN3_ASR_BINARY = missingRuntimePath;
        process.env.AMBIENT_QWEN3_ASR_MODEL = "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0";
        const setup = await setupQwen3AsrProvider(
          workspacePath,
          { provider: "qwen3-asr", action: "install" },
          {
            bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
            disableRuntimeAutoDetect: true,
            disableRuntimeInstall: true,
            now: () => new Date("2026-05-11T00:00:00.000Z"),
          },
        );
        expect(setup.status).toBe("needs-runtime");
        expect(setup.validation).toMatchObject({
          status: "needs-runtime",
          assetManifest: expect.objectContaining({
            model: expect.objectContaining({
              id: "qwen3-asr-0.6b-q8_0",
              revision: "928ab958557df9aa2ef1c93e0e83c7ad0933fae2",
            }),
            runtime: expect.objectContaining({ directDownloadsEnabled: false }),
          }),
        });

        const thread = store.createThread("Qwen ASR STT status dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async (request) => {
              throw new Error(`Unexpected permission prompt during Qwen ASR STT status dogfood: ${request.title}`);
            },
            denyThread: () => undefined,
          },
          {
            stt: {
              readSettings: () => sttSettings,
            },
          },
        );

        await runtime.send({
          threadId: thread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop Qwen ASR STT status dogfood test.",
            "Call ambient_stt_status once to inspect installed STT providers and runtime readiness.",
            "Do not call ambient_stt_select, ambient_stt_policy_update, ambient_stt_test, ambient_cli, shell, browser, install, repair, or provider setup tools.",
            "After the status tool result is available, answer with exactly QWEN_ASR_STATUS_NEEDS_RUNTIME_OK and mention whether Qwen3-ASR is available.",
          ].join("\n"),
        });

        const transcript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        const audit = store.listPermissionAudit(20);
        expect(transcript).toContain("QWEN_ASR_STATUS_NEEDS_RUNTIME_OK");
        expect(transcript).toContain("ambient_stt_status completed");
        expect(transcript).toContain("Qwen3-ASR Local");
        expect(transcript).toContain("available=false");
        expect(transcript).toContain("validation=needs-runtime");
        expect(transcript).toContain("assets=qwen3-asr-0.6b-q8_0@928ab958");
        expect(transcript).toContain("Providers: 0/1 available");
        expect(transcript).not.toContain("ambient_stt_select completed");
        expect(transcript).not.toContain("ambient_stt_test completed");
        expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
      } finally {
        restoreOptionalEnv("AMBIENT_QWEN3_ASR_BINARY", previousBinary);
        restoreOptionalEnv("AMBIENT_QWEN3_ASR_MODEL", previousModel);
      }
    },
    240_000,
  );

  itLive(
    "selects and tests bundled faster-whisper STT through live Ambient tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live faster-whisper STT tool dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await execFileAsync(
        process.execPath,
        [
          "scripts/stt-spike/prepare-corpus.mjs",
          "--manifest",
          "scripts/stt-spike/corpus.public-smoke.manifest.json",
          "--out",
          join(workspacePath, ".ambient", "stt-spike", "corpus", "public-smoke"),
        ],
        { cwd: process.cwd(), timeout: 120_000, maxBuffer: 1024 * 1024 * 8 },
      );
      const audioPath = ".ambient/stt-spike/corpus/public-smoke/normalized/hf-asr-dummy-1-en.wav";
      const installStatuses = await ensureFirstPartyAmbientCliPackages(workspacePath, {
        packageNames: ["ambient-faster-whisper-stt"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(installStatuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-faster-whisper-stt",
          status: "installed",
        }),
      ]);

      let sttSettings: SttSettings = {
        enabled: false,
        spokenLanguage: "English",
        mode: "push-to-talk",
        autoSendAfterTranscription: true,
        silenceFinalizeSeconds: 0.8,
        noSpeechGate: { enabled: false, rmsThresholdDbfs: -55 },
        bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
      };
      const permissionResolutions: PermissionPromptResolution[] = [];
      const thread = store.createThread("faster-whisper STT product path dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (!["ambient_stt_select", "ambient_stt_test"].includes(request.toolName)) {
              throw new Error(`Unexpected permission prompt during faster-whisper STT dogfood: ${request.title}`);
            }
            const resolution: PermissionPromptResolution = { allowed: true, mode: "allow_once" };
            permissionResolutions.push(resolution);
            return resolution;
          },
          denyThread: () => undefined,
        },
        {
          stt: {
            readSettings: () => sttSettings,
            updateSettings: async (input) => {
              sttSettings = { ...input };
              return sttSettings;
            },
          },
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop faster-whisper STT product-path dogfood test.",
          "Use only the Ambient STT tools for this check.",
          "First call ambient_stt_status.",
          "Then call ambient_stt_select for the installed faster-whisper tiny.en Local provider, spokenLanguage English, enabled true.",
          `Then call ambient_stt_test with audioPath exactly ${audioPath} and spokenLanguage English.`,
          "Do not call ambient_stt_policy_update, ambient_cli, shell, browser, install, repair, provider setup, or Settings tools.",
          "After all three required STT tools complete, answer with exactly FASTER_WHISPER_STT_PRODUCT_PATH_OK and include the status phrases packageType=adapter-only and modelAssets=not-bundled plus the transcript phrase He hoped there would be stew.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("FASTER_WHISPER_STT_PRODUCT_PATH_OK");
      expect(transcript).toContain("ambient_stt_status completed");
      expect(transcript).toContain("ambient_stt_select completed");
      expect(transcript).toContain("ambient_stt_test completed");
      expect(transcript).toContain("faster-whisper tiny.en Local");
      expect(transcript).toContain("packageType=adapter-only");
      expect(transcript).toContain("modelAssets=not-bundled");
      expect(transcript).toContain("He hoped there would be stew");
      expect(transcript).not.toContain("ambient_stt_policy_update completed");
      expect(transcript).not.toContain("ambient_cli completed");
      expect(sttSettings.enabled).toBe(true);
      expect(sttSettings.providerCapabilityId).toContain("ambient-faster-whisper-stt");
      expect(permissionResolutions).toHaveLength(2);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_stt_select", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_stt_test", decision: "allowed" }),
        ]),
      );
    },
    360_000,
  );

  itLive(
    "self-installs, activates, reloads, and invokes a Codex MCP plugin during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin self-install dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await rm(join(workspacePath, ".agents"), { recursive: true, force: true });
      await rm(join(workspacePath, "plugins"), { recursive: true, force: true });
      const source = await seedSelfInstallMarketplace(workspacePath);
      const thread = store.createThread("Plugin self-install dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop plugin self-install dogfood test.",
          `Use ambient_plugin_install_preview with source ${source.marketplacePath}.`,
          "Then use ambient_plugin_install_commit for pluginName ambient-fixture from that same source.",
          "Then use ambient_plugin_activate for pluginName ambient-fixture with installDependencies=false.",
          "Do not call the ambient_fixture_workspace_summary MCP tool in this turn.",
          "After activation, answer with exactly SELF_INSTALL_ACTIVATED.",
        ].join("\n"),
      });

      const installedCatalog = await new AmbientPluginHost().readCodexPluginCatalog(workspacePath, pluginStateReader(store));
      const installed = installedCatalog.plugins.find((plugin) => plugin.name === "ambient-fixture");
      expect(installed).toMatchObject({ enabled: true, trusted: false, sourceKind: "workspace" });
      expect(
        store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n"),
      ).toContain("SELF_INSTALL_ACTIVATED");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call the Codex plugin MCP tool named ambient_fixture_workspace_summary with includeFiles=false.",
          "After the tool result is available, answer with one short sentence containing the exact token SELF_INSTALL_TOOL_OK and the cwd from the tool result.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("SELF_INSTALL_TOOL_OK");
      expect(transcript).toContain("Ambient fixture MCP summary");
      expect(runtime.pluginMcpRuntimeSnapshots()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pluginName: "ambient-fixture",
            serverName: "ambient-fixture",
          }),
        ]),
      );
    },
    360_000,
  );

  itLive(
    "installs and uses an Ambient CLI skill package during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live CLI package dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const repo = join(workspacePath, "cli-repo");
      await seedAmbientCliFixture(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync(
        "git",
        ["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "seed cli package"],
        {
          cwd: repo,
        },
      );
      const { stdout: cliShaStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const cliSha = String(cliShaStdout).trim();
      await writeFile(join(workspacePath, "payload.json"), `${JSON.stringify({ message: "CLI_DOGFOOD_VALUE" })}\n`, "utf8");
      const thread = store.createThread("CLI package dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop CLI package dogfood test.",
          `Use ambient_cli_package_preview with source ${repo}, path ./cli-fixture, and sha ${cliSha}.`,
          `Then use ambient_cli_package_install with source ${repo}, path ./cli-fixture, and sha ${cliSha}.`,
          "Preview is not installation. You must wait for ambient_cli_package_install to complete successfully before answering.",
          "Do not run ambient_cli in this turn.",
          "After installation, answer with exactly CLI_PACKAGE_INSTALLED.",
        ].join("\n"),
      });
      const installTranscript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(installTranscript).toContain("ambient_cli_package_install completed");
      expect(installTranscript).toContain("CLI_PACKAGE_INSTALLED");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Find the installed Ambient CLI capability for extracting a JSON field by calling ambient_cli_search with query exactly json field extraction.",
          "Then call ambient_cli_describe with packageName ambient-json-cli and command json-pick.",
          "Do not run ambient_cli in this turn.",
          "After ambient_cli_describe completes, answer with exactly CLI_PACKAGE_DESCRIBED.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });
      const describeTranscript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(describeTranscript).toContain("Ambient CLI capability search");
      expect(describeTranscript).toContain("Ambient CLI capability description");
      expect(describeTranscript).toContain("CLI_PACKAGE_DESCRIBED");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call ambient_cli with packageName ambient-json-cli, command json-pick, and args payload.json and message.",
          "After the tool result is available, answer with one short sentence containing CLI_PACKAGE_DOGFOOD_OK and the exact extracted value.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("Ambient CLI capability search");
      expect(transcript).toContain("Ambient CLI capability description");
      expect(transcript).toContain("CLI_PACKAGE_DOGFOOD_OK");
      expect(transcript).toContain("CLI_DOGFOOD_VALUE");
    },
    360_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V vision through Ambient CLI during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V Ambient CLI dogfood.");
      const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/Users/example/RCLI/deps/llama.cpp/build/bin/llama-server";
      await stat(llamaServer).catch(() => {
        throw new Error(
          `Set AMBIENT_MINICPM_V_LLAMA_SERVER to a runnable llama-server binary for live MiniCPM-V dogfood. Missing: ${llamaServer}`,
        );
      });

      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      const port = String(39_300 + Math.floor(Math.random() * 400));
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = llamaServer;
      process.env.AMBIENT_MINICPM_V_PORT = port;
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const source = join(workspacePath, "minicpm-v-package-source");
      const imageDir = join(workspacePath, "minicpm-dogfood");
      const imagePath = join(imageDir, "ambient-main-shell.png");
      const artifactPath = ".ambient/minicpm-v-dogfood/main-shell-analysis.json";
      const stateDir = ".ambient/minicpm-v-dogfood-state";
      await cp(join(process.cwd(), "resources", "ambient-cli-packages", "ambient-minicpm-v-vision"), source, {
        recursive: true,
        force: true,
      });
      await mkdir(imageDir, { recursive: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), imagePath, { force: true });

      const thread = store.createThread("MiniCPM-V Ambient CLI dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V Ambient CLI package dogfood test.",
            "Use ambient_cli_package_preview with source ./minicpm-v-package-source.",
            "Then use ambient_cli_package_install with source ./minicpm-v-package-source.",
            "Preview is not installation. Wait for ambient_cli_package_install to complete successfully before answering.",
            "Do not run ambient_cli in this turn. Do not use browser or shell tools.",
            "After installation, answer with exactly MINICPM_VISION_PACKAGE_INSTALLED.",
          ].join("\n"),
        });
        const installTranscript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        expect(installTranscript).toContain("ambient_cli_package_install completed");
        expect(installTranscript).toContain("MINICPM_VISION_PACKAGE_INSTALLED");

        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "Find the installed Ambient CLI capability for MiniCPM visual screenshot analysis by calling ambient_cli_search with query exactly MiniCPM visual screenshot analysis.",
            "Then call ambient_cli_describe with packageName ambient-minicpm-v-vision and command minicpm_vision_analyze.",
            "Do not run ambient_cli in this turn. Do not use browser or shell tools.",
            "After ambient_cli_describe completes, answer with exactly MINICPM_VISION_PACKAGE_DESCRIBED.",
          ].join("\n"),
        });
        const describeTranscript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        expect(describeTranscript).toContain("Ambient CLI capability search");
        expect(describeTranscript).toContain("Ambient CLI capability description");
        expect(describeTranscript).toContain("MINICPM_VISION_PACKAGE_DESCRIBED");

        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "Now run the MiniCPM vision package through ambient_cli exactly in this order.",
            `First call ambient_cli with packageName ambient-minicpm-v-vision, command minicpm_vision_start, and args ${JSON.stringify(["--state-dir", stateDir, "--wait-ms", "120000", "--offline"])}.`,
            `Second call ambient_cli with packageName ambient-minicpm-v-vision, command minicpm_vision_analyze, and args ${JSON.stringify([
              "--state-dir",
              stateDir,
              "--image",
              "minicpm-dogfood/ambient-main-shell.png",
              "--output-json",
              artifactPath,
              "--prompt",
              "Inspect this Ambient Desktop screenshot for concrete UI evidence. Quote exact visible labels when legible and return concise valid JSON.",
            ])}.`,
            `Third call ambient_cli with packageName ambient-minicpm-v-vision, command minicpm_vision_stop, and args ${JSON.stringify(["--state-dir", stateDir])}.`,
            "After all three ambient_cli calls complete, answer with one short sentence containing MINICPM_VISION_DOGFOOD_OK and at least two exact visible labels from the MiniCPM observations.",
            "Do not use browser or shell tools. Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const transcript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        expect(transcript).toContain("Command: minicpm_vision_start");
        expect(transcript).toContain("Command: minicpm_vision_analyze");
        expect(transcript).toContain("Command: minicpm_vision_stop");
        expect(transcript).toContain("MINICPM_VISION_DOGFOOD_OK");
        expect(transcript).toContain("New chat");
        expect(transcript).toContain("Ambient");
        expect(transcript).toContain(`"jsonPath":"${artifactPath}"`);
        expect(transcript).not.toContain(imagePath);
        expect(transcript).not.toContain("data:image/png;base64");

        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
          artifacts: { previewJsonPath: artifactPath },
        });
        expect(artifact.parsedOutput.summary).toEqual(expect.any(String));
        expect(artifact.parsedOutput.observations.length).toBeGreaterThan(0);
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        await writeMiniCpmDogfoodEvidence({
          model: artifact.model,
          durationMs: artifact.latencyMs,
          summary: artifact.parsedOutput.summary,
          observations: artifact.parsedOutput.observations,
          limitations: artifact.parsedOutput.limitations,
          artifactPath: artifact.artifacts.previewJsonPath,
          image: {
            basename: artifact.image.basename,
            bytes: artifact.image.bytes,
            sha256: artifact.image.sha256,
          },
        });
        const audit = store.listPermissionAudit(50);
        expect(audit).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_package_install", decision: "allowed" }),
          ]),
        );
        expect(audit).toEqual(
          expect.arrayContaining([expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" })]),
        );
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", stateDir],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    720_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V vision through the typed Ambient visual tool during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V typed visual dogfood.");
      const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/Users/example/RCLI/deps/llama.cpp/build/bin/llama-server";
      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = llamaServer;
      process.env.AMBIENT_MINICPM_V_PORT = String(39_700 + Math.floor(Math.random() * 200));
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const imageDir = join(workspacePath, "minicpm-typed-dogfood");
      const imagePath = join(imageDir, "ambient-main-shell.png");
      const artifactPath = ".ambient/minicpm-v-dogfood/typed-main-shell-analysis.json";
      await mkdir(imageDir, { recursive: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), imagePath, { force: true });

      const thread = store.createThread("MiniCPM-V typed visual dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V typed visual tool dogfood test.",
            "Call ambient_visual_analyze exactly once.",
            `Use imagePath exactly "minicpm-typed-dogfood/ambient-main-shell.png", task "ui_review", outputJsonPath exactly ${JSON.stringify(artifactPath)}, and offline true.`,
            "Do not call ambient_cli, ambient_cli_search, ambient_cli_describe, shell, browser, or file tools.",
            "After ambient_visual_analyze completes, answer with one short sentence containing MINICPM_TYPED_VISION_DOGFOOD_OK and at least two exact visible labels from the visual observations.",
            "Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        expect(transcript).toContain("MiniCPM-V visual analysis completed.");
        expect(transcript).toContain("MINICPM_TYPED_VISION_DOGFOOD_OK");
        expect(transcript).toContain("New chat");
        expect(transcript).toContain("Ambient");
        expect(transcript).toContain(artifactPath);
        expect(transcript).not.toContain(imagePath);
        expect(transcript).not.toContain("data:image/png;base64");
        expect(transcript).not.toContain("Command: minicpm_vision_analyze");

        const visualMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_analyze");
        expect(visualMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_analyze",
          status: "done",
        });
        expect(visualMessage?.content).toContain("MiniCPM-V visual analysis completed.");
        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
        });
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        await writeMiniCpmDogfoodEvidence({
          scenario: "live Ambient/Pi typed ambient_visual_analyze MiniCPM-V screenshot analysis",
          commands: ["ambient_visual_analyze"],
          model: artifact.model,
          durationMs: artifact.latencyMs,
          summary: artifact.parsedOutput.summary,
          observations: artifact.parsedOutput.observations,
          limitations: artifact.parsedOutput.limitations,
          artifactPath: artifact.artifacts.previewJsonPath,
          image: {
            basename: artifact.image.basename,
            bytes: artifact.image.bytes,
            sha256: artifact.image.sha256,
          },
        });
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", ".ambient/vision/minicpm-v/state"],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    720_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V typed setup and analysis through the default managed runtime during a live Ambient/Pi chat turn",
    async () => {
      if (platform() !== "darwin" && platform() !== "linux") {
        throw new Error(`MiniCPM-V managed runtime dogfood is scoped to macOS/Linux, not ${platform()}.`);
      }
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V managed runtime dogfood.");

      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousEndpoint = process.env.AMBIENT_MINICPM_V_ENDPOINT;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_PORT = String(39_900 + Math.floor(Math.random() * 200));
      delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      delete process.env.AMBIENT_MINICPM_V_ENDPOINT;
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const artifactId = platform() === "darwin" ? "llama-cpp-macos-arm64-metal" : "llama-cpp-linux-x64-vulkan-nvidia";
      const imageDir = join(workspacePath, "minicpm-managed-typed-dogfood");
      const imagePath = join(imageDir, "ambient-main-shell.png");
      const artifactPath = ".ambient/minicpm-v-dogfood/typed-managed-main-shell-analysis.json";
      const validationPath = join(workspacePath, ".ambient", "vision", "minicpm-v", "validation.json");
      await mkdir(imageDir, { recursive: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), imagePath, { force: true });

      const thread = store.createThread("MiniCPM-V managed runtime typed visual dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V default managed runtime dogfood test.",
            "First call ambient_visual_minicpm_setup exactly once.",
            `Use action "repair", installRuntime true, runtimeArtifactId exactly ${JSON.stringify(artifactId)}, validationImagePath exactly "minicpm-managed-typed-dogfood/ambient-main-shell.png", and validationTask "ui_review".`,
            "Do not provide endpointUrl, runtimeBinaryPath, or runtimeArchivePath. The setup must use the default Ambient-managed runtime download path.",
            "After setup completes, call ambient_visual_analyze exactly once.",
            `Use imagePath exactly "minicpm-managed-typed-dogfood/ambient-main-shell.png", task "ui_review", outputJsonPath exactly ${JSON.stringify(artifactPath)}, and offline true.`,
            "Do not call ambient_cli, ambient_cli_search, ambient_cli_describe, shell, browser, or file tools.",
            "After both typed visual tools complete, answer with one short sentence containing MINICPM_MANAGED_TYPED_VISION_DOGFOOD_OK and at least two exact visible labels from the visual observations.",
            "Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        expect(transcript).toContain("MiniCPM-V visual provider setup completed.");
        expect(transcript).toContain("MiniCPM-V visual analysis completed.");
        expect(transcript).toContain("MINICPM_MANAGED_TYPED_VISION_DOGFOOD_OK");
        expect(transcript).toContain("New chat");
        expect(transcript).toContain("Ambient");
        expect(transcript).toContain(artifactPath);
        expect(transcript).not.toContain(imagePath);
        expect(transcript).not.toContain("data:image/png;base64");
        expect(transcript).not.toContain("Command: minicpm_vision_analyze");

        const setupMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_minicpm_setup");
        expect(setupMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_minicpm_setup",
          status: "done",
        });
        const visualMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_analyze");
        expect(visualMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_analyze",
          status: "done",
        });

        const validation = JSON.parse(await readFile(validationPath, "utf8"));
        expect(validation.runtimeInstall).toMatchObject({
          status: expect.stringMatching(/installed|already-installed/),
          source: "managed-download",
          artifactId,
          archiveSha256: expect.any(String),
          binarySha256: expect.any(String),
        });
        if (platform() === "darwin") {
          expect(validation.runtimeInstall.macosSecurity).toMatchObject({
            quarantineAfter: "not-present",
            codeSignature: "valid",
            defaultDownloadPromotion: "eligible",
            promotionPolicy: expect.stringMatching(/gatekeeper-accepted|ambient-managed-valid-signature/),
          });
        }

        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
        });
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        await writeMiniCpmDogfoodEvidence({
          scenario: "live Ambient/Pi typed MiniCPM-V setup plus visual analysis through default managed runtime download",
          commands: ["ambient_visual_minicpm_setup", "ambient_visual_analyze"],
          model: artifact.model,
          durationMs: artifact.latencyMs,
          summary: artifact.parsedOutput.summary,
          observations: artifact.parsedOutput.observations,
          limitations: artifact.parsedOutput.limitations,
          artifactPath: artifact.artifacts.previewJsonPath,
          image: {
            basename: artifact.image.basename,
            bytes: artifact.image.bytes,
            sha256: artifact.image.sha256,
          },
          runtimeInstall: {
            source: validation.runtimeInstall.source,
            status: validation.runtimeInstall.status,
            artifactId: validation.runtimeInstall.artifactId,
            archiveSha256: validation.runtimeInstall.archiveSha256,
            binarySha256: validation.runtimeInstall.binarySha256,
            downloadStatus: validation.runtimeInstall.downloadStatus,
            downloadBytes: validation.runtimeInstall.downloadBytes,
            macosSecurity: validation.runtimeInstall.macosSecurity,
          },
        });
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", ".ambient/vision/minicpm-v/state"],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_ENDPOINT", previousEndpoint);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    900_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V comparison through structured visual references during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V structured visual dogfood.");
      const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/Users/example/RCLI/deps/llama.cpp/build/bin/llama-server";
      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = llamaServer;
      process.env.AMBIENT_MINICPM_V_PORT = String(39_950 + Math.floor(Math.random() * 200));
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const imageDir = join(workspacePath, "minicpm-structured-dogfood");
      const currentPath = join(imageDir, "ambient-main-shell.png");
      const referencePath = join(imageDir, "ambient-project-board.png");
      const artifactPath = ".ambient/minicpm-v-dogfood/typed-comparison-analysis.json";
      await mkdir(imageDir, { recursive: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), currentPath, { force: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01a-project-board.png"), referencePath, { force: true });

      const thread = store.createThread("MiniCPM-V structured visual comparison dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V structured visual comparison dogfood test.",
            "Call ambient_visual_analyze exactly once.",
            "Use the structured image object and referenceImage object. Do not use imagePath or referenceImagePath.",
            `Use image {"path":"minicpm-structured-dogfood/ambient-main-shell.png","source":"browser_screenshot","label":"current main shell"}.`,
            `Use referenceImage {"path":"minicpm-structured-dogfood/ambient-project-board.png","source":"chat_attachment","label":"reference project board"}.`,
            `Use task "design_comparison", outputJsonPath exactly ${JSON.stringify(artifactPath)}, and offline true.`,
            "Do not call ambient_cli, ambient_cli_search, ambient_cli_describe, shell, browser, or file tools.",
            "After ambient_visual_analyze completes, answer with one short sentence containing MINICPM_TYPED_VISION_COMPARISON_OK and mention that two visual inputs were compared.",
            "Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        expect(transcript).toContain("MiniCPM-V visual analysis completed.");
        expect(transcript).toContain("MINICPM_TYPED_VISION_COMPARISON_OK");
        expect(transcript).toContain(artifactPath);
        expect(transcript).not.toContain(currentPath);
        expect(transcript).not.toContain(referencePath);
        expect(transcript).not.toContain("data:image/png;base64");
        expect(transcript).not.toContain("Command: minicpm_vision_analyze");

        const visualMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_analyze");
        expect(visualMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_analyze",
          status: "done",
        });
        expect(visualMessage?.content).toContain("Reference image: minicpm-structured-dogfood/ambient-project-board.png");
        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
        });
        expect(artifact.images).toHaveLength(2);
        expect(artifact.request.messages[0].content).toHaveLength(3);
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        expect(artifact.request.messages[0].content[2].image_url.url).toContain("<redacted sha256:");
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", ".ambient/vision/minicpm-v/state"],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    720_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V sampled video frames through the typed Ambient visual tool during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V typed video dogfood.");
      const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/Users/example/RCLI/deps/llama.cpp/build/bin/llama-server";
      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = llamaServer;
      process.env.AMBIENT_MINICPM_V_PORT = String(40_150 + Math.floor(Math.random() * 200));
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const videoDir = join(workspacePath, "minicpm-video-dogfood");
      const videoPath = join(videoDir, "ambient-main-shell.mp4");
      const artifactPath = ".ambient/minicpm-v-dogfood/typed-video-frame-analysis.json";
      await mkdir(videoDir, { recursive: true });
      await renderMiniCpmFixtureVideo(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), videoPath);

      const thread = store.createThread("MiniCPM-V typed video frame dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V typed visual tool video-frame dogfood test.",
            "Call ambient_visual_analyze exactly once.",
            "Use the structured video object. Do not use imagePath, videoPath, ambient_cli, shell, browser, or file tools.",
            `Use video {"path":"minicpm-video-dogfood/ambient-main-shell.mp4","source":"media_artifact","label":"main shell clip","frameTimestampMs":500}.`,
            `Use task "video_frame_review", outputJsonPath exactly ${JSON.stringify(artifactPath)}, and offline true.`,
            "After ambient_visual_analyze completes, answer with one short sentence containing MINICPM_TYPED_VISION_VIDEO_FRAME_OK and mention that a sampled video frame was inspected.",
            "Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        expect(transcript).toContain("MiniCPM-V visual analysis completed.");
        expect(transcript).toContain("MINICPM_TYPED_VISION_VIDEO_FRAME_OK");
        expect(transcript).toContain(artifactPath);
        expect(transcript).not.toContain(videoPath);
        expect(transcript).not.toContain("data:image/png;base64");
        expect(transcript).not.toContain("Command: minicpm_vision_analyze");

        const visualMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_analyze");
        expect(visualMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_analyze",
          status: "done",
        });
        expect(visualMessage?.content).toContain("Video: minicpm-video-dogfood/ambient-main-shell.mp4");
        expect(visualMessage?.content).toContain("frame 500ms");
        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
        });
        expect(artifact.images).toHaveLength(1);
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        await writeMiniCpmDogfoodEvidence({
          scenario: "live Ambient/Pi typed ambient_visual_analyze MiniCPM-V sampled video frame analysis",
          commands: ["ambient_visual_analyze"],
          model: artifact.model,
          durationMs: artifact.latencyMs,
          summary: artifact.parsedOutput.summary,
          observations: artifact.parsedOutput.observations,
          limitations: artifact.parsedOutput.limitations,
          artifactPath: artifact.artifacts.previewJsonPath,
          image: {
            basename: artifact.image.basename,
            bytes: artifact.image.bytes,
            sha256: artifact.image.sha256,
          },
        });
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", ".ambient/vision/minicpm-v/state"],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    720_000,
  );

  itLive(
    "returns an Ambient CLI preflight description when Pi tries to execute before describe",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Ambient CLI preflight dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await seedAmbientCliFixture(workspacePath);
      await installAmbientCliPackageSource(workspacePath, { source: "./cli-fixture" });
      await writeFile(join(workspacePath, "payload.json"), `${JSON.stringify({ message: "CLI_PREFLIGHT_VALUE" })}\n`, "utf8");
      const thread = store.createThread("CLI package preflight dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop CLI preflight dogfood test.",
          "Call ambient_cli first with packageName ambient-json-cli, command json-pick, and args payload.json and message.",
          "Do not call ambient_cli_search or ambient_cli_describe before that first ambient_cli call.",
          "If the first ambient_cli result says preflight-description or Ambient CLI preflight description, call ambient_cli one more time with the same packageName, command, and args.",
          "After the second ambient_cli completes, answer with exactly CLI_PREFLIGHT_DOGFOOD_OK and the exact extracted value.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("Ambient CLI preflight description");
      expect(transcript).toContain("Execution not run");
      expect(transcript).toContain("CLI_PREFLIGHT_DOGFOOD_OK");
      expect(transcript).toContain("CLI_PREFLIGHT_VALUE");
    },
    240_000,
  );

  itLive(
    "preserves long Ambient CLI arg input metadata from a live Ambient run",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Ambient CLI long arg dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await seedAmbientCliFixture(workspacePath);
      await installAmbientCliPackageSource(workspacePath, { source: "./cli-fixture" });
      const thread = store.createThread("CLI long arg display dogfood");
      const longText = "Ambient CLI long argument metadata dogfood. ".repeat(24);
      expect(longText.length).toBeGreaterThan(500);
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Ambient CLI long arg display dogfood test.",
          "First call ambient_cli_describe with packageName ambient-json-cli and command echo-arg.",
          `Then call ambient_cli with packageName ambient-json-cli, command echo-arg, and args exactly ["--text", ${JSON.stringify(longText)}].`,
          "Do not use browser, shell, read, write, or edit tools.",
          "After ambient_cli completes, answer with one short sentence containing CLI_LONG_ARG_DOGFOOD_OK and the ECHO_ARG_LENGTH value.",
        ].join("\n"),
      });

      const messages = store.listMessages(thread.id);
      const transcript = messages.map((message) => message.content).join("\n");
      const ambientCliMessage = messages.find(
        (message) => message.metadata?.toolName === "ambient_cli" && message.metadata?.toolLongformInputPreview,
      );
      const longformPreview = ambientCliMessage?.metadata?.toolLongformInputPreview as
        | { kind?: string; title?: string; items?: Array<{ fieldPath?: string; chars?: number; language?: string }> }
        | undefined;

      expect(transcript).toContain("CLI_LONG_ARG_DOGFOOD_OK");
      expect(transcript).toContain("ECHO_ARG_LENGTH=");
      expect(longformPreview).toMatchObject({
        kind: "longform-input",
        title: "Arguments",
        items: [
          {
            fieldPath: "args[1]",
            language: "text",
          },
        ],
      });
      expect(longformPreview?.items?.[0]?.chars).toBeGreaterThan(500);
    },
    240_000,
  );

  itLive(
    "installs Brave Search, binds secrets, and runs real searches during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Brave Search dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const braveApiKey = await readDogfoodSecret("BRAVE_API_KEY", "brave_api_key.txt");
      await writeFile(join(workspacePath, "brave_api_key.txt"), `${braveApiKey}\n`, "utf8");

      const emittedEvents: DesktopEvent[] = [];
      const permissionResolutions: Array<Omit<PermissionPromptResolution, "mode"> & { mode: PermissionPromptResolution["mode"] }> = [];
      const thread = store.createThread("Brave Search CLI dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request) => {
            const mode = request.toolName === "ambient_cli" ? "always_workspace" : "allow_once";
            permissionResolutions.push({ allowed: true, mode });
            return { allowed: true, mode };
          },
          denyThread: () => undefined,
        },
      );

      const source = "https://github.com/badlogic/pi-skills.git";
      const sha = "75d32a382b0c8aafce356d68e17d2dc94c0c953b";
      const descriptor = braveSearchDogfoodDescriptor();

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Brave Search CLI dogfood test.",
          `Use ambient_cli_package_preview with source ${source}, path ./brave-search, sha ${sha}, descriptor ${JSON.stringify(descriptor)}, and installDependencies=true.`,
          `Then use ambient_cli_package_install with source ${source}, path ./brave-search, sha ${sha}, the same descriptor, and installDependencies=true.`,
          "Then call ambient_cli_env_bind with packageName brave-search, envName BRAVE_API_KEY, and filePath ./brave_api_key.txt.",
          "Do not run ambient_cli in this turn.",
          "After the env binding succeeds, answer with exactly BRAVE_SEARCH_FILE_BOUND.",
        ].join("\n"),
      });

      let transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("BRAVE_SEARCH_FILE_BOUND");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Use the installed Brave Search Ambient CLI package to search the web.",
          "Call ambient_cli with packageName brave-search, command search, and args Ambient Desktop MCP plugin installation -n 2.",
          "After the tool result is available, answer with one short sentence containing BRAVE_SEARCH_FILE_OK and mention that search results were returned.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("BRAVE_SEARCH_FILE_OK");
      expect(transcript).toMatch(/Result 1|Title:|Link:/);

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now request the Desktop-owned secret dialog for the same installed Brave Search package.",
          "Call ambient_cli_secret_request with packageName brave-search and envName BRAVE_API_KEY.",
          "Do not ask me to paste the key into chat. Do not run ambient_cli in this turn.",
          "After the secret dialog request tool result is available, answer with exactly BRAVE_SECRET_DIALOG_REQUESTED.",
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("BRAVE_SECRET_DIALOG_REQUESTED");
      expect(emittedEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "ambient-cli-secret-requested",
            packageName: "brave-search",
            envName: "BRAVE_API_KEY",
          }),
        ]),
      );

      await saveAmbientCliPackageEnvSecret(workspacePath, {
        packageName: "brave-search",
        envName: "BRAVE_API_KEY",
        value: braveApiKey,
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "The Desktop secret dialog has been completed. Retry Brave Search now.",
          "Call ambient_cli with packageName brave-search, command search, and args Ambient Desktop secret dialog -n 2.",
          "After the tool result is available, answer with one short sentence containing BRAVE_SEARCH_SECRET_DIALOG_OK and mention that search results were returned.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      expect(transcript).toContain("BRAVE_SEARCH_SECRET_DIALOG_OK");
      expect(transcript).toMatch(/Result 1|Title:|Link:/);
      expect(transcript).not.toContain(braveApiKey);
      expect(JSON.stringify(audit)).not.toContain(braveApiKey);
      expect(permissionResolutions.length).toBeGreaterThanOrEqual(3);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_package_install", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_env_bind", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" }),
        ]),
      );
      expect(store.listPermissionGrants()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scopeKind: "workspace",
            actionKind: "plugin_tool_execute",
            targetKind: "tool",
            targetLabel: "Run Ambient CLI brave-search:search",
          }),
        ]),
      );
    },
    600_000,
  );

  itLive(
    "translates a Pi catalog arXiv package URL and runs a real lookup during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Pi catalog arXiv dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const permissionResolutions: Array<Omit<PermissionPromptResolution, "mode"> & { mode: PermissionPromptResolution["mode"] }> = [];
      const thread = store.createThread("Pi catalog arXiv dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            const mode = request.toolName === "ambient_cli" ? "always_workspace" : "allow_once";
            permissionResolutions.push({ allowed: true, mode });
            return { allowed: true, mode };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Pi catalog package dogfood test.",
          "Please install and use this package: https://pi.dev/packages/pi-arxiv?name=arxiv",
          "Resolve it as needed, then run a real arXiv search for diffusion policy robotics with at most 3 results.",
          "If the arXiv search endpoint reports rate limiting, use the same installed package to fetch arXiv paper 2303.04137 instead.",
          "After the tool result is available, answer with one short sentence containing PI_ARXIV_DOGFOOD_OK and one arXiv paper ID.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      if (process.env.AMBIENT_CLI_RLM_SUMMARIES === "1") {
        expect(transcript).toContain("Ambient CLI summary hydration");
      }
      expect(transcript).toContain("PI_ARXIV_DOGFOOD_OK");
      expect(transcript).toMatch(/\b\d{4}\.\d{4,5}(v\d+)?\b/);
      expect(transcript).toMatch(/diffusion|robot|policy|arxiv/i);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_package_install_pi_catalog", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" }),
        ]),
      );
      expect(permissionResolutions.length).toBeGreaterThanOrEqual(2);
    },
    600_000,
  );

  itLive(
    "installs and runs pi-arxiv through the sandboxed Pi extension host during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live sandboxed Pi extension dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const emittedEvents: DesktopEvent[] = [];
      const thread = store.createThread("Sandboxed Pi extension dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request) => {
            const mode = request.toolName === "ambient_pi_extension" ? "always_workspace" : "allow_once";
            return { allowed: true, mode };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop sandboxed Pi extension dogfood test.",
          "Install this package as a sandboxed Pi extension: https://pi.dev/packages/pi-arxiv?name=arxiv",
          "Then run its arxiv_paper tool for paper 2303.04137 using ambient_pi_extension.",
          "Then call ambient_pi_extension_uninstall_sandboxed with packageName pi-arxiv. Do not answer until uninstall is complete.",
          "Then call ambient_pi_extension_history and confirm pi-arxiv is in retained removed-package history.",
          "Then call ambient_pi_extension_clear_history and do not answer until the clear is complete.",
          "After history clear completes, answer with one short sentence containing PI_EXTENSION_SANDBOX_DOGFOOD_OK, Diffusion Policy, uninstalled, and history-cleared.",
          "Do not use browser, shell, or ambient_cli tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      const catalog = await discoverPiExtensionSandboxPackages(workspacePath);
      expect(transcript).toContain("PI_EXTENSION_SANDBOX_DOGFOOD_OK");
      expect(transcript).toContain("Diffusion Policy");
      expect(transcript).toContain("uninstalled");
      expect(transcript).toContain("history-cleared");
      expect(catalog.errors).toEqual([]);
      expect(catalog.packages).toEqual([]);
      expect(catalog.history).toEqual([]);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_extension_install_sandboxed", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_extension", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_extension_uninstall_sandboxed", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_extension_clear_history", decision: "allowed" }),
        ]),
      );
      expect(emittedEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "plugin-catalog-updated" })]));
    },
    600_000,
  );

  itLive(
    "routes pi-ffmpeg sandbox install failure into privileged disabled install during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live pi-ffmpeg fallback dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Pi ffmpeg fallback dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_pi_privileged_install" ||
              request.toolName === "ambient_pi_privileged_uninstall" ||
              request.toolName === "ambient_pi_privileged_clear_history"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during pi-ffmpeg fallback dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Pi extension fallback dogfood test.",
          "First call ambient_pi_extension_install_sandboxed with source https://pi.dev/packages/pi-ffmpeg?name=bet.",
          "If that tool reports privileged review required, call ambient_pi_privileged_install with source https://pi.dev/packages/pi-ffmpeg?name=bet and scanOrigin sandbox-fallback.",
          "Then call ambient_pi_privileged_uninstall with packageName pi-ffmpeg. Do not answer until uninstall is complete.",
          "Then call ambient_pi_privileged_history and confirm pi-ffmpeg is in retained removed-package history.",
          "Then call ambient_pi_privileged_clear_history and do not answer until the clear is complete.",
          "Do not run ffmpeg, activate the package, use browser tools, shell tools, or ambient_cli.",
          "After history clear completes, answer with one short sentence containing PI_FFMPEG_FALLBACK_DOGFOOD_OK, pi-ffmpeg, sandbox-fallback, uninstalled, and history-cleared.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      const catalog = await discoverPiPrivilegedPackages(workspacePath);
      expect(transcript).toContain("PI_FFMPEG_FALLBACK_DOGFOOD_OK");
      expect(transcript).toContain("pi-ffmpeg");
      expect(transcript).toContain("sandbox-fallback");
      expect(transcript).toContain("uninstalled");
      expect(transcript).toContain("history-cleared");
      expect(catalog.errors).toEqual([]);
      expect(catalog.packages).toEqual([]);
      expect(catalog.history).toEqual([]);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_install", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_uninstall", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_clear_history", decision: "allowed" }),
        ]),
      );
    },
    600_000,
  );

  itLive(
    "scans, privileged-installs disabled, and uninstalls context-mode during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live privileged Pi extension dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Privileged Pi extension dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName === "ambient_pi_privileged_install" || request.toolName === "ambient_pi_privileged_uninstall") {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during privileged Pi dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop privileged Pi extension dogfood test.",
          "Use ambient_pi_privileged_scan once for https://pi.dev/packages/context-mode.",
          "Then use ambient_pi_privileged_install once with source https://pi.dev/packages/context-mode.",
          "Then use ambient_pi_privileged_uninstall with packageName context-mode. Do not answer until the uninstall tool result is available.",
          "Do not try to activate it, run it, use browser tools, shell tools, or ambient_cli.",
          "After uninstall completes, answer with one short sentence containing PI_PRIVILEGED_DOGFOOD_OK, context-mode, and uninstalled.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      const catalog = await discoverPiPrivilegedPackages(workspacePath);
      expect(transcript).toContain("PI_PRIVILEGED_DOGFOOD_OK");
      expect(transcript).toContain("context-mode");
      expect(transcript).toContain("uninstalled");
      expect(catalog.errors).toEqual([]);
      expect(catalog.packages).toEqual([]);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_install", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_uninstall", decision: "allowed" }),
        ]),
      );
    },
    600_000,
  );
});
