import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { AgentRuntime } from "./agent-runtime/agentRuntime";
import { BrowserCredentialStore } from "./browser/browserCredentialStore";
import { BrowserService } from "./browser/browserService";
import { createMessagingBindingStore } from "./messaging/messagingBindings";
import { createDefaultMessagingProviderRegistry } from "./messaging/messagingGatewayRegistry";
import { ProjectStore } from "./projectStore/projectStore";
import { deterministicWavFixtureVoiceRunner } from "./voice/voiceRuntime";
import { AmbientPluginHost, codexPluginTrustFingerprint } from "./plugins/pluginHost";
import { ensureFirstPartyAmbientCliPackages, installAmbientCliPackageSource, runAmbientCliPackageCommand, saveAmbientCliPackageEnvSecret } from "./ambient-cli/ambientCliPackages";
import { discoverPiExtensionSandboxPackages } from "./agent-runtime/pi-package-tools/piExtensionSandboxPackages";
import { discoverPiPrivilegedPackages } from "./agent-runtime/pi-package-tools/piPrivilegedPackages";
import { registerCapabilityBuilderPackage, saveCapabilityBuilderEnvSecret, scaffoldCapabilityBuilderPackage, unregisterCapabilityBuilderPackage, validateCapabilityBuilderPackage } from "./capability-builder/capabilityBuilder";
import { setupQwen3AsrProvider } from "./stt/sttProviderInstaller";
import { writeVoiceDiscoveryCacheEntry } from "./voice/voiceDiscoveryCache";
import type { CodexPluginSummary, DesktopEvent, MediaPlaybackSettings, PermissionPromptResolution, PermissionPromptResponseMode, PermissionRequest, ProjectSummary, SearchRoutingSettings, SttSettings, VoiceProviderCandidate, VoiceSettings } from "../shared/types";
import {
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
  buildGeneratedCapabilityRemovalPlanPrompt,
  buildGeneratedCapabilityUpdatePlanPrompt,
} from "../renderer/src/pluginUiModel";
import { providerCatalogSettingsState } from "./provider/providerCatalog";

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
const itTelegramOwnerLoopLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" && process.env.AMBIENT_TELEGRAM_OWNER_LOOP_LIVE === "1" ? it : it.skip;
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
      expect(result.content[0].text).toContain(`cwd: ${join(workspacePath, "plugins", "ambient-fixture")}`);
    } finally {
      await host.shutdownPluginMcpServers();
    }
  });

  itLive("invokes a trusted fixture Codex MCP plugin during a live Ambient/Pi chat turn", async () => {
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
  }, 360_000);

  itLive("keeps directly named provider cards during contextual live Ambient/Pi catalog lookups", async () => {
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
  }, 300_000);

  itLive("queries provider catalog recommendation memos during live Ambient/Pi chat turns", async () => {
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
  }, 1_080_000);

  itHyperframesLive("discovers, describes, and uses bundled HyperFrames through live Ambient/Pi", async () => {
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

      const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
  }, 360_000);

  itLive("queries MiniCPM-V visual-understanding provider catalog during a live Ambient/Pi chat turn", async () => {
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
  }, 240_000);

  itLive("queries voice-recognition provider catalog with Linux faster-whisper evidence", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live voice-recognition provider catalog dogfood.");
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
  }, 240_000);

  itLive("uses provider-selection bootstrap reminder before recommending a provider", async () => {
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
  }, 240_000);

  itLive("plans settings-launched provider catalog onboarding through live Ambient/Pi", async () => {
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
  }, 300_000);

  itLive("plans settings-launched STT and search provider catalog onboarding through live Ambient/Pi", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live provider catalog STT/search settings dogfood.");
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
  }, 360_000);

  itLive("starts catalog-backed first-run capability onboarding through live Ambient/Pi", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live first-run capability onboarding dogfood.");
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
  }, 240_000);

  itLive("lists messaging gateway providers, bindings, inventory, and runtime surfaces during a live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live messaging gateway dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Messaging gateway dogfood");
    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "dogfood-owner",
        phoneNumber: "+15550000000",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-dogfood-key",
      }, null, 2),
      "utf8",
    );
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during messaging gateway dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is an Ambient Desktop messaging gateway dogfood test.",
          "Call ambient_messaging_list_providers.",
          "Then call ambient_messaging_list_bindings.",
          "Then call ambient_messaging_headless_ux_inventory.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Then call ambient_messaging_telegram_session_preview with action start_auth, providerId telegram-tdlib, profileId dogfood-owner, and phoneNumber +15550000000. Do not call ambient_messaging_telegram_session_apply.",
          "Then call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId dogfood-owner, conversationId dogfood-conversation, ownerUserId owner-dogfood, ambientSurface workflow_agents, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields.",
          "Then call ambient_messaging_list_bindings with providerId telegram-tdlib and purpose remote_ambient_surface.",
          "Then call ambient_messaging_gateway_status.",
          "Then call ambient_messaging_telegram_remote_surface_apply with action revoke, the bindingId from the create result, and reason dogfood cleanup.",
          "Then call ambient_messaging_list_bindings with providerId telegram-tdlib, purpose remote_ambient_surface, and includeInactive true.",
          "Do not call shell, browser, bridge event route, remote surface command preview/apply, provider bridge lifecycle, bridge poll, synthetic route, generic binding apply, install, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_DOGFOOD_OK and include the provider id telegram-tdlib, the phrase session bootstrap, the phrase typed remote surface binding, the phrase runtime surface inventory, and the phrase gateway status.",
        ],
        expected: "MESSAGING_GATEWAY_DOGFOOD_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_list_providers completed");
    expect(transcript).toContain("ambient_messaging_list_bindings completed");
    expect(transcript).toContain("ambient_messaging_headless_ux_inventory completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("ambient_messaging_telegram_session_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_gateway_status completed");
    expect(transcript).toContain("telegram-tdlib");
    expect(transcript).toContain("session bootstrap");
    expect(transcript).toContain("typed remote surface binding");
    expect(transcript).toContain("runtime surface inventory");
    expect(transcript).toContain("gateway status");
  }, 840_000);

  itLive("defers Remote Ambient Surface project switches during a live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live project-switch dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Remote project switch dogfood");
    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "project-switch-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "project-switch-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "project-switch-dogfood-owner",
        phoneNumber: "+15550000000",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-project-switch-dogfood-key",
      }, null, 2),
      "utf8",
    );

    const createdProjectSummaries: ProjectSummary[] = [];
    let scheduledProjectSwitchPath: string | undefined;
    const activeProjectSummary = (): ProjectSummary => {
      const workspace = store.getWorkspace();
      const threads = store.listThreads();
      const timestamps = threads.flatMap((item) => [item.createdAt, item.updatedAt]).filter(Boolean);
      const fallbackTime = new Date(0).toISOString();
      return {
        id: workspace.path,
        path: workspace.path,
        name: workspace.name,
        statePath: workspace.statePath,
        sessionPath: workspace.sessionPath,
        createdAt: timestamps.length ? timestamps.reduce((earliest, item) => (item < earliest ? item : earliest)) : fallbackTime,
        updatedAt: timestamps.length ? timestamps.reduce((latest, item) => (item > latest ? item : latest)) : fallbackTime,
        threads,
      };
    };
    const createDogfoodProject = (input: { name?: string; workspacePath?: string; reason: string }): ProjectSummary => {
      const name = input.name?.trim() || "Focused switch project";
      const projectPath = input.workspacePath?.trim() || join(workspacePath, ".dogfood-projects", name.replace(/[/:\\]/g, "-"));
      const projectStore = new ProjectStore();
      try {
        const workspace = projectStore.openWorkspace(projectPath);
        const threads = projectStore.listThreads();
        const timestamps = threads.flatMap((item) => [item.createdAt, item.updatedAt]).filter(Boolean);
        const fallbackTime = new Date(0).toISOString();
        const summary: ProjectSummary = {
          id: workspace.path,
          path: workspace.path,
          name,
          statePath: workspace.statePath,
          sessionPath: workspace.sessionPath,
          createdAt: timestamps.length ? timestamps.reduce((earliest, item) => (item < earliest ? item : earliest)) : fallbackTime,
          updatedAt: timestamps.length ? timestamps.reduce((latest, item) => (item > latest ? item : latest)) : fallbackTime,
          threads,
        };
        createdProjectSummaries.unshift(summary);
        return summary;
      } finally {
        projectStore.close();
      }
    };

    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during project-switch dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
      {
        projects: {
          listProjects: () => [activeProjectSummary(), ...createdProjectSummaries],
          createProject: (input) => createDogfoodProject(input),
          switchProject: (input) => {
            scheduledProjectSwitchPath = input.workspacePath;
          },
        },
      },
    );

    let transcript = "";
    let postSwitchTranscript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface deferred project-switch dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId project-switch-dogfood-owner, conversationId project-switch-dogfood-conversation, ownerUserId project-switch-owner, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId project-switch-dogfood-owner, conversationId project-switch-dogfood-conversation, messageId project-switch-dogfood-message-1, senderId project-switch-owner, senderLabel Owner, and text create project Focused switch project.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the first bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that first queuedProjectionId. This should create an Ambient project after approval.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId project-switch-dogfood-owner, conversationId project-switch-dogfood-conversation, messageId project-switch-dogfood-message-2, senderId project-switch-owner, senderLabel Owner, and text switch project Focused switch project.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the second bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that second queuedProjectionId. This should schedule an active Ambient project switch because this tool is running inside an active Pi turn.",
          "Then call ambient_messaging_gateway_status and verify there is a pending Remote Ambient Surface active project switch event for Focused switch project.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, synthetic route, generic binding apply, install, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PROJECT_SWITCH_DEFERRED_OK and include the phrases create project Focused switch project, switch project Focused switch project, Remote Ambient Surface command apply, Scheduled active project switch, pending project switch event, and gateway status.",
        ],
        expected: "MESSAGING_GATEWAY_PROJECT_SWITCH_DEFERRED_OK",
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      postSwitchTranscript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is the post-turn check for the focused Remote Ambient Surface project-switch dogfood test.",
          "Call ambient_messaging_gateway_status and verify the recent Remote Ambient Surface runtime events include a completed active project switch event for Focused switch project.",
          "Then call ambient_messaging_remote_surface_reply_preview with only the completed active project switch runtimeEventId from gateway status. Do not provide providerId, queuedProjectionId, replyToMessageId, or text; Ambient should generate the exact provider-neutral runtime event relay text.",
          "Do not call ambient_messaging_remote_surface_reply_apply, provider bridge lifecycle, bridge poll, bridge event route, shell, browser, generic binding apply, install, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PROJECT_SWITCH_COMPLETED_OK and include the phrases completed project switch event, runtime event relay preview, and Ambient switched the active project to Focused switch project.",
        ],
        expected: "MESSAGING_GATEWAY_PROJECT_SWITCH_COMPLETED_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(scheduledProjectSwitchPath).toContain("Focused switch project");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("Scheduled active project switch");
    expect(transcript).toContain("pending project switch event");
    expect(transcript).toContain("gateway status");
    expect(postSwitchTranscript).toContain("ambient_messaging_gateway_status completed");
    expect(postSwitchTranscript).toContain("ambient_messaging_remote_surface_reply_preview completed");
    expect(postSwitchTranscript).toContain("completed project switch event");
    expect(postSwitchTranscript).toContain("runtime event relay preview");
    expect(postSwitchTranscript).toContain("Ambient switched the active project to Focused switch project");
  }, 480_000);

  itLive("surfaces Telegram relay repair steps during a focused live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram relay repair dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Telegram relay repair dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Telegram relay repair dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "This is a focused Telegram relay repair dogfood test.",
        "Call exactly ambient_messaging_telegram_bridge_reply_preview with runtimeEventId remote-surface-missing-dogfood.",
        "The result should be blocked and should include Repair steps telling you to use an exact current runtimeEventId from ambient_messaging_gateway_status.",
        "Do not call ambient_messaging_telegram_bridge_reply_apply, lifecycle tools, shell, browser, install, or send-message tools.",
        "After checking the tool result, answer with exactly TELEGRAM_RELAY_REPAIR_STEPS_OK and include the phrases repair steps and current runtimeEventId.",
      ],
      expected: "TELEGRAM_RELAY_REPAIR_STEPS_OK",
    });

    expect(transcript).toContain("ambient_messaging_telegram_bridge_reply_preview completed");
    expect(transcript).toMatch(/Repair steps|repair steps/);
    expect(transcript).toContain("current runtimeEventId");
  }, 240_000);

  itLive("surfaces provider-neutral relay status for completed Telegram runtime events during a live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live provider-neutral relay status dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Telegram provider-neutral relay status dogfood");
    const binding = createMessagingBindingStore({
      stateRoot: store.getWorkspace().statePath,
      providers: createDefaultMessagingProviderRegistry(),
    }).create({
      providerId: "telegram-tdlib",
      authProfileId: "dogfood-relay-owner",
      conversationId: "telegram-relay-status-dogfood-conversation",
      purpose: "remote_ambient_surface",
      ownerUserId: "telegram-relay-status-owner",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
    }).binding;
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during provider-neutral relay status dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
      registerTool: (tool: any) => registeredTools.push(tool),
    });
    const route = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_event_route");
    if (!route) throw new Error("Missing Telegram bridge event route tool in relay status dogfood setup.");
    const routed = await route.execute("telegram-relay-status-route", {
      profileId: "dogfood-relay-owner",
      conversationId: "telegram-relay-status-dogfood-conversation",
      messageId: "telegram-relay-status-command-message",
      senderId: "telegram-relay-status-owner",
      senderLabel: "Telegram Owner",
      text: "switch project Relay status project",
    });
    const queuedProjectionId = routed.details.queuedProjection.id;
    const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
      kind: "active_project_switch",
      status: "completed",
      title: "Switch to Relay status project",
      summary: "Active Ambient project switched to Relay status project.",
      threadId: thread.id,
      queuedProjectionId,
      sourceEventId: "telegram-dogfood-relay-status-source-event",
      bindingId: binding.id,
      projectName: "Relay status project",
      completedAt: "2026-05-10T00:00:04.000Z",
      relaySuggested: true,
    });
    const unsupportedRuntimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
      kind: "active_project_switch",
      status: "completed",
      title: "Switch to Unsupported provider project",
      summary: "Active Ambient project switched to Unsupported provider project.",
      threadId: thread.id,
      queuedProjectionId: "projection-dogfood-unsupported-provider",
      sourceEventId: "telegram-dogfood-relay-owner-telegram-relay-status-dogfood-conversation-unsupported-provider-message",
      bindingId: binding.id,
      projectName: "Unsupported provider project",
      completedAt: "2026-05-10T00:00:05.000Z",
      relayProviderId: "matrix-bridge",
      relaySuggested: true,
    });

    const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "This is a focused provider-neutral Remote Ambient Surface relay status dogfood test.",
        `An active Telegram Remote Ambient Surface binding already exists with bindingId ${binding.id}, profileId dogfood-relay-owner, conversationId telegram-relay-status-dogfood-conversation, and ownerUserId telegram-relay-status-owner.`,
        `A completed Telegram Remote Ambient Surface runtime event already exists with runtimeEventId ${runtimeEvent.id} and queuedProjectionId ${queuedProjectionId}.`,
        `A completed unsupported-provider Remote Ambient Surface runtime event also exists with runtimeEventId ${unsupportedRuntimeEvent.id}, relayProviderId matrix-bridge, and no reviewed reply adapter.`,
        "Call ambient_messaging_gateway_status and verify the Telegram runtime event includes Relay action status: preview-ready, Duplicate blocked: no, target provider Telegram, Provider-neutral relay preview command, Provider-neutral relay apply command, and Provider repair diagnostics command. Also verify the unsupported-provider runtime event is repair-needed and names ambient_messaging_remote_surface_reply_preview as the preview command but no apply command.",
        "Then call ambient_runtime_surface_snapshot with limit 5 and verify Relay summaries include the same provider-neutral relay next action.",
        `Then call ambient_messaging_remote_surface_reply_preview with runtimeEventId ${runtimeEvent.id} only. Do not provide providerId, queuedProjectionId, replyToMessageId, or text; Ambient must resolve Telegram internally and generate the exact runtime event relay text.`,
        `Then call ambient_messaging_remote_surface_reply_preview with runtimeEventId ${unsupportedRuntimeEvent.id} only. It must be blocked, mention provider matrix-bridge is unsupported, and surface Repair steps.`,
        "Do not call ambient_messaging_telegram_bridge_reply_apply, lifecycle tools, polling tools, shell, browser, provider CLI, generic binding tools, install tools, or external messaging tools.",
        "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PROVIDER_NEUTRAL_RELAY_STATUS_OK and include the phrases provider-neutral relay summary, preview-ready, repair-needed, matrix-bridge, Duplicate blocked: no, Provider-neutral relay preview command, Provider-neutral relay apply command, Provider repair diagnostics command, Relay summaries, runtime event relay preview, unsupported provider repair, and Repair steps.",
      ],
      expected: "MESSAGING_GATEWAY_PROVIDER_NEUTRAL_RELAY_STATUS_OK",
    });

    expect(transcript).toContain("ambient_messaging_gateway_status completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_reply_preview completed");
    expect(transcript).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
    expect(transcript).toContain("Relay action status: preview-ready");
    expect(transcript).toContain("Duplicate blocked: no");
    expect(transcript).toContain("Provider-neutral relay preview command:");
    expect(transcript).toContain("Provider-neutral relay apply command:");
    expect(transcript).toContain("Provider repair diagnostics command:");
    expect(transcript).toContain("Relay summaries");
    expect(transcript).toContain("Ambient switched the active project to Relay status project.");
    expect(transcript).toContain("provider-neutral relay summary");
    expect(transcript).toContain("repair-needed");
    expect(transcript).toContain("matrix-bridge");
    expect(transcript).toContain("Provider matrix-bridge has no reviewed Remote Ambient Surface reply adapter");
    expect(transcript).toContain("Repair steps:");
    expect(transcript).toContain("unsupported provider repair");
  }, 240_000);

  itLive("uses actionable headless runtime UX inventory without renderer-only command guesses", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live headless runtime inventory dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Headless runtime command inventory dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during headless runtime inventory dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "This is a focused Ambient headless runtime UX inventory dogfood test.",
        "Call ambient_messaging_headless_ux_inventory exactly once.",
        "Do not call shell, browser, lifecycle, bridge, polling, reply, binding apply, command preview/apply, install, or send-message tools.",
        "After checking the tool result, answer starting with HEADLESS_RUNTIME_COMMAND_INVENTORY_OK and include the phrases Remote Ambient Surface command lane, Settings catalog, voice.output ready, search.preference ready, model-mode.mode ready, model-mode.planner ready, workflow.exploration.run ready, workflow.compile.preview ready, workflow.review.approve ready, workflow.review.reject ready, workflow.run.cancel ready, workflow.recovery.retry ready, workflow.recovery.resume ready, workflow.recovery.skip ready, settings.thread.update, settings.planner.update, approval.respond ready, approval.grants.revoke ready, messaging.remote.activation.plan ready, messaging.remote.provider-support.plan ready, messaging.telegram.activation.plan ready, messaging.polling.status ready, messaging.polling.once ready, messaging.polling.start ready, messaging.polling.stop ready, speech.provider partial, speech.input ready, speech.language ready, settings.speech.update, media.generated ready, settings.media.update, ambient_messaging_remote_surface_command_preview, ambient_messaging_remote_surface_command_apply, ambient_messaging_remote_surface_activation_plan, ambient_messaging_remote_surface_provider_support_plan, ambient_messaging_telegram_owner_loop_activation_plan, ambient_messaging_telegram_bridge_polling_preview, ambient_messaging_telegram_bridge_polling_apply, ambient_messaging_telegram_bridge_polling_status, create project Field Notes, create workflow Track the Remote Ambient Surface gateway status, create chat Remote triage, set up remote control, set up Telegram remote control, plan Signal remote control support, activate Telegram owner loop, start Telegram owner polling, stop Telegram owner polling, check Telegram once for my command, run exploration, compile from exploration, approve workflow preview, reject workflow preview, cancel workflow, retry failed step, resume checkpoint, skip failed item, approve request 1, revoke grant 1, set voice mode off, set chat mode planner, set planner autoFinalize off, set speech language English, set generated media autoplay on, and ambient_messaging_gateway_status.",
      ],
      expected: "HEADLESS_RUNTIME_COMMAND_INVENTORY_OK",
    });

    expect(transcript).toContain("ambient_messaging_headless_ux_inventory completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply");
    expect(transcript).toContain("Settings catalog");
    expect(transcript).toContain("voice.output");
    expect(transcript).toContain("search.preference");
    expect(transcript).toContain("model-mode.mode");
    expect(transcript).toContain("model-mode.planner");
    expect(transcript).toContain("workflow.exploration.run");
    expect(transcript).toContain("workflow.compile.preview");
    expect(transcript).toContain("workflow.review.approve");
    expect(transcript).toContain("workflow.review.reject");
    expect(transcript).toContain("workflow.run.cancel");
    expect(transcript).toContain("workflow.recovery.retry");
    expect(transcript).toContain("workflow.recovery.resume");
    expect(transcript).toContain("workflow.recovery.skip");
    expect(transcript).toContain("messaging.remote.activation.plan");
    expect(transcript).toContain("messaging.remote.provider-support.plan");
    expect(transcript).toContain("messaging.telegram.activation.plan");
    expect(transcript).toContain("ambient_messaging_remote_surface_activation_plan");
    expect(transcript).toContain("ambient_messaging_remote_surface_provider_support_plan");
    expect(transcript).toContain("ambient_messaging_telegram_owner_loop_activation_plan");
    expect(transcript).toContain("messaging.polling.status");
    expect(transcript).toContain("messaging.polling.once");
    expect(transcript).toContain("messaging.polling.start");
    expect(transcript).toContain("messaging.polling.stop");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_preview");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_apply");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_status");
    expect(transcript).toContain("settings.thread.update");
    expect(transcript).toContain("settings.planner.update");
    expect(transcript).toContain("approval.respond");
    expect(transcript).toContain("approval.grants.revoke");
    expect(transcript).toContain("speech.provider");
    expect(transcript).toContain("speech.input");
    expect(transcript).toContain("speech.language");
    expect(transcript).toContain("settings.speech.update");
    expect(transcript).toContain("media.generated");
    expect(transcript).toContain("settings.media.update");
    expect(transcript).toContain("create project Field Notes");
    expect(transcript).toContain("create workflow Track the Remote Ambient Surface gateway status");
    expect(transcript).toContain("create chat Remote triage");
    expect(transcript).toContain("set up remote control");
    expect(transcript).toContain("set up Telegram remote control");
    expect(transcript).toContain("activate Telegram owner loop");
    expect(transcript).toContain("start Telegram owner polling");
    expect(transcript).toContain("stop Telegram owner polling");
    expect(transcript).toContain("check Telegram once for my command");
    expect(transcript).toContain("run exploration");
    expect(transcript).toContain("compile from exploration");
    expect(transcript).toContain("approve workflow preview");
    expect(transcript).toContain("reject workflow preview");
    expect(transcript).toContain("cancel workflow");
    expect(transcript).toContain("retry failed step");
    expect(transcript).toContain("resume checkpoint");
    expect(transcript).toContain("skip failed item");
    expect(transcript).toContain("approve request 1");
    expect(transcript).toContain("revoke grant 1");
    expect(transcript).toContain("set voice mode off");
    expect(transcript).toContain("set chat mode planner");
    expect(transcript).toContain("set planner autoFinalize off");
    expect(transcript).toContain("set speech language English");
    expect(transcript).toContain("set generated media autoplay on");
    expect(transcript).toContain("ambient_messaging_gateway_status");
    expect(transcript).not.toContain("ambient_project_create");
    expect(transcript).not.toContain("ambient_workflow_create");
    expect(transcript).not.toContain("ambient_chat_create");
    expect(transcript).not.toContain("ambient_settings_update");
    expect(transcript).not.toContain("ambient_runtime_status");
  }, 180_000);

  itLive("uses Telegram owner-loop activation plan before low-level setup tools", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram owner-loop activation plan dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    const originalFetch = globalThis.fetch;
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19133";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "activation-plan-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "activation-plan-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "activation-plan-owner",
        phoneNumber: "+15550000999",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-activation-plan-key",
      }, null, 2),
      "utf8",
    );
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl);
      if (url.origin === "http://127.0.0.1:19133" && url.pathname === "/") {
        return new Response(
          JSON.stringify({
            ok: true,
            stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
            sessionCount: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.origin !== "http://127.0.0.1:19133") {
        return originalFetch(input, init);
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const thread = store.createThread("Telegram owner-loop activation plan dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Telegram owner-loop activation plan dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient Telegram owner-loop activation planning dogfood test.",
          "Call ambient_messaging_telegram_owner_loop_activation_plan exactly once with profileId activation-plan-owner, setupCode AMBIENT-OWNER-LOOP-ACTIVATION-DOGFOOD, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and minReceivedAt 2026-05-10T00:00:06.000Z.",
          "Do not call lifecycle, directory, owner handoff, binding preview/apply, polling, gateway status, command preview/apply, relay, shell, browser, Telegram Desktop UI, provider CLI, install, or send-message tools.",
          "After checking the tool result, answer starting with TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_OK and include the phrases Telegram owner-loop activation plan, provider-readiness, metadata-directory, owner-handoff, owner-binding, periodic-polling, command-and-relay-preview, no provider message reads, no Telegram Desktop fallback, and minReceivedAt.",
        ],
        expected: "TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_OK",
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_owner_loop_activation_plan completed");
    expect(transcript).toContain("Telegram owner-loop activation plan");
    expect(transcript).toContain("provider-readiness");
    expect(transcript).toContain("metadata-directory");
    expect(transcript).toContain("owner-handoff");
    expect(transcript).toContain("owner-binding");
    expect(transcript).toContain("periodic-polling");
    expect(transcript).toContain("command-and-relay-preview");
    expect(transcript).toContain("Reads provider messages: no");
    expect(transcript).toContain("minReceivedAt");
    expect(transcript).not.toContain("ambient_messaging_telegram_conversation_directory_apply completed");
    expect(transcript).not.toContain("ambient_messaging_telegram_owner_handoff_apply completed");
    expect(transcript).not.toContain("ambient_messaging_telegram_bridge_polling_apply completed");
  }, 180_000);

  itLive("routes ordinary Remote Ambient Surface setup through product shortcut before Telegram plan", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface shortcut dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    const originalFetch = globalThis.fetch;
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19136";
    const profileId = "remote-shortcut-owner";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", profileId, "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", profileId, "bridge-session.json"),
      JSON.stringify({
        profileId,
        phoneNumber: "+15550001002",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-remote-shortcut-key",
      }, null, 2),
      "utf8",
    );
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.origin === "http://127.0.0.1:19136" && url.pathname === "/") {
        return new Response(
          JSON.stringify({
            ok: true,
            stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
            sessionCount: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.origin !== "http://127.0.0.1:19136") {
        return originalFetch(input, init);
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const thread = store.createThread("Remote Ambient Surface shortcut dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface shortcut dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          buildRemoteSurfaceActivationPrompt("telegram"),
          "",
          "Dogfood constraint: this is the Settings Remote control Telegram route-ready entrypoint.",
          "For the Telegram plan use profileId remote-shortcut-owner, setupCode AMBIENT-OWNER-LOOP-SHORTCUT-DOGFOOD, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and minReceivedAt 2026-05-10T00:00:06.000Z.",
          "Do not call lifecycle, directory, owner handoff, binding preview/apply, polling, gateway status, command preview/apply, relay, shell, browser, Telegram Desktop UI, provider CLI, install, or send-message tools.",
          "After checking the tool results, answer starting with REMOTE_SURFACE_ACTIVATION_SHORTCUT_OK and include the phrases Remote Ambient Surface activation, activation plan first tool, Telegram owner-loop activation plan, no provider message reads, preview before send, and no generic Messaging Connector fallback.",
        ],
        expected: "REMOTE_SURFACE_ACTIVATION_SHORTCUT_OK",
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    const shortcutIndex = transcript.indexOf("ambient_messaging_remote_surface_activation_plan completed");
    const telegramPlanIndex = transcript.indexOf("ambient_messaging_telegram_owner_loop_activation_plan completed");
    expect(shortcutIndex).toBeGreaterThanOrEqual(0);
    expect(telegramPlanIndex).toBeGreaterThan(shortcutIndex);
    expect(transcript).toContain("Remote Ambient Surface activation");
    expect(transcript).toContain("Activation plan first tool: ambient_messaging_telegram_owner_loop_activation_plan");
    expect(transcript).toContain("Telegram owner-loop activation plan");
    expect(transcript).toContain("Reads provider messages: no");
    expect(transcript).toContain("preview before send");
    expect(transcript).not.toContain("ambient_messaging_gateway_lifecycle_apply completed");
    expect(transcript).not.toContain("ambient_messaging_telegram_conversation_directory_apply completed");
    expect(transcript).not.toContain("ambient_messaging_telegram_owner_handoff_apply completed");
    expect(transcript).not.toContain("ambient_messaging_telegram_bridge_polling_apply completed");
  }, 180_000);

  itLive("routes unsupported Remote Ambient Surface setup through product repair card", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live unsupported Remote Ambient Surface shortcut dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Remote Ambient Surface unsupported-provider dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during unsupported Remote Ambient Surface shortcut dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        buildRemoteSurfaceActivationPrompt("signal"),
        "",
        "Dogfood constraint: this is the Settings Remote control unsupported-provider entrypoint.",
        "Do not call ambient_messaging_telegram_owner_loop_activation_plan, Signal low-level tools, lifecycle, directory, owner handoff, binding preview/apply, polling, gateway status, command preview/apply, relay, shell, browser, Signal Desktop UI, signal-cli, provider CLI, install, send-message tools, generic Messaging Connector setup, or external messaging tools.",
        "After checking the tool result, answer starting with REMOTE_SURFACE_UNSUPPORTED_PROVIDER_OK and include the phrases Remote Ambient Surface activation, unsupported_provider, Signal, No reviewed Remote Ambient Surface activation shortcut exists for Signal, no generic Messaging Connector fallback, no provider message reads, and no provider sends.",
      ],
      expected: "REMOTE_SURFACE_UNSUPPORTED_PROVIDER_OK",
    });

    expect(transcript).toContain("ambient_messaging_remote_surface_activation_plan completed");
    expect(transcript).toContain("Status: unsupported_provider");
    expect(transcript).toContain("Requested provider: Signal");
    expect(transcript).toContain("No reviewed Remote Ambient Surface activation shortcut exists for Signal");
    expect(transcript).toContain("no generic Messaging Connector fallback");
    expect(transcript).toContain("Reads provider messages: no");
    expect(transcript).toContain("Sends provider messages: no");
    expect(transcript).not.toContain("ambient_messaging_telegram_owner_loop_activation_plan completed");
    expect(transcript).not.toContain("ambient_messaging_signal_conversation_directory_preview completed");
    expect(transcript).not.toContain("ambient_messaging_signal_owner_handoff_preview completed");
    expect(transcript).not.toContain("ambient_messaging_signal_remote_surface_preview completed");
    expect(transcript).not.toContain("ambient_messaging_gateway_lifecycle_apply completed");
    expect(transcript).not.toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).not.toContain("ambient_messaging_remote_surface_reply_preview completed");
  }, 180_000);

  itLive("plans unsupported Remote Ambient Surface provider support without provider improvisation", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface provider-support dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Remote Ambient Surface provider-support planning dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface provider-support dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        buildRemoteSurfaceActivationPrompt("signal"),
        "",
        "Dogfood constraint: this is the unsupported-provider Plan provider support card action, not active Signal activation.",
        "First call ambient_messaging_remote_surface_activation_plan with requestText exactly: set up Signal remote control for Ambient Desktop projects.",
        "After it returns unsupported_provider, call ambient_messaging_remote_surface_provider_support_plan with provider exactly Signal, ambientSurface projects, and blockerContext from the activation result.",
        "Do not call ambient_messaging_telegram_owner_loop_activation_plan, Signal low-level tools, lifecycle, directory, owner handoff, binding preview/apply, polling, gateway status, command preview/apply, relay, shell, browser, Signal Desktop UI, signal-cli, provider CLI, install, scaffold, send-message tools, generic Messaging Connector setup, or external messaging tools.",
        "After checking both tool results, answer starting with REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_OK and include the phrases provider onboarding/planning, reviewed adapter, owner-auth constraints, headless support, approval gates, validation targets, Signal Desktop being installed is not an activation route, no provider message reads, no provider sends, no dependency installation, and no generic Messaging Connector fallback.",
      ],
      expected: "REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_OK",
    });

    const activationIndex = transcript.indexOf("ambient_messaging_remote_surface_activation_plan completed");
    const providerSupportIndex = transcript.indexOf("ambient_messaging_remote_surface_provider_support_plan completed");
    expect(activationIndex).toBeGreaterThanOrEqual(0);
    expect(providerSupportIndex).toBeGreaterThan(activationIndex);
    expect(transcript).toContain("Status: unsupported_provider");
    expect(transcript).toContain("Remote Ambient Surface provider support plan");
    expect(transcript).toContain("Status: planning_ready");
    expect(transcript).toContain("Owner-auth constraints:");
    expect(transcript).toContain("Headless support requirements:");
    expect(transcript).toContain("Approval gates:");
    expect(transcript).toContain("Validation targets:");
    expect(transcript).toContain("Signal Desktop being installed is not an activation route");
    expect(transcript).toContain("Reads provider messages: no");
    expect(transcript).toContain("Sends provider messages: no");
    expect(transcript).toContain("Installs dependencies: no");
    expect(transcript).toContain("Scaffolds provider support: no");
    expect(transcript).toContain("no generic Messaging Connector fallback");
    expect(transcript).not.toContain("ambient_messaging_telegram_owner_loop_activation_plan completed");
    expect(transcript).not.toContain("ambient_messaging_signal_conversation_directory_preview completed");
    expect(transcript).not.toContain("ambient_messaging_signal_owner_handoff_preview completed");
    expect(transcript).not.toContain("ambient_messaging_signal_remote_surface_preview completed");
    expect(transcript).not.toContain("ambient_messaging_gateway_lifecycle_apply completed");
    expect(transcript).not.toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).not.toContain("ambient_messaging_remote_surface_reply_preview completed");
  }, 180_000);

  itLive("drives Telegram owner-loop activation plan through periodic polling without provider send", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram owner-loop activation flow dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    const originalFetch = globalThis.fetch;
    const profileId = "activation-flow-owner";
    const conversationId = "activation-flow-chat";
    const setupCode = "AMBIENT-OWNER-LOOP-ACTIVATION-FLOW";
    const commandFreshness = "2026-05-10T00:00:03.000Z";
    let unreadCallCount = 0;
    const sentMessages: unknown[] = [];
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19134";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", profileId, "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", profileId, "bridge-session.json"),
      JSON.stringify({
        profileId,
        phoneNumber: "+15550001000",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-activation-flow-key",
      }, null, 2),
      "utf8",
    );
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl);
      if (url.origin !== "http://127.0.0.1:19134") {
        return originalFetch(input, init);
      }
      const method = init?.method ?? "GET";
      if (method === "GET" && url.pathname === "/") {
        return new Response(JSON.stringify({
          ok: true,
          stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
          sessionCount: 1,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "GET" && url.pathname === `/sessions/${profileId}/chats`) {
        return new Response(JSON.stringify({
          chats: [{
            id: conversationId,
            title: "Activation Flow Owner Chat",
            type: "private",
            unreadCount: 3,
            folderIds: [1],
            updatedAt: "2026-05-10T00:00:04.000Z",
          }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "GET" && url.pathname === `/sessions/${profileId}/inbox/unread`) {
        unreadCallCount += 1;
        return new Response(JSON.stringify({
          messages: [
            {
              id: `activation-stale-${unreadCallCount}`,
              chatId: conversationId,
              outgoing: false,
              text: "old private backlog must not route",
              date: "2026-05-10T00:00:01.000Z",
            },
            {
              id: "activation-handoff",
              chatId: conversationId,
              outgoing: false,
              text: setupCode,
              date: "2026-05-10T00:00:02.000Z",
            },
            {
              id: "activation-status",
              chatId: conversationId,
              outgoing: false,
              text: "status",
              date: "2026-05-10T00:00:04.000Z",
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "GET" && url.pathname.startsWith(`/sessions/${profileId}/chats/${conversationId}/messages/`) && url.pathname.endsWith("/sender-profile")) {
        return new Response(JSON.stringify({
          sender: {
            kind: "user",
            user: {
              userId: "activation-owner-1",
              displayName: "Activation Owner",
            },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "POST" && url.pathname === `/sessions/${profileId}/messages/send`) {
        sentMessages.push(typeof init?.body === "string" ? JSON.parse(init.body) : init?.body);
        return new Response(JSON.stringify({
          messageId: "unexpected-provider-send",
          date: "2026-05-10T00:00:05.000Z",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const thread = store.createThread("Telegram owner-loop activation flow dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_polling_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Telegram owner-loop activation flow dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    let transcript = "";
    try {
      const setupTranscript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is step 1 of a plan-driven Telegram owner-loop activation dogfood test.",
          `Call ambient_messaging_telegram_owner_loop_activation_plan as the first tool with profileId ${profileId}, setupCode ${setupCode}, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, minReceivedAt ${commandFreshness}, intervalMs 300000, and limit 5.`,
          "Then follow the plan's provider-readiness phase by calling ambient_messaging_gateway_lifecycle_apply with action start, providerId telegram-tdlib, and mode real.",
          `Then follow metadata-directory: call ambient_messaging_telegram_conversation_directory_preview with profileId ${profileId} and limit 5, then ambient_messaging_telegram_conversation_directory_apply with profileId ${profileId} and limit 5.`,
          `Then follow owner-handoff: call ambient_messaging_telegram_owner_handoff_preview with profileId ${profileId}, conversationId ${conversationId}, setupCode ${setupCode}, and limit 5, then ambient_messaging_telegram_owner_handoff_apply with the same fields.`,
          `Then follow owner-binding: call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId ${profileId}, conversationId ${conversationId}, ownerUserId activation-owner-1, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.`,
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields and ownerHandoffSourceMessageId from the owner handoff result.",
          `Then call ambient_messaging_telegram_owner_loop_activation_plan again with profileId ${profileId}, conversationId ${conversationId}, setupCode ${setupCode}, ownerUserId activation-owner-1, ownerHandoffSourceMessageId activation-handoff, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, minReceivedAt ${commandFreshness}, intervalMs 300000, and limit 5.`,
          "Do not poll, preview replies, apply replies, call Telegram Desktop, shell, browser, provider CLI, install, or send-message tools in this step.",
          "After checking the tool results, answer with exactly TELEGRAM_ACTIVATION_FLOW_SETUP_OK and include the phrases activation plan first, metadata-only directory row, owner handoff matched, Remote Ambient Surface binding applied, recommended next tool ambient_messaging_telegram_bridge_polling_preview, and no Telegram Desktop fallback.",
        ],
        expected: "TELEGRAM_ACTIVATION_FLOW_SETUP_OK",
      });
      transcript += `\n${setupTranscript}`;

      const pollingTranscript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is step 2 of the same plan-driven Telegram owner-loop activation dogfood test.",
          `Use the active ${profileId} Remote Ambient Surface binding from step 1.`,
          `Call ambient_messaging_telegram_bridge_polling_preview with action start, profileId ${profileId}, minReceivedAt ${commandFreshness}, intervalMs 300000, and limit 5.`,
          `Then call ambient_messaging_telegram_bridge_polling_apply with action start, profileId ${profileId}, minReceivedAt ${commandFreshness}, intervalMs 300000, and limit 5.`,
          "Then call ambient_messaging_telegram_bridge_polling_status and ambient_messaging_gateway_status.",
          "Read the queuedProjectionId from the immediate poll result or gateway status, then call ambient_messaging_remote_surface_command_preview with that queuedProjectionId.",
          "Then call ambient_messaging_remote_surface_command_apply with the same queuedProjectionId.",
          "Then call ambient_messaging_gateway_status again and call ambient_messaging_remote_surface_reply_preview with only the completed runtimeEventId from gateway status. Do not provide text and do not apply the reply.",
          "Then cleanup: call ambient_messaging_telegram_bridge_polling_preview with action stop, then ambient_messaging_telegram_bridge_polling_apply with action stop.",
          "Finally call ambient_messaging_telegram_remote_surface_apply with action revoke, the active bindingId from step 1, and reason activation flow dogfood cleanup.",
          "Do not call ambient_messaging_remote_surface_reply_apply, ambient_messaging_telegram_bridge_reply_apply, one-shot poll tools, Telegram Desktop, shell, browser, provider CLI, install, or send-message tools.",
          "After checking the tool results, answer with exactly TELEGRAM_ACTIVATION_FLOW_PERIODIC_OK and include the phrases periodic polling start applied, stale backlog stayed stale, Remote Ambient Surface command apply, provider-neutral relay preview ready, polling stopped, binding revoked, no provider reply sent, and no provider message bodies returned.",
        ],
        expected: "TELEGRAM_ACTIVATION_FLOW_PERIODIC_OK",
      });
      transcript += `\n${pollingTranscript}`;
    } finally {
      globalThis.fetch = originalFetch;
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    const planIndex = transcript.indexOf("ambient_messaging_telegram_owner_loop_activation_plan completed");
    const lifecycleIndex = transcript.indexOf("ambient_messaging_gateway_lifecycle_apply completed");
    expect(planIndex).toBeGreaterThanOrEqual(0);
    expect(lifecycleIndex).toBeGreaterThan(planIndex);
    expect((transcript.match(/ambient_messaging_telegram_owner_loop_activation_plan completed/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(transcript).toContain("Recommended next tool: ambient_messaging_telegram_bridge_polling_preview");
    expect(transcript).toContain("ambient_messaging_telegram_conversation_directory_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_owner_handoff_apply completed");
    expect(transcript).toContain("Use ownerUserId activation-owner-1");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_apply completed");
    expect(transcript).toContain("Immediate poll:");
    expect(transcript).toContain("Accepted dispatches: 1");
    expect(transcript).toContain("Stale messages before minReceivedAt");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_reply_preview completed");
    expect(transcript).toContain("State: stopped");
    expect(transcript).not.toContain("ambient_messaging_remote_surface_reply_apply completed");
    expect(transcript).not.toContain("ambient_messaging_telegram_bridge_reply_apply completed");
    expect(transcript).not.toContain("old private backlog must not route");
    expect(sentMessages).toEqual([]);
    expect(unreadCallCount).toBeGreaterThanOrEqual(2);
  }, 420_000);

  itLive("runs selected workflow exploration through Remote Ambient Surface command apply", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface workflow action dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "workflow-action-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "workflow-action-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "workflow-action-dogfood-owner",
        phoneNumber: "+15550000007",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-workflow-action-dogfood-key",
      }, null, 2),
      "utf8",
    );

    const workflowThread = store.createWorkflowAgentThreadSummary({
      folderId: store.listWorkflowAgentFolders()[0]?.id,
      title: "Remote workflow action target",
      initialRequest: "Check Remote Ambient Surface workflow action status.",
      projectPath: workspacePath,
    });
    const thread = store.createThread("Remote Ambient Surface workflow action dogfood");
    let runExplorationCalls = 0;
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface workflow action dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
      {
        workflowAgents: {
          runExploration: async (input) => {
            runExplorationCalls += 1;
            const graph = store.createWorkflowGraphSnapshot({
              workflowThreadId: input.workflowThreadId,
              source: "exploration",
              summary: "Remote Ambient Surface dogfood exploration graph.",
              nodes: [
                {
                  id: "request",
                  type: "request",
                  label: "Owner request",
                  description: "Remote Ambient Surface workflow action dogfood request.",
                  runState: "completed",
                },
                {
                  id: "output",
                  type: "output",
                  label: "Status summary",
                  description: "Summarize the workflow action result for the owner.",
                  runState: "completed",
                },
              ],
              edges: [
                {
                  id: "request-to-output",
                  source: "request",
                  target: "output",
                  type: "data_flow",
                  label: "status",
                  runState: "completed",
                },
              ],
            });
            const updatedThread = store.updateWorkflowAgentThreadPhase(input.workflowThreadId, "planned");
            return {
              thread: updatedThread,
              traceId: "trace-dogfood-1",
              graphSnapshotId: graph.id,
              text: "Workflow Agent exploration completed for Remote Ambient Surface dogfood.",
            };
          },
        },
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface workflow action dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId workflow-action-dogfood-owner, conversationId workflow-action-conversation, ownerUserId owner-workflow-action-dogfood, ambientSurface workflow_agents, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId workflow-action-dogfood-owner, conversationId workflow-action-conversation, messageId workflow-action-dogfood-message-1, senderId owner-workflow-action-dogfood, senderLabel Owner, and text run exploration.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should run the selected Ambient Workflow Agent exploration action after approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, compile, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_WORKFLOW_ACTION_OK and include the phrases run exploration, Workflow action result: exploration, trace-dogfood-1, Remote Ambient Surface command apply, and Workflow projection.",
        ],
        expected: "MESSAGING_GATEWAY_WORKFLOW_ACTION_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("run exploration");
    expect(transcript).toContain("Workflow action result: exploration");
    expect(transcript).toContain("trace-dogfood-1");
    expect(transcript).toContain("Remote Ambient Surface command apply");
    expect(runExplorationCalls).toBe(1);
    expect(store.getWorkflowAgentThreadSummary(workflowThread.id).activeGraphSnapshotId).toEqual(expect.any(String));
  }, 300_000);

  itLive("approves selected workflow previews through Remote Ambient Surface command apply", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface workflow review dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "workflow-review-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "workflow-review-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "workflow-review-dogfood-owner",
        phoneNumber: "+15550000008",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-workflow-review-dogfood-key",
      }, null, 2),
      "utf8",
    );

    const workflowThread = store.createWorkflowAgentThreadSummary({
      folderId: store.listWorkflowAgentFolders()[0]?.id,
      title: "Remote workflow review target",
      initialRequest: "Review Remote Ambient Surface workflow preview status.",
      projectPath: workspacePath,
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: workflowThread.id,
      title: "Remote workflow review preview",
      status: "ready_for_preview",
      manifest: {
        tools: [],
        mutationPolicy: "read_only",
      },
      spec: {
        goal: "Review Remote Ambient Surface workflow preview status.",
        summary: "A reviewable workflow preview for Remote Ambient Surface dogfood.",
      },
      sourcePath: join(workspacePath, "remote-workflow-review.js"),
      statePath: join(workspacePath, ".workflow-review-state"),
    });
    const thread = store.createThread("Remote Ambient Surface workflow review dogfood");
    let reviewArtifactCalls = 0;
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface workflow review dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
      {
        workflowAgents: {
          reviewArtifact: async (input) => {
            reviewArtifactCalls += 1;
            const before = store.getWorkflowArtifact(input.artifactId);
            const updated = before.status === input.decision
              ? before
              : store.updateWorkflowArtifact({ id: input.artifactId, status: input.decision });
            const updatedThread = store.getWorkflowAgentThreadSummary(input.workflowThreadId);
            return {
              thread: updatedThread,
              artifactId: updated.id,
              artifactStatus: updated.status,
              changed: before.status !== updated.status,
              text: `Workflow preview approved via Remote Ambient Surface dogfood\nartifactStatus=${updated.status}`,
            };
          },
        },
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface workflow preview review dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId workflow-review-dogfood-owner, conversationId workflow-review-conversation, ownerUserId owner-workflow-review-dogfood, ambientSurface workflow_agents, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId workflow-review-dogfood-owner, conversationId workflow-review-conversation, messageId workflow-review-dogfood-message-1, senderId owner-workflow-review-dogfood, senderLabel Owner, and text approve workflow preview.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should approve the selected Ambient Workflow Agent preview artifact after approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, compile, run exploration, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_WORKFLOW_REVIEW_OK and include the phrases approve workflow preview, Workflow action result: artifact approved, artifactStatus=approved, Remote Ambient Surface command apply, and Workflow projection.",
        ],
        expected: "MESSAGING_GATEWAY_WORKFLOW_REVIEW_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("approve workflow preview");
    expect(transcript).toContain("Workflow action result: artifact approved");
    expect(transcript).toContain("artifactStatus=approved");
    expect(transcript).toContain("Remote Ambient Surface command apply");
    expect(reviewArtifactCalls).toBe(1);
    expect(store.getWorkflowArtifact(artifact.id).status).toBe("approved");
  }, 300_000);

  itLive("recovers a failed workflow through Remote Ambient Surface command apply", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface workflow recovery dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "workflow-recovery-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "workflow-recovery-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        state: "ready",
        profileId: "workflow-recovery-dogfood-owner",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-workflow-recovery-dogfood-key",
      }, null, 2),
      "utf8",
    );

    const workflowThread = store.createWorkflowAgentThreadSummary({
      folderId: store.listWorkflowAgentFolders()[0]?.id,
      title: "Remote workflow recovery target",
      initialRequest: "Retry failed Remote Ambient Surface workflow classifications.",
      projectPath: workspacePath,
    });
    store.createWorkflowGraphSnapshot({
      workflowThreadId: workflowThread.id,
      source: "compile",
      summary: "Classify records.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." },
      ],
      edges: [{ id: "request-classify", source: "request", target: "classify", type: "control_flow" }],
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: workflowThread.id,
      title: "Remote workflow recovery artifact",
      status: "approved",
      manifest: {
        tools: [],
        mutationPolicy: "read_only",
      },
      spec: {
        goal: "Retry failed Remote Ambient Surface workflow classifications.",
        summary: "An approved workflow artifact with a retryable failed event for Remote Ambient Surface dogfood.",
      },
      sourcePath: join(workspacePath, "remote-workflow-recovery.js"),
      statePath: join(workspacePath, ".workflow-recovery-state.json"),
    });
    const failedRun = store.startWorkflowRun({ artifactId: artifact.id, status: "failed" });
    const failedEvent = store.appendWorkflowRunEvent({
      runId: failedRun.id,
      type: "ambient.call.error",
      graphNodeId: "classify",
      message: "schema mismatch",
    });
    const thread = store.createThread("Remote Ambient Surface workflow recovery dogfood");
    let recoverRunCalls = 0;
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface workflow recovery dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
      {
        workflowAgents: {
          recoverRun: async (input) => {
            recoverRunCalls += 1;
            expect(input).toMatchObject({
              workflowThreadId: workflowThread.id,
              runId: failedRun.id,
              eventId: failedEvent.id,
              action: "retry_step",
              graphNodeId: "classify",
            });
            const recoveredRun = store.startWorkflowRun({ artifactId: artifact.id, status: "succeeded" });
            const updatedThread = store.getWorkflowAgentThreadSummary(input.workflowThreadId);
            return {
              thread: updatedThread,
              runId: recoveredRun.id,
              runStatus: recoveredRun.status,
              changed: true,
              text: `Workflow recovery run completed\nRecovery action: ${input.action}\nSource event: ${input.eventId}\nRecovered run: ${recoveredRun.status} (${recoveredRun.id})`,
            };
          },
        },
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface workflow recovery dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId workflow-recovery-dogfood-owner, conversationId workflow-recovery-conversation, ownerUserId owner-workflow-recovery-dogfood, ambientSurface workflow_agents, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_runtime_surface_snapshot with limit 5 and confirm it shows a recovery event with the command retry failed step.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId workflow-recovery-dogfood-owner, conversationId workflow-recovery-conversation, messageId workflow-recovery-dogfood-message-1, senderId owner-workflow-recovery-dogfood, senderLabel Owner, and text retry failed step.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should retry the selected failed workflow event after approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, compile, run exploration, approve/reject preview, cancel workflow, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_WORKFLOW_RECOVERY_OK and include the phrases Recovery events, retry failed step, Workflow action result: recovery retry, Recovery action: retry_step, Remote Ambient Surface command apply, and Workflow projection.",
        ],
        expected: "MESSAGING_GATEWAY_WORKFLOW_RECOVERY_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("Recovery events");
    expect(transcript).toContain("retry failed step");
    expect(transcript).toContain("Workflow action result: recovery retry");
    expect(transcript).toContain("Recovery action: retry_step");
    expect(recoverRunCalls).toBe(1);
  }, 300_000);

  itLive("updates speech input policy through Remote Ambient Surface command apply", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface speech settings dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "speech-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "speech-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "speech-dogfood-owner",
        phoneNumber: "+15550000001",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-speech-dogfood-key",
      }, null, 2),
      "utf8",
    );

    let sttSettings: SttSettings = {
      enabled: true,
      providerCapabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
      spokenLanguage: "English",
      mode: "push-to-talk",
      autoSendAfterTranscription: true,
      silenceFinalizeSeconds: 0.8,
      noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
      bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
    };
    const thread = store.createThread("Remote Ambient Surface speech settings dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface speech settings dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
      {
        stt: {
          readSettings: () => sttSettings,
          updateSettings: (input) => {
            sttSettings = input;
            return sttSettings;
          },
          listProviders: () => [
            {
              capabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
              providerId: "qwen3-asr",
              packageId: "qwen3-asr",
              packageName: "qwen3-asr",
              command: "qwen3_asr_transcribe",
              label: "Qwen3 ASR",
              installed: true,
              available: true,
              availabilityReason: "dogfood fixture provider",
              languages: ["English", "Spanish"],
              defaultLanguage: "English",
            },
          ],
        },
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface speech settings dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId speech-dogfood-owner, conversationId speech-settings-conversation, ownerUserId owner-speech-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId speech-dogfood-owner, conversationId speech-settings-conversation, messageId speech-dogfood-message-1, senderId owner-speech-dogfood, senderLabel Owner, and text set speech language Spanish.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient STT policy after approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_STT_SETTINGS_OK and include the phrases set speech language Spanish, stt policy apply, spokenLanguage=Spanish, Remote Ambient Surface command apply, and Settings projection.",
        ],
        expected: "MESSAGING_GATEWAY_STT_SETTINGS_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("set speech language Spanish");
    expect(transcript).toContain("stt policy apply");
    expect(transcript).toContain("spokenLanguage=Spanish");
    expect(transcript).toContain("Remote Ambient Surface command apply");
    expect(sttSettings.spokenLanguage).toBe("Spanish");
  }, 300_000);

  itLive("updates generated media playback through Remote Ambient Surface command apply", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface media settings dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "media-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "media-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "media-dogfood-owner",
        phoneNumber: "+15550000002",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-media-dogfood-key",
      }, null, 2),
      "utf8",
    );

    let mediaSettings: MediaPlaybackSettings = { generatedMediaAutoplay: false };
    const thread = store.createThread("Remote Ambient Surface media settings dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface media settings dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
      {
        media: {
          readSettings: () => mediaSettings,
          updateSettings: (input) => {
            mediaSettings = input;
            return mediaSettings;
          },
        },
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface generated media settings dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId media-dogfood-owner, conversationId media-settings-conversation, ownerUserId owner-media-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId media-dogfood-owner, conversationId media-settings-conversation, messageId media-dogfood-message-1, senderId owner-media-dogfood, senderLabel Owner, and text set generated media autoplay on.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient generated media playback setting after approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_MEDIA_SETTINGS_OK and include the phrases set generated media autoplay on, media playback apply, generatedMediaAutoplay=true, Remote Ambient Surface command apply, and Settings projection.",
        ],
        expected: "MESSAGING_GATEWAY_MEDIA_SETTINGS_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("set generated media autoplay on");
    expect(transcript).toContain("media playback apply");
    expect(transcript).toContain("generatedMediaAutoplay=true");
    expect(transcript).toContain("Remote Ambient Surface command apply");
    expect(mediaSettings.generatedMediaAutoplay).toBe(true);
  }, 300_000);

  itLive("updates Planner finalization through Remote Ambient Surface command apply", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface Planner settings dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "planner-settings-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "planner-settings-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "planner-settings-dogfood-owner",
        phoneNumber: "+15550000006",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-planner-settings-dogfood-key",
      }, null, 2),
      "utf8",
    );

    let plannerSettings = { autoFinalize: true };
    const thread = store.createThread("Remote Ambient Surface Planner settings dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface Planner settings dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
      {
        planner: {
          readSettings: () => plannerSettings,
          updateSettings: (input) => {
            plannerSettings = input;
            return plannerSettings;
          },
        },
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface Planner finalization settings dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId planner-settings-dogfood-owner, conversationId planner-settings-conversation, ownerUserId owner-planner-settings-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId planner-settings-dogfood-owner, conversationId planner-settings-conversation, messageId planner-settings-dogfood-message-1, senderId owner-planner-settings-dogfood, senderLabel Owner, and text set planner autoFinalize off.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient Planner finalization setting after approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PLANNER_SETTINGS_OK and include the phrases set planner autoFinalize off, planner finalization apply, autoFinalize=false, Remote Ambient Surface command apply, and Settings projection.",
        ],
        expected: "MESSAGING_GATEWAY_PLANNER_SETTINGS_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("set planner autoFinalize off");
    expect(transcript).toContain("planner finalization apply");
    expect(transcript).toContain("autoFinalize=false");
    expect(transcript).toContain("Remote Ambient Surface command apply");
    expect(plannerSettings.autoFinalize).toBe(false);
  }, 300_000);

  itLive("updates selected chat thread settings through Remote Ambient Surface command apply", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface thread settings dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "thread-settings-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "thread-settings-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "thread-settings-dogfood-owner",
        phoneNumber: "+15550000003",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-thread-settings-dogfood-key",
      }, null, 2),
      "utf8",
    );

    const thread = store.createThread("Remote Ambient Surface thread settings dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface thread settings dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface selected chat thread settings dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId thread-settings-dogfood-owner, conversationId thread-settings-conversation, ownerUserId owner-thread-settings-dogfood, ambientSurface chat, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId thread-settings-dogfood-owner, conversationId thread-settings-conversation, messageId thread-settings-dogfood-message-1, senderId owner-thread-settings-dogfood, senderLabel Owner, and text set chat mode planner.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the selected Ambient chat thread mode after approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_THREAD_SETTINGS_OK and include the phrases set chat mode planner, thread settings apply, collaborationMode=planner, Remote Ambient Surface command apply, and Chat projection.",
        ],
        expected: "MESSAGING_GATEWAY_THREAD_SETTINGS_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("set chat mode planner");
    expect(transcript).toContain("thread settings apply");
    expect(transcript).toContain("collaborationMode=planner");
    expect(transcript).toContain("Remote Ambient Surface command apply");
    expect(store.getThread(thread.id).collaborationMode).toBe("planner");
  }, 300_000);

  itLive("responds to pending permission prompts through Remote Ambient Surface approval commands", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface approval dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "approval-dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "approval-dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "approval-dogfood-owner",
        phoneNumber: "+15550000004",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-approval-dogfood-key",
      }, null, 2),
      "utf8",
    );

    const thread = store.createThread("Remote Ambient Surface approval dogfood");
    const pendingApproval: PermissionRequest = {
      id: "permission-approval-dogfood",
      threadId: thread.id,
      toolName: "ambient_messaging_telegram_bridge_reply_apply",
      title: "Send Telegram reply?",
      message: "Send one owner-scoped reply through Telegram.",
      detail: "Reply preview: Remote approval dogfood status.",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
      grantActionKind: "plugin_tool_execute",
      grantTargetKind: "tool",
      grantTargetLabel: "telegram reply dogfood",
      grantTargetHash: "telegram-reply-dogfood",
    };
    let approvalResponse: { id: string; response: PermissionPromptResponseMode } | undefined;
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName === "ambient_messaging_telegram_remote_surface_apply") {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface approval dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
        listPending: () => approvalResponse ? [] : [pendingApproval],
        respond: (id, response) => {
          approvalResponse = { id, response };
        },
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface pending approval dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId approval-dogfood-owner, conversationId approval-settings-conversation, ownerUserId owner-approval-dogfood, ambientSurface notifications, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId approval-dogfood-owner, conversationId approval-settings-conversation, messageId approval-dogfood-message-1, senderId owner-approval-dogfood, senderLabel Owner, and text approve request 1 always thread.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should resolve the pending Ambient permission prompt without asking for another approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_APPROVAL_RESPONSE_OK and include the phrases approve request 1 always thread, approval response apply, pendingApprovals=0, Responded to approval, and Remote Ambient Surface command apply.",
        ],
        expected: "MESSAGING_GATEWAY_APPROVAL_RESPONSE_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("approve request 1 always thread");
    expect(transcript).toContain("approval response apply");
    expect(transcript).toContain("Responded to approval");
    expect(approvalResponse).toEqual({
      id: "permission-approval-dogfood",
      response: "always_thread",
    });
  }, 300_000);

  itLive("revokes persistent permission grants through Remote Ambient Surface commands", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface grant revocation dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "grant-revoke-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "grant-revoke-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "grant-revoke-owner",
        phoneNumber: "+15550000005",
        tdlibStateDir,
        databaseEncryptionKey: "redacted-grant-revoke-key",
      }, null, 2),
      "utf8",
    );

    const thread = store.createThread("Remote permission grant revoke dogfood");
    const grant = store.createPermissionGrant({
      permissionModeAtCreation: "workspace",
      scopeKind: "thread",
      threadId: thread.id,
      actionKind: "plugin_tool_execute",
      targetKind: "tool",
      targetHash: "remote-grant-dogfood",
      targetLabel: "Remote dogfood grant",
      source: "permission_prompt",
      reason: "Dogfood grant for Remote Ambient Surface revocation.",
    });
    store.addPermissionAudit({
      threadId: thread.id,
      permissionMode: "workspace",
      toolName: "ambient_messaging_telegram_bridge_reply_apply",
      risk: "plugin-tool",
      decision: "allowed",
      reason: "Matched dogfood persistent grant.",
      decisionSource: "persistent_grant",
      grantId: grant.id,
    });

    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName === "ambient_messaging_telegram_remote_surface_apply") {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Remote Ambient Surface grant revoke dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
        listPending: () => [],
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Remote Ambient Surface permission grant revocation dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId grant-revoke-owner, conversationId grant-revoke-conversation, ownerUserId owner-grant-revoke, ambientSurface notifications, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId grant-revoke-owner, conversationId grant-revoke-conversation, messageId grant-revoke-message-1, senderId owner-grant-revoke, senderLabel Owner, and text revoke grant 1.",
          "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
          "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should revoke the active Ambient permission grant without asking for another approval.",
          "Then call ambient_runtime_surface_snapshot with limit 5.",
          "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, approval response, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_GRANT_REVOKE_OK and include the phrases revoke grant 1, grant revoke apply, activeGrants=0, Revoked permission grant, and Remote Ambient Surface command apply.",
        ],
        expected: "MESSAGING_GATEWAY_GRANT_REVOKE_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
    expect(transcript).toContain("revoke grant 1");
    expect(transcript).toContain("grant revoke apply");
    expect(transcript).toContain("Revoked permission grant");
    expect(store.listPermissionGrants()).toEqual([]);
    expect(store.getPermissionGrant(grant.id).revokedAt).toEqual(expect.any(String));
  }, 300_000);

  itLive("recognizes the planned Signal messaging provider stub without using it", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live messaging provider stub dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Signal provider stub dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Signal provider stub dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "This is a focused Ambient messaging provider stub dogfood test.",
        "Call ambient_messaging_list_providers.",
        "Then call ambient_messaging_conversation_directory_preview with providerId signal-cli and purpose remote_ambient_surface.",
        "Then call ambient_messaging_signal_conversation_directory_preview with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5.",
        "Then call ambient_messaging_signal_conversation_directory_apply with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5. It should return blocked without approval or provider I/O.",
        "Then call ambient_messaging_remote_surface_binding_preview with action create, providerId signal-cli, authProfileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
        "Then call ambient_messaging_signal_binding_readiness_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
        "Then call ambient_messaging_signal_owner_handoff_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5.",
        "Then call ambient_messaging_signal_owner_handoff_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5. It should return blocked without approval or provider I/O.",
        "Then call ambient_messaging_remote_surface_event_preview with providerId signal-cli, authProfileId dogfood-owner, conversationId signal-dogfood-conversation, senderId signal-owner, and text status.",
        "Then call ambient_messaging_gateway_status.",
        "Do not call any lifecycle, binding apply, bridge, polling, reply, shell, browser, install, or external messaging tools.",
        "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_STUB_OK and include the phrases Signal planned provider, metadata-only, implementation planned, bindings disabled, runtime disabled, Signal readiness unavailable, Provider directory tool ambient_messaging_signal_conversation_directory_preview, Signal directory apply blocked, Signal binding readiness blocked, Signal owner handoff blocked, Signal owner handoff apply blocked, Handoff status not-attempted, Can feed binding apply no, Generic binding apply no, Telegram owner handoff no, no Signal messages read, no Signal messages sent, Typed apply tool none, and Typed route tool none.",
      ],
      expected: "MESSAGING_GATEWAY_SIGNAL_STUB_OK",
    });

    expect(transcript).toContain("ambient_messaging_list_providers completed");
    expect(transcript).toContain("ambient_messaging_conversation_directory_preview completed");
    expect(transcript).toContain("ambient_messaging_signal_conversation_directory_preview completed");
    expect(transcript).toContain("ambient_messaging_signal_conversation_directory_apply completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_binding_preview completed");
    expect(transcript).toContain("ambient_messaging_signal_binding_readiness_preview completed");
    expect(transcript).toContain("ambient_messaging_signal_owner_handoff_preview completed");
    expect(transcript).toContain("ambient_messaging_signal_owner_handoff_apply completed");
    expect(transcript).toContain("ambient_messaging_remote_surface_event_preview completed");
    expect(transcript).toContain("ambient_messaging_gateway_status completed");
    expect(transcript).toContain("Signal (signal-cli)");
    expect(transcript).toContain("Implementation: planned");
    expect(transcript).toContain("Readiness: unavailable");
    expect(transcript).toContain("Binding lifecycle: disabled");
    expect(transcript).toContain("Inbound ingestion: disabled");
    expect(transcript).toContain("Provider directory tool: ambient_messaging_signal_conversation_directory_preview");
    expect(transcript).toContain("Signal conversation directory result: blocked");
    expect(transcript).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
    expect(transcript).toContain("Signal owner handoff preview: blocked");
    expect(transcript).toContain("Signal owner handoff apply: blocked");
    expect(transcript).toContain("Handoff status: not-attempted");
    expect(transcript).toContain("Can feed binding apply: no");
    expect(transcript).toContain("Reads Signal unread messages: no");
    expect(transcript).toContain("Generic binding apply allowed: no");
    expect(transcript).toContain("Telegram owner handoff allowed: no");
    expect(transcript).toContain("Uses Telegram owner handoff: no");
    expect(transcript).toContain("Typed apply tool: none");
    expect(transcript).toContain("Typed route tool: none");
    expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_STUB_OK");
    expect(transcript).toContain("no Signal messages read");
    expect(transcript).toContain("no Signal messages sent");
  }, 240_000);

  itLive("records Signal setup metadata without provider I/O", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal setup metadata dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const signalConfigDir = join(workspacePath, "signal-cli-config");
    await mkdir(signalConfigDir, { recursive: true });
    const thread = store.createThread("Signal setup metadata dogfood");
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

    const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "This is a focused Ambient messaging Signal setup metadata dogfood test.",
        `Call ambient_messaging_signal_session_preview with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
        `Then call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
        "Then call ambient_messaging_gateway_status.",
        "Do not call shell, browser, install, lifecycle, Signal Desktop, provider CLI, conversation directory apply, binding apply, polling, reply, or external messaging tools.",
        "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_SETUP_OK and include the phrases Signal setup metadata written, no Signal messages read, no Signal messages sent, Signal runtime disabled, and Signal readiness unavailable.",
      ],
      expected: "MESSAGING_GATEWAY_SIGNAL_SETUP_OK",
    });

    expect(transcript).toContain("ambient_messaging_signal_session_preview completed");
    expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
    expect(transcript).toContain("ambient_messaging_gateway_status completed");
    expect(transcript).toContain("Signal session setup apply");
    expect(transcript).toContain("Apply status: applied");
    expect(transcript).toContain("Readiness: unavailable");
    expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_SETUP_OK");
    expect(transcript).toContain("no Signal messages read");
    expect(transcript).toContain("no Signal messages sent");
  }, 240_000);

  itLive("recognizes a fake Signal bridge contract without enabling Signal sends", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal bridge contract dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const signalConfigDir = join(workspacePath, "signal-cli-config");
    await mkdir(signalConfigDir, { recursive: true });
    const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
    const previousSignalOwnerHandoffFakeApply = process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY;
    const previousSignalUnreadFakeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
    let unreadWindowRequestCount = 0;
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          contract: { kind: "ambient-signal-local-bridge", version: "v0" },
          stateRoot: workspacePath,
          profileCount: 1,
          capabilities: {
            profileStatus: true,
            metadataOnlyConversationDirectory: true,
            boundedUnreadWindow: true,
            approvedReplySend: true,
          },
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-owner/status") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-owner",
          ready: true,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-owner/conversations?metadataOnly=true&limit=5&query=dogfood") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-owner",
          conversations: [{
            conversationId: "signal-dogfood-conversation",
            title: "Signal Dogfood",
            type: "direct",
            unreadCount: 1,
            folderIds: [],
            updatedAt: "2026-05-10T00:00:00.000Z",
          }],
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-owner/conversations/signal-dogfood-conversation/unread?limit=5") {
        unreadWindowRequestCount += 1;
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-owner",
          conversationId: "signal-dogfood-conversation",
          messages: [
            {
              messageId: "signal-dogfood-setup-message",
              senderId: "signal-owner",
              senderLabel: "Signal Owner",
              text: "ambient-signal-setup-code-12345",
              receivedAt: "2026-05-10T00:00:00.000Z",
              outgoing: false,
            },
            {
              messageId: "signal-dogfood-other-message",
              senderId: "other-sender",
              text: "private text that must not leak",
              receivedAt: "2026-05-10T00:00:01.000Z",
              outgoing: false,
            },
            ...(unreadWindowRequestCount >= 2 ? [{
              messageId: "signal-dogfood-command-message",
              senderId: "signal-owner",
              senderLabel: "Signal Owner",
              text: "show projects private command must not leak",
              receivedAt: "2026-05-10T00:00:02.000Z",
              outgoing: false,
            }] : []),
          ],
        }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
    process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
    process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY = "1";
    process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";

    try {
      const thread = store.createThread("Signal bridge contract dogfood");
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

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging Signal bridge contract dogfood test.",
          `Call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
          "Then call ambient_messaging_gateway_status.",
          "Then call ambient_messaging_signal_conversation_directory_preview with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5.",
          "Then call ambient_messaging_signal_conversation_directory_apply with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5. The permission requester will approve this metadata-only read.",
          "Then call ambient_messaging_signal_binding_readiness_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
          "Then call ambient_messaging_signal_owner_handoff_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5.",
          "Then call ambient_messaging_signal_owner_handoff_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5. The permission requester will approve this bounded fake-bridge owner handoff read.",
          "Then call ambient_messaging_signal_remote_surface_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ownerHandoffSourceMessageId signal-dogfood-setup-message, initialSeenMessageIds [signal-dogfood-setup-message, signal-dogfood-other-message], ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
          "Then call ambient_messaging_signal_remote_surface_apply with the same Signal remote surface arguments. The permission requester will approve this metadata-only binding write, so it should persist the binding without starting Signal, reading messages, polling unread windows, or sending replies.",
          "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to verify the active Signal binding.",
          "Then call ambient_messaging_signal_unread_window_preview with providerId signal-cli, bindingId from the active Signal binding, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5.",
          "Then call ambient_messaging_signal_unread_window_apply with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5. The permission requester will approve this bounded fake-bridge unread-window read.",
          "Then call ambient_messaging_signal_unread_window_status with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and includeInactive false.",
          "Then call ambient_messaging_signal_unread_window_apply a second time with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5. The permission requester will approve it; this repeat should be idempotent and report duplicate messages instead of creating another accepted dispatch.",
          "Then call ambient_messaging_signal_unread_window_status again with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and includeInactive false.",
          "Then call ambient_messaging_signal_remote_surface_preview with action revoke, providerId signal-cli, bindingId from the active Signal binding, and reason dogfood cleanup.",
          "Then call ambient_messaging_signal_remote_surface_apply with action revoke, providerId signal-cli, the same bindingId, and reason dogfood cleanup. The permission requester will approve this metadata-only revoke.",
          "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to verify the Signal binding is revoked.",
          "Do not call shell, browser, install, lifecycle, Signal Desktop, provider CLI, generic binding apply, polling, reply, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK and include the phrases Signal bridge root contract accepted, Signal bridge profile status contract accepted, Bridge reachable yes, Configured yes, Signal conversation directory applied, signal-dogfood-conversation, Signal binding readiness blocked, Signal owner handoff ready, Signal owner handoff applied, Handoff status matched, Can feed binding apply yes, Signal remote surface preview ready, Signal remote surface applied, Signal unread apply applied, Accepted dispatches 1, Signal unread-window status ready, Duplicate messages 3, Queued Signal projections 1, Real Signal unread ingestion enabled no, Signal remote surface revoke ready, Signal remote surface revoke applied, Persisted yes, Status revoked, Generic binding apply no, Telegram owner handoff no, Apply tool ambient_messaging_signal_unread_window_apply, no Signal message bodies returned, and no Signal messages sent.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK",
      });

      expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
      expect(transcript).toContain("ambient_messaging_gateway_status completed");
      expect(transcript).toContain("ambient_messaging_signal_conversation_directory_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_conversation_directory_apply completed");
      expect(transcript).toContain("ambient_messaging_signal_binding_readiness_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_owner_handoff_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_owner_handoff_apply completed");
      expect(transcript).toContain("ambient_messaging_signal_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_list_bindings completed");
      expect(transcript).toContain("ambient_messaging_signal_unread_window_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_unread_window_apply completed");
      expect(transcript).toContain("ambient_messaging_signal_unread_window_status completed");
      expect(transcript).toContain("Signal bridge root contract accepted");
      expect(transcript).toContain("Signal bridge profile status contract accepted");
      expect(transcript).toContain("Bridge reachable: yes");
      expect(transcript).toContain("Configured: yes");
      expect(transcript).toContain("Signal conversation directory result: applied");
      expect(transcript).toContain("signal-dogfood-conversation");
      expect(transcript).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
      expect(transcript).toContain("Signal owner handoff preview: ready");
      expect(transcript).toContain("Signal owner handoff apply: applied");
      expect(transcript).toContain("Handoff status: matched");
      expect(transcript).toContain("Can feed binding apply: yes");
      expect(transcript).toContain("Reads Signal unread messages: yes");
      expect(transcript).toContain("Signal Remote Ambient Surface binding preview ready");
      expect(transcript).toContain("Signal Remote Ambient Surface binding applied");
      expect(transcript).toContain("Signal bounded unread-window apply");
      expect(transcript).toContain("Apply status: applied");
      expect(transcript).toContain("Accepted dispatches: 1");
      expect(transcript).toContain("Signal unread-window status");
      expect(transcript).toContain("Status: ready");
      expect(transcript).toContain("Duplicate messages: 3");
      expect(transcript).toContain("Queued Signal projections: 1");
      expect(transcript).toContain("Real Signal unread ingestion enabled: no");
      expect(transcript).toContain("Signal Remote Ambient Surface binding revoke preview ready");
      expect(transcript).toContain("Signal Remote Ambient Surface binding revoke applied");
      expect(transcript).toContain("Persisted: yes");
      expect(transcript).toContain("Active: 1");
      expect(transcript).toContain("Status: revoked");
      expect(transcript).toContain("Generic binding apply allowed: no");
      expect(transcript).toContain("Telegram owner handoff allowed: no");
      expect(transcript).toContain("Uses Telegram owner handoff: no");
      expect(transcript).toContain("Signal bounded unread-window preview");
      expect(transcript).toContain("Apply tool: ambient_messaging_signal_unread_window_apply");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK");
      expect(transcript).toContain("no Signal message bodies returned");
      expect(transcript).toContain("no Signal messages sent");
      expect(transcript).not.toContain("private text that must not leak");
      expect(transcript).not.toContain("show projects private command must not leak");
    } finally {
      restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
      restoreProcessEnv("AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY", previousSignalOwnerHandoffFakeApply);
      restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 240_000);

  itLive("sends approved Signal bridge replies through the reviewed contract", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal reply send dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const signalConfigDir = join(workspacePath, "signal-cli-config-reply");
    await mkdir(signalConfigDir, { recursive: true });
    await mkdir(join(workspacePath, ".ambient-agent-state", "signal", "dogfood-reply-owner"), { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "signal", "dogfood-reply-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "dogfood-reply-owner",
        signalCliConfigDir: signalConfigDir,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: true,
      }),
    );
    const bindingStore = createMessagingBindingStore({
      stateRoot: store.getWorkspace().statePath,
      providers: createDefaultMessagingProviderRegistry(),
    });
    const createdBinding = bindingStore.create({
      providerId: "signal-cli",
      authProfileId: "dogfood-reply-owner",
      conversationId: "signal-reply-dogfood-conversation",
      purpose: "remote_ambient_surface",
      ownerUserId: "signal-reply-owner",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      metadata: {
        setupTool: "ambient_messaging_signal_remote_surface_apply",
        setupShape: "signal-owner-remote-ambient-surface",
        ownerHandoffSourceMessageId: "signal-reply-source-message",
        initialSeenMessageIds: ["signal-reply-source-message"],
      },
    });
    const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
    const previousSignalUnreadFakeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
    let sendRequestCount = 0;
    let unreadRequestCount = 0;
    let sentBody: unknown;
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          contract: { kind: "ambient-signal-local-bridge", version: "v0" },
          stateRoot: workspacePath,
          profileCount: 1,
          capabilities: {
            profileStatus: true,
            metadataOnlyConversationDirectory: true,
            boundedUnreadWindow: true,
            approvedReplySend: true,
          },
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-reply-owner/status") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-reply-owner",
          ready: true,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-reply-owner/conversations/signal-reply-dogfood-conversation/unread?limit=5") {
        unreadRequestCount += 1;
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-reply-owner",
          conversationId: "signal-reply-dogfood-conversation",
          messages: [
            {
              messageId: "signal-reply-command-message",
              senderId: "signal-reply-owner",
              senderLabel: "Signal Owner",
              text: "switch project Signal relay project private text must not leak",
              receivedAt: "2026-05-10T00:00:02.000Z",
              outgoing: false,
            },
          ],
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-reply-owner/conversations/signal-reply-dogfood-conversation/send") {
        sendRequestCount += 1;
        let raw = "";
        request.on("data", (chunk) => {
          raw += chunk.toString();
        });
        request.on("end", () => {
          sentBody = raw ? JSON.parse(raw) : undefined;
          response.end(JSON.stringify({
            ok: true,
            messageId: "signal-dogfood-sent-message",
            sentAt: "2026-05-10T00:00:05.000Z",
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
    process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
    process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";

    try {
      const thread = store.createThread("Signal reply send dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_signal_unread_window_apply" ||
              request.toolName === "ambient_messaging_signal_bridge_reply_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Signal reply send dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing dogfood setup tool ${name}`);
        return found;
      };
      const unread = await tool("ambient_messaging_signal_unread_window_apply").execute("signal-runtime-dogfood-unread", {
        providerId: "signal-cli",
        bindingId: createdBinding.binding.id,
        profileId: "dogfood-reply-owner",
        conversationId: "signal-reply-dogfood-conversation",
        limit: 5,
      });
      expect(unread.details).toMatchObject({
        status: "applied",
        acceptedDispatchCount: 1,
      });
      const queuedProjectionId = unread.details.dispatches?.[0]?.queuedProjectionId;
      expect(queuedProjectionId).toBeTruthy();
      const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Switch to Signal relay project",
        summary: "Active Ambient project switched to Signal relay project.",
        threadId: thread.id,
        queuedProjectionId,
        sourceEventId: "signal-dogfood-reply-owner-signal-reply-dogfood-conversation-signal-reply-command-message",
        bindingId: createdBinding.binding.id,
        projectName: "Signal relay project",
        completedAt: "2026-05-10T00:00:04.000Z",
        relaySuggested: true,
      });

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging approved Signal runtime-event relay dogfood test.",
          `An active Signal Remote Ambient Surface binding already exists with bindingId ${createdBinding.binding.id}, profileId dogfood-reply-owner, conversationId signal-reply-dogfood-conversation, and ownerUserId signal-reply-owner.`,
          `A completed Signal Remote Ambient Surface runtime event already exists with runtimeEventId ${runtimeEvent.id} and queuedProjectionId ${queuedProjectionId}.`,
          "Call ambient_messaging_gateway_status and verify the completed runtime event is present.",
          "Then call ambient_messaging_signal_relay_diagnostics with providerId signal-cli, profileId dogfood-reply-owner, conversationId signal-reply-dogfood-conversation, and the active bindingId.",
          `Then call ambient_messaging_remote_surface_reply_preview with runtimeEventId ${runtimeEvent.id} only. Do not provide providerId, queuedProjectionId, replyToMessageId, or text; Ambient must resolve Signal internally and generate the exact runtime event relay text.`,
          `Then call ambient_messaging_remote_surface_reply_apply with runtimeEventId ${runtimeEvent.id} only. The permission requester will approve exactly one Signal runtime-event reply send through the delegated Signal adapter.`,
          "Then call ambient_messaging_gateway_status again to inspect the outbound delivery record and the runtime event relay status.",
          `Then call ambient_messaging_remote_surface_reply_preview one more time with runtimeEventId ${runtimeEvent.id} only. It should now be blocked as already relayed and show Repair steps; do not call apply again.`,
          "Do not call ambient_messaging_signal_session_apply, ambient_messaging_signal_remote_surface_preview, ambient_messaging_signal_remote_surface_apply, ambient_messaging_signal_unread_window_apply, ambient_messaging_signal_real_unread_window_apply, ambient_messaging_signal_real_polling_apply, shell, browser, Signal Desktop, provider CLI, Telegram tools, generic binding tools, install tools, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK and include the phrases Signal relay diagnostics, Remote Ambient Surface reply preview, Remote Ambient Surface reply apply, Delegated tool, runtime event relay preview, Ambient switched the active project to Signal relay project, Bridge approvedReplySend capability yes, Sends provider messages yes, Approval requested yes, Approval recorded yes, Sent yes, Provider message signal-dogfood-sent-message, Recent outbound deliveries, Relay status sent, Repair steps, Do not resend this runtime event, and chat-to-self ingestion separate.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK",
      });

      expect(transcript).toContain("ambient_messaging_gateway_status completed");
      expect(transcript).toContain("ambient_messaging_signal_relay_diagnostics completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_reply_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_reply_apply completed");
      expect(transcript).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_preview");
      expect(transcript).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_apply");
      expect(transcript).toContain("Signal relay diagnostics");
      expect(transcript).toContain("Remote Ambient Surface reply preview");
      expect(transcript).toContain("Apply result:");
      expect(transcript).toContain("Runtime event:");
      expect(transcript).toContain("Ambient switched the active project to Signal relay project.");
      expect(transcript).toContain("Bridge approvedReplySend capability: yes");
      expect(transcript).toContain("Sends provider messages: yes");
      expect(transcript).toContain("Approval requested: yes");
      expect(transcript).toContain("Approval recorded: yes");
      expect(transcript).toContain("Sent: yes");
      expect(transcript).toContain("Provider message: signal-dogfood-sent-message");
      expect(transcript).toContain("Recent outbound deliveries");
      expect(transcript).toContain("Relay status: sent");
      expect(transcript).toContain("Repair steps:");
      expect(transcript).toContain("Do not resend this runtime event");
      expect(transcript).toContain("Signal chat-to-self ingestion is separate");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK");
      expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
      expect(transcript).not.toContain("ambient_messaging_signal_real_unread_window_apply completed");
      expect(transcript).not.toContain("ambient_messaging_signal_real_polling_apply completed");
      expect(transcript).not.toContain("switch project Signal relay project private text must not leak");
      expect(unreadRequestCount).toBe(1);
      expect(sendRequestCount).toBe(1);
      expect(sentBody).toEqual({
        text: "Ambient switched the active project to Signal relay project.",
        replyToMessageId: "signal-reply-command-message",
      });
    } finally {
      restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
      restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 180_000);

  itLive("explains the blocked real Signal unread skeleton without using fake apply", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real unread skeleton dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Signal real unread skeleton dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during blocked real Signal unread skeleton dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "This is a focused Ambient messaging real Signal unread skeleton dogfood test.",
        "Call ambient_messaging_signal_real_unread_window_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, bindingId signal-binding-missing, and limit 5.",
        "Then call ambient_messaging_signal_real_unread_window_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, bindingId signal-binding-missing, and limit 5.",
        "Do not call ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, polling, reply, install, or external messaging tools.",
        "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK and include the phrases Signal real unread-window preview: blocked, Signal real unread-window apply: blocked, Approval requested no, Contacts bridge unread endpoint no, Reads provider unread messages no, exact active bindingId, no fake unread apply, and no Signal messages read.",
      ],
      expected: "MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK",
    });

    expect(transcript).toContain("ambient_messaging_signal_real_unread_window_preview completed");
    expect(transcript).toContain("ambient_messaging_signal_real_unread_window_apply completed");
    expect(transcript).toContain("Signal real unread-window preview: blocked");
    expect(transcript).toContain("Signal real unread-window apply: blocked");
    expect(transcript).toContain("Approval requested: no");
    expect(transcript).toContain("Contacts bridge unread endpoint: no");
    expect(transcript).toContain("Reads provider unread messages: no");
    expect(transcript).toContain("exact active bindingId");
    expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK");
    expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
  }, 120_000);

  itLive("applies a real Signal unread single-read through the reviewed boundary", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real unread apply dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const signalConfigDir = join(workspacePath, "signal-cli-config-real");
    await mkdir(signalConfigDir, { recursive: true });
    const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
    const previousSignalUnreadFakeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
    let unreadWindowRequestCount = 0;
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          contract: { kind: "ambient-signal-local-bridge", version: "v0" },
          stateRoot: workspacePath,
          profileCount: 1,
          capabilities: {
            profileStatus: true,
            metadataOnlyConversationDirectory: true,
            boundedUnreadWindow: true,
            approvedReplySend: false,
          },
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-real-owner/status") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-real-owner",
          ready: true,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-real-owner/conversations/signal-real-dogfood-conversation/unread?limit=5") {
        unreadWindowRequestCount += 1;
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-real-owner",
          conversationId: "signal-real-dogfood-conversation",
          messages: [
            {
              messageId: "signal-real-seed-message",
              senderId: "signal-real-owner",
              text: "seed private text must not leak",
              receivedAt: "2026-05-10T00:00:00.000Z",
              outgoing: false,
            },
            {
              messageId: `signal-real-command-message-${unreadWindowRequestCount}`,
              senderId: "signal-real-owner",
              senderLabel: "Signal Owner",
              text: "show projects real private command must not leak",
              receivedAt: "2026-05-10T00:00:02.000Z",
              outgoing: false,
            },
          ],
        }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
    process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
    delete process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;

    try {
      const thread = store.createThread("Signal real unread apply dogfood");
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

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging real Signal unread apply dogfood test.",
          `Call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-real-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
          "Then call ambient_messaging_signal_remote_surface_preview with providerId signal-cli, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, ownerUserId signal-real-owner, ownerHandoffSourceMessageId signal-real-seed-message, initialSeenMessageIds [signal-real-seed-message], ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
          "Then call ambient_messaging_signal_remote_surface_apply with the same Signal remote surface arguments. The permission requester will approve this metadata-only binding write.",
          "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to get the active Signal binding id.",
          "Then call ambient_messaging_signal_real_unread_window_preview with providerId signal-cli, that active bindingId, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, and limit 5.",
          "Then call ambient_messaging_signal_real_unread_window_apply with providerId signal-cli, the same active bindingId, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, and limit 5. The permission requester will approve this real bounded single-read.",
          "Do not call ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, polling, reply, install, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK and include the phrases Signal real unread-window preview: ready, Signal real unread-window apply: applied, Approval requested yes, Contacts bridge unread endpoint yes, Reads provider unread messages yes, Accepted dispatches 1, Real Signal unread ingestion enabled yes, no fake unread apply, and no Signal message bodies returned.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK",
      });

      expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
      expect(transcript).toContain("ambient_messaging_signal_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_signal_real_unread_window_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_real_unread_window_apply completed");
      expect(transcript).toContain("Signal real unread-window preview: ready");
      expect(transcript).toContain("Signal real unread-window apply: applied");
      expect(transcript).toContain("Approval requested: yes");
      expect(transcript).toContain("Contacts bridge unread endpoint: yes");
      expect(transcript).toContain("Reads provider unread messages: yes");
      expect(transcript).toContain("Accepted dispatches: 1");
      expect(transcript).toContain("Real unread ingestion enabled: yes");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK");
      expect(transcript).toContain("no Signal message bodies returned");
      expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
      expect(transcript).not.toContain("seed private text must not leak");
      expect(transcript).not.toContain("show projects real private command must not leak");
    } finally {
      restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
      restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 180_000);

  itLive("starts and stops approved Signal real polling without leaking provider text", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real polling dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const signalConfigDir = join(workspacePath, "signal-cli-config-real-polling");
    await mkdir(signalConfigDir, { recursive: true });
    await mkdir(join(workspacePath, ".ambient-agent-state", "signal", "dogfood-polling-owner"), { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "signal", "dogfood-polling-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "dogfood-polling-owner",
        signalCliConfigDir: signalConfigDir,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: true,
      }),
    );
    const bindingStore = createMessagingBindingStore({
      stateRoot: store.getWorkspace().statePath,
      providers: createDefaultMessagingProviderRegistry(),
    });
    const createdBinding = bindingStore.create({
      providerId: "signal-cli",
      authProfileId: "dogfood-polling-owner",
      conversationId: "signal-polling-dogfood-conversation",
      purpose: "remote_ambient_surface",
      ownerUserId: "signal-polling-owner",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      metadata: {
        setupTool: "ambient_messaging_signal_remote_surface_apply",
        setupShape: "signal-owner-remote-ambient-surface",
        ownerHandoffSourceMessageId: "signal-polling-seed-message",
        initialSeenMessageIds: ["signal-polling-seed-message"],
      },
    });
    const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
    let unreadWindowRequestCount = 0;
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          contract: { kind: "ambient-signal-local-bridge", version: "v0" },
          stateRoot: workspacePath,
          profileCount: 1,
          capabilities: {
            profileStatus: true,
            metadataOnlyConversationDirectory: true,
            boundedUnreadWindow: true,
            approvedReplySend: false,
          },
        }));
        return;
      }
      if (request.url === "/profiles/dogfood-polling-owner/status") {
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-polling-owner",
          ready: true,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }));
        return;
      }
      if (request.url?.startsWith("/profiles/dogfood-polling-owner/conversations/signal-polling-dogfood-conversation/unread")) {
        unreadWindowRequestCount += 1;
        response.end(JSON.stringify({
          ok: true,
          providerId: "signal-cli",
          profileId: "dogfood-polling-owner",
          conversationId: "signal-polling-dogfood-conversation",
          messages: [{
            messageId: "signal-polling-command-1",
            senderId: "signal-polling-owner",
            senderLabel: "Signal Polling Owner",
            text: "polling private command text must not leak",
            receivedAt: "2026-05-10T00:00:02.000Z",
            outgoing: false,
          }],
        }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
    process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;

    try {
      const thread = store.createThread("Signal real polling approved dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.title === "Start Signal real polling?") {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Signal real polling dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging approved Signal real polling dogfood test.",
          `An active Signal Remote Ambient Surface binding already exists with bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, and ownerUserId signal-polling-owner.`,
          "Then call ambient_messaging_signal_real_polling_status with providerId signal-cli, limit 5, and intervalMs 300000.",
          `Then call ambient_messaging_signal_real_polling_preview with action start, providerId signal-cli, bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, limit 5, and intervalMs 300000.`,
          `Then call ambient_messaging_signal_real_polling_apply with action start, providerId signal-cli, bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, limit 5, and intervalMs 300000. The permission requester will approve Signal polling.`,
          "Then call ambient_messaging_signal_real_polling_status again and verify State running, Running yes, Timers active yes, and Accepted dispatches 1.",
          "Then call ambient_messaging_signal_real_polling_preview with action stop, providerId signal-cli, limit 5, and intervalMs 300000.",
          "Then call ambient_messaging_signal_real_polling_apply with action stop, providerId signal-cli, limit 5, and intervalMs 300000. Stop should not read messages or ask for approval.",
          "Then call ambient_messaging_signal_real_polling_status once more and verify State stopped, Running no, and Timers active no.",
          "Do not call ambient_messaging_signal_session_apply, ambient_messaging_signal_remote_surface_preview, ambient_messaging_signal_remote_surface_apply, ambient_messaging_list_bindings, ambient_messaging_signal_real_unread_window_apply, ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, reply, install, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK and include the phrases Signal real polling runner status, Signal real polling start preview, Signal real polling start apply, Apply status applied, Immediate poll, Accepted dispatches 1, State running, Signal real polling stop preview, Signal real polling stop apply, State stopped, no Signal message bodies returned, and no Signal messages sent.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK",
      });

      expect(transcript).toContain("ambient_messaging_signal_real_polling_status completed");
      expect(transcript).toContain("ambient_messaging_signal_real_polling_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_real_polling_apply completed");
      expect(transcript).toContain("Signal real polling runner status");
      expect(transcript).toContain("Signal real polling start preview");
      expect(transcript).toContain("Signal real polling start apply");
      expect(transcript).toContain("Apply status: applied");
      expect(transcript).toContain("Immediate poll");
      expect(transcript).toContain("Accepted dispatches: 1");
      expect(transcript).toContain("State: running");
      expect(transcript).toContain("Signal real polling stop preview");
      expect(transcript).toContain("Signal real polling stop apply");
      expect(transcript).toContain("State: stopped");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK");
      expect(transcript).not.toContain("ambient_messaging_signal_real_unread_window_apply completed");
      expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
      expect(transcript).not.toContain("polling private command text must not leak");
      expect(unreadWindowRequestCount).toBe(1);
    } finally {
      restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 180_000);

  itLive("routes Telegram chat discovery through the typed conversation-directory preview boundary", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram directory boundary dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "dogfood-owner",
        phoneNumber: "+15550000000",
        tdlibStateDir,
        databaseEncryptionKey: "dogfood-key",
      }),
      "utf8",
    );

    const thread = store.createThread("Telegram directory boundary dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Telegram directory boundary dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient Telegram conversation-directory boundary dogfood test.",
          "Call ambient_messaging_list_providers.",
          "Then call ambient_messaging_conversation_directory_preview with providerId telegram-tdlib, authProfileId dogfood-owner, purpose remote_ambient_surface, and limit 5.",
          "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
          "Do not call ambient_messaging_telegram_conversation_directory_apply, lifecycle, shell, browser, Telegram Desktop UI, provider CLI, bridge polling, bridge reply, binding apply, install, or any send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_BOUNDARY_OK and include the phrases Telegram provider directory preview, Provider directory tool ambient_messaging_telegram_conversation_directory_preview, real mode blocker, no Telegram messages read, no Telegram messages sent, and no shell/browser fallback.",
        ],
        expected: "MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_BOUNDARY_OK",
      });
    } finally {
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_list_providers completed");
    expect(transcript).toContain("ambient_messaging_conversation_directory_preview completed");
    expect(transcript).toContain("ambient_messaging_telegram_conversation_directory_preview completed");
    expect(transcript).toContain("Provider directory tool: ambient_messaging_telegram_conversation_directory_preview");
    expect(transcript).toContain("Telegram provider is not running in real mode");
    expect(transcript).toContain("Reads provider messages: no");
    expect(transcript).toContain("Sends provider messages: no");
    expect(transcript).not.toContain("ambient_messaging_telegram_conversation_directory_apply completed");
  }, 240_000);

  itLive("dogfoods Telegram directory result through binding and owner-route previews", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram directory-to-binding dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    const originalFetch = globalThis.fetch;
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "dogfood-owner",
        phoneNumber: "+15550000000",
        tdlibStateDir,
        databaseEncryptionKey: "dogfood-key",
      }),
      "utf8",
    );
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl);
      if (url.origin !== "http://127.0.0.1:19092") {
        return originalFetch(input as RequestInfo | URL, init);
      }
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            ok: true,
            stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
            sessionCount: 1,
          }),
        } as Response;
      }
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/sessions/dogfood-owner/chats") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            chats: [{
              id: "telegram-dogfood-chat",
              title: "Dogfood Owner Chat",
              type: "private",
              unreadCount: 0,
              folderIds: [1],
              updatedAt: "2026-05-10T00:00:00.000Z",
            }],
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "not found" }),
      } as Response;
    }) as typeof fetch;
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19092";

    const thread = store.createThread("Telegram directory to binding dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Telegram directory-to-binding dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient Telegram directory-to-binding dogfood test.",
          "Use exact profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, messageId dogfood-message-1.",
          "Call ambient_messaging_gateway_lifecycle_apply with action start, providerId telegram-tdlib, and mode real.",
          "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
          "Then call ambient_messaging_telegram_conversation_directory_apply with profileId dogfood-owner and limit 5.",
          "Then call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create arguments.",
          "Then call ambient_messaging_telegram_bridge_event_route with profileId dogfood-owner, conversationId telegram-dogfood-chat, messageId dogfood-message-1, senderId owner-1, senderLabel Owner, and text status.",
          "Then call ambient_messaging_telegram_relay_diagnostics with profileId dogfood-owner and conversationId telegram-dogfood-chat.",
          "Then call ambient_messaging_telegram_bridge_reply_preview using the queuedProjectionId from the route result and text exactly Ambient received your status request.",
          "Finally call ambient_messaging_telegram_remote_surface_apply with action revoke, the bindingId from the create apply result, and reason dogfood cleanup.",
          "Do not call ambient_messaging_telegram_bridge_reply_apply, polling, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_TO_BINDING_OK and include the phrases metadata-only directory row, Remote Ambient Surface binding applied, owner route accepted, relay diagnostics ready, reply preview ready, binding revoked, no Telegram messages read, no Telegram messages sent.",
        ],
        expected: "MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_TO_BINDING_OK",
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_gateway_lifecycle_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_conversation_directory_apply completed");
    expect(transcript).toContain("Failure mode: none");
    expect(transcript).toContain("telegram-dogfood-chat: Dogfood Owner Chat");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).toContain("ambient_messaging_telegram_relay_diagnostics completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_reply_preview completed");
    expect(transcript).toContain("Bridge mode: real Telegram bridge running");
    expect(transcript).not.toContain("ambient_messaging_telegram_bridge_reply_apply completed");
  }, 420_000);

  itTelegramOwnerLoopLive("dogfoods Telegram owner handoff through real-mode poll and reply tools", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram owner-loop dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const previousTelegramEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
    };
    const originalFetch = globalThis.fetch;
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
    const setupCode = "AMBIENT-HANDOFF-DOGFOOD-123456";
    const sentMessages: unknown[] = [];
    let unreadCallCount = 0;
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
      JSON.stringify({
        profileId: "dogfood-owner",
        phoneNumber: "+15550000000",
        tdlibStateDir,
        databaseEncryptionKey: "dogfood-key",
      }),
      "utf8",
    );
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl);
      if (url.origin !== "http://127.0.0.1:19093") {
        return originalFetch(input as RequestInfo | URL, init);
      }
      const method = init?.method ?? "GET";
      if (method === "GET" && url.pathname === "/") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            ok: true,
            stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
            sessionCount: 1,
          }),
        } as Response;
      }
      if (method === "GET" && url.pathname === "/sessions/dogfood-owner/chats") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            chats: [{
              id: "telegram-dogfood-chat",
              title: "Dogfood Owner Chat",
              type: "private",
              unreadCount: 2,
              folderIds: [1],
              updatedAt: "2026-05-10T00:00:00.000Z",
            }],
          }),
        } as Response;
      }
      if (method === "GET" && url.pathname === "/sessions/dogfood-owner/inbox/unread") {
        unreadCallCount += 1;
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            messages: unreadCallCount === 1
              ? [
                {
                  id: "dogfood-noise",
                  chatId: "telegram-dogfood-chat",
                  outgoing: false,
                  text: "private setup noise must not leak",
                  date: "2026-05-10T00:00:01.000Z",
                },
                {
                  id: "dogfood-handoff",
                  chatId: "telegram-dogfood-chat",
                  outgoing: false,
                  text: setupCode,
                  date: "2026-05-10T00:00:02.000Z",
                },
              ]
              : [
                {
                  id: "dogfood-handoff",
                  chatId: "telegram-dogfood-chat",
                  outgoing: false,
                  text: setupCode,
                  date: "2026-05-10T00:00:02.000Z",
                },
                {
                  id: "dogfood-status",
                  chatId: "telegram-dogfood-chat",
                  outgoing: false,
                  text: "status",
                  date: "2026-05-10T00:00:03.000Z",
                },
              ],
          }),
        } as Response;
      }
      if (
        method === "GET" &&
        (
          url.pathname === "/sessions/dogfood-owner/chats/telegram-dogfood-chat/messages/dogfood-handoff/sender-profile" ||
          url.pathname === "/sessions/dogfood-owner/chats/telegram-dogfood-chat/messages/dogfood-status/sender-profile"
        )
      ) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            sender: {
              kind: "user",
              user: {
                userId: "owner-1",
                displayName: "Owner",
              },
            },
          }),
        } as Response;
      }
      if (method === "POST" && url.pathname === "/sessions/dogfood-owner/messages/send") {
        sentMessages.push(typeof init?.body === "string" ? JSON.parse(init.body) : init?.body);
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            messageId: "dogfood-reply-1",
            date: "2026-05-10T00:00:04.000Z",
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "not found" }),
      } as Response;
    }) as typeof fetch;
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
    process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19093";

    const thread = store.createThread("Telegram owner loop dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_reply_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected permission prompt during Telegram owner-loop dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    let transcript = "";
    try {
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is step 1 of a focused Ambient Telegram owner-loop dogfood test.",
          `Use exact profileId dogfood-owner, conversationId telegram-dogfood-chat, setupCode ${setupCode}, and ownerUserId owner-1 once handoff returns it.`,
          "Call ambient_messaging_gateway_lifecycle_apply with action start, providerId telegram-tdlib, and mode real.",
          "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
          "Then call ambient_messaging_telegram_conversation_directory_apply with profileId dogfood-owner and limit 5.",
          "Then call ambient_messaging_telegram_owner_handoff_preview with profileId dogfood-owner, conversationId telegram-dogfood-chat, setupCode from above, and limit 5.",
          "Then call ambient_messaging_telegram_owner_handoff_apply with those same handoff arguments.",
          "Then call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_telegram_remote_surface_apply with the same create arguments and ownerHandoffSourceMessageId set to the sourceMessageId from the handoff apply result.",
          "Do not poll, send replies, call bridge_event_route, call synthetic_route, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_SETUP_OK and include the phrases owner handoff matched, metadata-only directory row, Remote Ambient Surface binding applied, no Telegram Desktop fallback.",
        ],
        expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_SETUP_OK",
      });
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is step 2 of the same Telegram owner-loop dogfood test.",
          "Use the existing active dogfood-owner Remote Ambient Surface binding from step 1.",
          "Then call ambient_messaging_telegram_bridge_poll_preview with profileId dogfood-owner and limit 5.",
          "Then call ambient_messaging_telegram_bridge_poll_apply with profileId dogfood-owner and limit 5.",
          "Read the queued projection id from the poll apply result or gateway status.",
          "Then call ambient_messaging_remote_surface_command_preview with that queuedProjectionId.",
          "Then call ambient_messaging_remote_surface_command_apply with that same queuedProjectionId.",
          "Then call ambient_messaging_telegram_bridge_reply_preview with that same queuedProjectionId and text exactly Ambient status ready from owner loop dogfood.",
          "Then call ambient_messaging_telegram_bridge_reply_apply with that same queuedProjectionId and exact text.",
          "Do not call ambient_messaging_telegram_bridge_event_route, ambient_messaging_synthetic_route, lifecycle, directory, handoff, binding create, binding revoke, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_POLL_REPLY_OK and include the phrases real-mode poll accepted, queued projection id visible, Remote Ambient Surface command apply, Telegram reply sent, no synthetic route.",
        ],
        expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_POLL_REPLY_OK",
      });
      transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is step 3 of the same Telegram owner-loop dogfood test.",
          "Call ambient_messaging_telegram_remote_surface_apply with action revoke, the bindingId from the step 1 create apply result, and reason dogfood cleanup.",
          "Do not call polling, reply, bridge_event_route, synthetic_route, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
          "After checking the tool result, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_CLEANUP_OK and include the phrase binding revoked.",
        ],
        expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_CLEANUP_OK",
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
      restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
    }

    expect(transcript).toContain("ambient_messaging_telegram_owner_handoff_apply completed");
    expect(transcript).toContain("Use ownerUserId owner-1");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_poll_apply completed");
    expect(transcript).toContain("Queued projection:");
    expect(transcript).toContain("Duplicate messages: 1");
    expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
    expect(transcript).toContain("ambient_messaging_telegram_bridge_reply_apply completed");
    expect(transcript).toContain("Delivery status: sent");
    expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
    expect(transcript).not.toContain("ambient_messaging_telegram_bridge_event_route completed");
    expect(transcript).not.toContain("ambient_messaging_synthetic_route completed");
    expect(transcript).not.toContain("private setup noise must not leak");
    expect(sentMessages).toEqual([{
      chatId: "telegram-dogfood-chat",
      text: "Ambient status ready from owner loop dogfood",
      replyToMessageId: "dogfood-status",
    }]);
  }, 420_000);

  itLive("preserves generic plugin markdown input metadata from a live Ambient run", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin markdown longform dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    await trustFixturePlugin(store, workspacePath);
    const markdown = ["# Long Plugin Markdown", "", "This payload exists to exercise generic plugin input preview metadata.", "details ".repeat(90)].join("\n");
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
  }, 240_000);

  itLive("preserves large plugin MCP output metadata from a live Ambient run", async () => {
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
    const largeOutputPreview = (pluginMessage?.metadata?.toolResultDetails as
      | { largeOutputPreview?: { items?: Array<{ chars?: number; previewChars?: number; artifactPath?: string }> } }
      | undefined)?.largeOutputPreview;
    const artifactPath = largeOutputPreview?.items?.[0]?.artifactPath;

    expect(transcript).toContain("PLUGIN_OUTPUT_METADATA_OK");
    expect(transcript).toContain("outputLines");
    expect(largeOutputPreview?.items?.[0]?.chars).toBeGreaterThan(12_000);
    expect(largeOutputPreview?.items?.[0]?.previewChars).toBe(12_000);
    expect(artifactPath).toMatch(/^\.ambient\/tool-outputs\/.+\.txt$/);
    const artifact = await readFile(join(workspacePath, artifactPath!), "utf8");
    expect(artifact).toContain("pluginOutputLine 0260");
  }, 240_000);

  itLive("switches Ambient voice provider and voice through chat settings tools", async () => {
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
  }, 240_000);

  itLive("lists cached dynamic voice catalog entries through chat settings tools", async () => {
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
        { id: "british-warm-narrator", label: "British Warm Narrator", locale: "en-GB", language: "English", style: ["warm", "narration"] },
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
  }, 180_000);

  itLive("surfaces Qwen ASR needs-runtime metadata through live Ambient STT status", async () => {
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

      const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
  }, 240_000);

  itLive("selects and tests bundled faster-whisper STT through live Ambient tools", async () => {
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

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
    expect(audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ threadId: thread.id, toolName: "ambient_stt_select", decision: "allowed" }),
      expect.objectContaining({ threadId: thread.id, toolName: "ambient_stt_test", decision: "allowed" }),
    ]));
  }, 360_000);

  itLive("plans a generated Ambient capability through the read-only Capability Builder tool", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Capability Builder dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Capability Builder planning dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop Capability Builder dogfood test.",
        "Call ambient_capability_builder_plan for a capability that generates WAV files from text using Piper.",
        "Use goal exactly: Generate WAV voice files from text using Piper.",
        "Use provider Piper, kind artifact generator, outputFileArtifacts WAV, and locality local.",
        "Do not use shell, browser, ambient_cli, plugin install, scaffold, dependency install, register, or activation tools.",
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_plan completed");
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 240_000);

  itLive("plans a network/API generated capability with env and host requirements", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live network/API Capability Builder dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Capability Builder network API plan dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Capability Builder network/API planning dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop Capability Builder network/API planning dogfood test.",
        "Call ambient_capability_builder_plan for a capability that searches Brave Search using a tiny API smoke request.",
        "Use goal exactly: Search Brave Search with an approved API key and return concise JSON results.",
        "Use provider Brave Search, kind connector/API, locality network, envNames [\"BRAVE_API_KEY\"], networkHosts [\"api.search.brave.com\"], responseFormats JSON, and no outputFileArtifacts.",
        "Do not use shell, browser, ambient_cli, plugin install, scaffold, dependency install, register, activation, or secret tools.",
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_NETWORK_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_NETWORK_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_plan completed");
    expect(transcript).toContain("Env requirements: BRAVE_API_KEY");
    expect(transcript).toContain("Network hosts: api.search.brave.com");
    expect(transcript).toContain("Installer shape: search-provider");
    expect(transcript).toContain("Response formats: JSON");
    expect(transcript).toContain("File artifacts: none unless the capability intentionally creates files");
    expect(transcript).toContain("Network/API capabilities must declare exact networkHosts");
    expect(transcript).toContain("Secret values must never enter chat");
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 240_000);

  itLive("normalizes known cloud TTS provider planning into the Ambient voice-provider path", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live cloud TTS provider planning dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Capability Builder cloud TTS provider plan dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during cloud TTS provider planning dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop cloud TTS provider planning dogfood test.",
        "The user wants Ambient to set up ElevenLabs so assistant replies can be read aloud in chat.",
        "Call ambient_capability_builder_plan once. Use provider ElevenLabs and goal exactly: Set up ElevenLabs so Ambient can read assistant replies aloud.",
        "Do not provide installerShape, envNames, networkHosts, outputFileArtifacts, or locality yourself; let Ambient apply any product-level TTS provider defaults.",
        "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, or secret tools.",
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_ELEVENLABS_TTS_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain("CAPABILITY_BUILDER_ELEVENLABS_TTS_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_plan completed");
    expect(transcript).toContain("Installer shape: tts-provider");
    expect(transcript).toContain("Execution locality: network");
    expect(transcript).toContain("File artifacts: MP3");
    expect(transcript).toContain("Env requirements: ELEVENLABS_API_KEY");
    expect(transcript).toContain("Network hosts: api.elevenlabs.io");
    expect(transcript).toContain("Use the first-party ElevenLabs tts-provider template");
    expect(transcript).toContain("ambient_capability_builder_secret_request");
    expect(transcript).toContain("Provider selection rules");
    expect(transcript).toContain("cost-incurring API use");
    expect(transcript).toContain("Health vs validation");

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now repeat the same boundary-normalization check for Cartesia.",
        "Call ambient_capability_builder_plan once. Use provider Cartesia and goal exactly: Set up Cartesia so Ambient can read assistant replies aloud.",
        "Do not provide installerShape, envNames, networkHosts, outputFileArtifacts, or locality yourself; let Ambient apply any product-level TTS provider defaults.",
        "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, or secret tools.",
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_CARTESIA_TTS_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const finalTranscript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(finalTranscript).toContain("CAPABILITY_BUILDER_CARTESIA_TTS_PLAN_OK");
    expect(finalTranscript).toContain("Installer shape: tts-provider");
    expect(finalTranscript).toContain("Execution locality: network");
    expect(finalTranscript).toContain("File artifacts: WAV");
    expect(finalTranscript).toContain("Env requirements: CARTESIA_API_KEY");
    expect(finalTranscript).toContain("Network hosts: api.cartesia.ai");
    expect(finalTranscript).toContain("Use the first-party Cartesia tts-provider template");
    const audit = store.listPermissionAudit(20);
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 240_000);

  itLive("plans a known deep-research provider with catalog guardrails", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live deep-research provider planning dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Capability Builder deep research provider plan dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during deep-research provider planning dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop deep-research provider planning dogfood test.",
        "Call ambient_capability_builder_plan once. Use provider LiteResearcher-4B and goal exactly: Set up LiteResearcher-4B for bounded Ambient deep research experiments.",
        "Do not provide installerShape, envNames, networkHosts, responseFormats, modelAssets, outputFileArtifacts, or locality yourself; let Ambient apply provider catalog defaults.",
        "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, or secret tools.",
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_DEEP_RESEARCH_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain("CAPABILITY_BUILDER_DEEP_RESEARCH_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_plan completed");
    expect(transcript).toContain("Installer shape: custom-cli");
    expect(transcript).toContain("Selected known provider card: LiteResearcher-4B (deep.literesearcher-4b)");
    expect(transcript).toContain("Provider selection rules");
    expect(transcript).toContain("Research evidence");
    expect(transcript).toContain("Retrieval/deep-research planning guardrails");
    expect(transcript).toContain("trace/source/report artifacts");
  }, 240_000);

  itLive("plans known social and agentic connectors with catalog guardrails", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live social/agentic connector planning dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Capability Builder social and agentic connector plan dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during social/agentic connector planning dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop social connector planning dogfood test.",
        "Call ambient_capability_builder_plan once. Use provider Bluesky and goal exactly: Set up a Bluesky connector that drafts posts and only publishes after approval.",
        "Use kind connector/API, but do not provide installerShape, envNames, networkHosts, responseFormats, outputFileArtifacts, or locality yourself; let Ambient apply provider catalog defaults.",
        "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, secret, OAuth, social-posting, or external API tools.",
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_BLUESKY_CONNECTOR_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain("CAPABILITY_BUILDER_BLUESKY_CONNECTOR_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_plan completed");
    expect(transcript).toContain("Installer shape: connector");
    expect(transcript).toContain("Selected known provider card: Bluesky / AT Protocol (social.bluesky-atproto)");
    expect(transcript).toContain("Env requirements: BLUESKY_APP_PASSWORD");
    expect(transcript).toContain("Social/agentic connector planning guardrails");
    expect(transcript).toContain("Do not bypass official APIs");

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now repeat the same catalog-backed connector planning check for Stripe Sandbox.",
        "Call ambient_capability_builder_plan once. Use provider Stripe and goal exactly: Set up Stripe Sandbox for typed previews and sandbox PaymentIntent smoke tests.",
        "Use kind connector/API, but do not provide installerShape, envNames, networkHosts, responseFormats, outputFileArtifacts, or locality yourself; let Ambient apply provider catalog defaults.",
        "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, secret, OAuth, Stripe, payment, or external API tools.",
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_STRIPE_CONNECTOR_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const finalTranscript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(finalTranscript).toContain("CAPABILITY_BUILDER_STRIPE_CONNECTOR_PLAN_OK");
    expect(finalTranscript).toContain("Selected known provider card: Stripe Sandbox (agentic-services.stripe-sandbox)");
    expect(finalTranscript).toContain("Env requirements: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET");
    expect(finalTranscript).toContain("sandbox-only");
    expect(finalTranscript).toContain("Idempotency-Key");
    expect(finalTranscript).toContain("Reject live payment/banking keys");
    const audit = store.listPermissionAudit(20);
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 300_000);

  itLive.each([
    {
      provider: "ElevenLabs",
      packageName: "ambient-elevenlabs-pi-flow",
      envName: "ELEVENLABS_API_KEY",
      output: "MP3",
      expectedHost: "api.elevenlabs.io",
      okToken: "CAPABILITY_BUILDER_ELEVENLABS_FULL_FLOW_OK",
    },
    {
      provider: "Cartesia",
      packageName: "ambient-cartesia-pi-flow",
      envName: "CARTESIA_API_KEY",
      output: "WAV",
      expectedHost: "api.cartesia.ai",
      okToken: "CAPABILITY_BUILDER_CARTESIA_FULL_FLOW_OK",
    },
  ])("completes the approved $provider cloud TTS provider setup through live Pi turns", async ({ provider, packageName, envName, output, expectedHost, okToken }) => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live cloud TTS provider setup dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const providerSecret = await readDogfoodSecret(envName, `${envName.toLowerCase()}.txt`);

    const emittedEvents: DesktopEvent[] = [];
    const permissionResolutions: Array<Omit<PermissionPromptResolution, "mode"> & { mode: PermissionPromptResolution["mode"] }> = [];
    let voiceSettings: VoiceSettings = {
      enabled: false,
      mode: "off",
      autoplay: false,
      maxChars: 1500,
      longReply: "summarize",
      format: output === "MP3" ? "mp3" : "wav",
      artifactCacheMaxMb: 30,
    };
    const thread = store.createThread(`${provider} cloud TTS provider full-flow dogfood`);
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
          if (!["ambient_capability_builder_scaffold", "ambient_capability_builder_validate", "ambient_capability_builder_register"].includes(request.toolName)) {
            throw new Error(`Unexpected permission prompt during ${provider} cloud TTS setup dogfood: ${request.title}`);
          }
          permissionResolutions.push({ allowed: true, mode: "allow_once" });
          return { allowed: true, mode: "allow_once" };
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
          createMediaUrl: ({ relativePath }) => `ambient-media://dogfood/${encodeURIComponent(relativePath)}`,
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
        `This is an Ambient Desktop ${provider} cloud TTS provider full setup dogfood test.`,
        `The user has approved planning and scaffolding a ${provider} provider so Ambient can read assistant replies aloud.`,
        `Call ambient_capability_builder_plan once with provider ${provider} and goal exactly: Set up ${provider} so Ambient can read assistant replies aloud.`,
        `Then call ambient_capability_builder_scaffold once with name ${packageName}, provider ${provider}, and the same goal.`,
        "Do not provide installerShape, envNames, networkHosts, outputFileArtifactTypes, or locality yourself; let Ambient apply product-level TTS provider defaults.",
        "Do not call secret, validate, register, ambient_cli, browser, or shell tools in this turn.",
        `After scaffolding completes, answer with exactly ${provider.toUpperCase()}_TTS_SCAFFOLDED and nothing else.`,
      ].join("\n"),
    });

    let transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain(`${provider.toUpperCase()}_TTS_SCAFFOLDED`);
    expect(transcript).toContain("ambient_capability_builder_plan completed");
    expect(transcript).toContain("ambient_capability_builder_scaffold completed");
    expect(transcript).toContain("Installer shape: tts-provider");
    expect(transcript).toContain(`Env requirements: ${envName}`);
    expect(transcript).toContain(`Network hosts: ${expectedHost}`);

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        `Request the Builder-scoped Desktop secret dialog for ${packageName}.`,
        `Call ambient_capability_builder_secret_request with packageName ${packageName} and envName ${envName}.`,
        "Do not ask me to paste the key into chat. Do not validate, register, use ambient_cli, shell, or browser tools in this turn.",
        `After the secret request tool result is available, answer with exactly ${provider.toUpperCase()}_TTS_SECRET_REQUESTED and nothing else.`,
      ].join("\n"),
    });

    transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain(`${provider.toUpperCase()}_TTS_SECRET_REQUESTED`);
    expect(transcript).toContain("Capability Builder secret dialog requested");
    expect(emittedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ambient-cli-secret-requested",
          packageName,
          envName,
        }),
      ]),
    );
    const secretEvent = emittedEvents.find((event) => event.type === "ambient-cli-secret-requested" && event.packageName === packageName && event.envName === envName);
    expect(secretEvent && "builderSourcePath" in secretEvent ? secretEvent.builderSourcePath : "").toContain(`.ambient/capability-builder/packages/${packageName}`);

    await saveCapabilityBuilderEnvSecret(workspacePath, {
      packageName,
      envName,
      value: providerSecret,
    });

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "The Desktop secret dialog has been completed.",
        `Call ambient_capability_builder_validate with packageName ${packageName} and includeSmokeTests true.`,
        `After validation succeeds, call ambient_capability_builder_register with packageName ${packageName}.`,
        "Do not call ambient_cli, shell, browser, or package install tools.",
        `After registration completes, answer with exactly ${okToken} and mention the voice provider setup completion status.`,
      ].join("\n"),
    });

    transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(200);
    expect(transcript).toContain(okToken);
    expect(transcript).toContain("ambient_capability_builder_validate completed");
    expect(transcript).toContain("Ambient Capability Builder validation");
    expect(transcript).toContain("Status: succeeded");
    expect(transcript).toContain("ambient_capability_builder_register completed");
    expect(transcript).toContain("Registered voice provider:");
    expect(transcript).toContain("Voice provider setup completion");
    expect(transcript).toContain("Selected and enabled this provider because no voice provider was configured.");
    expect(transcript).toContain("runtime dogfood: succeeded");
    expect(voiceSettings.enabled).toBe(true);
    expect(voiceSettings.autoplay).toBe(true);
    expect(voiceSettings.mode).toBe("assistant-final");
    expect(voiceSettings.providerCapabilityId).toContain(packageName);
    expect(transcript).not.toContain(providerSecret);
    expect(JSON.stringify(audit)).not.toContain(providerSecret);
    expect(permissionResolutions.length).toBeGreaterThanOrEqual(3);
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_scaffold", decision: "allowed" }),
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
      ]),
    );

    const selectedCapabilityId = voiceSettings.providerCapabilityId;
    const unregistered = await unregisterCapabilityBuilderPackage(workspacePath, { packageName });
    expect(unregistered.preserved).toMatchObject({ builderSource: true, envSecrets: true });
    expect(unregistered.removedPackage.name).toBe(packageName);

    const reregistered = await registerCapabilityBuilderPackage(workspacePath, { packageName });
    expect(reregistered.voiceProvider).toMatchObject({ available: true });
    expect(reregistered.voiceProvider?.capabilityId).toBe(selectedCapabilityId);
    const rerunOutput = join(workspacePath, `${packageName}-rollback.${output === "MP3" ? "mp3" : "wav"}`);
    const rerun = await runAmbientCliPackageCommand(workspacePath, {
      packageId: reregistered.installedPackage.id,
      command: reregistered.voiceProvider!.command,
      args: [
        "--text",
        `Ambient ${provider} rollback dogfood.`,
        "--output",
        rerunOutput,
        "--format",
        output === "MP3" ? "mp3" : "wav",
        "--voice",
        reregistered.voiceProvider!.voices[0]?.id ?? "default",
      ],
    });
    expect(rerun.stdout).toContain("audioPath");
    expect((await stat(rerunOutput)).size).toBeGreaterThan(0);
    expect(voiceSettings.providerCapabilityId).toBe(selectedCapabilityId);
    expect(JSON.stringify(unregistered)).not.toContain(providerSecret);
    expect(JSON.stringify(reregistered)).not.toContain(providerSecret);
    expect(JSON.stringify(rerun)).not.toContain(providerSecret);
  }, 600_000);

  itLive("completes the approved Piper local TTS provider setup through live Pi turns", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Piper local TTS provider setup dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const modelPath = await readDogfoodFilePath("PIPER_VOICE_MODEL_FILE", "the cached en_US-lessac-medium.onnx Piper voice model");
    const configPath = await readDogfoodFilePath("PIPER_VOICE_CONFIG_FILE", "the cached en_US-lessac-medium.onnx.json Piper voice config");
    const packageName = "ambient-piper-local-pi-flow";
    const commandName = "piper_local_pi_flow";
    const installScript = [
      "const fs = require('node:fs');",
      "fs.mkdirSync('models', { recursive: true });",
      "fs.copyFileSync(process.argv[1], 'models/en_US-lessac-medium.onnx');",
      "fs.copyFileSync(process.argv[2], 'models/en_US-lessac-medium.onnx.json');",
    ].join(" ");

    let voiceSettings: VoiceSettings = {
      enabled: false,
      mode: "off",
      autoplay: false,
      maxChars: 1500,
      longReply: "summarize",
      format: "wav",
      artifactCacheMaxMb: 30,
    };
    const thread = store.createThread("Piper local TTS provider full-flow dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (!["ambient_capability_builder_scaffold", "ambient_capability_builder_install_deps", "ambient_capability_builder_validate", "ambient_capability_builder_register", "ambient_cli"].includes(request.toolName)) {
            throw new Error(`Unexpected permission prompt during Piper local TTS setup dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
          createMediaUrl: ({ relativePath }) => `ambient-media://dogfood/${encodeURIComponent(relativePath)}`,
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
        "This is an Ambient Desktop Piper local TTS provider full setup dogfood test.",
        "The user has approved planning and scaffolding a Piper provider so Ambient can read assistant replies aloud locally.",
        "Call ambient_capability_builder_plan once with provider Piper and goal exactly: Set up Piper so Ambient can read assistant replies aloud.",
        "Then call ambient_capability_builder_scaffold once with name piper-local-pi-flow, provider Piper, kind tts-provider, locality local, outputFileArtifactTypes WAV, and the same goal.",
        "Do not install dependencies, copy assets, validate, register, run ambient_cli, use shell, or use browser tools in this turn.",
        "After scaffolding completes, answer with exactly PIPER_LOCAL_TTS_SCAFFOLDED and nothing else.",
      ].join("\n"),
    });

    let transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain("PIPER_LOCAL_TTS_SCAFFOLDED");
    expect(transcript).toContain("ambient_capability_builder_plan completed");
    expect(transcript).toContain("ambient_capability_builder_scaffold completed");
    expect(transcript).toContain("Installer shape: tts-provider");
    expect(transcript).toContain("Piper");
    expect(transcript).toContain("Piper voice model");

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "The user approved preparing package-local Piper model assets from already-present cached files.",
        `Call ambient_capability_builder_install_deps with packageName ${packageName}.`,
        `Use exactly one command object with command node, args ${JSON.stringify(["-e", installScript, modelPath, configPath])}, cwd ".", rationale "Copy already-present approved Piper voice assets into the provider-local models directory for local validation."`,
        `After install_deps succeeds, call ambient_capability_builder_validate with packageName ${packageName} and includeSmokeTests true.`,
        `After validation succeeds, call ambient_capability_builder_register with packageName ${packageName}.`,
        "Do not call ambient_cli, shell, browser, or secret tools in this turn.",
        "After registration completes, answer with exactly PIPER_LOCAL_TTS_REGISTERED and mention the voice provider setup completion status.",
      ].join("\n"),
    });

    transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(200);
    expect(transcript).toContain("PIPER_LOCAL_TTS_REGISTERED");
    expect(transcript).toContain("ambient_capability_builder_install_deps completed");
    expect(transcript).toContain("ambient_capability_builder_validate completed");
    expect(transcript).toContain("Status: succeeded");
    expect(transcript).toContain("ambient_capability_builder_register completed");
    expect(transcript).toContain("Registered voice provider:");
    expect(transcript).toContain("Selected and enabled this provider because no voice provider was configured.");
    expect(voiceSettings).toMatchObject({
      enabled: true,
      autoplay: true,
      mode: "assistant-final",
      providerCapabilityId: expect.stringContaining(packageName),
      format: "wav",
    });
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_install_deps", decision: "allowed" }),
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
      ]),
    );
    const validationLog = await readFile(join(workspacePath, ".ambient", "capability-builder", "packages", packageName, "capability-validation-log.jsonl"), "utf8");
    expect(validationLog).toContain("\"source\":\"providerContract\"");
    expect(validationLog).toContain("validation-artifacts");
    expect(validationLog).toContain("audio/wav");

    const outputPath = join(workspacePath, "piper-local-pi-flow.wav");
    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is a fresh installed-use check for the registered Piper local TTS provider.",
        `Call ambient_cli_describe with packageName ${packageName} and command ${commandName}.`,
        `Then call ambient_cli with packageName ${packageName}, command ${commandName}, and args ${JSON.stringify(["--text", "Ambient Piper local dogfood.", "--output", outputPath, "--format", "wav", "--voice", "default"])}.`,
        "Do not use shell, browser, install, validate, register, or repair tools.",
        "After ambient_cli completes, answer with exactly PIPER_LOCAL_TTS_RUN_OK and include the generated audio path.",
      ].join("\n"),
    });

    transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain("ambient_cli_describe completed");
    expect(transcript).toContain("ambient_cli completed");
    expect(transcript).toContain("PIPER_LOCAL_TTS_RUN_OK");
    expect(transcript).toContain(outputPath);
    expect((await stat(outputPath)).size).toBeGreaterThan(0);
  }, 600_000);

  itLive("scaffolds a generated Ambient capability through Capability Builder", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder scaffold dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Capability Builder scaffold dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_capability_builder_scaffold") {
            throw new Error(`Unexpected permission prompt during Capability Builder scaffold dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
        "This is an Ambient Desktop Capability Builder scaffold dogfood test.",
        "Call ambient_capability_builder_scaffold with name piper-tts, goal exactly Generate WAV voice files from text using Piper, provider Piper, kind artifact generator, outputFileArtifactTypes WAV, and locality local.",
        "Do not install dependencies, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
        "After the scaffold tool completes, answer with exactly CAPABILITY_BUILDER_SCAFFOLD_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_SCAFFOLD_OK");
    expect(transcript).toContain("ambient_capability_builder_scaffold completed");
    await expect(readFile(join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "ambient-cli.json"), "utf8")).resolves.toContain(
      "ambient-piper-tts",
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_scaffold", decision: "allowed" }),
      ]),
    );
  }, 240_000);

  itLive("previews a generated Ambient capability through the read-only Capability Builder tool", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder preview dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });

    const thread = store.createThread("Capability Builder preview dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Capability Builder preview dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop Capability Builder preview dogfood test.",
        "Call ambient_capability_builder_preview with packageName ambient-piper-tts.",
        "Do not scaffold, install dependencies, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
        "After the preview tool completes, answer with exactly CAPABILITY_BUILDER_PREVIEW_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_PREVIEW_OK");
    expect(transcript).toContain("ambient_capability_builder_preview completed");
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 240_000);

  itLive("plans a generated Ambient capability update through the read-only Capability Builder tool", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder update-plan dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });

    const thread = store.createThread("Capability Builder update-plan dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Capability Builder update-plan dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop Capability Builder update-plan dogfood test.",
        "Call ambient_capability_builder_update_plan with packageName ambient-piper-tts.",
        "Use requestedChanges exactly: Add a speed option while preserving WAV artifact output.",
        "Do not call preview separately. Do not scaffold, edit files, install dependencies, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
        "After the update-plan tool completes, answer with exactly CAPABILITY_BUILDER_UPDATE_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_UPDATE_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_update_plan completed");
    expect(transcript).not.toContain("ambient_capability_builder_preview completed");
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 240_000);

  itLive("plans generated Ambient capability removal through the read-only Capability Builder tool", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder removal-plan dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });

    const thread = store.createThread("Capability Builder removal-plan dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Capability Builder removal-plan dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop Capability Builder removal-plan dogfood test.",
        "Call ambient_capability_builder_removal_plan with packageName ambient-piper-tts.",
        "Use installedPackageId exactly ambient-cli:generated:ambient-piper-tts.",
        "Use installedSource exactly ./.ambient/cli-packages/imported/ambient-piper-tts.",
        "Use reason exactly: User wants to hide the capability while preserving source and artifacts.",
        "Do not call preview separately. Do not delete files, unregister, disable, edit package state, remove secrets, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
        "After the removal-plan tool completes, answer with exactly CAPABILITY_BUILDER_REMOVAL_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_REMOVAL_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_removal_plan completed");
    expect(transcript).not.toContain("ambient_capability_builder_preview completed");
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 240_000);

  itLive("plans generated Ambient capability repair through the read-only Capability Builder tool", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder repair-plan dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const brokenRoot = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-broken-tts");
    await mkdir(brokenRoot, { recursive: true });
    await writeFile(
      join(brokenRoot, "ambient-cli.json"),
      `${JSON.stringify({ version: "0.1.0", commands: {}, artifacts: { outputTypes: ["WAV"] } }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(brokenRoot, "capability-validation-log.jsonl"), "{\"status\":\"failed\"}\n", "utf8");

    const thread = store.createThread("Capability Builder repair-plan dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Capability Builder repair-plan dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop Capability Builder repair-plan dogfood test.",
        "Call ambient_capability_builder_repair_plan with packageName ambient-broken-tts.",
        "Use requestedRepair exactly: Make the generated TTS package valid and require a WAV-producing smoke test.",
        "Do not call ambient_capability_builder_history or ambient_capability_builder_preview separately.",
        "Do not scaffold, edit files, install dependencies, validate, register, unregister, delete files, activate, run ambient_cli, use shell, or use browser tools.",
        "After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_REPAIR_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_REPAIR_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_repair_plan completed");
    expect(transcript).toContain("Descriptor name is required");
    expect(transcript).not.toContain("ambient_capability_builder_preview completed");
    expect(transcript).not.toContain("ambient_capability_builder_validate completed");
    expect(transcript).not.toContain("ambient_capability_builder_register completed");
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 240_000);

  itLive("routes protected-path repair diagnosis into the privileged action handoff during a live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live privileged action handoff dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const scaffold = await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "protected-python-path",
      goal: "Wrap a Python native runtime whose data directory can be compiled into a protected system path.",
      installerShape: "custom-cli",
      kind: "local model",
      provider: "Protected Python Path Fixture",
      locality: "local",
      modelAssets: ["runtime data directory"],
    });
    await writeFile(
      join(scaffold.rootPath, "capability-validation-log.jsonl"),
      `${JSON.stringify({
        timestamp: "2026-05-10T00:00:00.000Z",
        command: "protected-python-path",
        status: "failed",
        exitCode: 1,
        stderrPreview: "Error processing file '/Library/Application Support/Ambient/protected-runtime/espeak-ng-data/phontab': No such file or directory. The runtime data path is compiled into the native library.",
      })}\n`,
      "utf8",
    );

    const thread = store.createThread("Privileged action handoff dogfood");
    const privilegedCredentialRequests: unknown[] = [];
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_privileged_action_request") {
            throw new Error(`Unexpected permission prompt during privileged action handoff dogfood: ${request.title}`);
          }
          expect(request.detail).toContain("Protected Python Path Fixture");
          expect(request.detail).toContain("/Library/Application Support/Ambient/protected-runtime/espeak-ng-data");
          expect(request.detail).not.toContain("real-password");
          return { allowed: true, mode: "allow_once" };
        },
        denyThread: () => undefined,
      },
      {
        privilegedCredentials: {
          request: async (request) => {
            privilegedCredentialRequests.push(request);
            return { allowed: true, credential: "temporary-dogfood-password" };
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
        "This is an Ambient Desktop live dogfood for protected-path capability repair.",
        "First call ambient_capability_builder_repair_plan with packageName protected-python-path.",
        "Use requestedRepair exactly: Diagnose the compiled-in Python native data path failure and stop at a privileged handoff if protected system path mutation is required.",
        "After the repair-plan tool returns, use the repair plan's installerRecoveryTemplates and approval checkpoints.",
        "If the plan indicates a protected system path/admin boundary, call ambient_privileged_action_status before any privileged handoff request.",
        "Read the status result. It should report the current selected adapter, credential behavior, and policyHints for the darwin/create_system_symlink structured request shape; do not claim Ambient will execute the privileged command unless selectedAdapterExecutesPrivilegedCommands is true.",
        "Then call the privileged handoff tool with a typed privileged_action_template and rehearseCredentialPrompt true.",
        "Use purpose create_system_symlink, packageName protected-python-path, platform darwin, credential {{AMBIENT_PRIVILEGED_AUTH}}, and reason explaining the compiled-in protected data path.",
        "Shape the command template from the status policyHints. The workspace source is ./.ambient/capability-builder/packages/protected-python-path/models/espeak-ng-data and the Ambient-owned protected target is /Library/Application Support/Ambient/protected-runtime/espeak-ng-data.",
        "The command template should not use sudo or a shell.",
        "Do not edit files, install dependencies, validate, register, run ambient_cli, use shell, use browser tools, or ask the user to copy commands.",
        "After the privileged handoff tool completes, answer with exactly PRIVILEGED_ACTION_HANDOFF_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("ambient_capability_builder_repair_plan completed");
    expect(transcript).toContain("installerRecoveryTemplates");
    expect(transcript).toContain("python-native-data-path");
    expect(transcript).toContain("ambient_privileged_action_status completed");
    expect(transcript).toContain("Execution: dry-run-only");
    expect(transcript).toContain("Adapter status: not-implemented");
    expect(transcript).toContain("Selected adapter:");
    expect(transcript).toContain("Policy planning: available");
    expect(transcript).toContain("Policy hints:");
    expect(transcript).toContain("/bin/ln -sfn <workspace-source> <Ambient-owned protected target>");
    expect(transcript).toContain("ambient_privileged_action_request completed");
    expect(transcript).toContain("Status: not-executed");
    expect(transcript).toContain("Request adapter readiness: not-implemented");
    expect(transcript).toContain("Credential capture: rehearsed-and-discarded");
    expect(transcript).toContain("Continuation:");
    expect(transcript).toContain("state: blocked-until-native-adapter");
    expect(transcript).toContain("PRIVILEGED_ACTION_HANDOFF_OK");
    expect(transcript).not.toMatch(/\bsudo\b/);
    expect(transcript).not.toContain("temporary-dogfood-password");
    expect(privilegedCredentialRequests).toEqual([
      expect.objectContaining({
        schemaVersion: "ambient-privileged-action-v1",
        workspacePath,
        uiPrompt: expect.objectContaining({ credentialPrompt: "ephemeral-native-prompt-required" }),
      }),
    ]);
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threadId: thread.id,
          toolName: "ambient_privileged_action_request",
          risk: "privileged-action",
          decision: "allowed",
        }),
      ]),
    );
  }, 240_000);

  itLive("repairs, validates, registers, and uses an invalid generated Ambient capability", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder repair application dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const brokenRoot = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-broken-tts");
    await mkdir(brokenRoot, { recursive: true });
    await writeFile(
      join(brokenRoot, "ambient-cli.json"),
      `${JSON.stringify({ version: "0.1.0", commands: {}, artifacts: { outputTypes: ["WAV"] } }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(brokenRoot, "capability-build.json"),
      `${JSON.stringify(
        {
          schemaVersion: "ambient-capability-builder-v1",
          name: "ambient-broken-tts",
          version: "0.1.0",
          status: "validated",
          lastValidatedAt: "2026-01-01T00:00:00.000Z",
          refs: { lastValidated: "stale", lastValidatedHash: "stale" },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const repairFiles = repairedBrokenTtsFiles();
    const thread = store.createThread("Capability Builder repair application dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (!["ambient_capability_builder_apply_repair", "ambient_capability_builder_validate", "ambient_capability_builder_register", "ambient_cli"].includes(request.toolName)) {
            throw new Error(`Unexpected permission prompt during Capability Builder repair application dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop Capability Builder integrated repair dogfood test.",
        "First call ambient_capability_builder_repair_plan with packageName ambient-broken-tts.",
        "Use requestedRepair exactly: Repair descriptor, SKILL, wrapper, and smoke test so this package validates and produces a WAV artifact.",
        "Do not call ambient_capability_builder_preview separately in this planning turn.",
        "Do not edit files, validate, register, run ambient_cli, use shell, or use browser tools.",
        "After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_INTEGRATED_REPAIR_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now apply the approved repair.",
        "Call ambient_capability_builder_apply_repair with packageName ambient-broken-tts.",
        "Use reason exactly: Apply approved repair files for the integrated dogfood.",
        "Use this exact files JSON array:",
        JSON.stringify(repairFiles),
        "Do not call install_deps, validate, register, ambient_cli, shell, or browser tools in this turn.",
        "After the apply-repair tool completes, answer with exactly CAPABILITY_BUILDER_APPLY_REPAIR_OK and nothing else.",
      ].join("\n"),
    });

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now call ambient_capability_builder_preview with packageName ambient-broken-tts.",
        "Do not validate, register, run ambient_cli, use shell, or use browser tools in this turn.",
        "After preview completes, answer with exactly CAPABILITY_BUILDER_REPAIRED_PREVIEW_OK and nothing else.",
      ].join("\n"),
    });

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now call ambient_capability_builder_validate with packageName ambient-broken-tts and includeSmokeTests true.",
        "Do not register, run ambient_cli, use shell, or use browser tools in this turn.",
        "After validation completes, answer with exactly CAPABILITY_BUILDER_REPAIRED_VALIDATE_OK and nothing else.",
      ].join("\n"),
    });

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now call ambient_capability_builder_register with packageName ambient-broken-tts.",
        "Do not validate again, run ambient_cli, use shell, or use browser tools in this turn.",
        "After registration completes, answer with exactly CAPABILITY_BUILDER_REPAIRED_REGISTER_OK and nothing else.",
      ].join("\n"),
    });

    const useThread = store.createThread("Capability Builder repaired installed-use dogfood");
    await runtime.send({
      threadId: useThread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is a fresh Ambient Desktop turn for using a repaired generated capability.",
        "Call ambient_cli_search with query exactly Generate repaired WAV files from text.",
        "Then call ambient_cli_describe with packageName ambient-broken-tts and command broken_tts.",
        "Then call ambient_cli with packageName ambient-broken-tts, command broken_tts, and args [\"live repair\", \"repaired-live.wav\"].",
        "Do not use shell or browser tools.",
        "After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_REPAIRED_RUN_OK and include the phrase WAV artifact.",
      ].join("\n"),
    });

    let transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    let useTranscript = store.listMessages(useThread.id).map((message) => message.content).join("\n");
    if (useTranscript.includes("ambient_cli_describe completed") && !useTranscript.includes("ambient_cli completed")) {
      await runtime.send({
        threadId: useThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Continue from the completed ambient_cli_describe result.",
          "Now call ambient_cli with packageName ambient-custom-tts-artifact, command custom_tts_artifact, and args [\"--text\", \"Ambient custom provider live dogfood.\", \"--output\", \"custom-provider-live.wav\", \"--format\", \"wav\", \"--voice\", \"default\"].",
          "Do not call search or describe again. Do not use shell or browser tools.",
          "After ambient_cli completes, answer with exactly CUSTOM_TTS_PROVIDER_RUN_OK and include the phrase chat voice provider.",
        ].join("\n"),
      });
      transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
      useTranscript = store.listMessages(useThread.id).map((message) => message.content).join("\n");
    }
    const audit = store.listPermissionAudit(80);
    expect(transcript).toContain("CAPABILITY_BUILDER_INTEGRATED_REPAIR_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_repair_plan completed");
    expect(transcript).toContain("CAPABILITY_BUILDER_APPLY_REPAIR_OK");
    expect(transcript).toContain("ambient_capability_builder_apply_repair completed");
    expect(transcript).toContain("CAPABILITY_BUILDER_REPAIRED_PREVIEW_OK");
    expect(transcript).toContain("ambient_capability_builder_preview completed");
    expect(transcript).toContain("Status: valid for static preview");
    expect(transcript).toContain("CAPABILITY_BUILDER_REPAIRED_VALIDATE_OK");
    expect(transcript).toContain("ambient_capability_builder_validate completed");
    expect(transcript).toContain("CAPABILITY_BUILDER_REPAIRED_REGISTER_OK");
    expect(transcript).toContain("ambient_capability_builder_register completed");
    expect(useTranscript).toContain("ambient_cli_search completed");
    expect(useTranscript).toContain("ambient_cli_describe completed");
    expect(useTranscript).toContain("ambient_cli completed");
    expect(useTranscript).toContain("CAPABILITY_BUILDER_REPAIRED_RUN_OK");
    expect(useTranscript).toContain("WAV artifact");
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_apply_repair", decision: "allowed" }),
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
        expect.objectContaining({ threadId: useThread.id, toolName: "ambient_cli", decision: "allowed" }),
      ]),
    );
    const manifest = JSON.parse(await readFile(join(brokenRoot, "capability-build.json"), "utf8"));
    expect(manifest.refs.lastValidatedHash).toEqual(expect.any(String));
    const installedArtifact = await findFirstFile(join(workspacePath, ".ambient", "cli-packages", "imported"), "repaired-live.wav");
    expect(installedArtifact).toBeTruthy();
    await expect(stat(installedArtifact!)).resolves.toBeTruthy();
  }, 600_000);

  itLive("repairs a custom TTS artifact package into a registered chat voice provider through Pi", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live custom TTS provider repair dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const rootPath = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-custom-tts-artifact");
    await writeCustomTtsArtifactCapability(rootPath);

    const repairFiles = customTtsProviderRepairFiles();
    const thread = store.createThread("Custom TTS provider repair dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (!["ambient_capability_builder_apply_repair", "ambient_capability_builder_validate", "ambient_capability_builder_register", "ambient_cli"].includes(request.toolName)) {
            throw new Error(`Unexpected permission prompt during custom TTS provider repair dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop custom TTS provider repair dogfood test.",
        "The package ambient-custom-tts-artifact currently looks like a one-off TTS artifact generator, but the user wants it converted into a chat voice provider.",
        "Call ambient_capability_builder_repair_plan with packageName ambient-custom-tts-artifact.",
        "Use requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
        "Do not call ambient_capability_builder_preview separately in this planning turn.",
        "Do not edit files, validate, register, run ambient_cli, use shell, or use browser tools.",
        "After the repair-plan tool completes, answer with exactly CUSTOM_TTS_PROVIDER_REPAIR_PLAN_OK and nothing else.",
      ].join("\n"),
    });

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now apply the approved custom TTS provider conversion repair.",
        "Call ambient_capability_builder_apply_repair with packageName ambient-custom-tts-artifact.",
        "Use reason exactly: Convert custom TTS artifact generator into an Ambient chat voice provider.",
        "Use this exact files JSON array:",
        JSON.stringify(repairFiles),
        "Do not call install_deps, validate, register, ambient_cli, shell, or browser tools in this turn.",
        "After the apply-repair tool completes, answer with exactly CUSTOM_TTS_PROVIDER_APPLY_REPAIR_OK and nothing else.",
      ].join("\n"),
    });

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now call ambient_capability_builder_validate with packageName ambient-custom-tts-artifact and includeSmokeTests true.",
        "After validation succeeds, call ambient_capability_builder_register with packageName ambient-custom-tts-artifact.",
        "Do not run ambient_cli, use shell, or use browser tools in this turn.",
        "After registration completes, answer with exactly CUSTOM_TTS_PROVIDER_VALIDATE_REGISTER_OK and mention Registered voice provider.",
      ].join("\n"),
    });

    const useThread = store.createThread("Custom TTS provider fresh use dogfood");
    await runtime.send({
      threadId: useThread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is a fresh Ambient Desktop turn for using the repaired custom TTS chat voice provider.",
        "Call ambient_cli_search with query exactly Custom TTS voice provider.",
        "Then call ambient_cli_describe with packageName ambient-custom-tts-artifact and command custom_tts_artifact.",
        "Then call ambient_cli with packageName ambient-custom-tts-artifact, command custom_tts_artifact, and args [\"--text\", \"Ambient custom provider live dogfood.\", \"--output\", \"custom-provider-live.wav\", \"--format\", \"wav\", \"--voice\", \"default\"].",
        "Do not use shell or browser tools.",
        "After ambient_cli completes, answer with exactly CUSTOM_TTS_PROVIDER_RUN_OK and include the phrase chat voice provider.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const useTranscript = store.listMessages(useThread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(80);
    expect(transcript).toContain("CUSTOM_TTS_PROVIDER_REPAIR_PLAN_OK");
    expect(transcript).toContain("ambient_capability_builder_repair_plan completed");
    expect(transcript).toContain("Convert the package into the Ambient tts-provider installer shape");
    expect(transcript).toContain("providerContract command");
    expect(transcript).toContain("CUSTOM_TTS_PROVIDER_APPLY_REPAIR_OK");
    expect(transcript).toContain("ambient_capability_builder_apply_repair completed");
    expect(transcript).toContain("CUSTOM_TTS_PROVIDER_VALIDATE_REGISTER_OK");
    expect(transcript).toContain("ambient_capability_builder_validate completed");
    expect(transcript).toContain("providerContract (custom_tts_artifact)");
    expect(transcript).toContain("ambient_capability_builder_register completed");
    expect(transcript).toContain("Registered voice provider:");
    expect(useTranscript).toContain("ambient_cli_search completed");
    expect(useTranscript).toContain("ambient_cli_describe completed");
    expect(useTranscript).toContain("Command: custom_tts_artifact");
    expect(useTranscript).toContain("Health: passed");
    expect(useTranscript).toContain("ambient_cli completed");
    expect(useTranscript).toContain("CUSTOM_TTS_PROVIDER_RUN_OK");
    expect(useTranscript).toContain("chat voice provider");
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_apply_repair", decision: "allowed" }),
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
        expect.objectContaining({ threadId: useThread.id, toolName: "ambient_cli", decision: "allowed" }),
      ]),
    );
    const manifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    expect(manifest.installerShape).toBe("tts-provider");
    expect(manifest.refs.voiceProviderContractValidatedAt).toEqual(expect.any(String));
    const installedArtifact = await findFirstFile(join(workspacePath, ".ambient", "cli-packages", "imported"), "custom-provider-live.wav");
    expect(installedArtifact).toBeTruthy();
    await expect(stat(installedArtifact!)).resolves.toMatchObject({ size: expect.any(Number) });
  }, 600_000);

  itLive("dogfoods a real bookmarked Scrapling package through lifecycle and repair", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live real-package Capability Builder dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "scrapling-static-extract",
      goal: "Extract values from static HTML using the bookmarked Scrapling package.",
      provider: "Scrapling",
      kind: "structured data extractor",
      locality: "local",
    });
    const rootPath = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-scrapling-static-extract");
    await writeScraplingStaticCapability(rootPath);

    const thread = store.createThread("Capability Builder real Scrapling lifecycle dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            ![
              "ambient_capability_builder_install_deps",
              "ambient_capability_builder_validate",
              "ambient_capability_builder_register",
              "ambient_capability_builder_unregister",
              "ambient_capability_builder_apply_repair",
              "ambient_cli",
            ].includes(request.toolName)
          ) {
            throw new Error(`Unexpected permission prompt during real-package Capability Builder dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
        },
        denyThread: () => undefined,
      },
    );

    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "This is an Ambient Desktop Capability Builder real-package dogfood test using the bookmarked GitHub package D4Vinci/Scrapling.",
        "Call ambient_capability_builder_install_deps with packageName ambient-scrapling-static-extract.",
        "Use exactly one command object with command uv, args [\"run\", \"--with\", \"scrapling\", \"--with\", \"curl_cffi\", \"--with\", \"playwright\", \"--with\", \"browserforge\", \"python\", \"./scripts/scrapling_extract.py\", \"--health\"], cwd \".\", rationale \"Install and warm the real Scrapling runtime plus imports that Scrapling requires on macOS before validation.\"",
        "After the dependency install tool completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_INSTALL_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_SCRAPLING_INSTALL_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_validate with packageName ambient-scrapling-static-extract and includeSmokeTests true.",
        "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-scrapling-static-extract.",
        "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_VALIDATE_REGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_SCRAPLING_VALIDATE_REGISTER_OK",
    });

    const registeredManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    const installedPackageId = String(registeredManifest.installedPackageId);
    await sendDogfoodTurn(runtime, store, thread.id, {
      content:
        "Call ambient_cli_search with query exactly Extract h1 text from static HTML using Scrapling. Then call ambient_cli_describe with packageName ambient-scrapling-static-extract and command scrapling_extract. Then call ambient_cli with packageName ambient-scrapling-static-extract, command scrapling_extract, and args [\"--html\", \"<html><body><h1>Bookmark Dogfood</h1></body></html>\", \"--selector\", \"h1::text\"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_RUN_OK and include the phrase Bookmark Dogfood.",
      expected: "CAPABILITY_BUILDER_SCRAPLING_RUN_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_unregister with packageName ambient-scrapling-static-extract.",
        `Use installedPackageId exactly ${installedPackageId}.`,
        "Use reason exactly: Real-package dogfood rollback preserves source after installed capability use.",
        "Wait for unregister to complete, then call ambient_capability_builder_register with packageName ambient-scrapling-static-extract.",
        "Do not stop after unregistering. After re-registration completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_UNREGISTER_REREGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_SCRAPLING_UNREGISTER_REREGISTER_OK",
    });

    await writeFile(join(rootPath, "scripts", "scrapling_extract.py"), "raise RuntimeError('intentional real-package dogfood break')\n", "utf8");
    await sendDogfoodTurn(runtime, store, thread.id, {
      mode: "planner",
      content:
        "Call ambient_capability_builder_repair_plan with packageName ambient-scrapling-static-extract. Use requestedRepair exactly: Restore the Scrapling static extraction wrapper and smoke test after an intentional break. After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_REPAIR_PLAN_OK and nothing else.",
      expected: "CAPABILITY_BUILDER_SCRAPLING_REPAIR_PLAN_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_apply_repair with packageName ambient-scrapling-static-extract.",
        "Use reason exactly: Restore the intentionally broken real-package Scrapling wrapper.",
        "Use this exact files JSON array:",
        JSON.stringify(scraplingStaticRepairFiles()),
        "After apply-repair completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_APPLY_REPAIR_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_SCRAPLING_APPLY_REPAIR_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_validate with packageName ambient-scrapling-static-extract and includeSmokeTests true.",
        "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-scrapling-static-extract.",
        "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_REPAIRED_VALIDATE_REGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_SCRAPLING_REPAIRED_VALIDATE_REGISTER_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content:
        "Call ambient_cli with packageName ambient-scrapling-static-extract, command scrapling_extract, and args [\"--html\", \"<html><body><h1>Repaired Bookmark Dogfood</h1></body></html>\", \"--selector\", \"h1::text\"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_SCRAPLING_REPAIRED_RUN_OK and include the phrase Repaired Bookmark Dogfood.",
      expected: "CAPABILITY_BUILDER_SCRAPLING_REPAIRED_RUN_OK",
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    for (const expected of [
      "CAPABILITY_BUILDER_SCRAPLING_INSTALL_OK",
      "`uv run --with ...` is a package-manager mediated runtime",
      "do not add arbitrary post-command wait padding",
      "Total duration:",
      "CAPABILITY_BUILDER_SCRAPLING_VALIDATE_REGISTER_OK",
      "CAPABILITY_BUILDER_SCRAPLING_RUN_OK",
      "Bookmark Dogfood",
      "CAPABILITY_BUILDER_SCRAPLING_UNREGISTER_REREGISTER_OK",
      "CAPABILITY_BUILDER_SCRAPLING_REPAIR_PLAN_OK",
      "CAPABILITY_BUILDER_SCRAPLING_APPLY_REPAIR_OK",
      "CAPABILITY_BUILDER_SCRAPLING_REPAIRED_VALIDATE_REGISTER_OK",
      "CAPABILITY_BUILDER_SCRAPLING_REPAIRED_RUN_OK",
      "Repaired Bookmark Dogfood",
    ]) {
      expect(transcript).toContain(expected);
    }
    const repairedManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    expect(repairedManifest.refs.lastRepair).toEqual(expect.any(String));
    expect(repairedManifest.refs.lastValidatedHash).toEqual(expect.any(String));
  }, 900_000);

  itLive("dogfoods a real bookmarked Graphify package through lifecycle and repair", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live real-package Graphify dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "graphify-path-inspector",
      goal: "Find paths in a Graphify node-link graph using the bookmarked Graphify package.",
      provider: "Graphify",
      kind: "knowledge graph query tool",
      locality: "local",
    });
    const rootPath = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-graphify-path-inspector");
    await writeGraphifyPathCapability(rootPath);

    const thread = store.createThread("Capability Builder real Graphify lifecycle dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            ![
              "ambient_capability_builder_install_deps",
              "ambient_capability_builder_validate",
              "ambient_capability_builder_register",
              "ambient_capability_builder_unregister",
              "ambient_capability_builder_apply_repair",
              "ambient_cli",
            ].includes(request.toolName)
          ) {
            throw new Error(`Unexpected permission prompt during real Graphify Capability Builder dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
        },
        denyThread: () => undefined,
      },
    );

    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "This is an Ambient Desktop Capability Builder real-package dogfood test using the bookmarked Graphify package.",
        "Call ambient_capability_builder_install_deps with packageName ambient-graphify-path-inspector.",
        "Use exactly one command object with command uv, args [\"run\", \"--with\", \"graphifyy\", \"graphify\", \"--help\"], cwd \".\", rationale \"Install and warm the real Graphify CLI runtime before validation.\"",
        "After the dependency install tool completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_INSTALL_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_GRAPHIFY_INSTALL_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_validate with packageName ambient-graphify-path-inspector and includeSmokeTests true.",
        "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-graphify-path-inspector.",
        "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_VALIDATE_REGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_GRAPHIFY_VALIDATE_REGISTER_OK",
    });

    const registeredManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    const installedPackageId = String(registeredManifest.installedPackageId);
    await sendDogfoodTurn(runtime, store, thread.id, {
      content:
        "Call ambient_cli_search with query exactly Find a path in a Graphify knowledge graph. Then call ambient_cli_describe with packageName ambient-graphify-path-inspector and command graphify_path. Then call ambient_cli with packageName ambient-graphify-path-inspector, command graphify_path, and args [\"Ambient\", \"Graphify\", \"--graph\", \"fixtures/ambient-graph.json\"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_RUN_OK and include the phrase Capability Builder ----> Graphify.",
      expected: "CAPABILITY_BUILDER_GRAPHIFY_RUN_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_unregister with packageName ambient-graphify-path-inspector.",
        `Use installedPackageId exactly ${installedPackageId}.`,
        "Use reason exactly: Real-package Graphify dogfood rollback preserves source after installed capability use.",
        "Wait for unregister to complete, then call ambient_capability_builder_register with packageName ambient-graphify-path-inspector.",
        "Do not stop after unregistering. After re-registration completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_UNREGISTER_REREGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_GRAPHIFY_UNREGISTER_REREGISTER_OK",
    });

    await writeFile(join(rootPath, "ambient-cli.json"), "{}\n", "utf8");
    await sendDogfoodTurn(runtime, store, thread.id, {
      mode: "planner",
      content:
        "Call ambient_capability_builder_repair_plan with packageName ambient-graphify-path-inspector. Use requestedRepair exactly: Restore the Graphify descriptor, SKILL, graph fixture, and smoke test after an intentional descriptor break. After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_REPAIR_PLAN_OK and nothing else.",
      expected: "CAPABILITY_BUILDER_GRAPHIFY_REPAIR_PLAN_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_apply_repair with packageName ambient-graphify-path-inspector.",
        "Use reason exactly: Restore the intentionally broken real-package Graphify descriptor.",
        "Use this exact files JSON array:",
        JSON.stringify(graphifyPathRepairFiles()),
        "After apply-repair completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_APPLY_REPAIR_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_GRAPHIFY_APPLY_REPAIR_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_validate with packageName ambient-graphify-path-inspector and includeSmokeTests true.",
        "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-graphify-path-inspector.",
        "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_VALIDATE_REGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_VALIDATE_REGISTER_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content:
        "Call ambient_cli with packageName ambient-graphify-path-inspector, command graphify_path, and args [\"Ambient\", \"Graphify\", \"--graph\", \"fixtures/ambient-graph.json\"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_RUN_OK and include the phrase Ambient ----> Capability Builder ----> Graphify.",
      expected: "CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_RUN_OK",
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    for (const expected of [
      "CAPABILITY_BUILDER_GRAPHIFY_INSTALL_OK",
      "`uv run --with ...` is a package-manager mediated runtime",
      "CAPABILITY_BUILDER_GRAPHIFY_VALIDATE_REGISTER_OK",
      "CAPABILITY_BUILDER_GRAPHIFY_RUN_OK",
      "Capability Builder ----> Graphify",
      "CAPABILITY_BUILDER_GRAPHIFY_UNREGISTER_REREGISTER_OK",
      "CAPABILITY_BUILDER_GRAPHIFY_REPAIR_PLAN_OK",
      "CAPABILITY_BUILDER_GRAPHIFY_APPLY_REPAIR_OK",
      "CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_VALIDATE_REGISTER_OK",
      "CAPABILITY_BUILDER_GRAPHIFY_REPAIRED_RUN_OK",
      "Ambient ----> Capability Builder ----> Graphify",
    ]) {
      expect(transcript).toContain(expected);
    }
    const repairedManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    expect(repairedManifest.refs.lastRepair).toEqual(expect.any(String));
    expect(repairedManifest.refs.lastValidatedHash).toEqual(expect.any(String));
  }, 900_000);

  itLive("dogfoods a generated Brave Search API capability through env binding lifecycle and repair", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated Brave API dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const braveApiKey = await readDogfoodSecret("BRAVE_API_KEY", "brave_api_key.txt");
    process.env.BRAVE_API_KEY = braveApiKey;
    await writeFile(join(workspacePath, "brave_api_key.txt"), `${braveApiKey}\n`, "utf8");
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "brave-api-search",
      goal: "Search Brave Search with an approved API key and return concise JSON results.",
      provider: "Brave Search",
      kind: "connector/API",
      installerShape: "search-provider",
      outputArtifactTypes: [],
      locality: "network",
    });
    const rootPath = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-brave-api-search");
    await writeGeneratedBraveSearchCapability(rootPath);

    const thread = store.createThread("Capability Builder generated Brave API lifecycle dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (
            ![
              "ambient_capability_builder_validate",
              "ambient_capability_builder_register",
              "ambient_capability_builder_unregister",
              "ambient_capability_builder_apply_repair",
              "ambient_cli_env_bind",
              "ambient_cli",
            ].includes(request.toolName)
          ) {
            throw new Error(`Unexpected permission prompt during generated Brave API dogfood: ${request.title}`);
          }
          return { allowed: true, mode: request.toolName === "ambient_cli" ? "always_workspace" : "allow_once" };
        },
        denyThread: () => undefined,
      },
    );

    await sendDogfoodTurn(runtime, store, thread.id, {
      mode: "planner",
      content:
        "Call ambient_capability_builder_preview with packageName ambient-brave-api-search. Do not validate, register, bind secrets, run ambient_cli, use shell, or use browser tools. After preview completes, answer with exactly CAPABILITY_BUILDER_BRAVE_PREVIEW_OK and include BRAVE_API_KEY and api.search.brave.com.",
      expected: "CAPABILITY_BUILDER_BRAVE_PREVIEW_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_validate with packageName ambient-brave-api-search and includeSmokeTests true.",
        "This is approved to use the BRAVE_API_KEY process env for one tiny Brave Search smoke request.",
        "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-brave-api-search.",
        "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_BRAVE_VALIDATE_REGISTER_OK and include the phrase api.search.brave.com.",
      ],
      expected: "CAPABILITY_BUILDER_BRAVE_VALIDATE_REGISTER_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_cli_describe with packageName ambient-brave-api-search and command brave_search.",
        "Do not run ambient_cli before binding the secret.",
        "After describe shows the missing env requirement, call ambient_cli_env_bind with packageName ambient-brave-api-search, envName BRAVE_API_KEY, and filePath ./brave_api_key.txt.",
        "Do not print or read the secret value into chat. After binding completes, answer with exactly CAPABILITY_BUILDER_BRAVE_DESCRIBE_BIND_OK and include Missing required env: BRAVE_API_KEY.",
      ],
      expected: "CAPABILITY_BUILDER_BRAVE_DESCRIBE_BIND_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content:
        "Call ambient_cli with packageName ambient-brave-api-search, command brave_search, and args [\"Ambient Desktop Capability Builder\", \"-n\", \"1\"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_BRAVE_RUN_OK and include Result 1.",
      expected: "CAPABILITY_BUILDER_BRAVE_RUN_OK",
    });

    const registeredManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    const installedPackageId = String(registeredManifest.installedPackageId);
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_unregister with packageName ambient-brave-api-search.",
        `Use installedPackageId exactly ${installedPackageId}.`,
        "Use reason exactly: Generated Brave API dogfood rollback preserves source, logs, and env binding metadata.",
        "Wait for unregister to complete, then call ambient_capability_builder_register with packageName ambient-brave-api-search.",
        "Do not stop after unregistering. After re-registration completes, answer with exactly CAPABILITY_BUILDER_BRAVE_UNREGISTER_REREGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_BRAVE_UNREGISTER_REREGISTER_OK",
    });

    await writeFile(join(rootPath, "ambient-cli.json"), "{}\n", "utf8");
    await sendDogfoodTurn(runtime, store, thread.id, {
      mode: "planner",
      content:
        "Call ambient_capability_builder_repair_plan with packageName ambient-brave-api-search. Use requestedRepair exactly: Restore the Brave Search API descriptor, SKILL, wrapper, and smoke test after an intentional descriptor break. After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_BRAVE_REPAIR_PLAN_OK and nothing else.",
      expected: "CAPABILITY_BUILDER_BRAVE_REPAIR_PLAN_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_apply_repair with packageName ambient-brave-api-search.",
        "Use reason exactly: Restore the intentionally broken generated Brave Search API capability.",
        "Use this exact files JSON array:",
        JSON.stringify(generatedBraveSearchRepairFiles()),
        "After apply-repair completes, answer with exactly CAPABILITY_BUILDER_BRAVE_APPLY_REPAIR_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_BRAVE_APPLY_REPAIR_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_validate with packageName ambient-brave-api-search and includeSmokeTests true.",
        "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-brave-api-search.",
        "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_BRAVE_REPAIRED_VALIDATE_REGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_BRAVE_REPAIRED_VALIDATE_REGISTER_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content:
        "Call ambient_cli with packageName ambient-brave-api-search, command brave_search, and args [\"Ambient Desktop generated capability\", \"-n\", \"1\"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_BRAVE_REPAIRED_RUN_OK and include Result 1.",
      expected: "CAPABILITY_BUILDER_BRAVE_REPAIRED_RUN_OK",
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    for (const expected of [
      "CAPABILITY_BUILDER_BRAVE_PREVIEW_OK",
      "BRAVE_API_KEY",
      "api.search.brave.com",
      "CAPABILITY_BUILDER_BRAVE_VALIDATE_REGISTER_OK",
      "CAPABILITY_BUILDER_BRAVE_DESCRIBE_BIND_OK",
      "Missing required env: BRAVE_API_KEY",
      "CAPABILITY_BUILDER_BRAVE_RUN_OK",
      "Result 1",
      "CAPABILITY_BUILDER_BRAVE_UNREGISTER_REREGISTER_OK",
      "CAPABILITY_BUILDER_BRAVE_REPAIR_PLAN_OK",
      "CAPABILITY_BUILDER_BRAVE_APPLY_REPAIR_OK",
      "CAPABILITY_BUILDER_BRAVE_REPAIRED_VALIDATE_REGISTER_OK",
      "CAPABILITY_BUILDER_BRAVE_REPAIRED_RUN_OK",
    ]) {
      expect(transcript).toContain(expected);
    }
    const repairedManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    expect(repairedManifest.refs.lastRepair).toEqual(expect.any(String));
    expect(repairedManifest.refs.lastValidatedHash).toEqual(expect.any(String));
  }, 900_000);

  itLive("dogfoods a generated model asset capability through download lifecycle and repair", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated model asset dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "zaya-config-reader",
      goal: "Download and inspect a small Zyphra ZAYA1-8B model config asset.",
      provider: "Zyphra ZAYA1-8B",
      kind: "model asset inspector",
      outputArtifactTypes: ["JSON"],
      locality: "network",
    });
    const rootPath = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-zaya-config-reader");
    await writeZayaConfigCapability(rootPath);

    const thread = store.createThread("Capability Builder generated model asset lifecycle dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (!["ambient_capability_builder_validate", "ambient_capability_builder_register", "ambient_capability_builder_unregister", "ambient_capability_builder_apply_repair", "ambient_cli"].includes(request.toolName)) {
            throw new Error(`Unexpected permission prompt during generated model asset dogfood: ${request.title}`);
          }
          return { allowed: true, mode: request.toolName === "ambient_cli" ? "always_workspace" : "allow_once" };
        },
        denyThread: () => undefined,
      },
    );

    await sendDogfoodTurn(runtime, store, thread.id, {
      mode: "planner",
      content:
        "Call ambient_capability_builder_preview with packageName ambient-zaya-config-reader. Do not validate, register, run ambient_cli, use shell, or use browser tools. After preview completes, answer with exactly CAPABILITY_BUILDER_ZAYA_PREVIEW_OK and include ZAYA1-8B config and huggingface.co.",
      expected: "CAPABILITY_BUILDER_ZAYA_PREVIEW_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_validate with packageName ambient-zaya-config-reader and includeSmokeTests true.",
        "This is approved to download the declared tiny config.json model asset from huggingface.co.",
        "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-zaya-config-reader.",
        "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_ZAYA_VALIDATE_REGISTER_OK and include ZayaForCausalLM.",
      ],
      expected: "CAPABILITY_BUILDER_ZAYA_VALIDATE_REGISTER_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content:
        "Call ambient_cli_search with query exactly inspect Zyphra ZAYA model config asset. Then call ambient_cli_describe with packageName ambient-zaya-config-reader and command zaya_config. Then call ambient_cli with packageName ambient-zaya-config-reader, command zaya_config, and args [\"--field\", \"architectures.0\"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_ZAYA_RUN_OK and include ZayaForCausalLM.",
      expected: "CAPABILITY_BUILDER_ZAYA_RUN_OK",
    });

    const registeredManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    const installedPackageId = String(registeredManifest.installedPackageId);
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_unregister with packageName ambient-zaya-config-reader.",
        `Use installedPackageId exactly ${installedPackageId}.`,
        "Use reason exactly: Generated model asset dogfood rollback preserves source, cache, and logs.",
        "Wait for unregister to complete, then call ambient_capability_builder_register with packageName ambient-zaya-config-reader.",
        "Do not stop after unregistering. After re-registration completes, answer with exactly CAPABILITY_BUILDER_ZAYA_UNREGISTER_REREGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_ZAYA_UNREGISTER_REREGISTER_OK",
    });

    await writeFile(join(rootPath, "ambient-cli.json"), "{}\n", "utf8");
    await sendDogfoodTurn(runtime, store, thread.id, {
      mode: "planner",
      content:
        "Call ambient_capability_builder_repair_plan with packageName ambient-zaya-config-reader. Use requestedRepair exactly: Restore the ZAYA model asset descriptor, SKILL, downloader wrapper, and smoke test after an intentional descriptor break. After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_ZAYA_REPAIR_PLAN_OK and nothing else.",
      expected: "CAPABILITY_BUILDER_ZAYA_REPAIR_PLAN_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_apply_repair with packageName ambient-zaya-config-reader.",
        "Use reason exactly: Restore the intentionally broken generated ZAYA model asset capability.",
        "Use this exact files JSON array:",
        JSON.stringify(zayaConfigRepairFiles()),
        "After apply-repair completes, answer with exactly CAPABILITY_BUILDER_ZAYA_APPLY_REPAIR_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_ZAYA_APPLY_REPAIR_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content: [
        "Call ambient_capability_builder_validate with packageName ambient-zaya-config-reader and includeSmokeTests true.",
        "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-zaya-config-reader.",
        "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_ZAYA_REPAIRED_VALIDATE_REGISTER_OK and nothing else.",
      ],
      expected: "CAPABILITY_BUILDER_ZAYA_REPAIRED_VALIDATE_REGISTER_OK",
    });
    await sendDogfoodTurn(runtime, store, thread.id, {
      content:
        "Call ambient_cli with packageName ambient-zaya-config-reader, command zaya_config, and args [\"--field\", \"architectures.0\"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_ZAYA_REPAIRED_RUN_OK and include ZayaForCausalLM.",
      expected: "CAPABILITY_BUILDER_ZAYA_REPAIRED_RUN_OK",
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    for (const expected of [
      "CAPABILITY_BUILDER_ZAYA_PREVIEW_OK",
      "ZAYA1-8B config",
      "huggingface.co",
      "CAPABILITY_BUILDER_ZAYA_VALIDATE_REGISTER_OK",
      "ZayaForCausalLM",
      "CAPABILITY_BUILDER_ZAYA_RUN_OK",
      "CAPABILITY_BUILDER_ZAYA_UNREGISTER_REREGISTER_OK",
      "CAPABILITY_BUILDER_ZAYA_REPAIR_PLAN_OK",
      "CAPABILITY_BUILDER_ZAYA_APPLY_REPAIR_OK",
      "CAPABILITY_BUILDER_ZAYA_REPAIRED_VALIDATE_REGISTER_OK",
      "CAPABILITY_BUILDER_ZAYA_REPAIRED_RUN_OK",
    ]) {
      expect(transcript).toContain(expected);
    }
    const repairedManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
    expect(repairedManifest.refs.lastRepair).toEqual(expect.any(String));
    expect(repairedManifest.refs.lastValidatedHash).toEqual(expect.any(String));
  }, 900_000);

  itLive("installs dependencies for a generated Ambient capability through Capability Builder", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder dependency dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });

    const thread = store.createThread("Capability Builder dependency dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_capability_builder_install_deps") {
            throw new Error(`Unexpected permission prompt during Capability Builder dependency dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
        "This is an Ambient Desktop Capability Builder dependency install dogfood test.",
        "Call ambient_capability_builder_install_deps with packageName ambient-piper-tts.",
        "Use exactly one command object: command node, args [\"--version\"], cwd \".\", rationale \"Verify Node runtime availability for dependency planning smoke.\"",
        "Do not scaffold, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
        "After the dependency install tool completes, answer with exactly CAPABILITY_BUILDER_INSTALL_DEPS_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_INSTALL_DEPS_OK");
    expect(transcript).toContain("ambient_capability_builder_install_deps completed");
    await expect(readFile(join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "capability-deps-log.jsonl"), "utf8")).resolves.toContain(
      "\"command\":\"node\"",
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_install_deps", decision: "allowed" }),
      ]),
    );
  }, 240_000);

  itLive("validates a generated Ambient capability through Capability Builder", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder validation dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });

    const thread = store.createThread("Capability Builder validation dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_capability_builder_validate") {
            throw new Error(`Unexpected permission prompt during Capability Builder validation dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
        "This is an Ambient Desktop Capability Builder validation dogfood test.",
        "Call ambient_capability_builder_validate with packageName ambient-piper-tts and includeSmokeTests true.",
        "Do not scaffold, install dependencies, register, activate, run ambient_cli, use shell, or use browser tools.",
        "After the validation tool completes, answer with exactly CAPABILITY_BUILDER_VALIDATE_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_VALIDATE_OK");
    expect(transcript).toContain("ambient_capability_builder_validate completed");
    await expect(readFile(join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "capability-validation-log.jsonl"), "utf8")).resolves.toContain(
      "\"source\":\"healthCheck\"",
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
      ]),
    );
  }, 240_000);

  itLive("registers a generated Ambient capability through Capability Builder", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder registration dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });
    await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });

    const thread = store.createThread("Capability Builder registration dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_capability_builder_register") {
            throw new Error(`Unexpected permission prompt during Capability Builder registration dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
        "This is an Ambient Desktop Capability Builder registration dogfood test.",
        "Call ambient_capability_builder_register with packageName ambient-piper-tts.",
        "Do not scaffold, install dependencies, validate, activate, run ambient_cli, use shell, or use browser tools.",
        "After the registration tool completes, answer with exactly CAPABILITY_BUILDER_REGISTER_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_REGISTER_OK");
    expect(transcript).toContain("ambient_capability_builder_register completed");
    await expect(readFile(join(workspacePath, ".ambient", "cli-packages", "packages.json"), "utf8")).resolves.toContain(
      "ambient-piper-tts",
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
      ]),
    );
  }, 240_000);

  itLive("unregisters a generated Ambient capability through Capability Builder while preserving source", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder unregister dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });
    await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
    const registered = await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });

    const thread = store.createThread("Capability Builder unregister dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_capability_builder_unregister") {
            throw new Error(`Unexpected permission prompt during Capability Builder unregister dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
        "This is an Ambient Desktop Capability Builder unregister dogfood test.",
        "Call ambient_capability_builder_unregister with packageName ambient-piper-tts.",
        `Use installedPackageId exactly ${registered.installedPackage.id}.`,
        "Use reason exactly: Hide from search while preserving builder source and artifacts.",
        "Do not delete files, remove source, install dependencies, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
        "After the unregister tool completes, answer with exactly CAPABILITY_BUILDER_UNREGISTER_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_UNREGISTER_OK");
    expect(transcript).toContain("ambient_capability_builder_unregister completed");
    await expect(readFile(join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "ambient-cli.json"), "utf8")).resolves.toContain(
      "ambient-piper-tts",
    );
    expect(await readFile(join(workspacePath, ".ambient", "cli-packages", "packages.json"), "utf8")).not.toContain(registered.installedPackage.id);
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_unregister", decision: "allowed" }),
      ]),
    );
  }, 240_000);

  itLive("re-registers an unregistered generated Ambient capability through Capability Builder", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder re-register dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });
    await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
    const registered = await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
    await unregisterCapabilityBuilderPackage(workspacePath, {
      packageName: "ambient-piper-tts",
      installedPackageId: registered.installedPackage.id,
    });

    const thread = store.createThread("Capability Builder re-register dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_capability_builder_register") {
            throw new Error(`Unexpected permission prompt during Capability Builder re-register dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
        "This is an Ambient Desktop Capability Builder re-register dogfood test.",
        "Call ambient_capability_builder_register with packageName ambient-piper-tts.",
        "This package was previously unregistered but its builder source and validation metadata were preserved.",
        "Do not scaffold, install dependencies, validate, activate, run ambient_cli, use shell, or use browser tools.",
        "After the register tool completes, answer with exactly CAPABILITY_BUILDER_REREGISTER_OK and nothing else.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_REREGISTER_OK");
    expect(transcript).toContain("ambient_capability_builder_register completed");
    await expect(readFile(join(workspacePath, ".ambient", "cli-packages", "packages.json"), "utf8")).resolves.toContain(
      "ambient-piper-tts",
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
      ]),
    );
  }, 240_000);

  itLive("discovers unregistered generated Ambient capability source through Capability Builder history", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder history dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });
    await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
    const registered = await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
    await unregisterCapabilityBuilderPackage(workspacePath, {
      packageName: "ambient-piper-tts",
      installedPackageId: registered.installedPackage.id,
    });

    const thread = store.createThread("Capability Builder history dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during Capability Builder history dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "planner",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop Capability Builder history dogfood test.",
        "Call ambient_capability_builder_history with packageName ambient-piper-tts.",
        "Do not use ambient_cli_search, ambient_cli_describe, shell, browser, register, validate, unregister, or any mutating tools.",
        "After the history tool completes, answer with exactly CAPABILITY_BUILDER_HISTORY_OK and include the word unregistered.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("CAPABILITY_BUILDER_HISTORY_OK");
    expect(transcript).toContain("ambient_capability_builder_history completed");
    expect(transcript).toContain("unregistered");
    expect(transcript).not.toContain("ambient_cli_search completed");
    expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
  }, 240_000);

  itLive("uses a registered generated Ambient capability through Ambient CLI search, describe, and run", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated capability Ambient CLI dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });
    await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
    await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });

    const thread = store.createThread("Generated capability installed dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_cli") {
            throw new Error(`Unexpected permission prompt during generated capability Ambient CLI dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
        "This is an Ambient Desktop generated capability installed-use dogfood test.",
        "Find the installed generated Ambient CLI capability by calling ambient_cli_search with query exactly Generate WAV voice files from text using Piper.",
        "Then call ambient_cli_describe with packageName ambient-piper-tts and command piper_tts.",
        "Do not run ambient_cli in this turn.",
        "After ambient_cli_describe completes, answer with exactly CAPABILITY_BUILDER_INSTALLED_DESCRIBED and nothing else.",
        "Do not use browser or shell tools.",
      ].join("\n"),
    });

    const describeTranscript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(describeTranscript).toContain("ambient_cli_search completed");
    expect(describeTranscript).toContain("ambient_cli_describe completed");
    expect(describeTranscript).toContain("CAPABILITY_BUILDER_INSTALLED_DESCRIBED");

    await runtime.send({
      threadId: thread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "Now call ambient_cli with packageName ambient-piper-tts, command piper_tts, and no args.",
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_INSTALLED_RUN_OK and include the phrase Draft capability scaffold.",
        "Do not use browser or shell tools.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("ambient_cli completed");
    expect(transcript).toContain("CAPABILITY_BUILDER_INSTALLED_RUN_OK");
    expect(transcript).toContain("Draft capability scaffold");
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" }),
      ]),
    );
  }, 360_000);

  itLive("builds and runs a nontrivial generated WAV artifact capability", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated WAV artifact capability dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    const scaffold = await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "tone-wav",
      goal: "Generate a WAV tone artifact from text input",
      provider: "Node",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });
    await writeToneWavCapability(scaffold.rootPath);
    await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-tone-wav" });
    await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-tone-wav" });

    const outputPath = join(workspacePath, "tone-output.wav");
    const thread = store.createThread("Generated WAV artifact capability dogfood");
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          if (request.toolName !== "ambient_cli") {
            throw new Error(`Unexpected permission prompt during generated WAV artifact dogfood: ${request.title}`);
          }
          return { allowed: true, mode: "allow_once" };
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
        "This is an Ambient Desktop generated WAV artifact capability dogfood test.",
        "Find the installed generated Ambient CLI capability by calling ambient_cli_search with query exactly WAV tone artifact.",
        "Then call ambient_cli_describe with packageName ambient-tone-wav and command tone_wav.",
        `Then call ambient_cli with packageName ambient-tone-wav, command tone_wav, and args exactly ["Codex test tone", "${outputPath}"].`,
        "After the tool result is available, answer with exactly CAPABILITY_BUILDER_ARTIFACT_OK and include the output WAV path.",
        "Do not use browser or shell tools.",
      ].join("\n"),
    });

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    const audit = store.listPermissionAudit(20);
    expect(transcript).toContain("ambient_cli_search completed");
    expect(transcript).toContain("ambient_cli_describe completed");
    expect(transcript).toContain("ambient_cli completed");
    expect(transcript).toContain("CAPABILITY_BUILDER_ARTIFACT_OK");
    expect(transcript).toContain(outputPath);
    expect((await stat(outputPath)).size).toBeGreaterThan(44);
    expect((await readFile(outputPath)).subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" }),
      ]),
    );
  }, 360_000);

  itLive("dogfoods generated capability management planning prompts through live Ambient/Pi", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated capability management prompt dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;
    await scaffoldCapabilityBuilderPackage(workspacePath, {
      name: "piper-tts",
      goal: "Generate WAV voice files from text using Piper",
      provider: "Piper",
      kind: "artifact generator",
      outputArtifactTypes: ["WAV"],
      locality: "local",
    });

    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      goal: "Generate WAV voice files from text using Piper",
      kind: "artifact generator",
      provider: "Piper",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/ambient-piper-tts",
      installedPackageId: "ambient-cli:generated:ambient-piper-tts",
      installedSource: "./.ambient/cli-packages/imported/ambient-piper-tts",
      refs: { latest: "source-ref", lastRepair: "repair-ref", installed: "installed-ref", lastValidated: "validated-ref" },
    };
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during generated capability management prompt dogfood: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );

    const updateThread = store.createThread("Generated capability update planning dogfood");
    await runtime.send({
      threadId: updateThread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        buildGeneratedCapabilityUpdatePlanPrompt({ packageName: "ambient-piper-tts", generated }),
        "This is a live dogfood turn for the management prompt. Call ambient_capability_builder_update_plan exactly once for the builder source path, then provide the plan.",
        "Do not call ambient_capability_builder_preview in this update-planning turn.",
        "Do not ask for approval in this dogfood turn. Do not install dependencies, edit files, validate, register, remove, activate, run ambient_cli, use shell, or use browser tools.",
        "After the update-plan result and plan are available, answer with exactly CAPABILITY_BUILDER_UPDATE_PLAN_PROMPT_OK.",
      ].join("\n"),
    });

    const updateTranscript = store.listMessages(updateThread.id).map((message) => message.content).join("\n");
    expect(updateTranscript).toContain("ambient_capability_builder_update_plan completed");
    expect(updateTranscript).toContain("CAPABILITY_BUILDER_UPDATE_PLAN_PROMPT_OK");
    expect(updateTranscript).not.toContain("bash completed");
    expect(updateTranscript).not.toContain("ambient_capability_builder_preview completed");
    expect(updateTranscript).not.toContain("ambient_capability_builder_validate completed");
    expect(updateTranscript).not.toContain("ambient_capability_builder_register completed");

    const removalThread = store.createThread("Generated capability removal planning dogfood");
    await runtime.send({
      threadId: removalThread.id,
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        buildGeneratedCapabilityRemovalPlanPrompt({ packageName: "ambient-piper-tts", generated }),
        "This is a live dogfood turn for the removal prompt. Call ambient_capability_builder_removal_plan exactly once, then provide the safe removal plan.",
        "Do not call ambient_capability_builder_preview in this removal-planning turn.",
        "Do not ask for approval in this dogfood turn. Do not delete files, unregister, disable, edit package state, remove secrets, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
        "After the plan is available, answer with exactly CAPABILITY_BUILDER_REMOVAL_PLAN_PROMPT_OK.",
      ].join("\n"),
    });

    const removalTranscript = store.listMessages(removalThread.id).map((message) => message.content).join("\n");
    expect(removalTranscript).toContain("ambient_capability_builder_removal_plan completed");
    expect(removalTranscript).toContain("CAPABILITY_BUILDER_REMOVAL_PLAN_PROMPT_OK");
    expect(removalTranscript).not.toContain("bash completed");
    expect(removalTranscript).not.toContain("ambient_capability_builder_preview completed");
    expect(removalTranscript).not.toContain("ambient_capability_builder_validate completed");
    expect(removalTranscript).not.toContain("ambient_capability_builder_register completed");
    expect(store.listPermissionAudit(20)).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: updateThread.id })]));
    expect(store.listPermissionAudit(20)).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: removalThread.id })]));
  }, 360_000);

  itLive("self-installs, activates, reloads, and invokes a Codex MCP plugin during live Ambient/Pi chat turns", async () => {
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
    expect(store.listMessages(thread.id).map((message) => message.content).join("\n")).toContain("SELF_INSTALL_ACTIVATED");

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
  }, 360_000);

  itLive("installs and uses an Ambient CLI skill package during live Ambient/Pi chat turns", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live CLI package dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const repo = join(workspacePath, "cli-repo");
    await seedAmbientCliFixture(repo);
    await execFileAsync("git", ["init"], { cwd: repo });
    await execFileAsync("git", ["add", "."], { cwd: repo });
    await execFileAsync("git", ["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "seed cli package"], {
      cwd: repo,
    });
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
    const installTranscript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
    const describeTranscript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain("Ambient CLI capability search");
    expect(transcript).toContain("Ambient CLI capability description");
    expect(transcript).toContain("CLI_PACKAGE_DOGFOOD_OK");
    expect(transcript).toContain("CLI_DOGFOOD_VALUE");
  }, 360_000);

  itMiniCpmLive("dogfoods MiniCPM-V vision through Ambient CLI during a live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V Ambient CLI dogfood.");
    const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/path/to/user/RCLI/deps/llama.cpp/build/bin/llama-server";
    await stat(llamaServer).catch(() => {
      throw new Error(`Set AMBIENT_MINICPM_V_LLAMA_SERVER to a runnable llama-server binary for live MiniCPM-V dogfood. Missing: ${llamaServer}`);
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
    await cp(join(process.cwd(), "resources", "ambient-cli-packages", "ambient-minicpm-v-vision"), source, { recursive: true, force: true });
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
      const installTranscript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
      const describeTranscript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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

      const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
      expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_package_install", decision: "allowed" })]));
      expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" })]));
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
  }, 720_000);

  itMiniCpmLive("dogfoods MiniCPM-V vision through the typed Ambient visual tool during a live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V typed visual dogfood.");
    const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/path/to/user/RCLI/deps/llama.cpp/build/bin/llama-server";
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
  }, 720_000);

  itMiniCpmLive("dogfoods MiniCPM-V typed setup and analysis through the default managed runtime during a live Ambient/Pi chat turn", async () => {
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
  }, 900_000);

  itMiniCpmLive("dogfoods MiniCPM-V comparison through structured visual references during a live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V structured visual dogfood.");
    const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/path/to/user/RCLI/deps/llama.cpp/build/bin/llama-server";
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
  }, 720_000);

  itMiniCpmLive("dogfoods MiniCPM-V sampled video frames through the typed Ambient visual tool during a live Ambient/Pi chat turn", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V typed video dogfood.");
    const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/path/to/user/RCLI/deps/llama.cpp/build/bin/llama-server";
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
  }, 720_000);

  itLive("returns an Ambient CLI preflight description when Pi tries to execute before describe", async () => {
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

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
    expect(transcript).toContain("Ambient CLI preflight description");
    expect(transcript).toContain("Execution not run");
    expect(transcript).toContain("CLI_PREFLIGHT_DOGFOOD_OK");
    expect(transcript).toContain("CLI_PREFLIGHT_VALUE");
  }, 240_000);

  itLive("preserves long Ambient CLI arg input metadata from a live Ambient run", async () => {
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
  }, 240_000);

  itLive("installs Brave Search, binds secrets, and runs real searches during live Ambient/Pi chat turns", async () => {
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

    let transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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

    transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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

    transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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

    transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
  }, 600_000);

  itLive("translates a Pi catalog arXiv package URL and runs a real lookup during live Ambient/Pi chat turns", async () => {
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

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
  }, 600_000);

  itLive("installs and runs pi-arxiv through the sandboxed Pi extension host during live Ambient/Pi chat turns", async () => {
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

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
  }, 600_000);

  itLive("routes pi-ffmpeg sandbox install failure into privileged disabled install during live Ambient/Pi chat turns", async () => {
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

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
  }, 600_000);

  itLive("scans, privileged-installs disabled, and uninstalls context-mode during a live Ambient/Pi chat turn", async () => {
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

    const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
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
  }, 600_000);
});

async function seedFixtureMarketplace(workspacePath: string): Promise<void> {
  const pluginRoot = join(workspacePath, "plugins", "ambient-fixture");
  await mkdir(dirname(pluginRoot), { recursive: true });
  await cp(join(process.cwd(), "plugins", "ambient-fixture"), pluginRoot, { recursive: true });
  const marketplacePath = join(workspacePath, ".agents", "plugins", "marketplace.json");
  await mkdir(dirname(marketplacePath), { recursive: true });
  await writeFile(
    marketplacePath,
    `${JSON.stringify(
      {
        name: "ambient-plugin-dogfood",
        interface: { displayName: "Ambient Plugin Dogfood" },
        plugins: [
          {
            name: "ambient-fixture",
            source: { source: "local", path: "./plugins/ambient-fixture" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function trustFixturePlugin(store: ProjectStore, workspacePath: string): Promise<CodexPluginSummary> {
  const host = new AmbientPluginHost();
  const catalog = await host.readCodexPluginCatalog(workspacePath, pluginStateReader(store));
  const fixture = catalog.plugins.find((plugin) => plugin.name === "ambient-fixture");
  if (!fixture) throw new Error("Fixture Codex plugin was not discovered.");
  store.setPluginTrusted(fixture.id, true, codexPluginTrustFingerprint(fixture));
  return { ...fixture, trusted: true };
}

async function seedSelfInstallMarketplace(workspacePath: string): Promise<{ marketplacePath: string; sourceSha: string }> {
  const repo = join(workspacePath, "self-install-source");
  const pluginRoot = join(repo, "plugins", "ambient-fixture");
  await mkdir(dirname(pluginRoot), { recursive: true });
  await cp(join(process.cwd(), "plugins", "ambient-fixture"), pluginRoot, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: repo });
  await execFileAsync("git", ["add", "."], { cwd: repo });
  await execFileAsync("git", ["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "seed self-install plugin"], {
    cwd: repo,
  });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
  const sourceSha = String(stdout).trim();
  const marketplacePath = join(workspacePath, "self-install-marketplace.json");
  await writeFile(
    marketplacePath,
    `${JSON.stringify(
      {
        name: "ambient-self-install-dogfood",
        interface: { displayName: "Ambient Self Install Dogfood" },
        plugins: [
          {
            name: "ambient-fixture",
            version: "0.1.0",
            description: "Self-install dogfood fixture.",
            source: { source: "git-subdir", url: repo, path: "./plugins/ambient-fixture", sha: sourceSha },
            category: "Productivity",
            interface: {
              displayName: "Ambient Fixture",
              shortDescription: "Exercises self-install and MCP activation.",
              category: "Productivity",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { marketplacePath, sourceSha };
}

async function seedAmbientCliFixture(workspacePath: string): Promise<void> {
  const root = join(workspacePath, "cli-fixture");
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "skills", "json-cli"), { recursive: true });
  await writeFile(
    join(root, "ambient-cli.json"),
    `${JSON.stringify(
      {
        name: "ambient-json-cli",
        version: "0.1.0",
        description: "Fixture JSON CLI package.",
        skills: "./skills",
        commands: {
          "json-pick": {
            command: "node",
            args: ["./bin/json-pick.mjs"],
            cwd: "workspace",
            description: "Print a top-level JSON field.",
            healthCheck: ["node", "./bin/json-pick.mjs", "health.json", "message"],
          },
          "echo-arg": {
            command: "node",
            args: ["./bin/echo-arg.mjs"],
            cwd: "workspace",
            description: "Print the length of a supplied text argument without echoing the whole value.",
            healthCheck: ["node", "./bin/echo-arg.mjs", "--text", "healthy"],
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "bin", "json-pick.mjs"),
    [
      "import { readFileSync } from 'node:fs';",
      "const [file, key] = process.argv.slice(2);",
      "const value = JSON.parse(readFileSync(file, 'utf8'))[key];",
      "process.stdout.write(String(value));",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "bin", "echo-arg.mjs"),
    [
      "const args = process.argv.slice(2);",
      "const textFlagIndex = args.indexOf('--text');",
      "const text = textFlagIndex >= 0 ? args[textFlagIndex + 1] ?? '' : args[0] ?? '';",
      "process.stdout.write(`ECHO_ARG_LENGTH=${text.length}\\n`);",
      "process.stdout.write(`ECHO_ARG_PREFIX=${text.slice(0, 32)}\\n`);",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "health.json"), `${JSON.stringify({ message: "healthy" })}\n`, "utf8");
  await writeFile(
    join(root, "skills", "json-cli", "SKILL.md"),
    [
      "---",
      "name: ambient-json-cli",
      "description: Use ambient_cli packageName ambient-json-cli command json-pick to extract a top-level JSON field.",
      "---",
      "",
      "Use ambient_cli with packageName ambient-json-cli and command json-pick.",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeToneWavCapability(rootPath: string): Promise<void> {
  await writeFile(
    join(rootPath, "ambient-cli.json"),
    `${JSON.stringify(
      {
        name: "ambient-tone-wav",
        version: "0.1.0",
        description: "Generate a deterministic WAV tone artifact from text input.",
        skills: "./SKILL.md",
        commands: {
          tone_wav: {
            command: "node",
            args: ["./scripts/run.mjs"],
            cwd: "package",
            description: "Generate a small WAV tone file and print its path.",
            healthCheck: ["node", "./scripts/run.mjs", "--health"],
          },
        },
        env: [],
        artifacts: {
          outputTypes: ["WAV"],
          policy: "write WAV output to the requested file path and return the path in stdout",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(rootPath, "SKILL.md"),
    [
      "---",
      "name: ambient-tone-wav",
      "description: Generate a deterministic WAV tone artifact from text input.",
      "---",
      "",
      "Use `ambient_cli` with packageName `ambient-tone-wav` and command `tone_wav` when the user needs a small local WAV tone artifact.",
      "Pass two args: the source text and the output `.wav` path.",
      "Return the output path rather than dumping binary data in chat.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(rootPath, "scripts", "run.mjs"),
    [
      "import { mkdirSync, writeFileSync } from 'node:fs';",
      "import { dirname, resolve } from 'node:path';",
      "",
      "if (process.argv.includes('--health')) {",
      "  process.stdout.write('ok\\n');",
      "  process.exit(0);",
      "}",
      "",
      "const [text = 'tone', outputArg = 'tone-output.wav'] = process.argv.slice(2);",
      "const outputPath = resolve(outputArg);",
      "const sampleRate = 8000;",
      "const durationSeconds = Math.max(0.12, Math.min(0.5, text.length / 80));",
      "const samples = Math.floor(sampleRate * durationSeconds);",
      "const dataSize = samples * 2;",
      "const buffer = Buffer.alloc(44 + dataSize);",
      "buffer.write('RIFF', 0);",
      "buffer.writeUInt32LE(36 + dataSize, 4);",
      "buffer.write('WAVEfmt ', 8);",
      "buffer.writeUInt32LE(16, 16);",
      "buffer.writeUInt16LE(1, 20);",
      "buffer.writeUInt16LE(1, 22);",
      "buffer.writeUInt32LE(sampleRate, 24);",
      "buffer.writeUInt32LE(sampleRate * 2, 28);",
      "buffer.writeUInt16LE(2, 32);",
      "buffer.writeUInt16LE(16, 34);",
      "buffer.write('data', 36);",
      "buffer.writeUInt32LE(dataSize, 40);",
      "const frequency = 440 + (text.length % 12) * 15;",
      "for (let i = 0; i < samples; i += 1) {",
      "  const envelope = 1 - i / samples;",
      "  const sample = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 12000 * envelope);",
      "  buffer.writeInt16LE(sample, 44 + i * 2);",
      "}",
      "mkdirSync(dirname(outputPath), { recursive: true });",
      "writeFileSync(outputPath, buffer);",
      "process.stdout.write(`WAV artifact: ${outputPath}\\nBytes: ${buffer.length}\\n`);",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(rootPath, "tests", "smoke.test.mjs"),
    [
      "import { strict as assert } from 'node:assert';",
      "import { execFileSync } from 'node:child_process';",
      "import { readFileSync } from 'node:fs';",
      "",
      "const output = 'smoke-tone.wav';",
      "const stdout = execFileSync(process.execPath, ['./scripts/run.mjs', 'smoke', output], { encoding: 'utf8' });",
      "assert.match(stdout, /WAV artifact:/);",
      "assert.equal(readFileSync(output).subarray(0, 4).toString('ascii'), 'RIFF');",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function sendDogfoodTurn(
  runtime: AgentRuntime,
  store: ProjectStore,
  threadId: string,
  input: {
    content: string | string[];
    expected: string;
    mode?: "agent" | "planner";
  },
): Promise<string> {
  await runtime.send({
    threadId,
    permissionMode: "workspace",
    collaborationMode: input.mode ?? "agent",
    model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
    thinkingLevel: "minimal",
    content: Array.isArray(input.content) ? input.content.join("\n") : input.content,
  });
  const transcript = store.listMessages(threadId).map((message) => message.content).join("\n");
  expect(transcript).toContain(input.expected);
  return transcript;
}

async function writeMiniCpmDogfoodEvidence(input: {
  scenario?: string;
  commands?: string[];
  model: string;
  durationMs: number;
  summary: string;
  observations: unknown[];
  limitations: unknown[];
  artifactPath: string;
  image: { basename: string; bytes: number; sha256: string };
  runtimeInstall?: unknown;
}): Promise<void> {
  const evidenceRoot = join(process.cwd(), "test-results", "minicpm-v", "pi-dogfood");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    status: "passed",
    scenario: input.scenario ?? "live Ambient/Pi mediated ambient_cli MiniCPM-V screenshot analysis",
    createdAt: new Date().toISOString(),
    model: input.model,
    durationMs: input.durationMs,
    packageName: "ambient-minicpm-v-vision",
    commands: input.commands ?? ["minicpm_vision_start", "minicpm_vision_analyze", "minicpm_vision_stop"],
    artifactPath: input.artifactPath,
    image: input.image,
    ...(input.runtimeInstall ? { runtimeInstall: input.runtimeInstall } : {}),
    parsedOutput: {
      summary: input.summary,
      observations: input.observations,
      limitations: input.limitations,
    },
    redactionChecks: {
      imageBytesRedactedFromRequest: true,
      piVisibleArtifactPathIsWorkspaceRelative: !input.artifactPath.startsWith("/"),
    },
  };
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join(evidenceRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function renderMiniCpmFixtureVideo(imagePath: string, videoPath: string): Promise<void> {
  const attempts = [
    ["-y", "-loop", "1", "-t", "1", "-i", imagePath, "-vf", "format=yuv420p", "-c:v", "libx264", videoPath],
    ["-y", "-loop", "1", "-t", "1", "-i", imagePath, "-vf", "format=yuv420p", "-c:v", "mpeg4", videoPath],
  ];
  const errors: string[] = [];
  for (const args of attempts) {
    try {
      await execFileAsync("ffmpeg", args, { timeout: 60_000 });
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Unable to render MiniCPM-V video fixture with ffmpeg:\n${errors.join("\n---\n")}`);
}

async function writeScraplingStaticCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  for (const file of scraplingStaticRepairFiles()) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

async function writeGraphifyPathCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "fixtures"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  for (const file of graphifyPathRepairFiles()) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

async function writeGeneratedBraveSearchCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  for (const file of generatedBraveSearchRepairFiles()) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

async function writeZayaConfigCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  await mkdir(join(rootPath, "models"), { recursive: true });
  for (const file of zayaConfigRepairFiles()) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

async function writeCustomTtsArtifactCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  const files = [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name: "ambient-custom-tts-artifact",
          version: "0.1.0",
          description: "Generate WAV text-to-speech audio files from text.",
          skills: "./SKILL.md",
          commands: {
            custom_tts_artifact: {
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              description: "Generate a one-off WAV file from text.",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
            },
          },
          env: [],
          artifacts: {
            outputTypes: ["WAV"],
            policy: "write WAV output to the requested path and return the artifact path in stdout",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      content: [
        "---",
        "name: ambient-custom-tts-artifact",
        "description: Generate WAV text-to-speech audio files from text.",
        "---",
        "",
        "Use this draft one-off audio artifact command only after it is repaired into the requested Ambient chat voice provider shape.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: [
        "if (process.argv.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "process.stdout.write('Draft one-off TTS artifact generator. Repair before use as a chat voice provider.\\n');",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const output = execFileSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
        "assert.equal(output, 'ok\\n');",
        "",
      ].join("\n"),
    },
    {
      path: "capability-build.json",
      content: `${JSON.stringify(
        {
          schemaVersion: "ambient-capability-builder-v1",
          name: "ambient-custom-tts-artifact",
          version: "0.1.0",
          status: "draft",
          goal: "Generate WAV text-to-speech audio files from text.",
          kind: "artifact generator",
          provider: "Custom TTS",
          refs: {},
        },
        null,
        2,
      )}\n`,
    },
  ];
  for (const file of files) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

function repairedBrokenTtsFiles(): Array<{ path: string; content: string; rationale: string }> {
  return [
    {
      path: "ambient-cli.json",
      rationale: "Repair the descriptor so the package has a name, skill path, executable command, health check, and WAV artifact declaration.",
      content: `${JSON.stringify(
        {
          name: "ambient-broken-tts",
          version: "0.1.1",
          description: "Generate repaired WAV files from text.",
          skills: "./SKILL.md",
          commands: {
            broken_tts: {
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              description: "Generate a tiny repaired WAV file and print its path.",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
            },
          },
          env: [],
          artifacts: {
            outputTypes: ["WAV"],
            policy: "write WAV output to the requested path and return the artifact path in stdout",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Restore Pi guidance so the repaired command is discoverable and used through Ambient CLI.",
      content: [
        "---",
        "name: ambient-broken-tts",
        "description: Generate repaired WAV files from text.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-broken-tts` and command `broken_tts` when the user asks for a small repaired WAV file from text.",
        "Pass two args: the source text and the output `.wav` path.",
        "Return the output path rather than dumping binary data in chat.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      rationale: "Add a deterministic health-checkable command wrapper that writes a tiny WAV artifact.",
      content: [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, resolve } from 'node:path';",
        "",
        "if (process.argv.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "",
        "const [text = 'repair', outputArg = 'repaired-output.wav'] = process.argv.slice(2);",
        "const outputPath = resolve(outputArg);",
        "const sampleRate = 8000;",
        "const samples = Math.max(800, Math.min(2000, text.length * 120));",
        "const dataSize = samples * 2;",
        "const buffer = Buffer.alloc(44 + dataSize);",
        "buffer.write('RIFF', 0);",
        "buffer.writeUInt32LE(36 + dataSize, 4);",
        "buffer.write('WAVEfmt ', 8);",
        "buffer.writeUInt32LE(16, 16);",
        "buffer.writeUInt16LE(1, 20);",
        "buffer.writeUInt16LE(1, 22);",
        "buffer.writeUInt32LE(sampleRate, 24);",
        "buffer.writeUInt32LE(sampleRate * 2, 28);",
        "buffer.writeUInt16LE(2, 32);",
        "buffer.writeUInt16LE(16, 34);",
        "buffer.write('data', 36);",
        "buffer.writeUInt32LE(dataSize, 40);",
        "for (let i = 0; i < samples; i += 1) {",
        "  const sample = Math.round(Math.sin((2 * Math.PI * 330 * i) / sampleRate) * 8000);",
        "  buffer.writeInt16LE(sample, 44 + i * 2);",
        "}",
        "mkdirSync(dirname(outputPath), { recursive: true });",
        "writeFileSync(outputPath, buffer);",
        "process.stdout.write(`WAV artifact: ${outputPath}\\nBytes: ${buffer.length}\\n`);",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the primary command and verify it produces a declared WAV artifact.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "import { readFileSync } from 'node:fs';",
        "",
        "const output = 'smoke-repaired.wav';",
        "const stdout = execFileSync(process.execPath, ['./scripts/run.mjs', 'smoke repair', output], { encoding: 'utf8' });",
        "assert.match(stdout, /WAV artifact:/);",
        "assert.equal(readFileSync(output).subarray(0, 4).toString('ascii'), 'RIFF');",
        "",
      ].join("\n"),
    },
  ];
}

function customTtsProviderRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  return [
    {
      path: "ambient-cli.json",
      rationale: "Convert the descriptor from one-off audio generation to Ambient tts-provider metadata for chat voicing.",
      content: `${JSON.stringify(
        {
          name: "ambient-custom-tts-artifact",
          version: "0.1.1",
          description: "Generate WAV text-to-speech audio files from text.",
          skills: "./SKILL.md",
          commands: {
            custom_tts_artifact: {
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              description: "Synthesize assistant voice audio with a custom local TTS provider.",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                label: "Custom TTS Voice Provider",
                defaultFormat: "wav",
                formats: ["wav"],
                voices: [{ id: "default", label: "Default custom voice" }],
                local: true,
              },
            },
          },
          env: [],
          artifacts: {
            outputTypes: ["WAV"],
            policy: "write audio to the exact requested output path and return concise JSON metadata",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Align Pi guidance with the Ambient voice provider contract instead of a one-off file generator.",
      content: [
        "---",
        "name: ambient-custom-tts-artifact",
        "description: Generate WAV text-to-speech audio files from text.",
        "---",
        "",
        "Use this Ambient voice provider when the user wants Ambient to speak assistant replies through the custom local TTS provider.",
        "The `custom_tts_artifact` command accepts `--text`, `--output`, `--format wav`, and optional `--voice`.",
        "It writes audio to the exact requested path and returns concise JSON metadata with `audioPath`, `mimeType`, `providerId`, and `voiceId`.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      rationale: "Implement the normalized tts-provider synthesis contract with deterministic WAV output.",
      content: [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, resolve } from 'node:path';",
        "",
        "const args = process.argv.slice(2);",
        "function arg(name) {",
        "  const index = args.indexOf(name);",
        "  return index >= 0 ? args[index + 1] : undefined;",
        "}",
        "function wavBytes(text) {",
        "  const sampleRate = 8000;",
        "  const samples = Math.max(800, Math.min(2400, text.length * 80));",
        "  const dataSize = samples * 2;",
        "  const buffer = Buffer.alloc(44 + dataSize);",
        "  buffer.write('RIFF', 0);",
        "  buffer.writeUInt32LE(36 + dataSize, 4);",
        "  buffer.write('WAVEfmt ', 8);",
        "  buffer.writeUInt32LE(16, 16);",
        "  buffer.writeUInt16LE(1, 20);",
        "  buffer.writeUInt16LE(1, 22);",
        "  buffer.writeUInt32LE(sampleRate, 24);",
        "  buffer.writeUInt32LE(sampleRate * 2, 28);",
        "  buffer.writeUInt16LE(2, 32);",
        "  buffer.writeUInt16LE(16, 34);",
        "  buffer.write('data', 36);",
        "  buffer.writeUInt32LE(dataSize, 40);",
        "  for (let i = 0; i < samples; i += 1) {",
        "    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 7000);",
        "    buffer.writeInt16LE(sample, 44 + i * 2);",
        "  }",
        "  return buffer;",
        "}",
        "if (args.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "const text = arg('--text');",
        "const output = arg('--output');",
        "const format = arg('--format') || 'wav';",
        "const voice = arg('--voice') || 'default';",
        "if (!text) { process.stderr.write('Missing --text for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
        "if (!output) { process.stderr.write('Missing --output for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
        "if (format !== 'wav') { process.stderr.write(`Unsupported --format: ${format}\\n`); process.exit(2); }",
        "const audioPath = resolve(output);",
        "const audio = wavBytes(text);",
        "mkdirSync(dirname(audioPath), { recursive: true });",
        "writeFileSync(audioPath, audio);",
        "process.stdout.write(JSON.stringify({ audioPath, mimeType: 'audio/wav', durationMs: Math.round((audio.length - 44) / 16), providerId: 'custom-tts', voiceId: voice }) + '\\n');",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the primary provider command and verify it writes a WAV artifact.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { spawnSync } from 'node:child_process';",
        "import { readFileSync, statSync } from 'node:fs';",
        "",
        "const output = 'smoke-custom-provider.wav';",
        "const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'smoke repair', '--output', output, '--format', 'wav'], { encoding: 'utf8' });",
        "assert.equal(result.status, 0, result.stderr);",
        "assert.match(result.stdout, /audioPath/);",
        "assert.equal(readFileSync(output).subarray(0, 4).toString('ascii'), 'RIFF');",
        "assert.ok(statSync(output).size > 44);",
        "",
      ].join("\n"),
    },
  ];
}

function scraplingStaticRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  const runtimeArgs = ["run", "--with", "scrapling", "--with", "curl_cffi", "--with", "playwright", "--with", "browserforge", "python", "./scripts/scrapling_extract.py"];
  return [
    {
      path: "ambient-cli.json",
      rationale: "Define the real Scrapling-backed command with a health check that imports Scrapling and its macOS runtime dependencies.",
      content: `${JSON.stringify(
        {
          name: "ambient-scrapling-static-extract",
          version: "0.1.1",
          description: "Extract values from static HTML using the real Scrapling package.",
          skills: "./SKILL.md",
          commands: {
            scrapling_extract: {
              command: "uv",
              args: runtimeArgs,
              cwd: "package",
              description: "Extract matching values from static HTML with a CSS selector using Scrapling.",
              healthCheck: ["uv", ...runtimeArgs, "--health"],
            },
          },
          env: [],
          artifacts: { outputTypes: [], policy: "return concise JSON in stdout; do not write artifacts for static extraction" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Guide Pi to use the generated Scrapling command for static HTML extraction instead of browser automation.",
      content: [
        "---",
        "name: ambient-scrapling-static-extract",
        "description: Extract values from static HTML using the real Scrapling package.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-scrapling-static-extract` and command `scrapling_extract` when the user provides static HTML and asks to extract values with CSS selectors.",
        "Pass `--html` with the HTML content and `--selector` with a CSS selector such as `h1::text`.",
        "Return the concise JSON result from stdout. Do not launch a browser for static HTML extraction.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/scrapling_extract.py",
      rationale: "Restore the real Scrapling wrapper that imports Scrapling, validates runtime availability, and extracts selector matches from static HTML.",
      content: [
        "import argparse",
        "import json",
        "from importlib import metadata",
        "",
        "from scrapling import Fetcher, Selector",
        "",
        "def version_for(package_name):",
        "    try:",
        "        return metadata.version(package_name)",
        "    except metadata.PackageNotFoundError:",
        "        return 'unknown'",
        "",
        "def main():",
        "    parser = argparse.ArgumentParser(description='Extract static HTML values with Scrapling.')",
        "    parser.add_argument('--health', action='store_true')",
        "    parser.add_argument('--html', default='<html><body><h1>Ambient Scrapling</h1></body></html>')",
        "    parser.add_argument('--selector', default='h1::text')",
        "    args = parser.parse_args()",
        "    if args.health:",
        "        print(json.dumps({'ok': True, 'scrapling': version_for('scrapling'), 'fetcher': Fetcher.__name__}, sort_keys=True))",
        "        return",
        "    page = Selector(args.html)",
        "    matches = [str(value) for value in page.css(args.selector).extract()]",
        "    print(json.dumps({'package': 'scrapling', 'selector': args.selector, 'matchCount': len(matches), 'matches': matches}, sort_keys=True))",
        "",
        "if __name__ == '__main__':",
        "    main()",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the real Scrapling runtime on static HTML so validation catches missing dependency or wrapper regressions.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const args = ['run', '--with', 'scrapling', '--with', 'curl_cffi', '--with', 'playwright', '--with', 'browserforge', 'python', './scripts/scrapling_extract.py', '--html', '<html><body><h1>Smoke Scrapling</h1></body></html>', '--selector', 'h1::text'];",
        "const stdout = execFileSync('uv', args, { encoding: 'utf8' });",
        "const result = JSON.parse(stdout);",
        "assert.equal(result.package, 'scrapling');",
        "assert.deepEqual(result.matches, ['Smoke Scrapling']);",
        "",
      ].join("\n"),
    },
  ];
}

function graphifyPathRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  const runtimeArgs = ["run", "--with", "graphifyy", "graphify", "path"];
  const fixture = {
    directed: true,
    multigraph: false,
    graph: {},
    nodes: [
      { id: "Ambient", label: "Ambient" },
      { id: "Capability Builder", label: "Capability Builder" },
      { id: "Graphify", label: "Graphify" },
    ],
    links: [
      { source: "Ambient", target: "Capability Builder", label: "builds" },
      { source: "Capability Builder", target: "Graphify", label: "dogfoods" },
    ],
  };
  return [
    {
      path: "ambient-cli.json",
      rationale: "Define a real Graphify CLI command over a package-local graph fixture.",
      content: `${JSON.stringify(
        {
          name: "ambient-graphify-path-inspector",
          version: "0.1.1",
          description: "Find paths in Graphify node-link graphs using the real Graphify CLI.",
          skills: "./SKILL.md",
          commands: {
            graphify_path: {
              command: "uv",
              args: runtimeArgs,
              cwd: "package",
              description: "Find the shortest path between two nodes in a Graphify graph.json file.",
              healthCheck: ["uv", "run", "--with", "graphifyy", "graphify", "--help"],
            },
          },
          env: [],
          artifacts: { outputTypes: [], policy: "return the Graphify CLI path output in stdout; do not write artifacts" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Guide Pi to use the generated Graphify CLI command for graph path questions.",
      content: [
        "---",
        "name: ambient-graphify-path-inspector",
        "description: Find paths in Graphify node-link graphs using the real Graphify CLI.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-graphify-path-inspector` and command `graphify_path` when the user asks for a shortest path between nodes in a Graphify graph JSON file.",
        "Pass the start node, end node, `--graph`, and the graph JSON path.",
        "For the built-in dogfood fixture, use `fixtures/ambient-graph.json`.",
        "Return the concise Graphify stdout path result.",
        "",
      ].join("\n"),
    },
    {
      path: "fixtures/ambient-graph.json",
      rationale: "Provide a deterministic Graphify-compatible node-link fixture for validation and live use.",
      content: `${JSON.stringify(fixture, null, 2)}\n`,
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the real Graphify CLI against the package-local node-link graph fixture.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const stdout = execFileSync('uv', ['run', '--with', 'graphifyy', 'graphify', 'path', 'Ambient', 'Graphify', '--graph', 'fixtures/ambient-graph.json'], { encoding: 'utf8' });",
        "assert.match(stdout, /Shortest path/);",
        "assert.match(stdout, /Ambient ----> Capability Builder ----> Graphify/);",
        "",
      ].join("\n"),
    },
  ];
}

function generatedBraveSearchRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  return [
    {
      path: "ambient-cli.json",
      rationale: "Define the generated Brave Search API command with explicit env secret and network host declarations.",
      content: `${JSON.stringify(
        {
          name: "ambient-brave-api-search",
          version: "0.1.1",
          description: "Search Brave Search with an approved API key and return concise results.",
          skills: "./SKILL.md",
          env: [{ name: "BRAVE_API_KEY", description: "Brave Search API key.", required: true }],
          networkHosts: ["api.search.brave.com"],
          commands: {
            brave_search: {
              command: "node",
              args: ["./scripts/search.mjs"],
              cwd: "package",
              description: "Run a tiny Brave Search web query and print concise results.",
              healthCheck: ["node", "--check", "./scripts/search.mjs"],
            },
          },
          artifacts: { outputTypes: [], policy: "return concise text/JSON in stdout; do not expose API keys" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Guide Pi to use the generated Brave Search API command while keeping secrets out of chat.",
      content: [
        "---",
        "name: ambient-brave-api-search",
        "description: Search Brave Search with an approved API key and return concise results.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-brave-api-search` and command `brave_search` when the user asks for a web search through Brave Search.",
        "The package requires `BRAVE_API_KEY`; use Ambient env/secret binding flows and never ask the user to paste the secret into chat.",
        "The only declared outbound API host is `api.search.brave.com`.",
        "Pass the query text followed by optional `-n` and a result count.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/search.mjs",
      rationale: "Add a small Brave Search API wrapper that validates env binding, uses the declared API host, and prints concise results.",
      content: [
        "const args = process.argv.slice(2);",
        "let count = 2;",
        "const queryParts = [];",
        "for (let i = 0; i < args.length; i += 1) {",
        "  if (args[i] === '-n' || args[i] === '--count') {",
        "    count = Math.max(1, Math.min(5, Number(args[i + 1] || '2')));",
        "    i += 1;",
        "  } else {",
        "    queryParts.push(args[i]);",
        "  }",
        "}",
        "const query = queryParts.join(' ').trim() || 'Ambient Desktop';",
        "const key = process.env.BRAVE_API_KEY;",
        "if (!key) {",
        "  console.error('Missing BRAVE_API_KEY. Bind it through Ambient CLI env/secret flows.');",
        "  process.exit(2);",
        "}",
        "const url = new URL('https://api.search.brave.com/res/v1/web/search');",
        "url.searchParams.set('q', query);",
        "url.searchParams.set('count', String(count));",
        "const response = await fetch(url, {",
        "  headers: {",
        "    Accept: 'application/json',",
        "    'X-Subscription-Token': key,",
        "  },",
        "});",
        "const text = await response.text();",
        "if (!response.ok) {",
        "  console.error(`Brave Search failed: ${response.status} ${text.slice(0, 300)}`);",
        "  process.exit(1);",
        "}",
        "const data = JSON.parse(text);",
        "const results = (data.web?.results || []).slice(0, count);",
        "console.log(JSON.stringify({ provider: 'brave-search', host: 'api.search.brave.com', query, resultCount: results.length }));",
        "results.forEach((result, index) => {",
        "  console.log(`Result ${index + 1}: ${result.title || '(untitled)'}`);",
        "  if (result.url) console.log(`Link: ${result.url}`);",
        "});",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the real Brave Search API with a tiny query so validation proves the env-bound network path works.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const stdout = execFileSync(process.execPath, ['./scripts/search.mjs', 'Ambient Desktop Capability Builder', '-n', '1'], { encoding: 'utf8', env: process.env });",
        "assert.match(stdout, /api.search.brave.com/);",
        "assert.match(stdout, /Result 1:/);",
        "",
      ].join("\n"),
    },
  ];
}

function zayaConfigRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  const assetUrl = "https://huggingface.co/Zyphra/ZAYA1-8B/resolve/main/config.json";
  return [
    {
      path: "ambient-cli.json",
      rationale: "Define the generated model asset inspector with explicit Hugging Face host and cache metadata.",
      content: `${JSON.stringify(
        {
          name: "ambient-zaya-config-reader",
          version: "0.1.1",
          description: "Download and inspect a small Zyphra ZAYA1-8B model config asset.",
          skills: "./SKILL.md",
          networkHosts: ["huggingface.co"],
          modelAssets: [
            {
              name: "ZAYA1-8B config",
              url: assetUrl,
              expectedSizeBytes: 8192,
              license: "Zyphra Hugging Face model repository terms",
              cachePath: "models/zaya-config.json",
            },
          ],
          commands: {
            zaya_config: {
              command: "node",
              args: ["./scripts/zaya_config.mjs"],
              cwd: "package",
              description: "Download/cache the ZAYA1-8B config.json asset and print a selected field.",
              healthCheck: ["node", "--check", "./scripts/zaya_config.mjs"],
            },
          },
          artifacts: { outputTypes: ["JSON"], policy: "cache the declared config JSON under models/zaya-config.json and return concise selected fields" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Guide Pi to use the generated ZAYA model asset inspector without downloading large model weights.",
      content: [
        "---",
        "name: ambient-zaya-config-reader",
        "description: Download and inspect a small Zyphra ZAYA1-8B model config asset.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-zaya-config-reader` and command `zaya_config` when the user asks to inspect the declared small ZAYA1-8B config asset.",
        "This capability only downloads `config.json` from `huggingface.co`; it must not download large model weights.",
        "Pass `--field architectures.0` to return the first architecture value.",
        "The declared cache path is `models/zaya-config.json`.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/zaya_config.mjs",
      rationale: "Add a small downloader/reader for the declared Hugging Face config asset.",
      content: [
        "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
        "import { dirname, resolve } from 'node:path';",
        "",
        `const ASSET_URL = ${JSON.stringify(assetUrl)};`,
        "const CACHE_PATH = resolve('models/zaya-config.json');",
        "",
        "function fieldValue(object, path) {",
        "  return path.split('.').reduce((value, key) => {",
        "    if (value == null) return undefined;",
        "    if (/^[0-9]+$/.test(key)) return value[Number(key)];",
        "    return value[key];",
        "  }, object);",
        "}",
        "",
        "async function ensureConfig() {",
        "  try {",
        "    return await readFile(CACHE_PATH, 'utf8');",
        "  } catch {",
        "    const response = await fetch(ASSET_URL);",
        "    if (!response.ok) throw new Error(`Failed to download ZAYA config: ${response.status}`);",
        "    const text = await response.text();",
        "    await mkdir(dirname(CACHE_PATH), { recursive: true });",
        "    await writeFile(CACHE_PATH, text, 'utf8');",
        "    return text;",
        "  }",
        "}",
        "",
        "const args = process.argv.slice(2);",
        "const fieldIndex = args.findIndex((arg) => arg === '--field');",
        "const field = fieldIndex >= 0 ? args[fieldIndex + 1] : 'architectures.0';",
        "const config = JSON.parse(await ensureConfig());",
        "const value = fieldValue(config, field);",
        "console.log(JSON.stringify({ asset: 'ZAYA1-8B config', host: 'huggingface.co', cachePath: 'models/zaya-config.json', field, value }));",
        "if (value !== undefined) console.log(String(value));",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the declared model asset download/cache path and verify a real field from the config.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "import { readFileSync } from 'node:fs';",
        "",
        "const stdout = execFileSync(process.execPath, ['./scripts/zaya_config.mjs', '--field', 'architectures.0'], { encoding: 'utf8' });",
        "assert.match(stdout, /ZayaForCausalLM/);",
        "const cached = JSON.parse(readFileSync('models/zaya-config.json', 'utf8'));",
        "assert.equal(cached.architectures[0], 'ZayaForCausalLM');",
        "",
      ].join("\n"),
    },
  ];
}

async function findFirstFile(rootPath: string, fileName: string): Promise<string | undefined> {
  async function visit(directory: string): Promise<string | undefined> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name === fileName) return path;
      if (entry.isDirectory()) {
        const found = await visit(path);
        if (found) return found;
      }
    }
    return undefined;
  }

  try {
    return await visit(rootPath);
  } catch {
    return undefined;
  }
}

function pluginStateReader(store: ProjectStore) {
  return {
    isPluginEnabled: (pluginId: string) => store.isPluginEnabled(pluginId),
    isPluginTrusted: (pluginId: string, fingerprint?: string) => store.isPluginTrusted(pluginId, fingerprint),
  };
}

function braveSearchDogfoodDescriptor(): Record<string, unknown> {
  return {
    name: "brave-search",
    version: "1.0.0",
    description: "Reviewed Brave Search CLI package.",
    skills: "./SKILL.md",
    env: [{ name: "BRAVE_API_KEY", description: "Brave Search API key.", required: true }],
    commands: {
      search: {
        command: "node",
        args: ["./search.js"],
        cwd: "package",
        description: "Search the web via Brave Search.",
        healthCheck: ["node", "--check", "./search.js"],
      },
    },
  };
}

async function readDogfoodSecret(envName: string, fileName: string): Promise<string> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const fileFromEnv = process.env[`${envName}_FILE`]?.trim();
  if (fileFromEnv) {
    const fromEnvFile = (await readFile(fileFromEnv, "utf8")).trim();
    if (!fromEnvFile) throw new Error(`${envName}_FILE points to an empty file.`);
    return fromEnvFile;
  }
  const fromFile = (await readFile(join(process.cwd(), fileName), "utf8")).trim();
  if (!fromFile) throw new Error(`${fileName} is empty.`);
  return fromFile;
}

async function readDogfoodFilePath(envName: string, description: string): Promise<string> {
  const filePath = process.env[envName]?.trim();
  if (!filePath) throw new Error(`Set ${envName} to ${description} for this live dogfood test.`);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error(`${envName} does not point to a file.`);
  return filePath;
}

function restoreOptionalEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function isolatePluginDiscoveryEnv(workspacePath: string): () => void {
  const keys = [
    "AMBIENT_CODEX_PLUGIN_CACHE",
    "AMBIENT_CODEX_CURATED_MARKETPLACE_PATH",
    "AMBIENT_CODEX_CURATED_MARKETPLACE_URL",
    "AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH",
    "AMBIENT_CODEX_REMOTE_MARKETPLACE_URL",
    "AMBIENT_CODEX_REMOTE_MARKETPLACES",
    "AMBIENT_PI_PACKAGE_GALLERY_DISABLED",
    "AMBIENT_PI_USER_SETTINGS_PATH",
    "AMBIENT_PI_GLOBAL_PACKAGES_PATH",
  ] as const;
  const previous = new Map<string, string | undefined>(keys.map((key) => [key, process.env[key]]));
  process.env.AMBIENT_CODEX_PLUGIN_CACHE = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL = "0";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH = "0";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL = "0";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES = "0";
  process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED = "1";
  process.env.AMBIENT_PI_USER_SETTINGS_PATH = join(workspacePath, ".ambient-test-missing-pi-settings.json");
  process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH = join(workspacePath, ".ambient-test-missing-pi-packages.json");

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function restoreProcessEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
